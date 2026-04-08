(function () {
  const root = document.getElementById("styledgenie-chat-root");
  if (!root) {
    return;
  }

  const apiBase = root.dataset.apiBase || "http://127.0.0.1:8000";
  const cartRoot =
    root.dataset.cartRoot ||
    ((window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/");
  const customerId = "shopify-storefront-guest";
  const customizationRefreshIntervalMs = 4000;
  const defaultAssistantName = "StyledGenie AI";
  const defaultWelcomeTitle = "Outfits, inspiration, complete-the-look, and support.";
  const recognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
      ? new (window.SpeechRecognition || window.webkitSpeechRecognition)()
      : null;

  let activeMode = "outfit_curation";
  let latestRecommendationContext = null;
  let latestCustomizationFingerprint = "";
  let pendingImageAsset = null;

  const welcomeContent = {
    outfit_curation: {
      eyebrow: "Your Personal Stylist",
      title: "Let’s create a look that feels beautifully right for you.",
      body:
        "Tell me the occasion, mood, fit, colors, or budget and I’ll guide you toward pieces that feel polished and personal.",
      prompts: [
        "I need something easy for dinner tonight under €150.",
        "Style me for a smart casual day",
        "I want an easy weekend outfit",
      ],
    },
    get_inspired: {
      eyebrow: "Style Inspiration",
      title: "Upload a look you love and I’ll decode the mood.",
      body:
        "I’ll identify the hero piece first, then match it to the closest product in this store and build the rest around it.",
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
        "Upload an item or outfit and I’ll suggest only the missing pieces that make the whole look feel intentional.",
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
        "Ask me about shipping, returns, delivery, damage, or sizing and I’ll keep it action-focused and clear.",
      prompts: [
        "I want to track my order",
        "What is your return policy?",
        "Can you help with sizing?",
      ],
    },
  };

  root.innerHTML = `
    <div class="styledgenie-launcher">
      <div class="styledgenie-header">
        <div class="styledgenie-brand-lockup">
          <div class="styledgenie-logo" id="styledgenie-logo" aria-hidden="true"></div>
          <div class="styledgenie-header-copy">
            <h3 id="styledgenie-assistant-name">StyledGenie AI</h3>
            <p id="styledgenie-welcome-title">${defaultWelcomeTitle}</p>
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
          <div class="styledgenie-upload-toolbar">
            <label class="styledgenie-upload-trigger" for="styledgenie-image">
              <span class="styledgenie-upload-plus">+</span>
              <span>
                <strong>Add photo</strong>
                <small>Camera or upload</small>
              </span>
            </label>
            <p class="styledgenie-upload-copy" id="styledgenie-upload-copy"></p>
          </div>
          <input id="styledgenie-image" class="styledgenie-upload-input" type="file" accept="image/*" capture="environment" />
          <div id="styledgenie-image-preview"></div>
        </div>
        <form class="styledgenie-form" id="styledgenie-form">
          <button type="button" class="styledgenie-icon-button" id="styledgenie-voice" aria-label="Use voice input">
            <span aria-hidden="true">🎤</span>
          </button>
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
  const imagePreview = root.querySelector("#styledgenie-image-preview");
  const uploadSection = root.querySelector(".styledgenie-upload");
  const uploadCopy = root.querySelector("#styledgenie-upload-copy");
  const logoNode = root.querySelector("#styledgenie-logo");
  const assistantNameNode = root.querySelector("#styledgenie-assistant-name");
  const welcomeTitleNode = root.querySelector("#styledgenie-welcome-title");
  const modeButtons = Array.from(root.querySelectorAll("[data-mode]"));
  const voiceButton = root.querySelector("#styledgenie-voice");
  if (modeButtons[0]) {
    modeButtons[0].classList.add("active");
  }

  const loadingCopy = {
    outfit_curation: "Curating a polished look for you...",
    get_inspired: "Reading the style mood and matching pieces...",
    complete_the_look: "Pulling together the finishing touches...",
    support: "Checking that for you now...",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(text, role) {
    const item = document.createElement("div");
    item.className = `styledgenie-message ${role}`;
    item.textContent = text;
    messages.appendChild(item);
    scrollToBottom();
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
    scrollToBottom();
    return item;
  }

  function removeTypingState(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function setUploadHint() {
    if (!uploadCopy) {
      return;
    }
    uploadCopy.textContent =
      activeMode === "get_inspired"
        ? "Upload inspiration and tap Analyze now to match the hero piece first."
        : activeMode === "complete_the_look"
          ? "Upload what you are wearing and tap Analyze now to complete only what is missing."
          : "Upload a damage or wrong-item photo when needed and I’ll keep the support flow action-based.";
  }

  function updateUploadVisibility() {
    const isImageMode =
      activeMode === "get_inspired" || activeMode === "complete_the_look" || activeMode === "support";
    uploadSection.classList.toggle("hidden", !isImageMode);
    setUploadHint();
    if (!isImageMode) {
      imageInput.value = "";
      pendingImageAsset = null;
      imagePreview.innerHTML = "";
    }
  }

  function renderWidgetLogo(customization) {
    if (!logoNode) {
      return;
    }
    const brandName = customization.brand_name || customization.assistant_name || defaultAssistantName;
    logoNode.innerHTML = "";
    if (customization.logo_url) {
      const image = document.createElement("img");
      image.src = customization.logo_url;
      image.alt = `${brandName} logo`;
      image.loading = "lazy";
      logoNode.appendChild(image);
      return;
    }
    const fallback = document.createElement("span");
    fallback.className = "styledgenie-logo-fallback";
    fallback.textContent = getBrandInitials(brandName);
    logoNode.appendChild(fallback);
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
    renderWidgetLogo({
      ...customization,
      brand_name: brandName,
    });

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
      if (eyebrow) eyebrow.textContent = content.eyebrow;
      if (title) title.textContent = content.title;
      if (body) body.textContent = content.body;
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
    if (!content) return;
    const card = document.createElement("section");
    card.className = "styledgenie-welcome";
    card.innerHTML = `
      <p class="styledgenie-welcome-eyebrow">${escapeHtml(content.eyebrow)}</p>
      <h4 class="styledgenie-welcome-title">${escapeHtml(content.title)}</h4>
      <p class="styledgenie-welcome-copy">${escapeHtml(content.body)}</p>
      <div class="styledgenie-prompt-row">
        ${content.prompts
          .map((prompt) => `<button type="button" class="styledgenie-prompt">${escapeHtml(prompt)}</button>`)
          .join("")}
      </div>
    `;
    card.querySelectorAll(".styledgenie-prompt").forEach((chip, index) => {
      chip.addEventListener("click", () => {
        input.value = content.prompts[index];
        input.focus();
      });
    });
    messages.appendChild(card);
    scrollToBottom();
  }

  function buildImagePreview() {
    if (!pendingImageAsset) {
      imagePreview.innerHTML = "";
      return;
    }
    imagePreview.innerHTML = `
      <div class="styledgenie-image-preview-card">
        <img src="${escapeHtml(pendingImageAsset.previewUrl)}" alt="${escapeHtml(pendingImageAsset.name)}" />
        <div class="styledgenie-preview-meta">
          <div>
            <p class="styledgenie-preview-title">${escapeHtml(pendingImageAsset.name)}</p>
            <p class="styledgenie-preview-copy">Ready when you are — tap Analyze now and I’ll work from the image first.</p>
          </div>
          <button type="button" class="styledgenie-primary" id="styledgenie-analyze-image">Analyze now</button>
        </div>
      </div>
    `;
    const analyzeButton = imagePreview.querySelector("#styledgenie-analyze-image");
    if (analyzeButton) {
      analyzeButton.addEventListener("click", () => submitCurrentFlow({ forceImage: true }));
    }
  }

  function buildImageTile(product) {
    if (product.image_url) {
      return `<img class="styledgenie-card-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}" loading="lazy" />`;
    }
    return `<div class="styledgenie-card-placeholder">${escapeHtml((product.category || "Style").slice(0, 14))}</div>`;
  }

  function createProductCard(product, compact = false) {
    return `
      <article class="styledgenie-card${compact ? " compact" : ""}" data-product-id="${escapeHtml(product.id)}">
        <div class="styledgenie-card-media">${buildImageTile(product)}</div>
        <div class="styledgenie-card-body">
          <div class="styledgenie-card-topline">
            <span>${escapeHtml(product.slot_label || product.category || "Catalog pick")}</span>
            <span>${escapeHtml(formatPrice(product.price))}</span>
          </div>
          <h4 class="styledgenie-card-title">${escapeHtml(product.title)}</h4>
          <p class="styledgenie-card-reason">${escapeHtml(product.reason || "Strong match from the live catalog.")}</p>
          <div class="styledgenie-card-actions">
            ${
              product.product_url
                ? `<a class="styledgenie-secondary" href="${escapeHtml(product.product_url)}" target="_blank" rel="noreferrer">View Product</a>`
                : ""
            }
            <button type="button" class="styledgenie-primary" data-action="add-to-cart" data-product-id="${escapeHtml(
              product.id
            )}" ${product.cart_variant_id ? "" : "disabled"}>Add to Cart</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderDetectedTags(tags) {
    if (!tags || !tags.length) {
      return;
    }
    const row = document.createElement("div");
    row.className = "styledgenie-tag-row";
    row.innerHTML = tags
      .map((tag) => `<span class="styledgenie-tag">${escapeHtml(tag)}</span>`)
      .join("");
    messages.appendChild(row);
    scrollToBottom();
  }

  function renderDecisionPrompt(data) {
    if (!data.decision_prompt || !data.decision_options || !data.decision_options.length) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "styledgenie-decision-panel";
    panel.innerHTML = `
      <p class="styledgenie-decision-heading">${escapeHtml(data.decision_prompt)}</p>
      <div class="styledgenie-action-chip-row">
        ${data.decision_options
          .map(
            (item) => `
              <button type="button" class="styledgenie-action-chip" data-action="decision" data-value="${escapeHtml(
                item.value || item.key
              )}">
                ${escapeHtml(item.label)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
    panel.querySelectorAll("[data-action='decision']").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value || "";
        submitCurrentFlow({ decisionPreference: value });
      });
    });
    messages.appendChild(panel);
    scrollToBottom();
  }

  function renderVisualSummary(data) {
    if (!data.visual_summary && !data.gap_analysis) {
      return;
    }
    const visual = data.visual_summary || {};
    const gap = data.gap_analysis || {};
    const panel = document.createElement("section");
    panel.className = "styledgenie-analysis-panel";
    panel.innerHTML = `
      <p class="styledgenie-support-panel-title">Image-first summary</p>
      <p class="styledgenie-analysis-note">
        ${
          visual.anchor_item
            ? `I’m building this around ${escapeHtml(visual.anchor_item)}.`
            : "I’ve read the image first and pulled out the strongest styling cues."
        }
      </p>
      <div class="styledgenie-analysis-grid">
        ${
          visual.anchor_item || visual.style_direction || (visual.color_palette || []).length
            ? `
              <article class="styledgenie-analysis-card">
                <h4>What I’m seeing</h4>
                <ul class="styledgenie-analysis-inline-list">
                  ${visual.anchor_item ? `<li>Anchor: ${escapeHtml(visual.anchor_item)}</li>` : ""}
                  ${visual.style_direction ? `<li>Direction: ${escapeHtml(visual.style_direction)}</li>` : ""}
                  ${
                    (visual.color_palette || []).length
                      ? `<li>Palette: ${escapeHtml((visual.color_palette || []).join(", "))}</li>`
                      : ""
                  }
                  ${visual.framing ? `<li>Framing: ${escapeHtml(visual.framing)}</li>` : ""}
                </ul>
              </article>
            `
            : ""
        }
        ${
          (gap.present || []).length || (gap.missing || []).length
            ? `
              <article class="styledgenie-analysis-card">
                <h4>What’s missing</h4>
                <ul class="styledgenie-analysis-list">
                  ${(gap.present || []).length ? `<li>Already there: ${escapeHtml((gap.present || []).join(", "))}</li>` : ""}
                  ${(gap.missing || []).length ? `<li>Still needed: ${escapeHtml((gap.missing || []).join(", "))}</li>` : ""}
                </ul>
              </article>
            `
            : ""
        }
      </div>
    `;
    messages.appendChild(panel);
    scrollToBottom();
  }

  function renderHeroAndRecommendations(data) {
    if (data.hero_product) {
      const heroPanel = document.createElement("section");
      heroPanel.className = "styledgenie-hero-panel";
      heroPanel.innerHTML = `
        <p class="styledgenie-hero-panel-title">Closest main match</p>
        ${createProductCard(data.hero_product)}
      `;
      messages.appendChild(heroPanel);
    }

    const supportingItems = data.supporting_items || [];
    const recommendationItems = data.hero_product ? supportingItems : data.recommended_products || [];
    if (!recommendationItems.length) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-card-panel";
    panel.innerHTML = `
      <p class="styledgenie-card-heading">${
        data.hero_product ? "You might pair with" : "Recommended picks"
      }</p>
      <div class="styledgenie-card-list${data.hero_product ? " styledgenie-supporting-strip" : ""}">
        ${recommendationItems
          .map((product) => createProductCard(product, Boolean(data.hero_product)))
          .join("")}
      </div>
    `;
    messages.appendChild(panel);
    panel.querySelectorAll("[data-action='add-to-cart']").forEach((button) => {
      button.addEventListener("click", () => {
        const productId = button.dataset.productId;
        const product = (data.recommended_products || []).find((item) => item.id === productId) ||
          (data.supporting_items || []).find((item) => item.id === productId) ||
          (data.hero_product && data.hero_product.id === productId ? data.hero_product : null);
        if (product) {
          addProductToCart(product, button);
        }
      });
    });
    scrollToBottom();
  }

  function renderStylingInsights(insights) {
    if (!insights || !insights.length) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "styledgenie-insight-panel";
    panel.innerHTML = `
      <p class="styledgenie-insight-heading">Why this works</p>
      <div class="styledgenie-insight-list">
        ${insights
          .map(
            (insight) => `
              <article class="styledgenie-insight-item">
                <div class="styledgenie-insight-icon">✓</div>
                <div class="styledgenie-insight-copy">
                  <p class="styledgenie-insight-title">${escapeHtml(insight.title)}</p>
                  <p class="styledgenie-insight-detail">${escapeHtml(insight.detail)}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
    messages.appendChild(panel);
    scrollToBottom();
  }

  function renderSupportActions(data) {
    if (!data.support_actions || !data.support_actions.length) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "styledgenie-support-panel";
    panel.innerHTML = `
      <p class="styledgenie-support-panel-title">Next actions</p>
      <div class="styledgenie-action-chip-row">
        ${data.support_actions
          .map((action) =>
            action.action_type === "link"
              ? `<a class="styledgenie-action-chip styledgenie-link-chip" href="${escapeHtml(
                  action.value || "#"
                )}" target="_blank" rel="noreferrer">${escapeHtml(action.label)}</a>`
              : `<button type="button" class="styledgenie-action-chip" data-action="${escapeHtml(
                  action.action_type || "support"
                )}" data-value="${escapeHtml(action.value || action.key)}">${escapeHtml(action.label)}</button>`
          )
          .join("")}
      </div>
    `;
    panel.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.value || button.textContent || "";
        input.focus();
      });
    });
    messages.appendChild(panel);
    scrollToBottom();
  }

  function renderActionChips(title, actions, actionType) {
    if (!actions || !actions.length) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "styledgenie-feedback-panel";
    panel.innerHTML = `
      <p class="styledgenie-feedback-heading">${escapeHtml(title)}</p>
      <div class="styledgenie-feedback-row">
        ${actions
          .map(
            (action) => `
              <button type="button" class="styledgenie-feedback-button" data-action="${escapeHtml(
                actionType
              )}" data-value="${escapeHtml(action.value || action.key)}">
                ${escapeHtml(action.label)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
    panel.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (actionType === "swap") {
          submitCurrentFlow({ swapCategory: button.dataset.value || "" });
        } else {
          input.value = button.dataset.value || button.textContent || "";
          input.focus();
        }
      });
    });
    messages.appendChild(panel);
    scrollToBottom();
  }

  function renderValidationNotes(data) {
    if (!data.validation || !data.validation.notes || !data.validation.notes.length) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "styledgenie-support-panel";
    panel.innerHTML = `
      <p class="styledgenie-support-panel-title">Quality checks</p>
      <p class="styledgenie-support-copy">${escapeHtml(data.validation.notes.join(" "))}</p>
    `;
    messages.appendChild(panel);
    scrollToBottom();
  }

  function updateRecommendationContext(data, userMessage) {
    const products = data.hero_product
      ? [data.hero_product, ...(data.supporting_items || [])]
      : data.recommended_products || [];
    latestRecommendationContext = products.length
      ? {
          mode: data.mode || activeMode,
          contextNote: userMessage || "Recommendation response",
          recommendedProducts: products,
          recommendedProductIds: products.map((item) => item.id),
        }
      : null;
  }

  function renderAssistantResponse(data, contextNote) {
    addMessage(data.reply || "No reply received.", "bot");
    updateRecommendationContext(data, contextNote);
    if (data.support_mode) {
      renderSupportActions(data);
      renderValidationNotes(data);
      return;
    }
    renderDecisionPrompt(data);
    renderDetectedTags(data.detected_tags || []);
    renderVisualSummary(data);
    renderHeroAndRecommendations(data);
    renderStylingInsights(data.styling_insights || []);
    renderActionChips("Refine this", data.refinement_actions, "refine");
    renderActionChips("Smart swap", data.swap_actions, "swap");
    renderValidationNotes(data);
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

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Image preview failed"));
          return;
        }
        resolve(reader.result);
      });
      reader.addEventListener("error", () => reject(reader.error || new Error("Image preview failed")));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelection(file) {
    if (!file) {
      pendingImageAsset = null;
      imagePreview.innerHTML = "";
      return;
    }
    const previewUrl = await fileToBase64(file);
    pendingImageAsset = {
      file,
      name: file.name,
      previewUrl,
      imageBase64: previewUrl,
    };
    buildImagePreview();
  }

  async function sendRequest(payload, endpoint) {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Backend request failed");
    }
    return response.json();
  }

  function currentLockedProductIds() {
    return latestRecommendationContext
      ? latestRecommendationContext.recommendedProducts.map((item) => item.id)
      : [];
  }

  async function submitCurrentFlow(options = {}) {
    const value = input.value.trim();
    const isImageMode =
      activeMode === "get_inspired" || activeMode === "complete_the_look" || activeMode === "support";
    const forceImage = Boolean(options.forceImage);
    if (!value && !(isImageMode && pendingImageAsset)) {
      return;
    }

    const userMessage = value || (pendingImageAsset ? `Image selected: ${pendingImageAsset.name}` : "");
    addMessage(userMessage, "user");
    input.value = "";
    const typingNode = showTypingState(activeMode);

    try {
      let data;
      if (isImageMode && (pendingImageAsset || forceImage)) {
        const payload =
          activeMode === "support"
            ? {
                message: value || "I need help with this item.",
                mode: "support",
                customer_id: customerId,
                image_name: pendingImageAsset ? pendingImageAsset.name : "uploaded-image",
                image_base64: pendingImageAsset ? pendingImageAsset.imageBase64 : null,
              }
            : {
                image_name: pendingImageAsset ? pendingImageAsset.name : "uploaded-image",
                image_base64: pendingImageAsset ? pendingImageAsset.imageBase64 : null,
                shopper_note: value || null,
                customer_id: customerId,
                decision_preference: options.decisionPreference || null,
                swap_category: options.swapCategory || null,
                locked_product_ids: currentLockedProductIds(),
                excluded_product_ids: [],
              };
        data = await sendRequest(
          payload,
          activeMode === "get_inspired"
            ? "/api/inspire"
            : activeMode === "complete_the_look"
              ? "/api/complete-look"
              : "/api/chat"
        );
      } else {
        data = await sendRequest(
          {
            message: value,
            mode: activeMode,
            customer_id: customerId,
            decision_preference: options.decisionPreference || null,
            swap_category: options.swapCategory || null,
            locked_product_ids: currentLockedProductIds(),
            excluded_product_ids: [],
          },
          "/api/chat"
        );
      }

      removeTypingState(typingNode);
      renderAssistantResponse(data, userMessage);
      if (isImageMode) {
        imageInput.value = "";
        pendingImageAsset = null;
        imagePreview.innerHTML = "";
      }
    } catch (error) {
      removeTypingState(typingNode);
      addMessage("I’m having trouble reaching the styling service right now. Please try again in a moment.", "bot");
    }
  }

  function setMode(nextMode) {
    activeMode = nextMode;
    modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === nextMode);
    });
    messages.innerHTML = "";
    input.placeholder =
      activeMode === "support"
        ? "Ask about shipping, returns, tracking, or sizing..."
        : activeMode === "get_inspired"
          ? "Optional note about the inspiration image..."
          : activeMode === "complete_the_look"
            ? "Optional note about the look you uploaded..."
            : "Describe the outfit you want...";
    addWelcomeCard(nextMode);
    addMessage(welcomeContent[nextMode].body, "bot");
    updateUploadVisibility();
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  imageInput.addEventListener("change", async () => {
    const [file] = Array.from(imageInput.files || []);
    if (!file) {
      pendingImageAsset = null;
      imagePreview.innerHTML = "";
      return;
    }
    try {
      await handleFileSelection(file);
    } catch (error) {
      pendingImageAsset = null;
      imagePreview.innerHTML = "";
      addMessage("I couldn’t prepare that image just now. Please try another file.", "bot");
    }
  });

  if (recognition && voiceButton) {
    recognition.lang = "en-US";
    recognition.interimResults = false;
    voiceButton.addEventListener("click", () => {
      try {
        recognition.start();
      } catch (error) {
        input.focus();
      }
    });
    recognition.addEventListener("result", (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => (result[0] ? result[0].transcript : ""))
        .join(" ")
        .trim();
      if (transcript) {
        input.value = transcript;
        input.focus();
      }
    });
  } else if (voiceButton) {
    voiceButton.addEventListener("click", () => input.focus());
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitCurrentFlow();
  });

  async function initializeWidget() {
    applyChatbotCustomization({
      brand_name: "StyledGenie",
      assistant_name: defaultAssistantName,
      welcome_title: defaultWelcomeTitle,
    });
    await loadChatbotCustomization();
    setMode(activeMode);
    startCustomizationRefreshLoop();
  }

  initializeWidget();
})();
