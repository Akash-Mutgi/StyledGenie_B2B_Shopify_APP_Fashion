from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse, FeedbackRequest, ImageRequest, SaveResponse
from app.services.styledgenie_service import StyledGenieService
from app.services.supabase_service import SupabaseService


router = APIRouter(tags=["chat"])
styledgenie_service = StyledGenieService()
supabase_service = SupabaseService()


@router.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    response = styledgenie_service.handle_chat(payload)
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=payload.message,
        mode=response.mode,
    )
    supabase_service.log_recommendation_event(
        event_type="support_question" if response.support_mode else response.mode,
        input_summary=payload.message,
        recommended_product_ids=[item.id for item in response.recommended_products],
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=response.reply,
        mode=response.mode,
    )
    return response


@router.post("/api/inspire", response_model=ChatResponse)
def inspire(payload: ImageRequest) -> ChatResponse:
    response = styledgenie_service.handle_image_request("get_inspired", payload)
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    shopper_message = payload.shopper_note or f"Get inspired image uploaded: {payload.image_name}"
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=shopper_message,
        mode="get_inspired",
    )
    supabase_service.log_recommendation_event(
        event_type="get_inspired",
        input_summary=payload.image_name if not payload.shopper_note else f"{payload.image_name} | {payload.shopper_note}",
        recommended_product_ids=[item.id for item in response.recommended_products],
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=response.reply,
        mode="get_inspired",
    )
    return response


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


@router.post("/api/complete-look", response_model=ChatResponse)
def complete_look(payload: ImageRequest) -> ChatResponse:
    response = styledgenie_service.handle_image_request("complete_the_look", payload)
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    shopper_message = payload.shopper_note or f"Complete the look image uploaded: {payload.image_name}"
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=shopper_message,
        mode="complete_the_look",
    )

    supabase_service.log_recommendation_event(
        event_type="complete_the_look",
        input_summary=payload.image_name if not payload.shopper_note else f"{payload.image_name} | {payload.shopper_note}",
        recommended_product_ids=[item.id for item in response.recommended_products],
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=response.reply,
        mode="complete_the_look",
    )
    return response
