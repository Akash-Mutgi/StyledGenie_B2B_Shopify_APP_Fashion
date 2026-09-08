import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import settings
from app.services.catalog_intelligence_service import CatalogIntelligenceService
from app.services.supabase_service import SupabaseService


class ShopifyService:
    def __init__(self) -> None:
        self.supabase_service = SupabaseService()
        self.catalog_intelligence_service = CatalogIntelligenceService()
        self._cached_token: Optional[str] = None
        self._cached_token_expires_at: float = 0

    def import_catalog(self, store_name: str) -> dict:
        shop_domain = settings.shopify_store_domain or store_name

        if not shop_domain:
            raise ValueError("Set SHOPIFY_STORE_DOMAIN in .env before importing.")

        merchant_id = self.supabase_service.sync_connected_store(
            shopify_store_domain=shop_domain,
            brand_name=store_name or "StyledGenie Merchant",
            storefront_domain=settings.shopify_storefront_domain,
        )

        if not merchant_id:
            raise ValueError("Supabase merchant setup failed. Check your Supabase keys and DEFAULT_MERCHANT_ID.")

        products = self.fetch_products()
        imported_count = 0
        if products:
            imported_count = self.supabase_service.replace_products_for_merchant(merchant_id, products)

        orders_scope_ready = self.has_orders_scope()
        orders_imported = 0
        if orders_scope_ready:
            orders = self.fetch_orders()
            orders_imported = self.supabase_service.replace_orders_for_merchant(merchant_id, orders)

        self.supabase_service.update_sync_status(
            merchant_id=merchant_id,
            shopify_store_domain=shop_domain,
            imported_count=imported_count,
            orders_imported=orders_imported,
            orders_scope_ready=orders_scope_ready,
        )

        return {
            "imported_count": imported_count,
            "orders_imported": orders_imported,
            "orders_scope_ready": orders_scope_ready,
        }

    def fetch_products(self) -> list[dict]:
        query = """
        query ProductImport($cursor: String) {
          products(first: 100, after: $cursor) {
            edges {
              cursor
              node {
                id
                legacyResourceId
                handle
                title
                productType
                descriptionHtml
                tags
                category {
                  fullName
                }
                featuredImage {
                  url
                }
                images(first: 10) {
                  nodes {
                    url
                  }
                }
                metafields(first: 50) {
                  nodes {
                    namespace
                    key
                    value
                    type
                  }
                }
                variants(first: 10) {
                  nodes {
                    legacyResourceId
                    price
                    availableForSale
                    inventoryPolicy
                    inventoryQuantity
                    sku
                    inventoryItem {
                      tracked
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """

        collected_products: list[dict] = []
        cursor = None

        while True:
            response = self.graphql(query, {"cursor": cursor})
            product_connection = response.get("data", {}).get("products", {})
            edges = product_connection.get("edges", [])

            for edge in edges:
                node = edge.get("node", {})
                first_variant = self._pick_preferred_variant((node.get("variants", {}).get("nodes") or []))
                metafield_tags, metafields = self._extract_product_metafields(node.get("metafields", {}))
                taxonomy_category = ((node.get("category") or {}).get("fullName") or "").strip()
                image_nodes = (node.get("images") or {}).get("nodes") or []
                image_urls = [
                    (image or {}).get("url")
                    for image in image_nodes
                    if (image or {}).get("url")
                ]
                featured_image = (node.get("featuredImage") or {}).get("url") or (image_urls[0] if image_urls else None)
                inferred_tags = self.catalog_intelligence_service.infer_tags(
                    title=node.get("title"),
                    category=taxonomy_category or node.get("productType"),
                    description=node.get("descriptionHtml"),
                    raw_tags=node.get("tags", []),
                )
                collected_products.append(
                    {
                        "shopify_product_id": node.get("id"),
                        "shopify_legacy_id": str(node.get("legacyResourceId") or ""),
                        "handle": node.get("handle"),
                        "shopify_variant_id": str(first_variant.get("legacyResourceId") or ""),
                        "sku": first_variant.get("sku"),
                        "available_for_sale": bool(first_variant.get("availableForSale")),
                        "inventory_quantity": first_variant.get("inventoryQuantity"),
                        "inventory_policy": first_variant.get("inventoryPolicy"),
                        "inventory_tracked": ((first_variant.get("inventoryItem") or {}).get("tracked")),
                        "title": node.get("title"),
                        "category": taxonomy_category or node.get("productType"),
                        "description": node.get("descriptionHtml"),
                        "image_url": featured_image,
                        "image_urls": image_urls,
                        "product_url": self._build_product_url(node.get("handle")),
                        "price": first_variant.get("price"),
                        "metafields": metafields,
                        "tags": self._merge_catalog_tags(inferred_tags, metafield_tags),
                    }
                )

            page_info = product_connection.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break

            cursor = page_info.get("endCursor")

        return collected_products

    def fetch_product_by_legacy_id(self, legacy_product_id: str) -> Optional[dict]:
        normalized_id = str(legacy_product_id or "").strip()
        if not normalized_id:
            return None

        product_gid = (
            normalized_id
            if normalized_id.startswith("gid://")
            else f"gid://shopify/Product/{normalized_id}"
        )

        query = """
        query ProductDetail($id: ID!) {
          product(id: $id) {
            id
            legacyResourceId
            handle
            title
            productType
            descriptionHtml
            tags
            category {
              fullName
            }
            featuredImage {
              url
            }
            images(first: 10) {
              nodes {
                url
              }
            }
            metafields(first: 50) {
              nodes {
                namespace
                key
                value
                type
              }
            }
            variants(first: 10) {
              nodes {
                legacyResourceId
                price
                availableForSale
                inventoryPolicy
                inventoryQuantity
                sku
                inventoryItem {
                  tracked
                }
              }
            }
          }
        }
        """

        response = self.graphql(query, {"id": product_gid})
        node = (response.get("data") or {}).get("product")
        if not node:
            return None

        first_variant = self._pick_preferred_variant((node.get("variants") or {}).get("nodes") or [])
        metafield_tags, metafields = self._extract_product_metafields(node.get("metafields", {}))
        taxonomy_category = ((node.get("category") or {}).get("fullName") or "").strip()
        image_nodes = (node.get("images") or {}).get("nodes") or []
        image_urls = [
            (image or {}).get("url")
            for image in image_nodes
            if (image or {}).get("url")
        ]
        featured_image = (node.get("featuredImage") or {}).get("url") or (image_urls[0] if image_urls else None)
        inferred_tags = self.catalog_intelligence_service.infer_tags(
            title=node.get("title"),
            category=taxonomy_category or node.get("productType"),
            description=node.get("descriptionHtml"),
            raw_tags=node.get("tags", []),
        )

        return {
            "shopify_product_id": node.get("id"),
            "shopify_legacy_id": str(node.get("legacyResourceId") or normalized_id),
        "handle": node.get("handle"),
        "shopify_variant_id": str(first_variant.get("legacyResourceId") or ""),
        "sku": first_variant.get("sku"),
        "available_for_sale": bool(first_variant.get("availableForSale")),
        "inventory_quantity": first_variant.get("inventoryQuantity"),
        "inventory_policy": first_variant.get("inventoryPolicy"),
        "inventory_tracked": ((first_variant.get("inventoryItem") or {}).get("tracked")),
        "title": node.get("title"),
            "category": taxonomy_category or node.get("productType"),
            "description": node.get("descriptionHtml"),
            "image_url": featured_image,
            "image_urls": image_urls,
            "product_url": self._build_product_url(node.get("handle")),
            "price": first_variant.get("price"),
            "metafields": metafields,
            "tags": self._merge_catalog_tags(inferred_tags, metafield_tags),
        }

    def fetch_product_card_details(self, shopify_product_ids: list[str]) -> dict[str, dict]:
        valid_ids = [item for item in shopify_product_ids if item]
        if not valid_ids:
            return {}

        query = """
        query ProductCardDetails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              handle
              variants(first: 10) {
                nodes {
                  legacyResourceId
                  availableForSale
                  inventoryPolicy
                  inventoryQuantity
                  sku
                  inventoryItem {
                    tracked
                  }
                }
              }
            }
          }
        }
        """

        details = {}

        for start in range(0, len(valid_ids), 100):
            batch = valid_ids[start : start + 100]
            response = self.graphql(query, {"ids": batch})

            for node in response.get("data", {}).get("nodes", []):
                if not node or not node.get("id"):
                    continue

                first_variant = self._pick_preferred_variant((node.get("variants", {}).get("nodes") or []))
                details[node["id"]] = {
                    "handle": node.get("handle"),
                    "product_url": self._build_product_url(node.get("handle")),
                    "shopify_variant_id": str(first_variant.get("legacyResourceId") or ""),
                    "sku": first_variant.get("sku"),
                    "available_for_sale": bool(first_variant.get("availableForSale")),
                    "inventory_quantity": first_variant.get("inventoryQuantity"),
                    "inventory_policy": first_variant.get("inventoryPolicy"),
                    "inventory_tracked": ((first_variant.get("inventoryItem") or {}).get("tracked")),
                }

        return details

    def has_orders_scope(self) -> bool:
        try:
            scopes = self.fetch_access_scopes()
        except Exception:
            return False

        granted = self._extract_scope_handles(scopes)
        return "read_orders" in granted or "read_all_orders" in granted

    def has_products_write_scope(self) -> bool:
        try:
            scopes = self.fetch_access_scopes()
        except Exception:
            return False

        granted = self._extract_scope_handles(scopes)
        return "write_products" in granted

    def fetch_access_scopes(self) -> list[dict]:
        access_token = self.get_access_token()
        if not access_token:
            raise ValueError("No Shopify access token available. Check your Shopify app credentials.")

        shop_domain = settings.shopify_store_domain
        if not shop_domain:
            raise ValueError("Set SHOPIFY_STORE_DOMAIN in .env before syncing.")

        url = f"https://{shop_domain}/admin/oauth/access_scopes.json"
        request = Request(
            url,
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": access_token,
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="ignore")
            raise ValueError(f"Shopify access scope request failed with HTTP {error.code}: {details}") from error
        except URLError as error:
            raise ValueError(f"Could not reach Shopify access scopes endpoint: {error.reason}") from error

        return payload.get("access_scopes", [])

    def fetch_orders(self) -> list[dict]:
        query = """
        query OrderImport($cursor: String, $query: String!) {
          orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $query) {
            edges {
              cursor
              node {
                id
                name
                createdAt
                updatedAt
                cancelledAt
                currencyCode
                currentTotalPriceSet {
                  shopMoney {
                    amount
                  }
                }
                currentSubtotalPriceSet {
                  shopMoney {
                    amount
                  }
                }
                customer {
                  email
                }
                lineItems(first: 100) {
                  nodes {
                    id
                    title
                    quantity
                    customAttributes {
                      key
                      value
                    }
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                    variant {
                      product {
                        id
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        """

        lookback_days = max(1, settings.shopify_orders_lookback_days)
        start_date = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        query_filter = f"created_at:>={start_date}"
        collected_orders: list[dict] = []
        cursor = None

        while True:
            response = self.graphql(query, {"cursor": cursor, "query": query_filter})
            order_connection = response.get("data", {}).get("orders", {})
            edges = order_connection.get("edges", [])

            for edge in edges:
                node = edge.get("node", {})
                if node.get("cancelledAt"):
                    continue

                parsed_order = self._parse_order_node(node)
                if parsed_order:
                    collected_orders.append(parsed_order)

            page_info = order_connection.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break

            cursor = page_info.get("endCursor")

        return collected_orders

    def _parse_order_node(self, node: dict[str, Any]) -> Optional[dict]:
        order_id = node.get("id")
        if not order_id:
            return None

        line_items = []
        ai_assist_modes = set()
        assisted_product_ids = set()
        ai_assisted = False

        for line_item in (node.get("lineItems") or {}).get("nodes", []):
            custom_attributes = {
                item.get("key"): item.get("value")
                for item in line_item.get("customAttributes") or []
                if item.get("key")
            }

            assisted_flag = str(custom_attributes.get("_sg_assisted", "")).lower() == "true"
            assist_mode = custom_attributes.get("_sg_flow")
            internal_product_id = custom_attributes.get("_sg_product_id")
            variant = line_item.get("variant") or {}
            product = variant.get("product") or {}

            if assisted_flag:
                ai_assisted = True
                if assist_mode:
                    ai_assist_modes.add(assist_mode)
                if internal_product_id:
                    assisted_product_ids.add(internal_product_id)

            line_items.append(
                {
                    "shopify_line_item_id": line_item.get("id"),
                    "product_id": internal_product_id or None,
                    "shopify_product_id": product.get("id"),
                    "title": line_item.get("title") or "Untitled item",
                    "quantity": int(line_item.get("quantity") or 1),
                    "unit_price": ((line_item.get("originalUnitPriceSet") or {}).get("shopMoney") or {}).get("amount"),
                    "ai_assisted": assisted_flag,
                    "ai_assist_mode": assist_mode,
                    "ai_customer_identifier": custom_attributes.get("_sg_customer_id"),
                    "custom_attributes": custom_attributes,
                }
            )

        return {
            "shopify_order_id": order_id,
            "order_name": node.get("name"),
            "currency_code": node.get("currencyCode"),
            "customer_email": ((node.get("customer") or {}).get("email") or None),
            "ordered_at": node.get("createdAt"),
            "updated_at": node.get("updatedAt"),
            "total_price": ((node.get("currentTotalPriceSet") or {}).get("shopMoney") or {}).get("amount"),
            "subtotal_price": ((node.get("currentSubtotalPriceSet") or {}).get("shopMoney") or {}).get("amount"),
            "ai_assisted": ai_assisted,
            "ai_assist_modes": sorted(ai_assist_modes),
            "assisted_product_ids": sorted(assisted_product_ids),
            "line_items": line_items,
        }

    def _build_product_url(self, handle: Optional[str]) -> Optional[str]:
        storefront_domain = settings.shopify_storefront_domain or settings.shopify_store_domain
        if not handle or not storefront_domain:
            return None

        normalized_domain = storefront_domain.replace("https://", "").replace("http://", "").strip("/")
        return f"https://{normalized_domain}/products/{handle}"

    def lookup_order_status(self, order_reference: str, email: str) -> Optional[dict]:
        order_details = self.lookup_order_support_details(order_reference, email)
        if not order_details:
            return None

        return {
            "order_name": order_details.get("order_name") or order_reference,
            "fulfillment_status": order_details.get("fulfillment_status") or "Status unavailable",
            "financial_status": order_details.get("financial_status") or "Status unavailable",
            "status_page_url": order_details.get("status_page_url"),
            "updated_at": order_details.get("updated_at"),
            "ordered_at": order_details.get("ordered_at"),
        }

    def lookup_order_support_details(self, order_reference: str, email: str) -> Optional[dict]:
        normalized_reference = str(order_reference or "").strip()
        normalized_email = str(email or "").strip().lower()
        if not normalized_reference or not normalized_email:
            return None

        if self.has_orders_scope():
            try:
                return self._lookup_order_support_details_live(normalized_reference, normalized_email)
            except Exception:
                pass

        stored_order = self.supabase_service.find_order_by_reference(normalized_reference, normalized_email)
        if not stored_order:
            return None

        return {
            "source": "snapshot",
            "order_name": stored_order.get("order_name") or normalized_reference,
            "customer_email": stored_order.get("customer_email") or normalized_email,
            "fulfillment_status": "Status unavailable in stored snapshot",
            "financial_status": "Captured in synced order data",
            "status_page_url": None,
            "updated_at": stored_order.get("updated_at") or stored_order.get("ordered_at"),
            "ordered_at": stored_order.get("ordered_at"),
            "total_price": stored_order.get("total_price"),
            "subtotal_price": stored_order.get("subtotal_price"),
            "currency_code": stored_order.get("currency_code"),
            "line_items": [
                self._normalize_support_line_item(item)
                for item in stored_order.get("line_items") or []
            ],
        }

    def assess_return_eligibility(self, order_details: dict, window_days: int = 30) -> dict:
        fulfillment_status = str(order_details.get("fulfillment_status") or "").strip()
        financial_status = str(order_details.get("financial_status") or "").strip()
        ordered_at = self._parse_iso_datetime(order_details.get("ordered_at"))

        if any(token in financial_status.lower() for token in {"cancel", "void"}):
            return {
                "eligible": False,
                "reason": "This order looks cancelled, so I can’t start a return or exchange from it.",
                "window_days": window_days,
                "days_since_order": None,
            }

        days_since_order = None
        if ordered_at is not None:
            days_since_order = max(
                0,
                int((datetime.now(timezone.utc) - ordered_at).total_seconds() // 86400),
            )
            if days_since_order > window_days:
                return {
                    "eligible": False,
                    "reason": f"This order is outside the usual {window_days}-day return window.",
                    "window_days": window_days,
                    "days_since_order": days_since_order,
                }

        return {
            "eligible": True,
            "reason": (
                f"This order appears to be within the {window_days}-day return window."
                if days_since_order is not None
                else "I found the order and it looks suitable for a return or exchange review."
            ),
            "window_days": window_days,
            "days_since_order": days_since_order,
            "fulfillment_status": fulfillment_status,
            "financial_status": financial_status,
        }

    def _lookup_order_support_details_live(self, order_reference: str, email: str) -> Optional[dict]:
        reference = order_reference if order_reference.startswith("#") else f"#{order_reference}"
        query = """
        query OrderTrackingLookup($query: String!) {
          orders(first: 1, sortKey: PROCESSED_AT, reverse: true, query: $query) {
            nodes {
              id
              name
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              statusPageUrl
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                email
              }
              lineItems(first: 20) {
                nodes {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    title
                    selectedOptions {
                      name
                      value
                    }
                    product {
                      id
                      title
                      productType
                      featuredImage {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
        """

        search_query = f'name:{reference} email:"{email}"'
        response = self.graphql(query, {"query": search_query})
        nodes = (response.get("data") or {}).get("orders", {}).get("nodes", []) or []
        if not nodes:
            return None

        match = nodes[0]
        customer_email = ((match.get("customer") or {}).get("email") or "").strip().lower()
        if customer_email and customer_email != email:
            return None

        return {
            "source": "live",
            "order_name": match.get("name") or reference,
            "customer_email": customer_email or email,
            "fulfillment_status": match.get("displayFulfillmentStatus") or "Status unavailable",
            "financial_status": match.get("displayFinancialStatus") or "Status unavailable",
            "status_page_url": match.get("statusPageUrl"),
            "updated_at": match.get("updatedAt"),
            "ordered_at": match.get("createdAt"),
            "total_price": (((match.get("currentTotalPriceSet") or {}).get("shopMoney") or {}).get("amount")),
            "currency_code": (((match.get("currentTotalPriceSet") or {}).get("shopMoney") or {}).get("currencyCode")),
            "line_items": [
                self._normalize_support_line_item(item)
                for item in ((match.get("lineItems") or {}).get("nodes") or [])
            ],
        }

    def _normalize_support_line_item(self, line_item: dict[str, Any]) -> dict[str, Any]:
        variant = line_item.get("variant") or {}
        product = variant.get("product") or {}
        return {
            "title": line_item.get("title") or product.get("title") or "Untitled item",
            "quantity": int(line_item.get("quantity") or 1),
            "unit_price": ((line_item.get("originalUnitPriceSet") or {}).get("shopMoney") or {}).get("amount"),
            "image_url": ((product.get("featuredImage") or {}).get("url")),
            "product_type": product.get("productType"),
            "variant_title": variant.get("title"),
            "selected_options": variant.get("selectedOptions") or [],
        }

    def _pick_preferred_variant(self, variants: list[dict[str, Any]]) -> dict[str, Any]:
        if not variants:
            return {}

        for variant in variants:
            if variant and variant.get("availableForSale"):
                return variant

        return variants[0] or {}

    def _merge_catalog_tags(self, inferred_tags: list[str], metafield_tags: list[str]) -> list[str]:
        merged: list[str] = []
        for tag in [*inferred_tags, *metafield_tags]:
            normalized = str(tag or "").strip().lower()
            if not normalized or normalized in merged:
                continue
            merged.append(normalized)
        return merged

    def _extract_product_metafields(self, metafield_connection: dict[str, Any]) -> tuple[list[str], dict[str, list[str]]]:
        tags: list[str] = []
        attributes: dict[str, list[str]] = {}

        for node in (metafield_connection or {}).get("nodes") or []:
            if not node:
                continue

            namespace = str(node.get("namespace") or "").strip().lower()
            key = str(node.get("key") or "").strip().lower()
            if not key:
                continue

            values = self._normalize_metafield_values(node.get("value"), node.get("type"))
            if not values:
                continue

            label = key.replace("-", " ").replace("_", " ").strip()
            attributes[label] = values
            for value in values:
                normalized_value = str(value).strip().lower()
                if normalized_value and normalized_value not in tags:
                    tags.append(normalized_value)
                if namespace == "shopify":
                    prefixed = f"{label}:{normalized_value}"
                    if prefixed not in tags:
                        tags.append(prefixed)

        return tags, attributes

    def _normalize_metafield_values(self, raw_value: Any, field_type: Any) -> list[str]:
        if raw_value is None:
            return []

        value = str(raw_value).strip()
        if not value:
            return []

        if value.startswith("[") or value.startswith("{"):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = value
        else:
            parsed = value

        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]

        if isinstance(parsed, dict):
            extracted: list[str] = []
            for item in parsed.values():
                normalized = str(item).strip()
                if normalized:
                    extracted.append(normalized)
            return extracted

        if isinstance(parsed, str) and parsed.startswith("gid://shopify/"):
            return [parsed.rsplit("/", 1)[-1].replace("-", " ")]

        return [str(parsed).strip()]

    def _parse_iso_datetime(self, value: Any) -> Optional[datetime]:
        if not value:
            return None

        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None

    def update_product_description(self, shopify_product_id: str, description_html: str) -> dict:
        if not shopify_product_id or not description_html.strip():
            raise ValueError("A product ID and description are required.")

        try:
            granted_scopes = self._extract_scope_handles(self.fetch_access_scopes())
        except Exception as error:
            raise ValueError(
                "Could not verify Shopify product write access. Confirm the app is installed correctly and try again."
            ) from error

        if "write_products" not in granted_scopes:
            raise ValueError(self._build_missing_write_products_message(granted_scopes))

        mutation = """
        mutation UpdateProductDescription($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product {
              id
              title
              descriptionHtml
            }
            userErrors {
              field
              message
            }
          }
        }
        """

        response = self.graphql(
            mutation,
            {
                "product": {
                    "id": shopify_product_id,
                    "descriptionHtml": description_html,
                }
            },
            operation_name="productUpdate",
        )
        payload = ((response.get("data") or {}).get("productUpdate") or {})
        user_errors = payload.get("userErrors") or []
        if user_errors:
            first_error = user_errors[0]
            raise ValueError(first_error.get("message") or "Shopify rejected the description update.")

        product = payload.get("product") or {}
        if not product.get("id"):
            raise ValueError("Shopify did not confirm the product update.")

        return product

    def graphql(
        self,
        query: str,
        variables: Optional[dict[str, Any]] = None,
        operation_name: Optional[str] = None,
    ) -> dict:
        access_token = self.get_access_token()
        if not access_token:
            raise ValueError("No Shopify access token available. Check your Shopify app credentials.")

        shop_domain = settings.shopify_store_domain
        if not shop_domain:
            raise ValueError("Set SHOPIFY_STORE_DOMAIN in .env before importing.")

        url = f"https://{shop_domain}/admin/api/{settings.shopify_api_version}/graphql.json"
        payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
        request = Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": access_token,
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = response.read().decode("utf-8")
                parsed = json.loads(body)
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="ignore")
            raise ValueError(f"Shopify API HTTP error {error.code}: {details}") from error
        except URLError as error:
            raise ValueError(f"Could not reach Shopify: {error.reason}") from error

        if parsed.get("errors"):
            raise ValueError(self._format_graphql_error(parsed["errors"], operation_name))

        return parsed

    def get_access_token(self) -> Optional[str]:
        if settings.shopify_admin_access_token and settings.shopify_admin_access_token != "your_shopify_admin_access_token_here":
            return settings.shopify_admin_access_token

        if self._cached_token and time.time() < self._cached_token_expires_at - 60:
            return self._cached_token

        return self.refresh_client_credentials_token()

    def refresh_client_credentials_token(self) -> Optional[str]:
        shop_domain = settings.shopify_store_domain
        client_id = settings.shopify_client_id
        client_secret = settings.shopify_client_secret

        if not shop_domain or not client_id or not client_secret:
            return None

        url = f"https://{shop_domain}/admin/oauth/access_token"
        body = urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }
        ).encode("utf-8")
        request = Request(
            url,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="ignore")
            raise ValueError(self._build_token_error_message(error.code, details)) from error
        except URLError as error:
            raise ValueError(f"Could not request Shopify token: {error.reason}") from error

        access_token = payload.get("access_token")
        expires_in = payload.get("expires_in", 0)

        if not access_token:
            raise ValueError("Shopify did not return an access token.")

        self._cached_token = access_token
        self._cached_token_expires_at = time.time() + int(expires_in or 0)
        return access_token

    def _build_token_error_message(self, status_code: int, details: str) -> str:
        compact_details = " ".join((details or "").split())
        app_name = settings.shopify_app_name or "your Shopify app"
        shop_domain = settings.shopify_store_domain or "your Shopify store"

        if "app_not_installed" in compact_details:
            return (
                f'{app_name} is not installed on {shop_domain}. '
                "Open the app in Shopify Dev Dashboard, release the current version, then install or update it on this store and try sync again."
            )

        if "shop_not_permitted" in compact_details:
            return (
                f'{app_name} is not permitted to use client-credentials access on {shop_domain}. '
                "Make sure the app was created in the correct merchant organization or use a valid admin access token for this store."
            )

        return f"Shopify token request failed with HTTP {status_code}: {details}"

    def _extract_scope_handles(self, scopes: list[dict]) -> set[str]:
        return {item.get("handle") for item in scopes if item.get("handle")}

    def _build_missing_write_products_message(self, granted_scopes: set[str]) -> str:
        granted_list = ", ".join(sorted(granted_scopes)) if granted_scopes else "none"
        return (
            "Shopify blocked the product description update because the app does not have the `write_products` "
            f"scope on this store. Current installed scopes: {granted_list}. "
            "Fix this in Shopify by adding `write_products` to the app version, releasing the version, and then "
            "updating or reinstalling the app on this store so the new scope is approved. The Shopify staff user "
            "performing the install must also have permission to edit products."
        )

    def _format_graphql_error(self, errors: list[dict], operation_name: Optional[str]) -> str:
        if operation_name == "productUpdate":
            for error in errors:
                extensions = error.get("extensions") or {}
                required_access = str(extensions.get("requiredAccess") or "")
                code = str(extensions.get("code") or "")
                message = str(error.get("message") or "")
                combined = " ".join([required_access, code, message]).lower()
                if "write_products" in combined or "access_denied" in combined:
                    try:
                        granted_scopes = self._extract_scope_handles(self.fetch_access_scopes())
                    except Exception:
                        granted_scopes = set()
                    return self._build_missing_write_products_message(granted_scopes)

        return f"Shopify GraphQL error: {errors}"
