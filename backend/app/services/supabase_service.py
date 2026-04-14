import json
import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from app.config import settings
from app.models.schemas import (
    AnalyticsOverview,
    AIStackStatus,
    CatalogIntelligence,
    CatalogProductOption,
    CategoryMetric,
    ChatbotCustomization,
    ChatSessionContext,
    MerchantChatbotVoiceConfig,
    CustomerStyleProfilesRequest,
    CustomerStyleProfilesResponse,
    CustomerCareItem,
    CustomerCareSettings,
    DataQualitySnapshot,
    DashboardActivityItem,
    DashboardProductItem,
    FAQItem,
    KnowledgeBaseItem,
    LookManagementItem,
    MerchantDashboardSnapshot,
    MerchantStyleProfileSummary,
    MerchantStyleProfilesResponse,
    MerchantStoreProfile,
    MerchantWorkspaceSnapshot,
    JourneyMetric,
    ShopperFeedbackSummary,
    StyleProfile,
    SupportContact,
    SupportRequestRecord,
)

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - optional dependency for early MVP stages
    create_client = None


logger = logging.getLogger(__name__)

CUSTOMER_STYLE_PROFILE_ENTRY_TYPE = "customer_style_profile"
CUSTOMER_STYLE_PROFILE_TITLE_PREFIX = "customer-style-profile::"
CHAT_SESSION_CONTEXT_FALLBACK_PREFIX = "chat-session-context"

RESERVED_KNOWLEDGE_TYPES = {
    "merchant_profile",
    "chatbot_customization",
    "chatbot_voice_config",
    "catalog_intelligence",
    "customer_care_settings",
    "sync_status",
    CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
}


class SupabaseService:
    def __init__(self) -> None:
        self._client = None
        self._customer_style_profile_cache: dict[str, dict] = {}
        self._merchant_voice_config_cache: dict[str, dict] = {}
        self._chat_session_context_cache: dict[str, dict] = {}

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

    def _chunk_rows(self, rows: list[dict], batch_size: int = 200) -> list[list[dict]]:
        if not rows:
            return []

        return [rows[start : start + batch_size] for start in range(0, len(rows), batch_size)]

    def _default_storefront_domain(self) -> Optional[str]:
        return settings.shopify_storefront_domain or settings.shopify_store_domain

    def _customer_style_profile_cache_key(self, merchant_id: Optional[str], customer_identifier: str) -> str:
        normalized = self._normalize_customer_identifier(customer_identifier)
        return f"{merchant_id or 'fallback'}::{normalized}"

    def _normalize_customer_email(self, customer_email: Optional[str]) -> Optional[str]:
        normalized = str(customer_email or "").strip().lower()
        return normalized or None

    def _normalize_customer_identifier(self, customer_identifier: Optional[str]) -> str:
        raw = str(customer_identifier or "").strip()
        if not raw:
            return ""

        if raw.lower().startswith("email:"):
            return raw.split(":", 1)[1].strip().lower()

        if "@" in raw:
            return raw.lower()

        gid_match = re.search(r"/Customer/(\d+)", raw, re.IGNORECASE)
        if gid_match:
            return gid_match.group(1)

        return raw

    def _runtime_state_dir(self) -> Path:
        return Path(__file__).resolve().parents[3] / ".styledgenie-runtime"

    def _runtime_state_token(self, raw_value: Optional[str]) -> str:
        token = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(raw_value or "default").strip().lower()).strip("-")
        return token or "default"

    def _chatbot_voice_config_fallback_path(self, merchant_id: Optional[str]) -> Path:
        return self._runtime_state_dir() / f"chatbot-voice-config-{self._runtime_state_token(merchant_id)}.json"

    def _chat_session_context_cache_key(self, merchant_id: Optional[str], session_id: Optional[str]) -> str:
        return f"{self._runtime_state_token(merchant_id)}::{self._runtime_state_token(session_id)}"

    def _chat_session_context_fallback_path(self, merchant_id: Optional[str], session_id: Optional[str]) -> Path:
        return self._runtime_state_dir() / (
            f"{CHAT_SESSION_CONTEXT_FALLBACK_PREFIX}-{self._runtime_state_token(merchant_id)}-"
            f"{self._runtime_state_token(session_id)}.json"
        )

    def _read_chat_session_context_fallback(
        self,
        merchant_id: Optional[str],
        session_id: Optional[str],
    ) -> Optional[ChatSessionContext]:
        cache_key = self._chat_session_context_cache_key(merchant_id, session_id)
        cached_payload = self._chat_session_context_cache.get(cache_key)
        if isinstance(cached_payload, dict):
            try:
                return ChatSessionContext(**cached_payload)
            except Exception:
                self._chat_session_context_cache.pop(cache_key, None)

        fallback_path = self._chat_session_context_fallback_path(merchant_id, session_id)
        if not fallback_path.exists():
            return None

        try:
            payload = json.loads(fallback_path.read_text(encoding="utf-8"))
        except Exception:
            return None

        if not isinstance(payload, dict):
            return None

        try:
            context = ChatSessionContext(**payload)
        except Exception:
            return None

        self._chat_session_context_cache[cache_key] = context.model_dump()
        return context

    def _write_chat_session_context_fallback(
        self,
        merchant_id: Optional[str],
        session_context: ChatSessionContext,
    ) -> ChatSessionContext:
        cache_key = self._chat_session_context_cache_key(merchant_id, session_context.sessionId)
        payload = session_context.model_dump()
        self._chat_session_context_cache[cache_key] = payload

        fallback_path = self._chat_session_context_fallback_path(merchant_id, session_context.sessionId)
        try:
            fallback_path.parent.mkdir(parents=True, exist_ok=True)
            fallback_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        except Exception as error:
            logger.warning("Chat session context fallback file write failed. %s", error)

        return session_context

    def _read_chatbot_voice_config_fallback(self, merchant_id: Optional[str]) -> Optional[MerchantChatbotVoiceConfig]:
        cache_key = self._runtime_state_token(merchant_id)
        cached_payload = self._merchant_voice_config_cache.get(cache_key)
        if isinstance(cached_payload, dict):
            try:
                return MerchantChatbotVoiceConfig(**cached_payload)
            except Exception:
                self._merchant_voice_config_cache.pop(cache_key, None)

        fallback_path = self._chatbot_voice_config_fallback_path(merchant_id)
        if not fallback_path.exists():
            return None

        try:
            payload = json.loads(fallback_path.read_text(encoding="utf-8"))
        except Exception:
            return None

        if not isinstance(payload, dict):
            return None

        try:
            config = MerchantChatbotVoiceConfig(**payload)
        except Exception:
            return None

        self._merchant_voice_config_cache[cache_key] = config.model_dump()
        return config

    def _write_chatbot_voice_config_fallback(
        self,
        merchant_id: Optional[str],
        voice_config: MerchantChatbotVoiceConfig,
    ) -> bool:
        cache_key = self._runtime_state_token(merchant_id)
        payload = voice_config.model_dump()
        self._merchant_voice_config_cache[cache_key] = payload

        fallback_path = self._chatbot_voice_config_fallback_path(merchant_id)
        try:
            fallback_path.parent.mkdir(parents=True, exist_ok=True)
            fallback_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        except Exception as error:
            logger.warning("Chatbot voice fallback file write failed. %s", error)

        return True

    def _customer_identifier_candidates(self, customer_identifier: Optional[str]) -> list[str]:
        raw = str(customer_identifier or "").strip()
        normalized = self._normalize_customer_identifier(customer_identifier)
        candidates = []
        for value in [raw, normalized]:
            if value and value not in candidates:
                candidates.append(value)
        return candidates

    def _customer_style_profile_entry_titles(
        self,
        customer_identifier: Optional[str],
        customer_email: Optional[str] = None,
    ) -> list[str]:
        titles: list[str] = []

        for candidate in self._customer_identifier_candidates(customer_identifier):
            title = f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}{candidate}"
            if title not in titles:
                titles.append(title)

        normalized_email = self._normalize_customer_email(customer_email) or ""
        if normalized_email:
            email_title = f"{CUSTOMER_STYLE_PROFILE_TITLE_PREFIX}{normalized_email}"
            if email_title not in titles:
                titles.append(email_title)

        return titles

    def _customer_style_profile_primary_title(
        self,
        customer_identifier: Optional[str],
        customer_email: Optional[str] = None,
    ) -> Optional[str]:
        titles = self._customer_style_profile_entry_titles(customer_identifier, customer_email)
        return titles[0] if titles else None

    def _fetch_customer_style_profiles_from_knowledge_base(
        self,
        *,
        merchant_id: Optional[str],
        customer_identifier: Optional[str],
        customer_email: Optional[str] = None,
        account_display_name: Optional[str] = None,
    ) -> Optional[CustomerStyleProfilesResponse]:
        client = self.get_client()
        if client is None or not merchant_id:
            return None

        for title in self._customer_style_profile_entry_titles(customer_identifier, customer_email):
            try:
                response = (
                    client.table("knowledge_base_entries")
                    .select("body, created_at")
                    .eq("merchant_id", merchant_id)
                    .eq("entry_type", CUSTOMER_STYLE_PROFILE_ENTRY_TYPE)
                    .eq("title", title)
                    .limit(1)
                    .execute()
                )
            except Exception:
                continue

            row = (response.data or [None])[0]
            if not row:
                continue

            payload = self._parse_json_body(row.get("body"))
            profile_rows = payload.get("profiles") if isinstance(payload.get("profiles"), list) else []
            updated_at = payload.get("updatedAt") or row.get("created_at")

            return CustomerStyleProfilesResponse(
                customerId=payload.get("customerId")
                or self._normalize_customer_identifier(customer_identifier)
                or (customer_email or ""),
                customerEmail=payload.get("customerEmail") or customer_email,
                accountDisplayName=payload.get("accountDisplayName") or account_display_name,
                profiles=[StyleProfile(**item) for item in profile_rows if isinstance(item, dict)],
                persisted=True,
                message="Style profiles loaded.",
                updatedAt=updated_at,
            )

        return None

    def _save_customer_style_profiles_to_knowledge_base(
        self,
        *,
        merchant_id: Optional[str],
        customer_identifier: Optional[str],
        customer_email: Optional[str],
        account_display_name: Optional[str],
        normalized_profiles: list[StyleProfile],
        timestamp: str,
    ) -> bool:
        client = self.get_client()
        titles = self._customer_style_profile_entry_titles(customer_identifier, customer_email)

        if client is None or not merchant_id or not titles:
            return False

        body_payload = {
            "customerId": self._normalize_customer_identifier(customer_identifier) or (customer_email or ""),
            "customerEmail": self._normalize_customer_email(customer_email),
            "accountDisplayName": account_display_name,
            "profiles": [profile.dict() for profile in normalized_profiles],
            "updatedAt": timestamp,
        }

        try:
            serialized_body = json.dumps(body_payload, ensure_ascii=True)
            for title in titles:
                existing = (
                    client.table("knowledge_base_entries")
                    .select("id")
                    .eq("merchant_id", merchant_id)
                    .eq("entry_type", CUSTOMER_STYLE_PROFILE_ENTRY_TYPE)
                    .eq("title", title)
                    .limit(1)
                    .execute()
                )

                write_payload = {
                    "merchant_id": merchant_id,
                    "title": title,
                    "body": serialized_body,
                    "entry_type": CUSTOMER_STYLE_PROFILE_ENTRY_TYPE,
                }

                if existing.data:
                    (
                        client.table("knowledge_base_entries")
                        .update({"body": write_payload["body"]})
                        .eq("id", existing.data[0]["id"])
                        .execute()
                    )
                else:
                    client.table("knowledge_base_entries").insert(write_payload).execute()

            return True
        except Exception:
            return False

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

    def _style_profile_completion_stats(self, profile: StyleProfile) -> tuple[int, int, int]:
        checks = [
            bool((profile.name or "").strip()),
            bool((profile.shoppingCategoryPreference or "").strip()),
            bool((profile.sizes.top or "").strip()),
            bool((profile.sizes.bottom or "").strip()),
            bool((profile.sizes.shoeEu or "").strip()),
            bool((profile.features.bodyType or "").strip()),
            bool((profile.features.skinTone or "").strip() or (profile.features.hairColor or "").strip() or (profile.features.eyeColor or "").strip()),
            bool(profile.favoriteColorPalette),
            bool(profile.fabricAllergies),
            bool((profile.styleNotes or "").strip() or profile.preferredFits or profile.preferredOccasions),
            bool((profile.styleAnalysis.summary or "").strip() or profile.styleAnalysis.tags),
            bool((profile.budget or "").strip() or profile.minBudget or profile.maxBudget),
            bool(profile.imageValidation and (profile.imageValidation.ok or profile.imageValidation.guidance or profile.imageValidation.qualityWarnings)),
        ]
        total_fields = len(checks)
        completed_fields = sum(1 for item in checks if item)
        completion = round((completed_fields / total_fields) * 100) if total_fields else 0
        completion = max(0, min(100, completion))
        return completion, completed_fields, total_fields

    def _style_profile_subtitle(self, profile: StyleProfile) -> str:
        for value in [
            (profile.styleAnalysis.summary or "").strip(),
            (profile.styleNotes or "").strip(),
            (profile.vibe.styleDescription or "").strip(),
        ]:
            if value:
                return value[:180]

        descriptor_parts = [
            (profile.shoppingCategoryPreference or "").strip().replace("_", " "),
            (profile.features.bodyType or "").strip().replace("_", " "),
            (profile.budget or "").strip().replace("_", " ")
            or (
                f"EUR{int(profile.minBudget)}-{int(profile.maxBudget)}"
                if profile.minBudget and profile.maxBudget
                else ""
            ),
        ]
        descriptor = ", ".join(part for part in descriptor_parts if part)
        if descriptor:
            return f"Saved profile for {descriptor} styling."

        return "Saved profile ready for storefront styling."

    def _style_profile_size_summary(self, profile: StyleProfile) -> str:
        summary = [profile.sizes.top, profile.sizes.bottom, profile.sizes.shoeEu]
        parts = [str(item).strip() for item in summary if str(item or "").strip()]
        return " / ".join(parts)

    def _build_merchant_style_profile_summary(
        self,
        *,
        customer_identifier: Optional[str],
        customer_email: Optional[str],
        account_display_name: Optional[str],
        profile: StyleProfile,
        updated_at: Optional[str],
    ) -> MerchantStyleProfileSummary:
        completion, completed_fields, total_fields = self._style_profile_completion_stats(profile)
        return MerchantStyleProfileSummary(
            id=(profile.id or "").strip() or f"profile-{uuid4()}",
            customerIdentifier=(customer_identifier or "").strip() or None,
            customerEmail=(customer_email or "").strip() or None,
            customerDisplayName=(account_display_name or "").strip() or (customer_email or "").strip() or None,
            name=(profile.name or "").strip() or "Untitled profile",
            subtitle=self._style_profile_subtitle(profile),
            completion=completion,
            completedFields=completed_fields,
            totalFields=total_fields,
            avatarUrl=None,
            isPrimary=bool(profile.isPrimary),
            relationship=(profile.relationship or "self").strip() or "self",
            gender=(profile.gender or "").strip(),
            sizeSummary=self._style_profile_size_summary(profile),
            bodyType=(profile.features.bodyType or "").strip(),
            budget=(profile.budget or "").strip()
            or (
                f"EUR{int(profile.minBudget)}-{int(profile.maxBudget)}"
                if profile.minBudget and profile.maxBudget
                else None
            ),
            styleSummary=(profile.styleAnalysis.summary or "").strip(),
            updatedAt=updated_at or profile.updatedAt,
        )

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

        products = self._backfill_catalog_product_cards(products)

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

    def _backfill_catalog_product_cards(self, products: list[dict]) -> list[dict]:
        missing_products = [
            item
            for item in products
            if item.get("shopify_product_id")
            and (not item.get("handle") or not item.get("product_url") or not item.get("shopify_variant_id"))
        ]

        if not missing_products:
            return products

        try:
            from app.services.shopify_service import ShopifyService

            details = ShopifyService().fetch_product_card_details(
                list({str(item.get("shopify_product_id")) for item in missing_products if item.get("shopify_product_id")})
            )
        except Exception:
            return products

        if not details:
            return products

        client = self.get_client()
        enriched_products: list[dict] = []

        for item in products:
            detail = details.get(item.get("shopify_product_id"), {})
            merged_item = {
                **item,
                "handle": item.get("handle") or detail.get("handle"),
                "product_url": item.get("product_url") or detail.get("product_url"),
                "shopify_variant_id": item.get("shopify_variant_id") or detail.get("shopify_variant_id"),
            }
            enriched_products.append(merged_item)

            if (
                client is not None
                and item.get("id")
                and any(
                    merged_item.get(key) != item.get(key)
                    for key in ("handle", "product_url", "shopify_variant_id")
                )
            ):
                try:
                    (
                        client.table("products")
                        .update(
                            {
                                "handle": merged_item.get("handle"),
                                "product_url": merged_item.get("product_url"),
                                "shopify_variant_id": merged_item.get("shopify_variant_id"),
                            }
                        )
                        .eq("id", item["id"])
                        .execute()
                    )
                except Exception:
                    pass

        return enriched_products

    def fetch_workspace_snapshot(self) -> MerchantWorkspaceSnapshot:
        overview = self.fetch_dashboard_snapshot()
        ai_stack = self._build_ai_stack_status()
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()
        fallback_voice_config = self._read_chatbot_voice_config_fallback(merchant_id)

        profile = self._default_profile(
            brand_name=overview.store_name,
            connected_store_domain=overview.store_domain,
            storefront_domain=overview.storefront_domain,
        )
        chatbot_customization = ChatbotCustomization()
        chatbot_voice_config = fallback_voice_config or MerchantChatbotVoiceConfig()
        catalog_intelligence = CatalogIntelligence()
        customer_care_settings = CustomerCareSettings()

        if client is None or not merchant_id:
            return MerchantWorkspaceSnapshot(
                overview=overview,
                profile=profile,
                chatbot_customization=chatbot_customization,
                chatbot_voice_config=chatbot_voice_config,
                catalog_intelligence=catalog_intelligence,
                ai_stack=ai_stack,
                looks=[],
                customer_care=[],
                customer_care_settings=customer_care_settings,
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
            chatbot_voice_body = self._parse_json_body((reserved_rows.get("chatbot_voice_config") or {}).get("body"))
            if chatbot_voice_body:
                chatbot_voice_config = self._merge_model(
                    MerchantChatbotVoiceConfig,
                    MerchantChatbotVoiceConfig(),
                    chatbot_voice_body,
                )
            catalog_intelligence = self._merge_model(
                CatalogIntelligence,
                CatalogIntelligence(),
                self._parse_json_body((reserved_rows.get("catalog_intelligence") or {}).get("body")),
            )
            customer_care_settings = self._merge_model(
                CustomerCareSettings,
                CustomerCareSettings(),
                self._parse_json_body((reserved_rows.get("customer_care_settings") or {}).get("body")),
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
                chatbot_voice_config=chatbot_voice_config,
                catalog_intelligence=catalog_intelligence,
                ai_stack=ai_stack,
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
                customer_care_settings=customer_care_settings,
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
                chatbot_voice_config=chatbot_voice_config,
                catalog_intelligence=catalog_intelligence,
                ai_stack=ai_stack,
                looks=[],
                customer_care=[],
                customer_care_settings=customer_care_settings,
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

    def fetch_chatbot_voice_config(self) -> MerchantChatbotVoiceConfig:
        workspace = self.fetch_workspace_snapshot()
        return workspace.chatbot_voice_config

    def update_chatbot_voice_config(self, voice_config: MerchantChatbotVoiceConfig) -> bool:
        normalized_config = MerchantChatbotVoiceConfig(**voice_config.model_dump())
        merchant_id = self.get_default_merchant_id()

        if self._upsert_config_entry(
            "chatbot_voice_config",
            "Chatbot voice config",
            normalized_config.model_dump(),
            merchant_id=merchant_id,
        ):
            self._write_chatbot_voice_config_fallback(merchant_id, normalized_config)
            return True

        return self._write_chatbot_voice_config_fallback(merchant_id, normalized_config)

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

    def update_customer_care_settings(self, settings_payload: CustomerCareSettings) -> bool:
        return self._upsert_config_entry(
            "customer_care_settings",
            "Customer care settings",
            settings_payload.dict(),
        )

    def fetch_catalog_product_options(self, limit: int = 250) -> list[CatalogProductOption]:
        return [
            CatalogProductOption(
                id=item["id"],
                title=item["title"],
                category=item["category"],
                price=str(item["price"]) if item.get("price") not in (None, "") else None,
                image_url=item.get("image_url"),
                product_url=item.get("product_url") or self._dashboard_product_url(item.get("handle")),
            )
            for item in self.fetch_catalog_products()[:limit]
            if item.get("id")
        ]

    def find_catalog_product_by_id(self, product_id: str) -> Optional[dict]:
        if not product_id:
            return None

        for item in self.fetch_catalog_products():
            if item.get("id") == product_id:
                return item
        return None

    def find_order_by_reference(self, order_reference: str, email: str) -> Optional[dict]:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id or not order_reference or not email:
            return None

        normalized_reference = str(order_reference).replace("#", "").strip().lower()
        normalized_email = str(email).strip().lower()

        try:
            response = (
                client.table("shopify_orders")
                .select(
                    "shopify_order_id, order_name, customer_email, ordered_at, updated_at, total_price, subtotal_price, currency_code, ai_assisted, ai_assist_modes, line_items"
                )
                .eq("merchant_id", merchant_id)
                .ilike("customer_email", normalized_email)
                .order("ordered_at", desc=True)
                .limit(25)
                .execute()
            )
        except Exception:
            return None

        for row in response.data or []:
            order_name = str(row.get("order_name") or "").strip().lower()
            if not order_name:
                continue
            comparable_name = order_name.replace("#", "")
            if comparable_name == normalized_reference or comparable_name.endswith(normalized_reference):
                return row

        return None

    def fetch_recent_order_summary(self) -> Optional[dict]:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is None or not merchant_id:
            return None

        try:
            response = (
                client.table("shopify_orders")
                .select("order_name, customer_email, ordered_at, updated_at")
                .eq("merchant_id", merchant_id)
                .order("ordered_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception:
            return None

        row = (response.data or [None])[0]
        if not row:
            return None

        return {
            "order_name": row.get("order_name"),
            "customer_email": row.get("customer_email"),
            "ordered_at": row.get("ordered_at"),
            "updated_at": row.get("updated_at"),
        }

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

    def fetch_customer_style_profiles(
        self,
        *,
        customer_identifier: Optional[str],
        customer_email: Optional[str] = None,
        account_display_name: Optional[str] = None,
    ) -> CustomerStyleProfilesResponse:
        merchant_id = self.get_default_merchant_id()
        customer_email = self._normalize_customer_email(customer_email)
        identifier_candidates = self._customer_identifier_candidates(customer_identifier)
        canonical_customer_identifier = identifier_candidates[-1] if identifier_candidates else (customer_email or "")
        cache_key = self._customer_style_profile_cache_key(merchant_id, canonical_customer_identifier)
        client = self.get_client()

        empty_response = CustomerStyleProfilesResponse(
            customerId=canonical_customer_identifier,
            customerEmail=customer_email,
            accountDisplayName=account_display_name,
            profiles=[],
            persisted=False,
            message="No style profiles saved yet.",
            updatedAt=None,
        )

        if client is not None and merchant_id:
            try:
                query = (
                    client.table("customer_style_profiles")
                    .select("customer_identifier, customer_email, account_display_name, profiles, updated_at")
                    .eq("merchant_id", merchant_id)
                )
                if identifier_candidates:
                    query = query.in_("customer_identifier", identifier_candidates)
                elif customer_email:
                    query = query.eq("customer_email", customer_email)
                response = query.limit(1).execute()
                row = (response.data or [None])[0]
                if not row and customer_email:
                    response = (
                        client.table("customer_style_profiles")
                        .select("customer_identifier, customer_email, account_display_name, profiles, updated_at")
                        .eq("merchant_id", merchant_id)
                        .eq("customer_email", customer_email)
                        .limit(1)
                        .execute()
                    )
                    row = (response.data or [None])[0]
                if row:
                    return CustomerStyleProfilesResponse(
                        customerId=row.get("customer_identifier") or canonical_customer_identifier,
                        customerEmail=row.get("customer_email") or customer_email,
                        accountDisplayName=row.get("account_display_name") or account_display_name,
                        profiles=[StyleProfile(**item) for item in (row.get("profiles") or []) if isinstance(item, dict)],
                        persisted=True,
                        message="Style profiles loaded.",
                        updatedAt=row.get("updated_at"),
                    )
            except Exception as error:
                logger.warning("Customer style profile load failed. %s", error)

        knowledge_base_fallback = self._fetch_customer_style_profiles_from_knowledge_base(
            merchant_id=merchant_id,
            customer_identifier=canonical_customer_identifier,
            customer_email=customer_email,
            account_display_name=account_display_name,
        )
        if knowledge_base_fallback is not None:
            cached_payload = knowledge_base_fallback.dict()
            self._customer_style_profile_cache[cache_key] = cached_payload
            return knowledge_base_fallback

        cached = self._customer_style_profile_cache.get(cache_key)
        if cached:
            return CustomerStyleProfilesResponse(**cached)

        return empty_response

    def save_customer_style_profiles(
        self,
        payload: CustomerStyleProfilesRequest,
    ) -> CustomerStyleProfilesResponse:
        merchant_id = self.get_default_merchant_id()
        customer_email = self._normalize_customer_email(payload.customerEmail)
        customer_identifier = self._normalize_customer_identifier(payload.customerId) or (customer_email or "")
        account_display_name = (payload.accountDisplayName or "").strip() or None
        client = self.get_client()
        timestamp = datetime.now(timezone.utc).isoformat()

        normalized_profiles = self._normalize_style_profiles(payload.profiles, timestamp)
        response_payload = {
            "customerId": customer_identifier,
            "customerEmail": customer_email,
            "accountDisplayName": account_display_name,
            "profiles": normalized_profiles,
            "persisted": False,
            "message": "Style profiles saved to temporary server memory.",
            "updatedAt": timestamp,
        }

        cache_key = self._customer_style_profile_cache_key(merchant_id, customer_identifier)
        self._customer_style_profile_cache[cache_key] = response_payload

        if client is not None and merchant_id:
            try:
                existing_query = (
                    client.table("customer_style_profiles")
                    .select("id")
                    .eq("merchant_id", merchant_id)
                )
                if customer_identifier:
                    existing_query = existing_query.eq("customer_identifier", customer_identifier)
                elif customer_email:
                    existing_query = existing_query.eq("customer_email", customer_email)
                existing = existing_query.limit(1).execute()
                write_payload = {
                    "merchant_id": merchant_id,
                    "customer_identifier": customer_identifier,
                    "customer_email": customer_email,
                    "account_display_name": account_display_name,
                    "profiles": [profile.dict() for profile in normalized_profiles],
                    "updated_at": timestamp,
                }

                if existing.data:
                    (
                        client.table("customer_style_profiles")
                        .update(write_payload)
                        .eq("id", existing.data[0]["id"])
                        .execute()
                    )
                else:
                    write_payload["created_at"] = timestamp
                    client.table("customer_style_profiles").insert(write_payload).execute()

                response_payload["persisted"] = True
                response_payload["message"] = "Style profiles saved."
                self._customer_style_profile_cache[cache_key] = response_payload
            except Exception as error:
                logger.warning("Customer style profile save fell back to memory cache. %s", error)

        if self._save_customer_style_profiles_to_knowledge_base(
            merchant_id=merchant_id,
            customer_identifier=customer_identifier,
            customer_email=customer_email,
            account_display_name=account_display_name,
            normalized_profiles=normalized_profiles,
            timestamp=timestamp,
        ):
            response_payload["persisted"] = True
            response_payload["message"] = "Style profiles saved."
            self._customer_style_profile_cache[cache_key] = response_payload

        return CustomerStyleProfilesResponse(**response_payload)

    def fetch_merchant_style_profiles(self) -> MerchantStyleProfilesResponse:
        merchant_id = self.get_default_merchant_id()
        client = self.get_client()
        profile_summaries: list[MerchantStyleProfileSummary] = []
        latest_updated_at: Optional[str] = None
        seen_profile_keys: set[str] = set()

        def append_profile_summary(
            *,
            customer_identifier: Optional[str],
            customer_email: Optional[str],
            account_display_name: Optional[str],
            profile: StyleProfile,
            updated_at: Optional[str],
        ) -> None:
            owner_token = (
                self._normalize_customer_email(customer_email)
                or self._normalize_customer_identifier(customer_identifier)
                or "unknown"
            )
            profile_key = f"{owner_token}::{str(profile.id or '').strip()}"
            if profile_key in seen_profile_keys:
                return
            seen_profile_keys.add(profile_key)
            profile_summaries.append(
                self._build_merchant_style_profile_summary(
                    customer_identifier=customer_identifier,
                    customer_email=customer_email,
                    account_display_name=account_display_name,
                    profile=profile,
                    updated_at=updated_at,
                )
            )

        if client is not None and merchant_id:
            try:
                response = (
                    client.table("customer_style_profiles")
                    .select("customer_identifier, customer_email, account_display_name, profiles, updated_at")
                    .eq("merchant_id", merchant_id)
                    .order("updated_at", desc=True)
                    .execute()
                )
                for row in response.data or []:
                    updated_at = row.get("updated_at")
                    if updated_at and (latest_updated_at is None or updated_at > latest_updated_at):
                        latest_updated_at = updated_at
                    for item in row.get("profiles") or []:
                        if not isinstance(item, dict):
                            continue
                        try:
                            profile = StyleProfile(**item)
                        except Exception:
                            continue
                        append_profile_summary(
                            customer_identifier=row.get("customer_identifier"),
                            customer_email=row.get("customer_email"),
                            account_display_name=row.get("account_display_name"),
                            profile=profile,
                            updated_at=updated_at,
                        )
            except Exception as error:
                logger.warning("Merchant style profile list failed from primary table. %s", error)

        if not profile_summaries and client is not None and merchant_id:
            try:
                response = (
                    client.table("knowledge_base_entries")
                    .select("title, body, created_at")
                    .eq("merchant_id", merchant_id)
                    .eq("entry_type", CUSTOMER_STYLE_PROFILE_ENTRY_TYPE)
                    .order("created_at", desc=True)
                    .execute()
                )
                for row in response.data or []:
                    payload = self._parse_json_body(row.get("body"))
                    updated_at = payload.get("updatedAt") or row.get("created_at")
                    if updated_at and (latest_updated_at is None or updated_at > latest_updated_at):
                        latest_updated_at = updated_at
                    for item in payload.get("profiles") or []:
                        if not isinstance(item, dict):
                            continue
                        try:
                            profile = StyleProfile(**item)
                        except Exception:
                            continue
                        append_profile_summary(
                            customer_identifier=payload.get("customerId"),
                            customer_email=payload.get("customerEmail"),
                            account_display_name=payload.get("accountDisplayName"),
                            profile=profile,
                            updated_at=updated_at,
                        )
            except Exception as error:
                logger.warning("Merchant style profile list failed from knowledge base fallback. %s", error)

        if not profile_summaries:
            cache_prefix = f"{merchant_id or 'fallback'}::"
            for cache_key, payload in self._customer_style_profile_cache.items():
                if not cache_key.startswith(cache_prefix):
                    continue
                updated_at = payload.get("updatedAt")
                if updated_at and (latest_updated_at is None or updated_at > latest_updated_at):
                    latest_updated_at = updated_at
                for item in payload.get("profiles") or []:
                    if not isinstance(item, StyleProfile):
                        try:
                            item = StyleProfile(**item)
                        except Exception:
                            continue
                    append_profile_summary(
                        customer_identifier=payload.get("customerId"),
                        customer_email=payload.get("customerEmail"),
                        account_display_name=payload.get("accountDisplayName"),
                        profile=item,
                        updated_at=updated_at,
                    )

        profile_summaries.sort(
            key=lambda item: (
                0 if item.isPrimary else 1,
                -(item.completion or 0),
                item.name.lower(),
            )
        )

        return MerchantStyleProfilesResponse(
            profiles=profile_summaries,
            updatedAt=latest_updated_at,
            source="merchant_dashboard",
        )

    def _normalize_style_profiles(self, profiles: list[StyleProfile], timestamp: str) -> list[StyleProfile]:
        normalized: list[StyleProfile] = []
        primary_locked = False

        for index, profile in enumerate(profiles or []):
            is_primary = bool(profile.isPrimary) and not primary_locked
            if is_primary:
                primary_locked = True

            normalized.append(
                StyleProfile(
                    id=str(profile.id).strip(),
                    isPrimary=is_primary,
                    name=(profile.name or "").strip(),
                    relationship="self"
                    if is_primary
                    else ((profile.relationship or "other").strip() or "other"),
                    shoppingCategoryPreference=(profile.shoppingCategoryPreference or "").strip().lower(),
                    gender=(profile.gender or "").strip(),
                    sizes=profile.sizes,
                    features=profile.features,
                    vibe=profile.vibe,
                    styleAnalysis=profile.styleAnalysis,
                    favoriteColorPalette=[str(item).strip() for item in (profile.favoriteColorPalette or []) if str(item).strip()],
                    fabricAllergies=[str(item).strip() for item in (profile.fabricAllergies or []) if str(item).strip()],
                    styleNotes=(profile.styleNotes or "").strip() or None,
                    preferredFits=[str(item).strip() for item in (profile.preferredFits or []) if str(item).strip()],
                    preferredOccasions=[str(item).strip() for item in (profile.preferredOccasions or []) if str(item).strip()],
                    dislikedColors=[str(item).strip() for item in (profile.dislikedColors or []) if str(item).strip()],
                    dislikedFabrics=[str(item).strip() for item in (profile.dislikedFabrics or []) if str(item).strip()],
                    budget=(profile.budget or "").strip() or None,
                    minBudget=profile.minBudget,
                    maxBudget=profile.maxBudget,
                    source=profile.source,
                    imageValidation=profile.imageValidation,
                    createdAt=profile.createdAt or timestamp,
                    updatedAt=timestamp,
                )
            )

        if normalized and not any(profile.isPrimary for profile in normalized):
            normalized[0].isPrimary = True
            normalized[0].relationship = "self"

        return normalized

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
        product_rows = [
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
            for product in products
            if product.get("shopify_product_id") and product.get("title")
        ]

        product_by_shopify_id = {
            str(product.get("shopify_product_id")): product
            for product in products
            if product.get("shopify_product_id")
        }

        for batch in self._chunk_rows(product_rows, batch_size=100):
            created_rows = []
            try:
                created = client.table("products").insert(batch).execute()
                created_rows = created.data or []
            except Exception:
                for row in batch:
                    try:
                        created = client.table("products").insert(row).execute()
                    except Exception:
                        fallback_row = {
                            "merchant_id": row["merchant_id"],
                            "shopify_product_id": row["shopify_product_id"],
                            "title": row["title"],
                            "category": row.get("category"),
                            "description": row.get("description"),
                            "image_url": row.get("image_url"),
                            "price": row.get("price"),
                        }
                        try:
                            created = client.table("products").insert(fallback_row).execute()
                        except Exception:
                            continue

                    if created.data:
                        created_rows.extend(created.data)

            if not created_rows:
                continue

            imported_count += len(created_rows)
            tag_rows: list[dict] = []
            for created_row in created_rows:
                product_id = created_row.get("id")
                shopify_product_id = str(created_row.get("shopify_product_id") or "").strip()
                if not product_id or not shopify_product_id:
                    continue

                source_product = product_by_shopify_id.get(shopify_product_id) or {}
                tags = source_product.get("tags", []) or []
                tag_rows.extend(
                    {"product_id": product_id, "tag": tag}
                    for tag in tags
                    if tag
                )

            for tag_batch in self._chunk_rows(tag_rows, batch_size=500):
                try:
                    client.table("product_tags").insert(tag_batch).execute()
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
        order_rows = [
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
            for order in orders
            if order.get("shopify_order_id")
        ]
        order_by_shopify_id = {
            str(order.get("shopify_order_id")): order
            for order in orders
            if order.get("shopify_order_id")
        }

        for batch in self._chunk_rows(order_rows, batch_size=100):
            created_rows = []
            try:
                created = client.table("shopify_orders").insert(batch).execute()
                created_rows = created.data or []
            except Exception:
                for row in batch:
                    try:
                        created = client.table("shopify_orders").insert(row).execute()
                    except Exception:
                        continue
                    if created.data:
                        created_rows.extend(created.data)

            if not created_rows:
                continue

            imported_count += len(created_rows)
            line_item_rows: list[dict] = []
            for created_row in created_rows:
                order_id = created_row.get("id")
                shopify_order_id = str(created_row.get("shopify_order_id") or "").strip()
                if not order_id or not shopify_order_id:
                    continue

                source_order = order_by_shopify_id.get(shopify_order_id) or {}
                for item in source_order.get("line_items") or []:
                    if not item.get("shopify_line_item_id"):
                        continue
                    line_item_rows.append(
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
                    )

            for line_item_batch in self._chunk_rows(line_item_rows, batch_size=500):
                try:
                    client.table("shopify_order_line_items").insert(line_item_batch).execute()
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

    def fetch_chat_session_customer_identifier(self, session_id: Optional[str]) -> Optional[str]:
        if not session_id:
            return None

        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is not None and merchant_id:
            try:
                response = (
                    client.table("chat_sessions")
                    .select("customer_identifier")
                    .eq("merchant_id", merchant_id)
                    .eq("id", session_id)
                    .limit(1)
                    .execute()
                )
                row = (response.data or [None])[0]
                if row and row.get("customer_identifier"):
                    return str(row.get("customer_identifier")).strip() or None
            except Exception as error:
                logger.warning("Chat session customer lookup fell back. %s", error)

        fallback_context = self.fetch_chat_session_context(session_id)
        if fallback_context and fallback_context.customerIdentifier:
            return str(fallback_context.customerIdentifier).strip() or None

        return None

    def fetch_chat_session_context(self, session_id: Optional[str]) -> Optional[ChatSessionContext]:
        if not session_id:
            return None

        client = self.get_client()
        merchant_id = self.get_default_merchant_id()

        if client is not None and merchant_id:
            try:
                response = (
                    client.table("chat_sessions")
                    .select("id, customer_identifier, active_profile_id, selected_service, last_entry_mode, updated_at")
                    .eq("merchant_id", merchant_id)
                    .eq("id", session_id)
                    .limit(1)
                    .execute()
                )
                row = (response.data or [None])[0]
                if row:
                    context = ChatSessionContext(
                        sessionId=row.get("id") or session_id,
                        customerIdentifier=row.get("customer_identifier"),
                        activeProfileId=row.get("active_profile_id"),
                        selectedService=row.get("selected_service"),
                        lastEntryMode=row.get("last_entry_mode"),
                        updatedAt=row.get("updated_at"),
                    )
                    self._chat_session_context_cache[
                        self._chat_session_context_cache_key(merchant_id, context.sessionId)
                    ] = context.model_dump()
                    return context
            except Exception as error:
                logger.warning("Chat session context lookup fell back. %s", error)

        return self._read_chat_session_context_fallback(merchant_id, session_id)

    def update_chat_session_context(
        self,
        session_id: Optional[str],
        *,
        customer_identifier: Optional[str] = None,
        active_profile_id: Optional[str] = None,
        selected_service: Optional[str] = None,
        last_entry_mode: Optional[str] = None,
    ) -> Optional[ChatSessionContext]:
        if not session_id:
            return None

        merchant_id = self.get_default_merchant_id()
        timestamp = datetime.now(timezone.utc).isoformat()
        existing = self.fetch_chat_session_context(session_id)
        payload = existing.model_dump() if existing else {"sessionId": session_id}

        if customer_identifier is not None:
            payload["customerIdentifier"] = str(customer_identifier).strip() or None
        if active_profile_id is not None:
            payload["activeProfileId"] = str(active_profile_id).strip() or None
        if selected_service is not None:
            payload["selectedService"] = str(selected_service).strip() or None
        if last_entry_mode is not None:
            payload["lastEntryMode"] = str(last_entry_mode).strip() or None
        payload["updatedAt"] = timestamp

        session_context = ChatSessionContext(**payload)
        client = self.get_client()

        if client is not None and merchant_id:
            try:
                (
                    client.table("chat_sessions")
                    .update(
                        {
                            "customer_identifier": session_context.customerIdentifier,
                            "active_profile_id": session_context.activeProfileId,
                            "selected_service": session_context.selectedService,
                            "last_entry_mode": session_context.lastEntryMode,
                            "updated_at": timestamp,
                        }
                    )
                    .eq("merchant_id", merchant_id)
                    .eq("id", session_id)
                    .execute()
                )
                self._chat_session_context_cache[
                    self._chat_session_context_cache_key(merchant_id, session_context.sessionId)
                ] = session_context.model_dump()
                return session_context
            except Exception as error:
                logger.warning("Chat session context update fell back. %s", error)

        return self._write_chat_session_context_fallback(merchant_id, session_context)

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

    def fetch_session_messages(self, session_id: Optional[str], limit: int = 10) -> list[dict]:
        client = self.get_client()

        if client is None or not session_id:
            return []

        try:
            response = (
                client.table("chat_messages")
                .select("sender, message, mode, created_at")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(response.data or []))
        except Exception:
            return []

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

    def fetch_session_events(self, session_id: Optional[str], limit: int = 12) -> list[dict]:
        client = self.get_client()

        if client is None or not session_id:
            return []

        try:
            response = (
                client.table("recommendation_events")
                .select("event_type, input_summary, created_at, recommended_product_ids")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return list(reversed(response.data or []))
        except Exception:
            return []

    def create_support_request(
        self,
        *,
        session_id: Optional[str],
        customer_identifier: Optional[str],
        shopper_email: Optional[str],
        shopper_phone: Optional[str],
        order_reference: Optional[str],
        issue_summary: str,
        transcript_excerpt: str,
        assigned_contacts: list[SupportContact],
    ) -> SupportRequestRecord:
        client = self.get_client()
        merchant_id = self.get_default_merchant_id()
        support_request_id = str(uuid4())
        assigned_payload = [
            {
                "name": item.name,
                "role": item.role,
                "email": item.email,
                "phone": item.phone,
                "timezone": item.timezone,
                "shift_days": item.shift_days,
                "shift_start": item.shift_start,
                "shift_end": item.shift_end,
                "active": item.active,
            }
            for item in assigned_contacts
        ]

        if client is not None and merchant_id:
            try:
                (
                    client.table("support_requests")
                    .insert(
                        {
                            "id": support_request_id,
                            "merchant_id": merchant_id,
                            "session_id": session_id,
                            "customer_identifier": customer_identifier,
                            "shopper_email": shopper_email,
                            "shopper_phone": shopper_phone,
                            "order_reference": order_reference,
                            "issue_summary": issue_summary,
                            "transcript_excerpt": transcript_excerpt,
                            "assigned_contacts": assigned_payload,
                            "status": "open",
                            "notification_status": "pending",
                        }
                    )
                    .execute()
                )
                return SupportRequestRecord(
                    id=support_request_id,
                    status="open",
                    persisted=True,
                    assigned_contacts=assigned_contacts,
                )
            except Exception as error:
                logger.warning("Support request insert failed. Falling back to event log. %s", error)

        self.log_recommendation_event(
            event_type="human_handoff_request",
            input_summary=issue_summary,
            recommended_product_ids=[],
            session_id=session_id,
        )
        return SupportRequestRecord(
            id=support_request_id,
            status="open",
            persisted=False,
            assigned_contacts=assigned_contacts,
        )

    def fetch_latest_support_request(self, session_id: Optional[str]) -> Optional[dict]:
        client = self.get_client()

        if client is None or not session_id:
            return None

        try:
            response = (
                client.table("support_requests")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if response.data:
                return response.data[0]
        except Exception:
            return None

        return None

    def update_support_request(
        self,
        support_request_id: str,
        *,
        shopper_email: Optional[str] = None,
        shopper_phone: Optional[str] = None,
        order_reference: Optional[str] = None,
        issue_summary: Optional[str] = None,
        transcript_excerpt: Optional[str] = None,
        notification_status: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        client = self.get_client()

        if client is None or not support_request_id:
            return False

        update_payload = {}
        if shopper_email:
            update_payload["shopper_email"] = shopper_email
        if shopper_phone:
            update_payload["shopper_phone"] = shopper_phone
        if order_reference:
            update_payload["order_reference"] = order_reference
        if issue_summary:
            update_payload["issue_summary"] = issue_summary
        if transcript_excerpt:
            update_payload["transcript_excerpt"] = transcript_excerpt
        if notification_status:
            update_payload["notification_status"] = notification_status
        if metadata is not None:
            update_payload["metadata"] = metadata

        if not update_payload:
            return False

        try:
            (
                client.table("support_requests")
                .update(update_payload)
                .eq("id", support_request_id)
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
                [
                    item
                    for item in event_rows
                    if item.get("event_type") in {"support_question", "order_tracking", "human_handoff"}
                ]
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
                        [
                            item
                            for item in event_rows
                            if item.get("event_type") in {"support_question", "order_tracking", "human_handoff"}
                        ]
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

    def _build_ai_stack_status(self) -> AIStackStatus:
        try:
            from app.services.langchain_service import LangChainService
            from app.services.vision_service import VisionService

            langchain_status = LangChainService().runtime_status()
            vision_status = VisionService().runtime_status()
        except Exception as error:
            logger.warning("AI stack status check failed. %s", error)
            return AIStackStatus(
                openai_ready=bool(settings.openai_api_key),
                langchain_ready=False,
                langchain_tools_ready=False,
                vision_ready=False,
                vision_mode="fallback",
                shopper_routing_active=True,
                support_routing_active=True,
                image_reasoning_active=True,
                summary="AI stack status is unavailable right now, but the fallback recommendation path is still active.",
            )

        openai_ready = bool(settings.openai_api_key)
        summary_parts = []
        if langchain_status.langchain_ready:
            summary_parts.append("LangChain orchestration is live")
        else:
            summary_parts.append("LangChain is falling back to the direct service layer")
        if vision_status.vision_ready:
            summary_parts.append(f"Google Vision is active via {vision_status.vision_mode}")
        else:
            summary_parts.append("Google Vision is using local fallback analysis")

        return AIStackStatus(
            openai_ready=openai_ready,
            langchain_ready=langchain_status.langchain_ready,
            langchain_tools_ready=langchain_status.langchain_tools_ready,
            vision_ready=vision_status.vision_ready,
            vision_mode=vision_status.vision_mode,
            shopper_routing_active=True,
            support_routing_active=True,
            image_reasoning_active=True,
            summary=". ".join(summary_parts) + ".",
        )

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
            "order_tracking": "Order tracking request handled",
            "human_handoff": "Support handoff triggered",
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
