import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chatEntryFlow = require("../shopify/theme-app-extension/assets/chat-entry-flow.js");

test("buildEntryViewModel returns intro plus service buttons for new users", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "NEW_CUSTOMER",
    profiles: [],
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.introMessage, chatEntryFlow.ENTRY_INTRO_COPY);
  assert.equal(viewModel.serviceMessage, chatEntryFlow.ENTRY_INTRO_COPY);
  assert.deepEqual(
    viewModel.services.map((item) => item.label),
    ["Find my outfit", "Get inspired", "Complete my look", "Customer care"]
  );
});

test("buildEntryViewModel returns the same intro-first service screen for a single saved profile", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "RETURNING_CUSTOMER",
    username: "Hayden",
    profiles: [{ id: "profile-1", name: "Hayden" }],
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.introMessage, chatEntryFlow.ENTRY_INTRO_COPY);
  assert.equal(viewModel.serviceMessage, chatEntryFlow.ENTRY_INTRO_COPY);
  assert.equal(viewModel.autoSelectProfileId, "profile-1");
});

test("buildEntryViewModel keeps the same intro-first service screen after intro completion", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "RETURNING_CUSTOMER",
    username: "Hayden",
    profiles: [{ id: "profile-1", name: "Hayden" }],
    hasSelectedProfile: true,
    hasCompletedIntro: true,
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.serviceMessage, chatEntryFlow.ENTRY_INTRO_COPY);
});

test("buildEntryViewModel does not show the profile picker on entry for multiple profiles", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "RETURNING_CUSTOMER",
    username: "Hayden",
    profiles: [
      { id: "profile-1", name: "Hayden" },
      { id: "profile-2", name: "Maya" },
    ],
    hasSelectedProfile: false,
    selectionConfirmed: false,
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.introMessage, chatEntryFlow.ENTRY_INTRO_COPY);
});

test("buildEntryViewModel keeps service buttons available after multi-profile confirmation", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "RETURNING_CUSTOMER",
    profiles: [
      { id: "profile-1", name: "Hayden" },
      { id: "profile-2", name: "Maya" },
    ],
    hasSelectedProfile: true,
    selectionConfirmed: true,
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.serviceMessage, chatEntryFlow.ENTRY_INTRO_COPY);
  assert.deepEqual(
    viewModel.services.map((item) => item.label),
    ["Find my outfit", "Get inspired", "Complete my look", "Customer care"]
  );
});

test("buildEntryViewModel returns service selection when resuming from My Style", () => {
  const viewModel = chatEntryFlow.buildEntryViewModel({
    entryMode: "RETURNING_CUSTOMER",
    profiles: [{ id: "profile-1", name: "Hayden" }],
    hasSelectedProfile: true,
    resumeTarget: "services",
  });

  assert.equal(viewModel.screen, "service_selection");
  assert.equal(viewModel.autoSelectProfileId, "profile-1");
  assert.equal(viewModel.serviceMessage, chatEntryFlow.ENTRY_INTRO_COPY);
});

test("service shell config exposes the MVP copy for outfit, care, and image-led flows", () => {
  assert.equal(
    chatEntryFlow.getServiceShellConfig("find_my_outfit").openingMessage,
    "What’s the occasion, and what kind of look are you going for today?"
  );
  assert.equal(chatEntryFlow.getServiceShellConfig("customer_service").openingMessage, "How can I help you today?");
  assert.equal(
    chatEntryFlow.getServiceShellConfig("get_inspired").openingMessage,
    "Share a look you love, and I’ll help turn it into style inspiration for you."
  );
  assert.equal(
    chatEntryFlow.getServiceShellConfig("complete_my_look").openingMessage,
    "Upload a look or item, and I’ll help complete it with the right pieces."
  );
});
