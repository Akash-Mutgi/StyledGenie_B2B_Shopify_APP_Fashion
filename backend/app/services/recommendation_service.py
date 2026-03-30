import re
from typing import Optional

from app.config import settings
from app.models.schemas import ProductRecommendation
from app.services.catalog_intelligence_service import CatalogIntelligenceService
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService


class RecommendationService:
    def __init__(self) -> None:
        self.supabase_service = SupabaseService()
        self.catalog_intelligence_service = CatalogIntelligenceService()
        self.shopify_service = ShopifyService()

    def _catalog(self) -> list[dict]:
        return self.supabase_service.fetch_catalog_products()

    def _tokenize(self, value: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", (value or "").lower()))

    def _expand_terms(self, terms: list[str]) -> set[str]:
        return self.catalog_intelligence_service.expand_terms(terms)

    def _product_bucket(self, product: dict) -> str:
        return self.catalog_intelligence_service.product_bucket(product)

    def _query_bucket(self, terms: set[str]) -> str:
        return self.catalog_intelligence_service.query_bucket(terms)

    def _score_product(self, product: dict, terms: set[str], complementary: bool) -> dict:
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

        if complementary:
            if bucket != query_bucket:
                style_bonus += 2
            else:
                style_bonus -= 1
        else:
            if bucket != "general":
                style_bonus += 1

        return {
            **product,
            "score": match_score + style_bonus,
            "match_score": match_score,
            "style_bonus": style_bonus,
            "matched_terms": sorted(matched_terms),
            "bucket": bucket,
        }

    def _select_products(
        self,
        scored_products: list[dict],
        limit: int,
        complementary: bool,
        query_bucket: str,
    ) -> list[dict]:
        selected = []
        used_buckets = set()

        primary_pool = scored_products
        if complementary and query_bucket != "general":
            compatible_buckets = set(self.catalog_intelligence_service.compatible_buckets(query_bucket))
            preferred = [item for item in scored_products if item["bucket"] in compatible_buckets]
            non_matching = [item for item in preferred if item["bucket"] != query_bucket]
            matching = [item for item in scored_products if item["bucket"] == query_bucket]
            remainder = [item for item in scored_products if item not in preferred and item not in matching]
            primary_pool = non_matching + matching + remainder

        for item in primary_pool:
            if len(selected) >= limit:
                break

            if complementary:
                if item["bucket"] not in used_buckets or item["bucket"] == "general":
                    selected.append(item)
                    used_buckets.add(item["bucket"])
            else:
                if item["bucket"] not in used_buckets or item["score"] > 4:
                    selected.append(item)
                    used_buckets.add(item["bucket"])

        if len(selected) < limit:
            for item in scored_products:
                if len(selected) >= limit:
                    break
                if item not in selected:
                    selected.append(item)

        return selected[:limit]

    def recommend_products(
        self,
        terms: list[str],
        complementary: bool = False,
        limit: int = 3,
    ) -> list[ProductRecommendation]:
        catalog = self._catalog()
        normalized_terms = self._expand_terms(terms)
        query_bucket = self._query_bucket(normalized_terms)

        scored_products = [self._score_product(product, normalized_terms, complementary) for product in catalog]
        scored_products.sort(key=lambda item: item["score"], reverse=True)

        if not scored_products:
            return []

        selected = self._select_products(scored_products, limit, complementary, query_bucket)
        selected = self._enrich_selected_products(selected)
        reason_prefix = "Complements the requested look" if complementary else "Matches the shopper request"

        return [
            ProductRecommendation(
                id=item["id"],
                title=item["title"],
                category=item["category"],
                reason=self._build_reason(item, reason_prefix),
                tags=item.get("tags", []),
                image_url=item.get("image_url"),
                price=self._price_text(item.get("price")),
                product_url=self._product_url(item),
                cart_variant_id=item.get("shopify_variant_id") or None,
            )
            for item in selected
        ]

    def _build_reason(self, item: dict, reason_prefix: str) -> str:
        clean_terms = self.catalog_intelligence_service.clean_match_terms(set(item["matched_terms"]))
        if clean_terms:
            return f"{reason_prefix} through {', '.join(clean_terms[:3])}."

        return f"{reason_prefix} as a versatile option from your live catalog."

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

    def _enrich_selected_products(self, selected: list[dict]) -> list[dict]:
        missing_ids = [
            item.get("shopify_product_id")
            for item in selected
            if item.get("shopify_product_id")
            and (not item.get("handle") or not item.get("shopify_variant_id") or not item.get("product_url"))
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
                }
            )

        return enriched
