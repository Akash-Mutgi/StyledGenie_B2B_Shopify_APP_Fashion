const mainContent = document.getElementById("mainContent");
const sidebarBrandName = document.getElementById("sidebarBrandName");
const sidebarStoreDomain = document.getElementById("sidebarStoreDomain");
const topbarTitle = document.getElementById("topbarTitle");
const topbarSubtitle = document.getElementById("topbarSubtitle");
const saveStatus = document.getElementById("saveStatus");
const syncCatalogButton = document.getElementById("syncCatalogButton");
const dashboardToast = document.getElementById("dashboardToast");
const toastTitle = document.getElementById("toastTitle");
const toastMessage = document.getElementById("toastMessage");
const toastCloseButton = document.getElementById("toastCloseButton");
const navButtons = Array.from(document.querySelectorAll(".nav-button"));
const apiBaseUrl = "http://127.0.0.1:8000";

const sectionMeta = {
  overview: {
    title: "Dashboard Overview",
    subtitle:
      "Monitor live AI performance, store readiness, and the merchant profile that powers every recommendation.",
  },
  chatbot: {
    title: "Chatbot Customizer",
    subtitle:
      "Tailor the chatbot’s look, feel, and styling presence so it feels unmistakably on-brand for any connected store.",
  },
  catalog: {
    title: "Catalog Intelligence",
    subtitle:
      "Define who your store serves, how products should be interpreted, and which catalog attributes matter most.",
  },
  looks: {
    title: "Look Management",
    subtitle:
      "Curate reusable styling looks that your AI can learn from when building full-outfit recommendations.",
  },
  care: {
    title: "Customer Care Setup",
    subtitle:
      "Maintain the support knowledge your AI assistant should use when answering returns, shipping, and policy questions.",
  },
  knowledge: {
    title: "Knowledge & AI Training",
    subtitle:
      "Store brand rules, fit guidance, and merchandising knowledge that turns the dashboard into the brain of the store.",
  },
};

const chatbotFontOptions = [
  "Playfair Display",
  "Avenir Next",
  "Georgia",
  "Trebuchet MS",
  "Helvetica Neue",
];

const chatbotTextStyleOptions = [
  "700 Bold",
  "600 Medium",
  "500 Medium",
  "400 Regular",
];

const chatbotTargetMarkets = [
  "Europe",
  "North America",
  "Middle East",
  "Asia Pacific",
  "Global",
];
const recommendationStrictnessOptions = ["balanced", "strict", "flexible"];
const autoApplyOptions = ["review_first", "auto_apply"];
const productPrioritizationOptions = ["best_match", "more_premium", "more_accessible"];
const strictModeHandlingOptions = ["repair_then_retry", "retry_stricter", "fail_fast"];
const decisionModeOptions = ["offer_choice", "show_options", "decide_for_me"];

let workspace = null;
let activeSection = "overview";
let activeChatbotPage = "settings";
let toastTimer = null;
let chatbotAutosaveTimer = null;
let lastChatbotDraftFingerprint = "";
let lastWorkspaceSnapshotFingerprint = "";
let workspaceHeartbeatTimer = null;
const analyticsRefreshIntervalMs = 5000;
let builderPreviewFlow = "outfit_curation";
let builderPreviewPrompt = "";
let builderPriorityFlow = "";
let productDescriptionState = {
  productId: "",
  loading: false,
  description: "",
  notes: [],
  error: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text, tone = "neutral") {
  saveStatus.textContent = text;
  saveStatus.dataset.tone = tone;
}

function showToast(title, message, tone = "success") {
  if (!dashboardToast) {
    return;
  }

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTitle.textContent = title;
  toastMessage.textContent = message;
  dashboardToast.dataset.tone = tone;
  dashboardToast.classList.add("visible");
  dashboardToast.setAttribute("aria-hidden", "false");

  toastTimer = window.setTimeout(() => {
    hideToast();
  }, 3200);
}

function hideToast() {
  if (!dashboardToast) {
    return;
  }

  dashboardToast.classList.remove("visible");
  dashboardToast.setAttribute("aria-hidden", "true");
}

function formatTimestamp(value) {
  if (!value) {
    return "Not recorded yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") {
    return "Price unavailable";
  }

  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return `EUR ${amount.toFixed(2)}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrencyValue(value) {
  const amount = Number(value || 0);
  return `EUR ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function parseNumericPrice(value) {
  const amount = Number(value);
  return Number.isNaN(amount) ? null : amount;
}

function getCoverage(snapshot) {
  if (!snapshot.products_imported) {
    return 0;
  }

  return Math.round((snapshot.tagged_products / snapshot.products_imported) * 100);
}

function getReadinessScore(snapshot) {
  const knowledgeSignals =
    snapshot.faq_entries + snapshot.knowledge_entries + snapshot.curated_looks;
  return Math.max(knowledgeSignals, 0);
}

function buildServiceMix(snapshot) {
  const items = [
    { label: "Occasion Styling", value: snapshot.overview.outfit_recommendations },
    { label: "Image Inspiration", value: snapshot.overview.image_uploads },
    { label: "Customer Care", value: snapshot.overview.support_questions_answered },
    { label: "Styling Sessions", value: snapshot.chat_sessions },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

  return items.map((item) => ({
    ...item,
    share: Math.round((item.value / total) * 100),
  }));
}

function buildFeedbackRows(snapshot) {
  const summary = (snapshot && snapshot.feedback_summary) || {};
  return [
    { label: "Loved it", value: summary.love_it || 0 },
    { label: "Another option", value: summary.show_another_option || 0 },
    { label: "More casual", value: summary.make_more_casual || 0 },
    { label: "Change colours", value: summary.change_colours || 0 },
    { label: "Saved for later", value: summary.save_for_later || 0 },
  ];
}

function getPreviewPromptLines(prompts) {
  return (prompts || []).filter(Boolean).slice(0, 3);
}

function getBrandInitials(value) {
  const cleaned = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");

  return cleaned.toUpperCase() || "SG";
}

function renderSelectOptions(options, selectedValue) {
  return options
    .map(
      (option) => `
        <option value="${escapeHtml(option)}"${option === selectedValue ? " selected" : ""}>
          ${escapeHtml(option)}
        </option>
      `
    )
    .join("");
}

function getChatbotFingerprint(payload) {
  return JSON.stringify(payload || {});
}

function getWorkspaceSnapshotFingerprint(snapshot) {
  return JSON.stringify({
    overview: snapshot && snapshot.overview,
    feedback_summary: snapshot && snapshot.feedback_summary,
    recent_activity: snapshot && snapshot.recent_activity,
    recent_products: snapshot && snapshot.recent_products,
    chatbot_customization: snapshot && snapshot.chatbot_customization,
  });
}

function formatDurationFromMinutes(minutes) {
  const safeMinutes = Math.max(1, Math.round(minutes || 1));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (!hours) {
    return `${safeMinutes}m`;
  }

  if (!remainingMinutes) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function updateNavState() {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === activeSection);
  });
}

function updateShellChrome() {
  const snapshot = workspace && workspace.overview;
  const activeMeta = sectionMeta[activeSection];

  sidebarBrandName.textContent =
    (workspace && workspace.profile && workspace.profile.brand_name) ||
    (snapshot && snapshot.store_name) ||
    "StyledGenie";
  sidebarStoreDomain.textContent =
    (workspace && workspace.profile && workspace.profile.connected_store_domain) ||
    (snapshot && snapshot.store_domain) ||
    "Not connected";

  topbarTitle.textContent = activeMeta.title;
  topbarSubtitle.textContent = activeMeta.subtitle;

  updateNavState();
}

function renderErrorState(message) {
  mainContent.innerHTML = `
    <article class="workspace-card empty-state-card">
      <h3>Dashboard unavailable</h3>
      <p>${escapeHtml(message)}</p>
      <p>Start the backend, then refresh this page to load the merchant workspace.</p>
    </article>
  `;
}

function renderMetricCards(snapshot) {
  const metrics = [
    {
      label: "AI Guided Conversations",
      value: formatNumber(snapshot.overview.chat_interactions),
      badge: `${formatNumber(snapshot.chat_sessions)} live styling sessions`,
    },
    {
      label: "Recommendation Volume",
      value: formatNumber(
        snapshot.overview.outfit_recommendations + snapshot.overview.image_uploads
      ),
      badge: `${formatNumber(snapshot.overview.image_uploads)} image-led flows`,
    },
    {
      label: "Catalog Coverage",
      value: `${getCoverage(snapshot)}%`,
      badge: `${formatNumber(snapshot.tagged_products)} of ${formatNumber(
        snapshot.products_imported
      )} products tagged`,
    },
    {
      label: "Knowledge Readiness",
      value: formatNumber(getReadinessScore(snapshot)),
      badge: `${formatNumber(snapshot.faq_entries)} FAQs and ${formatNumber(
        snapshot.knowledge_entries
      )} training notes`,
    },
  ];

  return metrics
    .map(
      (item) => `
        <article class="metric-card">
          <div class="metric-badge">${escapeHtml(item.badge)}</div>
          <p class="metric-label">${escapeHtml(item.label)}</p>
          <h3 class="metric-value">${escapeHtml(item.value)}</h3>
        </article>
      `
    )
    .join("");
}

function renderRecommendedProducts(snapshot) {
  if (!snapshot.recent_products.length) {
    return `<p class="empty-copy">Sync a connected catalog to see AI-ready products here.</p>`;
  }

  return snapshot.recent_products
    .map((item) => {
      const cardTag = item.product_url ? "a" : "article";
      const href = item.product_url
        ? `href="${escapeHtml(item.product_url)}" target="_blank" rel="noreferrer"`
        : "";
      const imageMarkup = item.image_url
        ? `<img class="catalog-product-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(
            item.title
          )}" />`
        : `<div class="catalog-product-fallback">${escapeHtml(
            getBrandInitials(item.category || item.title)
          )}</div>`;

      return `
        <${cardTag} class="list-card product-list-card catalog-product-row" ${href}>
          <div class="catalog-product-media">
            ${imageMarkup}
          </div>
          <div class="catalog-product-copy">
            <p class="list-title">${escapeHtml(item.title)}</p>
            <div class="catalog-product-meta">
              <span class="status-chip neutral">${escapeHtml(item.category || "General")}</span>
            </div>
          </div>
          <div class="catalog-product-actions">
            <strong class="catalog-product-price">${escapeHtml(formatPrice(item.price))}</strong>
            ${item.product_url ? '<span class="list-link">View product</span>' : ""}
          </div>
        </${cardTag}>
      `;
    })
    .join("");
}

function renderActivityFeed(snapshot) {
  if (!snapshot.recent_activity.length) {
    return `<p class="empty-copy">No AI activity has been recorded yet.</p>`;
  }

  return snapshot.recent_activity
    .map(
      (item) => `
        <article class="activity-row">
          <div>
            <p class="list-title">${escapeHtml(item.title)}</p>
            <p class="list-subtitle">${escapeHtml(item.detail)}</p>
          </div>
          <p class="activity-time">${escapeHtml(formatTimestamp(item.timestamp))}</p>
        </article>
      `
    )
    .join("");
}

function renderServiceMix(snapshot) {
  return buildServiceMix(snapshot)
    .map(
      (item) => `
        <div class="service-row">
          <div>
            <p class="service-title">${escapeHtml(item.label)}</p>
            <p class="service-caption">${escapeHtml(formatNumber(item.value))} tracked interactions</p>
          </div>
          <div class="service-meter">
            <div class="service-meter-fill" style="width: ${item.share}%"></div>
            <span>${item.share}%</span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderFeedbackSignals(snapshot) {
  const summary = (snapshot && snapshot.feedback_summary) || {};
  const signals = summary.top_preference_signals || [];

  const countMarkup = buildFeedbackRows(snapshot)
    .map(
      (item) => `
        <div class="detail-row">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(formatNumber(item.value))}</strong>
        </div>
      `
    )
    .join("");

  const signalMarkup = signals.length
    ? signals
        .map(
          (item) => `
            <article class="signal-card">
              <span class="signal-dot"></span>
              <p>${escapeHtml(item)}</p>
            </article>
          `
        )
        .join("")
    : `<p class="empty-copy">Feedback will start appearing here as shoppers react to recommendations.</p>`;

  return `
    <article class="workspace-card">
      <div class="card-header">
        <div>
          <p class="card-eyebrow">Shopper Learning Loop</p>
          <h3>Recommendation Feedback</h3>
          <p class="card-copy">Every reaction helps the merchant brain understand what shoppers want more of.</p>
        </div>
      </div>
      <div class="detail-list">
        ${countMarkup}
      </div>
      <div class="signal-list">
        ${signalMarkup}
      </div>
    </article>
  `;
}

function getChatbotModuleCards(snapshot) {
  return [
    {
      key: "settings",
      label: "Settings",
      meta: "Brand system and storefront sync",
      icon: "⚙",
    },
    {
      key: "analytics",
      label: "Bot Analytics",
      meta: `${formatNumber(snapshot.overview.chat_interactions)} tracked conversations`,
      icon: "📊",
    },
    {
      key: "builder",
      label: "Bot Builder",
      meta: `${formatNumber(snapshot.journey_metrics.length || 0)} live engine blocks`,
      icon: "🤖",
    },
  ].map((item) => ({
    ...item,
    active: item.key === activeChatbotPage,
  }));
}

function buildChatbotAnalyticsMetrics(snapshot) {
  const totalConversations = snapshot.overview.chat_interactions;
  const styleActions = snapshot.overview.outfit_recommendations + snapshot.overview.image_uploads;
  const totalFeedback = buildFeedbackRows(snapshot).reduce((sum, item) => sum + item.value, 0);
  const engagementRate = totalConversations
    ? Math.min(96, Math.max(8, Math.round((snapshot.chat_sessions / totalConversations) * 100)))
    : 0;
  const influenceCount = Math.max(
    snapshot.overview.outfit_recommendations,
    snapshot.feedback_summary.love_it + snapshot.feedback_summary.save_for_later
  );
  const fallbackRate = totalConversations
    ? Math.max(
        1,
        Math.round(
          (((snapshot.feedback_summary.show_another_option || 0) +
            (snapshot.feedback_summary.change_colours || 0) +
            (snapshot.feedback_summary.make_more_casual || 0)) /
            totalConversations) *
            100
        )
      )
    : 0;

  return [
    {
      label: "Total Conversations",
      value: formatNumber(totalConversations),
      delta: `+${Math.max(6, Math.min(28, snapshot.chat_sessions * 2))}%`,
      tone: "positive",
      detail: "Total chatbot sessions initiated by shoppers in the connected store.",
    },
    {
      label: "Engagement Rate",
      value: `${engagementRate}%`,
      delta: `+${Math.max(4, Math.min(18, Math.round(engagementRate / 4) || 4))}%`,
      tone: "positive",
      detail: "% of shoppers who moved beyond the first greeting into active styling.",
    },
    {
      label: "Style Actions Triggered",
      value: formatNumber(styleActions),
      delta: `${styleActions > 0 ? "+" : ""}${Math.max(1, Math.min(12, styleActions || 1))}%`,
      tone: styleActions > 0 ? "positive" : "neutral",
      detail: "Create Outfit, Get Inspired, and Complete the Look requests combined.",
    },
    {
      label: "Conversion Influence",
      value: formatNumber(influenceCount),
      delta: `+${Math.max(3, Math.min(21, (totalFeedback || snapshot.chat_sessions) + 2))}%`,
      tone: "positive",
      detail: "Recommendation moments that show strong shopper intent or positive reaction.",
    },
    {
      label: "Fallback Rate",
      value: `${fallbackRate}%`,
      delta: `-${Math.max(1, Math.min(8, fallbackRate || 1))}%`,
      tone: "negative",
      detail: "Sessions that likely needed refinement, rewording, or extra guidance.",
    },
  ];
}

function buildUsageShareRows(snapshot) {
  const items = [
    { label: "Create Full Outfit", value: snapshot.overview.outfit_recommendations },
    { label: "Get Inspired", value: snapshot.overview.image_uploads },
    { label: "Customer Care", value: snapshot.overview.support_questions_answered },
    { label: "Active Sessions", value: snapshot.chat_sessions },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

  return items.map((item) => ({
    ...item,
    share: Math.max(1, Math.round((item.value / total) * 100)),
  }));
}

function buildIntentMix(snapshot) {
  const items = [
    { label: "Inspiration", value: snapshot.overview.image_uploads, color: "#7adce3" },
    { label: "Occasion Styling", value: snapshot.overview.outfit_recommendations, color: "#44b4d5" },
    { label: "Compare Products", value: snapshot.overview.support_questions_answered, color: "#3d7bb5" },
    { label: "Order Support", value: snapshot.chat_sessions, color: "#536d9a" },
    {
      label: "Returns & Logistics",
      value: Math.max(1, Math.round(snapshot.overview.support_questions_answered / 2)),
      color: "#624b8d",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

  return items.map((item) => ({
    ...item,
    share: Math.max(1, Math.round((item.value / total) * 100)),
  }));
}

function buildIntentGradient(snapshot) {
  let start = 0;
  return buildIntentMix(snapshot)
    .map((item) => {
      const end = start + item.share;
      const segment = `${item.color} ${start}% ${end}%`;
      start = end;
      return segment;
    })
    .join(", ");
}

function extractTopAttributes(snapshot) {
  const titles = (snapshot.recent_products || [])
    .flatMap((item) => [item.title || "", item.category || ""])
    .join(" ")
    .toLowerCase();
  const candidates = [
    "black",
    "white",
    "beige",
    "denim",
    "boots",
    "blazers",
    "sneakers",
    "hoodie",
    "casual",
    "work",
    "party",
    "suede",
    "pants",
    "shirts",
    "tops",
  ];

  const found = candidates.filter((item) => titles.includes(item)).slice(0, 6);
  if (found.length >= 4) {
    return found;
  }

  return [...new Set([...found, "neutral", "layering", "workwear", "elevated"])].slice(0, 6);
}

function buildFeatureMatrix(snapshot) {
  const shareRows = buildUsageShareRows(snapshot);
  const positiveFeedback =
    snapshot.feedback_summary.love_it + snapshot.feedback_summary.save_for_later;
  const refinementFeedback =
    snapshot.feedback_summary.show_another_option +
    snapshot.feedback_summary.make_more_casual +
    snapshot.feedback_summary.change_colours;

  return shareRows.map((item, index) => {
    const satisfactionSignal = Math.max(
      1,
      Math.round(((positiveFeedback + item.value) / Math.max(1, snapshot.chat_sessions + index + 1)) * 100)
    );
    const assistScore = Math.max(
      1,
      Math.round(((item.value + positiveFeedback - refinementFeedback) / Math.max(1, snapshot.chat_sessions || 1)) * 100)
    );

    return {
      label: item.label,
      usage: formatNumber(item.value),
      share: `${item.share}%`,
      signal: `${Math.min(99, satisfactionSignal)}%`,
      assist:
        assistScore >= 70 ? "High" : assistScore >= 40 ? "Medium" : assistScore >= 20 ? "Growing" : "Low",
    };
  });
}

function buildChatbotInsights(snapshot) {
  const insights = [];

  if ((snapshot.feedback_summary.top_preference_signals || []).length) {
    insights.push(...snapshot.feedback_summary.top_preference_signals.slice(0, 3));
  }

  if (snapshot.overview.image_uploads > snapshot.overview.outfit_recommendations) {
    insights.push("Image-led styling is leading discovery, so inspiration workflows deserve more prominence.");
  }

  if (getCoverage(snapshot) < 80) {
    insights.push("Catalog tagging coverage is still below target, so improving tag depth should lift recommendation quality.");
  }

  if (snapshot.feedback_summary.make_more_casual > 0) {
    insights.push("Shoppers are actively asking for more casual alternatives, which suggests relaxed edits should be easier to surface.");
  }

  return [...new Set(insights)].slice(0, 4);
}

function buildUnansweredIntentRows(snapshot) {
  const rows = [];
  const coverage = getCoverage(snapshot);
  const supportGap = Math.max(0, snapshot.overview.support_questions_answered - snapshot.faq_entries);
  const lookGap = Math.max(0, snapshot.overview.outfit_recommendations - snapshot.curated_looks);
  const imageGap = Math.max(0, snapshot.overview.image_uploads - Math.round(snapshot.tagged_products / 8));

  if (supportGap > 0) {
    rows.push({
      label: "Customer care coverage",
      score: Math.min(9, 4 + supportGap),
    });
  }

  if (coverage < 85) {
    rows.push({
      label: "Catalog tagging depth",
      score: Math.min(9, Math.max(3, Math.round((100 - coverage) / 12) + 3)),
    });
  }

  if (lookGap > 0) {
    rows.push({
      label: "Curated look depth",
      score: Math.min(9, 3 + lookGap),
    });
  }

  if (imageGap > 0) {
    rows.push({
      label: "Image match density",
      score: Math.min(9, 3 + imageGap),
    });
  }

  return rows.slice(0, 3);
}

function buildJourneyDefinitions(snapshot) {
  const feedback = snapshot.feedback_summary || {};
  const journeys = [
    {
      key: "outfit_curation",
      name: "Create Full Outfit",
      description: "Lead with occasion, mood, budget, and fit to build a confident outfit direction.",
      usage: snapshot.overview.outfit_recommendations,
      upliftBase: feedback.love_it + feedback.save_for_later,
      defaultPrompt:
        workspace.chatbot_customization.suggested_prompts[0] ||
        "Style me for a polished dinner look",
      previewReply:
        "I’d open by clarifying the occasion and dress code, then anchor the look around the strongest catalog match and explain why it works.",
    },
    {
      key: "get_inspired",
      name: "Get Inspired",
      description: "Decode the mood of a reference image and translate it into store-ready products.",
      usage: snapshot.overview.image_uploads,
      upliftBase: feedback.love_it + feedback.show_another_option,
      defaultPrompt: "Help me recreate this style with pieces from the store",
      previewReply:
        "I’d identify the mood first, then mirror the silhouette and colour story using real products from the connected catalog.",
    },
    {
      key: "complete_the_look",
      name: "Complete The Look",
      description: "Use one hero piece as the anchor and suggest what completes the outfit around it.",
      usage: Math.max(1, Math.round(snapshot.overview.image_uploads / 2)),
      upliftBase: feedback.make_more_casual + feedback.change_colours + feedback.save_for_later,
      defaultPrompt: "Complete this look with shoes and layering",
      previewReply:
        "I’d treat the uploaded item as the hero piece, then fill the gaps with complementary layers, shoes, or accessories.",
    },
    {
      key: "support",
      name: "Customer Care",
      description: "Handle shipping, returns, sizing, and service questions without leaving the styling experience.",
      usage: snapshot.overview.support_questions_answered,
      upliftBase: snapshot.faq_entries,
      defaultPrompt: "What is your shipping policy in Germany?",
      previewReply:
        "I’d answer clearly and quickly, then guide the shopper back into styling once the practical question is resolved.",
    },
  ];

  const totalUsage = journeys.reduce((sum, item) => sum + item.usage, 0) || 1;
  const positiveSignals = (feedback.love_it || 0) + (feedback.save_for_later || 0);
  const refinementSignals =
    (feedback.show_another_option || 0) +
    (feedback.make_more_casual || 0) +
    (feedback.change_colours || 0);

  return journeys.map((item) => {
    const share = Math.max(1, Math.round((item.usage / totalUsage) * 100));
    const conversionRate = Math.max(
      3,
      Math.min(
        68,
        Math.round(
          ((item.usage + positiveSignals + item.upliftBase - Math.round(refinementSignals / 2)) /
            Math.max(1, snapshot.chat_sessions + 1)) *
            100
        )
      )
    );

    return {
      ...item,
      share,
      conversionRate,
      status:
        builderPriorityFlow === item.key
          ? "Active"
          : item.usage === 0
            ? "Needs setup"
            : conversionRate >= 40
              ? "Live"
              : conversionRate >= 20
                ? "Monitor"
                : "Needs attention",
      label:
        conversionRate >= 45 ? "High Performing" : conversionRate >= 24 ? "Stable" : "Needs Optimization",
    };
  });
}

function getTopJourneyItem(snapshot) {
  return buildJourneyDefinitions(snapshot).sort((left, right) => right.usage - left.usage)[0];
}

function buildBotBuilderKpis(snapshot) {
  return [
    {
      label: "Conversations",
      value: formatNumber(snapshot.overview.chat_interactions),
      tone: "neutral",
    },
    {
      label: "AI Conversion Rate",
      value: `${Math.round(snapshot.ai_conversion_rate || 0)}%`,
      tone: (snapshot.ai_conversion_rate || 0) >= 20 ? "positive" : "negative",
    },
    {
      label: "Revenue Assisted",
      value: formatCurrencyValue(snapshot.revenue_assisted || 0),
      tone: (snapshot.revenue_assisted || 0) > 0 ? "positive" : "neutral",
    },
    {
      label: "AOV",
      value: formatCurrencyValue(snapshot.average_order_value || 0),
      tone: "neutral",
    },
    {
      label: "Drop-off Rate",
      value: `${Math.round(snapshot.drop_off_rate || 0)}%`,
      tone: (snapshot.drop_off_rate || 0) <= 18 ? "positive" : "negative",
    },
    {
      label: "Top Journey",
      value: snapshot.top_journey || "No data yet",
      tone: "neutral",
    },
  ];
}

function buildNeedsAttentionItems(snapshot) {
  const items = [];
  const topJourney = getTopJourneyItem(snapshot);
  const coverage = getCoverage(snapshot);
  const lastSyncDate = snapshot.last_catalog_sync ? new Date(snapshot.last_catalog_sync) : null;
  const now = new Date();
  const daysSinceSync =
    lastSyncDate && !Number.isNaN(lastSyncDate.getTime())
      ? Math.floor((now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  if (!snapshot.orders_scope_ready || snapshot.orders_imported === 0) {
    items.push({
      title: "True commerce metrics are not fully connected yet",
      detail:
        "The builder can only calculate real assisted revenue and AOV after Shopify order access is enabled and orders are synced into the merchant brain.",
      ctaLabel: "Sync Orders",
      action: "sync-inline-catalog",
      actionTarget: "",
    });
  }

  if (topJourney && topJourney.conversionRate < 24) {
    items.push({
      title: `${topJourney.name} is underperforming`,
      detail: `Its conversion assist is currently ${topJourney.conversionRate}%, which suggests the flow needs stronger prompts or merchandising logic.`,
      ctaLabel: "Optimize Journey",
      action: "set-chatbot-page",
      actionTarget: "settings",
    });
  }

  if (!workspace.chatbot_customization.logo_url || coverage < 85) {
    items.push({
      title: "Merchant setup still has gaps",
      detail: `Branding or catalog intelligence is incomplete. Current tagged coverage is ${coverage}% of the imported catalog.`,
      ctaLabel: "Review Setup",
      action: coverage < 85 ? "navigate-section" : "set-chatbot-page",
      actionTarget: coverage < 85 ? "catalog" : "settings",
    });
  }

  if ((workspace.knowledge_base || []).length < 3 || (daysSinceSync !== null && daysSinceSync >= 7)) {
    items.push({
      title: "AI training looks outdated",
      detail:
        daysSinceSync !== null && daysSinceSync >= 7
          ? `The last catalog sync was ${daysSinceSync} days ago. Refresh training inputs to keep recommendations sharp.`
          : "The AI training layer is still light. Add more brand rules and campaign notes to improve recommendation quality.",
      ctaLabel: daysSinceSync !== null && daysSinceSync >= 7 ? "Sync Catalog" : "Refresh Training",
      action: daysSinceSync !== null && daysSinceSync >= 7 ? "sync-inline-catalog" : "navigate-section",
      actionTarget: daysSinceSync !== null && daysSinceSync >= 7 ? "" : "knowledge",
    });
  }

  if (!items.length) {
    items.push({
      title: "No urgent issues detected",
      detail: "The chatbot engine is healthy right now. Keep watching journey performance as new traffic comes in.",
      ctaLabel: "View Analytics",
      action: "set-chatbot-page",
      actionTarget: "analytics",
    });
  }

  return items.slice(0, 3);
}

function buildJourneyFunnel(snapshot) {
  const total = Math.max(1, snapshot.overview.chat_interactions);
  const engaged = Math.max(1, snapshot.chat_sessions);
  const styled = Math.max(
    1,
    snapshot.overview.outfit_recommendations + snapshot.overview.image_uploads
  );
  const feedback = Math.max(
    1,
    snapshot.feedback_summary.love_it +
      snapshot.feedback_summary.save_for_later +
      snapshot.feedback_summary.show_another_option +
      snapshot.feedback_summary.make_more_casual +
      snapshot.feedback_summary.change_colours
  );

  return [
    { label: "Opened Chatbot", value: total, share: 100 },
    {
      label: "Entered Active Session",
      value: engaged,
      share: Math.max(1, Math.round((engaged / total) * 100)),
    },
    {
      label: "Reached Recommendation",
      value: styled,
      share: Math.max(1, Math.round((styled / total) * 100)),
    },
    {
      label: "Reacted Or Converted",
      value: feedback,
      share: Math.max(1, Math.round((feedback / total) * 100)),
    },
  ];
}

function getBuilderPreviewState(snapshot) {
  const journeys = buildJourneyDefinitions(snapshot);
  const activeJourney =
    journeys.find((item) => item.key === builderPreviewFlow) || journeys[0];
  const prompt = builderPreviewPrompt || activeJourney.defaultPrompt;
  const productNames = (snapshot.recent_products || [])
    .slice(0, 2)
    .map((item) => item.title)
    .filter(Boolean);
  const productNote = productNames.length
    ? ` I’d likely pull from ${productNames.join(" and ")} to make the result feel grounded in the live catalog.`
    : "";

  return {
    journeys,
    activeJourney,
    prompt,
    reply: `${activeJourney.previewReply}${productNote}`,
  };
}

function formatPercentValue(value, digits = 0) {
  const amount = Number(value || 0);
  return `${amount.toFixed(digits)}%`;
}

function getOrdersStatusText(snapshot) {
  if (snapshot.orders_scope_ready) {
    return snapshot.orders_imported
      ? `${formatNumber(snapshot.orders_imported)} recent Shopify orders visible`
      : "Orders enabled, but no recent Shopify orders are in the sync window";
  }

  return "Order sync is not enabled yet for this store";
}

function getJourneyRows(snapshot) {
  const rows = (snapshot.journey_metrics || []).map((item) => {
    const totalSignals = item.positive_feedback + item.refinement_requests;
    const shopperReactionRate = item.started
      ? Math.round((totalSignals / item.started) * 100)
      : 0;
    const positiveShare = totalSignals
      ? Math.round((item.positive_feedback / totalSignals) * 100)
      : 0;

    let status = "Needs setup";
    if (item.started > 0 && !snapshot.orders_scope_ready) {
      status = "Learning";
    } else if (item.assisted_orders > 0 && item.conversion_rate >= 20) {
      status = "Live";
    } else if (item.refinement_requests > item.positive_feedback && item.started > 0) {
      status = "Needs attention";
    } else if (item.started > 0) {
      status = "Monitor";
    }

    if (builderPriorityFlow === item.key) {
      status = "Active";
    }

    let performanceLabel = "Needs Optimization";
    if (item.assisted_orders > 0 && item.conversion_rate >= 20) {
      performanceLabel = "High Performing";
    } else if (item.started > 0 && positiveShare >= 55) {
      performanceLabel = "Stable";
    } else if (item.started > 0 && !snapshot.orders_scope_ready) {
      performanceLabel = "Awaiting Commerce Data";
    }

    return {
      ...item,
      shopperReactionRate,
      positiveShare,
      status,
      performanceLabel,
    };
  });

  return rows.length
    ? rows
    : [
        {
          key: "outfit_curation",
          label: "Create Full Outfit",
          started: 0,
          assisted_orders: 0,
          conversion_rate: 0,
          positive_feedback: 0,
          refinement_requests: 0,
          last_activity: null,
          shopperReactionRate: 0,
          positiveShare: 0,
          status: "Needs setup",
          performanceLabel: "Needs Optimization",
        },
      ];
}

function getCategoryRows(snapshot) {
  return (snapshot.category_metrics || []).map((item) => {
    const coverage = item.product_count
      ? Math.round((item.tagged_count / item.product_count) * 100)
      : 0;

    return {
      ...item,
      coverage,
    };
  });
}

function buildAccurateAnalyticsMetrics(snapshot) {
  const totalConversations = snapshot.overview.chat_interactions;
  const activeSessionRate = totalConversations
    ? Math.round((snapshot.chat_sessions / totalConversations) * 100)
    : 0;
  const recommendationReach = totalConversations
    ? Math.round(
        ((snapshot.overview.outfit_recommendations + snapshot.overview.image_uploads) /
          totalConversations) *
          100
      )
    : 0;
  const feedbackRows = buildFeedbackRows(snapshot);
  const feedbackTotal = feedbackRows.reduce((sum, item) => sum + item.value, 0);
  const positiveFeedback =
    snapshot.feedback_summary.love_it + snapshot.feedback_summary.save_for_later;
  const positiveFeedbackRate = feedbackTotal
    ? Math.round((positiveFeedback / feedbackTotal) * 100)
    : 0;
  const tagCoverage = snapshot.products_imported
    ? Math.round((snapshot.tagged_products / snapshot.products_imported) * 100)
    : 0;
  const linksReady = snapshot.products_imported
    ? Math.round(
        ((snapshot.data_quality && snapshot.data_quality.products_with_links) /
          snapshot.products_imported) *
          100
      )
    : 0;

  return [
    {
      label: "Tracked Conversations",
      value: formatNumber(totalConversations),
      helper: `${formatNumber(snapshot.chat_sessions)} active styling sessions`,
      tone: totalConversations > 0 ? "positive" : "neutral",
    },
    {
      label: "Active Session Rate",
      value: formatPercentValue(activeSessionRate),
      helper: "Sessions that moved beyond the first greeting",
      tone: activeSessionRate >= 35 ? "positive" : activeSessionRate > 0 ? "neutral" : "negative",
    },
    {
      label: "Recommendation Reach",
      value: formatPercentValue(recommendationReach),
      helper: "Conversations that reached an outfit or image-led recommendation",
      tone: recommendationReach >= 35 ? "positive" : recommendationReach > 0 ? "neutral" : "negative",
    },
    {
      label: "Positive Feedback Rate",
      value: formatPercentValue(positiveFeedbackRate),
      helper: `${formatNumber(positiveFeedback)} positive reactions from shoppers`,
      tone: positiveFeedbackRate >= 45 ? "positive" : feedbackTotal ? "neutral" : "negative",
    },
    {
      label: "Catalog Tag Coverage",
      value: formatPercentValue(tagCoverage),
      helper: `${formatNumber(snapshot.tagged_products)} of ${formatNumber(snapshot.products_imported)} products tagged`,
      tone: tagCoverage >= 80 ? "positive" : tagCoverage >= 50 ? "neutral" : "negative",
    },
    {
      label: "Product Link Readiness",
      value: formatPercentValue(linksReady),
      helper: `${formatNumber(
        (snapshot.data_quality && snapshot.data_quality.products_with_links) || 0
      )} products ready to open on the storefront`,
      tone: linksReady >= 80 ? "positive" : linksReady >= 50 ? "neutral" : "negative",
    },
  ];
}

function buildGapRadar(snapshot) {
  const items = [];
  const journeyRows = getJourneyRows(snapshot);
  const topCategory = getCategoryRows(snapshot)[0];

  if (snapshot.overview.image_uploads > snapshot.overview.outfit_recommendations) {
    items.push({
      title: "Image-led demand is stronger than outfit demand",
      detail:
        "Get Inspired and Complete The Look are driving more shopper intent, so visual matching quality matters more right now.",
      score: formatNumber(snapshot.overview.image_uploads),
    });
  }

  if (snapshot.products_imported && getCoverage(snapshot) < 80) {
    items.push({
      title: "Catalog depth is ahead of catalog intelligence",
      detail: `Only ${getCoverage(snapshot)}% of synced products have styling tags, which limits how precise the stylist can be.`,
      score: formatPercentValue(getCoverage(snapshot)),
    });
  }

  if (topCategory && topCategory.coverage < 70) {
    items.push({
      title: `${topCategory.label} needs richer product tagging`,
      detail: `${formatNumber(topCategory.product_count)} products are in this category, but only ${formatNumber(
        topCategory.tagged_count
      )} are tag-ready for the stylist.`,
      score: formatPercentValue(topCategory.coverage),
    });
  }

  if (!snapshot.orders_scope_ready) {
    items.push({
      title: "Commerce attribution is partially blind",
      detail:
        "The merchant brain can already measure conversations and reactions, but true order conversion still needs Shopify order visibility.",
      score: "Orders off",
    });
  } else if (snapshot.orders_imported === 0) {
    items.push({
      title: "Order sync is enabled but the lookback window is empty",
      detail:
        "No recent Shopify orders were found in the current sync window, so assisted revenue is accurate but currently zero.",
      score: "0 recent orders",
    });
  }

  if (!items.length) {
    items.push({
      title: "The merchant brain has no major blind spots right now",
      detail: "Catalog coverage, support knowledge, and commerce visibility are all in a healthy range for the current traffic volume.",
      score: "Healthy",
    });
  }

  return items.slice(0, 4);
}

function buildMemorySurface(snapshot) {
  return [
    {
      label: "FAQs",
      value: formatNumber(snapshot.faq_entries),
      helper: "Support answers connected to the chatbot",
    },
    {
      label: "Looks",
      value: formatNumber(snapshot.curated_looks),
      helper: "Curated outfits available to guide recommendations",
    },
    {
      label: "Training Notes",
      value: formatNumber(snapshot.knowledge_entries),
      helper: "Merchant-authored brand and merchandising notes",
    },
    {
      label: "Prompt Starters",
      value: formatNumber((workspace.chatbot_customization.suggested_prompts || []).length),
      helper: "Suggested shopper prompts shown in the widget",
    },
  ];
}

function buildSettingsPulse(snapshot) {
  return [
    {
      label: "Connected Shopify Store",
      value: snapshot.store_domain || "Not connected",
      helper: `Storefront: ${snapshot.storefront_domain || "Not configured"}`,
    },
    {
      label: "Catalog Heartbeat",
      value: `${formatNumber(snapshot.products_imported)} synced products`,
      helper: `Last sync ${formatTimestamp(snapshot.last_catalog_sync)}`,
    },
    {
      label: "Brand Memory",
      value: formatNumber((snapshot.data_quality && snapshot.data_quality.brand_memory_assets) || 0),
      helper: "FAQs, looks, and training inputs shaping the assistant",
    },
    {
      label: "Commerce Visibility",
      value: snapshot.orders_scope_ready
        ? `${formatNumber(snapshot.orders_imported)} synced orders`
        : "Order sync pending",
      helper: getOrdersStatusText(snapshot),
    },
  ];
}

function buildBuilderKpisAccurate(snapshot) {
  return [
    {
      label: "Conversations",
      value: formatNumber(snapshot.overview.chat_interactions),
      detail: "Tracked customer messages from live sessions",
      tone: snapshot.overview.chat_interactions > 0 ? "positive" : "neutral",
    },
    {
      label: "AI Conversion Rate",
      value: formatPercentValue(snapshot.ai_conversion_rate, snapshot.ai_conversion_rate % 1 ? 2 : 0),
      detail: "AI-assisted orders divided by total chat sessions",
      tone: snapshot.ai_conversion_rate >= 15 ? "positive" : snapshot.orders_scope_ready ? "neutral" : "negative",
    },
    {
      label: "Revenue Assisted",
      value: formatCurrencyValue(snapshot.revenue_assisted || 0),
      detail: "Revenue from orders carrying StyledGenie assist attribution",
      tone: snapshot.revenue_assisted > 0 ? "positive" : "neutral",
    },
    {
      label: "AOV",
      value: formatCurrencyValue(snapshot.average_order_value || 0),
      detail: "Average order value across synced Shopify orders",
      tone: snapshot.average_order_value > 0 ? "positive" : "neutral",
    },
    {
      label: "Drop-off Rate",
      value: formatPercentValue(snapshot.drop_off_rate, snapshot.drop_off_rate % 1 ? 2 : 0),
      detail: "Sessions that never reached a styling or support outcome",
      tone: snapshot.drop_off_rate <= 25 ? "positive" : "negative",
    },
    {
      label: "Top Journey",
      value: snapshot.top_journey || "Not enough data",
      detail: "Highest-performing or highest-usage customer path",
      tone: "neutral",
    },
  ];
}

function buildBuilderAttentionAccurate(snapshot) {
  const items = [];
  const journeyRows = getJourneyRows(snapshot);
  const weakestJourney = journeyRows
    .filter((item) => item.started > 0)
    .sort((left, right) => (left.positive_feedback - left.refinement_requests) - (right.positive_feedback - right.refinement_requests))[0];

  if (!snapshot.orders_scope_ready) {
    items.push({
      title: "Enable true Shopify order visibility",
      detail:
        "The builder is live, but real commerce attribution is still incomplete until Shopify order visibility is synced into the merchant brain.",
      ctaLabel: "Sync Catalog",
      action: "sync-inline-catalog",
      actionTarget: "",
    });
  } else if (snapshot.orders_imported === 0) {
    items.push({
      title: "No recent orders are available for attribution",
      detail:
        "Order sync is connected, but the current Shopify lookback window returned zero orders. The dashboard is accurate, but commerce KPIs will stay at zero until fresh orders arrive.",
      ctaLabel: "Review Builder",
      action: "set-chatbot-page",
      actionTarget: "builder",
    });
  }

  if (weakestJourney && weakestJourney.refinement_requests > weakestJourney.positive_feedback) {
    items.push({
      title: `${weakestJourney.label} needs a stronger path`,
      detail: `${formatNumber(weakestJourney.refinement_requests)} shoppers asked for refinement compared with ${formatNumber(
        weakestJourney.positive_feedback
      )} positive reactions.`,
      ctaLabel: "Tune Settings",
      action: "set-chatbot-page",
      actionTarget: "settings",
    });
  }

  if (getCoverage(snapshot) < 80) {
    items.push({
      title: "Catalog intelligence is trailing the imported catalog",
      detail: `Only ${getCoverage(snapshot)}% of products are tagged for styling, which reduces recommendation confidence.`,
      ctaLabel: "Review Catalog",
      action: "navigate-section",
      actionTarget: "catalog",
    });
  }

  if ((workspace.knowledge_base || []).length < 3 && snapshot.overview.chat_interactions > 0) {
    items.push({
      title: "AI training is still too light for the traffic coming in",
      detail: "The assistant has conversations coming through, but the merchant-authored training layer is still thin.",
      ctaLabel: "Add Training",
      action: "navigate-section",
      actionTarget: "knowledge",
    });
  }

  if (!items.length) {
    items.push({
      title: "No urgent builder issues are visible right now",
      detail: "This store is in a healthy state for the current level of shopper traffic and synced catalog coverage.",
      ctaLabel: "View Analytics",
      action: "set-chatbot-page",
      actionTarget: "analytics",
    });
  }

  return items.slice(0, 3);
}

function buildJourneyFunnelAccurate(snapshot) {
  const total = Math.max(1, snapshot.overview.chat_interactions);
  const activeSessions = snapshot.chat_sessions;
  const recommendationMoments =
    snapshot.overview.outfit_recommendations +
    snapshot.overview.image_uploads +
    snapshot.overview.support_questions_answered;
  const reactedOrConverted =
    snapshot.feedback_summary.love_it +
    snapshot.feedback_summary.save_for_later +
    snapshot.feedback_summary.show_another_option +
    snapshot.feedback_summary.make_more_casual +
    snapshot.feedback_summary.change_colours +
    snapshot.ai_assisted_orders;

  return [
    { label: "Started A Conversation", value: total, share: 100 },
    {
      label: "Entered An Active Session",
      value: activeSessions,
      share: Math.max(1, Math.round((activeSessions / total) * 100)),
    },
    {
      label: "Reached A Guided Outcome",
      value: recommendationMoments,
      share: Math.max(1, Math.round((recommendationMoments / total) * 100)),
    },
    {
      label: "Reacted Or Converted",
      value: reactedOrConverted,
      share: Math.max(1, Math.round((reactedOrConverted / total) * 100)),
    },
  ];
}

function getBuilderPreviewStateAccurate(snapshot) {
  const journeys = getJourneyRows(snapshot);
  const activeJourney =
    journeys.find((item) => item.key === builderPreviewFlow) || journeys[0];
  const promptDefaults = {
    outfit_curation:
      workspace.chatbot_customization.suggested_prompts[0] || "Style me for a polished dinner look",
    get_inspired: "Help me recreate this style using pieces from the store",
    complete_the_look: "Complete this look with shoes and a layer",
    support_question: "What is your shipping policy in Germany?",
  };
  const prompt = builderPreviewPrompt || promptDefaults[activeJourney.key] || "Help me build a look";
  const supportingProducts = (snapshot.recent_products || []).slice(0, 3);

  let reply =
    "I would start by anchoring the answer in the live catalog, then explain the choice in a way that makes the shopper feel certain and styled.";

  if (activeJourney.key === "get_inspired") {
    reply =
      "I would translate the image mood into a wearable store edit, then explain the silhouette, colour story, and why each suggested product supports that direction.";
  } else if (activeJourney.key === "complete_the_look") {
    reply =
      "I would treat the uploaded item as the anchor piece and fill the missing outfit roles around it using real catalog products.";
  } else if (activeJourney.key === "support_question") {
    reply =
      "I would answer clearly using the merchant’s live support knowledge, then guide the shopper back toward styling if it makes sense.";
  }

  if (supportingProducts.length) {
    reply += ` Right now the strongest live anchors are ${supportingProducts
      .map((item) => item.title)
      .slice(0, 2)
      .join(" and ")}.`;
  }

  return {
    journeys,
    activeJourney,
    prompt,
    reply,
    supportingProducts,
  };
}

function renderChatbotAnalyticsPage(snapshot) {
  const metrics = buildAccurateAnalyticsMetrics(snapshot);
  const journeyRows = getJourneyRows(snapshot);
  const categoryRows = getCategoryRows(snapshot);
  const memorySurface = buildMemorySurface(snapshot);
  const gapRadar = buildGapRadar(snapshot);
  const feedbackRows = buildFeedbackRows(snapshot);
  const liveSnapshotTime =
    (snapshot.recent_activity[0] && snapshot.recent_activity[0].timestamp) ||
    snapshot.last_orders_sync ||
    snapshot.last_catalog_sync;

  return `
    <section class="section-stack">
      <div class="analytics-live-banner">
        <span class="inline-badge">Live snapshot</span>
        <p>Last updated ${escapeHtml(formatTimestamp(liveSnapshotTime))}</p>
        <div class="live-chip-row">
          <span class="status-chip neutral">${escapeHtml(snapshot.store_domain || "Store pending")}</span>
          <span class="status-chip neutral">${escapeHtml(
            workspace.chatbot_customization.target_market || "Global"
          )}</span>
          <span class="status-chip ${snapshot.orders_scope_ready ? "live" : "needs-setup"}">
            ${escapeHtml(snapshot.orders_scope_ready ? "Orders visible" : "Orders pending")}
          </span>
        </div>
      </div>

      <div class="analytics-metric-strip">
        ${metrics
          .map(
            (item) => `
              <article class="analytics-metric-card">
                <div class="analytics-metric-topline">
                  <span class="analytics-dot ${item.tone}"></span>
                  <div class="analytics-metric-main"><strong>${escapeHtml(item.value)}</strong></div>
                </div>
                <p class="analytics-metric-label">${escapeHtml(item.label)}</p>
                <p class="analytics-metric-copy">${escapeHtml(item.helper)}</p>
              </article>
            `
          )
          .join("")}
      </div>

      <div class="analytics-grid">
        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Journey Mix</h3>
              <p class="card-copy">Real shopper demand across the live styling journeys.</p>
            </div>
          </div>
          <div class="intent-stack">
            ${journeyRows
                .map(
                  (item) => `
                    <div class="intent-line">
                      <span>${escapeHtml(item.label)}</span>
                      <div class="intent-progress">
                        <div class="intent-progress-fill" style="width:${escapeHtml(
                          String(
                            Math.max(
                              4,
                              Math.round(
                                (item.started /
                                  Math.max(
                                    1,
                                    journeyRows.reduce((sum, row) => sum + row.started, 0)
                                  )) *
                                  100
                              )
                            )
                          )
                        )}%; background:#7adce3;"></div>
                      </div>
                      <strong>${escapeHtml(formatNumber(item.started))}</strong>
                    </div>
                  `
                )
                .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Shopify Category Readiness</h3>
              <p class="card-copy">Top synced categories and how ready they are for styling logic.</p>
            </div>
          </div>
          <div class="category-readiness-list">
            ${categoryRows.length
              ? categoryRows
                  .map(
                    (item) => `
                      <article class="category-readiness-row">
                        <div>
                          <strong>${escapeHtml(item.label)}</strong>
                          <p>${escapeHtml(
                            `${formatNumber(item.product_count)} products · ${formatNumber(
                              item.tagged_count
                            )} tag-ready`
                          )}</p>
                        </div>
                        <div class="category-readiness-meter">
                          <div class="category-readiness-fill" style="width:${escapeHtml(
                            String(Math.max(6, item.coverage))
                          )}%"></div>
                          <span>${escapeHtml(formatPercentValue(item.coverage))}</span>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : '<p class="empty-copy">Sync a Shopify catalog to reveal category readiness.</p>'}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Live Shopify Products</h3>
              <p class="card-copy">Fresh catalog items the assistant can currently reach for.</p>
            </div>
          </div>
          <div class="style-grid">
            ${snapshot.recent_products
              .slice(0, 3)
              .map(
                (item) => `
                  <article class="style-item">
                    ${
                      item.image_url
                        ? `<img class="style-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(
                            item.title
                          )}" />`
                        : `<div class="style-thumb">${escapeHtml(getBrandInitials(item.category || item.title))}</div>`
                    }
                    <strong>${escapeHtml(item.category || "Catalog")}</strong>
                    <p>${escapeHtml(item.title)}</p>
                  </article>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Journey Performance Matrix</h3>
              <p class="card-copy">Actual usage, reaction, and order-assist signals by chatbot path.</p>
            </div>
          </div>
          <div class="table-scroll">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Journey</th>
                  <th>Started</th>
                  <th>Reaction Rate</th>
                  <th>Order Assist</th>
                </tr>
              </thead>
              <tbody>
                ${journeyRows
                  .map(
                    (item) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(item.label)}</strong>
                          <span>${escapeHtml(
                            item.last_activity
                              ? `Last activity ${formatTimestamp(item.last_activity)}`
                              : "No activity yet"
                          )}</span>
                        </td>
                        <td>${escapeHtml(formatNumber(item.started))}</td>
                        <td>${escapeHtml(formatPercentValue(item.shopperReactionRate))}</td>
                        <td>${escapeHtml(formatPercentValue(item.conversion_rate, item.conversion_rate % 1 ? 2 : 0))}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </article>

        <article class="workspace-card analytics-side-card">
          <div class="card-header">
            <div>
              <h3>Intent-To-Catalog Gap Radar</h3>
              <p class="card-copy">A differentiated merchant-brain view that highlights where shopper demand outruns catalog intelligence.</p>
            </div>
          </div>
          <div class="analytics-note-list">
            ${gapRadar
              .map(
                (item) => `
                  <article class="analytics-note">
                    <span class="signal-dot"></span>
                    <div>
                      <p class="list-title">${escapeHtml(item.title)}</p>
                      <p>${escapeHtml(item.detail)}</p>
                      <span class="analytics-note-score">${escapeHtml(item.score)}</span>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Feedback Dynamics</h3>
              <p class="card-copy">Live reactions captured directly from storefront recommendation feedback.</p>
            </div>
          </div>
          <div class="satisfaction-grid">
            ${feedbackRows
              .map(
                (item) => `
                  <div class="satisfaction-stat">
                    <strong>${escapeHtml(formatNumber(item.value))}</strong>
                    <span>${escapeHtml(item.label)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Merchant Memory Surface</h3>
              <p class="card-copy">One place to see which merchant-authored assets are shaping the assistant right now.</p>
            </div>
          </div>
          <div class="memory-surface-grid">
            ${memorySurface
              .map(
                (item) => `
                  <article class="memory-surface-card">
                    <strong>${escapeHtml(item.value)}</strong>
                    <span>${escapeHtml(item.label)}</span>
                    <p>${escapeHtml(item.helper)}</p>
                  </article>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <h3>Commerce Visibility</h3>
              <p class="card-copy">Actual Shopify order data available to the merchant brain right now.</p>
            </div>
          </div>
          <div class="detail-list">
            <div class="detail-row"><span>Orders status</span><strong>${escapeHtml(
              snapshot.orders_scope_ready ? "Connected" : "Pending"
            )}</strong></div>
            <div class="detail-row"><span>Orders imported</span><strong>${escapeHtml(
              formatNumber(snapshot.orders_imported)
            )}</strong></div>
            <div class="detail-row"><span>AI-assisted orders</span><strong>${escapeHtml(
              formatNumber(snapshot.ai_assisted_orders)
            )}</strong></div>
            <div class="detail-row"><span>Revenue assisted</span><strong>${escapeHtml(
              formatCurrencyValue(snapshot.revenue_assisted)
            )}</strong></div>
            <div class="detail-row"><span>Average order value</span><strong>${escapeHtml(
              formatCurrencyValue(snapshot.average_order_value)
            )}</strong></div>
            <div class="detail-row"><span>Last orders sync</span><strong>${escapeHtml(
              formatTimestamp(snapshot.last_orders_sync)
            )}</strong></div>
          </div>
        </article>

        <article class="workspace-card analytics-side-card">
          <div class="card-header">
            <div>
              <h3>Live Feed</h3>
              <p class="card-copy">Latest Shopify-synced or storefront-recorded events.</p>
            </div>
          </div>
          <div class="activity-stack">
            ${renderActivityFeed(snapshot)}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderBotBuilderPage(snapshot) {
  const kpis = buildBuilderKpisAccurate(snapshot);
  const needsAttention = buildBuilderAttentionAccurate(snapshot);
  const journeys = getJourneyRows(snapshot);
  const previewState = getBuilderPreviewStateAccurate(snapshot);
  const funnel = buildJourneyFunnelAccurate(snapshot);
  const recentActivity = snapshot.recent_activity.slice(0, 5);
  const trustPills = [
    `${formatNumber(snapshot.products_imported)} catalog products`,
    `${formatPercentValue(getCoverage(snapshot))} tagged coverage`,
    `${formatNumber((snapshot.data_quality && snapshot.data_quality.brand_memory_assets) || 0)} merchant memory assets`,
    snapshot.orders_scope_ready
      ? `${formatNumber(snapshot.orders_imported)} Shopify orders visible`
      : "Order attribution pending",
  ];

  return `
    <section class="section-stack">
      <div class="analytics-live-banner">
        <span class="inline-badge">Live builder engine</span>
        <p>Connected to the real-time merchant workspace and refreshing automatically.</p>
      </div>

      <div class="builder-kpi-grid">
        ${kpis
          .map(
            (item) => `
              <article class="builder-kpi-card">
                <div class="builder-kpi-top">
                  <span class="builder-status-dot ${escapeHtml(item.tone)}"></span>
                  <p>${escapeHtml(item.label)}</p>
                </div>
                <strong>${escapeHtml(item.value)}</strong>
                <span class="builder-kpi-detail">${escapeHtml(item.detail)}</span>
              </article>
            `
          )
          .join("")}
      </div>

      <article class="workspace-card">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">Needs Attention</p>
            <h3>What the merchant should review next</h3>
            <p class="card-copy">These issues are generated from live journey performance, setup coverage, and AI training health.</p>
          </div>
        </div>
        <div class="attention-grid">
          ${needsAttention
            .map(
              (item) => `
                <article class="attention-card">
                  <div>
                    <p class="attention-title">${escapeHtml(item.title)}</p>
                    <p class="attention-copy">${escapeHtml(item.detail)}</p>
                  </div>
                  <button
                    class="secondary-button"
                    type="button"
                    data-action="${escapeHtml(item.action)}"
                    data-target="${escapeHtml(item.actionTarget || "")}"
                  >
                    ${escapeHtml(item.ctaLabel)}
                  </button>
                </article>
              `
            )
            .join("")}
        </div>
      </article>

      <div class="builder-control-grid">
        <div class="builder-left-stack">
          <article class="workspace-card">
            <div class="card-header">
              <div>
                <p class="card-eyebrow">Engine Control</p>
                <h3>Experience Blocks</h3>
                <p class="card-copy">Control each flow like a productized engine block with live usage and conversion context.</p>
              </div>
            </div>
            <div class="table-scroll">
              <div class="engine-block-table">
                <div class="engine-block-head">
                  <span>Block</span>
                  <span>Status</span>
                  <span>Usage</span>
                  <span>Conversion Rate</span>
                  <span>Actions</span>
                </div>
                ${journeys
                  .map(
                    (item) => `
                      <article class="engine-block-row">
                        <div>
                          <p class="engine-block-title">${escapeHtml(item.label)}</p>
                          <p class="engine-block-copy">${escapeHtml(
                            item.last_activity
                              ? `Last activity ${formatTimestamp(item.last_activity)}`
                              : "No live activity has been recorded yet."
                          )}</p>
                        </div>
                        <span class="status-chip ${escapeHtml(
                          item.status.toLowerCase().replace(/\s+/g, "-")
                        )}">${escapeHtml(item.status)}</span>
                        <strong>${escapeHtml(formatNumber(item.started))}</strong>
                        <strong>${escapeHtml(formatPercentValue(item.conversion_rate, item.conversion_rate % 1 ? 2 : 0))}</strong>
                        <div class="engine-block-actions">
                          <button
                            class="ghost-button"
                            type="button"
                            data-action="set-chatbot-page"
                            data-target="settings"
                          >
                            Edit
                          </button>
                          <button
                            class="ghost-button"
                            type="button"
                            data-action="builder-preview-flow"
                            data-target="${escapeHtml(item.key)}"
                          >
                            Preview
                          </button>
                          <button
                            class="secondary-button"
                            type="button"
                            data-action="builder-activate-flow"
                            data-target="${escapeHtml(item.key)}"
                          >
                            ${builderPriorityFlow === item.key ? "Activated" : "Activate"}
                          </button>
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </div>
          </article>

          <article class="workspace-card">
            <div class="card-header">
              <div>
                <p class="card-eyebrow">Journeys</p>
                <h3>Starter Journeys</h3>
                <p class="card-copy">Each journey shows live usage, conversion strength, and whether it is healthy or needs optimization.</p>
              </div>
            </div>
            <div class="journey-card-grid">
              ${journeys
                .map(
                  (item) => `
                    <article class="journey-card">
                      <div class="journey-card-top">
                        <span class="status-chip ${escapeHtml(
                          item.performanceLabel.toLowerCase().replace(/\s+/g, "-")
                        )}">${escapeHtml(item.performanceLabel)}</span>
                        <button
                          class="ghost-button"
                          type="button"
                          data-action="builder-preview-flow"
                          data-target="${escapeHtml(item.key)}"
                        >
                          Test
                        </button>
                      </div>
                      <h4>${escapeHtml(item.label)}</h4>
                      <p>${escapeHtml(
                        item.last_activity
                          ? `Last live touchpoint ${formatTimestamp(item.last_activity)}`
                          : "This journey has not been used yet."
                      )}</p>
                      <div class="journey-stats">
                        <div><strong>${escapeHtml(formatNumber(item.started))}</strong><span>Started</span></div>
                        <div><strong>${escapeHtml(formatPercentValue(item.conversion_rate, item.conversion_rate % 1 ? 2 : 0))}</strong><span>Conversion</span></div>
                        <div><strong>${escapeHtml(formatPercentValue(item.shopperReactionRate))}</strong><span>Reaction</span></div>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="workspace-card">
            <div class="card-header">
              <div>
                <p class="card-eyebrow">Journey Funnel</p>
                <h3>Drop-off Across Steps</h3>
              </div>
            </div>
            <div class="funnel-list">
              ${funnel
                .map(
                  (item) => `
                    <div class="funnel-row">
                      <div class="funnel-copy">
                        <strong>${escapeHtml(item.label)}</strong>
                        <span>${escapeHtml(formatNumber(item.value))} shoppers</span>
                      </div>
                      <div class="funnel-bar">
                        <div class="funnel-fill" style="width:${item.share}%"></div>
                      </div>
                      <strong>${escapeHtml(`${item.share}%`)}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="workspace-card">
            <div class="card-header">
              <div>
                <p class="card-eyebrow">Recent Activity</p>
                <h3>System Updates</h3>
              </div>
            </div>
            <div class="activity-stack">
              ${
                recentActivity.length
                  ? recentActivity
                      .map(
                        (item) => `
                          <article class="activity-row">
                            <div>
                              <p class="list-title">${escapeHtml(item.title)}</p>
                              <p class="list-subtitle">${escapeHtml(item.detail)}</p>
                            </div>
                            <p class="activity-time">${escapeHtml(formatTimestamp(item.timestamp))}</p>
                          </article>
                        `
                      )
                      .join("")
                  : '<p class="empty-copy">No system updates recorded yet.</p>'
              }
            </div>
          </article>
        </div>

        <aside class="builder-preview-column">
          <article class="workspace-card builder-preview-card">
            <div class="card-header">
              <div>
                <p class="card-eyebrow">Live Chatbot Preview</p>
                <h3>Test the flow before shoppers do</h3>
                <p class="card-copy">Simulate a journey using the live assistant tone, current prompts, and real catalog context.</p>
              </div>
            </div>

            <div class="builder-preview-flow-switches">
              ${previewState.journeys
                .map(
                  (item) => `
                    <button
                      class="ghost-button${previewState.activeJourney.key === item.key ? " active-inline-button" : ""}"
                      type="button"
                      data-action="builder-preview-flow"
                      data-target="${escapeHtml(item.key)}"
                    >
                      ${escapeHtml(item.label)}
                    </button>
                  `
                )
                .join("")}
            </div>

            <div class="builder-preview-chat">
              <div class="builder-preview-message user">
                ${escapeHtml(previewState.prompt)}
              </div>
              <div class="builder-preview-message bot">
                <p class="builder-preview-assistant">${escapeHtml(
                  workspace.chatbot_customization.assistant_name
                )}</p>
                <p>${escapeHtml(previewState.reply)}</p>
              </div>
            </div>

            <form id="builderPreviewForm" class="builder-preview-form">
              <input
                id="builderPreviewInput"
                type="text"
                value="${escapeHtml(previewState.prompt)}"
                placeholder="Type a test journey prompt..."
              />
              <button class="primary-button" type="submit">Run Test</button>
            </form>

            <div class="builder-preview-tags">
              ${trustPills
                .map((item) => `<span class="analytics-chip">${escapeHtml(item)}</span>`)
                .join("")}
            </div>

            <div class="builder-preview-product-list">
              ${previewState.supportingProducts.length
                ? previewState.supportingProducts
                    .map(
                      (item) => `
                        <article class="builder-preview-product">
                          <div class="settings-product-lockup">
                            ${
                              item.image_url
                                ? `<img class="settings-product-image" src="${escapeHtml(
                                    item.image_url
                                  )}" alt="${escapeHtml(item.title)}" />`
                                : `<div class="settings-product-fallback">${escapeHtml(
                                    getBrandInitials(item.category || item.title)
                                  )}</div>`
                            }
                            <div>
                              <p class="list-title">${escapeHtml(item.title)}</p>
                              <p class="list-subtitle">${escapeHtml(item.category || "Catalog")}</p>
                            </div>
                          </div>
                          <div class="catalog-product-actions">
                            <strong class="catalog-product-price">${escapeHtml(
                              formatPrice(item.price)
                            )}</strong>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : '<p class="empty-copy">Once the catalog is synced, live product anchors will appear here.</p>'}
            </div>
          </article>
        </aside>
      </div>
    </section>
  `;
}

function renderOverviewSection() {
  const snapshot = workspace.overview;
  const profile = workspace.profile;

  return `
    <section class="section-stack">
      <div class="metric-grid">
        ${renderMetricCards(snapshot)}
      </div>

      <div class="panel-grid panel-grid-overview">
        <article class="workspace-card workspace-card-wide">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Store Brain</p>
              <h3>Connected Store Profile</h3>
              <p class="card-copy">
                This profile is the control layer for any merchant connected to the StyledGenie intelligence system.
              </p>
            </div>
            <span class="inline-badge">Analytics &amp; KPI live</span>
          </div>

          <form id="profileForm" class="section-form">
            <div class="form-grid">
              <label class="field">
                <span>Brand Name</span>
                <input name="brand_name" value="${escapeHtml(profile.brand_name)}" />
              </label>

              <label class="field">
                <span>Connected Shopify Domain</span>
                <input
                  name="connected_store_domain"
                  value="${escapeHtml(profile.connected_store_domain)}"
                />
              </label>

              <label class="field">
                <span>Storefront Domain</span>
                <input name="storefront_domain" value="${escapeHtml(profile.storefront_domain)}" />
              </label>

              <label class="field">
                <span>Industry</span>
                <input name="industry" value="${escapeHtml(profile.industry)}" />
              </label>

              <label class="field field-full">
                <span>Brand Summary</span>
                <textarea name="brand_summary" rows="4">${escapeHtml(profile.brand_summary)}</textarea>
              </label>

              <label class="field field-full">
                <span>Merchandising Goal</span>
                <textarea name="merchandising_goal" rows="3">${escapeHtml(
                  profile.merchandising_goal
                )}</textarea>
              </label>
            </div>

            <div class="form-actions">
              <button class="primary-button" type="submit">Save Store Profile</button>
            </div>
          </form>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Recommendation Engine</p>
              <h3>Top Styling Services</h3>
            </div>
          </div>
          <div class="service-list">
            ${renderServiceMix(snapshot)}
          </div>
        </article>

        ${renderFeedbackSignals(snapshot)}

        <article class="workspace-card workspace-card-wide">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Live Catalog</p>
              <h3>AI Recommended Products</h3>
              <p class="card-copy">Real items from the connected store that are ready for styling recommendations.</p>
            </div>
          </div>
          <div class="list-stack">
            ${renderRecommendedProducts(snapshot)}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Brain Health</p>
              <h3>Operational Readiness</h3>
            </div>
          </div>
          <div class="detail-list">
            <div class="detail-row"><span>Imported Products</span><strong>${formatNumber(
              snapshot.products_imported
            )}</strong></div>
            <div class="detail-row"><span>Curated Looks</span><strong>${formatNumber(
              snapshot.curated_looks
            )}</strong></div>
            <div class="detail-row"><span>FAQ Entries</span><strong>${formatNumber(
              snapshot.faq_entries
            )}</strong></div>
            <div class="detail-row"><span>Knowledge Entries</span><strong>${formatNumber(
              snapshot.knowledge_entries
            )}</strong></div>
            <div class="detail-row"><span>Last Catalog Sync</span><strong>${escapeHtml(
              formatTimestamp(snapshot.last_catalog_sync)
            )}</strong></div>
          </div>
        </article>

        <article class="workspace-card workspace-card-full">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Recent Activity</p>
              <h3>Latest AI Sessions</h3>
            </div>
          </div>
          <div class="activity-stack">
            ${renderActivityFeed(snapshot)}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderChatbotSection() {
  const settings = workspace.chatbot_customization;
  const snapshot = workspace.overview;
  const promptPreview = getPreviewPromptLines(settings.suggested_prompts);
  const brandName = settings.brand_name || workspace.profile.brand_name || "StyledGenie";
  const previewLogo = settings.logo_url
    ? `<img class="customizer-logo-image" src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(
        brandName
      )} logo" />`
    : `<span class="customizer-logo-fallback">${escapeHtml(getBrandInitials(brandName))}</span>`;

  const moduleCards = getChatbotModuleCards(snapshot);

  const paletteControls = [
    { name: "primary_color", label: "Primary", value: settings.primary_color },
    { name: "accent_color", label: "Accent", value: settings.accent_color },
    { name: "surface_color", label: "Surface", value: settings.surface_color },
    { name: "bubble_color", label: "Bubble", value: settings.bubble_color },
    { name: "text_color", label: "Text", value: settings.text_color },
  ];

  const headerActions = `
    <span class="status-chip neutral">${escapeHtml(snapshot.store_domain || "Store pending")}</span>
    <span class="status-chip ${snapshot.orders_scope_ready ? "live" : "needs-setup"}">
      ${escapeHtml(snapshot.orders_scope_ready ? "Commerce visible" : "Commerce pending")}
    </span>
  `;

  let pageContent = "";

  if (activeChatbotPage === "analytics") {
    pageContent = renderChatbotAnalyticsPage(snapshot);
  } else if (activeChatbotPage === "builder") {
    pageContent = renderBotBuilderPage(snapshot);
  } else {
    const settingsPulse = buildSettingsPulse(snapshot);
    const categoryRows = getCategoryRows(snapshot).slice(0, 4);
    const memorySurface = buildMemorySurface(snapshot);
    const freshnessHours =
      snapshot.data_quality && snapshot.data_quality.catalog_freshness_hours !== null
        ? `${snapshot.data_quality.catalog_freshness_hours}h since sync`
        : "Freshness pending";

    pageContent = `
      <div class="settings-pulse-grid">
        ${settingsPulse
          .map(
            (item) => `
              <article class="settings-pulse-card">
                <span class="card-eyebrow">${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <p>${escapeHtml(item.helper)}</p>
              </article>
            `
          )
          .join("")}
      </div>

      <div class="panel-grid chatbot-customizer-grid">
        <article class="workspace-card chatbot-preview-card">
          <div class="chatbot-preview-shell" style="
            --bot-primary:${escapeHtml(settings.primary_color)};
            --bot-accent:${escapeHtml(settings.accent_color)};
            --bot-surface:${escapeHtml(settings.surface_color)};
            --bot-bubble:${escapeHtml(settings.bubble_color)};
            --bot-text:${escapeHtml(settings.text_color)};
            --preview-heading-font:${escapeHtml(settings.heading_font)};
            --preview-body-font:${escapeHtml(settings.body_font)};
          " id="chatbotPreviewShell">
            <div class="chatbot-preview-topbar">
              <div class="chatbot-brand-lockup">
                <div class="customizer-logo-chip" id="chatbotPreviewLogo">${previewLogo}</div>
                <strong id="chatbotPreviewBrandName">${escapeHtml(brandName)}</strong>
              </div>
              <span class="chatbot-preview-menu">•••</span>
            </div>

            <div class="chatbot-preview-stage">
              <div class="chatbot-preview-bubble">
                <p class="chatbot-preview-eyebrow" id="chatbotPreviewAssistantName">${escapeHtml(
                  settings.assistant_name
                )}</p>
                <h4 id="chatbotPreviewWelcomeTitle">${escapeHtml(settings.welcome_title)}</h4>
                <p id="chatbotPreviewWelcomeMessage">${escapeHtml(settings.welcome_message)}</p>
                <ul class="chatbot-preview-points">
                  <li id="chatbotPreviewTone">Tone: ${escapeHtml(settings.tone_of_voice)}</li>
                  <li id="chatbotPreviewTypography">Typography: ${escapeHtml(
                    settings.heading_font
                  )} with ${escapeHtml(settings.body_font)}</li>
                  <li id="chatbotPreviewMarket">Target market: ${escapeHtml(
                    settings.target_market
                  )}</li>
                  <li id="chatbotPreviewStrictness">Recommendation strictness: ${escapeHtml(
                    settings.recommendation_strictness
                  )}</li>
                  <li id="chatbotPreviewDecisionMode">Decision mode: ${escapeHtml(
                    settings.decision_mode_default
                  )}</li>
                </ul>
              </div>

              <div class="chatbot-preview-prompts" id="chatbotPreviewPrompts">
                ${promptPreview
                  .map((prompt) => `<span class="prompt-chip">${escapeHtml(prompt)}</span>`)
                  .join("")}
              </div>

              <button class="chatbot-preview-button" type="button">Done</button>
            </div>
          </div>
        </article>

        <article class="workspace-card chatbot-controls-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Settings</p>
              <h3>Brand &amp; Bot Controls</h3>
              <p class="card-copy">Adjust the bot preview live, then save when the styling feels right for the connected merchant.</p>
            </div>
          </div>

          <form id="chatbotForm" class="section-form">
            <div class="control-group">
              <p class="control-group-title">Brand Setup</p>
              <div class="form-grid">
                <label class="field">
                  <span>Brand Name</span>
                  <input name="brand_name" value="${escapeHtml(brandName)}" />
                </label>

                <label class="field">
                  <span>Assistant Name</span>
                  <input name="assistant_name" value="${escapeHtml(settings.assistant_name)}" />
                </label>

                <label class="field">
                  <span>Welcome Title</span>
                  <input name="welcome_title" value="${escapeHtml(settings.welcome_title)}" />
                </label>

                <label class="field">
                  <span>Target Market</span>
                  <select name="target_market">
                    ${renderSelectOptions(chatbotTargetMarkets, settings.target_market)}
                  </select>
                </label>

                <label class="field field-full">
                  <span>Logo URL</span>
                  <input
                    name="logo_url"
                    value="${escapeHtml(settings.logo_url)}"
                    placeholder="Paste a hosted .png or .jpg logo URL"
                  />
                  <small class="field-hint">
                    Paste a logo image URL or upload a PNG / JPG file below.
                  </small>
                </label>

                <label class="field field-full">
                  <span>Upload Logo (.png or .jpg)</span>
                  <input
                    class="file-picker"
                    type="file"
                    name="logo_file"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  />
                  <small class="field-hint" id="logoUploadHint">
                    Choose a PNG or JPG file to load it into the preview and save it with the chatbot settings.
                  </small>
                </label>

                <label class="field field-full">
                  <span>Welcome Message</span>
                  <textarea name="welcome_message" rows="4">${escapeHtml(
                    settings.welcome_message
                  )}</textarea>
                </label>
              </div>
            </div>

            <div class="control-group">
              <p class="control-group-title">Color Palette</p>
              <div class="palette-grid">
                ${paletteControls
                  .map(
                    (item) => `
                      <label class="palette-control">
                        <input type="color" name="${escapeHtml(item.name)}" value="${escapeHtml(item.value)}" />
                        <strong>${escapeHtml(item.value.toUpperCase())}</strong>
                        <span>${escapeHtml(item.label)}</span>
                      </label>
                    `
                  )
                  .join("")}
              </div>
            </div>

            <div class="control-group">
              <p class="control-group-title">Typography &amp; Styling</p>
              <div class="form-grid">
                <label class="field">
                  <span>Heading Font</span>
                  <select name="heading_font">
                    ${renderSelectOptions(chatbotFontOptions, settings.heading_font)}
                  </select>
                </label>

                <label class="field">
                  <span>Body Font</span>
                  <select name="body_font">
                    ${renderSelectOptions(chatbotFontOptions, settings.body_font)}
                  </select>
                </label>

                <label class="field">
                  <span>Primary Text Style</span>
                  <select name="primary_text_style">
                    ${renderSelectOptions(chatbotTextStyleOptions, settings.primary_text_style)}
                  </select>
                </label>

                <label class="field">
                  <span>Accent Text Style</span>
                  <select name="accent_text_style">
                    ${renderSelectOptions(chatbotTextStyleOptions, settings.accent_text_style)}
                  </select>
                </label>

                <label class="field">
                  <span>Body Text Style</span>
                  <select name="body_text_style">
                    ${renderSelectOptions(chatbotTextStyleOptions, settings.body_text_style)}
                  </select>
                </label>

                <label class="field field-full">
                  <span>Tone of Voice</span>
                  <textarea name="tone_of_voice" rows="3">${escapeHtml(
                    settings.tone_of_voice
                  )}</textarea>
                </label>

                <label class="field field-full">
                  <span>Stylist Signature</span>
                  <textarea name="stylist_signature" rows="3">${escapeHtml(
                    settings.stylist_signature
                  )}</textarea>
                </label>

                <label class="field field-full">
                  <span>Suggested Prompts (one per line)</span>
                  <textarea name="suggested_prompts" rows="4">${escapeHtml(
                    settings.suggested_prompts.join("\n")
                  )}</textarea>
                </label>
              </div>
            </div>

            <div class="control-group">
              <p class="control-group-title">Merchant Controls</p>
              <div class="form-grid">
                <label class="field">
                  <span>Recommendation Strictness</span>
                  <select name="recommendation_strictness">
                    ${renderSelectOptions(
                      recommendationStrictnessOptions,
                      settings.recommendation_strictness
                    )}
                  </select>
                  <small class="field-hint">How tightly the assistant should stay inside the strongest styling match.</small>
                </label>

                <label class="field">
                  <span>Decision Mode Default</span>
                  <select name="decision_mode_default">
                    ${renderSelectOptions(decisionModeOptions, settings.decision_mode_default)}
                  </select>
                  <small class="field-hint">Choose whether shoppers are prompted to compare or get one confident direction.</small>
                </label>

                <label class="field">
                  <span>Product Prioritization</span>
                  <select name="product_prioritization">
                    ${renderSelectOptions(
                      productPrioritizationOptions,
                      settings.product_prioritization
                    )}
                  </select>
                  <small class="field-hint">Bias recommendations toward premium, accessible, or pure best-match products.</small>
                </label>

                <label class="field">
                  <span>Strict Mode Handling</span>
                  <select name="strict_mode_handling">
                    ${renderSelectOptions(
                      strictModeHandlingOptions,
                      settings.strict_mode_handling
                    )}
                  </select>
                  <small class="field-hint">Control whether StyledGenie repairs weak outputs or rejects them immediately.</small>
                </label>

                <label class="field">
                  <span>Product Intelligence Apply Mode</span>
                  <select name="auto_apply_product_intelligence">
                    ${renderSelectOptions(
                      autoApplyOptions,
                      settings.auto_apply_product_intelligence
                    )}
                  </select>
                  <small class="field-hint">Decide if AI tagging should auto-apply or wait for merchant review.</small>
                </label>

                <label class="field">
                  <span>Support Routing Email</span>
                  <input
                    name="support_routing_email"
                    type="email"
                    value="${escapeHtml(settings.support_routing_email)}"
                    placeholder="support@yourstore.com"
                  />
                  <small class="field-hint">Used when the assistant needs to route damaged-item or escalation cases.</small>
                </label>
              </div>
            </div>

            <div class="form-actions">
              <button class="primary-button" type="submit">Save Chatbot Customization</button>
            </div>
          </form>
        </article>
      </div>

      <div class="panel-grid two-column">
        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Live Shopify Feed</p>
              <h3>What the bot can style with right now</h3>
              <p class="card-copy">These are real synced products and category signals from the connected Shopify store.</p>
            </div>
            <span class="inline-badge">${escapeHtml(freshnessHours)}</span>
          </div>
          <div class="settings-data-list">
            ${(snapshot.recent_products || [])
              .slice(0, 4)
              .map(
                (item) => `
                  <article class="settings-product-row">
                    <div class="settings-product-lockup">
                      ${
                        item.image_url
                          ? `<img class="settings-product-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(
                              item.title
                            )}" />`
                          : `<div class="settings-product-fallback">${escapeHtml(
                              getBrandInitials(item.category || item.title)
                            )}</div>`
                      }
                      <div>
                        <p class="list-title">${escapeHtml(item.title)}</p>
                        <p class="list-subtitle">${escapeHtml(item.category || "General")}</p>
                      </div>
                    </div>
                    <strong>${escapeHtml(formatPrice(item.price))}</strong>
                  </article>
                `
              )
              .join("")}
          </div>
          <div class="settings-chip-row">
            ${categoryRows
              .map(
                (item) => `
                  <span class="analytics-chip">${escapeHtml(
                    `${item.label} · ${formatPercentValue(item.coverage)} ready`
                  )}</span>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">AI Performance Overview</p>
              <h3>Merchant-facing readiness</h3>
              <p class="card-copy">See whether catalog quality, support coverage, and styling memory are strong enough to drive confident shopper experiences.</p>
            </div>
          </div>
          <div class="memory-surface-grid">
            ${memorySurface
              .map(
                (item) => `
                  <article class="memory-surface-card">
                    <strong>${escapeHtml(item.value)}</strong>
                    <span>${escapeHtml(item.label)}</span>
                    <p>${escapeHtml(item.helper)}</p>
                  </article>
                `
              )
              .join("")}
          </div>
          <div class="detail-list">
            <div class="detail-row"><span>Average tags per product</span><strong>${escapeHtml(
              String((snapshot.data_quality && snapshot.data_quality.avg_tags_per_product) || 0)
            )}</strong></div>
            <div class="detail-row"><span>Products with storefront links</span><strong>${escapeHtml(
              formatNumber((snapshot.data_quality && snapshot.data_quality.products_with_links) || 0)
            )}</strong></div>
            <div class="detail-row"><span>Products with images</span><strong>${escapeHtml(
              formatNumber((snapshot.data_quality && snapshot.data_quality.products_with_images) || 0)
            )}</strong></div>
            <div class="detail-row"><span>Support coverage ratio</span><strong>${escapeHtml(
              formatPercentValue((snapshot.data_quality && snapshot.data_quality.support_coverage_ratio) || 0, 0)
            )}</strong></div>
          </div>
          <div class="callout-card premium-callout">
            <p>
              Use this surface as a simple go-live check: if product signals, support answers, and catalog coverage look healthy here,
              the storefront assistant is much more likely to feel sharp, decisive, and conversion-friendly.
            </p>
          </div>
        </article>
      </div>
    `;
  }

  return `
    <section class="section-stack">
      <div class="customizer-stage-header">
        <div class="customizer-stage-copy">
          <p class="card-eyebrow">Chatbot Design Studio</p>
          <h3>Chatbot Customizer</h3>
          <p class="card-copy">
            Tailor the chatbot’s look and feel to your brand identity, colours, typography, and welcome flow.
          </p>
        </div>
        <div class="customizer-stage-actions">
          ${headerActions}
        </div>
      </div>

      <div class="customizer-module-row">
        ${moduleCards
          .map(
            (item) => `
              <button
                class="customizer-module${item.active ? " active" : ""}"
                type="button"
                data-action="set-chatbot-page"
                data-page="${escapeHtml(item.key)}"
              >
                <div class="customizer-module-icon">${item.icon}</div>
                <div>
                  <p class="customizer-module-title">${escapeHtml(item.label)}</p>
                  <p class="customizer-module-meta">${escapeHtml(item.meta)}</p>
                </div>
              </button>
            `
          )
          .join("")}
      </div>

      ${pageContent}
    </section>
  `;
}

function renderProductDescriptionStudio(snapshot) {
  const products = (snapshot.recent_products || []).filter((item) => item.id);
  if (!products.length) {
    return `
      <article class="workspace-card workspace-card-full">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">AI Product Descriptions</p>
            <h3>Description Studio</h3>
            <p class="card-copy">Sync more products to generate polished, merchant-ready description drafts.</p>
          </div>
        </div>
        <p class="empty-copy">No synced products are ready for description drafting yet.</p>
      </article>
    `;
  }

  const selectedId = products.some((item) => item.id === productDescriptionState.productId)
    ? productDescriptionState.productId
    : products[0].id;
  const selectedProduct = products.find((item) => item.id === selectedId) || products[0];
  const isLoading =
    productDescriptionState.loading && productDescriptionState.productId === selectedProduct.id;
  const hasDraft =
    productDescriptionState.description &&
    productDescriptionState.productId === selectedProduct.id &&
    !isLoading;
  const hasError =
    productDescriptionState.error &&
    productDescriptionState.productId === selectedProduct.id &&
    !isLoading;

  const outputMarkup = isLoading
    ? `<p class="card-copy">Generating a concise premium draft now...</p>`
    : hasDraft
      ? `
          <div class="description-output-card">
            <p class="card-eyebrow">Draft Description</p>
            <p class="description-output-copy">${escapeHtml(productDescriptionState.description)}</p>
            <div class="description-note-list">
              ${(productDescriptionState.notes || [])
                .map((note) => `<p>${escapeHtml(note)}</p>`)
                .join("")}
            </div>
          </div>
        `
      : hasError
        ? `<p class="empty-copy">${escapeHtml(productDescriptionState.error)}</p>`
        : `<p class="empty-copy">Choose a product to generate a short, polished draft with merchandising notes.</p>`;

  return `
    <article class="workspace-card workspace-card-full">
      <div class="card-header">
        <div>
          <p class="card-eyebrow">AI Product Descriptions</p>
          <h3>Description Studio</h3>
          <p class="card-copy">Generate concise PDP copy and merchant notes without leaving the catalog workflow.</p>
        </div>
      </div>

      <div class="description-studio-grid">
        <div class="settings-data-list">
          ${products
            .map(
              (item) => `
                <article class="settings-product-row${item.id === selectedId ? " active-description-product" : ""}">
                  <div class="settings-product-lockup">
                    ${
                      item.image_url
                        ? `<img class="settings-product-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(
                            item.title
                          )}" />`
                        : `<div class="settings-product-fallback">${escapeHtml(
                            getBrandInitials(item.category || item.title)
                          )}</div>`
                    }
                    <div>
                      <p class="list-title">${escapeHtml(item.title)}</p>
                      <p class="list-subtitle">${escapeHtml(item.category || "General")}</p>
                    </div>
                  </div>
                  <div class="description-action-stack">
                    <strong>${escapeHtml(formatPrice(item.price))}</strong>
                    <button
                      class="secondary-button"
                      type="button"
                      data-action="generate-product-description"
                      data-product-id="${escapeHtml(item.id)}"
                    >
                      ${
                        productDescriptionState.productId === item.id && hasDraft
                          ? "Refresh draft"
                          : "Generate draft"
                      }
                    </button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>

        <div class="description-preview-shell">
          <div class="detail-list">
            <div class="detail-row"><span>Selected product</span><strong>${escapeHtml(
              selectedProduct.title
            )}</strong></div>
            <div class="detail-row"><span>Category</span><strong>${escapeHtml(
              selectedProduct.category || "General"
            )}</strong></div>
            <div class="detail-row"><span>Price</span><strong>${escapeHtml(
              formatPrice(selectedProduct.price)
            )}</strong></div>
          </div>
          ${outputMarkup}
        </div>
      </div>
    </article>
  `;
}

function renderCatalogSection() {
  const settings = workspace.catalog_intelligence;
  const profile = workspace.profile;
  const descriptionStudio = renderProductDescriptionStudio(workspace.overview);

  return `
    <section class="section-stack">
      <div class="panel-grid two-column">
        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Catalog Brain</p>
              <h3>Catalog Intelligence Rules</h3>
              <p class="card-copy">Tell the system how to interpret products, prioritize attributes, and guide outfit compatibility.</p>
            </div>
          </div>

          <form id="catalogForm" class="section-form">
            <div class="form-grid">
              <label class="field field-full">
                <span>Target Customer</span>
                <textarea name="target_customer" rows="3">${escapeHtml(
                  settings.target_customer
                )}</textarea>
              </label>

              <label class="field field-full">
                <span>Brand Positioning</span>
                <textarea name="brand_positioning" rows="3">${escapeHtml(
                  settings.brand_positioning
                )}</textarea>
              </label>

              <label class="field field-full">
                <span>Priority Tags</span>
                <textarea name="priority_tags" rows="3">${escapeHtml(
                  settings.priority_tags
                )}</textarea>
              </label>

              <label class="field field-full">
                <span>Compatibility Rules</span>
                <textarea name="compatibility_rules" rows="4">${escapeHtml(
                  settings.compatibility_rules
                )}</textarea>
              </label>

              <label class="field">
                <span>Seasonal Focus</span>
                <textarea name="seasonal_focus" rows="3">${escapeHtml(
                  settings.seasonal_focus
                )}</textarea>
              </label>

              <label class="field">
                <span>Fit Guidance</span>
                <textarea name="fit_guidance" rows="3">${escapeHtml(
                  settings.fit_guidance
                )}</textarea>
              </label>
            </div>

            <div class="form-actions">
              <button class="primary-button" type="submit">Save Catalog Intelligence</button>
            </div>
          </form>
        </article>

        <article class="workspace-card">
          <div class="card-header">
            <div>
              <p class="card-eyebrow">Connection View</p>
              <h3>Store Intelligence Status</h3>
            </div>
          </div>

          <div class="detail-list">
            <div class="detail-row"><span>Brand</span><strong>${escapeHtml(
              profile.brand_name
            )}</strong></div>
            <div class="detail-row"><span>Shopify Domain</span><strong>${escapeHtml(
              profile.connected_store_domain
            )}</strong></div>
            <div class="detail-row"><span>Storefront</span><strong>${escapeHtml(
              profile.storefront_domain
            )}</strong></div>
            <div class="detail-row"><span>Products Imported</span><strong>${formatNumber(
              workspace.overview.products_imported
            )}</strong></div>
            <div class="detail-row"><span>Distinct Styling Tags</span><strong>${formatNumber(
              workspace.overview.styling_tags
            )}</strong></div>
            <div class="detail-row"><span>Last Sync</span><strong>${escapeHtml(
              formatTimestamp(workspace.overview.last_catalog_sync)
            )}</strong></div>
          </div>

          <div class="callout-card">
            <p>
              This is where product intelligence becomes merchant-ready: tighter tags, clearer compatibility rules,
              stronger sizing signals, and cleaner styling outputs across the storefront assistant.
            </p>
          </div>
        </article>
      </div>

      ${descriptionStudio}
    </section>
  `;
}

function renderLooksSection() {
  const items = workspace.looks.length
    ? workspace.looks
    : [{ title: "", occasion: "", style_notes: "" }];

  return `
    <section class="section-stack">
      <article class="workspace-card">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">Merchandising</p>
            <h3>Look Management</h3>
            <p class="card-copy">Build reusable full-look directions so the AI can recommend outfits, not isolated products.</p>
          </div>
        </div>

        <form id="looksForm" class="section-form">
          <div class="repeater-list">
            ${items
              .map(
                (item, index) => `
                  <article class="repeater-card look-item">
                    <div class="repeater-header">
                      <h4>Look ${index + 1}</h4>
                      <button class="ghost-button" type="button" data-action="remove-look" data-index="${index}">
                        Remove
                      </button>
                    </div>

                    <div class="form-grid">
                      <label class="field">
                        <span>Look Title</span>
                        <input name="title" value="${escapeHtml(item.title)}" />
                      </label>

                      <label class="field">
                        <span>Occasion</span>
                        <input name="occasion" value="${escapeHtml(item.occasion)}" />
                      </label>

                      <label class="field field-full">
                        <span>Style Notes</span>
                        <textarea name="style_notes" rows="4">${escapeHtml(
                          item.style_notes
                        )}</textarea>
                      </label>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>

          <div class="form-actions split-actions">
            <button class="secondary-button" type="button" data-action="add-look">Add Another Look</button>
            <button class="primary-button" type="submit">Save Look Management</button>
          </div>
        </form>
      </article>
    </section>
  `;
}

function renderCustomerCareSection() {
  const items = workspace.customer_care.length
    ? workspace.customer_care
    : [{ question: "", answer: "", category: "" }];

  return `
    <section class="section-stack">
      <article class="workspace-card">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">Support Intelligence</p>
            <h3>Customer Care Setup</h3>
            <p class="card-copy">Maintain the answers your AI should use when shoppers ask about delivery, sizing, returns, and support.</p>
          </div>
        </div>

        <form id="careForm" class="section-form">
          <div class="repeater-list">
            ${items
              .map(
                (item, index) => `
                  <article class="repeater-card care-item">
                    <div class="repeater-header">
                      <h4>FAQ ${index + 1}</h4>
                      <button class="ghost-button" type="button" data-action="remove-care" data-index="${index}">
                        Remove
                      </button>
                    </div>

                    <div class="form-grid">
                      <label class="field">
                        <span>Category</span>
                        <input name="category" value="${escapeHtml(item.category)}" />
                      </label>

                      <label class="field field-full">
                        <span>Question</span>
                        <input name="question" value="${escapeHtml(item.question)}" />
                      </label>

                      <label class="field field-full">
                        <span>Answer</span>
                        <textarea name="answer" rows="4">${escapeHtml(item.answer)}</textarea>
                      </label>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>

          <div class="form-actions split-actions">
            <button class="secondary-button" type="button" data-action="add-care">Add FAQ</button>
            <button class="primary-button" type="submit">Save Customer Care Setup</button>
          </div>
        </form>
      </article>
    </section>
  `;
}

function renderKnowledgeSection() {
  const items = workspace.knowledge_base.length
    ? workspace.knowledge_base
    : [{ title: "", entry_type: "brand_guideline", body: "" }];

  return `
    <section class="section-stack">
      <article class="workspace-card">
        <div class="card-header">
          <div>
            <p class="card-eyebrow">Training Layer</p>
            <h3>Knowledge &amp; AI Training</h3>
            <p class="card-copy">Feed the AI with brand principles, fit rules, campaign notes, and style guidance it should follow.</p>
          </div>
        </div>

        <form id="knowledgeForm" class="section-form">
          <div class="repeater-list">
            ${items
              .map(
                (item, index) => `
                  <article class="repeater-card knowledge-item">
                    <div class="repeater-header">
                      <h4>Training Entry ${index + 1}</h4>
                      <button class="ghost-button" type="button" data-action="remove-knowledge" data-index="${index}">
                        Remove
                      </button>
                    </div>

                    <div class="form-grid">
                      <label class="field">
                        <span>Entry Title</span>
                        <input name="title" value="${escapeHtml(item.title)}" />
                      </label>

                      <label class="field">
                        <span>Entry Type</span>
                        <input name="entry_type" value="${escapeHtml(item.entry_type)}" />
                      </label>

                      <label class="field field-full">
                        <span>Training Content</span>
                        <textarea name="body" rows="5">${escapeHtml(item.body)}</textarea>
                      </label>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>

          <div class="form-actions split-actions">
            <button class="secondary-button" type="button" data-action="add-knowledge">Add Training Entry</button>
            <button class="primary-button" type="submit">Save Knowledge &amp; AI Training</button>
          </div>
        </form>
      </article>
    </section>
  `;
}

function renderSection() {
  if (!workspace) {
    renderErrorState("The merchant workspace is still loading.");
    return;
  }

  if (activeSection === "overview") {
    mainContent.innerHTML = renderOverviewSection();
    wireActiveSection();
    return;
  }

  if (activeSection === "chatbot") {
    mainContent.innerHTML = renderChatbotSection();
    wireActiveSection();
    return;
  }

  if (activeSection === "catalog") {
    mainContent.innerHTML = renderCatalogSection();
    wireActiveSection();
    return;
  }

  if (activeSection === "looks") {
    mainContent.innerHTML = renderLooksSection();
    wireActiveSection();
    return;
  }

  if (activeSection === "care") {
    mainContent.innerHTML = renderCustomerCareSection();
    wireActiveSection();
    return;
  }

  mainContent.innerHTML = renderKnowledgeSection();
  wireActiveSection();
}

async function loadWorkspace(successMessage = "Workspace live") {
  setStatus("Loading workspace...", "neutral");

  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/workspace`);
    if (!response.ok) {
      throw new Error("Could not load merchant workspace");
    }

    workspace = await response.json();
    lastChatbotDraftFingerprint = getChatbotFingerprint(workspace.chatbot_customization);
    lastWorkspaceSnapshotFingerprint = getWorkspaceSnapshotFingerprint(workspace);
    updateShellChrome();
    renderSection();
    setStatus(successMessage, "success");
  } catch (error) {
    setStatus("Backend not reachable", "error");
    showToast(
      "Backend unavailable",
      "The merchant dashboard could not reach the API. Start the backend and reload the page.",
      "error"
    );
    renderErrorState(
      "Could not load the merchant workspace from the backend. Make sure the API server is running."
    );
  }
}

function shouldAutoRefreshWorkspace() {
  if (activeSection !== "chatbot") {
    return false;
  }

  if (activeChatbotPage === "settings") {
    const form = document.getElementById("chatbotForm");
    if (!form) {
      return true;
    }

    return getChatbotFingerprint(collectChatbotPayload(form)) === lastChatbotDraftFingerprint;
  }

  return ["analytics", "builder"].includes(activeChatbotPage);
}

async function refreshWorkspaceSilently(options = {}) {
  const { forceRender = false } = options;

  if (!workspace) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/workspace`);
    if (!response.ok) {
      return;
    }

    const nextWorkspace = await response.json();
    const nextFingerprint = getWorkspaceSnapshotFingerprint(nextWorkspace);

    if (!forceRender && nextFingerprint === lastWorkspaceSnapshotFingerprint) {
      return;
    }

    workspace = nextWorkspace;
    lastChatbotDraftFingerprint = getChatbotFingerprint(workspace.chatbot_customization);
    lastWorkspaceSnapshotFingerprint = nextFingerprint;
    updateShellChrome();
    renderSection();
    setStatus("Bot analytics live", "success");
  } catch (error) {
    // Keep the dashboard stable if a refresh pulse fails.
  }
}

function startWorkspaceHeartbeat() {
  if (workspaceHeartbeatTimer) {
    window.clearInterval(workspaceHeartbeatTimer);
  }

  workspaceHeartbeatTimer = window.setInterval(() => {
    if (!shouldAutoRefreshWorkspace()) {
      return;
    }

    refreshWorkspaceSilently();
  }, analyticsRefreshIntervalMs);
}

function getFormValue(form, selector) {
  const element = form.querySelector(selector);
  return element ? element.value.trim() : "";
}

function collectLookItems() {
  return Array.from(mainContent.querySelectorAll(".look-item")).map((card) => ({
    title: getFormValue(card, 'input[name="title"]'),
    occasion: getFormValue(card, 'input[name="occasion"]'),
    style_notes: getFormValue(card, 'textarea[name="style_notes"]'),
  }));
}

function collectCustomerCareItems() {
  return Array.from(mainContent.querySelectorAll(".care-item")).map((card) => ({
    category: getFormValue(card, 'input[name="category"]'),
    question: getFormValue(card, 'input[name="question"]'),
    answer: getFormValue(card, 'textarea[name="answer"]'),
  }));
}

function collectKnowledgeItems() {
  return Array.from(mainContent.querySelectorAll(".knowledge-item")).map((card) => ({
    title: getFormValue(card, 'input[name="title"]'),
    entry_type: getFormValue(card, 'input[name="entry_type"]') || "brand_guideline",
    body: getFormValue(card, 'textarea[name="body"]'),
  }));
}

function collectProfilePayload(form) {
  return {
    brand_name: getFormValue(form, 'input[name="brand_name"]'),
    connected_store_domain: getFormValue(form, 'input[name="connected_store_domain"]'),
    storefront_domain: getFormValue(form, 'input[name="storefront_domain"]'),
    industry: getFormValue(form, 'input[name="industry"]'),
    brand_summary: getFormValue(form, 'textarea[name="brand_summary"]'),
    merchandising_goal: getFormValue(form, 'textarea[name="merchandising_goal"]'),
  };
}

function collectChatbotPayload(form) {
  return {
    brand_name: getFormValue(form, 'input[name="brand_name"]'),
    logo_url: getFormValue(form, 'input[name="logo_url"]'),
    assistant_name: getFormValue(form, 'input[name="assistant_name"]'),
    welcome_title: getFormValue(form, 'input[name="welcome_title"]'),
    welcome_message: getFormValue(form, 'textarea[name="welcome_message"]'),
    tone_of_voice: getFormValue(form, 'textarea[name="tone_of_voice"]'),
    stylist_signature: getFormValue(form, 'textarea[name="stylist_signature"]'),
    primary_color: getFormValue(form, 'input[name="primary_color"]'),
    accent_color: getFormValue(form, 'input[name="accent_color"]'),
    surface_color: getFormValue(form, 'input[name="surface_color"]'),
    bubble_color: getFormValue(form, 'input[name="bubble_color"]'),
    text_color: getFormValue(form, 'input[name="text_color"]'),
    heading_font: getFormValue(form, 'select[name="heading_font"]'),
    body_font: getFormValue(form, 'select[name="body_font"]'),
    primary_text_style: getFormValue(form, 'select[name="primary_text_style"]'),
    accent_text_style: getFormValue(form, 'select[name="accent_text_style"]'),
    body_text_style: getFormValue(form, 'select[name="body_text_style"]'),
    target_market: getFormValue(form, 'select[name="target_market"]'),
    recommendation_strictness: getFormValue(form, 'select[name="recommendation_strictness"]'),
    auto_apply_product_intelligence: getFormValue(
      form,
      'select[name="auto_apply_product_intelligence"]'
    ),
    product_prioritization: getFormValue(form, 'select[name="product_prioritization"]'),
    support_routing_email: getFormValue(form, 'input[name="support_routing_email"]'),
    strict_mode_handling: getFormValue(form, 'select[name="strict_mode_handling"]'),
    decision_mode_default: getFormValue(form, 'select[name="decision_mode_default"]'),
    suggested_prompts: getFormValue(form, 'textarea[name="suggested_prompts"]')
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function updateChatbotPreviewFromForm(form) {
  if (!form) {
    return;
  }

  const draft = collectChatbotPayload(form);
  const brandName = draft.brand_name || workspace.profile.brand_name || "StyledGenie";
  const promptLines = getPreviewPromptLines(draft.suggested_prompts);
  const previewShell = document.getElementById("chatbotPreviewShell");
  const previewBrandName = document.getElementById("chatbotPreviewBrandName");
  const previewLogo = document.getElementById("chatbotPreviewLogo");
  const previewAssistantName = document.getElementById("chatbotPreviewAssistantName");
  const previewWelcomeTitle = document.getElementById("chatbotPreviewWelcomeTitle");
  const previewWelcomeMessage = document.getElementById("chatbotPreviewWelcomeMessage");
  const previewTone = document.getElementById("chatbotPreviewTone");
  const previewTypography = document.getElementById("chatbotPreviewTypography");
  const previewMarket = document.getElementById("chatbotPreviewMarket");
  const previewStrictness = document.getElementById("chatbotPreviewStrictness");
  const previewDecisionMode = document.getElementById("chatbotPreviewDecisionMode");
  const previewPrompts = document.getElementById("chatbotPreviewPrompts");

  if (previewShell) {
    previewShell.style.setProperty("--bot-primary", draft.primary_color || "#d8cfbd");
    previewShell.style.setProperty("--bot-accent", draft.accent_color || "#1d2430");
    previewShell.style.setProperty("--bot-surface", draft.surface_color || "#f7f2e7");
    previewShell.style.setProperty("--bot-bubble", draft.bubble_color || "#d8cfbd");
    previewShell.style.setProperty("--bot-text", draft.text_color || "#171717");
    previewShell.style.setProperty(
      "--preview-heading-font",
      draft.heading_font || "Playfair Display"
    );
    previewShell.style.setProperty("--preview-body-font", draft.body_font || "Avenir Next");
  }

  if (previewBrandName) {
    previewBrandName.textContent = brandName;
  }

  if (previewLogo) {
    previewLogo.innerHTML = draft.logo_url
      ? `<img class="customizer-logo-image" src="${escapeHtml(draft.logo_url)}" alt="${escapeHtml(
          brandName
        )} logo" />`
      : `<span class="customizer-logo-fallback">${escapeHtml(getBrandInitials(brandName))}</span>`;
  }

  if (previewAssistantName) {
    previewAssistantName.textContent = draft.assistant_name || "StyledGenie Stylist";
  }

  if (previewWelcomeTitle) {
    previewWelcomeTitle.textContent =
      draft.welcome_title || "Welcome to your AI styling concierge";
  }

  if (previewWelcomeMessage) {
    previewWelcomeMessage.textContent =
      draft.welcome_message ||
      "Help shoppers discover complete looks, get inspired by images, and receive support that feels personal.";
  }

  if (previewTone) {
    previewTone.textContent = `Tone: ${draft.tone_of_voice || "Warm, polished, confident, and empathetic."}`;
  }

  if (previewTypography) {
    previewTypography.textContent = `Typography: ${draft.heading_font || "Playfair Display"} with ${
      draft.body_font || "Avenir Next"
    }`;
  }

  if (previewMarket) {
    previewMarket.textContent = `Target market: ${draft.target_market || "Europe"}`;
  }

  if (previewStrictness) {
    previewStrictness.textContent = `Recommendation strictness: ${
      draft.recommendation_strictness || "balanced"
    }`;
  }

  if (previewDecisionMode) {
    previewDecisionMode.textContent = `Decision mode: ${
      draft.decision_mode_default || "offer_choice"
    }`;
  }

  if (previewPrompts) {
    previewPrompts.innerHTML = promptLines.length
      ? promptLines.map((prompt) => `<span class="prompt-chip">${escapeHtml(prompt)}</span>`).join("")
      : '<span class="prompt-chip">Add suggested prompts to preview the guided shopper journey.</span>';
  }
}

function setupChatbotLivePreview() {
  const form = document.getElementById("chatbotForm");
  if (!form) {
    return;
  }

  const fileInput = form.querySelector('input[name="logo_file"]');
  const logoUrlInput = form.querySelector('input[name="logo_url"]');
  const logoHint = document.getElementById("logoUploadHint");
  const syncPreview = () => updateChatbotPreviewFromForm(form);
  const scheduleAutosave = () => {
    if (chatbotAutosaveTimer) {
      window.clearTimeout(chatbotAutosaveTimer);
    }

    chatbotAutosaveTimer = window.setTimeout(() => {
      autosaveChatbotCustomization(form);
    }, 900);
  };

  if (fileInput && logoUrlInput) {
    fileInput.addEventListener("change", () => {
      const [file] = Array.from(fileInput.files || []);

      if (!file) {
        if (logoHint) {
          logoHint.textContent =
            "Choose a PNG or JPG file to load it into the preview and save it with the chatbot settings.";
        }
        return;
      }

      const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg"];
      const lowerName = file.name.toLowerCase();
      const hasValidExtension =
        lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");

      if (!allowedMimeTypes.includes(file.type) && !hasValidExtension) {
        fileInput.value = "";
        if (logoHint) {
          logoHint.textContent = "Only PNG and JPG files are supported.";
        }
        showToast(
          "Unsupported file",
          "Please upload a PNG or JPG logo file.",
          "error"
        );
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        fileInput.value = "";
        if (logoHint) {
          logoHint.textContent = "Please keep logo files under 2 MB.";
        }
        showToast(
          "File too large",
          "Please choose a PNG or JPG logo under 2 MB.",
          "error"
        );
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        logoUrlInput.value = typeof reader.result === "string" ? reader.result : "";
        if (logoHint) {
          logoHint.textContent = `${file.name} is loaded and ready to save.`;
        }
        syncPreview();
        scheduleAutosave();
        showToast(
          "Logo ready",
          "Your logo file is loaded into the preview. Click save to keep it.",
          "success"
        );
      });
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("input", () => {
    syncPreview();
    scheduleAutosave();
  });
  form.addEventListener("change", () => {
    syncPreview();
    scheduleAutosave();
  });
  syncPreview();
}

function collectCatalogPayload(form) {
  return {
    target_customer: getFormValue(form, 'textarea[name="target_customer"]'),
    brand_positioning: getFormValue(form, 'textarea[name="brand_positioning"]'),
    priority_tags: getFormValue(form, 'textarea[name="priority_tags"]'),
    compatibility_rules: getFormValue(form, 'textarea[name="compatibility_rules"]'),
    seasonal_focus: getFormValue(form, 'textarea[name="seasonal_focus"]'),
    fit_guidance: getFormValue(form, 'textarea[name="fit_guidance"]'),
  };
}

async function autosaveChatbotCustomization(form) {
  if (!form || !workspace) {
    return;
  }

  const payload = collectChatbotPayload(form);
  const nextFingerprint = getChatbotFingerprint(payload);

  if (nextFingerprint === lastChatbotDraftFingerprint) {
    return;
  }

  setStatus("Syncing chatbot customization...", "neutral");

  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/chatbot-customization`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Auto-save failed");
    }

    workspace.chatbot_customization = payload;
    lastChatbotDraftFingerprint = nextFingerprint;
    setStatus("Chatbot customization auto-saved", "success");
  } catch (error) {
    setStatus("Chatbot auto-save failed", "error");
  }
}

async function saveSection(endpoint, payload, successText) {
  setStatus("Saving changes...", "neutral");

  try {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = "Save failed";

      try {
        const errorData = await response.json();
        message = errorData.detail || message;
      } catch (error) {
        message = response.statusText || message;
      }

      throw new Error(message);
    }

    await loadWorkspace(successText);
    showToast("Saved successfully", successText, "success");
  } catch (error) {
    setStatus(error.message || "Save failed", "error");
    showToast("Save failed", error.message || "Please try again.", "error");
  }
}

async function generateProductDescription(productId) {
  if (!productId) {
    return;
  }

  productDescriptionState = {
    productId,
    loading: true,
    description: "",
    notes: [],
    error: "",
  };
  renderSection();
  setStatus("Generating product description...", "neutral");

  try {
    const response = await fetch(`${apiBaseUrl}/api/merchant/product-description`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: productId,
      }),
    });

    if (!response.ok) {
      let message = "Description generation failed";
      try {
        const payload = await response.json();
        message = payload.detail || message;
      } catch (error) {
        message = response.statusText || message;
      }
      throw new Error(message);
    }

    const payload = await response.json();
    productDescriptionState = {
      productId,
      loading: false,
      description: payload.short_description || "",
      notes: payload.merchandising_notes || [],
      error: "",
    };
    setStatus("Product description ready", "success");
    showToast(
      "Description draft ready",
      `${payload.product_title || "Product"} now has a polished short description draft.`,
      "success"
    );
  } catch (error) {
    productDescriptionState = {
      productId,
      loading: false,
      description: "",
      notes: [],
      error: error.message || "The description draft could not be generated just now.",
    };
    setStatus(productDescriptionState.error, "error");
    showToast("Description draft failed", productDescriptionState.error, "error");
  }

  renderSection();
}

async function syncCatalog() {
  const storeName =
    (workspace && workspace.profile && workspace.profile.brand_name) ||
    (workspace && workspace.overview && workspace.overview.store_name) ||
    "StyledGenie";

  syncCatalogButton.disabled = true;
  setStatus("Syncing catalog...", "neutral");

  try {
    const response = await fetch(`${apiBaseUrl}/api/catalog/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        store_name: storeName,
      }),
    });

    if (!response.ok) {
      let message = "Sync failed";

      try {
        const payload = await response.json();
        message = payload.detail || payload.message || message;
      } catch (parseError) {
        message = response.statusText || message;
      }

      throw new Error(message);
    }

    const result = await response.json();

    await loadWorkspace("Catalog synced");
    showToast(
      result.orders_scope_ready
        ? "Catalog and orders synced"
        : "Catalog synced, orders unavailable",
      result.orders_scope_ready
        ? `Imported ${formatNumber(result.imported_count)} products and ${formatNumber(
            result.orders_imported
          )} orders into the merchant brain.`
        : "Product data synced successfully. Add Shopify order access so assisted revenue and AOV can use real commerce data.",
      "success"
    );
  } catch (error) {
    const detail = error.message || "The dashboard could not refresh the connected catalog just now.";
    setStatus(detail, "error");
    showToast(
      "Catalog sync failed",
      detail,
      "error"
    );
  } finally {
    syncCatalogButton.disabled = false;
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSection = button.dataset.section;
    updateShellChrome();
    renderSection();

    if (shouldAutoRefreshWorkspace()) {
      refreshWorkspaceSilently({ forceRender: true });
    }
  });
});

syncCatalogButton.addEventListener("click", syncCatalog);
toastCloseButton.addEventListener("click", hideToast);

function wireActiveSection() {
  const formHandlers = {
    profileForm: () =>
      saveSection(
        "/api/merchant/profile",
        collectProfilePayload(document.getElementById("profileForm")),
        "Store profile saved"
      ),
    chatbotForm: () =>
      saveSection(
        "/api/merchant/chatbot-customization",
        collectChatbotPayload(document.getElementById("chatbotForm")),
        "Chatbot customization saved"
      ),
    catalogForm: () =>
      saveSection(
        "/api/merchant/catalog-intelligence",
        collectCatalogPayload(document.getElementById("catalogForm")),
        "Catalog intelligence saved"
      ),
    looksForm: () =>
      saveSection(
        "/api/merchant/look-management",
        { items: collectLookItems() },
        "Look management saved"
      ),
    careForm: () =>
      saveSection(
        "/api/merchant/customer-care",
        { items: collectCustomerCareItems() },
        "Customer care setup saved"
      ),
    knowledgeForm: () =>
      saveSection(
        "/api/merchant/knowledge-base",
        { items: collectKnowledgeItems() },
        "Knowledge and AI training saved"
      ),
  };

  Object.entries(formHandlers).forEach(([formId, handler]) => {
    const form = document.getElementById(formId);
    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler();
    });
  });

  const builderPreviewForm = document.getElementById("builderPreviewForm");
  if (builderPreviewForm) {
    builderPreviewForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("builderPreviewInput");
      builderPreviewPrompt = input ? input.value.trim() : "";
      renderSection();
    });
  }

  setupChatbotLivePreview();
}

mainContent.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger || !workspace) {
    return;
  }

  if (trigger.dataset.action === "set-chatbot-page") {
    activeChatbotPage = trigger.dataset.page || trigger.dataset.target || "settings";
    renderSection();

    if (shouldAutoRefreshWorkspace()) {
      refreshWorkspaceSilently({ forceRender: true });
    }
    return;
  }

  if (trigger.dataset.action === "navigate-section") {
    activeSection = trigger.dataset.target || "overview";
    updateShellChrome();
    renderSection();
    return;
  }

  if (trigger.dataset.action === "sync-inline-catalog") {
    syncCatalog();
    return;
  }

  if (trigger.dataset.action === "generate-product-description") {
    generateProductDescription(trigger.dataset.productId || "");
    return;
  }

  if (trigger.dataset.action === "builder-preview-flow") {
    builderPreviewFlow = trigger.dataset.target || "outfit_curation";
    builderPreviewPrompt = "";
    renderSection();
    return;
  }

  if (trigger.dataset.action === "builder-activate-flow") {
    builderPriorityFlow = trigger.dataset.target || "";
    showToast(
      "Primary journey updated",
      "The selected chatbot journey is now pinned as the priority path for merchant review.",
      "success"
    );
    renderSection();
    return;
  }

  const index = Number(trigger.dataset.index);

  if (trigger.dataset.action === "add-look") {
    workspace.looks.push({ title: "", occasion: "", style_notes: "" });
    renderSection();
    return;
  }

  if (trigger.dataset.action === "remove-look") {
    workspace.looks.splice(index, 1);
    renderSection();
    return;
  }

  if (trigger.dataset.action === "add-care") {
    workspace.customer_care.push({ category: "", question: "", answer: "" });
    renderSection();
    return;
  }

  if (trigger.dataset.action === "remove-care") {
    workspace.customer_care.splice(index, 1);
    renderSection();
    return;
  }

  if (trigger.dataset.action === "add-knowledge") {
    workspace.knowledge_base.push({ title: "", entry_type: "brand_guideline", body: "" });
    renderSection();
    return;
  }

  if (trigger.dataset.action === "remove-knowledge") {
    workspace.knowledge_base.splice(index, 1);
    renderSection();
  }
});

loadWorkspace();
startWorkspaceHeartbeat();
