(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.StyledGenieMyStyleUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  function deriveCompletionPercent(rawProfile) {
    const directCompletion =
      rawProfile && rawProfile.completion !== undefined && rawProfile.completion !== null
        ? Number(rawProfile.completion)
        : null;

    if (Number.isFinite(directCompletion)) {
      return clampPercent(directCompletion);
    }

    const completedFields = Number(
      rawProfile?.completedFields ?? rawProfile?.completed_fields ?? rawProfile?.completed ?? 0
    );
    const totalFields = Number(
      rawProfile?.totalFields ?? rawProfile?.total_fields ?? rawProfile?.total ?? 0
    );

    if (Number.isFinite(completedFields) && Number.isFinite(totalFields) && totalFields > 0) {
      return clampPercent((completedFields / totalFields) * 100);
    }

    return 0;
  }

  function buildSizeSummary(rawProfile) {
    const existing = normalizeText(rawProfile?.sizeSummary ?? rawProfile?.size_summary);
    if (existing) {
      return existing;
    }

    const nestedSizes = rawProfile?.sizes || {};
    const parts = [
      rawProfile?.top_size,
      rawProfile?.bottom_size,
      rawProfile?.shoe_size_eu,
      nestedSizes.top,
      nestedSizes.bottom,
      nestedSizes.shoeEu,
    ]
      .map(normalizeText)
      .filter(Boolean);

    const deduped = [];
    parts.forEach((item) => {
      if (!deduped.includes(item)) {
        deduped.push(item);
      }
    });

    return deduped.join(" / ");
  }

  function buildProfileSubtitle(rawProfile) {
    const directSubtitle = normalizeText(
      rawProfile?.subtitle ??
        rawProfile?.style_summary ??
        rawProfile?.styleSummary ??
        rawProfile?.description ??
        rawProfile?.occasion_focus
    );
    if (directSubtitle) {
      return directSubtitle;
    }

    const bodyType = normalizeText(rawProfile?.bodyType ?? rawProfile?.body_type ?? rawProfile?.features?.bodyType).replace(/_/g, " ");
    const budget = normalizeText(rawProfile?.budget).replace(/_/g, " ");
    const sizeSummary = buildSizeSummary(rawProfile);
    const summary = [bodyType, budget, sizeSummary].filter(Boolean).join(" • ");

    return summary || "Profile details ready for future styling.";
  }

  function normalizeProfile(rawProfile, index) {
    const id =
      normalizeText(
        rawProfile?.id ?? rawProfile?.profile_id ?? rawProfile?.uuid ?? rawProfile?.customer_identifier
      ) || `style-profile-${index + 1}`;
    const name =
      normalizeText(
        rawProfile?.name ?? rawProfile?.title ?? rawProfile?.profile_name ?? rawProfile?.label
      ) || "Untitled profile";
    const customerDisplayName = normalizeText(
      rawProfile?.customerDisplayName ??
        rawProfile?.customer_display_name ??
        rawProfile?.accountDisplayName ??
        rawProfile?.account_display_name ??
        rawProfile?.customerEmail ??
        rawProfile?.customer_email
    );

    return {
      id,
      name,
      subtitle: buildProfileSubtitle(rawProfile),
      completion: deriveCompletionPercent(rawProfile),
      completedFields: Number(rawProfile?.completedFields ?? rawProfile?.completed_fields ?? 0) || 0,
      totalFields: Number(rawProfile?.totalFields ?? rawProfile?.total_fields ?? 0) || 0,
      avatarUrl: normalizeText(rawProfile?.avatarUrl ?? rawProfile?.avatar_url) || null,
      isPrimary: Boolean(rawProfile?.isPrimary ?? rawProfile?.is_primary),
      relationship: normalizeText(rawProfile?.relationship) || "self",
      gender: normalizeText(rawProfile?.gender),
      sizeSummary: buildSizeSummary(rawProfile) || "Sizes not added yet",
      bodyType: normalizeText(rawProfile?.bodyType ?? rawProfile?.body_type ?? rawProfile?.features?.bodyType),
      budget: normalizeText(rawProfile?.budget) || "Not set",
      styleSummary: normalizeText(rawProfile?.styleSummary ?? rawProfile?.style_summary),
      customerDisplayName,
      customerEmail:
        normalizeText(rawProfile?.customerEmail ?? rawProfile?.customer_email) || null,
      customerIdentifier:
        normalizeText(rawProfile?.customerIdentifier ?? rawProfile?.customer_identifier) || null,
      updatedAt: normalizeText(rawProfile?.updatedAt ?? rawProfile?.updated_at) || "",
    };
  }

  function normalizeProfiles(payload) {
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.profiles)
        ? payload.profiles
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

    return source.map((item, index) => normalizeProfile(item, index));
  }

  function buildProfileCreateUrl(basePath) {
    const normalizedBase = normalizeText(basePath) || "/merchant-dashboard/";
    const url = new URL(normalizedBase, "https://styledgenie.local");
    url.searchParams.set("section", "my-style");
    url.searchParams.set("action", "create");
    return `${url.pathname}${url.search}`;
  }

  function buildProfileDetailsUrl(profileId, basePath) {
    const normalizedBase = normalizeText(basePath) || "/merchant-dashboard/";
    const url = new URL(normalizedBase, "https://styledgenie.local");
    url.searchParams.set("section", "my-style");
    url.searchParams.set("profile", normalizeText(profileId));
    return `${url.pathname}${url.search}`;
  }

  function buildMyStyleDashboardViewModel(options) {
    const normalizedProfiles = normalizeProfiles(options?.payload);
    const loading = Boolean(options?.loading);
    const error = normalizeText(options?.error);
    const selectedProfileId = normalizeText(options?.selectedProfileId);
    const selectedProfile =
      normalizedProfiles.find((profile) => profile.id === selectedProfileId) || null;

    if (loading) {
      return {
        state: "loading",
        profiles: normalizedProfiles,
        selectedProfile,
      };
    }

    if (error) {
      return {
        state: "error",
        error,
        profiles: normalizedProfiles,
        selectedProfile,
      };
    }

    if (!normalizedProfiles.length) {
      return {
        state: "empty",
        profiles: [],
        selectedProfile: null,
      };
    }

    return {
      state: selectedProfile ? "detail" : "loaded",
      profiles: normalizedProfiles,
      selectedProfile,
      primaryProfiles: normalizedProfiles.filter((profile) => profile.isPrimary),
      supportingProfiles: normalizedProfiles.filter((profile) => !profile.isPrimary),
      averageCompletion: clampPercent(
        normalizedProfiles.reduce((sum, profile) => sum + profile.completion, 0) /
          normalizedProfiles.length
      ),
    };
  }

  return {
    normalizeProfiles,
    deriveCompletionPercent,
    buildProfileCreateUrl,
    buildProfileDetailsUrl,
    buildMyStyleDashboardViewModel,
  };
});
