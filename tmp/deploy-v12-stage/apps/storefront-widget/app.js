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
const widgetPanel = document.querySelector(".widget-panel");
const widgetWelcomeTitle = document.getElementById("widgetWelcomeTitle");
const widgetFeatureSubtitle = document.getElementById("widgetFeatureSubtitle");
const widgetNavButton = document.getElementById("widgetNavButton");
const widgetCartButton = document.getElementById("widgetCartButton");
const widgetSkipButton = document.getElementById("widgetSkipButton");
const onboardingScreen = document.getElementById("onboardingScreen");
const onboardingBody = document.getElementById("onboardingBody");
const onboardingFooter = document.getElementById("onboardingFooter");
const onboardingPrimaryBtn = document.getElementById("onboardingPrimaryBtn");
const onboardingLoadingScreen = document.getElementById("onboardingLoading");
const authScreen = document.getElementById("authScreen");
const authBody = document.getElementById("authBody");
const swapScreen = document.getElementById("swapScreen");
const swapComposition = document.getElementById("swapComposition");
const swapItemGrid = document.getElementById("swapItemGrid");
const swapAddToCartButton = document.getElementById("swapAddToCartButton");
const swapScreenHint = document.getElementById("swapScreenHint");
const uploadCard = document.getElementById("uploadCard");
const helperText = document.querySelector(".helper-text");
const apiBaseUrl = resolveApiBaseUrl();
const customerId = "guest-001";
const customizationRefreshIntervalMs = 30000;
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
let cameraPickerFallback = false;
let uploadDrawerPinned = false;
let voiceState = createVoiceState();
let swapScreenActive = false;
let swapScreenContext = null;
let selectedSwapProductId = null;
let outfitCarouselState = null;
let inspireFlowContext = null;
let supportFlowContext = null;
let customizationRefreshTimer = null;
let customizationRequestInFlight = false;
let onboardingActive = false;
let onboardingStep = null;
let onboardingCameraMode = false;
let shopperOnboardingData = createEmptyOnboardingData();
let pendingOnboardingFeature = null;
const ONBOARDING_STATUS_KEY = "sg_onboarding_status";
const AUTH_STORAGE_KEY = "sg_auth_session";
const FORCE_ONBOARDING_AFTER_LOGIN_KEY = "sg_force_onboarding_after_login";
const DEMO_USERS = [
  {
    email: "demo@styledgenie.com",
    password: "demo123",
    firstName: "Alex",
    lastName: "Rivera",
  },
];
let authViewActive = false;
let authStep = "login";
const defaultAssistantName = "StyledGenie";
const defaultWelcomeTitle = "Welcome!";
const featureLabels = {
  outfit: "Create Full Outfit",
  inspire: "Get Inspired",
  complete: "Complete my look",
  support: "Customer care",
  home: "Welcome!",
};

const ACTION_ICONS = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8.5h2.5l1.5-2h8l1.5 2H20a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2v-7a2 2 0 012-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V5"/><path d="M7.5 9.5L12 5l4.5 4.5"/><path d="M5 19h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 007.1 0l1.4-1.4a5 5 0 00-7.1-7.1L10.5 5"/><path d="M14 11a5 5 0 00-7.1 0L5.5 12.4a5 5 0 007.1 7.1L13.5 19"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h15l-1.5 9H7.5L6 7z"/><path d="M6 7L5 4H2"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7.5h13l3 4.5V19a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 19V7.5z"/><path d="M16 7.5V5.5A1.5 1.5 0 0117.5 4h1A1.5 1.5 0 0120 5.5V7.5"/></svg>',
  return: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H5v4"/><path d="M5 9c1.5-3 4.5-5 8-5 4.4 0 8 3.6 8 8s-3.6 8-8 8a7.9 7.9 0 01-4.5-1.4"/></svg>',
  faq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 014.8.8c0 1.6-1.8 2.2-2.3 2.8-.2.3-.3.7-.3 1.2"/><circle cx="12" cy="16.8" r=".6" fill="currentColor" stroke="none"/></svg>',
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11.5V9.5A8 8 0 0112 1.5"/><path d="M20 11.5V9.5A8 8 0 0012 1.5"/><path d="M4 11.5h16v2a8 8 0 01-16 0v-2z"/><path d="M10 17.5v2.5M14 17.5v2.5"/></svg>',
  outfit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4l4 3 4-3 2 3-2 14H8L6 7l2-3z"/><path d="M12 7v14"/></svg>',
  inspire:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"/><path d="M5 19h14"/></svg>',
};
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
    placeholder: "+ Type something.....",
    badgeLabel: "Create Full Outfit",
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
    placeholder: "+ Type something.....",
    badgeLabel: "Complete my look",
    signalLabel: "Guided steps",
    helperText: "",
  },
  inspire: {
    mode: "guided",
    textEnabled: false,
    voiceEnabled: false,
    placeholder: "+ Type something.....",
    badgeLabel: "Get inspired",
    signalLabel: "Guided steps",
    helperText: "",
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
];

const profileOptions = {
  segment: ["menswear", "womenswear"],
  occasion: ["Casual Day Out", "Office", "Party/Event", "Other"],
  weather: ["Hot", "Warm", "Mild", "Cold", "Rainy"],
  budget: ["under 100 euros", "under 150 euros", "under 250 euros", "open budget"],
  priority: ["comfort", "polished", "bold", "easy", "premium", "budget-friendly"],
  feel: ["Minimalist", "Chic & Elegant", "Boho & Romantic", "Edgy & Streetwear"],
  location: ["Brunch", "Date", "Shopping Trip", "Other"],
};

const INSPIRE_STYLE_CATEGORIES = [
  {
    label: "Trending Now",
    value: "trending now",
    lookCount: 12,
    image_url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=480&h=640&fit=crop",
  },
  {
    label: "For my Style",
    value: "for my style",
    lookCount: 18,
    image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=480&h=640&fit=crop",
  },
  {
    label: "Seasonal picks",
    value: "seasonal picks",
    lookCount: 20,
    image_url: "https://images.unsplash.com/photo-1525507119025-ed4c629a60a3?w=480&h=640&fit=crop",
  },
  {
    label: "Hidden gems",
    value: "hidden gems",
    lookCount: 8,
    image_url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=480&h=640&fit=crop",
  },
  {
    label: "New Arrivals",
    value: "new arrivals",
    lookCount: 10,
    image_url: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=480&h=640&fit=crop",
  },
  {
    label: "Under €50",
    value: "under 50",
    lookCount: 9,
    image_url: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=480&h=640&fit=crop",
  },
];

function createDemoFashionSvg(type, fill = "#f5d66c", accent = "#111827") {
  const svgWrap = (body, width = 240, height = 300) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="22" fill="#fff"/><g>${body}</g></svg>`
    )}`;

  if (type === "sweater") {
    return svgWrap(`<path d="M82 78c10-21 67-21 76 0l33 63-24 14-18-36 5 118H86l5-118-18 36-24-14 33-63z" fill="${fill}"/><path d="M96 71c9 20 39 20 48 0" fill="none" stroke="#fff3bd" stroke-width="12" stroke-linecap="round"/><path d="M87 104c19 12 48 13 68 0" fill="none" stroke="#eecf4f" stroke-width="4" opacity=".5"/><path d="M88 149h66M88 184h66" stroke="#efcf52" stroke-width="4" opacity=".42"/><path d="M93 235h54" stroke="#d2b84c" stroke-width="7" stroke-linecap="round" opacity=".35"/>`);
  }
  if (type === "denim") {
    return svgWrap(`<path d="M78 58h84l-7 205h-36l-6-116-14 116H63L78 58z" fill="${fill}"/><path d="M78 58h84l-5 34H75l3-34z" fill="#111827" opacity=".2"/><path d="M120 92l-7 55M100 72v177M141 72v177" stroke="#dae4ff" stroke-width="4" opacity=".45"/>`);
  }
  if (type === "purse") {
    return svgWrap(`<path d="M75 126c6-30 85-30 91 0l19 95c4 20-10 36-31 36H86c-21 0-35-16-31-36l20-95z" fill="${fill}"/><path d="M88 132c5-55 59-55 64 0" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/><rect x="108" y="167" width="25" height="18" rx="4" fill="#d7b56d"/>`);
  }
  if (type === "sneaker") {
    return svgWrap(`<path d="M54 186c42-7 62-28 84-66 20 19 36 34 58 43 21 9 31 24 27 43-3 14-15 22-34 22H70c-23 0-32-10-16-42z" fill="#f8f6ef"/><path d="M64 214h151" stroke="#111827" stroke-width="8" stroke-linecap="round"/><path d="M113 146l47 33M101 158l38 27" stroke="#b9c0cb" stroke-width="5" stroke-linecap="round"/><path d="M150 151c18 4 32 8 45 13" stroke="${fill}" stroke-width="8" stroke-linecap="round"/>`);
  }
  if (type === "tank") {
    return svgWrap(`<path d="M78 66h30c2 32 22 32 25 0h30l25 184H53L78 66z" fill="${fill}"/><path d="M86 66c8 34 58 34 68 0" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><path d="M78 66L62 96M163 66l15 30" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>`);
  }
  if (type === "trousers") {
    return svgWrap(`<path d="M76 52h88l-5 212h-36l-4-116-17 116H65L76 52z" fill="${fill}"/><path d="M77 52h86v32H75l2-32z" fill="#000" opacity=".18"/><path d="M120 85l-1 63M96 84l-15 168M143 84l3 168" stroke="#ffffff" stroke-width="4" opacity=".25"/>`);
  }
  if (type === "loafer") {
    return svgWrap(`<path d="M45 186c34-16 58-43 79-75 29 24 57 42 91 50 22 5 31 21 24 41-6 17-22 25-45 25H69c-29 0-39-16-24-41z" fill="${fill}"/><path d="M69 212h151" stroke="#611827" stroke-width="8" stroke-linecap="round"/><path d="M121 133c24 19 50 31 78 39" stroke="#f4a4a4" stroke-width="6" stroke-linecap="round"/>`);
  }
  if (type === "dress") {
    return svgWrap(`<path d="M92 58h56l19 54-20 10-8-25 33 160H68l33-160-8 25-20-10 19-54z" fill="${fill}"/><path d="M101 58c6 21 32 21 38 0" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><path d="M90 148c20 10 43 10 68 0" stroke="#fff" stroke-width="5" opacity=".35"/>`);
  }
  if (type === "jacket") {
    return svgWrap(`<path d="M79 67h33l8 30 8-30h33l33 184h-54l-20-96-20 96H46L79 67z" fill="${fill}"/><path d="M92 74l28 52 28-52M120 97v150" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><path d="M75 123h91M68 162h104" stroke="#2b211b" stroke-width="5" opacity=".4"/>`);
  }
  if (type === "skirt") {
    return svgWrap(`<path d="M82 76h76l28 180H54L82 76z" fill="${fill}"/><path d="M82 76h76v28H82z" fill="${accent}" opacity=".14"/><path d="M101 108l-18 132M120 108v132M139 108l18 132" stroke="#fff" stroke-width="5" opacity=".42"/>`);
  }
  if (type === "glasses") {
    return svgWrap(`<path d="M48 145c25-18 51-18 79 0M113 145c25-18 51-18 79 0" fill="none" stroke="${fill}" stroke-width="10" stroke-linecap="round"/><circle cx="82" cy="158" r="32" fill="#d6cbb2" opacity=".8" stroke="${accent}" stroke-width="7"/><circle cx="158" cy="158" r="32" fill="#d6cbb2" opacity=".8" stroke="${accent}" stroke-width="7"/><path d="M114 158h12" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>`);
  }
  if (type === "watch") {
    return svgWrap(`<path d="M99 31h42l-8 71H107L99 31zM107 198h26l8 71H99l8-71z" fill="#e7d9a7"/><path d="M109 31h9v68h-9zM124 31h9v68h-9zM109 201h9v68h-9zM124 201h9v68h-9z" fill="#24324b"/><rect x="75" y="91" width="90" height="116" rx="18" fill="#e9d9a3" stroke="#273044" stroke-width="8"/><rect x="90" y="106" width="60" height="86" rx="10" fill="#fff"/><path d="M98 121h44M98 176h44M120 116v66M104 148h32" stroke="#30405f" stroke-width="3" opacity=".45"/><path d="M120 149l17-13M120 149l-12 21" stroke="#273044" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="149" r="4" fill="#273044"/>`);
  }
  return svgWrap(`<circle cx="120" cy="150" r="78" fill="${fill}"/>`);
}

const DEMO_OUTFIT_IMAGES = {
  sweater: "./assets/swap/sweater.png",
  denim: "./assets/swap/denim.png",
  purse: "./assets/swap/navy-bag.png",
  sneakers: "./assets/swap/sneakers.png",
  tank: createDemoFashionSvg("tank", "#f9f2dc", "#a93636"),
  creamTrousers: createDemoFashionSvg("trousers", "#f5eee1"),
  blackPant: "./assets/swap/black-pant.png",
  rustPant: "./assets/swap/rust-pant.png",
  navyPant: "./assets/swap/navy-pant.png",
  redPurse: createDemoFashionSvg("purse", "#b6112e"),
  redLoafer: createDemoFashionSvg("loafer", "#c62530"),
  glasses: createDemoFashionSvg("glasses", "#b8a786", "#8a7864"),
  watch: createDemoFashionSvg("watch", "#d8c47d", "#1f2937"),
  orangeTop: "./assets/complete/orange-halter-top.png",
  checkedJacket: "./assets/complete/checked-jacket.png",
  beadedDress: "./assets/complete/beaded-dress.png",
  floralSkirt: "./assets/complete/floral-midi-skirt.png",
  greyTrouser: "./assets/complete/grey-trousers.png",
  wideLegPants: "./assets/complete/wide-leg-pants.png",
  blueJeans: "./assets/complete/blue-jeans.png",
  pinkPullover: "./assets/complete/pink-pullover.png",
  blueKnit: "./assets/complete/blue-knit-jacket.png",
  stripedJacket: "./assets/complete/striped-jacket.png",
  brownBoot: "./assets/complete/casual-cool-outfit.png",
  softGirlOutfit: "./assets/complete/soft-girl-outfit.png",
  summerChicOutfit: "./assets/complete/summer-chic-outfit.png",
};
const DEMO_LOOKS = {
  outfit: [
    {
      id: "demo-outfit-top",
      title: "Sweater",
      category: "Top",
      price: 18,
      image_url: DEMO_OUTFIT_IMAGES.sweater,
      reason: "Neutral tones suit your warm skin",
      support_slot: "Top",
    },
    {
      id: "demo-outfit-bottom",
      title: "Denim",
      category: "Trousers",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.denim,
      reason: "High waist flatters your shape",
      support_slot: "Bottom",
    },
    {
      id: "demo-outfit-shoes",
      title: "Sneakers",
      category: "Shoes",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.sneakers,
      reason: "Keeps the look walkable for a city day",
      support_slot: "Shoes",
    },
    {
      id: "demo-outfit-bag",
      title: "Blue purse",
      category: "Bag",
      price: 27,
      image_url: DEMO_OUTFIT_IMAGES.purse,
      reason: "The navy bag keeps the outfit polished",
      support_slot: "Bag",
    },
  ],
  inspire: [
    {
      id: "demo-inspire-hero",
      title: "Floral Midi Dress",
      category: "Dress",
      price: 165,
      role: "hero",
      image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=480&h=640&fit=crop",
      reason: "Closest match to the romantic inspiration mood.",
      match_label: "Closest match from this store",
    },
    {
      id: "demo-inspire-shoes",
      title: "Nude Strappy Heels",
      category: "Shoes",
      price: 110,
      image_url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=480&h=640&fit=crop",
      reason: "Keeps the leg line clean and event-ready.",
      support_slot: "Shoes",
    },
    {
      id: "demo-inspire-bag",
      title: "Clutch Bag",
      category: "Bag",
      price: 72,
      image_url: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=480&h=640&fit=crop",
      reason: "Lightweight finish that matches the palette.",
      support_slot: "Bag",
    },
    {
      id: "demo-inspire-earrings",
      title: "Gold Hoop Earrings",
      category: "Accessories",
      price: 45,
      image_url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=480&h=640&fit=crop",
      reason: "Adds warmth without competing with the dress.",
      support_slot: "Accessories",
    },
  ],
  complete: [
    {
      id: "demo-complete-anchor",
      title: "Pink Satin Top",
      category: "Top",
      price: 78,
      role: "anchor",
      image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=480&h=640&fit=crop",
      reason: "Your anchor piece — everything else builds around this.",
      support_slot: "Anchor",
    },
    {
      id: "demo-complete-skirt",
      title: "Pleated Midi Skirt",
      category: "Skirt",
      price: 95,
      image_url: "https://images.unsplash.com/photo-1583496664620-48f479037a85?w=480&h=640&fit=crop",
      reason: "Soft volume balances the fitted top.",
      support_slot: "Bottom",
    },
    {
      id: "demo-complete-shoes",
      title: "Block Heel Sandals",
      category: "Shoes",
      price: 115,
      image_url: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=480&h=640&fit=crop",
      reason: "Grounds the look with a wearable heel height.",
      support_slot: "Shoes",
    },
    {
      id: "demo-complete-bag",
      title: "Mini Crossbody",
      category: "Bag",
      price: 88,
      image_url: "https://images.unsplash.com/photo-1590871198309-90a9a62827e5?w=480&h=640&fit=crop",
      reason: "Adds polish while staying hands-free.",
      support_slot: "Bag",
    },
  ],
};

const DEMO_SWAP_ALTERNATIVES = {
  top: [
    {
      id: "demo-swap-top-1",
      title: "Cream tank",
      category: "Top",
      price: 18,
      image_url: DEMO_OUTFIT_IMAGES.tank,
      support_slot: "Top",
    },
  ],
  trousers: [
    {
      id: "demo-swap-trousers-1",
      title: "Cream pant",
      category: "Trousers",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.creamTrousers,
      support_slot: "Bottom",
    },
    {
      id: "demo-swap-trousers-2",
      title: "Black pant",
      category: "Trousers",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.blackPant,
      support_slot: "Bottom",
    },
    {
      id: "demo-swap-trousers-3",
      title: "Rust pant",
      category: "Trousers",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.rustPant,
      support_slot: "Bottom",
    },
    {
      id: "demo-swap-trousers-4",
      title: "Navy pant",
      category: "Trousers",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.navyPant,
      support_slot: "Bottom",
    },
  ],
  shoes: [
    {
      id: "demo-swap-shoes-1",
      title: "Red loafers",
      category: "Shoes",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.redLoafer,
      support_slot: "Shoes",
    },
    {
      id: "demo-swap-shoes-2",
      title: "Sneakers",
      category: "Shoes",
      price: 25,
      image_url: DEMO_OUTFIT_IMAGES.sneakers,
      support_slot: "Shoes",
    },
  ],
  bag: [
    {
      id: "demo-swap-bag-1",
      title: "Red purse",
      category: "Bag",
      price: 27,
      image_url: DEMO_OUTFIT_IMAGES.redPurse,
      support_slot: "Bag",
    },
    {
      id: "demo-swap-bag-2",
      title: "Blue purse",
      category: "Bag",
      price: 27,
      image_url: DEMO_OUTFIT_IMAGES.purse,
      support_slot: "Bag",
    },
  ],
};

function isDemoMode() {
  const params = new URLSearchParams(window.location.search);
  const demoParam = params.get("demo");
  if (demoParam === "0" || demoParam === "false") {
    return false;
  }
  if (demoParam === "1" || demoParam === "true") {
    return true;
  }
  if (demoParam === "onboarding") {
    return false;
  }
  if (["outfit", "inspire", "complete", "support"].includes(demoParam)) {
    return true;
  }
  return params.get("preview") === "figma";
}

function getDemoAutoFlow() {
  const demoParam = new URLSearchParams(window.location.search).get("demo");
  if (["outfit", "inspire", "complete", "support", "onboarding"].includes(demoParam)) {
    return demoParam;
  }
  return null;
}

function getPreviewShopifyProductId() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("shopify_product") ||
    params.get("product_id") ||
    params.get("shopify_product_id") ||
    ""
  ).trim();
}

function mapCatalogProductToRecommendation(product, options = {}) {
  if (!product) {
    return null;
  }

  return {
    id: product.id || product.shopify_product_id || product.shopify_legacy_id,
    title: normalizeRepeatedProductTitle(product.title || "Catalog item"),
    category: product.category || "Catalog pick",
    reason:
      options.reason ||
      "Pulled from your connected Shopify catalog with category metadata for smarter styling.",
    image_url: product.image_url,
    price: product.price,
    product_url: product.product_url,
    cart_variant_id: product.shopify_variant_id,
    handle: product.handle,
    sku: product.sku,
    available_for_sale: product.available_for_sale,
    inventory_quantity: product.inventory_quantity,
    inventory_policy: product.inventory_policy,
    inventory_tracked: product.inventory_tracked,
    tags: product.tags || [],
    metafields: product.metafields || {},
    match_badges: Object.entries(product.metafields || {})
      .slice(0, 3)
      .flatMap(([label, values]) => (Array.isArray(values) ? values.slice(0, 1).map((value) => `${label}: ${value}`) : [])),
  };
}

function isUsableShopifyProduct(product) {
  if (!product) {
    return false;
  }
  const imageUrl = String(product.image_url || "").trim();
  const variantId = product.cart_variant_id || product.shopify_variant_id;
  return Boolean(
    imageUrl &&
    !imageUrl.startsWith("./assets/") &&
    variantId &&
    product.available_for_sale !== false
  );
}

function getOutfitSupportSlot(product) {
  return {
    dress: "Hero",
    garment: "Top",
    bottom: "Bottom",
    jewellery: "Jewellery",
    accessory: "Accessories",
    shoes: "Shoes",
    bag: "Bag",
  }[getCollageProductKind(product)] || "Item";
}

function normalizeRepeatedProductTitle(value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  const words = title.split(" ");
  if (words.length % 2 === 0) {
    const midpoint = words.length / 2;
    const first = words.slice(0, midpoint).join(" ");
    const second = words.slice(midpoint).join(" ");
    if (first.localeCompare(second, undefined, { sensitivity: "accent" }) === 0) {
      return first;
    }
  }
  return title;
}

async function fetchCatalogProducts(limit = 12) {
  if (catalogProductCache && (limit <= 0 || catalogProductCache.length >= limit)) {
    return limit > 0 ? catalogProductCache.slice(0, limit) : catalogProductCache;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/catalog/products?limit=${encodeURIComponent(limit)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    catalogProductCache = Array.isArray(data.items) ? data.items : [];
    return limit > 0 ? catalogProductCache.slice(0, limit) : catalogProductCache;
  } catch (error) {
    return [];
  }
}

function getCatalogProductOptionSummary(product) {
  const details = [];
  if (product.price) {
    details.push(formatPrice(product.price));
  }
  const stock = getProductInventoryLabel(product);
  if (stock) {
    details.push(stock.label);
  }
  if (product.sku) {
    details.push(`SKU ${product.sku}`);
  }
  return details.join(" · ");
}

function mapCatalogProductToInspireOption(product) {
  const recommendation = mapCatalogProductToRecommendation(product, {
    reason: "Selected from your synced Shopify catalog as the hero item for this inspired look.",
  });
  return {
    label: product.title || "Shopify product",
    value: product.title || product.category || "Shopify product",
    description: getCatalogProductOptionSummary(product),
    image_url: product.image_url,
    action: "inspire_style",
    catalogProduct: recommendation,
  };
}

async function fetchShopifyProductDetail(legacyProductId) {
  const normalizedId = String(legacyProductId || "").trim();
  if (!normalizedId || !apiBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/catalog/products/shopify/${encodeURIComponent(normalizedId)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function maybeShowShopifyProductPreview() {
  const legacyProductId = getPreviewShopifyProductId();
  if (!legacyProductId) {
    return;
  }

  const product = await fetchShopifyProductDetail(legacyProductId);
  if (!product) {
    addMessage(
      "That product is temporarily unavailable. Please choose another item.",
      "bot"
    );
    return;
  }

  const recommendation = mapCatalogProductToRecommendation(product, {
    reason: "Live product from your Shopify admin, including category metadata.",
  });
  addMessage(`Here’s the connected store product: ${product.title}`, "bot");
  addRecommendationCards([recommendation], {
    heading: "Connected Shopify product",
    mode: "inspire",
  });

  const galleryUrls = (product.image_urls || []).filter(Boolean);
  if (galleryUrls.length > 1) {
    const galleryPanel = document.createElement("section");
    galleryPanel.className = "recommendation-panel recommendation-panel--compact";
    const galleryHeading = document.createElement("p");
    galleryHeading.className = "recommendation-heading";
    galleryHeading.textContent = "All product images from Shopify";
    galleryPanel.appendChild(galleryHeading);

    const galleryGrid = document.createElement("div");
    galleryGrid.className = "product-image-gallery";
    galleryUrls.forEach((url) => {
      const tile = document.createElement("img");
      tile.className = "product-image-gallery-tile";
      tile.src = url;
      tile.alt = product.title || "Product image";
      tile.loading = "lazy";
      galleryGrid.appendChild(tile);
    });
    galleryPanel.appendChild(galleryGrid);
    chatLog.appendChild(galleryPanel);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

function getDemoProducts(mode) {
  return (DEMO_LOOKS[mode] || DEMO_LOOKS.outfit).map((item, index) => ({
    ...item,
    segment: "womenswear",
    cart_variant_id: item.cart_variant_id || `demo-${mode}-${index + 1}`,
    available_for_sale: true,
  }));
}

function buildDemoChatResponse(mode, options = {}) {
  const products = getDemoProducts(mode);
  const styleLabel = options.styleLabel || "curated look";
  const imageAnalysis =
    mode === "complete" || mode === "inspire"
      ? {
          summary: "Soft pink tones, relaxed tailoring, and a clean evening-ready silhouette.",
          anchor_item: mode === "complete" ? "your pink satin top" : "the inspiration look",
          palette: ["blush", "cream"],
          style_direction: ["romantic", "polished"],
          silhouette_cues: ["balanced proportions"],
        }
      : null;
  const gapAnalysis =
    mode === "complete"
      ? {
          anchor_item: "your pink satin top",
          missing_items: ["Bottom", "Shoes", "Bag"],
        }
      : null;

  return {
    reply:
      mode === "inspire"
        ? "Here are some suggestions for you!"
        : mode === "complete"
          ? "Got it — soft pink tones with a clean silhouette. Here’s how I’d complete this look."
          : "Here’s a full outfit built around your brief.",
    recommended_products: products,
    shopper_profile: {
      feeling_goal: styleLabel,
      occasion_context: options.occasion || "Evening out",
      segment_preference: "womenswear",
      summary: "Polished, romantic, and easy to wear.",
      focus_points: ["Color harmony", "Silhouette balance", "Occasion fit"],
    },
    styling_insights: [
      { detail: "Blush and cream stay in the same warm family, so the look feels intentional." },
      { detail: "The wider bottom balances the fitted top without losing shape." },
      { detail: "Heels and a mini bag lift the outfit for evening without over-styling it." },
    ],
    image_analysis: imageAnalysis,
    gap_analysis: gapAnalysis,
    ai_runtime: { resolved_mode: backendModes[mode] || backendModes.outfit },
    follow_up_prompts: [],
    required_follow_up_fields: [],
  };
}

function getCollageProductKind(product) {
  const value = `${product && product.category || ""} ${product && product.title || ""}`.toLowerCase();
  if (/jewel|necklace|earring|bracelet|watch/.test(value)) return "jewellery";
  if (/shoe|heel|boot|sandal|sneaker|loafer/.test(value)) return "shoes";
  if (/bag|purse|clutch|handbag/.test(value)) return "bag";
  if (/dress|jumpsuit|outfit|set/.test(value)) return "dress";
  if (/trouser|pant|jean|skirt|short/.test(value)) return "bottom";
  if (/hat|scarf|belt|accessor/.test(value)) return "accessory";
  return "garment";
}

function selectDiverseCollageProducts(products, limit = 5) {
  const recommended = (products || []).filter((product) => product && product.image_url);
  const catalogFallbacks = (catalogProductCache || [])
    .filter(isUsableShopifyProduct)
    .map((product) => mapCatalogProductToRecommendation(product));
  const safeProducts = [...recommended, ...catalogFallbacks].filter(
    (product, index, items) => items.findIndex((item) => String(item.id) === String(product.id)) === index
  );
  const selected = [];
  const hero = recommended.find((product) => ["dress", "garment", "bottom"].includes(getCollageProductKind(product)))
    || safeProducts.find((product) => ["dress", "garment", "bottom"].includes(getCollageProductKind(product)));
  if (hero) selected.push(hero);
  ["bottom", "jewellery", "bag", "shoes", "accessory", "dress", "garment"].forEach((kind) => {
    const match = safeProducts.find((product) => getCollageProductKind(product) === kind && !selected.includes(product));
    if (match && selected.length < limit) selected.push(match);
  });
  safeProducts.forEach((product) => {
    if (selected.length < limit && !selected.includes(product)) selected.push(product);
  });
  return selected.slice(0, limit);
}

function buildShopifyCollageAlternatives(seedProducts, count = 5) {
  const alternatives = [selectDiverseCollageProducts(seedProducts, 5)];
  const catalog = (catalogProductCache || []).filter(isUsableShopifyProduct);
  if (!catalog.length) return alternatives;

  const buckets = {};
  catalog.forEach((product) => {
    const kind = getCollageProductKind(product);
    if (!buckets[kind]) buckets[kind] = [];
    buckets[kind].push(product);
  });
  const pick = (kinds, offset) => {
    for (const kind of kinds) {
      const options = buckets[kind] || [];
      if (options.length) return options[offset % options.length];
    }
    return null;
  };

  for (let offset = 1; offset < count; offset += 1) {
    const rawLook = [
      pick(["dress", "garment", "bottom"], offset),
      pick(["jewellery", "accessory"], offset),
      pick(["shoes"], offset),
      pick(["bag"], offset),
      pick(["bottom", "garment", "accessory", "dress"], offset + 2),
    ].filter(Boolean);
    const uniqueLook = rawLook.filter((product, index, items) => items.indexOf(product) === index);
    catalog.forEach((product) => {
      if (uniqueLook.length < 5 && !uniqueLook.includes(product)) uniqueLook.push(product);
    });
    alternatives.push(
      uniqueLook.slice(0, 5).map((product, index) => ({
        ...mapCatalogProductToRecommendation(product),
        support_slot: ["Hero", "Accessories", "Shoes", "Bag", "Bottom"][index],
      }))
    );
  }
  return alternatives;
}

function buildLookCompositionVisual(products, options = {}) {
  const { interactive = false, onTileSelect = null, selectedId = null, preserveProducts = false } = options;
  const safeProducts = preserveProducts
    ? (products || [])
        .filter((product) => product && product.image_url)
        .filter((product, index, items) =>
          items.findIndex((item) => String(item.id) === String(product.id)) === index
        )
        .slice(0, 5)
    : selectDiverseCollageProducts(products, 5);
  const visual = document.createElement("div");
  visual.className = "look-preview-visual";

  if (!safeProducts.length) {
    return visual;
  }

  const leadProduct = safeProducts.find((item) => item.role === "hero" || item.role === "anchor") || safeProducts[0];
  const supportingProducts = safeProducts.filter((item) => item.id !== leadProduct.id).slice(0, 4);

  const leadWrap = document.createElement("div");
  leadWrap.className = `look-preview-lead collage-kind-${getCollageProductKind(leadProduct)}`;
  if (interactive) {
    leadWrap.classList.add("look-preview-tile", "is-interactive");
    if (selectedId === leadProduct.id) {
      leadWrap.classList.add("is-selected");
    }
    leadWrap.addEventListener("click", () => {
      if (onTileSelect) {
        onTileSelect(leadProduct);
      }
    });
  }
  leadWrap.appendChild(buildImageTile(leadProduct));
  leadWrap.appendChild(buildCompositionTileDetails(leadProduct));

  const thumbStack = document.createElement("div");
  thumbStack.className = "look-preview-thumb-stack";

  supportingProducts.forEach((product, index) => {
    const thumb = document.createElement("div");
    thumb.className = `look-preview-thumb collage-slot-${index + 1} collage-kind-${getCollageProductKind(product)}`;
    if (interactive) {
      thumb.classList.add("look-preview-tile", "is-interactive");
      if (selectedId === product.id) {
        thumb.classList.add("is-selected");
      }
      thumb.addEventListener("click", () => {
        if (onTileSelect) {
          onTileSelect(product);
        }
      });
    }
    thumb.appendChild(buildImageTile(product));
    thumb.appendChild(buildCompositionTileDetails(product));
    thumbStack.appendChild(thumb);
  });

  visual.append(leadWrap, thumbStack);
  return visual;
}

function buildDemoOutfitCollageVisual(products) {
  return buildShopifyCutoutCollageVisual(products);
}

function buildShopifyCutoutCollageVisual(products) {
  const selected = selectDiverseCollageProducts(products, 5);
  const visual = document.createElement("div");
  visual.className = "shopify-cutout-collage";

  selected.forEach((product, index) => {
    const kind = getCollageProductKind(product);
    const slot = document.createElement("div");
    slot.className = `shopify-cutout-item shopify-cutout-item--${index + 1} collage-kind-${kind}`;
    slot.dataset.productId = String(product.id || "");
    slot.title = product.title || product.category || "Shopify product";

    const image = buildImageTile(product);
    image.classList.add("shopify-cutout-image");
    slot.appendChild(image);
    visual.appendChild(slot);
  });

  return visual;
}

function showOutfitZoomScreen(products) {
  const existing = widgetPanel.querySelector(".outfit-zoom-screen");
  if (existing) existing.remove();

  const safeProducts = (products || []).filter((product) => product && product.image_url);
  if (!safeProducts.length) return;

  const overlay = document.createElement("section");
  overlay.className = "outfit-zoom-screen";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Tap to go to the item");

  const header = document.createElement("div");
  header.className = "outfit-zoom-header";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "outfit-zoom-close";
  close.setAttribute("aria-label", "Close outfit details");
  close.textContent = "×";
  const title = document.createElement("strong");
  title.textContent = "Tap to go to the item";
  header.append(title, close);

  const visual = buildShopifyCutoutCollageVisual(safeProducts);
  visual.classList.add("shopify-cutout-collage--zoomed");
  visual.querySelectorAll(".shopify-cutout-item").forEach((item, index) => {
    const product = safeProducts[index];
    if (!product || !product.product_url) return;
    item.classList.add("shopify-cutout-item--linked");
    item.setAttribute("role", "link");
    item.setAttribute("tabindex", "0");
    const openProduct = () => window.open(product.product_url, "_blank", "noopener,noreferrer");
    item.addEventListener("click", openProduct);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProduct();
      }
    });
  });

  const closeOverlay = () => {
    document.removeEventListener("keydown", handleEscape);
    overlay.remove();
  };
  const handleEscape = (event) => {
    if (event.key === "Escape") closeOverlay();
  };
  close.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", handleEscape);

  overlay.append(header, visual);
  widgetPanel.appendChild(overlay);
  close.focus();
}

function buildCompositionTileDetails(product) {
  const details = document.createElement("div");
  details.className = "look-preview-tile-details";

  const title = document.createElement("span");
  title.className = "look-preview-tile-title";
  title.textContent = product.title || product.category || "Product";
  details.appendChild(title);

  const stock = getProductInventoryLabel(product);
  if (stock) {
    const stockNode = document.createElement("span");
    stockNode.className = `look-preview-tile-stock ${stock.tone || "muted"}`;
    stockNode.textContent = stock.label;
    details.appendChild(stockNode);
  }

  return details;
}

function getProductInventoryLabel(product) {
  if (!product) {
    return null;
  }
  if (product.available_for_sale === false) {
    return { label: "Out of stock", tone: "danger" };
  }
  if (product.inventory_quantity !== null && product.inventory_quantity !== undefined) {
    const quantity = Number(product.inventory_quantity);
    if (!Number.isNaN(quantity)) {
      return {
        label: quantity > 0 ? `${quantity} in stock` : "Out of stock",
        tone: quantity > 0 ? "ok" : "danger",
      };
    }
  }
  if (product.available_for_sale === true) {
    return { label: "Available", tone: "ok" };
  }
  return null;
}

const conversationActionSets = {
  outfit: [
    {
      type: "show_another_option",
      label: "New outfits",
      action: "refine",
      acknowledgement: "Absolutely. I'll show another outfit direction around the same brief.",
      prompt: "Show me another outfit direction for the same occasion and profile.",
      wide: false,
    },
    {
      type: "add_all_to_cart",
      label: "Add to cart",
      action: "cart",
      wide: false,
    },
    {
      type: "change_one_item",
      label: "Swap items",
      action: "open_swap",
      wide: false,
    },
  ],
  inspire: [
    {
      type: "show_alternatives",
      label: "Shop similar",
      action: "refine",
      acknowledgement: "Absolutely. I’ll keep the inspiration direction and show a fresh variation.",
      prompt: "Keep the same inspiration look and show me another similar version from the catalog.",
    },
    {
      type: "change_one_item",
      label: "Swap items",
      action: "open_swap",
      wide: false,
    },
    {
      type: "save_for_later",
      label: "Save look",
      action: "feedback",
      acknowledgement: "Saved. I’ll remember this visual direction for future styling.",
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
    location: "",
    weather: "",
    budget: "",
    priority: "",
    feel: "",
    color_preference: "",
    fit_preference: "",
  };
}

function createEmptyProfileDraft() {
  return {
    segment: "",
    occasion: "",
    location: "",
    weather: "",
    budget: "",
    priority: "",
    feel: "",
    color_preference: "",
    fit_preference: "",
  };
}

function createEmptyOnboardingData() {
  return {
    path: "",
    email: "",
    name: "",
    gender: "",
    age: "",
    height: "",
    heightUnit: "cm",
    weight: "",
    weightUnit: "kg",
    topSize: "",
    bottomSize: "",
    shoeSize: "",
    bodyShape: "",
    skinTone: "",
    eyeColor: "",
    hairColor: "",
    eyeColorHex: "",
    hairColorHex: "",
    aesthetics: [],
    styleDescription: "",
    styleImageFile: null,
    styleImagePreview: "",
    styleImages: [],
    scanImageFile: null,
    scanImagePreview: "",
    pinterestUrl: "",
  };
}

const ONBOARDING_GENDER_OPTIONS = [
  { value: "womenswear", label: "Female" },
  { value: "menswear", label: "Male" },
];

const ONBOARDING_BODY_SHAPES_BY_GENDER = {
  womenswear: [
    { id: "rectangle", label: "Rectangle", hint: "Straight" },
    { id: "pear", label: "Pear", hint: "Hips wider" },
    { id: "hourglass", label: "Hourglass", hint: "Defined waist" },
    { id: "inverted", label: "Inverted", hint: "Shoulders wider" },
    { id: "apple", label: "Apple", hint: "Fuller middle" },
    { id: "diamond", label: "Diamond", hint: "Midsection focus" },
  ],
  menswear: [
    { id: "trapezoid", label: "Trapezoid", hint: "Balanced athletic" },
    { id: "male-inverted", label: "Inverted", hint: "Broad shoulders" },
    { id: "male-rectangle", label: "Rectangle", hint: "Straight torso" },
    { id: "male-triangle", label: "Triangle", hint: "Waist wider" },
    { id: "male-oval", label: "Oval", hint: "Fuller middle" },
  ],
};

let catalogProductCache = null;

const ONBOARDING_SKIN_TONES = [
  "#f5d0c5",
  "#e8b4a0",
  "#d4a574",
  "#c68642",
  "#8d5524",
  "#5c3d2e",
];

const ONBOARDING_EYE_COLORS = ["#111111", "#4a3728", "#6b8e23", "#4682b4", "#708090", "#2f4f4f"];

const ONBOARDING_HAIR_COLORS = ["#1a1a1a", "#4a3728", "#8b4513", "#d2691e", "#c0c0c0", "#f5deb3"];

const ONBOARDING_EYE_OPTIONS = [
  { value: "black", label: "Black", color: "#111111" },
  { value: "brown", label: "Brown", color: "#4a3728" },
  { value: "green", label: "Green", color: "#6b8e23" },
  { value: "blue", label: "Blue", color: "#4682b4" },
  { value: "grey", label: "Grey", color: "#708090" },
  { value: "dark", label: "Dark", color: "#2f4f4f" },
];

const ONBOARDING_HAIR_OPTIONS = [
  { value: "black", label: "Black", color: "#1a1a1a" },
  { value: "brown", label: "Brown", color: "#4a3728" },
  { value: "auburn", label: "Auburn", color: "#8b4513" },
  { value: "blonde", label: "Blonde", color: "#d2691e" },
  { value: "grey", label: "Grey", color: "#c0c0c0" },
  { value: "light", label: "Light", color: "#f5deb3" },
];

const ONBOARDING_SKIN_LABELS = ["Fair", "Light", "Medium", "Warm", "Tan", "Deep"];

const ONBOARDING_PROGRESS_STEPS = ["basic-info", "body-features", "vibe"];

const ONBOARDING_STYLE_TAGS = [
  "Casual",
  "Formal",
  "Streetwear",
  "Minimalist",
  "Bohemian",
  "Classic",
  "Trendy",
  "Sporty",
];

const ONBOARDING_SIZE_OPTIONS = {
  top: ["XS", "S", "M", "L", "XL", "XXL"],
  bottom: ["XS", "S", "M", "L", "XL", "XXL"],
  shoe: ["36", "37", "38", "39", "40", "41", "42", "43", "44"],
};

function getOnboardingGender() {
  return ["menswear", "womenswear"].includes(shopperOnboardingData.gender)
    ? shopperOnboardingData.gender
    : "";
}

function getOnboardingBodyShapes() {
  return ONBOARDING_BODY_SHAPES_BY_GENDER[getOnboardingGender()] || [];
}

function getDefaultBodyShapeForGender() {
  if (getOnboardingGender() === "menswear") return "trapezoid";
  if (getOnboardingGender() === "womenswear") return "hourglass";
  return "";
}

function getOnboardingBodyShapeById(id) {
  return getOnboardingBodyShapes().find((shape) => shape.id === id) || null;
}

function ensureOnboardingBodyShapeMatchesGender() {
  if (!getOnboardingGender()) {
    shopperOnboardingData.bodyShape = "";
    return;
  }
  if (!getOnboardingBodyShapeById(shopperOnboardingData.bodyShape)) {
    shopperOnboardingData.bodyShape = getDefaultBodyShapeForGender();
  }
}

function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function saveAuthSession(user, rememberMe = false) {
  const session = {
    email: user.email,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    rememberMe: Boolean(rememberMe),
  };
  try {
    if (rememberMe) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }
  } catch (error) {
    /* ignore storage errors */
  }
  return session;
}

function getActiveAuthSession() {
  const remembered = loadAuthSession();
  if (remembered) {
    return remembered;
  }
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    /* ignore storage errors */
  }
}

function isAuthenticated() {
  return Boolean(getActiveAuthSession());
}

function applyAuthIdentity(session) {
  if (!session) {
    return;
  }
  const fullName = [session.firstName, session.lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    shopperIdentity.name = fullName;
  } else if (session.email) {
    shopperIdentity.name = session.email.split("@")[0];
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function setAuthUiActive(active) {
  authViewActive = active;
  if (active) {
    homeViewActive = false;
    onboardingActive = false;
    onboardingStep = null;
    onboardingCameraMode = false;
    swapScreenActive = false;
    if (chatLog) {
      chatLog.innerHTML = "";
    }
    if (onboardingScreen) {
      onboardingScreen.classList.add("hidden");
    }
    if (onboardingLoadingScreen) {
      onboardingLoadingScreen.classList.add("hidden");
    }
    if (swapScreen) {
      swapScreen.classList.add("hidden");
    }
    if (cameraCard) {
      cameraCard.classList.add("hidden");
    }
  }
  if (widgetPanel) {
    widgetPanel.classList.toggle("auth-active", active);
    widgetPanel.classList.toggle("onboarding-active", false);
    widgetPanel.classList.toggle("camera-active", false);
    widgetPanel.classList.toggle("camera-scan-mode", false);
    if (active) {
      widgetPanel.dataset.mode = "auth";
    }
  }
  if (authScreen) {
    authScreen.classList.toggle("hidden", !active);
  }
  syncHeaderHomeButton();
}

function showAuthScreen(step = "login") {
  authStep = step;
  setAuthUiActive(true);
  if (widgetWelcomeTitle) {
    const titles = {
      login: "Customer Login",
      signup: "Create Account",
      forgot: "Reset Password",
    };
    widgetWelcomeTitle.textContent = titles[step] || "Customer Login";
  }
  if (widgetFeatureSubtitle) {
    widgetFeatureSubtitle.classList.add("hidden");
  }
  renderAuthView(step);
}

function hideAuthScreen() {
  authStep = "login";
  setAuthUiActive(false);
}

function continueFromAuthToOnboarding(session) {
  applyAuthIdentity(session);
  hideAuthScreen();
  resetOnboardingStatusForCurrentUser();
  startOnboardingFlow();
}

function renderAuthView(step) {
  if (!authBody) {
    return;
  }

  authBody.innerHTML = "";

  const hero = document.createElement("div");
  hero.className = "auth-hero";
  hero.innerHTML =
    '<div class="auth-mark" aria-hidden="true">SG</div><div class="auth-logo">StyledGenie</div><p class="auth-tagline">Sign in to unlock your personal stylist.</p>';

  const wrap = document.createElement("div");
  wrap.className = "auth-form-wrap";

  if (step === "login") {
    wrap.appendChild(buildAuthLoginForm());
  } else if (step === "signup") {
    wrap.appendChild(buildAuthSignupForm());
  } else {
    wrap.appendChild(buildAuthForgotForm());
  }

  authBody.append(hero, wrap);
}

function buildAuthLoginForm() {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("h2");
  title.className = "auth-title";
  title.textContent = "Login";

  const subtitle = document.createElement("p");
  subtitle.className = "auth-subtitle";
  subtitle.textContent = "Continue to onboarding, outfit styling, inspiration, complete my look, and customer care.";
  fragment.append(title, subtitle);

  const errorNode = document.createElement("p");
  errorNode.className = "auth-error hidden";
  errorNode.setAttribute("role", "alert");

  const emailField = buildOnboardingField("Email address", "email", "demo@styledgenie.com", () => {});
  emailField.querySelector("input").autocomplete = "email";

  const passwordField = buildOnboardingField("Password", "password", "demo123", () => {});
  passwordField.querySelector("input").autocomplete = "current-password";

  const row = document.createElement("div");
  row.className = "auth-row";
  const rememberLabel = document.createElement("label");
  rememberLabel.className = "auth-checkbox";
  const rememberInput = document.createElement("input");
  rememberInput.type = "checkbox";
  rememberLabel.append(rememberInput, document.createTextNode("Remember me"));
  const forgotBtn = document.createElement("button");
  forgotBtn.type = "button";
  forgotBtn.className = "auth-link";
  forgotBtn.textContent = "Forgot password?";
  forgotBtn.addEventListener("click", () => showAuthScreen("forgot"));
  row.append(rememberLabel, forgotBtn);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "onboarding-primary-btn";
  submitBtn.textContent = "Login";
  submitBtn.addEventListener("click", () => {
    const email = emailField.querySelector("input").value.trim();
    const password = passwordField.querySelector("input").value;
    const rememberMe = rememberInput.checked;
    errorNode.classList.add("hidden");

    if (!isValidEmail(email)) {
      errorNode.textContent = "Please enter a valid email address.";
      errorNode.classList.remove("hidden");
      return;
    }
    if (!password) {
      errorNode.textContent = "Password is required.";
      errorNode.classList.remove("hidden");
      return;
    }

    const demoUser = DEMO_USERS.find(
      (user) => user.email === email.toLowerCase() && user.password === password
    );
    if (!demoUser) {
      errorNode.textContent = "Invalid email or password.";
      errorNode.classList.remove("hidden");
      return;
    }

    const session = saveAuthSession(demoUser, rememberMe);
    continueFromAuthToOnboarding(session);
  });

  const footer = document.createElement("p");
  footer.className = "auth-footer";
  const signupBtn = document.createElement("button");
  signupBtn.type = "button";
  signupBtn.className = "auth-link";
  signupBtn.textContent = "Sign Up";
  signupBtn.addEventListener("click", () => showAuthScreen("signup"));
  footer.append("Don't have an account? ", signupBtn);

  const demoHint = document.createElement("p");
  demoHint.className = "auth-demo-hint";
  demoHint.textContent = "Demo: demo@styledgenie.com / demo123";

  const demoBtn = document.createElement("button");
  demoBtn.type = "button";
  demoBtn.className = "auth-demo-button";
  demoBtn.textContent = "Continue with demo";
  demoBtn.addEventListener("click", () => {
    const demoUser = DEMO_USERS[0];
    const session = saveAuthSession(demoUser, false);
    continueFromAuthToOnboarding(session);
  });

  fragment.append(errorNode, emailField, passwordField, row, submitBtn, demoBtn, footer, demoHint);
  return fragment;
}

function buildAuthSignupForm() {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("h2");
  title.className = "auth-title";
  title.textContent = "Create your account";
  fragment.appendChild(title);

  const errorNode = document.createElement("p");
  errorNode.className = "auth-error hidden";
  errorNode.setAttribute("role", "alert");

  const row2 = document.createElement("div");
  row2.className = "auth-row-2";
  const firstNameField = buildOnboardingField("First name", "text", "", () => {});
  const lastNameField = buildOnboardingField("Last name", "text", "", () => {});
  row2.append(firstNameField, lastNameField);

  const emailField = buildOnboardingField("Email", "email", "", () => {});
  const passwordField = buildOnboardingField("Password", "password", "", () => {});

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "onboarding-primary-btn";
  submitBtn.textContent = "Create Account";
  submitBtn.addEventListener("click", () => {
    const firstName = firstNameField.querySelector("input").value.trim();
    const lastName = lastNameField.querySelector("input").value.trim();
    const email = emailField.querySelector("input").value.trim().toLowerCase();
    const password = passwordField.querySelector("input").value;
    errorNode.classList.add("hidden");

    if (!firstName) {
      errorNode.textContent = "First name is required.";
      errorNode.classList.remove("hidden");
      return;
    }
    if (!isValidEmail(email)) {
      errorNode.textContent = "Please enter a valid email address.";
      errorNode.classList.remove("hidden");
      return;
    }
    if (password.length < 6) {
      errorNode.textContent = "Password must be at least 6 characters.";
      errorNode.classList.remove("hidden");
      return;
    }

    const session = saveAuthSession({ email, firstName, lastName }, false);
    continueFromAuthToOnboarding(session);
  });

  const footer = document.createElement("p");
  footer.className = "auth-footer";
  const loginBtn = document.createElement("button");
  loginBtn.type = "button";
  loginBtn.className = "auth-link";
  loginBtn.textContent = "Sign In";
  loginBtn.addEventListener("click", () => showAuthScreen("login"));
  footer.append("Already have an account? ", loginBtn);

  fragment.append(errorNode, row2, emailField, passwordField, submitBtn, footer);
  return fragment;
}

function buildAuthForgotForm() {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("h2");
  title.className = "auth-title";
  title.textContent = "Reset your password";
  const subtitle = document.createElement("p");
  subtitle.className = "auth-subtitle";
  subtitle.textContent = "Enter your email and we'll send reset instructions.";
  fragment.append(title, subtitle);

  const emailField = buildOnboardingField("Email", "email", "", () => {});

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "onboarding-primary-btn";
  submitBtn.textContent = "Send Reset Link";
  submitBtn.addEventListener("click", () => {
    authBody.querySelector(".auth-form-wrap").innerHTML = "";
    const success = document.createElement("div");
    success.className = "auth-success";
    success.textContent =
      "If an account exists for that email, reset instructions are on the way. Check your inbox.";
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "onboarding-secondary-btn";
    backBtn.textContent = "Back to Sign In";
    backBtn.addEventListener("click", () => showAuthScreen("login"));
    authBody.querySelector(".auth-form-wrap").append(success, backBtn);
  });

  const footer = document.createElement("p");
  footer.className = "auth-footer";
  const loginBtn = document.createElement("button");
  loginBtn.type = "button";
  loginBtn.className = "auth-link";
  loginBtn.textContent = "Back to Sign In";
  loginBtn.addEventListener("click", () => showAuthScreen("login"));
  footer.appendChild(loginBtn);

  fragment.append(emailField, submitBtn, footer);
  return fragment;
}

function enterAuthenticatedApp() {
  consumeForcedOnboardingReset();
  syncSkipButtonVisibility();
  if (shouldPromptOnboarding()) {
    startOnboardingFlow();
    return;
  }
  showHomeFeatureCards();
  if (isDemoMode()) {
    launchDemoPreviewFlow();
  }
}

function getOnboardingStorageKey() {
  const session = getActiveAuthSession();
  const email = String(session?.email || "guest")
    .trim()
    .toLowerCase();
  return `${ONBOARDING_STATUS_KEY}_${email}`;
}

function getOnboardingStatus() {
  try {
    return localStorage.getItem(getOnboardingStorageKey()) || "";
  } catch (error) {
    return "";
  }
}

function setOnboardingStatus(status) {
  try {
    localStorage.setItem(getOnboardingStorageKey(), status);
  } catch (error) {
    /* ignore storage errors */
  }
}

function resetOnboardingStatusForCurrentUser() {
  try {
    localStorage.removeItem(getOnboardingStorageKey());
  } catch (error) {
    /* ignore storage errors */
  }
}

function consumeForcedOnboardingReset() {
  try {
    if (sessionStorage.getItem(FORCE_ONBOARDING_AFTER_LOGIN_KEY) !== "1") {
      return;
    }
    resetOnboardingStatusForCurrentUser();
    sessionStorage.removeItem(FORCE_ONBOARDING_AFTER_LOGIN_KEY);
  } catch (error) {
    resetOnboardingStatusForCurrentUser();
  }
}

function isOnboardingComplete() {
  return getOnboardingStatus() === "complete";
}

function shouldPromptOnboarding() {
  const status = getOnboardingStatus();
  return status !== "complete" && status !== "skipped";
}

function syncSkipButtonVisibility() {
  if (!widgetSkipButton) {
    return;
  }
  const showSkip = homeViewActive && shouldPromptOnboarding() && !onboardingActive;
  widgetSkipButton.classList.toggle("hidden", !showSkip);
}

function setOnboardingUiActive(active) {
  onboardingActive = active;
  if (widgetPanel) {
    widgetPanel.classList.toggle("onboarding-active", active);
  }
  if (onboardingScreen) {
    onboardingScreen.classList.toggle("hidden", !active);
  }
  syncSkipButtonVisibility();
  syncHeaderHomeButton();
  syncSkipButtonVisibility();
}

function openOnboardingStep(step) {
  onboardingStep = step;
  setOnboardingUiActive(true);

  if (onboardingLoadingScreen) {
    onboardingLoadingScreen.classList.add("hidden");
  }

  if (!onboardingBody) {
    return;
  }

  onboardingBody.innerHTML = "";

  if (step === "welcome") {
    renderOnboardingWelcome();
  } else if (step === "intro") {
    renderOnboardingIntro();
  } else if (step === "basic-info") {
    renderOnboardingBasicInfo();
  } else if (step === "body-features") {
    renderOnboardingBodyFeatures();
  } else if (step === "vibe") {
    renderOnboardingVibe();
  } else if (step === "confirm") {
    renderOnboardingConfirm();
  } else if (step === "style-analysis") {
    renderOnboardingStyleAnalysis();
  }

  syncOnboardingHeader();
  syncOnboardingFooter();
}

function syncOnboardingHeader() {
  if (!widgetWelcomeTitle) {
    return;
  }

  const headers = {
    welcome: { title: "Welcome!", subtitle: "" },
    intro: { title: "Let's Get to Know You!", subtitle: "Just like a real stylist!" },
    "basic-info": { title: "Basic info", subtitle: "Share your measurements" },
    "body-features": { title: "Your body & features", subtitle: "Select your body shape" },
    vibe: { title: "Your Vibe", subtitle: "Show me your aesthetic/inspos" },
    confirm: { title: "Confirm & Adjust", subtitle: "Please confirm your features." },
    "style-analysis": { title: "Style analysis", subtitle: "Your personalized style profile" },
  };

  const config = headers[onboardingStep] || headers.intro;
  widgetWelcomeTitle.textContent = config.title;
  if (widgetFeatureSubtitle) {
    if (config.subtitle) {
      widgetFeatureSubtitle.textContent = config.subtitle;
      widgetFeatureSubtitle.classList.remove("hidden");
    } else {
      widgetFeatureSubtitle.textContent = "";
      widgetFeatureSubtitle.classList.add("hidden");
    }
  }
}

function syncOnboardingFooter() {
  if (!onboardingFooter || !onboardingPrimaryBtn) {
    return;
  }

  if (onboardingStep === "welcome" || onboardingStep === "intro" || onboardingStep === "style-analysis") {
    onboardingFooter.classList.add("hidden");
    return;
  }

  onboardingFooter.classList.remove("hidden");
  onboardingPrimaryBtn.textContent = onboardingStep === "confirm" ? "Next" : "Next";
  onboardingPrimaryBtn.disabled = false;
}

function startOnboardingFlow() {
  homeViewActive = false;
  pendingOnboardingFeature = null;
  if (chatLog) {
    chatLog.innerHTML = "";
  }
  clearActivePromptPanels();
  resetGuidedFlow();
  shopperOnboardingData = createEmptyOnboardingData();
  if (widgetWelcomeTitle) {
    widgetWelcomeTitle.textContent = defaultWelcomeTitle;
  }
  if (widgetFeatureSubtitle) {
    widgetFeatureSubtitle.textContent = "";
    widgetFeatureSubtitle.classList.add("hidden");
  }
  openOnboardingStep("welcome");
}

function closeOnboardingToHome(options = {}) {
  const { markSkipped = false, markComplete = false } = options;
  if (markSkipped) {
    setOnboardingStatus("skipped");
  }
  if (markComplete) {
    setOnboardingStatus("complete");
    applyOnboardingToProfileDraft();
  }

  onboardingStep = null;
  onboardingCameraMode = false;
  setOnboardingUiActive(false);

  if (widgetFeatureSubtitle) {
    widgetFeatureSubtitle.classList.add("hidden");
  }

  if (markComplete || markSkipped || !chatLog.querySelector(".message-row")) {
    showHomeFeatureCards();
  } else {
    homeViewActive = true;
    syncHeaderHomeButton();
    syncWidgetHeader();
  }
  syncSkipButtonVisibility();
}

function skipOnboarding() {
  pendingOnboardingFeature = null;
  closeOnboardingToHome({ markSkipped: true });
}

function completeOnboarding() {
  const deferredFeature = pendingOnboardingFeature;
  pendingOnboardingFeature = null;
  closeOnboardingToHome({ markComplete: true });
  if (deferredFeature) {
    activateFeature(deferredFeature.mode, {
      announce: true,
      userLabel: deferredFeature.label,
      openingRequest: deferredFeature.prompt || "",
    });
    return;
  }
  void maybeShowShopifyProductPreview();
}

function applyOnboardingToProfileDraft() {
  if (shopperOnboardingData.gender) {
    const g = shopperOnboardingData.gender.toLowerCase();
    shopperProfileDraft.segment = g.includes("men") ? "menswear" : g.includes("women") ? "womenswear" : "";
  }
  if (shopperOnboardingData.styleDescription) {
    shopperProfileDraft.fit_preference = shopperOnboardingData.styleDescription;
  }
  if (shopperOnboardingData.aesthetics.length) {
    shopperProfileDraft.feel = shopperOnboardingData.aesthetics[0];
  }
  if (shopperOnboardingData.name) {
    shopperIdentity.name = shopperOnboardingData.name;
  }
}

function applyScanMockResults() {
  shopperOnboardingData.path = "scan";
  shopperOnboardingData.topSize = shopperOnboardingData.topSize || "S";
  shopperOnboardingData.bottomSize = shopperOnboardingData.bottomSize || "M";
  shopperOnboardingData.shoeSize = shopperOnboardingData.shoeSize || "39";
  shopperOnboardingData.skinTone = shopperOnboardingData.skinTone || ONBOARDING_SKIN_TONES[3];
  shopperOnboardingData.eyeColor = shopperOnboardingData.eyeColor || "brown";
  shopperOnboardingData.eyeColorHex =
    shopperOnboardingData.eyeColorHex || getEyeOptionByValue(shopperOnboardingData.eyeColor)?.color || "";
  shopperOnboardingData.hairColor = shopperOnboardingData.hairColor || "brown";
  shopperOnboardingData.hairColorHex = shopperOnboardingData.hairColorHex || ONBOARDING_HAIR_OPTIONS[1].color;
  shopperOnboardingData.bodyShape = shopperOnboardingData.bodyShape || getDefaultBodyShapeForGender();
}

function finishOnboardingScanCapture() {
  onboardingCameraMode = false;
  resetCameraCard();
  applyScanMockResults();
  showOnboardingLoading("confirm");
}

function showOnboardingLoading(nextStep, delayMs = 1800) {
  setOnboardingUiActive(false);
  if (onboardingLoadingScreen) {
    onboardingLoadingScreen.classList.remove("hidden");
  }
  window.setTimeout(() => {
    if (onboardingLoadingScreen) {
      onboardingLoadingScreen.classList.add("hidden");
    }
    openOnboardingStep(nextStep);
  }, delayMs);
}

function advanceOnboardingFromFooter() {
  if (onboardingStep === "basic-info") {
    if (!getOnboardingGender()) {
      onboardingBody.prepend(buildOnboardingBotMessage("Select Female or Male so I can show the correct body types."));
      const genderSelect = onboardingBody.querySelector("select");
      if (genderSelect) genderSelect.focus();
      return;
    }
    openOnboardingStep("body-features");
    return;
  }
  if (onboardingStep === "body-features") {
    openOnboardingStep("vibe");
    return;
  }
  if (onboardingStep === "vibe") {
    showOnboardingLoading("style-analysis");
    return;
  }
  if (onboardingStep === "confirm") {
    if (!getOnboardingGender()) {
      onboardingBody.prepend(buildOnboardingBotMessage("Choose Female or Male before I save your detected profile."));
      return;
    }
    showOnboardingLoading("style-analysis");
  }
}

function handleOnboardingBack() {
  if (!onboardingActive) {
    return false;
  }

  if (onboardingStep === "welcome") {
    skipOnboarding();
    return true;
  }
  if (onboardingStep === "intro") {
    openOnboardingStep("welcome");
    return true;
  }
  if (onboardingStep === "basic-info") {
    openOnboardingStep("intro");
    return true;
  }
  if (onboardingStep === "body-features") {
    openOnboardingStep("basic-info");
    return true;
  }
  if (onboardingStep === "vibe") {
    openOnboardingStep("body-features");
    return true;
  }
  if (onboardingStep === "confirm") {
    openOnboardingStep("intro");
    return true;
  }
  if (onboardingStep === "style-analysis") {
    openOnboardingStep(shopperOnboardingData.path === "scan" ? "confirm" : "vibe");
    return true;
  }
  return false;
}

function buildOnboardingBotMessage(text) {
  const row = document.createElement("div");
  row.className = "onboarding-bot-row";
  const avatar = document.createElement("span");
  avatar.className = "onboarding-bot-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.innerHTML = BOT_AVATAR_LOGO;
  const bubble = document.createElement("p");
  bubble.className = "onboarding-bot-bubble";
  bubble.textContent = text;
  row.append(avatar, bubble);
  return row;
}

function buildOnboardingProgressBar(activeStep) {
  const stepIndex = ONBOARDING_PROGRESS_STEPS.indexOf(activeStep);
  if (stepIndex < 0) {
    return null;
  }
  const bar = document.createElement("div");
  bar.className = "onboarding-progress";
  bar.setAttribute("aria-hidden", "true");
  ONBOARDING_PROGRESS_STEPS.forEach((_, index) => {
    const segment = document.createElement("span");
    segment.className = `onboarding-progress-segment${index <= stepIndex ? " is-filled" : ""}`;
    bar.appendChild(segment);
  });
  return bar;
}

function appendOnboardingProgressIfNeeded() {
  const progress = buildOnboardingProgressBar(onboardingStep);
  if (progress) {
    onboardingBody.appendChild(progress);
  }
}

function getHairOptionByValue(value) {
  return ONBOARDING_HAIR_OPTIONS.find((option) => option.value === value) || null;
}

function getEyeOptionByValue(value) {
  return ONBOARDING_EYE_OPTIONS.find((option) => option.value === value) || null;
}

function renderOnboardingWelcome() {
  onboardingBody.appendChild(
    buildOnboardingBotMessage(
      "Hi! I'm GenieBot! Take a quick 2-minute quiz so I can give you personalized outfits, flattering styles, and colors that suit you."
    )
  );
  onboardingBody.appendChild(buildOnboardingBotMessage("Ready to get started?"));

  const letsGoBtn = document.createElement("button");
  letsGoBtn.type = "button";
  letsGoBtn.className = "onboarding-primary-btn onboarding-welcome-cta";
  letsGoBtn.textContent = "Let's go!";
  letsGoBtn.addEventListener("click", () => openOnboardingStep("intro"));

  const skipLink = document.createElement("button");
  skipLink.type = "button";
  skipLink.className = "onboarding-skip-link";
  skipLink.textContent = "Skip for now";
  skipLink.addEventListener("click", () => skipOnboarding());

  onboardingBody.append(letsGoBtn, skipLink);
}

function renderOnboardingIntro() {
  onboardingBody.appendChild(buildOnboardingBotMessage("How would you like to proceed?"));

  const grid = document.createElement("div");
  grid.className = "onboarding-choice-grid";

  const scanCard = buildOnboardingChoiceCard({
    icon: ACTION_ICONS.camera,
    title: "Scan yourself",
    description: "Take a photo and I'll detect your features automatically!",
    selected: shopperOnboardingData.path === "scan",
    onClick: () => {
      shopperOnboardingData.path = "scan";
      onboardingCameraMode = true;
      openOnboardingScanCamera();
    },
  });

  const manualCard = buildOnboardingChoiceCard({
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    title: "Enter manually",
    description: "Prefer to select everything yourself? No problem!",
    selected: shopperOnboardingData.path === "manual",
    onClick: () => {
      shopperOnboardingData.path = "manual";
      openOnboardingStep("basic-info");
    },
  });

  grid.append(scanCard, manualCard);
  onboardingBody.appendChild(grid);
}

function buildOnboardingChoiceCard({ icon, title, description, selected, onClick }) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `onboarding-choice-card${selected ? " is-selected" : ""}`;
  const iconWrap = document.createElement("span");
  iconWrap.className = "onboarding-choice-card-icon";
  iconWrap.innerHTML = icon;
  const titleEl = document.createElement("span");
  titleEl.className = "onboarding-choice-card-title";
  titleEl.textContent = title;
  const descEl = document.createElement("span");
  descEl.className = "onboarding-choice-card-desc";
  descEl.textContent = description;
  card.append(iconWrap, titleEl, descEl);
  card.addEventListener("click", onClick);
  return card;
}

function renderOnboardingBasicInfo() {
  appendOnboardingProgressIfNeeded();

  onboardingBody.appendChild(
    buildOnboardingField("What should I call you?", "text", shopperOnboardingData.name, (value) => {
      shopperOnboardingData.name = value;
    }, "Name")
  );

  onboardingBody.appendChild(
    buildOnboardingSelectField(
      "Gender",
      ONBOARDING_GENDER_OPTIONS,
      shopperOnboardingData.gender,
      (value) => {
        shopperOnboardingData.gender = value;
        ensureOnboardingBodyShapeMatchesGender();
      },
      "Select gender"
    )
  );

  onboardingBody.appendChild(
    buildOnboardingSelectField("Top size", ONBOARDING_SIZE_OPTIONS.top, shopperOnboardingData.topSize, (value) => {
      shopperOnboardingData.topSize = value;
    }, "Select size")
  );

  onboardingBody.appendChild(
    buildOnboardingSelectField("Bottom size", ONBOARDING_SIZE_OPTIONS.bottom, shopperOnboardingData.bottomSize, (value) => {
      shopperOnboardingData.bottomSize = value;
    }, "Select size")
  );

  onboardingBody.appendChild(
    buildOnboardingSelectField("Shoe size (EU)", ONBOARDING_SIZE_OPTIONS.shoe, shopperOnboardingData.shoeSize, (value) => {
      shopperOnboardingData.shoeSize = value;
    }, "Select size")
  );
}

function buildOnboardingField(label, type, value, onChange, placeholder = "") {
  const field = document.createElement("div");
  field.className = "onboarding-field";
  const labelEl = document.createElement("label");
  labelEl.className = "onboarding-label";
  labelEl.textContent = label;
  const input = document.createElement("input");
  input.className = "onboarding-input";
  input.type = type;
  input.placeholder = placeholder;
  input.value = value || "";
  input.addEventListener("input", () => onChange(input.value.trim()));
  field.append(labelEl, input);
  return field;
}

function buildOnboardingSelectField(label, options, value, onChange, placeholderText = "Select…") {
  const field = document.createElement("div");
  field.className = "onboarding-field";
  const labelEl = document.createElement("label");
  labelEl.className = "onboarding-label";
  labelEl.textContent = label;
  const select = document.createElement("select");
  select.className = "onboarding-select";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;
  placeholder.disabled = true;
  placeholder.selected = !value;
  select.appendChild(placeholder);
  options.forEach((option) => {
    const optionValue = typeof option === "string" ? option : option.value;
    const optionLabel = typeof option === "string" ? option : option.label;
    const opt = document.createElement("option");
    opt.value = optionValue;
    opt.textContent = optionLabel;
    if (optionValue === value) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  select.addEventListener("change", () => onChange(select.value));
  field.append(labelEl, select);
  return field;
}

function buildOnboardingColorSelectField(label, colorOptions, selectedValue, onChange) {
  const field = document.createElement("div");
  field.className = "onboarding-field";
  const labelEl = document.createElement("label");
  labelEl.className = "onboarding-label";
  labelEl.textContent = label;
  const select = document.createElement("select");
  select.className = "onboarding-select";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select color";
  placeholder.disabled = true;
  placeholder.selected = !selectedValue;
  select.appendChild(placeholder);
  colorOptions.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === selectedValue) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  select.addEventListener("change", () => onChange(select.value));
  field.append(labelEl, select);
  return field;
}

function renderOnboardingBodyFeatures() {
  appendOnboardingProgressIfNeeded();
  ensureOnboardingBodyShapeMatchesGender();

  onboardingBody.appendChild(
    buildOnboardingSelectField(
      "Gender",
      ONBOARDING_GENDER_OPTIONS,
      shopperOnboardingData.gender,
      (value) => {
        shopperOnboardingData.gender = value;
        ensureOnboardingBodyShapeMatchesGender();
        openOnboardingStep("body-features");
      },
      "Select gender"
    )
  );

  const shapeHeader = document.createElement("div");
  shapeHeader.className = "onboarding-section-header";
  const shapeLabel = document.createElement("p");
  shapeLabel.className = "onboarding-section-label";
  shapeLabel.textContent = "Your body type";
  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "onboarding-info-btn";
  infoBtn.textContent = "i";
  infoBtn.setAttribute("aria-label", "Body type help");
  const infoText = document.createElement("p");
  infoText.className = "onboarding-info-text hidden";
  infoText.textContent =
    getOnboardingGender() === "menswear"
      ? "Choose the outline closest to your shoulders, waist, and torso shape."
      : "Choose the outline closest to your shoulder, waist, and hip balance.";
  shapeHeader.append(shapeLabel, infoBtn);

  const selectedShape = getOnboardingBodyShapeById(shopperOnboardingData.bodyShape);
  const selectedPreview = document.createElement("div");
  selectedPreview.className = "onboarding-selected-shape";
  const selectedIcon = document.createElement("span");
  selectedIcon.className = `onboarding-shape-icon ${shopperOnboardingData.bodyShape}`;
  const selectedCopy = document.createElement("span");
  selectedCopy.className = "onboarding-selected-shape-copy";
  selectedCopy.innerHTML = `<strong>${selectedShape?.label || "Body type"}</strong><small>${selectedShape?.hint || "Tap info to choose"}</small>`;
  selectedPreview.append(selectedIcon, selectedCopy);

  const shapeRow = document.createElement("div");
  shapeRow.className = "onboarding-shape-row onboarding-shape-scroll hidden";
  infoBtn.addEventListener("click", () => {
    infoText.classList.toggle("hidden");
    shapeRow.classList.toggle("hidden");
  });

  getOnboardingBodyShapes().forEach((shape) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `onboarding-shape-btn${shopperOnboardingData.bodyShape === shape.id ? " is-selected" : ""}`;
    const icon = document.createElement("span");
    icon.className = `onboarding-shape-icon ${shape.id}`;
    const label = document.createElement("span");
    label.className = "onboarding-shape-label";
    label.textContent = shape.label;
    const hint = document.createElement("span");
    hint.className = "onboarding-shape-hint";
    hint.textContent = shape.hint || "";
    btn.append(icon, label, hint);
    btn.addEventListener("click", () => {
      shopperOnboardingData.bodyShape = shape.id;
      selectedIcon.className = `onboarding-shape-icon ${shape.id}`;
      selectedCopy.innerHTML = `<strong>${shape.label}</strong><small>${shape.hint || ""}</small>`;
      shapeRow.querySelectorAll(".onboarding-shape-btn").forEach((node) => {
        node.classList.toggle("is-selected", node === btn);
      });
      infoText.classList.add("hidden");
      shapeRow.classList.add("hidden");
    });
    shapeRow.appendChild(btn);
  });

  onboardingBody.append(shapeHeader, selectedPreview, infoText, shapeRow);
  onboardingBody.appendChild(
    buildOnboardingSwatchSection("Skin tone", ONBOARDING_SKIN_TONES, shopperOnboardingData.skinTone, (color) => {
      shopperOnboardingData.skinTone = color;
    })
  );
  onboardingBody.appendChild(
    buildOnboardingColorSelectField("Hair color", ONBOARDING_HAIR_OPTIONS, shopperOnboardingData.hairColor, (value) => {
      shopperOnboardingData.hairColor = value;
      const match = getHairOptionByValue(value);
      if (match) {
        shopperOnboardingData.hairColorHex = match.color;
      }
    })
  );
  onboardingBody.appendChild(
    buildOnboardingColorSelectField("Eye color", ONBOARDING_EYE_OPTIONS, shopperOnboardingData.eyeColor, (value) => {
      shopperOnboardingData.eyeColor = value;
      const match = getEyeOptionByValue(value);
      if (match) {
        shopperOnboardingData.eyeColorHex = match.color;
      }
    })
  );
}

function buildOnboardingSwatchSection(label, colors, selected, onSelect) {
  const sectionLabel = document.createElement("p");
  sectionLabel.className = "onboarding-section-label";
  sectionLabel.textContent = label;
  const row = document.createElement("div");
  row.className = "onboarding-swatch-row";
  colors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = `onboarding-swatch${selected === color ? " is-selected" : ""}`;
    swatch.style.background = color;
    swatch.setAttribute("aria-label", color);
    swatch.addEventListener("click", () => {
      onSelect(color);
      row.querySelectorAll(".onboarding-swatch").forEach((node) => {
        node.classList.toggle("is-selected", node === swatch);
      });
    });
    row.appendChild(swatch);
  });
  const wrap = document.createElement("div");
  wrap.append(sectionLabel, row);
  return wrap;
}

function renderOnboardingVibe() {
  appendOnboardingProgressIfNeeded();

  const pinterestLabel = document.createElement("p");
  pinterestLabel.className = "onboarding-section-label";
  pinterestLabel.textContent = "Pinterest";
  const pinterestHint = document.createElement("p");
  pinterestHint.className = "onboarding-field-hint";
  pinterestHint.textContent = "Share your Pinterest board to analyze";
  const pinterestInput = document.createElement("input");
  pinterestInput.className = "onboarding-input";
  pinterestInput.type = "url";
  pinterestInput.placeholder = "Paste board URL";
  pinterestInput.value = shopperOnboardingData.pinterestUrl || "";
  pinterestInput.addEventListener("input", () => {
    shopperOnboardingData.pinterestUrl = pinterestInput.value.trim();
  });

  const uploadLabel = document.createElement("p");
  uploadLabel.className = "onboarding-section-label";
  uploadLabel.textContent = "Upload your style";
  const uploadHint = document.createElement("p");
  uploadHint.className = "onboarding-field-hint";
  uploadHint.textContent = "Upload photos of the outfit you love";
  const uploadZone = document.createElement("button");
  uploadZone.type = "button";
  uploadZone.className = "onboarding-upload-zone";
  const uploadIcon = document.createElement("span");
  uploadIcon.className = "onboarding-upload-zone-icon";
  uploadIcon.innerHTML = ACTION_ICONS.upload;
  const uploadText = document.createElement("span");
  uploadText.textContent = "Tap to upload images (1–5 max)";
  uploadZone.append(uploadIcon, uploadText);

  const previewRow = document.createElement("div");
  previewRow.className = "onboarding-upload-preview-row";

  const hiddenFile = document.createElement("input");
  hiddenFile.type = "file";
  hiddenFile.accept = "image/*";
  hiddenFile.multiple = true;
  hiddenFile.hidden = true;

  function renderStylePreviews() {
    previewRow.innerHTML = "";
    (shopperOnboardingData.styleImages || []).forEach((item) => {
      const img = document.createElement("img");
      img.className = "onboarding-upload-preview-thumb";
      img.src = item.previewUrl;
      img.alt = "Style reference";
      previewRow.appendChild(img);
    });
  }

  hiddenFile.addEventListener("change", () => {
    const files = Array.from(hiddenFile.files || []).slice(0, 5);
    if (!files.length) {
      return;
    }
    shopperOnboardingData.styleImages = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    shopperOnboardingData.styleImageFile = files[0];
    shopperOnboardingData.styleImagePreview = shopperOnboardingData.styleImages[0].previewUrl;
    renderStylePreviews();
    hiddenFile.value = "";
  });

  uploadZone.addEventListener("click", () => hiddenFile.click());

  const descLabel = document.createElement("p");
  descLabel.className = "onboarding-section-label";
  descLabel.textContent = "Describe your style";
  const descHint = document.createElement("p");
  descHint.className = "onboarding-field-hint";
  descHint.textContent = "Tell us about your style in a few words";
  const textarea = document.createElement("textarea");
  textarea.className = "onboarding-textarea";
  textarea.placeholder = "E.g. I love soft minimal colors with…";
  textarea.value = shopperOnboardingData.styleDescription;
  textarea.addEventListener("input", () => {
    shopperOnboardingData.styleDescription = textarea.value.trim();
  });

  onboardingBody.append(pinterestLabel, pinterestHint, pinterestInput, uploadLabel, uploadHint, uploadZone, hiddenFile);
  if (shopperOnboardingData.styleImages && shopperOnboardingData.styleImages.length) {
    renderStylePreviews();
    onboardingBody.appendChild(previewRow);
  } else if (shopperOnboardingData.styleImagePreview) {
    const legacyPreview = document.createElement("img");
    legacyPreview.className = "onboarding-upload-preview";
    legacyPreview.src = shopperOnboardingData.styleImagePreview;
    legacyPreview.alt = "Style reference";
    onboardingBody.appendChild(legacyPreview);
  } else {
    onboardingBody.appendChild(previewRow);
  }
  onboardingBody.append(descLabel, descHint, textarea);
}

function renderOnboardingConfirm() {
  ensureOnboardingBodyShapeMatchesGender();

  onboardingBody.appendChild(
    buildOnboardingBotMessage("Here's what I detected. Tap Edit if anything looks off.")
  );

  const autoLabel = document.createElement("p");
  autoLabel.className = "onboarding-auto-detected-label";
  autoLabel.textContent = "✓ Auto-detected";

  const grid = document.createElement("div");
  grid.className = "onboarding-summary-grid";

  grid.appendChild(
    buildOnboardingSelectField(
      "Gender",
      ONBOARDING_GENDER_OPTIONS,
      shopperOnboardingData.gender,
      (value) => {
        shopperOnboardingData.gender = value;
        ensureOnboardingBodyShapeMatchesGender();
        openOnboardingStep("confirm");
      },
      "Select gender"
    )
  );

  grid.appendChild(buildOnboardingBodyTypeSummaryItem());

  const skinItem = document.createElement("div");
  skinItem.className = "onboarding-summary-item";
  const skinLabel = document.createElement("label");
  skinLabel.textContent = "Skin tone";
  const skinSelect = document.createElement("select");
  skinSelect.className = "onboarding-select";
  ONBOARDING_SKIN_TONES.forEach((color, index) => {
    const opt = document.createElement("option");
    opt.value = color;
    opt.textContent = ONBOARDING_SKIN_LABELS[index] || color;
    if (color === shopperOnboardingData.skinTone) {
      opt.selected = true;
    }
    skinSelect.appendChild(opt);
  });
  skinSelect.addEventListener("change", () => {
    shopperOnboardingData.skinTone = skinSelect.value;
  });
  skinItem.append(skinLabel, skinSelect);
  grid.appendChild(skinItem);

  grid.appendChild(
    buildOnboardingSummaryItem(
      "Hair color",
      ONBOARDING_HAIR_OPTIONS.map((option) => option.label),
      getHairOptionByValue(shopperOnboardingData.hairColor)?.label || "Brown",
      (value) => {
        const match = ONBOARDING_HAIR_OPTIONS.find((option) => option.label === value);
        if (match) {
          shopperOnboardingData.hairColor = match.value;
          shopperOnboardingData.hairColorHex = match.color;
        }
      }
    )
  );

  grid.appendChild(
    buildOnboardingSummaryItem(
      "Eye color",
      ONBOARDING_EYE_OPTIONS.map((option) => option.label),
      getEyeOptionByValue(shopperOnboardingData.eyeColor)?.label || "Brown",
      (value) => {
        const match = ONBOARDING_EYE_OPTIONS.find((option) => option.label === value);
        if (match) {
          shopperOnboardingData.eyeColor = match.value;
          shopperOnboardingData.eyeColorHex = match.color;
        }
      }
    )
  );

  grid.appendChild(
    buildOnboardingSummaryItem("Top size", ONBOARDING_SIZE_OPTIONS.top, shopperOnboardingData.topSize, (value) => {
      shopperOnboardingData.topSize = value;
    })
  );
  grid.appendChild(
    buildOnboardingSummaryItem("Bottom size", ONBOARDING_SIZE_OPTIONS.bottom, shopperOnboardingData.bottomSize, (value) => {
      shopperOnboardingData.bottomSize = value;
    })
  );
  grid.appendChild(
    buildOnboardingSummaryItem("Shoe size", ONBOARDING_SIZE_OPTIONS.shoe, shopperOnboardingData.shoeSize, (value) => {
      shopperOnboardingData.shoeSize = value;
    })
  );

  onboardingBody.append(autoLabel, grid);
}

function buildOnboardingBodyTypeSummaryItem() {
  const item = document.createElement("div");
  item.className = "onboarding-summary-item onboarding-body-summary-item";
  const labelEl = document.createElement("label");
  labelEl.textContent = "Body type";

  const visual = document.createElement("div");
  visual.className = "onboarding-body-summary-visual";
  const icon = document.createElement("span");
  icon.className = `onboarding-shape-icon ${shopperOnboardingData.bodyShape}`;
  const selectedLabel = document.createElement("span");
  selectedLabel.textContent = getOnboardingBodyShapeById(shopperOnboardingData.bodyShape)?.label || "Balanced";
  visual.append(icon, selectedLabel);

  const select = document.createElement("select");
  select.className = "onboarding-select";
  getOnboardingBodyShapes().forEach((shape) => {
    const opt = document.createElement("option");
    opt.value = shape.id;
    opt.textContent = shape.label;
    if (shape.id === shopperOnboardingData.bodyShape) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    shopperOnboardingData.bodyShape = select.value;
    icon.className = `onboarding-shape-icon ${shopperOnboardingData.bodyShape}`;
    selectedLabel.textContent = getOnboardingBodyShapeById(shopperOnboardingData.bodyShape)?.label || "Balanced";
  });

  item.append(labelEl, visual, select);
  return item;
}

function buildOnboardingSummaryItem(label, options, value, onChange) {
  const item = document.createElement("div");
  item.className = "onboarding-summary-item";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  const select = document.createElement("select");
  select.className = "onboarding-select";
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    if (option === value) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  select.addEventListener("change", () => onChange(select.value));
  item.append(labelEl, select);
  return item;
}

function buildStyleAnalysisTraits() {
  const traits = [];
  if (shopperOnboardingData.aesthetics.length) {
    traits.push(...shopperOnboardingData.aesthetics.slice(0, 2));
  } else if (shopperOnboardingData.styleDescription) {
    traits.push(shopperOnboardingData.styleDescription.split(/\s+/).slice(0, 2).join(" "));
  } else {
    traits.push("Classic", "Minimalist");
  }
  if (shopperOnboardingData.bodyShape) {
    traits.push(`${getOnboardingBodyShapeById(shopperOnboardingData.bodyShape)?.label || "Balanced"} silhouette`);
  }
  traits.push("Neutral tones");
  return traits.slice(0, 4);
}

function renderOnboardingStyleAnalysis() {
  const card = document.createElement("div");
  card.className = "onboarding-analysis-card";
  const title = document.createElement("h3");
  title.textContent = "Your style profile";
  const list = document.createElement("ul");
  list.className = "onboarding-analysis-list";
  buildStyleAnalysisTraits().forEach((trait) => {
    const li = document.createElement("li");
    li.textContent = trait;
    list.appendChild(li);
  });
  const summary = document.createElement("p");
  summary.style.margin = "12px 0 0";
  summary.style.fontSize = "0.84rem";
  summary.style.color = "var(--ink-soft)";
  summary.style.lineHeight = "1.45";
  const name = shopperOnboardingData.name || "You";
  summary.textContent = `${name}, your profile leans ${traitsToSummary()}. I'll use this to tailor outfits that feel intentional and easy to wear.`;
  card.append(title, list, summary);

  const perfectBtn = document.createElement("button");
  perfectBtn.type = "button";
  perfectBtn.className = "onboarding-primary-btn";
  perfectBtn.textContent = "Perfect!";
  perfectBtn.addEventListener("click", () => completeOnboarding());

  const adjustBtn = document.createElement("button");
  adjustBtn.type = "button";
  adjustBtn.className = "onboarding-secondary-btn";
  adjustBtn.textContent = "Adjust it";
  adjustBtn.addEventListener("click", () => {
    if (shopperOnboardingData.path === "scan") {
      openOnboardingStep("confirm");
    } else {
      openOnboardingStep("vibe");
    }
  });

  onboardingBody.append(card, perfectBtn, adjustBtn);
}

function traitsToSummary() {
  const traits = buildStyleAnalysisTraits();
  return traits.slice(0, 2).join(" and ").toLowerCase();
}

async function openOnboardingScanCamera() {
  setOnboardingUiActive(false);
  onboardingCameraMode = true;
  await openCameraCapture();
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
      shopperProfileDraft.location ||
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
    location: shopperProfileDraft.location || null,
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
  if (profileInputs.location) {
    parts.push(`location: ${profileInputs.location}`);
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

function isGenericOutfitStarterMessage(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  return [
    "create full outfit",
    "create a full outfit",
    "full outfit",
    "build full outfit",
    "build a full outfit",
  ].includes(normalized);
}

function formatMessageTime(date = new Date()) {
  return date
    .toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase()
    .replace(/\s/g, "");
}

function appendMessageTimestamp(bubble, timeText = formatMessageTime()) {
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = timeText;
  bubble.appendChild(time);
}

const BOT_AVATAR_LOGO = `<img src="./assets/geniebot-avatar.png" alt="" aria-hidden="true" />`;

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
      defaultAssistantName;

    avatar.classList.add("has-image");
    avatar.innerHTML = BOT_AVATAR_LOGO;
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

function renderWidgetLogo(_customization) {
  /* logo moved to bot avatar bubbles in Figma layout */
}

function applyChatbotCustomization(customization) {
  if (!customization) {
    return;
  }

  latestCustomization = customization;
  const assistantName = customization.assistant_name || defaultAssistantName;
  const welcomeMessage = customization.welcome_message || starterMessages.outfit;

  welcomeContent.outfit.eyebrow = assistantName;
  welcomeContent.outfit.title = customization.welcome_title || "What would you like to do today?";
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
  const openerText = "What would you like to do today?";

  const firstBotBubble = chatLog.querySelector(".message.bot .message-paragraph");
  if (firstBotBubble && homeViewActive && !chatLog.querySelector(".recommendation-panel")) {
    firstBotBubble.textContent = openerText;
  }
}

function syncWidgetHeader(mode = activeMode) {
  syncWidgetModeClass(mode);
  if (!widgetWelcomeTitle) {
    return;
  }

  if (authViewActive) {
    const titles = {
      login: "Customer Login",
      signup: "Create Account",
      forgot: "Reset Password",
    };
    widgetWelcomeTitle.textContent = titles[authStep] || "Customer Login";
    if (widgetFeatureSubtitle) {
      widgetFeatureSubtitle.classList.add("hidden");
    }
    return;
  }

  if (onboardingActive && onboardingStep) {
    syncOnboardingHeader();
    return;
  }

  if (swapScreenActive) {
    const swapMode = swapScreenContext && swapScreenContext.uiMode;
    widgetWelcomeTitle.textContent = featureLabels[swapMode] || featureLabels[activeMode] || defaultWelcomeTitle;
    if (widgetFeatureSubtitle) {
      widgetFeatureSubtitle.textContent = "";
      widgetFeatureSubtitle.classList.add("hidden");
    }
    return;
  }

  if (cameraCard && !cameraCard.classList.contains("hidden")) {
    widgetWelcomeTitle.textContent = onboardingCameraMode
      ? "Scan yourself"
      : featureLabels[activeMode] || featureLabels.complete;
    if (widgetFeatureSubtitle) {
      widgetFeatureSubtitle.textContent = onboardingCameraMode ? "Make sure to be visible" : "";
      widgetFeatureSubtitle.classList.toggle("hidden", !onboardingCameraMode);
    }
    return;
  }

  if (homeViewActive) {
    widgetWelcomeTitle.textContent = defaultWelcomeTitle;
    if (widgetFeatureSubtitle) {
      widgetFeatureSubtitle.textContent = "";
      widgetFeatureSubtitle.classList.add("hidden");
    }
    return;
  }

  widgetWelcomeTitle.textContent = featureLabels[mode] || defaultWelcomeTitle;
  if (activeMode === "support" && supportFlowContext) {
    widgetWelcomeTitle.textContent = getSupportFlowTitle();
  }
  if (widgetFeatureSubtitle) {
    widgetFeatureSubtitle.textContent = "";
    widgetFeatureSubtitle.classList.add("hidden");
  }
}

function syncWidgetModeClass(mode = activeMode) {
  if (!widgetPanel) {
    return;
  }
  widgetPanel.dataset.mode = homeViewActive ? "home" : mode;
}

function addSuggestionChips(options, onSelect, variant = "default") {
  if (!options || options.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = `suggestion-strip ${variant} figma-card-screen`;

  const row = document.createElement("div");
  row.className = "suggestion-row";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    if (variant === "opening" && option.mode === activeMode) {
      button.classList.add("is-selected");
    }
    if (option.icon && ACTION_ICONS[option.icon]) {
      const iconWrap = document.createElement("span");
      iconWrap.className = "suggestion-chip-icon";
      iconWrap.innerHTML = ACTION_ICONS[option.icon];
      button.appendChild(iconWrap);
    }
    if (option.image_url) {
      const imageWrap = document.createElement("span");
      imageWrap.className = "suggestion-chip-image";
      const image = document.createElement("img");
      image.src = option.image_url;
      image.alt = option.label || "Style option";
      image.loading = "lazy";
      imageWrap.appendChild(image);
      button.appendChild(imageWrap);
    }
    const label = document.createElement("span");
    label.className = option.description ? "suggestion-chip-title" : "";
    label.textContent = option.label;
    button.appendChild(label);
    if (option.description) {
      const description = document.createElement("span");
      description.className = "suggestion-chip-desc";
      description.textContent = option.description;
      button.appendChild(description);
    }
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
  if (variant === "opening") {
    chatLog.scrollTop = 0;
    requestAnimationFrame(() => {
      chatLog.scrollTop = 0;
    });
    window.setTimeout(() => {
      chatLog.scrollTop = 0;
    }, 120);
  } else {
    scrollChatToBottom();
    requestAnimationFrame(scrollChatToBottom);
    window.setTimeout(scrollChatToBottom, 120);
  }
}

function addInlineLinkInput(placeholder, onSubmit, inputType = "url") {
  const panel = document.createElement("section");
  panel.className = "inline-input-panel";

  const form = document.createElement("form");
  form.className = "inline-input-form";

  const input = document.createElement("input");
  input.type = inputType;
  input.placeholder = placeholder;
  input.required = true;
  input.autocomplete = "off";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "inline-input-submit";
  submit.textContent = inputType === "url" ? "Submit link" : "Submit";

  form.append(input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      return;
    }
    submit.disabled = true;
    input.disabled = true;
    onSubmit(value);
  });

  panel.appendChild(form);
  chatLog.appendChild(panel);
  scrollChatToBottom();
  input.focus();
}

function renderPinterestLinkInput() {
  clearActivePromptPanels();
  addMessage("Paste your Pinterest board link below.", "bot");
  addInlineLinkInput("Paste Pinterest board URL", (url) => {
    addMessage(url, "user");
    imageUrlInput.value = url;
    void sendImageChat("", null, url, { skipUserEcho: true });
  });
  const inputPanel = chatLog.querySelector(".inline-input-panel:last-of-type");
  if (inputPanel) {
    requestAnimationFrame(() => inputPanel.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
}

function clearActivePromptPanels() {
  chatLog
    .querySelectorAll(
      ".suggestion-strip:not(.opening), .next-step-panel, .feedback-panel, .inline-input-panel, .inspire-upload-panel, .inspire-loading-panel, .care-panel"
        + ", .outfit-builder-panel, .inspire-demo-grid-panel, .outfit-swap-selection-panel, .outfit-swap-options-panel"
    )
    .forEach((node) => {
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

function syncHeaderNavButton() {
  if (!widgetNavButton) {
    return;
  }

  const closeIcon = widgetNavButton.querySelector(".nav-icon-close");
  const backIcon = widgetNavButton.querySelector(".nav-icon-back");
  const cameraOpen = cameraCard && !cameraCard.classList.contains("hidden");
  const showBack =
    swapScreenActive ||
    onboardingActive ||
    (authViewActive && authStep !== "login") ||
    !homeViewActive ||
    cameraOpen;

  if (closeIcon) {
    closeIcon.classList.toggle("hidden", showBack);
  }
  if (backIcon) {
    backIcon.classList.toggle("hidden", !showBack);
  }

  widgetNavButton.setAttribute("aria-label", showBack ? "Go back" : "Close chat");
  widgetNavButton.title = showBack ? "Go back" : "Close chat";
}

function syncHeaderHomeButton(mode = activeMode) {
  syncHeaderNavButton();
  syncWidgetHeader(mode);
}

function returnToChatHome() {
  closeSwapScreen({ silent: true });
  clearActivePromptPanels();
  resetSupportFlowContext();
  pendingDecisionRequest = null;
  pendingStylingFollowUpField = null;
  resetInspireFlowContext();
  showHomeFeatureCards();
  scrollChatToBottom();
}

function renderHomeOpener() {
  homeViewActive = true;
  addMessage(getHomeOpenerMessage(), "bot");
  addSuggestionChips(getOpenerSuggestions(), (option) => handleStarterSelection(option), "opening");
  syncHeaderHomeButton();
  syncWidgetHeader();
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
    chatForm.classList.toggle("home-mode", homeViewActive);
  }

  syncComposerBadges(mode, signalLabel);
  syncHeaderHomeButton(mode);
  syncWidgetHeader(mode);
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

function getHomeOpenerMessage() {
  const name = shopperOnboardingData.name || shopperIdentity.name || "";
  const firstName = String(name).trim().split(/\s+/)[0];
  if (firstName && firstName !== "guest-001") {
    return `Hi ${firstName}! What would you like to do today?`;
  }
  return "What would you like to do today?";
}

function showHomeFeatureCards() {
  homeViewActive = true;
  onboardingActive = false;
  onboardingStep = null;
  authViewActive = false;
  swapScreenActive = false;
  onboardingCameraMode = false;
  if (widgetPanel) {
    widgetPanel.classList.remove("onboarding-active", "auth-active", "camera-active", "camera-scan-mode");
    widgetPanel.dataset.mode = "home";
  }
  if (onboardingScreen) {
    onboardingScreen.classList.add("hidden");
  }
  if (onboardingLoadingScreen) {
    onboardingLoadingScreen.classList.add("hidden");
  }
  if (authScreen) {
    authScreen.classList.add("hidden");
  }
  if (swapScreen) {
    swapScreen.classList.add("hidden");
  }
  if (cameraCard) {
    cameraCard.classList.add("hidden");
  }
  if (chatLog) {
    chatLog.innerHTML = "";
  }
  setMode(defaultUiMode, { silent: true });
  renderHomeOpener();
  syncSkipButtonVisibility();
}

function getOpenerSuggestions() {
  return [
    {
      label: "Create Full Outfit",
      description: "Create a full look based on occasion, style, and budget.",
      action: "mode",
      mode: "outfit",
      icon: "outfit",
    },
    {
      label: "Complete my look",
      description: "Have a piece? Find perfect items to match it!",
      action: "mode",
      mode: "complete",
      icon: "camera",
    },
    {
      label: "Get Inspired",
      description: "Explore new trends, browse collections and discover looks.",
      action: "mode",
      mode: "inspire",
      icon: "inspire",
    },
    {
      label: "Customer care",
      description: "Track orders, returns, shipping info, and general support",
      action: "mode",
      mode: "support",
      icon: "agent",
    },
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

const CARE_MENU_ACTIONS = [
  { label: "Track my order", icon: "track", flow: "track" },
  { label: "Returns or exchanges", userLabel: "Return or exchanges", icon: "return", flow: "return" },
  { label: "FAQ’s", icon: "faq", flow: "faq" },
  { label: "Talk to agent", icon: "agent", flow: "agent" },
];

function createCareProductImageSvg(type, fill, accent = "#ffffff") {
  const shapes = {
    top:
      `<path d="M72 36l-20 12-17-15-18 18 18 25v55h74V76l18-25-18-18-17 15-20-12z" fill="${fill}"/><path d="M53 48c7 8 31 8 38 0" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`,
    skirt:
      `<path d="M50 38h56l10 98H40L50 38z" fill="${fill}"/><path d="M54 44h48M62 50l-8 80M78 50l-3 80M94 50l3 80" stroke="${accent}" stroke-width="4" stroke-linecap="round" opacity=".55"/>`,
    jacket:
      `<path d="M50 35l22 15 22-15 27 20-13 29v52H36V84L23 55l27-20z" fill="${fill}"/><path d="M72 50v86M72 50L54 84M72 50l18 34" stroke="${accent}" stroke-width="5" stroke-linecap="round"/><path d="M49 93h14M82 93h14" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`,
    dress:
      `<path d="M60 34h48l-10 39 27 63H43l27-63-10-39z" fill="${fill}"/><path d="M68 39c6 9 26 9 32 0M69 75h30" stroke="${accent}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`,
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 170"><rect width="150" height="170" rx="18" fill="#f8f8f8"/>${shapes[type] || shapes.top}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const CARE_PRODUCT_IMAGES = {
  blueTop: "./assets/care/blue-top.png",
  yellowSkirt: "./assets/care/yellow-skirt.png",
  jacket: "./assets/care/jacket.png",
  orangeDress: "./assets/care/orange-dress.png",
};

const CARE_DEMO_ORDERS = [
  {
    id: "ord-1042",
    orderRef: "#1042",
    title: "Blue top",
    size: "S",
    color: "Sky blue",
    price: 38,
    orderDate: "Ordered Feb 10, 2026",
    statusLabel: "Shipped",
    imageTone: "#9bd7f2",
    image_url: CARE_PRODUCT_IMAGES.blueTop,
    status: "in_transit",
    eta: "Jun 20, 2026",
    trackingStage: 2,
  },
  {
    id: "ord-1038",
    orderRef: "#1038",
    title: "Silk yellow skirt",
    size: "M",
    color: "Butter yellow",
    orderNumber: "BR20482",
    price: 50,
    orderDate: "Ordered Feb 10, 2026",
    statusLabel: "Shipped",
    imageTone: "#f4d35e",
    image_url: CARE_PRODUCT_IMAGES.yellowSkirt,
    status: "shipped",
    eta: "Jun 22, 2026",
    trackingStage: 2,
  },
  {
    id: "ord-1031",
    orderRef: "#1031",
    title: "Jacket",
    size: "S",
    color: "Camel",
    price: 74,
    orderDate: "Ordered Feb 10, 2026",
    statusLabel: "Delivered",
    imageTone: "#bf8a4a",
    image_url: CARE_PRODUCT_IMAGES.jacket,
    status: "delivered",
    eta: "Delivered Jun 10",
    trackingStage: 1,
  },
  {
    id: "ord-1027",
    orderRef: "#1027",
    title: "Orange dress",
    size: "M",
    color: "Tangerine",
    price: 65,
    orderDate: "Ordered Feb 10, 2026",
    statusLabel: "Delivered",
    imageTone: "#fb923c",
    image_url: CARE_PRODUCT_IMAGES.orangeDress,
    status: "placed",
    eta: "Processing",
    trackingStage: 0,
  },
];

async function getCareShopifyOrders() {
  // Use real Shopify catalog imagery/variants in the Hi-Fi order cards. Order
  // status is still verified by the support API when the shopper supplies an ID.
  const catalog = (await fetchCatalogProducts(50)).filter(isUsableShopifyProduct);
  const products = selectDiverseCollageProducts(catalog, CARE_DEMO_ORDERS.length);
  if (!products.length) {
    return CARE_DEMO_ORDERS.map((order) => ({ ...order }));
  }
  return CARE_DEMO_ORDERS.map((order, index) => {
    const product = products[index % products.length];
    const mapped = mapCatalogProductToRecommendation(product);
    return {
      ...order,
      ...mapped,
      id: order.id,
      productId: mapped.id,
      orderRef: order.orderRef,
      orderDate: order.orderDate,
      statusLabel: order.statusLabel,
      status: order.status,
      eta: order.eta,
      trackingStage: order.trackingStage,
      size: order.size,
      color: order.color,
    };
  });
}

async function renderCareShopifyProductPicker(onSelect) {
  const orders = await getCareShopifyOrders();
  if (!orders.length) {
    addMessage("I couldn't find a recent order. Please share your order number.", "bot");
    return null;
  }
  return renderCareProductTileGrid(orders, onSelect);
}

const CARE_TRACKING_STEPS = ["Order placed", "Packed", "Shipped", "Delivered"];

const CARE_FAQ_CATEGORIES = [
  {
    id: "sizing",
    label: "Sizing & fit",
    questions: [
      "How do I find my size?",
      "Can I exchange for a different size?",
      "Do your items run true to size?",
    ],
  },
  {
    id: "shipping",
    label: "Shipping",
    questions: [
      "How long does delivery take?",
      "Do you ship internationally?",
      "Can I change my address after ordering?",
      "What are the shipping charges?",
    ],
  },
  {
    id: "returns",
    label: "Returns policy",
    questions: [
      "What is your return policy?",
      "How do I start a return?",
      "When will I receive my refund?",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    questions: [
      "Which payment methods do you accept?",
      "When will my card be charged?",
      "Why was my payment declined?",
    ],
  },
  {
    id: "care",
    label: "Care instructions",
    questions: [
      "How should I care for this item?",
      "Can I machine wash this item?",
      "How should I store delicate pieces?",
    ],
  },
];

const CARE_AGENT_TOPICS = [
  "Order issue",
  "Return/refund",
  "Other",
  "Product question",
  "Payment query",
];

const CARE_RETURN_REASONS = [
  "Wrong Size",
  "Quality Issue",
  "Other",
  "Doesn't Fit Well",
  "Not as Expected",
  "Changed My Mind",
];

const CARE_EXCHANGE_SIZES = ["XS", "S", "M", "L", "XL"];

function resetSupportFlowContext() {
  supportFlowContext = null;
}

function clearCarePanels() {
  chatLog.querySelectorAll(".care-panel").forEach((node) => {
    node.remove();
  });
}

function setSupportFlowScreen(screen, data = {}) {
  supportFlowContext = {
    ...(supportFlowContext || {}),
    ...data,
    screen,
  };
  syncHeaderHomeButton("support");
  syncWidgetHeader("support");
}

function getSupportFlowTitle() {
  return featureLabels.support;
}

function appendCarePanel(className = "care-panel") {
  const panel = document.createElement("section");
  panel.className = `${className} figma-card-screen`;
  chatLog.appendChild(panel);
  scrollChatToBottom();
  return panel;
}

function renderCareMenuGrid(panel, actions, onSelect, activeFlow = "") {
  const grid = document.createElement("div");
  grid.className = "care-menu-grid";

  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-menu-button";
    if (activeFlow && action.flow === activeFlow) {
      button.classList.add("active");
    }
    if (action.icon && ACTION_ICONS[action.icon]) {
      const icon = document.createElement("span");
      icon.className = "care-menu-icon";
      icon.innerHTML = ACTION_ICONS[action.icon];
      button.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = "care-menu-label";
    label.textContent = action.label;
    button.appendChild(label);
    button.addEventListener("click", () => {
      grid.querySelectorAll("button").forEach((item) => {
        item.disabled = true;
        item.classList.toggle("active", item === button);
      });
      onSelect(action);
    });
    grid.appendChild(button);
  });

  panel.appendChild(grid);
}

function renderCareChipRow(panel, options, onSelect, activeValue = "") {
  const row = document.createElement("div");
  row.className = "care-chip-row";

  options.forEach((option) => {
    const label = typeof option === "string" ? option : option.label;
    const value = typeof option === "string" ? option : option.value || option.id || option.label;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-chip";
    if (activeValue && value === activeValue) {
      button.classList.add("active");
    }
    button.textContent = label;
    button.addEventListener("click", () => {
      row.querySelectorAll("button").forEach((item) => {
        item.classList.remove("active");
      });
      button.classList.add("active");
      onSelect(value, label);
    });
    row.appendChild(button);
  });

  panel.appendChild(row);
}

function renderCareProductCard(order, actions = []) {
  const card = document.createElement("article");
  card.className = "care-product-card";

  const media = document.createElement("div");
  media.className = "care-product-media";
  if (order.image_url) {
    const image = document.createElement("img");
    image.src = order.image_url;
    image.alt = order.title;
    image.loading = "lazy";
    media.appendChild(image);
  }

  const info = document.createElement("div");
  info.className = "care-product-info";

  const title = document.createElement("p");
  title.className = "care-product-title";
  title.textContent = order.title;

  const meta = document.createElement("p");
  meta.className = "care-product-meta";
  meta.textContent = [order.size ? `Size ${order.size}` : "", order.color].filter(Boolean).join(" · ");

  info.append(title, meta);

  const actionRow = document.createElement("div");
  actionRow.className = "care-product-actions";

  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.primary ? "care-action-btn primary" : "care-action-btn";
    button.textContent = action.label;
    button.addEventListener("click", () => action.onClick(order));
    actionRow.appendChild(button);
  });

  card.append(media, info, actionRow);
  return card;
}

function renderCareProductTile(order, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "care-product-tile";
  const media = document.createElement("span");
  media.className = "care-product-tile-media";
  if (order.image_url) {
    const image = document.createElement("img");
    image.src = order.image_url;
    image.alt = order.title;
    image.loading = "lazy";
    media.appendChild(image);
  } else {
    media.style.background = order.imageTone || "#fbfbfb";
  }
  const title = document.createElement("span");
  title.className = "care-product-tile-title";
  title.textContent = order.title;
  const meta = document.createElement("span");
  meta.className = "care-product-tile-meta";
  meta.textContent = order.orderDate || [order.color, order.size ? `Size ${order.size}` : ""].filter(Boolean).join(" · ");
  const status = document.createElement("span");
  status.className = "care-product-tile-status";
  status.textContent = order.statusLabel || order.status || "";
  button.append(media, title, meta, status);
  button.addEventListener("click", () => {
    const grid = button.closest(".care-product-tile-grid");
    if (grid) {
      grid.querySelectorAll(".care-product-tile").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    }
    onClick(order);
  });
  return button;
}

function renderCareProductTileGrid(orders, onClick) {
  const panel = appendCarePanel("care-panel care-product-picker");
  const grid = document.createElement("div");
  grid.className = "care-product-tile-grid";
  orders.forEach((order) => {
    grid.appendChild(renderCareProductTile(order, onClick));
  });
  panel.appendChild(grid);
  return panel;
}

function renderCareTrackingCard(order) {
  const panel = appendCarePanel("care-panel care-tracking-card");

  const hero = document.createElement("div");
  hero.className = "care-tracking-hero";

  const media = document.createElement("div");
  media.className = "care-tracking-hero-media";
  if (order.image_url) {
    const image = document.createElement("img");
    image.src = order.image_url;
    image.alt = order.title;
    image.loading = "lazy";
    media.appendChild(image);
  }

  const details = document.createElement("div");
  details.className = "care-tracking-hero-details";

  const title = document.createElement("p");
  title.className = "care-product-title";
  title.textContent = order.title;

  const size = document.createElement("span");
  size.textContent = order.size ? `Size: ${order.size}` : "";

  const color = document.createElement("span");
  color.textContent = order.color ? `Color: ${order.color}` : "";

  const orderNo = document.createElement("span");
  orderNo.textContent = `Order No: ${order.orderNumber || order.orderRef || "BR20482"}`;

  const statusPill = document.createElement("span");
  statusPill.className = "care-tracking-status-pill";
  statusPill.textContent = order.statusLabel || "Shipped";

  details.append(title, size, color, orderNo, statusPill);
  hero.append(media, details);
  panel.appendChild(hero);

  const stepper = document.createElement("div");
  stepper.className = "care-stepper";
  CARE_TRACKING_STEPS.forEach((label, index) => {
    const step = document.createElement("div");
    step.className = "care-step";
    if (index < order.trackingStage) {
      step.classList.add("complete");
    }
    const dot = document.createElement("span");
    dot.className = "care-step-dot";

    const copy = document.createElement("span");
    copy.className = "care-step-copy";
    const text = document.createElement("span");
    text.className = "care-step-label";
    text.textContent = label;
    copy.appendChild(text);
    const dates = ["Feb 10, 2026 · 11:32 AM", "Feb 11, 2026 · 11:32 AM"];
    if (dates[index]) {
      const date = document.createElement("span");
      date.className = "care-step-date";
      date.textContent = dates[index];
      copy.appendChild(date);
    }

    step.append(dot, copy);
    stepper.appendChild(step);
  });
  panel.appendChild(stepper);
  return panel;
}

function renderCareSummaryCard(order, details) {
  const panel = appendCarePanel("care-panel care-summary-card");
  const card = renderCareProductCard(order, []);
  panel.appendChild(card);

  details.forEach(([labelText, valueText]) => {
    const row = document.createElement("div");
    row.className = "care-summary-row";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    row.append(label, value);
    panel.appendChild(row);
  });

  return panel;
}

function renderCareRefundSummaryCard(order, details) {
  const panel = appendCarePanel("care-panel care-summary-card care-refund-summary-card");
  const top = document.createElement("div");
  top.className = "care-refund-product-row";
  const media = document.createElement("div");
  media.className = "care-product-media";
  if (order.image_url) {
    const image = document.createElement("img");
    image.src = order.image_url;
    image.alt = order.title;
    image.loading = "lazy";
    media.appendChild(image);
  }
  const info = document.createElement("div");
  info.className = "care-product-info";
  const title = document.createElement("p");
  title.className = "care-product-title";
  title.textContent = order.title;
  const meta = document.createElement("p");
  meta.className = "care-product-meta";
  meta.textContent = `Size: ${order.size || "M"}\nColor: ${order.color}\nOrder No: ${order.orderRef || "BR20482"}`;
  info.append(title, meta);
  top.append(media, info);
  panel.appendChild(top);

  details.forEach(([labelText, valueText]) => {
    const row = document.createElement("div");
    row.className = "care-summary-row";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    row.append(label, value);
    panel.appendChild(row);
  });
  return panel;
}

function renderCareExchangeSizeCard(order, onSelect) {
  const panel = appendCarePanel("care-panel care-summary-card care-exchange-size-card");
  const top = document.createElement("div");
  top.className = "care-refund-product-row";
  const media = document.createElement("div");
  media.className = "care-product-media";
  if (order.image_url) {
    const image = document.createElement("img");
    image.src = order.image_url;
    image.alt = order.title;
    image.loading = "lazy";
    media.appendChild(image);
  }
  const info = document.createElement("div");
  info.className = "care-product-info";
  const title = document.createElement("p");
  title.className = "care-product-title";
  title.textContent = order.title;
  const meta = document.createElement("p");
  meta.className = "care-product-meta";
  meta.textContent = `Current Size: ${order.size || "M"}`;
  info.append(title, meta);
  top.append(media, info);
  panel.appendChild(top);

  const label = document.createElement("p");
  label.className = "care-size-label";
  label.textContent = "Select new size";
  panel.appendChild(label);

  const row = document.createElement("div");
  row.className = "care-size-row";
  CARE_EXCHANGE_SIZES.forEach((size) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-size-button";
    button.textContent = size;
    if (size === order.size) {
      button.classList.add("disabled");
      button.disabled = true;
    }
    button.addEventListener("click", () => {
      row.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      onSelect(size);
    });
    row.appendChild(button);
  });
  panel.appendChild(row);
  return panel;
}

function renderCareConfirmButton(label, onClick) {
  const panel = appendCarePanel("care-panel care-confirm-panel");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "care-confirm-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  panel.appendChild(button);
  return panel;
}

function renderCareDoneCard(title, lines) {
  const panel = appendCarePanel("care-panel care-done-card");
  const heading = document.createElement("p");
  heading.className = "care-panel-heading";
  heading.textContent = title;
  panel.appendChild(heading);

  lines.forEach((line) => {
    const row = document.createElement("p");
    row.className = "care-done-line";
    row.textContent = line;
    panel.appendChild(row);
  });
  return panel;
}

function showCustomerCareMenu(options = {}) {
  clearActivePromptPanels();
  clearCarePanels();
  setSupportFlowScreen("menu");

  if (!options.silent) {
    addMessage("What would you like to do today?", "bot");
  }

  const panel = appendCarePanel("care-panel care-menu-panel");
  renderCareMenuGrid(panel, CARE_MENU_ACTIONS, (action) => {
    addMessage(action.userLabel || action.label, "user");
    handleCareMenuSelection(action.flow);
  });
}

function showTrackOrderScreen(options = {}) {
  setSupportFlowScreen("track");

  if (!options.silent) {
    addMessage("Which order would you like to track?", "bot");
  }

  void renderCareShopifyProductPicker((selected) => {
    showTrackOrderDetail(selected);
  });
}

function showTrackOrderDetail(order) {
  setSupportFlowScreen("track_detail", { order });

  addMessage("Below is your order status", "bot");
  renderCareTrackingCard(order);
}

function showFaqCategoryScreen(options = {}) {
  setSupportFlowScreen("faq_categories");

  if (!options.silent) {
    addMessage("What do you need help with?", "bot");
  }

  const panel = appendCarePanel("care-panel");
  renderCareChipRow(panel, CARE_FAQ_CATEGORIES, (value) => {
    const category = CARE_FAQ_CATEGORIES.find((item) => item.id === value);
    if (!category) {
      return;
    }
    addMessage(category.label, "user");
    showFaqQuestionsScreen(category);
  });
}

function showFaqQuestionsScreen(category) {
  setSupportFlowScreen("faq_questions", { categoryId: category.id });

  addMessage(`Here are some common ${category.label.toLowerCase()} questions.`, "bot");

  const panel = appendCarePanel("care-panel care-faq-list");
  category.questions.forEach((question) => {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "care-faq-link";
    link.textContent = `•  ${question}`;
    link.addEventListener("click", () => {
      addMessage(question, "user");
      void sendTextChat(question, { skipUserEcho: true });
    });
    panel.appendChild(link);
  });
}

async function loadFaqLibrary() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/support/faqs`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : null;
  } catch (error) {
    return null;
  }
}

function showAgentTopicScreen(options = {}) {
  setSupportFlowScreen("agent_topics");

  if (!options.silent) {
    addMessage("What is this regarding?", "bot");
  }

  const panel = appendCarePanel("care-panel");
  renderCareChipRow(panel, CARE_AGENT_TOPICS, (value) => {
    addMessage(value, "user");
    showAgentConnectingScreen(value);
  });
}

function showAgentConnectingScreen(topic) {
  setSupportFlowScreen("agent_connecting", { topic });

  addMessage("Connecting you to an agent...", "bot");
  window.setTimeout(() => {
    const joined = document.createElement("p");
    joined.className = "care-agent-joined";
    joined.textContent = "Sara has joined the chat";
    chatLog.appendChild(joined);
    addMessage("Hi, how may I help you?", "bot");
    const agentRow = chatLog.querySelector(".message-row.bot:last-of-type");
    if (agentRow) agentRow.classList.add("live-agent-message");
    const panel = appendCarePanel("care-panel care-connecting-panel");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-confirm-btn secondary";
    button.textContent = "End chat";
    button.addEventListener("click", () => {
      addMessage("End chat", "user");
      showCustomerCareMenu();
    });
    panel.appendChild(button);
  }, 450);
}

function showReturnItemScreen(options = {}) {
  setSupportFlowScreen("return_items");

  if (!options.silent) {
    addMessage("What would you like to return?", "bot");
  }

  void renderCareShopifyProductPicker((selected) => {
    startReturnFlow(selected, "return");
  });
}

function startReturnFlow(order, intent) {
  setSupportFlowScreen("return_reason", { order, intent });

  addMessage(
    intent === "exchange" ? "What is the reason for this exchange?" : "What is the reason for this return?",
    "bot"
  );

  const panel = appendCarePanel("care-panel");
  renderCareChipRow(panel, CARE_RETURN_REASONS, (reason) => {
    addMessage(reason, "user");
    showReturnActionScreen(order, intent, reason);
  });
}

function showReturnActionScreen(order, intent, reason) {
  setSupportFlowScreen("return_action", { order, intent, reason });

  addMessage("Would you like to exchange for a larger size or get a refund?", "bot");

  const panel = appendCarePanel("care-panel care-action-choice");
  const row = document.createElement("div");
  row.className = "care-action-choice-row";

  [
    { label: "Exchange", description: "Get another size" },
    { label: "Return", description: "Money back" },
  ].forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "care-action-btn care-action-card" + (action.label === "Return" ? " primary" : "");
    const label = document.createElement("strong");
    label.textContent = action.label;
    const description = document.createElement("span");
    description.textContent = action.description;
    button.append(label, description);
    button.addEventListener("click", () => {
      addMessage(action.label, "user");
      if (action.label === "Exchange") {
        showExchangeSizeScreen(order, reason);
        return;
      }
      showReturnConfirmScreen(order, "refund", reason);
    });
    row.appendChild(button);
  });

  panel.appendChild(row);
}

function showExchangeSizeScreen(order, reason) {
  setSupportFlowScreen("return_size", { order, reason });

  addMessage("Which size would you like instead?", "bot");
  renderCareExchangeSizeCard(order, (size) => {
    addMessage(`Size ${size}`, "user");
    showReturnConfirmScreen({ ...order, exchangeSize: size }, "exchange", reason);
  });
}

function showReturnConfirmScreen(order, resolution, reason) {
  setSupportFlowScreen("return_confirm", { order, resolution, reason });

  if (resolution === "exchange") {
    renderCareRefundSummaryCard(order, [
      ["Item", order.title],
      ["New size", order.exchangeSize || "L"],
      ["Dispatched in", "2-3 days after drop"],
    ]);
  } else {
    addMessage("We're sorry about that. Here's your refund summary:", "bot");
    renderCareRefundSummaryCard(order, [
      ["Refund amount", formatOutfitTotalPrice(order.price)],
      ["Returns to", "Original card"],
      ["Timeline", "3-5 business days"],
    ]);
  }

  renderCareConfirmButton(
    resolution === "exchange" ? "Confirm exchange" : "Confirm refund",
    () => {
      completeReturnFlow(order, resolution);
    }
  );
}

function completeReturnFlow(order, resolution) {
  setSupportFlowScreen("return_done", { order, resolution });

  const title = resolution === "exchange" ? "Your exchange has been initiated!" : "Your refund has been initiated!";
  const confirmation =
    resolution === "exchange" ? "Exchange confirmed" : "Refund confirmed";

  addMessage(title, "bot");
  renderCareDoneCard(confirmation, [
    "Drop off your item at any store within 7 days.",
    resolution === "exchange" ? `Item: ${order.title}` : `Refund amount: ${formatOutfitTotalPrice(order.price)}`,
    resolution === "exchange" ? `New size: ${order.exchangeSize || order.size}` : "Returns to: Original card",
    resolution === "exchange" ? "Dispatched in: 2-3 days after drop" : "Timeline: 3-5 business days",
  ]);

  const prompt =
    resolution === "exchange"
      ? `I want to exchange ${order.title} for size ${order.exchangeSize || order.size}`
      : `I need a refund for ${order.title}`;

  void sendTextChat(prompt, {
    displayText: resolution === "exchange" ? "Confirm exchange" : "Confirm return",
    skipUserEcho: true,
  });
}

function handleCareMenuSelection(flow) {
  if (flow === "track") {
    showTrackOrderScreen();
    return;
  }
  if (flow === "faq") {
    showFaqCategoryScreen();
    return;
  }
  if (flow === "agent") {
    showAgentTopicScreen();
    return;
  }
  if (flow === "shipping") {
    const shippingCategory = CARE_FAQ_CATEGORIES.find((category) => category.id === "shipping");
    if (shippingCategory) {
      showFaqQuestionsScreen(shippingCategory);
    }
    return;
  }
  if (flow === "ticket") {
    clearCarePanels();
    setSupportFlowScreen("agent_topics");
    addMessage("Tell me briefly what happened and I’ll create a support ticket.", "bot");
    addInlineLinkInput("Describe your issue", (details) => {
      addMessage(details, "user");
      addMessage("Your support ticket has been raised. Our team will follow up shortly.", "bot");
    }, "text");
    return;
  }
  if (flow === "return") {
    showReturnItemScreen();
  }
}

function handleSupportBackNavigation() {
  if (activeMode !== "support" || !supportFlowContext) {
    returnToChatHome();
    return;
  }

  const { screen } = supportFlowContext;

  if (screen === "menu") {
    resetSupportFlowContext();
    returnToChatHome();
    return;
  }

  if (screen === "track_detail") {
    showTrackOrderScreen({ silent: true });
    return;
  }
  if (screen === "faq_questions") {
    showFaqCategoryScreen({ silent: true });
    return;
  }
  if (screen === "agent_connecting") {
    showAgentTopicScreen({ silent: true });
    return;
  }
  if (["return_reason", "return_action", "return_size", "return_confirm", "return_done"].includes(screen)) {
    showReturnItemScreen({ silent: true });
    return;
  }

  showCustomerCareMenu({ silent: true });
}

function getOutfitOnboardingSequence() {
  return [
    {
      key: "occasion",
      prompt: "Great! What's the occasion for today?",
      options: ["Work/office", "Date night", "Casual", "Party/event", "Other"],
      variant: "chips",
    },
    {
      key: "vibe_method",
      prompt: "What vibe are you going for?",
      options: [
        { label: "Paste pinterest board", value: "pinterest" },
        { label: "Upload screenshots", value: "upload" },
        { label: "Choose from presets", value: "presets" },
      ],
      variant: "stacked",
    },
    {
      key: "location",
      prompt: "Nice! Where will you be wearing this outfit?",
      options: ["Paris", "London", "New York", "Other"],
      variant: "chips",
    },
    {
      key: "weather",
      prompt: "What kind of weather do you expect there?",
      options: ["Hot", "Warm", "Mild", "Cold", "Rainy"],
      variant: "chips",
    },
    {
      key: "decision_mode",
      prompt: "Do you want options, or should I pick the best one for you?",
      options: [
        { label: "Show me options", value: "options" },
        { label: "Pick the best one", value: "pick_best" },
      ],
      variant: "chips",
    },
  ];
}

const OUTFIT_BUILDER_FIELDS = [
  {
    key: "segment",
    label: "Who is this outfit for?",
    options: profileOptions.segment,
  },
  {
    key: "occasion",
    label: "Choose your occasion",
    options: profileOptions.occasion,
  },
  {
    key: "feel",
    label: "Choose your style",
    options: profileOptions.feel,
  },
  {
    key: "location",
    label: "Where are you going?",
    options: profileOptions.location,
  },
  {
    key: "budget",
    label: "Budget",
    options: profileOptions.budget,
  },
];

function setProfileDraftValue(key, value) {
  if (!key) {
    return;
  }
  shopperProfileDraft[key] = value;
}

function showOutfitBuilderScreen() {
  clearActivePromptPanels();
  if (!shopperProfileDraft.segment && shopperOnboardingData.gender) {
    shopperProfileDraft.segment = getOnboardingGender();
  }
  const panel = document.createElement("section");
  panel.className = "outfit-builder-panel figma-card-screen";

  const heading = document.createElement("p");
  heading.className = "outfit-builder-heading";
  heading.textContent = "Create a full outfit";

  const subcopy = document.createElement("p");
  subcopy.className = "outfit-builder-copy";
  subcopy.textContent = "Pick the basics and I’ll build the strongest complete look from the store catalog.";

  panel.append(heading, subcopy);

  OUTFIT_BUILDER_FIELDS.forEach((field) => {
    const group = document.createElement("div");
    group.className = "outfit-builder-group";
    group.dataset.fieldKey = field.key;

    const label = document.createElement("p");
    label.className = "outfit-builder-label";
    label.textContent = field.label;

    const row = document.createElement("div");
    row.className = "outfit-builder-chip-row";

    field.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outfit-builder-chip";
      button.textContent = option;
      if (shopperProfileDraft[field.key] === option) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => {
        setProfileDraftValue(field.key, option);
        row.querySelectorAll(".outfit-builder-chip").forEach((node) => {
          node.classList.toggle("active", node === button);
        });
      });
      row.appendChild(button);
    });

    group.append(label, row);
    panel.appendChild(group);
  });

  const notesField = document.createElement("label");
  notesField.className = "outfit-builder-notes";
  notesField.textContent = "Anything specific?";
  const notesInput = document.createElement("input");
  notesInput.className = "outfit-builder-input";
  notesInput.type = "text";
  notesInput.placeholder = "Color, fit, no heels, modest, travel friendly...";
  notesInput.value = shopperProfileDraft.fit_preference || "";
  notesInput.addEventListener("input", () => {
    shopperProfileDraft.fit_preference = notesInput.value.trim();
  });
  notesField.appendChild(notesInput);
  panel.appendChild(notesField);

  const validationText = document.createElement("p");
  validationText.className = "outfit-builder-error hidden";
  validationText.textContent = "Choose at least one occasion, style, place, or budget so I can build a useful outfit.";
  panel.appendChild(validationText);

  const decisionRow = document.createElement("div");
  decisionRow.className = "outfit-builder-decision";
  const optionsButton = document.createElement("button");
  optionsButton.type = "button";
  optionsButton.className = "outfit-builder-decision-btn active";
  optionsButton.textContent = "Show options";
  const pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "outfit-builder-decision-btn";
  pickButton.textContent = "Pick best";
  decisionRow.append(optionsButton, pickButton);
  panel.appendChild(decisionRow);

  let decisionMode = false;
  [optionsButton, pickButton].forEach((button) => {
    button.addEventListener("click", () => {
      decisionMode = button === pickButton;
      optionsButton.classList.toggle("active", !decisionMode);
      pickButton.classList.toggle("active", decisionMode);
    });
  });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "outfit-builder-submit";
  submit.textContent = "Create outfit";
  submit.addEventListener("click", () => {
    const profileInputs = buildProfileInputsPayload();
    if (!profileInputs || (!profileInputs.occasion && !profileInputs.feel && !profileInputs.location && !profileInputs.budget)) {
      validationText.classList.remove("hidden");
      const firstOccasion = panel.querySelector('[data-field-key="occasion"] .outfit-builder-chip');
      if (firstOccasion) {
        firstOccasion.focus();
      }
      return;
    }
    validationText.classList.add("hidden");
    const prompt = buildProfileNarrative(profileInputs, "outfit") || "Create a full outfit for me.";
    panel.remove();
    void sendTextChat(prompt, {
      profileInputs,
      displayText: buildDisplaySummary(profileInputs) || "Create full outfit",
      skipDecisionPrompt: true,
      decisionMode,
    });
  });
  panel.appendChild(submit);

  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function getCompleteLookStartActions() {
  return [
    { label: "Take photo", action: "camera", icon: "camera" },
    { label: "Upload photo", action: "upload", icon: "upload" },
    { label: "Paste link", action: "shop_link", icon: "link" },
    { label: "Past Purchases", action: "past_purchases", icon: "shop" },
  ];
}

function getInspireImageActionSuggestions() {
  return [
    { label: "Paste pinterest board", action: "shop_link", icon: "link" },
    { label: "Upload screenshots", action: "upload", icon: "upload" },
    { label: "Choose from presets", action: "presets", icon: "history" },
  ];
}

function showCompleteLookStartScreen() {
  addSuggestionChips(
    getCompleteLookStartActions(),
    (option) => handleImageActionSelection(option),
    "complete-start-grid"
  );
}

async function renderCompleteDemoAnchorMessage(anchor = null) {
  if (!anchor) {
    const catalog = await fetchCatalogProducts(250);
    const selected = selectDiverseCollageProducts(catalog, 1)[0];
    anchor = selected ? mapCatalogProductToRecommendation(selected) : null;
  }
  if (!anchor) return;
  const panel = document.createElement("section");
  panel.className = "complete-anchor-panel figma-card-screen";
  const media = document.createElement("div");
  media.className = "complete-anchor-media";
  media.appendChild(buildImageTile(anchor));
  panel.appendChild(media);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderCompleteUploadPanel() {
  addMessage("Drop your photo below", "bot");
  const panel = document.createElement("section");
  panel.className = "complete-upload-panel figma-card-screen";
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "complete-upload-zone";
  upload.innerHTML = `${ACTION_ICONS.upload}<span>Tap to upload image</span>`;
  upload.addEventListener("click", () => {
    launchImagePicker("upload");
  });
  panel.appendChild(upload);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderCompleteLinkPanel() {
  addMessage("Please paste your product link", "bot");
  const panel = document.createElement("section");
  panel.className = "complete-link-panel figma-card-screen";
  const form = document.createElement("form");
  form.className = "complete-link-form";
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "Link";
  input.required = true;
  input.value = "";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "↑";
  form.append(input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) {
      input.focus();
      return;
    }
    addMessage(url, "user");
    renderCompleteDemoAnchorMessage();
    renderCompleteDemoFindFlow();
  });
  panel.appendChild(form);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

async function renderCompletePastPurchasesPanel() {
  addMessage("Pick an item and I'll complete the look!", "bot");
  const panel = document.createElement("section");
  panel.className = "complete-purchases-panel figma-card-screen";
  const catalog = await fetchCatalogProducts(250);
  const purchases = selectDiverseCollageProducts(catalog.filter(isUsableShopifyProduct), 3).map((product) => {
    const variant = (product.variants || []).find((item) => item.available_for_sale !== false) || (product.variants || [])[0] || null;
    const selectedOptions = variant && Array.isArray(variant.selected_options) ? variant.selected_options : [];
    const optionValue = (name) => {
      const match = selectedOptions.find((option) => String(option.name || "").toLowerCase() === name);
      return match ? match.value : "";
    };
    const size = optionValue("size") || (product.size_options || [])[0] || "";
    const color = optionValue("color");
    return {
      ...mapCatalogProductToRecommendation(product),
      size,
      color,
      meta: [size ? `Size: ${size}` : "", color ? `Color: ${color}` : ""].filter(Boolean),
    };
  });
  purchases.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "complete-purchase-row";
    const image = document.createElement("img");
    image.src = item.image_url;
    image.alt = item.title;
    image.loading = "lazy";
    const copy = document.createElement("div");
    copy.className = "complete-purchase-copy";
    const name = document.createElement("strong");
    name.textContent = item.title;
    copy.appendChild(name);
    item.meta.forEach((line) => {
      const meta = document.createElement("span");
      meta.textContent = line;
      copy.appendChild(meta);
    });
    const plus = document.createElement("span");
    plus.className = "complete-purchase-plus";
    plus.textContent = "+";
    row.append(image, copy, plus);
    row.addEventListener("click", () => {
      addMessage(item.title, "user");
      renderCompleteDemoFindFlow(item);
    });
    panel.appendChild(row);
  });
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderCompleteDemoFindFlow(anchor = null) {
  addMessage("Cute top! What would you like me to find for you?", "bot");
  const options = ["Pants", "Shoes", "Jackets", "Jewellery", "Full outfit"];
  const selected = new Set();
  const panel = document.createElement("section");
  panel.className = "suggestion-strip complete-find-chips complete-multi-select figma-card-screen";
  const row = document.createElement("div");
  row.className = "suggestion-row";
  let selectionTimer = null;
  const continueWithSelections = () => {
    const choices = Array.from(selected);
    if (!choices.length || !panel.isConnected) return;
    addMessage(choices.join(", "), "user");
    panel.remove();
    addMessage("Here's what I found!", "bot");
    void renderCompleteDemoResults(choices);
  };

  options.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (label === "Full outfit") {
        if (selectionTimer) window.clearTimeout(selectionTimer);
        selected.clear();
        row.querySelectorAll(".suggestion-chip").forEach((chip) => chip.classList.remove("is-selected"));
        button.classList.add("is-selected");
        addMessage("Full outfit", "user");
        panel.remove();
        void renderCreateFullOutfitResult(buildProfileInputsPayload(), { hideNewOutfits: true });
        return;
      }
      const fullOutfit = Array.from(row.querySelectorAll(".suggestion-chip")).find((chip) => chip.textContent === "Full outfit");
      if (fullOutfit) fullOutfit.classList.remove("is-selected");
      if (selected.has(label)) {
        selected.delete(label);
        button.classList.remove("is-selected");
      } else if (selected.size < 4) {
        selected.add(label);
        button.classList.add("is-selected");
      }
      if (selectionTimer) window.clearTimeout(selectionTimer);
      if (selected.size) {
        selectionTimer = window.setTimeout(continueWithSelections, 1200);
      }
    });
    row.appendChild(button);
  });
  panel.appendChild(row);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

async function renderCompleteDemoResults(selectedCategories = []) {
  const existing = chatLog.querySelector(".complete-results-panel");
  if (existing) {
    existing.remove();
  }
  const panel = document.createElement("section");
  panel.className = "complete-results-panel figma-card-screen";
  const catalog = await fetchCatalogProducts(250);
  const categoryGroups = [
    { title: "Pants", pattern: /trouser|pant|jean|skirt|short/i },
    { title: "Shoes", pattern: /shoe|heel|boot|sandal|sneaker|loafer/i },
    { title: "Jackets", pattern: /jacket|blazer|coat|cardigan|sweater|vest/i },
    { title: "Jewellery", pattern: /\b(?:jewel(?:lery|ry)?|necklaces?|earrings?|bracelets?|watches?|accessor(?:y|ies)|belts?|chains?|rings?)\b/i },
    { title: "Full outfits", pattern: /dress|jumpsuit|outfit|set/i },
  ];
  const requested = new Set(selectedCategories);
  const visibleProducts = [];
  const groups = categoryGroups
    .filter((group) => group.title === "Full outfits" || !requested.size || requested.has(group.title))
    .map((group) => ({
    title: group.title,
    products: catalog
      .filter((product) => isUsableShopifyProduct(product) && group.pattern.test(`${product.category || ""} ${product.title || ""}`))
      .map((product) => mapCatalogProductToRecommendation(product)),
    })).filter((group) => group.products.length);
  groups.forEach((group) => {
    const heading = document.createElement("p");
    heading.className = "complete-results-heading";
    heading.textContent = group.title;
    const grid = document.createElement("div");
    grid.className = "complete-results-grid";
    if (group.title === "Full outfits") {
      const mappedCatalog = catalog
        .filter(isUsableShopifyProduct)
        .map((product) => mapCatalogProductToRecommendation(product));
      const collageLooks = buildShopifyCollageAlternatives(mappedCatalog, 3).slice(0, 3);
      collageLooks.forEach((look, index) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "complete-result-card complete-outfit-collage-card";
        card.appendChild(buildShopifyCutoutCollageVisual(look));
        const name = document.createElement("strong");
        name.textContent = ["Soft edit", "Casual edit", "Weekend edit"][index] || `Outfit ${index + 1}`;
        const total = look.reduce((sum, product) => sum + (Number(product.price) || 0), 0);
        const price = document.createElement("span");
        price.textContent = formatOutfitTotalPrice(total);
        card.append(name, price);
        card.addEventListener("click", () => {
          addMessage(name.textContent, "user");
          void renderCreateFullOutfitResult(buildProfileInputsPayload(), { hideNewOutfits: true });
        });
        grid.appendChild(card);
      });
      panel.append(heading, grid);
      return;
    }
    group.products.forEach((product) => {
      visibleProducts.push(product);
      const card = document.createElement("article");
      card.className = "complete-result-card";
      const media = document.createElement("div");
      media.className = "complete-result-media";
      media.appendChild(buildImageTile(product));
      const name = document.createElement("strong");
      name.textContent = product.title;
      const price = document.createElement("span");
      price.textContent = formatOutfitTotalPrice(product.price);
      card.append(media, name, price);
      grid.appendChild(card);
    });
    panel.append(heading, grid);
  });
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function startGetInspiredDemoFlow() {
  startInspireConversation();
}

function renderGetInspiredSourceChoice() {
  addSuggestionChips(
    [
      {
        label: "I Have Inspiration",
        description: "You've got a Pinterest board, photos, or a specific vibe in mind. I'll help you recreate it!",
        action: "own",
      },
      {
        label: "Inspire me",
        description: "No idea what you want? I'll curate looks based on your style, trending items, and hidden gems.",
        action: "browse",
      },
    ],
    (option) => {
      addMessage(option.label, "user");
      clearActivePromptPanels();
      if (option.action === "own") {
        addMessage("Please choose your option", "bot");
        renderGetInspiredUploadPanel();
        return;
      }
      renderGetInspiredIdeaGrid();
    },
    "inspire-choice"
  );
}

function renderGetInspiredUploadPanel() {
  const panel = document.createElement("section");
  panel.className = "inspire-upload-panel figma-card-screen";

  const pinterestLabel = document.createElement("p");
  pinterestLabel.className = "inspire-upload-label";
  pinterestLabel.textContent = "Pinterest";
  const pinterestHint = document.createElement("p");
  pinterestHint.className = "inspire-upload-hint";
  pinterestHint.textContent = "Share your Pinterest board to analyze";
  const input = document.createElement("input");
  input.className = "inspire-upload-input";
  input.type = "text";
  input.placeholder = "Name";

  const uploadLabel = document.createElement("p");
  uploadLabel.className = "inspire-upload-label";
  uploadLabel.textContent = "Upload your style";
  const uploadHint = document.createElement("p");
  uploadHint.className = "inspire-upload-hint";
  uploadHint.textContent = "Upload photos of the outfit you love!";

  const zone = document.createElement("button");
  zone.type = "button";
  zone.className = "inspire-upload-dropzone";
  zone.innerHTML = `${ACTION_ICONS.upload}<span>Tap to upload images<br>(10 max)</span>`;
  zone.addEventListener("click", () => {
    inspireFlowContext = { ...(inspireFlowContext || {}), path: "own" };
    launchImagePicker("upload");
  });

  const analyze = document.createElement("button");
  analyze.type = "button";
  analyze.className = "inspire-analyze-button";
  analyze.textContent = "Analyze";
  analyze.addEventListener("click", () => {
    void handleInspireAnalyze();
  });

  panel.append(pinterestLabel, pinterestHint, input, uploadLabel, uploadHint, zone, analyze);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderGetInspiredLoadingThenIdeas() {
  clearActivePromptPanels();
  const typingState = showTypingState("inspire");
  window.setTimeout(() => {
    removeTypingState(typingState);
    renderGetInspiredIdeaGrid();
  }, 650);
}

function renderGetInspiredLoadingThenOutfit(heroProduct = null) {
  clearActivePromptPanels();
  const typingState = showTypingState("inspire");
  window.setTimeout(() => {
    removeTypingState(typingState);
    renderGetInspiredOutfitResult(heroProduct);
  }, 650);
}

function renderGetInspiredIdeaGrid() {
  clearActivePromptPanels();
  addMessage("Here are some ideas! Feel free to select what you like!", "bot");
  const panel = document.createElement("section");
  panel.className = "inspire-demo-grid-panel figma-card-screen";
  INSPIRE_STYLE_CATEGORIES.forEach(({ label: title, lookCount }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inspire-demo-grid-card";
    button.innerHTML = `<strong>${title}</strong><span>${lookCount} looks</span>`;
    button.addEventListener("click", () => {
      clearActivePromptPanels();
      void showShopifyProductsForInspireCategory(title);
    });
    panel.appendChild(button);
  });
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function stableCategoryVariation(value) {
  let hash = 0;
  for (const character of String(value || "")) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  return hash % 17;
}

function getInspireCategoryProductScore(product, categoryLabel) {
  const category = String(categoryLabel || "").toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  const searchable = `${product.title || ""} ${product.category || ""} ${tags} ${product.handle || ""}`.toLowerCase();
  const price = Number(product.price);
  const profileTerms = [shopperProfileDraft.feel, shopperProfileDraft.segment, shopperProfileDraft.priority]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/\s+|&/))
    .filter((value) => value.length > 2);
  const variation = stableCategoryVariation(`${category}|${product.id || product.shopify_product_id || searchable}`);

  if (category.includes("under")) return Number.isFinite(price) && price <= 50 ? 100 - price + variation : -1;
  if (category.includes("new arrival")) return (/new|arrival|latest|recent/.test(searchable) ? 80 : 10) + variation;
  if (category.includes("seasonal")) return (/summer|winter|spring|autumn|fall|season|holiday|resort/.test(searchable) ? 80 : 8) + variation;
  if (category.includes("trending")) return (/trend|popular|best.?seller|viral|featured/.test(searchable) ? 80 : 12) + variation;
  if (category.includes("occasion")) return (/party|evening|wedding|office|work|date|formal|cocktail/.test(searchable) ? 80 : 9) + variation;
  if (category.includes("street")) return (/street|denim|cargo|sneaker|hoodie|oversize|urban/.test(searchable) ? 80 : 9) + variation;
  if (category.includes("my style")) {
    const matches = profileTerms.filter((term) => searchable.includes(term)).length;
    return (matches ? 60 + matches * 10 : 7) + variation;
  }
  return 1 + variation;
}

async function showShopifyProductsForInspireCategory(categoryLabel) {
  addMessage(categoryLabel, "user");
  const typingState = showTypingState("inspire");
  const catalog = await fetchCatalogProducts(250);

  const ranked = (catalog || [])
    .filter(isUsableShopifyProduct)
    .map((product) => ({ product, score: getInspireCategoryProductScore(product, categoryLabel) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.product);

  if (!ranked.length) {
    removeTypingState(typingState);
    addMessage(`No available Shopify products match ${categoryLabel.toLowerCase()} right now.`, "bot");
    return;
  }

  const heroProduct = mapCatalogProductToRecommendation(ranked[0], {
    reason: `Best Shopify match for ${categoryLabel.toLowerCase()}.`,
  });
  shopperProfileDraft.feel = categoryLabel;
  inspireFlowContext = {
    ...(inspireFlowContext || {}),
    styleCategory: categoryLabel,
    heroProduct,
  };
  window.setTimeout(() => {
    removeTypingState(typingState);
    renderGetInspiredOutfitResult(heroProduct);
  }, 450);
}

function renderGetInspiredOutfitResult(heroProduct = null) {
  renderCreateFullOutfitResult(buildProfileInputsPayload(), {
    mode: backendModes.inspire,
    uiMode: "inspire",
    headerMode: "inspire",
    contextNote: "Get inspired demo",
    heroProduct,
  });
}

function resetInspireFlowContext() {
  inspireFlowContext = null;
}

function startInspireConversation() {
  shopperProfileDraft = createEmptyProfileDraft();
  pendingStylingFollowUpField = null;
  homeViewActive = false;
  inspireFlowContext = { path: null, styleCategory: null, pinterestUrl: "" };
  setMode("inspire");
  resetGuidedFlow();
  clearActivePromptPanels();
  syncWidgetHeader("inspire");
  addMessage(
    "Do you already have your own inspiration or would you like me to show you some inspiration?",
    "bot"
  );
  showInspireSourceChoice();
}

function showInspireSourceChoice() {
  addSuggestionChips(
    [
      {
        label: "I Have Inspiration",
        description: "You've got a Pinterest board, photos, or a specific vibe in mind. I'll help you recreate it!",
        action: "inspire_own",
      },
      {
        label: "Inspire me",
        description: "No idea what you want? I'll curate looks based on your style, trending items, and hidden gems.",
        action: "inspire_browse",
      },
    ],
    (option) => {
      addMessage(option.label, "user");
      clearActivePromptPanels();
      if (option.action === "inspire_own") {
        inspireFlowContext = { ...(inspireFlowContext || {}), path: "own", styleCategory: null, pinterestUrl: "" };
        addMessage("Please choose your option", "bot");
        showInspireUploadPanel();
        return;
      }
      inspireFlowContext = { ...(inspireFlowContext || {}), path: "browse", styleCategory: null, pinterestUrl: "" };
      renderGetInspiredLoadingThenIdeas();
    },
    "inspire-choice"
  );
}

function showInspireUploadPanel() {
  const panel = document.createElement("section");
  panel.className = "inspire-upload-panel figma-card-screen";
  panel.dataset.inspirePanel = "upload";

  const pinterestGroup = document.createElement("div");
  pinterestGroup.className = "inspire-upload-group";

  const pinterestLabel = document.createElement("label");
  pinterestLabel.className = "inspire-upload-label";
  pinterestLabel.textContent = "Pinterest";
  pinterestLabel.setAttribute("for", "inspirePinterestInput");

  const pinterestHint = document.createElement("p");
  pinterestHint.className = "inspire-upload-hint";
  pinterestHint.textContent = "Share your Pinterest board to analyze";

  const pinterestInput = document.createElement("input");
  pinterestInput.id = "inspirePinterestInput";
  pinterestInput.className = "inspire-upload-input";
  pinterestInput.type = "url";
  pinterestInput.placeholder = "Name";
  pinterestInput.autocomplete = "off";
  pinterestInput.addEventListener("input", () => {
    if (inspireFlowContext) {
      inspireFlowContext.pinterestUrl = pinterestInput.value.trim();
    }
    imageUrlInput.value = pinterestInput.value.trim();
  });

  pinterestGroup.append(pinterestLabel, pinterestHint, pinterestInput);

  const uploadGroup = document.createElement("div");
  uploadGroup.className = "inspire-upload-group";

  const uploadLabel = document.createElement("p");
  uploadLabel.className = "inspire-upload-label";
  uploadLabel.textContent = "Upload your style";

  const uploadHint = document.createElement("p");
  uploadHint.className = "inspire-upload-hint";
  uploadHint.textContent = "Upload photos of the outfit you love!";

  const dropzone = document.createElement("button");
  dropzone.type = "button";
  dropzone.className = "inspire-upload-dropzone";
  dropzone.setAttribute("aria-label", "Upload your style image");

  const dropzoneIcon = document.createElement("span");
  dropzoneIcon.className = "inspire-upload-dropzone-icon";
  dropzoneIcon.innerHTML = ACTION_ICONS.upload;

  const dropzoneText = document.createElement("span");
  dropzoneText.className = "inspire-upload-dropzone-text";
  dropzoneText.innerHTML = "Tap to upload images<br>(10 max)";

  const preview = document.createElement("img");
  preview.className = "inspire-upload-preview hidden";
  preview.alt = "Uploaded inspiration preview";

  dropzone.append(dropzoneIcon, dropzoneText, preview);
  dropzone.addEventListener("click", () => {
    launchImagePicker("upload");
  });

  uploadGroup.append(uploadLabel, uploadHint, dropzone);

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "inspire-analyze-button";
  analyzeButton.textContent = "Analyze";
  analyzeButton.addEventListener("click", () => {
    void handleInspireAnalyze();
  });

  panel.append(pinterestGroup, uploadGroup, analyzeButton);
  chatLog.appendChild(panel);
  scrollChatToBottom();

  panel._inspirePreview = preview;
  panel._inspireDropzoneText = dropzoneText;
  panel._inspireDropzoneIcon = dropzoneIcon;
}

function updateInspireUploadPreview(previewUrl, label = "Uploaded style") {
  const panel = chatLog.querySelector('[data-inspire-panel="upload"]');
  if (!panel || !previewUrl) {
    return;
  }

  const preview = panel._inspirePreview;
  const dropzoneText = panel._inspireDropzoneText;
  const dropzoneIcon = panel._inspireDropzoneIcon;
  if (preview) {
    preview.src = previewUrl;
    preview.classList.remove("hidden");
  }
  if (dropzoneText) {
    dropzoneText.textContent = label;
  }
  if (dropzoneIcon) {
    dropzoneIcon.classList.add("hidden");
  }
}

function addInspireLoadingPanel() {
  const panel = document.createElement("section");
  panel.className = "inspire-loading-panel figma-card-screen";
  panel.dataset.inspirePanel = "loading";

  const spinner = document.createElement("div");
  spinner.className = "inspire-loading-spinner";
  spinner.setAttribute("aria-hidden", "true");

  panel.appendChild(spinner);
  chatLog.appendChild(panel);
  scrollChatToBottom();
  return panel;
}

async function showInspireStyleGrid() {
  const products = (await fetchCatalogProducts(24)).filter(isUsableShopifyProduct).slice(0, 12);

  if (products.length) {
    addMessage("Choose a product from your Shopify catalog and I’ll build the look around it.", "bot");
    addSuggestionChips(
      products.map((product) => mapCatalogProductToInspireOption(product)),
      (option) => {
        void handleInspireStyleSelection(option);
      },
      "inspire-style-image-grid"
    );
    return;
  }

  if (!isDemoMode()) {
    addMessage(
      "Your Shopify catalog is not synced yet. Ask the store admin to connect Shopify and run catalog sync.",
      "bot"
    );
    return;
  }

  addMessage("Here are some demo styles. Sync Shopify to replace these with real products.", "bot");
  addSuggestionChips(
    INSPIRE_STYLE_CATEGORIES.map((item) => ({ ...item, action: "inspire_style" })),
    (option) => {
      void handleInspireStyleSelection(option);
    },
    "inspire-style-image-grid"
  );
}

async function fetchInspireImageAnalysis() {
  const pinterestUrl =
    (inspireFlowContext && inspireFlowContext.pinterestUrl) || imageUrlInput.value.trim();
  const selectedFile = getSelectedImageFile();
  if (!pinterestUrl && !selectedFile) {
    return null;
  }

  const imageReferenceLabel = selectedFile ? selectedFile.name : pinterestUrl;
  const imageContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
  const profileInputs = buildProfileInputsPayload();
  const response = await fetch(`${apiBaseUrl}/api/inspire`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_name: selectedFile ? selectedFile.name : imageReferenceLabel,
      image_url: pinterestUrl || null,
      image_content_base64: imageContentBase64,
      image_mime_type: selectedFile ? selectedFile.type || null : null,
      message:
        "Analyze this inspiration image. Describe the style direction, palette, and key garments without recommending products yet.",
      customer_id: customerId,
      profile_inputs: profileInputs,
    }),
  });

  if (!response.ok) {
    throw imageRequestError(response, "Inspiration analysis");
  }

  return response.json();
}

function renderInspireStyleAnalysis(summary = "", heroProduct = null) {
  clearActivePromptPanels();
  if (widgetWelcomeTitle) widgetWelcomeTitle.textContent = "Style analysis";
  addMessage("Here’s what I learned about you", "bot");

  const panel = document.createElement("section");
  panel.className = "inspire-style-analysis figma-card-screen";
  const title = document.createElement("strong");
  title.textContent = "Yay! Your Style DNA:";
  const copy = document.createElement("p");
  copy.textContent = summary || "Soft touches, balanced colors, clean silhouettes, and an effortless, elegant vibe.";
  const question = document.createElement("p");
  question.className = "inspire-style-analysis-question";
  question.textContent = "Does that sound right?";
  const actions = document.createElement("div");
  actions.className = "inspire-style-analysis-actions";

  const perfect = document.createElement("button");
  perfect.type = "button";
  perfect.className = "inspire-style-analysis-button primary";
  perfect.textContent = "Perfect!";
  perfect.addEventListener("click", () => {
    addMessage("Perfect!", "user");
    panel.remove();
    syncWidgetHeader("inspire");
    renderGetInspiredLoadingThenOutfit(heroProduct);
  });

  const adjust = document.createElement("button");
  adjust.type = "button";
  adjust.className = "inspire-style-analysis-button";
  adjust.textContent = "Adjust it";
  adjust.addEventListener("click", () => {
    addMessage("Adjust it", "user");
    panel.remove();
    syncWidgetHeader("inspire");
    addMessage("Please choose your option", "bot");
    showInspireUploadPanel();
  });

  actions.append(perfect, adjust);
  panel.append(title, copy, question, actions);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

async function handleInspireAnalyze() {
  const pinterestUrl =
    (inspireFlowContext && inspireFlowContext.pinterestUrl) || imageUrlInput.value.trim();
  const selectedFile = getSelectedImageFile();

  if (!pinterestUrl && !selectedFile) {
    if (isDemoMode()) {
      clearActivePromptPanels();
      const loadingPanel = addInspireLoadingPanel();
      window.setTimeout(() => {
        loadingPanel.remove();
        renderInspireStyleAnalysis();
      }, 650);
      return;
    }
    addMessage("Add a Pinterest link or upload a style image first.", "bot");
    return;
  }

  if (pinterestUrl) {
    imageUrlInput.value = pinterestUrl;
    if (inspireFlowContext) {
      inspireFlowContext.pinterestUrl = pinterestUrl;
    }
  }

  clearActivePromptPanels();
  const loadingPanel = addInspireLoadingPanel();

  if (isDemoMode()) {
    window.setTimeout(() => {
      loadingPanel.remove();
      inspireFlowContext = { ...(inspireFlowContext || {}), analyzed: true };
      renderInspireStyleAnalysis(
        "Soft romantic tones, clean lines, and an effortless elegant direction."
      );
    }, 900);
    return;
  }

  try {
    const data = await fetchInspireImageAnalysis();
    loadingPanel.remove();
    inspireFlowContext = {
      ...(inspireFlowContext || {}),
      analyzed: true,
      analyzeResponse: data || null,
    };
    const summary =
      (data && data.image_analysis && data.image_analysis.summary) ||
      (data && data.vision_summary) ||
      (data && typeof data.reply === "string" ? data.reply.split("\n").find(Boolean) : "");
    const rawHero = Array.isArray(data && data.recommended_products)
      ? data.recommended_products.find(isUsableShopifyProduct)
      : null;
    const heroProduct = rawHero
      ? (rawHero.cart_variant_id ? rawHero : mapCatalogProductToRecommendation(rawHero))
      : null;
    renderInspireStyleAnalysis(summary, heroProduct);
  } catch (error) {
    loadingPanel.remove();
    inspireFlowContext = { ...(inspireFlowContext || {}), analyzed: false };
    addMessage(error instanceof Error ? error.message : "I couldn't analyze that image. Try another image.", "bot");
  }
}

async function handleInspireStyleSelection(option) {
  if (!option) {
    return;
  }

  addMessage(option.label, "user");
  clearActivePromptPanels();
  shopperProfileDraft.feel = option.catalogProduct
    ? option.catalogProduct.category || option.value || option.label
    : option.value || option.label;
  if (inspireFlowContext) {
    inspireFlowContext.styleCategory = option.value || option.label;
    inspireFlowContext.heroProduct = option.catalogProduct || null;
  }

  const selectedFile = getSelectedImageFile();
  const imageUrl =
    (inspireFlowContext && inspireFlowContext.pinterestUrl) || imageUrlInput.value.trim();

  if (inspireFlowContext && inspireFlowContext.path === "own" && (selectedFile || imageUrl)) {
    if (isDemoMode()) {
      const typingState = showTypingState("inspire");
      window.setTimeout(() => {
        removeTypingState(typingState);
        renderBotResponse(buildDemoChatResponse("inspire", { styleLabel: option.label }), option.label, {
          uiMode: "inspire",
          backendMode: backendModes.inspire,
        });
      }, 900);
      return;
    }
    const profileInputs = buildProfileInputsPayload();
    await sendImageChat(
      buildProfileNarrative(profileInputs, "inspire") ||
        `Use this inspiration image and style direction: ${option.label}.`,
      selectedFile,
      imageUrl,
      {}
    );
    return;
  }

  await sendInspireBrowseRequest(option);
}

async function sendInspireBrowseRequest(styleOption) {
  const styleLabel = styleOption.label || styleOption.value || "trending looks";
  const heroProduct = styleOption.catalogProduct || null;
  shopperProfileDraft.feel = heroProduct
    ? heroProduct.category || styleOption.value || styleOption.label || ""
    : styleOption.value || styleOption.label || "";
  const profileInputs = buildProfileInputsPayload();
  const prompt = heroProduct
    ? `Use this Shopify product as the hero item: ${heroProduct.title}. Category: ${heroProduct.category || "product"}. Build a complete shoppable look using only products from the synced store catalog.`
    : `Show me ${styleLabel} inspiration from the store catalog. Build a complete shoppable look.`;
  homeViewActive = false;
  syncHeaderHomeButton("inspire");
  addMessage("Let me find some looks!", "bot");

  if (isDemoMode()) {
    const typingState = showTypingState("inspire");
    window.setTimeout(() => {
      removeTypingState(typingState);
      renderBotResponse(buildDemoChatResponse("inspire", { styleLabel }), styleLabel, {
        uiMode: "inspire",
        backendMode: backendModes.inspire,
      });
    }, 900);
    return;
  }

  const typingState = showTypingState("inspire");
  try {
    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: [buildProfileNarrative(profileInputs, "inspire"), prompt].filter(Boolean).join(" "),
        mode: backendModes.inspire,
        customer_id: customerId,
        profile_inputs: profileInputs,
      }),
    });

    if (!response.ok) {
      throw imageRequestError(
        response,
        requestMode === "inspire" ? "Inspiration analysis" : "Complete My Look analysis"
      );
    }

    const data = await response.json();
    removeTypingState(typingState);
    if (!Array.isArray(data.recommended_products) || !data.recommended_products.some((product) => product && product.image_url)) {
      renderShopifyInspireFallback(heroProduct, styleLabel);
      return;
    }
    renderBotResponse(data, styleLabel, {
      uiMode: "inspire",
      backendMode: backendModes.inspire,
    });
  } catch (error) {
    removeTypingState(typingState);
    renderShopifyInspireFallback(heroProduct, styleLabel);
  }
}

function renderShopifyInspireFallback(heroProduct, styleLabel) {
  const catalogProducts = (catalogProductCache || [])
    .filter(
      (product) =>
        product &&
        product.image_url &&
        !String(product.image_url).startsWith("./assets/") &&
        product.available_for_sale !== false
    )
    .map((product) => mapCatalogProductToRecommendation(product));
  const hero = heroProduct && heroProduct.image_url ? heroProduct : catalogProducts[0];
  const supporting = selectDiverseCollageProducts(
    catalogProducts.filter((product) => !hero || String(product.id) !== String(hero.id)),
    4
  );
  const products = [hero, ...supporting].filter(Boolean).slice(0, 5);

  if (!products.length) {
    addMessage("These Shopify products are temporarily unavailable. Please choose another category.", "bot");
    return;
  }

  const fallback = buildDemoChatResponse("inspire", { styleLabel });
  fallback.reply = "Here are some looks matching your style.";
  fallback.recommended_products = products;
  fallback.shopper_profile = {
    ...(fallback.shopper_profile || {}),
    feeling_goal: styleLabel,
    summary: "",
    focus_points: [],
  };
  fallback.detected_tags = [];
  fallback.follow_up_prompts = [];
  renderBotResponse(fallback, styleLabel, {
    uiMode: "inspire",
    backendMode: backendModes.inspire,
    contextNote: "Shopify catalog fallback",
  });
}

function buildInspiredLookTitle(profile, products) {
  const style =
    (profile && (profile.feeling_goal || profile.feel)) ||
    shopperProfileDraft.feel ||
    (inspireFlowContext && inspireFlowContext.styleCategory) ||
    "";
  if (style) {
    const normalized = String(style)
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return `${normalized} style`;
  }
  if (products && products[0] && products[0].title) {
    return products[0].title;
  }
  return "Curated look";
}

function addInspiredSuggestionsPanel(products, profile, insights = [], context = null) {
  if (!products || !products.length) {
    return;
  }

  const existingPanel = chatLog.querySelector(".inspire-suggestions-panel");
  if (existingPanel) {
    existingPanel.remove();
  }

  const panel = document.createElement("section");
  panel.className = "inspire-suggestions-panel figma-card-screen";

  const card = document.createElement("article");
  card.className = "inspire-suggestions-card inspire-suggestions-card--stacked";

  const visual = buildLookCompositionVisual(products);
  card.appendChild(visual);

  const body = document.createElement("div");
  body.className = "inspire-suggestions-body";

  const title = document.createElement("h3");
  title.className = "inspire-suggestions-title";
  title.textContent = buildInspiredLookTitle(profile, products);

  const itemList = document.createElement("ul");
  itemList.className = "inspire-item-list";
  products.slice(0, 6).forEach((product) => {
    const item = document.createElement("li");
    item.className = "inspire-item-row";

    const name = document.createElement("span");
    name.className = "inspire-item-name";
    name.textContent = product.support_slot || product.category || product.title || "Item";

    const price = document.createElement("span");
    price.className = "inspire-item-price";
    price.textContent = formatPrice(product.price);

    item.append(name, price);
    itemList.appendChild(item);
  });

  const totalPrice = products.reduce((sum, product) => sum + (Number(product.price) || 0), 0);
  const bundleCopy = document.createElement("p");
  bundleCopy.className = "inspire-bundle-copy";
  bundleCopy.textContent =
    totalPrice > 0
      ? `Get all items for ${formatOutfitTotalPrice(totalPrice)}. You can also buy individual items from the list below.`
      : "You can buy individual items from the list below.";

  const actions = document.createElement("div");
  actions.className = "inspire-suggestions-actions";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "inspire-cta inspire-cta--outline";
  viewButton.textContent = "View details";
  viewButton.addEventListener("click", () => {
    addInspiredItemListPanel(products, context, { heading: "Here are some items you might like:" });
  });

  const cartButton = document.createElement("button");
  cartButton.type = "button";
  cartButton.className = "inspire-cta inspire-cta--primary";
  cartButton.textContent = shouldUseViewProductInstead(products) ? "View Product" : "Add to cart";
  cartButton.addEventListener("click", () => {
    if (shouldUseViewProductInstead(products)) {
      showProductViewForLocalDemo(products, context);
      return;
    }
    void addProductsToCartBulk(products, cartButton);
  });

  actions.append(viewButton, cartButton);

  const similarButton = document.createElement("button");
  similarButton.type = "button";
  similarButton.className = "inspire-similar-link";
  similarButton.textContent = "Shop similar";
  similarButton.addEventListener("click", () => {
    if (!context) {
      return;
    }
    const refineAction = conversationActionSets.inspire.find((item) => item.type === "show_alternatives");
    if (refineAction) {
      void handleConversationAction(refineAction, context, similarButton, panel, {
        onSuccess: (data) => {
          const safeProducts = filterProductsForActiveSegment(
            (data && data.recommended_products) || [],
            data && data.shopper_profile,
            data && data.ai_runtime
          );
          if (!safeProducts.length) {
            return;
          }
          addMessage("Here are some other options for you:", "bot");
          const nextContext = buildRecommendationContext(
            data,
            safeProducts,
            { uiMode: "inspire", backendMode: backendModes.inspire },
            "Similar inspiration look"
          );
          addInspiredSuggestionsPanel(
            safeProducts,
            data.shopper_profile,
            data.styling_insights || [],
            nextContext
          );
          latestRecommendationContext = nextContext;
        },
      });
    }
  });

  body.append(title, itemList, bundleCopy, actions, similarButton);
  card.appendChild(body);
  panel.appendChild(card);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function addInspiredItemListPanel(products, context, options = {}) {
  if (!products || !products.length) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "inspire-item-breakdown-panel";

  const heading = document.createElement("p");
  heading.className = "inspire-item-breakdown-heading";
  heading.textContent = options.heading || "Here are some items you might like:";

  const list = document.createElement("div");
  list.className = "inspire-item-breakdown-list";

  products.forEach((product) => {
    const row = document.createElement("article");
    row.className = "inspire-item-breakdown-row";

    const media = document.createElement("div");
    media.className = "inspire-item-breakdown-media";
    media.appendChild(buildImageTile(product));

    const copy = document.createElement("div");
    copy.className = "inspire-item-breakdown-copy";

    const name = document.createElement("p");
    name.className = "inspire-item-breakdown-name";
    name.textContent = product.title || product.category || "Catalog item";

    const price = document.createElement("p");
    price.className = "inspire-item-breakdown-price";
    price.textContent = formatPrice(product.price);

    copy.append(name, price);
    row.append(media, copy);
    list.appendChild(row);
  });

  const actions = document.createElement("div");
  actions.className = "inspire-item-breakdown-actions";

  const addAllButton = document.createElement("button");
  addAllButton.type = "button";
  addAllButton.className = "inspire-cta inspire-cta--primary inspire-cta--wide";
  addAllButton.textContent = shouldUseViewProductInstead(products) ? "View Product" : "Add all to cart";
  addAllButton.addEventListener("click", () => {
    if (shouldUseViewProductInstead(products)) {
      showProductViewForLocalDemo(products, context);
      return;
    }
    void addProductsToCartBulk(products, addAllButton);
  });

  const swapButton = document.createElement("button");
  swapButton.type = "button";
  swapButton.className = "inspire-cta inspire-cta--outline inspire-cta--wide";
  swapButton.textContent = "Swap items";
  swapButton.addEventListener("click", () => {
    if (context) {
      openSwapItemsScreen(context);
    }
  });

  if (!options.viewOnly) {
    actions.append(addAllButton, swapButton);
  }
  panel.append(heading, list);
  if (!options.viewOnly) {
    panel.appendChild(actions);
  }
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function handleImageActionSelection(option) {
  if (!option) {
    return;
  }

  setComposerQuickActionsOpen(false);

  if (option.action === "camera") {
    addMessage(option.label, "user");
    if (homeViewActive || !isImageMode(activeMode)) {
      if (homeViewActive) {
        homeViewActive = false;
      }
      setMode("complete", { silent: true });
    }
    openCameraCapture();
    return;
  }

  if (option.action === "upload") {
    addMessage(option.label, "user");
    if (activeMode === "complete") {
      renderCompleteUploadPanel();
      return;
    }
    if (homeViewActive || !isImageMode(activeMode)) {
      if (homeViewActive) {
        homeViewActive = false;
      }
      setMode("complete", { silent: true });
    }
    launchImagePicker("upload");
    return;
  }

  if (option.action === "shop_link") {
    addMessage(option.label, "user");
    if (/pinterest/i.test(String(option.label || ""))) {
      renderPinterestLinkInput();
      return;
    }
    if (activeMode === "complete") {
      renderCompleteLinkPanel();
    } else {
      addMessage("Paste your Pinterest board link below.", "bot");
      addInlineLinkInput("Paste board URL here…", (url) => {
        addMessage(url, "user");
        imageUrlInput.value = url;
        void sendImageChat("", null, url, { skipUserEcho: true });
      });
    }
    return;
  }

  if (option.action === "presets") {
    addMessage(option.label, "user");
    clearActivePromptPanels();
    addMessage("What vibe are you going for?", "bot");
    addSuggestionChips(
      profileOptions.feel.map((label) => ({ label, value: label })),
      (preset) => {
        addMessage(preset.label, "user");
        shopperProfileDraft.feel = preset.value;
        launchImagePicker("upload");
      },
      "preset-grid"
    );
    return;
  }

  if (option.action === "past_purchases") {
    addMessage(option.label, "user");
    if (activeMode === "complete") {
      renderCompletePastPurchasesPanel();
      return;
    }
    addMessage("I can pull up a recent order. Share your order number or checkout email.", "bot");
    homeViewActive = false;
    setMode("support");
    syncWidgetHeader("support");
    return;
  }
}

function addOpeningConversation() {
  chatLog.innerHTML = "";
  setMode("outfit", { silent: true });
  renderHomeOpener();
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

  if (guidedFlow.type !== "outfit_onboarding") {
    clearActivePromptPanels();
  }
  addMessage(question.prompt, "bot");
  if (chatInput) {
    chatInput.placeholder = question.freeform
      ? question.placeholder || "Type your answer"
      : getInteractionConfigForFeature(activeMode).placeholder;
  }
  renderGuidedQuestionOptions(question);
}

function renderGuidedQuestionOptions(question) {
  if (!question || !question.options || !question.options.length) {
    return;
  }

  if (question.key === "vibe_preset") {
    addSuggestionChips(
      question.options.map((label) => ({ label, value: label })),
      (option) => handleGuidedAnswer(option.value, option.label),
      "preset-grid"
    );
    return;
  }

  const variant = question.variant || "chips";
  addSuggestionChips(
    question.options.map((option) =>
      typeof option === "string" ? { label: option, value: option } : option
    ),
    (option) => handleGuidedAnswer(option.value || option.label, option.label),
    variant
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

function renderTextOutfitFollowUpActions(requiredFields = []) {
  const field = normalizeStylingFollowUpField(requiredFields[0]);
  if (!field) {
    return;
  }

  const optionsByField = {
    segment: profileOptions.segment,
    occasion: profileOptions.occasion,
    weather: profileOptions.weather,
    priority: profileOptions.priority,
  };
  const options = optionsByField[field] || [];
  if (!options.length) {
    return;
  }

  addSuggestionChips(
    options.map((label) => ({ label, value: label })),
    (option) => {
      void sendTextChat(option.value || option.label, {
        displayText: option.label,
        followUpField: field,
      });
    },
    "contextual"
  );
}

function buildDemoOutfitContext(profileInputs = null, options = {}) {
  const products = getDemoProducts("outfit");
  const profile = {
    ...(profileInputs || {}),
    feeling_goal: shopperProfileDraft.feel || "Edgy and bold",
    occasion_context: shopperProfileDraft.location || "Paris",
    segment_preference: "womenswear",
    look_title: "Casual Brunch",
    summary: "Casual, city-ready, and easy to wear.",
  };
  const insights = [
    { detail: "Neutral tones suit your warm skin" },
    { detail: "Oversized fit suits your style" },
    { detail: "High waist flatters your shape" },
    { detail: "Fits your EUR50-100 budget" },
  ];
  const context = {
    mode: options.mode || backendModes.outfit,
    uiMode: options.uiMode || "outfit",
    contextNote: options.contextNote || "Create full outfit demo",
    recommendedProductIds: products.map((item) => item.id),
    products,
    shopperProfile: profile,
    stylingInsights: insights,
    outfitPriceLabel: null,
    hideNewOutfits: Boolean(options.hideNewOutfits),
    decisionMode: Boolean(options.decisionMode),
  };
  return { products, profile, insights, context };
}

async function renderCreateFullOutfitResult(profileInputs = null, options = {}) {
  const demoContext = buildDemoOutfitContext(profileInputs, options);
  const catalogProducts = await fetchCatalogProducts(250);
  const shopifyProducts = catalogProducts.filter(isUsableShopifyProduct);
  if (!shopifyProducts.length) {
    addMessage("I couldn't find purchasable products in the connected Shopify catalog. Please sync the catalog and try again.", "bot");
    return;
  }
  const products = [];
  if (options.heroProduct && isUsableShopifyProduct(options.heroProduct)) {
    const hero = options.heroProduct.cart_variant_id
      ? { ...options.heroProduct }
      : mapCatalogProductToRecommendation(options.heroProduct);
    products.push({ ...hero, support_slot: getOutfitSupportSlot(hero) });
  }
  const heroId = products[0] && String(products[0].id);
  selectDiverseCollageProducts(
    shopifyProducts.filter((product) => String(product.id || product.shopify_product_id) !== heroId),
    5 - products.length
  ).forEach((product) => {
    products.push({
      ...mapCatalogProductToRecommendation(product),
      support_slot: getOutfitSupportSlot(product),
    });
  });
  const { profile, insights } = demoContext;
  const context = {
    ...demoContext.context,
    products,
    recommendedProductIds: products.map((product) => product.id),
    outfitPriceLabel: null,
  };
  latestRecommendationContext = context;
  syncWidgetHeader(options.headerMode || context.uiMode || "outfit");
  if (widgetPanel) {
    widgetPanel.dataset.mode = options.headerMode || context.uiMode || "outfit";
  }
  addMessage("Here are some outfit suggestions for you!", "bot");
  addLookPreview(products, context.uiMode || "outfit", profile, insights, context);
}

function setOutfitSwapHeaderActive(context = null) {
  // Keep the feature that launched swap mode visible in the header. A swap
  // opened from Create Full Outfit is still part of that flow, not Complete
  // My Look.
  const sourceMode = (context && context.uiMode) || activeMode || "complete";
  const uiMode = ["outfit", "complete", "inspire"].includes(sourceMode)
    ? sourceMode
    : "complete";
  if (widgetWelcomeTitle) {
    widgetWelcomeTitle.textContent = featureLabels[uiMode] || featureLabels.complete;
  }
  if (widgetPanel) {
    widgetPanel.dataset.mode = uiMode;
  }
  syncHeaderNavButton();
}

function createOutfitSwapProductCard(product) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "outfit-swap-product-card";

  const media = document.createElement("div");
  media.className = "outfit-swap-product-media";
  media.appendChild(buildImageTile(product));

  const body = document.createElement("div");
  body.className = "outfit-swap-product-body";

  const title = document.createElement("p");
  title.className = "outfit-swap-product-title";
  title.textContent = product.title;

  const meta = document.createElement("div");
  meta.className = "outfit-swap-product-meta";
  const price = document.createElement("span");
  price.textContent = formatOutfitTotalPrice(product.price);
  const swap = document.createElement("span");
  swap.className = "outfit-swap-pill";
  swap.textContent = "⇄ Swap";
  meta.append(price, swap);

  body.append(title, meta);
  card.append(media, body);
  return card;
}

async function renderOutfitSwapSelectionScreen(context) {
  setOutfitSwapHeaderActive(context);
  clearActivePromptPanels();
  addMessage("Which items would you like to swap?", "bot");

  const catalog = await fetchCatalogProducts(250);
  const realCatalogProducts = (catalog || [])
    .filter(isUsableShopifyProduct)
    .map((product) => mapCatalogProductToRecommendation(product));
  const realContextProducts = (context.products || []).filter(isUsableShopifyProduct);
  const products = [...realContextProducts];
  selectDiverseCollageProducts(realCatalogProducts, 4).forEach((product) => {
    if (products.length < 4 && !products.some((item) => String(item.id) === String(product.id))) {
      products.push(product);
    }
  });
  products.splice(4);
  if (!products.length) {
    addMessage("Those items are temporarily unavailable. Please choose another option.", "bot");
    return;
  }
  const realContext = { ...context, products, recommendedProductIds: products.map((product) => product.id) };
  latestRecommendationContext = realContext;

  const panel = document.createElement("section");
  panel.className = "outfit-swap-selection-panel figma-card-screen";
  const grid = document.createElement("div");
  grid.className = "outfit-swap-selection-grid";
  products.forEach((product) => {
    const card = createOutfitSwapProductCard(product);
    card.addEventListener("click", () => {
      const swapContext = {
        ...realContext,
        products: realContext.products.map((item) => ({
          ...item,
          _swap_target: String(item.id) === String(product.id),
        })),
      };
      latestRecommendationContext = swapContext;
      void renderOutfitSwapOptionsScreen(swapContext, product);
    });
    grid.appendChild(card);
  });
  panel.appendChild(grid);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function getDemoSwapReplacementProduct(product, selectedProduct) {
  const slot = selectedProduct.support_slot || product.support_slot;
  return {
    ...product,
    id: `${product.id}-selected`,
    support_slot: slot,
    available_for_sale: true,
    cart_variant_id: product.cart_variant_id || `demo-${product.id}-selected`,
  };
}

function buildOutfitSwapOptionProducts(selectedProduct, selectedAlternative = null, catalogProducts = []) {
  const targetKind = getCollageProductKind(selectedProduct);
  const realCatalog = (catalogProducts || [])
    .filter(isUsableShopifyProduct)
    .map((product) => mapCatalogProductToRecommendation(product));
  const alternatives = realCatalog
    .filter(
      (product) =>
        getCollageProductKind(product) === targetKind &&
        String(product.id) !== String(selectedProduct.id)
    )
    .filter((product, index, items) =>
      items.findIndex((item) => String(item.id) === String(product.id)) === index
    );
  if (selectedAlternative) {
    alternatives.sort((a, b) =>
      Number(String(b.id) === String(selectedAlternative.id)) -
      Number(String(a.id) === String(selectedAlternative.id))
    );
  }
  const contextProducts = ((latestRecommendationContext && latestRecommendationContext.products) || [])
    .filter(isUsableShopifyProduct);
  const replacement = { ...(selectedAlternative || selectedProduct), _swap_target: true };
  const updatedContext = contextProducts.map((product) => (product._swap_target ? replacement : product));
  return { composition: updatedContext, alternatives: alternatives.slice(0, 3) };
}

async function renderOutfitSwapOptionsScreen(context, selectedProduct, selectedAlternative = null) {
  setOutfitSwapHeaderActive(context);
  clearActivePromptPanels();
  addMessage("Here are some swap options", "bot");

  const catalog = await fetchCatalogProducts(250);
  const { composition, alternatives } = buildOutfitSwapOptionProducts(selectedProduct, selectedAlternative, catalog);
  if (!composition.length || !alternatives.length) {
    addMessage("No other in-stock Shopify products are available in this category yet.", "bot");
    return;
  }
  const panel = document.createElement("section");
  panel.className = "outfit-swap-options-panel figma-card-screen";

  const stage = document.createElement("div");
  stage.className = "outfit-swap-options-stage";

  const compositionGrid = document.createElement("div");
  compositionGrid.className = "outfit-swap-composition-grid";
  compositionGrid.appendChild(buildLookCompositionVisual(composition, { preserveProducts: true }));

  const optionList = document.createElement("div");
  optionList.className = "outfit-swap-option-list";
  alternatives.forEach((product) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "outfit-swap-option-card";
    const close = document.createElement("span");
    close.className = "outfit-swap-option-close";
    close.textContent = "×";
    const media = document.createElement("div");
    media.className = "outfit-swap-option-media";
    media.appendChild(buildImageTile(product));
    const name = document.createElement("span");
    name.className = "outfit-swap-option-name";
    name.textContent = product.title;
    const price = document.createElement("span");
    price.className = "outfit-swap-option-price";
    price.textContent = formatOutfitTotalPrice(product.price);
    option.append(close, media, name, price);
    const isSelected = Boolean(selectedAlternative && String(product.id) === String(selectedAlternative.id));
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
    option.addEventListener("click", () => {
      const replacement = {
        ...product,
        support_slot: selectedProduct.support_slot || product.support_slot,
        _swap_target: true,
      };
      const updated = context.products.map((item) => (item._swap_target ? replacement : item));
      const nextContext = { ...context, products: updated, recommendedProductIds: updated.map((item) => item.id) };
      latestRecommendationContext = nextContext;
      void renderOutfitSwapOptionsScreen(nextContext, selectedProduct, product);
    });
    optionList.appendChild(option);
  });

  stage.append(compositionGrid, optionList);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "outfit-swap-add-button";
  addButton.textContent = shouldUseViewProductInstead(composition) ? "View Product" : "Add to cart";
  addButton.addEventListener("click", () => {
    if (shouldUseViewProductInstead(composition)) {
      showProductViewForLocalDemo(composition, context, {
        heading: "View these swap products in the demo:",
      });
      return;
    }
    void addProductsToCartBulk(composition, addButton);
  });

  panel.append(stage, addButton);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function startOutfitOnboardingFlow() {
  homeViewActive = false;
  setMode("outfit", { silent: true });
  syncWidgetHeader("outfit");
  if (widgetPanel) {
    widgetPanel.dataset.mode = "outfit";
  }
  resetGuidedFlow();
  shopperProfileDraft = createEmptyProfileDraft();
  pendingDecisionRequest = null;
  guidedFlow = {
    type: "outfit_onboarding",
    stepIndex: 0,
    decisionMode: false,
    questions: getOutfitOnboardingSequence(),
  };
  askGuidedQuestion();
}

function startOutfitConversation(openingRequest = "") {
  homeViewActive = false;
  setMode("outfit");
  resetGuidedFlow();
  shopperProfileDraft = createEmptyProfileDraft();
  pendingDecisionRequest = null;

  if (openingRequest) {
    void sendTextChat(openingRequest, {
      displayText: openingRequest,
      skipUserEcho: true,
    });
    return;
  }

  startOutfitOnboardingFlow();
}

function startImageConversation(flowType) {
  if (flowType === "inspire") {
    startInspireConversation();
    return;
  }

  shopperProfileDraft = createEmptyProfileDraft();
  pendingStylingFollowUpField = null;
  homeViewActive = false;
  setMode("complete");
  resetGuidedFlow();
  clearActivePromptPanels();
  addMessage("How would you like to start?", "bot");
  showCompleteLookStartScreen();
  syncWidgetHeader("complete");
}

function startSupportConversation(type, options = {}) {
  homeViewActive = false;
  setMode("support");
  resetGuidedFlow();
  resetSupportFlowContext();

  if (type === "track") {
    showTrackOrderScreen(options);
    return;
  }

  showCustomerCareMenu(options);
}

function activateFeature(mode, options = {}) {
  const {
    announce = true,
    userLabel = "",
    supportType = "help",
    openingRequest = "",
  } = options;
  const fromHome = homeViewActive;

  // These two Figma branches continue below the home cards. The image-led
  // branches use dedicated screens and therefore clear the transcript.
  if (fromHome && (mode === "complete" || mode === "inspire")) {
    chatLog.innerHTML = "";
  }

  if (announce && userLabel) {
    addMessage(userLabel, "user");
  }

  homeViewActive = false;
  syncHeaderHomeButton(mode);
  syncWidgetHeader(mode);

  if (mode === "support") {
    startSupportConversation(supportType, { silent: announce && Boolean(userLabel) });
    return;
  }

  if (mode === "complete") {
    startImageConversation("complete");
    return;
  }

  if (mode === "inspire") {
    startGetInspiredDemoFlow();
    return;
  }

  startOutfitConversation(openingRequest);
}

function handleStarterSelection(option) {
  if (!option) {
    return;
  }

  if (option.action === "mode" && option.mode) {
    const silentPick = option.mode === "complete" || option.mode === "inspire" || option.mode === "support";
    activateFeature(option.mode, {
      announce: !silentPick,
      userLabel: option.mode === "outfit" ? "Create full outfit" : option.label,
      openingRequest: option.prompt || "",
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

  if (guidedFlow.type === "outfit_onboarding" && question.key === "vibe_method") {
    if (value === "presets") {
      guidedFlow.questions.splice(guidedFlow.stepIndex + 1, 0, {
        key: "vibe_preset",
        prompt: "What vibe are you going for?",
        options: [
          "Effortless Chic",
          "Edgy & Bold",
          "Soft & Romantic",
          "Minimal & Modern",
          "Classic & Polished",
          "Boho & Relaxed",
        ],
        variant: "preset-grid",
      });
      guidedFlow.stepIndex += 1;
      askGuidedQuestion();
      return;
    }
    if (value === "pinterest") {
      addMessage("Paste your Pinterest board link below.", "bot");
      addInlineLinkInput("Paste board URL here…", (url) => {
        addMessage(url, "user");
        shopperProfileDraft.fit_preference = url;
        guidedFlow.stepIndex += 1;
        askGuidedQuestion();
      });
      return;
    }
    if (value === "upload") {
      shopperProfileDraft.fit_preference = "Uploaded screenshots";
      launchImagePicker("upload");
      return;
    }
  }

  if (question.key === "segment") {
    shopperProfileDraft.segment = value === "Skip this" ? "" : value;
  } else if (question.key === "occasion") {
    shopperProfileDraft.occasion = value === "Skip this" ? "" : value;
  } else if (question.key === "location") {
    shopperProfileDraft.location = value === "Skip this" ? "" : value;
  } else if (question.key === "weather") {
    shopperProfileDraft.weather = value === "Skip this" ? "" : value;
  } else if (question.key === "decision_mode") {
    guidedFlow.decisionMode = value === "pick_best";
  } else if (question.key === "color_preference") {
    shopperProfileDraft.color_preference = value === "No preference" ? "" : value;
  } else if (question.key === "budget") {
    shopperProfileDraft.budget = value === "Skip this" ? "" : value;
  } else if (question.key === "priority") {
    shopperProfileDraft.priority = value === "Skip this" ? "" : value;
  } else if (question.key === "feel" || question.key === "vibe_preset") {
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
  syncInteractionUI(activeMode);

  if (completedFlow.type === "outfit_onboarding") {
    const normalizedWeather = String(shopperProfileDraft.weather || "").toLowerCase();
    const season = /hot|warm|summer|humid/.test(normalizedWeather)
      ? "summer"
      : /cold|winter|chilly/.test(normalizedWeather)
        ? "winter"
        : shopperProfileDraft.weather;
    const lookContext = [season, shopperProfileDraft.location].filter(Boolean).join(" ");
    const quantity = completedFlow.decisionMode ? "the best outfit" : "some outfits";
    addMessage(
      `Thanks! Let me curate ${quantity}${lookContext ? ` for your ${lookContext} look` : " for you"}!`,
      "bot"
    );
    const typingState = showTypingState("outfit");
    window.setTimeout(() => {
      removeTypingState(typingState);
      void renderCreateFullOutfitResult(buildProfileInputsPayload(), {
        decisionMode: completedFlow.decisionMode,
      });
    }, 700);
    return;
  }

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

  if (completedFlow.type === "complete") {
    addMessage("How would you like to start?", "bot");
    showCompleteLookStartScreen();
    return;
  }

  if (completedFlow.type === "inspire") {
    addSuggestionChips(
      getInspireImageActionSuggestions(),
      (option) => handleImageActionSelection(option),
      "contextual"
    );
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

function setPresenceState(_state = "online") {
  /* presence indicator removed in Figma layout */
}

async function loadChatbotCustomization(options = {}) {
  const { silent = false } = options;

  if (customizationRequestInFlight) {
    return;
  }

  customizationRequestInFlight = true;

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
  } finally {
    customizationRequestInFlight = false;
  }
}

function startCustomizationRefreshLoop() {
  if (customizationRefreshTimer) {
    window.clearInterval(customizationRefreshTimer);
  }
  customizationRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void loadChatbotCustomization({ silent: true });
    }
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

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;

  const parts = role === "bot" ? buildBotMessageContent(text) : createMessageParagraphs(text);
  parts.forEach((part) => bubble.appendChild(part));
  appendMessageTimestamp(bubble);

  stack.append(bubble);
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

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateSelectedImage(file) {
  if (!file) return "Choose an image first.";
  if (!SUPPORTED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    return "Please use a JPG, PNG, or WebP image.";
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return "That image is larger than 10 MB. Choose a smaller image and try again.";
  }
  return "";
}

function imageRequestError(response, flowLabel = "Image analysis") {
  if (response.status === 413) return new Error("That image is too large for the server. Choose a smaller image.");
  if (response.status === 422) return new Error("The server could not read that image. Try a JPG, PNG, or WebP file.");
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return new Error(`${flowLabel} is temporarily unavailable. Try again in a moment.`);
  }
  return new Error(`${flowLabel} failed (HTTP ${response.status}).`);
}

function cameraSupported() {
  return Boolean(
    window.isSecureContext &&
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
  cameraPickerFallback = false;
  if (cameraCard) {
    cameraCard.classList.add("hidden");
    cameraCard.classList.remove("camera-scan-mode", "camera-picker-fallback");
  }
  if (widgetPanel) {
    widgetPanel.classList.remove("camera-active", "camera-scan-mode");
  }
  syncHeaderHomeButton();
  if (cameraStillImage) {
    cameraStillImage.classList.add("hidden");
    cameraStillImage.removeAttribute("src");
  }
  if (cameraVideo) {
    cameraVideo.classList.remove("hidden");
  }
  const fallbackHint = cameraCard && cameraCard.querySelector(".camera-fallback-hint");
  if (fallbackHint) {
    fallbackHint.classList.add("hidden");
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

function showCameraPickerFallback() {
  cameraPickerFallback = true;
  if (cameraCard) {
    cameraCard.classList.remove("hidden");
    cameraCard.classList.add("camera-picker-fallback");
  }
  if (widgetPanel) {
    widgetPanel.classList.add("camera-active");
    if (onboardingCameraMode) {
      widgetPanel.classList.add("camera-scan-mode");
      cameraCard.classList.add("camera-scan-mode");
    }
  }
  if (cameraVideo) {
    cameraVideo.classList.add("hidden");
  }
  let fallbackHint = cameraCard && cameraCard.querySelector(".camera-fallback-hint");
  if (!fallbackHint && cameraCard) {
    fallbackHint = document.createElement("p");
    fallbackHint.className = "camera-fallback-hint";
    fallbackHint.textContent = window.isSecureContext
      ? "Camera access is unavailable. Tap below to take a photo or choose one from your gallery."
      : "Direct camera access requires HTTPS. Open the secure site, or tap below to choose a photo.";
    const frame = cameraCard.querySelector(".camera-frame");
    if (frame) {
      frame.appendChild(fallbackHint);
    }
  }
  if (fallbackHint) {
    fallbackHint.classList.remove("hidden");
  }
  syncWidgetHeader();
  syncHeaderNavButton();
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
  if (!cameraCard || !cameraVideo) {
    launchImagePicker("camera");
    return;
  }

  clearPendingImageSelection();
  resetCameraCard();
  cameraCard.classList.remove("hidden");
  if (widgetPanel) {
    widgetPanel.classList.add("camera-active");
    if (onboardingCameraMode) {
      widgetPanel.classList.add("camera-scan-mode");
      cameraCard.classList.add("camera-scan-mode");
    }
  }
  syncHeaderHomeButton();
  syncWidgetHeader();

  if (!cameraSupported()) {
    showCameraPickerFallback();
    return;
  }

  const videoConstraints = [
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];

  for (const constraints of videoConstraints) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraVideo.srcObject = cameraStream;
      await cameraVideo.play();
      cameraVideo.classList.remove("hidden");
      return;
    } catch (error) {
      stopCameraStream();
    }
  }

  showCameraPickerFallback();
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

async function confirmCapturedPhoto() {
  if (!cameraCaptureReady) {
    return;
  }

  if (onboardingCameraMode) {
    finishOnboardingScanCapture();
    return;
  }

  resetCameraCard();
  if (activeMode === "complete") {
    await submitSelectedImageFlow();
    return;
  }
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

  const guidedQuestion = guidedFlow && guidedFlow.questions
    ? guidedFlow.questions[guidedFlow.stepIndex]
    : null;
  if (
    guidedFlow &&
    guidedFlow.type === "outfit_onboarding" &&
    guidedQuestion &&
    guidedQuestion.key === "vibe_method"
  ) {
    const previewUrl =
      (pendingImageSelection && pendingImageSelection.previewUrl) || imageUrl;
    addImageUploadMessage(previewUrl, "Style inspiration uploaded");
    shopperProfileDraft.fit_preference = "Uploaded screenshots";
    shopperProfileDraft.feel = shopperProfileDraft.feel || "Inspired by uploaded reference";
    chatInput.value = "";
    clearImageFlowStateAfterResponse();
    guidedFlow.stepIndex += 1;
    askGuidedQuestion();
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

function isDemoProduct(product) {
  return String((product && product.id) || "").startsWith("demo-");
}

function shouldUseViewProductInstead(products) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [products].filter(Boolean);
  return !canUseStorefrontCart() || safeProducts.some(isDemoProduct);
}

function showProductViewForLocalDemo(products, context = null, options = {}) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [products].filter(Boolean);
  if (!safeProducts.length) {
    return;
  }
  addInspiredItemListPanel(safeProducts, context || latestRecommendationContext, {
    heading: options.heading || "View these products in the demo:",
    viewOnly: true,
  });
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

function formatOutfitTotalPrice(price) {
  const rawPrice = String(price ?? "").trim();
  const amount = Number(price);
  if (!Number.isNaN(amount) && amount > 0) {
    const decimalMatch = rawPrice.match(/\.(\d+)/);
    const decimalPlaces = decimalMatch ? Math.min(decimalMatch[1].length, 2) : 0;
    return `€${amount.toLocaleString("en-IE", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: 2,
    })}`;
  }
  return formatPrice(price);
}

function buildOutfitLookTitle(profile) {
  if (profile && profile.look_title) {
    return profile.look_title;
  }
  const style = (profile && (profile.feeling_goal || profile.feel)) || shopperProfileDraft.feel || "";
  const location =
    (profile && (profile.occasion_context || profile.location)) ||
    shopperProfileDraft.location ||
    shopperProfileDraft.occasion ||
    "";
  const parts = [style, location].filter(Boolean);
  if (!parts.length) {
    return "Curated Look";
  }
  return `${parts.join(" ")} Look`;
}

function buildRecommendationContext(data, safeProducts, requestMeta, contextNote) {
  const resolvedMode = data.ai_runtime && data.ai_runtime.resolved_mode;
  const renderMode = requestMeta.uiMode || (resolvedMode ? backendModeToUiMode(resolvedMode) : activeMode);
  const requiredFollowUpFields = Array.isArray(data.required_follow_up_fields) ? data.required_follow_up_fields : [];
  const needsCompleteLookRequirements = renderMode === "complete" && requiredFollowUpFields.length > 0;
  const isSupportResponse =
    resolvedMode === "support" || Boolean(data.support_payload);

  if (needsCompleteLookRequirements || isSupportResponse || !safeProducts.length) {
    return null;
  }

  return {
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
  };
}

function closeSwapScreen(options = {}) {
  const { silent = false } = options;
  swapScreenActive = false;
  swapScreenContext = null;
  selectedSwapProductId = null;

  if (swapScreen) {
    swapScreen.classList.add("hidden");
  }
  if (swapItemGrid) {
    swapItemGrid.innerHTML = "";
    swapItemGrid.classList.add("hidden");
  }
  if (swapComposition) {
    swapComposition.innerHTML = "";
  }
  if (widgetPanel) {
    widgetPanel.classList.remove("swap-active");
  }

  if (!silent) {
    syncHeaderHomeButton(activeMode);
  }
}

function applyDemoSwap(originalProduct, replacementProduct) {
  if (!swapScreenContext || !originalProduct || !replacementProduct) {
    return;
  }

  const products = swapScreenContext.products.map((item) =>
    item.id === originalProduct.id
      ? {
          ...replacementProduct,
          id: `${replacementProduct.id}-${Date.now()}`,
          support_slot: item.support_slot,
          role: item.role,
        }
      : item
  );

  swapScreenContext = {
    ...swapScreenContext,
    products,
    recommendedProductIds: products.map((item) => item.id),
  };
  latestRecommendationContext = swapScreenContext;
  selectedSwapProductId = null;
  renderSwapScreen(products, null, null);
  updateOutfitCarouselFromContext(swapScreenContext);
  if (swapScreenHint) {
    swapScreenHint.textContent = shouldUseViewProductInstead(swapScreenContext.products)
      ? "Tap another item to keep swapping, or view the products in this look."
      : "Tap another item to keep swapping, or add the look to cart.";
  }
}

function renderSwapScreen(products, selectedId = null, alternatives = null, swapTarget = null) {
  if (swapAddToCartButton) {
    swapAddToCartButton.textContent = shouldUseViewProductInstead(products) ? "View Product" : "Add to cart";
  }
  if (swapComposition) {
    swapComposition.innerHTML = "";
    swapComposition.appendChild(
      buildLookCompositionVisual(products, {
        interactive: true,
        selectedId,
        onTileSelect: (product) => {
          void handleSwapTileSelection(product);
        },
      })
    );
  }

  if (!swapItemGrid) {
    return;
  }

  swapItemGrid.innerHTML = "";
  if (!alternatives || !alternatives.length) {
    swapItemGrid.classList.add("hidden");
    return;
  }

  swapItemGrid.classList.remove("hidden");
  alternatives.forEach((product) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "swap-item-tile swap-item-tile--alternative";
    tile.setAttribute("aria-pressed", "false");

    const media = document.createElement("div");
    media.className = "swap-item-media";
    media.appendChild(buildImageTile(product));

    const label = document.createElement("span");
    label.className = "swap-item-label";
    label.textContent = product.title || product.category || "Alternative";

    tile.append(media, label);
    tile.addEventListener("click", () => {
      if (swapTarget) {
        applyDemoSwap(swapTarget, product);
      }
    });
    swapItemGrid.appendChild(tile);
  });
}

function renderSwapItemGrid(products, selectedId = null) {
  renderSwapScreen(products, selectedId, null);
}

async function handleSwapTileSelection(product) {
  if (!swapScreenContext || !product) {
    return;
  }

  const swapMeta = getSwapLabelForProduct(product);
  if (!swapMeta) {
    selectedSwapProductId = product.id;
    renderSwapItemGrid(swapScreenContext.products, selectedSwapProductId);
    if (swapScreenHint) {
      swapScreenHint.textContent = "I couldn't map that piece cleanly — pick another item to swap.";
    }
    return;
  }

  selectedSwapProductId = product.id;
  renderSwapScreen(swapScreenContext.products, selectedSwapProductId);

  if (isDemoMode() && swapMeta) {
    const alternatives = DEMO_SWAP_ALTERNATIVES[swapMeta.category] || [];
    if (alternatives.length) {
      if (swapScreenHint) {
        swapScreenHint.textContent = `Pick a new ${swapMeta.category} — the rest of the look stays fixed.`;
      }
      renderSwapScreen(swapScreenContext.products, product.id, alternatives, product);
      return;
    }
  }

  if (swapScreenHint) {
    swapScreenHint.textContent = `Swapping your ${swapMeta.category}…`;
  }

  const action = {
    type: `swap_${swapMeta.category}`,
    label: swapMeta.label,
    action: "swap",
    swapCategory: swapMeta.category,
  };

  const panel = swapScreen || document.body;
  const button = swapAddToCartButton;
  if (button) {
    button.disabled = true;
  }

  try {
    await handleConversationAction(action, swapScreenContext, button, panel, {
      preserveSwapScreen: true,
      onSuccess: (data) => {
        const safeProducts = filterProductsForActiveSegment(
          (data && data.recommended_products) || swapScreenContext.products,
          data && data.shopper_profile,
          data && data.ai_runtime
        );
        swapScreenContext = {
          ...swapScreenContext,
          products: safeProducts,
          recommendedProductIds: safeProducts.map((item) => item.id),
          shopperProfile: (data && data.shopper_profile) || swapScreenContext.shopperProfile,
        };
        latestRecommendationContext = swapScreenContext;
        selectedSwapProductId = null;
        renderSwapScreen(safeProducts, null, null);
        if (swapScreenHint) {
          swapScreenHint.textContent = "Tap another item to keep swapping, or add the look to cart.";
        }
        updateOutfitCarouselFromContext(swapScreenContext);
      },
    });
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function updateOutfitCarouselFromContext(context) {
  if (!context || !Array.isArray(context.products)) {
    return;
  }

  const inspirePanel = chatLog && chatLog.querySelector(".inspire-suggestions-panel");
  if (inspirePanel) {
    inspirePanel.remove();
    addInspiredSuggestionsPanel(context.products, context.shopperProfile, [], context);
    return;
  }

  const panel = chatLog && chatLog.querySelector(".outfit-carousel-panel");
  if (!panel) {
    return;
  }

  panel.remove();
  addLookPreview(context.products, context.uiMode || "outfit", context.shopperProfile, [], context);
}

function openSwapItemsScreen(context) {
  if (!context || !Array.isArray(context.products) || !context.products.length) {
    addMessage("I need a full look before I can open swap mode.", "bot");
    return;
  }

  swapScreenActive = true;
  swapScreenContext = context;
  selectedSwapProductId = null;
  latestRecommendationContext = context;

  if (widgetPanel) {
    widgetPanel.classList.add("swap-active");
  }
  if (swapScreen) {
    swapScreen.classList.remove("hidden");
  }
  if (swapScreenHint) {
    swapScreenHint.textContent =
      context.uiMode === "inspire"
        ? "Which items would you like to swap?"
        : "Tap an item to swap it — the rest of the look stays fixed.";
  }

  renderSwapItemGrid(context.products, null);
  syncHeaderHomeButton(context.uiMode || "outfit");
  scrollChatToBottom();
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

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  const text = document.createElement("span");
  text.className = "typing-copy";
  text.textContent = loadingCopy[mode] || "Thinking through the best options...";

  const bubble = document.createElement("div");
  bubble.className = "message bot";
  bubble.append(dots, text);
  appendMessageTimestamp(bubble, "now");

  stack.append(bubble);
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

  appendMessageTimestamp(bubble);
  stack.append(bubble);
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
  appendMessageTimestamp(bubble);

  stack.append(bubble);
  appendMessageRowAvatar(row, stack, avatar, "user");
  chatLog.appendChild(row);
  pendingImagePreviewNode = row;
  scrollChatToBottom();
}

function renderOutfitCarouselCard(panel, card, products, profile, insights, context, carouselIndex = 0, carouselTotal = 1) {
  card.innerHTML = "";
  card.className = "outfit-carousel-card";
  const activeContext = context
    ? { ...context, products, recommendedProductIds: products.map((product) => product.id) }
    : context;

  const visual = buildShopifyCutoutCollageVisual(products);
  visual.classList.add("shopify-cutout-collage--interactive");
  visual.setAttribute("role", "button");
  visual.setAttribute("tabindex", "0");
  visual.setAttribute("aria-label", "Open outfit details");
  visual.addEventListener("click", () => showOutfitZoomScreen(products));
  visual.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showOutfitZoomScreen(products);
    }
  });
  card.appendChild(visual);

  const body = document.createElement("div");
  body.className = "outfit-carousel-body";

  const title = document.createElement("h3");
  title.className = "outfit-carousel-title";
  title.textContent = buildOutfitLookTitle(profile);

  const totalPrice = products.reduce((sum, product) => sum + (Number(product.price) || 0), 0);
  const price = document.createElement("p");
  price.className = "outfit-carousel-price";
  price.textContent =
    context && context.outfitPriceLabel
      ? context.outfitPriceLabel
      : totalPrice > 0 ? formatOutfitTotalPrice(totalPrice) : formatOutfitTotalPrice(products[0].price);

  const description = document.createElement("p");
  description.className = "outfit-carousel-description";
  const styleNote = (profile && profile.feeling_goal) || shopperProfileDraft.feel || "your style";
  const locationNote =
    (profile && profile.occasion_context) || shopperProfileDraft.location || "the occasion";
  description.textContent = `A ${styleNote.toLowerCase()} direction built for ${locationNote.toLowerCase()}.`;

  const whyHeading = document.createElement("p");
  whyHeading.className = "outfit-carousel-why-heading";
  whyHeading.textContent = "Why this works for you?";

  const whyList = document.createElement("ul");
  whyList.className = "outfit-carousel-why-list";

  const reasonLines = [];
  if (Array.isArray(insights) && insights.length) {
    insights.forEach((insight) => {
      if (insight && insight.detail) {
        reasonLines.push(insight.detail);
      }
    });
  }
  products.slice(0, 4).forEach((product) => {
    if (product.reason) {
      reasonLines.push(product.reason);
    }
  });
  if (!reasonLines.length) {
    reasonLines.push(
      "Color harmony stays balanced across the look",
      "Silhouette proportions feel intentional",
      "Occasion fit matches what you asked for"
    );
  }

  reasonLines.slice(0, 5).forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    whyList.appendChild(item);
  });

  const nav = document.createElement("div");
  nav.className = "outfit-carousel-nav";

  const navLabel = document.createElement("span");
  navLabel.textContent = "Outfit edit";

  const arrows = document.createElement("div");
  arrows.className = "outfit-carousel-arrows";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "outfit-carousel-arrow";
  prevButton.setAttribute("aria-label", "Previous outfit");
  prevButton.textContent = "‹";
  prevButton.disabled = carouselIndex <= 0;

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "outfit-carousel-arrow";
  nextButton.setAttribute("aria-label", "Next outfit");
  nextButton.textContent = "›";

  const counter = document.createElement("span");
  counter.className = "outfit-carousel-counter";
  counter.textContent = `${carouselIndex + 1}/${Math.max(carouselTotal, 1)}`;

  arrows.append(prevButton, nextButton);
  nav.append(navLabel, arrows, counter);

  const actions = document.createElement("div");
  actions.className = "outfit-carousel-actions";

  const newOutfitsButton = document.createElement("button");
  newOutfitsButton.type = "button";
  newOutfitsButton.className = "outfit-carousel-cta outfit-carousel-cta--primary";
  newOutfitsButton.textContent = "New outfits";
  newOutfitsButton.addEventListener("click", () => {
    addMessage("New outfits", "user");
    addMessage("I’ll keep the same brief and show you another direction next.", "bot");
  });

  const cartButton = document.createElement("button");
  cartButton.type = "button";
  cartButton.className = "outfit-carousel-cta outfit-carousel-cta--primary";
  cartButton.textContent = shouldUseViewProductInstead(products) ? "View Product" : "Add to cart";
  cartButton.addEventListener("click", () => {
    if (shouldUseViewProductInstead(products)) {
      showProductViewForLocalDemo(products, activeContext);
      return;
    }
    void addProductsToCartBulk(products, cartButton);
  });

  const swapButton = document.createElement("button");
  swapButton.type = "button";
  swapButton.className = "outfit-carousel-cta outfit-carousel-cta--secondary";
  swapButton.textContent = "Swap items";
  swapButton.addEventListener("click", () => {
    if (activeContext) {
      if (activeContext.contextNote === "Create full outfit demo" || activeContext.contextNote === "Get inspired demo") {
        addMessage("Swap items", "user");
        renderOutfitSwapSelectionScreen(activeContext);
        return;
      }
      openSwapItemsScreen(activeContext);
    }
  });

  if (context && context.hideNewOutfits) {
    actions.append(swapButton, cartButton);
  } else {
    actions.append(newOutfitsButton, cartButton, swapButton);
  }
  body.append(title, price, description, whyHeading, whyList, nav, actions);
  card.appendChild(body);

  prevButton.addEventListener("click", () => {
    if (!outfitCarouselState || outfitCarouselState.index <= 0) {
      return;
    }
    outfitCarouselState.index -= 1;
    const nextProducts = outfitCarouselState.alternatives[outfitCarouselState.index];
    renderOutfitCarouselCard(
      panel,
      card,
      nextProducts,
      outfitCarouselState.profile,
      outfitCarouselState.insights,
      outfitCarouselState.context,
      outfitCarouselState.index,
      outfitCarouselState.alternatives.length
    );
  });

  nextButton.addEventListener("click", async () => {
    if (!outfitCarouselState) {
      return;
    }

    if (outfitCarouselState.index < outfitCarouselState.alternatives.length - 1) {
      outfitCarouselState.index += 1;
      const nextProducts = outfitCarouselState.alternatives[outfitCarouselState.index];
      renderOutfitCarouselCard(
        panel,
        card,
        nextProducts,
        outfitCarouselState.profile,
        outfitCarouselState.insights,
        outfitCarouselState.context,
        outfitCarouselState.index,
        outfitCarouselState.alternatives.length
      );
      return;
    }

    if (!outfitCarouselState.context) {
      return;
    }

    nextButton.disabled = true;
    const refineAction = conversationActionSets.outfit.find((item) => item.type === "show_another_option");
    try {
      await handleConversationAction(
        refineAction || {
          type: "show_another_option",
          label: "New outfits",
          action: "refine",
          prompt: "Show me another outfit direction for the same occasion and profile.",
        },
        outfitCarouselState.context,
        nextButton,
        panel,
        {
          preserveSwapScreen: true,
          onSuccess: (data) => {
            const safeProducts = filterProductsForActiveSegment(
              (data && data.recommended_products) || [],
              data && data.shopper_profile,
              data && data.ai_runtime
            );
            if (!safeProducts.length) {
              return;
            }
            const nextContext = buildRecommendationContext(
              data,
              safeProducts,
              {
                uiMode: outfitCarouselState.context.uiMode,
                backendMode: outfitCarouselState.context.mode,
              },
              "Another outfit option"
            );
            outfitCarouselState.alternatives.push(safeProducts);
            outfitCarouselState.index = outfitCarouselState.alternatives.length - 1;
            outfitCarouselState.context = nextContext || outfitCarouselState.context;
            latestRecommendationContext = outfitCarouselState.context;
            renderOutfitCarouselCard(
              panel,
              card,
              safeProducts,
              (data && data.shopper_profile) || outfitCarouselState.profile,
              (data && data.styling_insights) || outfitCarouselState.insights,
              outfitCarouselState.context,
              outfitCarouselState.index,
              outfitCarouselState.alternatives.length
            );
          },
        }
      );
    } finally {
      nextButton.disabled = outfitCarouselState.index >= outfitCarouselState.alternatives.length - 1;
    }
  });
}

function addCompleteLookComposition(products, profile, context = null) {
  if (!products || !products.length) {
    return;
  }

  const existingPanel = chatLog.querySelector(".complete-look-panel");
  if (existingPanel) {
    existingPanel.remove();
  }

  const panel = document.createElement("section");
  panel.className = "look-preview-panel complete-look-panel figma-card-screen";

  const heading = document.createElement("p");
  heading.className = "look-preview-heading";
  heading.textContent = "Completed look";

  const visual = buildLookCompositionVisual(products);
  panel.appendChild(heading);
  panel.appendChild(visual);

  const totalPrice = products.reduce((sum, product) => sum + (Number(product.price) || 0), 0);
  const price = document.createElement("p");
  price.className = "look-preview-price";
  price.textContent = totalPrice > 0 ? formatOutfitTotalPrice(totalPrice) : "";

  const actions = document.createElement("div");
  actions.className = "look-preview-actions";

  const cartButton = document.createElement("button");
  cartButton.type = "button";
  cartButton.className = "look-preview-cta";
  cartButton.textContent = shouldUseViewProductInstead(products) ? "View Product" : "Add to cart";
  cartButton.addEventListener("click", () => {
    if (shouldUseViewProductInstead(products)) {
      showProductViewForLocalDemo(products, context);
      return;
    }
    void addProductsToCartBulk(products, cartButton);
  });

  const swapButton = document.createElement("button");
  swapButton.type = "button";
  swapButton.className = "look-preview-cta look-preview-cta--secondary";
  swapButton.textContent = "Swap items";
  swapButton.addEventListener("click", () => {
    if (context) {
      openSwapItemsScreen(context);
    }
  });

  actions.append(cartButton, swapButton);
  panel.append(price, actions);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function addLookPreview(products, mode, profile, insights = [], context = null) {
  if (!products || products.length === 0) {
    return;
  }

  const existingPanel = chatLog.querySelector(".outfit-carousel-panel");
  if (existingPanel) {
    existingPanel.remove();
  }

  const alternatives = context && context.decisionMode
    ? [selectDiverseCollageProducts(products, 5)]
    : buildShopifyCollageAlternatives(products, 5);
  outfitCarouselState = {
    alternatives,
    index: 0,
    profile,
    insights,
    context,
  };

  const panel = document.createElement("section");
  panel.className = "outfit-carousel-panel";

  const card = document.createElement("article");
  card.className = "outfit-carousel-card";

  renderOutfitCarouselCard(panel, card, alternatives[0], profile, insights, context, 0, alternatives.length);
  panel.appendChild(card);
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
  if (product.available_for_sale === false) {
    addMessage(`${product.title || "This product"} is out of stock right now.`, "bot");
    return;
  }

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
  const safeProducts = (products || []).filter(Boolean);
  const isDemoLook = safeProducts.length > 0 && safeProducts.every((product) =>
    String(product.id || "").startsWith("demo-")
  );

  if (isDemoLook) {
    if (button) {
      button.disabled = true;
      button.textContent = "Added";
    }
    addMessage("I added the selected look to your demo cart.", "bot");
    return;
  }

  const validProducts = (products || []).filter(
    (product) => product && (product.cart_variant_id || product.handle) && product.available_for_sale !== false
  );
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

  const metaRow = buildProductMetafieldRow(product);
  body.append(topline, title);
  if (metaRow) {
    body.appendChild(metaRow);
  }
  const inventoryRow = buildProductInventoryRow(product);
  if (inventoryRow) {
    body.appendChild(inventoryRow);
  }

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
  const useProductView = shouldUseViewProductInstead(product);
  addButton.textContent = product.available_for_sale === false ? "Sold out" : useProductView ? "View Product" : "Add to Cart";
  addButton.disabled = (!useProductView && !product.cart_variant_id) || product.available_for_sale === false;
  addButton.addEventListener("click", () => {
    if (useProductView) {
      showProductViewForLocalDemo(product);
      return;
    }
    addProductToCart(product, addButton);
  });
  actions.appendChild(addButton);

  if (!options.compact) {
    body.append(reason, actions);
  } else {
    body.append(actions);
  }
  card.append(media, body);
  return card;
}

function buildProductInventoryRow(product) {
  const details = [];
  if (product.available_for_sale === false) {
    details.push({ label: "Out of stock", tone: "danger" });
  } else if (product.inventory_quantity !== null && product.inventory_quantity !== undefined) {
    const quantity = Number(product.inventory_quantity);
    if (!Number.isNaN(quantity)) {
      details.push({
        label: quantity > 0 ? `${quantity} in stock` : "Out of stock",
        tone: quantity > 0 ? "ok" : "danger",
      });
    }
  } else if (product.available_for_sale === true) {
    details.push({ label: "Available", tone: "ok" });
  }

  if (product.sku) {
    details.push({ label: `SKU ${product.sku}`, tone: "muted" });
  }
  if (!details.length) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "recommendation-inventory-row";
  details.forEach((detail) => {
    const chip = document.createElement("span");
    chip.className = `recommendation-inventory-chip ${detail.tone || "muted"}`;
    chip.textContent = detail.label;
    row.appendChild(chip);
  });
  return row;
}

function buildProductMetafieldRow(product) {
  const badges = [];

  if (product.metafields && typeof product.metafields === "object") {
    Object.entries(product.metafields).forEach(([label, values]) => {
      if (!Array.isArray(values) || !values.length) {
        return;
      }
      badges.push(`${label}: ${values.slice(0, 2).join(", ")}`);
    });
  }

  (product.match_badges || product.tags || []).forEach((badge) => {
    const normalized = String(badge || "").trim();
    if (normalized && badges.length < 6) {
      badges.push(normalized);
    }
  });

  const uniqueBadges = [...new Set(badges)].slice(0, 4);
  if (!uniqueBadges.length) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "recommendation-meta-row";
  uniqueBadges.forEach((badge) => {
    const chip = document.createElement("span");
    chip.className = "recommendation-meta-chip";
    chip.textContent = badge;
    row.appendChild(chip);
  });
  return row;
}

function addRecommendationCards(products, options = {}) {
  if (!products || products.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = `recommendation-panel figma-card-screen${options.compact ? " recommendation-panel--compact" : ""}`;
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
  if (/(dress|gown)/.test(text)) {
    return { category: "dress", label: "Swap dress" };
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
  panel.className = "support-panel figma-card-screen";

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

async function handleConversationAction(action, context, button, panel, options = {}) {
  const { preserveSwapScreen = false, onSuccess = null } = options;
  const buttons = panel && panel.querySelectorAll ? panel.querySelectorAll("button") : [];
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
    if (typeof onSuccess === "function") {
      onSuccess(data, contextNote);
      return;
    }
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
  if (preserveSwapScreen) {
    if (button) {
      button.disabled = true;
    }
  } else {
    buttons.forEach((item) => {
      item.disabled = true;
    });
  }

  try {
    if (action.action === "open_swap") {
      openSwapItemsScreen(context);
      buttons.forEach((item) => {
        item.disabled = false;
      });
      return;
    }

    if (action.action === "cart") {
      if (shouldUseViewProductInstead(context.products || [])) {
        showProductViewForLocalDemo(context.products || [], context);
        return;
      }
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

    if (action.acknowledgement && action.action !== "swap" && !(action.action === "refine" && onSuccess)) {
      addMessage(action.acknowledgement, "bot");
    }

    if (action.action === "swap" && action.swapCategory) {
      if (!preserveSwapScreen) {
        addMessage(`Swapping your ${action.swapCategory} while keeping the rest of the look intact.`, "bot");
      }
      typingState = preserveSwapScreen ? null : showTypingState(renderMode);
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
      if (!onSuccess && action.acknowledgement) {
        addMessage(action.acknowledgement, "bot");
      }
      typingState = onSuccess ? null : showTypingState(renderMode);
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

  const modeKey =
    context.mode === backendModes.inspire
      ? "inspire"
      : context.mode === backendModes.complete
        ? "complete"
        : context.mode === backendModes.support
          ? "support"
          : "outfit";

  if (modeKey === "outfit" || modeKey === "inspire") {
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
      button.className = `feedback-action${action.wide ? " feedback-action--wide" : ""}`;
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
    button.className = `feedback-action${action.wide ? " feedback-action--wide" : ""}`;
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
    addInspiredSuggestionsPanel(safeProducts, data.shopper_profile || null, data.styling_insights || [], {
      mode: backendModes.inspire,
      uiMode: renderMode,
      products: safeProducts,
      recommendedProductIds: safeProducts.map((item) => item.id),
      shopperProfile: data.shopper_profile || null,
    });
    if (supportProducts.length) {
      addStylingInsights(data.styling_insights || []);
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

    return "Here are some suggestions for you!";
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
  const useProductView = shouldUseViewProductInstead(heroProduct);
  addButton.textContent = useProductView ? "View Product" : "Add to Cart";
  addButton.disabled = !useProductView && !heroProduct.cart_variant_id;
  addButton.addEventListener("click", () => {
    if (useProductView) {
      showProductViewForLocalDemo(heroProduct);
      return;
    }
    addProductToCart(heroProduct, addButton);
  });
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
  const streamlinedOutfitLook = renderMode === "outfit" && safeProducts.length > 0 && !needsTextStylingFollowUp;
  const recommendationContext = buildRecommendationContext(data, safeProducts, requestMeta, contextNote);
  addMessage(composePrimaryBotReply(data, safeProducts, renderMode), "bot");
  try {
    if (isSupportResponse) {
      updateSupportUploadContext(supportPayload);
      clearStylingUiForSupportMode();
      renderSupportPayload(supportPayload);
    } else if (needsTextStylingFollowUp) {
      updateSupportUploadContext(null);
      renderTextOutfitFollowUpActions(requiredFollowUpFields);
    } else if (needsCompleteLookRequirements) {
      updateSupportUploadContext(null);
      startCompleteLookRequirementFlow(requiredFollowUpFields, data.image_analysis || null, { renderFirstQuestionInline: true });
    } else if (streamlinedOutfitLook) {
      updateSupportUploadContext(null);
      addLookPreview(
        safeProducts,
        renderMode,
        data.shopper_profile,
        data.styling_insights || [],
        recommendationContext
      );
    } else if (streamlinedCompleteLook) {
      updateSupportUploadContext(null);
      addGapAnalysis(data.gap_analysis || null);
      addCompleteLookComposition(safeProducts, data.shopper_profile, recommendationContext);
      addInspiredItemListPanel(safeProducts, recommendationContext, {
        heading: "Individual pieces in this look",
      });
      addStylingInsights(data.styling_insights || []);
    } else if (streamlinedInspiredLook) {
      updateSupportUploadContext(null);
      addInspiredSuggestionsPanel(
        safeProducts,
        data.shopper_profile || null,
        data.styling_insights || [],
        recommendationContext
      );
      addStylingInsights(data.styling_insights || []);
    } else {
      updateSupportUploadContext(null);
      addImageAnalysisSummary(data.image_analysis, data.ai_runtime, data.detected_tags || []);
      addProfileSummary(data.shopper_profile);
      addLookPreview(safeProducts, renderMode, data.shopper_profile, data.styling_insights || []);
      addDetectedTags(data.detected_tags || []);
      addRecommendationCards(safeProducts, { mode: renderMode, compact: true });
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
  latestRecommendationContext = needsCompleteLookRequirements || isSupportResponse ? null : recommendationContext;
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

  const explicitProfileInputs =
    options.profileInputs !== undefined && options.profileInputs !== null;
  if (
    requestMode === "outfit" &&
    isGenericOutfitStarterMessage(trimmedMessage) &&
    !hasProfileSelections() &&
    !explicitProfileInputs
  ) {
    if (!options.skipUserEcho) {
      addMessage(options.displayText || trimmedMessage || "Create full outfit", "user");
    }
    chatInput.value = "";
    startOutfitOnboardingFlow();
    return;
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

  if (isDemoMode() && requestMode === "outfit") {
    window.setTimeout(() => {
      removeTypingState(typingState);
      renderBotResponse(buildDemoChatResponse("outfit", { occasion: displayText }), displayText, {
        uiMode: "outfit",
        backendMode: requestBackendMode,
      });
    }, 900);
    return;
  }

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

  if (isDemoMode() && (requestMode === "complete" || requestMode === "inspire")) {
    window.setTimeout(async () => {
      removeTypingState(typingState);
      if (requestMode === "complete") {
        renderCompleteDemoFindFlow();
        clearImageFlowStateAfterResponse();
        if (selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
          window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
        }
        return;
      }
      const catalog = await fetchCatalogProducts(250);
      const shopifyProducts = selectDiverseCollageProducts(catalog, 5).map((product) =>
        mapCatalogProductToRecommendation(product)
      );
      if (!shopifyProducts.length) {
        addMessage("Style suggestions are temporarily unavailable. Please try again shortly.", "bot");
        clearImageFlowStateAfterResponse();
        return;
      }
      const response = buildDemoChatResponse(requestMode);
      response.recommended_products = shopifyProducts;
      renderBotResponse(response, shopperMessage, {
        uiMode: requestMode,
        backendMode: backendModes[requestMode],
      });
      clearImageFlowStateAfterResponse();
      if (selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
      }
    }, 900);
    return;
  }

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
      throw imageRequestError(
        response,
        requestMode === "inspire" ? "Inspiration analysis" : "Complete My Look analysis"
      );
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
      error instanceof Error
        ? error.message
        : "I’m having a brief issue reaching the styling service. Try again in a moment.",
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
    void openCameraCapture();
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

  const validationError = validateSelectedImage(file);
  if (validationError) {
    imageInput.value = "";
    addMessage(validationError, "bot");
    return;
  }

  if (onboardingCameraMode) {
    if (shopperOnboardingData.scanImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(shopperOnboardingData.scanImagePreview);
    }
    shopperOnboardingData.scanImageFile = file;
    shopperOnboardingData.scanImagePreview = URL.createObjectURL(file);
    imageInput.value = "";
    finishOnboardingScanCapture();
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

  if (activeMode === "inspire" && inspireFlowContext && inspireFlowContext.path === "own") {
    updateInspireUploadPreview(previewUrl, file.name);
    return;
  }

  if (activeMode === "complete") {
    void submitSelectedImageFlow();
    return;
  }

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
    if (cameraPickerFallback) {
      launchImagePicker("camera");
      return;
    }
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
    void confirmCapturedPhoto();
  });
}

if (widgetNavButton) {
  widgetNavButton.addEventListener("click", () => {
    if (authViewActive) {
      if (authStep === "signup" || authStep === "forgot") {
        showAuthScreen("login");
      }
      return;
    }
    if (swapScreenActive) {
      closeSwapScreen();
      return;
    }
    if (cameraCard && !cameraCard.classList.contains("hidden")) {
      if (onboardingCameraMode) {
        onboardingCameraMode = false;
      }
      resetCameraCard();
      if (onboardingActive || onboardingStep) {
        openOnboardingStep("intro");
      }
      return;
    }
    if (onboardingActive) {
      handleOnboardingBack();
      return;
    }
    if (homeViewActive) {
      resetOnboardingStatusForCurrentUser();
      startOnboardingFlow();
      return;
    }
    if (!homeViewActive) {
      if (activeMode === "support" && supportFlowContext) {
        handleSupportBackNavigation();
        return;
      }
      returnToChatHome();
    }
  });
}

if (swapAddToCartButton) {
  swapAddToCartButton.addEventListener("click", () => {
    if (!swapScreenContext) {
      return;
    }
    if (shouldUseViewProductInstead(swapScreenContext.products || [])) {
      showProductViewForLocalDemo(swapScreenContext.products || [], swapScreenContext);
      return;
    }
    void addProductsToCartBulk(swapScreenContext.products || [], swapAddToCartButton);
  });
}

if (widgetCartButton) {
  widgetCartButton.addEventListener("click", () => {
    addMessage("Your cart has 2 items ready to checkout.", "bot");
  });
}

if (widgetSkipButton) {
  widgetSkipButton.addEventListener("click", () => {
    skipOnboarding();
  });
}

if (onboardingPrimaryBtn) {
  onboardingPrimaryBtn.addEventListener("click", () => {
    advanceOnboardingFromFooter();
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

  await sendTextChat(value, {
    displayText: value || buildDisplaySummary(buildProfileInputsPayload()) || "Build my outfit",
  });
});

function launchDemoPreviewFlow() {
  const flow = getDemoAutoFlow();
  if (!flow) {
    return;
  }

  chatLog.innerHTML = "";
  homeViewActive = false;

  if (flow === "onboarding") {
    startOnboardingFlow();
    return;
  }

  if (flow === "support") {
    activateFeature("support", { announce: false });
    return;
  }

  if (flow === "inspire") {
    startGetInspiredDemoFlow();
    return;
  }

  if (flow === "complete") {
    activateFeature("complete", { announce: false });
    window.setTimeout(async () => {
      const catalog = await fetchCatalogProducts(250);
      const shopifyProducts = selectDiverseCollageProducts(catalog, 5).map((product) =>
        mapCatalogProductToRecommendation(product)
      );
      const anchor = shopifyProducts[0];
      if (anchor && anchor.image_url) addImageUploadMessage(anchor.image_url, "My anchor piece");
      window.setTimeout(() => {
        const response = buildDemoChatResponse("complete");
        response.recommended_products = shopifyProducts;
        renderBotResponse(response, "Complete my look", {
          uiMode: "complete",
          backendMode: backendModes.complete,
        });
      }, 900);
    }, 500);
    return;
  }

  if (flow === "outfit") {
    homeViewActive = false;
    resetGuidedFlow();
    setMode("outfit", { silent: true });
    syncWidgetHeader("outfit");
    syncHeaderHomeButton("outfit");
    chatLog.innerHTML = "";
    window.setTimeout(() => {
      addMessage("Create full outfit", "user");
      addMessage("Great! What's the occasion for today?", "bot");
      addMessage("Casual", "user");
      addMessage("What vibe are you going for?", "bot");
      addMessage("Choose from presets", "user");
      addMessage("What vibe are you going for?", "bot");
      addMessage("Edgy and bold", "user");
      addMessage("Nice! Where will you be wearing this outfit?", "bot");
      addMessage("Paris", "user");
      addMessage("What kind of weather do you expect there?", "bot");
      addMessage("Hot", "user");
      shopperProfileDraft = {
        ...createEmptyProfileDraft(),
        occasion: "Casual",
        feel: "Edgy and bold",
        location: "Paris",
        weather: "Hot",
      };
      addMessage("Thanks! Let me curate some outfits for your edgy and bold Paris look!", "bot");
      renderCreateFullOutfitResult(buildProfileInputsPayload());
    }, 700);
  }
}

async function initializeWidget() {
  renderWidgetLogo({
    brand_name: "StyledGenie",
    assistant_name: defaultAssistantName,
  });
  syncInteractionUI(activeMode);
  syncHeaderHomeButton(activeMode);
  await loadChatbotCustomization();

  const params = new URLSearchParams(window.location.search);

  const session = getActiveAuthSession();
  if (session) {
    applyAuthIdentity(session);
  }

  if (params.get("reset_onboarding") === "1" || params.get("logout") === "1" || params.get("login") === "1") {
    try {
      sessionStorage.setItem(FORCE_ONBOARDING_AFTER_LOGIN_KEY, "1");
    } catch (error) {
      /* ignore storage errors */
    }
    resetOnboardingStatusForCurrentUser();
    clearAuthSession();
    try {
      localStorage.removeItem(ONBOARDING_STATUS_KEY);
    } catch (error) {
      /* ignore storage errors */
    }
  }

  if (params.get("login") === "1" || params.get("logout") === "1") {
    showAuthScreen("login");
    return;
  }

  if (!isAuthenticated()) {
    showAuthScreen("login");
    return;
  }

  enterAuthenticatedApp();
  startCustomizationRefreshLoop();
}

initializeWidget();
