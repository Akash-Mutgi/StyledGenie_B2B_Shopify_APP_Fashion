import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.models.schemas import StyleProfile  # noqa: E402
from app.services.shopper_profile_service import ShopperProfileService  # noqa: E402


class ShopperProfileServiceSavedProfileTests(unittest.TestCase):
    def setUp(self):
        self.service = ShopperProfileService()

    def test_shopping_category_preference_sets_segment_before_gender(self):
        profile = StyleProfile(
            id="profile-1",
            isPrimary=True,
            name="Mia",
            relationship="self",
            shoppingCategoryPreference="womenswear",
            gender="male",
            sizes={"top": "S", "bottom": "S", "shoeEu": "39"},
            minBudget=100,
            maxBudget=200,
        )

        shopper_profile = self.service.build_profile(
            message="Style me for a dinner date",
            mode="outfit_curation",
            detected_tags=[],
            recent_messages=[],
            recent_events=[],
            profile_inputs=None,
            saved_style_profile=profile,
        )

        self.assertEqual(shopper_profile.segment_preference, "womenswear")

    def test_saved_profile_segment_accessor_returns_both_when_profile_allows_both_catalogs(self):
        profile = StyleProfile(
            id="profile-2",
            isPrimary=True,
            name="Lia",
            relationship="self",
            shoppingCategoryPreference="both",
            gender="female",
        )

        self.assertEqual(
            self.service.segment_from_saved_style_profile(profile),
            "both",
        )


if __name__ == "__main__":
    unittest.main()
