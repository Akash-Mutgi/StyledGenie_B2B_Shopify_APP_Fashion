import json
import logging
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import ProductRecommendation, StylingInsight
from app.services.supabase_service import SupabaseService

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


class OpenAIService:
    def __init__(self) -> None:
        self.client = OpenAI(api_key=settings.openai_api_key) if OpenAI and settings.openai_api_key else None
        self.model = settings.openai_model
        self.supabase_service = SupabaseService()

    def style_recommendations(
        self,
        mode: str,
        shopper_message: str,
        detected_tags: list[str],
        candidate_products: list[ProductRecommendation],
    ) -> tuple[str, list[ProductRecommendation], list[StylingInsight]]:
        fallback_reply = self.build_text_reply(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=candidate_products[:3],
        )
        fallback_products = candidate_products[:3]
        fallback_insights = self.build_styling_insights(
            mode=mode,
            message=shopper_message,
            detected_tags=detected_tags,
            recommendations=fallback_products,
        )

        if self.client is None or not candidate_products:
            return fallback_reply, fallback_products, fallback_insights

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
                            candidate_products=candidate_products,
                        ),
                    },
                ],
                text_format=StylistPlan,
            )
            plan = response.output_parsed
        except Exception as error:
            logger.warning("OpenAI stylist call failed. Falling back to local recommendation copy. %s", error)
            return fallback_reply, fallback_products, fallback_insights

        if not plan:
            return fallback_reply, fallback_products, fallback_insights

        selected_products = self._select_products(candidate_products, plan.selected_product_ids)
        if not selected_products:
            selected_products = fallback_products

        reply = (plan.reply or fallback_reply).strip()
        follow_up = (plan.follow_up_question or "").strip()
        styling_insights = plan.styling_insights or fallback_insights

        if follow_up:
            reply = f"{reply} {follow_up}"

        if not styling_insights:
            styling_insights = fallback_insights

        return reply, selected_products, styling_insights[:3]

    def build_text_reply(
        self,
        mode: str,
        message: str,
        detected_tags: list[str],
        recommendations: list[ProductRecommendation],
    ) -> str:
        if not recommendations:
            return (
                "I’m not seeing a confident match from the live StyledGenie catalog just yet. "
                "Give me a little more detail on the occasion, fit, color, or budget and I’ll refine it for you."
            )

        tags_text = ", ".join(detected_tags) if detected_tags else "your request"

        if mode == "outfit_curation":
            return (
                f"I pulled together an edit for {message} that feels polished, wearable, and confidently put together."
            )

        if mode == "get_inspired":
            return (
                "That reference has a clear style mood, so I translated it into pieces that feel true to the look while staying wearable."
            )

        if mode == "complete_the_look":
            return (
                f"You already have a strong starting point, so I chose pieces that make {tags_text} feel more intentional and complete."
            )

        return (
            "I’m here to make this feel easy and personal. Based on "
            f"{tags_text}, I pulled the strongest options together for you."
        )

    def build_styling_insights(
        self,
        mode: str,
        message: str,
        detected_tags: list[str],
        recommendations: list[ProductRecommendation],
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
        insights = []

        if any(token in normalized_message for token in ["dinner", "evening", "date", "event"]):
            insights.append(
                StylingInsight(
                    title="Occasion aligned",
                    detail="These pieces feel polished enough for the occasion while still staying easy and natural to wear.",
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
                    detail=f"I chose {joined_product_titles} because together they create the clearest, most wearable direction from the live catalog.",
                )
            )

        return insights[:3]

    def _system_instructions(self) -> str:
        return (
            "You are StyledGenie, a premium virtual stylist for a Shopify fashion store. "
            "Sound like an experienced human stylist: warm, emotionally intelligent, reassuring, and polished. "
            "Make the shopper feel understood and confident in their choice. "
            "Keep the tone elegant and natural, never robotic, never cheesy, and never overly salesy. "
            "You must only recommend products from the provided candidate list. "
            "Never invent products, prices, URLs, colors, or sizes. "
            "Use merchant_context to follow the brand summary, catalog intelligence, and AI training notes when they are available. "
            "Return 1 to 3 product IDs chosen only from candidate_products. "
            "Return 2 to 3 styling_insights that explain why the selected products work together and why the shopper can feel confident in them. "
            "Prefer the most relevant and cohesive outfit direction for the shopper. "
            "If the request is vague, still choose the best provisional products and ask exactly one short follow-up question. "
            "Keep the reply concise, polished, emotionally aware, and customer-facing. "
            "Acknowledge the shopper's goal, mood, occasion, or hesitation when possible. "
            "Explain why the products work together in a stylist's voice, not a search engine voice. "
            "For complete_the_look, prioritize complementary pieces instead of duplicates. "
            "For get_inspired, translate the detected tags into a style direction and then choose matching products."
        )

    def _build_prompt_payload(
        self,
        mode: str,
        shopper_message: str,
        detected_tags: list[str],
        candidate_products: list[ProductRecommendation],
    ) -> str:
        merchant_context = self._merchant_context()
        payload = {
            "mode": mode,
            "shopper_message": shopper_message,
            "detected_tags": detected_tags,
            "merchant_context": merchant_context,
            "candidate_products": [
                {
                    "id": item.id,
                    "title": item.title,
                    "category": item.category,
                    "tags": item.tags,
                    "price": item.price,
                    "reason": item.reason,
                    "product_url": item.product_url,
                }
                for item in candidate_products
            ],
            "output_rules": {
                "reply": "1 to 2 short sentences, warm, elegant, empathetic, and styled like a professional human stylist. Do not list every product name.",
                "selected_product_ids": "1 to 3 IDs from candidate_products only",
                "styling_insights": "2 to 3 items. Each item needs a short title and one confidence-building explanation sentence.",
                "follow_up_question": "null when not needed, otherwise exactly one short question",
            },
        }
        return json.dumps(payload)

    def _merchant_context(self) -> dict:
        workspace = self.supabase_service.fetch_workspace_snapshot()

        return {
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
            "shopper_feedback": {
                "love_it": workspace.overview.feedback_summary.love_it,
                "show_another_option": workspace.overview.feedback_summary.show_another_option,
                "make_more_casual": workspace.overview.feedback_summary.make_more_casual,
                "change_colours": workspace.overview.feedback_summary.change_colours,
                "save_for_later": workspace.overview.feedback_summary.save_for_later,
                "top_preference_signals": workspace.overview.feedback_summary.top_preference_signals,
            },
        }

    def _select_products(
        self,
        candidates: list[ProductRecommendation],
        selected_ids: list[str],
    ) -> list[ProductRecommendation]:
        if not selected_ids:
            return []

        candidate_map = {item.id: item for item in candidates}
        selected = [candidate_map[item_id] for item_id in selected_ids if item_id in candidate_map]

        if selected:
            return selected[:3]

        return []

    def _join_product_titles(self, recommendations: list[ProductRecommendation]) -> str:
        titles = [item.title for item in recommendations[:3]]
        if not titles:
            return "a few strong catalog pieces"
        if len(titles) == 1:
            return titles[0]
        if len(titles) == 2:
            return f"{titles[0]} and {titles[1]}"
        return f"{titles[0]}, {titles[1]}, and {titles[2]}"
