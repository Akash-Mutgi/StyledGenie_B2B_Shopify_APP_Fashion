(function (globalScope, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  globalScope.StyledGenieChatEntryFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ENTRY_INTRO_COPY =
    "Hi — I’m your StyledGenie stylist. I can help you build an outfit, translate a look from an image, or handle order support.";
  const SERVICE_SELECTION_COPY =
    "Hi — I’m your StyledGenie stylist. I can help you build an outfit, translate a look from an image, or handle order support. The more you share about the occasion, budget, fit, colour, or how you want to feel, the sharper I can make the recommendation. What are you shopping for today?";

  const SERVICE_MENU_OPTIONS = [
    {
      label: "Find my outfit",
      service: "find_my_outfit",
      mode: "outfit_curation",
      description: "Prompt-led styling around the occasion, budget, fit, colour, and mood.",
    },
    {
      label: "Get inspired",
      service: "get_inspired",
      mode: "get_inspired",
      description: "Share a look you love and I’ll turn it into wearable inspiration.",
    },
    {
      label: "Complete my look",
      service: "complete_my_look",
      mode: "complete_the_look",
      description: "Upload a piece or outfit and I’ll finish the rest around it.",
    },
    {
      label: "Customer care",
      service: "customer_service",
      mode: "support",
      supportType: "help",
      description: "Track orders, returns, delivery questions, and product help.",
    },
  ];

  const FIND_MY_OUTFIT_QUICK_REPLIES = ["Work", "Dinner", "Wedding", "Casual day out", "Vacation", "Party"];
  const CUSTOMER_CARE_ACTIONS = [
    { label: "Track Order", prompt: "Track my order" },
    { label: "Return / Exchange", prompt: "I need help with a return or exchange" },
    { label: "Delivery Question", prompt: "I have a delivery question" },
    { label: "Product Query", prompt: "I have a product question" },
    { label: "Talk to Support", prompt: "I need to talk to support" },
  ];
  const IMAGE_FLOW_ACTIONS = [
    { label: "Upload Image", action: "upload" },
    { label: "Use Camera", action: "camera" },
  ];

  function normalizeName(value) {
    return String(value || "").trim();
  }

  function getReturningProfilePrompt(username) {
    const normalized = normalizeName(username);
    return normalized ? `Hi ${normalized}, who are you shopping for today?` : "Hi, who are you shopping for today?";
  }

  function getReturningSingleProfileIntro(username) {
    const normalized = normalizeName(username);
    return normalized ? `Hi ${normalized} — I’m your StyledGenie stylist. I can help you build an outfit, translate a look from an image, or handle order support.` : ENTRY_INTRO_COPY;
  }

  function getImageFlowIntro(flowType) {
    if (flowType === "inspire") {
      return "Share a look you love, and I’ll help turn it into style inspiration for you.";
    }
    return "Upload a look or item, and I’ll help complete it with the right pieces.";
  }

  function getServiceShellConfig(service) {
    if (service === "find_my_outfit") {
      return {
        openingMessage: "What’s the occasion, and what kind of look are you going for today?",
        quickReplies: [...FIND_MY_OUTFIT_QUICK_REPLIES],
      };
    }

    if (service === "customer_service") {
      return {
        openingMessage: "How can I help you today?",
        quickReplies: CUSTOMER_CARE_ACTIONS.map((item) => ({ ...item })),
      };
    }

    if (service === "get_inspired") {
      return {
        openingMessage: getImageFlowIntro("inspire"),
        quickReplies: IMAGE_FLOW_ACTIONS.map((item) => ({ ...item })),
      };
    }

    if (service === "complete_my_look") {
      return {
        openingMessage: getImageFlowIntro("complete"),
        quickReplies: IMAGE_FLOW_ACTIONS.map((item) => ({ ...item })),
      };
    }

    return {
      openingMessage: ENTRY_INTRO_COPY,
      quickReplies: [],
    };
  }

  function buildEntryViewModel({
    entryMode,
    profiles = [],
    username = "",
    hasSelectedProfile = false,
    selectionConfirmed = false,
    hasCompletedIntro = false,
    resumeTarget = "",
  } = {}) {
    const normalizedProfiles = Array.isArray(profiles) ? profiles : [];
    const profileCount = normalizedProfiles.length;
    const shouldResumeServices = normalizeName(resumeTarget).toLowerCase() === "services";
    const autoSelectProfileId = normalizeName(normalizedProfiles[0] && normalizedProfiles[0].id);
    const services = SERVICE_MENU_OPTIONS.map((item) => ({ ...item }));

    return {
      screen: "service_selection",
      introMessage: ENTRY_INTRO_COPY,
      serviceMessage: ENTRY_INTRO_COPY,
      services,
      autoSelectProfileId: profileCount === 1 || shouldResumeServices || selectionConfirmed || hasCompletedIntro ? autoSelectProfileId : "",
    };
  }

  return {
    ENTRY_INTRO_COPY,
    SERVICE_SELECTION_COPY,
    SERVICE_MENU_OPTIONS,
    FIND_MY_OUTFIT_QUICK_REPLIES,
    CUSTOMER_CARE_ACTIONS,
    IMAGE_FLOW_ACTIONS,
    getReturningProfilePrompt,
    getReturningSingleProfileIntro,
    getImageFlowIntro,
    getServiceShellConfig,
    buildEntryViewModel,
  };
});
