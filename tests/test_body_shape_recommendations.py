import unittest

from app.models.schemas import ShopperProfile, ShopperProfileInput
from app.services.recommendation_service import RecommendationService
from app.services.shopper_profile_service import ShopperProfileService


class BodyShapeRecommendationTests(unittest.TestCase):
    def test_scan_shape_is_preserved_in_shopper_profile(self) -> None:
        profile = ShopperProfileService().build_profile(
            message="Build my outfit",
            mode="outfit_curation",
            detected_tags=[],
            recent_messages=[],
            recent_events=[],
            profile_inputs=ShopperProfileInput(
                segment="womenswear",
                body_shape="hourglass",
            ),
        )

        self.assertEqual(profile.body_shape, "hourglass")
        self.assertIn("hourglass shape", profile.focus_points)

    def test_matching_silhouette_is_promoted_without_excluding_other_products(self) -> None:
        service = RecommendationService.__new__(RecommendationService)
        profile = ShopperProfile(body_shape="hourglass")
        wrap_dress = {
            "title": "Belted Wrap Midi Dress",
            "category": "Dresses",
            "description": "A fitted waist with a v-neck",
            "tags": [],
        }
        shift_dress = {
            "title": "Minimal Shift Dress",
            "category": "Dresses",
            "description": "A simple everyday dress",
            "tags": [],
        }

        self.assertGreater(
            service._body_shape_score(wrap_dress, profile),
            service._body_shape_score(shift_dress, profile),
        )
        self.assertEqual(service._body_shape_score(shift_dress, profile), 0)

    def test_inverted_triangle_alias_is_normalized(self) -> None:
        service = ShopperProfileService()
        self.assertEqual(service._normalize_body_shape("inverted_triangle"), "inverted")


if __name__ == "__main__":
    unittest.main()
