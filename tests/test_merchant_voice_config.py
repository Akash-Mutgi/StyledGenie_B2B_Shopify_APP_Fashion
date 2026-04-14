import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402
from app.models.schemas import MerchantChatbotVoiceConfig  # noqa: E402
from app.routers import merchant as merchant_router  # noqa: E402
from app.services.merchant_voice_service import MerchantVoiceService  # noqa: E402


class MerchantVoiceConfigTests(unittest.TestCase):
    def setUp(self):
        self.voice_service = MerchantVoiceService()

    def test_model_normalizes_tones_and_emoji_rules(self):
        config = MerchantChatbotVoiceConfig(
            tone=["Warm", "polished", "warm"],
            use_emojis=False,
            emoji_intensity="moderate",
        )

        self.assertEqual(config.tone, ["warm", "polished"])
        self.assertEqual(config.emoji_intensity, "none")

    def test_voice_system_prompt_contains_merchant_guidance(self):
        prompt = self.voice_service.build_voice_system_prompt(
            MerchantChatbotVoiceConfig(
                tone=["warm", "polished", "professional"],
                use_headers=True,
                use_lists=False,
                use_emojis=True,
                emoji_intensity="light",
                response_length="concise",
                custom_instructions="Sound premium and encouraging.",
                target_market="Europe",
                brand_description="Premium AI styling concierge",
                avoid_phrases="cheap, bargain",
                preferred_greeting_style="Warm and polished",
            ),
            audience="shopper-facing stylist",
        )

        self.assertIn("Tone: warm, polished, professional.", prompt)
        self.assertIn("Target market: Europe.", prompt)
        self.assertIn("Avoid these phrases or framing: cheap, bargain.", prompt)
        self.assertIn("Merchant custom instructions: Sound premium and encouraging.", prompt)

    def test_format_reply_text_strips_headers_for_headerless_mode(self):
        reply = self.voice_service.format_reply_text(
            "Outfit title: Sharp dinner look.\nWhy this works: The palette stays clean and confident.",
            MerchantChatbotVoiceConfig(use_headers=False, response_length="balanced"),
        )

        self.assertNotIn("Outfit title:", reply)
        self.assertNotIn("Why this works:", reply)
        self.assertIn("Sharp dinner look.", reply)


class MerchantVoiceApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.original_fetch = merchant_router.supabase_service.fetch_chatbot_voice_config
        self.original_update = merchant_router.supabase_service.update_chatbot_voice_config

    def tearDown(self):
        merchant_router.supabase_service.fetch_chatbot_voice_config = self.original_fetch
        merchant_router.supabase_service.update_chatbot_voice_config = self.original_update

    def test_get_voice_config_returns_normalized_defaults(self):
        merchant_router.supabase_service.fetch_chatbot_voice_config = lambda: MerchantChatbotVoiceConfig()

        response = self.client.get("/api/merchant/chatbot/voice-config")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["tone"], ["warm", "polished", "empathetic"])
        self.assertEqual(payload["emoji_intensity"], "none")

    def test_put_voice_config_persists_and_returns_normalized_payload(self):
        saved_configs = []

        def fake_update(config):
            saved_configs.append(config)
            return True

        merchant_router.supabase_service.update_chatbot_voice_config = fake_update
        merchant_router.supabase_service.fetch_chatbot_voice_config = lambda: saved_configs[-1]

        response = self.client.put(
            "/api/merchant/chatbot/voice-config",
            json={
                "tone": ["Warm", "luxurious", "warm"],
                "use_headers": True,
                "use_lists": True,
                "use_emojis": False,
                "emoji_intensity": "moderate",
                "response_length": "detailed",
                "custom_instructions": "Keep it premium.",
                "target_market": "Europe",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["tone"], ["warm", "luxurious"])
        self.assertEqual(payload["emoji_intensity"], "none")
        self.assertEqual(saved_configs[-1].custom_instructions, "Keep it premium.")


if __name__ == "__main__":
    unittest.main()
