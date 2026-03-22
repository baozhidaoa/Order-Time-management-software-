const fs = require("fs-extra");
const path = require("path");
const { screen } = require("electron");
const platformContract = require("./shared/platform-contract.js");
const uiLanguage = require("./shared/ui-language.js");

const LOGIN_ITEM_LAUNCH_ARG = "--controler-launch-at-login";
const MIN_WIDGET_WINDOW_WIDTH = 180;
const MIN_WIDGET_WINDOW_HEIGHT = 110;

const DEFAULT_WIDGET_CONFIG = {
  openAtLogin: false,
  restoreOnLaunch: false,
  keepOnTop: true,
  widgets: [],
};

const WIDGET_META = Object.freeze(
  (typeof platformContract?.getWidgetKinds === "function"
    ? platformContract.getWidgetKinds()
    : []
  ).reduce((accumulator, item) => {
    const desktopWindow =
      item?.desktopWindow && typeof item.desktopWindow === "object"
        ? item.desktopWindow
        : {};
    accumulator[item.id] = {
      fallbackTitle: item.name,
      width: Number.isFinite(desktopWindow.width) ? desktopWindow.width : 300,
      height: Number.isFinite(desktopWindow.height) ? desktopWindow.height : 180,
      minWidth: Number.isFinite(desktopWindow.minWidth)
        ? desktopWindow.minWidth
        : MIN_WIDGET_WINDOW_WIDTH,
      minHeight: Number.isFinite(desktopWindow.minHeight)
        ? desktopWindow.minHeight
        : MIN_WIDGET_WINDOW_HEIGHT,
      page: item.page,
      action: item.action,
    };
    return accumulator;
  }, {}),
);

const DEFAULT_WIDGET_WINDOW_APPEARANCE = {
  backgroundColor: "#26312a",
};

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
    console.warn("关闭小组件窗口活动边框高亮失败:", error);
  }
}

class DesktopWidgetManager {
  constructor({
    app,
    BrowserWindow,
    baseDir,
    preloadPath,
    bridgeHealthLogger,
    getLanguage,
    getWindowAppearance,
  }) {
    this.app = app;
    this.BrowserWindow = BrowserWindow;
    this.baseDir = baseDir;
    this.preloadPath = preloadPath;
    this.bridgeHealthLogger =
      typeof bridgeHealthLogger === "function" ? bridgeHealthLogger : null;
    this.getLanguage =
      typeof getLanguage === "function"
        ? getLanguage
        : () => uiLanguage.DEFAULT_LANGUAGE;
    this.getWindowAppearance =
      typeof getWindowAppearance === "function" ? getWindowAppearance : null;
    this.configPath = path.join(
      this.app.getPath("userData"),
      "desktop-widget-config.json",
    );
    this.widgetWindows = new Map();
    this.isQuitting = false;
    this.openMainActionHandler = null;
    this.config = this.readConfig();
  }

  getCurrentLanguage() {
    return uiLanguage.normalizeLanguage(this.getLanguage());
  }

  resolveWidgetTitle(kind) {
    const meta = WIDGET_META[String(kind || "").trim()] || {};
    return uiLanguage.getWidgetTitle(
      kind,
      this.getCurrentLanguage(),
      meta.fallbackTitle || kind,
    );
  }

  refreshLocalizedTitles() {
    this.widgetWindows.forEach((widgetWindow, widgetId) => {
      if (!widgetWindow || widgetWindow.isDestroyed()) {
        return;
      }
      const widget = this.config.widgets.find((item) => item.id === widgetId);
      if (!widget) {
        return;
      }
      widgetWindow.setTitle(this.resolveWidgetTitle(widget.kind));
    });
  }

  normalizeKind(kind) {
    return typeof kind === "string" && WIDGET_META[kind] ? kind : "";
  }

  normalizeWidgetEntry(entry = {}) {
    const kind = this.normalizeKind(entry.kind);
    if (!kind) {
      return null;
    }

    const meta = WIDGET_META[kind];
    const bounds = entry.bounds && typeof entry.bounds === "object" ? entry.bounds : {};
    return {
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : `widget-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      bounds: {
        width: Number.isFinite(bounds.width) ? Math.round(bounds.width) : meta.width,
        height: Number.isFinite(bounds.height) ? Math.round(bounds.height) : meta.height,
        x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
        y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined,
      },
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt
          ? entry.createdAt
          : new Date().toISOString(),
    };
  }

  normalizeConfig(rawConfig = {}) {
    const next = {
      ...DEFAULT_WIDGET_CONFIG,
      ...(rawConfig && typeof rawConfig === "object" ? rawConfig : {}),
    };

    next.openAtLogin = !!next.openAtLogin;
    next.restoreOnLaunch = !!next.restoreOnLaunch;
    next.keepOnTop = next.keepOnTop !== false;
    next.widgets = Array.isArray(next.widgets)
      ? next.widgets
          .map((item) => this.normalizeWidgetEntry(item))
          .filter(Boolean)
      : [];

    const uniqueIds = new Set();
    next.widgets = next.widgets.filter((item) => {
      if (uniqueIds.has(item.id)) return false;
      uniqueIds.add(item.id);
      return true;
    });

    return next;
  }

  readConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return { ...DEFAULT_WIDGET_CONFIG };
      }
      const raw = fs.readFileSync(this.configPath, "utf8");
      return this.normalizeConfig(JSON.parse(raw));
    } catch (error) {
      console.error("读取桌面小组件配置失败:", error);
      return { ...DEFAULT_WIDGET_CONFIG };
    }
  }

  writeConfig() {
    try {
      fs.ensureDirSync(path.dirname(this.configPath));
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.normalizeConfig(this.config), null, 2),
        "utf8",
      );
      return true;
    } catch (error) {
      console.error("写入桌面小组件配置失败:", error);
      return false;
    }
  }

  getIconPath() {
    return process.platform === "win32"
      ? path.join(this.baseDir, "images", "Order.ico")
      : path.join(this.baseDir, "images", "Order.png");
  }

  getWidgetDisplayForBounds(bounds = {}) {
    if (!screen || typeof screen.getAllDisplays !== "function") {
      return null;
    }
    const displays = screen.getAllDisplays();
    if (!Array.isArray(displays) || displays.length === 0) {
      return null;
    }
    if (
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      typeof screen.getDisplayNearestPoint === "function"
    ) {
      return screen.getDisplayNearestPoint({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
      });
    }
    if (typeof screen.getPrimaryDisplay === "function") {
      return screen.getPrimaryDisplay();
    }
    return displays[0];
  }

  sanitizeWidgetBounds(bounds = {}, meta = {}) {
    const nextBounds = {
      width: Number.isFinite(bounds.width) ? Math.round(bounds.width) : meta.width,
      height: Number.isFinite(bounds.height) ? Math.round(bounds.height) : meta.height,
    };

    const minWidth = Math.max(
      MIN_WIDGET_WINDOW_WIDTH,
      Number.isFinite(meta.minWidth) ? Math.round(meta.minWidth) : 0,
      1,
    );
    const minHeight = Math.max(
      MIN_WIDGET_WINDOW_HEIGHT,
      Number.isFinite(meta.minHeight) ? Math.round(meta.minHeight) : 0,
      1,
    );
    nextBounds.width = Math.max(minWidth, nextBounds.width || meta.width || minWidth);
    nextBounds.height = Math.max(minHeight, nextBounds.height || meta.height || minHeight);

    const targetDisplay = this.getWidgetDisplayForBounds(bounds);
    const workArea = targetDisplay?.workArea || targetDisplay?.bounds || null;
    if (!workArea) {
      if (Number.isFinite(bounds.x)) {
        nextBounds.x = Math.round(bounds.x);
      }
      if (Number.isFinite(bounds.y)) {
        nextBounds.y = Math.round(bounds.y);
      }
      return nextBounds;
    }

    nextBounds.width = Math.min(nextBounds.width, Math.max(minWidth, workArea.width));
    nextBounds.height = Math.min(nextBounds.height, Math.max(minHeight, workArea.height));

    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      const maxX = workArea.x + Math.max(0, workArea.width - nextBounds.width);
      const maxY = workArea.y + Math.max(0, workArea.height - nextBounds.height);
      nextBounds.x = Math.min(Math.max(Math.round(bounds.x), workArea.x), maxX);
      nextBounds.y = Math.min(Math.max(Math.round(bounds.y), workArea.y), maxY);
    }

    return nextBounds;
  }

  haveWidgetBoundsChanged(left = {}, right = {}) {
    return ["x", "y", "width", "height"].some((key) => {
      const leftValue = Number.isFinite(left[key]) ? Math.round(left[key]) : null;
      const rightValue = Number.isFinite(right[key]) ? Math.round(right[key]) : null;
      return leftValue !== rightValue;
    });
  }

  getWidgetPageTarget(widget = {}) {
    return {
      filePath: path.join(this.baseDir, "pages", "widget.html"),
      query: {
        kind: widget.kind,
        widgetId: widget.id,
      },
    };
  }

  getState() {
    this.config = this.normalizeConfig(this.config);
    const loginItemSettings = this.getLoginItemSettingsSnapshot();
    return {
      available: true,
      openAtLogin: !!loginItemSettings.openAtLogin,
      restoreOnLaunch: !!this.config.restoreOnLaunch,
      keepOnTop: this.config.keepOnTop !== false,
      widgets: this.config.widgets.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: this.resolveWidgetTitle(item.kind),
        bounds: { ...item.bounds },
        createdAt: item.createdAt,
      })),
    };
  }

  hasSavedWidgets() {
    return this.config.widgets.length > 0;
  }

  shouldRestoreOnLaunch() {
    return !!this.config.restoreOnLaunch && this.hasSavedWidgets();
  }

  setQuitting(value) {
    this.isQuitting = !!value;
  }

  setOpenMainActionHandler(handler) {
    this.openMainActionHandler = typeof handler === "function" ? handler : null;
  }

  getLoginItemLaunchConfig() {
    const loginItemPath =
      typeof this.app.getPath === "function"
        ? this.app.getPath("exe")
        : process.execPath;
    const args = [];
    const appPath =
      typeof this.app.getAppPath === "function" ? this.app.getAppPath() : "";

    if (
      (process.defaultApp || this.app.isPackaged === false) &&
      typeof appPath === "string" &&
      appPath.trim()
    ) {
      args.push(appPath.trim());
    }

    args.push(LOGIN_ITEM_LAUNCH_ARG);

    return {
      path: loginItemPath,
      args,
    };
  }

  getLoginItemSettingsSnapshot() {
    const fallbackState = {
      openAtLogin: !!this.config.openAtLogin,
    };

    try {
      if (typeof this.app.getLoginItemSettings !== "function") {
        return fallbackState;
      }

      const launchConfig = this.getLoginItemLaunchConfig();
      const settings = this.app.getLoginItemSettings(launchConfig);
      return {
        openAtLogin:
          typeof settings?.openAtLogin === "boolean"
            ? settings.openAtLogin
            : fallbackState.openAtLogin,
      };
    } catch (error) {
      console.error("读取开机自启状态失败:", error);
      return fallbackState;
    }
  }

  applyLoginItemSettings() {
    try {
      if (typeof this.app.setLoginItemSettings === "function") {
        const launchConfig = this.getLoginItemLaunchConfig();
        this.app.setLoginItemSettings({
          openAtLogin: !!this.config.openAtLogin,
          path: launchConfig.path,
          args: launchConfig.args,
        });
      }
    } catch (error) {
      console.error("设置开机自启失败:", error);
    }
  }

  upsertWidgetEntry(entry) {
    const normalized = this.normalizeWidgetEntry(entry);
    if (!normalized) return null;
    const index = this.config.widgets.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      this.config.widgets[index] = normalized;
    } else {
      this.config.widgets.push(normalized);
    }
    this.writeConfig();
    return normalized;
  }

  updateWidgetBounds(widgetId, bounds = {}) {
    const current = this.config.widgets.find((item) => item.id === widgetId);
    if (!current) {
      return;
    }
    current.bounds = {
      ...current.bounds,
      ...bounds,
    };
    this.writeConfig();
  }

  removeWidgetEntry(widgetId) {
    const beforeLength = this.config.widgets.length;
    this.config.widgets = this.config.widgets.filter((item) => item.id !== widgetId);
    if (this.config.widgets.length !== beforeLength) {
      this.writeConfig();
    }
  }

  createWidgetWindow(widgetInput, options = {}) {
    const { persist = true, focus = true } = options;
    const widget = this.normalizeWidgetEntry(widgetInput);
    if (!widget) {
      return {
        ok: false,
        message: uiLanguage.t(this.getCurrentLanguage(), "widget.unknownType"),
      };
    }

    const existingWindow = this.widgetWindows.get(widget.id);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.show();
      existingWindow.focus();
      return {
        ok: true,
        widget,
      };
    }

    const meta = WIDGET_META[widget.kind];
    const bounds = this.sanitizeWidgetBounds(widget.bounds || {}, meta);
    const appearance =
      this.getWindowAppearance && typeof this.getWindowAppearance === "function"
        ? this.getWindowAppearance()
        : null;
    const windowOptions = {
      width: Math.max(1, Math.round(bounds.width || meta.width)),
      height: Math.max(1, Math.round(bounds.height || meta.height)),
      x: Number.isFinite(bounds.x) ? bounds.x : undefined,
      y: Number.isFinite(bounds.y) ? bounds.y : undefined,
      minWidth: Math.max(
        MIN_WIDGET_WINDOW_WIDTH,
        Number.isFinite(meta.minWidth) ? Math.round(meta.minWidth) : 0,
      ),
      minHeight: Math.max(
        MIN_WIDGET_WINDOW_HEIGHT,
        Number.isFinite(meta.minHeight) ? Math.round(meta.minHeight) : 0,
      ),
      autoHideMenuBar: true,
      backgroundColor:
        typeof appearance?.backgroundColor === "string" &&
        appearance.backgroundColor.trim()
          ? appearance.backgroundColor.trim()
          : DEFAULT_WIDGET_WINDOW_APPEARANCE.backgroundColor,
      icon: this.getIconPath(),
      show: false,
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: this.config.keepOnTop !== false,
      maximizable: false,
      fullscreenable: false,
      title: this.resolveWidgetTitle(widget.kind),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        sandbox: false,
        preload: this.preloadPath,
      },
    };
    if (process.platform !== "darwin") {
      windowOptions.titleBarStyle = "hidden";
      windowOptions.titleBarOverlay = false;
    }
    const widgetWindow = new this.BrowserWindow(windowOptions);
    disableWindowsAccentBorder(widgetWindow);

    try {
      widgetWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    } catch (error) {
      console.warn("设置小组件工作区可见性失败:", error);
    }

    const pageTarget = this.getWidgetPageTarget(widget);
    widgetWindow.loadFile(pageTarget.filePath, {
      query: pageTarget.query,
    });
    widgetWindow.webContents.once("did-finish-load", () => {
      this.bridgeHealthLogger?.(widgetWindow, {
        windowType: "desktop-widget-window",
        widgetId: widget.id,
        widgetKind: widget.kind,
      });
    });

    widgetWindow.once("ready-to-show", () => {
      if (focus) {
        widgetWindow.show();
        widgetWindow.focus();
      } else {
        widgetWindow.showInactive();
      }
    });

    let boundsTimer = 0;
    const persistBounds = () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        if (widgetWindow.isDestroyed()) {
          return;
        }
        const nextBounds = widgetWindow.getBounds();
        this.updateWidgetBounds(widget.id, nextBounds);
      }, 140);
    };
    const emitWindowStateChanged = () => {
      if (!widgetWindow.isDestroyed()) {
        widgetWindow.webContents.send("window-state-changed", {
          isMaximized: widgetWindow.isMaximized(),
        });
      }
    };

    widgetWindow.on("move", persistBounds);
    widgetWindow.on("resize", persistBounds);
    ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "restore"].forEach(
      (eventName) => {
        widgetWindow.on(eventName, emitWindowStateChanged);
      },
    );
    widgetWindow.on("closed", () => {
      clearTimeout(boundsTimer);
      this.widgetWindows.delete(widget.id);
      if (!this.isQuitting) {
        this.removeWidgetEntry(widget.id);
      }
    });

    this.widgetWindows.set(widget.id, widgetWindow);
    const initialBounds = widgetWindow.getBounds();
    if (persist) {
      this.upsertWidgetEntry({
        ...widget,
        bounds: initialBounds,
      });
    } else if (this.haveWidgetBoundsChanged(widget.bounds || {}, initialBounds)) {
      this.updateWidgetBounds(widget.id, initialBounds);
    }

    return {
      ok: true,
      widget: {
        ...widget,
        title: this.resolveWidgetTitle(widget.kind),
      },
    };
  }

  async restoreWidgets(options = {}) {
    if (!this.shouldRestoreOnLaunch()) {
      return false;
    }
    const delayMs = Number.isFinite(options.delayMs)
      ? Math.max(0, Math.round(Number(options.delayMs)))
      : 180;
    const startDelayMs = Number.isFinite(options.startDelayMs)
      ? Math.max(0, Math.round(Number(options.startDelayMs)))
      : 0;
    const widgets = this.config.widgets.slice();

    if (startDelayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, startDelayMs);
      });
    }

    for (let index = 0; index < widgets.length; index += 1) {
      const widget = widgets[index];
      this.createWidgetWindow(widget, {
        persist: false,
        focus: false,
      });
      if (delayMs > 0 && index < widgets.length - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }

    return true;
  }

  removeWidget(widgetId) {
    const existingWindow = this.widgetWindows.get(widgetId);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.close();
      return { ok: true };
    }
    this.removeWidgetEntry(widgetId);
    return { ok: true };
  }

  updateSettings(partial = {}) {
    if (Object.prototype.hasOwnProperty.call(partial, "openAtLogin")) {
      this.config.openAtLogin = !!partial.openAtLogin;
    }
    if (Object.prototype.hasOwnProperty.call(partial, "restoreOnLaunch")) {
      this.config.restoreOnLaunch = !!partial.restoreOnLaunch;
    }
    if (Object.prototype.hasOwnProperty.call(partial, "keepOnTop")) {
      this.config.keepOnTop = !!partial.keepOnTop;
    }

    this.writeConfig();
    this.applyLoginItemSettings();
    this.widgetWindows.forEach((widgetWindow) => {
      if (!widgetWindow.isDestroyed()) {
        widgetWindow.setAlwaysOnTop(this.config.keepOnTop !== false);
      }
    });

    return {
      ok: true,
      ...this.getState(),
    };
  }

  broadcastStorageDataChanged(payload) {
    this.widgetWindows.forEach((widgetWindow) => {
      if (!widgetWindow.isDestroyed()) {
        widgetWindow.webContents.send("storage-data-changed", payload);
      }
    });
  }

  async openMainAction(payload = {}) {
    if (this.openMainActionHandler) {
      return this.openMainActionHandler(payload);
    }
    return false;
  }
}

module.exports = DesktopWidgetManager;
