from dataclasses import dataclass
import os
from typing import Optional

from dotenv import load_dotenv


load_dotenv()


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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
    google_application_credentials: Optional[str] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    google_service_account_json: Optional[str] = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    google_cloud_project: Optional[str] = os.getenv("GOOGLE_CLOUD_PROJECT")
    shopify_app_name: Optional[str] = os.getenv("SHOPIFY_APP_NAME")
    shopify_app_url: Optional[str] = os.getenv("SHOPIFY_APP_URL")
    shopify_store_domain: Optional[str] = os.getenv("SHOPIFY_STORE_DOMAIN")
    shopify_storefront_domain: Optional[str] = os.getenv("SHOPIFY_STOREFRONT_DOMAIN")
    shopify_client_id: Optional[str] = os.getenv("SHOPIFY_CLIENT_ID")
    shopify_client_secret: Optional[str] = os.getenv("SHOPIFY_CLIENT_SECRET")
    shopify_admin_access_token: Optional[str] = os.getenv("SHOPIFY_ADMIN_ACCESS_TOKEN")
    shopify_orders_lookback_days: int = int(os.getenv("SHOPIFY_ORDERS_LOOKBACK_DAYS", "60"))
    smtp_host: Optional[str] = os.getenv("SMTP_HOST")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: Optional[str] = os.getenv("SMTP_USERNAME")
    smtp_password: Optional[str] = os.getenv("SMTP_PASSWORD")
    smtp_from_email: Optional[str] = os.getenv("SMTP_FROM_EMAIL")
    smtp_reply_to: Optional[str] = os.getenv("SMTP_REPLY_TO")
    smtp_use_tls: bool = _env_flag("SMTP_USE_TLS", True)
    smtp_use_ssl: bool = _env_flag("SMTP_USE_SSL", False)
    twilio_account_sid: Optional[str] = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_auth_token: Optional[str] = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_whatsapp_from: Optional[str] = os.getenv("TWILIO_WHATSAPP_FROM")


settings = Settings()
