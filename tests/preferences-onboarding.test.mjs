import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const onboarding = require("../apps/storefront-widget/preferences-onboarding.js");

function createMemoryStorage() {
  const state = new Map();

  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, value);
    },
  };
}

test("buildConfirmationViewModel returns the ready state for a saved profile", () => {
  const viewModel = onboarding.buildConfirmationViewModel({
    saving: false,
    persisted: true,
    error: "",
  });

  assert.equal(viewModel.title, "You’re all set!");
  assert.equal(viewModel.buttonLabel, "Next");
  assert.equal(viewModel.buttonDisabled, false);
  assert.equal(viewModel.showRetry, false);
});

test("buildConfirmationViewModel exposes the loading state while preferences are saving", () => {
  const viewModel = onboarding.buildConfirmationViewModel({
    saving: true,
    persisted: false,
    error: "",
  });

  assert.equal(viewModel.buttonLabel, "Saving preferences…");
  assert.equal(viewModel.buttonDisabled, true);
  assert.equal(viewModel.statusLabel, "Saving your preferences…");
});

test("buildConfirmationViewModel exposes retry guidance for save errors", () => {
  const viewModel = onboarding.buildConfirmationViewModel({
    saving: false,
    persisted: false,
    error: "Could not save",
  });

  assert.equal(viewModel.showRetry, true);
  assert.equal(viewModel.errorMessage, "Could not save");
  assert.equal(viewModel.buttonDisabled, true);
});

test("savePreferences persists the selected profile and loadPreferences restores it", () => {
  const storage = createMemoryStorage();
  const savedProfile = onboarding.savePreferences(
    storage,
    {
      segment: "womenswear",
      occasion: "event",
      budget: "under 150 euros",
      priority: "polished",
      feel: "elegant",
    },
    () => "2026-04-10T10:00:00.000Z"
  );

  const restoredProfile = onboarding.loadPreferences(storage);

  assert.deepEqual(savedProfile, restoredProfile);
  assert.equal(savedProfile.segment, "womenswear");
  assert.equal(savedProfile.priority, "polished");
});

test("navigation helpers return the last onboarding step and replay a starter request when present", () => {
  assert.equal(onboarding.getPreviousStepIndex(6), 5);
  assert.equal(onboarding.getPreviousStepIndex(1), 0);

  const replayTarget = onboarding.buildNextNavigationTarget("Style me for a smart casual dinner");
  const idleTarget = onboarding.buildNextNavigationTarget("");

  assert.equal(replayTarget.shouldReplayOpeningRequest, true);
  assert.equal(replayTarget.openingRequest, "Style me for a smart casual dinner");
  assert.equal(idleTarget.shouldReplayOpeningRequest, false);
});
