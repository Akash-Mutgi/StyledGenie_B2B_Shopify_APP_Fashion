from dataclasses import dataclass
import os
from typing import Optional

from dotenv import load_dotenv


load_dotenv()


@dataclass
class Settings:
    app_name: str = "StyledGenie API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    shopify_api_version: str = os.getenv("SHOPIFY_API_VERSION", "2026-01")
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5-mini")
    supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
    supabase_anon_key: Optional[str] = os.getenv("SUPABASE_ANON_KEY")
    supabase_service_role_key: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    default_merchant_id: Optional[str] = os.getenv("DEFAULT_MERCHANT_ID")
    google_vision_api_key: Optional[str] = os.getenv("GOOGLE_VISION_API_KEY")
    shopify_app_name: Optional[str] = os.getenv("SHOPIFY_APP_NAME")
    shopify_app_url: Optional[str] = os.getenv("SHOPIFY_APP_URL")
    shopify_store_domain: Optional[str] = os.getenv("SHOPIFY_STORE_DOMAIN")
    shopify_storefront_domain: Optional[str] = os.getenv("SHOPIFY_STOREFRONT_DOMAIN")
    shopify_client_id: Optional[str] = os.getenv("SHOPIFY_CLIENT_ID")
    shopify_client_secret: Optional[str] = os.getenv("SHOPIFY_CLIENT_SECRET")
    shopify_admin_access_token: Optional[str] = os.getenv("SHOPIFY_ADMIN_ACCESS_TOKEN")
    shopify_orders_lookback_days: int = int(os.getenv("SHOPIFY_ORDERS_LOOKBACK_DAYS", "60"))


settings = Settings()
