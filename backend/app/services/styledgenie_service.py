import logging
import re
from typing import Optional

from app.models.schemas import (
    ActionChip,
    ChatRequest,
    ChatResponse,
    GapAnalysis,
    ImageRequest,
    ProductRecommendation,
    StylingInsight,
    ValidationResult,
    VisualSummary,
)
from app.services.faq_service import FAQService
from app.services.openai_service import OpenAIService
from app.services.recommendation_service import RecommendationService
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionService

try:  # pragma: no cover - optional dependency for richer orchestration
    from langchain_core.runnables import RunnableLambda
except ImportError:  # pragma: no cover - local fallback when LangChain is unavailable
    RunnableLambda = None


logger = logging.getLogger(__name__)


class StyledGenieService:
    support_intent_map = {
        "order_tracking": [
            "track my order",
            "track order",
            "order tracking",
            "where is my order",
            "order status",
            "track shipment",
        ],
        "return_request": ["return", "start a return", "send back"],
        "exchange_request": ["exchange", "replacement", "swap size"],
        "refund_query": ["refund", "money back"],
        "shipping_question": ["shipping", "delivery", "arrive", "customs"],
        "product_question": ["material", "fabric", "product details", "product question"],
        "sizing_question": ["size", "sizing", "fit", "measurements"],
        "damage_issue": ["damaged", "broken", "faulty", "defect", "tear", "stain"],
        "wrong_item_issue": ["wrong item", "incorrect item", "different item"],
    }
    occasion_map = {
        "dinner": ["dinner", "date night", "tonight"],
        "work": ["work", "office", "meeting"],
        "weekend": ["weekend", "brunch", "day off"],
        "party": ["party", "night out"],
        "wedding": ["wedding", "guest"],
        "travel": ["travel", "airport", "holiday"],
        "event": ["event", "occasion"],
    }
    weather_map = {
        "cold": ["cold", "chilly", "winter", "freezing"],
        "warm": ["warm", "mild", "spring"],
        "hot": ["hot", "heat", "summer"],
        "rainy": ["rain", "rainy", "wet"],
    }
    vibe_map = {
        "easy": ["easy", "effortless"],
        "casual": ["casual", "relaxed"],
        "sharp": ["sharp", "tailored"],
        "premium": ["premium", "luxury", "elevated"],
        "polished": ["polished", "smart"],
    }
    stop_words = {
        "the",
        "and",
        "for",
        "with",
        "this",
        "that",
        "you",
        "your",
        "need",
        "want",
        "something",
        "help",
        "look",
        "outfit",
        "please",
    }

    def __init__(self) -> None:
        self.openai_service = OpenAIService()
        self.vision_service = VisionService()
        self.recommendation_service = RecommendationService()
        self.faq_service = FAQService()
        self.shopify_service = ShopifyService()
        self.supabase_service = SupabaseService()
        self._router_chain = RunnableLambda(self._route_payload) if RunnableLambda else None

    def handle_chat(self, payload: ChatRequest) -> ChatResponse:
        route = self._route(payload.message, payload.mode)
        if route["mode"] == "support":
            visual_summary = None
            if payload.image_name or payload.image_base64:
                visual_summary = self.vision_service.analyze_fashion_image(
                    image_name=payload.image_name or "support-upload",
                    shopper_note=payload.message,
                    image_base64=payload.image_base64,
                    support_mode=True,
                )
            return self._support_response(
                message=payload.message,
                detected_intent=route["intent"],
                visual_summary=visual_summary,
            )

        return self._outfit_response(payload)

    def handle_image_request(self, mode: str, payload: ImageRequest) -> ChatResponse:
        shopper_note = (payload.shopper_note or "").strip()
        visual_summary = self.vision_service.analyze_fashion_image(
            image_name=payload.image_name,
            shopper_note=shopper_note,
            image_base64=payload.image_base64,
            support_mode=False,
        )

        if mode == "complete_the_look":
            return self._complete_look_response(payload=payload, visual_summary=visual_summary)

        return self._inspiration_response(payload=payload, visual_summary=visual_summary)

    def _route(self, message: str, requested_mode: str) -> dict:
        payload = {"message": message, "mode": requested_mode}
        if self._router_chain is not None:
            return self._router_chain.invoke(payload)
        return self._route_payload(payload)

    def _route_payload(self, payload: dict) -> dict:
        requested_mode = (payload.get("mode") or "outfit_curation").strip() or "outfit_curation"
        lowered = (payload.get("message") or "").lower()
        support_intent = self._detect_support_intent(lowered)
        if requested_mode == "support" or support_intent:
            return {"mode": "support", "intent": support_intent or "support_question"}
        if requested_mode in {"get_inspired", "complete_the_look"}:
            return {"mode": requested_mode, "intent": requested_mode}
        return {"mode": "outfit_curation", "intent": "find_my_outfit"}

    def _outfit_response(self, payload: ChatRequest) -> ChatResponse:
        workspace = self.supabase_service.fetch_workspace_snapshot()
        settings = workspace.chatbot_customization
        context = self._parse_context(payload.message)
        prioritization = self._resolve_prioritization(payload.message, settings.product_prioritization)
        strictness = settings.recommendation_strictness or "balanced"
        decision_preference = payload.decision_preference or self._decision_default(settings)
        terms = self._build_terms(payload.message, context=context)

        if payload.swap_category and payload.locked_product_ids:
            recommendations = self._swap_single_category(
                terms=terms,
                swap_category=payload.swap_category,
                locked_product_ids=payload.locked_product_ids,
                excluded_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
            )
            reply = (
                "I kept the rest intact and switched only the "
                f"{self.recommendation_service.bucket_label(self.recommendation_service.normalize_bucket(payload.swap_category)).lower()}."
            )
            follow_up = None
        else:
            bucket_plan = self._outfit_bucket_plan(context)
            candidate_products = self.recommendation_service.recommend_products_for_buckets(
                terms=terms,
                buckets=bucket_plan,
                exclude_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
                complementary=False,
            )
            if not candidate_products and strictness != "strict":
                candidate_products = self.recommendation_service.recommend_products(
                    terms=terms,
                    limit=4,
                    exclude_product_ids=payload.excluded_product_ids,
                    prioritization=prioritization,
                )

            ai_reply, selected_products, _, ai_follow_up = self.openai_service.style_recommendations(
                mode="outfit_curation",
                shopper_message=payload.message,
                detected_tags=terms,
                candidate_products=candidate_products,
            )
            recommendations = selected_products or candidate_products[:4]
            reply = self._compose_outfit_reply(context, decision_preference, ai_reply)
            follow_up = ai_follow_up or self._outfit_follow_up(context)

        styling_insights = self._build_outfit_insights(context, recommendations)
        recommendations, styling_insights, validation = self._repair_and_validate(
            mode="outfit_curation",
            terms=terms,
            context=context,
            recommendations=recommendations,
            styling_insights=styling_insights,
            handling_mode=settings.strict_mode_handling,
        )
        decision_prompt, decision_options = self._decision_controls(decision_preference)

        return ChatResponse(
            reply=reply,
            mode="outfit_curation",
            support_mode=False,
            detected_intent="find_my_outfit",
            clarification_needed=bool(follow_up),
            follow_up_question=follow_up,
            recommended_products=recommendations,
            detected_tags=self._display_tags_from_context(context, terms),
            styling_insights=styling_insights,
            decision_prompt=decision_prompt,
            decision_options=decision_options,
            refinement_actions=self._outfit_refinement_actions(),
            swap_actions=self._swap_actions(recommendations),
            validation=validation,
        )

    def _complete_look_response(self, payload: ImageRequest, visual_summary: VisualSummary) -> ChatResponse:
        workspace = self.supabase_service.fetch_workspace_snapshot()
        settings = workspace.chatbot_customization
        shopper_note = (payload.shopper_note or "").strip()
        context = self._parse_context(shopper_note, visual_summary=visual_summary)
        prioritization = self._resolve_prioritization(shopper_note, settings.product_prioritization)
        strictness = settings.recommendation_strictness or "balanced"
        terms = self._build_terms(shopper_note or payload.image_name, context=context, visual_summary=visual_summary)
        gap_analysis = self._gap_analysis(visual_summary)

        if payload.swap_category and payload.locked_product_ids:
            recommendations = self._swap_single_category(
                terms=terms,
                swap_category=payload.swap_category,
                locked_product_ids=payload.locked_product_ids,
                excluded_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
            )
            reply = (
                "I kept your anchor intact and refreshed just the "
                f"{self.recommendation_service.bucket_label(self.recommendation_service.normalize_bucket(payload.swap_category)).lower()}."
            )
        else:
            recommendations = self.recommendation_service.recommend_products_for_buckets(
                terms=terms,
                buckets=gap_analysis.recommended_focus,
                exclude_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
                complementary=True,
            )
            if not recommendations and strictness != "strict":
                recommendations = self.recommendation_service.recommend_products(
                    terms=terms,
                    complementary=True,
                    limit=4,
                    exclude_product_ids=payload.excluded_product_ids,
                    prioritization=prioritization,
                )
            reply = self._compose_complete_reply(visual_summary, context)

        styling_insights = self._build_complete_insights(context, visual_summary, recommendations, gap_analysis)
        recommendations, styling_insights, validation = self._repair_and_validate(
            mode="complete_the_look",
            terms=terms,
            context=context,
            visual_summary=visual_summary,
            recommendations=recommendations,
            styling_insights=styling_insights,
            gap_analysis=gap_analysis,
            handling_mode=settings.strict_mode_handling,
        )
        follow_up = self._image_follow_up(context, visual_summary)

        return ChatResponse(
            reply=reply,
            mode="complete_the_look",
            support_mode=False,
            detected_intent="complete_my_look",
            clarification_needed=bool(follow_up),
            follow_up_question=follow_up,
            recommended_products=recommendations,
            detected_tags=self.vision_service.detect_fashion_elements(
                payload.image_name,
                shopper_note=shopper_note,
                image_base64=payload.image_base64,
            ),
            styling_insights=styling_insights,
            refinement_actions=self._complete_refinement_actions(),
            swap_actions=self._swap_actions(recommendations),
            visual_summary=visual_summary,
            gap_analysis=gap_analysis,
            validation=validation,
        )

    def _inspiration_response(self, payload: ImageRequest, visual_summary: VisualSummary) -> ChatResponse:
        workspace = self.supabase_service.fetch_workspace_snapshot()
        settings = workspace.chatbot_customization
        shopper_note = (payload.shopper_note or "").strip()
        context = self._parse_context(shopper_note, visual_summary=visual_summary)
        prioritization = self._resolve_prioritization(shopper_note, settings.product_prioritization)
        terms = self._build_terms(shopper_note or payload.image_name, context=context, visual_summary=visual_summary)
        hero_bucket = self.recommendation_service.normalize_bucket(visual_summary.hero_item or visual_summary.garment_type)

        if payload.swap_category and payload.locked_product_ids:
            swapped = self._swap_single_category(
                terms=terms,
                swap_category=payload.swap_category,
                locked_product_ids=payload.locked_product_ids,
                excluded_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
            )
            hero_product, supporting_items = self._split_hero_and_support(swapped, hero_bucket)
            reply = (
                "I kept the main match in place and updated only the "
                f"{self.recommendation_service.bucket_label(self.recommendation_service.normalize_bucket(payload.swap_category)).lower()}."
            )
        else:
            hero_candidates = self.recommendation_service.recommend_for_bucket(
                terms=terms,
                bucket=hero_bucket,
                limit=1,
                exclude_product_ids=payload.excluded_product_ids,
                prioritization=prioritization,
            )
            hero_product = (
                hero_candidates[0].model_copy(
                    update={
                        "is_primary": True,
                        "slot": hero_bucket,
                        "slot_label": self.recommendation_service.bucket_label(hero_bucket),
                    }
                )
                if hero_candidates
                else None
            )
            supporting_items = self.recommendation_service.recommend_products_for_buckets(
                terms=terms,
                buckets=self._supporting_buckets_for_hero(hero_bucket),
                exclude_product_ids=(payload.excluded_product_ids or []) + ([hero_product.id] if hero_product else []),
                prioritization=prioritization,
                complementary=True,
            )
            reply = self._compose_inspiration_reply(visual_summary, hero_product)

        combined_products = ([hero_product] if hero_product else []) + supporting_items
        styling_insights = self._build_inspiration_insights(context, visual_summary, hero_product, supporting_items)
        combined_products, styling_insights, validation = self._repair_and_validate(
            mode="get_inspired",
            terms=terms,
            context=context,
            visual_summary=visual_summary,
            recommendations=combined_products,
            styling_insights=styling_insights,
            hero_bucket=hero_bucket,
            handling_mode=settings.strict_mode_handling,
        )
        hero_product, supporting_items = self._split_hero_and_support(combined_products, hero_bucket)

        return ChatResponse(
            reply=reply,
            mode="get_inspired",
            support_mode=False,
            detected_intent="get_inspired",
            clarification_needed=False,
            follow_up_question=None,
            recommended_products=combined_products,
            detected_tags=self.vision_service.detect_fashion_elements(
                payload.image_name,
                shopper_note=shopper_note,
                image_base64=payload.image_base64,
            ),
            styling_insights=styling_insights,
            refinement_actions=self._inspiration_refinement_actions(),
            swap_actions=self._swap_actions(supporting_items),
            visual_summary=visual_summary,
            hero_product=hero_product,
            supporting_items=supporting_items,
            validation=validation,
        )

    def _support_response(
        self,
        message: str,
        detected_intent: str,
        visual_summary: Optional[VisualSummary] = None,
    ) -> ChatResponse:
        workspace = self.supabase_service.fetch_workspace_snapshot()
        settings = workspace.chatbot_customization
        order_reference = self._extract_order_reference(message)
        customer_email = self._extract_email(message)
        reply = "I can help with that."
        follow_up = None
        support_actions: list[ActionChip] = []

        if detected_intent == "order_tracking":
            if not order_reference and not customer_email:
                reply = "I can help with that. Can you share the order number or the email used for the order?"
                follow_up = "Share the order number or the order email and I’ll check the status right away."
                support_actions = [
                    ActionChip(key="share_order_number", label="Share order number", action_type="support", value="order_number"),
                    ActionChip(key="share_order_email", label="Use order email", action_type="support", value="customer_email"),
                ]
            else:
                order_status = None
                try:
                    order_status = self.shopify_service.fetch_order_status(order_reference, customer_email)
                except Exception as error:
                    logger.warning("Order tracking lookup failed. %s", error)
                if order_status is not None:
                    reply = self._compose_order_tracking_reply(order_status)
                    support_actions = [
                        ActionChip(
                            key="track_shipment",
                            label="Track shipment",
                            action_type="link",
                            value=order_status.get("status_page_url"),
                        ),
                        ActionChip(key="return_item", label="Return item", action_type="support", value="return_request"),
                        ActionChip(key="need_help", label="Need help with this order", action_type="support", value="order_help"),
                    ]
                else:
                    reply = (
                        "I couldn’t locate that order yet. Double-check the order number and the email used at checkout, "
                        "and I’ll try again."
                    )
                    support_actions = [
                        ActionChip(key="retry_order_number", label="Retry with order number", action_type="support", value="order_number"),
                        ActionChip(key="retry_order_email", label="Retry with order email", action_type="support", value="customer_email"),
                    ]
        elif detected_intent in {"return_request", "exchange_request"}:
            if not order_reference and not customer_email:
                reply = (
                    "I can help with that. Share the order number or the email used for the order so I can guide the next step."
                )
                follow_up = "Send the order number or order email and, if you know it, the item you want to return or exchange."
                support_actions = [
                    ActionChip(key="find_order", label="Find my order", action_type="support", value="order_lookup"),
                    ActionChip(key="refund_instead", label="Refund instead", action_type="support", value="refund_query"),
                ]
            else:
                action_label = "exchange" if detected_intent == "exchange_request" else "return"
                reply = (
                    f"I can help you start that {action_label}. Tell me which item from the order you mean and I’ll keep the flow short."
                )
                support_actions = [
                    ActionChip(key="refund_option", label="Refund this item", action_type="support", value="refund_query"),
                    ActionChip(key="exchange_option", label="Exchange this item", action_type="support", value="exchange_request"),
                ]
        elif detected_intent == "sizing_question":
            matched_product = self._closest_catalog_product(message)
            if matched_product is None:
                reply = (
                    "I can help with sizing. Tell me which product you mean, and if you prefer a closer or easier fit, "
                    "I’ll keep the advice direct."
                )
                follow_up = "Which product are you looking at?"
            else:
                reply = self._compose_sizing_reply(matched_product, workspace.catalog_intelligence.fit_guidance)
                support_actions = [
                    ActionChip(key="view_product", label="Open product page", action_type="link", value=matched_product.product_url),
                    ActionChip(key="compare_size", label="Compare another size", action_type="support", value="sizing_follow_up"),
                ]
        elif detected_intent in {"damage_issue", "wrong_item_issue"}:
            routing_email = settings.support_routing_email or "info@styledgenie.com"
            reply = (
                "I can help with that. Please share the order number or order email and keep the photo handy so we can review it quickly."
            )
            if visual_summary and visual_summary.issue_type:
                reply += " The image does look consistent with a visible issue, so this is ready for a fast support handoff."
            support_actions = [
                ActionChip(key="share_order", label="Share order number", action_type="support", value="order_number"),
                ActionChip(key="email_support", label="Email support", action_type="support", value=routing_email),
            ]
        else:
            reply = self.faq_service.answer_question(message)
            support_actions = self._default_support_actions(detected_intent)

        return ChatResponse(
            reply=reply,
            mode="support",
            support_mode=True,
            detected_intent=detected_intent,
            clarification_needed=bool(follow_up),
            follow_up_question=follow_up,
            recommended_products=[],
            detected_tags=visual_summary.visible_items if visual_summary else [],
            styling_insights=[],
            support_actions=[action for action in support_actions if action.value or action.action_type != "link"],
            visual_summary=visual_summary,
            validation=ValidationResult(status="pass", checks=["support_mode_separated"], notes=[]),
        )

    def _parse_context(self, message: str, visual_summary: Optional[VisualSummary] = None) -> dict:
        lowered = (message or "").lower()
        context = {
            "occasion": None,
            "weather": None,
            "budget": None,
            "vibe": [],
            "style_mode": visual_summary.styling_mode if visual_summary else None,
            "urgency": None,
            "polish": None,
            "confidence": "medium",
        }

        for label, variants in self.occasion_map.items():
            if any(variant in lowered for variant in variants):
                context["occasion"] = label
                break

        for label, variants in self.weather_map.items():
            if any(variant in lowered for variant in variants):
                context["weather"] = label
                break

        if re.search(r"\btonight\b|\basap\b|\bright now\b", lowered):
            context["urgency"] = "high"
        elif re.search(r"\btomorrow\b|\bthis week\b", lowered):
            context["urgency"] = "medium"

        if any(token in lowered for token in ["not sure", "help", "confused"]):
            context["confidence"] = "low"

        if any(token in lowered for token in ["polished", "sharp", "smart", "tailored"]):
            context["polish"] = "polished"
        elif any(token in lowered for token in ["easy", "casual", "relaxed", "comfortable"]):
            context["polish"] = "easy"

        for label, variants in self.vibe_map.items():
            if any(variant in lowered for variant in variants):
                context["vibe"].append(label)

        budget_match = re.search(r"(?:under|below|less than|max(?:imum)?|budget(?: of)?)\s*[€$£]?\s*(\d{2,4})", lowered)
        if budget_match is None:
            budget_match = re.search(r"[€$£]\s*(\d{2,4})", lowered)
        if budget_match is not None:
            try:
                context["budget"] = int(budget_match.group(1))
            except ValueError:
                context["budget"] = None

        if context["style_mode"] is None:
            if any(token in lowered for token in ["women", "womens", "womenswear", "female"]):
                context["style_mode"] = "womenswear"
            elif any(token in lowered for token in ["men", "mens", "menswear", "male"]):
                context["style_mode"] = "menswear"

        return context

    def _build_terms(
        self,
        message: str,
        context: dict,
        visual_summary: Optional[VisualSummary] = None,
    ) -> list[str]:
        tokens = [
            token
            for token in re.findall(r"[a-z0-9#€$£-]+", (message or "").lower())
            if len(token) > 2 and token not in self.stop_words
        ]
        terms: list[str] = []
        for item in tokens:
            if item not in terms:
                terms.append(item)

        for key in ["occasion", "weather", "style_mode", "polish"]:
            value = context.get(key)
            if value and value not in terms:
                terms.append(value)
        for item in context.get("vibe") or []:
            if item not in terms:
                terms.append(item)

        if visual_summary is not None:
            visual_terms = [
                visual_summary.anchor_item,
                visual_summary.hero_item,
                visual_summary.garment_type,
                visual_summary.style_direction,
                visual_summary.framing,
                *(visual_summary.color_palette or []),
                *(visual_summary.silhouette_cues or []),
                *(visual_summary.visible_items or []),
            ]
            for item in visual_terms:
                clean = (item or "").strip().lower()
                if clean and clean not in terms:
                    terms.append(clean)
        return terms[:18]

    def _resolve_prioritization(self, message: str, default: str) -> str:
        lowered = (message or "").lower()
        if any(token in lowered for token in ["premium", "luxury", "elevated"]):
            return "more_premium"
        if any(token in lowered for token in ["budget", "affordable", "cheaper", "less expensive", "more affordable"]):
            return "more_accessible"
        return default or "best_match"

    def _outfit_bucket_plan(self, context: dict) -> list[str]:
        buckets = ["tops", "bottoms", "footwear"]
        if context.get("weather") in {"cold", "rainy"}:
            buckets.insert(2, "outerwear")
        if context.get("occasion") == "party":
            buckets = ["tops", "bottoms", "footwear", "accessories"]
        return buckets[:4]

    def _gap_analysis(self, visual_summary: VisualSummary) -> GapAnalysis:
        anchor_bucket = self.recommendation_service.normalize_bucket(visual_summary.anchor_item or visual_summary.garment_type)
        visible_buckets = {self.recommendation_service.normalize_bucket(item) for item in (visual_summary.visible_items or [])}
        rules = {
            "tops": ["bottoms", "footwear", "outerwear", "accessories"],
            "bottoms": ["tops", "footwear", "outerwear"],
            "outerwear": ["tops", "bottoms", "footwear"],
            "dresswear": ["footwear", "accessories", "outerwear"],
            "footwear": ["tops", "bottoms", "outerwear"],
        }
        recommended_focus = []
        for bucket in rules.get(anchor_bucket, ["tops", "bottoms", "footwear"]):
            if bucket in visible_buckets:
                continue
            recommended_focus.append(bucket)

        present = [self.recommendation_service.bucket_label(bucket) for bucket in sorted(visible_buckets or {anchor_bucket})]
        missing = [self.recommendation_service.bucket_label(bucket) for bucket in recommended_focus]

        return GapAnalysis(
            present=present,
            missing=missing,
            recommended_focus=recommended_focus,
            anchor_category=anchor_bucket,
        )

    def _supporting_buckets_for_hero(self, hero_bucket: str) -> list[str]:
        if hero_bucket == "dresswear":
            return ["footwear", "accessories", "outerwear"]
        if hero_bucket == "outerwear":
            return ["tops", "bottoms", "footwear"]
        if hero_bucket == "bottoms":
            return ["tops", "footwear", "outerwear"]
        return ["bottoms", "footwear", "outerwear"]

    def _swap_single_category(
        self,
        terms: list[str],
        swap_category: str,
        locked_product_ids: list[str],
        excluded_product_ids: list[str],
        prioritization: str,
    ) -> list[ProductRecommendation]:
        target_bucket = self.recommendation_service.normalize_bucket(swap_category)
        locked_items = self.recommendation_service.fetch_products_by_ids(locked_product_ids)
        keep_items = []
        removed_ids = []

        for item in locked_items:
            item_bucket = self._product_bucket(item)
            if item_bucket == target_bucket:
                removed_ids.append(item.id)
                continue
            keep_items.append(item)

        replacement = self.recommendation_service.recommend_for_bucket(
            terms=terms + [target_bucket],
            bucket=target_bucket,
            limit=1,
            exclude_product_ids=(excluded_product_ids or []) + removed_ids + [item.id for item in keep_items],
            prioritization=prioritization,
            complementary=True,
        )
        return keep_items + replacement

    def _split_hero_and_support(
        self,
        recommendations: list[ProductRecommendation],
        hero_bucket: str,
    ) -> tuple[Optional[ProductRecommendation], list[ProductRecommendation]]:
        hero_product = None
        supporting_items = []
        for item in recommendations:
            bucket = self._product_bucket(item)
            if hero_product is None and bucket == hero_bucket:
                hero_product = item.model_copy(update={"is_primary": True})
            else:
                supporting_items.append(item)

        if hero_product is None and recommendations:
            hero_product = recommendations[0].model_copy(update={"is_primary": True})
            supporting_items = recommendations[1:]

        return hero_product, supporting_items

    def _product_bucket(self, product: ProductRecommendation) -> str:
        slot_value = (product.slot or "").strip().lower()
        if slot_value and slot_value != "general":
            return self.recommendation_service.normalize_bucket(slot_value)
        return self.recommendation_service.normalize_bucket(product.category)

    def _build_outfit_insights(self, context: dict, recommendations: list[ProductRecommendation]) -> list[StylingInsight]:
        palette = self._palette_from_recommendations(recommendations)
        occasion = context.get("occasion") or "the plan"
        polish = "sharper" if context.get("polish") == "polished" else "easy"
        return [
            StylingInsight(
                title="Occasion fit",
                detail=f"This reads right for {occasion} because the mix feels polished enough without becoming overworked.",
            ),
            StylingInsight(
                title="Colour reasoning",
                detail=f"The palette stays centred on {palette}, which keeps the look cohesive and much easier to wear with confidence.",
            ),
            StylingInsight(
                title="Silhouette balance",
                detail="The categories balance each other, so the outfit feels intentionally styled rather than pieced together.",
            ),
            StylingInsight(
                title="Practical benefit",
                detail=f"It lands {polish}, wearable, and realistic for tonight instead of feeling overdressed for the brief.",
            ),
        ]

    def _build_complete_insights(
        self,
        context: dict,
        visual_summary: VisualSummary,
        recommendations: list[ProductRecommendation],
        gap_analysis: GapAnalysis,
    ) -> list[StylingInsight]:
        palette = ", ".join(visual_summary.color_palette or ["a neutral palette"])
        anchor = visual_summary.anchor_item or "your anchor piece"
        return [
            StylingInsight(
                title="What I’m seeing",
                detail=f"I’m building this around {anchor} with a {visual_summary.style_direction or 'clean'} direction and a {palette} colour story.",
            ),
            StylingInsight(
                title="What’s missing",
                detail=f"The quickest way to complete it is by adding {', '.join(gap_analysis.missing[:3]).lower()} so it feels finished rather than half-styled.",
            ),
            StylingInsight(
                title="Here’s how I’d complete it",
                detail="I’m only adding the missing roles, keeping the existing piece as the anchor so the outfit stays coherent.",
            ),
            StylingInsight(
                title="Why this works",
                detail="The added pieces stay in the same palette family and balance the shape instead of duplicating what is already visible.",
            ),
        ]

    def _build_inspiration_insights(
        self,
        context: dict,
        visual_summary: VisualSummary,
        hero_product: Optional[ProductRecommendation],
        supporting_items: list[ProductRecommendation],
    ) -> list[StylingInsight]:
        hero_title = hero_product.title if hero_product else "the closest main match"
        palette = ", ".join(visual_summary.color_palette or ["the same tone family"])
        return [
            StylingInsight(
                title="Closest hero match",
                detail=f"{hero_title} is the strongest catalog match because it mirrors the same garment direction before anything else gets added.",
            ),
            StylingInsight(
                title="Colour story",
                detail=f"The supporting pieces stay close to {palette}, which keeps the result visually loyal to the reference image.",
            ),
            StylingInsight(
                title="Silhouette balance",
                detail="The extra pieces support the hero item without pulling focus away from it, so the outfit still feels intentional.",
            ),
            StylingInsight(
                title="Why this works",
                detail="You get the inspiration look translated into a clear shopping path instead of a loose mood board.",
            ),
        ]

    def _repair_and_validate(
        self,
        mode: str,
        terms: list[str],
        context: dict,
        recommendations: list[ProductRecommendation],
        styling_insights: list[StylingInsight],
        visual_summary: Optional[VisualSummary] = None,
        gap_analysis: Optional[GapAnalysis] = None,
        hero_bucket: Optional[str] = None,
        handling_mode: str = "repair_then_retry",
    ) -> tuple[list[ProductRecommendation], list[StylingInsight], ValidationResult]:
        validation = self._validate(
            mode=mode,
            context=context,
            recommendations=recommendations,
            styling_insights=styling_insights,
            visual_summary=visual_summary,
            gap_analysis=gap_analysis,
            hero_bucket=hero_bucket,
        )
        repaired = list(recommendations)
        repaired_insights = list(styling_insights)

        if handling_mode == "fail_fast" and validation.status != "pass":
            return repaired[:4], repaired_insights[:4], validation

        if validation.status != "pass":
            if len({item.id for item in repaired}) != len(repaired):
                seen = set()
                deduped = []
                for item in repaired:
                    if item.id in seen:
                        continue
                    seen.add(item.id)
                    deduped.append(item)
                repaired = deduped

            if mode in {"outfit_curation", "complete_the_look"} and context.get("weather") in {"cold", "rainy"}:
                if not any(self._product_bucket(item) == "outerwear" for item in repaired):
                    outerwear = self.recommendation_service.recommend_for_bucket(
                        terms=terms + ["outerwear"],
                        bucket="outerwear",
                        limit=1,
                        exclude_product_ids=[item.id for item in repaired],
                        prioritization="best_match",
                        complementary=True,
                    )
                    if outerwear:
                        repaired.append(outerwear[0])

            if mode == "complete_the_look" and gap_analysis is not None:
                anchor_bucket = gap_analysis.anchor_category or "general"
                if any(self._product_bucket(item) == anchor_bucket and anchor_bucket != "general" for item in repaired):
                    repaired = [item for item in repaired if self._product_bucket(item) != anchor_bucket]
                    replacement = self.recommendation_service.recommend_products_for_buckets(
                        terms=terms,
                        buckets=gap_analysis.recommended_focus,
                        exclude_product_ids=[item.id for item in repaired],
                        prioritization="best_match",
                        complementary=True,
                    )
                    for item in replacement:
                        if item.id not in {existing.id for existing in repaired}:
                            repaired.append(item)

            if mode == "get_inspired" and hero_bucket:
                hero_product, supporting_items = self._split_hero_and_support(repaired, hero_bucket)
                if hero_product is None or self._product_bucket(hero_product) != hero_bucket:
                    hero_candidates = self.recommendation_service.recommend_for_bucket(
                        terms=terms,
                        bucket=hero_bucket,
                        limit=1,
                        exclude_product_ids=[item.id for item in repaired],
                        prioritization="best_match",
                    )
                    if hero_candidates:
                        repaired = hero_candidates[:1] + supporting_items

            if len(repaired_insights) < 3:
                if mode == "outfit_curation":
                    repaired_insights = self._build_outfit_insights(context, repaired)
                elif mode == "complete_the_look" and visual_summary and gap_analysis:
                    repaired_insights = self._build_complete_insights(context, visual_summary, repaired, gap_analysis)
                elif mode == "get_inspired" and visual_summary:
                    hero_product, supporting_items = self._split_hero_and_support(repaired, hero_bucket or "general")
                    repaired_insights = self._build_inspiration_insights(context, visual_summary, hero_product, supporting_items)

            validation = self._validate(
                mode=mode,
                context=context,
                recommendations=repaired,
                styling_insights=repaired_insights,
                visual_summary=visual_summary,
                gap_analysis=gap_analysis,
                hero_bucket=hero_bucket,
            )

        return repaired[:4], repaired_insights[:4], validation

    def _validate(
        self,
        mode: str,
        context: dict,
        recommendations: list[ProductRecommendation],
        styling_insights: list[StylingInsight],
        visual_summary: Optional[VisualSummary] = None,
        gap_analysis: Optional[GapAnalysis] = None,
        hero_bucket: Optional[str] = None,
    ) -> ValidationResult:
        checks = []
        notes = []
        status = "pass"

        if recommendations:
            checks.append("catalog_valid")
        else:
            status = "fail"
            notes.append("No catalog items were selected.")

        if len(styling_insights) >= 3:
            checks.append("explanations_present")
        else:
            status = "repairable"
            notes.append("Explanation quality needs repair.")

        if context.get("weather") in {"cold", "rainy"}:
            if any(self._product_bucket(item) == "outerwear" for item in recommendations):
                checks.append("weather_fit")
            else:
                status = "repairable" if status == "pass" else status
                notes.append("Weather is present but outerwear is missing.")
        else:
            checks.append("weather_fit")

        if mode == "complete_the_look" and gap_analysis is not None:
            anchor_bucket = gap_analysis.anchor_category or "general"
            if any(self._product_bucket(item) == anchor_bucket and anchor_bucket != "general" for item in recommendations):
                status = "fail"
                notes.append("Anchor item was duplicated in complete-the-look.")
            else:
                checks.append("gap_analysis_correct")

        if mode == "get_inspired" and hero_bucket:
            hero_product, _ = self._split_hero_and_support(recommendations, hero_bucket)
            if hero_product is None:
                status = "fail"
                notes.append("Hero match is missing.")
            elif self._product_bucket(hero_product) != hero_bucket and hero_bucket != "general":
                status = "repairable" if status == "pass" else status
                notes.append("Hero match needs a closer garment-type alignment.")
            else:
                checks.append("hero_match_correct")

        if len({item.id for item in recommendations}) != len(recommendations):
            status = "repairable" if status == "pass" else status
            notes.append("Duplicate catalog items were selected.")
        else:
            checks.append("catalog_items_unique")

        if visual_summary and visual_summary.color_palette:
            checks.append("color_harmony_checked")

        return ValidationResult(status=status, checks=checks, notes=notes)

    def _compose_outfit_reply(self, context: dict, decision_preference: Optional[str], ai_reply: str) -> str:
        occasion = context.get("occasion") or "the plan you described"
        budget = f" under {context['budget']}" if context.get("budget") else ""
        if decision_preference == "decide_for_me":
            return (
                f"Since this is for {occasion}{budget}, I’d keep it easy but sharpened and make the call for you "
                "with one confident direction."
            )
        if ai_reply:
            return ai_reply
        return f"For {occasion}{budget}, I’d keep this easy, polished, and commercially smart so it feels right straight away."

    def _compose_complete_reply(self, visual_summary: VisualSummary, context: dict) -> str:
        anchor = visual_summary.anchor_item or "anchor piece"
        weather_note = " and keeping the weather in mind" if context.get("weather") else ""
        return f"I’m building this around your {anchor}, then filling only what is missing so the look feels complete{weather_note}."

    def _compose_inspiration_reply(
        self,
        visual_summary: VisualSummary,
        hero_product: Optional[ProductRecommendation],
    ) -> str:
        hero_reference = visual_summary.hero_item or visual_summary.garment_type or "hero piece"
        if hero_product is None:
            return f"The reference is clearly anchored by a {hero_reference}, so I focused on finding the closest main match first."
        return f"The image is really about the {hero_reference}, so I matched that first and then built the supporting pieces underneath it."

    def _compose_order_tracking_reply(self, order_status: dict) -> str:
        order_name = order_status.get("order_name") or "Your order"
        fulfillment_status = (order_status.get("fulfillment_status") or "being prepared").replace("_", " ").lower()
        return f"{order_name} is currently {fulfillment_status}. If you need the tracking page or want to start a return, I can take you there next."

    def _compose_sizing_reply(self, product: ProductRecommendation, fit_guidance: str) -> str:
        guidance = (fit_guidance or "").strip()
        if guidance:
            return f"For {product.title}, I’d use this fit guidance: {guidance}"
        return f"For {product.title}, I’d start true to size and go up only if you prefer a more relaxed fit or usually sit between sizes."

    def _decision_controls(self, decision_preference: Optional[str]) -> tuple[Optional[str], list[ActionChip]]:
        if decision_preference:
            return None, []
        return (
            "Do you want a few options, or do you want me to pick the best one for you?",
            [
                ActionChip(key="show_options", label="Show me options", action_type="decision", value="show_options"),
                ActionChip(key="decide_for_me", label="Decide for me", action_type="decision", value="decide_for_me"),
            ],
        )

    def _decision_default(self, settings) -> Optional[str]:
        if settings.decision_mode_default == "decide_for_me":
            return "decide_for_me"
        if settings.decision_mode_default == "show_options":
            return "show_options"
        return None

    def _outfit_follow_up(self, context: dict) -> Optional[str]:
        if context.get("occasion") is None:
            return "Where are you wearing it?"
        if context.get("weather") is None:
            return "If you want, tell me the weather and I’ll tune the layers."
        return None

    def _image_follow_up(self, context: dict, visual_summary: VisualSummary) -> Optional[str]:
        if context.get("occasion") is None:
            return "If you tell me the occasion, I can tighten the finish around this piece."
        if context.get("weather") is None and visual_summary.framing != "full outfit":
            return "If you tell me the weather, I can adjust the layer and shoe choice."
        return None

    def _palette_from_recommendations(self, recommendations: list[ProductRecommendation]) -> str:
        palette_terms = []
        for item in recommendations:
            for tag in item.tags:
                lowered = (tag or "").lower()
                if lowered in {"black", "white", "grey", "navy", "blue", "beige", "brown", "green", "neutral"}:
                    palette_terms.append(lowered)

        if palette_terms:
            ordered = []
            for item in palette_terms:
                if item not in ordered:
                    ordered.append(item)
            return ", ".join(ordered[:3])

        return "clean neutrals"

    def _display_tags_from_context(self, context: dict, terms: list[str]) -> list[str]:
        display = []
        for item in [context.get("occasion"), context.get("weather"), *(context.get("vibe") or [])]:
            clean = (item or "").strip()
            if clean and clean not in display:
                display.append(clean)

        for item in terms:
            if item in display or item in self.stop_words:
                continue
            if item in {"under", "more", "look", "outfit"}:
                continue
            display.append(item)
            if len(display) >= 5:
                break
        return display[:5]

    def _swap_actions(self, recommendations: list[ProductRecommendation]) -> list[ActionChip]:
        actions = []
        seen = set()
        for item in recommendations:
            bucket = self._product_bucket(item)
            if bucket in seen or bucket == "general":
                continue
            seen.add(bucket)
            actions.append(
                ActionChip(
                    key=f"swap_{bucket}",
                    label=f"Swap {self.recommendation_service.bucket_label(bucket).lower()}",
                    action_type="swap",
                    value=bucket,
                )
            )
        return actions[:4]

    def _outfit_refinement_actions(self) -> list[ActionChip]:
        return [
            ActionChip(key="keep_casual", label="Keep it casual", action_type="refine", value="more casual"),
            ActionChip(key="make_sharper", label="Make it sharper", action_type="refine", value="sharper"),
            ActionChip(key="more_premium", label="More premium", action_type="refine", value="more premium"),
            ActionChip(key="budget_friendly", label="Budget-friendly", action_type="refine", value="budget-friendly"),
        ]

    def _complete_refinement_actions(self) -> list[ActionChip]:
        return [
            ActionChip(key="keep_casual", label="Keep it casual", action_type="refine", value="more casual"),
            ActionChip(key="make_sharper", label="Make it sharper", action_type="refine", value="sharper"),
            ActionChip(key="more_premium", label="More premium", action_type="refine", value="more premium"),
            ActionChip(key="budget_friendly", label="Budget-friendly", action_type="refine", value="budget-friendly"),
            ActionChip(key="swap_one_item", label="Swap one item", action_type="swap", value="swap_one_item"),
        ]

    def _inspiration_refinement_actions(self) -> list[ActionChip]:
        return [
            ActionChip(key="more_affordable", label="More affordable", action_type="refine", value="more affordable"),
            ActionChip(key="more_premium", label="More premium", action_type="refine", value="more premium"),
            ActionChip(key="more_casual", label="More casual", action_type="refine", value="more casual"),
            ActionChip(key="more_formal", label="More formal", action_type="refine", value="more formal"),
            ActionChip(key="show_another", label="Show another similar version", action_type="refine", value="show another"),
        ]

    def _default_support_actions(self, detected_intent: str) -> list[ActionChip]:
        if detected_intent == "shipping_question":
            return [
                ActionChip(key="track_order", label="Track my order", action_type="support", value="order_tracking"),
                ActionChip(key="return_item", label="Return an item", action_type="support", value="return_request"),
            ]
        if detected_intent == "refund_query":
            return [
                ActionChip(key="start_return", label="Start a return", action_type="support", value="return_request"),
                ActionChip(key="track_order", label="Track my order", action_type="support", value="order_tracking"),
            ]
        return [
            ActionChip(key="track_order", label="Track order", action_type="support", value="order_tracking"),
            ActionChip(key="returns_help", label="Returns help", action_type="support", value="return_request"),
            ActionChip(key="shipping_help", label="Shipping help", action_type="support", value="shipping_question"),
        ]

    def _detect_support_intent(self, lowered_message: str) -> Optional[str]:
        for intent, variants in self.support_intent_map.items():
            if any(variant in lowered_message for variant in variants):
                return intent
        return None

    def _extract_order_reference(self, message: str) -> Optional[str]:
        match = re.search(r"#?\d{3,}", message or "")
        if match is None:
            return None
        digits = "".join(character for character in match.group(0) if character.isdigit())
        return f"#{digits}" if digits else None

    def _extract_email(self, message: str) -> Optional[str]:
        match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", message or "", flags=re.IGNORECASE)
        return match.group(0).lower() if match else None

    def _closest_catalog_product(self, message: str) -> Optional[ProductRecommendation]:
        terms = [token for token in re.findall(r"[a-z0-9-]+", (message or "").lower()) if len(token) > 2]
        matches = self.recommendation_service.recommend_products(terms=terms, limit=1)
        return matches[0] if matches else None
