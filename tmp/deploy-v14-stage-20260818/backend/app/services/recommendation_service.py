import logging
import re
import time
from dataclasses import dataclass, field as dataclass_field
from typing import Optional

from app.config import settings
from app.models.schemas import GapAnalysis, ImageAnalysisSummary, ProductRecommendation, ShopperProfile
from app.services.catalog_intelligence_service import CatalogIntelligenceService
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService


logger = logging.getLogger(__name__)


@dataclass
class RecommendationValidationItem:
    recommendation_id: str
    category: str
    status: str = "pass"
    failed_rules: list[str] = dataclass_field(default_factory=list)


@dataclass
class RecommendationValidationResult:
    status: str = "pass"
    recommendations: list[ProductRecommendation] = dataclass_field(default_factory=list)
    item_results: list[RecommendationValidationItem] = dataclass_field(default_factory=list)
    invalid_product_ids: list[str] = dataclass_field(default_factory=list)
    repaired: bool = False


class RecommendationService:
    def __init__(self) -> None:
        self.supabase_service = SupabaseService()
        self.catalog_intelligence_service = CatalogIntelligenceService()
        self.shopify_service = ShopifyService()
        self._catalog_cache: list[dict] = []
        self._catalog_cache_at: float = 0.0
        self._catalog_cache_ttl_seconds = 45.0
        self.strict_segments = {"menswear", "womenswear"}
        self.segment_field_candidates = [
            "segment",
            "gender",
            "gender_mode",
            "normalized_segment",
            "target_gender",
            "audience",
            "product_segment",
        ]
        self.complete_look_bucket_map = {
            "shirt": "tops",
            "blouse": "tops",
            "top": "tops",
            "t-shirt": "tops",
            "tee": "tops",
            "hoodie": "tops",
            "sweater": "tops",
            "knitwear": "tops",
            "polo": "tops",
            "trousers": "bottoms",
            "pants": "bottoms",
            "denim": "bottoms",
            "jeans": "bottoms",
            "shorts": "bottoms",
            "skirt": "bottoms",
            "dress": "dresswear",
            "blazer": "outerwear",
            "jacket": "outerwear",
            "coat": "outerwear",
            "overshirt": "outerwear",
            "heels": "footwear",
            "sandals": "footwear",
            "loafers": "footwear",
            "sneakers": "footwear",
            "boots": "footwear",
            "shoe": "footwear",
            "bag": "accessories",
            "belt": "accessories",
            "hat": "accessories",
        }
        self._bag_tokens = {
            "bag",
            "bags",
            "clutch",
            "crossbody",
            "shoulder bag",
            "tote",
            "satchel",
            "purse",
            "mini bag",
            "backpack",
        }

    def _catalog(self) -> list[dict]:
        now = time.time()
        if self._catalog_cache and (now - self._catalog_cache_at) < self._catalog_cache_ttl_seconds:
            return self._catalog_cache

        catalog = self.supabase_service.fetch_catalog_products()
        self._catalog_cache = catalog
        self._catalog_cache_at = now
        return catalog

    def _tokenize(self, value: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", (value or "").lower()))

    def _expand_terms(self, terms: list[str]) -> set[str]:
        return self.catalog_intelligence_service.expand_terms(terms)

    def _product_bucket(self, product: dict) -> str:
        return self.catalog_intelligence_service.product_bucket(product)

    def _query_bucket(self, terms: set[str]) -> str:
        return self.catalog_intelligence_service.query_bucket(terms)

    def _normalize_segment_label(self, value: object) -> Optional[str]:
        normalized = str(value or "").strip().lower()
        if not normalized:
            return None
        if any(token in normalized for token in {"unisex", "all gender", "all-gender", "gender neutral", "gender-neutral"}):
            return "unknown"
        if normalized in {"menswear", "mens", "men", "men's", "male"}:
            return "menswear"
        if normalized in {"womenswear", "womens", "women", "women's", "female", "ladies"}:
            return "womenswear"
        if "men" in normalized and "women" not in normalized:
            return "menswear"
        if "women" in normalized and "men" not in normalized:
            return "womenswear"
        return None

    def _segment_scores_from_text(self, text: str, bucket: str = "general") -> tuple[int, int]:
        normalized_text = re.sub(r"\bmen['’]s\b", "mens", text.lower())
        normalized_text = re.sub(r"\bwomen['’]s\b", "womens", normalized_text)
        padded_text = f" {re.sub(r'[^a-z0-9]+', ' ', normalized_text).strip()} "
        mens_tokens = {
            " men ",
            " men's ",
            " mens ",
            " menswear ",
            " male ",
            " groom ",
            " tie ",
            " bow tie ",
            " cufflink ",
            " cufflinks ",
            " boxer ",
            " boxers ",
            " briefs ",
        }
        womens_tokens = {
            " women ",
            " women's ",
            " womens ",
            " womenswear ",
            " female ",
            " ladies ",
            " lady ",
            " dress ",
            " dresses ",
            " skirt ",
            " skirts ",
            " blouse ",
            " blouses ",
            " bra ",
            " bras ",
            " bikini ",
            " purse ",
            " clutch ",
            " handbag ",
            " handbags ",
            " crossbody ",
            " earring ",
            " earrings ",
            " necklace ",
            " necklaces ",
            " bracelet ",
            " bracelets ",
            " heel ",
            " heels ",
        }

        mens_score = sum(1 for token in mens_tokens if token in padded_text)
        womens_score = sum(1 for token in womens_tokens if token in padded_text)

        if bucket == "dresswear":
            womens_score += 2

        return mens_score, womens_score

    def normalize_product_segment(self, product: dict) -> str:
        for key in self.segment_field_candidates:
            normalized = self._normalize_segment_label(product.get(key))
            if normalized in self.strict_segments:
                return normalized
            if normalized == "unknown":
                return "unknown"

        nested_sources = [product.get("metafields"), product.get("attributes")]
        for source in nested_sources:
            if isinstance(source, dict):
                for key in self.segment_field_candidates:
                    normalized = self._normalize_segment_label(source.get(key))
                    if normalized in self.strict_segments:
                        return normalized
                    if normalized == "unknown":
                        return "unknown"

        collection_values = product.get("collections") or product.get("collection_titles") or []
        if isinstance(collection_values, str):
            collection_values = [collection_values]

        text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("product_type", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
                " ".join(str(item) for item in collection_values if item),
            ]
        ).strip()

        bucket = self._product_bucket(product)
        mens_score, womens_score = self._segment_scores_from_text(text, bucket)

        if womens_score and not mens_score:
            return "womenswear"
        if mens_score and not womens_score:
            return "menswear"

        return "unknown"

    def resolve_required_segment(
        self,
        *,
        query_text: str = "",
        shopper_profile: Optional[ShopperProfile] = None,
        terms: Optional[set[str]] = None,
        anchor_product: Optional[dict] = None,
    ) -> Optional[str]:
        if anchor_product:
            anchor_segment = self.normalize_product_segment(anchor_product)
            if anchor_segment in self.strict_segments:
                return anchor_segment

        if shopper_profile and shopper_profile.segment_preference in self.strict_segments:
            return shopper_profile.segment_preference

        inferred = self._infer_request_segment(query_text, shopper_profile, terms or set())
        return inferred if inferred in self.strict_segments else None

    def _filter_catalog_by_segment(self, catalog: list[dict], required_segment: str) -> list[dict]:
        if required_segment not in self.strict_segments:
            return []
        return [
            product
            for product in catalog
            if self._product_segment_compatible(product, required_segment)
        ]

    def _product_segment_compatible(self, product: dict, required_segment: str) -> bool:
        if required_segment not in self.strict_segments:
            return False
        segment = self.normalize_product_segment(product)
        return segment == required_segment or segment == "unknown"

    def _segment_rank(self, product: dict, required_segment: str) -> int:
        return 1 if self.normalize_product_segment(product) == required_segment else 0

    def _score_product(
        self,
        product: dict,
        terms: set[str],
        complementary: bool,
        target_segment: str,
        budget_cap: Optional[float],
        accessory_requested: bool,
    ) -> dict:
        title_tokens = self._tokenize(product.get("title", ""))
        category_tokens = self._tokenize(product.get("category", ""))
        description_tokens = self._tokenize(product.get("description", ""))
        tag_tokens = self._tokenize(" ".join(product.get("tags", [])))

        matched_terms = set()
        match_score = 0
        style_bonus = 0

        title_matches = terms.intersection(title_tokens)
        category_matches = terms.intersection(category_tokens)
        tag_matches = terms.intersection(tag_tokens)
        description_matches = terms.intersection(description_tokens)

        match_score += len(title_matches) * 4
        match_score += len(category_matches) * 3
        match_score += len(tag_matches) * 2
        match_score += len(description_matches)

        matched_terms.update(title_matches)
        matched_terms.update(category_matches)
        matched_terms.update(tag_matches)
        matched_terms.update(description_matches)

        bucket = self._product_bucket(product)
        query_bucket = self._query_bucket(terms)
        segment = self.normalize_product_segment(product)
        price_value = self._price_value(product.get("price"))

        if complementary:
            if bucket != query_bucket:
                style_bonus += 2
            else:
                style_bonus -= 1
        else:
            if bucket != "general":
                style_bonus += 1
            if not accessory_requested:
                if bucket == "accessories":
                    style_bonus -= 4
                elif bucket in {"tops", "bottoms", "outerwear", "footwear", "dresswear"}:
                    style_bonus += 2

        if target_segment in self.strict_segments:
            if segment == target_segment:
                style_bonus += 4
            elif segment == "unknown":
                style_bonus += 0
            else:
                style_bonus -= 12

        if budget_cap is not None and price_value is not None:
            if price_value > budget_cap:
                style_bonus -= 8
            elif not complementary and bucket == "accessories" and price_value > budget_cap * 0.4:
                style_bonus -= 3
            elif price_value <= budget_cap * 0.5:
                style_bonus += 1

        return {
            **product,
            "score": match_score + style_bonus,
            "match_score": match_score,
            "style_bonus": style_bonus,
            "matched_terms": sorted(matched_terms),
            "bucket": bucket,
            "segment": segment,
            "segment_rank": 1 if segment == target_segment else 0,
        }

    def _select_products(
        self,
        scored_products: list[dict],
        limit: int,
        complementary: bool,
        query_bucket: str,
        target_segment: str,
    ) -> list[dict]:
        selected = []
        used_ids = set()

        def append_first(bucket_name: str) -> None:
            for item in scored_products:
                if item["id"] in used_ids:
                    continue
                if item["bucket"] != bucket_name:
                    continue
                selected.append(item)
                used_ids.add(item["id"])
                return

        if complementary:
            preferred_buckets = self._complementary_bucket_order(query_bucket, target_segment)
            for bucket_name in preferred_buckets:
                if len(selected) >= limit:
                    break
                append_first(bucket_name)
        else:
            preferred_buckets = self._outfit_bucket_order(target_segment, scored_products)
            for bucket_name in preferred_buckets:
                if len(selected) >= limit:
                    break
                append_first(bucket_name)

        if len(selected) < limit:
            for item in scored_products:
                if len(selected) >= limit:
                    break
                if item["id"] in used_ids:
                    continue
                selected.append(item)
                used_ids.add(item["id"])

        return selected[:limit]

    def _outfit_bucket_order(self, target_segment: str, scored_products: list[dict]) -> list[str]:
        buckets_present = {item["bucket"] for item in scored_products}
        if target_segment == "womenswear" and "dresswear" in buckets_present:
            return ["dresswear", "outerwear", "footwear", "accessories", "tops", "bottoms"]
        if target_segment == "menswear":
            return ["tops", "bottoms", "outerwear", "footwear", "accessories"]
        return ["tops", "bottoms", "outerwear", "footwear", "accessories"]

    def _complementary_bucket_order(self, query_bucket: str, target_segment: str) -> list[str]:
        if target_segment == "menswear":
            mapping = {
                "tops": ["bottoms", "outerwear", "footwear", "accessories"],
                "bottoms": ["tops", "outerwear", "footwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
                "accessories": ["tops", "bottoms", "outerwear", "footwear"],
            }
        else:
            mapping = {
                "dresswear": ["outerwear", "footwear", "accessories"],
                "tops": ["bottoms", "outerwear", "footwear", "accessories"],
                "bottoms": ["tops", "outerwear", "footwear", "accessories"],
                "outerwear": ["tops", "bottoms", "dresswear", "footwear", "accessories"],
                "footwear": ["dresswear", "tops", "bottoms", "outerwear", "accessories"],
                "accessories": ["dresswear", "tops", "bottoms", "outerwear", "footwear"],
            }

        ordered = mapping.get(query_bucket, [])
        remainder = [bucket for bucket in self._outfit_bucket_order(target_segment, []) if bucket not in ordered and bucket != query_bucket]
        return ordered + remainder

    def _anchor_bucket_from_image_analysis(
        self,
        *,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
        orchestration_context: Optional[dict] = None,
    ) -> str:
        if self._strong_dress_signal(image_analysis=image_analysis, required_segment=required_segment):
            return "dresswear"

        context_bucket = (orchestration_context or {}).get("anchor_bucket")
        if context_bucket and not (
            context_bucket == "tops"
            and self._strong_dress_signal(image_analysis=image_analysis, required_segment=required_segment)
        ):
            return context_bucket

        search_terms = [image_analysis.anchor_item or ""] + list(image_analysis.garment_types)
        for term in search_terms:
            bucket = self._visual_label_to_bucket(term)
            if bucket != "general":
                return bucket

        return "dresswear" if required_segment == "womenswear" and "dress" in (image_analysis.anchor_item or "").lower() else "tops"

    def _strong_dress_signal(
        self,
        *,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
    ) -> bool:
        if required_segment != "womenswear":
            return False

        cue_blob = " ".join(
            [
                image_analysis.anchor_item or "",
                " ".join(image_analysis.garment_types),
                " ".join(image_analysis.silhouette_cues),
                " ".join(image_analysis.style_direction),
                " ".join(image_analysis.occasion_cues),
                image_analysis.completeness or "",
            ]
        ).lower()

        dress_terms = {"dress", "gown", "bodycon", "strapless", "one-piece silhouette"}
        return any(term in cue_blob for term in dress_terms)

    def _visible_buckets_from_image_analysis(
        self,
        *,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
        orchestration_context: Optional[dict] = None,
    ) -> list[str]:
        context_buckets = (orchestration_context or {}).get("visible_buckets") or []
        buckets = []
        for label in context_buckets + list(image_analysis.garment_types):
            bucket = self._visual_label_to_bucket(label)
            if bucket != "general" and bucket not in buckets:
                buckets.append(bucket)

        anchor_bucket = self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        if anchor_bucket not in buckets:
            buckets.insert(0, anchor_bucket)
        return buckets[:4]

    def _complete_look_target_buckets(
        self,
        *,
        anchor_bucket: str,
        visible_buckets: list[str],
        required_segment: str,
        shopper_profile: Optional[ShopperProfile] = None,
        orchestration_context: Optional[dict] = None,
    ) -> list[str]:
        preferred = (orchestration_context or {}).get("missing_piece_targets") or []
        if preferred:
            ordered = [bucket for bucket in preferred if bucket != anchor_bucket]
            return self._weather_adjusted_buckets(
                buckets=ordered,
                shopper_profile=shopper_profile,
                anchor_bucket=anchor_bucket,
                visible_buckets=visible_buckets,
            )

        if required_segment == "womenswear":
            mapping = {
                "dresswear": ["footwear", "outerwear", "accessories"],
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }
        else:
            mapping = {
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }

        ordered = mapping.get(anchor_bucket, ["tops", "bottoms", "outerwear", "footwear", "accessories"])
        ordered = self._weather_adjusted_buckets(
            buckets=ordered,
            shopper_profile=shopper_profile,
            anchor_bucket=anchor_bucket,
            visible_buckets=visible_buckets,
        )
        filtered = [bucket for bucket in ordered if bucket not in visible_buckets]
        if filtered:
            return filtered

        return [bucket for bucket in ["outerwear", "footwear", "accessories", "tops", "bottoms"] if bucket != anchor_bucket][:3]

    def _weather_adjusted_buckets(
        self,
        *,
        buckets: list[str],
        shopper_profile: Optional[ShopperProfile],
        anchor_bucket: str,
        visible_buckets: Optional[list[str]] = None,
    ) -> list[str]:
        ordered = [bucket for bucket in buckets if bucket]
        weather = (shopper_profile.weather_context or "").lower() if shopper_profile else ""
        visible = set(visible_buckets or [])

        if weather in {"warm", "hot"} and anchor_bucket != "outerwear":
            ordered = [bucket for bucket in ordered if bucket != "outerwear"]

        if weather in {"cold", "cool", "rainy"} and anchor_bucket != "outerwear" and "outerwear" not in visible:
            if "outerwear" in ordered:
                ordered = [bucket for bucket in ordered if bucket != "outerwear"]
            insert_at = 1 if ordered else 0
            ordered.insert(insert_at, "outerwear")

        if weather == "rainy":
            for priority_bucket in ["footwear", "outerwear"]:
                if priority_bucket in ordered:
                    ordered = [bucket for bucket in ordered if bucket != priority_bucket]
                    ordered.insert(0, priority_bucket)

        deduped = []
        seen = set()
        for bucket in ordered:
            if bucket == anchor_bucket or bucket in seen:
                continue
            seen.add(bucket)
            deduped.append(bucket)
        return deduped

    def _product_text(self, product: dict) -> str:
        return " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()

    def _support_slot_label(self, slot_key: str) -> str:
        return {
            "top": "Top",
            "inner_layer": "Inner layer",
            "bottom": "Bottom",
            "footwear": "Footwear",
            "outer_layer": "Outer layer",
            "accessory": "Accessory",
            "bag": "Bag",
            "finishing_touch": "Finishing touch",
        }.get(slot_key, slot_key.replace("_", " ").title())

    def _normalize_support_slot_label(self, value: Optional[str]) -> str:
        return str(value or "").strip().lower().replace("-", " ")

    def _support_slot_templates(
        self,
        *,
        anchor_bucket: str,
        target_buckets: list[str],
        shopper_profile: Optional[ShopperProfile],
    ) -> list[dict]:
        ordered_targets: list[str] = []
        seen_targets = set()
        for bucket in target_buckets:
            if bucket in seen_targets:
                continue
            seen_targets.add(bucket)
            ordered_targets.append(bucket)

        if anchor_bucket == "dresswear":
            slots: list[dict] = []
            if "footwear" in ordered_targets:
                slots.append({"key": "footwear", "bucket": "footwear"})
            if "accessories" in ordered_targets:
                slots.append({"key": "bag", "bucket": "accessories", "selector": "bag"})
                slots.append({"key": "accessory", "bucket": "accessories", "selector": "accessory"})
            if "outerwear" in ordered_targets:
                slots.append({"key": "finishing_touch", "bucket": "outerwear", "optional": True})
            elif "accessories" in ordered_targets:
                slots.append({"key": "finishing_touch", "bucket": "accessories", "selector": "finishing", "optional": True})
            return slots[:4]

        slots: list[dict] = []
        for bucket in ordered_targets:
            if bucket == "tops":
                slot_key = "inner_layer" if anchor_bucket == "outerwear" else "top"
                slots.append({"key": slot_key, "bucket": "tops"})
            elif bucket == "bottoms":
                slots.append({"key": "bottom", "bucket": "bottoms"})
            elif bucket == "footwear":
                slots.append({"key": "footwear", "bucket": "footwear"})
            elif bucket == "outerwear":
                slots.append({"key": "outer_layer", "bucket": "outerwear", "optional": True})
            elif bucket == "accessories":
                slots.append({"key": "accessory", "bucket": "accessories", "optional": True})

        deduped_slots: list[dict] = []
        seen_keys = set()
        for slot in slots:
            if slot["key"] in seen_keys:
                continue
            seen_keys.add(slot["key"])
            deduped_slots.append(slot)
        return deduped_slots[:4]

    def _matches_support_slot(self, *, item: dict, slot: dict) -> bool:
        if item.get("bucket") != slot.get("bucket"):
            return False

        selector = slot.get("selector")
        if not selector:
            return True

        text = self._product_text(item)
        is_bag = any(token in text for token in self._bag_tokens)
        if selector == "bag":
            return is_bag
        if selector in {"accessory", "finishing"}:
            return not is_bag
        return True

    def _validate_support_slot_selection(
        self,
        *,
        selected: list[dict],
        support_slots: list[dict],
    ) -> bool:
        selected_keys = [item.get("support_slot") for item in selected if item.get("support_slot")]
        if len(selected_keys) != len(selected):
            return False
        if len(selected_keys) != len(set(selected_keys)):
            return False
        required_keys = [slot["key"] for slot in support_slots if not slot.get("optional")]
        return all(key in selected_keys for key in required_keys)

    def _text_palette_strategy(
        self,
        *,
        shopper_profile: Optional[ShopperProfile],
        terms: set[str],
        query_text: str,
    ) -> dict:
        preferred: list[str] = []
        palette: list[str] = []
        cue_set = set()
        blob_tokens = self._tokenize(f"{query_text} {' '.join(terms)} {' '.join((shopper_profile.color_preferences if shopper_profile else []) or [])}")

        def add_color(value: str) -> None:
            normalized = value.lower()
            if normalized not in preferred:
                preferred.append(normalized)

        for color, keywords in self.catalog_intelligence_service.color_keywords.items():
            if blob_tokens.intersection(keywords):
                if color not in palette:
                    palette.append(color)
                add_color(color)

        for color in (shopper_profile.color_preferences if shopper_profile else []) or []:
            add_color(color)

        for color in list(palette) + preferred[:2]:
            normalized = color.lower()
            if normalized == "white":
                for suggestion in ["black", "grey", "navy", "beige", "blue"]:
                    add_color(suggestion)
            elif normalized == "black":
                for suggestion in ["white", "grey", "charcoal", "navy", "beige"]:
                    add_color(suggestion)
            elif normalized in {"beige", "cream", "brown", "neutral"}:
                cue_set.add("neutral palette")
                for suggestion in ["cream", "beige", "brown", "white", "black", "olive"]:
                    add_color(suggestion)
            elif normalized in {"blue", "navy"}:
                cue_set.add("cool palette")
                for suggestion in ["white", "grey", "navy", "black", "beige"]:
                    add_color(suggestion)
            elif normalized in {"grey", "gray"}:
                cue_set.add("neutral palette")
                for suggestion in ["black", "white", "navy", "blue"]:
                    add_color(suggestion)
            elif normalized in {"green"}:
                for suggestion in ["white", "black", "cream", "brown", "navy"]:
                    add_color(suggestion)

        if not preferred:
            for suggestion in ["black", "white", "grey", "navy", "beige", "brown"]:
                add_color(suggestion)

        if shopper_profile and (
            shopper_profile.feeling_goal == "bold"
            or shopper_profile.priority_focus == "bold"
            or "expressive" in shopper_profile.style_identity
        ):
            cue_set.add("controlled contrast")

        if "controlled contrast" in cue_set:
            label = "controlled contrast palette"
        elif "neutral palette" in cue_set:
            label = "neutral balancing palette"
        elif palette:
            label = f"{palette[0]}-led palette"
        else:
            label = "cohesive palette match"

        return {
            "label": label,
            "palette": palette[:3],
            "preferred_colors": preferred[:10],
        }

    def _text_outfit_context_score(
        self,
        *,
        product: dict,
        bucket: str,
        query_bucket: str,
        complementary: bool,
        shopper_profile: Optional[ShopperProfile],
        target_segment: str,
    ) -> int:
        score = 0
        text = self._product_text(product)
        occasion = (shopper_profile.occasion_context or "").lower() if shopper_profile else ""
        weather = (shopper_profile.weather_context or "").lower() if shopper_profile else ""
        style_identity = {item.lower() for item in (shopper_profile.style_identity or [])} if shopper_profile else set()
        constraints = {item.lower() for item in (shopper_profile.practical_constraints or [])} if shopper_profile else set()
        silhouette_goals = {item.lower() for item in (shopper_profile.silhouette_goals or [])} if shopper_profile else set()
        feeling_goal = (shopper_profile.feeling_goal or "").lower() if shopper_profile else ""
        priority_focus = (shopper_profile.priority_focus or "").lower() if shopper_profile else ""

        if complementary:
            if bucket != query_bucket:
                score += 3
            else:
                score -= 4
        else:
            if query_bucket != "general":
                if bucket == query_bucket:
                    score += 8
                else:
                    ordered = self._complementary_bucket_order(query_bucket, target_segment)
                    if bucket in ordered:
                        score += max(1, 5 - ordered.index(bucket))
            else:
                preferred_buckets = self._weather_adjusted_buckets(
                    buckets=self._outfit_bucket_order(target_segment, []),
                    shopper_profile=shopper_profile,
                    anchor_bucket="general",
                )
                if bucket in preferred_buckets:
                    score += max(1, 5 - preferred_buckets.index(bucket))

        if any(token in occasion for token in {"office", "work", "meeting", "client"}):
            if any(token in text for token in {"tailored", "blazer", "loafer", "shirt", "trouser", "structured", "polished"}):
                score += 5
            if any(token in text for token in {"graphic", "sport", "beach", "jogger", "short", "sandal"}):
                score -= 5
        elif any(token in occasion for token in {"dinner", "evening", "date", "event", "night"}):
            if any(token in text for token in {"tailored", "dress", "heel", "boot", "blazer", "skirt", "loafer", "dark denim"}):
                score += 5
            if any(token in text for token in {"jogger", "sweat", "trainer", "gym", "beach", "short"}):
                score -= 5
        elif any(token in occasion for token in {"travel", "airport", "holiday", "vacation"}):
            if any(token in text for token in {"sneaker", "stretch", "knit", "casual", "relaxed", "lightweight"}):
                score += 4
            if any(token in text for token in {"heel", "stiletto", "rigid"}):
                score -= 3
        elif any(token in occasion for token in {"casual", "weekend", "outing", "everyday", "brunch"}):
            if any(token in text for token in {"sneaker", "denim", "cotton", "linen", "casual", "relaxed"}):
                score += 3

        if weather in {"warm", "hot"}:
            if any(token in text for token in {"linen", "lightweight", "cotton", "breathable", "sandal", "tee", "short-sleeve"}):
                score += 4
            if any(token in text for token in {"wool", "heavyweight", "parka", "fleece", "thermal"}):
                score -= 6
        elif weather in {"cold", "cool"}:
            if any(token in text for token in {"wool", "coat", "jacket", "blazer", "boot", "knit", "long-sleeve", "layer"}):
                score += 5
            if any(token in text for token in {"sandal", "short", "sleeveless"}):
                score -= 6
        elif weather == "rainy":
            if any(token in text for token in {"boot", "jacket", "coat", "outerwear", "water-resistant"}):
                score += 4
            if "sandal" in text:
                score -= 5

        if feeling_goal in {"sharp", "elegant", "confident"} or priority_focus in {"polished", "premium"} or "polished" in style_identity:
            if any(token in text for token in {"tailored", "structured", "sharp", "blazer", "loafer", "heel", "clean"}):
                score += 3
        if feeling_goal in {"comfortable", "relaxed"} or priority_focus in {"comfort", "easy"} or "comfort-first" in constraints or "relaxed" in style_identity:
            if any(token in text for token in {"sneaker", "stretch", "soft", "relaxed", "knit", "cotton"}):
                score += 3
        if feeling_goal == "bold" or priority_focus == "bold" or "expressive" in style_identity:
            if any(token in text for token in {"statement", "contrast", "graphic", "bold", "fashion"}):
                score += 2

        if "sharper" in silhouette_goals or "elevated" in silhouette_goals:
            if any(token in text for token in {"tailored", "structured", "straight", "clean"}):
                score += 2
        if "slimmer" in silhouette_goals:
            if any(token in text for token in {"slim", "straight", "tapered"}):
                score += 2
        if "softer" in silhouette_goals:
            if any(token in text for token in {"soft", "flowy", "relaxed"}):
                score += 2

        return score

    def _violates_weather_rule(self, *, text: str, bucket: str, weather: str) -> bool:
        if weather in {"cold", "cool"} and any(token in text for token in {"sandal", "short", "sleeveless"}):
            return True
        if weather in {"warm", "hot"}:
            if any(token in text for token in {"wool", "heavyweight", "parka", "fleece", "thermal", "leather"}):
                return True
            if bucket == "outerwear" and not any(token in text for token in {"lightweight", "linen", "overshirt", "shirt jacket", "unstructured"}):
                return True
        if weather == "rainy" and "sandal" in text:
            return True
        return False

    def _prefers_bold_style(self, shopper_profile: Optional[ShopperProfile]) -> bool:
        if shopper_profile is None:
            return False
        feeling_goal = (shopper_profile.feeling_goal or "").lower()
        priority_focus = (shopper_profile.priority_focus or "").lower()
        style_identity = {item.lower() for item in (shopper_profile.style_identity or [])}
        return feeling_goal == "bold" or priority_focus == "bold" or "expressive" in style_identity

    def _violates_refined_occasion_rule(
        self,
        *,
        text: str,
        bucket: str,
        occasion: str,
        shopper_profile: Optional[ShopperProfile],
    ) -> bool:
        refined_tokens = {"office", "work", "meeting", "client", "dinner", "evening", "date", "event", "night", "smart casual"}
        if not any(token in occasion for token in refined_tokens):
            return False

        bold_preferred = self._prefers_bold_style(shopper_profile)
        if bucket == "bottoms" and any(token in text for token in {"short", "cargo", "jogger", "sweatpant", "track"}):
            return True
        if bucket == "outerwear":
            if any(token in text for token in {"hoodie", "fleece", "puffer", "parka"}):
                return True
            if any(token in text for token in {"leather", "biker", "moto"}) and not bold_preferred:
                return True
        if bucket == "footwear":
            if any(token in text for token in {"running", "trainer", "slide", "flip flop"}):
                return True
            if "sandal" in text and (shopper_profile is None or shopper_profile.segment_preference == "menswear"):
                return True
        return False

    def _violates_occasion_rule(self, *, text: str, occasion: str) -> bool:
        if any(token in occasion for token in {"office", "work", "meeting", "client"}):
            return any(token in text for token in {"gym", "beach", "graphic", "jogger", "short", "sandal"})
        if any(token in occasion for token in {"dinner", "evening", "date", "event", "night", "wedding"}):
            return any(token in text for token in {"gym", "sport", "beach", "sweat", "jogger", "short"})
        return False

    def _valid_text_outfit_candidate(
        self,
        *,
        item: dict,
        palette_strategy: dict,
        shopper_profile: Optional[ShopperProfile],
        target_segment: str,
    ) -> bool:
        if not self._product_segment_compatible(item, target_segment):
            return False
        if self._complete_look_palette_score(
            product_colors=item.get("product_colors", []),
            bucket=item.get("bucket"),
            palette_strategy=palette_strategy,
        ) < 0:
            return False

        text = self._product_text(item)
        occasion = (shopper_profile.occasion_context or "").lower() if shopper_profile else ""
        weather = (shopper_profile.weather_context or "").lower() if shopper_profile else ""
        if self._violates_weather_rule(text=text, bucket=item.get("bucket") or "general", weather=weather):
            return False
        if self._violates_occasion_rule(text=text, occasion=occasion):
            return False
        if self._violates_refined_occasion_rule(
            text=text,
            bucket=item.get("bucket") or "general",
            occasion=occasion,
            shopper_profile=shopper_profile,
        ):
            return False
        if item.get("context_score", 0) < 0:
            return False
        return True

    def _safe_text_outfit_candidate(
        self,
        *,
        item: dict,
        palette_strategy: dict,
        shopper_profile: Optional[ShopperProfile],
        target_segment: str,
    ) -> bool:
        if not self._product_segment_compatible(item, target_segment):
            return False
        if self._complete_look_palette_score(
            product_colors=item.get("product_colors", []),
            bucket=item.get("bucket"),
            palette_strategy=palette_strategy,
        ) < 0:
            return False

        text = self._product_text(item)
        occasion = (shopper_profile.occasion_context or "").lower() if shopper_profile else ""
        weather = (shopper_profile.weather_context or "").lower() if shopper_profile else ""
        if self._violates_weather_rule(text=text, bucket=item.get("bucket") or "general", weather=weather):
            return False
        if self._violates_occasion_rule(text=text, occasion=occasion):
            return False
        if self._violates_refined_occasion_rule(
            text=text,
            bucket=item.get("bucket") or "general",
            occasion=occasion,
            shopper_profile=shopper_profile,
        ):
            return False
        return True

    def _palette_strategy(
        self,
        *,
        image_analysis: ImageAnalysisSummary,
        shopper_profile: ShopperProfile,
        orchestration_context: Optional[dict] = None,
    ) -> dict:
        palette = [color.lower() for color in image_analysis.palette[:3] if color]
        user_colors = [color.lower() for color in shopper_profile.color_preferences[:2] if color]
        cue_set = {cue.lower() for cue in image_analysis.color_harmony_cues if cue}
        preferred = []
        label = (orchestration_context or {}).get("palette_strategy") or "cohesive palette match"

        def add_colors(*values: str) -> None:
            for value in values:
                normalized = value.lower()
                if normalized not in preferred:
                    preferred.append(normalized)

        for color in palette + user_colors:
            add_colors(color)
            if color == "white":
                add_colors("black", "grey", "navy", "beige", "blue")
            elif color == "black":
                add_colors("white", "grey", "charcoal", "beige", "brown")
            elif color in {"beige", "cream", "brown", "neutral"}:
                add_colors("cream", "beige", "brown", "white", "black", "olive")
            elif color in {"blue", "navy"}:
                add_colors("white", "grey", "navy", "black", "beige")
            elif color == "green":
                add_colors("white", "black", "cream", "brown", "navy")
            elif color in {"grey", "gray"}:
                add_colors("black", "white", "navy", "blue")

        if not preferred:
            add_colors("black", "white", "grey", "navy", "beige", "brown")

        if "high contrast" in cue_set:
            label = "clean high-contrast palette"
            add_colors("black", "white", "grey")
        elif "monochrome potential" in cue_set or "tonal palette" in cue_set:
            label = "tonal palette"
        elif "neutral palette" in cue_set:
            label = "neutral balancing palette"
            add_colors("black", "white", "grey", "beige", "navy")
        elif palette:
            label = f"{palette[0]}-led palette"

        return {
            "label": label,
            "palette": palette,
            "preferred_colors": preferred[:10],
        }

    def _product_color_tags(self, product: dict) -> list[str]:
        tokens = self.catalog_intelligence_service.tokenize(
            " ".join(
                [
                    product.get("title", ""),
                    product.get("category", ""),
                    product.get("description", ""),
                    " ".join(product.get("tags", [])),
                ]
            )
        )
        colors = []
        for color, keywords in self.catalog_intelligence_service.color_keywords.items():
            if tokens.intersection(keywords) and color not in colors:
                colors.append(color)
        return colors[:4]

    def _complete_look_palette_score(
        self,
        *,
        product_colors: list[str],
        bucket: str,
        palette_strategy: dict,
    ) -> int:
        if not product_colors:
            return 1 if bucket in {"footwear", "outerwear", "accessories"} else 0

        preferred = set(palette_strategy.get("preferred_colors") or [])
        palette = set(palette_strategy.get("palette") or [])
        colors = set(product_colors)

        if colors.intersection(preferred):
            return 6 if colors.intersection(palette) else 4
        if colors.intersection({"black", "white", "grey", "gray", "navy", "beige", "brown", "cream"}):
            return 2
        return -4

    def _complete_look_context_score(
        self,
        *,
        product: dict,
        bucket: str,
        target_buckets: list[str],
        visible_buckets: list[str],
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
    ) -> int:
        score = 0
        text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()
        bold_preferred = self._prefers_bold_style(shopper_profile)

        if bucket in target_buckets:
            score += 10
            score += max(0, 4 - target_buckets.index(bucket))
        else:
            score -= 6

        if bucket in visible_buckets and bucket not in {"accessories", "outerwear"}:
            score -= 8

        occasion = (shopper_profile.occasion_context or "").lower()
        if any(token in occasion for token in {"office", "work", "meeting"}):
            if any(token in text for token in {"tailored", "blazer", "loafer", "shirt", "trouser", "heel"}):
                score += 4
            if any(token in text for token in {"graphic", "sport", "beach"}):
                score -= 3
        elif any(token in occasion for token in {"dinner", "evening", "date", "event"}):
            if any(token in text for token in {"tailored", "dress", "heel", "boot", "blazer", "skirt"}):
                score += 4
            if any(token in text for token in {"jogger", "sweat", "trainer"}):
                score -= 3
            if bucket == "bottoms":
                if any(token in text for token in {"trouser", "tailored", "straight", "chino", "dark denim", "jean"}):
                    score += 4
                if any(token in text for token in {"short", "cargo"}):
                    score -= 10
            if bucket == "outerwear":
                if any(token in text for token in {"blazer", "overshirt", "coat", "structured", "tailored"}):
                    score += 4
                if any(token in text for token in {"hoodie", "fleece", "puffer"}):
                    score -= 6
                if any(token in text for token in {"leather", "biker", "moto"}) and not bold_preferred:
                    score -= 6
            if bucket == "footwear":
                if any(token in text for token in {"loafer", "boot", "minimal sneaker", "clean sneaker", "leather shoe"}):
                    score += 3
                if any(token in text for token in {"running", "trainer", "slide", "flip flop", "sandal"}):
                    score -= 6
        elif any(token in occasion for token in {"casual", "weekend", "outing", "everyday"}):
            if any(token in text for token in {"sneaker", "denim", "cotton", "linen", "casual"}):
                score += 3

        weather = (shopper_profile.weather_context or "").lower()
        if weather in {"warm", "hot"}:
            if any(token in text for token in {"linen", "lightweight", "short", "sandal", "tee"}):
                score += 3
            if any(token in text for token in {"wool", "heavyweight", "parka", "fleece", "leather"}):
                score -= 4
        elif weather in {"cold", "cool"}:
            if any(token in text for token in {"wool", "coat", "jacket", "blazer", "boot", "knit"}):
                score += 4
            if any(token in text for token in {"sandal", "short", "sleeveless"}):
                score -= 4
        elif weather == "rainy":
            if any(token in text for token in {"boot", "jacket", "coat", "outerwear"}):
                score += 3
            if "sandal" in text:
                score -= 3

        style_cues = " ".join(image_analysis.style_direction + image_analysis.silhouette_cues).lower()
        if "polished" in style_cues or "tailored" in style_cues:
            if any(token in text for token in {"tailored", "blazer", "trouser", "loafer", "heel"}):
                score += 2
        if "casual" in style_cues:
            if any(token in text for token in {"sneaker", "denim", "casual", "hoodie"}):
                score += 2
        if "neutral palette" in style_cues or "monochrome potential" in " ".join(image_analysis.color_harmony_cues).lower():
            if any(token in text for token in {"black", "white", "grey", "gray", "cream", "beige", "navy"}):
                score += 2
        if "cool palette" in " ".join(image_analysis.style_direction + image_analysis.color_harmony_cues).lower():
            if any(token in text for token in {"grey", "gray", "blue", "navy", "black", "white"}):
                score += 2
        if "warm palette" in " ".join(image_analysis.style_direction + image_analysis.color_harmony_cues).lower():
            if any(token in text for token in {"brown", "tan", "beige", "cream", "camel", "olive"}):
                score += 2

        return score

    def _select_complete_look_products(
        self,
        *,
        scored_products: list[dict],
        target_buckets: list[str],
        support_slots: list[dict],
        required_segment: str,
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        limit: int,
    ) -> list[dict]:
        selected = []
        used_ids = set()

        for slot in support_slots:
            for item in scored_products:
                if item["id"] in used_ids:
                    continue
                if not self._matches_support_slot(item=item, slot=slot):
                    continue
                if not self._valid_complete_look_candidate(
                    item=item,
                    required_segment=required_segment,
                    target_buckets=target_buckets,
                    palette_strategy=palette_strategy,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                ):
                    continue
                selected.append({**item, "support_slot": slot["key"]})
                used_ids.add(item["id"])
                break
            if len(selected) >= limit:
                break

        return selected[:limit]

    def _repair_complete_look_selection(
        self,
        *,
        scored_products: list[dict],
        target_buckets: list[str],
        support_slots: list[dict],
        required_segment: str,
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        limit: int,
    ) -> list[dict]:
        tightened_pool = [
            item
            for item in scored_products
            if item["bucket"] in target_buckets and item["palette_score"] >= 0 and item["context_score"] >= 0
        ]
        return self._select_complete_look_products(
            scored_products=tightened_pool,
            target_buckets=target_buckets,
            support_slots=support_slots,
            required_segment=required_segment,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            limit=limit,
        )

    def _validate_complete_look_selection(
        self,
        *,
        selected: list[dict],
        required_segment: str,
        target_buckets: list[str],
        support_slots: list[dict],
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
    ) -> bool:
        if not selected:
            return False
        return self._validate_support_slot_selection(
            selected=selected,
            support_slots=support_slots,
        ) and all(
            self._valid_complete_look_candidate(
                item=item,
                required_segment=required_segment,
                target_buckets=target_buckets,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
            )
            for item in selected
        )

    def _valid_complete_look_candidate(
        self,
        *,
        item: dict,
        required_segment: str,
        target_buckets: list[str],
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
    ) -> bool:
        if not self._product_segment_compatible(item, required_segment):
            return False
        if item.get("bucket") not in target_buckets:
            return False
        if self._complete_look_palette_score(
            product_colors=item.get("product_colors", []),
            bucket=item.get("bucket"),
            palette_strategy=palette_strategy,
        ) < 0:
            return False
        if self._complete_look_context_score(
            product=item,
            bucket=item.get("bucket"),
            target_buckets=target_buckets,
            visible_buckets=self._visible_buckets_from_image_analysis(
                image_analysis=image_analysis,
                required_segment=required_segment,
            ),
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
        ) < 0:
            return False
        text = self._product_text(item)
        occasion = (shopper_profile.occasion_context or "").lower()
        weather = (shopper_profile.weather_context or "").lower()
        if self._violates_weather_rule(text=text, bucket=item.get("bucket") or "general", weather=weather):
            return False
        if self._violates_occasion_rule(text=text, occasion=occasion):
            return False
        if self._violates_refined_occasion_rule(
            text=text,
            bucket=item.get("bucket") or "general",
            occasion=occasion,
            shopper_profile=shopper_profile,
        ):
            return False
        return True

    def _visual_label_to_bucket(self, value: str) -> str:
        normalized = str(value or "").strip().lower()
        for token, bucket in self.complete_look_bucket_map.items():
            if token in normalized:
                return bucket
        return "general"

    def recommend_products(
        self,
        terms: list[str],
        complementary: bool = False,
        limit: int = 3,
        query_text: str = "",
        shopper_profile: Optional[ShopperProfile] = None,
        exclude_product_ids: Optional[list[str]] = None,
        required_segment: Optional[str] = None,
    ) -> list[ProductRecommendation]:
        normalized_terms = self._expand_terms(terms)
        query_bucket = self._query_bucket(normalized_terms)
        target_segment = required_segment or self.resolve_required_segment(
            query_text=query_text,
            shopper_profile=shopper_profile,
            terms=normalized_terms,
        )
        if target_segment not in self.strict_segments:
            logger.warning("Recommendation request missing strict segment. Query: %s", query_text)
            return []

        catalog = self._filter_catalog_by_segment(self._catalog(), target_segment)
        budget_cap = self._parse_budget_cap(query_text)
        accessory_requested = self._accessory_requested(query_text, normalized_terms)
        excluded_ids = {item for item in (exclude_product_ids or []) if item}
        palette_strategy = self._text_palette_strategy(
            shopper_profile=shopper_profile,
            terms=normalized_terms,
            query_text=query_text,
        )

        scored_products = []
        for product in catalog:
            if product.get("id") in excluded_ids:
                continue
            base = self._score_product(
                product,
                normalized_terms,
                complementary,
                target_segment,
                budget_cap,
                accessory_requested,
            )
            bucket = base["bucket"]
            product_colors = self._product_color_tags(product)
            palette_score = self._complete_look_palette_score(
                product_colors=product_colors,
                bucket=bucket,
                palette_strategy=palette_strategy,
            )
            context_score = self._text_outfit_context_score(
                product=product,
                bucket=bucket,
                query_bucket=query_bucket,
                complementary=complementary,
                shopper_profile=shopper_profile,
                target_segment=target_segment,
            )
            scored_products.append(
                {
                    **base,
                    "product_colors": product_colors,
                    "palette_score": palette_score,
                    "context_score": context_score,
                    "score": base["score"] + palette_score + context_score,
                }
            )
        scored_products = [item for item in scored_products if self._product_segment_compatible(item, target_segment)]
        scored_products.sort(
            key=lambda item: (
                item["segment_rank"],
                item["score"],
                item["context_score"],
                item["palette_score"],
                item["match_score"],
            ),
            reverse=True,
        )

        if not scored_products:
            return []

        valid_pool = [
            item
            for item in scored_products
            if self._valid_text_outfit_candidate(
                item=item,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                target_segment=target_segment,
            )
        ]
        safe_pool = [
            item
            for item in scored_products
            if self._safe_text_outfit_candidate(
                item=item,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                target_segment=target_segment,
            )
        ]
        selection_pool = valid_pool or safe_pool or scored_products
        selected = self._select_products(selection_pool, limit, complementary, query_bucket, target_segment)
        if len(selected) < limit and selection_pool is valid_pool and safe_pool:
            used_ids = {item["id"] for item in selected}
            fill_pool = [item for item in safe_pool if item["id"] not in used_ids]
            if fill_pool:
                selected.extend(
                    self._select_products(fill_pool, limit - len(selected), complementary, query_bucket, target_segment)
                )
        selected = self._enrich_selected_products(selected)
        selected = [item for item in selected if self._product_segment_compatible(item, target_segment)]

        return [
            ProductRecommendation(
                id=item["id"],
                title=item["title"],
                category=item["category"],
                reason=self._build_text_outfit_reason(
                    item=item,
                    shopper_profile=shopper_profile,
                    palette_strategy=palette_strategy,
                    complementary=complementary,
                ),
                segment=target_segment,
                tags=item.get("tags", []),
                image_url=item.get("image_url"),
                price=self._price_text(item.get("price")),
                product_url=self._product_url(item),
                cart_variant_id=item.get("shopify_variant_id") or None,
                **self._inventory_fields(item),
            )
            for item in selected
        ]

    def recommend_complete_look_products(
        self,
        *,
        terms: list[str],
        query_text: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
        orchestration_context: Optional[dict] = None,
        limit: int = 4,
        exclude_product_ids: Optional[list[str]] = None,
    ) -> list[ProductRecommendation]:
        if required_segment not in self.strict_segments:
            logger.warning("Complete-look request missing strict segment. Query: %s", query_text)
            return []

        normalized_terms = self._expand_terms(terms)
        budget_cap = self._parse_budget_cap(query_text)
        excluded_ids = {item for item in (exclude_product_ids or []) if item}
        catalog = [
            product
            for product in self._filter_catalog_by_segment(self._catalog(), required_segment)
            if product.get("id") not in excluded_ids
        ]
        if not catalog:
            return []

        anchor_bucket = self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        visible_buckets = self._visible_buckets_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        target_buckets = self._complete_look_target_buckets(
            anchor_bucket=anchor_bucket,
            visible_buckets=visible_buckets,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            orchestration_context=orchestration_context,
        )
        support_slots = self._support_slot_templates(
            anchor_bucket=anchor_bucket,
            target_buckets=target_buckets,
            shopper_profile=shopper_profile,
        )
        palette_strategy = self._palette_strategy(
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            orchestration_context=orchestration_context,
        )

        scored_products = []
        for product in catalog:
            base = self._score_product(
                product,
                normalized_terms,
                True,
                required_segment,
                budget_cap,
                False,
            )
            bucket = base["bucket"]
            product_colors = self._product_color_tags(product)
            palette_score = self._complete_look_palette_score(
                product_colors=product_colors,
                bucket=bucket,
                palette_strategy=palette_strategy,
            )
            context_score = self._complete_look_context_score(
                product=product,
                bucket=bucket,
                target_buckets=target_buckets,
                visible_buckets=visible_buckets,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
            )
            scored_products.append(
                {
                    **base,
                    "product_colors": product_colors,
                    "palette_score": palette_score,
                    "context_score": context_score,
                    "score": base["score"] + palette_score + context_score,
                }
            )

        scored_products.sort(
            key=lambda item: (
                item["segment_rank"],
                item["score"],
                item["palette_score"],
                item["context_score"],
                item["match_score"],
            ),
            reverse=True,
        )
        selected = self._select_complete_look_products(
            scored_products=scored_products,
            target_buckets=target_buckets,
            support_slots=support_slots,
            required_segment=required_segment,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            limit=limit,
        )
        selected = self._enrich_selected_products(selected)

        if not self._validate_complete_look_selection(
            selected=selected,
            required_segment=required_segment,
            target_buckets=target_buckets,
            support_slots=support_slots,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
        ):
            logger.warning("Complete-look validation failed. Rebuilding selection inside merchant catalog only.")
            selected = self._repair_complete_look_selection(
                scored_products=scored_products,
                target_buckets=target_buckets,
                support_slots=support_slots,
                required_segment=required_segment,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                limit=limit,
            )
            selected = self._enrich_selected_products(selected)

        anchor_label = image_analysis.anchor_item or "your anchor piece"
        strategy_label = palette_strategy["label"]
        occasion = shopper_profile.occasion_context
        weather = shopper_profile.weather_context

        return [
            ProductRecommendation(
                id=item["id"],
                title=item["title"],
                category=item["category"],
                reason=self._build_complete_look_reason(
                    item=item,
                    anchor_label=anchor_label,
                    strategy_label=strategy_label,
                    occasion=occasion,
                    weather=weather,
                ),
                segment=required_segment,
                support_slot=self._support_slot_label(item.get("support_slot") or item.get("bucket") or "piece"),
                tags=item.get("tags", []),
                image_url=item.get("image_url"),
                price=self._price_text(item.get("price")),
                product_url=self._product_url(item),
                cart_variant_id=item.get("shopify_variant_id") or None,
                **self._inventory_fields(item),
            )
            for item in selected
            if self._product_segment_compatible(item, required_segment)
        ]

    def recommend_inspired_look_products(
        self,
        *,
        terms: list[str],
        query_text: str,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
        orchestration_context: Optional[dict] = None,
        limit: int = 4,
        exclude_product_ids: Optional[list[str]] = None,
    ) -> list[ProductRecommendation]:
        if required_segment not in self.strict_segments:
            logger.warning("Get-inspired request missing strict segment. Query: %s", query_text)
            return []

        normalized_terms = self._expand_terms(terms)
        budget_cap = self._parse_budget_cap(query_text)
        excluded_ids = {item for item in (exclude_product_ids or []) if item}
        catalog = [
            product
            for product in self._filter_catalog_by_segment(self._catalog(), required_segment)
            if product.get("id") not in excluded_ids
        ]
        if not catalog:
            return []

        anchor_bucket = self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        visible_buckets = self._visible_buckets_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        supporting_targets = self._inspired_support_targets(
            anchor_bucket=anchor_bucket,
            required_segment=required_segment,
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            orchestration_context=orchestration_context,
        )
        support_slots = self._support_slot_templates(
            anchor_bucket=anchor_bucket,
            target_buckets=supporting_targets,
            shopper_profile=shopper_profile,
        )
        palette_strategy = self._palette_strategy(
            image_analysis=image_analysis,
            shopper_profile=shopper_profile,
            orchestration_context=orchestration_context,
        )

        hero_pool = []
        for product in catalog:
            base = self._score_product(
                product,
                normalized_terms,
                False,
                required_segment,
                budget_cap,
                False,
            )
            bucket = base["bucket"]
            if bucket != anchor_bucket:
                continue
            product_colors = self._product_color_tags(product)
            palette_score = self._complete_look_palette_score(
                product_colors=product_colors,
                bucket=bucket,
                palette_strategy=palette_strategy,
            )
            style_score = self._inspired_style_score(
                product=product,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
                shopper_profile=shopper_profile,
                anchor_bucket=anchor_bucket,
            )
            silhouette_score = self._inspiration_silhouette_score(
                product=product,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
                anchor_bucket=anchor_bucket,
            )
            scope_score = self._inspiration_scope_score(
                bucket=bucket,
                image_analysis=image_analysis,
            )
            hero_pool.append(
                {
                    **base,
                    "bucket": bucket,
                    "product_colors": product_colors,
                    "palette_score": palette_score,
                    "style_score": style_score,
                    "silhouette_score": silhouette_score,
                    "scope_score": scope_score,
                    "score": base["score"] + 14 + palette_score + style_score + silhouette_score + scope_score,
                }
            )

        hero_pool.sort(
            key=lambda item: (
                item["segment_rank"],
                item["score"],
                item["palette_score"],
                item["style_score"],
                item["silhouette_score"],
                item["match_score"],
            ),
            reverse=True,
        )
        hero_candidate = next(
            (
                item
                for item in hero_pool
                if self._valid_inspired_hero_candidate(
                    item=item,
                    required_segment=required_segment,
                    anchor_bucket=anchor_bucket,
                    palette_strategy=palette_strategy,
                )
            ),
            None,
        )
        if hero_candidate is None:
            logger.warning("Get-inspired hero match failed inside strict bucket '%s'.", anchor_bucket)
            return []

        hero_candidate = self._enrich_selected_products([hero_candidate])[0]

        support_scored = []
        for product in catalog:
            if product.get("id") == hero_candidate.get("id"):
                continue
            base = self._score_product(
                product,
                normalized_terms,
                True,
                required_segment,
                budget_cap,
                False,
            )
            bucket = base["bucket"]
            product_colors = self._product_color_tags(product)
            palette_score = self._complete_look_palette_score(
                product_colors=product_colors,
                bucket=bucket,
                palette_strategy=palette_strategy,
            )
            context_score = self._inspired_support_context_score(
                product=product,
                bucket=bucket,
                supporting_targets=supporting_targets,
                hero_bucket=anchor_bucket,
                visible_buckets=visible_buckets,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
            )
            style_score = self._inspired_style_score(
                product=product,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
                shopper_profile=shopper_profile,
                anchor_bucket=anchor_bucket,
            )
            support_scored.append(
                {
                    **base,
                    "bucket": bucket,
                    "product_colors": product_colors,
                    "palette_score": palette_score,
                    "context_score": context_score,
                    "style_score": style_score,
                    "score": base["score"] + palette_score + context_score + style_score,
                }
            )

        support_scored.sort(
            key=lambda item: (
                item["segment_rank"],
                item["score"],
                item["context_score"],
                item["palette_score"],
                item["style_score"],
                item["match_score"],
            ),
            reverse=True,
        )
        selected_support = self._select_inspired_support_products(
            scored_products=support_scored,
            supporting_targets=supporting_targets,
            support_slots=support_slots,
            required_segment=required_segment,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            hero_bucket=anchor_bucket,
            visible_buckets=visible_buckets,
            orchestration_context=orchestration_context,
            limit=max(0, limit - 1),
        )
        selected_support = self._enrich_selected_products(selected_support)
        if not self._validate_inspired_support_selection(
            selected=selected_support,
            required_segment=required_segment,
            supporting_targets=supporting_targets,
            support_slots=support_slots,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            hero_bucket=anchor_bucket,
            visible_buckets=visible_buckets,
            orchestration_context=orchestration_context,
        ):
            logger.warning("Get-inspired support selection failed validation. Rebuilding inside merchant catalog only.")
            selected_support = self._repair_inspired_support_selection(
                scored_products=support_scored,
                supporting_targets=supporting_targets,
                support_slots=support_slots,
                required_segment=required_segment,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                hero_bucket=anchor_bucket,
                visible_buckets=visible_buckets,
                orchestration_context=orchestration_context,
                limit=max(0, limit - 1),
            )
            selected_support = self._enrich_selected_products(selected_support)

        selected = [hero_candidate] + selected_support
        anchor_label = image_analysis.anchor_item or "the inspiration anchor"
        style_label = self._inspired_style_label(image_analysis, orchestration_context)

        recommendations = [
            ProductRecommendation(
                id=hero_candidate["id"],
                title=hero_candidate["title"],
                category=hero_candidate["category"],
                reason=self._build_inspired_hero_reason(
                    item=hero_candidate,
                    anchor_label=anchor_label,
                    palette_strategy=palette_strategy["label"],
                    style_label=style_label,
                    shopper_profile=shopper_profile,
                ),
                segment=required_segment,
                role="hero",
                match_label=self._hero_similarity_label(
                    hero_candidate,
                    image_analysis=image_analysis,
                    orchestration_context=orchestration_context,
                ),
                match_badges=self._inspired_match_badges(
                    hero_candidate,
                    image_analysis=image_analysis,
                    shopper_profile=shopper_profile,
                    orchestration_context=orchestration_context,
                    include_occasion=True,
                ),
                tags=hero_candidate.get("tags", []),
                image_url=hero_candidate.get("image_url"),
                price=self._price_text(hero_candidate.get("price")),
                product_url=self._product_url(hero_candidate),
                cart_variant_id=hero_candidate.get("shopify_variant_id") or None,
                **self._inventory_fields(hero_candidate),
            )
        ]

        for item in selected_support:
            recommendations.append(
                ProductRecommendation(
                    id=item["id"],
                    title=item["title"],
                    category=item["category"],
                    reason=self._build_inspired_support_reason(
                        item=item,
                        hero_item=hero_candidate,
                        palette_strategy=palette_strategy["label"],
                        style_label=style_label,
                        shopper_profile=shopper_profile,
                    ),
                    segment=required_segment,
                    role="support",
                    support_slot=self._support_slot_label(item.get("support_slot") or item.get("bucket") or "piece"),
                    match_label="Supporting piece",
                    match_badges=self._inspired_match_badges(
                        item,
                        image_analysis=image_analysis,
                        shopper_profile=shopper_profile,
                        orchestration_context=orchestration_context,
                        include_occasion=False,
                    ),
                    tags=item.get("tags", []),
                    image_url=item.get("image_url"),
                    price=self._price_text(item.get("price")),
                    product_url=self._product_url(item),
                    cart_variant_id=item.get("shopify_variant_id") or None,
                    **self._inventory_fields(item),
                )
            )

        return recommendations[:limit]

    def _build_reason(self, item: dict, reason_prefix: str) -> str:
        clean_terms = self.catalog_intelligence_service.clean_match_terms(set(item["matched_terms"]))
        if clean_terms:
            return f"{reason_prefix} through {', '.join(clean_terms[:3])}."

        return f"{reason_prefix} as a versatile option from your live catalog."

    def _build_text_outfit_reason(
        self,
        *,
        item: dict,
        shopper_profile: Optional[ShopperProfile],
        palette_strategy: dict,
        complementary: bool,
    ) -> str:
        bucket = item.get("bucket") or "general"
        bucket_copy = {
            "tops": "anchors the outfit cleanly",
            "bottoms": "grounds the outfit and keeps the proportions balanced",
            "outerwear": "adds the right structure and weather cover",
            "footwear": "finishes the look without breaking the mood",
            "accessories": "adds polish without overloading the outfit",
            "dresswear": "gives the look a strong, occasion-ready centre",
        }.get(bucket, "keeps the outfit coherent")
        occasion = shopper_profile.occasion_context if shopper_profile else None
        weather = shopper_profile.weather_context if shopper_profile else None
        feeling = (shopper_profile.feeling_goal or shopper_profile.priority_focus) if shopper_profile else None
        details = [bucket_copy]
        if palette_strategy.get("label"):
            details.append(f"stays inside a {palette_strategy['label']}")
        if occasion:
            details.append(f"fits {occasion}")
        if weather:
            details.append(f"works for {weather} weather")
        if feeling and not complementary:
            details.append(f"supports a {feeling} finish")
        prefix = "Supports the look because it" if complementary else "Recommended because it"
        return prefix + " " + ", ".join(details[:4]) + "."

    def _build_complete_look_reason(
        self,
        *,
        item: dict,
        anchor_label: str,
        strategy_label: str,
        occasion: Optional[str],
        weather: Optional[str],
    ) -> str:
        bucket = item.get("bucket") or "general"
        bucket_copy = {
            "bottoms": "grounds the look cleanly",
            "footwear": "finishes the look without fighting the anchor",
            "outerwear": "adds structure and weather cover",
            "accessories": "adds finish without overcomplicating the outfit",
            "tops": "balances the silhouette around the anchor piece",
            "dresswear": "keeps the outfit cohesive around the main piece",
        }.get(bucket, "keeps the look coordinated")

        details = [bucket_copy]
        if strategy_label:
            details.append(f"stays inside a {strategy_label} colour story")
        if occasion:
            details.append(f"fits {occasion}")
        if weather:
            details.append(f"works for {weather} weather")

        return f"Built around {anchor_label}: " + ", ".join(details[:3]) + "."

    def _inspired_support_targets(
        self,
        *,
        anchor_bucket: str,
        required_segment: str,
        image_analysis: Optional[ImageAnalysisSummary] = None,
        shopper_profile: Optional[ShopperProfile] = None,
        orchestration_context: Optional[dict] = None,
    ) -> list[str]:
        if image_analysis is not None and self._strong_dress_signal(
            image_analysis=image_analysis,
            required_segment=required_segment,
        ):
            return self._weather_adjusted_buckets(
                buckets=["footwear", "accessories", "outerwear"],
                shopper_profile=shopper_profile,
                anchor_bucket="dresswear",
            )[:4]

        preferred = (orchestration_context or {}).get("supporting_targets") or []
        if preferred:
            ordered = [bucket for bucket in preferred if bucket != anchor_bucket]
            return self._weather_adjusted_buckets(
                buckets=ordered,
                shopper_profile=shopper_profile,
                anchor_bucket=anchor_bucket,
            )

        if required_segment == "womenswear":
            mapping = {
                "dresswear": ["footwear", "accessories", "outerwear"],
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["dresswear", "outerwear", "accessories"],
            }
        else:
            mapping = {
                "tops": ["bottoms", "footwear", "outerwear", "accessories"],
                "bottoms": ["tops", "footwear", "outerwear", "accessories"],
                "outerwear": ["tops", "bottoms", "footwear", "accessories"],
                "footwear": ["tops", "bottoms", "outerwear", "accessories"],
            }

        ordered = mapping.get(anchor_bucket, ["footwear", "outerwear", "accessories"])
        ordered = self._weather_adjusted_buckets(
            buckets=ordered,
            shopper_profile=shopper_profile,
            anchor_bucket=anchor_bucket,
        )
        return ordered[:4]

    def _inspired_style_score(
        self,
        *,
        product: dict,
        image_analysis: ImageAnalysisSummary,
        orchestration_context: Optional[dict],
        shopper_profile: ShopperProfile,
        anchor_bucket: str,
    ) -> int:
        text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()
        style_terms = " ".join(
            image_analysis.style_direction
            + image_analysis.occasion_cues
            + ([shopper_profile.occasion_context] if shopper_profile.occasion_context else [])
            + ((orchestration_context or {}).get("style_direction") or [])
            + ([((orchestration_context or {}).get("occasion_feel") or "")])
        ).lower()

        score = 0
        if any(token in style_terms for token in ["minimal", "elegant", "evening", "formal", "polished"]):
            if any(token in text for token in ["tailored", "dress", "heel", "sleek", "blazer", "loafer", "structured"]):
                score += 4
            if any(token in text for token in ["graphic", "sport", "beach", "slipper"]):
                score -= 3
        if any(token in style_terms for token in ["casual", "relaxed", "weekend", "off-duty", "everyday"]):
            if any(token in text for token in ["casual", "sneaker", "denim", "cotton", "linen", "relaxed"]):
                score += 3
        if any(token in style_terms for token in ["smart casual", "office", "work"]):
            if any(token in text for token in ["tailored", "blazer", "shirt", "trouser", "loafer", "smart"]):
                score += 4
        if any(token in style_terms for token in ["streetwear", "oversized", "urban"]):
            if any(token in text for token in ["oversized", "hoodie", "sneaker", "graphic", "street"]):
                score += 4

        if anchor_bucket == "dresswear" and "dress" in text:
            score += 4
        if anchor_bucket == "outerwear" and any(token in text for token in ["blazer", "jacket", "coat"]):
            score += 4

        return score

    def _inspiration_silhouette_score(
        self,
        *,
        product: dict,
        image_analysis: ImageAnalysisSummary,
        orchestration_context: Optional[dict],
        anchor_bucket: str,
    ) -> int:
        text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()
        cues = " ".join(
            image_analysis.silhouette_cues
            + ([((orchestration_context or {}).get("silhouette_direction") or "")])
        ).lower()

        score = 0
        if "fitted" in cues or "body-skimming" in cues or "sleek" in cues:
            if any(token in text for token in ["fitted", "slim", "sheath", "bodycon", "pencil", "sleek"]):
                score += 4
        if "relaxed" in cues or "flowy" in cues or "soft" in cues:
            if any(token in text for token in ["relaxed", "oversized", "flowy", "soft", "easy fit", "wide"]):
                score += 3
        if "structured" in cues or "tailored" in cues:
            if any(token in text for token in ["structured", "tailored", "blazer", "sharp", "straight"]):
                score += 3
        if "one-piece" in cues and anchor_bucket == "dresswear" and "dress" in text:
            score += 3
        return score

    def _inspiration_scope_score(
        self,
        *,
        bucket: str,
        image_analysis: ImageAnalysisSummary,
    ) -> int:
        completeness = (image_analysis.completeness or "").lower()
        if "full outfit" in completeness and bucket in {"dresswear", "tops", "bottoms", "outerwear"}:
            return 2
        if "top-only" in completeness and bucket == "tops":
            return 3
        if "lower-half" in completeness and bucket == "bottoms":
            return 3
        if "dress" in completeness and bucket == "dresswear":
            return 3
        return 0

    def _inspired_support_context_score(
        self,
        *,
        product: dict,
        bucket: str,
        supporting_targets: list[str],
        hero_bucket: str,
        visible_buckets: list[str],
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        orchestration_context: Optional[dict],
    ) -> int:
        score = 0
        text = " ".join(
            [
                product.get("title", ""),
                product.get("category", ""),
                product.get("description", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()
        bold_preferred = self._prefers_bold_style(shopper_profile)

        if bucket in supporting_targets:
            score += 9
            score += max(0, 3 - supporting_targets.index(bucket))
        else:
            score -= 6

        if bucket == hero_bucket and bucket not in {"accessories"}:
            score -= 10

        if bucket in visible_buckets and bucket != hero_bucket:
            score += 1

        occasion = (shopper_profile.occasion_context or (orchestration_context or {}).get("occasion_feel") or "").lower()
        if any(token in occasion for token in {"office", "work", "meeting"}):
            if any(token in text for token in {"tailored", "blazer", "loafer", "shirt", "trouser", "heel"}):
                score += 4
            if any(token in text for token in {"graphic", "sport", "beach"}):
                score -= 3
        elif any(token in occasion for token in {"dinner", "evening", "date", "event"}):
            if any(token in text for token in {"tailored", "dress", "heel", "boot", "blazer", "skirt", "bag"}):
                score += 4
            if any(token in text for token in {"jogger", "sweat", "trainer"}):
                score -= 3
            if bucket == "bottoms":
                if any(token in text for token in {"trouser", "tailored", "straight", "chino", "dark denim", "jean"}):
                    score += 4
                if any(token in text for token in {"short", "cargo"}):
                    score -= 10
            if bucket == "outerwear":
                if any(token in text for token in {"blazer", "overshirt", "coat", "structured", "tailored"}):
                    score += 4
                if any(token in text for token in {"hoodie", "fleece", "puffer"}):
                    score -= 6
                if any(token in text for token in {"leather", "biker", "moto"}) and not bold_preferred:
                    score -= 6
            if bucket == "footwear":
                if any(token in text for token in {"loafer", "boot", "minimal sneaker", "clean sneaker", "heel"}):
                    score += 3
                if any(token in text for token in {"running", "trainer", "slide", "flip flop", "sandal"}):
                    score -= 6
        elif any(token in occasion for token in {"casual", "weekend", "outing", "everyday"}):
            if any(token in text for token in {"sneaker", "denim", "cotton", "linen", "casual"}):
                score += 3

        weather = (shopper_profile.weather_context or "").lower()
        if weather in {"warm", "hot"}:
            if any(token in text for token in {"linen", "lightweight", "short", "sandal", "tee"}):
                score += 3
            if any(token in text for token in {"wool", "heavyweight", "parka", "fleece", "leather"}):
                score -= 4
        elif weather in {"cold", "cool"}:
            if any(token in text for token in {"wool", "coat", "jacket", "blazer", "boot", "knit"}):
                score += 4
            if any(token in text for token in {"sandal", "short", "sleeveless"}):
                score -= 4
        elif weather == "rainy":
            if any(token in text for token in {"boot", "jacket", "coat", "outerwear"}):
                score += 3
            if "sandal" in text:
                score -= 3

        style_blob = " ".join(
            image_analysis.style_direction
            + image_analysis.silhouette_cues
            + image_analysis.color_harmony_cues
            + ((orchestration_context or {}).get("style_direction") or [])
        ).lower()
        if "polished" in style_blob or "tailored" in style_blob or "minimal elegant" in style_blob:
            if any(token in text for token in {"tailored", "blazer", "trouser", "loafer", "heel", "structured"}):
                score += 2
        if "casual" in style_blob or "relaxed" in style_blob:
            if any(token in text for token in {"sneaker", "denim", "casual", "hoodie"}):
                score += 2
        if "neutral palette" in style_blob or "monochrome potential" in style_blob:
            if any(token in text for token in {"black", "white", "grey", "gray", "cream", "beige", "navy"}):
                score += 2
        if "cool palette" in style_blob:
            if any(token in text for token in {"grey", "gray", "blue", "navy", "black", "white", "silver"}):
                score += 2
        if "warm palette" in style_blob:
            if any(token in text for token in {"brown", "tan", "beige", "cream", "camel", "olive", "gold"}):
                score += 2

        return score

    def _select_inspired_support_products(
        self,
        *,
        scored_products: list[dict],
        supporting_targets: list[str],
        support_slots: list[dict],
        required_segment: str,
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        hero_bucket: str,
        visible_buckets: list[str],
        orchestration_context: Optional[dict],
        limit: int,
    ) -> list[dict]:
        selected = []
        used_ids = set()

        for slot in support_slots:
            for item in scored_products:
                if item["id"] in used_ids:
                    continue
                if not self._matches_support_slot(item=item, slot=slot):
                    continue
                if not self._valid_inspired_support_candidate(
                    item=item,
                    required_segment=required_segment,
                    supporting_targets=supporting_targets,
                    palette_strategy=palette_strategy,
                    shopper_profile=shopper_profile,
                    image_analysis=image_analysis,
                    hero_bucket=hero_bucket,
                    visible_buckets=visible_buckets,
                    orchestration_context=orchestration_context,
                ):
                    continue
                selected.append({**item, "support_slot": slot["key"]})
                used_ids.add(item["id"])
                break
            if len(selected) >= limit:
                break

        return selected[:limit]

    def _repair_inspired_support_selection(
        self,
        *,
        scored_products: list[dict],
        supporting_targets: list[str],
        support_slots: list[dict],
        required_segment: str,
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        hero_bucket: str,
        visible_buckets: list[str],
        orchestration_context: Optional[dict],
        limit: int,
    ) -> list[dict]:
        tightened_pool = [
            item
            for item in scored_products
            if item["bucket"] in supporting_targets and item["palette_score"] >= 0 and item["context_score"] >= 0
        ]
        return self._select_inspired_support_products(
            scored_products=tightened_pool,
            supporting_targets=supporting_targets,
            support_slots=support_slots,
            required_segment=required_segment,
            palette_strategy=palette_strategy,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            hero_bucket=hero_bucket,
            visible_buckets=visible_buckets,
            orchestration_context=orchestration_context,
            limit=limit,
        )

    def _validate_inspired_support_selection(
        self,
        *,
        selected: list[dict],
        required_segment: str,
        supporting_targets: list[str],
        support_slots: list[dict],
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        hero_bucket: str,
        visible_buckets: list[str],
        orchestration_context: Optional[dict],
    ) -> bool:
        if not selected:
            return True
        return self._validate_support_slot_selection(
            selected=selected,
            support_slots=support_slots,
        ) and all(
            self._valid_inspired_support_candidate(
                item=item,
                required_segment=required_segment,
                supporting_targets=supporting_targets,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                hero_bucket=hero_bucket,
                visible_buckets=visible_buckets,
                orchestration_context=orchestration_context,
            )
            for item in selected
        )

    def _valid_inspired_hero_candidate(
        self,
        *,
        item: dict,
        required_segment: str,
        anchor_bucket: str,
        palette_strategy: dict,
    ) -> bool:
        if not self._product_segment_compatible(item, required_segment):
            return False
        if item.get("bucket") != anchor_bucket:
            return False
        if self._complete_look_palette_score(
            product_colors=item.get("product_colors", []),
            bucket=item.get("bucket"),
            palette_strategy=palette_strategy,
        ) < 0:
            return False
        return True

    def _valid_inspired_support_candidate(
        self,
        *,
        item: dict,
        required_segment: str,
        supporting_targets: list[str],
        palette_strategy: dict,
        shopper_profile: ShopperProfile,
        image_analysis: ImageAnalysisSummary,
        hero_bucket: str,
        visible_buckets: list[str],
        orchestration_context: Optional[dict],
    ) -> bool:
        if not self._product_segment_compatible(item, required_segment):
            return False
        if item.get("bucket") not in supporting_targets:
            return False
        if self._complete_look_palette_score(
            product_colors=item.get("product_colors", []),
            bucket=item.get("bucket"),
            palette_strategy=palette_strategy,
        ) < 0:
            return False
        if self._inspired_support_context_score(
            product=item,
            bucket=item.get("bucket"),
            supporting_targets=supporting_targets,
            hero_bucket=hero_bucket,
            visible_buckets=visible_buckets,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            orchestration_context=orchestration_context,
        ) < 0:
            return False
        text = self._product_text(item)
        occasion = (shopper_profile.occasion_context or (orchestration_context or {}).get("occasion_feel") or "").lower()
        weather = (shopper_profile.weather_context or "").lower()
        if self._violates_weather_rule(text=text, bucket=item.get("bucket") or "general", weather=weather):
            return False
        if self._violates_occasion_rule(text=text, occasion=occasion):
            return False
        if self._violates_refined_occasion_rule(
            text=text,
            bucket=item.get("bucket") or "general",
            occasion=occasion,
            shopper_profile=shopper_profile,
        ):
            return False
        return True

    def _hero_similarity_label(
        self,
        item: dict,
        *,
        image_analysis: ImageAnalysisSummary,
        orchestration_context: Optional[dict],
    ) -> str:
        palette_score = item.get("palette_score", 0)
        silhouette_score = item.get("silhouette_score", 0)
        style_score = item.get("style_score", 0)

        if palette_score >= 3 and silhouette_score >= 3:
            return "Close colour + silhouette match"
        if palette_score >= 2 and style_score >= 3:
            return "Strong style match"
        if item.get("bucket") == self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=self.normalize_product_segment(item),
            orchestration_context=orchestration_context,
        ):
            return "Closest match"
        return "Strong match"

    def _inspired_match_badges(
        self,
        item: dict,
        *,
        image_analysis: ImageAnalysisSummary,
        shopper_profile: ShopperProfile,
        orchestration_context: Optional[dict],
        include_occasion: bool,
    ) -> list[str]:
        badges: list[str] = []
        palette = image_analysis.palette[:2]
        style_direction = (orchestration_context or {}).get("style_direction") or image_analysis.style_direction
        silhouette = (orchestration_context or {}).get("silhouette_direction") or (
            image_analysis.silhouette_cues[0] if image_analysis.silhouette_cues else ""
        )
        occasion = shopper_profile.occasion_context or (orchestration_context or {}).get("occasion_feel") or ""

        if palette:
            badges.append(", ".join(palette[:2]))
        if style_direction:
            if isinstance(style_direction, list):
                badges.append(style_direction[0])
            else:
                badges.append(str(style_direction))
        if silhouette:
            badges.append(str(silhouette))
        if include_occasion and occasion:
            badges.append(str(occasion))

        return [badge for badge in badges if badge][:4]

    def _inspired_style_label(
        self,
        image_analysis: ImageAnalysisSummary,
        orchestration_context: Optional[dict],
    ) -> str:
        style_direction = (orchestration_context or {}).get("style_direction") or image_analysis.style_direction
        if isinstance(style_direction, str):
            return style_direction
        if style_direction:
            return ", ".join(style_direction[:2])
        return "the same overall mood"

    def _build_inspired_hero_reason(
        self,
        *,
        item: dict,
        anchor_label: str,
        palette_strategy: str,
        style_label: str,
        shopper_profile: ShopperProfile,
    ) -> str:
        details = [f"keeps the {anchor_label} focus"]
        if palette_strategy:
            details.append(f"stays inside a {palette_strategy}")
        if style_label:
            details.append(f"holds onto {style_label}")
        if shopper_profile.occasion_context:
            details.append(f"still works for {shopper_profile.occasion_context}")
        return "Closest hero match: " + ", ".join(details[:3]) + "."

    def _build_inspired_support_reason(
        self,
        *,
        item: dict,
        hero_item: dict,
        palette_strategy: str,
        style_label: str,
        shopper_profile: ShopperProfile,
    ) -> str:
        bucket = item.get("bucket") or "general"
        bucket_copy = {
            "bottoms": "grounds the recreated look around the hero piece",
            "footwear": "finishes the recreated look cleanly",
            "outerwear": "adds shape and polish around the hero piece",
            "accessories": "adds the right finishing mood without distracting from the hero",
            "tops": "supports the hero item without overpowering it",
            "dresswear": "keeps the recreated silhouette close to the inspiration",
        }.get(bucket, "supports the recreated outfit")
        details = [bucket_copy]
        if palette_strategy:
            details.append(f"stays within a {palette_strategy}")
        if style_label:
            details.append(f"keeps the look in {style_label}")
        if shopper_profile.weather_context:
            details.append(f"works in {shopper_profile.weather_context} weather")
        return f"Built around {hero_item.get('title')}: " + ", ".join(details[:3]) + "."

    def _price_text(self, price: object) -> Optional[str]:
        if price in (None, ""):
            return None

        return str(price)

    def _product_url(self, item: dict) -> Optional[str]:
        handle = item.get("handle")
        storefront_domain = settings.shopify_storefront_domain or settings.shopify_store_domain
        if handle and storefront_domain:
            normalized_domain = storefront_domain.replace("https://", "").replace("http://", "").strip("/")
            return f"https://{normalized_domain}/products/{handle}"

        if item.get("product_url"):
            return str(item["product_url"])

        return None

    def _inventory_fields(self, item: dict) -> dict:
        return {
            "sku": item.get("sku"),
            "available_for_sale": item.get("available_for_sale"),
            "inventory_quantity": item.get("inventory_quantity"),
            "inventory_policy": item.get("inventory_policy"),
            "inventory_tracked": item.get("inventory_tracked"),
        }

    def _enrich_selected_products(self, selected: list[dict]) -> list[dict]:
        missing_ids = [
            item.get("shopify_product_id")
            for item in selected
            if item.get("shopify_product_id")
            and (
                not item.get("handle")
                or not item.get("shopify_variant_id")
                or not item.get("product_url")
                or item.get("available_for_sale") is None
                or item.get("inventory_quantity") is None
            )
        ]

        if not missing_ids:
            return selected

        try:
            details = self.shopify_service.fetch_product_card_details(missing_ids)
        except Exception:
            return selected

        enriched = []
        for item in selected:
            detail = details.get(item.get("shopify_product_id"), {})
            enriched.append(
                {
                    **item,
                    "handle": item.get("handle") or detail.get("handle"),
                    "product_url": item.get("product_url") or detail.get("product_url"),
                    "shopify_variant_id": item.get("shopify_variant_id") or detail.get("shopify_variant_id"),
                    "sku": item.get("sku") or detail.get("sku"),
                    "available_for_sale": (
                        item.get("available_for_sale")
                        if item.get("available_for_sale") is not None
                        else detail.get("available_for_sale")
                    ),
                    "inventory_quantity": (
                        item.get("inventory_quantity")
                        if item.get("inventory_quantity") is not None
                        else detail.get("inventory_quantity")
                    ),
                    "inventory_policy": item.get("inventory_policy") or detail.get("inventory_policy"),
                    "inventory_tracked": (
                        item.get("inventory_tracked")
                        if item.get("inventory_tracked") is not None
                        else detail.get("inventory_tracked")
                    ),
                }
            )

        return enriched

    def _infer_request_segment(
        self,
        query_text: str,
        shopper_profile: Optional[ShopperProfile],
        terms: set[str],
    ) -> Optional[str]:
        if shopper_profile and shopper_profile.segment_preference in self.strict_segments:
            return shopper_profile.segment_preference

        context = " ".join(
            [
                query_text or "",
                shopper_profile.summary if shopper_profile and shopper_profile.summary else "",
                shopper_profile.occasion_context if shopper_profile and shopper_profile.occasion_context else "",
                " ".join(shopper_profile.style_identity) if shopper_profile else "",
                " ".join(shopper_profile.focus_points) if shopper_profile else "",
                " ".join(sorted(terms)),
            ]
        ).lower()

        normalized_tokens = self._tokenize(context)
        mens_tokens = {"men", "mens", "menswear", "male", "groom", "boyfriend", "husband"}
        womens_tokens = {
            "women",
            "womens",
            "womenswear",
            "female",
            "bridal",
            "bridesmaid",
            "girlfriend",
            "wife",
        }

        if normalized_tokens.intersection(womens_tokens):
            return "womenswear"
        if normalized_tokens.intersection(mens_tokens):
            return "menswear"
        return None

    def _infer_product_segment(self, product: dict) -> str:
        return self.normalize_product_segment(product)

    def _accessory_requested(self, query_text: str, terms: set[str]) -> bool:
        text = f"{query_text or ''} {' '.join(sorted(terms))}".lower()
        requested_tokens = {
            "accessory",
            "accessories",
            "bag",
            "bags",
            "belt",
            "hat",
            "cap",
            "jewellery",
            "jewelry",
            "watch",
            "wallet",
        }
        return any(token in text for token in requested_tokens)

    def _parse_budget_cap(self, query_text: str) -> Optional[float]:
        if not query_text:
            return None

        match = re.search(r"(\d+(?:\.\d+)?)\s*(?:€|eur|euro|euros)", query_text.lower())
        if not match:
            return None

        try:
            return float(match.group(1))
        except ValueError:
            return None

    def _price_value(self, price: object) -> Optional[float]:
        if price in (None, ""):
            return None

        try:
            return float(price)
        except (TypeError, ValueError):
            return None

    def fallback_segment_products(
        self,
        *,
        required_segment: str,
        limit: int = 3,
        exclude_product_ids: Optional[list[str]] = None,
    ) -> list[ProductRecommendation]:
        if required_segment not in self.strict_segments:
            return []

        excluded_ids = {item for item in (exclude_product_ids or []) if item}
        catalog = [
            product
            for product in self._filter_catalog_by_segment(self._catalog(), required_segment)
            if product.get("id") not in excluded_ids
        ]
        scored_products = [
            self._score_product(
                product,
                set(),
                False,
                required_segment,
                None,
                False,
            )
            for product in catalog
        ]
        scored_products.sort(key=lambda item: (item["score"], len(item.get("tags", []))), reverse=True)
        selected = self._select_products(scored_products, limit, False, "general", required_segment)
        selected = self._enrich_selected_products(selected)
        return [
            ProductRecommendation(
                id=item["id"],
                title=item["title"],
                category=item["category"],
                reason="Safe same-category fallback from the live catalog.",
                segment=required_segment,
                tags=item.get("tags", []),
                image_url=item.get("image_url"),
                price=self._price_text(item.get("price")),
                product_url=self._product_url(item),
                cart_variant_id=item.get("shopify_variant_id") or None,
                **self._inventory_fields(item),
            )
            for item in selected
        ]

    def _display_label_to_bucket(self, value: str) -> str:
        normalized = (value or "").strip().lower()
        mapping = {
            "top": "tops",
            "inner layer": "tops",
            "bottom": "bottoms",
            "outer layer": "outerwear",
            "shoes": "footwear",
            "footwear": "footwear",
            "bag": "accessories",
            "accessory": "accessories",
            "finishing touch": "accessories",
            "accessories": "accessories",
            "dress": "dresswear",
        }
        return mapping.get(normalized, self._product_category_bucket(normalized))

    def _generic_reason_phrases(self) -> tuple[str, ...]:
        return (
            "matches the shopper request",
            "matches your request",
            "versatile option",
            "safe same-category fallback",
            "complements the requested look",
            "works well with",
        )

    def _reason_quality_status(self, *, mode: str, item: ProductRecommendation) -> str:
        reason = (item.reason or "").strip().lower()
        if not reason or len(reason) < 35:
            return "repairable"
        if any(phrase in reason for phrase in self._generic_reason_phrases()):
            return "repairable"
        if mode == "complete_the_look" and "built around" not in reason:
            return "repairable"
        if mode == "get_inspired":
            if item.role == "hero":
                if not any(token in reason for token in {"closest hero match", "recreated look", "hero piece"}):
                    return "repairable"
            elif not any(
                token in reason
                for token in {
                    "built around",
                    "recreated look",
                    "hero piece",
                    "the hero",
                }
            ):
                return "repairable"
        return "pass"

    def _rebuild_recommendation_reason(
        self,
        *,
        mode: str,
        item: ProductRecommendation,
        shopper_profile: Optional[ShopperProfile],
        query_text: str,
        image_analysis: Optional[ImageAnalysisSummary],
        orchestration_context: Optional[dict],
    ) -> str:
        catalog_rows = self.products_by_ids([item.id])
        source = catalog_rows[0] if catalog_rows else {
            "id": item.id,
            "title": item.title,
            "category": item.category,
            "tags": item.tags,
        }

        if mode == "complete_the_look" and image_analysis is not None:
            palette_strategy = self._palette_strategy(
                image_analysis=image_analysis,
                shopper_profile=shopper_profile or ShopperProfile(),
                orchestration_context=orchestration_context,
            )
            return self._build_complete_look_reason(
                item={**source, "bucket": self._product_category_bucket(f"{item.category} {item.title}")},
                anchor_label=image_analysis.anchor_item or "your anchor piece",
                strategy_label=palette_strategy["label"],
                occasion=shopper_profile.occasion_context if shopper_profile else None,
                weather=shopper_profile.weather_context if shopper_profile else None,
            )

        if mode == "get_inspired" and image_analysis is not None:
            palette_strategy = self._palette_strategy(
                image_analysis=image_analysis,
                shopper_profile=shopper_profile or ShopperProfile(),
                orchestration_context=orchestration_context,
            )
            style_label = self._inspired_style_label(image_analysis, orchestration_context)
            if item.role == "hero":
                return self._build_inspired_hero_reason(
                    item={**source, "bucket": self._product_category_bucket(f"{item.category} {item.title}")},
                    anchor_label=image_analysis.anchor_item or "the inspiration anchor",
                    palette_strategy=palette_strategy["label"],
                    style_label=style_label,
                    shopper_profile=shopper_profile or ShopperProfile(),
                )
            hero_reference = None
            if orchestration_context and orchestration_context.get("hero_reference"):
                hero_reference = orchestration_context["hero_reference"]
            if not hero_reference:
                hero_reference = {"title": image_analysis.anchor_item or "the hero piece"}
            return self._build_inspired_support_reason(
                item={**source, "bucket": self._product_category_bucket(f"{item.category} {item.title}")},
                hero_item=hero_reference,
                palette_strategy=palette_strategy["label"],
                style_label=style_label,
                shopper_profile=shopper_profile or ShopperProfile(),
            )

        palette_strategy = self._text_palette_strategy(
            shopper_profile=shopper_profile,
            terms=self._expand_terms(self._tokenize(query_text)),
            query_text=query_text,
        )
        return self._build_text_outfit_reason(
            item={**source, "bucket": self._product_category_bucket(f"{item.category} {item.title}")},
            shopper_profile=shopper_profile,
            palette_strategy=palette_strategy,
            complementary=False,
        )

    def _bundle_balance_issue(
        self,
        *,
        mode: str,
        recommendations: list[ProductRecommendation],
        image_analysis: Optional[ImageAnalysisSummary],
        gap_analysis: Optional[GapAnalysis],
    ) -> Optional[str]:
        if not recommendations:
            return None

        buckets = [self._product_category_bucket(f"{item.category} {item.title}") for item in recommendations]
        distinct_core = {bucket for bucket in buckets if bucket not in {"accessories", "general"}}
        if mode == "outfit_curation" and len(distinct_core) < 2:
            return "silhouette_balance"

        if mode == "complete_the_look" and image_analysis is not None:
            anchor_bucket = self._anchor_bucket_from_image_analysis(
                image_analysis=image_analysis,
                required_segment=recommendations[0].segment or "unknown",
            )
            support_slots = [self._normalize_support_slot_label(item.support_slot) for item in recommendations]
            if support_slots and len(support_slots) != len(set(support_slots)):
                return "composition_balance"
            if anchor_bucket in {"tops", "outerwear"} and "bottoms" not in buckets:
                return "silhouette_balance"
            if anchor_bucket == "bottoms" and "tops" not in buckets:
                return "silhouette_balance"
            if anchor_bucket == "dresswear" and "footwear" not in buckets:
                return "silhouette_balance"
            if anchor_bucket == "dresswear":
                required_slots = {"footwear", "bag", "accessory"}
                if not required_slots.issubset(set(support_slots)):
                    return "composition_balance"
            if gap_analysis:
                target_buckets = {self._display_label_to_bucket(item) for item in gap_analysis.recommendation_targets}
                if target_buckets and not any(bucket in target_buckets for bucket in buckets):
                    return "gap_analysis"

        if mode == "get_inspired":
            hero = next((item for item in recommendations if item.role == "hero"), recommendations[0] if recommendations else None)
            if hero is None:
                return "hero_item_correctness"
            hero_bucket = self._product_category_bucket(f"{hero.category} {hero.title}")
            support_items = [item for item in recommendations if item.id != hero.id]
            support_slots = [self._normalize_support_slot_label(item.support_slot) for item in support_items]
            if support_slots and len(support_slots) != len(set(support_slots)):
                return "composition_balance"
            support_buckets = {
                self._product_category_bucket(f"{item.category} {item.title}")
                for item in recommendations
                if item.id != hero.id
            }
            if hero_bucket in {"tops", "outerwear"} and not support_buckets.intersection({"bottoms", "footwear"}):
                return "silhouette_balance"
            if hero_bucket == "dresswear" and "footwear" not in support_buckets:
                return "silhouette_balance"
            if hero_bucket == "dresswear":
                required_slots = {"footwear", "bag", "accessory"}
                if not required_slots.issubset(set(support_slots)):
                    return "composition_balance"

        return None

    def _hero_validation_status(
        self,
        *,
        recommendations: list[ProductRecommendation],
        required_segment: str,
        shopper_profile: Optional[ShopperProfile],
        image_analysis: Optional[ImageAnalysisSummary],
        orchestration_context: Optional[dict],
    ) -> str:
        if not recommendations or image_analysis is None:
            return "fail"
        hero = next((item for item in recommendations if item.role == "hero"), recommendations[0])
        if self._strong_dress_signal(image_analysis=image_analysis, required_segment=required_segment):
            hero_bucket = self._product_category_bucket(f"{hero.category} {hero.title}")
            if hero_bucket != "dresswear":
                return "fail"
        hero_rows = self.products_by_ids([hero.id])
        if not hero_rows:
            return "fail"
        row = hero_rows[0]
        anchor_bucket = self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        palette_strategy = self._palette_strategy(
            image_analysis=image_analysis,
            shopper_profile=shopper_profile or ShopperProfile(),
            orchestration_context=orchestration_context,
        )
        evaluated = {
            **row,
            "bucket": self._product_bucket(row),
            "product_colors": self._product_color_tags(row),
            "palette_score": self._complete_look_palette_score(
                product_colors=self._product_color_tags(row),
                bucket=self._product_bucket(row),
                palette_strategy=palette_strategy,
            ),
            "style_score": self._inspired_style_score(
                product=row,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
                shopper_profile=shopper_profile or ShopperProfile(),
                anchor_bucket=anchor_bucket,
            ),
            "silhouette_score": self._inspiration_silhouette_score(
                product=row,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
                anchor_bucket=anchor_bucket,
            ),
        }
        if not self._valid_inspired_hero_candidate(
            item=evaluated,
            required_segment=required_segment,
            anchor_bucket=anchor_bucket,
            palette_strategy=palette_strategy,
        ):
            return "fail"
        if evaluated["style_score"] <= 0 and evaluated["silhouette_score"] <= 0:
            return "fail"
        return "pass"

    def _validate_recommendation_item(
        self,
        *,
        mode: str,
        item: ProductRecommendation,
        required_segment: str,
        shopper_profile: Optional[ShopperProfile],
        query_text: str,
        image_analysis: Optional[ImageAnalysisSummary],
        gap_analysis: Optional[GapAnalysis],
        orchestration_context: Optional[dict],
        visible_buckets: set[str],
        target_buckets: set[str],
    ) -> RecommendationValidationItem:
        result = RecommendationValidationItem(recommendation_id=item.id, category=item.category)
        bucket = self._product_category_bucket(f"{item.category} {item.title}")
        catalog_rows = self.products_by_ids([item.id])
        row = catalog_rows[0] if catalog_rows else None
        text = self._product_text(row) if row is not None else f"{item.title} {item.category} {item.reason}".lower()
        evaluated = {
            **(row or {}),
            "bucket": bucket,
            "product_colors": self._product_color_tags(row) if row is not None else [],
        }

        if (item.segment or "").strip().lower() != required_segment:
            result.status = "repairable"
            result.failed_rules.append("segment_mode")
        occasion = (shopper_profile.occasion_context or "").lower() if shopper_profile else ""
        weather = (shopper_profile.weather_context or "").lower() if shopper_profile else ""

        if mode == "complete_the_look":
            if bucket in visible_buckets and bucket not in {"outerwear", "accessories"}:
                result.status = "fail"
                result.failed_rules.append("anchor_gap_correctness")
            if target_buckets and bucket not in target_buckets:
                result.status = "fail"
                result.failed_rules.append("gap_analysis_correctness")

        if self._violates_occasion_rule(text=text, occasion=occasion) or self._violates_refined_occasion_rule(
            text=text,
            bucket=bucket,
            occasion=occasion,
            shopper_profile=shopper_profile,
        ):
            if result.status != "fail":
                result.status = "repairable"
            result.failed_rules.append("occasion_fit")

        if self._violates_weather_rule(text=text, bucket=bucket, weather=weather):
            if result.status != "fail":
                result.status = "repairable"
            result.failed_rules.append("weather_fit")

        palette_strategy = (
            self._palette_strategy(
                image_analysis=image_analysis,
                shopper_profile=shopper_profile or ShopperProfile(),
                orchestration_context=orchestration_context,
            )
            if image_analysis is not None
            else self._text_palette_strategy(
                shopper_profile=shopper_profile,
                terms=self._expand_terms(self._tokenize(query_text)),
                query_text=query_text,
            )
        )
        if row is not None:
            if self._complete_look_palette_score(
                product_colors=evaluated["product_colors"],
                bucket=bucket,
                palette_strategy=palette_strategy,
            ) < 0:
                if result.status != "fail":
                    result.status = "repairable"
                result.failed_rules.append("color_harmony")

        if mode == "complete_the_look" and image_analysis is not None and row is not None:
            target_bucket_list = list(target_buckets) or ["bottoms", "footwear", "outerwear", "accessories"]
            if self._complete_look_context_score(
                product=row,
                bucket=bucket,
                target_buckets=target_bucket_list,
                visible_buckets=list(visible_buckets),
                shopper_profile=shopper_profile or ShopperProfile(),
                image_analysis=image_analysis,
            ) < 0:
                if result.status != "fail":
                    result.status = "repairable"
                result.failed_rules.append("silhouette_balance")
        elif mode == "get_inspired" and image_analysis is not None:
            hero = next((entry for entry in [item] if entry.role == "hero"), None)
            if hero and self._hero_validation_status(
                recommendations=[item],
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                image_analysis=image_analysis,
                orchestration_context=orchestration_context,
            ) == "fail":
                result.status = "fail"
                result.failed_rules.append("hero_item_correctness")
        elif row is not None:
            context_score = self._text_outfit_context_score(
                product=row,
                bucket=bucket,
                query_bucket=self._query_bucket(self._expand_terms(self._tokenize(query_text))),
                complementary=False,
                shopper_profile=shopper_profile,
                target_segment=required_segment,
            )
            if context_score < 0:
                if result.status != "fail":
                    result.status = "repairable"
                result.failed_rules.append("silhouette_balance")

        if row is None:
            if result.status != "fail":
                result.status = "repairable"
            result.failed_rules.append("catalog_validity")

        reason_status = self._reason_quality_status(mode=mode, item=item)
        if reason_status != "pass":
            if result.status != "fail":
                result.status = "repairable"
            result.failed_rules.append("explanation_quality")

        return result

    def _repair_recommendation_reason_only(
        self,
        *,
        recommendations: list[ProductRecommendation],
        recommendation_id: str,
        mode: str,
        shopper_profile: Optional[ShopperProfile],
        query_text: str,
        image_analysis: Optional[ImageAnalysisSummary],
        orchestration_context: Optional[dict],
    ) -> list[ProductRecommendation]:
        repaired: list[ProductRecommendation] = []
        hero_reference = next((item for item in recommendations if item.role == "hero"), None)
        enriched_context = dict(orchestration_context or {})
        if hero_reference is not None:
            enriched_context["hero_reference"] = {"title": hero_reference.title}
        for item in recommendations:
            if item.id != recommendation_id:
                repaired.append(item)
                continue
            repaired.append(
                item.copy(
                    update={
                        "reason": self._rebuild_recommendation_reason(
                            mode=mode,
                            item=item,
                            shopper_profile=shopper_profile,
                            query_text=query_text,
                            image_analysis=image_analysis,
                            orchestration_context=enriched_context,
                        )
                    }
                )
            )
        return repaired

    def validate_generated_recommendations(
        self,
        *,
        mode: str,
        recommendations: list[ProductRecommendation],
        required_segment: str,
        shopper_profile: Optional[ShopperProfile],
        query_text: str,
        image_analysis: Optional[ImageAnalysisSummary] = None,
        gap_analysis: Optional[GapAnalysis] = None,
        orchestration_context: Optional[dict] = None,
    ) -> RecommendationValidationResult:
        current = list(recommendations)
        visible_buckets: set[str] = set()
        target_buckets: set[str] = set()

        if mode == "complete_the_look" and image_analysis is not None:
            visible_buckets = set(
                self._visible_buckets_from_image_analysis(
                    image_analysis=image_analysis,
                    required_segment=required_segment,
                    orchestration_context=orchestration_context,
                )
            )
            if gap_analysis:
                target_buckets = {
                    self._display_label_to_bucket(value)
                    for value in gap_analysis.recommendation_targets
                    if self._display_label_to_bucket(value) != "general"
                }

        item_results = [
            self._validate_recommendation_item(
                mode=mode,
                item=item,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                query_text=query_text,
                image_analysis=image_analysis,
                gap_analysis=gap_analysis,
                orchestration_context=orchestration_context,
                visible_buckets=visible_buckets,
                target_buckets=target_buckets,
            )
            for item in current
        ]

        bundle_issue = self._bundle_balance_issue(
            mode=mode,
            recommendations=current,
            image_analysis=image_analysis,
            gap_analysis=gap_analysis,
        )
        if mode == "get_inspired" and self._hero_validation_status(
            recommendations=current,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            orchestration_context=orchestration_context,
        ) == "fail":
            bundle_issue = "hero_item_correctness"

        repaired = False
        for result in item_results:
            if result.status != "repairable":
                continue
            repairable_rules = set(result.failed_rules)
            if repairable_rules == {"explanation_quality"}:
                current = self._repair_recommendation_reason_only(
                    recommendations=current,
                    recommendation_id=result.recommendation_id,
                    mode=mode,
                    shopper_profile=shopper_profile,
                    query_text=query_text,
                    image_analysis=image_analysis,
                    orchestration_context=orchestration_context,
                )
                repaired = True
                continue

            swap_category = self._product_category_bucket(result.category)
            if (
                mode == "complete_the_look"
                and gap_analysis is not None
                and "gap_analysis_correctness" in repairable_rules
            ):
                existing_buckets = {
                    self._product_category_bucket(f"{item.category} {item.title}")
                    for item in current
                    if item.id != result.recommendation_id
                }
                preferred_targets = [
                    self._display_label_to_bucket(value)
                    for value in gap_analysis.recommendation_targets
                    if self._display_label_to_bucket(value) != "general"
                ]
                replacement_bucket = next(
                    (bucket for bucket in preferred_targets if bucket not in existing_buckets),
                    preferred_targets[0] if preferred_targets else swap_category,
                )
                swap_category = replacement_bucket or swap_category
            repaired_products, replacement = self.swap_recommendations(
                current_products=current,
                swap_category=swap_category,
                mode=mode,
                context_note=query_text,
                shopper_profile=shopper_profile,
                required_segment=required_segment,
                image_analysis=image_analysis,
                gap_analysis=gap_analysis,
                orchestration_context=orchestration_context,
            )
            if replacement is None:
                result.status = "fail"
                continue
            current = repaired_products
            repaired = True

        revalidated = [
            self._validate_recommendation_item(
                mode=mode,
                item=item,
                required_segment=required_segment,
                shopper_profile=shopper_profile,
                query_text=query_text,
                image_analysis=image_analysis,
                gap_analysis=gap_analysis,
                orchestration_context=orchestration_context,
                visible_buckets=visible_buckets,
                target_buckets=target_buckets,
            )
            for item in current
        ]

        bundle_issue = self._bundle_balance_issue(
            mode=mode,
            recommendations=current,
            image_analysis=image_analysis,
            gap_analysis=gap_analysis,
        )
        if mode == "get_inspired" and self._hero_validation_status(
            recommendations=current,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            image_analysis=image_analysis,
            orchestration_context=orchestration_context,
        ) == "fail":
            bundle_issue = "hero_item_correctness"

        unresolved_results = [result for result in revalidated if result.status != "pass"]
        invalid_ids = [result.recommendation_id for result in unresolved_results]
        if bundle_issue:
            invalid_ids.extend([item.id for item in current])

        deduped_invalid_ids: list[str] = []
        seen_invalid = set()
        for item_id in invalid_ids:
            if not item_id or item_id in seen_invalid:
                continue
            seen_invalid.add(item_id)
            deduped_invalid_ids.append(item_id)

        if deduped_invalid_ids:
            return RecommendationValidationResult(
                status="fail",
                recommendations=current,
                item_results=revalidated,
                invalid_product_ids=deduped_invalid_ids,
                repaired=repaired,
            )

        return RecommendationValidationResult(
            status="pass",
            recommendations=current,
            item_results=revalidated,
            invalid_product_ids=[],
            repaired=repaired,
        )

    def validate_recommendations_for_segment(
        self,
        recommendations: list[ProductRecommendation],
        required_segment: str,
    ) -> bool:
        if required_segment not in self.strict_segments:
            return False
        if not recommendations:
            return True

        return all((item.segment or "").strip().lower() == required_segment for item in recommendations)

    def enforce_recommendation_segment(
        self,
        *,
        recommendations: list[ProductRecommendation],
        required_segment: str,
        fallback_pool: list[ProductRecommendation],
        limit: int = 4,
    ) -> tuple[list[ProductRecommendation], bool]:
        if self.validate_recommendations_for_segment(recommendations, required_segment):
            return recommendations, False

        logger.warning("Recommendation leakage detected. Rebuilding within strict segment: %s", required_segment)
        repaired = [
            item
            for item in fallback_pool
            if (item.segment or "").strip().lower() == required_segment
        ][:limit]
        return repaired, True

    def resolve_segment_from_product_ids(self, product_ids: list[str]) -> Optional[str]:
        if not product_ids:
            return None

        catalog_by_id = {item.get("id"): item for item in self._catalog() if item.get("id")}
        segments = {
            self.normalize_product_segment(catalog_by_id[item_id])
            for item_id in product_ids
            if item_id in catalog_by_id
        }
        segments.discard("unknown")
        if len(segments) == 1:
            return next(iter(segments))
        return None

    def products_by_ids(self, product_ids: list[str]) -> list[dict]:
        if not product_ids:
            return []

        catalog_by_id = {item.get("id"): item for item in self._catalog() if item.get("id")}
        return [catalog_by_id[item_id] for item_id in product_ids if item_id in catalog_by_id]

    def build_complete_look_gap_analysis(
        self,
        *,
        image_analysis: ImageAnalysisSummary,
        required_segment: str,
        shopper_profile: Optional[ShopperProfile] = None,
        orchestration_context: Optional[dict] = None,
    ) -> GapAnalysis:
        anchor_bucket = self._anchor_bucket_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        visible_buckets = self._visible_buckets_from_image_analysis(
            image_analysis=image_analysis,
            required_segment=required_segment,
            orchestration_context=orchestration_context,
        )
        target_buckets = self._complete_look_target_buckets(
            anchor_bucket=anchor_bucket,
            visible_buckets=visible_buckets,
            required_segment=required_segment,
            shopper_profile=shopper_profile,
            orchestration_context=orchestration_context,
        )
        support_slots = self._support_slot_templates(
            anchor_bucket=anchor_bucket,
            target_buckets=target_buckets,
            shopper_profile=shopper_profile,
        )
        return GapAnalysis(
            anchor_item=image_analysis.anchor_item or None,
            present_items=[self._bucket_display_label(bucket) for bucket in visible_buckets if bucket != "general"],
            missing_items=[self._support_slot_label(slot["key"]).lower() for slot in support_slots],
            recommendation_targets=[self._bucket_display_label(bucket) for bucket in target_buckets if bucket != "general"],
        )

    def swap_recommendations(
        self,
        *,
        current_products: list[ProductRecommendation],
        swap_category: str,
        mode: str,
        context_note: str,
        shopper_profile: Optional[ShopperProfile] = None,
        required_segment: Optional[str] = None,
        image_analysis: Optional[ImageAnalysisSummary] = None,
        gap_analysis: Optional[GapAnalysis] = None,
        orchestration_context: Optional[dict] = None,
    ) -> tuple[list[ProductRecommendation], Optional[ProductRecommendation]]:
        if not current_products:
            return [], None

        target_segment = required_segment or self.resolve_segment_from_product_ids([item.id for item in current_products])
        if target_segment not in self.strict_segments:
            return current_products, None

        swap_bucket = self._visual_label_to_bucket(swap_category)
        if swap_bucket == "general":
            swap_bucket = self._product_category_bucket(swap_category)
        if swap_bucket == "general":
            return current_products, None
        if mode == "complete_the_look" and gap_analysis is not None:
            target_buckets = {
                self._display_label_to_bucket(value)
                for value in gap_analysis.recommendation_targets
                if self._display_label_to_bucket(value) != "general"
            }
            if target_buckets and swap_bucket not in target_buckets:
                return current_products, None

        swap_index = None
        for index, item in enumerate(current_products):
            item_bucket = self._product_category_bucket(f"{item.category} {item.title}")
            if item_bucket != swap_bucket:
                continue
            if mode == "get_inspired" and item.role == "hero":
                continue
            swap_index = index
            break

        if swap_index is None:
            return current_products, None

        current_ids = {item.id for item in current_products}
        kept_products = [item for idx, item in enumerate(current_products) if idx != swap_index]
        anchor_reference = kept_products[0] if kept_products else current_products[0]
        search_terms = self._expand_terms(
            [
                swap_category,
                context_note,
                " ".join(item.title for item in kept_products[:3]),
                " ".join(item.category for item in kept_products[:3]),
                " ".join(tag for item in kept_products[:3] for tag in (item.tags or [])[:4]),
                image_analysis.anchor_item if image_analysis else "",
                " ".join(image_analysis.palette[:3]) if image_analysis else "",
                " ".join(image_analysis.style_direction[:3]) if image_analysis else "",
                " ".join(image_analysis.silhouette_cues[:2]) if image_analysis else "",
                " ".join((orchestration_context or {}).get("style_direction") or []),
                (orchestration_context or {}).get("palette_strategy") or "",
            ]
        )
        budget_cap = self._parse_budget_cap(context_note)

        kept_catalog_rows = self.products_by_ids([item.id for item in kept_products])
        preferred_colors = []
        for product in kept_catalog_rows:
            preferred_colors.extend(self._product_color_tags(product))
        if image_analysis is not None:
            preferred_colors.extend([color.lower() for color in image_analysis.palette if color])

        query_terms = self._expand_terms(self._tokenize(context_note))
        query_bucket = self._query_bucket(query_terms)
        swap_profile = shopper_profile or ShopperProfile(segment_preference=target_segment)
        text_palette_strategy = self._text_palette_strategy(
            shopper_profile=shopper_profile,
            terms=query_terms,
            query_text=context_note,
        )
        image_palette_strategy = None
        complete_look_target_buckets: list[str] = []
        if image_analysis is not None:
            image_palette_strategy = self._palette_strategy(
                image_analysis=image_analysis,
                shopper_profile=swap_profile,
                orchestration_context=orchestration_context,
            )
            if mode == "complete_the_look":
                anchor_bucket = self._anchor_bucket_from_image_analysis(
                    image_analysis=image_analysis,
                    required_segment=target_segment,
                    orchestration_context=orchestration_context,
                )
                visible_buckets = self._visible_buckets_from_image_analysis(
                    image_analysis=image_analysis,
                    required_segment=target_segment,
                    orchestration_context=orchestration_context,
                )
                complete_look_target_buckets = self._complete_look_target_buckets(
                    anchor_bucket=anchor_bucket,
                    visible_buckets=visible_buckets,
                    required_segment=target_segment,
                    shopper_profile=swap_profile,
                    orchestration_context=orchestration_context,
                )

        scored_candidates = []
        for product in self._filter_catalog_by_segment(self._catalog(), target_segment):
            product_id = product.get("id")
            if not product_id or product_id in current_ids:
                continue

            base = self._score_product(
                product,
                search_terms,
                True,
                target_segment,
                budget_cap,
                False,
            )
            if base["bucket"] != swap_bucket:
                continue

            product_colors = self._product_color_tags(product)
            color_score = len({color for color in product_colors if color in preferred_colors}) * 2
            if preferred_colors and not color_score:
                color_score -= 1

            context_score = 0
            if image_analysis is not None:
                product_text = " ".join(
                    [
                        product.get("title", ""),
                        product.get("category", ""),
                        product.get("description", ""),
                        " ".join(product.get("tags", [])),
                    ]
                ).lower()
                for cue in image_analysis.style_direction[:3] + image_analysis.silhouette_cues[:2]:
                    if cue and str(cue).lower() in product_text:
                        context_score += 1
            else:
                context_score = self._text_outfit_context_score(
                    product=product,
                    bucket=base["bucket"],
                    query_bucket=query_bucket,
                    complementary=False,
                    shopper_profile=shopper_profile,
                    target_segment=target_segment,
                )

            palette_strategy = image_palette_strategy or text_palette_strategy
            palette_score = self._complete_look_palette_score(
                product_colors=product_colors,
                bucket=base["bucket"],
                palette_strategy=palette_strategy,
            )

            candidate = {
                **base,
                "product_colors": product_colors,
                "context_score": context_score,
                "palette_score": palette_score,
            }

            if image_analysis is not None:
                if mode == "complete_the_look":
                    if not self._valid_complete_look_candidate(
                        item=candidate,
                        required_segment=target_segment,
                        target_buckets=complete_look_target_buckets or [swap_bucket],
                        palette_strategy=palette_strategy,
                        shopper_profile=swap_profile,
                        image_analysis=image_analysis,
                    ):
                        continue
                else:
                    if not self._product_segment_compatible(candidate, target_segment):
                        continue
                    if palette_score < 0:
                        continue
                    candidate_text = self._product_text(candidate)
                    occasion = (swap_profile.occasion_context or "").lower()
                    weather = (swap_profile.weather_context or "").lower()
                    if self._violates_weather_rule(
                        text=candidate_text,
                        bucket=base["bucket"],
                        weather=weather,
                    ):
                        continue
                    if self._violates_occasion_rule(text=candidate_text, occasion=occasion):
                        continue
                    if self._violates_refined_occasion_rule(
                        text=candidate_text,
                        bucket=base["bucket"],
                        occasion=occasion,
                        shopper_profile=swap_profile,
                    ):
                        continue
            elif not self._valid_text_outfit_candidate(
                item=candidate,
                palette_strategy=palette_strategy,
                shopper_profile=shopper_profile,
                target_segment=target_segment,
            ):
                continue

            scored_candidates.append(
                {
                    **candidate,
                    "score": base["score"] + color_score + context_score + max(palette_score, 0),
                }
            )

        scored_candidates.sort(key=lambda item: (item["score"], item["match_score"]), reverse=True)
        if not scored_candidates:
            return current_products, None

        replacement_source = self._enrich_selected_products([scored_candidates[0]])[0]
        replacement = ProductRecommendation(
            id=replacement_source["id"],
            title=replacement_source["title"],
            category=replacement_source["category"],
            reason=self._build_swap_reason(
                bucket=swap_bucket,
                replacement_title=replacement_source["title"],
                anchor_title=anchor_reference.title,
                mode=mode,
            ),
            segment=target_segment,
            role=current_products[swap_index].role,
            support_slot=current_products[swap_index].support_slot,
            match_label=current_products[swap_index].match_label,
            match_badges=current_products[swap_index].match_badges,
            tags=replacement_source.get("tags", []),
            image_url=replacement_source.get("image_url"),
            price=self._price_text(replacement_source.get("price")),
            product_url=self._product_url(replacement_source),
            cart_variant_id=replacement_source.get("shopify_variant_id") or None,
            **self._inventory_fields(replacement_source),
        )

        updated = list(current_products)
        updated[swap_index] = replacement
        return updated, replacement

    def _bucket_display_label(self, bucket: str) -> str:
        return {
            "tops": "top",
            "bottoms": "bottom",
            "outerwear": "outer layer",
            "footwear": "shoes",
            "accessories": "accessories",
            "dresswear": "dress",
        }.get(bucket, bucket)

    def _product_category_bucket(self, value: str) -> str:
        bucket = self._visual_label_to_bucket(value)
        if bucket != "general":
            return bucket
        return self.catalog_intelligence_service.query_bucket(self._tokenize(value))

    def _build_swap_reason(
        self,
        *,
        bucket: str,
        replacement_title: str,
        anchor_title: str,
        mode: str,
    ) -> str:
        category_copy = {
            "footwear": "This keeps the outfit grounded while giving the finish a cleaner update.",
            "outerwear": "This keeps the same outfit direction, but sharpens the layer that frames the look.",
            "accessories": "This keeps the look aligned while changing the finishing detail instead of the whole outfit.",
            "bottoms": "This keeps the top story intact while adjusting the balance through the lower half.",
            "tops": "This keeps the rest of the outfit stable while changing the piece closest to the face.",
        }.get(bucket, "This keeps the overall direction intact while updating one part of the look.")
        if mode == "get_inspired":
            return f"{replacement_title} stays closer to the inspiration while {category_copy.lower()}"
        return f"{replacement_title} works well with {anchor_title}. {category_copy}"
