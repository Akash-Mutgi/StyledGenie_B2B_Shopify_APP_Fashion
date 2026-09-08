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
    return {
        "status": "ready" if settings.openai_api_key and vision.vision_ready else "configuration_required",
        "openai_ready": bool(settings.openai_api_key),
        "openai_model": settings.openai_model,
        "google_vision_ready": vision.vision_ready,
        "google_vision_mode": vision.vision_mode,
        "langchain_ready": langchain.langchain_ready,
    }

