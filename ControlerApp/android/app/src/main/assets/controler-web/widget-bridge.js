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
      !snapshot.hasNativeCall
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
