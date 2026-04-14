import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.schemas import (  # noqa: E402
    ChatInitRequest,
    ChatSelectProfileRequest,
    ChatSelectServiceRequest,
    ChatSessionContext,
    CustomerStyleProfilesResponse,
    StyleProfile,
)
from app.services.conversation_service import ConversationService  # noqa: E402


class ChatProfileEntryFlowTests(unittest.TestCase):
    def setUp(self):
        self.service = ConversationService()

    def test_initialize_chat_returns_new_customer_when_profiles_are_empty(self):
        updates = []
        self.service.supabase_service.ensure_chat_session = lambda customer_identifier: "session-1"
        self.service.supabase_service.fetch_customer_style_profiles = lambda **kwargs: CustomerStyleProfilesResponse(
            customerId="customer-1",
            customerEmail="maya@example.com",
            accountDisplayName="Maya",
            profiles=[],
        )
        self.service.supabase_service.fetch_chat_session_context = lambda session_id: None
        self.service.supabase_service.update_chat_session_context = (
            lambda session_id, **kwargs: updates.append((session_id, kwargs))
        )

        response = self.service.initialize_chat(
            ChatInitRequest(
                shopifyCustomerId="customer-1",
                customerEmail="maya@example.com",
                accountDisplayName="Maya",
                sessionId="browser-session-1",
                shopDomain="styledgenie-webshop.myshopify.com",
            )
        )

        self.assertEqual(response.mode, "NEW_CUSTOMER")
        self.assertEqual(response.sessionId, "session-1")
        self.assertEqual(response.myStyleUrl, "/account/profile")
        self.assertEqual(response.profiles, [])
        self.assertEqual(updates[0][1]["last_entry_mode"], "NEW_CUSTOMER")

    def test_initialize_chat_returns_returning_customer_with_active_profile(self):
        active_profile = StyleProfile(
            id="profile-1",
            isPrimary=True,
            name="Lisa",
            relationship="self",
            gender="female",
        )
        self.service.supabase_service.ensure_chat_session = lambda customer_identifier: "session-2"
        self.service.supabase_service.fetch_customer_style_profiles = lambda **kwargs: CustomerStyleProfilesResponse(
            customerId="customer-2",
            customerEmail="lisa@example.com",
            accountDisplayName="Lisa",
            profiles=[active_profile],
        )
        self.service.supabase_service.fetch_chat_session_context = lambda session_id: ChatSessionContext(
            sessionId=session_id,
            customerIdentifier="customer-2",
            activeProfileId="profile-1",
            selectedService="find_my_outfit",
            lastEntryMode="RETURNING_CUSTOMER",
        )
        self.service.supabase_service.update_chat_session_context = lambda session_id, **kwargs: None

        response = self.service.initialize_chat(
            ChatInitRequest(
                shopifyCustomerId="customer-2",
                customerEmail="lisa@example.com",
                accountDisplayName="Lisa",
                sessionId="browser-session-2",
                shopDomain="styledgenie-webshop.myshopify.com",
            )
        )

        self.assertEqual(response.mode, "RETURNING_CUSTOMER")
        self.assertEqual(response.activeProfileId, "profile-1")
        self.assertEqual(response.selectedService, "find_my_outfit")
        self.assertEqual(len(response.profiles), 1)
        self.assertEqual(response.profiles[0].name, "Lisa")
        self.assertTrue(response.profiles[0].isDefault)

    def test_effective_style_profile_id_uses_session_context(self):
        session_context = ChatSessionContext(
            sessionId="session-3",
            activeProfileId="profile-3",
        )

        self.assertEqual(
            self.service._effective_style_profile_id(None, session_context),
            "profile-3",
        )
        self.assertEqual(
            self.service._effective_style_profile_id("__manual_profile__", session_context),
            "__manual_profile__",
        )

    def test_select_active_profile_persists_session_context(self):
        updates = []
        self.service.supabase_service.fetch_chat_session_customer_identifier = lambda session_id: "customer-4"
        self.service.supabase_service.fetch_customer_style_profiles = lambda **kwargs: CustomerStyleProfilesResponse(
            customerId="customer-4",
            customerEmail="lisa@example.com",
            accountDisplayName="Lisa",
            profiles=[
                StyleProfile(
                    id="profile-4",
                    isPrimary=True,
                    name="Lisa",
                    relationship="self",
                    gender="female",
                )
            ],
        )
        self.service.supabase_service.update_chat_session_context = (
            lambda session_id, **kwargs: updates.append((session_id, kwargs))
        )

        response = self.service.select_active_profile(
            ChatSelectProfileRequest(
                sessionId="session-4",
                profileId="profile-4",
                customerEmail="lisa@example.com",
                accountDisplayName="Lisa",
            )
        )

        self.assertTrue(response.ok)
        self.assertEqual(response.activeProfileId, "profile-4")
        self.assertEqual(updates[0][1]["active_profile_id"], "profile-4")

    def test_select_active_profile_raises_for_unknown_profile(self):
        self.service.supabase_service.fetch_chat_session_customer_identifier = lambda session_id: "customer-5"
        self.service.supabase_service.fetch_customer_style_profiles = lambda **kwargs: CustomerStyleProfilesResponse(
            customerId="customer-5",
            customerEmail="maya@example.com",
            accountDisplayName="Maya",
            profiles=[],
        )

        with self.assertRaises(ValueError):
            self.service.select_active_profile(
                ChatSelectProfileRequest(
                    sessionId="session-5",
                    profileId="missing-profile",
                )
            )

    def test_select_service_persists_selected_service(self):
        updates = []
        self.service.supabase_service.fetch_chat_session_customer_identifier = lambda session_id: "customer-6"
        self.service.supabase_service.update_chat_session_context = (
            lambda session_id, **kwargs: updates.append((session_id, kwargs))
        )

        response = self.service.select_service(
            ChatSelectServiceRequest(
                sessionId="session-6",
                profileId="profile-6",
                service="customer_service",
            )
        )

        self.assertTrue(response.ok)
        self.assertEqual(response.service, "customer_service")
        self.assertEqual(response.profileId, "profile-6")
        self.assertEqual(updates[0][1]["selected_service"], "customer_service")


if __name__ == "__main__":
    unittest.main()
