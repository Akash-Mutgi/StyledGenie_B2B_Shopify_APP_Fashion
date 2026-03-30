from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse, FeedbackRequest, ImageRequest, SaveResponse
from app.services.faq_service import FAQService
from app.services.openai_service import OpenAIService
from app.services.recommendation_service import RecommendationService
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionService


router = APIRouter(tags=["chat"])
openai_service = OpenAIService()
vision_service = VisionService()
recommendation_service = RecommendationService()
faq_service = FAQService()
supabase_service = SupabaseService()


@router.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=payload.message,
        mode=payload.mode,
    )

    if payload.mode == "support":
        reply = faq_service.answer_question(payload.message)
        supabase_service.log_recommendation_event(
            event_type="support_question",
            input_summary=payload.message,
            recommended_product_ids=[],
            session_id=session_id,
        )
        supabase_service.log_chat_message(
            session_id=session_id,
            sender="assistant",
            message=reply,
            mode=payload.mode,
        )
        return ChatResponse(
            reply=reply,
            recommended_products=[],
            styling_insights=[],
        )

    keywords = [word.strip(".,!?").lower() for word in payload.message.split() if len(word) > 3]
    candidate_products = recommendation_service.recommend_products(keywords, limit=8)
    reply, recommendations, styling_insights = openai_service.style_recommendations(
        mode=payload.mode,
        shopper_message=payload.message,
        detected_tags=[],
        candidate_products=candidate_products,
    )
    supabase_service.log_recommendation_event(
        event_type=payload.mode,
        input_summary=payload.message,
        recommended_product_ids=[item.id for item in recommendations],
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=reply,
        mode=payload.mode,
    )
    return ChatResponse(
        reply=reply,
        recommended_products=recommendations,
        styling_insights=styling_insights,
    )


@router.post("/api/inspire", response_model=ChatResponse)
def inspire(payload: ImageRequest) -> ChatResponse:
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    shopper_message = f"Get inspired image uploaded: {payload.image_name}"
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=shopper_message,
        mode="get_inspired",
    )

    detected_tags = vision_service.detect_fashion_elements(payload.image_name)
    candidate_products = recommendation_service.recommend_products(detected_tags, limit=8)
    reply, recommendations, styling_insights = openai_service.style_recommendations(
        mode="get_inspired",
        shopper_message="Image-based inspiration request",
        detected_tags=detected_tags,
        candidate_products=candidate_products,
    )
    recommended_product_ids = [item.id for item in recommendations]
    supabase_service.log_recommendation_event(
        event_type="get_inspired",
        input_summary=payload.image_name,
        recommended_product_ids=recommended_product_ids,
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=reply,
        mode="get_inspired",
    )
    return ChatResponse(
        reply=reply,
        detected_tags=detected_tags,
        recommended_products=recommendations,
        styling_insights=styling_insights,
    )


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
    session_id = supabase_service.ensure_chat_session(payload.customer_id)
    shopper_message = f"Complete the look image uploaded: {payload.image_name}"
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="customer",
        message=shopper_message,
        mode="complete_the_look",
    )

    detected_tags = vision_service.detect_fashion_elements(payload.image_name)
    candidate_products = recommendation_service.recommend_products(detected_tags, complementary=True, limit=8)
    reply, recommendations, styling_insights = openai_service.style_recommendations(
        mode="complete_the_look",
        shopper_message="Complete the look request",
        detected_tags=detected_tags,
        candidate_products=candidate_products,
    )
    recommended_product_ids = [item.id for item in recommendations]
    supabase_service.log_recommendation_event(
        event_type="complete_the_look",
        input_summary=payload.image_name,
        recommended_product_ids=recommended_product_ids,
        session_id=session_id,
    )
    supabase_service.log_chat_message(
        session_id=session_id,
        sender="assistant",
        message=reply,
        mode="complete_the_look",
    )
    return ChatResponse(
        reply=reply,
        detected_tags=detected_tags,
        recommended_products=recommendations,
        styling_insights=styling_insights,
    )
