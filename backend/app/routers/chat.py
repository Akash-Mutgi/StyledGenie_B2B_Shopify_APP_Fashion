from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    FeedbackRequest,
    ImageRequest,
    OnboardingScanAnalysisResponse,
    RecommendationRefineRequest,
    SaveResponse,
)
from app.services.conversation_service import ConversationService
from app.services.supabase_service import SupabaseService


router = APIRouter(tags=["chat"])
conversation_service = ConversationService()
supabase_service = SupabaseService()


@router.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    return conversation_service.handle_text_chat(payload)


@router.post("/api/inspire", response_model=ChatResponse)
def inspire(payload: ImageRequest) -> ChatResponse:
    return conversation_service.handle_image_chat(payload, "get_inspired")


@router.post("/api/onboarding/analyze-scan", response_model=OnboardingScanAnalysisResponse)
def analyze_onboarding_scan(payload: ImageRequest) -> OnboardingScanAnalysisResponse:
    return conversation_service.analyze_onboarding_scan(payload)


@router.post("/api/support-image", response_model=ChatResponse)
def support_image(payload: ImageRequest) -> ChatResponse:
    return conversation_service.handle_support_image(payload)


@router.post("/api/feedback", response_model=SaveResponse)
def save_feedback(payload: FeedbackRequest) -> SaveResponse:
    logged = supabase_service.log_feedback_event(
        feedback_type=payload.feedback_type,
        mode=payload.mode,
        context_note=payload.context_note,
        recommended_product_ids=payload.recommended_product_ids,
        customer_identifier=payload.customer_id,
    )

    if not logged:
        raise HTTPException(status_code=500, detail="Feedback could not be saved.")

    return SaveResponse(message="Feedback saved.")


@router.post("/api/chat/refine", response_model=ChatResponse)
def refine_chat(payload: RecommendationRefineRequest) -> ChatResponse:
    return conversation_service.refine_recommendations(payload)


@router.post("/api/complete-look", response_model=ChatResponse)
def complete_look(payload: ImageRequest) -> ChatResponse:
    return conversation_service.handle_image_chat(payload, "complete_the_look")
