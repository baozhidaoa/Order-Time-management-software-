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
    const timeoutMs = resolveMessageTimeout(method);
    let timeoutId = null;

    if (timeoutMs > 0) {
      timeoutId = window.setTimeout(() => {
        const pending = pendingRequests.get(id);
        if (!pending) {
          return;
        }
        pendingRequests.delete(id);
        pending.reject(new Error(`Native bridge timeout: ${method}`));
      }, timeoutMs);
    }

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
      });
      const posted = postMessage("bridge-request", {
        id,
        method: String(method || ""),
        payload: normalizePayload(payload),
      });
      if (posted) {
        return;
      }

      pendingRequests.delete(id);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
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

  window.__controlerReceiveNativeMessage = receive;
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

  let keyboardViewportBaseHeight = 0;
  let lastKeyboardViewportHeight = 0;
  let keyboardStateFrameId = 0;

  function applyKeyboardOpenState() {
    const platform = getNativeHostPlatform();
    if (platform !== "android") {
      return;
    }

    const viewportHeight = Math.round(
      window.visualViewport?.height || window.innerHeight || 0,
    );
    if (!viewportHeight) {
      return;
    }

    if (viewportHeight === lastKeyboardViewportHeight && keyboardViewportBaseHeight) {
      return;
    }
    lastKeyboardViewportHeight = viewportHeight;

    if (!keyboardViewportBaseHeight || viewportHeight > keyboardViewportBaseHeight) {
      keyboardViewportBaseHeight = viewportHeight;
    }

    const keyboardOpen = keyboardViewportBaseHeight - viewportHeight > 140;
    const root = document.documentElement;
    const body = document.body;
    root?.style.setProperty(
      "--controler-visual-viewport-height",
      `${viewportHeight}px`,
    );
    root?.classList.toggle("controler-keyboard-open", keyboardOpen);
    body?.classList.toggle("controler-keyboard-open", keyboardOpen);

    if (!keyboardOpen && viewportHeight >= keyboardViewportBaseHeight - 48) {
      keyboardViewportBaseHeight = viewportHeight;
    }
  }

  function syncKeyboardOpenState() {
    if (keyboardStateFrameId) {
      return;
    }

    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);

    keyboardStateFrameId = schedule(() => {
      keyboardStateFrameId = 0;
      applyKeyboardOpenState();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        applyRuntimeClasses();
        applyKeyboardOpenState();
        emitCurrentLanguage();
      },
      {
        once: true,
      },
    );
  } else {
    applyRuntimeClasses();
    applyKeyboardOpenState();
    emitCurrentLanguage();
  }

  window.visualViewport?.addEventListener("resize", syncKeyboardOpenState);
  window.addEventListener("resize", syncKeyboardOpenState);
  window.addEventListener("orientationchange", syncKeyboardOpenState);
  window.addEventListener(LANGUAGE_EVENT_NAME, (event) => {
    emitCurrentLanguage(event?.detail?.language);
  });
})();
