export const RELATIONSHIP_OPTIONS = [
  { value: "self", label: "Self" },
  { value: "spouse_partner", label: "Spouse / partner" },
  { value: "child", label: "Child" },
  { value: "friend", label: "Friend" },
  { value: "parent", label: "Parent" },
  { value: "other", label: "Other" },
];

export const SHOPPING_CATEGORY_OPTIONS = [
  { value: "menswear", label: "Menswear" },
  { value: "womenswear", label: "Womenswear" },
  { value: "both", label: "Both" },
  { value: "other", label: "Other" },
  { value: "unspecified", label: "Other / Unspecified" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const BODY_TYPE_OPTIONS = [
  { value: "hourglass", label: "Hourglass" },
  { value: "pear", label: "Pear" },
  { value: "triangle", label: "Triangle" },
  { value: "rectangle", label: "Rectangle" },
  { value: "apple", label: "Apple" },
  { value: "athletic", label: "Athletic" },
  { value: "other", label: "Other" },
];

export const SKIN_TONE_OPTIONS = [
  { value: "fair", label: "Fair" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "tan", label: "Tan" },
  { value: "deep", label: "Deep" },
  { value: "other", label: "Other" },
];

export const PALETTE_OPTIONS = [
  "black",
  "navy",
  "cream",
  "olive",
  "white",
  "brown",
  "grey",
  "soft pastels",
  "jewel tones",
  "neutrals",
];

export const FABRIC_ALLERGY_OPTIONS = ["None", "Wool", "Mohair", "Cashmere", "Synthetic blends", "Latex"];
export const PREFERRED_FIT_OPTIONS = ["Tailored", "Relaxed", "Oversized", "Slim-straight", "Soft structure"];
export const OCCASION_OPTIONS = ["Work", "Dinner", "Travel", "Weekend", "Event", "Everyday"];

export const BUDGET_OPTIONS = [
  { value: "50_150", label: "EUR50-EUR150", min: 50, max: 150 },
  { value: "100_250", label: "EUR100-EUR250", min: 100, max: 250 },
  { value: "150_350", label: "EUR150-EUR350", min: 150, max: 350 },
  { value: "250_plus", label: "EUR250+", min: 250, max: null },
];

export const FLOW_STEPS = ["welcome", "method", "scan", "basic", "features", "vibe", "budget"];

function randomIdFactory() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `style-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeList(values) {
  if (Array.isArray(values)) {
    return normalizeTags(values);
  }

  if (typeof values === "string") {
    return normalizeTags(values.split(","));
  }

  return [];
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  return tags
    .map((tag) => normalizeText(tag))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeBudgetNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function relationshipLabelFor(value) {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label || "Other";
}

function shoppingCategoryLabelFor(value) {
  return SHOPPING_CATEGORY_OPTIONS.find((option) => option.value === value)?.label || "Unspecified";
}

function genderLabelFor(value) {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label || "Not set";
}

function bodyTypeLabelFor(value) {
  return BODY_TYPE_OPTIONS.find((option) => option.value === value)?.label || "Not set";
}

function formatBudgetRange(minBudget, maxBudget) {
  const min = normalizeBudgetNumber(minBudget);
  const max = normalizeBudgetNumber(maxBudget);

  if (min && max) {
    return `EUR${min} - EUR${max}`;
  }
  if (min) {
    return `From EUR${min}`;
  }
  if (max) {
    return `Up to EUR${max}`;
  }
  return "Budget not set yet";
}

function normalizeSourceMethod(value) {
  const candidate = normalizeText(value).toLowerCase();
  if (candidate === "scan") {
    return "camera";
  }
  if (candidate === "manual") {
    return "upload";
  }
  return candidate || "";
}

function validationAttempted(imageValidation) {
  if (!imageValidation || typeof imageValidation !== "object") {
    return false;
  }
  return Boolean(
    imageValidation.guidance?.length ||
      imageValidation.qualityWarnings?.length ||
      imageValidation.sourceImageUrl ||
      imageValidation.ok
  );
}

function hasValidImageValidation(imageValidation) {
  return Boolean(imageValidation && imageValidation.ok && imageValidation.fullBodyLikelyVisible);
}

function hasImageContextForContinuation(profile) {
  const sourceMethod = normalizeSourceMethod(profile?.source?.method);
  const sourceImageUrl = normalizeText(profile?.source?.sourceImageUrl || profile?.imageValidation?.sourceImageUrl);
  return Boolean(sourceMethod && (validationAttempted(profile?.imageValidation) || sourceImageUrl));
}

export function buildStyleAnalysisDraft(profile) {
  const shoppingCategoryPreference = normalizeText(profile?.shoppingCategoryPreference).toLowerCase();
  const categoryLabel = shoppingCategoryLabelFor(shoppingCategoryPreference);
  const palette = normalizeList(profile?.favoriteColorPalette).slice(0, 3);
  const fits = normalizeList(profile?.preferredFits).slice(0, 2);
  const occasions = normalizeList(profile?.preferredOccasions).slice(0, 2);
  const styleNotes = normalizeText(profile?.styleNotes);
  const minBudget = normalizeBudgetNumber(profile?.minBudget);
  const maxBudget = normalizeBudgetNumber(profile?.maxBudget);
  const budgetLine = formatBudgetRange(minBudget, maxBudget);

  const summaryParts = [
    shoppingCategoryPreference
      ? `StyledGenie will prioritize ${categoryLabel.toLowerCase()} recommendations.`
      : "StyledGenie will start from the profile details you confirmed here.",
    palette.length ? `Preferred palette: ${palette.join(", ")}.` : "",
    fits.length ? `Fits to keep in mind: ${fits.join(", ")}.` : "",
    occasions.length ? `Most useful for: ${occasions.join(", ")}.` : "",
    styleNotes ? styleNotes : "",
    budgetLine !== "Budget not set yet" ? `Budget guide: ${budgetLine}.` : "",
  ].filter(Boolean);

  const tags = normalizeTags([
    shoppingCategoryPreference,
    ...palette,
    ...fits,
    ...occasions,
    ...(styleNotes ? styleNotes.split(/[^a-zA-Z0-9]+/) : []),
  ]).slice(0, 8);

  return {
    summary: summaryParts.join(" "),
    tags,
  };
}

export function createEmptyStyleProfile(overrides = {}, options = {}) {
  const nowFactory = typeof options.nowFactory === "function" ? options.nowFactory : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : randomIdFactory;
  const createdAt = normalizeText(overrides.createdAt) || nowFactory();
  const updatedAt = normalizeText(overrides.updatedAt) || createdAt;
  const favoriteColorPalette = normalizeList(overrides.favoriteColorPalette);
  const fabricAllergies = normalizeList(overrides.fabricAllergies);
  const preferredFits = normalizeList(overrides.preferredFits);
  const preferredOccasions = normalizeList(overrides.preferredOccasions);
  const dislikedColors = normalizeList(overrides.dislikedColors);
  const dislikedFabrics = normalizeList(overrides.dislikedFabrics);
  const sourceMethod = normalizeSourceMethod(overrides?.source?.method);
  const minBudget = normalizeBudgetNumber(overrides.minBudget);
  const maxBudget = normalizeBudgetNumber(overrides.maxBudget);

  const base = {
    id: normalizeText(overrides.id) || idFactory(),
    isPrimary: overrides.isPrimary !== undefined ? Boolean(overrides.isPrimary) : true,
    name: normalizeText(overrides.name),
    relationship: normalizeText(overrides.relationship) || "self",
    shoppingCategoryPreference: normalizeText(overrides.shoppingCategoryPreference).toLowerCase(),
    gender: normalizeText(overrides.gender),
    sizes: {
      top: normalizeText(overrides?.sizes?.top),
      bottom: normalizeText(overrides?.sizes?.bottom),
      shoeEu: normalizeText(overrides?.sizes?.shoeEu || overrides?.sizes?.shoeSize),
    },
    features: {
      bodyType: normalizeText(overrides?.features?.bodyType),
      skinTone: normalizeText(overrides?.features?.skinTone),
      hairColor: normalizeText(overrides?.features?.hairColor),
      eyeColor: normalizeText(overrides?.features?.eyeColor),
    },
    vibe: {
      pinterestUrl: normalizeText(overrides?.vibe?.pinterestUrl),
      imageUrls: Array.isArray(overrides?.vibe?.imageUrls)
        ? overrides.vibe.imageUrls.map((value) => normalizeText(value)).filter(Boolean)
        : [],
      styleDescription: normalizeText(overrides?.vibe?.styleDescription),
    },
    favoriteColorPalette,
    fabricAllergies,
    styleNotes: normalizeText(overrides.styleNotes),
    preferredFits,
    preferredOccasions,
    dislikedColors,
    dislikedFabrics,
    budget: normalizeText(overrides.budget) || null,
    minBudget,
    maxBudget,
    source: {
      method: sourceMethod,
      sourceImageUrl: normalizeText(overrides?.source?.sourceImageUrl),
      imageName: normalizeText(overrides?.source?.imageName),
    },
    imageValidation: {
      ok: Boolean(overrides?.imageValidation?.ok),
      fullBodyLikelyVisible: Boolean(overrides?.imageValidation?.fullBodyLikelyVisible),
      blurScore:
        overrides?.imageValidation?.blurScore === null || overrides?.imageValidation?.blurScore === undefined
          ? null
          : Number(overrides.imageValidation.blurScore),
      qualityWarnings: normalizeList(overrides?.imageValidation?.qualityWarnings),
      guidance: normalizeList(overrides?.imageValidation?.guidance),
      sourceImageUrl:
        normalizeText(overrides?.imageValidation?.sourceImageUrl) ||
        normalizeText(overrides?.source?.sourceImageUrl),
    },
    createdAt,
    updatedAt,
  };

  const draftAnalysis = buildStyleAnalysisDraft(base);

  return {
    ...base,
    styleAnalysis: {
      summary: normalizeText(overrides?.styleAnalysis?.summary) || draftAnalysis.summary,
      tags: normalizeTags(overrides?.styleAnalysis?.tags || draftAnalysis.tags),
    },
  };
}

export function normalizeStyleProfile(profile, options = {}) {
  return createEmptyStyleProfile(profile, options);
}

export function normalizeStyleProfiles(profiles, options = {}) {
  const list = Array.isArray(profiles) ? profiles : [];
  const normalized = list.map((profile) => normalizeStyleProfile(profile, options));

  if (!normalized.length) {
    return [];
  }

  let foundPrimary = false;
  return normalized.map((profile, index) => {
    const isPrimary = !foundPrimary && (profile.isPrimary || index === 0);
    if (isPrimary) {
      foundPrimary = true;
    }

    return {
      ...profile,
      isPrimary,
      relationship: isPrimary ? "self" : profile.relationship === "self" ? "other" : profile.relationship,
    };
  });
}

export function buildMyStyleViewModel({ profiles = [], loading = false, error = "" } = {}) {
  const normalizedProfiles = normalizeStyleProfiles(profiles);
  const primaryProfile = normalizedProfiles.find((profile) => profile.isPrimary) || null;
  const additionalProfiles = normalizedProfiles.filter((profile) => !profile.isPrimary);
  const hasProfiles = normalizedProfiles.length > 0;

  return {
    title: "My Style",
    description: "Manage your styling profiles for yourself and anyone you shop for.",
    heroEyebrow: hasProfiles ? "Profile memory" : "New profile",
    heroTitle: hasProfiles ? "Who are you shopping for today?" : "Create the profile StyledGenie should style from.",
    heroDescription: hasProfiles
      ? "Save explicit fit, category, palette, and budget preferences so StyledGenie stops reopening with the same basics."
      : "Capture a full-body photo for setup support, then confirm every detail yourself before saving.",
    loading,
    error: normalizeText(error),
    hasProfiles,
    primaryProfile,
    additionalProfiles,
    primaryCtaLabel: hasProfiles ? "Edit profile" : "Create my style profile",
    secondaryCtaLabel: hasProfiles ? "Add person" : "",
    emptyStateTitle: "Create your style profile",
    emptyStateDescription: "Save your category preference, sizes, palette, and budget once so future styling starts from your real preferences.",
  };
}

export function deriveProfileCompletionPercent(profile) {
  const normalized = normalizeStyleProfile(profile);
  const checks = [
    Boolean(normalized.name),
    Boolean(normalized.shoppingCategoryPreference),
    validationAttempted(normalized.imageValidation),
    Boolean(normalized.sizes.top),
    Boolean(normalized.sizes.bottom),
    Boolean(normalized.sizes.shoeEu),
    Boolean(normalized.features.bodyType || normalized.features.skinTone || normalized.features.hairColor || normalized.features.eyeColor),
    Boolean(normalized.favoriteColorPalette.length),
    Boolean(normalized.fabricAllergies.length),
    Boolean(normalized.styleNotes || normalized.preferredFits.length || normalized.preferredOccasions.length),
    Boolean(normalized.minBudget || normalized.maxBudget || normalized.budget),
  ];

  const completed = checks.filter(Boolean).length;
  return Math.max(0, Math.min(100, Math.round((completed / checks.length) * 100)));
}

export function validateProfileDraft(profile) {
  const normalized = normalizeStyleProfile(profile);
  const errors = {};

  if (!normalized.name) {
    errors.name = "Add a profile name.";
  }
  if (!normalized.shoppingCategoryPreference) {
    errors.shoppingCategoryPreference = "Choose a shopping category preference.";
  }
  if (!validationAttempted(normalized.imageValidation)) {
    errors.imageValidation = "Add a full body scan or upload, then review the setup guidance.";
  }
  if (!normalized.sizes.top) {
    errors.top = "Add a top size.";
  }
  if (!normalized.sizes.bottom) {
    errors.bottom = "Add a bottom size.";
  }
  if (!normalized.sizes.shoeEu) {
    errors.shoeEu = "Add a shoe size.";
  }
  if (!normalized.favoriteColorPalette.length) {
    errors.favoriteColorPalette = "Add at least one favorite color palette cue.";
  }
  if (!normalized.fabricAllergies.length) {
    errors.fabricAllergies = "Add any fabric allergies or choose None.";
  }
  if (!normalized.minBudget && !normalized.maxBudget && !normalized.budget) {
    errors.budget = "Add a budget range.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function canContinueFromStep(step, draft) {
  const normalized = normalizeStyleProfile(draft);

  switch (step) {
    case "welcome":
      return true;
    case "method":
      return hasImageContextForContinuation(normalized);
    case "scan":
      return hasImageContextForContinuation(normalized);
    case "basic":
      return Boolean(
        normalized.name &&
          normalized.shoppingCategoryPreference &&
          normalized.sizes.top &&
          normalized.sizes.bottom &&
          normalized.sizes.shoeEu
      );
    case "features":
      return true;
    case "vibe":
      return Boolean(normalized.favoriteColorPalette.length && normalized.fabricAllergies.length);
    case "budget":
      return Boolean(normalized.minBudget || normalized.maxBudget || normalized.budget);
    default:
      return false;
  }
}

export function getStepBlockingMessage(step, draft) {
  const normalized = normalizeStyleProfile(draft);

  switch (step) {
    case "method":
      return hasImageContextForContinuation(normalized)
        ? ""
        : "Choose Scan Full Body or Upload Full Body Image, then add a full body image to continue.";
    case "scan":
      return hasImageContextForContinuation(normalized)
        ? ""
        : "Add a full body scan or upload before you continue.";
    case "basic": {
      const missing = [];
      if (!normalized.name) {
        missing.push("profile name");
      }
      if (!normalized.shoppingCategoryPreference) {
        missing.push("shopping category preference");
      }
      if (!normalized.sizes.top) {
        missing.push("top size");
      }
      if (!normalized.sizes.bottom) {
        missing.push("bottom size");
      }
      if (!normalized.sizes.shoeEu) {
        missing.push("shoe size");
      }
      return missing.length ? `Add ${joinHumanList(missing)} to continue.` : "";
    }
    case "vibe": {
      const missing = [];
      if (!normalized.favoriteColorPalette.length) {
        missing.push("favorite color palette");
      }
      if (!normalized.fabricAllergies.length) {
        missing.push("fabric allergy answer");
      }
      return missing.length ? `Add ${joinHumanList(missing)} to continue.` : "";
    }
    case "budget":
      return normalized.minBudget || normalized.maxBudget || normalized.budget ? "" : "Add a budget range to continue.";
    default:
      return "";
  }
}

export function getFlowStepsForDraft(_draft) {
  return [...FLOW_STEPS];
}

export function getNextFlowStep(step) {
  switch (step) {
    case "welcome":
      return "method";
    case "method":
      return "basic";
    case "scan":
      return "basic";
    case "basic":
      return "features";
    case "features":
      return "vibe";
    case "vibe":
      return "budget";
    case "budget":
    default:
      return null;
  }
}

export function getPreviousFlowStep(step) {
  switch (step) {
    case "method":
      return "welcome";
    case "basic":
      return "method";
    case "features":
      return "basic";
    case "vibe":
      return "features";
    case "budget":
      return "vibe";
    default:
      return null;
  }
}

export function buildFlowStepView(step, draft, mode = "create") {
  const normalized = normalizeStyleProfile(draft);
  const methodLabel = normalized.source.method === "camera" ? "scan" : "upload";
  const imageReady = hasImageContextForContinuation(normalized);

  const views = {
    welcome: {
      title: "My Style",
      subtitle: "Build the profile StyledGenie should use before future styling starts.",
      primaryLabel: "Start profile",
    },
    method: {
      title: "Choose how to begin",
      subtitle: "Scan Full Body or upload a full-body image so StyledGenie can check photo readiness before you fill the profile.",
      primaryLabel: imageReady ? "Continue" : "Choose a method",
    },
    scan: {
      title: normalized.source.method === "camera" ? "Scan Full Body" : "Upload Full Body Image",
      subtitle: `Review the ${methodLabel} preview, then use the setup guidance before continuing into your editable profile.`,
      primaryLabel: "Continue",
    },
    basic: {
      title: "Profile details",
      subtitle: "These are the essentials StyledGenie will use later for sizing and explicit menswear or womenswear routing.",
      primaryLabel: "Continue",
    },
    features: {
      title: "Optional appearance details",
      subtitle: "Only add what you want remembered. Everything here is manual and fully editable.",
      primaryLabel: "Continue",
    },
    vibe: {
      title: "Preferences",
      subtitle: "Add palette, fabric, fit, and occasion cues so recommendations feel more like a real stylist already knows you.",
      primaryLabel: "Continue",
    },
    budget: {
      title: "Budget",
      subtitle: "Add a budget range StyledGenie should respect when building future looks.",
      primaryLabel: mode === "edit" ? "Save changes" : "Save Profile",
    },
  };

  return {
    step,
    profileName: normalized.name || "you",
    ...(views[step] || views.welcome),
    canContinue: canContinueFromStep(step, normalized),
  };
}

export function buildProfileSnippet(profile) {
  const normalized = normalizeStyleProfile(profile);
  if (normalized.styleNotes) {
    return normalized.styleNotes;
  }
  if (normalized.styleAnalysis.summary) {
    return normalized.styleAnalysis.summary;
  }
  if (normalized.favoriteColorPalette.length) {
    return `Prefers ${normalized.favoriteColorPalette.slice(0, 3).join(", ")}.`;
  }
  return "Profile details ready for future styling recommendations.";
}

export function buildProfileCardSummary(profile) {
  const normalized = normalizeStyleProfile(profile);
  const completionPercent = deriveProfileCompletionPercent(normalized);
  const sizes = [normalized.sizes.top, normalized.sizes.bottom, normalized.sizes.shoeEu]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" / ");
  const visualCues = [normalized.features.bodyType, normalized.features.skinTone, normalized.features.hairColor]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const tags = normalizeTags([
    ...normalized.favoriteColorPalette,
    ...normalized.preferredFits,
    ...normalized.preferredOccasions,
    ...(normalized.styleAnalysis?.tags || []),
  ]).slice(0, 6);

  return {
    heading: normalized.name || (normalized.isPrimary ? "Primary profile" : "Style profile"),
    relationshipLabel: relationshipLabelFor(normalized.relationship),
    shoppingCategoryLabel: shoppingCategoryLabelFor(normalized.shoppingCategoryPreference),
    completionPercent,
    completionLabel:
      completionPercent >= 85 ? "Ready to style" : completionPercent >= 60 ? "Strong starter" : "Needs a few details",
    genderLabel: normalized.gender ? genderLabelFor(normalized.gender) : "Optional",
    sizeSummary: sizes || "Sizes not added yet",
    bodyTypeLabel: bodyTypeLabelFor(normalized.features.bodyType),
    budgetLabel: formatBudgetRange(normalized.minBudget, normalized.maxBudget),
    styleSnippet: buildProfileSnippet(normalized),
    tags,
    identityLine: `${relationshipLabelFor(normalized.relationship)} · ${shoppingCategoryLabelFor(normalized.shoppingCategoryPreference)}`,
    featureLine: visualCues.length ? visualCues.join(" · ") : "Manual appearance details still optional",
    paletteLine: normalized.favoriteColorPalette.length
      ? normalized.favoriteColorPalette.join(", ")
      : "Palette not set yet",
    budgetLine: formatBudgetRange(normalized.minBudget, normalized.maxBudget),
  };
}

export function buildSavePayload({ customerId, customerEmail = "", accountDisplayName = "", profiles = [] } = {}, options = {}) {
  const normalizedEmail = normalizeText(customerEmail).toLowerCase();
  return {
    customerId: normalizeText(customerId) || null,
    customerEmail: normalizedEmail || null,
    accountDisplayName: normalizeText(accountDisplayName),
    profiles: normalizeStyleProfiles(profiles, options),
  };
}

function joinHumanList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
