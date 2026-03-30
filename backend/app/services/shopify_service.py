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
                handle
                title
                productType
                descriptionHtml
                tags
                featuredImage {
                  url
                }
                variants(first: 1) {
                  nodes {
                    legacyResourceId
                    price
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
                first_variant = (node.get("variants", {}).get("nodes") or [{}])[0]
                collected_products.append(
                    {
                        "shopify_product_id": node.get("id"),
                        "handle": node.get("handle"),
                        "shopify_variant_id": str(first_variant.get("legacyResourceId") or ""),
                        "title": node.get("title"),
                        "category": node.get("productType"),
                        "description": node.get("descriptionHtml"),
                        "image_url": (node.get("featuredImage") or {}).get("url"),
                        "product_url": self._build_product_url(node.get("handle")),
                        "price": first_variant.get("price"),
                        "tags": self.catalog_intelligence_service.infer_tags(
                            title=node.get("title"),
                            category=node.get("productType"),
                            description=node.get("descriptionHtml"),
                            raw_tags=node.get("tags", []),
                        ),
                    }
                )

            page_info = product_connection.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break

            cursor = page_info.get("endCursor")

        return collected_products

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
              variants(first: 1) {
                nodes {
                  legacyResourceId
                }
              }
            }
          }
        }
        """

        response = self.graphql(query, {"ids": valid_ids})
        details = {}

        for node in response.get("data", {}).get("nodes", []):
            if not node or not node.get("id"):
                continue

            first_variant = (node.get("variants", {}).get("nodes") or [{}])[0]
            details[node["id"]] = {
                "handle": node.get("handle"),
                "product_url": self._build_product_url(node.get("handle")),
                "shopify_variant_id": str(first_variant.get("legacyResourceId") or ""),
            }

        return details

    def has_orders_scope(self) -> bool:
        try:
            scopes = self.fetch_access_scopes()
        except Exception:
            return False

        granted = {item.get("handle") for item in scopes if item.get("handle")}
        return "read_orders" in granted or "read_all_orders" in granted

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

    def graphql(self, query: str, variables: Optional[dict[str, Any]] = None) -> dict:
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
            raise ValueError(f"Shopify GraphQL error: {parsed['errors']}")

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
