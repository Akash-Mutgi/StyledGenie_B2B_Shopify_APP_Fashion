import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402
from app.models.schemas import MerchantStyleProfileSummary, MerchantStyleProfilesResponse  # noqa: E402
from app.routers import merchant as merchant_router  # noqa: E402


class MerchantStyleProfilesApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.original_fetch = merchant_router.supabase_service.fetch_merchant_style_profiles

    def tearDown(self):
        merchant_router.supabase_service.fetch_merchant_style_profiles = self.original_fetch

    def test_get_merchant_style_profiles_returns_profiles(self):
        merchant_router.supabase_service.fetch_merchant_style_profiles = lambda: MerchantStyleProfilesResponse(
            profiles=[
                MerchantStyleProfileSummary(
                    id="profile-1",
                    customerIdentifier="customer-1",
                    customerEmail="mia@example.com",
                    customerDisplayName="Mia Example",
                    name="Mia",
                    subtitle="Soft neutrals and elevated basics.",
                    completion=82,
                    completedFields=9,
                    totalFields=11,
                    isPrimary=True,
                    relationship="self",
                    gender="female",
                    sizeSummary="S / S / 39",
                    bodyType="hourglass",
                    budget="100_200",
                    styleSummary="Soft neutrals and elevated basics.",
                    updatedAt="2026-04-12T08:30:00+00:00",
                )
            ],
            updatedAt="2026-04-12T08:30:00+00:00",
        )

        response = self.client.get("/api/merchant/style-profiles")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["profiles"]), 1)
        self.assertEqual(payload["profiles"][0]["name"], "Mia")
        self.assertEqual(payload["profiles"][0]["completion"], 82)


if __name__ == "__main__":
    unittest.main()
