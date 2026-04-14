import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402
from app.models.schemas import (  # noqa: E402
    ChatInitResponse,
    ChatSelectProfileResponse,
    ChatSelectServiceResponse,
)
from app.routers import chat as chat_router  # noqa: E402


class ChatEntryApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.original_initialize = chat_router.conversation_service.initialize_chat
        self.original_select_profile = chat_router.conversation_service.select_active_profile
        self.original_select_service = chat_router.conversation_service.select_service

    def tearDown(self):
        chat_router.conversation_service.initialize_chat = self.original_initialize
        chat_router.conversation_service.select_active_profile = self.original_select_profile
        chat_router.conversation_service.select_service = self.original_select_service

    def test_init_endpoint_returns_profile_first_payload(self):
        chat_router.conversation_service.initialize_chat = lambda payload: ChatInitResponse(
            sessionId="session-1",
            mode="RETURNING_CUSTOMER",
            profiles=[
                {
                    "id": "profile-1",
                    "name": "Lisa",
                    "relationshipLabel": "Self",
                    "summary": "Soft minimal neutrals",
                    "isDefault": True,
                }
            ],
            activeProfileId="profile-1",
            selectedService=None,
            myStyleUrl="/account/profile",
        )

        response = self.client.post(
            "/api/chat/init",
            json={
                "shopifyCustomerId": "customer-1",
                "customerEmail": "lisa@example.com",
                "sessionId": "browser-session-1",
                "shopDomain": "styledgenie-webshop.myshopify.com",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mode"], "RETURNING_CUSTOMER")
        self.assertEqual(payload["activeProfileId"], "profile-1")
        self.assertEqual(payload["myStyleUrl"], "/account/profile")

    def test_select_profile_endpoint_surfaces_not_found(self):
        def failing_select_profile(payload):
            raise ValueError("That style profile is not available for this customer session.")

        chat_router.conversation_service.select_active_profile = failing_select_profile

        response = self.client.post(
            "/api/chat/select-profile",
            json={"sessionId": "session-2", "profileId": "missing"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json()["detail"],
            "That style profile is not available for this customer session.",
        )

    def test_select_service_endpoint_returns_saved_service(self):
        chat_router.conversation_service.select_service = lambda payload: ChatSelectServiceResponse(
            ok=True,
            service="get_inspired",
            profileId="profile-2",
        )

        response = self.client.post(
            "/api/chat/select-service",
            json={"sessionId": "session-3", "profileId": "profile-2", "service": "get_inspired"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["service"], "get_inspired")
        self.assertEqual(payload["profileId"], "profile-2")


if __name__ == "__main__":
    unittest.main()
