from fastapi import APIRouter, HTTPException, Request

from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    ChatbotCustomization,
    FeedbackRequest,
    ImageRequest,
    OnboardingScanAnalysisResponse,
    RecommendationRefineRequest,
    SaveResponse,
)
from app.services.conversation_service import ConversationService
from app.services.supabase_service import SupabaseService
from app.services.support_guard import (
    client_ip_from_request,
    current_client_ip,
    current_visitor_id,
    enforce_chat_rate_limit,
    normalize_visitor_id,
)


router = APIRouter(tags=["chat"])


def _guard(request: Request, payload) -> None:
    """Give every request its own visitor id and apply rate limits before any work happens."""
    visitor_id = normalize_visitor_id(getattr(payload, "customer_id", None))
    payload.customer_id = visitor_id
    client_ip = client_ip_from_request(request)
    current_client_ip.set(client_ip)
    current_visitor_id.set(visitor_id)
    enforce_chat_rate_limit(visitor_id, client_ip)
conversation_service = ConversationService()
supabase_service = SupabaseService()


@router.get("/api/storefront/config", response_model=dict[str, ChatbotCustomization])
def get_storefront_config() -> dict[str, ChatbotCustomization]:
    return {"chatbot_customization": supabase_service.fetch_public_chatbot_customization()}


@router.post("/api/chat", response_model=ChatResponse)
def chat(request: Request, payload: ChatRequest) -> ChatResponse:
    _guard(request, payload)
    return conversation_service.handle_text_chat(payload)


@router.post("/api/inspire", response_model=ChatResponse)
def inspire(request: Request, payload: ImageRequest) -> ChatResponse:
    _guard(request, payload)
    return conversation_service.handle_image_chat(payload, "get_inspired")


@router.post("/api/onboarding/analyze-scan", response_model=OnboardingScanAnalysisResponse)
def analyze_onboarding_scan(request: Request, payload: ImageRequest) -> OnboardingScanAnalysisResponse:
    _guard(request, payload)
    return conversation_service.analyze_onboarding_scan(payload)


@router.post("/api/support-image", response_model=ChatResponse)
def support_image(request: Request, payload: ImageRequest) -> ChatResponse:
    _guard(request, payload)
    return conversation_service.handle_support_image(payload)


@router.post("/api/feedback", response_model=SaveResponse)
def save_feedback(request: Request, payload: FeedbackRequest) -> SaveResponse:
    _guard(request, payload)
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
def refine_chat(request: Request, payload: RecommendationRefineRequest) -> ChatResponse:
    _guard(request, payload)
    return conversation_service.refine_recommendations(payload)


@router.post("/api/complete-look", response_model=ChatResponse)
def complete_look(request: Request, payload: ImageRequest) -> ChatResponse:
    _guard(request, payload)
    return conversation_service.handle_image_chat(payload, "complete_the_look")
