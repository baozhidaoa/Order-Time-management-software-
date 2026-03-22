(() => {
  const DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR = 0.75;
  const EXPAND_SURFACE_WIDTH_FACTOR_MIN = 0.4;
  const EXPAND_SURFACE_WIDTH_FACTOR_MAX = 1.5;
  const MODAL_GESTURE_MAX_WIDTH = 690;
  const MODAL_EDGE_SWIPE_TRIGGER = 72;
  const MODAL_EDGE_SWIPE_CLOSE_DISTANCE = 36;
  const MODAL_EDGE_SWIPE_FLING_CLOSE_DISTANCE = 18;
  const MODAL_EDGE_SWIPE_CLOSE_VELOCITY = 0.32;
  const MODAL_EDGE_SWIPE_VERTICAL_TOLERANCE = 96;
  const MODAL_EDGE_SWIPE_RESET_DURATION_MS = 180;
  const APP_NAV_VISIBILITY_STORAGE_KEY = "appNavigationVisibility";
  const APP_NAV_VISIBILITY_EVENT_NAME =
    "controler:app-navigation-visibility-changed";
  const BLOCKING_OVERLAY_STATE_EVENT_NAME =
    "controler:blocking-overlay-state-changed";
  const SHELL_VISIBILITY_EVENT_NAME =
    "controler:shell-visibility-changed";
  const APP_NAV_ICON_NS = "http://www.w3.org/2000/svg";
  const TODO_WIDGET_KIND_IDS = new Set(["todos", "checkins"]);

  function clonePlatformContractValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      if (Array.isArray(value)) {
        return value.slice();
      }
      if (value && typeof value === "object") {
        return { ...value };
      }
      return value;
    }
  }

  function normalizeTodoWidgetPage(page, widgetKind = "", action = "") {
    const normalizedWidgetKind = String(widgetKind || "").trim();
    const normalizedAction = String(action || "").trim();
    if (
      TODO_WIDGET_KIND_IDS.has(normalizedWidgetKind) ||
      normalizedAction === "show-todos" ||
      normalizedAction === "show-checkins"
    ) {
      return "todo";
    }
    return String(page || "").trim();
  }

  function normalizePlatformContractWidgetEntry(entry = {}) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const normalizedEntry = clonePlatformContractValue(entry) || {};
    normalizedEntry.id = String(normalizedEntry.id || "").trim();
    normalizedEntry.action = String(normalizedEntry.action || "").trim();
    normalizedEntry.page = normalizeTodoWidgetPage(
      normalizedEntry.page,
      normalizedEntry.id,
      normalizedEntry.action,
    );
    return normalizedEntry;
  }

  function normalizePlatformContractLaunchEntry(entry = {}) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const normalizedEntry = clonePlatformContractValue(entry) || {};
    normalizedEntry.id = String(
      normalizedEntry.id || normalizedEntry.action || "",
    ).trim();
    normalizedEntry.widgetKind = String(normalizedEntry.widgetKind || "").trim();
    normalizedEntry.page = normalizeTodoWidgetPage(
      normalizedEntry.page,
      normalizedEntry.widgetKind,
      normalizedEntry.id,
    );
    return normalizedEntry;
  }

  function installNormalizedPlatformContract() {
    const currentContract = window.ControlerPlatformContract;
    if (!currentContract || typeof currentContract !== "object") {
      return null;
    }

    const sourceWidgetKinds =
      typeof currentContract.getWidgetKinds === "function"
        ? currentContract.getWidgetKinds()
        : Array.isArray(currentContract.widgetKinds)
          ? currentContract.widgetKinds
          : [];
    const normalizedWidgetKinds = sourceWidgetKinds
      .map((entry) => normalizePlatformContractWidgetEntry(entry))
      .filter(Boolean);
    if (!normalizedWidgetKinds.length) {
      return currentContract;
    }

    const widgetKindIds = normalizedWidgetKinds
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean);
    const widgetKindActionMap = new Map(
      normalizedWidgetKinds.map((entry) => [entry.id, entry.action]),
    );
    const widgetActionKindMap = new Map(
      normalizedWidgetKinds.map((entry) => [entry.action, entry.id]),
    );
    const sourceLaunchActions =
      typeof currentContract.getLaunchActions === "function"
        ? currentContract.getLaunchActions()
        : Array.isArray(currentContract.launchActions)
          ? currentContract.launchActions
          : normalizedWidgetKinds.map((entry) => ({
              id: entry.action,
              page: entry.page,
              widgetKind: entry.id,
            }));
    const normalizedLaunchActions = sourceLaunchActions
      .map((entry) => {
        const normalizedEntry = normalizePlatformContractLaunchEntry(entry);
        if (!normalizedEntry) {
          return null;
        }
        if (!normalizedEntry.widgetKind && widgetActionKindMap.has(normalizedEntry.id)) {
          normalizedEntry.widgetKind = widgetActionKindMap.get(normalizedEntry.id) || "";
        }
        if (
          !normalizedEntry.id &&
          normalizedEntry.widgetKind &&
          widgetKindActionMap.has(normalizedEntry.widgetKind)
        ) {
          normalizedEntry.id =
            widgetKindActionMap.get(normalizedEntry.widgetKind) || "";
        }
        normalizedEntry.page = normalizeTodoWidgetPage(
          normalizedEntry.page,
          normalizedEntry.widgetKind,
          normalizedEntry.id,
        );
        return normalizedEntry.id ? normalizedEntry : null;
      })
      .filter(Boolean);
    const launchActionIds = normalizedLaunchActions
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean);

    const nextContract = {
      ...currentContract,
      widgetKinds: normalizedWidgetKinds,
      widgetKindIds,
      launchActions: normalizedLaunchActions,
      launchActionIds,
      getWidgetKinds() {
        return clonePlatformContractValue(normalizedWidgetKinds);
      },
      getWidgetKindIds() {
        return widgetKindIds.slice();
      },
      getWidgetById(kind) {
        const normalizedKind = String(kind || "").trim();
        const matched = normalizedWidgetKinds.find(
          (entry) => entry.id === normalizedKind,
        );
        return matched ? clonePlatformContractValue(matched) : null;
      },
      getLaunchActions() {
        return clonePlatformContractValue(normalizedLaunchActions);
      },
      getLaunchActionIds() {
        return launchActionIds.slice();
      },
    };
    window.ControlerPlatformContract = nextContract;
    return nextContract;
  }

  installNormalizedPlatformContract();

  const APP_NAV_ITEMS = [
    {
      key: "index",
      label: "记录",
      href: "index.html",
      icon: {
        nodes: [
          { tag: "circle", attrs: { cx: "12", cy: "12", r: "7.25" } },
          { tag: "path", attrs: { d: "M12 8.35v4.1l2.65 1.7" } },
        ],
      },
    },
    {
      key: "stats",
      label: "统计",
      href: "stats.html",
      icon: {
        nodes: [
          { tag: "path", attrs: { d: "M4.5 19.25h15" } },
          { tag: "path", attrs: { d: "M7.25 17.75v-5.5" } },
          { tag: "path", attrs: { d: "M12 17.75V7.25" } },
          { tag: "path", attrs: { d: "M16.75 17.75v-8" } },
        ],
      },
    },
    {
      key: "plan",
      label: "计划",
      href: "plan.html",
      icon: {
        nodes: [
          {
            tag: "rect",
            attrs: { x: "4.5", y: "5.75", width: "15", height: "13.25", rx: "3" },
          },
          { tag: "path", attrs: { d: "M8 3.75v4" } },
          { tag: "path", attrs: { d: "M16 3.75v4" } },
          { tag: "path", attrs: { d: "M4.5 9.75h15" } },
        ],
      },
    },
    {
      key: "todo",
      label: "待办",
      href: "todo.html",
      icon: {
        nodes: [
          {
            tag: "rect",
            attrs: { x: "5.25", y: "4.75", width: "13.5", height: "14.5", rx: "3" },
          },
          { tag: "path", attrs: { d: "M8.5 9.25h6.75" } },
          { tag: "path", attrs: { d: "M8.5 13h6.75" } },
          { tag: "path", attrs: { d: "M8.5 16.75h4.25" } },
          { tag: "path", attrs: { d: "M6.8 9.2h.01" } },
          { tag: "path", attrs: { d: "M6.8 12.95h.01" } },
          { tag: "path", attrs: { d: "M6.8 16.7h.01" } },
        ],
      },
    },
    {
      key: "diary",
      label: "日记",
      href: "diary.html",
      icon: {
        nodes: [
          {
            tag: "path",
            attrs: {
              d: "M7 4.75h7.25L18 8.5V19.25H7a2.25 2.25 0 0 1-2.25-2.25V7A2.25 2.25 0 0 1 7 4.75Z",
            },
          },
          { tag: "path", attrs: { d: "M14.25 4.75V8.5H18" } },
          { tag: "path", attrs: { d: "M8.5 12h6.5" } },
          { tag: "path", attrs: { d: "M8.5 15h4.5" } },
        ],
      },
    },
    {
      key: "settings",
      label: "设置",
      href: "settings.html",
      icon: {
        nodes: [
          {
            tag: "path",
            attrs: {
              d: "M12 8.7a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 0 0 0-6.6Z",
            },
          },
          {
            tag: "path",
            attrs: {
              d: "M19.15 13.1V10.9l-1.76-.46a5.83 5.83 0 0 0-.54-1.31l.95-1.56l-1.55-1.56l-1.57.95a5.86 5.86 0 0 0-1.3-.53L13.1 4.7h-2.2l-.46 1.73c-.46.12-.9.3-1.31.53l-1.56-.95L6.02 7.57l.95 1.56c-.23.41-.41.85-.53 1.31l-1.74.46v2.2l1.74.46c.12.46.3.9.53 1.31l-.95 1.56l1.55 1.56l1.56-.95c.41.23.85.41 1.31.53l.46 1.74h2.2l.46-1.74c.45-.12.89-.3 1.3-.53l1.57.95l1.55-1.56l-.95-1.56c.23-.41.42-.85.54-1.31Z",
            },
          },
        ],
      },
    },
  ];
  const DEFAULT_APP_NAV_ORDER = APP_NAV_ITEMS.map((item) => item.key);
  const APP_NAV_ITEM_KEY_SET = new Set(APP_NAV_ITEMS.map((item) => item.key));
  const APP_NAV_DEFAULT_AFTER_MAP = new Map(
    DEFAULT_APP_NAV_ORDER.map((pageKey, index) => [
      pageKey,
      index > 0 ? DEFAULT_APP_NAV_ORDER[index - 1] : "",
    ]),
  );
  const APP_PAGE_TRANSITION_SESSION_KEY = "controler:page-transition";
  const APP_PAGE_TRANSITION_DURATION_MS = 90;
  const RN_APP_PAGE_TRANSITION_ACK_TIMEOUT_MS = 260;
  const APP_PAGE_LEAVE_GUARD_OVERLAY_DELAY_MS = 120;
  const APP_PAGE_LEAVE_GUARD_SLOW_MESSAGE_DELAY_MS = 2500;
  const APP_PAGE_LEAVE_GUARD_LOADING_TITLE = "正在保存最新数据";
  const APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE =
    "请稍候，保存完成后会自动切换页面";
  const ANDROID_PRESS_FEEDBACK_SELECTOR = [
    "button",
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    '[role="button"]',
    ".app-nav-button",
    ".bts",
    ".time-quick-btn",
    ".todo-action-btn",
    ".record-action-btn",
    ".record-item",
    ".todo-item",
    ".project-item",
    ".project-option",
    ".tree-select-option",
    ".tree-select-button",
    ".calendar-day",
    ".plan-timeline-block",
    ".weekly-glass-time-block",
    ".controler-pressable",
    ".widget-action-card-button",
    ".widget-action-card",
    ".settings-collapse-toggle",
  ].join(", ");
  const ANDROID_PRESS_ACTIVE_CLASS = "is-android-press-active";
  const ANDROID_PRESS_ANIMATE_CLASS = "is-android-press-animate";
  const ANDROID_PRESS_ANIMATION_MS = 360;
  const ANDROID_TOUCH_PRESS_POINTER_ID = -101;
  const ANDROID_NAV_PRESS_MIN_ACTIVE_MS = 92;
  let modalHistoryObserver = null;
  let modalHistorySyncQueued = false;
  let blockingOverlaySyncQueued = false;
  let compactingModalHistory = false;
  let suppressModalPopClose = false;
  const trackedModalTokens = new Map();
  let lastReportedModalCount = -1;
  let lastReportedBlockingOverlayActive = null;
  let appNavigationInitialized = false;
  let appPageTransitionInitialized = false;
  let appPageTransitionLocked = false;
  let appPageLeavePreflightLocked = false;
  let deferredAppNavigationRequest = null;
  let nativeNavigationListenerBound = false;
  let nativeNavigationRequestCounter = 0;
  let pendingNativeNavigationRequest = null;
  let nativeNavigationRetryTimerId = 0;
  let blockingOverlayScrollLockState = null;
  let nativePageReadyReported = false;
  let nativePageReadyScheduled = false;
  let lastReportedAppNavigationStateSignature = "";
  let lastShellVisibilityStateSignature = "";
  let beforePageLeaveGuardCounter = 0;
  let androidPressFeedbackInitialized = false;
  let androidAppNavFocusSuppressionInitialized = false;
  const activeAndroidPressTargets = new Map();
  const beforePageLeaveGuards = new Map();
  const pendingAssetLoads = new Map();
  let appPageLeaveOverlayElement = null;
  let appPageLeaveOverlayController = null;
  const pagePerfStartTime =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const emittedPagePerfStages = new Set();
  const initialLaunchPerfContext = (() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return {
        launchSource: String(params.get("widgetSource") || "").trim(),
        widgetAction: String(params.get("widgetAction") || "").trim(),
        widgetKind: String(params.get("widgetKind") || "").trim(),
      };
    } catch (error) {
      return {
        launchSource: "",
        widgetAction: "",
        widgetKind: "",
      };
    }
  })();
  const shellVisibilityState = (() => {
    const initialState =
      window.__CONTROLER_SHELL_VISIBILITY__ &&
      typeof window.__CONTROLER_SHELL_VISIBILITY__ === "object"
        ? window.__CONTROLER_SHELL_VISIBILITY__
        : null;
    return {
      active: initialState?.active !== false,
      slot:
        typeof initialState?.slot === "string" ? initialState.slot.trim() : "",
      reason:
        typeof initialState?.reason === "string"
          ? initialState.reason.trim()
          : "initial",
      page:
        typeof initialState?.page === "string" ? initialState.page.trim() : "",
      href:
        typeof initialState?.href === "string" ? initialState.href.trim() : "",
      receivedAt:
        Number.isFinite(initialState?.receivedAt) && initialState.receivedAt > 0
          ? initialState.receivedAt
          : Date.now(),
    };
  })();

  function getLaunchPerfContext() {
    return {
      launchSource: initialLaunchPerfContext.launchSource || undefined,
      widgetAction: initialLaunchPerfContext.widgetAction || undefined,
      widgetKind: initialLaunchPerfContext.widgetKind || undefined,
    };
  }

  function resolveCurrentPagePerfKey() {
    const pathSegments = String(window.location.pathname || "").split("/");
    const tail = String(pathSegments[pathSegments.length - 1] || "").trim();
    return tail.replace(/\.html$/i, "") || "unknown";
  }

  function markPagePerfStage(stage, detail = {}) {
    const normalizedStage = String(stage || "").trim();
    if (!normalizedStage) {
      return;
    }
    const dedupeKey = `${resolveCurrentPagePerfKey()}:${normalizedStage}`;
    if (
      detail?.allowRepeat !== true &&
      emittedPagePerfStages.has(dedupeKey)
    ) {
      return;
    }
    emittedPagePerfStages.add(dedupeKey);

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const payload = {
      stage: normalizedStage,
      page: resolveCurrentPagePerfKey(),
      href: window.location.href,
      elapsedMs: Math.max(0, Math.round(now - pagePerfStartTime)),
      ...getLaunchPerfContext(),
      ...detail,
    };

    if (window.ControlerNativeBridge?.emitEvent) {
      window.ControlerNativeBridge.emitEvent("perf.metric", payload);
    }

    if (window.__CONTROLER_PERF_DEBUG__ === true) {
      console.debug("[controler-perf]", payload);
    }
  }

  function normalizeAssetUrl(assetUrl) {
    const rawUrl = String(assetUrl || "").trim();
    if (!rawUrl) {
      return "";
    }
    try {
      return new URL(rawUrl, window.location.href).toString();
    } catch (error) {
      return rawUrl;
    }
  }

  function loadScriptOnce(assetUrl, options = {}) {
    const normalizedUrl = normalizeAssetUrl(assetUrl);
    if (!normalizedUrl) {
      return Promise.reject(new Error("脚本地址为空"));
    }

    const cacheKey = `script:${normalizedUrl}`;
    if (pendingAssetLoads.has(cacheKey)) {
      return pendingAssetLoads.get(cacheKey);
    }

    const existing = Array.from(document.scripts).find(
      (script) => normalizeAssetUrl(script.getAttribute("src")) === normalizedUrl,
    );
    if (existing?.dataset?.controlerLoaded === "true") {
      return Promise.resolve(existing);
    }

    const loader = new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = normalizedUrl;
        script.async = true;
        script.dataset.controlerAssetKey = cacheKey;
        if (options.type === "module") {
          script.type = "module";
        }
      }

      const cleanup = () => {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      };

      const handleLoad = () => {
        cleanup();
        script.dataset.controlerLoaded = "true";
        resolve(script);
      };

      const handleError = () => {
        cleanup();
        pendingAssetLoads.delete(cacheKey);
        reject(new Error(`脚本加载失败: ${normalizedUrl}`));
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!existing) {
        document.head.appendChild(script);
      }
    });

    pendingAssetLoads.set(cacheKey, loader);
    return loader;
  }

  function loadStyleOnce(assetUrl) {
    const normalizedUrl = normalizeAssetUrl(assetUrl);
    if (!normalizedUrl) {
      return Promise.reject(new Error("样式地址为空"));
    }

    const cacheKey = `style:${normalizedUrl}`;
    if (pendingAssetLoads.has(cacheKey)) {
      return pendingAssetLoads.get(cacheKey);
    }

    const existing = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    ).find(
      (node) => normalizeAssetUrl(node.getAttribute("href")) === normalizedUrl,
    );
    if (existing?.dataset?.controlerLoaded === "true") {
      return Promise.resolve(existing);
    }

    const loader = new Promise((resolve, reject) => {
      const link = existing || document.createElement("link");
      if (!existing) {
        link.rel = "stylesheet";
        link.href = normalizedUrl;
        link.dataset.controlerAssetKey = cacheKey;
      }

      const cleanup = () => {
        link.removeEventListener("load", handleLoad);
        link.removeEventListener("error", handleError);
      };

      const handleLoad = () => {
        cleanup();
        link.dataset.controlerLoaded = "true";
        resolve(link);
      };

      const handleError = () => {
        cleanup();
        pendingAssetLoads.delete(cacheKey);
        reject(new Error(`样式加载失败: ${normalizedUrl}`));
      };

      link.addEventListener("load", handleLoad, { once: true });
      link.addEventListener("error", handleError, { once: true });

      if (!existing) {
        document.head.appendChild(link);
      }
    });

    pendingAssetLoads.set(cacheKey, loader);
    return loader;
  }

  function normalizeShellVisibilityState(detail = {}) {
    const source = detail && typeof detail === "object" ? detail : {};
    return {
      active: source.active !== false,
      slot: typeof source.slot === "string" ? source.slot.trim() : "",
      reason:
        typeof source.reason === "string" && source.reason.trim()
          ? source.reason.trim()
          : "unknown",
      page: typeof source.page === "string" ? source.page.trim() : "",
      href: typeof source.href === "string" ? source.href.trim() : "",
      receivedAt: Date.now(),
    };
  }

  function getShellVisibilityState() {
    return { ...shellVisibilityState };
  }

  function isShellPageActive() {
    return shellVisibilityState.active !== false;
  }

  function applyShellVisibilityState(detail = {}) {
    const nextState = normalizeShellVisibilityState(detail);
    const nextSignature = JSON.stringify({
      active: nextState.active,
      slot: nextState.slot,
      reason: nextState.reason,
      page: nextState.page,
      href: nextState.href,
    });
    if (nextSignature === lastShellVisibilityStateSignature) {
      return;
    }

    if (
      isReactNativeNavigationRuntime() &&
      shellVisibilityState.active !== nextState.active
    ) {
      resetAppPageTransitionRuntimeState({
        clearStoredState: false,
      });
    }

    lastShellVisibilityStateSignature = nextSignature;
    Object.assign(shellVisibilityState, nextState);
    window.__CONTROLER_SHELL_VISIBILITY__ = getShellVisibilityState();
    markPagePerfStage(
      nextState.active ? "hidden-page-resumed" : "hidden-page-paused",
      {
        allowRepeat: true,
        slot: nextState.slot || undefined,
        reason: nextState.reason || undefined,
        active: nextState.active,
      },
    );
    window.dispatchEvent(
      new CustomEvent(SHELL_VISIBILITY_EVENT_NAME, {
        detail: getShellVisibilityState(),
      }),
    );
  }

  function clearPendingNativeNavigationRequest() {
    if (!pendingNativeNavigationRequest) {
      return null;
    }
    const pendingRequest = pendingNativeNavigationRequest;
    pendingNativeNavigationRequest = null;
    if (pendingRequest.timeoutId) {
      window.clearTimeout(pendingRequest.timeoutId);
    }
    return pendingRequest;
  }

  function clearNativeNavigationRetryTimer() {
    if (nativeNavigationRetryTimerId) {
      window.clearTimeout(nativeNavigationRetryTimerId);
      nativeNavigationRetryTimerId = 0;
    }
  }

  function createDeferredAppNavigationRequest(targetItem, options = {}) {
    if (!targetItem || typeof targetItem !== "object") {
      return null;
    }
    const targetHref = normalizeAppNavigationHref(
      options.targetHref || targetItem.href,
    );
    if (!targetHref) {
      return null;
    }
    return {
      targetItem,
      targetHref,
      options: {
        ...options,
        targetHref,
        replaceHistory: options.replaceHistory === true,
      },
    };
  }

  function stashDeferredAppNavigationRequest(targetItem, options = {}) {
    const request = createDeferredAppNavigationRequest(targetItem, options);
    if (!request) {
      return null;
    }
    deferredAppNavigationRequest = request;
    return request;
  }

  function takeDeferredAppNavigationRequest(fallbackRequest = null) {
    if (deferredAppNavigationRequest) {
      const request = deferredAppNavigationRequest;
      deferredAppNavigationRequest = null;
      return request;
    }
    return fallbackRequest;
  }

  function clearDeferredAppNavigationRequest() {
    const pendingRequest = deferredAppNavigationRequest;
    deferredAppNavigationRequest = null;
    return pendingRequest;
  }

  function initNativeNavigationBridge() {
    if (nativeNavigationListenerBound) {
      return;
    }
    nativeNavigationListenerBound = true;
    window.addEventListener("controler:native-bridge-event", (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      if (detail.name === "ui.shell-visibility") {
        applyShellVisibilityState(detail);
        return;
      }
      if (detail.name !== "ui.navigate-ack") {
        return;
      }

      const requestId = String(detail.requestId || "").trim();
      if (
        !requestId ||
        !pendingNativeNavigationRequest ||
        pendingNativeNavigationRequest.requestId !== requestId
      ) {
        return;
      }

      const pendingRequest = clearPendingNativeNavigationRequest();
      if (!pendingRequest) {
        return;
      }

      resetAppPageTransitionRuntimeState({ clearStoredState: false });

      if (detail.accepted === false && detail.busy === true) {
        const retryTargetItem =
          pendingRequest.targetItem ||
          resolveAppNavigationItemByHref(pendingRequest.targetHref);
        if (retryTargetItem) {
          const retryDelayMs = Math.max(
            80,
            Number.isFinite(Number(detail.retryAfterMs))
              ? Number(detail.retryAfterMs)
              : 160,
          );
          clearNativeNavigationRetryTimer();
          nativeNavigationRetryTimerId = window.setTimeout(() => {
            nativeNavigationRetryTimerId = 0;
            startAppPageTransition(
              retryTargetItem,
              pendingRequest.options || {
                targetHref: pendingRequest.targetHref,
                replaceHistory: pendingRequest.replaceHistory === true,
              },
            );
          }, retryDelayMs);
          return;
        }
      }

      if (detail.accepted === false) {
        performAppNavigation(pendingRequest.targetHref, {
          replaceHistory: pendingRequest.replaceHistory === true,
        });
      }
    });
  }

  function reportNativePageReady() {
    const electronApi = window.electronAPI;
    const shouldReportToReactNative = isReactNativeNavigationRuntime();
    const shouldReportToElectron =
      !!electronApi?.isElectron && typeof electronApi.uiPageReady === "function";
    if (
      nativePageReadyReported ||
      (!shouldReportToReactNative && !shouldReportToElectron)
    ) {
      return;
    }
    nativePageReadyReported = true;
    markPagePerfStage("page-ready-emitted");
    if (shouldReportToReactNative) {
      window.ControlerNativeBridge?.emitEvent?.("ui.page-ready", {
        href: window.location.href,
        ...getLaunchPerfContext(),
      });
    }
    if (shouldReportToElectron) {
      electronApi.uiPageReady({
        href: window.location.href,
        page: resolveCurrentPagePerfKey(),
      });
    }
  }

  function getNativePageReadyMode() {
    return window.__CONTROLER_NATIVE_PAGE_READY_MODE__ === "manual"
      ? "manual"
      : "auto";
  }

  function setNativePageReadyMode(mode = "auto") {
    window.__CONTROLER_NATIVE_PAGE_READY_MODE__ =
      mode === "manual" ? "manual" : "auto";
  }

  function markNativePageReady() {
    reportNativePageReady();
  }

  function scheduleNativePageReadyReport() {
    if (
      nativePageReadyScheduled ||
      nativePageReadyReported ||
      getNativePageReadyMode() === "manual"
    ) {
      return;
    }

    nativePageReadyScheduled = true;
    const run = () => {
      if (nativePageReadyReported || getNativePageReadyMode() === "manual") {
        return;
      }
      const schedule =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16);
      schedule(() => {
        schedule(() => {
          reportNativePageReady();
        });
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, {
        once: true,
      });
    } else {
      run();
    }

    window.addEventListener(
      "load",
      () => {
        run();
      },
      { once: true },
    );
  }

  function scheduleInitialPagePerfReport() {
    const reportHtmlParsed = () => {
      markPagePerfStage("html-parsed");
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", reportHtmlParsed, {
        once: true,
      });
      return;
    }

    reportHtmlParsed();
  }

  function normalizeAppNavigationVisibilityState(rawState) {
    const source =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    const nextHiddenPages = Array.isArray(source.hiddenPages)
      ? source.hiddenPages.filter((pageKey, index, list) => {
          const normalizedKey = String(pageKey || "").trim();
          return (
            APP_NAV_ITEM_KEY_SET.has(normalizedKey) &&
            normalizedKey !== "settings" &&
            list.indexOf(pageKey) === index
          );
        })
      : [];
    const rawOrder = Array.isArray(source.order) ? source.order : [];
    const nextOrder = rawOrder
      .map((pageKey) => String(pageKey || "").trim())
      .filter(
        (pageKey, index, list) =>
          APP_NAV_ITEM_KEY_SET.has(pageKey) && list.indexOf(pageKey) === index,
      );

    DEFAULT_APP_NAV_ORDER.forEach((pageKey) => {
      if (nextOrder.includes(pageKey)) {
        return;
      }
      const previousDefaultPage = APP_NAV_DEFAULT_AFTER_MAP.get(pageKey) || "";
      const previousIndex = previousDefaultPage
        ? nextOrder.indexOf(previousDefaultPage)
        : -1;
      if (previousIndex >= 0) {
        nextOrder.splice(previousIndex + 1, 0, pageKey);
        return;
      }
      nextOrder.push(pageKey);
    });

    return {
      hiddenPages: nextHiddenPages,
      order: nextOrder,
    };
  }

  function loadAppNavigationVisibilityState() {
    try {
      const rawValue = localStorage.getItem(APP_NAV_VISIBILITY_STORAGE_KEY);
      if (!rawValue) {
        return normalizeAppNavigationVisibilityState(null);
      }
      return normalizeAppNavigationVisibilityState(JSON.parse(rawValue));
    } catch (error) {
      return normalizeAppNavigationVisibilityState(null);
    }
  }

  function getAppNavigationState() {
    const state = loadAppNavigationVisibilityState();
    return {
      hiddenPages: [...state.hiddenPages],
      order: [...state.order],
    };
  }

  function getHiddenAppNavigationPages() {
    return [...getAppNavigationState().hiddenPages];
  }

  function getOrderedAppNavigationPages() {
    return [...getAppNavigationState().order];
  }

  function reportNativeAppNavigationState(navigationState = null) {
    if (typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return;
    }

    const normalizedState = normalizeAppNavigationVisibilityState(navigationState);
    const signature = JSON.stringify({
      hiddenPages: normalizedState.hiddenPages,
      order: normalizedState.order,
    });
    if (signature === lastReportedAppNavigationStateSignature) {
      return;
    }

    lastReportedAppNavigationStateSignature = signature;
    window.ControlerNativeBridge.emitEvent("ui.navigation-visibility", {
      hiddenPages: [...normalizedState.hiddenPages],
      order: [...normalizedState.order],
    });
  }

  function createAppNavigationIcon(navItem) {
    const wrapper = document.createElement("span");
    wrapper.className = "app-nav-icon";
    wrapper.setAttribute("aria-hidden", "true");

    if (!navItem?.icon?.nodes?.length) {
      return wrapper;
    }

    const svg = document.createElementNS(APP_NAV_ICON_NS, "svg");
    svg.classList.add("app-nav-icon-svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    navItem.icon.nodes.forEach((nodeDefinition) => {
      if (!nodeDefinition?.tag) {
        return;
      }
      const node = document.createElementNS(APP_NAV_ICON_NS, nodeDefinition.tag);
      Object.entries(nodeDefinition.attrs || {}).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
      });
      svg.appendChild(node);
    });

    wrapper.appendChild(svg);
    return wrapper;
  }

  function isAppNavButtonElement(target) {
    return (
      target instanceof HTMLElement &&
      !!target.closest(".app-nav") &&
      target.hasAttribute("data-nav-page")
    );
  }

  function clearAndroidNavButtonFocus(target, immediate = false) {
    if (!isAndroidNativeRuntime() || !(target instanceof HTMLElement)) {
      return;
    }
    const run = () => {
      target.blur?.();
      if (document.activeElement === target) {
        document.body?.focus?.();
      }
    };
    if (immediate) {
      run();
      return;
    }
    window.setTimeout(run, 0);
  }

  function initAndroidAppNavFocusSuppression() {
    if (androidAppNavFocusSuppressionInitialized) {
      return;
    }
    androidAppNavFocusSuppressionInitialized = true;
    document.addEventListener(
      "focusin",
      (event) => {
        if (!isAppNavButtonElement(event.target)) {
          return;
        }
        clearAndroidNavButtonFocus(event.target, true);
      },
      true,
    );
  }

  function decorateAppNavigationButton(button, navItem, currentPageKey) {
    if (!(button instanceof HTMLElement) || !navItem) {
      return;
    }

    const labelText = String(button.textContent || navItem.label || "").trim() || navItem.label;
    const label = document.createElement("span");
    label.className = "app-nav-label";
    label.textContent = labelText;

    button.classList.add("app-nav-button");
    if (!button.dataset.navPressFeedbackBound) {
      button.dataset.navPressFeedbackBound = "true";
      const clearAndroidNavFocus = (event) => {
        clearAndroidNavButtonFocus(
          button,
          event?.type === "pointerdown" ||
            event?.type === "mousedown" ||
            event?.type === "touchstart" ||
            event?.type === "focusin",
        );
      };
      button.addEventListener("pointerdown", clearAndroidNavFocus, {
        passive: true,
      });
      button.addEventListener("mousedown", clearAndroidNavFocus, {
        passive: true,
      });
      button.addEventListener("touchstart", clearAndroidNavFocus, {
        passive: true,
      });
      button.addEventListener("focusin", clearAndroidNavFocus);
      button.addEventListener("pointerup", clearAndroidNavFocus, {
        passive: true,
      });
      button.addEventListener("pointercancel", clearAndroidNavFocus, {
        passive: true,
      });
      button.addEventListener("click", clearAndroidNavFocus, {
        passive: true,
      });
    }
    button.replaceChildren(createAppNavigationIcon(navItem), label);

    const isCurrentPage = navItem.key === currentPageKey;
    button.classList.toggle("is-current-page", isCurrentPage);
    if (isCurrentPage) {
      button.setAttribute("aria-current", "page");
      button.dataset.navCurrent = "true";
      return;
    }

    button.removeAttribute("aria-current");
    delete button.dataset.navCurrent;
  }

  function setAppNavigationState(nextState = {}) {
    const currentState = getAppNavigationState();
    const normalizedState = normalizeAppNavigationVisibilityState({
      hiddenPages:
        Array.isArray(nextState.hiddenPages) ? nextState.hiddenPages : currentState.hiddenPages,
      order: Array.isArray(nextState.order) ? nextState.order : currentState.order,
    });
    localStorage.setItem(
      APP_NAV_VISIBILITY_STORAGE_KEY,
      JSON.stringify(normalizedState),
    );
    window.dispatchEvent(
      new CustomEvent(APP_NAV_VISIBILITY_EVENT_NAME, {
        detail: {
          hiddenPages: [...normalizedState.hiddenPages],
          order: [...normalizedState.order],
        },
      }),
    );
    applyAppNavigationVisibility();
    reportNativeAppNavigationState(normalizedState);
    return normalizedState;
  }

  function setHiddenAppNavigationPages(hiddenPages = []) {
    return setAppNavigationState({
      hiddenPages,
    });
  }

  function setOrderedAppNavigationPages(order = []) {
    return setAppNavigationState({
      order,
    });
  }

  function applyAppNavigationVisibility(root = document) {
    if (!root?.querySelectorAll) {
      return;
    }

    const navigationState = getAppNavigationState();
    const hiddenPages = new Set(navigationState.hiddenPages);
    const order = navigationState.order;
    const currentPageKey = getCurrentAppNavigationItem()?.key || "";
    root.querySelectorAll(".app-nav").forEach((nav) => {
      const buttons = Array.from(nav.querySelectorAll("[data-nav-page]"));
      const buttonMap = new Map(
        buttons.map((button) => [
          String(button.dataset.navPage || "").trim(),
          button,
        ]),
      );
      order.forEach((pageKey) => {
        const button = buttonMap.get(pageKey);
        if (button) {
          nav.appendChild(button);
        }
      });
      buttons.forEach((button) => {
        if (button.parentElement === nav) {
          return;
        }
        nav.appendChild(button);
      });
      let visibleCount = 0;

      Array.from(nav.querySelectorAll("[data-nav-page]")).forEach((button) => {
        const pageKey = String(button.dataset.navPage || "").trim();
        const navItem = APP_NAV_ITEMS.find((item) => item.key === pageKey) || null;
        decorateAppNavigationButton(button, navItem, currentPageKey);
        const isHidden = hiddenPages.has(pageKey);
        button.hidden = isHidden;
        button.setAttribute("aria-hidden", isHidden ? "true" : "false");
        if (isHidden) {
          button.setAttribute("tabindex", "-1");
        } else {
          button.removeAttribute("tabindex");
          visibleCount += 1;
        }
      });

      const safeVisibleCount = Math.max(visibleCount, 1);
      nav.style.setProperty("--nav-visible-count", String(safeVisibleCount));
      nav.dataset.visibleCount = String(safeVisibleCount);
    });
  }

  function initAppNavigationVisibility() {
    if (appNavigationInitialized) {
      return;
    }
    appNavigationInitialized = true;
    initAndroidAppNavFocusSuppression();

    const syncNavigation = () => {
      const nextState = getAppNavigationState();
      applyAppNavigationVisibility();
      reportNativeAppNavigationState(nextState);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", syncNavigation, {
        once: true,
      });
    } else {
      syncNavigation();
    }

    window.addEventListener("storage", (event) => {
      if (
        !event ||
        event.key === null ||
        event.key === APP_NAV_VISIBILITY_STORAGE_KEY
      ) {
        syncNavigation();
      }
    });
    window.addEventListener(APP_NAV_VISIBILITY_EVENT_NAME, syncNavigation);
    window.addEventListener("controler:language-changed", syncNavigation);
    window.addEventListener("controler:storage-data-changed", syncNavigation);
    window.addEventListener("focus", syncNavigation);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncNavigation();
      }
    });
  }

  function isAndroidNativeRuntime() {
    return (
      document.documentElement.classList.contains("controler-android-native") ||
      document.body?.classList.contains("controler-android-native")
    );
  }

  function getNativeHostPlatform() {
    const platform = String(
      window.ControlerNativeBridge?.platform ||
        window.__CONTROLER_RN_META__?.platform ||
        "",
    )
      .trim()
      .toLowerCase();
    return platform === "android" || platform === "ios" ? platform : "";
  }

  function isReactNativeNavigationRuntime() {
    return !!getNativeHostPlatform();
  }

  function clearAppPageTransitionClasses() {
    const body = document.body;
    if (!(body instanceof HTMLElement)) {
      return;
    }
    body.classList.remove(
      "app-page-transition-enabled",
      "app-page-transition-enter",
      "app-page-transition-leave",
      "page-transition-active",
      "page-transition-direction-forward",
      "page-transition-direction-back",
    );
  }

  function resetAppPageTransitionRuntimeState(options = {}) {
    const clearStoredState = options.clearStoredState !== false;
    appPageTransitionLocked = false;
    appPageLeavePreflightLocked = false;
    clearDeferredAppNavigationRequest();
    clearAppPageTransitionClasses();
    clearPendingNativeNavigationRequest();
    clearNativeNavigationRetryTimer();
    if (clearStoredState) {
      clearAppPageTransitionState();
    }
  }

  function getCurrentAppNavigationItem() {
    let currentName = "index.html";
    try {
      const url = new URL(window.location.href);
      currentName = url.pathname.split("/").pop() || "index.html";
    } catch {}

    return (
      APP_NAV_ITEMS.find((item) => item.href === currentName) ||
      APP_NAV_ITEMS[0] ||
      null
    );
  }

  function getNavigationDirection(fromKey, toKey) {
    const fromIndex = APP_NAV_ITEMS.findIndex((item) => item.key === fromKey);
    const toIndex = APP_NAV_ITEMS.findIndex((item) => item.key === toKey);
    if (fromIndex < 0 || toIndex < 0) {
      return "forward";
    }
    return toIndex >= fromIndex ? "forward" : "back";
  }

  function writeAppPageTransitionState(payload) {
    try {
      sessionStorage.setItem(APP_PAGE_TRANSITION_SESSION_KEY, JSON.stringify(payload));
    } catch {}
  }

  function readAppPageTransitionState() {
    try {
      const raw = sessionStorage.getItem(APP_PAGE_TRANSITION_SESSION_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearAppPageTransitionState() {
    try {
      sessionStorage.removeItem(APP_PAGE_TRANSITION_SESSION_KEY);
    } catch {}
  }

  function normalizeAppNavigationHref(targetHref) {
    const rawHref = String(targetHref || "").trim();
    if (!rawHref) {
      return "";
    }
    try {
      const parsed = new URL(rawHref, window.location.href);
      const pageName = parsed.pathname.split("/").pop() || "";
      if (!pageName) {
        return rawHref;
      }
      return `${pageName}${parsed.search}${parsed.hash}`;
    } catch (error) {
      return rawHref;
    }
  }

  function resolveAppNavigationItemByHref(targetHref) {
    const normalizedHref = normalizeAppNavigationHref(targetHref);
    if (!normalizedHref) {
      return null;
    }
    const hrefWithoutHash = normalizedHref.split("#")[0] || normalizedHref;
    const pageName = hrefWithoutHash.split("?")[0] || hrefWithoutHash;
    return (
      APP_NAV_ITEMS.find((item) => item.href === pageName) ||
      null
    );
  }

  function createAppPageLeaveOverlayElement() {
    if (appPageLeaveOverlayElement instanceof HTMLElement) {
      return appPageLeaveOverlayElement;
    }
    const overlay = document.createElement("div");
    overlay.id = "controler-page-leave-overlay";
    overlay.className = "page-loading-overlay";
    overlay.dataset.mode = "fullscreen";
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="page-loading-card" role="status" aria-live="polite">
        <div class="page-loading-title" data-loading-title>${APP_PAGE_LEAVE_GUARD_LOADING_TITLE}</div>
        <div class="page-loading-message" data-loading-message>${APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE}</div>
      </div>
    `;
    if (document.body instanceof HTMLElement) {
      document.body.appendChild(overlay);
    }
    appPageLeaveOverlayElement = overlay;
    return overlay;
  }

  function getAppPageLeaveOverlayController() {
    if (appPageLeaveOverlayController) {
      return appPageLeaveOverlayController;
    }
    const overlay = createAppPageLeaveOverlayElement();
    appPageLeaveOverlayController = createPageLoadingOverlayController({
      overlay,
      inlineHost: document.body,
    });
    return appPageLeaveOverlayController;
  }

  function registerBeforePageLeave(handler, options = {}) {
    if (typeof handler !== "function") {
      return () => {};
    }
    const guardId = `guard_${Date.now()}_${(beforePageLeaveGuardCounter += 1)}`;
    beforePageLeaveGuards.set(guardId, {
      handler,
      options:
        options && typeof options === "object" && !Array.isArray(options)
          ? { ...options }
          : {},
    });
    return () => {
      beforePageLeaveGuards.delete(guardId);
    };
  }

  async function runBeforePageLeaveGuards(context = {}) {
    if (!beforePageLeaveGuards.size) {
      return true;
    }

    const guardEntries = Array.from(beforePageLeaveGuards.values()).map((entry) =>
      typeof entry === "function"
        ? {
            handler: entry,
            options: {},
          }
        : {
            handler: entry?.handler,
            options:
              entry?.options && typeof entry.options === "object"
                ? entry.options
                : {},
          },
    );
    const shouldShowOverlay = guardEntries.some(
      (entry) => entry?.options?.showLoadingOverlay !== false,
    );
    const overlayController = shouldShowOverlay
      ? getAppPageLeaveOverlayController()
      : null;
    overlayController?.setState({
      active: true,
      mode: "fullscreen",
      title: APP_PAGE_LEAVE_GUARD_LOADING_TITLE,
      message: APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE,
      delayMs: APP_PAGE_LEAVE_GUARD_OVERLAY_DELAY_MS,
    });

    let failure = null;
    let slowMessageTimerId = 0;
    try {
      if (shouldShowOverlay) {
        slowMessageTimerId = window.setTimeout(() => {
          overlayController?.setState({
            active: true,
            mode: "fullscreen",
            title: APP_PAGE_LEAVE_GUARD_LOADING_TITLE,
            message: APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE,
            delayMs: 0,
          });
        }, APP_PAGE_LEAVE_GUARD_SLOW_MESSAGE_DELAY_MS);
      }

      for (const entry of guardEntries) {
        if (typeof entry?.handler !== "function") {
          continue;
        }
        const guardResult = await entry.handler(context);
        if (guardResult === false) {
          throw new Error("当前页面的数据还没有准备好，暂时无法切换页面。");
        }
      }
    } catch (error) {
      failure =
        error instanceof Error
          ? error
          : new Error("当前页面的数据保存失败，未切换页面。");
      console.error("页面切换前执行保存守卫失败:", failure);
    } finally {
      if (slowMessageTimerId) {
        window.clearTimeout(slowMessageTimerId);
      }
      overlayController?.setState({
        active: false,
        mode: "fullscreen",
      });
    }

    if (!failure) {
      return true;
    }

    await alertDialog({
      title: "保存失败，未切换页面",
      message:
        typeof failure.message === "string" && failure.message.trim()
          ? failure.message.trim()
          : "当前页面的数据保存失败，未切换页面。",
      confirmText: "知道了",
      danger: true,
    }).catch(() => {});
    return false;
  }

  function performAppNavigation(targetHref, options = {}) {
    const normalizedHref = normalizeAppNavigationHref(targetHref);
    if (!normalizedHref) {
      return false;
    }
    if (options.replaceHistory === true) {
      window.location.replace(normalizedHref);
      return true;
    }
    window.location.href = normalizedHref;
    return true;
  }

  function applyAppPageEnterTransition() {
    resetAppPageTransitionRuntimeState({ clearStoredState: false });
    clearAppPageTransitionState();
  }

  function startAppPageTransition(targetItem, options = {}) {
    clearAndroidNavButtonFocus(document.activeElement, true);
    clearNativeNavigationRetryTimer();
    const nativeNavigationRuntime = isReactNativeNavigationRuntime();
    const androidWebTransitionRuntime =
      !nativeNavigationRuntime && isAndroidNativeRuntime();
    const navigationRequest = createDeferredAppNavigationRequest(
      targetItem,
      options,
    );
    if (!targetItem) {
      return false;
    }
    if (!navigationRequest) {
      return false;
    }
    if (appPageLeavePreflightLocked) {
      stashDeferredAppNavigationRequest(targetItem, options);
      return true;
    }
    if (androidWebTransitionRuntime && appPageTransitionLocked) {
      stashDeferredAppNavigationRequest(targetItem, options);
      return true;
    }

    const currentItem = getCurrentAppNavigationItem();
    const targetHref = navigationRequest.targetHref;
    if (!targetHref) {
      return false;
    }

    const currentHref = normalizeAppNavigationHref(window.location.href);
    if (
      currentItem?.key === targetItem.key &&
      currentHref === targetHref
    ) {
      resetAppPageTransitionRuntimeState();
      return true;
    }

    appPageTransitionLocked = true;
    appPageLeavePreflightLocked = true;
    void (async () => {
      let shouldUnlock = true;
      try {
        const canLeave = await runBeforePageLeaveGuards({
          fromPage: currentItem?.key || "",
          toPage: targetItem.key,
          targetHref,
        });
        if (!canLeave) {
          resetAppPageTransitionRuntimeState();
          return;
        }

        const resolvedNavigationRequest =
          takeDeferredAppNavigationRequest(navigationRequest) ||
          navigationRequest;
        const finalTargetItem = resolvedNavigationRequest.targetItem;
        const finalTargetHref = resolvedNavigationRequest.targetHref;
        const finalNavigationOptions = resolvedNavigationRequest.options || {};
        if (
          currentItem?.key === finalTargetItem.key &&
          currentHref === finalTargetHref
        ) {
          resetAppPageTransitionRuntimeState();
          return;
        }

        if (nativeNavigationRuntime) {
          resetAppPageTransitionRuntimeState();
          appPageTransitionLocked = true;
          appPageLeavePreflightLocked = true;
          initNativeNavigationBridge();
          const direction = getNavigationDirection(
            currentItem?.key || "",
            finalTargetItem.key,
          );
          const requestId = `nav_${Date.now()}_${(nativeNavigationRequestCounter += 1)}`;
          const requested = window.ControlerNativeBridge?.emitEvent?.(
            "ui.navigate",
            {
              page: finalTargetItem.key,
              href: finalTargetHref,
              direction,
              requestId,
            },
          );
          if (!requested) {
            shouldUnlock = false;
            performAppNavigation(finalTargetHref, finalNavigationOptions);
            return;
          }
          pendingNativeNavigationRequest = {
            requestId,
            targetItem: finalTargetItem,
            targetHref: finalTargetHref,
            replaceHistory: finalNavigationOptions.replaceHistory === true,
            options: finalNavigationOptions,
            timeoutId: window.setTimeout(() => {
              if (
                !pendingNativeNavigationRequest ||
                pendingNativeNavigationRequest.requestId !== requestId
              ) {
                return;
              }
              clearPendingNativeNavigationRequest();
              performAppNavigation(finalTargetHref, finalNavigationOptions);
            }, RN_APP_PAGE_TRANSITION_ACK_TIMEOUT_MS),
          };
          shouldUnlock = false;
          return;
        }

        resetAppPageTransitionRuntimeState();
        appPageTransitionLocked = true;
        appPageLeavePreflightLocked = true;
        shouldUnlock = false;
        performAppNavigation(finalTargetHref, finalNavigationOptions);
      } catch (error) {
        console.error("执行页面切换失败:", error);
        resetAppPageTransitionRuntimeState();
      } finally {
        if (shouldUnlock) {
          resetAppPageTransitionRuntimeState();
        }
      }
    })();
    return true;
  }

  function navigateAppPage(pageKey) {
    const normalizedKey = String(pageKey || "").trim();
    const targetItem = APP_NAV_ITEMS.find((item) => item.key === normalizedKey);
    if (!targetItem) {
      return false;
    }
    clearAndroidNavButtonFocus(document.activeElement, true);
    return startAppPageTransition(targetItem);
  }

  function navigateAppHref(targetHref, options = {}) {
    const targetItem = resolveAppNavigationItemByHref(targetHref);
    if (!targetItem) {
      return false;
    }
    clearAndroidNavButtonFocus(document.activeElement, true);
    return startAppPageTransition(targetItem, {
      ...options,
      targetHref,
    });
  }

  function initAppPageTransitions() {
    if (appPageTransitionInitialized) {
      return;
    }
    appPageTransitionInitialized = true;

    const bind = () => {
      applyAppPageEnterTransition();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
      bind();
    }
  }

  function getAndroidPressFeedbackTarget(target) {
    if (!isAndroidNativeRuntime() || !(target instanceof Element)) {
      return null;
    }
    const matchedTarget = target.closest(ANDROID_PRESS_FEEDBACK_SELECTOR);
    if (
      !(matchedTarget instanceof HTMLElement) ||
      matchedTarget.matches(":disabled, [aria-disabled='true']")
    ) {
      return null;
    }
    return matchedTarget;
  }

  function clearAndroidPressAnimation(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (typeof target.__controlerAndroidPressTimerId === "number") {
      window.clearTimeout(target.__controlerAndroidPressTimerId);
    }
    target.__controlerAndroidPressTimerId = 0;
    target.classList.remove(ANDROID_PRESS_ANIMATE_CLASS);
  }

  function clearAndroidPressReleaseTimer(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (typeof target.__controlerAndroidPressReleaseTimerId === "number") {
      window.clearTimeout(target.__controlerAndroidPressReleaseTimerId);
    }
    target.__controlerAndroidPressReleaseTimerId = 0;
  }

  function blurAndroidPressTarget(target) {
    if (!(target instanceof HTMLElement) || !isAndroidNativeRuntime()) {
      return;
    }
    window.setTimeout(() => {
      target.blur?.();
    }, 0);
  }

  function setAndroidPressActiveTarget(pointerId, target) {
    const normalizedPointerId = Number.isFinite(pointerId) ? pointerId : -1;
    const previousTarget = activeAndroidPressTargets.get(normalizedPointerId);
    if (previousTarget && previousTarget !== target) {
      previousTarget.classList.remove(ANDROID_PRESS_ACTIVE_CLASS);
    }
    if (!(target instanceof HTMLElement)) {
      activeAndroidPressTargets.delete(normalizedPointerId);
      return;
    }
    clearAndroidPressReleaseTimer(target);
    if (!target.classList.contains(ANDROID_PRESS_ACTIVE_CLASS)) {
      target.__controlerAndroidPressActiveSince = Date.now();
    }
    target.classList.add(ANDROID_PRESS_ACTIVE_CLASS);
    activeAndroidPressTargets.set(normalizedPointerId, target);
  }

  function getAndroidPressTargetRefCount(target) {
    let refCount = 0;
    activeAndroidPressTargets.forEach((activeTarget) => {
      if (activeTarget === target) {
        refCount += 1;
      }
    });
    return refCount;
  }

  function shouldApplyAndroidPressMinimum(target) {
    return (
      target instanceof HTMLElement &&
      !!target.closest(".app-nav") &&
      (target.classList.contains("app-nav-button") ||
        target.classList.contains("bts") ||
        target.hasAttribute("data-nav-page"))
    );
  }

  function clearAndroidPressTargetNow(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    clearAndroidPressReleaseTimer(target);
    target.classList.remove(ANDROID_PRESS_ACTIVE_CLASS);
    blurAndroidPressTarget(target);
  }

  function clearAndroidPressActiveTarget(pointerId, options = {}) {
    const { immediate = false } = options;
    const normalizedPointerId = Number.isFinite(pointerId) ? pointerId : -1;
    const activeTarget = activeAndroidPressTargets.get(normalizedPointerId);
    if (!(activeTarget instanceof HTMLElement)) {
      activeAndroidPressTargets.delete(normalizedPointerId);
      return null;
    }
    activeAndroidPressTargets.delete(normalizedPointerId);

    if (getAndroidPressTargetRefCount(activeTarget) > 0) {
      return activeTarget;
    }

    const minVisibleMs = shouldApplyAndroidPressMinimum(activeTarget)
      ? ANDROID_NAV_PRESS_MIN_ACTIVE_MS
      : 0;
    const activeSince = Number(activeTarget.__controlerAndroidPressActiveSince) || 0;
    const remainingVisibleMs =
      immediate || minVisibleMs <= 0
        ? 0
        : Math.max(minVisibleMs - (Date.now() - activeSince), 0);

    clearAndroidPressReleaseTimer(activeTarget);
    if (remainingVisibleMs > 0) {
      activeTarget.__controlerAndroidPressReleaseTimerId = window.setTimeout(() => {
        if (getAndroidPressTargetRefCount(activeTarget) > 0) {
          return;
        }
        clearAndroidPressTargetNow(activeTarget);
      }, remainingVisibleMs);
      return activeTarget;
    }

    clearAndroidPressTargetNow(activeTarget);
    return activeTarget;
  }

  function triggerAndroidPressAnimation(target) {
    if (!(target instanceof HTMLElement) || !isAndroidNativeRuntime()) {
      return;
    }
    clearAndroidPressAnimation(target);
    // Force a reflow so repeated taps can restart the ripple animation cleanly.
    void target.offsetWidth;
    target.classList.add(ANDROID_PRESS_ANIMATE_CLASS);
    target.__controlerAndroidPressTimerId = window.setTimeout(() => {
      target.classList.remove(ANDROID_PRESS_ANIMATE_CLASS);
      target.__controlerAndroidPressTimerId = 0;
    }, ANDROID_PRESS_ANIMATION_MS);
  }

  function initAndroidPressFeedback() {
    if (androidPressFeedbackInitialized) {
      return;
    }
    androidPressFeedbackInitialized = true;
  }

  function reportNativeModalState(visibleCount) {
    if (lastReportedModalCount === visibleCount) {
      return;
    }
    lastReportedModalCount = visibleCount;
    window.ControlerNativeBridge?.emitEvent?.("ui.modal-state", {
      modalCount: visibleCount,
      hasOpenModal: visibleCount > 0,
    });
  }

  function isCompactGestureLayout() {
    return (
      typeof window !== "undefined" &&
      window.innerWidth <= MODAL_GESTURE_MAX_WIDTH
    );
  }

  function shouldIgnoreModalEdgeSwipeStart(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return !!target.closest(
      [
        "input",
        "textarea",
        "select",
        "button",
        "label",
        "a[href]",
        "[contenteditable]:not([contenteditable='false'])",
        "[data-controler-disable-edge-swipe='true']",
      ].join(", "),
    );
  }

  function isVisibleOverlayElement(element, className) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (!element.classList.contains(className) || !element.isConnected) {
      return false;
    }

    const computed = window.getComputedStyle(element);
    return (
      computed.display !== "none" &&
      computed.visibility !== "hidden" &&
      !element.hasAttribute("hidden")
    );
  }

  function isVisibleModalOverlay(modal) {
    return isVisibleOverlayElement(modal, "modal-overlay");
  }

  function getVisibleModalOverlays() {
    if (typeof document === "undefined") {
      return [];
    }
    return Array.from(document.querySelectorAll(".modal-overlay")).filter(
      (modal) => isVisibleModalOverlay(modal),
    );
  }

  function getTopVisibleModal() {
    const visibleModals = getVisibleModalOverlays();
    return visibleModals[visibleModals.length - 1] || null;
  }

  function isVisibleBlockingLoadingOverlay(overlay) {
    if (!isVisibleOverlayElement(overlay, "page-loading-overlay")) {
      return false;
    }
    return String(overlay.dataset.mode || "").trim() === "fullscreen";
  }

  function hasOverlaySelectorMatch(node, selector) {
    return (
      node instanceof Element &&
      !!(node.matches?.(selector) || node.querySelector?.(selector))
    );
  }

  function nodeContainsModalOverlay(node) {
    return hasOverlaySelectorMatch(node, ".modal-overlay");
  }

  function nodeContainsBlockingOverlay(node) {
    return hasOverlaySelectorMatch(node, ".modal-overlay, .page-loading-overlay");
  }

  function didMutationAffectModalState(mutations = []) {
    return mutations.some((mutation) => {
      if (!mutation) {
        return false;
      }

      if (mutation.type === "attributes") {
        return (
          mutation.target instanceof HTMLElement &&
          mutation.target.classList.contains("modal-overlay")
        );
      }

      if (mutation.type !== "childList") {
        return false;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        nodeContainsModalOverlay(node),
      );
    });
  }

  function didMutationAffectBlockingOverlayState(mutations = []) {
    return mutations.some((mutation) => {
      if (!mutation) {
        return false;
      }

      if (mutation.type === "attributes") {
        return (
          mutation.target instanceof HTMLElement &&
          (mutation.target.classList.contains("modal-overlay") ||
            mutation.target.classList.contains("page-loading-overlay"))
        );
      }

      if (mutation.type !== "childList") {
        return false;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        nodeContainsBlockingOverlay(node),
      );
    });
  }

  function hasVisibleBlockingOverlay() {
    if (typeof document === "undefined") {
      return false;
    }

    if (getVisibleModalOverlays().length > 0) {
      return true;
    }

    return Array.from(document.querySelectorAll(".page-loading-overlay")).some(
      (overlay) => isVisibleBlockingLoadingOverlay(overlay),
    );
  }

  function syncBlockingOverlayState() {
    blockingOverlaySyncQueued = false;
    const root = document.documentElement;
    const body = document.body;
    const active = hasVisibleBlockingOverlay();
    applyBlockingOverlayScrollLock(active);
    root?.classList.toggle("controler-blocking-overlay-active", active);
    body?.classList.toggle("controler-blocking-overlay-active", active);
    if (lastReportedBlockingOverlayActive !== active) {
      lastReportedBlockingOverlayActive = active;
      window.dispatchEvent(
        new CustomEvent(BLOCKING_OVERLAY_STATE_EVENT_NAME, {
          detail: {
            active,
            modalCount: getVisibleModalOverlays().length,
            hasOpenModal: getVisibleModalOverlays().length > 0,
          },
        }),
      );
    }
  }

  function scheduleBlockingOverlaySync() {
    if (blockingOverlaySyncQueued) {
      return;
    }
    blockingOverlaySyncQueued = true;

    const schedule =
      typeof queueMicrotask === "function"
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);

    schedule(syncBlockingOverlayState);
  }

  function applyBlockingOverlayScrollLock(active) {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) {
      return;
    }

    if (active) {
      if (blockingOverlayScrollLockState) {
        return;
      }

      const scrollTop = Math.max(
        window.scrollY || window.pageYOffset || root.scrollTop || body.scrollTop || 0,
        0,
      );
      blockingOverlayScrollLockState = {
        scrollTop,
        rootOverflow: root.style.overflow,
        rootOverscrollBehavior: root.style.overscrollBehavior,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyLeft: body.style.left,
        bodyRight: body.style.right,
        bodyWidth: body.style.width,
        bodyTouchAction: body.style.touchAction,
      };
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollTop}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.touchAction = "none";
      root.classList.add("controler-scroll-locked");
      body.classList.add("controler-scroll-locked");
      return;
    }

    if (!blockingOverlayScrollLockState) {
      return;
    }

    const {
      scrollTop,
      rootOverflow,
      rootOverscrollBehavior,
      bodyOverflow,
      bodyPosition,
      bodyTop,
      bodyLeft,
      bodyRight,
      bodyWidth,
      bodyTouchAction,
    } = blockingOverlayScrollLockState;
    blockingOverlayScrollLockState = null;
    root.style.overflow = rootOverflow || "";
    root.style.overscrollBehavior = rootOverscrollBehavior || "";
    body.style.overflow = bodyOverflow || "";
    body.style.position = bodyPosition || "";
    body.style.top = bodyTop || "";
    body.style.left = bodyLeft || "";
    body.style.right = bodyRight || "";
    body.style.width = bodyWidth || "";
    body.style.touchAction = bodyTouchAction || "";
    root.classList.remove("controler-scroll-locked");
    body.classList.remove("controler-scroll-locked");
    window.scrollTo(0, Math.max(0, Number(scrollTop) || 0));
  }

  function buildModalHistoryState(token) {
    const baseState =
      history.state && typeof history.state === "object" ? history.state : {};
    return {
      ...baseState,
      __controlerModalToken: token,
    };
  }

  function syncVisibleModalBackdropState(visibleModals = []) {
    visibleModals.forEach((modal, index) => {
      if (!(modal instanceof HTMLElement)) {
        return;
      }
      modal.dataset.controlerBackdropVisible = index === 0 ? "true" : "false";
    });
  }

  function syncModalHistoryState() {
    modalHistorySyncQueued = false;
    if (
      typeof document === "undefined" ||
      typeof history === "undefined" ||
      typeof history.pushState !== "function"
    ) {
      trackedModalTokens.clear();
      return;
    }

    const visibleModals = getVisibleModalOverlays();
    syncVisibleModalBackdropState(visibleModals);
    reportNativeModalState(visibleModals.length);

    visibleModals.forEach((modal) => {
      if (trackedModalTokens.has(modal)) {
        return;
      }

      const token = `controler-modal-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      trackedModalTokens.set(modal, token);
      modal.dataset.controlerModalToken = token;

      if (isCompactGestureLayout()) {
        history.pushState(buildModalHistoryState(token), "");
      }
    });

    const trackedModals = Array.from(trackedModalTokens.keys());
    for (let index = trackedModals.length - 1; index >= 0; index -= 1) {
      const modal = trackedModals[index];
      if (visibleModals.includes(modal)) {
        continue;
      }

      const token = trackedModalTokens.get(modal);
      trackedModalTokens.delete(modal);

      if (
        suppressModalPopClose ||
        compactingModalHistory ||
        !isCompactGestureLayout()
      ) {
        continue;
      }

      if (history.state?.__controlerModalToken === token) {
        compactingModalHistory = true;
        history.back();
        setTimeout(() => {
          compactingModalHistory = false;
        }, 0);
      }
    }
  }

  function scheduleModalHistorySync() {
    if (modalHistorySyncQueued) {
      return;
    }
    modalHistorySyncQueued = true;

    const schedule =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 0);

    schedule(syncModalHistoryState);
  }

  function initModalHistoryObserver() {
    if (
      typeof document === "undefined" ||
      (modalHistoryObserver && document.body)
    ) {
      return;
    }

    const bind = () => {
      if (!document.body || modalHistoryObserver) {
        return;
      }

      modalHistoryObserver = new MutationObserver((mutations) => {
        if (didMutationAffectBlockingOverlayState(mutations)) {
          scheduleBlockingOverlaySync();
        }
        if (didMutationAffectModalState(mutations)) {
          scheduleModalHistorySync();
        }
      });
      modalHistoryObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "data-mode"],
      });

      window.addEventListener("popstate", () => {
        if (!isCompactGestureLayout()) {
          return;
        }
        if (compactingModalHistory) {
          compactingModalHistory = false;
          return;
        }

        const topModal = getTopVisibleModal();
        if (!topModal) {
          return;
        }

        suppressModalPopClose = true;
        if (topModal.parentNode) {
          topModal.parentNode.removeChild(topModal);
        }
        setTimeout(() => {
          suppressModalPopClose = false;
          scheduleModalHistorySync();
        }, 0);
      });

      let edgeSwipeState = {
        tracking: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        startTime: 0,
        lastTime: 0,
        modal: null,
      };

      document.addEventListener(
        "touchstart",
        (event) => {
          if (!isCompactGestureLayout() || event.touches.length !== 1) {
            edgeSwipeState.tracking = false;
            return;
          }

          const topModal = getTopVisibleModal();
          if (!topModal) {
            edgeSwipeState.tracking = false;
            return;
          }

          const touch = event.touches[0];
          if (touch.clientX > MODAL_EDGE_SWIPE_TRIGGER) {
            edgeSwipeState.tracking = false;
            return;
          }

          if (
            !(event.target instanceof Element) ||
            !topModal.contains(event.target) ||
            shouldIgnoreModalEdgeSwipeStart(event.target)
          ) {
            edgeSwipeState.tracking = false;
            return;
          }

          edgeSwipeState = {
            tracking: true,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            startTime: event.timeStamp || Date.now(),
            lastTime: event.timeStamp || Date.now(),
            modal: topModal,
          };
          updateModalEdgeSwipePresentation(topModal, 0);
        },
        { passive: true },
      );

      document.addEventListener(
        "touchmove",
        (event) => {
          if (!edgeSwipeState.tracking || event.touches.length !== 1) {
            return;
          }

          const touch = event.touches[0];
          edgeSwipeState.lastX = touch.clientX;
          edgeSwipeState.lastY = touch.clientY;
          edgeSwipeState.lastTime = event.timeStamp || Date.now();

          const deltaX = touch.clientX - edgeSwipeState.startX;
          const deltaY = touch.clientY - edgeSwipeState.startY;
          if (
            Math.abs(deltaY) > MODAL_EDGE_SWIPE_VERTICAL_TOLERANCE &&
            Math.abs(deltaY) > Math.abs(deltaX)
          ) {
            const targetModal = edgeSwipeState.modal;
            edgeSwipeState.tracking = false;
            edgeSwipeState.modal = null;
            if (targetModal) {
              resetModalEdgeSwipePresentation(targetModal);
            }
            return;
          }

          if (
            deltaX > 0 &&
            Math.abs(deltaY) <= MODAL_EDGE_SWIPE_VERTICAL_TOLERANCE
          ) {
            updateModalEdgeSwipePresentation(edgeSwipeState.modal, deltaX);
          }

          if (
            deltaX > 6 &&
            Math.abs(deltaY) <= MODAL_EDGE_SWIPE_VERTICAL_TOLERANCE &&
            event.cancelable
          ) {
            event.preventDefault();
          }
        },
        { passive: false },
      );

      const finalizeEdgeSwipe = (event = null) => {
        if (!edgeSwipeState.tracking) {
          return;
        }

        if (event?.changedTouches?.length) {
          const touch = event.changedTouches[0];
          edgeSwipeState.lastX = touch.clientX;
          edgeSwipeState.lastY = touch.clientY;
        }
        edgeSwipeState.lastTime =
          event?.timeStamp || edgeSwipeState.lastTime || Date.now();

        const deltaX = edgeSwipeState.lastX - edgeSwipeState.startX;
        const deltaY = edgeSwipeState.lastY - edgeSwipeState.startY;
        const elapsedMs = Math.max(
          edgeSwipeState.lastTime - edgeSwipeState.startTime,
          1,
        );
        const velocityX = deltaX / elapsedMs;
        const targetModal = edgeSwipeState.modal;
        const closeDistance = getModalEdgeSwipeCloseDistance(targetModal);
        edgeSwipeState.tracking = false;
        edgeSwipeState.modal = null;

        if (
          (
            deltaX >= closeDistance ||
            (deltaX >= MODAL_EDGE_SWIPE_FLING_CLOSE_DISTANCE &&
              velocityX >= MODAL_EDGE_SWIPE_CLOSE_VELOCITY)
          ) &&
          Math.abs(deltaY) <= MODAL_EDGE_SWIPE_VERTICAL_TOLERANCE &&
          targetModal
        ) {
          closeModal(targetModal);
          return;
        }

        if (targetModal) {
          resetModalEdgeSwipePresentation(targetModal, {
            animate: deltaX > 0,
          });
        }
      };

      document.addEventListener("touchend", finalizeEdgeSwipe, {
        passive: true,
      });
      document.addEventListener("touchcancel", () => {
        const targetModal = edgeSwipeState.modal;
        const shouldAnimate = edgeSwipeState.lastX > edgeSwipeState.startX;
        edgeSwipeState.tracking = false;
        edgeSwipeState.modal = null;
        if (targetModal) {
          resetModalEdgeSwipePresentation(targetModal, {
            animate: shouldAnimate,
          });
        }
      });

      scheduleModalHistorySync();
      scheduleBlockingOverlaySync();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
      return;
    }
    bind();
  }

  function positionFloatingMenu(anchor, menu, options = {}) {
    if (!(anchor instanceof Element) || !(menu instanceof HTMLElement)) {
      return;
    }

    const {
      preferredWidth = 280,
      minWidth = 0,
      maxWidth = 380,
      viewportPadding = 16,
    } = options;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth || 0, rect.width);
    const safeMinWidth = Math.max(rect.width, minWidth);
    const safeMaxWidth = Math.max(
      safeMinWidth,
      Math.min(maxWidth, viewportWidth - viewportPadding * 2),
    );

    let targetWidth = Math.max(safeMinWidth, preferredWidth);
    targetWidth = Math.min(targetWidth, safeMaxWidth);

    const fitsRight = rect.left + targetWidth <= viewportWidth - viewportPadding;
    const availableRight = viewportWidth - rect.left - viewportPadding;
    const availableLeft = rect.right - viewportPadding;

    if (!fitsRight && availableLeft >= safeMinWidth) {
      menu.style.left = "auto";
      menu.style.right = "0";
      targetWidth = Math.min(targetWidth, availableLeft);
    } else {
      menu.style.left = "0";
      menu.style.right = "auto";
      targetWidth = Math.min(targetWidth, availableRight);
    }

    const finalWidth = Math.max(safeMinWidth, targetWidth);
    menu.style.width = `${finalWidth}px`;
    menu.style.minWidth = `${safeMinWidth}px`;
    menu.style.maxWidth = `${Math.max(finalWidth, safeMinWidth)}px`;
  }

  function createFrameScheduler(callback, options = {}) {
    if (typeof callback !== "function") {
      return {
        schedule() {},
        flush() {},
        cancel() {},
      };
    }

    const {
      delay = 0,
      frame:
        scheduleFrame =
          typeof window !== "undefined" &&
          typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (task) => window.setTimeout(task, 16),
      cancelFrame:
        cancelScheduledFrame =
          typeof window !== "undefined" &&
          typeof window.cancelAnimationFrame === "function"
            ? window.cancelAnimationFrame.bind(window)
            : (taskId) => window.clearTimeout(taskId),
    } = options;

    let frameId = null;
    let timerId = null;

    const clearPending = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      if (frameId !== null) {
        cancelScheduledFrame(frameId);
        frameId = null;
      }
    };

    const run = () => {
      frameId = null;
      timerId = null;
      callback();
    };

    const queueFrame = () => {
      if (frameId !== null) {
        return;
      }
      frameId = scheduleFrame(run);
    };

    return {
      schedule() {
        if (frameId !== null || timerId !== null) {
          return;
        }
        if (delay > 0) {
          timerId = window.setTimeout(() => {
            timerId = null;
            queueFrame();
          }, delay);
          return;
        }
        queueFrame();
      },
      flush() {
        clearPending();
        callback();
      },
      cancel() {
        clearPending();
      },
    };
  }

  function normalizeChangedSections(changedSections = []) {
    return Array.from(
      new Set(
        (Array.isArray(changedSections) ? changedSections : [])
          .map((section) => String(section || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function normalizePeriodIdList(periodIds = []) {
    return Array.from(
      new Set(
        (Array.isArray(periodIds) ? periodIds : [])
          .map((periodId) => String(periodId || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function hasPeriodOverlap(changedPeriodIds = [], currentPeriodIds = []) {
    const normalizedChanged = normalizePeriodIdList(changedPeriodIds);
    const normalizedCurrent = normalizePeriodIdList(currentPeriodIds);
    if (!normalizedChanged.length || !normalizedCurrent.length) {
      return true;
    }
    const currentSet = new Set(normalizedCurrent);
    return normalizedChanged.some((periodId) => currentSet.has(periodId));
  }

  function isSerializableEqual(left, right) {
    if (left === right) {
      return true;
    }
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch (error) {
      return false;
    }
  }

  function mergeDeferredRefreshPayload(currentPayload = null, incomingPayload = {}) {
    const current =
      currentPayload && typeof currentPayload === "object" ? currentPayload : {};
    const incoming =
      incomingPayload && typeof incomingPayload === "object" ? incomingPayload : {};
    const nextChangedPeriods = {
      ...(current.changedPeriods &&
      typeof current.changedPeriods === "object" &&
      !Array.isArray(current.changedPeriods)
        ? current.changedPeriods
        : {}),
    };
    const incomingChangedPeriods =
      incoming.changedPeriods &&
      typeof incoming.changedPeriods === "object" &&
      !Array.isArray(incoming.changedPeriods)
        ? incoming.changedPeriods
        : {};

    Object.keys(incomingChangedPeriods).forEach((section) => {
      nextChangedPeriods[section] = normalizePeriodIdList([
        ...(Array.isArray(nextChangedPeriods[section]) ? nextChangedPeriods[section] : []),
        ...(Array.isArray(incomingChangedPeriods[section])
          ? incomingChangedPeriods[section]
          : []),
      ]);
    });

    return {
      eventCount: Math.max(0, Number(current.eventCount) || 0) + 1,
      reason:
        typeof incoming.reason === "string" && incoming.reason.trim()
          ? incoming.reason.trim()
          : current.reason || "",
      source:
        typeof incoming.source === "string" && incoming.source.trim()
          ? incoming.source.trim()
          : current.source || "",
      changedSections: normalizeChangedSections([
        ...(Array.isArray(current.changedSections) ? current.changedSections : []),
        ...(Array.isArray(incoming.changedSections) ? incoming.changedSections : []),
      ]),
      changedPeriods: nextChangedPeriods,
      data:
        Object.prototype.hasOwnProperty.call(incoming, "data")
          ? incoming.data
          : current.data ?? null,
      status:
        Object.prototype.hasOwnProperty.call(incoming, "status")
          ? incoming.status
          : current.status ?? null,
      snapshotFingerprint:
        typeof incoming.snapshotFingerprint === "string" &&
        incoming.snapshotFingerprint.trim()
          ? incoming.snapshotFingerprint.trim()
          : current.snapshotFingerprint || "",
    };
  }

  function createDeferredRefreshController(options = {}) {
    const runTask = typeof options.run === "function" ? options.run : async () => {};
    const mergePayload =
      typeof options.mergePayload === "function"
        ? options.mergePayload
        : mergeDeferredRefreshPayload;
    const isBlocked =
      typeof options.isBlocked === "function"
        ? options.isBlocked
        : () => hasVisibleBlockingOverlay();
    const scheduleFrame =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (task) => window.setTimeout(task, 16);
    const cancelScheduledFrame =
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : (taskId) => window.clearTimeout(taskId);
    const enqueueDelayMs = Number.isFinite(options.delayMs)
      ? Math.max(0, Math.round(Number(options.delayMs)))
      : 0;

    let pendingPayload = null;
    let running = false;
    let destroyed = false;
    let frameId = 0;
    let timerId = 0;

    const clearScheduledAttempt = () => {
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = 0;
      }
      if (frameId) {
        cancelScheduledFrame(frameId);
        frameId = 0;
      }
    };

    const queueAttempt = () => {
      if (destroyed || running || !pendingPayload || frameId || timerId) {
        return;
      }
      if (isBlocked()) {
        return;
      }

      const runAttempt = () => {
        timerId = 0;
        frameId = scheduleFrame(() => {
          frameId = 0;
          void controller.flush();
        });
      };

      if (enqueueDelayMs > 0) {
        timerId = window.setTimeout(runAttempt, enqueueDelayMs);
        return;
      }

      runAttempt();
    };

    const handleReadyState = () => {
      if (destroyed || document.hidden || isBlocked()) {
        return;
      }
      queueAttempt();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleReadyState();
      }
    };

    window.addEventListener(BLOCKING_OVERLAY_STATE_EVENT_NAME, handleReadyState);
    window.addEventListener("focus", handleReadyState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const controller = {
      enqueue(payload = {}) {
        pendingPayload = mergePayload(pendingPayload, payload);
        queueAttempt();
        return pendingPayload;
      },
      async flush() {
        if (destroyed || running || !pendingPayload || isBlocked()) {
          return false;
        }

        const payload = pendingPayload;
        pendingPayload = null;
        running = true;
        try {
          await runTask(payload);
        } finally {
          running = false;
          queueAttempt();
        }
        return true;
      },
      cancel() {
        pendingPayload = null;
        clearScheduledAttempt();
      },
      destroy() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        pendingPayload = null;
        clearScheduledAttempt();
        window.removeEventListener(
          BLOCKING_OVERLAY_STATE_EVENT_NAME,
          handleReadyState,
        );
        window.removeEventListener("focus", handleReadyState);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      },
      hasPending() {
        return !!pendingPayload;
      },
      isRunning() {
        return running;
      },
      isBlocked() {
        return isBlocked();
      },
    };

    return controller;
  }

  function createAtomicRefreshController(options = {}) {
    const defaultDelayMs = Number.isFinite(options.defaultDelayMs)
      ? Math.max(0, Math.round(Number(options.defaultDelayMs)))
      : 150;
    const defaultShowLoading =
      typeof options.showLoading === "function" ? options.showLoading : () => {};
    const defaultHideLoading =
      typeof options.hideLoading === "function" ? options.hideLoading : () => {};
    let activeRequestId = 0;

    return {
      invalidate() {
        activeRequestId += 1;
      },
      isCurrent(requestId) {
        return requestId === activeRequestId;
      },
      async run(task, runOptions = {}) {
        const requestId = ++activeRequestId;
        const delayMs =
          runOptions.immediateLoading === true
            ? 0
            : Number.isFinite(runOptions.delayMs)
              ? Math.max(0, Math.round(Number(runOptions.delayMs)))
              : defaultDelayMs;
        const showLoading =
          typeof runOptions.showLoading === "function"
            ? runOptions.showLoading
            : defaultShowLoading;
        const hideLoading =
          typeof runOptions.hideLoading === "function"
            ? runOptions.hideLoading
            : defaultHideLoading;
        const shouldManageLoading = runOptions.manageLoading !== false;
        let loadingTimerId = 0;
        let loadingShown = false;

        const revealLoading = () => {
          if (!shouldManageLoading || loadingShown || requestId !== activeRequestId) {
            return;
          }
          loadingShown = true;
          showLoading(runOptions.loadingOptions || {});
        };

        if (shouldManageLoading) {
          if (delayMs <= 0) {
            revealLoading();
          } else {
            loadingTimerId = window.setTimeout(revealLoading, delayMs);
          }
        }

        try {
          const value = await task({
            requestId,
            isCurrent: () => requestId === activeRequestId,
          });
          if (requestId !== activeRequestId) {
            return {
              stale: true,
              value,
            };
          }
          if (typeof runOptions.commit === "function") {
            await runOptions.commit(value, {
              requestId,
            });
          }
          return {
            stale: false,
            value,
          };
        } finally {
          window.clearTimeout(loadingTimerId);
          if (requestId === activeRequestId && shouldManageLoading) {
            hideLoading(runOptions.hideLoadingOptions || {});
          }
        }
      },
    };
  }

  function resolveLoadingOverlayElement(target) {
    if (target instanceof HTMLElement) {
      return target;
    }
    if (
      typeof document !== "undefined" &&
      typeof target === "string" &&
      target.trim()
    ) {
      const matched = document.querySelector(target.trim());
      return matched instanceof HTMLElement ? matched : null;
    }
    return null;
  }

  function createPageLoadingOverlayController(options = {}) {
    const overlay = resolveLoadingOverlayElement(options.overlay);
    const inlineHost =
      resolveLoadingOverlayElement(options.inlineHost) || overlay?.parentElement || null;
    const scopeFullscreenToInlineHost =
      options.scopeFullscreenToInlineHost !== false;

    if (!(overlay instanceof HTMLElement)) {
      return {
        setState() {},
        destroy() {},
      };
    }

    const titleNode = overlay.querySelector("[data-loading-title]");
    const messageNode = overlay.querySelector("[data-loading-message]");
    const normalizeMode = (value) =>
      String(value || "").trim() === "fullscreen" ? "fullscreen" : "inline";
    const shouldForceFullscreenMode = (mode, visible) => {
      if (!visible || mode !== "inline") {
        return false;
      }
      const platform = String(window.ControlerNativeBridge?.platform || "").trim();
      if (platform === "android") {
        return true;
      }
      const root = document.documentElement;
      const body = document.body;
      return Boolean(
        root?.classList.contains("controler-android-native") ||
          body?.classList.contains("controler-android-native"),
      );
    };
    let overlayTimerId = 0;
    let destroyed = false;
    let currentVisibility = !overlay.hidden;
    let currentMode = normalizeMode(overlay.dataset.mode || "inline");
    let requestedOverlayState = {
      visible: currentVisibility,
      mode: currentMode,
      title:
        titleNode instanceof HTMLElement ? titleNode.textContent || "正在加载数据中" : "正在加载数据中",
      message: messageNode instanceof HTMLElement ? messageNode.textContent || "" : "",
    };

    const clearFullscreenGeometry = () => {
      overlay.style.top = "";
      overlay.style.left = "";
      overlay.style.right = "";
      overlay.style.bottom = "";
      overlay.style.width = "";
      overlay.style.height = "";
      overlay.style.minHeight = "";
      overlay.style.maxHeight = "";
      overlay.style.inset = "";
      overlay.style.borderRadius = "";
    };

    const shouldScopeFullscreenToInlineHost = () => {
      if (!scopeFullscreenToInlineHost) {
        return false;
      }
      if (!(inlineHost instanceof HTMLElement)) {
        return false;
      }
      const platform = String(window.ControlerNativeBridge?.platform || "").trim();
      if (platform === "android" || platform === "ios") {
        return false;
      }
      const root = document.documentElement;
      const body = document.body;
      if (!(body instanceof HTMLElement)) {
        return false;
      }
      if (
        root?.classList.contains("controler-mobile-runtime") ||
        root?.classList.contains("controler-android-native") ||
        root?.classList.contains("controler-ios-native") ||
        body.classList.contains("controler-mobile-runtime") ||
        body.classList.contains("controler-android-native") ||
        body.classList.contains("controler-ios-native")
      ) {
        return false;
      }
      return body.classList.contains("row");
    };

    const shouldSuppressFullscreenOverlay = (visible, mode) => {
      if (!visible || mode !== "fullscreen") {
        return false;
      }
      if (!isReactNativeNavigationRuntime()) {
        return false;
      }
      return !isShellPageActive();
    };

    const syncFullscreenGeometry = () => {
      if (!(inlineHost instanceof HTMLElement)) {
        clearFullscreenGeometry();
        return;
      }
      if (!(currentVisibility && currentMode === "fullscreen")) {
        clearFullscreenGeometry();
        return;
      }
      if (!shouldScopeFullscreenToInlineHost()) {
        clearFullscreenGeometry();
        return;
      }

      const rect = inlineHost.getBoundingClientRect();
      const computedHostStyle = window.getComputedStyle(inlineHost);
      overlay.style.top = `${Math.round(rect.top)}px`;
      overlay.style.left = `${Math.round(rect.left)}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
      overlay.style.width = `${Math.max(0, Math.round(rect.width))}px`;
      overlay.style.height = `${Math.max(0, Math.round(rect.height))}px`;
      overlay.style.minHeight = `${Math.max(0, Math.round(rect.height))}px`;
      overlay.style.maxHeight = `${Math.max(0, Math.round(rect.height))}px`;
      overlay.style.inset = "auto";
      overlay.style.borderRadius = computedHostStyle.borderRadius || "";
    };

    const ensureInlineHostReady = () => {
      if (!(inlineHost instanceof HTMLElement)) {
        return null;
      }
      if (window.getComputedStyle(inlineHost).position === "static") {
        inlineHost.style.position = "relative";
      }
      return inlineHost;
    };

    const moveOverlayToInlineHost = () => {
      const targetHost = ensureInlineHostReady();
      if (!(targetHost instanceof HTMLElement)) {
        return;
      }
      if (overlay.parentElement !== targetHost) {
        targetHost.appendChild(overlay);
      }
    };

    const moveOverlayToFullscreenHost = () => {
      if (!(document.body instanceof HTMLElement)) {
        return;
      }
      if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }
    };

    const applyOverlayState = ({
      visible = false,
      mode = "inline",
      title = "",
      message = "",
    } = {}) => {
      if (destroyed) {
        return;
      }

      const requestedMode = normalizeMode(mode);
      const resolvedMode = shouldForceFullscreenMode(requestedMode, visible)
        ? "fullscreen"
        : requestedMode;
      requestedOverlayState = {
        visible,
        mode: requestedMode,
        title,
        message,
      };
      const suppressedByShell = shouldSuppressFullscreenOverlay(
        visible,
        resolvedMode,
      );
      const actualVisible = visible && !suppressedByShell;
      if (actualVisible && resolvedMode === "fullscreen") {
        moveOverlayToFullscreenHost();
      } else {
        moveOverlayToInlineHost();
      }

      overlay.dataset.mode = resolvedMode;
      overlay.hidden = !actualVisible;
      overlay.setAttribute("aria-hidden", actualVisible ? "false" : "true");
      overlay.dataset.shellSuppressed = suppressedByShell ? "true" : "false";
      currentVisibility = actualVisible;
      currentMode = resolvedMode;

      if (titleNode instanceof HTMLElement && typeof title === "string") {
        titleNode.textContent = title;
      }
      if (messageNode instanceof HTMLElement && typeof message === "string") {
        messageNode.textContent = message;
      }

      syncFullscreenGeometry();
      scheduleBlockingOverlaySync();
    };

    const forceHideOverlay = () => {
      window.clearTimeout(overlayTimerId);
      overlayTimerId = 0;
      applyOverlayState({
        visible: false,
        mode: overlay.dataset.mode || "inline",
        title:
          titleNode instanceof HTMLElement
            ? titleNode.textContent || "正在加载数据中"
            : "正在加载数据中",
        message:
          messageNode instanceof HTMLElement ? messageNode.textContent || "" : "",
      });
    };

    const handlePageDispose = () => {
      forceHideOverlay();
    };

    const handleViewportChange = () => {
      syncFullscreenGeometry();
    };

    const handleShellVisibilityChange = () => {
      applyOverlayState(requestedOverlayState);
    };

    window.addEventListener("pagehide", handlePageDispose);
    window.addEventListener("beforeunload", handlePageDispose);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.addEventListener(SHELL_VISIBILITY_EVENT_NAME, handleShellVisibilityChange);

    return {
      setState(nextState = {}) {
        if (destroyed) {
          return;
        }

        const active = nextState.active === true;
        const mode = normalizeMode(nextState.mode || overlay.dataset.mode || "inline");
        const title =
          typeof nextState.title === "string" && nextState.title.trim()
            ? nextState.title
            : titleNode instanceof HTMLElement
              ? titleNode.textContent || "正在加载数据中"
              : "正在加载数据中";
        const message =
          typeof nextState.message === "string" && nextState.message.trim()
            ? nextState.message
            : messageNode instanceof HTMLElement
              ? messageNode.textContent || ""
              : "";
        const delayMs = Number.isFinite(nextState.delayMs)
          ? Math.max(0, Math.round(Number(nextState.delayMs)))
          : 0;

        window.clearTimeout(overlayTimerId);
        overlayTimerId = 0;

        if (!active) {
          applyOverlayState({
            visible: false,
            mode,
            title,
            message,
          });
          return;
        }

        if (delayMs > 0) {
          applyOverlayState({
            visible: false,
            mode,
            title,
            message,
          });
          overlayTimerId = window.setTimeout(() => {
            overlayTimerId = 0;
            applyOverlayState({
              visible: true,
              mode,
              title,
              message,
            });
          }, delayMs);
          return;
        }

        applyOverlayState({
          visible: true,
          mode,
          title,
          message,
        });
      },
      destroy() {
        if (destroyed) {
          return;
        }
        forceHideOverlay();
        destroyed = true;
        window.removeEventListener("pagehide", handlePageDispose);
        window.removeEventListener("beforeunload", handlePageDispose);
        window.removeEventListener("resize", handleViewportChange);
        window.visualViewport?.removeEventListener("resize", handleViewportChange);
        window.removeEventListener(
          SHELL_VISIBILITY_EVENT_NAME,
          handleShellVisibilityChange,
        );
        clearFullscreenGeometry();
      },
    };
  }

  function normalizeExpandSurfaceWidthFactor(value, fallback = DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(
      Math.max(parsed, EXPAND_SURFACE_WIDTH_FACTOR_MIN),
      EXPAND_SURFACE_WIDTH_FACTOR_MAX,
    );
  }

  function scaleExpandSurfaceConstraint(value, widthFactor = DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR) {
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 0;
    }
    const safeFactor = normalizeExpandSurfaceWidthFactor(widthFactor);
    return Math.max(0, Math.round(numericValue * safeFactor));
  }

  function getModalSwipeSurface(modal) {
    if (!(modal instanceof HTMLElement)) {
      return null;
    }
    const content = modal.querySelector(".modal-content");
    return content instanceof HTMLElement ? content : modal;
  }

  function clearModalEdgeSwipeCleanupTimer(modal) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    if (modal.__controlerEdgeSwipeCleanupTimer) {
      window.clearTimeout(modal.__controlerEdgeSwipeCleanupTimer);
      modal.__controlerEdgeSwipeCleanupTimer = 0;
    }
  }

  function resetModalEdgeSwipePresentation(modal, options = {}) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }

    const surface = getModalSwipeSurface(modal);
    if (!(surface instanceof HTMLElement)) {
      return;
    }

    const { animate = false } = options;
    clearModalEdgeSwipeCleanupTimer(modal);

    if (animate) {
      surface.style.transition =
        `transform ${MODAL_EDGE_SWIPE_RESET_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      modal.style.transition =
        `opacity ${Math.min(MODAL_EDGE_SWIPE_RESET_DURATION_MS, 140)}ms ease`;
    } else {
      surface.style.transition = "";
      modal.style.transition = "";
    }

    surface.style.transform = "";
    surface.style.willChange = "";
    modal.style.opacity = "";

    if (!animate) {
      return;
    }

    modal.__controlerEdgeSwipeCleanupTimer = window.setTimeout(() => {
      surface.style.transition = "";
      modal.style.transition = "";
      modal.__controlerEdgeSwipeCleanupTimer = 0;
    }, MODAL_EDGE_SWIPE_RESET_DURATION_MS + 24);
  }

  function updateModalEdgeSwipePresentation(modal, deltaX = 0) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }

    const surface = getModalSwipeSurface(modal);
    if (!(surface instanceof HTMLElement)) {
      return;
    }

    clearModalEdgeSwipeCleanupTimer(modal);
    surface.style.transition = "none";
    modal.style.transition = "none";

    const translateX = Math.max(0, deltaX);
    if (translateX <= 0) {
      surface.style.transform = "";
      surface.style.willChange = "";
      modal.style.opacity = "";
      return;
    }

    const surfaceWidth =
      surface.getBoundingClientRect().width ||
      modal.getBoundingClientRect().width ||
      window.innerWidth ||
      1;
    const progress = Math.min(translateX / Math.max(surfaceWidth, 1), 1);
    surface.style.transform = `translate3d(${Math.round(translateX)}px, 0, 0)`;
    surface.style.willChange = "transform";
    modal.style.opacity = String(Math.max(0.58, 1 - progress * 0.42));
  }

  function getModalEdgeSwipeCloseDistance(modal) {
    const surface = getModalSwipeSurface(modal);
    const surfaceWidth =
      surface?.getBoundingClientRect?.().width ||
      modal?.getBoundingClientRect?.().width ||
      window.innerWidth ||
      0;
    return Math.min(
      MODAL_EDGE_SWIPE_CLOSE_DISTANCE,
      Math.max(28, Math.round(surfaceWidth * 0.1)),
    );
  }

  function closeModal(modal) {
    if (!modal) {
      scheduleModalHistorySync();
      return;
    }

    if (modal instanceof HTMLElement) {
      resetModalEdgeSwipePresentation(modal);
    }

    const customCloseHandler = modal.__controlerCloseModal;
    if (typeof customCloseHandler === "function") {
      customCloseHandler();
      scheduleModalHistorySync();
      return;
    }

    if (modal.dataset?.controlerModalPersistent === "true") {
      modal.hidden = true;
      modal.style.display = "none";
      scheduleModalHistorySync();
      return;
    }

    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    scheduleModalHistorySync();
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach((modal) => {
      if (!(modal instanceof HTMLElement)) {
        return;
      }
      closeModal(modal);
    });
  }

  function stopModalContentPropagation(modal) {
    const content = modal?.querySelector?.(".modal-content");
    if (!content) return;
    content.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  function prepareModalOverlay(modal, options = {}) {
    if (!(modal instanceof HTMLElement)) return null;

    const persistent =
      options.persistent === true ||
      modal.dataset?.controlerModalPersistent === "true";
    const zIndex =
      Number.isFinite(options.zIndex) && Number(options.zIndex) > 0
        ? String(Math.round(Number(options.zIndex)))
        : "";
    const closeHandler =
      typeof options.close === "function" ? options.close : null;

    modal.classList.add("modal-overlay");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.right = "0";
    modal.style.bottom = "0";
    modal.style.inset = "0";
    modal.style.width = "100vw";
    modal.style.minHeight = "var(--controler-visual-viewport-height, 100dvh)";
    modal.style.height = "var(--controler-visual-viewport-height, 100dvh)";
    modal.style.maxHeight = "var(--controler-visual-viewport-height, 100dvh)";
    modal.style.backgroundColor = "var(--overlay-bg)";
    modal.style.display = options.visible === false ? "none" : "flex";
    modal.style.alignItems = options.alignItems || "center";
    modal.style.justifyContent = options.justifyContent || "center";
    modal.style.overflow = "hidden";
    modal.style.boxSizing = "border-box";
    modal.hidden = options.visible === false;
    if (zIndex) {
      modal.style.zIndex = zIndex;
    }
    if (persistent) {
      modal.dataset.controlerModalPersistent = "true";
    }
    if (closeHandler) {
      modal.__controlerCloseModal = closeHandler;
    }

    if (options.append !== false && !modal.isConnected && document.body) {
      document.body.appendChild(modal);
    }
    stopModalContentPropagation(modal);
    return modal;
  }

  function bindModalAction(modal, selector, handler, options = {}) {
    const button =
      selector instanceof Element
        ? selector
        : modal?.querySelector?.(selector);
    if (!button || typeof handler !== "function") return null;

    const {
      preventDefault = true,
      stopPropagation = true,
      stopImmediate = true,
    } = options;

    button.addEventListener("click", (event) => {
      if (preventDefault) event.preventDefault();
      if (stopPropagation) event.stopPropagation();
      if (stopImmediate && typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      handler(event, button);
    });

    return button;
  }

  function setAccentButtonState(button, active = true) {
    if (!button) return;
    if (active) {
      button.style.backgroundColor = "var(--accent-color)";
      button.style.color = "var(--on-accent-text)";
      return;
    }
    button.style.backgroundColor = "";
    button.style.color = "";
  }

  function setAccentButtonGroup(buttons, activeButton) {
    buttons.forEach((button) => setAccentButtonState(button, false));
    if (activeButton) {
      setAccentButtonState(activeButton, true);
    }
  }

  function readSelectText(option, fallback = "") {
    if (!option) return fallback;
    return String(option.textContent || option.label || fallback).trim();
  }

  let textMeasureCanvas = null;

  function getTextMeasureContext() {
    if (typeof document === "undefined") return null;
    if (!textMeasureCanvas) {
      textMeasureCanvas = document.createElement("canvas");
    }
    return textMeasureCanvas.getContext("2d");
  }

  function getElementFont(element) {
    if (!(element instanceof Element)) {
      return '500 14px "Segoe UI", sans-serif';
    }
    const computed = window.getComputedStyle(element);
    return [
      computed.fontStyle,
      computed.fontVariant,
      computed.fontWeight,
      computed.fontSize,
      computed.fontFamily,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function measureExpandSurfaceWidth(items = [], options = {}) {
    const {
      anchor = null,
      minWidth = 0,
      maxWidth = Number.POSITIVE_INFINITY,
      extraPadding = 60,
      floorWidth = 0,
      widthFactor = DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR,
    } = options;
    const safeWidthFactor = normalizeExpandSurfaceWidthFactor(widthFactor);
    const scaledMinWidth = scaleExpandSurfaceConstraint(minWidth, safeWidthFactor);
    const scaledFloorWidth = scaleExpandSurfaceConstraint(
      floorWidth,
      safeWidthFactor,
    );
    const scaledMaxWidth = Number.isFinite(maxWidth)
      ? Math.max(
          scaledMinWidth,
          scaleExpandSurfaceConstraint(maxWidth, safeWidthFactor),
        )
      : maxWidth;

    const context = getTextMeasureContext();
    if (!context) {
      return Math.max(scaledMinWidth, scaledFloorWidth);
    }

    context.font = getElementFont(anchor || document.body);
    const widestTextWidth = items.reduce((widest, item) => {
      const text = String(item ?? "").trim();
      if (!text) return widest;
      return Math.max(widest, context.measureText(text).width);
    }, 0);

    return Math.min(
      scaledMaxWidth,
      Math.max(
        scaledMinWidth,
        scaledFloorWidth,
        Math.ceil((widestTextWidth + extraPadding) * safeWidthFactor),
      ),
    );
  }

  function openDialog({
    title = "提示",
    message = "",
    confirmText = "确定",
    cancelText = null,
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.style.display = "flex";
      modal.style.zIndex = "4200";

      modal.innerHTML = `
        <div class="modal-content themed-dialog-card ms" style="width:min(420px, calc(100vw - 32px)); max-width:min(420px, calc(100vw - 32px));">
          <div class="themed-dialog-title"></div>
          <div class="themed-dialog-message"></div>
          <div class="themed-dialog-actions">
            ${
              cancelText
                ? '<button type="button" class="bts themed-dialog-cancel-btn" style="margin:0;">取消</button>'
                : ""
            }
            <button type="button" class="bts themed-dialog-confirm-btn${danger ? " is-danger" : ""}" style="margin:0;">确定</button>
          </div>
        </div>
      `;

      const titleElement = modal.querySelector(".themed-dialog-title");
      const messageElement = modal.querySelector(".themed-dialog-message");
      const confirmButton = modal.querySelector(".themed-dialog-confirm-btn");
      const cancelButton = modal.querySelector(".themed-dialog-cancel-btn");

      if (titleElement) {
        titleElement.textContent = title;
      }
      if (messageElement) {
        messageElement.textContent = String(message ?? "");
      }
      if (confirmButton) {
        confirmButton.textContent = confirmText;
      }
      if (cancelButton) {
        cancelButton.textContent = cancelText;
      }

      const cleanup = (result) => {
        document.removeEventListener("keydown", handleKeydown, true);
        closeModal(modal);
        resolve(result);
      };

      const handleKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          cleanup(true);
        }
      };

      confirmButton?.addEventListener("click", (event) => {
        event.preventDefault();
        cleanup(true);
      });
      cancelButton?.addEventListener("click", (event) => {
        event.preventDefault();
        cleanup(false);
      });

      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          cleanup(false);
        }
      });

      document.body.appendChild(modal);
      stopModalContentPropagation(modal);
      document.addEventListener("keydown", handleKeydown, true);
      setTimeout(() => {
        (confirmButton || cancelButton)?.focus?.();
      }, 0);
    });
  }

  async function confirmDialog(options = {}) {
    return openDialog({
      title: options.title || "请确认操作",
      message: options.message || "",
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      danger: !!options.danger,
    });
  }

  async function alertDialog(options = {}) {
    await openDialog({
      title: options.title || "提示",
      message: options.message || "",
      confirmText: options.confirmText || "知道了",
      cancelText: null,
      danger: !!options.danger,
    });
  }

  function enhanceNativeSelect(select, config = {}) {
    if (!(select instanceof HTMLSelectElement)) return null;

    if (select.__uiEnhancedSelectApi) {
      select.__uiEnhancedSelectApi.refresh();
      return select.__uiEnhancedSelectApi;
    }

    const {
      fullWidth = false,
      minWidth = 160,
      placeholder = "",
      preferredMenuWidth = 280,
      maxMenuWidth = 380,
      widthFactor = DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR,
      menuWidthFactor = widthFactor,
    } = config;
    const safeWidthFactor = normalizeExpandSurfaceWidthFactor(widthFactor);
    const safeMenuWidthFactor = normalizeExpandSurfaceWidthFactor(menuWidthFactor);
    const scaledMinWidth = scaleExpandSurfaceConstraint(minWidth, safeWidthFactor);
    const scaledPreferredMenuWidth = scaleExpandSurfaceConstraint(
      preferredMenuWidth,
      safeMenuWidthFactor,
    );
    const scaledMaxMenuWidth = scaleExpandSurfaceConstraint(
      maxMenuWidth,
      safeMenuWidthFactor,
    );

    const wrapper = document.createElement("div");
    wrapper.className = "tree-select native-select-enhancer";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "tree-select-button";
    trigger.innerHTML = `
      <span class="tree-select-button-text"></span>
      <span class="tree-select-button-caret">▾</span>
    `;
    const triggerText = trigger.querySelector(".tree-select-button-text");

    const menu = document.createElement("div");
    menu.className = "tree-select-menu";

    const collectOptionLabels = () =>
      Array.from(select.querySelectorAll("option")).map((optionNode) =>
        readSelectText(optionNode, ""),
      );

    const updateSelectorWidth = () => {
      if (fullWidth) {
        wrapper.style.width = "100%";
        trigger.style.width = "100%";
        return Math.max(
          scaledMinWidth,
          wrapper.offsetWidth || select.offsetWidth || 0,
        );
      }

      const measuredWidth = measureExpandSurfaceWidth(collectOptionLabels(), {
        anchor: trigger,
        minWidth: scaledMinWidth,
        maxWidth: Number.POSITIVE_INFINITY,
        extraPadding: 68,
        widthFactor: safeWidthFactor,
        floorWidth: Math.max(
          scaleExpandSurfaceConstraint(wrapper.offsetWidth || 0, safeWidthFactor),
          scaleExpandSurfaceConstraint(trigger.offsetWidth || 0, safeWidthFactor),
          scaledMinWidth,
        ),
      });

      wrapper.style.width = `${measuredWidth}px`;
      trigger.style.width = `${measuredWidth}px`;
      return measuredWidth;
    };

    wrapper.style.width = fullWidth ? "100%" : "fit-content";
    wrapper.style.minWidth = "0";
    wrapper.style.maxWidth = "100%";
    trigger.style.width = fullWidth ? "100%" : "fit-content";
    trigger.style.minWidth = "0";
    trigger.style.maxWidth = "100%";
    menu.style.width = "100%";
    menu.style.minWidth = "100%";

    const closeMenu = () => {
      wrapper.classList.remove("open");
      document.removeEventListener("click", handleOutsideClick, true);
      window.removeEventListener("resize", repositionMenu, true);
      window.removeEventListener("scroll", repositionMenu, true);
    };

    const repositionMenu = () => {
      const contentWidth = updateSelectorWidth();
      positionFloatingMenu(wrapper, menu, {
        minWidth: Math.max(scaledMinWidth, contentWidth),
        preferredWidth: Math.max(scaledPreferredMenuWidth, contentWidth + 8),
        maxWidth: Math.max(scaledMaxMenuWidth, contentWidth + 12),
      });
    };

    const openMenu = () => {
      if (select.disabled) return;
      repositionMenu();
      wrapper.classList.add("open");
      setTimeout(() => {
        document.addEventListener("click", handleOutsideClick, true);
        window.addEventListener("resize", repositionMenu, true);
        window.addEventListener("scroll", repositionMenu, true);
      }, 0);
    };

    const handleOutsideClick = (event) => {
      if (!wrapper.contains(event.target)) {
        closeMenu();
      }
    };

    const syncFromSelect = () => {
      const selectedOption =
        select.options[select.selectedIndex] ||
        Array.from(select.options).find((option) => option.value === select.value) ||
        null;
      const fallbackText =
        placeholder ||
        readSelectText(select.options[0], "请选择");
      if (triggerText) {
        triggerText.textContent = readSelectText(selectedOption, fallbackText);
      }

      menu.querySelectorAll(".tree-select-option").forEach((optionButton) => {
        optionButton.classList.toggle(
          "selected",
          optionButton.dataset.value === String(select.value ?? ""),
        );
      });

      trigger.disabled = !!select.disabled;
    };

    const rebuildMenu = () => {
      menu.innerHTML = "";

      const groups = Array.from(select.children);
      groups.forEach((node) => {
        if (node instanceof HTMLOptGroupElement) {
          const groupLabel = document.createElement("div");
          groupLabel.className = "native-select-group-label";
          groupLabel.textContent = node.label || "";
          menu.appendChild(groupLabel);

          Array.from(node.children)
            .filter((child) => child instanceof HTMLOptionElement)
            .forEach((optionNode) => {
              menu.appendChild(buildOptionButton(optionNode));
            });
          return;
        }

        if (node instanceof HTMLOptionElement) {
          menu.appendChild(buildOptionButton(node));
        }
      });

      syncFromSelect();
      updateSelectorWidth();
    };

    const buildOptionButton = (optionNode) => {
      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "tree-select-option";
      optionButton.dataset.value = String(optionNode.value ?? "");

      const label = document.createElement("span");
      label.className = "tree-select-option-label";
      label.textContent = readSelectText(optionNode, "未命名选项");
      optionButton.appendChild(label);

      if (optionNode.disabled) {
        optionButton.classList.add("is-disabled");
        optionButton.disabled = true;
      } else {
        optionButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          select.value = optionNode.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          syncFromSelect();
          closeMenu();
        });
      }

      return optionButton;
    };

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (wrapper.classList.contains("open")) {
        closeMenu();
        return;
      }
      openMenu();
    });

    select.classList.add("native-select-source");
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    select.addEventListener("change", syncFromSelect);

    const observer = new MutationObserver(() => {
      rebuildMenu();
    });
    observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "style", "class"],
    });

    const handleLanguageChanged = () => {
      rebuildMenu();
    };
    window.addEventListener("controler:language-changed", handleLanguageChanged);

    const api = {
      refresh() {
        rebuildMenu();
      },
      destroy() {
        observer.disconnect();
        document.removeEventListener("click", handleOutsideClick, true);
        window.removeEventListener("resize", repositionMenu, true);
        window.removeEventListener("scroll", repositionMenu, true);
        window.removeEventListener(
          "controler:language-changed",
          handleLanguageChanged,
        );
        wrapper.remove();
        select.classList.remove("native-select-source");
        delete select.__uiEnhancedSelectApi;
      },
      close() {
        closeMenu();
      },
      reposition() {
        repositionMenu();
      },
    };

    select.__uiEnhancedSelectApi = api;
    rebuildMenu();
    return api;
  }

  function refreshEnhancedSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    select.__uiEnhancedSelectApi?.refresh?.();
  }

  function bindHorizontalDragScroll(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;
    if (container.__controlerHorizontalDragApi) {
      return container.__controlerHorizontalDragApi;
    }

    const {
      enabled = () => true,
      ignoreSelector = "button, input, select, textarea, a, label",
      startThreshold = 6,
      directionLockThreshold = 8,
      idleCursor = "grab",
      onRelease = null,
    } = options;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let isPointerDown = false;
    let isDraggingHorizontally = false;
    let suppressNextClick = false;
    let previousBodyUserSelect = "";

    if (!container.style.touchAction) {
      container.style.touchAction = "pan-x";
    }
    if (!container.style.cursor) {
      container.style.cursor = idleCursor;
    }

    const resetDraggingState = (didDrag = false) => {
      if (
        pointerId !== null &&
        typeof container.hasPointerCapture === "function" &&
        container.hasPointerCapture(pointerId)
      ) {
        try {
          container.releasePointerCapture(pointerId);
        } catch {}
      }

      pointerId = null;
      isPointerDown = false;

      if (isDraggingHorizontally || didDrag) {
        container.classList.remove("is-horizontal-dragging");
        container.style.cursor = idleCursor;
        document.body.style.userSelect = previousBodyUserSelect;
      }

      const shouldTriggerRelease = isDraggingHorizontally || didDrag;
      isDraggingHorizontally = false;

      if (shouldTriggerRelease && typeof onRelease === "function") {
        onRelease();
      }
    };

    const handlePointerDown = (event) => {
      if (!enabled()) return;
      if (event.isPrimary === false) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (
        ignoreSelector &&
        event.target instanceof Element &&
        event.target.closest(ignoreSelector)
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = container.scrollLeft;
      isPointerDown = true;
      isDraggingHorizontally = false;
      previousBodyUserSelect = document.body.style.userSelect || "";

      if (typeof container.setPointerCapture === "function") {
        try {
          container.setPointerCapture(pointerId);
        } catch {}
      }
    };

    const handlePointerMove = (event) => {
      if (!isPointerDown || pointerId !== event.pointerId || !enabled()) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!isDraggingHorizontally) {
        if (Math.abs(deltaX) < startThreshold) {
          return;
        }
        if (Math.abs(deltaX) <= Math.abs(deltaY) + directionLockThreshold) {
          return;
        }

        isDraggingHorizontally = true;
        container.classList.add("is-horizontal-dragging");
        container.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      event.preventDefault();
      container.scrollLeft = startScrollLeft - deltaX;
    };

    const handlePointerEnd = (event) => {
      if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) {
        return;
      }

      const didDrag = isDraggingHorizontally;
      if (didDrag) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }

      resetDraggingState(didDrag);
    };

    const handleClickCapture = (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerEnd);
    container.addEventListener("pointercancel", handlePointerEnd);
    container.addEventListener("lostpointercapture", handlePointerEnd);
    container.addEventListener("click", handleClickCapture, true);

    const api = {
      destroy() {
        resetDraggingState(false);
        container.removeEventListener("pointerdown", handlePointerDown);
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerup", handlePointerEnd);
        container.removeEventListener("pointercancel", handlePointerEnd);
        container.removeEventListener("lostpointercapture", handlePointerEnd);
        container.removeEventListener("click", handleClickCapture, true);
        delete container.__controlerHorizontalDragApi;
      },
    };

    container.__controlerHorizontalDragApi = api;
    return api;
  }

  function bindVerticalDragScroll(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;
    if (container.__controlerVerticalDragApi) {
      return container.__controlerVerticalDragApi;
    }

    const {
      enabled = () => true,
      ignoreSelector = "button, input, select, textarea, a, label",
      startThreshold = 6,
      directionLockThreshold = 8,
      pressDelay = 160,
      mouseLongPressMaxMove = 4,
      idleCursor = "grab",
    } = options;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    let isPointerDown = false;
    let isDraggingVertically = false;
    let suppressNextClick = false;
    let previousBodyUserSelect = "";
    let pressTimerId = null;
    let longPressReady = false;
    let mousePressCanceled = false;

    if (!container.style.touchAction) {
      container.style.touchAction = "pan-y";
    }
    if (!container.style.cursor) {
      container.style.cursor = idleCursor;
    }

    const clearPressTimer = () => {
      if (pressTimerId !== null) {
        window.clearTimeout(pressTimerId);
        pressTimerId = null;
      }
    };

    const resetDraggingState = (didDrag = false) => {
      clearPressTimer();

      if (
        pointerId !== null &&
        typeof container.hasPointerCapture === "function" &&
        container.hasPointerCapture(pointerId)
      ) {
        try {
          container.releasePointerCapture(pointerId);
        } catch {}
      }

      pointerId = null;
      isPointerDown = false;
      longPressReady = false;
      mousePressCanceled = false;

      if (isDraggingVertically || didDrag) {
        container.classList.remove("is-vertical-dragging");
        container.style.cursor = idleCursor;
        document.body.style.userSelect = previousBodyUserSelect;
      }

      isDraggingVertically = false;
    };

    const handlePointerDown = (event) => {
      if (!enabled()) return;
      if (event.isPrimary === false) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (
        ignoreSelector &&
        event.target instanceof Element &&
        event.target.closest(ignoreSelector)
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScrollTop = container.scrollTop;
      isPointerDown = true;
      isDraggingVertically = false;
      previousBodyUserSelect = document.body.style.userSelect || "";
      longPressReady = event.pointerType !== "mouse";
      mousePressCanceled = false;
      clearPressTimer();

      if (event.pointerType === "mouse") {
        pressTimerId = window.setTimeout(() => {
          if (!mousePressCanceled && isPointerDown) {
            longPressReady = true;
          }
        }, pressDelay);
      } else if (typeof container.setPointerCapture === "function") {
        try {
          container.setPointerCapture(pointerId);
        } catch {}
      }
    };

    const handlePointerMove = (event) => {
      if (!isPointerDown || pointerId !== event.pointerId || !enabled()) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (
        event.pointerType === "mouse" &&
        !longPressReady &&
        (Math.abs(deltaX) > mouseLongPressMaxMove ||
          Math.abs(deltaY) > mouseLongPressMaxMove)
      ) {
        mousePressCanceled = true;
        clearPressTimer();
      }

      if (!isDraggingVertically) {
        if (Math.abs(deltaY) < startThreshold) {
          return;
        }
        if (Math.abs(deltaY) <= Math.abs(deltaX) + directionLockThreshold) {
          return;
        }
        if (event.pointerType === "mouse" && !longPressReady) {
          return;
        }

        isDraggingVertically = true;
        clearPressTimer();
        if (
          typeof container.setPointerCapture === "function" &&
          pointerId !== null
        ) {
          try {
            container.setPointerCapture(pointerId);
          } catch {}
        }
        container.classList.add("is-vertical-dragging");
        container.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      event.preventDefault();
      container.scrollTop = startScrollTop - deltaY;
    };

    const handlePointerEnd = (event) => {
      if (
        pointerId !== null &&
        event?.pointerId !== undefined &&
        event.pointerId !== pointerId
      ) {
        return;
      }

      const didDrag = isDraggingVertically;
      if (didDrag) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }

      resetDraggingState(didDrag);
    };

    const handleClickCapture = (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerEnd);
    container.addEventListener("pointercancel", handlePointerEnd);
    container.addEventListener("lostpointercapture", handlePointerEnd);
    container.addEventListener("click", handleClickCapture, true);

    const api = {
      destroy() {
        resetDraggingState(false);
        container.removeEventListener("pointerdown", handlePointerDown);
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerup", handlePointerEnd);
        container.removeEventListener("pointercancel", handlePointerEnd);
        container.removeEventListener("lostpointercapture", handlePointerEnd);
        container.removeEventListener("click", handleClickCapture, true);
        delete container.__controlerVerticalDragApi;
      },
    };

    container.__controlerVerticalDragApi = api;
    return api;
  }

  const DEFAULT_ELECTRON_TITLEBAR_HEIGHT = 38;
  const WINDOW_MOVE_START_DISTANCE_PX = 10;
  const THEME_APPLIED_EVENT_NAME =
    window.ControlerTheme?.themeAppliedEventName || "controler:theme-applied";

  function readThemeSurfaceColors(themeDetail = null) {
    const resolvedColors =
      themeDetail && typeof themeDetail === "object" ? themeDetail.colors || {} : {};
    const root = document.documentElement;
    const computed = root ? window.getComputedStyle(root) : null;
    const readVar = (propertyName, fallback = "") =>
      computed?.getPropertyValue(propertyName)?.trim() || fallback;

    return {
      backgroundColor:
        resolvedColors.primary || readVar("--bg-primary", "#26312a"),
      overlayColor:
        resolvedColors.panelStrong ||
        readVar("--panel-strong-bg", readVar("--bg-secondary", "#20362b")),
      symbolColor:
        resolvedColors.text || readVar("--text-color", "#f5fff8"),
    };
  }

  function ensureDesktopWidgetScaleStyles() {
    if (document.getElementById("controler-desktop-widget-scale-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "controler-desktop-widget-scale-style";
    style.textContent = `
      .controler-widget-scale-root {
        position: relative;
        min-width: 0;
        min-height: 0;
        width: 100%;
        height: 100%;
        overflow: hidden !important;
      }

      .controler-widget-scale-viewport {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }

      .controler-widget-scale-content {
        min-width: 0;
        min-height: 0;
        transform-origin: top left;
        will-change: transform;
      }

      .controler-widget-scale-content * {
        min-width: 0;
        box-sizing: border-box;
      }

      .controler-widget-scale-content
        :is(
          h1,
          h2,
          h3,
          h4,
          h5,
          h6,
          p,
          span,
          div,
          label,
          button,
          a,
          td,
          th,
          li,
          strong,
          em
        ) {
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .controler-widget-scale-content :is(input, textarea, select) {
        max-width: 100%;
      }
    `;

    document.head.appendChild(style);
  }

  function mountDesktopWidgetScale(container, options = {}) {
    if (!(container instanceof HTMLElement)) {
      return null;
    }
    if (container.__controlerDesktopWidgetScaleApi) {
      return container.__controlerDesktopWidgetScaleApi;
    }

    ensureDesktopWidgetScaleStyles();

    const existingChildren = Array.from(container.childNodes);
    const viewport = document.createElement("div");
    viewport.className = "controler-widget-scale-viewport";
    const content = document.createElement("div");
    content.className = "controler-widget-scale-content";
    existingChildren.forEach((node) => {
      content.appendChild(node);
    });
    viewport.appendChild(content);
    container.appendChild(viewport);
    container.classList.add("controler-widget-scale-root");

    const supportsZoom =
      typeof CSS !== "undefined" && typeof CSS.supports === "function"
        ? CSS.supports("zoom", "1")
        : false;
    const baseline = {
      width: Math.max(
        0,
        Math.round(Number(options.baseWidth) || 0),
        Math.round(Number(options.minBaseWidth) || 0),
      ),
      height: Math.max(
        0,
        Math.round(Number(options.baseHeight) || 0),
        Math.round(Number(options.minBaseHeight) || 0),
      ),
    };

    let destroyed = false;
    let frameId = null;
    let pendingScale = 1;

    const applyScale = (scale) => {
      pendingScale = Math.max(0.01, Math.min(Number(scale) || 1, 1));
      viewport.style.setProperty("--controler-widget-scale", pendingScale.toFixed(4));
      content.dataset.widgetScale = pendingScale.toFixed(4);
      if (supportsZoom) {
        content.style.zoom = pendingScale.toFixed(4);
        content.style.transform = "";
      } else {
        content.style.zoom = "";
        content.style.transform = `scale(${pendingScale.toFixed(4)})`;
      }
    };

    const updateLayout = () => {
      frameId = null;
      if (destroyed || !container.isConnected) {
        return;
      }

      const availableWidth = Math.max(0, container.clientWidth);
      const availableHeight = Math.max(0, container.clientHeight);
      if (!availableWidth || !availableHeight) {
        return;
      }

      applyScale(1);

      const measuredWidth = Math.max(
        Math.ceil(content.scrollWidth),
        Math.ceil(content.getBoundingClientRect().width),
        Math.round(Number(options.minBaseWidth) || 0),
        Math.ceil(availableWidth),
      );
      const measuredHeight = Math.max(
        Math.ceil(content.scrollHeight),
        Math.ceil(content.getBoundingClientRect().height),
        Math.round(Number(options.minBaseHeight) || 0),
        Math.ceil(availableHeight),
      );

      baseline.width = Math.max(baseline.width, measuredWidth);
      baseline.height = Math.max(baseline.height, measuredHeight);

      content.style.width = `${baseline.width}px`;
      content.style.minHeight = `${baseline.height}px`;

      const nextScale = Math.min(
        1,
        availableWidth / Math.max(baseline.width, 1),
        availableHeight / Math.max(baseline.height, 1),
      );
      applyScale(nextScale);
    };

    const scheduleUpdate = () => {
      if (destroyed || frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateLayout);
    };

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            scheduleUpdate();
          })
        : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(content);

    const mutationObserver =
      typeof MutationObserver === "function"
        ? new MutationObserver(() => {
            scheduleUpdate();
          })
        : null;
    mutationObserver?.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("resize", scheduleUpdate);
    window.setTimeout(scheduleUpdate, 60);
    window.setTimeout(scheduleUpdate, 220);
    scheduleUpdate();

    const api = {
      requestLayout: scheduleUpdate,
      getScale: () => pendingScale,
      destroy() {
        destroyed = true;
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        window.removeEventListener("resize", scheduleUpdate);
        if (viewport.parentNode === container) {
          while (content.firstChild) {
            container.insertBefore(content.firstChild, viewport);
          }
          viewport.remove();
        }
        container.classList.remove("controler-widget-scale-root");
        delete container.__controlerDesktopWidgetScaleApi;
      },
    };

    container.__controlerDesktopWidgetScaleApi = api;
    return api;
  }

  function bindWindowMoveHandle(handle, electronApi, options = {}) {
    if (
      !(handle instanceof HTMLElement) ||
      handle.dataset.controlerMoveHandleBound === "true" ||
      typeof electronApi?.windowSetPosition !== "function"
    ) {
      return null;
    }

    const { canStart = () => true } = options;
    handle.dataset.controlerMoveHandleBound = "true";

    let pointerId = null;
    let dragArmed = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startWindowX = 0;
    let startWindowY = 0;
    let pendingPosition = null;
    let rafId = null;
    let moveInteractionActive = false;
    let suppressNextClick = false;

    const flushPosition = () => {
      rafId = null;
      if (!pendingPosition) {
        return;
      }
      const nextPosition = pendingPosition;
      pendingPosition = null;
      void electronApi.windowSetPosition(nextPosition);
    };

    const schedulePosition = (position) => {
      pendingPosition = position;
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(flushPosition);
    };

    const cleanup = ({ suppressClick = false } = {}) => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingPosition = null;
      if (pointerId !== null && handle.hasPointerCapture?.(pointerId)) {
        try {
          handle.releasePointerCapture(pointerId);
        } catch {}
      }
      pointerId = null;
      dragArmed = false;
      handle.classList.remove("is-window-move-active");
      document.body.classList.remove("controler-window-move-active");
      if (moveInteractionActive) {
        moveInteractionActive = false;
        if (typeof electronApi?.windowEndMove === "function") {
          void electronApi.windowEndMove();
        }
      }
      if (suppressClick) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.isPrimary === false) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!canStart()) return;

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      cleanup();
      pointerId = event.pointerId;
      startPointerX = event.screenX;
      startPointerY = event.screenY;
      startWindowX = Number.isFinite(window.screenX) ? window.screenX : 0;
      startWindowY = Number.isFinite(window.screenY) ? window.screenY : 0;
      try {
        handle.setPointerCapture?.(pointerId);
      } catch {}
      if (!moveInteractionActive && typeof electronApi?.windowBeginMove === "function") {
        moveInteractionActive = true;
        void electronApi.windowBeginMove();
      }
    });

    handle.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const deltaX = event.screenX - startPointerX;
      const deltaY = event.screenY - startPointerY;
      if (!dragArmed) {
        if (
          Math.abs(deltaX) >= WINDOW_MOVE_START_DISTANCE_PX ||
          Math.abs(deltaY) >= WINDOW_MOVE_START_DISTANCE_PX
        ) {
          dragArmed = true;
          handle.classList.add("is-window-move-active");
          document.body.classList.add("controler-window-move-active");
        }
        if (!dragArmed) {
          return;
        }
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      schedulePosition({
        x: Math.round(startWindowX + deltaX),
        y: Math.round(startWindowY + deltaY),
      });
    });

    const finalize = (event) => {
      if (pointerId !== null && event?.pointerId !== pointerId) {
        return;
      }
      if (event?.cancelable) {
        event.preventDefault();
      }
      event?.stopPropagation?.();
      cleanup({ suppressClick: dragArmed });
    };

    handle.addEventListener("pointerup", finalize);
    handle.addEventListener("pointercancel", finalize);
    handle.addEventListener("lostpointercapture", finalize);
    handle.addEventListener("dragstart", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener(
      "click",
      (event) => {
        if (!suppressNextClick) {
          return;
        }
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );

    return {
      destroy() {
        cleanup();
      },
    };
  }

  function injectElectronWindowChromeStyles() {
    if (document.getElementById("controler-electron-window-chrome-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "controler-electron-window-chrome-style";
    style.textContent = `
      html.controler-electron-window-root {
        overflow: hidden;
      }

      body.controler-electron-window {
        --controler-electron-frame-inset: 4px;
        --controler-electron-surface-radius: 24px;
        --controler-electron-frame-radius: calc(
          var(--controler-electron-surface-radius) -
            var(--controler-electron-frame-inset)
        );
        --controler-electron-toolbar-top: 12px;
        overflow: hidden;
        border-radius: var(--controler-electron-surface-radius);
        clip-path: none;
        isolation: auto;
        background-clip: padding-box;
        box-shadow:
          inset 0 0 0 1px
            color-mix(
              in srgb,
              var(--panel-border-color, rgba(255, 255, 255, 0.18)) 82%,
              rgba(255, 255, 255, 0.12)
            ),
          0 22px 42px rgba(0, 0, 0, 0.18);
      }

      body.controler-electron-window::before {
        display: none !important;
      }

      body.controler-electron-window[data-controler-window-maximized="true"]::before {
        inset: 2px;
      }

      body.controler-electron-window[data-controler-window-maximized="true"] {
        --controler-electron-frame-inset: 2px;
        --controler-electron-surface-radius: 18px;
      }

      body.controler-electron-window.desktop-widget-page {
        --controler-electron-frame-inset: 3px;
        --controler-electron-surface-radius: 20px;
      }

      body.controler-electron-window[data-controler-electron-platform="win32"] {
        --controler-electron-toolbar-top: 42px;
      }

      #controler-electron-window-chrome-host {
        position: fixed;
        inset: 0;
        z-index: 4190;
        pointer-events: none;
      }

      body.controler-electron-window :is(
          .ms,
          .ss,
          .ts,
          .modal-content,
          .settings-card,
          .planner-panel,
          .stats-section-panel,
          .widget-action-card,
          .tree-select-menu,
          .existing-projects,
          .guide-card,
          .stats-shell,
          .app-nav,
          .page-loading-overlay,
          .page-loading-card
        ) {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      body.controler-electron-window :is(
          button,
          [role="button"],
          .bts,
          .time-quick-btn,
          .todo-action-btn,
          .record-action-btn,
          .tree-select-button,
          .controler-pressable,
          .widget-action-card-button,
          .settings-collapse-toggle,
          .app-nav-button,
          .project-item,
          .todo-item,
          .calendar-day,
          .plan-timeline-block,
          .weekly-glass-time-block
        ) {
        transform: none !important;
        filter: none !important;
        will-change: auto !important;
        isolation: auto !important;
        backface-visibility: visible !important;
        -webkit-backface-visibility: visible !important;
      }

      body.controler-electron-window :is(
          .bts,
          .time-quick-btn,
          .todo-action-btn,
          .record-action-btn,
          .tree-select-button,
          .controler-pressable,
          .widget-action-card-button,
          .settings-collapse-toggle,
          .app-nav-button,
          .project-item,
          .todo-item,
          .calendar-day,
          .plan-timeline-block,
          .weekly-glass-time-block
        )::before,
      body.controler-electron-window :is(
          .bts,
          .time-quick-btn,
          .todo-action-btn,
          .record-action-btn,
          .tree-select-button,
          .controler-pressable,
          .widget-action-card-button,
          .settings-collapse-toggle,
          .app-nav-button,
          .project-item,
          .todo-item,
          .calendar-day,
          .plan-timeline-block,
          .weekly-glass-time-block
        )::after {
        content: none !important;
      }

      #controler-electron-window-toolbar {
        position: fixed;
        top: var(--controler-electron-toolbar-top);
        right: 16px;
        z-index: 4200;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 7px;
        border-radius: 16px;
        border: 1px solid
          color-mix(
            in srgb,
            var(--panel-border-color, rgba(255, 255, 255, 0.18)) 86%,
            rgba(255, 255, 255, 0.14)
          );
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
          color-mix(
            in srgb,
            var(--panel-strong-bg, rgba(31, 53, 42, 0.82)) 96%,
            transparent
          );
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 10px 20px rgba(0, 0, 0, 0.16);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        -webkit-app-region: no-drag;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      #controler-electron-window-drag-zone {
        position: fixed;
        top: 12px;
        left: 16px;
        z-index: 4150;
        width: min(180px, calc(100vw - 120px));
        height: 40px;
        border-radius: 14px;
        background: transparent;
        -webkit-app-region: no-drag;
        user-select: none;
        -webkit-user-select: none;
        pointer-events: none;
      }

      #controler-electron-window-toolbar .electron-window-action {
        min-width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid
          color-mix(
            in srgb,
            var(--panel-border-color, rgba(255, 255, 255, 0.2)) 82%,
            rgba(255, 255, 255, 0.08)
          );
        border-radius: 10px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
          color-mix(in srgb, var(--panel-bg, rgba(28, 34, 40, 0.86)) 94%, transparent);
        color: var(--text-color, #f5fff8);
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        transition:
          transform 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
        -webkit-app-region: no-drag;
      }

      #controler-electron-window-toolbar .electron-window-move {
        min-width: 52px;
        padding: 0 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--on-accent-text, var(--text-color, #f5fff8));
        background:
          linear-gradient(
            180deg,
            rgba(var(--accent-color-rgb, 142, 214, 164), 0.24),
            rgba(var(--accent-color-rgb, 142, 214, 164), 0.12)
          ),
          rgba(255, 255, 255, 0.08);
        border-color: rgba(var(--accent-color-rgb, 142, 214, 164), 0.34);
        cursor: grab;
        -webkit-app-region: no-drag;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        transition:
          background-color 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease,
          opacity 0.18s ease;
      }

      #controler-electron-window-toolbar .electron-window-move[data-drag-mode="native"] {
        -webkit-app-region: drag;
        cursor: grab;
      }

      #controler-electron-window-toolbar
        .electron-window-move[data-drag-mode="native"]:active {
        cursor: grabbing;
      }

      #controler-electron-window-toolbar .electron-window-action:hover {
        transform: translateY(-1px);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03)),
          color-mix(
            in srgb,
            var(--panel-strong-bg, rgba(36, 52, 46, 0.86)) 94%,
            rgba(var(--accent-color-rgb, 142, 214, 164), 0.06)
          );
        border-color: rgba(var(--accent-color-rgb, 142, 214, 164), 0.2);
      }

      #controler-electron-window-toolbar .electron-window-move:hover {
        background:
          linear-gradient(
            180deg,
            rgba(var(--accent-color-rgb, 142, 214, 164), 0.3),
          rgba(var(--accent-color-rgb, 142, 214, 164), 0.16)
          ),
          rgba(255, 255, 255, 0.12);
        border-color: rgba(var(--accent-color-rgb, 142, 214, 164), 0.42);
        transform: none;
      }

      #controler-electron-window-toolbar .electron-window-move:disabled {
        opacity: 0.48;
        cursor: not-allowed;
        -webkit-app-region: no-drag;
      }

      #controler-electron-window-toolbar .electron-window-move.is-window-move-active {
        cursor: grabbing;
        transform: none;
      }

      #controler-electron-window-toolbar .electron-window-close {
        color: var(--button-text, #fff);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02)),
          var(--delete-btn, rgba(255, 126, 126, 0.86));
        border-color: color-mix(
          in srgb,
          var(--delete-btn, rgba(255, 126, 126, 0.86)) 62%,
          rgba(255, 255, 255, 0.16)
        );
      }

      #controler-electron-window-toolbar .electron-window-close:hover {
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02)),
          var(--delete-hover, rgba(255, 100, 100, 0.96));
      }

      body.controler-window-move-active,
      body.controler-window-move-active * {
        user-select: none !important;
        cursor: grabbing !important;
      }

      @media (max-width: 860px) {
        #controler-electron-window-drag-zone {
          top: 10px;
          left: 12px;
          width: min(132px, calc(100vw - 104px));
          height: 36px;
        }

        #controler-electron-window-toolbar {
          top: max(10px, calc(var(--controler-electron-toolbar-top) - 2px));
          right: 12px;
          gap: 5px;
          padding: 4px 6px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function initElectronWindowChrome() {
    const electronApi = window.electronAPI;
    const usesNativeWindowChrome =
      electronApi?.windowChromeMode === "native-overlay";
    const shouldUseNativeMoveHandle =
      electronApi?.isElectron && electronApi.platform === "win32";
    if (
      !electronApi?.isElectron ||
      electronApi.platform === "darwin" ||
      usesNativeWindowChrome ||
      !document.body ||
      document.body.dataset.controlerSkipElectronChrome === "true"
    ) {
      return;
    }

    document.documentElement.classList.add("controler-electron-window-root");
    document.body.classList.add("controler-electron-window");
    document.body.dataset.controlerElectronPlatform = electronApi.platform || "";
    document.body.dataset.controlerElectronWindowChromeReady = "true";

    injectElectronWindowChromeStyles();

    const chromeState =
      window.__controlerElectronWindowChromeState ||
      (window.__controlerElectronWindowChromeState = {
        host: null,
        toolbar: null,
        minimizeButton: null,
        moveButton: null,
        maximizeButton: null,
        closeButton: null,
        moveHandleBinding: null,
        listenersBound: false,
        observer: null,
        isCleaningUp: false,
        state: {
          isMaximized: false,
        },
      });

    chromeState.electronApi = electronApi;
    const getWindowChromeCapabilities = () => ({
      canMove:
        shouldUseNativeMoveHandle ||
        typeof electronApi.windowSetPosition === "function",
      canMinimize: typeof electronApi.windowMinimize === "function",
      canMaximize: typeof electronApi.windowToggleMaximize === "function",
      canClose: typeof electronApi.windowClose === "function",
      canSyncAppearance: typeof electronApi.windowUpdateAppearance === "function",
      canReadState: typeof electronApi.windowGetState === "function",
    });

    const createToolbar = () => {
      const toolbar = document.createElement("div");
      toolbar.id = "controler-electron-window-toolbar";
      toolbar.innerHTML = `
        <button
          type="button"
          class="electron-window-action electron-window-move"
          data-window-action="move"
          title="按住拖动窗口"
          aria-label="按住拖动窗口"
        >移动</button>
        <button
          type="button"
          class="electron-window-action"
          data-window-action="minimize"
          title="最小化窗口"
          aria-label="最小化窗口"
        >—</button>
        <button
          type="button"
          class="electron-window-action"
          data-window-action="maximize"
          title="最大化窗口"
          aria-label="最大化窗口"
        >□</button>
        <button
          type="button"
          class="electron-window-action electron-window-close"
          data-window-action="close"
          title="关闭窗口"
          aria-label="关闭窗口"
        >×</button>
      `;
      return toolbar;
    };

    const ensureChromeHostMounted = () => {
      if (!(document.body instanceof HTMLElement)) {
        return null;
      }
      let host = document.getElementById("controler-electron-window-chrome-host");
      if (!(host instanceof HTMLElement)) {
        host = document.createElement("div");
        host.id = "controler-electron-window-chrome-host";
        document.body.appendChild(host);
      } else if (host.parentElement !== document.body) {
        document.body.appendChild(host);
      }
      chromeState.host = host;
      return host;
    };

    const bindToolbarActions = (toolbar) => {
      if (!(toolbar instanceof HTMLElement)) {
        return;
      }
      if (toolbar.dataset.controlerWindowChromeBound === "true") {
        return;
      }
      toolbar.dataset.controlerWindowChromeBound = "true";

      const minimizeButton = toolbar.querySelector(
        '[data-window-action="minimize"]',
      );
      const maximizeButton = toolbar.querySelector(
        '[data-window-action="maximize"]',
      );
      const closeButton = toolbar.querySelector('[data-window-action="close"]');

      minimizeButton?.addEventListener("click", async (event) => {
        event.preventDefault();
        if (typeof electronApi.windowMinimize === "function") {
          await electronApi.windowMinimize();
        }
      });

      maximizeButton?.addEventListener("click", async (event) => {
        event.preventDefault();
        if (typeof electronApi.windowToggleMaximize === "function") {
          const response = await electronApi.windowToggleMaximize();
          chromeState.applyWindowState?.(response || {});
        }
      });

      closeButton?.addEventListener("click", async (event) => {
        event.preventDefault();
        if (typeof electronApi.windowClose === "function") {
          await electronApi.windowClose();
        }
      });
    };

    const ensureToolbarMounted = () => {
      const mountRoot = ensureChromeHostMounted();
      if (!(mountRoot instanceof HTMLElement)) {
        return null;
      }

      let toolbar = document.getElementById("controler-electron-window-toolbar");
      if (!(toolbar instanceof HTMLElement)) {
        toolbar = createToolbar();
        mountRoot.appendChild(toolbar);
      } else if (toolbar.parentElement !== mountRoot) {
        mountRoot.appendChild(toolbar);
      }

      bindToolbarActions(toolbar);

      const previousMoveButton = chromeState.moveButton;
      chromeState.toolbar = toolbar;
      chromeState.minimizeButton = toolbar.querySelector(
        '[data-window-action="minimize"]',
      );
      chromeState.moveButton = toolbar.querySelector('[data-window-action="move"]');
      chromeState.maximizeButton = toolbar.querySelector(
        '[data-window-action="maximize"]',
      );
      chromeState.closeButton = toolbar.querySelector(
        '[data-window-action="close"]',
      );

      if (
        chromeState.moveHandleBinding &&
        previousMoveButton &&
        previousMoveButton !== chromeState.moveButton
      ) {
        chromeState.moveHandleBinding.destroy?.();
        chromeState.moveHandleBinding = null;
      }

      if (
        chromeState.moveButton instanceof HTMLElement
      ) {
        chromeState.moveButton.setAttribute("draggable", "false");
      }

      if (shouldUseNativeMoveHandle) {
        if (chromeState.moveHandleBinding) {
          chromeState.moveHandleBinding.destroy?.();
          chromeState.moveHandleBinding = null;
        }
        if (chromeState.moveButton instanceof HTMLElement) {
          chromeState.moveButton.dataset.controlerMoveHandleBound = "native-drag";
        }
      } else if (
        !chromeState.moveHandleBinding &&
        chromeState.moveButton instanceof HTMLElement
      ) {
        chromeState.moveHandleBinding = bindWindowMoveHandle(
          chromeState.moveButton,
          electronApi,
          {
            canStart: () => !chromeState.state.isMaximized,
          },
        );
      }

      return toolbar;
    };

    const updateToolbarUi = () => {
      ensureToolbarMounted();
      const capabilities = getWindowChromeCapabilities();
      if (chromeState.moveButton) {
        const nativeMoveEnabled =
          shouldUseNativeMoveHandle &&
          capabilities.canMove &&
          !chromeState.state.isMaximized;
        chromeState.moveButton.disabled =
          chromeState.state.isMaximized || !capabilities.canMove;
        if (nativeMoveEnabled) {
          chromeState.moveButton.dataset.dragMode = "native";
        } else {
          delete chromeState.moveButton.dataset.dragMode;
        }
        chromeState.moveButton.title = !capabilities.canMove
          ? "当前窗口不支持移动"
          : chromeState.state.isMaximized
            ? "还原窗口后可移动窗口"
            : "按住拖动窗口";
        chromeState.moveButton.setAttribute(
          "aria-label",
          !capabilities.canMove
            ? "当前窗口不支持移动"
            : chromeState.state.isMaximized
              ? "还原窗口后可移动窗口"
              : "按住拖动窗口",
        );
      }
      if (chromeState.minimizeButton) {
        chromeState.minimizeButton.disabled = !capabilities.canMinimize;
        chromeState.minimizeButton.title = capabilities.canMinimize
          ? "最小化窗口"
          : "当前窗口不支持最小化";
        chromeState.minimizeButton.setAttribute(
          "aria-label",
          capabilities.canMinimize ? "最小化窗口" : "当前窗口不支持最小化",
        );
      }
      if (chromeState.maximizeButton) {
        chromeState.maximizeButton.disabled = !capabilities.canMaximize;
        chromeState.maximizeButton.textContent = chromeState.state.isMaximized
          ? "❐"
          : "□";
        chromeState.maximizeButton.title = !capabilities.canMaximize
          ? "当前窗口不支持最大化"
          : chromeState.state.isMaximized
            ? "还原窗口"
            : "最大化窗口";
        chromeState.maximizeButton.setAttribute(
          "aria-label",
          !capabilities.canMaximize
            ? "当前窗口不支持最大化"
            : chromeState.state.isMaximized
              ? "还原窗口"
              : "最大化窗口",
        );
      }
      if (chromeState.closeButton) {
        chromeState.closeButton.disabled = !capabilities.canClose;
        chromeState.closeButton.title = capabilities.canClose
          ? "关闭窗口"
          : "当前窗口不支持关闭";
        chromeState.closeButton.setAttribute(
          "aria-label",
          capabilities.canClose ? "关闭窗口" : "当前窗口不支持关闭",
        );
      }
    };

    const applyWindowState = (nextState = {}) => {
      if (typeof nextState.isMaximized === "boolean") {
        chromeState.state.isMaximized = nextState.isMaximized;
      }
      document.body.dataset.controlerWindowMaximized =
        chromeState.state.isMaximized ? "true" : "false";
      updateToolbarUi();
    };

    const syncWindowAppearance = async (themeDetail = null) => {
      ensureToolbarMounted();
      if (!getWindowChromeCapabilities().canSyncAppearance) {
        return;
      }
      const colors = readThemeSurfaceColors(themeDetail);
      try {
        const response = await electronApi.windowUpdateAppearance({
          ...colors,
          overlayHeight: DEFAULT_ELECTRON_TITLEBAR_HEIGHT,
        });
        applyWindowState(response || {});
      } catch (error) {
        console.error("同步 Electron 窗口样式失败:", error);
      }
    };

    const syncWindowState = async () => {
      ensureToolbarMounted();
      if (!getWindowChromeCapabilities().canReadState) {
        return;
      }
      try {
        const response = await electronApi.windowGetState();
        applyWindowState(response || {});
      } catch (error) {
        console.error("读取 Electron 窗口状态失败:", error);
      }
    };

    chromeState.ensureToolbarMounted = ensureToolbarMounted;
    chromeState.updateToolbarUi = updateToolbarUi;
    chromeState.applyWindowState = applyWindowState;
    chromeState.syncWindowAppearance = syncWindowAppearance;
    chromeState.syncWindowState = syncWindowState;

    if (!chromeState.listenersBound) {
      chromeState.listenersBound = true;

      chromeState.unsubscribeWindowState =
        typeof electronApi.onWindowStateChanged === "function"
          ? electronApi.onWindowStateChanged((nextState) => {
              chromeState.ensureToolbarMounted?.();
              chromeState.applyWindowState?.(nextState || {});
            })
          : null;
      chromeState.unsubscribeThemedMessage =
        typeof electronApi.onThemedMessage === "function"
          ? electronApi.onThemedMessage((payload = {}) => {
              void alertDialog({
                title: payload.title || "提示",
                message: payload.message || "",
                confirmText: payload.confirmText || "知道了",
                danger: !!payload.danger,
              });
            })
          : null;

      chromeState.handleThemeApplied = (event) => {
        chromeState.ensureToolbarMounted?.();
        chromeState.updateToolbarUi?.();
        void chromeState.syncWindowAppearance?.(event.detail || null);
      };
      chromeState.handleFocus = () => {
        chromeState.ensureToolbarMounted?.();
        chromeState.updateToolbarUi?.();
        void chromeState.syncWindowState?.();
      };
      chromeState.handleVisibilityChange = () => {
        if (document.hidden) {
          return;
        }
        chromeState.ensureToolbarMounted?.();
        chromeState.updateToolbarUi?.();
        void chromeState.syncWindowState?.();
      };
      chromeState.handleWindowLoad = () => {
        chromeState.ensureToolbarMounted?.();
        chromeState.updateToolbarUi?.();
      };
      chromeState.handleBeforeUnload = () => {
        if (chromeState.isCleaningUp) {
          return;
        }
        chromeState.isCleaningUp = true;
        chromeState.moveHandleBinding?.destroy?.();
        chromeState.moveHandleBinding = null;
        chromeState.observer?.disconnect();
        chromeState.observer = null;
        chromeState.unsubscribeWindowState?.();
        chromeState.unsubscribeWindowState = null;
        chromeState.unsubscribeThemedMessage?.();
        chromeState.unsubscribeThemedMessage = null;
        window.removeEventListener(
          THEME_APPLIED_EVENT_NAME,
          chromeState.handleThemeApplied,
        );
        window.removeEventListener("focus", chromeState.handleFocus);
        window.removeEventListener("load", chromeState.handleWindowLoad);
        document.removeEventListener(
          "visibilitychange",
          chromeState.handleVisibilityChange,
        );
      };

      window.addEventListener(
        THEME_APPLIED_EVENT_NAME,
        chromeState.handleThemeApplied,
      );
      window.addEventListener("focus", chromeState.handleFocus);
      document.addEventListener(
        "visibilitychange",
        chromeState.handleVisibilityChange,
      );
      window.addEventListener("load", chromeState.handleWindowLoad);
      window.addEventListener("beforeunload", chromeState.handleBeforeUnload, {
        once: true,
      });
    }

    if (!chromeState.observer) {
      chromeState.observer = new MutationObserver(() => {
        if (chromeState.isCleaningUp) {
          return;
        }
        if (!document.getElementById("controler-electron-window-toolbar")) {
          chromeState.ensureToolbarMounted?.();
          chromeState.updateToolbarUi?.();
        }
      });
      chromeState.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    ensureToolbarMounted();
    applyWindowState(chromeState.state);
    [0, 120, 360].forEach((delay) => {
      window.setTimeout(() => {
        chromeState.ensureToolbarMounted?.();
        chromeState.updateToolbarUi?.();
      }, delay);
    });
    void syncWindowAppearance();
    void syncWindowState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initElectronWindowChrome, {
      once: true,
    });
  } else {
    initElectronWindowChrome();
  }

  initModalHistoryObserver();
  initAppNavigationVisibility();
  initAppPageTransitions();
  initAndroidPressFeedback();
  scheduleInitialPagePerfReport();
  scheduleNativePageReadyReport();

  window.ControlerUI = {
    appNavigationItems: APP_NAV_ITEMS.map((item) => ({ ...item })),
    navigateAppPage,
    navigateAppHref,
    registerBeforePageLeave,
    appNavigationVisibilityEventName: APP_NAV_VISIBILITY_EVENT_NAME,
    getAppNavigationState,
    setAppNavigationState,
    getHiddenAppNavigationPages,
    setHiddenAppNavigationPages,
    getOrderedAppNavigationPages,
    setOrderedAppNavigationPages,
    applyAppNavigationVisibility,
    closeModal,
    closeAllModals,
    prepareModalOverlay,
    stopModalContentPropagation,
    bindModalAction,
    setAccentButtonState,
    setAccentButtonGroup,
    enhanceNativeSelect,
    refreshEnhancedSelect,
    bindHorizontalDragScroll,
    bindVerticalDragScroll,
    bindWindowMoveHandle,
    mountDesktopWidgetScale,
    blockingOverlayStateEventName: BLOCKING_OVERLAY_STATE_EVENT_NAME,
    shellVisibilityEventName: SHELL_VISIBILITY_EVENT_NAME,
    hasVisibleBlockingOverlay,
    getShellVisibilityState,
    isShellPageActive,
    normalizeChangedSections,
    hasPeriodOverlap,
    isSerializableEqual,
    createFrameScheduler,
    createDeferredRefreshController,
    createAtomicRefreshController,
    createPageLoadingOverlayController,
    positionFloatingMenu,
    measureExpandSurfaceWidth,
    normalizeExpandSurfaceWidthFactor,
    scaleExpandSurfaceConstraint,
    getDefaultExpandSurfaceWidthFactor: () =>
      DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR,
    loadScriptOnce,
    loadStyleOnce,
    markPerfStage: markPagePerfStage,
    getNativePageReadyMode,
    setNativePageReadyMode,
    markNativePageReady,
    confirmDialog,
    alertDialog,
  };
})();
