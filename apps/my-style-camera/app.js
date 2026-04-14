(function () {
  const params = new URLSearchParams(window.location.search || "");
  const launchMode = normalizeLaunchMode(params.get("mode"));
  const isUploadLaunch = launchMode === "upload";
  const apiBase = normalizeApiBase(params.get("apiBase") || window.location.origin);
  const safeReturnUrl = sanitizeAccountProfileReturnUrl(params.get("returnUrl"));
  const sessionId = params.get("sessionId") || "";
  const customerId = String(params.get("customerId") || "").trim();
  const customerEmail = String(params.get("customerEmail") || "").trim();
  const accountHost = String(params.get("accountHost") || "").trim();

  const titleNode = document.getElementById("scan-title");
  const copyNode = document.getElementById("scan-copy");
  const statusNode = document.getElementById("scan-status");
  const diagnosticsNode = document.getElementById("scan-diagnostics");
  const guidanceNode = document.getElementById("scan-guidance");
  const analysisNode = document.getElementById("scan-analysis");
  const videoNode = document.getElementById("scan-video");
  const previewNode = document.getElementById("scan-preview");
  const canvasNode = document.getElementById("scan-canvas");
  const captureButton = document.getElementById("capture-button");
  const retakeButton = document.getElementById("retake-button");
  const analyzeButton = document.getElementById("analyze-button");
  const continueButton = document.getElementById("continue-button");
  const fallbackButton = document.getElementById("fallback-button");
  const cancelButton = document.getElementById("cancel-button");
  const fallbackInput = document.getElementById("fallback-input");

  const state = {
    cameraState: "idle",
    mediaStream: null,
    capturedFile: null,
    capturedPreviewUrl: "",
    imageValidation: null,
    analyzeResult: null,
    isAnalyzing: false,
    continueEnabled: false,
    error: "",
    usingFallbackInput: false,
    returnUrl: safeReturnUrl || "",
    sourceMethod: isUploadLaunch ? "upload" : "camera",
  };

  function logEvent(name, detail) {
    if (detail) {
      console.info(`[StyledGenie][MyStyleCamera] ${name}`, detail);
      return;
    }
    console.info(`[StyledGenie][MyStyleCamera] ${name}`);
  }

  function normalizeApiBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function normalizeLaunchMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "upload" ? "upload" : "camera";
  }

  function isCustomerAccountHost(url) {
    return Boolean(url && /^account\./i.test(String(url.hostname || "").trim()));
  }

  function applyStyledGenieIntentParams(url, intentParams) {
    if (!url || !(url instanceof URL)) {
      return url;
    }

    const params = intentParams instanceof URLSearchParams ? intentParams : new URLSearchParams(intentParams || "");
    const intentKeys = [
      "styledgenie",
      "styledgenieSessionId",
      "styledgenieSource",
      "styledgenieReturnUrl",
      "styledgenieScanPayload",
    ];

    if (isCustomerAccountHost(url)) {
      intentKeys.forEach((key) => url.searchParams.delete(key));
      url.hash = params.toString() ? `#${params.toString()}` : "";
      return url;
    }

    intentKeys.forEach((key) => {
      url.searchParams.delete(key);
    });
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    return url;
  }

  function getCameraDiagnostics() {
    return {
      secureContext: Boolean(window.isSecureContext),
      hasMediaDevices: Boolean(navigator.mediaDevices),
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      topLevel: window.top === window.self,
    };
  }

  function setError(message) {
    state.error = message ? String(message) : "";
    showStatus(state.error, state.error ? "error" : "");
    renderDiagnostics({ visible: Boolean(state.error) });
  }

  function showStatus(message, tone) {
    statusNode.textContent = message || "";
    statusNode.classList.toggle("hidden", !message);
    statusNode.classList.toggle("success", tone === "success");
    statusNode.classList.toggle("error", tone === "error");
  }

  if (!safeReturnUrl) {
    logEvent(`SCAN_RETURN_URL_INVALID:${String(params.get("returnUrl") || "")}`);
  }

  async function resolveReturnUrl() {
    if (state.returnUrl) {
      return state.returnUrl;
    }

    const referrerReturnUrl = sanitizeAccountProfileReturnUrl(document.referrer || "");
    if (referrerReturnUrl) {
      try {
        const referrerUrl = new URL(referrerReturnUrl, window.location.origin);
        if (isCustomerAccountHost(referrerUrl)) {
          state.returnUrl = referrerReturnUrl;
          return state.returnUrl;
        }
      } catch (_error) {
        // Fall through to API lookup.
      }
    }

    if (!apiBase) {
      state.returnUrl = buildAccountHostFallbackUrl() || "/account/profile";
      return state.returnUrl;
    }

    try {
      const response = await fetch(`${apiBase}/api/customer/account-profile-url`, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.profileUrl) {
        state.returnUrl = sanitizeAccountProfileReturnUrl(payload.profileUrl) || "/account/profile";
        return state.returnUrl;
      }
    } catch (_error) {
      logEvent("SCAN_RETURN_URL_FETCH_FAILED");
    }

    state.returnUrl = buildAccountHostFallbackUrl() || "/account/profile";
    return state.returnUrl;
  }

  function renderDiagnostics(options) {
    if (!diagnosticsNode) {
      return;
    }

    const diagnostics = getCameraDiagnostics();
    const forceVisible = Boolean(options?.visible);

    diagnosticsNode.innerHTML = [
      "<p><strong>Camera diagnostics</strong></p>",
      `<p>Secure context: <strong>${diagnostics.secureContext ? "Yes" : "No"}</strong></p>`,
      `<p>Media devices available: <strong>${diagnostics.hasMediaDevices ? "Yes" : "No"}</strong></p>`,
      `<p>getUserMedia available: <strong>${diagnostics.hasGetUserMedia ? "Yes" : "No"}</strong></p>`,
      `<p>Top-level page: <strong>${diagnostics.topLevel ? "Yes" : "No"}</strong></p>`,
    ].join("");

    diagnosticsNode.classList.toggle("hidden", !forceVisible);
  }

  function showGuidance(result) {
    const lines = [];
    (result?.guidance || []).forEach((line) => lines.push({ label: line, tone: "guidance" }));
    (result?.qualityWarnings || []).forEach((line) => lines.push({ label: line, tone: "warning" }));

    if (!lines.length) {
      guidanceNode.innerHTML = "";
      guidanceNode.classList.add("hidden");
      return;
    }

    guidanceNode.innerHTML = lines
      .map((line) => `<p>${line.tone === "warning" ? "Warning: " : ""}${escapeHtml(line.label)}</p>`)
      .join("");
    guidanceNode.classList.remove("hidden");
  }

  function showAnalysis(result) {
    if (!analysisNode) {
      return;
    }

    const lines = [];
    if (result?.hairColor) {
      lines.push(`Suggested hair color: ${escapeHtml(result.hairColor)}`);
    }
    if (result?.eyeColor) {
      lines.push(`Suggested eye color: ${escapeHtml(result.eyeColor)}`);
    }
    (result?.guidance || []).forEach((line) => {
      lines.push(escapeHtml(line));
    });
    (result?.qualityWarnings || []).forEach((line) => {
      lines.push(`Warning: ${escapeHtml(line)}`);
    });

    if (!lines.length) {
      analysisNode.innerHTML = "";
      analysisNode.classList.add("hidden");
      return;
    }

    analysisNode.innerHTML = ["<p><strong>Analysis support</strong></p>", ...lines.map((line) => `<p>${line}</p>`)].join("");
    analysisNode.classList.remove("hidden");
  }

  function setCameraState(nextState) {
    state.cameraState = nextState;
    const isLivePreview = nextState === "live_preview";
    const hasCapturedPreview = nextState === "captured" || nextState === "uploading_capture" || state.continueEnabled;

    captureButton.classList.toggle("hidden", !isLivePreview);
    captureButton.disabled = nextState === "uploading_capture";
    retakeButton.classList.toggle("hidden", !hasCapturedPreview);
    retakeButton.disabled = nextState === "uploading_capture" || state.isAnalyzing;
    analyzeButton.classList.toggle("hidden", !hasCapturedPreview);
    analyzeButton.disabled = nextState === "uploading_capture" || state.isAnalyzing || !state.capturedFile;
    continueButton.classList.toggle("hidden", !state.continueEnabled);
    continueButton.disabled = !state.continueEnabled;
  }

  function clearPreviewUrl() {
    if (state.capturedPreviewUrl) {
      URL.revokeObjectURL(state.capturedPreviewUrl);
      state.capturedPreviewUrl = "";
    }
  }

  function stopCamera(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function cleanupCameraStream() {
    if (state.mediaStream) {
      stopCamera(state.mediaStream);
      state.mediaStream = null;
    }
    if (videoNode) {
      videoNode.pause();
      videoNode.srcObject = null;
      videoNode.onloadedmetadata = null;
    }
  }

  function resetPreviewSurface() {
    previewNode.removeAttribute("src");
    previewNode.classList.add("hidden");
    videoNode.classList.remove("hidden");
  }

  function resetForRetake() {
    state.imageValidation = null;
    state.analyzeResult = null;
    state.isAnalyzing = false;
    state.continueEnabled = false;
    state.error = "";
    state.capturedFile = null;
    clearPreviewUrl();
    showGuidance(null);
    showAnalysis(null);
    setError("");
    resetPreviewSurface();
    setCameraState("idle");
    state.sourceMethod = isUploadLaunch ? "upload" : "camera";
  }

  async function openCamera() {
    const diagnostics = getCameraDiagnostics();
    logEvent("CAMERA_PERMISSION_REQUESTED");
    logEvent("CAMERA_RUNTIME_DIAGNOSTICS", diagnostics);
    renderDiagnostics({ visible: true });

    if (typeof window === "undefined") {
      return false;
    }

    if (!window.isSecureContext || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      logEvent("CAMERA_STREAM_FAILED:UNAVAILABLE");
      setError("Camera is unavailable in this browser or context. Please use Upload Full Body Image instead.");
      fallbackButton.classList.remove("hidden");
      return false;
    }

    if (window.top !== window.self) {
      logEvent("CAMERA_FLOW_ERROR:IFRAME_CONTEXT");
    }

    const preferredConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1080 },
        height: { ideal: 1440 },
      },
    };

    try {
      state.mediaStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (error) {
      if (error && (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError")) {
        try {
          state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (fallbackError) {
          return handleCameraError(fallbackError);
        }
      } else {
        return handleCameraError(error);
      }
    }

    logEvent("CAMERA_PERMISSION_GRANTED");
    logEvent("CAMERA_STREAM_STARTED");
    return true;
  }

  function handleCameraError(error) {
    const errorName = error?.name || "UnknownError";
    logEvent(`CAMERA_STREAM_FAILED:${errorName}`);

    let message = "Camera is unavailable in this browser or context. Please use Upload Full Body Image instead.";
    if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
      logEvent("CAMERA_PERMISSION_DENIED");
      message = "Camera access was denied. Please allow camera access or upload a full body image instead.";
    } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
      message = "No camera was found on this device. Please upload a full body image instead.";
    } else {
      message = `Camera failed to open: ${errorName}`;
    }

    setError(message);
    fallbackButton.classList.remove("hidden");
    setCameraState("error");
    return false;
  }

  async function bindLivePreview() {
    if (!videoNode || !state.mediaStream) {
      return false;
    }

    try {
      videoNode.autoplay = true;
      videoNode.muted = true;
      videoNode.playsInline = true;
      videoNode.setAttribute("playsinline", "");
      videoNode.srcObject = state.mediaStream;
      await new Promise((resolve) => {
        if (videoNode.readyState >= 1) {
          resolve();
          return;
        }
        videoNode.onloadedmetadata = () => {
          videoNode.onloadedmetadata = null;
          resolve();
        };
      });
      await videoNode.play();
      setCameraState("live_preview");
      return true;
    } catch (error) {
      logEvent("CAMERA_STREAM_FAILED:PREVIEW_PLAYBACK", error?.message || "");
      cleanupCameraStream();
      setError("Camera is unavailable in this browser or context. Please use Upload Full Body Image instead.");
      fallbackButton.classList.remove("hidden");
      setCameraState("error");
      return false;
    }
  }

  async function openCameraFlow() {
    logEvent("CAMERA_FLOW_OPENED");
    state.sourceMethod = "camera";
    resetForRetake();
    fallbackButton.classList.add("hidden");
    setCameraState("requesting_permission");

    const granted = await openCamera();
    if (!granted) {
      return;
    }

    await bindLivePreview();
  }

  function captureStillFrame() {
    if (!videoNode || !canvasNode) {
      return;
    }
    if (!videoNode.videoWidth || !videoNode.videoHeight) {
      setError("We couldn’t read the live camera preview. Please retake it or upload a full body image.");
      return;
    }

    canvasNode.width = videoNode.videoWidth;
    canvasNode.height = videoNode.videoHeight;
    const context = canvasNode.getContext("2d");
    if (!context) {
      setError("We couldn’t process that photo. Please retake it or upload a full body image.");
      return;
    }

    context.drawImage(videoNode, 0, 0, canvasNode.width, canvasNode.height);
    canvasNode.toBlob(async (blob) => {
      if (!blob) {
        setError("We couldn’t process that photo. Please retake it or upload a full body image.");
        return;
      }

      logEvent("CAMERA_CAPTURED");
      cleanupCameraStream();
      state.sourceMethod = "camera";

      clearPreviewUrl();
      state.capturedPreviewUrl = URL.createObjectURL(blob);
      state.capturedFile = new File([blob], `styledgenie-full-body-${Date.now()}.jpg`, { type: "image/jpeg" });
      previewNode.src = state.capturedPreviewUrl;
      previewNode.classList.remove("hidden");
      videoNode.classList.add("hidden");
      setCameraState("captured");

      await uploadCapturedImage();
    }, "image/jpeg", 0.92);
  }

  async function uploadCapturedImage() {
    if (!state.capturedFile) {
      return;
    }

    setCameraState("uploading_capture");
    showStatus("Checking your full body image now…", "");
    logEvent("CAMERA_CAPTURE_UPLOAD_STARTED");

    try {
      const encoded = await readFileAsDataUrl(state.capturedFile);
      const response = await fetch(`${apiBase}/api/profiles/validate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          imageName: state.capturedFile.name,
          imageContentBase64: extractBase64Content(encoded),
          imageMimeType: state.capturedFile.type || "image/jpeg",
          sourceMethod: state.sourceMethod || "camera",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiError(payload, "We couldn’t process that photo. Please retake it or upload a full body image."));
      }

      state.imageValidation = payload.result || null;
      state.continueEnabled = Boolean(payload.result?.ok && payload.result?.fullBodyLikelyVisible);
      showGuidance(payload.result || null);
      if (!state.continueEnabled) {
        throw new Error("We couldn’t process that photo. Please retake it or upload a full body image.");
      }

      logEvent("CAMERA_CAPTURE_UPLOAD_SUCCEEDED");
      setError("");
      showStatus("Full body detected. Continue to finish your profile.", "success");
      setCameraState("captured");
    } catch (error) {
      logEvent("CAMERA_CAPTURE_UPLOAD_FAILED", error?.message || "");
      state.imageValidation = null;
      state.continueEnabled = false;
      setError("We couldn’t process that photo. Please retake it or upload a full body image.");
      setCameraState("error");
      fallbackButton.classList.remove("hidden");
    }
  }

  async function analyzeCapturedImage() {
    if (!state.capturedFile || state.isAnalyzing) {
      return;
    }

    state.isAnalyzing = true;
    setCameraState(state.cameraState || "captured");
    showStatus("Analyzing your image now…", "");
    logEvent("CAMERA_CAPTURE_ANALYZE_STARTED");

    try {
      const encoded = await readFileAsDataUrl(state.capturedFile);
      const response = await fetch(`${apiBase}/api/profiles/analyze-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          imageName: state.capturedFile.name,
          imageContentBase64: extractBase64Content(encoded),
          imageMimeType: state.capturedFile.type || "image/jpeg",
          sourceMethod: state.sourceMethod || "camera",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiError(payload, "We couldn’t analyze that photo. Please retake it or upload a full body image."));
      }

      state.analyzeResult = payload.result || null;
      showAnalysis(state.analyzeResult);
      showStatus("Analysis complete. Please review and edit any details before saving.", "success");
      logEvent("CAMERA_CAPTURE_ANALYZE_SUCCEEDED");
    } catch (error) {
      state.analyzeResult = null;
      logEvent("CAMERA_CAPTURE_ANALYZE_FAILED", error?.message || "");
      setError("We couldn’t analyze that photo. Please retake it or upload a full body image.");
    } finally {
      state.isAnalyzing = false;
      setCameraState(state.cameraState || "captured");
    }
  }

  function buildReturnUrlWithScanPayload() {
    const normalizedReturnUrl = sanitizeAccountProfileReturnUrl(state.returnUrl || "") || state.returnUrl || "/account/profile";
    const url = new URL(normalizedReturnUrl, window.location.origin);
    const intentParams = new URLSearchParams();
    intentParams.set("styledgenie", "scan-complete");
    if (sessionId) {
      intentParams.set("styledgenieSessionId", sessionId);
    }
    intentParams.set(
      "styledgenieScanPayload",
      encodePayload({
        method: state.sourceMethod || "camera",
        imageName: state.capturedFile?.name || "",
        imageValidation: state.imageValidation || {},
        analysisResult: state.analyzeResult || {},
      })
    );
    applyStyledGenieIntentParams(url, intentParams);
    return url.toString();
  }

  async function persistScanHandoff() {
    if (!apiBase || !state.imageValidation) {
      return false;
    }

    if (!customerId && !customerEmail && !sessionId) {
      return false;
    }

    try {
      const response = await fetch(`${apiBase}/api/profiles/scan-handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          customerId: customerId || null,
          customerEmail: customerEmail || null,
          sessionId: sessionId || null,
          scanPayload: {
            method: state.sourceMethod || "camera",
            imageName: state.capturedFile?.name || "",
            imageValidation: state.imageValidation || {},
            analysisResult: state.analyzeResult || {},
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readApiError(payload, "Unable to save scan handoff."));
      }

      return true;
    } catch (error) {
      logEvent("SCAN_HANDOFF_STORE_FAILED", error?.message || "");
      return false;
    }
  }

  async function continueToProfileForm() {
    if (!state.continueEnabled || !state.imageValidation) {
      return;
    }

    logEvent("CAMERA_CONTINUE_CLICKED");
    await resolveReturnUrl();
    const handoffStored = await persistScanHandoff();
    const baseReturnUrl = sanitizeAccountProfileReturnUrl(state.returnUrl || "") || state.returnUrl || "/account/profile";
    const payloadReturnUrl = buildReturnUrlWithScanPayload();
    persistWindowScanIntent();

    if (payloadReturnUrl) {
      logEvent("SCAN_CONTINUE_REDIRECT_WITH_PAYLOAD", { handoffStored, destination: payloadReturnUrl });
      window.location.assign(payloadReturnUrl);
      return;
    }

    try {
      const destination = new URL(baseReturnUrl, window.location.origin);
      if (sessionId && !isCustomerAccountHost(destination)) {
        const intentParams = new URLSearchParams();
        intentParams.set("styledgenie", "scan-complete");
        intentParams.set("styledgenieSessionId", sessionId);
        applyStyledGenieIntentParams(destination, intentParams);
      }
      logEvent("SCAN_CONTINUE_REDIRECT", { handoffStored, destination: destination.toString() });
      window.location.assign(destination.toString());
      return;
    } catch (_error) {
      // Fall through to compatibility fallback below.
    }

    window.location.assign(baseReturnUrl);
  }

  async function cancelAndReturn() {
    cleanupCameraStream();
    clearPreviewUrl();
    await resolveReturnUrl();
    window.location.assign(state.returnUrl || "/account/profile");
  }

  function openFallbackFileInput() {
    logEvent("CAMERA_FALLBACK_FILE_INPUT_USED");
    state.usingFallbackInput = true;
    fallbackInput.click();
  }

  function handleFallbackSelection(event) {
    const file = event?.target?.files?.[0] || null;
    if (!file) {
      return;
    }

    resetForRetake();
    cleanupCameraStream();
    state.sourceMethod = "upload";
    state.capturedFile = file;
    clearPreviewUrl();
    state.capturedPreviewUrl = URL.createObjectURL(file);
    previewNode.src = state.capturedPreviewUrl;
    previewNode.classList.remove("hidden");
    videoNode.classList.add("hidden");
    setCameraState("captured");
    void uploadCapturedImage();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("We couldn’t process that photo. Please retake it or upload a full body image."));
      reader.readAsDataURL(file);
    });
  }

  function extractBase64Content(dataUrl) {
    const separatorIndex = String(dataUrl || "").indexOf(",");
    return separatorIndex >= 0 ? String(dataUrl).slice(separatorIndex + 1) : String(dataUrl || "");
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

  function encodePayload(payload) {
    return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function persistWindowScanIntent() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const intentPayload = {
        action: "scan-complete",
        sessionId: sessionId || "",
        scanPayload: {
          method: state.sourceMethod || "camera",
          imageName: state.capturedFile?.name || "",
          imageValidation: state.imageValidation || {},
          analysisResult: state.analyzeResult || {},
        },
        createdAt: Date.now(),
      };
      window.name = `styledgenie-intent:${encodePayload(intentPayload)}`;
      logEvent("SCAN_WINDOW_INTENT_STORED");
    } catch (_error) {
      logEvent("SCAN_WINDOW_INTENT_STORE_FAILED");
    }
  }

  function getSafeReturnUrl(rawValue) {
    const normalized = String(rawValue || "").trim();
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

  function sanitizeAccountProfileReturnUrl(rawValue) {
    const safeValue = getSafeReturnUrl(rawValue);
    if (!safeValue) {
      return "";
    }

    try {
      const url = new URL(safeValue, window.location.origin);

      [
        "styledgenie",
        "styledgenieSessionId",
        "styledgenieSource",
        "styledgenieReturnUrl",
        "styledgenieScanPayload",
      ].forEach((key) => url.searchParams.delete(key));

      if (isCustomerAccountHost(url)) {
        url.pathname = "/profile";
      }

      url.hash = "";
      return url.toString();
    } catch (_error) {
      return safeValue;
    }
  }

  function buildAccountHostFallbackUrl() {
    if (!/^account\./i.test(accountHost)) {
      return "";
    }

    try {
      return new URL("/profile", `https://${accountHost}`).toString();
    } catch (_error) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  captureButton.addEventListener("click", captureStillFrame);
  retakeButton.addEventListener("click", () => {
    void openCameraFlow();
  });
  continueButton.addEventListener("click", () => {
    void continueToProfileForm();
  });
  fallbackButton.addEventListener("click", openFallbackFileInput);
  analyzeButton.addEventListener("click", () => {
    void analyzeCapturedImage();
  });
  cancelButton.addEventListener("click", () => {
    void cancelAndReturn();
  });
  fallbackInput.addEventListener("change", handleFallbackSelection);

  window.addEventListener("pagehide", cleanupCameraStream);
  window.addEventListener("beforeunload", cleanupCameraStream);

  if (isUploadLaunch) {
    if (titleNode) {
      titleNode.textContent = "Upload Full Body Image";
    }
    if (copyNode) {
      copyNode.textContent =
        "Choose a solo full-body image, then we’ll check the photo quality before you finish your profile.";
    }
    fallbackButton.textContent = "Upload Full Body Image";
    fallbackButton.classList.remove("hidden");
    captureButton.classList.add("hidden");
    showStatus("Upload a full body image to continue.", "");
    renderDiagnostics({ visible: false });
    void resolveReturnUrl();
    return;
  }

  renderDiagnostics({ visible: false });
  void resolveReturnUrl();
  void openCameraFlow();
})();
