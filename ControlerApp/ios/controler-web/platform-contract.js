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
