from typing import Optional

from pydantic import BaseModel, Field


class ProductRecommendation(BaseModel):
    id: str
    title: str
    category: str
    reason: str
    segment: Optional[str] = None
    role: Optional[str] = None
    support_slot: Optional[str] = None
    match_label: Optional[str] = None
    match_badges: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    price: Optional[str] = None
    product_url: Optional[str] = None
    cart_variant_id: Optional[str] = None


class ShopperProfileInput(BaseModel):
    segment: Optional[str] = None
    occasion: Optional[str] = None
    weather: Optional[str] = None
    budget: Optional[str] = None
    priority: Optional[str] = None
    feel: Optional[str] = None
    color_preference: Optional[str] = None
    fit_preference: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "outfit_curation"
    customer_id: Optional[str] = None
    exclude_product_ids: list[str] = Field(default_factory=list)
    refinement_feedback_type: Optional[str] = None
    profile_inputs: Optional[ShopperProfileInput] = None
    decision_mode: Optional[bool] = None


class ImageRequest(BaseModel):
    image_name: str = Field(min_length=1)
    image_url: Optional[str] = None
    image_content_base64: Optional[str] = None
    image_mime_type: Optional[str] = None
    message: Optional[str] = None
    customer_id: Optional[str] = None
    profile_inputs: Optional[ShopperProfileInput] = None


class FeedbackRequest(BaseModel):
    feedback_type: str = Field(min_length=1)
    mode: Optional[str] = None
    customer_id: Optional[str] = None
    recommended_product_ids: list[str] = Field(default_factory=list)
    context_note: Optional[str] = None


class RecommendationRefineRequest(BaseModel):
    feedback_type: str = Field(min_length=1)
    refinement_prompt: str = Field(min_length=1)
    mode: str = "outfit_curation"
    customer_id: Optional[str] = None
    recommended_product_ids: list[str] = Field(default_factory=list)
    context_note: Optional[str] = None
    swap_category: Optional[str] = None
    current_products: list[ProductRecommendation] = Field(default_factory=list)
    shopper_profile: Optional["ShopperProfile"] = None
    image_analysis: Optional["ImageAnalysisSummary"] = None
    gap_analysis: Optional["GapAnalysis"] = None
    orchestration_context: Optional[dict] = None


class StylingInsight(BaseModel):
    title: str
    detail: str


class ImageAnalysisSummary(BaseModel):
    summary: str = ""
    anchor_item: Optional[str] = None
    palette: list[str] = Field(default_factory=list)
    garment_types: list[str] = Field(default_factory=list)
    styling_mode_cue: str = "ambiguous"
    silhouette_cues: list[str] = Field(default_factory=list)
    pattern_texture_cues: list[str] = Field(default_factory=list)
    style_direction: list[str] = Field(default_factory=list)
    occasion_cues: list[str] = Field(default_factory=list)
    color_harmony_cues: list[str] = Field(default_factory=list)
    completeness: str = "partial view"
    quality_note: Optional[str] = None
    full_length_recommended: bool = False
    follow_up_question: Optional[str] = None
    follow_up_prompts: list[str] = Field(default_factory=list)
    observation_lines: list[str] = Field(default_factory=list)


class ShopperProfile(BaseModel):
    segment_preference: Optional[str] = None
    style_identity: list[str] = Field(default_factory=list)
    shopping_intent: str = "style_discovery"
    emotional_context: list[str] = Field(default_factory=list)
    occasion_context: Optional[str] = None
    weather_context: Optional[str] = None
    budget_context: Optional[str] = None
    confidence_level: str = "medium"
    decision_style: str = "guided"
    experimentation_preference: str = "balanced"
    practical_constraints: list[str] = Field(default_factory=list)
    silhouette_goals: list[str] = Field(default_factory=list)
    image_signals: list[str] = Field(default_factory=list)
    color_preferences: list[str] = Field(default_factory=list)
    fit_preferences: list[str] = Field(default_factory=list)
    priority_focus: Optional[str] = None
    feeling_goal: Optional[str] = None
    focus_points: list[str] = Field(default_factory=list)
    summary: str = ""
    tone_strategy: str = ""


class AIRuntimeMetadata(BaseModel):
    vision_requested: bool = False
    vision_source: str = "not_used"
    vision_summary: str = ""
    vision_labels: list[str] = Field(default_factory=list)
    vision_objects: list[str] = Field(default_factory=list)
    vision_colors: list[str] = Field(default_factory=list)
    active_segment: Optional[str] = None
    support_intent: Optional[str] = None
    langchain_enabled: bool = False
    langchain_route_used: bool = False
    langchain_stylist_used: bool = False
    langchain_support_used: bool = False
    resolved_mode: str = "outfit_curation"
    route_reason: str = ""


class SupportLineItem(BaseModel):
    title: str
    quantity: int = 1
    unit_price: Optional[str] = None
    image_url: Optional[str] = None


class SupportAction(BaseModel):
    label: str
    kind: str = "prompt"
    prompt: Optional[str] = None
    url: Optional[str] = None


class SupportPayload(BaseModel):
    intent: str = "support_question"
    title: str = ""
    summary: str = ""
    source: Optional[str] = None
    order_reference: Optional[str] = None
    customer_email: Optional[str] = None
    fulfillment_status: Optional[str] = None
    financial_status: Optional[str] = None
    tracking_url: Optional[str] = None
    delivery_estimate: Optional[str] = None
    status_label: Optional[str] = None
    requested_fields: list[str] = Field(default_factory=list)
    line_items: list[SupportLineItem] = Field(default_factory=list)
    actions: list[SupportAction] = Field(default_factory=list)
    upload_enabled: bool = False
    upload_intent: Optional[str] = None
    requires_human_review: bool = False


class GapAnalysis(BaseModel):
    anchor_item: Optional[str] = None
    present_items: list[str] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    recommendation_targets: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    recommended_products: list[ProductRecommendation] = Field(default_factory=list)
    detected_tags: list[str] = Field(default_factory=list)
    styling_insights: list[StylingInsight] = Field(default_factory=list)
    image_analysis: Optional[ImageAnalysisSummary] = None
    gap_analysis: Optional[GapAnalysis] = None
    orchestration_context: Optional[dict] = None
    shopper_profile: Optional[ShopperProfile] = None
    follow_up_prompts: list[str] = Field(default_factory=list)
    required_follow_up_fields: list[str] = Field(default_factory=list)
    support_payload: Optional[SupportPayload] = None
    ai_runtime: AIRuntimeMetadata = Field(default_factory=AIRuntimeMetadata)


class FAQItem(BaseModel):
    question: str
    answer: str


class FAQListResponse(BaseModel):
    items: list[FAQItem]


class AnalyticsOverview(BaseModel):
    chat_interactions: int
    outfit_recommendations: int
    image_uploads: int
    support_questions_answered: int


class ShopperFeedbackSummary(BaseModel):
    love_it: int = 0
    show_another_option: int = 0
    make_more_casual: int = 0
    change_colours: int = 0
    save_for_later: int = 0
    top_preference_signals: list[str] = Field(default_factory=list)


class DashboardActivityItem(BaseModel):
    title: str
    detail: str
    timestamp: Optional[str] = None
    kind: str


class DashboardProductItem(BaseModel):
    title: str
    category: str
    price: Optional[str] = None
    product_url: Optional[str] = None
    image_url: Optional[str] = None


class JourneyMetric(BaseModel):
    key: str
    label: str
    started: int = 0
    assisted_orders: int = 0
    conversion_rate: float = 0.0
    positive_feedback: int = 0
    refinement_requests: int = 0
    last_activity: Optional[str] = None


class CategoryMetric(BaseModel):
    label: str
    product_count: int = 0
    tagged_count: int = 0
    share: float = 0.0


class DataQualitySnapshot(BaseModel):
    avg_tags_per_product: float = 0.0
    products_with_links: int = 0
    products_with_images: int = 0
    catalog_freshness_hours: Optional[float] = None
    brand_memory_assets: int = 0
    support_coverage_ratio: float = 0.0


class MerchantDashboardSnapshot(BaseModel):
    store_name: str
    store_domain: Optional[str] = None
    storefront_domain: Optional[str] = None
    overview: AnalyticsOverview
    products_imported: int
    tagged_products: int
    styling_tags: int
    faq_entries: int
    knowledge_entries: int
    curated_looks: int
    chat_sessions: int
    last_catalog_sync: Optional[str] = None
    last_orders_sync: Optional[str] = None
    orders_scope_ready: bool = False
    orders_imported: int = 0
    ai_assisted_orders: int = 0
    revenue_assisted: float = 0.0
    average_order_value: float = 0.0
    ai_conversion_rate: float = 0.0
    drop_off_rate: float = 0.0
    top_journey: str = "Not enough data"
    feedback_summary: ShopperFeedbackSummary = Field(default_factory=ShopperFeedbackSummary)
    recent_activity: list[DashboardActivityItem] = Field(default_factory=list)
    recent_products: list[DashboardProductItem] = Field(default_factory=list)
    journey_metrics: list[JourneyMetric] = Field(default_factory=list)
    category_metrics: list[CategoryMetric] = Field(default_factory=list)
    data_quality: DataQualitySnapshot = Field(default_factory=DataQualitySnapshot)


class MerchantStoreProfile(BaseModel):
    brand_name: str
    connected_store_domain: Optional[str] = None
    storefront_domain: Optional[str] = None
    industry: str = "Fashion ecommerce"
    brand_summary: str = ""
    merchandising_goal: str = ""


class ChatbotCustomization(BaseModel):
    assistant_name: str = "StyledGenie Stylist"
    brand_name: str = ""
    logo_url: str = ""
    welcome_title: str = "Welcome to your AI styling concierge"
    welcome_message: str = (
        "Help shoppers discover complete looks, get inspired by images, and receive support that feels personal."
    )
    tone_of_voice: str = "Warm, polished, confident, and empathetic."
    stylist_signature: str = "Offer styling rationale, not just product links."
    primary_color: str = "#d8cfbd"
    accent_color: str = "#1d2430"
    surface_color: str = "#f7f2e7"
    bubble_color: str = "#d8cfbd"
    text_color: str = "#171717"
    heading_font: str = "Playfair Display"
    body_font: str = "Avenir Next"
    primary_text_style: str = "600 Medium"
    accent_text_style: str = "500 Medium"
    body_text_style: str = "400 Regular"
    target_market: str = "Europe"
    suggested_prompts: list[str] = Field(
        default_factory=lambda: [
            "Style me for a smart casual dinner.",
            "Find a full outfit under my budget.",
            "Help me complete this look.",
        ]
    )


class CatalogIntelligence(BaseModel):
    target_customer: str = ""
    brand_positioning: str = ""
    priority_tags: str = ""
    compatibility_rules: str = ""
    seasonal_focus: str = ""
    fit_guidance: str = ""
    recommendation_strictness: str = "Balanced"
    product_priority_rules: str = ""
    forbidden_recommendation_types: str = ""
    tagging_mode: str = "Review only"
    description_write_mode: str = "Review only"


class CatalogSuggestionField(BaseModel):
    label: str
    options: list[str] = Field(default_factory=list)
    helper: str = ""


class CatalogSuggestionFields(BaseModel):
    target_customer: CatalogSuggestionField
    brand_positioning: CatalogSuggestionField
    priority_tags: CatalogSuggestionField
    compatibility_rules: CatalogSuggestionField
    seasonal_focus: CatalogSuggestionField
    fit_guidance: CatalogSuggestionField
    recommendation_strictness: CatalogSuggestionField
    product_priority_rules: CatalogSuggestionField
    forbidden_recommendation_types: CatalogSuggestionField


class CatalogSampleProduct(BaseModel):
    title: str
    category: str
    image_url: Optional[str] = None
    detected_signals: list[str] = Field(default_factory=list)


class CatalogSuggestionResponse(BaseModel):
    message: str
    products_analyzed: int = 0
    vision_source: str = "fallback"
    visual_summary: str = ""
    sample_products: list[CatalogSampleProduct] = Field(default_factory=list)
    fields: CatalogSuggestionFields


class LookManagementItem(BaseModel):
    id: Optional[str] = None
    title: str
    occasion: Optional[str] = None
    style_notes: Optional[str] = None


class CustomerCareItem(BaseModel):
    id: Optional[str] = None
    question: str
    answer: str
    category: Optional[str] = None


class SupportContact(BaseModel):
    name: str = ""
    role: str = "Customer Care"
    email: str = ""
    phone: str = ""
    timezone: str = "Europe/Berlin"
    shift_days: list[str] = Field(default_factory=lambda: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    shift_start: str = "09:00"
    shift_end: str = "17:00"
    active: bool = True


class SupportNotificationResult(BaseModel):
    email_targets: list[str] = Field(default_factory=list)
    whatsapp_targets: list[str] = Field(default_factory=list)
    email_sent: bool = False
    whatsapp_sent: bool = False
    errors: list[str] = Field(default_factory=list)


class SupportRequestRecord(BaseModel):
    id: str
    status: str = "open"
    persisted: bool = False
    assigned_contacts: list[SupportContact] = Field(default_factory=list)


class CustomerCareSettings(BaseModel):
    support_email: str = "info@styledgenie.com"
    support_phone: str = ""
    handoff_message: str = (
        "If this still feels unresolved, email info@styledgenie.com with your order number and a short note, "
        "and a human support teammate can take it from there."
    )
    order_tracking_enabled: bool = True
    human_handoff_enabled: bool = True
    escalation_contacts: list[SupportContact] = Field(default_factory=list)


class KnowledgeBaseItem(BaseModel):
    id: Optional[str] = None
    title: str
    body: str
    entry_type: str = "brand_guideline"


class LookManagementPayload(BaseModel):
    items: list[LookManagementItem] = Field(default_factory=list)


class CustomerCarePayload(BaseModel):
    items: list[CustomerCareItem] = Field(default_factory=list)
    settings: CustomerCareSettings = Field(default_factory=CustomerCareSettings)


class KnowledgeBasePayload(BaseModel):
    items: list[KnowledgeBaseItem] = Field(default_factory=list)


class SaveResponse(BaseModel):
    message: str


class CatalogProductOption(BaseModel):
    id: str
    title: str
    category: str
    price: Optional[str] = None
    image_url: Optional[str] = None
    product_url: Optional[str] = None


class CatalogProductListResponse(BaseModel):
    items: list[CatalogProductOption] = Field(default_factory=list)


class ProductDescriptionDraftRequest(BaseModel):
    product_id: str = Field(min_length=1)


class ProductDescriptionApplyRequest(BaseModel):
    product_id: str = Field(min_length=1)
    draft: str = Field(min_length=1)


class ProductDescriptionDraftResponse(BaseModel):
    product_id: str
    product_title: str
    draft: str
    applied_to_shopify: bool = False
    message: str = ""


class LookBuilderRequest(BaseModel):
    hero_product_id: str = Field(min_length=1)
    occasion_hint: Optional[str] = None


class LookBuilderResponse(BaseModel):
    hero_product_id: str
    hero_product_title: str
    items: list[LookManagementItem] = Field(default_factory=list)
    message: str = ""


class MerchantSetupCheck(BaseModel):
    key: str
    label: str
    status: str = "monitor"
    state_label: str = ""
    detail: str = ""


class ShopifyCapabilitySnapshot(BaseModel):
    write_products_ready: bool = False
    granted_scopes: list[str] = Field(default_factory=list)
    message: str = ""
    api_base_url: Optional[str] = None
    setup_checks: list[MerchantSetupCheck] = Field(default_factory=list)


class AIStackStatus(BaseModel):
    openai_ready: bool = False
    langchain_ready: bool = False
    langchain_tools_ready: bool = False
    vision_ready: bool = False
    vision_mode: str = "fallback"
    shopper_routing_active: bool = True
    support_routing_active: bool = True
    image_reasoning_active: bool = True
    summary: str = ""


class MerchantWorkspaceSnapshot(BaseModel):
    overview: MerchantDashboardSnapshot
    profile: MerchantStoreProfile
    chatbot_customization: ChatbotCustomization
    catalog_intelligence: CatalogIntelligence
    ai_stack: AIStackStatus = Field(default_factory=AIStackStatus)
    looks: list[LookManagementItem] = Field(default_factory=list)
    customer_care: list[CustomerCareItem] = Field(default_factory=list)
    customer_care_settings: CustomerCareSettings = Field(default_factory=CustomerCareSettings)
    knowledge_base: list[KnowledgeBaseItem] = Field(default_factory=list)


class CatalogImportRequest(BaseModel):
    store_name: str = Field(min_length=1)


class CatalogImportResponse(BaseModel):
    message: str
    imported_count: int
    orders_imported: int = 0
    orders_scope_ready: bool = False


RecommendationRefineRequest.model_rebuild()
