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
    if (typeof storageBundle?.rebuildProjectDurationCaches === "function") {
      base.projects = storageBundle.rebuildProjectDurationCaches(
        base.projects,
        base.records,
      );
    }

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
      async getPlanBootstrapState(options = {}) {
        const includeRecurringPlans = options?.includeRecurringPlans !== false;
        const includeYearlyGoals = options?.includeYearlyGoals !== false;
        const state = readState();
        const planItems = Array.isArray(state?.plans) ? state.plans : [];
        const payload = {};
        if (includeYearlyGoals) {
          payload.yearlyGoals = cloneValue(state?.yearlyGoals || {});
        }
        if (includeRecurringPlans) {
          payload.recurringPlans = cloneValue(
            planItems.filter((item) =>
              typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none",
            ),
          );
        }
        return payload;
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
          return electronAPI.storageGetCoreState();
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
          const changedSections = inferChangedSectionsFromCorePatch(partialCore);
          const result = await electronAPI.storageReplaceCoreState(
            partialCore,
            normalizedOptions,
          );
          if (normalizedOptions.emitChange === false) {
            assignState({
              ...readState(),
              ...(partialCore && typeof partialCore === "object" ? partialCore : {}),
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
    let cachedState = normalizeState(initialMirrorState, {
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
    let nativeProbeInFlight = false;
    let nativeFastProbeUntil = 0;
    let recentNativeLocalWriteAt = 0;
    let lastFallbackHashProbeAt = 0;
    let lastWrittenComparableSnapshot = initialMirrorPendingWrite
      ? ""
      : createComparableSnapshot(cachedState);
    let lastMirroredStateJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATE_KEY) || "";
    let lastMirroredStatusJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATUS_KEY) || "";
    let lastMirroredPendingWriteValue = initialMirrorPendingWrite ? "1" : "0";
    let hasPendingStateChanges = initialMirrorPendingWrite;
    let managedStateRevision = initialMirrorPendingWrite ? 1 : 0;
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
    let hasManagedCoreSnapshot = !!initialMirrorStateRaw.trim();
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
      cachedStatus = await getNativeStatusSnapshot({
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
        return;
      }

      updateVersionBaseline(cachedStatus);
      persistMirrorSnapshot(true);
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
      const currentState = normalizeState(
        isPlainObject(baseState) ? baseState : readState(),
        buildMobileMetadata(),
      );
      const currentCoreSnapshot = buildManagedCoreStateSnapshot(currentState);
      const nextRecurringPlans = Array.isArray(corePayload?.recurringPlans)
        ? corePayload.recurringPlans
        : currentCoreSnapshot.recurringPlans;
      return {
        ...currentState,
        projects: Array.isArray(corePayload?.projects)
          ? corePayload.projects
          : currentCoreSnapshot.projects,
        todos: Array.isArray(corePayload?.todos)
          ? corePayload.todos
          : currentCoreSnapshot.todos,
        checkinItems: Array.isArray(corePayload?.checkinItems)
          ? corePayload.checkinItems
          : currentCoreSnapshot.checkinItems,
        yearlyGoals: isPlainObject(corePayload?.yearlyGoals)
          ? corePayload.yearlyGoals
          : currentCoreSnapshot.yearlyGoals,
        diaryCategories: Array.isArray(corePayload?.diaryCategories)
          ? corePayload.diaryCategories
          : currentCoreSnapshot.diaryCategories,
        guideState:
          guideBundle?.normalizeGuideState?.(
            isPlainObject(corePayload) &&
              Object.prototype.hasOwnProperty.call(corePayload, "guideState")
              ? corePayload.guideState
              : currentCoreSnapshot.guideState,
          ) || currentCoreSnapshot.guideState,
        customThemes: Array.isArray(corePayload?.customThemes)
          ? corePayload.customThemes
          : currentCoreSnapshot.customThemes,
        builtInThemeOverrides: isPlainObject(corePayload?.builtInThemeOverrides)
          ? corePayload.builtInThemeOverrides
          : currentCoreSnapshot.builtInThemeOverrides,
        selectedTheme:
          typeof corePayload?.selectedTheme === "string" &&
          corePayload.selectedTheme.trim()
            ? corePayload.selectedTheme.trim()
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
        createdAt: corePayload?.createdAt || currentCoreSnapshot.createdAt || null,
        lastModified:
          corePayload?.lastModified || currentCoreSnapshot.lastModified || null,
        storagePath:
          corePayload?.storagePath || currentCoreSnapshot.storagePath || null,
        storageDirectory:
          corePayload?.storageDirectory ||
          currentCoreSnapshot.storageDirectory ||
          null,
        userDataPath:
          corePayload?.userDataPath || currentCoreSnapshot.userDataPath || null,
        documentsPath:
          corePayload?.documentsPath || currentCoreSnapshot.documentsPath || null,
        syncMeta: isPlainObject(corePayload?.syncMeta)
          ? corePayload.syncMeta
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
              return optimisticResult;
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
        async getPlanBootstrapState(options = {}) {
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const managedSnapshot = getManagedPlanBootstrapStateSnapshot(
            normalizedOptions,
          );
          if (hasManagedCoreSnapshot) {
            scheduleManagedFastValidation("plan-bootstrap-fast-path");
            return managedSnapshot;
          }
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.getPlanBootstrapState",
              {
                options: normalizedOptions,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return applyManagedPlanBootstrapSnapshot(
                parsed,
                normalizedOptions,
              );
            }
          } catch (error) {
            console.error(
              "读取 React Native 计划引导状态失败，回退本地快照:",
              error,
            );
          }
          return managedSnapshot;
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
              const currentState = readState();
              cachedState = normalizeState(
                mergeManagedStateWithNativeCorePayload(parsed, currentState),
                buildMobileMetadata(parsed),
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
            storageBundle?.mergePartitionItems?.(
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
            return optimisticResult;
          }
        },
        async replaceCoreState(partialCore = {}, options = {}) {
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          const changedSections = inferChangedSectionsFromCorePatch(partialCore);
          assignState({
            ...readState(),
            ...(partialCore && typeof partialCore === "object" ? partialCore : {}),
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
                    partialCore,
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
            return optimisticResult;
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
            return recurringPlans;
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
