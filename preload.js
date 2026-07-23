const { contextBridge, ipcRenderer } = require("electron");
const platformContract = require("./shared/platform-contract.js");

const runtimeMeta = platformContract.getElectronRuntimeProfile(process.platform);
const bridgeHealth = Object.freeze({
  status: "ok",
  source: "preload",
  contractVersion:
    typeof platformContract?.version === "string" ? platformContract.version : "",
  runtime:
    typeof runtimeMeta?.runtime === "string" ? runtimeMeta.runtime : "electron",
  platform:
    typeof runtimeMeta?.platform === "string" ? runtimeMeta.platform : process.platform,
});

let pageActivityState = Object.freeze({
  active: true,
  page: "",
  href: "",
  requestId: "",
  reason: "initial",
});
let deferredStorageChange = null;
const storageChangeListeners = new Set();
const pageActivityListeners = new Set();
const THEME_STORAGE_SECTIONS = new Set([
  "selectedTheme",
  "customThemes",
  "builtInThemeOverrides",
]);

function isThemeStorageChange(payload) {
  const changedSections = Array.isArray(payload?.changedSections)
    ? payload.changedSections
    : [];
  return changedSections.some((section) =>
    THEME_STORAGE_SECTIONS.has(String(section || "").trim()),
  );
}

function notifyStorageChangeListeners(event, payload) {
  storageChangeListeners.forEach((listener) => listener(event, payload));
}

ipcRenderer.on("ui:page-activity-changed", (_event, payload = {}) => {
  pageActivityState = Object.freeze({
    active: payload?.active !== false,
    page: typeof payload?.page === "string" ? payload.page : "",
    href: typeof payload?.href === "string" ? payload.href : "",
    requestId: typeof payload?.requestId === "string" ? payload.requestId : "",
    reason: typeof payload?.reason === "string" ? payload.reason : "activity-changed",
  });
  pageActivityListeners.forEach((listener) => listener(pageActivityState));
  if (pageActivityState.active && deferredStorageChange) {
    const nextChange = deferredStorageChange;
    deferredStorageChange = null;
    notifyStorageChangeListeners(null, nextChange);
  }
});

ipcRenderer.on("storage-data-changed", (_event, payload) => {
  if (!pageActivityState.active && !isThemeStorageChange(payload)) {
    deferredStorageChange = payload;
    return;
  }
  if (!pageActivityState.active && storageChangeListeners.size === 0) {
    deferredStorageChange = payload;
    return;
  }
  notifyStorageChangeListeners(_event, payload);
});

// Expose versions info
contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

// Expose secure APIs to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // Storage APIs
  storageLoad: () => ipcRenderer.invoke("storage:load"),
  storageLoadSnapshot: () => ipcRenderer.invoke("storage:loadSnapshot"),
  storageLoadSync: () => ipcRenderer.sendSync("storage:loadSync"),
  storageSave: (data) => ipcRenderer.invoke("storage:save", data),
  storageSaveSnapshot: (data, options = {}) =>
    ipcRenderer.invoke("storage:saveSnapshot", data, options),
  storageSaveSync: (data) => ipcRenderer.sendSync("storage:saveSync", data),
  storageFlush: () => ipcRenderer.invoke("storage:flush"),
  storageStatus: () => ipcRenderer.invoke("storage:status"),
  storageGetAutoBackupStatus: () =>
    ipcRenderer.invoke("storage:getAutoBackupStatus"),
  storageUpdateAutoBackupSettings: (settings) =>
    ipcRenderer.invoke("storage:updateAutoBackupSettings", settings),
  storageRunAutoBackupNow: () => ipcRenderer.invoke("storage:runAutoBackupNow"),
  storageShareLatestBackup: () => ipcRenderer.invoke("storage:shareLatestBackup"),
  storageExport: (filePath) => ipcRenderer.invoke("storage:export", filePath),
  storageImport: (filePath) => ipcRenderer.invoke("storage:import", filePath),
  storageGetManifest: () => ipcRenderer.invoke("storage:getManifest"),
  storageGetCoreState: () => ipcRenderer.invoke("storage:getCoreState"),
  storageGetPageBootstrapState: (pageKey, options = {}) =>
    ipcRenderer.invoke("storage:getPageBootstrapState", pageKey, options),
  storageGetPageBootstrapStateSync: (pageKey, options = {}) =>
    ipcRenderer.sendSync("storage:getPageBootstrapStateSync", pageKey, options),
  storagePrewarmPageBootstrap: (pageKey, options = {}) =>
    ipcRenderer.invoke("storage:prewarmPageBootstrap", pageKey, options),
  storageGetDraft: (key, options = {}) =>
    ipcRenderer.invoke("storage:getDraft", key, options),
  storageSetDraft: (key, value, options = {}) =>
    ipcRenderer.invoke("storage:setDraft", key, value, options),
  storageRemoveDraft: (key) => ipcRenderer.invoke("storage:removeDraft", key),
  storageReplaceCoreStateSync: (partialCore, options = {}) =>
    ipcRenderer.sendSync("storage:replaceCoreStateSync", partialCore, options),
  storageLoadSectionRange: (section, scope) =>
    ipcRenderer.invoke("storage:loadSectionRange", section, scope),
  storageSaveSectionRange: (section, payload) =>
    ipcRenderer.invoke("storage:saveSectionRange", section, payload),
  storageAppendJournal: (operations, options = {}) =>
    ipcRenderer.invoke("storage:appendJournal", operations, options),
  storageReplaceCoreState: (partialCore, options = {}) =>
    ipcRenderer.invoke("storage:replaceCoreState", partialCore, options),
  storageReplaceRecurringPlans: (items) =>
    ipcRenderer.invoke("storage:replaceRecurringPlans", items),
  storageSaveDiaryImageAsset: (options = {}) =>
    ipcRenderer.invoke("storage:saveDiaryImageAsset", options),
  storageResolveDiaryImageUri: (options = {}) =>
    ipcRenderer.invoke("storage:resolveDiaryImageUri", options),
  storageDeleteDiaryImageAssets: (options = {}) =>
    ipcRenderer.invoke("storage:deleteDiaryImageAssets", options),
  storageExportBundle: (options) =>
    ipcRenderer.invoke("storage:exportBundle", options),
  storageImportSource: (options) =>
    ipcRenderer.invoke("storage:importSource", options),
  storageClear: () => ipcRenderer.invoke("storage:clear"),
  storageSetDirectory: (directoryPath) =>
    ipcRenderer.invoke("storage:setDirectory", directoryPath),
  storageSetFile: (filePath) => ipcRenderer.invoke("storage:setFile", filePath),
  storageResetDirectory: () => ipcRenderer.invoke("storage:resetDirectory"),

  // Dialog APIs
  dialogSelectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  dialogSelectStorageFile: () => ipcRenderer.invoke("dialog:selectStorageFile"),
  dialogSelectDataFile: (options = {}) =>
    ipcRenderer.invoke("dialog:selectDataFile", options),
  dialogShowMessage: (options) =>
    ipcRenderer.invoke("dialog:showMessage", options),
  fsReadTextFile: (filePath) => ipcRenderer.invoke("fs:readTextFile", filePath),
  uiGetLanguage: () => ipcRenderer.invoke("ui:getLanguage"),
  uiSetLanguage: (language) => ipcRenderer.invoke("ui:setLanguage", language),
  uiPageReady: (payload = {}) => ipcRenderer.send("ui:pageReady", payload),
  uiNavigatePage: (request = {}) => ipcRenderer.invoke("ui:navigatePage", request),
  getPageActivityState: () => ({ ...pageActivityState }),
  onPageActivityChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    pageActivityListeners.add(callback);
    callback({ ...pageActivityState });
    return () => pageActivityListeners.delete(callback);
  },

  // Window chrome APIs
  windowGetState: () => ipcRenderer.invoke("window:getState"),
  windowUpdateAppearance: (options) =>
    ipcRenderer.invoke("window:updateAppearance", options),
  windowBeginMove: () => ipcRenderer.invoke("window:beginMove"),
  windowEndMove: () => ipcRenderer.invoke("window:endMove"),
  windowSetPosition: (position) =>
    ipcRenderer.invoke("window:setPosition", position),
  windowHide: () => ipcRenderer.invoke("window:hide"),
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  onWindowStateChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, state) => {
      callback(state);
    };
    ipcRenderer.on("window-state-changed", listener);
    return () => {
      ipcRenderer.removeListener("window-state-changed", listener);
    };
  },

  // Desktop widget APIs
  desktopWidgetsGetState: () => ipcRenderer.invoke("desktopWidgets:getState"),
  desktopWidgetsCreate: (payload) =>
    ipcRenderer.invoke("desktopWidgets:create", payload),
  desktopWidgetsRemove: (widgetId) =>
    ipcRenderer.invoke("desktopWidgets:remove", widgetId),
  desktopWidgetsUpdateSettings: (settings) =>
    ipcRenderer.invoke("desktopWidgets:updateSettings", settings),
  desktopWidgetsOpenMainAction: (payload) =>
    ipcRenderer.invoke("desktopWidgets:openMainAction", payload),
  onMainWindowAction: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on("main-window-action", listener);
    return () => {
      ipcRenderer.removeListener("main-window-action", listener);
    };
  },

  // System APIs
  shellOpenPath: (path) => ipcRenderer.invoke("shell:openPath", path),
  notificationsRequestPermission: (options = {}) =>
    ipcRenderer.invoke("notifications:requestPermission", options),
  notificationsSyncSchedule: (payload = {}) =>
    ipcRenderer.invoke("notifications:syncSchedule", payload),

  // Listen for storage data changes
  onStorageDataChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    storageChangeListeners.add(callback);
    return () => {
      storageChangeListeners.delete(callback);
    };
  },
  onThemedMessage: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on("ui:themed-message", listener);
    return () => {
      ipcRenderer.removeListener("ui:themed-message", listener);
    };
  },

  // Check if running in Electron
  isElectron: true,
  platform: process.platform,
  windowChromeMode: "custom-overlay",
  bridgeHealth,
  runtimeMeta,
});
