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
  const MODAL_ACTION_DEDUP_WINDOW_MS = 280;
  const MODAL_REMOVAL_DEFERRED_DELAY_MS = 24;
  const MODAL_CLOSE_VISUAL_DURATION_MS = 176;
  const ANDROID_MODAL_CLOSE_VISUAL_DURATION_MS = 216;
  const BLOCKING_MUTATION_FULLSCREEN_OVERLAY_DELAY_MS = 1200;
  const BLOCKING_MUTATION_INLINE_OVERLAY_DELAY_MS = 180;
  const ANDROID_MODAL_DISMISS_FREEZE_RELEASE_DELAY_MS = 36;
  const ANDROID_MODAL_DISMISS_FREEZE_RELEASE_MAX_ATTEMPTS = 40;
  const ANDROID_MODAL_DISMISS_PENDING_MAX_MS = 2400;
  const ANDROID_KEYBOARD_TRANSITION_COVER_HOLD_MS = 88;
  const ANDROID_KEYBOARD_TRANSITION_TRAILING_HEIGHT_PX = 18;
  const APP_NAV_VISIBILITY_STORAGE_KEY = "appNavigationVisibility";
  const APP_NAV_VISIBILITY_EVENT_NAME =
    "controler:app-navigation-visibility-changed";
  const BLOCKING_OVERLAY_STATE_EVENT_NAME =
    "controler:blocking-overlay-state-changed";
  const SHELL_VISIBILITY_EVENT_NAME =
    "controler:shell-visibility-changed";
  const SHELL_RESUME_SETTLED_EVENT_NAME =
    "controler:shell-resume-settled";
  const EDGE_BACK_SWIPE_EXCLUSION_ATTR =
    "data-controler-edge-back-exclusion";
  const EDGE_BACK_SWIPE_EXCLUSION_PADDING = 12;
  const APP_NAV_ICON_NS = "http://www.w3.org/2000/svg";
  const TODO_WIDGET_KIND_IDS = new Set(["todos", "checkins"]);
  const PAGE_LOADING_OVERLAY_DELAY_MS = 120;
  const DESKTOP_BOOTSTRAP_PREWARM_DELAY_MS = 420;
  const DESKTOP_BOOTSTRAP_PREWARM_STEP_DELAY_MS = 40;
  const DESKTOP_BOOTSTRAP_PREWARM_IDLE_TIMEOUT_MS = 1200;
  const OFFLINE_ASSET_MANIFEST_GLOBAL =
    "__CONTROLER_OFFLINE_ASSET_MANIFEST__";
  const OFFLINE_ASSET_KEYS = new Set([
    "chart",
    "d3",
    "calHeatmapJs",
    "calHeatmapCss",
  ]);

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
  const APP_PAGE_ENTER_TRANSITION_STATE_KEY =
    "__CONTROLER_APP_ENTER_TRANSITION__";
  const APP_PAGE_CUSTOM_TITLE_STORAGE_KEY =
    "controler:page-custom-topbar-titles";
  const APP_PAGE_CUSTOM_TITLE_IDLE_HINT = "";
  const APP_PAGE_CUSTOM_TITLE_EDIT_HINT = "Enter 保存 · Esc 取消";
  const APP_PAGE_CUSTOM_TITLE_PLACEHOLDER = "输入页面标题";
  const APP_PAGE_CUSTOM_TITLE_MAX_LENGTH = 40;
  const APP_PAGE_TRANSITION_DURATION_MS = 90;
  const APP_PAGE_ENTER_TRANSITION_MAX_AGE_MS = 15000;
  const APP_PAGE_ENTER_LOADING_OVERLAY_DELAY_MS = PAGE_LOADING_OVERLAY_DELAY_MS;
  const RN_APP_PAGE_TRANSITION_ACK_TIMEOUT_MS = 1200;
  const APP_PAGE_LEAVE_GUARD_OVERLAY_DELAY_MS = 120;
  const APP_PAGE_LEAVE_GUARD_SLOW_MESSAGE_DELAY_MS = 2500;
  const APP_PAGE_LEAVE_GUARD_LOADING_TITLE = "正在跳转";
  const APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE =
    "正在处理当前页面数据并切换页面，请稍候";
  const DESKTOP_CONTENT_OVERLAY_HOST_SELECTOR =
    ".app-main, .settings-main";
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
  const APP_NAV_TOUCH_GUARD_MAX_MOVE_PX = 18;
  const APP_NAV_TOUCH_GUARD_CANCEL_WINDOW_MS = 360;
  const ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR = [
    "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='color']):not([type='file']):not([type='image']):not([type='hidden']):not(:disabled)",
    "textarea:not(:disabled)",
    "select:not(:disabled)",
    "[contenteditable='true']:not([data-controler-android-focus-assist='false'])",
    "[contenteditable]:not([contenteditable='false']):not([data-controler-android-focus-assist='false'])",
  ].join(", ");
  const ANDROID_PRIMARY_TEXT_ENTRY_SELECTOR = [
    "input[type='text']:not(:disabled)",
    "input[type='search']:not(:disabled)",
    "input[type='email']:not(:disabled)",
    "input[type='url']:not(:disabled)",
    "input[type='tel']:not(:disabled)",
    "input[type='password']:not(:disabled)",
    "input[type='number']:not(:disabled)",
    "textarea:not(:disabled)",
    "[contenteditable='true']:not([data-controler-android-focus-assist='false'])",
    "[contenteditable]:not([contenteditable='false']):not([data-controler-android-focus-assist='false'])",
  ].join(", ");
  let modalHistoryObserver = null;
  let modalHistorySyncQueued = false;
  let blockingOverlaySyncQueued = false;
  let modalHistoryCompactionPendingCount = 0;
  let modalHistoryCompactionReleaseTimerId = 0;
  const trackedModalTokens = new Map();
  let lastReportedModalCount = -1;
  let lastReportedBlockingOverlaySignature = "";
  let appNavigationInitialized = false;
  let appPageTransitionInitialized = false;
  let appNavigationTouchGuardInitialized = false;
  let appPageTransitionLocked = false;
  let appPageLeavePreflightLocked = false;
  let deferredAppNavigationRequest = null;
  let nativeNavigationListenerBound = false;
  let nativeNavigationRequestCounter = 0;
  let appNavigationIntentCounter = 0;
  let latestAppNavigationIntent = null;
  let pendingNativeNavigationRequest = null;
  let nativeNavigationRetryTimerId = 0;
  let deferredAppNavigationReplayInitialized = false;
  let deferredAppNavigationReplayTimerId = 0;
  let blockingOverlayScrollLockState = null;
  let nativePageReadyReported = false;
  let nativePageReadyScheduled = false;
  let deferredNativePageReadyOptions = null;
  let deferredNativePageReadyFrameId = 0;
  let deferredNativePageReadyObserverBound = false;
  let androidNativeBootstrapTransitionOverlayActive = false;
  let nativeShellResumeReadyPending = false;
  let nativeShellResumeReadyVersion = 0;
  let nativeShellResumeReadyPromise = null;
  let desktopBootstrapPrewarmScheduled = false;
  let desktopBootstrapPrewarmRunning = false;
  let desktopBootstrapPrewarmTimerId = 0;
  let lastReportedAppNavigationStateSignature = "";
  let lastReportedEdgeBackSwipeExclusionSignature = "";
  let lastShellVisibilityStateSignature = "";
  let pendingEdgeBackSwipeExclusionSyncFrame = 0;
  let beforePageLeaveGuardCounter = 0;
  let androidPressFeedbackInitialized = false;
  let androidAppNavFocusSuppressionInitialized = false;
  let androidInteractiveTextAssistInitialized = false;
  let androidInteractiveActionFocusBypassInitialized = false;
  let androidInteractiveActionReplayGuard = null;
  let pendingAndroidInteractiveActionReplay = null;
  let androidModalAutofocusQueued = false;
  let androidKeyboardTransitionCoverInitialized = false;
  let androidKeyboardTransitionCoverSyncQueued = false;
  let androidKeyboardTransitionCoverHoldExtensionPending = false;
  let androidKeyboardTransitionCoverReleaseTimerId = 0;
  let androidKeyboardTransitionCoverHoldUntil = 0;
  let androidKeyboardTransitionCoverLastHeightPx = 0;
  let androidKeyboardTransitionCoverLastInsetPx = 0;
  let androidKeyboardTransitionCoverLastBackground = "";
  let androidModalKeyboardDismissGuardQueued = false;
  let androidModalKeyboardDismissGuardToken = 0;
  let androidModalKeyboardDismissGuardTimerIds = [];
  let androidModalKeyboardDismissGuardLastOpen = false;
  let androidReactNativeAppNavLocked = false;
  let pendingAndroidInteractiveTextFocusTransferTimerId = 0;
  let pendingAndroidInteractiveTextFocusTransferTarget = null;
  let lastAndroidInteractiveTextFocusIntentAt = 0;
  let lastAndroidInteractiveTextFocusIntentTarget = null;
  let lastAndroidSoftInputRequestAt = 0;
  const modalInteractionIntentTimestamps = new WeakMap();
  const ANDROID_SOFT_INPUT_REQUEST_DEDUP_WINDOW_MS = 320;
  const ANDROID_SOFT_INPUT_REQUEST_SETTLE_WINDOW_MS = 420;
  const ANDROID_SOFT_INPUT_REQUEST_POST_SETTLE_WINDOW_MS = 120;
  const ANDROID_MODAL_MANUAL_KEYBOARD_DISMISS_SUPPRESS_MS = 960;
  const ANDROID_MODAL_KEYBOARD_DISMISS_SYNC_DELAYS_MS = [0, 48, 120, 220, 360];
  const activeAndroidPressTargets = new Map();
  const androidAutofocusedModalRoots = new WeakSet();
  const androidPreferredModalFocusTargets = new WeakMap();
  let lastAndroidAutofocusVisibleModal = null;
  let activeAppNavigationTouchGesture = null;

  function isAndroidFocusAssistOptedOut(target) {
    return (
      target instanceof HTMLElement &&
      target.dataset?.controlerAndroidFocusAssist === "false"
    );
  }

  function isManagedAndroidTextFocusTarget(target) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    return (
      focusTarget.dataset?.controlerManagedAndroidFocus === "true" ||
      focusTarget.closest?.("[data-controler-managed-android-focus='true']") instanceof
        HTMLElement
    );
  }

  function isAndroidInteractiveTextControlCandidate(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.matches?.(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR)) {
      return true;
    }
    return target.isContentEditable === true && !isAndroidFocusAssistOptedOut(target);
  }

  function markAndroidInteractiveTextFocusIntent(target) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    lastAndroidInteractiveTextFocusIntentAt = Date.now();
    lastAndroidInteractiveTextFocusIntentTarget = focusTarget;
    rememberModalPreferredInteractiveTextControl(focusTarget);
    return true;
  }

  function clearAndroidInteractiveTextFocusIntent(target = null) {
    if (!(target instanceof HTMLElement)) {
      lastAndroidInteractiveTextFocusIntentAt = 0;
      lastAndroidInteractiveTextFocusIntentTarget = null;
      return true;
    }
    const focusTarget =
      resolveInteractiveTextControlTarget(target) || target;
    const intentTarget = lastAndroidInteractiveTextFocusIntentTarget;
    if (!(focusTarget instanceof HTMLElement) || !(intentTarget instanceof HTMLElement)) {
      return false;
    }
    if (
      intentTarget !== focusTarget &&
      intentTarget.contains?.(focusTarget) !== true &&
      focusTarget.contains?.(intentTarget) !== true
    ) {
      return false;
    }
    lastAndroidInteractiveTextFocusIntentAt = 0;
    lastAndroidInteractiveTextFocusIntentTarget = null;
    return true;
  }

  function hasRecentAndroidInteractiveTextFocusIntent(target, maxAgeMs = 480) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    const safeMaxAgeMs = Math.max(120, Number(maxAgeMs) || 480);
    if (Date.now() - lastAndroidInteractiveTextFocusIntentAt > safeMaxAgeMs) {
      return false;
    }
    const intentTarget = lastAndroidInteractiveTextFocusIntentTarget;
    if (!(intentTarget instanceof HTMLElement)) {
      return false;
    }
    return (
      intentTarget === focusTarget ||
      intentTarget.contains?.(focusTarget) === true ||
      focusTarget.contains?.(intentTarget) === true
    );
  }

  function clearPendingAndroidInteractiveTextFocusTransfer(target = null) {
    if (
      target instanceof HTMLElement &&
      pendingAndroidInteractiveTextFocusTransferTarget instanceof HTMLElement
    ) {
      const requestedTarget =
        resolveInteractiveTextControlTarget(target) || target;
      const pendingTarget = pendingAndroidInteractiveTextFocusTransferTarget;
      if (
        requestedTarget !== pendingTarget &&
        requestedTarget.contains?.(pendingTarget) !== true &&
        pendingTarget.contains?.(requestedTarget) !== true
      ) {
        return false;
      }
    }
    if (pendingAndroidInteractiveTextFocusTransferTimerId > 0) {
      window.clearTimeout(pendingAndroidInteractiveTextFocusTransferTimerId);
    }
    pendingAndroidInteractiveTextFocusTransferTimerId = 0;
    pendingAndroidInteractiveTextFocusTransferTarget = null;
    return true;
  }

  function cancelAndroidInteractiveTextFocusWork(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const focusTargets = new Set();
    const registerFocusTarget = (candidate) => {
      const focusTarget =
        candidate instanceof HTMLElement
          ? resolveInteractiveTextControlTarget(candidate) || candidate
          : resolveInteractiveTextControlTarget(candidate);
      if (!(focusTarget instanceof HTMLElement)) {
        return false;
      }
      focusTargets.add(focusTarget);
      return true;
    };

    registerFocusTarget(target);
    target
      .querySelectorAll?.(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR)
      ?.forEach?.((node) => {
        registerFocusTarget(node);
      });

    const cancelledAt = Date.now();
    let didCancel = clearPendingAndroidInteractiveTextFocusTransfer(target);
    releaseAndroidModalAutofocusFromNode(target);
    focusTargets.forEach((focusTarget) => {
      clearPendingAndroidInteractiveTextFocusTransfer(focusTarget);
      clearAndroidInteractiveTextControlPendingRetries(focusTarget);
      clearAndroidSoftInputRequestState(focusTarget);
      clearAndroidInteractiveTextFocusIntent(focusTarget);
      focusTarget.__controlerAndroidSoftInputDismissedAt = Math.max(
        Number(focusTarget.__controlerAndroidSoftInputDismissedAt || 0),
        cancelledAt,
      );
      didCancel = true;
    });
    return didCancel;
  }

  function scheduleAndroidInteractiveTextFocusTransfer(target, options = {}) {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (
      !(focusTarget instanceof HTMLElement) ||
      !isVisibleInteractiveTextControl(focusTarget)
    ) {
      return false;
    }

    clearPendingAndroidInteractiveTextFocusTransfer();
    pendingAndroidInteractiveTextFocusTransferTarget = focusTarget;
    const delayMs = Math.max(0, Number(options.delayMs) || 84);
    const shouldSelectText = options.selectText === true;
    pendingAndroidInteractiveTextFocusTransferTimerId = window.setTimeout(() => {
      pendingAndroidInteractiveTextFocusTransferTimerId = 0;
      pendingAndroidInteractiveTextFocusTransferTarget = null;
      if (
        !focusTarget.isConnected ||
        !isVisibleInteractiveTextControl(focusTarget) ||
        shouldSuppressAndroidInteractiveTextFocus() ||
        !hasRecentAndroidInteractiveTextFocusIntent(focusTarget, 960)
      ) {
        return;
      }
      const activeControl = getActiveAndroidInteractiveTextControl();
      if (activeControl instanceof HTMLElement && activeControl !== focusTarget) {
        return;
      }
      try {
        focusTarget.focus({
          preventScroll: true,
        });
      } catch (error) {
        focusTarget.focus?.();
      }
      if (
        shouldSelectText &&
        isFocusedInteractiveTextControl(focusTarget) &&
        typeof focusTarget.setSelectionRange === "function" &&
        typeof focusTarget.value === "string"
      ) {
        const textLength = focusTarget.value.length;
        try {
          focusTarget.setSelectionRange(textLength, textLength);
        } catch (error) {}
      }
      if (!isFocusedInteractiveTextControl(focusTarget) || isAndroidKeyboardOpen()) {
        return;
      }
      window.setTimeout(() => {
        if (
          isFocusedInteractiveTextControl(focusTarget) &&
          !isAndroidKeyboardOpen() &&
          hasRecentAndroidInteractiveTextFocusIntent(focusTarget, 1200)
        ) {
          requestAndroidSoftInputForFocusedTarget(focusTarget, {
            mode: "show",
          });
        }
      }, 96);
    }, delayMs);
    return true;
  }
  let lastCanceledAppNavigationTouchGesture = null;
  function normalizeAppPageEnterTransitionState(source = {}) {
    return {
      active: source?.active === true,
      fromPage:
        typeof source?.fromPage === "string" ? source.fromPage.trim() : "",
      toPage: typeof source?.toPage === "string" ? source.toPage.trim() : "",
      targetHref:
        typeof source?.targetHref === "string" ? source.targetHref.trim() : "",
      startedAt: Math.max(
        0,
        Number.isFinite(Number(source?.startedAt))
          ? Number(source.startedAt)
          : 0,
      ),
      loadingOverlaySuppressionActive:
        source?.loadingOverlaySuppressionActive === true,
      loadingOverlaySuppressionExpiresAt: Math.max(
        0,
        Number.isFinite(Number(source?.loadingOverlaySuppressionExpiresAt))
          ? Number(source.loadingOverlaySuppressionExpiresAt)
          : 0,
      ),
    };
  }
  const appPageEnterTransitionState = normalizeAppPageEnterTransitionState(
    window?.[APP_PAGE_ENTER_TRANSITION_STATE_KEY],
  );

  function getAppPageEnterTransitionState() {
    return {
      ...appPageEnterTransitionState,
    };
  }

  function writeAppPageEnterTransitionState(nextState = {}) {
    const normalizedState = normalizeAppPageEnterTransitionState(nextState);
    Object.assign(appPageEnterTransitionState, normalizedState);
    try {
      window[APP_PAGE_ENTER_TRANSITION_STATE_KEY] = {
        ...normalizedState,
      };
    } catch {}
    return getAppPageEnterTransitionState();
  }

  function clearAppPageEnterTransitionState() {
    return writeAppPageEnterTransitionState({});
  }

  const ANDROID_INTERACTIVE_ACTION_SELECTOR = [
    "button:not(:disabled)",
    "input[type='button']:not(:disabled)",
    "input[type='submit']:not(:disabled)",
    "input[type='reset']:not(:disabled)",
    "a[href]",
    "[role='button']",
    ".bts",
    ".todo-action-btn",
    ".record-action-btn",
    ".widget-action-card-button",
    ".widget-action-card",
    ".tree-select-button",
    ".tree-select-option",
    ".app-nav-button",
    "[data-controler-pressable='true']",
  ].join(", ");
  const ANDROID_INTERACTIVE_ACTION_CLICK_BYPASS_WINDOW_MS = 420;
  const ANDROID_INTERACTIVE_ACTION_REPLAY_DISTANCE_PX = 48;
  function resetAndroidModalAutofocusState(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    androidAutofocusedModalRoots.delete(target);
    androidPreferredModalFocusTargets.delete(target);
    delete target.dataset.controlerPreferredTextFocusId;
    delete target.dataset.controlerAutofocusRequestedAt;
    delete target.dataset.controlerDisableAutofocus;
    delete target.dataset.controlerDisableAutofocusUntil;
    if (lastAndroidAutofocusVisibleModal === target) {
      lastAndroidAutofocusVisibleModal = null;
    }
  }

  function releaseAndroidModalAutofocusFromNode(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (node.classList.contains("modal-overlay")) {
      resetAndroidModalAutofocusState(node);
    }
    node.querySelectorAll?.(".modal-overlay").forEach((modal) => {
      resetAndroidModalAutofocusState(modal);
    });
  }
  const beforePageLeaveGuards = new Map();
  const pendingAssetLoads = new Map();
  let appPageLeaveOverlayElement = null;
  let appPageLeaveOverlayController = null;
  let appPageLeaveOverlayVisible = false;
  let appPageLeaveOverlayShellVisibilityBound = false;
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
    const hasExplicitInitialState = !!initialState;
    const defaultActive = hasExplicitInitialState
      ? initialState?.active !== false
      : !isReactNativeNavigationRuntime() ||
        document.visibilityState !== "hidden";
    return {
      active: defaultActive,
      slot:
        typeof initialState?.slot === "string" ? initialState.slot.trim() : "",
      reason:
        typeof initialState?.reason === "string"
          ? initialState.reason.trim()
          : hasExplicitInitialState
            ? "initial"
            : defaultActive
              ? "initial-visible"
              : "bootstrap-pending",
      page:
        typeof initialState?.page === "string" ? initialState.page.trim() : "",
      href:
        typeof initialState?.href === "string" ? initialState.href.trim() : "",
      transitionLoading: initialState?.transitionLoading === true,
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

  function getOfflineAssetManifest() {
    const manifest =
      window[OFFLINE_ASSET_MANIFEST_GLOBAL] ||
      globalThis?.[OFFLINE_ASSET_MANIFEST_GLOBAL] ||
      null;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return null;
    }
    return manifest;
  }

  function resolveOfflineAssetUrl(assetKey) {
    const normalizedKey = String(assetKey || "").trim();
    if (!OFFLINE_ASSET_KEYS.has(normalizedKey)) {
      throw new Error(`未知离线资源键: ${normalizedKey || "(empty)"}`);
    }

    const manifest = getOfflineAssetManifest();
    if (!manifest) {
      throw new Error("离线资源 manifest 未加载");
    }

    const fileName = String(manifest[normalizedKey] || "").trim();
    if (!fileName) {
      throw new Error(`离线资源 manifest 缺少条目: ${normalizedKey}`);
    }

    return normalizeAssetUrl(`offline-assets/${fileName}`);
  }

  function evaluateAssetReadyCheck(readyCheck) {
    if (typeof readyCheck !== "function") {
      return false;
    }
    try {
      return readyCheck() === true;
    } catch (error) {
      return false;
    }
  }

  function loadScriptOnce(assetUrl, options = {}) {
    const normalizedUrl = normalizeAssetUrl(assetUrl);
    if (!normalizedUrl) {
      return Promise.reject(new Error("脚本地址为空"));
    }
    const readyCheck = typeof options.ready === "function" ? options.ready : null;
    const readyTimeoutMs = Math.max(
      250,
      Math.round(Number(options.readyTimeoutMs) || 5000),
    );

    const cacheKey = `script:${normalizedUrl}`;
    if (pendingAssetLoads.has(cacheKey)) {
      return pendingAssetLoads.get(cacheKey);
    }

    const existing = Array.from(document.scripts).find(
      (script) => normalizeAssetUrl(script.getAttribute("src")) === normalizedUrl,
    );
    if (
      existing?.dataset?.controlerLoaded === "true" ||
      (existing && evaluateAssetReadyCheck(readyCheck))
    ) {
      if (existing) {
        existing.dataset.controlerLoaded = "true";
      }
      return Promise.resolve(existing);
    }

    const loader = new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      let readyPollTimer = 0;
      let readyTimeoutTimer = 0;
      let settled = false;
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
        if (readyPollTimer) {
          window.clearTimeout(readyPollTimer);
          readyPollTimer = 0;
        }
        if (readyTimeoutTimer) {
          window.clearTimeout(readyTimeoutTimer);
          readyTimeoutTimer = 0;
        }
      };

      const resolveLoad = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        script.dataset.controlerLoaded = "true";
        resolve(script);
      };

      const rejectLoad = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        pendingAssetLoads.delete(cacheKey);
        reject(error);
      };

      const pollReadyState = () => {
        if (settled || !readyCheck) {
          return;
        }
        if (evaluateAssetReadyCheck(readyCheck)) {
          resolveLoad();
          return;
        }
        readyPollTimer = window.setTimeout(pollReadyState, 16);
      };

      const startReadyWatch = () => {
        if (!readyCheck || settled) {
          return;
        }
        if (evaluateAssetReadyCheck(readyCheck)) {
          resolveLoad();
          return;
        }
        if (!readyTimeoutTimer) {
          readyTimeoutTimer = window.setTimeout(() => {
            if (evaluateAssetReadyCheck(readyCheck)) {
              resolveLoad();
              return;
            }
            rejectLoad(new Error(`脚本已加载但未就绪: ${normalizedUrl}`));
          }, readyTimeoutMs);
        }
        if (!readyPollTimer) {
          readyPollTimer = window.setTimeout(pollReadyState, 16);
        }
      };

      const handleLoad = () => {
        if (!readyCheck) {
          resolveLoad();
          return;
        }
        startReadyWatch();
      };

      const handleError = () => {
        rejectLoad(new Error(`脚本加载失败: ${normalizedUrl}`));
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!existing) {
        document.head.appendChild(script);
      }
      if (readyCheck) {
        startReadyWatch();
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
      transitionLoading: source.transitionLoading === true,
      receivedAt: Date.now(),
    };
  }

  function getShellVisibilityState() {
    return { ...shellVisibilityState };
  }

  function isShellPageActive() {
    return shellVisibilityState.active !== false;
  }

  function isShellTransitionLoading() {
    return (
      shellVisibilityState.active !== false &&
      shellVisibilityState.transitionLoading === true
    );
  }

  function shouldSuppressAndroidInteractiveTextFocus() {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    return !isShellPageActive() || isShellTransitionLoading();
  }

  function shouldBlockReactNativeShellNavigationInteraction() {
    return (
      isReactNativeNavigationRuntime() &&
      (!isShellPageActive() || isShellTransitionLoading())
    );
  }

  function applyShellVisibilityState(detail = {}) {
    const nextState = normalizeShellVisibilityState(detail);
    const nextStateEnteringActiveTransitionLoading =
      isReactNativeNavigationRuntime() &&
      nextState.active !== false &&
      nextState.transitionLoading === true &&
      (shellVisibilityState.active === false ||
        shellVisibilityState.transitionLoading !== true);
    const nextStateLeavingActiveTransitionLoading =
      isReactNativeNavigationRuntime() &&
      shellVisibilityState.active !== false &&
      shellVisibilityState.transitionLoading === true &&
      (nextState.active === false || nextState.transitionLoading !== true);
    const nextSignature = JSON.stringify({
      active: nextState.active,
      slot: nextState.slot,
      reason: nextState.reason,
      page: nextState.page,
      href: nextState.href,
      transitionLoading: nextState.transitionLoading === true,
    });
    if (nextSignature === lastShellVisibilityStateSignature) {
      return;
    }

    if (
      isReactNativeNavigationRuntime() &&
      shellVisibilityState.active !== nextState.active
    ) {
      if (nextState.active === false) {
        discardDeferredAppNavigationRequest("shell-inactive");
        releaseAndroidInteractiveTextControlFocus();
      }
      resetAppPageTransitionRuntimeState({
        clearStoredState: false,
        hideOverlay: !shouldKeepOverlayDuringNativeShellStateChange(nextState),
      });
    }
    if (
      isReactNativeNavigationRuntime() &&
      (nextState.active === false || nextState.transitionLoading === true)
    ) {
      releaseAndroidInteractiveTextControlFocus();
    }
    if (nextStateEnteringActiveTransitionLoading) {
      nativeShellResumeReadyPending = nativePageReadyReported === true;
      nativeShellResumeReadyVersion += 1;
      nativeShellResumeReadyPromise = null;
    } else if (nextStateLeavingActiveTransitionLoading) {
      nativeShellResumeReadyPending = false;
      nativeShellResumeReadyVersion += 1;
      nativeShellResumeReadyPromise = null;
    }

    lastShellVisibilityStateSignature = nextSignature;
    Object.assign(shellVisibilityState, nextState);
    if (isAndroidReactNativeNavigationRuntime()) {
      syncAndroidReactNativeAppNavLock();
    }
    if (nextState.active !== false) {
      syncAndroidNativeBootstrapTransitionOverlay();
    }
    window.__CONTROLER_SHELL_VISIBILITY__ = getShellVisibilityState();
    if (nextStateEnteringActiveTransitionLoading) {
      scheduleImmediateNativeShellResumeReadyReport(
        nextState.reason || "shell-resume",
      );
    }
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

  function waitForAndroidNavigationReleasePaint() {
    if (!isAndroidNativeRuntime()) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const scheduleFrame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16);
      scheduleFrame(() => {
        scheduleFrame(() => {
          resolve(true);
        });
      });
    });
  }

  function clearDeferredAppNavigationReplayTimer() {
    if (deferredAppNavigationReplayTimerId) {
      window.clearTimeout(deferredAppNavigationReplayTimerId);
      deferredAppNavigationReplayTimerId = 0;
    }
  }

  function discardDeferredAppNavigationRequest(reason = "") {
    if (!deferredAppNavigationRequest) {
      clearDeferredAppNavigationReplayTimer();
      return null;
    }
    const pendingRequest = deferredAppNavigationRequest;
    deferredAppNavigationRequest = null;
    clearDeferredAppNavigationReplayTimer();
    markPagePerfStage("navigation-deferred-cleared", {
      allowRepeat: true,
      reason: reason || undefined,
      page: pendingRequest?.targetItem?.key || undefined,
      href: pendingRequest?.targetHref || undefined,
    });
    return pendingRequest;
  }

  function isDeferredAppNavigationReplayReady() {
    if (!deferredAppNavigationRequest) {
      return false;
    }
    if (shellVisibilityState.active === false) {
      return false;
    }
    if (shouldBlockReactNativeShellNavigationInteraction()) {
      return false;
    }
    if (hasVisibleBlockingOverlay()) {
      return false;
    }
    if (
      appPageTransitionLocked ||
      appPageLeavePreflightLocked ||
      !!pendingNativeNavigationRequest
    ) {
      return false;
    }
    if (
      isAndroidReactNativeNavigationRuntime() &&
      isAndroidReactNativeAppNavLocked()
    ) {
      return false;
    }
    return true;
  }

  function flushDeferredAppNavigationRequestIfReady() {
    if (!isDeferredAppNavigationReplayReady()) {
      return false;
    }
    const pendingRequest = takeDeferredAppNavigationRequest();
    if (!pendingRequest?.targetItem) {
      return false;
    }
    const pendingIntent =
      pendingRequest.intent && typeof pendingRequest.intent === "object"
        ? normalizeAppNavigationIntent(pendingRequest.intent)
        : pendingRequest.options?.intent &&
            typeof pendingRequest.options.intent === "object"
          ? normalizeAppNavigationIntent(pendingRequest.options.intent)
          : null;
    if (
      latestAppNavigationIntent &&
      (!pendingIntent ||
        isAppNavigationIntentStale(pendingIntent, latestAppNavigationIntent))
    ) {
      return false;
    }
    const replayed = startAppPageTransition(pendingRequest.targetItem, {
      ...(pendingRequest.options || {}),
      targetHref: pendingRequest.targetHref,
      intent:
        pendingRequest.intent &&
        typeof pendingRequest.intent === "object"
          ? pendingRequest.intent
          : pendingRequest.options?.intent,
    });
    if (!replayed) {
      deferredAppNavigationRequest = pendingRequest;
      return false;
    }
    return true;
  }

  function scheduleDeferredAppNavigationReplay() {
    clearDeferredAppNavigationReplayTimer();
    deferredAppNavigationReplayTimerId = window.setTimeout(() => {
      deferredAppNavigationReplayTimerId = 0;
      flushDeferredAppNavigationRequestIfReady();
    }, 0);
  }

  function ensureDeferredAppNavigationReplay() {
    if (deferredAppNavigationReplayInitialized) {
      scheduleDeferredAppNavigationReplay();
      return;
    }
    deferredAppNavigationReplayInitialized = true;
    const handleReplayStateChange = () => {
      scheduleDeferredAppNavigationReplay();
    };
    window.addEventListener(
      BLOCKING_OVERLAY_STATE_EVENT_NAME,
      handleReplayStateChange,
    );
    window.addEventListener(SHELL_VISIBILITY_EVENT_NAME, handleReplayStateChange);
    window.addEventListener("pagehide", () => {
      discardDeferredAppNavigationRequest("pagehide");
    });
    window.addEventListener("beforeunload", () => {
      discardDeferredAppNavigationRequest("beforeunload");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        discardDeferredAppNavigationRequest("visibility-hidden");
        return;
      }
      handleReplayStateChange();
    });
    scheduleDeferredAppNavigationReplay();
  }

  function getAppNavigationItemLabel(targetItem) {
    if (!targetItem || typeof targetItem !== "object") {
      return "目标页面";
    }
    const label = String(targetItem.label || targetItem.key || "").trim();
    return label || "目标页面";
  }

  function buildAppNavigationOverlayCopy(targetItem) {
    return {
      title: "正在加载数据中",
      message: "页面资源与本地数据正在就绪",
    };
  }

  function hasPageBootstrapPendingBodyState() {
    const body = document.body;
    if (!(body instanceof HTMLElement)) {
      return false;
    }
    return Array.from(body.classList).some((className) =>
      /(?:^|-)bootstrap-pending$/.test(String(className || "").trim()),
    );
  }

  function hasVisibleBlockingOverlayExcludingLeaveGuard() {
    if (typeof document === "undefined") {
      return false;
    }
    return Array.from(document.querySelectorAll(".page-loading-overlay")).some(
      (overlay) =>
        overlay !== appPageLeaveOverlayElement &&
        isVisibleBlockingLoadingOverlay(overlay),
    );
  }

  function shouldDeferReactNativePageReadyReport(options = {}) {
    if (options?.skipBlockingOverlayWait === true) {
      return false;
    }
    if (!isReactNativeNavigationRuntime()) {
      return false;
    }
    if (hasPageBootstrapPendingBodyState()) {
      return true;
    }
    return hasVisibleBlockingOverlayExcludingLeaveGuard();
  }

  function clearDeferredNativePageReadyFrame() {
    if (!deferredNativePageReadyFrameId) {
      return;
    }
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(deferredNativePageReadyFrameId);
    } else {
      window.clearTimeout(deferredNativePageReadyFrameId);
    }
    deferredNativePageReadyFrameId = 0;
  }

  function flushDeferredNativePageReadyReport() {
    const pendingOptions = deferredNativePageReadyOptions;
    if (!pendingOptions) {
      return false;
    }
    if (shouldDeferReactNativePageReadyReport()) {
      return false;
    }
    deferredNativePageReadyOptions = null;
    reportNativePageReadyWithOptions({
      ...pendingOptions,
      skipBlockingOverlayWait: true,
    });
    return true;
  }

  function ensureDeferredNativePageReadyObserver() {
    if (deferredNativePageReadyObserverBound) {
      return;
    }
    deferredNativePageReadyObserverBound = true;
    const handleDeferredReadyStateChange = () => {
      if (!deferredNativePageReadyOptions) {
        return;
      }
      scheduleDeferredNativePageReadyReport();
    };
    window.addEventListener(
      BLOCKING_OVERLAY_STATE_EVENT_NAME,
      handleDeferredReadyStateChange,
    );
    window.addEventListener(
      SHELL_VISIBILITY_EVENT_NAME,
      handleDeferredReadyStateChange,
    );
    window.addEventListener("focus", handleDeferredReadyStateChange);
    document.addEventListener(
      "visibilitychange",
      handleDeferredReadyStateChange,
    );
  }

  function scheduleDeferredNativePageReadyReport(options = {}) {
    if (options && typeof options === "object" && Object.keys(options).length) {
      deferredNativePageReadyOptions = {
        allowRepeat: options.allowRepeat === true,
        reason: resolveNativePageReadyReason(options),
      };
    } else if (!deferredNativePageReadyOptions) {
      return false;
    }
    ensureDeferredNativePageReadyObserver();
    if (deferredNativePageReadyFrameId) {
      return true;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    deferredNativePageReadyFrameId = schedule(() => {
      deferredNativePageReadyFrameId = 0;
      flushDeferredNativePageReadyReport();
    });
    return true;
  }

  function shouldKeepOverlayDuringNativeShellStateChange(nextShellState = {}) {
    if (!isAndroidReactNativeNavigationRuntime()) {
      return false;
    }
    if (nextShellState.active === false) {
      return true;
    }
    if (nextShellState.transitionLoading === true) {
      return true;
    }
    if (androidNativeBootstrapTransitionOverlayActive) {
      return true;
    }
    return hasPageBootstrapPendingBodyState();
  }

  function syncAndroidNativeBootstrapTransitionOverlay() {
    if (!isAndroidReactNativeNavigationRuntime()) {
      androidNativeBootstrapTransitionOverlayActive = false;
      return false;
    }

    const shouldBridgeBootstrapPending =
      isShellPageActive() &&
      hasPageBootstrapPendingBodyState() &&
      !hasVisibleBlockingOverlayExcludingLeaveGuard();
    if (!shouldBridgeBootstrapPending) {
      if (androidNativeBootstrapTransitionOverlayActive) {
        androidNativeBootstrapTransitionOverlayActive = false;
        setAppPageLeaveOverlayState({
          active: false,
        });
      }
      return false;
    }

    androidNativeBootstrapTransitionOverlayActive = true;
    setAppPageLeaveOverlayState({
      active: true,
      ...buildAppNavigationOverlayCopy(getCurrentAppNavigationItem()),
      delayMs: 0,
    });
    return true;
  }

  function compareAppNavigationIntentPriority(current, incoming) {
    const currentRequestedAt = Math.max(
      0,
      Number.isFinite(Number(current?.requestedAt)) ? Number(current.requestedAt) : 0,
    );
    const incomingRequestedAt = Math.max(
      0,
      Number.isFinite(Number(incoming?.requestedAt)) ? Number(incoming.requestedAt) : 0,
    );
    if (incomingRequestedAt > currentRequestedAt) {
      return 1;
    }
    if (incomingRequestedAt < currentRequestedAt) {
      return -1;
    }
    const currentSequence = Math.max(
      0,
      Number.isFinite(Number(current?.intentSequence))
        ? Number(current.intentSequence)
        : 0,
    );
    const incomingSequence = Math.max(
      0,
      Number.isFinite(Number(incoming?.intentSequence))
        ? Number(incoming.intentSequence)
        : 0,
    );
    if (incomingSequence > currentSequence) {
      return 1;
    }
    if (incomingSequence < currentSequence) {
      return -1;
    }
    return 0;
  }

  function isAppNavigationIntentStale(candidate, latest) {
    if (!candidate || !latest) {
      return false;
    }
    return compareAppNavigationIntentPriority(candidate, latest) > 0;
  }

  function normalizeAppNavigationIntent(intent = {}, targetItem = null, targetHref = "") {
    return {
      intentId: String(intent.intentId || "").trim(),
      requestedAt: Math.max(
        0,
        Number.isFinite(Number(intent.requestedAt)) ? Number(intent.requestedAt) : 0,
      ),
      intentSequence: Math.max(
        0,
        Number.isFinite(Number(intent.intentSequence))
          ? Number(intent.intentSequence)
          : 0,
      ),
      sourcePage: String(intent.sourcePage || "").trim(),
      sourceHref: normalizeAppNavigationHref(intent.sourceHref || ""),
      targetPage: String(intent.targetPage || targetItem?.key || "").trim(),
      targetHref:
        normalizeAppNavigationHref(intent.targetHref || targetHref) || targetHref,
    };
  }

  function rememberLatestAppNavigationIntent(intent) {
    if (!intent || typeof intent !== "object") {
      return latestAppNavigationIntent;
    }
    const normalizedIntent = normalizeAppNavigationIntent(intent);
    if (
      !latestAppNavigationIntent ||
      !isAppNavigationIntentStale(normalizedIntent, latestAppNavigationIntent)
    ) {
      latestAppNavigationIntent = normalizedIntent;
    }
    return latestAppNavigationIntent;
  }

  function buildAppNavigationIntent(targetItem, targetHref) {
    const currentItem = getCurrentAppNavigationItem();
    const sourceHref = normalizeAppNavigationHref(window.location.href);
    const requestedAt = Date.now();
    const intentSequence = (appNavigationIntentCounter += 1);
    return {
      intentId: `intent_${requestedAt}_${intentSequence}`,
      requestedAt,
      intentSequence,
      sourcePage: currentItem?.key || "",
      sourceHref,
      targetPage: targetItem?.key || "",
      targetHref,
    };
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
    const intent =
      options.intent &&
      typeof options.intent === "object" &&
      (typeof options.intent.intentId === "string" ||
        Number.isFinite(Number(options.intent.requestedAt)) ||
        Number.isFinite(Number(options.intent.intentSequence)))
        ? normalizeAppNavigationIntent(options.intent, targetItem, targetHref)
        : buildAppNavigationIntent(targetItem, targetHref);
    rememberLatestAppNavigationIntent(intent);
    return {
      targetItem,
      targetHref,
      intent,
      options: {
        ...options,
        targetHref,
        intent,
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
      const fallbackIntent =
        fallbackRequest?.intent && typeof fallbackRequest.intent === "object"
          ? normalizeAppNavigationIntent(fallbackRequest.intent)
          : null;
      if (
        fallbackIntent &&
        (!request.intent || isAppNavigationIntentStale(request.intent, fallbackIntent))
      ) {
        return fallbackRequest;
      }
      if (
        latestAppNavigationIntent &&
        (!request.intent ||
          isAppNavigationIntentStale(request.intent, latestAppNavigationIntent))
      ) {
        return fallbackRequest;
      }
      return request;
    }
    return fallbackRequest;
  }

  function clearDeferredAppNavigationRequest() {
    return discardDeferredAppNavigationRequest("runtime-reset");
  }

  function dispatchNativeAppNavigationRequest(
    navigationRequest,
    currentItem = getCurrentAppNavigationItem(),
  ) {
    if (!navigationRequest?.targetHref) {
      return false;
    }
    const targetItem =
      navigationRequest.targetItem ||
      resolveAppNavigationItemByHref(navigationRequest.targetHref);
    if (!targetItem) {
      return false;
    }

    initNativeNavigationBridge();
    clearPendingNativeNavigationRequest();
    const sourcePage =
      String(navigationRequest.intent?.sourcePage || currentItem?.key || "").trim();
    const sourceHref =
      normalizeAppNavigationHref(
        navigationRequest.intent?.sourceHref || window.location.href,
      ) || normalizeAppNavigationHref(window.location.href);
    const intent =
      navigationRequest.intent &&
      typeof navigationRequest.intent === "object"
        ? navigationRequest.intent
        : buildAppNavigationIntent(targetItem, navigationRequest.targetHref);
    const requestId = `nav_${Date.now()}_${(nativeNavigationRequestCounter += 1)}`;
    const requested = window.ControlerNativeBridge?.emitEvent?.("ui.navigate", {
      page: targetItem.key,
      href: navigationRequest.targetHref,
      direction: getNavigationDirection(sourcePage, targetItem.key),
      requestId,
      intentId: String(intent.intentId || "").trim(),
      requestedAt: Math.max(0, Number(intent.requestedAt) || 0),
      intentSequence: Math.max(0, Number(intent.intentSequence) || 0),
      sourcePage,
      sourceHref,
      targetPage: targetItem.key,
      targetHref: navigationRequest.targetHref,
    });

    if (!requested) {
      return false;
    }

    pendingNativeNavigationRequest = {
      ...navigationRequest,
      targetItem,
      targetHref: navigationRequest.targetHref,
      requestId,
      intent: {
        ...intent,
        sourcePage,
        sourceHref,
        targetPage: targetItem.key,
        targetHref: navigationRequest.targetHref,
      },
      replaceHistory: navigationRequest.options?.replaceHistory === true,
      timeoutId: window.setTimeout(() => {
        if (
          !pendingNativeNavigationRequest ||
          pendingNativeNavigationRequest.requestId !== requestId
        ) {
          return;
        }
        const timedOutRequest = clearPendingNativeNavigationRequest();
        syncAndroidReactNativeAppNavLock();
        if (isAndroidReactNativeNavigationRuntime()) {
          resetAppPageTransitionRuntimeState();
          return;
        }
        if (!timedOutRequest?.targetHref) {
          return;
        }
        performAppNavigation(timedOutRequest.targetHref, {
          replaceHistory: timedOutRequest.replaceHistory === true,
        });
      }, RN_APP_PAGE_TRANSITION_ACK_TIMEOUT_MS),
    };
    return true;
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

      const ackState = String(detail.state || "").trim()
        || (detail.queued === true || detail.busy === true
          ? "queued"
          : detail.accepted === false
            ? "rejected"
            : "accepted-now");
      const shouldKeepOverlay =
        ackState === "queued" || ackState === "accepted-now";
      resetAppPageTransitionRuntimeState({
        clearStoredState: false,
        hideOverlay: !shouldKeepOverlay,
      });

      if (ackState === "queued") {
        const overlayCopy = buildAppNavigationOverlayCopy(
          pendingRequest.targetItem ||
            resolveAppNavigationItemByHref(pendingRequest.targetHref),
        );
        setAppPageLeaveOverlayState({
          active: true,
          ...overlayCopy,
          delayMs: 0,
        });
        return;
      }

      if (ackState === "accepted-now") {
        return;
      }

      syncAndroidReactNativeAppNavLock();
      if (ackState === "dropped-stale") {
        return;
      }

      if (!pendingRequest.targetHref) {
        return;
      }

      if (ackState === "rejected") {
        performAppNavigation(pendingRequest.targetHref, {
          replaceHistory: pendingRequest.replaceHistory === true,
        });
      }
    });
  }

  function reportNativePageReady() {
    reportNativePageReadyWithOptions();
  }

  function resolveNativePageReadyReason(options = {}) {
    const reason =
      typeof options.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "initial";
    return reason || "initial";
  }

  function resolveNativePageReadyRoot() {
    return (
      document.querySelector(
        ".app-main, .record-main, .stats-main, .plan-main, .todo-main, .diary-main, .settings-main",
      ) || document.body
    );
  }

  function reportNativePageReadyWithOptions(options = {}) {
    const electronApi = window.electronAPI;
    const allowRepeat = options.allowRepeat === true;
    const readyReason = resolveNativePageReadyReason(options);
    const shouldReportToReactNative = isReactNativeNavigationRuntime();
    const shouldReportToElectron =
      !allowRepeat &&
      !!electronApi?.isElectron &&
      typeof electronApi.uiPageReady === "function";
    if (
      (!allowRepeat && nativePageReadyReported) ||
      (!shouldReportToReactNative && !shouldReportToElectron)
    ) {
      return;
    }
    if (
      shouldReportToReactNative &&
      shouldDeferReactNativePageReadyReport(options)
    ) {
      scheduleDeferredNativePageReadyReport({
        allowRepeat,
        reason: readyReason,
      });
      return;
    }
    if (!allowRepeat) {
      nativePageReadyReported = true;
    }
    deferredNativePageReadyOptions = null;
    clearDeferredNativePageReadyFrame();
    markPagePerfStage("page-ready-emitted", {
      allowRepeat,
      reason: readyReason,
    });
    if (shouldReportToReactNative) {
      window.ControlerNativeBridge?.emitEvent?.("ui.page-ready", {
        href: window.location.href,
        reason: readyReason,
        allowRepeat,
        ...getLaunchPerfContext(),
      });
    }
    if (!allowRepeat && androidNativeBootstrapTransitionOverlayActive) {
      androidNativeBootstrapTransitionOverlayActive = false;
      setAppPageLeaveOverlayState({
        active: false,
      });
    }
    if (
      !allowRepeat &&
      appPageLeaveOverlayVisible &&
      !isReactNativeNavigationRuntime()
    ) {
      setAppPageLeaveOverlayState({
        active: false,
      });
    }
    if (shouldReportToElectron) {
      electronApi.uiPageReady({
        href: window.location.href,
        page: resolveCurrentPagePerfKey(),
      });
    }
    if (!allowRepeat) {
      scheduleDesktopBootstrapPrewarm("page-ready");
    }
  }

  function scheduleNativeShellResumeReadyReport(reason = "shell-resume") {
    if (
      !nativeShellResumeReadyPending ||
      !isReactNativeNavigationRuntime() ||
      nativePageReadyReported !== true
    ) {
      return Promise.resolve(false);
    }
    const shellState = getShellVisibilityState();
    if (shellState.active === false || shellState.transitionLoading !== true) {
      return Promise.resolve(false);
    }
    if (nativeShellResumeReadyPromise) {
      return nativeShellResumeReadyPromise;
    }
    const requestVersion = nativeShellResumeReadyVersion;
    nativeShellResumeReadyPromise = Promise.resolve(
      waitForVisualContentStability({
        root: resolveNativePageReadyRoot(),
        quietWindowMs: 72,
        maxWaitMs: 960,
        minQuietFrames: 3,
      }),
    )
      .catch(() => false)
      .then(() => {
        if (
          requestVersion !== nativeShellResumeReadyVersion ||
          !nativeShellResumeReadyPending
        ) {
          return false;
        }
        const latestShellState = getShellVisibilityState();
        if (
          latestShellState.active === false ||
          latestShellState.transitionLoading !== true
        ) {
          return false;
        }
        reportNativePageReadyWithOptions({
          allowRepeat: true,
          reason,
        });
        nativeShellResumeReadyPending = false;
        return true;
      })
      .finally(() => {
        if (requestVersion === nativeShellResumeReadyVersion) {
          nativeShellResumeReadyPromise = null;
        }
      });
    return nativeShellResumeReadyPromise;
  }

  function scheduleImmediateNativeShellResumeReadyReport(
    reason = "shell-resume",
  ) {
    if (
      !nativeShellResumeReadyPending ||
      !isReactNativeNavigationRuntime() ||
      nativePageReadyReported !== true
    ) {
      return false;
    }
    const shellState = getShellVisibilityState();
    if (shellState.active === false || shellState.transitionLoading !== true) {
      return false;
    }
    if (hasPageBootstrapPendingBodyState()) {
      return false;
    }
    const requestVersion = nativeShellResumeReadyVersion;
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(() => {
      schedule(() => {
        if (
          requestVersion !== nativeShellResumeReadyVersion ||
          !nativeShellResumeReadyPending
        ) {
          return;
        }
        const latestShellState = getShellVisibilityState();
        if (
          latestShellState.active === false ||
          latestShellState.transitionLoading !== true
        ) {
          return;
        }
        reportNativePageReadyWithOptions({
          allowRepeat: true,
          reason,
        });
        nativeShellResumeReadyPending = false;
      });
    });
    return true;
  }

  function clearDesktopBootstrapPrewarmTimer() {
    if (!desktopBootstrapPrewarmTimerId) {
      return;
    }
    window.clearTimeout(desktopBootstrapPrewarmTimerId);
    desktopBootstrapPrewarmTimerId = 0;
  }

  function resolveDesktopBootstrapPrewarmQueue() {
    const currentPageKey = resolveCurrentPagePerfKey();
    const navigationState = getAppNavigationState();
    const hiddenPages = new Set(
      Array.isArray(navigationState?.hiddenPages)
        ? navigationState.hiddenPages
            .map((pageKey) => String(pageKey || "").trim())
            .filter(Boolean)
        : [],
    );
    const visibleOrder = (
      Array.isArray(navigationState?.order) &&
      navigationState.order.length
        ? navigationState.order
        : DEFAULT_APP_NAV_ORDER
    )
      .map((pageKey) => String(pageKey || "").trim())
      .filter(
        (pageKey, index, list) =>
          APP_NAV_ITEM_KEY_SET.has(pageKey) &&
          !hiddenPages.has(pageKey) &&
          list.indexOf(pageKey) === index,
      );
    const queue = [];
    const push = (pageKey) => {
      const normalizedPageKey = String(pageKey || "").trim();
      if (
        !normalizedPageKey ||
        normalizedPageKey === currentPageKey ||
        !APP_NAV_ITEM_KEY_SET.has(normalizedPageKey) ||
        queue.includes(normalizedPageKey)
      ) {
        return;
      }
      queue.push(normalizedPageKey);
    };

    if (visibleOrder.length) {
      const currentIndex = visibleOrder.indexOf(currentPageKey);
      if (currentIndex >= 0) {
        visibleOrder.slice(currentIndex + 1).forEach(push);
        visibleOrder.slice(0, currentIndex).forEach(push);
      } else {
        visibleOrder.forEach(push);
      }
    }
    DEFAULT_APP_NAV_ORDER.forEach(push);
    return queue;
  }

  function getDesktopBootstrapPrewarmApi() {
    const electronApi = window.electronAPI;
    if (
      electronApi?.isElectron &&
      typeof electronApi.storagePrewarmPageBootstrap === "function"
    ) {
      return electronApi.storagePrewarmPageBootstrap.bind(electronApi);
    }
    if (typeof window.ControlerStorage?.prewarmPageBootstrap === "function") {
      return window.ControlerStorage.prewarmPageBootstrap.bind(
        window.ControlerStorage,
      );
    }
    if (typeof window.ControlerStorage?.getPageBootstrapState === "function") {
      return async (pageKey, options = {}) => {
        const payload = await window.ControlerStorage.getPageBootstrapState(
          pageKey,
          options,
        );
        return {
          ok: !!payload,
          page:
            typeof payload?.page === "string" && payload.page.trim()
              ? payload.page.trim()
              : String(pageKey || "").trim(),
        };
      };
    }
    return null;
  }

  async function runDesktopBootstrapPrewarm(reason = "page-ready") {
    if (desktopBootstrapPrewarmRunning) {
      return false;
    }
    const electronApi = window.electronAPI;
    if (!electronApi?.isElectron) {
      return false;
    }
    const prewarmPageBootstrap = getDesktopBootstrapPrewarmApi();
    if (typeof prewarmPageBootstrap !== "function") {
      return false;
    }

    const queue = resolveDesktopBootstrapPrewarmQueue();
    if (!queue.length) {
      return false;
    }

    desktopBootstrapPrewarmRunning = true;
    markPagePerfStage("desktop-bootstrap-prewarm-start", {
      allowRepeat: true,
      reason,
      targetCount: queue.length,
    });
    let completedCount = 0;
    try {
      for (const pageKey of queue) {
        if (document.hidden || !isShellPageActive()) {
          break;
        }
        try {
          await prewarmPageBootstrap(pageKey, {});
          completedCount += 1;
        } catch (error) {
          console.error(`预热桌面页面引导缓存失败: ${pageKey}`, error);
        }
        if (pageKey !== queue[queue.length - 1]) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, DESKTOP_BOOTSTRAP_PREWARM_STEP_DELAY_MS);
          });
        }
      }
    } finally {
      desktopBootstrapPrewarmRunning = false;
      markPagePerfStage("desktop-bootstrap-prewarm-done", {
        allowRepeat: true,
        reason,
        targetCount: queue.length,
        completedCount,
      });
    }
    return completedCount > 0;
  }

  function scheduleDesktopBootstrapPrewarm(reason = "page-ready") {
    const electronApi = window.electronAPI;
    if (
      desktopBootstrapPrewarmScheduled ||
      desktopBootstrapPrewarmRunning ||
      !electronApi?.isElectron
    ) {
      return false;
    }
    desktopBootstrapPrewarmScheduled = true;
    clearDesktopBootstrapPrewarmTimer();
    desktopBootstrapPrewarmTimerId = window.setTimeout(() => {
      desktopBootstrapPrewarmTimerId = 0;
      const schedule =
        typeof window.requestIdleCallback === "function"
          ? (callback) =>
              window.requestIdleCallback(callback, {
                timeout: DESKTOP_BOOTSTRAP_PREWARM_IDLE_TIMEOUT_MS,
              })
          : (callback) => window.setTimeout(callback, 0);
      schedule(() => {
        void runDesktopBootstrapPrewarm(reason);
      });
    }, DESKTOP_BOOTSTRAP_PREWARM_DELAY_MS);
    return true;
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

  window.addEventListener(SHELL_RESUME_SETTLED_EVENT_NAME, (event) => {
    const detail =
      event && typeof event.detail === "object" && event.detail
        ? event.detail
        : {};
    scheduleNativeShellResumeReadyReport(
      typeof detail.reason === "string" && detail.reason.trim()
        ? detail.reason.trim()
        : "shell-resume",
    );
  });

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

  function normalizeSharedTodoSortPreference(value) {
    switch (String(value || "").trim()) {
      case "priority":
      case "createdAt":
      case "title":
        return String(value || "").trim();
      default:
        return "dueDate";
    }
  }

  let todoSortPreferenceCoreBackfillStarted = false;
  function scheduleTodoSortPreferenceCoreBackfill() {
    if (todoSortPreferenceCoreBackfillStarted) {
      return;
    }
    todoSortPreferenceCoreBackfillStarted = true;

    const run = async (attempt = 0) => {
      const bundleStorage = window.ControlerStorage;
      if (
        bundleStorage?.isNativeApp !== true ||
        (
          typeof bundleStorage?.appendJournal !== "function" &&
          typeof bundleStorage?.replaceCoreState !== "function"
        )
      ) {
        if (attempt < 12) {
          window.setTimeout(() => {
            void run(attempt + 1);
          }, 120);
        }
        return;
      }

      let localPreference = "";
      try {
        localPreference = normalizeSharedTodoSortPreference(
          window.localStorage?.getItem?.("todoSortPreference") || "",
        );
      } catch (error) {
        console.error("读取待办排序本地偏好失败:", error);
        return;
      }
      if (localPreference === "dueDate") {
        return;
      }

      let managedPreference = "dueDate";
      try {
        const managedSnapshot =
          typeof bundleStorage.dump === "function" ? bundleStorage.dump() : null;
        managedPreference = normalizeSharedTodoSortPreference(
          managedSnapshot?.todoSortPreference || "",
        );
      } catch (error) {
        console.error("读取待办排序核心偏好失败:", error);
      }
      console.info("[todo-sort-backfill]", {
        localPreference,
        managedPreference,
      });
      if (managedPreference === localPreference) {
        return;
      }

      try {
        if (typeof bundleStorage.appendJournal === "function") {
          await bundleStorage.appendJournal(
            [
              {
                kind: "replaceCoreState",
                partialCore: {
                  todoSortPreference: localPreference,
                },
              },
            ],
            {
              reason: "todo-sort-preference-boot-backfill",
            },
          );
          return;
        }
        await bundleStorage.replaceCoreState(
          {
            todoSortPreference: localPreference,
          },
          {
            reason: "todo-sort-preference-boot-backfill",
          },
        );
      } catch (error) {
        console.error("回填待办排序核心偏好失败:", error);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          void run();
        },
        { once: true },
      );
      return;
    }

    void run();
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

  function isVisibleEdgeBackSwipeExclusionTarget(target) {
    if (!(target instanceof HTMLElement) || !target.isConnected || target.hidden) {
      return false;
    }

    const computed = window.getComputedStyle(target);
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      computed.pointerEvents === "none"
    ) {
      return false;
    }

    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectAutoEdgeBackSwipeExclusionTargets(root = document) {
    if (!root?.querySelectorAll) {
      return [];
    }

    const targets = [];
    const seenTargets = new Set();
    const appendTarget = (candidate) => {
      if (!(candidate instanceof HTMLElement) || seenTargets.has(candidate)) {
        return;
      }
      seenTargets.add(candidate);
      targets.push(candidate);
    };

    root
      .querySelectorAll(`[${EDGE_BACK_SWIPE_EXCLUSION_ATTR}="true"]`)
      .forEach((target) => appendTarget(target));

    getVisibleModalOverlays().forEach((modal) => {
      [
        "[data-controler-disable-edge-swipe='true']",
        "input[type='radio']",
        "input[type='checkbox']",
        "label",
        "select",
        "button",
        "[role='button']",
        ".tree-select",
        ".native-select-enhancer",
      ]
        .join(", ")
        .split(", ")
        .forEach((selector) => {
          modal.querySelectorAll(selector).forEach((target) => appendTarget(target));
        });
    });

    return targets.filter((target) => isVisibleEdgeBackSwipeExclusionTarget(target));
  }

  function collectEdgeBackSwipeExclusionRects(root = document) {
    const viewportWidth = Math.max(
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0,
      1,
    );
    const viewportHeight = Math.max(
      window.innerHeight || 0,
      document.documentElement?.clientHeight || 0,
      1,
    );
    if (!root?.querySelectorAll) {
      return {
        rects: [],
        viewportWidth,
        viewportHeight,
      };
    }

    const rects = collectAutoEdgeBackSwipeExclusionTargets(root)
      .map((target) => {
        const rect = target.getBoundingClientRect();
        return {
          left: Math.max(
            0,
            Math.round(rect.left - EDGE_BACK_SWIPE_EXCLUSION_PADDING),
          ),
          top: Math.max(
            0,
            Math.round(rect.top - EDGE_BACK_SWIPE_EXCLUSION_PADDING),
          ),
          right: Math.min(
            viewportWidth,
            Math.round(rect.right + EDGE_BACK_SWIPE_EXCLUSION_PADDING),
          ),
          bottom: Math.min(
            viewportHeight,
            Math.round(rect.bottom + EDGE_BACK_SWIPE_EXCLUSION_PADDING),
          ),
        };
      })
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);

    return {
      rects,
      viewportWidth,
      viewportHeight,
    };
  }

  function reportNativeEdgeBackSwipeExclusions(root = document) {
    if (typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return;
    }

    const payload = collectEdgeBackSwipeExclusionRects(root);
    const signature = JSON.stringify(payload);
    if (signature === lastReportedEdgeBackSwipeExclusionSignature) {
      return;
    }

    lastReportedEdgeBackSwipeExclusionSignature = signature;
    window.ControlerNativeBridge.emitEvent("ui.edge-back-swipe-exclusion", {
      href: window.location.href,
      ...payload,
    });
  }

  function syncNativeEdgeBackSwipeExclusion(root = document) {
    reportNativeEdgeBackSwipeExclusions(root);
  }

  function scheduleNativeEdgeBackSwipeExclusionSync(root = document) {
    if (pendingEdgeBackSwipeExclusionSyncFrame) {
      return;
    }

    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    pendingEdgeBackSwipeExclusionSyncFrame = schedule(() => {
      pendingEdgeBackSwipeExclusionSyncFrame = 0;
      reportNativeEdgeBackSwipeExclusions(root);
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

  function resolveAppNavigationTouchGuardButton(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const matched = target.closest(".app-nav [data-nav-page]");
    return matched instanceof HTMLButtonElement ? matched : null;
  }

  function clearStaleAppNavigationTouchGuardState() {
    if (
      lastCanceledAppNavigationTouchGesture &&
      Date.now() - lastCanceledAppNavigationTouchGesture.canceledAt >
        APP_NAV_TOUCH_GUARD_CANCEL_WINDOW_MS
    ) {
      lastCanceledAppNavigationTouchGesture = null;
    }
  }

  function shouldTrackAppNavigationTouchGesture(event) {
    if (!(event instanceof PointerEvent)) {
      return false;
    }
    if (typeof event.button === "number" && event.button !== 0) {
      return false;
    }
    const pointerType = String(event.pointerType || "").trim().toLowerCase();
    return (
      pointerType === "touch" ||
      pointerType === "pen" ||
      (!pointerType && isAndroidNativeRuntime())
    );
  }

  function beginAppNavigationTouchGesture(button, event) {
    if (!(button instanceof HTMLButtonElement) || !(event instanceof PointerEvent)) {
      return null;
    }
    const point = {
      clientX: Number(event.clientX) || 0,
      clientY: Number(event.clientY) || 0,
    };
    activeAppNavigationTouchGesture = {
      button,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : -1,
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      lastY: point.clientY,
      canceled: false,
      startedAt: Date.now(),
    };
    return activeAppNavigationTouchGesture;
  }

  function cancelActiveAppNavigationTouchGesture() {
    if (!activeAppNavigationTouchGesture) {
      return null;
    }
    activeAppNavigationTouchGesture.canceled = true;
    return activeAppNavigationTouchGesture;
  }

  function updateActiveAppNavigationTouchGesture(event) {
    if (!(event instanceof PointerEvent) || !activeAppNavigationTouchGesture) {
      return activeAppNavigationTouchGesture;
    }
    const gesture = activeAppNavigationTouchGesture;
    if (
      Number.isFinite(gesture.pointerId) &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== gesture.pointerId
    ) {
      return gesture;
    }

    const clientX = Number(event.clientX) || 0;
    const clientY = Number(event.clientY) || 0;
    gesture.lastX = clientX;
    gesture.lastY = clientY;
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    if (
      deltaX * deltaX + deltaY * deltaY >
      APP_NAV_TOUCH_GUARD_MAX_MOVE_PX * APP_NAV_TOUCH_GUARD_MAX_MOVE_PX
    ) {
      gesture.canceled = true;
      return gesture;
    }

    const hoveredButton =
      typeof document.elementFromPoint === "function"
        ? resolveAppNavigationTouchGuardButton(
            document.elementFromPoint(clientX, clientY),
          )
        : null;
    if (hoveredButton && hoveredButton === gesture.button) {
      return gesture;
    }
    if (hoveredButton !== gesture.button) {
      gesture.canceled = true;
    }
    return gesture;
  }

  function finalizeActiveAppNavigationTouchGesture(event = null, options = {}) {
    if (!activeAppNavigationTouchGesture) {
      clearStaleAppNavigationTouchGuardState();
      return null;
    }

    const { forceCancel = false } = options;
    const gesture = activeAppNavigationTouchGesture;
    if (event instanceof PointerEvent) {
      updateActiveAppNavigationTouchGesture(event);
      if (
        Number.isFinite(gesture.pointerId) &&
        Number.isFinite(event.pointerId) &&
        event.pointerId !== gesture.pointerId
      ) {
        return gesture;
      }
    }
    if (forceCancel) {
      gesture.canceled = true;
    }
    activeAppNavigationTouchGesture = null;
    if (gesture.canceled) {
      lastCanceledAppNavigationTouchGesture = {
        button: gesture.button,
        canceledAt: Date.now(),
      };
    } else {
      lastCanceledAppNavigationTouchGesture = null;
    }
    return gesture;
  }

  function shouldSuppressAppNavigationTouchClick(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    clearStaleAppNavigationTouchGuardState();
    if (
      activeAppNavigationTouchGesture &&
      activeAppNavigationTouchGesture.button === button &&
      activeAppNavigationTouchGesture.canceled
    ) {
      return true;
    }
    return (
      lastCanceledAppNavigationTouchGesture?.button === button &&
      Date.now() - lastCanceledAppNavigationTouchGesture.canceledAt <=
        APP_NAV_TOUCH_GUARD_CANCEL_WINDOW_MS
    );
  }

  function initAppNavigationTouchGestureGuard() {
    if (
      appNavigationTouchGuardInitialized ||
      typeof window.PointerEvent !== "function"
    ) {
      return;
    }
    appNavigationTouchGuardInitialized = true;

    document.addEventListener(
      "pointerdown",
      (event) => {
        clearStaleAppNavigationTouchGuardState();
        if (!shouldTrackAppNavigationTouchGesture(event)) {
          return;
        }
        const button = resolveAppNavigationTouchGuardButton(event.target);
        if (!button) {
          activeAppNavigationTouchGesture = null;
          return;
        }
        beginAppNavigationTouchGesture(button, event);
      },
      true,
    );
    document.addEventListener(
      "pointermove",
      (event) => {
        if (!shouldTrackAppNavigationTouchGesture(event)) {
          return;
        }
        updateActiveAppNavigationTouchGesture(event);
      },
      true,
    );
    document.addEventListener(
      "pointerup",
      (event) => {
        if (!shouldTrackAppNavigationTouchGesture(event)) {
          return;
        }
        finalizeActiveAppNavigationTouchGesture(event);
      },
      true,
    );
    document.addEventListener(
      "pointercancel",
      (event) => {
        if (!shouldTrackAppNavigationTouchGesture(event)) {
          return;
        }
        finalizeActiveAppNavigationTouchGesture(event, {
          forceCancel: true,
        });
      },
      true,
    );
    document.addEventListener(
      "click",
      (event) => {
        const button = resolveAppNavigationTouchGuardButton(event.target);
        if (!button || !shouldSuppressAppNavigationTouchClick(button)) {
          return;
        }
        finalizeActiveAppNavigationTouchGesture(null, {
          forceCancel: true,
        });
        clearAndroidNavButtonFocus(button, true);
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      },
      true,
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

  function isVisibleInteractiveTextControl(target) {
    if (!(target instanceof HTMLElement) || !target.isConnected) {
      return false;
    }
    const computedStyle = window.getComputedStyle(target);
    return (
      computedStyle.display !== "none" &&
      computedStyle.visibility !== "hidden" &&
      !target.hidden &&
      target.getClientRects().length > 0
    );
  }

  function resolveInteractiveTextControlTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const directTarget = target.closest(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR);
    if (directTarget instanceof HTMLElement && isVisibleInteractiveTextControl(directTarget)) {
      return directTarget;
    }

    const labelTarget = target.closest("label");
    if (labelTarget instanceof HTMLElement) {
      const control = labelTarget.querySelector(
        ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR,
      );
      if (control instanceof HTMLElement && isVisibleInteractiveTextControl(control)) {
        return control;
      }
    }

    let currentNode = target;
    let depth = 0;
    while (currentNode instanceof HTMLElement && depth < 4) {
      const candidates = Array.from(
        currentNode.querySelectorAll(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR),
      ).filter((candidate) => isVisibleInteractiveTextControl(candidate));
      if (candidates.length === 1 && candidates[0] instanceof HTMLElement) {
        return candidates[0];
      }
      currentNode = currentNode.parentElement;
      depth += 1;
    }

    return null;
  }

  function isFocusedInteractiveTextControl(target) {
    return (
      target instanceof HTMLElement &&
      document.activeElement === target &&
      target.matches?.(":focus")
    );
  }

  function isAndroidKeyboardOpen() {
    return (
      document.documentElement?.classList.contains("controler-keyboard-open") ===
        true ||
      document.body?.classList.contains("controler-keyboard-open") === true
    );
  }

  function markModalAutofocusRequested(modal) {
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    modal.dataset.controlerAutofocusRequestedAt = String(Date.now());
    return true;
  }

  function markContainingModalAutofocusRequested(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    const modal = target.closest(".modal-overlay");
    if (!(modal instanceof HTMLElement) || !isVisibleModalOverlay(modal)) {
      return false;
    }
    return markModalAutofocusRequested(modal);
  }

  function rememberModalPreferredInteractiveTextControl(target) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    const modal = getAndroidModalAutofocusHost(focusTarget);
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    androidPreferredModalFocusTargets.set(modal, focusTarget);
    if (focusTarget.id) {
      modal.dataset.controlerPreferredTextFocusId = focusTarget.id;
    } else {
      delete modal.dataset.controlerPreferredTextFocusId;
    }
    return true;
  }

  function resolveModalPreferredInteractiveTextControl(root) {
    if (!(root instanceof HTMLElement)) {
      return null;
    }
    const preferredTarget = androidPreferredModalFocusTargets.get(root);
    if (
      preferredTarget instanceof HTMLElement &&
      preferredTarget.isConnected &&
      root.contains(preferredTarget) &&
      isVisibleInteractiveTextControl(preferredTarget)
    ) {
      return preferredTarget;
    }
    const preferredId = String(root.dataset.controlerPreferredTextFocusId || "").trim();
    if (!preferredId || typeof root.querySelector !== "function") {
      return null;
    }
    const selectorId =
      typeof window.CSS?.escape === "function"
        ? `#${window.CSS.escape(preferredId)}`
        : `#${preferredId.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;
    const fallbackTarget = root.querySelector(selectorId);
    if (
      fallbackTarget instanceof HTMLElement &&
      isVisibleInteractiveTextControl(fallbackTarget)
    ) {
      androidPreferredModalFocusTargets.set(root, fallbackTarget);
      return fallbackTarget;
    }
    return null;
  }

  function shouldDeferToPreferredModalFocusTarget(target) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    const modal = getAndroidModalAutofocusHost(focusTarget);
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    const preferredTarget = resolveModalPreferredInteractiveTextControl(modal);
    if (!(preferredTarget instanceof HTMLElement) || preferredTarget === focusTarget) {
      return false;
    }
    return (
      preferredTarget === document.activeElement ||
      isFocusedInteractiveTextControl(preferredTarget) ||
      hasRecentAndroidInteractiveTextFocusIntent(preferredTarget, 960)
    );
  }

  function hasPendingAndroidInteractiveTextFocusWork(target, now = Date.now()) {
    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    const hasPendingRetries =
      Array.isArray(focusTarget.__controlerAndroidFocusRetryTimers) &&
      focusTarget.__controlerAndroidFocusRetryTimers.length > 0;
    const hasPendingSoftInputRequest =
      Number(focusTarget.__controlerAndroidSoftInputRequestPendingUntil || 0) > now;
    const hasPendingTransfer =
      pendingAndroidInteractiveTextFocusTransferTimerId > 0 &&
      pendingAndroidInteractiveTextFocusTransferTarget === focusTarget;
    return hasPendingRetries || hasPendingSoftInputRequest || hasPendingTransfer;
  }

  function getAndroidModalAutofocusHost(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    if (
      target instanceof HTMLElement &&
      target.classList.contains("modal-overlay")
    ) {
      return target;
    }
    const modal = target.closest(".modal-overlay");
    return modal instanceof HTMLElement ? modal : null;
  }

  function getAndroidModalAutofocusSuppressionUntil(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(
      0,
      Number.parseInt(modal.dataset.controlerDisableAutofocusUntil || "0", 10) ||
        0,
    );
  }

  function isAndroidModalAutofocusSuppressed(modal, now = Date.now()) {
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    if (modal.dataset.controlerDisableAutofocus === "true") {
      return true;
    }
    return getAndroidModalAutofocusSuppressionUntil(modal) > now;
  }

  function isAndroidModalAutofocusHostEligible(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return false;
    }
    if (!isVisibleModalOverlay(overlay)) {
      return false;
    }
    if (
      overlay.__controlerRemovalQueued === "true" ||
      overlay.dataset.controlerModalClosing === "true" ||
      getAndroidModalDismissPendingUntil(overlay) > 0 ||
      isAndroidModalDismissFreezeActive(overlay)
    ) {
      return false;
    }
    return !isAndroidModalAutofocusSuppressed(overlay);
  }

  function shouldAllowAndroidModalAutofocus(target) {
    if (shouldSuppressAndroidInteractiveTextFocus()) {
      return false;
    }
    const hostModal = getAndroidModalAutofocusHost(target);
    if (!(hostModal instanceof HTMLElement)) {
      return true;
    }
    return isAndroidModalAutofocusHostEligible(hostModal);
  }

  function requestAndroidSoftInputForFocusedTarget(target, options = {}) {
    if (
      !isAndroidNativeRuntime() ||
      shouldSuppressAndroidInteractiveTextFocus() ||
      !(target instanceof HTMLElement) ||
      !isVisibleInteractiveTextControl(target)
    ) {
      return false;
    }

    const shouldRequestSoftInput =
      target.matches?.(ANDROID_PRIMARY_TEXT_ENTRY_SELECTOR) ||
      isAndroidInteractiveTextControlCandidate(target);
    if (
      !shouldRequestSoftInput ||
      !isFocusedInteractiveTextControl(target) ||
      typeof window.ControlerNativeBridge?.call !== "function"
    ) {
      return false;
    }

    const now = Date.now();
    const pendingUntil = Math.max(
      0,
      Number(target.__controlerAndroidSoftInputRequestPendingUntil || 0),
    );
    if (pendingUntil > now) {
      return false;
    }
    if (now - lastAndroidSoftInputRequestAt < ANDROID_SOFT_INPUT_REQUEST_DEDUP_WINDOW_MS) {
      return false;
    }
    lastAndroidSoftInputRequestAt = now;
    const requestIssuedAt = now;
    const requestMode = options?.mode === "restart" ? "restart" : "show";
    const requestToken = `controler-soft-input-${now}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    target.__controlerAndroidSoftInputRequestToken = requestToken;
    target.__controlerAndroidSoftInputRequestIssuedAt = requestIssuedAt;
    target.__controlerAndroidSoftInputRequestPendingUntil =
      now + ANDROID_SOFT_INPUT_REQUEST_SETTLE_WINDOW_MS;
    const restoreFocusIfNeeded = () => {
      if (
        target.__controlerAndroidSoftInputRequestToken !== requestToken ||
        Number(target.__controlerAndroidSoftInputDismissedAt || 0) >
          requestIssuedAt ||
        isAndroidKeyboardOpen() ||
        !shouldAllowAndroidModalAutofocus(target) ||
        !shouldRestoreAndroidInteractiveTextControlFocus(target) ||
        isFocusedInteractiveTextControl(target)
      ) {
        return;
      }
      try {
        target.focus({
          preventScroll: true,
        });
      } catch (error) {
        target.focus?.();
      }
    };
    const requestBridgeSoftInput = (methodName, allowFallback = false) =>
      window.ControlerNativeBridge
        .call(methodName)
        .then((result) => ({
          method: methodName,
          result,
        }))
        .catch((error) => {
          if (!allowFallback) {
            throw error;
          }
          return window.ControlerNativeBridge.call("ui.showSoftInput").then((result) => ({
            method: "ui.showSoftInput",
            result,
          }));
        });
    const primaryMethodName =
      requestMode === "restart" ? "ui.restartSoftInput" : "ui.showSoftInput";
    const allowFallback = requestMode === "restart";
    void requestBridgeSoftInput(primaryMethodName, allowFallback)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        if (target.__controlerAndroidSoftInputRequestToken !== requestToken) {
          return;
        }
        target.__controlerAndroidSoftInputRequestPendingUntil = Math.max(
          Number(target.__controlerAndroidSoftInputRequestPendingUntil || 0),
          Date.now() + ANDROID_SOFT_INPUT_REQUEST_POST_SETTLE_WINDOW_MS,
        );
        window.setTimeout(restoreFocusIfNeeded, 96);
      });
    return true;
  }

  function clearAndroidSoftInputRequestState(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    target.__controlerAndroidSoftInputRequestToken = "";
    target.__controlerAndroidSoftInputRequestIssuedAt = 0;
    target.__controlerAndroidSoftInputRequestPendingUntil = 0;
    return true;
  }

  function shouldRestoreAndroidInteractiveTextControlFocus(target) {
    if (
      !(target instanceof HTMLElement) ||
      !target.isConnected ||
      !isVisibleInteractiveTextControl(target)
    ) {
      return false;
    }
    const activeElement = document.activeElement;
    if (
      !(activeElement instanceof HTMLElement) ||
      activeElement === document.body ||
      activeElement === document.documentElement
    ) {
      return true;
    }
    const activeInteractiveTarget =
      resolveInteractiveTextControlTarget(activeElement) ||
      (isAndroidInteractiveTextControlCandidate(activeElement)
        ? activeElement
        : null);
    if (
      activeInteractiveTarget instanceof HTMLElement &&
      activeInteractiveTarget !== target
    ) {
      return false;
    }
    return !activeElement.closest?.(".app-nav");
  }

  function focusAndroidInteractiveTextControl(target, options = {}) {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    if (shouldSuppressAndroidInteractiveTextFocus()) {
      return false;
    }

    const focusTarget =
      target instanceof HTMLElement
        ? resolveInteractiveTextControlTarget(target) || target
        : resolveInteractiveTextControlTarget(target);
    if (
      !(focusTarget instanceof HTMLElement) ||
      !isVisibleInteractiveTextControl(focusTarget)
    ) {
      return false;
    }
    if (shouldDeferToPreferredModalFocusTarget(focusTarget)) {
      return false;
    }

    markContainingModalAutofocusRequested(focusTarget);
    rememberModalPreferredInteractiveTextControl(focusTarget);

    const selectText = options.selectText === true;
    const allowRefocus = options.forceFocus === true;
    const focusRequestStartedAt = Date.now();
    const retrySequence = Array.isArray(options.retrySequence)
      ? options.retrySequence
          .map((delayMs) => Number(delayMs))
          .filter((delayMs) => Number.isFinite(delayMs) && delayMs >= 0)
      : [];
    const requestSoftInput = () => {
      requestAndroidSoftInputForFocusedTarget(focusTarget);
    };
    const clearPendingFocusRetries = () => {
      const pendingTimers = Array.isArray(
        focusTarget.__controlerAndroidFocusRetryTimers,
      )
        ? focusTarget.__controlerAndroidFocusRetryTimers
        : [];
      pendingTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      focusTarget.__controlerAndroidFocusRetryTimers = [];
      focusTarget.__controlerAndroidFocusRetryToken = "";
    };
    const shouldAbortFocusAttempt = () => {
      if (
        !focusTarget.isConnected ||
        !isVisibleInteractiveTextControl(focusTarget)
      ) {
        return true;
      }
      if (
        Number(focusTarget.__controlerAndroidSoftInputDismissedAt || 0) >
        focusRequestStartedAt
      ) {
        return true;
      }
      if (shouldDeferToPreferredModalFocusTarget(focusTarget)) {
        return true;
      }
      return false;
    };
    const createRetryToken = () => {
      const nextToken = `controler-android-focus-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      focusTarget.__controlerAndroidFocusRetryToken = nextToken;
      return nextToken;
    };
    const scheduleRetrySequence = (
      delays = [],
      retryAction = focusOnce,
      retryToken = "",
    ) => {
      if (!Array.isArray(delays) || !delays.length) {
        return;
      }
      delays.forEach((delayMs) => {
        const timerId = window.setTimeout(() => {
          if (shouldAbortFocusAttempt()) {
            clearPendingFocusRetries();
            return;
          }
          if (
            retryToken &&
            focusTarget.__controlerAndroidFocusRetryToken !== retryToken
          ) {
            return;
          }
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLElement &&
            activeElement !== focusTarget &&
            activeElement !== document.body &&
            activeElement !== document.documentElement
          ) {
            const activeInteractiveTarget =
              resolveInteractiveTextControlTarget(activeElement) ||
              (isAndroidInteractiveTextControlCandidate(activeElement)
                ? activeElement
                : null);
            if (
              activeInteractiveTarget instanceof HTMLElement &&
              activeInteractiveTarget !== focusTarget
            ) {
              return;
            }
            if (activeElement.closest?.(".app-nav")) {
              return;
            }
          }
          if (isFocusedInteractiveTextControl(focusTarget) && !allowRefocus) {
            clearPendingFocusRetries();
            return;
          }
          const retrySucceeded = retryAction();
          if (retrySucceeded) {
            clearPendingFocusRetries();
          }
        }, delayMs);
        focusTarget.__controlerAndroidFocusRetryTimers.push(timerId);
      });
    };
    const focusOnce = () => {
      if (shouldAbortFocusAttempt()) {
        return false;
      }

      try {
        focusTarget.focus({
          preventScroll: true,
        });
      } catch (error) {
        focusTarget.focus?.();
      }

      const focusedNow = isFocusedInteractiveTextControl(focusTarget);

      if (
        focusedNow &&
        selectText &&
        typeof focusTarget.setSelectionRange === "function" &&
        typeof focusTarget.value === "string"
      ) {
        const textLength = focusTarget.value.length;
        try {
          focusTarget.setSelectionRange(textLength, textLength);
        } catch (error) {}
      }

      if (focusedNow) {
        requestSoftInput();
      }

      return focusedNow;
    };

    if (isFocusedInteractiveTextControl(focusTarget) && !allowRefocus) {
      clearPendingFocusRetries();
      requestSoftInput();
      return true;
    }

    if (focusOnce()) {
      clearPendingFocusRetries();
      return true;
    }

    const fallbackRetryDelayMs = Math.max(48, Number(options.retryDelayMs) || 120);
    const fallbackRetrySequence = retrySequence.length
      ? retrySequence
      : [fallbackRetryDelayMs];
    clearPendingFocusRetries();
    const retryToken = createRetryToken();
    scheduleRetrySequence(fallbackRetrySequence, focusOnce, retryToken);
    return false;
  }

  function clearAndroidInteractiveTextControlPendingRetries(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const pendingTimers = Array.isArray(target.__controlerAndroidFocusRetryTimers)
      ? target.__controlerAndroidFocusRetryTimers
      : [];
    pendingTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    target.__controlerAndroidFocusRetryTimers = [];
    target.__controlerAndroidFocusRetryToken = "";
  }

  function getActiveAndroidInteractiveTextControl() {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement
      ? resolveInteractiveTextControlTarget(activeElement) ||
          (isAndroidInteractiveTextControlCandidate(activeElement)
            ? activeElement
            : null)
      : null;
  }

  function resolveAndroidInteractiveActionTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const actionTarget = target.closest(ANDROID_INTERACTIVE_ACTION_SELECTOR);
    if (!(actionTarget instanceof HTMLElement)) {
      return null;
    }
    if (
      actionTarget.closest?.("[data-controler-keep-input-focus='true']")
    ) {
      return null;
    }
    if (actionTarget.closest(".native-select-enhancer")) {
      return null;
    }
    return actionTarget;
  }

  function isDisabledAndroidInteractiveActionTarget(target) {
    return (
      !(target instanceof HTMLElement) ||
      target.hasAttribute("disabled") ||
      target.getAttribute("aria-disabled") === "true"
    );
  }

  function armAndroidInteractiveActionReplayGuard(target, options = {}) {
    if (!(target instanceof HTMLElement)) {
      androidInteractiveActionReplayGuard = null;
      return;
    }
    const rect =
      typeof target.getBoundingClientRect === "function"
        ? target.getBoundingClientRect()
        : null;
    const optionCenterX = Number(options.x);
    const optionCenterY = Number(options.y);
    const centerX =
      Number.isFinite(optionCenterX)
        ? optionCenterX
        : rect && Number.isFinite(rect.left) && Number.isFinite(rect.width)
          ? rect.left + rect.width / 2
          : null;
    const centerY =
      Number.isFinite(optionCenterY)
        ? optionCenterY
        : rect && Number.isFinite(rect.top) && Number.isFinite(rect.height)
          ? rect.top + rect.height / 2
          : null;
    const remainingClicks = Math.max(
      1,
      Math.round(Number(options.remainingClicks) || 1),
    );
    androidInteractiveActionReplayGuard = {
      until: Date.now() + ANDROID_INTERACTIVE_ACTION_CLICK_BYPASS_WINDOW_MS,
      remainingClicks,
      x: centerX,
      y: centerY,
    };
  }

  function clearPendingAndroidInteractiveActionReplay() {
    const pendingReplay = pendingAndroidInteractiveActionReplay;
    pendingAndroidInteractiveActionReplay = null;
    if (
      pendingReplay &&
      Number.isFinite(Number(pendingReplay.timerId)) &&
      Number(pendingReplay.timerId) > 0
    ) {
      window.clearTimeout(Number(pendingReplay.timerId));
    }
    return pendingReplay;
  }

  function isAndroidInteractiveActionReplayClickNearGuard(
    event,
    guard = null,
  ) {
    if (!guard) {
      return false;
    }
    if (!Number.isFinite(guard.x) || !Number.isFinite(guard.y)) {
      return true;
    }
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return true;
    }
    return (
      Math.abs(clientX - guard.x) <= ANDROID_INTERACTIVE_ACTION_REPLAY_DISTANCE_PX &&
      Math.abs(clientY - guard.y) <= ANDROID_INTERACTIVE_ACTION_REPLAY_DISTANCE_PX
    );
  }

  function shouldSuppressAndroidInteractiveActionClick(event) {
    if (!event?.isTrusted) {
      return false;
    }
    const guard = androidInteractiveActionReplayGuard;
    if (!guard) {
      return false;
    }
    if (Number(guard.until) <= Date.now()) {
      androidInteractiveActionReplayGuard = null;
      return false;
    }
    if (
      Number(guard.remainingClicks) <= 0 ||
      !isAndroidInteractiveActionReplayClickNearGuard(event, guard)
    ) {
      return false;
    }
    guard.remainingClicks -= 1;
    if (guard.remainingClicks <= 0) {
      androidInteractiveActionReplayGuard = null;
    }
    return true;
  }

  function dispatchAndroidInteractiveActionAfterKeyboardRelease(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    clearPendingAndroidInteractiveActionReplay();
    const maxAttempts = 18;
    const retryDelayMs = 28;
    const pendingReplay = {
      target,
      attempts: 0,
      timerId: 0,
    };
    pendingAndroidInteractiveActionReplay = pendingReplay;

    const replay = () => {
      if (pendingAndroidInteractiveActionReplay !== pendingReplay) {
        return;
      }
      if (!target.isConnected || isDisabledAndroidInteractiveActionTarget(target)) {
        clearPendingAndroidInteractiveActionReplay();
        return;
      }

      const activeControl = getActiveAndroidInteractiveTextControl();
      if (
        pendingReplay.attempts < maxAttempts &&
        (isAndroidKeyboardOpen() ||
          (activeControl instanceof HTMLElement &&
            activeControl !== target &&
            !activeControl.contains(target) &&
            !target.contains(activeControl)))
      ) {
        pendingReplay.attempts += 1;
        pendingReplay.timerId = window.setTimeout(replay, retryDelayMs);
        return;
      }

      clearPendingAndroidInteractiveActionReplay();
      clearAndroidNavButtonFocus(target, true);
      armAndroidInteractiveActionReplayGuard(target);
      target.click?.();
    };

    pendingReplay.timerId = window.setTimeout(replay, 0);
    return true;
  }

  function releaseAndroidInteractiveTextControlFocus() {
    const focusTarget = getActiveAndroidInteractiveTextControl();
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    const hostModal = getAndroidModalAutofocusHost(focusTarget);
    if (
      hostModal instanceof HTMLElement &&
      isVisibleModalOverlay(hostModal)
    ) {
      suppressAndroidModalAutofocus(
        hostModal,
        ANDROID_MODAL_MANUAL_KEYBOARD_DISMISS_SUPPRESS_MS,
      );
    }
    clearAndroidInteractiveTextControlPendingRetries(focusTarget);
    clearAndroidSoftInputRequestState(focusTarget);
    clearAndroidInteractiveTextFocusIntent(focusTarget);
    focusTarget.__controlerAndroidSoftInputDismissedAt = Date.now();
    try {
      focusTarget.blur?.();
    } catch (error) {}
    return true;
  }

  function suppressAndroidModalAutofocus(modal, durationMs = 420) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    const safeDuration = Math.max(120, Number(durationMs) || 420);
    const until = Date.now() + safeDuration;
    modal.dataset.controlerDisableAutofocusUntil = String(
      Math.max(
        Number.parseInt(modal.dataset.controlerDisableAutofocusUntil || "0", 10) ||
          0,
        until,
      ),
    );
    return until;
  }

  function resumeAndroidModalAutofocus(modal, options = {}) {
    if (
      !isAndroidNativeRuntime() ||
      !(modal instanceof HTMLElement) ||
      !modal.isConnected ||
      !isVisibleModalOverlay(modal)
    ) {
      return false;
    }
    if (options.clearDisableFlag === true) {
      delete modal.dataset.controlerDisableAutofocus;
    }
    if (!isAndroidModalAutofocusHostEligible(modal)) {
      return false;
    }
    delete modal.dataset.controlerDisableAutofocusUntil;
    const activeControl = getActiveAndroidInteractiveTextControl();
    if (activeControl instanceof HTMLElement && modal.contains(activeControl)) {
      markModalAutofocusRequested(modal);
      androidAutofocusedModalRoots.add(modal);
      return false;
    }
    return autofocusInteractiveTextControl(modal, options);
  }

  function autofocusInteractiveTextControl(root, options = {}) {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    if (shouldSuppressAndroidInteractiveTextFocus()) {
      return false;
    }

    const scope = root instanceof HTMLElement ? root : document;
    if (scope instanceof HTMLElement) {
      scope.dataset.controlerAutofocusRequestedAt = String(Date.now());
    }
    const preferredFocusTarget =
      scope instanceof HTMLElement
        ? resolveModalPreferredInteractiveTextControl(scope)
        : null;
    const focusTarget =
      preferredFocusTarget ||
      scope.querySelector?.(ANDROID_PRIMARY_TEXT_ENTRY_SELECTOR) ||
      scope.querySelector?.(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR) ||
      null;
    if (!(focusTarget instanceof HTMLElement)) {
      return false;
    }
    if (
      scope instanceof HTMLElement &&
      scope.classList.contains("modal-overlay") &&
      isVisibleModalOverlay(scope)
    ) {
      androidAutofocusedModalRoots.add(scope);
    }

    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    const scheduleFocus = () => {
      if (!shouldAllowAndroidModalAutofocus(focusTarget)) {
        return false;
      }
      return focusAndroidInteractiveTextControl(focusTarget, {
        selectText: options.selectText === true,
        forceFocus: options.forceFocus === true,
        retryDelayMs: options.retryDelayMs,
        retrySequence: options.retrySequence,
      });
    };
    if (delayMs > 0) {
      window.setTimeout(scheduleFocus, delayMs);
      return true;
    }
    scheduleFocus();
    return true;
  }

  function scheduleAndroidModalAutofocus() {
    if (androidModalAutofocusQueued || !isAndroidNativeRuntime()) {
      return false;
    }

    androidModalAutofocusQueued = true;
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);

    schedule(() => {
      androidModalAutofocusQueued = false;
      const modal = getTopVisibleModal();
      if (
        !(modal instanceof HTMLElement) ||
        !isAndroidModalAutofocusHostEligible(modal)
      ) {
        return;
      }
      delete modal.dataset.controlerDisableAutofocusUntil;

      const activeControl = getActiveAndroidInteractiveTextControl();
      if (
        activeControl instanceof HTMLElement &&
        !modal.contains(activeControl)
      ) {
        clearAndroidInteractiveTextControlPendingRetries(activeControl);
        clearAndroidSoftInputRequestState(activeControl);
        try {
          activeControl.blur?.();
        } catch (error) {}
      }

      const focusedModalControl = getActiveAndroidInteractiveTextControl();
      if (
        focusedModalControl instanceof HTMLElement &&
        modal.contains(focusedModalControl)
      ) {
        androidAutofocusedModalRoots.add(modal);
        return;
      }

      const recentAutofocusRequestedAt = Number(
        modal.dataset.controlerAutofocusRequestedAt || 0,
      );
      const autofocusPendingTarget =
        resolveModalPreferredInteractiveTextControl(modal) ||
        modal.querySelector?.(ANDROID_PRIMARY_TEXT_ENTRY_SELECTOR) ||
        modal.querySelector?.(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR) ||
        null;
      const hasRecentAutofocusRequest =
        recentAutofocusRequestedAt > 0 &&
        Date.now() - recentAutofocusRequestedAt < 420;
      if (
        hasRecentAutofocusRequest &&
        hasPendingAndroidInteractiveTextFocusWork(autofocusPendingTarget)
      ) {
        androidAutofocusedModalRoots.add(modal);
        return;
      }

      if (androidAutofocusedModalRoots.has(modal)) {
        return;
      }

      const didScheduleFocus = autofocusInteractiveTextControl(modal, {
        delayMs: 28,
        retrySequence: [96],
        selectText: true,
      });
      if (didScheduleFocus) {
        androidAutofocusedModalRoots.add(modal);
      }
    });

    return true;
  }

  function syncAndroidModalKeyboardDismissedFocusState() {
    if (!isAndroidNativeRuntime()) {
      androidModalKeyboardDismissGuardLastOpen = false;
      return false;
    }
    const keyboardOpen = isAndroidKeyboardOpen();
    const wasOpen = androidModalKeyboardDismissGuardLastOpen;
    androidModalKeyboardDismissGuardLastOpen = keyboardOpen;
    if (!wasOpen || keyboardOpen) {
      return false;
    }

    const focusTarget = getActiveAndroidInteractiveTextControl();
    if (
      !(focusTarget instanceof HTMLElement) ||
      !isFocusedInteractiveTextControl(focusTarget)
    ) {
      return false;
    }

    const hostModal = getAndroidModalAutofocusHost(focusTarget);
    if (
      !(hostModal instanceof HTMLElement) ||
      !isVisibleModalOverlay(hostModal) ||
      hostModal.__controlerRemovalQueued === "true" ||
      hostModal.dataset.controlerModalClosing === "true" ||
      getAndroidModalDismissPendingUntil(hostModal) > 0 ||
      isAndroidModalDismissFreezeActive(hostModal)
    ) {
      return false;
    }

    focusTarget.__controlerAndroidSoftInputDismissedAt = Date.now();
    clearAndroidInteractiveTextControlPendingRetries(focusTarget);
    clearAndroidSoftInputRequestState(focusTarget);
    clearAndroidInteractiveTextFocusIntent(focusTarget);
    suppressAndroidModalAutofocus(
      hostModal,
      ANDROID_MODAL_MANUAL_KEYBOARD_DISMISS_SUPPRESS_MS,
    );
    try {
      focusTarget.blur?.();
    } catch (error) {}
    return true;
  }

  function clearAndroidModalKeyboardDismissedFocusSyncTimers() {
    androidModalKeyboardDismissGuardTimerIds.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    androidModalKeyboardDismissGuardTimerIds = [];
  }

  function shouldContinueAndroidModalKeyboardDismissedFocusSync() {
    if (isAndroidKeyboardOpen()) {
      return true;
    }
    const activeControl = getActiveAndroidInteractiveTextControl();
    if (
      !(activeControl instanceof HTMLElement) ||
      !isFocusedInteractiveTextControl(activeControl)
    ) {
      return false;
    }
    const hostModal = getAndroidModalAutofocusHost(activeControl);
    return (
      hostModal instanceof HTMLElement &&
      isVisibleModalOverlay(hostModal) &&
      hostModal.__controlerRemovalQueued !== "true" &&
      hostModal.dataset.controlerModalClosing !== "true"
    );
  }

  function scheduleAndroidModalKeyboardDismissedFocusSync() {
    if (!isAndroidNativeRuntime()) {
      androidModalKeyboardDismissGuardLastOpen = false;
      clearAndroidModalKeyboardDismissedFocusSyncTimers();
      androidModalKeyboardDismissGuardQueued = false;
      return false;
    }

    const scheduleToken = ++androidModalKeyboardDismissGuardToken;
    clearAndroidModalKeyboardDismissedFocusSyncTimers();
    androidModalKeyboardDismissGuardQueued = true;
    ANDROID_MODAL_KEYBOARD_DISMISS_SYNC_DELAYS_MS.forEach((delayMs, index) => {
      const timerId = window.setTimeout(() => {
        if (scheduleToken !== androidModalKeyboardDismissGuardToken) {
          return;
        }
        syncAndroidModalKeyboardDismissedFocusState();
        const isLastCheck =
          index >= ANDROID_MODAL_KEYBOARD_DISMISS_SYNC_DELAYS_MS.length - 1;
        if (isLastCheck || !shouldContinueAndroidModalKeyboardDismissedFocusSync()) {
          if (scheduleToken === androidModalKeyboardDismissGuardToken) {
            clearAndroidModalKeyboardDismissedFocusSyncTimers();
            androidModalKeyboardDismissGuardQueued = false;
          }
        }
      }, Math.max(0, Number(delayMs) || 0));
      androidModalKeyboardDismissGuardTimerIds.push(timerId);
    });
    return true;
  }

  function scheduleAndroidFocusedTextControlSoftInputRecovery(reason = "") {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    const activeControl = getActiveAndroidInteractiveTextControl();
    if (
      !(activeControl instanceof HTMLElement) ||
      !isFocusedInteractiveTextControl(activeControl) ||
      isAndroidKeyboardOpen()
    ) {
      return false;
    }
    if (isManagedAndroidTextFocusTarget(activeControl)) {
      return false;
    }
    const hasRecentIntent = hasRecentAndroidInteractiveTextFocusIntent(
      activeControl,
      2400,
    );
    const hasPendingWork = hasPendingAndroidInteractiveTextFocusWork(activeControl);
    if (!hasRecentIntent && !hasPendingWork) {
      return false;
    }
    window.setTimeout(() => {
      if (
        !isFocusedInteractiveTextControl(activeControl) ||
        isAndroidKeyboardOpen() ||
        !isVisibleInteractiveTextControl(activeControl)
      ) {
        return;
      }
      requestAndroidSoftInputForFocusedTarget(activeControl, {
        mode: hasPendingWork ? "restart" : "show",
      });
    }, 72);
    return true;
  }

  function initAndroidInteractiveTextAssist() {
    if (androidInteractiveTextAssistInitialized || !isAndroidNativeRuntime()) {
      return;
    }
    androidInteractiveTextAssistInitialized = true;
    androidModalKeyboardDismissGuardLastOpen = isAndroidKeyboardOpen();
    const handleAndroidKeyboardViewportChange = () => {
      scheduleAndroidModalKeyboardDismissedFocusSync();
    };
    window.visualViewport?.addEventListener(
      "resize",
      handleAndroidKeyboardViewportChange,
    );
    window.addEventListener("resize", handleAndroidKeyboardViewportChange);
    window.addEventListener(
      "orientationchange",
      handleAndroidKeyboardViewportChange,
    );
    window.addEventListener("focus", () => {
      scheduleAndroidFocusedTextControlSoftInputRecovery("window-focus");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        return;
      }
      scheduleAndroidFocusedTextControlSoftInputRecovery(
        "visibility-active",
      );
    });
    if (!androidInteractiveActionFocusBypassInitialized) {
      androidInteractiveActionFocusBypassInitialized = true;
      document.addEventListener(
        "pointerdown",
        (event) => {
          const targetElement = event.target instanceof Element ? event.target : null;
          const targetTextControl = resolveInteractiveTextControlTarget(event.target);
          const activeControl = getActiveAndroidInteractiveTextControl();
          if (targetTextControl instanceof HTMLElement) {
            const managedFocusTarget =
              isManagedAndroidTextFocusTarget(targetTextControl);
            if (!managedFocusTarget) {
              markAndroidInteractiveTextFocusIntent(targetTextControl);
              if (
                activeControl instanceof HTMLElement &&
                activeControl !== targetTextControl
              ) {
                scheduleAndroidInteractiveTextFocusTransfer(targetTextControl, {
                  delayMs: isAndroidKeyboardOpen() ? 96 : 48,
                });
              } else {
                clearPendingAndroidInteractiveTextFocusTransfer(targetTextControl);
              }
              if (
                isFocusedInteractiveTextControl(targetTextControl) &&
                !isAndroidKeyboardOpen()
              ) {
                window.setTimeout(() => {
                  if (
                    isFocusedInteractiveTextControl(targetTextControl) &&
                    !isAndroidKeyboardOpen()
                  ) {
                    requestAndroidSoftInputForFocusedTarget(targetTextControl, {
                      mode: "show",
                    });
                  }
                }, 0);
              }
            } else {
              clearPendingAndroidInteractiveTextFocusTransfer(targetTextControl);
            }
          } else {
            clearPendingAndroidInteractiveTextFocusTransfer();
          }
          if (
            pendingAndroidInteractiveActionReplay?.target instanceof HTMLElement &&
            (!targetElement ||
              !pendingAndroidInteractiveActionReplay.target.contains(targetElement))
          ) {
            clearPendingAndroidInteractiveActionReplay();
          }
          if (
            !isAndroidNativeRuntime() ||
            event.defaultPrevented ||
            (typeof event.button === "number" && event.button !== 0)
          ) {
            return;
          }

          const modalDismissIntent = resolveAndroidModalDismissIntent(event.target);
          const actionTarget = resolveAndroidInteractiveActionTarget(event.target);
          if (
            !(activeControl instanceof HTMLElement) ||
            !(
              modalDismissIntent?.modal instanceof HTMLElement ||
              actionTarget instanceof HTMLElement
            ) ||
            (actionTarget instanceof HTMLElement &&
              isDisabledAndroidInteractiveActionTarget(actionTarget))
          ) {
            return;
          }

          if (
            targetTextControl instanceof HTMLElement ||
            (actionTarget instanceof HTMLElement &&
              (actionTarget.contains(activeControl) ||
                activeControl.contains(actionTarget)))
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }

          const modalDismissOverlay =
            modalDismissIntent?.modal instanceof HTMLElement
              ? modalDismissIntent.modal
              : null;
          if (modalDismissOverlay instanceof HTMLElement) {
            const closeProtectionDuration = resolveModalInteractionProtectionDuration(
              modalDismissOverlay,
              MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
              "controlerCloseProtectionDurationMs",
            );
            freezeAndroidModalDismissLayout(modalDismissOverlay);
            protectVisibleParentModalsFromFollowThrough(
              modalDismissOverlay,
              closeProtectionDuration,
            );
            activateModalInteractionShield(
              resolveModalInteractionShieldDuration(
                modalDismissOverlay,
                Math.max(
                  closeProtectionDuration,
                  ANDROID_INTERACTIVE_ACTION_CLICK_BYPASS_WINDOW_MS + 160,
                ),
              ),
            );
          }

          const activeControlModal = getAndroidModalAutofocusHost(activeControl);
          if (activeControlModal instanceof HTMLElement) {
            suppressAndroidModalAutofocus(activeControlModal, 760);
          }
          clearAndroidInteractiveTextControlPendingRetries(activeControl);
          clearAndroidSoftInputRequestState(activeControl);
          try {
            activeControl.blur?.();
          } catch (error) {}
          if (modalDismissIntent?.modal instanceof HTMLElement) {
            dispatchAndroidModalDismissIntent(modalDismissIntent, {
              x: event.clientX,
              y: event.clientY,
            });
            return;
          }
          dispatchAndroidInteractiveActionAfterKeyboardRelease(actionTarget);
        },
        true,
      );
      document.addEventListener(
        "click",
        (event) => {
          if (!shouldSuppressAndroidInteractiveActionClick(event)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        },
        true,
      );
    }
    document.addEventListener(
      "focusin",
      (event) => {
        const focusTarget = resolveInteractiveTextControlTarget(event.target);
        if (!(focusTarget instanceof HTMLElement)) {
          return;
        }
        const focusModal = getAndroidModalAutofocusHost(focusTarget);
        if (focusModal instanceof HTMLElement) {
          const hadPendingDismiss =
            getAndroidModalDismissPendingUntil(focusModal) > 0;
          if (hadPendingDismiss) {
            clearAndroidModalDismissPending(focusModal, {
              releaseFreeze: false,
            });
          }
          if (
            hadPendingDismiss &&
            focusModal.__controlerRemovalQueued !== "true" &&
            focusModal.dataset.controlerModalClosing !== "true" &&
            isAndroidModalDismissFreezeActive(focusModal)
          ) {
            clearAndroidModalDismissFreeze(focusModal);
          }
        }
        focusTarget.__controlerAndroidLastFocusInAt = Date.now();
        const hadPendingRetries =
          Array.isArray(focusTarget.__controlerAndroidFocusRetryTimers) &&
          focusTarget.__controlerAndroidFocusRetryTimers.length > 0;
        const hadRecentFocusIntent =
          hasRecentAndroidInteractiveTextFocusIntent(focusTarget);
        rememberModalPreferredInteractiveTextControl(focusTarget);
        clearPendingAndroidInteractiveTextFocusTransfer(focusTarget);
        clearAndroidInteractiveTextControlPendingRetries(focusTarget);
        if (hadPendingRetries) {
          requestAndroidSoftInputForFocusedTarget(focusTarget);
        } else if (hadRecentFocusIntent && !isAndroidKeyboardOpen()) {
          window.setTimeout(() => {
            if (
              isFocusedInteractiveTextControl(focusTarget) &&
              !isAndroidKeyboardOpen() &&
              hasRecentAndroidInteractiveTextFocusIntent(focusTarget, 1200)
            ) {
              requestAndroidSoftInputForFocusedTarget(focusTarget, {
                mode: "show",
              });
            }
          }, 0);
        }
      },
      true,
    );
    document.addEventListener(
      "focusout",
      (event) => {
        const focusTarget = resolveInteractiveTextControlTarget(event.target);
        if (!(focusTarget instanceof HTMLElement)) {
          return;
        }
        window.setTimeout(() => {
          if (!isFocusedInteractiveTextControl(focusTarget)) {
            clearPendingAndroidInteractiveTextFocusTransfer(focusTarget);
            clearAndroidInteractiveTextControlPendingRetries(focusTarget);
            focusTarget.__controlerAndroidSoftInputDismissedAt = Date.now();
            clearAndroidSoftInputRequestState(focusTarget);
            clearAndroidInteractiveTextFocusIntent(focusTarget);
            const hostModal = getAndroidModalAutofocusHost(focusTarget);
            if (
              !(hostModal instanceof HTMLElement) ||
              !isVisibleModalOverlay(hostModal)
            ) {
              return;
            }
            const activeControl = getActiveAndroidInteractiveTextControl();
            if (
              activeControl instanceof HTMLElement &&
              activeControl !== focusTarget &&
              hostModal.contains(activeControl)
            ) {
              return;
            }
            suppressAndroidModalAutofocus(hostModal, 760);
          }
        }, 0);
      },
      true,
    );
  }

  function isAndroidReactNativeNavigationRuntime() {
    return getNativeHostPlatform() === "android";
  }

  function clearAndroidAppNavigationTransientState(root = document) {
    if (!root?.querySelectorAll) {
      return;
    }

    activeAndroidPressTargets.forEach((target, pointerId) => {
      if (target instanceof HTMLElement && target.closest(".app-nav")) {
        activeAndroidPressTargets.delete(pointerId);
      }
    });

    root.querySelectorAll(".app-nav [data-nav-page]").forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      clearAndroidPressAnimation(button);
      clearAndroidPressReleaseTimer(button);
      button.classList.remove(
        ANDROID_PRESS_ACTIVE_CLASS,
        ANDROID_PRESS_ANIMATE_CLASS,
      );
      clearAndroidNavButtonFocus(button, true);
    });
  }

  function setAndroidReactNativeAppNavLocked(locked) {
    if (!isAndroidReactNativeNavigationRuntime()) {
      return;
    }

    androidReactNativeAppNavLocked = locked === true;
    document.documentElement?.classList.toggle(
      "controler-android-nav-locked",
      androidReactNativeAppNavLocked,
    );
    document.body?.classList.toggle(
      "controler-android-nav-locked",
      androidReactNativeAppNavLocked,
    );
    clearAndroidAppNavigationTransientState(document);
  }

  function syncAndroidReactNativeAppNavLock() {
    if (!isAndroidReactNativeNavigationRuntime()) {
      return false;
    }
    const shouldLock =
      shellVisibilityState.active !== false &&
      (shellVisibilityState.transitionLoading === true ||
        !!pendingNativeNavigationRequest);
    setAndroidReactNativeAppNavLocked(shouldLock);
    return shouldLock;
  }

  function isAndroidReactNativeAppNavLocked() {
    return (
      isAndroidReactNativeNavigationRuntime() &&
      androidReactNativeAppNavLocked
    );
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

  function syncAppNavigationButtonFocusability(
    root = document,
    options = {},
  ) {
    if (!root?.querySelectorAll) {
      return;
    }
    const disableFocus = options?.disableFocus === true;
    root.querySelectorAll(".app-nav [data-nav-page]").forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (button.hidden || disableFocus) {
        button.setAttribute("tabindex", "-1");
        if (disableFocus) {
          clearAndroidNavButtonFocus(button, true);
        }
        return;
      }
      button.removeAttribute("tabindex");
    });
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
    button.removeAttribute(EDGE_BACK_SWIPE_EXCLUSION_ATTR);
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
    button.toggleAttribute("disabled", isCurrentPage);
    button.setAttribute("aria-disabled", isCurrentPage ? "true" : "false");
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
      nav.setAttribute(EDGE_BACK_SWIPE_EXCLUSION_ATTR, "true");
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
          visibleCount += 1;
        }
      });

      const safeVisibleCount = Math.max(visibleCount, 1);
      nav.style.setProperty("--nav-visible-count", String(safeVisibleCount));
      nav.dataset.visibleCount = String(safeVisibleCount);
    });
    syncAppNavigationButtonFocusability(root, {
      disableFocus:
        document.documentElement?.classList.contains("controler-modal-overlay-active") ===
          true ||
        document.documentElement?.classList.contains("controler-blocking-overlay-active") ===
          true ||
        document.body?.classList.contains("controler-modal-overlay-active") === true ||
        document.body?.classList.contains("controler-blocking-overlay-active") === true,
    });
    scheduleNativeEdgeBackSwipeExclusionSync(root);
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
    window.addEventListener("resize", () => {
      scheduleNativeEdgeBackSwipeExclusionSync(document);
    });
    window.addEventListener(
      "load",
      () => {
        scheduleNativeEdgeBackSwipeExclusionSync(document);
      },
      { once: true },
    );
    window.visualViewport?.addEventListener("resize", () => {
      scheduleNativeEdgeBackSwipeExclusionSync(document);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncNavigation();
      }
    });
  }

  function isAndroidNativeRuntime() {
    return getNativeHostPlatform() === "android";
  }

  function getNativeHostPlatform() {
    const explicitPlatform = String(
      window.ControlerNativeBridge?.platform ||
        window.__CONTROLER_RN_META__?.platform ||
        "",
    )
      .trim()
      .toLowerCase();
    if (explicitPlatform === "android" || explicitPlatform === "ios") {
      return explicitPlatform;
    }
    const root = document.documentElement;
    const body = document.body;
    const hasAndroidClass =
      root?.classList.contains("controler-android-native") ||
      body?.classList.contains("controler-android-native");
    if (hasAndroidClass) {
      return "android";
    }
    const hasIosClass =
      root?.classList.contains("controler-ios-native") ||
      body?.classList.contains("controler-ios-native");
    if (hasIosClass) {
      return "ios";
    }
    return "";
  }

  function isReactNativeNavigationRuntime() {
    if (getNativeHostPlatform()) {
      return true;
    }
    return (
      typeof window.ControlerNativeBridge?.emitEvent === "function" ||
      typeof window.ControlerNativeBridge?.call === "function" ||
      typeof window.ReactNativeWebView?.postMessage === "function" ||
      window.__CONTROLER_RN_META__?.runtime === "react-native"
    );
  }

  function isDesktopContentOverlayRuntime() {
    if (getNativeHostPlatform()) {
      return false;
    }
    const compactViewport =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 760px)").matches;
    if (compactViewport) {
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
  }

  function resolveDesktopContentOverlayHost(target = null) {
    if (!isDesktopContentOverlayRuntime()) {
      return null;
    }
    if (target instanceof Element) {
      const closestHost = target.closest(DESKTOP_CONTENT_OVERLAY_HOST_SELECTOR);
      if (closestHost instanceof HTMLElement) {
        return closestHost;
      }
    }
    const matchedHost = document.querySelector(DESKTOP_CONTENT_OVERLAY_HOST_SELECTOR);
    return matchedHost instanceof HTMLElement ? matchedHost : null;
  }

  function ensureDesktopContentOverlayHost(target = null) {
    const host = resolveDesktopContentOverlayHost(target);
    if (!(host instanceof HTMLElement)) {
      return null;
    }
    if (window.getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    return host;
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
    const hideOverlay = options.hideOverlay !== false;
    appPageTransitionLocked = false;
    appPageLeavePreflightLocked = false;
    clearDeferredAppNavigationRequest();
    clearPendingAndroidInteractiveActionReplay();
    clearAppPageTransitionClasses();
    clearPendingNativeNavigationRequest();
    clearNativeNavigationRetryTimer();
    syncAndroidReactNativeAppNavLock();
    if (hideOverlay) {
      setAppPageLeaveOverlayState({
        active: false,
      });
    }
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

  function normalizeCustomPageTitleText(value, fallback = "") {
    const normalized = String(value ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, APP_PAGE_CUSTOM_TITLE_MAX_LENGTH);
    if (normalized) {
      return normalized;
    }
    return String(fallback || "").trim().slice(0, APP_PAGE_CUSTOM_TITLE_MAX_LENGTH);
  }

  function normalizeCustomPageTitleMap(source = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {};
    }
    const nextMap = {};
    Object.entries(source).forEach(([key, value]) => {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = normalizeCustomPageTitleText(value, "");
      if (normalizedKey && normalizedValue) {
        nextMap[normalizedKey] = normalizedValue;
      }
    });
    return nextMap;
  }

  function readStoredCustomPageTitles() {
    try {
      return normalizeCustomPageTitleMap(
        JSON.parse(
          localStorage.getItem(APP_PAGE_CUSTOM_TITLE_STORAGE_KEY) || "{}",
        ),
      );
    } catch (_error) {
      return {};
    }
  }

  function writeStoredCustomPageTitles(nextTitles = {}) {
    const normalizedTitles = normalizeCustomPageTitleMap(nextTitles);
    try {
      if (Object.keys(normalizedTitles).length) {
        localStorage.setItem(
          APP_PAGE_CUSTOM_TITLE_STORAGE_KEY,
          JSON.stringify(normalizedTitles),
        );
      } else {
        localStorage.removeItem(APP_PAGE_CUSTOM_TITLE_STORAGE_KEY);
      }
    } catch (_error) {
      return normalizedTitles;
    }
    return normalizedTitles;
  }

  function getStoredCustomPageTitle(pageKey) {
    const normalizedPageKey = String(pageKey || "").trim();
    if (!normalizedPageKey) {
      return "";
    }
    return readStoredCustomPageTitles()[normalizedPageKey] || "";
  }

  function setStoredCustomPageTitle(pageKey, titleText, defaultTitle = "") {
    const normalizedPageKey = String(pageKey || "").trim();
    const normalizedDefaultTitle = normalizeCustomPageTitleText(defaultTitle, "");
    const normalizedTitle = normalizeCustomPageTitleText(titleText, "");
    if (!normalizedPageKey) {
      return normalizedDefaultTitle || normalizedTitle;
    }
    const nextTitles = readStoredCustomPageTitles();
    if (!normalizedTitle || normalizedTitle === normalizedDefaultTitle) {
      delete nextTitles[normalizedPageKey];
    } else {
      nextTitles[normalizedPageKey] = normalizedTitle;
    }
    const persistedTitles = writeStoredCustomPageTitles(nextTitles);
    return (
      persistedTitles[normalizedPageKey] ||
      normalizedDefaultTitle ||
      normalizedTitle
    );
  }

  function selectEditablePageTitleText(target) {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    try {
      const selection = window.getSelection?.();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_error) {
      // Ignore selection failures.
    }
  }

  function getEditablePageTitleTextNode(titleElement) {
    if (!(titleElement instanceof HTMLElement)) {
      return null;
    }
    return (
      Array.from(titleElement.childNodes).find((node) => node instanceof Text) ||
      null
    );
  }

  function resolveEditablePageTitleI18nSource(titleElement, fallback = "") {
    if (!(titleElement instanceof HTMLElement)) {
      return normalizeCustomPageTitleText(fallback, "");
    }

    const storedSource = normalizeCustomPageTitleText(
      titleElement.dataset.controlerTitleI18nSource,
      "",
    );
    if (storedSource) {
      return storedSource;
    }

    const textNode = getEditablePageTitleTextNode(titleElement);
    const nodeSource = normalizeCustomPageTitleText(
      textNode?.__controlerI18nText,
      "",
    );
    return nodeSource || normalizeCustomPageTitleText(fallback, "");
  }

  function syncEditablePageTitleI18nState(
    titleElement,
    nextTitle,
    { editing = false, defaultTitle = "" } = {},
  ) {
    if (!(titleElement instanceof HTMLElement)) {
      return false;
    }

    const normalizedTitle = normalizeCustomPageTitleText(nextTitle, "");
    const normalizedDefaultTitle = normalizeCustomPageTitleText(defaultTitle, "");
    const normalizedI18nSource = resolveEditablePageTitleI18nSource(
      titleElement,
      normalizedDefaultTitle || normalizedTitle,
    );
    const isCustomTitle =
      !!normalizedTitle &&
      !!normalizedDefaultTitle &&
      normalizedTitle !== normalizedDefaultTitle;
    const shouldSkipI18n = editing || isCustomTitle;

    titleElement.dataset.controlerTitleI18nSource = normalizedI18nSource;

    if (shouldSkipI18n) {
      titleElement.setAttribute("data-i18n-skip", "true");
      return true;
    }

    titleElement.removeAttribute("data-i18n-skip");
    const textNode = getEditablePageTitleTextNode(titleElement);
    if (textNode instanceof Text && normalizedI18nSource) {
      textNode.__controlerI18nText = normalizedI18nSource;
    }

    if (typeof window.ControlerI18n?.apply === "function") {
      window.ControlerI18n.apply(titleElement);
      return true;
    }
    return false;
  }

  function insertPlainTextAtCurrentSelection(text) {
    const normalizedText = String(text || "");
    if (!normalizedText) {
      return;
    }
    try {
      if (document.queryCommandSupported?.("insertText")) {
        document.execCommand("insertText", false, normalizedText);
        return;
      }
    } catch (_error) {
      // Fall through to manual insertion.
    }

    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount <= 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(normalizedText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function updateEditablePageTitlePresentation(
    titleElement,
    nextTitle,
    { editing = false, documentTitle = "", defaultTitle = "" } = {},
  ) {
    if (!(titleElement instanceof HTMLElement)) {
      return "";
    }
    const normalizedTitle = normalizeCustomPageTitleText(nextTitle, "");
    const normalizedDefaultTitle = normalizeCustomPageTitleText(defaultTitle, "");
    if (titleElement.textContent !== normalizedTitle) {
      titleElement.textContent = normalizedTitle;
    }
    titleElement.dataset.controlerTitleEmpty = normalizedTitle ? "false" : "true";
    titleElement.dataset.editHint = editing
      ? APP_PAGE_CUSTOM_TITLE_EDIT_HINT
      : APP_PAGE_CUSTOM_TITLE_IDLE_HINT;
    const appliedByI18n = syncEditablePageTitleI18nState(titleElement, normalizedTitle, {
      editing,
      defaultTitle: normalizedDefaultTitle,
    });
    if (!editing && documentTitle) {
      const documentTitleText =
        !editing &&
        !titleElement.hasAttribute("data-i18n-skip") &&
        typeof window.ControlerI18n?.translateText === "function"
          ? normalizeCustomPageTitleText(
              window.ControlerI18n.translateText(
                resolveEditablePageTitleI18nSource(
                  titleElement,
                  normalizedDefaultTitle || normalizedTitle,
                ),
              ),
              normalizedTitle || documentTitle,
            )
          : normalizedTitle;
      document.title =
        (!appliedByI18n && normalizedTitle) || documentTitleText || documentTitle;
    }
    return normalizedTitle;
  }

  function initEditablePageTitles() {
    const bind = () => {
      const pageKey =
        getCurrentAppNavigationItem()?.key || resolveCurrentPagePerfKey();
      document.querySelectorAll(".page-topbar .page-title").forEach((titleElement) => {
        if (
          !(titleElement instanceof HTMLElement) ||
          titleElement.dataset.controlerEditableTitleBound === "true"
        ) {
          return;
        }

        const defaultTitle = normalizeCustomPageTitleText(
          titleElement.textContent,
          "",
        );
        if (!defaultTitle) {
          return;
        }

        const defaultDocumentTitle = String(document.title || defaultTitle).trim();
        const i18nSourceTitle = resolveEditablePageTitleI18nSource(
          titleElement,
          defaultTitle,
        );
        let committedTitle =
          getStoredCustomPageTitle(pageKey) || defaultTitle;
        let draftBeforeEdit = committedTitle;
        let editing = false;

        titleElement.dataset.controlerEditableTitleBound = "true";
        titleElement.dataset.pageTitleKey = pageKey;
        titleElement.dataset.placeholder = APP_PAGE_CUSTOM_TITLE_PLACEHOLDER;
        titleElement.dataset.controlerTitleI18nSource = i18nSourceTitle;
        titleElement.classList.add("page-title--editable");
        titleElement.tabIndex = 0;
        titleElement.setAttribute("spellcheck", "false");
        titleElement.setAttribute("role", "button");
        titleElement.setAttribute("aria-label", "页面标题，可编辑");
        titleElement.removeAttribute("title");
        titleElement.contentEditable = "false";

        const applyCommittedTitle = () => {
          committedTitle = updateEditablePageTitlePresentation(titleElement, committedTitle, {
            editing: false,
            documentTitle: defaultDocumentTitle,
            defaultTitle,
          });
          return committedTitle;
        };

        const startEditing = () => {
          if (editing) {
            return;
          }
          editing = true;
          draftBeforeEdit = committedTitle;
          titleElement.classList.add("is-editing");
          titleElement.contentEditable = "plaintext-only";
          syncEditablePageTitleI18nState(titleElement, titleElement.textContent, {
            editing: true,
            defaultTitle,
          });
          if (titleElement.contentEditable !== "plaintext-only") {
            titleElement.contentEditable = "true";
          }
          titleElement.dataset.editHint = APP_PAGE_CUSTOM_TITLE_EDIT_HINT;
          titleElement.focus();
          const selectAll = () => {
            selectEditablePageTitleText(titleElement);
          };
          if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(selectAll);
          } else {
            window.setTimeout(selectAll, 0);
          }
        };

        const finishEditing = (saveChanges = true) => {
          if (!editing) {
            return;
          }
          editing = false;
          titleElement.classList.remove("is-editing");
          titleElement.contentEditable = "false";
          if (saveChanges) {
            committedTitle =
              setStoredCustomPageTitle(
                pageKey,
                titleElement.textContent,
                defaultTitle,
              ) || defaultTitle;
          } else {
            committedTitle = draftBeforeEdit || defaultTitle;
          }
          applyCommittedTitle();
        };

        applyCommittedTitle();

        titleElement.addEventListener("click", (event) => {
          if (editing) {
            return;
          }
          event.preventDefault();
          startEditing();
        });

        titleElement.addEventListener("keydown", (event) => {
          if (!editing) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startEditing();
            }
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            finishEditing(true);
            titleElement.blur();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            finishEditing(false);
            titleElement.blur();
          }
        });

        titleElement.addEventListener("blur", () => {
          if (editing) {
            finishEditing(true);
          }
        });

        titleElement.addEventListener("paste", (event) => {
          if (!editing) {
            return;
          }
          event.preventDefault();
          const pastedText = normalizeCustomPageTitleText(
            event.clipboardData?.getData("text/plain") || "",
            "",
          );
          if (!pastedText) {
            return;
          }
          insertPlainTextAtCurrentSelection(pastedText);
        });

        titleElement.addEventListener("input", () => {
          if (!editing) {
            return;
          }
          const nextDraft = normalizeCustomPageTitleText(
            titleElement.textContent,
            "",
          );
          titleElement.dataset.controlerTitleEmpty = nextDraft ? "false" : "true";
        });

        window.addEventListener("storage", (event) => {
          if (
            editing ||
            !event ||
            event.key !== APP_PAGE_CUSTOM_TITLE_STORAGE_KEY
          ) {
            return;
          }
          committedTitle =
            getStoredCustomPageTitle(pageKey) || defaultTitle;
          applyCommittedTitle();
        });
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, {
        once: true,
      });
    } else {
      bind();
    }
  }

  function getNavigationDirection(fromKey, toKey) {
    const fromIndex = APP_NAV_ITEMS.findIndex((item) => item.key === fromKey);
    const toIndex = APP_NAV_ITEMS.findIndex((item) => item.key === toKey);
    if (fromIndex < 0 || toIndex < 0) {
      return "forward";
    }
    return toIndex >= fromIndex ? "forward" : "back";
  }

  function isDesktopThemeTransitionRuntime() {
    return (
      !getNativeHostPlatform() &&
      typeof window.sessionStorage !== "undefined"
    );
  }

  function isDesktopElectronThemeTransitionRuntime() {
    return (
      window.electronAPI?.isElectron === true &&
      isDesktopThemeTransitionRuntime()
    );
  }

  function appendDesktopThemeTransitionLog(label, detail = {}) {
    return;
  }

  function parseAppPageTransitionJson(rawValue, fallback) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(rawValue);
      return parsed === null || typeof parsed === "undefined" ? fallback : parsed;
    } catch (_error) {
      return fallback;
    }
  }

  function persistDesktopAppPageTransitionState(
    currentItem,
    targetItem,
    targetHref,
  ) {
    const payload = {
      fromPage: currentItem?.key || "",
      toPage: targetItem?.key || "",
      targetHref: normalizeAppNavigationHref(targetHref),
      direction: getNavigationDirection(currentItem?.key || "", targetItem?.key || ""),
      startedAt: Date.now(),
    };
    writeAppPageTransitionState(payload);
    appendDesktopThemeTransitionLog("state-written", {
      fromPage: payload.fromPage,
      toPage: payload.toPage,
      targetHref: payload.targetHref,
      direction: payload.direction,
    });
    return payload;
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
      inlineHost: ensureDesktopContentOverlayHost() || document.body,
      scopeFullscreenToInlineHost: false,
    });
    bindAppPageLeaveOverlayShellVisibility();
    return appPageLeaveOverlayController;
  }

  function bindAppPageLeaveOverlayShellVisibility() {
    if (appPageLeaveOverlayShellVisibilityBound) {
      return;
    }
    appPageLeaveOverlayShellVisibilityBound = true;
    window.addEventListener(SHELL_VISIBILITY_EVENT_NAME, (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      if (detail.active === false) {
        setAppPageLeaveOverlayState({
          active: false,
        });
      }
    });
  }

  function setAppPageLeaveOverlayState(options = {}) {
    const active = options.active === true;
    appPageLeaveOverlayVisible = active;
    if (!active && !appPageLeaveOverlayController) {
      return;
    }
    const overlayController = getAppPageLeaveOverlayController();
    overlayController?.setState({
      active,
      mode: "fullscreen",
      lockNavigation: false,
      title:
        typeof options.title === "string" && options.title.trim()
          ? options.title.trim()
          : APP_PAGE_LEAVE_GUARD_LOADING_TITLE,
      message:
        typeof options.message === "string" && options.message.trim()
          ? options.message.trim()
          : APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE,
      delayMs: Number.isFinite(options.delayMs)
        ? Math.max(0, Math.round(Number(options.delayMs)))
        : 0,
    });
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

    const overlayTargetItem =
      APP_NAV_ITEMS.find((item) => item.key === String(context?.toPage || "").trim())
      || resolveAppNavigationItemByHref(context?.targetHref || "")
      || null;
    const overlayCopy = buildAppNavigationOverlayCopy(overlayTargetItem);

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
    const hasVisibleFullscreenOverlayExcludingLeaveGuard = () =>
      Array.from(document.querySelectorAll(".page-loading-overlay")).some(
        (overlay) =>
          overlay !== appPageLeaveOverlayElement &&
          isVisibleBlockingLoadingOverlay(overlay),
      );
    const shouldUseLeaveGuardOverlay =
      !hasVisibleFullscreenOverlayExcludingLeaveGuard();
    if ((shouldShowOverlay || appPageLeaveOverlayVisible) && shouldUseLeaveGuardOverlay) {
      setAppPageLeaveOverlayState({
        active: true,
        ...overlayCopy,
        delayMs: 0,
      });
    } else if (appPageLeaveOverlayVisible) {
      setAppPageLeaveOverlayState({
        active: false,
      });
    }

    let failure = null;
    let slowMessageTimerId = 0;
    try {
      if ((shouldShowOverlay || appPageLeaveOverlayVisible) && shouldUseLeaveGuardOverlay) {
        slowMessageTimerId = window.setTimeout(() => {
          if (hasVisibleFullscreenOverlayExcludingLeaveGuard()) {
            setAppPageLeaveOverlayState({
              active: false,
            });
            return;
          }
          setAppPageLeaveOverlayState({
            active: true,
            ...overlayCopy,
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
    }

    if (!failure) {
      return true;
    }

    setAppPageLeaveOverlayState({
      active: false,
    });

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
    const transitionState = readAppPageTransitionState();
    const currentItem = getCurrentAppNavigationItem();
    const currentHref = normalizeAppNavigationHref(window.location.href);
    const targetHref = normalizeAppNavigationHref(transitionState?.targetHref || "");
    const transitionStartedAt = Math.max(
      0,
      Number.isFinite(Number(transitionState?.startedAt))
        ? Number(transitionState.startedAt)
        : 0,
    );
    const transitionAgeMs = transitionStartedAt
      ? Math.max(0, Date.now() - transitionStartedAt)
      : Number.POSITIVE_INFINITY;
    const isFreshTransition =
      transitionAgeMs <= APP_PAGE_ENTER_TRANSITION_MAX_AGE_MS;
    const matchesCurrentTarget =
      (
        typeof transitionState?.toPage === "string" &&
        transitionState.toPage.trim() &&
        transitionState.toPage.trim() === currentItem?.key
      ) ||
      (
        targetHref &&
        (targetHref.split("#")[0] || targetHref) ===
          (currentHref.split("#")[0] || currentHref)
      );
    if (transitionState) {
      appendDesktopThemeTransitionLog("state-read", {
        fromPage:
          typeof transitionState.fromPage === "string"
            ? transitionState.fromPage
            : "",
        toPage:
          typeof transitionState.toPage === "string"
            ? transitionState.toPage
            : "",
        targetHref:
          typeof transitionState.targetHref === "string"
            ? transitionState.targetHref
            : "",
      });
    }
    if (isFreshTransition && matchesCurrentTarget) {
      writeAppPageEnterTransitionState({
        active: true,
        fromPage:
          typeof transitionState?.fromPage === "string"
            ? transitionState.fromPage.trim()
            : "",
        toPage:
          typeof transitionState?.toPage === "string"
            ? transitionState.toPage.trim()
            : "",
        targetHref: targetHref || currentHref,
        startedAt: transitionStartedAt || Date.now(),
        loadingOverlaySuppressionActive: isDesktopThemeTransitionRuntime(),
        loadingOverlaySuppressionExpiresAt:
          (transitionStartedAt || Date.now()) +
          APP_PAGE_ENTER_LOADING_OVERLAY_DELAY_MS,
      });
    } else {
      clearAppPageEnterTransitionState();
    }
    resetAppPageTransitionRuntimeState({
      clearStoredState: false,
      hideOverlay: !hasPageBootstrapPendingBodyState(),
    });
    clearAppPageTransitionState();
    syncAndroidNativeBootstrapTransitionOverlay();
  }

  function startAppPageTransition(targetItem, options = {}) {
    clearAndroidNavButtonFocus(document.activeElement, true);
    releaseAndroidInteractiveTextControlFocus();
    clearNativeNavigationRetryTimer();
    const nativeNavigationRuntime = isReactNativeNavigationRuntime();
    const androidReactNativeNavigationRuntime =
      nativeNavigationRuntime && isAndroidReactNativeNavigationRuntime();
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
    if (shouldBlockReactNativeShellNavigationInteraction()) {
      syncAndroidReactNativeAppNavLock();
      return false;
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

    const overlayCopy = buildAppNavigationOverlayCopy(targetItem);
    if (appPageLeavePreflightLocked) {
      stashDeferredAppNavigationRequest(targetItem, options);
      setAppPageLeaveOverlayState({
        active: true,
        ...overlayCopy,
        delayMs: 0,
      });
      return true;
    }
    if (androidWebTransitionRuntime && appPageTransitionLocked) {
      stashDeferredAppNavigationRequest(targetItem, options);
      setAppPageLeaveOverlayState({
        active: true,
        ...overlayCopy,
        delayMs: 0,
      });
      return true;
    }
    if (androidReactNativeNavigationRuntime && isAndroidReactNativeAppNavLocked()) {
      setAppPageLeaveOverlayState({
        active: true,
        ...overlayCopy,
        delayMs: 0,
      });
      if (dispatchNativeAppNavigationRequest(navigationRequest, currentItem)) {
        return true;
      }
      syncAndroidReactNativeAppNavLock();
    }

    appPageLeavePreflightLocked = true;
    void (async () => {
      let shouldUnlock = true;
      try {
        await waitForAndroidNavigationReleasePaint();
        setAppPageLeaveOverlayState({
          active: true,
          ...overlayCopy,
          delayMs: 0,
        });
        appPageTransitionLocked = true;
        const canLeave = await runBeforePageLeaveGuards({
          fromPage: currentItem?.key || "",
          toPage: targetItem.key,
          targetHref,
        });
        if (!canLeave) {
          syncAndroidReactNativeAppNavLock();
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
          resetAppPageTransitionRuntimeState({
            hideOverlay: false,
          });
          appPageTransitionLocked = true;
          appPageLeavePreflightLocked = true;
          if (androidReactNativeNavigationRuntime) {
            setAndroidReactNativeAppNavLocked(true);
          }
          const dispatched = dispatchNativeAppNavigationRequest(
            {
              ...resolvedNavigationRequest,
              targetItem: finalTargetItem,
              targetHref: finalTargetHref,
              options: finalNavigationOptions,
            },
            currentItem,
          );
          if (!dispatched) {
            syncAndroidReactNativeAppNavLock();
            shouldUnlock = false;
            performAppNavigation(finalTargetHref, finalNavigationOptions);
            return;
          }
          shouldUnlock = false;
          return;
        }

        resetAppPageTransitionRuntimeState({
          hideOverlay: false,
        });
        appPageTransitionLocked = true;
        appPageLeavePreflightLocked = true;
        shouldUnlock = false;
        persistDesktopAppPageTransitionState(
          currentItem,
          finalTargetItem,
          finalTargetHref,
        );
        performAppNavigation(finalTargetHref, finalNavigationOptions);
      } catch (error) {
        console.error("执行页面切换失败:", error);
        syncAndroidReactNativeAppNavLock();
        resetAppPageTransitionRuntimeState();
      } finally {
        if (shouldUnlock) {
          syncAndroidReactNativeAppNavLock();
          resetAppPageTransitionRuntimeState();
        }
      }
    })();
    return true;
  }

  function navigateAppPage(pageKey) {
    if (shouldBlockReactNativeShellNavigationInteraction()) {
      syncAndroidReactNativeAppNavLock();
      return false;
    }
    const normalizedKey = String(pageKey || "").trim();
    const targetItem = APP_NAV_ITEMS.find((item) => item.key === normalizedKey);
    if (!targetItem) {
      return false;
    }
    if (isAndroidReactNativeNavigationRuntime() && hasVisibleBlockingOverlay()) {
      stashDeferredAppNavigationRequest(targetItem);
      setAppPageLeaveOverlayState({
        active: true,
        ...buildAppNavigationOverlayCopy(targetItem),
        delayMs: 0,
      });
      ensureDeferredAppNavigationReplay();
      clearAndroidNavButtonFocus(document.activeElement, true);
      return true;
    }
    clearAndroidNavButtonFocus(document.activeElement, true);
    return startAppPageTransition(targetItem);
  }

  function navigateAppHref(targetHref, options = {}) {
    if (shouldBlockReactNativeShellNavigationInteraction()) {
      syncAndroidReactNativeAppNavLock();
      return false;
    }
    const targetItem = resolveAppNavigationItemByHref(targetHref);
    if (!targetItem) {
      return false;
    }
    if (isAndroidReactNativeNavigationRuntime() && hasVisibleBlockingOverlay()) {
      stashDeferredAppNavigationRequest(targetItem, {
        ...options,
        targetHref,
      });
      setAppPageLeaveOverlayState({
        active: true,
        ...buildAppNavigationOverlayCopy(targetItem),
        delayMs: 0,
      });
      ensureDeferredAppNavigationReplay();
      clearAndroidNavButtonFocus(document.activeElement, true);
      return true;
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
    initAppNavigationTouchGestureGuard();

    const bind = () => {
      applyAppPageEnterTransition();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
      bind();
    }

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const navButton = target?.closest?.("[data-nav-page]");
        if (!(navButton instanceof HTMLButtonElement)) {
          return;
        }
        if (navButton.dataset.navCurrent !== "true" && !navButton.disabled) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        clearAndroidNavButtonFocus(navButton, true);
      },
      true,
    );
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

  function syncModalBackgroundInteractivity(hasOpenModal = false) {
    if (!(document.body instanceof HTMLElement)) {
      return;
    }
    const visibleModals = getVisibleModalOverlays();
    const modalHosts = new Set(
      visibleModals.map((modal) => {
        let host = modal;
        while (host.parentElement && host.parentElement !== document.body) {
          host = host.parentElement;
        }
        return host;
      }),
    );
    Array.from(document.body.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }
      const containsVisibleModal =
        modalHosts.has(child) ||
        visibleModals.some((modal) => child === modal || child.contains(modal));
      const shouldDisableBackground = hasOpenModal && !containsVisibleModal;
      if (shouldDisableBackground) {
        child.inert = true;
        child.dataset.controlerModalBackgroundInert = "true";
        if (child.contains(document.activeElement)) {
          try {
            document.activeElement?.blur?.();
          } catch (error) {}
        }
        return;
      }
      if (child.dataset.controlerModalBackgroundInert === "true") {
        child.inert = false;
        delete child.dataset.controlerModalBackgroundInert;
      }
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

  const MODAL_PARENT_SURFACE_SELECTOR =
    '.modal-overlay, [data-controler-modal-parent-surface="true"]';

  function isVisibleModalParentSurface(surface) {
    if (!(surface instanceof HTMLElement)) {
      return false;
    }
    if (surface.classList.contains("modal-overlay")) {
      return isVisibleModalOverlay(surface);
    }
    if (surface.dataset?.controlerModalParentSurface !== "true") {
      return false;
    }
    if (!surface.isConnected) {
      return false;
    }
    const computed = window.getComputedStyle(surface);
    return (
      computed.display !== "none" &&
      computed.visibility !== "hidden" &&
      !surface.hasAttribute("hidden")
    );
  }

  function getVisibleModalParentSurfaces() {
    if (typeof document === "undefined") {
      return [];
    }
    return Array.from(
      document.querySelectorAll(MODAL_PARENT_SURFACE_SELECTOR),
    ).filter((surface) => isVisibleModalParentSurface(surface));
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

  function shouldScheduleAndroidModalAutofocusForVisibleModal(modal) {
    if (!isAndroidNativeRuntime()) {
      lastAndroidAutofocusVisibleModal = null;
      return false;
    }
    if (
      !(modal instanceof HTMLElement) ||
      !isAndroidModalAutofocusHostEligible(modal)
    ) {
      lastAndroidAutofocusVisibleModal = null;
      return false;
    }
    if (
      lastAndroidAutofocusVisibleModal instanceof HTMLElement &&
      (!lastAndroidAutofocusVisibleModal.isConnected ||
        !isVisibleModalOverlay(lastAndroidAutofocusVisibleModal))
    ) {
      lastAndroidAutofocusVisibleModal = null;
    }
    if (lastAndroidAutofocusVisibleModal === modal) {
      return false;
    }
    lastAndroidAutofocusVisibleModal = modal;
    return true;
  }

  function resolveModalOverlayElement(modal) {
    if (!(modal instanceof HTMLElement)) {
      return null;
    }
    if (modal.classList.contains("modal-overlay")) {
      return modal;
    }
    return modal.closest(".modal-overlay");
  }

  function parseUiHelperPixelValue(value) {
    const normalized = Number.parseFloat(String(value || "").trim());
    return Number.isFinite(normalized) ? normalized : 0;
  }

  function normalizeAndroidTransitionCoverBackground(
    value,
    fallbackValue = "",
  ) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return String(fallbackValue || "").trim();
    }
    const lowerValue = normalized.toLowerCase();
    if (
      lowerValue === "transparent" ||
      lowerValue === "rgba(0, 0, 0, 0)" ||
      lowerValue === "rgba(0,0,0,0)"
    ) {
      return String(fallbackValue || "").trim();
    }
    return normalized;
  }

  function resolveAndroidTransitionCoverBackgroundValue(
    sourceStyle = null,
    fallbackValue = "",
  ) {
    if (!sourceStyle || typeof sourceStyle !== "object") {
      return normalizeAndroidTransitionCoverBackground(fallbackValue);
    }
    const backgroundImage = String(sourceStyle.backgroundImage || "").trim();
    const backgroundColor = normalizeAndroidTransitionCoverBackground(
      sourceStyle.backgroundColor,
      "",
    );
    if (backgroundImage && backgroundImage.toLowerCase() !== "none") {
      return backgroundColor
        ? `${backgroundImage}, ${backgroundColor}`
        : backgroundImage;
    }
    return (
      backgroundColor ||
      normalizeAndroidTransitionCoverBackground(
        sourceStyle.background,
        fallbackValue,
      )
    );
  }

  function getAndroidVisibleViewportBottomPx(rootStyle = null) {
    const computedRootStyle =
      rootStyle ||
      (typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(document.documentElement)
        : null);
    const stableViewportHeight = Math.max(
      0,
      parseUiHelperPixelValue(
        computedRootStyle?.getPropertyValue(
          "--controler-stable-visual-viewport-height",
        ),
      ),
    );
    const transitionKeyboardInsetPx = Math.max(
      0,
      parseUiHelperPixelValue(
        computedRootStyle?.getPropertyValue(
          "--controler-keyboard-transition-inset",
        ),
      ),
    );
    if (stableViewportHeight > 0) {
      return Math.max(stableViewportHeight - transitionKeyboardInsetPx, 0);
    }

    const visualViewport = window.visualViewport;
    const viewportHeight =
      Number(visualViewport?.height) ||
      Number(window.innerHeight) ||
      Number(document.documentElement?.clientHeight) ||
      Number(document.body?.clientHeight) ||
      0;
    const viewportOffsetTop = Number(visualViewport?.offsetTop) || 0;
    return Math.max(0, viewportOffsetTop + viewportHeight);
  }

  function readAndroidStableViewportHeightPx(rootStyle = null) {
    const computedRootStyle =
      rootStyle ||
      (typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(document.documentElement)
        : null);
    return Math.max(
      0,
      parseUiHelperPixelValue(
        computedRootStyle?.getPropertyValue(
          "--controler-stable-visual-viewport-height",
        ),
      ),
    );
  }

  function readAndroidKeyboardTransitionInsetPx(rootStyle = null) {
    const computedRootStyle =
      rootStyle ||
      (typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(document.documentElement)
        : null);
    return Math.max(
      0,
      parseUiHelperPixelValue(
        computedRootStyle?.getPropertyValue(
          "--controler-keyboard-transition-inset",
        ),
      ),
    );
  }

  function getAndroidModalDismissPendingUntil(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(
      0,
      Number.parseInt(
        overlay.dataset.controlerAndroidDismissPendingUntil || "0",
        10,
      ) || 0,
    );
  }

  function isAndroidModalDismissPending(modal, now = Date.now()) {
    return getAndroidModalDismissPendingUntil(modal) > now;
  }

  function markAndroidModalDismissPending(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const durationMs = Math.max(
      ANDROID_MODAL_DISMISS_FREEZE_RELEASE_DELAY_MS,
      Math.round(
        Number.isFinite(Number(options.durationMs))
          ? Number(options.durationMs)
          : ANDROID_MODAL_DISMISS_PENDING_MAX_MS,
      ),
    );
    overlay.dataset.controlerAndroidDismissPendingUntil = String(
      Date.now() + durationMs,
    );
    return overlay;
  }

  function clearAndroidModalDismissPending(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    delete overlay.dataset.controlerAndroidDismissPendingUntil;
    if (
      options.releaseFreeze !== false &&
      isAndroidModalDismissFreezeActive(overlay)
    ) {
      scheduleAndroidModalDismissFreezeRelease(overlay);
    }
    return overlay;
  }

  function isAndroidModalDismissFreezeActive(modal) {
    const overlay = resolveModalOverlayElement(modal);
    return (
      overlay instanceof HTMLElement &&
      overlay.dataset.controlerAndroidDismissFreeze === "true"
    );
  }

  function resolveAndroidKeyboardTransitionCoverBackground() {
    const frozenOverlay = Array.from(
      document.querySelectorAll(".modal-overlay"),
    )
      .reverse()
      .find(
        (overlay) =>
          overlay instanceof HTMLElement &&
          overlay.dataset.controlerAndroidDismissFreeze === "true",
      );
    const visibleModals = getVisibleModalOverlays();
    const backdropOverlay =
      visibleModals.find(
        (overlay) =>
          overlay instanceof HTMLElement &&
          overlay.dataset.controlerBackdropVisible !== "false",
      ) ||
      visibleModals[0] ||
      null;
    const candidateOverlays = [frozenOverlay, backdropOverlay].filter(
      (overlay, index, source) =>
        overlay instanceof HTMLElement && source.indexOf(overlay) === index,
    );

    for (const overlay of candidateOverlays) {
      const storedBackground = normalizeAndroidTransitionCoverBackground(
        overlay.style.getPropertyValue("--controler-modal-dismiss-cover-bg"),
      );
      if (storedBackground) {
        return storedBackground;
      }
      const computedBackground =
        typeof window.getComputedStyle === "function"
          ? resolveAndroidTransitionCoverBackgroundValue(
              window.getComputedStyle(overlay),
            )
          : "";
      if (computedBackground) {
        return computedBackground;
      }
    }

    const bodyBackground =
      typeof window.getComputedStyle === "function"
        ? resolveAndroidTransitionCoverBackgroundValue(
            window.getComputedStyle(document.body),
          )
        : "";
    if (bodyBackground) {
      return bodyBackground;
    }

    return "var(--surface-app, var(--bg-primary, #ffffff))";
  }

  function writeAndroidKeyboardTransitionCoverState(
    heightPx = 0,
    backgroundValue = "",
  ) {
    const root = document.documentElement;
    const body = document.body;
    if (root instanceof HTMLElement) {
      root.style.setProperty("--controler-keyboard-transition-cover-height", "0px");
      root.style.removeProperty("--controler-keyboard-transition-cover-bg");
      root.classList.remove("controler-keyboard-transition-cover-active");
    }
    body?.classList.remove("controler-keyboard-transition-cover-active");
  }

  function clearAndroidKeyboardTransitionCoverReleaseTimer() {
    if (androidKeyboardTransitionCoverReleaseTimerId > 0) {
      window.clearTimeout(androidKeyboardTransitionCoverReleaseTimerId);
      androidKeyboardTransitionCoverReleaseTimerId = 0;
    }
  }

  function syncAndroidKeyboardTransitionCover(options = {}) {
    clearAndroidKeyboardTransitionCoverReleaseTimer();
    androidKeyboardTransitionCoverHoldUntil = 0;
    androidKeyboardTransitionCoverLastHeightPx = 0;
    androidKeyboardTransitionCoverLastInsetPx = 0;
    androidKeyboardTransitionCoverLastBackground = "";
    writeAndroidKeyboardTransitionCoverState(0, "");
    return 0;
  }

  function scheduleAndroidKeyboardTransitionCoverSync(options = {}) {
    if (options.extendHold === true) {
      androidKeyboardTransitionCoverHoldExtensionPending = true;
    }
    if (androidKeyboardTransitionCoverSyncQueued) {
      return;
    }
    androidKeyboardTransitionCoverSyncQueued = true;
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(() => {
      androidKeyboardTransitionCoverSyncQueued = false;
      const extendHold = androidKeyboardTransitionCoverHoldExtensionPending;
      androidKeyboardTransitionCoverHoldExtensionPending = false;
      syncAndroidKeyboardTransitionCover({
        extendHold,
      });
    });
  }

  function clearAndroidModalDismissFreeze(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const releaseTimerId = Number(
      overlay.__controlerAndroidDismissFreezeReleaseTimer || 0,
    );
    if (releaseTimerId > 0) {
      window.clearTimeout(releaseTimerId);
    }
    overlay.__controlerAndroidDismissFreezeReleaseTimer = 0;
    delete overlay.dataset.controlerAndroidDismissFreeze;
    delete overlay.dataset.controlerAndroidDismissPendingUntil;
    [
      "--controler-modal-overlay-width",
      "--controler-modal-overlay-height",
      "--controler-modal-overlay-available-width",
      "--controler-modal-overlay-available-height",
      "--controler-modal-overlay-inline-padding-left",
      "--controler-modal-overlay-inline-padding-right",
      "--controler-modal-overlay-block-padding-top",
      "--controler-modal-overlay-block-padding-bottom",
    ].forEach((propertyName) => {
      overlay.style.removeProperty(propertyName);
    });
    return overlay;
  }

  function resetModalOverlayPresentationState(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const pendingPersistentHideTimer = Number(
      overlay.__controlerPersistentHideTimer || 0,
    );
    if (pendingPersistentHideTimer > 0) {
      window.clearTimeout(pendingPersistentHideTimer);
      overlay.__controlerPersistentHideTimer = 0;
    }
    resetAndroidModalAutofocusState(overlay);
    clearAndroidModalDismissFreeze(overlay, {
      resync: options.resync === true,
    });
    clearProtectedModalPointerSuppression(overlay, {
      force: true,
    });
    clearManagedModalFieldRevealState(overlay);
    delete overlay.dataset.controlerModalClosing;
    delete overlay.dataset.controlerAndroidDismissPendingUntil;
    overlay.style.removeProperty("--controler-modal-close-duration");
    overlay.style.removeProperty("--controler-modal-close-backdrop-bg");
    overlay.style.removeProperty("background");
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
    overlay.style.backgroundColor = "";
    overlay.style.transition = "";
    overlay.style.visibility = "";
    const modalContent = overlay.querySelector(".modal-content");
    if (modalContent instanceof HTMLElement) {
      modalContent.style.transition = "";
      modalContent.style.opacity = "";
      modalContent.style.transform = "";
      modalContent.style.visibility = "";
      modalContent.style.pointerEvents = "";
    }
    if (overlay.dataset?.controlerModalPersistent === "true") {
      syncKeyboardAwareModalOverlay(overlay);
      bindContentScopedModalViewportSync(overlay);
      bindManagedModalFieldReveal(overlay);
    }
    return overlay;
  }

  function hidePersistentModalOverlay(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      scheduleModalHistorySync();
      scheduleNativeEdgeBackSwipeExclusionSync(document);
      return null;
    }

    const closeProtectionDuration = resolveModalInteractionProtectionDuration(
      overlay,
      MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
      "controlerCloseProtectionDurationMs",
    );
    const closeVisualDuration = resolveModalCloseVisualDuration(overlay);
    const shieldDuration = resolveModalInteractionShieldDuration(
      overlay,
      closeProtectionDuration,
    );
    const pendingPersistentHideTimer = Number(
      overlay.__controlerPersistentHideTimer || 0,
    );
    if (pendingPersistentHideTimer > 0) {
      window.clearTimeout(pendingPersistentHideTimer);
      overlay.__controlerPersistentHideTimer = 0;
    }

    cancelAndroidInteractiveTextFocusWork(overlay);
    freezeAndroidModalDismissLayout(overlay);
    protectModalFromFollowThrough(overlay, closeProtectionDuration);
    protectVisibleParentModalsFromFollowThrough(
      overlay,
      closeProtectionDuration,
    );
    activateModalInteractionShield(shieldDuration);
    applyClosingModalPresentation(overlay, {
      closeVisualDuration,
    });
    releaseCoveredParentModalInteractions(overlay, {
      delayMs: resolveCoveredParentModalReleaseDelay(closeProtectionDuration),
    });

    const finalizeHide = () => {
      overlay.__controlerPersistentHideTimer = 0;
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
      clearAndroidModalDismissFreeze(overlay, {
        resync: options.resync === true,
      });
      scheduleModalHistorySync();
      scheduleNativeEdgeBackSwipeExclusionSync(document);
    };

    if (closeVisualDuration <= 0) {
      finalizeHide();
      return overlay;
    }

    const schedule =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(() => {
      overlay.__controlerPersistentHideTimer = window.setTimeout(
        finalizeHide,
        Math.max(closeVisualDuration, MODAL_REMOVAL_DEFERRED_DELAY_MS),
      );
    });
    return overlay;
  }

  function applyClosingModalPresentation(modal, options = {}) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const closeVisualDuration = Math.max(
      0,
      Math.round(
        Number.isFinite(Number(options.closeVisualDuration))
          ? Number(options.closeVisualDuration)
          : 0,
      ),
    );
    const storedBackdropBackground = normalizeAndroidTransitionCoverBackground(
      overlay.style.getPropertyValue("--controler-modal-dismiss-cover-bg"),
    );
    const closeBackdropBackground =
      storedBackdropBackground ||
      (typeof window.getComputedStyle === "function"
        ? resolveAndroidTransitionCoverBackgroundValue(
            window.getComputedStyle(overlay),
            "var(--controler-modal-backdrop-color, var(--overlay-bg))",
          )
        : "var(--controler-modal-backdrop-color, var(--overlay-bg))");
    overlay.style.setProperty(
      "--controler-modal-close-duration",
      `${closeVisualDuration}ms`,
    );
    overlay.style.setProperty(
      "--controler-modal-close-backdrop-bg",
      closeBackdropBackground ||
        "var(--controler-modal-backdrop-paint)",
    );
    const modalContent = overlay.querySelector(".modal-content");
    overlay.style.pointerEvents = "none";
    if (closeVisualDuration > 0) {
      overlay.dataset.controlerModalClosing = "true";
    } else {
      delete overlay.dataset.controlerModalClosing;
      overlay.style.opacity = "0";
    }

    if (modalContent instanceof HTMLElement) {
      modalContent.style.pointerEvents = "none";
      if (closeVisualDuration <= 0) {
        modalContent.style.visibility = "hidden";
        modalContent.style.opacity = "0";
      }
    }
    return overlay;
  }

  function freezeAndroidModalDismissLayout(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (
      !(overlay instanceof HTMLElement) ||
      !isAndroidNativeRuntime() ||
      !isVisibleModalOverlay(overlay) ||
      !document.documentElement?.classList.contains("controler-keyboard-open")
    ) {
      return overlay;
    }
    if (isAndroidModalDismissFreezeActive(overlay)) {
      return overlay;
    }
    const computedStyle =
      typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(overlay)
        : null;
    const overlayRect = overlay.getBoundingClientRect();
    const overlayWidthPx = Math.max(
      Math.round(
        overlayRect.width || parseUiHelperPixelValue(computedStyle?.width),
      ),
      0,
    );
    const overlayHeightPx = Math.max(
      Math.round(
        overlayRect.height || parseUiHelperPixelValue(computedStyle?.height),
      ),
      0,
    );
    const paddingTopPx = Math.max(
      0,
      parseUiHelperPixelValue(computedStyle?.paddingTop),
    );
    const paddingRightPx = Math.max(
      0,
      parseUiHelperPixelValue(computedStyle?.paddingRight),
    );
    const paddingBottomPx = Math.max(
      0,
      parseUiHelperPixelValue(computedStyle?.paddingBottom),
    );
    const paddingLeftPx = Math.max(
      0,
      parseUiHelperPixelValue(computedStyle?.paddingLeft),
    );
    const availableWidthPx = Math.max(
      overlayWidthPx - paddingLeftPx - paddingRightPx,
      0,
    );
    const availableHeightPx = Math.max(
      overlayHeightPx - paddingTopPx - paddingBottomPx,
      0,
    );
    overlay.dataset.controlerAndroidDismissFreeze = "true";
    if (overlayWidthPx > 0) {
      overlay.style.setProperty(
        "--controler-modal-overlay-width",
        `${overlayWidthPx}px`,
      );
      overlay.style.setProperty(
        "--controler-modal-overlay-available-width",
        `${availableWidthPx}px`,
      );
    }
    if (overlayHeightPx > 0) {
      overlay.style.setProperty(
        "--controler-modal-overlay-height",
        `${overlayHeightPx}px`,
      );
      overlay.style.setProperty(
        "--controler-modal-overlay-available-height",
        `${availableHeightPx}px`,
      );
    }
    overlay.style.setProperty(
      "--controler-modal-overlay-inline-padding-left",
      `${Math.round(paddingLeftPx)}px`,
    );
    overlay.style.setProperty(
      "--controler-modal-overlay-inline-padding-right",
      `${Math.round(paddingRightPx)}px`,
    );
    overlay.style.setProperty(
      "--controler-modal-overlay-block-padding-top",
      `${Math.round(paddingTopPx)}px`,
    );
    overlay.style.setProperty(
      "--controler-modal-overlay-block-padding-bottom",
      `${Math.round(paddingBottomPx)}px`,
    );
    return overlay;
  }

  function scheduleAndroidModalDismissFreezeRelease(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (
      !(overlay instanceof HTMLElement) ||
      !isAndroidModalDismissFreezeActive(overlay)
    ) {
      return overlay;
    }
    const releaseTimerId = Number(
      overlay.__controlerAndroidDismissFreezeReleaseTimer || 0,
    );
    if (releaseTimerId > 0) {
      window.clearTimeout(releaseTimerId);
    }
    let attempts = 0;
    const releaseWhenSettled = () => {
      overlay.__controlerAndroidDismissFreezeReleaseTimer = 0;
      const now = Date.now();
      if (
        !overlay.isConnected ||
        !isAndroidModalDismissFreezeActive(overlay)
      ) {
        return;
      }
      if (
        !isVisibleModalOverlay(overlay) ||
        overlay.__controlerRemovalQueued === "true"
      ) {
        clearAndroidModalDismissFreeze(overlay, {
          resync: false,
        });
        return;
      }
      if (isAndroidModalDismissPending(overlay, now)) {
        overlay.__controlerAndroidDismissFreezeReleaseTimer = window.setTimeout(
          releaseWhenSettled,
          Math.min(
            96,
            Math.max(
              ANDROID_MODAL_DISMISS_FREEZE_RELEASE_DELAY_MS,
              getAndroidModalDismissPendingUntil(overlay) - now,
            ),
          ),
        );
        return;
      }
      if (getAndroidModalDismissPendingUntil(overlay) > 0) {
        clearAndroidModalDismissPending(overlay, {
          releaseFreeze: false,
        });
      }
      const activeControl = getActiveAndroidInteractiveTextControl();
      if (
        isAndroidKeyboardOpen() ||
        (activeControl instanceof HTMLElement && overlay.contains(activeControl))
      ) {
        attempts += 1;
        if (attempts < ANDROID_MODAL_DISMISS_FREEZE_RELEASE_MAX_ATTEMPTS) {
          overlay.__controlerAndroidDismissFreezeReleaseTimer = window.setTimeout(
            releaseWhenSettled,
            ANDROID_MODAL_DISMISS_FREEZE_RELEASE_DELAY_MS,
          );
        }
        return;
      }
      clearAndroidModalDismissFreeze(overlay);
    };
    overlay.__controlerAndroidDismissFreezeReleaseTimer = window.setTimeout(
      releaseWhenSettled,
      ANDROID_MODAL_DISMISS_FREEZE_RELEASE_DELAY_MS,
    );
    return overlay;
  }

  function shouldUseKeyboardAwareModalOverlay(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return false;
    }
    if (overlay.classList.contains("controler-themed-picker-overlay")) {
      return false;
    }
    return !!overlay.querySelector?.(ANDROID_INTERACTIVE_TEXT_CONTROL_SELECTOR);
  }

  function syncKeyboardAwareModalOverlay(modal) {
    const overlay = resolveModalOverlayElement(modal);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    overlay.classList.toggle(
      "controler-keyboard-aware-modal-overlay",
      shouldUseKeyboardAwareModalOverlay(overlay),
    );
    return overlay;
  }

  function isContentScopedOverlayElement(overlay) {
    if (!(overlay instanceof HTMLElement)) {
      return false;
    }
    if (String(overlay.dataset.controlerOverlayScope || "").trim() === "content") {
      return true;
    }
    if (!isDesktopContentOverlayRuntime()) {
      return false;
    }
    const closestHost = overlay.closest(DESKTOP_CONTENT_OVERLAY_HOST_SELECTOR);
    return closestHost instanceof HTMLElement && closestHost !== document.body;
  }

  function isVisibleBlockingLoadingOverlay(
    overlay,
    { includeContentScoped = true } = {},
  ) {
    if (!isVisibleOverlayElement(overlay, "page-loading-overlay")) {
      return false;
    }
    if (String(overlay.dataset.mode || "").trim() !== "fullscreen") {
      return false;
    }
    if (!includeContentScoped && isContentScopedOverlayElement(overlay)) {
      return false;
    }
    return true;
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

  function hasVisibleFullscreenBlockingOverlay() {
    if (typeof document === "undefined") {
      return false;
    }

    return Array.from(document.querySelectorAll(".page-loading-overlay")).some(
      (overlay) =>
        isVisibleBlockingLoadingOverlay(overlay, {
          includeContentScoped: false,
        }),
    );
  }

  function syncBlockingOverlayState() {
    blockingOverlaySyncQueued = false;
    const root = document.documentElement;
    const body = document.body;
    const modalCount = getVisibleModalOverlays().length;
    const hasOpenModal = modalCount > 0;
    const topVisibleModal = hasOpenModal ? getTopVisibleModal() : null;
    const hasBlockingLoadingOverlay = Array.from(
      document.querySelectorAll(".page-loading-overlay"),
    ).some((overlay) => isVisibleBlockingLoadingOverlay(overlay));
    const hasFullscreenBlockingOverlay = hasVisibleFullscreenBlockingOverlay();
    const active = hasOpenModal || hasBlockingLoadingOverlay;
    const lockMode = hasFullscreenBlockingOverlay
      ? "fullscreen"
      : hasOpenModal
        ? "modal"
        : "none";
    applyBlockingOverlayScrollLock(lockMode);
    root?.classList.toggle("controler-blocking-overlay-active", active);
    body?.classList.toggle("controler-blocking-overlay-active", active);
    root?.classList.toggle(
      "controler-fullscreen-overlay-active",
      hasFullscreenBlockingOverlay,
    );
    body?.classList.toggle(
      "controler-fullscreen-overlay-active",
      hasFullscreenBlockingOverlay,
    );
    root?.classList.toggle("controler-modal-overlay-active", hasOpenModal);
    body?.classList.toggle("controler-modal-overlay-active", hasOpenModal);
    syncModalBackgroundInteractivity(hasOpenModal);
    syncAppNavigationButtonFocusability(document, {
      disableFocus: hasOpenModal || hasBlockingLoadingOverlay,
    });
    if (shouldScheduleAndroidModalAutofocusForVisibleModal(topVisibleModal)) {
      scheduleAndroidModalAutofocus();
    }
    scheduleAndroidKeyboardTransitionCoverSync();
    const nextSignature = JSON.stringify({
      active,
      hasOpenModal,
      modalCount,
      hasBlockingLoadingOverlay,
      hasFullscreenBlockingOverlay,
    });
    if (lastReportedBlockingOverlaySignature !== nextSignature) {
      lastReportedBlockingOverlaySignature = nextSignature;
      window.dispatchEvent(
        new CustomEvent(BLOCKING_OVERLAY_STATE_EVENT_NAME, {
          detail: {
            active,
            modalCount,
            hasOpenModal,
            hasBlockingLoadingOverlay,
            hasFullscreenBlockingOverlay,
          },
        }),
      );
    }
  }

  function forceHidePageLoadingOverlays(reason = "transient-clear") {
    if (typeof document === "undefined") {
      return;
    }
    Array.from(document.querySelectorAll(".page-loading-overlay")).forEach((overlay) => {
      if (!(overlay instanceof HTMLElement)) {
        return;
      }
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.dataset.shellSuppressed = "false";
      overlay.dataset.appEnterSuppressed = "false";
      overlay.dataset.mode = "inline";
      overlay.dataset.controlerOverlayScope = "";
      overlay.style.pointerEvents = "";
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
      overlay.style.opacity = "";
      overlay.style.visibility = "";
      overlay.style.transform = "";
      overlay.style.willChange = "";
      overlay.style.background = "";
      overlay.style.backgroundColor = "";
      overlay.style.backdropFilter = "";
      overlay.style.webkitBackdropFilter = "";
    });
    const root = document.documentElement;
    const body = document.body;
    root?.classList.remove(
      "controler-blocking-overlay-active",
      "controler-fullscreen-overlay-active",
    );
    body?.classList.remove(
      "controler-blocking-overlay-active",
      "controler-fullscreen-overlay-active",
    );
    scheduleBlockingOverlaySync();
    window.dispatchEvent(
      new CustomEvent("controler:page-loading-overlays-cleared", {
        detail: { reason },
      }),
    );
  }

  window.addEventListener("controler:rn-transient-overlays-cleared", () => {
    forceHidePageLoadingOverlays("react-native-shell");
  });

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

  window.addEventListener("pagehide", () => {
    forceHidePageLoadingOverlays("pagehide");
  });
  window.addEventListener("beforeunload", () => {
    forceHidePageLoadingOverlays("beforeunload");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      forceHidePageLoadingOverlays("visibility-hidden");
    }
  });

  function applyBlockingOverlayScrollLock(nextMode = "none") {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) {
      return;
    }

    const normalizedMode =
      nextMode === "fullscreen" || nextMode === "modal" ? nextMode : "none";
    const currentMode = blockingOverlayScrollLockState?.mode || "none";

    if (normalizedMode === currentMode) {
      return;
    }

    const releaseExistingLock = () => {
      if (!blockingOverlayScrollLockState) {
        return;
      }

      const {
        mode,
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
      if (mode === "fullscreen") {
        window.scrollTo(0, Math.max(0, Number(scrollTop) || 0));
      }
    };

    releaseExistingLock();

    if (normalizedMode !== "none") {
      const scrollTop = Math.max(
        window.scrollY || window.pageYOffset || root.scrollTop || body.scrollTop || 0,
        0,
      );
      blockingOverlayScrollLockState = {
        mode: normalizedMode,
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
      if (normalizedMode === "fullscreen") {
        body.style.position = "fixed";
        body.style.top = `-${scrollTop}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        body.style.touchAction = "none";
      } else {
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        body.style.touchAction = "";
      }
      root.classList.add("controler-scroll-locked");
      body.classList.add("controler-scroll-locked");
      return;
    }

    if (!blockingOverlayScrollLockState) {
      return;
    }
  }

  function buildModalHistoryState(token) {
    const baseState =
      history.state && typeof history.state === "object" ? history.state : {};
    return {
      ...baseState,
      __controlerModalToken: token,
    };
  }

  function clearModalHistoryCompactionReleaseTimer() {
    if (!modalHistoryCompactionReleaseTimerId) {
      return;
    }
    window.clearTimeout(modalHistoryCompactionReleaseTimerId);
    modalHistoryCompactionReleaseTimerId = 0;
  }

  function isModalHistoryCompactionPending() {
    return modalHistoryCompactionPendingCount > 0;
  }

  function armModalHistoryCompactionGuard(count = 1, releaseDelayMs = 1400) {
    const nextCount = Math.max(1, Math.round(Number(count) || 0));
    modalHistoryCompactionPendingCount += nextCount;
    clearModalHistoryCompactionReleaseTimer();
    modalHistoryCompactionReleaseTimerId = window.setTimeout(() => {
      modalHistoryCompactionPendingCount = 0;
      modalHistoryCompactionReleaseTimerId = 0;
      scheduleModalHistorySync();
    }, Math.max(600, Math.round(Number(releaseDelayMs) || 0)));
  }

  function consumeModalHistoryCompactionGuard() {
    if (!isModalHistoryCompactionPending()) {
      return false;
    }
    modalHistoryCompactionPendingCount = Math.max(
      0,
      modalHistoryCompactionPendingCount - 1,
    );
    if (!modalHistoryCompactionPendingCount) {
      clearModalHistoryCompactionReleaseTimer();
    }
    return true;
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
        isModalHistoryCompactionPending() ||
        !isCompactGestureLayout()
      ) {
        continue;
      }

      if (history.state?.__controlerModalToken === token) {
        armModalHistoryCompactionGuard();
        history.back();
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
        mutations.forEach((mutation) => {
          if (!mutation) {
            return;
          }
          if (
            mutation.type === "attributes" &&
            mutation.target instanceof HTMLElement &&
            mutation.target.classList.contains("modal-overlay") &&
            !isVisibleModalOverlay(mutation.target)
          ) {
            resetAndroidModalAutofocusState(mutation.target);
          }
          if (mutation.type === "childList") {
            mutation.removedNodes.forEach((node) => {
              releaseAndroidModalAutofocusFromNode(node);
            });
          }
        });
        if (didMutationAffectBlockingOverlayState(mutations)) {
          scheduleBlockingOverlaySync();
        }
        if (didMutationAffectModalState(mutations)) {
          scheduleModalHistorySync();
          scheduleNativeEdgeBackSwipeExclusionSync(document);
        }
      });
      modalHistoryObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "style",
          "class",
          "hidden",
          "data-mode",
          "data-controler-overlay-scope",
        ],
      });

      window.addEventListener("popstate", () => {
        if (!isCompactGestureLayout()) {
          return;
        }
        if (consumeModalHistoryCompactionGuard()) {
          scheduleModalHistorySync();
          return;
        }

        const topModal = getTopVisibleModal();
        if (!topModal) {
          return;
        }
        closeModal(topModal);
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

  function initAndroidKeyboardTransitionCover() {
    if (androidKeyboardTransitionCoverInitialized || !isAndroidNativeRuntime()) {
      return;
    }
    androidKeyboardTransitionCoverInitialized = true;

    const handleSync = () => {
      scheduleAndroidKeyboardTransitionCoverSync();
    };

    window.addEventListener("resize", handleSync, {
      passive: true,
    });
    window.visualViewport?.addEventListener?.("resize", handleSync, {
      passive: true,
    });
    window.visualViewport?.addEventListener?.("scroll", handleSync, {
      passive: true,
    });
    window.addEventListener(BLOCKING_OVERLAY_STATE_EVENT_NAME, handleSync);
    document.addEventListener("visibilitychange", handleSync);
    window.addEventListener("focus", handleSync);
    scheduleAndroidKeyboardTransitionCoverSync();
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

    const visualViewport = window.visualViewport;
    const rect = anchor.getBoundingClientRect();
    const viewportOffsetLeft = Math.max(0, Number(visualViewport?.offsetLeft) || 0);
    const viewportOffsetTop = Math.max(0, Number(visualViewport?.offsetTop) || 0);
    const viewportWidth = Math.max(
      Number(visualViewport?.width) || 0,
      window.innerWidth || 0,
      rect.width,
    );
    const viewportHeight = Math.max(
      Number(visualViewport?.height) || 0,
      window.innerHeight || 0,
      rect.height,
    );
    const viewportRight = viewportOffsetLeft + viewportWidth;
    const viewportBottom = viewportOffsetTop + viewportHeight;
    const anchorLeft = rect.left + viewportOffsetLeft;
    const anchorRight = rect.right + viewportOffsetLeft;
    const anchorTop = rect.top + viewportOffsetTop;
    const anchorBottom = rect.bottom + viewportOffsetTop;
    const safeMinWidth = Math.max(rect.width, minWidth);
    const safeMaxWidth = Math.max(
      safeMinWidth,
      Math.min(maxWidth, viewportWidth - viewportPadding * 2),
    );

    let targetWidth = Math.max(safeMinWidth, preferredWidth);
    targetWidth = Math.min(targetWidth, safeMaxWidth);

    const fitsRight = anchorLeft + targetWidth <= viewportRight - viewportPadding;
    const availableRight = viewportRight - anchorLeft - viewportPadding;
    const availableLeft = anchorRight - viewportOffsetLeft - viewportPadding;

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

    const menuGap = 6;
    const computedMenuStyle = window.getComputedStyle(menu);
    const configuredMaxHeight = Number.parseFloat(computedMenuStyle.maxHeight || "");
    const baseMaxHeight = Number.isFinite(configuredMaxHeight)
      ? configuredMaxHeight
      : 340;
    const availableBelow = Math.max(
      0,
      viewportBottom - anchorBottom - viewportPadding - menuGap,
    );
    const availableAbove = Math.max(
      0,
      anchorTop - viewportOffsetTop - viewportPadding - menuGap,
    );
    const desiredMenuHeight = Math.min(
      baseMaxHeight,
      Math.max(0, viewportHeight - viewportPadding * 2),
    );
    const openUpward =
      availableBelow < desiredMenuHeight && availableAbove > availableBelow;
    const resolvedMaxHeight = Math.max(
      0,
      Math.min(
        desiredMenuHeight,
        openUpward ? availableAbove : availableBelow,
      ),
    );

    menu.style.top = openUpward ? "auto" : `calc(100% + ${menuGap}px)`;
    menu.style.bottom = openUpward ? `calc(100% + ${menuGap}px)` : "auto";
    if (resolvedMaxHeight > 0) {
      menu.style.maxHeight = `${Math.round(resolvedMaxHeight)}px`;
    } else {
      menu.style.maxHeight = "0px";
    }
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

  function waitForVisualContentStability(options = {}) {
    const resolveRoot = (target) => {
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
    };

    const root =
      resolveRoot(options.root) ||
      document.body ||
      document.documentElement ||
      null;
    if (!(root instanceof HTMLElement)) {
      return Promise.resolve(false);
    }

    const scheduleFrame =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    const now =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? () => performance.now()
        : () => Date.now();
    const isNativeRuntime = isReactNativeNavigationRuntime();
    const quietWindowMs = Number.isFinite(options.quietWindowMs)
      ? Math.max(0, Math.round(Number(options.quietWindowMs)))
      : isNativeRuntime
        ? 64
        : 44;
    const maxWaitMs = Number.isFinite(options.maxWaitMs)
      ? Math.max(32, Math.round(Number(options.maxWaitMs)))
      : isNativeRuntime
        ? 480
        : 320;
    const minQuietFrames = Number.isFinite(options.minQuietFrames)
      ? Math.max(1, Math.round(Number(options.minQuietFrames)))
      : isNativeRuntime
        ? 3
        : 2;

    return new Promise((resolve) => {
      let settled = false;
      let quietFrames = 0;
      let maxTimerId = 0;
      let observer = null;
      let lastMutationAt = now();

      const cleanup = () => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (maxTimerId) {
          window.clearTimeout(maxTimerId);
          maxTimerId = 0;
        }
      };

      const finish = (stable) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(stable === true);
      };

      try {
        observer = new MutationObserver(() => {
          lastMutationAt = now();
          quietFrames = 0;
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
      } catch (error) {
        finish(false);
        return;
      }

      const poll = () => {
        if (settled) {
          return;
        }
        if (now() - lastMutationAt < quietWindowMs) {
          quietFrames = 0;
          scheduleFrame(poll);
          return;
        }
        quietFrames += 1;
        if (quietFrames >= minQuietFrames) {
          finish(true);
          return;
        }
        scheduleFrame(poll);
      };

      maxTimerId = window.setTimeout(() => {
        finish(false);
      }, maxWaitMs);
      scheduleFrame(poll);
    });
  }

  function getBlockingMutationOverlayDelayMs(options = {}) {
    const requestedMode = String(options?.mode || "").trim().toLowerCase();
    const mode = requestedMode === "inline" ? "inline" : "fullscreen";
    if (mode === "inline") {
      return BLOCKING_MUTATION_INLINE_OVERLAY_DELAY_MS;
    }
    return isReactNativeNavigationRuntime() || isCompactGestureLayout()
      ? BLOCKING_MUTATION_FULLSCREEN_OVERLAY_DELAY_MS
      : PAGE_LOADING_OVERLAY_DELAY_MS;
  }

  function createAtomicRefreshController(options = {}) {
    const defaultDelayMs = Number.isFinite(options.defaultDelayMs)
      ? Math.max(0, Math.round(Number(options.defaultDelayMs)))
      : 150;
    const defaultShowLoading =
      typeof options.showLoading === "function" ? options.showLoading : () => {};
    const defaultHideLoading =
      typeof options.hideLoading === "function" ? options.hideLoading : () => {};
    const waitForPaint = () =>
      new Promise((resolve) => {
        const schedule =
          typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (callback) => window.setTimeout(callback, 16);
        schedule(() => {
          schedule(() => {
            resolve(true);
          });
        });
      });
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
        const waitForLoadingPaint =
          runOptions.waitForLoadingPaint === true && delayMs <= 0;
        let loadingTimerId = 0;
        let loadingShown = false;

        const revealLoading = async () => {
          if (!shouldManageLoading || loadingShown || requestId !== activeRequestId) {
            return false;
          }
          loadingShown = true;
          await Promise.resolve(showLoading(runOptions.loadingOptions || {}));
          if (waitForLoadingPaint && requestId === activeRequestId) {
            await waitForPaint();
          }
          return true;
        };

        if (shouldManageLoading) {
          if (delayMs <= 0) {
            await revealLoading();
          } else {
            loadingTimerId = window.setTimeout(() => {
              void revealLoading();
            }, delayMs);
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
            await Promise.resolve(
              hideLoading(runOptions.hideLoadingOptions || {}),
            );
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
    const promoteInlineToFullscreenOnMobile =
      options.promoteInlineToFullscreenOnMobile !== false;

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
    const getViewportWidth = () => {
      const visualViewportWidth = Number(window.visualViewport?.width);
      if (Number.isFinite(visualViewportWidth) && visualViewportWidth > 0) {
        return visualViewportWidth;
      }
      const innerWidth = Number(window.innerWidth);
      if (Number.isFinite(innerWidth) && innerWidth > 0) {
        return innerWidth;
      }
      const clientWidth = Number(document.documentElement?.clientWidth);
      if (Number.isFinite(clientWidth) && clientWidth > 0) {
        return clientWidth;
      }
      const screenWidth = Number(window.screen?.width || window.screen?.availWidth);
      if (Number.isFinite(screenWidth) && screenWidth > 0) {
        return screenWidth;
      }
      return 0;
    };
    const isCompactBlockingOverlayLayout = () => {
      const root = document.documentElement;
      const body = document.body;
      if (!(body instanceof HTMLElement)) {
        return false;
      }
      const viewportWidth = getViewportWidth();
      if (
        Number.isFinite(viewportWidth) &&
        viewportWidth > 0 &&
        viewportWidth <= MODAL_GESTURE_MAX_WIDTH
      ) {
        return true;
      }
      if (
        root?.classList.contains("controler-mobile-runtime") ||
        root?.classList.contains("controler-android-native") ||
        root?.classList.contains("controler-ios-native") ||
        body.classList.contains("controler-mobile-runtime") ||
        body.classList.contains("controler-android-native") ||
        body.classList.contains("controler-ios-native")
      ) {
        return true;
      }
      const nav = body.querySelector(".app-nav");
      if (!(nav instanceof HTMLElement)) {
        return false;
      }
      const navComputedStyle = window.getComputedStyle(nav);
      return navComputedStyle.display === "grid";
    };
    const shouldForceFullscreenMode = (mode, visible) => {
      if (!promoteInlineToFullscreenOnMobile) {
        return false;
      }
      if (!visible || mode !== "inline") {
        return false;
      }
      if (isDesktopThemeTransitionRuntime()) {
        const transitionState = readAppPageTransitionState();
        const transitionStartedAt = Math.max(
          0,
          Number.isFinite(Number(transitionState?.startedAt))
            ? Number(transitionState.startedAt)
            : 0,
        );
        if (
          transitionStartedAt > 0 &&
          Date.now() - transitionStartedAt <= APP_PAGE_ENTER_TRANSITION_MAX_AGE_MS
        ) {
          return true;
        }
      }
      const platform = String(window.ControlerNativeBridge?.platform || "").trim();
      if (platform === "android" || platform === "ios") {
        return true;
      }
      if (isReactNativeNavigationRuntime()) {
        return true;
      }
      return isCompactBlockingOverlayLayout();
    };
    let overlayTimerId = 0;
    let destroyed = false;
    let currentVisibility = !overlay.hidden;
    let currentBlockingVisibility = currentVisibility;
    let currentMode = normalizeMode(overlay.dataset.mode || "inline");
    let currentNativeBusySignature = "";
    let suppressRevealingAfterShellUnlock = false;
    let suppressDuringAppPageEnterTransition = false;
    let preserveViewportScopeUntilHidden = false;
    let stateRequestVersion = 0;
    let requestedOverlayState = {
      visible: currentVisibility,
      mode: currentMode,
      title:
        titleNode instanceof HTMLElement ? titleNode.textContent || "正在加载数据中" : "正在加载数据中",
      message: messageNode instanceof HTMLElement ? messageNode.textContent || "" : "",
      lockNavigation: currentMode === "fullscreen" && currentVisibility,
      delegateToNative: true,
    };

    const shouldDelegateFullscreenOverlayToNative = (
      visible,
      mode,
      delegateToNative = true,
    ) => {
      if (!visible || mode !== "fullscreen") {
        return false;
      }
      if (delegateToNative === false) {
        return false;
      }
      if (!isReactNativeNavigationRuntime() || !isShellPageActive()) {
        return false;
      }
      const isLeaveGuardOverlay =
        overlay === appPageLeaveOverlayElement ||
        overlay.id === "controler-page-leave-overlay";
      if (appPageLeaveOverlayVisible && !isLeaveGuardOverlay) {
        return false;
      }
      return true;
    };

    const syncNativeBusyState = (busyState = {}) => {
      if (!isReactNativeNavigationRuntime()) {
        return;
      }
      const nextPayload = {
        href: window.location.href,
        isBusy: busyState.active === true,
        busy: busyState.active === true,
        lockNavigation: busyState.lockNavigation === true,
        title:
          typeof busyState.title === "string" && busyState.title.trim()
            ? busyState.title.trim()
            : "",
        message:
          typeof busyState.message === "string" && busyState.message.trim()
            ? busyState.message.trim()
            : "",
        presentation:
          typeof busyState.presentation === "string" && busyState.presentation.trim()
            ? busyState.presentation.trim()
            : "",
      };
      const nextSignature = JSON.stringify(nextPayload);
      if (nextSignature === currentNativeBusySignature) {
        return;
      }
      currentNativeBusySignature = nextSignature;
      window.ControlerNativeBridge?.emitEvent?.("ui.busy-state", nextPayload);
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

    const shouldScopeFullscreenToInlineHost = (
      mode = currentMode,
      visible = currentVisibility,
    ) => {
      if (!visible || normalizeMode(mode) !== "fullscreen") {
        return false;
      }
      if (preserveViewportScopeUntilHidden && !isLeaveGuardOverlay) {
        return false;
      }
      if (!(inlineHost instanceof HTMLElement) || !scopeFullscreenToInlineHost) {
        return false;
      }
      // Fullscreen loading overlays must always center against the full viewport.
      // Constraining them to the content host produces a second visual center
      // during navigation and cold-start handoff.
      return false;
    };

    const shouldSuppressFullscreenOverlay = (visible, mode) => {
      if (!visible || mode !== "fullscreen") {
        return false;
      }
      if (!isReactNativeNavigationRuntime()) {
        return false;
      }
      const isLeaveGuardOverlay =
        overlay === appPageLeaveOverlayElement ||
        overlay.id === "controler-page-leave-overlay";
      if (!isLeaveGuardOverlay && appPageLeaveOverlayVisible) {
        return true;
      }
      return !isShellPageActive() || isShellTransitionLoading();
    };

    const isLeaveGuardOverlay =
      overlay === appPageLeaveOverlayElement ||
      overlay.id === "controler-page-leave-overlay";

    const shouldPreserveViewportScopeDuringBootstrap = (visible, mode) => {
      if (!visible || mode !== "fullscreen" || isLeaveGuardOverlay) {
        return false;
      }
      return preserveViewportScopeUntilHidden || hasPageBootstrapPendingBodyState();
    };

    const shouldSuppressLoadingOverlayDuringAppPageEnterTransition = (visible) => {
      if (!visible || isLeaveGuardOverlay) {
        return false;
      }
      if (!isDesktopThemeTransitionRuntime()) {
        return false;
      }
      const enterTransitionState = getAppPageEnterTransitionState();
      if (
        !enterTransitionState.active ||
        enterTransitionState.loadingOverlaySuppressionActive !== true
      ) {
        return false;
      }
      if (
        enterTransitionState.loadingOverlaySuppressionExpiresAt > 0 &&
        Date.now() > enterTransitionState.loadingOverlaySuppressionExpiresAt
      ) {
        clearAppPageEnterTransitionState();
        return false;
      }
      return true;
    };

    const getAppPageEnterLoadingOverlayDelayMs = (visible, mode) => {
      if (!visible || mode !== "fullscreen" || isLeaveGuardOverlay) {
        return 0;
      }
      if (!isDesktopThemeTransitionRuntime()) {
        return 0;
      }
      const enterTransitionState = getAppPageEnterTransitionState();
      if (
        !enterTransitionState.active ||
        enterTransitionState.loadingOverlaySuppressionActive !== true
      ) {
        return 0;
      }
      const expiresAt = Math.max(
        0,
        Number.isFinite(Number(enterTransitionState.loadingOverlaySuppressionExpiresAt))
          ? Number(enterTransitionState.loadingOverlaySuppressionExpiresAt)
          : 0,
      );
      if (expiresAt <= 0) {
        return 0;
      }
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        clearAppPageEnterTransitionState();
        return 0;
      }
      return Math.max(0, Math.ceil(remainingMs) + 16);
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
      if (!shouldScopeFullscreenToInlineHost(currentMode, currentVisibility)) {
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
      lockNavigation = false,
      delegateToNative = true,
    } = {}) => {
      if (destroyed) {
        return;
      }

      const requestedMode = normalizeMode(mode);
      const resolvedMode = shouldForceFullscreenMode(requestedMode, visible)
        ? "fullscreen"
        : requestedMode;
      const shouldPreserveViewportScope =
        shouldPreserveViewportScopeDuringBootstrap(visible, resolvedMode);
      if (shouldPreserveViewportScope) {
        preserveViewportScopeUntilHidden = true;
      } else if (!visible || resolvedMode !== "fullscreen") {
        preserveViewportScopeUntilHidden = false;
      }
      requestedOverlayState = {
        visible,
        mode: requestedMode,
        title,
        message,
        lockNavigation,
        delegateToNative,
      };
      const suppressedByShell = shouldSuppressFullscreenOverlay(
        visible,
        resolvedMode,
      );
      const suppressedByAppPageEnterTransition =
        shouldSuppressLoadingOverlayDuringAppPageEnterTransition(visible);
      if (visible && resolvedMode === "fullscreen" && suppressedByShell) {
        suppressRevealingAfterShellUnlock = true;
      } else if (!visible) {
        suppressRevealingAfterShellUnlock = false;
      }
      const delegatedToNative = shouldDelegateFullscreenOverlayToNative(
        visible,
        resolvedMode,
        delegateToNative,
      ) && !suppressedByShell;
      const actualVisible =
        visible &&
        !suppressedByShell &&
        !suppressedByAppPageEnterTransition &&
        !delegatedToNative;
      if (actualVisible && resolvedMode === "fullscreen" && isAndroidNativeRuntime()) {
        releaseAndroidInteractiveTextControlFocus();
      }
      if (actualVisible && resolvedMode === "fullscreen") {
        moveOverlayToFullscreenHost();
      } else {
        moveOverlayToInlineHost();
      }

      overlay.dataset.mode = resolvedMode;
      overlay.dataset.controlerOverlayScope =
        resolvedMode === "fullscreen" &&
        !shouldPreserveViewportScope &&
        shouldScopeFullscreenToInlineHost(resolvedMode, actualVisible)
          ? "content"
          : "viewport";
      overlay.hidden = !actualVisible;
      overlay.setAttribute("aria-hidden", actualVisible ? "false" : "true");
      overlay.dataset.shellSuppressed = suppressedByShell ? "true" : "false";
      overlay.dataset.appEnterSuppressed = suppressedByAppPageEnterTransition
        ? "true"
        : "false";
      currentVisibility = actualVisible;
      currentBlockingVisibility = actualVisible || delegatedToNative;
      currentMode = resolvedMode;

      if (suppressedByAppPageEnterTransition) {
        suppressDuringAppPageEnterTransition = true;
      } else if (!visible && suppressDuringAppPageEnterTransition) {
        suppressDuringAppPageEnterTransition = false;
        clearAppPageEnterTransitionState();
      }

      syncNativeBusyState({
        active: delegatedToNative,
        lockNavigation: lockNavigation === true,
        title,
        message,
        presentation: delegatedToNative ? "native-fullscreen" : "",
      });

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

    const handleShellVisibilityChange = (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      if (detail.active === false) {
        forceHideOverlay();
        forceHidePageLoadingOverlays("shell-inactive");
        return;
      }
      if (
        suppressRevealingAfterShellUnlock &&
        requestedOverlayState.visible &&
        normalizeMode(requestedOverlayState.mode) === "fullscreen"
      ) {
        suppressRevealingAfterShellUnlock = false;
        applyOverlayState({
          ...requestedOverlayState,
          visible: false,
        });
        return;
      }
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
          return Promise.resolve(false);
        }
        const requestVersion = ++stateRequestVersion;

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
        const requestedDelayMs = Number.isFinite(nextState.delayMs)
          ? Math.max(0, Math.round(Number(nextState.delayMs)))
          : 0;
        const delayMs = Math.max(
          requestedDelayMs,
          getAppPageEnterLoadingOverlayDelayMs(active, mode),
        );
        const lockNavigation =
          nextState.lockNavigation === true ||
          (nextState.lockNavigation !== false && active && mode === "fullscreen");
        const delegateToNative = nextState.delegateToNative !== false;

        window.clearTimeout(overlayTimerId);
        overlayTimerId = 0;

        if (!active) {
          const finalizeHide = () => {
            if (destroyed || requestVersion !== stateRequestVersion) {
              return false;
            }
            applyOverlayState({
              visible: false,
              mode,
              title,
              message,
              lockNavigation,
              delegateToNative,
            });
            return true;
          };
          const shouldWaitForSettledContent =
            nextState.waitForSettledContent !== false &&
            currentBlockingVisibility;
          if (!shouldWaitForSettledContent) {
            finalizeHide();
            return Promise.resolve(true);
          }
          const settledRoot =
            resolveLoadingOverlayElement(nextState.settledRoot) ||
            resolveLoadingOverlayElement(options.settledRoot) ||
            inlineHost ||
            overlay.parentElement ||
            document.body;
          return waitForVisualContentStability({
            root: settledRoot,
            quietWindowMs: nextState.settleQuietWindowMs,
            maxWaitMs: nextState.settleMaxWaitMs,
            minQuietFrames: nextState.settleMinQuietFrames,
          })
            .catch(() => false)
            .then(() => finalizeHide());
        }

        if (delayMs > 0) {
          applyOverlayState({
            visible: false,
            mode,
            title,
            message,
            lockNavigation,
            delegateToNative,
          });
          overlayTimerId = window.setTimeout(() => {
            overlayTimerId = 0;
            applyOverlayState({
              visible: true,
              mode,
              title,
              message,
              lockNavigation,
              delegateToNative,
            });
          }, delayMs);
          return Promise.resolve(true);
        }

        applyOverlayState({
          visible: true,
          mode,
          title,
          message,
          lockNavigation,
          delegateToNative,
        });
        return Promise.resolve(true);
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
        syncNativeBusyState({
          active: false,
          lockNavigation: false,
          title: "",
          message: "",
          presentation: "",
        });
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

  const MODAL_INTERACTION_SHIELD_DURATION_MS = 360;
  const MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS = Math.max(
    MODAL_INTERACTION_SHIELD_DURATION_MS,
    MODAL_ACTION_DEDUP_WINDOW_MS + 40,
  );
  const MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS = Math.max(
    MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
    520,
  );
  let modalInteractionShield = null;
  let modalInteractionShieldTimer = 0;
  let modalInteractionSuppressionStartedAt = 0;
  let modalInteractionSuppressionUntil = 0;
  let modalInteractionSuppressionCaptureBound = false;

  function armModalInteractionSuppression(
    durationMs = MODAL_INTERACTION_SHIELD_DURATION_MS,
  ) {
    const safeDuration = Math.max(
      80,
      Number(durationMs) || MODAL_INTERACTION_SHIELD_DURATION_MS,
    );
    modalInteractionSuppressionStartedAt = Date.now();
    modalInteractionSuppressionUntil =
      modalInteractionSuppressionStartedAt + safeDuration;
    return modalInteractionSuppressionUntil;
  }

  function recordModalInteractionIntent(target) {
    if (!(target instanceof HTMLElement)) {
      return 0;
    }
    const timestamp = Date.now();
    modalInteractionIntentTimestamps.set(target, timestamp);
    return timestamp;
  }

  function readModalInteractionIntentAt(target) {
    if (!(target instanceof HTMLElement)) {
      return 0;
    }
    const timestamp = Number(modalInteractionIntentTimestamps.get(target) || 0);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
    return (
      Number.parseInt(
        target.dataset.controlerModalInteractionIntentAt || "0",
        10,
      ) || 0
    );
  }

  function resolveModalInteractionIntentAt(target) {
    let current =
      target instanceof HTMLElement
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    let latestIntentAt = 0;
    while (current instanceof HTMLElement) {
      latestIntentAt = Math.max(
        latestIntentAt,
        readModalInteractionIntentAt(current),
      );
      current = current.parentElement;
    }
    return latestIntentAt;
  }

  function resolveModalInteractionSuppressionTarget(target) {
    const element =
      target instanceof HTMLElement
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    if (element instanceof HTMLElement) {
      return (
        element.closest(".modal-overlay") ||
        element.closest(
          [
            "button",
            "[role='button']",
            "a[href]",
            "select",
            "summary",
            "input",
            "textarea",
            "[contenteditable='true']",
            "[contenteditable]:not([contenteditable='false'])",
          ].join(", "),
        ) ||
        element
      );
    }
    return getTopVisibleModal() || document.body || null;
  }

  function resolveOwningModalOverlay(target) {
    const element =
      target instanceof HTMLElement
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    if (element.matches(MODAL_PARENT_SURFACE_SELECTOR)) {
      return element;
    }
    return element.closest(MODAL_PARENT_SURFACE_SELECTOR);
  }

  function readModalFollowThroughProtectionUntil(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    return (
      Number.parseInt(
        modal.dataset.controlerModalFollowThroughProtectedUntil || "0",
        10,
      ) || 0
    );
  }

  function protectModalFromFollowThrough(
    modal,
    durationMs = MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
  ) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    const safeDuration = Math.max(
      80,
      Number(durationMs) || MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
    );
    const until = Date.now() + safeDuration;
    modal.dataset.controlerModalFollowThroughProtectedUntil = String(
      Math.max(readModalFollowThroughProtectionUntil(modal), until),
    );
    recordModalInteractionIntent(modal);
    const modalContent = modal.querySelector(".modal-content");
    if (modalContent instanceof HTMLElement) {
      recordModalInteractionIntent(modalContent);
    }
    return until;
  }

  function protectOpeningModalFromFollowThrough(
    modal,
    durationMs = MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
  ) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    return protectModalFromFollowThrough(
      modal,
      resolveModalInteractionProtectionDuration(
        modal,
        durationMs,
        "controlerOpenProtectionDurationMs",
      ),
    );
  }

  function readModalPointerSuppressionUntil(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    return (
      Number.parseInt(
        modal.dataset.controlerModalPointerSuppressedUntil || "0",
        10,
      ) || 0
    );
  }

  function clearProtectedModalPointerSuppression(modal, { force = false } = {}) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    const timerId = modal.__controlerModalPointerSuppressionTimer;
    if (timerId) {
      window.clearTimeout(timerId);
      modal.__controlerModalPointerSuppressionTimer = 0;
    }
    if (!force && Date.now() < readModalPointerSuppressionUntil(modal)) {
      return;
    }
    const restoreValue = modal.dataset.controlerModalPointerEventsRestore || "";
    if (restoreValue) {
      modal.style.pointerEvents = restoreValue;
    } else {
      modal.style.removeProperty("pointer-events");
    }
    delete modal.dataset.controlerModalPointerEventsRestore;
    delete modal.dataset.controlerModalPointerSuppressedUntil;
  }

  function scheduleProtectedModalPointerSuppressionRelease(modal) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    const remainingMs = Math.max(
      0,
      readModalPointerSuppressionUntil(modal) - Date.now(),
    );
    const timerId = modal.__controlerModalPointerSuppressionTimer;
    if (timerId) {
      window.clearTimeout(timerId);
    }
    modal.__controlerModalPointerSuppressionTimer = window.setTimeout(() => {
      modal.__controlerModalPointerSuppressionTimer = 0;
      clearProtectedModalPointerSuppression(modal);
      if (Date.now() < readModalPointerSuppressionUntil(modal)) {
        scheduleProtectedModalPointerSuppressionRelease(modal);
      }
    }, Math.max(32, remainingMs + 16));
  }

  function suspendModalPointerInteractions(
    modal,
    durationMs = MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
  ) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    const safeDuration = Math.max(
      80,
      Number(durationMs) || MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
    );
    const until = Date.now() + safeDuration;
    modal.dataset.controlerModalPointerSuppressedUntil = String(
      Math.max(readModalPointerSuppressionUntil(modal), until),
    );
    if (!("controlerModalPointerEventsRestore" in modal.dataset)) {
      modal.dataset.controlerModalPointerEventsRestore =
        modal.style.pointerEvents || "";
    }
    modal.style.pointerEvents = "none";
    scheduleProtectedModalPointerSuppressionRelease(modal);
    return until;
  }

  function readCoveredModalChildLockCount(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(0, Number(modal.__controlerCoveredByChildModalCount) || 0);
  }

  function freezeCoveredModalPointerInteractions(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    const nextCount = readCoveredModalChildLockCount(modal) + 1;
    modal.__controlerCoveredByChildModalCount = nextCount;
    if (nextCount === 1) {
      modal.__controlerCoveredByChildModalPointerRestore =
        modal.style.pointerEvents || "";
      modal.style.pointerEvents = "none";
    }
    return nextCount;
  }

  function releaseCoveredModalPointerInteractions(modal) {
    if (!(modal instanceof HTMLElement)) {
      return 0;
    }
    const nextCount = Math.max(0, readCoveredModalChildLockCount(modal) - 1);
    modal.__controlerCoveredByChildModalCount = nextCount;
    if (nextCount > 0) {
      return nextCount;
    }
    const restoreValue =
      typeof modal.__controlerCoveredByChildModalPointerRestore === "string"
        ? modal.__controlerCoveredByChildModalPointerRestore
        : "";
    if (restoreValue) {
      modal.style.pointerEvents = restoreValue;
    } else {
      modal.style.removeProperty("pointer-events");
    }
    delete modal.__controlerCoveredByChildModalCount;
    delete modal.__controlerCoveredByChildModalPointerRestore;
    return 0;
  }

  function releaseCoveredParentModalInteractions(
    sourceModal,
    { delayMs = 0 } = {},
  ) {
    if (!(sourceModal instanceof HTMLElement)) {
      return;
    }

    const clearReleaseTimer = () => {
      const releaseTimer = Number(sourceModal.__controlerCoveredParentModalReleaseTimer);
      if (releaseTimer) {
        window.clearTimeout(releaseTimer);
      }
      sourceModal.__controlerCoveredParentModalReleaseTimer = 0;
    };

    const finalizeRelease = () => {
      clearReleaseTimer();
      const observer = sourceModal.__controlerCoveredParentModalObserver;
      if (observer && typeof observer.disconnect === "function") {
        observer.disconnect();
      }
      sourceModal.__controlerCoveredParentModalObserver = null;

      const coveredModals = Array.isArray(sourceModal.__controlerCoveredParentModals)
        ? sourceModal.__controlerCoveredParentModals.filter(
            (modal) => modal instanceof HTMLElement,
          )
        : [];
      delete sourceModal.__controlerCoveredParentModals;
      coveredModals.forEach((modal) => {
        releaseCoveredModalPointerInteractions(modal);
      });
    };

    if (delayMs > 0) {
      clearReleaseTimer();
      sourceModal.__controlerCoveredParentModalReleaseTimer = window.setTimeout(
        finalizeRelease,
        Math.max(0, Math.round(Number(delayMs) || 0)),
      );
      return;
    }

    finalizeRelease();
  }

  function freezeCoveredParentModalInteractions(sourceModal) {
    if (!(sourceModal instanceof HTMLElement)) {
      return sourceModal;
    }

    const existingCoveredModals = Array.isArray(sourceModal.__controlerCoveredParentModals)
      ? sourceModal.__controlerCoveredParentModals.filter(
          (modal) => modal instanceof HTMLElement && modal.isConnected,
        )
      : [];
    const visibleParentModals = getVisibleModalParentSurfaces().filter(
      (modal) => modal !== sourceModal,
    );
    if (!visibleParentModals.length) {
      return sourceModal;
    }

    const knownModals = new Set(existingCoveredModals);
    const nextCoveredModals = existingCoveredModals.slice();
    visibleParentModals.forEach((modal) => {
      if (knownModals.has(modal)) {
        return;
      }
      protectModalFromFollowThrough(
        modal,
        MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
      );
      freezeCoveredModalPointerInteractions(modal);
      nextCoveredModals.push(modal);
      knownModals.add(modal);
    });
    sourceModal.__controlerCoveredParentModals = nextCoveredModals;

    if (
      !sourceModal.__controlerCoveredParentModalObserver &&
      typeof MutationObserver === "function" &&
      document.body
    ) {
      const observer = new MutationObserver(() => {
        if (sourceModal.isConnected) {
          return;
        }
        releaseCoveredParentModalInteractions(sourceModal);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      sourceModal.__controlerCoveredParentModalObserver = observer;
    }

    return sourceModal;
  }

  function resolveModalInteractionProtectionDuration(
    modal,
    fallbackDuration = MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
    datasetKey = "controlerActionProtectionDurationMs",
  ) {
    const requestedDuration =
      Number.isFinite(Number(fallbackDuration)) && Number(fallbackDuration) > 0
        ? Math.max(80, Number(fallbackDuration))
        : 80;
    if (!(modal instanceof HTMLElement)) {
      return requestedDuration;
    }
    const androidFastDismissProtectionFloor =
      isAndroidNativeRuntime() &&
      (
        modal.dataset?.controlerCloseHideImmediately === "true" ||
        String(modal.dataset?.controlerClosingPointerEvents || "").trim() === "none"
      )
        ? ANDROID_INTERACTIVE_ACTION_CLICK_BYPASS_WINDOW_MS + 160
        : 0;
    const datasetValue = Number.parseInt(modal.dataset?.[datasetKey] || "", 10);
    if (Number.isFinite(datasetValue) && datasetValue > 0) {
      return Math.max(80, datasetValue, androidFastDismissProtectionFloor);
    }
    return Math.max(requestedDuration, androidFastDismissProtectionFloor);
  }

  function resolveModalInteractionShieldDuration(
    modal,
    fallbackDuration = MODAL_INTERACTION_SHIELD_DURATION_MS,
  ) {
    return resolveModalInteractionProtectionDuration(
      modal,
      fallbackDuration,
      "controlerInteractionShieldDurationMs",
    );
  }

  function resolveModalCloseVisualDuration(
    modal,
    fallbackDuration = isAndroidNativeRuntime()
      ? ANDROID_MODAL_CLOSE_VISUAL_DURATION_MS
      : MODAL_CLOSE_VISUAL_DURATION_MS,
  ) {
    return resolveModalInteractionProtectionDuration(
      modal,
      fallbackDuration,
      "controlerCloseVisualDurationMs",
    );
  }

  function protectVisibleParentModalsFromFollowThrough(
    sourceModal,
    durationMs = MODAL_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
  ) {
    if (!(sourceModal instanceof HTMLElement)) {
      return 0;
    }
    const visibleModals = getVisibleModalParentSurfaces();
    let protectedUntil = 0;
    visibleModals.forEach((modal) => {
      if (modal === sourceModal) {
        return;
      }
      const isCoveredByChildModal = readCoveredModalChildLockCount(modal) > 0;
      protectedUntil = Math.max(
        protectedUntil,
        protectModalFromFollowThrough(modal, durationMs),
        isCoveredByChildModal ? 0 : suspendModalPointerInteractions(modal, durationMs),
      );
    });
    return protectedUntil;
  }

  function resolveCoveredParentModalReleaseDelay(delayMs = 0) {
    const baseDelay = Math.max(0, Math.round(Number(delayMs) || 0));
    if (!isAndroidNativeRuntime()) {
      return baseDelay;
    }
    return Math.max(
      baseDelay,
      ANDROID_INTERACTIVE_ACTION_CLICK_BYPASS_WINDOW_MS + 140,
    );
  }

  function isModalFollowThroughProtected(target) {
    const owningModal = resolveOwningModalOverlay(target);
    return (
      owningModal instanceof HTMLElement &&
      Date.now() < readModalFollowThroughProtectionUntil(owningModal)
    );
  }

  function shouldSuppressModalFollowThrough(target, event = null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (isModalFollowThroughProtected(target)) {
      return true;
    }
    if (Date.now() >= modalInteractionSuppressionUntil) {
      return false;
    }
    if (event?.detail === 0) {
      return false;
    }
    return (
      resolveModalInteractionIntentAt(target) < modalInteractionSuppressionStartedAt
    );
  }

  function bindGlobalModalInteractionSuppression() {
    if (modalInteractionSuppressionCaptureBound || typeof document === "undefined") {
      return;
    }
    modalInteractionSuppressionCaptureBound = true;

    const recordIntentFromEvent = (event) => {
      const eventTarget = event.target;
      const suppressionTarget =
        resolveModalInteractionSuppressionTarget(eventTarget);
      if (
        suppressionTarget instanceof HTMLElement &&
        isModalFollowThroughProtected(suppressionTarget)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return;
      }
      if (suppressionTarget instanceof HTMLElement) {
        recordModalInteractionIntent(suppressionTarget);
      }
      const directElement =
        eventTarget instanceof HTMLElement
          ? eventTarget
          : eventTarget instanceof Node
            ? eventTarget.parentElement
            : null;
      if (
        directElement instanceof HTMLElement &&
        directElement !== suppressionTarget
      ) {
        recordModalInteractionIntent(directElement);
      }
    };

    const suppressEvent = (event) => {
      const suppressionTarget =
        resolveModalInteractionSuppressionTarget(event.target);
      if (
        !(suppressionTarget instanceof HTMLElement) ||
        !shouldSuppressModalFollowThrough(suppressionTarget, event)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    };

    ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
      document.addEventListener(eventName, recordIntentFromEvent, {
        capture: true,
        passive: eventName === "touchstart",
      });
    });
    [
      "pointerdown",
      "mousedown",
      "touchstart",
      "pointerup",
      "mouseup",
      "touchend",
      "click",
    ].forEach((eventName) => {
      document.addEventListener(eventName, suppressEvent, true);
    });
  }

  bindGlobalModalInteractionSuppression();

  function getModalInteractionShield() {
    if (modalInteractionShield instanceof HTMLElement) {
      return modalInteractionShield;
    }
    if (typeof document === "undefined") {
      return null;
    }
    const shield = document.createElement("div");
    const contentHost = isDesktopContentOverlayRuntime()
      ? null
      : ensureDesktopContentOverlayHost();
    const scopedToContent = contentHost instanceof HTMLElement;
    shield.dataset.controlerModalInteractionShield = "true";
    shield.dataset.controlerOverlayScope = scopedToContent ? "content" : "viewport";
    shield.setAttribute("aria-hidden", "true");
    shield.style.position = scopedToContent ? "absolute" : "fixed";
    shield.style.inset = "0";
    shield.style.width = scopedToContent ? "auto" : "100vw";
    shield.style.minHeight = scopedToContent ? "100%" : "100vh";
    shield.style.height = scopedToContent ? "100%" : "100vh";
    shield.style.maxHeight = scopedToContent ? "none" : "100vh";
    shield.style.borderRadius =
      scopedToContent && contentHost instanceof HTMLElement
        ? window.getComputedStyle(contentHost).borderRadius || ""
        : "";
    shield.style.background = "transparent";
    shield.style.pointerEvents = "none";
    shield.style.touchAction = "none";
    shield.style.zIndex = "2147483647";
    shield.style.display = "none";
    const swallowInteraction = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    };
    [
      "pointerdown",
      "pointerup",
      "click",
      "touchstart",
      "touchend",
      "mousedown",
      "mouseup",
    ].forEach((eventName) => {
      shield.addEventListener(eventName, swallowInteraction, true);
    });
    modalInteractionShield = shield;
    return shield;
  }

  function activateModalInteractionShield(
    durationMs = MODAL_INTERACTION_SHIELD_DURATION_MS,
  ) {
    if (typeof document === "undefined") {
      return;
    }
    const shield = getModalInteractionShield();
    if (!(shield instanceof HTMLElement)) {
      return;
    }
    const scopedHost = isDesktopContentOverlayRuntime()
      ? document.body
      : ensureDesktopContentOverlayHost() || document.body;
    if (!(scopedHost instanceof HTMLElement)) {
      return;
    }
    armModalInteractionSuppression(durationMs);
    shield.dataset.controlerOverlayScope =
      scopedHost === document.body ? "viewport" : "content";
    shield.style.position = scopedHost === document.body ? "fixed" : "absolute";
    shield.style.width = scopedHost === document.body ? "100vw" : "auto";
    shield.style.minHeight = scopedHost === document.body ? "100vh" : "100%";
    shield.style.height = scopedHost === document.body ? "100vh" : "100%";
    shield.style.maxHeight = scopedHost === document.body ? "100vh" : "none";
    shield.style.borderRadius =
      scopedHost === document.body
        ? ""
        : window.getComputedStyle(scopedHost).borderRadius || "";
    if (!scopedHost.contains(shield)) {
      scopedHost.appendChild(shield);
    }
    shield.style.display = "block";
    shield.style.pointerEvents = "auto";
    if (modalInteractionShieldTimer) {
      window.clearTimeout(modalInteractionShieldTimer);
    }
    modalInteractionShieldTimer = window.setTimeout(() => {
      shield.style.pointerEvents = "none";
      shield.style.display = "none";
      modalInteractionShieldTimer = 0;
    }, Math.max(80, Number(durationMs) || MODAL_INTERACTION_SHIELD_DURATION_MS));
  }

  function clearContentScopedModalViewportSync(modal) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    const cleanup = modal.__controlerContentViewportCleanup;
    if (typeof cleanup === "function") {
      cleanup();
    }
    modal.__controlerContentViewportCleanup = null;
  }

  function syncModalOverlayViewportMetrics(modal, width = 0, height = 0) {
    if (!(modal instanceof HTMLElement)) {
      return modal;
    }
    const resolvedWidth = Math.max(
      0,
      Number.isFinite(Number(width)) ? Number(width) : 0,
    );
    const resolvedHeight = Math.max(
      0,
      Number.isFinite(Number(height)) ? Number(height) : 0,
    );
    if (resolvedWidth > 0) {
      modal.style.setProperty(
        "--controler-modal-overlay-width",
        `${Math.round(resolvedWidth)}px`,
      );
    }
    if (resolvedHeight > 0) {
      modal.style.setProperty(
        "--controler-modal-overlay-height",
        `${Math.round(resolvedHeight)}px`,
      );
    }
    return modal;
  }

  function syncContentScopedModalViewport(modal) {
    if (
      !(modal instanceof HTMLElement) ||
      String(modal.dataset?.controlerOverlayScope || "").trim() !== "content"
    ) {
      return null;
    }
    const host = modal.parentElement;
    if (!(host instanceof HTMLElement)) {
      return null;
    }
    const viewportWidth = Math.max(0, host.clientWidth || host.offsetWidth || 0);
    const viewportHeight = Math.max(
      0,
      host.clientHeight || host.offsetHeight || 0,
    );
    syncModalOverlayViewportMetrics(modal, viewportWidth, viewportHeight);
    modal.style.setProperty("position", "absolute", "important");
    modal.style.setProperty("inset", "auto", "important");
    modal.style.setProperty(
      "top",
      `${Math.max(host.scrollTop || 0, 0)}px`,
      "important",
    );
    modal.style.setProperty(
      "left",
      `${Math.max(host.scrollLeft || 0, 0)}px`,
      "important",
    );
    modal.style.setProperty("right", "auto", "important");
    modal.style.setProperty("bottom", "auto", "important");
    if (viewportWidth > 0) {
      modal.style.setProperty("width", `${viewportWidth}px`, "important");
    }
    if (viewportHeight > 0) {
      const viewportHeightValue = `${viewportHeight}px`;
      modal.style.setProperty("min-height", viewportHeightValue, "important");
      modal.style.setProperty("height", viewportHeightValue, "important");
      modal.style.setProperty("max-height", viewportHeightValue, "important");
    }
    return host;
  }

  function bindContentScopedModalViewportSync(modal) {
    clearContentScopedModalViewportSync(modal);
    const host = syncContentScopedModalViewport(modal);
    if (!(host instanceof HTMLElement)) {
      return modal;
    }

    let frameHandle = 0;
    const scheduleSync = () => {
      if (frameHandle) {
        return;
      }
      const raf =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16);
      frameHandle = raf(() => {
        frameHandle = 0;
        syncContentScopedModalViewport(modal);
      });
    };

    host.addEventListener("scroll", scheduleSync, {
      passive: true,
    });
    window.addEventListener("resize", scheduleSync);
    window.visualViewport?.addEventListener?.("resize", scheduleSync);

    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync();
      });
      resizeObserver.observe(host);
    }

    modal.__controlerContentViewportCleanup = () => {
      host.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.visualViewport?.removeEventListener?.("resize", scheduleSync);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (frameHandle) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(frameHandle);
        } else {
          window.clearTimeout(frameHandle);
        }
        frameHandle = 0;
      }
    };
    return modal;
  }

  function closeModal(modal) {
    if (!modal) {
      scheduleModalHistorySync();
      return;
    }

    let closeProtectionDuration = resolveModalInteractionProtectionDuration(
      modal,
      MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
      "controlerCloseProtectionDurationMs",
    );
    const closeVisualDuration = resolveModalCloseVisualDuration(modal);
    if (modal instanceof HTMLElement) {
      cancelAndroidInteractiveTextFocusWork(modal);
      freezeAndroidModalDismissLayout(modal);
      clearModalEdgeSwipeCleanupTimer(modal);
      const cleanupKeyboardShortcuts =
        modal.__controlerModalKeyboardShortcutsCleanup;
      if (typeof cleanupKeyboardShortcuts === "function") {
        modal.__controlerModalKeyboardShortcutsCleanup = null;
        cleanupKeyboardShortcuts();
      }
      const cleanupManagedFieldReveal = modal.__controlerManagedFieldRevealCleanup;
      if (typeof cleanupManagedFieldReveal === "function") {
        modal.__controlerManagedFieldRevealCleanup = null;
        cleanupManagedFieldReveal({
          preserveLatchedLayout: true,
        });
      }
      resetAndroidModalAutofocusState(modal);
      clearContentScopedModalViewportSync(modal);
      protectModalFromFollowThrough(modal, closeProtectionDuration);
      protectVisibleParentModalsFromFollowThrough(
        modal,
        closeProtectionDuration,
      );
    }

    activateModalInteractionShield(
      resolveModalInteractionShieldDuration(modal, closeProtectionDuration),
    );

    const customCloseHandler = modal.__controlerCloseModal;
    if (typeof customCloseHandler === "function") {
      customCloseHandler();
      scheduleAndroidModalDismissFreezeRelease(modal);
      scheduleModalHistorySync();
      return;
    }

    if (modal.dataset?.controlerModalPersistent === "true") {
      hidePersistentModalOverlay(modal, {
        resync: true,
      });
      scheduleAndroidModalDismissFreezeRelease(modal);
      return;
    }

    if (modal.__controlerRemovalQueued === "true") {
      return;
    }

    if (modal instanceof HTMLElement) {
      applyClosingModalPresentation(modal, {
        closeVisualDuration,
      });
    }

    releaseCoveredParentModalInteractions(modal, {
      delayMs: resolveCoveredParentModalReleaseDelay(closeProtectionDuration),
    });

    modal.__controlerRemovalQueued = "true";
    const removeModalElement = () => {
      modal.__controlerRemovalQueued = "false";
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      scheduleModalHistorySync();
      scheduleNativeEdgeBackSwipeExclusionSync(document);
    };
    const schedule =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(() => {
      window.setTimeout(
        removeModalElement,
        modal instanceof HTMLElement
          ? Math.max(closeVisualDuration, MODAL_REMOVAL_DEFERRED_DELAY_MS)
          : MODAL_REMOVAL_DEFERRED_DELAY_MS,
      );
    });
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
    const stopPropagation = (event) => {
      event.stopPropagation();
    };
    ["pointerdown", "pointerup", "click", "touchstart", "touchend"].forEach((eventName) => {
      content.addEventListener(eventName, stopPropagation);
    });
  }

  function isManagedModalFieldRevealRuntime() {
    return !!(
      document.body?.classList.contains("controler-mobile-runtime") ||
      document.body?.classList.contains("controler-android-native")
    );
  }

  function resolveManagedModalFieldRevealBody(modal, target = null) {
    if (!(modal instanceof HTMLElement)) {
      return null;
    }
    const bodyFromTarget =
      target instanceof HTMLElement
        ? target.closest?.(".controler-form-modal-body")
        : null;
    if (bodyFromTarget instanceof HTMLElement && modal.contains(bodyFromTarget)) {
      return bodyFromTarget;
    }
    const modalBody = modal.querySelector(".controler-form-modal-body");
    return modalBody instanceof HTMLElement ? modalBody : null;
  }

  function getManagedModalFieldRevealState(modalBody) {
    if (!(modalBody instanceof HTMLElement)) {
      return null;
    }
    const existingState = modalBody.__controlerManagedFieldRevealState;
    if (existingState && typeof existingState === "object") {
      return existingState;
    }
    const nextState = {
      latchedExtraBottomSpacePx: 0,
      autoRevealLocked: false,
    };
    modalBody.__controlerManagedFieldRevealState = nextState;
    return nextState;
  }

  function clearManagedModalFieldRevealState(modal) {
    const overlay = resolveModalOverlayElement(modal);
    const scope = overlay instanceof HTMLElement ? overlay : modal;
    if (!(scope instanceof HTMLElement)) {
      return false;
    }
    scope.querySelectorAll(".controler-form-modal-body").forEach((modalBody) => {
      if (!(modalBody instanceof HTMLElement)) {
        return;
      }
      modalBody.style.removeProperty(
        "--controler-form-modal-body-extra-bottom-space",
      );
      delete modalBody.__controlerManagedFieldRevealState;
    });
    return true;
  }

  function readManagedModalFieldRevealViewportMetrics() {
    const visualViewport = window.visualViewport;
    const viewportTop = Math.max(0, Number(visualViewport?.offsetTop) || 0);
    const viewportHeight = Math.max(
      0,
      Number(visualViewport?.height) ||
        Number(window.innerHeight) ||
        Number(document.documentElement?.clientHeight) ||
        Number(document.body?.clientHeight) ||
        0,
    );
    return {
      viewportTop,
      viewportBottom: viewportTop + viewportHeight,
    };
  }

  function syncManagedModalFieldRevealSpacing(modal, target = null) {
    const modalBody = resolveManagedModalFieldRevealBody(modal, target);
    if (!(modalBody instanceof HTMLElement)) {
      return 0;
    }
    if (!isManagedModalFieldRevealRuntime()) {
      modalBody.style.removeProperty("--controler-form-modal-body-extra-bottom-space");
      delete modalBody.__controlerManagedFieldRevealState;
      return 0;
    }
    const revealState = getManagedModalFieldRevealState(modalBody);
    const bodyRect = modalBody.getBoundingClientRect();
    const { viewportTop, viewportBottom } =
      readManagedModalFieldRevealViewportMetrics();
    const bodyTop = bodyRect.top + viewportTop;
    const bodyBottom = bodyRect.bottom + viewportTop;
    const hiddenBottomPx = Math.max(0, bodyBottom - viewportBottom);
    const currentExtraBottomSpacePx = Math.max(
      0,
      Math.max(
        parseUiHelperPixelValue(
          modalBody.style.getPropertyValue(
            "--controler-form-modal-body-extra-bottom-space",
          ),
        ),
        Math.round(Number(revealState?.latchedExtraBottomSpacePx) || 0),
      ),
    );
    const nextExtraBottomSpacePx =
      hiddenBottomPx > 0
        ? Math.max(currentExtraBottomSpacePx, Math.round(hiddenBottomPx))
        : currentExtraBottomSpacePx;
    if (nextExtraBottomSpacePx > 0) {
      if (revealState) {
        revealState.latchedExtraBottomSpacePx = nextExtraBottomSpacePx;
      }
      modalBody.style.setProperty(
        "--controler-form-modal-body-extra-bottom-space",
        `${Math.round(nextExtraBottomSpacePx)}px`,
      );
      return nextExtraBottomSpacePx;
    }
    modalBody.style.removeProperty("--controler-form-modal-body-extra-bottom-space");
    if (revealState) {
      revealState.latchedExtraBottomSpacePx = 0;
      revealState.autoRevealLocked = false;
    }
    return 0;
  }

  function scheduleManagedModalFieldReveal(modal, target, options = {}) {
    if (
      !(modal instanceof HTMLElement) ||
      !(target instanceof HTMLElement) ||
      !isManagedModalFieldRevealRuntime()
    ) {
      return false;
    }
    const modalBody = resolveManagedModalFieldRevealBody(modal, target);
    const field =
      target.closest(".controler-form-modal-body > *") ||
      target.closest(".form-group") ||
      target;
    if (
      !(modalBody instanceof HTMLElement) ||
      !(field instanceof HTMLElement)
    ) {
      return false;
    }

    const delayMs = Math.max(
      0,
      Number.isFinite(options.delayMs) ? Number(options.delayMs) : 0,
    );
    const reveal = () => {
      if (
        !modal.isConnected ||
        !modalBody.isConnected ||
        !field.isConnected ||
        modalBody.clientHeight <= 0
      ) {
        return;
      }

      syncManagedModalFieldRevealSpacing(modal, modalBody);
      const revealState = getManagedModalFieldRevealState(modalBody);
      const isRevealLocked =
        Math.max(
          0,
          Math.round(Number(revealState?.latchedExtraBottomSpacePx) || 0),
        ) > 0 || revealState?.autoRevealLocked === true;
      const bodyRect = modalBody.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const { viewportTop, viewportBottom } =
        readManagedModalFieldRevealViewportMetrics();
      const bodyTop = bodyRect.top + viewportTop;
      const bodyBottom = bodyRect.bottom + viewportTop;
      const visibleTopOffset = Math.max(0, viewportTop - bodyTop);
      const visibleBottomOffset = Math.max(
        visibleTopOffset + 72,
        Math.min(
          modalBody.clientHeight,
          Math.max(0, viewportBottom - bodyTop),
        ),
      );
      const fieldTop =
        modalBody.scrollTop + Math.max(fieldRect.top - bodyRect.top, 0);
      const fieldBottom =
        modalBody.scrollTop + Math.max(fieldRect.bottom - bodyRect.top, 0);
      const topGap = 8;
      const bottomGap = 12;
      let nextScrollTop = modalBody.scrollTop;
      const currentVisibleTop = modalBody.scrollTop + visibleTopOffset;
      const currentVisibleBottom = modalBody.scrollTop + visibleBottomOffset;
      const minVisibleTop = currentVisibleTop + topGap;
      const maxVisibleBottom = currentVisibleBottom - bottomGap;
      const overshootBottom = fieldBottom - maxVisibleBottom;
      const overshootTop = minVisibleTop - fieldTop;
      if (overshootBottom > 0 && overshootTop <= 0) {
        nextScrollTop = Math.max(modalBody.scrollTop + overshootBottom, 0);
      } else if (!isRevealLocked && overshootTop > 0 && overshootBottom <= 0) {
        nextScrollTop = Math.max(modalBody.scrollTop - overshootTop, 0);
      } else if (overshootBottom > 0 && overshootTop > 0) {
        const scrollDownTop = Math.max(modalBody.scrollTop + overshootBottom, 0);
        const scrollUpTop = Math.max(modalBody.scrollTop - overshootTop, 0);
        nextScrollTop =
          isRevealLocked ||
          Math.abs(scrollDownTop - modalBody.scrollTop) <=
            Math.abs(scrollUpTop - modalBody.scrollTop)
            ? scrollDownTop
            : scrollUpTop;
      }
      const maxScrollTop = Math.max(
        modalBody.scrollHeight - modalBody.clientHeight,
        0,
      );
      const clampedScrollTop = Math.min(nextScrollTop, maxScrollTop);
      if (Math.abs(clampedScrollTop - modalBody.scrollTop) > 1) {
        modalBody.scrollTop = clampedScrollTop;
        if (revealState) {
          revealState.autoRevealLocked = true;
        }
      }
    };
    const runReveal = () => {
      window.setTimeout(reveal, delayMs);
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(runReveal);
    } else {
      runReveal();
    }
    return true;
  }

  function bindManagedModalFieldReveal(modal) {
    if (!(modal instanceof HTMLElement)) {
      return () => {};
    }
    const existingCleanup = modal.__controlerManagedFieldRevealCleanup;
    if (typeof existingCleanup === "function") {
      existingCleanup({
        preserveLatchedLayout: true,
      });
    }
    if (
      modal.dataset.controlerManagedFieldReveal === "false" ||
      !isManagedModalFieldRevealRuntime() ||
      !(resolveManagedModalFieldRevealBody(modal) instanceof HTMLElement)
    ) {
      modal.__controlerManagedFieldRevealCleanup = null;
      return () => {};
    }
    const revealTimerIds = new Set();
    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);
    let viewportRevealFrameId = 0;
    const clearPendingRevealTimers = () => {
      revealTimerIds.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      revealTimerIds.clear();
    };
    const scheduleActiveReveal = () => {
      if (viewportRevealFrameId) {
        return;
      }
      viewportRevealFrameId = scheduleFrame(() => {
        viewportRevealFrameId = 0;
        if (!modal.isConnected) {
          cleanup();
          return;
        }
        syncManagedModalFieldRevealSpacing(modal);
        const activeElement = document.activeElement;
        if (
          !(activeElement instanceof HTMLElement) ||
          !modal.contains(activeElement) ||
          !activeElement.matches?.("input, textarea, select")
        ) {
          return;
        }
        scheduleManagedModalFieldReveal(modal, activeElement, {
          delayMs: 0,
        });
      });
    };
    const queueReveal = (target, delays = []) => {
      if (!(target instanceof HTMLElement)) {
        return;
      }
      clearPendingRevealTimers();
      const normalizedDelays = Array.from(
        new Set(
          (Array.isArray(delays) ? delays : [delays])
            .map((delayMs) => Math.max(0, Number(delayMs) || 0))
            .filter((delayMs) => Number.isFinite(delayMs)),
        ),
      );
      normalizedDelays.forEach((delayMs) => {
        const timerId = window.setTimeout(() => {
          revealTimerIds.delete(timerId);
          scheduleManagedModalFieldReveal(modal, target, {
            delayMs: 0,
          });
        }, delayMs);
        revealTimerIds.add(timerId);
      });
    };
    const handleFocusIn = (event) => {
      const target = event?.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.matches?.("input, textarea, select")
      ) {
        return;
      }
      queueReveal(target, [0, 72]);
    };
    const handleViewportChange = () => {
      if (!modal.isConnected) {
        cleanup();
        return;
      }
      scheduleActiveReveal();
    };
    const cleanup = (options = {}) => {
      if (viewportRevealFrameId) {
        cancelFrame(viewportRevealFrameId);
        viewportRevealFrameId = 0;
      }
      clearPendingRevealTimers();
      modal.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      if (options?.preserveLatchedLayout !== true) {
        clearManagedModalFieldRevealState(modal);
      }
      if (modal.__controlerManagedFieldRevealCleanup === cleanup) {
        modal.__controlerManagedFieldRevealCleanup = null;
      }
    };

    modal.__controlerManagedFieldRevealCleanup = cleanup;
    modal.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    scheduleActiveReveal();
    return cleanup;
  }

  function bindModalBackdropDismiss(modal, handler) {
    if (!(modal instanceof HTMLElement) || typeof handler !== "function") {
      return modal;
    }
    modal.__controlerBackdropDismissHandler = handler;
    if (modal.dataset.controlerBackdropDismissBound === "true") {
      return modal;
    }
    modal.dataset.controlerBackdropDismissBound = "true";
    const recordBackdropIntent = (event) => {
      if (event.target !== modal || getTopVisibleModal() !== modal) {
        return;
      }
      recordModalInteractionIntent(modal);
    };
    ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
      modal.addEventListener(eventName, recordBackdropIntent, true);
    });
    modal.addEventListener("click", (event) => {
      if (event.target !== modal || getTopVisibleModal() !== modal) {
        return;
      }
      if (shouldSuppressModalFollowThrough(modal, event)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      const actionProtectionDuration = resolveModalInteractionProtectionDuration(
        modal,
        MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
      );
      protectVisibleParentModalsFromFollowThrough(
        modal,
        actionProtectionDuration,
      );
      activateModalInteractionShield(
        resolveModalInteractionShieldDuration(
          modal,
          Math.max(actionProtectionDuration, 180),
        ),
      );
      Promise.resolve()
        .then(() => handler(event, modal))
        .catch((error) => {
          console.error("执行模态框遮罩关闭失败:", error);
          return false;
        })
        .finally(() => {
          if (
            modal.isConnected &&
            modal.__controlerRemovalQueued !== "true" &&
            isVisibleModalOverlay(modal) &&
            getAndroidModalDismissPendingUntil(modal) > 0
          ) {
            clearAndroidModalDismissPending(modal);
          }
        });
    });
    return modal;
  }

  function shouldEnableDesktopModalKeyboardShortcuts() {
    if (getNativeHostPlatform()) {
      return false;
    }
    const root = document.documentElement;
    const body = document.body;
    return !(
      root?.classList.contains("controler-mobile-runtime") ||
      root?.classList.contains("controler-android-native") ||
      root?.classList.contains("controler-ios-native") ||
      body?.classList.contains("controler-mobile-runtime") ||
      body?.classList.contains("controler-android-native") ||
      body?.classList.contains("controler-ios-native")
    );
  }

  function normalizeModalKeyboardShortcutToken(value) {
    return String(value ?? "").replace(/\s+/g, "").trim().toLowerCase();
  }

  function isVisibleModalActionButton(button) {
    if (!(button instanceof HTMLElement) || !button.isConnected) {
      return false;
    }
    if (
      button.hasAttribute("hidden") ||
      button.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    const computed = window.getComputedStyle(button);
    return (
      computed.display !== "none" &&
      computed.visibility !== "hidden" &&
      button.getClientRects().length > 0
    );
  }

  function getModalActionButtons(modal) {
    if (!(modal instanceof HTMLElement)) {
      return [];
    }
    return Array.from(
      modal.querySelectorAll(
        [
          "button",
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
          '[role="button"]',
        ].join(", "),
      ),
    ).filter((button) => {
      if (!(button instanceof HTMLElement) || !isVisibleModalActionButton(button)) {
        return false;
      }
      if (
        button.matches?.(":disabled") ||
        button.getAttribute("aria-disabled") === "true"
      ) {
        return false;
      }
      return true;
    });
  }

  const MODAL_ACTION_AREA_SELECTOR = [
    ".controler-form-modal-footer",
    ".controler-form-modal-footer-actions",
    ".themed-dialog-actions",
    ".controler-themed-picker-actions",
    ".plan-detail-modal-actions",
    ".settings-theme-editor-modal-footer",
    ".modal-buttons",
  ].join(", ");

  function isModalActionAreaTarget(button, modal = null) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }
    const actionArea = button.closest?.(MODAL_ACTION_AREA_SELECTOR);
    if (!(actionArea instanceof HTMLElement)) {
      return false;
    }
    return !(modal instanceof HTMLElement) || modal.contains(actionArea);
  }

  function resolveModalShortcutButtonBySelector(modal, selector) {
    const normalizedSelector = String(selector || "").trim();
    if (!normalizedSelector || !(modal instanceof HTMLElement)) {
      return null;
    }
    try {
      const matchedButton = modal.querySelector(normalizedSelector);
      return isVisibleModalActionButton(matchedButton) ? matchedButton : null;
    } catch (_error) {
      return null;
    }
  }

  function buttonMatchesShortcutTokens(button, tokens = []) {
    if (!(button instanceof HTMLElement) || !tokens.length) {
      return false;
    }
    const sources = [
      button.id,
      button.getAttribute("name"),
      button.getAttribute("class"),
      button.getAttribute("data-controler-modal-action-role"),
      button.getAttribute("data-controler-modal-action"),
      button.getAttribute("data-todo-fallback-dialog-action"),
      button.getAttribute("data-todo-choice-dialog-action"),
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent,
      "value" in button ? button.value : "",
    ]
      .map((value) => normalizeModalKeyboardShortcutToken(value))
      .filter(Boolean);
    return tokens.some((token) =>
      sources.some((source) => source.includes(token)),
    );
  }

  function scoreModalActionButton(button, role) {
    if (!(button instanceof HTMLElement)) {
      return Number.NEGATIVE_INFINITY;
    }
    let score = 0;
    if (isModalActionAreaTarget(button)) {
      score += 24;
    }
    if (role === "confirm") {
      if (
        button.matches?.(
          [
            ".themed-dialog-confirm-btn",
            '[data-controler-modal-action-role="confirm"]',
            '[data-todo-fallback-dialog-action="confirm"]',
          ].join(", "),
        )
      ) {
        score += 120;
      }
      if (
        buttonMatchesShortcutTokens(button, [
          "save",
          "confirm",
          "submit",
          "create",
          "apply",
          "done",
          "ok",
          "commit",
        ])
      ) {
        score += 70;
      }
      if (
        buttonMatchesShortcutTokens(button, [
          "保存",
          "确定",
          "确认",
          "创建",
          "添加",
          "提交",
          "应用",
          "完成",
          "知道了",
        ])
      ) {
        score += 55;
      }
      if (
        button instanceof HTMLInputElement &&
        String(button.type || "").toLowerCase() === "submit"
      ) {
        score += 60;
      }
      if (
        buttonMatchesShortcutTokens(button, [
          "cancel",
          "close",
          "dismiss",
          "delete",
          "remove",
          "danger",
          "取消",
          "关闭",
          "删除",
        ])
      ) {
        score -= 45;
      }
      return score;
    }

    if (
      button.matches?.(
        [
          ".themed-dialog-cancel-btn",
          '[data-controler-modal-action-role="cancel"]',
          '[data-todo-fallback-dialog-action="cancel"]',
          '[data-todo-choice-dialog-action="cancel"]',
        ].join(", "),
      )
    ) {
      score += 120;
    }
    if (
      buttonMatchesShortcutTokens(button, [
        "cancel",
        "close",
        "dismiss",
        "back",
        "abort",
      ])
    ) {
      score += 70;
    }
    if (
      buttonMatchesShortcutTokens(button, ["取消", "关闭", "返回", "放弃"])
    ) {
      score += 55;
    }
    if (
      buttonMatchesShortcutTokens(button, [
        "save",
        "confirm",
        "submit",
        "create",
        "delete",
        "保存",
        "确定",
        "确认",
        "创建",
        "删除",
      ])
    ) {
      score -= 30;
    }
    return score;
  }

  function findModalActionButton(modal, role, options = {}) {
    if (!(modal instanceof HTMLElement)) {
      return null;
    }
    const explicitSelector =
      role === "confirm"
        ? options.confirmSelector
        : options.cancelSelector;
    const explicitButton = resolveModalShortcutButtonBySelector(
      modal,
      explicitSelector,
    );
    if (explicitButton) {
      return explicitButton;
    }

    const candidates = getModalActionButtons(modal);
    let bestMatch = null;
    candidates.forEach((button, index) => {
      const score = scoreModalActionButton(button, role);
      if (score <= 0) {
        return;
      }
      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && index > bestMatch.index)
      ) {
        bestMatch = {
          button,
          score,
          index,
        };
      }
    });
    return bestMatch?.button || null;
  }

  function isAndroidModalDismissActionTarget(button, target) {
    return (
      button instanceof HTMLElement &&
      target instanceof HTMLElement &&
      (button === target || button.contains(target) || target.contains(button))
    );
  }

  function resolveAndroidModalDismissIntent(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const topModal = getTopVisibleModal();
    if (!(topModal instanceof HTMLElement)) {
      return null;
    }
    if (
      target === topModal &&
      typeof topModal.__controlerBackdropDismissHandler === "function"
    ) {
      return {
        kind: "backdrop",
        modal: topModal,
        target: topModal,
      };
    }
    if (!topModal.contains(target)) {
      return null;
    }
    const actionTarget = resolveAndroidInteractiveActionTarget(target);
    if (!(actionTarget instanceof HTMLElement)) {
      return null;
    }
    const shortcutOptions = topModal.__controlerModalKeyboardShortcutOptions || {};
    const confirmButton = findModalActionButton(
      topModal,
      "confirm",
      shortcutOptions,
    );
    if (isAndroidModalDismissActionTarget(confirmButton, actionTarget)) {
      return {
        kind: "confirm",
        modal: topModal,
        target: actionTarget,
      };
    }
    const cancelButton = findModalActionButton(
      topModal,
      "cancel",
      shortcutOptions,
    );
    if (isAndroidModalDismissActionTarget(cancelButton, actionTarget)) {
      return {
        kind: "cancel",
        modal: topModal,
        target: actionTarget,
      };
    }
    if (isModalActionAreaTarget(actionTarget, topModal)) {
      return {
        kind: "action",
        modal: topModal,
        target: actionTarget,
      };
    }
    return null;
  }

  function dispatchAndroidModalDismissIntent(intent, options = {}) {
    const overlay = resolveModalOverlayElement(intent?.modal);
    if (!(overlay instanceof HTMLElement) || !isAndroidNativeRuntime()) {
      return false;
    }
    clearPendingAndroidInteractiveActionReplay();
    markAndroidModalDismissPending(overlay);
    const guardX = Number(options.x);
    const guardY = Number(options.y);
    window.setTimeout(() => {
      if (
        !overlay.isConnected ||
        !isAndroidModalDismissFreezeActive(overlay) ||
        !isVisibleModalOverlay(overlay)
      ) {
        return;
      }
      if (intent?.kind === "backdrop") {
        armAndroidInteractiveActionReplayGuard(overlay, {
          x: guardX,
          y: guardY,
          remainingClicks: 2,
        });
        overlay.click?.();
        scheduleAndroidModalDismissFreezeRelease(overlay);
        return;
      }
      const target = intent?.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.isConnected ||
        isDisabledAndroidInteractiveActionTarget(target)
      ) {
        scheduleAndroidModalDismissFreezeRelease(overlay);
        return;
      }
      clearAndroidNavButtonFocus(target, true);
      armAndroidInteractiveActionReplayGuard(target, {
        x: guardX,
        y: guardY,
        remainingClicks: 2,
      });
      target.click?.();
      scheduleAndroidModalDismissFreezeRelease(overlay);
    }, 0);
    return true;
  }

  function resolveModalShortcutInteractiveTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest(
      [
        "button",
        "[role='button']",
        "a[href]",
        "select",
        "summary",
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="reset"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'input[type="color"]',
        'input[type="file"]',
        'input[type="range"]',
      ].join(", "),
    );
  }

  function bindDesktopModalKeyboardShortcuts(modal, options = {}) {
    if (!(modal instanceof HTMLElement)) {
      return modal;
    }

    const shortcutOptions = {
      confirmSelector:
        typeof options.keyboardConfirmSelector === "string"
          ? options.keyboardConfirmSelector.trim()
          : "",
      cancelSelector:
        typeof options.keyboardCancelSelector === "string"
          ? options.keyboardCancelSelector.trim()
          : "",
    };
    modal.__controlerModalKeyboardShortcutOptions = shortcutOptions;

    if (modal.__controlerModalKeyboardShortcutsBound === "true") {
      return modal;
    }

    const handleKeydown = (event) => {
      if (
        !shouldEnableDesktopModalKeyboardShortcuts() ||
        !isVisibleModalOverlay(modal) ||
        getTopVisibleModal() !== modal ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (event.key === "Enter") {
        if (event.shiftKey) {
          return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (
          target?.closest?.(
            [
              "textarea",
              "select",
              "[contenteditable='true']",
              "[contenteditable]:not([contenteditable='false'])",
            ].join(", "),
          )
        ) {
          return;
        }
        const confirmButton = findModalActionButton(
          modal,
          "confirm",
          modal.__controlerModalKeyboardShortcutOptions || {},
        );
        if (!(confirmButton instanceof HTMLElement)) {
          return;
        }
        const interactiveTarget = resolveModalShortcutInteractiveTarget(target);
        if (
          interactiveTarget instanceof Element &&
          interactiveTarget !== confirmButton &&
          !confirmButton.contains(interactiveTarget)
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        confirmButton.click?.();
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      const cancelButton = findModalActionButton(
        modal,
        "cancel",
        modal.__controlerModalKeyboardShortcutOptions || {},
      );
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      if (cancelButton instanceof HTMLElement) {
        cancelButton.click?.();
        return;
      }
      closeModal(modal);
    };

    document.addEventListener("keydown", handleKeydown, true);
    modal.__controlerModalKeyboardShortcutsBound = "true";
    modal.__controlerModalKeyboardShortcutsCleanup = () => {
      document.removeEventListener("keydown", handleKeydown, true);
      modal.__controlerModalKeyboardShortcutsBound = "false";
    };
    return modal;
  }

  function prepareModalOverlay(modal, options = {}) {
    if (!(modal instanceof HTMLElement)) return null;

    resetModalOverlayPresentationState(modal, {
      resync: false,
    });
    syncKeyboardAwareModalOverlay(modal);

    const persistent =
      options.persistent === true ||
      modal.dataset?.controlerModalPersistent === "true";
    const textAutofocusOptions =
      options.textAutofocus && typeof options.textAutofocus === "object"
        ? { ...options.textAutofocus }
        : options.textAutofocus === true
          ? {}
          : null;
    const zIndex =
      Number.isFinite(options.zIndex) && Number(options.zIndex) > 0
        ? String(Math.round(Number(options.zIndex)))
        : "";
    const closeHandler =
      typeof options.close === "function" ? options.close : null;
    const hasActiveSiblingModal = Array.from(
      document.querySelectorAll(".modal-overlay"),
    ).some((existingModal) => {
      if (!(existingModal instanceof HTMLElement) || existingModal === modal) {
        return false;
      }
      return !existingModal.hidden && existingModal.style.display !== "none";
    });
    const forceViewportScope =
      isDesktopContentOverlayRuntime() ||
      options.scope === "viewport" ||
      modal.classList.contains("controler-form-modal-overlay") ||
      hasActiveSiblingModal;
    const scopedHost = forceViewportScope
      ? null
      : ensureDesktopContentOverlayHost(modal);
    const scopeToContent = !forceViewportScope && scopedHost instanceof HTMLElement;
    const viewportOverlayWidthValue =
      "var(--controler-modal-overlay-width, 100vw)";
    const viewportOverlayHeightValue =
      "var(--controler-modal-overlay-height, var(--controler-stable-visual-viewport-height, 100dvh))";
    if (textAutofocusOptions && isAndroidNativeRuntime()) {
      modal.dataset.controlerAutofocusRequestedAt = String(Date.now());
    }
    if (scopeToContent) {
      syncModalOverlayViewportMetrics(
        modal,
        scopedHost.clientWidth || scopedHost.offsetWidth || 0,
        scopedHost.clientHeight || scopedHost.offsetHeight || 0,
      );
    } else {
      modal.style.removeProperty("--controler-modal-overlay-width");
      modal.style.removeProperty("--controler-modal-overlay-height");
    }

    modal.classList.add("modal-overlay");
    modal.dataset.controlerOverlayScope = scopeToContent ? "content" : "viewport";
    modal.style.position = scopeToContent ? "absolute" : "fixed";
    modal.style.inset = "0";
    modal.style.width = scopeToContent ? "auto" : viewportOverlayWidthValue;
    modal.style.minHeight = scopeToContent
      ? "100%"
      : viewportOverlayHeightValue;
    modal.style.height = scopeToContent
      ? "100%"
      : viewportOverlayHeightValue;
    modal.style.maxHeight = scopeToContent
      ? "none"
      : viewportOverlayHeightValue;
    modal.style.margin = "0";
    modal.style.transform = "none";
    modal.style.borderRadius =
      scopeToContent && scopedHost instanceof HTMLElement
        ? window.getComputedStyle(scopedHost).borderRadius || ""
        : "";
    modal.style.backgroundColor =
      "var(--controler-modal-backdrop-color, var(--overlay-bg))";
    modal.style.setProperty(
      "--controler-modal-dismiss-cover-bg",
      modal.dataset.controlerBackdropVisible === "false"
        ? "transparent"
        : "var(--controler-modal-backdrop-paint)",
    );
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

    const mountHost = scopeToContent ? scopedHost : document.body;
    if (
      mountHost instanceof HTMLElement &&
      options.append !== false &&
      modal.parentElement !== mountHost
    ) {
      mountHost.appendChild(modal);
    } else if (!modal.isConnected && document.body) {
      document.body.appendChild(modal);
    }
    if (options.visible !== false) {
      protectOpeningModalFromFollowThrough(modal);
    }
    freezeCoveredParentModalInteractions(modal);
    bindContentScopedModalViewportSync(modal);
    stopModalContentPropagation(modal);
    bindDesktopModalKeyboardShortcuts(modal, options);
    bindManagedModalFieldReveal(modal);
    scheduleNativeEdgeBackSwipeExclusionSync(document);
    if (textAutofocusOptions) {
      autofocusInteractiveTextControl(modal, textAutofocusOptions);
    }
    enhanceThemedNativePickerInputs(modal);
    enhanceControlerTimeTextInputs(modal);
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

    const recordButtonIntent = () => {
      if (button instanceof HTMLElement) {
        recordModalInteractionIntent(button);
      }
    };
    ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
      button.addEventListener(eventName, recordButtonIntent, {
        capture: true,
        passive: eventName === "touchstart",
      });
    });

    button.addEventListener("click", (event) => {
      if (
        button instanceof HTMLElement &&
        shouldSuppressModalFollowThrough(button, event)
      ) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        if (stopImmediate && typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return;
      }
      const lastTriggeredAt = Number(button.dataset.controlerModalActionAt || 0);
      if (Date.now() - lastTriggeredAt < MODAL_ACTION_DEDUP_WINDOW_MS) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        if (stopImmediate && typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return;
      }
      button.dataset.controlerModalActionAt = String(Date.now());
      if (preventDefault) event.preventDefault();
      if (stopPropagation) event.stopPropagation();
      if (stopImmediate && typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      const owningModal =
        button instanceof HTMLElement ? resolveOwningModalOverlay(button) : null;
      if (owningModal instanceof HTMLElement) {
        const actionProtectionDuration = resolveModalInteractionProtectionDuration(
          owningModal,
          MODAL_CLOSE_FOLLOW_THROUGH_PROTECTION_DURATION_MS,
        );
        protectVisibleParentModalsFromFollowThrough(
          owningModal,
          actionProtectionDuration,
        );
        activateModalInteractionShield(
          resolveModalInteractionShieldDuration(
            owningModal,
            Math.max(actionProtectionDuration, 180),
          ),
        );
      }
      Promise.resolve()
        .then(() => handler(event, button))
        .catch((error) => {
          console.error("执行模态框按钮操作失败:", error);
          return false;
        })
        .finally(() => {
          if (
            owningModal instanceof HTMLElement &&
            owningModal.isConnected &&
            owningModal.__controlerRemovalQueued !== "true" &&
            isVisibleModalOverlay(owningModal) &&
            getAndroidModalDismissPendingUntil(owningModal) > 0
          ) {
            clearAndroidModalDismissPending(owningModal);
          }
        });
    });

    return button;
  }

  function isAndroidManagedColorPickerRuntime() {
    const nativeHostPlatform =
      typeof getNativeHostPlatform === "function" ? getNativeHostPlatform() : "";
    if (nativeHostPlatform === "android") {
      return true;
    }
    return !!(
      document.documentElement?.classList.contains("controler-android-native") ||
      document.body?.classList.contains("controler-android-native") ||
      document.documentElement?.classList.contains("controler-mobile-runtime") ||
      document.body?.classList.contains("controler-mobile-runtime")
    );
  }

  function clampManagedColorPickerNumber(value, min, max, fallback = min) {
    const numericValue = Number(value);
    const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : min;
    if (!Number.isFinite(numericValue)) {
      return Math.min(max, Math.max(min, safeFallback));
    }
    return Math.min(max, Math.max(min, numericValue));
  }

  function parseManagedColorPickerHex(color, fallback = "#79AF85") {
    const normalizedColor = String(color || "").trim();
    const hexMatch = normalizedColor.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
      return `#${hexMatch[1].toUpperCase()}`;
    }
    const rgbMatch = normalizedColor.match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i,
    );
    if (rgbMatch) {
      return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map((channel) =>
          clampManagedColorPickerNumber(channel, 0, 255, 0)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase(),
        )
        .join("")}`;
    }
    const normalizedFallback = String(fallback || "").trim();
    return /^#([0-9a-f]{6})$/i.test(normalizedFallback)
      ? normalizedFallback.toUpperCase()
      : "#79AF85";
  }

  function hexToManagedColorPickerRgb(color) {
    const normalized = parseManagedColorPickerHex(color);
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  function rgbToManagedColorPickerHex(red, green, blue) {
    return `#${[
      clampManagedColorPickerNumber(red, 0, 255, 0),
      clampManagedColorPickerNumber(green, 0, 255, 0),
      clampManagedColorPickerNumber(blue, 0, 255, 0),
    ]
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0").toUpperCase())
      .join("")}`;
  }

  function rgbToManagedColorPickerHsv(red, green, blue) {
    const r = clampManagedColorPickerNumber(red, 0, 255, 0) / 255;
    const g = clampManagedColorPickerNumber(green, 0, 255, 0) / 255;
    const b = clampManagedColorPickerNumber(blue, 0, 255, 0) / 255;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const delta = maxChannel - minChannel;
    let hue = 0;

    if (delta > 0) {
      if (maxChannel === r) {
        hue = ((g - b) / delta) % 6;
      } else if (maxChannel === g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }
      hue *= 60;
      if (hue < 0) {
        hue += 360;
      }
    }

    const saturation = maxChannel === 0 ? 0 : (delta / maxChannel) * 100;
    const value = maxChannel * 100;
    return {
      hue: Math.round(clampManagedColorPickerNumber(hue, 0, 360, 0)),
      saturation: Math.round(clampManagedColorPickerNumber(saturation, 0, 100, 0)),
      value: Math.round(clampManagedColorPickerNumber(value, 0, 100, 0)),
    };
  }

  function hsvToManagedColorPickerRgb(hue, saturation, value) {
    const safeHue = clampManagedColorPickerNumber(hue, 0, 360, 0) % 360;
    const safeSaturation =
      clampManagedColorPickerNumber(saturation, 0, 100, 0) / 100;
    const safeValue = clampManagedColorPickerNumber(value, 0, 100, 0) / 100;
    const chroma = safeValue * safeSaturation;
    const huePrime = safeHue / 60;
    const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
    let red = 0;
    let green = 0;
    let blue = 0;

    if (huePrime >= 0 && huePrime < 1) {
      red = chroma;
      green = secondary;
    } else if (huePrime < 2) {
      red = secondary;
      green = chroma;
    } else if (huePrime < 3) {
      green = chroma;
      blue = secondary;
    } else if (huePrime < 4) {
      green = secondary;
      blue = chroma;
    } else if (huePrime < 5) {
      red = secondary;
      blue = chroma;
    } else {
      red = chroma;
      blue = secondary;
    }

    const match = safeValue - chroma;
    return {
      r: Math.round((red + match) * 255),
      g: Math.round((green + match) * 255),
      b: Math.round((blue + match) * 255),
    };
  }

  function showManagedColorPickerDialog(options = {}) {
    const initialHex = parseManagedColorPickerHex(options.initialColor, "#79AF85");
    const initialRgb = hexToManagedColorPickerRgb(initialHex);
    const initialHsv = rgbToManagedColorPickerHsv(
      initialRgb.r,
      initialRgb.g,
      initialRgb.b,
    );

    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.style.display = "flex";
      modal.style.zIndex = String(options.zIndex || 4600);

      modal.innerHTML = `
        <div class="modal-content themed-dialog-card ms" style="width:min(440px, calc(100vw - 32px)); max-width:min(440px, calc(100vw - 32px)); padding:20px; display:flex; flex-direction:column; gap:18px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div class="themed-dialog-title">${String(options.title || "选择颜色")}</div>
            <div style="font-size:13px; color:var(--text-secondary, var(--text-color)); opacity:0.78;">打开时会使用当前颜色位置，确认后会直接写回当前设置值。</div>
          </div>
          <div style="display:grid; gap:14px; grid-template-columns:minmax(0, 1fr) 92px; align-items:start;">
            <div style="display:flex; flex-direction:column; gap:10px;">
              <div data-managed-color-surface style="position:relative; min-height:220px; border-radius:18px; border:1px solid var(--panel-border-color); overflow:hidden; touch-action:none; background:${initialHex}; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);">
                <div aria-hidden="true" style="position:absolute; inset:0; background:linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0) 100%);"></div>
                <div aria-hidden="true" style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 0%, #000000 100%);"></div>
                <div data-managed-color-surface-handle style="position:absolute; width:18px; height:18px; border-radius:999px; border:2px solid rgba(255,255,255,0.96); box-shadow:0 0 0 1px rgba(0,0,0,0.28), 0 6px 16px rgba(0,0,0,0.22); transform:translate(-50%, -50%); left:50%; top:50%; pointer-events:none;"></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                  <span style="font-size:13px; font-weight:600; color:var(--text-color);">色调</span>
                  <span data-managed-color-hue-value style="font-size:12px; color:var(--text-secondary, var(--text-color)); opacity:0.8;">0°</span>
                </div>
                <input type="range" min="0" max="360" step="1" data-managed-color-hue />
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div data-managed-color-preview style="width:92px; height:92px; border-radius:20px; border:1px solid var(--panel-border-color); background:${initialHex}; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);"></div>
              <div style="display:flex; flex-direction:column; gap:6px; padding:12px 12px 10px; border-radius:16px; border:1px solid var(--panel-border-color); background:color-mix(in srgb, var(--panel-bg, var(--bg-secondary)) 92%, transparent);">
                <span style="font-size:12px; color:var(--text-secondary, var(--text-color)); opacity:0.76;">当前颜色</span>
                <span data-managed-color-hex style="font-size:13px; font-weight:600; color:var(--text-color);">${initialHex}</span>
                <span data-managed-color-sv-value style="font-size:12px; color:var(--text-secondary, var(--text-color)); opacity:0.82;">S 0% · V 0%</span>
              </div>
            </div>
          </div>
          <label style="display:flex; flex-direction:column; gap:8px;">
            <span style="font-size:12px; color:var(--text-secondary, var(--text-color)); opacity:0.78;">拖动色盘选择饱和度和明度，拖动色调条选择色相。</span>
          </label>
          <div style="display:flex; justify-content:flex-end; gap:12px; flex-wrap:wrap;">
            <button type="button" class="bts" data-managed-color-cancel style="margin:0;">${String(options.cancelText || "取消")}</button>
            <button type="button" class="bts" data-managed-color-confirm style="margin:0;">${String(options.confirmText || "设置")}</button>
          </div>
        </div>
      `;

      let settled = false;
      const settleDialog = (result = null) => {
        if (settled) {
          return;
        }
        settled = true;
        modal.__controlerCloseModal = null;
        closeModal(modal);
        window.setTimeout(() => {
          resolve(result);
        }, MODAL_REMOVAL_DEFERRED_DELAY_MS + 40);
      };
      modal.__controlerCloseModal = () => settleDialog(null);
      prepareModalOverlay(modal, {
        zIndex: Number(options.zIndex || 4600),
        scope: "viewport",
        keyboardConfirmSelector: "[data-managed-color-confirm]",
        keyboardCancelSelector: "[data-managed-color-cancel]",
      });
      activateModalInteractionShield(180);

      const hueInput = modal.querySelector("[data-managed-color-hue]");
      const colorSurface = modal.querySelector("[data-managed-color-surface]");
      const colorSurfaceHandle = modal.querySelector(
        "[data-managed-color-surface-handle]",
      );
      const preview = modal.querySelector("[data-managed-color-preview]");
      const hexLabel = modal.querySelector("[data-managed-color-hex]");
      const hueLabel = modal.querySelector("[data-managed-color-hue-value]");
      const svLabel = modal.querySelector("[data-managed-color-sv-value]");
      let currentHsv = {
        hue: initialHsv.hue,
        saturation: initialHsv.saturation,
        value: initialHsv.value,
      };

      const syncFromSurfacePosition = (clientX, clientY) => {
        if (!(colorSurface instanceof HTMLElement)) {
          return;
        }
        const rect = colorSurface.getBoundingClientRect();
        const x = clampManagedColorPickerNumber(clientX - rect.left, 0, rect.width, 0);
        const y = clampManagedColorPickerNumber(clientY - rect.top, 0, rect.height, 0);
        currentHsv.saturation = Math.round((x / Math.max(rect.width, 1)) * 100);
        currentHsv.value = Math.round(100 - (y / Math.max(rect.height, 1)) * 100);
        syncUi();
      };

      const syncUi = () => {
        const currentRgb = hsvToManagedColorPickerRgb(
          currentHsv.hue,
          currentHsv.saturation,
          currentHsv.value,
        );
        const currentHex = rgbToManagedColorPickerHex(
          currentRgb.r,
          currentRgb.g,
          currentRgb.b,
        );
        const surfaceHueColor = rgbToManagedColorPickerHex(
          ...Object.values(
            hsvToManagedColorPickerRgb(
              currentHsv.hue,
              100,
              100,
            ),
          ),
        );

        if (hueInput instanceof HTMLInputElement) {
          hueInput.value = String(currentHsv.hue);
          hueInput.style.background =
            "linear-gradient(90deg, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)";
        }
        if (colorSurface instanceof HTMLElement) {
          colorSurface.style.background = surfaceHueColor;
        }
        if (colorSurfaceHandle instanceof HTMLElement) {
          colorSurfaceHandle.style.left = `${currentHsv.saturation}%`;
          colorSurfaceHandle.style.top = `${100 - currentHsv.value}%`;
        }
        if (preview instanceof HTMLElement) {
          preview.style.background = currentHex;
        }
        if (hexLabel instanceof HTMLElement) {
          hexLabel.textContent = currentHex;
        }
        if (hueLabel instanceof HTMLElement) {
          hueLabel.textContent = `${Math.round(currentHsv.hue)}°`;
        }
        if (svLabel instanceof HTMLElement) {
          svLabel.textContent = `S ${Math.round(currentHsv.saturation)}% · V ${Math.round(currentHsv.value)}%`;
        }
      };

      const syncFromHueInput = () => {
        currentHsv = {
          hue: clampManagedColorPickerNumber(hueInput?.value, 0, 360, currentHsv.hue),
          saturation: currentHsv.saturation,
          value: currentHsv.value,
        };
        syncUi();
      };

      hueInput?.addEventListener("input", syncFromHueInput);
      colorSurface?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        syncFromSurfacePosition(event.clientX, event.clientY);

        const handlePointerMove = (moveEvent) => {
          syncFromSurfacePosition(moveEvent.clientX, moveEvent.clientY);
        };
        const handlePointerUp = () => {
          window.removeEventListener("pointermove", handlePointerMove, true);
          window.removeEventListener("pointerup", handlePointerUp, true);
          window.removeEventListener("pointercancel", handlePointerUp, true);
        };

        window.addEventListener("pointermove", handlePointerMove, true);
        window.addEventListener("pointerup", handlePointerUp, true);
        window.addEventListener("pointercancel", handlePointerUp, true);
      });

      bindModalAction(modal, "[data-managed-color-cancel]", () => {
        settleDialog(null);
      });
      bindModalAction(modal, "[data-managed-color-confirm]", () => {
        const currentRgb = hsvToManagedColorPickerRgb(
          currentHsv.hue,
          currentHsv.saturation,
          currentHsv.value,
        );
        settleDialog(
          rgbToManagedColorPickerHex(currentRgb.r, currentRgb.g, currentRgb.b),
        );
      });
      bindModalBackdropDismiss(modal, () => {
        settleDialog(null);
      });

      syncUi();
      window.setTimeout(() => {
        (
          modal.querySelector("[data-managed-color-confirm]") ||
          modal.querySelector("[data-managed-color-cancel]")
        )?.focus?.();
      }, 0);
    });
  }

  function bindManagedColorInputProxy(input, options = {}) {
    if (
      !(input instanceof HTMLInputElement) ||
      String(input.type || "").toLowerCase() !== "color" ||
      !isAndroidManagedColorPickerRuntime()
    ) {
      return null;
    }
    if (input.dataset.controlerManagedColorProxyBound === "true") {
      return input.__controlerManagedColorProxyButton || null;
    }

    const computed = window.getComputedStyle(input);
    const shell = document.createElement("span");
    shell.dataset.controlerManagedColorProxyShell = "true";
    shell.style.position = "relative";
    shell.style.display =
      computed.display === "block" ? "block" : "inline-flex";
    shell.style.flex = computed.flex || "0 0 auto";
    shell.style.width =
      computed.width && computed.width !== "auto"
        ? computed.width
        : `${Math.max(24, Math.round(input.getBoundingClientRect().width || input.offsetWidth || 40))}px`;
    shell.style.height =
      computed.height && computed.height !== "auto"
        ? computed.height
        : `${Math.max(24, Math.round(input.getBoundingClientRect().height || input.offsetHeight || 40))}px`;

    const parent = input.parentNode;
    if (parent) {
      parent.insertBefore(shell, input);
      shell.appendChild(input);
    }

    input.style.width = "100%";
    input.style.height = "100%";
    input.style.pointerEvents = "none";
    input.tabIndex = -1;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.controlerManagedColorProxyTrigger = "true";
    trigger.setAttribute("aria-label", String(options.title || "选择颜色"));
    trigger.style.position = "absolute";
    trigger.style.inset = "0";
    trigger.style.border = "none";
    trigger.style.margin = "0";
    trigger.style.padding = "0";
    trigger.style.background = "transparent";
    trigger.style.borderRadius = computed.borderRadius || "10px";
    trigger.style.cursor = "pointer";
    shell.appendChild(trigger);

    trigger.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const resolvedColor =
        typeof options.resolveColor === "function"
          ? options.resolveColor()
          : input.value || "";
      const nextColor = await showManagedColorPickerDialog({
        title: options.title || "选择颜色",
        initialColor: resolvedColor,
        confirmText: options.confirmText || "设置",
        cancelText: options.cancelText || "取消",
        zIndex: options.zIndex || 4600,
      });
      if (
        nextColor &&
        typeof options.onSelect === "function"
      ) {
        options.onSelect(nextColor, input);
      }
    });

    input.dataset.controlerManagedColorProxyBound = "true";
    input.__controlerManagedColorProxyButton = trigger;
    return trigger;
  }

  function setAccentButtonState(button, active = true) {
    if (!button) return;
    if (button instanceof HTMLElement) {
      button.style.backgroundColor = "";
      button.style.color = "";
      button.classList.toggle("controler-accent-active", active);
      if (active) {
        button.dataset.controlerAccentActive = "true";
      } else {
        delete button.dataset.controlerAccentActive;
      }
      return;
    }
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
    beforeConfirmClose = null,
  } = {}) {
    return new Promise((resolve) => {
      let dialogSettled = false;
      let confirmPending = false;
      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.style.display = "flex";
      modal.style.zIndex = "4200";

      modal.innerHTML = `
        <div class="modal-content themed-dialog-card ms" style="width:min(420px, 100%); max-width:min(420px, 100%);">
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
        if (dialogSettled) {
          return;
        }
        dialogSettled = true;
        closeModal(modal);
        window.setTimeout(() => {
          resolve(result);
        }, Math.max(MODAL_ACTION_DEDUP_WINDOW_MS + 40, 180));
      };

      bindModalAction(modal, confirmButton, async () => {
        if (dialogSettled || confirmPending) {
          return;
        }
        confirmPending = true;
        if (confirmButton instanceof HTMLButtonElement) {
          confirmButton.disabled = true;
        }
        try {
          if (typeof beforeConfirmClose === "function") {
            const beforeCloseResult = await beforeConfirmClose();
            if (beforeCloseResult === false) {
              if (confirmButton instanceof HTMLButtonElement) {
                confirmButton.disabled = false;
              }
              confirmPending = false;
              return;
            }
          }
          cleanup(true);
        } catch (error) {
          console.error("执行确认弹窗关闭前逻辑失败:", error);
          if (confirmButton instanceof HTMLButtonElement) {
            confirmButton.disabled = false;
          }
          confirmPending = false;
        }
      });
      bindModalAction(modal, cancelButton, () => {
        cleanup(false);
      });
      bindModalBackdropDismiss(modal, () => {
        cleanup(false);
      });

      prepareModalOverlay(modal, {
        zIndex: 4200,
        scope: "viewport",
        keyboardConfirmSelector: ".themed-dialog-confirm-btn",
        keyboardCancelSelector: ".themed-dialog-cancel-btn",
      });
      activateModalInteractionShield(180);
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
      beforeConfirmClose:
        typeof options.beforeConfirmClose === "function"
          ? options.beforeConfirmClose
          : null,
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

  function emitTreeSelectScrollLog(stage, payload = {}) {
    return;
  }

  function emitUiDebugEvent(name, payload = {}) {
    return;
  }

  function readScrollableElementDebugState(target) {
    if (!(target instanceof HTMLElement)) {
      return {};
    }
    const computedStyle = window.getComputedStyle(target);
    return {
      scrollTop: Math.round(target.scrollTop || 0),
      scrollHeight: Math.round(target.scrollHeight || 0),
      clientHeight: Math.round(target.clientHeight || 0),
      overflowY: computedStyle.overflowY,
      touchAction: computedStyle.touchAction,
    };
  }

  const OPEN_TREE_SELECT_HOST_CLASS = "controler-open-tree-select-host";
  const OPEN_TREE_SELECT_HOST_COUNT_ATTR = "data-controler-open-tree-select-count";

  function updateOpenTreeSelectHosts(target, delta = 0) {
    if (!(target instanceof Element) || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    let current = target.parentElement;
    while (current instanceof Element) {
      const currentCount = Math.max(
        0,
        Number.parseInt(
          current.getAttribute(OPEN_TREE_SELECT_HOST_COUNT_ATTR) || "0",
          10,
        ) || 0,
      );
      const nextCount = Math.max(0, currentCount + delta);

      if (nextCount > 0) {
        current.setAttribute(OPEN_TREE_SELECT_HOST_COUNT_ATTR, String(nextCount));
        current.classList.add(OPEN_TREE_SELECT_HOST_CLASS);
      } else {
        current.removeAttribute(OPEN_TREE_SELECT_HOST_COUNT_ATTR);
        current.classList.remove(OPEN_TREE_SELECT_HOST_CLASS);
      }

      current = current.parentElement;
    }
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
      matchTriggerWidth = false,
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
    wrapper.setAttribute("data-controler-disable-edge-swipe", "true");

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
    menu.setAttribute("data-controler-disable-edge-swipe", "true");
    menu.style.touchAction = "pan-y";
    menu.style.overscrollBehavior = "contain";
    menu.style.webkitOverflowScrolling = "touch";
    const menuGestureGuard = bindScrollableSelectionGestureGuard(menu);

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
    let isMenuOpen = false;

    const syncMenuOpenState = (nextOpen) => {
      const normalizedNextOpen = nextOpen === true;
      if (isMenuOpen === normalizedNextOpen) {
        return;
      }
      isMenuOpen = normalizedNextOpen;
      wrapper.classList.toggle("open", normalizedNextOpen);
      updateOpenTreeSelectHosts(wrapper, normalizedNextOpen ? 1 : -1);
    };

    const closeMenu = () => {
      syncMenuOpenState(false);
      document.removeEventListener("click", handleOutsideClick, true);
      window.removeEventListener("resize", repositionMenu, true);
      window.removeEventListener("scroll", repositionMenu, true);
    };

    const scrollSelectedOptionIntoView = ({
      behavior = "auto",
      center = true,
    } = {}) => {
      const selectedOptionButton = menu.querySelector(".tree-select-option.selected");
      if (!(selectedOptionButton instanceof HTMLElement)) {
        return;
      }
      const targetScrollTop = center
        ? selectedOptionButton.offsetTop -
          Math.max(
            0,
            Math.round((menu.clientHeight - selectedOptionButton.offsetHeight) / 2),
          )
        : selectedOptionButton.offsetTop;
      const maxScrollTop = Math.max(0, menu.scrollHeight - menu.clientHeight);
      const nextScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
      if (typeof menu.scrollTo === "function") {
        menu.scrollTo({
          top: nextScrollTop,
          behavior,
        });
        return;
      }
      menu.scrollTop = nextScrollTop;
    };

    const repositionMenu = () => {
      const contentWidth = updateSelectorWidth();
      if (matchTriggerWidth) {
        positionFloatingMenu(wrapper, menu, {
          minWidth: contentWidth,
          preferredWidth: contentWidth,
          maxWidth: contentWidth,
        });
        return;
      }
      positionFloatingMenu(wrapper, menu, {
        minWidth: Math.max(scaledMinWidth, contentWidth),
        preferredWidth: Math.max(scaledPreferredMenuWidth, contentWidth + 8),
        maxWidth: Math.max(scaledMaxMenuWidth, contentWidth + 12),
      });
    };

    const openMenu = () => {
      if (select.disabled || isMenuOpen) return;
      repositionMenu();
      syncMenuOpenState(true);
      const scheduleSelectedOptionScroll = () => {
        scrollSelectedOptionIntoView({
          behavior: "auto",
          center: true,
        });
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(scheduleSelectedOptionScroll);
        });
      } else {
        window.setTimeout(scheduleSelectedOptionScroll, 16);
      }
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
      if (isMenuOpen) {
        scrollSelectedOptionIntoView({
          behavior: "auto",
          center: true,
        });
      }
    };

    const commitOptionSelection = (optionNode, event = null) => {
      if (!(optionNode instanceof HTMLOptionElement) || optionNode.disabled) {
        return;
      }
      if (menuGestureGuard.shouldSuppressSelection()) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return;
      }
      event?.preventDefault?.();
      event?.stopPropagation?.();
      select.value = optionNode.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncFromSelect();
      closeMenu();
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
      optionButton.style.touchAction = "pan-y";

      const label = document.createElement("span");
      label.className = "tree-select-option-label";
      label.textContent = readSelectText(optionNode, "未命名选项");
      optionButton.appendChild(label);

      if (optionNode.disabled) {
        optionButton.classList.add("is-disabled");
        optionButton.disabled = true;
      } else {
        optionButton.addEventListener("click", (event) => {
          commitOptionSelection(optionNode, event);
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
        closeMenu();
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

  const MANAGED_NATIVE_PICKER_INPUT_SELECTOR = "input.themed-native-picker-input";
  const CONTROLER_TIME_TEXT_INPUT_SELECTOR =
    "input.controler-time-text-input";
  const MANAGED_NATIVE_PICKER_TYPES = new Set([
    "date",
    "time",
    "datetime-local",
  ]);
  const MANAGED_NATIVE_PICKER_WEEKDAY_LABELS = [
    "周一",
    "周二",
    "周三",
    "周四",
    "周五",
    "周六",
    "周日",
  ];
  const MANAGED_NATIVE_PICKER_MONTH_LABELS = Array.from(
    { length: 12 },
    (_, index) => `${index + 1}月`,
  );
  const MANAGED_NATIVE_PICKER_DEFAULT_Z_INDEX = 4600;
  const MANAGED_NATIVE_PICKER_DEFAULT_YEAR_RANGE = Object.freeze({
    min: 1970,
    max: 2100,
  });
  let managedNativePickerObserver = null;
  let managedNativePickerInitBound = false;

  function shouldUseManagedNativePickerRuntime() {
    return typeof document !== "undefined";
  }

  function resolveManagedNativePickerHostModal(input) {
    return input instanceof HTMLElement ? resolveOwningModalOverlay(input) : null;
  }

  function shouldUseManagedNativePickerInlinePanel(
    input,
    normalizedInputType = "",
  ) {
    return (
      normalizedInputType === "time" &&
      resolveManagedNativePickerHostModal(input) instanceof HTMLElement
    );
  }

  function shouldUseManagedNativePickerAnchoredPanel(
    input,
    normalizedInputType = "",
  ) {
    if (shouldUseManagedNativePickerInlinePanel(input, normalizedInputType)) {
      return true;
    }
    return !getNativeHostPlatform();
  }

  function padManagedNativePickerNumber(value) {
    return String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(2, "0");
  }

  function getManagedNativePickerDateOnly(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return null;
    }
    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate(),
    );
  }

  function getManagedNativePickerMonthStart(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return null;
    }
    return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
  }

  function parseManagedNativePickerDateValue(value) {
    const normalizedValue = String(value || "").trim();
    const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const parsedDate = new Date(year, monthIndex, day);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== monthIndex ||
      parsedDate.getDate() !== day
    ) {
      return null;
    }
    return parsedDate;
  }

  function parseManagedNativePickerTimeValue(value) {
    const normalizedValue = String(value || "").trim();
    const match = normalizedValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
      return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return {
      hours,
      minutes,
    };
  }

  function parseManagedNativePickerDateTimeLocalValue(value) {
    const normalizedValue = String(value || "").trim();
    const match = normalizedValue.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
    );
    if (!match) {
      return null;
    }
    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const hours = Number.parseInt(match[4], 10);
    const minutes = Number.parseInt(match[5], 10);
    const parsedDate = new Date(year, monthIndex, day, hours, minutes, 0, 0);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== monthIndex ||
      parsedDate.getDate() !== day ||
      parsedDate.getHours() !== hours ||
      parsedDate.getMinutes() !== minutes
    ) {
      return null;
    }
    return parsedDate;
  }

  function formatManagedNativePickerDateValue(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "";
    }
    return [
      String(dateValue.getFullYear()).padStart(4, "0"),
      padManagedNativePickerNumber(dateValue.getMonth() + 1),
      padManagedNativePickerNumber(dateValue.getDate()),
    ].join("-");
  }

  function formatManagedNativePickerTimeValue(hours, minutes) {
    return `${padManagedNativePickerNumber(hours)}:${padManagedNativePickerNumber(
      minutes,
    )}`;
  }

  function formatManagedNativePickerDateTimeLocalValue(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "";
    }
    return `${formatManagedNativePickerDateValue(dateValue)}T${formatManagedNativePickerTimeValue(
      dateValue.getHours(),
      dateValue.getMinutes(),
    )}`;
  }

  function formatManagedNativePickerDisplayDate(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "未设置";
    }
    const weekdayIndex = (dateValue.getDay() + 6) % 7;
    return `${dateValue.getFullYear()}年${dateValue.getMonth() + 1}月${dateValue.getDate()}日 ${MANAGED_NATIVE_PICKER_WEEKDAY_LABELS[weekdayIndex] || ""}`.trim();
  }

  function formatManagedNativePickerDisplayDateTime(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "未设置";
    }
    return `${formatManagedNativePickerDisplayDate(dateValue)} ${formatManagedNativePickerTimeValue(
      dateValue.getHours(),
      dateValue.getMinutes(),
    )}`;
  }

  function compareManagedNativePickerDateOnly(leftDate, rightDate) {
    const normalizedLeft = getManagedNativePickerDateOnly(leftDate);
    const normalizedRight = getManagedNativePickerDateOnly(rightDate);
    if (!normalizedLeft && !normalizedRight) {
      return 0;
    }
    if (!normalizedLeft) {
      return -1;
    }
    if (!normalizedRight) {
      return 1;
    }
    return normalizedLeft.getTime() - normalizedRight.getTime();
  }

  function areManagedNativePickerDatesEqual(leftDate, rightDate) {
    return compareManagedNativePickerDateOnly(leftDate, rightDate) === 0;
  }

  function areManagedNativePickerMonthsEqual(leftDate, rightDate) {
    return !!(
      leftDate instanceof Date &&
      rightDate instanceof Date &&
      !Number.isNaN(leftDate.getTime()) &&
      !Number.isNaN(rightDate.getTime()) &&
      leftDate.getFullYear() === rightDate.getFullYear() &&
      leftDate.getMonth() === rightDate.getMonth()
    );
  }

  function clampManagedNativePickerDateOnly(dateValue, minDate, maxDate) {
    const normalizedDate = getManagedNativePickerDateOnly(dateValue);
    if (!(normalizedDate instanceof Date)) {
      return null;
    }
    const normalizedMin = getManagedNativePickerDateOnly(minDate);
    const normalizedMax = getManagedNativePickerDateOnly(maxDate);
    if (
      normalizedMin instanceof Date &&
      normalizedDate.getTime() < normalizedMin.getTime()
    ) {
      return new Date(normalizedMin.getTime());
    }
    if (
      normalizedMax instanceof Date &&
      normalizedDate.getTime() > normalizedMax.getTime()
    ) {
      return new Date(normalizedMax.getTime());
    }
    return normalizedDate;
  }

  function clampManagedNativePickerDateTime(dateValue, minDate, maxDate) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return null;
    }
    const normalizedDate = new Date(dateValue.getTime());
    const normalizedMin =
      minDate instanceof Date && !Number.isNaN(minDate.getTime())
        ? minDate.getTime()
        : null;
    const normalizedMax =
      maxDate instanceof Date && !Number.isNaN(maxDate.getTime())
        ? maxDate.getTime()
        : null;
    if (normalizedMin !== null && normalizedDate.getTime() < normalizedMin) {
      return new Date(normalizedMin);
    }
    if (normalizedMax !== null && normalizedDate.getTime() > normalizedMax) {
      return new Date(normalizedMax);
    }
    return normalizedDate;
  }

  function resolveManagedNativePickerLabelText(input) {
    if (!(input instanceof HTMLElement)) {
      return "";
    }

    const extractText = (element) => {
      if (!(element instanceof HTMLElement)) {
        return "";
      }
      const clone = element.cloneNode(true);
      clone
        .querySelectorAll("input, select, textarea, button, .native-select-enhancer")
        .forEach((node) => {
          node.remove();
        });
      return clone.textContent.replace(/\s+/g, " ").trim();
    };

    const explicitLabel =
      String(input.dataset.pickerLabel || input.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
    if (explicitLabel) {
      return explicitLabel;
    }

    if (input.id) {
      const escapedId =
        typeof window.CSS?.escape === "function"
          ? window.CSS.escape(input.id)
          : String(input.id).replace(/["\\]/g, "\\$&");
      const linkedLabel = document.querySelector(`label[for="${escapedId}"]`);
      const linkedLabelText = extractText(linkedLabel);
      if (linkedLabelText) {
        return linkedLabelText;
      }
    }

    const wrappingLabelText = extractText(input.closest("label"));
    if (wrappingLabelText) {
      return wrappingLabelText;
    }

    const fieldContainer = input.closest(".modal-date-field, .stats-date-field");
    if (fieldContainer instanceof HTMLElement) {
      const fieldLabelText = extractText(
        fieldContainer.querySelector("label, span, strong"),
      );
      if (fieldLabelText) {
        return fieldLabelText;
      }
    }

    const previousLabelText = extractText(
      input.previousElementSibling instanceof HTMLElement
        ? input.previousElementSibling
        : null,
    );
    if (previousLabelText) {
      return previousLabelText;
    }

    return "";
  }

  function resolveManagedNativePickerDialogTitle(input, inputType) {
    const explicitTitle = String(input?.dataset?.pickerTitle || "").trim();
    if (explicitTitle) {
      return explicitTitle;
    }
    const labelText = resolveManagedNativePickerLabelText(input);
    if (labelText) {
      return `选择${labelText}`;
    }
    if (inputType === "time") {
      return "选择时间";
    }
    if (inputType === "datetime-local") {
      return "选择日期和时间";
    }
    return "选择日期";
  }

  function resolveManagedNativePickerMinuteStep(input) {
    const rawStep = Number(input?.dataset?.pickerMinuteStep || input?.step || 60);
    if (!Number.isFinite(rawStep) || rawStep <= 0) {
      return 1;
    }
    const computedStep = Math.round(rawStep / 60);
    if (!Number.isFinite(computedStep) || computedStep <= 0) {
      return 1;
    }
    return Math.min(60, Math.max(1, computedStep));
  }

  function resolveManagedNativePickerDefaultDate(minDate, maxDate) {
    const today = getManagedNativePickerDateOnly(new Date());
    return (
      clampManagedNativePickerDateOnly(today, minDate, maxDate) ||
      getManagedNativePickerDateOnly(minDate) ||
      getManagedNativePickerDateOnly(maxDate) ||
      today
    );
  }

  function resolveManagedNativePickerDefaultTime(input, minuteStep = 1) {
    const labelText = resolveManagedNativePickerLabelText(input);
    let defaultMinutes = 9 * 60;
    if (labelText.includes("结束")) {
      defaultMinutes = 10 * 60;
    } else if (!labelText.includes("开始")) {
      const now = new Date();
      defaultMinutes = now.getHours() * 60 + now.getMinutes();
      defaultMinutes = Math.round(defaultMinutes / minuteStep) * minuteStep;
    }
    const normalizedMinutes = Math.max(0, Math.min(23 * 60 + 59, defaultMinutes));
    return {
      hours: Math.floor(normalizedMinutes / 60),
      minutes: normalizedMinutes % 60,
    };
  }

  function buildManagedNativePickerYearValues(selectedDate, minDate, maxDate) {
    const selectedYear =
      selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
        ? selectedDate.getFullYear()
        : new Date().getFullYear();
    const minYear = Math.max(
      MANAGED_NATIVE_PICKER_DEFAULT_YEAR_RANGE.min,
      minDate instanceof Date && !Number.isNaN(minDate.getTime())
        ? minDate.getFullYear()
        : Math.min(selectedYear - 20, new Date().getFullYear() - 12),
    );
    const maxYear = Math.min(
      MANAGED_NATIVE_PICKER_DEFAULT_YEAR_RANGE.max,
      maxDate instanceof Date && !Number.isNaN(maxDate.getTime())
        ? maxDate.getFullYear()
        : Math.max(selectedYear + 20, new Date().getFullYear() + 12),
    );
    const safeMinYear = Math.min(minYear, selectedYear);
    const safeMaxYear = Math.max(maxYear, selectedYear);
    return Array.from(
      { length: safeMaxYear - safeMinYear + 1 },
      (_, index) => safeMinYear + index,
    );
  }

  function isManagedNativePickerMonthAvailable(
    year,
    monthIndex,
    minDate,
    maxDate,
  ) {
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    if (
      minDate instanceof Date &&
      !Number.isNaN(minDate.getTime()) &&
      monthEnd.getTime() < getManagedNativePickerDateOnly(minDate).getTime()
    ) {
      return false;
    }
    if (
      maxDate instanceof Date &&
      !Number.isNaN(maxDate.getTime()) &&
      monthStart.getTime() > getManagedNativePickerDateOnly(maxDate).getTime()
    ) {
      return false;
    }
    return true;
  }

  function getManagedNativePickerTimeBoundsForSelection(
    selectedDate,
    minDateTime,
    maxDateTime,
    minTimeOnly,
    maxTimeOnly,
  ) {
    let minimumMinutes = 0;
    let maximumMinutes = 23 * 60 + 59;

    if (selectedDate instanceof Date) {
      if (
        minDateTime instanceof Date &&
        !Number.isNaN(minDateTime.getTime()) &&
        areManagedNativePickerDatesEqual(selectedDate, minDateTime)
      ) {
        minimumMinutes =
          minDateTime.getHours() * 60 + minDateTime.getMinutes();
      }
      if (
        maxDateTime instanceof Date &&
        !Number.isNaN(maxDateTime.getTime()) &&
        areManagedNativePickerDatesEqual(selectedDate, maxDateTime)
      ) {
        maximumMinutes =
          maxDateTime.getHours() * 60 + maxDateTime.getMinutes();
      }
    } else {
      if (minTimeOnly) {
        minimumMinutes = minTimeOnly.hours * 60 + minTimeOnly.minutes;
      }
      if (maxTimeOnly) {
        maximumMinutes = maxTimeOnly.hours * 60 + maxTimeOnly.minutes;
      }
    }

    if (maximumMinutes < minimumMinutes) {
      maximumMinutes = minimumMinutes;
    }

    return {
      minimumMinutes,
      maximumMinutes,
    };
  }

  function serializeManagedNativePickerTimeBounds(bounds) {
    const minimumMinutes = Number(bounds?.minimumMinutes);
    const maximumMinutes = Number(bounds?.maximumMinutes);
    return `${Number.isFinite(minimumMinutes) ? Math.round(minimumMinutes) : -1}:${Number.isFinite(maximumMinutes) ? Math.round(maximumMinutes) : -1}`;
  }

  function buildManagedNativePickerMinuteValues(minuteStep = 1) {
    const safeMinuteStep = Math.min(60, Math.max(1, minuteStep));
    const values = [];
    for (let minute = 0; minute < 60; minute += safeMinuteStep) {
      values.push(minute);
    }
    if (values[values.length - 1] !== 59 && safeMinuteStep === 1) {
      values.push(59);
    }
    return values;
  }

  function pickManagedNativePickerNearestNumber(values, preferredValue) {
    if (!Array.isArray(values) || !values.length) {
      return null;
    }
    let bestValue = values[0];
    let bestDistance = Math.abs(values[0] - preferredValue);
    values.forEach((value) => {
      const distance = Math.abs(value - preferredValue);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestValue = value;
      }
    });
    return bestValue;
  }

  function applyManagedNativePickerValue(input, nextValue) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const normalizedNextValue = String(nextValue ?? "");
    const hasChanged = input.value !== normalizedNextValue;
    input.value = normalizedNextValue;
    if (!hasChanged) {
      return;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeControlerTimeTextRawValue(value) {
    return String(value ?? "")
      .replace(/[０-９]/g, (character) =>
        String.fromCharCode(character.charCodeAt(0) - 65248),
      )
      .replace(/[：﹕︓]/g, ":")
      .replace(/\s+/g, "");
  }

  function countControlerTimeTextDigits(value, endIndex = value.length) {
    return String(value || "")
      .slice(0, Math.max(0, Number(endIndex) || 0))
      .replace(/\D/g, "").length;
  }

  function resolveControlerTimeTextSelectionOffset(value, digitCount) {
    const safeDigitCount = Math.max(0, Number(digitCount) || 0);
    if (safeDigitCount <= 0) {
      return 0;
    }
    let digitsSeen = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (/\d/.test(value.charAt(index))) {
        digitsSeen += 1;
        if (digitsSeen >= safeDigitCount) {
          return index + 1;
        }
      }
    }
    return value.length;
  }

  function formatControlerTimeTextDraftValue(rawValue) {
    const normalizedRawValue = normalizeControlerTimeTextRawValue(rawValue);
    if (!normalizedRawValue) {
      return "";
    }
    const colonIndex = normalizedRawValue.indexOf(":");
    if (colonIndex >= 0) {
      const hourPart = normalizedRawValue
        .slice(0, colonIndex)
        .replace(/\D/g, "")
        .slice(0, 2);
      const minutePart = normalizedRawValue
        .slice(colonIndex + 1)
        .replace(/\D/g, "")
        .slice(0, 2);
      if (!hourPart && !minutePart) {
        return "";
      }
      return `${hourPart}:${minutePart}`;
    }
    const digits = normalizedRawValue.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      return digits;
    }
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  function formatControlerTimeTextCommittedValue(hourText, minuteText) {
    const normalizedHourText = String(hourText || "").replace(/\D/g, "");
    const normalizedMinuteText = String(minuteText || "").replace(/\D/g, "");
    if (!normalizedHourText || !normalizedMinuteText) {
      return "";
    }
    const hours = Number.parseInt(normalizedHourText, 10);
    const minutes = Number.parseInt(normalizedMinuteText, 10);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return "";
    }
    return `${padManagedNativePickerNumber(hours)}:${padManagedNativePickerNumber(
      minutes,
    )}`;
  }

  function finalizeControlerTimeTextValue(rawValue) {
    const normalizedRawValue = normalizeControlerTimeTextRawValue(rawValue);
    if (!normalizedRawValue) {
      return "";
    }

    const draftValue = formatControlerTimeTextDraftValue(normalizedRawValue);
    const candidateValues = [];
    const draftColonIndex = draftValue.indexOf(":");
    if (draftColonIndex >= 0) {
      const hourPart = draftValue
        .slice(0, draftColonIndex)
        .replace(/\D/g, "")
        .slice(0, 2);
      const minutePart = draftValue
        .slice(draftColonIndex + 1)
        .replace(/\D/g, "")
        .slice(0, 2);
      if (hourPart && minutePart) {
        candidateValues.push(
          formatControlerTimeTextCommittedValue(hourPart, minutePart),
        );
        if (minutePart.length === 1) {
          candidateValues.push(
            formatControlerTimeTextCommittedValue(hourPart, `${minutePart}0`),
          );
        }
        if (hourPart.length === 1) {
          candidateValues.push(
            formatControlerTimeTextCommittedValue(`0${hourPart}`, minutePart),
          );
          if (minutePart.length === 1) {
            candidateValues.push(
              formatControlerTimeTextCommittedValue(
                `0${hourPart}`,
                `${minutePart}0`,
              ),
            );
          }
        }
      } else if (hourPart) {
        candidateValues.push(
          formatControlerTimeTextCommittedValue(hourPart, "00"),
        );
      } else if (minutePart) {
        candidateValues.push(
          formatControlerTimeTextCommittedValue("00", minutePart),
        );
      }
    }

    const digits = normalizedRawValue.replace(/\D/g, "").slice(0, 4);
    if (digits.length === 1) {
      candidateValues.push(
        formatControlerTimeTextCommittedValue(digits, "00"),
      );
    }
    if (digits.length === 2) {
      candidateValues.push(
        formatControlerTimeTextCommittedValue(digits, "00"),
      );
      candidateValues.push(
        formatControlerTimeTextCommittedValue("00", digits),
      );
    }
    if (digits.length === 4) {
      candidateValues.push(
        formatControlerTimeTextCommittedValue(
          digits.slice(0, 2),
          digits.slice(2, 4),
        ),
      );
    }
    if (digits.length === 3) {
      candidateValues.push(
        formatControlerTimeTextCommittedValue(
          digits.slice(0, 2),
          `${digits.slice(2)}0`,
        ),
      );
      candidateValues.push(
        formatControlerTimeTextCommittedValue(
          `0${digits.charAt(0)}`,
          digits.slice(1, 3),
        ),
      );
    }

    const normalizedCandidate = candidateValues.find(
      (candidateValue) => typeof candidateValue === "string" && candidateValue,
    );
    return normalizedCandidate || draftValue;
  }

  function enhanceControlerTimeTextInput(input) {
    if (
      !(input instanceof HTMLInputElement) ||
      input.__controlerTimeTextInputApi ||
      !["text", "search", ""].includes(
        String(input.type || "").trim().toLowerCase(),
      )
    ) {
      return input?.__controlerTimeTextInputApi || null;
    }

    let isComposing = false;
    let commitAfterComposition = false;

    const formatDraftValue = (event = null) => {
      if (isComposing || event?.isComposing) {
        return;
      }
      const rawValue = input.value;
      const selectionStart = input.selectionStart ?? rawValue.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      const startDigitCount = countControlerTimeTextDigits(
        rawValue,
        selectionStart,
      );
      const endDigitCount = countControlerTimeTextDigits(rawValue, selectionEnd);
      const nextValue = formatControlerTimeTextDraftValue(rawValue);
      if (nextValue === rawValue) {
        return;
      }
      input.value = nextValue;
      if (typeof input.setSelectionRange === "function") {
        const nextSelectionStart = resolveControlerTimeTextSelectionOffset(
          nextValue,
          startDigitCount,
        );
        const nextSelectionEnd = resolveControlerTimeTextSelectionOffset(
          nextValue,
          endDigitCount,
        );
        input.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }
    };

    const commitValue = () => {
      if (isComposing) {
        commitAfterComposition = true;
        return;
      }
      const rawValue = input.value;
      const nextValue = finalizeControlerTimeTextValue(rawValue);
      if (nextValue === rawValue) {
        return;
      }
      input.value = nextValue;
    };

    const handleCompositionStart = () => {
      isComposing = true;
    };

    const handleCompositionEnd = () => {
      isComposing = false;
      formatDraftValue();
      if (!commitAfterComposition) {
        return;
      }
      commitAfterComposition = false;
      commitValue();
    };

    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "5");
    input.setAttribute("pattern", "(?:[01]\\d|2[0-3]):[0-5]\\d");
    input.setAttribute(
      "placeholder",
      input.getAttribute("placeholder") || "？？：？？",
    );
    input.autocomplete = "off";
    input.spellcheck = false;
    input.autocapitalize = "off";
    const initialValue = finalizeControlerTimeTextValue(input.value);
    if (initialValue !== input.value) {
      input.value = initialValue;
    }
    input.addEventListener("input", formatDraftValue);
    input.addEventListener("compositionstart", handleCompositionStart);
    input.addEventListener("compositionend", handleCompositionEnd);
    input.addEventListener("change", commitValue, true);
    input.addEventListener("blur", commitValue);

    const api = {
      destroy() {
        input.removeEventListener("input", formatDraftValue);
        input.removeEventListener("compositionstart", handleCompositionStart);
        input.removeEventListener("compositionend", handleCompositionEnd);
        input.removeEventListener("change", commitValue, true);
        input.removeEventListener("blur", commitValue);
        delete input.__controlerTimeTextInputApi;
      },
    };

    input.__controlerTimeTextInputApi = api;
    return api;
  }

  function enhanceControlerTimeTextInputs(root = document) {
    const normalizedRoot =
      root instanceof Document || root instanceof Element ? root : document;
    const inputCandidates = [];
    if (
      normalizedRoot instanceof HTMLInputElement &&
      normalizedRoot.matches(CONTROLER_TIME_TEXT_INPUT_SELECTOR)
    ) {
      inputCandidates.push(normalizedRoot);
    }
    if (typeof normalizedRoot.querySelectorAll === "function") {
      inputCandidates.push(
        ...normalizedRoot.querySelectorAll(CONTROLER_TIME_TEXT_INPUT_SELECTOR),
      );
    }
    return inputCandidates
      .map((inputNode) => enhanceControlerTimeTextInput(inputNode))
      .filter(Boolean);
  }

  function getManagedNativePickerModalZIndex(input) {
    const hostModal =
      input instanceof Element ? input.closest(".modal-overlay") : null;
    const parsedZIndex = Number.parseInt(
      hostModal instanceof HTMLElement
        ? window.getComputedStyle(hostModal).zIndex || hostModal.style.zIndex || ""
        : "",
      10,
    );
    if (Number.isFinite(parsedZIndex) && parsedZIndex > 0) {
      return parsedZIndex + 24;
    }
    return MANAGED_NATIVE_PICKER_DEFAULT_Z_INDEX;
  }

  function resolveManagedNativePickerDialogSizeConfig(
    input,
    normalizedInputType,
    useAnchoredPanel,
    useInlinePanel = false,
  ) {
    const getManagedNativePickerViewportWidth = () => {
      if (typeof window === "undefined") {
        return 0;
      }
      return Math.max(
        Number(window.visualViewport?.width) || 0,
        Number(window.innerWidth) || 0,
        Number(document.documentElement?.clientWidth) || 0,
      );
    };
    const getManagedNativePickerHostWidth = () => {
      if (!(input instanceof HTMLElement)) {
        return 0;
      }
      const host =
        input.closest(
          ".controler-form-modal, .stats-record-editor-modal, .modal-content",
        ) || input.parentElement;
      if (!(host instanceof HTMLElement)) {
        return 0;
      }
      return Math.max(
        0,
        Number(host.clientWidth) ||
          Number(host.getBoundingClientRect?.().width) ||
          0,
      );
    };
    const isCompactDesktopViewport =
      !getNativeHostPlatform() &&
      ((getManagedNativePickerViewportWidth() > 0 &&
        getManagedNativePickerViewportWidth() <= 760) ||
        (getManagedNativePickerHostWidth() > 0 &&
          getManagedNativePickerHostWidth() <= 560));
    const scaleDialogSizeConfigForAndroid = (config) => {
      if (!config) {
        return config;
      }
      const sizeScale =
        getNativeHostPlatform() === "android"
          ? 0.66
          : isCompactDesktopViewport
            ? 0.84
            : 1;
      if (sizeScale >= 0.999) {
        return config;
      }
      return {
        preferredWidth: Math.max(
          156,
          Math.round((Number(config.preferredWidth) || 0) * sizeScale),
        ),
        minWidth: Math.max(
          144,
          Math.round((Number(config.minWidth) || 0) * sizeScale),
        ),
        compactWidth: Math.max(
          152,
          Math.round((Number(config.compactWidth) || 0) * sizeScale),
        ),
        tightWidth: Math.max(
          148,
          Math.round((Number(config.tightWidth) || 0) * sizeScale),
        ),
        preferredMaxHeight: Math.max(
          152,
          Math.round((Number(config.preferredMaxHeight) || 0) * sizeScale),
        ),
      };
    };

    if (useInlinePanel && normalizedInputType === "time") {
      return scaleDialogSizeConfigForAndroid({
        preferredWidth: 246,
        minWidth: 218,
        compactWidth: 236,
        tightWidth: 222,
        preferredMaxHeight: 318,
      });
    }
    if (useAnchoredPanel) {
      if (normalizedInputType === "datetime-local") {
        return scaleDialogSizeConfigForAndroid({
          preferredWidth: 298,
          minWidth: 244,
          compactWidth: 292,
          tightWidth: 248,
          preferredMaxHeight: 352,
        });
      }
      if (normalizedInputType === "date") {
        return scaleDialogSizeConfigForAndroid({
          preferredWidth: 288,
          minWidth: 232,
          compactWidth: 282,
          tightWidth: 244,
          preferredMaxHeight: 336,
        });
      }
      return scaleDialogSizeConfigForAndroid({
        preferredWidth: 224,
        minWidth: 194,
        compactWidth: 220,
        tightWidth: 204,
        preferredMaxHeight: 226,
      });
    }

    if (normalizedInputType === "datetime-local") {
      return scaleDialogSizeConfigForAndroid({
        preferredWidth: 332,
        minWidth: 252,
        compactWidth: 324,
        tightWidth: 274,
        preferredMaxHeight: 396,
      });
    }
    if (normalizedInputType === "date") {
      return scaleDialogSizeConfigForAndroid({
        preferredWidth: 320,
        minWidth: 240,
        compactWidth: 312,
        tightWidth: 266,
        preferredMaxHeight: 368,
      });
    }
    return scaleDialogSizeConfigForAndroid({
      preferredWidth: 238,
      minWidth: 198,
      compactWidth: 232,
      tightWidth: 210,
      preferredMaxHeight: 236,
    });
  }

  function closeManagedNativePickerSurface(surface, result = null) {
    if (!(surface instanceof HTMLElement)) {
      return false;
    }
    if (typeof surface.__controlerManagedPickerSettle === "function") {
      surface.__controlerManagedPickerSettle(result);
      return true;
    }
    if (surface.classList.contains("modal-overlay")) {
      closeModal(surface);
      return true;
    }
    surface.remove();
    return true;
  }

  function scrollManagedNativePickerOptionIntoView(
    container,
    optionButton,
    {
      behavior = "auto",
    } = {},
  ) {
    if (!(container instanceof HTMLElement) || !(optionButton instanceof HTMLElement)) {
      return;
    }
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const targetScrollTop = Math.max(
      0,
      Math.min(
        maxScrollTop,
        optionButton.offsetTop -
          Math.max(
            0,
            Math.round((container.clientHeight - optionButton.offsetHeight) / 2),
          ),
      ),
    );
    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: targetScrollTop,
        behavior,
      });
      return;
    }
    container.scrollTop = targetScrollTop;
  }

  function bindScrollableSelectionGestureGuard(container) {
    if (!(container instanceof HTMLElement)) {
      return {
        shouldSuppressSelection() {
          return false;
        },
      };
    }
    if (container.__controlerScrollableSelectionGestureGuard) {
      return container.__controlerScrollableSelectionGestureGuard;
    }

    const state = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollTop: 0,
      dragging: false,
      suppressUntil: 0,
    };
    const movementThreshold = 8;
    const suppressionWindowMs = 260;

    const startTracking = (point = {}, pointerId = null) => {
      state.pointerId = pointerId;
      state.startX = Number(point.clientX) || 0;
      state.startY = Number(point.clientY) || 0;
      state.startScrollTop = Number(container.scrollTop) || 0;
      state.dragging = false;
    };

    const updateTracking = (point = {}, pointerId = null) => {
      if (
        state.pointerId !== null &&
        pointerId !== null &&
        pointerId !== state.pointerId
      ) {
        return;
      }
      const deltaX = Math.abs((Number(point.clientX) || 0) - state.startX);
      const deltaY = Math.abs((Number(point.clientY) || 0) - state.startY);
      const scrollDelta = Math.abs((Number(container.scrollTop) || 0) - state.startScrollTop);
      if (
        state.dragging ||
        deltaX >= movementThreshold ||
        deltaY >= movementThreshold ||
        scrollDelta >= movementThreshold
      ) {
        state.dragging = true;
        state.suppressUntil = Date.now() + suppressionWindowMs;
      }
    };

    const finishTracking = () => {
      state.pointerId = null;
      state.dragging = false;
    };

    container.addEventListener(
      "pointerdown",
      (event) => {
        startTracking(event, event.pointerId);
      },
      {
        passive: true,
      },
    );
    container.addEventListener(
      "pointermove",
      (event) => {
        updateTracking(event, event.pointerId);
      },
      {
        passive: true,
      },
    );
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      container.addEventListener(
        eventName,
        () => {
          finishTracking();
        },
        {
          passive: true,
        },
      );
    });
    container.addEventListener(
      "touchstart",
      (event) => {
        if (!event.touches?.length) {
          return;
        }
        startTracking(event.touches[0], null);
      },
      {
        passive: true,
      },
    );
    container.addEventListener(
      "touchmove",
      (event) => {
        if (!event.touches?.length) {
          return;
        }
        updateTracking(event.touches[0], null);
      },
      {
        passive: true,
      },
    );
    ["touchend", "touchcancel"].forEach((eventName) => {
      container.addEventListener(
        eventName,
        () => {
          finishTracking();
        },
        {
          passive: true,
        },
      );
    });
    container.addEventListener(
      "scroll",
      () => {
        if (state.pointerId !== null || state.dragging) {
          state.suppressUntil = Date.now() + suppressionWindowMs;
        }
      },
      {
        passive: true,
      },
    );

    const api = {
      shouldSuppressSelection() {
        return Date.now() < state.suppressUntil;
      },
    };
    container.__controlerScrollableSelectionGestureGuard = api;
    return api;
  }

  function showManagedNativePickerDialog(input) {
    if (!(input instanceof HTMLInputElement)) {
      return Promise.resolve(null);
    }

    const normalizedInputType = String(input.type || "").trim().toLowerCase();
    if (!MANAGED_NATIVE_PICKER_TYPES.has(normalizedInputType)) {
      return Promise.resolve(null);
    }
    const hostModal = resolveManagedNativePickerHostModal(input);
    const useInlinePanel = shouldUseManagedNativePickerInlinePanel(
      input,
      normalizedInputType,
    );
    const useAnchoredPanel = shouldUseManagedNativePickerAnchoredPanel(
      input,
      normalizedInputType,
    );
    const dialogSizeConfig = resolveManagedNativePickerDialogSizeConfig(
      input,
      normalizedInputType,
      useAnchoredPanel,
      useInlinePanel,
    );

    const supportsDate =
      normalizedInputType === "date" ||
      normalizedInputType === "datetime-local";
    const supportsTime =
      normalizedInputType === "time" ||
      normalizedInputType === "datetime-local";
    const useInlineTimeLists = useInlinePanel && !supportsDate && supportsTime;
    const titleText = resolveManagedNativePickerDialogTitle(
      input,
      normalizedInputType,
    );
    const secondaryText =
      resolveManagedNativePickerLabelText(input) ||
      (normalizedInputType === "time"
        ? "时间"
        : normalizedInputType === "datetime-local"
          ? "日期和时间"
          : "日期");
    const isClearable = String(input.dataset.pickerClearable || "").trim() !== "false";
    const minuteStep = resolveManagedNativePickerMinuteStep(input);
    const minuteValues = buildManagedNativePickerMinuteValues(minuteStep);

    const minimumDateValue = supportsDate
      ? normalizedInputType === "date"
        ? parseManagedNativePickerDateValue(input.min)
        : parseManagedNativePickerDateTimeLocalValue(input.min)
      : null;
    const maximumDateValue = supportsDate
      ? normalizedInputType === "date"
        ? parseManagedNativePickerDateValue(input.max)
        : parseManagedNativePickerDateTimeLocalValue(input.max)
      : null;
    const minimumTimeValue =
      !supportsDate && supportsTime
        ? parseManagedNativePickerTimeValue(input.min)
        : null;
    const maximumTimeValue =
      !supportsDate && supportsTime
        ? parseManagedNativePickerTimeValue(input.max)
        : null;

    const defaultDateValue = resolveManagedNativePickerDefaultDate(
      minimumDateValue,
      maximumDateValue,
    );
    const defaultTimeValue = resolveManagedNativePickerDefaultTime(
      input,
      minuteStep,
    );

    let selectedDate = null;
    let selectedHours = null;
    let selectedMinutes = null;

    if (normalizedInputType === "date") {
      selectedDate =
        clampManagedNativePickerDateOnly(
          parseManagedNativePickerDateValue(input.value),
          minimumDateValue,
          maximumDateValue,
        ) || defaultDateValue;
    } else if (normalizedInputType === "time") {
      const parsedTimeValue =
        parseManagedNativePickerTimeValue(input.value) || defaultTimeValue;
      selectedHours = parsedTimeValue.hours;
      selectedMinutes = parsedTimeValue.minutes;
    } else {
      const parsedDateTime =
        clampManagedNativePickerDateTime(
          parseManagedNativePickerDateTimeLocalValue(input.value),
          minimumDateValue,
          maximumDateValue,
        ) ||
        clampManagedNativePickerDateTime(
          new Date(
            defaultDateValue.getFullYear(),
            defaultDateValue.getMonth(),
            defaultDateValue.getDate(),
            defaultTimeValue.hours,
            defaultTimeValue.minutes,
            0,
            0,
          ),
          minimumDateValue,
          maximumDateValue,
        );
      selectedDate = getManagedNativePickerDateOnly(parsedDateTime);
      selectedHours = parsedDateTime.getHours();
      selectedMinutes = parsedDateTime.getMinutes();
    }

    if (supportsTime && selectedHours === null) {
      selectedHours = defaultTimeValue.hours;
    }
    if (supportsTime && selectedMinutes === null) {
      selectedMinutes = defaultTimeValue.minutes;
    }

    let currentViewMonth = supportsDate
      ? getManagedNativePickerMonthStart(selectedDate || defaultDateValue)
      : null;

    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = useInlinePanel
        ? "controler-themed-picker-inline-layer"
        : `modal-overlay controler-themed-picker-overlay${
            useAnchoredPanel ? " controler-themed-picker-overlay--anchored" : ""
          }`;
      if (!useInlinePanel) {
        modal.style.display = "flex";
        modal.style.zIndex = String(getManagedNativePickerModalZIndex(input));
      }
      modal.dataset.controlerDisableAutofocus = "true";
      modal.dataset.controlerCloseProtectionDurationMs = "220";
      modal.dataset.controlerActionProtectionDurationMs = "220";
      modal.dataset.controlerInteractionShieldDurationMs = "220";
      modal.dataset.controlerClosingPointerEvents = "none";
      modal.dataset.controlerCloseHideImmediately = "true";
      modal.innerHTML = `
        <div class="modal-content themed-dialog-card controler-themed-picker-dialog${
          useAnchoredPanel ? " controler-themed-picker-dialog--anchored" : ""
        }${
          supportsDate ? " controler-themed-picker-dialog--with-calendar" : ""
        }${supportsTime ? " controler-themed-picker-dialog--with-time" : ""}${
          useInlinePanel ? " controler-themed-picker-dialog--inline" : ""
        }${
          !supportsDate && supportsTime
            ? " controler-themed-picker-dialog--time-only"
            : ""
        } ms" style="width:${
          useAnchoredPanel
            ? "min(298px, calc(100vw - 20px))"
            : "min(332px, calc(100vw - 24px))"
        }; max-width:${
          useAnchoredPanel
            ? "min(298px, calc(100vw - 20px))"
            : "min(332px, calc(100vw - 24px))"
        };">
          <div class="themed-dialog-title" data-managed-picker-title></div>
          <div class="controler-themed-picker-preview">
            <div class="controler-themed-picker-preview-secondary" data-managed-picker-preview-secondary></div>
            <div class="controler-themed-picker-preview-primary" data-managed-picker-preview-primary></div>
          </div>
          <div class="controler-themed-picker-surface">
            ${
              supportsDate
                ? `
              <div class="controler-themed-picker-calendar-shell">
                <div class="controler-themed-picker-calendar-toolbar">
                  <button type="button" class="controler-themed-picker-nav-btn" data-managed-picker-prev-month aria-label="上个月">‹</button>
                  <div class="controler-themed-picker-calendar-selects">
                    <div class="controler-themed-picker-select-field">
                      <select data-managed-picker-year aria-label="年份"></select>
                    </div>
                    <div class="controler-themed-picker-select-field">
                      <select data-managed-picker-month aria-label="月份"></select>
                    </div>
                  </div>
                  <button type="button" class="controler-themed-picker-nav-btn" data-managed-picker-next-month aria-label="下个月">›</button>
                </div>
                <div class="controler-themed-picker-calendar-weekdays" data-managed-picker-weekdays></div>
                <div class="controler-themed-picker-calendar-grid" data-managed-picker-grid></div>
              </div>
            `
                : ""
            }
            ${
              supportsTime
                ? `
              <div class="controler-themed-picker-time-shell${
                supportsDate ? " is-with-calendar" : ""
              }${useInlineTimeLists ? " is-inline-options" : ""}">
                ${
                  useInlineTimeLists
                    ? `
                <div class="controler-themed-picker-time-lists">
                  <label class="controler-themed-picker-time-list-field">
                    <span>小时</span>
                    <div class="controler-themed-picker-time-list" data-managed-picker-hour-list></div>
                  </label>
                  <label class="controler-themed-picker-time-list-field">
                    <span>分钟</span>
                    <div class="controler-themed-picker-time-list" data-managed-picker-minute-list></div>
                  </label>
                </div>
                `
                    : `
                <div class="controler-themed-picker-time-fields">
                  <label class="controler-themed-picker-select-field">
                    <span>小时</span>
                    <select data-managed-picker-hour></select>
                  </label>
                  <label class="controler-themed-picker-select-field">
                    <span>分钟</span>
                    <select data-managed-picker-minute></select>
                  </label>
                </div>
                `
                }
              </div>
            `
                : ""
            }
          </div>
          <div class="themed-dialog-actions controler-themed-picker-actions">
            ${
              isClearable
                ? '<button type="button" class="bts" data-managed-picker-clear style="margin:0;">清除</button>'
                : ""
            }
            <button type="button" class="bts themed-dialog-cancel-btn" data-managed-picker-cancel style="margin:0;">取消</button>
            <button type="button" class="bts themed-dialog-confirm-btn" data-managed-picker-confirm style="margin:0;">设置</button>
          </div>
        </div>
      `;

      const titleNode = modal.querySelector("[data-managed-picker-title]");
      const previewSecondaryNode = modal.querySelector(
        "[data-managed-picker-preview-secondary]",
      );
      const previewPrimaryNode = modal.querySelector(
        "[data-managed-picker-preview-primary]",
      );
      const yearSelect = modal.querySelector("[data-managed-picker-year]");
      const monthSelect = modal.querySelector("[data-managed-picker-month]");
      const hourSelect = modal.querySelector("[data-managed-picker-hour]");
      const minuteSelect = modal.querySelector("[data-managed-picker-minute]");
      const hourListNode = modal.querySelector("[data-managed-picker-hour-list]");
      const minuteListNode = modal.querySelector(
        "[data-managed-picker-minute-list]",
      );
      const timeListsNode = modal.querySelector(".controler-themed-picker-time-lists");
      const prevMonthButton = modal.querySelector(
        "[data-managed-picker-prev-month]",
      );
      const nextMonthButton = modal.querySelector(
        "[data-managed-picker-next-month]",
      );
      const calendarWeekdaysNode = modal.querySelector(
        "[data-managed-picker-weekdays]",
      );
      const calendarGridNode = modal.querySelector("[data-managed-picker-grid]");
      const clearButton = modal.querySelector("[data-managed-picker-clear]");
      const cancelButton = modal.querySelector("[data-managed-picker-cancel]");
      const confirmButton = modal.querySelector("[data-managed-picker-confirm]");
      const dialogContent = modal.querySelector(".modal-content");
      let dialogSettled = false;
      const anchoredCleanupTasks = [];
      const calendarWeekdayNodes = [];
      const calendarDayButtons = [];
      const hourListButtons = [];
      const minuteListButtons = [];
      const calendarGestureGuard = bindScrollableSelectionGestureGuard(
        calendarGridNode,
      );
      const hourListGestureGuard = bindScrollableSelectionGestureGuard(hourListNode);
      const minuteListGestureGuard = bindScrollableSelectionGestureGuard(
        minuteListNode,
      );

      if (titleNode) {
        titleNode.textContent = titleText;
      }
      if (previewSecondaryNode) {
        previewSecondaryNode.textContent = secondaryText;
      }

      const settleDialog = (result = null) => {
        if (dialogSettled) {
          return;
        }
        dialogSettled = true;
        while (anchoredCleanupTasks.length > 0) {
          const cleanupTask = anchoredCleanupTasks.pop();
          try {
            cleanupTask?.();
          } catch (_error) {}
        }
        modal.__controlerManagedPickerSettle = null;
        modal.__controlerCloseModal = null;
        if (useInlinePanel) {
          modal.remove();
          window.setTimeout(() => {
            resolve(result);
          }, 0);
          return;
        }
        closeModal(modal);
        window.setTimeout(() => {
          resolve(result);
        }, Math.max(MODAL_ACTION_DEDUP_WINDOW_MS + 40, 180));
      };
      modal.__controlerManagedPickerSettle = settleDialog;

      const normalizeSelectedTimeWithinBounds = () => {
        if (!supportsTime) {
          return;
        }
        const bounds = getManagedNativePickerTimeBoundsForSelection(
          supportsDate ? selectedDate : null,
          minimumDateValue,
          maximumDateValue,
          minimumTimeValue,
          maximumTimeValue,
        );
        const validHours = [];
        for (let hour = 0; hour < 24; hour += 1) {
          const hasValidMinute = minuteValues.some((minute) => {
            const totalMinutes = hour * 60 + minute;
            return (
              totalMinutes >= bounds.minimumMinutes &&
              totalMinutes <= bounds.maximumMinutes
            );
          });
          if (hasValidMinute) {
            validHours.push(hour);
          }
        }
        if (!validHours.length) {
          selectedHours = Math.floor(bounds.minimumMinutes / 60);
          selectedMinutes = bounds.minimumMinutes % 60;
          return;
        }
        if (!validHours.includes(selectedHours)) {
          selectedHours = pickManagedNativePickerNearestNumber(
            validHours,
            Number.isFinite(selectedHours)
              ? selectedHours
              : Math.floor(bounds.minimumMinutes / 60),
          );
        }
        const validMinutes = minuteValues.filter((minute) => {
          const totalMinutes = selectedHours * 60 + minute;
          return (
            totalMinutes >= bounds.minimumMinutes &&
            totalMinutes <= bounds.maximumMinutes
          );
        });
        if (!validMinutes.length) {
          selectedHours = validHours[0];
          selectedMinutes = minuteValues[0] || 0;
          return;
        }
        if (!validMinutes.includes(selectedMinutes)) {
          selectedMinutes = pickManagedNativePickerNearestNumber(
            validMinutes,
            Number.isFinite(selectedMinutes)
              ? selectedMinutes
              : bounds.minimumMinutes % 60,
          );
        }
      };

      const syncPreview = () => {
        if (!(previewPrimaryNode instanceof HTMLElement)) {
          return;
        }
        if (supportsDate && supportsTime) {
          previewPrimaryNode.textContent = formatManagedNativePickerDisplayDateTime(
            new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
              selectedHours,
              selectedMinutes,
              0,
              0,
            ),
          );
          return;
        }
        if (supportsDate) {
          previewPrimaryNode.textContent =
            formatManagedNativePickerDisplayDate(selectedDate);
          return;
        }
        previewPrimaryNode.textContent = formatManagedNativePickerTimeValue(
          selectedHours,
          selectedMinutes,
        );
      };

      const populateHourSelect = () => {
        if (!(hourSelect instanceof HTMLSelectElement)) {
          return;
        }
        const bounds = getManagedNativePickerTimeBoundsForSelection(
          supportsDate ? selectedDate : null,
          minimumDateValue,
          maximumDateValue,
          minimumTimeValue,
          maximumTimeValue,
        );
        hourSelect.innerHTML = "";
        for (let hour = 0; hour < 24; hour += 1) {
          const option = document.createElement("option");
          option.value = String(hour);
          option.textContent = padManagedNativePickerNumber(hour);
          option.disabled = !minuteValues.some((minute) => {
            const totalMinutes = hour * 60 + minute;
            return (
              totalMinutes >= bounds.minimumMinutes &&
              totalMinutes <= bounds.maximumMinutes
            );
          });
          hourSelect.appendChild(option);
        }
        hourSelect.value = String(selectedHours);
        if (hourSelect.selectedIndex < 0) {
          const firstEnabledOption = Array.from(hourSelect.options).find(
            (option) => !option.disabled,
          );
          if (firstEnabledOption) {
            hourSelect.value = firstEnabledOption.value;
            selectedHours = Number.parseInt(firstEnabledOption.value, 10);
          }
        }
        enhanceNativeSelect(hourSelect, {
          fullWidth: true,
          minWidth: 0,
          preferredMenuWidth: 120,
          maxMenuWidth: 164,
        });
        refreshEnhancedSelect(hourSelect);
      };

      const populateMinuteSelect = () => {
        if (!(minuteSelect instanceof HTMLSelectElement)) {
          return;
        }
        const bounds = getManagedNativePickerTimeBoundsForSelection(
          supportsDate ? selectedDate : null,
          minimumDateValue,
          maximumDateValue,
          minimumTimeValue,
          maximumTimeValue,
        );
        minuteSelect.innerHTML = "";
        minuteValues.forEach((minute) => {
          const option = document.createElement("option");
          option.value = String(minute);
          option.textContent = padManagedNativePickerNumber(minute);
          const totalMinutes = selectedHours * 60 + minute;
          option.disabled =
            totalMinutes < bounds.minimumMinutes ||
            totalMinutes > bounds.maximumMinutes;
          minuteSelect.appendChild(option);
        });
        minuteSelect.value = String(selectedMinutes);
        if (minuteSelect.selectedIndex < 0) {
          const firstEnabledOption = Array.from(minuteSelect.options).find(
            (option) => !option.disabled,
          );
          if (firstEnabledOption) {
            minuteSelect.value = firstEnabledOption.value;
            selectedMinutes = Number.parseInt(firstEnabledOption.value, 10);
          }
        }
        enhanceNativeSelect(minuteSelect, {
          fullWidth: true,
          minWidth: 0,
          preferredMenuWidth: 120,
          maxMenuWidth: 164,
        });
        refreshEnhancedSelect(minuteSelect);
      };

      const ensureManagedNativePickerListButtons = (
        listNode,
        buttonStore,
        optionValues,
        formatLabel,
        handleSelection,
      ) => {
        if (!(listNode instanceof HTMLElement)) {
          return [];
        }
        if (
          buttonStore.length === optionValues.length &&
          listNode.children.length === optionValues.length
        ) {
          return buttonStore;
        }
        buttonStore.length = 0;
        listNode.innerHTML = "";
        optionValues.forEach((optionValue) => {
          const optionButton = document.createElement("button");
          optionButton.type = "button";
          optionButton.className = "controler-themed-picker-list-option";
          optionButton.textContent = formatLabel(optionValue);
          optionButton.__controlerManagedPickerValue = optionValue;
          optionButton.addEventListener("click", (event) => {
            const gestureGuard =
              listNode === hourListNode
                ? hourListGestureGuard
                : listNode === minuteListNode
                  ? minuteListGestureGuard
                  : null;
            if (gestureGuard?.shouldSuppressSelection?.()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (optionButton.disabled) {
              return;
            }
            handleSelection(optionButton.__controlerManagedPickerValue);
          });
          listNode.appendChild(optionButton);
          buttonStore.push(optionButton);
        });
        return buttonStore;
      };

      const populateHourList = ({
        scrollBehavior = "auto",
      } = {}) => {
        if (!(hourListNode instanceof HTMLElement)) {
          return;
        }
        const bounds = getManagedNativePickerTimeBoundsForSelection(
          supportsDate ? selectedDate : null,
          minimumDateValue,
          maximumDateValue,
          minimumTimeValue,
          maximumTimeValue,
        );
        const hourButtons = ensureManagedNativePickerListButtons(
          hourListNode,
          hourListButtons,
          Array.from(
            {
              length: 24,
            },
            (_, hourIndex) => hourIndex,
          ),
          (hourValue) => padManagedNativePickerNumber(hourValue),
          (hourValue) => {
            if (!Number.isFinite(hourValue) || selectedHours === hourValue) {
              return;
            }
            selectedHours = Number(hourValue);
            normalizeSelectedTimeWithinBounds();
            populateHourList();
            populateMinuteList();
            syncPreview();
          },
        );
        let selectedButton = null;
        hourButtons.forEach((optionButton) => {
          const optionHour = Number(optionButton.__controlerManagedPickerValue);
          const isDisabled = !minuteValues.some((minute) => {
            const totalMinutes = optionHour * 60 + minute;
            return (
              totalMinutes >= bounds.minimumMinutes &&
              totalMinutes <= bounds.maximumMinutes
            );
          });
          optionButton.disabled = isDisabled;
          const isSelected = !isDisabled && optionHour === selectedHours;
          optionButton.classList.toggle("is-selected", isSelected);
          optionButton.classList.toggle("is-disabled", isDisabled);
          if (isSelected) {
            selectedButton = optionButton;
          }
        });
        if (selectedButton) {
          scrollManagedNativePickerOptionIntoView(hourListNode, selectedButton, {
            behavior: scrollBehavior,
          });
        }
      };

      const populateMinuteList = ({
        scrollBehavior = "auto",
      } = {}) => {
        if (!(minuteListNode instanceof HTMLElement)) {
          return;
        }
        const bounds = getManagedNativePickerTimeBoundsForSelection(
          supportsDate ? selectedDate : null,
          minimumDateValue,
          maximumDateValue,
          minimumTimeValue,
          maximumTimeValue,
        );
        const minuteButtons = ensureManagedNativePickerListButtons(
          minuteListNode,
          minuteListButtons,
          minuteValues,
          (minuteValue) => padManagedNativePickerNumber(minuteValue),
          (minuteValue) => {
            if (!Number.isFinite(minuteValue) || selectedMinutes === minuteValue) {
              return;
            }
            selectedMinutes = Number(minuteValue);
            normalizeSelectedTimeWithinBounds();
            populateMinuteList();
            syncPreview();
          },
        );
        let selectedButton = null;
        minuteButtons.forEach((optionButton) => {
          const optionMinute = Number(optionButton.__controlerManagedPickerValue);
          const totalMinutes = selectedHours * 60 + optionMinute;
          const isDisabled =
            totalMinutes < bounds.minimumMinutes ||
            totalMinutes > bounds.maximumMinutes;
          optionButton.disabled = isDisabled;
          const isSelected = !isDisabled && optionMinute === selectedMinutes;
          optionButton.classList.toggle("is-selected", isSelected);
          optionButton.classList.toggle("is-disabled", isDisabled);
          if (isSelected) {
            selectedButton = optionButton;
          }
        });
        if (selectedButton) {
          scrollManagedNativePickerOptionIntoView(
            minuteListNode,
            selectedButton,
            {
              behavior: scrollBehavior,
            },
          );
        }
      };

      const populateYearMonthSelects = () => {
        if (
          !(yearSelect instanceof HTMLSelectElement) ||
          !(monthSelect instanceof HTMLSelectElement)
        ) {
          return;
        }
        const yearValues = buildManagedNativePickerYearValues(
          currentViewMonth,
          minimumDateValue,
          maximumDateValue,
        );
        yearSelect.innerHTML = "";
        yearValues.forEach((yearValue) => {
          const option = document.createElement("option");
          option.value = String(yearValue);
          option.textContent = `${yearValue}年`;
          yearSelect.appendChild(option);
        });
        yearSelect.value = String(currentViewMonth.getFullYear());

        monthSelect.innerHTML = "";
        MANAGED_NATIVE_PICKER_MONTH_LABELS.forEach((monthLabel, monthIndex) => {
          const option = document.createElement("option");
          option.value = String(monthIndex);
          option.textContent = monthLabel;
          option.disabled = !isManagedNativePickerMonthAvailable(
            currentViewMonth.getFullYear(),
            monthIndex,
            minimumDateValue,
            maximumDateValue,
          );
          monthSelect.appendChild(option);
        });
        monthSelect.value = String(currentViewMonth.getMonth());
        if (monthSelect.selectedIndex < 0) {
          const firstEnabledMonthOption = Array.from(monthSelect.options).find(
            (option) => !option.disabled,
          );
          if (firstEnabledMonthOption) {
            monthSelect.value = firstEnabledMonthOption.value;
            currentViewMonth = new Date(
              currentViewMonth.getFullYear(),
              Number.parseInt(firstEnabledMonthOption.value, 10),
              1,
            );
          }
        }

        enhanceNativeSelect(yearSelect, {
          fullWidth: true,
          minWidth: 0,
          preferredMenuWidth: 132,
          maxMenuWidth: 176,
        });
        enhanceNativeSelect(monthSelect, {
          fullWidth: true,
          minWidth: 0,
          preferredMenuWidth: 108,
          maxMenuWidth: 144,
        });
        refreshEnhancedSelect(yearSelect);
        refreshEnhancedSelect(monthSelect);
      };

      const ensureCalendarWeekdayNodes = () => {
        if (!(calendarWeekdaysNode instanceof HTMLElement)) {
          return [];
        }
        if (
          calendarWeekdayNodes.length === MANAGED_NATIVE_PICKER_WEEKDAY_LABELS.length &&
          calendarWeekdaysNode.children.length ===
            MANAGED_NATIVE_PICKER_WEEKDAY_LABELS.length
        ) {
          return calendarWeekdayNodes;
        }
        calendarWeekdayNodes.length = 0;
        calendarWeekdaysNode.innerHTML = "";
        MANAGED_NATIVE_PICKER_WEEKDAY_LABELS.forEach((weekdayLabel) => {
          const weekdayNode = document.createElement("span");
          weekdayNode.textContent = weekdayLabel.slice(-1);
          calendarWeekdaysNode.appendChild(weekdayNode);
          calendarWeekdayNodes.push(weekdayNode);
        });
        return calendarWeekdayNodes;
      };

      function handleManagedNativePickerDaySelection(nextDayDate) {
        if (
          !(nextDayDate instanceof Date) ||
          Number.isNaN(nextDayDate.getTime())
        ) {
          return;
        }
        const previousViewMonth = currentViewMonth;
        const previousTimeBoundsSignature = supportsTime
          ? serializeManagedNativePickerTimeBounds(
              getManagedNativePickerTimeBoundsForSelection(
                supportsDate ? selectedDate : null,
                minimumDateValue,
                maximumDateValue,
                minimumTimeValue,
                maximumTimeValue,
              ),
            )
          : "";
        const previousHours = selectedHours;
        const previousMinutes = selectedMinutes;

        selectedDate = new Date(nextDayDate.getTime());
        currentViewMonth = getManagedNativePickerMonthStart(nextDayDate);
        normalizeSelectedTimeWithinBounds();

        if (!areManagedNativePickerMonthsEqual(previousViewMonth, currentViewMonth)) {
          populateYearMonthSelects();
        }
        renderCalendarGrid();

        if (supportsTime) {
          const nextTimeBoundsSignature = serializeManagedNativePickerTimeBounds(
            getManagedNativePickerTimeBoundsForSelection(
              supportsDate ? selectedDate : null,
              minimumDateValue,
              maximumDateValue,
              minimumTimeValue,
              maximumTimeValue,
            ),
          );
          if (
            nextTimeBoundsSignature !== previousTimeBoundsSignature ||
            previousHours !== selectedHours ||
            previousMinutes !== selectedMinutes
          ) {
            populateHourSelect();
            populateMinuteSelect();
            populateHourList();
            populateMinuteList();
          }
        }

        syncPreview();
      }

      const ensureCalendarDayButtons = () => {
        if (!(calendarGridNode instanceof HTMLElement)) {
          return [];
        }
        if (calendarDayButtons.length === 42 && calendarGridNode.children.length === 42) {
          return calendarDayButtons;
        }
        calendarDayButtons.length = 0;
        calendarGridNode.innerHTML = "";
        for (let index = 0; index < 42; index += 1) {
          const dayButton = document.createElement("button");
          dayButton.type = "button";
          dayButton.className = "controler-themed-picker-day";
          dayButton.addEventListener("click", (event) => {
            if (calendarGestureGuard.shouldSuppressSelection()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (dayButton.disabled) {
              return;
            }
            handleManagedNativePickerDaySelection(
              dayButton.__controlerManagedPickerDateValue,
            );
          });
          calendarGridNode.appendChild(dayButton);
          calendarDayButtons.push(dayButton);
        }
        return calendarDayButtons;
      };

      const renderCalendarGrid = () => {
        if (!(calendarGridNode instanceof HTMLElement)) {
          return;
        }
        ensureCalendarWeekdayNodes();
        const dayButtons = ensureCalendarDayButtons();

        const monthStart = new Date(
          currentViewMonth.getFullYear(),
          currentViewMonth.getMonth(),
          1,
        );
        const monthOffset = (monthStart.getDay() + 6) % 7;
        const gridStartDate = new Date(
          currentViewMonth.getFullYear(),
          currentViewMonth.getMonth(),
          1 - monthOffset,
        );

        for (let index = 0; index < 42; index += 1) {
          const dayButton = dayButtons[index];
          if (!(dayButton instanceof HTMLButtonElement)) {
            continue;
          }
          const dayDate = new Date(
            gridStartDate.getFullYear(),
            gridStartDate.getMonth(),
            gridStartDate.getDate() + index,
          );
          const isOutsideCurrentMonth =
            dayDate.getMonth() !== currentViewMonth.getMonth() ||
            dayDate.getFullYear() !== currentViewMonth.getFullYear();
          const isSelected = areManagedNativePickerDatesEqual(
            dayDate,
            selectedDate,
          );
          const isToday = areManagedNativePickerDatesEqual(dayDate, new Date());
          const isDisabled =
            (minimumDateValue instanceof Date &&
              compareManagedNativePickerDateOnly(dayDate, minimumDateValue) < 0) ||
            (maximumDateValue instanceof Date &&
              compareManagedNativePickerDateOnly(dayDate, maximumDateValue) > 0);

          if (dayButton.textContent !== String(dayDate.getDate())) {
            dayButton.textContent = String(dayDate.getDate());
          }
          dayButton.classList.toggle("is-outside-month", isOutsideCurrentMonth);
          dayButton.classList.toggle("is-selected", isSelected);
          dayButton.classList.toggle("is-today", isToday);
          dayButton.classList.toggle("is-disabled", isDisabled);
          dayButton.disabled = isDisabled;
          dayButton.__controlerManagedPickerDateValue = isDisabled
            ? null
            : new Date(dayDate.getTime());
        }

        if (prevMonthButton instanceof HTMLButtonElement) {
          const previousMonth = new Date(
            currentViewMonth.getFullYear(),
            currentViewMonth.getMonth() - 1,
            1,
          );
          prevMonthButton.disabled = !isManagedNativePickerMonthAvailable(
            previousMonth.getFullYear(),
            previousMonth.getMonth(),
            minimumDateValue,
            maximumDateValue,
          );
        }
        if (nextMonthButton instanceof HTMLButtonElement) {
          const nextMonth = new Date(
            currentViewMonth.getFullYear(),
            currentViewMonth.getMonth() + 1,
            1,
          );
          nextMonthButton.disabled = !isManagedNativePickerMonthAvailable(
            nextMonth.getFullYear(),
            nextMonth.getMonth(),
            minimumDateValue,
            maximumDateValue,
          );
        }
      };

      normalizeSelectedTimeWithinBounds();
      populateYearMonthSelects();
      renderCalendarGrid();
      populateHourSelect();
      populateMinuteSelect();
      populateHourList({
        scrollBehavior: "auto",
      });
      populateMinuteList({
        scrollBehavior: "auto",
      });
      syncPreview();

      if (yearSelect instanceof HTMLSelectElement) {
        yearSelect.addEventListener("change", () => {
          const nextYear = Number.parseInt(yearSelect.value, 10);
          if (!Number.isFinite(nextYear)) {
            return;
          }
          currentViewMonth = new Date(nextYear, currentViewMonth.getMonth(), 1);
          populateYearMonthSelects();
          renderCalendarGrid();
          syncPreview();
        });
      }

      if (monthSelect instanceof HTMLSelectElement) {
        monthSelect.addEventListener("change", () => {
          const nextMonthIndex = Number.parseInt(monthSelect.value, 10);
          if (!Number.isFinite(nextMonthIndex)) {
            return;
          }
          currentViewMonth = new Date(
            currentViewMonth.getFullYear(),
            nextMonthIndex,
            1,
          );
          populateYearMonthSelects();
          renderCalendarGrid();
          syncPreview();
        });
      }

      if (prevMonthButton instanceof HTMLButtonElement) {
        prevMonthButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const previousMonth = new Date(
            currentViewMonth.getFullYear(),
            currentViewMonth.getMonth() - 1,
            1,
          );
          if (
            !isManagedNativePickerMonthAvailable(
              previousMonth.getFullYear(),
              previousMonth.getMonth(),
              minimumDateValue,
              maximumDateValue,
            )
          ) {
            return;
          }
          currentViewMonth = previousMonth;
          populateYearMonthSelects();
          renderCalendarGrid();
        });
      }

      if (nextMonthButton instanceof HTMLButtonElement) {
        nextMonthButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextMonth = new Date(
            currentViewMonth.getFullYear(),
            currentViewMonth.getMonth() + 1,
            1,
          );
          if (
            !isManagedNativePickerMonthAvailable(
              nextMonth.getFullYear(),
              nextMonth.getMonth(),
              minimumDateValue,
              maximumDateValue,
            )
          ) {
            return;
          }
          currentViewMonth = nextMonth;
          populateYearMonthSelects();
          renderCalendarGrid();
        });
      }

      if (hourSelect instanceof HTMLSelectElement) {
        hourSelect.addEventListener("change", () => {
          selectedHours = Number.parseInt(hourSelect.value, 10);
          normalizeSelectedTimeWithinBounds();
          populateHourSelect();
          populateMinuteSelect();
          populateHourList();
          populateMinuteList();
          syncPreview();
        });
      }

      if (minuteSelect instanceof HTMLSelectElement) {
        minuteSelect.addEventListener("change", () => {
          selectedMinutes = Number.parseInt(minuteSelect.value, 10);
          normalizeSelectedTimeWithinBounds();
          populateMinuteSelect();
          populateMinuteList();
          syncPreview();
        });
      }

      const syncDialogLayout = () => {
        if (dialogSettled || !(dialogContent instanceof HTMLElement)) {
          return;
        }
        const visualViewport = window.visualViewport;
        const viewportWidth = Math.max(
          0,
          visualViewport?.width || window.innerWidth || 0,
        );
        const viewportHeight = Math.max(
          0,
          visualViewport?.height || window.innerHeight || 0,
        );
        const viewportOffsetLeft = Math.max(
          0,
          Number(visualViewport?.offsetLeft) || 0,
        );
        const viewportOffsetTop = Math.max(
          0,
          Number(visualViewport?.offsetTop) || 0,
        );
        const viewportRight = viewportOffsetLeft + viewportWidth;
        const viewportBottom = viewportOffsetTop + viewportHeight;
        const safeInset = useAnchoredPanel ? 10 : 12;
        const availableWidth = Math.max(0, viewportWidth - safeInset * 2);
        const availableHeight = Math.max(0, viewportHeight - safeInset * 2);
        const fallbackMinWidth =
          getNativeHostPlatform() === "android"
            ? useAnchoredPanel
              ? 144
              : 152
            : useAnchoredPanel
              ? 188
              : 196;
        const minimumDialogHeight =
          getNativeHostPlatform() === "android"
            ? useInlineTimeLists
              ? 136
              : 148
            : 208;
        const resolvedMinWidth = Math.min(
          availableWidth,
          Math.max(fallbackMinWidth, dialogSizeConfig.minWidth),
        );
        const resolvedWidth = Math.max(
          resolvedMinWidth,
          Math.min(dialogSizeConfig.preferredWidth, availableWidth),
        );
        const resolvedMaxHeight = Math.max(
          Math.min(availableHeight, minimumDialogHeight),
          Math.min(dialogSizeConfig.preferredMaxHeight, availableHeight),
        );

        dialogContent.style.width = `${resolvedWidth}px`;
        dialogContent.style.maxWidth = `${resolvedWidth}px`;
        dialogContent.style.minWidth = `${resolvedMinWidth}px`;
        dialogContent.style.maxHeight = `${resolvedMaxHeight}px`;
        dialogContent.style.overflowX = "hidden";
        dialogContent.style.overflowY = "auto";
        dialogContent.style.setProperty(
          "--controler-themed-picker-dialog-width",
          `${resolvedWidth}px`,
        );
        dialogContent.style.setProperty(
          "--controler-themed-picker-dialog-max-height",
          `${resolvedMaxHeight}px`,
        );
        if (useInlineTimeLists && timeListsNode instanceof HTMLElement) {
          dialogContent.style.setProperty(
            "--controler-themed-picker-time-list-height",
            `${Math.max(96, Math.min(188, resolvedMaxHeight - 96))}px`,
          );
          const timeListsHeight = Math.max(
            0,
            Math.round(timeListsNode.getBoundingClientRect().height || 0),
          );
          const chromeHeight = Math.max(0, dialogContent.scrollHeight - timeListsHeight);
          const resolvedTimeListHeight = Math.max(
            84,
            Math.min(188, resolvedMaxHeight - chromeHeight),
          );
          dialogContent.style.setProperty(
            "--controler-themed-picker-time-list-height",
            `${resolvedTimeListHeight}px`,
          );
        } else {
          dialogContent.style.removeProperty(
            "--controler-themed-picker-time-list-height",
          );
        }
        dialogContent.classList.toggle(
          "controler-themed-picker-dialog--compact",
          resolvedWidth <= dialogSizeConfig.compactWidth ||
            resolvedMaxHeight < dialogSizeConfig.preferredMaxHeight,
        );
        dialogContent.classList.toggle(
          "controler-themed-picker-dialog--tight",
          resolvedWidth <= dialogSizeConfig.tightWidth,
        );

        if (
          !useAnchoredPanel ||
          !(input instanceof HTMLElement) ||
          availableWidth <= 0 ||
          availableHeight <= 0
        ) {
          dialogContent.style.position = "";
          dialogContent.style.top = "";
          dialogContent.style.left = "";
          dialogContent.style.right = "";
          dialogContent.style.bottom = "";
          dialogContent.style.margin = "";
          return;
        }

        const anchorRect = input.getBoundingClientRect();
        const anchorLeft = anchorRect.left + viewportOffsetLeft;
        const anchorTop = anchorRect.top + viewportOffsetTop;
        const anchorBottom = anchorRect.bottom + viewportOffsetTop;
        const anchorGap = 6;
        const contentRect = dialogContent.getBoundingClientRect();
        const contentHeight = Math.min(
          resolvedMaxHeight,
          Math.max(contentRect.height || 0, Math.min(resolvedMaxHeight, minimumDialogHeight)),
        );
        let top = anchorBottom + anchorGap;
        if (top + contentHeight > viewportBottom - safeInset) {
          top = Math.max(
            viewportOffsetTop + safeInset,
            anchorTop - contentHeight - anchorGap,
          );
        }
        if (top + contentHeight > viewportBottom - safeInset) {
          top = Math.max(
            viewportOffsetTop + safeInset,
            viewportBottom - contentHeight - safeInset,
          );
        }
        const left = Math.min(
          Math.max(viewportOffsetLeft + safeInset, anchorLeft),
          Math.max(
            viewportOffsetLeft + safeInset,
            viewportRight - resolvedWidth - safeInset,
          ),
        );

        dialogContent.style.position = "fixed";
        dialogContent.style.top = `${Math.round(top)}px`;
        dialogContent.style.left = `${Math.round(left)}px`;
        dialogContent.style.right = "auto";
        dialogContent.style.bottom = "auto";
        dialogContent.style.margin = "0";
      };

      const scheduleDialogLayout = () => {
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(syncDialogLayout);
          return;
        }
        window.setTimeout(syncDialogLayout, 16);
      };

      bindModalAction(modal, clearButton, () => {
        settleDialog("");
      });
      bindModalAction(modal, cancelButton, () => {
        settleDialog(null);
      });
      bindModalAction(modal, confirmButton, () => {
        if (normalizedInputType === "date") {
          settleDialog(formatManagedNativePickerDateValue(selectedDate));
          return;
        }
        if (normalizedInputType === "time") {
          settleDialog(
            formatManagedNativePickerTimeValue(selectedHours, selectedMinutes),
          );
          return;
        }
        settleDialog(
          formatManagedNativePickerDateTimeLocalValue(
            new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
              selectedHours,
              selectedMinutes,
              0,
              0,
            ),
          ),
        );
      });
      if (!useInlinePanel) {
        bindModalBackdropDismiss(modal, () => {
          settleDialog(null);
        });

        prepareModalOverlay(modal, {
          zIndex: getManagedNativePickerModalZIndex(input),
          scope: "viewport",
          alignItems: useAnchoredPanel ? "flex-start" : "center",
          justifyContent: useAnchoredPanel ? "flex-start" : "center",
          keyboardConfirmSelector: "[data-managed-picker-confirm]",
          keyboardCancelSelector: "[data-managed-picker-cancel]",
        });
        modal.__controlerCloseModal = () => settleDialog(null);
        if (useAnchoredPanel) {
          modal.style.backgroundColor = "transparent";
          modal.style.padding = "0";
          modal.style.overflow = "visible";
        }
      } else {
        const inlineMountHost =
          hostModal instanceof HTMLElement && hostModal.isConnected
            ? hostModal
            : document.body;
        modal.style.position = "absolute";
        modal.style.inset = "0";
        modal.style.display = "block";
        modal.style.pointerEvents = "none";
        modal.style.overflow = "visible";
        modal.style.zIndex = "3";
        if (
          inlineMountHost instanceof HTMLElement &&
          modal.parentElement !== inlineMountHost
        ) {
          inlineMountHost.appendChild(modal);
        } else if (!modal.isConnected && document.body) {
          document.body.appendChild(modal);
        }
        if (dialogContent instanceof HTMLElement) {
          dialogContent.style.pointerEvents = "auto";
        }
        const handleOutsidePointerDown = (event) => {
          const eventTarget =
            event.target instanceof HTMLElement
              ? event.target
              : event.target instanceof Node
                ? event.target.parentElement
                : null;
          if (
            eventTarget instanceof HTMLElement &&
            (modal.contains(eventTarget) ||
              eventTarget === input ||
              input.contains?.(eventTarget))
          ) {
            return;
          }
          settleDialog(null);
        };
        const handleInlineKeydown = (event) => {
          if (event.key !== "Escape" || event.defaultPrevented) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          settleDialog(null);
        };
        window.setTimeout(() => {
          if (dialogSettled) {
            return;
          }
          document.addEventListener("pointerdown", handleOutsidePointerDown, true);
          document.addEventListener("keydown", handleInlineKeydown, true);
        }, 0);
        anchoredCleanupTasks.push(() => {
          document.removeEventListener(
            "pointerdown",
            handleOutsidePointerDown,
            true,
          );
          document.removeEventListener("keydown", handleInlineKeydown, true);
        });
        if (typeof MutationObserver === "function" && document.body) {
          const inlineObserver = new MutationObserver(() => {
            if (dialogSettled) {
              return;
            }
            if (
              !input.isConnected ||
              !(hostModal instanceof HTMLElement) ||
              !hostModal.isConnected
            ) {
              settleDialog(null);
            }
          });
          inlineObserver.observe(document.body, {
            childList: true,
            subtree: true,
          });
          anchoredCleanupTasks.push(() => {
            inlineObserver.disconnect();
          });
        }
        modal.__controlerCloseModal = () => settleDialog(null);
      }
      const handleViewportSync = () => {
        scheduleDialogLayout();
      };
      window.addEventListener("resize", handleViewportSync, true);
      window.visualViewport?.addEventListener?.("resize", handleViewportSync);
      window.visualViewport?.addEventListener?.("scroll", handleViewportSync);
      anchoredCleanupTasks.push(() => {
        window.removeEventListener("resize", handleViewportSync, true);
        window.visualViewport?.removeEventListener?.(
          "resize",
          handleViewportSync,
        );
        window.visualViewport?.removeEventListener?.(
          "scroll",
          handleViewportSync,
        );
      });
      if (useAnchoredPanel) {
        window.addEventListener("scroll", handleViewportSync, true);
        anchoredCleanupTasks.push(() => {
          window.removeEventListener("scroll", handleViewportSync, true);
        });
      }
      scheduleDialogLayout();
      window.setTimeout(scheduleDialogLayout, 0);
      window.setTimeout(scheduleDialogLayout, 80);
      if (!useInlinePanel) {
        activateModalInteractionShield(180);
        window.setTimeout(() => {
          (useAnchoredPanel ? null : confirmButton)?.focus?.();
        }, 0);
      }
    });
  }

  function openManagedNativePickerForInput(input) {
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return Promise.resolve(false);
    }
    if (input.__controlerManagedNativePickerOpening === true) {
      return Promise.resolve(false);
    }
    const hostModal =
      input.closest(".modal-overlay") instanceof HTMLElement
        ? input.closest(".modal-overlay")
        : null;
    document
      .querySelectorAll(
        ".controler-themed-picker-overlay, .controler-themed-picker-inline-layer",
      )
      .forEach((openPickerOverlay) => {
        if (
          openPickerOverlay instanceof HTMLElement &&
          openPickerOverlay !== input.closest(".controler-themed-picker-overlay") &&
          openPickerOverlay !== input.closest(".controler-themed-picker-inline-layer")
        ) {
          closeManagedNativePickerSurface(openPickerOverlay);
        }
      });
    input.__controlerManagedNativePickerOpening = true;
    if (isAndroidNativeRuntime()) {
      suppressAndroidModalAutofocus(hostModal, 520);
      releaseAndroidInteractiveTextControlFocus();
    }
    input.blur?.();
    return showManagedNativePickerDialog(input)
      .then((nextValue) => {
        if (typeof nextValue === "string") {
          applyManagedNativePickerValue(input, nextValue);
          return true;
        }
        return false;
      })
      .finally(() => {
        if (isAndroidNativeRuntime()) {
          suppressAndroidModalAutofocus(hostModal, 420);
        }
        input.__controlerManagedNativePickerOpening = false;
      });
  }

  function enhanceManagedNativePickerInput(input) {
    if (
      !(input instanceof HTMLInputElement) ||
      input.__controlerManagedNativePickerApi ||
      !MANAGED_NATIVE_PICKER_TYPES.has(String(input.type || "").trim().toLowerCase())
    ) {
      return input?.__controlerManagedNativePickerApi || null;
    }

    const openPicker = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      }
      void openManagedNativePickerForInput(input);
    };

    const handleClick = (event) => {
      if (input.disabled) {
        return;
      }
      openPicker(event);
    };

    const handleKeydown = (event) => {
      if (input.disabled || !["Enter", " ", "ArrowDown"].includes(event.key)) {
        return;
      }
      openPicker(event);
    };

    const handleFocus = () => {
      if (document.activeElement === input) {
        input.blur?.();
      }
    };

    input.dataset.controlerManagedPicker = "true";
    input.setAttribute("inputmode", "none");
    input.autocomplete = "off";
    if (!input.hasAttribute("readonly")) {
      input.dataset.controlerManagedPickerReadonly = "true";
      input.readOnly = true;
    }
    input.addEventListener("click", handleClick);
    input.addEventListener("keydown", handleKeydown);
    input.addEventListener("focus", handleFocus);

    const api = {
      open() {
        return openManagedNativePickerForInput(input);
      },
      destroy() {
        input.removeEventListener("click", handleClick);
        input.removeEventListener("keydown", handleKeydown);
        input.removeEventListener("focus", handleFocus);
        if (input.dataset.controlerManagedPickerReadonly === "true") {
          input.readOnly = false;
          delete input.dataset.controlerManagedPickerReadonly;
        }
        input.removeAttribute("inputmode");
        delete input.dataset.controlerManagedPicker;
        delete input.__controlerManagedNativePickerApi;
      },
    };

    input.__controlerManagedNativePickerApi = api;
    return api;
  }

  function enhanceThemedNativePickerInputs(root = document) {
    if (!shouldUseManagedNativePickerRuntime()) {
      return [];
    }
    const normalizedRoot =
      root instanceof Document || root instanceof Element ? root : document;
    const inputCandidates = [];
    if (
      normalizedRoot instanceof HTMLInputElement &&
      normalizedRoot.matches(MANAGED_NATIVE_PICKER_INPUT_SELECTOR)
    ) {
      inputCandidates.push(normalizedRoot);
    }
    if (typeof normalizedRoot.querySelectorAll === "function") {
      inputCandidates.push(
        ...normalizedRoot.querySelectorAll(MANAGED_NATIVE_PICKER_INPUT_SELECTOR),
      );
    }
    return inputCandidates
      .map((inputNode) => enhanceManagedNativePickerInput(inputNode))
      .filter(Boolean);
  }

  function initThemedNativePickerInputs() {
    if (managedNativePickerInitBound) {
      enhanceThemedNativePickerInputs(document);
      enhanceControlerTimeTextInputs(document);
      return;
    }
    managedNativePickerInitBound = true;

    const bindEnhancers = () => {
      if (!shouldUseManagedNativePickerRuntime()) {
        return;
      }
      enhanceThemedNativePickerInputs(document);
      enhanceControlerTimeTextInputs(document);
      if (managedNativePickerObserver || !(document.body instanceof HTMLElement)) {
        return;
      }
      managedNativePickerObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((addedNode) => {
            if (!(addedNode instanceof Element)) {
              return;
            }
            enhanceThemedNativePickerInputs(addedNode);
            enhanceControlerTimeTextInputs(addedNode);
          });
        });
      });
      managedNativePickerObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindEnhancers, {
        once: true,
      });
      return;
    }
    bindEnhancers();
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
      clickSuppressionMs = 420,
      idleCursor = "grab",
      onRelease = null,
    } = options;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let isPointerDown = false;
    let isDraggingHorizontally = false;
    let suppressNextClickUntil = 0;
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
        suppressNextClickUntil =
          Date.now() + Math.max(0, Number(clickSuppressionMs) || 0);
      }

      resetDraggingState(didDrag);
    };

    const handleClickCapture = (event) => {
      if (Date.now() >= suppressNextClickUntil) {
        return;
      }
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
  initEditablePageTitles();
  initAndroidInteractiveTextAssist();
  initAndroidKeyboardTransitionCover();
  initAndroidPressFeedback();
  initThemedNativePickerInputs();
  setNativePageReadyMode(isReactNativeNavigationRuntime() ? "manual" : "auto");
  scheduleInitialPagePerfReport();
  scheduleTodoSortPreferenceCoreBackfill();
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
    hidePersistentModalOverlay,
    prepareModalOverlay,
    freezeAndroidModalDismissLayout,
    clearAndroidModalDismissFreeze,
    clearAndroidModalDismissPending,
    resetModalOverlayPresentationState,
    activateModalInteractionShield,
    stopModalContentPropagation,
    bindModalAction,
    bindModalBackdropDismiss,
    showManagedColorPickerDialog,
    bindManagedColorInputProxy,
    setAccentButtonState,
    setAccentButtonGroup,
    enhanceNativeSelect,
    refreshEnhancedSelect,
    enhanceThemedNativePickerInputs,
    openManagedNativePickerForInput,
    bindHorizontalDragScroll,
    bindVerticalDragScroll,
    bindWindowMoveHandle,
    markModalAutofocusRequested,
    rememberModalPreferredInteractiveTextControl,
    markAndroidInteractiveTextFocusIntent,
    clearAndroidInteractiveTextFocusIntent,
    cancelAndroidInteractiveTextFocusWork,
    focusAndroidInteractiveTextControl,
    autofocusInteractiveTextControl,
    resumeAndroidModalAutofocus,
    releaseAndroidInteractiveTextControlFocus,
    initEditablePageTitles,
    getStoredCustomPageTitle,
    setStoredCustomPageTitle,
    mountDesktopWidgetScale,
    blockingOverlayStateEventName: BLOCKING_OVERLAY_STATE_EVENT_NAME,
    shellVisibilityEventName: SHELL_VISIBILITY_EVENT_NAME,
    hasVisibleBlockingOverlay,
    getShellVisibilityState,
    isShellPageActive,
    getAppPageEnterTransitionState,
    normalizeChangedSections,
    hasPeriodOverlap,
    isSerializableEqual,
    pageLoadingOverlayDelayMs: PAGE_LOADING_OVERLAY_DELAY_MS,
    getBlockingMutationOverlayDelayMs,
    createFrameScheduler,
    createDeferredRefreshController,
    createAtomicRefreshController,
    createPageLoadingOverlayController,
    waitForVisualContentStability,
    resolveOfflineAssetUrl,
    positionFloatingMenu,
    measureExpandSurfaceWidth,
    normalizeExpandSurfaceWidthFactor,
    scaleExpandSurfaceConstraint,
    getDefaultExpandSurfaceWidthFactor: () =>
      DEFAULT_EXPAND_SURFACE_WIDTH_FACTOR,
    loadScriptOnce,
    loadStyleOnce,
    syncNativeEdgeBackSwipeExclusion,
    scheduleNativeEdgeBackSwipeExclusionSync,
    markPerfStage: markPagePerfStage,
    getNativePageReadyMode,
    setNativePageReadyMode,
    markNativePageReady,
    confirmDialog,
    alertDialog,
  };
})();
