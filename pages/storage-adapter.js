(() => {
  const CONTROLER_STORAGE_EVENT = "controler:storage-data-changed";
  const CONTROLER_STORAGE_ERROR_EVENT = "controler:storage-sync-error";
  const CONTROLER_SHELL_RESUME_SETTLED_EVENT =
    "controler:shell-resume-settled";
  const MOBILE_FILE_NAME = "bundle-manifest.json";
  const BROWSER_STATE_KEY = "__controler_browser_state__";
  const MOBILE_MIRROR_STATE_KEY = "__controler_mobile_state__";
  const MOBILE_MIRROR_STATUS_KEY = "__controler_mobile_status__";
  const MOBILE_MIRROR_COVERAGE_KEY = "__controler_mobile_coverage__";
  const MOBILE_MIRROR_PENDING_WRITE_KEY = "__controler_mobile_pending_write__";
  const MOBILE_MIRROR_PENDING_SESSION_KEY =
    "__controler_mobile_pending_session__";
  const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
  const MOBILE_MIRROR_FLUSH_DELAY_MS = 90;
  const JOURNAL_BATCH_DELAY_MS = 40;
  const ELECTRON_WRITE_DELAY_MS = 72;
  const EXTERNAL_RELOAD_DELAY_MS = 120;
  const NATIVE_WRITE_DELAY_MS = 64;
  const NATIVE_PROBE_DEBOUNCE_MS = 150;
  const NATIVE_PROBE_FAST_INTERVAL_MS = 2000;
  const NATIVE_PROBE_STABLE_INTERVAL_MS = 6000;
  const NATIVE_PROBE_FAST_WINDOW_MS = 30000;
  const NATIVE_PROBE_FALLBACK_HASH_INTERVAL_MS = 30000;
  const NATIVE_BOOTSTRAP_SYNC_GRACE_MS = 4000;
  const NATIVE_LOCAL_WRITE_ERROR_SUPPRESS_MS = 5000;
  const SAVE_COORDINATOR_RETRY_DELAY_MS = 240;
  function createRuntimeInstanceId(prefix = "controler-page") {
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${randomSuffix}`;
  }
  const STORAGE_PAGE_INSTANCE_ID =
    typeof window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ === "string" &&
    window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
      ? window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
      : createRuntimeInstanceId();
  window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ = STORAGE_PAGE_INSTANCE_ID;
  const STORAGE_DEBUG_ENABLED =
    !!window.ReactNativeWebView ||
    window.ControlerNativeBridge?.platform === "android" ||
    window.ControlerNativeBridge?.platform === "ios";
  function emitStorageDebug(label, payload = {}) {
    if (!STORAGE_DEBUG_ENABLED) {
      return;
    }
    try {
      const href =
        typeof window.location?.href === "string" ? window.location.href : "";
      console.info(
        "[storage-debug]",
        JSON.stringify({
          label: String(label || "").trim(),
          href,
          pageInstanceId: STORAGE_PAGE_INSTANCE_ID,
          at: Date.now(),
          ...payload,
        }),
      );
    } catch (error) {
      console.info("[storage-debug]", String(label || "").trim());
    }
  }

  const electronAPI = window.electronAPI;
  const hasElectronStorageBridge =
    !!electronAPI?.isElectron &&
    typeof electronAPI.storageLoadSync === "function" &&
    typeof electronAPI.storageSaveSync === "function";

  const reactNativeBridge = window.ControlerNativeBridge || null;
  const guideBundle = window.ControlerGuideBundle || null;
  const storageBundle = window.ControlerStorageBundle || null;
  const platformContract = window.ControlerPlatformContract || null;
  function resolveReactNativeRuntimeSessionId() {
    if (
      typeof window.__CONTROLER_RN_SESSION_ID__ === "string" &&
      window.__CONTROLER_RN_SESSION_ID__.trim()
    ) {
      return window.__CONTROLER_RN_SESSION_ID__.trim();
    }
    if (
      window.__CONTROLER_RN_META__ &&
      typeof window.__CONTROLER_RN_META__ === "object" &&
      typeof window.__CONTROLER_RN_META__.runtimeSessionId === "string" &&
      window.__CONTROLER_RN_META__.runtimeSessionId.trim()
    ) {
      return window.__CONTROLER_RN_META__.runtimeSessionId.trim();
    }
    return "";
  }
  const REACT_NATIVE_RUNTIME_SESSION_ID = resolveReactNativeRuntimeSessionId();
  function resolveStorageDebugPageKey() {
    try {
      const pathSegments = String(window.location.pathname || "").split("/");
      const tail = String(pathSegments[pathSegments.length - 1] || "").trim();
      return tail.replace(/\.html$/i, "") || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  function emitStoragePerfMetric(stage, payload = {}) {
    if (
      !STORAGE_DEBUG_ENABLED ||
      typeof reactNativeBridge?.emitEvent !== "function"
    ) {
      return;
    }
    try {
      reactNativeBridge.emitEvent("perf.metric", {
        stage: String(stage || "").trim(),
        page: resolveStorageDebugPageKey(),
        ...(payload && typeof payload === "object" ? payload : {}),
      });
    } catch (error) {
      console.info("[storage-perf]", String(stage || "").trim());
    }
  }

  function dispatchShellResumeSettledEvent(reason, payload = {}) {
    const normalizedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : "";
    if (normalizedReason !== "shell-resume") {
      return;
    }
    try {
      window.dispatchEvent(
        new CustomEvent(CONTROLER_SHELL_RESUME_SETTLED_EVENT, {
          detail: {
            reason: normalizedReason,
            href: typeof window.location?.href === "string" ? window.location.href : "",
            ...(payload && typeof payload === "object" ? payload : {}),
          },
        }),
      );
    } catch (error) {
      // Ignore dispatch failures.
    }
  }
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
    "schemaVersion",
    "recovery",
    "protectionMode",
  ]);
  const SHARED_STATE_KEYS = new Set([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "checkinHistorySummary",
    "dailyCheckins",
    "checkins",
    "yearlyGoals",
    "diaryEntries",
    "diaryMediaAssets",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
    "todoSortPreference",
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
    "checkinHistorySummary",
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
    "checkinHistorySummary",
    "yearlyGoals",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
    "todoSortPreference",
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
    checkinHistorySummary: {},
    dailyCheckins: [],
    checkins: [],
    yearlyGoals: {},
    diaryEntries: [],
    diaryMediaAssets: [],
    diaryCategories: [],
    guideState: getDefaultGuideStateFallback(),
    customThemes: [],
    builtInThemeOverrides: {},
    selectedTheme: "obsidian-mono",
    createdAt: null,
    lastModified: null,
    storagePath: null,
    storageDirectory: null,
    userDataPath: null,
    documentsPath: null,
    schemaVersion: 1,
    recovery: {
      invalidItems: [],
      summary: {
        totalInvalidCount: 0,
        hardInvalidCount: 0,
        softInvalidCount: 0,
        hasHardIssues: false,
        reasonCounts: {},
        hardReasonCounts: {},
        lastCapturedAt: null,
      },
    },
    protectionMode: "off",
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

  function normalizeRecoveryStateForClient(recovery = {}) {
    if (typeof storageBundle?.normalizeRecoveryState === "function") {
      return storageBundle.normalizeRecoveryState(recovery);
    }
    const invalidItems =
      recovery && typeof recovery === "object" && !Array.isArray(recovery) &&
      Array.isArray(recovery.invalidItems)
        ? cloneValue(recovery.invalidItems)
        : [];
    return {
      invalidItems,
      summary: {
        totalInvalidCount: invalidItems.length,
        hardInvalidCount: 0,
        softInvalidCount: invalidItems.length,
        hasHardIssues: false,
        reasonCounts: {},
        hardReasonCounts: {},
        lastCapturedAt: null,
      },
    };
  }

  function getRecoverySummaryFromState(state = {}) {
    return normalizeRecoveryStateForClient(state?.recovery).summary;
  }

  function enrichStorageStatusWithRecovery(status, state = {}) {
    if (!status || typeof status !== "object" || Array.isArray(status)) {
      return status;
    }
    return {
      ...status,
      recoverySummary:
        status?.recoverySummary &&
        typeof status.recoverySummary === "object" &&
        !Array.isArray(status.recoverySummary)
          ? cloneValue(status.recoverySummary)
          : cloneValue(getRecoverySummaryFromState(state)),
      persistErrorCode:
        typeof status?.persistErrorCode === "string"
          ? status.persistErrorCode.trim()
          : "",
    };
  }

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

  function normalizeCheckinHistorySummaryDateList(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((value) =>
            typeof value === "string" ? value.trim().slice(0, 10) : "",
          )
          .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
      ),
    ).sort();
  }

  function normalizeCheckinHistorySummaryEntry(entry = {}) {
    const source =
      entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const checkedDates = normalizeCheckinHistorySummaryDateList(
      source.checkedDates,
    );
    const explicitCount = Math.max(
      0,
      Math.round(Number(source.checkedDaysCount) || 0),
    );
    return {
      checkedDaysCount:
        checkedDates.length > 0 ? checkedDates.length : explicitCount,
      checkedDates,
      updatedAt:
        typeof source.updatedAt === "string" && source.updatedAt.trim()
          ? source.updatedAt.trim()
          : "",
    };
  }

  function normalizeCheckinHistorySummary(summary = {}) {
    const source =
      summary && typeof summary === "object" && !Array.isArray(summary)
        ? summary
        : {};
    const normalized = {};
    Object.keys(source).forEach((itemId) => {
      const normalizedItemId = String(itemId || "").trim();
      if (!normalizedItemId) {
        return;
      }
      normalized[normalizedItemId] = normalizeCheckinHistorySummaryEntry(
        source[itemId],
      );
    });
    return normalized;
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

  function readBrowserFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () =>
        reject(reader.error || new Error("读取图片文件失败"));
      reader.readAsDataURL(file);
    });
  }

  function measureBrowserImageDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: Math.max(0, Math.round(Number(image.naturalWidth) || 0)),
          height: Math.max(0, Math.round(Number(image.naturalHeight) || 0)),
        });
      };
      image.onerror = () => {
        resolve({
          width: 0,
          height: 0,
        });
      };
      image.src = dataUrl;
    });
  }

  async function describeBrowserImageFile(file) {
    if (!(file instanceof File)) {
      return null;
    }
    const dataUrl = await readBrowserFileAsDataUrl(file);
    const dimensions = await measureBrowserImageDataUrl(dataUrl);
    return {
      fileName: typeof file.name === "string" ? file.name : "",
      mimeType: typeof file.type === "string" ? file.type : "",
      sizeBytes: Number.isFinite(file.size) ? Math.max(0, Number(file.size)) : 0,
      lastModified: Number.isFinite(file.lastModified)
        ? Math.max(0, Math.round(Number(file.lastModified)))
        : 0,
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      sourceKind: "browser-file",
    };
  }

  function pickDiaryImagesFromBrowser(options = {}) {
    return new Promise((resolve) => {
      if (!(document?.body instanceof HTMLElement)) {
        resolve([]);
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        typeof options.accept === "string" && options.accept.trim()
          ? options.accept.trim()
          : "image/*";
      input.multiple = options.multiple !== false;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.width = "1px";
      input.style.height = "1px";
      const cleanup = () => {
        input.value = "";
        input.remove();
      };
      input.addEventListener(
        "change",
        () => {
          const files = Array.from(input.files || []);
          Promise.all(files.map((file) => describeBrowserImageFile(file)))
            .then((items) => {
              cleanup();
              resolve(items.filter(Boolean));
            })
            .catch(() => {
              cleanup();
              resolve([]);
            });
        },
        { once: true },
      );
      document.body.appendChild(input);
      input.click();
    });
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
        return normalizedValue || "obsidian-mono";
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
      repairResult.repaired &&
      !needsDurationRepair &&
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
    const stripResult = stripPartitionedSectionsFromCorePayload(corePayload);
    const source =
      stripResult.payload &&
      typeof stripResult.payload === "object" &&
      !Array.isArray(stripResult.payload)
        ? stripResult.payload
        : {};
    const normalizedPayload = {
      ...source,
      ...(Object.prototype.hasOwnProperty.call(source, "checkinHistorySummary")
        ? {
            checkinHistorySummary: normalizeCheckinHistorySummary(
              source.checkinHistorySummary,
            ),
          }
        : {}),
    };
    if (!Object.prototype.hasOwnProperty.call(source, "projects")) {
      return {
        payload: normalizedPayload,
        projects: [],
        repaired: stripResult.repaired,
      };
    }
    const projectResult = normalizeProjectCollection(source.projects, options);
    return {
      payload: {
        ...normalizedPayload,
        projects: cloneValue(projectResult.projects),
      },
      projects: projectResult.projects,
      repaired: stripResult.repaired || projectResult.repaired,
    };
  }

  function stripPartitionedSectionsFromCorePayload(corePayload = {}) {
    const source =
      corePayload && typeof corePayload === "object" && !Array.isArray(corePayload)
        ? corePayload
        : {};
    const sanitized = {
      ...source,
    };
    let repaired = false;
    const partitionedSections = Array.isArray(storageBundle?.PARTITIONED_SECTIONS)
      ? storageBundle.PARTITIONED_SECTIONS
      : ["records", "plans", "diaryEntries", "dailyCheckins", "checkins"];
    partitionedSections.forEach((section) => {
      if (!Object.prototype.hasOwnProperty.call(sanitized, section)) {
        return;
      }
      delete sanitized[section];
      repaired = true;
    });
    return {
      payload: sanitized,
      repaired,
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

  function shouldUseStateRecordsForProjectNormalization(metadata = {}) {
    // Managed state may contain only range-scoped partitions (for example the
    // current month of records). Rebuilding project duration caches from those
    // partial records corrupts the all-cycle totals stored on projects, so we
    // only allow this when the caller explicitly confirms the records array is
    // a full authoritative snapshot.
    return metadata?.useStateRecordsForProjectNormalization === true;
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
    if (
      !base.checkinHistorySummary ||
      typeof base.checkinHistorySummary !== "object" ||
      Array.isArray(base.checkinHistorySummary)
    ) {
      base.checkinHistorySummary = {};
    } else {
      base.checkinHistorySummary = normalizeCheckinHistorySummary(
        base.checkinHistorySummary,
      );
    }
    if (!Array.isArray(base.dailyCheckins)) base.dailyCheckins = [];
    if (!Array.isArray(base.checkins)) base.checkins = [];
    if (!Array.isArray(base.diaryEntries)) base.diaryEntries = [];
    if (!Array.isArray(base.diaryMediaAssets)) base.diaryMediaAssets = [];
    if (!Array.isArray(base.diaryCategories)) base.diaryCategories = [];
    if (!Array.isArray(base.customThemes)) base.customThemes = [];
    base.diaryMediaAssets =
      typeof storageBundle?.normalizeDiaryMediaManifest === "function"
        ? storageBundle.normalizeDiaryMediaManifest(base.diaryMediaAssets)
        : base.diaryMediaAssets;
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
      base.selectedTheme = "obsidian-mono";
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
    base.projects = normalizeProjectCollection(
      base.projects,
      shouldUseStateRecordsForProjectNormalization(metadata)
        ? {
            records: base.records,
          }
        : {},
    ).projects;

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
    base.schemaVersion = Number.isFinite(sourceState?.schemaVersion)
      ? Math.max(1, Math.round(Number(sourceState.schemaVersion)))
      : Number.isFinite(base.schemaVersion)
        ? Math.max(1, Math.round(Number(base.schemaVersion)))
        : 1;
    base.recovery =
      normalizeRecoveryStateForClient(base.recovery);
    base.protectionMode =
      typeof metadata.protectionMode === "string" && metadata.protectionMode.trim()
        ? metadata.protectionMode.trim()
        : typeof sourceState?.protectionMode === "string" && sourceState.protectionMode.trim()
          ? sourceState.protectionMode.trim()
          : typeof base.protectionMode === "string" && base.protectionMode.trim()
            ? base.protectionMode.trim()
            : "off";
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

  function isSerializableSectionEqual(left, right) {
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch (error) {
      return false;
    }
  }

  function inferChangedSectionsFromStateTransition(previousState = {}, nextState = {}) {
    const previousSharedState = extractSharedState(previousState);
    const nextSharedState = extractSharedState(nextState);
    const changedSections = [];

    SHARED_STATE_KEYS.forEach((section) => {
      const previousHasSection = Object.prototype.hasOwnProperty.call(
        previousSharedState,
        section,
      );
      const nextHasSection = Object.prototype.hasOwnProperty.call(
        nextSharedState,
        section,
      );
      if (!previousHasSection && !nextHasSection) {
        return;
      }
      if (
        previousHasSection !== nextHasSection ||
        !isSerializableSectionEqual(
          previousHasSection ? previousSharedState[section] : undefined,
          nextHasSection ? nextSharedState[section] : undefined,
        )
      ) {
        changedSections.push(section);
      }
    });

    return normalizeChangedSectionEntries(changedSections);
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

  function addBootstrapMonthOffsetToPeriodId(periodId, monthOffset = 0) {
    const normalized = String(periodId || "").trim();
    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      return "";
    }
    const [yearText, monthText] = normalized.split("-");
    const cursor = new Date(
      Number.parseInt(yearText, 10),
      Number.parseInt(monthText, 10) - 1,
      1,
    );
    if (Number.isNaN(cursor.getTime())) {
      return "";
    }
    cursor.setMonth(cursor.getMonth() + Math.round(Number(monthOffset) || 0));
    return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  }

  function expandBootstrapRecordScopePeriodIds(range = {}, rawScope = {}) {
    const normalizedPeriodIds = normalizeBootstrapPeriodIds(range?.periodIds);
    const periodIds = new Set(normalizedPeriodIds);

    if (periodIds.size > 0) {
      normalizedPeriodIds.forEach((periodId) => {
        const previousPeriodId = addBootstrapMonthOffsetToPeriodId(periodId, -1);
        const nextPeriodId = addBootstrapMonthOffsetToPeriodId(periodId, 1);
        if (previousPeriodId) {
          periodIds.add(previousPeriodId);
        }
        if (nextPeriodId) {
          periodIds.add(nextPeriodId);
        }
      });
    } else {
      const startValue = rawScope?.startDate || rawScope?.start || null;
      const endValue = rawScope?.endDate || rawScope?.end || null;
      const startDate = storageBundle?.normalizeDateInput?.(startValue) || null;
      const endDate = storageBundle?.normalizeDateInput?.(endValue) || null;
      if (startDate && endDate) {
        const lower = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
        const upper = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
        const cursor = new Date(lower.getFullYear(), lower.getMonth() - 1, 1);
        const target = new Date(upper.getFullYear(), upper.getMonth() + 1, 1);
        while (cursor.getTime() <= target.getTime()) {
          periodIds.add(
            `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
          );
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }

    return normalizeBootstrapPeriodIds(Array.from(periodIds));
  }

  function bootstrapRecordOverlapsScope(record = {}, rawScope = {}) {
    const startValue = rawScope?.startDate || rawScope?.start || null;
    const endValue = rawScope?.endDate || rawScope?.end || null;
    const rangeStart = storageBundle?.normalizeDateInput?.(startValue) || null;
    const rangeEnd = storageBundle?.normalizeDateInput?.(endValue) || null;
    if (!rangeStart || !rangeEnd) {
      return true;
    }

    const lower = rangeStart.getTime() <= rangeEnd.getTime() ? rangeStart : rangeEnd;
    const upper = rangeStart.getTime() <= rangeEnd.getTime() ? rangeEnd : rangeStart;
    lower.setHours(0, 0, 0, 0);
    upper.setHours(23, 59, 59, 999);
    const upperExclusive = upper.getTime() + 1;

    const rawStart =
      storageBundle?.normalizeDateInput?.(record?.startTime) ||
      storageBundle?.normalizeDateInput?.(record?.timestamp) ||
      storageBundle?.normalizeDateInput?.(record?.endTime) ||
      null;
    const rawEnd =
      storageBundle?.normalizeDateInput?.(record?.endTime) ||
      storageBundle?.normalizeDateInput?.(record?.timestamp) ||
      storageBundle?.normalizeDateInput?.(record?.startTime) ||
      null;

    if (!rawStart && !rawEnd) {
      return false;
    }

    let startTime = rawStart ? rawStart.getTime() : rawEnd.getTime();
    let endTime = rawEnd ? rawEnd.getTime() : rawStart.getTime();
    if (endTime < startTime) {
      const swapped = startTime;
      startTime = endTime;
      endTime = swapped;
    }

    return endTime > lower.getTime() && startTime < upperExclusive;
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
      section === "records"
        ? expandBootstrapRecordScopePeriodIds(normalizedScope, scope)
        : normalizeBootstrapPeriodIds(normalizedScope.periodIds),
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
      if (section === "records") {
        return bootstrapRecordOverlapsScope(item, normalizedScope);
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
          : "obsidian-mono",
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
        checkinHistorySummary: normalizeCheckinHistorySummary(
          state?.checkinHistorySummary,
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
            ? cloneValue(enrichStorageStatusWithRecovery(extra.storageStatus, state))
            : null,
        autoBackupStatus:
          extra?.autoBackupStatus &&
          typeof extra.autoBackupStatus === "object" &&
          !Array.isArray(extra.autoBackupStatus)
            ? cloneValue(extra.autoBackupStatus)
            : null,
        recoverySummary: cloneValue(getRecoverySummaryFromState(state)),
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
          checkinHistorySummary: normalizeCheckinHistorySummary(
            legacyPageData.checkinHistorySummary ||
              fallback.data.checkinHistorySummary ||
              {},
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
    const coreStatePromise =
      typeof loaders?.getCoreState === "function"
        ? Promise.resolve().then(() => loaders.getCoreState())
        : Promise.resolve({});
    const shouldLoadStorageStatus = normalizedPage === "settings";
    const shouldLoadAutoBackupStatus = normalizedPage === "settings";
    const storageStatusPromise =
      shouldLoadStorageStatus && typeof loaders?.getStorageStatus === "function"
        ? Promise.resolve().then(() => loaders.getStorageStatus())
        : Promise.resolve(null);
    const autoBackupStatusPromise =
      shouldLoadAutoBackupStatus &&
      typeof loaders?.getAutoBackupStatus === "function"
        ? Promise.resolve().then(() => loaders.getAutoBackupStatus())
        : Promise.resolve(null);
    let primaryRangePromise = null;
    let secondaryRangePromise = null;
    let indexRecordScope = null;
    let planScope = null;
    let todoDailyCheckinScope = null;
    let todoCheckinScope = null;
    let diaryScope = null;
    let statsRecordScope = null;
    if (typeof loaders?.loadSectionRange === "function") {
      if (normalizedPage === "index") {
        indexRecordScope =
          options?.recordScope && typeof options.recordScope === "object"
            ? options.recordScope
            : buildRecentHoursBootstrapScope(48);
        primaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("records", indexRecordScope),
        );
      } else if (normalizedPage === "plan") {
        planScope =
          options?.planScope && typeof options.planScope === "object"
            ? options.planScope
            : Array.isArray(options?.periodIds) && options.periodIds.length
              ? { periodIds: options.periodIds }
              : buildCurrentMonthBootstrapScope();
        primaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("plans", planScope),
        );
      } else if (normalizedPage === "todo") {
        todoDailyCheckinScope =
          options?.dailyCheckinScope && typeof options.dailyCheckinScope === "object"
            ? options.dailyCheckinScope
            : buildCurrentDayBootstrapScope();
        todoCheckinScope =
          options?.checkinScope && typeof options.checkinScope === "object"
            ? options.checkinScope
            : buildCurrentMonthBootstrapScope();
        primaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("dailyCheckins", todoDailyCheckinScope),
        );
        secondaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("checkins", todoCheckinScope),
        );
      } else if (normalizedPage === "diary") {
        diaryScope =
          options?.diaryScope && typeof options.diaryScope === "object"
            ? options.diaryScope
            : Array.isArray(options?.periodIds) && options.periodIds.length
              ? { periodIds: options.periodIds }
              : buildCurrentMonthBootstrapScope();
        primaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("diaryEntries", diaryScope),
        );
      } else if (normalizedPage === "stats") {
        statsRecordScope =
          options?.recordScope && typeof options.recordScope === "object"
            ? options.recordScope
            : buildCurrentMonthBootstrapScope();
        primaryRangePromise = Promise.resolve().then(() =>
          loaders.loadSectionRange("records", statsRecordScope),
        );
      }
    }
    const [
      rawCoreState,
      storageStatus,
      autoBackupStatus,
      primaryRange,
      secondaryRange,
    ] = await Promise.all([
      coreStatePromise,
      storageStatusPromise,
      autoBackupStatusPromise,
      primaryRangePromise || Promise.resolve(null),
      secondaryRangePromise || Promise.resolve(null),
    ]);
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
      storageStatus,
      autoBackupStatus,
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
      const range = primaryRange;
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
      const range = primaryRange;
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
      const dailyRange = primaryRange;
      const checkinRange = secondaryRange;
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
          checkinHistorySummary: normalizeCheckinHistorySummary(
            coreState?.checkinHistorySummary ||
              fallback.data.checkinHistorySummary ||
              {},
          ),
          todayDailyCheckins: cloneValue(dailyRange?.items || []),
          recentCheckins: cloneValue(checkinRange?.items || []),
        },
      }).envelope;
    }

    if (normalizedPage === "diary") {
      const range = primaryRange;
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
      const range = primaryRange;
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

  function isEquivalentVersionProbeTransition(previousProbe = null, nextProbe = null) {
    const previous = normalizeVersionProbe(previousProbe, cachedStatus);
    const next = normalizeVersionProbe(nextProbe, cachedStatus);
    if (!previous || !next) {
      return false;
    }
    if (previous.fingerprint === next.fingerprint) {
      return true;
    }
    const previousBundleStorage =
      typeof previous.storageMode === "string" &&
      previous.storageMode.includes("bundle");
    const nextBundleStorage =
      typeof next.storageMode === "string" && next.storageMode.includes("bundle");
    if (!previousBundleStorage && !nextBundleStorage) {
      return false;
    }
    if (!previous.actualUri || previous.actualUri !== next.actualUri) {
      return false;
    }
    if (previous.modifiedAt <= 0 || previous.modifiedAt !== next.modifiedAt) {
      return false;
    }
    return true;
  }

  function createSourceSyncResult(state, status) {
    return {
      state: cloneValue(state),
      status: cloneValue(enrichStorageStatusWithRecovery(status, state)),
    };
  }

  let lastStorageSyncErrorSignature = "";
  let lastStorageRecoveryNoticeSignature = "";
  const STORAGE_LOCAL_ECHO_IGNORE_WINDOW_MS = 4200;
  const STORAGE_LOCAL_ECHO_IGNORE_MAX_USES = 6;
  let recentLocalStorageEchoEvents = [];

  function clearStorageSyncError() {
    lastStorageSyncErrorSignature = "";
  }

  function buildRecentLocalStorageEchoSignature(
    changedSections = [],
    changedPeriods = {},
  ) {
    const normalizedChangedSections = normalizeChangedSectionEntries(changedSections);
    const normalizedChangedPeriods = normalizeChangedPeriodEntries(changedPeriods);
    if (
      !normalizedChangedSections.length &&
      !Object.keys(normalizedChangedPeriods).length
    ) {
      return "";
    }
    return JSON.stringify({
      changedSections: normalizedChangedSections,
      changedPeriods: normalizedChangedPeriods,
    });
  }

  function pruneRecentLocalStorageEchoEvents(now = Date.now()) {
    recentLocalStorageEchoEvents = recentLocalStorageEchoEvents.filter(
      (entry) => Number(entry?.expiresAt) > now,
    );
  }

  function rememberRecentLocalStorageEcho(metadata = {}) {
    const signature = buildRecentLocalStorageEchoSignature(
      metadata?.changedSections,
      metadata?.changedPeriods,
    );
    if (!signature) {
      return;
    }
    const now = Date.now();
    pruneRecentLocalStorageEchoEvents(now);
    recentLocalStorageEchoEvents.push({
      signature,
      expiresAt: now + STORAGE_LOCAL_ECHO_IGNORE_WINDOW_MS,
      remainingUses: STORAGE_LOCAL_ECHO_IGNORE_MAX_USES,
    });
  }

  function shouldIgnoreRecentLocalStorageEcho(detail = {}) {
    const reason =
      typeof detail?.reason === "string" ? detail.reason.trim().toLowerCase() : "";
    if (reason === "initial-sync") {
      return false;
    }
    const source =
      typeof detail?.source === "string" ? detail.source.trim().toLowerCase() : "";
    if (
      source &&
      !source.includes("renderer") &&
      !source.includes("webview")
    ) {
      return false;
    }
    const signature = buildRecentLocalStorageEchoSignature(
      detail?.changedSections,
      detail?.changedPeriods,
    );
    if (!signature) {
      return false;
    }
    const now = Date.now();
    pruneRecentLocalStorageEchoEvents(now);
    const matchIndex = recentLocalStorageEchoEvents.findIndex(
      (entry) => entry.signature === signature,
    );
    if (matchIndex === -1) {
      return false;
    }
    const match = recentLocalStorageEchoEvents[matchIndex];
    if (
      !match ||
      !Number.isFinite(match.remainingUses) ||
      match.remainingUses <= 1
    ) {
      recentLocalStorageEchoEvents.splice(matchIndex, 1);
    } else {
      match.remainingUses -= 1;
    }
    return true;
  }

  function maybeNotifyStorageRecoveryStatus(status) {
    const normalizedStatus = enrichStorageStatusWithRecovery(status);
    const recoveryState =
      typeof normalizedStatus?.recoveryState === "string"
        ? normalizedStatus.recoveryState.trim()
        : "";
    const recoveryMessage =
      typeof normalizedStatus?.recoveryMessage === "string"
        ? normalizedStatus.recoveryMessage.trim()
        : "";
    const hardInvalidCount = Number.isFinite(
      normalizedStatus?.recoverySummary?.hardInvalidCount,
    )
      ? Math.max(0, Number(normalizedStatus.recoverySummary.hardInvalidCount))
      : 0;
    if (!recoveryState || recoveryState === "ok") {
      lastStorageRecoveryNoticeSignature = "";
      return;
    }

    const noticeMessage =
      recoveryMessage ||
      (recoveryState === "repaired"
        ? "检测到存储文件不完整，现有数据已自动修复。"
        : hardInvalidCount > 0
          ? `检测到 ${hardInvalidCount} 项高风险脏数据，已停止自动写入，避免现有数据被清空。`
          : "检测到存储仍需恢复，已停止自动写入，避免现有数据被清空。");
    const signature = `${recoveryState}:${noticeMessage}`;
    if (signature === lastStorageRecoveryNoticeSignature) {
      return;
    }
    lastStorageRecoveryNoticeSignature = signature;

    if (recoveryState !== "needs-recovery") {
      return;
    }

    if (document.hidden) {
      return;
    }

    if (typeof window.ControlerUI?.alertDialog === "function") {
      void window.ControlerUI
        .alertDialog({
          title:
            recoveryState === "repaired" ? "存储已修复" : "存储需要恢复",
          message: noticeMessage,
          confirmText: "知道了",
          danger: recoveryState === "needs-recovery",
        })
        .catch(() => {});
      return;
    }

    if (typeof window.alert === "function") {
      window.setTimeout(() => {
        try {
          window.alert(noticeMessage);
        } catch (error) {
          console.error("显示存储恢复提示失败:", error);
        }
      }, 0);
    }
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
      getRawLocalItem(key) {
        return nativeMethods.getItem?.call(window.localStorage, key) ?? null;
      },
      setRawLocalItem(key, value) {
        if (value === undefined) {
          nativeMethods.removeItem?.call(window.localStorage, key);
          return;
        }
        nativeMethods.setItem?.call(window.localStorage, key, String(value));
      },
      removeRawLocalItem(key) {
        nativeMethods.removeItem?.call(window.localStorage, key);
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
      getStateValue(key) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return undefined;
        }
        return cloneValue(
          safeDeserialize(window.localStorage.getItem(normalizedKey)),
        );
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
      async pickDiaryImages(options = {}) {
        if (typeof extra.pickDiaryImages === "function") {
          return extra.pickDiaryImages(options);
        }
        return null;
      },
      async saveDiaryImageAsset(options = {}) {
        if (typeof extra.saveDiaryImageAsset === "function") {
          return extra.saveDiaryImageAsset(options);
        }
        return null;
      },
      async resolveDiaryImageUri(options = {}) {
        if (typeof extra.resolveDiaryImageUri === "function") {
          return extra.resolveDiaryImageUri(options);
        }
        return null;
      },
      async deleteDiaryImageAssets(options = {}) {
        if (typeof extra.deleteDiaryImageAssets === "function") {
          return extra.deleteDiaryImageAssets(options);
        }
        return {
          deletedAssetIds: [],
          remainingAssetCount: 0,
        };
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
          originPageInstanceId:
            typeof metadata.originPageInstanceId === "string"
              ? metadata.originPageInstanceId
              : "",
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

  function createSaveCoordinator(runTask) {
    if (typeof runTask !== "function") {
      return {
        enqueue() {
          return Promise.resolve(null);
        },
        flush() {
          return Promise.resolve(null);
        },
        hasPending() {
          return false;
        },
      };
    }

    const entries = new Map();
    const normalizeScope = (scope) => {
      if (Array.isArray(scope)) {
        const joinedScope = scope
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(":");
        return joinedScope || "global";
      }
      const normalized = String(scope || "").trim();
      return normalized || "global";
    };
    const ensureEntry = (scopeKey) => {
      if (!entries.has(scopeKey)) {
        entries.set(scopeKey, {
          pending: false,
          activePromise: null,
          reason: "save",
          retryDelayMs: SAVE_COORDINATOR_RETRY_DELAY_MS,
        });
      }
      return entries.get(scopeKey);
    };
    const drainEntry = (scopeKey, entry) => {
      if (entry.activePromise) {
        return entry.activePromise;
      }
      entry.activePromise = Promise.resolve()
        .then(async () => {
          let lastResult = null;
          while (entry.pending) {
            entry.pending = false;
            const currentReason = entry.reason || "save";
            try {
              lastResult = await runTask({
                scope: scopeKey,
                reason: currentReason,
              });
              entry.retryDelayMs = SAVE_COORDINATOR_RETRY_DELAY_MS;
            } catch (error) {
              entry.pending = true;
              const retryDelayMs = entry.retryDelayMs;
              entry.retryDelayMs = Math.min(retryDelayMs * 2, 2000);
              window.setTimeout(() => {
                if (!entry.activePromise && entry.pending) {
                  void drainEntry(scopeKey, entry).catch(() => {});
                }
              }, retryDelayMs);
              throw error;
            }
          }
          return lastResult;
        })
        .finally(() => {
          entry.activePromise = null;
          if (!entry.pending) {
            entries.delete(scopeKey);
          }
        });
      return entry.activePromise;
    };

    return {
      enqueue(reason = "save", scope = "global") {
        const scopeKey = normalizeScope(scope);
        const entry = ensureEntry(scopeKey);
        entry.pending = true;
        entry.reason =
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : entry.reason || "save";
        return drainEntry(scopeKey, entry);
      },
      flush(reason = "save", scope = "global") {
        return this.enqueue(reason, scope);
      },
      hasPending(scope = null) {
        if (scope === null || typeof scope === "undefined") {
          return Array.from(entries.values()).some(
            (entry) => entry.pending || !!entry.activePromise,
          );
        }
        const scopeKey = normalizeScope(scope);
        const entry = entries.get(scopeKey);
        return !!entry && (entry.pending || !!entry.activePromise);
      },
    };
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
      const currentValue = Object.prototype.hasOwnProperty.call(state, normalizedKey)
        ? state[normalizedKey]
        : null;
      const currentSnapshot = safeSerialize(currentValue);
      const nextSnapshot = safeSerialize(nextValue);
      if (currentSnapshot === nextSnapshot) {
        if (SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey)) {
          const mirroredValue = readRawLocalOnlyValue(normalizedKey);
          if (safeSerialize(mirroredValue) !== nextSnapshot) {
            writeRawLocalOnlyValue(normalizedKey, nextValue);
          }
        }
        return;
      }
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
      const hasCurrentValue = Object.prototype.hasOwnProperty.call(state, normalizedKey);
      const mirroredValue = SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey)
        ? readRawLocalOnlyValue(normalizedKey)
        : undefined;
      if (
        !hasCurrentValue &&
        (!SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey) ||
          typeof mirroredValue === "undefined")
      ) {
        return;
      }
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

    function hashLocalStorageKeyText(text = "") {
      const source = String(text || "");
      let hash = 0;
      for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
      }
      return hash.toString(36);
    }

    function normalizeTrustedRecordBootstrapPageKey(pageKey) {
      const normalizedPage = normalizePageBootstrapKey(pageKey);
      return normalizedPage === "index" || normalizedPage === "stats"
        ? normalizedPage
        : "";
    }

    function normalizeTrustedRecordBootstrapScope(scope = {}) {
      if (scope?.all === true) {
        return {
          all: true,
        };
      }
      const normalizedRange =
        storageBundle?.normalizeRangeInput?.(scope) || {
          periodIds: Array.isArray(scope?.periodIds) ? scope.periodIds : [],
          startDate: scope?.startDate || scope?.start || null,
          endDate: scope?.endDate || scope?.end || null,
        };
      const normalizedPeriodIds = Array.isArray(normalizedRange?.periodIds)
        ? normalizedRange.periodIds
            .map((periodId) => String(periodId || "").trim())
            .filter(Boolean)
        : [];
      const normalizedScope = {
        periodIds: Array.from(new Set(normalizedPeriodIds)).sort(),
      };
      const startDate =
        typeof normalizedRange?.startDate === "string"
          ? normalizedRange.startDate.trim()
          : String(normalizedRange?.startDate || "").trim();
      const endDate =
        typeof normalizedRange?.endDate === "string"
          ? normalizedRange.endDate.trim()
          : String(normalizedRange?.endDate || "").trim();
      if (startDate) {
        normalizedScope.startDate = startDate;
      }
      if (endDate) {
        normalizedScope.endDate = endDate;
      }
      if (
        !normalizedScope.startDate &&
        !normalizedScope.endDate &&
        normalizedScope.periodIds.length === 0
      ) {
        return null;
      }
      return normalizedScope;
    }

    function getTrustedRecordBootstrapCurrentFingerprint() {
      return typeof cachedStatus?.fingerprint === "string"
        ? cachedStatus.fingerprint.trim()
        : "";
    }

    function getTrustedRecordBootstrapStorageKey(pageKey, recordScope) {
      const normalizedPage = normalizeTrustedRecordBootstrapPageKey(pageKey);
      const normalizedScope = normalizeTrustedRecordBootstrapScope(recordScope);
      if (!normalizedPage || !normalizedScope) {
        return "";
      }
      return `${LOCAL_ONLY_STORAGE_PREFIX}trusted-record-bootstrap:${normalizedPage}:${hashLocalStorageKeyText(
        safeSerialize({
          page: normalizedPage,
          recordScope: normalizedScope,
        }),
      )}`;
    }

    function normalizeTrustedRecordBootstrapEnvelope(pageKey, value = {}, options = {}) {
      const normalizedPage = normalizeTrustedRecordBootstrapPageKey(pageKey);
      const sourceValue =
        value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const normalizedScope = normalizeTrustedRecordBootstrapScope(
        sourceValue.recordScope || options.recordScope || options.scope || {},
      );
      if (!normalizedPage || !normalizedScope) {
        return null;
      }
      return {
        page: normalizedPage,
        recordScope: normalizedScope,
        sourceFingerprint:
          typeof sourceValue.sourceFingerprint === "string" &&
          sourceValue.sourceFingerprint.trim()
            ? sourceValue.sourceFingerprint.trim()
            : typeof options.sourceFingerprint === "string" &&
                options.sourceFingerprint.trim()
              ? options.sourceFingerprint.trim()
              : getTrustedRecordBootstrapCurrentFingerprint(),
        builtAt:
          typeof sourceValue.builtAt === "string" && sourceValue.builtAt
            ? sourceValue.builtAt
            : new Date().toISOString(),
        loadedPeriodIds: normalizeBootstrapPeriodIds(
          Array.isArray(sourceValue.loadedPeriodIds)
            ? sourceValue.loadedPeriodIds
            : options.loadedPeriodIds,
        ),
        projects: cloneValue(
          Array.isArray(sourceValue.projects)
            ? sourceValue.projects
            : Array.isArray(options.projects)
              ? options.projects
              : [],
        ),
        records: cloneValue(
          Array.isArray(sourceValue.records)
            ? sourceValue.records
            : Array.isArray(options.records)
              ? options.records
              : [],
        ),
      };
    }

    function readTrustedRecordBootstrapEnvelope(pageKey, options = {}) {
      const storageKey = getTrustedRecordBootstrapStorageKey(
        pageKey,
        options.recordScope || options.scope || {},
      );
      if (!storageKey) {
        return null;
      }
      const rawValue = nativeMethods.getItem?.call(window.localStorage, storageKey);
      if (rawValue === null || rawValue === undefined) {
        return null;
      }
      const parsed = safeDeserialize(rawValue);
      if (!isPlainObject(parsed)) {
        nativeMethods.removeItem?.call(window.localStorage, storageKey);
        return null;
      }
      const envelope = normalizeTrustedRecordBootstrapEnvelope(pageKey, parsed, options);
      if (!envelope) {
        nativeMethods.removeItem?.call(window.localStorage, storageKey);
        return null;
      }
      const requestedScope = normalizeTrustedRecordBootstrapScope(
        options.recordScope || options.scope || {},
      );
      if (safeSerialize(envelope.recordScope) !== safeSerialize(requestedScope)) {
        return null;
      }
      const currentFingerprint = getTrustedRecordBootstrapCurrentFingerprint();
      const envelopeFingerprint = String(envelope.sourceFingerprint || "").trim();
      if (
        currentFingerprint &&
        (!envelopeFingerprint || currentFingerprint !== envelopeFingerprint)
      ) {
        nativeMethods.removeItem?.call(window.localStorage, storageKey);
        return null;
      }
      return envelope;
    }

    function writeTrustedRecordBootstrapEnvelope(pageKey, value = {}, options = {}) {
      const envelope = normalizeTrustedRecordBootstrapEnvelope(pageKey, value, options);
      if (!envelope) {
        return null;
      }
      const storageKey = getTrustedRecordBootstrapStorageKey(
        pageKey,
        envelope.recordScope,
      );
      if (!storageKey) {
        return null;
      }
      nativeMethods.setItem?.call(
        window.localStorage,
        storageKey,
        safeSerialize(envelope),
      );
      return envelope;
    }

    function removeTrustedRecordBootstrapEnvelope(pageKey, options = {}) {
      const storageKey = getTrustedRecordBootstrapStorageKey(
        pageKey,
        options.recordScope || options.scope || {},
      );
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
      shouldIgnoreRecentLocalEcho(detail = {}) {
        return shouldIgnoreRecentLocalStorageEcho(detail);
      },
      markRecentLocalEcho(metadata = {}) {
        rememberRecentLocalStorageEcho(metadata);
      },
      dump() {
        return buildCurrentMergedState();
      },
      getStateValue(key) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return undefined;
        }
        return cloneValue(readState()?.[normalizedKey]);
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
      peekTrustedRecordBootstrapState(pageKey, options = {}) {
        const envelope = readTrustedRecordBootstrapEnvelope(pageKey, options);
        return envelope ? cloneValue(envelope) : null;
      },
      getTrustedRecordBootstrapStateSync(pageKey, options = {}) {
        return this.peekTrustedRecordBootstrapState(pageKey, options);
      },
      async getTrustedRecordBootstrapState(pageKey, options = {}) {
        return this.peekTrustedRecordBootstrapState(pageKey, options);
      },
      async setTrustedRecordBootstrapState(pageKey, value = {}, options = {}) {
        const envelope = writeTrustedRecordBootstrapEnvelope(pageKey, value, options);
        return envelope ? cloneValue(envelope) : null;
      },
      async removeTrustedRecordBootstrapState(pageKey, options = {}) {
        return removeTrustedRecordBootstrapEnvelope(pageKey, options);
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

    window.ControlerStorage.saveCoordinator = createSaveCoordinator(
      async ({ reason = "save", scope = "global" } = {}) => {
        if (typeof window.ControlerStorage?.flushJournal === "function") {
          return window.ControlerStorage.flushJournal({
            reason,
            scope,
          });
        }
        if (typeof window.ControlerStorage?.flush === "function") {
          return window.ControlerStorage.flush();
        }
        return null;
      },
    );

    Object.keys(extraMethods).forEach((key) => {
      if (typeof extraMethods[key] === "function") {
        window.ControlerStorage[key] = extraMethods[key];
      }
    });
    window.ControlerStorage.getRawLocalItem = function getRawLocalItem(key) {
      return nativeMethods.getItem?.call(window.localStorage, key) ?? null;
    };
    window.ControlerStorage.setRawLocalItem = function setRawLocalItem(key, value) {
      if (value === undefined) {
        nativeMethods.removeItem?.call(window.localStorage, key);
        return;
      }
      nativeMethods.setItem?.call(window.localStorage, key, String(value));
    };
    window.ControlerStorage.removeRawLocalItem = function removeRawLocalItem(key) {
      nativeMethods.removeItem?.call(window.localStorage, key);
    };
  }

  if (!nativeStoragePrototype) {
    window.ControlerStorage = createNativeStorageApi({
      capabilities: resolvedRuntimeCapabilities,
    });
    window.ControlerStorage.saveCoordinator = createSaveCoordinator(
      async ({ reason = "save", scope = "global" } = {}) =>
        window.ControlerStorage.flushJournal?.({
          reason,
          scope,
        }) || window.ControlerStorage.flush?.(),
    );
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
    let electronRetryTimer = 0;
    let electronRetryDelayMs = SAVE_COORDINATOR_RETRY_DELAY_MS;

    function readState() {
      if (cachedState) {
        return cachedState;
      }

      try {
        const rawState = electronAPI.storageLoadSync() || {};
        adoptLegacyLocalOnlyValues(rawState);
        cachedState = normalizeState(rawState, {
          useStateRecordsForProjectNormalization: true,
        });
        persistSharedBootstrapMirrors(cachedState);
      } catch (error) {
        console.error("同步读取 Electron 存储失败，保留当前内存状态:", error);
        if (!cachedState) {
          cachedState = normalizeState({
            protectionMode: "readonly_due_to_load_failure",
          });
        }
      }

      return cachedState;
    }

    function buildCurrentElectronMergedState() {
      return buildMergedState(readState(), {
        includeAliases: true,
      });
    }

    function assignState(nextState) {
      adoptLegacyLocalOnlyValues(nextState);
      cachedState = normalizeState(nextState, {
        useStateRecordsForProjectNormalization: true,
      });
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

    function clearElectronRetryTimer() {
      if (electronRetryTimer) {
        window.clearTimeout(electronRetryTimer);
        electronRetryTimer = 0;
      }
      electronRetryDelayMs = SAVE_COORDINATOR_RETRY_DELAY_MS;
    }

    function scheduleElectronFlushRetry() {
      if (electronRetryTimer || !hasPendingStateChanges) {
        return;
      }
      const retryDelayMs = electronRetryDelayMs;
      electronRetryDelayMs = Math.min(retryDelayMs * 2, 2000);
      electronRetryTimer = window.setTimeout(() => {
        electronRetryTimer = 0;
        writeChain = writeChain
          .then(async () => {
            if (!hasPendingStateChanges) {
              return cachedStatus;
            }
            return flushElectronState();
          })
          .catch((error) => {
            console.error("重试 Electron 存储刷新失败:", error);
            scheduleElectronFlushRetry();
            return cachedStatus;
          });
      }, retryDelayMs);
    }

    async function flushElectronState() {
      const pendingChangeMetadata = peekPendingElectronStorageChangeMetadata();
      const nextState = normalizeState(readState(), {
        useStateRecordsForProjectNormalization: true,
        touchModified: true,
        touchSyncSave: true,
      });
      cachedState = nextState;
      try {
        await electronAPI.storageSaveSnapshot(nextState, {
          reason: pendingElectronWriteReason || "save",
          changedSections: pendingChangeMetadata.changedSections,
          changedPeriods: pendingChangeMetadata.changedPeriods,
        });
        const nextStatus = await electronAPI.storageFlush();
        if (!nextStatus || typeof nextStatus !== "object") {
          throw new Error("刷新 Electron 存储未返回有效状态。");
        }
        cachedStatus = nextStatus;
        maybeNotifyStorageRecoveryStatus(cachedStatus);
        hasPendingStateChanges = false;
        pendingElectronWriteReason = "";
        clearPendingElectronStorageChangeMetadata();
        clearElectronRetryTimer();
        return cachedStatus;
      } catch (error) {
        hasPendingStateChanges = true;
        scheduleElectronFlushRetry();
        throw error;
      }
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
            scheduleElectronFlushRetry();
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
          console.error("异步读取 Electron 存储失败，保留当前内存快照:", error);
          return readState();
        })) || {};
      adoptLegacyLocalOnlyValues(nextRawState);
      const nextState = normalizeState(nextRawState, {
        useStateRecordsForProjectNormalization: true,
      });
      cachedState = nextState;
      persistSharedBootstrapMirrors(nextState);
      const nextSnapshot = createComparableSnapshot(nextState);
      const nextStatus =
        options.status ||
        (await electronAPI.storageStatus().catch((error) => {
          console.error("获取 Electron 存储状态失败:", error);
          return null;
        }));
      cachedStatus = enrichStorageStatusWithRecovery(nextStatus, nextState);
      maybeNotifyStorageRecoveryStatus(cachedStatus);

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
          cachedStatus = enrichStorageStatusWithRecovery(
            await electronAPI.storageStatus().catch((error) => {
              console.error("获取 Electron 存储状态失败:", error);
              return null;
            }),
            cachedState || readState(),
          );
          maybeNotifyStorageRecoveryStatus(cachedStatus);
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
          cachedStatus = enrichStorageStatusWithRecovery(
            await electronAPI.storageStatus(),
            cachedState || readState(),
          );
          maybeNotifyStorageRecoveryStatus(cachedStatus);
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
          const changedSections = normalizeChangedSectionEntries(
            parsedResult.changedSections || metadata.changedSections,
          );
          const changedPeriods = normalizeChangedPeriodEntries(
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
        cachedStatus = enrichStorageStatusWithRecovery(
          await electronAPI.storageStatus().catch((error) => {
            console.error("获取 Electron 存储状态失败:", error);
            return null;
          }),
          cachedState || readState(),
        );
        maybeNotifyStorageRecoveryStatus(cachedStatus);
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
                buildCurrentElectronMergedState(),
                {
                  storageStatus: cachedStatus,
                },
              );
            } catch (error) {
              console.error("同步读取 Electron 页面引导状态失败，回退内存快照:", error);
            }
          }
          return buildPageBootstrapStateFromState(
            buildCurrentElectronMergedState(),
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
                buildCurrentElectronMergedState(),
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
                fallbackState: buildCurrentElectronMergedState(),
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
        async pickDiaryImages(options = {}) {
          return pickDiaryImagesFromBrowser(options);
        },
        async saveDiaryImageAsset(options = {}) {
          if (typeof electronAPI.storageSaveDiaryImageAsset !== "function") {
            return null;
          }
          const result = await electronAPI.storageSaveDiaryImageAsset(options);
          if (
            result &&
            typeof result === "object" &&
            typeof result.assetId === "string" &&
            result.assetId.trim()
          ) {
            const currentState = readState();
            const existingAssets = Array.isArray(currentState?.diaryMediaAssets)
              ? currentState.diaryMediaAssets.filter(
                  (entry) => entry?.assetId !== result.assetId,
                )
              : [];
            assignState({
              ...currentState,
              diaryMediaAssets: [...existingAssets, cloneValue(result)],
            });
          }
          return result;
        },
        async resolveDiaryImageUri(options = {}) {
          if (typeof electronAPI.storageResolveDiaryImageUri !== "function") {
            return null;
          }
          return electronAPI.storageResolveDiaryImageUri(options);
        },
        async deleteDiaryImageAssets(options = {}) {
          if (typeof electronAPI.storageDeleteDiaryImageAssets !== "function") {
            return {
              deletedAssetIds: [],
              remainingAssetCount: 0,
            };
          }
          const result = await electronAPI.storageDeleteDiaryImageAssets(options);
          const deletedAssetIds = new Set(
            (Array.isArray(result?.deletedAssetIds) ? result.deletedAssetIds : [])
              .map((assetId) => String(assetId || "").trim())
              .filter(Boolean),
          );
          if (deletedAssetIds.size > 0) {
            const currentState = readState();
            assignState({
              ...currentState,
              diaryMediaAssets: Array.isArray(currentState?.diaryMediaAssets)
                ? currentState.diaryMediaAssets.filter(
                    (entry) => !deletedAssetIds.has(String(entry?.assetId || "").trim()),
                  )
                : [],
            });
          }
          return result;
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
            clearElectronRetryTimer();
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

    const forceFlushElectronStorage = (reason = "forced-persist") => {
      const saveCoordinator = window.ControlerStorage?.saveCoordinator;
      if (saveCoordinator && typeof saveCoordinator.enqueue === "function") {
        void saveCoordinator.enqueue(reason, "electron-lifecycle").catch((error) => {
          console.error("强制立即保存 Electron 存储失败:", error);
        });
        return;
      }
      void window.ControlerStorage
        ?.flushJournal?.({
          reason,
        })
        ?.catch((error) => {
          console.error("强制立即保存 Electron 存储失败:", error);
        });
    };

    window.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        forceFlushElectronStorage("visibility-hidden");
      }
    });
    window.addEventListener("pagehide", () => {
      forceFlushElectronStorage("pagehide");
    });
    window.addEventListener("beforeunload", () => {
      window.clearTimeout(writeTimer);
      forceFlushElectronStorage("beforeunload");
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
      useStateRecordsForProjectNormalization: true,
      ...extra,
    });

    function readLegacyBrowserBootstrapState() {
      const rawRoot =
        nativeMethods.getItem?.call(window.localStorage, BROWSER_STATE_KEY) || "";
      const migratedState = normalizeState({}, buildLegacyBrowserMetadata());
      const migratedKeys = [];
      const migratedSharedKeys = new Set();
      let shouldRewriteRoot = false;

      if (typeof rawRoot === "string" && rawRoot.trim()) {
        const parsedRootState = parseJsonSafely(rawRoot, {});
        adoptLegacyLocalOnlyValues(parsedRootState);
        Object.keys(parsedRootState).forEach((key) => {
          if (isSharedStateKey(key)) {
            migratedSharedKeys.add(key);
          }
        });
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
          migratedSharedKeys.add(key);
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
        sharedKeys: Array.from(migratedSharedKeys),
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
    const initialMirrorPendingSessionId =
      nativeMethods.getItem?.call(
        window.localStorage,
        MOBILE_MIRROR_PENDING_SESSION_KEY,
      ) || "";
    const initialMirrorCoverageRaw =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_COVERAGE_KEY) || "";
    const initialMirrorPendingWrite =
      initialMirrorPendingWriteRaw === "1" ||
      initialMirrorPendingWriteRaw === "true";
    const shouldDiscardInitialPendingWrite =
      initialMirrorPendingWrite &&
      !!REACT_NATIVE_RUNTIME_SESSION_ID &&
      initialMirrorPendingSessionId !== REACT_NATIVE_RUNTIME_SESSION_ID;
    if (shouldDiscardInitialPendingWrite) {
      try {
        nativeMethods.setItem?.call(
          window.localStorage,
          MOBILE_MIRROR_PENDING_WRITE_KEY,
          "0",
        );
        nativeMethods.removeItem?.call(
          window.localStorage,
          MOBILE_MIRROR_PENDING_SESSION_KEY,
        );
        nativeMethods.removeItem?.call(
          window.localStorage,
          MOBILE_MIRROR_COVERAGE_KEY,
        );
      } catch (error) {
        console.warn("清理失效的移动端 pending 镜像标记失败:", error);
      }
      emitStorageDebug("discard-stale-pending-mirror", {
        runtimeSessionId: REACT_NATIVE_RUNTIME_SESSION_ID,
        pendingOwnerSessionId: String(initialMirrorPendingSessionId || "").trim(),
        hasMirrorState: !!initialMirrorStateRaw.trim(),
      });
      emitStoragePerfMetric("storage-sync-discard-stale-pending-mirror", {
        runtimeSessionId: REACT_NATIVE_RUNTIME_SESSION_ID,
        pendingOwnerSessionId: String(initialMirrorPendingSessionId || "").trim(),
        hasMirrorState: !!initialMirrorStateRaw.trim(),
      });
    }
    const initialMirrorState = parseJsonSafely(
      initialMirrorStateRaw,
      {},
    );
    adoptLegacyLocalOnlyValues(initialMirrorState);
    const initialMirrorComparableSnapshot = createComparableSnapshot(
      normalizeState(initialMirrorState, {
        platform,
        useStateRecordsForProjectNormalization: false,
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
    const shouldSeedMirrorFromLegacyBrowserBootstrap =
      shouldAdoptLegacyBrowserBootstrap &&
      (
        !initialMirrorStateRaw.trim() ||
        initialMirrorComparableSnapshot === emptyComparableSnapshot
      );
    const initialPendingSharedKeys = [];
    const initialBootstrapState = shouldAdoptLegacyBrowserBootstrap
      ? legacyBrowserBootstrap.state
      : initialMirrorState;
    const initialPendingWrite =
      initialMirrorPendingWrite && !shouldDiscardInitialPendingWrite;
    const effectiveInitialMirrorCoverageRaw = initialMirrorPendingWrite
      ? ""
      : initialMirrorCoverageRaw;
    let cachedState = normalizeState(initialBootstrapState, {
      platform,
      useStateRecordsForProjectNormalization: false,
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
    let pendingNativeSelfChangeFingerprintAckUntil = 0;
    let lastFallbackHashProbeAt = 0;
    let lastWrittenComparableSnapshot = initialPendingWrite
      ? ""
      : createComparableSnapshot(cachedState);
    let lastMirroredStateJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATE_KEY) || "";
    let lastMirroredStatusJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATUS_KEY) || "";
    let lastMirroredCoverageJson = effectiveInitialMirrorCoverageRaw;
    let lastMirroredPendingWriteValue = initialPendingWrite ? "1" : "0";
    let lastMirroredPendingSessionId = initialPendingWrite
      ? String(initialMirrorPendingSessionId || "").trim()
      : "";
    let hasPendingStateChanges = initialPendingWrite;
    let managedStateRevision = initialPendingWrite ? 1 : 0;
    let lastKnownVersionProbe = normalizeVersionProbe(cachedStatus, cachedStatus);
    let nativeBaselineFingerprint = lastKnownVersionProbe?.fingerprint || "";
    const nativeSyncBootstrapStartedAt = Date.now();
    let nativeInitializationSettled = false;
    let pendingForegroundSyncRequest = null;
    const initialShellVisibilityState =
      window.__CONTROLER_SHELL_VISIBILITY__ &&
      typeof window.__CONTROLER_SHELL_VISIBILITY__ === "object"
        ? window.__CONTROLER_SHELL_VISIBILITY__
        : null;
    let shellPageActive = initialShellVisibilityState?.active !== false;
    const MANAGED_RANGE_SECTIONS = [
      "records",
      "dailyCheckins",
      "checkins",
      "plans",
      "diaryEntries",
    ];
    let hasManagedCoreSnapshot =
      !!initialMirrorStateRaw.trim() || shouldAdoptLegacyBrowserBootstrap;
    let preferProbeOnlyOnFirstShellResume =
      initialShellVisibilityState?.active === false &&
      hasManagedCoreSnapshot &&
      !initialPendingWrite;
    let managedFullyHydratedSections = new Set();
    let managedSectionCoverage = {};
    let pendingNativeSharedKeyWrites = new Set(initialPendingSharedKeys);
    let pendingNativeStorageChangedSections = new Set();
    let pendingNativeStorageChangedPeriods = {};
    let nativeFullStateRewriteRequested = false;

    if (shouldSeedMirrorFromLegacyBrowserBootstrap) {
      try {
        const seededMirrorStateJson = JSON.stringify(cachedState);
        nativeMethods.setItem?.call(
          window.localStorage,
          MOBILE_MIRROR_STATE_KEY,
          seededMirrorStateJson,
        );
        lastMirroredStateJson = seededMirrorStateJson;
        nativeMethods.setItem?.call(
          window.localStorage,
          MOBILE_MIRROR_PENDING_WRITE_KEY,
          initialPendingWrite ? "1" : "0",
        );
        lastMirroredPendingWriteValue = initialPendingWrite ? "1" : "0";
        if (initialPendingWrite && REACT_NATIVE_RUNTIME_SESSION_ID) {
          nativeMethods.setItem?.call(
            window.localStorage,
            MOBILE_MIRROR_PENDING_SESSION_KEY,
            REACT_NATIVE_RUNTIME_SESSION_ID,
          );
          lastMirroredPendingSessionId = REACT_NATIVE_RUNTIME_SESSION_ID;
        } else {
          nativeMethods.removeItem?.call(
            window.localStorage,
            MOBILE_MIRROR_PENDING_SESSION_KEY,
          );
          lastMirroredPendingSessionId = "";
        }
      } catch (error) {
        console.error("写入移动端 legacy 启动镜像失败:", error);
      }
    }

    function createManagedSectionCoverage() {
      return MANAGED_RANGE_SECTIONS.reduce((coverage, section) => {
        coverage[section] = new Set();
        return coverage;
      }, {});
    }

    function cloneManagedSectionCoverage(sourceCoverage = managedSectionCoverage) {
      const nextCoverage = createManagedSectionCoverage();
      MANAGED_RANGE_SECTIONS.forEach((section) => {
        const sourcePeriods = sourceCoverage?.[section];
        if (!(sourcePeriods instanceof Set)) {
          return;
        }
        sourcePeriods.forEach((periodId) => {
          const normalizedPeriodId = String(periodId || "").trim();
          if (normalizedPeriodId) {
            nextCoverage[section].add(normalizedPeriodId);
          }
        });
      });
      return nextCoverage;
    }

    function normalizeManagedMirrorCoverageMetadata(rawMetadata = null) {
      const parsedMetadata =
        typeof rawMetadata === "string"
          ? parseJsonSafely(rawMetadata, null)
          : rawMetadata;
      const source =
        parsedMetadata &&
        typeof parsedMetadata === "object" &&
        !Array.isArray(parsedMetadata)
          ? parsedMetadata
          : {};
      const coverage = createManagedSectionCoverage();
      const sourceCoverage =
        source.sectionCoverage &&
        typeof source.sectionCoverage === "object" &&
        !Array.isArray(source.sectionCoverage)
          ? source.sectionCoverage
          : {};
      MANAGED_RANGE_SECTIONS.forEach((section) => {
        const sectionPeriods = Array.isArray(sourceCoverage[section])
          ? sourceCoverage[section]
          : [];
        sectionPeriods.forEach((periodId) => {
          const normalizedPeriodId = String(periodId || "").trim();
          if (normalizedPeriodId) {
            coverage[section].add(normalizedPeriodId);
          }
        });
      });
      const fullyHydratedSections = new Set(
        (Array.isArray(source.fullyHydratedSections)
          ? source.fullyHydratedSections
          : []
        )
          .map((section) => String(section || "").trim())
          .filter((section) => MANAGED_RANGE_SECTIONS.includes(section)),
      );
      return {
        coverage,
        fullyHydratedSections,
      };
    }

    function buildManagedMirrorCoverageMetadata() {
      return {
        fullyHydratedSections: MANAGED_RANGE_SECTIONS.filter((section) =>
          managedFullyHydratedSections.has(section),
        ),
        sectionCoverage: MANAGED_RANGE_SECTIONS.reduce((result, section) => {
          result[section] = Array.from(managedSectionCoverage?.[section] || []);
          return result;
        }, {}),
      };
    }

    const initialManagedMirrorCoverage =
      normalizeManagedMirrorCoverageMetadata(effectiveInitialMirrorCoverageRaw);
    managedSectionCoverage = initialManagedMirrorCoverage.coverage;
    managedFullyHydratedSections =
      initialManagedMirrorCoverage.fullyHydratedSections;

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

    function resetPendingNativeStorageChangeMetadata() {
      pendingNativeSharedKeyWrites.clear();
      pendingNativeStorageChangedSections.clear();
      pendingNativeStorageChangedPeriods = {};
      nativeFullStateRewriteRequested = false;
    }

    function consumePendingNativeStorageChangeMetadata() {
      const changedSections = Array.from(pendingNativeStorageChangedSections);
      const changedPeriods = normalizeChangedPeriodsMap(
        pendingNativeStorageChangedPeriods,
      );
      resetPendingNativeStorageChangeMetadata();
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
      const source =
        typeof metadata.source === "string" && metadata.source.trim()
          ? metadata.source.trim()
          : "renderer";
      const originPageInstanceId =
        typeof metadata.originPageInstanceId === "string" &&
        metadata.originPageInstanceId.trim()
          ? metadata.originPageInstanceId.trim()
          : STORAGE_PAGE_INSTANCE_ID;
      rememberRecentLocalStorageEcho({
        changedSections,
        changedPeriods,
        source,
        originPageInstanceId,
      });
      window.ControlerNativeBridge?.emitEvent?.("storage.changed", {
        reason:
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : "external-update",
        changedSections,
        changedPeriods,
        source,
        originPageInstanceId,
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
      if (options.suppressUserAlert === true) {
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

    function buildManagedPartialStateMetadata(extra = {}) {
      return buildMobileMetadata({
        ...extra,
        useStateRecordsForProjectNormalization: false,
      });
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
        buildManagedPartialStateMetadata(),
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

    function buildDirectCorePatchFromSharedKeys(
      state,
      pendingSharedKeys = [],
    ) {
      const normalizedSharedKeys = normalizeChangedSectionsList(
        pendingSharedKeys,
      )
        .map((key) => resolveLocalStateKey(key))
        .filter((key) => key && isSharedStateKey(key));
      if (!normalizedSharedKeys.length) {
        return null;
      }
      if (
        !normalizedSharedKeys.every((key) => PRECISE_CORE_SECTION_KEYS.has(key))
      ) {
        return null;
      }
      const partialCore = normalizedSharedKeys.reduce((result, key) => {
        result[key] = cloneValue(state?.[key]);
        return result;
      }, {});
      partialCore.syncMeta = cloneValue(state?.syncMeta || null);
      return normalizeCorePayloadProjects(partialCore).payload;
    }

    function getManagedStateFootprint(state = {}) {
      const safeState =
        state && typeof state === "object" && !Array.isArray(state) ? state : {};
      const countArrayItems = (key) =>
        Array.isArray(safeState[key]) ? safeState[key].length : 0;
      const rangeItemCount = MANAGED_RANGE_SECTIONS.reduce(
        (total, section) => total + countArrayItems(section),
        0,
      );
      const projectCount = countArrayItems("projects");
      const directRecordCount = countArrayItems("records");
      const coreItemCount =
        projectCount +
        countArrayItems("todos") +
        countArrayItems("checkinItems") +
        countArrayItems("plans") +
        countArrayItems("diaryCategories") +
        countArrayItems("customThemes");

      return {
        projectCount,
        directRecordCount,
        rangeItemCount,
        coreItemCount,
        totalItemCount: coreItemCount + rangeItemCount + directRecordCount,
      };
    }

    function shouldPreferNativeInitializationSnapshot(
      localState,
      nativeState,
    ) {
      const localFootprint = getManagedStateFootprint(localState);
      const nativeFootprint = getManagedStateFootprint(nativeState);

      if (nativeFootprint.rangeItemCount > localFootprint.rangeItemCount) {
        return true;
      }
      if (nativeFootprint.directRecordCount > localFootprint.directRecordCount) {
        return true;
      }
      if (nativeFootprint.projectCount > localFootprint.projectCount + 1) {
        return true;
      }
      if (nativeFootprint.totalItemCount > localFootprint.totalItemCount + 8) {
        return true;
      }

      return (
        localFootprint.rangeItemCount + localFootprint.directRecordCount === 0 &&
        localFootprint.projectCount <= 1 &&
        nativeFootprint.totalItemCount > localFootprint.totalItemCount
      );
    }

    function rebuildManagedSectionCoverage(state, options = {}) {
      const markFull = options?.markFull === true;
      if (!markFull) {
        // Partial date-range loads only cache slices of a month, so we must not
        // rebuild month coverage from the currently mirrored items.
        managedSectionCoverage = cloneManagedSectionCoverage();
        return;
      }
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
          getManagedSectionPeriodIds(section, item).forEach((periodId) => {
            nextCoverage[section].add(periodId);
          });
        });
      });
      managedSectionCoverage = nextCoverage;
      if (markFull) {
        managedFullyHydratedSections = new Set(MANAGED_RANGE_SECTIONS);
      }
    }

    function hasFullManagedStateSnapshot() {
      return (
        hasManagedCoreSnapshot &&
        managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length
      );
    }

    function canOverwriteNativeStateFromMirror() {
      return nativeFullStateRewriteRequested || hasFullManagedStateSnapshot();
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

    function normalizeManagedSectionRangeScope(scope = {}) {
      const source = scope && typeof scope === "object" ? scope : {};
      const normalizedRange =
        storageBundle?.normalizeRangeInput?.(source) || {
          periodIds: Array.isArray(source?.periodIds) ? source.periodIds : [],
          startDate: source?.startDate || source?.start || null,
          endDate: source?.endDate || source?.end || null,
        };
      const rawStartDate = source?.startDate || source?.start || null;
      const rawEndDate = source?.endDate || source?.end || null;

      if (!rawStartDate && !rawEndDate) {
        return normalizedRange;
      }

      const boundedRange =
        storageBundle?.normalizeRangeInput?.({
          startDate: rawStartDate,
          endDate: rawEndDate,
        }) || {
          periodIds: Array.isArray(normalizedRange?.periodIds)
            ? normalizedRange.periodIds
            : [],
          startDate: rawStartDate,
          endDate: rawEndDate,
        };
      const normalizedPeriodIds =
        storageBundle?.normalizeRangeInput?.({
          periodIds: Array.isArray(source?.periodIds) ? source.periodIds : [],
        })?.periodIds ||
        (Array.isArray(normalizedRange?.periodIds)
          ? normalizedRange.periodIds
          : []);

      return {
        periodIds: normalizedPeriodIds,
        startDate: boundedRange?.startDate || null,
        endDate: boundedRange?.endDate || null,
      };
    }

    function isFullManagedSectionRange(normalizedRange = {}) {
      const normalizedPeriodIds = Array.isArray(normalizedRange?.periodIds)
        ? normalizedRange.periodIds
            .map((periodId) => String(periodId || "").trim())
            .filter(Boolean)
        : [];
      const normalizedStartDate =
        typeof normalizedRange?.startDate === "string"
          ? normalizedRange.startDate.trim()
          : normalizedRange?.startDate || "";
      const normalizedEndDate =
        typeof normalizedRange?.endDate === "string"
          ? normalizedRange.endDate.trim()
          : normalizedRange?.endDate || "";
      return (
        normalizedPeriodIds.length === 0 &&
        !normalizedStartDate &&
        !normalizedEndDate
      );
    }

    function hasConcreteManagedSectionRangeBounds(normalizedRange = {}) {
      const normalizedStartDate =
        typeof normalizedRange?.startDate === "string"
          ? normalizedRange.startDate.trim()
          : normalizedRange?.startDate || "";
      const normalizedEndDate =
        typeof normalizedRange?.endDate === "string"
          ? normalizedRange.endDate.trim()
          : normalizedRange?.endDate || "";
      return !!normalizedStartDate || !!normalizedEndDate;
    }

    function shouldTrackManagedSectionRangeCoverage(
      normalizedRange = {},
      explicitCoveredPeriodIds = [],
    ) {
      if (isFullManagedSectionRange(normalizedRange)) {
        return false;
      }
      if (hasConcreteManagedSectionRangeBounds(normalizedRange)) {
        return false;
      }
      const normalizedPeriodIds = Array.isArray(normalizedRange?.periodIds)
        ? normalizedRange.periodIds
            .map((periodId) => String(periodId || "").trim())
            .filter(Boolean)
        : [];
      return explicitCoveredPeriodIds.length > 0 || normalizedPeriodIds.length > 0;
    }

    function canServeManagedSectionRange(section, scope = {}) {
      const normalizedRange = normalizeManagedSectionRangeScope(scope);
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

    function shouldForceAuthoritativeRead(options = {}) {
      return (
        options?.fresh === true ||
        options?.authoritative === true ||
        options?.__controlerAuthoritative === true
      );
    }

    function stripAuthoritativeReadFlags(options = {}) {
      if (!options || typeof options !== "object") {
        return {};
      }
      const nextOptions = {
        ...options,
      };
      delete nextOptions.authoritative;
      delete nextOptions.__controlerAuthoritative;
      delete nextOptions.fresh;
      return nextOptions;
    }

    function canServeManagedPageBootstrap(pageKey, options = {}) {
      const normalizedPage = normalizePageBootstrapKey(pageKey);
      const normalizedOptions =
        options && typeof options === "object" ? options : {};
      if (!hasManagedCoreSnapshot) {
        return false;
      }

      if (normalizedPage === "index") {
        return !!canServeManagedSectionRange(
          "records",
          normalizedOptions?.recordScope &&
            typeof normalizedOptions.recordScope === "object"
            ? normalizedOptions.recordScope
            : buildRecentHoursBootstrapScope(48),
        );
      }

      if (normalizedPage === "plan") {
        return !!canServeManagedSectionRange(
          "plans",
          normalizedOptions?.planScope &&
            typeof normalizedOptions.planScope === "object"
            ? normalizedOptions.planScope
            : Array.isArray(normalizedOptions?.periodIds) &&
                normalizedOptions.periodIds.length
              ? { periodIds: normalizedOptions.periodIds }
              : buildCurrentMonthBootstrapScope(),
        );
      }

      if (normalizedPage === "todo") {
        const dailyCheckinsCovered = canServeManagedSectionRange(
          "dailyCheckins",
          normalizedOptions?.dailyCheckinScope &&
            typeof normalizedOptions.dailyCheckinScope === "object"
            ? normalizedOptions.dailyCheckinScope
            : buildCurrentDayBootstrapScope(),
        );
        const checkinsCovered = canServeManagedSectionRange(
          "checkins",
          normalizedOptions?.checkinScope &&
            typeof normalizedOptions.checkinScope === "object"
            ? normalizedOptions.checkinScope
            : buildCurrentMonthBootstrapScope(),
        );
        return !!dailyCheckinsCovered && !!checkinsCovered;
      }

      if (normalizedPage === "diary") {
        return !!canServeManagedSectionRange(
          "diaryEntries",
          normalizedOptions?.diaryScope &&
            typeof normalizedOptions.diaryScope === "object"
            ? normalizedOptions.diaryScope
            : Array.isArray(normalizedOptions?.periodIds) &&
                normalizedOptions.periodIds.length
              ? { periodIds: normalizedOptions.periodIds }
              : buildCurrentMonthBootstrapScope(),
        );
      }

      if (normalizedPage === "stats") {
        return !!canServeManagedSectionRange(
          "records",
          normalizedOptions?.recordScope &&
            typeof normalizedOptions.recordScope === "object"
            ? normalizedOptions.recordScope
            : buildCurrentMonthBootstrapScope(),
        );
      }

      return true;
    }

    function mergeManagedSectionRange(section, scope = {}, items = [], options = {}) {
      const normalizedRange = normalizeManagedSectionRangeScope(scope);
      if (
        section === "records" &&
        hasConcreteManagedSectionRangeBounds(normalizedRange)
      ) {
        return;
      }
      const requestedPeriodIds = Array.isArray(normalizedRange.periodIds)
        ? normalizedRange.periodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
        : [];
      const explicitCoveredPeriodIds = Array.isArray(options?.coveredPeriodIds)
        ? options.coveredPeriodIds
            .map((periodId) => String(periodId || "").trim())
            .filter(Boolean)
        : [];
      const requestedPeriodSet = new Set(requestedPeriodIds);
      const shouldReplaceWholeSection = isFullManagedSectionRange(normalizedRange);
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
        const oneTimePlans = shouldReplaceWholeSection
          ? []
          : (state?.plans || []).filter(
              (item) =>
                !managedSectionItemMatchesRequestedPeriods(
                  section,
                  item,
                  requestedPeriodSet,
                ) &&
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
        const retainedItems = shouldReplaceWholeSection
          ? []
          : (state?.[section] || []).filter(
              (item) =>
                !managedSectionItemMatchesRequestedPeriods(
                  section,
                  item,
                  requestedPeriodSet,
                ),
            );
        nextState[section] =
          storageBundle?.sortPartitionItems?.(section, [
            ...retainedItems,
            ...nextItems,
          ]) || [...retainedItems, ...nextItems];
      }

      cachedState = normalizeState(
        nextState,
        buildManagedPartialStateMetadata(),
      );
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasManagedCoreSnapshot = true;
      hasPendingStateChanges = false;
      if (shouldReplaceWholeSection) {
        rebuildManagedSectionCoverage(cachedState, {
          markFull: false,
        });
        managedFullyHydratedSections.add(section);
      } else {
        if (
          shouldTrackManagedSectionRangeCoverage(
            normalizedRange,
            explicitCoveredPeriodIds,
          )
        ) {
          const coveredPeriodIds = explicitCoveredPeriodIds.length
            ? explicitCoveredPeriodIds
            : requestedPeriodIds.length
              ? requestedPeriodIds
              : Array.from(
                  new Set(collectManagedSectionCoveredPeriodIds(section, nextItems)),
                );
          markManagedSectionPeriodsLoaded(section, coveredPeriodIds);
        }
      }
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

    function isManagedShellInactive() {
      return shellPageActive === false;
    }

    function readCurrentShellVisibilityState() {
      return window.__CONTROLER_SHELL_VISIBILITY__ &&
        typeof window.__CONTROLER_SHELL_VISIBILITY__ === "object"
        ? window.__CONTROLER_SHELL_VISIBILITY__
        : initialShellVisibilityState;
    }

    function isInternalShellTransitionHide(detail = readCurrentShellVisibilityState()) {
      return (
        !!detail &&
        typeof detail === "object" &&
        detail.active === false &&
        detail.transitionLoading === true
      );
    }

    function isAndroidTransitionLoadingShellState() {
      return (
        reactNativeBridge?.platform === "android" &&
        readCurrentShellVisibilityState()?.transitionLoading === true
      );
    }

    function shouldIgnoreManagedAndroidWindowForegroundSyncTrigger(
      triggerName = "",
    ) {
      const normalizedTrigger = String(triggerName || "").trim();
      if (reactNativeBridge?.platform !== "android") {
        return false;
      }
      if (
        normalizedTrigger !== "focus" &&
        normalizedTrigger !== "pageshow" &&
        normalizedTrigger !== "visibility-visible"
      ) {
        return false;
      }
      const shellVisibilityState = readCurrentShellVisibilityState();
      emitStorageDebug("skip-window-foreground-sync-trigger", {
        trigger: normalizedTrigger,
        shellPageActive: shellPageActive === true,
        transitionLoading: shellVisibilityState?.transitionLoading === true,
        reason:
          typeof shellVisibilityState?.reason === "string"
            ? shellVisibilityState.reason
            : "",
        page:
          typeof shellVisibilityState?.page === "string"
            ? shellVisibilityState.page
            : "",
      });
      return true;
    }

    function buildForegroundSyncRequest(reason = "shell-resume", options = {}) {
      const previousRequest =
        pendingForegroundSyncRequest &&
        typeof pendingForegroundSyncRequest === "object"
          ? pendingForegroundSyncRequest
          : null;
      const normalizedChangedSections = normalizeChangedSectionsList(
        options.changedSections || [],
      );
      const normalizedChangedPeriods = normalizeChangedPeriodsMap(
        options.changedPeriods || {},
      );
      const normalizedSource =
        typeof options.source === "string" ? options.source.trim() : "";
      const normalizedOriginPageInstanceId =
        typeof options.originPageInstanceId === "string"
          ? options.originPageInstanceId.trim()
          : "";
      return {
        reason:
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : previousRequest?.reason || "shell-resume",
        resetWindow:
          options.resetWindow === true || previousRequest?.resetWindow === true,
        allowProbeOnlyBypass:
          options.allowProbeOnlyBypass === false ||
          previousRequest?.allowProbeOnlyBypass === false
            ? false
            : true,
        forceSnapshotSync:
          options.forceSnapshotSync === true ||
          previousRequest?.forceSnapshotSync === true,
        forceDispatch:
          options.forceDispatch === true ||
          previousRequest?.forceDispatch === true,
        changedSections: normalizeChangedSectionsList([
          ...(Array.isArray(previousRequest?.changedSections)
            ? previousRequest.changedSections
            : []),
          ...normalizedChangedSections,
        ]),
        changedPeriods: mergeChangedPeriodEntries(
          previousRequest?.changedPeriods || {},
          normalizedChangedPeriods,
        ),
        source: normalizedSource || previousRequest?.source || "",
        originPageInstanceId:
          normalizedOriginPageInstanceId ||
          previousRequest?.originPageInstanceId ||
          "",
      };
    }

    function queueNativeForegroundSyncOnShellResume(reason = "shell-resume", options = {}) {
      pendingForegroundSyncRequest = buildForegroundSyncRequest(reason, options);
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
      cachedState = normalizeState(
        nextState,
        buildManagedPartialStateMetadata(),
      );
      rebuildManagedSectionCoverage(cachedState, {
        markFull:
          managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length,
      });
      managedStateRevision += 1;
      hasPendingStateChanges = true;
      scheduleMirrorSnapshot();
      return cachedState;
    }

    function applyBridgeState(nextState, options = {}) {
      cachedState = normalizeState(
        nextState,
        buildManagedPartialStateMetadata(),
      );
      rebuildManagedSectionCoverage(cachedState, {
        markFull:
          managedFullyHydratedSections.size === MANAGED_RANGE_SECTIONS.length,
      });
      managedStateRevision += 1;
      normalizeChangedSectionsList(options?.clearSharedKeys).forEach((key) => {
        pendingNativeSharedKeyWrites.delete(key);
      });
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasPendingStateChanges = false;
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
        const nextCoverageJson = JSON.stringify(
          buildManagedMirrorCoverageMetadata(),
        );
        if (force || nextCoverageJson !== lastMirroredCoverageJson) {
          nativeMethods.setItem?.call(
            window.localStorage,
            MOBILE_MIRROR_COVERAGE_KEY,
            nextCoverageJson,
          );
          lastMirroredCoverageJson = nextCoverageJson;
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
        const nextPendingSessionId =
          hasPendingStateChanges && REACT_NATIVE_RUNTIME_SESSION_ID
            ? REACT_NATIVE_RUNTIME_SESSION_ID
            : "";
        if (nextPendingSessionId) {
          if (force || nextPendingSessionId !== lastMirroredPendingSessionId) {
            nativeMethods.setItem?.call(
              window.localStorage,
              MOBILE_MIRROR_PENDING_SESSION_KEY,
              nextPendingSessionId,
            );
            lastMirroredPendingSessionId = nextPendingSessionId;
          }
        } else if (force || lastMirroredPendingSessionId) {
          nativeMethods.removeItem?.call(
            window.localStorage,
            MOBILE_MIRROR_PENDING_SESSION_KEY,
          );
          lastMirroredPendingSessionId = "";
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
      markPendingNativeSelfChangeFingerprintAck();
      if (
        checkpoint &&
        checkpoint.revision === managedStateRevision
      ) {
        lastWrittenComparableSnapshot =
          checkpoint.comparableSnapshot || createComparableSnapshot(cachedState);
        hasPendingStateChanges = false;
      }
      const refreshedVersion = await refreshNativeVersionBaselineAfterDirectWrite();
      persistMirrorSnapshot(true);
      if (!refreshedVersion) {
        updateVersionBaseline(cachedStatus);
      }
      clearStorageSyncError();
      touchNativeFastProbeWindow();
      if (shouldRefreshNativeStatusAfterSelfWrite()) {
        scheduleNativeStatusRefresh({
          suppressError: true,
        });
      }
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

    function mergeVersionProbeIntoCachedStatus(versionProbe) {
      const normalizedVersion = normalizeVersionProbe(versionProbe, cachedStatus);
      if (!normalizedVersion) {
        return null;
      }
      cachedStatus = enrichStorageStatusWithRecovery(
        {
          ...(cachedStatus && typeof cachedStatus === "object" ? cachedStatus : {}),
          storagePath:
            normalizedVersion.storagePath ||
            (typeof cachedStatus?.storagePath === "string"
              ? cachedStatus.storagePath
              : ""),
          actualUri:
            normalizedVersion.actualUri ||
            (typeof cachedStatus?.actualUri === "string"
              ? cachedStatus.actualUri
              : ""),
          storageMode:
            normalizedVersion.storageMode ||
            (typeof cachedStatus?.storageMode === "string"
              ? cachedStatus.storageMode
              : ""),
          size: normalizedVersion.size,
          modifiedAt: normalizedVersion.modifiedAt,
          fingerprint: normalizedVersion.fingerprint,
          supportsModifiedAt: normalizedVersion.supportsModifiedAt === true,
          fallbackHashUsed: normalizedVersion.fallbackHashUsed === true,
        },
        cachedState,
      );
      updateVersionBaseline(normalizedVersion);
      return normalizedVersion;
    }

    async function refreshNativeVersionBaselineAfterDirectWrite() {
      if (typeof reactNativeBridge?.call !== "function") {
        return null;
      }
      try {
        const versionProbe = await probeNativeStateVersion({
          includeFallbackHash: false,
        });
        return mergeVersionProbeIntoCachedStatus(versionProbe);
      } catch (error) {
        console.error("刷新 React Native 写后版本基线失败:", error);
        return null;
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

    function markPendingNativeSelfChangeFingerprintAck() {
      pendingNativeSelfChangeFingerprintAckUntil =
        Date.now() + NATIVE_LOCAL_WRITE_ERROR_SUPPRESS_MS;
      emitStorageDebug("mark-self-change-ack", {
        ackUntil: pendingNativeSelfChangeFingerprintAckUntil,
      });
    }

    function shouldAcknowledgePendingNativeSelfChangeFingerprint() {
      return (
        pendingNativeSelfChangeFingerprintAckUntil > 0 &&
        Date.now() <= pendingNativeSelfChangeFingerprintAckUntil
      );
    }

    function clearPendingNativeSelfChangeFingerprintAck() {
      pendingNativeSelfChangeFingerprintAckUntil = 0;
    }

    function shouldRefreshNativeStatusAfterSelfWrite() {
      if (!cachedStatus || typeof cachedStatus !== "object") {
        return true;
      }
      if (cachedStatus.sizePending === true) {
        return true;
      }
      const recoveryState =
        typeof cachedStatus.recoveryState === "string"
          ? cachedStatus.recoveryState.trim()
          : "";
      return recoveryState && recoveryState !== "ok";
    }

    function shouldPreferProbeOnlyOnShellResume(reason = "") {
      return (
        preferProbeOnlyOnFirstShellResume &&
        hasManagedCoreSnapshot &&
        !hasPendingStateChanges &&
        String(reason || "").trim() === "shell-resume"
      );
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
      // Version probes plus explicit storage.changed events are enough to detect
      // foreground updates. Forcing a full snapshot sync on every unchanged probe
      // was repeatedly triggering multi-second readState calls on active pages.
      return false;
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
      const { suppressError = false, debugContext = null } = options;
      const normalizedDebugContext =
        debugContext && typeof debugContext === "object" ? debugContext : null;
      const debugCaller =
        typeof normalizedDebugContext?.caller === "string" &&
        normalizedDebugContext.caller.trim()
          ? normalizedDebugContext.caller.trim()
          : "unknown";
      try {
        emitStorageDebug("read-native-snapshot-start", {
          suppressError: suppressError === true,
          debugContext: normalizedDebugContext,
        });
        emitStoragePerfMetric("storage-sync-read-trigger", {
          caller: debugCaller,
          suppressError: suppressError === true,
          reason:
            typeof normalizedDebugContext?.reason === "string"
              ? normalizedDebugContext.reason
              : "",
          source:
            typeof normalizedDebugContext?.source === "string"
              ? normalizedDebugContext.source
              : "",
          originPageInstanceId:
            typeof normalizedDebugContext?.originPageInstanceId === "string"
              ? normalizedDebugContext.originPageInstanceId
              : "",
          pendingSharedKeys: Number.isFinite(normalizedDebugContext?.pendingSharedKeys)
            ? Math.max(0, Number(normalizedDebugContext.pendingSharedKeys) || 0)
            : 0,
          forceDispatch: normalizedDebugContext?.forceDispatch === true,
        });
        const rawPayload = await reactNativeBridge.call("storage.readState");
        const payload = parseJsonSafely(rawPayload, null);
        if (!payload || typeof payload !== "object") {
          emitStorageDebug("read-native-snapshot-empty", {
            suppressError: suppressError === true,
            debugContext: normalizedDebugContext,
          });
          emitStoragePerfMetric("storage-sync-read-result", {
            caller: debugCaller,
            ok: false,
            empty: true,
          });
          return null;
        }

        const nextStatus =
          payload.status && typeof payload.status === "object"
            ? payload.status
            : null;
        const nextState =
          payload.state && typeof payload.state === "object" ? payload.state : {};
        adoptLegacyLocalOnlyValues(nextState);
        maybeNotifyStorageRecoveryStatus(nextStatus);
        emitStoragePerfMetric("storage-sync-read-result", {
          caller: debugCaller,
          ok: true,
          empty: false,
          recoveryState:
            typeof nextStatus?.recoveryState === "string"
              ? nextStatus.recoveryState
              : "",
          sizePending: nextStatus?.sizePending === true,
        });

        return {
          state: normalizeState(nextState, buildMobileMetadata(nextStatus || {})),
          status: nextStatus,
        };
      } catch (error) {
        emitStorageDebug("read-native-snapshot-error", {
          suppressError: suppressError === true,
          debugContext: normalizedDebugContext,
          message: error instanceof Error ? error.message : String(error || ""),
        });
        emitStoragePerfMetric("storage-sync-read-result", {
          caller: debugCaller,
          ok: false,
          empty: true,
          error: error instanceof Error ? error.message : String(error || ""),
        });
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
        const parsed = enrichStorageStatusWithRecovery(
          parseJsonSafely(rawPayload, null),
          cachedState,
        );
        clearStorageSyncError();
        maybeNotifyStorageRecoveryStatus(parsed);
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
      if (isManagedShellInactive() && !force) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        return cachedStatus;
      }
      if (nativeStatusRefreshPromise && !force) {
        return nativeStatusRefreshPromise;
      }
      const refreshTask = getNativeStatusSnapshot({
        suppressError,
      })
        .then((nextStatus) => {
          if (nextStatus && typeof nextStatus === "object") {
            cachedStatus = enrichStorageStatusWithRecovery(nextStatus, cachedState);
            maybeNotifyStorageRecoveryStatus(cachedStatus);
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
      if (isManagedShellInactive() && options?.force !== true) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        return;
      }
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

    async function runProbeOnlyShellResumeSync(reason = "shell-resume") {
      const normalizedReason =
        typeof reason === "string" && reason.trim() ? reason.trim() : "shell-resume";
      if (!shouldPreferProbeOnlyOnShellResume(normalizedReason)) {
        emitStoragePerfMetric("storage-sync-shell-resume-probe-path", {
          reason: normalizedReason,
          armed: false,
          hasManagedCoreSnapshot: hasManagedCoreSnapshot === true,
          hasPendingStateChanges: hasPendingStateChanges === true,
          preferProbeOnlyOnFirstShellResume:
            preferProbeOnlyOnFirstShellResume === true,
        });
        return false;
      }
      emitStoragePerfMetric("storage-sync-shell-resume-probe-path", {
        reason: normalizedReason,
        armed: true,
        hasManagedCoreSnapshot: hasManagedCoreSnapshot === true,
        hasPendingStateChanges: hasPendingStateChanges === true,
        preferProbeOnlyOnFirstShellResume:
          preferProbeOnlyOnFirstShellResume === true,
      });
      preferProbeOnlyOnFirstShellResume = false;
      touchNativeFastProbeWindow();
      try {
        const versionProbe = await probeNativeStateVersion({
          includeFallbackHash: shouldUseFallbackHashProbe(),
          suppressError: true,
        });
        if (versionProbe) {
          updateVersionBaseline(versionProbe);
          clearStorageSyncError();
        } else {
          scheduleNativeStatusRefresh({
            suppressError: true,
          });
        }
      } catch (error) {
        console.error("壳层恢复时的轻量版本探测失败:", error);
        scheduleNativeForegroundSync(normalizedReason, {
          resetWindow: false,
          allowProbeOnlyBypass: false,
        });
        return false;
      }
      scheduleNativeProbeLoop();
      return true;
    }

    async function writeNativeState() {
      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        persistMirrorSnapshot(true);
        return cachedStatus;
      }
      const pendingSharedKeys = peekPendingNativeSharedKeyChanges();
      let latestSnapshot = null;
      let nextState = normalizeState(readState(), {
        ...buildMobileMetadata(),
        touchModified: true,
        touchSyncSave: true,
      });
      emitStoragePerfMetric("storage-sync-write-native-state-start", {
        pendingSharedKeys: pendingSharedKeys.length,
        sharedKeys: pendingSharedKeys,
        nativeFullStateRewriteRequested: nativeFullStateRewriteRequested === true,
      });
      const directCorePatch = !nativeFullStateRewriteRequested
        ? buildDirectCorePatchFromSharedKeys(nextState, pendingSharedKeys)
        : null;
      if (directCorePatch) {
        hasManagedCoreSnapshot = true;
      } else if (pendingSharedKeys.length && !nativeFullStateRewriteRequested) {
        latestSnapshot = await readNativeSnapshot({
          suppressError: true,
          debugContext: {
            caller: "writeNativeState:shared-rebase",
            pendingSharedKeys: pendingSharedKeys.length,
          },
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
      const canWriteRebasedSharedSnapshot =
        pendingSharedKeys.length > 0 &&
        !nativeFullStateRewriteRequested &&
        !!latestSnapshot?.state;
      if (!canWriteRebasedSharedSnapshot && !canOverwriteNativeStateFromMirror()) {
        const blockedMessage = pendingSharedKeys.length
          ? "移动端原生快照暂不可用，已阻止共享状态补写，请稍候重试。"
          : "移动端镜像尚未完成全量同步，已阻止整库覆盖，请稍候重试。";
        if (pendingSharedKeys.length) {
          reportNativeStorageSyncError(blockedMessage, {
            reason: "native-write-blocked-shared-rebase",
            suppressUserAlert: true,
          });
          console.warn(
            "React Native 原生快照暂不可用，已阻止共享状态补写，避免覆盖整库。",
          );
        } else {
          reportNativeStorageSyncError(
            blockedMessage,
            {
              reason: "native-write-blocked-incomplete-mirror",
              suppressUserAlert: true,
            },
          );
          console.warn(
            "React Native 镜像尚未完成全量同步，已阻止整库覆盖。",
          );
        }
        persistMirrorSnapshot(true);
        scheduleNativeStatusRefresh({
          suppressError: true,
        });
        throw new Error(blockedMessage);
      }
      cachedState = nextState;
      const serializedState = JSON.stringify(nextState);
      const nextComparableSnapshot = createComparableSnapshot(nextState);

      if (nextComparableSnapshot === lastWrittenComparableSnapshot) {
        resetPendingNativeStorageChangeMetadata();
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

      if (directCorePatch) {
        const directWriteCheckpoint = {
          revision: managedStateRevision,
          comparableSnapshot: nextComparableSnapshot,
        };
        await reactNativeBridge.call("storage.replaceCoreState", {
          partialCore: directCorePatch,
          options: {
            emitChange: false,
            reason: "shared-core-replace",
          },
        });
        touchRecentNativeLocalWriteWindow();
        await settleManagedNativeDirectWrite(directWriteCheckpoint);
        emitNativeStorageChangedBridgeEvent(
          "storage-write",
          consumePendingNativeStorageChangeMetadata(),
        );
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
      cachedStatus = enrichStorageStatusWithRecovery(nextStatus, cachedState);
      maybeNotifyStorageRecoveryStatus(cachedStatus);
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
        nativeFullStateRewriteRequested = true;
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
        originPageInstanceId = "",
      } = options;
      const normalizedChangedSections = normalizeChangedSectionsList(changedSections);
      const normalizedChangedPeriods = normalizeChangedPeriodsMap(changedPeriods);
      const normalizedSource =
        typeof source === "string" ? source.trim() : "";
      const normalizedOriginPageInstanceId =
        typeof originPageInstanceId === "string"
          ? originPageInstanceId.trim()
          : "";
      emitStorageDebug("sync-state-from-native-start", {
        reason: typeof reason === "string" ? reason : "",
        forceDispatch: forceDispatch === true,
        suppressError: suppressError === true,
        hasPendingStateChanges: hasPendingStateChanges === true,
        source: normalizedSource,
        originPageInstanceId: normalizedOriginPageInstanceId,
        changedSections: normalizedChangedSections,
        changedPeriods: normalizedChangedPeriods,
      });
      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume(reason || "shell-resume", {
          resetWindow:
            normalizedChangedSections.length > 0 ||
            Object.keys(normalizedChangedPeriods).length > 0,
          allowProbeOnlyBypass:
            !forceDispatch &&
            !normalizedChangedSections.length &&
            !Object.keys(normalizedChangedPeriods).length,
          forceSnapshotSync:
            forceDispatch === true ||
            normalizedChangedSections.length > 0 ||
            Object.keys(normalizedChangedPeriods).length > 0,
          forceDispatch,
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        });
        return createSourceSyncResult(
          buildMergedState(cachedState, {
            includeAliases: true,
          }),
          cachedStatus,
        );
      }
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
        debugContext: {
          caller: "syncStateFromNative",
          reason: typeof reason === "string" ? reason : "",
          forceDispatch: forceDispatch === true,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        },
      });
      if (!next?.state) {
        emitStorageDebug("sync-state-from-native-empty", {
          reason: typeof reason === "string" ? reason : "",
        });
        return null;
      }

      const currentState = readState();
      const currentSnapshot = createComparableSnapshot(currentState);
      const nextSnapshot = createComparableSnapshot(next.state);
      const snapshotChanged = nextSnapshot !== currentSnapshot;
      let resolvedChangedSections = normalizedChangedSections;
      const resolvedChangedPeriods = normalizedChangedPeriods;
      if (snapshotChanged && !resolvedChangedSections.length) {
        resolvedChangedSections = inferChangedSectionsFromStateTransition(
          currentState,
          next.state,
        );
        if (!resolvedChangedSections.length) {
          resolvedChangedSections = [...DEFAULT_CHANGED_SECTIONS];
        }
      }

      cachedState = next.state;
      hasManagedCoreSnapshot = true;
      rebuildManagedSectionCoverage(cachedState, {
        markFull: true,
      });
      cachedStatus = enrichStorageStatusWithRecovery(
        next.status || cachedStatus,
        cachedState,
      );
      lastWrittenComparableSnapshot = nextSnapshot;
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      updateVersionBaseline(cachedStatus);
      clearStorageSyncError();

      if (reason && (forceDispatch || snapshotChanged)) {
        dispatchStorageChangedEvent(reason, buildMergedState(cachedState), cachedStatus, {
          changedSections: resolvedChangedSections,
          changedPeriods: resolvedChangedPeriods,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        });
      }
      emitStorageDebug("sync-state-from-native-finished", {
        reason: typeof reason === "string" ? reason : "",
        forceDispatch: forceDispatch === true,
        changed: snapshotChanged,
        changedSections: resolvedChangedSections,
        changedPeriods: resolvedChangedPeriods,
      });
      return createSourceSyncResult(buildMergedState(cachedState), cachedStatus);
    }

    async function runNativeVersionProbe(reason) {
      emitStorageDebug("run-native-version-probe-start", {
        reason: typeof reason === "string" ? reason : "",
        hasPendingStateChanges: hasPendingStateChanges === true,
        nativeBaselineFingerprint,
        pendingSelfAck: shouldAcknowledgePendingNativeSelfChangeFingerprint(),
        pendingSelfAckUntil: pendingNativeSelfChangeFingerprintAckUntil,
      });
      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume(reason || "shell-resume");
        return createSourceSyncResult(
          buildMergedState(cachedState, {
            includeAliases: true,
          }),
          cachedStatus,
        );
      }
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
          emitStorageDebug("run-native-version-probe-empty", {
            reason: typeof reason === "string" ? reason : "",
          });
          return null;
        }

        const previousVersionProbe = lastKnownVersionProbe;
        lastKnownVersionProbe = versionProbe;
        if (versionProbe.fallbackHashUsed) {
          lastFallbackHashProbeAt = Date.now();
        }

        if (!nativeBaselineFingerprint) {
          nativeBaselineFingerprint = versionProbe.fingerprint || "";
          clearStorageSyncError();
          emitStorageDebug("run-native-version-probe-baseline-init", {
            reason: typeof reason === "string" ? reason : "",
            fingerprint: versionProbe.fingerprint || "",
          });
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
          emitStorageDebug("run-native-version-probe-mismatch", {
            reason: typeof reason === "string" ? reason : "",
            previousFingerprint: nativeBaselineFingerprint,
            nextFingerprint: versionProbe.fingerprint || "",
            pendingSelfAck: shouldAcknowledgePendingNativeSelfChangeFingerprint(),
            equivalentTransition: isEquivalentVersionProbeTransition(
              previousVersionProbe,
              versionProbe,
            ),
          });
          if (
            shouldAcknowledgePendingNativeSelfChangeFingerprint() &&
            !hasPendingStateChanges
          ) {
            clearPendingNativeSelfChangeFingerprintAck();
            updateVersionBaseline(versionProbe);
            clearStorageSyncError();
            emitStorageDebug("run-native-version-probe-acknowledged-self-change", {
              reason: typeof reason === "string" ? reason : "",
              fingerprint: versionProbe.fingerprint || "",
            });
            return createSourceSyncResult(
              buildMergedState(cachedState, {
                includeAliases: true,
              }),
              cachedStatus,
            );
          }
          if (isEquivalentVersionProbeTransition(previousVersionProbe, versionProbe)) {
            updateVersionBaseline(versionProbe);
            clearStorageSyncError();
            emitStorageDebug("run-native-version-probe-equivalent-transition", {
              reason: typeof reason === "string" ? reason : "",
              fingerprint: versionProbe.fingerprint || "",
            });
            return createSourceSyncResult(
              buildMergedState(cachedState, {
                includeAliases: true,
              }),
              cachedStatus,
            );
          }
          emitStorageDebug("run-native-version-probe-syncing-after-mismatch", {
            reason: typeof reason === "string" ? reason : "",
          });
          const syncResult = await syncStateFromNative(reason || "external-update");
          updateVersionBaseline(syncResult?.status || cachedStatus);
          return syncResult;
        }

        if (pendingNativeSelfChangeFingerprintAckUntil > 0) {
          clearPendingNativeSelfChangeFingerprintAck();
        }
        if (shouldForceNativeSnapshotSync()) {
          emitStorageDebug("run-native-version-probe-force-sync", {
            reason: typeof reason === "string" ? reason : "",
          });
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
        emitStorageDebug("run-native-version-probe-noop", {
          reason: typeof reason === "string" ? reason : "",
          fingerprint: versionProbe.fingerprint || "",
        });
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
      const {
        resetWindow = true,
        allowProbeOnlyBypass = true,
        forceSnapshotSync = false,
        forceDispatch = false,
        changedSections = [],
        changedPeriods = {},
        source = "",
        originPageInstanceId = "",
      } = options;
      const normalizedChangedSections = normalizeChangedSectionsList(changedSections);
      const normalizedChangedPeriods = normalizeChangedPeriodsMap(changedPeriods);
      const normalizedSource =
        typeof source === "string" ? source.trim() : "";
      const normalizedOriginPageInstanceId =
        typeof originPageInstanceId === "string"
          ? originPageInstanceId.trim()
          : "";
      const normalizedReason =
        typeof reason === "string" && reason.trim() ? reason.trim() : "";
      const reportShellResumeSettled = (payload = {}) => {
        dispatchShellResumeSettledEvent(normalizedReason, payload);
      };
      if (normalizedReason === "shell-resume") {
        emitStoragePerfMetric("storage-sync-shell-resume-scheduled", {
          reason: normalizedReason,
          resetWindow: resetWindow === true,
          allowProbeOnlyBypass: allowProbeOnlyBypass === true,
          forceSnapshotSync: forceSnapshotSync === true,
          forceDispatch: forceDispatch === true,
          shellPageActive: shellPageActive === true,
          nativeInitializationSettled: nativeInitializationSettled === true,
          hasManagedCoreSnapshot: hasManagedCoreSnapshot === true,
          hasPendingStateChanges: hasPendingStateChanges === true,
          preferProbeOnlyOnFirstShellResume:
            preferProbeOnlyOnFirstShellResume === true,
          transitionLoading:
            readCurrentShellVisibilityState()?.transitionLoading === true,
        });
      }
      emitStorageDebug("schedule-native-foreground-sync", {
        reason: typeof reason === "string" ? reason : "",
        resetWindow: resetWindow === true,
        allowProbeOnlyBypass: allowProbeOnlyBypass === true,
        forceSnapshotSync: forceSnapshotSync === true,
        forceDispatch: forceDispatch === true,
        shellPageActive: shellPageActive === true,
        nativeInitializationSettled: nativeInitializationSettled === true,
        changedSections: normalizedChangedSections,
        changedPeriods: normalizedChangedPeriods,
        source: normalizedSource,
        originPageInstanceId: normalizedOriginPageInstanceId,
      });
      if (!shellPageActive) {
        queueNativeForegroundSyncOnShellResume(reason || "shell-resume", {
          resetWindow: false,
          allowProbeOnlyBypass,
          forceSnapshotSync,
          forceDispatch,
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        });
        return;
      }
      if (
        isAndroidTransitionLoadingShellState() &&
        !hasPendingStateChanges
      ) {
        queueNativeForegroundSyncOnShellResume(reason || "shell-resume", {
          resetWindow,
          allowProbeOnlyBypass,
          forceSnapshotSync,
          forceDispatch,
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        });
        emitStoragePerfMetric("storage-sync-shell-resume-deferred", {
          reason: normalizedReason || "shell-resume",
          resetWindow: resetWindow === true,
          transitionLoading: true,
          hasManagedCoreSnapshot: hasManagedCoreSnapshot === true,
          hasPendingStateChanges: false,
          forceSnapshotSync: forceSnapshotSync === true,
        });
        return;
      }
      if (!nativeInitializationSettled) {
        queueNativeForegroundSyncOnShellResume(reason || "external-update", {
          resetWindow,
          allowProbeOnlyBypass,
          forceSnapshotSync,
          forceDispatch,
          changedSections: normalizedChangedSections,
          changedPeriods: normalizedChangedPeriods,
          source: normalizedSource,
          originPageInstanceId: normalizedOriginPageInstanceId,
        });
        return;
      }
      if (resetWindow) {
        touchNativeFastProbeWindow();
      }
      if (
        allowProbeOnlyBypass &&
        !forceSnapshotSync &&
        shouldPreferProbeOnlyOnShellResume(reason)
      ) {
        writeChain = writeChain
          .then(() => runProbeOnlyShellResumeSync(reason || "shell-resume"))
          .catch((error) => {
            console.error("前台恢复轻量同步失败:", error);
          })
          .finally(() => {
            reportShellResumeSettled({
              path: "probe-only",
              shellPageActive: shellPageActive === true,
            });
          });
        return;
      }
      window.clearTimeout(nativeForegroundSyncTimer);
      nativeForegroundSyncTimer = window.setTimeout(() => {
        if (!shellPageActive) {
          queueNativeForegroundSyncOnShellResume(reason || "shell-resume", {
            resetWindow: false,
            allowProbeOnlyBypass,
            forceSnapshotSync,
            forceDispatch,
            changedSections: normalizedChangedSections,
            changedPeriods: normalizedChangedPeriods,
            source: normalizedSource,
            originPageInstanceId: normalizedOriginPageInstanceId,
          });
          return;
        }
        writeChain = writeChain
          .then(() => {
            if (forceSnapshotSync) {
              return syncStateFromNative(reason || "external-update", {
                forceDispatch:
                  forceDispatch === true ||
                  normalizedChangedSections.length > 0 ||
                  Object.keys(normalizedChangedPeriods).length > 0,
                changedSections: normalizedChangedSections,
                changedPeriods: normalizedChangedPeriods,
                source: normalizedSource,
                originPageInstanceId: normalizedOriginPageInstanceId,
              });
            }
            return runNativeVersionProbe(reason || "external-update");
          })
          .catch((error) => {
            console.error("前台恢复同步 React Native 存储失败:", error);
          })
          .finally(() => {
            reportShellResumeSettled({
              path: "version-probe",
              shellPageActive: shellPageActive === true,
            });
          });
      }, NATIVE_PROBE_DEBOUNCE_MS);
    }

    async function initializeReactNativeStorage() {
      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume("shell-resume", {
          resetWindow: false,
        });
        persistMirrorSnapshot(true);
        updateVersionBaseline(cachedStatus);
        return;
      }
      if (hasPendingStateChanges) {
        persistMirrorSnapshot(true);
        if (isManagedShellInactive()) {
          queueNativeForegroundSyncOnShellResume("shell-resume");
          updateVersionBaseline(cachedStatus);
          return;
        }
        if (reactNativeBridge?.platform === "android") {
          // Same-session pending mirror data should be flushed in the background
          // instead of forcing a blocking full-state read on every page switch.
          scheduleManagedPendingNativeFlush();
          updateVersionBaseline(cachedStatus);
          return;
        }
        const protectedNativeSnapshot = await readNativeSnapshot({
          suppressError: true,
          debugContext: {
            caller: "initializeReactNativeStorage:pending-state",
          },
        });
        if (
          protectedNativeSnapshot?.state &&
          shouldPreferNativeInitializationSnapshot(
            readState(),
            protectedNativeSnapshot.state,
          )
        ) {
          const currentSnapshot = createComparableSnapshot(readState());
          const nextSnapshot = createComparableSnapshot(
            protectedNativeSnapshot.state,
          );

          cachedState = protectedNativeSnapshot.state;
          hasManagedCoreSnapshot = true;
          rebuildManagedSectionCoverage(cachedState, {
            markFull: true,
          });
          cachedStatus = protectedNativeSnapshot.status || cachedStatus;
          lastWrittenComparableSnapshot = nextSnapshot;
          resetPendingNativeStorageChangeMetadata();
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
      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        updateVersionBaseline(cachedStatus);
        persistMirrorSnapshot(true);
        return;
      }
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

      if (reactNativeBridge?.platform === "android") {
        updateVersionBaseline(cachedStatus);
        persistMirrorSnapshot(true);
        scheduleNativeStatusRefresh({
          suppressError: true,
        });
        return;
      }

      if (isManagedShellInactive()) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        updateVersionBaseline(cachedStatus);
        persistMirrorSnapshot(true);
        return;
      }
      const next = await readNativeSnapshot({
        suppressError: true,
        debugContext: {
          caller: "initializeReactNativeStorage:full-fallback",
        },
      });
      if (next?.state) {
        const currentSnapshot = createComparableSnapshot(readState());
        const nextSnapshot = createComparableSnapshot(next.state);

        cachedState = next.state;
        hasManagedCoreSnapshot = true;
        rebuildManagedSectionCoverage(cachedState, {
          markFull: true,
        });
        cachedStatus = enrichStorageStatusWithRecovery(
          next.status || cachedStatus,
          cachedState,
        );
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

    function resolveManagedPrimarySectionPeriodId(section, item) {
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

    function getManagedSectionPeriodIds(section, item) {
      if (typeof storageBundle?.getPeriodIdsForSectionItem === "function") {
        const periodIds = storageBundle.getPeriodIdsForSectionItem(section, item);
        const normalizedPeriodIds = (Array.isArray(periodIds) ? periodIds : [])
          .map((periodId) => String(periodId || "").trim())
          .filter(Boolean);
        if (normalizedPeriodIds.length) {
          return [...new Set(normalizedPeriodIds)];
        }
      }
      return [resolveManagedPrimarySectionPeriodId(section, item)];
    }

    function managedSectionItemMatchesRequestedPeriods(
      section,
      item,
      requestedPeriods = new Set(),
    ) {
      if (!(requestedPeriods instanceof Set) || requestedPeriods.size === 0) {
        return true;
      }
      return getManagedSectionPeriodIds(section, item).some((periodId) =>
        requestedPeriods.has(periodId),
      );
    }

    function collectManagedSectionCoveredPeriodIds(section, items = []) {
      return [
        ...new Set(
          (Array.isArray(items) ? items : []).flatMap((item) =>
            getManagedSectionPeriodIds(section, item),
          ),
        ),
      ];
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
        checkinHistorySummary: normalizeCheckinHistorySummary(
          sourceState?.checkinHistorySummary,
        ),
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
            : "obsidian-mono",
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
        checkinHistorySummary:
          normalizedCorePayload?.checkinHistorySummary &&
          typeof normalizedCorePayload.checkinHistorySummary === "object" &&
          !Array.isArray(normalizedCorePayload.checkinHistorySummary)
            ? normalizeCheckinHistorySummary(
                normalizedCorePayload.checkinHistorySummary,
              )
            : currentCoreSnapshot.checkinHistorySummary,
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
      }, buildManagedPartialStateMetadata(payload));
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
        buildManagedPartialStateMetadata(metadata),
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
          {
            coveredPeriodIds: Array.isArray(pageBootstrap?.loadedPeriodIds)
              ? pageBootstrap.loadedPeriodIds
              : [],
          },
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
          {
            coveredPeriodIds: Array.isArray(pageBootstrap?.loadedPeriodIds)
              ? pageBootstrap.loadedPeriodIds
              : [],
          },
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
            checkinHistorySummary:
              data?.checkinHistorySummary &&
              typeof data.checkinHistorySummary === "object" &&
              !Array.isArray(data.checkinHistorySummary)
                ? data.checkinHistorySummary
                : {},
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
          {
            coveredPeriodIds: Array.isArray(pageBootstrap?.loadedPeriodIds)
              ? pageBootstrap.loadedPeriodIds
              : [],
          },
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
          {
            coveredPeriodIds: Array.isArray(pageBootstrap?.loadedPeriodIds)
              ? pageBootstrap.loadedPeriodIds
              : [],
          },
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
      const requested = new Set(
        section === "records"
          ? expandBootstrapRecordScopePeriodIds(normalizedRange, scope)
          : normalizeBootstrapPeriodIds(normalizedRange.periodIds),
      );
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
        if (
          requested.size > 0 &&
          !managedSectionItemMatchesRequestedPeriods(section, item, requested)
        ) {
          return false;
        }
        if (section === "records") {
          return bootstrapRecordOverlapsScope(item, normalizedRange);
        }
        return true;
      });
      return {
        section,
        periodUnit: "month",
        periodIds:
          requested.size > 0
            ? Array.from(requested)
            : collectManagedSectionCoveredPeriodIds(section, filteredItems),
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
        if (isManagedShellInactive()) {
          queueNativeForegroundSyncOnShellResume("shell-resume");
          return enrichStorageStatusWithRecovery(cachedStatus, cachedState);
        }
        if (!cachedStatus || cachedStatus?.sizePending === true) {
          await refreshNativeStatusCache({
            suppressError: true,
          });
        }
        return enrichStorageStatusWithRecovery(
          cachedStatus || (await getNativeStatusSnapshot()),
          cachedState,
        );
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
      flushJournalImpl: async (options = {}) => {
        if (hasPendingStateChanges) {
          return writeNativeState();
        }
        if (
          reactNativeBridge?.platform === "android" &&
          typeof reactNativeBridge?.call === "function"
        ) {
          try {
            const normalizedReason =
              typeof options?.reason === "string" ? options.reason.trim() : "";
            const skipStatusRefresh =
              options?.skipStatusRefresh === true ||
              (normalizedReason === "shell-hidden" && isInternalShellTransitionHide());
            const rawPayload = await reactNativeBridge.call("storage.flushJournal");
            const parsed = parseJsonSafely(rawPayload, null);
            const nextStatus = skipStatusRefresh
              ? null
              : await getNativeStatusSnapshot({
                  suppressError: true,
                });
            if (nextStatus && typeof nextStatus === "object") {
              cachedStatus = enrichStorageStatusWithRecovery(
                nextStatus,
                cachedState,
              );
            } else if (
              skipStatusRefresh &&
              parsed &&
              typeof parsed === "object" &&
              parsed.status &&
              typeof parsed.status === "object"
            ) {
              cachedStatus = enrichStorageStatusWithRecovery(
                parsed.status,
                cachedState,
              );
            }
            if (cachedStatus && typeof cachedStatus === "object") {
              persistMirrorSnapshot(true);
              updateVersionBaseline(cachedStatus);
            }
            maybeNotifyStorageRecoveryStatus(cachedStatus);
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
          const normalizedPage = normalizePageBootstrapKey(pageKey);
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const managedBootstrapOptions = stripAuthoritativeReadFlags(
            normalizedOptions,
          );
          const shouldBypassManagedBootstrapCache =
            isManagedShellInactive() || isAndroidTransitionLoadingShellState();
          if (
            shouldBypassManagedBootstrapCache ||
            shouldForceAuthoritativeRead(normalizedOptions) ||
            !canServeManagedPageBootstrap(normalizedPage, managedBootstrapOptions)
          ) {
            return null;
          }
          return buildPageBootstrapStateFromState(
            buildCurrentMergedState(),
            normalizedPage,
            managedBootstrapOptions,
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
          const forceAuthoritativeBootstrap = shouldForceAuthoritativeRead(
            normalizedOptions,
          );
          const shouldBypassManagedBootstrapCache =
            isManagedShellInactive() || isAndroidTransitionLoadingShellState();
          const nativeBootstrapOptions = stripAuthoritativeReadFlags(
            normalizedOptions,
          );
          const canUseManagedBootstrap = canServeManagedPageBootstrap(
            normalizedPage,
            nativeBootstrapOptions,
          );
          if (isManagedShellInactive() && !forceAuthoritativeBootstrap) {
            queueNativeForegroundSyncOnShellResume("shell-resume");
            return this.peekPageBootstrapState(normalizedPage, normalizedOptions);
          }
          const canUseManagedBootstrapFastPath =
            !forceAuthoritativeBootstrap &&
            nativeInitializationSettled &&
            !shouldBypassManagedBootstrapCache &&
            canUseManagedBootstrap;
          const preferManagedBootstrap =
            !forceAuthoritativeBootstrap &&
            nativeInitializationSettled &&
            !shouldBypassManagedBootstrapCache &&
            hasPendingStateChanges &&
            hasManagedCoreSnapshot;
          const shouldHydrateManagedMirror =
            forceAuthoritativeBootstrap || !canUseManagedBootstrapFastPath;
          if (preferManagedBootstrap) {
            return this.peekPageBootstrapState(normalizedPage, normalizedOptions);
          }
          if (canUseManagedBootstrapFastPath) {
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
                    options: nativeBootstrapOptions,
                  })
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
                nativeBootstrapOptions,
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
              if (shouldHydrateManagedMirror) {
                applyNativePageBootstrapToManagedMirror(
                  normalizedPage,
                  normalizedBootstrap,
                  nativeBootstrapOptions,
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
        async getCoreState(options = {}) {
          const managedSnapshot = getManagedCoreStateSnapshot();
          const forceAuthoritativeCoreState = shouldForceAuthoritativeRead(
            options,
          );
          if (isManagedShellInactive()) {
            queueNativeForegroundSyncOnShellResume("shell-resume");
            return managedSnapshot;
          }
          if (hasManagedCoreSnapshot && !forceAuthoritativeCoreState) {
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
                buildManagedPartialStateMetadata(normalizedCorePayload),
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
        async pickDiaryImages(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.pickDiaryImages",
              { options },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (Array.isArray(parsed)) {
              return parsed;
            }
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
              return parsed.items;
            }
          } catch (error) {
            console.error("选择 React Native 日记图片失败，回退浏览器文件选择:", error);
          }
          return pickDiaryImagesFromBrowser(options);
        },
        async saveDiaryImageAsset(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.saveDiaryImageAsset",
              { options },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              const currentState = readState();
              const existingAssets = Array.isArray(currentState?.diaryMediaAssets)
                ? currentState.diaryMediaAssets.filter(
                    (entry) => entry?.assetId !== parsed.assetId,
                  )
                : [];
              assignState({
                ...currentState,
                diaryMediaAssets: [...existingAssets, cloneValue(parsed)],
              });
              hasManagedCoreSnapshot = true;
              persistMirrorSnapshot(true);
              return parsed;
            }
            throw new Error("Native diary image save returned an empty payload.");
          } catch (error) {
            console.error("保存 React Native 日记图片资源失败:", error);
            throw error;
          }
        },
        async resolveDiaryImageUri(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.resolveDiaryImageUri",
              { options },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (error) {
            console.error("解析 React Native 日记图片 URI 失败:", error);
          }
          return null;
        },
        async deleteDiaryImageAssets(options = {}) {
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.deleteDiaryImageAssets",
              { options },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            const deletedAssetIds = new Set(
              (Array.isArray(parsed?.deletedAssetIds) ? parsed.deletedAssetIds : [])
                .map((assetId) => String(assetId || "").trim())
                .filter(Boolean),
            );
            if (deletedAssetIds.size > 0) {
              const currentState = readState();
              assignState({
                ...currentState,
                diaryMediaAssets: Array.isArray(currentState?.diaryMediaAssets)
                  ? currentState.diaryMediaAssets.filter(
                      (entry) => !deletedAssetIds.has(String(entry?.assetId || "").trim()),
                    )
                  : [],
              });
              hasManagedCoreSnapshot = true;
              persistMirrorSnapshot(true);
            }
            return parsed && typeof parsed === "object"
              ? parsed
              : {
                  deletedAssetIds: [],
                  remainingAssetCount: Array.isArray(readState()?.diaryMediaAssets)
                    ? readState().diaryMediaAssets.length
                    : 0,
                };
          } catch (error) {
            console.error("删除 React Native 日记图片资源失败:", error);
            return {
              deletedAssetIds: [],
              remainingAssetCount: Array.isArray(readState()?.diaryMediaAssets)
                ? readState().diaryMediaAssets.length
                : 0,
            };
          }
        },
        async loadSectionRange(section, scope = {}) {
          const normalizedScope =
            scope && typeof scope === "object" ? { ...scope } : {};
          const forceAuthoritativeRange = shouldForceAuthoritativeRead(
            normalizedScope,
          );
          const nativeScope = stripAuthoritativeReadFlags(normalizedScope);
          const normalizedRange = canServeManagedSectionRange(
            section,
            nativeScope,
          );
          if (isManagedShellInactive()) {
            queueNativeForegroundSyncOnShellResume("shell-resume");
            return loadManagedSectionRange(
              section,
              normalizedRange || nativeScope,
            );
          }
          const canUseManagedRangeFastPath =
            !forceAuthoritativeRange &&
            nativeInitializationSettled &&
            !!normalizedRange;
          const preferManagedRange =
            !forceAuthoritativeRange &&
            nativeInitializationSettled &&
            hasPendingStateChanges &&
            hasManagedCoreSnapshot;
          if (canUseManagedRangeFastPath || preferManagedRange) {
            scheduleManagedFastValidation(`section-fast-path:${section}`);
            return loadManagedSectionRange(
              section,
              normalizedRange || nativeScope,
            );
          }
          try {
            const rawPayload = await reactNativeBridge.call("storage.loadSectionRange", {
              section,
              scope: nativeScope,
            });
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              mergeManagedSectionRange(
                section,
                nativeScope,
                Array.isArray(parsed.items) ? parsed.items : [],
                {
                  coveredPeriodIds: Array.isArray(parsed.periodIds)
                    ? parsed.periodIds
                    : [],
                },
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
            (item) => getManagedSectionPeriodIds(section, item).includes(periodId),
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
            (item) => !getManagedSectionPeriodIds(section, item).includes(periodId),
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
          const invalidPayloadItems = (Array.isArray(payload?.items)
            ? payload.items
            : []
          ).filter(
            (item) => !getManagedSectionPeriodIds(section, item).includes(periodId),
          );
          const callerHint = (() => {
            try {
              return String(new Error().stack || "")
                .split("\n")
                .slice(2, 6)
                .map((line) => line.trim())
                .filter(Boolean)
                .join(" | ");
            } catch (error) {
              return "";
            }
          })();
          if (section === "records") {
            emitStoragePerfMetric("storage-range-save-request", {
              section,
              periodId,
              mode: String(payload?.mode || "replace").trim() || "replace",
              itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
              invalidItemCount: invalidPayloadItems.length,
              invalidSample: invalidPayloadItems.slice(0, 2).map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim(),
                projectId: String(item?.projectId || "").trim(),
                startTime: String(item?.startTime || "").trim(),
                endTime: String(item?.endTime || "").trim(),
                timestamp: String(item?.timestamp || "").trim(),
                periodIds: getManagedSectionPeriodIds(section, item),
              })),
              callerHint,
            });
          }
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
            const invalidItems = (Array.isArray(payload?.items) ? payload.items : []).filter(
              (item) => !getManagedSectionPeriodIds(section, item).includes(periodId),
            );
            emitStoragePerfMetric("storage-range-save-error", {
              section,
              periodId,
              mode: String(payload?.mode || "replace").trim() || "replace",
              itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
              invalidItemCount: invalidItems.length,
              invalidSample: invalidItems.slice(0, 1).map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim(),
                projectId: String(item?.projectId || "").trim(),
                startTime: String(item?.startTime || "").trim(),
                endTime: String(item?.endTime || "").trim(),
                timestamp: String(item?.timestamp || "").trim(),
                periodIds: getManagedSectionPeriodIds(section, item),
              })),
              message: error instanceof Error ? error.message : String(error || ""),
              callerHint,
            });
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
        applySharedStateFromBridge(partialState = {}) {
          const sourceState =
            partialState && typeof partialState === "object" && !Array.isArray(partialState)
              ? partialState
              : {};
          const currentState = readState();
          const nextState = {
            ...currentState,
          };
          let changed = false;
          const clearedSharedKeys = [];

          Object.keys(sourceState).forEach((key) => {
            const normalizedKey = resolveLocalStateKey(key);
            if (!normalizedKey || !isSharedStateKey(normalizedKey)) {
              return;
            }

            const nextValue = cloneValue(sourceState[key]);
            const currentValue = Object.prototype.hasOwnProperty.call(
              nextState,
              normalizedKey,
            )
              ? nextState[normalizedKey]
              : null;
            const currentSnapshot = safeSerialize(currentValue);
            const nextSnapshot = safeSerialize(nextValue);

            if (currentSnapshot !== nextSnapshot) {
              nextState[normalizedKey] = nextValue;
              changed = true;
            }
            clearedSharedKeys.push(normalizedKey);

            if (SHARED_BOOTSTRAP_MIRROR_KEYS.includes(normalizedKey)) {
              const mirroredSnapshot = safeSerialize(
                readRawLocalOnlyValue(normalizedKey),
              );
              if (mirroredSnapshot !== nextSnapshot) {
                writeRawLocalOnlyValue(normalizedKey, nextValue);
              }
            }
          });

          if (changed) {
            applyBridgeState(nextState, {
              clearSharedKeys: clearedSharedKeys,
            });
            hasManagedCoreSnapshot = true;
          } else if (clearedSharedKeys.length) {
            normalizeChangedSectionsList(clearedSharedKeys).forEach((key) => {
              pendingNativeSharedKeyWrites.delete(key);
            });
            hasPendingStateChanges = false;
          }
          persistMirrorSnapshot(true);
          return buildCurrentMergedState();
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
        const next = await readNativeSnapshot({
          debugContext: {
            caller: "selectStorageFile",
          },
        });
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
        const next = await readNativeSnapshot({
          debugContext: {
            caller: "selectStorageDirectory",
          },
        });
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
        const next = await readNativeSnapshot({
          debugContext: {
            caller: "resetStorageFile",
          },
        });
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
          allowProbeOnlyBypass: queuedForegroundSync.allowProbeOnlyBypass,
          forceSnapshotSync: queuedForegroundSync.forceSnapshotSync,
          forceDispatch: queuedForegroundSync.forceDispatch,
          changedSections: queuedForegroundSync.changedSections || [],
          changedPeriods: queuedForegroundSync.changedPeriods || {},
          source: queuedForegroundSync.source || "",
          originPageInstanceId: queuedForegroundSync.originPageInstanceId || "",
        });
      }
      if (useAndroidProbeLoop && !document.hidden && shellPageActive) {
        touchNativeFastProbeWindow();
        scheduleNativeProbeLoop();
      }
    });
    const forceFlushNativeStorage = (reason = "forced-persist", options = {}) => {
      const normalizedOptions =
        options && typeof options === "object" ? { ...options } : {};
      const allowLifecycleDeferral =
        normalizedOptions.allowLifecycleDeferral === true;
      const skipStatusRefresh = normalizedOptions.skipStatusRefresh === true;
      const flushScope =
        typeof normalizedOptions.scope === "string" &&
        normalizedOptions.scope.trim()
          ? normalizedOptions.scope.trim()
          : "native-lifecycle";
      const saveCoordinator = window.ControlerStorage?.saveCoordinator;
      const hasQueuedSaveWork =
        typeof saveCoordinator?.hasPending === "function"
          ? saveCoordinator.hasPending()
          : false;
      if (!hasPendingStateChanges && !hasQueuedSaveWork) {
        persistMirrorSnapshot(true);
        return;
      }
      if (!hasPendingStateChanges && allowLifecycleDeferral) {
        persistMirrorSnapshot(true);
        emitStoragePerfMetric("storage-sync-shell-hide-flush-deferred", {
          reason: typeof reason === "string" ? reason : "",
          hasPendingStateChanges: false,
          hasQueuedSaveWork,
        });
        return;
      }
      if (
        !skipStatusRefresh &&
        saveCoordinator &&
        typeof saveCoordinator.enqueue === "function"
      ) {
        void saveCoordinator.enqueue(reason, flushScope).catch((error) => {
          console.error("强制立即保存 React Native 存储失败:", error);
        });
        return;
      }
      const flushOptions = {
        reason,
        scope: flushScope,
      };
      if (skipStatusRefresh) {
        flushOptions.skipStatusRefresh = true;
      }
      void window.ControlerStorage
        ?.flushJournal?.({
          ...flushOptions,
        })
        ?.catch((error) => {
          console.error("强制立即保存 React Native 存储失败:", error);
        });
    };
    function isCurrentPageNativeStorageChange(detail = {}) {
      const originPageInstanceId =
        typeof detail?.originPageInstanceId === "string"
          ? detail.originPageInstanceId.trim()
          : "";
      return !!originPageInstanceId && originPageInstanceId === STORAGE_PAGE_INSTANCE_ID;
    }
    window.addEventListener("controler:native-bridge-event", (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      if (detail.name === "storage.changed") {
        emitStorageDebug("native-bridge-storage-changed", {
          reason: typeof detail.reason === "string" ? detail.reason.trim() : "",
          source: typeof detail.source === "string" ? detail.source.trim() : "",
          originPageInstanceId:
            typeof detail.originPageInstanceId === "string"
              ? detail.originPageInstanceId.trim()
              : "",
          isCurrentPageChange: isCurrentPageNativeStorageChange(detail),
          hasPendingStateChanges: hasPendingStateChanges === true,
          changedSections: normalizeChangedSectionsList(detail.changedSections || []),
          changedPeriods: normalizeChangedPeriodsMap(detail.changedPeriods || {}),
        });
        emitStoragePerfMetric("storage-changed-bridge", {
          reason: typeof detail.reason === "string" ? detail.reason.trim() : "",
          source: typeof detail.source === "string" ? detail.source.trim() : "",
          originPageInstanceId:
            typeof detail.originPageInstanceId === "string"
              ? detail.originPageInstanceId.trim()
              : "",
          isCurrentPageChange: isCurrentPageNativeStorageChange(detail),
          hasPendingStateChanges: hasPendingStateChanges === true,
          changedSections: normalizeChangedSectionsList(detail.changedSections || []),
        });
        if (!shellPageActive) {
          queueNativeForegroundSyncOnShellResume(
            typeof detail.reason === "string" && detail.reason.trim()
              ? detail.reason.trim()
              : "external-update",
            {
              resetWindow: true,
              allowProbeOnlyBypass: false,
              forceSnapshotSync: true,
              forceDispatch: true,
              changedSections: detail.changedSections || [],
              changedPeriods: detail.changedPeriods || {},
              source:
                typeof detail.source === "string" ? detail.source.trim() : "",
              originPageInstanceId:
                typeof detail.originPageInstanceId === "string"
                  ? detail.originPageInstanceId.trim()
                  : "",
            },
          );
          return;
        }
        touchNativeFastProbeWindow();
        if (
          isCurrentPageNativeStorageChange(detail) &&
          !hasPendingStateChanges
        ) {
          markPendingNativeSelfChangeFingerprintAck();
          if (shouldRefreshNativeStatusAfterSelfWrite()) {
            scheduleNativeStatusRefresh({
              suppressError: true,
            });
          }
          scheduleNativeProbeLoop();
          return;
        }
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
                originPageInstanceId:
                  typeof detail.originPageInstanceId === "string"
                    ? detail.originPageInstanceId.trim()
                    : "",
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

      const previousShellVisibilityState = readCurrentShellVisibilityState();
      const previousTransitionLoading =
        previousShellVisibilityState?.transitionLoading === true;
      const nextActive = detail.active !== false;
      // Cached pages can stay logically active while the shell marks the slot as
      // transition-loading, so arm probe-only for either side of the transition.
      const shouldArmProbeOnlyOnTransitionLoad =
        detail.transitionLoading === true &&
        hasManagedCoreSnapshot &&
        !hasPendingStateChanges;
      if (
        shouldArmProbeOnlyOnTransitionLoad &&
        !preferProbeOnlyOnFirstShellResume
      ) {
        preferProbeOnlyOnFirstShellResume = true;
        emitStoragePerfMetric("storage-sync-shell-resume-armed", {
          reason: typeof detail.reason === "string" ? detail.reason : "",
          page: typeof detail.page === "string" ? detail.page : "",
          transitionLoading: true,
          active: nextActive === true,
          hasManagedCoreSnapshot: true,
        });
      }
      window.__CONTROLER_SHELL_VISIBILITY__ = {
        active: nextActive,
        slot: typeof detail.slot === "string" ? detail.slot : "",
        reason: typeof detail.reason === "string" ? detail.reason : "",
        page: typeof detail.page === "string" ? detail.page : "",
        href: typeof detail.href === "string" ? detail.href : "",
        transitionLoading: detail.transitionLoading === true,
        receivedAt: Date.now(),
      };
      if (shellPageActive === nextActive) {
        if (
          nextActive &&
          previousTransitionLoading &&
          detail.transitionLoading !== true &&
          pendingForegroundSyncRequest
        ) {
          const queuedForegroundSync = pendingForegroundSyncRequest;
          pendingForegroundSyncRequest = null;
          scheduleNativeForegroundSync(queuedForegroundSync.reason, {
            resetWindow: queuedForegroundSync.resetWindow === true,
            allowProbeOnlyBypass: queuedForegroundSync.allowProbeOnlyBypass,
            forceSnapshotSync: queuedForegroundSync.forceSnapshotSync,
            forceDispatch: queuedForegroundSync.forceDispatch,
            changedSections: queuedForegroundSync.changedSections || [],
            changedPeriods: queuedForegroundSync.changedPeriods || {},
            source: queuedForegroundSync.source || "",
            originPageInstanceId: queuedForegroundSync.originPageInstanceId || "",
          });
        }
        return;
      }

      shellPageActive = nextActive;
      emitStoragePerfMetric("storage-sync-shell-visibility", {
        active: shellPageActive === true,
        reason: typeof detail.reason === "string" ? detail.reason : "",
        page: typeof detail.page === "string" ? detail.page : "",
        transitionLoading: detail.transitionLoading === true,
        preferProbeOnlyOnFirstShellResume:
          preferProbeOnlyOnFirstShellResume === true,
        hasManagedCoreSnapshot: hasManagedCoreSnapshot === true,
        hasPendingStateChanges: hasPendingStateChanges === true,
      });
      if (!shellPageActive) {
        queueNativeForegroundSyncOnShellResume("shell-resume", {
          resetWindow: false,
        });
        stopNativeProbeLoop();
        const deferInternalTransitionHideFlush = document.hidden !== true;
        forceFlushNativeStorage("shell-hidden", {
          allowLifecycleDeferral: deferInternalTransitionHideFlush,
          skipStatusRefresh: deferInternalTransitionHideFlush,
        });
        return;
      }

      const queuedForegroundSync = pendingForegroundSyncRequest;
      if (queuedForegroundSync) {
        pendingForegroundSyncRequest = null;
        scheduleNativeForegroundSync(queuedForegroundSync.reason, {
          resetWindow: queuedForegroundSync.resetWindow === true,
          allowProbeOnlyBypass: queuedForegroundSync.allowProbeOnlyBypass,
          forceSnapshotSync: queuedForegroundSync.forceSnapshotSync,
          forceDispatch: queuedForegroundSync.forceDispatch,
          changedSections: queuedForegroundSync.changedSections || [],
          changedPeriods: queuedForegroundSync.changedPeriods || {},
          source: queuedForegroundSync.source || "",
          originPageInstanceId: queuedForegroundSync.originPageInstanceId || "",
        });
      } else {
        scheduleNativeForegroundSync("shell-resume", {
          resetWindow: false,
        });
      }
      scheduleNativeProbeLoop();
    });
    window.addEventListener("focus", () => {
      if (shouldIgnoreManagedAndroidWindowForegroundSyncTrigger("focus")) {
        return;
      }
      scheduleNativeForegroundSync("external-update");
    });
    window.addEventListener("pageshow", () => {
      if (shouldIgnoreManagedAndroidWindowForegroundSyncTrigger("pageshow")) {
        return;
      }
      scheduleNativeForegroundSync("external-update");
    });
    window.addEventListener("controler:native-app-resume", () => {
      if (!shellPageActive) {
        queueNativeForegroundSyncOnShellResume("shell-resume");
        return;
      }
      scheduleNativeForegroundSync("external-update");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        forceFlushNativeStorage("visibility-hidden");
        stopNativeProbeLoop();
        return;
      }
      if (!shellPageActive) {
        return;
      }
      if (
        shouldIgnoreManagedAndroidWindowForegroundSyncTrigger(
          "visibility-visible",
        )
      ) {
        return;
      }
      scheduleNativeForegroundSync("external-update");
      scheduleNativeProbeLoop();
    });
    window.addEventListener("beforeunload", () => {
      window.clearTimeout(writeTimer);
      window.clearTimeout(mirrorFlushTimer);
      stopNativeProbeLoop();
      forceFlushNativeStorage("beforeunload");
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
    useStateRecordsForProjectNormalization: true,
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
      return enrichStorageStatusWithRecovery({
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
      }, cachedBrowserState);
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
