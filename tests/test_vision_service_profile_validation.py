import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.vision_service import VisionAnalysis, VisionService  # noqa: E402


class VisionServiceProfileValidationTests(unittest.TestCase):
    def test_single_person_warning_does_not_block_continue_when_full_body_is_visible(self):
        service = VisionService()
        service.analyze_image = lambda **kwargs: VisionAnalysis(  # type: ignore[assignment]
            labels=[],
            objects=[],
            person_count=0,
            colors=["black", "white"],
        )
        service._extract_image_dimensions = lambda *_args, **_kwargs: (1400, 2200)  # type: ignore[assignment]

        result = service.validate_profile_setup_image(
            image_reference="full-body.jpg",
            image_content_base64="dGVzdA==",
            image_mime_type="image/jpeg",
        )

        self.assertTrue(result.ok)
        self.assertTrue(result.fullBodyLikelyVisible)
        self.assertIn("please include one person clearly in frame.", result.qualityWarnings)

    def test_multiple_people_returns_solo_image_guidance(self):
        service = VisionService()
        service.analyze_image = lambda **kwargs: VisionAnalysis(  # type: ignore[assignment]
            labels=["person"],
            objects=["person"],
            person_count=2,
            colors=["black", "white"],
        )
        service._extract_image_dimensions = lambda *_args, **_kwargs: (1400, 2200)  # type: ignore[assignment]

        result = service.validate_profile_setup_image(
            image_reference="full-body.jpg",
            image_content_base64="dGVzdA==",
            image_mime_type="image/jpeg",
        )

        self.assertFalse(result.ok)
        self.assertTrue(result.fullBodyLikelyVisible)
        self.assertIn("multiple people detected, please upload a solo image.", result.qualityWarnings)


if __name__ == "__main__":
    unittest.main()
