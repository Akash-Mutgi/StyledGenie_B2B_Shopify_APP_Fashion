const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const imageInput = document.getElementById("imageInput");
const voiceInputButton = document.getElementById("voiceInputButton");
const widgetAssistantName = document.getElementById("widgetAssistantName");
const widgetWelcomeTitle = document.getElementById("widgetWelcomeTitle");
const widgetLogo = document.getElementById("widgetLogo");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const uploadCard = document.querySelector(".upload-card");
const helperText = document.querySelector(".helper-text");
const apiBaseUrl = "http://127.0.0.1:8000";
const customerId = "guest-001";
const customizationRefreshIntervalMs = 4000;

let activeMode = "outfit";
let latestCustomizationFingerprint = "";
let latestRecommendationContext = null;
let pendingImage = null;
let uploadPreviewHost = null;
let speechRecognition = null;

const defaultAssistantName = "StyledGenie AI";
const defaultWelcomeTitle = "Fashion Assistant";

const backendModes = {
  outfit: "outfit_curation",
  inspire: "get_inspired",
  complete: "complete_the_look",
  support: "support",
};

const frontendModes = {
  outfit_curation: "outfit",
  get_inspired: "inspire",
  complete_the_look: "complete",
  support: "support",
};

const starterMessages = {
  outfit:
    "I’m ready when you are. Share the occasion, mood, colors, fit, or budget, and I’ll start shaping a look around that.",
  inspire:
    "Send me the image whenever you’re ready, and I’ll translate that feeling into pieces from your catalog.",
  complete:
    "Show me the piece or outfit you’re starting with, and I’ll suggest what brings the whole look together.",
  support:
    "Ask me anything practical like shipping, returns, sizing, or order tracking and I’ll keep it clear and action-focused.",
};

const inputPlaceholders = {
  outfit: "Describe the outfit you want...",
  inspire: "Optional note about the inspiration image...",
  complete: "Optional note about the outfit you uploaded...",
  support: "Ask about shipping, returns, sizing, or your order...",
};

const uploadHelpText = {
  inspire: "Upload a fashion image, preview it, and tap Analyze now to match one closest hero item and supporting pieces.",
  complete: "Upload the piece you’re wearing, preview it, and tap Analyze now so I can only fill what’s missing.",
  support: "Upload a damage or wrong-item photo when needed and I’ll keep the support flow clear and action-based.",
};

const loadingCopy = {
  outfit: "Curating a polished look for you...",
  inspire: "Reading the image and finding the closest hero match...",
  complete: "Analyzing the piece and completing the look...",
  support: "Checking that for you now...",
};

const welcomeContent = {
  outfit: {
    eyebrow: "Your Personal Stylist",
    title: "Let’s build a look that feels beautifully right.",
    body:
      "Tell me the occasion, mood, fit, weather, or budget and I’ll guide you toward a clear outfit direction.",
    prompts: [
      "I need something easy for dinner tonight under €150.",
      "Style me for a smart casual workday",
      "I want an effortless weekend outfit",
    ],
  },
  inspire: {
    eyebrow: "Get Inspired",
    title: "Bring me the image and I’ll decode the hero piece.",
    body:
      "Upload a look you love and I’ll find the closest main match first, then build the rest of the outfit around it.",
    prompts: [
      "Help me recreate this look",
      "Make this feel more elevated",
      "Find the closest dress to this image",
    ],
  },
  complete: {
    eyebrow: "Complete The Look",
    title: "One strong piece is enough to style from.",
    body:
      "Upload what you’re wearing and I’ll analyze it first, then only add the pieces that are still missing.",
    prompts: [
      "Complete this for dinner",
      "Make this feel more polished",
      "Keep it easy but premium",
    ],
  },
  support: {
    eyebrow: "Customer Care",
    title: "I’m here for the practical details too.",
    body:
      "Ask me about shipping, returns, exchanges, sizing, order tracking, or damaged items and I’ll keep it short and useful.",
    prompts: [
      "I want to track my order",
      "How long does shipping take?",
      "I need sizing help",
    ],
  },
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

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function getUploadPreviewHost() {
  if (uploadPreviewHost) {
    return uploadPreviewHost;
  }
  uploadPreviewHost = document.createElement("div");
  uploadPreviewHost.className = "upload-preview-host";
  uploadCard.appendChild(uploadPreviewHost);
  return uploadPreviewHost;
}

function renderWidgetLogo(customization) {
  if (!widgetLogo) {
    return;
  }

  const brandName = customization.brand_name || customization.assistant_name || defaultAssistantName;
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

  const assistantName = customization.assistant_name || defaultAssistantName;
  const welcomeTitle = customization.welcome_title || defaultWelcomeTitle;
  const welcomeMessage = customization.welcome_message || starterMessages.outfit;

  widgetAssistantName.textContent = assistantName;
  widgetWelcomeTitle.textContent = welcomeTitle;
  renderWidgetLogo(customization);

  welcomeContent.outfit.eyebrow = assistantName;
  welcomeContent.outfit.title = welcomeTitle;
  welcomeContent.outfit.body = welcomeMessage;
  starterMessages.outfit = welcomeMessage;

  const visibleWelcomeCard = chatLog.querySelector(".welcome-card");
  if (visibleWelcomeCard && activeMode === "outfit") {
    const eyebrow = visibleWelcomeCard.querySelector(".welcome-eyebrow");
    const title = visibleWelcomeCard.querySelector(".welcome-title");
    const body = visibleWelcomeCard.querySelector(".welcome-copy");
    if (eyebrow) eyebrow.textContent = welcomeContent.outfit.eyebrow;
    if (title) title.textContent = welcomeContent.outfit.title;
    if (body) body.textContent = welcomeContent.outfit.body;
  }
}

function getCustomizationFingerprint(customization) {
  return JSON.stringify({
    assistant_name: customization && customization.assistant_name,
    welcome_title: customization && customization.welcome_title,
    welcome_message: customization && customization.welcome_message,
  });
}

async function loadChatbotCustomization(options = {}) {
  const { silent = false } = options;
  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/workspace`);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const nextFingerprint = getCustomizationFingerprint(data.chatbot_customization);
    if (!silent || nextFingerprint !== latestCustomizationFingerprint) {
      applyChatbotCustomization(data.chatbot_customization);
      latestCustomizationFingerprint = nextFingerprint;
    }
  } catch (error) {
    // Keep the demo usable even when merchant settings are unavailable.
  }
}

function startCustomizationRefreshLoop() {
  window.setInterval(() => {
    loadChatbotCustomization({ silent: true });
  }, customizationRefreshIntervalMs);
}

function isImageMode(mode) {
  return mode === "inspire" || mode === "complete" || mode === "support";
}

function frontendModeFromBackend(mode) {
  return frontendModes[mode] || activeMode;
}

function currentEndpointForMode(mode) {
  if (mode === "inspire") {
    return "/api/inspire";
  }
  if (mode === "complete") {
    return "/api/complete-look";
  }
  return "/api/chat";
}

function modeFromEndpoint(endpoint) {
  if (endpoint === "/api/inspire") {
    return "inspire";
  }
  if (endpoint === "/api/complete-look") {
    return "complete";
  }
  return "outfit";
}

function addMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  scrollChatToBottom();
}

function addElement(node) {
  chatLog.appendChild(node);
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

  const chipRow = document.createElement("div");
  chipRow.className = "quick-prompt-row";

  content.prompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-prompt";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      chatInput.value = prompt;
      chatInput.focus();
    });
    chipRow.appendChild(button);
  });

  card.append(eyebrow, title, body, chipRow);
  addElement(card);
}

function setMode(mode, options = {}) {
  const { resetConversation = true } = options;
  activeMode = mode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  chatInput.placeholder = inputPlaceholders[mode];

  if (isImageMode(mode)) {
    uploadCard.classList.remove("hidden");
    helperText.textContent = uploadHelpText[mode];
  } else {
    uploadCard.classList.add("hidden");
    clearPendingImage();
  }

  if (resetConversation) {
    latestRecommendationContext = null;
    chatLog.innerHTML = "";
    addWelcomeCard(mode);
    addMessage(starterMessages[mode], "bot");
  }
}

function showTypingState(mode) {
  const typing = document.createElement("div");
  typing.className = "message bot typing-message";
  typing.dataset.typing = "true";

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  const text = document.createElement("span");
  text.className = "typing-copy";
  text.textContent = loadingCopy[mode] || "Thinking through the best options...";

  typing.append(dots, text);
  addElement(typing);
  return typing;
}

function removeTypingState(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
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

function buildImageTile(product, classPrefix = "recommendation") {
  if (product.image_url) {
    const image = document.createElement("img");
    image.className = `${classPrefix}-image`;
    image.src = product.image_url;
    image.alt = product.title;
    image.loading = "lazy";
    return image;
  }

  const placeholder = document.createElement("div");
  placeholder.className = `${classPrefix}-placeholder`;
  placeholder.textContent = (product.category || "Style").slice(0, 14);
  return placeholder;
}

function buildCartAttributionProperties(product) {
  return {
    _sg_assisted: "true",
    _sg_flow:
      (latestRecommendationContext && latestRecommendationContext.mode) || backendModes[activeMode],
    _sg_customer_id: customerId,
    _sg_product_id: product.id,
    _sg_source: "styledgenie_widget_v2",
    _sg_timestamp: new Date().toISOString(),
  };
}

function getCartRoot() {
  if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
    return window.Shopify.routes.root;
  }
  return null;
}

async function addProductToCart(product, button) {
  if (!product.cart_variant_id) {
    addMessage("This product is not cart-ready yet. Please open the product page instead.", "bot");
    return;
  }

  const cartRoot = getCartRoot();
  if (!cartRoot) {
    addMessage(
      "Add to cart works when this widget runs inside the Shopify storefront. In this demo, use View Product instead.",
      "bot"
    );
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Adding...";

  const parsedVariantId = Number(product.cart_variant_id);
  const cartVariantId = Number.isNaN(parsedVariantId)
    ? product.cart_variant_id
    : parsedVariantId;

  try {
    const response = await fetch(`${cartRoot}cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: cartVariantId,
            quantity: 1,
            properties: buildCartAttributionProperties(product),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Cart add failed");
    }

    button.textContent = "Added";
    addMessage(`${product.title} was added to the cart.`, "bot");
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    addMessage(
      "I couldn’t add that product to the cart just now. Please open the product page and try again there.",
      "bot"
    );
  }
}

function createPanel(title, className) {
  const panel = document.createElement("section");
  panel.className = className;
  if (title) {
    const heading = document.createElement("p");
    heading.className = `${className.split(" ")[0]}-heading`;
    heading.textContent = title;
    panel.appendChild(heading);
  }
  return panel;
}

function addDetectedTags(tags) {
  if (!tags || tags.length === 0) {
    return;
  }

  const row = document.createElement("div");
  row.className = "signal-row";

  tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;
    row.appendChild(pill);
  });

  addElement(row);
}

function addVisualSummary(visualSummary) {
  if (!visualSummary) {
    return;
  }

  const panel = createPanel("What I’m seeing", "summary-panel");
  const list = document.createElement("div");
  list.className = "summary-grid";

  const rows = [
    ["Anchor piece", visualSummary.anchor_item || visualSummary.hero_item || visualSummary.garment_type],
    ["Palette", (visualSummary.color_palette || []).join(", ")],
    ["Shape", (visualSummary.silhouette_cues || []).join(", ")],
    ["Framing", visualSummary.framing],
    ["Direction", visualSummary.style_direction],
  ].filter(([, value]) => value);

  rows.forEach(([label, value]) => {
    const item = document.createElement("article");
    item.className = "summary-item";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    list.appendChild(item);
  });

  panel.appendChild(list);
  addElement(panel);
}

function addGapAnalysis(gapAnalysis) {
  if (!gapAnalysis) {
    return;
  }

  const panel = createPanel("What’s missing", "summary-panel");
  const list = document.createElement("div");
  list.className = "gap-grid";

  [
    ["Already there", (gapAnalysis.present || []).join(", ")],
    ["Still missing", (gapAnalysis.missing || []).join(", ")],
    ["I’d add next", (gapAnalysis.recommended_focus || []).join(", ")],
  ].forEach(([label, value]) => {
    const item = document.createElement("article");
    item.className = "summary-item";
    item.innerHTML = `<span>${label}</span><strong>${value || "—"}</strong>`;
    list.appendChild(item);
  });

  panel.appendChild(list);
  addElement(panel);
}

function buildRecommendationCard(product, compact = false) {
  const card = document.createElement("article");
  card.className = compact ? "recommendation-card compact" : "recommendation-card";

  const media = document.createElement("div");
  media.className = compact ? "recommendation-media compact" : "recommendation-media";
  media.appendChild(buildImageTile(product));

  const body = document.createElement("div");
  body.className = "recommendation-body";

  const topline = document.createElement("div");
  topline.className = "recommendation-topline";

  const category = document.createElement("span");
  category.className = "recommendation-category";
  category.textContent = product.slot_label || product.category || "Catalog pick";

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

  body.append(topline, title, reason, actions);
  card.append(media, body);
  return card;
}

function addRecommendationCards(products, heading = "Recommended picks") {
  if (!products || products.length === 0) {
    return;
  }

  const panel = createPanel(heading, "recommendation-panel");
  const list = document.createElement("div");
  list.className = "recommendation-list";

  products.forEach((product) => {
    list.appendChild(buildRecommendationCard(product));
  });

  panel.appendChild(list);
  addElement(panel);
}

function addHeroMatch(heroProduct, supportingItems) {
  if (!heroProduct) {
    return;
  }

  const panel = createPanel("Closest main match", "recommendation-panel hero-panel");
  panel.appendChild(buildRecommendationCard(heroProduct));

  if (supportingItems && supportingItems.length) {
    const supportHeading = document.createElement("p");
    supportHeading.className = "supporting-heading";
    supportHeading.textContent = "Complete the look";

    const list = document.createElement("div");
    list.className = "supporting-grid";

    supportingItems.forEach((item) => {
      list.appendChild(buildRecommendationCard(item, true));
    });

    panel.append(supportHeading, list);
  }

  addElement(panel);
}

function addStylingInsights(insights) {
  if (!insights || insights.length === 0) {
    return;
  }

  const panel = createPanel("Why this works", "insight-panel");
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
  addElement(panel);
}

function addActionPanel(title, actions) {
  if (!actions || actions.length === 0) {
    return;
  }

  const panel = createPanel(title, "feedback-panel action-panel");
  const row = document.createElement("div");
  row.className = "feedback-action-row";

  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feedback-action";
    button.textContent = action.label;
    button.addEventListener("click", () => handleAction(action));
    row.appendChild(button);
  });

  panel.appendChild(row);
  addElement(panel);
}

function addValidationNotes(validation) {
  if (!validation || validation.status === "pass" || !validation.notes || !validation.notes.length) {
    return;
  }

  const panel = createPanel("Refining", "summary-panel");
  const detail = document.createElement("p");
  detail.className = "summary-note";
  detail.textContent = validation.notes.join(" ");
  panel.appendChild(detail);
  addElement(panel);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function clearPendingImage() {
  pendingImage = null;
  imageInput.value = "";
  const host = getUploadPreviewHost();
  host.innerHTML = "";
}

function renderPendingImagePreview() {
  const host = getUploadPreviewHost();
  host.innerHTML = "";

  if (!pendingImage) {
    return;
  }

  const card = document.createElement("div");
  card.className = "upload-preview-card";

  const image = document.createElement("img");
  image.className = "upload-preview-image";
  image.src = pendingImage.dataUrl;
  image.alt = pendingImage.name;

  const copy = document.createElement("div");
  copy.className = "upload-preview-copy";
  copy.innerHTML = `<strong>${pendingImage.name}</strong><p>Image ready. Tap Analyze now when you want me to read it first.</p>`;

  const actions = document.createElement("div");
  actions.className = "upload-preview-actions";

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "primary-action";
  analyzeButton.textContent = "Analyze now";
  analyzeButton.addEventListener("click", () => submitImageRequest());

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "secondary-action";
  clearButton.textContent = "Remove";
  clearButton.addEventListener("click", clearPendingImage);

  actions.append(analyzeButton, clearButton);
  card.append(image, copy, actions);
  host.appendChild(card);
}

function addImagePreviewMessage() {
  if (!pendingImage) {
    return;
  }

  const bubble = document.createElement("div");
  bubble.className = "message user image-message";

  const image = document.createElement("img");
  image.className = "chat-preview-image";
  image.src = pendingImage.dataUrl;
  image.alt = pendingImage.name;

  const caption = document.createElement("p");
  caption.className = "chat-preview-caption";
  caption.textContent = pendingImage.name;

  bubble.append(image, caption);
  addElement(bubble);
}

function buildRequestContext(endpoint, payload, mode) {
  return {
    endpoint,
    payload: JSON.parse(JSON.stringify(payload)),
    mode,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storeLatestContext(data, requestContext) {
  latestRecommendationContext = {
    endpoint: requestContext.endpoint,
    payload: clone(requestContext.payload),
    mode: backendModes[requestContext.mode] || requestContext.mode,
    recommendedProductIds: (data.recommended_products || []).map((item) => item.id),
    lockedProductIds: (data.recommended_products || []).map((item) => item.id),
    supportMode: Boolean(data.support_mode),
  };
}

function appendPromptText(baseText, addition) {
  const cleanBase = (baseText || "").trim();
  const cleanAddition = (addition || "").trim();
  if (!cleanBase) {
    return cleanAddition;
  }
  if (!cleanAddition) {
    return cleanBase;
  }
  return `${cleanBase} ${cleanAddition}`.trim();
}

async function resendLatestRequest(label, update = {}, options = {}) {
  if (!latestRecommendationContext) {
    return;
  }

  const nextPayload = clone(latestRecommendationContext.payload);
  const nextContext = {
    endpoint: latestRecommendationContext.endpoint,
    mode: modeFromEndpoint(latestRecommendationContext.endpoint),
    payload: nextPayload,
  };

  if (nextContext.endpoint === "/api/chat") {
    if (update.appendText) {
      nextPayload.message = appendPromptText(nextPayload.message, update.appendText);
    }
  } else if (update.appendText) {
    nextPayload.shopper_note = appendPromptText(nextPayload.shopper_note, update.appendText);
  }

  if (update.decision_preference) {
    nextPayload.decision_preference = update.decision_preference;
  }

  if (update.swap_category) {
    nextPayload.swap_category = update.swap_category;
    nextPayload.locked_product_ids =
      update.locked_product_ids || clone(latestRecommendationContext.lockedProductIds);
  }

  if (update.excluded_product_ids) {
    nextPayload.excluded_product_ids = Array.from(
      new Set([...(nextPayload.excluded_product_ids || []), ...update.excluded_product_ids])
    );
  }

  if (!options.silent) {
    addMessage(label, "user");
  }

  await performRequest(nextContext);
}

async function handleAction(action) {
  if (!action) {
    return;
  }

  if (action.action_type === "link" && action.value) {
    window.open(action.value, "_blank", "noreferrer");
    return;
  }

  if (action.action_type === "decision") {
    await resendLatestRequest(action.label, { decision_preference: action.value });
    return;
  }

  if (action.action_type === "swap" && action.value && action.value !== "swap_one_item") {
    await resendLatestRequest(action.label, {
      swap_category: action.value,
      locked_product_ids: latestRecommendationContext && latestRecommendationContext.lockedProductIds,
    });
    return;
  }

  if (action.action_type === "refine") {
    const shouldExclude = /another|affordable|show/i.test(action.label);
    await resendLatestRequest(action.label, {
      appendText: action.value || action.label,
      excluded_product_ids:
        shouldExclude && latestRecommendationContext
          ? latestRecommendationContext.recommendedProductIds
          : [],
    });
    return;
  }

  if (action.action_type === "support") {
    if (action.value && String(action.value).includes("@")) {
      window.location.href = `mailto:${action.value}`;
      return;
    }

    if (action.value === "order_number") {
      chatInput.placeholder = "Enter your order number...";
      chatInput.focus();
      return;
    }

    if (action.value === "customer_email") {
      chatInput.placeholder = "Enter the email used for the order...";
      chatInput.focus();
      return;
    }

    const promptMap = {
      order_tracking: "I want to track my order",
      return_request: "I want to return an item",
      exchange_request: "I want to exchange an item",
      refund_query: "I have a refund question",
      shipping_question: "I have a shipping question",
      order_help: "I need help with this order",
      sizing_follow_up: "I need more sizing help",
      order_lookup: "I need help finding my order",
    };

    const prompt = promptMap[action.value] || action.label;
    chatInput.value = prompt;
    chatInput.focus();
  }
}

function renderBotResponse(data, requestContext) {
  const responseMode = frontendModeFromBackend(data.mode);

  if (data.support_mode && activeMode !== "support") {
    setMode("support", { resetConversation: false });
  }

  addMessage(data.reply || "No reply received.", "bot");

  if (!data.support_mode) {
    addDetectedTags(data.detected_tags || []);
  }

  if (data.visual_summary) {
    addVisualSummary(data.visual_summary);
  }

  if (data.gap_analysis) {
    addGapAnalysis(data.gap_analysis);
  }

  if (data.hero_product) {
    addHeroMatch(data.hero_product, data.supporting_items || []);
  } else if (data.recommended_products && data.recommended_products.length) {
    const heading =
      responseMode === "complete" ? "Here’s how I’d complete it" : "Recommended picks";
    addRecommendationCards(data.recommended_products, heading);
  }

  if (data.styling_insights && data.styling_insights.length) {
    addStylingInsights(data.styling_insights);
  }

  if (!data.support_mode && data.decision_prompt && data.decision_options.length) {
    addActionPanel(data.decision_prompt, data.decision_options);
  }

  if (data.support_mode && data.support_actions && data.support_actions.length) {
    addActionPanel("Next steps", data.support_actions);
  } else {
    const refinementActions = [
      ...(data.refinement_actions || []),
      ...(data.swap_actions || []),
    ];
    if (refinementActions.length) {
      addActionPanel("Refine this", refinementActions);
    }
  }

  addValidationNotes(data.validation);
  storeLatestContext(data, requestContext);
}

async function performRequest(requestContext) {
  const typingState = showTypingState(requestContext.mode);

  try {
    const response = await fetch(`${apiBaseUrl}${requestContext.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestContext.payload),
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();
    removeTypingState(typingState);
    renderBotResponse(data, requestContext);
  } catch (error) {
    removeTypingState(typingState);
    addMessage(
      "I’m having trouble reaching the styling service right now. Please try again in a moment.",
      "bot"
    );
  }
}

async function submitImageRequest() {
  if (!pendingImage) {
    addMessage("Please choose an image first so I can analyze it.", "bot");
    return;
  }

  const shopperNote = chatInput.value.trim();
  const payload =
    activeMode === "support"
      ? {
          message: shopperNote || "I need help with this item.",
          mode: backendModes.support,
          customer_id: customerId,
          image_name: pendingImage.name,
          image_base64: pendingImage.dataUrl,
        }
      : {
          image_name: pendingImage.name,
          image_base64: pendingImage.dataUrl,
          shopper_note: shopperNote,
          customer_id: customerId,
        };
  const requestContext = buildRequestContext(
    currentEndpointForMode(activeMode),
    payload,
    activeMode
  );

  addImagePreviewMessage();
  if (shopperNote) {
    addMessage(shopperNote, "user");
  }
  chatInput.value = "";
  clearPendingImage();
  await performRequest(requestContext);
}

async function submitChatRequest() {
  const value = chatInput.value.trim();
  if (!value) {
    return;
  }

  const requestContext = buildRequestContext(
    "/api/chat",
    {
      message: value,
      mode: backendModes[activeMode],
      customer_id: customerId,
    },
    activeMode
  );

  addMessage(value, "user");
  chatInput.value = "";
  await performRequest(requestContext);
}

async function handleFormSubmit(event) {
  event.preventDefault();

  if (isImageMode(activeMode) && pendingImage) {
    await submitImageRequest();
    return;
  }

  await submitChatRequest();
}

function setupVoiceInput() {
  if (!voiceInputButton) {
    return;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    voiceInputButton.disabled = true;
    voiceInputButton.title = "Voice input is not supported in this browser";
    return;
  }

  speechRecognition = new Recognition();
  speechRecognition.lang = "en-US";
  speechRecognition.interimResults = false;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.addEventListener("start", () => {
    voiceInputButton.classList.add("is-listening");
  });

  speechRecognition.addEventListener("end", () => {
    voiceInputButton.classList.remove("is-listening");
  });

  speechRecognition.addEventListener("result", (event) => {
    const transcript = event.results && event.results[0] && event.results[0][0]
      ? event.results[0][0].transcript
      : "";
    if (!transcript) {
      return;
    }
    chatInput.value = transcript;
    chatInput.focus();
  });

  speechRecognition.addEventListener("error", () => {
    voiceInputButton.classList.remove("is-listening");
    addMessage("Voice entry isn’t available just now, but you can keep typing here.", "bot");
  });

  voiceInputButton.addEventListener("click", () => {
    try {
      speechRecognition.start();
    } catch (error) {
      // Ignore duplicate start errors from browsers that keep the recognizer busy momentarily.
    }
  });
}

imageInput.addEventListener("change", async () => {
  const [file] = Array.from(imageInput.files || []);
  if (!file) {
    clearPendingImage();
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    pendingImage = {
      name: file.name,
      dataUrl,
    };
    renderPendingImagePreview();
  } catch (error) {
    clearPendingImage();
    addMessage("I couldn’t read that image. Please try another file.", "bot");
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

chatForm.addEventListener("submit", handleFormSubmit);

async function initializeWidget() {
  renderWidgetLogo({
    brand_name: "StyledGenie",
    assistant_name: defaultAssistantName,
  });
  getUploadPreviewHost();
  setupVoiceInput();
  await loadChatbotCustomization();
  setMode(activeMode);
  startCustomizationRefreshLoop();
}

initializeWidget();
