import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402
from app.models.schemas import (  # noqa: E402
    ChatSelectProfileResponse,
    CustomerStyleProfilesResponse,
    StyleProfileAnalysis,
    StyleProfileFeatures,
    StyleProfileScanResponse,
    StyleProfileScanSuggestion,
    StyleProfileVibe,
    StyleProfile,
    StyleProfileImageValidation,
)
from app.routers import customer_profiles as customer_profiles_router  # noqa: E402
from app.services.vision_service import VisionAnalysis  # noqa: E402


class CustomerProfileCreationApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.original_validate = customer_profiles_router.vision_service.validate_profile_setup_image
        self.original_analyze_image = customer_profiles_router.vision_service.analyze_image
        self.original_scan_analyze = customer_profiles_router.openai_service.analyze_style_profile_scan
        self.original_fetch = customer_profiles_router.supabase_service.fetch_customer_style_profiles
        self.original_save = customer_profiles_router.supabase_service.save_customer_style_profiles
        self.original_select_active = customer_profiles_router.conversation_service.select_active_profile
        customer_profiles_router._pending_scan_handoffs.clear()

    def tearDown(self):
        customer_profiles_router.vision_service.validate_profile_setup_image = self.original_validate
        customer_profiles_router.vision_service.analyze_image = self.original_analyze_image
        customer_profiles_router.openai_service.analyze_style_profile_scan = self.original_scan_analyze
        customer_profiles_router.supabase_service.fetch_customer_style_profiles = self.original_fetch
        customer_profiles_router.supabase_service.save_customer_style_profiles = self.original_save
        customer_profiles_router.conversation_service.select_active_profile = self.original_select_active

    def test_validate_image_endpoint_returns_safe_guidance_payload(self):
        customer_profiles_router.vision_service.validate_profile_setup_image = lambda **kwargs: StyleProfileImageValidation(
            ok=True,
            fullBodyLikelyVisible=True,
            guidance=["One person was detected in the frame.", "Full body likely visible."],
            qualityWarnings=[],
        )

        response = self.client.post(
            "/api/profiles/validate-image",
            json={
                "imageName": "full-body.jpg",
                "imageContentBase64": "dGVzdA==",
                "imageMimeType": "image/jpeg",
                "sourceMethod": "upload",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["result"]["fullBodyLikelyVisible"])

    def test_analyze_image_endpoint_returns_safe_editable_suggestions(self):
        customer_profiles_router.vision_service.validate_profile_setup_image = lambda **kwargs: StyleProfileImageValidation(
            ok=True,
            fullBodyLikelyVisible=True,
            guidance=["Full body likely visible."],
            qualityWarnings=[],
        )
        customer_profiles_router.vision_service.analyze_image = lambda **kwargs: VisionAnalysis(
            labels=["Person"],
            objects=["Person"],
            colors=["dark brown", "brown"],
            summary="Single person in frame.",
            source="google-vision-rest",
        )
        customer_profiles_router.openai_service.analyze_style_profile_scan = lambda **kwargs: StyleProfileScanResponse(
            suggestion=StyleProfileScanSuggestion(
                features=StyleProfileFeatures(
                    bodyType="athletic",
                    skinTone="medium",
                    hairColor="dark brown",
                    eyeColor="brown",
                ),
                vibe=StyleProfileVibe(styleDescription="Polished casual read."),
                styleAnalysis=StyleProfileAnalysis(summary="Helpful scan summary.", tags=["neutral"]),
                observationLines=["Hair reads as dark brown.", "Eye color reads as brown."],
                qualityNote="Please review every detail manually before saving.",
            ),
            message="Analysis complete.",
        )

        response = self.client.post(
            "/api/profiles/analyze-image",
            json={
                "imageName": "full-body.jpg",
                "imageContentBase64": "dGVzdA==",
                "imageMimeType": "image/jpeg",
                "sourceMethod": "upload",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["result"]["hairColor"], "dark brown")
        self.assertEqual(payload["result"]["eyeColor"], "brown")
        self.assertNotIn("bodyType", payload["result"])
        self.assertNotIn("skinTone", payload["result"])

    def test_create_profile_endpoint_appends_new_profile(self):
        customer_profiles_router.supabase_service.fetch_customer_style_profiles = lambda **kwargs: CustomerStyleProfilesResponse(
            customerId="customer-1",
            customerEmail="maya@example.com",
            accountDisplayName="Maya",
            profiles=[],
        )

        def fake_save(payload):
            return CustomerStyleProfilesResponse(
                customerId=payload.customerId or "customer-1",
                customerEmail=payload.customerEmail,
                accountDisplayName=payload.accountDisplayName,
                profiles=payload.profiles,
                persisted=True,
                message="Style profiles saved.",
            )

        customer_profiles_router.supabase_service.save_customer_style_profiles = fake_save

        response = self.client.post(
            "/api/profiles",
            json={
                "sessionId": "session-1",
                "shopifyCustomerId": "customer-1",
                "customerEmail": "maya@example.com",
                "accountDisplayName": "Maya",
                "profileName": "Maya",
                "shoppingCategoryPreference": "womenswear",
                "topSize": "S",
                "bottomSize": "28",
                "shoeSize": "39",
                "favoriteColorPalette": ["cream", "black"],
                "fabricAllergies": ["None"],
                "minBudget": 100,
                "maxBudget": 180,
                "sourceMethod": "upload",
                "imageValidation": {
                    "ok": True,
                    "fullBodyLikelyVisible": True,
                    "guidance": ["Full body likely visible."],
                    "qualityWarnings": [],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["profile"]["name"], "Maya")
        self.assertEqual(payload["profile"]["shoppingCategoryPreference"], "womenswear")

    def test_set_active_profile_endpoint_returns_saved_profile_id(self):
        customer_profiles_router.conversation_service.select_active_profile = lambda payload: ChatSelectProfileResponse(
            ok=True,
            activeProfileId="profile-123",
        )

        response = self.client.post(
            "/api/profiles/set-active",
            json={"sessionId": "session-2", "profileId": "profile-123"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["activeProfileId"], "profile-123")

    def test_scan_handoff_store_and_consume_round_trip(self):
        store_response = self.client.post(
            "/api/profiles/scan-handoff",
            json={
                "customerId": "customer-42",
                "customerEmail": "maya@example.com",
                "sessionId": "session-42",
                "scanPayload": {
                    "method": "upload",
                    "imageName": "look.jpg",
                    "imageValidation": {
                        "ok": True,
                        "fullBodyLikelyVisible": True,
                        "guidance": ["Full body likely visible."],
                        "qualityWarnings": [],
                    },
                    "analysisResult": {
                        "hairColor": "dark brown",
                        "eyeColor": "brown",
                        "guidance": ["Analysis complete."],
                        "qualityWarnings": [],
                    },
                },
            },
        )

        self.assertEqual(store_response.status_code, 200)
        self.assertTrue(store_response.json()["hasPending"])

        consume_response = self.client.get(
            "/api/profiles/scan-handoff",
            params={"customer_id": "customer-42"},
        )
        self.assertEqual(consume_response.status_code, 200)
        consume_payload = consume_response.json()
        self.assertTrue(consume_payload["hasPending"])
        self.assertEqual(consume_payload["scanPayload"]["method"], "upload")
        self.assertTrue(consume_payload["scanPayload"]["imageValidation"]["ok"])

        empty_response = self.client.get(
            "/api/profiles/scan-handoff",
            params={"customer_id": "customer-42"},
        )
        self.assertEqual(empty_response.status_code, 200)
        self.assertFalse(empty_response.json()["hasPending"])

    def test_scan_handoff_consume_with_fallback_returns_latest_pending_payload(self):
        first_store = self.client.post(
            "/api/profiles/scan-handoff",
            json={
                "customerId": "customer-a",
                "sessionId": "session-a",
                "scanPayload": {
                    "method": "camera",
                    "imageName": "a.jpg",
                    "imageValidation": {"ok": True, "fullBodyLikelyVisible": True},
                    "analysisResult": {},
                },
            },
        )
        self.assertEqual(first_store.status_code, 200)

        second_store = self.client.post(
            "/api/profiles/scan-handoff",
            json={
                "customerId": "customer-b",
                "sessionId": "session-b",
                "scanPayload": {
                    "method": "upload",
                    "imageName": "b.jpg",
                    "imageValidation": {"ok": True, "fullBodyLikelyVisible": True},
                    "analysisResult": {},
                },
            },
        )
        self.assertEqual(second_store.status_code, 200)

        fallback_consume = self.client.get(
            "/api/profiles/scan-handoff",
            params={"customer_id": "missing-customer", "allow_fallback": "true"},
        )
        self.assertEqual(fallback_consume.status_code, 200)
        payload = fallback_consume.json()
        self.assertTrue(payload["hasPending"])
        self.assertEqual(payload["scanPayload"]["imageName"], "b.jpg")


if __name__ == "__main__":
    unittest.main()
