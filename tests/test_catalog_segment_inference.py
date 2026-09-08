import unittest

from app.services.supabase_service import SupabaseService


class CatalogSegmentInferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = SupabaseService()

    def test_resolves_opaque_target_gender_reference_from_group_evidence(self) -> None:
        products = [
            {
                "title": "Men's Leather Jacket",
                "category": "Outerwear",
                "tags": ["target gender:gid://shopify/metaobject/mens"],
            },
            {
                "title": "Classic Polo",
                "category": "Clothing Tops",
                "tags": ["target gender:gid://shopify/metaobject/mens"],
            },
            {
                "title": "Floral Midi Dress",
                "category": "Dresses",
                "tags": ["target gender:gid://shopify/metaobject/womens"],
            },
            {
                "title": "Tailored Blazer",
                "category": "Outerwear",
                "tags": ["target gender:gid://shopify/metaobject/womens"],
            },
        ]

        resolved = self.service._apply_catalog_segments(products)

        self.assertEqual(resolved[1]["segment"], "menswear")
        self.assertEqual(resolved[3]["segment"], "womenswear")

    def test_does_not_force_ambiguous_or_unsupported_products_into_a_segment(self) -> None:
        products = [
            {"title": "Unisex Jogger", "category": "Pants", "tags": []},
            {"title": "Classic T-Shirt", "category": "Clothing Tops", "tags": []},
        ]

        resolved = self.service._apply_catalog_segments(products)

        self.assertIsNone(resolved[0]["segment"])
        self.assertIsNone(resolved[1]["segment"])


if __name__ == "__main__":
    unittest.main()
