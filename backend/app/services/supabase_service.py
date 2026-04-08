import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.models.schemas import (
    AnalyticsOverview,
    CatalogIntelligence,
    CategoryMetric,
    ChatbotCustomization,
    CustomerCareItem,
    DataQualitySnapshot,
    DashboardActivityItem,
    DashboardProductItem,
    FAQItem,
    KnowledgeBaseItem,
    LookManagementItem,
    MerchantDashboardSnapshot,
    MerchantStoreProfile,
    MerchantWorkspaceSnapshot,
    JourneyMetric,
    ShopperFeedbackSummary,
)

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - optional dependency for early MVP stages
    create_client = None


logger = logging.getLogger(__name__)

RESERVED_KNOWLEDGE_TYPES = {
    "merchant_profile",
    "chatbot_customization",
    "catalog_intelligence",
    "sync_status",
}


class SupabaseService:
    def __init__(self) -> None:
        self._client = None

    def get_default_merchant_id(self) -> Optional[str]:
        client = self.get_client()
        shopify_store_domain = settings.shopify_store_domain

        if client is not None and shopify_store_domain:
            try:
                response = (
                    client.table("merchants")
                    .select("id")
                    .eq("shopify_store_domain", shopify_store_domain)
                    .limit(1)
                    .execute()
                )
                if response.data:
                    return response.data[0]["id"]
            except Exception:
                pass

        return settings.default_merchant_id

    def get_client(self):
        api_key = settings.supabase_service_role_key or settings.supabase_anon_key

        if not settings.supabase_url or not api_key or create_client is None:
            return None

        if self._client is None:
            try:
                self._client = create_client(settings.supabase_url, api_key)
            except Exception as error:
                logger.warning("Supabase client initialization failed. %s", error)
                return None

        return self._client

    def _select_in_batches(
        self,
        table_name: str,
        select_columns: str,
        column_name: str,
        values: list[str],
        batch_size: int = 200,
    ) -> list[dict]:
        client = self.get_client()

        if client is None or not values:
            return []

        rows: list[dict] = []
        for start in range(0, len(values), batch_size):
            batch = values[start : start + batch_size]
            if not batch:
                continue

            response = (
                client.table(table_name)
                .select(select_columns)
                .in_(column_name, batch)
                .execute()
            )
            rows.extend(response.data or [])

        return rows

    def _default_storefront_domain(self) -> Optional[str]:
        return settings.shopify_storefront_domain or settings.shopify_store_domain

    def _default_profile(
        self,
        brand_name: str = "StyledGenie",
        connected_store_domain: Optional[str] = None,
        storefront_domain: Optional[str] = None,
    ) -> MerchantStoreProfile:
        return MerchantStoreProfile(
            brand_name=brand_name or "StyledGenie",
            connected_store_domain=connected_store_domain or settings.shopify_store_domain,
            storefront_domain=storefront_domain or self._default_storefront_domain(),
            industry="Fashion ecommerce",
            brand_summary=(
                "Use this dashboard as the intelligence brain for your storefront, catalog, and customer experience."
            ),
            merchandising_goal=(
                "Increase conversion with personalized styling recommendations and faster customer support."
            ),
        )

    def _parse_json_body(self, raw_body: Optional[str]) -> dict:
        if not raw_body:
            return {}

        try:
            parsed = json.loads(raw_body)
        except Exception:
            return {}

        if isinstance(parsed, dict):
            return parsed

        return {}

    def _merge_model(self, model_class, defaults, payload: Optional[dict]):
        try:
            merged = defaults.dict()
            if isinstance(payload, dict):
                merged.update(payload)
            return model_class(**merged)
        except Exception:
            return defaults

    def _upsert_config_entry(
        self,
        entry_type: str,
        title: str,
        payload: dict,
        merchant_id: Optional[str] = None,
    ) -> bool:
        client = self.get_client()
        resolved_merchant_id = merchant_id or self.get_default_merchant_id()

        if client is None or not resolved_merchant_id:
            return False

        try:
            existing = (
                client.table("knowledge_base_entries")
                .select("id")
                .eq("merchant_id", resolved_merchant_id)
                .eq("entry_type", entry_type)
                .limit(1)
                .execute()
            )

            body = json.dumps(payload, ensure_ascii=True)

            if existing.data:
                (
                    client.table("knowledge_base_entries")
                    .update({"title": title, "body": body})
                    .eq("id", existing.data[0]["id"])
                    .execute()
                )
            else:
                (
                    client.table("knowledge_base_entries")
                    .insert(
                        {
                            "merchant_id": resolved_merchant_id,
                            "title": title,
                            "body": body,
                            "entry_type": entry_type,
                        }
                    )
                    .execute()
                )

            return True
        except Exception:
            return False

    def sync_connected_store(
        self,
        shopify_store_domain: str,
        brand_name: str = "StyledGenie Merchant",
        storefront_domain: Optional[str] = None,
    ) -> Optional[str]:
        client = self.get_client()
        default_merchant_id = self.get_default_merchant_id()
        resolved_storefront_domain = storefront_domain or self._default_storefront_domain()

        if client is None or not shopify_store_domain:
            return None

        if not default_merchant_id:
            return self.ensure_merchant(shopify_store_domain=shopify_store_domain, brand_name=brand_name)

        try:
            (
                client.table("merchants")
                .update(
                    {
                        "brand_name": brand_name,
                        "shopify_store_domain": shopify_store_domain,
                    }
                )
                .eq("id", default_merchant_id)
                .execute()
            )
        except Exception:
            return self.ensure_merchant(shopify_store_domain=shopify_store_domain, brand_name=brand_name)

        try:
            knowledge_response = (
                client.table("knowledge_base_entries")
                .select("body")
                .eq("merchant_id", default_merchant_id)
                .eq("entry_type", "merchant_profile")
                .limit(1)
                .execute()
            )
            existing_profile_payload = self._parse_json_body(
                ((knowledge_response.data or [{}])[0]).get("body")
            )
        except Exception:
            existing_profile_payload = {}

        synced_profile = self._merge_model(
            MerchantStoreProfile,
            self._default_profile(
                brand_name=brand_name,
                connected_store_domain=shopify_store_domain,
                storefront_domain=resolved_storefront_domain,
            ),
            existing_profile_payload,
        )
        synced_profile.brand_name = brand_name or synced_profile.brand_name
        synced_profile.connected_store_domain = shopify_store_domain
        synced_profile.storefront_domain = resolved_storefront_domain

        self._upsert_config_entry(
            "merchant_profile",
            "Merchant profile settings",
            synced_profile.dict(),
            merchant_id=default_merchant_id,
        )

        return default_merchant_id

    def update_sync_status(
        self,
        merchant_id: Optional[str],
        shopify_store_domain: str,
        imported_count: int,
        orders_imported: int,
        orders_scope_ready: bool,
    ) -> bool:
        if not merchant_id:
            return False

        timestamp = datetime.now(timezone.utc).isoformat()
        payload = {
            "shopify_store_domain": shopify_store_domain,
            "products_imported": int(imported_count or 0),
            "orders_imported": int(orders_imported or 0),
            "orders_scope_ready": bool(orders_scope_ready),
            "catalog_synced_at": timestamp,
            "orders_synced_at": timestamp if orders_scope_ready else None,
        }

        return self._upsert_config_entry(
            "sync_status",
            "Connected store sync status",
            payload,
            merchant_id=merchant_id,
        )

    def fetch_faqs(self) -> list[FAQItem]:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return []

        try:
            response = (
                client.table("faqs")
                .select("question, answer")
                .eq("merchant_id", merchant_id)
                .order("created_at")
                .execute()
            )
            return [
                FAQItem(question=item["question"], answer=item["answer"])
                for item in (response.data or [])
                if item.get("question") and item.get("answer")
            ]
        except Exception:
            return []

    def fetch_catalog_products(self) -> list[dict]:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return []

        try:
            product_response = (
                client.table("products")
                .select(
                    "id, shopify_product_id, title, category, description, image_url, price, handle, "
                    "shopify_variant_id, product_url"
                )
                .eq("merchant_id", merchant_id)
                .order("created_at")
                .execute()
            )
        except Exception:
            try:
                product_response = (
                    client.table("products")
                    .select("id, shopify_product_id, title, category, description, image_url, price")
                    .eq("merchant_id", merchant_id)
                    .order("created_at")
                    .execute()
                )
            except Exception:
                return []

        products = product_response.data or []
        if not products:
            return []

        product_ids = [item["id"] for item in products if item.get("id")]
        tag_map = {}

        if product_ids:
            try:
                for row in self._select_in_batches(
                    "product_tags",
                    "product_id, tag",
                    "product_id",
                    product_ids,
                ):
                    product_id = row.get("product_id")
                    tag = row.get("tag")
                    if not product_id or not tag:
                        continue
                    tag_map.setdefault(product_id, []).append(tag)
            except Exception:
                tag_map = {}

        normalized_products = []
        for item in products:
            normalized_products.append(
                {
                    "id": item.get("id"),
                    "shopify_product_id": item.get("shopify_product_id"),
                    "title": item.get("title") or "Untitled product",
                    "category": item.get("category") or "General",
                    "description": item.get("description") or "",
                    "image_url": item.get("image_url"),
                    "price": item.get("price"),
                    "handle": item.get("handle"),
                    "shopify_variant_id": item.get("shopify_variant_id"),
                    "product_url": item.get("product_url"),
                    "tags": tag_map.get(item.get("id"), []),
                }
            )

        return normalized_products

    def fetch_catalog_product(self, product_id: str) -> Optional[dict]:
        if not product_id:
            return None

        for product in self.fetch_catalog_products():
            if product.get("id") == product_id:
                return product

        return None

    def fetch_workspace_snapshot(self) -> MerchantWorkspaceSnapshot:
        overview = self.fetch_dashboard_snapshot()
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        profile = self._default_profile(
            brand_name=overview.store_name,
            connected_store_domain=overview.store_domain,
            storefront_domain=overview.storefront_domain,
        )
        chatbot_customization = ChatbotCustomization()
        catalog_intelligence = CatalogIntelligence()

        if client is None or not merchant_id:
            return MerchantWorkspaceSnapshot(
                overview=overview,
                profile=profile,
                chatbot_customization=chatbot_customization,
                catalog_intelligence=catalog_intelligence,
                looks=[],
                customer_care=[],
                knowledge_base=[],
            )

        try:
            merchant_response = (
                client.table("merchants")
                .select("brand_name, shopify_store_domain")
                .eq("id", merchant_id)
                .limit(1)
                .execute()
            )
            merchant_row = (merchant_response.data or [{}])[0]

            knowledge_rows = (
                client.table("knowledge_base_entries")
                .select("id, title, body, entry_type")
                .eq("merchant_id", merchant_id)
                .order("created_at")
                .execute()
            ).data or []

            reserved_rows = {
                row.get("entry_type"): row for row in knowledge_rows if row.get("entry_type") in RESERVED_KNOWLEDGE_TYPES
            }
            custom_knowledge_rows = [
                row for row in knowledge_rows if row.get("entry_type") not in RESERVED_KNOWLEDGE_TYPES
            ]

            profile_defaults = self._default_profile(
                brand_name=merchant_row.get("brand_name") or overview.store_name,
                connected_store_domain=merchant_row.get("shopify_store_domain") or overview.store_domain,
                storefront_domain=overview.storefront_domain,
            )
            profile = self._merge_model(
                MerchantStoreProfile,
                profile_defaults,
                self._parse_json_body((reserved_rows.get("merchant_profile") or {}).get("body")),
            )
            chatbot_customization = self._merge_model(
                ChatbotCustomization,
                ChatbotCustomization(),
                self._parse_json_body((reserved_rows.get("chatbot_customization") or {}).get("body")),
            )
            catalog_intelligence = self._merge_model(
                CatalogIntelligence,
                CatalogIntelligence(),
                self._parse_json_body((reserved_rows.get("catalog_intelligence") or {}).get("body")),
            )

            look_rows = (
                client.table("curated_looks")
                .select("id, title, occasion, style_notes")
                .eq("merchant_id", merchant_id)
                .order("created_at")
                .execute()
            ).data or []

            faq_rows = (
                client.table("faqs")
                .select("id, question, answer, category")
                .eq("merchant_id", merchant_id)
                .order("created_at")
                .execute()
            ).data or []

            return MerchantWorkspaceSnapshot(
                overview=overview,
                profile=profile,
                chatbot_customization=chatbot_customization,
                catalog_intelligence=catalog_intelligence,
                looks=[
                    LookManagementItem(
                        id=row.get("id"),
                        title=row.get("title") or "Untitled look",
                        occasion=row.get("occasion"),
                        style_notes=row.get("style_notes"),
                    )
                    for row in look_rows
                ],
                customer_care=[
                    CustomerCareItem(
                        id=row.get("id"),
                        question=row.get("question") or "",
                        answer=row.get("answer") or "",
                        category=row.get("category"),
                    )
                    for row in faq_rows
                    if row.get("question") and row.get("answer")
                ],
                knowledge_base=[
                    KnowledgeBaseItem(
                        id=row.get("id"),
                        title=row.get("title") or "Untitled knowledge entry",
                        body=row.get("body") or "",
                        entry_type=row.get("entry_type") or "brand_guideline",
                    )
                    for row in custom_knowledge_rows
                ],
            )
        except Exception as error:
            logger.warning("Merchant workspace load failed. %s", error)
            return MerchantWorkspaceSnapshot(
                overview=overview,
                profile=profile,
                chatbot_customization=chatbot_customization,
                catalog_intelligence=catalog_intelligence,
                looks=[],
                customer_care=[],
                knowledge_base=[],
            )

    def update_merchant_profile(self, profile: MerchantStoreProfile) -> bool:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return False

        try:
            (
                client.table("merchants")
                .update(
                    {
                        "brand_name": profile.brand_name,
                        "shopify_store_domain": profile.connected_store_domain or settings.shopify_store_domain,
                    }
                )
                .eq("id", merchant_id)
                .execute()
            )
        except Exception:
            return False

        return self._upsert_config_entry(
            "merchant_profile",
            "Merchant profile settings",
            profile.dict(),
        )

    def update_chatbot_customization(self, customization: ChatbotCustomization) -> bool:
        return self._upsert_config_entry(
            "chatbot_customization",
            "Chatbot customization",
            customization.dict(),
        )

    def update_catalog_intelligence(self, intelligence: CatalogIntelligence) -> bool:
        return self._upsert_config_entry(
            "catalog_intelligence",
            "Catalog intelligence rules",
            intelligence.dict(),
        )

    def replace_curated_looks(self, looks: list[LookManagementItem]) -> bool:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return False

        try:
            client.table("curated_looks").delete().eq("merchant_id", merchant_id).execute()

            payload = [
                {
                    "merchant_id": merchant_id,
                    "title": item.title,
                    "occasion": item.occasion,
                    "style_notes": item.style_notes,
                }
                for item in looks
                if item.title.strip()
            ]

            if payload:
                client.table("curated_looks").insert(payload).execute()

            return True
        except Exception:
            return False

    def replace_customer_care_faqs(self, faq_items: list[CustomerCareItem]) -> bool:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return False

        try:
            client.table("faqs").delete().eq("merchant_id", merchant_id).execute()

            payload = [
                {
                    "merchant_id": merchant_id,
                    "question": item.question,
                    "answer": item.answer,
                    "category": item.category,
                }
                for item in faq_items
                if item.question.strip() and item.answer.strip()
            ]

            if payload:
                client.table("faqs").insert(payload).execute()

            return True
        except Exception:
            return False

    def replace_knowledge_base_entries(self, entries: list[KnowledgeBaseItem]) -> bool:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return False

        try:
            existing = (
                client.table("knowledge_base_entries")
                .select("id, entry_type")
                .eq("merchant_id", merchant_id)
                .execute()
            )
            custom_rows = [
                row for row in (existing.data or []) if row.get("entry_type") not in RESERVED_KNOWLEDGE_TYPES
            ]

            for row in custom_rows:
                client.table("knowledge_base_entries").delete().eq("id", row["id"]).execute()

            payload = [
                {
                    "merchant_id": merchant_id,
                    "title": item.title,
                    "body": item.body,
                    "entry_type": item.entry_type,
                }
                for item in entries
                if item.title.strip() and item.body.strip()
            ]

            if payload:
                client.table("knowledge_base_entries").insert(payload).execute()

            return True
        except Exception:
            return False

    def ensure_merchant(self, shopify_store_domain: str, brand_name: str = "StyledGenie Merchant") -> Optional[str]:
        client = self.get_client()

        if client is None or not shopify_store_domain:
            return None

        try:
            existing = (
                client.table("merchants")
                .select("id")
                .eq("shopify_store_domain", shopify_store_domain)
                .limit(1)
                .execute()
            )

            if existing.data:
                return existing.data[0]["id"]

            created = (
                client.table("merchants")
                .insert(
                    {
                        "shopify_store_domain": shopify_store_domain,
                        "brand_name": brand_name,
                    }
                )
                .execute()
            )

            if created.data:
                return created.data[0]["id"]

            return None
        except Exception:
            return None

    def replace_products_for_merchant(self, merchant_id: str, products: list[dict]) -> int:
        client = self.get_client()

        if client is None or not merchant_id:
            return 0

        try:
            client.table("products").delete().eq("merchant_id", merchant_id).execute()
        except Exception:
            return 0

        imported_count = 0

        for product in products:
            try:
                created = (
                    client.table("products")
                    .insert(
                        {
                            "merchant_id": merchant_id,
                            "shopify_product_id": product["shopify_product_id"],
                            "handle": product.get("handle"),
                            "shopify_variant_id": product.get("shopify_variant_id"),
                            "title": product["title"],
                            "category": product.get("category"),
                            "description": product.get("description"),
                            "image_url": product.get("image_url"),
                            "product_url": product.get("product_url"),
                            "price": product.get("price"),
                        }
                    )
                    .execute()
                )
            except Exception:
                try:
                    created = (
                        client.table("products")
                        .insert(
                            {
                                "merchant_id": merchant_id,
                                "shopify_product_id": product["shopify_product_id"],
                                "title": product["title"],
                                "category": product.get("category"),
                                "description": product.get("description"),
                                "image_url": product.get("image_url"),
                                "price": product.get("price"),
                            }
                        )
                        .execute()
                    )
                except Exception:
                    continue

            if not created.data:
                continue

            imported_count += 1
            product_id = created.data[0]["id"]
            tags = product.get("tags", [])

            if tags:
                try:
                    tag_rows = [{"product_id": product_id, "tag": tag} for tag in tags]
                    client.table("product_tags").insert(tag_rows).execute()
                except Exception:
                    continue

        return imported_count

    def replace_orders_for_merchant(self, merchant_id: str, orders: list[dict]) -> int:
        client = self.get_client()

        if client is None or not merchant_id:
            return 0

        try:
            product_rows = (
                client.table("products")
                .select("id")
                .eq("merchant_id", merchant_id)
                .execute()
            ).data or []
            valid_product_ids = {item.get("id") for item in product_rows if item.get("id")}
        except Exception:
            valid_product_ids = set()

        try:
            client.table("shopify_orders").delete().eq("merchant_id", merchant_id).execute()
        except Exception:
            return 0

        imported_count = 0

        for order in orders:
            try:
                created = (
                    client.table("shopify_orders")
                    .insert(
                        {
                            "merchant_id": merchant_id,
                            "shopify_order_id": order.get("shopify_order_id"),
                            "order_name": order.get("order_name"),
                            "currency_code": order.get("currency_code"),
                            "customer_email": order.get("customer_email"),
                            "ordered_at": order.get("ordered_at"),
                            "updated_at": order.get("updated_at"),
                            "total_price": order.get("total_price"),
                            "subtotal_price": order.get("subtotal_price"),
                            "ai_assisted": bool(order.get("ai_assisted")),
                            "ai_assist_modes": order.get("ai_assist_modes") or [],
                            "assisted_product_ids": order.get("assisted_product_ids") or [],
                        }
                    )
                    .execute()
                )
            except Exception:
                continue

            if not created.data:
                continue

            imported_count += 1
            order_id = created.data[0]["id"]
            line_items = order.get("line_items") or []

            if not line_items:
                continue

            try:
                client.table("shopify_order_line_items").insert(
                    [
                        {
                            "order_id": order_id,
                            "shopify_line_item_id": item.get("shopify_line_item_id"),
                            "product_id": item.get("product_id") if item.get("product_id") in valid_product_ids else None,
                            "shopify_product_id": item.get("shopify_product_id"),
                            "title": item.get("title") or "Untitled item",
                            "quantity": item.get("quantity") or 1,
                            "unit_price": item.get("unit_price"),
                            "ai_assisted": bool(item.get("ai_assisted")),
                            "ai_assist_mode": item.get("ai_assist_mode"),
                            "ai_customer_identifier": item.get("ai_customer_identifier"),
                            "custom_attributes": item.get("custom_attributes") or {},
                        }
                        for item in line_items
                        if item.get("shopify_line_item_id")
                    ]
                ).execute()
            except Exception:
                continue

        return imported_count

    def ensure_chat_session(self, customer_identifier: Optional[str]) -> Optional[str]:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return None

        safe_customer_identifier = customer_identifier or "guest-user"

        try:
            existing = (
                client.table("chat_sessions")
                .select("id")
                .eq("merchant_id", merchant_id)
                .eq("customer_identifier", safe_customer_identifier)
                .order("started_at", desc=True)
                .limit(1)
                .execute()
            )

            if existing.data:
                return existing.data[0]["id"]

            created = (
                client.table("chat_sessions")
                .insert(
                    {
                        "merchant_id": merchant_id,
                        "customer_identifier": safe_customer_identifier,
                    }
                )
                .execute()
            )

            if created.data:
                return created.data[0]["id"]

            return None
        except Exception:
            return None

    def log_chat_message(self, session_id: Optional[str], sender: str, message: str, mode: str) -> bool:
        client = self.get_client()

        if client is None or not session_id:
            return False

        try:
            (
                client.table("chat_messages")
                .insert(
                    {
                        "session_id": session_id,
                        "sender": sender,
                        "message": message,
                        "mode": mode,
                    }
                )
                .execute()
            )
            return True
        except Exception:
            return False

    def log_recommendation_event(
        self,
        event_type: str,
        input_summary: str,
        recommended_product_ids: list[str],
        session_id: Optional[str] = None,
    ) -> bool:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return False

        try:
            (
                client.table("recommendation_events")
                .insert(
                    {
                        "merchant_id": merchant_id,
                        "session_id": session_id,
                        "event_type": event_type,
                        "input_summary": input_summary,
                        "recommended_product_ids": recommended_product_ids,
                    }
                )
                .execute()
            )
            return True
        except Exception:
            return False

    def log_feedback_event(
        self,
        feedback_type: str,
        mode: Optional[str],
        context_note: Optional[str],
        recommended_product_ids: list[str],
        customer_identifier: Optional[str] = None,
    ) -> bool:
        session_id = self.ensure_chat_session(customer_identifier)
        summary_parts = []

        if mode:
            summary_parts.append(f"mode={mode}")
        if context_note:
            summary_parts.append(context_note.strip())

        summary = " | ".join([part for part in summary_parts if part]) or "Shopper recommendation feedback"
        event_type = f"feedback_{feedback_type}"
        logged = self.log_recommendation_event(
            event_type=event_type,
            input_summary=summary,
            recommended_product_ids=recommended_product_ids,
            session_id=session_id,
        )

        if logged and session_id:
            self.log_chat_message(
                session_id=session_id,
                sender="customer",
                message=f"Feedback captured: {feedback_type}",
                mode=mode or "feedback",
            )

        return logged

    def fetch_dashboard_snapshot(self) -> MerchantDashboardSnapshot:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()
        storefront_domain = self._default_storefront_domain()

        empty_snapshot = MerchantDashboardSnapshot(
            store_name="StyledGenie",
            store_domain=settings.shopify_store_domain,
            storefront_domain=storefront_domain,
            overview=AnalyticsOverview(
                chat_interactions=0,
                outfit_recommendations=0,
                image_uploads=0,
                support_questions_answered=0,
            ),
            products_imported=0,
            tagged_products=0,
            styling_tags=0,
            faq_entries=0,
            knowledge_entries=0,
            curated_looks=0,
            chat_sessions=0,
            last_catalog_sync=None,
            last_orders_sync=None,
            orders_scope_ready=False,
            orders_imported=0,
            ai_assisted_orders=0,
            revenue_assisted=0.0,
            average_order_value=0.0,
            ai_conversion_rate=0.0,
            drop_off_rate=0.0,
            top_journey="Not enough data",
            feedback_summary=ShopperFeedbackSummary(),
            recent_activity=[],
            recent_products=[],
        )

        if client is None or not merchant_id:
            return empty_snapshot

        try:
            merchant_response = (
                client.table("merchants")
                .select("brand_name, shopify_store_domain")
                .eq("id", merchant_id)
                .limit(1)
                .execute()
            )
            merchant_row = (merchant_response.data or [{}])[0]

            try:
                product_response = (
                    client.table("products")
                    .select(
                        "id, shopify_product_id, title, category, price, image_url, product_url, handle, created_at"
                    )
                    .eq("merchant_id", merchant_id)
                    .order("created_at", desc=True)
                    .execute()
                )
            except Exception:
                product_response = (
                    client.table("products")
                    .select("id, shopify_product_id, title, category, price, image_url, created_at")
                    .eq("merchant_id", merchant_id)
                    .order("created_at", desc=True)
                    .execute()
                )
            products = product_response.data or []
            product_ids = [item["id"] for item in products if item.get("id")]

            tag_rows = []
            if product_ids:
                tag_rows = self._select_in_batches(
                    "product_tags",
                    "product_id, tag",
                    "product_id",
                    product_ids,
                )

            knowledge_rows = (
                client.table("knowledge_base_entries")
                .select("id, entry_type, body")
                .eq("merchant_id", merchant_id)
                .execute()
            ).data or []

            profile_payload = {}
            sync_status_payload = {}
            for row in knowledge_rows:
                if row.get("entry_type") == "merchant_profile":
                    profile_payload = self._parse_json_body(row.get("body"))
                elif row.get("entry_type") == "sync_status":
                    sync_status_payload = self._parse_json_body(row.get("body"))

            resolved_store_name = profile_payload.get("brand_name") or merchant_row.get("brand_name") or "StyledGenie"
            resolved_store_domain = (
                profile_payload.get("connected_store_domain")
                or merchant_row.get("shopify_store_domain")
                or settings.shopify_store_domain
            )
            resolved_storefront_domain = (
                profile_payload.get("storefront_domain")
                or storefront_domain
            )

            faq_rows = (
                client.table("faqs")
                .select("id")
                .eq("merchant_id", merchant_id)
                .execute()
            ).data or []

            look_rows = (
                client.table("curated_looks")
                .select("id")
                .eq("merchant_id", merchant_id)
                .execute()
            ).data or []

            session_rows = (
                client.table("chat_sessions")
                .select("id")
                .eq("merchant_id", merchant_id)
                .execute()
            ).data or []
            session_ids = [item["id"] for item in session_rows if item.get("id")]

            customer_message_count = 0
            if session_ids:
                chat_rows = self._select_in_batches(
                    "chat_messages",
                    "sender",
                    "session_id",
                    session_ids,
                )
                customer_message_count = len([item for item in chat_rows if item.get("sender") == "customer"])

            event_rows = (
                client.table("recommendation_events")
                .select("event_type, input_summary, created_at, recommended_product_ids")
                .eq("merchant_id", merchant_id)
                .order("created_at", desc=True)
                .execute()
            ).data or []

            order_rows = []
            line_item_rows = []
            try:
                order_rows = (
                    client.table("shopify_orders")
                    .select(
                        "id, shopify_order_id, order_name, ordered_at, total_price, subtotal_price, ai_assisted, "
                        "ai_assist_modes, synced_at"
                    )
                    .eq("merchant_id", merchant_id)
                    .order("ordered_at", desc=True)
                    .execute()
                ).data or []
            except Exception:
                order_rows = []

            order_ids = [item.get("id") for item in order_rows if item.get("id")]
            if order_ids:
                try:
                    line_item_rows = self._select_in_batches(
                        "shopify_order_line_items",
                        "order_id, ai_assisted, ai_assist_mode, product_id, quantity, unit_price",
                        "order_id",
                        order_ids,
                    )
                except Exception:
                    line_item_rows = []

            tagged_product_ids = {row.get("product_id") for row in tag_rows if row.get("product_id")}
            distinct_tags = {row.get("tag") for row in tag_rows if row.get("tag")}
            feedback_summary = self._feedback_summary(event_rows, tag_rows)
            journey_metrics = self._journey_metrics(event_rows, order_rows)
            category_metrics = self._category_metrics(products, tag_rows)

            recent_products = self._recommended_dashboard_products(products, event_rows)

            orders_imported = len(order_rows)
            ai_assisted_orders = len([item for item in order_rows if item.get("ai_assisted")])
            total_revenue = sum(self._safe_float(item.get("total_price")) for item in order_rows)
            revenue_assisted = sum(
                self._safe_float(item.get("total_price"))
                for item in order_rows
                if item.get("ai_assisted")
            )
            average_order_value = round(total_revenue / orders_imported, 2) if orders_imported else 0.0
            ai_conversion_rate = round((ai_assisted_orders / len(session_rows)) * 100, 2) if session_rows else 0.0
            drop_off_rate = round(
                max(
                    0,
                    100
                    - (
                        (
                            (len([item for item in event_rows if item.get("event_type") != "support_question"]) or 0)
                            / max(1, len(session_rows))
                        )
                        * 100
                    ),
                ),
                2,
            ) if session_rows else 0.0
            top_journey = self._top_journey_from_orders(order_rows, event_rows)
            support_question_count = len(
                [item for item in event_rows if item.get("event_type") == "support_question"]
            )
            data_quality = self._data_quality_snapshot(
                products=products,
                tag_rows=tag_rows,
                faq_count=len(faq_rows),
                look_count=len(look_rows),
                knowledge_count=len(
                    [row for row in knowledge_rows if row.get("entry_type") not in RESERVED_KNOWLEDGE_TYPES]
                ),
                support_question_count=support_question_count,
            )
            last_catalog_sync = (
                sync_status_payload.get("catalog_synced_at")
                or (products[0].get("created_at") if products else None)
            )
            last_orders_sync = (
                sync_status_payload.get("orders_synced_at")
                or (order_rows[0].get("synced_at") if order_rows else None)
            )
            orders_scope_ready = (
                bool(sync_status_payload.get("orders_scope_ready"))
                if "orders_scope_ready" in sync_status_payload
                else bool(order_rows)
            )

            recent_activity = [
                DashboardActivityItem(
                    title=self._activity_title(item.get("event_type")),
                    detail=self._activity_detail(item),
                    timestamp=item.get("created_at"),
                    kind=item.get("event_type") or "activity",
                )
                for item in event_rows[:6]
            ]

            return MerchantDashboardSnapshot(
                store_name=resolved_store_name,
                store_domain=resolved_store_domain,
                storefront_domain=resolved_storefront_domain,
                overview=AnalyticsOverview(
                    chat_interactions=customer_message_count,
                    outfit_recommendations=len(
                        [item for item in event_rows if item.get("event_type") == "outfit_curation"]
                    ),
                    image_uploads=len(
                        [
                            item
                            for item in event_rows
                            if item.get("event_type") in {"get_inspired", "complete_the_look"}
                        ]
                    ),
                    support_questions_answered=len(
                        [item for item in event_rows if item.get("event_type") == "support_question"]
                    ),
                ),
                products_imported=len(products),
                tagged_products=len(tagged_product_ids),
                styling_tags=len(distinct_tags),
                faq_entries=len(faq_rows),
                knowledge_entries=len(
                    [row for row in knowledge_rows if row.get("entry_type") not in RESERVED_KNOWLEDGE_TYPES]
                ),
                curated_looks=len(look_rows),
                chat_sessions=len(session_rows),
                last_catalog_sync=last_catalog_sync,
                last_orders_sync=last_orders_sync,
                orders_scope_ready=orders_scope_ready,
                orders_imported=orders_imported,
                ai_assisted_orders=ai_assisted_orders,
                revenue_assisted=round(revenue_assisted, 2),
                average_order_value=average_order_value,
                ai_conversion_rate=ai_conversion_rate,
                drop_off_rate=drop_off_rate,
                top_journey=top_journey,
                feedback_summary=feedback_summary,
                recent_activity=recent_activity,
                recent_products=recent_products,
                journey_metrics=journey_metrics,
                category_metrics=category_metrics,
                data_quality=data_quality,
            )
        except Exception as error:
            logger.warning("Dashboard snapshot load failed. %s", error)
            return empty_snapshot

    def _safe_float(self, value: object) -> float:
        try:
            return float(value or 0)
        except Exception:
            return 0.0

    def _parse_iso_datetime(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None

        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except Exception:
            return None

    def _parse_event_mode(self, input_summary: Optional[str]) -> Optional[str]:
        summary = (input_summary or "").strip()
        if not summary:
            return None

        for segment in summary.split("|"):
            normalized = segment.strip()
            if normalized.startswith("mode="):
                return normalized.replace("mode=", "", 1).strip()

        return None

    def _journey_metrics(self, event_rows: list[dict], order_rows: list[dict]) -> list[JourneyMetric]:
        labels = {
            "outfit_curation": "Create Full Outfit",
            "get_inspired": "Get Inspired",
            "complete_the_look": "Complete The Look",
            "support_question": "Customer Care",
        }
        started_counts = Counter()
        assisted_order_counts = Counter()
        positive_feedback_counts = Counter()
        refinement_feedback_counts = Counter()
        last_activity = {}

        for event in event_rows:
            event_type = event.get("event_type") or ""
            event_timestamp = event.get("created_at")

            if event_type in labels:
                started_counts[event_type] += 1
                if event_timestamp and not last_activity.get(event_type):
                    last_activity[event_type] = event_timestamp
                continue

            if not event_type.startswith("feedback_"):
                continue

            mode = self._parse_event_mode(event.get("input_summary"))
            if not mode or mode not in labels:
                continue

            feedback_key = event_type.replace("feedback_", "", 1)
            if feedback_key in {"love_it", "save_for_later"}:
                positive_feedback_counts[mode] += 1
            elif feedback_key in {"show_another_option", "make_more_casual", "change_colours"}:
                refinement_feedback_counts[mode] += 1

            if event_timestamp and not last_activity.get(mode):
                last_activity[mode] = event_timestamp

        for order in order_rows:
            for mode in order.get("ai_assist_modes") or []:
                if mode not in labels:
                    continue
                assisted_order_counts[mode] += 1
                if order.get("ordered_at") and not last_activity.get(mode):
                    last_activity[mode] = order.get("ordered_at")

        metrics = []
        for key, label in labels.items():
            started = started_counts.get(key, 0)
            assisted_orders = assisted_order_counts.get(key, 0)
            conversion_rate = round((assisted_orders / started) * 100, 2) if started else 0.0
            metrics.append(
                JourneyMetric(
                    key=key,
                    label=label,
                    started=started,
                    assisted_orders=assisted_orders,
                    conversion_rate=conversion_rate,
                    positive_feedback=positive_feedback_counts.get(key, 0),
                    refinement_requests=refinement_feedback_counts.get(key, 0),
                    last_activity=last_activity.get(key),
                )
            )

        return metrics

    def _category_metrics(self, products: list[dict], tag_rows: list[dict]) -> list[CategoryMetric]:
        if not products:
            return []

        product_lookup = {item.get("id"): item for item in products if item.get("id")}
        product_counts = Counter()
        tagged_products_by_category = defaultdict(set)

        for product in products:
            category = product.get("category") or "General"
            product_counts[category] += 1

        for row in tag_rows:
            product_id = row.get("product_id")
            product = product_lookup.get(product_id)
            if not product:
                continue
            category = product.get("category") or "General"
            tagged_products_by_category[category].add(product_id)

        total_products = len(products)
        category_rows = []
        for category, count in product_counts.most_common(6):
            category_rows.append(
                CategoryMetric(
                    label=category,
                    product_count=count,
                    tagged_count=len(tagged_products_by_category.get(category, set())),
                    share=round((count / total_products) * 100, 2) if total_products else 0.0,
                )
            )

        return category_rows

    def _data_quality_snapshot(
        self,
        products: list[dict],
        tag_rows: list[dict],
        faq_count: int,
        look_count: int,
        knowledge_count: int,
        support_question_count: int,
    ) -> DataQualitySnapshot:
        latest_catalog_datetime = None
        if products:
            latest_catalog_datetime = self._parse_iso_datetime(products[0].get("created_at"))

        freshness_hours = None
        if latest_catalog_datetime:
            freshness_hours = round(
                max(0.0, (datetime.now(timezone.utc) - latest_catalog_datetime).total_seconds() / 3600),
                1,
            )

        return DataQualitySnapshot(
            avg_tags_per_product=round((len(tag_rows) / len(products)), 2) if products else 0.0,
            products_with_links=len(
                [
                    item
                    for item in products
                    if item.get("product_url") or item.get("handle")
                ]
            ),
            products_with_images=len([item for item in products if item.get("image_url")]),
            catalog_freshness_hours=freshness_hours,
            brand_memory_assets=faq_count + look_count + knowledge_count,
            support_coverage_ratio=round(
                (faq_count / max(1, support_question_count)) * 100,
                2,
            )
            if support_question_count
            else (100.0 if faq_count else 0.0),
        )

    def _top_journey_from_orders(self, order_rows: list[dict], event_rows: list[dict]) -> str:
        journey_counts = {}

        for row in order_rows:
            for mode in row.get("ai_assist_modes") or []:
                journey_counts[mode] = journey_counts.get(mode, 0) + 1

        if not journey_counts:
            for row in event_rows:
                event_type = row.get("event_type") or ""
                if event_type.startswith("feedback_") or event_type == "support_question":
                    continue
                journey_counts[event_type] = journey_counts.get(event_type, 0) + 1

        if not journey_counts:
            return "Not enough data"

        labels = {
            "outfit_curation": "Create Full Outfit",
            "get_inspired": "Get Inspired",
            "complete_the_look": "Complete The Look",
            "support": "Customer Care",
            "support_question": "Customer Care",
        }
        best_key = max(journey_counts.items(), key=lambda item: item[1])[0]
        return labels.get(best_key, best_key.replace("_", " ").title())

    def _recommended_dashboard_products(
        self,
        products: list[dict],
        event_rows: list[dict],
    ) -> list[DashboardProductItem]:
        product_lookup = {
            item.get("id"): item for item in products if item.get("id") and not self._is_placeholder_product(item)
        }

        recommendation_counts = {}
        for event in event_rows:
            event_type = event.get("event_type") or ""
            if event_type.startswith("feedback_") or event_type == "support_question":
                continue

            for product_id in event.get("recommended_product_ids") or []:
                if product_id in product_lookup:
                    recommendation_counts[product_id] = recommendation_counts.get(product_id, 0) + 1

        ranked_products = sorted(
            product_lookup.values(),
            key=lambda item: (
                -recommendation_counts.get(item.get("id"), 0),
                item.get("created_at") or "",
            ),
        )

        if not ranked_products:
            ranked_products = [item for item in products if not self._is_placeholder_product(item)]

        if not ranked_products:
            ranked_products = products

        return [
            DashboardProductItem(
                id=item.get("id"),
                title=item.get("title") or "Untitled product",
                category=item.get("category") or "General",
                price=str(item.get("price")) if item.get("price") not in (None, "") else None,
                product_url=item.get("product_url") or self._dashboard_product_url(item.get("handle")),
                image_url=item.get("image_url"),
            )
            for item in ranked_products[:5]
        ]

    def _is_placeholder_product(self, item: dict) -> bool:
        title = (item.get("title") or "").strip().lower()
        handle = (item.get("handle") or "").strip().lower()

        placeholder_titles = {
            "example product",
            "sample product",
            "test product",
        }

        if title in placeholder_titles:
            return True

        if handle in {"example-product", "sample-product", "test-product"}:
            return True

        return False

    def _feedback_summary(self, event_rows: list[dict], tag_rows: list[dict]) -> ShopperFeedbackSummary:
        counts = {
            "love_it": 0,
            "show_another_option": 0,
            "make_more_casual": 0,
            "change_colours": 0,
            "save_for_later": 0,
        }

        feedback_events = [
            row
            for row in event_rows
            if (row.get("event_type") or "").startswith("feedback_")
        ]

        for row in feedback_events:
            feedback_key = (row.get("event_type") or "").replace("feedback_", "", 1)
            if feedback_key in counts:
                counts[feedback_key] += 1

        product_tag_map = {}
        for row in tag_rows:
            product_id = row.get("product_id")
            tag = row.get("tag")
            if not product_id or not tag:
                continue
            product_tag_map.setdefault(product_id, []).append(tag)

        positive_product_ids = []
        for row in feedback_events:
            feedback_key = (row.get("event_type") or "").replace("feedback_", "", 1)
            if feedback_key in {"love_it", "save_for_later"}:
                positive_product_ids.extend(row.get("recommended_product_ids") or [])

        ignored_tags = {
            "apparel",
            "tops",
            "bottoms",
            "footwear",
            "shoes",
            "general",
        }
        tag_scores = {}
        for product_id in positive_product_ids:
            for tag in product_tag_map.get(product_id, []):
                normalized = (tag or "").strip().lower()
                if not normalized or normalized in ignored_tags or len(normalized) < 3:
                    continue
                tag_scores[normalized] = tag_scores.get(normalized, 0) + 1

        ranked_tags = [
            tag
            for tag, _count in sorted(tag_scores.items(), key=lambda item: (-item[1], item[0]))[:3]
        ]

        signals = []
        if ranked_tags:
            signals.append(f"Shoppers respond best to {', '.join(ranked_tags)} looks.")
        if counts["show_another_option"]:
            signals.append("Many shoppers ask to compare alternate directions before deciding.")
        if counts["make_more_casual"]:
            signals.append("More relaxed, casual versions are being requested often.")
        if counts["change_colours"]:
            signals.append("Colour variation is a common shopper preference signal.")
        if counts["save_for_later"]:
            signals.append("Some looks are strong enough to save for later consideration.")

        return ShopperFeedbackSummary(
            love_it=counts["love_it"],
            show_another_option=counts["show_another_option"],
            make_more_casual=counts["make_more_casual"],
            change_colours=counts["change_colours"],
            save_for_later=counts["save_for_later"],
            top_preference_signals=signals[:4],
        )

    def _dashboard_product_url(self, handle: Optional[str]) -> Optional[str]:
        storefront_domain = settings.shopify_storefront_domain or settings.shopify_store_domain
        if not handle or not storefront_domain:
            return None

        normalized_domain = storefront_domain.replace("https://", "").replace("http://", "").strip("/")
        return f"https://{normalized_domain}/products/{handle}"

    def _activity_title(self, event_type: Optional[str]) -> str:
        titles = {
            "outfit_curation": "Outfit recommendation sent",
            "get_inspired": "Inspiration image processed",
            "complete_the_look": "Complete-the-look suggestion sent",
            "support_question": "Support question answered",
            "feedback_love_it": "Shopper loved a recommendation",
            "feedback_show_another_option": "Shopper asked for another option",
            "feedback_make_more_casual": "Shopper requested a more casual direction",
            "feedback_change_colours": "Shopper asked for a different colour story",
            "feedback_save_for_later": "Shopper saved a look for later",
        }
        return titles.get(event_type or "", "AI activity recorded")

    def _activity_detail(self, item: dict) -> str:
        summary = (item.get("input_summary") or "").strip()
        if summary:
            return summary[:120]

        recommendation_count = len(item.get("recommended_product_ids") or [])
        if recommendation_count:
            return f"{recommendation_count} product recommendations were included."

        return "Customer interaction recorded."
