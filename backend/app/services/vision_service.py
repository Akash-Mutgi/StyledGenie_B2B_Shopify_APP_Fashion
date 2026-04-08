import base64
import json
import re
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from app.models.schemas import VisualSummary


class VisionService:
    garment_terms = {
        "blazer": "blazer",
        "jacket": "jacket",
        "coat": "coat",
        "overshirt": "overshirt",
        "shirt": "shirt",
        "tee": "t-shirt",
        "tshirt": "t-shirt",
        "t-shirt": "t-shirt",
        "sweater": "sweater",
        "hoodie": "hoodie",
        "trouser": "trousers",
        "trousers": "trousers",
        "pants": "trousers",
        "jeans": "jeans",
        "denim": "jeans",
        "dress": "dress",
        "skirt": "skirt",
        "heels": "heels",
        "heel": "heels",
        "shoe": "shoes",
        "shoes": "shoes",
        "sneaker": "sneakers",
        "sneakers": "sneakers",
        "boot": "boots",
        "boots": "boots",
        "bag": "bag",
        "belt": "belt",
        "scarf": "scarf",
    }
    color_terms = {
        "white": {"white", "ivory", "cream"},
        "black": {"black", "charcoal"},
        "grey": {"grey", "gray", "silver"},
        "navy": {"navy"},
        "blue": {"blue", "denim"},
        "beige": {"beige", "camel", "tan", "sand", "taupe", "stone"},
        "brown": {"brown", "chocolate"},
        "green": {"green", "olive", "sage"},
        "red": {"red", "burgundy", "wine"},
        "pink": {"pink", "rose"},
    }
    style_terms = {
        "smart casual": {"smart", "polished", "tailored", "refined"},
        "minimal": {"minimal", "clean", "sleek"},
        "casual": {"casual", "relaxed", "easy", "weekend"},
        "evening": {"evening", "dressy", "formal", "elevated"},
    }
    silhouette_terms = {
        "structured": {"blazer", "coat", "tailored", "jacket"},
        "relaxed": {"tee", "tshirt", "hoodie", "oversized", "casual"},
        "fluid": {"dress", "skirt", "drape"},
    }
    issue_terms = {
        "damage_issue": {"damage", "damaged", "tear", "torn", "stain", "broken", "faulty", "defect"},
        "wrong_item_issue": {"wrong", "incorrect", "different", "mismatch"},
    }

    def analyze_fashion_image(
        self,
        image_name: str,
        shopper_note: str = "",
        image_base64: Optional[str] = None,
        support_mode: bool = False,
    ) -> VisualSummary:
        if image_base64 and settings.google_vision_api_key:
            try:
                analysis = self._google_vision_analysis(
                    image_name=image_name,
                    shopper_note=shopper_note,
                    image_base64=image_base64,
                    support_mode=support_mode,
                )
                if analysis is not None:
                    return analysis
            except Exception:
                pass

        return self._fallback_analysis(image_name=image_name, shopper_note=shopper_note, support_mode=support_mode)

    def detect_fashion_elements(
        self,
        image_name: str,
        shopper_note: str = "",
        image_base64: Optional[str] = None,
    ) -> list[str]:
        analysis = self.analyze_fashion_image(
            image_name=image_name,
            shopper_note=shopper_note,
            image_base64=image_base64,
        )
        tokens = [
            analysis.garment_type,
            analysis.anchor_item,
            analysis.hero_item,
            analysis.style_direction,
            analysis.framing,
            *analysis.color_palette,
            *analysis.silhouette_cues,
            *analysis.visible_items,
        ]

        deduped = []
        for item in tokens:
            clean = (item or "").strip().lower()
            if clean and clean not in deduped:
                deduped.append(clean)

        return deduped[:10]

    def _google_vision_analysis(
        self,
        image_name: str,
        shopper_note: str,
        image_base64: str,
        support_mode: bool,
    ) -> Optional[VisualSummary]:
        encoded_content = self._extract_base64_content(image_base64)
        if not encoded_content:
            return None

        payload = {
            "requests": [
                {
                    "image": {"content": encoded_content},
                    "features": [
                        {"type": "OBJECT_LOCALIZATION", "maxResults": 10},
                        {"type": "LABEL_DETECTION", "maxResults": 20},
                        {"type": "IMAGE_PROPERTIES", "maxResults": 5},
                    ],
                }
            ]
        }
        request = Request(
            f"https://vision.googleapis.com/v1/images:annotate?key={settings.google_vision_api_key}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                parsed = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError):
            return None

        vision_result = (parsed.get("responses") or [{}])[0]
        label_annotations = vision_result.get("labelAnnotations") or []
        object_annotations = vision_result.get("localizedObjectAnnotations") or []
        image_properties = vision_result.get("imagePropertiesAnnotation") or {}

        labels = [item.get("description", "").lower() for item in label_annotations if item.get("description")]
        objects = [item.get("name", "").lower() for item in object_annotations if item.get("name")]
        token_source = " ".join([image_name or "", shopper_note or "", " ".join(labels), " ".join(objects)])
        tokens = self._tokenize(token_source)

        visible_items = self._visible_items_from_tokens(tokens)
        garment_type = self._pick_primary_garment(visible_items, tokens)
        color_palette = self._extract_color_palette(tokens, image_properties)
        style_direction = self._pick_style_direction(tokens)
        silhouette_cues = self._pick_silhouette_cues(tokens)
        framing = self._infer_framing(objects, visible_items)
        confidence_values = [
            float(item.get("score") or 0) for item in [*label_annotations[:3], *object_annotations[:3]]
        ]
        confidence = round(sum(confidence_values) / max(1, len(confidence_values)), 2)

        return VisualSummary(
            styling_mode=self._infer_styling_mode(tokens),
            anchor_item=garment_type,
            hero_item=garment_type,
            garment_type=garment_type,
            color_palette=color_palette,
            silhouette_cues=silhouette_cues,
            framing=framing,
            style_direction=style_direction,
            visible_items=visible_items,
            confidence=confidence,
            issue_type=self._detect_issue_type(tokens) if support_mode else None,
        )

    def _fallback_analysis(self, image_name: str, shopper_note: str, support_mode: bool) -> VisualSummary:
        tokens = self._tokenize(f"{image_name} {shopper_note}")
        visible_items = self._visible_items_from_tokens(tokens)
        garment_type = self._pick_primary_garment(visible_items, tokens)
        color_palette = self._extract_color_palette(tokens, {})
        silhouette_cues = self._pick_silhouette_cues(tokens)

        return VisualSummary(
            styling_mode=self._infer_styling_mode(tokens),
            anchor_item=garment_type,
            hero_item=garment_type,
            garment_type=garment_type,
            color_palette=color_palette,
            silhouette_cues=silhouette_cues,
            framing=self._infer_framing([], visible_items, image_name=image_name),
            style_direction=self._pick_style_direction(tokens),
            visible_items=visible_items,
            confidence=0.58 if visible_items else 0.42,
            issue_type=self._detect_issue_type(tokens) if support_mode else None,
        )

    def _extract_base64_content(self, image_base64: str) -> Optional[str]:
        if not image_base64:
            return None
        if "," in image_base64:
            return image_base64.split(",", 1)[1]
        try:
            base64.b64decode(image_base64, validate=True)
        except Exception:
            return None
        return image_base64

    def _tokenize(self, value: str) -> set[str]:
        base_tokens = set(re.findall(r"[a-z0-9\-]+", (value or "").lower()))
        expanded = set(base_tokens)
        for token in list(base_tokens):
            for part in token.split("-"):
                if part:
                    expanded.add(part)
        return expanded

    def _visible_items_from_tokens(self, tokens: set[str]) -> list[str]:
        visible = []
        for token in sorted(tokens):
            clean = self.garment_terms.get(token)
            if clean and clean not in visible:
                visible.append(clean)
        return visible[:6]

    def _pick_primary_garment(self, visible_items: list[str], tokens: set[str]) -> str:
        if visible_items:
            return visible_items[0]
        if "look" in tokens or "outfit" in tokens:
            return "outfit"
        return "style piece"

    def _extract_color_palette(self, tokens: set[str], image_properties: dict) -> list[str]:
        palette = []
        for color_name, variants in self.color_terms.items():
            if tokens.intersection(variants):
                palette.append(color_name)

        if not palette:
            dominant_colors = (
                ((image_properties or {}).get("dominantColors") or {}).get("colors") or []
            )
            for entry in dominant_colors[:4]:
                rgb = (entry.get("color") or {})
                name = self._closest_color_name(rgb.get("red"), rgb.get("green"), rgb.get("blue"))
                if name and name not in palette:
                    palette.append(name)

        if not palette:
            palette = ["neutral", "white", "black"]

        return palette[:3]

    def _closest_color_name(self, red: Optional[float], green: Optional[float], blue: Optional[float]) -> Optional[str]:
        if red is None or green is None or blue is None:
            return None

        if red > 220 and green > 220 and blue > 220:
            return "white"
        if red < 65 and green < 65 and blue < 65:
            return "black"
        if abs(red - green) < 16 and abs(green - blue) < 16:
            return "grey"
        if blue >= red and blue >= green:
            return "blue"
        if red >= 170 and green >= 150 and blue < 140:
            return "beige"
        if green >= red and green >= blue:
            return "green"
        if red >= blue and red >= green:
            return "brown" if green >= 100 else "red"
        return "neutral"

    def _pick_style_direction(self, tokens: set[str]) -> str:
        for label, variants in self.style_terms.items():
            if tokens.intersection(variants):
                return label
        return "smart casual"

    def _pick_silhouette_cues(self, tokens: set[str]) -> list[str]:
        cues = []
        for label, variants in self.silhouette_terms.items():
            if tokens.intersection(variants):
                cues.append(label)
        if not cues:
            cues = ["balanced"]
        return cues[:2]

    def _infer_styling_mode(self, tokens: set[str]) -> Optional[str]:
        if {"women", "womens", "womenswear", "female", "dress", "heels", "skirt"}.intersection(tokens):
            return "womenswear"
        if {"men", "mens", "menswear", "male", "suit", "loafer"}.intersection(tokens):
            return "menswear"
        return None

    def _infer_framing(
        self,
        objects: list[str],
        visible_items: list[str],
        image_name: str = "",
    ) -> str:
        lowered_name = (image_name or "").lower()
        if "full" in lowered_name or "outfit" in lowered_name or len(visible_items) >= 3 or len(objects) >= 3:
            return "full outfit"
        if len(visible_items) >= 2:
            return "partial outfit"
        return "single item crop"

    def _detect_issue_type(self, tokens: set[str]) -> Optional[str]:
        for issue_type, variants in self.issue_terms.items():
            if tokens.intersection(variants):
                return issue_type
        return None

