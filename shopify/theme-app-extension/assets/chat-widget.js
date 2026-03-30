(function () {
  const root = document.getElementById("styledgenie-chat-root");
  if (!root) {
    return;
  }

  const apiBase = root.dataset.apiBase || "http://127.0.0.1:8000";
  const customizationRefreshIntervalMs = 4000;
  const cartRoot =
    root.dataset.cartRoot ||
    ((window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/");
  const customerId = "shopify-storefront-guest";
  let activeMode = "outfit_curation";
  let latestRecommendationContext = null;
  let latestCustomizationFingerprint = "";
  const defaultAssistantName = "StyledGenie AI";
  const defaultWelcomeTitle = "Outfits, inspiration, complete-the-look, and support.";

  const welcomeContent = {
    outfit_curation: {
      eyebrow: "Your Personal Stylist",
      title: "Let’s create a look that feels beautifully right for you.",
      body:
        "Tell me the occasion, mood, fit, colors, or budget and I’ll guide you toward pieces that feel polished and personal.",
      prompts: [
        "I need a polished dinner look",
        "Style me for a smart casual day",
        "I want an easy weekend outfit",
      ],
    },
    get_inspired: {
      eyebrow: "Style Inspiration",
      title: "Upload a look you love and I’ll decode the mood.",
      body:
        "I’ll turn your inspiration image into a wearable direction using pieces available in this store.",
      prompts: [
        "Help me recreate this look",
        "Make this vibe more elevated",
        "Find similar pieces for me",
      ],
    },
    complete_the_look: {
      eyebrow: "Complete The Look",
      title: "One great piece is enough to build from.",
      body:
        "Upload an item or outfit and I’ll suggest the finishing touches that make the whole look feel intentional.",
      prompts: [
        "What shoes go with this?",
        "Complete this for evening",
        "Make this feel more polished",
      ],
    },
    support: {
      eyebrow: "Quick Support",
      title: "I’m here for the practical details too.",
      body:
        "Ask me about shipping, returns, delivery, or sizing and I’ll keep it simple and clear.",
      prompts: [
        "What is your return policy?",
        "How long does shipping take?",
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

  const loadingCopy = {
    outfit_curation: "Curating a polished look for you...",
    get_inspired: "Reading the style mood and matching pieces...",
    complete_the_look: "Pulling together the finishing touches...",
    support: "Checking that for you now...",
  };

  root.innerHTML = `
    <div class="styledgenie-launcher">
      <div class="styledgenie-header">
        <div class="styledgenie-brand-lockup">
          <div class="styledgenie-logo" id="styledgenie-logo" aria-hidden="true"></div>
          <div class="styledgenie-header-copy">
            <h3 id="styledgenie-assistant-name">StyledGenie AI</h3>
            <p id="styledgenie-welcome-title">Outfits, inspiration, complete-the-look, and support.</p>
          </div>
        </div>
      </div>
      <div class="styledgenie-body">
        <div class="styledgenie-actions">
          <button data-mode="outfit_curation">Outfits</button>
          <button data-mode="get_inspired">Inspiration</button>
          <button data-mode="complete_the_look">Complete Look</button>
          <button data-mode="support">Support</button>
        </div>
        <div class="styledgenie-messages" id="styledgenie-messages"></div>
        <div class="styledgenie-upload hidden">
          <label for="styledgenie-image">Optional image</label>
          <input id="styledgenie-image" type="file" accept="image/*" />
        </div>
        <form class="styledgenie-form" id="styledgenie-form">
          <input id="styledgenie-input" type="text" placeholder="Ask for a look or a support answer..." />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  `;

  const messages = root.querySelector("#styledgenie-messages");
  const form = root.querySelector("#styledgenie-form");
  const input = root.querySelector("#styledgenie-input");
  const imageInput = root.querySelector("#styledgenie-image");
  const logoNode = root.querySelector("#styledgenie-logo");
  const assistantNameNode = root.querySelector("#styledgenie-assistant-name");
  const welcomeTitleNode = root.querySelector("#styledgenie-welcome-title");
  const uploadSection = root.querySelector(".styledgenie-upload");
  const modeButtons = root.querySelectorAll("[data-mode]");
  if (modeButtons[0]) {
    modeButtons[0].classList.add("active");
  }

  function addMessage(text, role) {
    const item = document.createElement("div");
    item.className = `styledgenie-message ${role}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function applyChatbotCustomization(customization) {
    if (!customization) {
      return;
    }

    const assistantName = customization.assistant_name || defaultAssistantName;
    const welcomeTitle = customization.welcome_title || defaultWelcomeTitle;
    const welcomeMessage =
      customization.welcome_message || welcomeContent.outfit_curation.body;
    const brandName =
      customization.brand_name || customization.assistant_name || defaultAssistantName;

    assistantNameNode.textContent = assistantName;
    welcomeTitleNode.textContent = welcomeTitle;

    if (logoNode) {
      logoNode.innerHTML = "";

      if (customization.logo_url) {
        const image = document.createElement("img");
        image.src = customization.logo_url;
        image.alt = `${brandName} logo`;
        image.loading = "lazy";
        logoNode.appendChild(image);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "styledgenie-logo-fallback";
        fallback.textContent = getBrandInitials(brandName);
        logoNode.appendChild(fallback);
      }
    }

    welcomeContent.outfit_curation.eyebrow = assistantName;
    welcomeContent.outfit_curation.title = welcomeTitle;
    welcomeContent.outfit_curation.body = welcomeMessage;
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
    const visibleWelcomeCard = messages.querySelector(".styledgenie-welcome");
    const content = welcomeContent[activeMode];

    if (visibleWelcomeCard && content) {
      const eyebrow = visibleWelcomeCard.querySelector(".styledgenie-welcome-eyebrow");
      const title = visibleWelcomeCard.querySelector(".styledgenie-welcome-title");
      const body = visibleWelcomeCard.querySelector(".styledgenie-welcome-copy");

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

    if (activeMode === "outfit_curation") {
      const userMessages = messages.querySelectorAll(".styledgenie-message.user");
      const botMessages = Array.from(messages.querySelectorAll(".styledgenie-message.bot")).filter(
        (node) => !node.classList.contains("styledgenie-typing")
      );

      if (userMessages.length === 0 && botMessages.length === 1) {
        botMessages[0].textContent = welcomeContent.outfit_curation.body;
      }
    }
  }

  async function loadChatbotCustomization(options = {}) {
    const { silent = false } = options;

    try {
      const response = await fetch(`${apiBase}/api/merchant/workspace`);
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
      // Keep storefront widget usable even if merchant customization is unavailable.
    }
  }

  function startCustomizationRefreshLoop() {
    window.setInterval(() => {
      loadChatbotCustomization({ silent: true });
    }, customizationRefreshIntervalMs);
  }

  function addWelcomeCard(mode) {
    const content = welcomeContent[mode];
    if (!content) {
      return;
    }

    const card = document.createElement("section");
    card.className = "styledgenie-welcome";

    const eyebrow = document.createElement("p");
    eyebrow.className = "styledgenie-welcome-eyebrow";
    eyebrow.textContent = content.eyebrow;

    const title = document.createElement("h4");
    title.className = "styledgenie-welcome-title";
    title.textContent = content.title;

    const body = document.createElement("p");
    body.className = "styledgenie-welcome-copy";
    body.textContent = content.body;

    const row = document.createElement("div");
    row.className = "styledgenie-prompt-row";

    content.prompts.forEach((prompt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "styledgenie-prompt";
      chip.textContent = prompt;
      chip.addEventListener("click", () => {
        input.value = prompt;
        input.focus();
      });
      row.appendChild(chip);
    });

    card.append(eyebrow, title, body, row);
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
  }

  function isImageMode() {
    return activeMode === "get_inspired" || activeMode === "complete_the_look";
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

  function showTypingState(mode) {
    const item = document.createElement("div");
    item.className = "styledgenie-message bot styledgenie-typing";
    item.dataset.typing = "true";

    const dots = document.createElement("span");
    dots.className = "styledgenie-typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    const text = document.createElement("span");
    text.className = "styledgenie-typing-copy";
    text.textContent = loadingCopy[mode] || "Thinking through the best options...";

    item.append(dots, text);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function removeTypingState(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function renderDetectedTags(tags) {
    if (!tags || tags.length === 0) {
      return;
    }

    const row = document.createElement("div");
    row.className = "styledgenie-tag-row";

    tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "styledgenie-tag";
      pill.textContent = tag;
      row.appendChild(pill);
    });

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function buildImageTile(product) {
    if (product.image_url) {
      const image = document.createElement("img");
      image.className = "styledgenie-card-image";
      image.src = product.image_url;
      image.alt = product.title;
      image.loading = "lazy";
      return image;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "styledgenie-card-placeholder";
    placeholder.textContent = (product.category || "Style").slice(0, 14);
    return placeholder;
  }

  function buildCartAttributionProperties(product) {
    return {
      _sg_assisted: "true",
      _sg_flow: (latestRecommendationContext && latestRecommendationContext.mode) || activeMode,
      _sg_customer_id: customerId,
      _sg_product_id: product.id,
      _sg_source: "styledgenie_shopify_widget",
      _sg_timestamp: new Date().toISOString(),
    };
  }

  async function addProductToCart(product, button) {
    if (!product.cart_variant_id) {
      addMessage(
        "This product is missing a cart-ready variant. Run the product-card migration and import again.",
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
      addMessage("I could not add that item right now. Please open the product page and try there.", "bot");
    }
  }

  function renderRecommendations(products) {
    if (!products || products.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-card-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-card-heading";
    heading.textContent = "Recommended picks";
    panel.appendChild(heading);

    const list = document.createElement("div");
    list.className = "styledgenie-card-list";

    products.forEach((product) => {
      const card = document.createElement("article");
      card.className = "styledgenie-card";

      const media = document.createElement("div");
      media.className = "styledgenie-card-media";
      media.appendChild(buildImageTile(product));

      const body = document.createElement("div");
      body.className = "styledgenie-card-body";

      const topline = document.createElement("div");
      topline.className = "styledgenie-card-topline";

      const category = document.createElement("span");
      category.textContent = product.category || "Catalog pick";

      const price = document.createElement("span");
      price.textContent = formatPrice(product.price);

      topline.append(category, price);

      const title = document.createElement("h4");
      title.className = "styledgenie-card-title";
      title.textContent = product.title;

      const reason = document.createElement("p");
      reason.className = "styledgenie-card-reason";
      reason.textContent = product.reason;

      const actions = document.createElement("div");
      actions.className = "styledgenie-card-actions";

      if (product.product_url) {
        const link = document.createElement("a");
        link.className = "styledgenie-secondary";
        link.href = product.product_url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "View Product";
        actions.appendChild(link);
      }

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "styledgenie-primary";
      addButton.textContent = "Add to Cart";
      addButton.disabled = !product.cart_variant_id;
      addButton.addEventListener("click", () => addProductToCart(product, addButton));
      actions.appendChild(addButton);

      body.append(topline, title, reason, actions);
      card.append(media, body);
      list.appendChild(card);
    });

    panel.appendChild(list);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderStylingInsights(insights) {
    if (!insights || insights.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-insight-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-insight-heading";
    heading.textContent = "Why this works";
    panel.appendChild(heading);

    const list = document.createElement("div");
    list.className = "styledgenie-insight-list";

    insights.forEach((insight) => {
      const item = document.createElement("article");
      item.className = "styledgenie-insight-item";

      const icon = document.createElement("div");
      icon.className = "styledgenie-insight-icon";
      icon.textContent = "✓";

      const copy = document.createElement("div");
      copy.className = "styledgenie-insight-copy";

      const title = document.createElement("p");
      title.className = "styledgenie-insight-title";
      title.textContent = insight.title;

      const detail = document.createElement("p");
      detail.className = "styledgenie-insight-detail";
      detail.textContent = insight.detail;

      copy.append(title, detail);
      item.append(icon, copy);
      list.appendChild(item);
    });

    panel.appendChild(list);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  async function submitFeedback(action, context, panel) {
    const buttons = panel.querySelectorAll("button");
    buttons.forEach((item) => {
      item.disabled = true;
    });

    try {
      const response = await fetch(`${apiBase}/api/feedback`, {
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
        input.value = action.prompt;
        input.focus();
      }
    } catch (error) {
      buttons.forEach((item) => {
        item.disabled = false;
      });
      addMessage("I couldn’t save that feedback just now, but we can keep styling together.", "bot");
    }
  }

  function renderFeedbackActions(context) {
    if (!context || !context.recommendedProductIds || context.recommendedProductIds.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-feedback-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-feedback-heading";
    heading.textContent = "What would you like to do next?";
    panel.appendChild(heading);

    const row = document.createElement("div");
    row.className = "styledgenie-feedback-row";

    feedbackActions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "styledgenie-feedback-button";
      button.textContent = action.label;
      button.addEventListener("click", () => submitFeedback(action, context, panel));
      row.appendChild(button);
    });

    panel.appendChild(row);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderAssistantResponse(data, contextNote) {
    addMessage(data.reply || "No reply received.", "bot");
    renderDetectedTags(data.detected_tags || []);
    renderRecommendations(data.recommended_products || []);
    renderStylingInsights(data.styling_insights || []);
    latestRecommendationContext =
      data.recommended_products && data.recommended_products.length
        ? {
            mode: activeMode,
            contextNote: contextNote || "Recommendation response",
            recommendedProductIds: data.recommended_products.map((item) => item.id),
          }
        : null;
    renderFeedbackActions(latestRecommendationContext);
  }

  async function sendRequest(message, contextNote) {
    try {
      let response;

      if (isImageMode() && imageInput.files[0]) {
        const endpoint = activeMode === "get_inspired" ? "/api/inspire" : "/api/complete-look";
        response = await fetch(`${apiBase}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_name: imageInput.files[0].name,
            customer_id: customerId,
          }),
        });
      } else {
        response = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            mode: activeMode,
            customer_id: customerId,
          }),
        });
      }

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
      const data = await response.json();
      renderAssistantResponse(data, contextNote);
      imageInput.value = "";
    } catch (error) {
      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
      addMessage("I’m having trouble reaching the styling service right now. Please try again in a moment.", "bot");
    }
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeMode = button.dataset.mode;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      uploadSection.classList.toggle("hidden", !isImageMode());
      messages.innerHTML = "";
      addWelcomeCard(activeMode);
      addMessage(welcomeContent[activeMode].body, "bot");
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const value = input.value.trim();
    if (!value && !(isImageMode() && imageInput.files[0])) {
      return;
    }

    if (isImageMode() && imageInput.files[0]) {
      const shopperMessage = value
        ? `${value} Image selected: ${imageInput.files[0].name}`
        : `Image selected: ${imageInput.files[0].name}`;
      addMessage(shopperMessage, "user");
      root._styledgenieLastContextNote = shopperMessage;
    } else {
      addMessage(value, "user");
      root._styledgenieLastContextNote = value;
    }

    input.value = "";
    root._styledgenieTypingNode = showTypingState(activeMode);
    sendRequest(value, root._styledgenieLastContextNote);
  });

  async function initializeWidget() {
    applyChatbotCustomization({
      brand_name: "StyledGenie",
      assistant_name: defaultAssistantName,
      welcome_title: defaultWelcomeTitle,
    });
    await loadChatbotCustomization();
    addWelcomeCard(activeMode);
    addMessage(welcomeContent[activeMode].body, "bot");
    startCustomizationRefreshLoop();
  }

  initializeWidget();
})();
