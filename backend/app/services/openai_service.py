import json
import logging
import time
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import (
    CatalogSampleProduct,
    CatalogSuggestionField,
    CatalogSuggestionFields,
    CatalogSuggestionResponse,
    ImageAnalysisSummary,
    LookManagementItem,
    ProductRecommendation,
    ShopperProfile,
    StylingInsight,
)
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionAnalysis

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional dependency during local setup
    OpenAI = None


logger = logging.getLogger(__name__)


class StylistPlan(BaseModel):
    reply: str
    selected_product_ids: list[str] = Field(default_factory=list)
    styling_insights: list[StylingInsight] = Field(default_factory=list)
    follow_up_question: Optional[str] = None
    follow_up_prompts: list[str] = Field(default_factory=list)


class ImageAnalysisPlan(BaseModel):
    summary: str
    anchor_item: Optional[str] = None
    palette: list[str] = Field(default_factory=list)
    garment_types: list[str] = Field(default_factory=list)
    styling_mode_cue: str = "ambiguous"
    silhouette_cues: list[str] = Field(default_factory=list)
    pattern_texture_cues: list[str] = Field(default_factory=list)
    style_direction: list[str] = Field(default_factory=list)
    occasion_cues: list[str] = Field(default_factory=list)
    color_harmony_cues: list[str] = Field(default_factory=list)
    completeness: str = "partial view"
    quality_note: Optional[str] = None
    full_length_recommended: bool = False
    follow_up_question: Optional[str] = None
    follow_up_prompts: list[str] = Field(default_factory=list)
    observation_lines: list[str] = Field(default_factory=list)


class CompleteLookNarrationPlan(BaseModel):
    reply: str
    selected_product_ids: list[str] = Field(default_factory=list)
    follow_up_prompts: list[str] = Field(default_factory=list)
    styling_insights: list[StylingInsight] = Field(default_factory=list)


class InspiredLookNarrationPlan(BaseModel):
    reply: str
    selected_product_ids: list[str] = Field(default_factory=list)
    follow_up_prompts: list[str] = Field(default_factory=list)
    styling_insights: list[StylingInsight] = Field(default_factory=list)


class SupportIssueImagePlan(BaseModel):
    reply: str
    summary: str
    confidence: str = "medium"


class ProductDescriptionPlan(BaseModel):
    draft: str


class GeneratedLookPlan(BaseModel):
    title: str
    occasion: Optional[str] = None
    style_notes: str
    selected_product_ids: list[str] = Field(default_factory=list)


class LookBuilderPlan(BaseModel):
    items: list[GeneratedLookPlan] = Field(default_factory=list)


class CatalogSuggestionFieldPlan(BaseModel):
    options: list[str] = Field(default_factory=list)
    helper: str = ""


class CatalogSuggestionPlan(BaseModel):
    target_customer: CatalogSuggestionFieldPlan
    brand_positioning: CatalogSuggestionFieldPlan
    priority_tags: CatalogSuggestionFieldPlan
    compatibility_rules: CatalogSuggestionFieldPlan
    seasonal_focus: CatalogSuggestionFieldPlan
    fit_guidance: CatalogSuggestionFieldPlan
    recommendation_strictness: CatalogSuggestionFieldPlan
    product_priority_rules: CatalogSuggestionFieldPlan
    forbidden_recommendation_types: CatalogSuggestionFieldPlan
    summary: str = ""


class OpenAIService:
    def __init__(self) -> None:
        self.request_timeout_seconds = 8.0
        self.client = (
            OpenAI(
                api_key=settings.openai_api_key,
                timeout=self.request_timeout_seconds,
                max_retries=1,
            )
            if OpenAI and settings.openai_api_key
            else None
        )
        self.model = settings.openai_model
        self.supabase_service = SupabaseService()
        self._merchant_context_cache: Optional[dict] = None
        self._merchant_context_cache_at: float = 0.0
        self._merchant_context_cache_ttl_seconds = 90.0

    def style_recommendations(
        self,
        mode: str,
        shopper_message: str,
        detected_tags: list[str],
        candidate_products: list[ProductRecommendation],
        shopper_profile: ShopperProfile,
        recent_messages: list[dict],
        fallback_follow_up_prompts: list[str],
        vision_summary: str = "",
    ) -> tuple[str, list[ProductRecommendation], list[StylingInsight], list[str]]:
        target_segment = self._infer_request_segment(shopper_message, shopper_profile, candidate_products)
        segmented_candidates = self._segment_candidate_products(candidate_products, target_segment)
        fallback_reply = self.build_text_reply(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=segmented_candidates[:3],
            shopper_profile=shopper_profile,
            vision_summary=vision_summary,
        )
        fallback_products = segmented_candidates[:3]
        fallback_insights = self.build_styling_insights(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=fallback_products,
            shopper_profile=shopper_profile,
        )

        if self.client is None or not segmented_candidates:
            return fallback_reply, fallback_products, fallback_insights, fallback_follow_up_prompts

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": self._system_instructions(),
                    },
                    {
                        "role": "user",
                        "content": self._build_prompt_payload(
                            mode=mode,
                            shopper_message=shopper_message,
                            detected_tags=detected_tags,
                            candidate_products=segmented_candidates,
                            shopper_profile=shopper_profile,
                            recent_messages=recent_messages,
                            target_segment=target_segment,
                            vision_summary=vision_summary,
                        ),
                    },
                ],
                text_format=StylistPlan,
            )
            plan = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI stylist call failed. Falling back to local recommendation copy. %s", error)
            return fallback_reply, fallback_products, fallback_insights, fallback_follow_up_prompts

        if not plan:
            return fallback_reply, fallback_products, fallback_insights, fallback_follow_up_prompts

        selected_products = self._select_products(segmented_candidates, plan.selected_product_ids)
        if not selected_products:
            selected_products = fallback_products

        reply = (plan.reply or fallback_reply).strip()
        follow_up = (plan.follow_up_question or "").strip()
        styling_insights = plan.styling_insights or fallback_insights

        if follow_up:
            reply = f"{reply} {follow_up}"

        if not styling_insights:
            styling_insights = fallback_insights

        follow_up_prompts = [item.strip() for item in (plan.follow_up_prompts or []) if item and item.strip()]
        if not follow_up_prompts:
            follow_up_prompts = fallback_follow_up_prompts

        return reply, selected_products, styling_insights[:3], follow_up_prompts[:3]

    def interpret_image_analysis(
        self,
        *,
        mode: str,
        shopper_message: str,
        vision_analysis: VisionAnalysis,
        shopper_profile: ShopperProfile,
        explicit_segment: Optional[str] = None,
    ) -> ImageAnalysisSummary:
        fallback = self._fallback_image_analysis(
            mode=mode,
            shopper_message=shopper_message,
            vision_analysis=vision_analysis,
            shopper_profile=shopper_profile,
            explicit_segment=explicit_segment,
        )

        if self.client is None:
            return fallback

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's visual fashion analyst. "
                            "Turn raw image signals into safe, premium styling observations. "
                            "Use only outfit, garment, palette, texture, silhouette, and framing clues. "
                            "Do not infer sensitive personal traits or identity from appearance. "
                            "For styling_mode_cue, return only menswear, womenswear, or ambiguous, and treat it as a styling direction rather than identity. "
                            "Use safe wording such as silhouette cues, proportion cues, palette, and visible garment mix. "
                            "Use OCR text only as supporting product or inspiration context, never as a substitute for the visible outfit. "
                            "If the image is cropped or partial, mention that a full-length photo would improve shoes, layers, and proportion advice. "
                            "Keep observation_lines concise and useful. "
                            "Ask at most one strategic follow-up question only if it will materially improve the recommendation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "mode": mode,
                                "shopper_message": shopper_message,
                                "explicit_segment": explicit_segment,
                                "shopper_profile": shopper_profile.model_dump(),
                                "vision_analysis": {
                                    "summary": vision_analysis.summary,
                                    "labels": vision_analysis.labels,
                                    "objects": vision_analysis.objects,
                                    "colors": vision_analysis.colors,
                                    "web_entities": vision_analysis.web_entities,
                                    "apparel_cues": vision_analysis.apparel_cues,
                                    "style_cues": vision_analysis.style_cues,
                                    "detected_tags": vision_analysis.detected_tags,
                                    "ocr_terms": getattr(vision_analysis, "ocr_terms", []),
                                },
                            }
                        ),
                    },
                ],
                text_format=ImageAnalysisPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI image interpretation failed. Falling back to local fashion analysis. %s", error)
            return fallback

        if not parsed:
            return fallback

        merged = ImageAnalysisSummary(
            summary=(parsed.summary or fallback.summary).strip() or fallback.summary,
            anchor_item=(parsed.anchor_item or fallback.anchor_item or "").strip() or fallback.anchor_item,
            palette=parsed.palette or fallback.palette,
            garment_types=parsed.garment_types or fallback.garment_types,
            styling_mode_cue=parsed.styling_mode_cue or fallback.styling_mode_cue,
            silhouette_cues=parsed.silhouette_cues or fallback.silhouette_cues,
            pattern_texture_cues=parsed.pattern_texture_cues or fallback.pattern_texture_cues,
            style_direction=parsed.style_direction or fallback.style_direction,
            occasion_cues=parsed.occasion_cues or fallback.occasion_cues,
            color_harmony_cues=parsed.color_harmony_cues or fallback.color_harmony_cues,
            completeness=(parsed.completeness or fallback.completeness).strip() or fallback.completeness,
            quality_note=(parsed.quality_note or fallback.quality_note or "").strip() or fallback.quality_note,
            full_length_recommended=parsed.full_length_recommended or fallback.full_length_recommended,
            follow_up_question=(parsed.follow_up_question or fallback.follow_up_question or "").strip() or fallback.follow_up_question,
            follow_up_prompts=parsed.follow_up_prompts or fallback.follow_up_prompts,
            observation_lines=parsed.observation_lines or fallback.observation_lines,
        )

        if merged.styling_mode_cue not in {"menswear", "womenswear", "ambiguous"}:
            merged.styling_mode_cue = fallback.styling_mode_cue

        return merged

    def assess_support_issue_image(
        self,
        *,
        issue_intent: str,
        shopper_message: str,
        vision_analysis: VisionAnalysis,
    ) -> dict:
        fallback = self._fallback_support_issue_image_assessment(
            issue_intent=issue_intent,
            shopper_message=shopper_message,
            vision_analysis=vision_analysis,
        )

        if self.client is None:
            return fallback

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's support image reviewer. "
                            "Review shopper-uploaded issue photos for damaged-item or wrong-item support. "
                            "Use only visible cues and the provided issue intent. "
                            "Do not overclaim. If the evidence is unclear, say so calmly and keep the next step action-oriented. "
                            "Write one short shopper-facing sentence and one short summary for the support card."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "issue_intent": issue_intent,
                                "shopper_message": shopper_message,
                                "vision_analysis": {
                                    "summary": vision_analysis.summary,
                                    "labels": vision_analysis.labels,
                                    "objects": vision_analysis.objects,
                                    "colors": vision_analysis.colors,
                                    "web_entities": vision_analysis.web_entities,
                                    "apparel_cues": vision_analysis.apparel_cues,
                                    "style_cues": vision_analysis.style_cues,
                                    "detected_tags": vision_analysis.detected_tags,
                                    "ocr_terms": getattr(vision_analysis, "ocr_terms", []),
                                },
                            }
                        ),
                    },
                ],
                text_format=SupportIssueImagePlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI support issue image assessment failed. %s", error)
            return fallback

        if not parsed:
            return fallback

        return {
            "reply": (parsed.reply or fallback["reply"]).strip() or fallback["reply"],
            "summary": (parsed.summary or fallback["summary"]).strip() or fallback["summary"],
            "confidence": (parsed.confidence or fallback["confidence"]).strip() or fallback["confidence"],
        }

    def compose_complete_look_reply(
        self,
        *,
        shopper_message: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
    ) -> tuple[str, list[ProductRecommendation], list[str], list[StylingInsight]]:
        fallback_reply = self._fallback_complete_look_reply(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            recommendations=recommendations,
            orchestration_context=orchestration_context,
        )
        fallback_selected = recommendations[:4]
        fallback_prompts = self._fallback_complete_look_prompts(recommendations)
        fallback_insights = self._fallback_complete_look_insights(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            recommendations=recommendations,
            orchestration_context=orchestration_context,
        )

        if self.client is None or not recommendations:
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's premium stylist. "
                            "You are completing the shopper's uploaded outfit using only the provided synced-catalog candidates. "
                            "Before you recommend anything, evaluate the look in this exact order: styling mode, occasion, weather, colour harmony, silhouette balance, then the shopper's intent. "
                            "Choose 2 to 4 product IDs that best complete the look around the uploaded anchor piece. "
                            "Treat the uploaded garment or outfit as the center of the final look, not something to replace. "
                            "Use the image analysis, palette, silhouette read, occasion, weather, and merchant rules to pick the missing pieces only. "
                            "Follow strict stylist rules: cold weather needs real layering, hot weather needs breathable/light pieces, and occasion always overrides trendiness. "
                            "Never duplicate the visible anchor, never clash with the visible palette, and never ignore silhouette balance. "
                            "Prioritize the strongest completion pieces first: lower half, shoes, layer, then finishing accessory when appropriate. "
                            "Avoid duplicates of clearly visible core pieces unless the shopper explicitly asked for a swap. "
                            "Write one concise, warm, confident chat reply that feels like a real stylist reacting to this exact image. "
                            "Explain what you are building around, how the occasion and weather shaped the choices, and why the colours and structure stay coherent. "
                            "Return 2 to 3 styling insights that clearly explain how the recommendation meets the shopper's actual requirements. "
                            "Each insight should feel concrete and logic-based, not generic. "
                            "Never invent products or details. Return structured output only."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "merchant_context": self._merchant_context(),
                                "shopper_message": shopper_message,
                                "shopper_profile": shopper_profile.model_dump(),
                                "image_analysis": image_analysis.model_dump(),
                                "orchestration_context": orchestration_context,
                                "candidate_products": [
                                    {
                                        "id": item.id,
                                        "title": item.title,
                                        "category": item.category,
                                        "reason": item.reason,
                                        "price": item.price,
                                        "tags": item.tags,
                                    }
                                    for item in recommendations
                                ],
                                "allowed_follow_up_prompts": fallback_prompts,
                            }
                        ),
                    },
                ],
                text_format=CompleteLookNarrationPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI complete-look narration failed. %s", error)
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        if not parsed:
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        selected_products = self._select_products(
            recommendations,
            parsed.selected_product_ids,
            limit=4,
        )
        minimum_useful_selection = 2 if len(fallback_selected) >= 2 else len(fallback_selected)
        if len(selected_products) < minimum_useful_selection:
            selected_products = fallback_selected

        reply = (parsed.reply or "").strip() or fallback_reply
        follow_up_prompts = [item.strip() for item in (parsed.follow_up_prompts or []) if item and item.strip()]
        if not follow_up_prompts:
            follow_up_prompts = fallback_prompts
        styling_insights = parsed.styling_insights or fallback_insights
        return reply, selected_products, follow_up_prompts[:4], styling_insights[:3]

    def compose_inspired_look_reply(
        self,
        *,
        shopper_message: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
        allow_model: bool = True,
    ) -> tuple[str, list[ProductRecommendation], list[str], list[StylingInsight]]:
        fallback_reply = self._fallback_inspired_look_reply(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            recommendations=recommendations,
            orchestration_context=orchestration_context,
        )
        fallback_selected = recommendations[:4]
        fallback_prompts = self._fallback_inspired_look_prompts(recommendations)
        fallback_insights = self._fallback_inspired_look_insights(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            recommendations=recommendations,
            orchestration_context=orchestration_context,
        )

        if not allow_model or self.client is None or not recommendations:
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's premium inspiration stylist. "
                            "You are recreating a shopper's uploaded inspiration using only the provided synced-catalog products. "
                            "Before you choose products, evaluate the inspiration in this order: styling mode, hero garment, occasion feel, weather fit if inferable, colour family, silhouette, then the user's intent. "
                            "The first product in the candidate list is the closest hero match already chosen from the merchant catalog. "
                            "Keep that hero item at the centre of the recreated look, then choose 1 to 3 supporting product IDs that complete it. "
                            "Preserve the inspiration's garment type, colour family, silhouette, styling mode, vibe, and formality as closely as the catalog allows. "
                            "Prioritize similarity in this order: hero garment type, segment, colour family, silhouette, style direction, then occasion feel. "
                            "Never drift into unrelated products, generic styling language, or random colour clashes. "
                            "Write one concise, premium chat reply that feels like a real stylist translating the inspiration into something shoppable. "
                            "Keep the reply short: one or two sentences that explain what you matched first, what you added around it, and why it still feels close to the reference. "
                            "Return 2 to 3 styling insights that clearly explain hero similarity, palette logic, silhouette logic, and occasion feel. "
                            "Never invent products or details. Return structured output only."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "merchant_context": self._merchant_context(),
                                "shopper_message": shopper_message,
                                "shopper_profile": shopper_profile.model_dump(),
                                "image_analysis": image_analysis.model_dump(),
                                "orchestration_context": orchestration_context,
                                "candidate_products": [
                                    {
                                        "id": item.id,
                                        "title": item.title,
                                        "category": item.category,
                                        "reason": item.reason,
                                        "price": item.price,
                                        "tags": item.tags,
                                    }
                                    for item in recommendations
                                ],
                                "allowed_follow_up_prompts": fallback_prompts,
                            }
                        ),
                    },
                ],
                text_format=InspiredLookNarrationPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI inspired-look narration failed. %s", error)
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        if not parsed:
            return fallback_reply, fallback_selected, fallback_prompts, fallback_insights

        hero_id = recommendations[0].id if recommendations else None
        selected_products = self._select_products(
            recommendations,
            parsed.selected_product_ids,
            limit=4,
        )
        selected_products = self._ensure_anchor_first_selection(
            candidates=recommendations,
            selected_products=selected_products,
            anchor_id=hero_id,
            minimum_items=min(2, len(fallback_selected)),
        )
        if len(selected_products) < min(2, len(fallback_selected)):
            selected_products = fallback_selected

        reply = (parsed.reply or "").strip() or fallback_reply
        follow_up_prompts = [item.strip() for item in (parsed.follow_up_prompts or []) if item and item.strip()]
        if not follow_up_prompts:
            follow_up_prompts = fallback_prompts
        styling_insights = parsed.styling_insights or fallback_insights
        return reply, selected_products[:4], follow_up_prompts[:4], styling_insights[:3]

    def build_text_reply(
        self,
        mode: str,
        message: str,
        detected_tags: list[str],
        recommendations: list[ProductRecommendation],
        shopper_profile: ShopperProfile,
        vision_summary: str = "",
    ) -> str:
        if not recommendations:
            return (
                "I’m not seeing a confident match from the live StyledGenie catalog just yet. "
                "Give me a little more detail on the occasion, fit, color, or budget and I’ll refine it for you."
            )
        anchor = recommendations[0]
        supporting = recommendations[1:4]
        supporting_titles = ", ".join(item.title for item in supporting[:2]) or "a few well-matched supporting pieces"
        occasion_text = shopper_profile.occasion_context or "the moment you described"
        weather_text = shopper_profile.weather_context or ""
        feeling_goal = shopper_profile.feeling_goal or "confident"
        color_hint = ""
        if shopper_profile.color_preferences:
            color_hint = f" The colour direction stays close to {', '.join(shopper_profile.color_preferences[:2])}."
        weather_hint = f" It also makes sense for {weather_text} weather." if weather_text else ""

        if shopper_profile.confidence_level == "low":
            why_opening = "This keeps the decision lighter to make because the direction is clear without feeling risky."
        elif "wants_to_impress" in shopper_profile.emotional_context:
            why_opening = "This has enough presence to feel memorable, but it still stays composed and occasion-appropriate."
        elif shopper_profile.decision_style == "decisive":
            why_opening = "This is the clearest, most practical direction from the live catalog."
        else:
            why_opening = "This keeps the outfit feeling considered, balanced, and easy to wear."

        if mode == "get_inspired":
            title = "Outfit title: A wearable version of the inspiration."
            breakdown = (
                f"Outfit breakdown: I used {anchor.title} as the anchor, then layered in {supporting_titles} "
                "so the final look keeps the same mood while still feeling realistic for everyday wear."
            )
            vision_note = (
                f" From the image, I’m reading {vision_summary.lower()}."
                if vision_summary
                else ""
            )
            why = (
                f"Why this works: {why_opening} It carries the inspiration forward without copying it too literally, "
                f"so it still feels like you.{vision_note}{color_hint}"
            )
            variation = (
                "Optional safer or bolder variation: If you want it quieter, keep the same shape and soften the statement pieces. "
                "If you want more impact, let one hero item carry the fashion tension."
            )
            return "\n".join([title, breakdown, why, variation])

        if mode == "complete_the_look":
            title = "Outfit title: A finished look built around your anchor piece."
            breakdown = (
                f"Outfit breakdown: I treated {anchor.title} as the lead piece and brought in {supporting_titles} "
                "to add structure, balance, and enough finish without taking over the look."
            )
            vision_note = (
                f" From the image, I’m reading {vision_summary.lower()}."
                if vision_summary
                else ""
            )
            why = (
                f"Why this works: {why_opening} The additions support the silhouette and occasion instead of competing with your starting piece, "
                f"so the whole outfit feels more resolved and easier to trust.{vision_note}{color_hint}"
            )
            variation = (
                "Optional safer or bolder variation: Keep the palette cleaner for a softer finish, or add one stronger contrast piece if you want the look to read more fashion-forward."
            )
            return "\n".join([title, breakdown, why, variation])

        if mode == "support":
            return (
                "I’ve pulled together the clearest answer for you. If you want, I can also help with tracking, returns, or getting this to a human quickly."
            )

        opening = "I’d go with this." if shopper_profile.decision_style == "decisive" else "I’m building this as the clearest direction."
        if shopper_profile.decision_style == "decisive":
            title = f"Outfit title: My strongest pick for {occasion_text}."
        else:
            title = f"Outfit title: A polished direction for {occasion_text}."
        breakdown = (
            f"Outfit breakdown: {opening} Start with {anchor.title} as the anchor, then build around it with {supporting_titles} "
            "so the look has shape, purpose, and enough variety to feel like a complete outfit rather than separate pieces."
        )
        why = (
            f"Why this works: {why_opening} It suits {occasion_text}, keeps the styling practical, and helps you land on something that feels {feeling_goal} without overcomplicating it.{weather_hint}{color_hint}"
        )
        variation = (
            "Optional safer or bolder variation: Keep the palette cleaner and the layers sharper for a safer version, "
            "or let one texture or statement piece lead if you want the look to feel bolder."
        )
        return "\n".join([title, breakdown, why, variation])

    def _fallback_complete_look_reply(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
    ) -> str:
        anchor = image_analysis.anchor_item or (image_analysis.garment_types[0] if image_analysis.garment_types else "uploaded piece")
        palette = ", ".join(image_analysis.palette[:2]) if image_analysis.palette else ""
        harmony = ", ".join(image_analysis.color_harmony_cues[:2]) if image_analysis.color_harmony_cues else ""
        style_direction = ", ".join(image_analysis.style_direction[:2]) if image_analysis.style_direction else "a clean styling direction"
        occasion = shopper_profile.occasion_context or "the occasion"
        weather = shopper_profile.weather_context or "the weather"
        chosen_titles = [item.title for item in recommendations[:4] if item.title]
        if not chosen_titles:
            titles = "matching finishing pieces"
        elif len(chosen_titles) == 1:
            titles = chosen_titles[0]
        elif len(chosen_titles) == 2:
            titles = f"{chosen_titles[0]} and {chosen_titles[1]}"
        else:
            titles = f"{chosen_titles[0]}, {chosen_titles[1]}, and {chosen_titles[2]}"
        quality_note = f" {image_analysis.quality_note}" if image_analysis.quality_note else ""
        visual_read = style_direction
        if palette and harmony:
            visual_read = f"{style_direction} with a {palette} palette and {harmony}"
        elif palette:
            visual_read = f"{style_direction} with a {palette} palette"
        elif harmony:
            visual_read = f"{style_direction} with {harmony}"
        return (
            f"Perfect — I’m treating your {anchor} as the centre of the look. I’m reading {visual_read}, "
            f"so for {occasion} in {weather} weather I’d complete it with {titles}. "
            "That gives the outfit the missing structure and finishing pieces without pulling attention away from what you already have on."
            f"{quality_note}"
        ).strip()

    def _fallback_complete_look_prompts(
        self,
        recommendations: list[ProductRecommendation],
    ) -> list[str]:
        buckets = " ".join(item.category.lower() for item in recommendations if item.category)
        prompts = ["Make it sharper", "Keep it casual", "Cheaper version"]
        if "shoe" in buckets or "sneaker" in buckets or "boot" in buckets or "heel" in buckets:
            prompts.append("Swap shoes")
        else:
            prompts.append("Swap one item")
        return prompts[:4]

    def _fallback_complete_look_insights(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
    ) -> list[StylingInsight]:
        if not recommendations:
            return []

        palette_bits = image_analysis.palette[:2]
        palette_copy = ", ".join(palette_bits) if palette_bits else ""
        harmony = ", ".join(image_analysis.color_harmony_cues[:2]) if image_analysis.color_harmony_cues else ""
        if palette_copy and harmony:
            palette_copy = f"{palette_copy} with {harmony}"
        elif not palette_copy:
            palette_copy = harmony or orchestration_context.get("palette_strategy") or "the existing colour direction"
        occasion = shopper_profile.occasion_context or "the occasion"
        weather = shopper_profile.weather_context or "the weather"
        anchor = image_analysis.anchor_item or "anchor piece"
        categories = [item.category.lower() for item in recommendations if item.category]

        insights = [
            StylingInsight(
                title="Built around your anchor piece",
                detail=f"I treated your {anchor} as the lead item, so the added pieces complete the outfit instead of repeating what is already visible.",
            ),
            StylingInsight(
                title="Your context is reflected in the styling",
                detail=f"The look is shaped for {occasion} in {weather} weather, so the finish feels appropriate in real life and not just visually matched.",
            ),
            StylingInsight(
                title="The colour story stays coordinated",
                detail=f"I kept the supporting pieces inside {palette_copy}, which helps the outfit feel cleaner, more intentional, and easier to wear with confidence.",
            ),
        ]

        if any("shoe" in category or "sneaker" in category or "boot" in category or "heel" in category for category in categories):
            insights.append(
                StylingInsight(
                    title="The silhouette feels more resolved",
                    detail="Adding the right lower-half and shoe direction gives the outfit a more balanced finish, so the proportions feel thought through rather than incomplete.",
                )
            )

        return insights[:3]

    def _fallback_inspired_look_reply(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
    ) -> str:
        hero = recommendations[0] if recommendations else None
        supports = recommendations[1:4]
        anchor = image_analysis.anchor_item or "hero piece"
        palette = ", ".join(image_analysis.palette[:2]) if image_analysis.palette else "a close palette"
        style_direction = ", ".join((orchestration_context.get("style_direction") or image_analysis.style_direction)[:2]) or "the same overall mood"
        silhouette = orchestration_context.get("silhouette_direction") or ", ".join(image_analysis.silhouette_cues[:2])
        support_titles = self._join_product_titles(supports) if supports else "supporting pieces that keep the look aligned"
        hero_title = hero.title if hero else "the closest in-catalog hero match"
        occasion = shopper_profile.occasion_context or orchestration_context.get("occasion_feel") or ""
        occasion_copy = f" It still feels right for {occasion}." if occasion else ""
        silhouette_copy = f" The silhouette stays close through {silhouette}." if silhouette else ""
        return (
            f"I’m reading this as inspiration built around {anchor}, with {palette} and {style_direction}. "
            f"The closest match from the store is {hero_title}, and I finished it with {support_titles} so the recreated look stays close to the reference.{occasion_copy}{silhouette_copy}"
        ).strip()

    def _fallback_inspired_look_prompts(
        self,
        recommendations: list[ProductRecommendation],
    ) -> list[str]:
        prompts = ["More affordable", "More premium", "More casual", "More formal"]
        if any("shoe" in (item.category or "").lower() or "sneaker" in (item.category or "").lower() for item in recommendations):
            prompts.append("Show another similar version")
        return prompts[:4]

    def _fallback_inspired_look_insights(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recommendations: list[ProductRecommendation],
        orchestration_context: dict,
    ) -> list[StylingInsight]:
        if not recommendations:
            return []

        hero = recommendations[0]
        palette_bits = image_analysis.palette[:2]
        palette_copy = ", ".join(palette_bits) if palette_bits else orchestration_context.get("palette_strategy") or "the inspiration palette"
        style_direction = ", ".join((orchestration_context.get("style_direction") or image_analysis.style_direction)[:2]) or "the inspiration mood"
        silhouette = orchestration_context.get("silhouette_direction") or ", ".join(image_analysis.silhouette_cues[:2]) or "the same visual line"
        occasion = shopper_profile.occasion_context or orchestration_context.get("occasion_feel") or "the original occasion feel"

        return [
            StylingInsight(
                title="Closest hero match first",
                detail=f"I treated {hero.title} as the store version of the inspiration anchor, so the recreated look starts from the strongest like-for-like piece instead of unrelated products.",
            ),
            StylingInsight(
                title="Colour and silhouette stay aligned",
                detail=f"The recreated look stays inside {palette_copy} and keeps {silhouette}, which is what helps it feel visually close to the original image rather than just loosely inspired by it.",
            ),
            StylingInsight(
                title="The supporting pieces keep the same mood",
                detail=f"The rest of the selection is there to hold onto {style_direction} and keep the outfit right for {occasion}, so the final edit feels coherent and deliberate.",
            ),
        ]

    def _fallback_image_analysis(
        self,
        *,
        mode: str,
        shopper_message: str,
        vision_analysis: VisionAnalysis,
        shopper_profile: ShopperProfile,
        explicit_segment: Optional[str] = None,
    ) -> ImageAnalysisSummary:
        palette = vision_analysis.colors[:3]
        garment_types = self._prioritize_garment_types(vision_analysis.apparel_cues)[:4]
        style_direction = self._dedupe_text(
            vision_analysis.style_cues
            + self._style_direction_from_message(shopper_message)
        )[:4]
        anchor_item = self._preferred_anchor_item(garment_types)
        styling_mode_cue = explicit_segment or self._infer_styling_mode_cue(vision_analysis, shopper_profile)
        silhouette_cues = self._silhouette_cues_from_vision(vision_analysis)
        pattern_texture_cues = self._pattern_texture_cues_from_vision(vision_analysis)
        occasion_cues = self._occasion_cues_from_direction(style_direction, shopper_message)
        color_harmony_cues = self._color_harmony_cues(palette)
        completeness = self._completeness_label(vision_analysis)
        full_length_recommended = completeness != "full outfit visible"
        quality_note = self._image_quality_note(
            completeness=completeness,
            vision_analysis=vision_analysis,
            mode=mode,
        )
        follow_up_question = self._image_follow_up_question(
            mode=mode,
            styling_mode_cue=styling_mode_cue,
            completeness=completeness,
            explicit_segment=explicit_segment,
        )
        follow_up_prompts = self._image_follow_up_prompts(mode, styling_mode_cue, completeness)
        observation_lines = self._image_observation_lines(
            anchor_item=anchor_item,
            palette=palette,
            garment_types=garment_types,
            silhouette_cues=silhouette_cues,
            pattern_texture_cues=pattern_texture_cues,
            style_direction=style_direction,
            occasion_cues=occasion_cues,
            color_harmony_cues=color_harmony_cues,
            completeness=completeness,
        )
        summary = self._image_summary_sentence(
            mode=mode,
            anchor_item=anchor_item,
            style_direction=style_direction,
            palette=palette,
            completeness=completeness,
        )

        return ImageAnalysisSummary(
            summary=summary,
            anchor_item=anchor_item,
            palette=palette,
            garment_types=garment_types,
            styling_mode_cue=styling_mode_cue,
            silhouette_cues=silhouette_cues,
            pattern_texture_cues=pattern_texture_cues,
            style_direction=style_direction,
            occasion_cues=occasion_cues,
            color_harmony_cues=color_harmony_cues,
            completeness=completeness,
            quality_note=quality_note,
            full_length_recommended=full_length_recommended,
            follow_up_question=follow_up_question,
            follow_up_prompts=follow_up_prompts,
            observation_lines=observation_lines,
        )

    def _fallback_support_issue_image_assessment(
        self,
        *,
        issue_intent: str,
        shopper_message: str,
        vision_analysis: VisionAnalysis,
    ) -> dict:
        signal_copy = self._support_issue_signal_summary(vision_analysis)
        if issue_intent == "wrong_item_issue":
            reply = (
                "Thanks, I’ve reviewed the photo. I can use it as supporting evidence while I start the wrong-item review."
            )
            summary = (
                f"Photo reviewed for wrong-item support. Visible cues: {signal_copy}."
                if signal_copy
                else "Photo reviewed for wrong-item support."
            )
        else:
            reply = (
                "Thanks, I’ve reviewed the photo. It looks consistent with item damage, so I can use it to support the replacement review."
                if signal_copy
                else "Thanks, I’ve reviewed the photo. I can use it to support the damaged-item review."
            )
            summary = (
                f"Photo reviewed for damaged-item support. Visible cues: {signal_copy}."
                if signal_copy
                else "Photo reviewed for damaged-item support."
            )

        return {
            "reply": reply,
            "summary": summary,
            "confidence": "medium" if signal_copy else "low",
        }

    def _support_issue_signal_summary(self, vision_analysis: VisionAnalysis) -> str:
        cues = self._dedupe_text(
            vision_analysis.labels
            + vision_analysis.objects
            + vision_analysis.web_entities
            + vision_analysis.detected_tags
            + getattr(vision_analysis, "ocr_terms", [])
        )
        return ", ".join(cues[:3])

    def _prioritize_garment_types(self, garment_types: list[str]) -> list[str]:
        priority = {
            "dress": 0,
            "co-ord": 1,
            "blazer": 2,
            "shirt": 3,
            "blouse": 4,
            "t-shirt": 5,
            "skirt": 6,
            "trousers": 7,
            "denim": 8,
            "shorts": 9,
            "heels": 10,
            "boots": 11,
            "sandals": 12,
            "sneakers": 13,
            "bag": 14,
        }
        return sorted(self._dedupe_text(garment_types), key=lambda cue: priority.get(cue, 50))

    def _preferred_anchor_item(self, garment_types: list[str]) -> Optional[str]:
        if not garment_types:
            return None
        prioritized = self._prioritize_garment_types(garment_types)
        return prioritized[0] if prioritized else garment_types[0]

    def _image_summary_sentence(
        self,
        *,
        mode: str,
        anchor_item: Optional[str],
        style_direction: list[str],
        palette: list[str],
        completeness: str,
    ) -> str:
        pieces = []
        palette_like_cues = {
            "neutral palette",
            "warm palette",
            "cool palette",
            "high contrast",
            "soft contrast",
            "tonal palette",
            "monochrome potential",
            "bold palette",
        }
        non_palette_style = [item for item in style_direction if item not in palette_like_cues]
        if anchor_item:
            pieces.append(f"the look is led by {anchor_item}")
        if non_palette_style:
            pieces.append(f"it reads as {', '.join(non_palette_style[:2])}")
        elif style_direction:
            pieces.append(f"it leans {', '.join(style_direction[:2])}")
        if palette:
            pieces.append(f"with a {', '.join(palette[:2])} palette")
        if completeness != "full outfit visible":
            pieces.append("and the framing is partial")

        intro = "I’ve read the image."
        if not pieces:
            return intro + " I have enough to guide the styling direction, though a clearer full-length shot would make the advice sharper."

        connector = " For inspiration, " if mode == "get_inspired" else " Right now, "
        return intro + connector + ", ".join(pieces) + "."

    def _infer_styling_mode_cue(
        self,
        vision_analysis: VisionAnalysis,
        shopper_profile: ShopperProfile,
    ) -> str:
        womens_terms = {
            "dress",
            "gown",
            "bodycon",
            "midi",
            "maxi",
            "skirt",
            "heels",
            "heel",
            "pump",
            "bag",
            "handbag",
            "purse",
            "clutch",
            "blouse",
            "strapless",
            "women",
            "women's",
            "womenswear",
        }
        mens_terms = {
            "tie",
            "cufflinks",
            "briefcase",
            "suit",
            "tuxedo",
            "men",
            "men's",
            "menswear",
        }
        cue_terms = {
            item.lower()
            for item in (
                vision_analysis.apparel_cues
                + vision_analysis.style_cues
                + vision_analysis.labels
                + vision_analysis.objects
                + vision_analysis.web_entities
                + vision_analysis.detected_tags
                + getattr(vision_analysis, "ocr_terms", [])
            )
            if item
        }

        womens_score = sum(1 for term in cue_terms if term in womens_terms)
        mens_score = sum(1 for term in cue_terms if term in mens_terms)

        if any(term in cue_terms for term in {"dress", "gown", "bodycon", "strapless"}):
            womens_score += 3
        if any(term in cue_terms for term in {"tie", "tuxedo", "cufflinks"}):
            mens_score += 3

        if womens_score and not mens_score:
            return "womenswear"
        if mens_score and not womens_score:
            return "menswear"

        if womens_score >= mens_score + 2:
            return "womenswear"
        if mens_score >= womens_score + 2:
            return "menswear"

        if shopper_profile.segment_preference in {"menswear", "womenswear"}:
            return shopper_profile.segment_preference
        return "ambiguous"

    def _silhouette_cues_from_vision(self, vision_analysis: VisionAnalysis) -> list[str]:
        cues = []
        apparel = set(vision_analysis.apparel_cues)
        raw_terms = " ".join(
            vision_analysis.labels
            + vision_analysis.objects
            + vision_analysis.web_entities
            + vision_analysis.detected_tags
            + getattr(vision_analysis, "ocr_terms", [])
        ).lower()
        if "dress" in apparel:
            cues.append("one-piece silhouette")
        if apparel.intersection({"blazer", "shirt", "t-shirt", "hoodie", "knitwear"}):
            cues.append("structured upper half")
        if apparel.intersection({"trousers", "denim", "skirt", "shorts"}):
            cues.append("defined lower-half anchor")
        if "oversized" in raw_terms or "relaxed" in raw_terms:
            cues.append("relaxed silhouette")
        if "fitted" in raw_terms or "slim" in raw_terms:
            cues.append("fitted focal piece")
        if "layered" in raw_terms or "jacket" in raw_terms or "coat" in raw_terms or "blazer" in raw_terms:
            cues.append("layered outfit potential")
        if len(apparel) >= 2:
            cues.append("layered outfit potential")
        if not cues and apparel:
            cues.append("single-piece focal point")
        return self._dedupe_text(cues)[:3]

    def _pattern_texture_cues_from_vision(self, vision_analysis: VisionAnalysis) -> list[str]:
        cues = []
        raw_terms = " ".join(
            vision_analysis.labels
            + vision_analysis.objects
            + vision_analysis.web_entities
            + vision_analysis.detected_tags
            + getattr(vision_analysis, "ocr_terms", [])
        ).lower()
        texture_map = {
            "denim": "denim texture",
            "linen": "linen texture",
            "knit": "textured knit",
            "striped": "striped pattern",
            "checked": "checked pattern",
            "plaid": "checked pattern",
            "print": "printed detail",
            "printed": "printed detail",
            "satin": "smooth sheen",
            "leather": "structured texture",
        }
        for key, label in texture_map.items():
            if key in raw_terms:
                cues.append(label)
        return self._dedupe_text(cues)[:3]

    def _style_direction_from_message(self, shopper_message: str) -> list[str]:
        normalized = (shopper_message or "").lower()
        candidates = []
        for token, label in [
            ("casual", "casual"),
            ("smart casual", "smart casual"),
            ("formal", "formal"),
            ("minimal", "minimal"),
            ("polished", "polished"),
            ("street", "streetwear-inspired"),
            ("event", "event-ready"),
            ("dinner", "elevated"),
        ]:
            if token in normalized:
                candidates.append(label)
        return self._dedupe_text(candidates)

    def _occasion_cues_from_direction(self, style_direction: list[str], shopper_message: str) -> list[str]:
        normalized = (shopper_message or "").lower()
        occasions = []
        mapping = {
            "smart casual": "smart casual outing",
            "polished": "office or dinner",
            "formal": "eventwear",
            "casual": "casual outing",
            "streetwear-inspired": "off-duty",
            "event-ready": "eventwear",
            "elevated": "dinner or evening",
        }
        for direction in style_direction:
            if direction in mapping:
                occasions.append(mapping[direction])
        if "travel" in normalized:
            occasions.append("travel")
        if "office" in normalized or "work" in normalized:
            occasions.append("office")
        return self._dedupe_text(occasions)[:3]

    def _color_harmony_cues(self, palette: list[str]) -> list[str]:
        if not palette:
            return []
        neutral_colors = {"black", "white", "beige", "cream", "brown", "grey", "gray", "navy"}
        warm_colors = {"beige", "cream", "brown", "yellow", "red", "blush"}
        cool_colors = {"grey", "gray", "black", "white", "blue", "green", "navy"}
        palette_set = set(palette)
        cues = []
        if palette_set.issubset(neutral_colors):
            cues.append("neutral palette")
            cues.append("monochrome potential")
        elif len(palette_set) == 1:
            cues.append("tonal palette")
        elif {"black", "white"}.issubset(palette_set):
            cues.append("high contrast")
        else:
            cues.append("soft contrast")
        if palette_set.intersection(warm_colors) and not palette_set.intersection(cool_colors - {"white", "grey", "gray"}):
            cues.append("warm palette")
        if palette_set.intersection(cool_colors) and not palette_set.intersection(warm_colors - {"beige", "cream"}):
            cues.append("cool palette")
        return self._dedupe_text(cues)[:3]

    def _completeness_label(self, vision_analysis: VisionAnalysis) -> str:
        apparel = set(vision_analysis.apparel_cues)
        footwear = {"heels", "boots", "sneakers", "sandals", "loafers"}
        upper = {"shirt", "t-shirt", "hoodie", "knitwear", "blazer"}
        lower = {"trousers", "denim", "shorts", "skirt"}
        if "dress" in apparel and footwear.intersection(apparel):
            return "full outfit visible"
        if upper.intersection(apparel) and lower.intersection(apparel):
            if footwear.intersection(apparel):
                return "full outfit visible"
            return "partial outfit - footwear missing"
        if "dress" in apparel:
            return "partial outfit - footwear missing"
        if apparel.intersection(upper) and not lower.intersection(apparel):
            return "top-only visible"
        if lower.intersection(apparel) and not upper.intersection(apparel):
            return "lower-half only visible"
        return "partial view"

    def _image_quality_note(
        self,
        *,
        completeness: str,
        vision_analysis: VisionAnalysis,
        mode: str,
    ) -> Optional[str]:
        if not vision_analysis.apparel_cues and not vision_analysis.objects:
            return "I can start from this, but a clearer, better-lit image would help me read the outfit more confidently."
        if completeness != "full outfit visible":
            if mode == "get_inspired":
                return "I can translate the direction from this image, but a full-length shot would make the proportions, layers, and shoes much more accurate."
            return "I can still style this image, but a full-length photo will improve the proportion, layer, and shoe advice."
        return None

    def _image_follow_up_question(
        self,
        *,
        mode: str,
        styling_mode_cue: str,
        completeness: str,
        explicit_segment: Optional[str],
    ) -> Optional[str]:
        if styling_mode_cue == "ambiguous" and not explicit_segment:
            return "Should I style this as menswear or womenswear?"
        if completeness != "full outfit visible":
            if mode == "get_inspired":
                return "Do you want me to keep the vibe, the palette, or the full silhouette closest to the reference?"
            return "Do you want me to keep this casual, sharpen it up, or build it into something more polished?"
        return None

    def _image_follow_up_prompts(
        self,
        mode: str,
        styling_mode_cue: str,
        completeness: str,
    ) -> list[str]:
        if styling_mode_cue == "ambiguous":
            return ["Menswear", "Womenswear"]
        if mode == "get_inspired":
            if completeness != "full outfit visible":
                return ["Keep the vibe", "Focus on the palette", "Match the silhouette"]
            return ["More premium", "More affordable", "More casual"]
        if completeness != "full outfit visible":
            return ["Keep it casual", "Make it sharper", "More polished"]
        return ["Keep it casual", "Make it sharper", "Show cheaper options"]

    def _image_observation_lines(
        self,
        *,
        anchor_item: Optional[str],
        palette: list[str],
        garment_types: list[str],
        silhouette_cues: list[str],
        pattern_texture_cues: list[str],
        style_direction: list[str],
        occasion_cues: list[str],
        color_harmony_cues: list[str],
        completeness: str,
    ) -> list[str]:
        lines = []
        if anchor_item:
            lines.append(f"Anchor item: {anchor_item}.")
        if palette:
            lines.append(f"Palette: {', '.join(palette[:3])}.")
        if garment_types:
            lines.append(f"Visible garment cues: {', '.join(garment_types[:3])}.")
        if silhouette_cues:
            lines.append(f"Silhouette cues: {', '.join(silhouette_cues[:2])}.")
        if pattern_texture_cues:
            lines.append(f"Texture or pattern: {', '.join(pattern_texture_cues[:2])}.")
        if style_direction:
            lines.append(f"Style direction: {', '.join(style_direction[:2])}.")
        if occasion_cues:
            lines.append(f"Occasion potential: {', '.join(occasion_cues[:2])}.")
        if color_harmony_cues:
            lines.append(f"Color harmony: {', '.join(color_harmony_cues[:2])}.")
        lines.append(f"Image read: {completeness}.")
        return lines[:6]

    def _dedupe_text(self, values: list[str]) -> list[str]:
        deduped = []
        seen = set()
        for value in values:
            normalized = str(value or "").strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return deduped

    def generate_product_description(self, product: dict) -> str:
        title = product.get("title") or "Untitled product"
        category = product.get("category") or "Fashion item"
        tags = [tag for tag in product.get("tags", []) if tag][:6]
        description = (product.get("description") or "").strip()

        fallback = self._fallback_product_description(title, category, tags, description)
        if self.client is None:
            return fallback

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You write concise premium fashion-commerce product descriptions for StyledGenie. "
                            "Use the merchant context when helpful, but stay grounded in the actual product data. "
                            "Write 2 short sentences or one compact paragraph. Keep it polished, useful, and conversion-friendly. "
                            "Avoid SEO spam, fake fabric claims, fake fit claims, or excessive hype."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "merchant_context": self._merchant_context(),
                                "product": {
                                    "title": title,
                                    "category": category,
                                    "description": description,
                                    "tags": tags,
                                },
                            }
                        ),
                    },
                ],
                text_format=ProductDescriptionPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI product description generation failed. %s", error)
            return fallback

        draft = (parsed.draft or "").strip() if parsed else ""
        return draft or fallback

    def generate_look_builder(
        self,
        hero_product: dict,
        candidate_products: list[ProductRecommendation],
        occasion_hint: Optional[str] = None,
        hero_segment: Optional[str] = None,
    ) -> list[LookManagementItem]:
        fallback = self._fallback_look_builder(hero_product, candidate_products, occasion_hint)
        if self.client is None:
            return fallback

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's merchant-side look builder. "
                            "Given one hero product and compatible catalog options, create 2 to 3 merchant-friendly outfit drafts. "
                            "Keep all styling inside the same segment as the hero product. Never mix menswear and womenswear. "
                            "Each draft needs a strong title, an occasion when useful, and concise style notes that explain the anchor item, pairing logic, and the shopper feeling. "
                            "Keep the output commercial, premium, and easy for a merchant to reuse."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "merchant_context": self._merchant_context(),
                                "occasion_hint": occasion_hint,
                                "hero_segment": hero_segment,
                                "hero_product": hero_product,
                                "candidate_products": [
                                    {
                                        "id": item.id,
                                        "title": item.title,
                                        "category": item.category,
                                        "price": item.price,
                                        "tags": item.tags,
                                        "reason": item.reason,
                                    }
                                    for item in candidate_products[:8]
                                ],
                            }
                        ),
                    },
                ],
                text_format=LookBuilderPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI look builder generation failed. %s", error)
            return fallback

        generated_items = []
        for entry in (parsed.items if parsed else []):
            title = (entry.title or "").strip()
            style_notes = (entry.style_notes or "").strip()
            if not title or not style_notes:
                continue
            generated_items.append(
                LookManagementItem(
                    title=title,
                    occasion=((entry.occasion or occasion_hint) or "").strip() or None,
                    style_notes=style_notes,
                )
            )

        return generated_items[:3] or fallback

    def generate_catalog_intelligence_suggestions(
        self,
        sample_products: list[dict],
        vision_snapshots: list[dict],
    ) -> CatalogSuggestionResponse:
        fallback = self._fallback_catalog_intelligence_suggestions(sample_products, vision_snapshots)
        if not sample_products:
            return fallback

        if self.client is None:
            return fallback

        try:
            response = self.client.responses.parse(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are StyledGenie's merchant-side catalog intelligence strategist. "
                            "Given synced Shopify catalog samples and visual cues extracted from product images, generate practical, merchant-friendly selection options "
                            "for catalog intelligence rules. The options must be grounded in the catalog that is actually present. "
                            "Keep them concise, useful, commercially credible, and easy to click-apply in a dashboard. "
                            "For recommendation_strictness, use only values from this set: Balanced, Strict brand alignment, Higher conversion focus, More exploratory."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "merchant_context": self._merchant_context(),
                                "sample_products": sample_products,
                                "vision_snapshots": vision_snapshots,
                                "required_fields": [
                                    "target_customer",
                                    "brand_positioning",
                                    "priority_tags",
                                    "compatibility_rules",
                                    "seasonal_focus",
                                    "fit_guidance",
                                    "recommendation_strictness",
                                    "product_priority_rules",
                                    "forbidden_recommendation_types",
                                ],
                                "selection_rules": {
                                    "options_per_field": "2 to 4",
                                    "text_style": "short enough to fit as a dashboard option",
                                    "grounding": "base choices on visible product types, image signals, tags, occasions, and style direction",
                                },
                            }
                        ),
                    },
                ],
                text_format=CatalogSuggestionPlan,
            )
            parsed = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI catalog intelligence generation failed. %s", error)
            return fallback

        if not parsed:
            return fallback

        return CatalogSuggestionResponse(
            message=(parsed.summary or fallback.message).strip() or fallback.message,
            products_analyzed=fallback.products_analyzed,
            vision_source=fallback.vision_source,
            visual_summary=fallback.visual_summary,
            sample_products=fallback.sample_products,
            fields=CatalogSuggestionFields(
                target_customer=self._build_catalog_field(
                    "Target Customer",
                    parsed.target_customer,
                    fallback.fields.target_customer,
                ),
                brand_positioning=self._build_catalog_field(
                    "Brand Positioning",
                    parsed.brand_positioning,
                    fallback.fields.brand_positioning,
                ),
                priority_tags=self._build_catalog_field(
                    "Priority Tags",
                    parsed.priority_tags,
                    fallback.fields.priority_tags,
                ),
                compatibility_rules=self._build_catalog_field(
                    "Compatibility Rules",
                    parsed.compatibility_rules,
                    fallback.fields.compatibility_rules,
                ),
                seasonal_focus=self._build_catalog_field(
                    "Seasonal Focus",
                    parsed.seasonal_focus,
                    fallback.fields.seasonal_focus,
                ),
                fit_guidance=self._build_catalog_field(
                    "Fit Guidance",
                    parsed.fit_guidance,
                    fallback.fields.fit_guidance,
                ),
                recommendation_strictness=self._build_catalog_field(
                    "Recommendation Strictness",
                    parsed.recommendation_strictness,
                    fallback.fields.recommendation_strictness,
                    allowed_options=[
                        "Balanced",
                        "Strict brand alignment",
                        "Higher conversion focus",
                        "More exploratory",
                    ],
                ),
                product_priority_rules=self._build_catalog_field(
                    "Product Priority Rules",
                    parsed.product_priority_rules,
                    fallback.fields.product_priority_rules,
                ),
                forbidden_recommendation_types=self._build_catalog_field(
                    "Forbidden Recommendation Types",
                    parsed.forbidden_recommendation_types,
                    fallback.fields.forbidden_recommendation_types,
                ),
            ),
        )

    def build_styling_insights(
        self,
        mode: str,
        message: str,
        detected_tags: list[str],
        recommendations: list[ProductRecommendation],
        shopper_profile: ShopperProfile,
    ) -> list[StylingInsight]:
        if not recommendations:
            return []

        categories = [item.category.lower() for item in recommendations if item.category]
        all_tags = []
        for item in recommendations:
            all_tags.extend(item.tags)

        tag_set = {tag.lower() for tag in all_tags if tag}
        normalized_message = (message or "").lower()
        normalized_tags = [tag.lower() for tag in detected_tags]
        joined_product_titles = self._join_product_titles(recommendations)
        weather_context = shopper_profile.weather_context or ""
        occasion_context = shopper_profile.occasion_context or ""
        insights = []

        if any(token in normalized_message for token in ["dinner", "evening", "date", "event"]):
            insights.append(
                StylingInsight(
                    title="Occasion aligned",
                    detail="These pieces feel polished enough for the occasion while still staying easy and natural to wear in real life.",
                )
            )
        elif mode == "get_inspired":
            insights.append(
                StylingInsight(
                    title="Mood translated well",
                    detail="The selection keeps the same visual mood as your inspiration, but turns it into something store-ready and wearable.",
                )
            )
        elif mode == "complete_the_look":
            insights.append(
                StylingInsight(
                    title="Balanced finish",
                    detail="Each added piece is there to complete the outfit rather than compete with the item you started from.",
                )
            )
        else:
            insights.append(
                StylingInsight(
                    title="Strong overall direction",
                    detail="These items work together as a complete story, so the look feels considered instead of pieced together.",
                )
            )

        if len(set(categories)) >= 2:
            insights.append(
                StylingInsight(
                    title="Balanced silhouette",
                    detail="The mix of categories creates shape and structure, which helps the outfit feel flattering and intentionally styled.",
                )
            )

        if weather_context:
            insights.append(
                StylingInsight(
                    title="Weather makes sense",
                    detail=f"The pieces respect {weather_context} weather, so the outfit feels wearable and not just visually right.",
                )
            )

        if {"neutral", "cream", "black", "white", "beige", "tan", "brown", "denim"}.intersection(tag_set):
            insights.append(
                StylingInsight(
                    title="Easy colour story",
                    detail="The palette stays cohesive, which makes the outfit feel clean, elevated, and much easier to style confidently.",
                )
            )
        elif normalized_tags:
            insights.append(
                StylingInsight(
                    title="Visual consistency",
                    detail=f"The pieces stay aligned with the {', '.join(normalized_tags[:3])} mood, so the final look feels cohesive rather than random.",
                )
            )

        if any(token in tag_set for token in ["casual", "workwear", "smart", "polished", "minimal", "linen"]):
            insights.append(
                StylingInsight(
                    title="Feels easy to wear",
                    detail="The combination looks styled without feeling overdone, which makes it easier for the shopper to feel comfortable and confident in it.",
                )
            )
        else:
            insights.append(
                StylingInsight(
                    title="Confident recommendation",
                    detail=f"I chose {joined_product_titles} because together they create the clearest, most wearable direction from the live catalog for {occasion_context or 'your plan'}.",
                )
            )

        if shopper_profile.confidence_level == "low":
            insights.append(
                StylingInsight(
                    title="Easy to say yes to",
                    detail="The choices stay considered rather than risky, which makes the decision feel easier if you want reassurance without losing style.",
                )
            )
        elif "comfort-first" in shopper_profile.practical_constraints:
            insights.append(
                StylingInsight(
                    title="Comfort stays protected",
                    detail="The outfit keeps the finish polished while still respecting comfort and wearability, so it works in real life and not just in theory.",
                )
            )

        return insights[:3]

    def _system_instructions(self) -> str:
        return (
            "You are StyledGenie's AI Stylist. "
            "Your job is to recommend complete, logic-based fashion outfits using only the available catalog items and the shopper context. "
            "Always separate menswear and womenswear recommendations. Do not mix menswear and womenswear outfit structures. "
            "Before recommending any outfit, evaluate the request in this strict order: 1. target segment, 2. occasion, 3. weather, 4. color harmony, 5. silhouette and structure, 6. user intent such as comfort, sharpness, or boldness. "
            "If key context is missing, still choose the strongest provisional direction and ask exactly one short, high-value question. "
            "Follow hard stylist rules: cold weather requires real layering, hot weather requires breathable/light pieces, mild weather allows optional layering, and occasion always overrides trend for final outfit choice. "
            "Never suggest shorts in cold weather, heavy outerwear in hot weather, gymwear for formal moments, or color combinations that visibly clash without an intentional bold reason. "
            "Choose an anchor item first, then build a balanced outfit around it. Use fitted-plus-relaxed balance or structured contrast when appropriate, rather than random item mixing. "
            "Ensure compatibility in silhouette, color harmony, occasion, comfort, and styling level. "
            "Keep recommendations practical, emotionally relevant, commercially useful, and human. "
            "Explain why the outfit works in a concise, premium, empathetic way with real-world logic, not generic filler. "
            "Menswear styling should prioritize clean structure, polish, practicality, restrained accessorizing, and effortless confidence. "
            "Womenswear styling should prioritize silhouette balance, elegance, occasion expression, comfort-confidence balance, and refined accessorizing. "
            "You must only recommend products from the provided candidate list. Never invent products, prices, URLs, colors, sizes, or availability. "
            "Use merchant_context to follow the brand summary, catalog intelligence, compatibility rules, and AI training notes when they are available. "
            "Return 1 to 4 product IDs chosen only from candidate_products. "
            "Return 2 to 3 styling_insights that explain why the selected products work together and why the shopper can feel confident in them. "
            "Keep the response warm, sharp, premium, and human. Never sound robotic, generic, cheesy, overly salesy, or vague. "
            "The shopper-facing reply must use these labels in natural prose: Outfit title, Outfit breakdown, Why this works, and Optional safer or bolder variation when relevant. "
            "For complete_the_look, prioritize complementary pieces instead of duplicates. "
            "For complete_the_look, use the uploaded image cues to identify the anchor piece and build around it. "
            "For get_inspired, translate the detected style direction into realistic in-catalog alternatives. "
            "For get_inspired, use the uploaded image cues to describe the vibe first, then recreate the closest available version from the catalog. "
            "Never recommend random items without logic. Never mix product types that clash in occasion or styling level. "
            "Use shopper_profile to adapt confidence, empathy, pacing, and explanation depth."
        )

    def _build_catalog_field(
        self,
        label: str,
        generated: CatalogSuggestionFieldPlan,
        fallback: CatalogSuggestionField,
        allowed_options: Optional[list[str]] = None,
    ) -> CatalogSuggestionField:
        raw_options = [item.strip() for item in (generated.options or []) if item and item.strip()]
        if allowed_options is not None:
            raw_options = [item for item in raw_options if item in allowed_options]
        options = raw_options[:4] or fallback.options
        helper = (generated.helper or "").strip() or fallback.helper
        return CatalogSuggestionField(label=label, options=options, helper=helper)

    def _fallback_catalog_intelligence_suggestions(
        self,
        sample_products: list[dict],
        vision_snapshots: list[dict],
    ) -> CatalogSuggestionResponse:
        categories = [str(item.get("category") or "").strip() for item in sample_products if item.get("category")]
        tags = []
        for item in sample_products:
            tags.extend([str(tag).strip().lower() for tag in (item.get("tags") or []) if tag])

        visual_signals = []
        visual_sources = []
        for snapshot in vision_snapshots:
            visual_signals.extend(snapshot.get("detected_tags") or [])
            if snapshot.get("source"):
                visual_sources.append(snapshot["source"])

        normalized_categories = [item.lower() for item in categories if item]
        normalized_signals = [item.lower() for item in visual_signals if item]
        category_blob = " ".join(normalized_categories)
        signal_blob = " ".join(normalized_signals + tags)

        has_activewear = any(token in category_blob for token in ["leggings", "sports bra", "tank top", "jogger", "sneaker"])
        has_dressy = any(token in category_blob for token in ["dress", "blouse", "jacket", "coat", "knitwear", "heels", "bag"])
        has_mens = any(token in category_blob for token in ["herrenschuh", "mens", "shirt men", "bomber"])
        has_womens = any(token in category_blob for token in ["damenschuh", "dress", "leggings", "tank top women", "blouse", "bags"])

        target_customer_options = []
        if has_womens:
            target_customer_options.append("Women shopping for elevated everyday, occasion, and trend-led looks")
        if has_activewear:
            target_customer_options.append("Style-conscious shoppers who want comfort, movement, and polished athleisure")
        if has_mens:
            target_customer_options.append("Men looking for clean, practical pieces with smart casual polish")
        if not target_customer_options:
            target_customer_options.append("Fashion shoppers who want wearable looks with low decision friction")

        brand_positioning_options = []
        if has_activewear and has_dressy:
            brand_positioning_options.extend(
                [
                    "Accessible fashion with both activewear energy and occasion-ready polish",
                    "Trend-aware wardrobe builder for shoppers who move between comfort and elevated dressing",
                ]
            )
        elif has_activewear:
            brand_positioning_options.extend(
                [
                    "Performance-meets-style wardrobe for confident everyday dressing",
                    "Active-led fashion brand focused on flattering, wearable movement pieces",
                ]
            )
        else:
            brand_positioning_options.extend(
                [
                    "Affordable polished fashion with strong outfit-building potential",
                    "Occasion-aware womenswear and everyday dressing with easy styling logic",
                ]
            )

        priority_tag_pool = []
        for token in ["smart casual", "elevated basics", "occasionwear", "athleisure", "outerwear", "neutral palette", "comfort-first", "layering pieces", "feminine", "polished"]:
            if token in signal_blob or token.replace(" ", "") in signal_blob:
                priority_tag_pool.append(token)
        if has_activewear:
            priority_tag_pool.extend(["athleisure", "confidence fit", "performance basics"])
        if has_dressy:
            priority_tag_pool.extend(["occasion-ready", "elevated everyday", "statement outerwear"])
        priority_tag_options = [
            ", ".join(dict.fromkeys(priority_tag_pool[:5] or ["smart casual", "elevated everyday", "comfort-first", "neutral palette"]))
        ]
        priority_tag_options.append("occasion-ready, refined layers, feminine polish, balanced silhouette")
        priority_tag_options.append("athleisure, active basics, sculpting fit, monochrome styling")

        compatibility_options = [
            "Pair structured outerwear with softer base layers and clean footwear so the outfit stays balanced.",
            "Use dresses or statement tops as anchors, then keep add-ons refined rather than overly busy.",
            "For activewear-led looks, prioritize matching sets, sculpting layers, and low-friction sneakers or jackets.",
        ]
        if has_mens:
            compatibility_options.append("Keep menswear combinations clean: one anchor layer, one easy base, one practical shoe direction.")

        seasonal_options = [
            "Transitional layering with lightweight jackets, knitwear, and occasion-ready separates",
            "Year-round neutral dressing with seasonal refreshes through colour and fabrication",
        ]
        if any(color in signal_blob for color in ["green", "blueberry", "slate", "mint", "cream", "beige"]):
            seasonal_options.append("Soft seasonal colour capsules built around neutrals with one fresh accent")

        fit_options = [
            "Recommend pieces that create an easy flattering line without feeling restrictive or over-fitted.",
            "Prioritize confidence-first silhouettes: clean waists, relaxed layers, and balanced proportions.",
            "Use fit notes to reassure shoppers who want polish without sacrificing comfort.",
        ]

        product_priority_options = [
            "Prioritize products with strong imagery, clear silhouettes, and the richest styling tags first.",
            "Push hero products that can anchor a full look before suggesting supporting accessories.",
            "Favor in-stock, image-rich items that are easy to pair across casual, occasion, and layering flows.",
        ]

        forbidden_options = [
            "Avoid mixing sport performance pieces with formal occasion items in one recommendation.",
            "Do not lead with accessories unless the shopper asks for finishing pieces specifically.",
            "Avoid combining conflicting styling levels, like statement occasion dresses with rugged casual layers.",
        ]

        strictness_options = [
            "Balanced",
            "Higher conversion focus" if has_activewear else "Strict brand alignment",
            "More exploratory",
        ]

        summarized_signals = list(dict.fromkeys([*normalized_signals, *tags]))[:6]
        sample_cards = [
            CatalogSampleProduct(
                title=item.get("title") or "Untitled product",
                category=item.get("category") or "General",
                image_url=item.get("image_url"),
                detected_signals=(vision_snapshots[index].get("detected_tags") or [])[:4]
                if index < len(vision_snapshots)
                else [],
            )
            for index, item in enumerate(sample_products[:6])
        ]
        vision_source = "google-vision"
        if vision_snapshots:
            if any((snap.get("source") or "").startswith("google-vision") for snap in vision_snapshots):
                vision_source = "google-vision"
            else:
                vision_source = "fallback"
        visual_summary = (
            f"Built from {len(sample_products)} synced products and visual cues such as "
            f"{', '.join(summarized_signals[:4]) or 'category, silhouette, and palette'}."
        )

        return CatalogSuggestionResponse(
            message="Autogenerated options are ready. Review them field by field and click any option to apply it into your catalog intelligence rules.",
            products_analyzed=len(sample_products),
            vision_source=vision_source,
            visual_summary=visual_summary,
            sample_products=sample_cards,
            fields=CatalogSuggestionFields(
                target_customer=CatalogSuggestionField(
                    label="Target Customer",
                    options=target_customer_options[:3],
                    helper="Based on the actual product mix and who the catalog appears to serve best.",
                ),
                brand_positioning=CatalogSuggestionField(
                    label="Brand Positioning",
                    options=brand_positioning_options[:3],
                    helper="Use this to shape recommendation tone and merchandising logic.",
                ),
                priority_tags=CatalogSuggestionField(
                    label="Priority Tags",
                    options=priority_tag_options[:3],
                    helper="These are the strongest styling signals to prioritize when tagging or ranking products.",
                ),
                compatibility_rules=CatalogSuggestionField(
                    label="Compatibility Rules",
                    options=compatibility_options[:4],
                    helper="These rules steer how the assistant combines products into believable outfits.",
                ),
                seasonal_focus=CatalogSuggestionField(
                    label="Seasonal Focus",
                    options=seasonal_options[:3],
                    helper="Use this to influence which products rise first in seasonal recommendations.",
                ),
                fit_guidance=CatalogSuggestionField(
                    label="Fit Guidance",
                    options=fit_options[:3],
                    helper="These cues help the stylist explain shape, comfort, and confidence more clearly.",
                ),
                recommendation_strictness=CatalogSuggestionField(
                    label="Recommendation Strictness",
                    options=list(dict.fromkeys(strictness_options))[:3],
                    helper="Tighter settings stay on-brand, while looser settings explore more of the catalog.",
                ),
                product_priority_rules=CatalogSuggestionField(
                    label="Product Priority Rules",
                    options=product_priority_options[:3],
                    helper="Use these to decide which products should lead recommendations first.",
                ),
                forbidden_recommendation_types=CatalogSuggestionField(
                    label="Forbidden Recommendation Types",
                    options=forbidden_options[:3],
                    helper="These guardrails prevent styling mismatches that weaken shopper trust.",
                ),
            ),
        )

    def _build_prompt_payload(
        self,
        mode: str,
        shopper_message: str,
        detected_tags: list[str],
        candidate_products: list[ProductRecommendation],
        shopper_profile: ShopperProfile,
        recent_messages: list[dict],
        target_segment: str,
        vision_summary: str = "",
    ) -> str:
        merchant_context = self._merchant_context()
        payload = {
            "mode": mode,
            "shopper_message": shopper_message,
            "detected_tags": detected_tags,
            "vision_summary": vision_summary,
            "target_segment": target_segment,
            "shopper_profile": shopper_profile.dict(),
            "recent_messages": [
                {
                    "sender": row.get("sender"),
                    "message": row.get("message"),
                    "mode": row.get("mode"),
                }
                for row in recent_messages[-6:]
            ],
            "merchant_context": merchant_context,
            "candidate_products": [
                {
                    "id": item.id,
                    "title": item.title,
                    "category": item.category,
                    "tags": item.tags,
                    "price": item.price,
                    "reason": item.reason,
                    "segment": self._infer_product_segment(item),
                    "product_url": item.product_url,
                }
                for item in candidate_products
            ],
            "catalog_guardrails": {
                "segment_rule": (
                    "Use only products from the target segment. "
                    "Do not mix menswear and womenswear items in one outfit."
                ),
                "anchor_rule": "Choose the anchor item first, then build the rest of the outfit around it.",
                "logic_rule": "The final outfit should feel cohesive in silhouette, color, occasion, and comfort.",
            },
            "output_rules": {
                "reply": (
                    "Use short labeled sections exactly in this order: Outfit title, Outfit breakdown, Why this works, "
                    "and Optional safer or bolder variation when useful. Keep it concise, premium, and emotionally aware."
                ),
                "selected_product_ids": "1 to 4 IDs from candidate_products only",
                "styling_insights": "2 to 3 items. Each item needs a short title and one confidence-building explanation sentence.",
                "follow_up_question": "null when not needed, otherwise exactly one short question",
                "follow_up_prompts": "0 to 3 short clickable prompts for the next best styling move",
            },
        }
        return json.dumps(payload)

    def _merchant_context(self) -> dict:
        now = time.time()
        if (
            self._merchant_context_cache is not None
            and (now - self._merchant_context_cache_at) < self._merchant_context_cache_ttl_seconds
        ):
            return self._merchant_context_cache

        workspace = self.supabase_service.fetch_workspace_snapshot()
        context = {
            "brand_name": workspace.profile.brand_name,
            "brand_summary": workspace.profile.brand_summary,
            "merchandising_goal": workspace.profile.merchandising_goal,
            "chatbot_customization": {
                "assistant_name": workspace.chatbot_customization.assistant_name,
                "tone_of_voice": workspace.chatbot_customization.tone_of_voice,
                "stylist_signature": workspace.chatbot_customization.stylist_signature,
            },
            "catalog_intelligence": {
                "target_customer": workspace.catalog_intelligence.target_customer,
                "brand_positioning": workspace.catalog_intelligence.brand_positioning,
                "priority_tags": workspace.catalog_intelligence.priority_tags,
                "compatibility_rules": workspace.catalog_intelligence.compatibility_rules,
                "seasonal_focus": workspace.catalog_intelligence.seasonal_focus,
                "fit_guidance": workspace.catalog_intelligence.fit_guidance,
                "recommendation_strictness": workspace.catalog_intelligence.recommendation_strictness,
                "product_priority_rules": workspace.catalog_intelligence.product_priority_rules,
                "forbidden_recommendation_types": workspace.catalog_intelligence.forbidden_recommendation_types,
                "tagging_mode": workspace.catalog_intelligence.tagging_mode,
                "description_write_mode": workspace.catalog_intelligence.description_write_mode,
            },
            "curated_looks": [
                {
                    "title": item.title,
                    "occasion": item.occasion,
                    "style_notes": item.style_notes,
                }
                for item in workspace.looks[:6]
            ],
            "knowledge_base": [
                {
                    "title": item.title,
                    "entry_type": item.entry_type,
                    "body": item.body,
                }
                for item in workspace.knowledge_base[:8]
            ],
            "customer_care_settings": workspace.customer_care_settings.dict(),
            "shopper_feedback": {
                "love_it": workspace.overview.feedback_summary.love_it,
                "show_another_option": workspace.overview.feedback_summary.show_another_option,
                "make_more_casual": workspace.overview.feedback_summary.make_more_casual,
                "change_colours": workspace.overview.feedback_summary.change_colours,
                "save_for_later": workspace.overview.feedback_summary.save_for_later,
                "top_preference_signals": workspace.overview.feedback_summary.top_preference_signals,
            },
        }
        self._merchant_context_cache = context
        self._merchant_context_cache_at = now
        return context

    def merchant_context(self) -> dict:
        return self._merchant_context()

    def _select_products(
        self,
        candidates: list[ProductRecommendation],
        selected_ids: list[str],
        limit: int = 3,
    ) -> list[ProductRecommendation]:
        if not selected_ids:
            return []

        candidate_map = {item.id: item for item in candidates}
        selected = [candidate_map[item_id] for item_id in selected_ids if item_id in candidate_map]

        if selected:
            return selected[:limit]

        return []

    def _ensure_anchor_first_selection(
        self,
        *,
        candidates: list[ProductRecommendation],
        selected_products: list[ProductRecommendation],
        anchor_id: Optional[str],
        minimum_items: int,
    ) -> list[ProductRecommendation]:
        if not candidates:
            return []

        candidate_map = {item.id: item for item in candidates}
        anchor = candidate_map.get(anchor_id) if anchor_id else candidates[0]
        ordered = []
        seen = set()

        if anchor is not None:
            ordered.append(anchor)
            seen.add(anchor.id)

        for item in selected_products:
            if item.id in seen:
                continue
            ordered.append(item)
            seen.add(item.id)

        for item in candidates:
            if len(ordered) >= max(minimum_items, len(selected_products)):
                break
            if item.id in seen:
                continue
            ordered.append(item)
            seen.add(item.id)

        return ordered

    def _join_product_titles(self, recommendations: list[ProductRecommendation]) -> str:
        titles = [item.title for item in recommendations[:3]]
        if not titles:
            return "a few strong catalog pieces"
        if len(titles) == 1:
            return titles[0]
        if len(titles) == 2:
            return f"{titles[0]} and {titles[1]}"
        return f"{titles[0]}, {titles[1]}, and {titles[2]}"

    def _infer_request_segment(
        self,
        shopper_message: str,
        shopper_profile: ShopperProfile,
        candidate_products: list[ProductRecommendation],
    ) -> str:
        if shopper_profile.segment_preference in {"menswear", "womenswear"}:
            return shopper_profile.segment_preference

        context = " ".join(
            [
                shopper_message or "",
                shopper_profile.summary or "",
                shopper_profile.occasion_context or "",
                " ".join(shopper_profile.style_identity or []),
                " ".join(shopper_profile.focus_points or []),
            ]
        ).lower()

        mens_tokens = [" mens", " menswear", " men's", " man ", " male", " groom", " boyfriend", " husband"]
        womens_tokens = [
            " womens",
            " womenswear",
            " women's",
            " woman ",
            " female",
            " bridal",
            " bridesmaid",
            " girlfriend",
            " wife",
        ]

        if any(token in f" {context} " for token in mens_tokens):
            return "menswear"
        if any(token in f" {context} " for token in womens_tokens):
            return "womenswear"

        segment_counts = {"menswear": 0, "womenswear": 0}
        for item in candidate_products:
            segment = self._infer_product_segment(item)
            if segment in segment_counts:
                segment_counts[segment] += 1

        if segment_counts["menswear"] > segment_counts["womenswear"]:
            return "menswear"
        if segment_counts["womenswear"] > segment_counts["menswear"]:
            return "womenswear"
        return "unknown"

    def _segment_candidate_products(
        self,
        candidate_products: list[ProductRecommendation],
        target_segment: str,
    ) -> list[ProductRecommendation]:
        if target_segment not in {"menswear", "womenswear"}:
            return []

        primary = [item for item in candidate_products if self._infer_product_segment(item) == target_segment]
        return primary

    def _infer_product_segment(self, product: ProductRecommendation) -> str:
        if getattr(product, "segment", None) in {"menswear", "womenswear"}:
            return product.segment

        text = " ".join(
            [
                product.title or "",
                product.category or "",
                " ".join(product.tags or []),
                product.reason or "",
            ]
        ).lower()

        if any(token in text for token in ["unisex", "all gender", "all-gender", "gender neutral"]):
            return "unknown"

        mens_tokens = ["men", "mens", "men's", "male", "boy", "gent", "groom"]
        womens_tokens = ["women", "womens", "women's", "female", "girl", "lady", "ladies", "bride"]

        mens_score = sum(1 for token in mens_tokens if token in text)
        womens_score = sum(1 for token in womens_tokens if token in text)

        if mens_score > womens_score:
            return "menswear"
        if womens_score > mens_score:
            return "womenswear"
        return "unknown"

    def _fallback_product_description(
        self,
        title: str,
        category: str,
        tags: list[str],
        description: str,
    ) -> str:
        useful_tags = [tag.replace("-", " ") for tag in tags if tag][:3]
        opening = f"{title} is a polished {category.lower()} designed to feel easy to wear and simple to style."
        if useful_tags:
            return (
                f"{opening} It suits shoppers looking for {', '.join(useful_tags)} dressing with a clean, commercial finish."
            )
        if description:
            short_description = " ".join(
                description.replace("<p>", " ").replace("</p>", " ").split()
            )[:140].strip()
            return f"{opening} {short_description}".strip()
        return opening

    def _fallback_look_builder(
        self,
        hero_product: dict,
        candidate_products: list[ProductRecommendation],
        occasion_hint: Optional[str],
    ) -> list[LookManagementItem]:
        hero_title = hero_product.get("title") or "Hero product"
        occasion = (occasion_hint or "Everyday styling").strip()
        supporting_titles = [item.title for item in candidate_products[:3]]

        if not supporting_titles:
            return [
                LookManagementItem(
                    title=f"{hero_title} Signature Look",
                    occasion=occasion,
                    style_notes=(
                        f"Anchor the outfit around {hero_title} and keep the supporting pieces tonal, balanced, and easy to shop."
                    ),
                )
            ]

        return [
            LookManagementItem(
                title=f"{hero_title} Look {index + 1}",
                occasion=occasion,
                style_notes=(
                    f"Use {hero_title} as the anchor, then pair it with {supporting_title} to create a complete look that feels intentional and commercially wearable."
                ),
            )
            for index, supporting_title in enumerate(supporting_titles[:3])
        ]
