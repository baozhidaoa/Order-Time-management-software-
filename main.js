const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  dialog,
  Notification,
  screen,
  Tray,
} = require("electron");
const fs = require("fs");
const path = require("path");
const appPackage = require("./package.json");
const StorageManager = require("./storage-manager");
const DesktopWidgetManager = require("./desktop-widget-manager");
const DesktopNotificationScheduler = require("./desktop-notification-scheduler");
const uiLanguage = require("./shared/ui-language.js");

const LOGIN_ITEM_LAUNCH_ARG = "--controler-launch-at-login";
const APP_PUBLIC_NAME = "Order";
const APP_PUBLIC_DESCRIPTION =
  "Local-first time tracking, planning, todos, check-ins, diary, and widgets.";
const APP_PUBLIC_COPYRIGHT = "© 2026 Order contributors";
const UI_PREFERENCES_FILE_NAME = "ui-preferences.json";
const STARTUP_DEBUG_LOG_FILE_NAME = "startup-debug.log";

function appendStartupDebugLog(message) {
  try {
    const baseDir = process.env.APPDATA
      ? path.join(process.env.APPDATA, APP_PUBLIC_NAME)
      : path.join(path.dirname(process.execPath), "logs");
    fs.mkdirSync(baseDir, { recursive: true });
    fs.appendFileSync(
      path.join(baseDir, STARTUP_DEBUG_LOG_FILE_NAME),
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  } catch (error) {
    // Ignore debug logging failures.
  }
}

process.on("uncaughtException", (error) => {
  appendStartupDebugLog(`uncaughtException: ${error?.stack || error?.message || String(error)}`);
});

process.on("unhandledRejection", (reason) => {
  appendStartupDebugLog(`unhandledRejection: ${reason?.stack || reason?.message || String(reason)}`);
});

app.setName(APP_PUBLIC_NAME);
appendStartupDebugLog("main.js loaded");
if (process.platform === "win32") {
  app.setAppUserModelId("com.controler.timetracker");
  // Electron 28 on Windows still hits Chromium/DirectComposition stale-pixel
  // rendering bugs in custom chrome + heavy dashboard layouts. Falling back to
  // software rendering avoids the "only repaints on hover/focus" failure mode
  // until the app can move to an Electron version with the upstream fix.
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-direct-composition");
  app.disableHardwareAcceleration();
}

let mainWindow;
let appTray = null;
const uiPreferencesPath = path.join(
  app.getPath("userData"),
  UI_PREFERENCES_FILE_NAME,
);

function readUiPreferences() {
  try {
    if (!fs.existsSync(uiPreferencesPath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(uiPreferencesPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.error("读取界面偏好失败:", error);
    return {};
  }
}

function readStoredUiLanguage() {
  const preferences = readUiPreferences();
  return uiLanguage.normalizeLanguage(preferences.language);
}

let currentUiLanguage = readStoredUiLanguage();

function persistUiLanguage(language) {
  const nextLanguage = uiLanguage.normalizeLanguage(language);
  try {
    const currentPreferences = readUiPreferences();
    const nextPreferences = {
      ...currentPreferences,
      language: nextLanguage,
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(uiPreferencesPath), { recursive: true });
    fs.writeFileSync(
      uiPreferencesPath,
      JSON.stringify(nextPreferences, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("写入界面偏好失败:", error);
  }
  return nextLanguage;
}

function getCurrentUiLanguage() {
  return uiLanguage.normalizeLanguage(currentUiLanguage);
}

function getDesktopIconPath() {
  return process.platform === "win32"
    ? path.join(__dirname, "images", "Order.ico")
    : path.join(__dirname, "images", "Order.png");
}

function nativeText(keyPath, params = {}) {
  return uiLanguage.t(getCurrentUiLanguage(), keyPath, params);
}

function getDialogOkLabel() {
  return nativeText("dialog.ok");
}

function buildDialogFilters(definitions = []) {
  return definitions.map((definition) => ({
    name: nativeText(`filter.${definition.key}`),
    extensions: Array.isArray(definition.extensions)
      ? definition.extensions
      : ["*"],
  }));
}

function buildStorageStatusMessage(status = {}) {
  return nativeText("dialog.storageStatusMessage", {
    projects: status.projects || 0,
    records: status.records || 0,
    sizeKb: (Number(status.size || 0) / 1024).toFixed(2),
    storagePath: status.storagePath || "",
  });
}

function setCurrentUiLanguage(language) {
  const nextLanguage = persistUiLanguage(language);
  const languageChanged = nextLanguage !== currentUiLanguage;
  currentUiLanguage = nextLanguage;
  if (languageChanged) {
    createApplicationMenu();
    desktopWidgetManager.refreshLocalizedTitles();
    refreshTrayMenu();
  }
  return currentUiLanguage;
}

const storageManager = new StorageManager(app);
const desktopWidgetManager = new DesktopWidgetManager({
  app,
  BrowserWindow,
  baseDir: __dirname,
  preloadPath: path.join(__dirname, "preload.js"),
  bridgeHealthLogger: scheduleBridgeHealthLog,
  getLanguage: () => currentUiLanguage,
});
const desktopNotificationScheduler = new DesktopNotificationScheduler({
  app,
  Notification,
  getLanguage: () => currentUiLanguage,
});
let isQuitting = false;
const DEFAULT_WINDOW_APPEARANCE = {
  backgroundColor: "#26312a",
  overlayColor: "#20362b",
  symbolColor: "#f5fff8",
  overlayHeight: 38,
};
const USE_NATIVE_TITLEBAR_OVERLAY = false;
const PAGE_READY_REVEAL_TIMEOUT_MS = 2600;
const WINDOW_MOVE_EDGE_INSET_PX = 12;
const WINDOW_MOVE_GUARD_RELEASE_DELAY_MS = 120;
let windowAppearance = { ...DEFAULT_WINDOW_APPEARANCE };
const windowMoveGuardState = new WeakMap();

function disableWindowsAccentBorder(targetWindow) {
  if (
    process.platform !== "win32" ||
    !targetWindow ||
    targetWindow.isDestroyed() ||
    typeof targetWindow.setAccentColor !== "function"
  ) {
    return;
  }

  try {
    targetWindow.setAccentColor(false);
  } catch (error) {
    console.warn("关闭窗口活动边框高亮失败:", error);
  }
}

async function logRendererBridgeHealth(targetWindow, context = {}) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  try {
    const bridgeState = await targetWindow.webContents.executeJavaScript(
      `(() => {
        const electronAPI = window.electronAPI || null;
        const bridgeHealth =
          electronAPI?.bridgeHealth && typeof electronAPI.bridgeHealth === "object"
            ? electronAPI.bridgeHealth
            : null;
        const userAgent =
          typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
        return {
          href: typeof window.location?.href === "string" ? window.location.href : "",
          userAgentHasElectron: /\\\\bElectron\\\\/\\\\d+/i.test(userAgent),
          hasElectronAPI: !!electronAPI,
          hasVersionsBridge: !!window.versions,
          isElectronFlag: !!electronAPI?.isElectron,
          windowChromeMode:
            typeof electronAPI?.windowChromeMode === "string"
              ? electronAPI.windowChromeMode
              : "",
          bridgeHealthStatus:
            typeof bridgeHealth?.status === "string" ? bridgeHealth.status : "",
          apiMethods: {
            windowBeginMove: typeof electronAPI?.windowBeginMove === "function",
            windowEndMove: typeof electronAPI?.windowEndMove === "function",
            windowUpdateAppearance:
              typeof electronAPI?.windowUpdateAppearance === "function",
            windowHide: typeof electronAPI?.windowHide === "function",
            windowMinimize: typeof electronAPI?.windowMinimize === "function",
            windowToggleMaximize:
              typeof electronAPI?.windowToggleMaximize === "function",
            windowClose: typeof electronAPI?.windowClose === "function",
            desktopWidgetsCreate:
              typeof electronAPI?.desktopWidgetsCreate === "function",
            desktopWidgetsGetState:
              typeof electronAPI?.desktopWidgetsGetState === "function",
          },
        };
      })()`,
      true,
    );

    console.info(
      "[bridge-health]",
      JSON.stringify({
        windowId: targetWindow.id,
        ...context,
        ...(bridgeState && typeof bridgeState === "object" ? bridgeState : {}),
      }),
    );
  } catch (error) {
    console.warn("[bridge-health]", {
      windowId: targetWindow.id,
      ...context,
      error: error?.message || String(error),
    });
  }
}

function scheduleBridgeHealthLog(targetWindow, context = {}) {
  if (
    !targetWindow ||
    targetWindow.isDestroyed() ||
    targetWindow.__controlerBridgeHealthScheduled
  ) {
    return;
  }

  targetWindow.__controlerBridgeHealthScheduled = true;
  setTimeout(() => {
    void logRendererBridgeHealth(targetWindow, context);
  }, 0);
}

function clampWindowMoveTarget(targetWindow, nextX, nextY) {
  if (
    !targetWindow ||
    targetWindow.isDestroyed() ||
    !screen ||
    typeof screen.getDisplayNearestPoint !== "function"
  ) {
    return {
      x: nextX,
      y: nextY,
    };
  }

  const windowBounds = targetWindow.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: nextX,
    y: nextY,
  });
  const workArea = display?.workArea || display?.bounds;
  if (!workArea) {
    return {
      x: nextX,
      y: nextY,
    };
  }

  const horizontalInset =
    workArea.width > windowBounds.width + WINDOW_MOVE_EDGE_INSET_PX * 2
      ? WINDOW_MOVE_EDGE_INSET_PX
      : 0;
  const verticalInset =
    workArea.height > windowBounds.height + WINDOW_MOVE_EDGE_INSET_PX * 2
      ? WINDOW_MOVE_EDGE_INSET_PX
      : 0;
  const maxX =
    workArea.x +
    Math.max(0, workArea.width - windowBounds.width - horizontalInset);
  const maxY =
    workArea.y +
    Math.max(0, workArea.height - windowBounds.height - verticalInset);

  return {
    x: Math.min(Math.max(nextX, workArea.x + horizontalInset), maxX),
    y: Math.min(Math.max(nextY, workArea.y + verticalInset), maxY),
  };
}

function setWindowMoveGuard(targetWindow, active) {
  if (!targetWindow || targetWindow.isDestroyed() || process.platform !== "win32") {
    return false;
  }

  let state = windowMoveGuardState.get(targetWindow);
  if (!state) {
    state = {
      depth: 0,
      restoreTimer: null,
      resizable: null,
      maximizable: null,
    };
    windowMoveGuardState.set(targetWindow, state);
  }

  if (active) {
    if (state.restoreTimer) {
      clearTimeout(state.restoreTimer);
      state.restoreTimer = null;
    }
    state.depth += 1;
    if (state.depth > 1) {
      return true;
    }

    state.resizable =
      typeof targetWindow.isResizable === "function"
        ? targetWindow.isResizable()
        : null;
    state.maximizable =
      typeof targetWindow.isMaximizable === "function"
        ? targetWindow.isMaximizable()
        : null;

    try {
      if (state.maximizable && typeof targetWindow.setMaximizable === "function") {
        targetWindow.setMaximizable(false);
      }
    } catch {}

    try {
      if (state.resizable && typeof targetWindow.setResizable === "function") {
        targetWindow.setResizable(false);
      }
    } catch {}

    return true;
  }

  if (state.depth <= 0) {
    return false;
  }

  state.depth -= 1;
  if (state.depth > 0) {
    return true;
  }

  state.restoreTimer = setTimeout(() => {
    state.restoreTimer = null;
    if (!targetWindow || targetWindow.isDestroyed()) {
      return;
    }

    try {
      if (
        typeof state.resizable === "boolean" &&
        typeof targetWindow.setResizable === "function"
      ) {
        targetWindow.setResizable(state.resizable);
      }
    } catch {}

    try {
      if (
        typeof state.maximizable === "boolean" &&
        typeof targetWindow.setMaximizable === "function"
      ) {
        targetWindow.setMaximizable(state.maximizable);
      }
    } catch {}

    state.resizable = null;
    state.maximizable = null;
  }, WINDOW_MOVE_GUARD_RELEASE_DELAY_MS);

  return true;
}

function getWindowState(targetWindow = mainWindow) {
  return {
    isMaximized:
      !!targetWindow && !targetWindow.isDestroyed()
        ? targetWindow.isMaximized()
        : false,
  };
}

function emitWindowStateChanged(targetWindow = mainWindow) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(
      "window-state-changed",
      getWindowState(targetWindow),
    );
  }
}

function getWindowAppearanceState(targetWindow = mainWindow) {
  return {
    ...windowAppearance,
    windowChromeMode: USE_NATIVE_TITLEBAR_OVERLAY
      ? "native-overlay"
      : "custom-overlay",
    effectiveOverlayHeight: windowAppearance.overlayHeight,
    ...getWindowState(targetWindow),
  };
}

function resolveWindowFromEvent(event = null) {
  if (event?.sender) {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      return senderWindow;
    }
  }
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function emitThemedMessage(payload = {}, fallbackOptions = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send("ui:themed-message", payload);
      return true;
    } catch (error) {
      console.error("发送主题消息失败:", error);
    }
  }
  if (fallbackOptions) {
    dialog.showMessageBox(mainWindow, fallbackOptions);
  }
  return false;
}

// 存储操作函数
function loadStorageData() {
  return storageManager.loadStorageData();
}

async function loadStorageSnapshot() {
  return storageManager.loadStorageSnapshot();
}

function saveStorageData(data) {
  return storageManager.saveStorageData(data);
}

async function saveStorageSnapshot(data) {
  return storageManager.saveStorageSnapshot(data);
}

async function flushStorageSnapshot() {
  return storageManager.flushPendingWrites();
}

// 获取存储状态
function getStorageStatus() {
  return storageManager.getStorageStatus();
}

function getAutoBackupStatus() {
  return storageManager.getAutoBackupStatus();
}

function updateAutoBackupSettings(settings) {
  return storageManager.updateAutoBackupSettings(settings);
}

function runAutoBackupNow() {
  return storageManager.runAutoBackupNow();
}

// 导出数据到文件
function exportDataToFile(filePath) {
  return storageManager.exportDataToFile(filePath);
}

// 从文件导入数据
function importDataFromFile(filePath) {
  return storageManager.importDataFromFile(filePath);
}

function getStorageManifest() {
  return storageManager.getManifest();
}

function getStorageCoreState() {
  return storageManager.getCoreState();
}

function loadStorageSectionRange(section, scope) {
  return storageManager.loadSectionRange(section, scope);
}

function saveStorageSectionRange(section, payload) {
  return storageManager.saveSectionRange(section, payload);
}

function replaceStorageCoreState(partialCore, options = {}) {
  return storageManager.replaceCoreState(partialCore, options);
}

function replaceStorageRecurringPlans(items) {
  return storageManager.replaceRecurringPlans(items);
}

function exportStorageBundle(options) {
  return storageManager.exportBundle(options);
}

function importStorageSource(options) {
  return storageManager.importSource(options);
}

async function shareLatestAutoBackup() {
  const status = getAutoBackupStatus();
  const latestBackupPath =
    typeof status?.latestBackupPath === "string"
      ? status.latestBackupPath.trim()
      : "";
  if (!latestBackupPath) {
    return {
      ok: false,
      shared: false,
      message: nativeText("backup.noLatestBackup"),
    };
  }
  try {
    shell.showItemInFolder(latestBackupPath);
    return {
      ok: true,
      shared: true,
      path: latestBackupPath,
      message: nativeText("backup.revealLatestBackupSuccess"),
    };
  } catch (error) {
    console.error("定位最新备份文件失败:", error);
    return {
      ok: false,
      shared: false,
      path: latestBackupPath,
      message:
        error?.message || nativeText("backup.revealLatestBackupFailure"),
    };
  }
}

// 清除所有数据
function clearStorageData() {
  return storageManager.clearStorageData();
}

function resolveTargetPageFile(targetPage = "index") {
  const normalizedPage =
    typeof targetPage === "string" && targetPage.trim()
      ? targetPage.replace(/\.html$/i, "").trim()
      : "index";
  return normalizedPage + ".html";
}

function resolvePageFilePath(targetPage = "index") {
  return path.join(__dirname, "pages", resolveTargetPageFile(targetPage));
}

function broadcastStorageDataChanged(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("storage-data-changed", payload);
  }
  desktopWidgetManager.broadcastStorageDataChanged(payload);
}

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();
  refreshTrayMenu();
}

function hideMainWindowToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
  mainWindow.hide();
  refreshTrayMenu();
}

function shouldMinimizeMainWindowToTray(targetWindow = mainWindow) {
  return (
    !!appTray &&
    process.platform !== "darwin" &&
    !!targetWindow &&
    !targetWindow.isDestroyed() &&
    targetWindow === mainWindow
  );
}

function buildTrayMenu() {
  const hasVisibleMainWindow =
    !!mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.isVisible();

  return Menu.buildFromTemplate([
    {
      label: nativeText("tray.showMainWindow"),
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
          return;
        }
        showAndFocusMainWindow();
      },
    },
    {
      label: nativeText("tray.hideMainWindow"),
      enabled: hasVisibleMainWindow,
      click: () => {
        hideMainWindowToTray();
      },
    },
    { type: "separator" },
    {
      label: nativeText("tray.quit"),
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (!appTray || appTray.isDestroyed()) {
    return;
  }
  appTray.setToolTip(
    nativeText("tray.tooltip", {
      appName: APP_PUBLIC_NAME,
    }),
  );
  appTray.setContextMenu(buildTrayMenu());
}

function toggleTrayMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    hideMainWindowToTray();
    return;
  }

  showAndFocusMainWindow();
}

function createTray() {
  appendStartupDebugLog("createTray invoked");
  if (appTray && !appTray.isDestroyed()) {
    refreshTrayMenu();
    return appTray;
  }

  try {
    appTray = new Tray(getDesktopIconPath());
    if (process.platform === "darwin") {
      appTray.setIgnoreDoubleClickEvents(true);
    }
    appTray.on("click", () => {
      toggleTrayMainWindow();
    });
    appTray.on("double-click", () => {
      showAndFocusMainWindow();
    });
    appTray.on("right-click", () => {
      refreshTrayMenu();
      appTray?.popUpContextMenu();
    });

    refreshTrayMenu();
    appendStartupDebugLog("createTray succeeded");
    return appTray;
  } catch (error) {
    console.error("创建系统托盘失败:", error);
    appendStartupDebugLog(`createTray failed: ${error?.stack || error?.message || String(error)}`);
    if (appTray && !appTray.isDestroyed()) {
      appTray.destroy();
    }
    appTray = null;
    return null;
  }
}

async function openMainWindowAction(payload = {}) {
  const pageFile = resolveTargetPageFile(payload.page || "index");
  const actionPayload = {
    ...payload,
    page: pageFile.replace(/\.html$/i, ""),
  };

  const dispatchAction = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("main-window-action", actionPayload);
    }
  };

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(pageFile, dispatchAction);
    return true;
  }

  const currentUrl = mainWindow.webContents.getURL();
  const currentPage = currentUrl
    ? currentUrl.split("/").pop().split("?")[0]
    : "";

  if (currentPage !== pageFile) {
    mainWindow.loadFile(resolvePageFilePath(pageFile)).catch((error) => {
      console.error("切换主窗口页面失败:", error);
    });
    mainWindow.webContents.once("did-finish-load", () => {
      showAndFocusMainWindow();
      dispatchAction();
    });
    return true;
  }

  showAndFocusMainWindow();
  dispatchAction();
  return true;
}

function applyWindowAppearance(options = {}, targetWindow = mainWindow) {
  if (options && typeof options === "object") {
    if (typeof options.backgroundColor === "string" && options.backgroundColor.trim()) {
      windowAppearance.backgroundColor = options.backgroundColor.trim();
    }
    if (typeof options.overlayColor === "string" && options.overlayColor.trim()) {
      windowAppearance.overlayColor = options.overlayColor.trim();
    }
    if (typeof options.symbolColor === "string" && options.symbolColor.trim()) {
      windowAppearance.symbolColor = options.symbolColor.trim();
    }
    if (Number.isFinite(options.overlayHeight)) {
      windowAppearance.overlayHeight = Math.max(
        28,
        Math.round(Number(options.overlayHeight)),
      );
    }
  }

  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.setBackgroundColor(windowAppearance.backgroundColor);
    disableWindowsAccentBorder(targetWindow);
    if (
      USE_NATIVE_TITLEBAR_OVERLAY &&
      typeof targetWindow.setTitleBarOverlay === "function"
    ) {
      targetWindow.setTitleBarOverlay({
        color: windowAppearance.overlayColor,
        symbolColor: windowAppearance.symbolColor,
        height: windowAppearance.overlayHeight,
      });
    }
  }

  return getWindowAppearanceState(targetWindow);
}

// 创建主窗口
function createWindow(startPage = "index.html", onReadyAction = null) {
  const targetPageFile = resolveTargetPageFile(startPage);
  appendStartupDebugLog(`createWindow invoked: ${targetPageFile}`);
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
    backgroundColor: windowAppearance.backgroundColor,
    icon: getDesktopIconPath(),
  };

  if (process.platform !== "darwin") {
    windowOptions.titleBarStyle = "hidden";
    windowOptions.titleBarOverlay = false;
  }
  if (USE_NATIVE_TITLEBAR_OVERLAY) {
    windowOptions.titleBarOverlay = {
      color: windowAppearance.overlayColor,
      symbolColor: windowAppearance.symbolColor,
      height: windowAppearance.overlayHeight,
    };
  }

  const createdWindow = new BrowserWindow(windowOptions);
  disableWindowsAccentBorder(createdWindow);
  mainWindow = createdWindow;
  let actionHandled = false;
  let rendererPageReady = false;
  let windowReadyToShow = false;
  let forceReveal = false;
  let windowShown = false;
  let revealTimer = null;

  const revealWindow = () => {
    if (
      windowShown ||
      !createdWindow ||
      createdWindow.isDestroyed() ||
      !windowReadyToShow ||
      (!rendererPageReady && !forceReveal)
    ) {
      return;
    }

    windowShown = true;
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    applyWindowAppearance(undefined, createdWindow);
    createdWindow.maximize();
    createdWindow.show();
    createdWindow.focus();
    createdWindow.webContents.focus();
    emitWindowStateChanged(createdWindow);
  };

  createdWindow.__controlerMarkPageReady = () => {
    rendererPageReady = true;
    revealWindow();
  };

  revealTimer = setTimeout(() => {
    revealTimer = null;
    forceReveal = true;
    revealWindow();
  }, PAGE_READY_REVEAL_TIMEOUT_MS);

  [
    "maximize",
    "unmaximize",
    "enter-full-screen",
    "leave-full-screen",
    "restore",
  ].forEach((eventName) => {
    createdWindow.on(eventName, () => {
      emitWindowStateChanged(createdWindow);
    });
  });

  const maybeRunReadyAction = () => {
    if (actionHandled) {
      return;
    }
    actionHandled = true;
    if (typeof onReadyAction === "function") {
      onReadyAction();
    }
  };

  createdWindow
    .loadFile(resolvePageFilePath(targetPageFile))
    .then(() => {
      appendStartupDebugLog(`createWindow loadFile resolved: ${targetPageFile}`);
    })
    .catch((error) => {
      console.error("加载主窗口页面失败:", error);
      appendStartupDebugLog(
        `createWindow loadFile failed: ${error?.stack || error?.message || String(error)}`,
      );
    });
  createdWindow.webContents.once("did-finish-load", () => {
    appendStartupDebugLog(`main window did-finish-load: ${targetPageFile}`);
    maybeRunReadyAction();
    scheduleBridgeHealthLog(createdWindow, {
      windowType: "main-window",
      page: targetPageFile.replace(/\.html$/i, ""),
    });
    rendererPageReady = true;
    revealWindow();
  });

  createdWindow.once("ready-to-show", () => {
    appendStartupDebugLog(`main window ready-to-show: ${targetPageFile}`);
    windowReadyToShow = true;
    revealWindow();
  });

  createdWindow.webContents.on("did-fail-load", () => {
    appendStartupDebugLog(`main window did-fail-load: ${targetPageFile}`);
    forceReveal = true;
    revealWindow();
  });

  createdWindow.on("close", (event) => {
    if (!shouldMinimizeMainWindowToTray(createdWindow) || isQuitting) {
      return;
    }
    event.preventDefault();
    hideMainWindowToTray();
  });

  createdWindow.on("focus", () => {
    createdWindow?.webContents?.focus();
  });

  createdWindow.webContents.on("dom-ready", () => {
    createdWindow?.webContents?.focus();
  });

  ["show", "hide", "minimize", "restore"].forEach((eventName) => {
    createdWindow.on(eventName, () => {
      refreshTrayMenu();
    });
  });

  createdWindow.on("closed", () => {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    delete createdWindow.__controlerMarkPageReady;
    if (mainWindow === createdWindow) {
      mainWindow = null;
    }
    refreshTrayMenu();
  });

  createApplicationMenu();
  return createdWindow;
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const okLabel = getDialogOkLabel();

  const template = [
    // 文件菜单
    {
      label: nativeText("menu.file"),
      submenu: [
        {
          label: nativeText("menu.exportData"),
          accelerator: "CmdOrCtrl+E",
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: nativeText("dialog.exportFullTitle"),
              defaultPath: `order-bundle-${new Date().toISOString().slice(0, 10)}.zip`,
              filters: buildDialogFilters([
                { key: "zipFile", extensions: ["zip"] },
                { key: "allFiles", extensions: ["*"] },
              ]),
            });

            if (!result.canceled && result.filePath) {
              try {
                await exportStorageBundle({
                  type: "full",
                  filePath: result.filePath,
                });
                emitThemedMessage(
                  {
                    title: nativeText("dialog.exportSuccessTitle"),
                    message: nativeText("dialog.exportSuccessMessage"),
                    confirmText: okLabel,
                  },
                  {
                    type: "info",
                    title: nativeText("dialog.exportSuccessTitle"),
                    message: nativeText("dialog.exportSuccessMessage"),
                    buttons: [okLabel],
                  },
                );
              } catch (error) {
                dialog.showMessageBox(mainWindow, {
                  type: "error",
                  title: nativeText("dialog.exportFailureTitle"),
                  message: nativeText("dialog.exportFailureMessage", {
                    detail: error?.message || String(error || ""),
                  }),
                  buttons: [okLabel],
                });
              }
            }
          },
        },
        {
          label: nativeText("menu.importData"),
          accelerator: "CmdOrCtrl+I",
          click: async () => {
            await openMainWindowAction({
              page: "settings",
              action: "open-import-wizard",
              source: "menu",
            });
          },
        },
        { type: "separator" },
        {
          label: nativeText("menu.openStorageFolder"),
          click: () => {
            const status = getStorageStatus();
            const targetPath =
              status?.storageDirectory ||
              status?.userDataPath ||
              app.getPath("userData");
            shell.openPath(targetPath);
          },
        },
        { type: "separator" },
        {
          label: nativeText("menu.quit"),
          accelerator: isMac ? "Cmd+Q" : "Alt+F4",
          role: "quit",
        },
      ],
    },
    // 编辑菜单
    {
      label: nativeText("menu.edit"),
      submenu: [
        { label: nativeText("menu.undo"), accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: nativeText("menu.redo"), accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: nativeText("menu.cut"), accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: nativeText("menu.copy"), accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: nativeText("menu.paste"), accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: nativeText("menu.selectAll"), accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    // 视图菜单
    {
      label: nativeText("menu.view"),
      submenu: [
        {
          label: nativeText("menu.reload"),
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow.reload(),
        },
        {
          label: nativeText("menu.toggleDevTools"),
          accelerator: isMac ? "Cmd+Option+I" : "Ctrl+Shift+I",
          click: () => mainWindow.webContents.toggleDevTools(),
        },
        { type: "separator" },
        {
          label: nativeText("menu.actualSize"),
          accelerator: "CmdOrCtrl+0",
          click: () => mainWindow.webContents.setZoomLevel(0),
        },
        {
          label: nativeText("menu.zoomIn"),
          accelerator: "CmdOrCtrl+=",
          click: () =>
            mainWindow.webContents.setZoomLevel(
              mainWindow.webContents.getZoomLevel() + 1,
            ),
        },
        {
          label: nativeText("menu.zoomOut"),
          accelerator: "CmdOrCtrl+-",
          click: () =>
            mainWindow.webContents.setZoomLevel(
              mainWindow.webContents.getZoomLevel() - 1,
            ),
        },
      ],
    },
    // 窗口菜单
    {
      label: nativeText("menu.window"),
      role: "window",
      submenu: [
        { label: nativeText("menu.minimize"), accelerator: "CmdOrCtrl+M", role: "minimize" },
        { label: nativeText("menu.close"), accelerator: "CmdOrCtrl+W", role: "close" },
        { type: "separator" },
        {
          label: nativeText("menu.alwaysOnTop"),
          type: "checkbox",
          checked: false,
          click: () => {
            const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
            mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
          },
        },
      ],
    },
    // 帮助菜单
    {
      label: nativeText("menu.help"),
      role: "help",
      submenu: [
        {
          label: nativeText("menu.about"),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: nativeText("dialog.aboutTitle", {
                appName: APP_PUBLIC_NAME,
              }),
              message: `${APP_PUBLIC_NAME} v${appPackage?.build?.buildVersion || appPackage.version}\n\n${APP_PUBLIC_DESCRIPTION}\n\n${APP_PUBLIC_COPYRIGHT}`,
              buttons: [okLabel],
            });
          },
        },
        { type: "separator" },
        {
          label: nativeText("menu.storageStatus"),
          click: () => {
            const status = getStorageStatus();
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: nativeText("dialog.storageStatusTitle"),
              message: buildStorageStatusMessage(status),
              buttons: [okLabel],
            });
          },
        },
        {
          label: nativeText("menu.visitGithub"),
          click: () => {
            shell.openExternal("https://github.com");
          },
        },
      ],
    },
  ];

  // macOS 特定菜单项
  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 应用准备就绪
app.whenReady().then(() => {
  appendStartupDebugLog("app.whenReady resolved");
  desktopWidgetManager.applyLoginItemSettings();
  desktopWidgetManager.setOpenMainActionHandler(openMainWindowAction);
  desktopNotificationScheduler.setOpenMainActionHandler(openMainWindowAction);
  setupIpcHandlers();
  createTray();

  const loginItemSettings =
    typeof app.getLoginItemSettings === "function"
      ? app.getLoginItemSettings()
      : {};
  const launchedAtLogin =
    process.argv.includes(LOGIN_ITEM_LAUNCH_ARG) ||
    !!loginItemSettings?.wasOpenedAtLogin;
  const shouldCreateMainWindow =
    !(launchedAtLogin && desktopWidgetManager.shouldRestoreOnLaunch());
  let widgetRestoreScheduled = false;
  const scheduleWidgetRestore = () => {
    if (widgetRestoreScheduled) {
      return;
    }
    widgetRestoreScheduled = true;
    void desktopWidgetManager.restoreWidgets({
      delayMs: 180,
    });
  };

  if (shouldCreateMainWindow) {
    appendStartupDebugLog("app.whenReady creating main window");
    const createdWindow = createWindow();
    createdWindow?.once("show", scheduleWidgetRestore);
  }

  if (!shouldCreateMainWindow) {
    appendStartupDebugLog("app.whenReady skipping main window because shouldCreateMainWindow=false");
    scheduleWidgetRestore();
  }
  if (!shouldCreateMainWindow && !desktopWidgetManager.hasSavedWidgets()) {
    appendStartupDebugLog("app.whenReady forcing main window because no saved widgets");
    createWindow();
  }

  storageManager.setChangeListener((payload) => {
    broadcastStorageDataChanged(payload);
  });

  desktopNotificationScheduler.markReady();
  appendStartupDebugLog("app.whenReady completed");
});

app.on("before-quit", () => {
  isQuitting = true;
  desktopWidgetManager.setQuitting(true);
  desktopNotificationScheduler.dispose();
  if (appTray && !appTray.isDestroyed()) {
    appTray.destroy();
    appTray = null;
  }
});

// 所有窗口关闭时退出应用（macOS 除外）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// macOS 激活应用
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 设置 IPC 事件处理器
function setupIpcHandlers() {
  // 加载存储数据
  ipcMain.handle("storage:load", async () => {
    return loadStorageData();
  });

  ipcMain.handle("storage:loadSnapshot", async () => {
    return loadStorageSnapshot();
  });

  ipcMain.on("storage:loadSync", (event) => {
    event.returnValue = loadStorageData();
  });

  // 保存存储数据
  ipcMain.handle("storage:save", async (event, data) => {
    return saveStorageData(data);
  });

  ipcMain.handle("storage:saveSnapshot", async (event, data) => {
    return saveStorageSnapshot(data);
  });

  ipcMain.on("storage:saveSync", (event, data) => {
    event.returnValue = saveStorageData(data);
  });

  ipcMain.handle("storage:flush", async () => {
    return flushStorageSnapshot();
  });

  // 获取存储状态
  ipcMain.handle("storage:status", async () => {
    return getStorageStatus();
  });

  ipcMain.handle("storage:getAutoBackupStatus", async () => {
    return getAutoBackupStatus();
  });

  ipcMain.handle("storage:updateAutoBackupSettings", async (event, settings) => {
    return updateAutoBackupSettings(settings);
  });

  ipcMain.handle("storage:runAutoBackupNow", async () => {
    return runAutoBackupNow();
  });

  ipcMain.handle("storage:shareLatestBackup", async () => {
    return shareLatestAutoBackup();
  });

  ipcMain.handle("storage:getManifest", async () => {
    return getStorageManifest();
  });

  ipcMain.handle("storage:getCoreState", async () => {
    return getStorageCoreState();
  });

  ipcMain.handle("storage:loadSectionRange", async (event, section, scope) => {
    return loadStorageSectionRange(section, scope);
  });

  ipcMain.handle("storage:saveSectionRange", async (event, section, payload) => {
    return saveStorageSectionRange(section, payload);
  });

  ipcMain.handle("storage:replaceCoreState", async (event, partialCore, options = {}) => {
    return replaceStorageCoreState(partialCore, options);
  });

  ipcMain.handle("storage:replaceRecurringPlans", async (event, items) => {
    return replaceStorageRecurringPlans(items);
  });

  ipcMain.handle("storage:exportBundle", async (event, options) => {
    const normalizedOptions =
      options && typeof options === "object" ? { ...options } : {};
    if (!normalizedOptions.filePath) {
      const exportType =
        normalizedOptions.type === "partition" ? "partition" : "full";
      const defaultFileName =
        exportType === "partition"
          ? `${String(normalizedOptions.section || "partition").trim() || "partition"}-${String(normalizedOptions.periodId || "undated").trim() || "undated"}.json`
          : `order-bundle-${new Date().toISOString().slice(0, 10)}.zip`;
      const dialogResult = await dialog.showSaveDialog(mainWindow, {
        title:
          exportType === "partition"
            ? nativeText("dialog.exportPartitionTitle")
            : nativeText("dialog.exportFullTitle"),
        defaultPath: defaultFileName,
        filters:
          exportType === "partition"
            ? buildDialogFilters([
                { key: "jsonFile", extensions: ["json"] },
                { key: "allFiles", extensions: ["*"] },
              ])
            : buildDialogFilters([
                { key: "zipFile", extensions: ["zip"] },
                { key: "allFiles", extensions: ["*"] },
              ]),
        showOverwriteConfirmation: true,
      });
      if (dialogResult.canceled || !dialogResult.filePath) {
        return null;
      }
      normalizedOptions.filePath = dialogResult.filePath;
    }
    return exportStorageBundle(normalizedOptions);
  });

  ipcMain.handle("storage:importSource", async (event, options) => {
    const normalizedOptions =
      options && typeof options === "object" ? { ...options } : {};
    if (!normalizedOptions.filePath) {
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        title: nativeText("dialog.importFileTitle"),
        filters: buildDialogFilters([
          { key: "dataFile", extensions: ["zip", "json"] },
          { key: "zipFile", extensions: ["zip"] },
          { key: "jsonFile", extensions: ["json"] },
          { key: "allFiles", extensions: ["*"] },
        ]),
        properties: ["openFile"],
      });
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return null;
      }
      normalizedOptions.filePath = dialogResult.filePaths[0];
    }
    return importStorageSource(normalizedOptions);
  });

  // 导出数据
  ipcMain.handle("storage:export", async (event, filePath) => {
    return exportDataToFile(filePath);
  });

  // 导入数据
  ipcMain.handle("storage:import", async (event, filePath) => {
    return importDataFromFile(filePath);
  });

  // 清除数据
  ipcMain.handle("storage:clear", async () => {
    return clearStorageData();
  });

  ipcMain.handle("storage:setDirectory", async (event, directoryPath) => {
    return storageManager.setStorageDirectory(directoryPath);
  });

  ipcMain.handle("storage:setFile", async (event, filePath) => {
    return storageManager.setStorageFile(filePath);
  });

  ipcMain.handle("storage:resetDirectory", async () => {
    return storageManager.resetStoragePath();
  });

  // 选择文件夹
  ipcMain.handle("dialog:selectFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: nativeText("dialog.selectFolderTitle"),
      properties: ["openDirectory", "createDirectory"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("dialog:selectStorageFile", async () => {
    const currentStatus = getStorageStatus();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: nativeText("dialog.selectStorageFileTitle"),
      defaultPath:
        currentStatus?.storagePath ||
        path.join(app.getPath("documents"), app.getName(), "app_data", "controler-data.json"),
      filters: buildDialogFilters([
        { key: "jsonFile", extensions: ["json"] },
        { key: "allFiles", extensions: ["*"] },
      ]),
      showOverwriteConfirmation: true,
      showsTagField: false,
    });

    if (!result.canceled && result.filePath) {
      return result.filePath;
    }
    return null;
  });

  ipcMain.handle("dialog:selectDataFile", async (event, options = {}) => {
    const extensions = Array.isArray(options?.extensions)
      ? options.extensions
          .map((extension) =>
            String(extension || "")
              .trim()
              .replace(/^\./, "")
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];
    const result = await dialog.showOpenDialog(resolveWindowFromEvent(event), {
      title:
        typeof options?.title === "string" && options.title.trim()
          ? options.title.trim()
          : nativeText("dialog.selectDataFileTitle"),
      filters: extensions.length
        ? buildDialogFilters([
            { key: "supportedFiles", extensions },
            { key: "allFiles", extensions: ["*"] },
          ])
        : buildDialogFilters([{ key: "allFiles", extensions: ["*"] }]),
      properties: ["openFile"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 打开文件夹
  ipcMain.handle("shell:openPath", async (event, path) => {
    try {
      const result = await shell.openPath(path);
      return result === "";
    } catch (error) {
      console.error("打开路径失败:", error);
      return false;
    }
  });

  ipcMain.handle("fs:readTextFile", async (event, filePath) => {
    const targetPath = String(filePath || "").trim();
    if (!targetPath) {
      throw new Error(nativeText("dialog.emptyFilePath"));
    }
    return fs.promises.readFile(targetPath, "utf8");
  });

  ipcMain.on("ui:pageReady", (event) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (
      targetWindow &&
      !targetWindow.isDestroyed() &&
      typeof targetWindow.__controlerMarkPageReady === "function"
    ) {
      targetWindow.__controlerMarkPageReady();
    }
  });

  ipcMain.handle("ui:getLanguage", async () => {
    return getCurrentUiLanguage();
  });

  ipcMain.handle("ui:setLanguage", async (_event, language) => {
    return setCurrentUiLanguage(language);
  });

  // 显示消息对话框
  ipcMain.handle("dialog:showMessage", async (event, options) => {
    return dialog.showMessageBox(mainWindow, options);
  });

  ipcMain.handle("notifications:requestPermission", async () => {
    return desktopNotificationScheduler.requestPermission();
  });

  ipcMain.handle("notifications:syncSchedule", async (event, payload = {}) => {
    return desktopNotificationScheduler.sync(payload);
  });

  ipcMain.handle("window:getState", async (event) => {
    return getWindowAppearanceState(resolveWindowFromEvent(event));
  });

  ipcMain.handle("window:updateAppearance", async (event, options) => {
    return applyWindowAppearance(options, resolveWindowFromEvent(event));
  });

  ipcMain.handle("window:beginMove", async (event) => {
    return setWindowMoveGuard(resolveWindowFromEvent(event), true);
  });

  ipcMain.handle("window:endMove", async (event) => {
    return setWindowMoveGuard(resolveWindowFromEvent(event), false);
  });

  ipcMain.handle("window:setPosition", async (event, position = {}) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (!targetWindow || targetWindow.isDestroyed()) {
      return false;
    }

    const nextX = Number.isFinite(position?.x)
      ? Math.round(Number(position.x))
      : null;
    const nextY = Number.isFinite(position?.y)
      ? Math.round(Number(position.y))
      : null;
    if (nextX === null || nextY === null) {
      return false;
    }

    if (targetWindow.isMaximized()) {
      return false;
    }

    const clampedPosition = clampWindowMoveTarget(targetWindow, nextX, nextY);
    targetWindow.setPosition(clampedPosition.x, clampedPosition.y, false);
    return true;
  });

  ipcMain.handle("window:hide", async (event) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.hide();
      return true;
    }
    return false;
  });

  ipcMain.handle("window:minimize", async (event) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.minimize();
      return true;
    }
    return false;
  });

  ipcMain.handle("window:toggleMaximize", async (event) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { isMaximized: false };
    }

    if (!targetWindow.isMaximizable()) {
      return getWindowState(targetWindow);
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }

    return getWindowState(targetWindow);
  });

  ipcMain.handle("window:close", async (event) => {
    const targetWindow = resolveWindowFromEvent(event);
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.close();
      return true;
    }
    return false;
  });

  ipcMain.handle("desktopWidgets:getState", async () => {
    return desktopWidgetManager.getState();
  });

  ipcMain.handle("desktopWidgets:create", async (event, payload = {}) => {
    return desktopWidgetManager.createWidgetWindow({
      kind: payload?.kind,
    });
  });

  ipcMain.handle("desktopWidgets:remove", async (event, widgetId) => {
    return desktopWidgetManager.removeWidget(String(widgetId || ""));
  });

  ipcMain.handle("desktopWidgets:updateSettings", async (event, settings = {}) => {
    return desktopWidgetManager.updateSettings(settings);
  });

  ipcMain.handle("desktopWidgets:openMainAction", async (event, payload = {}) => {
    return openMainWindowAction(payload);
  });
}
