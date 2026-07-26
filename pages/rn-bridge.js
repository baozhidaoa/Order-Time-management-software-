(() => {
  try {
    if (
      (!window.__CONTROLER_RN_META__ ||
        typeof window.__CONTROLER_RN_META__ !== "object") &&
      typeof window.ReactNativeWebView?.getRuntimeMeta === "function"
    ) {
      const runtimeMeta = JSON.parse(window.ReactNativeWebView.getRuntimeMeta());
      if (runtimeMeta && typeof runtimeMeta === "object") {
        window.__CONTROLER_RN_META__ = runtimeMeta;
        window.__CONTROLER_RN_SESSION_ID__ = `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      }
    }
  } catch (_error) {}

  const BRIDGE_EVENT_NAME = "controler:native-bridge-event";
  const LANGUAGE_EVENT_NAME = "controler:language-changed";
  const LANGUAGE_STORAGE_KEY = "appLanguage";
  const DEFAULT_UI_LANGUAGE = "zh-CN";
  const DEFAULT_MESSAGE_TIMEOUT_MS = 15000;
  const AUTO_BACKUP_MESSAGE_TIMEOUT_MS = 60000;
  const INTERACTIVE_MESSAGE_TIMEOUT_MS = 180000;
  const HEAVY_IMPORT_MESSAGE_TIMEOUT_MS = 600000;
  const pendingRequests = new Map();
  let requestCounter = 0;

  const PAGE_SESSION_ID =
    typeof window.__CONTROLER_RN_SESSION_ID__ === "string" &&
    window.__CONTROLER_RN_SESSION_ID__.trim()
      ? window.__CONTROLER_RN_SESSION_ID__.trim()
      : `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let NAVIGATION_GENERATION = Math.max(
    0,
    Number(getRuntimeMeta().navigationGeneration) || 0,
  );
  const REQUIRES_PAGE_SESSION_ENVELOPE = getNativeHostPlatform() === "android";
  window.__CONTROLER_RN_SESSION_ID__ = PAGE_SESSION_ID;

  const MESSAGE_TIMEOUT_OVERRIDES = {
    "storage.selectFile": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.selectDirectory": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.pickImportSourceFile": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.pickDiaryImages": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.saveDiaryImageAsset": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.inspectImportSourceFile": HEAVY_IMPORT_MESSAGE_TIMEOUT_MS,
    "storage.previewExternalImport": HEAVY_IMPORT_MESSAGE_TIMEOUT_MS,
    "storage.importSource": HEAVY_IMPORT_MESSAGE_TIMEOUT_MS,
    "storage.getAutoBackupStatus": AUTO_BACKUP_MESSAGE_TIMEOUT_MS,
    "storage.updateAutoBackupSettings": AUTO_BACKUP_MESSAGE_TIMEOUT_MS,
    "storage.runAutoBackupNow": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.shareLatestBackup": AUTO_BACKUP_MESSAGE_TIMEOUT_MS,
    "settings.exportData": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "notifications.requestPermission": INTERACTIVE_MESSAGE_TIMEOUT_MS,
  };

  function getRuntimeMeta() {
    const runtimeMeta = window.__CONTROLER_RN_META__;
    return runtimeMeta && typeof runtimeMeta === "object" ? runtimeMeta : {};
  }

  function getNativeHostPlatform() {
    const meta = getRuntimeMeta();
    const platform = typeof meta.platform === "string" ? meta.platform : "web";
    return platform === "android" || platform === "ios" ? platform : "web";
  }

  function resolveCurrentPageKey() {
    try {
      const pathSegments = String(window.location.pathname || "").split("/");
      const tail = String(pathSegments[pathSegments.length - 1] || "").trim();
      return tail.replace(/\.html$/i, "") || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  function shouldTrackBridgePerf(method) {
    return (
      (window.__CONTROLER_PERF_DEBUG__ === true ||
        getRuntimeMeta().performanceTracing === true) &&
      String(method || "").trim().startsWith("storage.")
    );
  }

  function emitBridgePerfMetric(method, durationMs, detail = {}) {
    if (!shouldTrackBridgePerf(method)) {
      return;
    }
    emitEvent("perf.metric", {
      stage: "native-bridge-call",
      bridgeMethod: String(method || "").trim(),
      page: resolveCurrentPageKey(),
      durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
      ...normalizePayload(detail),
    });
  }

  function resolveMessageTimeout(method) {
    const normalizedMethod = String(method || "").trim();
    return (
      MESSAGE_TIMEOUT_OVERRIDES[normalizedMethod] || DEFAULT_MESSAGE_TIMEOUT_MS
    );
  }

  function getNativeWebView() {
    return window.ReactNativeWebView || null;
  }

  function isReactNativeApp() {
    const nativeWebView = getNativeWebView();
    return !!nativeWebView && typeof nativeWebView.postMessage === "function";
  }

  function normalizePayload(payload) {
    if (!payload || typeof payload !== "object") {
      return {};
    }
    return payload;
  }

  function postMessage(type, payload = {}) {
    const nativeWebView = getNativeWebView();
    if (!nativeWebView || typeof nativeWebView.postMessage !== "function") {
      return false;
    }
    nativeWebView.postMessage(
      JSON.stringify({
        type,
        pageSessionId: PAGE_SESSION_ID,
        navigationGeneration: NAVIGATION_GENERATION,
        payload: normalizePayload(payload),
      }),
    );
    return true;
  }

  postMessage("bridge-session", {});

  function rebindSession(nextGeneration) {
    if (!REQUIRES_PAGE_SESSION_ENVELOPE) {
      return false;
    }
    const normalizedGeneration = Math.max(0, Number(nextGeneration) || 0);
    if (!normalizedGeneration) {
      return false;
    }
    NAVIGATION_GENERATION = normalizedGeneration;
    if (
      window.__CONTROLER_RN_META__ &&
      typeof window.__CONTROLER_RN_META__ === "object"
    ) {
      window.__CONTROLER_RN_META__.navigationGeneration = normalizedGeneration;
    }
    postMessage("bridge-session", {});
    return true;
  }

  function emitEvent(name, payload = {}) {
    if (!isReactNativeApp()) {
      return false;
    }
    return postMessage("bridge-event", {
      name: String(name || ""),
      ...normalizePayload(payload),
    });
  }

  function normalizeUiLanguage(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "en" || normalized === "en-us"
      ? "en-US"
      : DEFAULT_UI_LANGUAGE;
  }

  function readCurrentLanguage() {
    const runtimeLanguage =
      typeof window.ControlerI18n?.getLanguage === "function"
        ? window.ControlerI18n.getLanguage()
        : "";
    if (runtimeLanguage) {
      return normalizeUiLanguage(runtimeLanguage);
    }
    try {
      return normalizeUiLanguage(
        window.localStorage?.getItem?.(LANGUAGE_STORAGE_KEY),
      );
    } catch (error) {
      return DEFAULT_UI_LANGUAGE;
    }
  }

  function emitCurrentLanguage(language = readCurrentLanguage()) {
    return emitEvent("ui.language-changed", {
      language: normalizeUiLanguage(language),
    });
  }

  function call(method, payload = {}) {
    if (!isReactNativeApp()) {
      return Promise.resolve(null);
    }

    const id = `rn_${Date.now()}_${requestCounter += 1}`;
    const normalizedMethod = String(method || "").trim();
    const startedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const timeoutMs = resolveMessageTimeout(method);
    let timeoutId = null;

    if (timeoutMs > 0) {
      timeoutId = window.setTimeout(() => {
        const pending = pendingRequests.get(id);
        if (!pending) {
          return;
        }
        pendingRequests.delete(id);
        emitBridgePerfMetric(
          pending.method,
          (
            (typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now()) - pending.startedAt
          ),
          {
          ok: false,
          timedOut: true,
          },
        );
        pending.reject(new Error(`Native bridge timeout: ${method}`));
      }, timeoutMs);
    }

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
        method: normalizedMethod,
        startedAt,
      });
      const posted = postMessage("bridge-request", {
        id,
        method: normalizedMethod,
        payload: normalizePayload(payload),
      });
      if (posted) {
        return;
      }

      pendingRequests.delete(id);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      emitBridgePerfMetric(normalizedMethod, (
        (typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now()) - startedAt
      ), {
        ok: false,
        unavailable: true,
      });
      reject(new Error(`Native bridge unavailable: ${method}`));
    });
  }

  function receive(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (
      REQUIRES_PAGE_SESSION_ENVELOPE &&
      (message.pageSessionId !== PAGE_SESSION_ID ||
        Number(message.navigationGeneration) !== NAVIGATION_GENERATION)
    ) {
      return;
    }

    if (message.type === "bridge-response") {
      const { id, result, error } = normalizePayload(message.payload);
      const pending = pendingRequests.get(id);
      if (!pending) {
        return;
      }
      pendingRequests.delete(id);
      if (pending.timeoutId !== null) {
        window.clearTimeout(pending.timeoutId);
      }
      const finishedAt =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      emitBridgePerfMetric(pending.method, finishedAt - pending.startedAt, {
        ok: !error,
        error: error ? String(error) : "",
      });
      if (error) {
        pending.reject(new Error(String(error)));
        return;
      }
      pending.resolve(result ?? null);
      return;
    }

    if (message.type === "bridge-event") {
      window.dispatchEvent(
        new CustomEvent(BRIDGE_EVENT_NAME, {
          detail: normalizePayload(message.payload),
        }),
      );
    }
  }

  const pendingNativeMessages = Array.isArray(
    window.__CONTROLER_PENDING_NATIVE_MESSAGES__,
  )
    ? window.__CONTROLER_PENDING_NATIVE_MESSAGES__
    : [];
  receive.__controlerReceiverKind = "runtime";
  receive.__controlerBridgeEvalId = "runtime";
  window.__controlerReceiveNativeMessage = receive;
  if (pendingNativeMessages.length > 0) {
    pendingNativeMessages.splice(0).forEach((message) => {
      receive(message);
    });
  }
  window.ControlerNativeBridge = {
    get isReactNativeApp() {
      return isReactNativeApp();
    },
    get platform() {
      const meta = getRuntimeMeta();
      return typeof meta.platform === "string" ? meta.platform : "web";
    },
    get capabilities() {
      const meta = getRuntimeMeta();
      return meta.capabilities && typeof meta.capabilities === "object"
        ? meta.capabilities
        : {};
    },
    eventName: BRIDGE_EVENT_NAME,
    pageSessionId: PAGE_SESSION_ID,
    get navigationGeneration() {
      return NAVIGATION_GENERATION;
    },
    call,
    emitEvent,
    rebindSession,
  };

  function applyRuntimeClasses() {
    const platform = getNativeHostPlatform();
    const isNative = platform !== "web";
    const root = document.documentElement;
    const body = document.body;
    if (!root) {
      return;
    }

    root.classList.toggle("controler-mobile-runtime", isNative);
    root.classList.toggle("controler-android-native", isNative && platform === "android");
    root.classList.toggle("controler-ios-native", isNative && platform === "ios");

    if (!body) {
      return;
    }

    body.classList.toggle("controler-mobile-runtime", isNative);
    body.classList.toggle("controler-android-native", isNative && platform === "android");
    body.classList.toggle("controler-ios-native", isNative && platform === "ios");
  }

  let runtimeClassSyncFrameId = 0;
  let runtimeClassSyncAttempts = 0;
  const MAX_RUNTIME_CLASS_SYNC_ATTEMPTS = 120;

  function hasAppliedRuntimeClasses(platform = getNativeHostPlatform()) {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) {
      return false;
    }

    const isNative = platform !== "web";
    return (
      root.classList.contains("controler-mobile-runtime") === isNative &&
      body.classList.contains("controler-mobile-runtime") === isNative &&
      root.classList.contains("controler-android-native") ===
        (isNative && platform === "android") &&
      body.classList.contains("controler-android-native") ===
        (isNative && platform === "android") &&
      root.classList.contains("controler-ios-native") ===
        (isNative && platform === "ios") &&
      body.classList.contains("controler-ios-native") ===
        (isNative && platform === "ios")
    );
  }

  function scheduleRuntimeClassSync() {
    if (
      runtimeClassSyncFrameId ||
      runtimeClassSyncAttempts >= MAX_RUNTIME_CLASS_SYNC_ATTEMPTS
    ) {
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    runtimeClassSyncFrameId = schedule(() => {
      runtimeClassSyncFrameId = 0;
      runtimeClassSyncAttempts += 1;
      applyRuntimeClasses();
      const platform = getNativeHostPlatform();
      if (
        document.body &&
        platform !== "web" &&
        hasAppliedRuntimeClasses(platform)
      ) {
        runtimeClassSyncAttempts = 0;
        return;
      }
      scheduleRuntimeClassSync();
    });
  }

  function resyncRuntimeClasses() {
    runtimeClassSyncAttempts = 0;
    applyRuntimeClasses();
    applyKeyboardOpenState();
    const platform = getNativeHostPlatform();
    if (
      platform !== "web" &&
      (!document.body || !hasAppliedRuntimeClasses(platform))
    ) {
      scheduleRuntimeClassSync();
    }
  }

  const ANDROID_KEYBOARD_OPEN_THRESHOLD_PX = 140;
  const ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX = 64;
  const ANDROID_KEYBOARD_BASELINE_RESET_TOLERANCE_PX = 48;
  const ANDROID_KEYBOARD_BASELINE_STALE_TOLERANCE_PX = 96;
  const ANDROID_KEYBOARD_INSET_HOLD_TOLERANCE_PX = 24;
  const ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX = 12;
  const ANDROID_KEYBOARD_VISUAL_SETTLE_MS = 168;
  const ANDROID_KEYBOARD_BASELINE_SESSION_KEY =
    "__controler_android_keyboard_baseline__";
  const ANDROID_NATIVE_KEYBOARD_POLL_INTERVAL_MS = 96;
  const ANDROID_NATIVE_KEYBOARD_FOCUS_POLL_HOLD_MS = 1600;
  const ANDROID_NATIVE_KEYBOARD_BLUR_POLL_HOLD_MS = 480;
  const ANDROID_NATIVE_KEYBOARD_TRACK_SELECTOR = [
    "input[type='text']:not(:disabled)",
    "input[type='search']:not(:disabled)",
    "input[type='email']:not(:disabled)",
    "input[type='url']:not(:disabled)",
    "input[type='tel']:not(:disabled)",
    "input[type='password']:not(:disabled)",
    "input[type='number']:not(:disabled)",
    "textarea:not(:disabled)",
    "[contenteditable='true']",
    "[contenteditable]:not([contenteditable='false'])",
  ].join(", ");
  let keyboardViewportBaseHeight = 0;
  let lastKeyboardViewportHeight = 0;
  let keyboardOpenPeakInset = 0;
  let keyboardStateFrameId = 0;
  let keyboardOpen = false;
  let lastVisualKeyboardTransitionInsetPx = 0;
  let lastVisualKeyboardTransitionChangedAt = 0;
  let nativeAndroidKeyboardInsetPx = 0;
  let nativeAndroidKeyboardTransitionInsetPx = 0;
  let nativeAndroidKeyboardVisible = false;
  let nativeAndroidKeyboardPollTimerId = 0;
  let nativeAndroidKeyboardPollInFlight = false;
  let nativeAndroidKeyboardPollHoldUntil = 0;

  function hasNativeAndroidKeyboardEvidence() {
    return (
      nativeAndroidKeyboardVisible ||
      nativeAndroidKeyboardInsetPx > ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX ||
      nativeAndroidKeyboardTransitionInsetPx >
        ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX
    );
  }

  function isAndroidNativeKeyboardTrackTarget(target = document.activeElement) {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.matches?.(ANDROID_NATIVE_KEYBOARD_TRACK_SELECTOR) === true;
  }

  function isOfflineAndroidWebViewHost() {
    return (
      getNativeHostPlatform() === "android" &&
      typeof window.ReactNativeWebView?.getRuntimeMeta === "function"
    );
  }

  function normalizeNativeAndroidSoftInputState(rawState) {
    const source =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    const imeBottomInset = Math.max(
      0,
      Math.round(Number(source.imeBottomInset) || 0),
    );
    const navigationBottomInset = Math.max(
      0,
      Math.round(Number(source.navigationBottomInset) || 0),
    );
    const visibleBottomInset = Math.max(0, imeBottomInset - navigationBottomInset);
    return {
      reportedVisible: source.reportedVisible === true,
      actualVisible: source.actualVisible === true,
      imeBottomInset,
      navigationBottomInset,
      visibleBottomInset,
    };
  }

  function shouldTrackNativeAndroidKeyboardState(now = Date.now()) {
    if (isOfflineAndroidWebViewHost()) {
      return false;
    }
    return (
      getNativeHostPlatform() === "android" &&
      isReactNativeApp() &&
      (
        nativeAndroidKeyboardTransitionInsetPx > 0 ||
        nativeAndroidKeyboardVisible ||
        isAndroidNativeKeyboardTrackTarget() ||
        now < nativeAndroidKeyboardPollHoldUntil
      )
    );
  }

  function clearNativeAndroidKeyboardPollTimer() {
    if (nativeAndroidKeyboardPollTimerId > 0) {
      window.clearTimeout(nativeAndroidKeyboardPollTimerId);
      nativeAndroidKeyboardPollTimerId = 0;
    }
  }

  function scheduleNativeAndroidKeyboardStateSync(
    delayMs = ANDROID_NATIVE_KEYBOARD_POLL_INTERVAL_MS,
  ) {
    if (nativeAndroidKeyboardPollInFlight || nativeAndroidKeyboardPollTimerId > 0) {
      return;
    }
    nativeAndroidKeyboardPollTimerId = window.setTimeout(() => {
      nativeAndroidKeyboardPollTimerId = 0;
      void syncNativeAndroidKeyboardState();
    }, Math.max(0, Math.round(Number(delayMs) || 0)));
  }

  function armNativeAndroidKeyboardPolling(holdDurationMs = 0) {
    if (!(holdDurationMs > 0)) {
      return;
    }
    nativeAndroidKeyboardPollHoldUntil = Math.max(
      nativeAndroidKeyboardPollHoldUntil,
      Date.now() + Math.max(0, Math.round(Number(holdDurationMs) || 0)),
    );
  }

  async function syncNativeAndroidKeyboardState() {
    if (getNativeHostPlatform() !== "android" || !isReactNativeApp()) {
      return;
    }
    if (nativeAndroidKeyboardPollInFlight) {
      return;
    }
    if (!shouldTrackNativeAndroidKeyboardState()) {
      clearNativeAndroidKeyboardPollTimer();
      if (
        nativeAndroidKeyboardInsetPx > 0 ||
        nativeAndroidKeyboardTransitionInsetPx > 0 ||
        nativeAndroidKeyboardVisible
      ) {
        nativeAndroidKeyboardInsetPx = 0;
        nativeAndroidKeyboardTransitionInsetPx = 0;
        nativeAndroidKeyboardVisible = false;
        applyKeyboardOpenState();
      }
      return;
    }

    nativeAndroidKeyboardPollInFlight = true;
    clearNativeAndroidKeyboardPollTimer();
    try {
      const nextState = normalizeNativeAndroidSoftInputState(
        await window.ControlerNativeBridge.call("ui.getSoftInputState"),
      );
      const nextKeyboardTransitionInsetPx = nextState.visibleBottomInset;
      const nextKeyboardInsetPx = nextState.actualVisible
        ? nextState.visibleBottomInset
        : 0;
      const nextKeyboardVisible =
        nextState.actualVisible ||
        (
          nextState.reportedVisible &&
          nextKeyboardTransitionInsetPx > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX
        ) ||
        nextKeyboardTransitionInsetPx > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX;
      const changed =
        nextKeyboardInsetPx !== nativeAndroidKeyboardInsetPx ||
        nextKeyboardTransitionInsetPx !== nativeAndroidKeyboardTransitionInsetPx ||
        nextKeyboardVisible !== nativeAndroidKeyboardVisible;
      nativeAndroidKeyboardInsetPx = nextKeyboardInsetPx;
      nativeAndroidKeyboardTransitionInsetPx = nextKeyboardTransitionInsetPx;
      nativeAndroidKeyboardVisible = nextKeyboardVisible;
      if (changed) {
        applyKeyboardOpenState();
      }
    } catch (error) {
    } finally {
      nativeAndroidKeyboardPollInFlight = false;
      if (shouldTrackNativeAndroidKeyboardState()) {
        nativeAndroidKeyboardPollTimerId = window.setTimeout(() => {
          nativeAndroidKeyboardPollTimerId = 0;
          void syncNativeAndroidKeyboardState();
        }, ANDROID_NATIVE_KEYBOARD_POLL_INTERVAL_MS);
        return;
      }
      if (
        nativeAndroidKeyboardInsetPx > 0 ||
        nativeAndroidKeyboardTransitionInsetPx > 0 ||
        nativeAndroidKeyboardVisible
      ) {
        nativeAndroidKeyboardInsetPx = 0;
        nativeAndroidKeyboardTransitionInsetPx = 0;
        nativeAndroidKeyboardVisible = false;
        applyKeyboardOpenState();
      }
    }
  }

  function clearPersistedAndroidKeyboardBaseline() {
    try {
      window.sessionStorage?.removeItem?.(ANDROID_KEYBOARD_BASELINE_SESSION_KEY);
    } catch (error) {}
  }

  function readPersistedAndroidKeyboardBaseline(
    viewportWidth = 0,
    closedViewportCandidateHeight = 0,
    allowOversizedBaseline = false,
  ) {
    try {
      const rawValue =
        window.sessionStorage?.getItem?.(ANDROID_KEYBOARD_BASELINE_SESSION_KEY) ||
        "";
      if (!rawValue) {
        return 0;
      }
      const parsed = JSON.parse(rawValue);
      const persistedHeight = Math.round(Number(parsed?.height) || 0);
      const persistedWidth = Math.round(Number(parsed?.width) || 0);
      if (!(persistedHeight > 0)) {
        return 0;
      }
      if (
        viewportWidth > 0 &&
        persistedWidth > 0 &&
        Math.abs(persistedWidth - viewportWidth) >
          Math.max(120, Math.round(viewportWidth * 0.28))
      ) {
        clearPersistedAndroidKeyboardBaseline();
        return 0;
      }
      if (
        !allowOversizedBaseline &&
        closedViewportCandidateHeight > 0 &&
        persistedHeight >
          closedViewportCandidateHeight +
            ANDROID_KEYBOARD_BASELINE_STALE_TOLERANCE_PX
      ) {
        clearPersistedAndroidKeyboardBaseline();
        return 0;
      }
      return persistedHeight;
    } catch (error) {
      return 0;
    }
  }

  function persistAndroidKeyboardBaseline(height = 0, width = 0) {
    const normalizedHeight = Math.round(Number(height) || 0);
    const normalizedWidth = Math.round(Number(width) || 0);
    if (!(normalizedHeight > 0)) {
      return;
    }
    try {
      window.sessionStorage?.setItem?.(
        ANDROID_KEYBOARD_BASELINE_SESSION_KEY,
        JSON.stringify({
          height: normalizedHeight,
          width: normalizedWidth > 0 ? normalizedWidth : 0,
        }),
      );
    } catch (error) {}
  }

  function getAndroidLayoutViewportHeight(viewportHeight = 0) {
    return Math.max(
      Math.round(window.innerHeight || 0),
      Math.round(document.documentElement?.clientHeight || 0),
      Math.round(document.body?.clientHeight || 0),
      Math.round(viewportHeight || 0),
    );
  }

  function getAndroidVisibleViewportHeightCandidate() {
    const visualViewportHeight = Math.round(window.visualViewport?.height || 0);
    if (visualViewportHeight > 0) {
      return visualViewportHeight;
    }
    const candidates = [
      Math.round(window.innerHeight || 0),
      Math.round(document.documentElement?.clientHeight || 0),
      Math.round(document.body?.clientHeight || 0),
    ].filter((value) => value > 0);
    if (!candidates.length) {
      return 0;
    }
    return Math.min(...candidates);
  }

  function applyKeyboardOpenState() {
    const platform = getNativeHostPlatform();
    if (platform !== "android") {
      return;
    }

    const visualViewport = window.visualViewport;
    const rawViewportHeight = getAndroidVisibleViewportHeightCandidate();
    if (!rawViewportHeight) {
      return;
    }

    if (isOfflineAndroidWebViewHost()) {
      const root = document.documentElement;
      const body = document.body;
      const viewportWidth = Math.round(
        visualViewport?.width || window.innerWidth || root?.clientWidth || 0,
      );
      const viewportOffsetTop = Math.max(
        0,
        Math.round(visualViewport?.offsetTop || 0),
      );
      const viewportOffsetLeft = Math.max(
        0,
        Math.round(visualViewport?.offsetLeft || 0),
      );
      const stableViewportHeight = Math.max(
        Math.round(window.innerHeight || 0),
        Math.round(root?.clientHeight || 0),
        rawViewportHeight,
      );
      const keyboardInset = Math.max(
        stableViewportHeight - viewportOffsetTop - rawViewportHeight,
        0,
      );
      const keyboardVisible =
        keyboardInset > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX;
      root?.style.setProperty(
        "--controler-visual-viewport-height",
        `${rawViewportHeight}px`,
      );
      root?.style.setProperty(
        "--controler-visual-viewport-width",
        `${viewportWidth}px`,
      );
      root?.style.setProperty(
        "--controler-visual-viewport-offset-top",
        `${viewportOffsetTop}px`,
      );
      root?.style.setProperty(
        "--controler-visual-viewport-offset-left",
        `${viewportOffsetLeft}px`,
      );
      root?.style.setProperty(
        "--controler-stable-visual-viewport-height",
        `${stableViewportHeight}px`,
      );
      root?.style.setProperty("--controler-keyboard-inset", `${keyboardInset}px`);
      root?.style.setProperty(
        "--controler-keyboard-transition-inset",
        `${keyboardInset}px`,
      );
      keyboardOpen = keyboardVisible;
      root?.classList.toggle("controler-keyboard-open", keyboardVisible);
      body?.classList.toggle("controler-keyboard-open", keyboardVisible);
      return;
    }

    // Keep horizontal size and offset from the same viewport source.
    // Mixing visualViewport.offsetLeft with layout viewport width shifts
    // fixed overlays to the right on Android WebView.
    const viewportWidth = Math.round(
      visualViewport?.width ||
        window.innerWidth ||
        document.documentElement?.clientWidth ||
        document.body?.clientWidth ||
        0,
    );
    const viewportOffsetTop = Math.max(
      0,
      Math.round(visualViewport?.offsetTop || 0),
    );
    const viewportOffsetLeft = Math.max(
      0,
      Math.round(visualViewport?.offsetLeft || 0),
    );
    const rawLayoutViewportHeight =
      getAndroidLayoutViewportHeight(rawViewportHeight);
    const closedViewportCandidateHeight = Math.max(
      rawLayoutViewportHeight,
      rawViewportHeight,
    );
    const nativeKeyboardEvidence = hasNativeAndroidKeyboardEvidence();
    const activeKeyboardTrackTarget = isAndroidNativeKeyboardTrackTarget();
    const shouldHoldBaselineForKeyboardMotion =
      nativeKeyboardEvidence ||
      keyboardOpen ||
      (
        activeKeyboardTrackTarget &&
        keyboardViewportBaseHeight > 0 &&
        rawViewportHeight + ANDROID_KEYBOARD_OPEN_THRESHOLD_PX <
          keyboardViewportBaseHeight
      );
    if (
      keyboardViewportBaseHeight > 0 &&
      !shouldHoldBaselineForKeyboardMotion &&
      closedViewportCandidateHeight > 0 &&
      keyboardViewportBaseHeight >
        closedViewportCandidateHeight +
          ANDROID_KEYBOARD_BASELINE_STALE_TOLERANCE_PX
    ) {
      keyboardViewportBaseHeight = closedViewportCandidateHeight;
      persistAndroidKeyboardBaseline(keyboardViewportBaseHeight, viewportWidth);
    }
    if (!(keyboardViewportBaseHeight > 0)) {
      keyboardViewportBaseHeight = readPersistedAndroidKeyboardBaseline(
        viewportWidth,
        closedViewportCandidateHeight,
        nativeKeyboardEvidence || keyboardOpen || activeKeyboardTrackTarget,
      );
    }
    const viewportBaseCandidateHeight = Math.max(
      closedViewportCandidateHeight,
      keyboardViewportBaseHeight || 0,
    );
    const hadStableBaseline = keyboardViewportBaseHeight > 0;

    if (
      !hadStableBaseline ||
      viewportBaseCandidateHeight >
        keyboardViewportBaseHeight + ANDROID_KEYBOARD_BASELINE_RESET_TOLERANCE_PX
    ) {
      keyboardViewportBaseHeight = viewportBaseCandidateHeight;
      persistAndroidKeyboardBaseline(keyboardViewportBaseHeight, viewportWidth);
    }

    const rawStableViewportHeight = Math.max(
      keyboardViewportBaseHeight || 0,
      rawLayoutViewportHeight,
      rawViewportHeight,
    );
    const measuredRawKeyboardDelta = Math.max(
      rawStableViewportHeight - rawViewportHeight,
      0,
    );
    const rawKeyboardDelta =
      !nativeKeyboardEvidence &&
      measuredRawKeyboardDelta <= ANDROID_KEYBOARD_OPEN_THRESHOLD_PX
        ? 0
        : measuredRawKeyboardDelta;
    const rawNextKeyboardOpen = keyboardOpen
      ? rawKeyboardDelta > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX
      : rawKeyboardDelta > ANDROID_KEYBOARD_OPEN_THRESHOLD_PX;
    const viewportHeight =
      rawNextKeyboardOpen &&
      lastKeyboardViewportHeight > 0 &&
      rawViewportHeight > lastKeyboardViewportHeight &&
      rawViewportHeight - lastKeyboardViewportHeight <=
        ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX
        ? lastKeyboardViewportHeight
        : rawViewportHeight;
    const layoutViewportHeight = getAndroidLayoutViewportHeight(viewportHeight);

    const stableViewportHeight = Math.max(
      keyboardViewportBaseHeight || 0,
      layoutViewportHeight,
      viewportHeight,
    );
    const measuredKeyboardDelta = Math.max(stableViewportHeight - viewportHeight, 0);
    const keyboardDelta =
      !nativeKeyboardEvidence &&
      measuredKeyboardDelta <= ANDROID_KEYBOARD_OPEN_THRESHOLD_PX
        ? 0
        : measuredKeyboardDelta;
    const nextKeyboardOpen = keyboardOpen
      ? keyboardDelta > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX
      : keyboardDelta > ANDROID_KEYBOARD_OPEN_THRESHOLD_PX;
    let appliedKeyboardDelta = keyboardDelta;
    if (nextKeyboardOpen) {
      if (!keyboardOpen) {
        keyboardOpenPeakInset = keyboardDelta;
      } else if (
        keyboardDelta >= keyboardOpenPeakInset ||
        keyboardOpenPeakInset - keyboardDelta <=
          ANDROID_KEYBOARD_INSET_HOLD_TOLERANCE_PX
      ) {
        keyboardOpenPeakInset = keyboardDelta;
      }
      appliedKeyboardDelta = Math.max(keyboardDelta, keyboardOpenPeakInset);
    } else {
      keyboardOpenPeakInset = 0;
      appliedKeyboardDelta = 0;
    }
    const root = document.documentElement;
    const body = document.body;
    root?.style.setProperty(
      "--controler-visual-viewport-height",
      `${viewportHeight}px`,
    );
    root?.style.setProperty(
      "--controler-visual-viewport-width",
      `${viewportWidth}px`,
    );
    root?.style.setProperty(
      "--controler-visual-viewport-offset-top",
      `${viewportOffsetTop}px`,
    );
    root?.style.setProperty(
      "--controler-visual-viewport-offset-left",
      `${viewportOffsetLeft}px`,
    );
    root?.style.setProperty(
      "--controler-stable-visual-viewport-height",
      `${stableViewportHeight}px`,
    );
    const transitionKeyboardDelta =
      rawKeyboardDelta <= ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX
        ? 0
        : rawKeyboardDelta;
    const now = Date.now();
    if (
      Math.abs(
        transitionKeyboardDelta - lastVisualKeyboardTransitionInsetPx,
      ) > 1
    ) {
      lastVisualKeyboardTransitionChangedAt = now;
    }
    lastVisualKeyboardTransitionInsetPx = transitionKeyboardDelta;
    const hasVisualKeyboardTransition =
      transitionKeyboardDelta > ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX;
    const effectiveNativeKeyboardTransitionInset = nativeAndroidKeyboardVisible
      ? nativeAndroidKeyboardTransitionInsetPx
      : 0;
    const effectiveNativeKeyboardInset = nativeAndroidKeyboardVisible
      ? nativeAndroidKeyboardInsetPx
      : 0;
    const shouldPreferVisualKeyboardMotion =
      hasVisualKeyboardTransition &&
      (
        !nativeAndroidKeyboardVisible ||
        now - lastVisualKeyboardTransitionChangedAt <=
          ANDROID_KEYBOARD_VISUAL_SETTLE_MS ||
        transitionKeyboardDelta + ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX >=
          effectiveNativeKeyboardTransitionInset
      );
    const effectiveKeyboardTransitionDelta = shouldPreferVisualKeyboardMotion
      ? transitionKeyboardDelta
      : hasVisualKeyboardTransition
        ? Math.max(
            transitionKeyboardDelta,
            effectiveNativeKeyboardTransitionInset,
          )
        : effectiveNativeKeyboardTransitionInset;
    const effectiveKeyboardInset = shouldPreferVisualKeyboardMotion
      ? appliedKeyboardDelta
      : Math.max(appliedKeyboardDelta, effectiveNativeKeyboardInset);
    const effectiveKeyboardOpen =
      nextKeyboardOpen ||
      nativeAndroidKeyboardVisible ||
      effectiveKeyboardInset > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX;
    root?.style.setProperty(
      "--controler-keyboard-inset",
      `${effectiveKeyboardInset}px`,
    );
    root?.style.setProperty(
      "--controler-keyboard-transition-inset",
      `${effectiveKeyboardTransitionDelta}px`,
    );
    keyboardOpen = effectiveKeyboardOpen;
    lastKeyboardViewportHeight = effectiveKeyboardOpen
      ? viewportHeight
      : rawViewportHeight;
    root?.classList.toggle("controler-keyboard-open", effectiveKeyboardOpen);
    body?.classList.toggle("controler-keyboard-open", effectiveKeyboardOpen);
    root?.classList.toggle(
      "controler-keyboard-visual-inset-active",
      effectiveKeyboardTransitionDelta > 0,
    );
    body?.classList.toggle(
      "controler-keyboard-visual-inset-active",
      effectiveKeyboardTransitionDelta > 0,
    );

    if (
      !effectiveKeyboardOpen &&
      Math.abs(layoutViewportHeight - viewportHeight) <
        ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX &&
      viewportBaseCandidateHeight >=
        keyboardViewportBaseHeight -
          ANDROID_KEYBOARD_BASELINE_RESET_TOLERANCE_PX
    ) {
      keyboardViewportBaseHeight = viewportBaseCandidateHeight;
      persistAndroidKeyboardBaseline(keyboardViewportBaseHeight, viewportWidth);
    }
  }

  function syncKeyboardOpenState() {
    applyKeyboardOpenState();
    if (shouldTrackNativeAndroidKeyboardState()) {
      armNativeAndroidKeyboardPolling(ANDROID_NATIVE_KEYBOARD_BLUR_POLL_HOLD_MS);
      const hasRecentVisualKeyboardTransition =
        lastVisualKeyboardTransitionInsetPx >
          ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX &&
        Date.now() - lastVisualKeyboardTransitionChangedAt <=
          ANDROID_KEYBOARD_VISUAL_SETTLE_MS;
      if (hasRecentVisualKeyboardTransition) {
        scheduleNativeAndroidKeyboardStateSync(
          ANDROID_KEYBOARD_VISUAL_SETTLE_MS,
        );
      } else {
        void syncNativeAndroidKeyboardState();
      }
    }

    if (!keyboardStateFrameId) {
      const schedule =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16);

      keyboardStateFrameId = schedule(() => {
        keyboardStateFrameId = 0;
        applyKeyboardOpenState();
      });
    }
  }

  function runAndroidShellKeyboardViewportResync() {
    if (getNativeHostPlatform() !== "android") {
      return;
    }
    applyRuntimeClasses();
    syncKeyboardOpenState();
    if (isAndroidNativeKeyboardTrackTarget()) {
      armNativeAndroidKeyboardPolling(ANDROID_NATIVE_KEYBOARD_FOCUS_POLL_HOLD_MS);
      void syncNativeAndroidKeyboardState();
    }
  }

  function scheduleAndroidShellKeyboardViewportResync(detail = {}) {
    if (
      getNativeHostPlatform() !== "android" ||
      detail?.name !== "ui.shell-visibility"
    ) {
      return;
    }
    if (detail.active === false) {
      clearNativeAndroidKeyboardPollTimer();
      return;
    }
    if (detail.transitionLoading === true) {
      return;
    }

    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);

    runAndroidShellKeyboardViewportResync();
    if (isOfflineAndroidWebViewHost()) {
      return;
    }
    schedule(() => {
      runAndroidShellKeyboardViewportResync();
      schedule(runAndroidShellKeyboardViewportResync);
    });
  }

  applyRuntimeClasses();
  if (document.readyState === "loading") {
    scheduleRuntimeClassSync();
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        runtimeClassSyncAttempts = 0;
        applyRuntimeClasses();
        applyKeyboardOpenState();
        emitCurrentLanguage();
      },
      {
        once: true,
      },
    );
  } else {
    runtimeClassSyncAttempts = 0;
    applyRuntimeClasses();
    applyKeyboardOpenState();
    emitCurrentLanguage();
  }

  window.addEventListener(BRIDGE_EVENT_NAME, resyncRuntimeClasses);
  window.addEventListener(BRIDGE_EVENT_NAME, (event) => {
    const detail =
      event && typeof event.detail === "object" && event.detail
        ? event.detail
        : {};
    scheduleAndroidShellKeyboardViewportResync(detail);
  });
  window.addEventListener("pageshow", resyncRuntimeClasses);
  document.addEventListener("focusin", (event) => {
    if (!isAndroidNativeKeyboardTrackTarget(event.target)) {
      return;
    }
    armNativeAndroidKeyboardPolling(ANDROID_NATIVE_KEYBOARD_FOCUS_POLL_HOLD_MS);
    void syncNativeAndroidKeyboardState();
  });
  document.addEventListener("focusout", (event) => {
    if (
      !isAndroidNativeKeyboardTrackTarget(event.target) &&
      !nativeAndroidKeyboardVisible &&
      nativeAndroidKeyboardTransitionInsetPx <= 0
    ) {
      return;
    }
    armNativeAndroidKeyboardPolling(ANDROID_NATIVE_KEYBOARD_BLUR_POLL_HOLD_MS);
    void syncNativeAndroidKeyboardState();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resyncRuntimeClasses();
      if (shouldTrackNativeAndroidKeyboardState()) {
        armNativeAndroidKeyboardPolling(ANDROID_NATIVE_KEYBOARD_BLUR_POLL_HOLD_MS);
        void syncNativeAndroidKeyboardState();
      }
      return;
    }
    clearNativeAndroidKeyboardPollTimer();
  });
  window.visualViewport?.addEventListener("resize", syncKeyboardOpenState);
  window.visualViewport?.addEventListener("scroll", syncKeyboardOpenState);
  window.addEventListener("resize", syncKeyboardOpenState);
  window.addEventListener("orientationchange", syncKeyboardOpenState);
  window.addEventListener(LANGUAGE_EVENT_NAME, (event) => {
    emitCurrentLanguage(event?.detail?.language);
  });
})();
