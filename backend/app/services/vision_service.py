import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from urllib import error, request

from app.config import settings
from app.models.schemas import AIStackStatus

try:
    from google.cloud import vision
except ImportError:  # pragma: no cover - optional dependency
    vision = None

try:
    from google.auth import default as google_auth_default
except ImportError:  # pragma: no cover - optional dependency
    google_auth_default = None

try:
    from google.auth.exceptions import DefaultCredentialsError
except ImportError:  # pragma: no cover - optional dependency
    DefaultCredentialsError = Exception

try:
    from google.oauth2 import service_account
except ImportError:  # pragma: no cover - optional dependency
    service_account = None


logger = logging.getLogger(__name__)

VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"
VISION_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


@dataclass
class VisionAnalysis:
    labels: list[str] = field(default_factory=list)
    objects: list[str] = field(default_factory=list)
    colors: list[str] = field(default_factory=list)
    web_entities: list[str] = field(default_factory=list)
    apparel_cues: list[str] = field(default_factory=list)
    style_cues: list[str] = field(default_factory=list)
    detected_tags: list[str] = field(default_factory=list)
    ocr_terms: list[str] = field(default_factory=list)
    summary: str = ""
    source: str = "fallback"


class VisionService:
    def __init__(self) -> None:
        self._client = None
        self._client_source: Optional[str] = None
        self._client_probe_complete = False
        self.request_timeout_seconds = 8.0

    def analyze_image(
        self,
        image_reference: str,
        image_content_base64: Optional[str] = None,
        image_mime_type: Optional[str] = None,
    ) -> VisionAnalysis:
        if image_content_base64 or self._looks_like_direct_image_url(image_reference):
            client_analysis = self._analyze_with_client(
                image_reference=image_reference,
                image_content_base64=image_content_base64,
            )
            if client_analysis:
                return client_analysis

            rest_analysis = self._analyze_with_rest(
                image_reference=image_reference,
                image_content_base64=image_content_base64,
            )
            if rest_analysis:
                return rest_analysis

        return self._fallback_analysis(image_reference, image_mime_type=image_mime_type)

    def detect_fashion_elements(
        self,
        image_reference: str,
        image_content_base64: Optional[str] = None,
        image_mime_type: Optional[str] = None,
    ) -> list[str]:
        return self.analyze_image(
            image_reference=image_reference,
            image_content_base64=image_content_base64,
            image_mime_type=image_mime_type,
        ).detected_tags

    def runtime_status(self) -> AIStackStatus:
        has_client = bool(self._detect_client_source())
        has_rest = bool(settings.google_vision_api_key)
        vision_ready = has_client or has_rest
        if has_client:
            mode = "google-vision-client"
        elif has_rest:
            mode = "google-vision-rest"
        else:
            mode = "fallback"

        summary = (
            f"Google Vision is live for shopper image understanding via {self._client_source or 'configured credentials'}."
            if vision_ready
            else "Google Vision credentials are missing, so image understanding is falling back to local fashion heuristics."
        )

        return AIStackStatus(
            vision_ready=vision_ready,
            vision_mode=mode,
            image_reasoning_active=True,
            summary=summary,
        )

    def _analyze_with_client(
        self,
        *,
        image_reference: str,
        image_content_base64: Optional[str],
    ) -> Optional[VisionAnalysis]:
        if vision is None:
            return None

        client = self._get_client()
        if client is None:
            return None

        try:
            if image_content_base64:
                image = vision.Image(content=self._decode_base64(image_content_base64))
            else:
                image = vision.Image()
                image.source.image_uri = image_reference

            features = [
                vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=8),
                vision.Feature(type_=vision.Feature.Type.OBJECT_LOCALIZATION, max_results=6),
                vision.Feature(type_=vision.Feature.Type.IMAGE_PROPERTIES, max_results=4),
                vision.Feature(type_=vision.Feature.Type.WEB_DETECTION, max_results=6),
                vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION, max_results=6),
            ]
            response = client.annotate_image(
                {"image": image, "features": features},
                timeout=self.request_timeout_seconds,
            )
            if response.error.message:
                raise RuntimeError(response.error.message)

            payload = {
                "labels": [
                    item.description
                    for item in (response.label_annotations or [])
                    if getattr(item, "description", None)
                ],
                "objects": [
                    item.name
                    for item in (response.localized_object_annotations or [])
                    if getattr(item, "name", None)
                ],
                "colors": self._extract_client_colors(response),
                "web_entities": [
                    item.description
                    for item in ((response.web_detection.web_entities or []) if response.web_detection else [])
                    if getattr(item, "description", None)
                ],
                "texts": self._extract_client_texts(response),
            }
            return self._normalize_analysis(payload, image_reference, source="google-vision-client")
        except Exception as error:
            logger.warning("Google Vision client analysis failed. %s", error)
            return None

    def _analyze_with_rest(
        self,
        *,
        image_reference: str,
        image_content_base64: Optional[str],
    ) -> Optional[VisionAnalysis]:
        if not settings.google_vision_api_key:
            return None

        image_payload = self._build_rest_image_payload(
            image_reference=image_reference,
            image_content_base64=image_content_base64,
        )
        if not image_payload:
            return None

        payload = {
            "requests": [
                {
                    "image": image_payload,
                    "features": [
                        {"type": "LABEL_DETECTION", "maxResults": 8},
                        {"type": "OBJECT_LOCALIZATION", "maxResults": 6},
                        {"type": "IMAGE_PROPERTIES", "maxResults": 4},
                        {"type": "WEB_DETECTION", "maxResults": 6},
                        {"type": "TEXT_DETECTION", "maxResults": 6},
                    ],
                }
            ]
        }

        encoded_payload = json.dumps(payload).encode("utf-8")
        rest_request = request.Request(
            f"{VISION_ENDPOINT}?key={settings.google_vision_api_key}",
            data=encoded_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(rest_request, timeout=self.request_timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
        except error.URLError as exc:
            logger.warning("Google Vision REST analysis failed. %s", exc)
            return None
        except Exception as exc:  # pragma: no cover - defensive parsing path
            logger.warning("Google Vision REST parsing failed. %s", exc)
            return None

        annotations = ((data.get("responses") or [{}])[0]) if isinstance(data, dict) else {}
        if annotations.get("error"):
            logger.warning("Google Vision REST returned an error. %s", annotations["error"])
            return None

        payload = {
            "labels": [
                item.get("description", "")
                for item in annotations.get("labelAnnotations", [])
                if item.get("description")
            ],
            "objects": [
                item.get("name", "")
                for item in annotations.get("localizedObjectAnnotations", [])
                if item.get("name")
            ],
            "colors": self._extract_rest_colors(annotations),
            "web_entities": [
                item.get("description", "")
                for item in ((annotations.get("webDetection") or {}).get("webEntities") or [])
                if item.get("description")
            ],
            "texts": self._extract_rest_texts(annotations),
        }
        return self._normalize_analysis(payload, image_reference, source="google-vision-rest")

    def _get_client(self):
        if self._client is not None or self._client_probe_complete:
            return self._client

        if vision is None:
            self._client_probe_complete = True
            return None

        try:
            explicit_path = settings.google_application_credentials or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if explicit_path and Path(explicit_path).exists():
                self._client = vision.ImageAnnotatorClient()
                self._client_source = "service-account file"
                self._client_probe_complete = True
                return self._client

            if settings.google_service_account_json and service_account is not None:
                try:
                    credential_payload = json.loads(settings.google_service_account_json)
                    credentials = service_account.Credentials.from_service_account_info(
                        credential_payload,
                        scopes=VISION_SCOPES,
                    )
                    self._client = vision.ImageAnnotatorClient(credentials=credentials)
                    self._client_source = "inline service-account json"
                    self._client_probe_complete = True
                    return self._client
                except Exception as error:
                    logger.warning("Inline Google service account credentials failed. %s", error)

            if google_auth_default is not None:
                credentials, _project_id = google_auth_default(scopes=VISION_SCOPES)
                if credentials is not None:
                    self._client = vision.ImageAnnotatorClient(credentials=credentials)
                    self._client_source = "application default credentials"
                    self._client_probe_complete = True
                    return self._client

            self._client_probe_complete = True
            return None
        except DefaultCredentialsError:
            self._client_probe_complete = True
            return None
        except Exception as error:
            logger.warning("Google Vision client initialization failed. %s", error)
            self._client_probe_complete = True
            return None

    def _detect_client_source(self) -> Optional[str]:
        if self._client_source:
            return self._client_source
        self._get_client()
        return self._client_source

    def _build_rest_image_payload(
        self,
        *,
        image_reference: str,
        image_content_base64: Optional[str],
    ) -> Optional[dict]:
        if image_content_base64:
            return {"content": image_content_base64}

        if self._looks_like_direct_image_url(image_reference):
            return {"source": {"imageUri": image_reference}}

        return None

    def _looks_like_direct_image_url(self, image_reference: str) -> bool:
        lowered = (image_reference or "").lower().strip()
        if not lowered.startswith(("http://", "https://")):
            return False

        return any(
            token in lowered
            for token in [".jpg", ".jpeg", ".png", ".webp", "cdninstagram", "pinimg", "cdn.shopify"]
        )

    def _decode_base64(self, value: str) -> bytes:
        import base64

        normalized = value.split(",", 1)[-1]
        return base64.b64decode(normalized)

    def _extract_client_colors(self, response) -> list[str]:
        colors = []
        if (
            response.image_properties_annotation
            and response.image_properties_annotation.dominant_colors
            and response.image_properties_annotation.dominant_colors.colors
        ):
            for item in response.image_properties_annotation.dominant_colors.colors[:4]:
                color = item.color
                colors.append(self._rgb_to_family(color.red, color.green, color.blue))
        return self._dedupe(colors)

    def _extract_rest_colors(self, annotations: dict) -> list[str]:
        colors = []
        dominant_colors = (((annotations.get("imagePropertiesAnnotation") or {}).get("dominantColors") or {}).get("colors") or [])
        for item in dominant_colors[:4]:
            rgb = item.get("color") or {}
            colors.append(self._rgb_to_family(rgb.get("red", 0), rgb.get("green", 0), rgb.get("blue", 0)))
        return self._dedupe(colors)

    def _extract_client_texts(self, response) -> list[str]:
        texts = []
        for item in (response.text_annotations or [])[:12]:
            description = getattr(item, "description", None)
            if description:
                texts.extend(self._normalize_text_cues(description))
        return self._dedupe(texts)

    def _extract_rest_texts(self, annotations: dict) -> list[str]:
        texts = []
        for item in (annotations.get("textAnnotations") or [])[:12]:
            description = item.get("description")
            if description:
                texts.extend(self._normalize_text_cues(description))
        return self._dedupe(texts)

    def _normalize_analysis(self, payload: dict, image_reference: str, source: str) -> VisionAnalysis:
        labels = self._dedupe([item.lower() for item in payload.get("labels", []) if item])
        objects = self._dedupe([item.lower() for item in payload.get("objects", []) if item])
        colors = self._dedupe([item.lower() for item in payload.get("colors", []) if item])
        web_entities = self._dedupe([item.lower() for item in payload.get("web_entities", []) if item])
        ocr_terms = self._dedupe([item.lower() for item in payload.get("texts", []) if item])

        raw_terms = set(labels + objects + web_entities + ocr_terms)
        apparel_cues = self._prioritize_apparel_cues(self._extract_apparel_cues(raw_terms))
        style_cues = self._extract_style_cues(raw_terms, colors, image_reference, ocr_terms)
        segment_cues = self._extract_segment_cues(raw_terms)
        detected_tags = self._dedupe(apparel_cues + style_cues + colors + ocr_terms + segment_cues)
        summary = self._build_summary(apparel_cues, style_cues, colors, web_entities, ocr_terms)

        return VisionAnalysis(
            labels=labels[:8],
            objects=objects[:8],
            colors=colors[:4],
            web_entities=web_entities[:6],
            apparel_cues=apparel_cues,
            style_cues=style_cues,
            detected_tags=detected_tags[:10],
            ocr_terms=ocr_terms[:8],
            summary=summary,
            source=source,
        )

    def _extract_segment_cues(self, raw_terms: set[str]) -> list[str]:
        mens_keywords = {"man", "male", "menswear", "men", "men's", "gentleman", "groom"}
        womens_keywords = {"woman", "female", "womenswear", "women", "women's", "lady", "ladies"}
        cues = []
        if any(keyword in term for term in raw_terms for keyword in mens_keywords):
            cues.append("menswear")
        if any(keyword in term for term in raw_terms for keyword in womens_keywords):
            cues.append("womenswear")
        return self._dedupe(cues)

    def _prioritize_apparel_cues(self, cues: list[str]) -> list[str]:
        priority = {
            "dress": 0,
            "co-ord": 1,
            "blazer": 2,
            "knitwear": 3,
            "shirt": 4,
            "t-shirt": 5,
            "skirt": 6,
            "trousers": 7,
            "denim": 8,
            "shorts": 9,
            "heels": 10,
            "boots": 11,
            "sandals": 12,
            "sneakers": 13,
            "loafers": 14,
            "bag": 15,
            "belt": 16,
        }
        return sorted(self._dedupe(cues), key=lambda cue: priority.get(cue, 50))

    def _extract_apparel_cues(self, raw_terms: set[str]) -> list[str]:
        apparel_map = {
            "blazer": {"blazer", "jacket", "suit jacket", "coat"},
            "shirt": {"shirt", "blouse", "top"},
            "t-shirt": {"t-shirt", "tee", "crew neck"},
            "hoodie": {"hoodie", "sweatshirt"},
            "knitwear": {"sweater", "knit", "cardigan", "jumper"},
            "dress": {"dress", "gown"},
            "trousers": {"trouser", "trousers", "pants", "slacks"},
            "denim": {"jeans", "denim"},
            "shorts": {"short", "shorts"},
            "skirt": {"skirt"},
            "heels": {"heel", "heels", "pump"},
            "sandals": {"sandal", "sandals"},
            "loafers": {"loafer", "loafers", "moccasin"},
            "sneakers": {"sneaker", "trainer", "tennis shoe"},
            "boots": {"boot", "boots"},
            "bag": {"bag", "handbag", "purse"},
            "belt": {"belt"},
            "kurta": {"kurta", "tunic"},
            "co-ord": {"co-ord", "coord", "matching set", "two piece"},
            "hat": {"hat"},
        }

        cues = []
        for label, keywords in apparel_map.items():
            if any(keyword in term for term in raw_terms for keyword in keywords):
                cues.append(label)
        return self._dedupe(cues)

    def _extract_style_cues(self, raw_terms: set[str], colors: list[str], image_reference: str, ocr_terms: list[str]) -> list[str]:
        cues = []

        if any(keyword in term for term in raw_terms for keyword in {"blazer", "suit", "tailoring", "formal"}):
            cues.extend(["tailored", "polished"])
        if any(keyword in term for term in raw_terms for keyword in {"shirt", "polo", "loafer", "smart"}):
            cues.append("smart casual")
        if any(keyword in term for term in raw_terms for keyword in {"street fashion", "street style", "casual", "denim"}):
            cues.extend(["casual", "weekend"])
        if any(keyword in term for term in raw_terms for keyword in {"linen", "summer", "beachwear"}):
            cues.extend(["linen", "lightweight"])
        if any(keyword in term for term in raw_terms for keyword in {"hoodie", "sweatshirt", "trainer"}):
            cues.extend(["relaxed", "off-duty"])
        if any(keyword in term for term in raw_terms for keyword in {"dress", "heel", "heels", "pump", "satin"}):
            cues.extend(["elevated", "occasion-ready"])
        if any(keyword in term for term in raw_terms for keyword in {"knit", "wool", "cashmere"}):
            cues.append("textured knit")
        if any(keyword in term for term in raw_terms for keyword in {"leather", "faux leather"}):
            cues.append("structured texture")
        if any(keyword in term for term in raw_terms for keyword in {"stripe", "striped"}):
            cues.append("striped")
        if any(keyword in term for term in raw_terms for keyword in {"plaid", "checked", "check"}):
            cues.append("checked")
        if any(keyword in term for term in raw_terms for keyword in {"print", "printed", "graphic", "floral"}):
            cues.append("printed")
        if any(keyword in term for term in raw_terms for keyword in {"editorial", "fashion model", "runway", "fashion"}):
            cues.append("editorial inspiration")
        cues.extend(self._palette_style_cues(colors))

        lowered = (image_reference or "").lower()
        if "instagram" in lowered:
            cues.extend(["social inspiration", "trend-led"])
        if "pinterest" in lowered:
            cues.extend(["mood-board", "editorial inspiration"])
        if any(term in {"sale", "lookbook", "editorial"} for term in ocr_terms):
            cues.append("catalog inspiration")

        return self._dedupe(cues)

    def _build_summary(
        self,
        apparel_cues: list[str],
        style_cues: list[str],
        colors: list[str],
        web_entities: list[str],
        ocr_terms: list[str],
    ) -> str:
        parts = []
        if apparel_cues:
            parts.append("apparel cues: " + ", ".join(apparel_cues[:3]))
        if style_cues:
            parts.append("style direction: " + ", ".join(style_cues[:3]))
        if colors:
            parts.append("palette: " + ", ".join(colors[:3]))
        if ocr_terms:
            parts.append("text cues: " + ", ".join(ocr_terms[:2]))
        elif web_entities:
            parts.append("visual context: " + ", ".join(web_entities[:2]))

        if not parts:
            return "Detected a general smart-casual fashion direction."

        return "Detected " + " | ".join(parts) + "."

    def _fallback_analysis(self, image_reference: str, image_mime_type: Optional[str] = None) -> VisionAnalysis:
        lowered = (image_reference or "").lower()
        social_signals = []

        if "instagram" in lowered:
            social_signals.extend(["social inspiration", "trend-led"])
        if "pinterest" in lowered:
            social_signals.extend(["editorial inspiration", "mood-board"])
        if any(token in lowered for token in ["menswear", "men", "men's", "male", "groom"]):
            social_signals.append("menswear")
        if any(token in lowered for token in ["womenswear", "women", "women's", "female", "ladies"]):
            social_signals.append("womenswear")

        apparel_cues = []
        style_cues = []
        if any(token in lowered for token in ["dress", "gown", "bodycon", "strapless", "maxi", "midi", "flare-dress", "flare dress"]):
            apparel_cues.extend(["dress"])
            style_cues.extend(["elevated", "occasion-ready"])
        if "blazer" in lowered:
            apparel_cues.extend(["blazer"])
            style_cues.extend(["tailored", "neutral palette"])
        if "shirt" in lowered:
            apparel_cues.extend(["shirt"])
            style_cues.extend(["linen", "lightweight"])
        if "skirt" in lowered:
            apparel_cues.extend(["skirt"])
            style_cues.extend(["elevated"])
        if "heel" in lowered or "shoe" in lowered:
            apparel_cues.extend(["heels"])
            style_cues.extend(["formal", "polished"])
        if "bag" in lowered or "handbag" in lowered or "purse" in lowered:
            apparel_cues.extend(["bag"])
        if "denim" in lowered:
            apparel_cues.extend(["denim"])
            style_cues.extend(["casual", "weekend"])
        if "floral" in lowered or "print" in lowered or "printed" in lowered:
            style_cues.extend(["printed"])

        if not apparel_cues and not style_cues:
            style_cues.extend(["tailored", "smart casual", "neutral palette"])

        detected_tags = self._dedupe(apparel_cues + style_cues + social_signals)
        mime_hint = [image_mime_type] if image_mime_type else []
        return VisionAnalysis(
            labels=mime_hint,
            objects=[],
            colors=[],
            web_entities=[],
            apparel_cues=self._prioritize_apparel_cues(self._dedupe(apparel_cues)),
            style_cues=self._dedupe(style_cues + social_signals),
            detected_tags=detected_tags,
            ocr_terms=[],
            summary=self._build_summary(apparel_cues, style_cues + social_signals, [], [], []),
            source="fallback",
        )

    def _rgb_to_family(self, red: float, green: float, blue: float) -> str:
        red = float(red or 0)
        green = float(green or 0)
        blue = float(blue or 0)

        if red < 45 and green < 45 and blue < 45:
            return "black"
        if red > 220 and green > 220 and blue > 220:
            return "white"
        if abs(red - green) < 15 and abs(green - blue) < 15:
            return "grey"
        if red > 185 and green > 170 and blue < 150:
            return "beige"
        if red > 170 and green > 140 and blue > 140:
            return "blush"
        if blue > red + 20 and blue > green + 20:
            return "blue"
        if red > 150 and green > 95 and blue < 90:
            return "brown"
        if red > 180 and green > 180 and blue < 120:
            return "yellow"
        if green > red and green > blue:
            return "green"
        return "neutral"

    def _dedupe(self, items: list[str]) -> list[str]:
        deduped = []
        seen = set()
        for item in items:
            normalized = (item or "").strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return deduped

    def _normalize_text_cues(self, value: str) -> list[str]:
        normalized = []
        for raw in value.replace("\n", " ").split():
            token = raw.strip().lower().strip(",.:;!?()[]{}<>#'\"")
            if len(token) < 3:
                continue
            if token in {"sale", "shop", "instagram", "pinterest", "www", "http", "https"}:
                continue
            normalized.append(token)
        return normalized[:10]

    def _palette_style_cues(self, colors: list[str]) -> list[str]:
        color_set = set(colors)
        cues = []
        neutrals = {"black", "white", "grey", "gray", "beige", "brown", "cream", "navy"}
        warm = {"beige", "brown", "yellow", "red", "blush"}
        cool = {"blue", "green", "grey", "gray", "white", "navy"}

        if len(color_set) <= 1 and color_set:
            cues.append("tonal palette")
        if color_set and color_set.issubset(neutrals):
            cues.append("neutral palette")
        if {"black", "white"}.issubset(color_set):
            cues.append("high contrast")
        if color_set.intersection(warm) and not color_set.intersection(cool - {"white", "grey", "gray"}):
            cues.append("warm palette")
        if color_set.intersection(cool) and not color_set.intersection(warm - {"beige"}):
            cues.append("cool palette")
        if len(color_set) >= 3 and not color_set.issubset(neutrals):
            cues.append("bold palette")

        return self._dedupe(cues)
