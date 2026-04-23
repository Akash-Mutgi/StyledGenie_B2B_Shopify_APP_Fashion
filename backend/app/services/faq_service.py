from typing import Optional

from app.models.schemas import CustomerCareSettings, FAQItem
from app.services.supabase_service import SupabaseService


class FAQService:
    def __init__(self) -> None:
        self.supabase_service = SupabaseService()
        self.fallback_items = [
            FAQItem(
                question="What is your shipping policy?",
                answer=(
                    "StyledGenie ships within Germany with standard and express options, within the EU outside "
                    "Germany with standard shipping, and internationally outside the EU with standard shipping for "
                    "orders of EUR 70 or more. Delivery windows are estimates in business days after dispatch."
                ),
            ),
            FAQItem(
                question="What are the Germany shipping rates and delivery times?",
                answer=(
                    "Germany standard shipping costs EUR 6.99 for orders up to EUR 59.99 and is free from EUR 60, "
                    "with an estimated delivery of 0 to 14 business days. Germany express shipping costs EUR 14.99 "
                    "up to EUR 79.99 and is free from EUR 80, with an estimated delivery of 0 to 7 business days."
                ),
            ),
            FAQItem(
                question="What is your return and refund policy?",
                answer=(
                    "EU consumers can withdraw within 30 days of receiving the order. Items must be unworn, "
                    "unwashed, in original condition, and returned within 14 days after notifying StyledGenie. "
                    "Approved refunds are sent to the original payment method within 7 to 10 business days. "
                    "Shipping fees, customs duties, and handling charges are non-refundable."
                ),
            ),
        ]

    def get_faqs(self) -> list[FAQItem]:
        supabase_items = self.supabase_service.fetch_faqs()
        if supabase_items:
            return supabase_items
        return self.fallback_items

    def _best_faq_match(self, message: str) -> Optional[FAQItem]:
        keywords = [word.strip(".,!?").lower() for word in message.split() if len(word) > 2]
        best_item = None
        best_score = 0

        for item in self.get_faqs():
            haystack = f"{item.question} {item.answer}".lower()
            score = sum(1 for word in keywords if word in haystack)

            if score > best_score:
                best_score = score
                best_item = item

        if best_score > 0:
            return best_item

        return None

    def _shorten_answer(self, answer: str) -> str:
        sentences = [part.strip() for part in answer.split(". ") if part.strip()]
        if not sentences:
            return answer

        short_answer = ". ".join(sentences[:2]).strip()
        if not short_answer.endswith("."):
            short_answer += "."
        return short_answer

    def _concise_policy_answer(
        self,
        lowered: str,
        care_settings: Optional[CustomerCareSettings] = None,
    ) -> Optional[str]:
        support_email = (
            care_settings.support_email.strip()
            if care_settings and care_settings.support_email.strip()
            else "info@styledgenie.com"
        )
        support_phone = (
            care_settings.support_phone.strip()
            if care_settings and care_settings.support_phone.strip()
            else "+49 17622511128"
        )
        if "tracking" in lowered or "track order" in lowered:
            return (
                "Tell me your order number and the email used at checkout, and I’ll check the latest order status for you."
            )

        if any(word in lowered for word in ["germany", "berlin", "munich", "deutschland"]) and any(
            word in lowered for word in ["shipping", "delivery", "rate", "cost", "arrive", "express"]
        ):
            return (
                "Germany shipping: standard is EUR 6.99 under EUR 60 and free from EUR 60, with delivery "
                "in 0 to 14 business days. Express is EUR 14.99 under EUR 80 and free from EUR 80, with "
                "delivery in 0 to 7 business days."
            )

        if any(word in lowered for word in ["eu", "europe", "european union"]) and any(
            word in lowered for word in ["shipping", "delivery", "rate", "cost", "arrive"]
        ):
            return (
                "EU shipping outside Germany is standard only: EUR 12.99 up to EUR 70, free above EUR 70, "
                "with delivery in 0 to 14 business days."
            )

        if any(word in lowered for word in ["international", "outside eu", "worldwide", "customs"]) and any(
            word in lowered for word in ["shipping", "delivery", "rate", "cost", "arrive", "duty", "duties", "tax"]
        ):
            return (
                "International shipping outside the EU is available from EUR 70. Shipping costs EUR 12.99, "
                "delivery is estimated at 0 to 21 business days, and local duties or taxes may apply."
            )

        if any(word in lowered for word in ["shipping", "delivery", "arrive"]):
            return (
                "We ship across Germany, the EU, and selected international destinations. Germany offers "
                "standard and express shipping, EU orders ship standard, and international orders outside "
                "the EU are available from EUR 70."
            )

        if any(word in lowered for word in ["processing", "dispatch", "tracking"]):
            return (
                "Orders usually process in 1 to 2 business days before dispatch, and tracking is sent once "
                "the parcel leaves our facility."
            )

        if any(word in lowered for word in ["return", "withdrawal", "widerruf"]):
            return (
                "You have 30 days from delivery to request a return. Email info@styledgenie.com with your "
                "order number, then send the items back within 14 days after notifying us."
            )

        if any(word in lowered for word in ["refund", "money back"]):
            return (
                "Approved refunds are sent to your original payment method within 7 to 10 business days "
                "after the return is received and inspected."
            )

        if any(word in lowered for word in ["exchange", "replace", "replacement"]):
            return (
                "We do not offer direct exchanges. Please return the item for a refund and place a new order."
            )

        if any(word in lowered for word in ["damaged", "defective", "incorrect", "wrong item", "faulty"]):
            return (
                f"If your item is damaged, defective, or incorrect, email {support_email} with photos. "
                "We will cover return shipping and arrange a refund or replacement."
            )

        if any(word in lowered for word in ["contact", "support", "email", "phone"]):
            return (
                f"You can reach StyledGenie at {support_email} or call {support_phone}. "
                "Chat support is also available 24/7 on styledgenie.com."
            )

        return None

    def answer_question(
        self,
        message: str,
        care_settings: Optional[CustomerCareSettings] = None,
    ) -> str:
        lowered = message.lower()
        concise_answer = self._concise_policy_answer(lowered, care_settings)
        if concise_answer is not None:
            return concise_answer

        best_item = self._best_faq_match(message)
        if best_item is not None:
            return self._shorten_answer(best_item.answer)

        if any(word in lowered for word in ["return", "refund", "exchange"]):
            support_email = (
                care_settings.support_email.strip()
                if care_settings and care_settings.support_email.strip()
                else "info@styledgenie.com"
            )
            return (
                "Return policy: EU consumers can withdraw within 30 days of receiving an order. "
                "Items must be unworn, unwashed, in original condition with tags attached, and shipped back "
                f"within 14 days after notifying {support_email}. Approved refunds are processed within "
                "7 to 10 business days. Direct exchanges are not offered."
            )

        if any(word in lowered for word in ["shipping", "delivery", "arrive"]):
            return (
                "Shipping policy: Germany offers standard and express shipping, the EU outside Germany offers "
                "standard shipping, and international orders outside the EU are available from EUR 70 with a "
                "EUR 12.99 shipping rate. Processing usually takes 1 to 2 business days before dispatch."
            )

        if any(word in lowered for word in ["size", "sizing", "fit", "measurements"]):
            return (
                "Sizing help: use the product size chart and compare it with a garment you already own."
            )

        return (
            "I can currently help with shipping, returns, refunds, exchanges, damaged items, and sizing. "
            "Please ask one of those support topics for a quick answer."
        )
