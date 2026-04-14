/** @jsxImportSource preact */
// @ts-nocheck

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import {
  BODY_TYPE_OPTIONS,
  BUDGET_OPTIONS,
  FABRIC_ALLERGY_OPTIONS,
  GENDER_OPTIONS,
  OCCASION_OPTIONS,
  PALETTE_OPTIONS,
  PREFERRED_FIT_OPTIONS,
  RELATIONSHIP_OPTIONS,
  SHOPPING_CATEGORY_OPTIONS,
  SKIN_TONE_OPTIONS,
  buildFlowStepView,
  buildMyStyleViewModel,
  buildProfileCardSummary,
  buildSavePayload,
  buildStyleAnalysisDraft,
  createEmptyStyleProfile,
  deriveProfileCompletionPercent,
  getFlowStepsForDraft,
  getNextFlowStep,
  getPreviousFlowStep,
  getStepBlockingMessage,
  normalizeStyleProfile,
  normalizeStyleProfiles,
  validateProfileDraft,
} from "./style-profile-utils.mjs";

export default async () => {
  render(<MyStyleProfileExtension />, document.body);
};

const DEV_FALLBACK_API_BASE = "https://shivering-herring-iguana.ngrok-free.dev";
const PROFILE_CACHE_KEY = "styledgenie-account-style-profiles-v1";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_HELPER_LINE = "AI can make mistakes. Please review and edit any details before saving.";
const MY_STYLE_OWNER_LOCK_KEY = "styledgenie-my-style-owner-lock-v1";
const MY_STYLE_OWNER_LOCK_TTL_MS = 15000;
const MY_STYLE_ROUTE_INTENT_CLAIM_KEY = "styledgenie-my-style-route-intent-claim-v1";
const MY_STYLE_ROUTE_INTENT_CLAIM_TTL_MS = 120000;
let runtimePrimaryMyStyleInstanceId = "";

function claimRuntimePrimaryMyStyleInstance(instanceId) {
  const normalizedInstanceId = normalizeText(instanceId);
  if (!normalizedInstanceId) {
    return false;
  }

  if (!runtimePrimaryMyStyleInstanceId) {
    runtimePrimaryMyStyleInstanceId = normalizedInstanceId;
  }

  return runtimePrimaryMyStyleInstanceId === normalizedInstanceId;
}

function releaseRuntimePrimaryMyStyleInstance(instanceId) {
  if (runtimePrimaryMyStyleInstanceId !== normalizeText(instanceId)) {
    return;
  }
  runtimePrimaryMyStyleInstanceId = "";
}

function MyStyleProfileExtension() {
  const configuredApiBaseUrl = normalizeApiBase(shopify?.settings?.value?.api_base_url);
  const apiBaseUrl = configuredApiBaseUrl || DEV_FALLBACK_API_BASE;
  const customerId = getAuthenticatedCustomerId();
  const customerEmail = getAuthenticatedCustomerEmail();
  const accountDisplayName = getAuthenticatedAccountName();
  const routeIntent = useMemo(readStyledGenieRouteIntent, []);

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(Boolean(apiBaseUrl && (customerId || customerEmail)));
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [flowState, setFlowState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [routeIntentHandled, setRouteIntentHandled] = useState(false);
  const [pendingScanChecked, setPendingScanChecked] = useState(false);
  const [scanState, setScanState] = useState(createInitialScanState());
  const [accountProfileUrl, setAccountProfileUrl] = useState("");
  const [instanceId] = useState(() => `styledgenie-my-style-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [isPrimaryRenderedBlock, setIsPrimaryRenderedBlock] = useState(() =>
    claimRuntimePrimaryMyStyleInstance(instanceId)
  );
  const [instanceStartedAt] = useState(() => Date.now());
  const cameraLaunchUrl = useMemo(() => {
    if (!flowState) {
      return "";
    }

    return buildHostedCameraCaptureUrl({
      apiBaseUrl,
      sessionId: flowState.sessionId,
      returnUrl: accountProfileUrl,
      customerId,
      customerEmail,
    });
  }, [apiBaseUrl, accountProfileUrl, customerEmail, customerId, flowState]);
  const uploadLaunchUrl = useMemo(() => {
    if (!flowState) {
      return "";
    }

    return buildHostedCameraCaptureUrl({
      apiBaseUrl,
      sessionId: flowState.sessionId,
      returnUrl: accountProfileUrl,
      mode: "upload",
      customerId,
      customerEmail,
    });
  }, [apiBaseUrl, accountProfileUrl, customerEmail, customerId, flowState]);

  async function resolveAccountProfileUrl() {
    const currentProfileUrl = stripStyledGenieIntentFromUrl(
      typeof window !== "undefined" ? window.location?.href : ""
    );
    if (currentProfileUrl) {
      return currentProfileUrl;
    }

    const referrerProfileUrl = stripStyledGenieIntentFromUrl(
      typeof document !== "undefined" ? document.referrer : ""
    );
    if (referrerProfileUrl) {
      return referrerProfileUrl;
    }

    try {
      const response = await shopify.query(
        `query StyledGenieMyStyleAccountRoute {
          shop {
            primaryDomain {
              url
            }
          }
        }`
      );

      const primaryDomainUrl = normalizeText(response?.data?.shop?.primaryDomain?.url);
      const hostedProfileUrl = buildHostedAccountProfileUrl(primaryDomainUrl);
      if (hostedProfileUrl) {
        return stripStyledGenieIntentFromUrl(hostedProfileUrl) || hostedProfileUrl;
      }
    } catch (_error) {
      // Fall through to backend-configured storefront domain fallback.
    }

    if (!apiBaseUrl) {
      return "";
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/customer/account-profile-url`, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return "";
      }
      return stripStyledGenieIntentFromUrl(payload?.profileUrl);
    } catch (_error) {
      return "";
    }
  }

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return () => {
        releaseRuntimePrimaryMyStyleInstance(instanceId);
      };
    }

    let cancelled = false;

    async function claimOwnerLock() {
      const didClaim = await claimMyStyleOwnerLock(instanceId);
      if (cancelled) {
        return;
      }

      setIsPrimaryRenderedBlock(didClaim);
      if (!didClaim) {
        console.info("[StyledGenie] MY_STYLE_DUPLICATE_BLOCK_HIDDEN_LOCK");
      }
    }

    void claimOwnerLock();

    const intervalId = setInterval(() => {
      void (async () => {
        const stillOwner = await refreshMyStyleOwnerLock(instanceId);
        if (cancelled) {
          return;
        }
        if (!stillOwner && isPrimaryRenderedBlock) {
          setIsPrimaryRenderedBlock(false);
          console.info("[StyledGenie] MY_STYLE_OWNER_LOST");
        }
        if (stillOwner && !isPrimaryRenderedBlock) {
          setIsPrimaryRenderedBlock(true);
          console.info("[StyledGenie] MY_STYLE_OWNER_REGAINED");
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      void releaseMyStyleOwnerLock(instanceId);
      releaseRuntimePrimaryMyStyleInstance(instanceId);
    };
  }, [instanceId, isPrimaryRenderedBlock]);

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return;
    }

    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel("styledgenie-my-style-owner-channel-v1");
    let closed = false;

    const announce = () => {
      try {
        channel.postMessage({
          type: "announce",
          instanceId,
          startedAt: instanceStartedAt,
        });
      } catch (_error) {
        return;
      }
    };

    const publishPrimary = () => {
      try {
        channel.postMessage({
          type: "primary",
          instanceId,
          startedAt: instanceStartedAt,
        });
      } catch (_error) {
        return;
      }
    };

    channel.onmessage = (event) => {
      const message = event?.data || {};
      const senderId = normalizeText(message?.instanceId);
      const senderStartedAt = Number(message?.startedAt || 0);

      if (!senderId || senderId === instanceId || !Number.isFinite(senderStartedAt)) {
        return;
      }

      const senderWins =
        senderStartedAt < instanceStartedAt ||
        (senderStartedAt === instanceStartedAt && senderId.localeCompare(instanceId) < 0);

      if (senderWins) {
        if (isPrimaryRenderedBlock) {
          setIsPrimaryRenderedBlock(false);
          console.info("[StyledGenie] MY_STYLE_DUPLICATE_BLOCK_HIDDEN_CHANNEL");
        }
        return;
      }

      if (message?.type === "announce" && isPrimaryRenderedBlock) {
        publishPrimary();
      }
    };

    announce();
    const settleTimer = setTimeout(() => {
      if (!closed && isPrimaryRenderedBlock) {
        publishPrimary();
      }
    }, 250);

    return () => {
      closed = true;
      clearTimeout(settleTimer);
      try {
        channel.close();
      } catch (_error) {
        return;
      }
    };
  }, [instanceId, instanceStartedAt, isPrimaryRenderedBlock]);

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return;
    }

    let cancelled = false;

    async function loadAccountProfileUrl() {
      const resolvedProfileUrl = await resolveAccountProfileUrl();
      if (!cancelled) {
        setAccountProfileUrl(resolvedProfileUrl);
      }
    }

    void loadAccountProfileUrl();

    return () => {
      cancelled = true;
    };
  }, [isPrimaryRenderedBlock]);

  async function loadProfileCache() {
    try {
      let parsed = null;
      if (shopify?.storage && typeof shopify.storage.read === "function") {
        parsed = await shopify.storage.read(PROFILE_CACHE_KEY);
      }

      if (!parsed) {
        if (typeof window === "undefined" || !window.localStorage) {
          return [];
        }
        const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
        if (!raw) {
          return [];
        }
        parsed = JSON.parse(raw);
      }

      const cachedCustomerId = normalizeCustomerCacheIdentifier(parsed?.customerId);
      const liveCustomerId = normalizeCustomerCacheIdentifier(customerId);
      const cachedEmail = normalizeCustomerCacheEmail(parsed?.customerEmail);
      const liveEmail = normalizeCustomerCacheEmail(customerEmail);
      const idMatches = cachedCustomerId && liveCustomerId && cachedCustomerId === liveCustomerId;
      const emailMatches = cachedEmail && liveEmail && cachedEmail === liveEmail;

      if (!idMatches && !emailMatches) {
        return [];
      }

      return Array.isArray(parsed?.profiles) ? normalizeStyleProfiles(parsed.profiles) : [];
    } catch (_error) {
      return [];
    }
  }

  async function syncBrowserProfileCache(nextProfiles) {
    const payload = {
      customerId: normalizeCustomerCacheIdentifier(customerId) || null,
      customerEmail: normalizeCustomerCacheEmail(customerEmail) || null,
      accountDisplayName: accountDisplayName || null,
      profiles: normalizeStyleProfiles(nextProfiles || []),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (shopify?.storage && typeof shopify.storage.write === "function") {
        await shopify.storage.write(PROFILE_CACHE_KEY, payload);
      }

      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
      }
    } catch (_error) {
      return;
    }
  }

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return;
    }

    let cancelled = false;

    async function loadProfiles() {
      if (!customerId && !customerEmail) {
        if (!cancelled) {
          setLoading(false);
          setErrorMessage("Sign in to customer accounts before managing style profiles.");
        }
        return;
      }

      if (!apiBaseUrl) {
        if (!cancelled) {
          const cachedProfiles = await loadProfileCache();
          setLoading(false);
          if (cachedProfiles.length) {
            setProfiles(cachedProfiles);
            setStatusMessage("Showing your last saved My Style details while I reconnect.");
            setErrorMessage("");
          } else {
            setErrorMessage("I couldn’t load your style profiles right now.");
          }
        }
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const cachedProfiles = await loadProfileCache();
        if (!cancelled && cachedProfiles.length) {
          setProfiles(cachedProfiles);
          setStatusMessage("Showing your last saved My Style details while I refresh.");
        }

        const response = await fetch(
          `${apiBaseUrl}/api/customer/style-profiles?${new URLSearchParams({
            ...(customerId ? { customer_id: customerId } : {}),
            ...(customerEmail ? { customer_email: customerEmail } : {}),
            ...(accountDisplayName ? { account_display_name: accountDisplayName } : {}),
          }).toString()}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(readApiError(data, "I couldn’t load your style profiles right now."));
        }

        if (!cancelled) {
          const normalizedProfiles = normalizeStyleProfiles(data.profiles || []);
          setProfiles(normalizedProfiles);
          await syncBrowserProfileCache(normalizedProfiles);
          setStatusMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          const cachedProfiles = await loadProfileCache();
          if (cachedProfiles.length) {
            setProfiles(cachedProfiles);
            setStatusMessage("Showing your last saved My Style details while I reconnect.");
            setErrorMessage("");
          } else {
            setErrorMessage(String(error?.message || "I couldn’t load your style profiles right now."));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, customerId, customerEmail, accountDisplayName, isPrimaryRenderedBlock]);

  async function consumePendingScanHandoff(options = {}) {
    if (!apiBaseUrl) {
      return null;
    }

    const candidateSessionId = normalizeText(options?.sessionId || "");
    const endpoint = new URL(`${apiBaseUrl}/api/profiles/scan-handoff`);

    if (customerId) {
      endpoint.searchParams.set("customer_id", customerId);
    }
    if (customerEmail) {
      endpoint.searchParams.set("customer_email", customerEmail);
    }
    if (candidateSessionId) {
      endpoint.searchParams.set("session_id", candidateSessionId);
    }

    endpoint.searchParams.set("allow_fallback", "true");

    try {
      const response = await fetch(endpoint.toString(), {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return null;
      }

      if (!payload?.hasPending || !payload?.scanPayload) {
        return null;
      }

      return {
        sessionId: normalizeText(payload?.sessionId),
        scanPayload: normalizeScanRoutePayload(payload?.scanPayload),
      };
    } catch (_error) {
      return null;
    }
  }

  useEffect(() => {
    if (
      !isPrimaryRenderedBlock ||
      routeIntentHandled ||
      flowState ||
      (!routeIntent.createProfile && !routeIntent.scanComplete)
    ) {
      return;
    }

    let cancelled = false;

    async function handleRouteIntent() {
      let shouldClearRouteIntent = true;
      try {
        const canHandleIntent = claimRouteIntent(routeIntent, instanceId);
        if (!canHandleIntent) {
          shouldClearRouteIntent = false;
          console.info("[StyledGenie] MY_STYLE_ROUTE_INTENT_SKIPPED_DUPLICATE");
          return;
        }

        if (routeIntent.scanComplete && routeIntent.scanPayload) {
          if (!cancelled) {
            openCreateFlowFromScanIntent(routeIntent);
          }
          return;
        }

        const pendingScan = await consumePendingScanHandoff({ sessionId: routeIntent.sessionId });
        if (cancelled) {
          return;
        }

        if (pendingScan?.scanPayload) {
          openCreateFlowFromScanIntent({
            sessionId: pendingScan.sessionId || routeIntent.sessionId,
            scanPayload: pendingScan.scanPayload,
            returnUrl: routeIntent.returnUrl,
          });
          setStatusMessage("Image ready. Continue completing your profile details.");
          setErrorMessage("");
          return;
        }

        openCreatePrimaryFlow({ sessionId: routeIntent.sessionId, returnUrl: routeIntent.returnUrl });
      } finally {
        if (!cancelled) {
          if (shouldClearRouteIntent) {
            clearStyledGenieRouteIntent();
          }
          setRouteIntentHandled(true);
          setPendingScanChecked(true);
        }
      }
    }

    void handleRouteIntent();

    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    customerEmail,
    customerId,
    routeIntentHandled,
    flowState,
    routeIntent.createProfile,
    routeIntent.scanComplete,
    routeIntent.scanPayload,
    routeIntent.sessionId,
    routeIntent.returnUrl,
    instanceId,
    isPrimaryRenderedBlock,
  ]);

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return;
    }

    if (
      pendingScanChecked ||
      loading ||
      flowState ||
      routeIntent.createProfile ||
      routeIntent.scanComplete
    ) {
      return;
    }

    if (!apiBaseUrl) {
      setPendingScanChecked(true);
      return;
    }

    let cancelled = false;

    async function consumePendingScanAfterReturn() {
      try {
        const pendingScan = await consumePendingScanHandoff({ sessionId: routeIntent.sessionId });
        if (cancelled || !pendingScan?.scanPayload) {
          return;
        }

        openCreateFlowFromScanIntent({
          sessionId: pendingScan.sessionId || routeIntent.sessionId,
          scanPayload: pendingScan.scanPayload,
          returnUrl: "",
        });
        setStatusMessage("Image ready. Continue completing your profile details.");
        setErrorMessage("");
      } finally {
        if (!cancelled) {
          setPendingScanChecked(true);
        }
      }
    }

    void consumePendingScanAfterReturn();

    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    customerEmail,
    customerId,
    flowState,
    loading,
    pendingScanChecked,
    routeIntent.createProfile,
    routeIntent.scanComplete,
    routeIntent.sessionId,
    isPrimaryRenderedBlock,
  ]);

  const viewModel = useMemo(
    () =>
      buildMyStyleViewModel({
        profiles,
        loading,
        error: !flowState ? errorMessage : "",
      }),
    [profiles, loading, errorMessage, flowState]
  );
  const showStatusPanel = Boolean(statusMessage) && !flowState;

  useEffect(() => {
    if (!isPrimaryRenderedBlock) {
      return;
    }

    if (!flowState || flowState.step === "method" || flowState.step === "scan") {
      return;
    }

    setScanState((current) => {
      if (!current.chooserVisible && !current.loading && !current.error && !current.fallbackMessage) {
        return current;
      }

      return {
        ...current,
        chooserVisible: false,
        loading: false,
        error: "",
        fallbackMessage: "",
      };
    });
  }, [flowState, isPrimaryRenderedBlock]);

  function openCreatePrimaryFlow(options = {}) {
    setStatusMessage("");
    setErrorMessage("");
    setScanState(createInitialScanState());
    setFlowState({
      mode: "create",
      sessionId: normalizeText(options.sessionId),
      returnUrl: getSafeReturnUrl(options.returnUrl),
      step: "method",
      draft: createEmptyStyleProfile({
        isPrimary: profiles.length === 0,
        relationship: profiles.length === 0 ? "self" : "other",
        name: accountDisplayName,
      }),
    });
  }

  function openAddPersonFlow() {
    setStatusMessage("");
    setErrorMessage("");
    setScanState(createInitialScanState());
    setFlowState({
      mode: "create",
      sessionId: "",
      returnUrl: "",
      step: "method",
      draft: createEmptyStyleProfile({
        isPrimary: false,
        relationship: "spouse_partner",
      }),
    });
  }

  function openCreateFlowFromScanIntent(routeIntentState) {
    const scanPayload = normalizeScanRoutePayload(routeIntentState?.scanPayload);
    if (!scanPayload) {
      openCreatePrimaryFlow({ sessionId: routeIntentState?.sessionId, returnUrl: routeIntentState?.returnUrl });
      return;
    }

    const analysisResult = normalizeImageAnalysisResult(scanPayload.analysisResult || {});

    const draft = createEmptyStyleProfile({
      isPrimary: profiles.length === 0,
      relationship: profiles.length === 0 ? "self" : "other",
      name: accountDisplayName,
      source: {
        method: scanPayload.method || "camera",
        sourceImageUrl: scanPayload.imageValidation?.sourceImageUrl || "",
        imageName: scanPayload.imageName || "",
      },
      features: {
        hairColor: analysisResult.hairColor || "",
        eyeColor: analysisResult.eyeColor || "",
      },
      imageValidation: scanPayload.imageValidation,
    });

    setStatusMessage(
      analysisResult.hairColor || analysisResult.eyeColor
        ? "Full body scan analyzed. Please review and edit every profile detail before saving."
        : "Full body scan ready. Please review and edit every profile detail before saving."
    );
    setErrorMessage("");
    setScanState({
      method: scanPayload.method || "camera",
      loading: false,
      validated: Boolean(scanPayload.imageValidation?.ok),
      fileName: scanPayload.imageName || "",
      previewUrl: "",
      imageMimeType: "",
      imageContentBase64: "",
      result: normalizeImageValidationResult(scanPayload.imageValidation),
      analyzing: false,
      analysisError: "",
      analysisResult,
      error: "",
      fallbackMessage: "",
      chooserVisible: false,
      chooserToken: 0,
    });
    setFlowState({
      mode: "create",
      sessionId: normalizeText(routeIntentState?.sessionId),
      returnUrl: getSafeReturnUrl(routeIntentState?.returnUrl),
      step: "basic",
      draft,
    });
  }

  function openEditFlow(profile) {
    setStatusMessage("");
    setErrorMessage("");
    setScanState(scanStateFromProfile(profile));
    setFlowState({
      mode: "edit",
      sessionId: "",
      returnUrl: "",
      step: "basic",
      draft: normalizeStyleProfile(profile),
    });
  }

  function closeFlow() {
    if (saving) {
      return;
    }
    setFlowState(null);
    setErrorMessage("");
    setScanState(createInitialScanState());
  }

  function updateDraft(updater) {
    setFlowState((current) => {
      if (!current) {
        return current;
      }

      const nextDraft =
        typeof updater === "function" ? updater(normalizeStyleProfile(current.draft)) : normalizeStyleProfile(updater);
      const analysis = buildStyleAnalysisDraft(nextDraft);

      return {
        ...current,
        draft: {
          ...nextDraft,
          styleAnalysis: {
            summary: analysis.summary,
            tags: Array.isArray(analysis.tags) ? analysis.tags : [],
          },
        },
      };
    });
  }

  function setDraftField(group, key, value) {
    updateDraft((draft) => {
      if (group) {
        return {
          ...draft,
          [group]: {
            ...(draft[group] || {}),
            [key]: normalizeText(value),
          },
        };
      }

      return {
        ...draft,
        [key]: normalizeText(value),
      };
    });
  }

  function setListField(key, values) {
    updateDraft((draft) => ({
      ...draft,
      [key]: normalizeCsvTags(values),
    }));
  }

  function toggleListValue(key, value) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return;
    }

    updateDraft((draft) => {
      const currentValues = Array.isArray(draft[key]) ? draft[key] : [];
      const exists = currentValues.some((item) => item.toLowerCase() === normalizedValue.toLowerCase());
      const nextValues = exists
        ? currentValues.filter((item) => item.toLowerCase() !== normalizedValue.toLowerCase())
        : [...currentValues, normalizedValue];
      return {
        ...draft,
        [key]: nextValues,
      };
    });
  }

  function setBudgetField(key, value) {
    updateDraft((draft) => ({
      ...draft,
      [key]: parseBudgetInput(value),
    }));
  }

  function applyBudgetPreset(option) {
    updateDraft((draft) => ({
      ...draft,
      minBudget: option.min,
      maxBudget: option.max,
      budget: option.value,
    }));
  }

  function selectImageFromMethod(method) {
    if (!flowState || saving) {
      return;
    }

    const normalizedMethod = normalizeText(method).toLowerCase();
    const methodGuidance =
      normalizedMethod === "camera"
        ? "Tap the upload area below to take or choose a full body image. If camera access is unavailable, please upload a full body image instead."
        : "Choose a full body image from this device to continue.";

    setErrorMessage("");
    setStatusMessage("");
    updateDraft((draft) => ({
      ...draft,
      source: {
        ...(draft.source || {}),
        method: normalizedMethod,
        sourceImageUrl: "",
        imageName: "",
      },
      imageValidation: {
        ok: false,
        fullBodyLikelyVisible: false,
        blurScore: null,
        qualityWarnings: [],
        guidance: [],
        sourceImageUrl: "",
      },
    }));
    setScanState((current) => ({
      ...current,
      method: normalizedMethod,
      loading: false,
      validated: false,
      fileName: "",
      previewUrl: "",
      imageMimeType: "",
      imageContentBase64: "",
      result: null,
      analyzing: false,
      analysisError: "",
      analysisResult: null,
      error: "",
      fallbackMessage: methodGuidance,
      chooserVisible: true,
      chooserToken: Number(current?.chooserToken || 0) + 1,
    }));
  }

  function startHostedCameraCapture() {
    if (!flowState || saving) {
      return;
    }

    console.info("[StyledGenie] SCAN_BUTTON_CLICKED");
    console.info(`[StyledGenie] SCAN_ROUTE_TARGET_RESOLVED:${cameraLaunchUrl || "none"}`);
    console.info("[StyledGenie] SCAN_ROUTE_BYPASSED_INLINE_CAMERA");
    setErrorMessage("");
    setStatusMessage("Choose or capture a full body image to continue.");
    selectImageFromMethod("camera");
  }

  function startHostedUploadCapture() {
    if (!flowState || saving) {
      return;
    }

    console.info("[StyledGenie] UPLOAD_BUTTON_CLICKED");
    console.info(`[StyledGenie] UPLOAD_ROUTE_TARGET_RESOLVED:${uploadLaunchUrl || "none"}`);

    setErrorMessage("");
    setStatusMessage("Choose a full body image to continue.");
    selectImageFromMethod("upload");
  }

  async function handleInlineFileSelection(eventOrFile, method) {
    const file = extractImageFileFromEvent(eventOrFile);
    if (!file) {
      return;
    }

    try {
      await handleSelectedImage(file, method);
    } catch (error) {
      const failureMessage = String(error?.message || "I couldn’t read that image right now.");
      setErrorMessage(failureMessage);
      setScanState((current) => ({
        ...current,
        loading: false,
        validated: false,
        error: failureMessage,
      }));
    }
  }

  async function handleSelectedImage(file, method) {
    if (!file) {
      return;
    }

    const normalizedMethod = normalizeText(method).toLowerCase();
    if (!/^image\//i.test(file.type || "")) {
      setErrorMessage("Please choose a JPG, PNG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setErrorMessage("Please choose an image under 10MB.");
      return;
    }

    setErrorMessage("");
    setScanState((current) => ({
      ...current,
      method: normalizedMethod,
      loading: false,
      validated: false,
      fileName: file.name,
      previewUrl: current.previewUrl || "",
      imageMimeType: file.type || "image/jpeg",
      imageContentBase64: "",
      result: null,
      analyzing: false,
      analysisError: "",
      analysisResult: null,
      error: "",
      fallbackMessage:
        normalizedMethod === "camera"
          ? "Tap below again to retake the photo, or switch to Upload Full Body Image if camera access stays unavailable."
          : "Choose a different full body image if you want to retry.",
      chooserVisible: true,
      chooserToken: Number(current?.chooserToken || 0),
    }));

    // Seed a canonical intake context as soon as a file is selected so the
    // Continue handoff is never blocked by slow file parsing.
    const provisionalImageContext = buildProfileImageContext({
      sourceMethod: normalizedMethod,
      sourceImageUrl: "",
      imagePreviewUrl: "",
      imageValidation: {
        ok: false,
        fullBodyLikelyVisible: false,
        guidance: ["Image selected. Continue to complete your profile details."],
        qualityWarnings: [],
        sourceImageUrl: "",
      },
    });
    updateDraft((draft) =>
      normalizeDraftWithImageContext(draft, provisionalImageContext, {
        imageName: file.name,
      })
    );
    console.info("[StyledGenie] MY_STYLE_IMAGE_CONTEXT_READY_PROVISIONAL");

    console.info("[StyledGenie] MY_STYLE_IMAGE_READ_STARTED");
    const encoded = await withTimeout(
      readFileAsDataUrl(file),
      12000,
      "The image took too long to read. Please try a different photo."
    );
    const base64Content = extractBase64Content(encoded.dataUrl);
    const previewUrl = encoded.dataUrl;
    if (!previewUrl || !base64Content) {
      throw new Error("I couldn’t process that image. Please try a different file.");
    }
    console.info("[StyledGenie] MY_STYLE_IMAGE_READ_COMPLETED");

    setScanState((current) => ({
      ...current,
      previewUrl,
      imageMimeType: file.type || "image/jpeg",
      imageContentBase64: base64Content,
      fileName: file.name,
    }));
    const optimisticValidationResult = normalizeImageValidationResult({
      ok: false,
      fullBodyLikelyVisible: false,
      qualityWarnings: [],
      guidance: ["Image selected. Continue to complete your profile details."],
      sourceImageUrl: "",
    });
    const optimisticImageContext = buildProfileImageContext({
      sourceMethod: normalizedMethod,
      sourceImageUrl: "",
      imagePreviewUrl: previewUrl,
      imageValidation: optimisticValidationResult,
    });

    setScanState((current) => ({
      ...current,
      loading: false,
      validated: true,
      result: optimisticValidationResult,
      error: "",
    }));
    updateDraft((draft) =>
      normalizeDraftWithImageContext(draft, optimisticImageContext, {
        imageName: file.name,
      })
    );
    console.info("[StyledGenie] MY_STYLE_IMAGE_CONTEXT_READY");

    if (!apiBaseUrl) {
      const localValidationResult = normalizeImageValidationResult({
        ok: false,
        fullBodyLikelyVisible: false,
        qualityWarnings: ["Image validation is unavailable right now."],
        guidance: ["Please review and edit every profile detail manually before saving."],
        sourceImageUrl: "",
      });
      const normalizedImageContext = buildProfileImageContext({
        sourceMethod: normalizedMethod,
        sourceImageUrl: localValidationResult.sourceImageUrl,
        imagePreviewUrl: previewUrl,
        imageValidation: localValidationResult,
      });
      setScanState((current) => ({
        ...current,
        loading: false,
        validated: true,
        result: localValidationResult,
      }));
      updateDraft((draft) =>
        normalizeDraftWithImageContext(draft, normalizedImageContext, {
          imageName: file.name,
        })
      );
      if (normalizedMethod === "upload") {
        console.info("[StyledGenie] MY_STYLE_UPLOAD_SUCCEEDED");
        console.info("[StyledGenie] MY_STYLE_UPLOAD_STATE_NORMALIZED");
      }
      return;
    }

    try {
      console.info("[StyledGenie] MY_STYLE_IMAGE_VALIDATION_STARTED");
      const { response, data } = await fetchJsonWithTimeout(
        `${apiBaseUrl}/api/profiles/validate-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            imageName: file.name,
            imageContentBase64: base64Content,
            imageMimeType: file.type || "image/jpeg",
            sourceMethod: normalizedMethod,
          }),
        },
        15000
      );
      if (!response.ok) {
        throw new Error(readApiError(data, "I couldn’t validate that image right now."));
      }

      const result = normalizeImageValidationResult(data.result || {});
      const hasValidationSignal = didAttemptImageValidation(result);
      const normalizedResult = hasValidationSignal
        ? result
        : normalizeImageValidationResult({
            ...result,
            guidance: ["Image uploaded. Continue to complete your profile details."],
          });
      const normalizedImageContext = buildProfileImageContext({
        sourceMethod: normalizedMethod,
        sourceImageUrl: normalizedResult.sourceImageUrl,
        imagePreviewUrl: previewUrl,
        imageValidation: normalizedResult,
      });
      setScanState((current) => ({
        ...current,
        loading: false,
        validated: true,
        result: normalizedResult,
        error: "",
      }));
      updateDraft((draft) =>
        normalizeDraftWithImageContext(draft, normalizedImageContext, {
          imageName: file.name,
        })
      );
      if (normalizedMethod === "upload") {
        console.info("[StyledGenie] MY_STYLE_UPLOAD_SUCCEEDED");
        console.info("[StyledGenie] MY_STYLE_UPLOAD_STATE_NORMALIZED");
      }
      console.info("[StyledGenie] MY_STYLE_IMAGE_VALIDATION_COMPLETED");
    } catch (error) {
      const failureMessage = String(error?.message || "I couldn’t validate that image right now.");
      const fallbackValidation = normalizeImageValidationResult({
        ok: false,
        fullBodyLikelyVisible: false,
        qualityWarnings: [failureMessage],
        guidance: ["Please review and edit every profile detail manually before saving."],
        sourceImageUrl: "",
      });
      const normalizedImageContext = buildProfileImageContext({
        sourceMethod: normalizedMethod,
        sourceImageUrl: fallbackValidation.sourceImageUrl,
        imagePreviewUrl: previewUrl,
        imageValidation: fallbackValidation,
      });
      setScanState((current) => ({
        ...current,
        loading: false,
        validated: true,
        error: failureMessage,
        result: fallbackValidation,
      }));
      updateDraft((draft) =>
        normalizeDraftWithImageContext(draft, normalizedImageContext, {
          imageName: file.name,
        })
      );
      if (normalizedMethod === "upload") {
        console.info("[StyledGenie] MY_STYLE_UPLOAD_SUCCEEDED");
        console.info("[StyledGenie] MY_STYLE_UPLOAD_STATE_NORMALIZED");
      }
      console.info("[StyledGenie] MY_STYLE_IMAGE_VALIDATION_FAILED");
    }
  }

  async function retryImageValidation() {
    if (!scanState.imageContentBase64 || !scanState.fileName) {
      return;
    }

    const pseudoFile = {
      name: scanState.fileName,
      type: scanState.imageMimeType || "image/jpeg",
      size: 0,
    };

    setScanState((current) => ({
      ...current,
      previewUrl: current.previewUrl,
    }));

    await handleSelectedImage(
      {
        ...pseudoFile,
        size: 1,
        __dataUrl: scanState.previewUrl,
      },
      scanState.method || "upload"
    );
  }

  function applyImageAnalysisSuggestions(result) {
    const normalized = normalizeImageAnalysisResult(result);
    if (!normalized.hairColor && !normalized.eyeColor) {
      return;
    }

    updateDraft((draft) => {
      const currentFeatures = draft.features || {};
      return {
        ...draft,
        features: {
          ...currentFeatures,
          hairColor: normalizeText(currentFeatures.hairColor) || normalized.hairColor || "",
          eyeColor: normalizeText(currentFeatures.eyeColor) || normalized.eyeColor || "",
        },
      };
    });
  }

  async function analyzeCurrentImage() {
    if (!flowState || !scanState.fileName || !scanState.imageContentBase64) {
      setErrorMessage("Add a full body image before running analysis.");
      return;
    }

    if (!apiBaseUrl) {
      setErrorMessage("Image analysis is unavailable right now.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setScanState((current) => ({
      ...current,
      analyzing: true,
      analysisError: "",
    }));

    try {
      const draftProfile = normalizeStyleProfile(flowState.draft);
      const { response, data } = await fetchJsonWithTimeout(
        `${apiBaseUrl}/api/profiles/analyze-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            imageName: scanState.fileName,
            imageContentBase64: scanState.imageContentBase64,
            imageMimeType: scanState.imageMimeType || "image/jpeg",
            sourceMethod: scanState.method || draftProfile.source.method || "upload",
            draftProfile,
          }),
        },
        15000
      );
      if (!response.ok) {
        throw new Error(readApiError(data, "I couldn’t analyze that image right now."));
      }

      const result = normalizeImageAnalysisResult(data.result || {});
      setScanState((current) => ({
        ...current,
        analyzing: false,
        analysisError: "",
        analysisResult: result,
      }));
      applyImageAnalysisSuggestions(result);
      setStatusMessage("Analysis suggestions are ready. Please review and edit any details before saving.");
    } catch (error) {
      const failureMessage = String(error?.message || "I couldn’t analyze that image right now.");
      setScanState((current) => ({
        ...current,
        analyzing: false,
        analysisError: failureMessage,
      }));
      setErrorMessage(failureMessage);
    }
  }

  function handleRejectedImageSelection() {
    setErrorMessage("Please choose a JPG, PNG, WEBP, or GIF image.");
    setScanState((current) => ({
      ...current,
      error: "Please choose a JPG, PNG, WEBP, or GIF image.",
      chooserVisible: true,
    }));
  }

  function handleBack() {
    if (!flowState) {
      return;
    }

    const previous =
      flowState.mode === "edit"
        ? {
            basic: null,
            features: "basic",
            vibe: "features",
            budget: "vibe",
          }[flowState.step] || null
        : getPreviousFlowStep(flowState.step, flowState.draft, flowState.mode);
    if (!previous) {
      closeFlow();
      return;
    }

    setFlowState((current) => ({
      ...current,
      step: previous,
    }));
  }

  async function handlePrimaryAction() {
    if (!flowState) {
      return;
    }
    console.info(`[StyledGenie] MY_STYLE_CONTINUE_CLICKED:${flowState.step}`);

    try {
      if (flowState.step === "budget") {
        await saveProfile();
        return;
      }

      if (flowState.step === "method" || flowState.step === "scan") {
        const normalizedDraft = normalizeStyleProfile(flowState.draft);
        let imageContext = buildProfileImageContextFromState(normalizedDraft, scanState);
        let blockedReason = getProfileImageContextBlockingReason(imageContext);

        if (
          blockedReason &&
          normalizeText(scanState.fileName) &&
          normalizeText(scanState.method || normalizedDraft.source.method)
        ) {
          imageContext = buildProfileImageContext({
            sourceMethod: normalizeText(scanState.method || normalizedDraft.source.method).toLowerCase(),
            sourceImageUrl: normalizeText(normalizedDraft.source.sourceImageUrl),
            imagePreviewUrl: normalizeText(scanState.previewUrl),
            imageValidation:
              didAttemptImageValidation(normalizedDraft.imageValidation)
                ? normalizedDraft.imageValidation
                : {
                    ok: false,
                    fullBodyLikelyVisible: false,
                    guidance: ["Image selected. Continue to complete your profile details."],
                    qualityWarnings: [],
                    sourceImageUrl: normalizeText(normalizedDraft.source.sourceImageUrl),
                  },
          });
          blockedReason = getProfileImageContextBlockingReason(imageContext);
          console.info("[StyledGenie] MY_STYLE_FORCE_METHOD_CONTINUE_WITH_FILE");
        }

        if (blockedReason) {
          console.info(`[StyledGenie] MY_STYLE_CONTINUE_BLOCKED:${blockedReason}`);
          setErrorMessage("Choose Scan Full Body or Upload Full Body Image, then add a full body image to continue.");
          return;
        }

        setErrorMessage("");
        setFlowState((current) => {
          if (!current) {
            return current;
          }
          const currentDraft = normalizeStyleProfile(current.draft);
          return {
            ...current,
            step: "basic",
            draft: normalizeDraftWithImageContext(currentDraft, imageContext),
          };
        });
        setScanState((current) => ({
          ...current,
          chooserVisible: false,
          loading: false,
          error: "",
          fallbackMessage: "",
        }));
        setStatusMessage("");
        console.info("[StyledGenie] MY_STYLE_PROFILE_COMPLETION_ENTERED");
        return;
      }

      const blockingMessage = getStepBlockingMessage(flowState.step, flowState.draft);
      if (blockingMessage) {
        const reason = normalizeText(flowState.step || "unknown_step").replace(/\s+/g, "_").toLowerCase();
        console.info(`[StyledGenie] MY_STYLE_CONTINUE_BLOCKED:${reason}`);
        setErrorMessage(blockingMessage);
        return;
      }

      const next = getNextFlowStep(flowState.step, flowState.draft, flowState.mode);
      if (!next) {
        return;
      }

      setErrorMessage("");
      setFlowState((current) => ({
        ...current,
        step: next,
      }));
      if (next === "basic") {
        console.info("[StyledGenie] MY_STYLE_PROFILE_COMPLETION_ENTERED");
      }
    } catch (error) {
      const failureReason = normalizeText(error?.message || "unknown_error") || "unknown_error";
      console.error(`[StyledGenie] MY_STYLE_PROFILE_COMPLETION_INIT_FAILED:${failureReason}`, error);
      setErrorMessage("I couldn’t open the profile details right now. Please try Continue again.");
    }
  }

  async function saveProfile() {
    if (!flowState || saving) {
      return;
    }

    const validation = validateProfileDraft(flowState.draft);
    if (!validation.isValid) {
      setErrorMessage(Object.values(validation.errors)[0]);
      return;
    }

    const draft = normalizeStyleProfile(flowState.draft);
    const postSaveDestination = resolveStyledGenieReturnDestination(flowState.returnUrl, accountProfileUrl);
    const localNextProfiles =
      flowState.mode === "edit"
        ? profiles.map((profile) => (profile.id === draft.id ? draft : profile))
        : normalizeStyleProfiles([...profiles, draft]);

    setSaving(true);
    setErrorMessage("");
    setProfiles(localNextProfiles);
    await syncBrowserProfileCache(localNextProfiles);

    const localSaveMessage = "Profile saved successfully.";
    if (!apiBaseUrl || (!customerId && !customerEmail)) {
      setFlowState(null);
      setStatusMessage(
        postSaveDestination ? "Profile saved successfully. Returning to StyledGenie…" : localSaveMessage
      );
      if (postSaveDestination) {
        navigateToStyledGenieDestination(postSaveDestination);
      }
      setSaving(false);
      return;
    }

    try {
      if (flowState.mode === "edit") {
        const updateResponse = await fetch(`${apiBaseUrl}/api/customer/style-profiles`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            buildSavePayload({
              customerId,
              customerEmail,
              accountDisplayName,
              profiles: localNextProfiles,
            })
          ),
        });
        const updateData = await updateResponse.json();
        if (!updateResponse.ok) {
          throw new Error(readApiError(updateData, "I couldn’t save that style profile right now."));
        }
        const normalizedProfiles = normalizeStyleProfiles(updateData.profiles || []);
        setProfiles(normalizedProfiles);
        await syncBrowserProfileCache(normalizedProfiles);
      } else {
        const createResponse = await fetch(`${apiBaseUrl}/api/profiles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(buildCreateProfileRequest(flowState, customerId, customerEmail, accountDisplayName)),
        });
        const createData = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(readApiError(createData, "I couldn’t save that style profile right now."));
        }

        const createdProfile = normalizeStyleProfile(createData.profile || draft);
        const normalizedProfiles = normalizeStyleProfiles([...profiles, createdProfile]);
        setProfiles(normalizedProfiles);
        await syncBrowserProfileCache(normalizedProfiles);

        if (flowState.sessionId && createdProfile.id) {
          await fetch(`${apiBaseUrl}/api/profiles/set-active`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              sessionId: flowState.sessionId,
              profileId: createdProfile.id,
              customerEmail,
              accountDisplayName,
            }),
          }).catch(() => null);
        }
      }

      setFlowState(null);
      setStatusMessage(
        postSaveDestination ? "Profile saved successfully. Returning to StyledGenie…" : "Profile saved successfully."
      );

      if (postSaveDestination) {
        navigateToStyledGenieDestination(postSaveDestination);
      }
    } catch (error) {
      setFlowState(null);
      setStatusMessage(localSaveMessage);
    } finally {
      setSaving(false);
    }
  }

  function removeProfile(profileId) {
    if (saving) {
      return;
    }

    const nextProfiles = normalizeStyleProfiles(profiles.filter((profile) => profile.id !== profileId));
    setProfiles(nextProfiles);
    void syncBrowserProfileCache(nextProfiles);

    if (!apiBaseUrl || (!customerId && !customerEmail)) {
      setStatusMessage("Profile removed on this device. I’ll sync that change when the connection is available.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    fetch(`${apiBaseUrl}/api/customer/style-profiles`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(
        buildSavePayload({
          customerId,
          customerEmail,
          accountDisplayName,
          profiles: nextProfiles,
        })
      ),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(readApiError(data, "I couldn’t remove that profile right now."));
        }
        const normalizedProfiles = normalizeStyleProfiles(data.profiles || []);
        setProfiles(normalizedProfiles);
        await syncBrowserProfileCache(normalizedProfiles);
        setStatusMessage("Profile removed.");
      })
      .catch(() => {
        setStatusMessage("Profile removed on this device. I’ll sync that change when the connection is available.");
      })
      .finally(() => {
        setSaving(false);
      });
  }

  if (!isPrimaryRenderedBlock) {
    return null;
  }

  return (
    <s-section heading="My Style">
      <s-stack direction="block" gap="small-400">
        {!flowState ? <MyStyleHero viewModel={viewModel} /> : null}

        {showStatusPanel ? (
          <s-box background="subdued" border="base" borderRadius="large" padding="base">
            <s-text>{statusMessage}</s-text>
          </s-box>
        ) : null}

        {!flowState && viewModel.error ? (
          <s-box background="subdued" border="base" borderRadius="large" padding="base">
            <s-stack direction="block" gap="small-100">
              <s-heading>Error loading My Style</s-heading>
              <s-text>{viewModel.error}</s-text>
            </s-stack>
          </s-box>
        ) : null}

        {flowState ? (
          <ProfileFlow
            flowState={flowState}
            saving={saving}
            scanState={scanState}
            cameraLaunchUrl={cameraLaunchUrl}
            uploadLaunchUrl={uploadLaunchUrl}
            errorMessage={errorMessage}
            onBack={handleBack}
            onClose={closeFlow}
            onNext={handlePrimaryAction}
            onFieldChange={setDraftField}
            onListFieldChange={setListField}
            onListToggle={toggleListValue}
            onBudgetPreset={applyBudgetPreset}
            onBudgetFieldChange={setBudgetField}
            onOpenCamera={startHostedCameraCapture}
            onOpenUpload={startHostedUploadCapture}
            onInlineFileSelect={(file, method) => void handleInlineFileSelection(file, method)}
            onInlineFileRejected={handleRejectedImageSelection}
            onRetryValidation={() => void retryImageValidation()}
            onAnalyzeImage={() => void analyzeCurrentImage()}
          />
        ) : loading ? (
          <LoadingState />
        ) : viewModel.hasProfiles ? (
          <ProfileList
            viewModel={viewModel}
            onEdit={openEditFlow}
            onCreatePrimary={openCreatePrimaryFlow}
            onAddPerson={openAddPersonFlow}
            onRemove={removeProfile}
          />
        ) : (
          <EmptyState onCreate={() => openCreatePrimaryFlow()} />
        )}
      </s-stack>
    </s-section>
  );
}

function MyStyleHero({ viewModel }) {
  return (
    <s-box background="subdued" border="base" borderRadius="large" padding="large-300">
      <s-stack direction="block" gap="small-300">
        <s-text>{viewModel.heroEyebrow}</s-text>
        <s-stack direction="block" gap="small-200">
          <s-heading>{viewModel.heroTitle}</s-heading>
          <s-text>{viewModel.heroDescription}</s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function LoadingState() {
  return (
    <s-box background="subdued" border="base" borderRadius="large" padding="large-300">
      <s-stack direction="block" gap="small-200">
        <s-heading>Loading your styling profiles…</s-heading>
        <s-text>I’m pulling in the saved profile details for you and anyone else you shop for.</s-text>
      </s-stack>
    </s-box>
  );
}

function EmptyState({ onCreate }) {
  return (
    <s-box background="base" border="base" borderRadius="large" padding="large-300">
      <s-stack direction="block" gap="small-400">
        <s-stack direction="block" gap="small-200">
          <s-heading>Create your style profile</s-heading>
          <s-text>
            Save your category preference, sizes, palette, and budget once so StyledGenie can style you more intelligently next time.
          </s-text>
        </s-stack>
        <s-box background="subdued" border="base" borderRadius="base" padding="base">
          <s-text>{IMAGE_HELPER_LINE}</s-text>
        </s-box>
        <s-button variant="primary" onClick={onCreate}>
          Create your style profile
        </s-button>
      </s-stack>
    </s-box>
  );
}

function ProfileList({ viewModel, onEdit, onCreatePrimary, onAddPerson, onRemove }) {
  return (
    <s-stack direction="block" gap="small-400">
      <s-box background="base" border="base" borderRadius="large" padding="large-300">
        <s-stack direction="block" gap="small-300">
          <s-heading>Who are you shopping for?</s-heading>
          <s-text>
            Keep one polished profile for yourself and add anyone else you shop for so StyledGenie starts from real fit and budget context.
          </s-text>
          <s-stack direction="inline" gap="small-200">
            <s-button variant="primary" onClick={onAddPerson}>
              Add person
            </s-button>
            {viewModel.primaryProfile ? (
              <s-button variant="secondary" onClick={() => onEdit(viewModel.primaryProfile)}>
                Edit primary profile
              </s-button>
            ) : (
              <s-button variant="secondary" onClick={onCreatePrimary}>
                {viewModel.primaryCtaLabel}
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-box>

      {viewModel.primaryProfile ? (
        <ProfileCard heading="Primary profile" profile={viewModel.primaryProfile} onEdit={onEdit} onRemove={null} />
      ) : (
        <s-button variant="primary" onClick={onCreatePrimary}>
          {viewModel.primaryCtaLabel}
        </s-button>
      )}

      {viewModel.additionalProfiles.length ? (
        <s-stack direction="block" gap="small-400">
          <s-heading>Additional profiles</s-heading>
          {viewModel.additionalProfiles.map((profile) => (
            <ProfileCard key={profile.id} heading="Style profile" profile={profile} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </s-stack>
      ) : null}
    </s-stack>
  );
}

function ProfileCard({ heading, profile, onEdit, onRemove }) {
  const summary = buildProfileCardSummary(profile);

  return (
    <s-box background="base" border="base" borderRadius="large" padding="large-300">
      <s-stack direction="block" gap="small-300">
        <s-stack direction="inline" gap="small-300" alignItems="center">
          <s-avatar name={summary.heading} />
          <s-stack direction="block" gap="small-100">
            <s-text>{heading}</s-text>
            <s-heading>{summary.heading}</s-heading>
            <s-text>{summary.identityLine}</s-text>
          </s-stack>
        </s-stack>

        <s-box background="subdued" border="base" borderRadius="base" padding="base">
          <s-stack direction="block" gap="small-100">
            <s-text>{summary.completionLabel}</s-text>
            <s-text>{summary.completionPercent}% complete</s-text>
          </s-stack>
        </s-box>

        <s-stack direction="block" gap="small-100">
          <s-text>Sizes: {summary.sizeSummary}</s-text>
          <s-text>Body type: {summary.bodyTypeLabel}</s-text>
          <s-text>Palette: {summary.paletteLine}</s-text>
          <s-text>Budget: {summary.budgetLine}</s-text>
        </s-stack>

        <s-box background="subdued" border="base" borderRadius="base" padding="base">
          <s-text>{summary.styleSnippet}</s-text>
        </s-box>

        {summary.tags.length ? <s-text>Style tags: {summary.tags.join(", ")}</s-text> : null}

        <s-stack direction="inline" gap="small-200">
          <s-button variant="secondary" onClick={() => onEdit(profile)}>
            Edit
          </s-button>
          {onRemove ? (
            <s-button variant="secondary" onClick={() => onRemove(profile.id)}>
              Remove
            </s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function ProfileFlow({
  flowState,
  saving,
  scanState,
  cameraLaunchUrl,
  uploadLaunchUrl,
  errorMessage,
  onBack,
  onClose,
  onNext,
  onFieldChange,
  onListFieldChange,
  onListToggle,
  onBudgetPreset,
  onBudgetFieldChange,
  onOpenCamera,
  onOpenUpload,
  onInlineFileSelect,
  onInlineFileRejected,
  onRetryValidation,
  onAnalyzeImage,
}) {
  const draft = normalizeStyleProfile(flowState.draft);
  const stepView = buildFlowStepView(flowState.step, draft, flowState.mode);
  const blockingMessage = getStepBlockingMessage(flowState.step, draft);
  const activeFlowSteps = getFlowStepsForDraft(draft);
  const visibleSteps =
    flowState.mode === "edit"
      ? activeFlowSteps.filter((step) => !["welcome", "method", "scan"].includes(step))
      : activeFlowSteps.filter((step) => !["welcome", "scan"].includes(step));
  const stepIndex = Math.max(visibleSteps.indexOf(flowState.step), 0) + 1;
  const completionPercent = deriveProfileCompletionPercent(draft);
  const selectedMethod = scanState.method || draft.source.method || "";
  const isImageIntakeStep = flowState.step === "method" || flowState.step === "scan";
  const showIntakeSupport =
    isImageIntakeStep &&
    (Boolean(selectedMethod) ||
      Boolean(scanState.previewUrl) ||
      Boolean(scanState.result) ||
      Boolean(scanState.error) ||
      Boolean(scanState.fallbackMessage) ||
      Boolean(scanState.chooserVisible));

  return (
    <s-box background="base" border="base" borderRadius="large" padding="large-300">
      <s-stack direction="block" gap="small-400">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-button variant="secondary" onClick={onBack}>
            ← Back
          </s-button>
          <s-button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </s-button>
        </s-stack>

        <s-box background="subdued" border="base" borderRadius="base" padding="base">
          <s-stack direction="block" gap="small-100">
            <s-text>Step {stepIndex} of {visibleSteps.length}</s-text>
            <s-heading>{stepView.title}</s-heading>
            {stepView.subtitle ? <s-text>{stepView.subtitle}</s-text> : null}
            <s-text>{completionPercent}% of the styling profile is ready so far.</s-text>
          </s-stack>
        </s-box>

        <s-box background="subdued" border="base" borderRadius="base" padding="base">
          <s-text>{IMAGE_HELPER_LINE}</s-text>
        </s-box>

        {errorMessage ? (
          <s-box background="subdued" border="base" borderRadius="base" padding="base">
            <s-text>Error: {errorMessage}</s-text>
          </s-box>
        ) : null}
        {!errorMessage && blockingMessage ? (
          <s-box background="subdued" border="base" borderRadius="base" padding="base">
            <s-text>{blockingMessage}</s-text>
          </s-box>
        ) : null}

        <s-stack key={`my-style-step-${flowState.step}`} direction="block" gap="small-200">
          {flowState.step === "welcome" ? (
            <s-stack direction="block" gap="small-200">
              <s-heading>Let’s create the profile StyledGenie should use.</s-heading>
              <s-text>
                Start with a full-body photo for setup support, then review and edit every detail yourself before saving.
              </s-text>
            </s-stack>
          ) : null}

          {flowState.step === "method" ? (
            <s-stack direction="block" gap="small-200">
              <s-button
                variant={selectedMethod === "camera" ? "primary" : "secondary"}
                onClick={onOpenCamera}
              >
                Scan Full Body
              </s-button>
              <s-button
                variant={selectedMethod === "upload" ? "primary" : "secondary"}
                onClick={onOpenUpload}
              >
                Upload Full Body Image
              </s-button>
            </s-stack>
          ) : null}

          {showIntakeSupport ? (
            <s-stack direction="block" gap="small-200">
              {scanState.fallbackMessage ? (
                <s-box background="subdued" border="base" borderRadius="base" padding="base">
                  <s-text>{scanState.fallbackMessage}</s-text>
                </s-box>
              ) : null}

              {scanState.previewUrl ? (
                <div style={previewFrameStyle}>
                  <img src={scanState.previewUrl} alt="Style profile preview" style={previewImageStyle} />
                </div>
              ) : selectedMethod ? (
                <s-box background="subdued" border="base" borderRadius="base" padding="base">
                  <s-text>Choose a full-body image to preview it here.</s-text>
                </s-box>
              ) : null}

              {scanState.chooserVisible ? (
                <s-drop-zone
                  key={`${selectedMethod || "upload"}-${scanState.chooserToken || 0}`}
                  accept="image/*"
                  label={
                    selectedMethod === "camera"
                      ? "Tap to take or choose a full body image"
                      : "Tap to upload a full body image"
                  }
                  accessibilityLabel={
                    selectedMethod === "camera"
                      ? "Take or choose a full body image for My Style"
                      : "Upload a full body image for My Style"
                  }
                  error={scanState.error || ""}
                  multiple={false}
                  onInput={(event) => void onInlineFileSelect(event, selectedMethod || "upload")}
                  onChange={(event) => void onInlineFileSelect(event, selectedMethod || "upload")}
                  onDroprejected={() => onInlineFileRejected()}
                />
              ) : null}

              {scanState.fileName ? <s-text>Selected image: {scanState.fileName}</s-text> : null}
              {scanState.loading ? <s-text>Checking your photo now…</s-text> : null}
              {scanState.result ? (
                <s-stack direction="block" gap="small-100">
                  {scanState.result.guidance.map((line) => (
                    <s-text key={line}>{line}</s-text>
                  ))}
                  {scanState.result.qualityWarnings.map((line) => (
                    <s-text key={line}>Warning: {line}</s-text>
                  ))}
                </s-stack>
              ) : null}
              {scanState.error ? <s-text>Error: {scanState.error}</s-text> : null}
              {scanState.analysisResult ? (
                <s-box background="subdued" border="base" borderRadius="base" padding="base">
                  <s-stack direction="block" gap="small-100">
                    <s-heading>Analysis support</s-heading>
                    {scanState.analysisResult.hairColor ? <s-text>Suggested hair color: {scanState.analysisResult.hairColor}</s-text> : null}
                    {scanState.analysisResult.eyeColor ? <s-text>Suggested eye color: {scanState.analysisResult.eyeColor}</s-text> : null}
                    {scanState.analysisResult.guidance.map((line) => (
                      <s-text key={line}>{line}</s-text>
                    ))}
                    {scanState.analysisResult.qualityWarnings.map((line) => (
                      <s-text key={line}>Warning: {line}</s-text>
                    ))}
                  </s-stack>
                </s-box>
              ) : null}
              {scanState.analysisError ? <s-text>Error: {scanState.analysisError}</s-text> : null}

              {scanState.previewUrl ? (
                <s-stack direction="inline" gap="small-200">
                  <s-button
                    variant="secondary"
                    onClick={onRetryValidation}
                    disabled={scanState.loading || scanState.analyzing}
                  >
                    Retry validation
                  </s-button>
                  <s-button
                    variant="primary"
                    onClick={onAnalyzeImage}
                    disabled={scanState.loading || scanState.analyzing || !scanState.fileName || !scanState.imageContentBase64}
                  >
                    {scanState.analyzing ? "Analyzing..." : "Analyze"}
                  </s-button>
                </s-stack>
              ) : null}
            </s-stack>
          ) : null}

          {flowState.step === "basic" ? (
            <s-stack direction="block" gap="small-200">
              {!draft.isPrimary ? (
                <s-stack direction="block" gap="small-200">
                  <s-text>Relationship</s-text>
                  <TagButtonRow
                    options={RELATIONSHIP_OPTIONS}
                    selectedValue={draft.relationship}
                    onSelect={(value) => onFieldChange(null, "relationship", value)}
                  />
                </s-stack>
              ) : null}

              <s-text-field
                label="Profile Name"
                value={draft.name}
                onChange={(value) => onFieldChange(null, "name", value)}
                onInput={(value) => onFieldChange(null, "name", value)}
              />

              <s-stack direction="block" gap="small-200">
                <s-text>Shopping Category Preference</s-text>
                <TagButtonRow
                  options={SHOPPING_CATEGORY_OPTIONS}
                  selectedValue={draft.shoppingCategoryPreference}
                  onSelect={(value) => onFieldChange(null, "shoppingCategoryPreference", value)}
                />
              </s-stack>

              <s-stack direction="block" gap="small-200">
                <s-text>Gender</s-text>
                <TagButtonRow
                  options={GENDER_OPTIONS}
                  selectedValue={draft.gender}
                  onSelect={(value) => onFieldChange(null, "gender", value)}
                />
              </s-stack>

              <s-text-field
                label="Top Size"
                value={draft.sizes.top}
                onChange={(value) => onFieldChange("sizes", "top", value)}
                onInput={(value) => onFieldChange("sizes", "top", value)}
              />
              <s-text-field
                label="Bottom Size"
                value={draft.sizes.bottom}
                onChange={(value) => onFieldChange("sizes", "bottom", value)}
                onInput={(value) => onFieldChange("sizes", "bottom", value)}
              />
              <s-text-field
                label="Shoe Size"
                value={draft.sizes.shoeEu}
                onChange={(value) => onFieldChange("sizes", "shoeEu", value)}
                onInput={(value) => onFieldChange("sizes", "shoeEu", value)}
              />
            </s-stack>
          ) : null}

          {flowState.step === "features" ? (
            <s-stack direction="block" gap="small-200">
              <s-stack direction="block" gap="small-200">
                <s-text>Body Type</s-text>
                <TagButtonRow
                  options={BODY_TYPE_OPTIONS}
                  selectedValue={draft.features.bodyType}
                  onSelect={(value) => onFieldChange("features", "bodyType", value)}
                />
              </s-stack>

              <s-stack direction="block" gap="small-200">
                <s-text>Skin Tone</s-text>
                <TagButtonRow
                  options={SKIN_TONE_OPTIONS}
                  selectedValue={draft.features.skinTone}
                  onSelect={(value) => onFieldChange("features", "skinTone", value)}
                />
              </s-stack>

              <s-text-field
                label="Hair Color"
                value={draft.features.hairColor}
                onChange={(value) => onFieldChange("features", "hairColor", value)}
                onInput={(value) => onFieldChange("features", "hairColor", value)}
              />
              <s-text-field
                label="Eye Color"
                value={draft.features.eyeColor}
                onChange={(value) => onFieldChange("features", "eyeColor", value)}
                onInput={(value) => onFieldChange("features", "eyeColor", value)}
              />
            </s-stack>
          ) : null}

          {flowState.step === "vibe" ? (
            <s-stack direction="block" gap="small-300">
              <PreferenceSection
                label="Favorite Color Palette"
                selectedValues={draft.favoriteColorPalette}
                quickValues={PALETTE_OPTIONS}
                textValue={draft.favoriteColorPalette.join(", ")}
                textLabel="Favorite Color Palette"
                onToggle={(value) => onListToggle("favoriteColorPalette", value)}
                onTextChange={(value) => onListFieldChange("favoriteColorPalette", value)}
              />

              <PreferenceSection
                label="Allergic to Any Fabric"
                selectedValues={draft.fabricAllergies}
                quickValues={FABRIC_ALLERGY_OPTIONS}
                textValue={draft.fabricAllergies.join(", ")}
                textLabel="Allergic to Any Fabric"
                onToggle={(value) => onListToggle("fabricAllergies", value)}
                onTextChange={(value) => onListFieldChange("fabricAllergies", value)}
              />

              <s-text-field
                label="Style Notes"
                value={draft.styleNotes || ""}
                onChange={(value) => onFieldChange(null, "styleNotes", value)}
                onInput={(value) => onFieldChange(null, "styleNotes", value)}
              />

              <PreferenceSection
                label="Preferred Fits"
                selectedValues={draft.preferredFits}
                quickValues={PREFERRED_FIT_OPTIONS}
                textValue={draft.preferredFits.join(", ")}
                textLabel="Preferred Fits"
                onToggle={(value) => onListToggle("preferredFits", value)}
                onTextChange={(value) => onListFieldChange("preferredFits", value)}
              />

              <PreferenceSection
                label="Favorite Occasions"
                selectedValues={draft.preferredOccasions}
                quickValues={OCCASION_OPTIONS}
                textValue={draft.preferredOccasions.join(", ")}
                textLabel="Favorite Occasions"
                onToggle={(value) => onListToggle("preferredOccasions", value)}
                onTextChange={(value) => onListFieldChange("preferredOccasions", value)}
              />

              <s-text-field
                label="Disliked Colors"
                value={draft.dislikedColors.join(", ")}
                onChange={(value) => onListFieldChange("dislikedColors", value)}
                onInput={(value) => onListFieldChange("dislikedColors", value)}
              />
              <s-text-field
                label="Disliked Fabrics"
                value={draft.dislikedFabrics.join(", ")}
                onChange={(value) => onListFieldChange("dislikedFabrics", value)}
                onInput={(value) => onListFieldChange("dislikedFabrics", value)}
              />
            </s-stack>
          ) : null}

          {flowState.step === "budget" ? (
            <s-stack direction="block" gap="small-200">
              <s-text>Budget</s-text>
              <s-stack direction="inline" gap="small-200">
                {BUDGET_OPTIONS.map((option) => (
                  <s-button
                    key={option.value}
                    variant={draft.budget === option.value ? "primary" : "secondary"}
                    onClick={() => onBudgetPreset(option)}
                  >
                    {option.label}
                  </s-button>
                ))}
              </s-stack>
              <s-text-field
                label="Minimum Budget"
                value={draft.minBudget ? String(draft.minBudget) : ""}
                onChange={(value) => onBudgetFieldChange("minBudget", value)}
                onInput={(value) => onBudgetFieldChange("minBudget", value)}
              />
              <s-text-field
                label="Maximum Budget"
                value={draft.maxBudget ? String(draft.maxBudget) : ""}
                onChange={(value) => onBudgetFieldChange("maxBudget", value)}
                onInput={(value) => onBudgetFieldChange("maxBudget", value)}
              />

              <s-box background="subdued" border="base" borderRadius="base" padding="base">
                <s-stack direction="block" gap="small-100">
                  <s-text>{draft.styleAnalysis.summary}</s-text>
                  {draft.styleAnalysis.tags.length ? <s-text>Tags: {draft.styleAnalysis.tags.join(", ")}</s-text> : null}
                </s-stack>
              </s-box>
            </s-stack>
          ) : null}
        </s-stack>

        <s-button variant="primary" disabled={saving || !stepView.canContinue} onClick={onNext}>
          {saving ? "Saving…" : stepView.primaryLabel}
        </s-button>
      </s-stack>
    </s-box>
  );
}

function TagButtonRow({ options, selectedValue, onSelect }) {
  return (
    <s-stack direction="inline" gap="small-200">
      {options.map((option) => (
        <s-button
          key={option.value}
          variant={selectedValue === option.value ? "primary" : "secondary"}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </s-button>
      ))}
    </s-stack>
  );
}

function PreferenceSection({ label, selectedValues, quickValues, textValue, textLabel, onToggle, onTextChange }) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-text>{label}</s-text>
      <s-stack direction="inline" gap="small-200">
        {quickValues.map((value) => (
          <s-button
            key={value}
            variant={selectedValues.some((item) => item.toLowerCase() === value.toLowerCase()) ? "primary" : "secondary"}
            onClick={() => onToggle(value)}
          >
            {value}
          </s-button>
        ))}
      </s-stack>
      <s-text-field label={textLabel} value={textValue} onChange={onTextChange} onInput={onTextChange} />
    </s-stack>
  );
}

function extractImageFileFromEvent(eventOrFile) {
  if (!eventOrFile) {
    return null;
  }

  if (typeof File !== "undefined" && eventOrFile instanceof File) {
    return eventOrFile;
  }

  if (Array.isArray(eventOrFile) && eventOrFile[0]) {
    return eventOrFile[0];
  }

  const files =
    eventOrFile?.detail?.files ||
    eventOrFile?.detail?.value ||
    eventOrFile?.currentTarget?.files ||
    eventOrFile?.target?.files ||
    null;

  if (Array.isArray(files) && files[0]) {
    return files[0];
  }

  if (files && typeof files.length === "number" && files.length > 0) {
    return files[0];
  }

  return null;
}

function readFileAsDataUrl(file) {
  if (file && file.__dataUrl) {
    return Promise.resolve({ dataUrl: file.__dataUrl });
  }

  if (file && typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => {
      const mimeType = normalizeText(file.type) || "image/jpeg";
      const base64Content = encodeArrayBufferToBase64(buffer);
      if (!base64Content) {
        throw new Error("I couldn’t read that image.");
      }
      return {
        dataUrl: `data:${mimeType};base64,${base64Content}`,
      };
    });
  }

  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("I couldn’t read that image in this browser."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("I couldn’t read that image."));
    reader.readAsDataURL(file);
  });
}

function encodeArrayBufferToBase64(buffer) {
  if (!buffer) {
    return "";
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  return "";
}

function normalizeImageValidationResult(result) {
  return {
    ok: Boolean(result?.ok),
    fullBodyLikelyVisible: Boolean(result?.fullBodyLikelyVisible),
    blurScore: result?.blurScore ?? null,
    qualityWarnings: normalizeCsvTags(result?.qualityWarnings || []),
    guidance: normalizeCsvTags(result?.guidance || []),
    sourceImageUrl: normalizeText(result?.sourceImageUrl),
  };
}

function normalizeImageAnalysisResult(result) {
  return {
    hairColor: normalizeText(result?.hairColor),
    eyeColor: normalizeText(result?.eyeColor),
    qualityWarnings: normalizeCsvTags(result?.qualityWarnings || []),
    guidance: normalizeCsvTags(result?.guidance || []),
    appearanceNotes: normalizeText(result?.appearanceNotes),
  };
}

function didAttemptImageValidation(imageValidation) {
  if (!imageValidation || typeof imageValidation !== "object") {
    return false;
  }

  const guidance = Array.isArray(imageValidation.guidance) ? imageValidation.guidance : [];
  const qualityWarnings = Array.isArray(imageValidation.qualityWarnings) ? imageValidation.qualityWarnings : [];
  const sourceImageUrl = normalizeText(imageValidation.sourceImageUrl);

  return Boolean(imageValidation.ok || guidance.length || qualityWarnings.length || sourceImageUrl);
}

function buildProfileImageContext({
  sourceMethod = "",
  sourceImageUrl = "",
  imagePreviewUrl = "",
  imageValidation = null,
} = {}) {
  const normalizedValidation = normalizeImageValidationResult(imageValidation || {});
  return {
    sourceMethod: normalizeText(sourceMethod).toLowerCase(),
    sourceImageUrl: normalizeText(sourceImageUrl || normalizedValidation.sourceImageUrl),
    imagePreviewUrl: normalizeText(imagePreviewUrl),
    imageValidation: normalizedValidation,
  };
}

function buildProfileImageContextFromState(draft, scanState) {
  const normalizedDraft = normalizeStyleProfile(draft);
  const draftValidation = normalizeImageValidationResult(normalizedDraft.imageValidation || {});
  const scanValidation = normalizeImageValidationResult(scanState?.result || {});
  const preferredValidation = didAttemptImageValidation(scanValidation) ? scanValidation : draftValidation;

  return buildProfileImageContext({
    sourceMethod: normalizeText(scanState?.method || normalizedDraft?.source?.method).toLowerCase(),
    sourceImageUrl: normalizeText(
      normalizedDraft?.source?.sourceImageUrl || preferredValidation.sourceImageUrl || draftValidation.sourceImageUrl
    ),
    imagePreviewUrl: normalizeText(scanState?.previewUrl),
    imageValidation: preferredValidation,
  });
}

function getProfileImageContextBlockingReason(imageContext) {
  const method = normalizeText(imageContext?.sourceMethod).toLowerCase();
  if (!method) {
    return "missing_method";
  }

  const validationAttempted = didAttemptImageValidation(imageContext?.imageValidation);
  const hasSourceUrl = Boolean(normalizeText(imageContext?.sourceImageUrl));
  const hasPreview = Boolean(normalizeText(imageContext?.imagePreviewUrl));
  if (!validationAttempted && !hasSourceUrl && !hasPreview) {
    return "missing_image_context";
  }

  return "";
}

function normalizeDraftWithImageContext(draft, imageContext, options = {}) {
  const normalizedDraft = normalizeStyleProfile(draft);
  const normalizedContext = buildProfileImageContext(imageContext);
  const imageName = normalizeText(options?.imageName || normalizedDraft?.source?.imageName);
  const validationWithSource = normalizeImageValidationResult({
    ...normalizedContext.imageValidation,
    sourceImageUrl: normalizedContext.sourceImageUrl || normalizedContext.imageValidation.sourceImageUrl,
  });

  return {
    ...normalizedDraft,
    source: {
      ...(normalizedDraft.source || {}),
      method: normalizedContext.sourceMethod || normalizedDraft.source.method || "",
      imageName,
      sourceImageUrl: normalizedContext.sourceImageUrl || normalizedDraft.source.sourceImageUrl || "",
    },
    imageValidation: validationWithSource,
  };
}

function buildCreateProfileRequest(flowState, customerId, customerEmail, accountDisplayName) {
  const draft = normalizeStyleProfile(flowState.draft);
  return {
    sessionId: flowState.sessionId || null,
    shopifyCustomerId: customerId || null,
    customerEmail: customerEmail || null,
    accountDisplayName: accountDisplayName || null,
    profileName: draft.name,
    shoppingCategoryPreference: draft.shoppingCategoryPreference,
    gender: draft.gender || null,
    bodyType: draft.features.bodyType || null,
    skinTone: draft.features.skinTone || null,
    hairColor: draft.features.hairColor || null,
    eyeColor: draft.features.eyeColor || null,
    topSize: draft.sizes.top,
    bottomSize: draft.sizes.bottom,
    shoeSize: draft.sizes.shoeEu,
    favoriteColorPalette: draft.favoriteColorPalette,
    fabricAllergies: draft.fabricAllergies,
    styleNotes: draft.styleNotes || null,
    preferredFits: draft.preferredFits,
    preferredOccasions: draft.preferredOccasions,
    dislikedColors: draft.dislikedColors,
    dislikedFabrics: draft.dislikedFabrics,
    minBudget: draft.minBudget,
    maxBudget: draft.maxBudget,
    sourceMethod: draft.source.method || null,
    sourceImageUrl: draft.source.sourceImageUrl || null,
    imageValidation: draft.imageValidation,
  };
}

function scanStateFromProfile(profile) {
  const normalized = normalizeStyleProfile(profile);
  return {
    method: normalized.source.method || "",
    loading: false,
    validated: Boolean(
      normalized.imageValidation &&
        (normalized.imageValidation.ok || normalized.imageValidation.guidance.length || normalized.imageValidation.qualityWarnings.length)
    ),
    fileName: normalized.source.imageName || "",
    previewUrl: "",
    imageMimeType: "",
    imageContentBase64: "",
    result: normalized.imageValidation,
    analyzing: false,
    analysisError: "",
    analysisResult: null,
    error: "",
    fallbackMessage: "",
    chooserVisible: false,
    chooserToken: 0,
  };
}

function createInitialScanState() {
  return {
    method: "",
    loading: false,
    validated: false,
    fileName: "",
    previewUrl: "",
    imageMimeType: "",
    imageContentBase64: "",
    result: null,
    analyzing: false,
    analysisError: "",
    analysisResult: null,
    error: "",
    fallbackMessage: "",
    chooserVisible: false,
    chooserToken: 0,
  };
}

async function readMyStyleOwnerLock() {
  try {
    if (shopify?.storage && typeof shopify.storage.read === "function") {
      const stored = await shopify.storage.read(MY_STYLE_OWNER_LOCK_KEY);
      if (stored && typeof stored === "object") {
        return stored;
      }
      if (typeof stored === "string") {
        return { ownerId: normalizeText(stored), updatedAt: 0 };
      }
    }
  } catch (_error) {
    // fall through to local storage fallback
  }

  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(MY_STYLE_OWNER_LOCK_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

async function writeMyStyleOwnerLock(payload) {
  try {
    if (shopify?.storage && typeof shopify.storage.write === "function") {
      await shopify.storage.write(MY_STYLE_OWNER_LOCK_KEY, payload);
    }
  } catch (_error) {
    // Ignore storage write failures and continue with local fallback.
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(MY_STYLE_OWNER_LOCK_KEY, JSON.stringify(payload));
    }
  } catch (_error) {
    // Ignore local storage errors.
  }
}

async function clearMyStyleOwnerLock() {
  try {
    if (shopify?.storage && typeof shopify.storage.delete === "function") {
      await shopify.storage.delete(MY_STYLE_OWNER_LOCK_KEY);
    } else if (shopify?.storage && typeof shopify.storage.write === "function") {
      await shopify.storage.write(MY_STYLE_OWNER_LOCK_KEY, null);
    }
  } catch (_error) {
    // Ignore storage delete failures and continue with local fallback.
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(MY_STYLE_OWNER_LOCK_KEY);
    }
  } catch (_error) {
    // Ignore local storage errors.
  }
}

function isOwnerLockFresh(lock, now = Date.now()) {
  const ownerId = normalizeText(lock?.ownerId || lock?.instanceId || "");
  const updatedAt = Number(lock?.updatedAt || lock?.timestamp || 0);
  return Boolean(ownerId && Number.isFinite(updatedAt) && now - updatedAt < MY_STYLE_OWNER_LOCK_TTL_MS);
}

async function claimMyStyleOwnerLock(instanceId) {
  return refreshMyStyleOwnerLock(instanceId);
}

async function refreshMyStyleOwnerLock(instanceId) {
  const now = Date.now();
  const currentLock = await readMyStyleOwnerLock();
  const currentOwnerId = normalizeText(currentLock?.ownerId || currentLock?.instanceId || "");
  const lockIsFresh = isOwnerLockFresh(currentLock, now);
  const canClaim = !lockIsFresh || currentOwnerId === instanceId;

  if (!canClaim) {
    return false;
  }

  const claimToken = `${instanceId}-${now}`;
  await writeMyStyleOwnerLock({ ownerId: instanceId, claimToken, updatedAt: now });
  const confirmedLock = await readMyStyleOwnerLock();
  const confirmedOwnerId = normalizeText(confirmedLock?.ownerId || confirmedLock?.instanceId || "");
  const confirmedToken = normalizeText(confirmedLock?.claimToken || "");
  return Boolean(confirmedOwnerId === instanceId && confirmedToken === claimToken);
}

async function releaseMyStyleOwnerLock(instanceId) {
  const currentLock = await readMyStyleOwnerLock();
  const currentOwnerId = normalizeText(currentLock?.ownerId || currentLock?.instanceId || "");
  if (!currentOwnerId || currentOwnerId !== instanceId) {
    return;
  }
  await clearMyStyleOwnerLock();
}

function normalizeApiBase(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    url.search = "";
    url.hash = "";
    const cleanedPath = url.pathname.replace(/\/merchant-dashboard(?:\/index\.html)?\/?$/i, "") || "/";
    url.pathname = cleanedPath;
    return url.toString().replace(/\/+$/, "");
  } catch (_error) {
    return "";
  }
}

function normalizeText(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    if (typeof value.target?.value === "string") {
      return value.target.value.trim();
    }
    if (typeof value.currentTarget?.value === "string") {
      return value.currentTarget.value.trim();
    }
    if (typeof value.detail?.value === "string") {
      return value.detail.value.trim();
    }
    if (typeof value.detail?.inputValue === "string") {
      return value.detail.inputValue.trim();
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeCsvTags(values) {
  const list = Array.isArray(values) ? values : String(normalizeText(values) || "").split(",");
  const seen = new Set();
  return list
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function parseBudgetInput(value) {
  const normalized = normalizeText(value).replace(/[^\d.]/g, "");
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractBase64Content(dataUrl) {
  const normalized = String(dataUrl || "");
  const separatorIndex = normalized.indexOf(",");
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
}

function readApiError(payload, fallbackMessage) {
  if (!payload || typeof payload !== "object") {
    return fallbackMessage;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail.trim();
  }
  return fallbackMessage;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;

  try {
    const response = await withTimeout(
      fetch(url, {
        ...options,
        signal: controller?.signal,
      }),
      timeoutMs,
      "The image check took too long. Please try again."
    );
    const data = await response
      .json()
      .catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (controller && typeof controller.abort === "function") {
      controller.abort();
    }
    if (error?.name === "AbortError") {
      throw new Error("The image check took too long. Please try again.");
    }
    if (normalizeText(error?.message).toLowerCase().includes("timed out")) {
      throw new Error("The image check took too long. Please try again.");
    }
    throw error;
  }
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage || "Request timed out."));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function getAuthenticatedCustomerId() {
  return normalizeText(
    shopify?.authenticatedAccount?.customer?.value?.id ||
      shopify?.authenticatedAccount?.customer?.current?.id ||
      ""
  );
}

function getAuthenticatedCustomerEmail() {
  const customer = shopify?.authenticatedAccount?.customer?.value || shopify?.authenticatedAccount?.customer?.current;
  const candidates = [
    customer?.email,
    customer?.emailAddress,
    customer?.defaultEmailAddress?.emailAddress,
    customer?.defaultEmailAddress?.email,
    customer?.contact?.email,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return candidates[0] || "";
}

function getAuthenticatedAccountName() {
  const customer = shopify?.authenticatedAccount?.customer?.value || shopify?.authenticatedAccount?.customer?.current;
  const candidates = [
    customer?.fullName,
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" "),
    customer?.displayName,
    customer?.defaultAddress?.name,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  return candidates[0] || "";
}

function normalizeCustomerCacheIdentifier(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  if (/^email:/i.test(normalized)) {
    return normalized.split(":", 2)[1].trim().toLowerCase();
  }
  if (normalized.includes("@")) {
    return normalized.toLowerCase();
  }
  const match = normalized.match(/Customer\/([^/?#]+)/i);
  return match ? match[1] : normalized;
}

function normalizeCustomerCacheEmail(value) {
  return normalizeText(value).toLowerCase();
}

function buildRouteIntentClaimToken(routeIntent) {
  if (!routeIntent?.createProfile && !routeIntent?.scanComplete) {
    return "";
  }

  const payload = {
    createProfile: Boolean(routeIntent?.createProfile),
    scanComplete: Boolean(routeIntent?.scanComplete),
    sessionId: normalizeText(routeIntent?.sessionId),
    returnUrl: normalizeText(routeIntent?.returnUrl),
    scanMethod: normalizeText(routeIntent?.scanPayload?.method || ""),
    scanImageName: normalizeText(routeIntent?.scanPayload?.imageName || ""),
  };

  try {
    return JSON.stringify(payload);
  } catch (_error) {
    return `${payload.createProfile}:${payload.scanComplete}:${payload.sessionId}:${payload.returnUrl}`;
  }
}

function readRouteIntentClaim() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MY_STYLE_ROUTE_INTENT_CLAIM_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      token: normalizeText(parsed.token),
      instanceId: normalizeText(parsed.instanceId),
      claimedAt: Number(parsed.claimedAt || 0),
    };
  } catch (_error) {
    return null;
  }
}

function claimRouteIntent(routeIntent, instanceId) {
  const token = buildRouteIntentClaimToken(routeIntent);
  if (!token || typeof window === "undefined" || !window.localStorage) {
    return true;
  }

  const now = Date.now();
  const existing = readRouteIntentClaim();
  const existingIsFresh =
    Boolean(existing?.token) &&
    Number.isFinite(existing?.claimedAt) &&
    now - Number(existing.claimedAt) < MY_STYLE_ROUTE_INTENT_CLAIM_TTL_MS;

  if (
    existingIsFresh &&
    existing.token === token &&
    existing.instanceId &&
    existing.instanceId !== normalizeText(instanceId)
  ) {
    return false;
  }

  try {
    const nextClaim = {
      token,
      instanceId: normalizeText(instanceId),
      claimedAt: now,
    };
    window.localStorage.setItem(MY_STYLE_ROUTE_INTENT_CLAIM_KEY, JSON.stringify(nextClaim));
  } catch (_error) {
    return true;
  }

  const confirmed = readRouteIntentClaim();
  return Boolean(confirmed?.token === token && confirmed?.instanceId === normalizeText(instanceId));
}

function readStyledGenieRouteIntent() {
  if (typeof window === "undefined") {
    return { createProfile: false, scanComplete: false, scanPayload: null, sessionId: "", returnUrl: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const hashParams = readStyledGenieHashParams(window.location.hash);
  [
    "styledgenie",
    "styledgenieSessionId",
    "styledgenieSource",
    "styledgenieScanPayload",
    "styledgenieReturnUrl",
  ].forEach((key) => {
    const value = hashParams.get(key);
    if (value !== null) {
      params.set(key, value);
    }
  });
  let action = normalizeText(params.get("styledgenie")).toLowerCase();
  let scanPayload = normalizeScanRoutePayload(params.get("styledgenieScanPayload"));
  let sessionId = normalizeText(params.get("styledgenieSessionId"));
  let returnUrl = getSafeReturnUrl(params.get("styledgenieReturnUrl"));

  if (!action) {
    const windowIntent = readStyledGenieWindowIntent();
    if (windowIntent) {
      action = normalizeText(windowIntent.action).toLowerCase();
      scanPayload = scanPayload || normalizeScanRoutePayload(windowIntent.scanPayload);
      sessionId = sessionId || normalizeText(windowIntent.sessionId);
      returnUrl = returnUrl || getSafeReturnUrl(windowIntent.returnUrl);
    }
  }

  return {
    createProfile: action === "create" || action === "create-profile" || action === "scan-complete",
    scanComplete: action === "scan-complete",
    scanPayload,
    sessionId,
    returnUrl,
  };
}

function clearStyledGenieRouteIntent() {
  if (typeof window === "undefined" || !window.history || !window.location) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("styledgenie");
  url.searchParams.delete("styledgenieSessionId");
  url.searchParams.delete("styledgenieSource");
  url.searchParams.delete("styledgenieScanPayload");
  url.searchParams.delete("styledgenieReturnUrl");
  const hashParams = readStyledGenieHashParams(url.hash);
  hashParams.delete("styledgenie");
  hashParams.delete("styledgenieSessionId");
  hashParams.delete("styledgenieSource");
  hashParams.delete("styledgenieScanPayload");
  hashParams.delete("styledgenieReturnUrl");
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState({}, "", url.toString());
  clearStyledGenieWindowIntent();
}

function readStyledGenieWindowIntent() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawName = normalizeText(window.name);
  const prefix = "styledgenie-intent:";
  if (!rawName || !rawName.startsWith(prefix)) {
    return null;
  }

  const encodedPayload = rawName.slice(prefix.length).trim();
  if (!encodedPayload) {
    return null;
  }

  try {
    const padded = encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
        : encodedPayload;
    const parsed = JSON.parse(decoded);
    return {
      action: normalizeText(parsed?.action),
      sessionId: normalizeText(parsed?.sessionId),
      returnUrl: normalizeText(parsed?.returnUrl),
      scanPayload: parsed?.scanPayload || null,
    };
  } catch (_error) {
    return null;
  }
}

function clearStyledGenieWindowIntent() {
  if (typeof window === "undefined") {
    return;
  }

  const rawName = normalizeText(window.name);
  if (rawName.startsWith("styledgenie-intent:")) {
    window.name = "";
  }
}

function stripStyledGenieIntentFromUrl(rawValue) {
  const safeValue = getSafeReturnUrl(rawValue);
  if (!safeValue) {
    return "";
  }

  try {
    const url = new URL(safeValue);
    const isAccountHost = /^account\./i.test(String(url.hostname || "").trim());
    [
      "styledgenie",
      "styledgenieSessionId",
      "styledgenieSource",
      "styledgenieScanPayload",
      "styledgenieReturnUrl",
    ].forEach((key) => url.searchParams.delete(key));

    const hashParams = readStyledGenieHashParams(url.hash);
    hashParams.delete("styledgenie");
    hashParams.delete("styledgenieSessionId");
    hashParams.delete("styledgenieSource");
    hashParams.delete("styledgenieScanPayload");
    hashParams.delete("styledgenieReturnUrl");
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";

    if (isAccountHost) {
      url.pathname = "/profile";
    }

    return url.toString();
  } catch (_error) {
    return safeValue;
  }
}

function buildHostedCameraCaptureUrl({ apiBaseUrl, sessionId, returnUrl, mode, customerId, customerEmail } = {}) {
  if (!apiBaseUrl) {
    return "";
  }

  try {
    const fallbackCurrentUrl =
      typeof window !== "undefined" ? stripStyledGenieIntentFromUrl(window.location?.href || "") : "";
    const fallbackReferrerUrl =
      typeof document !== "undefined" ? stripStyledGenieIntentFromUrl(document.referrer || "") : "";
    const safeReturnUrl =
      getSafeReturnUrl(returnUrl) || getSafeReturnUrl(fallbackReferrerUrl) || getSafeReturnUrl(fallbackCurrentUrl);
    const accountHostFallback =
      typeof window !== "undefined" && /^account\./i.test(String(window.location?.hostname || "").trim())
        ? String(window.location.hostname || "").trim()
        : "";
    const destination = new URL(`${apiBaseUrl}/my-style-camera/`, apiBaseUrl);
    if (safeReturnUrl) {
      destination.searchParams.set("returnUrl", safeReturnUrl);
    } else if (returnUrl) {
      console.info(`[StyledGenie] SCAN_RETURN_URL_INVALID:${String(returnUrl || "")}`);
    }
    if (accountHostFallback) {
      destination.searchParams.set("accountHost", accountHostFallback);
    }
    destination.searchParams.set("apiBase", normalizeApiBase(apiBaseUrl));
    const normalizedMode = normalizeText(mode).toLowerCase();
    if (normalizedMode === "upload" || normalizedMode === "camera") {
      destination.searchParams.set("mode", normalizedMode);
    }
    if (normalizeText(customerId)) {
      destination.searchParams.set("customerId", normalizeText(customerId));
    }
    if (normalizeText(customerEmail)) {
      destination.searchParams.set("customerEmail", normalizeText(customerEmail));
    }
    if (sessionId) {
      destination.searchParams.set("sessionId", sessionId);
    }
    return destination.toString();
  } catch (_error) {
    return "";
  }
}

function buildHostedAccountProfileUrl(primaryDomainUrl) {
  const normalized = normalizeText(primaryDomainUrl);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (/^account\./i.test(url.hostname)) {
      url.pathname = "/profile";
      url.hash = "";
      return url.toString();
    }

    if (/\.myshopify\.com$/i.test(url.hostname)) {
      url.pathname = "/account/profile";
      url.search = "";
      url.hash = "";
      return url.toString();
    }

    const rootHost = url.hostname.replace(/^www\./i, "");
    url.hostname = `account.${rootHost}`;
    url.pathname = "/profile";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function buildStyledGenieStorefrontResumeUrl(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (/^account\./i.test(url.hostname)) {
      const storefrontHost = url.hostname.replace(/^account\./i, "");
      url.hostname =
        /^www\./i.test(storefrontHost) || /\.myshopify\.com$/i.test(storefrontHost)
          ? storefrontHost
          : `www.${storefrontHost}`;
    }
    url.pathname = "/";
    url.hash = "";
    url.searchParams.set("styledgenie", "open");
    url.searchParams.set("styledgenieResume", "services");
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function resolveStyledGenieReturnDestination(returnUrl, accountProfileUrl) {
  const explicitReturnUrl = getSafeReturnUrl(returnUrl);
  if (explicitReturnUrl) {
    return explicitReturnUrl;
  }

  const profilePageFallback =
    getSafeReturnUrl(accountProfileUrl) ||
    getSafeReturnUrl(typeof window !== "undefined" ? window.location?.href : "");

  return buildStyledGenieStorefrontResumeUrl(profilePageFallback);
}

function navigateToStyledGenieDestination(destination) {
  const normalized = normalizeText(destination);
  if (!normalized) {
    return;
  }

  try {
    if (shopify?.navigation?.navigate) {
      shopify.navigation.navigate(normalized);
      return;
    }
  } catch (_error) {
    // Fall back to window navigation below.
  }

  if (typeof window !== "undefined" && window.location) {
    window.location.assign(normalized);
  }
}

function getSafeReturnUrl(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch (_error) {
    if (normalized.startsWith("/")) {
      return normalized;
    }
    return "";
  }
}

function readStyledGenieHashParams(rawHash) {
  const normalized = normalizeText(rawHash);
  if (!normalized) {
    return new URLSearchParams();
  }

  return new URLSearchParams(normalized.replace(/^#/, ""));
}

function normalizeScanRoutePayload(value) {
  if (value && typeof value === "object") {
    return {
      method: normalizeText(value?.method || "camera").toLowerCase() || "camera",
      imageName: normalizeText(value?.imageName),
      imageValidation: normalizeImageValidationResult(value?.imageValidation || {}),
      analysisResult: normalizeImageAnalysisResult(value?.analysisResult || {}),
    };
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  try {
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
        : normalized;
    const parsed = JSON.parse(decoded);
    return {
      method: normalizeText(parsed?.method || "camera").toLowerCase() || "camera",
      imageName: normalizeText(parsed?.imageName),
      imageValidation: normalizeImageValidationResult(parsed?.imageValidation || {}),
      analysisResult: normalizeImageAnalysisResult(parsed?.analysisResult || {}),
    };
  } catch (_error) {
    return null;
  }
}

const previewFrameStyle = {
  borderRadius: "20px",
  overflow: "hidden",
  border: "1px solid rgba(16, 24, 40, 0.12)",
  background: "#f4f1ea",
};

const previewImageStyle = {
  display: "block",
  width: "100%",
  height: "auto",
  objectFit: "cover",
};
