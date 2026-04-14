import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.schemas import MerchantChatbotVoiceConfig  # noqa: E402
from app.services.supabase_service import SupabaseService  # noqa: E402


class MerchantVoiceFallbackTests(unittest.TestCase):
    def _build_service(self, runtime_dir: Path) -> SupabaseService:
        service = SupabaseService()
        service.get_client = lambda: None
        service.get_default_merchant_id = lambda: "merchant-voice-test"
        service._runtime_state_dir = lambda: runtime_dir
        return service

    def test_update_chatbot_voice_config_uses_local_fallback_when_supabase_is_unavailable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(Path(temp_dir))

            saved = service.update_chatbot_voice_config(
                MerchantChatbotVoiceConfig(
                    tone=["warm", "luxurious"],
                    use_emojis=True,
                    emoji_intensity="light",
                    response_length="detailed",
                    custom_instructions="Keep the tone premium and calm.",
                    target_market="Europe",
                )
            )

            self.assertTrue(saved)
            fallback_path = Path(temp_dir) / "chatbot-voice-config-merchant-voice-test.json"
            self.assertTrue(fallback_path.exists())

    def test_fetch_workspace_snapshot_reads_voice_config_from_local_fallback(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(Path(temp_dir))
            service.update_chatbot_voice_config(
                MerchantChatbotVoiceConfig(
                    tone=["friendly", "professional"],
                    use_headers=False,
                    use_lists=False,
                    use_emojis=False,
                    response_length="concise",
                    custom_instructions="Keep replies direct.",
                    target_market="Germany",
                )
            )

            snapshot = service.fetch_workspace_snapshot()

            self.assertEqual(snapshot.chatbot_voice_config.tone, ["friendly", "professional"])
            self.assertFalse(snapshot.chatbot_voice_config.use_headers)
            self.assertEqual(snapshot.chatbot_voice_config.target_market, "Germany")


if __name__ == "__main__":
    unittest.main()
