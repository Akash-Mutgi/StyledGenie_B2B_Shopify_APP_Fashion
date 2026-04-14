from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


MERCHANT_VOICE_ALLOWED_TONES = (
    "warm",
    "enthusiastic",
    "polished",
    "confident",
    "empathetic",
    "playful",
    "minimal",
    "luxurious",
    "friendly",
    "professional",
)
MERCHANT_VOICE_DEFAULT_TONES = ("warm", "polished", "empathetic")
MERCHANT_VOICE_EMOJI_INTENSITIES = ("none", "light", "moderate")
MERCHANT_VOICE_RESPONSE_LENGTHS = ("concise", "balanced", "detailed")


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
    customer_email: Optional[str] = None
    account_display_name: Optional[str] = None
    style_profile_id: Optional[str] = None
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
    customer_email: Optional[str] = None
    account_display_name: Optional[str] = None
    style_profile_id: Optional[str] = None
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
    customer_email: Optional[str] = None
    account_display_name: Optional[str] = None
    style_profile_id: Optional[str] = None
    recommended_product_ids: list[str] = Field(default_factory=list)
    context_note: Optional[str] = None
    swap_category: Optional[str] = None
    current_products: list[ProductRecommendation] = Field(default_factory=list)
    shopper_profile: Optional["ShopperProfile"] = None
    image_analysis: Optional["ImageAnalysisSummary"] = None
    gap_analysis: Optional["GapAnalysis"] = None
    orchestration_context: Optional[dict] = None


ChatEntryMode = Literal["NEW_CUSTOMER", "RETURNING_CUSTOMER"]
ChatService = Literal["find_my_outfit", "complete_my_look", "get_inspired", "customer_service"]


class ChatInitRequest(BaseModel):
    shopifyCustomerId: Optional[str] = None
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None
    sessionId: str = Field(min_length=1)
    shopDomain: Optional[str] = None


class ChatInitProfileSummary(BaseModel):
    id: str
    name: str = ""
    avatarUrl: Optional[str] = None
    relationshipLabel: Optional[str] = None
    summary: Optional[str] = None
    isDefault: bool = False


class ChatSessionContext(BaseModel):
    sessionId: str
    customerIdentifier: Optional[str] = None
    activeProfileId: Optional[str] = None
    selectedService: Optional[ChatService] = None
    lastEntryMode: Optional[ChatEntryMode] = None
    updatedAt: Optional[str] = None


class ChatInitResponse(BaseModel):
    sessionId: str
    mode: ChatEntryMode
    profiles: list[ChatInitProfileSummary] = Field(default_factory=list)
    activeProfileId: Optional[str] = None
    selectedService: Optional[ChatService] = None
    myStyleUrl: str = "/account/profile"


class ChatSelectProfileRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    profileId: str = Field(min_length=1)
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None


class ChatSelectProfileResponse(BaseModel):
    ok: bool = True
    activeProfileId: Optional[str] = None


class ChatSelectServiceRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    profileId: Optional[str] = None
    service: ChatService


class ChatSelectServiceResponse(BaseModel):
    ok: bool = True
    service: ChatService
    profileId: Optional[str] = None


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


class MerchantChatbotVoiceConfig(BaseModel):
    tone: list[str] = Field(default_factory=lambda: list(MERCHANT_VOICE_DEFAULT_TONES))
    use_headers: bool = True
    use_lists: bool = True
    use_emojis: bool = False
    emoji_intensity: Literal["none", "light", "moderate"] = "none"
    response_length: Literal["concise", "balanced", "detailed"] = "balanced"
    custom_instructions: str = ""
    target_market: Optional[str] = None
    brand_description: Optional[str] = None
    avoid_phrases: Optional[str] = None
    preferred_greeting_style: Optional[str] = None

    @field_validator("tone", mode="before")
    @classmethod
    def _normalize_tone(cls, value):
        if value is None or value == "":
            return list(MERCHANT_VOICE_DEFAULT_TONES)

        if isinstance(value, str):
            items = value.split(",")
        elif isinstance(value, list):
            items = value
        else:
            raise ValueError("Tone must be a list of supported tone values.")

        normalized: list[str] = []
        for item in items:
            candidate = str(item or "").strip().lower()
            if not candidate:
                continue
            if candidate not in MERCHANT_VOICE_ALLOWED_TONES:
                raise ValueError(
                    "Unsupported tone. Use only: "
                    + ", ".join(MERCHANT_VOICE_ALLOWED_TONES)
                    + "."
                )
            if candidate not in normalized:
                normalized.append(candidate)

        return normalized or list(MERCHANT_VOICE_DEFAULT_TONES)

    @field_validator("emoji_intensity", mode="before")
    @classmethod
    def _normalize_emoji_intensity(cls, value):
        candidate = str(value or "none").strip().lower()
        if candidate not in MERCHANT_VOICE_EMOJI_INTENSITIES:
            raise ValueError("Emoji intensity must be one of: none, light, moderate.")
        return candidate

    @field_validator("response_length", mode="before")
    @classmethod
    def _normalize_response_length(cls, value):
        candidate = str(value or "balanced").strip().lower()
        if candidate not in MERCHANT_VOICE_RESPONSE_LENGTHS:
            raise ValueError("Response length must be one of: concise, balanced, detailed.")
        return candidate

    @field_validator("custom_instructions", mode="before")
    @classmethod
    def _normalize_custom_instructions(cls, value):
        return str(value or "").strip()[:1200]

    @field_validator(
        "target_market",
        "brand_description",
        "avoid_phrases",
        "preferred_greeting_style",
        mode="before",
    )
    @classmethod
    def _normalize_optional_text(cls, value):
        candidate = str(value or "").strip()
        return candidate[:400] or None

    @model_validator(mode="after")
    def _sync_emoji_controls(self):
        if not self.use_emojis:
            self.emoji_intensity = "none"
        return self


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


class StyleProfileSizes(BaseModel):
    top: Optional[str] = None
    bottom: Optional[str] = None
    shoeEu: Optional[str] = None


class StyleProfileFeatures(BaseModel):
    bodyType: Optional[str] = None
    skinTone: Optional[str] = None
    hairColor: Optional[str] = None
    eyeColor: Optional[str] = None


class StyleProfileVibe(BaseModel):
    pinterestUrl: Optional[str] = None
    imageUrls: list[str] = Field(default_factory=list)
    styleDescription: Optional[str] = None


class StyleProfileAnalysis(BaseModel):
    summary: str = ""
    tags: list[str] = Field(default_factory=list)


class StyleProfileSource(BaseModel):
    method: str = "manual"
    sourceImageUrl: Optional[str] = None
    imageName: Optional[str] = None


class StyleProfileImageValidation(BaseModel):
    ok: bool = False
    fullBodyLikelyVisible: bool = False
    blurScore: Optional[float] = None
    qualityWarnings: list[str] = Field(default_factory=list)
    guidance: list[str] = Field(default_factory=list)
    sourceImageUrl: Optional[str] = None


class StyleProfile(BaseModel):
    id: str
    isPrimary: bool = False
    name: str = ""
    relationship: str = "self"
    shoppingCategoryPreference: str = ""
    gender: str = ""
    sizes: StyleProfileSizes = Field(default_factory=StyleProfileSizes)
    features: StyleProfileFeatures = Field(default_factory=StyleProfileFeatures)
    vibe: StyleProfileVibe = Field(default_factory=StyleProfileVibe)
    styleAnalysis: StyleProfileAnalysis = Field(default_factory=StyleProfileAnalysis)
    favoriteColorPalette: list[str] = Field(default_factory=list)
    fabricAllergies: list[str] = Field(default_factory=list)
    styleNotes: Optional[str] = None
    preferredFits: list[str] = Field(default_factory=list)
    preferredOccasions: list[str] = Field(default_factory=list)
    dislikedColors: list[str] = Field(default_factory=list)
    dislikedFabrics: list[str] = Field(default_factory=list)
    budget: Optional[str] = None
    minBudget: Optional[float] = None
    maxBudget: Optional[float] = None
    source: StyleProfileSource = Field(default_factory=StyleProfileSource)
    imageValidation: StyleProfileImageValidation = Field(default_factory=StyleProfileImageValidation)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class CustomerStyleProfilesRequest(BaseModel):
    customerId: Optional[str] = None
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None
    profiles: list[StyleProfile] = Field(default_factory=list)


class CustomerStyleProfilesResponse(BaseModel):
    customerId: str
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None
    profiles: list[StyleProfile] = Field(default_factory=list)
    persisted: bool = False
    message: str = ""
    updatedAt: Optional[str] = None


class ProfileImageValidationRequest(BaseModel):
    imageName: str = Field(min_length=1)
    imageUrl: Optional[str] = None
    imageContentBase64: Optional[str] = None
    imageMimeType: Optional[str] = None
    sourceMethod: Optional[str] = None


class ProfileImageValidationResponse(BaseModel):
    ok: bool = False
    result: StyleProfileImageValidation = Field(default_factory=StyleProfileImageValidation)


class ProfileImageAnalysisResult(BaseModel):
    hairColor: Optional[str] = None
    eyeColor: Optional[str] = None
    qualityWarnings: list[str] = Field(default_factory=list)
    guidance: list[str] = Field(default_factory=list)
    appearanceNotes: Optional[str] = None


class ProfileImageAnalysisRequest(BaseModel):
    imageName: str = Field(min_length=1)
    imageUrl: Optional[str] = None
    imageContentBase64: Optional[str] = None
    imageMimeType: Optional[str] = None
    sourceMethod: Optional[str] = None
    draftProfile: Optional[StyleProfile] = None


class ProfileImageAnalysisResponse(BaseModel):
    ok: bool = False
    result: ProfileImageAnalysisResult = Field(default_factory=ProfileImageAnalysisResult)


class ProfileScanHandoffPayload(BaseModel):
    method: str = "camera"
    imageName: Optional[str] = None
    imageValidation: StyleProfileImageValidation = Field(default_factory=StyleProfileImageValidation)
    analysisResult: ProfileImageAnalysisResult = Field(default_factory=ProfileImageAnalysisResult)


class ProfileScanHandoffStoreRequest(BaseModel):
    customerId: Optional[str] = None
    customerEmail: Optional[str] = None
    sessionId: Optional[str] = None
    scanPayload: ProfileScanHandoffPayload = Field(default_factory=ProfileScanHandoffPayload)


class ProfileScanHandoffResponse(BaseModel):
    ok: bool = True
    hasPending: bool = False
    sessionId: Optional[str] = None
    scanPayload: Optional[ProfileScanHandoffPayload] = None


class CreateStyleProfileRequest(BaseModel):
    sessionId: Optional[str] = None
    shopifyCustomerId: Optional[str] = None
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None
    profileName: str = Field(min_length=1)
    shoppingCategoryPreference: str = Field(min_length=1)
    gender: Optional[str] = None
    bodyType: Optional[str] = None
    skinTone: Optional[str] = None
    hairColor: Optional[str] = None
    eyeColor: Optional[str] = None
    topSize: str = Field(min_length=1)
    bottomSize: str = Field(min_length=1)
    shoeSize: str = Field(min_length=1)
    favoriteColorPalette: list[str] = Field(default_factory=list)
    fabricAllergies: list[str] = Field(default_factory=list)
    styleNotes: Optional[str] = None
    preferredFits: list[str] = Field(default_factory=list)
    preferredOccasions: list[str] = Field(default_factory=list)
    dislikedColors: list[str] = Field(default_factory=list)
    dislikedFabrics: list[str] = Field(default_factory=list)
    minBudget: Optional[float] = None
    maxBudget: Optional[float] = None
    sourceMethod: Optional[str] = None
    sourceImageUrl: Optional[str] = None
    imageValidation: Optional[StyleProfileImageValidation] = None


class CreateStyleProfileResponse(BaseModel):
    ok: bool = True
    profile: StyleProfile


class SetActiveStyleProfileRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    profileId: str = Field(min_length=1)
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None


class SetActiveStyleProfileResponse(BaseModel):
    ok: bool = True
    activeProfileId: str


class MerchantStyleProfileSummary(BaseModel):
    id: str
    customerIdentifier: Optional[str] = None
    customerEmail: Optional[str] = None
    customerDisplayName: Optional[str] = None
    name: str = ""
    subtitle: str = ""
    completion: int = 0
    completedFields: int = 0
    totalFields: int = 0
    avatarUrl: Optional[str] = None
    isPrimary: bool = False
    relationship: str = "self"
    gender: str = ""
    sizeSummary: str = ""
    bodyType: str = ""
    budget: Optional[str] = None
    styleSummary: str = ""
    updatedAt: Optional[str] = None


class MerchantStyleProfilesResponse(BaseModel):
    profiles: list[MerchantStyleProfileSummary] = Field(default_factory=list)
    updatedAt: Optional[str] = None
    source: str = "merchant_dashboard"


class StyleProfileScanSuggestion(BaseModel):
    features: StyleProfileFeatures = Field(default_factory=StyleProfileFeatures)
    vibe: StyleProfileVibe = Field(default_factory=StyleProfileVibe)
    styleAnalysis: StyleProfileAnalysis = Field(default_factory=StyleProfileAnalysis)
    source: StyleProfileSource = Field(default_factory=lambda: StyleProfileSource(method="scan"))
    confidence: str = "medium"
    requiresConfirmation: bool = True
    qualityNote: Optional[str] = None
    observationLines: list[str] = Field(default_factory=list)
    summary: str = ""
    fullLengthRecommended: bool = False


class StyleProfileScanRequest(BaseModel):
    imageName: str = Field(min_length=1)
    imageUrl: Optional[str] = None
    imageContentBase64: Optional[str] = None
    imageMimeType: Optional[str] = None
    customerId: Optional[str] = None
    customerEmail: Optional[str] = None
    accountDisplayName: Optional[str] = None
    draftProfile: Optional[StyleProfile] = None


class StyleProfileScanResponse(BaseModel):
    suggestion: StyleProfileScanSuggestion = Field(default_factory=StyleProfileScanSuggestion)
    message: str = ""


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
    chatbot_voice_config: MerchantChatbotVoiceConfig = Field(default_factory=MerchantChatbotVoiceConfig)
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
