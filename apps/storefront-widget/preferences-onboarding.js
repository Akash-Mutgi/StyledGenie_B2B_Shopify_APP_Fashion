(function (globalScope, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  globalScope.StyledGeniePreferencesOnboarding = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "styledgenie-shopper-preferences-v1";
  const PROFILE_KEYS = [
    "segment",
    "occasion",
    "weather",
    "budget",
    "priority",
    "feel",
    "color_preference",
    "fit_preference",
  ];

  function sanitizeProfileInputs(profile) {
    const normalized = {};

    PROFILE_KEYS.forEach((key) => {
      const rawValue = profile && typeof profile === "object" ? profile[key] : null;
      if (rawValue === null || rawValue === undefined) {
        normalized[key] = null;
        return;
      }

      const trimmed = String(rawValue).trim();
      normalized[key] = trimmed ? trimmed : null;
    });

    return normalized;
  }

  function hasMeaningfulProfile(profile) {
    const normalized = sanitizeProfileInputs(profile);
    return PROFILE_KEYS.some((key) => Boolean(normalized[key]));
  }

  function preferencesEqual(left, right) {
    const normalizedLeft = sanitizeProfileInputs(left);
    const normalizedRight = sanitizeProfileInputs(right);
    return PROFILE_KEYS.every((key) => normalizedLeft[key] === normalizedRight[key]);
  }

  function loadPreferences(storage) {
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      const profile =
        parsed && typeof parsed === "object" && parsed.preferences && typeof parsed.preferences === "object"
          ? parsed.preferences
          : parsed;
      const normalized = sanitizeProfileInputs(profile);
      return hasMeaningfulProfile(normalized) ? normalized : null;
    } catch (error) {
      return null;
    }
  }

  function savePreferences(storage, profile, nowFactory = () => new Date().toISOString()) {
    if (!storage || typeof storage.setItem !== "function") {
      throw new Error("Preference storage is unavailable.");
    }

    const normalized = sanitizeProfileInputs(profile);
    if (!hasMeaningfulProfile(normalized)) {
      throw new Error("No styling preferences were selected.");
    }

    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: nowFactory(),
        preferences: normalized,
      })
    );

    return normalized;
  }

  function buildConfirmationViewModel(options = {}) {
    const saving = Boolean(options.saving);
    const persisted = Boolean(options.persisted);
    const errorMessage = options.error ? String(options.error).trim() : "";

    return {
      title: "You’re all set!",
      subtitle: "Preferences updated. Tap Next to style.",
      buttonLabel: saving ? "Saving preferences…" : "Next",
      buttonDisabled: saving || !persisted,
      showRetry: Boolean(errorMessage) && !saving,
      errorMessage,
      statusLabel: saving ? "Saving your preferences…" : persisted ? "Preferences saved." : "",
    };
  }

  function getPreviousStepIndex(totalSteps) {
    const parsedTotal = Number(totalSteps);
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 1) {
      return 0;
    }
    return parsedTotal - 1;
  }

  function buildNextNavigationTarget(openingRequest) {
    const normalizedRequest = String(openingRequest || "").trim();
    return {
      openingRequest: normalizedRequest,
      shouldReplayOpeningRequest: Boolean(normalizedRequest),
    };
  }

  return {
    STORAGE_KEY,
    PROFILE_KEYS,
    sanitizeProfileInputs,
    hasMeaningfulProfile,
    preferencesEqual,
    loadPreferences,
    savePreferences,
    buildConfirmationViewModel,
    getPreviousStepIndex,
    buildNextNavigationTarget,
  };
});
