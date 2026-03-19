(() => {
  const CONTROLER_STORAGE_EVENT = "controler:storage-data-changed";
  const CONTROLER_STORAGE_ERROR_EVENT = "controler:storage-sync-error";
  const MOBILE_FILE_NAME = "bundle-manifest.json";
  const BROWSER_STATE_KEY = "__controler_browser_state__";
  const MOBILE_MIRROR_STATE_KEY = "__controler_mobile_state__";
  const MOBILE_MIRROR_STATUS_KEY = "__controler_mobile_status__";
  const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
  const MOBILE_MIRROR_FLUSH_DELAY_MS = 90;
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
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const LEGACY_LOCAL_ONLY_THEME_KEYS = Object.freeze([
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const SHARED_BOOTSTRAP_MIRROR_KEYS = Object.freeze([
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
  ]);
  const DEFAULT_CHANGED_SECTIONS = Object.freeze([
    "core",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "diaryEntries",
    "diaryCategories",
    "plansRecurring",
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
    "guideState",
    "statsPreferences",
    "projectHierarchyExpansionState",
    "projectTableScale",
    "planWeekScale",
  ]);
  const LOCAL_ONLY_KEY_PREFIXES = ["stats-view-size:"];

  function createDefaultNavigationVisibility() {
    return {
      hiddenPages: [],
      order: ["index", "stats", "plan", "diary", "settings"],
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
        return guideBundle?.normalizeGuideState?.(value) ||
          value ||
          {
            bundleVersion: 1,
            dismissedCardIds: [],
          };
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

  function migrateLegacyLocalOnlyThemeValues(rawState) {
    const target =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    LEGACY_LOCAL_ONLY_THEME_KEYS.forEach((key) => {
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
    const sourceState = migrateLegacyLocalOnlyThemeValues(
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
    if (guideBundle?.shouldSeedGuideBundle?.(guideSource)) {
      base.diaryEntries = guideBundle.buildGuideDiaryEntries();
      base.diaryCategories = [];
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
      capabilities:
        extra.capabilities && typeof extra.capabilities === "object"
          ? { ...extra.capabilities }
          : {},
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
      extraMethods = {},
    } = options;

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
      capabilities:
        capabilities && typeof capabilities === "object" ? { ...capabilities } : {},
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
        if (typeof persistNow === "function") {
          return persistNow();
        }
        persistState({ reason: "manual-persist-now" });
        return cloneValue(readState());
      },
      async flush() {
        return this.persistNow();
      },
      async getStorageStatus() {
        if (typeof getStorageStatus !== "function") {
          return null;
        }
        return getStorageStatus();
      },
      async getPlanBootstrapState() {
        const state = readState();
        const planItems = Array.isArray(state?.plans) ? state.plans : [];
        return {
          yearlyGoals: cloneValue(state?.yearlyGoals || {}),
          recurringPlans: cloneValue(
            planItems.filter((item) =>
              typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none",
            ),
          ),
        };
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

    async function flushElectronState() {
      const nextState = normalizeState(readState(), {
        touchModified: true,
        touchSyncSave: true,
      });
      cachedState = nextState;
      await electronAPI.storageSaveSnapshot(nextState);
      cachedStatus = await electronAPI.storageFlush().catch((error) => {
        console.error("刷新 Electron 存储状态失败:", error);
        return null;
      });
      hasPendingStateChanges = false;
      return cachedStatus;
    }

    function persistState() {
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
            changedSections: ["core"],
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
    let lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
    let lastMirroredStateJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATE_KEY) || "";
    let lastMirroredStatusJson =
      nativeMethods.getItem?.call(window.localStorage, MOBILE_MIRROR_STATUS_KEY) || "";
    let hasPendingStateChanges = false;
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

    function createManagedSectionCoverage() {
      return MANAGED_RANGE_SECTIONS.reduce((coverage, section) => {
        coverage[section] = new Set();
        return coverage;
      }, {});
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
      const nextState = normalizeState(readState(), {
        ...buildMobileMetadata(),
        touchModified: true,
        touchSyncSave: true,
      });
      cachedState = nextState;
      const serializedState = JSON.stringify(nextState, null, 2);
      const nextComparableSnapshot = createComparableSnapshot(nextState);

      if (nextComparableSnapshot === lastWrittenComparableSnapshot) {
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
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
      return cachedStatus;
    }

    function persistState() {
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
      const { forceDispatch = false, suppressError = false } = options;
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
        dispatchStorageChangedEvent(reason, buildMergedState(cachedState), cachedStatus);
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
      const nextCore = await getNativeCoreStateSnapshot({
        suppressError: true,
      });
      cachedStatus = await getNativeStatusSnapshot({
        suppressError: true,
      });
      if (nextCore) {
        const currentSnapshot = createComparableSnapshot(readState());
        const nextState = normalizeState(
          {
            ...readState(),
            projects: Array.isArray(nextCore.projects) ? nextCore.projects : [],
            records: Array.isArray(readState()?.records) ? readState().records : [],
            plans: [
              ...(
                Array.isArray(readState()?.plans)
                  ? readState().plans.filter((item) =>
                      typeof storageBundle?.isRecurringPlan === "function"
                        ? !storageBundle.isRecurringPlan(item)
                        : String(item?.repeat || "").trim().toLowerCase() === "none",
                    )
                  : []
              ),
              ...(
                Array.isArray(nextCore.recurringPlans) ? nextCore.recurringPlans : []
              ),
            ],
            todos: Array.isArray(nextCore.todos) ? nextCore.todos : [],
            checkinItems: Array.isArray(nextCore.checkinItems)
              ? nextCore.checkinItems
              : [],
            dailyCheckins: Array.isArray(readState()?.dailyCheckins)
              ? readState().dailyCheckins
              : [],
            checkins: Array.isArray(readState()?.checkins) ? readState().checkins : [],
            yearlyGoals:
              nextCore.yearlyGoals &&
              typeof nextCore.yearlyGoals === "object" &&
              !Array.isArray(nextCore.yearlyGoals)
                ? nextCore.yearlyGoals
                : {},
            diaryEntries: Array.isArray(readState()?.diaryEntries)
              ? readState().diaryEntries
              : [],
            diaryCategories: Array.isArray(nextCore.diaryCategories)
              ? nextCore.diaryCategories
              : [],
            customThemes: Array.isArray(nextCore.customThemes)
              ? nextCore.customThemes
              : [],
            builtInThemeOverrides:
              nextCore.builtInThemeOverrides &&
              typeof nextCore.builtInThemeOverrides === "object" &&
              !Array.isArray(nextCore.builtInThemeOverrides)
                ? nextCore.builtInThemeOverrides
                : {},
            selectedTheme:
              typeof nextCore.selectedTheme === "string" &&
              nextCore.selectedTheme.trim()
                ? nextCore.selectedTheme.trim()
                : "default",
            createdAt: nextCore.createdAt || null,
            lastModified: nextCore.lastModified || null,
            storagePath: nextCore.storagePath || null,
            storageDirectory: nextCore.storageDirectory || null,
            userDataPath: nextCore.userDataPath || null,
            documentsPath: nextCore.documentsPath || null,
            syncMeta: nextCore.syncMeta || null,
          },
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

    function getManagedPlanBootstrapStateSnapshot() {
      const state = readState();
      const planItems = Array.isArray(state?.plans) ? state.plans : [];
      return {
        yearlyGoals: cloneValue(state?.yearlyGoals || {}),
        recurringPlans: cloneValue(
          planItems.filter((item) =>
            typeof storageBundle?.isRecurringPlan === "function"
              ? storageBundle.isRecurringPlan(item)
              : String(item?.repeat || "").trim().toLowerCase() !== "none",
          ),
        ),
      };
    }

    function applyManagedPlanBootstrapSnapshot(payload = {}) {
      const currentState = readState();
      cachedState = normalizeState({
        ...currentState,
        yearlyGoals:
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
          ...(Array.isArray(payload?.recurringPlans) ? payload.recurringPlans : []),
        ],
      }, buildMobileMetadata(payload));
      hasManagedCoreSnapshot = true;
      lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
      hasPendingStateChanges = false;
      persistMirrorSnapshot(true);
      clearStorageSyncError();
      touchNativeFastProbeWindow();
      scheduleNativeProbeLoop();
      return getManagedPlanBootstrapStateSnapshot();
    }

    function getManagedCoreStateSnapshot() {
      const state = readState();
      const planBootstrapState = getManagedPlanBootstrapStateSnapshot();
      return {
        projects: cloneValue(state?.projects || []),
        todos: cloneValue(state?.todos || []),
        checkinItems: cloneValue(state?.checkinItems || []),
        yearlyGoals: planBootstrapState.yearlyGoals,
        diaryCategories: cloneValue(state?.diaryCategories || []),
        customThemes: cloneValue(state?.customThemes || []),
        builtInThemeOverrides: cloneValue(state?.builtInThemeOverrides || {}),
        selectedTheme:
          typeof state?.selectedTheme === "string" && state.selectedTheme.trim()
            ? state.selectedTheme.trim()
            : "default",
        createdAt: state?.createdAt || null,
        lastModified: state?.lastModified || null,
        storagePath: state?.storagePath || null,
        storageDirectory: state?.storageDirectory || null,
        userDataPath: state?.userDataPath || null,
        documentsPath: state?.documentsPath || null,
        syncMeta: cloneValue(state?.syncMeta || null),
        recurringPlans: planBootstrapState.recurringPlans,
      };
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
        async getPlanBootstrapState() {
          const managedSnapshot = getManagedPlanBootstrapStateSnapshot();
          if (hasManagedCoreSnapshot) {
            scheduleManagedFastValidation("plan-bootstrap-fast-path");
            return managedSnapshot;
          }
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.getPlanBootstrapState",
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              return applyManagedPlanBootstrapSnapshot(parsed);
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
              cachedState = normalizeState({
                ...currentState,
                projects: parsed.projects || [],
                todos: parsed.todos || [],
                checkinItems: parsed.checkinItems || [],
                yearlyGoals: parsed.yearlyGoals || {},
                diaryCategories: parsed.diaryCategories || [],
                customThemes:
                  Array.isArray(parsed.customThemes)
                    ? parsed.customThemes
                    : currentState?.customThemes || [],
                builtInThemeOverrides:
                  parsed.builtInThemeOverrides &&
                  typeof parsed.builtInThemeOverrides === "object" &&
                  !Array.isArray(parsed.builtInThemeOverrides)
                    ? parsed.builtInThemeOverrides
                    : currentState?.builtInThemeOverrides || {},
                selectedTheme:
                  typeof parsed.selectedTheme === "string" && parsed.selectedTheme.trim()
                    ? parsed.selectedTheme.trim()
                    : currentState?.selectedTheme || "default",
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
                  ...(Array.isArray(parsed.recurringPlans) ? parsed.recurringPlans : []),
                ],
                createdAt: parsed.createdAt || currentState?.createdAt || null,
                lastModified: parsed.lastModified || currentState?.lastModified || null,
                storagePath: parsed.storagePath || currentState?.storagePath || null,
                storageDirectory:
                  parsed.storageDirectory || currentState?.storageDirectory || null,
                userDataPath: parsed.userDataPath || currentState?.userDataPath || null,
                documentsPath:
                  parsed.documentsPath || currentState?.documentsPath || null,
                syncMeta: parsed.syncMeta || currentState?.syncMeta || null,
              }, buildMobileMetadata(parsed));
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
          try {
            const rawPayload = await reactNativeBridge.call("storage.saveSectionRange", {
              section,
              payload,
            });
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              if (section === "plans") {
                const recurringPlans = (state?.plans || []).filter((item) =>
                  typeof storageBundle?.isRecurringPlan === "function"
                    ? storageBundle.isRecurringPlan(item)
                    : String(item?.repeat || "").trim().toLowerCase() !== "none",
                );
                assignState({
                  ...state,
                  plans: [...remainingItems, ...mergedItems, ...recurringPlans],
                });
              } else {
                assignState({
                  ...state,
                  [section]: [...remainingItems, ...mergedItems],
                });
              }
              hasManagedCoreSnapshot = true;
              lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
              hasPendingStateChanges = false;
              markManagedSectionPeriodsLoaded(section, [periodId]);
              persistMirrorSnapshot(true);
              touchRecentNativeLocalWriteWindow();
              touchNativeFastProbeWindow();
              scheduleNativeProbeLoop();
              return parsed;
            }
          } catch (error) {
            console.error("保存 React Native 分区范围失败，回退本地缓存:", error);
          }
          if (section === "plans") {
            const recurringPlans = (state?.plans || []).filter((item) =>
              typeof storageBundle?.isRecurringPlan === "function"
                ? storageBundle.isRecurringPlan(item)
                : String(item?.repeat || "").trim().toLowerCase() !== "none",
            );
            assignState({
              ...state,
              plans: [...remainingItems, ...mergedItems, ...recurringPlans],
            });
          } else {
            assignState({
              ...state,
              [section]: [...remainingItems, ...mergedItems],
            });
          }
          hasManagedCoreSnapshot = true;
          markManagedSectionPeriodsLoaded(section, [periodId]);
          persistState({ reason: "section-save", key: section });
          return {
            section,
            periodId,
            count: mergedItems.length,
          };
        },
        async replaceCoreState(partialCore = {}, options = {}) {
          const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};
          try {
            const rawPayload = await reactNativeBridge.call("storage.replaceCoreState", {
              partialCore,
              options: normalizedOptions,
            });
            const parsed = parseJsonSafely(rawPayload, null);
            if (parsed && typeof parsed === "object") {
              assignState({
                ...readState(),
                ...(partialCore && typeof partialCore === "object" ? partialCore : {}),
              });
              hasManagedCoreSnapshot = true;
              lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
              hasPendingStateChanges = false;
              persistMirrorSnapshot(true);
              touchRecentNativeLocalWriteWindow();
              touchNativeFastProbeWindow();
              scheduleNativeProbeLoop();
              return parsed;
            }
          } catch (error) {
            console.error("替换 React Native 核心状态失败，回退本地缓存:", error);
          }
          assignState({
            ...readState(),
            ...(partialCore && typeof partialCore === "object" ? partialCore : {}),
          });
          persistState({
            reason:
              typeof normalizedOptions.reason === "string" &&
              normalizedOptions.reason.trim()
                ? normalizedOptions.reason.trim()
                : "core-replace",
          });
          return getManagedCoreStateSnapshot();
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
          try {
            const rawPayload = await reactNativeBridge.call(
              "storage.replaceRecurringPlans",
              {
                items: recurringPlans,
              },
            );
            const parsed = parseJsonSafely(rawPayload, null);
            if (Array.isArray(parsed)) {
              assignState({
                ...state,
                plans: [...oneTimePlans, ...parsed],
              });
              hasManagedCoreSnapshot = true;
              lastWrittenComparableSnapshot = createComparableSnapshot(cachedState);
              hasPendingStateChanges = false;
              persistMirrorSnapshot(true);
              touchRecentNativeLocalWriteWindow();
              touchNativeFastProbeWindow();
              scheduleNativeProbeLoop();
              return parsed;
            }
          } catch (error) {
            console.error("替换 React Native 重复计划失败，回退本地缓存:", error);
          }
          assignState({
            ...state,
            plans: [...oneTimePlans, ...recurringPlans],
          });
          persistState({ reason: "plans-recurring-replace" });
          return recurringPlans;
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
