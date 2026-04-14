from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    CatalogIntelligence,
    CatalogSuggestionResponse,
    ChatbotCustomization,
    CustomerCarePayload,
    KnowledgeBasePayload,
    LookManagementPayload,
    LookBuilderRequest,
    LookBuilderResponse,
    MerchantChatbotVoiceConfig,
    MerchantStyleProfilesResponse,
    MerchantStoreProfile,
    MerchantWorkspaceSnapshot,
    ProductDescriptionApplyRequest,
    ProductDescriptionDraftRequest,
    ProductDescriptionDraftResponse,
    SaveResponse,
    ShopifyCapabilitySnapshot,
)
from app.services.openai_service import OpenAIService
from app.services.recommendation_service import RecommendationService
from app.services.shopify_service import ShopifyService
from app.services.supabase_service import SupabaseService
from app.services.vision_service import VisionService


router = APIRouter(tags=["merchant"])
supabase_service = SupabaseService()
openai_service = OpenAIService()
recommendation_service = RecommendationService()
shopify_service = ShopifyService()
vision_service = VisionService()


@router.get("/api/merchant/workspace", response_model=MerchantWorkspaceSnapshot)
def get_merchant_workspace() -> MerchantWorkspaceSnapshot:
    return supabase_service.fetch_workspace_snapshot()


@router.get("/api/merchant/shopify-capabilities", response_model=ShopifyCapabilitySnapshot)
def get_shopify_capabilities() -> ShopifyCapabilitySnapshot:
    api_base_url = (settings.shopify_app_url or "").strip() or None
    recent_order = supabase_service.fetch_recent_order_summary()
    setup_checks = [
        {
            "key": "app_embed_enabled",
            "label": "App embed enabled",
            "status": "monitor",
            "state_label": "Manual check",
            "detail": "Confirm that StyledGenie Chat is enabled in Online Store > Themes > Customize > App embeds.",
        },
        {
            "key": "api_base_configured",
            "label": "Backend API base",
            "status": "live" if api_base_url else "needs-setup",
            "state_label": "Configured" if api_base_url else "Needs setup",
            "detail": (
                f"Set the app embed's Backend API Base URL to {api_base_url}."
                if api_base_url
                else "Add the public app URL in the Shopify app config, then use that same URL in the app embed's Backend API Base URL setting."
            ),
        },
        {
            "key": "recent_order_available",
            "label": "Recent order available",
            "status": "live" if recent_order else "needs-setup",
            "state_label": "Available" if recent_order else "No recent order",
            "detail": (
                f"Latest synced order: {recent_order.get('order_name')}."
                if recent_order and recent_order.get("order_name")
                else "Create or sync a recent dev-store order so customer-care tracking can be tested end to end."
            ),
        },
    ]

    try:
        scopes = shopify_service.fetch_access_scopes()
        granted_scopes = sorted(item.get("handle") for item in scopes if item.get("handle"))
        write_products_ready = "write_products" in granted_scopes
        message = (
            "Shopify product updates are ready."
            if write_products_ready
            else "Approve `write_products` on the connected store before applying product descriptions."
        )
        return ShopifyCapabilitySnapshot(
            write_products_ready=write_products_ready,
            granted_scopes=granted_scopes,
            message=message,
            api_base_url=api_base_url,
            setup_checks=setup_checks,
        )
    except ValueError as error:
        return ShopifyCapabilitySnapshot(
            write_products_ready=False,
            granted_scopes=[],
            message=str(error),
            api_base_url=api_base_url,
            setup_checks=setup_checks,
        )


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


@router.get("/api/merchant/chatbot/voice-config", response_model=MerchantChatbotVoiceConfig)
def get_chatbot_voice_config() -> MerchantChatbotVoiceConfig:
    return supabase_service.fetch_chatbot_voice_config()


@router.put("/api/merchant/chatbot/voice-config", response_model=MerchantChatbotVoiceConfig)
def update_chatbot_voice_config(voice_config: MerchantChatbotVoiceConfig) -> MerchantChatbotVoiceConfig:
    if not supabase_service.update_chatbot_voice_config(voice_config):
        raise HTTPException(status_code=500, detail="Could not save chatbot voice config.")

    return supabase_service.fetch_chatbot_voice_config()


@router.get("/api/merchant/style-profiles", response_model=MerchantStyleProfilesResponse)
def get_merchant_style_profiles() -> MerchantStyleProfilesResponse:
    return supabase_service.fetch_merchant_style_profiles()


@router.put("/api/merchant/catalog-intelligence", response_model=SaveResponse)
def update_catalog_intelligence(intelligence: CatalogIntelligence) -> SaveResponse:
    if not supabase_service.update_catalog_intelligence(intelligence):
        raise HTTPException(status_code=500, detail="Could not save catalog intelligence.")

    return SaveResponse(message="Catalog intelligence saved.")


@router.post("/api/merchant/catalog-intelligence-suggestions", response_model=CatalogSuggestionResponse)
def generate_catalog_intelligence_suggestions() -> CatalogSuggestionResponse:
    products = [
        item
        for item in supabase_service.fetch_catalog_products()
        if item.get("title") and (item.get("image_url") or item.get("category"))
    ]
    if not products:
        raise HTTPException(status_code=404, detail="No synced catalog products are available yet. Sync the store first.")

    products_with_images = [item for item in products if item.get("image_url")]
    sample_products = (products_with_images[:8] if products_with_images else products[:8])

    vision_snapshots = []
    for product in sample_products:
        image_reference = product.get("image_url") or product.get("title") or product.get("category") or "product"
        analysis = vision_service.analyze_image(image_reference)
        vision_snapshots.append(
            {
                "title": product.get("title"),
                "category": product.get("category"),
                "source": analysis.source,
                "summary": analysis.summary,
                "detected_tags": analysis.detected_tags,
                "apparel_cues": analysis.apparel_cues,
                "style_cues": analysis.style_cues,
                "colors": analysis.colors,
            }
        )

    return openai_service.generate_catalog_intelligence_suggestions(sample_products, vision_snapshots)


@router.put("/api/merchant/look-management", response_model=SaveResponse)
def update_look_management(payload: LookManagementPayload) -> SaveResponse:
    if not supabase_service.replace_curated_looks(payload.items):
        raise HTTPException(status_code=500, detail="Could not save curated looks.")

    return SaveResponse(message="Look management saved.")


@router.put("/api/merchant/customer-care", response_model=SaveResponse)
def update_customer_care(payload: CustomerCarePayload) -> SaveResponse:
    if not supabase_service.replace_customer_care_faqs(payload.items):
        raise HTTPException(status_code=500, detail="Could not save customer care setup.")

    if not supabase_service.update_customer_care_settings(payload.settings):
        raise HTTPException(status_code=500, detail="Could not save customer care setup.")

    return SaveResponse(message="Customer care setup saved.")


@router.put("/api/merchant/knowledge-base", response_model=SaveResponse)
def update_knowledge_base(payload: KnowledgeBasePayload) -> SaveResponse:
    if not supabase_service.replace_knowledge_base_entries(payload.items):
        raise HTTPException(status_code=500, detail="Could not save knowledge and AI training.")

    return SaveResponse(message="Knowledge and AI training saved.")


@router.post("/api/merchant/product-description-draft", response_model=ProductDescriptionDraftResponse)
def generate_product_description(payload: ProductDescriptionDraftRequest) -> ProductDescriptionDraftResponse:
    product = supabase_service.find_catalog_product_by_id(payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found in the synced catalog.")

    draft = openai_service.generate_product_description(product)
    return ProductDescriptionDraftResponse(
        product_id=payload.product_id,
        product_title=product.get("title") or "Untitled product",
        draft=draft,
        applied_to_shopify=False,
        message="Description draft generated.",
    )


@router.post("/api/merchant/product-description-apply", response_model=ProductDescriptionDraftResponse)
def apply_product_description(payload: ProductDescriptionApplyRequest) -> ProductDescriptionDraftResponse:
    product = supabase_service.find_catalog_product_by_id(payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found in the synced catalog.")

    try:
        shopify_service.update_product_description(
            product.get("shopify_product_id") or "",
            payload.draft,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return ProductDescriptionDraftResponse(
        product_id=payload.product_id,
        product_title=product.get("title") or "Untitled product",
        draft=payload.draft,
        applied_to_shopify=True,
        message="Description applied to Shopify.",
    )


@router.post("/api/merchant/look-builder", response_model=LookBuilderResponse)
def generate_look_builder(payload: LookBuilderRequest) -> LookBuilderResponse:
    hero_product = supabase_service.find_catalog_product_by_id(payload.hero_product_id)
    if not hero_product:
        raise HTTPException(status_code=404, detail="Hero product not found in the synced catalog.")

    hero_segment = recommendation_service.normalize_product_segment(hero_product)
    if hero_segment not in {"menswear", "womenswear"}:
        raise HTTPException(
            status_code=400,
            detail="Hero product segment is ambiguous. Add clearer menswear or womenswear signals before generating looks.",
        )

    search_terms = [
        hero_product.get("title") or "",
        hero_product.get("category") or "",
        *list(hero_product.get("tags") or [])[:4],
        payload.occasion_hint or "",
    ]
    candidate_products = recommendation_service.recommend_products(
        terms=[term for term in search_terms if term],
        complementary=True,
        limit=6,
        query_text=f"{payload.occasion_hint or ''} {hero_product.get('title') or ''}".strip(),
        exclude_product_ids=[payload.hero_product_id],
        required_segment=hero_segment,
    )
    look_items = openai_service.generate_look_builder(hero_product, candidate_products, payload.occasion_hint, hero_segment)

    return LookBuilderResponse(
        hero_product_id=payload.hero_product_id,
        hero_product_title=hero_product.get("title") or "Hero product",
        items=look_items,
        message="Generated look drafts. Review them in Look Management before saving.",
    )
