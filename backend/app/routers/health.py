from fastapi import APIRouter

from app.config import settings
from app.services.langchain_service import LangChainService
from app.services.vision_service import VisionService


router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/runtime/status")
def runtime_status() -> dict[str, object]:
    """Expose connection readiness without ever returning credentials."""
    langchain = LangChainService().runtime_status()
    vision = VisionService().runtime_status()
    shop_domain = (settings.shopify_store_domain or "").lower().strip()
    store_handle = shop_domain.removesuffix(".myshopify.com")
    merchant_admin_url = (
        f"https://admin.shopify.com/store/{store_handle}/apps/{settings.shopify_client_id}/app"
        if store_handle and settings.shopify_client_id
        else None
    )
    return {
        "status": "ready" if settings.openai_api_key and vision.vision_ready else "configuration_required",
        "openai_ready": bool(settings.openai_api_key),
        "openai_model": settings.openai_model,
        "google_vision_ready": vision.vision_ready,
        "google_vision_mode": vision.vision_mode,
        "langchain_ready": langchain.langchain_ready,
        "merchant_admin_url": merchant_admin_url,
    }

