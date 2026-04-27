const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const composerPlusButton = document.getElementById("composerPlusButton");
const composerQuickActions = document.getElementById("composerQuickActions");
const composerModeBadge = document.getElementById("composerModeBadge");
const composerSignalBadge = document.getElementById("composerSignalBadge");
const voiceButton = document.getElementById("voiceButton");
const sendButton = chatForm ? chatForm.querySelector(".composer-send-button") : null;
const guidedHelperText = document.getElementById("guidedHelperText");
const imageInput = document.getElementById("imageInput");
const imageUrlInput = document.getElementById("imageUrlInput");
const cameraButton = document.getElementById("cameraButton");
const uploadTrigger = document.getElementById("uploadTrigger");
const closeUploadDrawerButton = document.getElementById("closeUploadDrawer");
const uploadPreview = document.getElementById("uploadPreview");
const uploadPreviewImage = document.getElementById("uploadPreviewImage");
const uploadPreviewLabel = document.getElementById("uploadPreviewLabel");
const analyzeSelectedImageButton = document.getElementById("analyzeSelectedImage");
const clearSelectedImageButton = document.getElementById("clearSelectedImage");
const cameraCard = document.getElementById("cameraCard");
const cameraVideo = document.getElementById("cameraVideo");
const cameraStillImage = document.getElementById("cameraStillImage");
const cameraCanvas = document.getElementById("cameraCanvas");
const capturePhotoButton = document.getElementById("capturePhotoButton");
const retakePhotoButton = document.getElementById("retakePhotoButton");
const confirmPhotoButton = document.getElementById("confirmPhotoButton");
const cancelCameraButton = document.getElementById("cancelCameraButton");
const widgetAssistantName = document.getElementById("widgetAssistantName");
const widgetWelcomeTitle = document.getElementById("widgetWelcomeTitle");
const widgetLogo = document.getElementById("widgetLogo");
const widgetHomeButton = document.getElementById("widgetHomeButton");
const widgetPresence = document.querySelector(".widget-presence");
const widgetStatusPill = document.querySelector(".status-pill");
const modeButtons = document.querySelectorAll(".mode-button");
const uploadCard = document.getElementById("uploadCard");
const helperText = document.querySelector(".helper-text");
const apiBaseUrl = resolveApiBaseUrl();
const customerId = "guest-001";
const customizationRefreshIntervalMs = 4000;
const storefrontProductCache = new Map();

let activeMode = "outfit";
let latestRecommendationContext = null;
let latestCustomizationFingerprint = "";
let latestCustomization = null;
let shopperProfileDraft = createEmptyProfileDraft();
let guidedFlow = null;
let pendingDecisionRequest = null;
let pendingStylingFollowUpField = null;
let homeViewActive = true;
let supportUploadContext = null;
let pendingImageSelection = null;
let pendingImagePreviewNode = null;
let cameraStream = null;
let cameraCaptureReady = false;
let uploadDrawerPinned = false;
let voiceState = createVoiceState();
const defaultAssistantName = "StyledGenie AI";
const defaultWelcomeTitle = "A thoughtful look, without the guesswork.";
const shopperIdentity = getShopperIdentity();

const starterMessages = {
  outfit:
    "Tell me where you're headed, how you want to feel, or what needs to stay practical, and I'll shape the look around that.",
  inspire:
    "Send me the image when you're ready and I'll translate the mood into pieces that still feel realistic to wear.",
  complete:
    "Show me the piece you're starting with and I'll build the finishing layer around it without over-styling it.",
  support:
    "Ask me anything practical like delivery, returns, or sizing and I'll keep it calm, clear, and helpful.",
};

const backendModes = {
  outfit: "outfit_curation",
  inspire: "get_inspired",
  complete: "complete_the_look",
  support: "support",
};
const defaultUiMode = "outfit";

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const queryValue = new URLSearchParams(window.location.search).get("api_base");
  const bodyValue = document.body ? document.body.dataset.apiBase : "";
  const metaTag = document.querySelector('meta[name="styledgenie-api-base"]');
  const metaValue = metaTag ? metaTag.content : "";
  const globalValue =
    typeof window.STYLEDGENIE_API_BASE === "string" ? window.STYLEDGENIE_API_BASE : "";

  const configuredBase = [queryValue, bodyValue, metaValue, globalValue]
    .map((value) => stripTrailingSlash(value))
    .find(Boolean);

  if (configuredBase) {
    return configuredBase;
  }

  if (window.location && /^https?:/i.test(window.location.origin || "")) {
    return stripTrailingSlash(window.location.origin);
  }

  return "http://127.0.0.1:8000";
}

function backendModeToUiMode(mode) {
  if (mode === "get_inspired") {
    return "inspire";
  }
  if (mode === "complete_the_look") {
    return "complete";
  }
  if (mode === "support") {
    return "support";
  }
  return "outfit";
}

const FEATURE_INTERACTION_CONFIG = {
  outfit: {
    mode: "conversational",
    textEnabled: true,
    voiceEnabled: true,
    placeholder: "Tell me what you're shopping for, or tap the mic to speak.",
    badgeLabel: "Find my outfit",
    signalLabel: "Text + voice",
    helperText: "",
  },
  support: {
    mode: "conversational",
    textEnabled: true,
    voiceEnabled: true,
    placeholder: "Ask about orders, returns, delivery, or support.",
    badgeLabel: "Customer care",
    signalLabel: "Text + voice",
    helperText: "",
  },
  complete: {
    mode: "guided",
    textEnabled: false,
    voiceEnabled: false,
    placeholder: "Please follow the guided steps to complete your look.",
    badgeLabel: "Complete my look",
    signalLabel: "Guided steps",
    helperText: "This feature uses guided steps for better results.",
  },
  inspire: {
    mode: "guided",
    textEnabled: false,
    voiceEnabled: false,
    placeholder: "Please follow the guided steps to get inspired.",
    badgeLabel: "Get inspired",
    signalLabel: "Guided steps",
    helperText: "This feature uses guided steps for better results.",
  },
};

const uploadHelpText = {
  inspire: "Use camera or upload an inspiration image and I’ll translate the mood into the closest shoppable version from the catalog.",
  complete: "Use camera or upload the piece you want to build around and I’ll finish the look with complementary pieces from the catalog.",
};

function createVoiceState() {
  return {
    supported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    active: false,
    recognition: null,
  };
}

function getInteractionConfigForFeature(mode = activeMode) {
  return FEATURE_INTERACTION_CONFIG[mode] || FEATURE_INTERACTION_CONFIG.outfit;
}

function isConversationalFeature(mode = activeMode) {
  return getInteractionConfigForFeature(mode).mode === "conversational";
}

function isGuidedFeature(mode = activeMode) {
  return getInteractionConfigForFeature(mode).mode === "guided";
}

function canUseTextInput(mode = activeMode) {
  return Boolean(getInteractionConfigForFeature(mode).textEnabled);
}

function canUseVoiceInput(mode = activeMode) {
  return Boolean(getInteractionConfigForFeature(mode).voiceEnabled);
}

function canUseSupportImageUpload(mode = activeMode) {
  return mode === "support" && Boolean(supportUploadContext && supportUploadContext.uploadEnabled);
}

function updateSupportUploadContext(payload) {
  if (
    payload &&
    payload.upload_enabled &&
    payload.upload_intent &&
    ["damage_issue", "wrong_item_issue"].includes(payload.upload_intent)
  ) {
    supportUploadContext = {
      intent: payload.upload_intent,
      uploadEnabled: true,
      source: payload.source || null,
    };
  } else {
    supportUploadContext = null;
  }
  syncInteractionUI(activeMode);
  syncUploadDrawer();
}

function inferDecisionModeFromMessage(message) {
  const lowered = ` ${String(message || "").toLowerCase()} `;
  if (!lowered.trim()) {
    return null;
  }

  if (
    [
      " decide for me ",
      " pick the best ",
      " pick one ",
      " choose for me ",
      " just pick ",
      " best one ",
      " strongest option ",
      " quick option ",
    ].some((token) => lowered.includes(token))
  ) {
    return true;
  }

  if (
    [
      " show me options ",
      " few options ",
      " more options ",
      " compare ",
      " another option ",
      " couple of options ",
    ].some((token) => lowered.includes(token))
  ) {
    return false;
  }

  return null;
}

const welcomeContent = {
  outfit: {
    eyebrow: "StyledGenie Concierge",
    title: "Let's make this feel considered, flattering, and easy to say yes to.",
    body:
      "Tell me the occasion, budget, mood, or fit direction and I'll narrow the options into a look that feels polished without becoming hard work.",
    prompts: [
      "Style me for a smart casual dinner",
      "I need a womenswear event look under 150 euros",
      "Build me an easy menswear weekend outfit",
    ],
  },
  inspire: {
    eyebrow: "Style From Inspiration",
    title: "Bring me the image and I'll turn the feeling into something wearable.",
    body:
      "Upload a look, celebrity reference, or Pinterest-style image and I'll read the mood first, then translate it into store pieces that make sense.",
    prompts: [
      "Help me recreate this mood",
      "Make this inspiration feel more elevated",
      "Find store pieces with this energy",
    ],
  },
  complete: {
    eyebrow: "Finish The Look",
    title: "One strong piece is enough to build around.",
    body:
      "Upload the item or outfit photo and I'll suggest what adds shape, balance, and polish without taking the attention away from your anchor piece.",
    prompts: [
      "Complete this look for evening",
      "What shoes work with this?",
      "Make this feel more refined",
    ],
  },
  support: {
    eyebrow: "Need A Quick Answer?",
    title: "I can handle the practical side too.",
    body:
      "Ask about tracking, shipping, returns, sizing, or anything that feels unclear and I'll guide you through it without the usual friction.",
    prompts: [
      "Track my order",
      "How long does shipping take in Germany?",
      "I need help with a return",
    ],
  },
};

const quickEntryActions = [
  { label: "Find my outfit", action: "mode", mode: "outfit" },
  { label: "Complete my look", action: "mode", mode: "complete" },
  { label: "Get inspired", action: "mode", mode: "inspire" },
  { label: "Track my order", action: "support", supportType: "track", prompt: "Track my order" },
  { label: "Returns / Help", action: "support", supportType: "help", prompt: "I need help with returns" },
];

const profileOptions = {
  segment: ["menswear", "womenswear"],
  occasion: ["work", "smart casual dinner", "event", "weekend", "travel"],
  weather: ["warm", "mild", "cold", "rainy"],
  budget: ["under 100 euros", "under 150 euros", "under 250 euros", "open budget"],
  priority: ["comfort", "polished", "bold", "easy", "premium", "budget-friendly"],
  feel: ["confident", "comfortable", "elegant", "sharp", "relaxed", "experimental"],
};

const conversationActionSets = {
  outfit: [
    {
      type: "add_all_to_cart",
      label: "Add all to cart",
      action: "cart",
    },
    {
      type: "save_for_later",
      label: "Save look",
      action: "feedback",
      acknowledgement: "Saved. I’ll remember this direction as a strong fit for you.",
    },
    {
      type: "show_another_option",
      label: "Show more like this",
      action: "refine",
      acknowledgement: "Absolutely. I’ll show another outfit direction around the same brief.",
      prompt: "Show me another outfit direction for the same occasion and profile.",
    },
    {
      type: "change_one_item",
      label: "Change one item",
      action: "refine",
      acknowledgement: "Of course. I’ll keep the overall look and swap one piece.",
      prompt: "Keep the overall look, but change one item for a fresh alternative.",
    },
    {
      type: "cheaper_option",
      label: "Cheaper option",
      action: "refine",
      acknowledgement: "Understood. I’ll keep the logic and bring the spend down.",
      prompt: "Keep the same outfit logic, but make it more budget-friendly.",
    },
  ],
  inspire: [
    {
      type: "shop_this_vibe",
      label: "Shop this vibe",
      action: "cart",
    },
    {
      type: "save_for_later",
      label: "Save look",
      action: "feedback",
      acknowledgement: "Saved. I’ll remember this visual direction for future styling.",
    },
    {
      type: "show_alternatives",
      label: "Show another similar version",
      action: "refine",
      acknowledgement: "Absolutely. I’ll keep the inspiration direction and show a fresh variation.",
      prompt: "Keep the same inspiration look and show me another similar version from the catalog.",
    },
    {
      type: "make_it_cheaper",
      label: "Make it more affordable",
      action: "refine",
      acknowledgement: "Of course. I’ll keep the same inspiration direction and lower the spend.",
      prompt: "Keep the same inspiration look, but make it more affordable.",
    },
    {
      type: "make_it_more_premium",
      label: "Make it more premium",
      action: "refine",
      acknowledgement: "Perfect. I’ll elevate the same inspiration with a more premium finish.",
      prompt: "Keep the same inspiration look, but make it more premium.",
    },
    {
      type: "make_it_more_formal",
      label: "Make it more formal",
      action: "refine",
      acknowledgement: "Absolutely. I’ll keep the same reference and sharpen the formality.",
      prompt: "Keep the same inspiration look, but make it more formal.",
    },
  ],
  complete: [
    {
      type: "add_selected_items",
      label: "Add selected items",
      action: "cart",
    },
    {
      type: "save_for_later",
      label: "Save look",
      action: "feedback",
      acknowledgement: "Saved. I’ll keep this completion direction in mind.",
    },
    {
      type: "swap_one_item",
      label: "Swap one item",
      action: "refine",
      acknowledgement: "Absolutely. I’ll keep the anchor and swap one of the supporting pieces.",
      prompt: "Keep the anchor item, but swap one supporting product for a different option.",
    },
    {
      type: "show_safer_version",
      label: "Show safer version",
      action: "refine",
      acknowledgement: "Of course. I’ll make the finishing choices feel cleaner and easier.",
      prompt: "Keep the same anchor item, but show me a safer and easier version.",
    },
    {
      type: "show_bolder_version",
      label: "Show bolder version",
      action: "refine",
      acknowledgement: "Perfect. I’ll make the finishing choices stronger and more directional.",
      prompt: "Keep the same anchor item, but show me a bolder version.",
    },
  ],
  support: [
    {
      type: "track_order",
      label: "Track order",
      action: "prompt",
      prompt: "Track my order",
    },
    {
      type: "return_item",
      label: "Return item",
      action: "prompt",
      prompt: "I need help with a return",
    },
    {
      type: "exchange_item",
      label: "Exchange item",
      action: "prompt",
      prompt: "I need help with an exchange",
    },
    {
      type: "speak_to_support",
      label: "Speak to support",
      action: "prompt",
      prompt: "I need to speak to a person",
    },
  ],
};

function getBrandInitials(value) {
  const initials = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");

  return (initials || "SG").toUpperCase();
}

function getShopperIdentity() {
  const explicitName =
    (window.StyledGenieShopper && window.StyledGenieShopper.name) ||
    window.STYLEDGENIE_SHOPPER_NAME ||
    "";
  const explicitAvatar =
    (window.StyledGenieShopper && window.StyledGenieShopper.avatarUrl) ||
    window.STYLEDGENIE_SHOPPER_AVATAR_URL ||
    "";

  return {
    name: String(explicitName || "Guest Shopper").trim() || "Guest Shopper",
    avatarUrl: String(explicitAvatar || "").trim(),
  };
}

function createEmptyProfileDraft() {
  return {
    segment: "",
    occasion: "",
    weather: "",
    budget: "",
    priority: "",
    feel: "",
    color_preference: "",
    fit_preference: "",
  };
}

function normalizeStylingFollowUpField(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["segment", "occasion", "weather", "priority"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizePriorityFromText(value) {
  const normalized = ` ${String(value || "").toLowerCase()} `;
  if (/\b(comfort|comfortable|easier|easy)\b/.test(normalized)) {
    return "comfort";
  }
  if (/\b(sharp|sharper|polished|refined)\b/.test(normalized)) {
    return "polished";
  }
  if (/\b(bold|bolder|statement)\b/.test(normalized)) {
    return "bold";
  }
  return "";
}

function applyStylingFollowUpValue(value, field = pendingStylingFollowUpField) {
  const normalizedField = normalizeStylingFollowUpField(field);
  const raw = String(value || "").trim();
  if (!normalizedField || !raw) {
    return false;
  }

  if (normalizedField === "segment") {
    const segment = inferSegmentFromText(raw);
    if (!segment) {
      return false;
    }
    shopperProfileDraft.segment = segment;
    return true;
  }

  if (normalizedField === "occasion") {
    shopperProfileDraft.occasion = inferOccasionFromText(raw) || raw.toLowerCase();
    return true;
  }

  if (normalizedField === "weather") {
    shopperProfileDraft.weather = inferWeatherFromText(raw) || raw.toLowerCase();
    return true;
  }

  if (normalizedField === "priority") {
    const priority = normalizePriorityFromText(raw);
    if (!priority) {
      return false;
    }
    shopperProfileDraft.priority = priority;
    return true;
  }

  return false;
}

function hasProfileSelections() {
  return Boolean(
    shopperProfileDraft.segment ||
      shopperProfileDraft.occasion ||
      shopperProfileDraft.weather ||
      shopperProfileDraft.budget ||
      shopperProfileDraft.priority ||
      shopperProfileDraft.feel ||
      shopperProfileDraft.color_preference ||
      shopperProfileDraft.fit_preference
  );
}

function buildProfileInputsPayload() {
  if (!hasProfileSelections()) {
    return null;
  }

  return {
    segment: shopperProfileDraft.segment || null,
    occasion: shopperProfileDraft.occasion || null,
    weather: shopperProfileDraft.weather || null,
    budget: shopperProfileDraft.budget || null,
    priority: shopperProfileDraft.priority || null,
    feel: shopperProfileDraft.feel || null,
    color_preference: shopperProfileDraft.color_preference || null,
    fit_preference: shopperProfileDraft.fit_preference || null,
  };
}

function buildProfileNarrative(profileInputs, mode) {
  if (!profileInputs) {
    return "";
  }

  const parts = [];
  if (profileInputs.segment) {
    parts.push(`${profileInputs.segment} only`);
  }
  if (profileInputs.occasion) {
    parts.push(`occasion: ${profileInputs.occasion}`);
  }
  if (profileInputs.weather) {
    parts.push(`weather: ${profileInputs.weather}`);
  }
  if (profileInputs.budget) {
    parts.push(`budget: ${profileInputs.budget}`);
  }
  if (profileInputs.priority) {
    parts.push(`prioritize ${profileInputs.priority}`);
  }
  if (profileInputs.feel) {
    parts.push(`want to feel ${profileInputs.feel}`);
  }
  if (profileInputs.color_preference) {
    parts.push(`colour preference: ${profileInputs.color_preference}`);
  }
  if (profileInputs.fit_preference) {
    parts.push(`fit preference: ${profileInputs.fit_preference}`);
  }

  if (!parts.length) {
    return "";
  }

  const requestLead =
    mode === "complete"
      ? "Use this styling profile while completing my look"
      : mode === "inspire"
        ? "Use this styling profile while translating my inspiration"
        : "Build my outfit using this profile";

  return `${requestLead}: ${parts.join(", ")}.`;
}

function buildDisplaySummary(profileInputs) {
  if (!profileInputs) {
    return "";
  }

  const visibleParts = [];
  if (profileInputs.segment) {
    visibleParts.push(profileInputs.segment);
  }
  if (profileInputs.occasion) {
    visibleParts.push(profileInputs.occasion);
  }
  if (profileInputs.weather) {
    visibleParts.push(`${profileInputs.weather} weather`);
  }
  if (profileInputs.budget) {
    visibleParts.push(profileInputs.budget);
  }
  if (profileInputs.priority) {
    visibleParts.push(profileInputs.priority);
  }
  if (profileInputs.feel) {
    visibleParts.push(`feel ${profileInputs.feel}`);
  }

  if (!visibleParts.length) {
    return "";
  }

  return visibleParts.join(" • ");
}

function formatMessageTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapePattern(label) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text, label, nextLabels) {
  const nextPattern = nextLabels.map(escapePattern).join("|");
  const pattern = nextPattern
    ? new RegExp(
        `${escapePattern(label)}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*:|$)`,
        "i"
      )
    : new RegExp(`${escapePattern(label)}\\s*:?\\s*([\\s\\S]*)$`, "i");

  const match = String(text || "").match(pattern);
  return match ? match[1].trim() : "";
}

function parseStructuredReply(text) {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  if (!normalized) {
    return null;
  }

  const labels = [
    "Outfit title",
    "Outfit breakdown",
    "Why this works",
    "Optional safer or bolder variation",
  ];

  if (!labels.some((label) => new RegExp(`(^|\\n)\\s*${escapePattern(label)}\\s*:`, "i").test(normalized))) {
    return null;
  }

  const sections = {
    title: extractSection(normalized, "Outfit title", labels.slice(1)),
    breakdown: extractSection(normalized, "Outfit breakdown", labels.slice(2)),
    why: extractSection(normalized, "Why this works", labels.slice(3)),
    variation: extractSection(normalized, "Optional safer or bolder variation", []),
  };

  return Object.values(sections).some(Boolean) ? sections : null;
}

function createMessageParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((paragraphText) => {
      const paragraph = document.createElement("p");
      paragraph.className = "message-paragraph";
      paragraph.textContent = paragraphText;
      return paragraph;
    });
}

function buildBotMessageContent(text) {
  const structured = parseStructuredReply(text);
  if (!structured) {
    return createMessageParagraphs(text);
  }

  const brief = document.createElement("div");
  brief.className = "reply-brief";

  const sections = [
    { key: "title", label: "Outfit title" },
    { key: "breakdown", label: "Outfit breakdown" },
    { key: "why", label: "Why this works" },
    { key: "variation", label: "Optional safer or bolder variation" },
  ];

  sections.forEach((item) => {
    if (!structured[item.key]) {
      return;
    }

    const section = document.createElement("section");
    section.className = "reply-section";

    const label = document.createElement("p");
    label.className = "reply-section-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "reply-section-value";
    value.textContent = structured[item.key];

    section.append(label, value);
    brief.appendChild(section);
  });

  return [brief];
}

function createMessageAvatar(role) {
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  if (role === "bot") {
    const brandName =
      (latestCustomization && (latestCustomization.brand_name || latestCustomization.assistant_name)) ||
      widgetAssistantName.textContent ||
      defaultAssistantName;

    if (latestCustomization && latestCustomization.logo_url) {
      avatar.classList.add("has-image");
      const image = document.createElement("img");
      image.src = latestCustomization.logo_url;
      image.alt = `${brandName} logo`;
      image.loading = "lazy";
      avatar.appendChild(image);
      return avatar;
    }

    avatar.textContent = getBrandInitials(brandName);
    return avatar;
  }

  if (role === "user") {
    if (shopperIdentity.avatarUrl) {
      avatar.classList.add("has-image");
      const image = document.createElement("img");
      image.src = shopperIdentity.avatarUrl;
      image.alt = `${shopperIdentity.name} profile photo`;
      image.loading = "lazy";
      avatar.appendChild(image);
      return avatar;
    }

    avatar.textContent = getBrandInitials(shopperIdentity.name);
    return avatar;
  }

  return null;
}

function refreshBotAvatars() {
  chatLog.querySelectorAll(".message-row.bot .message-avatar").forEach((avatar) => {
    const nextAvatar = createMessageAvatar("bot");
    if (nextAvatar) {
      avatar.replaceWith(nextAvatar);
    }
  });
}

function appendMessageRowAvatar(row, stack, avatar, role) {
  if (role === "user") {
    row.appendChild(stack);
    if (avatar) {
      row.appendChild(avatar);
    }
    return;
  }

  if (avatar) {
    row.appendChild(avatar);
  }
  row.appendChild(stack);
}

function buildUserAuthorLabel() {
  return shopperIdentity.name || "You";
}

function renderWidgetLogo(customization) {
  if (!widgetLogo) {
    return;
  }

  const brandName =
    customization.brand_name || customization.assistant_name || defaultAssistantName;

  widgetLogo.innerHTML = "";

  if (customization.logo_url) {
    const image = document.createElement("img");
    image.src = customization.logo_url;
    image.alt = `${brandName} logo`;
    image.loading = "lazy";
    widgetLogo.appendChild(image);
    return;
  }

  const fallback = document.createElement("span");
  fallback.className = "widget-logo-fallback";
  fallback.textContent = getBrandInitials(brandName);
  widgetLogo.appendChild(fallback);
}

function applyChatbotCustomization(customization) {
  if (!customization) {
    return;
  }

  latestCustomization = customization;
  const assistantName = customization.assistant_name || defaultAssistantName;
  const welcomeTitle = customization.welcome_title || defaultWelcomeTitle;
  const welcomeMessage = customization.welcome_message || starterMessages.outfit;

  widgetAssistantName.textContent = assistantName;
  widgetWelcomeTitle.textContent = welcomeTitle;
  renderWidgetLogo(customization);

  welcomeContent.outfit.eyebrow = assistantName;
  welcomeContent.outfit.title = welcomeTitle;
  welcomeContent.outfit.body = welcomeMessage;
  if (Array.isArray(customization.suggested_prompts) && customization.suggested_prompts.length) {
    welcomeContent.outfit.prompts = customization.suggested_prompts.slice(0, 3);
  }
  starterMessages.outfit = welcomeMessage;
  refreshVisibleWelcomeState();
  refreshBotAvatars();
}

function getCustomizationFingerprint(customization) {
  return JSON.stringify({
    assistant_name: customization && customization.assistant_name,
    welcome_title: customization && customization.welcome_title,
    welcome_message: customization && customization.welcome_message,
    logo_url: customization && customization.logo_url,
    brand_name: customization && customization.brand_name,
    suggested_prompts: customization && customization.suggested_prompts,
  });
}

function refreshVisibleWelcomeState() {
  const openerText =
    welcomeContent.outfit.body ||
    "Hi — I’m your StyledGenie stylist. I can help you build a look, work from an image, or sort order support. What are you shopping for today?";

  const firstBotBubble = chatLog.querySelector(".message.bot");
  if (firstBotBubble && !chatLog.querySelector(".recommendation-panel")) {
    firstBotBubble.textContent = openerText;
  }
}

function addSuggestionChips(options, onSelect, variant = "default") {
  if (!options || options.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = `suggestion-strip ${variant}`;

  const row = document.createElement("div");
  row.className = "suggestion-row";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      row.querySelectorAll("button").forEach((item) => {
        item.disabled = true;
      });
      onSelect(option);
    });
    row.appendChild(button);
  });

  panel.appendChild(row);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function clearActivePromptPanels() {
  chatLog.querySelectorAll(".suggestion-strip, .next-step-panel, .feedback-panel").forEach((node) => {
    node.remove();
  });
}

function clearStylingUiForSupportMode() {
  chatLog
    .querySelectorAll(
      ".welcome-card, .suggestion-strip, .profile-panel, .vision-panel, .look-preview-panel, .hero-match-panel, .recommendation-panel, .insight-panel, .feedback-panel, .next-step-panel"
    )
    .forEach((node) => {
      node.remove();
    });
}

function syncHeaderHomeButton(mode = activeMode) {
  if (!widgetHomeButton) {
    return;
  }
  const showBackToHome = !homeViewActive;
  widgetHomeButton.classList.toggle("hidden", !showBackToHome);
  widgetHomeButton.disabled = !showBackToHome;
  widgetHomeButton.setAttribute("aria-hidden", String(!showBackToHome));
}

function returnToChatHome() {
  clearActivePromptPanels();
  pendingDecisionRequest = null;
  pendingStylingFollowUpField = null;
  setMode(defaultUiMode, { silent: true });
  homeViewActive = true;
  addMessage("What do you want to do next?", "bot");
  addSuggestionChips(getOpenerSuggestions(), (option) => handleStarterSelection(option), "opening");
  syncHeaderHomeButton();
  scrollChatToBottom();
}

function syncInteractionUI(mode = activeMode) {
  const config = getInteractionConfigForFeature(mode);
  const isGuided = isGuidedFeature(mode);
  const signalLabel =
    voiceState.active && canUseVoiceInput(mode) ? "Listening…" : config.signalLabel;
  const plusEnabled = mode !== "support" || canUseSupportImageUpload(mode);

  chatInput.placeholder = config.placeholder;
  chatInput.disabled = !config.textEnabled;
  chatInput.readOnly = !config.textEnabled;
  chatInput.setAttribute("aria-disabled", String(!config.textEnabled));

  if (sendButton) {
    sendButton.disabled = !config.textEnabled;
    sendButton.setAttribute("aria-disabled", String(!config.textEnabled));
  }

  if (voiceButton) {
    voiceButton.disabled = !config.voiceEnabled;
    voiceButton.setAttribute("aria-disabled", String(!config.voiceEnabled));
    voiceButton.classList.toggle("is-listening", voiceState.active);
    voiceButton.title = voiceState.active ? "Stop voice input" : "Start voice input";
    voiceButton.setAttribute(
      "aria-label",
      voiceState.active ? "Stop voice input" : "Start voice input"
    );
  }

  if (composerPlusButton) {
    composerPlusButton.disabled = !plusEnabled;
    composerPlusButton.setAttribute("aria-disabled", String(!plusEnabled));
    composerPlusButton.classList.toggle("is-disabled", !plusEnabled);
  }

  if (guidedHelperText) {
    guidedHelperText.textContent = config.helperText || "";
    guidedHelperText.classList.toggle("hidden", !config.helperText);
  }

  if (chatForm) {
    chatForm.dataset.interactionMode = config.mode;
    chatForm.classList.toggle("guided-mode", isGuided);
    chatForm.classList.toggle("conversational-mode", !isGuided);
  }

  syncComposerBadges(mode, signalLabel);
  syncHeaderHomeButton(mode);
}

function setMode(mode, options = {}) {
  const previousMode = activeMode;
  const previousConfig = getInteractionConfigForFeature(previousMode);
  const nextConfig = getInteractionConfigForFeature(mode);
  const modeChanged = previousMode !== mode;
  const enteringGuided = previousConfig.mode !== "guided" && nextConfig.mode === "guided";
  const leavingGuided = previousConfig.mode === "guided" && nextConfig.mode !== "guided";
  const switchingBetweenGuided = previousConfig.mode === "guided" && nextConfig.mode === "guided" && modeChanged;

  if (modeChanged && (enteringGuided || leavingGuided || switchingBetweenGuided)) {
    clearActivePromptPanels();
    resetGuidedFlow();
  }

  if (modeChanged && nextConfig.mode === "guided") {
    chatInput.value = "";
  }

  if (modeChanged) {
    pendingDecisionRequest = null;
    pendingStylingFollowUpField = null;
  }

  if (modeChanged && mode === "support") {
    clearStylingUiForSupportMode();
    latestRecommendationContext = null;
    uploadDrawerPinned = false;
    imageUrlInput.value = "";
    clearPendingImageSelection();
    resetCameraCard();
    setComposerQuickActionsOpen(false);
  }

  if (modeChanged && mode !== "support") {
    supportUploadContext = null;
  }

  if (voiceState.active && !canUseVoiceInput(mode)) {
    stopVoiceInput({ silent: true });
  }

  activeMode = mode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  syncInteractionUI(mode);

  if (!isImageMode(mode)) {
    imageInput.value = "";
    imageUrlInput.value = "";
    clearPendingImageSelection();
    resetCameraCard();
  }

  if (modeChanged && isImageMode(mode)) {
    clearPendingImageSelection();
    resetCameraCard();
  }

  syncUploadDrawer();
  setComposerQuickActionsOpen(false);

  if (!options.silent) {
    scrollChatToBottom();
  }
}

function syncComposerBadges(mode = activeMode, signalOverride = "") {
  const badgeContent = getInteractionConfigForFeature(mode);
  if (composerModeBadge) {
    composerModeBadge.textContent = badgeContent.badgeLabel;
  }
  if (composerSignalBadge) {
    composerSignalBadge.textContent = signalOverride || badgeContent.signalLabel;
  }
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function stopVoiceInput(options = {}) {
  const silent = Boolean(options.silent);
  if (voiceState.recognition) {
    voiceState.recognition.onstart = null;
    voiceState.recognition.onresult = null;
    voiceState.recognition.onerror = null;
    voiceState.recognition.onend = null;
    try {
      voiceState.recognition.abort();
    } catch (error) {
      // Ignore abort errors from already-ended recognition sessions.
    }
  }
  voiceState = createVoiceState();
  syncInteractionUI();
  if (!silent && isConversationalFeature()) {
    addMessage("Voice input stopped.", "bot");
  }
}

function ensureVoiceRecognition() {
  const Recognition = getSpeechRecognitionConstructor();
  if (!Recognition) {
    return null;
  }

  if (voiceState.recognition) {
    return voiceState.recognition;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    voiceState.active = true;
    syncInteractionUI();
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((result) => (result[0] && result[0].transcript ? result[0].transcript : ""))
      .join(" ")
      .trim();

    if (!transcript || !canUseVoiceInput()) {
      return;
    }

    chatInput.value = transcript;
    void sendTextChat(transcript, {
      displayText: transcript,
      source: "voice",
    });
  };

  recognition.onerror = () => {
    voiceState.active = false;
    syncInteractionUI();
    if (isConversationalFeature()) {
      addMessage("I couldn’t catch that clearly. You can try the mic once more or type instead.", "bot");
    }
  };

  recognition.onend = () => {
    voiceState.active = false;
    syncInteractionUI();
  };

  voiceState.recognition = recognition;
  return recognition;
}

function handleVoiceButtonClick() {
  if (!canUseVoiceInput()) {
    return;
  }

  if (voiceState.active) {
    stopVoiceInput({ silent: true });
    return;
  }

  const recognition = ensureVoiceRecognition();
  if (!recognition) {
    addMessage("Voice input isn’t available in this browser yet, but you can keep typing here.", "bot");
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    voiceState.active = false;
    syncInteractionUI();
  }
}

function getUploadHelperCopy() {
  if (activeMode === "support" && canUseSupportImageUpload()) {
    return "Upload a clear photo of the issue and I’ll use it to support the damaged-item or wrong-item review.";
  }

  if (activeMode === "inspire") {
    return "Use the + button to add an inspiration image and I’ll analyze it first.";
  }

  if (activeMode === "complete") {
    return "Use the + button to add your piece or outfit photo and I’ll analyze it first.";
  }

  return "";
}

function setComposerQuickActionsOpen(isOpen) {
  if (!composerQuickActions || !composerPlusButton) {
    return;
  }
  composerQuickActions.classList.toggle("hidden", !isOpen);
  composerPlusButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
}

function syncUploadDrawer() {
  if (!uploadCard) {
    return;
  }
  if (activeMode === "support" && !canUseSupportImageUpload()) {
    uploadCard.classList.add("hidden");
    if (helperText) {
      helperText.textContent = "";
    }
    return;
  }
  const hasRemoteImage = Boolean(imageUrlInput.value.trim());
  const hasPendingImage = Boolean(pendingImageSelection) || hasRemoteImage;
  const cameraVisible = !cameraCard.classList.contains("hidden");
  const shouldShow = uploadDrawerPinned || hasPendingImage || cameraVisible;
  uploadCard.classList.toggle("hidden", !shouldShow);
  if (helperText) {
    helperText.textContent = getUploadHelperCopy();
  }
}

function openUploadDrawer(options = {}) {
  if (!uploadCard) {
    return;
  }
  uploadDrawerPinned = options.pinned !== false;
  syncUploadDrawer();
  if (options.focusUrl) {
    imageUrlInput.focus();
  }
}

function closeUploadDrawer() {
  if (!uploadCard) {
    return;
  }
  uploadDrawerPinned = false;
  imageUrlInput.value = "";
  clearPendingImageSelection();
  resetCameraCard();
  syncUploadDrawer();
  setComposerQuickActionsOpen(false);
  if (isImageMode(activeMode)) {
    setMode("outfit", { silent: true });
  }
}

function resetGuidedFlow() {
  guidedFlow = null;
}

function getOpenerSuggestions() {
  return [
    { label: "Find my outfit", action: "mode", mode: "outfit" },
    { label: "Get inspired", action: "mode", mode: "inspire" },
    { label: "Complete my look", action: "mode", mode: "complete" },
    { label: "Customer care", action: "support", supportType: "help" },
  ];
}

function getStylingQuestionSequence() {
  return [
    {
      key: "segment",
      prompt: "I’d love to help. Are you shopping for menswear or womenswear today?",
      options: profileOptions.segment,
    },
    {
      key: "occasion",
      prompt: "Got it. What’s the occasion? If you already know the budget or how you want it to feel, you can tell me that too.",
      options: profileOptions.occasion,
    },
    {
      key: "budget",
      prompt: "Perfect. Do you want me to keep this within a budget? If colour or fit matters, I can weave that in as well.",
      options: profileOptions.budget,
    },
    {
      key: "priority",
      prompt: "What matters most for this look? Comfort, polish, boldness, ease, or something else?",
      options: profileOptions.priority,
    },
    {
      key: "feel",
      prompt: "And how do you want this to feel on you?",
      options: profileOptions.feel,
    },
    {
      key: "notes",
      prompt: "Anything you want me to keep in mind on fit or colour? You can type it, or skip this.",
      options: ["Skip this"],
      freeform: true,
    },
  ];
}

function getCompleteLookRequirementSequence(requiredFields = [], imageAnalysis = null) {
  const anchorLabel = (imageAnalysis && imageAnalysis.anchor_item) || "this piece";
  const questionMap = {
    segment: {
      key: "segment",
      prompt: "Before I complete this, should I style it as menswear or womenswear?",
      options: profileOptions.segment,
    },
    occasion: {
      key: "occasion",
      prompt: `What’s the event or occasion for ${anchorLabel}?`,
      options: profileOptions.occasion,
    },
    weather: {
      key: "weather",
      prompt: "What weather should I build this for?",
      options: profileOptions.weather,
    },
  };

  return requiredFields
    .map((field) => questionMap[field])
    .filter(Boolean);
}

function inferSegmentFromText(value) {
  const normalized = ` ${String(value || "").toLowerCase()} `;
  if (/\b(menswear|mens|men|men's)\b/.test(normalized)) {
    return "menswear";
  }
  if (/\b(womenswear|womens|women|women's|ladies)\b/.test(normalized)) {
    return "womenswear";
  }
  return "";
}

function inferWeatherFromText(value) {
  const normalized = ` ${String(value || "").toLowerCase()} `;
  if (/\b(warm|hot|summer|humid)\b/.test(normalized)) {
    return "warm";
  }
  if (/\b(mild|spring|transitional)\b/.test(normalized)) {
    return "mild";
  }
  if (/\b(cold|winter|chilly|freezing)\b/.test(normalized)) {
    return "cold";
  }
  if (/\b(rain|rainy|wet|drizzle|showers)\b/.test(normalized)) {
    return "rainy";
  }
  return "";
}

function inferOccasionFromText(value) {
  const normalized = ` ${String(value || "").toLowerCase()} `;
  if (/\b(work|office|meeting|client|professional)\b/.test(normalized)) {
    return "work";
  }
  if (/\b(dinner|date|evening|night out|restaurant)\b/.test(normalized)) {
    return "smart casual dinner";
  }
  if (/\b(event|party|wedding|celebration|guest)\b/.test(normalized)) {
    return "event";
  }
  if (/\b(weekend|brunch|errands|day out)\b/.test(normalized)) {
    return "weekend";
  }
  if (/\b(travel|airport|holiday|vacation)\b/.test(normalized)) {
    return "travel";
  }
  return "";
}

function parseCompleteLookRequirementInput(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
  let segment = "";
  let occasion = "";
  let weather = "";
  const leftovers = [];

  parts.forEach((part) => {
    if (!segment) {
      const parsedSegment = inferSegmentFromText(part);
      if (parsedSegment) {
        segment = parsedSegment;
        return;
      }
    }
    if (!weather) {
      const parsedWeather = inferWeatherFromText(part);
      if (parsedWeather) {
        weather = parsedWeather;
        return;
      }
    }
    if (!occasion) {
      const parsedOccasion = inferOccasionFromText(part);
      if (parsedOccasion) {
        occasion = parsedOccasion;
        return;
      }
    }
    leftovers.push(part);
  });

  if (!segment) {
    segment = inferSegmentFromText(raw);
  }
  if (!weather) {
    weather = inferWeatherFromText(raw);
  }
  if (!occasion) {
    occasion = inferOccasionFromText(raw);
  }
  if (!occasion && leftovers.length) {
    occasion = leftovers[0];
  }

  return { segment, occasion, weather };
}

function buildCompleteLookRequirementPrompt(requiredFields = [], imageAnalysis = null) {
  const anchorLabel = (imageAnalysis && imageAnalysis.anchor_item) || "this piece";
  const labels = {
    segment: "menswear or womenswear",
    occasion: "the event or occasion",
    weather: "the weather",
  };
  const requested = requiredFields
    .map((field) => labels[field])
    .filter(Boolean)
    .join(", ");

  if (!requested) {
    return `Reply in chat with the styling details for ${anchorLabel}.`;
  }

  return `Reply in chat with ${requested} for ${anchorLabel}. For example: "menswear, smart casual dinner, mild weather".`;
}

function getSupportTopicSuggestions() {
  return [
    { label: "Track order", action: "support_topic", prompt: "Track my order" },
    { label: "Return item", action: "support_topic", prompt: "I need help with a return" },
    { label: "Exchange item", action: "support_topic", prompt: "I need help with an exchange" },
    { label: "Shipping", action: "support_topic", prompt: "I have a shipping question" },
    { label: "Speak to someone", action: "support_topic", prompt: "I need to speak to a person" },
  ];
}

function getImageActionSuggestions() {
  return [
    { label: "Use camera", action: "camera" },
    { label: "Upload image", action: "upload" },
  ];
}

function handleImageActionSelection(option) {
  if (!option) {
    return;
  }

  setComposerQuickActionsOpen(false);

  if (option.action === "camera") {
    openCameraCapture();
    return;
  }

  if (option.action === "upload") {
    launchImagePicker("upload");
  }
}

function addOpeningConversation() {
  chatLog.innerHTML = "";
  homeViewActive = true;
  setMode("outfit", { silent: true });
  addMessage(
    "Hi — I’m your StyledGenie stylist. I can help you build an outfit, translate a look from an image, or handle order support. The more you share about the occasion, budget, fit, colour, or how you want to feel, the sharper I can make the recommendation. What are you shopping for today?",
    "bot"
  );
  addSuggestionChips(getOpenerSuggestions(), (option) => handleStarterSelection(option), "opening");
  syncHeaderHomeButton();
}

function askGuidedQuestion() {
  if (!guidedFlow) {
    return;
  }

  const question = guidedFlow.questions[guidedFlow.stepIndex];
  if (!question) {
    completeGuidedFlow();
    return;
  }

  clearActivePromptPanels();
  addMessage(question.prompt, "bot");
  renderGuidedQuestionOptions(question);
}

function renderGuidedQuestionOptions(question) {
  if (!question || !question.options || !question.options.length) {
    return;
  }

  addSuggestionChips(
    question.options.map((label) => ({ label, value: label })),
    (option) => handleGuidedAnswer(option.value, option.label),
    "contextual"
  );
}

function startCompleteLookRequirementFlow(requiredFields = [], imageAnalysis = null, options = {}) {
  if (!requiredFields.length) {
    return;
  }

  clearActivePromptPanels();
  guidedFlow = {
    type: "complete_requirements",
    requiredFields,
    imageAnalysis,
    stepIndex: 0,
    questions: getCompleteLookRequirementSequence(requiredFields, imageAnalysis),
  };

  if (!options.renderFirstQuestionInline) {
    addMessage("I just need a few guided details before I complete this properly.", "bot");
  }
  askGuidedQuestion();
}

function promptDecisionModeForOutfit(request) {
  if (!request) {
    return;
  }

  pendingDecisionRequest = request;
  clearActivePromptPanels();
  addMessage(
    request.promptText || "Do you want a few options, or do you want me to pick the best one for you?",
    "bot"
  );
  addSuggestionChips(
    [
      { label: "Show me options", value: false },
      { label: "Decide for me", value: true },
    ],
    (option) => {
      addMessage(option.label, "user");
      const queuedRequest = pendingDecisionRequest;
      pendingDecisionRequest = null;
      if (!queuedRequest) {
        return;
      }
      void sendTextChat(queuedRequest.rawMessage, {
        profileInputs: queuedRequest.profileInputs,
        displayText: queuedRequest.displayText,
        skipDecisionPrompt: true,
        skipUserEcho: true,
        decisionMode: option.value,
      });
    },
    "contextual"
  );
}

function startOutfitConversation(openingRequest = "") {
  homeViewActive = false;
  setMode("outfit");
  resetGuidedFlow();

  if (!openingRequest) {
    addMessage(
      "Tell me what you’re shopping for, where you’ll wear it, or how you want it to feel, and I’ll shape the look from there. You can type or tap the mic.",
      "bot"
    );
  }

  addSuggestionChips(
    welcomeContent.outfit.prompts.map((label) => ({ label, prompt: label })),
    (option) => {
      addMessage(option.label, "user");
      void sendTextChat(option.prompt, {
        displayText: option.label,
        skipUserEcho: true,
      });
    },
    "contextual"
  );
}

function startImageConversation(flowType) {
  const isInspire = flowType === "inspire";
  shopperProfileDraft = createEmptyProfileDraft();
  pendingStylingFollowUpField = null;
  homeViewActive = false;
  setMode(isInspire ? "inspire" : "complete");
  resetGuidedFlow();
  clearActivePromptPanels();
  addMessage(
    isInspire
      ? "Use the + button beside the message box to upload or take a photo of the look you like. I’ll read the garments, palette, and overall mood first, then recreate it from the catalog."
      : "Use the + button beside the message box to upload or take a photo of what you’re styling. I’ll read the anchor piece, palette, and silhouette first, then build the rest around it. A full-length photo helps with layers, shoes, and proportions.",
    "bot"
  );
  addSuggestionChips(getImageActionSuggestions(), (option) => handleImageActionSelection(option), "contextual");
}

function startSupportConversation(type) {
  homeViewActive = false;
  setMode("support");
  resetGuidedFlow();

  if (type === "track") {
    addMessage(
      "I can help with that. Send your order number or the email used at checkout, and I’ll pull the live order status from Shopify.",
      "bot"
    );
    return;
  }

  addMessage(
    "Of course. What do you need help with right now?",
    "bot"
  );
  addSuggestionChips(getSupportTopicSuggestions(), (option) => {
    addMessage(option.label, "user");
    sendTextChat(option.prompt, {
      displayText: option.label,
      profileInputs: null,
    });
  });
}

function activateFeature(mode, options = {}) {
  const {
    announce = true,
    userLabel = "",
    supportType = "help",
    openingRequest = "",
  } = options;

  if (announce && userLabel) {
    addMessage(userLabel, "user");
  }

  homeViewActive = false;
  syncHeaderHomeButton(mode);

  if (mode === "support") {
    startSupportConversation(supportType);
    return;
  }

  if (mode === "complete") {
    startImageConversation("complete");
    return;
  }

  if (mode === "inspire") {
    startImageConversation("inspire");
    return;
  }

  startOutfitConversation(openingRequest);
}

function handleStarterSelection(option) {
  if (!option) {
    return;
  }

  if (option.action === "mode" && option.mode) {
    activateFeature(option.mode, {
      announce: true,
      userLabel: option.label,
      openingRequest: option.prompt || "",
    });
    return;
  }

  if (option.action === "support") {
    activateFeature("support", {
      announce: true,
      userLabel: option.label,
      supportType: option.supportType || "help",
    });
  }
}

function handleWelcomeAction(action) {
  if (!action) {
    return;
  }

  if (action.action === "mode" && action.mode) {
    activateFeature(action.mode, {
      announce: true,
      userLabel: action.label,
      openingRequest: action.prompt || "",
    });
    return;
  }

  if (action.action === "support") {
    activateFeature("support", {
      announce: true,
      userLabel: action.label,
      supportType: action.supportType || "help",
    });
  }
}

function handleGuidedAnswer(value, displayText = value) {
  if (!guidedFlow) {
    return;
  }

  const question = guidedFlow.questions[guidedFlow.stepIndex];
  if (!question) {
    return;
  }

  addMessage(displayText, "user");

  if (question.key === "segment") {
    shopperProfileDraft.segment = value === "Skip this" ? "" : value;
  } else if (question.key === "occasion") {
    shopperProfileDraft.occasion = value === "Skip this" ? "" : value;
  } else if (question.key === "weather") {
    shopperProfileDraft.weather = value === "Skip this" ? "" : value;
  } else if (question.key === "budget") {
    shopperProfileDraft.budget = value === "Skip this" ? "" : value;
  } else if (question.key === "priority") {
    shopperProfileDraft.priority = value === "Skip this" ? "" : value;
  } else if (question.key === "feel") {
    shopperProfileDraft.feel = value === "Skip this" ? "" : value;
  } else if (question.key === "notes") {
    if (String(value || "").toLowerCase().includes("skip")) {
      shopperProfileDraft.color_preference = "";
      shopperProfileDraft.fit_preference = "";
    } else {
      const normalized = String(value || "").trim();
      shopperProfileDraft.fit_preference = normalized;
    }
  }

  guidedFlow.stepIndex += 1;
  askGuidedQuestion();
}

function completeGuidedFlow() {
  if (!guidedFlow) {
    return;
  }

  const completedFlow = guidedFlow;
  resetGuidedFlow();

  if (completedFlow.type === "outfit") {
    const profileInputs = buildProfileInputsPayload();
    const contextPrompt = [
      completedFlow.openingRequest,
      buildProfileNarrative(profileInputs, "outfit"),
    ]
      .filter(Boolean)
      .join(" ");

    addMessage(
      "Lovely. I have enough to build a direction that feels tighter and more considered. If you want to refine it further afterwards, you can still tell me about fit, colour, comfort, or budget.",
      "bot"
    );
    sendTextChat(contextPrompt || "Build my outfit", {
      displayText: buildDisplaySummary(profileInputs) || completedFlow.openingRequest || "Build my outfit",
      profileInputs,
    });
    return;
  }

  if (completedFlow.type === "complete_requirements") {
    const selectedFile = getSelectedImageFile();
    const imageUrl = imageUrlInput.value.trim();
    if (selectedFile || imageUrl) {
      const anchorLabel = (completedFlow.imageAnalysis && completedFlow.imageAnalysis.anchor_item) || "your anchor piece";
      addMessage(
        `Perfect. I have the styling direction, occasion, and weather now, so I’ll complete this around ${anchorLabel}.`,
        "bot"
      );
      void sendImageChat("", selectedFile, imageUrl, {
        useProfileInputsForCompleteLook: true,
      });
      return;
    }

    addMessage(
      "I’ve got the styling context, but the image dropped out of the thread. Use the + button once more and I’ll pick it up from there.",
      "bot"
    );
    return;
  }

  if (completedFlow.type === "inspire" || completedFlow.type === "complete") {
    addSuggestionChips(getImageActionSuggestions(), (option) => handleImageActionSelection(option), "contextual");
  }
}

function detectSupportIntent(message) {
  const normalized = String(message || "").toLowerCase();
  return ["track", "return", "exchange", "refund", "shipping", "delivery", "order", "size", "fit", "human", "agent", "damaged", "wrong item"].some(
    (token) => normalized.includes(token)
  );
}

function detectInspirationIntent(message) {
  const normalized = String(message || "").toLowerCase();
  return ["inspire", "inspiration", "recreate", "celebrity", "look like this", "vibe"].some((token) =>
    normalized.includes(token)
  );
}

function setPresenceState(state = "online") {
  if (!widgetPresence) {
    return;
  }

  widgetPresence.classList.toggle("online", state === "online");
  widgetPresence.classList.toggle("offline", state === "offline");

  if (widgetStatusPill) {
    widgetStatusPill.textContent = state === "offline" ? "Offline" : "Online now";
  }
}

async function loadChatbotCustomization(options = {}) {
  const { silent = false } = options;

  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/workspace`);
    if (!response.ok) {
      setPresenceState("offline");
      return;
    }

    const data = await response.json();
    setPresenceState("online");
    const nextFingerprint = getCustomizationFingerprint(data.chatbot_customization);

    if (!silent || nextFingerprint !== latestCustomizationFingerprint) {
      applyChatbotCustomization(data.chatbot_customization);
      latestCustomizationFingerprint = nextFingerprint;
    }
  } catch (error) {
    setPresenceState("offline");
    // Keep the widget usable even if customization cannot be loaded.
  }
}

function startCustomizationRefreshLoop() {
  window.setInterval(() => {
    loadChatbotCustomization({ silent: true });
  }, customizationRefreshIntervalMs);
}

const loadingCopy = {
  outfit: "Thinking through a look that feels polished, wearable, and right for you...",
  inspire: "Reading the image and translating the mood into real store pieces...",
  complete: "Balancing the finishing pieces around your anchor item...",
  support: "Checking the practical details for you now...",
};

function addMessage(text, role) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = createMessageAvatar(role);
  const stack = document.createElement("div");
  stack.className = "message-stack";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.textContent =
    role === "bot" ? widgetAssistantName.textContent || defaultAssistantName : buildUserAuthorLabel();
  const time = document.createElement("span");
  time.textContent = formatMessageTime();
  meta.append(author, time);

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;

  const parts = role === "bot" ? buildBotMessageContent(text) : createMessageParagraphs(text);
  parts.forEach((part) => bubble.appendChild(part));

  stack.append(meta, bubble);
  appendMessageRowAvatar(row, stack, avatar, role);
  chatLog.appendChild(row);
  scrollChatToBottom();
}

function addWelcomeCard(mode) {
  const content = welcomeContent[mode];
  if (!content) {
    return;
  }

  const card = document.createElement("section");
  card.className = "welcome-card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "welcome-eyebrow";
  eyebrow.textContent = content.eyebrow;

  const title = document.createElement("h3");
  title.className = "welcome-title";
  title.textContent = content.title;

  const body = document.createElement("p");
  body.className = "welcome-copy";
  body.textContent = content.body;

  const actionRow = document.createElement("div");
  actionRow.className = "welcome-action-row";

  quickEntryActions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "welcome-action";
    button.textContent = action.label;
    button.addEventListener("click", () => handleWelcomeAction(action));
    actionRow.appendChild(button);
  });

  const chipRow = document.createElement("div");
  chipRow.className = "quick-prompt-row";

  content.prompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-prompt";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      if (isGuidedFeature(mode)) {
        activateFeature(mode, {
          announce: true,
          userLabel: prompt,
          openingRequest: prompt,
        });
        return;
      }

      sendTextChat(prompt, {
        displayText: prompt,
      });
    });
    chipRow.appendChild(button);
  });

  card.append(eyebrow, title, body, actionRow, chipRow);

  const composer = buildProfileComposer(mode);
  if (composer) {
    card.appendChild(composer);
  }
  chatLog.appendChild(card);
  scrollChatToBottom();
}

function isImageMode(mode) {
  return mode === "inspire" || mode === "complete";
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64Payload = ""] = result.split(",", 2);
      resolve(base64Payload);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function cameraSupported() {
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (cameraVideo) {
    cameraVideo.srcObject = null;
  }
}

function resetCameraCard() {
  stopCameraStream();
  cameraCaptureReady = false;
  if (cameraCard) {
    cameraCard.classList.add("hidden");
  }
  if (cameraStillImage) {
    cameraStillImage.classList.add("hidden");
    cameraStillImage.removeAttribute("src");
  }
  if (cameraVideo) {
    cameraVideo.classList.remove("hidden");
  }
  if (capturePhotoButton) {
    capturePhotoButton.classList.remove("hidden");
  }
  if (retakePhotoButton) {
    retakePhotoButton.classList.add("hidden");
  }
  if (confirmPhotoButton) {
    confirmPhotoButton.classList.add("hidden");
  }
  syncUploadDrawer();
}

function clearPendingImageSelection(options = {}) {
  const preserveInput = Boolean(options.preserveInput);
  if (pendingImageSelection && pendingImageSelection.previewUrl && pendingImageSelection.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(pendingImageSelection.previewUrl);
  }
  pendingImageSelection = null;
  clearPendingImagePreview();
  if (uploadPreview) {
    uploadPreview.classList.add("hidden");
  }
  if (uploadPreviewImage) {
    uploadPreviewImage.removeAttribute("src");
  }
  if (uploadPreviewLabel) {
    uploadPreviewLabel.textContent = "Image ready";
  }
  if (!preserveInput) {
    imageInput.value = "";
  }
  syncUploadDrawer();
}

function setPendingImageSelection(file, previewUrl, label) {
  clearPendingImageSelection({ preserveInput: true });
  pendingImageSelection = {
    file,
    previewUrl,
    label,
  };
  if (uploadPreviewImage) {
    uploadPreviewImage.src = previewUrl;
  }
  if (uploadPreviewLabel) {
    uploadPreviewLabel.textContent = label;
  }
  if (uploadPreview) {
    uploadPreview.classList.remove("hidden");
  }
  uploadDrawerPinned = true;
  syncUploadDrawer();
}

function getSelectedImageFile() {
  return (pendingImageSelection && pendingImageSelection.file) || imageInput.files[0] || null;
}

function addImageFlowReadyMessage() {
  const followUp =
    activeMode === "inspire"
      ? "Perfect — I have the image. Tap Analyze now and I’ll read the palette, key garments, and overall mood first."
      : "Perfect — I have the image. Tap Analyze now and I’ll read the anchor piece, palette, and silhouette first. A full-length photo helps if you want proportion and shoe guidance.";
  addMessage(followUp, "bot");
  const previewUrl =
    (pendingImageSelection && pendingImageSelection.previewUrl) || imageUrlInput.value.trim();
  const label =
    (pendingImageSelection && pendingImageSelection.label) ||
    (activeMode === "inspire" ? "Inspiration image ready" : "Look image ready");
  addPendingImagePreview(previewUrl, label);
  syncUploadDrawer();
}

function launchImagePicker(mode = "upload") {
  if (!imageInput) {
    return;
  }

  if (mode === "camera") {
    imageInput.setAttribute("capture", "environment");
  } else {
    imageInput.removeAttribute("capture");
  }

  imageInput.click();
}

async function openCameraCapture() {
  if (!cameraSupported() || !cameraCard || !cameraVideo) {
    launchImagePicker("camera");
    return;
  }

  clearPendingImageSelection();
  resetCameraCard();
  cameraCard.classList.remove("hidden");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
  } catch (error) {
    resetCameraCard();
    launchImagePicker("camera");
    addMessage(
      "I couldn’t open the live camera here, so I switched you to the device camera or photo picker instead.",
      "bot"
    );
  }
}

function captureCameraPhoto() {
  if (!cameraVideo || !cameraCanvas) {
    return;
  }
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    return;
  }

  cameraCanvas.width = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  const context = cameraCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
  cameraCanvas.toBlob((blob) => {
    if (!blob) {
      return;
    }

    const fileName =
      activeMode === "inspire"
        ? `styledgenie-inspiration-${Date.now()}.jpg`
        : `styledgenie-look-${Date.now()}.jpg`;
    const file = new File([blob], fileName, { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(blob);

    setPendingImageSelection(
      file,
      previewUrl,
      activeMode === "inspire"
        ? "Camera image ready for inspiration styling"
        : "Camera image ready to complete your look"
    );

    cameraStillImage.src = previewUrl;
    cameraStillImage.classList.remove("hidden");
    cameraVideo.classList.add("hidden");
    cameraCaptureReady = true;
    stopCameraStream();
    capturePhotoButton.classList.add("hidden");
    retakePhotoButton.classList.remove("hidden");
    confirmPhotoButton.classList.remove("hidden");
  }, "image/jpeg", 0.92);
}

function confirmCapturedPhoto() {
  if (!cameraCaptureReady) {
    return;
  }
  resetCameraCard();
  addImageFlowReadyMessage();
  chatInput.focus();
}

async function submitSelectedImageFlow() {
  if (activeMode === "support") {
    addMessage("For support, describe the issue here and I’ll guide the next step directly.", "bot");
    return;
  }

  const imageUrl = imageUrlInput.value.trim();
  const selectedFile = getSelectedImageFile();
  const value = chatInput.value.trim();

  if (!selectedFile && !imageUrl) {
    addMessage("Please use the camera, upload an image, or paste an image URL first.", "bot");
    return;
  }

  if (!isImageMode(activeMode)) {
    setMode(detectInspirationIntent(value) ? "inspire" : "complete", { silent: true });
  } else if (value && detectInspirationIntent(value) && activeMode !== "inspire") {
    setMode("inspire", { silent: true });
  }

  await sendImageChat(value, selectedFile, imageUrl);
}

function getCartRoot() {
  if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
    return window.Shopify.routes.root;
  }

  return null;
}

function canUseStorefrontCart() {
  return Boolean(getCartRoot());
}

function formatPrice(price) {
  if (price === null || price === undefined || price === "") {
    return "Price on product page";
  }

  const amount = Number(price);
  if (!Number.isNaN(amount)) {
    return `From ${amount.toFixed(2)}`;
  }

  return `From ${price}`;
}

function addDetectedTags(tags) {
  if (!tags || tags.length === 0) {
    return;
  }

  const tagRow = document.createElement("div");
  tagRow.className = "signal-row";

  tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;
    tagRow.appendChild(pill);
  });

  chatLog.appendChild(tagRow);
  scrollChatToBottom();
}

function addProfileSummary(profile) {
  if (!profile || (!profile.summary && (!profile.focus_points || !profile.focus_points.length))) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "profile-panel";

  const heading = document.createElement("p");
  heading.className = "profile-heading";
  heading.textContent = "What I’m optimizing for";
  panel.appendChild(heading);

  if (profile.summary) {
    const summary = document.createElement("p");
    summary.className = "profile-summary";
    summary.textContent = profile.summary;
    panel.appendChild(summary);
  }

  if (profile.focus_points && profile.focus_points.length) {
    const chipRow = document.createElement("div");
    chipRow.className = "profile-chip-row";

    profile.focus_points.forEach((point) => {
      const chip = document.createElement("span");
      chip.className = "profile-chip";
      chip.textContent = point;
      chipRow.appendChild(chip);
    });

    panel.appendChild(chipRow);
  }

  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function shouldPreserveImageForFollowUp(data) {
  if (!isImageMode(activeMode)) {
    return false;
  }

  if (Array.isArray(data.required_follow_up_fields) && data.required_follow_up_fields.length) {
    return true;
  }

  const hasRecommendations = Array.isArray(data.recommended_products) && data.recommended_products.length > 0;
  if (hasRecommendations) {
    return false;
  }

  const promptSet = new Set((data.follow_up_prompts || []).map((prompt) => String(prompt || "").toLowerCase()));
  const needsSegmentClarification = promptSet.has("menswear") && promptSet.has("womenswear");

  return needsSegmentClarification || !(data.ai_runtime && data.ai_runtime.active_segment);
}

function addNextPromptActions(prompts) {
  if (!prompts || prompts.length === 0) {
    return;
  }

  clearActivePromptPanels();

  const promptSet = new Set(prompts.map((prompt) => String(prompt || "").toLowerCase()));
  const isSegmentClarification =
    isImageMode(activeMode) && promptSet.has("menswear") && promptSet.has("womenswear");

  const panel = document.createElement("section");
  panel.className = "next-step-panel";

  const heading = document.createElement("p");
  heading.className = "next-step-heading";
  heading.textContent = isSegmentClarification
    ? "Confirm the styling direction and I’ll keep going with this same image."
    : "Want me to tighten this up? You can also share budget, colour, fit, or comfort notes.";
  panel.appendChild(heading);

  const row = document.createElement("div");
  row.className = "next-step-row";

  prompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "next-step-chip";
    button.textContent = prompt;
    button.addEventListener("click", async () => {
      if (isImageMode(activeMode)) {
        const selectedFile = getSelectedImageFile();
        const imageUrl = imageUrlInput.value.trim();
        if ((selectedFile || imageUrl) && ["menswear", "womenswear"].includes(prompt.toLowerCase())) {
          shopperProfileDraft.segment = prompt.toLowerCase();
          chatInput.value = "";
          await sendImageChat(prompt, selectedFile, imageUrl, {
            useProfileInputsForCompleteLook: activeMode === "complete",
          });
          return;
        }

        chatInput.value = prompt;
        chatInput.focus();
        return;
      }

      await sendTextChat(prompt, {
        displayText: prompt,
        followUpField: pendingStylingFollowUpField,
      });
    });
    row.appendChild(button);
  });

  panel.appendChild(row);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function showTypingState(mode) {
  const row = document.createElement("div");
  row.className = "message-row bot typing-message";
  row.dataset.typing = "true";

  const avatar = createMessageAvatar("bot");
  if (avatar) {
    row.appendChild(avatar);
  }

  const stack = document.createElement("div");
  stack.className = "message-stack";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.textContent = widgetAssistantName.textContent || defaultAssistantName;
  const time = document.createElement("span");
  time.textContent = "now";
  meta.append(author, time);

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  const text = document.createElement("span");
  text.className = "typing-copy";
  text.textContent = loadingCopy[mode] || "Thinking through the best options...";

  const bubble = document.createElement("div");
  bubble.className = "message bot";
  bubble.append(dots, text);

  stack.append(meta, bubble);
  row.appendChild(stack);
  chatLog.appendChild(row);
  scrollChatToBottom();
  return row;
}

function removeTypingState(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

function addImageUploadMessage(previewUrl, caption = "") {
  if (!previewUrl) {
    return;
  }

  const row = document.createElement("div");
  row.className = "message-row user";
  const avatar = createMessageAvatar("user");

  const stack = document.createElement("div");
  stack.className = "message-stack";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.textContent = buildUserAuthorLabel();
  const time = document.createElement("span");
  time.textContent = formatMessageTime();
  meta.append(author, time);

  const bubble = document.createElement("div");
  bubble.className = "message user attachment";

  const image = document.createElement("img");
  image.className = "message-attachment-image";
  image.src = previewUrl;
  image.alt = caption || "Uploaded styling reference";
  image.loading = "lazy";
  bubble.appendChild(image);

  if (caption) {
    const text = document.createElement("p");
    text.className = "message-attachment-caption";
    text.textContent = caption;
    bubble.appendChild(text);
  }

  stack.append(meta, bubble);
  appendMessageRowAvatar(row, stack, avatar, "user");
  chatLog.appendChild(row);
  scrollChatToBottom();
}

function clearPendingImagePreview() {
  if (pendingImagePreviewNode && pendingImagePreviewNode.parentNode) {
    pendingImagePreviewNode.parentNode.removeChild(pendingImagePreviewNode);
  }
  pendingImagePreviewNode = null;
}

function addPendingImagePreview(previewUrl, caption = "") {
  if (!previewUrl) {
    return;
  }

  clearPendingImagePreview();

  const row = document.createElement("div");
  row.className = "message-row user";
  const avatar = createMessageAvatar("user");

  const stack = document.createElement("div");
  stack.className = "message-stack";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.textContent = buildUserAuthorLabel();
  const time = document.createElement("span");
  time.textContent = formatMessageTime();
  meta.append(author, time);

  const bubble = document.createElement("div");
  bubble.className = "message user attachment pending-image-bubble";

  const image = document.createElement("img");
  image.className = "message-attachment-image";
  image.src = previewUrl;
  image.alt = caption || "Selected styling image";
  image.loading = "lazy";
  bubble.appendChild(image);

  if (caption) {
    const text = document.createElement("p");
    text.className = "message-attachment-caption";
    text.textContent = caption;
    bubble.appendChild(text);
  }

  const actions = document.createElement("div");
  actions.className = "pending-image-actions";

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "primary-action";
  analyzeButton.textContent = "Analyze now";
  analyzeButton.addEventListener("click", async () => {
    analyzeButton.disabled = true;
    await submitSelectedImageFlow();
  });

  const replaceButton = document.createElement("button");
  replaceButton.type = "button";
  replaceButton.className = "secondary-action";
  replaceButton.textContent = "Replace image";
  replaceButton.addEventListener("click", () => {
    launchImagePicker("upload");
  });

  actions.append(analyzeButton, replaceButton);
  bubble.appendChild(actions);

  stack.append(meta, bubble);
  appendMessageRowAvatar(row, stack, avatar, "user");
  chatLog.appendChild(row);
  pendingImagePreviewNode = row;
  scrollChatToBottom();
}

function addLookPreview(products, mode, profile) {
  if (!products || products.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "look-preview-panel";

  const heading = document.createElement("p");
  heading.className = "look-preview-heading";
  heading.textContent =
    mode === "inspire"
      ? "Shoppable version of the inspiration"
      : mode === "complete"
        ? "Finished around your anchor piece"
        : "Complete outfit direction";

  const summary = document.createElement("p");
  summary.className = "look-preview-summary";
  const summaryBits = [];
  if (profile && profile.segment_preference) {
    summaryBits.push(profile.segment_preference);
  }
  if (profile && profile.occasion_context) {
    summaryBits.push(profile.occasion_context);
  }
  summaryBits.push(`${products.length}-piece edit`);
  summary.textContent = summaryBits.join(" • ");

  const visual = document.createElement("div");
  visual.className = "look-preview-visual";

  const leadMedia = document.createElement("div");
  leadMedia.className = "look-preview-lead";
  leadMedia.appendChild(buildImageTile(products[0]));
  visual.appendChild(leadMedia);

  const stack = document.createElement("div");
  stack.className = "look-preview-stack";
  products.slice(1, 4).forEach((product) => {
    const thumb = document.createElement("div");
    thumb.className = "look-preview-thumb";
    thumb.appendChild(buildImageTile(product));
    stack.appendChild(thumb);
  });
  if (stack.childElementCount) {
    visual.appendChild(stack);
  }

  panel.append(heading, summary, visual);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function addImageAnalysisSummary(imageAnalysis, runtime, tags) {
  if (!imageAnalysis && (!runtime || !runtime.vision_requested || !runtime.vision_summary)) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "vision-panel";

  const heading = document.createElement("p");
  heading.className = "vision-heading";
  heading.textContent = "What I noticed";

  const summary = document.createElement("p");
  summary.className = "vision-summary";
  summary.textContent = (imageAnalysis && imageAnalysis.summary) || runtime.vision_summary;

  panel.append(heading, summary);

  const observationLines =
    (imageAnalysis && imageAnalysis.observation_lines && imageAnalysis.observation_lines.length
      ? imageAnalysis.observation_lines
      : []
    );

  if (observationLines.length) {
    const list = document.createElement("div");
    list.className = "vision-observation-list";
    observationLines.slice(0, 5).forEach((line) => {
      const item = document.createElement("p");
      item.className = "vision-observation-line";
      item.textContent = line;
      list.appendChild(item);
    });
    panel.appendChild(list);
  } else {
    const observationBits = [
      ...new Set([...(runtime.vision_objects || []).slice(0, 2), ...(runtime.vision_labels || []).slice(0, 2)]),
    ].slice(0, 3);
    if (observationBits.length) {
      const detail = document.createElement("p");
      detail.className = "vision-summary";
      detail.textContent = `I’m reading ${observationBits.join(", ")} as the strongest visual signals here.`;
      panel.appendChild(detail);
    }
  }

  if (imageAnalysis && imageAnalysis.quality_note) {
    const detail = document.createElement("p");
    detail.className = "vision-quality-note";
    detail.textContent = imageAnalysis.quality_note;
    panel.appendChild(detail);
  }

  const cueTags = [
    ...((imageAnalysis && imageAnalysis.palette) || []),
    ...((imageAnalysis && imageAnalysis.garment_types) || []),
    ...((imageAnalysis && imageAnalysis.color_harmony_cues) || []),
    ...((imageAnalysis && imageAnalysis.style_direction ? [imageAnalysis.style_direction] : [])),
    ...(tags || []),
    ...((runtime && runtime.vision_labels) || []).slice(0, 3),
  ];
  const uniqueCueTags = [...new Set(cueTags.filter(Boolean))].slice(0, 8);
  if (uniqueCueTags.length) {
    const row = document.createElement("div");
    row.className = "signal-row";
    uniqueCueTags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      row.appendChild(pill);
    });
    panel.appendChild(row);
  }

  if (imageAnalysis && imageAnalysis.follow_up_question) {
    const followUp = document.createElement("p");
    followUp.className = "vision-follow-up";
    followUp.textContent = imageAnalysis.follow_up_question;
    panel.appendChild(followUp);
  }

  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function buildImageTile(product) {
  if (product.image_url) {
    const image = document.createElement("img");
    image.className = "recommendation-image";
    image.src = product.image_url;
    image.alt = product.title;
    image.loading = "lazy";
    return image;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "recommendation-placeholder";
  placeholder.textContent = (product.category || "Style").slice(0, 14);
  return placeholder;
}

function buildCartAttributionProperties(product) {
  return {
    _sg_assisted: "true",
    _sg_flow: (latestRecommendationContext && latestRecommendationContext.mode) || backendModes[activeMode],
    _sg_customer_id: customerId,
    _sg_product_id: product.id,
    _sg_source: "styledgenie_widget",
    _sg_timestamp: new Date().toISOString(),
  };
}

function normalizeCartVariantId(variantId) {
  const parsedVariantId = Number(variantId);
  return Number.isNaN(parsedVariantId) ? variantId : parsedVariantId;
}

async function fetchStorefrontProductData(handle, cartRoot) {
  const normalizedHandle = String(handle || "").trim();
  if (!normalizedHandle || !cartRoot) {
    return null;
  }

  const cacheKey = `${cartRoot}|${normalizedHandle}`;
  if (storefrontProductCache.has(cacheKey)) {
    return storefrontProductCache.get(cacheKey);
  }

  try {
    const response = await fetch(`${cartRoot}products/${encodeURIComponent(normalizedHandle)}.js`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    storefrontProductCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    return null;
  }
}

async function resolveStorefrontCartVariant(product, cartRoot) {
  const productData = await fetchStorefrontProductData(product.handle, cartRoot);
  if (!productData || !Array.isArray(productData.variants)) {
    return {
      variantId: product.cart_variant_id ? normalizeCartVariantId(product.cart_variant_id) : null,
      source: product.cart_variant_id ? "catalog" : "missing",
    };
  }

  const currentVariantId = String(product.cart_variant_id || "");
  const exactVariant = productData.variants.find((variant) => String(variant.id) === currentVariantId);
  if (exactVariant && exactVariant.available) {
    return { variantId: exactVariant.id, source: "storefront_exact" };
  }

  const firstAvailableVariant = productData.variants.find((variant) => variant && variant.available);
  if (firstAvailableVariant) {
    return {
      variantId: firstAvailableVariant.id,
      source: exactVariant ? "storefront_recovery" : "storefront_available",
    };
  }

  return { variantId: null, source: "sold_out" };
}

async function requestCartAdd(cartRoot, items) {
  const response = await fetch(`${cartRoot}cart/add.js`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ items }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok || (payload && payload.errors)) {
    const detail =
      (payload && (payload.description || payload.message || payload.errors)) ||
      `Cart add failed with HTTP ${response.status}`;
    const error = new Error(String(detail));
    error.payload = payload;
    throw error;
  }

  return payload;
}

function buildCartFailureMessage(product, error, context = "single") {
  const detail = String((error && error.message) || "").toLowerCase();
  const productTitle = product && product.title ? product.title : "that item";

  if (detail.includes("sold out") || detail.includes("unavailable")) {
    return context === "bulk"
      ? "Some pieces in this look are unavailable right now, so I only kept the items that are still sellable."
      : `${productTitle} is unavailable right now. Open the product page to choose another option there.`;
  }

  return context === "bulk"
    ? "I couldn’t add the full look in one step, but you can still open each product page and add the pieces individually."
    : "I couldn’t add that product to the cart just now. Please open the product page and try again there.";
}

async function addSingleProductToCartWithRecovery(product, cartRoot) {
  const variantSelection = await resolveStorefrontCartVariant(product, cartRoot);
  if (!variantSelection.variantId) {
    return {
      ok: false,
      code: variantSelection.source || "missing_variant",
      message: `${product.title} is unavailable on the storefront right now.`,
    };
  }

  try {
    await requestCartAdd(cartRoot, [
      {
        id: variantSelection.variantId,
        quantity: 1,
        properties: buildCartAttributionProperties(product),
      },
    ]);
    return {
      ok: true,
      code: variantSelection.source,
      variantId: variantSelection.variantId,
    };
  } catch (error) {
    return {
      ok: false,
      code: variantSelection.source,
      message: buildCartFailureMessage(product, error, "single"),
    };
  }
}

async function addProductToCart(product, button) {
  if (!product.cart_variant_id && !product.handle) {
    addMessage(
      "This product is not cart-ready yet. Open the product page to choose a live variant there.",
      "bot"
    );
    return;
  }

  const cartRoot = getCartRoot();
  if (!cartRoot) {
    addMessage(
      "Add to cart works when this widget runs inside the Shopify storefront. In this local demo, use View Product instead.",
      "bot"
    );
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const result = await addSingleProductToCartWithRecovery(product, cartRoot);
    if (!result.ok) {
      throw new Error(result.message || "Cart add failed");
    }

    button.textContent = "Added";
    addMessage(
      result.code === "storefront_recovery" || result.code === "storefront_available"
        ? `I added the nearest available variant of ${product.title} to the cart.`
        : `${product.title} was added to the cart.`,
      "bot"
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    addMessage(buildCartFailureMessage(product, error, "single"), "bot");
  }
}

async function addProductsToCartBulk(products, button) {
  const validProducts = (products || []).filter((product) => product && (product.cart_variant_id || product.handle));
  if (!validProducts.length) {
    addMessage("These pieces are not cart-ready yet, so I can’t add the full look in one step.", "bot");
    return;
  }

  const cartRoot = getCartRoot();
  if (!cartRoot) {
    addMessage(
      "Add all to cart works when this widget runs inside the Shopify storefront. In this local demo, use View Product instead.",
      "bot"
    );
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const preparedItems = await Promise.all(
      validProducts.map(async (product) => {
        const variantSelection = await resolveStorefrontCartVariant(product, cartRoot);
        return variantSelection.variantId
          ? {
              product,
              item: {
                id: variantSelection.variantId,
                quantity: 1,
                properties: buildCartAttributionProperties(product),
              },
            }
          : null;
      })
    );

    const sellableItems = preparedItems.filter(Boolean);
    if (!sellableItems.length) {
      throw new Error("sold out");
    }

    await requestCartAdd(
      cartRoot,
      sellableItems.map((entry) => entry.item)
    );

    button.textContent = "Added";
    const skippedCount = validProducts.length - sellableItems.length;
    addMessage(
      skippedCount > 0
        ? `I added ${sellableItems.length} pieces to the cart. ${skippedCount} item${skippedCount === 1 ? "" : "s"} need${skippedCount === 1 ? "s" : ""} to be opened on the product page instead.`
        : "I added the selected look to your cart.",
      "bot"
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    addMessage(buildCartFailureMessage(validProducts[0], error, "bulk"), "bot");
  }
}

function createRecommendationCard(product, options = {}) {
  const card = document.createElement("article");
  card.className = `recommendation-card${options.compact ? " recommendation-card--compact" : ""}`;

  const media = document.createElement("div");
  media.className = `recommendation-media${options.compact ? " recommendation-media--compact" : ""}`;
  media.appendChild(buildImageTile(product));

  const body = document.createElement("div");
  body.className = "recommendation-body";

  const topline = document.createElement("div");
  topline.className = "recommendation-topline";

  const category = document.createElement("span");
  category.className = "recommendation-category";
  category.textContent = product.category || "Catalog pick";

  const price = document.createElement("span");
  price.className = "recommendation-price";
  price.textContent = formatPrice(product.price);

  topline.append(category, price);

  const title = document.createElement("h3");
  title.className = "recommendation-title";
  title.textContent = product.title;

  const reason = document.createElement("p");
  reason.className = "recommendation-reason";
  reason.textContent = product.reason;

  const actions = document.createElement("div");
  actions.className = "recommendation-actions";

  if (product.product_url) {
    const link = document.createElement("a");
    link.className = "secondary-action";
    link.href = product.product_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "View Product";
    actions.appendChild(link);
  }

  const addButton = document.createElement("button");
  addButton.className = "primary-action";
  addButton.type = "button";
  addButton.textContent = "Add to Cart";
  addButton.disabled = !product.cart_variant_id;
  addButton.addEventListener("click", () => addProductToCart(product, addButton));
  actions.appendChild(addButton);

  body.append(topline, title);
  if (!options.compact) {
    body.append(reason, actions);
  } else {
    body.append(actions);
  }
  card.append(media, body);
  return card;
}

function addRecommendationCards(products, options = {}) {
  if (!products || products.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = `recommendation-panel${options.compact ? " recommendation-panel--compact" : ""}`;
  const renderMode = options.mode || activeMode;

  const heading = document.createElement("p");
  heading.className = "recommendation-heading";
  heading.textContent =
    options.heading ||
    (renderMode === "inspire"
      ? "Closest store matches"
      : renderMode === "complete"
        ? "Here’s how I’d complete this look"
        : "Recommended picks");
  panel.appendChild(heading);

  if (options.intro) {
    const intro = document.createElement("p");
    intro.className = "recommendation-intro";
    intro.textContent = options.intro;
    panel.appendChild(intro);
  }

  const shouldGroupBySlot =
    Boolean(options.groupBySupportSlot) &&
    products.some((product) => product.support_slot);

  if (shouldGroupBySlot) {
    const groups = new Map();
    products.forEach((product) => {
      const slotLabel = product.support_slot || "Recommended pick";
      if (!groups.has(slotLabel)) {
        groups.set(slotLabel, []);
      }
      groups.get(slotLabel).push(product);
    });

    const groupedList = document.createElement("div");
    groupedList.className = "recommendation-groups";

    groups.forEach((groupProducts, slotLabel) => {
      const group = document.createElement("div");
      group.className = "recommendation-group";

      const slotHeading = document.createElement("p");
      slotHeading.className = "recommendation-slot-heading";
      slotHeading.textContent = slotLabel;
      group.appendChild(slotHeading);

      const slotList = document.createElement("div");
      slotList.className = `recommendation-list${options.compact ? " recommendation-list--compact" : ""}`;
      groupProducts.forEach((product) => {
        slotList.appendChild(createRecommendationCard(product, options));
      });
      group.appendChild(slotList);
      groupedList.appendChild(group);
    });

    panel.appendChild(groupedList);
  } else {
    const list = document.createElement("div");
    list.className = `recommendation-list${options.compact ? " recommendation-list--compact" : ""}`;
    products.forEach((product) => {
      list.appendChild(createRecommendationCard(product, options));
    });
    panel.appendChild(list);
  }

  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function addStylingInsights(insights) {
  if (!insights || insights.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "insight-panel";

  const heading = document.createElement("p");
  heading.className = "insight-heading";
  heading.textContent = "Why this works";
  panel.appendChild(heading);

  const list = document.createElement("div");
  list.className = "insight-list";

  insights.forEach((insight) => {
    const item = document.createElement("article");
    item.className = "insight-item";

    const icon = document.createElement("div");
    icon.className = "insight-icon";
    icon.textContent = "✓";

    const copy = document.createElement("div");
    copy.className = "insight-copy";

    const title = document.createElement("p");
    title.className = "insight-title";
    title.textContent = insight.title;

    const detail = document.createElement("p");
    detail.className = "insight-detail";
    detail.textContent = insight.detail;

    copy.append(title, detail);
    item.append(icon, copy);
    list.appendChild(item);
  });

  panel.appendChild(list);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function addGapAnalysis(gapAnalysis) {
  if (!gapAnalysis || !Array.isArray(gapAnalysis.missing_items) || !gapAnalysis.missing_items.length) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "insight-panel gap-analysis-panel";

  const heading = document.createElement("p");
  heading.className = "insight-heading";
  heading.textContent = "What’s missing to complete this look";
  panel.appendChild(heading);

  if (gapAnalysis.anchor_item) {
    const anchor = document.createElement("p");
    anchor.className = "recommendation-intro";
    anchor.textContent = `I’m building this around ${gapAnalysis.anchor_item}.`;
    panel.appendChild(anchor);
  }

  const row = document.createElement("div");
  row.className = "hero-match-cues";
  gapAnalysis.missing_items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "hero-match-chip";
    chip.textContent = item;
    row.appendChild(chip);
  });
  panel.appendChild(row);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function getSwapLabelForProduct(product) {
  const text = `${product.category || ""} ${product.title || ""}`.toLowerCase();
  if (/(bag|clutch|crossbody|tote|satchel|purse|backpack)/.test(text)) {
    return { category: "bag", label: "Swap bag" };
  }
  if (/(shoe|sneaker|boot|heel|loafer|sandal)/.test(text)) {
    return { category: "shoes", label: "Swap shoes" };
  }
  if (/(jacket|blazer|coat|overshirt|outerwear)/.test(text)) {
    return { category: "jacket", label: "Swap jacket" };
  }
  if (/(bag|belt|hat|scarf|jewelry|accessor)/.test(text)) {
    return { category: "accessories", label: "Swap accessories" };
  }
  if (/(trouser|pant|jean|short|skirt)/.test(text)) {
    return { category: "trousers", label: "Swap trousers" };
  }
  if (/(shirt|blouse|top|tee|t-shirt|hoodie|sweater|knit|polo)/.test(text)) {
    return { category: "top", label: "Swap top" };
  }
  return null;
}

function getSmartSwapActions(context) {
  if (!context || !Array.isArray(context.products) || !context.products.length) {
    return [];
  }

  const seen = new Set();
  const products = context.mode === backendModes.inspire
    ? context.products.filter((item) => item.role !== "hero")
    : context.products;

  return products
    .map((product) => {
      const swapMeta = getSwapLabelForProduct(product);
      if (!swapMeta || seen.has(swapMeta.category)) {
        return null;
      }
      seen.add(swapMeta.category);
      return {
        type: `swap_${swapMeta.category}`,
        label: swapMeta.label,
        action: "swap",
        swapCategory: swapMeta.category,
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function renderSupportPayload(payload) {
  if (!payload) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "support-panel";

  const heading = document.createElement("p");
  heading.className = "support-heading";
  heading.textContent = payload.title || "Support update";
  panel.appendChild(heading);

  if (payload.summary) {
    const summary = document.createElement("p");
    summary.className = "support-summary";
    summary.textContent = payload.summary;
    panel.appendChild(summary);
  }

  const metaRows = [
    payload.order_reference ? ["Order", payload.order_reference] : null,
    payload.source
      ? ["Source", payload.source === "live" ? "Live Shopify data" : "Synced order snapshot"]
      : null,
    payload.fulfillment_status ? ["Status", payload.fulfillment_status] : null,
    payload.financial_status ? ["Payment", payload.financial_status] : null,
    payload.delivery_estimate ? ["Delivery", payload.delivery_estimate] : null,
  ].filter(Boolean);

  if (metaRows.length) {
    const meta = document.createElement("div");
    meta.className = "support-meta";
    metaRows.forEach(([labelText, valueText]) => {
      const row = document.createElement("div");
      row.className = "support-meta-row";

      const label = document.createElement("span");
      label.className = "support-meta-label";
      label.textContent = labelText;

      const value = document.createElement("span");
      value.className = "support-meta-value";
      value.textContent = valueText;

      row.append(label, value);
      meta.appendChild(row);
    });
    panel.appendChild(meta);
  }

  if (Array.isArray(payload.line_items) && payload.line_items.length) {
    const items = document.createElement("div");
    items.className = "support-items";

    payload.line_items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "support-item";

      const title = document.createElement("p");
      title.className = "support-item-title";
      title.textContent = item.quantity > 1 ? `${item.title} x${item.quantity}` : item.title;

      row.appendChild(title);
      if (item.unit_price) {
        const price = document.createElement("p");
        price.className = "support-item-price";
        price.textContent = item.unit_price;
        row.appendChild(price);
      }
      items.appendChild(row);
    });

    panel.appendChild(items);
  }

  if (Array.isArray(payload.actions) && payload.actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "support-action-row";

    payload.actions.forEach((action) => {
      if (action.kind === "link" && action.url) {
        const link = document.createElement("a");
        link.className = "secondary-action";
        link.href = action.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = action.label;
        actionRow.appendChild(link);
        return;
      }

      if (action.kind === "upload") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "feedback-action";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          uploadDrawerPinned = true;
          syncUploadDrawer();
          scrollChatToBottom();
        });
        actionRow.appendChild(button);
        return;
      }

      if (!action.prompt) {
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "feedback-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        void sendTextChat(action.prompt, {
          displayText: action.label,
          profileInputs: null,
        });
      });
      actionRow.appendChild(button);
    });

    if (actionRow.childNodes.length) {
      panel.appendChild(actionRow);
    }
  }

  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function getConversationActions(context) {
  const modeKey =
    context.mode === backendModes.inspire
      ? "inspire"
      : context.mode === backendModes.complete
        ? "complete"
        : context.mode === backendModes.support
          ? "support"
          : "outfit";

  let actions = conversationActionSets[modeKey] || [];
  if (getSmartSwapActions(context).length) {
    actions = actions.filter((action) => !["change_one_item", "swap_one_item"].includes(action.type));
  }
  if (context.decisionMode && modeKey === "outfit") {
    actions = actions.filter((action) => action.type !== "show_another_option");
  }
  return actions;
}

async function handleConversationAction(action, context, button, panel) {
  const buttons = panel.querySelectorAll("button");
  let typingState = null;
  const renderMode = context.uiMode || backendModeToUiMode(context.mode);
  const requestRecommendationAction = async (payload, { allowReducedContext = false } = {}) => {
    const attempt = async (body) => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/chat/refine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => null);
        return { response, data, error: null };
      } catch (error) {
        return { response: null, data: null, error };
      }
    };

    let result = await attempt(payload);
    const needsReducedContextRetry =
      allowReducedContext &&
      (result.error || !result.response || !result.response.ok || !result.data) &&
      (payload.image_analysis || payload.gap_analysis || payload.orchestration_context);

    if (needsReducedContextRetry) {
      const reducedPayload = {
        ...payload,
        image_analysis: null,
        gap_analysis: null,
        orchestration_context: null,
      };
      result = await attempt(reducedPayload);
    }

    const needsEssentialRetry =
      allowReducedContext &&
      (result.error || !result.response || !result.response.ok || !result.data);

    if (needsEssentialRetry) {
      result = await attempt({
        feedback_type: payload.feedback_type,
        refinement_prompt: payload.refinement_prompt,
        swap_category: payload.swap_category || null,
        mode: payload.mode,
        customer_id: payload.customer_id,
        recommended_product_ids: payload.recommended_product_ids || [],
        context_note: payload.context_note || null,
      });
    }

    if (result.error && !result.response && !result.data) {
      throw result.error;
    }

    return result;
  };
  const safeRenderActionResponse = (data, contextNote) => {
    try {
      renderBotResponse(data, contextNote, {
        uiMode: renderMode,
        backendMode: context.mode,
      });
    } catch (renderError) {
      console.error("StyledGenie action render error", renderError, data);
      const safeProducts = filterProductsForActiveSegment(
        (data && data.recommended_products) || [],
        data && data.shopper_profile,
        data && data.ai_runtime
      );
      const supportPayload = (data && data.support_payload) || null;
      const requiredFollowUpFields = Array.isArray(data && data.required_follow_up_fields)
        ? data.required_follow_up_fields
        : [];
      try {
        renderFallbackRecommendationResponse(
          data || { styling_insights: [], follow_up_prompts: [] },
          safeProducts,
          renderMode,
          supportPayload,
          renderMode === "complete" && requiredFollowUpFields.length > 0,
          Boolean((data && data.ai_runtime && data.ai_runtime.resolved_mode === "support") || supportPayload)
        );
      } catch (fallbackError) {
        console.error("StyledGenie fallback render error", fallbackError, data);
        addMessage(
          (data && data.reply) || "I couldn’t swap just that piece cleanly, but I can keep helping from here.",
          "bot"
        );
      }
    }
  };
  const buildSwapFallbackProfileInputs = () => {
    const profile = context.shopperProfile || null;
    if (!profile) {
      return null;
    }
    return {
      segment: profile.segment_preference || null,
      occasion: profile.occasion_context || null,
      weather: profile.weather_context || null,
      budget: profile.budget_context || null,
      priority: profile.priority_focus || null,
      feel: profile.feeling_goal || null,
      color_preference: Array.isArray(profile.color_preferences) ? profile.color_preferences[0] || null : null,
      fit_preference: Array.isArray(profile.fit_preferences) ? profile.fit_preferences[0] || null : null,
    };
  };
  const requestSwapTextFallback = async () => {
    const outfitSummary = Array.isArray(context.products)
      ? context.products
          .map((item) => `${item.title || "item"} (${item.support_slot || item.category || "piece"})`)
          .join(", ")
      : "";
    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: [
          `Current outfit: ${outfitSummary}.`,
          `Keep the rest of the outfit intact and swap only the ${action.swapCategory}.`,
          context.contextNote ? `Context: ${context.contextNote}.` : "",
          "Return one updated look only.",
        ]
          .filter(Boolean)
          .join(" "),
        mode: context.mode,
        customer_id: customerId,
        profile_inputs: buildSwapFallbackProfileInputs(),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return false;
    }
    safeRenderActionResponse(data, `Swap ${action.swapCategory}`);
    return true;
  };
  buttons.forEach((item) => {
    item.disabled = true;
  });

  try {
    if (action.action === "cart") {
      await addProductsToCartBulk(context.products || [], button);
      return;
    }

    if (action.action === "close") {
      addMessage("Of course. I’ll be here whenever you want to pick this back up.", "bot");
      addSuggestionChips(getOpenerSuggestions(), (option) => handleStarterSelection(option), "contextual");
      return;
    }

    if (action.action === "prompt") {
      addMessage(action.label, "user");
      await sendTextChat(action.prompt, {
        displayText: action.label,
        profileInputs: null,
      });
      return;
    }

    if (action.acknowledgement) {
      addMessage(action.acknowledgement, "bot");
    }

    if (action.action === "swap" && action.swapCategory) {
      typingState = showTypingState(renderMode);
      const { response, data } = await requestRecommendationAction(
        {
          feedback_type: action.type,
          refinement_prompt: `Swap the ${action.swapCategory} only.`,
          swap_category: action.swapCategory,
          mode: context.mode,
          customer_id: customerId,
          recommended_product_ids: context.recommendedProductIds,
          current_products: context.products,
          context_note: context.contextNote,
          shopper_profile: context.shopperProfile,
          image_analysis: context.imageAnalysis,
          gap_analysis: context.gapAnalysis,
          orchestration_context: context.orchestrationContext,
        },
        { allowReducedContext: true }
      );
      removeTypingState(typingState);
      if (!response.ok && !data) {
        throw new Error("Swap request failed");
      }
      if (data) {
        safeRenderActionResponse(data, `Swap ${action.swapCategory}`);
        return;
      }
      throw new Error("Swap request failed");
    }

    if (action.action === "refine" && action.prompt) {
      typingState = showTypingState(renderMode);
      const response = await fetch(`${apiBaseUrl}/api/chat/refine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feedback_type: action.type,
          refinement_prompt: action.prompt,
          mode: context.mode,
          customer_id: customerId,
          recommended_product_ids: context.recommendedProductIds,
          context_note: context.contextNote,
          shopper_profile: context.shopperProfile,
          image_analysis: context.imageAnalysis,
          gap_analysis: context.gapAnalysis,
          orchestration_context: context.orchestrationContext,
        }),
      });
      const data = await response.json().catch(() => null);
      removeTypingState(typingState);
      if (!response.ok && !data) {
        throw new Error("Refinement request failed");
      }
      if (data) {
        safeRenderActionResponse(data, action.prompt);
        return;
      }
      throw new Error("Refinement request failed");
    }

    if (action.action === "feedback") {
      const response = await fetch(`${apiBaseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feedback_type: action.type,
          mode: context.mode,
          customer_id: customerId,
          recommended_product_ids: context.recommendedProductIds,
          context_note: context.contextNote,
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback save failed");
      }
    }
  } catch (error) {
    removeTypingState(typingState);
    console.error("StyledGenie conversation action failed", error, action, context);
    if (action.action === "swap" && action.swapCategory) {
      try {
        const recovered = await requestSwapTextFallback();
        if (recovered) {
          return;
        }
      } catch (fallbackError) {
        console.error("StyledGenie swap text fallback failed", fallbackError, action, context);
      }
      addMessage("Sorry, I couldn’t swap that item right now. Please try again.", "bot");
      buttons.forEach((item) => {
        item.disabled = false;
      });
      return;
    }
    buttons.forEach((item) => {
      item.disabled = false;
    });
    addMessage("I couldn’t complete that just now, but I can keep helping from here.", "bot");
  }
}

function addConversationActions(context) {
  if (!context) {
    return;
  }

  const swapActions = getSmartSwapActions(context);
  if (swapActions.length) {
    const swapPanel = document.createElement("section");
    swapPanel.className = "feedback-panel";

    const swapHeading = document.createElement("p");
    swapHeading.className = "feedback-heading";
    swapHeading.textContent = "Swap one item";
    swapPanel.appendChild(swapHeading);

    const swapRow = document.createElement("div");
    swapRow.className = "feedback-action-row";

    swapActions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "feedback-action";
      button.textContent = action.label;
      button.addEventListener("click", () => handleConversationAction(action, context, button, swapPanel));
      swapRow.appendChild(button);
    });

    swapPanel.appendChild(swapRow);
    chatLog.appendChild(swapPanel);
    scrollChatToBottom();
  }

  const actions = getConversationActions(context);
  if (!actions.length) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "feedback-panel";

  const heading = document.createElement("p");
  heading.className = "feedback-heading";
  heading.textContent = "Next step";
  panel.appendChild(heading);

  const actionRow = document.createElement("div");
  actionRow.className = "feedback-action-row";

  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feedback-action";
    button.textContent = action.label;
    button.addEventListener("click", () => handleConversationAction(action, context, button, panel));
    actionRow.appendChild(button);
  });

  panel.appendChild(actionRow);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function filterProductsForActiveSegment(products, shopperProfile, aiRuntime) {
  const requiredSegment =
    (aiRuntime && aiRuntime.active_segment) ||
    (shopperProfile && shopperProfile.segment_preference);
  if (!requiredSegment || !Array.isArray(products)) {
    return products || [];
  }

  return products.filter((product) => product.segment === requiredSegment);
}

function setImageModeFromMessage(value) {
  if (detectInspirationIntent(value)) {
    setMode("inspire", { silent: true });
    return;
  }

  if (!isImageMode(activeMode)) {
    setMode("complete", { silent: true });
  }
}

function clearImageFlowStateAfterResponse(options = {}) {
  const preserveImageSelection = Boolean(options.preserveImageSelection);
  uploadDrawerPinned = false;
  if (!preserveImageSelection && imageUrlInput) {
    imageUrlInput.value = "";
  }
  if (!preserveImageSelection) {
    clearPendingImageSelection();
  }
  resetCameraCard();
  syncUploadDrawer();
}

function renderFallbackRecommendationResponse(data, safeProducts, renderMode, supportPayload, needsCompleteLookRequirements, isSupportResponse) {
  if (isSupportResponse) {
    updateSupportUploadContext(supportPayload);
    clearStylingUiForSupportMode();
    renderSupportPayload(supportPayload);
    return;
  }

  updateSupportUploadContext(null);

  if (needsCompleteLookRequirements) {
    addNextPromptActions(data.follow_up_prompts || []);
    return;
  }

  if (renderMode === "complete" && data.gap_analysis) {
    addGapAnalysis(data.gap_analysis || null);
  }

  if (renderMode === "inspire" && safeProducts.length) {
    const heroProduct = safeProducts.find((item) => item.role === "hero") || safeProducts[0];
    const supportProducts = safeProducts.filter((item) => item.id !== heroProduct.id);
    addRecommendationCards([heroProduct], {
      heading: heroProduct.match_label || "Closest match from this store",
      mode: renderMode,
    });
    if (supportProducts.length) {
      addRecommendationCards(supportProducts, {
        heading: "Complete the look",
        intro: "You might pair with",
        mode: renderMode,
        compact: true,
        groupBySupportSlot: true,
      });
    }
  } else if (safeProducts.length) {
    addRecommendationCards(safeProducts, {
      mode: renderMode,
      groupBySupportSlot: renderMode === "complete" && safeProducts.some((item) => item.support_slot),
    });
  }

  addStylingInsights(data.styling_insights || []);

  if (!safeProducts.length) {
    addNextPromptActions(data.follow_up_prompts || []);
  }
}

function composePrimaryBotReply(data, products, renderMode = activeMode) {
  const requiredFollowUpFields = Array.isArray(data.required_follow_up_fields) ? data.required_follow_up_fields : [];
  if (renderMode === "complete" && requiredFollowUpFields.length) {
    const parts = [];
    if (data.image_analysis && data.image_analysis.summary) {
      parts.push(`Got it — ${data.image_analysis.summary}`);
    }
    if (data.image_analysis && data.image_analysis.quality_note) {
      parts.push(data.image_analysis.quality_note);
    }
    const anchorLabel = (data.image_analysis && data.image_analysis.anchor_item) || "the anchor piece";
    parts.push(`I can already build around ${anchorLabel}. I just need a few guided details before I complete it.`);
    return parts.join(" ").trim();
  }

  if (renderMode === "inspire" && products && products.length) {
    if (data.reply && data.reply.trim()) {
      return data.reply.trim();
    }

    const heroTitle = products[0].title || "the closest store match";
    const summary = data.image_analysis && data.image_analysis.summary ? `Got it — ${data.image_analysis.summary}` : "Got it.";
    return `${summary} I recreated the look around ${heroTitle} and kept the supporting pieces close to the same palette and mood.`;
  }

  if (renderMode !== "complete" || !products || !products.length) {
    return data.reply;
  }

  if (data.reply && data.reply.trim()) {
    return data.reply.trim();
  }

  const parts = [];
  if (data.image_analysis && data.image_analysis.summary) {
    parts.push(`Got it — ${data.image_analysis.summary}`);
  }
  if (data.image_analysis && data.image_analysis.quality_note) {
    parts.push(data.image_analysis.quality_note);
  }
  parts.push("Here’s how I’d complete this look.");
  return parts.join(" ").trim();
}

function buildInspiredCueTags(imageAnalysis, shopperProfile) {
  const cueTags = [
    ...(((imageAnalysis && imageAnalysis.palette) || []).slice(0, 2)),
    ...(((imageAnalysis && imageAnalysis.style_direction) || []).slice(0, 2)),
    ...(((imageAnalysis && imageAnalysis.silhouette_cues) || []).slice(0, 1)),
    shopperProfile && shopperProfile.occasion_context ? shopperProfile.occasion_context : "",
  ];
  return [...new Set(cueTags.filter(Boolean))].slice(0, 4);
}

function addInspiredHeroMatch(heroProduct, imageAnalysis, shopperProfile) {
  if (!heroProduct) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "hero-match-panel";

  const heading = document.createElement("p");
  heading.className = "hero-match-heading";
  heading.textContent = heroProduct.match_label || "Closest match from this store";
  panel.appendChild(heading);

  const anchorLabel = document.createElement("p");
  anchorLabel.className = "hero-match-anchor";
  const anchorItem = (imageAnalysis && imageAnalysis.anchor_item) || "the inspiration anchor";
  anchorLabel.textContent = `Recreated around ${anchorItem}`;
  panel.appendChild(anchorLabel);

  const cues = buildInspiredCueTags(imageAnalysis, shopperProfile);
  const matchBadges = Array.isArray(heroProduct.match_badges) ? heroProduct.match_badges : [];
  const combinedCues = [...new Set([...matchBadges, ...cues])].slice(0, 4);
  if (combinedCues.length) {
    const cueRow = document.createElement("div");
    cueRow.className = "hero-match-cues";
    combinedCues.forEach((cue) => {
      const chip = document.createElement("span");
      chip.className = "hero-match-chip";
      chip.textContent = cue;
      cueRow.appendChild(chip);
    });
    panel.appendChild(cueRow);
  }

  const card = document.createElement("article");
  card.className = "hero-match-card";

  const media = document.createElement("div");
  media.className = "hero-match-media";
  media.appendChild(buildImageTile(heroProduct));

  const body = document.createElement("div");
  body.className = "hero-match-body";

  const topline = document.createElement("div");
  topline.className = "hero-match-topline";

  const category = document.createElement("span");
  category.className = "hero-match-category";
  category.textContent = heroProduct.category || "Hero match";

  const price = document.createElement("span");
  price.className = "hero-match-price";
  price.textContent = formatPrice(heroProduct.price);
  topline.append(category, price);

  const title = document.createElement("h3");
  title.className = "hero-match-title";
  title.textContent = heroProduct.title;

  const reason = document.createElement("p");
  reason.className = "hero-match-reason";
  reason.textContent = heroProduct.reason;

  const actions = document.createElement("div");
  actions.className = "hero-match-actions";

  if (heroProduct.product_url) {
    const link = document.createElement("a");
    link.className = "secondary-action";
    link.href = heroProduct.product_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "View Product";
    actions.appendChild(link);
  }

  const addButton = document.createElement("button");
  addButton.className = "primary-action";
  addButton.type = "button";
  addButton.textContent = "Add to Cart";
  addButton.disabled = !heroProduct.cart_variant_id;
  addButton.addEventListener("click", () => addProductToCart(heroProduct, addButton));
  actions.appendChild(addButton);

  body.append(topline, title, reason, actions);
  card.append(media, body);
  panel.appendChild(card);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderBotResponse(data, contextNote, requestMeta = {}) {
  const resolvedMode = data.ai_runtime && data.ai_runtime.resolved_mode;
  const renderMode = requestMeta.uiMode || (resolvedMode ? backendModeToUiMode(resolvedMode) : activeMode);
  if (resolvedMode === "support" && activeMode !== "support") {
    setMode("support", { silent: true });
  } else if (resolvedMode && resolvedMode !== "support" && activeMode === "support") {
    setMode(backendModeToUiMode(resolvedMode), { silent: true });
  }

  const safeProducts = filterProductsForActiveSegment(
    data.recommended_products || [],
    data.shopper_profile,
    data.ai_runtime
  );
  const supportPayload = data.support_payload || null;
  const isSupportResponse = resolvedMode === "support" || Boolean(supportPayload);
  const requiredFollowUpFields = Array.isArray(data.required_follow_up_fields) ? data.required_follow_up_fields : [];
  const needsTextStylingFollowUp = renderMode === "outfit" && requiredFollowUpFields.length > 0;
  pendingStylingFollowUpField = needsTextStylingFollowUp
    ? normalizeStylingFollowUpField(requiredFollowUpFields[0])
    : null;
  const needsCompleteLookRequirements = renderMode === "complete" && requiredFollowUpFields.length > 0;
  const streamlinedCompleteLook = renderMode === "complete" && safeProducts.length > 0;
  const streamlinedInspiredLook = renderMode === "inspire" && safeProducts.length > 0;
  addMessage(composePrimaryBotReply(data, safeProducts, renderMode), "bot");
  try {
    if (isSupportResponse) {
      updateSupportUploadContext(supportPayload);
      clearStylingUiForSupportMode();
      renderSupportPayload(supportPayload);
    } else if (needsCompleteLookRequirements) {
      updateSupportUploadContext(null);
      startCompleteLookRequirementFlow(requiredFollowUpFields, data.image_analysis || null, { renderFirstQuestionInline: true });
    } else if (streamlinedCompleteLook) {
      updateSupportUploadContext(null);
      addGapAnalysis(data.gap_analysis || null);
      addRecommendationCards(safeProducts, { mode: renderMode, groupBySupportSlot: true });
      addStylingInsights(data.styling_insights || []);
    } else if (streamlinedInspiredLook) {
      updateSupportUploadContext(null);
      addInspiredHeroMatch(safeProducts[0], data.image_analysis || null, data.shopper_profile || null);
      if (safeProducts.length > 1) {
        addRecommendationCards(safeProducts.slice(1), {
          heading: "Complete the look",
          intro: "You might pair with",
          mode: renderMode,
          compact: true,
          groupBySupportSlot: true,
        });
      }
      addStylingInsights(data.styling_insights || []);
    } else {
      updateSupportUploadContext(null);
      addImageAnalysisSummary(data.image_analysis, data.ai_runtime, data.detected_tags || []);
      addProfileSummary(data.shopper_profile);
      addLookPreview(safeProducts, renderMode, data.shopper_profile);
      addDetectedTags(data.detected_tags || []);
      addRecommendationCards(safeProducts, { mode: renderMode });
      addStylingInsights(data.styling_insights || []);
    }
  } catch (error) {
    console.error("StyledGenie render error", error, data);
    renderFallbackRecommendationResponse(
      data,
      safeProducts,
      renderMode,
      supportPayload,
      needsCompleteLookRequirements,
      isSupportResponse
    );
  }
  latestRecommendationContext = needsCompleteLookRequirements || isSupportResponse
    ? null
    : safeProducts.length
      ? {
          mode: requestMeta.backendMode || resolvedMode || backendModes[renderMode],
          uiMode: renderMode,
          contextNote: contextNote || "Recommendation response",
          recommendedProductIds: safeProducts.map((item) => item.id),
          products: safeProducts,
          shopperProfile: data.shopper_profile || null,
          imageAnalysis: data.image_analysis || null,
          gapAnalysis: data.gap_analysis || null,
          orchestrationContext: data.orchestration_context || null,
          decisionMode: Boolean(data.shopper_profile && data.shopper_profile.decision_style === "decisive"),
        }
      : null;
  if (!isSupportResponse) {
    addConversationActions(latestRecommendationContext);
  }
  if (!needsCompleteLookRequirements && !isSupportResponse && (!latestRecommendationContext || !latestRecommendationContext.recommendedProductIds.length)) {
    addNextPromptActions(data.follow_up_prompts || []);
  }
  if (!needsCompleteLookRequirements && !needsTextStylingFollowUp) {
    shopperProfileDraft = createEmptyProfileDraft();
  }
}

async function sendTextChat(rawMessage, options = {}) {
  const requestMode = activeMode;
  const requestBackendMode = backendModes[requestMode];
  const trimmedMessage = String(rawMessage || "").trim();

  if (!canUseTextInput(requestMode)) {
    return;
  }

  if (trimmedMessage) {
    homeViewActive = false;
    syncHeaderHomeButton(requestMode);
  }

  if (requestMode === "outfit") {
    applyStylingFollowUpValue(trimmedMessage, options.followUpField);
  }

  const profileInputs =
    options.profileInputs === undefined ? buildProfileInputsPayload() : options.profileInputs;
  const structuredPrompt =
    requestMode === "support"
      ? trimmedMessage
      : [buildProfileNarrative(profileInputs, requestMode), trimmedMessage].filter(Boolean).join(" ");

  if (!structuredPrompt) {
    return;
  }

  const displayText = options.displayText || trimmedMessage || buildDisplaySummary(profileInputs);
  const inferredDecisionMode =
    options.decisionMode === undefined
      ? inferDecisionModeFromMessage([trimmedMessage, displayText].filter(Boolean).join(" "))
      : options.decisionMode;

  pendingDecisionRequest = null;
  if (!options.skipUserEcho) {
    addMessage(displayText, "user");
  }
  chatInput.value = "";
  const typingState = showTypingState(requestMode);

  try {
    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: structuredPrompt,
        mode: requestBackendMode,
        customer_id: customerId,
        profile_inputs: profileInputs,
        decision_mode: inferredDecisionMode ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();
    removeTypingState(typingState);
    setPresenceState("online");
    if (
      requestMode === "outfit" &&
      inferredDecisionMode === null &&
      Array.isArray(data.required_follow_up_fields) &&
      data.required_follow_up_fields.includes("decision_mode")
    ) {
      promptDecisionModeForOutfit({
        rawMessage: trimmedMessage,
        profileInputs,
        displayText,
        promptText: data.reply,
      });
      return;
    }
    renderBotResponse(data, options.displayText || structuredPrompt, {
      uiMode: requestMode,
      backendMode: requestBackendMode,
    });
  } catch (error) {
    removeTypingState(typingState);
    setPresenceState("offline");
    addMessage(
      "I’m having a brief issue reaching the styling service right now. Give me one more try in a moment and I’ll pick it back up.",
      "bot"
    );
  }
}

async function sendImageChat(value, selectedFile, imageUrl, options = {}) {
  const requestMode = activeMode;
  homeViewActive = false;
  syncHeaderHomeButton(requestMode);
  const includeProfileInputs =
    requestMode !== "complete" || Boolean(options.useProfileInputsForCompleteLook);
  if (!includeProfileInputs && requestMode === "complete") {
    shopperProfileDraft = createEmptyProfileDraft();
  }

  const profileInputs = includeProfileInputs ? buildProfileInputsPayload() : null;
  const imageReferenceLabel = selectedFile ? selectedFile.name : imageUrl;
  const profileSummary = includeProfileInputs ? buildDisplaySummary(profileInputs) : "";
  const previewUrl =
    (pendingImageSelection && pendingImageSelection.file === selectedFile && pendingImageSelection.previewUrl) ||
    (selectedFile ? URL.createObjectURL(selectedFile) : imageUrl);
  const shopperMessage = [
    value ? value.trim() : "",
    profileSummary ? `Profile: ${profileSummary}` : "",
    `Image selected: ${imageReferenceLabel}`,
  ]
    .filter(Boolean)
    .join(" • ");

  clearPendingImagePreview();
  addImageUploadMessage(previewUrl, shopperMessage || "Styling reference");
  chatInput.value = "";
  const typingState = showTypingState(requestMode);

  try {
    const endpoint = requestMode === "inspire" ? "/api/inspire" : "/api/complete-look";
    const imageContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_name: selectedFile ? selectedFile.name : imageReferenceLabel,
        image_url: imageUrl || null,
        image_content_base64: imageContentBase64,
        image_mime_type: selectedFile ? selectedFile.type || null : null,
        message:
          value ||
          (includeProfileInputs ? buildProfileNarrative(profileInputs, requestMode) : "") ||
          (requestMode === "inspire"
            ? "Use this image to recreate the closest store-based version of the look."
            : "Use this image to complete the look around the visible anchor piece.") ||
          null,
        customer_id: customerId,
        profile_inputs: profileInputs,
      }),
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();
    removeTypingState(typingState);
    setPresenceState("online");
    const preserveImageSelection = shouldPreserveImageForFollowUp(data);
    renderBotResponse(data, shopperMessage, {
      uiMode: requestMode,
      backendMode: backendModes[requestMode],
    });
    clearImageFlowStateAfterResponse({ preserveImageSelection });
    if (!preserveImageSelection && selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
    }
  } catch (error) {
    removeTypingState(typingState);
    setPresenceState("offline");
    addMessage(
      "I’m having a brief issue reaching the styling service right now. Give me one more try in a moment and I’ll pick it back up.",
      "bot"
    );
  }
}

async function sendSupportImage(value, selectedFile, imageUrl) {
  const imageReferenceLabel = selectedFile ? selectedFile.name : imageUrl;
  const previewUrl =
    (pendingImageSelection && pendingImageSelection.file === selectedFile && pendingImageSelection.previewUrl) ||
    (selectedFile ? URL.createObjectURL(selectedFile) : imageUrl);
  const shopperMessage = [
    value ? value.trim() : "",
    `Issue image selected: ${imageReferenceLabel}`,
  ]
    .filter(Boolean)
    .join(" • ");

  clearPendingImagePreview();
  addImageUploadMessage(previewUrl, shopperMessage || "Support issue image");
  chatInput.value = "";
  const typingState = showTypingState("support");

  try {
    const imageContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
    const response = await fetch(`${apiBaseUrl}/api/support-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_name: selectedFile ? selectedFile.name : imageReferenceLabel,
        image_url: imageUrl || null,
        image_content_base64: imageContentBase64,
        image_mime_type: selectedFile ? selectedFile.type || null : null,
        message: value || "Review this support issue photo.",
        customer_id: customerId,
      }),
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();
    removeTypingState(typingState);
    setPresenceState("online");
    renderBotResponse(data, shopperMessage, {
      uiMode: "support",
      backendMode: backendModes.support,
    });
    clearImageFlowStateAfterResponse();
    if (selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
    }
  } catch (error) {
    removeTypingState(typingState);
    setPresenceState("offline");
    addMessage(
      "I’m having a brief issue reviewing the support photo right now. Try again in a moment and I’ll keep the issue flow moving.",
      "bot"
    );
  }
}

if (cameraButton) {
  cameraButton.addEventListener("click", () => {
    launchImagePicker("camera");
  });
}

if (uploadTrigger) {
  uploadTrigger.addEventListener("click", () => {
    launchImagePicker("upload");
  });
}

if (analyzeSelectedImageButton) {
  analyzeSelectedImageButton.addEventListener("click", async () => {
    await submitSelectedImageFlow();
  });
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) {
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  setPendingImageSelection(
    file,
    previewUrl,
    activeMode === "inspire"
      ? "Image ready for inspiration styling"
      : "Image ready to complete your look"
  );
  resetCameraCard();
  addImageFlowReadyMessage();
});

if (clearSelectedImageButton) {
  clearSelectedImageButton.addEventListener("click", () => {
    clearPendingImageSelection();
  });
}

if (closeUploadDrawerButton) {
  closeUploadDrawerButton.addEventListener("click", () => {
    closeUploadDrawer();
  });
}

if (composerPlusButton && composerQuickActions) {
  composerPlusButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setComposerQuickActionsOpen(composerQuickActions.classList.contains("hidden"));
  });

  composerQuickActions.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      handleImageActionSelection({
        action: button.dataset.action,
        label: button.textContent.trim(),
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!composerQuickActions.contains(event.target) && !composerPlusButton.contains(event.target)) {
      setComposerQuickActionsOpen(false);
    }
  });
}

if (imageUrlInput) {
  imageUrlInput.addEventListener("input", () => {
    if (imageUrlInput.value.trim()) {
      uploadDrawerPinned = true;
    }
    syncUploadDrawer();
  });
}

if (capturePhotoButton) {
  capturePhotoButton.addEventListener("click", () => {
    captureCameraPhoto();
  });
}

if (retakePhotoButton) {
  retakePhotoButton.addEventListener("click", () => {
    openCameraCapture();
  });
}

if (confirmPhotoButton) {
  confirmPhotoButton.addEventListener("click", () => {
    confirmCapturedPhoto();
  });
}

if (cancelCameraButton) {
  cancelCameraButton.addEventListener("click", () => {
    resetCameraCard();
  });
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedMode = button.dataset.mode || "outfit";
    activateFeature(selectedMode, {
      announce: true,
      userLabel: button.textContent.trim(),
    });
  });
});

if (widgetHomeButton) {
  widgetHomeButton.addEventListener("click", () => {
    returnToChatHome();
  });
}

if (voiceButton) {
  voiceButton.addEventListener("click", () => {
    handleVoiceButtonClick();
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canUseTextInput()) {
    return;
  }

  const value = chatInput.value.trim();
  const imageUrl = imageUrlInput.value.trim();
  const selectedFile = getSelectedImageFile();

  if (activeMode === "support" && (selectedFile || imageUrl)) {
    if (canUseSupportImageUpload()) {
      await sendSupportImage(value, selectedFile, imageUrl);
      return;
    }
    addMessage("Tell me the issue first, and I’ll only open photo upload when it helps with a damaged-item or wrong-item review.", "bot");
    return;
  }

  if (guidedFlow) {
    if (!value) {
      return;
    }

    handleGuidedAnswer(value, value);
    chatInput.value = "";
    return;
  }

  if ((selectedFile || imageUrl) && !isImageMode(activeMode)) {
    setImageModeFromMessage(value);
    await sendImageChat(value, selectedFile, imageUrl);
    return;
  }

  if (isImageMode(activeMode)) {
    const hasRemoteImage = Boolean(imageUrl);

    if (!selectedFile && !hasRemoteImage) {
      addMessage(
        "Please choose an image or paste an Instagram, Pinterest, or direct image URL first.",
        "bot"
      );
      return;
    }

    await sendImageChat(value, selectedFile, hasRemoteImage ? imageUrl : "");
    return;
  }

  if (!value && !hasProfileSelections()) {
    return;
  }

  if (detectSupportIntent(value)) {
    setMode("support");
  }

  await sendTextChat(value, {
    displayText: value || buildDisplaySummary(buildProfileInputsPayload()) || "Build my outfit",
  });
});

async function initializeWidget() {
  renderWidgetLogo({
    brand_name: "StyledGenie",
    assistant_name: defaultAssistantName,
  });
  syncInteractionUI(activeMode);
  syncHeaderHomeButton(activeMode);
  await loadChatbotCustomization();
  addOpeningConversation();
  startCustomizationRefreshLoop();
}

initializeWidget();
