import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFlowStepView,
  buildMyStyleViewModel,
  buildProfileCardSummary,
  buildSavePayload,
  buildStyleAnalysisDraft,
  canContinueFromStep,
  createEmptyStyleProfile,
  deriveProfileCompletionPercent,
  getFlowStepsForDraft,
  getStepBlockingMessage,
  getNextFlowStep,
  getPreviousFlowStep,
  normalizeStyleProfiles,
  validateProfileDraft,
} from "../shopify/customer-style-profile-extension/src/style-profile-utils.mjs";

test("empty My Style view model exposes the create-profile state", () => {
  const view = buildMyStyleViewModel({
    profiles: [],
    loading: false,
    error: "",
  });

  assert.equal(view.hasProfiles, false);
  assert.equal(view.primaryCtaLabel, "Create my style profile");
  assert.equal(view.emptyStateTitle, "Create your style profile");
});

test("My Style view model separates primary and additional profiles", () => {
  const profiles = normalizeStyleProfiles([
    createEmptyStyleProfile({
      id: "self",
      isPrimary: true,
      name: "Akash",
      relationship: "self",
      shoppingCategoryPreference: "menswear",
      sizes: { top: "M", bottom: "32", shoeEu: "42" },
      favoriteColorPalette: ["navy"],
      fabricAllergies: ["None"],
      minBudget: 100,
      maxBudget: 250,
    }),
    createEmptyStyleProfile({
      id: "friend",
      isPrimary: false,
      name: "Mia",
      relationship: "friend",
      shoppingCategoryPreference: "womenswear",
      sizes: { top: "S", bottom: "28", shoeEu: "39" },
      favoriteColorPalette: ["cream"],
      fabricAllergies: ["Wool"],
      minBudget: 80,
      maxBudget: 180,
    }),
  ]);

  const view = buildMyStyleViewModel({ profiles });

  assert.equal(view.hasProfiles, true);
  assert.equal(view.primaryProfile.name, "Akash");
  assert.equal(view.additionalProfiles.length, 1);
  assert.equal(view.additionalProfiles[0].relationship, "friend");
});

test("flow navigation reflects the image-first creation flow", () => {
  const draft = createEmptyStyleProfile();

  assert.deepEqual(getFlowStepsForDraft(draft), ["welcome", "method", "scan", "basic", "features", "vibe", "budget"]);
  assert.equal(getNextFlowStep("welcome", draft), "method");
  assert.equal(getNextFlowStep("method", draft), "basic");
  assert.equal(getPreviousFlowStep("budget", draft), "vibe");
});

test("method step keeps the CTA disabled until an intake image context is present", () => {
  const initial = createEmptyStyleProfile();
  const attempted = createEmptyStyleProfile({
    source: { method: "upload" },
    imageValidation: {
      ok: false,
      fullBodyLikelyVisible: false,
      guidance: ["Please retake with one person in frame"],
      qualityWarnings: ["Multiple people detected"],
    },
  });
  const validated = createEmptyStyleProfile({
    source: { method: "upload" },
    imageValidation: {
      ok: true,
      fullBodyLikelyVisible: true,
      guidance: ["Full body detected"],
      qualityWarnings: [],
    },
  });

  assert.equal(canContinueFromStep("method", initial), false);
  assert.equal(buildFlowStepView("method", initial).primaryLabel, "Choose a method");
  assert.equal(canContinueFromStep("method", attempted), true);
  assert.equal(canContinueFromStep("method", validated), true);
  assert.equal(buildFlowStepView("method", validated).primaryLabel, "Continue");
});

test("basic step blocks progress until profile name, category, and sizes are present", () => {
  const incomplete = createEmptyStyleProfile({
    name: "Akash",
    shoppingCategoryPreference: "",
    sizes: { top: "M", bottom: "", shoeEu: "42" },
  });
  const complete = createEmptyStyleProfile({
    name: "Akash",
    shoppingCategoryPreference: "menswear",
    sizes: { top: "M", bottom: "32", shoeEu: "42" },
  });

  assert.equal(canContinueFromStep("basic", incomplete), false);
  assert.equal(canContinueFromStep("basic", complete), true);
});

test("vibe step blocks until palette and fabric answer are present", () => {
  const incomplete = createEmptyStyleProfile({
    favoriteColorPalette: [],
    fabricAllergies: [],
  });
  const complete = createEmptyStyleProfile({
    favoriteColorPalette: ["navy", "cream"],
    fabricAllergies: ["None"],
  });

  assert.equal(canContinueFromStep("vibe", incomplete), false);
  assert.equal(canContinueFromStep("vibe", complete), true);
  assert.equal(getStepBlockingMessage("vibe", incomplete), "Add favorite color palette and fabric allergy answer to continue.");
});

test("save validation returns clear errors for incomplete profile creation drafts", () => {
  const validation = validateProfileDraft(
    createEmptyStyleProfile({
      name: "",
      shoppingCategoryPreference: "",
      sizes: { top: "", bottom: "", shoeEu: "" },
      favoriteColorPalette: [],
      fabricAllergies: [],
      imageValidation: {},
    })
  );

  assert.equal(validation.isValid, false);
  assert.equal(validation.errors.name, "Add a profile name.");
  assert.equal(validation.errors.shoppingCategoryPreference, "Choose a shopping category preference.");
  assert.equal(validation.errors.favoriteColorPalette, "Add at least one favorite color palette cue.");
});

test("style analysis draft reflects explicit shopper-confirmed data", () => {
  const profile = createEmptyStyleProfile({
    name: "Mia",
    shoppingCategoryPreference: "womenswear",
    favoriteColorPalette: ["soft pastels", "cream"],
    preferredFits: ["Tailored"],
    preferredOccasions: ["Dinner"],
    styleNotes: "Soft polished minimal looks.",
    minBudget: 120,
    maxBudget: 220,
  });

  const analysis = buildStyleAnalysisDraft(profile);
  assert.match(analysis.summary, /womenswear/i);
  assert.match(analysis.summary, /soft pastels/i);
  assert.ok(analysis.tags.includes("womenswear"));
});

test("profile completion percent and card summary stay shopper-friendly with new fields", () => {
  const starter = createEmptyStyleProfile({
    name: "Mia",
    shoppingCategoryPreference: "womenswear",
    sizes: { top: "S", bottom: "", shoeEu: "" },
  });
  const ready = createEmptyStyleProfile({
    name: "Mia",
    shoppingCategoryPreference: "womenswear",
    sizes: { top: "S", bottom: "28", shoeEu: "39" },
    favoriteColorPalette: ["cream", "black"],
    fabricAllergies: ["None"],
    styleNotes: "Minimal and polished",
    minBudget: 100,
    maxBudget: 200,
    imageValidation: {
      ok: true,
      fullBodyLikelyVisible: true,
      guidance: ["Full body likely visible."],
    },
  });

  assert.ok(deriveProfileCompletionPercent(starter) < deriveProfileCompletionPercent(ready));
  assert.equal(buildProfileCardSummary(ready).shoppingCategoryLabel, "Womenswear");
});

test("save payload normalizes profiles and enforces a single primary record", () => {
  const payload = buildSavePayload({
    customerId: "gid://shopify/Customer/1",
    profiles: [
      createEmptyStyleProfile({
        id: "one",
        isPrimary: true,
        name: "Akash",
        relationship: "self",
        shoppingCategoryPreference: "menswear",
        sizes: { top: "M", bottom: "32", shoeEu: "42" },
      }),
      createEmptyStyleProfile({
        id: "two",
        isPrimary: true,
        name: "Aarav",
        relationship: "child",
        shoppingCategoryPreference: "menswear",
        sizes: { top: "XS", bottom: "30", shoeEu: "34" },
      }),
    ],
  });

  assert.equal(payload.customerId, "gid://shopify/Customer/1");
  assert.equal(payload.profiles.length, 2);
  assert.equal(payload.profiles.filter((profile) => profile.isPrimary).length, 1);
  assert.equal(payload.profiles[0].relationship, "self");
});

test("budget step uses the save label in create mode", () => {
  const view = buildFlowStepView(
    "budget",
    createEmptyStyleProfile({
      name: "Akash",
      shoppingCategoryPreference: "menswear",
      sizes: { top: "M", bottom: "32", shoeEu: "42" },
      favoriteColorPalette: ["navy"],
      fabricAllergies: ["None"],
      minBudget: 100,
      maxBudget: 200,
      imageValidation: { guidance: ["Full body likely visible."] },
    }),
    "create"
  );

  assert.equal(view.primaryLabel, "Save Profile");
  assert.equal(view.canContinue, true);
});
