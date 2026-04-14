import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.schemas import ShopperProfileInput, StyleProfile  # noqa: E402
from app.services.conversation_service import ConversationService  # noqa: E402


class ConversationSessionIdentityTests(unittest.TestCase):
    def setUp(self):
        self.service = ConversationService()

    def test_guest_customer_identifier_uses_email_when_available(self):
        identifier = self.service._conversation_customer_identifier(
            "shopify-storefront-guest",
            "mia@example.com",
        )

        self.assertEqual(identifier, "email:mia@example.com")

    def test_history_inference_is_disabled_for_unidentified_guests(self):
        should_use_history = self.service._should_use_history_for_profile_inference(
            customer_identifier="shopify-storefront-guest",
            customer_email=None,
            saved_style_profile=None,
            explicit_segment=None,
            profile_inputs=None,
        )

        self.assertFalse(should_use_history)

    def test_history_inference_stays_enabled_for_saved_profiles(self):
        should_use_history = self.service._should_use_history_for_profile_inference(
            customer_identifier="shopify-storefront-guest",
            customer_email=None,
            saved_style_profile=StyleProfile(
                id="profile-1",
                isPrimary=True,
                name="Mia",
                relationship="self",
                gender="female",
            ),
            explicit_segment=None,
            profile_inputs=ShopperProfileInput(),
        )

        self.assertTrue(should_use_history)


if __name__ == "__main__":
    unittest.main()
