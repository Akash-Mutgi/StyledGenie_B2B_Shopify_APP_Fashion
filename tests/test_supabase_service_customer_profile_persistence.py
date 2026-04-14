import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.schemas import CustomerStyleProfilesRequest, StyleProfile  # noqa: E402
from app.services.supabase_service import (  # noqa: E402
    CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
    CUSTOMER_STYLE_PROFILE_TITLE_PREFIX,
    SupabaseService,
)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.filters = []
        self.limit_count = None
        self.action = "select"
        self.insert_payload = None
        self.update_payload = None

    def select(self, _columns: str):
        self.action = "select"
        return self

    def eq(self, key: str, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key: str, values):
        self.filters.append(("in", key, list(values)))
        return self

    def limit(self, count: int):
        self.limit_count = count
        return self

    def order(self, _column: str, desc: bool = False):
        return self

    def update(self, payload: dict):
        self.action = "update"
        self.update_payload = payload
        return self

    def insert(self, payload):
        self.action = "insert"
        self.insert_payload = payload
        return self

    def execute(self):
        if self.table_name == "customer_style_profiles":
            raise Exception("missing relation public.customer_style_profiles")

        if self.table_name != "knowledge_base_entries":
            return FakeResponse([])

        if self.action == "insert":
            payload = dict(self.insert_payload)
            payload.setdefault("id", f"row-{len(self.client.knowledge_base_entries) + 1}")
            self.client.knowledge_base_entries.append(payload)
            return FakeResponse([payload])

        rows = self.client.knowledge_base_entries
        matched = [row for row in rows if self._matches(row)]
        if self.limit_count is not None:
            matched = matched[: self.limit_count]

        if self.action == "update":
            for row in matched:
                row.update(self.update_payload or {})
            return FakeResponse(matched)

        return FakeResponse(matched)

    def _matches(self, row: dict) -> bool:
        for operator, key, value in self.filters:
            if operator == "eq" and row.get(key) != value:
                return False
            if operator == "in" and row.get(key) not in value:
                return False
        return True


class FakeClient:
    def __init__(self):
        self.knowledge_base_entries = []

    def table(self, table_name: str):
        return FakeQuery(self, table_name)


class CustomerStyleProfilePersistenceTests(unittest.TestCase):
    def _build_service(self, client: FakeClient) -> SupabaseService:
        service = SupabaseService()
        service.get_client = lambda: client
        service.get_default_merchant_id = lambda: "merchant-1"
        return service

    def test_save_customer_style_profiles_uses_persistent_knowledge_base_fallback(self):
        client = FakeClient()
        service = self._build_service(client)

        response = service.save_customer_style_profiles(
            CustomerStyleProfilesRequest(
                customerEmail="shopper@example.com",
                accountDisplayName="Shopper Example",
                profiles=[
                    StyleProfile(
                        id="profile-1",
                        isPrimary=True,
                        name="Shopper Example",
                        relationship="self",
                        shoppingCategoryPreference="womenswear",
                        gender="female",
                        favoriteColorPalette=["black", "cream"],
                        fabricAllergies=["None"],
                        minBudget=90,
                        maxBudget=180,
                    )
                ],
            )
        )

        self.assertTrue(response.persisted)
        self.assertEqual(response.message, "Style profiles saved.")
        self.assertEqual(len(client.knowledge_base_entries), 1)
        row = client.knowledge_base_entries[0]
        self.assertEqual(row["entry_type"], CUSTOMER_STYLE_PROFILE_ENTRY_TYPE)
        self.assertEqual(
            row["title"],
            f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}shopper@example.com",
        )

    def test_fetch_customer_style_profiles_reads_persistent_knowledge_base_fallback(self):
        client = FakeClient()
        client.knowledge_base_entries.append(
            {
                "id": "row-1",
                "merchant_id": "merchant-1",
                "title": f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}shopper@example.com",
                "entry_type": CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
                "created_at": "2026-04-11T00:00:00+00:00",
                "body": json.dumps(
                    {
                        "customerId": "shopper@example.com",
                        "customerEmail": "shopper@example.com",
                        "accountDisplayName": "Shopper Example",
                        "profiles": [
                            {
                                "id": "profile-1",
                                "isPrimary": True,
                                "name": "Shopper Example",
                                "relationship": "self",
                                "shoppingCategoryPreference": "womenswear",
                                "gender": "female",
                                "sizes": {"top": "S", "bottom": "M", "shoeEu": "42"},
                                "features": {"bodyType": "rectangle"},
                                "favoriteColorPalette": ["navy", "cream"],
                                "fabricAllergies": ["None"],
                                "minBudget": 80,
                                "maxBudget": 160,
                                "vibe": {"styleDescription": "Clean and polished"},
                                "styleAnalysis": {"summary": "Minimal and refined", "tags": ["minimal"]},
                                "source": {"method": "manual"},
                                "createdAt": "2026-04-11T00:00:00+00:00",
                                "updatedAt": "2026-04-11T00:00:00+00:00",
                            }
                        ],
                        "updatedAt": "2026-04-11T00:00:00+00:00",
                    }
                ),
            }
        )
        service = self._build_service(client)

        response = service.fetch_customer_style_profiles(
            customer_identifier=None,
            customer_email="shopper@example.com",
            account_display_name="Shopper Example",
        )

        self.assertTrue(response.persisted)
        self.assertEqual(response.customerEmail, "shopper@example.com")
        self.assertEqual(len(response.profiles), 1)
        self.assertEqual(response.profiles[0].name, "Shopper Example")
        self.assertEqual(response.profiles[0].styleAnalysis.summary, "Minimal and refined")
        self.assertEqual(response.profiles[0].shoppingCategoryPreference, "womenswear")
        self.assertEqual(response.profiles[0].favoriteColorPalette, ["navy", "cream"])

    def test_fetch_customer_style_profiles_matches_email_prefixed_identifier(self):
        client = FakeClient()
        client.knowledge_base_entries.append(
            {
                "id": "row-1",
                "merchant_id": "merchant-1",
                "title": f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}shopper@example.com",
                "entry_type": CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
                "created_at": "2026-04-11T00:00:00+00:00",
                "body": json.dumps(
                    {
                        "customerId": "shopper@example.com",
                        "customerEmail": "shopper@example.com",
                        "accountDisplayName": "Shopper Example",
                        "profiles": [
                            {
                                "id": "profile-1",
                                "isPrimary": True,
                                "name": "Shopper Example",
                                "relationship": "self",
                                "shoppingCategoryPreference": "womenswear",
                                "gender": "female",
                            }
                        ],
                        "updatedAt": "2026-04-11T00:00:00+00:00",
                    }
                ),
            }
        )
        service = self._build_service(client)

        response = service.fetch_customer_style_profiles(
            customer_identifier="email:shopper@example.com",
            customer_email=None,
            account_display_name="Shopper Example",
        )

        self.assertTrue(response.persisted)
        self.assertEqual(response.customerId, "shopper@example.com")
        self.assertEqual(len(response.profiles), 1)

    def test_save_customer_style_profiles_updates_all_knowledge_base_alias_titles(self):
        client = FakeClient()
        service = self._build_service(client)

        response = service.save_customer_style_profiles(
            CustomerStyleProfilesRequest(
                customerId="email:shopper@example.com",
                customerEmail="Shopper@Example.com",
                accountDisplayName="Shopper Example",
                profiles=[
                    StyleProfile(
                        id="profile-1",
                        isPrimary=True,
                        name="Shopper Example",
                        relationship="self",
                        shoppingCategoryPreference="womenswear",
                        gender="female",
                    )
                ],
            )
        )

        self.assertTrue(response.persisted)
        self.assertEqual(len(client.knowledge_base_entries), 1)
        self.assertEqual(
            client.knowledge_base_entries[0]["title"],
            f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}shopper@example.com",
        )

    def test_fetch_merchant_style_profiles_dedupes_alias_rows_from_knowledge_base(self):
        client = FakeClient()
        payload = json.dumps(
            {
                "customerId": "12345",
                "customerEmail": "shopper@example.com",
                "accountDisplayName": "Shopper Example",
                "profiles": [
                    {
                        "id": "profile-1",
                        "isPrimary": True,
                        "name": "Shopper Example",
                        "relationship": "self",
                        "shoppingCategoryPreference": "womenswear",
                        "gender": "female",
                    }
                ],
                "updatedAt": "2026-04-11T00:00:00+00:00",
            }
        )
        client.knowledge_base_entries.extend(
            [
                {
                    "id": "row-1",
                    "merchant_id": "merchant-1",
                    "title": f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}12345",
                    "entry_type": CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
                    "created_at": "2026-04-11T00:00:00+00:00",
                    "body": payload,
                },
                {
                    "id": "row-2",
                    "merchant_id": "merchant-1",
                    "title": f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}shopper@example.com",
                    "entry_type": CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
                    "created_at": "2026-04-11T00:00:00+00:00",
                    "body": payload,
                },
            ]
        )
        service = self._build_service(client)

        response = service.fetch_merchant_style_profiles()

        self.assertEqual(len(response.profiles), 1)
        self.assertEqual(response.profiles[0].customerEmail, "shopper@example.com")


if __name__ == "__main__":
    unittest.main()
