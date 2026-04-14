import logging
import re
from datetime import datetime, time
from time import perf_counter
from typing import Optional
from zoneinfo import ZoneInfo

from app.config import build_customer_account_profile_url
from app.models.schemas import AIRuntimeMetadata, ChatInitProfileSummary, ChatInitRequest, ChatInitResponse, ChatRequest, ChatResponse, ChatSelectProfileRequest, ChatSelectProfileResponse, ChatSelectServiceRequest, ChatSelectServiceResponse, ChatSessionContext, CustomerCareSettings, ImageRequest, ProductRecommendation, RecommendationRefineRequest, ShopperProfileInput, StyleProfile, StylingInsight, SupportAction, SupportContact, SupportLineItem, SupportPayload, SupportRequestRecord
from app.services.faq_service import FAQService
from app.services.langchain_service import LangChainService
from app.services.notification_service import NotificationService
from app.services.openai_service import OpenAIService
from app.services.recommendation_service import RecommendationService
from app.services.shopify_service import ShopifyService
from app.services.shopper_profile_service import ShopperProfileService
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionService


logger = logging.getLogger(__name__)


class ConversationService:
    def __init__(self) -> None:
        self.openai_service = OpenAIService()
        self.langchain_service = LangChainService()
        self.vision_service = VisionService()
        self.recommendation_service = RecommendationService()
        self.faq_service = FAQService()
        self.shopify_service = ShopifyService()
        self.notification_service = NotificationService()
        self.supabase_service = SupabaseService()
        self.profile_service = ShopperProfileService()

    def _merchant_voice_config(self):
        return self.openai_service.merchant_context().get("chatbot_voice_config")

    def _apply_merchant_voice(self, reply: str) -> str:
        return self.openai_service.merchant_voice_service.format_reply_text(
            reply,
            self._merchant_voice_config(),
        )

    def _is_guest_customer_identifier(self, customer_identifier: Optional[str]) -> bool:
        normalized = str(customer_identifier or "").strip().lower()
        return normalized in {"", "guest-user", "shopify-storefront-guest"}

    def _conversation_customer_identifier(
        self,
        customer_identifier: Optional[str],
        customer_email: Optional[str],
    ) -> Optional[str]:
        normalized_customer = str(customer_identifier or "").strip()
        if normalized_customer and not self._is_guest_customer_identifier(normalized_customer):
            return normalized_customer

        normalized_email = str(customer_email or "").strip().lower()
        if normalized_email:
            return f"email:{normalized_email}"

        return normalized_customer or None

    def _my_style_url(self) -> str:
        return build_customer_account_profile_url() or "/account/profile"

    def _normalize_relationship_label(self, relationship: Optional[str], is_primary: bool) -> Optional[str]:
        raw = str(relationship or "").strip()
        if is_primary or raw == "self":
            return "Self"
        if not raw:
            return None
        return raw.replace("_", " ").title()

    def _build_style_profile_summary(self, profile: Optional[StyleProfile]) -> Optional[str]:
        if profile is None:
            return None

        if profile.styleAnalysis and str(profile.styleAnalysis.summary or "").strip():
            return str(profile.styleAnalysis.summary).strip()

        summary_parts: list[str] = []
        if str(profile.shoppingCategoryPreference or "").strip():
            summary_parts.append(str(profile.shoppingCategoryPreference).replace("_", " ").strip())
        if profile.features and str(profile.features.bodyType or "").strip():
            summary_parts.append(str(profile.features.bodyType).replace("_", " ").strip())
        if profile.favoriteColorPalette:
            summary_parts.append(", ".join(profile.favoriteColorPalette[:2]))
        if profile.styleNotes and str(profile.styleNotes).strip():
            summary_parts.append(str(profile.styleNotes).strip())
        if profile.vibe and str(profile.vibe.styleDescription or "").strip():
            summary_parts.append(str(profile.vibe.styleDescription).strip())
        if profile.budget:
            summary_parts.append(str(profile.budget).replace("_", " ").strip())

        if summary_parts:
            return " • ".join(summary_parts[:2])

        return None

    def _build_init_profile_summary(
        self,
        profile: StyleProfile,
        *,
        active_profile_id: Optional[str],
    ) -> ChatInitProfileSummary:
        return ChatInitProfileSummary(
            id=str(profile.id),
            name=str(profile.name or "").strip() or "Saved profile",
            avatarUrl=None,
            relationshipLabel=self._normalize_relationship_label(profile.relationship, bool(profile.isPrimary)),
            summary=self._build_style_profile_summary(profile),
            isDefault=bool(active_profile_id and str(profile.id) == str(active_profile_id)) or bool(profile.isPrimary),
        )

    def _effective_style_profile_id(
        self,
        requested_style_profile_id: Optional[str],
        session_context: Optional[ChatSessionContext],
    ) -> Optional[str]:
        normalized_requested = str(requested_style_profile_id or "").strip()
        if normalized_requested:
            return normalized_requested
        if session_context and session_context.activeProfileId:
            return str(session_context.activeProfileId).strip() or None
        return None

    def initialize_chat(self, payload: ChatInitRequest) -> ChatInitResponse:
        conversation_customer_identifier = self._conversation_customer_identifier(
            payload.shopifyCustomerId or payload.sessionId,
            payload.customerEmail,
        )
        session_id = self.supabase_service.ensure_chat_session(conversation_customer_identifier) or payload.sessionId
        profiles_response = self.supabase_service.fetch_customer_style_profiles(
            customer_identifier=payload.shopifyCustomerId,
            customer_email=payload.customerEmail,
            account_display_name=payload.accountDisplayName,
        )
        session_context = self.supabase_service.fetch_chat_session_context(session_id)
        active_profile_id = session_context.activeProfileId if session_context else None
        selected_service = session_context.selectedService if session_context else None
        profiles = profiles_response.profiles or []

        if active_profile_id and not any(str(profile.id) == str(active_profile_id) for profile in profiles):
            active_profile_id = None

        mode = "RETURNING_CUSTOMER" if profiles else "NEW_CUSTOMER"
        self.supabase_service.update_chat_session_context(
            session_id,
            customer_identifier=conversation_customer_identifier,
            last_entry_mode=mode,
        )

        return ChatInitResponse(
            sessionId=session_id,
            mode=mode,
            profiles=[
                self._build_init_profile_summary(profile, active_profile_id=active_profile_id)
                for profile in profiles
            ],
            activeProfileId=active_profile_id,
            selectedService=selected_service,
            myStyleUrl=self._my_style_url(),
        )

    def select_active_profile(self, payload: ChatSelectProfileRequest) -> ChatSelectProfileResponse:
        customer_identifier = self.supabase_service.fetch_chat_session_customer_identifier(payload.sessionId)
        profiles_response = self.supabase_service.fetch_customer_style_profiles(
            customer_identifier=customer_identifier,
            customer_email=payload.customerEmail,
            account_display_name=payload.accountDisplayName,
        )
        profile_ids = {str(profile.id).strip() for profile in profiles_response.profiles or []}
        normalized_profile_id = str(payload.profileId).strip()
        if normalized_profile_id not in profile_ids:
            raise ValueError("That style profile is not available for this customer session.")

        self.supabase_service.update_chat_session_context(
            payload.sessionId,
            customer_identifier=customer_identifier,
            active_profile_id=normalized_profile_id,
            last_entry_mode="RETURNING_CUSTOMER",
        )
        return ChatSelectProfileResponse(ok=True, activeProfileId=normalized_profile_id)

    def select_service(self, payload: ChatSelectServiceRequest) -> ChatSelectServiceResponse:
        customer_identifier = self.supabase_service.fetch_chat_session_customer_identifier(payload.sessionId)
        self.supabase_service.update_chat_session_context(
            payload.sessionId,
            customer_identifier=customer_identifier,
            active_profile_id=str(payload.profileId or "").strip() or None,
            selected_service=payload.service,
        )
        return ChatSelectServiceResponse(
            ok=True,
            service=payload.service,
            profileId=str(payload.profileId or "").strip() or None,
        )

    def _should_use_history_for_profile_inference(
        self,
        *,
        customer_identifier: Optional[str],
        customer_email: Optional[str],
        saved_style_profile: Optional[StyleProfile],
        explicit_segment: Optional[str],
        profile_inputs: Optional[ShopperProfileInput],
    ) -> bool:
        if saved_style_profile is not None:
            return True
        if explicit_segment:
            return True
        if profile_inputs and any(
            [
                profile_inputs.segment,
                profile_inputs.occasion,
                profile_inputs.weather,
                profile_inputs.budget,
                profile_inputs.priority,
                profile_inputs.feel,
                profile_inputs.color_preference,
                profile_inputs.fit_preference,
            ]
        ):
            return True
        if customer_email and str(customer_email).strip():
            return True
        return not self._is_guest_customer_identifier(customer_identifier)

    def handle_text_chat(self, payload: ChatRequest) -> ChatResponse:
        conversation_customer_identifier = self._conversation_customer_identifier(
            payload.customer_id,
            payload.customer_email,
        )
        session_id = self.supabase_service.ensure_chat_session(conversation_customer_identifier)
        session_context = self.supabase_service.fetch_chat_session_context(session_id)
        effective_style_profile_id = self._effective_style_profile_id(
            payload.style_profile_id,
            session_context,
        )
        self.supabase_service.update_chat_session_context(
            session_id,
            customer_identifier=conversation_customer_identifier,
        )
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="customer",
            message=payload.message,
            mode=payload.mode,
        )

        recent_messages = self.supabase_service.fetch_session_messages(session_id)
        recent_events = self.supabase_service.fetch_session_events(session_id)
        route_decision = self.langchain_service.resolve_route(
            mode_hint=payload.mode,
            shopper_message=payload.message,
            recent_messages=recent_messages,
        )
        resolved_mode = route_decision.resolved_mode
        support_intent_decision = self.langchain_service.classify_support_intent(
            shopper_message=payload.message,
            recent_messages=recent_messages,
            mode_hint=payload.mode,
        )
        support_state_blocking = self._support_state_requires_input(recent_messages, recent_events)
        if (
            payload.mode == "support"
            and support_intent_decision.intent == "styling_request"
            and not support_state_blocking
        ):
            resolved_mode = "outfit_curation"
        elif self._is_support_follow_up(payload.message, recent_messages):
            resolved_mode = "support"
        elif route_decision.route == "support":
            resolved_mode = "support"

        saved_style_profile = self._load_saved_style_profile(
            customer_id=payload.customer_id,
            customer_email=payload.customer_email,
            account_display_name=payload.account_display_name,
            style_profile_id=effective_style_profile_id,
        )
        saved_profile_segment = self.profile_service.segment_from_saved_style_profile(saved_style_profile)
        explicit_segment = (
            self.profile_service.normalize_segment(payload.profile_inputs.segment if payload.profile_inputs else None)
            or saved_profile_segment
        )
        inferred_text_segment = self.profile_service.infer_segment_from_text(payload.message)
        use_history_for_profile = self._should_use_history_for_profile_inference(
            customer_identifier=payload.customer_id,
            customer_email=payload.customer_email,
            saved_style_profile=saved_style_profile,
            explicit_segment=explicit_segment,
            profile_inputs=payload.profile_inputs,
        )

        shopper_profile = self.profile_service.build_profile(
            message=payload.message,
            mode=resolved_mode,
            detected_tags=[],
            recent_messages=recent_messages if use_history_for_profile else [],
            recent_events=recent_events if use_history_for_profile else [],
            profile_inputs=payload.profile_inputs,
            saved_style_profile=saved_style_profile,
        )
        shopper_profile = self.langchain_service.enrich_profile(
            heuristic_profile=shopper_profile,
            shopper_message=payload.message,
            detected_tags=[],
            recent_messages=recent_messages,
        )
        if payload.decision_mode is not None and resolved_mode == "outfit_curation":
            shopper_profile = shopper_profile.copy(
                update={"decision_style": "decisive" if payload.decision_mode else "comparative"}
            )

        if (
            resolved_mode != "support"
            and explicit_segment
            and inferred_text_segment
            and explicit_segment != inferred_text_segment
        ):
            return self._segment_clarification_response(
                prompt=(
                    f"I’m reading your request as {inferred_text_segment}, but the current styling mode is "
                    f"{explicit_segment}. Which should I keep this in?"
                ),
                resolved_mode=resolved_mode,
                route_reason=route_decision.reason,
                shopper_profile=shopper_profile,
                required_follow_up_fields=["segment"],
            )

        required_segment = explicit_segment or shopper_profile.segment_preference or inferred_text_segment
        if required_segment:
            shopper_profile = shopper_profile.copy(update={"segment_preference": required_segment})

        if resolved_mode == "support":
            reply, support_event_type, support_follow_up_prompts, langchain_support_used, support_payload = self._handle_support_message(
                message=payload.message,
                session_id=session_id,
                customer_identifier=payload.customer_id,
                recent_messages=recent_messages,
                recent_events=recent_events,
                shopper_profile=shopper_profile,
                support_intent=support_intent_decision.intent,
            )
            follow_up_prompts = support_follow_up_prompts or self.profile_service.build_follow_up_prompts(
                shopper_profile, "support"
            )
            self.supabase_service.log_recommendation_event(
                event_type=support_event_type,
                input_summary=payload.message,
                recommended_product_ids=[],
                session_id=session_id,
            )
            self.supabase_service.log_chat_message(
                session_id=session_id,
                sender="assistant",
                message=reply,
                mode=resolved_mode,
            )
            return ChatResponse(
                reply=reply,
                recommended_products=[],
                styling_insights=[],
                shopper_profile=shopper_profile,
                follow_up_prompts=follow_up_prompts,
                support_payload=support_payload,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode=resolved_mode,
                    route_reason=route_decision.reason,
                    active_segment=required_segment,
                    support_intent=support_intent_decision.intent,
                    langchain_route_used=self.langchain_service.is_enabled(),
                    langchain_support_used=langchain_support_used,
                ),
            )

        if required_segment is None:
            return self._segment_clarification_response(
                prompt="Before I pull products, should I keep this in menswear or womenswear?",
                resolved_mode=resolved_mode,
                route_reason=route_decision.reason,
                shopper_profile=shopper_profile,
                required_follow_up_fields=["segment"],
            )

        missing_styling_prompt = self._missing_styling_text_prompt(
            resolved_mode=resolved_mode,
            shopper_profile=shopper_profile,
        )
        if missing_styling_prompt is not None:
            prompt, prompt_options, required_follow_up_fields = missing_styling_prompt
            return self._styling_context_clarification_response(
                prompt=prompt,
                prompt_options=prompt_options,
                required_follow_up_fields=required_follow_up_fields,
                resolved_mode=resolved_mode,
                route_reason="Styling flow needs one missing decision",
                shopper_profile=shopper_profile,
                active_segment=required_segment,
            )

        if (
            resolved_mode == "outfit_curation"
            and payload.decision_mode is None
            and payload.refinement_feedback_type is None
        ):
            return self._decision_mode_prompt_response(
                resolved_mode=resolved_mode,
                route_reason="Styling flow is ready for recommendation ranking",
                shopper_profile=shopper_profile,
                active_segment=required_segment,
            )

        candidate_terms = self.profile_service.build_query_terms(
            message=payload.message,
            detected_tags=[],
            profile=shopper_profile,
        )
        refinement_terms = self._refinement_terms(payload.refinement_feedback_type)
        for term in refinement_terms:
            if term not in candidate_terms:
                candidate_terms.append(term)
        candidate_products = self.recommendation_service.recommend_products(
            candidate_terms,
            limit=8,
            query_text=payload.message,
            shopper_profile=shopper_profile,
            exclude_product_ids=payload.exclude_product_ids,
            required_segment=required_segment,
        )
        if not candidate_products:
            candidate_products = self.recommendation_service.fallback_segment_products(
                required_segment=required_segment,
                limit=4,
                exclude_product_ids=payload.exclude_product_ids,
            )
        fallback_prompts = self.profile_service.build_follow_up_prompts(shopper_profile, resolved_mode)

        langchain_result = self.langchain_service.style_recommendations(
            mode=resolved_mode,
            shopper_message=payload.message,
            detected_tags=[],
            candidate_products=candidate_products,
            shopper_profile=shopper_profile,
            recent_messages=recent_messages,
            vision_summary="",
            fallback_follow_up_prompts=fallback_prompts,
            merchant_context=self.openai_service.merchant_context(),
        )
        if langchain_result is not None:
            reply, recommendations, styling_insights, follow_up_prompts = langchain_result
            langchain_stylist_used = True
        else:
            reply, recommendations, styling_insights, follow_up_prompts = self.openai_service.style_recommendations(
                mode=resolved_mode,
                shopper_message=payload.message,
                detected_tags=[],
                candidate_products=candidate_products,
                shopper_profile=shopper_profile,
                recent_messages=recent_messages,
                fallback_follow_up_prompts=fallback_prompts,
                vision_summary="",
            )
            langchain_stylist_used = False

        recommendations, leakage_repaired = self.recommendation_service.enforce_recommendation_segment(
            recommendations=recommendations,
            required_segment=required_segment,
            fallback_pool=candidate_products,
            limit=4,
        )
        if leakage_repaired:
            reply = self.openai_service.build_text_reply(
                mode=resolved_mode,
                message=payload.message,
                detected_tags=[],
                recommendations=recommendations,
                shopper_profile=shopper_profile,
                vision_summary="",
            )
            styling_insights = self.openai_service.build_styling_insights(
                mode=resolved_mode,
                message=payload.message,
                detected_tags=[],
                recommendations=recommendations,
                shopper_profile=shopper_profile,
            )
            follow_up_prompts = fallback_prompts

        validation_result = self.recommendation_service.validate_generated_recommendations(
            mode=resolved_mode,
            recommendations=recommendations,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            query_text=payload.message,
        )
        if validation_result.repaired:
            recommendations = validation_result.recommendations
            reply, recommendations, styling_insights, follow_up_prompts = self._refresh_styling_output(
                mode=resolved_mode,
                shopper_message=payload.message,
                shopper_profile=shopper_profile,
                recommendations=recommendations,
                fallback_prompts=fallback_prompts,
                detected_tags=[],
                vision_summary="",
            )

        if validation_result.status == "fail":
            logger.warning(
                "Post-generation validation failed for text styling. Re-running with stricter filters. invalid_ids=%s",
                validation_result.invalid_product_ids,
            )
            rerun_products = self.recommendation_service.recommend_products(
                candidate_terms,
                limit=8,
                query_text=payload.message,
                shopper_profile=shopper_profile,
                exclude_product_ids=(payload.exclude_product_ids or []) + validation_result.invalid_product_ids,
                required_segment=required_segment,
            )
            if not rerun_products:
                rerun_products = self.recommendation_service.fallback_segment_products(
                    required_segment=required_segment,
                    limit=4,
                    exclude_product_ids=(payload.exclude_product_ids or []) + validation_result.invalid_product_ids,
                )
            rerun_recommendations = rerun_products[:4]
            rerun_validation = self.recommendation_service.validate_generated_recommendations(
                mode=resolved_mode,
                recommendations=rerun_recommendations,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                query_text=payload.message,
            )
            recommendations = rerun_validation.recommendations
            if rerun_validation.status == "fail":
                recommendations = []
            else:
                reply, recommendations, styling_insights, follow_up_prompts = self._refresh_styling_output(
                    mode=resolved_mode,
                    shopper_message=payload.message,
                    shopper_profile=shopper_profile,
                    recommendations=recommendations,
                    fallback_prompts=fallback_prompts,
                    detected_tags=[],
                    vision_summary="",
                )

        if not recommendations:
            return self._same_mode_fallback_response(
                resolved_mode=resolved_mode,
                route_reason=route_decision.reason,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                shopper_message=payload.message,
                fallback_prompts=fallback_prompts,
            )

        self.supabase_service.log_recommendation_event(
            event_type=resolved_mode,
            input_summary=payload.message,
            recommended_product_ids=[item.id for item in recommendations],
            session_id=session_id,
        )
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="assistant",
            message=reply,
            mode=resolved_mode,
        )
        return ChatResponse(
            reply=reply,
            recommended_products=recommendations,
            styling_insights=styling_insights,
            shopper_profile=shopper_profile,
            follow_up_prompts=follow_up_prompts,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode=resolved_mode,
                    route_reason=route_decision.reason,
                    active_segment=required_segment,
                    langchain_route_used=self.langchain_service.is_enabled(),
                    langchain_stylist_used=langchain_stylist_used,
                ),
        )

    def handle_image_chat(self, payload: ImageRequest, mode: str) -> ChatResponse:
        started_at = perf_counter()
        conversation_customer_identifier = self._conversation_customer_identifier(
            payload.customer_id,
            payload.customer_email,
        )
        session_id = self.supabase_service.ensure_chat_session(conversation_customer_identifier)
        session_context = self.supabase_service.fetch_chat_session_context(session_id)
        effective_style_profile_id = self._effective_style_profile_id(
            payload.style_profile_id,
            session_context,
        )
        self.supabase_service.update_chat_session_context(
            session_id,
            customer_identifier=conversation_customer_identifier,
        )
        image_reference = payload.image_url or payload.image_name
        shopper_message = (
            payload.message.strip()
            if payload.message and payload.message.strip()
            else f"{'Get inspired' if mode == 'get_inspired' else 'Complete the look'} request: {payload.image_name}"
        )
        customer_log = f"{shopper_message} | Image source: {image_reference}"
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="customer",
            message=customer_log,
            mode=mode,
        )

        vision_analysis = self.vision_service.analyze_image(
            image_reference=image_reference,
            image_content_base64=payload.image_content_base64,
            image_mime_type=payload.image_mime_type,
        )
        vision_completed_at = perf_counter()
        detected_tags = vision_analysis.detected_tags
        saved_style_profile = self._load_saved_style_profile(
            customer_id=payload.customer_id,
            customer_email=payload.customer_email,
            account_display_name=payload.account_display_name,
            style_profile_id=effective_style_profile_id,
        )
        saved_profile_segment = self.profile_service.segment_from_saved_style_profile(saved_style_profile)
        explicit_segment = (
            self.profile_service.normalize_segment(payload.profile_inputs.segment if payload.profile_inputs else None)
            or saved_profile_segment
        )
        inferred_visual_segment = self.profile_service.infer_segment_from_visual_signals(
            detected_tags=detected_tags,
            vision_summary=vision_analysis.summary,
            image_reference=image_reference,
        )
        recent_messages = self.supabase_service.fetch_session_messages(session_id)
        recent_events = self.supabase_service.fetch_session_events(session_id)
        use_history_for_profile = self._should_use_history_for_profile_inference(
            customer_identifier=payload.customer_id,
            customer_email=payload.customer_email,
            saved_style_profile=saved_style_profile,
            explicit_segment=explicit_segment,
            profile_inputs=payload.profile_inputs,
        )
        shopper_profile = self.profile_service.build_profile(
            message=shopper_message,
            mode=mode,
            detected_tags=detected_tags,
            recent_messages=recent_messages if use_history_for_profile else [],
            recent_events=recent_events if use_history_for_profile else [],
            image_reference=image_reference,
            profile_inputs=payload.profile_inputs,
            saved_style_profile=saved_style_profile,
        )
        image_analysis = self.openai_service.interpret_image_analysis(
            mode=mode,
            shopper_message=shopper_message,
            vision_analysis=vision_analysis,
            shopper_profile=shopper_profile,
            explicit_segment=explicit_segment,
        )
        interpretation_completed_at = perf_counter()
        merchant_context = self.openai_service.merchant_context()

        inferred_text_segment = self.profile_service.infer_segment_from_text(shopper_message, detected_tags)
        inferred_image_segment = (
            explicit_segment
            or shopper_profile.segment_preference
            or (image_analysis.styling_mode_cue if image_analysis.styling_mode_cue in {"menswear", "womenswear"} else None)
            or inferred_visual_segment
            or inferred_text_segment
        )

        if mode == "complete_the_look":
            missing_complete_look_fields = self._missing_complete_look_fields(
                payload.profile_inputs,
                shopper_profile=shopper_profile,
                inferred_segment=inferred_image_segment,
            )
            if missing_complete_look_fields:
                return self._complete_look_requirements_response(
                    resolved_mode=mode,
                    route_reason="Complete-look analysis needs styling context",
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    vision_analysis=vision_analysis,
                    required_fields=missing_complete_look_fields,
                    active_segment=explicit_segment,
                )

        if (
            mode != "complete_the_look"
            and
            explicit_segment
            and image_analysis.styling_mode_cue in {"menswear", "womenswear"}
            and explicit_segment != image_analysis.styling_mode_cue
        ):
            return self._segment_clarification_response(
                prompt=(
                    f"I’m reading this image as {image_analysis.styling_mode_cue}, but the current styling mode says "
                    f"{explicit_segment}. To keep this accurate, should I treat it as menswear or womenswear?"
                ),
                resolved_mode=mode,
                route_reason="Image-led styling flow",
                shopper_profile=shopper_profile,
                required_follow_up_fields=["segment"],
                image_analysis=image_analysis,
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
            )

        required_segment = (
            explicit_segment
            or shopper_profile.segment_preference
            or (image_analysis.styling_mode_cue if image_analysis.styling_mode_cue in {"menswear", "womenswear"} else None)
            or inferred_visual_segment
            or inferred_text_segment
        )
        if required_segment:
            shopper_profile = shopper_profile.copy(update={"segment_preference": required_segment})
        if required_segment is None:
            return self._segment_clarification_response(
                prompt=(
                    image_analysis.follow_up_question
                    or "I can see the visual cues, but before I style from this image I need to confirm whether this should stay in menswear or womenswear."
                ),
                resolved_mode=mode,
                route_reason="Image-led styling flow",
                shopper_profile=shopper_profile,
                required_follow_up_fields=["segment"],
                image_analysis=image_analysis,
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=image_analysis.summary or vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
            )

        analysis_context = " ".join(
            image_analysis.garment_types
            + image_analysis.style_direction
            + image_analysis.palette
            + image_analysis.color_harmony_cues
            + image_analysis.silhouette_cues
        ).strip()
        query_context = " ".join(
            [item for item in [shopper_message, image_analysis.summary, analysis_context] if item]
        ).strip()
        candidate_terms = self.profile_service.build_query_terms(
            message=query_context,
            detected_tags=detected_tags,
            profile=shopper_profile,
        )
        for term in (
            vision_analysis.apparel_cues
            + vision_analysis.style_cues
            + vision_analysis.colors
            + getattr(vision_analysis, "ocr_terms", [])
            + image_analysis.pattern_texture_cues
            + image_analysis.color_harmony_cues
        ):
            normalized_term = str(term or "").strip()
            if normalized_term and normalized_term not in candidate_terms:
                candidate_terms.append(normalized_term)
        fallback_prompts = self.profile_service.build_follow_up_prompts(shopper_profile, mode)
        if image_analysis.follow_up_prompts:
            fallback_prompts = image_analysis.follow_up_prompts

        inspired_look_context = None

        if mode == "complete_the_look":
            complete_look_context, langchain_complete_used = self.langchain_service.build_complete_look_context(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recent_messages=recent_messages,
                merchant_context=merchant_context,
            )
            candidate_products = self.recommendation_service.recommend_complete_look_products(
                terms=candidate_terms,
                query_text=query_context or shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                required_segment=required_segment,
                orchestration_context=complete_look_context,
                limit=6,
            )
            if not candidate_products:
                candidate_products = self.recommendation_service.fallback_segment_products(
                    required_segment=required_segment,
                    limit=4,
                )
            reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_complete_look_reply(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recommendations=candidate_products,
                orchestration_context=complete_look_context,
            )
            langchain_stylist_used = langchain_complete_used
        elif mode == "get_inspired":
            allow_langchain_inspired = (perf_counter() - started_at) < 6.0
            inspired_look_context, langchain_inspired_used = self.langchain_service.build_inspired_look_context(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recent_messages=recent_messages,
                merchant_context=merchant_context,
                allow_model=allow_langchain_inspired,
            )
            candidate_products = self.recommendation_service.recommend_inspired_look_products(
                terms=candidate_terms,
                query_text=query_context or shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                required_segment=required_segment,
                orchestration_context=inspired_look_context,
                limit=5,
            )
            allow_openai_narration = (perf_counter() - started_at) < 12.0
            reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_inspired_look_reply(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recommendations=candidate_products,
                orchestration_context=inspired_look_context,
                allow_model=allow_openai_narration,
            )
            langchain_stylist_used = langchain_inspired_used
        else:
            candidate_products = self.recommendation_service.recommend_products(
                candidate_terms,
                complementary=mode == "complete_the_look",
                limit=8,
                query_text=query_context or shopper_message,
                shopper_profile=shopper_profile,
                required_segment=required_segment,
            )
            if not candidate_products:
                candidate_products = self.recommendation_service.fallback_segment_products(
                    required_segment=required_segment,
                    limit=4,
                )

            langchain_result = self.langchain_service.style_recommendations(
                mode=mode,
                shopper_message=shopper_message,
                detected_tags=detected_tags,
                candidate_products=candidate_products,
                shopper_profile=shopper_profile,
                recent_messages=recent_messages,
                vision_summary=image_analysis.summary or vision_analysis.summary,
                fallback_follow_up_prompts=fallback_prompts,
                merchant_context=merchant_context,
            )
            if langchain_result is not None:
                reply, recommendations, styling_insights, follow_up_prompts = langchain_result
                langchain_stylist_used = True
            else:
                reply, recommendations, styling_insights, follow_up_prompts = self.openai_service.style_recommendations(
                    mode=mode,
                    shopper_message=shopper_message,
                    detected_tags=detected_tags,
                    candidate_products=candidate_products,
                    shopper_profile=shopper_profile,
                    recent_messages=recent_messages,
                    fallback_follow_up_prompts=fallback_prompts,
                    vision_summary=image_analysis.summary or vision_analysis.summary,
                )
                langchain_stylist_used = False

        recommendations, leakage_repaired = self.recommendation_service.enforce_recommendation_segment(
            recommendations=recommendations,
            required_segment=required_segment,
            fallback_pool=candidate_products,
            limit=5 if mode == "get_inspired" else 4,
        )
        if leakage_repaired:
            if mode == "complete_the_look":
                reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_complete_look_reply(
                    shopper_message=shopper_message,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    recommendations=recommendations,
                    orchestration_context=complete_look_context,
                )
            elif mode == "get_inspired":
                reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_inspired_look_reply(
                    shopper_message=shopper_message,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    recommendations=recommendations,
                    orchestration_context=inspired_look_context or {},
                    allow_model=False,
                )
            else:
                reply = self.openai_service.build_text_reply(
                    mode=mode,
                    message=shopper_message,
                    detected_tags=detected_tags,
                    recommendations=recommendations,
                    shopper_profile=shopper_profile,
                    vision_summary=image_analysis.summary or vision_analysis.summary,
                )
                styling_insights = self.openai_service.build_styling_insights(
                    mode=mode,
                    message=shopper_message,
                    detected_tags=detected_tags,
                    recommendations=recommendations,
                    shopper_profile=shopper_profile,
                )
                follow_up_prompts = fallback_prompts

        gap_analysis = None
        if mode == "complete_the_look":
            gap_analysis = self.recommendation_service.build_complete_look_gap_analysis(
                image_analysis=image_analysis,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                orchestration_context=complete_look_context,
            )

        validation_result = self.recommendation_service.validate_generated_recommendations(
            mode=mode,
            recommendations=recommendations,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            query_text=query_context or shopper_message,
            image_analysis=image_analysis,
            gap_analysis=gap_analysis,
            orchestration_context=complete_look_context if mode == "complete_the_look" else inspired_look_context,
        )
        if validation_result.repaired:
            recommendations = validation_result.recommendations
            reply, recommendations, styling_insights, follow_up_prompts = self._refresh_styling_output(
                mode=mode,
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                recommendations=recommendations,
                fallback_prompts=fallback_prompts,
                detected_tags=detected_tags,
                image_analysis=image_analysis,
                orchestration_context=complete_look_context if mode == "complete_the_look" else inspired_look_context,
                vision_summary=image_analysis.summary or vision_analysis.summary,
            )

        if validation_result.status == "fail":
            logger.warning(
                "Post-generation validation failed for image styling mode=%s. Re-running with stricter filters. invalid_ids=%s",
                mode,
                validation_result.invalid_product_ids,
            )
            excluded_ids = validation_result.invalid_product_ids
            if mode == "complete_the_look":
                rerun_candidates = self.recommendation_service.recommend_complete_look_products(
                    terms=candidate_terms,
                    query_text=query_context or shopper_message,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    required_segment=required_segment,
                    orchestration_context=complete_look_context,
                    limit=6,
                    exclude_product_ids=excluded_ids,
                )
                rerun_gap_analysis = self.recommendation_service.build_complete_look_gap_analysis(
                    image_analysis=image_analysis,
                    required_segment=required_segment,
                    shopper_profile=shopper_profile,
                    orchestration_context=complete_look_context,
                )
                rerun_validation = self.recommendation_service.validate_generated_recommendations(
                    mode=mode,
                    recommendations=rerun_candidates,
                    required_segment=required_segment,
                    shopper_profile=shopper_profile,
                    query_text=query_context or shopper_message,
                    image_analysis=image_analysis,
                    gap_analysis=rerun_gap_analysis,
                    orchestration_context=complete_look_context,
                )
                recommendations = rerun_validation.recommendations
                gap_analysis = rerun_gap_analysis
            elif mode == "get_inspired":
                rerun_candidates = self.recommendation_service.recommend_inspired_look_products(
                    terms=candidate_terms,
                    query_text=query_context or shopper_message,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    required_segment=required_segment,
                    orchestration_context=inspired_look_context,
                    limit=5,
                    exclude_product_ids=excluded_ids,
                )
                rerun_validation = self.recommendation_service.validate_generated_recommendations(
                    mode=mode,
                    recommendations=rerun_candidates,
                    required_segment=required_segment,
                    shopper_profile=shopper_profile,
                    query_text=query_context or shopper_message,
                    image_analysis=image_analysis,
                    orchestration_context=inspired_look_context,
                )
                recommendations = rerun_validation.recommendations
            else:
                rerun_candidates = self.recommendation_service.recommend_products(
                    candidate_terms,
                    complementary=mode == "complete_the_look",
                    limit=8,
                    query_text=query_context or shopper_message,
                    shopper_profile=shopper_profile,
                    required_segment=required_segment,
                    exclude_product_ids=excluded_ids,
                )
                rerun_validation = self.recommendation_service.validate_generated_recommendations(
                    mode=mode,
                    recommendations=rerun_candidates[:4],
                    required_segment=required_segment,
                    shopper_profile=shopper_profile,
                    query_text=query_context or shopper_message,
                    image_analysis=image_analysis,
                )
                recommendations = rerun_validation.recommendations

            if rerun_validation.status == "fail":
                recommendations = []
            else:
                reply, recommendations, styling_insights, follow_up_prompts = self._refresh_styling_output(
                    mode=mode,
                    shopper_message=shopper_message,
                    shopper_profile=shopper_profile,
                    recommendations=recommendations,
                    fallback_prompts=fallback_prompts,
                    detected_tags=detected_tags,
                    image_analysis=image_analysis,
                    orchestration_context=complete_look_context if mode == "complete_the_look" else inspired_look_context,
                    vision_summary=image_analysis.summary or vision_analysis.summary,
                )

        if not recommendations:
            return self._same_mode_fallback_response(
                resolved_mode=mode,
                route_reason="Image-led styling flow",
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                shopper_message=shopper_message,
                fallback_prompts=fallback_prompts,
                image_analysis=image_analysis,
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=image_analysis.summary or vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
            )

        recommended_product_ids = [item.id for item in recommendations]
        self.supabase_service.log_recommendation_event(
            event_type=mode,
            input_summary=image_reference,
            recommended_product_ids=recommended_product_ids,
            session_id=session_id,
        )
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="assistant",
            message=reply,
            mode=mode,
        )
        response = ChatResponse(
            reply=reply,
            detected_tags=detected_tags,
            recommended_products=recommendations,
            styling_insights=styling_insights,
            image_analysis=image_analysis,
            gap_analysis=gap_analysis,
            orchestration_context=complete_look_context if mode == "complete_the_look" else inspired_look_context,
            shopper_profile=shopper_profile,
            follow_up_prompts=follow_up_prompts,
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=mode,
                route_reason="Image-led styling flow",
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=image_analysis.summary or vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
                active_segment=required_segment,
                langchain_route_used=self.langchain_service.is_enabled(),
                langchain_stylist_used=langchain_stylist_used,
            ),
        )
        logger.info(
            "Image flow timing mode=%s vision=%.2fs interpret=%.2fs total=%.2fs",
            mode,
            vision_completed_at - started_at,
            interpretation_completed_at - vision_completed_at,
            perf_counter() - started_at,
        )
        return response

    def handle_support_image(self, payload: ImageRequest) -> ChatResponse:
        session_id = self.supabase_service.ensure_chat_session(
            self._conversation_customer_identifier(payload.customer_id, payload.customer_email)
        )
        image_reference = payload.image_url or payload.image_name
        shopper_message = (
            payload.message.strip()
            if payload.message and payload.message.strip()
            else f"Support image uploaded: {payload.image_name}"
        )
        customer_log = f"{shopper_message} | Support image source: {image_reference}"
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="customer",
            message=customer_log,
            mode="support",
        )

        recent_messages = self.supabase_service.fetch_session_messages(session_id)
        recent_events = self.supabase_service.fetch_session_events(session_id)
        support_intent_decision = self.langchain_service.classify_support_intent(
            shopper_message=shopper_message,
            recent_messages=recent_messages,
            mode_hint="support",
        )
        issue_intent = support_intent_decision.intent
        if issue_intent not in {"damage_issue", "wrong_item_issue"}:
            issue_intent = self._recent_issue_intent(recent_messages)

        if issue_intent not in {"damage_issue", "wrong_item_issue"}:
            reply = "Use photo upload for damaged or wrong-item issues. If you tell me what went wrong, I’ll guide the next step."
            support_payload = SupportPayload(
                intent="general_support",
                title="Support help",
                summary="Photo upload is available for damaged-item and wrong-item reviews.",
                actions=self._support_actions_for_intent("general_support"),
            )
            return ChatResponse(
                reply=reply,
                support_payload=support_payload,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode="support",
                    route_reason="Support image upload needs a matching issue type",
                    support_intent="general_support",
                ),
            )

        vision_analysis = self.vision_service.analyze_image(
            image_reference=image_reference,
            image_content_base64=payload.image_content_base64,
            image_mime_type=payload.image_mime_type,
        )
        assessment = self.openai_service.assess_support_issue_image(
            issue_intent=issue_intent,
            shopper_message=shopper_message,
            vision_analysis=vision_analysis,
        )
        customer_care_settings = self.supabase_service.fetch_workspace_snapshot().customer_care_settings
        order_reference = self._extract_order_reference(shopper_message) or self._extract_order_from_messages(recent_messages)
        email = self._extract_email(shopper_message) or self._extract_email_from_messages(recent_messages)
        missing_fields = self._missing_support_order_fields(order_reference, email)
        if missing_fields:
            reply = f"{assessment['reply']} {self._support_order_lookup_prompt(missing_fields)}"
            support_payload = SupportPayload(
                intent=issue_intent,
                title=self._support_title_for_intent(issue_intent),
                summary=assessment["summary"],
                requested_fields=missing_fields,
                actions=self._support_actions_for_intent(issue_intent),
                upload_enabled=True,
                upload_intent=issue_intent,
            )
            return ChatResponse(
                reply=reply,
                support_payload=support_payload,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode="support",
                    route_reason="Support image review",
                    vision_requested=True,
                    vision_source=vision_analysis.source,
                    vision_summary=vision_analysis.summary,
                    vision_labels=vision_analysis.labels[:6],
                    vision_objects=vision_analysis.objects[:6],
                    vision_colors=vision_analysis.colors[:4],
                    support_intent=issue_intent,
                    langchain_route_used=self.langchain_service.is_enabled(),
                ),
            )

        order_details = self.shopify_service.lookup_order_support_details(order_reference, email)
        if order_details is None:
            support_email = customer_care_settings.support_email or "info@styledgenie.com"
            reply = (
                f"{assessment['reply']} I couldn’t match that order yet. Double-check the order number and checkout email, "
                f"or email {support_email} and the team can verify it for you."
            )
            support_payload = SupportPayload(
                intent=issue_intent,
                title=self._support_title_for_intent(issue_intent),
                summary=assessment["summary"],
                requires_human_review=True,
                actions=self._support_actions_for_intent(issue_intent),
                upload_enabled=True,
                upload_intent=issue_intent,
            )
            return ChatResponse(
                reply=reply,
                support_payload=support_payload,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode="support",
                    route_reason="Support image review",
                    vision_requested=True,
                    vision_source=vision_analysis.source,
                    vision_summary=vision_analysis.summary,
                    vision_labels=vision_analysis.labels[:6],
                    vision_objects=vision_analysis.objects[:6],
                    vision_colors=vision_analysis.colors[:4],
                    support_intent=issue_intent,
                    langchain_route_used=self.langchain_service.is_enabled(),
                ),
            )

        shopper_profile = self.profile_service.build_profile(
            message=shopper_message,
            mode="support",
            detected_tags=vision_analysis.detected_tags,
            recent_messages=recent_messages,
            recent_events=recent_events,
        )
        order_name = order_details.get("order_name") or self._format_order_reference(order_reference)
        selected_item = self._match_support_order_item(order_details, shopper_message)
        line_items = self._support_line_items_from_order(order_details)
        if selected_item is None and len(line_items) > 1:
            issue_prompt = "looks damaged" if issue_intent == "damage_issue" else "was incorrect"
            reply = f"{assessment['reply']} I found {order_name}. Which item {issue_prompt}?"
            support_payload = SupportPayload(
                intent=issue_intent,
                title=self._support_title_for_intent(issue_intent),
                summary=assessment["summary"],
                source=order_details.get("source"),
                order_reference=order_name,
                customer_email=order_details.get("customer_email") or email,
                line_items=line_items,
                requested_fields=["item"],
                actions=self._support_actions_for_intent(issue_intent),
                upload_enabled=True,
                upload_intent=issue_intent,
            )
            return ChatResponse(
                reply=reply,
                support_payload=support_payload,
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode="support",
                    route_reason="Support image review",
                    vision_requested=True,
                    vision_source=vision_analysis.source,
                    vision_summary=vision_analysis.summary,
                    vision_labels=vision_analysis.labels[:6],
                    vision_objects=vision_analysis.objects[:6],
                    vision_colors=vision_analysis.colors[:4],
                    support_intent=issue_intent,
                    langchain_route_used=self.langchain_service.is_enabled(),
                ),
            )

        target_label = selected_item.get("title") if selected_item else f"the item on {order_name}"
        support_request, notification_result, assigned_contacts = self._create_order_support_request(
            intent=issue_intent,
            session_id=session_id,
            customer_identifier=payload.customer_id,
            shopper_profile=shopper_profile,
            recent_messages=recent_messages,
            message=f"{shopper_message}. Image review: {assessment['summary']}",
            customer_care_settings=customer_care_settings,
            order_details=order_details,
            item_title=target_label,
            shopper_email=email,
        )
        lead_name = assigned_contacts[0].name.strip() if assigned_contacts and assigned_contacts[0].name.strip() else "the support team"
        review_copy = "a damage review" if issue_intent == "damage_issue" else "a wrong-item review"
        reply = f"{assessment['reply']} I found {order_name} and I’ve started {review_copy} for {target_label}. {lead_name} now has the photo and order details."
        if not (notification_result.email_sent or notification_result.whatsapp_sent):
            reply = f"{reply} I’ve logged it here even though no notification channel is configured yet."

        support_payload = SupportPayload(
            intent=issue_intent,
            title=self._support_title_for_intent(issue_intent),
            summary=assessment["summary"],
            source=order_details.get("source"),
            order_reference=order_name,
            customer_email=order_details.get("customer_email") or email,
            fulfillment_status=self._format_support_status(order_details.get("fulfillment_status")),
            financial_status=self._format_support_status(order_details.get("financial_status")),
            line_items=line_items,
            requires_human_review=True,
            actions=self._support_actions_for_intent(
                issue_intent,
                tracking_url=order_details.get("status_page_url"),
            ),
            upload_enabled=True,
            upload_intent=issue_intent,
        )
        return ChatResponse(
            reply=reply,
            support_payload=support_payload,
            ai_runtime=self._build_runtime_metadata(
                resolved_mode="support",
                route_reason="Support image review",
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
                support_intent=issue_intent,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def refine_recommendations(self, payload: RecommendationRefineRequest) -> ChatResponse:
        if payload.swap_category:
            try:
                return self._swap_recommendation_response(payload)
            except Exception:
                logger.exception(
                    "Swap recommendation failed unexpectedly",
                    extra={
                        "mode": payload.mode,
                        "swap_category": payload.swap_category,
                        "recommended_product_ids": payload.recommended_product_ids,
                    },
                )
                fallback_products = payload.current_products or self._product_recommendations_from_ids(
                    payload.recommended_product_ids
                )
                return ChatResponse(
                    reply=self._apply_merchant_voice("Sorry, I couldn’t swap that item right now. Please try again."),
                    recommended_products=fallback_products,
                    styling_insights=[],
                    image_analysis=payload.image_analysis,
                    gap_analysis=payload.gap_analysis,
                    orchestration_context=payload.orchestration_context,
                    shopper_profile=payload.shopper_profile,
                    follow_up_prompts=self._swap_follow_up_prompts(payload.mode, fallback_products),
                    ai_runtime=self._build_runtime_metadata(
                        resolved_mode=payload.mode,
                        route_reason="Swap recommendation fallback",
                    ),
                )

        if payload.mode in {"get_inspired", "complete_the_look"} and payload.image_analysis is not None:
            return self._refine_image_recommendation_response(payload)

        self.supabase_service.log_feedback_event(
            feedback_type=payload.feedback_type,
            mode=payload.mode,
            context_note=payload.context_note,
            recommended_product_ids=payload.recommended_product_ids,
            customer_identifier=payload.customer_id,
        )

        refinement_prompt = payload.refinement_prompt.strip()
        refinement_terms = self._refinement_prompt_for_feedback(payload.feedback_type)
        if refinement_terms and refinement_terms.lower() not in refinement_prompt.lower():
            refinement_prompt = f"{refinement_prompt}. {refinement_terms}".strip()

        inferred_segment = self.recommendation_service.resolve_segment_from_product_ids(
            payload.recommended_product_ids
        )

        return self.handle_text_chat(
            ChatRequest(
                message=refinement_prompt,
                mode=payload.mode,
                customer_id=payload.customer_id,
                customer_email=payload.customer_email,
                account_display_name=payload.account_display_name,
                style_profile_id=payload.style_profile_id,
                exclude_product_ids=payload.recommended_product_ids,
                refinement_feedback_type=payload.feedback_type,
                profile_inputs=None if inferred_segment is None else ShopperProfileInput(segment=inferred_segment),
            )
        )

    def _swap_recommendation_response(self, payload: RecommendationRefineRequest) -> ChatResponse:
        current_products = payload.current_products or self._product_recommendations_from_ids(
            payload.recommended_product_ids
        )
        inferred_segment = self.recommendation_service.resolve_segment_from_product_ids(
            [item.id for item in current_products]
        )
        session_id = self.supabase_service.ensure_chat_session(
            self._conversation_customer_identifier(payload.customer_id, payload.customer_email)
        )
        session_context = self.supabase_service.fetch_chat_session_context(session_id)
        recent_messages = self.supabase_service.fetch_session_messages(session_id)
        recent_events = self.supabase_service.fetch_session_events(session_id)
        saved_style_profile = self._load_saved_style_profile(
            customer_id=payload.customer_id,
            customer_email=payload.customer_email,
            account_display_name=payload.account_display_name,
            style_profile_id=self._effective_style_profile_id(payload.style_profile_id, session_context),
        )
        shopper_profile = payload.shopper_profile or self.profile_service.build_profile(
            message=payload.context_note or payload.refinement_prompt,
            mode=payload.mode,
            detected_tags=[],
            recent_messages=recent_messages,
            recent_events=recent_events,
            profile_inputs=None if inferred_segment is None else ShopperProfileInput(segment=inferred_segment),
            saved_style_profile=saved_style_profile,
        )
        required_segment = (
            payload.shopper_profile.segment_preference
            if payload.shopper_profile and payload.shopper_profile.segment_preference
            else inferred_segment
        )
        updated_products, replacement = self.recommendation_service.swap_recommendations(
            current_products=current_products,
            swap_category=payload.swap_category or "",
            mode=payload.mode,
            context_note=payload.context_note or payload.refinement_prompt,
            shopper_profile=shopper_profile,
            required_segment=required_segment,
            image_analysis=payload.image_analysis,
            gap_analysis=payload.gap_analysis,
            orchestration_context=payload.orchestration_context,
        )
        if replacement is None:
            return ChatResponse(
                reply=self._apply_merchant_voice(
                    "I couldn’t swap just that piece cleanly from the live catalog, but I can still show another full direction."
                ),
                recommended_products=current_products,
                styling_insights=[],
                image_analysis=payload.image_analysis,
                gap_analysis=payload.gap_analysis,
                orchestration_context=payload.orchestration_context,
                shopper_profile=shopper_profile,
                follow_up_prompts=self._swap_follow_up_prompts(payload.mode, current_products),
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode=payload.mode,
                    route_reason="Swap recommendation",
                    active_segment=required_segment,
                ),
            )

        validation_result = self.recommendation_service.validate_generated_recommendations(
            mode=payload.mode,
            recommendations=updated_products,
            required_segment=required_segment or "",
            shopper_profile=shopper_profile,
            query_text=payload.context_note or payload.refinement_prompt,
            image_analysis=payload.image_analysis,
            gap_analysis=payload.gap_analysis,
            orchestration_context=payload.orchestration_context,
        )
        if validation_result.status == "fail":
            return ChatResponse(
                reply=self._apply_merchant_voice(
                    "I couldn’t swap just that piece cleanly without breaking the look, but I can show another full direction."
                ),
                recommended_products=current_products,
                styling_insights=[],
                image_analysis=payload.image_analysis,
                gap_analysis=payload.gap_analysis,
                orchestration_context=payload.orchestration_context,
                shopper_profile=shopper_profile,
                follow_up_prompts=self._swap_follow_up_prompts(payload.mode, current_products),
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode=payload.mode,
                    route_reason="Swap recommendation",
                    active_segment=required_segment,
                ),
            )

        updated_products = validation_result.recommendations
        final_replacement = next(
            (
                item
                for item in updated_products
                if item.id not in {product.id for product in current_products}
            ),
            replacement,
        )

        reply = self._build_swap_reply(payload.mode, payload.swap_category or "", final_replacement.title)
        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="assistant",
            message=reply,
            mode=payload.mode,
        )
        return ChatResponse(
            reply=reply,
            recommended_products=updated_products,
            styling_insights=[
                StylingInsight(
                    title="Only one piece changed",
                    detail=f"I kept the rest of the look intact and only replaced the {payload.swap_category} so the overall direction stays steady.",
                )
            ],
            image_analysis=payload.image_analysis,
            gap_analysis=payload.gap_analysis,
            orchestration_context=payload.orchestration_context,
            shopper_profile=shopper_profile,
            follow_up_prompts=self._swap_follow_up_prompts(payload.mode, updated_products),
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=payload.mode,
                route_reason="Swap recommendation",
                active_segment=required_segment,
            ),
        )

    def _refine_image_recommendation_response(self, payload: RecommendationRefineRequest) -> ChatResponse:
        session_id = self.supabase_service.ensure_chat_session(
            self._conversation_customer_identifier(payload.customer_id, payload.customer_email)
        )
        session_context = self.supabase_service.fetch_chat_session_context(session_id)
        recent_messages = self.supabase_service.fetch_session_messages(session_id)
        recent_events = self.supabase_service.fetch_session_events(session_id)
        inferred_segment = self.recommendation_service.resolve_segment_from_product_ids(
            payload.recommended_product_ids
        )
        saved_style_profile = self._load_saved_style_profile(
            customer_id=payload.customer_id,
            customer_email=payload.customer_email,
            account_display_name=payload.account_display_name,
            style_profile_id=self._effective_style_profile_id(payload.style_profile_id, session_context),
        )
        shopper_profile = payload.shopper_profile or self.profile_service.build_profile(
            message=payload.context_note or payload.refinement_prompt,
            mode=payload.mode,
            detected_tags=payload.image_analysis.garment_types if payload.image_analysis else [],
            recent_messages=recent_messages,
            recent_events=recent_events,
            profile_inputs=None if inferred_segment is None else ShopperProfileInput(segment=inferred_segment),
            saved_style_profile=saved_style_profile,
        )
        required_segment = (
            shopper_profile.segment_preference
            or inferred_segment
            or (
                payload.image_analysis.styling_mode_cue
                if payload.image_analysis and payload.image_analysis.styling_mode_cue in {"menswear", "womenswear"}
                else None
            )
            or ""
        )
        query_text = " ".join(
            item
            for item in [
                payload.context_note,
                payload.refinement_prompt,
                payload.image_analysis.summary if payload.image_analysis else "",
            ]
            if item
        ).strip()
        candidate_terms = self.profile_service.build_query_terms(
            message=query_text or payload.refinement_prompt,
            detected_tags=payload.image_analysis.garment_types if payload.image_analysis else [],
            profile=shopper_profile,
        )
        if payload.image_analysis is not None:
            for term in (
                payload.image_analysis.palette
                + payload.image_analysis.garment_types
                + payload.image_analysis.style_direction
                + payload.image_analysis.silhouette_cues
                + payload.image_analysis.color_harmony_cues
            ):
                normalized_term = str(term or "").strip()
                if normalized_term and normalized_term not in candidate_terms:
                    candidate_terms.append(normalized_term)
        for term in self._refinement_terms(payload.feedback_type):
            if term not in candidate_terms:
                candidate_terms.append(term)

        current_products = payload.current_products or self._product_recommendations_from_ids(
            payload.recommended_product_ids
        )
        fallback_prompts = self.profile_service.build_follow_up_prompts(shopper_profile, payload.mode)
        gap_analysis = payload.gap_analysis
        orchestration_context = payload.orchestration_context or {}

        if payload.mode == "complete_the_look":
            gap_analysis = gap_analysis or self.recommendation_service.build_complete_look_gap_analysis(
                image_analysis=payload.image_analysis,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                orchestration_context=orchestration_context,
            )
            recommendations = self.recommendation_service.recommend_complete_look_products(
                terms=candidate_terms,
                query_text=query_text or payload.refinement_prompt,
                shopper_profile=shopper_profile,
                image_analysis=payload.image_analysis,
                required_segment=required_segment,
                orchestration_context=orchestration_context,
                limit=6,
            )
            reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_complete_look_reply(
                shopper_message=query_text or payload.refinement_prompt,
                shopper_profile=shopper_profile,
                image_analysis=payload.image_analysis,
                recommendations=recommendations,
                orchestration_context=orchestration_context,
            )
        else:
            recommendations = self.recommendation_service.recommend_inspired_look_products(
                terms=candidate_terms,
                query_text=query_text or payload.refinement_prompt,
                shopper_profile=shopper_profile,
                image_analysis=payload.image_analysis,
                required_segment=required_segment,
                orchestration_context=orchestration_context,
                limit=5,
            )
            reply, recommendations, follow_up_prompts, styling_insights = self.openai_service.compose_inspired_look_reply(
                shopper_message=query_text or payload.refinement_prompt,
                shopper_profile=shopper_profile,
                image_analysis=payload.image_analysis,
                recommendations=recommendations,
                orchestration_context=orchestration_context,
                allow_model=False,
            )

        validation_result = self.recommendation_service.validate_generated_recommendations(
            mode=payload.mode,
            recommendations=recommendations,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            query_text=query_text or payload.refinement_prompt,
            image_analysis=payload.image_analysis,
            gap_analysis=gap_analysis,
            orchestration_context=orchestration_context,
        )
        if validation_result.repaired:
            recommendations = validation_result.recommendations
            reply, recommendations, styling_insights, follow_up_prompts = self._refresh_styling_output(
                mode=payload.mode,
                shopper_message=query_text or payload.refinement_prompt,
                shopper_profile=shopper_profile,
                recommendations=recommendations,
                fallback_prompts=fallback_prompts,
                detected_tags=[],
                image_analysis=payload.image_analysis,
                orchestration_context=orchestration_context,
                vision_summary=payload.image_analysis.summary if payload.image_analysis else "",
            )
        if validation_result.status == "fail":
            return ChatResponse(
                reply=self._apply_merchant_voice(
                    "I couldn’t safely rework that without drifting away from the original image, so I kept the current direction intact."
                ),
                recommended_products=current_products,
                styling_insights=[],
                image_analysis=payload.image_analysis,
                gap_analysis=gap_analysis,
                orchestration_context=orchestration_context,
                shopper_profile=shopper_profile,
                follow_up_prompts=self._swap_follow_up_prompts(payload.mode, current_products),
                ai_runtime=self._build_runtime_metadata(
                    resolved_mode=payload.mode,
                    route_reason="Image refinement",
                    active_segment=required_segment,
                ),
            )

        self.supabase_service.log_chat_message(
            session_id=session_id,
            sender="assistant",
            message=reply,
            mode=payload.mode,
        )
        return ChatResponse(
            reply=reply,
            recommended_products=recommendations,
            styling_insights=styling_insights,
            image_analysis=payload.image_analysis,
            gap_analysis=gap_analysis,
            orchestration_context=orchestration_context,
            shopper_profile=shopper_profile,
            follow_up_prompts=follow_up_prompts,
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=payload.mode,
                route_reason="Image refinement",
                active_segment=required_segment,
            ),
        )

    def _product_recommendations_from_ids(
        self,
        product_ids: list[str],
    ) -> list[ProductRecommendation]:
        products = self.recommendation_service.products_by_ids(product_ids)
        segment = self.recommendation_service.resolve_segment_from_product_ids(product_ids)
        return [
            ProductRecommendation(
                id=item["id"],
                title=item.get("title") or "Catalog item",
                category=item.get("category") or "Catalog pick",
                reason="Kept from the current look.",
                segment=segment,
                tags=item.get("tags", []),
                image_url=item.get("image_url"),
                price=self.recommendation_service._price_text(item.get("price")),
                product_url=self.recommendation_service._product_url(item),
                cart_variant_id=item.get("shopify_variant_id") or None,
            )
            for item in products
        ]

    def _swap_follow_up_prompts(
        self,
        mode: str,
        products: list[ProductRecommendation],
    ) -> list[str]:
        categories = " ".join((item.category or "").lower() for item in products)
        prompts = ["Cheaper version", "Make it sharper", "Swap one more item"]
        if "shoe" in categories or "sneaker" in categories or "boot" in categories or "heel" in categories:
            prompts[2] = "Swap shoes"
        if mode == "get_inspired":
            prompts[1] = "More premium"
        return prompts[:3]

    def _build_swap_reply(self, mode: str, swap_category: str, replacement_title: str) -> str:
        if mode == "get_inspired":
            return self._apply_merchant_voice(
                f"I kept the recreated look intact and only swapped the {swap_category} to {replacement_title}."
            )
        if mode == "complete_the_look":
            return self._apply_merchant_voice(
                f"I kept the rest of the build the same and swapped the {swap_category} to {replacement_title}."
            )
        return self._apply_merchant_voice(
            f"I kept the outfit direction steady and swapped the {swap_category} to {replacement_title}."
        )

    def _refresh_styling_output(
        self,
        *,
        mode: str,
        shopper_message: str,
        shopper_profile,
        recommendations: list[ProductRecommendation],
        fallback_prompts: list[str],
        detected_tags: list[str],
        image_analysis=None,
        orchestration_context: Optional[dict] = None,
        vision_summary: str = "",
    ) -> tuple[str, list[ProductRecommendation], list[StylingInsight], list[str]]:
        if mode == "complete_the_look" and image_analysis is not None:
            reply, refreshed_products, follow_up_prompts, styling_insights = self.openai_service.compose_complete_look_reply(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recommendations=recommendations,
                orchestration_context=orchestration_context or {},
            )
            return reply, refreshed_products, styling_insights, follow_up_prompts

        if mode == "get_inspired" and image_analysis is not None:
            reply, refreshed_products, follow_up_prompts, styling_insights = self.openai_service.compose_inspired_look_reply(
                shopper_message=shopper_message,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                recommendations=recommendations,
                orchestration_context=orchestration_context or {},
                allow_model=False,
            )
            return reply, refreshed_products, styling_insights, follow_up_prompts

        reply = self.openai_service.build_text_reply(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=recommendations,
            shopper_profile=shopper_profile,
            vision_summary=vision_summary,
        )
        styling_insights = self.openai_service.build_styling_insights(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=recommendations,
            shopper_profile=shopper_profile,
        )
        return reply, recommendations, styling_insights, fallback_prompts

    def _handle_support_message(
        self,
        *,
        message: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        recent_messages: list[dict],
        recent_events: list[dict],
        shopper_profile,
        support_intent: str,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        customer_care_settings = self.supabase_service.fetch_workspace_snapshot().customer_care_settings

        if self._is_handoff_follow_up(message, recent_events):
            reply, event_type, prompts, used = self._update_handoff_request(
                message=message,
                session_id=session_id,
                customer_identifier=customer_identifier,
                recent_messages=recent_messages,
                customer_care_settings=customer_care_settings,
            )
            return reply, event_type, prompts, used, None

        if self._should_trigger_handoff(message, customer_care_settings):
            reply, event_type, prompts, used = self._start_handoff_request(
                message=message,
                session_id=session_id,
                customer_identifier=customer_identifier,
                recent_messages=recent_messages,
                shopper_profile=shopper_profile,
                customer_care_settings=customer_care_settings,
            )
            return reply, event_type, prompts, used, None

        if support_intent == "order_tracking" or self._is_order_tracking_request(message, recent_messages, customer_care_settings):
            return self._handle_order_tracking_support(
                message=message,
                recent_messages=recent_messages,
                customer_care_settings=customer_care_settings,
            )

        if support_intent in {"return_request", "exchange_request", "refund_query"}:
            return self._handle_order_resolution_support(
                intent=support_intent,
                message=message,
                session_id=session_id,
                customer_identifier=customer_identifier,
                recent_messages=recent_messages,
                shopper_profile=shopper_profile,
                customer_care_settings=customer_care_settings,
            )

        if support_intent in {"damage_issue", "wrong_item_issue"}:
            return self._handle_order_issue_support(
                intent=support_intent,
                message=message,
                session_id=session_id,
                customer_identifier=customer_identifier,
                recent_messages=recent_messages,
                shopper_profile=shopper_profile,
                customer_care_settings=customer_care_settings,
            )

        if support_intent == "shipping_question" and (
            self._extract_order_reference(message)
            or self._extract_order_from_messages(recent_messages)
            or self._extract_email(message)
            or self._extract_email_from_messages(recent_messages)
        ):
            return self._handle_order_tracking_support(
                message=message,
                recent_messages=recent_messages,
                customer_care_settings=customer_care_settings,
            )

        if support_intent == "sizing_question":
            return self._handle_sizing_support(
                message=message,
                recent_messages=recent_messages,
                shopper_profile=shopper_profile,
            )

        if support_intent == "product_question":
            return self._handle_product_support(
                message=message,
                recent_messages=recent_messages,
                shopper_profile=shopper_profile,
            )

        if support_intent == "general_support":
            return self._handle_general_support()

        fallback_answer = self._apply_merchant_voice(
            self.faq_service.answer_question(message, customer_care_settings)
        )
        langchain_support = self.langchain_service.compose_support_reply(
            shopper_message=message,
            recent_messages=recent_messages,
            customer_care_settings=customer_care_settings,
            fallback_answer=fallback_answer,
            merchant_context=self.openai_service.merchant_context(),
        )
        if langchain_support is not None:
            reply, prompts = langchain_support
            payload = SupportPayload(
                intent=support_intent or "support_question",
                title=self._support_title_for_intent(support_intent or "support_question"),
                summary=fallback_answer,
                actions=self._support_actions_for_intent(
                    support_intent or "support_question",
                    tracking_url=None,
                ),
            )
            return reply, support_intent or "support_question", prompts, True, payload

        payload = SupportPayload(
            intent=support_intent or "support_question",
            title=self._support_title_for_intent(support_intent or "support_question"),
            summary=fallback_answer,
            actions=self._support_actions_for_intent(
                support_intent or "support_question",
                tracking_url=None,
            ),
        )
        return fallback_answer, support_intent or "support_question", [], False, payload

    def _build_runtime_metadata(
        self,
        *,
        resolved_mode: str,
        route_reason: str,
        vision_requested: bool = False,
        vision_source: str = "not_used",
        vision_summary: str = "",
        vision_labels: Optional[list[str]] = None,
        vision_objects: Optional[list[str]] = None,
        vision_colors: Optional[list[str]] = None,
        active_segment: Optional[str] = None,
        support_intent: Optional[str] = None,
        langchain_route_used: bool = False,
        langchain_stylist_used: bool = False,
        langchain_support_used: bool = False,
    ) -> AIRuntimeMetadata:
        return AIRuntimeMetadata(
            vision_requested=vision_requested,
            vision_source=vision_source,
            vision_summary=vision_summary,
            vision_labels=vision_labels or [],
            vision_objects=vision_objects or [],
            vision_colors=vision_colors or [],
            active_segment=active_segment,
            support_intent=support_intent,
            langchain_enabled=self.langchain_service.is_enabled(),
            langchain_route_used=langchain_route_used,
            langchain_stylist_used=langchain_stylist_used,
            langchain_support_used=langchain_support_used,
            resolved_mode=resolved_mode,
            route_reason=route_reason,
        )

    def _decision_mode_prompt_response(
        self,
        *,
        resolved_mode: str,
        route_reason: str,
        shopper_profile,
        active_segment: Optional[str],
    ) -> ChatResponse:
        return ChatResponse(
            reply=self._apply_merchant_voice("Do you want a few options, or do you want me to pick the best one for you?"),
            recommended_products=[],
            styling_insights=[],
            shopper_profile=shopper_profile,
            follow_up_prompts=["Show me options", "Decide for me"],
            required_follow_up_fields=["decision_mode"],
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=resolved_mode,
                route_reason=route_reason,
                active_segment=active_segment,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def _segment_clarification_response(
        self,
        *,
        prompt: str,
        resolved_mode: str,
        route_reason: str,
        shopper_profile,
        required_follow_up_fields: Optional[list[str]] = None,
        image_analysis=None,
        vision_requested: bool = False,
        vision_source: str = "not_used",
        vision_summary: str = "",
        vision_labels: Optional[list[str]] = None,
        vision_objects: Optional[list[str]] = None,
        vision_colors: Optional[list[str]] = None,
    ) -> ChatResponse:
        reply = self._compose_image_analysis_reply(image_analysis, prompt)
        return ChatResponse(
            reply=reply,
            recommended_products=[],
            styling_insights=[],
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            follow_up_prompts=(image_analysis.follow_up_prompts if image_analysis and image_analysis.follow_up_prompts else ["Menswear", "Womenswear"]),
            required_follow_up_fields=required_follow_up_fields or [],
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=resolved_mode,
                route_reason=route_reason,
                vision_requested=vision_requested,
                vision_source=vision_source,
                vision_summary=vision_summary,
                vision_labels=vision_labels or [],
                vision_objects=vision_objects or [],
                vision_colors=vision_colors or [],
                active_segment=None,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def _styling_context_clarification_response(
        self,
        *,
        prompt: str,
        prompt_options: list[str],
        required_follow_up_fields: Optional[list[str]],
        resolved_mode: str,
        route_reason: str,
        shopper_profile,
        active_segment: Optional[str],
    ) -> ChatResponse:
        return ChatResponse(
            reply=self._apply_merchant_voice(prompt),
            recommended_products=[],
            styling_insights=[],
            shopper_profile=shopper_profile,
            follow_up_prompts=prompt_options,
            required_follow_up_fields=required_follow_up_fields or [],
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=resolved_mode,
                route_reason=route_reason,
                active_segment=active_segment,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def _complete_look_requirements_response(
        self,
        *,
        resolved_mode: str,
        route_reason: str,
        shopper_profile,
        image_analysis,
        vision_analysis,
        required_fields: list[str],
        active_segment: Optional[str] = None,
    ) -> ChatResponse:
        anchor_label = image_analysis.anchor_item or "anchor piece"
        missing_labels = []
        if "segment" in required_fields:
            missing_labels.append("whether I should style it as menswear or womenswear")
        if "occasion" in required_fields:
            missing_labels.append("the occasion")
        if "weather" in required_fields:
            missing_labels.append("the weather")

        if len(missing_labels) == 1:
            missing_copy = missing_labels[0]
        elif len(missing_labels) == 2:
            missing_copy = f"{missing_labels[0]} and {missing_labels[1]}"
        else:
            missing_copy = ", ".join(missing_labels[:-1]) + f", and {missing_labels[-1]}"

        known_direction = active_segment or (
            image_analysis.styling_mode_cue
            if getattr(image_analysis, "styling_mode_cue", None) in {"menswear", "womenswear"}
            else None
        )
        if "segment" not in required_fields and known_direction:
            follow_up = f"I’m already reading the styling direction as {known_direction}. I just need {missing_copy} before I complete the look."
        else:
            follow_up = f"The anchor piece looks like {anchor_label}. I just need {missing_copy} before I complete the look."
        reply = self._compose_image_analysis_reply(
            image_analysis,
            follow_up,
        )
        return ChatResponse(
            reply=reply,
            recommended_products=[],
            styling_insights=[],
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            follow_up_prompts=[],
            required_follow_up_fields=required_fields,
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=resolved_mode,
                route_reason=route_reason,
                vision_requested=True,
                vision_source=vision_analysis.source,
                vision_summary=image_analysis.summary or vision_analysis.summary,
                vision_labels=vision_analysis.labels[:6],
                vision_objects=vision_analysis.objects[:6],
                vision_colors=vision_analysis.colors[:4],
                active_segment=active_segment,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def _same_mode_fallback_response(
        self,
        *,
        resolved_mode: str,
        route_reason: str,
        required_segment: str,
        shopper_profile,
        shopper_message: str,
        fallback_prompts: list[str],
        image_analysis=None,
        vision_requested: bool = False,
        vision_source: str = "not_used",
        vision_summary: str = "",
        vision_labels: Optional[list[str]] = None,
        vision_objects: Optional[list[str]] = None,
        vision_colors: Optional[list[str]] = None,
    ) -> ChatResponse:
        fallback_reply = (
            f"I’m keeping this strictly in {required_segment}, but I don’t have a strong enough same-category match yet. "
            "Give me one more detail on the occasion, silhouette, or budget and I’ll tighten it up without crossing categories."
        )
        reply = self._compose_image_analysis_reply(image_analysis, fallback_reply)
        return ChatResponse(
            reply=reply,
            recommended_products=[],
            styling_insights=[],
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            follow_up_prompts=fallback_prompts or ["Make it more polished", "Keep it casual", "Show same-mode best picks"],
            ai_runtime=self._build_runtime_metadata(
                resolved_mode=resolved_mode,
                route_reason=route_reason,
                vision_requested=vision_requested,
                vision_source=vision_source,
                vision_summary=vision_summary,
                vision_labels=vision_labels or [],
                vision_objects=vision_objects or [],
                vision_colors=vision_colors or [],
                active_segment=required_segment,
                langchain_route_used=self.langchain_service.is_enabled(),
            ),
        )

    def _compose_image_analysis_reply(self, image_analysis, follow_up: str) -> str:
        if not image_analysis:
            return self._apply_merchant_voice(follow_up)

        observation_bits = []
        if image_analysis.summary:
            observation_bits.append(image_analysis.summary)
        if image_analysis.quality_note:
            observation_bits.append(image_analysis.quality_note)

        if not observation_bits:
            return self._apply_merchant_voice(follow_up)

        return self._apply_merchant_voice(" ".join(observation_bits + [follow_up]).strip())

    def _missing_styling_text_prompt(
        self,
        *,
        resolved_mode: str,
        shopper_profile,
    ) -> Optional[tuple[str, list[str], list[str]]]:
        if resolved_mode != "outfit_curation":
            return None

        occasion = (getattr(shopper_profile, "occasion_context", None) or "").strip().lower()
        if not occasion:
            return (
                self._apply_merchant_voice("What’s the occasion for this look?"),
                ["Dinner", "Office", "Travel"],
                ["occasion"],
            )

        weather = (getattr(shopper_profile, "weather_context", None) or "").strip().lower()
        if not weather:
            return (
                self._apply_merchant_voice("What weather should I style this for?"),
                ["Cold weather", "Mild weather", "Hot weather"],
                ["weather"],
            )

        feeling = (getattr(shopper_profile, "feeling_goal", None) or "").strip().lower()
        priority = (getattr(shopper_profile, "priority_focus", None) or "").strip().lower()
        style_identity = getattr(shopper_profile, "style_identity", []) or []
        if (
            getattr(shopper_profile, "confidence_level", "medium") == "low"
            and not feeling
            and not priority
            and not style_identity
        ):
            return (
                self._apply_merchant_voice("Should I keep this more comfortable, sharper, or a little bolder?"),
                ["More comfortable", "Sharper", "A little bolder"],
                ["priority"],
            )

        return None

    def _missing_complete_look_fields(
        self,
        profile_inputs: Optional[ShopperProfileInput],
        *,
        shopper_profile=None,
        inferred_segment: Optional[str] = None,
    ) -> list[str]:
        profile_inputs = profile_inputs or ShopperProfileInput()
        missing = []
        normalized_segment = self.profile_service.normalize_segment(profile_inputs.segment)
        effective_segment = normalized_segment or self.profile_service.normalize_segment(inferred_segment)
        if not effective_segment:
            missing.append("segment")

        effective_occasion = (
            str(profile_inputs.occasion).strip().lower()
            if profile_inputs.occasion and str(profile_inputs.occasion).strip()
            else None
        )
        if not effective_occasion and shopper_profile is not None:
            inferred_occasion = getattr(shopper_profile, "occasion_context", None)
            if inferred_occasion not in {None, "", "look_completion", "inspiration"}:
                effective_occasion = str(inferred_occasion).strip().lower()
        if not effective_occasion:
            missing.append("occasion")

        effective_weather = (
            str(profile_inputs.weather).strip().lower()
            if profile_inputs.weather and str(profile_inputs.weather).strip()
            else None
        )
        if not effective_weather and shopper_profile is not None:
            inferred_weather = getattr(shopper_profile, "weather_context", None)
            if inferred_weather not in {None, ""}:
                effective_weather = str(inferred_weather).strip().lower()
        if not effective_weather:
            missing.append("weather")
        return missing

    def _handle_order_issue_support(
        self,
        *,
        intent: str,
        message: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        recent_messages: list[dict],
        shopper_profile,
        customer_care_settings: CustomerCareSettings,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        order_reference = self._extract_order_reference(message) or self._extract_order_from_messages(recent_messages)
        email = self._extract_email(message) or self._extract_email_from_messages(recent_messages)
        missing_fields = self._missing_support_order_fields(order_reference, email)
        if missing_fields:
            reply = self._support_order_lookup_prompt(missing_fields)
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary="I need the order details before I can start the issue review.",
                order_reference=order_reference,
                customer_email=email,
                requested_fields=missing_fields,
                actions=self._support_actions_for_intent(intent),
                upload_enabled=True,
                upload_intent=intent,
            )
            return reply, intent, ["Track my order", "Speak to support"], False, payload

        order_details = self.shopify_service.lookup_order_support_details(order_reference, email)
        if order_details is None:
            support_email = customer_care_settings.support_email or "info@styledgenie.com"
            reply = (
                "I couldn’t match that order yet. Double-check the order number and checkout email, "
                f"or email {support_email} and the team can verify it for you."
            )
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary="I couldn’t match the order with the details I have.",
                order_reference=order_reference,
                customer_email=email,
                requires_human_review=True,
                actions=self._support_actions_for_intent(intent),
                upload_enabled=True,
                upload_intent=intent,
            )
            return reply, intent, ["Track my order", "Speak to support"], False, payload

        order_name = order_details.get("order_name") or self._format_order_reference(order_reference)
        selected_item = self._match_support_order_item(order_details, message)
        line_items = self._support_line_items_from_order(order_details)
        if selected_item is None and len(line_items) > 1:
            issue_prompt = "looks damaged" if intent == "damage_issue" else "was incorrect"
            reply = f"I found {order_name}. Which item {issue_prompt}?"
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary=f"Choose the item from {order_name} and I’ll continue the issue review.",
                source=order_details.get("source"),
                order_reference=order_name,
                customer_email=order_details.get("customer_email") or email,
                line_items=line_items,
                requested_fields=["item"],
                actions=self._support_actions_for_intent(intent),
                upload_enabled=True,
                upload_intent=intent,
            )
            return reply, intent, [item.title for item in line_items[:3]], False, payload

        target_label = selected_item.get("title") if selected_item else f"the item on {order_name}"
        support_request, notification_result, assigned_contacts = self._create_order_support_request(
            intent=intent,
            session_id=session_id,
            customer_identifier=customer_identifier,
            shopper_profile=shopper_profile,
            recent_messages=recent_messages,
            message=message,
            customer_care_settings=customer_care_settings,
            order_details=order_details,
            item_title=target_label,
            shopper_email=email,
        )
        lead_name = assigned_contacts[0].name.strip() if assigned_contacts and assigned_contacts[0].name.strip() else "the support team"
        issue_copy = "a damage review" if intent == "damage_issue" else "a wrong-item review"
        reply = f"I found {order_name} and I’ve started {issue_copy} for {target_label}. {lead_name} now has the order details."
        if not (notification_result.email_sent or notification_result.whatsapp_sent):
            reply = f"{reply} I’ve logged it here even though no notification channel is configured yet."

        payload = SupportPayload(
            intent=intent,
            title=self._support_title_for_intent(intent),
            summary=(
                support_request.issue_summary if getattr(support_request, "issue_summary", None)
                else self._support_source_summary(order_details.get("source"), purpose="review")
            ),
            source=order_details.get("source"),
            order_reference=order_name,
            customer_email=order_details.get("customer_email") or email,
            fulfillment_status=self._format_support_status(order_details.get("fulfillment_status")),
            financial_status=self._format_support_status(order_details.get("financial_status")),
            line_items=line_items,
            upload_enabled=True,
            upload_intent=intent,
            requires_human_review=True,
            actions=self._support_actions_for_intent(
                intent,
                tracking_url=order_details.get("status_page_url"),
            ),
        )
        return reply, intent, ["Track my order", "Need more help"], False, payload

    def _compose_complete_look_reply(self, image_analysis, stylist_reply: str) -> str:
        observation_bits = []
        if image_analysis and image_analysis.summary:
            observation_bits.append(f"Got it - {image_analysis.summary}")
        if image_analysis and image_analysis.quality_note:
            observation_bits.append(image_analysis.quality_note)

        if observation_bits:
            observation_bits.append("Here's how I'd complete this look.")
            return " ".join(observation_bits).strip()

        if stylist_reply:
            return stylist_reply

        return "Here's how I'd complete this look."

    def _handle_order_tracking_support(
        self,
        *,
        message: str,
        recent_messages: list[dict],
        customer_care_settings: CustomerCareSettings,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        order_reference = self._extract_order_reference(message) or self._extract_order_from_messages(recent_messages)
        email = self._extract_email(message) or self._extract_email_from_messages(recent_messages)
        missing_fields = self._missing_support_order_fields(order_reference, email)
        if missing_fields:
            reply = self._support_order_lookup_prompt(missing_fields)
            payload = SupportPayload(
                intent="order_tracking",
                title="Order lookup needed",
                summary="I need one more detail before I can fetch the live order status.",
                order_reference=order_reference,
                customer_email=email,
                requested_fields=missing_fields,
                actions=self._support_actions_for_intent("order_tracking"),
            )
            return reply, "order_tracking", ["Track my order", "Return an item"], False, payload

        order_details = self.shopify_service.lookup_order_support_details(order_reference, email)
        if order_details is None:
            support_email = customer_care_settings.support_email or "info@styledgenie.com"
            reply = (
                "I couldn’t match that order yet. Double-check the order number and checkout email, "
                f"or email {support_email} and the team can verify it for you."
            )
            payload = SupportPayload(
                intent="order_tracking",
                title="Order not found yet",
                summary="I couldn’t match that order with the details I have.",
                order_reference=order_reference,
                customer_email=email,
                requires_human_review=True,
                actions=self._support_actions_for_intent("order_tracking"),
            )
            return reply, "order_tracking", ["Track my order", "Speak to support"], False, payload

        order_name = order_details.get("order_name") or self._format_order_reference(order_reference)
        fulfillment_status = self._format_support_status(order_details.get("fulfillment_status"))
        source = order_details.get("source")
        delivery_estimate = self._support_delivery_hint(fulfillment_status) if source == "live" else None
        if source == "snapshot":
            reply = f"I found the latest synced order snapshot for {order_name}. The stored status is {fulfillment_status.lower()}."
        else:
            reply = f"Your order {order_name} is currently {fulfillment_status.lower()}."
        if delivery_estimate:
            reply = f"{reply} {delivery_estimate}"

        payload = SupportPayload(
            intent="order_tracking",
            title=f"Order {order_name}",
            summary=self._support_source_summary(source, purpose="tracking"),
            source=source,
            order_reference=order_name,
            customer_email=order_details.get("customer_email") or email,
            fulfillment_status=fulfillment_status,
            financial_status=self._format_support_status(order_details.get("financial_status")),
            tracking_url=order_details.get("status_page_url"),
            delivery_estimate=delivery_estimate,
            status_label=fulfillment_status,
            line_items=self._support_line_items_from_order(order_details),
            actions=self._support_actions_for_intent(
                "order_tracking",
                tracking_url=order_details.get("status_page_url"),
            ),
        )
        return reply, "order_tracking", ["Return an item", "Exchange an item", "Need more help"], False, payload

    def _handle_order_resolution_support(
        self,
        *,
        intent: str,
        message: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        recent_messages: list[dict],
        shopper_profile,
        customer_care_settings: CustomerCareSettings,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        order_reference = self._extract_order_reference(message) or self._extract_order_from_messages(recent_messages)
        email = self._extract_email(message) or self._extract_email_from_messages(recent_messages)
        missing_fields = self._missing_support_order_fields(order_reference, email)
        if missing_fields:
            reply = self._support_order_lookup_prompt(missing_fields)
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary="I need your order lookup details before I can start this.",
                order_reference=order_reference,
                customer_email=email,
                requested_fields=missing_fields,
                actions=self._support_actions_for_intent(intent),
            )
            return reply, intent, ["Track my order", "Speak to support"], False, payload

        order_details = self.shopify_service.lookup_order_support_details(order_reference, email)
        if order_details is None:
            support_email = customer_care_settings.support_email or "info@styledgenie.com"
            reply = (
                "I couldn’t match that order yet. Double-check the order number and checkout email, "
                f"or email {support_email} and the team can verify it for you."
            )
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary="I couldn’t match the order with the details I have.",
                order_reference=order_reference,
                customer_email=email,
                requires_human_review=True,
                actions=self._support_actions_for_intent(intent),
            )
            return reply, intent, ["Track my order", "Speak to support"], False, payload

        order_name = order_details.get("order_name") or self._format_order_reference(order_reference)
        selected_item = self._match_support_order_item(order_details, message)
        line_items = self._support_line_items_from_order(order_details)
        if selected_item is None and len(line_items) > 1:
            verb = self._support_verb_for_intent(intent)
            reply = f"I found {order_name}. Which item do you want to {verb}?"
            prompts = [item.title for item in line_items[:3]]
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary=f"Choose the item from {order_name} and I’ll continue.",
                order_reference=order_name,
                customer_email=order_details.get("customer_email") or email,
                line_items=line_items,
                requested_fields=["item"],
                actions=self._support_actions_for_intent(intent),
            )
            return reply, intent, prompts, False, payload

        target_label = selected_item.get("title") if selected_item else f"the item on {order_name}"
        requested_size = self._extract_requested_size(message)
        if intent == "exchange_request" and not requested_size:
            reply = f"I found {order_name}. What size would you like instead for {target_label}?"
            payload = SupportPayload(
                intent=intent,
                title="Exchange request",
                summary="I have the order and item. I just need the replacement size.",
                order_reference=order_name,
                customer_email=order_details.get("customer_email") or email,
                line_items=line_items,
                requested_fields=["replacement_size"],
                actions=self._support_actions_for_intent(intent),
            )
            return reply, intent, ["XS", "S", "M", "L", "XL"], False, payload

        eligibility = self.shopify_service.assess_return_eligibility(order_details)
        if not eligibility.get("eligible"):
            reply = f"{eligibility.get('reason')} If you want, I can still pass this to customer care for a manual review."
            payload = SupportPayload(
                intent=intent,
                title=self._support_title_for_intent(intent),
                summary=str(eligibility.get("reason") or ""),
                order_reference=order_name,
                customer_email=order_details.get("customer_email") or email,
                fulfillment_status=self._format_support_status(order_details.get("fulfillment_status")),
                financial_status=self._format_support_status(order_details.get("financial_status")),
                line_items=line_items,
                requires_human_review=True,
                actions=self._support_actions_for_intent(intent),
            )
            return reply, intent, ["Speak to support", "Track my order"], False, payload

        support_request, notification_result, assigned_contacts = self._create_order_support_request(
            intent=intent,
            session_id=session_id,
            customer_identifier=customer_identifier,
            shopper_profile=shopper_profile,
            recent_messages=recent_messages,
            message=message,
            customer_care_settings=customer_care_settings,
            order_details=order_details,
            item_title=target_label,
            shopper_email=email,
            requested_size=requested_size,
        )
        lead_name = assigned_contacts[0].name.strip() if assigned_contacts and assigned_contacts[0].name.strip() else "the support team"
        if intent == "exchange_request":
            reply = (
                f"I’ve started an exchange request for {target_label} on {order_name}"
                f"{f' in size {requested_size}' if requested_size else ''}. "
                f"{eligibility.get('reason')} {lead_name} now has the order details."
            )
        elif intent == "refund_query":
            reply = (
                f"I’ve opened a refund review for {target_label} on {order_name}. "
                f"{eligibility.get('reason')} {lead_name} now has the order details."
            )
        else:
            reply = (
                f"I’ve started a return request for {target_label} on {order_name}. "
                f"{eligibility.get('reason')} {lead_name} now has the order details."
            )
        if not (notification_result.email_sent or notification_result.whatsapp_sent):
            reply = f"{reply} I’ve logged it here even though no notification channel is configured yet."

        payload = SupportPayload(
            intent=intent,
            title=self._support_title_for_intent(intent),
            summary=(
                f"{self._support_source_summary(order_details.get('source'), purpose='review')} {str(eligibility.get('reason') or '')}".strip()
            ),
            source=order_details.get("source"),
            order_reference=order_name,
            customer_email=order_details.get("customer_email") or email,
            fulfillment_status=self._format_support_status(order_details.get("fulfillment_status")),
            financial_status=self._format_support_status(order_details.get("financial_status")),
            line_items=line_items,
            requires_human_review=True,
            actions=self._support_actions_for_intent(
                intent,
                tracking_url=order_details.get("status_page_url"),
            ),
        )
        return reply, intent, ["Track my order", "Need more help"], False, payload

    def _handle_product_support(
        self,
        *,
        message: str,
        recent_messages: list[dict],
        shopper_profile,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        product = self._find_support_catalog_match(
            message=message,
            recent_messages=recent_messages,
            required_segment=shopper_profile.segment_preference,
        )
        if product is None:
            reply = self._apply_merchant_voice(
                "Which product do you mean? Send the product name and I’ll pull the closest match from the catalog."
            )
            payload = SupportPayload(
                intent="product_question",
                title="Product help",
                summary="I need the product name before I can answer this properly.",
                requested_fields=["product_name"],
                actions=self._support_actions_for_intent("product_question"),
            )
            return reply, "product_question", [], False, payload

        title = product.get("title") or "That product"
        category = product.get("category") or "catalog item"
        price = product.get("price")
        price_copy = f" It’s currently listed at {price}." if price not in (None, "") else ""
        reply = self._apply_merchant_voice(
            f"{title} is listed under {category}.{price_copy} If you want, I can also help with sizing or send you straight to the product."
        )
        payload = SupportPayload(
            intent="product_question",
            title=title,
            summary=f"Direct product details from the synced catalog.",
            actions=self._support_actions_for_intent(
                "product_question",
                product_url=product.get("product_url"),
            ),
        )
        return reply, "product_question", ["Sizing help", "Returns help"], False, payload

    def _handle_sizing_support(
        self,
        *,
        message: str,
        recent_messages: list[dict],
        shopper_profile,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        product = self._find_support_catalog_match(
            message=message,
            recent_messages=recent_messages,
            required_segment=shopper_profile.segment_preference,
        )
        if product is None:
            reply = self._apply_merchant_voice(
                "Tell me the product name first, and I’ll give you a cleaner size recommendation."
            )
            payload = SupportPayload(
                intent="sizing_question",
                title="Sizing help",
                summary="I need the product name before I can recommend a size.",
                requested_fields=["product_name"],
                actions=self._support_actions_for_intent("sizing_question"),
            )
            return reply, "sizing_question", [], False, payload

        height_cm = self._extract_height_cm(message)
        fit_preference = self._extract_fit_preference(message)
        missing_fields = []
        if height_cm is None:
            missing_fields.append("height")
        if fit_preference is None:
            missing_fields.append("fit_preference")

        if missing_fields:
            if "height" in missing_fields:
                reply = self._apply_merchant_voice(
                    "What’s your height? That will help me narrow the size properly."
                )
                requested_fields = ["height"]
            else:
                reply = self._apply_merchant_voice("Do you want it fitted, regular, or more relaxed?")
                requested_fields = ["fit_preference"]
            payload = SupportPayload(
                intent="sizing_question",
                title=f"Sizing for {product.get('title') or 'this product'}",
                summary="I have the product. I just need one more fit detail.",
                requested_fields=requested_fields,
                actions=self._support_actions_for_intent(
                    "sizing_question",
                    product_url=product.get("product_url"),
                ),
            )
            prompts = ["Fitted", "Regular", "Relaxed"] if requested_fields == ["fit_preference"] else []
            return reply, "sizing_question", prompts, False, payload

        recommendation = self._build_size_recommendation(
            product=product,
            shopper_profile=shopper_profile,
            height_cm=height_cm,
            fit_preference=fit_preference,
        )
        reply = recommendation["reply"]
        payload = SupportPayload(
            intent="sizing_question",
            title=f"Sizing for {product.get('title') or 'this product'}",
            summary=recommendation["summary"],
            actions=self._support_actions_for_intent(
                "sizing_question",
                product_url=product.get("product_url"),
            ),
        )
        return reply, "sizing_question", ["Returns help", "Track my order"], False, payload

    def _handle_general_support(
        self,
    ) -> tuple[str, str, list[str], bool, Optional[SupportPayload]]:
        reply = self._apply_merchant_voice(
            "Sure — what do you need help with: tracking, returns, delivery, product details, or sizing?"
        )
        payload = SupportPayload(
            intent="general_support",
            title="Support help",
            summary="I can point this to the right support flow once I know what you need.",
            actions=self._support_actions_for_intent("general_support"),
        )
        return reply, "general_support", ["Track my order", "Returns help", "Sizing help"], False, payload

    def _missing_support_order_fields(
        self,
        order_reference: Optional[str],
        email: Optional[str],
    ) -> list[str]:
        missing = []
        if not order_reference:
            missing.append("order_reference")
        if not email:
            missing.append("email")
        return missing

    def _support_order_lookup_prompt(self, missing_fields: list[str]) -> str:
        if missing_fields == ["order_reference", "email"]:
            return self._apply_merchant_voice(
                "Can you share both your order number and the email used for the order?"
            )
        if missing_fields == ["order_reference"]:
            return self._apply_merchant_voice("Can you share your order number?")
        return self._apply_merchant_voice("Can you share the email used for the order?")

    def _support_title_for_intent(self, intent: str) -> str:
        mapping = {
            "order_tracking": "Order tracking",
            "return_request": "Return request",
            "exchange_request": "Exchange request",
            "refund_query": "Refund request",
            "shipping_question": "Shipping help",
            "product_question": "Product help",
            "sizing_question": "Sizing help",
            "damage_issue": "Damaged item review",
            "wrong_item_issue": "Wrong item review",
            "general_support": "Support help",
        }
        return mapping.get(intent, "Customer support")

    def _support_verb_for_intent(self, intent: str) -> str:
        mapping = {
            "return_request": "return",
            "exchange_request": "exchange",
            "refund_query": "refund",
        }
        return mapping.get(intent, "review")

    def _support_actions_for_intent(
        self,
        intent: str,
        *,
        tracking_url: Optional[str] = None,
        product_url: Optional[str] = None,
    ) -> list[SupportAction]:
        actions: list[SupportAction] = []
        if tracking_url:
            actions.append(SupportAction(label="Open tracking", kind="link", url=tracking_url))
        if product_url:
            actions.append(SupportAction(label="View product", kind="link", url=product_url))

        prompt_actions = {
            "order_tracking": [
                SupportAction(label="Return an item", prompt="I want to return this order"),
                SupportAction(label="Exchange an item", prompt="I want to exchange an item from this order"),
            ],
            "return_request": [
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Speak to support", prompt="I need to speak to a person"),
            ],
            "exchange_request": [
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Speak to support", prompt="I need to speak to a person"),
            ],
            "refund_query": [
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Speak to support", prompt="I need to speak to a person"),
            ],
            "shipping_question": [
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Returns help", prompt="I need help with a return"),
            ],
            "product_question": [
                SupportAction(label="Sizing help", prompt="I need help with sizing"),
                SupportAction(label="Returns help", prompt="I need help with a return"),
            ],
            "sizing_question": [
                SupportAction(label="Returns help", prompt="I need help with a return"),
                SupportAction(label="Track my order", prompt="Track my order"),
            ],
            "damage_issue": [
                SupportAction(label="Upload a photo", kind="upload"),
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Speak to support", prompt="I need to speak to a person"),
            ],
            "wrong_item_issue": [
                SupportAction(label="Upload a photo", kind="upload"),
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Speak to support", prompt="I need to speak to a person"),
            ],
            "general_support": [
                SupportAction(label="Track my order", prompt="Track my order"),
                SupportAction(label="Returns help", prompt="I need help with a return"),
                SupportAction(label="Sizing help", prompt="I need help with sizing"),
            ],
        }
        actions.extend(prompt_actions.get(intent, []))
        return actions[:3]

    def _support_line_items_from_order(self, order_details: dict) -> list[SupportLineItem]:
        return [
            SupportLineItem(
                title=str(item.get("title") or "Untitled item"),
                quantity=int(item.get("quantity") or 1),
                unit_price=(str(item.get("unit_price")) if item.get("unit_price") not in (None, "") else None),
                image_url=item.get("image_url"),
            )
            for item in (order_details.get("line_items") or [])[:6]
        ]

    def _format_support_status(self, value: Optional[str]) -> str:
        normalized = str(value or "Status unavailable").replace("_", " ").strip()
        return normalized[:1].upper() + normalized[1:] if normalized else "Status unavailable"

    def _support_delivery_hint(self, fulfillment_status: str) -> Optional[str]:
        lowered = str(fulfillment_status or "").lower()
        if "out for delivery" in lowered:
            return "It should arrive very soon."
        if "delivered" in lowered:
            return "It has already been delivered."
        if "fulfilled" in lowered or "in transit" in lowered or "shipped" in lowered:
            return "It’s on the way."
        if "unfulfilled" in lowered:
            return "It hasn’t shipped yet."
        return None

    def _support_source_summary(self, source: Optional[str], *, purpose: str = "tracking") -> str:
        if source == "snapshot":
            if purpose == "tracking":
                return "This is the latest synced order snapshot, so live Shopify tracking is not available right now."
            return "I’m using the latest synced order snapshot while I start the review."
        return "Live order details pulled from Shopify."

    def _support_source_label(self, source: Optional[str]) -> Optional[str]:
        if source == "live":
            return "Live Shopify data"
        if source == "snapshot":
            return "Synced order snapshot"
        return None

    def _format_order_reference(self, order_reference: Optional[str]) -> str:
        if not order_reference:
            return "your order"
        return order_reference if str(order_reference).startswith("#") else f"#{order_reference}"

    def _match_support_order_item(self, order_details: dict, message: str) -> Optional[dict]:
        line_items = order_details.get("line_items") or []
        if len(line_items) == 1:
            return line_items[0]

        message_tokens = set(re.findall(r"[a-z0-9]+", str(message or "").lower()))
        best_item = None
        best_score = 0
        for item in line_items:
            item_tokens = set(re.findall(r"[a-z0-9]+", str(item.get("title") or "").lower()))
            score = len(message_tokens.intersection(item_tokens))
            if score > best_score:
                best_score = score
                best_item = item
        return best_item if best_score > 0 else None

    def _extract_requested_size(self, message: str) -> Optional[str]:
        lowered = str(message or "").lower()
        explicit = re.search(r"\bsize\s+([a-z0-9-]+)\b", lowered)
        if explicit:
            return explicit.group(1).upper()

        standard = re.search(r"\b(xx?s|xs|s|m|l|xl|xxl|xxxl)\b", lowered)
        if standard:
            return standard.group(1).upper()

        numeric = re.search(r"\b(3[0-8]|4[0-8])\b", lowered)
        if numeric:
            return numeric.group(1)
        return None

    def _find_support_catalog_match(
        self,
        *,
        message: str,
        recent_messages: list[dict],
        required_segment: Optional[str],
    ) -> Optional[dict]:
        query_text = " ".join(
            [
                row.get("message", "")
                for row in recent_messages[-3:]
                if row.get("sender") == "customer"
            ] + [message]
        )
        query_tokens = set(re.findall(r"[a-z0-9]+", query_text.lower()))
        if not query_tokens:
            return None

        stop_words = {
            "i", "me", "my", "need", "help", "with", "for", "this", "that", "the", "a", "an",
            "order", "return", "exchange", "refund", "track", "shipping", "size", "sizing",
            "fit", "question", "about", "want", "item", "product",
        }
        useful_tokens = {token for token in query_tokens if token not in stop_words and len(token) > 1}
        if not useful_tokens:
            return None

        best_match = None
        best_score = 0
        for product in self.supabase_service.fetch_catalog_products():
            if required_segment and self.recommendation_service.normalize_product_segment(product) not in {required_segment, "unknown"}:
                continue
            haystack = " ".join(
                [
                    product.get("title", ""),
                    product.get("category", ""),
                    product.get("description", ""),
                    " ".join(product.get("tags", [])),
                ]
            ).lower()
            product_tokens = set(re.findall(r"[a-z0-9]+", haystack))
            score = len(useful_tokens.intersection(product_tokens))
            if score > best_score:
                best_score = score
                best_match = product

        return best_match if best_score > 0 else None

    def _extract_height_cm(self, message: str) -> Optional[int]:
        lowered = str(message or "").lower()
        metric_match = re.search(r"\b(1[4-9]\d|2[0-1]\d)\s?cm\b", lowered)
        if metric_match:
            return int(metric_match.group(1))

        imperial_match = re.search(r"\b([4-7])['’]\s?([0-9]{1,2})\b", lowered)
        if imperial_match:
            feet = int(imperial_match.group(1))
            inches = int(imperial_match.group(2))
            return round((feet * 12 + inches) * 2.54)

        return None

    def _extract_fit_preference(self, message: str) -> Optional[str]:
        lowered = str(message or "").lower()
        if any(token in lowered for token in ["relaxed", "comfort", "comfortable", "loose", "oversized"]):
            return "relaxed"
        if any(token in lowered for token in ["fitted", "slim", "sharp", "tailored"]):
            return "fitted"
        if any(token in lowered for token in ["regular", "standard", "true to size"]):
            return "regular"
        return None

    def _build_size_recommendation(
        self,
        *,
        product: dict,
        shopper_profile,
        height_cm: int,
        fit_preference: str,
    ) -> dict:
        segment = self.recommendation_service.normalize_product_segment(product)
        if segment not in {"menswear", "womenswear"}:
            segment = shopper_profile.segment_preference or "menswear"

        if segment == "womenswear":
            size_scale = ["XS", "S", "M", "L", "XL"]
            if height_cm < 160:
                index = 0
            elif height_cm < 167:
                index = 1
            elif height_cm < 174:
                index = 2
            elif height_cm < 180:
                index = 3
            else:
                index = 4
        else:
            size_scale = ["S", "M", "L", "XL", "XXL"]
            if height_cm < 168:
                index = 0
            elif height_cm < 176:
                index = 1
            elif height_cm < 183:
                index = 2
            elif height_cm < 190:
                index = 3
            else:
                index = 4

        product_text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()
        runs_slim = any(token in product_text for token in ["slim", "tailored", "fitted"])
        runs_relaxed = any(token in product_text for token in ["relaxed", "oversized", "roomy"])

        fitted_index = index
        comfort_index = min(len(size_scale) - 1, index + 1)
        if runs_relaxed:
            fitted_index = max(0, index - 1)
            comfort_index = index
        elif runs_slim:
            comfort_index = min(len(size_scale) - 1, index + 1)

        if fit_preference == "fitted":
            recommended = size_scale[fitted_index]
        elif fit_preference == "relaxed":
            recommended = size_scale[comfort_index]
        else:
            recommended = size_scale[index]

        fit_copy = "slightly slim" if runs_slim else "fairly relaxed" if runs_relaxed else "quite true to size"
        product_title = product.get("title") or "this piece"
        reply = (
            f"{product_title} looks {fit_copy}. I’d recommend size {recommended} for your height, "
            f"and {size_scale[comfort_index]} if you want a bit more room."
        )
        return {
            "reply": reply,
            "summary": f"Built from your height, fit preference, and how the product appears to run.",
        }

    def _create_order_support_request(
        self,
        *,
        intent: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        shopper_profile,
        recent_messages: list[dict],
        message: str,
        customer_care_settings: CustomerCareSettings,
        order_details: dict,
        item_title: str,
        shopper_email: Optional[str],
        requested_size: Optional[str] = None,
    ):
        order_reference = order_details.get("order_name")
        transcript_excerpt = self._build_transcript_excerpt(recent_messages, message)
        request_label = self._support_title_for_intent(intent)
        issue_summary = f"{request_label} for {item_title} on {order_reference or 'the order'}."
        if requested_size:
            issue_summary = f"{issue_summary} Requested size: {requested_size}."
        if message.strip():
            issue_summary = f"{issue_summary} Shopper note: {message.strip()[:160]}"

        assigned_contacts = self._select_support_contacts(customer_care_settings)
        support_request = self.supabase_service.create_support_request(
            session_id=session_id,
            customer_identifier=customer_identifier,
            shopper_email=shopper_email,
            shopper_phone=self._extract_phone_from_messages(recent_messages),
            order_reference=order_reference,
            issue_summary=issue_summary,
            transcript_excerpt=transcript_excerpt,
            assigned_contacts=assigned_contacts,
        )
        notification_result = self.notification_service.notify_support_request(
            support_request=support_request,
            assigned_contacts=assigned_contacts,
            shopper_summary=issue_summary,
            transcript_excerpt=transcript_excerpt,
            shopper_email=shopper_email,
            shopper_phone=self._extract_phone_from_messages(recent_messages),
            order_reference=order_reference,
            support_email_fallback=customer_care_settings.support_email,
        )
        self.supabase_service.update_support_request(
            support_request.id,
            notification_status=self._notification_status(notification_result),
            metadata={
                "request_type": intent,
                "order_name": order_reference,
                "item_title": item_title,
                "requested_size": requested_size,
                "profile_summary": getattr(shopper_profile, "summary", ""),
            },
        )
        return support_request, notification_result, assigned_contacts

    def _is_support_follow_up(self, message: str, recent_messages: list[dict]) -> bool:
        lowered = (message or "").lower()
        if "@" not in lowered and not self._extract_order_reference(message):
            return False

        recent_customer_copy = " ".join(
            row.get("message", "")
            for row in recent_messages[-4:]
            if row.get("sender") == "customer"
        ).lower()
        return any(
            token in recent_customer_copy
            for token in ["track order", "tracking", "order status", "where is my order"]
        )

    def _support_state_requires_input(self, recent_messages: list[dict], recent_events: list[dict]) -> bool:
        assistant_messages = [
            row.get("message", "")
            for row in recent_messages[-4:]
            if row.get("sender") == "assistant" and row.get("mode") == "support"
        ]
        combined = f" {' '.join(assistant_messages).lower()} "
        blocking_cues = [
            " order number and the email ",
            " share your order number ",
            " email used for the order ",
            " which item ",
            " what size would you like ",
            " replacement size ",
            " upload a photo ",
            " send a photo ",
        ]
        if any(cue in combined for cue in blocking_cues):
            return True

        return self._is_handoff_follow_up("", recent_events)

    def _recent_issue_intent(self, recent_messages: list[dict]) -> Optional[str]:
        recent_copy = " ".join(
            row.get("message", "")
            for row in recent_messages[-6:]
            if row.get("message")
        ).lower()
        if any(token in recent_copy for token in ["damaged", "faulty", "broken", "defective"]):
            return "damage_issue"
        if any(token in recent_copy for token in ["wrong item", "incorrect item", "sent the wrong", "received the wrong"]):
            return "wrong_item_issue"
        return None

    def _is_order_tracking_request(
        self,
        message: str,
        recent_messages: list[dict],
        customer_care_settings: CustomerCareSettings,
    ) -> bool:
        if not customer_care_settings.order_tracking_enabled:
            return False

        lowered = (message or "").lower()
        if any(token in lowered for token in ["track order", "tracking", "order status", "where is my order"]):
            return True

        return self._is_support_follow_up(message, recent_messages)

    def _should_trigger_handoff(self, message: str, customer_care_settings: CustomerCareSettings) -> bool:
        if not customer_care_settings.human_handoff_enabled:
            return False

        lowered = (message or "").lower()
        escalation_terms = {
            "human",
            "agent",
            "someone",
            "person",
            "complaint",
            "frustrated",
            "not helpful",
            "speak to support",
            "damaged item",
            "faulty item",
            "wrong item",
        }
        return any(term in lowered for term in escalation_terms)

    def _is_handoff_follow_up(self, message: str, recent_events: list[dict]) -> bool:
        if not recent_events:
            return False

        recent_handoff = any(
            item.get("event_type") in {"human_handoff", "human_handoff_request"}
            for item in recent_events[-4:]
        )
        if not recent_handoff:
            return False

        lowered = (message or "").lower()
        return bool(
            self._extract_email(message)
            or self._extract_phone(message)
            or self._extract_order_reference(message)
            or any(
                token in lowered
                for token in [
                    "my email",
                    "reach me",
                    "contact me",
                    "my number",
                    "order number",
                    "the issue is",
                    "here are the details",
                ]
            )
        )

    def _build_handoff_reply(self, customer_care_settings: CustomerCareSettings) -> str:
        support_email = customer_care_settings.support_email or "info@styledgenie.com"
        support_phone = customer_care_settings.support_phone.strip()
        base_message = customer_care_settings.handoff_message.strip() or (
            f"If this still feels unresolved, email {support_email} with your order number and a short note, and a human support teammate can step in."
        )
        active_contacts = self._contacts_on_shift(customer_care_settings.escalation_contacts)

        if active_contacts:
            contact_copy = " ".join(self._format_contact_line(item) for item in active_contacts[:2])
            return f"{base_message} Right now you can reach {contact_copy}"

        if customer_care_settings.escalation_contacts:
            next_contact = next(
                (
                    item
                    for item in customer_care_settings.escalation_contacts
                    if item.active and item.name.strip() and item.email.strip()
                ),
                None,
            )
            if next_contact:
                shift_copy = self._format_shift_window(next_contact)
                return (
                    f"{base_message} The next available teammate is {next_contact.name.strip()} "
                    f"({next_contact.role.strip() or 'Customer Care'}) at {next_contact.email.strip()} "
                    f"{shift_copy}."
                )

        if support_phone:
            return f"{base_message} You can also call {support_phone} if you prefer."
        return base_message

    def _start_handoff_request(
        self,
        *,
        message: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        recent_messages: list[dict],
        shopper_profile,
        customer_care_settings: CustomerCareSettings,
    ) -> tuple[str, str, list[str], bool]:
        shopper_email = self._extract_email(message) or self._extract_email_from_messages(recent_messages)
        shopper_phone = self._extract_phone(message) or self._extract_phone_from_messages(recent_messages)
        order_reference = self._extract_order_reference(message) or self._extract_order_from_messages(recent_messages)
        issue_summary = self._build_support_issue_summary(message=message, recent_messages=recent_messages)
        transcript_excerpt = self._build_transcript_excerpt(recent_messages, message)
        assigned_contacts = self._select_support_contacts(customer_care_settings)
        support_request = self.supabase_service.create_support_request(
            session_id=session_id,
            customer_identifier=customer_identifier,
            shopper_email=shopper_email,
            shopper_phone=shopper_phone,
            order_reference=order_reference,
            issue_summary=issue_summary,
            transcript_excerpt=transcript_excerpt,
            assigned_contacts=assigned_contacts,
        )
        notification_result = self.notification_service.notify_support_request(
            support_request=support_request,
            assigned_contacts=assigned_contacts,
            shopper_summary=issue_summary,
            transcript_excerpt=transcript_excerpt,
            shopper_email=shopper_email,
            shopper_phone=shopper_phone,
            order_reference=order_reference,
            support_email_fallback=customer_care_settings.support_email,
        )
        self.supabase_service.update_support_request(
            support_request.id,
            notification_status=self._notification_status(notification_result),
            metadata={
                "profile_summary": getattr(shopper_profile, "summary", ""),
                "message": message,
                "email_targets": notification_result.email_targets,
                "whatsapp_targets": notification_result.whatsapp_targets,
                "errors": notification_result.errors,
            },
        )
        reply = self._build_live_handoff_reply(
            customer_care_settings=customer_care_settings,
            support_request=support_request,
            notification_result=notification_result,
            shopper_email=shopper_email,
            order_reference=order_reference,
        )
        prompts = []
        if not shopper_email:
            prompts.append("My email is ...")
        if not order_reference:
            prompts.append("My order number is ...")
        prompts.append("Here are a few more details")
        return reply, "human_handoff", prompts[:3], False

    def _update_handoff_request(
        self,
        *,
        message: str,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        recent_messages: list[dict],
        customer_care_settings: CustomerCareSettings,
    ) -> tuple[str, str, list[str], bool]:
        latest_request = self.supabase_service.fetch_latest_support_request(session_id)
        shopper_email = self._extract_email(message) or self._extract_email_from_messages(recent_messages)
        shopper_phone = self._extract_phone(message) or self._extract_phone_from_messages(recent_messages)
        order_reference = self._extract_order_reference(message) or self._extract_order_from_messages(recent_messages)
        transcript_excerpt = self._build_transcript_excerpt(recent_messages, message)
        issue_summary = self._build_support_issue_summary(message=message, recent_messages=recent_messages)
        assigned_contacts = self._select_support_contacts(customer_care_settings)

        if latest_request and latest_request.get("id"):
            self.supabase_service.update_support_request(
                latest_request["id"],
                shopper_email=shopper_email,
                shopper_phone=shopper_phone,
                order_reference=order_reference,
                issue_summary=issue_summary,
                transcript_excerpt=transcript_excerpt,
            )
            support_request = SupportRequestRecord(
                id=latest_request["id"],
                status=latest_request.get("status") or "open",
                persisted=True,
                assigned_contacts=assigned_contacts,
            )
        else:
            support_request = self.supabase_service.create_support_request(
                session_id=session_id,
                customer_identifier=customer_identifier,
                shopper_email=shopper_email,
                shopper_phone=shopper_phone,
                order_reference=order_reference,
                issue_summary=issue_summary,
                transcript_excerpt=transcript_excerpt,
                assigned_contacts=assigned_contacts,
            )

        notification_result = self.notification_service.notify_support_request(
            support_request=support_request,
            assigned_contacts=assigned_contacts,
            shopper_summary=f"Support request updated: {issue_summary}",
            transcript_excerpt=transcript_excerpt,
            shopper_email=shopper_email,
            shopper_phone=shopper_phone,
            order_reference=order_reference,
            support_email_fallback=customer_care_settings.support_email,
        )
        self.supabase_service.update_support_request(
            support_request.id,
            notification_status=self._notification_status(notification_result),
            metadata={
                "update_message": message,
                "email_targets": notification_result.email_targets,
                "whatsapp_targets": notification_result.whatsapp_targets,
                "errors": notification_result.errors,
            },
        )
        contact_name = assigned_contacts[0].name.strip() if assigned_contacts else "the support team"
        reply = (
            f"Thanks — I’ve added that to your support request and updated {contact_name}. "
            "They now have the latest details from this chat."
        )
        prompts = ["Add anything else they should know", "Track my order", "Returns help"]
        return reply, "human_handoff", prompts, False

    def _build_live_handoff_reply(
        self,
        *,
        customer_care_settings: CustomerCareSettings,
        support_request: SupportRequestRecord,
        notification_result,
        shopper_email: Optional[str],
        order_reference: Optional[str],
    ) -> str:
        assigned_contacts = support_request.assigned_contacts
        primary_contact = assigned_contacts[0] if assigned_contacts else None
        if primary_contact and primary_contact.name.strip():
            lead_copy = f"{primary_contact.name.strip()} from customer care"
        else:
            lead_copy = "the support team"

        channel_parts = []
        if notification_result.email_sent:
            channel_parts.append("email")
        if notification_result.whatsapp_sent:
            channel_parts.append("WhatsApp")
        channel_copy = " and ".join(channel_parts)

        if channel_copy:
            opening = (
                f"I’ve opened a support request and passed this to {lead_copy}. "
                f"They’ve just been notified by {channel_copy} with your chat summary."
            )
        else:
            opening = (
                f"I’ve opened a support request for {lead_copy} and attached this conversation."
            )

        missing_bits = []
        if not shopper_email:
            missing_bits.append("your best email")
        if not order_reference:
            missing_bits.append("your order number")
        if missing_bits:
            closing = f" If you send {self._join_for_sentence(missing_bits)}, I’ll attach that too so they can pick this up faster."
        else:
            closing = " They already have enough detail to follow up from here."

        return f"{opening}{closing}"

    def _select_support_contacts(self, customer_care_settings: CustomerCareSettings) -> list[SupportContact]:
        active_contacts = self._contacts_on_shift(customer_care_settings.escalation_contacts)
        if active_contacts:
            return active_contacts[:2]

        fallback_contact = next(
            (
                item
                for item in customer_care_settings.escalation_contacts
                if item.active and (item.email.strip() or item.phone.strip())
            ),
            None,
        )
        if fallback_contact:
            return [fallback_contact]

        if customer_care_settings.support_email.strip():
            return [
                SupportContact(
                    name="Support team",
                    role="Customer Care",
                    email=customer_care_settings.support_email.strip(),
                    phone=customer_care_settings.support_phone.strip(),
                )
            ]

        return []

    def _build_support_issue_summary(self, *, message: str, recent_messages: list[dict]) -> str:
        recent_customer_messages = [
            row.get("message", "").strip()
            for row in recent_messages[-3:]
            if row.get("sender") == "customer" and row.get("message", "").strip()
        ]
        if message.strip():
            recent_customer_messages.append(message.strip())
        summary_source = " ".join(recent_customer_messages[-3:]).strip()
        if not summary_source:
            return "The shopper asked to speak to someone."
        return summary_source[:320]

    def _build_transcript_excerpt(self, recent_messages: list[dict], latest_message: str) -> str:
        excerpt_rows = recent_messages[-8:]
        lines = [
            f"{(row.get('sender') or 'unknown').title()}: {row.get('message', '').strip()}"
            for row in excerpt_rows
            if row.get("message", "").strip()
        ]
        latest_message = latest_message.strip()
        if latest_message and (not lines or latest_message not in lines[-1]):
            lines.append(f"Customer: {latest_message}")
        transcript = "\n".join(lines)
        return transcript[:1800]

    def _notification_status(self, notification_result) -> str:
        if notification_result.email_sent or notification_result.whatsapp_sent:
            return "sent"
        return "pending_manual_follow_up"

    def _extract_phone(self, message: str) -> Optional[str]:
        match = re.search(r"(\+?[0-9][0-9\s().-]{7,}[0-9])", message or "")
        if not match:
            return None
        return re.sub(r"\s+", " ", match.group(1)).strip()

    def _extract_email_from_messages(self, recent_messages: list[dict]) -> Optional[str]:
        for row in reversed(recent_messages or []):
            email = self._extract_email(row.get("message", ""))
            if email:
                return email
        return None

    def _extract_phone_from_messages(self, recent_messages: list[dict]) -> Optional[str]:
        for row in reversed(recent_messages or []):
            phone = self._extract_phone(row.get("message", ""))
            if phone:
                return phone
        return None

    def _extract_order_from_messages(self, recent_messages: list[dict]) -> Optional[str]:
        for row in reversed(recent_messages or []):
            order_reference = self._extract_order_reference(row.get("message", ""))
            if order_reference:
                return order_reference
        return None

    def _join_for_sentence(self, values: list[str]) -> str:
        cleaned = [item for item in values if item]
        if not cleaned:
            return ""
        if len(cleaned) == 1:
            return cleaned[0]
        if len(cleaned) == 2:
            return f"{cleaned[0]} and {cleaned[1]}"
        return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"

    def _contacts_on_shift(self, contacts: list[SupportContact]) -> list[SupportContact]:
        available = []
        for contact in contacts or []:
            if not contact.active or not contact.name.strip() or not contact.email.strip():
                continue
            if self._is_contact_on_shift(contact):
                available.append(contact)
        return available

    def _is_contact_on_shift(self, contact: SupportContact) -> bool:
        timezone_name = (contact.timezone or "Europe/Berlin").strip() or "Europe/Berlin"
        try:
            now = datetime.now(ZoneInfo(timezone_name))
        except Exception:
            now = datetime.now()

        shift_days = {item.strip().lower() for item in contact.shift_days if item and item.strip()}
        if shift_days and now.strftime("%A").lower() not in shift_days:
            return False

        try:
            start_hour, start_minute = [int(part) for part in contact.shift_start.split(":", 1)]
            end_hour, end_minute = [int(part) for part in contact.shift_end.split(":", 1)]
            start_time = time(start_hour, start_minute)
            end_time = time(end_hour, end_minute)
        except Exception:
            return False

        current_time = now.time()
        if start_time <= end_time:
            return start_time <= current_time <= end_time

        return current_time >= start_time or current_time <= end_time

    def _format_contact_line(self, contact: SupportContact) -> str:
        phone_copy = f" or {contact.phone.strip()}" if contact.phone and contact.phone.strip() else ""
        return (
            f"{contact.name.strip()} ({contact.role.strip() or 'Customer Care'}) at {contact.email.strip()}{phone_copy}."
        )

    def _format_shift_window(self, contact: SupportContact) -> str:
        days = ", ".join(contact.shift_days[:3]) if contact.shift_days else "their shift window"
        timezone_copy = contact.timezone.strip() if contact.timezone else "local time"
        return f"during {days} between {contact.shift_start} and {contact.shift_end} {timezone_copy}"

    def _extract_email(self, message: str) -> Optional[str]:
        match = re.search(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", message or "", re.IGNORECASE)
        if not match:
            return None
        return match.group(1).strip().lower()

    def _extract_order_reference(self, message: str) -> Optional[str]:
        if not message:
            return None

        explicit_match = re.search(
            r"(?:order\s*(?:number|no\.?|#)?\s*(?:is|:)?\s*)(#?(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,})",
            message,
            re.IGNORECASE,
        )
        if explicit_match:
            return explicit_match.group(1).strip().lstrip("#")

        hash_match = re.search(r"(#(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,})", message, re.IGNORECASE)
        if hash_match:
            return hash_match.group(1).strip().lstrip("#")

        numeric_match = re.search(r"\b(\d{4,})\b", message)
        if numeric_match:
            return numeric_match.group(1).strip()

        return None

    def _load_saved_style_profile(
        self,
        *,
        customer_id: Optional[str],
        customer_email: Optional[str],
        account_display_name: Optional[str],
        style_profile_id: Optional[str],
    ) -> Optional[StyleProfile]:
        normalized_style_profile_id = str(style_profile_id or "").strip()
        if normalized_style_profile_id in {"__manual_profile__", "__someone_else__"}:
            return None

        if not customer_id and not customer_email:
            return None

        try:
            profiles_response = self.supabase_service.fetch_customer_style_profiles(
                customer_identifier=customer_id,
                customer_email=customer_email,
                account_display_name=account_display_name,
            )
        except Exception:
            return None

        profiles = profiles_response.profiles or []
        if not profiles:
            return None

        if normalized_style_profile_id:
            for profile in profiles:
                if str(profile.id or "").strip() == normalized_style_profile_id:
                    return profile

        for profile in profiles:
            if profile.isPrimary:
                return profile

        return profiles[0]

    def _refinement_prompt_for_feedback(self, feedback_type: str) -> str:
        mapping = {
            "show_another_option": "Keep the same occasion and budget, but take it in a different direction.",
            "make_more_casual": "Lean more relaxed, easy, and everyday.",
            "change_colours": "Keep the same outfit logic, but shift the colour story.",
        }
        return mapping.get(feedback_type, "")

    def _refinement_terms(self, feedback_type: Optional[str]) -> list[str]:
        mapping = {
            "show_another_option": ["alternative", "compare"],
            "make_more_casual": ["casual", "easy", "relaxed"],
            "change_colours": ["colour", "palette", "neutral"],
        }
        return mapping.get(feedback_type or "", [])
