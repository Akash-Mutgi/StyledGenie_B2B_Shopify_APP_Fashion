from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CatalogIntelligence,
    ChatbotCustomization,
    CustomerCarePayload,
    KnowledgeBasePayload,
    LookManagementPayload,
    MerchantStoreProfile,
    MerchantWorkspaceSnapshot,
    SaveResponse,
)
from app.services.supabase_service import SupabaseService


router = APIRouter(tags=["merchant"])
supabase_service = SupabaseService()


@router.get("/api/merchant/workspace", response_model=MerchantWorkspaceSnapshot)
def get_merchant_workspace() -> MerchantWorkspaceSnapshot:
    return supabase_service.fetch_workspace_snapshot()


@router.put("/api/merchant/profile", response_model=SaveResponse)
def update_merchant_profile(profile: MerchantStoreProfile) -> SaveResponse:
    if not supabase_service.update_merchant_profile(profile):
        raise HTTPException(status_code=500, detail="Could not save merchant profile.")

    return SaveResponse(message="Merchant profile saved.")


@router.put("/api/merchant/chatbot-customization", response_model=SaveResponse)
def update_chatbot_customization(customization: ChatbotCustomization) -> SaveResponse:
    if not supabase_service.update_chatbot_customization(customization):
        raise HTTPException(status_code=500, detail="Could not save chatbot customization.")

    return SaveResponse(message="Chatbot customization saved.")


@router.put("/api/merchant/catalog-intelligence", response_model=SaveResponse)
def update_catalog_intelligence(intelligence: CatalogIntelligence) -> SaveResponse:
    if not supabase_service.update_catalog_intelligence(intelligence):
        raise HTTPException(status_code=500, detail="Could not save catalog intelligence.")

    return SaveResponse(message="Catalog intelligence saved.")


@router.put("/api/merchant/look-management", response_model=SaveResponse)
def update_look_management(payload: LookManagementPayload) -> SaveResponse:
    if not supabase_service.replace_curated_looks(payload.items):
        raise HTTPException(status_code=500, detail="Could not save curated looks.")

    return SaveResponse(message="Look management saved.")


@router.put("/api/merchant/customer-care", response_model=SaveResponse)
def update_customer_care(payload: CustomerCarePayload) -> SaveResponse:
    if not supabase_service.replace_customer_care_faqs(payload.items):
        raise HTTPException(status_code=500, detail="Could not save customer care setup.")

    return SaveResponse(message="Customer care setup saved.")


@router.put("/api/merchant/knowledge-base", response_model=SaveResponse)
def update_knowledge_base(payload: KnowledgeBasePayload) -> SaveResponse:
    if not supabase_service.replace_knowledge_base_entries(payload.items):
        raise HTTPException(status_code=500, detail="Could not save knowledge and AI training.")

    return SaveResponse(message="Knowledge and AI training saved.")
