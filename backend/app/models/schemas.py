from typing import Optional

from pydantic import BaseModel, Field


class ProductRecommendation(BaseModel):
    id: str
    title: str
    category: str
    reason: str
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    price: Optional[str] = None
    product_url: Optional[str] = None
    cart_variant_id: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "outfit_curation"
    customer_id: Optional[str] = None


class ImageRequest(BaseModel):
    image_name: str = Field(min_length=1)
    customer_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    feedback_type: str = Field(min_length=1)
    mode: Optional[str] = None
    customer_id: Optional[str] = None
    recommended_product_ids: list[str] = Field(default_factory=list)
    context_note: Optional[str] = None


class StylingInsight(BaseModel):
    title: str
    detail: str


class ChatResponse(BaseModel):
    reply: str
    recommended_products: list[ProductRecommendation] = Field(default_factory=list)
    detected_tags: list[str] = Field(default_factory=list)
    styling_insights: list[StylingInsight] = Field(default_factory=list)


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


class KnowledgeBaseItem(BaseModel):
    id: Optional[str] = None
    title: str
    body: str
    entry_type: str = "brand_guideline"


class LookManagementPayload(BaseModel):
    items: list[LookManagementItem] = Field(default_factory=list)


class CustomerCarePayload(BaseModel):
    items: list[CustomerCareItem] = Field(default_factory=list)


class KnowledgeBasePayload(BaseModel):
    items: list[KnowledgeBaseItem] = Field(default_factory=list)


class SaveResponse(BaseModel):
    message: str


class MerchantWorkspaceSnapshot(BaseModel):
    overview: MerchantDashboardSnapshot
    profile: MerchantStoreProfile
    chatbot_customization: ChatbotCustomization
    catalog_intelligence: CatalogIntelligence
    looks: list[LookManagementItem] = Field(default_factory=list)
    customer_care: list[CustomerCareItem] = Field(default_factory=list)
    knowledge_base: list[KnowledgeBaseItem] = Field(default_factory=list)


class CatalogImportRequest(BaseModel):
    store_name: str = Field(min_length=1)


class CatalogImportResponse(BaseModel):
    message: str
    imported_count: int
    orders_imported: int = 0
    orders_scope_ready: bool = False
