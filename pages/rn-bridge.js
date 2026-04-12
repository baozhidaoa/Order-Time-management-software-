(() => {
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

  const MESSAGE_TIMEOUT_OVERRIDES = {
    "storage.selectFile": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.selectDirectory": INTERACTIVE_MESSAGE_TIMEOUT_MS,
    "storage.pickImportSourceFile": INTERACTIVE_MESSAGE_TIMEOUT_MS,
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
    return String(method || "").trim().startsWith("storage.");
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
        payload: normalizePayload(payload),
      }),
    );
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
    call,
    emitEvent,
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
  const ANDROID_KEYBOARD_INSET_HOLD_TOLERANCE_PX = 24;
  const ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX = 12;
  const ANDROID_KEYBOARD_BASELINE_SESSION_KEY =
    "__controler_android_keyboard_baseline__";
  let keyboardViewportBaseHeight = 0;
  let lastKeyboardViewportHeight = 0;
  let keyboardOpenPeakInset = 0;
  let keyboardStateFrameId = 0;
  let keyboardOpen = false;

  function readPersistedAndroidKeyboardBaseline(viewportWidth = 0) {
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
    const candidates = [
      Math.round(window.visualViewport?.height || 0),
      Math.round(window.innerHeight || 0),
      Math.round(document.documentElement?.clientHeight || 0),
      Math.round(document.body?.clientHeight || 0),
    ].filter((value) => value > 0);
    if (!candidates.length) {
      return 0;
    }
    return Math.min(...candidates);
  }

  function getAndroidScreenViewportHeightCandidate(viewportWidth = 0) {
    const screenHeight = Math.round(window.screen?.height || 0);
    const availableHeight = Math.round(window.screen?.availHeight || 0);
    const outerHeight = Math.round(window.outerHeight || 0);
    const candidates = [screenHeight, availableHeight, outerHeight].filter(
      (value) => value > 0,
    );
    if (!candidates.length) {
      return 0;
    }
    const longestHeight = Math.max(...candidates);
    if (!(viewportWidth > 0)) {
      return longestHeight;
    }
    return longestHeight >= viewportWidth ? longestHeight : 0;
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
    if (!(keyboardViewportBaseHeight > 0)) {
      keyboardViewportBaseHeight = readPersistedAndroidKeyboardBaseline(
        viewportWidth,
      );
    }
    const rawLayoutViewportHeight =
      getAndroidLayoutViewportHeight(rawViewportHeight);
    const screenViewportHeight = getAndroidScreenViewportHeightCandidate(
      viewportWidth,
    );
    const viewportBaseCandidateHeight = Math.max(
      rawLayoutViewportHeight,
      rawViewportHeight,
      screenViewportHeight,
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
    const rawKeyboardDelta = Math.max(
      rawStableViewportHeight - rawViewportHeight,
      0,
    );
    const rawNextKeyboardOpen = keyboardOpen
      ? rawKeyboardDelta > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX
      : rawKeyboardDelta > ANDROID_KEYBOARD_OPEN_THRESHOLD_PX;
    const viewportHeight =
      rawNextKeyboardOpen && lastKeyboardViewportHeight > 0
        ? Math.min(rawViewportHeight, lastKeyboardViewportHeight)
        : rawViewportHeight;
    const layoutViewportHeight = getAndroidLayoutViewportHeight(viewportHeight);

    const stableViewportHeight = Math.max(
      keyboardViewportBaseHeight || 0,
      layoutViewportHeight,
      viewportHeight,
    );
    const keyboardDelta = Math.max(stableViewportHeight - viewportHeight, 0);
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
    root?.style.setProperty(
      "--controler-keyboard-inset",
      `${appliedKeyboardDelta}px`,
    );
    root?.style.setProperty(
      "--controler-keyboard-transition-inset",
      `${transitionKeyboardDelta}px`,
    );
    keyboardOpen = nextKeyboardOpen;
    lastKeyboardViewportHeight = nextKeyboardOpen
      ? viewportHeight
      : rawViewportHeight;
    root?.classList.toggle("controler-keyboard-open", keyboardOpen);
    body?.classList.toggle("controler-keyboard-open", keyboardOpen);

    if (
      !keyboardOpen &&
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
  window.addEventListener("pageshow", resyncRuntimeClasses);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resyncRuntimeClasses();
    }
  });
  window.visualViewport?.addEventListener("resize", syncKeyboardOpenState);
  window.visualViewport?.addEventListener("scroll", syncKeyboardOpenState);
  window.addEventListener("resize", syncKeyboardOpenState);
  window.addEventListener("orientationchange", syncKeyboardOpenState);
  window.addEventListener(LANGUAGE_EVENT_NAME, (event) => {
    emitCurrentLanguage(event?.detail?.language);
  });
})();
