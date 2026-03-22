;/* manual-native-page-ready */
window.__CONTROLER_NATIVE_PAGE_READY_MODE__ = "manual";

;/* shared/platform-contract.js */
(function initControlerPlatformContract(rootFactory) {
  const globalObject =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
        ? self
        : typeof window !== "undefined"
          ? window
          : typeof global !== "undefined"
            ? global
            : {};
  const contract = rootFactory(globalObject);
  if (typeof module === "object" && module.exports) {
    module.exports = contract;
  }
  globalObject.ControlerPlatformContract = contract;
})(function buildControlerPlatformContract() {
  const WIDGET_KINDS = Object.freeze([
    Object.freeze({
      id: "start-timer",
      name: "开始计时",
      description: "显示一个“开始计时”按钮，点击后进入记录页并打开计时模态框。",
      subtitle: "显示一个“开始计时”按钮，点击后进入记录页并打开计时模态框。",
      page: "index",
      action: "start-timer",
      widgetSection: "timer",
      desktopWindow: Object.freeze({
        width: 300,
        height: 180,
        minWidth: 180,
        minHeight: 110,
      }),
    }),
    Object.freeze({
      id: "write-diary",
      name: "写日记",
      description: "显示一个“写日记”按钮，点击后进入记录页继续今天的日记。",
      subtitle: "显示一个“写日记”按钮，点击后进入记录页。",
      page: "diary",
      action: "new-diary",
      desktopWindow: Object.freeze({
        width: 300,
        height: 180,
        minWidth: 180,
        minHeight: 110,
      }),
    }),
    Object.freeze({
      id: "week-grid",
      name: "一周表格视图",
      description: "在组件中直接查看一周时段分布。",
      subtitle: "按天展示一周的时段分布。",
      page: "stats",
      action: "show-week-grid",
      desktopWindow: Object.freeze({
        width: 420,
        height: 300,
        minWidth: 260,
        minHeight: 180,
      }),
    }),
    Object.freeze({
      id: "day-pie",
      name: "一天的饼状图",
      description: "在组件中直接查看今日各项目的时间占比。",
      subtitle: "按项目查看今天的时间占比。",
      page: "stats",
      action: "show-day-pie",
      desktopWindow: Object.freeze({
        width: 420,
        height: 300,
        minWidth: 260,
        minHeight: 190,
      }),
    }),
    Object.freeze({
      id: "todos",
      name: "待办事项",
      description: "展示今天待办，并支持在组件里直接完成。",
      subtitle: "可直接在小组件里完成今天的待办。",
      page: "todo",
      action: "show-todos",
      desktopWindow: Object.freeze({
        width: 400,
        height: 460,
        minWidth: 260,
        minHeight: 300,
      }),
    }),
    Object.freeze({
      id: "checkins",
      name: "打卡列表",
      description: "展示今天打卡，并支持在组件里直接勾选。",
      subtitle: "可直接在小组件里完成今日打卡。",
      page: "todo",
      action: "show-checkins",
      desktopWindow: Object.freeze({
        width: 400,
        height: 460,
        minWidth: 260,
        minHeight: 300,
      }),
    }),
    Object.freeze({
      id: "week-view",
      name: "周视图",
      description: "在组件中直接查看未来一周的计划安排。",
      subtitle: "未来 7 天的计划安排。",
      page: "plan",
      action: "show-week-view",
      desktopWindow: Object.freeze({
        width: 420,
        height: 320,
        minWidth: 260,
        minHeight: 200,
      }),
    }),
    Object.freeze({
      id: "year-view",
      name: "年视图",
      description: "在组件中直接查看全年目标与时间投入概览。",
      subtitle: "全年记录与年度目标摘要。",
      page: "plan",
      action: "show-year-view",
      desktopWindow: Object.freeze({
        width: 420,
        height: 320,
        minWidth: 260,
        minHeight: 200,
      }),
    }),
  ]);

  const WIDGET_KIND_IDS = Object.freeze(WIDGET_KINDS.map((item) => item.id));
  const LAUNCH_ACTIONS = Object.freeze(
    WIDGET_KINDS.map((item) =>
      Object.freeze({
        id: item.action,
        page: item.page,
        widgetKind: item.id,
      }),
    ),
  );
  const LAUNCH_ACTION_IDS = Object.freeze(
    LAUNCH_ACTIONS.map((item) => item.id),
  );
  const REACT_NATIVE_BRIDGE_METHODS = Object.freeze([
    "getStartUrl",
    "readStorageState",
    "writeStorageState",
    "getStorageStatus",
    "getStorageManifest",
    "getStorageCoreState",
    "getStoragePlanBootstrapState",
    "getAutoBackupStatus",
    "updateAutoBackupSettings",
    "runAutoBackupNow",
    "shareLatestBackup",
    "loadStorageSectionRange",
    "saveStorageSectionRange",
    "replaceStorageCoreState",
    "replaceStorageRecurringPlans",
    "probeStorageStateVersion",
    "exportStorageBundle",
    "importStorageSource",
    "inspectImportSourceFile",
    "previewExternalImport",
    "selectStorageFile",
    "selectStorageDirectory",
    "resetStorageFile",
    "consumeLaunchAction",
    "requestPinWidget",
    "getWidgetPinSupport",
    "consumePinWidgetResult",
    "openHomeScreen",
    "refreshWidgets",
    "exportData",
    "requestNotificationPermission",
    "syncNotificationSchedule",
  ]);

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePlatform(platform) {
    const normalized = String(platform || "").trim().toLowerCase();
    if (!normalized) {
      return "web";
    }
    if (normalized === "darwin" || normalized === "mac" || normalized === "macos") {
      return "darwin";
    }
    if (normalized === "windows" || normalized === "win") {
      return "win32";
    }
    return normalized;
  }

  function buildCapabilities(overrides = {}) {
    return Object.freeze({
      storageSourceSwitch: false,
      bundleExportImport: false,
      nativeReminders: false,
      recordPartitionPatch: false,
      widgets: false,
      widgetKinds: [],
      launchActions: [],
      widgetPinning: false,
      widgetManualAdd: false,
      openHomeScreen: false,
      desktopWidgets: false,
      ...overrides,
      widgetKinds: Array.isArray(overrides.widgetKinds)
        ? [...overrides.widgetKinds]
        : [],
      launchActions: Array.isArray(overrides.launchActions)
        ? [...overrides.launchActions]
        : [],
    });
  }

  function createRuntimeProfile(profile = {}) {
    return Object.freeze({
      runtime: "web",
      platform: "web",
      capabilities: buildCapabilities(),
      ...profile,
      platform: normalizePlatform(profile.platform || "web"),
      capabilities: buildCapabilities(profile.capabilities || {}),
    });
  }

  const WEB_PROFILE = createRuntimeProfile({
    runtime: "web",
    platform: "web",
  });

  const ELECTRON_PROFILE = createRuntimeProfile({
    runtime: "electron",
    platform: "desktop",
    capabilities: {
      storageSourceSwitch: true,
      bundleExportImport: true,
      nativeReminders: true,
      recordPartitionPatch: true,
      widgets: true,
      widgetKinds: WIDGET_KIND_IDS,
      launchActions: LAUNCH_ACTION_IDS,
      widgetPinning: false,
      widgetManualAdd: false,
      openHomeScreen: false,
      desktopWidgets: true,
    },
  });

  const ANDROID_NATIVE_PROFILE = createRuntimeProfile({
    runtime: "react-native",
    platform: "android",
    capabilities: {
      storageSourceSwitch: true,
      bundleExportImport: true,
      nativeReminders: true,
      recordPartitionPatch: true,
      widgets: true,
      widgetKinds: WIDGET_KIND_IDS,
      launchActions: LAUNCH_ACTION_IDS,
      widgetPinning: true,
      widgetManualAdd: true,
      openHomeScreen: true,
      desktopWidgets: false,
    },
  });

  const IOS_NATIVE_PROFILE = createRuntimeProfile({
    runtime: "react-native",
    platform: "ios",
    capabilities: {
      storageSourceSwitch: true,
      bundleExportImport: true,
      nativeReminders: true,
      recordPartitionPatch: false,
      widgets: true,
      widgetKinds: WIDGET_KIND_IDS,
      launchActions: LAUNCH_ACTION_IDS,
      widgetPinning: false,
      widgetManualAdd: true,
      openHomeScreen: false,
      desktopWidgets: false,
    },
  });

  function getWidgetKinds() {
    return cloneValue(WIDGET_KINDS);
  }

  function getWidgetKindIds() {
    return [...WIDGET_KIND_IDS];
  }

  function getWidgetById(kind) {
    const normalizedKind = String(kind || "").trim();
    const item = WIDGET_KINDS.find((entry) => entry.id === normalizedKind);
    return item ? cloneValue(item) : null;
  }

  function getLaunchActions() {
    return cloneValue(LAUNCH_ACTIONS);
  }

  function getLaunchActionIds() {
    return [...LAUNCH_ACTION_IDS];
  }

  function getReactNativeBridgeMethodNames() {
    return [...REACT_NATIVE_BRIDGE_METHODS];
  }

  function getElectronRuntimeProfile(platform) {
    const normalizedPlatform = normalizePlatform(platform || "desktop");
    return createRuntimeProfile({
      ...ELECTRON_PROFILE,
      platform: normalizedPlatform === "web" ? "desktop" : normalizedPlatform,
    });
  }

  function getReactNativeRuntimeProfile(platform) {
    const normalizedPlatform = normalizePlatform(platform);
    if (normalizedPlatform === "android") {
      return ANDROID_NATIVE_PROFILE;
    }
    if (normalizedPlatform === "ios") {
      return IOS_NATIVE_PROFILE;
    }
    return WEB_PROFILE;
  }

  function getRuntimeProfile(options = {}) {
    if (options && typeof options === "object") {
      if (options.isElectron) {
        return getElectronRuntimeProfile(options.platform);
      }
      if (options.isReactNativeApp) {
        return getReactNativeRuntimeProfile(options.platform);
      }
    }
    return WEB_PROFILE;
  }

  return Object.freeze({
    version: "2026-03-21",
    widgetKinds: WIDGET_KINDS,
    widgetKindIds: WIDGET_KIND_IDS,
    launchActions: LAUNCH_ACTIONS,
    launchActionIds: LAUNCH_ACTION_IDS,
    reactNativeBridgeMethods: REACT_NATIVE_BRIDGE_METHODS,
    getWidgetKinds,
    getWidgetKindIds,
    getWidgetById,
    getLaunchActions,
    getLaunchActionIds,
    getReactNativeBridgeMethodNames,
    getElectronRuntimeProfile,
    getReactNativeRuntimeProfile,
    getRuntimeProfile,
  });
});


;/* pages/rn-bridge.js */
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


;/* pages/storage-bundle.js */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerStorageBundle = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORMAT_VERSION = 1;
  const BUNDLE_MODE = "directory-bundle";
  const PERIOD_UNIT = "month";
  const UNDATED_PERIOD_ID = "undated";
  const CORE_FILE_NAME = "core.json";
  const MANIFEST_FILE_NAME = "bundle-manifest.json";
  const RECURRING_PLANS_FILE_NAME = "plans-recurring.json";
  const PROJECT_DURATION_CACHE_VERSION = 1;
  const PROJECT_DURATION_CACHE_VERSION_KEY = "durationCacheVersion";
  const PROJECT_DIRECT_DURATION_KEY = "cachedDirectDurationMs";
  const PROJECT_TOTAL_DURATION_KEY = "cachedTotalDurationMs";
  const PARTITIONED_SECTIONS = Object.freeze([
    "records",
    "diaryEntries",
    "dailyCheckins",
    "checkins",
    "plans",
  ]);
  const CORE_SECTION_KEYS = Object.freeze([
    "projects",
    "todos",
    "checkinItems",
    "yearlyGoals",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
    "createdAt",
    "lastModified",
    "storagePath",
    "storageDirectory",
    "userDataPath",
    "documentsPath",
    "syncMeta",
  ]);
  const SECTION_DIRECTORY_MAP = Object.freeze({
    records: "records",
    diaryEntries: "diaryEntries",
    dailyCheckins: "dailyCheckins",
    checkins: "checkins",
    plans: "plans",
  });
  const SECTION_REQUIRED_ARRAY_KEYS = Object.freeze([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "diaryEntries",
    "diaryCategories",
  ]);

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function ensureObject(value, fallback = {}) {
    return isPlainObject(value) ? value : fallback;
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateToPeriodId(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
  }

  function normalizeDateInput(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [yearText, monthText, dayText] = normalized.split("-");
      const year = Number.parseInt(yearText, 10);
      const month = Number.parseInt(monthText, 10);
      const day = Number.parseInt(dayText, 10);
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return null;
      }
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeDateKey(value) {
    const parsed = normalizeDateInput(value);
    if (!parsed) {
      return "";
    }
    return `${parsed.getFullYear()}-${padNumber(parsed.getMonth() + 1)}-${padNumber(parsed.getDate())}`;
  }

  function normalizePeriodId(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }
    if (normalized === UNDATED_PERIOD_ID) {
      return normalized;
    }
    return /^\d{4}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function compareDates(left, right) {
    const leftValue = normalizeDateInput(left)?.getTime() || 0;
    const rightValue = normalizeDateInput(right)?.getTime() || 0;
    return leftValue - rightValue;
  }

  function sortPartitionItems(section, items = []) {
    const nextItems = ensureArray(items).slice();
    switch (section) {
      case "records":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.endTime || left?.timestamp || left?.startTime, right?.endTime || right?.timestamp || right?.startTime),
        );
        break;
      case "plans":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.date, right?.date) ||
            String(left?.startTime || "").localeCompare(String(right?.startTime || "")),
        );
        break;
      case "diaryEntries":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.date || left?.updatedAt, right?.date || right?.updatedAt),
        );
        break;
      case "dailyCheckins":
        nextItems.sort((left, right) => compareDates(left?.date, right?.date));
        break;
      case "checkins":
        nextItems.sort((left, right) => compareDates(left?.updatedAt || left?.time, right?.updatedAt || right?.time));
        break;
      default:
        break;
    }
    return nextItems;
  }

  function normalizeDurationMs(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.round(Number(value) || 0));
  }

  function collectProjectCycleIds(parentById = new Map()) {
    const cycleIds = new Set();
    const resolvedIds = new Set();

    parentById.forEach((_parentId, projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId || resolvedIds.has(normalizedProjectId)) {
        return;
      }

      const trail = [];
      const visitedAt = new Map();
      let currentId = normalizedProjectId;

      while (
        currentId &&
        parentById.has(currentId) &&
        !resolvedIds.has(currentId)
      ) {
        if (visitedAt.has(currentId)) {
          const cycleStartIndex = visitedAt.get(currentId);
          trail.slice(cycleStartIndex).forEach((cycleProjectId) => {
            cycleIds.add(cycleProjectId);
          });
          break;
        }

        visitedAt.set(currentId, trail.length);
        trail.push(currentId);
        currentId = String(parentById.get(currentId) || "").trim();
      }

      trail.forEach((trailProjectId) => {
        resolvedIds.add(trailProjectId);
      });
    });

    return cycleIds;
  }

  function repairProjectHierarchy(projects = []) {
    const nextProjects = ensureArray(projects).map((project) =>
      cloneValue(project && typeof project === "object" ? project : {}),
    );
    const byId = new Map();
    const requestedParentById = new Map();
    let repaired = false;

    nextProjects.forEach((project, index) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || byId.has(projectId)) {
        return;
      }
      byId.set(projectId, {
        index,
        project,
      });
    });

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || !byId.has(projectId)) {
        return;
      }

      const rawParentId = String(project?.parentId || "").trim();
      if (
        !rawParentId ||
        rawParentId === projectId ||
        !byId.has(rawParentId)
      ) {
        requestedParentById.set(projectId, null);
        if (rawParentId) {
          repaired = true;
        }
        return;
      }

      requestedParentById.set(projectId, rawParentId);
    });

    const cycleIds = collectProjectCycleIds(requestedParentById);
    const resolvedStateById = new Map();
    const resolvingIds = new Set();

    const resolveProjectState = (projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId || !byId.has(normalizedProjectId)) {
        return {
          parentId: null,
          level: 1,
          level2AncestorId: null,
        };
      }

      if (resolvedStateById.has(normalizedProjectId)) {
        return resolvedStateById.get(normalizedProjectId);
      }

      if (resolvingIds.has(normalizedProjectId)) {
        repaired = true;
        const fallbackState = {
          parentId: null,
          level: 1,
          level2AncestorId: null,
        };
        resolvedStateById.set(normalizedProjectId, fallbackState);
        return fallbackState;
      }

      resolvingIds.add(normalizedProjectId);
      let parentId = requestedParentById.get(normalizedProjectId) || null;
      if (cycleIds.has(normalizedProjectId)) {
        parentId = null;
        repaired = true;
      }

      let resolvedState = {
        parentId: null,
        level: 1,
        level2AncestorId: null,
      };

      if (parentId) {
        const parentState = resolveProjectState(parentId);
        if (parentState.level === 1) {
          resolvedState = {
            parentId,
            level: 2,
            level2AncestorId: normalizedProjectId,
          };
        } else if (parentState.level === 2) {
          resolvedState = {
            parentId,
            level: 3,
            level2AncestorId: parentState.level2AncestorId || parentId,
          };
        } else if (parentState.level >= 3) {
          const flattenedParentId = String(
            parentState.level2AncestorId || "",
          ).trim();
          if (flattenedParentId && flattenedParentId !== normalizedProjectId) {
            resolvedState = {
              parentId: flattenedParentId,
              level: 3,
              level2AncestorId: flattenedParentId,
            };
            repaired = true;
          } else {
            resolvedState = {
              parentId: null,
              level: 1,
              level2AncestorId: null,
            };
            repaired = true;
          }
        }
      }

      resolvingIds.delete(normalizedProjectId);
      resolvedStateById.set(normalizedProjectId, resolvedState);
      return resolvedState;
    };

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || !byId.has(projectId)) {
        return;
      }

      const resolvedState = resolveProjectState(projectId);
      const previousParentId = String(project?.parentId || "").trim() || null;
      const nextParentId = resolvedState.parentId || null;
      const previousLevel = Number.parseInt(project?.level, 10);
      const nextLevel = resolvedState.level;

      if (previousParentId !== nextParentId) {
        repaired = true;
      }
      if (previousLevel !== nextLevel) {
        repaired = true;
      }

      project.parentId = nextParentId;
      project.level = nextLevel;
    });

    return {
      projects: nextProjects,
      repaired,
    };
  }

  function parseSpendTimeToMs(spendtime) {
    if (typeof spendtime !== "string") {
      return 0;
    }

    const text = spendtime.trim();
    if (!text) {
      return 0;
    }

    let totalMs = 0;
    const addMatches = (pattern, multiplier) => {
      let match = pattern.exec(text);
      while (match) {
        totalMs += normalizeDurationMs(Number.parseInt(match[1], 10) * multiplier);
        match = pattern.exec(text);
      }
    };

    addMatches(/(\d+)\s*天/g, 24 * 60 * 60 * 1000);
    addMatches(/(\d+)\s*(?:小时|h(?:ours?)?)/gi, 60 * 60 * 1000);
    addMatches(/(\d+)\s*(?:分钟|min(?:ute)?s?)/gi, 60 * 1000);

    if (
      /小于\s*1\s*(?:分钟|min)/i.test(text) ||
      /less\s+than\s+1\s*min/i.test(text) ||
      /<\s*1\s*(?:分钟|min)/i.test(text)
    ) {
      totalMs += 30 * 1000;
    }

    return totalMs;
  }

  function getRecordDurationMs(record = {}) {
    if (!record || typeof record !== "object") {
      return 0;
    }

    if (Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      return normalizeDurationMs(record.durationMs);
    }

    if (
      Number.isFinite(record?.durationMeta?.recordedMs) &&
      record.durationMeta.recordedMs >= 0
    ) {
      return normalizeDurationMs(record.durationMeta.recordedMs);
    }

    const startTime = normalizeDateInput(record.startTime);
    const endTime =
      normalizeDateInput(record.endTime) ||
      normalizeDateInput(record.timestamp) ||
      normalizeDateInput(record.sptTime);

    if (startTime && endTime) {
      return normalizeDurationMs(endTime.getTime() - startTime.getTime());
    }

    return parseSpendTimeToMs(record.spendtime);
  }

  function normalizeProjectDurationCache(project = {}) {
    const source =
      project && typeof project === "object" && !Array.isArray(project) ? project : {};
    return {
      ...source,
      [PROJECT_DURATION_CACHE_VERSION_KEY]: PROJECT_DURATION_CACHE_VERSION,
      [PROJECT_DIRECT_DURATION_KEY]: normalizeDurationMs(
        source[PROJECT_DIRECT_DURATION_KEY],
      ),
      [PROJECT_TOTAL_DURATION_KEY]: normalizeDurationMs(
        source[PROJECT_TOTAL_DURATION_KEY],
      ),
    };
  }

  function hasValidProjectDurationCache(project = {}) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      return false;
    }
    return (
      Number(project[PROJECT_DURATION_CACHE_VERSION_KEY]) ===
        PROJECT_DURATION_CACHE_VERSION &&
      Number.isFinite(project[PROJECT_DIRECT_DURATION_KEY]) &&
      project[PROJECT_DIRECT_DURATION_KEY] >= 0 &&
      Number.isFinite(project[PROJECT_TOTAL_DURATION_KEY]) &&
      project[PROJECT_TOTAL_DURATION_KEY] >= 0
    );
  }

  function projectsHaveValidDurationCache(projects = []) {
    return ensureArray(projects).every((project) =>
      hasValidProjectDurationCache(project),
    );
  }

  function buildProjectDurationContext(projects = []) {
    const hierarchyRepairResult = repairProjectHierarchy(projects);
    const normalizedProjects = ensureArray(hierarchyRepairResult.projects).map(
      (project) => normalizeProjectDurationCache(project),
    );
    const byId = new Map();
    const byName = new Map();
    const childrenByParent = new Map();
    const roots = [];

    normalizedProjects.forEach((project, index) => {
      const projectId = String(project?.id || "").trim();
      const projectName = String(project?.name || "").trim();
      if (projectId) {
        byId.set(projectId, {
          index,
          project,
        });
      }
      if (projectName) {
        byName.set(projectName, {
          index,
          project,
        });
      }
    });

    normalizedProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      const parentId = String(project?.parentId || "").trim();
      if (projectId && parentId && parentId !== projectId && byId.has(parentId)) {
        if (!childrenByParent.has(parentId)) {
          childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(projectId);
        return;
      }
      if (projectId) {
        roots.push(projectId);
      }
    });

    return {
      projects: normalizedProjects,
      byId,
      byName,
      childrenByParent,
      roots,
    };
  }

  function findProjectIndexForRecord(record = {}, contextOrProjects = []) {
    const context =
      contextOrProjects &&
      contextOrProjects.byId instanceof Map &&
      contextOrProjects.byName instanceof Map
        ? contextOrProjects
        : buildProjectDurationContext(contextOrProjects);

    const recordProjectId = String(record?.projectId || "").trim();
    if (recordProjectId && context.byId.has(recordProjectId)) {
      return context.byId.get(recordProjectId).index;
    }

    const recordName = String(record?.name || "").trim();
    if (!recordName) {
      return -1;
    }

    if (context.byName.has(recordName)) {
      return context.byName.get(recordName).index;
    }

    const leafName = recordName
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();

    if (leafName && context.byName.has(leafName)) {
      return context.byName.get(leafName).index;
    }

    return -1;
  }

  function attachProjectIdsToRecords(records = [], projects = []) {
    const context = buildProjectDurationContext(projects);
    return ensureArray(records).map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        return cloneValue(record);
      }

      const normalizedProjectId = String(record.projectId || "").trim();
      if (normalizedProjectId) {
        return cloneValue(record);
      }

      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return cloneValue(record);
      }

      const targetProject = context.projects[projectIndex];
      return {
        ...cloneValue(record),
        projectId: String(targetProject?.id || "").trim() || null,
      };
    });
  }

  function recalculateProjectDurationTotals(projects = []) {
    const context = buildProjectDurationContext(projects);
    const computed = new Map();
    const visiting = new Set();

    const computeTotal = (projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId) {
        return 0;
      }
      if (computed.has(normalizedProjectId)) {
        return computed.get(normalizedProjectId);
      }

      const entry = context.byId.get(normalizedProjectId);
      if (!entry) {
        return 0;
      }

      if (visiting.has(normalizedProjectId)) {
        return normalizeDurationMs(
          entry.project[PROJECT_DIRECT_DURATION_KEY],
        );
      }

      visiting.add(normalizedProjectId);
      let totalMs = normalizeDurationMs(entry.project[PROJECT_DIRECT_DURATION_KEY]);
      (context.childrenByParent.get(normalizedProjectId) || []).forEach(
        (childId) => {
          totalMs += computeTotal(childId);
        },
      );
      visiting.delete(normalizedProjectId);

      const normalizedTotalMs = normalizeDurationMs(totalMs);
      entry.project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      entry.project[PROJECT_TOTAL_DURATION_KEY] = normalizedTotalMs;
      computed.set(normalizedProjectId, normalizedTotalMs);
      return normalizedTotalMs;
    };

    context.projects.forEach((project) => {
      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        project[PROJECT_DIRECT_DURATION_KEY],
      );
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    context.roots.forEach((projectId) => {
      computeTotal(projectId);
    });

    context.projects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId) {
        project[PROJECT_TOTAL_DURATION_KEY] = normalizeDurationMs(
          project[PROJECT_DIRECT_DURATION_KEY],
        );
        return;
      }
      if (!computed.has(projectId)) {
        computeTotal(projectId);
      }
    });

    return context.projects;
  }

  function rebuildProjectDurationCaches(projects = [], records = []) {
    const context = buildProjectDurationContext(projects);
    context.projects.forEach((project) => {
      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = 0;
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    attachProjectIdsToRecords(records, context.projects).forEach((record) => {
      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return;
      }
      const targetProject = context.projects[projectIndex];
      targetProject[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        targetProject[PROJECT_DIRECT_DURATION_KEY] + getRecordDurationMs(record),
      );
    });

    return recalculateProjectDurationTotals(context.projects);
  }

  function reconcileProjectDurationCaches(projects = [], previousProjects = []) {
    const nextProjects = ensureArray(projects).map((project) =>
      normalizeProjectDurationCache(project),
    );
    const previousContext = buildProjectDurationContext(previousProjects);
    const previousByName = new Map();

    previousContext.projects.forEach((project) => {
      const projectName = String(project?.name || "").trim();
      if (!projectName) {
        return;
      }
      if (!previousByName.has(projectName)) {
        previousByName.set(projectName, project);
        return;
      }
      previousByName.set(projectName, null);
    });

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      const projectName = String(project?.name || "").trim();
      const matchedById = projectId
        ? previousContext.byId.get(projectId)?.project || null
        : null;
      const matchedByName =
        !matchedById && projectName ? previousByName.get(projectName) || null : null;
      const matchedProject = matchedById || matchedByName;

      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        matchedProject?.[PROJECT_DIRECT_DURATION_KEY],
      );
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    return recalculateProjectDurationTotals(nextProjects);
  }

  function applyProjectRecordDurationChanges(projects = [], changes = {}) {
    const context = buildProjectDurationContext(projects);
    const removedRecords = attachProjectIdsToRecords(
      ensureArray(changes?.removedRecords),
      context.projects,
    );
    const addedRecords = attachProjectIdsToRecords(
      ensureArray(changes?.addedRecords),
      context.projects,
    );

    const applyChange = (record, factor) => {
      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return;
      }
      const targetProject = context.projects[projectIndex];
      const nextDirectMs =
        normalizeDurationMs(targetProject[PROJECT_DIRECT_DURATION_KEY]) +
        factor * getRecordDurationMs(record);
      targetProject[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(nextDirectMs);
    };

    removedRecords.forEach((record) => {
      applyChange(record, -1);
    });
    addedRecords.forEach((record) => {
      applyChange(record, 1);
    });

    return recalculateProjectDurationTotals(context.projects);
  }

  function createBaseSyncMeta(syncMeta = {}, options = {}) {
    const source = ensureObject(syncMeta);
    const fileName =
      typeof options.fileName === "string" && options.fileName.trim()
        ? options.fileName.trim()
        : source.fileName || "controler-data.json";
    return {
      mode: source.mode || "directory-bundle",
      fileName,
      autoSyncEnabled: source.autoSyncEnabled !== false,
      lastSavedAt:
        typeof source.lastSavedAt === "string" && source.lastSavedAt
          ? source.lastSavedAt
          : null,
      lastTriggeredAt:
        typeof source.lastTriggeredAt === "string" && source.lastTriggeredAt
          ? source.lastTriggeredAt
          : null,
      lastFlushStartedAt:
        typeof source.lastFlushStartedAt === "string" && source.lastFlushStartedAt
          ? source.lastFlushStartedAt
          : null,
      lastFlushCompletedAt:
        typeof source.lastFlushCompletedAt === "string" &&
        source.lastFlushCompletedAt
          ? source.lastFlushCompletedAt
          : null,
      pendingWriteCount: Number.isFinite(source.pendingWriteCount)
        ? Math.max(0, Number(source.pendingWriteCount))
        : 0,
    };
  }

  function createEmptyLegacyState(options = {}) {
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : new Date().toISOString();
    return {
      projects: [],
      records: [],
      plans: [],
      todos: [],
      checkinItems: [],
      dailyCheckins: [],
      checkins: [],
      yearlyGoals: {},
      diaryEntries: [],
      diaryCategories: [],
      customThemes: [],
      builtInThemeOverrides: {},
      selectedTheme: "default",
      createdAt: now,
      lastModified: now,
      storagePath:
        typeof options.storagePath === "string" ? options.storagePath : null,
      storageDirectory:
        typeof options.storageDirectory === "string"
          ? options.storageDirectory
          : null,
      userDataPath:
        typeof options.userDataPath === "string" ? options.userDataPath : null,
      documentsPath:
        typeof options.documentsPath === "string" ? options.documentsPath : null,
      syncMeta: createBaseSyncMeta(options.syncMeta, {
        fileName: options.fileName,
      }),
    };
  }

  function createEmptyBundle(options = {}) {
    const baseState = createEmptyLegacyState(options);
    return splitLegacyState(baseState, {
      ...options,
      legacyBackups: ensureArray(options.legacyBackups),
    });
  }

  function isRecurringPlan(item) {
    const repeatValue = String(item?.repeat || "").trim().toLowerCase();
    return !!repeatValue && repeatValue !== "none";
  }

  function getSectionItemDate(section, item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    switch (section) {
      case "records":
        return (
          normalizeDateInput(item.endTime) ||
          normalizeDateInput(item.timestamp) ||
          normalizeDateInput(item.startTime)
        );
      case "diaryEntries":
        return (
          normalizeDateInput(item.date) || normalizeDateInput(item.updatedAt)
        );
      case "dailyCheckins":
        return normalizeDateInput(item.date);
      case "checkins":
        return (
          normalizeDateInput(item.updatedAt) || normalizeDateInput(item.time)
        );
      case "plans":
        return normalizeDateInput(item.date);
      default:
        return null;
    }
  }

  function getPeriodIdForSectionItem(section, item) {
    if (section === "plans" && isRecurringPlan(item)) {
      return "";
    }
    const itemDate = getSectionItemDate(section, item);
    return formatDateToPeriodId(itemDate) || UNDATED_PERIOD_ID;
  }

  function getPartitionRelativePath(section, periodId) {
    const sectionDirectory = SECTION_DIRECTORY_MAP[section];
    if (!sectionDirectory) {
      throw new Error(`Unsupported section: ${section}`);
    }
    const normalizedPeriodId = normalizePeriodId(periodId);
    if (!normalizedPeriodId) {
      throw new Error(`Unsupported periodId for ${section}: ${periodId}`);
    }
    if (normalizedPeriodId === UNDATED_PERIOD_ID) {
      return `${sectionDirectory}/undated.json`;
    }
    const [yearText] = normalizedPeriodId.split("-");
    return `${sectionDirectory}/${yearText}/${normalizedPeriodId}.json`;
  }

  function buildPartitionFingerprint(section, periodId, items = []) {
    const nextItems = sortPartitionItems(section, items);
    const minDate =
      nextItems.length > 0
        ? normalizeDateKey(getSectionItemDate(section, nextItems[0]))
        : "";
    const maxDate =
      nextItems.length > 0
        ? normalizeDateKey(
            getSectionItemDate(section, nextItems[nextItems.length - 1]),
          )
        : "";
    return `${section}:${periodId}:${nextItems.length}:${minDate}:${maxDate}:${JSON.stringify(nextItems).length}`;
  }

  function createPartitionEnvelope(section, periodId, items = [], options = {}) {
    const normalizedPeriodId = normalizePeriodId(periodId) || UNDATED_PERIOD_ID;
    const nextItems = sortPartitionItems(section, items);
    const minDate =
      nextItems.length > 0
        ? normalizeDateKey(getSectionItemDate(section, nextItems[0]))
        : "";
    const maxDate =
      nextItems.length > 0
        ? normalizeDateKey(
            getSectionItemDate(section, nextItems[nextItems.length - 1]),
          )
        : "";
    return {
      formatVersion: FORMAT_VERSION,
      section,
      periodUnit: PERIOD_UNIT,
      periodId: normalizedPeriodId,
      count: nextItems.length,
      minDate: minDate || null,
      maxDate: maxDate || null,
      fingerprint:
        typeof options.fingerprint === "string" && options.fingerprint
          ? options.fingerprint
          : buildPartitionFingerprint(section, normalizedPeriodId, nextItems),
      items: cloneValue(nextItems),
    };
  }

  function createSectionManifest(section, partitions = new Map()) {
    const normalizedPartitions = [];
    partitions.forEach((items, periodId) => {
      const nextItems = sortPartitionItems(section, items);
      if (!nextItems.length) {
        return;
      }
      const envelope = createPartitionEnvelope(section, periodId, nextItems);
      normalizedPartitions.push({
        periodId: envelope.periodId,
        file: getPartitionRelativePath(section, envelope.periodId),
        count: envelope.count,
        minDate: envelope.minDate,
        maxDate: envelope.maxDate,
        fingerprint: envelope.fingerprint,
      });
    });
    normalizedPartitions.sort((left, right) =>
      String(left.periodId).localeCompare(String(right.periodId)),
    );
    return {
      periodUnit: PERIOD_UNIT,
      partitions: normalizedPartitions,
    };
  }

  function splitLegacyState(rawState = {}, options = {}) {
    const source = ensureObject(rawState);
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : source.lastModified || source.createdAt || new Date().toISOString();
    const normalizedGuideState = ensureObject(source.guideState, null);
    const core = {
      projects: ensureArray(source.projects),
      todos: ensureArray(source.todos),
      checkinItems: ensureArray(source.checkinItems),
      yearlyGoals: ensureObject(source.yearlyGoals, {}),
      diaryCategories: ensureArray(source.diaryCategories),
      customThemes: ensureArray(source.customThemes),
      builtInThemeOverrides: ensureObject(source.builtInThemeOverrides, {}),
      selectedTheme:
        typeof source.selectedTheme === "string" && source.selectedTheme.trim()
          ? source.selectedTheme.trim()
          : "default",
      createdAt:
        typeof source.createdAt === "string" && source.createdAt
          ? source.createdAt
          : now,
      lastModified:
        typeof source.lastModified === "string" && source.lastModified
          ? source.lastModified
          : now,
      storagePath:
        typeof options.storagePath === "string"
          ? options.storagePath
          : typeof source.storagePath === "string"
            ? source.storagePath
            : null,
      storageDirectory:
        typeof options.storageDirectory === "string"
          ? options.storageDirectory
          : typeof source.storageDirectory === "string"
            ? source.storageDirectory
            : null,
      userDataPath:
        typeof options.userDataPath === "string"
          ? options.userDataPath
          : typeof source.userDataPath === "string"
            ? source.userDataPath
            : null,
      documentsPath:
        typeof options.documentsPath === "string"
          ? options.documentsPath
          : typeof source.documentsPath === "string"
            ? source.documentsPath
            : null,
      syncMeta: createBaseSyncMeta(source.syncMeta, {
        fileName:
          typeof options.fileName === "string" ? options.fileName : undefined,
      }),
    };
    if (normalizedGuideState) {
      core.guideState = normalizedGuideState;
    }
    const recurringPlans = [];
    const partitionMap = {};
    PARTITIONED_SECTIONS.forEach((section) => {
      partitionMap[section] = new Map();
      ensureArray(source[section]).forEach((item) => {
        if (section === "plans" && isRecurringPlan(item)) {
          recurringPlans.push(cloneValue(item));
          return;
        }
        const periodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
        if (!partitionMap[section].has(periodId)) {
          partitionMap[section].set(periodId, []);
        }
        partitionMap[section].get(periodId).push(cloneValue(item));
      });
    });
    const manifest = {
      formatVersion: FORMAT_VERSION,
      bundleMode: BUNDLE_MODE,
      createdAt: core.createdAt,
      lastModified: core.lastModified,
      sections: {
        core: {
          file: CORE_FILE_NAME,
        },
        plansRecurring: {
          file: RECURRING_PLANS_FILE_NAME,
          count: recurringPlans.length,
        },
      },
      legacyBackups: ensureArray(options.legacyBackups).slice(),
    };
    PARTITIONED_SECTIONS.forEach((section) => {
      manifest.sections[section] = createSectionManifest(section, partitionMap[section]);
    });
    return {
      manifest,
      core,
      recurringPlans,
      partitionMap,
    };
  }

  function buildLegacyStateFromBundle(bundle = {}) {
    const core = ensureObject(bundle.core, {});
    const manifest = ensureObject(bundle.manifest, {});
    const partitionMap = ensureObject(bundle.partitionMap, {});
    const nextState = createEmptyLegacyState({
      now: core.lastModified || core.createdAt,
      storagePath: core.storagePath,
      storageDirectory: core.storageDirectory,
      userDataPath: core.userDataPath,
      documentsPath: core.documentsPath,
      syncMeta: core.syncMeta,
    });
    CORE_SECTION_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(core, key)) {
        nextState[key] = cloneValue(core[key]);
      }
    });
    PARTITIONED_SECTIONS.forEach((section) => {
      const sectionPartitions = partitionMap[section];
      const items = [];
      if (sectionPartitions instanceof Map) {
        Array.from(sectionPartitions.values()).forEach((partitionItems) => {
          items.push(...ensureArray(partitionItems).map((item) => cloneValue(item)));
        });
      } else if (isPlainObject(sectionPartitions)) {
        Object.keys(sectionPartitions).forEach((periodId) => {
          items.push(
            ...ensureArray(sectionPartitions[periodId]).map((item) =>
              cloneValue(item),
            ),
          );
        });
      }
      nextState[section] = sortPartitionItems(section, items);
    });
    nextState.plans = sortPartitionItems("plans", [
      ...ensureArray(nextState.plans),
      ...ensureArray(bundle.recurringPlans).map((item) => cloneValue(item)),
    ]);
    if (!nextState.createdAt) {
      nextState.createdAt = manifest.createdAt || new Date().toISOString();
    }
    if (!nextState.lastModified) {
      nextState.lastModified = manifest.lastModified || nextState.createdAt;
    }
    SECTION_REQUIRED_ARRAY_KEYS.forEach((key) => {
      nextState[key] = ensureArray(nextState[key]);
    });
    nextState.customThemes = ensureArray(nextState.customThemes);
    nextState.yearlyGoals = ensureObject(nextState.yearlyGoals, {});
    nextState.builtInThemeOverrides = ensureObject(
      nextState.builtInThemeOverrides,
      {},
    );
    nextState.selectedTheme =
      typeof nextState.selectedTheme === "string" &&
      nextState.selectedTheme.trim()
        ? nextState.selectedTheme.trim()
        : "default";
    nextState.syncMeta = createBaseSyncMeta(nextState.syncMeta);
    return nextState;
  }

  function getPeriodIdsForRange(startDate, endDate) {
    const start = normalizeDateInput(startDate);
    const end = normalizeDateInput(endDate);
    if (!start || !end) {
      return [];
    }
    const lower = start.getTime() <= end.getTime() ? start : end;
    const upper = start.getTime() <= end.getTime() ? end : start;
    const cursor = new Date(lower.getFullYear(), lower.getMonth(), 1);
    const target = new Date(upper.getFullYear(), upper.getMonth(), 1);
    const results = [];
    while (cursor.getTime() <= target.getTime()) {
      results.push(formatDateToPeriodId(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return results;
  }

  function normalizeRangeInput(scope = {}) {
    const source = ensureObject(scope, {});
    const periodIds = Array.isArray(source.periodIds)
      ? source.periodIds
          .map((periodId) => normalizePeriodId(periodId))
          .filter(Boolean)
      : [];
    if (periodIds.length) {
      return {
        periodIds,
        startDate: null,
        endDate: null,
      };
    }
    const startDate = normalizeDateKey(source.startDate || source.start);
    const endDate = normalizeDateKey(source.endDate || source.end);
    return {
      periodIds:
        startDate && endDate ? getPeriodIdsForRange(startDate, endDate) : [],
      startDate: startDate || null,
      endDate: endDate || null,
    };
  }

  function normalizePartitionEnvelope(section, rawEnvelope = {}, fallbackPeriodId = "") {
    const source = ensureObject(rawEnvelope, {});
    const periodId =
      normalizePeriodId(source.periodId) ||
      normalizePeriodId(fallbackPeriodId) ||
      UNDATED_PERIOD_ID;
    const items = ensureArray(source.items);
    return createPartitionEnvelope(section, periodId, items, {
      fingerprint:
        typeof source.fingerprint === "string" ? source.fingerprint : "",
    });
  }

  function normalizeManifest(rawManifest = {}, options = {}) {
    const source = ensureObject(rawManifest, {});
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : new Date().toISOString();
    const sections = ensureObject(source.sections, {});
    const manifest = {
      formatVersion: FORMAT_VERSION,
      bundleMode: BUNDLE_MODE,
      createdAt:
        typeof source.createdAt === "string" && source.createdAt
          ? source.createdAt
          : now,
      lastModified:
        typeof source.lastModified === "string" && source.lastModified
          ? source.lastModified
          : now,
      sections: {
        core: {
          file:
            typeof sections.core?.file === "string" && sections.core.file
              ? sections.core.file
              : CORE_FILE_NAME,
        },
        plansRecurring: {
          file:
            typeof sections.plansRecurring?.file === "string" &&
            sections.plansRecurring.file
              ? sections.plansRecurring.file
              : RECURRING_PLANS_FILE_NAME,
          count: Number.isFinite(sections.plansRecurring?.count)
            ? Math.max(0, Number(sections.plansRecurring.count))
            : 0,
        },
      },
      legacyBackups: ensureArray(source.legacyBackups),
    };
    PARTITIONED_SECTIONS.forEach((section) => {
      const rawSection = ensureObject(sections[section], {});
      const partitions = ensureArray(rawSection.partitions)
        .map((partition) => ({
          periodId: normalizePeriodId(partition?.periodId),
          file:
            typeof partition?.file === "string" && partition.file
              ? partition.file
              : "",
          count: Number.isFinite(partition?.count)
            ? Math.max(0, Number(partition.count))
            : 0,
          minDate:
            typeof partition?.minDate === "string" && partition.minDate
              ? partition.minDate
              : null,
          maxDate:
            typeof partition?.maxDate === "string" && partition.maxDate
              ? partition.maxDate
              : null,
          fingerprint:
            typeof partition?.fingerprint === "string" && partition.fingerprint
              ? partition.fingerprint
              : "",
        }))
        .filter((partition) => partition.periodId && partition.file);
      manifest.sections[section] = {
        periodUnit: PERIOD_UNIT,
        partitions,
      };
    });
    return manifest;
  }

  function buildPartitionMergeKey(section, item = {}) {
    const source = ensureObject(item, {});
    if (source.id) {
      return `id:${String(source.id)}`;
    }
    switch (section) {
      case "records":
        return [
          source.projectId || "",
          source.name || "",
          source.startTime || "",
          source.endTime || "",
          source.timestamp || "",
          source.spendtime || "",
        ].join("|");
      case "diaryEntries":
        return [source.date || "", source.title || "", source.updatedAt || ""].join("|");
      case "dailyCheckins":
        return [source.itemId || "", source.date || ""].join("|");
      case "checkins":
        return [source.todoId || "", source.time || "", source.message || ""].join("|");
      case "plans":
        return [
          source.name || "",
          source.date || "",
          source.startTime || "",
          source.endTime || "",
          source.repeat || "",
        ].join("|");
      default:
        return JSON.stringify(source);
    }
  }

  function mergePartitionItems(section, existingItems = [], incomingItems = [], mode = "replace") {
    if (mode !== "merge") {
      return sortPartitionItems(section, incomingItems);
    }
    const merged = new Map();
    sortPartitionItems(section, existingItems).forEach((item) => {
      merged.set(buildPartitionMergeKey(section, item), cloneValue(item));
    });
    sortPartitionItems(section, incomingItems).forEach((item) => {
      merged.set(buildPartitionMergeKey(section, item), cloneValue(item));
    });
    return sortPartitionItems(section, Array.from(merged.values()));
  }

  function validateItemsForPeriod(section, periodId, items = []) {
    const normalizedPeriodId = normalizePeriodId(periodId) || UNDATED_PERIOD_ID;
    return ensureArray(items).every((item) => {
      const itemPeriodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
      return itemPeriodId === normalizedPeriodId;
    });
  }

  function groupItemsByPeriod(section, items = []) {
    const grouped = new Map();
    ensureArray(items).forEach((item) => {
      const periodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
      if (!grouped.has(periodId)) {
        grouped.set(periodId, []);
      }
      grouped.get(periodId).push(cloneValue(item));
    });
    return grouped;
  }

  return {
    FORMAT_VERSION,
    BUNDLE_MODE,
    PERIOD_UNIT,
    UNDATED_PERIOD_ID,
    CORE_FILE_NAME,
    MANIFEST_FILE_NAME,
    RECURRING_PLANS_FILE_NAME,
    PROJECT_DURATION_CACHE_VERSION,
    PROJECT_DURATION_CACHE_VERSION_KEY,
    PROJECT_DIRECT_DURATION_KEY,
    PROJECT_TOTAL_DURATION_KEY,
    PARTITIONED_SECTIONS,
    CORE_SECTION_KEYS,
    SECTION_DIRECTORY_MAP,
    cloneValue,
    ensureArray,
    ensureObject,
    normalizeDurationMs,
    normalizeDateInput,
    normalizeDateKey,
    normalizePeriodId,
    normalizeRangeInput,
    getPeriodIdsForRange,
    getSectionItemDate,
    getPeriodIdForSectionItem,
    getPartitionRelativePath,
    parseSpendTimeToMs,
    getRecordDurationMs,
    normalizeProjectDurationCache,
    hasValidProjectDurationCache,
    projectsHaveValidDurationCache,
    repairProjectHierarchy,
    attachProjectIdsToRecords,
    recalculateProjectDurationTotals,
    rebuildProjectDurationCaches,
    reconcileProjectDurationCaches,
    applyProjectRecordDurationChanges,
    createBaseSyncMeta,
    createEmptyLegacyState,
    createEmptyBundle,
    createPartitionEnvelope,
    normalizePartitionEnvelope,
    normalizeManifest,
    splitLegacyState,
    buildLegacyStateFromBundle,
    buildPartitionFingerprint,
    buildPartitionMergeKey,
    mergePartitionItems,
    validateItemsForPeriod,
    groupItemsByPeriod,
    isRecurringPlan,
    sortPartitionItems,
  };
});


;/* pages/storage-adapter.js */
(() => {
  const CONTROLER_STORAGE_EVENT = "controler:storage-data-changed";
  const CONTROLER_STORAGE_ERROR_EVENT = "controler:storage-sync-error";
  const MOBILE_FILE_NAME = "bundle-manifest.json";
  const BROWSER_STATE_KEY = "__controler_browser_state__";
  const MOBILE_MIRROR_STATE_KEY = "__controler_mobile_state__";
  const MOBILE_MIRROR_STATUS_KEY = "__controler_mobile_status__";
  const MOBILE_MIRROR_PENDING_WRITE_KEY = "__controler_mobile_pending_write__";
  const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
  const MOBILE_MIRROR_FLUSH_DELAY_MS = 90;
  const JOURNAL_BATCH_DELAY_MS = 90;
  const ELECTRON_WRITE_DELAY_MS = 250;
  const EXTERNAL_RELOAD_DELAY_MS = 120;
  const NATIVE_WRITE_DELAY_MS = 240;
  const NATIVE_PROBE_DEBOUNCE_MS = 150;
  const NATIVE_PROBE_FAST_INTERVAL_MS = 2000;
  const NATIVE_PROBE_STABLE_INTERVAL_MS = 6000;
  const NATIVE_PROBE_FAST_WINDOW_MS = 30000;
  const NATIVE_PROBE_FALLBACK_HASH_INTERVAL_MS = 30000;
  const NATIVE_BOOTSTRAP_SYNC_GRACE_MS = 4000;
  const NATIVE_LOCAL_WRITE_ERROR_SUPPRESS_MS = 5000;

  const electronAPI = window.electronAPI;
  const hasElectronStorageBridge =
    !!electronAPI?.isElectron &&
    typeof electronAPI.storageLoadSync === "function" &&
    typeof electronAPI.storageSaveSync === "function";

  const reactNativeBridge = window.ControlerNativeBridge || null;
  const guideBundle = window.ControlerGuideBundle || null;
  const storageBundle = window.ControlerStorageBundle || null;
  const platformContract = window.ControlerPlatformContract || null;
  const resolvedRuntimeCapabilities =
    electronAPI?.runtimeMeta?.capabilities && typeof electronAPI.runtimeMeta.capabilities === "object"
      ? electronAPI.runtimeMeta.capabilities
      : reactNativeBridge?.capabilities && typeof reactNativeBridge.capabilities === "object"
        ? reactNativeBridge.capabilities
        : typeof platformContract?.getRuntimeProfile === "function"
          ? (
              platformContract.getRuntimeProfile({
                isElectron: !!electronAPI?.isElectron,
                isReactNativeApp:
                  reactNativeBridge?.platform === "android" ||
                  reactNativeBridge?.platform === "ios" ||
                  typeof window.ReactNativeWebView?.postMessage === "function",
                platform:
                  electronAPI?.platform ||
                  reactNativeBridge?.platform ||
                  "web",
              })?.capabilities || {}
            )
          : {};
  const hasReactNativeStorageBridge =
    !hasElectronStorageBridge &&
    typeof reactNativeBridge?.call === "function" &&
    (
      reactNativeBridge?.platform === "android" ||
      reactNativeBridge?.platform === "ios" ||
      typeof window.ReactNativeWebView?.postMessage === "function"
    );
  let storageReady = !hasReactNativeStorageBridge;
  let storageReadyPromiseResolved = storageReady;
  let resolveStorageReadyPromise = () => {};
  const storageReadyPromise = new Promise((resolve) => {
    resolveStorageReadyPromise = () => {
      if (storageReadyPromiseResolved) {
        return;
      }
      storageReadyPromiseResolved = true;
      storageReady = true;
      resolve(true);
    };
    if (storageReadyPromiseResolved) {
      resolve(true);
    }
  });

  function markStorageReady() {
    storageReady = true;
    resolveStorageReadyPromise();
  }

  const reservedMetadataKeys = new Set([
    "storagePath",
    "storageDirectory",
    "userDataPath",
    "documentsPath",
    "createdAt",
    "lastModified",
    "syncMeta",
  ]);
  const SHARED_STATE_KEYS = new Set([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "yearlyGoals",
    "diaryEntries",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const LEGACY_LOCAL_ONLY_SHARED_KEYS = Object.freeze([
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const SHARED_BOOTSTRAP_MIRROR_KEYS = Object.freeze([
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const DEFAULT_CHANGED_SECTIONS = Object.freeze([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "yearlyGoals",
    "diaryEntries",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
    "plansRecurring",
  ]);
  const PRECISE_CORE_SECTION_KEYS = new Set([
    "projects",
    "todos",
    "checkinItems",
    "yearlyGoals",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const LOCAL_ONLY_STATE_KEY_ALIASES = Object.freeze({
    tableScaleSettings: "uiTableScaleSettings",
  });
  const LOCAL_ONLY_EXACT_KEYS = new Set([
    "uiTableScaleSettings",
    "uiTableScaleSettingsUpdatedAt",
    "appNavigationVisibility",
    "appLanguage",
    "autoSave",
    "notifications",
    "planViewState",
    "timerSessionState",
    "statsPreferences",
    "projectHierarchyExpansionState",
    "projectTableScale",
    "planWeekScale",
  ]);
  const LOCAL_ONLY_KEY_PREFIXES = ["stats-view-size:"];

  function createDefaultNavigationVisibility() {
    return {
      hiddenPages: [],
      order: ["index", "stats", "plan", "todo", "diary", "settings"],
    };
  }

  function createDefaultStatsPreferences() {
    return {
      heatmapThresholdsByFilter: {},
      uiState: {
        viewMode: "table",
        generalRangeUnit: "day",
        heatmapRangeUnit: "month",
        tableLevelFilter: "all",
        pie: {
          selectionValue: "summary:all",
          collapsedKeys: [],
        },
        line: {
          selectionValue: "summary:all",
          collapsedKeys: [],
        },
        heatmap: {
          dataType: "project",
          projectFilter: "all",
          checkinItemId: "all",
          monthCount: 1,
        },
      },
    };
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function getDefaultGuideStateFallback() {
    return (
      guideBundle?.getDefaultGuideState?.() || {
        bundleVersion:
          Number.isFinite(guideBundle?.GUIDE_BUNDLE_VERSION)
            ? guideBundle.GUIDE_BUNDLE_VERSION
            : 2,
        dismissedCardIds: [],
        dismissedGuideDiaryEntryIds: [],
      }
    );
  }

  const defaultState = () => ({
    projects: [],
    records: [],
    plans: [],
    todos: [],
    checkinItems: [],
    dailyCheckins: [],
    checkins: [],
    yearlyGoals: {},
    diaryEntries: [],
    diaryCategories: [],
    guideState: getDefaultGuideStateFallback(),
    customThemes: [],
    builtInThemeOverrides: {},
    selectedTheme: "default",
    createdAt: null,
    lastModified: null,
    storagePath: null,
    storageDirectory: null,
    userDataPath: null,
    documentsPath: null,
    syncMeta: {
      mode: "folder-file",
      fileName: MOBILE_FILE_NAME,
      autoSyncEnabled: true,
      lastSavedAt: null,
      lastTriggeredAt: null,
      lastFlushStartedAt: null,
      lastFlushCompletedAt: null,
      pendingWriteCount: 0,
      storageDirectory: null,
      platform: null,
      uri: null,
    },
  });

  const getNativeStoragePrototype = () => {
    try {
      return Object.getPrototypeOf(window.localStorage);
    } catch (error) {
      return Storage?.prototype || null;
    }
  };

  const nativeStoragePrototype = getNativeStoragePrototype();
  const nativeMethods = {
    getItem: nativeStoragePrototype?.getItem,
    setItem: nativeStoragePrototype?.setItem,
    removeItem: nativeStoragePrototype?.removeItem,
    clear: nativeStoragePrototype?.clear,
    key: nativeStoragePrototype?.key,
  };

  const nativeLengthDescriptor = nativeStoragePrototype
    ? Object.getOwnPropertyDescriptor(nativeStoragePrototype, "length")
    : null;

  function isLocalStorageTarget(target) {
    try {
      return target === window.localStorage;
    } catch (error) {
      return false;
    }
  }

  function cloneValue(value) {
    if (value === null || value === undefined) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function safeDeserialize(rawValue) {
    if (typeof rawValue !== "string") {
      return rawValue;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
      return "";
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return rawValue;
    }
  }

  function safeSerialize(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function parseJsonSafely(rawValue, fallback = null) {
    if (rawValue && typeof rawValue === "object") {
      return rawValue;
    }

    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return fallback;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return fallback;
    }
  }

  function deriveDirectoryFromPath(pathValue) {
    if (typeof pathValue !== "string" || !pathValue.trim()) {
      return null;
    }

    const normalized = pathValue.replace(/\\/g, "/");
    const lastSlashIndex = normalized.lastIndexOf("/");
    if (lastSlashIndex <= 0) {
      return null;
    }

    return normalized.slice(0, lastSlashIndex);
  }

  function normalizeNavigationVisibilityState(value) {
    const source =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const hiddenPages = Array.isArray(source.hiddenPages)
      ? source.hiddenPages
          .map((pageKey) => String(pageKey || "").trim())
          .filter(Boolean)
      : [];
    const order = Array.isArray(source.order)
      ? source.order
          .map((pageKey) => String(pageKey || "").trim())
          .filter(Boolean)
      : createDefaultNavigationVisibility().order;
    return {
      hiddenPages,
      order: order.length ? order : createDefaultNavigationVisibility().order,
    };
  }

  function normalizeStatsPreferences(value) {
    const base = createDefaultStatsPreferences();
    const source =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const thresholds =
      source.heatmapThresholdsByFilter &&
      typeof source.heatmapThresholdsByFilter === "object" &&
      !Array.isArray(source.heatmapThresholdsByFilter)
        ? source.heatmapThresholdsByFilter
        : {};
    const uiState =
      source.uiState && typeof source.uiState === "object" && !Array.isArray(source.uiState)
        ? source.uiState
        : base.uiState;
    return {
      ...base,
      heatmapThresholdsByFilter: thresholds,
      uiState,
    };
  }

  function normalizeLocalOnlyValue(key, value) {
    const actualKey = resolveLocalStateKey(key);
    if (value === undefined) {
      return undefined;
    }
    switch (actualKey) {
      case "selectedTheme": {
        const normalizedValue =
          typeof value === "string" ? value.trim() : String(value || "").trim();
        return normalizedValue || "default";
      }
      case "customThemes":
        return Array.isArray(value) ? value : [];
      case "builtInThemeOverrides":
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      case "uiTableScaleSettings":
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      case "appNavigationVisibility":
        return normalizeNavigationVisibilityState(value);
      case "guideState":
        return (
          guideBundle?.normalizeGuideState?.(value) ||
          (isPlainObject(value)
            ? {
                ...getDefaultGuideStateFallback(),
                ...value,
                dismissedCardIds: Array.isArray(value.dismissedCardIds)
                  ? value.dismissedCardIds
                  : [],
                dismissedGuideDiaryEntryIds: Array.isArray(
                  value.dismissedGuideDiaryEntryIds,
                )
                  ? value.dismissedGuideDiaryEntryIds
                  : Array.isArray(value.dismissedDiaryEntryIds)
                    ? value.dismissedDiaryEntryIds
                    : [],
              }
            : getDefaultGuideStateFallback())
        );
      case "statsPreferences":
        return normalizeStatsPreferences(value);
      case "appLanguage":
      case "planViewState":
      case "uiTableScaleSettingsUpdatedAt":
        return typeof value === "string" ? value : String(value || "");
      default:
        return value;
    }
  }

  function writeRawLocalOnlyValue(key, value) {
    const actualKey = resolveLocalStateKey(key);
    if (!actualKey) {
      return;
    }
    const storageKey = getLocalStorageNamespaceKey(actualKey);
    if (value === undefined) {
      nativeMethods.removeItem?.call(window.localStorage, storageKey);
      return;
    }
    nativeMethods.setItem?.call(
      window.localStorage,
      storageKey,
      safeSerialize(normalizeLocalOnlyValue(actualKey, value)),
    );
  }

  function readRawLocalOnlyValue(key) {
    const actualKey = resolveLocalStateKey(key);
    if (!actualKey) {
      return null;
    }
    const rawValue = nativeMethods.getItem?.call(
      window.localStorage,
      getLocalStorageNamespaceKey(actualKey),
    );
    if (rawValue === null || rawValue === undefined) {
      return null;
    }
    return normalizeLocalOnlyValue(actualKey, safeDeserialize(rawValue));
  }

  function hasStoredRawLocalOnlyValue(key) {
    const actualKey = resolveLocalStateKey(key);
    if (!actualKey) {
      return false;
    }
    const rawValue = nativeMethods.getItem?.call(
      window.localStorage,
      getLocalStorageNamespaceKey(actualKey),
    );
    return rawValue !== null && rawValue !== undefined;
  }

  function persistSharedBootstrapMirrors(state = {}) {
    SHARED_BOOTSTRAP_MIRROR_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(state, key)) {
        return;
      }
      writeRawLocalOnlyValue(key, state[key]);
    });
  }

  function listStoredLocalOnlyKeys() {
    const results = [];
    const rawLength =
      nativeLengthDescriptor?.get?.call(window.localStorage) ??
      window.localStorage.length;
    for (let index = 0; index < rawLength; index += 1) {
      const rawKey = nativeMethods.key?.call(window.localStorage, index);
      if (
        typeof rawKey !== "string" ||
        !rawKey.startsWith(LOCAL_ONLY_STORAGE_PREFIX)
      ) {
        continue;
      }
      results.push(rawKey.slice(LOCAL_ONLY_STORAGE_PREFIX.length));
    }
    return results.filter((key, index, list) => list.indexOf(key) === index);
  }

  function clearStoredLocalOnlyValues() {
    listStoredLocalOnlyKeys().forEach((key) => {
      nativeMethods.removeItem?.call(
        window.localStorage,
        getLocalStorageNamespaceKey(key),
      );
    });
  }

  function migrateLegacyLocalOnlySharedValues(rawState) {
    const target =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    LEGACY_LOCAL_ONLY_SHARED_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        writeRawLocalOnlyValue(key, undefined);
        return;
      }
      if (!hasStoredRawLocalOnlyValue(key)) {
        return;
      }
      const legacyValue = readRawLocalOnlyValue(key);
      if (legacyValue !== null && legacyValue !== undefined) {
        target[key] = cloneValue(legacyValue);
      }
      writeRawLocalOnlyValue(key, undefined);
    });
    return target;
  }

  function adoptLegacyLocalOnlyValues(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return;
    }
    Object.keys(rawState).forEach((key) => {
      if (!isLocalStateKey(key)) {
        return;
      }
      const actualKey = resolveLocalStateKey(key);
      if (hasStoredRawLocalOnlyValue(actualKey)) {
        return;
      }
      writeRawLocalOnlyValue(actualKey, rawState[key]);
    });
  }

  function extractSharedState(rawState) {
    const source =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    const nextState = {};
    reservedMetadataKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        nextState[key] = source[key];
      }
    });
    SHARED_STATE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        nextState[key] = source[key];
      }
    });
    return nextState;
  }

  function buildMergedState(sharedState, options = {}) {
    const nextState = cloneValue(sharedState || {});
    listStoredLocalOnlyKeys().forEach((key) => {
      const value = readRawLocalOnlyValue(key);
      if (value !== null) {
        nextState[key] = cloneValue(value);
      }
    });
    if (
      options.includeAliases &&
      !Object.prototype.hasOwnProperty.call(nextState, "tableScaleSettings") &&
      Object.prototype.hasOwnProperty.call(nextState, "uiTableScaleSettings")
    ) {
      nextState.tableScaleSettings = cloneValue(nextState.uiTableScaleSettings);
    }
    return nextState;
  }

  function normalizeProjectCollection(projects = [], options = {}) {
    const sourceProjects = Array.isArray(projects) ? projects : [];
    const clonedProjects = cloneValue(sourceProjects) || [];
    const repairResult =
      typeof storageBundle?.repairProjectHierarchy === "function"
        ? storageBundle.repairProjectHierarchy(clonedProjects)
        : {
            projects: clonedProjects,
            repaired: false,
          };
    const repairedProjects = Array.isArray(repairResult?.projects)
      ? repairResult.projects
      : [];
    const needsDurationRepair =
      typeof storageBundle?.projectsHaveValidDurationCache === "function"
        ? !storageBundle.projectsHaveValidDurationCache(repairedProjects)
        : false;
    let normalizedProjects = repairedProjects;

    if (
      Array.isArray(options.records) &&
      typeof storageBundle?.rebuildProjectDurationCaches === "function"
    ) {
      normalizedProjects = storageBundle.rebuildProjectDurationCaches(
        repairedProjects,
        options.records,
      );
    } else if (
      (repairResult.repaired || needsDurationRepair) &&
      typeof storageBundle?.recalculateProjectDurationTotals === "function"
    ) {
      normalizedProjects = storageBundle.recalculateProjectDurationTotals(
        repairedProjects,
      );
    } else {
      normalizedProjects = cloneValue(repairedProjects) || [];
    }

    return {
      projects: Array.isArray(normalizedProjects) ? normalizedProjects : [],
      repaired:
        repairResult.repaired ||
        needsDurationRepair ||
        safeSerialize(sourceProjects) !== safeSerialize(normalizedProjects),
    };
  }

  function normalizeCorePayloadProjects(corePayload = {}, options = {}) {
    const source =
      corePayload && typeof corePayload === "object" && !Array.isArray(corePayload)
        ? corePayload
        : {};
    if (!Object.prototype.hasOwnProperty.call(source, "projects")) {
      return {
        payload: source,
        projects: [],
        repaired: false,
      };
    }
    const projectResult = normalizeProjectCollection(source.projects, options);
    return {
      payload: {
        ...source,
        projects: cloneValue(projectResult.projects),
      },
      projects: projectResult.projects,
      repaired: projectResult.repaired,
    };
  }

  function extractBootstrapProjectsFromPayload(pageKey, payload = null) {
    const normalizedPage = normalizePageBootstrapKey(payload?.page || pageKey);
    if (normalizedPage !== "index" && normalizedPage !== "stats") {
      return [];
    }
    const source =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : {};
    if (
      source.data &&
      typeof source.data === "object" &&
      !Array.isArray(source.data)
    ) {
      return Array.isArray(source.data.projects) ? source.data.projects : [];
    }
    if (
      source.pageData &&
      typeof source.pageData === "object" &&
      !Array.isArray(source.pageData)
    ) {
      return Array.isArray(source.pageData.projects)
        ? source.pageData.projects
        : [];
    }
    return [];
  }

  function finalizeBootstrapEnvelopeWithProjectRepair(envelope = {}) {
    const source =
      envelope && typeof envelope === "object" && !Array.isArray(envelope)
        ? envelope
        : {};
    const normalizedPage = normalizePageBootstrapKey(source.page);
    const data =
      source.data && typeof source.data === "object" && !Array.isArray(source.data)
        ? source.data
        : {};
    if (normalizedPage !== "index" && normalizedPage !== "stats") {
      return {
        envelope: source,
        repaired: false,
        projects: [],
      };
    }
    const projectResult = normalizeProjectCollection(data.projects);
    return {
      envelope: {
        ...source,
        data: {
          ...data,
          projects: cloneValue(projectResult.projects),
          ...(normalizedPage === "index"
            ? {
                projectTotalsSummary: buildProjectTotalsSummary(
                  projectResult.projects,
                ),
              }
            : {}),
        },
      },
      repaired: projectResult.repaired,
      projects: projectResult.projects,
    };
  }

  function normalizeState(rawState, metadata = {}) {
    const sourceState = migrateLegacyLocalOnlySharedValues(
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? { ...rawState }
        : rawState,
    );
    adoptLegacyLocalOnlyValues(sourceState);
    const sharedSource = extractSharedState(sourceState);
    const normalizedGuideState =
      guideBundle?.normalizeGuideState?.(
        hasStoredRawLocalOnlyValue("guideState")
          ? readRawLocalOnlyValue("guideState")
          : sourceState &&
              typeof sourceState === "object" &&
              !Array.isArray(sourceState) &&
              Object.prototype.hasOwnProperty.call(sourceState, "guideState")
            ? sourceState.guideState
            : null,
      ) || null;
    const guideSource = normalizedGuideState
      ? { ...sharedSource, guideState: normalizedGuideState }
      : sharedSource;
    const base = defaultState();
    Object.keys(sharedSource).forEach((key) => {
      base[key] = sharedSource[key];
    });

    if (!Array.isArray(base.projects)) base.projects = [];
    if (!Array.isArray(base.records)) base.records = [];
    if (!Array.isArray(base.plans)) base.plans = [];
    if (!Array.isArray(base.todos)) base.todos = [];
    if (!Array.isArray(base.checkinItems)) base.checkinItems = [];
    if (!Array.isArray(base.dailyCheckins)) base.dailyCheckins = [];
    if (!Array.isArray(base.checkins)) base.checkins = [];
    if (!Array.isArray(base.diaryEntries)) base.diaryEntries = [];
    if (!Array.isArray(base.diaryCategories)) base.diaryCategories = [];
    if (!Array.isArray(base.customThemes)) base.customThemes = [];
    if (!base.yearlyGoals || typeof base.yearlyGoals !== "object") {
      base.yearlyGoals = {};
    }
    if (
      !base.builtInThemeOverrides ||
      typeof base.builtInThemeOverrides !== "object" ||
      Array.isArray(base.builtInThemeOverrides)
    ) {
      base.builtInThemeOverrides = {};
    }
    if (
      typeof base.selectedTheme !== "string" ||
      !base.selectedTheme.trim()
    ) {
      base.selectedTheme = "default";
    } else {
      base.selectedTheme = base.selectedTheme.trim();
    }
    base.guideState =
      normalizedGuideState || getDefaultGuideStateFallback();
    if (guideBundle?.shouldSeedGuideBundle?.(guideSource)) {
      base.diaryEntries = guideBundle.buildGuideDiaryEntries();
      base.diaryCategories = [];
      base.guideState = getDefaultGuideStateFallback();
    } else if (typeof guideBundle?.synchronizeGuideDiaryEntries === "function") {
      base.diaryEntries = guideBundle.synchronizeGuideDiaryEntries(
        base.diaryEntries,
        new Date(),
        normalizedGuideState,
      );
    }
    base.projects = normalizeProjectCollection(base.projects, {
      records: base.records,
    }).projects;

    const now = new Date().toISOString();
    const nextStoragePath =
      typeof metadata.storagePath === "string"
        ? metadata.storagePath
        : typeof base.storagePath === "string"
          ? base.storagePath
          : null;
    const nextStorageDirectory =
      typeof metadata.storageDirectory === "string"
        ? metadata.storageDirectory
        : typeof base.storageDirectory === "string"
          ? base.storageDirectory
          : deriveDirectoryFromPath(nextStoragePath);

    base.storagePath = nextStoragePath;
    base.storageDirectory = nextStorageDirectory;
    base.userDataPath =
      typeof metadata.userDataPath === "string"
        ? metadata.userDataPath
        : typeof base.userDataPath === "string"
          ? base.userDataPath
          : null;
    base.documentsPath =
      typeof metadata.documentsPath === "string"
        ? metadata.documentsPath
        : typeof base.documentsPath === "string"
          ? base.documentsPath
          : null;
    base.createdAt = base.createdAt || metadata.createdAt || now;
    base.lastModified = metadata.touchModified
      ? now
      : base.lastModified || metadata.lastModified || base.createdAt;

    const nextSyncMeta =
      base.syncMeta && typeof base.syncMeta === "object" ? base.syncMeta : {};
    base.syncMeta = {
      mode: metadata.mode || nextSyncMeta.mode || "folder-file",
      fileName: metadata.fileName || nextSyncMeta.fileName || MOBILE_FILE_NAME,
      autoSyncEnabled: true,
      lastSavedAt: nextSyncMeta.lastSavedAt || null,
      lastTriggeredAt: nextSyncMeta.lastTriggeredAt || null,
      lastFlushStartedAt: nextSyncMeta.lastFlushStartedAt || null,
      lastFlushCompletedAt: nextSyncMeta.lastFlushCompletedAt || null,
      pendingWriteCount: Number.isFinite(nextSyncMeta.pendingWriteCount)
        ? Math.max(0, nextSyncMeta.pendingWriteCount)
        : 0,
      storageDirectory:
        nextStorageDirectory || nextSyncMeta.storageDirectory || null,
      platform: metadata.platform || nextSyncMeta.platform || null,
      uri:
        typeof metadata.uri === "string"
          ? metadata.uri
          : typeof nextSyncMeta.uri === "string"
            ? nextSyncMeta.uri
            : null,
    };

    if (metadata.touchSyncSave) {
      base.syncMeta.lastSavedAt = now;
      base.syncMeta.lastTriggeredAt = now;
    }

    return base;
  }

  function createComparableSnapshot(state) {
    const snapshot = {};
    const source = extractSharedState(state);
    SHARED_STATE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        snapshot[key] = source[key];
      }
    });
    return JSON.stringify(snapshot);
  }

  function normalizeChangedSectionEntries(changedSections = []) {
    return Array.from(
      new Set(
        (Array.isArray(changedSections) ? changedSections : [])
          .map((section) => String(section || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function normalizeChangedPeriodEntries(changedPeriods = {}) {
    const source =
      changedPeriods && typeof changedPeriods === "object" ? changedPeriods : {};
    const normalized = {};
    Object.keys(source).forEach((section) => {
      const normalizedSection = String(section || "").trim();
      if (!normalizedSection) {
        return;
      }
      const periodIds = Array.from(
        new Set(
          (Array.isArray(source[section]) ? source[section] : [])
            .map((periodId) => String(periodId || "").trim())
            .filter(Boolean),
        ),
      );
      if (periodIds.length) {
        normalized[normalizedSection] = periodIds;
      }
    });
    return normalized;
  }

  function mergeChangedPeriodEntries(...maps) {
    const merged = {};
    maps.forEach((entry) => {
      const normalizedEntry = normalizeChangedPeriodEntries(entry);
      Object.keys(normalizedEntry).forEach((section) => {
        merged[section] = Array.from(
          new Set([...(merged[section] || []), ...normalizedEntry[section]]),
        );
      });
    });
    return merged;
  }

  function getStorageSectionPeriodId(section, item) {
    if (typeof storageBundle?.getPeriodIdForSectionItem === "function") {
      return storageBundle.getPeriodIdForSectionItem(section, item) || "undated";
    }
    const dateText =
      typeof item?.date === "string" && item.date
        ? item.date
        : typeof item?.endTime === "string" && item.endTime
          ? item.endTime
          : typeof item?.timestamp === "string" && item.timestamp
            ? item.timestamp
            : typeof item?.updatedAt === "string" && item.updatedAt
              ? item.updatedAt
              : "";
    return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : "undated";
  }

  function getStorageRecurringPlans(state = {}) {
    const planItems = Array.isArray(state?.plans) ? state.plans : [];
    return planItems.filter((item) =>
      typeof storageBundle?.isRecurringPlan === "function"
        ? storageBundle.isRecurringPlan(item)
        : String(item?.repeat || "").trim().toLowerCase() !== "none",
    );
  }

  const PAGE_BOOTSTRAP_KEYS = Object.freeze([
    "index",
    "plan",
    "todo",
    "diary",
    "stats",
    "settings",
  ]);

  function normalizePageBootstrapKey(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return PAGE_BOOTSTRAP_KEYS.includes(normalized) ? normalized : "index";
  }

  function normalizeBootstrapPeriodIds(periodIds = []) {
    return Array.from(
      new Set(
        (Array.isArray(periodIds) ? periodIds : [])
          .map((periodId) => String(periodId || "").trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  function formatBootstrapDateKey(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatBootstrapPeriodId(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function buildRecentHoursBootstrapScope(hours = 48) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime());
    startDate.setHours(startDate.getHours() - Math.max(1, Number(hours) || 48));
    return {
      startDate: formatBootstrapDateKey(startDate),
      endDate: formatBootstrapDateKey(endDate),
    };
  }

  function buildCurrentMonthBootstrapScope(anchorDate = new Date()) {
    const periodId = formatBootstrapPeriodId(anchorDate);
    return periodId ? { periodIds: [periodId] } : { periodIds: [] };
  }

  function buildCurrentDayBootstrapScope(anchorDate = new Date()) {
    const dayKey = formatBootstrapDateKey(anchorDate);
    const periodId = formatBootstrapPeriodId(anchorDate);
    return {
      startDate: dayKey || null,
      endDate: dayKey || null,
      periodIds: periodId ? [periodId] : [],
    };
  }

  function getBootstrapSectionDateText(section, item = {}) {
    switch (String(section || "").trim()) {
      case "records":
        return item?.endTime || item?.timestamp || item?.startTime || "";
      case "plans":
        return item?.date || "";
      case "diaryEntries":
        return item?.date || item?.updatedAt || "";
      case "dailyCheckins":
        return item?.date || "";
      case "checkins":
        return item?.time || item?.timestamp || "";
      default:
        return item?.updatedAt || item?.createdAt || "";
    }
  }

  function bootstrapItemMatchesDateScope(section, item = {}, scope = {}) {
    const startValue = scope?.startDate || scope?.start || null;
    const endValue = scope?.endDate || scope?.end || null;
    const rangeStart = storageBundle?.normalizeDateInput?.(startValue) || null;
    const rangeEnd = storageBundle?.normalizeDateInput?.(endValue) || null;
    if (!rangeStart || !rangeEnd) {
      return true;
    }

    const itemDate =
      storageBundle?.normalizeDateInput?.(
        getBootstrapSectionDateText(section, item),
      ) || null;
    if (!itemDate) {
      return false;
    }

    const lower = rangeStart.getTime() <= rangeEnd.getTime() ? rangeStart : rangeEnd;
    const upper = rangeStart.getTime() <= rangeEnd.getTime() ? rangeEnd : rangeStart;
    lower.setHours(0, 0, 0, 0);
    upper.setHours(23, 59, 59, 999);
    const itemTime = itemDate.getTime();
    return itemTime >= lower.getTime() && itemTime <= upper.getTime();
  }

  function sortBootstrapSectionItems(section, items = []) {
    if (typeof storageBundle?.sortPartitionItems === "function") {
      return storageBundle.sortPartitionItems(section, items);
    }
    return Array.isArray(items) ? items.slice() : [];
  }

  function loadBootstrapSectionRangeFromState(state = {}, section, scope = {}) {
    const normalizedScope =
      storageBundle?.normalizeRangeInput?.(scope) || {
        periodIds: Array.isArray(scope?.periodIds) ? scope.periodIds : [],
        startDate: scope?.startDate || scope?.start || null,
        endDate: scope?.endDate || scope?.end || null,
      };
    const requestedPeriodIds = new Set(
      normalizeBootstrapPeriodIds(normalizedScope.periodIds),
    );
    const sourceItems =
      section === "plans"
        ? (Array.isArray(state?.plans) ? state.plans : []).filter(
            (item) =>
              !(typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none"),
          )
        : Array.isArray(state?.[section])
          ? state[section]
          : [];
    const matchedItems = sourceItems.filter((item) => {
      const periodId = getStorageSectionPeriodId(section, item);
      if (requestedPeriodIds.size > 0 && !requestedPeriodIds.has(periodId)) {
        return false;
      }
      return bootstrapItemMatchesDateScope(section, item, normalizedScope);
    });
    const sortedItems = sortBootstrapSectionItems(section, matchedItems);
    return {
      items: cloneValue(sortedItems),
      periodIds: normalizeBootstrapPeriodIds(
        sortedItems.map((item) => getStorageSectionPeriodId(section, item)),
      ),
      startDate: normalizedScope?.startDate || null,
      endDate: normalizedScope?.endDate || null,
    };
  }

  function buildProjectTotalsSummary(projectItems = []) {
    const projects = normalizeProjectCollection(projectItems).projects;
    const totals = projects.reduce(
      (summary, project) => {
        const cachedTotalDurationMs = Number.isFinite(project?.cachedTotalDurationMs)
          ? Number(project.cachedTotalDurationMs)
          : Number.isFinite(project?.totalDurationMs)
            ? Number(project.totalDurationMs)
            : 0;
        summary.projectCount += 1;
        summary.totalDurationMs += Math.max(0, cachedTotalDurationMs);
        return summary;
      },
      {
        projectCount: 0,
        totalDurationMs: 0,
      },
    );
    return totals;
  }

  function buildThemeSummary(state = {}) {
    const customThemes = Array.isArray(state?.customThemes)
      ? state.customThemes
      : [];
    const builtInThemeOverrides =
      state?.builtInThemeOverrides &&
      typeof state.builtInThemeOverrides === "object" &&
      !Array.isArray(state.builtInThemeOverrides)
        ? state.builtInThemeOverrides
        : {};
    return {
      selectedTheme:
        typeof state?.selectedTheme === "string" && state.selectedTheme.trim()
          ? state.selectedTheme.trim()
          : "default",
      customThemeCount: customThemes.length,
      hasBuiltInOverrides: Object.keys(builtInThemeOverrides).length > 0,
    };
  }

  function buildPageBootstrapStateFromState(
    sourceState = {},
    pageKey,
    options = {},
    extra = {},
  ) {
    const state =
      sourceState && typeof sourceState === "object" && !Array.isArray(sourceState)
        ? sourceState
        : {};
    const normalizedPage = normalizePageBootstrapKey(pageKey);
    const sourceFingerprint =
      typeof extra?.sourceFingerprint === "string" ? extra.sourceFingerprint : "";
    const builtAt =
      typeof extra?.builtAt === "string" && extra.builtAt
        ? extra.builtAt
        : new Date().toISOString();
    const normalizedProjects = normalizeProjectCollection(
      Array.isArray(state?.projects) ? state.projects : [],
    ).projects;
    let loadedPeriodIds = [];
    let data = {};

    if (normalizedPage === "index") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : buildRecentHoursBootstrapScope(48);
      const range = loadBootstrapSectionRangeFromState(state, "records", recordScope);
      loadedPeriodIds = range.periodIds.slice();
      data = {
        projects: cloneValue(normalizedProjects),
        recentRecords: cloneValue(range.items),
        timerSessionState: cloneValue(state?.timerSessionState || null),
        projectTotalsSummary: buildProjectTotalsSummary(normalizedProjects),
      };
    } else if (normalizedPage === "plan") {
      const planScope =
        options?.planScope && typeof options.planScope === "object"
          ? options.planScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : buildCurrentMonthBootstrapScope();
      const range = loadBootstrapSectionRangeFromState(state, "plans", planScope);
      loadedPeriodIds = range.periodIds.slice();
      data = {
        visiblePlans: cloneValue(range.items),
        recurringPlans: cloneValue(getStorageRecurringPlans(state)),
        yearlyGoals: cloneValue(state?.yearlyGoals || {}),
      };
    } else if (normalizedPage === "todo") {
      const dailyCheckinScope =
        options?.dailyCheckinScope && typeof options.dailyCheckinScope === "object"
          ? options.dailyCheckinScope
          : buildCurrentDayBootstrapScope();
      const checkinScope =
        options?.checkinScope && typeof options.checkinScope === "object"
          ? options.checkinScope
          : buildCurrentMonthBootstrapScope();
      const dailyRange = loadBootstrapSectionRangeFromState(
        state,
        "dailyCheckins",
        dailyCheckinScope,
      );
      const checkinRange = loadBootstrapSectionRangeFromState(
        state,
        "checkins",
        checkinScope,
      );
      loadedPeriodIds = normalizeBootstrapPeriodIds([
        ...dailyRange.periodIds,
        ...checkinRange.periodIds,
      ]);
      data = {
        todos: cloneValue(Array.isArray(state?.todos) ? state.todos : []),
        checkinItems: cloneValue(
          Array.isArray(state?.checkinItems) ? state.checkinItems : [],
        ),
        todayDailyCheckins: cloneValue(dailyRange.items),
        recentCheckins: cloneValue(checkinRange.items),
      };
    } else if (normalizedPage === "diary") {
      const diaryScope =
        options?.diaryScope && typeof options.diaryScope === "object"
          ? options.diaryScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : buildCurrentMonthBootstrapScope();
      const range = loadBootstrapSectionRangeFromState(
        state,
        "diaryEntries",
        diaryScope,
      );
      loadedPeriodIds = range.periodIds.slice();
      data = {
        currentMonthEntries: cloneValue(range.items),
        diaryCategories: cloneValue(
          Array.isArray(state?.diaryCategories) ? state.diaryCategories : [],
        ),
        guideState: cloneValue(state?.guideState || getDefaultGuideStateFallback()),
      };
    } else if (normalizedPage === "stats") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : buildCurrentMonthBootstrapScope();
      const range = loadBootstrapSectionRangeFromState(state, "records", recordScope);
      loadedPeriodIds = range.periodIds.slice();
      data = {
        projects: cloneValue(normalizedProjects),
        defaultRangeRecordsOrAggregate: cloneValue(range.items),
        statsPreferences: cloneValue(
          normalizeStatsPreferences(state?.statsPreferences || {}),
        ),
      };
    } else {
      data = {
        storageStatus:
          extra?.storageStatus &&
          typeof extra.storageStatus === "object" &&
          !Array.isArray(extra.storageStatus)
            ? cloneValue(extra.storageStatus)
            : null,
        autoBackupStatus:
          extra?.autoBackupStatus &&
          typeof extra.autoBackupStatus === "object" &&
          !Array.isArray(extra.autoBackupStatus)
            ? cloneValue(extra.autoBackupStatus)
            : null,
        themeSummary: buildThemeSummary(state),
        navigationVisibility: cloneValue(
          normalizeNavigationVisibilityState(state?.appNavigationVisibility || {}),
        ),
      };
    }

    return finalizeBootstrapEnvelopeWithProjectRepair({
      page: normalizedPage,
      sourceFingerprint,
      builtAt,
      loadedPeriodIds: normalizeBootstrapPeriodIds(loadedPeriodIds),
      data,
    }).envelope;
  }

  function normalizePageBootstrapEnvelope(
    pageKey,
    payload = null,
    options = {},
    fallbackState = {},
    extra = {},
  ) {
    const normalizedPage = normalizePageBootstrapKey(
      payload?.page || pageKey,
    );
    const fallback = buildPageBootstrapStateFromState(
      fallbackState,
      normalizedPage,
      options,
      extra,
    );
    const source =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : {};

    if (
      source.data &&
      typeof source.data === "object" &&
      !Array.isArray(source.data)
    ) {
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        page: normalizedPage,
        sourceFingerprint:
          typeof source.sourceFingerprint === "string" && source.sourceFingerprint
            ? source.sourceFingerprint
            : typeof source.snapshotVersion === "string" &&
                source.snapshotVersion.trim()
              ? source.snapshotVersion.trim()
              : fallback.sourceFingerprint,
        builtAt:
          typeof source.builtAt === "string" && source.builtAt
            ? source.builtAt
            : typeof source.generatedAt === "string" && source.generatedAt
              ? source.generatedAt
              : fallback.builtAt,
        loadedPeriodIds:
          Array.isArray(source.loadedPeriodIds) && source.loadedPeriodIds.length
            ? normalizeBootstrapPeriodIds(source.loadedPeriodIds)
            : fallback.loadedPeriodIds,
        data: {
          ...fallback.data,
          ...cloneValue(source.data),
        },
      }).envelope;
    }

    if (
      source.pageData &&
      typeof source.pageData === "object" &&
      !Array.isArray(source.pageData)
    ) {
      const legacyPageData = source.pageData;
      let nextLoadedPeriodIds = fallback.loadedPeriodIds;
      let nextData = fallback.data;

      if (normalizedPage === "index") {
        nextLoadedPeriodIds = normalizeBootstrapPeriodIds(
          legacyPageData.recordPeriodIds || fallback.loadedPeriodIds,
        );
        nextData = {
          ...fallback.data,
          projects: cloneValue(legacyPageData.projects || fallback.data.projects),
          recentRecords: cloneValue(
            legacyPageData.recentRecords ||
              legacyPageData.records ||
              fallback.data.recentRecords,
          ),
          timerSessionState: cloneValue(
            legacyPageData.timerSessionState || fallback.data.timerSessionState,
          ),
          projectTotalsSummary: buildProjectTotalsSummary(
            legacyPageData.projects || fallback.data.projects || [],
          ),
        };
      } else if (normalizedPage === "plan") {
        nextLoadedPeriodIds = normalizeBootstrapPeriodIds(
          legacyPageData.planPeriodIds || fallback.loadedPeriodIds,
        );
        nextData = {
          ...fallback.data,
          visiblePlans: cloneValue(
            legacyPageData.visiblePlans ||
              legacyPageData.plans ||
              fallback.data.visiblePlans,
          ),
          recurringPlans: cloneValue(
            legacyPageData.recurringPlans || fallback.data.recurringPlans,
          ),
          yearlyGoals: cloneValue(
            legacyPageData.yearlyGoals || fallback.data.yearlyGoals,
          ),
        };
      } else if (normalizedPage === "todo") {
        nextLoadedPeriodIds = normalizeBootstrapPeriodIds([
          ...(legacyPageData.dailyCheckinPeriodIds || []),
          ...(legacyPageData.checkinPeriodIds || []),
          ...fallback.loadedPeriodIds,
        ]);
        nextData = {
          ...fallback.data,
          todos: cloneValue(legacyPageData.todos || fallback.data.todos),
          checkinItems: cloneValue(
            legacyPageData.checkinItems || fallback.data.checkinItems,
          ),
          todayDailyCheckins: cloneValue(
            legacyPageData.todayDailyCheckins ||
              legacyPageData.dailyCheckins ||
              fallback.data.todayDailyCheckins,
          ),
          recentCheckins: cloneValue(
            legacyPageData.recentCheckins ||
              legacyPageData.checkins ||
              fallback.data.recentCheckins,
          ),
        };
      } else if (normalizedPage === "diary") {
        nextLoadedPeriodIds = normalizeBootstrapPeriodIds(
          legacyPageData.loadedPeriodIds ||
            legacyPageData.diaryPeriodIds ||
            fallback.loadedPeriodIds,
        );
        nextData = {
          ...fallback.data,
          currentMonthEntries: cloneValue(
            legacyPageData.currentMonthEntries ||
              legacyPageData.entries ||
              fallback.data.currentMonthEntries,
          ),
          diaryCategories: cloneValue(
            legacyPageData.diaryCategories || fallback.data.diaryCategories,
          ),
          guideState: cloneValue(
            legacyPageData.guideState || fallback.data.guideState,
          ),
        };
      } else if (normalizedPage === "stats") {
        nextLoadedPeriodIds = normalizeBootstrapPeriodIds(
          legacyPageData.recordPeriodIds || fallback.loadedPeriodIds,
        );
        nextData = {
          ...fallback.data,
          projects: cloneValue(legacyPageData.projects || fallback.data.projects),
          defaultRangeRecordsOrAggregate: cloneValue(
            legacyPageData.defaultRangeRecordsOrAggregate ||
              legacyPageData.records ||
              fallback.data.defaultRangeRecordsOrAggregate,
          ),
        };
      } else if (normalizedPage === "settings") {
        nextData = {
          ...fallback.data,
          ...cloneValue(legacyPageData),
        };
      }

      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        page: normalizedPage,
        sourceFingerprint:
          typeof source.snapshotVersion === "string" && source.snapshotVersion
            ? source.snapshotVersion
            : fallback.sourceFingerprint,
        builtAt:
          typeof source.generatedAt === "string" && source.generatedAt
            ? source.generatedAt
            : fallback.builtAt,
        loadedPeriodIds: nextLoadedPeriodIds,
        data: nextData,
      }).envelope;
    }

    return finalizeBootstrapEnvelopeWithProjectRepair(fallback).envelope;
  }

  async function buildPageBootstrapStateFromAsyncLoaders(
    pageKey,
    options = {},
    loaders = {},
  ) {
    const normalizedPage = normalizePageBootstrapKey(pageKey);
    const fallbackState =
      loaders?.fallbackState &&
      typeof loaders.fallbackState === "object" &&
      !Array.isArray(loaders.fallbackState)
        ? loaders.fallbackState
        : {};
    const rawCoreState =
      typeof loaders?.getCoreState === "function"
        ? (await loaders.getCoreState()) || {}
        : {};
    const coreState = normalizeCorePayloadProjects(rawCoreState).payload;
    const mergedBaseState = {
      ...fallbackState,
      ...(coreState && typeof coreState === "object" && !Array.isArray(coreState)
        ? coreState
        : {}),
    };
    const extra = {
      sourceFingerprint:
        typeof loaders?.sourceFingerprint === "string"
          ? loaders.sourceFingerprint
          : "",
      builtAt:
        typeof loaders?.builtAt === "string" ? loaders.builtAt : undefined,
      storageStatus:
        typeof loaders?.getStorageStatus === "function"
          ? await loaders.getStorageStatus()
          : null,
      autoBackupStatus:
        typeof loaders?.getAutoBackupStatus === "function"
          ? await loaders.getAutoBackupStatus()
          : null,
    };
    const fallback = buildPageBootstrapStateFromState(
      mergedBaseState,
      normalizedPage,
      options,
      extra,
    );

    if (typeof loaders?.loadSectionRange !== "function") {
      return finalizeBootstrapEnvelopeWithProjectRepair(fallback).envelope;
    }

    if (normalizedPage === "index") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : buildRecentHoursBootstrapScope(48);
      const range = await loaders.loadSectionRange("records", recordScope);
      const projects = Array.isArray(coreState?.projects)
        ? coreState.projects
        : fallback.data.projects;
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        loadedPeriodIds: normalizeBootstrapPeriodIds(range?.periodIds || []),
        data: {
          ...fallback.data,
          projects: cloneValue(projects),
          recentRecords: cloneValue(range?.items || []),
          projectTotalsSummary: buildProjectTotalsSummary(projects),
        },
      }).envelope;
    }

    if (normalizedPage === "plan") {
      const planScope =
        options?.planScope && typeof options.planScope === "object"
          ? options.planScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : buildCurrentMonthBootstrapScope();
      const range = await loaders.loadSectionRange("plans", planScope);
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        loadedPeriodIds: normalizeBootstrapPeriodIds(range?.periodIds || []),
        data: {
          ...fallback.data,
          visiblePlans: cloneValue(range?.items || []),
          recurringPlans: cloneValue(
            Array.isArray(coreState?.recurringPlans)
              ? coreState.recurringPlans
              : fallback.data.recurringPlans,
          ),
          yearlyGoals: cloneValue(coreState?.yearlyGoals || fallback.data.yearlyGoals || {}),
        },
      }).envelope;
    }

    if (normalizedPage === "todo") {
      const dailyCheckinScope =
        options?.dailyCheckinScope && typeof options.dailyCheckinScope === "object"
          ? options.dailyCheckinScope
          : buildCurrentDayBootstrapScope();
      const checkinScope =
        options?.checkinScope && typeof options.checkinScope === "object"
          ? options.checkinScope
          : buildCurrentMonthBootstrapScope();
      const [dailyRange, checkinRange] = await Promise.all([
        loaders.loadSectionRange("dailyCheckins", dailyCheckinScope),
        loaders.loadSectionRange("checkins", checkinScope),
      ]);
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        loadedPeriodIds: normalizeBootstrapPeriodIds([
          ...(dailyRange?.periodIds || []),
          ...(checkinRange?.periodIds || []),
        ]),
        data: {
          ...fallback.data,
          todos: cloneValue(coreState?.todos || fallback.data.todos || []),
          checkinItems: cloneValue(
            coreState?.checkinItems || fallback.data.checkinItems || [],
          ),
          todayDailyCheckins: cloneValue(dailyRange?.items || []),
          recentCheckins: cloneValue(checkinRange?.items || []),
        },
      }).envelope;
    }

    if (normalizedPage === "diary") {
      const diaryScope =
        options?.diaryScope && typeof options.diaryScope === "object"
          ? options.diaryScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : buildCurrentMonthBootstrapScope();
      const range = await loaders.loadSectionRange("diaryEntries", diaryScope);
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        loadedPeriodIds: normalizeBootstrapPeriodIds(range?.periodIds || []),
        data: {
          ...fallback.data,
          currentMonthEntries: cloneValue(range?.items || []),
          diaryCategories: cloneValue(
            coreState?.diaryCategories || fallback.data.diaryCategories || [],
          ),
          guideState: cloneValue(coreState?.guideState || fallback.data.guideState || {}),
        },
      }).envelope;
    }

    if (normalizedPage === "stats") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : buildCurrentMonthBootstrapScope();
      const range = await loaders.loadSectionRange("records", recordScope);
      return finalizeBootstrapEnvelopeWithProjectRepair({
        ...fallback,
        loadedPeriodIds: normalizeBootstrapPeriodIds(range?.periodIds || []),
        data: {
          ...fallback.data,
          projects: cloneValue(coreState?.projects || fallback.data.projects || []),
          defaultRangeRecordsOrAggregate: cloneValue(range?.items || []),
        },
      }).envelope;
    }

    return finalizeBootstrapEnvelopeWithProjectRepair(fallback).envelope;
  }

  function normalizeStorageJournalOperations(operations = []) {
    return (Array.isArray(operations) ? operations : [])
      .map((operation) => {
        const kind = String(operation?.kind || "").trim();
        if (kind === "replaceCoreState") {
          const partialCore =
            operation?.partialCore &&
            typeof operation.partialCore === "object" &&
            !Array.isArray(operation.partialCore)
              ? cloneValue(operation.partialCore)
              : {};
          return {
            kind,
            partialCore,
          };
        }
        if (kind === "saveSectionRange") {
          const section = String(operation?.section || "").trim();
          const payload =
            operation?.payload &&
            typeof operation.payload === "object" &&
            !Array.isArray(operation.payload)
              ? cloneValue(operation.payload)
              : {};
          if (!section) {
            return null;
          }
          return {
            kind,
            section,
            payload,
          };
        }
        if (kind === "replaceRecurringPlans") {
          return {
            kind,
            items: cloneValue(
              Array.isArray(operation?.items) ? operation.items : [],
            ),
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  function coalesceStorageJournalOperations(operations = []) {
    const orderedKeys = [];
    const operationsByKey = new Map();
    normalizeStorageJournalOperations(operations).forEach((operation) => {
      let key = "";
      let nextOperation = operation;
      if (operation.kind === "replaceCoreState") {
        key = "replaceCoreState";
        const existing = operationsByKey.get(key);
        nextOperation = {
          kind: "replaceCoreState",
          partialCore: {
            ...(existing?.partialCore &&
            typeof existing.partialCore === "object" &&
            !Array.isArray(existing.partialCore)
              ? existing.partialCore
              : {}),
            ...(operation.partialCore &&
            typeof operation.partialCore === "object" &&
            !Array.isArray(operation.partialCore)
              ? operation.partialCore
              : {}),
          },
        };
      } else if (operation.kind === "saveSectionRange") {
        const periodId = String(operation?.payload?.periodId || "").trim();
        key = `saveSectionRange:${operation.section}:${periodId}`;
        nextOperation = {
          kind: "saveSectionRange",
          section: operation.section,
          payload: cloneValue(operation.payload || {}),
        };
      } else if (operation.kind === "replaceRecurringPlans") {
        key = "replaceRecurringPlans";
        nextOperation = {
          kind: "replaceRecurringPlans",
          items: cloneValue(operation.items || []),
        };
      }
      if (!key) {
        return;
      }
      if (!operationsByKey.has(key)) {
        orderedKeys.push(key);
      }
      operationsByKey.set(key, nextOperation);
    });
    return orderedKeys
      .map((key) => operationsByKey.get(key))
      .filter(Boolean);
  }

  function collectStorageJournalMetadata(operations = []) {
    const changedSections = [];
    let changedPeriods = {};
    coalesceStorageJournalOperations(operations).forEach((operation) => {
      if (operation.kind === "replaceCoreState") {
        changedSections.push(
          ...inferChangedSectionsFromCorePatch(operation.partialCore),
        );
        return;
      }
      if (operation.kind === "saveSectionRange") {
        changedSections.push(operation.section);
        const periodId = String(operation?.payload?.periodId || "").trim();
        if (periodId) {
          changedPeriods = mergeChangedPeriodEntries(changedPeriods, {
            [operation.section]: [periodId],
          });
        }
        return;
      }
      if (operation.kind === "replaceRecurringPlans") {
        changedSections.push("plansRecurring");
      }
    });
    return {
      changedSections: normalizeChangedSectionEntries(changedSections),
      changedPeriods: normalizeChangedPeriodEntries(changedPeriods),
    };
  }

  function applyStorageJournalOperations(currentState, operations = []) {
    let nextState =
      currentState && typeof currentState === "object" && !Array.isArray(currentState)
        ? cloneValue(currentState)
        : {};

    coalesceStorageJournalOperations(operations).forEach((operation) => {
      if (operation.kind === "replaceCoreState") {
        nextState = {
          ...nextState,
          ...(operation.partialCore &&
          typeof operation.partialCore === "object" &&
          !Array.isArray(operation.partialCore)
            ? cloneValue(operation.partialCore)
            : {}),
        };
        return;
      }

      if (operation.kind === "saveSectionRange") {
        const section = String(operation.section || "").trim();
        const periodId = String(operation?.payload?.periodId || "").trim();
        if (!section || !periodId) {
          return;
        }
        const sectionItems =
          section === "plans"
            ? (Array.isArray(nextState?.plans) ? nextState.plans : []).filter(
                (item) =>
                  !(typeof storageBundle?.isRecurringPlan === "function"
                    ? storageBundle.isRecurringPlan(item)
                    : String(item?.repeat || "").trim().toLowerCase() !== "none"),
              )
            : Array.isArray(nextState?.[section])
              ? nextState[section]
              : [];
        const existingItems = sectionItems.filter(
          (item) => getStorageSectionPeriodId(section, item) === periodId,
        );
        const incomingItems = cloneValue(operation?.payload?.items || []);
        const mergedItems =
          storageBundle?.mergePartitionItems?.(
            section,
            existingItems,
            incomingItems,
            operation?.payload?.mode === "merge" ? "merge" : "replace",
          ) || incomingItems;
        const remainingItems = sectionItems.filter(
          (item) => getStorageSectionPeriodId(section, item) !== periodId,
        );
        if (section === "plans") {
          nextState = {
            ...nextState,
            plans: [
              ...remainingItems,
              ...mergedItems,
              ...getStorageRecurringPlans(nextState),
            ],
          };
          return;
        }
        nextState = {
          ...nextState,
          [section]: [...remainingItems, ...mergedItems],
        };
        return;
      }

      if (operation.kind === "replaceRecurringPlans") {
        const recurringPlans = Array.isArray(operation.items)
          ? cloneValue(operation.items)
          : [];
        const oneTimePlans = (Array.isArray(nextState?.plans) ? nextState.plans : []).filter(
          (item) =>
            !(typeof storageBundle?.isRecurringPlan === "function"
              ? storageBundle.isRecurringPlan(item)
              : String(item?.repeat || "").trim().toLowerCase() !== "none"),
        );
        nextState = {
          ...nextState,
          plans: [...oneTimePlans, ...recurringPlans],
        };
      }
    });

    return nextState;
  }

  function buildStorageJournalResult(
    operations = [],
    metadata = {},
    extra = {},
  ) {
    const normalizedOperations = coalesceStorageJournalOperations(operations);
    const normalizedMetadata = collectStorageJournalMetadata(normalizedOperations);
    const changedSections =
      normalizedMetadata.changedSections.length ||
      Object.keys(normalizedMetadata.changedPeriods).length
        ? normalizedMetadata.changedSections
        : normalizeChangedSectionEntries(metadata.changedSections);
    const changedPeriods =
      Object.keys(normalizedMetadata.changedPeriods).length
        ? normalizedMetadata.changedPeriods
        : normalizeChangedPeriodEntries(metadata.changedPeriods);
    const result = {
      ok: extra?.ok !== false,
      opCount: normalizedOperations.length,
      changedSections,
      changedPeriods,
      generatedAt: new Date().toISOString(),
    };
    if (Array.isArray(extra?.results)) {
      result.results = cloneValue(extra.results);
    }
    if (typeof extra?.snapshotVersion === "string") {
      result.snapshotVersion = extra.snapshotVersion;
    }
    if (
      extra?.status &&
      typeof extra.status === "object" &&
      !Array.isArray(extra.status)
    ) {
      result.status = cloneValue(extra.status);
    }
    return result;
  }

  function getChangedSectionsForSharedStateKey(key) {
    const normalizedKey = resolveLocalStateKey(key);
    if (!normalizedKey || !isSharedStateKey(normalizedKey)) {
      return [];
    }
    return [normalizedKey];
  }

  function inferChangedSectionsFromCorePatch(partialCore = {}) {
    const source =
      partialCore && typeof partialCore === "object" && !Array.isArray(partialCore)
        ? partialCore
        : {};
    const sections = new Set();

    Object.keys(source).forEach((key) => {
      const normalizedKey = resolveLocalStateKey(key);
      if (!normalizedKey) {
        return;
      }
      if (PRECISE_CORE_SECTION_KEYS.has(normalizedKey)) {
        sections.add(normalizedKey);
        return;
      }
      if (normalizedKey === "recurringPlans") {
        sections.add("plansRecurring");
        return;
      }
      if (reservedMetadataKeys.has(normalizedKey)) {
        sections.add("core");
        return;
      }
      if (SHARED_STATE_KEYS.has(normalizedKey)) {
        sections.add(normalizedKey);
        return;
      }
      sections.add("core");
    });

    return sections.size ? Array.from(sections) : ["core"];
  }

  function normalizeVersionProbe(rawProbe, fallbackStatus = null) {
    const source =
      rawProbe && typeof rawProbe === "object"
        ? rawProbe
        : fallbackStatus && typeof fallbackStatus === "object"
          ? fallbackStatus
          : null;
    if (!source) {
      return null;
    }

    const size = Number.isFinite(source.size) ? Math.max(0, source.size) : 0;
    const modifiedAt = Number.isFinite(source.modifiedAt)
      ? Math.max(0, source.modifiedAt)
      : 0;
    const storagePath =
      typeof source.storagePath === "string" ? source.storagePath.trim() : "";
    const actualUri =
      typeof source.actualUri === "string" && source.actualUri.trim()
        ? source.actualUri.trim()
        : storagePath;
    const storageMode =
      typeof source.storageMode === "string" ? source.storageMode.trim() : "";
    const supportsModifiedAt =
      source.supportsModifiedAt === true || modifiedAt > 0;
    const fallbackHashUsed = source.fallbackHashUsed === true;
    const fingerprint =
      typeof source.fingerprint === "string" && source.fingerprint.trim()
        ? source.fingerprint.trim()
        : `${size}:${modifiedAt}:${actualUri || MOBILE_FILE_NAME}`;

    return {
      storagePath,
      actualUri,
      storageMode,
      size,
      modifiedAt,
      fingerprint,
      supportsModifiedAt,
      fallbackHashUsed,
    };
  }

  function createSourceSyncResult(state, status) {
    return {
      state: cloneValue(state),
      status: cloneValue(status),
    };
  }

  let lastStorageSyncErrorSignature = "";

  function clearStorageSyncError() {
    lastStorageSyncErrorSignature = "";
  }

  function reportStorageSyncError(message, options = {}) {
    const safeMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "同步存储读取失败，已保留当前页面数据。";
    const errorText =
      options.error instanceof Error
        ? options.error.message
        : typeof options.error === "string"
          ? options.error
          : "";
    const signature = `${options.reason || "storage-sync"}:${safeMessage}:${errorText}`;
    if (signature === lastStorageSyncErrorSignature) {
      return;
    }

    lastStorageSyncErrorSignature = signature;
    console.error(safeMessage, options.error || "");
    window.dispatchEvent(
      new CustomEvent(CONTROLER_STORAGE_ERROR_EVENT, {
        detail: {
          message: safeMessage,
          reason: options.reason || "",
          error: errorText,
        },
      }),
    );

    if (document.hidden) {
      return;
    }

    if (typeof window.ControlerUI?.alertDialog === "function") {
      void window.ControlerUI
        .alertDialog({
          title: "同步提示",
          message: safeMessage,
          confirmText: "知道了",
          danger: true,
        })
        .catch(() => {});
      return;
    }

    if (typeof window.alert === "function") {
      window.setTimeout(() => {
        try {
          window.alert(safeMessage);
        } catch (error) {
          console.error("显示同步错误提示失败:", error);
        }
      }, 0);
    }
  }

  function createNativeStorageApi(extra = {}) {
    return {
      isElectron: false,
      isNativeApp: false,
      platform: extra.platform || "web",
      get isReady() {
        return storageReady;
      },
      capabilities:
        extra.capabilities && typeof extra.capabilities === "object"
          ? { ...extra.capabilities }
          : {},
      async whenReady() {
        await storageReadyPromise;
        return true;
      },
      getItem(key) {
        return window.localStorage.getItem(key);
      },
      setItem(key, value) {
        window.localStorage.setItem(key, value);
      },
      removeItem(key) {
        window.localStorage.removeItem(key);
      },
      clear() {
        window.localStorage.clear();
      },
      key(index) {
        return window.localStorage.key(index);
      },
      keys() {
        const results = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key !== null) {
            results.push(key);
          }
        }
        return results;
      },
      dump() {
        const result = {};
        this.keys().forEach((key) => {
          result[key] = safeDeserialize(window.localStorage.getItem(key));
        });
        return result;
      },
      replaceAll(nextState) {
        window.localStorage.clear();
        if (nextState && typeof nextState === "object") {
          Object.keys(nextState).forEach((key) => {
            const value = nextState[key];
            if (value !== undefined) {
              window.localStorage.setItem(key, safeSerialize(value));
            }
          });
        }
        return cloneValue(nextState);
      },
      persist() {},
      async persistNow() {
        return null;
      },
      async flush() {
        return this.persistNow();
      },
      async getStorageStatus() {
        return null;
      },
      async appendJournal(ops = [], options = {}) {
        const normalizedOperations = coalesceStorageJournalOperations(ops);
        const metadata = collectStorageJournalMetadata(normalizedOperations);
        if (!normalizedOperations.length) {
          return buildStorageJournalResult([], metadata);
        }
        this.replaceAll(
          applyStorageJournalOperations(this.dump(), normalizedOperations),
        );
        await this.persistNow();
        return buildStorageJournalResult(normalizedOperations, metadata);
      },
      async flushJournal() {
        return this.flush();
      },
      async syncFromSource() {
        return {
          state: this.dump(),
          status: await this.getStorageStatus(),
        };
      },
    };
  }

  function dispatchStorageChangedEvent(reason, data, status = null, metadata = {}) {
    window.dispatchEvent(
      new CustomEvent(CONTROLER_STORAGE_EVENT, {
        detail: {
          reason,
          data: cloneValue(data),
          status: cloneValue(status),
          changedSections: Array.isArray(metadata.changedSections)
            ? [...metadata.changedSections]
            : [],
          changedPeriods:
            metadata.changedPeriods &&
            typeof metadata.changedPeriods === "object"
              ? cloneValue(metadata.changedPeriods)
              : {},
          source:
            typeof metadata.source === "string" ? metadata.source : "",
          snapshotFingerprint:
            typeof metadata.snapshotFingerprint === "string"
              ? metadata.snapshotFingerprint
              : "",
        },
      }),
    );
  }

  function bindExternalSyncAutoReload() {
    if (hasReactNativeStorageBridge) {
      return;
    }

    if (window.__controlerExternalSyncAutoReloadBound) {
      return;
    }

    window.__controlerExternalSyncAutoReloadBound = true;
    window.addEventListener(CONTROLER_STORAGE_EVENT, (event) => {
      const reason = event?.detail?.reason;
      if (reason !== "storage-path-changed") {
        return;
      }

      const deferredReloadController =
        window.__controlerExternalSyncAutoReloadController ||
        window.ControlerUI?.createDeferredRefreshController?.({
          delayMs: EXTERNAL_RELOAD_DELAY_MS,
          run: async () => {
            window.location.reload();
          },
        }) ||
        null;
      if (deferredReloadController) {
        window.__controlerExternalSyncAutoReloadController =
          deferredReloadController;
        deferredReloadController.enqueue(event?.detail || {});
        return;
      }

      window.clearTimeout(window.__controlerExternalSyncAutoReloadTimer);
      window.__controlerExternalSyncAutoReloadTimer = window.setTimeout(() => {
        window.location.reload();
      }, EXTERNAL_RELOAD_DELAY_MS);
    });
  }

  function installManagedLocalStorage(options) {
    const {
      isElectron = false,
      isNativeApp = false,
      platform = "web",
      capabilities = {},
      readState,
      assignState,
      persistState,
      persistNow,
      reloadState,
      getStorageStatus,
      syncFromSource,
      appendJournalImpl = null,
      flushJournalImpl = null,
      afterJournalStateApplied = null,
      journalBatchDelayMs = JOURNAL_BATCH_DELAY_MS,
      extraMethods = {},
    } = options;

    const normalizedJournalBatchDelayMs = Number.isFinite(journalBatchDelayMs)
      ? Math.max(0, Math.round(Number(journalBatchDelayMs)))
      : JOURNAL_BATCH_DELAY_MS;
    let pendingJournalEntries = [];
    let journalFlushTimer = 0;
    let journalCommitChain = Promise.resolve(null);

    function buildCurrentMergedState() {
      return buildMergedState(readState(), {
        includeAliases: true,
      });
    }

    function managedKeys() {
      const sharedKeys = Object.keys(readState()).filter(
        (key) => !reservedMetadataKeys.has(key),
      );
      const localKeys = listStoredLocalOnlyKeys();
      return [...new Set([...sharedKeys, ...localKeys])];
    }

    function getValue(key) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return null;
      }
      if (
        SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey) &&
        hasStoredRawLocalOnlyValue(normalizedKey)
      ) {
        return readRawLocalOnlyValue(normalizedKey);
      }
      if (!isSharedStateKey(normalizedKey)) {
        return readRawLocalOnlyValue(normalizedKey);
      }
      const state = readState();
      return Object.prototype.hasOwnProperty.call(state, normalizedKey)
        ? state[normalizedKey]
        : null;
    }

    function setValue(key, rawValue) {
      const normalizedKey = resolveLocalStateKey(key);
      const nextValue = safeDeserialize(rawValue);
      if (!isSharedStateKey(normalizedKey)) {
        writeRawLocalOnlyValue(normalizedKey, nextValue);
        return;
      }
      const state = readState();
      state[normalizedKey] = nextValue;
      if (SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey)) {
        writeRawLocalOnlyValue(normalizedKey, nextValue);
      }
      persistState({ reason: "set-item", key: normalizedKey });
    }

    function removeValue(key) {
      const normalizedKey = resolveLocalStateKey(key);
      if (!isSharedStateKey(normalizedKey)) {
        writeRawLocalOnlyValue(normalizedKey, undefined);
        return;
      }
      const state = readState();
      delete state[normalizedKey];
      if (SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey)) {
        writeRawLocalOnlyValue(normalizedKey, undefined);
      }
      persistState({ reason: "remove-item", key: normalizedKey });
    }

    function clearValues() {
      const state = readState();
      clearStoredLocalOnlyValues();
      assignState(
        normalizeState(
          {
            createdAt: state.createdAt,
            storagePath: state.storagePath,
            storageDirectory: state.storageDirectory,
            userDataPath: state.userDataPath,
            documentsPath: state.documentsPath,
            syncMeta: state.syncMeta,
          },
          {
            storagePath: state.storagePath,
            storageDirectory: state.storageDirectory,
            userDataPath: state.userDataPath,
            documentsPath: state.documentsPath,
            platform,
          },
        ),
      );
      persistState({ reason: "clear" });
    }

    function clearJournalFlushTimer() {
      if (journalFlushTimer) {
        window.clearTimeout(journalFlushTimer);
        journalFlushTimer = 0;
      }
    }

    function scheduleJournalFlush() {
      clearJournalFlushTimer();
      if (normalizedJournalBatchDelayMs <= 0) {
        void flushQueuedJournal().catch((error) => {
          console.error("批量追加存储日志失败:", error);
        });
        return;
      }
      journalFlushTimer = window.setTimeout(() => {
        journalFlushTimer = 0;
        void flushQueuedJournal().catch((error) => {
          console.error("批量追加存储日志失败:", error);
        });
      }, normalizedJournalBatchDelayMs);
    }

    async function runJournalCommit(entries = [], flushOptions = {}) {
      const operations = coalesceStorageJournalOperations(
        entries.flatMap((entry) => entry.operations || []),
      );
      const metadata = collectStorageJournalMetadata(operations);
      if (!operations.length) {
        return buildStorageJournalResult([], metadata);
      }
      if (typeof appendJournalImpl === "function") {
        return appendJournalImpl(operations, metadata, flushOptions);
      }
      persistState({
        reason:
          typeof flushOptions?.reason === "string" && flushOptions.reason.trim()
            ? flushOptions.reason.trim()
            : "journal-append",
        changedSections: metadata.changedSections,
        changedPeriods: metadata.changedPeriods,
      });
      if (typeof persistNow === "function") {
        const nextStatus = await persistNow();
        return buildStorageJournalResult(operations, metadata, {
          status:
            nextStatus && typeof nextStatus === "object" ? nextStatus : null,
        });
      }
      return buildStorageJournalResult(operations, metadata);
    }

    async function flushQueuedJournal(options = {}) {
      clearJournalFlushTimer();
      const pendingEntries = pendingJournalEntries;
      pendingJournalEntries = [];

      if (!pendingEntries.length) {
        const lastCommit = await journalCommitChain.catch(() => null);
        if (typeof flushJournalImpl === "function") {
          return flushJournalImpl(options, lastCommit);
        }
        if (typeof persistNow === "function") {
          return persistNow();
        }
        return cloneValue(readState());
      }

      const nextCommit = journalCommitChain
        .catch(() => null)
        .then(() => runJournalCommit(pendingEntries, options));
      journalCommitChain = nextCommit.catch(() => null);

      try {
        const result = await nextCommit;
        pendingEntries.forEach((entry) => {
          entry.resolve(cloneValue(result));
        });
        return result;
      } catch (error) {
        pendingEntries.forEach((entry) => {
          entry.reject(error);
        });
        throw error;
      }
    }

    nativeStoragePrototype.getItem = function getItem(key) {
      if (isLocalStorageTarget(this)) {
        return safeSerialize(getValue(String(key)));
      }
      return nativeMethods.getItem?.call(this, key) ?? null;
    };

    nativeStoragePrototype.setItem = function setItem(key, value) {
      if (isLocalStorageTarget(this)) {
        setValue(String(key), String(value));
        return;
      }
      return nativeMethods.setItem?.call(this, key, value);
    };

    nativeStoragePrototype.removeItem = function removeItem(key) {
      if (isLocalStorageTarget(this)) {
        removeValue(String(key));
        return;
      }
      return nativeMethods.removeItem?.call(this, key);
    };

    nativeStoragePrototype.clear = function clear() {
      if (isLocalStorageTarget(this)) {
        clearValues();
        return;
      }
      return nativeMethods.clear?.call(this);
    };

    nativeStoragePrototype.key = function key(index) {
      if (isLocalStorageTarget(this)) {
        return managedKeys()[index] ?? null;
      }
      return nativeMethods.key?.call(this, index) ?? null;
    };

    function normalizeDraftStorageKey(key) {
      return String(key || "").trim();
    }

    function getDraftFallbackStorageKey(key) {
      const normalizedKey = normalizeDraftStorageKey(key);
      return normalizedKey
        ? `${LOCAL_ONLY_STORAGE_PREFIX}draft:${normalizedKey}`
        : "";
    }

    function readFallbackDraftEnvelope(key) {
      const storageKey = getDraftFallbackStorageKey(key);
      if (!storageKey) {
        return null;
      }
      const rawValue = nativeMethods.getItem?.call(window.localStorage, storageKey);
      if (rawValue === null || rawValue === undefined) {
        return null;
      }
      const parsed = safeDeserialize(rawValue);
      return isPlainObject(parsed) ? parsed : null;
    }

    function writeFallbackDraftEnvelope(key, value) {
      const storageKey = getDraftFallbackStorageKey(key);
      if (!storageKey) {
        return null;
      }
      const envelope = {
        key: normalizeDraftStorageKey(key),
        updatedAt: new Date().toISOString(),
        value: cloneValue(typeof value === "undefined" ? null : value),
      };
      nativeMethods.setItem?.call(
        window.localStorage,
        storageKey,
        safeSerialize(envelope),
      );
      return envelope;
    }

    function removeFallbackDraftEnvelope(key) {
      const storageKey = getDraftFallbackStorageKey(key);
      if (!storageKey) {
        return false;
      }
      nativeMethods.removeItem?.call(window.localStorage, storageKey);
      return true;
    }

    if (nativeLengthDescriptor?.configurable) {
      Object.defineProperty(nativeStoragePrototype, "length", {
        configurable: true,
        enumerable: nativeLengthDescriptor.enumerable,
        get() {
          if (isLocalStorageTarget(this)) {
            return managedKeys().length;
          }
          return nativeLengthDescriptor.get?.call(this) ?? 0;
        },
      });
    }

    window.ControlerStorage = {
      isElectron,
      isNativeApp,
      platform,
      get isReady() {
        return storageReady;
      },
      capabilities:
        capabilities && typeof capabilities === "object" ? { ...capabilities } : {},
      async whenReady() {
        await storageReadyPromise;
        return true;
      },
      getItem(key) {
        return safeSerialize(getValue(String(key)));
      },
      setItem(key, value) {
        setValue(String(key), value);
      },
      removeItem(key) {
        removeValue(String(key));
      },
      clear() {
        clearValues();
      },
      key(index) {
        return managedKeys()[index] ?? null;
      },
      keys() {
        return managedKeys();
      },
      dump() {
        return buildCurrentMergedState();
      },
      replaceAll(nextState) {
        const currentState = readState();
        const sourceState =
          nextState && typeof nextState === "object" && !Array.isArray(nextState)
            ? nextState
            : {};
        Object.keys(sourceState).forEach((key) => {
          if (!isLocalStateKey(key)) {
            return;
          }
          writeRawLocalOnlyValue(key, sourceState[key]);
        });
        assignState(
          normalizeState(nextState, {
            storagePath: currentState?.storagePath || null,
            storageDirectory: currentState?.storageDirectory || null,
            userDataPath: currentState?.userDataPath || null,
            documentsPath: currentState?.documentsPath || null,
            createdAt: currentState?.createdAt || null,
            fileName: currentState?.syncMeta?.fileName || MOBILE_FILE_NAME,
            uri: currentState?.syncMeta?.uri || null,
            mode: currentState?.syncMeta?.mode || "folder-file",
            platform,
          }),
        );
        persistState({ reason: "replace-all" });
        return buildCurrentMergedState();
      },
      reload() {
        return buildMergedState(reloadState(), {
          includeAliases: true,
        });
      },
      persist() {
        persistState({ reason: "manual-persist" });
      },
      async persistNow() {
        return flushQueuedJournal({
          immediate: true,
          reason: "manual-persist-now",
        });
      },
      async flush() {
        return this.flushJournal();
      },
      async getStorageStatus() {
        if (typeof getStorageStatus !== "function") {
          return null;
        }
        return getStorageStatus();
      },
      async appendJournal(ops = [], options = {}) {
        const normalizedOptions =
          options && typeof options === "object" ? { ...options } : {};
        const normalizedOperations = coalesceStorageJournalOperations(ops);
        const metadata = collectStorageJournalMetadata(normalizedOperations);
        if (!normalizedOperations.length) {
          return buildStorageJournalResult([], metadata);
        }

        const nextState = applyStorageJournalOperations(
          readState(),
          normalizedOperations,
        );
        assignState(nextState);
        if (typeof afterJournalStateApplied === "function") {
          afterJournalStateApplied(
            nextState,
            normalizedOperations,
            metadata,
            normalizedOptions,
          );
        }

        const pendingPromise = new Promise((resolve, reject) => {
          pendingJournalEntries.push({
            operations: normalizedOperations,
            metadata,
            resolve,
            reject,
          });
        });

        if (
          normalizedOptions.flush === true ||
          normalizedOptions.immediate === true
        ) {
          return flushQueuedJournal({
            ...normalizedOptions,
            immediate: true,
          });
        }

        scheduleJournalFlush();
        return pendingPromise;
      },
      async flushJournal(options = {}) {
        const normalizedOptions =
          options && typeof options === "object" ? { ...options } : {};
        return flushQueuedJournal({
          ...normalizedOptions,
          immediate: true,
          reason:
            typeof normalizedOptions.reason === "string" &&
            normalizedOptions.reason.trim()
              ? normalizedOptions.reason.trim()
              : "journal-flush",
        });
      },
      peekPageBootstrapState(pageKey, options = {}) {
        return buildPageBootstrapStateFromState(
          buildCurrentMergedState(),
          pageKey,
          options,
        );
      },
      async getDraft(key, options = {}) {
        const envelope = readFallbackDraftEnvelope(key);
        if (!envelope) {
          return null;
        }
        return options?.includeEnvelope === true
          ? cloneValue(envelope)
          : cloneValue(envelope.value);
      },
      async setDraft(key, value) {
        const envelope = writeFallbackDraftEnvelope(key, value);
        return envelope ? cloneValue(envelope) : null;
      },
      async removeDraft(key) {
        return removeFallbackDraftEnvelope(key);
      },
      getPageBootstrapStateSync(pageKey, options = {}) {
        return this.peekPageBootstrapState(pageKey, options);
      },
      async getPageBootstrapState(pageKey, options = {}) {
        return this.peekPageBootstrapState(pageKey, options);
      },
      async getPlanBootstrapState(options = {}) {
        const pageBootstrap = await this.getPageBootstrapState("plan", options);
        return (
          pageBootstrap?.data && typeof pageBootstrap.data === "object"
            ? {
                yearlyGoals: cloneValue(pageBootstrap.data.yearlyGoals || {}),
                recurringPlans: cloneValue(
                  Array.isArray(pageBootstrap.data.recurringPlans)
                    ? pageBootstrap.data.recurringPlans
                    : [],
                ),
              }
            : {}
        );
      },
      async syncFromSource(options = {}) {
        if (typeof syncFromSource === "function") {
          return syncFromSource(options);
        }
        const nextState = buildMergedState(reloadState(), {
          includeAliases: true,
        });
        const nextStatus =
          typeof getStorageStatus === "function" ? await getStorageStatus() : null;
        return {
          state: nextState,
          status: cloneValue(nextStatus),
        };
      },
    };

    Object.keys(extraMethods).forEach((key) => {
      if (typeof extraMethods[key] === "function") {
        window.ControlerStorage[key] = extraMethods[key];
      }
    });
  }

  if (!nativeStoragePrototype) {
    window.ControlerStorage = createNativeStorageApi({
      capabilities: resolvedRuntimeCapabilities,
    });
    return;
  }

  if (hasElectronStorageBridge) {
    let cachedState = null;
    let cachedStatus = null;
    let writeTimer = null;
    let writeChain = Promise.resolve();
    let hasPendingStateChanges = false;
    let pendingElectronWriteReason = "";
    let pendingElectronStorageChangedSections = new Set();
    let pendingElectronStorageChangedPeriods = {};

    function readState() {
      if (cachedState) {
        return cachedState;
      }

      try {
        const rawState = electronAPI.storageLoadSync() || {};
        adoptLegacyLocalOnlyValues(rawState);
        cachedState = normalizeState(rawState);
        persistSharedBootstrapMirrors(cachedState);
      } catch (error) {
        console.error("同步读取 Electron 存储失败，回退为空状态:", error);
        cachedState = normalizeState({});
        persistSharedBootstrapMirrors(cachedState);
      }

      return cachedState;
    }

    function assignState(nextState) {
      adoptLegacyLocalOnlyValues(nextState);
      cachedState = normalizeState(nextState);
      persistSharedBootstrapMirrors(cachedState);
      return cachedState;
    }

    function markPendingElectronStorageChangeMetadata(metadata = {}) {
      normalizeChangedSectionEntries(metadata.changedSections).forEach((section) => {
        pendingElectronStorageChangedSections.add(section);
      });
      pendingElectronStorageChangedPeriods = mergeChangedPeriodEntries(
        pendingElectronStorageChangedPeriods,
        metadata.changedPeriods,
      );
    }

    function peekPendingElectronStorageChangeMetadata() {
      return {
        changedSections: Array.from(pendingElectronStorageChangedSections),
        changedPeriods: normalizeChangedPeriodEntries(
          pendingElectronStorageChangedPeriods,
        ),
      };
    }

    function clearPendingElectronStorageChangeMetadata() {
      pendingElectronStorageChangedSections.clear();
      pendingElectronStorageChangedPeriods = {};
    }

    async function flushElectronState() {
      const pendingChangeMetadata = peekPendingElectronStorageChangeMetadata();
      const nextState = normalizeState(readState(), {
        touchModified: true,
        touchSyncSave: true,
      });
      cachedState = nextState;
      await electronAPI.storageSaveSnapshot(nextState, {
        reason: pendingElectronWriteReason || "save",
        changedSections: pendingChangeMetadata.changedSections,
        changedPeriods: pendingChangeMetadata.changedPeriods,
      });
      cachedStatus = await electronAPI.storageFlush().catch((error) => {
        console.error("刷新 Electron 存储状态失败:", error);
        return null;
      });
      hasPendingStateChanges = false;
      pendingElectronWriteReason = "";
      clearPendingElectronStorageChangeMetadata();
      return cachedStatus;
    }

    function persistState(options = {}) {
      const normalizedKey = resolveLocalStateKey(options?.key);
      const normalizedChangedSections = normalizeChangedSectionEntries(
        options?.changedSections,
      );
      const normalizedChangedPeriods = normalizeChangedPeriodEntries(
        options?.changedPeriods,
      );
      if (normalizedChangedSections.length) {
        markPendingElectronStorageChangeMetadata({
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (isSharedStateKey(normalizedKey)) {
        markPendingElectronStorageChangeMetadata({
          changedSections: getChangedSectionsForSharedStateKey(normalizedKey),
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (options?.reason === "core-replace") {
        markPendingElectronStorageChangeMetadata({
          changedSections: inferChangedSectionsFromCorePatch(options?.partialCore),
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (options?.reason === "plans-recurring-replace") {
        markPendingElectronStorageChangeMetadata({
          changedSections: ["plansRecurring"],
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (
        options?.reason === "clear" ||
        options?.reason === "replace-all"
      ) {
        markPendingElectronStorageChangeMetadata({
          changedSections: DEFAULT_CHANGED_SECTIONS,
          changedPeriods: normalizedChangedPeriods,
        });
      }
      pendingElectronWriteReason =
        typeof options?.reason === "string" && options.reason.trim()
          ? options.reason.trim()
          : pendingElectronWriteReason || "save";
      hasPendingStateChanges = true;
      window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => {
        writeChain = writeChain
          .then(async () => {
            if (!hasPendingStateChanges) {
              return cachedStatus;
            }
            return flushElectronState();
          })
          .catch((error) => {
            console.error("异步写入 Electron 存储失败:", error);
            return cachedStatus;
          });
      }, ELECTRON_WRITE_DELAY_MS);
    }

    async function syncFromElectronSource(options = {}) {
      const reason =
        typeof options.reason === "string" && options.reason.trim()
          ? options.reason.trim()
          : "manual-sync";
      const currentSnapshot = createComparableSnapshot(readState());
      const nextRawState =
        (await electronAPI.storageLoadSnapshot().catch((error) => {
          console.error("异步读取 Electron 存储失败，回退同步读取:", error);
          cachedState = null;
          return readState();
        })) || {};
      adoptLegacyLocalOnlyValues(nextRawState);
      const nextState = normalizeState(nextRawState);
      cachedState = nextState;
      persistSharedBootstrapMirrors(nextState);
      const nextSnapshot = createComparableSnapshot(nextState);
      const nextStatus =
        options.status ||
        (await electronAPI.storageStatus().catch((error) => {
          console.error("获取 Electron 存储状态失败:", error);
          return null;
        }));
      cachedStatus = nextStatus;

      clearStorageSyncError();
      if (
        reason &&
        (reason === "storage-path-changed" || nextSnapshot !== currentSnapshot)
      ) {
        dispatchStorageChangedEvent(
          reason,
          buildMergedState(nextState),
          nextStatus,
          {
            changedSections: options.changedSections || [],
            changedPeriods: options.changedPeriods || {},
            source: options.source || "",
            snapshotFingerprint: options.snapshotFingerprint || "",
          },
        );
      }

      return createSourceSyncResult(buildMergedState(nextState), nextStatus);
    }

    installManagedLocalStorage({
      isElectron: true,
      platform: electronAPI.platform || "desktop",
      capabilities: resolvedRuntimeCapabilities,
      readState,
      assignState,
      persistState,
      async persistNow() {
        window.clearTimeout(writeTimer);
        const nextWrite = writeChain.then(async () => {
          if (hasPendingStateChanges) {
            return flushElectronState();
          }
          if (cachedStatus) {
            return cachedStatus;
          }
          cachedStatus = await electronAPI.storageStatus().catch((error) => {
            console.error("获取 Electron 存储状态失败:", error);
            return null;
          });
          return cachedStatus;
        });
        writeChain = nextWrite.catch((error) => {
          console.error("立即写入 Electron 存储失败:", error);
          return cachedStatus;
        });
        return nextWrite;
      },
      reloadState() {
        cachedState = null;
        return readState();
      },
      async getStorageStatus() {
        try {
          cachedStatus = await electronAPI.storageStatus();
          return cachedStatus;
        } catch (error) {
          console.error("获取 Electron 存储状态失败:", error);
          return null;
        }
      },
      syncFromSource(options = {}) {
        return syncFromElectronSource(options);
      },
      appendJournalImpl: async (operations = [], metadata = {}, options = {}) => {
        const reason =
          typeof options?.reason === "string" && options.reason.trim()
            ? options.reason.trim()
            : "journal-append";
        if (typeof electronAPI.storageAppendJournal === "function") {
          const rawResult = await electronAPI.storageAppendJournal(
            operations,
            options,
          );
          const parsedResult =
            rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
              ? rawResult
              : {};
          const changedSections = normalizeChangedSectionsList(
            parsedResult.changedSections || metadata.changedSections,
          );
          const changedPeriods = normalizeChangedPeriodsMap(
            parsedResult.changedPeriods || metadata.changedPeriods,
          );
          const syncResult = await syncFromElectronSource({
            reason,
            changedSections,
            changedPeriods,
            source: "renderer",
            status:
              parsedResult.status &&
              typeof parsedResult.status === "object" &&
              !Array.isArray(parsedResult.status)
                ? parsedResult.status
                : null,
            snapshotFingerprint:
              typeof parsedResult.snapshotVersion === "string"
                ? parsedResult.snapshotVersion
                : "",
          });
          const nextStatus = syncResult?.status || cachedStatus || null;
          return buildStorageJournalResult(operations, metadata, {
            status: nextStatus,
            snapshotVersion:
              typeof parsedResult.snapshotVersion === "string" &&
              parsedResult.snapshotVersion
                ? parsedResult.snapshotVersion
                : typeof nextStatus?.fingerprint === "string"
                  ? nextStatus.fingerprint
                  : "",
          });
        }
        markPendingElectronStorageChangeMetadata(metadata);
        pendingElectronWriteReason = reason;
        hasPendingStateChanges = true;
        const nextStatus = await flushElectronState();
        return buildStorageJournalResult(operations, metadata, {
          status: nextStatus,
          snapshotVersion:
            typeof nextStatus?.fingerprint === "string"
              ? nextStatus.fingerprint
              : "",
        });
      },
      flushJournalImpl: async () => {
        if (hasPendingStateChanges) {
          return flushElectronState();
        }
        if (cachedStatus) {
          return cachedStatus;
        }
        cachedStatus = await electronAPI.storageStatus().catch((error) => {
          console.error("获取 Electron 存储状态失败:", error);
          return null;
        });
        return cachedStatus;
      },
      extraMethods: {
        peekPageBootstrapState(pageKey, options = {}) {
          if (typeof electronAPI.storageGetPageBootstrapStateSync === "function") {
            try {
              const payload = electronAPI.storageGetPageBootstrapStateSync(
                pageKey,
                options,
              );
              return normalizePageBootstrapEnvelope(
                pageKey,
                payload,
                options,
                buildCurrentMergedState(),
                {
                  storageStatus: cachedStatus,
                },
              );
            } catch (error) {
              console.error("同步读取 Electron 页面引导状态失败，回退内存快照:", error);
            }
          }
          return buildPageBootstrapStateFromState(
            buildCurrentMergedState(),
            pageKey,
            options,
            {
              storageStatus: cachedStatus,
            },
          );
        },
        getPageBootstrapStateSync(pageKey, options = {}) {
          return this.peekPageBootstrapState(pageKey, options);
        },
        async getPageBootstrapState(pageKey, options = {}) {
          if (typeof electronAPI.storageGetPageBootstrapState === "function") {
            try {
              const payload = await electronAPI.storageGetPageBootstrapState(
                pageKey,
                options,
              );
              return normalizePageBootstrapEnvelope(
                pageKey,
                payload,
                options,
                buildCurrentMergedState(),
                {
                  storageStatus: cachedStatus,
                },
              );
            } catch (error) {
              console.error("读取 Electron 页面引导状态失败，回退本地快照:", error);
            }
          }
          try {
            return await buildPageBootstrapStateFromAsyncLoaders(
              pageKey,
              options,
              {
                fallbackState: buildCurrentMergedState(),
                getCoreState: async () =>
                  typeof electronAPI.storageGetCoreState === "function"
                    ? electronAPI.storageGetCoreState()
                    : null,
                loadSectionRange: async (section, scope = {}) =>
                  typeof electronAPI.storageLoadSectionRange === "function"
                    ? electronAPI.storageLoadSectionRange(section, scope)
                    : null,
                getStorageStatus: async () =>
                  typeof electronAPI.storageStatus === "function"
                    ? electronAPI.storageStatus()
                    : cachedStatus,
                getAutoBackupStatus: async () =>
                  typeof electronAPI.storageGetAutoBackupStatus === "function"
                    ? electronAPI.storageGetAutoBackupStatus()
                    : null,
              },
            );
          } catch (error) {
            console.error("拼装 Electron 页面引导状态失败，回退同步快照:", error);
          }
          return this.peekPageBootstrapState(pageKey, options);
        },
        async getDraft(key, options = {}) {
          if (typeof electronAPI.storageGetDraft === "function") {
            try {
              return await electronAPI.storageGetDraft(key, options);
            } catch (error) {
              console.error("读取 Electron 草稿失败，回退本地缓存:", error);
            }
          }
          const storageKey = `${LOCAL_ONLY_STORAGE_PREFIX}draft:${String(key || "").trim()}`;
          const rawValue = nativeMethods.getItem?.call(window.localStorage, storageKey);
          if (rawValue === null || rawValue === undefined) {
            return null;
          }
          const parsed = safeDeserialize(rawValue);
          if (!isPlainObject(parsed)) {
            return null;
          }
          return options?.includeEnvelope === true
            ? parsed
            : cloneValue(parsed.value);
        },
        async setDraft(key, value, options = {}) {
          if (typeof electronAPI.storageSetDraft === "function") {
            try {
              return await electronAPI.storageSetDraft(key, value, options);
            } catch (error) {
              console.error("写入 Electron 草稿失败，回退本地缓存:", error);
            }
          }
          const envelope = {
            key: String(key || "").trim(),
            updatedAt: new Date().toISOString(),
            value: cloneValue(typeof value === "undefined" ? null : value),
          };
          nativeMethods.setItem?.call(
            window.localStorage,
            `${LOCAL_ONLY_STORAGE_PREFIX}draft:${envelope.key}`,
            safeSerialize(envelope),
          );
          return envelope;
        },
        async removeDraft(key) {
          if (typeof electronAPI.storageRemoveDraft === "function") {
            try {
              return await electronAPI.storageRemoveDraft(key);
            } catch (error) {
              console.error("删除 Electron 草稿失败，回退本地缓存:", error);
            }
          }
          nativeMethods.removeItem?.call(
            window.localStorage,
            `${LOCAL_ONLY_STORAGE_PREFIX}draft:${String(key || "").trim()}`,
          );
          return true;
        },
        async getManifest() {
          if (typeof electronAPI.storageGetManifest !== "function") {
            return null;
          }
          return electronAPI.storageGetManifest();
        },
        async getCoreState() {
          if (typeof electronAPI.storageGetCoreState !== "function") {
            return null;
          }
          const payload = await electronAPI.storageGetCoreState();
          return normalizeCorePayloadProjects(payload).payload;
        },
        async getPlanBootstrapState(options = {}) {
          const pageBootstrap = await this.getPageBootstrapState("plan", options);
          return (
            pageBootstrap?.data && typeof pageBootstrap.data === "object"
              ? {
                  yearlyGoals: cloneValue(pageBootstrap.data.yearlyGoals || {}),
                  recurringPlans: cloneValue(
                    Array.isArray(pageBootstrap.data.recurringPlans)
                      ? pageBootstrap.data.recurringPlans
                      : [],
                  ),
                }
              : {}
          );
        },
        async getAutoBackupStatus() {
          if (typeof electronAPI.storageGetAutoBackupStatus !== "function") {
            return null;
          }
          return electronAPI.storageGetAutoBackupStatus();
        },
        async updateAutoBackupSettings(settings = {}) {
          if (typeof electronAPI.storageUpdateAutoBackupSettings !== "function") {
            return null;
          }
          return electronAPI.storageUpdateAutoBackupSettings(settings);
        },
        async runAutoBackupNow() {
          if (typeof electronAPI.storageRunAutoBackupNow !== "function") {
            return null;
          }
          return electronAPI.storageRunAutoBackupNow();
        },
        async shareLatestBackup() {
          if (typeof electronAPI.storageShareLatestBackup !== "function") {
            return null;
          }
          return electronAPI.storageShareLatestBackup();
        },
        async loadSectionRange(section, scope = {}) {
          if (typeof electronAPI.storageLoadSectionRange !== "function") {
            return null;
          }
          return electronAPI.storageLoadSectionRange(section, scope);
        },
        async saveSectionRange(section, payload = {}) {
          if (typeof electronAPI.storageSaveSectionRange !== "function") {
            return null;
          }
          const result = await electronAPI.storageSaveSectionRange(section, payload);
          await syncFromElectronSource({
            reason: "section-save",
            changedSections: [section],
            changedPeriods:
              payload?.periodId && typeof payload.periodId === "string"
                ? { [section]: [payload.periodId] }
                : {},
            source: "renderer",
          });
          return result;
        },
        async replaceCoreState(partialCore = {}, options = {}) {
          if (typeof electronAPI.storageReplaceCoreState !== "function") {
            return null;
          }
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const normalizedCorePatch = normalizeCorePayloadProjects(partialCore).payload;
          const changedSections = inferChangedSectionsFromCorePatch(
            normalizedCorePatch,
          );
          const result = await electronAPI.storageReplaceCoreState(
            normalizedCorePatch,
            normalizedOptions,
          );
          if (normalizedOptions.emitChange === false) {
            assignState({
              ...readState(),
              ...(normalizedCorePatch &&
              typeof normalizedCorePatch === "object" &&
              !Array.isArray(normalizedCorePatch)
                ? normalizedCorePatch
                : {}),
            });
            return result;
          }
          await syncFromElectronSource({
            reason:
              typeof normalizedOptions.reason === "string" &&
              normalizedOptions.reason.trim()
                ? normalizedOptions.reason.trim()
                : "core-replace",
            changedSections,
            source: "renderer",
          });
          return result;
        },
        async replaceRecurringPlans(items = []) {
          if (typeof electronAPI.storageReplaceRecurringPlans !== "function") {
            return null;
          }
          const result = await electronAPI.storageReplaceRecurringPlans(items);
          await syncFromElectronSource({
            reason: "plans-recurring-replace",
            changedSections: ["plansRecurring"],
            source: "renderer",
          });
          return result;
        },
        async exportBundle(options = {}) {
          if (typeof electronAPI.storageExportBundle === "function") {
            return electronAPI.storageExportBundle(options);
          }
          if (options?.filePath) {
            return electronAPI.storageExport(options.filePath);
          }
          return null;
        },
        async importSource(options = {}) {
          if (typeof electronAPI.storageImportSource === "function") {
            const result = await electronAPI.storageImportSource(options);
            await syncFromElectronSource({
              reason: "import",
              changedSections: Array.isArray(result?.changedSections)
                ? result.changedSections
                : DEFAULT_CHANGED_SECTIONS,
              changedPeriods:
                result?.changedPeriods && typeof result.changedPeriods === "object"
                  ? result.changedPeriods
                  : {},
              source: "renderer",
            });
            return result;
          }
          if (options?.filePath) {
            const result = await electronAPI.storageImport(options.filePath);
            await syncFromElectronSource({
              reason: "import",
              changedSections: DEFAULT_CHANGED_SECTIONS,
              source: "renderer",
            });
            return result;
          }
          return null;
        },
      },
    });

    if (typeof electronAPI.onStorageDataChanged === "function") {
      electronAPI.onStorageDataChanged((_event, payload) => {
        writeChain = writeChain
          .then(async () => {
            window.clearTimeout(writeTimer);
            hasPendingStateChanges = false;
            pendingElectronWriteReason = "";
            clearPendingElectronStorageChangeMetadata();
            const reason =
              typeof payload?.reason === "string" && payload.reason.trim()
                ? payload.reason.trim()
                : "external-update";
            return syncFromElectronSource({
              reason,
              status: payload?.status || null,
              changedSections: payload?.changedSections || [],
              changedPeriods: payload?.changedPeriods || {},
              source: payload?.source || "",
              snapshotFingerprint: payload?.snapshotFingerprint || "",
            });
          })
          .catch((error) => {
            console.error("同步 Electron 外部存储变更失败:", error);
          });
      });
    }

    window.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        void window.ControlerStorage?.persistNow?.();
      }
    });
    window.addEventListener("pagehide", () => {
      void window.ControlerStorage?.persistNow?.();
    });
    window.addEventListener("beforeunload", () => {
      window.clearTimeout(writeTimer);
      void window.ControlerStorage?.persistNow?.();
    });

    bindExternalSyncAutoReload();
    return;
  }

  if (hasReactNativeStorageBridge) {
    const platform =
      typeof reactNativeBridge.platform === "string"
        ? reactNativeBridge.platform
        : "native";
    const useAndroidProbeLoop = platform === "android";
    const buildLegacyBrowserMetadata = (extra = {}) => ({
      storagePath: "browser://localStorage/bundle-manifest.json",
      storageDirectory: "browser://localStorage",
      userDataPath: "Browser LocalStorage",
      documentsPath: "Browser LocalStorage",
      platform,
      fileName: MOBILE_FILE_NAME,
      uri: BROWSER_STATE_KEY,
      ...extra,
    });

    function readLegacyBrowserBootstrapState() {
      const rawRoot =
        nativeMethods.getItem?.call(window.localStorage, BROWSER_STATE_KEY) || "";
      const migratedState = normalizeState({}, buildLegacyBrowserMetadata());
      const migratedKeys = [];
      let shouldRewriteRoot = false;

      if (typeof rawRoot === "string" && rawRoot.trim()) {
        const parsedRootState = parseJsonSafely(rawRoot, {});
        adoptLegacyLocalOnlyValues(parsedRootState);
        const normalizedRootState = normalizeState(
          parsedRootState,
          buildLegacyBrowserMetadata(),
        );
        Object.assign(migratedState, normalizedRootState);
        shouldRewriteRoot =
          JSON.stringify(normalizedRootState) !== JSON.stringify(parsedRootState);
      }

      const rawLength =
        nativeLengthDescriptor?.get?.call(window.localStorage) ??
        window.localStorage.length;

      for (let index = 0; index < rawLength; index += 1) {
        const key = nativeMethods.key?.call(window.localStorage, index);
        if (
          !key ||
          key === BROWSER_STATE_KEY ||
          key === MOBILE_MIRROR_STATE_KEY ||
          key === MOBILE_MIRROR_STATUS_KEY ||
          key === MOBILE_MIRROR_PENDING_WRITE_KEY ||
          key.startsWith(LOCAL_ONLY_STORAGE_PREFIX)
        ) {
          continue;
        }

        migratedKeys.push(key);
        const rawValue = safeDeserialize(
          nativeMethods.getItem?.call(window.localStorage, key),
        );
        if (isSharedStateKey(key)) {
          migratedState[key] = rawValue;
        } else {
          writeRawLocalOnlyValue(key, rawValue);
        }
        shouldRewriteRoot = true;
      }

      if (shouldRewriteRoot || typeof rawRoot !== "string" || !rawRoot.trim()) {
        nativeMethods.setItem?.call(
          window.localStorage,
          BROWSER_STATE_KEY,
          JSON.stringify(migratedState),
        );
      }
      migratedKeys.forEach((key) => {
        nativeMethods.removeItem?.call(window.localStorage, key);
      });

      return {
        state: normalizeState(migratedState, buildLegacyBrowserMetadata()),
        didMigrate: shouldRewriteRoot || migratedKeys.length > 0,
      };
    }

    const legacyBrowserBootstrap = readLegacyBrowserBootstrapState();
    const emptyComparableSnapshot = createComparableSnapshot(
      normalizeState({}, buildLegacyBrowserMetadata()),
    );
    const initialMirrorStateRaw =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATE_KEY) || "";
    const initialMirrorPendingWriteRaw =
      nativeMethods.getItem?.call(
        window.localStorage,
        MOBILE_MIRROR_PENDING_WRITE_KEY,
      ) || "";
    const initialMirrorPendingWrite =
      initialMirrorPendingWriteRaw === "1" ||
      initialMirrorPendingWriteRaw === "true";
    const initialMirrorState = parseJsonSafely(
      initialMirrorStateRaw,
      {},
    );
    adoptLegacyLocalOnlyValues(initialMirrorState);
    const initialMirrorComparableSnapshot = createComparableSnapshot(
      normalizeState(initialMirrorState, {
        platform,
      }),
    );
    const legacyBrowserComparableSnapshot = createComparableSnapshot(
      legacyBrowserBootstrap.state,
    );
    const shouldAdoptLegacyBrowserBootstrap =
      legacyBrowserComparableSnapshot !== emptyComparableSnapshot &&
      (
        !initialMirrorStateRaw.trim() ||
        initialMirrorPendingWrite ||
        initialMirrorComparableSnapshot === emptyComparableSnapshot
      );
    const initialBootstrapState = shouldAdoptLegacyBrowserBootstrap
      ? legacyBrowserBootstrap.state
      : initialMirrorState;
    const initialPendingWrite =
      initialMirrorPendingWrite || shouldAdoptLegacyBrowserBootstrap;
    let cachedState = normalizeState(initialBootstrapState, {
      platform,
    });
    let cachedStatus =
      parseJsonSafely(
        nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATUS_KEY),
        null,
      ) || null;
    let writeTimer = null;
    let writeChain = Promise.resolve();
    let mirrorFlushTimer = null;
    let nativeForegroundSyncTimer = null;
    let nativeProbeLoopTimer = null;
    let nativeStatusRefreshPromise = null;
    let nativeProbeInFlight = false;
    let nativeFastProbeUntil = 0;
    let recentNativeLocalWriteAt = 0;
    let lastFallbackHashProbeAt = 0;
    let lastWrittenComparableSnapshot = initialPendingWrite
      ? ""
      : createComparableSnapshot(cachedState);
    let lastMirroredStateJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATE_KEY) || "";
    let lastMirroredStatusJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATUS_KEY) || "";
    let lastMirroredPendingWriteValue = initialPendingWrite ? "1" : "0";
    let hasPendingStateChanges = initialPendingWrite;
    let managedStateRevision = initialPendingWrite ? 1 : 0;
    let lastKnownVersionProbe = normalizeVersionProbe(cachedStatus, cachedStatus);
    let nativeBaselineFingerprint = lastKnownVersionProbe?.fingerprint || "";
    const nativeSyncBootstrapStartedAt = Date.now();
    let nativeInitializationSettled = false;
    let pendingForegroundSyncRequest = null;
    let shellPageActive =
      window.__CONTROLER_SHELL_VISIBILITY__?.active !== false;
    const MANAGED_RANGE_SECTIONS = [
      "records",
      "dailyCheckins",
      "checkins",
      "plans",
      "diaryEntries",
    ];
    let hasManagedCoreSnapshot =
      !!initialMirrorStateRaw.trim() || shouldAdoptLegacyBrowserBootstrap;
    let managedFullyHydratedSections = new Set();
    let managedSectionCoverage = {};
    let pendingNativeSharedKeyWrites = new Set();
    let pendingNativeStorageChangedSections = new Set();
    let pendingNativeStorageChangedPeriods = {};

    function createManagedSectionCoverage() {
      return MANAGED_RANGE_SECTIONS.reduce((coverage, section) => {
        coverage[section] = new Set();
        return coverage;
      }, {});
    }

    function normalizeChangedSectionsList(changedSections = []) {
      return normalizeChangedSectionEntries(changedSections);
    }

    function normalizeChangedPeriodsMap(changedPeriods = {}) {
      return normalizeChangedPeriodEntries(changedPeriods);
    }

    function markPendingNativeSharedKeyChanges(sharedKeys = []) {
      normalizeChangedSectionsList(sharedKeys).forEach((key) => {
        if (isSharedStateKey(key)) {
          pendingNativeSharedKeyWrites.add(key);
        }
      });
    }

    function peekPendingNativeSharedKeyChanges() {
      return Array.from(pendingNativeSharedKeyWrites);
    }

    function markPendingNativeStorageChangeMetadata(metadata = {}) {
      normalizeChangedSectionsList(metadata.changedSections).forEach((section) => {
        pendingNativeStorageChangedSections.add(section);
      });
      pendingNativeStorageChangedPeriods = mergeChangedPeriodEntries(
        pendingNativeStorageChangedPeriods,
        metadata.changedPeriods,
      );
    }

    function markPendingNativeSharedSectionChanges(
      changedSections = [],
      options = {},
    ) {
      normalizeChangedSectionsList(changedSections).forEach((section) => {
        pendingNativeStorageChangedSections.add(section);
      });
      pendingNativeStorageChangedPeriods = mergeChangedPeriodEntries(
        pendingNativeStorageChangedPeriods,
        options.changedPeriods,
      );
    }

    function consumePendingNativeStorageChangeMetadata() {
      const changedSections = Array.from(pendingNativeStorageChangedSections);
      const changedPeriods = normalizeChangedPeriodsMap(
        pendingNativeStorageChangedPeriods,
      );
      pendingNativeSharedKeyWrites.clear();
      pendingNativeStorageChangedSections.clear();
      pendingNativeStorageChangedPeriods = {};
      return {
        changedSections,
        changedPeriods,
      };
    }

    function emitNativeStorageChangedBridgeEvent(reason, metadata = {}) {
      const changedSections = normalizeChangedSectionsList(metadata.changedSections);
      const changedPeriods = normalizeChangedPeriodsMap(metadata.changedPeriods);
      if (!changedSections.length && !Object.keys(changedPeriods).length) {
        return;
      }
      window.ControlerNativeBridge?.emitEvent?.("storage.changed", {
        reason:
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : "external-update",
        changedSections,
        changedPeriods,
        source:
          typeof metadata.source === "string" && metadata.source.trim()
            ? metadata.source.trim()
            : "renderer",
      });
    }

    function getNativeStorageSyncErrorText(error) {
      if (error instanceof Error) {
        return error.message || "";
      }
      return typeof error === "string" ? error : "";
    }

    function isTransientNativeBridgeError(error) {
      const errorText = getNativeStorageSyncErrorText(error);
      if (!errorText) {
        return false;
      }
      return (
        /Native bridge (?:timeout|unavailable)/i.test(errorText) ||
        /(webview|bridge).*(destroy|reload|loading|detach|not\s+ready|unavailable)/i.test(
          errorText,
        )
      );
    }

    function shouldSuppressNativeStorageSyncError(options = {}) {
      if (!shellPageActive) {
        return true;
      }
      if (document.hidden) {
        return true;
      }

      if (
        !nativeInitializationSettled &&
        Date.now() - nativeSyncBootstrapStartedAt <= NATIVE_BOOTSTRAP_SYNC_GRACE_MS
      ) {
        return true;
      }

      const reason =
        typeof options.reason === "string" ? options.reason.trim() : "";
      if (
        reason &&
        recentNativeLocalWriteAt > 0 &&
        Date.now() - recentNativeLocalWriteAt <=
          NATIVE_LOCAL_WRITE_ERROR_SUPPRESS_MS &&
        (
          reason === "native-read-state" ||
          reason === "native-get-status" ||
          reason === "native-get-core-state" ||
          reason === "native-probe-state"
        )
      ) {
        return true;
      }

      return isTransientNativeBridgeError(options.error);
    }

    function reportNativeStorageSyncError(message, options = {}) {
      if (shouldSuppressNativeStorageSyncError(options)) {
        console.warn(message, options.error || "");
        return;
      }
      reportStorageSyncError(message, options);
    }

    function buildMobileMetadata(extra = {}) {
      return {
        storagePath:
          typeof extra.storagePath === "string"
            ? extra.storagePath
            : typeof cachedStatus?.storagePath === "string"
              ? cachedStatus.storagePath
              : null,
        storageDirectory:
          typeof extra.storageDirectory === "string"
            ? extra.storageDirectory
            : typeof cachedStatus?.storageDirectory === "string"
              ? cachedStatus.storageDirectory
              : null,
        userDataPath:
          typeof extra.userDataPath === "string"
            ? extra.userDataPath
            : typeof cachedStatus?.userDataPath === "string"
              ? cachedStatus.userDataPath
              : null,
        documentsPath:
          typeof extra.documentsPath === "string"
            ? extra.documentsPath
            : typeof cachedStatus?.documentsPath === "string"
              ? cachedStatus.documentsPath
              : null,
        platform,
        fileName:
          typeof extra.syncFileName === "string"
            ? extra.syncFileName
            : typeof cachedStatus?.syncFileName === "string"
              ? cachedStatus.syncFileName
              : MOBILE_FILE_NAME,
        uri:
          typeof extra.actualUri === "string"
            ? extra.actualUri
            : typeof cachedStatus?.actualUri === "string"
              ? cachedStatus.actualUri
              : null,
        ...extra,
      };
    }

    async function persistNativeProjectHierarchyRepair(
      projectItems = [],
      options = {},
    ) {
      if (
        hasPendingStateChanges ||
        !Array.isArray(projectItems) ||
        typeof reactNativeBridge?.call !== "function"
      ) {
        return false;
      }
      try {
        await reactNativeBridge.call("storage.replaceCoreState", {
          partialCore: {
            projects: projectItems,
          },
          options: {
            emitChange: false,
            reason:
              typeof options.reason === "string" && options.reason.trim()
                ? options.reason.trim()
                : "project-hierarchy-repair",
          },
        });
        return true;
      } catch (error) {
        console.error("持久化 React Native 项目层级修复失败:", error);
        return false;
      }
    }

    function buildNativeWriteStateFromLatestSnapshot(
      localState,
      latestNativeState,
      pendingSharedKeys = [],
    ) {
      const normalizedLocalState = normalizeState(
        localState,
        buildMobileMetadata(),
      );
      const normalizedNativeState = normalizeState(
        latestNativeState && typeof latestNativeState === "object"
          ? latestNativeState
          : cachedState,
        buildMobileMetadata(),
      );
      const rebasedSharedState = extractSharedState(normalizedNativeState);

      pendingSharedKeys.forEach((key) => {
        if (!isSharedStateKey(key)) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(normalizedLocalState, key)) {
          rebasedSharedState[key] = cloneValue(normalizedLocalState[key]);
          return;
        }
        delete rebasedSharedState[key];
      });

      return normalizeState(rebasedSharedState, buildMobileMetadata());
    }

    function rebuildManagedSectionCoverage(state, options = {}) {
      const markFull = options?.markFull === true;
      const nextCoverage = createManagedSectionCoverage();
      MANAGED_RANGE_SECTIONS.forEach((section) => {
        const sourceItems =
          section === "plans"
            ? (state?.plans || []).filter((item) =>
                typeof storageBundle?.isRecurringPlan === "function"
                  ? !storageBundle.isRecurringPlan(item)
                  : String(item?.repeat || "").trim().toLowerCase() === "none",
              )
            : state?.[section] || [];
        sourceItems.forEach((item) => {
          nextCoverage[section].add(getManagedSectionPeriodId(section, item));
        });
      });
      managedSectionCoverage = nextCoverage;
      if (markFull) {
        managedFullyHydratedSections = new Set(MANAGED_RANGE_SECTIONS);
      }
    }

    function markManagedSectionPeriodsLoaded(section, periodIds = []) {
      if (!managedSectionCoverage[section]) {
        managedSectionCoverage[section] = new Set();
      }
      periodIds.forEach((periodId) => {
        const normalizedPeriodId = String(periodId || "").trim();
        if (normalizedPeriodId) {
          managedSectionCoverage[section].add(normalizedPeriodId);
        }
      });
    }

    function canServeManagedSectionRange(section, scope = {}) {
      const normalizedRange =
        storageBundle?.normalizeRangeInput?.(scope) || {
          periodIds: Array.isArray(scope?.periodIds) ? scope.periodIds : [],
          startDate: scope?.startDate || scope?.start || null,
          endDate: scope?.endDate || scope?.end || null,
        };
      if (managedFullyHydratedSections.has(section)) {
        return normalizedRange;
      }
      if (!normalizedRange.periodIds.length) {
        return null;
      }
      const coveredPeriods = managedSectionCoverage[section] || new Set();
      return normalizedRange.periodIds.every((periodId) =>
        coveredPeriods.has(String(periodId || "").trim()),
      )
        ? normalizedRange
        : null;
    }

    function mergeManagedSectionRange(section, scope = {}, items = []) {
      const normalizedRange =
        storageBundle?.normalizeRangeInput?.(scope) || {
          periodIds: Array.isArray(scope?.periodIds) ? scope.periodIds : [],
          startDate: scope?.startDate || scope?.start || null,
          endDate: scope?.endDate || scope?.end || null,
        };
      const requestedPeriodIds = Array.isArray(normalizedRange.periodIds)
        ? normalizedRange.periodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
        : [];
      const requestedPeriodSet = new Set(requestedPeriodIds);
      const state = readState();
      const nextState = {
        ...state,
      };
      const nextItems = Array.isArray(items) ? cloneValue(items) : [];

      if (section === "plans") {
        const recurringPlans = (state?.plans || []).filter((item) =>
          typeof storageBundle?.isRecurringPlan === "function"
            ? storageBundle.isRecurringPlan(item)
            : String(item?.repeat || "").trim().toLowerCase() !== "none",
        );
        const oneTimePlans = (state?.plans || []).filter(
          (item) =>
            !requestedPeriodSet.has(getManagedSectionPeriodId(section, item)) &&
            !(
              typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none"
            ),
        );
        nextState.plans = [
          ...(
            storageBundle?.sortPartitionItems?.(section, [
              ...oneTimePlans,
              ...nextItems,
            ]) || [...oneTimePlans, ...nextItems]
          ),
          ...cloneValue(recurringPlans),
        ];
      } else {
        const retainedItems = (state?.[section] || []).filter(
          (item) => !requestedPeriodSet.has(getManagedSectionPeriodId(section, item)),
        );
        nextState[section] =
          storageBundle?.sortPartitionItems?.(section, [
            ...retainedItems,
            ...nextItems,
          ]) || [...retainedItems, ...nextItems];
      }

      cachedState = normalizeState(nextState, buildMobileMetadata());
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasManagedCoreSnapshot = true;
      hasPendingStateChanges = false;
      const coveredPeriodIds = requestedPeriodIds.length
        ? requestedPeriodIds
        : Array.from(
            new Set(nextItems.map((item) => getManagedSectionPeriodId(section, item))),
          );
      markManagedSectionPeriodsLoaded(section, coveredPeriodIds);
      persistMirrorSnapshot(true);
    }

    function scheduleManagedFastValidation(reason = "page-fast-path") {
      if (hasPendingStateChanges) {
        return;
      }
      scheduleNativeForegroundSync(reason, {
        resetWindow: false,
      });
    }

    rebuildManagedSectionCoverage(cachedState);

    function readState() {
      return cachedState;
    }

    function buildCurrentMergedState() {
      return buildMergedState(readState(), {
        includeAliases: true,
      });
    }

    function assignState(nextState) {
      cachedState = normalizeState(nextState, buildMobileMetadata());
      rebuildManagedSectionCoverage(cachedState, {
        markFull:
          managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length,
      });
      managedStateRevision += 1;
      hasPendingStateChanges = true;
      scheduleMirrorSnapshot();
      return cachedState;
    }

    function persistMirrorSnapshot(force = false) {
      try {
        const nextStateJson = JSON.stringify(cachedState);
        if (force || nextStateJson !== lastMirroredStateJson) {
          nativeMethods.setItem?.call(
            window.localStorage,
            MOBILE_MIRROR_STATE_KEY,
            nextStateJson,
          );
          lastMirroredStateJson = nextStateJson;
        }
        if (cachedStatus) {
          const nextStatusJson = JSON.stringify(cachedStatus);
          if (force || nextStatusJson !== lastMirroredStatusJson) {
            nativeMethods.setItem?.call(
              window.localStorage,
              MOBILE_MIRROR_STATUS_KEY,
              nextStatusJson,
            );
            lastMirroredStatusJson = nextStatusJson;
          }
        }
        const nextPendingWriteValue = hasPendingStateChanges ? "1" : "0";
        if (force || nextPendingWriteValue !== lastMirroredPendingWriteValue) {
          nativeMethods.setItem?.call(
            window.localStorage,
            MOBILE_MIRROR_PENDING_WRITE_KEY,
            nextPendingWriteValue,
          );
          lastMirroredPendingWriteValue = nextPendingWriteValue;
        }
      } catch (error) {
        console.error("写入移动端镜像状态失败:", error);
      }
    }

    function scheduleMirrorSnapshot() {
      window.clearTimeout(mirrorFlushTimer);
      mirrorFlushTimer = window.setTimeout(() => {
        persistMirrorSnapshot();
      }, MOBILE_MIRROR_FLUSH_DELAY_MS);
    }

    function createManagedStateCheckpoint() {
      return {
        revision: managedStateRevision,
        comparableSnapshot: createComparableSnapshot(cachedState),
      };
    }

    async function settleManagedNativeDirectWrite(checkpoint = null) {
      touchRecentNativeLocalWriteWindow();
      const nextStatus = await getNativeStatusSnapshot({
        suppressError: true,
      });
      if (nextStatus && typeof nextStatus === "object") {
        cachedStatus = nextStatus;
      }
      if (
        checkpoint &&
        checkpoint.revision === managedStateRevision
      ) {
        lastWrittenComparableSnapshot =
          checkpoint.comparableSnapshot || createComparableSnapshot(cachedState);
        hasPendingStateChanges = false;
      }
      persistMirrorSnapshot(true);
      updateVersionBaseline(cachedStatus);
      clearStorageSyncError();
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
    }

    function scheduleManagedPendingNativeFlush() {
      hasPendingStateChanges = true;
      scheduleMirrorSnapshot();
      window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => {
        writeChain = writeChain
          .then(() => writeNativeState())
          .catch((error) => {
            console.error("补写 React Native 存储失败:", error);
          });
      }, NATIVE_WRITE_DELAY_MS);
    }

    function queueManagedNativeDirectWrite(task, options = {}) {
      const nextTask = writeChain
        .catch(() => undefined)
        .then(() => task());
      writeChain = nextTask
        .then(() => cachedStatus)
        .catch((error) => {
          console.error(options.errorLabel || "写入 React Native 存储失败:", error);
          return cachedStatus;
        });
      return nextTask;
    }

    function updateVersionBaseline(versionProbe) {
      const normalizedVersion = normalizeVersionProbe(versionProbe, cachedStatus);
      if (!normalizedVersion) {
        return;
      }
      lastKnownVersionProbe = normalizedVersion;
      if (normalizedVersion.fingerprint) {
        nativeBaselineFingerprint = normalizedVersion.fingerprint;
      }
      if (normalizedVersion.fallbackHashUsed) {
        lastFallbackHashProbeAt = Date.now();
      }
    }

    function touchNativeFastProbeWindow() {
      if (!useAndroidProbeLoop) {
        return;
      }
      nativeFastProbeUntil = Date.now() + NATIVE_PROBE_FAST_WINDOW_MS;
    }

    function touchRecentNativeLocalWriteWindow() {
      recentNativeLocalWriteAt = Date.now();
    }

    function isFastProbeWindowActive() {
      return useAndroidProbeLoop && Date.now() < nativeFastProbeUntil;
    }

    function getNativeProbeIntervalMs() {
      return isFastProbeWindowActive()
        ? NATIVE_PROBE_FAST_INTERVAL_MS
        : NATIVE_PROBE_STABLE_INTERVAL_MS;
    }

    function shouldUseFallbackHashProbe() {
      return (
        useAndroidProbeLoop &&
        lastKnownVersionProbe?.supportsModifiedAt === false &&
        !isFastProbeWindowActive() &&
        Date.now() - lastFallbackHashProbeAt >= NATIVE_PROBE_FALLBACK_HASH_INTERVAL_MS
      );
    }

    function shouldForceNativeSnapshotSync() {
      const storageMode =
        typeof cachedStatus?.storageMode === "string"
          ? cachedStatus.storageMode
          : typeof lastKnownVersionProbe?.storageMode === "string"
            ? lastKnownVersionProbe.storageMode
            : "";
      return (
        useAndroidProbeLoop &&
        (
          cachedStatus?.isCustomPath === true ||
          storageMode === "file" ||
          storageMode === "directory"
        )
      );
    }

    function stopNativeProbeLoop() {
      window.clearTimeout(nativeForegroundSyncTimer);
      window.clearTimeout(nativeProbeLoopTimer);
    }

    function scheduleNativeProbeLoop() {
      if (!useAndroidProbeLoop || document.hidden || !shellPageActive) {
        return;
      }
      window.clearTimeout(nativeProbeLoopTimer);
      nativeProbeLoopTimer = window.setTimeout(() => {
        scheduleNativeForegroundSync("external-update", {
          resetWindow: false,
        });
      }, getNativeProbeIntervalMs());
    }

    async function readNativeSnapshot(options = {}) {
      const { suppressError = false } = options;
      try {
        const rawPayload = await reactNativeBridge.call("storage.readState");
        const payload = parseJsonSafely(rawPayload, null);
        if (!payload || typeof payload !== "object") {
          return null;
        }

        const nextStatus =
          payload.status && typeof payload.status === "object"
            ? payload.status
            : null;
        const nextState =
          payload.state && typeof payload.state === "object" ? payload.state : {};
        adoptLegacyLocalOnlyValues(nextState);

        return {
          state: normalizeState(nextState, buildMobileMetadata(nextStatus || {})),
          status: nextStatus,
        };
      } catch (error) {
        if (!suppressError) {
          reportNativeStorageSyncError(
            "同步存储读取失败，已保留当前页面数据。",
            {
              reason: "native-read-state",
              error,
            },
          );
        }
        console.error("读取 React Native 存储失败:", error);
        return null;
      }
    }

    async function getNativeStatusSnapshot(options = {}) {
      const { suppressError = false } = options;
      try {
        const rawPayload = await reactNativeBridge.call("storage.getStatus");
        const parsed = parseJsonSafely(rawPayload, null);
        clearStorageSyncError();
        return parsed;
      } catch (error) {
        if (!suppressError) {
          reportNativeStorageSyncError("读取同步状态失败，已保留当前页面数据。", {
            reason: "native-get-status",
            error,
          });
        }
        console.error("读取 React Native 存储状态失败:", error);
        return null;
      }
    }

    async function refreshNativeStatusCache(options = {}) {
      const { suppressError = true, force = false } = options;
      if (nativeStatusRefreshPromise && !force) {
        return nativeStatusRefreshPromise;
      }
      const refreshTask = getNativeStatusSnapshot({
        suppressError,
      })
        .then((nextStatus) => {
          if (nextStatus && typeof nextStatus === "object") {
            cachedStatus = nextStatus;
            persistMirrorSnapshot(true);
            updateVersionBaseline(cachedStatus);
            clearStorageSyncError();
          }
          return cachedStatus;
        })
        .finally(() => {
          if (nativeStatusRefreshPromise === refreshTask) {
            nativeStatusRefreshPromise = null;
          }
        });
      nativeStatusRefreshPromise = refreshTask;
      return refreshTask;
    }

    function scheduleNativeStatusRefresh(options = {}) {
      void refreshNativeStatusCache(options).catch((error) => {
        console.error("后台刷新 React Native 存储状态失败:", error);
      });
    }

    async function getNativeCoreStateSnapshot(options = {}) {
      const { suppressError = false } = options;
      try {
        const rawPayload = await reactNativeBridge.call("storage.getCoreState");
        const parsed = parseJsonSafely(rawPayload, null);
        clearStorageSyncError();
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (error) {
        if (!suppressError) {
          reportNativeStorageSyncError("读取核心数据失败，已保留当前页面数据。", {
            reason: "native-get-core-state",
            error,
          });
        }
        console.error("读取 React Native 核心状态失败:", error);
        return null;
      }
    }

    async function probeNativeStateVersion(options = {}) {
      const { includeFallbackHash = false, suppressError = false } = options;
      try {
        const rawPayload = await reactNativeBridge.call(
          "storage.probeStateVersion",
          {
            includeFallbackHash,
          },
        );
        const parsed = normalizeVersionProbe(parseJsonSafely(rawPayload, null), cachedStatus);
        clearStorageSyncError();
        return parsed;
      } catch (error) {
        if (!suppressError) {
          reportNativeStorageSyncError("探测同步文件版本失败，已保留当前页面数据。", {
            reason: "native-probe-state",
            error,
          });
        }
        console.error("探测 React Native 存储版本失败:", error);
        return null;
      }
    }

    async function writeNativeState() {
      const pendingSharedKeys = peekPendingNativeSharedKeyChanges();
      let nextState = normalizeState(readState(), {
        ...buildMobileMetadata(),
        touchModified: true,
        touchSyncSave: true,
      });
      if (pendingSharedKeys.length) {
        const latestSnapshot = await readNativeSnapshot({
          suppressError: true,
        });
        if (latestSnapshot?.state) {
          nextState = normalizeState(
            buildNativeWriteStateFromLatestSnapshot(
              nextState,
              latestSnapshot.state,
              pendingSharedKeys,
            ),
            {
              ...buildMobileMetadata(latestSnapshot.status || {}),
              touchModified: true,
              touchSyncSave: true,
            },
          );
        }
      }
      cachedState = nextState;
      const serializedState = JSON.stringify(nextState);
      const nextComparableSnapshot = createComparableSnapshot(nextState);

      if (nextComparableSnapshot === lastWrittenComparableSnapshot) {
        consumePendingNativeStorageChangeMetadata();
        if (cachedStatus && typeof cachedStatus === "object") {
          cachedStatus = {
            ...cachedStatus,
            syncMeta: nextState.syncMeta || cachedStatus.syncMeta || null,
          };
        }
        hasPendingStateChanges = false;
        persistMirrorSnapshot(true);
        updateVersionBaseline(cachedStatus);
        clearStorageSyncError();
        touchRecentNativeLocalWriteWindow();
        touchNativeFastProbeWindow();
        scheduleNativeProbeLoop();
        return cachedStatus;
      }

      const rawPayload = await reactNativeBridge.call("storage.writeState", {
        state: nextState,
        serializedState,
      });
      const payload = parseJsonSafely(rawPayload, null);
      touchRecentNativeLocalWriteWindow();
      const nextStatus =
        payload?.status && typeof payload.status === "object"
          ? payload.status
          : await getNativeStatusSnapshot();

      cachedState = normalizeState(
        payload?.state && typeof payload.state === "object"
          ? payload.state
          : nextState,
        buildMobileMetadata(nextStatus || {}),
      );
      hasManagedCoreSnapshot = true;
      rebuildManagedSectionCoverage(cachedState, {
        markFull: true,
      });
      cachedStatus = nextStatus;
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      updateVersionBaseline(cachedStatus);
      clearStorageSyncError();
      emitNativeStorageChangedBridgeEvent(
        "storage-write",
        consumePendingNativeStorageChangeMetadata(),
      );
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
      return cachedStatus;
    }

    function persistState(options = {}) {
      const normalizedKey = resolveLocalStateKey(options?.key);
      const normalizedChangedSections = normalizeChangedSectionsList(
        options?.changedSections,
      );
      const normalizedChangedPeriods = normalizeChangedPeriodsMap(
        options?.changedPeriods,
      );
      if (normalizedChangedSections.length) {
        markPendingNativeStorageChangeMetadata({
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (isSharedStateKey(normalizedKey)) {
        markPendingNativeSharedKeyChanges([normalizedKey]);
        markPendingNativeStorageChangeMetadata({
          changedSections: getChangedSectionsForSharedStateKey(normalizedKey),
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (options?.reason === "core-replace") {
        markPendingNativeStorageChangeMetadata({
          changedSections: inferChangedSectionsFromCorePatch(options?.partialCore),
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (options?.reason === "plans-recurring-replace") {
        markPendingNativeStorageChangeMetadata({
          changedSections: ["plansRecurring"],
          changedPeriods: normalizedChangedPeriods,
        });
      } else if (
        options?.reason === "clear" ||
        options?.reason === "replace-all"
      ) {
        markPendingNativeStorageChangeMetadata({
          changedSections: DEFAULT_CHANGED_SECTIONS,
          changedPeriods: normalizedChangedPeriods,
        });
      }
      hasPendingStateChanges = true;
      scheduleMirrorSnapshot();
      window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => {
        writeChain = writeChain
          .then(() => writeNativeState())
          .catch((error) => {
            console.error("写入 React Native 存储失败:", error);
          });
      }, NATIVE_WRITE_DELAY_MS);
    }

    async function persistNow() {
      window.clearTimeout(writeTimer);
      const nextWrite = writeChain.then(async () => {
        if (hasPendingStateChanges) {
          return writeNativeState();
        }
        persistMirrorSnapshot(true);
        return cachedStatus;
      });
      writeChain = nextWrite.catch((error) => {
        console.error("立即写入 React Native 存储失败:", error);
        return cachedStatus;
      });
      return nextWrite;
    }

    async function syncStateFromNative(reason, options = {}) {
      const {
        forceDispatch = false,
        suppressError = false,
        changedSections = [],
        changedPeriods = {},
        source = "",
      } = options;
      if (hasPendingStateChanges) {
        await writeNativeState();
        return createSourceSyncResult(
          buildMergedState(cachedState, {
            includeAliases: true,
          }),
          cachedStatus,
        );
      }
      const next = await readNativeSnapshot({
        suppressError,
      });
      if (!next?.state) {
        return null;
      }

      const currentSnapshot = createComparableSnapshot(readState());
      const nextSnapshot = createComparableSnapshot(next.state);

      cachedState = next.state;
      hasManagedCoreSnapshot = true;
      rebuildManagedSectionCoverage(cachedState, {
        markFull: true,
      });
      cachedStatus = next.status || cachedStatus;
      lastWrittenComparableSnapshot = nextSnapshot;
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      updateVersionBaseline(cachedStatus);
      clearStorageSyncError();

      if (reason && (forceDispatch || nextSnapshot !== currentSnapshot)) {
        dispatchStorageChangedEvent(reason, buildMergedState(cachedState), cachedStatus, {
          changedSections: normalizeChangedSectionsList(changedSections),
          changedPeriods: normalizeChangedPeriodsMap(changedPeriods),
          source,
        });
      }
      return createSourceSyncResult(buildMergedState(cachedState), cachedStatus);
    }

    async function runNativeVersionProbe(reason) {
      if (!useAndroidProbeLoop) {
        if (hasPendingStateChanges) {
          await writeNativeState();
        }
        return syncStateFromNative(reason || "external-update");
      }

      if (nativeProbeInFlight) {
        return null;
      }

      nativeProbeInFlight = true;
      try {
        if (hasPendingStateChanges) {
          await writeNativeState();
        }

        const versionProbe = await probeNativeStateVersion({
          includeFallbackHash: shouldUseFallbackHashProbe(),
        });
        if (!versionProbe) {
          return null;
        }

        lastKnownVersionProbe = versionProbe;
        if (versionProbe.fallbackHashUsed) {
          lastFallbackHashProbeAt = Date.now();
        }

        if (!nativeBaselineFingerprint) {
          nativeBaselineFingerprint = versionProbe.fingerprint || "";
          clearStorageSyncError();
          return createSourceSyncResult(
            buildMergedState(cachedState, {
              includeAliases: true,
            }),
            cachedStatus,
          );
        }

        if (
          versionProbe.fingerprint &&
          versionProbe.fingerprint !== nativeBaselineFingerprint
        ) {
          const syncResult = await syncStateFromNative(reason || "external-update");
          updateVersionBaseline(syncResult?.status || cachedStatus);
          return syncResult;
        }

        if (shouldForceNativeSnapshotSync()) {
          const syncResult = await syncStateFromNative(reason || "external-update", {
            suppressError: true,
          });
          updateVersionBaseline(syncResult?.status || cachedStatus);
          return (
            syncResult ||
            createSourceSyncResult(
              buildMergedState(cachedState, {
                includeAliases: true,
              }),
              cachedStatus,
            )
          );
        }

        nativeBaselineFingerprint =
          versionProbe.fingerprint || nativeBaselineFingerprint;
        clearStorageSyncError();
        return createSourceSyncResult(
          buildMergedState(cachedState, {
            includeAliases: true,
          }),
          cachedStatus,
        );
      } finally {
        nativeProbeInFlight = false;
        scheduleNativeProbeLoop();
      }
    }

    function scheduleNativeForegroundSync(reason, options = {}) {
      const { resetWindow = true } = options;
      if (!shellPageActive) {
        pendingForegroundSyncRequest = {
          reason: reason || "shell-resume",
          resetWindow: false,
        };
        return;
      }
      if (!nativeInitializationSettled) {
        pendingForegroundSyncRequest = {
          reason: reason || "external-update",
          resetWindow:
            resetWindow || pendingForegroundSyncRequest?.resetWindow === true,
        };
        return;
      }
      if (resetWindow) {
        touchNativeFastProbeWindow();
      }
      window.clearTimeout(nativeForegroundSyncTimer);
      nativeForegroundSyncTimer = window.setTimeout(() => {
        writeChain = writeChain
          .then(() => runNativeVersionProbe(reason || "external-update"))
          .catch((error) => {
            console.error("前台恢复同步 React Native 存储失败:", error);
          });
      }, NATIVE_PROBE_DEBOUNCE_MS);
    }

    async function initializeReactNativeStorage() {
      if (hasPendingStateChanges) {
        persistMirrorSnapshot(true);
        try {
          await writeNativeState();
        } catch (error) {
          console.error("恢复移动端待补写镜像失败:", error);
          persistMirrorSnapshot(true);
        }
        updateVersionBaseline(cachedStatus);
        return;
      }

      const nextCore = await getNativeCoreStateSnapshot({
        suppressError: true,
      });
      if (nextCore) {
        const currentSnapshot = createComparableSnapshot(readState());
        const nextState = normalizeState(
          mergeManagedStateWithNativeCorePayload(nextCore, readState()),
          buildMobileMetadata(cachedStatus || {}),
        );
        const nextSnapshot = createComparableSnapshot(nextState);
        cachedState = nextState;
        hasManagedCoreSnapshot = true;
        rebuildManagedSectionCoverage(cachedState, {
          markFull: false,
        });
        lastWrittenComparableSnapshot = nextSnapshot;
        hasPendingStateChanges = false;
        persistMirrorSnapshot(true);
        updateVersionBaseline(cachedStatus);
        clearStorageSyncError();

        if (nextSnapshot !== currentSnapshot) {
          dispatchStorageChangedEvent(
            "initial-sync",
            buildMergedState(cachedState),
            cachedStatus,
          );
        }
        scheduleNativeStatusRefresh({
          suppressError: true,
        });
        return;
      }

      const next = await readNativeSnapshot({
        suppressError: true,
      });
      if (next?.state) {
        const currentSnapshot = createComparableSnapshot(readState());
        const nextSnapshot = createComparableSnapshot(next.state);

        cachedState = next.state;
        hasManagedCoreSnapshot = true;
        rebuildManagedSectionCoverage(cachedState, {
          markFull: true,
        });
        cachedStatus = next.status || cachedStatus;
        lastWrittenComparableSnapshot = nextSnapshot;
        hasPendingStateChanges = false;
        persistMirrorSnapshot(true);
        updateVersionBaseline(cachedStatus);
        clearStorageSyncError();

        if (nextSnapshot !== currentSnapshot) {
          dispatchStorageChangedEvent(
            "initial-sync",
            buildMergedState(cachedState),
            cachedStatus,
          );
        }
        if (cachedStatus?.sizePending === true) {
          scheduleNativeStatusRefresh({
            suppressError: true,
          });
        }
        return;
      }

      updateVersionBaseline(cachedStatus);
      persistMirrorSnapshot(true);
      scheduleNativeStatusRefresh({
        suppressError: true,
      });
    }

    function getManagedSectionPeriodId(section, item) {
      if (typeof storageBundle?.getPeriodIdForSectionItem === "function") {
        return (
          storageBundle.getPeriodIdForSectionItem(section, item) || "undated"
        );
      }
      const dateText =
        typeof item?.date === "string" && item.date
          ? item.date
          : typeof item?.endTime === "string" && item.endTime
            ? item.endTime
            : typeof item?.timestamp === "string" && item.timestamp
              ? item.timestamp
              : typeof item?.updatedAt === "string" && item.updatedAt
                ? item.updatedAt
                : "";
      return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : "undated";
    }

    function getManagedRecurringPlans(state = readState()) {
      const planItems = Array.isArray(state?.plans) ? state.plans : [];
      return planItems.filter((item) =>
        typeof storageBundle?.isRecurringPlan === "function"
          ? storageBundle.isRecurringPlan(item)
          : String(item?.repeat || "").trim().toLowerCase() !== "none",
      );
    }

    function buildManagedCoreStateSnapshot(state = readState()) {
      const sourceState =
        state && typeof state === "object" && !Array.isArray(state)
          ? state
          : readState();
      const recurringPlans = getManagedRecurringPlans(sourceState);
      return {
        projects: cloneValue(sourceState?.projects || []),
        todos: cloneValue(sourceState?.todos || []),
        checkinItems: cloneValue(sourceState?.checkinItems || []),
        yearlyGoals: cloneValue(sourceState?.yearlyGoals || {}),
        diaryCategories: cloneValue(sourceState?.diaryCategories || []),
        guideState:
          cloneValue(
            guideBundle?.normalizeGuideState?.(sourceState?.guideState) ||
              sourceState?.guideState ||
              getDefaultGuideStateFallback(),
          ) || getDefaultGuideStateFallback(),
        customThemes: cloneValue(sourceState?.customThemes || []),
        builtInThemeOverrides: cloneValue(
          sourceState?.builtInThemeOverrides || {},
        ),
        selectedTheme:
          typeof sourceState?.selectedTheme === "string" &&
          sourceState.selectedTheme.trim()
            ? sourceState.selectedTheme.trim()
            : "default",
        createdAt: sourceState?.createdAt || null,
        lastModified: sourceState?.lastModified || null,
        storagePath: sourceState?.storagePath || null,
        storageDirectory: sourceState?.storageDirectory || null,
        userDataPath: sourceState?.userDataPath || null,
        documentsPath: sourceState?.documentsPath || null,
        syncMeta: cloneValue(sourceState?.syncMeta || null),
        recurringPlans: cloneValue(recurringPlans),
      };
    }

    function mergeManagedStateWithNativeCorePayload(
      corePayload = {},
      baseState = readState(),
    ) {
      const normalizedCorePayload =
        normalizeCorePayloadProjects(corePayload).payload;
      const currentState = normalizeState(
        isPlainObject(baseState) ? baseState : readState(),
        buildMobileMetadata(),
      );
      const currentCoreSnapshot = buildManagedCoreStateSnapshot(currentState);
      const nextRecurringPlans = Array.isArray(normalizedCorePayload?.recurringPlans)
        ? normalizedCorePayload.recurringPlans
        : currentCoreSnapshot.recurringPlans;
      return {
        ...currentState,
        projects: Array.isArray(normalizedCorePayload?.projects)
          ? normalizedCorePayload.projects
          : currentCoreSnapshot.projects,
        todos: Array.isArray(normalizedCorePayload?.todos)
          ? normalizedCorePayload.todos
          : currentCoreSnapshot.todos,
        checkinItems: Array.isArray(normalizedCorePayload?.checkinItems)
          ? normalizedCorePayload.checkinItems
          : currentCoreSnapshot.checkinItems,
        yearlyGoals: isPlainObject(normalizedCorePayload?.yearlyGoals)
          ? normalizedCorePayload.yearlyGoals
          : currentCoreSnapshot.yearlyGoals,
        diaryCategories: Array.isArray(normalizedCorePayload?.diaryCategories)
          ? normalizedCorePayload.diaryCategories
          : currentCoreSnapshot.diaryCategories,
        guideState:
          guideBundle?.normalizeGuideState?.(
            isPlainObject(normalizedCorePayload) &&
              Object.prototype.hasOwnProperty.call(
                normalizedCorePayload,
                "guideState",
              )
              ? normalizedCorePayload.guideState
              : currentCoreSnapshot.guideState,
          ) || currentCoreSnapshot.guideState,
        customThemes: Array.isArray(normalizedCorePayload?.customThemes)
          ? normalizedCorePayload.customThemes
          : currentCoreSnapshot.customThemes,
        builtInThemeOverrides: isPlainObject(
          normalizedCorePayload?.builtInThemeOverrides,
        )
          ? normalizedCorePayload.builtInThemeOverrides
          : currentCoreSnapshot.builtInThemeOverrides,
        selectedTheme:
          typeof normalizedCorePayload?.selectedTheme === "string" &&
          normalizedCorePayload.selectedTheme.trim()
            ? normalizedCorePayload.selectedTheme.trim()
            : currentCoreSnapshot.selectedTheme,
        plans: [
          ...(
            Array.isArray(currentState?.plans)
              ? currentState.plans.filter(
                  (item) =>
                    !(typeof storageBundle?.isRecurringPlan === "function"
                      ? storageBundle.isRecurringPlan(item)
                      : String(item?.repeat || "").trim().toLowerCase() !==
                          "none"),
                )
              : []
          ),
          ...nextRecurringPlans,
        ],
        createdAt:
          normalizedCorePayload?.createdAt || currentCoreSnapshot.createdAt || null,
        lastModified:
          normalizedCorePayload?.lastModified ||
          currentCoreSnapshot.lastModified ||
          null,
        storagePath:
          normalizedCorePayload?.storagePath ||
          currentCoreSnapshot.storagePath ||
          null,
        storageDirectory:
          normalizedCorePayload?.storageDirectory ||
          currentCoreSnapshot.storageDirectory ||
          null,
        userDataPath:
          normalizedCorePayload?.userDataPath ||
          currentCoreSnapshot.userDataPath ||
          null,
        documentsPath:
          normalizedCorePayload?.documentsPath ||
          currentCoreSnapshot.documentsPath ||
          null,
        syncMeta: isPlainObject(normalizedCorePayload?.syncMeta)
          ? normalizedCorePayload.syncMeta
          : currentCoreSnapshot.syncMeta,
      };
    }

    function getManagedPlanBootstrapStateSnapshot(options = {}) {
      const includeRecurringPlans = options?.includeRecurringPlans !== false;
      const includeYearlyGoals = options?.includeYearlyGoals !== false;
      const coreStateSnapshot = buildManagedCoreStateSnapshot(readState());
      const payload = {};
      if (includeYearlyGoals) {
        payload.yearlyGoals = coreStateSnapshot.yearlyGoals;
      }
      if (includeRecurringPlans) {
        payload.recurringPlans = coreStateSnapshot.recurringPlans;
      }
      return payload;
    }

    function applyManagedPlanBootstrapSnapshot(payload = {}, options = {}) {
      const includeRecurringPlans = options?.includeRecurringPlans !== false;
      const includeYearlyGoals = options?.includeYearlyGoals !== false;
      const currentState = readState();
      const currentRecurringPlans = Array.isArray(currentState?.plans)
        ? currentState.plans.filter((item) =>
            typeof storageBundle?.isRecurringPlan === "function"
              ? storageBundle.isRecurringPlan(item)
              : String(item?.repeat || "").trim().toLowerCase() !== "none",
          )
        : [];
      cachedState = normalizeState({
        ...currentState,
        yearlyGoals:
          includeYearlyGoals &&
          payload?.yearlyGoals &&
          typeof payload.yearlyGoals === "object" &&
          !Array.isArray(payload.yearlyGoals)
            ? payload.yearlyGoals
            : currentState?.yearlyGoals || {},
        plans: [
          ...(
            Array.isArray(currentState?.plans)
              ? currentState.plans.filter(
                  (item) =>
                    !(typeof storageBundle?.isRecurringPlan === "function"
                      ? storageBundle.isRecurringPlan(item)
                      : String(item?.repeat || "").trim().toLowerCase() !== "none"),
                )
              : []
          ),
          ...(
            includeRecurringPlans && Array.isArray(payload?.recurringPlans)
              ? payload.recurringPlans
              : currentRecurringPlans
          ),
        ],
      }, buildMobileMetadata(payload));
      hasManagedCoreSnapshot = true;
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      clearStorageSyncError();
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
      return getManagedPlanBootstrapStateSnapshot(options);
    }

    function getManagedCoreStateSnapshot() {
      return buildManagedCoreStateSnapshot(readState());
    }

    function applyManagedCorePayload(corePayload = {}, metadata = {}) {
      const currentState = readState();
      cachedState = normalizeState(
        mergeManagedStateWithNativeCorePayload(corePayload, currentState),
        buildMobileMetadata(metadata),
      );
      hasManagedCoreSnapshot = true;
      rebuildManagedSectionCoverage(cachedState, {
        markFull:
          managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length,
      });
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      clearStorageSyncError();
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
      return getManagedCoreStateSnapshot();
    }

    function applyBootstrapVersionToCachedStatus(pageBootstrap = {}) {
      const sourceFingerprint =
        typeof pageBootstrap?.sourceFingerprint === "string" &&
        pageBootstrap.sourceFingerprint.trim()
          ? pageBootstrap.sourceFingerprint.trim()
          : typeof pageBootstrap?.snapshotVersion === "string" &&
              pageBootstrap.snapshotVersion.trim()
            ? pageBootstrap.snapshotVersion.trim()
            : "";
      if (!sourceFingerprint) {
        return;
      }
      const versionProbe =
        cachedStatus && typeof cachedStatus === "object"
          ? {
              ...cachedStatus,
              fingerprint: sourceFingerprint,
            }
          : {
              fingerprint: sourceFingerprint,
            };
      if (cachedStatus && typeof cachedStatus === "object") {
        cachedStatus = versionProbe;
        persistMirrorSnapshot(true);
      }
      updateVersionBaseline(versionProbe);
    }

    function applyNativePageBootstrapToManagedMirror(
      pageKey,
      pageBootstrap = {},
      options = {},
    ) {
      const normalizedPage = normalizePageBootstrapKey(pageKey);
      const data =
        pageBootstrap?.data && typeof pageBootstrap.data === "object"
          ? pageBootstrap.data
          : {};
      applyBootstrapVersionToCachedStatus(pageBootstrap);

      if (normalizedPage === "index") {
        applyManagedCorePayload(
          {
            projects: Array.isArray(data.projects) ? data.projects : [],
            timerSessionState:
              data.timerSessionState &&
              typeof data.timerSessionState === "object"
                ? data.timerSessionState
                : {},
          },
          pageBootstrap,
        );
        mergeManagedSectionRange(
          "records",
          options?.recordScope && typeof options.recordScope === "object"
            ? options.recordScope
            : buildRecentHoursBootstrapScope(48),
          Array.isArray(data.recentRecords) ? data.recentRecords : [],
        );
        return pageBootstrap;
      }

      if (normalizedPage === "plan") {
        applyManagedPlanBootstrapSnapshot(
          {
            recurringPlans: Array.isArray(data.recurringPlans)
              ? data.recurringPlans
              : [],
            yearlyGoals:
              data.yearlyGoals && typeof data.yearlyGoals === "object"
                ? data.yearlyGoals
                : {},
          },
          options,
        );
        mergeManagedSectionRange(
          "plans",
          options?.planScope && typeof options.planScope === "object"
            ? options.planScope
            : Array.isArray(options?.periodIds) && options.periodIds.length
              ? { periodIds: options.periodIds }
              : buildCurrentMonthBootstrapScope(),
          Array.isArray(data.visiblePlans) ? data.visiblePlans : [],
        );
        return pageBootstrap;
      }

      if (normalizedPage === "todo") {
        applyManagedCorePayload(
          {
            todos: Array.isArray(data.todos) ? data.todos : [],
            checkinItems: Array.isArray(data.checkinItems)
              ? data.checkinItems
              : [],
          },
          pageBootstrap,
        );
        mergeManagedSectionRange(
          "dailyCheckins",
          options?.dailyCheckinScope &&
            typeof options.dailyCheckinScope === "object"
            ? options.dailyCheckinScope
            : buildCurrentDayBootstrapScope(),
          Array.isArray(data.todayDailyCheckins) ? data.todayDailyCheckins : [],
        );
        mergeManagedSectionRange(
          "checkins",
          options?.checkinScope && typeof options.checkinScope === "object"
            ? options.checkinScope
            : buildCurrentMonthBootstrapScope(),
          Array.isArray(data.recentCheckins) ? data.recentCheckins : [],
        );
        return pageBootstrap;
      }

      if (normalizedPage === "diary") {
        applyManagedCorePayload(
          {
            diaryCategories: Array.isArray(data.diaryCategories)
              ? data.diaryCategories
              : [],
            guideState:
              data.guideState && typeof data.guideState === "object"
                ? data.guideState
                : {},
          },
          pageBootstrap,
        );
        mergeManagedSectionRange(
          "diaryEntries",
          options?.diaryScope && typeof options.diaryScope === "object"
            ? options.diaryScope
            : Array.isArray(options?.periodIds) && options.periodIds.length
              ? { periodIds: options.periodIds }
              : buildCurrentMonthBootstrapScope(),
          Array.isArray(data.currentMonthEntries)
            ? data.currentMonthEntries
            : [],
        );
        return pageBootstrap;
      }

      if (normalizedPage === "stats") {
        applyManagedCorePayload(
          {
            projects: Array.isArray(data.projects) ? data.projects : [],
          },
          pageBootstrap,
        );
        mergeManagedSectionRange(
          "records",
          options?.recordScope && typeof options.recordScope === "object"
            ? options.recordScope
            : buildCurrentMonthBootstrapScope(),
          Array.isArray(data.defaultRangeRecordsOrAggregate)
            ? data.defaultRangeRecordsOrAggregate
            : [],
        );
      }

      return pageBootstrap;
    }

    function loadManagedSectionRange(section, scope = {}) {
      const normalizedRange =
        storageBundle?.normalizeRangeInput?.(scope) || {
          periodIds: Array.isArray(scope?.periodIds) ? scope.periodIds : [],
          startDate: scope?.startDate || scope?.start || null,
          endDate: scope?.endDate || scope?.end || null,
        };
      const requested = new Set(normalizedRange.periodIds || []);
      const state = readState();
      const sourceItems =
        section === "plans"
          ? (state?.plans || []).filter(
              (item) =>
                !(typeof storageBundle?.isRecurringPlan === "function"
                  ? storageBundle.isRecurringPlan(item)
                  : String(item?.repeat || "").trim().toLowerCase() !== "none"),
            )
          : state?.[section] || [];
      const items = storageBundle?.ensureArray?.(sourceItems) || sourceItems;
      const filteredItems = items.filter((item) => {
        if (requested.size === 0) {
          return true;
        }
        return requested.has(getManagedSectionPeriodId(section, item));
      });
      return {
        section,
        periodUnit: "month",
        periodIds:
          requested.size > 0
            ? Array.from(requested)
            : [...new Set(filteredItems.map((item) => getManagedSectionPeriodId(section, item)))],
        startDate: normalizedRange.startDate || null,
        endDate: normalizedRange.endDate || null,
        items:
          storageBundle?.sortPartitionItems?.(section, filteredItems) ||
          cloneValue(filteredItems),
      };
    }

    installManagedLocalStorage({
      isNativeApp: true,
      platform,
      capabilities: resolvedRuntimeCapabilities,
      readState,
      assignState,
      persistState,
      persistNow,
      reloadState() {
        return readState();
      },
      async getStorageStatus() {
        if (!cachedStatus || cachedStatus?.sizePending === true) {
          await refreshNativeStatusCache({
            suppressError: true,
          });
        }
        return cachedStatus || (await getNativeStatusSnapshot());
      },
      async syncFromSource(options = {}) {
        const reason =
          typeof options.reason === "string" && options.reason.trim()
            ? options.reason.trim()
            : "manual-sync";
        return syncStateFromNative(reason, {
          suppressError: false,
        });
      },
      afterJournalStateApplied(nextState, operations = [], metadata = {}) {
        hasManagedCoreSnapshot = true;
        coalesceStorageJournalOperations(operations).forEach((operation) => {
          if (operation.kind !== "saveSectionRange") {
            return;
          }
          const periodId = String(operation?.payload?.periodId || "").trim();
          if (!periodId) {
            return;
          }
          markManagedSectionPeriodsLoaded(operation.section, [periodId]);
        });
        persistMirrorSnapshot(true);
      },
      appendJournalImpl: async (operations = [], metadata = {}, options = {}) => {
        const optimisticResult = buildStorageJournalResult(operations, metadata, {
          status: cachedStatus,
          snapshotVersion:
            typeof cachedStatus?.fingerprint === "string"
              ? cachedStatus.fingerprint
              : "",
        });
        const canUseNativeJournal =
          reactNativeBridge?.platform === "android" &&
          typeof reactNativeBridge?.call === "function";

        if (canUseNativeJournal) {
          const checkpoint = createManagedStateCheckpoint();
          const runJournalAppend = async () => {
            const rawPayload = await reactNativeBridge.call(
              "storage.appendJournal",
              {
                payload: {
                  ops: operations,
                },
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            await settleManagedNativeDirectWrite(checkpoint);
            const changedSections = normalizeChangedSectionsList(
              parsed?.changedSections || metadata.changedSections,
            );
            const changedPeriods = normalizeChangedPeriodsMap(
              parsed?.changedPeriods || metadata.changedPeriods,
            );
            emitNativeStorageChangedBridgeEvent(
              typeof options?.reason === "string" && options.reason.trim()
                ? options.reason.trim()
                : "journal-append",
              {
                changedSections,
                changedPeriods,
              },
            );
            if (parsed && typeof parsed === "object") {
              return {
                ...optimisticResult,
                ...parsed,
                changedSections,
                changedPeriods,
              };
            }
            return optimisticResult;
          };

          try {
            return await queueManagedNativeDirectWrite(runJournalAppend, {
              errorLabel: "追加 React Native 存储日志失败:",
            });
          } catch (firstError) {
            console.error("首次追加 React Native 存储日志失败，准备重试:", firstError);
            try {
              return await queueManagedNativeDirectWrite(runJournalAppend, {
                errorLabel: "重试追加 React Native 存储日志失败:",
              });
            } catch (secondError) {
              console.error("重试追加 React Native 存储日志失败，回退整包补写:", secondError);
              markPendingNativeStorageChangeMetadata(metadata);
              scheduleManagedPendingNativeFlush();
              throw secondError;
            }
          }
        }

        markPendingNativeStorageChangeMetadata(metadata);
        const nextStatus = await persistNow();
        return buildStorageJournalResult(operations, metadata, {
          status:
            nextStatus && typeof nextStatus === "object" ? nextStatus : cachedStatus,
          snapshotVersion:
            typeof nextStatus?.fingerprint === "string"
              ? nextStatus.fingerprint
              : typeof cachedStatus?.fingerprint === "string"
                ? cachedStatus.fingerprint
                : "",
        });
      },
      flushJournalImpl: async () => {
        if (hasPendingStateChanges) {
          return writeNativeState();
        }
        if (
          reactNativeBridge?.platform === "android" &&
          typeof reactNativeBridge?.call === "function"
        ) {
          try {
            const rawPayload = await reactNativeBridge.call("storage.flushJournal");
            const parsed = parseJsonSafely(rawPayload, null);
            const nextStatus = await getNativeStatusSnapshot({
              suppressError: true,
            });
            if (nextStatus && typeof nextStatus === "object") {
              cachedStatus = nextStatus;
            }
            return parsed && typeof parsed === "object" ? parsed : cachedStatus;
          } catch (error) {
            console.error("刷新 React Native 存储日志失败:", error);
          }
        }
        persistMirrorSnapshot(true);
        return cachedStatus;
      },
      extraMethods: {
        async getManifest() {
          try {
            const rawPayload = await reactNativeBridge.call("storage.getManifest");
            return parseJsonSafely(rawPayload, null);
          } catch (error) {
            console.error("读取 React Native 存储 manifest 失败，回退本地推导:", error);
            return null;
          }
        },
        peekPageBootstrapState(pageKey, options = {}) {
          return buildPageBootstrapStateFromState(
            buildCurrentMergedState(),
            pageKey,
            options,
            {
              storageStatus: cachedStatus,
            },
          );
        },
        getPageBootstrapStateSync(pageKey, options = {}) {
          return this.peekPageBootstrapState(pageKey, options);
        },
        async getPageBootstrapState(pageKey, options = {}) {
          const normalizedPage = normalizePageBootstrapKey(pageKey);
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const useFreshBootstrap = normalizedOptions.fresh === true;
          if (hasManagedCoreSnapshot && !useFreshBootstrap) {
            scheduleManagedFastValidation(
              `${normalizedPage}-bootstrap-fast-path`,
            );
            return this.peekPageBootstrapState(normalizedPage, normalizedOptions);
          }
          try {
            const rawPayload =
              typeof reactNativeBridge?.call === "function"
                ? await reactNativeBridge.call("storage.getPageBootstrapState", {
                    pageKey: normalizedPage,
                    options: normalizedOptions,
                  }).catch(async () =>
                    reactNativeBridge.call("storage.getBootstrapState", {
                      options: {
                        ...normalizedOptions,
                        page: normalizedPage,
                      },
                    }),
                  )
                : null;
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              const rawBootstrapProjects = extractBootstrapProjectsFromPayload(
                normalizedPage,
                parsed,
              );
              const normalizedBootstrap = normalizePageBootstrapEnvelope(
                normalizedPage,
                parsed,
                normalizedOptions,
                buildCurrentMergedState(),
                {
                  storageStatus: cachedStatus,
                },
              );
              const normalizedBootstrapProjects = extractBootstrapProjectsFromPayload(
                normalizedPage,
                normalizedBootstrap,
              );
              if (
                safeSerialize(rawBootstrapProjects) !==
                safeSerialize(normalizedBootstrapProjects)
              ) {
                void persistNativeProjectHierarchyRepair(
                  normalizedBootstrapProjects,
                  {
                    reason: `page-bootstrap-repair:${normalizedPage}`,
                  },
                );
              }
              if (useFreshBootstrap) {
                applyNativePageBootstrapToManagedMirror(
                  normalizedPage,
                  normalizedBootstrap,
                  normalizedOptions,
                );
              }
              return normalizedBootstrap;
            }
          } catch (error) {
            console.error(
              "读取 React Native 页面引导状态失败，回退本地快照:",
              error,
            );
          }
          try {
            const fallbackBootstrap = await buildPageBootstrapStateFromAsyncLoaders(
              normalizedPage,
              normalizedOptions,
              {
                fallbackState: buildCurrentMergedState(),
                getCoreState: async () => this.getCoreState(),
                loadSectionRange: async (section, scope = {}) => {
                  const rawPayload = await reactNativeBridge.call(
                    "storage.loadSectionRange",
                    {
                      section,
                      scope,
                    },
                  );
                  return parseJsonSafely(rawPayload, null);
                },
                getStorageStatus: async () => {
                  const rawPayload = await reactNativeBridge.call(
                    "storage.getStatus",
                  );
                  return parseJsonSafely(rawPayload, null);
                },
                getAutoBackupStatus: async () => {
                  const rawPayload = await reactNativeBridge.call(
                    "storage.getAutoBackupStatus",
                  );
                  return parseJsonSafely(rawPayload, null);
                },
              },
            );
            if (useFreshBootstrap) {
              applyNativePageBootstrapToManagedMirror(
                normalizedPage,
                fallbackBootstrap,
                normalizedOptions,
              );
            }
            return fallbackBootstrap;
          } catch (loaderError) {
            console.error(
              "拼装 React Native 页面引导状态失败，回退内存快照:",
              loaderError,
            );
          }
          return this.peekPageBootstrapState(normalizedPage, normalizedOptions);
        },
        async getDraft(key, options = {}) {
          try {
            if (typeof reactNativeBridge?.call === "function") {
              const rawPayload = await reactNativeBridge.call("storage.getDraft", {
                key,
                options,
              });
              const parsed = parseJsonSafely(rawPayload, null);
              return parsed ?? null;
            }
          } catch (error) {
            console.error("读取 React Native 草稿失败，回退本地缓存:", error);
          }
          const storageKey = `${LOCAL_ONLY_STORAGE_PREFIX}draft:${String(key || "").trim()}`;
          const rawValue = nativeMethods.getItem?.call(window.localStorage, storageKey);
          if (rawValue === null || rawValue === undefined) {
            return null;
          }
          const parsed = safeDeserialize(rawValue);
          if (!isPlainObject(parsed)) {
            return null;
          }
          return options?.includeEnvelope === true
            ? parsed
            : cloneValue(parsed.value);
        },
        async setDraft(key, value, options = {}) {
          try {
            if (typeof reactNativeBridge?.call === "function") {
              const rawPayload = await reactNativeBridge.call("storage.setDraft", {
                key,
                value,
                options,
              });
              return parseJsonSafely(rawPayload, null);
            }
          } catch (error) {
            console.error("写入 React Native 草稿失败，回退本地缓存:", error);
          }
          const envelope = {
            key: String(key || "").trim(),
            updatedAt: new Date().toISOString(),
            value: cloneValue(typeof value === "undefined" ? null : value),
          };
          nativeMethods.setItem?.call(
            window.localStorage,
            `${LOCAL_ONLY_STORAGE_PREFIX}draft:${envelope.key}`,
            safeSerialize(envelope),
          );
          return envelope;
        },
        async removeDraft(key) {
          try {
            if (typeof reactNativeBridge?.call === "function") {
              const rawPayload = await reactNativeBridge.call(
                "storage.removeDraft",
                { key },
              );
              const parsed = parseJsonSafely(rawPayload, null);
              if (parsed !== null) {
                return parsed;
              }
            }
          } catch (error) {
            console.error("删除 React Native 草稿失败，回退本地缓存:", error);
          }
          nativeMethods.removeItem?.call(
            window.localStorage,
            `${LOCAL_ONLY_STORAGE_PREFIX}draft:${String(key || "").trim()}`,
          );
          return true;
        },
        async getPlanBootstrapState(options = {}) {
          const pageBootstrap = await this.getPageBootstrapState("plan", options);
          return (
            pageBootstrap?.data && typeof pageBootstrap.data === "object"
              ? {
                  yearlyGoals: cloneValue(pageBootstrap.data.yearlyGoals || {}),
                  recurringPlans: cloneValue(
                    Array.isArray(pageBootstrap.data.recurringPlans)
                      ? pageBootstrap.data.recurringPlans
                      : [],
                  ),
                }
              : {}
          );
        },
        async getCoreState() {
          const managedSnapshot = getManagedCoreStateSnapshot();
          if (hasManagedCoreSnapshot) {
            scheduleManagedFastValidation("core-fast-path");
            return managedSnapshot;
          }
          try {
            const rawPayload = await reactNativeBridge.call("storage.getCoreState");
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              const normalizedCorePayload =
                normalizeCorePayloadProjects(parsed).payload;
              const currentState = readState();
              cachedState = normalizeState(
                mergeManagedStateWithNativeCorePayload(parsed, currentState),
                buildMobileMetadata(normalizedCorePayload),
              );
              hasManagedCoreSnapshot = true;
              rebuildManagedSectionCoverage(cachedState, {
                markFull:
                  managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length,
              });
              lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
              hasPendingStateChanges = false;
              persistMirrorSnapshot(true);
              clearStorageSyncError();
              touchNativeFastProbeWindow();
              scheduleNativeProbeLoop();
              if (
                safeSerialize(parsed?.projects || []) !==
                safeSerialize(normalizedCorePayload?.projects || [])
              ) {
                void persistNativeProjectHierarchyRepair(
                  normalizedCorePayload.projects || [],
                  {
                    reason: "core-read-repair",
                  },
                );
              }
              return getManagedCoreStateSnapshot();
            }
          } catch (error) {
            console.error("读取 React Native 核心状态失败，回退本地快照:", error);
          }
          return managedSnapshot;
        },
        async getAutoBackupStatus() {
          try {
            const rawPayload = await reactNativeBridge.call("storage.getAutoBackupStatus");
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("读取 React Native 自动备份状态失败:", error);
          }
          return null;
        },
        async updateAutoBackupSettings(settings = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.updateAutoBackupSettings",
              {
                settings,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
            throw new Error("原生端没有返回自动备份设置结果。");
          } catch (error) {
            console.error("更新 React Native 自动备份设置失败:", error);
            const message =
              error instanceof Error && error.message
                ? error.message
                : "更新自动备份设置失败。";
            if (message.includes("Native bridge timeout")) {
              throw new Error("自动备份设置保存超时，请稍候重试。");
            }
            throw error instanceof Error ? error : new Error(message);
          }
        },
        async runAutoBackupNow() {
          try {
            const rawPayload = await reactNativeBridge.call("storage.runAutoBackupNow");
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
            throw new Error("原生端没有返回自动备份结果。");
          } catch (error) {
            console.error("执行 React Native 自动备份失败:", error);
            const message =
              error instanceof Error && error.message
                ? error.message
                : "执行自动备份失败。";
            if (message.includes("Native bridge timeout")) {
              throw new Error("自动备份执行超时，请稍后查看备份目录。");
            }
            throw error instanceof Error ? error : new Error(message);
          }
        },
        async shareLatestBackup() {
          try {
            const rawPayload = await reactNativeBridge.call("storage.shareLatestBackup");
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
            throw new Error("原生端没有返回分享结果。");
          } catch (error) {
            console.error("分享 React Native 最新备份失败:", error);
            const message =
              error instanceof Error && error.message
                ? error.message
                : "分享最新备份失败。";
            if (message.includes("Native bridge timeout")) {
              throw new Error("分享最新备份超时，请稍候重试。");
            }
            throw error instanceof Error ? error : new Error(message);
          }
        },
        async loadSectionRange(section, scope = {}) {
          const normalizedRange = canServeManagedSectionRange(section, scope);
          if (normalizedRange) {
            scheduleManagedFastValidation(`section-fast-path:${section}`);
            return loadManagedSectionRange(section, normalizedRange);
          }
          try {
            const rawPayload = await reactNativeBridge.call("storage.loadSectionRange", {
              section,
              scope,
            });
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              mergeManagedSectionRange(
                section,
                scope,
                Array.isArray(parsed.items) ? parsed.items : [],
              );
              return parsed;
            }
          } catch (error) {
            console.error("读取 React Native 分区范围失败，回退本地推导:", error);
          }
          return loadManagedSectionRange(section, scope);
        },
        async saveSectionRange(section, payload = {}) {
          const periodId = String(payload?.periodId || "").trim();
          const state = readState();
          const sectionItems =
            section === "plans"
              ? (state?.plans || []).filter(
                  (item) =>
                    !(typeof storageBundle?.isRecurringPlan === "function"
                      ? storageBundle.isRecurringPlan(item)
                      : String(item?.repeat || "").trim().toLowerCase() !== "none"),
                )
              : state?.[section] || [];
          const existingItems = sectionItems.filter(
            (item) => getManagedSectionPeriodId(section, item) === periodId,
          );
          const mergedItems =
            section === "records" && payload?.mode === "patch"
              ? (() => {
                  const removeIds = new Set(
                    [
                      ...(Array.isArray(payload?.removeIds) ? payload.removeIds : []),
                      ...(Array.isArray(payload?.removedItems)
                        ? payload.removedItems.map((item) => item?.id)
                        : []),
                    ]
                      .map((recordId) => String(recordId || "").trim())
                      .filter(Boolean),
                  );
                  const buildRecordMergeKey = (item = {}) => {
                    const recordId = String(item?.id || "").trim();
                    if (recordId) {
                      return `id:${recordId}`;
                    }
                    if (typeof storageBundle?.buildPartitionMergeKey === "function") {
                      return storageBundle.buildPartitionMergeKey("records", item);
                    }
                    return JSON.stringify({
                      name: item?.name || "",
                      projectId: item?.projectId || "",
                      startTime: item?.startTime || "",
                      endTime: item?.endTime || "",
                      timestamp: item?.timestamp || "",
                      spendtime: item?.spendtime || "",
                    });
                  };
                  const merged = new Map();
                  (Array.isArray(existingItems) ? existingItems : []).forEach((item) => {
                    merged.set(buildRecordMergeKey(item), cloneValue(item));
                  });
                  removeIds.forEach((recordId) => {
                    merged.delete(`id:${recordId}`);
                  });
                  (Array.isArray(payload?.items) ? payload.items : []).forEach((item) => {
                    merged.set(buildRecordMergeKey(item), cloneValue(item));
                  });
                  return typeof storageBundle?.sortPartitionItems === "function"
                    ? storageBundle.sortPartitionItems(
                        "records",
                        Array.from(merged.values()),
                      )
                    : Array.from(merged.values());
                })()
              : storageBundle?.mergePartitionItems?.(
                  section,
                  existingItems,
                  payload?.items || [],
                  payload?.mode === "merge" ? "merge" : "replace",
                ) || cloneValue(payload?.items || []);
          const remainingItems = sectionItems.filter(
            (item) => getManagedSectionPeriodId(section, item) !== periodId,
          );
          const nextState =
            section === "plans"
              ? {
                  ...state,
                  plans: [
                    ...remainingItems,
                    ...mergedItems,
                    ...(state?.plans || []).filter((item) =>
                      typeof storageBundle?.isRecurringPlan === "function"
                        ? storageBundle.isRecurringPlan(item)
                        : String(item?.repeat || "").trim().toLowerCase() !== "none",
                    ),
                  ],
                }
              : {
                  ...state,
                  [section]: [...remainingItems, ...mergedItems],
                };
          assignState(nextState);
          hasManagedCoreSnapshot = true;
          markManagedSectionPeriodsLoaded(section, [periodId]);
          persistMirrorSnapshot(true);
          const checkpoint = createManagedStateCheckpoint();
          const optimisticResult = {
            section,
            periodId,
            count: mergedItems.length,
          };
          try {
            return await queueManagedNativeDirectWrite(
              async () => {
                const rawPayload = await reactNativeBridge.call(
                  "storage.saveSectionRange",
                  {
                    section,
                    payload,
                  },
                );
                const parsed = parseJsonSafely(rawPayload, null);
                await settleManagedNativeDirectWrite(checkpoint);
                emitNativeStorageChangedBridgeEvent("section-save", {
                  changedSections: [section],
                  changedPeriods: {
                    [section]: periodId ? [periodId] : [],
                  },
                });
                return parsed && typeof parsed === "object"
                  ? parsed
                  : optimisticResult;
              },
              {
                errorLabel: "保存 React Native 分区范围失败:",
              },
            );
          } catch (error) {
            console.error("保存 React Native 分区范围失败，已保留本地镜像:", error);
            markPendingNativeStorageChangeMetadata({
              changedSections: [section],
              changedPeriods: {
                [section]: periodId ? [periodId] : [],
              },
            });
            scheduleManagedPendingNativeFlush();
            throw error;
          }
        },
        async replaceCoreState(partialCore = {}, options = {}) {
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const normalizedCorePatch = normalizeCorePayloadProjects(partialCore).payload;
          const changedSections = inferChangedSectionsFromCorePatch(
            normalizedCorePatch,
          );
          assignState({
            ...readState(),
            ...(normalizedCorePatch &&
            typeof normalizedCorePatch === "object" &&
            !Array.isArray(normalizedCorePatch)
              ? normalizedCorePatch
              : {}),
          });
          hasManagedCoreSnapshot = true;
          persistMirrorSnapshot(true);
          const checkpoint = createManagedStateCheckpoint();
          const optimisticResult = getManagedCoreStateSnapshot();
          try {
            return await queueManagedNativeDirectWrite(
              async () => {
                const rawPayload = await reactNativeBridge.call(
                  "storage.replaceCoreState",
                  {
                    partialCore: normalizedCorePatch,
                    options: normalizedOptions,
                  },
                );
                const parsed = parseJsonSafely(rawPayload, null);
                await settleManagedNativeDirectWrite(checkpoint);
                emitNativeStorageChangedBridgeEvent("core-replace", {
                  changedSections,
                });
                return parsed && typeof parsed === "object"
                  ? parsed
                  : optimisticResult;
              },
              {
                errorLabel: "替换 React Native 核心状态失败:",
              },
            );
          } catch (error) {
            console.error("替换 React Native 核心状态失败，已保留本地镜像:", error);
            markPendingNativeStorageChangeMetadata({
              changedSections,
            });
            scheduleManagedPendingNativeFlush();
            throw error;
          }
        },
        async replaceRecurringPlans(items = []) {
          const state = readState();
          const oneTimePlans = (state?.plans || []).filter(
            (item) =>
              !(typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none"),
          );
          const recurringPlans = Array.isArray(items) ? items : [];
          assignState({
            ...state,
            plans: [...oneTimePlans, ...recurringPlans],
          });
          hasManagedCoreSnapshot = true;
          persistMirrorSnapshot(true);
          const checkpoint = createManagedStateCheckpoint();
          try {
            return await queueManagedNativeDirectWrite(
              async () => {
                const rawPayload = await reactNativeBridge.call(
                  "storage.replaceRecurringPlans",
                  {
                    items: recurringPlans,
                  },
                );
                const parsed = parseJsonSafely(rawPayload, null);
                await settleManagedNativeDirectWrite(checkpoint);
                emitNativeStorageChangedBridgeEvent("plans-recurring-replace", {
                  changedSections: ["plansRecurring"],
                });
                return Array.isArray(parsed) ? parsed : recurringPlans;
              },
              {
                errorLabel: "替换 React Native 重复计划失败:",
              },
            );
          } catch (error) {
            console.error("替换 React Native 重复计划失败，已保留本地镜像:", error);
            markPendingNativeStorageChangeMetadata({
              changedSections: ["plansRecurring"],
            });
            scheduleManagedPendingNativeFlush();
            throw error;
          }
        },
        async exportBundle(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.exportBundle",
              {
                options,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("导出 React Native bundle 失败:", error);
          }
          return null;
        },
        async pickImportSourceFile(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.pickImportSourceFile",
              {
                options,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("选择 React Native 导入文件失败:", error);
            throw error;
          }
          return null;
        },
        async inspectImportSourceFile(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.inspectImportSourceFile",
              {
                options,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("检查 React Native 导入文件失败:", error);
            throw error;
          }
          return null;
        },
        async previewExternalImport(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.previewExternalImport",
              {
                options,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("预览 React Native 外部 JSON 导入失败:", error);
            throw error;
          }
          return null;
        },
        async importSource(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.importSource",
              {
                options,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              const syncResult = await syncStateFromNative("", {
                suppressError: false,
              });
              dispatchStorageChangedEvent(
                "import",
                syncResult?.state || buildMergedState(readState()),
                syncResult?.status || cachedStatus,
                {
                  changedSections: Array.isArray(parsed.changedSections)
                    ? parsed.changedSections
                    : DEFAULT_CHANGED_SECTIONS,
                  changedPeriods:
                    parsed.changedPeriods &&
                    typeof parsed.changedPeriods === "object"
                      ? parsed.changedPeriods
                      : {},
                  source:
                    typeof parsed.type === "string"
                      ? `native-import:${parsed.type}`
                      : "native-import",
                },
              );
              return parsed;
            }
          } catch (error) {
            console.error("导入 React Native bundle 失败:", error);
            throw error;
          }
          return null;
        },
      },
    });

    window.ControlerStorage.selectStorageFile = async () => {
      const result = await reactNativeBridge.call("storage.selectFile");
      const parsed = parseJsonSafely(result, null);
      if (parsed && typeof parsed === "object") {
        cachedStatus = parsed;
        const next = await readNativeSnapshot();
        if (next?.state) {
          cachedState = next.state;
          hasManagedCoreSnapshot = true;
          rebuildManagedSectionCoverage(cachedState, {
            markFull: true,
          });
          lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
          hasPendingStateChanges = false;
          persistMirrorSnapshot(true);
          updateVersionBaseline(cachedStatus);
          clearStorageSyncError();
          touchNativeFastProbeWindow();
        }
      }
      return parsed;
    };

    window.ControlerStorage.selectStorageDirectory = async () => {
      const result = await reactNativeBridge.call("storage.selectDirectory");
      const parsed = parseJsonSafely(result, null);
      if (parsed && typeof parsed === "object") {
        cachedStatus = parsed;
        const next = await readNativeSnapshot();
        if (next?.state) {
          cachedState = next.state;
          hasManagedCoreSnapshot = true;
          rebuildManagedSectionCoverage(cachedState, {
            markFull: true,
          });
          lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
          hasPendingStateChanges = false;
          persistMirrorSnapshot(true);
          updateVersionBaseline(cachedStatus);
          clearStorageSyncError();
          touchNativeFastProbeWindow();
        }
      }
      return parsed;
    };

    window.ControlerStorage.resetStorageFile = async () => {
      const result = await reactNativeBridge.call("storage.resetFile");
      const parsed = parseJsonSafely(result, null);
      if (parsed && typeof parsed === "object") {
        cachedStatus = parsed;
        const next = await readNativeSnapshot();
        if (next?.state) {
          cachedState = next.state;
          hasManagedCoreSnapshot = true;
          rebuildManagedSectionCoverage(cachedState, {
            markFull: true,
          });
          lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
          hasPendingStateChanges = false;
          persistMirrorSnapshot(true);
          updateVersionBaseline(cachedStatus);
          clearStorageSyncError();
          touchNativeFastProbeWindow();
        }
      }
      return parsed;
    };

    void initializeReactNativeStorage().finally(() => {
      nativeInitializationSettled = true;
      markStorageReady();
      const queuedForegroundSync = pendingForegroundSyncRequest;
      if (queuedForegroundSync && shellPageActive) {
        pendingForegroundSyncRequest = null;
        scheduleNativeForegroundSync(queuedForegroundSync.reason, {
          resetWindow: queuedForegroundSync.resetWindow,
        });
      }
      if (useAndroidProbeLoop && !document.hidden && shellPageActive) {
        touchNativeFastProbeWindow();
        scheduleNativeProbeLoop();
      }
    });
    window.addEventListener("controler:native-bridge-event", (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      if (detail.name === "storage.changed") {
        if (!shellPageActive) {
          return;
        }
        touchNativeFastProbeWindow();
        writeChain = writeChain
          .then(async () => {
            if (hasPendingStateChanges) {
              await writeNativeState();
            }
            return syncStateFromNative(
              typeof detail.reason === "string" && detail.reason.trim()
                ? detail.reason.trim()
                : "external-update",
              {
                forceDispatch: true,
                changedSections: detail.changedSections || [],
                changedPeriods: detail.changedPeriods || {},
                source:
                  typeof detail.source === "string" ? detail.source.trim() : "",
              },
            );
          })
          .catch((error) => {
            console.error("同步 React Native 存储广播失败:", error);
          });
        return;
      }
      if (detail.name !== "ui.shell-visibility") {
        return;
      }

      const nextActive = detail.active !== false;
      window.__CONTROLER_SHELL_VISIBILITY__ = {
        active: nextActive,
        slot: typeof detail.slot === "string" ? detail.slot : "",
        reason: typeof detail.reason === "string" ? detail.reason : "",
        page: typeof detail.page === "string" ? detail.page : "",
        href: typeof detail.href === "string" ? detail.href : "",
        receivedAt: Date.now(),
      };
      if (shellPageActive === nextActive) {
        return;
      }

      shellPageActive = nextActive;
      if (!shellPageActive) {
        pendingForegroundSyncRequest = {
          reason: "shell-resume",
          resetWindow: false,
        };
        stopNativeProbeLoop();
        void persistNow().catch((error) => {
          console.error("隐藏页面时刷新 React Native 存储失败:", error);
        });
        return;
      }

      scheduleNativeForegroundSync("shell-resume", {
        resetWindow: false,
      });
      scheduleNativeProbeLoop();
    });
    window.addEventListener("focus", () => {
      scheduleNativeForegroundSync("external-update");
    });
    window.addEventListener("pageshow", () => {
      scheduleNativeForegroundSync("external-update");
    });
    window.addEventListener("controler:native-app-resume", () => {
      scheduleNativeForegroundSync("external-update");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        void persistNow().catch((error) => {
          console.error("页面隐藏时刷新 React Native 存储失败:", error);
        });
        stopNativeProbeLoop();
        return;
      }
      if (!shellPageActive) {
        return;
      }
      scheduleNativeForegroundSync("external-update");
      scheduleNativeProbeLoop();
    });
    window.addEventListener("beforeunload", () => {
      window.clearTimeout(writeTimer);
      window.clearTimeout(mirrorFlushTimer);
      stopNativeProbeLoop();
      persistMirrorSnapshot(true);
    });
    return;
  }

  const browserPlatform =
    typeof reactNativeBridge?.platform === "string"
      ? reactNativeBridge.platform
      : "web";
  const buildBrowserMetadata = (extra = {}) => ({
    storagePath: "browser://localStorage/bundle-manifest.json",
    storageDirectory: "browser://localStorage",
    userDataPath: "Browser LocalStorage",
    documentsPath: "Browser LocalStorage",
    platform: browserPlatform,
    fileName: MOBILE_FILE_NAME,
    uri: BROWSER_STATE_KEY,
    ...extra,
  });

  function readRawBrowserStorageState() {
    const rawRoot = nativeMethods.getItem?.call(window.localStorage, BROWSER_STATE_KEY);
    const migratedState = normalizeState({}, buildBrowserMetadata());
    const migratedKeys = [];
    let shouldRewriteRoot = false;

    if (typeof rawRoot === "string" && rawRoot.trim()) {
      const parsedRootState = parseJsonSafely(rawRoot, {});
      adoptLegacyLocalOnlyValues(parsedRootState);
      const normalizedRootState = normalizeState(
        parsedRootState,
        buildBrowserMetadata(),
      );
      Object.assign(migratedState, normalizedRootState);
      shouldRewriteRoot =
        JSON.stringify(normalizedRootState) !== JSON.stringify(parsedRootState);
    }

    const rawLength =
      nativeLengthDescriptor?.get?.call(window.localStorage) ??
      window.localStorage.length;

    for (let index = 0; index < rawLength; index += 1) {
      const key = nativeMethods.key?.call(window.localStorage, index);
      if (
        !key ||
        key === BROWSER_STATE_KEY ||
        key === MOBILE_MIRROR_STATE_KEY ||
        key === MOBILE_MIRROR_STATUS_KEY ||
        key === MOBILE_MIRROR_PENDING_WRITE_KEY ||
        key.startsWith(LOCAL_ONLY_STORAGE_PREFIX)
      ) {
        continue;
      }

      migratedKeys.push(key);
      const rawValue = safeDeserialize(
        nativeMethods.getItem?.call(window.localStorage, key),
      );
      if (isSharedStateKey(key)) {
        migratedState[key] = rawValue;
      } else {
        writeRawLocalOnlyValue(key, rawValue);
      }
      shouldRewriteRoot = true;
    }

    if (shouldRewriteRoot || typeof rawRoot !== "string" || !rawRoot.trim()) {
      nativeMethods.setItem?.call(
        window.localStorage,
        BROWSER_STATE_KEY,
        JSON.stringify(migratedState),
      );
    }
    migratedKeys.forEach((key) => {
      nativeMethods.removeItem?.call(window.localStorage, key);
    });

    return normalizeState(migratedState, buildBrowserMetadata());
  }

  let cachedBrowserState = readRawBrowserStorageState();

  function readBrowserState() {
    return cachedBrowserState;
  }

  function assignBrowserState(nextState) {
    cachedBrowserState = normalizeState(nextState, buildBrowserMetadata());
    return cachedBrowserState;
  }

  function persistBrowserState() {
    const nextState = normalizeState(readBrowserState(), {
      ...buildBrowserMetadata(),
      touchModified: true,
      touchSyncSave: true,
    });
    cachedBrowserState = nextState;
    nativeMethods.setItem?.call(
      window.localStorage,
      BROWSER_STATE_KEY,
      JSON.stringify(nextState),
    );
  }

  async function syncFromBrowserSource(options = {}) {
    const reason =
      typeof options.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "manual-sync";
    const currentSnapshot = createComparableSnapshot(readBrowserState());
    cachedBrowserState = readRawBrowserStorageState();
    const nextSnapshot = createComparableSnapshot(cachedBrowserState);
    const nextStatus = await window.ControlerStorage?.getStorageStatus?.();

    clearStorageSyncError();
    if (reason && nextSnapshot !== currentSnapshot) {
      dispatchStorageChangedEvent(
        reason,
        buildMergedState(cachedBrowserState),
        nextStatus,
      );
    }

    return createSourceSyncResult(buildMergedState(cachedBrowserState), nextStatus);
  }

  installManagedLocalStorage({
    platform: browserPlatform,
    capabilities: resolvedRuntimeCapabilities,
    readState: readBrowserState,
    assignState: assignBrowserState,
    persistState: persistBrowserState,
    reloadState() {
      cachedBrowserState = readRawBrowserStorageState();
      return cachedBrowserState;
    },
    async getStorageStatus() {
      const serialized = JSON.stringify(buildMergedState(readBrowserState()));
      return {
        projects: Array.isArray(cachedBrowserState.projects)
          ? cachedBrowserState.projects.length
          : 0,
        records: Array.isArray(cachedBrowserState.records)
          ? cachedBrowserState.records.length
          : 0,
        size: serialized.length,
        storagePath: "browser://localStorage/bundle-manifest.json",
        storageDirectory: "browser://localStorage",
        actualUri: BROWSER_STATE_KEY,
        userDataPath: "Browser LocalStorage",
        documentsPath: "Browser LocalStorage",
        isCustomPath: false,
        storageMode: "directory-bundle",
        bundleMode: "directory-bundle",
        syncFileName: MOBILE_FILE_NAME,
        platform: browserPlatform,
      };
    },
    syncFromSource(options = {}) {
      return syncFromBrowserSource(options);
    },
  });

  function resolveLocalStateKey(key) {
    const normalizedKey = String(key || "").trim();
    return LOCAL_ONLY_STATE_KEY_ALIASES[normalizedKey] || normalizedKey;
  }

  function isSharedStateKey(key) {
    return SHARED_STATE_KEYS.has(String(key || "").trim());
  }

  function isLocalStateKey(key) {
    const actualKey = resolveLocalStateKey(key);
    if (!actualKey) {
      return false;
    }
    if (LOCAL_ONLY_EXACT_KEYS.has(actualKey)) {
      return true;
    }
    return LOCAL_ONLY_KEY_PREFIXES.some((prefix) => actualKey.startsWith(prefix));
  }

  function getLocalStorageNamespaceKey(key) {
    return `${LOCAL_ONLY_STORAGE_PREFIX}${resolveLocalStateKey(key)}`;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== BROWSER_STATE_KEY) {
      return;
    }
    cachedBrowserState = normalizeState(
      parseJsonSafely(event.newValue, {}),
      buildBrowserMetadata(),
    );
    dispatchStorageChangedEvent("external-update", buildMergedState(cachedBrowserState), {
      actualUri: BROWSER_STATE_KEY,
      storagePath: "browser://localStorage/bundle-manifest.json",
    });
  });

  bindExternalSyncAutoReload();
})();


;/* pages/widget-bridge.js */
(() => {
  const LAUNCH_ACTION_EVENT = "controler:launch-action";
  const DEFAULT_ANDROID_PIN_SUPPORT = Object.freeze({
    ok: false,
    kind: "",
    supported: false,
    apiSupported: false,
    launcherSupported: false,
    canRequestPin: false,
    manualOnly: false,
    providerAvailable: false,
    reason: "unsupported-env",
    message: "当前环境不支持 Android 小组件固定。",
  });
  let nativeLaunchPollPending = false;
  const androidPinSupportCache = new Map();

  function getPlatformContract() {
    const contract = window.ControlerPlatformContract;
    return contract && typeof contract === "object" ? contract : null;
  }

  function detectElectronShell() {
    const userAgent =
      typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
    return /\bElectron\/\d+/i.test(userAgent);
  }

  function resolveDesktopWidgetBridgeState(electronAPI) {
    const isElectronShell = !!electronAPI?.isElectron || detectElectronShell();
    const hasElectronBridge = !!electronAPI?.isElectron;
    const supportsDesktopWidgets =
      hasElectronBridge &&
      typeof electronAPI?.desktopWidgetsCreate === "function" &&
      typeof electronAPI?.desktopWidgetsGetState === "function";

    if (!isElectronShell) {
      return {
        isElectronShell: false,
        hasElectronBridge: false,
        supportsDesktopWidgets: false,
        desktopWidgetBridgeStatus: "unsupported-env",
        desktopWidgetBridgeMessage: "当前环境暂未声明可用的小组件能力。",
      };
    }

    if (!hasElectronBridge) {
      return {
        isElectronShell: true,
        hasElectronBridge: false,
        supportsDesktopWidgets: false,
        desktopWidgetBridgeStatus: "electron-preload-missing",
        desktopWidgetBridgeMessage:
          "检测到当前运行在 Electron 中，但预加载桥接未成功注入。桌面小组件与窗口按钮暂时不可用，请使用修复后的版本重新启动应用。",
      };
    }

    if (!supportsDesktopWidgets) {
      return {
        isElectronShell: true,
        hasElectronBridge: true,
        supportsDesktopWidgets: false,
        desktopWidgetBridgeStatus: "electron-desktop-widget-ipc-missing",
        desktopWidgetBridgeMessage:
          "Electron 桥接已加载，但桌面小组件接口未完整暴露。请重新安装或使用修复后的版本。",
      };
    }

    return {
      isElectronShell: true,
      hasElectronBridge: true,
      supportsDesktopWidgets: true,
      desktopWidgetBridgeStatus: "ready",
      desktopWidgetBridgeMessage: "",
    };
  }

  function resolveRuntimeMeta() {
    const electronAPI = window.electronAPI || null;
    const nativeBridge = window.ControlerNativeBridge || null;
    const storageBridge = window.ControlerStorage || null;
    const nativePlatform =
      typeof nativeBridge?.platform === "string" && nativeBridge.platform.trim()
        ? nativeBridge.platform.trim()
        : typeof storageBridge?.platform === "string" &&
            storageBridge.platform.trim()
          ? storageBridge.platform.trim()
          : "web";

    if (electronAPI?.runtimeMeta && typeof electronAPI.runtimeMeta === "object") {
      return electronAPI.runtimeMeta;
    }

    if (nativeBridge?.isReactNativeApp) {
      return {
        runtime: "react-native",
        platform: nativePlatform,
        capabilities:
          nativeBridge?.capabilities && typeof nativeBridge.capabilities === "object"
            ? nativeBridge.capabilities
            : storageBridge?.capabilities && typeof storageBridge.capabilities === "object"
              ? storageBridge.capabilities
              : {},
      };
    }

    const contract = getPlatformContract();
    if (typeof contract?.getRuntimeProfile === "function") {
      return contract.getRuntimeProfile({
        isElectron: !!electronAPI?.isElectron,
        isReactNativeApp: !!nativeBridge?.isReactNativeApp,
        platform: electronAPI?.platform || nativePlatform,
      });
    }

    return {
      runtime: electronAPI?.isElectron ? "electron" : "web",
      platform: electronAPI?.platform || nativePlatform,
      capabilities: {},
    };
  }

  function getRuntimeSnapshot() {
    const electronAPI = window.electronAPI || null;
    const nativeBridge = window.ControlerNativeBridge || null;
    const storageBridge = window.ControlerStorage || null;
    const runtimeMeta = resolveRuntimeMeta();
    const capabilities =
      runtimeMeta?.capabilities && typeof runtimeMeta.capabilities === "object"
        ? runtimeMeta.capabilities
        : {};

    const desktopWidgetBridgeState = resolveDesktopWidgetBridgeState(electronAPI);
    const isElectron = !!electronAPI?.isElectron;
    const hasNativeCall = typeof nativeBridge?.call === "function";
    const nativePlatform =
      typeof runtimeMeta?.platform === "string" && runtimeMeta.platform.trim()
        ? runtimeMeta.platform.trim()
        : typeof nativeBridge?.platform === "string" && nativeBridge.platform.trim()
          ? nativeBridge.platform.trim()
          : typeof storageBridge?.platform === "string" &&
              storageBridge.platform.trim()
            ? storageBridge.platform.trim()
            : "web";
    const isNativePlatform =
      !!storageBridge?.isNativeApp ||
      nativePlatform === "android" ||
      nativePlatform === "ios" ||
      (!!nativeBridge?.isReactNativeApp && hasNativeCall);
    const isAndroid = nativePlatform === "android";
    const supportsWidgets = !!capabilities.widgets;
    const supportsWidgetPinning = !!capabilities.widgetPinning && hasNativeCall;
    const supportsWidgetManualAdd = !!capabilities.widgetManualAdd;
    const supportsAndroidWidgets = isAndroid && supportsWidgets;
    return {
      electronAPI,
      nativeBridge,
      storageBridge,
      runtimeMeta,
      capabilities,
      hasNativeCall,
      nativePlatform,
      isElectron,
      isElectronShell: desktopWidgetBridgeState.isElectronShell,
      hasElectronBridge: desktopWidgetBridgeState.hasElectronBridge,
      isNativePlatform,
      isAndroid,
      supportsWidgets,
      supportsWidgetPinning,
      supportsWidgetManualAdd,
      supportsAndroidWidgets,
      supportsDesktopWidgets: desktopWidgetBridgeState.supportsDesktopWidgets,
      desktopWidgetBridgeStatus:
        desktopWidgetBridgeState.desktopWidgetBridgeStatus,
      desktopWidgetBridgeMessage:
        desktopWidgetBridgeState.desktopWidgetBridgeMessage,
    };
  }

  function isReactNativeNavigationRuntime(snapshot = getRuntimeSnapshot()) {
    return (
      !!snapshot?.nativeBridge?.isReactNativeApp ||
      snapshot?.runtimeMeta?.runtime === "react-native"
    );
  }

  function getCurrentPageName() {
    const rawName = window.location.pathname.split("/").pop() || "index.html";
    return String(rawName).replace(/\.html$/i, "") || "index";
  }

  function normalizePageName(pageName) {
    if (typeof pageName !== "string") return "";
    return pageName.replace(/\.html$/i, "").trim();
  }

  function buildPageUrl(pageName, payload = {}) {
    const safePage = normalizePageName(pageName) || "index";
    const url = new URL(`${safePage}.html`, window.location.href);
    const action =
      typeof payload.action === "string" ? payload.action.trim() : "";
    const widgetKind =
      typeof payload.widgetKind === "string" ? payload.widgetKind.trim() : "";
    const source =
      typeof payload.source === "string" && payload.source.trim()
        ? payload.source.trim()
        : "launcher";
    if (action) {
      url.searchParams.set("widgetAction", action);
      url.searchParams.set("widgetSource", source);
    }
    if (widgetKind) {
      url.searchParams.set("widgetKind", widgetKind);
    }
    return `${url.pathname.split("/").pop()}${url.search}`;
  }

  function dispatchLaunchAction(payload = {}) {
    window.dispatchEvent(
      new CustomEvent(LAUNCH_ACTION_EVENT, {
        detail: {
          page: normalizePageName(payload.page) || getCurrentPageName(),
          action: typeof payload.action === "string" ? payload.action.trim() : "",
          widgetKind:
            typeof payload.widgetKind === "string"
              ? payload.widgetKind.trim()
              : "",
          source:
            typeof payload.source === "string" && payload.source.trim()
              ? payload.source.trim()
              : "widget",
          payload:
            payload.payload && typeof payload.payload === "object"
              ? payload.payload
              : {},
        },
      }),
    );
  }

  function routeOrDispatchLaunchAction(payload = {}) {
    const currentPage = getCurrentPageName();
    const targetPage = normalizePageName(payload.page) || currentPage;
    const action = typeof payload.action === "string" ? payload.action.trim() : "";

    if (targetPage && targetPage !== currentPage) {
      const nextUrl = buildPageUrl(targetPage, {
        action,
        widgetKind: payload.widgetKind,
        source: payload.source,
      });
      const currentUrl = `${window.location.pathname.split("/").pop()}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        window.location.href = nextUrl;
      }
      return true;
    }

    dispatchLaunchAction({
      ...payload,
      page: targetPage || currentPage,
      action,
    });
    return true;
  }

  async function safeNativeCall(methodName, payload = {}) {
    const snapshot = getRuntimeSnapshot();
    if (!snapshot.isNativePlatform || !snapshot.hasNativeCall) {
      return null;
    }

    const methodMap = {
      getPinSupport: "widgets.getPinSupport",
      requestPinWidget: "widgets.requestPinWidget",
      consumePinWidgetResult: "widgets.consumePinWidgetResult",
      openHomeScreen: "widgets.openHomeScreen",
      refreshWidgets: "widgets.refresh",
      consumeLaunchAction: "widgets.consumeLaunchAction",
    };
    const nativeMethod = methodMap[methodName];
    if (!nativeMethod) {
      return null;
    }

    try {
      return await snapshot.nativeBridge.call(nativeMethod, payload);
    } catch (error) {
      console.error(`调用原生桥接失败: ${methodName}`, error);
      return {
        ok: false,
        supported: false,
        message: error?.message || String(error),
      };
    }
  }

  async function pollNativeLaunchAction() {
    const snapshot = getRuntimeSnapshot();
    if (
      nativeLaunchPollPending ||
      !snapshot.isNativePlatform ||
      !snapshot.hasNativeCall ||
      isReactNativeNavigationRuntime(snapshot)
    ) {
      return null;
    }

    nativeLaunchPollPending = true;
    try {
      const payload = await safeNativeCall("consumeLaunchAction");
      if (payload?.hasAction) {
        routeOrDispatchLaunchAction(payload);
        return payload;
      }
      return null;
    } finally {
      nativeLaunchPollPending = false;
    }
  }

  const initialSnapshot = getRuntimeSnapshot();

  if (
    initialSnapshot.isElectron &&
    typeof initialSnapshot.electronAPI?.onMainWindowAction === "function"
  ) {
    initialSnapshot.electronAPI.onMainWindowAction((payload) => {
      routeOrDispatchLaunchAction(payload || {});
    });
  }

  if (!isReactNativeNavigationRuntime(initialSnapshot)) {
    window.setTimeout(() => {
      void pollNativeLaunchAction();
    }, 80);

    window.addEventListener("focus", () => {
      void pollNativeLaunchAction();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        void pollNativeLaunchAction();
      }
    });
  }

  function normalizeAndroidPinSupport(kind, payload = null) {
    const normalizedKind = typeof kind === "string" ? kind.trim() : "";
    const support =
      payload && typeof payload === "object"
        ? {
            ...DEFAULT_ANDROID_PIN_SUPPORT,
            ...payload,
          }
        : {
            ...DEFAULT_ANDROID_PIN_SUPPORT,
          };
    support.kind =
      typeof support.kind === "string" && support.kind.trim()
        ? support.kind.trim()
        : normalizedKind;
    support.ok = !!support.ok;
    support.supported = !!support.supported;
    support.apiSupported = !!support.apiSupported;
    support.launcherSupported = !!support.launcherSupported;
    support.canRequestPin = !!support.canRequestPin;
    support.manualOnly = !!support.manualOnly;
    support.providerAvailable = !!support.providerAvailable;
    support.reason =
      typeof support.reason === "string" && support.reason.trim()
        ? support.reason.trim()
        : DEFAULT_ANDROID_PIN_SUPPORT.reason;
    support.message =
      typeof support.message === "string" && support.message.trim()
        ? support.message.trim()
        : DEFAULT_ANDROID_PIN_SUPPORT.message;
    return support;
  }

  const bridgeApi = {
    launchActionEventName: LAUNCH_ACTION_EVENT,
    get isElectron() {
      return getRuntimeSnapshot().isElectron;
    },
    get isElectronShell() {
      return getRuntimeSnapshot().isElectronShell;
    },
    get hasElectronBridge() {
      return getRuntimeSnapshot().hasElectronBridge;
    },
    get nativePlatform() {
      return getRuntimeSnapshot().nativePlatform;
    },
    get isNativePlatform() {
      return getRuntimeSnapshot().isNativePlatform;
    },
    get isAndroid() {
      return getRuntimeSnapshot().isAndroid;
    },
    get capabilities() {
      return getRuntimeSnapshot().capabilities;
    },
    get supportsWidgets() {
      return getRuntimeSnapshot().supportsWidgets;
    },
    get supportsWidgetPinning() {
      return getRuntimeSnapshot().supportsWidgetPinning;
    },
    get supportsWidgetManualAdd() {
      return getRuntimeSnapshot().supportsWidgetManualAdd;
    },
    get supportsAndroidWidgets() {
      return getRuntimeSnapshot().supportsAndroidWidgets;
    },
    get supportsDesktopWidgets() {
      return getRuntimeSnapshot().supportsDesktopWidgets;
    },
    get desktopWidgetBridgeStatus() {
      return getRuntimeSnapshot().desktopWidgetBridgeStatus;
    },
    get desktopWidgetBridgeMessage() {
      return getRuntimeSnapshot().desktopWidgetBridgeMessage;
    },
    async getPinSupport(kind) {
      const snapshot = getRuntimeSnapshot();
      const normalizedKind = typeof kind === "string" ? kind.trim() : "";
      if (!snapshot.isAndroid || !snapshot.hasNativeCall) {
        return normalizeAndroidPinSupport(normalizedKind, null);
      }
      if (androidPinSupportCache.has(normalizedKind)) {
        return {
          ...androidPinSupportCache.get(normalizedKind),
        };
      }
      const result = await safeNativeCall("getPinSupport", { kind: normalizedKind });
      const normalized = normalizeAndroidPinSupport(normalizedKind, result);
      androidPinSupportCache.set(normalizedKind, normalized);
      return {
        ...normalized,
      };
    },
    async requestPinWidget(kind) {
      const snapshot = getRuntimeSnapshot();
      const normalizedKind = typeof kind === "string" ? kind.trim() : "";
      if (!snapshot.supportsWidgetPinning || !snapshot.isAndroid) {
        return {
          ok: false,
          supported: !!snapshot.supportsWidgets,
          manual: !!snapshot.supportsWidgetManualAdd,
          message: snapshot.supportsWidgetManualAdd
            ? "请通过系统小组件面板手动添加。"
            : "当前环境不支持 Android 小组件固定。",
        };
      }
      const support = await bridgeApi.getPinSupport(normalizedKind);
      if (!support.canRequestPin) {
        return {
          ok: false,
          supported: false,
          manual: !!support.manualOnly,
          requestAccepted: false,
          flow: support.manualOnly ? "manual" : "error",
          ...support,
        };
      }
      const result = await safeNativeCall("requestPinWidget", { kind: normalizedKind });
      return (
        result || {
          ok: false,
          supported: false,
          manual: false,
          message: "当前环境不支持 Android 小组件固定。",
        }
      );
    },
    async consumePinWidgetResult() {
      const result = await safeNativeCall("consumePinWidgetResult");
      return result && typeof result === "object"
        ? result
        : {
            hasResult: false,
          };
    },
    async openHomeScreen() {
      const snapshot = getRuntimeSnapshot();
      if (
        !snapshot.isAndroid ||
        !snapshot.hasNativeCall ||
        !snapshot.capabilities?.openHomeScreen
      ) {
        return {
          ok: false,
          supported: false,
          message: "当前环境不支持返回桌面。",
        };
      }
      const result = await safeNativeCall("openHomeScreen");
      return (
        result || {
          ok: false,
          supported: false,
          message: "当前环境不支持返回桌面。",
        }
      );
    },
    async notifyDataChanged() {
      const snapshot = getRuntimeSnapshot();
      if (snapshot.supportsDesktopWidgets) {
        return true;
      }
      const result = await safeNativeCall("refreshWidgets");
      return !!result?.ok;
    },
    async consumeLaunchAction() {
      const payload = await safeNativeCall("consumeLaunchAction");
      if (payload?.hasAction) {
        routeOrDispatchLaunchAction(payload);
      }
      return payload || null;
    },
    async createDesktopWidget(kind) {
      const snapshot = getRuntimeSnapshot();
      if (typeof snapshot.electronAPI?.desktopWidgetsCreate !== "function") {
        return {
          ok: false,
          message: snapshot.desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return await snapshot.electronAPI.desktopWidgetsCreate({ kind });
      } catch (error) {
        console.error("创建桌面小组件失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
    async removeDesktopWidget(widgetId) {
      const snapshot = getRuntimeSnapshot();
      if (typeof snapshot.electronAPI?.desktopWidgetsRemove !== "function") {
        return {
          ok: false,
          message: snapshot.desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return await snapshot.electronAPI.desktopWidgetsRemove(widgetId);
      } catch (error) {
        console.error("移除桌面小组件失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
    async getDesktopWidgetState() {
      const snapshot = getRuntimeSnapshot();
      if (typeof snapshot.electronAPI?.desktopWidgetsGetState !== "function") {
        return {
          available: false,
          widgets: [],
          openAtLogin: false,
          restoreOnLaunch: false,
          keepOnTop: true,
          message:
            snapshot.desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return await snapshot.electronAPI.desktopWidgetsGetState();
      } catch (error) {
        console.error("读取桌面小组件状态失败:", error);
        return {
          available: false,
          widgets: [],
          openAtLogin: false,
          restoreOnLaunch: false,
          keepOnTop: true,
          message: error?.message || String(error),
        };
      }
    },
    async updateDesktopWidgetSettings(settings = {}) {
      const snapshot = getRuntimeSnapshot();
      if (typeof snapshot.electronAPI?.desktopWidgetsUpdateSettings !== "function") {
        return {
          ok: false,
          message:
            snapshot.desktopWidgetBridgeMessage || "当前环境不支持桌面小组件设置。",
        };
      }
      try {
        return await snapshot.electronAPI.desktopWidgetsUpdateSettings(settings);
      } catch (error) {
        console.error("更新桌面小组件设置失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
    async openMainAction(payload = {}) {
      const snapshot = getRuntimeSnapshot();
      if (typeof snapshot.electronAPI?.desktopWidgetsOpenMainAction === "function") {
        return snapshot.electronAPI.desktopWidgetsOpenMainAction(payload);
      }
      routeOrDispatchLaunchAction(payload);
      return true;
    },
    routeOrDispatchLaunchAction,
    dispatchLaunchAction,
  };

  window.ControlerWidgetsBridge = bridgeApi;
})();


;/* pages/i18n.js */
(()=>{const K="appLanguage",D="zh-CN",E="controler:language-changed",A={zh:"zh-CN","zh-CN":"zh-CN",en:"en-US","en-US":"en-US"},W={日:"Sun",一:"Mon",二:"Tue",三:"Wed",四:"Thu",五:"Fri",六:"Sat",周日:"Sun",周一:"Mon",周二:"Tue",周三:"Wed",周四:"Thu",周五:"Fri",周六:"Sat"},M={"时间跟踪器":"Time Tracker","时间记录":"Time Record","时间统计":"Time Stats","时间计划":"Planning","计划待办":"Plans & Todos","日记":"Diary","其他设置":"Settings","记录":"Record","统计":"Stats","计划":"Plan","设置":"Settings","主题配色":"Theme Colors","视图尺寸":"View Size","数据管理":"Data Management","导出数据":"Export Data","导入数据":"Import Data","清除所有数据":"Clear All Data","当前存储状态:":"Current storage status:","正在加载...":"Loading...","存储路径管理":"Storage Path","当前存储路径:":"Current storage path:","路径类型:":"Path type:","更改存储路径":"Change Storage Path","重置为默认路径":"Reset to Default Path","显示存储数据路径":"Show Storage Data Path","清除数据预览":"Clear Data Preview","以下数据将被清除:":"The following data will be removed:","此操作不可撤销！请确认是否继续。":"This action cannot be undone. Please confirm to continue.","取消":"Cancel","保存":"Save","删除":"Delete","编辑":"Edit","确认清除":"Confirm Clear","显示语言":"Display Language","界面语言":"Interface Language","切换应用界面语言，默认简体中文。":"Switch the app language. The default is Simplified Chinese.","简体中文":"Simplified Chinese","选择您喜欢的主题配色，设置将自动保存。":"Choose your preferred theme palette. Changes save automatically.","添加自定义主题":"Add Custom Theme","最小可调到 10%。":"The minimum adjustable size is 10%.","重置为默认 100%":"Reset to Default 100%","管理您的项目和时间记录数据。":"Manage your projects and time-tracking data.","选择时间范围并使用上方折叠按钮查看统计":"Select a date range and use the controls above to view stats","请选择合适的时间范围（表格视图最低显示 7 天，最多显示 14 天）":"Please choose a suitable range (table view supports 7 to 14 days)","月视图需要至少28天的时间范围，请选择更长的时间范围":"The monthly view needs at least 28 days. Please choose a longer range.","月视图最多支持90天，请选择更短的时间范围":"The monthly view supports up to 90 days. Please choose a shorter range.","每个色块代表一个时间段，鼠标悬停可查看详情":"Each color block represents a time slot. Hover for details.","请选择合适的时间范围（表格视图最低显示 7 天，最多显示 14 天）":"Please choose a suitable range (table view supports 7 to 14 days)","月视图需要至少28天的时间范围，请选择更长的时间范围":"The monthly view needs at least 28 days. Please choose a longer range.","月视图最多支持90天，请选择更短的时间范围":"The monthly view supports up to 90 days. Please choose a shorter range.","每个色块代表一个时间段，鼠标悬停可查看详情":"Each color block represents a time slot. Hover for details.","统计视图":"Stats View","表格视图":"Table View","饼状图和折线图":"Pie & Line Charts","日历热图":"Calendar Heatmap","开始日期":"Start Date","结束日期":"End Date","显示层级":"Level","全部":"All","时间":"Time","今天":"Today","明天":"Tomorrow","昨天":"Yesterday","图例：":"Legend:","创建项目":"Create Project","开始计时":"Start Timer","配置计时":"Configure Timer","当前项目（本次记录）":"Current Project (This Record)","输入或选择本次计时项目":"Type or select a project","高级创建项目":"Advanced Project Creation","项目层级":"Project Level","一级项目":"Level 1 Project","二级项目":"Level 2 Project","三级项目":"Level 3 Project","请选择父级项目":"Select a parent project","项目颜色":"Project Color","待办事项":"Todos","📝 待办事项":"📝 Todos","✅ 打卡项目":"✅ Check-in Items","➕ 添加项目":"➕ Add Item","进行中":"In Progress","已完成":"Completed","未完成":"Incomplete","已过期":"Overdue","今天到期":"Due Today","列表视图":"List View","四象限视图":"Quadrant View","按截止日期排序":"Sort by Due Date","按优先级排序":"Sort by Priority","按创建时间排序":"Sort by Created Time","按标题排序":"Sort by Title","搜索待办事项...":"Search todos...","今日打卡统计：":"Today's check-ins:","连续打卡最长：":"Longest streak:","暂无待办事项":"No todos yet",'点击"添加项目"按钮开始创建':'Click "Add Item" to start creating',"创建第一个待办事项":"Create Your First Todo","待办事项统计":"Todo Stats","打卡统计":"Check-in Stats","总计":"Total","打卡项目数":"Check-in Items","今日应打卡":"Scheduled Today","今日已打卡":"Checked In Today","最长连续天数":"Longest Streak","无描述":"No description","无截止日期":"No due date","每天重复":"Repeats Daily","不重复":"No Repeat","每周指定天":"Specific Weekdays","编辑待办事项":"Edit Todo","创建待办事项":"Create Todo","标题 *":"Title *","描述":"Description","截止日期":"Due Date","重复规则":"Repeat Rule","输入待办事项标题":"Enter a todo title","输入待办事项描述（可选）":"Enter a todo description (optional)","低":"Low","中":"Medium","高":"High","低优先级":"Low Priority","中优先级":"Medium Priority","高优先级":"High Priority","保存更改":"Save Changes","编辑打卡项目":"Edit Check-in Item","创建打卡项目":"Create Check-in Item","输入打卡项目标题":"Enter a check-in title","输入打卡项目描述（可选）":"Enter a check-in description (optional)","结束日期（可选）":"End Date (Optional)","蓝色":"Blue","绿色":"Green","橙色":"Orange","紫色":"Purple","删除打卡项目":"Delete Check-in Item","年视图":"Year View","月视图":"Month View","周视图":"Week View","➕ 添加新计划":"➕ Add Plan","正在加载计划视图...":"Loading plan view...","请输入计划名称":"Please enter a plan name","请选择日期":"Please choose a date","请选择开始和结束时间":"Please choose start and end times","结束时间必须晚于开始时间":"End time must be later than start time","编辑计划":"Edit Plan","添加新计划":"Add New Plan","创建新计划":"Create New Plan","计划名称":"Plan Name","重复设置":"Repeat Settings","删除计划":"Delete Plan","创建计划":"Create Plan","标记为已完成":"Mark as Completed","标记为未完成":"Mark as Incomplete","重要且紧急":"Important & Urgent","重要不紧急":"Important, Not Urgent","紧急不重要":"Urgent, Not Important","不重要不紧急":"Neither Important nor Urgent","日记视图":"Diary View","点击写日记":"Click to write a diary","未命名日记":"Untitled Diary","删除日记内容":"Delete Diary Content","输入日记标题":"Enter a diary title","写下今天...":"Write about today...","日记分类管理":"Diary Category Management","请输入分类名称":"Please enter a category name","分类名称已存在":"That category name already exists","未分类":"Uncategorized","默认":"Default","森林磨砂":"Forest Frost","海蓝磨砂":"Ocean Frost","落日暖橙":"Sunset Orange","中性磨砂灰":"Neutral Frost Gray","曜石黑":"Obsidian Black","象牙白":"Ivory Light","主背景":"Primary Background","次背景":"Secondary Background","三级背景":"Tertiary Background","浅层背景":"Surface Background","强调色":"Accent Color","文字颜色":"Text Color","次级文字":"Muted Text","通用描边":"Border Color","主按钮":"Primary Button","按钮悬停":"Button Hover","按钮文字":"Button Text","按钮描边":"Button Border","强调底文字":"Accent Text","删除按钮":"Delete Button","删除悬停":"Delete Hover","面板底色":"Panel Background","强化面板":"Strong Panel","面板描边":"Panel Border","遮罩颜色":"Overlay Color","时间记录 · 项目表格":"Time Record · Project Table","时间统计 · 时间表格":"Time Stats · Time Grid","时间统计 · 日历热图":"Time Stats · Calendar Heatmap","时间计划 · 年视图":"Planning · Year View","时间计划 · 月视图":"Planning · Month View","时间计划 · 周视图":"Planning · Week View","待办事项 · 列表视图":"Todos · List View","待办事项 · 四象限视图":"Todos · Quadrant View","表格与热图尺寸已重置为 100%":"Table and heatmap sizes reset to 100%","请输入项目名称":"Please enter a project name","项目名称已存在，请使用其他名称":"That project name already exists. Please choose another one.","选择的父级项目不存在":"The selected parent project does not exist","二级项目的父级必须是一级项目":"A level 2 project must use a level 1 parent","三级项目的父级必须是二级项目":"A level 3 project must use a level 2 parent","项目创建成功！":"Project created successfully!","请先创建一级项目":"Please create a level 1 project first","请先创建二级项目":"Please create a level 2 project first","暂无一级项目，请先创建一级项目":"No level 1 projects yet. Please create one first.","暂无二级项目":"No level 2 projects","暂无三级项目":"No level 3 projects","表格视图将根据项目层级自动组织":"The table view is organized by project level","请输入待办事项标题":"Please enter a todo title","请选择每周重复的日期":"Please choose weekdays for repetition","结束日期不能早于开始日期":"End date cannot be earlier than start date","请输入进度内容":"Please enter progress details","保存失败，请刷新后重试":"Save failed. Please refresh and try again.","暂无打卡项目":"No check-in items yet",'点击"添加项目"按钮创建打卡项目':'Click "Add Item" to create a check-in item','确定要删除这个打卡项目吗？此操作不可撤销！':'Delete this check-in item? This action cannot be undone!','删除失败：未找到该打卡项目，请刷新后重试。':'Delete failed: the check-in item was not found. Please refresh and try again.','确定要删除这个待办事项吗？此操作不可撤销！':'Delete this todo item? This action cannot be undone!','删除失败：未找到该待办事项，请刷新后重试。':'Delete failed: the todo item was not found. Please refresh and try again.',"确定删除这条进度记录吗？":"Delete this progress entry?","删除进度记录":"Delete Progress Entry","记录你的进度或想法...":"Record your progress or ideas...","请输入打卡项目标题":"Please enter a check-in title","请选择开始日期":"Please choose a start date","今日不在打卡周期":"Not scheduled today","今日未打卡":"Not checked in today","点击写日记":"Click to write a diary","请至少输入标题或正文":"Please enter at least a title or content","确定删除该日记吗？":"Delete this diary entry?","确定删除该分类吗？相关日记将转为未分类。":"Delete this category? Related diary entries will become uncategorized.","数据已导出！":"Data exported successfully!","导出数据失败，请重试。":"Failed to export data. Please try again.","数据导入成功！请刷新页面查看变化。":"Data imported successfully! Please refresh to see the changes.","导入数据失败，请确保文件格式正确。":"Failed to import data. Please make sure the file format is correct.","所有数据已清除！页面将自动刷新。":"All data has been cleared. The page will refresh automatically.","清除数据失败，请重试。":"Failed to clear data. Please try again.","确定要清除所有数据吗？此操作不可撤销！":"Clear all data? This action cannot be undone!","预览失败，确定要清除所有数据吗？此操作不可撤销！":"Preview failed. Clear all data anyway? This action cannot be undone!","在浏览器环境中无法更改存储路径，此功能仅在Electron应用中可用。":"This feature is only available in the Electron app.","选择文件夹失败，请重试。":"Failed to choose a folder. Please try again.","在浏览器环境中无法重置存储路径，此功能仅在Electron应用中可用。":"This feature is only available in the Electron app.","确定要重置存储路径为默认值吗？":"Reset the storage path to the default value?","未知":"Unknown","自定义路径":"Custom Path","默认路径":"Default Path","浏览器localStorage":"Browser localStorage","没有可清除的数据":"No data to clear","天":"Day","周":"Week","月":"Month","年":"Year"},P=[[/^显示:\s*(.+?)\s*至\s*(.+?)\s*·\s*(.+?)范围$/,(_,a,b,c)=>`Showing: ${a} to ${b} · ${x(c)} range`],[/^显示:\s*(.+?)\s*·\s*(.+?)范围$/,(_,a,b)=>`Showing: ${a} · ${x(b)} range`],[/^(.+?)\s+暂无日记$/,(_,a)=>`No diary entries for ${a}`],[/^分类：(.+)$/,(_,a)=>`Category: ${a}`],[/^路径:\s+(.+)$/,(_,a)=>`Path: ${a}`],[/^记录数量:\s+(.+)$/,(_,a)=>`Record count: ${a}`],[/^项目数量:\s+(.+)$/,(_,a)=>`Project count: ${a}`],[/^第(\d+)周$/,(_,a)=>`Week ${a}`],[/^(\d+(?:\.\d+)?)小时$/,(_,a)=>`${a} h`],[/^(\d+)分钟$/,(_,a)=>`${a} min`],[/^(\d+)天$/,(_,a)=>`${a} days`],[/^(\d+) 项$/,(_,a)=>`${a} items`],[/^(\d{4})年(\d{1,2})月$/,(_,a,b)=>`${a}-${b}`],[/^(\d{1,2})月(\d{1,2})日$/,(_,a,b)=>`${a}/${b}`],[/^(\d{1,2})月(\d{1,2})日\s+(周[日一二三四五六])$/,(_,a,b,c)=>`${a}/${b} ${w(c)}`],[/^(\d{1,2})月(\d{1,2})日\s*-\s*(\d{1,2})月(\d{1,2})日$/,(_,a,b,c,d)=>`${a}/${b} - ${c}/${d}`],[/^🔥\s*(\d+)天$/,(_,a)=>`🔥 ${a} days`],[/^📝 为"(.+)"添加进度$/,(_,a)=>`📝 Add progress for "${a}"`],[/^📝 编辑"(.+)"的进度$/,(_,a)=>`📝 Edit progress for "${a}"`],[/^已将 "(.+)" 移动到 (\d+)\/(\d+)\s+(\d+):00$/,(_,a,b,c,d)=>`Moved "${a}" to ${b}/${c} ${d}:00`],[/^每周\s+(.+)$/,(_,a)=>`Weekly ${w(a)}`],[/^🔁\s*每周\s+(.+?)\s*·\s*(.+?)\s*至\s*(.+)$/,(_,a,b,c)=>`🔁 Weekly ${w(a)} · ${b} to ${c}`],[/^🔁\s*每周\s+(.+?)\s*·\s*(.+?)\s*起$/,(_,a,b)=>`🔁 Weekly ${w(a)} · from ${b}`],[/^🔁\s*每天重复\s*·\s*(.+?)\s*至\s*(.+)$/,(_,a,b)=>`🔁 Repeats daily · ${a} to ${b}`],[/^🔁\s*每天重复\s*·\s*(.+?)\s*起$/,(_,a)=>`🔁 Repeats daily · from ${a}`],[/^一次性\s*·\s*截止\s*(.+)$/,(_,a)=>`One-time · Due ${a}`],[/^(.+?)（汇总）$/,(_,a)=>`${a} (Summary)`]];let L=r(v()),O,B=!1,U=!1;function r(s){return A[String(s||"").trim()]||D}function v(){try{const s=localStorage.getItem(K);if(!s)localStorage.setItem(K,D);return s||D}catch{return D}}function e(){return L==="en-US"}function w(s){return String(s||"").split("、").map(t=>W[t.trim()]||t.trim()).join(", ")}function c(s){if(!e()||!/[\u4e00-\u9fff]/.test(s))return s;let t=M[s]??s;P.forEach(([p,f])=>t=t.replace(p,f));return t}function x(s){return typeof s==="string"?c(s):s}function t(s){if(typeof s!=="string"||!e())return s;return s.split("\n").map(n=>{const a=n.match(/^\s*/)?.[0]||"",b=n.match(/\s*$/)?.[0]||"",m=n.trim();return m?`${a}${c(m)}${b}`:n}).join("\n")}function y(){if(window.__controlerI18nDialogs)return;window.__controlerI18nDialogs=!0;const a=window.alert.bind(window),b=window.confirm.bind(window),m=typeof window.prompt==="function"?window.prompt.bind(window):null;window.alert=s=>a(t(String(s)));window.confirm=s=>b(t(String(s)));if(m)window.prompt=(s,d)=>m(t(String(s)),d)}function z(o={}){if(!e())return o;const n={...o};["title","message","confirmText","cancelText"].forEach(k=>{if(typeof n[k]==="string")n[k]=t(n[k])});return n}function C(){if(U||!window.ControlerUI)return;U=!0;if(typeof window.ControlerUI.confirmDialog==="function"){const a=window.ControlerUI.confirmDialog.bind(window.ControlerUI);window.ControlerUI.confirmDialog=o=>a(z(o))}if(typeof window.ControlerUI.alertDialog==="function"){const a=window.ControlerUI.alertDialog.bind(window.ControlerUI);window.ControlerUI.alertDialog=o=>a(z(o))}}function G(el){return el instanceof HTMLInputElement&&["button","submit","reset"].includes(String(el.type||"").toLowerCase())}function H(el,a){el.__controlerI18nAttrs??={};if(!(a in el.__controlerI18nAttrs))el.__controlerI18nAttrs[a]=el.getAttribute(a);return el.__controlerI18nAttrs[a]}function I(el){if(!(el instanceof Element))return;["placeholder","title","aria-label"].forEach(a=>{if(!el.hasAttribute(a))return;const o=H(el,a);if(o==null)return;const n=e()?t(o):o;if(el.getAttribute(a)!==n)el.setAttribute(a,n)});if(G(el)&&el.hasAttribute("value")){const o=H(el,"value");if(o==null)return;const n=e()?t(o):o;if(el.value!==n)el.value=n;if(el.getAttribute("value")!==n)el.setAttribute("value",n)}}function J(n){const p=n?.parentElement;if(!(p instanceof Element))return!0;return p.tagName==="SCRIPT"||p.tagName==="STYLE"||p.closest("[data-i18n-skip='true']")}function N(n){if(!(n instanceof Text)||J(n))return;if(n.__controlerI18nText===void 0)n.__controlerI18nText=n.nodeValue;const o=n.__controlerI18nText,m=e()?t(o):o;if(n.nodeValue!==m)n.nodeValue=m}function S(root=document.documentElement){if(!root||B)return;B=!0;try{if(root instanceof Element)I(root);const q=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);for(let n=q.currentNode;n;n=q.nextNode())n.nodeType===Node.TEXT_NODE?N(n):I(n);document.documentElement.lang=e()?"en":"zh-CN";R();C()}finally{B=!1}}function F(ms){if(B)return;ms.forEach(m=>{if(m.type==="characterData"){N(m.target);return}if(m.type==="attributes"){if(m.target instanceof Element)I(m.target);return}m.addedNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)N(n);else if(n.nodeType===Node.ELEMENT_NODE)S(n)})})}function T(){if(O||!document.documentElement)return;O=new MutationObserver(F);O.observe(document.documentElement,{childList:!0,subtree:!0,characterData:!0,attributes:!0,attributeFilter:["placeholder","title","aria-label","value"]})}function R(){document.querySelectorAll("#language-select,[data-language-select='true']").forEach(el=>{if(el instanceof HTMLSelectElement&&el.value!==L)el.value=L})}function Q(){document.querySelectorAll("#language-select,[data-language-select='true']").forEach(el=>{if(!(el instanceof HTMLSelectElement)||el.dataset.i18nBound)return;el.dataset.i18nBound="true";el.value=L;el.addEventListener("change",()=>j(el.value))})}function j(lang,{persist=!0,dispatch=!0}={}){L=r(lang);if(persist)try{localStorage.setItem(K,L)}catch{}S();if(dispatch)window.dispatchEvent(new CustomEvent(E,{detail:{language:L}}))}y();window.addEventListener("storage",e2=>{if(e2.key===K)j(e2.newValue||D,{persist:!1,dispatch:!1})});document.addEventListener("DOMContentLoaded",()=>{Q();T();S()});window.ControlerI18n={getLanguage:()=>L,setLanguage:j,t,translateText:t,apply:S,eventName:E}})();





;/* pages/i18n-extra.js */
(() => {
  const LANGUAGE_EVENT = "controler:language-changed";
  const USER_LANGUAGE_CHOICE_KEY = "controler:user-language-choice";
  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const WEEKDAY_NAMES = {
    "周日": "Sun",
    "周一": "Mon",
    "周二": "Tue",
    "周三": "Wed",
    "周四": "Thu",
    "周五": "Fri",
    "周六": "Sat",
  };
  const EXTRA_MAP = {
    "桌面小组件": "Desktop Widget",
    "快速上手": "Quick Start",
    "删除引导": "Dismiss Guide",
    "搜索": "Search",
    "搜索结果": "Search Results",
    "清空": "Clear",
    "搜索标题或正文关键词": "Search title or content keywords",
    "先创建项目，再开始或结束计时。":
      "Create a project first, then start or stop the timer.",
    "一次计时结束后会自动形成记录。":
      "When a timer ends, a record is created automatically.",
    "统计页会直接读取这些记录。":
      "The stats page reads these records directly.",
    "日历计划放时间安排。":
      "Calendar plans are for scheduling your time.",
    "待办适合跟踪要做的事。":
      "Todos are for tracking things you need to do.",
    "打卡适合每天或每周重复的习惯。":
      "Check-ins are for daily or weekly recurring habits.",
    "点日期或已有条目都可以开始写。":
      "Tap a date or an existing entry to start writing.",
    "标题和正文至少写一项。":
      "Enter at least a title or the main content.",
    "分类可选，不分也能保存。":
      "Categories are optional. You can save without one.",
    "先选要放到桌面的组件类型。":
      "Choose the widget type you want on the home screen first.",
    "添加后可在桌面调整位置和大小。":
      "After adding it, you can adjust its position and size on the home screen.",
    "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加":
      "If adding from here does not work on Android, use the system widget picker to add it.",
    "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "If adding from here does not work on Android, use the system widget picker to add it.",
    "数据导入与备份": "Data Import and Backup",
    "同步 JSON 文件怎么选": "How to Choose the Sync JSON File",
    "双端同步（需要时再看）": "Dual-Device Sync (Only If You Need It)",
    "导入数据是整包覆盖当前数据，不是合并。":
      "Import replaces your current data as a full package, not a merge.",
    "操作前先到 设置 -> 数据管理 -> 导出数据，留一份备份。":
      "Before doing this, go to Settings -> Data Management -> Export Data and keep a backup.",
    "选择已有有效 JSON：直接采用该文件中的数据。":
      "Choose an existing valid JSON: use the data already in that file directly.",
    "选择空白或新建 JSON：把当前数据写入该文件。":
      "Choose a blank or newly created JSON: write your current data into that file.",
    "选择目录：对目录中的 controler-data.json 应用同一规则。":
      "Choose a folder: apply the same rules to controler-data.json inside that folder.",
    "重置默认文件：切回应用默认 JSON，并按该文件内容重载。":
      "Reset to the default file: switch back to the app's default JSON and reload from that file.",
    "如果你不需要双端同步，可以忽略这一篇。":
      "If you do not need dual-device sync, you can ignore this entry.",
    "Syncthing 最简流程：两端安装并互相添加设备 -> 共享同一文件夹 -> 把 controler-data.json 放进该文件夹 -> 手机端在设置里选择同一份 JSON。":
      "Syncthing quick setup: install it on both devices and add each other -> share the same folder -> put controler-data.json in that folder -> choose the same JSON on the phone in Settings.",
    "一定先导出一份备份；若用 Syncthing，建议再开文件版本保留。":
      "Export a backup first. If you use Syncthing, also enable file versioning.",
    "可选云盘方案，通常是联网后自动回传，不如 Syncthing 稳定实时：Dropbox / Box / pCloud。":
      "Optional cloud drive choices usually upload changes after the network reconnects, so they are less stable and real-time than Syncthing: Dropbox / Box / pCloud.",
    "数据管理": "Data Management",
    "导出数据": "Export Data",
    "导入数据": "Import Data",
    "同步 JSON 文件": "Sync JSON File",
    "选择 JSON 文件": "Choose JSON File",
    "选择存储目录": "Choose Storage Folder",
    "重置为默认文件": "Reset to Default File",
    "显示文件位置": "Show File Location",
    "当前同步文件:": "Current sync file:",
    "文件类型:": "File type:",
    "选择已有 JSON / 目录时，如果其中已经有有效数据，会直接载入该数据；如果目标为空，则会把当前数据写入该目标。":
      "When you choose an existing JSON file or folder, valid data there is loaded directly; if the target is empty, your current data is written there.",
    "导入会整包覆盖当前数据，不是合并；操作前请先导出备份。":
      "Import replaces your current data as a full package, not a merge. Export a backup first.",
    "长按后拖动窗口": "Press and drag to move the window",
    "移动": "Move",
    "最小化": "Minimize",
    "打开计时": "Open Timer",
    "打开日记": "Open Diary",
    "查看记录": "View Records",
    "查看周表格": "View Weekly Grid",
    "查看饼图": "View Pie Chart",
    "查看热图": "View Heatmap",
    "查看折线图": "View Line Chart",
    "打开待办": "Open Todos",
    "打开打卡": "Open Check-ins",
    "打开周视图": "Open Week View",
    "打开月视图": "Open Month View",
    "打开年视图": "Open Year View",
    "打开应用": "Open App",
    "重新渲染": "Retry Render",
    "完整渲染未就绪，先显示可操作的兜底内容。":
      "The full render is not ready yet, so a usable fallback is shown first.",
    "这是兜底模式；你仍然可以在这里打开对应页面或重试完整渲染。":
      "Fallback mode is active. You can still open the related page or retry the full render here.",
    "完整小组件内容尚未就绪，先提供可操作的兜底内容。":
      "The full widget content is not ready yet, so a usable fallback is shown first.",
    "小组件内容会在后续刷新时自动同步":
      "Widget content will sync automatically on the next refresh.",
    "点击下方按钮打开对应视图":
      "Use the button below to open the related view.",
    "当前还没有可显示的数据。": "No data is available yet.",
    "实时同步": "Live Sync",
    "打开原页": "Open Original View",
    "刷新内容": "Refresh",
    "移除组件": "Remove Widget",
    "状态": "Status",
    "空闲": "Idle",
    "当前项目": "Current Project",
    "项目": "Project",
    "快速计时": "Quick Timer",
    "未开始计时，可直接在这里开始或结束一条记录。":
      "No timer is running. You can start or stop a record here.",
    "当前没有进行中的计时。": "No timer is currently running.",
    "结束并保存": "Stop and Save",
    "停止但不保存": "Stop Without Saving",
    "结束后会直接生成一条记录，无需打开主界面。":
      "Stopping will save a record immediately, without opening the main app.",
    "开始后计时会持续显示在这个小组件中。":
      "Once started, the timer will keep updating in this widget.",
    "今日日记": "Today's Diary",
    "已存在": "Exists",
    "未记录": "Not Started",
    "分类": "Category",
    "今天想记什么": "What do you want to capture today?",
    "标题": "Title",
    "正文": "Content",
    "更新今天的日记": "Update Today's Diary",
    "保存今天的日记": "Save Today's Diary",
    "保存日记失败。": "Failed to save the diary entry.",
    "请至少填写标题或正文。": "Enter at least a title or content.",
    "保存后会直接写入今天的日记，无需打开主界面。":
      "Saving writes directly into today's diary without opening the main app.",
    "内容会直接显示在小组件中，可拖动窗口边缘调整尺寸。":
      "Content is shown directly in the widget, and you can resize it by dragging the window edge.",
    "写下今天的记录...": "Write down today's notes...",
    "今日记录": "Today's Records",
    "今日总时长": "Today's Total",
    "最近更新": "Last Updated",
    "暂无": "None",
    "今日待办": "Today's Todos",
    "进度记录": "Progress Entries",
    "今日项目": "Today's Check-ins",
    "已打卡": "Checked In",
    "最高连击": "Best Streak",
    "未来 7 天": "Next 7 Days",
    "安排总数": "Total Plans",
    "最忙一天": "Busiest Day",
    "计划日": "Days with Plans",
    "活跃天数": "Active Days",
    "本月时长": "This Month",
    "全年时长": "This Year",
    "活跃月份": "Active Months",
    "年度目标": "Yearly Goals",
    "峰值投入": "Peak Time",
    "峰值日期": "Peak Date",
    "记录天数": "Recorded Days",
    "本周累计": "This Week",
    "项目数": "Projects",
    "峰值小时": "Peak Hour",
    "峰值时长": "Peak Duration",
    "今日投入": "Today's Time",
    "还没有时间记录。": "No time records yet.",
    "开始一次计时或手动记录后，这里会立即同步最近记录。":
      "Start a timer or add a record manually to sync recent entries here right away.",
    "今天没有待办卡片。": "No todo cards for today.",
    "新增待办或切换到主界面查看完整列表后，这里会自动同步。":
      "Add a todo or open the main view to see the full list, and this widget will sync automatically.",
    "今天没有需要打卡的项目。": "No check-ins scheduled for today.",
    "设置每日或每周打卡后，会以卡片形式出现在这里。":
      "Set up daily or weekly check-ins and they will appear here as cards.",
    "本周没有计划安排。": "No plans scheduled this week.",
    "创建计划后，这里会保留接下来几天最关键的安排。":
      "Once you add plans, the most important upcoming items will stay here.",
    "显示最近 20 周的活跃度，颜色越深表示当天投入越多。":
      "Shows activity across the last 20 weeks. Darker color means more time spent that day.",
    "导航按钮显示": "Navigation Buttons",
    "导航按钮显示设置": "Navigation button visibility settings",
    "显示时间记录入口。": "Show the time tracking entry.",
    "显示统计视图入口。": "Show the statistics entry.",
    "显示计划与待办入口。": "Show the planner and todos entry.",
    "显示日记页面入口。": "Show the diary entry.",
    "显示设置页面入口。": "Show the settings entry.",
    "固定": "Pinned",
    "显示中": "Visible",
    "已隐藏": "Hidden",
    "固定显示": "Always Visible",
    "隐藏": "Hide",
    "显示": "Show",
    "至少保留一个导航按钮，不能全部隐藏。":
      "Keep at least one navigation button visible.",
    "无法保存": "Could Not Save",
    "正在检测当前平台的小组件能力...":
      "Checking widget support on this device...",
    "开机自启应用": "Launch the app at startup",
    "启动时恢复已创建小组件": "Restore created widgets on launch",
    "小组件始终停留在桌面上方": "Keep widgets above the desktop",
    "创建桌面小组件": "Create Desktop Widget",
    "添加到桌面": "Pin to Home Screen",
    "手动添加": "Add Manually",
    "等待系统确认": "Awaiting System Confirmation",
    "已添加成功": "Added Successfully",
    "返回桌面查看": "Back to Home Screen",
    "长按桌面空白处": "Long-press an empty area on the home screen",
    "打开“小组件”或“插件”": 'Open "Widgets" or "Plugins"',
    "找到 Order 并选择需要的组件": "Find Order and choose the widget you need",
    "手动添加步骤": "Manual Add Steps",
    "系统可能会要求确认。": "The system may ask you to confirm placement.",
    "如果没有自动出现，请返回此页查看结果或改用手动添加。":
      "If nothing appears automatically, come back here to check the result or switch to manual add.",
    "已收到系统添加回执。": "The system has confirmed the widget was added.",
    "可以返回桌面查看该组件。":
      "You can go back to the home screen to view this widget.",
    "这个组件可通过系统小组件面板手动添加。":
      "This widget can be added manually from the system widget panel.",
    "当前系统未返回添加成功回执，请改用系统小组件面板手动添加。":
      "The system did not return a successful add callback. Please add it manually from the widget panel.",
    "已发起添加请求，请先完成系统确认。":
      "An add request is already in progress. Please finish the system confirmation first.",
    "已发起添加请求，请在桌面确认。":
      "The add request has been sent. Please confirm it on the home screen.",
    "当前系统支持应用内请求添加小组件。":
      "This device supports requesting widget placement from inside the app.",
    "当前桌面不支持应用内固定小组件，请从桌面小组件列表手动添加。":
      "This launcher does not support pinning widgets from inside the app. Please add it manually from the widget list.",
    "当前系统版本不支持应用内直接固定小组件，请从桌面手动添加。":
      "This Android version does not support pinning widgets from inside the app. Please add it manually from the home screen.",
    "桌面端支持创建独立小组件窗口；组件内容会直接显示在桌面中，无需强制跳转页面，也可设置开机自启并在启动时自动恢复。":
      "Desktop supports standalone widget windows. Widget content stays on the desktop, can launch at startup, and can be restored automatically.",
    "Android 端会沿用桌面端同一份数据与动作入口；点击后会先向系统发起添加请求，确认成功后才会出现在桌面。若系统未完成确认，请改用系统小组件面板手动添加。":
      "Android uses the same data and actions as desktop. Tapping the button sends a system add request first, and the widget appears on the home screen only after confirmation. If the system does not complete the confirmation, add it manually from the widget panel.",
    "Android 端会沿用桌面端同一份数据与动作入口；添加到桌面后，组件会直接读取当前同步 JSON 并刷新摘要，点击动作也会优先在组件内完成。":
      "Android uses the same data and actions as desktop. After adding a widget, it reads the synced JSON directly and refreshes its summary, with actions handled in-widget first.",
    "Android 端会沿用桌面端同一份数据与动作入口；添加到桌面后，组件会直接读取当前同步 JSON 并刷新摘要。若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "Android uses the same data and actions as desktop. After you add it to the home screen, the widget reads the current synced JSON and refreshes its summary. If adding from here does not work on Android, use the system widget picker to add it.",
    "当前 Android 系统不支持应用内直接固定组件，请长按桌面空白处 → 小组件 → Order，手动添加需要的小组件。":
      "This Android device does not support pinning widgets from inside the app. Long-press the home screen, open Widgets, then add the Order widget manually.",
    "当前 Android 系统不支持应用内直接固定组件。若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "This Android device cannot pin widgets from inside the app. If adding from here does not work on Android, use the system widget picker to add it.",
    "当前仅 Electron 桌面端与 Android 原生端支持桌面小组件；在浏览器环境中会自动隐藏相关动作。":
      "Desktop widgets are currently supported only in Electron desktop and Android native builds. Related actions stay hidden in the browser.",
    "当前环境暂不支持桌面小组件。请在 Electron 桌面端或 Android 原生端使用。":
      "Desktop widgets are not supported in the current environment. Use the Electron desktop app or the Android native app.",
    "当前环境不可用": "Unavailable Here",
    "创建成功": "Created",
    "创建失败": "Creation Failed",
    "已发起添加请求": "Add Request Sent",
    "请手动添加": "Add Manually",
    "添加失败": "Add Failed",
    "选择成功": "Selection Saved",
    "迁移成功": "Migration Complete",
    "重置成功": "Reset Complete",
    "重置失败": "Reset Failed",
    "选择失败": "Selection Failed",
    "重置同步文件": "Reset Sync Target",
    "重置": "Reset",
    "选择同步 JSON 文件失败，请重试。":
      "Failed to choose the synced JSON file. Please try again.",
    "选择同步目录失败，请重试。":
      "Failed to choose the sync directory. Please try again.",
    "重置同步 JSON 文件失败，请重试。":
      "Failed to reset the synced JSON file. Please try again.",
    "当前移动端版本暂不支持选择同步 JSON 文件。":
      "This mobile build does not support choosing a synced JSON file yet.",
    "当前移动端版本暂不支持选择同步目录。":
      "This mobile build does not support choosing a sync directory yet.",
    "当前移动端版本暂不支持重置同步 JSON 文件。":
      "This mobile build does not support resetting the synced JSON file yet.",
    "在浏览器环境中无法更改存储目录，此功能仅在桌面端或移动端应用中可用。":
      "The sync directory cannot be changed in the browser. This feature is available only in the desktop app or native mobile app.",
    "确定要重置为应用默认 JSON 文件吗？":
      "Reset to the app's default JSON file?",
    "当前环境不可用": "Unavailable Here",
    "年视图": "Year View",
    "月视图": "Month View",
    "周视图": "Week View",
    "添加目标": "Add Goal",
    "点击卡片添加本月目标": "Click a card to add this month's goals",
    "➕ 添加新计划": "➕ Add New Plan",
    "正在加载计划视图...": "Loading planning view...",
    "添加新计划": "Add New Plan",
    "创建新计划": "Create New Plan",
    "编辑计划": "Edit Plan",
    "创建计划": "Create Plan",
    "删除计划": "Delete Plan",
    "计划名称": "Plan Name",
    "日期": "Date",
    "开始时间": "Start Time",
    "结束时间": "End Time",
    "通知": "Notifications",
    "不通知": "No Notification",
    "开始前提醒": "Before Start",
    "自定义时间": "Custom Time",
    "提前多少分钟提醒": "Minutes Before Start",
    "自定义提醒时间": "Custom Reminder Time",
    "若计划开启重复，将按相同的相对提醒时间应用到自动重复的计划上。":
      "Recurring plans reuse the same relative reminder time.",
    "不重复": "No Repeat",
    "每天重复": "Repeats Daily",
    "每周重复": "Repeats Weekly",
    "每月重复": "Repeats Monthly",
    "每周重复设置:": "Weekly repeat settings:",
    "颜色": "Color",
    "点击选择颜色": "Click to choose a color",
    "标记为已完成": "Mark as completed",
    "标记为未完成": "Mark as incomplete",
    "日期:": "Date:",
    "时间:": "Time:",
    "重复:": "Repeat:",
    "状态:": "Status:",
    "创建时间:": "Created:",
    "关闭": "Close",
    "今日不在打卡周期": "Not scheduled today",
    "今日已打卡": "Checked in today",
    "今日未打卡": "Not checked in today",
    "无描述": "No description",
    "暂无进度，点右侧“＋”补一条":
      "No progress yet. Tap “＋” on the right to add one.",
    "暂无打卡项目": "No check-in items yet",
    '点击"添加项目"按钮创建打卡项目':
      'Click "Add Item" to create a check-in item',
    "打卡项目": "Check-in Item",
    "普通待办事项": "Regular Todo",
    "有截止日期、优先级、标签的待办事项":
      "A todo with due date, priority, and tags",
    "主题名称": "Theme Name",
    "选择您喜欢的主题配色，设置将自动保存并同步到底部导航样式。":
      "Choose your preferred theme palette. Changes save automatically and sync to the bottom navigation.",
    "文字颜色": "Text Color",
    "遮罩颜色": "Overlay Color",
    "底栏底色": "Bottom Nav Bar",
    "底栏按钮": "Bottom Nav Button",
    "底栏当前按钮": "Bottom Nav Active",
    "编辑自定义主题": "Edit Custom Theme",
    "自定义主题": "Custom Theme",
    "添加自定义主题": "Add Custom Theme",
    "恢复默认": "Reset",
    "支持输入 #RRGGBB 与 rgba(...)，保存后会立即应用到按钮、底部导航、面板、弹窗、下拉菜单、小组件与浮层边框等主题适配区域。":
      "Supports #RRGGBB and rgba(...). Saving applies the theme to buttons, bottom navigation, panels, dialogs, menus, widgets, and overlay borders immediately.",
    "支持输入": "Supports",
    "删除自定义主题": "Delete Custom Theme",
    "恢复默认主题": "Reset Built-in Theme",
    "石墨灰": "Graphite Mist",
    "极光青雾": "Aurora Mist",
    "酒红夜幕": "Velvet Bordeaux",
    "香槟砂岩": "Champagne Sandstone",
    "深海靛影": "Midnight Indigo",
    "自定义路径": "Custom Path",
    "浏览器内置存储": "Browser Built-in Storage",
    "在浏览器环境中无法重置存储路径，此功能仅在Electron应用中可用。":
      "The storage path cannot be reset in the browser. This feature is only available in Electron.",
    "确定要重置存储路径为默认值吗？":
      "Reset the storage path to the default value?",
    "存储路径已重置为默认值。\n\n注意：实际数据不会自动迁移，新数据将保存到默认位置。":
      "The storage path has been reset to default.\n\nNote: existing data is not migrated automatically. New data will be stored in the default location.",
    "颜色选择": "Color Picker",
    "待办事项统计": "Todo Stats",
    "打卡统计": "Check-in Stats",
    "编辑主题": "Edit Theme",
    "点击卡片应用": "Click a card to apply",
    "尺寸": "Size",
    "已保存缩放:": "Saved scale:",
    "时间记录 · 项目表格": "Time Record · Project Table",
    "一级/二级/三级项目表格整体尺寸":
      "Overall size of the Level 1/2/3 project table",
    "时间统计 · 时间表格": "Time Stats · Time Grid",
    "统计页周/多日时间网格大小":
      "Weekly / multi-day time grid size on the stats page",
    "时间统计 · 日历热图": "Time Stats · Calendar Heatmap",
    "热图单元格与间距显示尺度": "Heatmap cell and spacing scale",
    "时间计划 · 年视图": "Planning · Year View",
    "年视图月份卡片与目标列表大小":
      "Month cards and goal list size in year view",
    "时间计划 · 月视图": "Planning · Month View",
    "月视图日期格与计划标签大小":
      "Date cells and plan tag size in month view",
    "时间计划 · 周视图": "Planning · Week View",
    "周视图时间轴、列宽与事项块大小":
      "Timeline, column width, and block size in week view",
    "待办事项 · 列表视图": "Todos · List View",
    "待办列表卡片、记录与打卡列表尺寸":
      "Todo cards, progress records, and check-in list size",
    "待办事项 · 四象限视图": "Todos · Quadrant View",
    "四象限面板与事项卡片尺寸": "Quadrant panels and task card size",
    "重要且紧急": "Important & Urgent",
    "重要不紧急": "Important, Not Urgent",
    "紧急不重要": "Urgent, Not Important",
    "不紧急不重要": "Neither Urgent nor Important",
    "优先立即处理": "Handle first",
    "重点规划推进": "Plan and push forward",
    "尽量委托或限时处理": "Delegate or time-box when possible",
    "批量安排低优先级": "Batch low-priority tasks",
    "暂无事项": "No items",
    "添加项目": "Add Item",
    "添加进度记录": "Add Progress Record",
    "完成": "Complete",
    "取消完成": "Undo Complete",
    "合并": "Merge",
    "合并项目": "Merge Project",
    "无法合并项目": "Cannot Merge Project",
    "合并完成": "Merge Complete",
    "请确认操作": "Please Confirm",
    "知道了": "Got It",
    "提示": "Notice",
    "确定": "OK",
    "当前项目下仍有子项目，只有叶子项目才能通过重命名合并。":
      "This project still has child items. Only leaf projects can be merged by renaming.",
    "合并后当前项目会消失，目标项目的层级、父级和颜色保持不变。":
      "The current project will disappear after merging. The target project's level, parent, and color stay unchanged.",
    "原项目已删除。": "The original project has been removed.",
    "请输入目标名称": "Please enter a goal name",
    "请选择有效的开始日期和结束日期":
      "Please select a valid start and end date",
    "确定删除这个月目标吗？":
      "Are you sure you want to delete this month's goal?",
    "删除月目标": "Delete Monthly Goal",
    "删除重复计划": "Delete Recurring Plan",
    "仅删当天": "Only This Day",
    "删除全部": "Delete All",
    "删除待办事项": "Delete Todo",
    "确定要删除这个待办事项吗？此操作不可撤销！":
      "Delete this todo? This action cannot be undone.",
    "确定要删除这个打卡项目吗？此操作不可撤销！":
      "Delete this check-in item? This action cannot be undone.",
    "全部项目（汇总）": "All Projects (Summary)",
    "全部打卡项目": "All Check-in Items",
    "提醒时间": "Reminder Time",
    "若待办启用了重复或使用“开始日期 - 结束日期”模式，将按相同的相对提醒时间同步到后续重复日期。":
      'Repeating todos reuse the same relative reminder time across future dates.',
    "每天提醒时间": "Reminder Time of Day",
    "若打卡项目设置了每日或每周重复，将在对应重复日期的这个时间提醒。":
      "Check-ins remind at this time on each repeated day.",
    "计划提醒": "Plan Reminder",
    "待办提醒": "Todo Reminder",
    "打卡提醒": "Check-in Reminder",
    "日期范围": "Date Range",
    "时间分配": "Time Allocation",
    "项目分布": "Project Distribution",
    "平均每日时间": "Average Daily Time",
    "周数": "Week Count",
    "星期": "Weekday",
    "所选项目": "Selected Project",
    "项目筛选": "Project Filter",
    "占比": "Share",
    "总用时": "Total Time",
    "日均时长": "Average per Day",
    "实际日时长": "Average per Active Day",
    "折线图": "Line Chart",
    "饼状图": "Pie Chart",
    "进度条": "Progress Bar",
    "饼状图统计": "Pie Chart",
    "折线图统计": "Line Chart",
    "当前筛选周期汇总": "Current Filtered Period Summary",
    "Chart.js库未加载，请检查网络连接":
      "Chart.js is not loaded. Please check your connection.",
    "Chart.js 库未加载，请检查本地资源":
      "Chart.js is not loaded. Please check local assets.",
    "当前时间范围内暂无可绘制的数据":
      "No chart data is available in the selected time range.",
    "数据会在你下一次记录、计划或打卡后自动同步到这里。":
      "Data will sync here automatically after your next record, plan, or check-in.",
    "内容会在这里以主题卡片形式同步更新。":
      "Content will sync here as themed cards.",
    "当前没有需要处理的项目。":
      "Nothing needs action right now.",
    "这里会保留与你今天最相关的卡片与操作。":
      "The most relevant cards and actions for today stay here.",
    "操作": "Action",
    "无计划": "No Plans",
    "计划": "Plan",
    "无记录": "No Records",
    "未打卡": "Not checked in",
    "未命名项目": "Untitled Project",
    "未命名待办": "Untitled Todo",
    "未命名打卡": "Untitled Check-in",
    "未命名打卡项目": "Untitled Check-in Item",
    "上一月": "Previous Month",
    "下一月": "Next Month",
    "显示月份": "Months Shown",
    "数据类型": "Data Type",
    "项目时长": "Project Hours",
    "浅色 ≤": "Light ≤",
    "中色 ≤": "Medium ≤",
    "命中天数": "Active Days",
    "已打卡天数": "Checked-in Days",
    "当天有打卡记录": "Has check-ins that day",
    "统计工具未加载，无法渲染层级饼状图":
      "Stats tools are unavailable, so the hierarchy pie chart cannot be rendered.",
    "D3 未加载，无法渲染层级饼状图":
      "D3 is not loaded, so the hierarchy pie chart cannot be rendered.",
    "当前筛选条件下暂无可展示的项目时长":
      "No project hours are available for the current filter.",
    "未找到待办事项。": "Todo not found.",
    "未找到打卡项目。": "Check-in item not found.",
    "今日可开连击": "Streak starts today",
    "保留核心信息与完成操作，点击按钮即可直接同步状态。":
      "Keep the core context and finish the task directly from the widget.",
    "可直接在这里完成": "Complete it here",
    "已完成，可直接撤回": "Completed, tap to undo",
    "可直接在这里完成打卡": "Check in here",
    "从今天开始保持连击": "Start your streak today",
    "撤回": "Undo",
    "打卡": "Check In",
    "待安排": "To Be Scheduled",
    "已逾期": "Overdue",
    "今日优先": "Priority Today",
    "即将截止": "Due Soon",
    "待处理": "Pending",
    "今日待做": "Due Today",
    "未设置日期": "No Date",
    "今天截止": "Due Today",
    "明天截止": "Due Tomorrow",
    "已完成": "Completed",
    "待打卡": "Pending",
    "今日已完成": "Completed Today",
    "今日待完成": "Due Today",
    "每天": "Daily",
    "未设置": "Not Set",
    "高优先级": "High Priority",
    "中优先级": "Medium Priority",
    "低优先级": "Low Priority",
    "刚开始": "Just Started",
    "选择时间范围并使用上方折叠按钮查看统计":
      "Select a date range and use the controls above to view stats",
    "收起": "Close",
    "（无正文）": "(No content)",
    "分类：未设置": "Category: Not Set",
    "新分类名称": "New Category Name",
    "未找到要删除的内容": "Nothing to delete was found.",
    "未找到要删除的日记": "Diary entry not found.",
    "未找到要删除的分类": "Category not found.",
    "保存日记失败，已恢复修改前内容。":
      "Failed to save the diary entry. The previous content has been restored.",
    "保存失败": "Save Failed",
    "删除失败": "Delete Failed",
    "删除后保存失败，已恢复删除前内容。":
      "Failed to save after deletion. The content before deletion has been restored.",
    "删除分类失败，已恢复删除前内容。":
      "Failed to delete the category. The previous content has been restored.",
    "保存分类失败，已恢复修改前内容。":
      "Failed to save the category. The previous content has been restored.",
    "正在加载数据中": "Loading your data",
    "正在读取当前月份的日记与分类，请稍候":
      "Loading the current month's diary entries and categories. Please wait.",
    "正在更新当前月份的日记数据，请稍候":
      "Refreshing the current month's diary data. Please wait.",
    "正在加载所选月份的日记数据，请稍候":
      "Loading diary data for the selected month. Please wait.",
    "正在同步最新日记数据，请稍候":
      "Syncing the latest diary data. Please wait.",
    "已切换到同步目录：": "Switched to the sync directory:",
    "检测到目录里已有有效的 bundle 数据，应用将直接载入该目录中的内容。页面将刷新一次以重新载入内容。":
      "Valid bundle data was found in the selected directory. The app will load that content directly and refresh once.",
    "检测到旧单文件 JSON，已自动迁移为目录 bundle，并保留旧文件备份。页面将刷新一次以重新载入内容。":
      "A legacy single-file JSON was found and migrated to a directory bundle automatically. A backup of the old file was kept, and the page will refresh once.",
    "目标目录中没有可用的 bundle 数据，当前应用数据已写入该目录。页面将刷新一次以重新载入内容。":
      "No usable bundle data was found in the target directory. The current app data was written there and the page will refresh once.",
    "当前清除目标：": "Current clear target:",
    "当前数据目录：": "Current data directory:",
    "应用私有目录": "App Private Directory",
    "已授权外部目录": "Authorized External Directory",
    "位于应用私有目录，系统文件管理器通常不可直接访问。":
      "This location is inside the app's private directory and is usually not directly accessible from the system file manager.",
    "这是系统授权的外部目录入口，路径可能显示为内容 URI。":
      "This is a system-authorized external directory entry, so the path may appear as a content URI.",
    "当前 bundle 结构说明": "Current Bundle Structure",
    "最近备份/迁移记录": "Recent Backup / Migration Records",
    "当前还没有旧单文件迁移或旧单文件导入备份记录。":
      "There are no backup records from legacy single-file imports or migrations yet.",
    "固定文件：": "Fixed Files:",
    "按月分片：records / diaryEntries / dailyCheckins / checkins / plans（一次性计划）。":
      "Monthly partitions: records / diaryEntries / dailyCheckins / checkins / plans (one-time plans).",
    "当前还没有按月分片": "There are no monthly partitions yet.",
    "旧单文件导入备份": "Legacy Single-File Import Backup",
    "旧单文件自动迁移备份": "Legacy Single-File Auto-Migration Backup",
    "未知来源": "Unknown Source",
    "自动备份状态": "Auto Backup Status",
    "当前环境暂不支持自动本地 ZIP 备份。":
      "Automatic local ZIP backup is not supported in the current environment.",
    "暂无自动备份 ZIP": "No automatic backup ZIP yet",
    "最近执行正常": "The latest run completed successfully",
    "已启用": "Enabled",
    "未启用": "Disabled",
    "当前还没有创建任何桌面小组件，点击下方按钮即可生成。":
      "No desktop widgets have been created yet. Use the button below to create one.",
    "当前环境暂未声明可用的小组件能力。":
      "The current environment has not reported any available widget capability yet.",
    "当前环境不支持桌面小组件。":
      "Desktop widgets are not supported in the current environment.",
    "当前环境不支持返回桌面。":
      "Returning to the home screen is not supported in the current environment.",
    "当前环境不支持桌面小组件设置。":
      "Desktop widget settings are not supported in the current environment.",
    "当前环境不支持更新桌面小组件设置。":
      "The current environment does not support updating desktop widget settings.",
    "当前环境不支持 Android 小组件固定。":
      "The current environment does not support Android widget pinning.",
    "当前环境暂不支持桌面小组件。":
      "Desktop widgets are not available in the current environment yet.",
    "请通过系统小组件面板手动添加。":
      "Please add it manually from the system widget panel.",
    "检测到当前运行在 Electron 中，但预加载桥接未成功注入。桌面小组件与窗口按钮暂时不可用，请使用修复后的版本重新启动应用。":
      "Electron was detected, but the preload bridge was not injected correctly. Desktop widgets and window controls are temporarily unavailable. Restart with a fixed build.",
    "Electron 桥接已加载，但桌面小组件接口未完整暴露。请重新安装或使用修复后的版本。":
      "The Electron bridge loaded, but the desktop widget APIs were not exposed completely. Reinstall the app or use a fixed build.",
    "小组件脚本加载失败，请重启应用后重试。":
      "Failed to load the widget script. Restart the app and try again.",
    "当前系统不支持应用内直接固定组件。":
      "The current system does not support pinning widgets directly from inside the app.",
    "安卓端请通过系统小组件面板手动添加。":
      "On Android, please add the widget manually from the system widget panel.",
    "当前原生端支持由应用发起添加桌面小组件。":
      "This native build supports requesting desktop widget placement from inside the app.",
    "当前清除会同步写回已绑定的外部文件或目录。":
      "Clearing data here will also write the change back to the linked external file or directory.",
    "当前为移动端应用私有数据目录，清除后会立即同步到本机数据文件。":
      "The current target is the mobile app's private data directory. Clearing it will sync to the local data file immediately.",
    "当前环境缺少外部 JSON 导入能力。":
      "The current environment does not support external JSON import.",
    "当前环境缺少外部 JSON 映射能力。":
      "The current environment does not support external JSON mapping.",
    "分区": "Partition",
    "记录数组来源": "Record Array Source",
    "日期字段": "Date Field",
    "开始时间字段": "Start Time Field",
    "结束时间字段": "End Time Field",
    "请选择字段": "Please choose a field",
    "请选择要导出的分区和月份。":
      "Please choose the partition and month to export.",
    "读取 bundle manifest 失败，回退本地推导:":
      "Failed to read the bundle manifest. Falling back to local inference:",
    "读取桌面小组件状态失败:": "Failed to read desktop widget state:",
    "更新桌面小组件设置失败:": "Failed to update desktop widget settings:",
    "当前还没有按月分片": "There are no monthly partitions yet.",
    "开始导入": "Start Import",
    "获取失败": "Fetch Failed",
    "清除完成": "Clear Complete",
    "清除失败": "Clear Failed",
    "查看添加方式": "How to Add",
    "该组件": "This Widget",
    "手动添加步骤": "Manual Add Steps",
    "导入现在有“整包替换”和“差异导入”两种模式；高风险操作前先导出备份。":
      "Import now has two modes: full replacement and differential import. Export a backup before high-risk operations.",
    "导入和导出到底怎么选": "How to Choose Between Import and Export",
    "为什么现在是一个目录里的多份 JSON": "Why Storage Is Now Multiple JSON Files in One Directory",
    "换设备 / 合并数据 / 只补一个月数据时该怎么做":
      "How to Change Devices, Merge Data, or Restore Just One Month",
    "长按项目拖至目标项目可移动位置或改变分级。":
      "Long-press a project and drag it onto another project to reorder it or change its level.",
    "一级二级项目双击折叠收起；项目列表单击（饼状图和折线图处也是）。":
      "Double-click level 1 or level 2 projects to collapse them. Single-click also works in the project list, pie chart, and line chart.",
    "所有视图均可放大":
      "All views can be zoomed in.",
    "右滑可见计划页面。":
      "Swipe right to open the planning page.",
    "第一次计时时可以不输入下一个项目，一次计时结束后会自动形成记录。":
      "On your first timer run, you can leave the next project empty. A record is created automatically when the timer ends.",
    "创建项目不可同名,改变名称时同名是合并，所有记录合并至目标名称，并删除被改项目":
      "Projects cannot share the same name. Renaming a project to an existing name merges all records into the target project and removes the renamed project.",
    "改变创建项目名称，以前所有记录的名称都会跟着改变":
      "When you rename a project, all existing records using that project name are updated as well.",
    "单击记录编辑，仅最后一次记录的删除可以回滚时间（可重复）。":
      "Tap a record to edit it. Only deleting the latest record can roll time back, and that can be repeated.",
    "其余的只能于统计页面的表格视图中双击编辑名称或删除，不可改变时间。":
      "All other records can only be renamed or deleted from the stats table view by double-clicking, and their time cannot be changed.",
    "换电脑或换手机，想完整恢复：用“导入数据”选择整包文件，再选“整包替换当前数据”。这样当前设备会完全变成导入源那份数据。（是将其中的数据导入到该软件的存储处，而不是使用导入的那份文件！）":
      "When switching to a new computer or phone and restoring everything, use Import Data, choose the full package, then choose Replace Current Data. This turns the current device into the imported dataset. The data is imported into the app's storage; the imported file itself is not used as the live storage file.",
    "如果当前机器里已经有数据，不确定会不会覆盖掉：先导出一份整包 ZIP 备份，再决定导入模式。":
      "If the current device already has data and you are not sure whether it will be overwritten, export a full ZIP backup first, then decide which import mode to use.",
    "记住一句话：整包替换会清掉未导入内容；差异导入不会。":
      "Remember this: full replacement removes content that is not imported; differential import does not.",
    "如果你在单分区导出里只看到“记录”，通常不是功能没做完，而是当前只有记录这个 section 产生了月分片；核心数据和重复计划一直都在整包 ZIP 里。":
      "If a partition export only shows Records, it usually does not mean the feature is incomplete. It means only the records section currently has monthly partitions; core data and recurring plans are always included in the full ZIP.",
    "场景 1：我换设备了，只想完整搬家。做法：先在旧设备导出整包 ZIP，再到新设备导入，并选择“整包替换当前数据”。":
      "Scenario 1: you are switching devices and want a full move. Export a full ZIP on the old device, import it on the new device, then choose Replace Current Data.",
    "场景 2：我现在这台机器里已经有数据，只想把另一份数据补进来。做法：用整包“差异导入（只替换有差异的单位）”。它不会删除未导入内容。":
      "Scenario 2: this device already has data, and you only want to merge in another dataset. Use Differential Import for the full package. It does not delete content that is not imported.",
    "场景 3：我只想补 2026-03 的记录。做法：导出或拿到那个 section 对应月份的单分区 JSON，再导入时选择“替换该月份分区”或“合并该月份分区”。":
      "Scenario 3: you only want to restore records for 2026-03. Export or obtain the single-partition JSON for that month and section, then choose Replace This Month's Partition or Merge This Month's Partition when importing.",
    "场景 4：我误拿到一份不完整的数据，担心把现有内容冲掉。做法：不要用整包替换，先导出一份备份，再用差异导入。":
      "Scenario 4: you received an incomplete dataset and are worried about overwriting current content. Do not use full replacement. Export a backup first, then use differential import.",
    "差异导入的逻辑是：核心区按字段替换；重复计划和月分片只处理导入源里出现的内容，并按 ID 或自然键逐条覆盖(每条记录都有一个专属id)；未命中的旧条目会保留。它不是按整天或整月整块替换。":
      "Differential import replaces core fields by field, and only processes recurring plans and monthly partitions that appear in the imported source. Entries are overwritten one by one by ID or natural key, while unmatched existing items are kept. It does not replace whole days or whole months in bulk.",
    "当前小组件类型暂未定义。": "The current widget type is not defined yet.",
    "打开应用创建新的待办事项。":
      "Open the app to create a new todo item.",
    "打开应用创建新的打卡项目。":
      "Open the app to create a new check-in item.",
    "打开原页补充数据后会自动同步到这里。":
      "Open the original view to add more data, and it will sync here automatically.",
    "打开原页查看完整周计划。":
      "Open the original view to see the full weekly plan.",
    "当前没有待处理的待办。": "There are no pending todos right now.",
    "待处理待办": "Pending Todos",
    "今日打卡": "Today's Check-ins",
    "今日项目占比": "Today's Project Share",
    "本月目标": "This Month's Goals",
    "今年年度目标": "This Year's Goals",
    "近 7 天时间分布": "Time Distribution Over the Last 7 Days",
    "打开": "Open",
    "查看计划": "View Plans",
    "随机色": "Random Color",
    "父级项目（仅二级和三级项目需要）":
      "Parent Project (required only for level 2 and 3 projects)",
    "父级项目（仅二级/三级项目）":
      "Parent Project (level 2/3 only)",
    "确定创建": "Create",
    "可手动挑色，也可直接点推荐色板":
      "You can choose a color manually or tap a suggested palette below.",
    "颜色仅用于统计图表；一级项目改色时，只会联动仍处于自动色模式的子级。":
      "Colors are only used in charts. When a level 1 project color changes, only child projects still using automatic colors will update with it.",
    "标准": "Standard",
    "明亮": "Bright",
    "柔和": "Soft",
    "冰川青": "Glacier Cyan",
    "茶金棕": "Tea Gold Brown",
    "琥珀砂": "Amber Sand",
    "莓果酒红": "Berry Wine",
    "靛夜蓝": "Indigo Night",
    "待办与打卡": "Todos and Check-ins",
    "待办与打卡会在你打开侧栏或首屏空闲后载入":
      "Todos and check-ins load after you open the sidebar or when the first screen becomes idle.",
    "点击卡片添加年度总目标": "Click a card to add the yearly goal",
    "年度总目标": "Yearly Goal",
    "例如：完成季度复盘": "For example: finish the quarterly review",
    "周时间表格": "Weekly Time Grid",
    "显示本周的时间分配情况": "Shows the time allocation for this week",
    "项目名称": "Project Name",
    "双击记录可编辑": "Double-click a record to edit it",
    "当前时间范围内暂无记录": "No records are available in the selected time range",
    "显示名称:": "Display Name:",
    "原始路径:": "Raw Path:",
    "存储路径信息已在浏览器控制台中显示。":
      "Storage path information has been printed to the browser console.",
    "要查看实际存储数据，请在浏览器中打开开发者工具(F12)，然后查看":
      "To inspect the actual stored data, open the browser developer tools (F12) and check",
  };
  const EXTRA_PATTERNS = [
    [/^摘要\s+(\d+)$/, (_, index) => `Summary ${index}`],
    [/^(\d{4}-\d{2}-\d{2})\s+日记$/, (_, dateText) => `Diary for ${dateText}`],
    [/^渲染失败：(.+)$/, (_, detail) => `Render failed: ${detail}`],
    [/^(.+)超时$/, (_, label) => `${translateLine(label).trim()} timed out`],
    [/^进行中：(.+)$/, (_, value) => `In progress: ${value}`],
    [/^今日累计：(.+)$/, (_, value) => `Today's total: ${translateLine(value).trim()}`],
    [/^今日日记：(.+)$/, (_, value) => `Today's diary: ${value}`],
    [/^今日记录：(\d+)\s*条$/, (_, count) => `Today's records: ${count}`],
    [/^今日总时长：(.+)$/, (_, value) => `Today's total: ${translateLine(value).trim()}`],
    [/^待办总数：(\d+)\s*项$/, (_, count) => `Total todos: ${count}`],
    [/^进行中：(\d+)\s*项$/, (_, count) => `In progress: ${count} items`],
    [/^打卡项目：(\d+)\s*项$/, (_, count) => `Check-ins: ${count}`],
    [/^今日已打卡：(\d+)\s*项$/, (_, count) => `Checked in today: ${count}`],
    [/^计划总数：(\d+)\s*项$/, (_, count) => `Plans: ${count}`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；关闭应用后可在下次启动时自动恢复。$/, (_, count) => `Saved ${count} desktop widget configurations. They can be restored the next time the app starts.`],
    [/^(.+)\s+小组件已创建，可直接拖动边缘调整尺寸。$/, (_, name) => `${name} widget created. Drag the edges to resize it.`],
    [/^创建\s+(.+)\s+小组件失败，请重试。$/, (_, name) => `Failed to create the ${name} widget. Please try again.`],
    [/^(.+)\s+的添加请求已发出，请在桌面确认放置。添加后长按即可调整组件大小。$/, (_, name) => `The request to add ${name} has been sent. Confirm placement on the home screen, then long-press it to resize.`],
    [/^当前系统不支持应用内直接固定\s+(.+?)。$/, (_, name) => `This device cannot pin ${name} from inside the app.`],
    [/^当前系统不支持应用内直接固定\s+(.+)，请长按桌面空白处\s*→\s*小组件\s*→\s*Order，手动添加该组件。$/, (_, name) => `This device cannot pin ${name} from inside the app. Long-press the home screen, open Widgets, then add the Order widget manually.`],
    [/^添加\s+(.+)\s+小组件失败，请重试。$/, (_, name) => `Failed to add the ${name} widget. Please try again.`],
    [/^今天的记录已存在，最近更新于\s+(.+?)。$/, (_, time) => `Today's entry already exists. Last updated at ${time}.`],
    [/^确定将项目“(.+)”的记录合并到现有项目“(.+)”吗？$/, (_, source, target) => `Merge records from "${source}" into the existing project "${target}"?`],
    [/^已将项目“(.+)”的\s*(\d+)\s*条记录合并到“(.+)”。$/, (_, source, count, target) => `Merged ${count} records from "${source}" into "${target}".`],
    [/^连击\s+(\d+)\s*天$/, (_, days) => `Streak: ${days} days`],
    [/^连续\s+(\d+)\s*天$/, (_, days) => `${days}-day streak`],
    [/^打卡时间\s+(.+)$/, (_, value) => `Checked in at ${value}`],
    [/^最近进度：(.+)$/, (_, value) => `Latest progress: ${value}`],
    [/^最近记录\s+(.+)$/, (_, value) => `Latest entry ${translateLine(value).trim()}`],
    [/^日期\s+(.+)$/, (_, value) => `Date ${translateLine(value).trim()}`],
    [/^日期：(.+)$/, (_, value) => `Date: ${translateLine(value).trim()}`],
    [/^截止\s+(.+)$/, (_, value) => `Due ${translateLine(value).trim()}`],
    [/^原定\s+(.+)$/, (_, value) => `Originally due ${translateLine(value).trim()}`],
    [/^开始：(.+)$/, (_, value) => `Start: ${translateLine(value).trim()}`],
    [/^结束：(.+)$/, (_, value) => `End: ${translateLine(value).trim()}`],
    [/^显示名称:\s*(.+)$/, (_, value) => `Display Name: ${value}`],
    [/^原始路径:\s*(.+)$/, (_, value) => `Raw Path: ${value}`],
    [/^存储模式：(.+)$/, (_, value) => `Storage Mode: ${value}`],
    [/^manifest：(.+)$/, (_, value) => `Manifest: ${value}`],
    [/^根目录：(.+)$/, (_, value) => `Root Directory: ${value}`],
    [/^说明：(.+)$/, (_, value) => `Note: ${translateLine(value).trim()}`],
    [/^原始 manifest 路径：(.+)$/, (_, value) => `Raw Manifest Path: ${value}`],
    [/^原始根目录：(.+)$/, (_, value) => `Raw Root Directory: ${value}`],
    [/^来源：(.+)$/, (_, value) => `Source: ${translateLine(value).trim()}`],
    [/^时间：(.+)$/, (_, value) => `Time: ${translateLine(value).trim()}`],
    [/^当前有\s+(\d+)\s+个按月分片$/, (_, count) => `${count} monthly partitions currently exist`],
    [/^当前状态：(.+)$/, (_, value) => `Current Status: ${translateLine(value).trim()}`],
    [/^备份周期：每\s+(.+)$/, (_, value) => `Backup Interval: every ${translateLine(value).trim()}`],
    [/^保留份数：(.+)$/, (_, value) => `Backups Kept: ${translateLine(value).trim()}`],
    [/^备份目录：(.+)$/, (_, value) => `Backup Directory: ${value}`],
    [/^目录类型：(.+)$/, (_, value) => `Directory Type: ${translateLine(value).trim()}`],
    [/^现有备份：(.+)\s+份$/, (_, value) => `Existing Backups: ${value}`],
    [/^最近备份：(.+)$/, (_, value) => `Latest Backup: ${translateLine(value).trim()}`],
    [/^最近尝试：(.+)$/, (_, value) => `Latest Attempt: ${translateLine(value).trim()}`],
    [/^最近结果：(.+)$/, (_, value) => `Latest Result: ${translateLine(value).trim()}`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；当前未开启自动启动或自动恢复。$/, (_, count) => `${count} desktop widget configurations are saved. Auto-start and auto-restore are currently disabled.`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；手动启动应用时会恢复这些小组件。如需系统登录时恢复，请同时开启“开机自启应用”。$/, (_, count) => `${count} desktop widget configurations are saved. They will be restored when you open the app manually. To restore them after system login, also enable "Launch the app at startup".`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；系统登录后会自动启动应用，但不会恢复小组件。如需自动恢复，请同时开启“启动时恢复已创建小组件”。$/, (_, count) => `${count} desktop widget configurations are saved. The app will launch after system login, but widgets will not be restored automatically. Also enable "Restore created widgets on launch" if you want that behavior.`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；系统登录后会自动启动应用并恢复这些小组件。$/, (_, count) => `${count} desktop widget configurations are saved. The app will launch after system login and restore these widgets automatically.`],
    [/^进度\s+(\d+)$/, (_, count) => `Progress ${count}`],
    [/^(\d+)\s*条$/, (_, count) => `${count} records`],
    [/^(\d+)\s*个目标$/, (_, count) => `${count} goals`],
    [/^(\d+)\s*个月$/, (_, count) => `${count} months`],
    [/^(\d+)-(\d+)点$/, (_, start, end) => `${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`],
    [/^(.+?)\s+(\d+)\s*项$/, (_, label, count) => `${translateLine(label).trim()} ${count}`],
    [/^(.+?)\s+(\d+)\s*天$/, (_, label, count) => `${translateLine(label).trim()} ${count} days`],
    [/^(.+?)\s+(\d+)\s*小时$/, (_, label, count) => `${translateLine(label).trim()} ${count} h`],
    [/^(.+?)\s+(\d+)\s*分钟$/, (_, label, count) => `${translateLine(label).trim()} ${count} min`],
    [/^(\d+)\s*秒$/, (_, count) => `${count}s`],
    [/^(\d+)月$/, (_, month) => MONTH_NAMES[Number(month) - 1] || month],
    [/^(\d+)年$/, (_, year) => `${year}`],
    [
      /^(\d+)年(\d+)月 列表$/,
      (_, year, month) => `${MONTH_NAMES[Number(month) - 1] || month} ${year} List`,
    ],
    [
      /^(\d+)年(\d+)月$/,
      (_, year, month) => `${MONTH_NAMES[Number(month) - 1] || month} ${year}`,
    ],
    [/^共\s+(\d+)\s+篇$/, (_, count) => `${count} entries`],
    [/^共\s+(\d+)\s+篇匹配$/, (_, count) => `${count} matches`],
    [
      /^(\d+)年(\d+)月 暂无日记$/,
      (_, year, month) => `No diary entries for ${MONTH_NAMES[Number(month) - 1] || month} ${year}`,
    ],
    [/^没有找到包含“(.+)”的日记$/, (_, keyword) => `No diary entries contain "${keyword}"`],
    [/^(\d+)月(\d+)日$/, (_, month, day) => `${month}/${day}`],
    [
      /^(\d+)月(\d+)日\s+(周日|周一|周二|周三|周四|周五|周六)$/,
      (_, month, day, weekday) => `${month}/${day} ${WEEKDAY_NAMES[weekday] || weekday}`,
    ],
    [/^总时长[:：]\s*(.+)$/, (_, value) => `Total: ${translateLine(value).trim()}`],
    [/^已打卡[:：]\s*(.+)$/, (_, value) => `Checked in: ${value}`],
    [/^命中天数:\s*(\d+)$/, (_, count) => `Active days: ${count}`],
    [/^已打卡天数:\s*(\d+)$/, (_, count) => `Checked-in days: ${count}`],
    [/^时长：(.+)$/, (_, value) => `Duration: ${translateLine(value).trim()}`],
    [/^占整体：(.+)$/, (_, value) => `Share of total: ${value}`],
    [/^占上级：(.+)$/, (_, value) => `Share of parent: ${value}`],
    [/^≤\s*(\d+(?:\.\d+)?)\s*小时$/, (_, value) => `≤ ${value} h`],
    [/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*小时$/, (_, min, max) => `${min} - ${max} h`],
    [/^>\s*(\d+(?:\.\d+)?)\s*小时$/, (_, value) => `> ${value} h`],
    [
      /^(\d+)月(\d+)日\s*-\s*(\d+)月(\d+)日$/,
      (_, monthStart, dayStart, monthEnd, dayEnd) =>
        `${monthStart}/${dayStart} - ${monthEnd}/${dayEnd}`,
    ],
    [/^第(\d+)周$/, (_, index) => `Week ${index}`],
    [
      /^显示\s+(.+?)\s+至\s+(.+)$/,
      (_, start, end) =>
        `Showing ${translateLine(start).trim()} to ${translateLine(end).trim()}`,
    ],
    [
      /^显示\s+(.+?)\s+至\s+(.+?)\s+的时间分配情况（(\d+)天）$/,
      (_, start, end, days) =>
        `Showing time allocation from ${translateLine(start).trim()} to ${translateLine(end).trim()} (${days} days)`,
    ],
    [
      /^(\d+)月(\d+)日\s+(.+)$/,
      (_, month, day, weekday) =>
        `${month}/${day} ${WEEKDAY_NAMES[weekday] || translateLine(weekday).trim()}`,
    ],
  ];

  function getLanguage() {
    return (
      window.ControlerI18n?.getLanguage?.() ||
      localStorage.getItem("appLanguage") ||
      "zh-CN"
    );
  }

  function isEnglish() {
    return getLanguage() === "en-US";
  }

  function normalizeLanguage(value) {
    const normalized = String(value || "").trim();
    if (normalized === "en" || normalized === "en-US") {
      return "en-US";
    }
    return "zh-CN";
  }

  function readStoredLanguage() {
    try {
      return String(localStorage.getItem("appLanguage") || "").trim();
    } catch (error) {
      return "";
    }
  }

  function rememberUserLanguageChoice(language) {
    try {
      localStorage.setItem(
        USER_LANGUAGE_CHOICE_KEY,
        normalizeLanguage(language),
      );
    } catch (error) {
      // Ignore storage failures and keep the in-memory language choice.
    }
  }

  function readRememberedUserLanguageChoice() {
    try {
      const storedChoice = String(
        localStorage.getItem(USER_LANGUAGE_CHOICE_KEY) || "",
      ).trim();
      return storedChoice ? normalizeLanguage(storedChoice) : "";
    } catch (error) {
      return "";
    }
  }

  let electronLanguageBridgeWrapped = false;
  let electronLanguageSyncStarted = false;

  function wrapElectronLanguageBridge() {
    if (electronLanguageBridgeWrapped || !window.ControlerI18n) {
      return;
    }
    const originalSetLanguage = window.ControlerI18n.setLanguage;
    if (typeof originalSetLanguage !== "function") {
      return;
    }

    window.ControlerI18n.setLanguage = (language, options = {}) => {
      const nextOptions =
        options && typeof options === "object" ? { ...options } : {};
      const result = originalSetLanguage(language, nextOptions);
      if (
        nextOptions.persist !== false &&
        nextOptions.rememberChoice !== false
      ) {
        rememberUserLanguageChoice(language);
      }
      if (
        nextOptions.syncNative !== false &&
        typeof window.electronAPI?.uiSetLanguage === "function"
      ) {
        Promise.resolve(
          window.electronAPI.uiSetLanguage(normalizeLanguage(language)),
        ).catch((error) => {
          console.error("同步 Electron 界面语言失败:", error);
        });
      }
      return result;
    };

    electronLanguageBridgeWrapped = true;
  }

  async function syncElectronLanguagePreference() {
    if (
      electronLanguageSyncStarted ||
      typeof window.electronAPI?.uiGetLanguage !== "function" ||
      typeof window.ControlerI18n?.setLanguage !== "function"
    ) {
      return;
    }

    electronLanguageSyncStarted = true;
    try {
      const mainLanguage = normalizeLanguage(await window.electronAPI.uiGetLanguage());
      const storedLanguage = readStoredLanguage();
      const normalizedStoredLanguage = storedLanguage
        ? normalizeLanguage(storedLanguage)
        : "";
      const rememberedUserLanguage = normalizedStoredLanguage
        ? readRememberedUserLanguageChoice()
        : "";
      const shouldPreferStoredLanguage =
        !!normalizedStoredLanguage &&
        (
          rememberedUserLanguage === normalizedStoredLanguage ||
          (normalizedStoredLanguage === "en-US" && mainLanguage === "zh-CN")
        );
      const currentLanguage = normalizeLanguage(
        window.ControlerI18n.getLanguage?.() ||
          normalizedStoredLanguage ||
          mainLanguage,
      );

      if (
        shouldPreferStoredLanguage &&
        normalizedStoredLanguage !== mainLanguage
      ) {
        await window.electronAPI.uiSetLanguage(normalizedStoredLanguage);
        if (currentLanguage !== normalizedStoredLanguage) {
          window.ControlerI18n.setLanguage(normalizedStoredLanguage, {
            persist: true,
            dispatch: true,
            syncNative: false,
            rememberChoice: false,
          });
        }
        return;
      }

      if (currentLanguage !== mainLanguage) {
        window.ControlerI18n.setLanguage(mainLanguage, {
          persist: true,
          dispatch: true,
          syncNative: false,
          rememberChoice: false,
        });
      }
    } catch (error) {
      console.error("读取 Electron 界面语言失败:", error);
    }
  }

  function translateLine(line) {
    if (typeof line !== "string" || !isEnglish() || !/[\u4e00-\u9fff]/.test(line)) {
      return line;
    }

    let translated = EXTRA_MAP[line] ?? line;
    EXTRA_PATTERNS.forEach(([pattern, formatter]) => {
      translated = translated.replace(pattern, formatter);
    });
    if (translated === line && typeof window.ControlerI18n?.translateText === "function") {
      translated = window.ControlerI18n.translateText(line);
    }
    return translated;
  }

  function translateTextBlock(text) {
    if (typeof text !== "string") return text;
    return text
      .split("\n")
      .map((segment) => {
        const leading = segment.match(/^\s*/)?.[0] || "";
        const trailing = segment.match(/\s*$/)?.[0] || "";
        const core = segment.trim();
        if (!core) return segment;
        return `${leading}${translateLine(core)}${trailing}`;
      })
      .join("\n");
  }

  function rememberAttribute(element, attributeName) {
    element.__controlerI18nExtraAttrs ??= {};
    const currentValue = element.getAttribute(attributeName);
    if (
      !(attributeName in element.__controlerI18nExtraAttrs) &&
      /[\u4e00-\u9fff]/.test(String(currentValue || ""))
    ) {
      element.__controlerI18nExtraAttrs[attributeName] =
        currentValue;
    }
    return element.__controlerI18nExtraAttrs[attributeName];
  }

  function isButtonLikeInput(element) {
    return (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(
        String(element.type || "").toLowerCase(),
      )
    );
  }

  function applyElementTranslation(element) {
    if (!(element instanceof Element)) return;

    ["placeholder", "title", "aria-label"].forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) return;
      const originalValue = rememberAttribute(element, attributeName);
      if (originalValue == null) return;
      const nextValue = isEnglish() ? translateTextBlock(originalValue) : originalValue;
      if (element.getAttribute(attributeName) !== nextValue) {
        element.setAttribute(attributeName, nextValue);
      }
    });

    if (isButtonLikeInput(element) && element.hasAttribute("value")) {
      const originalValue = rememberAttribute(element, "value");
      if (originalValue == null) return;
      const nextValue = isEnglish() ? translateTextBlock(originalValue) : originalValue;
      if (element.value !== nextValue) {
        element.value = nextValue;
      }
      if (element.getAttribute("value") !== nextValue) {
        element.setAttribute("value", nextValue);
      }
    }
  }

  function shouldSkipTextNode(node) {
    const parent = node?.parentElement;
    return (
      !(parent instanceof Element) ||
      parent.tagName === "SCRIPT" ||
      parent.tagName === "STYLE" ||
      !!parent.closest("[data-i18n-skip='true']")
    );
  }

  function applyTextTranslation(node) {
    if (!(node instanceof Text) || shouldSkipTextNode(node)) return;
    if (
      node.__controlerI18nExtraText === undefined &&
      /[\u4e00-\u9fff]/.test(String(node.nodeValue || ""))
    ) {
      node.__controlerI18nExtraText = node.nodeValue;
    }
    const originalValue = node.__controlerI18nExtraText;
    if (originalValue === undefined) return;
    const nextValue = isEnglish()
      ? translateTextBlock(originalValue)
      : originalValue;
    if (node.nodeValue !== nextValue) {
      node.nodeValue = nextValue;
    }
  }

  function refreshEnhancedSelects(root = document) {
    root
      .querySelectorAll?.("select")
      ?.forEach((select) => select.__uiEnhancedSelectApi?.refresh?.());
  }

  function bindLanguageSelectBridge(root = document) {
    root
      .querySelectorAll?.("#language-select,[data-language-select='true']")
      ?.forEach((select) => {
        if (
          !(select instanceof HTMLSelectElement) ||
          select.dataset.languageBridgeBound === "true"
        ) {
          return;
        }

        select.dataset.languageBridgeBound = "true";
        select.addEventListener(
          "change",
          (event) => {
            const setLanguage = window.ControlerI18n?.setLanguage;
            if (typeof setLanguage !== "function") {
              return;
            }
            event.stopImmediatePropagation();
            setLanguage(select.value);
          },
          { capture: true },
        );
      });
  }

  function applyTranslations(root = document.documentElement) {
    if (!root) return;

    if (root instanceof Element) {
      applyElementTranslation(root);
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );

    for (let current = walker.currentNode; current; current = walker.nextNode()) {
      if (current.nodeType === Node.TEXT_NODE) {
        applyTextTranslation(current);
      } else {
        applyElementTranslation(current);
      }
    }

    bindLanguageSelectBridge(root instanceof Element ? root : document);
    refreshEnhancedSelects(root instanceof Element ? root : document);
  }

  function handleMutations(mutations) {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          applyTextTranslation(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          applyTranslations(node);
        }
      });
    });
  }

  function init() {
    if (window.ControlerI18n) {
      window.ControlerI18n.isEnglish = isEnglish;
      window.ControlerI18n.translateUiText = translateTextBlock;
    }
    wrapElectronLanguageBridge();
    bindLanguageSelectBridge();
    applyTranslations();
    void syncElectronLanguagePreference();

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener(LANGUAGE_EVENT, () => {
      window.requestAnimationFrame(() => applyTranslations());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


;/* pages/theme-init.js */
(() => {
  const SELECTED_THEME_STORAGE_KEY = "selectedTheme";
  const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
  const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
  const THEME_APPLIED_EVENT_NAME = "controler:theme-applied";
  const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
  const RGB_COLOR_PATTERN =
    /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

  const DEFAULT_THEME_COLORS = {
    primary: "#1f2f28",
    secondary: "rgba(53, 96, 71, 0.42)",
    tertiary: "rgba(83, 132, 101, 0.5)",
    quaternary: "rgba(121, 175, 133, 0.2)",
    accent: "#8ed6a4",
    text: "#f5fff8",
    mutedText: "rgba(245, 255, 248, 0.72)",
    border: "#6ea283",
    delete: "#ff7e7e",
    deleteHover: "#ff6464",
    projectLevel1: "#79af85",
    projectLevel2: "#5a7f68",
    projectLevel3: "#3a5d48",
    panel: "rgba(24, 41, 33, 0.62)",
    panelStrong: "rgba(31, 53, 42, 0.74)",
    panelBorder: "rgba(142, 214, 164, 0.28)",
    buttonBg: "#8ed6a4",
    buttonBgHover: "#9ee2b3",
    buttonText: "#173326",
    buttonBorder: "rgba(142, 214, 164, 0.42)",
    onAccentText: "#173326",
    navBarBg: "rgba(17, 29, 23, 0.84)",
    navButtonBg: "rgba(142, 214, 164, 0.12)",
    navButtonActiveBg: "rgba(135, 196, 153, 0.86)",
    overlay: "rgba(8, 10, 12, 0.45)",
  };

  function buildThemeDefinition(id, name, colorOverrides = {}) {
    return {
      id,
      name,
      colors: {
        ...DEFAULT_THEME_COLORS,
        ...colorOverrides,
      },
    };
  }

  const BUILT_IN_THEMES = [
    buildThemeDefinition("default", "森林磨砂"),
    buildThemeDefinition("blue-ocean", "海蓝磨砂", {
      primary: "#12263f",
      secondary: "rgba(33, 63, 96, 0.46)",
      tertiary: "rgba(57, 101, 151, 0.52)",
      quaternary: "rgba(94, 163, 230, 0.22)",
      accent: "#7ec6ff",
      text: "#eef6ff",
      mutedText: "rgba(238, 246, 255, 0.72)",
      border: "#6d7ba4",
      delete: "#ff8a8a",
      deleteHover: "#ff6f6f",
      projectLevel1: "#63b3ed",
      projectLevel2: "#4299e1",
      projectLevel3: "#2c5282",
      panel: "rgba(17, 37, 61, 0.65)",
      panelStrong: "rgba(22, 45, 73, 0.76)",
      panelBorder: "rgba(126, 198, 255, 0.28)",
      buttonBg: "#7ec6ff",
      buttonBgHover: "#95d2ff",
      buttonText: "#123052",
      buttonBorder: "rgba(126, 198, 255, 0.48)",
      onAccentText: "#123052",
      navBarBg: "rgba(12, 28, 47, 0.86)",
      navButtonBg: "rgba(126, 198, 255, 0.12)",
      navButtonActiveBg: "rgba(119, 182, 235, 0.84)",
    }),
    buildThemeDefinition("sunset-orange", "落日暖橙", {
      primary: "#4b261b",
      secondary: "rgba(122, 61, 38, 0.48)",
      tertiary: "rgba(163, 88, 47, 0.52)",
      quaternary: "rgba(237, 137, 54, 0.2)",
      accent: "#ffbf78",
      text: "#fff5ea",
      mutedText: "rgba(255, 245, 234, 0.74)",
      border: "#bdb38b",
      delete: "#ff9a9a",
      deleteHover: "#ff7d7d",
      projectLevel1: "#f6ad55",
      projectLevel2: "#ed8936",
      projectLevel3: "#c05621",
      panel: "rgba(70, 37, 26, 0.68)",
      panelStrong: "rgba(88, 46, 31, 0.76)",
      panelBorder: "rgba(255, 191, 120, 0.3)",
      buttonBg: "#ffc78a",
      buttonBgHover: "#ffd3a5",
      buttonText: "#522a1c",
      buttonBorder: "rgba(255, 191, 120, 0.48)",
      onAccentText: "#522a1c",
      navBarBg: "rgba(55, 29, 21, 0.86)",
      navButtonBg: "rgba(255, 191, 120, 0.14)",
      navButtonActiveBg: "rgba(243, 181, 112, 0.88)",
    }),
    buildThemeDefinition("minimal-gray", "中性磨砂灰", {
      primary: "#1f252e",
      secondary: "rgba(63, 73, 88, 0.45)",
      tertiary: "rgba(91, 105, 126, 0.52)",
      quaternary: "rgba(160, 174, 192, 0.2)",
      accent: "#d1d9e3",
      text: "#f6f8fb",
      mutedText: "rgba(246, 248, 251, 0.72)",
      border: "#bebebe",
      delete: "#ff8383",
      deleteHover: "#ff6464",
      projectLevel1: "#d4dce7",
      projectLevel2: "#a0aec0",
      projectLevel3: "#718096",
      panel: "rgba(33, 39, 49, 0.66)",
      panelStrong: "rgba(40, 47, 58, 0.78)",
      panelBorder: "rgba(209, 217, 227, 0.3)",
      buttonBg: "#d9e1ec",
      buttonBgHover: "#e7edf6",
      buttonText: "#262f3d",
      buttonBorder: "rgba(209, 217, 227, 0.56)",
      onAccentText: "#262f3d",
      navBarBg: "rgba(28, 33, 41, 0.86)",
      navButtonBg: "rgba(209, 217, 227, 0.12)",
      navButtonActiveBg: "rgba(186, 197, 210, 0.84)",
    }),
    buildThemeDefinition("obsidian-mono", "曜石黑", {
      primary: "#0d0f12",
      secondary: "rgba(24, 27, 32, 0.6)",
      tertiary: "rgba(46, 50, 59, 0.56)",
      quaternary: "rgba(106, 113, 128, 0.2)",
      accent: "#f1f4fa",
      text: "#f4f6fb",
      mutedText: "rgba(244, 246, 251, 0.76)",
      border: "rgba(215, 221, 232, 0.32)",
      delete: "#ff7b7b",
      deleteHover: "#ff5f5f",
      projectLevel1: "#d6dde8",
      projectLevel2: "#a2adbd",
      projectLevel3: "#667084",
      panel: "rgba(16, 18, 22, 0.72)",
      panelStrong: "rgba(20, 23, 28, 0.82)",
      panelBorder: "rgba(215, 221, 232, 0.22)",
      buttonBg: "#f1f4fa",
      buttonBgHover: "#ffffff",
      buttonText: "#10141d",
      buttonBorder: "rgba(241, 244, 250, 0.68)",
      onAccentText: "#10141d",
      navBarBg: "rgba(10, 12, 16, 0.9)",
      navButtonBg: "rgba(129, 140, 155, 0.14)",
      navButtonActiveBg: "rgba(72, 79, 92, 0.92)",
    }),
    buildThemeDefinition("ivory-light", "象牙白", {
      primary: "#eceff3",
      secondary: "rgba(255, 255, 255, 0.65)",
      tertiary: "rgba(240, 244, 250, 0.78)",
      quaternary: "rgba(222, 229, 238, 0.65)",
      accent: "#3f495f",
      text: "#202633",
      mutedText: "rgba(32, 38, 51, 0.7)",
      border: "#7b8598",
      delete: "#cf4d4d",
      deleteHover: "#b13d3d",
      projectLevel1: "#8b94a5",
      projectLevel2: "#a2abbb",
      projectLevel3: "#c0c7d3",
      panel: "rgba(255, 255, 255, 0.74)",
      panelStrong: "rgba(249, 252, 255, 0.86)",
      panelBorder: "rgba(110, 122, 143, 0.24)",
      buttonBg: "#3f495f",
      buttonBgHover: "#56607a",
      buttonText: "#f4f7ff",
      buttonBorder: "rgba(63, 73, 95, 0.58)",
      onAccentText: "#f4f7ff",
      navBarBg: "rgba(244, 247, 251, 0.9)",
      navButtonBg: "rgba(63, 73, 95, 0.08)",
      navButtonActiveBg: "rgba(74, 85, 109, 0.88)",
      overlay: "rgba(27, 31, 38, 0.22)",
    }),
    buildThemeDefinition("graphite-mist", "石墨灰", {
      primary: "#2a2d32",
      secondary: "rgba(63, 66, 72, 0.52)",
      tertiary: "rgba(88, 93, 102, 0.56)",
      quaternary: "rgba(149, 156, 168, 0.2)",
      accent: "#f0f3fa",
      text: "#f8f9fc",
      mutedText: "rgba(248, 249, 252, 0.74)",
      border: "rgba(224, 227, 234, 0.34)",
      delete: "#ff8787",
      deleteHover: "#ff6b6b",
      projectLevel1: "#d8dde7",
      projectLevel2: "#aeb5c2",
      projectLevel3: "#808897",
      panel: "rgba(43, 46, 52, 0.66)",
      panelStrong: "rgba(53, 57, 64, 0.78)",
      panelBorder: "rgba(224, 227, 234, 0.26)",
      buttonBg: "#f0f3fa",
      buttonBgHover: "#ffffff",
      buttonText: "#222832",
      buttonBorder: "rgba(240, 243, 250, 0.56)",
      onAccentText: "#222832",
      navBarBg: "rgba(35, 39, 45, 0.88)",
      navButtonBg: "rgba(240, 243, 250, 0.12)",
      navButtonActiveBg: "rgba(124, 134, 149, 0.82)",
    }),
    buildThemeDefinition("aurora-mist", "极光青雾", {
      primary: "#162a2d",
      secondary: "rgba(31, 63, 68, 0.46)",
      tertiary: "rgba(67, 110, 116, 0.52)",
      quaternary: "rgba(120, 171, 176, 0.2)",
      accent: "#8fd3d1",
      text: "#effcfb",
      mutedText: "rgba(239, 252, 251, 0.74)",
      border: "#7ca8aa",
      delete: "#ff8d8d",
      deleteHover: "#ff7070",
      projectLevel1: "#7fc6c3",
      projectLevel2: "#5ea6a4",
      projectLevel3: "#356c70",
      panel: "rgba(20, 39, 42, 0.66)",
      panelStrong: "rgba(26, 49, 52, 0.78)",
      panelBorder: "rgba(143, 211, 209, 0.26)",
      buttonBg: "#96dcda",
      buttonBgHover: "#a9e6e4",
      buttonText: "#133235",
      buttonBorder: "rgba(143, 211, 209, 0.46)",
      onAccentText: "#133235",
      navBarBg: "rgba(15, 32, 35, 0.88)",
      navButtonBg: "rgba(143, 211, 209, 0.12)",
      navButtonActiveBg: "rgba(112, 174, 173, 0.88)",
    }),
    buildThemeDefinition("velvet-bordeaux", "酒红夜幕", {
      primary: "#2f141d",
      secondary: "rgba(83, 29, 44, 0.48)",
      tertiary: "rgba(121, 49, 67, 0.54)",
      quaternary: "rgba(183, 92, 111, 0.18)",
      accent: "#d8a6b8",
      text: "#fff3f6",
      mutedText: "rgba(255, 243, 246, 0.74)",
      border: "#b78898",
      delete: "#ff919b",
      deleteHover: "#ff7784",
      projectLevel1: "#c58da2",
      projectLevel2: "#a6607a",
      projectLevel3: "#6c3348",
      panel: "rgba(43, 20, 29, 0.68)",
      panelStrong: "rgba(57, 26, 37, 0.8)",
      panelBorder: "rgba(216, 166, 184, 0.26)",
      buttonBg: "#e2b0c2",
      buttonBgHover: "#ebc1cf",
      buttonText: "#421d2a",
      buttonBorder: "rgba(216, 166, 184, 0.46)",
      onAccentText: "#421d2a",
      navBarBg: "rgba(38, 16, 25, 0.9)",
      navButtonBg: "rgba(216, 166, 184, 0.12)",
      navButtonActiveBg: "rgba(142, 77, 99, 0.88)",
    }),
    buildThemeDefinition("champagne-sandstone", "香槟砂岩", {
      primary: "#f1ebe2",
      secondary: "rgba(255, 250, 243, 0.7)",
      tertiary: "rgba(234, 222, 205, 0.82)",
      quaternary: "rgba(220, 203, 181, 0.62)",
      accent: "#8b6f57",
      text: "#2f261f",
      mutedText: "rgba(47, 38, 31, 0.68)",
      border: "#b59f8c",
      delete: "#c85656",
      deleteHover: "#ad4343",
      projectLevel1: "#bca087",
      projectLevel2: "#cfb59a",
      projectLevel3: "#e0d0bf",
      panel: "rgba(255, 251, 246, 0.78)",
      panelStrong: "rgba(250, 245, 239, 0.9)",
      panelBorder: "rgba(143, 119, 95, 0.22)",
      buttonBg: "#8b6f57",
      buttonBgHover: "#a28267",
      buttonText: "#f8f3ec",
      buttonBorder: "rgba(139, 111, 87, 0.44)",
      onAccentText: "#f8f3ec",
      navBarBg: "rgba(248, 241, 232, 0.92)",
      navButtonBg: "rgba(139, 111, 87, 0.08)",
      navButtonActiveBg: "rgba(145, 118, 92, 0.88)",
      overlay: "rgba(40, 34, 28, 0.18)",
    }),
    buildThemeDefinition("midnight-indigo", "深海靛影", {
      primary: "#111a35",
      secondary: "rgba(26, 39, 76, 0.48)",
      tertiary: "rgba(51, 70, 124, 0.54)",
      quaternary: "rgba(105, 130, 208, 0.18)",
      accent: "#9cb8ff",
      text: "#eef3ff",
      mutedText: "rgba(238, 243, 255, 0.74)",
      border: "#7d91c9",
      delete: "#ff8d9a",
      deleteHover: "#ff717f",
      projectLevel1: "#86a2eb",
      projectLevel2: "#617bc5",
      projectLevel3: "#334678",
      panel: "rgba(16, 26, 52, 0.68)",
      panelStrong: "rgba(21, 33, 64, 0.8)",
      panelBorder: "rgba(156, 184, 255, 0.28)",
      buttonBg: "#9cb8ff",
      buttonBgHover: "#b0c6ff",
      buttonText: "#162447",
      buttonBorder: "rgba(156, 184, 255, 0.46)",
      onAccentText: "#162447",
      navBarBg: "rgba(12, 20, 43, 0.88)",
      navButtonBg: "rgba(156, 184, 255, 0.12)",
      navButtonActiveBg: "rgba(91, 114, 186, 0.9)",
    }),
  ];

  const builtInThemeMap = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));
  const lightThemeIds = new Set(["ivory-light"]);
  let lastThemeStorageSignature = null;

  function parseHexColor(color) {
    const match = String(color || "")
      .trim()
      .match(HEX_COLOR_PATTERN);
    if (!match) return null;
    return {
      r: parseInt(match[1].slice(0, 2), 16),
      g: parseInt(match[1].slice(2, 4), 16),
      b: parseInt(match[1].slice(4, 6), 16),
    };
  }

  function toHexColor(color, fallback = "#000000") {
    const hex = parseHexColor(color);
    if (hex) {
      return `#${String(color).trim().slice(1).toUpperCase()}`;
    }

    const rgbMatch = String(color || "")
      .trim()
      .match(RGB_COLOR_PATTERN);
    if (rgbMatch) {
      return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map((value) => Number(value).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
    }

    return fallback;
  }

  function toRgbChannels(color) {
    if (!color) return "121,175,133";

    const hex = String(color)
      .trim()
      .match(HEX_COLOR_PATTERN);
    if (hex) {
      const r = parseInt(hex[1].slice(0, 2), 16);
      const g = parseInt(hex[1].slice(2, 4), 16);
      const b = parseInt(hex[1].slice(4, 6), 16);
      return `${r},${g},${b}`;
    }

    const rgb = String(color)
      .trim()
      .match(RGB_COLOR_PATTERN);
    if (rgb) {
      return `${rgb[1]},${rgb[2]},${rgb[3]}`;
    }

    return "121,175,133";
  }

  function toRgbaColor(color, alpha = 1) {
    return `rgba(${toRgbChannels(color)}, ${alpha})`;
  }

  function mixThemeColors(baseColor, overlayColor, overlayWeight = 0.5) {
    const base = parseHexColor(toHexColor(baseColor, ""));
    const overlay = parseHexColor(toHexColor(overlayColor, ""));
    if (!base && !overlay) {
      return "#000000";
    }
    if (!base) {
      return toHexColor(overlayColor, "#000000");
    }
    if (!overlay) {
      return toHexColor(baseColor, "#000000");
    }

    const weight = Math.max(0, Math.min(1, Number(overlayWeight) || 0));
    const blendChannel = (baseValue, overlayValue) =>
      Math.round(baseValue * (1 - weight) + overlayValue * weight)
        .toString(16)
        .padStart(2, "0");

    return `#${[
      blendChannel(base.r, overlay.r),
      blendChannel(base.g, overlay.g),
      blendChannel(base.b, overlay.b),
    ].join("")}`.toUpperCase();
  }

  function isValidThemeColorValue(color) {
    const normalized = String(color || "").trim();
    return HEX_COLOR_PATTERN.test(normalized) || RGB_COLOR_PATTERN.test(normalized);
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function getReadableTextColor(color, darkText = "#173326", lightText = "#f8fafc") {
    const rgb = parseHexColor(toHexColor(color, ""));
    if (!rgb) {
      return darkText;
    }

    const luminance =
      (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance >= 0.62 ? darkText : lightText;
  }

  function getRelativeLuminance(color) {
    const rgb = parseHexColor(toHexColor(color, ""));
    if (!rgb) {
      return null;
    }

    const normalizeChannel = (channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };

    return (
      0.2126 * normalizeChannel(rgb.r) +
      0.7152 * normalizeChannel(rgb.g) +
      0.0722 * normalizeChannel(rgb.b)
    );
  }

  function getContrastRatio(backgroundColor, textColor) {
    const backgroundLuminance = getRelativeLuminance(backgroundColor);
    const textLuminance = getRelativeLuminance(textColor);
    if (
      !Number.isFinite(backgroundLuminance) ||
      !Number.isFinite(textLuminance)
    ) {
      return 0;
    }

    const lighter = Math.max(backgroundLuminance, textLuminance);
    const darker = Math.min(backgroundLuminance, textLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function ensureReadableTextColor(
    backgroundColor,
    preferredTextColor,
    darkText = "#173326",
    lightText = "#f8fafc",
    minContrast = 4.2,
  ) {
    const fallbackTextColor = getReadableTextColor(
      backgroundColor,
      darkText,
      lightText,
    );
    if (!isValidThemeColorValue(preferredTextColor)) {
      return fallbackTextColor;
    }

    const normalizedTextColor = preferredTextColor.trim();
    return getContrastRatio(backgroundColor, normalizedTextColor) >= minContrast
      ? normalizedTextColor
      : fallbackTextColor;
  }

  function ensureReadableShapeColor(
    color,
    backgroundColor,
    fallbackColor = DEFAULT_THEME_COLORS.accent,
    minContrast = 2.1,
  ) {
    const safeBackground = isValidThemeColorValue(backgroundColor)
      ? backgroundColor.trim()
      : DEFAULT_THEME_COLORS.primary;
    const fallbackShapeColor = isValidThemeColorValue(fallbackColor)
      ? fallbackColor.trim()
      : DEFAULT_THEME_COLORS.accent;
    const preferredShapeColor = isValidThemeColorValue(color)
      ? color.trim()
      : fallbackShapeColor;

    if (getContrastRatio(safeBackground, preferredShapeColor) >= minContrast) {
      return preferredShapeColor;
    }

    const readableReference = getReadableTextColor(
      safeBackground,
      "#17212b",
      "#f7faff",
    );
    const mixedShapeColor = mixThemeColors(
      preferredShapeColor,
      readableReference,
      0.42,
    );
    if (getContrastRatio(safeBackground, mixedShapeColor) >= minContrast) {
      return mixedShapeColor;
    }

    if (getContrastRatio(safeBackground, fallbackShapeColor) >= minContrast) {
      return fallbackShapeColor;
    }

    return readableReference;
  }

  function resolveWidgetThemeColors(resolvedColors = {}) {
    const surfaceReference = firstNonEmpty(
      resolvedColors.panelStrong,
      resolvedColors.panel,
      resolvedColors.secondary,
      resolvedColors.primary,
      DEFAULT_THEME_COLORS.panelStrong,
    );
    const surfaceLuminance = getRelativeLuminance(surfaceReference);
    const isLightSurface =
      Number.isFinite(surfaceLuminance) && surfaceLuminance >= 0.58;
    const contrastReference = isLightSurface ? "#17212B" : "#FFFFFF";
    const accentBase = ensureReadableShapeColor(
      resolvedColors.accent,
      surfaceReference,
      DEFAULT_THEME_COLORS.accent,
      2.1,
    );
    const accentActionBg = ensureReadableShapeColor(
      resolvedColors.buttonBg,
      surfaceReference,
      accentBase,
      2.1,
    );

    return {
      surfaceReference,
      windowGlow: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      controlBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.14),
      controlBorder: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.18),
      controlText: ensureReadableTextColor(
        surfaceReference,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      cardBg: toRgbaColor(
        mixThemeColors(surfaceReference, resolvedColors.primary, 0.12),
        isLightSurface ? 0.92 : 0.88,
      ),
      cardBorder: toRgbaColor(
        mixThemeColors(
          contrastReference,
          firstNonEmpty(resolvedColors.panelBorder, resolvedColors.border, accentBase),
          0.36,
        ),
        isLightSurface ? 0.3 : 0.26,
      ),
      cardShadow: toRgbaColor(
        isLightSurface ? "#556274" : "#02060A",
        isLightSurface ? 0.14 : 0.24,
      ),
      cardGlossStart: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      subtleSurface: toRgbaColor(contrastReference, isLightSurface ? 0.05 : 0.08),
      subtleSurfaceStrong: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.08 : 0.12,
      ),
      subtleBorder: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.16),
      trackBg: toRgbaColor(contrastReference, isLightSurface ? 0.06 : 0.08),
      trackBorder: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.14),
      gridColor: toRgbaColor(contrastReference, isLightSurface ? 0.1 : 0.16),
      placeholderColor: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.22 : 0.28,
      ),
      chartTrackBg: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.14),
      pieCenterBg: toRgbaColor(
        mixThemeColors(surfaceReference, resolvedColors.primary, 0.18),
        isLightSurface ? 0.96 : 0.92,
      ),
      badgeBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.12),
      badgeText: resolvedColors.mutedText,
      actionMutedBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.14),
      actionMutedBorder: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.14 : 0.18,
      ),
      actionMutedText: ensureReadableTextColor(
        surfaceReference,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.2,
      ),
      accentActionBg,
      accentActionBorder: toRgbaColor(
        accentActionBg,
        isLightSurface ? 0.38 : 0.32,
      ),
      accentActionText: ensureReadableTextColor(
        accentActionBg,
        firstNonEmpty(resolvedColors.buttonText, resolvedColors.onAccentText),
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      goalAnnualBg: toRgbaColor(accentBase, isLightSurface ? 0.18 : 0.16),
      goalAnnualAccent: accentBase,
      goalMonthBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.12),
      goalMonthAccent: toRgbaColor(contrastReference, isLightSurface ? 0.18 : 0.2),
      colorChipOutline: toRgbaColor(contrastReference, isLightSurface ? 0.16 : 0.18),
    };
  }

  function resolveThemeColors(theme = null) {
    const source = theme?.colors || {};
    const primary = isValidThemeColorValue(source.primary)
      ? source.primary.trim()
      : DEFAULT_THEME_COLORS.primary;
    const secondary = isValidThemeColorValue(source.secondary)
      ? source.secondary.trim()
      : DEFAULT_THEME_COLORS.secondary;
    const tertiary = isValidThemeColorValue(source.tertiary)
      ? source.tertiary.trim()
      : DEFAULT_THEME_COLORS.tertiary;
    const quaternary = isValidThemeColorValue(source.quaternary)
      ? source.quaternary.trim()
      : DEFAULT_THEME_COLORS.quaternary;
    const panel = isValidThemeColorValue(source.panel)
      ? source.panel.trim()
      : secondary;
    const panelStrong = isValidThemeColorValue(source.panelStrong)
      ? source.panelStrong.trim()
      : tertiary;
    const accent = ensureReadableShapeColor(
      isValidThemeColorValue(source.accent)
        ? source.accent.trim()
        : DEFAULT_THEME_COLORS.accent,
      panelStrong,
      DEFAULT_THEME_COLORS.accent,
      2.1,
    );
    const text = ensureReadableTextColor(
      panelStrong,
      isValidThemeColorValue(source.text)
        ? source.text.trim()
        : DEFAULT_THEME_COLORS.text,
      "#173326",
      "#f8fafc",
      4.5,
    );
    const buttonBg = ensureReadableShapeColor(
      isValidThemeColorValue(source.buttonBg) ? source.buttonBg.trim() : accent,
      panelStrong,
      accent,
      2.1,
    );
    const panelBorder = isValidThemeColorValue(source.panelBorder)
      ? source.panelBorder.trim()
      : toRgbaColor(accent, 0.28);
    const navBarBg = isValidThemeColorValue(source.navBarBg)
      ? source.navBarBg.trim()
      : panelStrong;
    const navButtonBg = isValidThemeColorValue(source.navButtonBg)
      ? source.navButtonBg.trim()
      : toRgbaColor(accent, 0.12);
    const navButtonActiveBg = ensureReadableShapeColor(
      isValidThemeColorValue(source.navButtonActiveBg)
        ? source.navButtonActiveBg.trim()
        : buttonBg,
      navBarBg,
      buttonBg,
      1.9,
    );
    const buttonText = ensureReadableTextColor(
      buttonBg,
      source.buttonText,
      "#173326",
      "#f8fafc",
    );
    const onAccentText = ensureReadableTextColor(
      accent,
      source.onAccentText,
      "#173326",
      "#f8fafc",
    );
    const navButtonActiveText = ensureReadableTextColor(
      navButtonActiveBg,
      source.navButtonActiveText,
      "#16211c",
      "#f8fafc",
    );
    const primaryHex = toHexColor(primary, DEFAULT_THEME_COLORS.primary);
    const primaryRgb = parseHexColor(primaryHex);
    const isLightSurface =
      !!primaryRgb &&
      (0.2126 * primaryRgb.r + 0.7152 * primaryRgb.g + 0.0722 * primaryRgb.b) / 255 >=
        0.72;

    return {
      primary,
      secondary,
      tertiary,
      quaternary,
      accent,
      text,
      mutedText: isValidThemeColorValue(source.mutedText)
        ? source.mutedText.trim()
        : toRgbaColor(text, isLightSurface ? 0.7 : 0.72),
      border: isValidThemeColorValue(source.border)
        ? source.border.trim()
        : panelBorder,
      delete: isValidThemeColorValue(source.delete)
        ? source.delete.trim()
        : DEFAULT_THEME_COLORS.delete,
      deleteHover: isValidThemeColorValue(source.deleteHover)
        ? source.deleteHover.trim()
        : DEFAULT_THEME_COLORS.deleteHover,
      projectLevel1: isValidThemeColorValue(source.projectLevel1)
        ? source.projectLevel1.trim()
        : DEFAULT_THEME_COLORS.projectLevel1,
      projectLevel2: isValidThemeColorValue(source.projectLevel2)
        ? source.projectLevel2.trim()
        : DEFAULT_THEME_COLORS.projectLevel2,
      projectLevel3: isValidThemeColorValue(source.projectLevel3)
        ? source.projectLevel3.trim()
        : DEFAULT_THEME_COLORS.projectLevel3,
      panel,
      panelStrong,
      panelBorder,
      buttonBg,
      buttonBgHover: isValidThemeColorValue(source.buttonBgHover)
        ? source.buttonBgHover.trim()
        : buttonBg,
      buttonText,
      buttonBorder: isValidThemeColorValue(source.buttonBorder)
        ? source.buttonBorder.trim()
        : toRgbaColor(buttonBg, 0.48),
      onAccentText,
      navBarBg,
      navButtonBg,
      navButtonActiveBg,
      navButtonActiveText,
      overlay: isValidThemeColorValue(source.overlay)
        ? source.overlay.trim()
        : isLightSurface
          ? "rgba(27, 31, 38, 0.22)"
          : DEFAULT_THEME_COLORS.overlay,
    };
  }

  function normalizeBuiltInThemeOverride(themeId, override = {}) {
    const baseTheme = builtInThemeMap.get(themeId);
    if (
      !baseTheme ||
      !override ||
      typeof override !== "object" ||
      Array.isArray(override)
    ) {
      return null;
    }

    return {
      id: themeId,
      name:
        typeof override?.name === "string" && override.name.trim()
          ? override.name.trim()
          : baseTheme.name,
      colors: resolveThemeColors({
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          ...(override?.colors || {}),
        },
      }),
    };
  }

  function loadBuiltInThemeOverrides() {
    try {
      const raw = JSON.parse(
        localStorage.getItem(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY) || "{}",
      );
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
      }

      return BUILT_IN_THEMES.reduce((accumulator, theme) => {
        const override = normalizeBuiltInThemeOverride(theme.id, raw[theme.id]);
        if (override) {
          accumulator[theme.id] = override;
        }
        return accumulator;
      }, {});
    } catch (error) {
      return {};
    }
  }

  function normalizeCustomTheme(theme) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
      return null;
    }

    return {
      id: typeof theme.id === "string" ? theme.id : "",
      name: typeof theme.name === "string" ? theme.name : "",
      colors: resolveThemeColors(theme),
    };
  }

  function isLightTheme(theme) {
    if (lightThemeIds.has(theme?.id)) return true;
    const rgb = parseHexColor(toHexColor(theme?.colors?.primary, ""));
    if (!rgb) return false;
    const luminance =
      (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance >= 0.72;
  }

  function applyThemeColors(theme) {
    const resolvedColors = resolveThemeColors(theme);
    const widgetColors = resolveWidgetThemeColors(resolvedColors);
    const root = document.documentElement;
    root.style.setProperty("--bg-primary", resolvedColors.primary);
    root.style.setProperty("--bg-secondary", resolvedColors.secondary);
    root.style.setProperty("--bg-tertiary", resolvedColors.tertiary);
    root.style.setProperty("--bg-quaternary", resolvedColors.quaternary);
    root.style.setProperty("--accent-color", resolvedColors.accent);
    root.style.setProperty("--accent-color-rgb", toRgbChannels(resolvedColors.accent));
    root.style.setProperty("--text-color", resolvedColors.text);
    root.style.setProperty("--muted-text-color", resolvedColors.mutedText);
    root.style.setProperty("--border-color", resolvedColors.border);
    root.style.setProperty("--delete-btn", resolvedColors.delete);
    root.style.setProperty("--delete-hover", resolvedColors.deleteHover);
    root.style.setProperty("--project-level-1", resolvedColors.projectLevel1);
    root.style.setProperty("--project-level-2", resolvedColors.projectLevel2);
    root.style.setProperty("--project-level-3", resolvedColors.projectLevel3);
    root.style.setProperty("--panel-bg", resolvedColors.panel);
    root.style.setProperty("--panel-strong-bg", resolvedColors.panelStrong);
    root.style.setProperty("--panel-border-color", resolvedColors.panelBorder);
    root.style.setProperty("--button-bg", resolvedColors.buttonBg);
    root.style.setProperty("--button-bg-hover", resolvedColors.buttonBgHover);
    root.style.setProperty("--button-text", resolvedColors.buttonText);
    root.style.setProperty("--button-border", resolvedColors.buttonBorder);
    root.style.setProperty("--on-accent-text", resolvedColors.onAccentText);
    root.style.setProperty("--bottom-nav-bg", resolvedColors.navBarBg);
    root.style.setProperty("--bottom-nav-button-bg", resolvedColors.navButtonBg);
    root.style.setProperty(
      "--bottom-nav-button-active-bg",
      resolvedColors.navButtonActiveBg,
    );
    root.style.setProperty(
      "--bottom-nav-active-text",
      resolvedColors.navButtonActiveText,
    );
    root.style.setProperty("--overlay-bg", resolvedColors.overlay);
    root.style.setProperty("--widget-surface-reference", widgetColors.surfaceReference);
    root.style.setProperty("--widget-window-glow", widgetColors.windowGlow);
    root.style.setProperty("--widget-control-bg", widgetColors.controlBg);
    root.style.setProperty("--widget-control-border", widgetColors.controlBorder);
    root.style.setProperty("--widget-control-text", widgetColors.controlText);
    root.style.setProperty("--widget-card-bg", widgetColors.cardBg);
    root.style.setProperty("--widget-card-border", widgetColors.cardBorder);
    root.style.setProperty("--widget-card-shadow", widgetColors.cardShadow);
    root.style.setProperty("--widget-card-gloss-start", widgetColors.cardGlossStart);
    root.style.setProperty("--widget-subtle-surface", widgetColors.subtleSurface);
    root.style.setProperty(
      "--widget-subtle-surface-strong",
      widgetColors.subtleSurfaceStrong,
    );
    root.style.setProperty("--widget-subtle-border", widgetColors.subtleBorder);
    root.style.setProperty("--widget-track-bg", widgetColors.trackBg);
    root.style.setProperty("--widget-track-border", widgetColors.trackBorder);
    root.style.setProperty("--widget-grid-color", widgetColors.gridColor);
    root.style.setProperty(
      "--widget-placeholder-color",
      widgetColors.placeholderColor,
    );
    root.style.setProperty("--widget-chart-track-bg", widgetColors.chartTrackBg);
    root.style.setProperty("--widget-pie-center-bg", widgetColors.pieCenterBg);
    root.style.setProperty("--widget-badge-bg", widgetColors.badgeBg);
    root.style.setProperty("--widget-badge-text", widgetColors.badgeText);
    root.style.setProperty("--widget-action-muted-bg", widgetColors.actionMutedBg);
    root.style.setProperty(
      "--widget-action-muted-border",
      widgetColors.actionMutedBorder,
    );
    root.style.setProperty(
      "--widget-action-muted-text",
      widgetColors.actionMutedText,
    );
    root.style.setProperty(
      "--widget-accent-action-bg",
      widgetColors.accentActionBg,
    );
    root.style.setProperty(
      "--widget-accent-action-border",
      widgetColors.accentActionBorder,
    );
    root.style.setProperty(
      "--widget-accent-action-text",
      widgetColors.accentActionText,
    );
    root.style.setProperty("--widget-goal-annual-bg", widgetColors.goalAnnualBg);
    root.style.setProperty(
      "--widget-goal-annual-accent",
      widgetColors.goalAnnualAccent,
    );
    root.style.setProperty("--widget-goal-month-bg", widgetColors.goalMonthBg);
    root.style.setProperty(
      "--widget-goal-month-accent",
      widgetColors.goalMonthAccent,
    );
    root.style.setProperty(
      "--widget-color-chip-outline",
      widgetColors.colorChipOutline,
    );
  }

  function dispatchThemeApplied(themeId, colors) {
    window.dispatchEvent(
      new CustomEvent(THEME_APPLIED_EVENT_NAME, {
        detail: {
          themeId,
          colors: { ...colors },
        },
      }),
    );
  }

  function resolveActiveThemeState() {
    const storedTheme = localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "default";
    const builtInThemeOverrides = loadBuiltInThemeOverrides();
    const rawCustomThemes = JSON.parse(
      localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || "[]",
    );
    const customTheme = Array.isArray(rawCustomThemes)
      ? normalizeCustomTheme(
          rawCustomThemes.find((theme) => theme?.id === storedTheme) || null,
        )
      : null;
    const baseBuiltInTheme = builtInThemeMap.get(storedTheme) || null;
    const mergedBuiltInTheme = baseBuiltInTheme
      ? {
          ...baseBuiltInTheme,
          name: builtInThemeOverrides[storedTheme]?.name || baseBuiltInTheme.name,
          colors: resolveThemeColors(
            builtInThemeOverrides[storedTheme]
              ? {
                  ...baseBuiltInTheme,
                  colors: {
                    ...baseBuiltInTheme.colors,
                    ...builtInThemeOverrides[storedTheme].colors,
                  },
                }
              : baseBuiltInTheme,
          ),
        }
      : null;

    const activeTheme =
      customTheme || mergedBuiltInTheme || builtInThemeMap.get("default");
    const themeId = activeTheme?.id || "default";

    return {
      activeTheme,
      themeId,
    };
  }

  function applyThemeState(themeId, activeTheme) {
    document.documentElement.setAttribute("data-theme", themeId);
    applyThemeColors(activeTheme);
    document.documentElement.style.colorScheme = isLightTheme(activeTheme)
      ? "light"
      : "dark";
    dispatchThemeApplied(themeId, resolveThemeColors(activeTheme));

    if (
      (localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "default") !== themeId
    ) {
      localStorage.setItem(SELECTED_THEME_STORAGE_KEY, themeId);
    }
  }

  function applyThemeFromStorage() {
    try {
      const nextSignature = [
        localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "",
        localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || "",
        localStorage.getItem(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY) || "",
      ].join("\u0001");
      if (nextSignature === lastThemeStorageSignature) {
        return;
      }

      const { activeTheme, themeId } = resolveActiveThemeState();
      lastThemeStorageSignature = nextSignature;
      applyThemeState(themeId, activeTheme);
    } catch (error) {
      lastThemeStorageSignature = "__fallback__";
      const fallbackTheme = builtInThemeMap.get("default");
      document.documentElement.setAttribute("data-theme", "default");
      applyThemeColors(fallbackTheme);
      document.documentElement.style.colorScheme = "dark";
      dispatchThemeApplied("default", resolveThemeColors(fallbackTheme));
    }
  }

  applyThemeFromStorage();

  window.addEventListener("storage", (event) => {
    if (
      !event ||
      event.key === null ||
      event.key === SELECTED_THEME_STORAGE_KEY ||
      event.key === CUSTOM_THEMES_STORAGE_KEY ||
      event.key === BUILT_IN_THEME_OVERRIDES_STORAGE_KEY
    ) {
      applyThemeFromStorage();
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        applyThemeFromStorage();
      }
    });
  }

  window.addEventListener("focus", () => {
    applyThemeFromStorage();
  });
  window.addEventListener("controler:storage-data-changed", () => {
    applyThemeFromStorage();
  });

  try {
    if (!document.documentElement.getAttribute("data-theme")) {
      applyThemeFromStorage();
    }
  } catch (error) {
    const fallbackTheme = builtInThemeMap.get("default");
    document.documentElement.setAttribute("data-theme", "default");
    applyThemeColors(fallbackTheme);
    document.documentElement.style.colorScheme = "dark";
    dispatchThemeApplied("default", resolveThemeColors(fallbackTheme));
  }

  window.ControlerTheme = {
    themeAppliedEventName: THEME_APPLIED_EVENT_NAME,
    ensureReadableShapeColor,
    getReadableTextColorForBackground(
      backgroundColor,
      preferredTextColor = "",
      minContrast = 4.2,
    ) {
      return ensureReadableTextColor(
        backgroundColor,
        preferredTextColor,
        "#17212B",
        "#F7FAFF",
        minContrast,
      );
    },
    resolveWidgetThemeColors,
  };
})();


;/* pages/ui-helpers.js */
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

  function registerBeforePageLeave(handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    const guardId = `guard_${Date.now()}_${(beforePageLeaveGuardCounter += 1)}`;
    beforePageLeaveGuards.set(guardId, handler);
    return () => {
      beforePageLeaveGuards.delete(guardId);
    };
  }

  async function runBeforePageLeaveGuards(context = {}) {
    if (!beforePageLeaveGuards.size) {
      return true;
    }

    const overlayController = getAppPageLeaveOverlayController();
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
      slowMessageTimerId = window.setTimeout(() => {
        overlayController?.setState({
          active: true,
          mode: "fullscreen",
          title: APP_PAGE_LEAVE_GUARD_LOADING_TITLE,
          message: APP_PAGE_LEAVE_GUARD_LOADING_MESSAGE,
          delayMs: 0,
        });
      }, APP_PAGE_LEAVE_GUARD_SLOW_MESSAGE_DELAY_MS);

      const guards = Array.from(beforePageLeaveGuards.values());
      for (const guard of guards) {
        const guardResult = await guard(context);
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
            targetHref: finalTargetHref,
            replaceHistory: finalNavigationOptions.replaceHistory === true,
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
            !topModal.contains(event.target)
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
    let overlayTimerId = 0;
    let destroyed = false;
    let currentVisibility = !overlay.hidden;
    let currentMode = normalizeMode(overlay.dataset.mode || "inline");

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

      const resolvedMode = normalizeMode(mode);
      if (visible && resolvedMode === "fullscreen") {
        moveOverlayToFullscreenHost();
      } else {
        moveOverlayToInlineHost();
      }

      overlay.dataset.mode = resolvedMode;
      overlay.hidden = !visible;
      overlay.setAttribute("aria-hidden", visible ? "false" : "true");
      currentVisibility = visible;
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

    window.addEventListener("pagehide", handlePageDispose);
    window.addEventListener("beforeunload", handlePageDispose);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);

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



