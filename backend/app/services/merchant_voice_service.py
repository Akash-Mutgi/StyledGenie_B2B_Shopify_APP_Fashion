from __future__ import annotations

import re
from typing import Optional

from app.models.schemas import MerchantChatbotVoiceConfig


TONE_BEHAVIOR_MAP = {
    "warm": "Use welcoming, supportive, human-centered phrasing.",
    "enthusiastic": "Sound encouraging and upbeat without becoming pushy.",
    "polished": "Use refined, premium, composed wording.",
    "confident": "Be decisive and clear, but never forceful.",
    "empathetic": "Acknowledge uncertainty or friction with reassuring language.",
    "playful": "Use light, tasteful personality when the moment allows it.",
    "minimal": "Keep wording lean and avoid extra embellishment.",
    "luxurious": "Frame the response with elevated, premium language.",
    "friendly": "Stay approachable and conversational.",
    "professional": "Keep the wording respectful, precise, and businesslike.",
}


class MerchantVoiceService:
    def default_config(self) -> MerchantChatbotVoiceConfig:
        return MerchantChatbotVoiceConfig()

    def normalize_config(self, payload: Optional[dict | MerchantChatbotVoiceConfig]) -> MerchantChatbotVoiceConfig:
        if isinstance(payload, MerchantChatbotVoiceConfig):
            return payload
        if isinstance(payload, dict):
            return MerchantChatbotVoiceConfig(**payload)
        return MerchantChatbotVoiceConfig()

    def build_style_metadata(self, payload: Optional[dict | MerchantChatbotVoiceConfig]) -> dict:
        config = self.normalize_config(payload)
        return {
            "tone": config.tone,
            "tone_behaviors": [TONE_BEHAVIOR_MAP[tone] for tone in config.tone if tone in TONE_BEHAVIOR_MAP],
            "use_headers": config.use_headers,
            "use_lists": config.use_lists,
            "use_emojis": config.use_emojis,
            "emoji_intensity": config.emoji_intensity,
            "response_length": config.response_length,
            "custom_instructions": config.custom_instructions,
            "target_market": config.target_market,
            "brand_description": config.brand_description,
            "avoid_phrases": config.avoid_phrases,
            "preferred_greeting_style": config.preferred_greeting_style,
        }

    def build_voice_system_prompt(
        self,
        payload: Optional[dict | MerchantChatbotVoiceConfig],
        *,
        audience: str = "shopper",
    ) -> str:
        config = self.normalize_config(payload)
        lines = [
            f"You are the {audience}-facing AI for this merchant.",
            "Match the merchant's configured communication style whenever it fits naturally.",
            "These preferences are lower priority than safety, honesty, catalog constraints, and product logic.",
            f"Tone: {', '.join(config.tone)}.",
        ]
        lines.extend(TONE_BEHAVIOR_MAP[tone] for tone in config.tone if tone in TONE_BEHAVIOR_MAP)
        lines.append(
            "Use short headers when the response benefits from structure."
            if config.use_headers
            else "Avoid extra headers unless they are absolutely necessary for clarity."
        )
        lines.append(
            "Prefer bullet or numbered lists when presenting multiple recommendations, options, or next steps."
            if config.use_lists
            else "Prefer clean prose over lists unless structure is required for clarity."
        )
        if config.use_emojis:
            lines.append(
                "Use emojis sparingly and tastefully."
                if config.emoji_intensity == "light"
                else "Use emojis in moderation, but keep them brand-safe and restrained."
            )
        else:
            lines.append("Do not use emojis.")

        if config.response_length == "concise":
            lines.append("Keep the response concise, fast to scan, and avoid extra explanation.")
        elif config.response_length == "detailed":
            lines.append("Give slightly richer explanation and context where it helps the shopper decide.")
        else:
            lines.append("Keep the response balanced: clear, useful, and not overly long.")

        if config.preferred_greeting_style:
            lines.append(f"Preferred greeting style: {config.preferred_greeting_style}.")
        if config.target_market:
            lines.append(f"Target market: {config.target_market}.")
        if config.brand_description:
            lines.append(f"Brand description: {config.brand_description}.")
        if config.avoid_phrases:
            lines.append(f"Avoid these phrases or framing: {config.avoid_phrases}.")
        if config.custom_instructions:
            lines.append(f"Merchant custom instructions: {config.custom_instructions}")

        return " ".join(line.strip() for line in lines if line and line.strip())

    def format_reply_text(
        self,
        reply: str,
        payload: Optional[dict | MerchantChatbotVoiceConfig],
    ) -> str:
        config = self.normalize_config(payload)
        normalized_reply = str(reply or "").replace("\r\n", "\n").strip()
        normalized_reply = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in normalized_reply.split("\n"))
        normalized_reply = re.sub(r"\n{3,}", "\n\n", normalized_reply).strip()
        if not normalized_reply:
            return normalized_reply

        if config.response_length == "concise":
            sentence_parts = re.split(r"(?<=[.!?])\s+", normalized_reply.replace("\n", " "))
            normalized_reply = " ".join(sentence_parts[:2]).strip()

        if not config.use_headers:
            normalized_reply = re.sub(
                r"\b(Outfit title|Outfit breakdown|Why this works|Optional safer or bolder variation):\s*",
                "",
                normalized_reply,
                flags=re.IGNORECASE,
            )

        return normalized_reply.strip()
