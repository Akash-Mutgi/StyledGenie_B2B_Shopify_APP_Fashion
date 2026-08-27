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
  const storefrontPurchases = Array.from(root.querySelectorAll("[data-styledgenie-purchase]"))
    .map((node) => ({
      title: node.dataset.title || "Purchased item",
      image_url: node.dataset.imageUrl || "",
      purchased_at: node.dataset.purchasedAt || "",
      variant_title: node.dataset.variantTitle === "Default Title" ? "" : node.dataset.variantTitle || "",
      price: node.dataset.price || "",
    }))
    .filter((item) => item.image_url)
    .filter((item, index, items) =>
      items.findIndex((candidate) =>
        candidate.title === item.title && candidate.variant_title === item.variant_title
      ) === index
    );
  const storefrontProductCache = new Map();
  const customerId = "shopify-storefront-guest";
  let activeMode = "outfit_curation";
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
  const defaultUiMode = "outfit_curation";
  const shopperIdentity = getShopperIdentity();

  const welcomeContent = {
    outfit_curation: {
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
    get_inspired: {
      eyebrow: "Style Inspiration",
      title: "Upload a look you love and I'll turn the feeling into something wearable.",
      body:
        "I'll read the mood first, then translate it into pieces from this store that still feel realistic to wear.",
      prompts: [
        "Help me recreate this mood",
        "Make this inspiration feel more elevated",
        "Find store pieces with this energy",
      ],
    },
    complete_the_look: {
      eyebrow: "Complete The Look",
      title: "One strong piece is enough to build around.",
      body:
        "Upload the item or outfit photo and I'll suggest the finishing pieces that add balance, shape, and polish without taking over the look.",
      prompts: [
        "Complete this look for evening",
        "What shoes work with this?",
        "Make this feel more refined",
      ],
    },
    support: {
      eyebrow: "Quick Support",
      title: "I can handle the practical side too.",
      body:
        "Ask about tracking, shipping, returns, sizing, or anything that feels unclear and I'll guide you through it without the usual friction.",
      prompts: [
        "Track my order",
        "How long does shipping take?",
        "I need help with a return",
      ],
    },
  };

  const conversationActionSets = {
    outfit_curation: [
      { type: "add_all_to_cart", label: "Add all to cart", action: "cart" },
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
    get_inspired: [
      { type: "shop_this_vibe", label: "Shop this vibe", action: "cart" },
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
    complete_the_look: [
      { type: "add_selected_items", label: "Add selected items", action: "cart" },
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
      { type: "track_order", label: "Track order", action: "prompt", prompt: "Track my order" },
      { type: "return_item", label: "Return item", action: "prompt", prompt: "I need help with a return" },
      { type: "exchange_item", label: "Exchange item", action: "prompt", prompt: "I need help with an exchange" },
      { type: "speak_to_support", label: "Speak to support", action: "prompt", prompt: "I need to speak to a person" },
    ],
  };

  const quickEntryActions = [
    { label: "Find my outfit", action: "mode", mode: "outfit_curation" },
    { label: "Complete my look", action: "mode", mode: "complete_the_look" },
    { label: "Get inspired", action: "mode", mode: "get_inspired" },
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

  const FEATURE_INTERACTION_CONFIG = {
    outfit_curation: {
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
    complete_the_look: {
      mode: "guided",
      textEnabled: true,
      voiceEnabled: false,
      placeholder: "Please follow the guided steps to complete your look.",
      badgeLabel: "Complete my look",
      signalLabel: "Guided steps",
      helperText: "This feature uses guided steps for better results.",
    },
    get_inspired: {
      mode: "guided",
      textEnabled: true,
      voiceEnabled: false,
      placeholder: "Please follow the guided steps to get inspired.",
      badgeLabel: "Get inspired",
      signalLabel: "Guided steps",
      helperText: "This feature uses guided steps for better results.",
    },
  };

  const uploadHelpText = {
    get_inspired:
      "Use camera or upload an inspiration image and I’ll translate the mood into the closest shoppable version from the catalog.",
    complete_the_look:
      "Use camera or upload the piece you want to build around and I’ll finish the look with complementary pieces from the catalog.",
  };

  function createVoiceState() {
    return {
      supported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
      active: false,
      recognition: null,
    };
  }

  function getInteractionConfigForFeature(mode = activeMode) {
    return FEATURE_INTERACTION_CONFIG[mode] || FEATURE_INTERACTION_CONFIG.outfit_curation;
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
      root.dataset.customerName ||
      root.dataset.customerEmail ||
      (window.StyledGenieShopper && window.StyledGenieShopper.name) ||
      "";
    const explicitAvatar =
      root.dataset.customerAvatar ||
      (window.StyledGenieShopper && window.StyledGenieShopper.avatarUrl) ||
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
      mode === "complete_the_look"
        ? "Use this styling profile while completing my look"
        : mode === "get_inspired"
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
        paragraph.className = "styledgenie-message-paragraph";
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
    brief.className = "styledgenie-reply-brief";

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
      section.className = "styledgenie-reply-section";

      const label = document.createElement("p");
      label.className = "styledgenie-reply-section-label";
      label.textContent = item.label;

      const value = document.createElement("p");
      value.className = "styledgenie-reply-section-value";
      value.textContent = structured[item.key];

      section.append(label, value);
      brief.appendChild(section);
    });

    return [brief];
  }

  const BOT_AVATAR_LOGO = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="styledGenieBotAvatarGradient" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f06fd8"/>
        <stop offset="0.48" stop-color="#c45cf3"/>
        <stop offset="1" stop-color="#8d4df7"/>
      </linearGradient>
      <filter id="styledGenieBotAvatarShadow" x="-4" y="-2" width="32" height="32" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#8d4df7" flood-opacity=".22"/>
      </filter>
    </defs>
    <circle cx="12" cy="12" r="10.8" fill="url(#styledGenieBotAvatarGradient)" filter="url(#styledGenieBotAvatarShadow)"/>
    <g stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="7.95" r="3.05"/>
      <circle cx="8.35" cy="14.25" r="3.05"/>
      <circle cx="15.65" cy="14.25" r="3.05"/>
      <path d="M10.45 10.6 9.9 11.55M13.55 10.6l.55.95M11.4 14.25h1.2"/>
    </g>
  </svg>`;

  function createMessageAvatar(role) {
    const avatar = document.createElement("div");
    avatar.className = "styledgenie-message-avatar";
    if (role === "bot") {
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
    messages.querySelectorAll(".styledgenie-message-row.bot .styledgenie-message-avatar").forEach((avatar) => {
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

  const loadingCopy = {
    outfit_curation: "Thinking through a look that feels polished, wearable, and right for you...",
    get_inspired: "Reading the image and translating the mood into real store pieces...",
    complete_the_look: "Balancing the finishing pieces around your anchor item...",
    support: "Checking the practical details for you now...",
  };

  root.innerHTML = `
    <div class="styledgenie-launcher">
      <div class="styledgenie-header">
        <div class="styledgenie-header-main">
          <button
            id="styledgenie-home-button"
            class="styledgenie-home-button hidden"
            type="button"
            aria-label="Back to home"
            title="Back to home"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M14.5 6.5L9 12L14.5 17.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
              />
            </svg>
            <span>Back</span>
          </button>
          <div class="styledgenie-brand-lockup">
            <div class="styledgenie-logo" id="styledgenie-logo" aria-hidden="true"></div>
            <div class="styledgenie-header-copy">
              <p class="styledgenie-header-label" id="styledgenie-assistant-name">StyledGenie AI</p>
              <h3 id="styledgenie-welcome-title">A thoughtful look, without the guesswork.</h3>
            </div>
          </div>
        </div>
        <div class="styledgenie-presence online">
          <span class="styledgenie-presence-dot" aria-hidden="true"></span>
          <span class="styledgenie-status-pill">Live Stylist</span>
        </div>
      </div>
      <div class="styledgenie-subheader">
        <p class="styledgenie-subtitle">
          Outfit curation, inspiration, complete-the-look, and support in one conversation.
        </p>
      </div>
      <div class="styledgenie-actions">
        <button data-mode="outfit_curation">Find My Outfit</button>
        <button data-mode="get_inspired">Get Inspired</button>
        <button data-mode="complete_the_look">Complete My Look</button>
        <button data-mode="support">Returns / Help</button>
      </div>
      <div class="styledgenie-body">
        <div class="styledgenie-messages" id="styledgenie-messages"></div>
        <div class="styledgenie-composer">
          <input id="styledgenie-image" type="file" accept="image/*" hidden />
          <input id="styledgenie-image-url" type="hidden" />
          <div id="styledgenie-composer-actions" class="styledgenie-composer-actions hidden">
            <button type="button" data-action="camera">Use Camera</button>
            <button type="button" data-action="upload">Upload Image</button>
          </div>
          <form class="styledgenie-form" id="styledgenie-form">
            <input id="styledgenie-input" type="text" placeholder="Tell me the occasion, budget, mood, or what you want the look to solve..." />
            <div class="styledgenie-composer-toolbar">
              <button
                id="styledgenie-composer-plus"
                class="styledgenie-composer-plus"
                type="button"
                aria-haspopup="true"
                aria-expanded="false"
                aria-label="Open image actions"
                title="Add image"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 5V19"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M5 12H19"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
              <div class="styledgenie-composer-badges" aria-hidden="true">
                <span id="styledgenie-composer-mode-badge" class="styledgenie-composer-badge">Find my outfit</span>
                <span id="styledgenie-composer-signal-badge" class="styledgenie-composer-badge styledgenie-composer-badge-muted">Live catalog</span>
              </div>
              <button
                id="styledgenie-voice-button"
                class="styledgenie-voice-button"
                type="button"
                aria-label="Start voice input"
                title="Start voice input"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M12 4.75C10.2051 4.75 8.75 6.20507 8.75 8V11C8.75 12.7949 10.2051 14.25 12 14.25C13.7949 14.25 15.25 12.7949 15.25 11V8C15.25 6.20507 13.7949 4.75 12 4.75Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M6.75 10.75V11C6.75 13.8995 9.10051 16.25 12 16.25C14.8995 16.25 17.25 13.8995 17.25 11V10.75"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M12 16.25V19.25"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
              <button class="styledgenie-send-button" type="submit" aria-label="Send message" title="Send message">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M4 11.5L20 4L13 20L10.8 13.8L4 11.5Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M10.8 13.8L20 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
            </div>
          </form>
          <p id="styledgenie-guided-helper" class="styledgenie-guided-helper hidden">
            This feature uses guided steps for better results.
          </p>
        </div>
        <div id="styledgenie-camera-card" class="styledgenie-camera-modal hidden" aria-live="polite">
          <div class="styledgenie-camera-card styledgenie-camera-modal-card">
            <div class="styledgenie-camera-modal-header">
              <p class="styledgenie-camera-modal-title">Use camera</p>
              <button id="styledgenie-cancel-camera" class="styledgenie-camera-modal-close" type="button">Close</button>
            </div>
            <p class="styledgenie-camera-modal-copy">
              Frame the look, then capture when it feels right. A full-length shot gives me the best read on proportions, layers, and shoes.
            </p>
            <div class="styledgenie-camera-frame">
              <video id="styledgenie-camera-video" autoplay playsinline muted></video>
              <img id="styledgenie-camera-still" class="hidden" alt="Captured camera preview" />
              <canvas id="styledgenie-camera-canvas" class="hidden"></canvas>
            </div>
            <div class="styledgenie-camera-controls">
              <button id="styledgenie-capture-photo" class="styledgenie-upload-action styledgenie-upload-action-primary" type="button">Capture</button>
              <button id="styledgenie-retake-photo" class="styledgenie-upload-action hidden" type="button">Retake</button>
              <button id="styledgenie-confirm-photo" class="styledgenie-upload-action hidden" type="button">Use Photo</button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  `;

  const messages = root.querySelector("#styledgenie-messages");
  const form = root.querySelector("#styledgenie-form");
  const input = root.querySelector("#styledgenie-input");
  const composerPlusButton = root.querySelector("#styledgenie-composer-plus");
  const composerQuickActions = root.querySelector("#styledgenie-composer-actions");
  const composerModeBadge = root.querySelector("#styledgenie-composer-mode-badge");
  const composerSignalBadge = root.querySelector("#styledgenie-composer-signal-badge");
  const voiceButton = root.querySelector("#styledgenie-voice-button");
  const sendButton = form ? form.querySelector(".styledgenie-send-button") : null;
  const guidedHelperText = root.querySelector("#styledgenie-guided-helper");
  const imageInput = root.querySelector("#styledgenie-image");
  const imageUrlInput = root.querySelector("#styledgenie-image-url");
  const cameraButton = root.querySelector("#styledgenie-camera-button");
  const uploadTrigger = root.querySelector("#styledgenie-upload-trigger");
  const closeUploadDrawerButton = root.querySelector("#styledgenie-close-upload");
  const uploadPreview = root.querySelector("#styledgenie-upload-preview");
  const uploadPreviewImage = root.querySelector("#styledgenie-upload-preview-image");
  const uploadPreviewLabel = root.querySelector("#styledgenie-upload-preview-label");
  const analyzeSelectedImageButton = root.querySelector("#styledgenie-analyze-image");
  const clearSelectedImageButton = root.querySelector("#styledgenie-clear-image");
  const cameraCard = root.querySelector("#styledgenie-camera-card");
  const cameraVideo = root.querySelector("#styledgenie-camera-video");
  const cameraStillImage = root.querySelector("#styledgenie-camera-still");
  const cameraCanvas = root.querySelector("#styledgenie-camera-canvas");
  const capturePhotoButton = root.querySelector("#styledgenie-capture-photo");
  const retakePhotoButton = root.querySelector("#styledgenie-retake-photo");
  const confirmPhotoButton = root.querySelector("#styledgenie-confirm-photo");
  const cancelCameraButton = root.querySelector("#styledgenie-cancel-camera");
  const logoNode = root.querySelector("#styledgenie-logo");
  const homeButton = root.querySelector("#styledgenie-home-button");
  const assistantNameNode = root.querySelector("#styledgenie-assistant-name");
  const welcomeTitleNode = root.querySelector("#styledgenie-welcome-title");
  const presenceNode = root.querySelector(".styledgenie-presence");
  const statusPillNode = root.querySelector(".styledgenie-status-pill");
  const uploadSection = root.querySelector(".styledgenie-upload");
  const uploadHintNode = root.querySelector(".styledgenie-upload-hint");
  const modeButtons = root.querySelectorAll("[data-mode]");
  if (modeButtons[0]) {
    modeButtons[0].classList.add("active");
  }

  function addMessage(text, role) {
    const row = document.createElement("div");
    row.className = `styledgenie-message-row ${role}`;

    const avatar = createMessageAvatar(role);
    const stack = document.createElement("div");
    stack.className = "styledgenie-message-stack";

    const meta = document.createElement("div");
    meta.className = "styledgenie-message-meta";
    const author = document.createElement("span");
    author.textContent =
      role === "bot" ? assistantNameNode.textContent || defaultAssistantName : buildUserAuthorLabel();
    const time = document.createElement("span");
    time.textContent = formatMessageTime();
    meta.append(author, time);

    const item = document.createElement("div");
    item.className = `styledgenie-message ${role}`;

    const parts = role === "bot" ? buildBotMessageContent(text) : createMessageParagraphs(text);
    parts.forEach((part) => item.appendChild(part));

    stack.append(meta, item);
    appendMessageRowAvatar(row, stack, avatar, role);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function applyChatbotCustomization(customization) {
    if (!customization) {
      return;
    }

    latestCustomization = customization;
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
    if (Array.isArray(customization.suggested_prompts) && customization.suggested_prompts.length) {
      welcomeContent.outfit_curation.prompts = customization.suggested_prompts.slice(0, 3);
    }
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
      welcomeContent.outfit_curation.body ||
      "Hi — I’m your StyledGenie stylist. I can help you build an outfit, translate a look from an image, or handle order support. What are you shopping for today?";

    const firstBotBubble = messages.querySelector(".styledgenie-message.bot");
    if (firstBotBubble && !messages.querySelector(".styledgenie-card-panel")) {
      firstBotBubble.textContent = openerText;
    }
  }

  function addSuggestionChips(options, onSelect, variant = "default") {
    if (!options || options.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = `styledgenie-suggestion-strip ${variant}`;

    const row = document.createElement("div");
    row.className = "styledgenie-suggestion-row";

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "styledgenie-suggestion-chip";
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
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function clearActivePromptPanels() {
    messages
      .querySelectorAll(".styledgenie-suggestion-strip, .styledgenie-next-panel, .styledgenie-feedback-panel")
      .forEach((node) => {
        node.remove();
      });
  }

  function clearStylingUiForSupportMode() {
    messages
      .querySelectorAll(
        ".styledgenie-welcome, .styledgenie-suggestion-strip, .styledgenie-profile-panel, .styledgenie-vision-panel, .styledgenie-look-panel, .styledgenie-hero-panel, .styledgenie-card-panel, .styledgenie-insight-panel, .styledgenie-feedback-panel, .styledgenie-next-panel"
      )
      .forEach((node) => {
        node.remove();
      });
  }

  function syncHeaderHomeButton(mode = activeMode) {
    if (!homeButton) {
      return;
    }
    const showBackToHome = !homeViewActive;
    homeButton.classList.toggle("hidden", !showBackToHome);
    homeButton.disabled = !showBackToHome;
    homeButton.setAttribute("aria-hidden", String(!showBackToHome));
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
    messages.scrollTop = messages.scrollHeight;
  }

  function syncInteractionUI(mode = activeMode) {
    const config = getInteractionConfigForFeature(mode);
    const isGuided = isGuidedFeature(mode);
    const signalLabel =
      voiceState.active && canUseVoiceInput(mode) ? "Listening…" : config.signalLabel;
    const plusEnabled = true;

    input.placeholder = config.placeholder;
    input.disabled = !config.textEnabled;
    input.readOnly = !config.textEnabled;
    input.setAttribute("aria-disabled", String(!config.textEnabled));

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

    if (form) {
      form.dataset.interactionMode = config.mode;
      form.classList.toggle("guided-mode", isGuided);
      form.classList.toggle("conversational-mode", !isGuided);
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
    const switchingBetweenGuided =
      previousConfig.mode === "guided" && nextConfig.mode === "guided" && modeChanged;

    if (modeChanged && (enteringGuided || leavingGuided || switchingBetweenGuided)) {
      clearActivePromptPanels();
      resetGuidedFlow();
    }

    if (modeChanged && nextConfig.mode === "guided") {
      input.value = "";
    }

    if (modeChanged) {
      pendingDecisionRequest = null;
      pendingStylingFollowUpField = null;
    }

    if (modeChanged && mode === "support") {
      clearStylingUiForSupportMode();
      latestRecommendationContext = null;
      uploadDrawerPinned = false;
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }
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
    modeButtons.forEach((item) => item.classList.toggle("active", item.dataset.mode === mode));
    syncInteractionUI(mode);
    if (!isImageMode()) {
      imageInput.value = "";
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }
      clearPendingImageSelection();
      resetCameraCard();
    }
    if (modeChanged && isImageMode()) {
      clearPendingImageSelection();
      resetCameraCard();
    }

    syncUploadDrawer();
    setComposerQuickActionsOpen(false);

    if (!options.silent) {
      messages.scrollTop = messages.scrollHeight;
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

      input.value = transcript;
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

    if (activeMode === "get_inspired") {
      return "Use the + button to add an inspiration image and I’ll analyze it first.";
    }

    if (activeMode === "complete_the_look") {
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
    if (!uploadSection) {
      return;
    }
    if (activeMode === "support" && !canUseSupportImageUpload()) {
      uploadSection.classList.add("hidden");
      if (uploadHintNode) {
        uploadHintNode.textContent = "";
      }
      return;
    }
    const hasRemoteImage = Boolean(imageUrlInput && imageUrlInput.value.trim());
    const hasPendingImage = Boolean(pendingImageSelection) || hasRemoteImage;
    const cameraVisible = cameraCard ? !cameraCard.classList.contains("hidden") : false;
    const shouldShow = uploadDrawerPinned || hasPendingImage || cameraVisible;
    uploadSection.classList.toggle("hidden", !shouldShow);
    if (uploadHintNode) {
      uploadHintNode.textContent = getUploadHelperCopy();
    }
  }

  function openUploadDrawer(options = {}) {
    if (!uploadSection) {
      return;
    }
    uploadDrawerPinned = options.pinned !== false;
    syncUploadDrawer();
    if (options.focusUrl && imageUrlInput) {
      imageUrlInput.focus();
    }
  }

  function closeUploadDrawer() {
    if (!uploadSection) {
      return;
    }
    uploadDrawerPinned = false;
    if (imageUrlInput) {
      imageUrlInput.value = "";
    }
    clearPendingImageSelection();
    resetCameraCard();
    syncUploadDrawer();
    setComposerQuickActionsOpen(false);
    if (isImageMode()) {
      setMode("outfit_curation", { silent: true });
    }
  }

  function resetGuidedFlow() {
    guidedFlow = null;
  }

  function getOpenerSuggestions() {
    return [
      { label: "Find my outfit", action: "mode", mode: "outfit_curation" },
      { label: "Get inspired", action: "mode", mode: "get_inspired" },
      { label: "Complete my look", action: "mode", mode: "complete_the_look" },
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
    const actions = [
      { label: "Use camera", action: "camera" },
      { label: "Upload image", action: "upload" },
    ];
    if (activeMode === "complete_the_look") {
      actions.push({ label: "Past purchases", action: "past_purchases" });
    }
    return actions;
  }

  function prepareComposerQuickActions() {
    if (!composerQuickActions) {
      return;
    }
    const buttons = Array.from(composerQuickActions.querySelectorAll("button"));
    if (buttons.length < 2) {
      return;
    }

    if (activeMode === "support" && !canUseSupportImageUpload()) {
      buttons[0].dataset.action = "support_damage";
      buttons[0].textContent = "Damaged item photo";
      buttons[1].dataset.action = "support_wrong_item";
      buttons[1].textContent = "Wrong item photo";
      return;
    }

    buttons[0].dataset.action = "camera";
    buttons[0].textContent = "Use Camera";
    buttons[1].dataset.action = "upload";
    buttons[1].textContent = "Upload Image";
  }

  function renderPastPurchasesPicker() {
    clearActivePromptPanels();
    addMessage("Pick an item and Iâ€™ll complete the look.", "bot");

    const panel = document.createElement("section");
    panel.className = "styledgenie-purchases-panel";
    const loading = document.createElement("p");
    loading.className = "styledgenie-purchases-status";
    loading.textContent = "Loading your itemsâ€¦";
    panel.appendChild(loading);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;

    const products = storefrontPurchases.slice(0, 5);
    panel.innerHTML = "";

    if (!products.length) {
      loading.textContent = root.dataset.customerEmail
        ? "I couldnâ€™t find a recent item with an image. Upload a photo instead."
        : "Sign in to see past purchases, or upload a photo instead.";
      panel.appendChild(loading);
      return;
    }

    products.forEach((product) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "styledgenie-purchase-row";

      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = product.title || "Purchased item";
      image.loading = "lazy";

      const copy = document.createElement("span");
      copy.className = "styledgenie-purchase-copy";
      const title = document.createElement("strong");
      title.textContent = product.title || "Purchased item";
      const meta = document.createElement("span");
      meta.textContent = [
        product.purchased_at ? `Purchased: ${product.purchased_at}` : "",
        product.variant_title || "",
        product.price || "",
      ]
        .filter(Boolean)
        .join(" Â· ");
      copy.append(title, meta);

      const plus = document.createElement("span");
      plus.className = "styledgenie-purchase-plus";
      plus.setAttribute("aria-hidden", "true");
      plus.textContent = "+";

      row.append(image, copy, plus);
      row.addEventListener("click", () => {
        panel.querySelectorAll("button").forEach((button) => {
          button.disabled = true;
        });
        void sendImageChat(
          `Complete my look around ${product.title || "this item"}.`,
          null,
          product.image_url
        );
      });
      panel.appendChild(row);
    });

    messages.scrollTop = messages.scrollHeight;
  }

  function handleImageActionSelection(option) {
    if (!option) {
      return;
    }
    setComposerQuickActionsOpen(false);

    if (option.action === "support_damage" || option.action === "support_wrong_item") {
      const isDamage = option.action === "support_damage";
      supportUploadContext = {
        intent: isDamage ? "damage_issue" : "wrong_item_issue",
        uploadEnabled: true,
        source: "shopper_attachment",
      };
      input.value = isDamage
        ? "The item I received is damaged."
        : "I received the wrong item.";
      syncInteractionUI("support");
      launchImagePicker("upload");
      return;
    }

    if (option.action === "camera") {
      openCameraCapture();
      return;
    }

    if (option.action === "upload") {
      launchImagePicker("upload");
      return;
    }

    if (option.action === "past_purchases") {
      addMessage(option.label, "user");
      void renderPastPurchasesPicker();
    }
  }

  function addOpeningConversation() {
    messages.innerHTML = "";
    homeViewActive = true;
    setMode("outfit_curation", { silent: true });
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
    setMode("outfit_curation");
    resetGuidedFlow();

    if (!openingRequest) {
      addMessage(
        "Tell me what you’re shopping for, where you’ll wear it, or how you want it to feel, and I’ll shape the look from there. You can type or tap the mic.",
        "bot"
      );
    }

    addSuggestionChips(
      welcomeContent.outfit_curation.prompts.map((label) => ({ label, prompt: label })),
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
    setMode(isInspire ? "get_inspired" : "complete_the_look");
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

    if (mode === "complete_the_look") {
      startImageConversation("complete");
      return;
    }

    if (mode === "get_inspired") {
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
        shopperProfileDraft.fit_preference = String(value || "").trim();
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
        buildProfileNarrative(profileInputs, "outfit_curation"),
      ]
        .filter(Boolean)
        .join(" ");

      addMessage(
        "Lovely. I have enough to shape a direction that feels tighter and more considered. If you want to refine it further afterwards, you can still tell me about fit, colour, comfort, or budget.",
        "bot"
      );
      sendTextChat(contextPrompt || "Build my outfit", {
        displayText:
          buildDisplaySummary(profileInputs) || completedFlow.openingRequest || "Build my outfit",
        profileInputs,
      });
      return;
    }

    if (completedFlow.type === "complete_requirements") {
      const selectedFile = getSelectedImageFile();
      const imageUrl = (imageUrlInput && imageUrlInput.value.trim()) || "";
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

    if (completedFlow.type === "complete" || completedFlow.type === "inspire") {
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
    if (!presenceNode) {
      return;
    }

    presenceNode.classList.toggle("online", state === "online");
    presenceNode.classList.toggle("offline", state === "offline");

    if (statusPillNode) {
      statusPillNode.textContent = state === "offline" ? "Offline" : "Live Stylist";
    }
  }

  async function loadChatbotCustomization(options = {}) {
    const { silent = false } = options;

    try {
      const response = await fetch(`${apiBase}/api/merchant/workspace`);
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

    const actionRow = document.createElement("div");
    actionRow.className = "styledgenie-welcome-action-row";

    quickEntryActions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "styledgenie-welcome-action";
      button.textContent = action.label;
      button.addEventListener("click", () => handleWelcomeAction(action));
      actionRow.appendChild(button);
    });

    const row = document.createElement("div");
    row.className = "styledgenie-prompt-row";

    content.prompts.forEach((prompt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "styledgenie-prompt";
      chip.textContent = prompt;
      chip.addEventListener("click", () => {
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
      row.appendChild(chip);
    });

    card.append(eyebrow, title, body, actionRow, row);

    const composer = buildProfileComposer(mode);
    if (composer) {
      card.appendChild(composer);
    }
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
  }

  function isImageMode() {
    return activeMode === "get_inspired" || activeMode === "complete_the_look";
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const parts = result.split(",", 2);
        resolve(parts[1] || "");
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
    const reply =
      activeMode === "get_inspired"
        ? "Perfect — I have the image. Tap Analyze now and I’ll read the palette, key garments, and overall mood first."
        : "Perfect — I have the image. Tap Analyze now and I’ll read the anchor piece, palette, and silhouette first. A full-length photo helps if you want proportion and shoe guidance.";
    addMessage(reply, "bot");
    const previewUrl =
      (pendingImageSelection && pendingImageSelection.previewUrl) || ((imageUrlInput && imageUrlInput.value.trim()) || "");
    const label =
      (pendingImageSelection && pendingImageSelection.label) ||
      (activeMode === "get_inspired" ? "Inspiration image ready" : "Look image ready");
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
        activeMode === "get_inspired"
          ? `styledgenie-inspiration-${Date.now()}.jpg`
          : `styledgenie-look-${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: "image/jpeg" });
      const previewUrl = URL.createObjectURL(blob);

      setPendingImageSelection(
        file,
        previewUrl,
        activeMode === "get_inspired"
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
    input.focus();
  }

  async function submitSelectedImageFlow() {
    if (activeMode === "support") {
      addMessage("For support, describe the issue here and I’ll guide the next step directly.", "bot");
      return;
    }

    const imageUrl = (imageUrlInput && imageUrlInput.value.trim()) || "";
    const selectedFile = getSelectedImageFile();
    const value = input.value.trim();

    if (!selectedFile && !imageUrl) {
      addMessage("Please use the camera, upload an image, or paste an image URL first.", "bot");
      return;
    }

    if (!isImageMode()) {
      setMode(detectInspirationIntent(value) ? "get_inspired" : "complete_the_look", { silent: true });
    } else if (value && detectInspirationIntent(value) && activeMode !== "get_inspired") {
      setMode("get_inspired", { silent: true });
    }

    await sendImageChat(value, selectedFile, imageUrl);
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
    const row = document.createElement("div");
    row.className = "styledgenie-message-row bot styledgenie-typing";
    row.dataset.typing = "true";

    const avatar = createMessageAvatar("bot");
    if (avatar) {
      row.appendChild(avatar);
    }

    const stack = document.createElement("div");
    stack.className = "styledgenie-message-stack";

    const meta = document.createElement("div");
    meta.className = "styledgenie-message-meta";
    const author = document.createElement("span");
    author.textContent = assistantNameNode.textContent || defaultAssistantName;
    const time = document.createElement("span");
    time.textContent = "now";
    meta.append(author, time);

    const dots = document.createElement("span");
    dots.className = "styledgenie-typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    const text = document.createElement("span");
    text.className = "styledgenie-typing-copy";
    text.textContent = loadingCopy[mode] || "Thinking through the best options...";

    const bubble = document.createElement("div");
    bubble.className = "styledgenie-message bot";
    bubble.append(dots, text);

    stack.append(meta, bubble);
    row.appendChild(stack);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
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
    row.className = "styledgenie-message-row user";
    const avatar = createMessageAvatar("user");

    const stack = document.createElement("div");
    stack.className = "styledgenie-message-stack";

    const meta = document.createElement("div");
    meta.className = "styledgenie-message-meta";
    const author = document.createElement("span");
    author.textContent = buildUserAuthorLabel();
    const time = document.createElement("span");
    time.textContent = formatMessageTime();
    meta.append(author, time);

    const bubble = document.createElement("div");
    bubble.className = "styledgenie-message user attachment";

    const image = document.createElement("img");
    image.className = "styledgenie-message-attachment-image";
    image.src = previewUrl;
    image.alt = caption || "Uploaded styling reference";
    image.loading = "lazy";
    bubble.appendChild(image);

    if (caption) {
      const text = document.createElement("p");
      text.className = "styledgenie-message-attachment-caption";
      text.textContent = caption;
      bubble.appendChild(text);
    }

    stack.append(meta, bubble);
    appendMessageRowAvatar(row, stack, avatar, "user");
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
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
    row.className = "styledgenie-message-row user";
    const avatar = createMessageAvatar("user");

    const stack = document.createElement("div");
    stack.className = "styledgenie-message-stack";

    const meta = document.createElement("div");
    meta.className = "styledgenie-message-meta";
    const author = document.createElement("span");
    author.textContent = buildUserAuthorLabel();
    const time = document.createElement("span");
    time.textContent = formatMessageTime();
    meta.append(author, time);

    const bubble = document.createElement("div");
    bubble.className = "styledgenie-message user attachment styledgenie-pending-image-bubble";

    const image = document.createElement("img");
    image.className = "styledgenie-message-attachment-image";
    image.src = previewUrl;
    image.alt = caption || "Selected styling image";
    image.loading = "lazy";
    bubble.appendChild(image);

    if (caption) {
      const text = document.createElement("p");
      text.className = "styledgenie-message-attachment-caption";
      text.textContent = caption;
      bubble.appendChild(text);
    }

    const actions = document.createElement("div");
    actions.className = "styledgenie-pending-image-actions";

    const analyzeButton = document.createElement("button");
    analyzeButton.type = "button";
    analyzeButton.className = "styledgenie-primary";
    analyzeButton.textContent = "Analyze now";
    analyzeButton.addEventListener("click", async () => {
      analyzeButton.disabled = true;
      await submitSelectedImageFlow();
    });

    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "styledgenie-secondary";
    replaceButton.textContent = "Retake image";
    replaceButton.addEventListener("click", () => {
      if (pendingImagePreviewNode) {
        pendingImagePreviewNode.remove();
        pendingImagePreviewNode = null;
      }
      pendingImageSelection = null;
      openCameraCapture();
    });

    actions.append(analyzeButton, replaceButton);
    bubble.appendChild(actions);

    stack.append(meta, bubble);
    appendMessageRowAvatar(row, stack, avatar, "user");
    messages.appendChild(row);
    pendingImagePreviewNode = row;
    messages.scrollTop = messages.scrollHeight;
  }

  function renderLookPreview(products, mode, profile) {
    if (!products || products.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-look-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-look-heading";
    heading.textContent =
      mode === "get_inspired"
        ? "Shoppable version of the inspiration"
        : mode === "complete_the_look"
          ? "Finished around your anchor piece"
          : "Complete outfit direction";

    const summary = document.createElement("p");
    summary.className = "styledgenie-look-summary";
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
    visual.className = "styledgenie-look-visual";

    const leadMedia = document.createElement("div");
    leadMedia.className = "styledgenie-look-lead";
    leadMedia.appendChild(buildImageTile(products[0]));
    visual.appendChild(leadMedia);

    const stack = document.createElement("div");
    stack.className = "styledgenie-look-stack";
    products.slice(1, 4).forEach((product) => {
      const thumb = document.createElement("div");
      thumb.className = "styledgenie-look-thumb";
      thumb.appendChild(buildImageTile(product));
      stack.appendChild(thumb);
    });
    if (stack.childElementCount) {
      visual.appendChild(stack);
    }

    panel.append(heading, summary, visual);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderImageAnalysisSummary(imageAnalysis, runtime, tags) {
    if (!imageAnalysis && (!runtime || !runtime.vision_requested || !runtime.vision_summary)) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-vision-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-vision-heading";
    heading.textContent = "What I noticed";

    const summary = document.createElement("p");
    summary.className = "styledgenie-vision-summary";
    summary.textContent = (imageAnalysis && imageAnalysis.summary) || runtime.vision_summary;

    panel.append(heading, summary);

    const observationLines =
      (imageAnalysis && imageAnalysis.observation_lines && imageAnalysis.observation_lines.length
        ? imageAnalysis.observation_lines
        : []
      );

    if (observationLines.length) {
      const list = document.createElement("div");
      list.className = "styledgenie-vision-observation-list";
      observationLines.slice(0, 5).forEach((line) => {
        const item = document.createElement("p");
        item.className = "styledgenie-vision-observation-line";
        item.textContent = line;
        list.appendChild(item);
      });
      panel.appendChild(list);
    } else {
      const observationBits = [...new Set([...(runtime.vision_objects || []).slice(0, 2), ...(runtime.vision_labels || []).slice(0, 2)])].slice(0, 3);
      if (observationBits.length) {
        const detail = document.createElement("p");
        detail.className = "styledgenie-vision-summary";
        detail.textContent = `I’m reading ${observationBits.join(", ")} as the strongest visual signals here.`;
        panel.appendChild(detail);
      }
    }

    if (imageAnalysis && imageAnalysis.quality_note) {
      const note = document.createElement("p");
      note.className = "styledgenie-vision-quality-note";
      note.textContent = imageAnalysis.quality_note;
      panel.appendChild(note);
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
      row.className = "styledgenie-tag-row";
      uniqueCueTags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "styledgenie-tag";
        pill.textContent = tag;
        row.appendChild(pill);
      });
      panel.appendChild(row);
    }

    if (imageAnalysis && imageAnalysis.follow_up_question) {
      const followUp = document.createElement("p");
      followUp.className = "styledgenie-vision-follow-up";
      followUp.textContent = imageAnalysis.follow_up_question;
      panel.appendChild(followUp);
    }

    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
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

  function renderProfileSummary(profile) {
    if (!profile || (!profile.summary && (!profile.focus_points || !profile.focus_points.length))) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-profile-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-profile-heading";
    heading.textContent = "What I’m optimizing for";
    panel.appendChild(heading);

    if (profile.summary) {
      const summary = document.createElement("p");
      summary.className = "styledgenie-profile-summary";
      summary.textContent = profile.summary;
      panel.appendChild(summary);
    }

    if (profile.focus_points && profile.focus_points.length) {
      const row = document.createElement("div");
      row.className = "styledgenie-profile-row";

      profile.focus_points.forEach((point) => {
        const chip = document.createElement("span");
        chip.className = "styledgenie-profile-chip";
        chip.textContent = point;
        row.appendChild(chip);
      });

      panel.appendChild(row);
    }

    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderNextPromptActions(prompts) {
    if (!prompts || prompts.length === 0) {
      return;
    }

    clearActivePromptPanels();

    const promptSet = new Set(prompts.map((prompt) => String(prompt || "").toLowerCase()));
    const isSegmentClarification =
      isImageMode() && promptSet.has("menswear") && promptSet.has("womenswear");

    const panel = document.createElement("section");
    panel.className = "styledgenie-next-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-next-heading";
    heading.textContent = isSegmentClarification
      ? "Confirm the styling direction and I’ll keep going with this same image."
      : "Want me to tighten this up? You can also share budget, colour, fit, or comfort notes.";
    panel.appendChild(heading);

    const row = document.createElement("div");
    row.className = "styledgenie-next-row";

    prompts.forEach((prompt) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "styledgenie-next-chip";
      button.textContent = prompt;
      button.addEventListener("click", async () => {
        if (isImageMode()) {
          const selectedFile = getSelectedImageFile();
          const imageUrl = (imageUrlInput && imageUrlInput.value.trim()) || "";
          if ((selectedFile || imageUrl) && ["menswear", "womenswear"].includes(prompt.toLowerCase())) {
            shopperProfileDraft.segment = prompt.toLowerCase();
            input.value = "";
            await sendImageChat(prompt, selectedFile, imageUrl, {
              useProfileInputsForCompleteLook: activeMode === "complete_the_look",
            });
            return;
          }
        }

        await sendTextChat(prompt, {
          displayText: prompt,
          followUpField: pendingStylingFollowUpField,
        });
      });
      row.appendChild(button);
    });

    panel.appendChild(row);
    messages.appendChild(panel);
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

  function normalizeCartVariantId(variantId) {
    const parsedVariantId = Number(variantId);
    return Number.isNaN(parsedVariantId) ? variantId : parsedVariantId;
  }

  async function fetchStorefrontProductData(handle) {
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

  async function resolveStorefrontCartVariant(product) {
    const productData = await fetchStorefrontProductData(product.handle);
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

  async function requestCartAdd(items) {
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

  function buildCartFailureMessage(product, error, context) {
    const detail = String((error && error.message) || "").toLowerCase();
    const productTitle = product && product.title ? product.title : "that item";

    if (detail.includes("sold out") || detail.includes("unavailable")) {
      return context === "bulk"
        ? "Some pieces in this look are unavailable right now, so I only kept the items that are still sellable."
        : `${productTitle} is unavailable right now. Open the product page to choose another option there.`;
    }

    return context === "bulk"
      ? "I couldn’t add the full look in one step, but you can still add the pieces individually from their product pages."
      : "I could not add that item right now. Please open the product page and try there.";
  }

  async function addSingleProductToCartWithRecovery(product) {
    const variantSelection = await resolveStorefrontCartVariant(product);
    if (!variantSelection.variantId) {
      return {
        ok: false,
        code: variantSelection.source || "missing_variant",
        message: `${product.title} is unavailable on the storefront right now.`,
      };
    }

    try {
      await requestCartAdd([
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
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      const result = await addSingleProductToCartWithRecovery(product);
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

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      const preparedItems = await Promise.all(
        validProducts.map(async (product) => {
          const variantSelection = await resolveStorefrontCartVariant(product);
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

      await requestCartAdd(sellableItems.map((entry) => entry.item));

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

  function renderRecommendations(products) {
    return renderRecommendationsWithOptions(products, {});
  }

  function createRecommendationCard(product, options = {}) {
    const card = document.createElement("article");
    card.className = `styledgenie-card${options.compact ? " styledgenie-card--compact" : ""}`;

    const media = document.createElement("div");
    media.className = `styledgenie-card-media${options.compact ? " styledgenie-card-media--compact" : ""}`;
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

    body.append(topline, title);
    if (!options.compact) {
      body.append(reason, actions);
    } else {
      body.append(actions);
    }
    card.append(media, body);
    return card;
  }

  function renderRecommendationsWithOptions(products, options = {}) {
    if (!products || products.length === 0) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = `styledgenie-card-panel${options.compact ? " styledgenie-card-panel--compact" : ""}`;
    const renderMode = options.mode || activeMode;

    const heading = document.createElement("p");
    heading.className = "styledgenie-card-heading";
    heading.textContent =
      options.heading ||
      (renderMode === "get_inspired"
        ? "Closest store matches"
        : renderMode === "complete_the_look"
          ? "Here’s how I’d complete this look"
          : "Recommended picks");
    panel.appendChild(heading);

    if (options.intro) {
      const intro = document.createElement("p");
      intro.className = "styledgenie-card-intro";
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
      groupedList.className = "styledgenie-card-groups";

      groups.forEach((groupProducts, slotLabel) => {
        const group = document.createElement("div");
        group.className = "styledgenie-card-group";

        const slotHeading = document.createElement("p");
        slotHeading.className = "styledgenie-card-slot-heading";
        slotHeading.textContent = slotLabel;
        group.appendChild(slotHeading);

        const slotList = document.createElement("div");
        slotList.className = `styledgenie-card-list${options.compact ? " styledgenie-card-list--compact" : ""}`;
        groupProducts.forEach((product) => {
          slotList.appendChild(createRecommendationCard(product, options));
        });
        group.appendChild(slotList);
        groupedList.appendChild(group);
      });

      panel.appendChild(groupedList);
    } else {
      const list = document.createElement("div");
      list.className = `styledgenie-card-list${options.compact ? " styledgenie-card-list--compact" : ""}`;
      products.forEach((product) => {
        list.appendChild(createRecommendationCard(product, options));
      });
      panel.appendChild(list);
    }

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

  function renderGapAnalysis(gapAnalysis) {
    if (!gapAnalysis || !Array.isArray(gapAnalysis.missing_items) || !gapAnalysis.missing_items.length) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-insight-panel styledgenie-gap-analysis-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-insight-heading";
    heading.textContent = "What’s missing to complete this look";
    panel.appendChild(heading);

    if (gapAnalysis.anchor_item) {
      const intro = document.createElement("p");
      intro.className = "styledgenie-card-intro";
      intro.textContent = `I’m building this around ${gapAnalysis.anchor_item}.`;
      panel.appendChild(intro);
    }

    const row = document.createElement("div");
    row.className = "styledgenie-hero-cues";
    gapAnalysis.missing_items.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "styledgenie-hero-chip";
      chip.textContent = item;
      row.appendChild(chip);
    });
    panel.appendChild(row);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
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
    const products = context.mode === "get_inspired"
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
    panel.className = "styledgenie-support-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-support-heading";
    heading.textContent = payload.title || "Support update";
    panel.appendChild(heading);

    if (payload.summary) {
      const summary = document.createElement("p");
      summary.className = "styledgenie-support-summary";
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
      meta.className = "styledgenie-support-meta";
      metaRows.forEach(([labelText, valueText]) => {
        const row = document.createElement("div");
        row.className = "styledgenie-support-meta-row";

        const label = document.createElement("span");
        label.className = "styledgenie-support-meta-label";
        label.textContent = labelText;

        const value = document.createElement("span");
        value.className = "styledgenie-support-meta-value";
        value.textContent = valueText;

        row.append(label, value);
        meta.appendChild(row);
      });
      panel.appendChild(meta);
    }

    if (Array.isArray(payload.line_items) && payload.line_items.length) {
      const items = document.createElement("div");
      items.className = "styledgenie-support-items";

      payload.line_items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "styledgenie-support-item";

        const title = document.createElement("p");
        title.className = "styledgenie-support-item-title";
        title.textContent = item.quantity > 1 ? `${item.title} x${item.quantity}` : item.title;
        row.appendChild(title);

        if (item.unit_price) {
          const price = document.createElement("p");
          price.className = "styledgenie-support-item-price";
          price.textContent = item.unit_price;
          row.appendChild(price);
        }

        items.appendChild(row);
      });

      panel.appendChild(items);
    }

    if (Array.isArray(payload.actions) && payload.actions.length) {
      const row = document.createElement("div");
      row.className = "styledgenie-support-action-row";

      payload.actions.forEach((action) => {
        if (action.kind === "link" && action.url) {
          const link = document.createElement("a");
          link.className = "styledgenie-secondary";
          link.href = action.url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = action.label;
          row.appendChild(link);
          return;
        }

        if (action.kind === "upload") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "styledgenie-feedback-button";
          button.textContent = action.label;
          button.addEventListener("click", () => {
            uploadDrawerPinned = true;
            syncUploadDrawer();
            messages.scrollTop = messages.scrollHeight;
          });
          row.appendChild(button);
          return;
        }

        if (!action.prompt) {
          return;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "styledgenie-feedback-button";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          void sendTextChat(action.prompt, {
            displayText: action.label,
            profileInputs: null,
          });
        });
        row.appendChild(button);
      });

      if (row.childNodes.length) {
        panel.appendChild(row);
      }
    }

    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function getConversationActions(context) {
    let actions = conversationActionSets[context.mode] || [];
    if (getSmartSwapActions(context).length) {
      actions = actions.filter((action) => !["change_one_item", "swap_one_item"].includes(action.type));
    }
    if (context.decisionMode && context.mode === "outfit_curation") {
      actions = actions.filter((action) => action.type !== "show_another_option");
    }
    return actions;
  }

  async function handleConversationAction(action, context, button, panel) {
    const buttons = panel.querySelectorAll("button");
    let typingNode = null;
    const renderMode = context.uiMode || context.mode;
    const requestRecommendationAction = async (payload, { allowReducedContext = false } = {}) => {
      const attempt = async (body) => {
        try {
          const response = await fetch(`${apiBase}/api/chat/refine`, {
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
        renderAssistantResponse(data, contextNote, {
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
          renderFallbackAssistantResponse(
            data || { styling_insights: [], follow_up_prompts: [] },
            safeProducts,
            renderMode,
            supportPayload,
            renderMode === "complete_the_look" && requiredFollowUpFields.length > 0,
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
      const response = await fetch(`${apiBase}/api/chat`, {
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
        typingNode = showTypingState(renderMode);
        root._styledgenieTypingNode = typingNode;

        const { response: swapResponse, data } = await requestRecommendationAction(
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
        removeTypingState(typingNode);
        root._styledgenieTypingNode = null;
        if (!swapResponse.ok && !data) {
          throw new Error("Swap request failed");
        }
        if (data) {
          safeRenderActionResponse(data, `Swap ${action.swapCategory}`);
          return;
        }
        throw new Error("Swap request failed");
      }

      if (action.action === "refine" && action.prompt) {
        typingNode = showTypingState(renderMode);
        root._styledgenieTypingNode = typingNode;

        const refineResponse = await fetch(`${apiBase}/api/chat/refine`, {
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
        const data = await refineResponse.json().catch(() => null);
        removeTypingState(typingNode);
        root._styledgenieTypingNode = null;
        if (!refineResponse.ok && !data) {
          throw new Error("Refinement request failed");
        }
        if (data) {
          safeRenderActionResponse(data, action.prompt);
          return;
        }
        throw new Error("Refinement request failed");
      }

      if (action.action === "feedback") {
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
      }
    } catch (error) {
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
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

  function renderConversationActions(context) {
    if (!context) {
      return;
    }

    const swapActions = getSmartSwapActions(context);
    if (swapActions.length) {
      const swapPanel = document.createElement("section");
      swapPanel.className = "styledgenie-feedback-panel";

      const swapHeading = document.createElement("p");
      swapHeading.className = "styledgenie-feedback-heading";
      swapHeading.textContent = "Swap one item";
      swapPanel.appendChild(swapHeading);

      const swapRow = document.createElement("div");
      swapRow.className = "styledgenie-feedback-row";

      swapActions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "styledgenie-feedback-button";
        button.textContent = action.label;
        button.addEventListener("click", () => handleConversationAction(action, context, button, swapPanel));
        swapRow.appendChild(button);
      });

      swapPanel.appendChild(swapRow);
      messages.appendChild(swapPanel);
      messages.scrollTop = messages.scrollHeight;
    }

    const actions = getConversationActions(context);
    if (!actions.length) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-feedback-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-feedback-heading";
    heading.textContent = "Next step";
    panel.appendChild(heading);

    const row = document.createElement("div");
    row.className = "styledgenie-feedback-row";

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "styledgenie-feedback-button";
      button.textContent = action.label;
      button.addEventListener("click", () => handleConversationAction(action, context, button, panel));
      row.appendChild(button);
    });

    panel.appendChild(row);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function filterProductsForActiveSegment(products, shopperProfile, aiRuntime) {
    const requiredSegment =
      (aiRuntime && aiRuntime.active_segment) ||
      (shopperProfile && shopperProfile.segment_preference);
    if (!requiredSegment || !Array.isArray(products)) {
      const filtered = products.filter((product) => product.segment === requiredSegment);
      return filtered.length > 0 ? filtered : products;
    }

    return products.filter((product) => product.segment === requiredSegment);
  }

  function setImageModeFromMessage(value) {
    if (detectInspirationIntent(value)) {
      setMode("get_inspired", { silent: true });
      return;
    }

    if (!isImageMode()) {
      setMode("complete_the_look", { silent: true });
    }
  }

  function shouldPreserveImageForFollowUp(data) {
    if (!isImageMode()) {
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

  function renderFallbackAssistantResponse(
    data,
    safeProducts,
    renderMode,
    supportPayload,
    needsCompleteLookRequirements,
    isSupportResponse
  ) {
    if (isSupportResponse) {
      updateSupportUploadContext(supportPayload);
      clearStylingUiForSupportMode();
      renderSupportPayload(supportPayload);
      return;
    }

    updateSupportUploadContext(null);

    if (needsCompleteLookRequirements) {
      renderNextPromptActions(data.follow_up_prompts || []);
      return;
    }

    if (renderMode === "complete_the_look" && data.gap_analysis) {
      renderGapAnalysis(data.gap_analysis || null);
    }

    if (renderMode === "get_inspired" && safeProducts.length) {
      const heroProduct = safeProducts.find((item) => item.role === "hero") || safeProducts[0];
      const supportProducts = safeProducts.filter((item) => item.id !== heroProduct.id);
      renderRecommendationsWithOptions([heroProduct], {
        heading: heroProduct.match_label || "Closest match from this store",
        mode: renderMode,
      });
      if (supportProducts.length) {
        renderRecommendationsWithOptions(supportProducts, {
          heading: "Complete the look",
          intro: "You might pair with",
          mode: renderMode,
          compact: true,
          groupBySupportSlot: true,
        });
      }
    } else if (safeProducts.length) {
      renderRecommendationsWithOptions(safeProducts, {
        mode: renderMode,
        groupBySupportSlot: renderMode === "complete_the_look" && safeProducts.some((item) => item.support_slot),
      });
    }

    renderStylingInsights(data.styling_insights || []);

    if (!safeProducts.length) {
      renderNextPromptActions(data.follow_up_prompts || []);
    }
  }

  function composePrimaryAssistantReply(data, products, renderMode = activeMode) {
    const requiredFollowUpFields = Array.isArray(data.required_follow_up_fields) ? data.required_follow_up_fields : [];
    if (renderMode === "complete_the_look" && requiredFollowUpFields.length) {
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

    if (renderMode === "get_inspired" && products && products.length) {
      if (data.reply && data.reply.trim()) {
        return data.reply.trim();
      }

      const heroTitle = products[0].title || "the closest store match";
      const summary = data.image_analysis && data.image_analysis.summary ? `Got it — ${data.image_analysis.summary}` : "Got it.";
      return `${summary} I recreated the look around ${heroTitle} and kept the supporting pieces close to the same palette and mood.`;
    }

    if (renderMode !== "complete_the_look" || !products || !products.length) {
      return data.reply || "No reply received.";
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

  function renderInspiredHeroMatch(heroProduct, imageAnalysis, shopperProfile) {
    if (!heroProduct) {
      return;
    }

    const panel = document.createElement("section");
    panel.className = "styledgenie-hero-panel";

    const heading = document.createElement("p");
    heading.className = "styledgenie-hero-heading";
    heading.textContent = heroProduct.match_label || "Closest match from this store";
    panel.appendChild(heading);

    const anchorLabel = document.createElement("p");
    anchorLabel.className = "styledgenie-hero-anchor";
    const anchorItem = (imageAnalysis && imageAnalysis.anchor_item) || "the inspiration anchor";
    anchorLabel.textContent = `Recreated around ${anchorItem}`;
    panel.appendChild(anchorLabel);

    const cues = buildInspiredCueTags(imageAnalysis, shopperProfile);
    const matchBadges = Array.isArray(heroProduct.match_badges) ? heroProduct.match_badges : [];
    const combinedCues = [...new Set([...matchBadges, ...cues])].slice(0, 4);
    if (combinedCues.length) {
      const row = document.createElement("div");
      row.className = "styledgenie-hero-cues";
      combinedCues.forEach((cue) => {
        const chip = document.createElement("span");
        chip.className = "styledgenie-hero-chip";
        chip.textContent = cue;
        row.appendChild(chip);
      });
      panel.appendChild(row);
    }

    const card = document.createElement("article");
    card.className = "styledgenie-hero-card";

    const media = document.createElement("div");
    media.className = "styledgenie-hero-media";
    media.appendChild(buildImageTile(heroProduct));

    const body = document.createElement("div");
    body.className = "styledgenie-hero-body";

    const topline = document.createElement("div");
    topline.className = "styledgenie-hero-topline";

    const category = document.createElement("span");
    category.textContent = heroProduct.category || "Hero match";

    const price = document.createElement("span");
    price.textContent = formatPrice(heroProduct.price);
    topline.append(category, price);

    const title = document.createElement("h4");
    title.className = "styledgenie-hero-title";
    title.textContent = heroProduct.title;

    const reason = document.createElement("p");
    reason.className = "styledgenie-hero-reason";
    reason.textContent = heroProduct.reason;

    const actions = document.createElement("div");
    actions.className = "styledgenie-hero-actions";

    if (heroProduct.product_url) {
      const link = document.createElement("a");
      link.className = "styledgenie-secondary";
      link.href = heroProduct.product_url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "View Product";
      actions.appendChild(link);
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "styledgenie-primary";
    addButton.textContent = "Add to Cart";
    addButton.disabled = !heroProduct.cart_variant_id;
    addButton.addEventListener("click", () => addProductToCart(heroProduct, addButton));
    actions.appendChild(addButton);

    body.append(topline, title, reason, actions);
    card.append(media, body);
    panel.appendChild(card);
    messages.appendChild(panel);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderAssistantResponse(data, contextNote, requestMeta = {}) {
    const resolvedMode = data.ai_runtime && data.ai_runtime.resolved_mode;
    const renderMode = requestMeta.uiMode || (resolvedMode || activeMode);
    if (resolvedMode === "support" && activeMode !== "support") {
      setMode("support", { silent: true });
    } else if (resolvedMode && resolvedMode !== "support" && activeMode === "support") {
      setMode(resolvedMode, { silent: true });
    }

    const safeProducts = filterProductsForActiveSegment(
      data.recommended_products || [],
      data.shopper_profile,
      data.ai_runtime
    );
    const supportPayload = data.support_payload || null;
    const isSupportResponse = resolvedMode === "support" || Boolean(supportPayload);
    const requiredFollowUpFields = Array.isArray(data.required_follow_up_fields) ? data.required_follow_up_fields : [];
    const needsTextStylingFollowUp =
      renderMode === "outfit_curation" && requiredFollowUpFields.length > 0;
    pendingStylingFollowUpField = needsTextStylingFollowUp
      ? normalizeStylingFollowUpField(requiredFollowUpFields[0])
      : null;
    const needsCompleteLookRequirements =
      renderMode === "complete_the_look" && requiredFollowUpFields.length > 0;
    const streamlinedCompleteLook = renderMode === "complete_the_look" && safeProducts.length > 0;
    const streamlinedInspiredLook = renderMode === "get_inspired" && safeProducts.length > 0;
    addMessage(composePrimaryAssistantReply(data, safeProducts, renderMode), "bot");
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
        renderGapAnalysis(data.gap_analysis || null);
        renderRecommendationsWithOptions(safeProducts, { mode: renderMode, groupBySupportSlot: true });
        renderStylingInsights(data.styling_insights || []);
      } else if (streamlinedInspiredLook) {
        updateSupportUploadContext(null);
        renderInspiredHeroMatch(safeProducts[0], data.image_analysis || null, data.shopper_profile || null);
        if (safeProducts.length > 1) {
          renderRecommendationsWithOptions(safeProducts.slice(1), {
            heading: "Complete the look",
            intro: "You might pair with",
            mode: renderMode,
            compact: true,
            groupBySupportSlot: true,
          });
        }
        renderStylingInsights(data.styling_insights || []);
      } else {
        updateSupportUploadContext(null);
        renderImageAnalysisSummary(data.image_analysis, data.ai_runtime, data.detected_tags || []);
        renderProfileSummary(data.shopper_profile);
        renderLookPreview(safeProducts, renderMode, data.shopper_profile);
        renderDetectedTags(data.detected_tags || []);
        renderRecommendationsWithOptions(safeProducts, { mode: renderMode });
        renderStylingInsights(data.styling_insights || []);
      }
    } catch (error) {
      console.error("StyledGenie render error", error, data);
      renderFallbackAssistantResponse(
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
            mode: requestMeta.backendMode || resolvedMode || renderMode,
            uiMode: renderMode,
            contextNote: contextNote || "Recommendation response",
            recommendedProductIds: safeProducts.map((item) => item.id),
            products: safeProducts,
            shopperProfile: data.shopper_profile || null,
            imageAnalysis: data.image_analysis || null,
            gapAnalysis: data.gap_analysis || null,
            orchestrationContext: data.orchestration_context || null,
            decisionMode: requestMeta.decisionMode === true,
          }
        : null;
    if (!isSupportResponse) {
      renderConversationActions(latestRecommendationContext);
    }
    if (!needsCompleteLookRequirements && !isSupportResponse && (!latestRecommendationContext || !latestRecommendationContext.recommendedProductIds.length)) {
      renderNextPromptActions(data.follow_up_prompts || []);
    }
    if (!needsCompleteLookRequirements && !needsTextStylingFollowUp) {
      shopperProfileDraft = createEmptyProfileDraft();
    }
  }

  async function sendTextChat(rawMessage, options = {}) {
    const requestMode = activeMode;
    const trimmedMessage = String(rawMessage || "").trim();

    if (!canUseTextInput(requestMode)) {
      return;
    }

    if (trimmedMessage) {
      homeViewActive = false;
      syncHeaderHomeButton(requestMode);
    }

    if (requestMode === "outfit_curation") {
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
    const requestedDecisionMode = options.decisionMode;
    const inferredDecisionMode =
      requestedDecisionMode === undefined
        ? inferDecisionModeFromMessage([trimmedMessage, displayText].filter(Boolean).join(" "))
        : requestedDecisionMode === true || requestedDecisionMode === "pick_best"
          ? true
          : requestedDecisionMode === false || requestedDecisionMode === "options"
            ? false
            : null;

    pendingDecisionRequest = null;
    if (!options.skipUserEcho) {
      addMessage(displayText, "user");
    }
    input.value = "";
    root._styledgenieLastContextNote = displayText || structuredPrompt;
    root._styledgenieTypingNode = showTypingState(requestMode);

    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: structuredPrompt,
          mode: requestMode,
          customer_id: customerId,
          profile_inputs: profileInputs,
          decision_mode: inferredDecisionMode ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
      const data = await response.json();
      setPresenceState("online");
      if (
        requestMode === "outfit_curation" &&
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
      renderAssistantResponse(data, root._styledgenieLastContextNote || structuredPrompt, {
        uiMode: requestMode,
        backendMode: requestMode,
        decisionMode: inferredDecisionMode,
      });
      imageInput.value = "";
      if (imageUrlInput) {
        imageUrlInput.value = "";
      }
    } catch (error) {
      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
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
      requestMode !== "complete_the_look" || Boolean(options.useProfileInputsForCompleteLook);
    if (!includeProfileInputs && requestMode === "complete_the_look") {
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

    addImageUploadMessage(previewUrl, shopperMessage || "Styling reference");
    input.value = "";
    root._styledgenieLastContextNote = shopperMessage;
    root._styledgenieTypingNode = showTypingState(requestMode);

    try {
      const endpoint = requestMode === "get_inspired" ? "/api/inspire" : "/api/complete-look";
      const imageContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
      const response = await fetch(`${apiBase}${endpoint}`, {
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
            (requestMode === "get_inspired"
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

      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
      const data = await response.json();
      setPresenceState("online");
      renderAssistantResponse(data, shopperMessage, {
        uiMode: requestMode,
        backendMode: requestMode,
      });
      const preserveImageSelection = shouldPreserveImageForFollowUp(data);
      clearImageFlowStateAfterResponse({ preserveImageSelection });
      if (!preserveImageSelection && selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
      }
    } catch (error) {
      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
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

    addImageUploadMessage(previewUrl, shopperMessage || "Support issue image");
    input.value = "";
    root._styledgenieLastContextNote = shopperMessage;
    root._styledgenieTypingNode = showTypingState("support");

    try {
      const imageContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
      const response = await fetch(`${apiBase}/api/support-image`, {
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

      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
      const data = await response.json();
      setPresenceState("online");
      renderAssistantResponse(data, shopperMessage, {
        uiMode: "support",
        backendMode: "support",
      });
      clearImageFlowStateAfterResponse();
      if (selectedFile && previewUrl && previewUrl.startsWith("blob:")) {
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
      }
    } catch (error) {
      const typingNode = root._styledgenieTypingNode;
      removeTypingState(typingNode);
      root._styledgenieTypingNode = null;
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
      activeMode === "get_inspired"
        ? "Image ready for inspiration styling"
        : activeMode === "support"
          ? "Support photo ready"
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

  composerPlusButton.addEventListener("click", (event) => {
    event.stopPropagation();
    prepareComposerQuickActions();
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
      const selectedMode = button.dataset.mode || "outfit_curation";
      activateFeature(selectedMode, {
        announce: true,
        userLabel: button.textContent.trim(),
      });
    });
  });

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      returnToChatHome();
    });
  }

  if (voiceButton) {
    voiceButton.addEventListener("click", () => {
      handleVoiceButtonClick();
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!canUseTextInput()) {
      return;
    }

    const value = input.value.trim();
    const imageUrl = (imageUrlInput && imageUrlInput.value.trim()) || "";
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
      input.value = "";
      return;
    }

    if ((selectedFile || imageUrl) && !isImageMode()) {
      setImageModeFromMessage(value);
      await sendImageChat(value, selectedFile, imageUrl);
      return;
    }

    if (isImageMode()) {
      if (!selectedFile && !imageUrl) {
        addMessage(
          "Please choose an image or paste an Instagram, Pinterest, or direct image URL first.",
          "bot"
        );
        return;
      }

      await sendImageChat(value, selectedFile, imageUrl);
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
    syncInteractionUI(activeMode);
    syncHeaderHomeButton(activeMode);
    applyChatbotCustomization({
      brand_name: "StyledGenie",
      assistant_name: defaultAssistantName,
      welcome_title: defaultWelcomeTitle,
    });
    addOpeningConversation();
    await loadChatbotCustomization();
    startCustomizationRefreshLoop();
  }

  initializeWidget();
})();

/* v1776341426 */
