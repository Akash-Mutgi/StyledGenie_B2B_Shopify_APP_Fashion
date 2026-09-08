import json
import logging
import re
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import AIStackStatus, CustomerCareSettings, ImageAnalysisSummary, ProductRecommendation, ShopperProfile, StylingInsight
from app.services.faq_service import FAQService
from app.services.supabase_service import SupabaseService

try:
    from langchain.tools import tool
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.runnables import RunnableLambda
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover - optional dependency
    tool = None
    ChatPromptTemplate = None
    RunnableLambda = None
    ChatOpenAI = None


logger = logging.getLogger(__name__)


class RouteDecision(BaseModel):
    route: str = "styling"
    resolved_mode: str = "outfit_curation"
    confidence: str = "medium"
    reason: str = ""


class SupportIntentDecision(BaseModel):
    intent: str = "general_support"
    confidence: str = "medium"
    reason: str = ""


class ProfileEnrichment(BaseModel):
    style_identity: list[str] = Field(default_factory=list)
    emotional_context: list[str] = Field(default_factory=list)
    occasion_context: Optional[str] = Field(
        default=None,
        description="Exact shopper-stated occasion; preserve specific phrases such as coffee date without relabeling them.",
    )
    confidence_level: Optional[str] = None
    decision_style: Optional[str] = None
    experimentation_preference: Optional[str] = None
    practical_constraints: list[str] = Field(default_factory=list)
    silhouette_goals: list[str] = Field(default_factory=list)
    focus_points: list[str] = Field(default_factory=list)
    summary: str = ""
    tone_strategy: str = ""


class LangChainStylistPlan(BaseModel):
    reply: str = Field(description="Concise shopper-facing recommendation grounded only in supplied evidence.")
    selected_product_ids: list[str] = Field(
        default_factory=list,
        description="One to three exact IDs copied from candidate_products, ordered anchor first.",
    )
    styling_insights: list[StylingInsight] = Field(
        default_factory=list,
        description="Two or three concrete reasons covering color, silhouette, occasion, or style direction.",
    )
    follow_up_question: Optional[str] = Field(
        default=None,
        description="One critical question only when a coherent outfit is otherwise impossible; else null.",
    )
    follow_up_prompts: list[str] = Field(
        default_factory=list,
        description="Up to three short, actionable next-step prompts.",
    )


class LangChainSupportPlan(BaseModel):
    reply: str
    follow_up_prompts: list[str] = Field(default_factory=list)


class CompleteLookContextPlan(BaseModel):
    anchor_bucket: str = "tops"
    visible_buckets: list[str] = Field(default_factory=list)
    missing_piece_targets: list[str] = Field(default_factory=list)
    palette_strategy: str = "cohesive palette match"
    recommendation_focus: str = ""


class InspiredLookContextPlan(BaseModel):
    anchor_bucket: str = "tops"
    visible_buckets: list[str] = Field(default_factory=list)
    supporting_targets: list[str] = Field(default_factory=list)
    palette_strategy: str = "closest palette match"
    similarity_focus: list[str] = Field(default_factory=list)
    dominant_color_family: Optional[str] = None
    secondary_colors: list[str] = Field(default_factory=list)
    silhouette_direction: str = ""
    style_direction: list[str] = Field(default_factory=list)
    occasion_feel: Optional[str] = None
    image_scope: str = "partial outfit"
    confidence: str = "medium"


class LangChainService:
    def __init__(self) -> None:
        self.supabase_service = SupabaseService()
        self.faq_service = FAQService()
        self._llm = None
        self._tools = self._build_tools()
        self.request_timeout_seconds = 6.0

    def is_enabled(self) -> bool:
        return bool(self._get_llm())

    def runtime_status(self) -> AIStackStatus:
        llm = self._get_llm()
        enabled = bool(llm)
        tools_ready = bool(self._tools)
        summary = (
            "LangChain orchestration is live for routing, profile enrichment, and structured stylist flows."
            if enabled
            else "LangChain is installed, but it cannot run until an OpenAI key is available to the orchestration layer."
        )
        return AIStackStatus(
            openai_ready=bool(settings.openai_api_key),
            langchain_ready=enabled,
            langchain_tools_ready=tools_ready,
            shopper_routing_active=True,
            support_routing_active=True,
            image_reasoning_active=True,
            summary=summary,
        )

    def resolve_route(
        self,
        *,
        mode_hint: str,
        shopper_message: str,
        recent_messages: list[dict],
    ) -> RouteDecision:
        if mode_hint in {"get_inspired", "complete_the_look"}:
            return RouteDecision(
                route="styling",
                resolved_mode=mode_hint,
                confidence="high",
                reason="Explicit mode selected by the shopper.",
            )
        if mode_hint == "support":
            if (
                self._looks_like_clear_styling_request(shopper_message)
                and not self._recent_support_requires_follow_up(recent_messages)
            ):
                return RouteDecision(
                    route="styling",
                    resolved_mode="outfit_curation",
                    confidence="high",
                    reason="The shopper clearly switched back to a styling request.",
                )
            return RouteDecision(
                route="support",
                resolved_mode="support",
                confidence="high",
                reason="Explicit support mode is active.",
            )

        llm = self._get_llm()
        if not llm or not ChatPromptTemplate:
            return self._fallback_route(shopper_message, mode_hint)

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You route shopper messages for a Shopify fashion assistant. "
                    "Choose support when the user is asking about shipping, returns, delivery, tracking, refund, policy, order help, "
                    "damaged or wrong items, product details, or sizing help for a specific product. "
                    "Choose styling for outfit help, inspiration, complete-the-look, budget styling, occasion styling, product discovery, "
                    "or when the user is describing how they want an outfit to fit or feel. "
                    "Return support only when support is clearly primary. Otherwise return styling.",
                ),
                (
                    "human",
                    "Mode hint: {mode_hint}\n"
                    "Shopper message: {shopper_message}\n"
                    "Recent messages: {recent_messages_json}\n"
                    "Return a structured route decision.",
                ),
            ]
        )

        try:
            chain = prompt | llm.with_structured_output(RouteDecision)
            result = chain.invoke(
                {
                    "mode_hint": mode_hint,
                    "shopper_message": shopper_message,
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-5:]
                        ]
                    ),
                }
            )
            if result.route not in {"support", "styling"}:
                return self._fallback_route(shopper_message, mode_hint)
            if result.resolved_mode not in {"support", "outfit_curation", "get_inspired", "complete_the_look"}:
                result.resolved_mode = "support" if result.route == "support" else "outfit_curation"
            return result
        except Exception as error:
            logger.warning("LangChain route resolution failed. %s", error)
            return self._fallback_route(shopper_message, mode_hint)

    def compose_support_reply(
        self,
        *,
        shopper_message: str,
        recent_messages: list[dict],
        customer_care_settings: CustomerCareSettings,
        fallback_answer: str,
        merchant_context: dict,
        support_intent: str = "support_question",
    ) -> Optional[tuple[str, list[str]]]:
        llm = self._get_llm()
        if not llm or not ChatPromptTemplate or not RunnableLambda:
            return None

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are StyledGenie's support concierge inside a premium fashion shopping assistant. "
                    "Answer clearly, warmly, and concisely using the merchant support context and customer care settings. "
                    "Keep the answer practical, action-oriented, and never bring styling suggestions into the support flow. "
                    "Do not dump long policy paragraphs. "
                    "Use at most two short sentences and ask only one question at a time when you need input. "
                    "Use factual context already provided to you rather than inventing policy details. "
                    "For order tracking, use only the supplied Shopify result and never invent a status, date, carrier, or tracking link. "
                    "For FAQ answers, answer from the supplied merchant policy or fallback answer only. "
                    "For human handoff, accurately describe the created support request; never claim an agent joined the live chat. "
                    "If escalation is appropriate, mention the merchant support email. "
                    "Return structured output only.",
                ),
                (
                    "human",
                    "Support intent: {support_intent}\n"
                    "Shopper message: {shopper_message}\n"
                    "Fallback support answer: {fallback_answer}\n"
                    "Customer care settings: {customer_care_settings_json}\n"
                    "Merchant context: {merchant_context_json}\n"
                    "Recent messages: {recent_messages_json}\n"
                    "Tool context: {tool_context_json}\n",
                ),
            ]
        )

        chain = (
            RunnableLambda(
                lambda payload: {
                    **payload,
                    "tool_context_json": json.dumps(self._invoke_support_tools(payload)),
                }
            )
            | prompt
            | llm.with_structured_output(LangChainSupportPlan)
        )

        try:
            plan = chain.invoke(
                {
                    "shopper_message": shopper_message,
                    "support_intent": support_intent,
                    "fallback_answer": fallback_answer,
                    "customer_care_settings_json": customer_care_settings.model_dump_json(),
                    "merchant_context_json": json.dumps(merchant_context),
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-6:]
                        ]
                    ),
                }
            )
        except Exception as error:
            logger.warning("LangChain support reply failed. %s", error)
            return None

        reply = (plan.reply or "").strip()
        if not reply:
            return None

        prompts = [item.strip() for item in plan.follow_up_prompts if item and item.strip()][:3]
        return reply, prompts

    def classify_support_intent(
        self,
        *,
        shopper_message: str,
        recent_messages: list[dict],
        mode_hint: str,
    ) -> SupportIntentDecision:
        llm = self._get_llm()
        if not llm or not ChatPromptTemplate:
            return self._fallback_support_intent(
                shopper_message=shopper_message,
                recent_messages=recent_messages,
                mode_hint=mode_hint,
            )

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You classify messages for a fashion commerce assistant. "
                    "Return exactly one intent from this list: "
                    "order_tracking, return_request, exchange_request, refund_query, "
                    "shipping_question, product_question, sizing_question, damage_issue, wrong_item_issue, general_support, styling_request. "
                    "Choose styling_request only when the user is clearly asking for outfit or styling help. "
                    "Use general_support when the shopper clearly needs support but has not given enough detail to place it in a narrower bucket yet. "
                    "Use sizing_question only when the shopper is asking about the size or fit of a specific product. "
                    "Do not treat general outfit fit, silhouette, comfort, or styling preferences as a sizing support request. "
                    "If the shopper is replying with order details or a short follow-up, use the recent message context to keep the existing support flow intact. "
                    "Return structured output only.",
                ),
                (
                    "human",
                    "Mode hint: {mode_hint}\n"
                    "Shopper message: {shopper_message}\n"
                    "Recent messages: {recent_messages_json}\n",
                ),
            ]
        )

        try:
            chain = prompt | llm.with_structured_output(SupportIntentDecision)
            result = chain.invoke(
                {
                    "mode_hint": mode_hint,
                    "shopper_message": shopper_message,
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-6:]
                        ]
                    ),
                }
            )
        except Exception as error:
            logger.warning("LangChain support intent classification failed. %s", error)
            return self._fallback_support_intent(
                shopper_message=shopper_message,
                recent_messages=recent_messages,
                mode_hint=mode_hint,
            )

        if result.intent not in {
            "order_tracking",
            "return_request",
            "exchange_request",
            "refund_query",
            "shipping_question",
            "product_question",
            "sizing_question",
            "damage_issue",
            "wrong_item_issue",
            "general_support",
            "styling_request",
        }:
            return self._fallback_support_intent(
                shopper_message=shopper_message,
                recent_messages=recent_messages,
                mode_hint=mode_hint,
            )

        return result

    def enrich_profile(
        self,
        *,
        heuristic_profile: ShopperProfile,
        shopper_message: str,
        detected_tags: list[str],
        recent_messages: list[dict],
        vision_summary: str = "",
    ) -> ShopperProfile:
        llm = self._get_llm()
        if not llm or not ChatPromptTemplate:
            return heuristic_profile

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You enrich a shopper styling profile for a fashion commerce assistant. "
                    "Improve nuance, but stay grounded in the actual evidence. "
                    "Preserve an explicit shopper occasion exactly; coffee date is daytime and must not become dinner, evening, or date night. "
                    "Do not invent personal details. "
                    "Return only fields that strengthen tone, confidence handling, style framing, or practical constraints.",
                ),
                (
                    "human",
                    "Current heuristic profile: {heuristic_profile_json}\n"
                    "Shopper message: {shopper_message}\n"
                    "Detected tags: {detected_tags_json}\n"
                    "Vision summary: {vision_summary}\n"
                    "Recent messages: {recent_messages_json}\n",
                ),
            ]
        )

        try:
            chain = prompt | llm.with_structured_output(ProfileEnrichment)
            enrichment = chain.invoke(
                {
                    "heuristic_profile_json": heuristic_profile.model_dump_json(),
                    "shopper_message": shopper_message,
                    "detected_tags_json": json.dumps(detected_tags),
                    "vision_summary": vision_summary,
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                            }
                            for row in recent_messages[-5:]
                        ]
                    ),
                }
            )
            return self._merge_profile(heuristic_profile, enrichment)
        except Exception as error:
            logger.warning("LangChain profile enrichment failed. %s", error)
            return heuristic_profile

    def build_complete_look_context(
        self,
        *,
        shopper_message: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recent_messages: list[dict],
        merchant_context: dict,
    ) -> tuple[dict, bool]:
        fallback = self._fallback_complete_look_context(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
        )

        llm = self._get_llm()
        if not llm or not ChatPromptTemplate:
            return fallback, False

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You orchestrate StyledGenie's Complete My Look flow. "
                    "Given image analysis, shopper context, and merchant rules, decide what the anchor bucket is, what categories are already visible, "
                    "which missing pieces should be recommended next, and what palette strategy should guide the completion. "
                    "Apply this hierarchy in order: styling mode, occasion, weather, colour harmony, silhouette balance, then user intent. "
                    "If weather is cold or rainy, make sure layering is represented. If weather is hot, do not force heavy layers. "
                    "Never recommend duplicate visible core apparel unless it is clearly a swap flow. "
                    "Keep the output tightly structured and grounded in the visible garment plus the shopper's event and weather context.",
                ),
                (
                    "human",
                    "Shopper message: {shopper_message}\n"
                    "Shopper profile: {shopper_profile_json}\n"
                    "Image analysis: {image_analysis_json}\n"
                    "Merchant context: {merchant_context_json}\n"
                    "Recent messages: {recent_messages_json}\n",
                ),
            ]
        )

        try:
            chain = prompt | llm.with_structured_output(CompleteLookContextPlan)
            result = chain.invoke(
                {
                    "shopper_message": shopper_message,
                    "shopper_profile_json": shopper_profile.model_dump_json(),
                    "image_analysis_json": image_analysis.model_dump_json(),
                    "merchant_context_json": json.dumps(merchant_context),
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-5:]
                        ]
                    ),
                }
            )
        except Exception as error:
            logger.warning("LangChain complete-look orchestration failed. %s", error)
            return fallback, False

        if not result:
            return fallback, False

        merged = {
            "anchor_bucket": result.anchor_bucket or fallback["anchor_bucket"],
            "visible_buckets": result.visible_buckets or fallback["visible_buckets"],
            "missing_piece_targets": result.missing_piece_targets or fallback["missing_piece_targets"],
            "palette_strategy": result.palette_strategy or fallback["palette_strategy"],
            "recommendation_focus": result.recommendation_focus or fallback["recommendation_focus"],
        }
        return merged, True

    def build_inspired_look_context(
        self,
        *,
        shopper_message: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        recent_messages: list[dict],
        merchant_context: dict,
        allow_model: bool = True,
    ) -> tuple[dict, bool]:
        fallback = self._fallback_inspired_look_context(
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
        )

        if not allow_model:
            return fallback, False

        llm = self._get_llm()
        if not llm or not ChatPromptTemplate:
            return fallback, False

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You orchestrate StyledGenie's Get Inspired flow. "
                    "Given image analysis, shopper context, and merchant rules, decide which visible piece is the hero anchor, "
                    "which supporting categories matter most for recreating the look, and what similarity rules should guide the catalog match. "
                    "The uploaded inspiration must stay at the center of the logic. "
                    "Preserve styling mode, occasion feel, weather fit when inferable, colour harmony, silhouette, and overall vibe before secondary details. "
                    "Prioritize garment type, segment, color family, silhouette, and style direction before secondary styling details. "
                    "Keep the output tightly structured for hero-first catalog retrieval."
                ),
                (
                    "human",
                    "Shopper message: {shopper_message}\n"
                    "Shopper profile: {shopper_profile_json}\n"
                    "Image analysis: {image_analysis_json}\n"
                    "Merchant context: {merchant_context_json}\n"
                    "Recent messages: {recent_messages_json}\n",
                ),
            ]
        )

        try:
            chain = prompt | llm.with_structured_output(InspiredLookContextPlan)
            result = chain.invoke(
                {
                    "shopper_message": shopper_message,
                    "shopper_profile_json": shopper_profile.model_dump_json(),
                    "image_analysis_json": image_analysis.model_dump_json(),
                    "merchant_context_json": json.dumps(merchant_context),
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-5:]
                        ]
                    ),
                }
            )
        except Exception as error:
            logger.warning("LangChain inspired-look orchestration failed. %s", error)
            return fallback, False

        if not result:
            return fallback, False

        merged = {
            "anchor_bucket": result.anchor_bucket or fallback["anchor_bucket"],
            "visible_buckets": result.visible_buckets or fallback["visible_buckets"],
            "supporting_targets": result.supporting_targets or fallback["supporting_targets"],
            "palette_strategy": result.palette_strategy or fallback["palette_strategy"],
            "similarity_focus": result.similarity_focus or fallback["similarity_focus"],
            "dominant_color_family": result.dominant_color_family or fallback["dominant_color_family"],
            "secondary_colors": result.secondary_colors or fallback["secondary_colors"],
            "silhouette_direction": result.silhouette_direction or fallback["silhouette_direction"],
            "style_direction": result.style_direction or fallback["style_direction"],
            "occasion_feel": result.occasion_feel or fallback["occasion_feel"],
            "image_scope": result.image_scope or fallback["image_scope"],
            "confidence": result.confidence or fallback["confidence"],
        }
        return merged, True

    def style_recommendations(
        self,
        *,
        mode: str,
        shopper_message: str,
        detected_tags: list[str],
        candidate_products: list[ProductRecommendation],
        shopper_profile: ShopperProfile,
        recent_messages: list[dict],
        vision_summary: str,
        fallback_follow_up_prompts: list[str],
        merchant_context: dict,
    ) -> Optional[tuple[str, list[ProductRecommendation], list[StylingInsight], list[str]]]:
        llm = self._get_llm()
        if not llm or not ChatPromptTemplate or not RunnableLambda or not candidate_products:
            return None

        target_segment = self._infer_request_segment(shopper_message, shopper_profile, candidate_products)
        segmented_candidates = self._segment_candidate_products(candidate_products, target_segment)
        if not segmented_candidates:
            return None

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Role: StyledGenie's AI stylist, not a questionnaire.\n"
                    "Goal: make the strongest shoppable outfit decision supported by the supplied evidence.\n"
                    "Evidence priority: explicit shopper request, vision evidence, shopper profile, candidate facts, merchant context, then tool context. Never override an explicit value with an inference.\n"
                    "The Authoritative occasion field is immutable when present: use its exact meaning in the reply and insights. Coffee date requires daytime casual or smart-casual framing, never dinner/evening framing unless the shopper explicitly asks for that.\n"
                    "Success criteria: keep the target segment; preserve every explicit constraint; rank candidates by exact coverage of occasion, weather, style, colour, fit, comfort, and budget; choose an anchor first; select a cohesive outfit with color harmony, silhouette balance, comfort, and consistent formality.\n"
                    "Constraints: use exact candidate IDs only; never invent product details; never mix menswear and womenswear; occasion overrides trend; cold weather needs a useful layer and hot weather avoids heavy layering.\n"
                    "Output: concise premium reply using Outfit title, Outfit breakdown, and Why this works. Add a safer or bolder variation only when useful. Return 1 to 3 IDs and 2 to 3 concrete insights.\n"
                    "Stop rule: ask one short question only if a critical required fact makes a coherent outfit impossible. Once products are selected, set follow_up_question to null and follow_up_prompts to an empty list; do not ask for optional refinements after fulfilling the request. Return structured output only.",
                ),
                (
                    "human",
                    "Mode: {mode}\n"
                    "Target segment: {target_segment}\n"
                    "Authoritative occasion: {authoritative_occasion}\n"
                    "Shopper message: {shopper_message}\n"
                    "Vision summary: {vision_summary}\n"
                    "Detected tags: {detected_tags_json}\n"
                    "Shopper profile: {shopper_profile_json}\n"
                    "Recent messages: {recent_messages_json}\n"
                    "Merchant context: {merchant_context_json}\n"
                    "Tool context: {tool_context_json}\n"
                    "Candidate products: {candidate_products_json}\n"
                    "Fallback prompts: {fallback_prompts_json}\n",
                ),
            ]
        )

        chain = (
            RunnableLambda(
                lambda payload: {
                    **payload,
                    "tool_context_json": json.dumps(self._invoke_tools(payload)),
                }
            )
            | prompt
            | llm.with_structured_output(LangChainStylistPlan)
        )

        try:
            plan = chain.invoke(
                {
                    "mode": mode,
                    "target_segment": target_segment,
                    "authoritative_occasion": shopper_profile.occasion_context or "",
                    "shopper_message": shopper_message,
                    "detected_tags_json": json.dumps(detected_tags),
                    "shopper_profile_json": shopper_profile.model_dump_json(),
                    "recent_messages_json": json.dumps(
                        [
                            {
                                "sender": row.get("sender"),
                                "message": row.get("message"),
                                "mode": row.get("mode"),
                            }
                            for row in recent_messages[-6:]
                        ]
                    ),
                    "merchant_context_json": json.dumps(merchant_context),
                    "candidate_products_json": json.dumps(
                        [
                            {
                                "id": item.id,
                                "title": item.title,
                                "category": item.category,
                                "reason": item.reason,
                                "tags": item.tags,
                                "price": item.price,
                                "segment": self._infer_product_segment(item),
                            }
                            for item in segmented_candidates
                        ]
                    ),
                    "fallback_prompts_json": json.dumps(fallback_follow_up_prompts),
                    "vision_summary": vision_summary,
                }
            )
        except Exception as error:
            logger.warning("LangChain styling plan failed. %s", error)
            return None

        selected_products = self._select_products(segmented_candidates, plan.selected_product_ids)
        if not selected_products:
            selected_products = segmented_candidates[:3]

        follow_up_prompts = []

        reply = (plan.reply or "").strip()
        if plan.follow_up_question and not selected_products:
            reply = f"{reply} {plan.follow_up_question.strip()}".strip()

        if not reply:
            return None

        authoritative_occasion = (shopper_profile.occasion_context or "").strip().lower()
        if authoritative_occasion == "coffee date":
            occasion_copy = " ".join(
                [reply]
                + [insight.detail for insight in (plan.styling_insights or []) if insight.detail]
            ).lower()
            if re.search(r"\b(dinner|evening|date night)\b", occasion_copy):
                logger.warning(
                    "Rejected stylist plan that changed authoritative occasion coffee date to evening styling."
                )
                return None

        return reply, selected_products, (plan.styling_insights or [])[:3], follow_up_prompts[:3]

    def _get_llm(self):
        if self._llm is not None:
            return self._llm

        if ChatOpenAI is None or not settings.openai_api_key:
            return None

        try:
            self._llm = ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key,
                timeout=self.request_timeout_seconds,
                max_retries=1,
                reasoning_effort=settings.openai_reasoning_effort,
            )
        except Exception as error:
            logger.warning("LangChain ChatOpenAI initialization failed. %s", error)
            return None

        return self._llm

    def _fallback_route(self, shopper_message: str, mode_hint: str) -> RouteDecision:
        lowered = (shopper_message or "").lower()
        support_keywords = [
            "shipping",
            "return",
            "refund",
            "track",
            "tracking",
            "delivery",
            "order",
            "exchange",
            "policy",
            "cancel",
            "damaged",
            "wrong item",
            "incorrect item",
            "what size",
            "which size",
            "sizing",
            "true to size",
            "runs small",
            "runs big",
        ]

        if any(keyword in lowered for keyword in support_keywords):
            return RouteDecision(
                route="support",
                resolved_mode="support",
                confidence="medium",
                reason="Support keywords detected in shopper text.",
            )

        return RouteDecision(
            route="styling",
            resolved_mode=mode_hint if mode_hint != "support" else "outfit_curation",
            confidence="medium",
            reason="Defaulted to styling assistance.",
        )

    def _fallback_support_intent(
        self,
        *,
        shopper_message: str,
        recent_messages: list[dict],
        mode_hint: str,
    ) -> SupportIntentDecision:
        lowered = f" {str(shopper_message or '').lower()} "
        recent_copy = " ".join(
            row.get("message", "")
            for row in recent_messages[-5:]
            if row.get("message")
        ).lower()
        combined = f" {recent_copy} {lowered} "

        if any(token in lowered for token in [" track my order ", " where is my order ", " order status ", " tracking "]):
            return SupportIntentDecision(intent="order_tracking", confidence="high", reason="Tracking terms detected.")
        if any(token in lowered for token in [" damaged ", " faulty ", " defect ", " defective ", " broken ", " arrived damaged "]):
            return SupportIntentDecision(intent="damage_issue", confidence="high", reason="Damage terms detected.")
        if any(token in lowered for token in [" wrong item ", " incorrect item ", " sent the wrong ", " received the wrong ", " not what i ordered "]):
            return SupportIntentDecision(intent="wrong_item_issue", confidence="high", reason="Wrong-item terms detected.")
        if " exchange " in lowered or " swap size " in lowered or " different size " in lowered:
            return SupportIntentDecision(intent="exchange_request", confidence="high", reason="Exchange terms detected.")
        if " refund " in lowered:
            return SupportIntentDecision(intent="refund_query", confidence="high", reason="Refund terms detected.")
        if " return " in lowered:
            return SupportIntentDecision(intent="return_request", confidence="high", reason="Return terms detected.")
        if any(token in lowered for token in [" shipping ", " delivery ", " arrived ", " dispatched ", " shipped "]):
            return SupportIntentDecision(intent="shipping_question", confidence="medium", reason="Shipping terms detected.")
        if any(token in lowered for token in [" what size ", " which size ", " sizing ", " true to size ", " runs small ", " runs big ", " size up ", " size down "]):
            return SupportIntentDecision(intent="sizing_question", confidence="medium", reason="Sizing terms detected.")
        if any(token in lowered for token in [" product ", " item ", " material ", " fabric ", " in stock ", " available ", " availability "]):
            return SupportIntentDecision(intent="product_question", confidence="medium", reason="Product terms detected.")
        if any(token in lowered for token in [" outfit ", " style ", " wear ", " inspired ", " complete my look ", " look "]):
            return SupportIntentDecision(intent="styling_request", confidence="medium", reason="Styling terms detected.")
        if any(token in lowered for token in [" help ", " support ", " issue ", " problem ", " question "]):
            return SupportIntentDecision(intent="general_support", confidence="low", reason="Support request is too broad for a narrower bucket.")

        # Preserve short follow-ups like order numbers or emails inside an active support thread.
        if any(token in combined for token in ["track my order", "order status", "where is my order", "tracking"]):
            return SupportIntentDecision(intent="order_tracking", confidence="medium", reason="Tracking context detected.")
        if "exchange" in combined:
            return SupportIntentDecision(intent="exchange_request", confidence="medium", reason="Exchange context detected.")
        if "refund" in combined:
            return SupportIntentDecision(intent="refund_query", confidence="medium", reason="Refund context detected.")
        if "return" in combined:
            return SupportIntentDecision(intent="return_request", confidence="medium", reason="Return context detected.")
        if any(token in combined for token in ["damaged", "faulty", "defective", "broken"]):
            return SupportIntentDecision(intent="damage_issue", confidence="medium", reason="Damage context detected.")
        if any(token in combined for token in ["wrong item", "incorrect item", "received the wrong"]):
            return SupportIntentDecision(intent="wrong_item_issue", confidence="medium", reason="Wrong-item context detected.")
        if any(token in combined for token in ["what size", "which size", "sizing", "true to size", "runs small", "runs big", "size up", "size down"]):
            return SupportIntentDecision(intent="sizing_question", confidence="medium", reason="Sizing context detected.")
        if mode_hint == "support" or self._recent_support_requires_follow_up(recent_messages):
            return SupportIntentDecision(intent="general_support", confidence="low", reason="Support flow needs clarification.")

        default_intent = "styling_request"
        default_reason = "Defaulted to styling."
        return SupportIntentDecision(intent=default_intent, confidence="low", reason=default_reason)

    def _looks_like_clear_styling_request(self, shopper_message: str) -> bool:
        lowered = f" {str(shopper_message or '').lower()} "
        styling_terms = [
            " style me ",
            " outfit ",
            " what should i wear ",
            " dress me ",
            " smart casual ",
            " dinner tonight ",
            " complete my look ",
            " get inspired ",
            " wedding guest ",
            " office look ",
        ]
        return any(token in lowered for token in styling_terms)

    def _recent_support_requires_follow_up(self, recent_messages: list[dict]) -> bool:
        assistant_messages = [
            row.get("message", "")
            for row in recent_messages[-4:]
            if row.get("sender") == "assistant" and row.get("mode") == "support"
        ]
        if not assistant_messages:
            return False

        combined = f" {' '.join(assistant_messages).lower()} "
        blocking_cues = [
            " share your order number ",
            " checkout email ",
            " email used for the order ",
            " which item ",
            " what size would you like ",
            " replacement size ",
            " upload a photo ",
            " send a photo ",
        ]
        return any(cue in combined for cue in blocking_cues)

    def _merge_profile(self, base: ShopperProfile, enrichment: ProfileEnrichment) -> ShopperProfile:
        def merge_lists(primary: list[str], secondary: list[str]) -> list[str]:
            deduped = []
            seen = set()
            for item in primary + secondary:
                normalized = (item or "").strip().lower()
                if not normalized or normalized in seen:
                    continue
                seen.add(normalized)
                deduped.append(normalized)
            return deduped

        base_occasion = base.occasion_context
        occasion_context = (
            enrichment.occasion_context
            if base_occasion in {None, "", "inspiration", "look_completion"}
            else base_occasion
        )

        return ShopperProfile(
            segment_preference=base.segment_preference,
            style_identity=merge_lists(base.style_identity, enrichment.style_identity),
            shopping_intent=base.shopping_intent,
            emotional_context=merge_lists(base.emotional_context, enrichment.emotional_context),
            occasion_context=occasion_context,
            weather_context=base.weather_context,
            budget_context=base.budget_context,
            confidence_level=enrichment.confidence_level or base.confidence_level,
            decision_style=enrichment.decision_style or base.decision_style,
            experimentation_preference=(
                enrichment.experimentation_preference or base.experimentation_preference
            ),
            practical_constraints=merge_lists(base.practical_constraints, enrichment.practical_constraints),
            silhouette_goals=merge_lists(base.silhouette_goals, enrichment.silhouette_goals),
            image_signals=base.image_signals,
            color_preferences=base.color_preferences,
            fit_preferences=base.fit_preferences,
            priority_focus=base.priority_focus,
            feeling_goal=base.feeling_goal,
            focus_points=merge_lists(base.focus_points, enrichment.focus_points)[:4],
            summary=enrichment.summary or base.summary,
            tone_strategy=enrichment.tone_strategy or base.tone_strategy,
        )

    def _fallback_complete_look_context(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
    ) -> dict:
        anchor_bucket = self._bucket_from_text(image_analysis.anchor_item or "")
        visible_buckets = []
        for label in image_analysis.garment_types:
            bucket = self._bucket_from_text(label)
            if bucket != "general" and bucket not in visible_buckets:
                visible_buckets.append(bucket)
        if anchor_bucket != "general" and anchor_bucket not in visible_buckets:
            visible_buckets.insert(0, anchor_bucket)
        if anchor_bucket == "general":
            anchor_bucket = "dresswear" if "dress" in (image_analysis.anchor_item or "").lower() else "tops"

        if shopper_profile.segment_preference == "womenswear":
            mapping = {
                "dresswear": ["footwear", "outerwear", "accessories"],
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }
        else:
            mapping = {
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }
        missing_piece_targets = [
            bucket
            for bucket in mapping.get(anchor_bucket, ["tops", "bottoms", "outerwear", "footwear", "accessories"])
            if bucket not in visible_buckets
        ]
        if not missing_piece_targets:
            missing_piece_targets = ["outerwear", "footwear", "accessories"]

        cue_set = {cue.lower() for cue in image_analysis.color_harmony_cues if cue}
        if "high contrast" in cue_set:
            palette_strategy = "clean high-contrast palette"
        elif "monochrome potential" in cue_set or "tonal palette" in cue_set:
            palette_strategy = "tonal palette"
        elif "neutral palette" in cue_set:
            palette_strategy = "neutral balancing palette"
        elif image_analysis.palette:
            palette_strategy = f"{image_analysis.palette[0]}-led palette"
        else:
            palette_strategy = "cohesive palette match"

        focus_bits = []
        if image_analysis.anchor_item:
            focus_bits.append(f"Build around the {image_analysis.anchor_item}")
        if shopper_profile.occasion_context:
            focus_bits.append(f"keep it right for {shopper_profile.occasion_context}")
        if shopper_profile.weather_context:
            focus_bits.append(f"make it suitable for {shopper_profile.weather_context} weather")

        return {
            "anchor_bucket": anchor_bucket,
            "visible_buckets": visible_buckets[:4],
            "missing_piece_targets": missing_piece_targets[:4],
            "palette_strategy": palette_strategy,
            "recommendation_focus": ", ".join(focus_bits).strip(),
        }

    def _fallback_inspired_look_context(
        self,
        *,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
    ) -> dict:
        anchor_bucket = self._bucket_from_text(image_analysis.anchor_item or "")
        visible_buckets = []
        for label in image_analysis.garment_types:
            bucket = self._bucket_from_text(label)
            if bucket != "general" and bucket not in visible_buckets:
                visible_buckets.append(bucket)
        if anchor_bucket != "general" and anchor_bucket not in visible_buckets:
            visible_buckets.insert(0, anchor_bucket)
        if anchor_bucket == "general":
            anchor_bucket = "dresswear" if "dress" in (image_analysis.anchor_item or "").lower() else "tops"

        if shopper_profile.segment_preference == "womenswear":
            mapping = {
                "dresswear": ["footwear", "accessories", "outerwear"],
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["dresswear", "tops", "bottoms", "outerwear", "accessories"],
            }
        else:
            mapping = {
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }

        supporting_targets = mapping.get(anchor_bucket, ["footwear", "outerwear", "accessories"])
        cue_set = {cue.lower() for cue in image_analysis.color_harmony_cues if cue}
        if "high contrast" in cue_set:
            palette_strategy = "close high-contrast match"
        elif "monochrome potential" in cue_set or "tonal palette" in cue_set:
            palette_strategy = "tonal match"
        elif "neutral palette" in cue_set:
            palette_strategy = "cool neutral or soft neutral match"
        elif image_analysis.palette:
            palette_strategy = f"{image_analysis.palette[0]}-led match"
        else:
            palette_strategy = "closest palette match"

        similarity_focus = ["garment type", "segment", "color family"]
        if image_analysis.silhouette_cues:
            similarity_focus.append("silhouette")
        if image_analysis.style_direction:
            similarity_focus.append("style direction")

        style_direction = image_analysis.style_direction[:3]
        occasion_feel = shopper_profile.occasion_context or (image_analysis.occasion_cues[0] if image_analysis.occasion_cues else None)
        dominant_color_family = image_analysis.palette[0] if image_analysis.palette else None

        return {
            "anchor_bucket": anchor_bucket,
            "visible_buckets": visible_buckets[:4],
            "supporting_targets": supporting_targets[:4],
            "palette_strategy": palette_strategy,
            "similarity_focus": similarity_focus[:5],
            "dominant_color_family": dominant_color_family,
            "secondary_colors": image_analysis.palette[1:3],
            "silhouette_direction": ", ".join(image_analysis.silhouette_cues[:2]),
            "style_direction": style_direction,
            "occasion_feel": occasion_feel,
            "image_scope": image_analysis.completeness or "partial outfit",
            "confidence": "high" if image_analysis.anchor_item and image_analysis.palette else "medium",
        }

    def _bucket_from_text(self, value: str) -> str:
        normalized = (value or "").lower()
        mapping = {
            "dress": "dresswear",
            "skirt": "bottoms",
            "trouser": "bottoms",
            "pant": "bottoms",
            "jean": "bottoms",
            "denim": "bottoms",
            "shirt": "tops",
            "blouse": "tops",
            "tee": "tops",
            "t-shirt": "tops",
            "top": "tops",
            "hoodie": "tops",
            "sweater": "tops",
            "blazer": "outerwear",
            "jacket": "outerwear",
            "coat": "outerwear",
            "overshirt": "outerwear",
            "heel": "footwear",
            "sneaker": "footwear",
            "boot": "footwear",
            "shoe": "footwear",
            "bag": "accessories",
            "hat": "accessories",
        }
        for token, bucket in mapping.items():
            if token in normalized:
                return bucket
        return "general"

    def _build_tools(self) -> dict[str, object]:
        if tool is None:
            return {}

        @tool("merchant_memory_lookup")
        def merchant_memory_lookup(query: str = "") -> str:
            """Return brand, catalog, and merchant memory context for orchestration."""
            workspace = self.supabase_service.fetch_workspace_snapshot()
            return json.dumps(
                {
                    "brand_name": workspace.profile.brand_name,
                    "brand_summary": workspace.profile.brand_summary,
                    "merchandising_goal": workspace.profile.merchandising_goal,
                    "target_customer": workspace.catalog_intelligence.target_customer,
                    "brand_positioning": workspace.catalog_intelligence.brand_positioning,
                    "priority_tags": workspace.catalog_intelligence.priority_tags,
                    "compatibility_rules": workspace.catalog_intelligence.compatibility_rules,
                    "recommendation_strictness": workspace.catalog_intelligence.recommendation_strictness,
                    "forbidden_recommendation_types": workspace.catalog_intelligence.forbidden_recommendation_types,
                }
            )

        @tool("support_context_lookup")
        def support_context_lookup(question: str) -> str:
            """Return the best support answer from merchant FAQs for the given shopper question."""
            return self.faq_service.answer_question(question)

        @tool("vision_context_lookup")
        def vision_context_lookup(summary: str) -> str:
            """Return the summarized visual context extracted from the shopper image."""
            return summary or "No vision context available."

        @tool("candidate_catalog_lookup")
        def candidate_catalog_lookup(candidate_products_json: str) -> str:
            """Return a compact summary of shortlisted catalog candidates for styling decisions."""
            try:
                payload = json.loads(candidate_products_json)
            except Exception:
                return "No candidate catalog context available."

            condensed = [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "category": item.get("category"),
                    "tags": (item.get("tags") or [])[:5],
                    "reason": item.get("reason"),
                }
                for item in payload[:8]
            ]
            return json.dumps(condensed)

        return {
            "merchant_memory_lookup": merchant_memory_lookup,
            "support_context_lookup": support_context_lookup,
            "vision_context_lookup": vision_context_lookup,
            "candidate_catalog_lookup": candidate_catalog_lookup,
        }

    def _invoke_tools(self, payload: dict) -> dict:
        tool_context = {}
        if not self._tools:
            return tool_context

        try:
            tool_context["merchant_memory"] = self._tools["merchant_memory_lookup"].invoke("")
            tool_context["catalog_candidates"] = self._tools["candidate_catalog_lookup"].invoke(
                payload.get("candidate_products_json", "[]")
            )
            tool_context["vision_context"] = self._tools["vision_context_lookup"].invoke(
                payload.get("vision_summary", "")
            )
            if payload.get("mode") == "support":
                tool_context["support_answer"] = self._tools["support_context_lookup"].invoke(
                    payload.get("shopper_message", "")
                )
        except Exception as error:
            logger.warning("LangChain tool orchestration failed. %s", error)

        return tool_context

    def _invoke_support_tools(self, payload: dict) -> dict:
        tool_context = {}
        if not self._tools:
            return tool_context

        try:
            tool_context["merchant_memory"] = self._tools["merchant_memory_lookup"].invoke("")
            tool_context["support_answer"] = self._tools["support_context_lookup"].invoke(
                payload.get("shopper_message", "")
            )
        except Exception as error:
            logger.warning("LangChain support tool orchestration failed. %s", error)

        return tool_context

    def _select_products(
        self,
        candidates: list[ProductRecommendation],
        selected_ids: list[str],
    ) -> list[ProductRecommendation]:
        if not selected_ids:
            return []

        candidate_map = {item.id: item for item in candidates}
        selected = [candidate_map[item_id] for item_id in selected_ids if item_id in candidate_map]
        return selected[:3]

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

        return [item for item in candidate_products if self._infer_product_segment(item) == target_segment]

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
