"""Public, read-only config for the storefront chat widget (no staff contacts, no analytics)."""

from fastapi import APIRouter

from app.config import settings
from app.services.supabase_service import SupabaseService

router = APIRouter(tags=["storefront"])
supabase_service = SupabaseService()


@router.get("/api/storefront/config")
def storefront_config() -> dict:
    workspace = supabase_service.fetch_workspace_snapshot()
    care = workspace.customer_care_settings
    return {
        "chatbot_customization": workspace.chatbot_customization.model_dump(),
        "support": {
            "support_email": care.support_email,
            "human_handoff_enabled": care.human_handoff_enabled,
            "order_tracking_enabled": care.order_tracking_enabled,
            "response_time": settings.support_response_time,
        },
    }
