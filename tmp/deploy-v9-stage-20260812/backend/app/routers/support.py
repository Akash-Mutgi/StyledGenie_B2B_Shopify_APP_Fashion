from fastapi import APIRouter

from app.models.schemas import FAQListResponse
from app.services.faq_service import FAQService


router = APIRouter(tags=["support"])
faq_service = FAQService()


@router.get("/api/support/faqs", response_model=FAQListResponse)
def get_faqs() -> FAQListResponse:
    return FAQListResponse(items=faq_service.get_faqs())
