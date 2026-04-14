import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildMyStyleDashboardViewModel,
  buildProfileDetailsUrl,
  deriveCompletionPercent,
  normalizeProfiles,
} = require("../apps/merchant-dashboard/my-style-utils.js");

test("normalizeProfiles returns an empty list for empty input", () => {
  assert.deepEqual(normalizeProfiles(null), []);
  assert.deepEqual(normalizeProfiles({}), []);
});

test("normalizeProfiles supports payload.profiles", () => {
  const profiles = normalizeProfiles({
    profiles: [
      {
        id: "profile-1",
        name: "Mia",
        completion: 82,
      },
    ],
  });

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, "Mia");
  assert.equal(profiles[0].completion, 82);
});

test("normalizeProfiles uses safe fallback id and name", () => {
  const profiles = normalizeProfiles({
    profiles: [
      {
        completion: 20,
      },
    ],
  });

  assert.equal(profiles[0].id, "style-profile-1");
  assert.equal(profiles[0].name, "Untitled profile");
});

test("deriveCompletionPercent clamps completion between 0 and 100", () => {
  assert.equal(deriveCompletionPercent({ completion: 128 }), 100);
  assert.equal(deriveCompletionPercent({ completion: -14 }), 0);
});

test("deriveCompletionPercent falls back to completed_fields and total_fields", () => {
  assert.equal(
    deriveCompletionPercent({
      completed_fields: 3,
      total_fields: 4,
    }),
    75
  );
});

test("buildProfileDetailsUrl URL-encodes the profile id", () => {
  const href = buildProfileDetailsUrl("profile/one?x=1", "/merchant-dashboard/");

  assert.match(href, /section=my-style/);
  assert.match(href, /profile=profile%2Fone%3Fx%3D1/);
});

test("dashboard view model returns the empty state when no profiles exist", () => {
  const view = buildMyStyleDashboardViewModel({
    payload: { profiles: [] },
    loading: false,
    error: "",
  });

  assert.equal(view.state, "empty");
});

test("dashboard view model returns the error state on failed request", () => {
  const view = buildMyStyleDashboardViewModel({
    payload: { profiles: [] },
    loading: false,
    error: "Request failed",
  });

  assert.equal(view.state, "error");
  assert.equal(view.error, "Request failed");
});

test("dashboard view model returns the loaded state when profiles exist", () => {
  const view = buildMyStyleDashboardViewModel({
    payload: {
      profiles: [
        {
          id: "profile-1",
          name: "Mia",
          completion: 82,
          is_primary: true,
        },
      ],
    },
    loading: false,
    error: "",
  });

  assert.equal(view.state, "loaded");
  assert.equal(view.profiles.length, 1);
  assert.equal(view.primaryProfiles.length, 1);
});
