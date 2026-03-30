const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const imageInput = document.getElementById("imageInput");
const widgetAssistantName = document.getElementById("widgetAssistantName");
const widgetWelcomeTitle = document.getElementById("widgetWelcomeTitle");
const widgetLogo = document.getElementById("widgetLogo");
const modeButtons = document.querySelectorAll(".mode-button");
const uploadCard = document.querySelector(".upload-card");
const helperText = document.querySelector(".helper-text");
const apiBaseUrl = "http://127.0.0.1:8000";
const customerId = "guest-001";
const customizationRefreshIntervalMs = 4000;

let activeMode = "outfit";
let latestRecommendationContext = null;
let latestCustomizationFingerprint = "";
const defaultAssistantName = "StyledGenie AI";
const defaultWelcomeTitle = "Fashion Assistant";

const starterMessages = {
  outfit:
    "I’m ready when you are. Share the occasion, mood, colors, fit, or budget, and I’ll start shaping a look around that.",
  inspire:
    "Send me the image whenever you’re ready, and I’ll translate that feeling into pieces from your catalog.",
  complete:
    "Show me the piece or outfit you’re starting with, and I’ll suggest what brings the whole look together.",
  support:
    "Ask me anything practical like shipping, returns, or sizing and I’ll keep it clear and easy.",
};

const backendModes = {
  outfit: "outfit_curation",
  inspire: "get_inspired",
  complete: "complete_the_look",
  support: "support",
};

const inputPlaceholders = {
  outfit: "Describe the outfit you want...",
  inspire: "Optional note about the inspiration image...",
  complete: "Optional note about the outfit you uploaded...",
  support: "Ask about shipping, returns, or sizing...",
};

const uploadHelpText = {
  inspire: "Upload a fashion image and I will translate that mood into a refined set of pieces from your catalog.",
  complete: "Upload an item or outfit image and I will suggest the pieces that make the look feel complete.",
};

const welcomeContent = {
  outfit: {
    eyebrow: "Your Personal Stylist",
    title: "Let’s build a look that feels like you.",
    body:
      "Tell me the occasion, mood, colors, fit, or budget and I’ll curate pieces that feel thoughtful, flattering, and easy to wear.",
    prompts: [
      "I need a polished dinner look",
      "Style me for a smart casual workday",
      "I want an effortless weekend outfit",
    ],
  },
  inspire: {
    eyebrow: "Style From Inspiration",
    title: "Bring me the image and I’ll decode the vibe.",
    body:
      "Upload a fashion photo, celebrity look, or outfit reference and I’ll pull out the mood, then match it to products in your store.",
    prompts: [
      "Help me recreate this look",
      "Make this feel more elevated",
      "Find similar pieces in the store",
    ],
  },
  complete: {
    eyebrow: "Finish The Look",
    title: "We can turn one great piece into a full outfit.",
    body:
      "Upload an item or outfit photo and I’ll recommend the finishing pieces that make it feel intentional, balanced, and complete.",
    prompts: [
      "What shoes go with this?",
      "Complete this look for evening",
      "Make this feel more polished",
    ],
  },
  support: {
    eyebrow: "Need A Quick Answer?",
    title: "I’m here for the practical details too.",
    body:
      "Ask me about shipping, returns, sizing, or delivery and I’ll give you a clear answer right away.",
    prompts: [
      "What is your return policy?",
      "How long does shipping take in Germany?",
      "Do you ship outside the EU?",
    ],
  },
};

const feedbackActions = [
  {
    type: "love_it",
    label: "Love it",
    acknowledgement: "Lovely. I’ll remember that this direction resonates strongly.",
  },
  {
    type: "show_another_option",
    label: "Show another option",
    acknowledgement: "Absolutely. I’ll remember that you like to compare a few directions before deciding.",
    prompt: "Show me another option for this look",
  },
  {
    type: "make_more_casual",
    label: "Make it more casual",
    acknowledgement: "Noted. I’ll lean more relaxed and effortless in the next round.",
    prompt: "Show me a more casual version of this look",
  },
  {
    type: "change_colours",
    label: "Change colours",
    acknowledgement: "Got it. I’ll keep the shape in mind and explore a different colour story next.",
    prompt: "Show me this look in a different colour story",
  },
  {
    type: "save_for_later",
    label: "Save for later",
    acknowledgement: "Saved as a strong direction. I’ll remember this preference pattern for future recommendations.",
  },
];

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
  refreshVisibleWelcomeState();
}

function getCustomizationFingerprint(customization) {
  return JSON.stringify({
    assistant_name: customization && customization.assistant_name,
    welcome_title: customization && customization.welcome_title,
    welcome_message: customization && customization.welcome_message,
  });
}

function refreshVisibleWelcomeState() {
  const visibleWelcomeCard = chatLog.querySelector(".welcome-card");
  const content = welcomeContent[activeMode];

  if (visibleWelcomeCard && content) {
    const eyebrow = visibleWelcomeCard.querySelector(".welcome-eyebrow");
    const title = visibleWelcomeCard.querySelector(".welcome-title");
    const body = visibleWelcomeCard.querySelector(".welcome-copy");

    if (eyebrow) {
      eyebrow.textContent = content.eyebrow;
    }

    if (title) {
      title.textContent = content.title;
    }

    if (body) {
      body.textContent = content.body;
    }
  }

  if (activeMode === "outfit") {
    const userMessages = chatLog.querySelectorAll(".message.user");
    const botMessages = Array.from(chatLog.querySelectorAll(".message.bot")).filter(
      (node) => !node.classList.contains("typing-message")
    );

    if (userMessages.length === 0 && botMessages.length === 1) {
      botMessages[0].textContent = starterMessages.outfit;
    }
  }
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
    // Keep the widget usable even if customization cannot be loaded.
  }
}

function startCustomizationRefreshLoop() {
  window.setInterval(() => {
    loadChatbotCustomization({ silent: true });
  }, customizationRefreshIntervalMs);
}

const loadingCopy = {
  outfit: "Curating a polished look for you...",
  inspire: "Reading the style mood and matching pieces...",
  complete: "Pulling together the finishing touches...",
  support: "Checking that for you now...",
};

function addMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
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
  chatLog.appendChild(card);
  scrollChatToBottom();
}

function isImageMode(mode) {
  return mode === "inspire" || mode === "complete";
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
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
  chatLog.appendChild(typing);
  scrollChatToBottom();
  return typing;
}

function removeTypingState(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
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

async function addProductToCart(product, button) {
  if (!product.cart_variant_id) {
    addMessage(
      "This product is not cart-ready yet. Run the product card Supabase migration and re-import the Shopify catalog first.",
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

  const parsedVariantId = Number(product.cart_variant_id);
  const cartVariantId = Number.isNaN(parsedVariantId)
    ? product.cart_variant_id
    : parsedVariantId;

  try {
    const response = await fetch(`${cartRoot}cart/add.js`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
      "I could not add that product to the cart just now. Please open the product page and try again there.",
      "bot"
    );
  }
}

function addRecommendationCards(products) {
  if (!products || products.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "recommendation-panel";

  const heading = document.createElement("p");
  heading.className = "recommendation-heading";
  heading.textContent = "Recommended picks";
  panel.appendChild(heading);

  const list = document.createElement("div");
  list.className = "recommendation-list";

  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "recommendation-card";

    const media = document.createElement("div");
    media.className = "recommendation-media";
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

    body.append(topline, title, reason, actions);
    card.append(media, body);
    list.appendChild(card);
  });

  panel.appendChild(list);
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

async function submitFeedback(action, context, button, panel) {
  const buttons = panel.querySelectorAll("button");
  buttons.forEach((item) => {
    item.disabled = true;
  });

  try {
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

    addMessage(action.acknowledgement, "bot");

    if (action.prompt) {
      chatInput.value = action.prompt;
      chatInput.focus();
    }
  } catch (error) {
    buttons.forEach((item) => {
      item.disabled = false;
    });
    addMessage("I couldn’t save that feedback just now, but you can still keep styling with me.", "bot");
  }
}

function addFeedbackActions(context) {
  if (!context || !context.recommendedProductIds || context.recommendedProductIds.length === 0) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "feedback-panel";

  const heading = document.createElement("p");
  heading.className = "feedback-heading";
  heading.textContent = "What would you like to do next?";
  panel.appendChild(heading);

  const actionRow = document.createElement("div");
  actionRow.className = "feedback-action-row";

  feedbackActions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feedback-action";
    button.textContent = action.label;
    button.addEventListener("click", () => submitFeedback(action, context, button, panel));
    actionRow.appendChild(button);
  });

  panel.appendChild(actionRow);
  chatLog.appendChild(panel);
  scrollChatToBottom();
}

function renderBotResponse(data, contextNote) {
  addMessage(data.reply, "bot");
  addDetectedTags(data.detected_tags || []);
  addRecommendationCards(data.recommended_products || []);
  addStylingInsights(data.styling_insights || []);
  latestRecommendationContext =
    data.recommended_products && data.recommended_products.length
      ? {
          mode: backendModes[activeMode],
          contextNote: contextNote || "Recommendation response",
          recommendedProductIds: data.recommended_products.map((item) => item.id),
        }
      : null;
  addFeedbackActions(latestRecommendationContext);
}

function setMode(mode) {
  activeMode = mode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  chatLog.innerHTML = "";
  chatInput.placeholder = inputPlaceholders[mode];

  if (isImageMode(mode)) {
    uploadCard.classList.remove("hidden");
    helperText.textContent = uploadHelpText[mode];
  } else {
    uploadCard.classList.add("hidden");
    imageInput.value = "";
  }

  addWelcomeCard(mode);
  addMessage(starterMessages[mode], "bot");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const value = chatInput.value.trim();

  if (isImageMode(activeMode)) {
    const selectedFile = imageInput.files[0];

    if (!selectedFile) {
      addMessage(
        "Please choose an image first. For the mock version, the backend uses the file name to simulate detection.",
        "bot"
      );
      return;
    }

    const shopperMessage = value
      ? `${value} Image selected: ${selectedFile.name}`
      : `Image selected: ${selectedFile.name}`;

    addMessage(shopperMessage, "user");
    chatInput.value = "";
    const typingState = showTypingState(activeMode);

    try {
      const endpoint = activeMode === "inspire" ? "/api/inspire" : "/api/complete-look";
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_name: selectedFile.name,
          customer_id: customerId,
        }),
      });

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();
      removeTypingState(typingState);
      renderBotResponse(data, shopperMessage);
      imageInput.value = "";
      return;
    } catch (error) {
      removeTypingState(typingState);
      addMessage(
        "I’m having trouble reaching the styling service right now. Please try again in a moment.",
        "bot"
      );
      return;
    }
  }

  if (!value) {
    return;
  }

  addMessage(value, "user");
  chatInput.value = "";
  const typingState = showTypingState(activeMode);

  try {
    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: value,
        mode: backendModes[activeMode],
        customer_id: customerId,
      }),
    });

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    const data = await response.json();
    removeTypingState(typingState);
    renderBotResponse(data, value);
  } catch (error) {
    removeTypingState(typingState);
    addMessage(
      "I’m having trouble reaching the styling service right now. Please try again in a moment.",
      "bot"
    );
  }
});

async function initializeWidget() {
  renderWidgetLogo({
    brand_name: "StyledGenie",
    assistant_name: defaultAssistantName,
  });
  await loadChatbotCustomization();
  setMode(activeMode);
  startCustomizationRefreshLoop();
}

initializeWidget();
