// 主题配置
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
const SETTINGS_LANGUAGE_EVENT = "controler:language-changed";
let settingsInitialReadyReported = false;
let settingsDeferredRuntimePromise = null;
const SETTINGS_BUSY_OVERLAY_DELAY_MS = 180;
const AUTO_BACKUP_STATUS_CACHE_KEY = "controler.settings.autoBackupStatus";
let settingsBusyOverlayTimer = 0;
let settingsInitialLoadOverlayTimer = 0;
let settingsInitialLoadOverlayVisible = false;
let autoBackupCachedStatus = null;
let autoBackupSaveTimer = 0;
let autoBackupSaveVersion = 0;
let settingsLoadingOverlayController = null;
let settingsNativeBusyLockActive = false;
const settingsExternalStorageRefreshCoordinator =
  window.ControlerUI?.createDeferredRefreshController?.({
    run: async () => {
      refreshSettingsFromStorage();
    },
  }) || null;

function ensureSettingsDeferredRuntimeLoaded() {
  if (settingsDeferredRuntimePromise) {
    return settingsDeferredRuntimePromise;
  }
  if (typeof window.ControlerUI?.loadScriptOnce !== "function") {
    settingsDeferredRuntimePromise = Promise.resolve();
    return settingsDeferredRuntimePromise;
  }

  settingsDeferredRuntimePromise = window.ControlerUI
    .loadScriptOnce("reminders.js")
    .catch((error) => {
      console.error("加载设置页提醒脚本失败:", error);
    });
  return settingsDeferredRuntimePromise;
}

function scheduleSettingsSlowLoadingOverlay() {
  window.clearTimeout(settingsInitialLoadOverlayTimer);
  settingsInitialLoadOverlayTimer = 0;
  settingsInitialLoadOverlayVisible = true;
  setSettingsBusyState({
    active: true,
    title: "正在加载设置",
    message: "设置项较多，正在准备当前页面，请稍候。",
    lockNativeExit: false,
  });
}

function finishSettingsSlowLoadingOverlay() {
  window.clearTimeout(settingsInitialLoadOverlayTimer);
  settingsInitialLoadOverlayTimer = 0;
  if (!settingsInitialLoadOverlayVisible) {
    return;
  }
  settingsInitialLoadOverlayVisible = false;
  setSettingsBusyState({
    active: false,
    lockNativeExit: false,
  });
}

function queueSettingsInitialReady() {
  if (settingsInitialReadyReported) {
    return;
  }
  settingsInitialReadyReported = true;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    schedule(() => {
      document.body?.classList.remove("settings-bootstrap-pending");
      document.body?.classList.add("settings-bootstrap-ready");
      finishSettingsSlowLoadingOverlay();
      window.ControlerUI?.markPerfStage?.("first-render-done");
      window.ControlerUI?.markNativePageReady?.();
    });
  });
}

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

let themes = [];
const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
const RGB_COLOR_PATTERN =
  /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/;
const THEME_COLOR_FIELDS = [
  { key: "primary", label: "主背景" },
  { key: "secondary", label: "次背景" },
  { key: "tertiary", label: "三级背景" },
  { key: "quaternary", label: "浅层背景" },
  { key: "accent", label: "强调色" },
  { key: "text", label: "文字颜色" },
  { key: "mutedText", label: "次级文字" },
  { key: "border", label: "通用描边" },
  { key: "buttonBg", label: "主按钮" },
  { key: "buttonBgHover", label: "按钮悬停" },
  { key: "buttonText", label: "按钮文字" },
  { key: "buttonBorder", label: "按钮描边" },
  { key: "onAccentText", label: "强调底文字" },
  { key: "navBarBg", label: "底栏底色" },
  { key: "navButtonBg", label: "底栏按钮" },
  { key: "navButtonActiveBg", label: "底栏当前按钮" },
  { key: "delete", label: "删除按钮" },
  { key: "deleteHover", label: "删除悬停" },
  { key: "projectLevel1", label: "一级项目" },
  { key: "projectLevel2", label: "二级项目" },
  { key: "projectLevel3", label: "三级项目" },
  { key: "panel", label: "面板底色" },
  { key: "panelStrong", label: "强化面板" },
  { key: "panelBorder", label: "面板描边" },
  { key: "overlay", label: "遮罩颜色" },
];

const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const APP_NAV_VISIBILITY_STORAGE_KEY = "appNavigationVisibility";
const APP_NAV_REORDER_DESKTOP_HOLD_MS = 280;
const APP_NAV_REORDER_TOUCH_HOLD_MS = 420;
const APP_NAV_REORDER_CANCEL_DISTANCE_PX = 10;
const SETTINGS_COLLAPSIBLE_CARD_SELECTORS = [
  ".settings-card--themes",
  ".settings-card--table-scale",
  ".settings-card--widgets",
  ".settings-storage-card--bundle",
];
const settingsCollapsibleSections = [];
let settingsCollapsibleRefreshFrame = null;
function localizeSettingsUiText(value) {
  return window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "");
}
const ANDROID_WIDGET_MANUAL_ADD_HINT =
  "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加";
const SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS = 20000;
const SETTINGS_WIDGET_PIN_RETURN_GRACE_MS = 1200;
const DEFAULT_ANDROID_WIDGET_PIN_SUPPORT = Object.freeze({
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
const SETTINGS_WIDGET_TYPES =
  window.ControlerPlatformContract?.getWidgetKinds?.()?.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
  })) || [];
const settingsWidgetPinStateByKind = new Map();
const settingsWidgetPinTimeouts = new Map();
const SETTINGS_NAVIGATION_ITEMS = [
  {
    key: "index",
    title: "记录",
    description: "显示时间记录入口。",
  },
  {
    key: "stats",
    title: "统计",
    description: "显示统计视图入口。",
  },
  {
    key: "plan",
    title: "计划",
    description: "显示计划与待办入口。",
  },
  {
    key: "diary",
    title: "日记",
    description: "显示日记页面入口。",
  },
  {
    key: "settings",
    title: "设置",
    description: "显示设置页面入口。",
  },
];

function normalizeNavigationVisibilityState(rawState) {
  const source =
    rawState && typeof rawState === "object" && !Array.isArray(rawState)
      ? rawState
      : {};
  const hiddenPages = Array.isArray(source.hiddenPages)
    ? source.hiddenPages
        .map((pageKey) => String(pageKey || "").trim())
        .filter(
          (pageKey, index, list) =>
            SETTINGS_NAVIGATION_ITEMS.some((item) => item.key === pageKey) &&
            pageKey !== "settings" &&
            list.indexOf(pageKey) === index,
        )
    : [];
  const rawOrder = Array.isArray(source.order) ? source.order : [];
  const order = rawOrder
    .map((pageKey) => String(pageKey || "").trim())
    .filter(
      (pageKey, index, list) =>
        SETTINGS_NAVIGATION_ITEMS.some((item) => item.key === pageKey) &&
        list.indexOf(pageKey) === index,
    );

  SETTINGS_NAVIGATION_ITEMS.forEach((item) => {
    if (!order.includes(item.key)) {
      order.push(item.key);
    }
  });

  return {
    hiddenPages,
    order,
  };
}

function getNavigationState() {
  if (typeof window.ControlerUI?.getAppNavigationState === "function") {
    return window.ControlerUI.getAppNavigationState();
  }

  try {
    return normalizeNavigationVisibilityState(
      JSON.parse(localStorage.getItem(APP_NAV_VISIBILITY_STORAGE_KEY) || "{}"),
    );
  } catch (error) {
    return normalizeNavigationVisibilityState(null);
  }
}

function getHiddenNavigationPages() {
  return [...getNavigationState().hiddenPages];
}

function getOrderedNavigationPages() {
  return [...getNavigationState().order];
}

function saveNavigationState(nextState = {}) {
  const currentState = getNavigationState();
  const normalizedState = normalizeNavigationVisibilityState({
    hiddenPages: Array.isArray(nextState.hiddenPages)
      ? nextState.hiddenPages
      : currentState.hiddenPages,
    order: Array.isArray(nextState.order) ? nextState.order : currentState.order,
  });

  if (typeof window.ControlerUI?.setAppNavigationState === "function") {
    return window.ControlerUI.setAppNavigationState(normalizedState);
  }

  localStorage.setItem(
    APP_NAV_VISIBILITY_STORAGE_KEY,
    JSON.stringify(normalizedState),
  );
  window.ControlerUI?.applyAppNavigationVisibility?.();
  return normalizedState;
}

function saveHiddenNavigationPages(hiddenPages = []) {
  return saveNavigationState({
    hiddenPages,
  });
}

function saveOrderedNavigationPages(order = []) {
  return saveNavigationState({
    order,
  });
}

function updateNavigationVisibilityHint(navigationState = null) {
  const hint = document.getElementById("navigation-visibility-hint");
  if (!hint) {
    return;
  }
  hint.textContent = "";
  hint.hidden = true;
}

function getNavigationToggleStateLabel(isFixed, checked) {
  if (isFixed) {
    return "固定";
  }
  return checked ? "显示中" : "已隐藏";
}

function getNavigationToggleActionLabel(isFixed, checked) {
  if (isFixed) {
    return "固定显示";
  }
  return checked ? "隐藏" : "显示";
}

function updateNavigationToggleCardState(card, checked) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const nextChecked = !!checked;
  const input = card.querySelector("[data-navigation-toggle]");
  const actionButton = card.querySelector("[data-navigation-toggle-action]");
  const stateLabel = card.querySelector("[data-navigation-state-label]");
  const isFixed =
    (input instanceof HTMLInputElement && input.disabled) ||
    (actionButton instanceof HTMLButtonElement && actionButton.disabled);

  card.classList.toggle("is-visible", nextChecked);
  card.dataset.checked = nextChecked ? "true" : "false";
  card.dataset.visibilityState = isFixed
    ? "fixed"
    : nextChecked
      ? "visible"
      : "hidden";

  if (stateLabel instanceof HTMLElement) {
    stateLabel.textContent = getNavigationToggleStateLabel(isFixed, nextChecked);
  }

  if (actionButton instanceof HTMLButtonElement) {
    actionButton.textContent = getNavigationToggleActionLabel(
      isFixed,
      nextChecked,
    );
    actionButton.setAttribute("aria-pressed", nextChecked ? "true" : "false");
  }
}

function refreshNavigationToggleCardStates(grid) {
  if (!(grid instanceof HTMLElement)) {
    return;
  }

  grid.querySelectorAll(".settings-nav-toggle[data-navigation-item]").forEach((card) => {
    const input = card.querySelector("[data-navigation-toggle]");
    updateNavigationToggleCardState(
      card,
      input instanceof HTMLInputElement && input.checked,
    );
  });
}

function bindNavigationReorderInteractions(grid) {
  const itemSelector = ".settings-nav-toggle[data-navigation-item]";

  const swapNavigationOrder = (sourceKey, targetKey) => {
    const nextOrder = getOrderedNavigationPages();
    const sourceIndex = nextOrder.indexOf(sourceKey);
    const targetIndex = nextOrder.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    [nextOrder[sourceIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[sourceIndex],
    ];
    saveOrderedNavigationPages(nextOrder);
    renderNavigationVisibilitySettings();
  };

  grid.querySelectorAll(itemSelector).forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    item.addEventListener("pointerdown", (event) => {
      if (!(event.currentTarget instanceof HTMLElement)) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest(".settings-nav-toggle-check")
      ) {
        return;
      }

      const sourceItem = event.currentTarget;
      const sourceKey = String(sourceItem.dataset.navigationItem || "").trim();
      if (!sourceKey) {
        return;
      }

      const pointerType = event.pointerType || "mouse";
      const holdDelay =
        pointerType === "touch"
          ? APP_NAV_REORDER_TOUCH_HOLD_MS
          : APP_NAV_REORDER_DESKTOP_HOLD_MS;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let targetItem = null;
      let holdTimer = window.setTimeout(() => {
        active = true;
        try {
          sourceItem.setPointerCapture?.(pointerId);
        } catch (error) {
          // ignore capture errors in unsupported runtimes
        }
        sourceItem.classList.add("is-reorder-source");
        grid.classList.add(
          pointerType === "touch"
            ? "is-touch-reordering"
            : "is-desktop-reordering",
        );
        if (pointerType === "touch") {
          window.navigator?.vibrate?.(12);
        }
      }, holdDelay);

      const clearHoldTimer = () => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      const updateTarget = (clientX, clientY) => {
        const element = document.elementFromPoint(clientX, clientY);
        const nextTarget =
          element instanceof Element
            ? element.closest(itemSelector)
            : null;
        const resolvedTarget =
          nextTarget instanceof HTMLElement && nextTarget !== sourceItem
            ? nextTarget
            : null;

        if (targetItem === resolvedTarget) {
          return;
        }
        targetItem?.classList.remove("is-reorder-target");
        targetItem = resolvedTarget;
        targetItem?.classList.add("is-reorder-target");
      };

      const cleanup = () => {
        clearHoldTimer();
        targetItem?.classList.remove("is-reorder-target");
        sourceItem.classList.remove("is-reorder-source");
        grid.classList.remove("is-touch-reordering", "is-desktop-reordering");
        window.removeEventListener("pointermove", handlePointerMove, {
          capture: true,
        });
        window.removeEventListener("pointerup", handlePointerUp, {
          capture: true,
        });
        window.removeEventListener("pointercancel", handlePointerCancel, {
          capture: true,
        });
        try {
          sourceItem.releasePointerCapture?.(pointerId);
        } catch (error) {
          // ignore release errors for browsers that don't support it here
        }
      };

      const handlePointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }

        if (!active) {
          if (
            Math.abs(moveEvent.clientX - startX) >
              APP_NAV_REORDER_CANCEL_DISTANCE_PX ||
            Math.abs(moveEvent.clientY - startY) >
              APP_NAV_REORDER_CANCEL_DISTANCE_PX
          ) {
            cleanup();
          }
          return;
        }

        updateTarget(moveEvent.clientX, moveEvent.clientY);
        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }
      };

      const handlePointerUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        if (active) {
          updateTarget(upEvent.clientX, upEvent.clientY);
        }
        const resolvedTargetItem = targetItem;
        const nextTargetKey = String(
          resolvedTargetItem?.dataset.navigationItem || "",
        );
        cleanup();
        if (active && nextTargetKey && nextTargetKey !== sourceKey) {
          swapNavigationOrder(sourceKey, nextTargetKey);
        }
      };

      const handlePointerCancel = (cancelEvent) => {
        if (cancelEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
      };

      window.addEventListener("pointermove", handlePointerMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener("pointerup", handlePointerUp, {
        capture: true,
      });
      window.addEventListener("pointercancel", handlePointerCancel, {
        capture: true,
      });
    });
  });
}

function renderNavigationVisibilitySettings() {
  const grid = document.getElementById("navigation-visibility-grid");
  if (!grid) {
    return;
  }

  const navigationState = getNavigationState();
  const hiddenPages = new Set(navigationState.hiddenPages);
  grid.innerHTML = "";

  navigationState.order
    .map((pageKey) =>
      SETTINGS_NAVIGATION_ITEMS.find((item) => item.key === pageKey),
    )
    .filter(Boolean)
    .forEach((item) => {
      const card = document.createElement("div");
      const isFixed = item.key === "settings";
      const isVisible = isFixed || !hiddenPages.has(item.key);
      card.className = `settings-nav-toggle${isFixed ? " is-fixed" : ""}`;
      card.dataset.navigationItem = item.key;
      card.innerHTML = `
        <div class="settings-nav-toggle-header">
          <div class="settings-nav-toggle-title">${item.title}</div>
          <span class="settings-nav-toggle-status" data-navigation-state-label>${getNavigationToggleStateLabel(isFixed, isVisible)}</span>
        </div>
        <div class="settings-nav-toggle-description">${item.description}</div>
        <div class="settings-nav-toggle-footer">
          <button
            type="button"
            class="settings-nav-toggle-check"
            data-navigation-toggle-action="${item.key}"
            aria-pressed="${isVisible ? "true" : "false"}"
            ${isFixed ? "disabled" : ""}
          >
            ${getNavigationToggleActionLabel(isFixed, isVisible)}
          </button>
        </div>
        <input
          type="checkbox"
          class="settings-nav-toggle-input"
          data-navigation-toggle="${item.key}"
          ${isVisible ? "checked" : ""}
          ${isFixed ? "disabled" : ""}
          tabindex="-1"
          aria-hidden="true"
        />
      `;
      grid.appendChild(card);
    });

  const syncVisibility = async (changedKey) => {
    if (changedKey === "settings") {
      const fixedInput = grid.querySelector(`[data-navigation-toggle="settings"]`);
      if (fixedInput instanceof HTMLInputElement) {
        fixedInput.checked = true;
      }
      return;
    }

    const nextHiddenPages = SETTINGS_NAVIGATION_ITEMS.filter((item) => {
      if (item.key === "settings") {
        return false;
      }
      const input = grid.querySelector(`[data-navigation-toggle="${item.key}"]`);
      return !(input instanceof HTMLInputElement) || !input.checked;
    }).map((item) => item.key);

    if (
      nextHiddenPages.length >=
      SETTINGS_NAVIGATION_ITEMS.filter((item) => item.key !== "settings").length
    ) {
      const changedInput = grid.querySelector(
        `[data-navigation-toggle="${changedKey}"]`,
      );
      if (changedInput instanceof HTMLInputElement) {
        changedInput.checked = true;
      }
      await showSettingsAlert("至少保留一个导航按钮，不能全部隐藏。", {
        title: "无法保存",
        danger: true,
      });
      return;
    }

    const nextState = saveHiddenNavigationPages(nextHiddenPages);
    updateNavigationVisibilityHint(nextState);
  };

  grid.querySelectorAll("[data-navigation-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      const pageKey = String(input.dataset.navigationToggle || "").trim();
      await syncVisibility(pageKey);
      refreshNavigationToggleCardStates(grid);
    });
  });

  grid.querySelectorAll("[data-navigation-toggle-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const pageKey = String(button.dataset.navigationToggleAction || "").trim();
      const input = grid.querySelector(`[data-navigation-toggle="${pageKey}"]`);
      if (!(input instanceof HTMLInputElement) || input.disabled) {
        return;
      }

      input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  bindNavigationReorderInteractions(grid);
  refreshNavigationToggleCardStates(grid);
  updateNavigationVisibilityHint(navigationState);
}

function getStorageEntries() {
  const keys =
    typeof window !== "undefined" &&
    window.ControlerStorage &&
    typeof window.ControlerStorage.keys === "function"
      ? window.ControlerStorage.keys()
      : Array.from({ length: localStorage.length }, (_, index) =>
          localStorage.key(index),
        ).filter(Boolean);

  return keys.map((key) => [key, localStorage.getItem(key) || ""]);
}

function parseHexColor(color) {
  const match = String(color || "")
    .trim()
    .match(/^#([0-9a-fA-F]{6})$/);
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
    .match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*[\d.]+)?\)$/);
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

  const hex = String(color).trim().match(HEX_COLOR_PATTERN);
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    return `${r},${g},${b}`;
  }

  const rgb = String(color).trim().match(RGB_COLOR_PATTERN);
  if (rgb) {
    return `${rgb[1]},${rgb[2]},${rgb[3]}`;
  }

  return "121,175,133";
}

function toRgbaColor(color, alpha = 1) {
  return `rgba(${toRgbChannels(color)}, ${alpha})`;
}

function isValidThemeColorValue(color) {
  const normalized = String(color || "").trim();
  return (
    HEX_COLOR_PATTERN.test(normalized) || RGB_COLOR_PATTERN.test(normalized)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getReadableTextColor(
  color,
  darkText = "#173326",
  lightText = "#f8fafc",
) {
  const rgb = parseHexColor(toHexColor(color, ""));
  if (!rgb) {
    return darkText;
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.62 ? darkText : lightText;
}

function getRelativeLuminance(color) {
  const rgb = parseHexColor(toHexColor(color, ""));
  if (!rgb) {
    return null;
  }

  const normalizeChannel = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
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
  const accent = isValidThemeColorValue(source.accent)
    ? source.accent.trim()
    : DEFAULT_THEME_COLORS.accent;
  const text = isValidThemeColorValue(source.text)
    ? source.text.trim()
    : DEFAULT_THEME_COLORS.text;
  const buttonBg = isValidThemeColorValue(source.buttonBg)
    ? source.buttonBg.trim()
    : accent;
  const panel = isValidThemeColorValue(source.panel)
    ? source.panel.trim()
    : secondary;
  const panelStrong = isValidThemeColorValue(source.panelStrong)
    ? source.panelStrong.trim()
    : tertiary;
  const panelBorder = isValidThemeColorValue(source.panelBorder)
    ? source.panelBorder.trim()
    : toRgbaColor(accent, 0.28);
  const navBarBg = isValidThemeColorValue(source.navBarBg)
    ? source.navBarBg.trim()
    : panelStrong;
  const navButtonBg = isValidThemeColorValue(source.navButtonBg)
    ? source.navButtonBg.trim()
    : toRgbaColor(accent, 0.12);
  const navButtonActiveBg = isValidThemeColorValue(source.navButtonActiveBg)
    ? source.navButtonActiveBg.trim()
    : buttonBg;
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
    (0.2126 * primaryRgb.r + 0.7152 * primaryRgb.g + 0.0722 * primaryRgb.b) /
      255 >=
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

function sanitizeThemeId(name, existingId = "") {
  const normalized = String(name || existingId || "custom-theme")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || existingId || `custom-theme-${Date.now().toString(36)}`;
}

function normalizeThemeObject(theme, index = 0) {
  const normalizedColors = resolveThemeColors(theme);

  const name =
    typeof theme?.name === "string" && theme.name.trim()
      ? theme.name.trim()
      : `自定义主题 ${index + 1}`;
  const safeId = sanitizeThemeId(theme?.id || name, theme?.id);
  const themeId = BUILT_IN_THEMES.some((item) => item.id === safeId)
    ? `custom-${safeId}`
    : safeId.startsWith("custom-")
      ? safeId
      : `custom-${safeId}`;

  return {
    id: themeId,
    name,
    colors: normalizedColors,
    isCustom: true,
    isBuiltIn: false,
    hasOverride: false,
  };
}

function loadCustomThemes() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(raw)) return [];
    return raw.map((theme, index) => normalizeThemeObject(theme, index));
  } catch (error) {
    console.error("加载自定义主题失败:", error);
    return [];
  }
}

function saveCustomThemes(customThemes) {
  const normalized = Array.isArray(customThemes)
    ? customThemes.map((theme, index) => normalizeThemeObject(theme, index))
    : [];
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(normalized));
  scheduleThemeStorageFlush({
    customThemes: normalized,
  });
  return normalized;
}

function normalizeBuiltInThemeOverride(themeId, override = {}) {
  const baseTheme = BUILT_IN_THEMES.find((item) => item.id === themeId);
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
    console.error("加载内置主题覆盖失败:", error);
    return {};
  }
}

function saveBuiltInThemeOverrides(overrides) {
  const normalizedOverrides = BUILT_IN_THEMES.reduce((accumulator, theme) => {
    const override = normalizeBuiltInThemeOverride(
      theme.id,
      overrides?.[theme.id],
    );
    if (override) {
      accumulator[theme.id] = {
        name: override.name,
        colors: override.colors,
      };
    }
    return accumulator;
  }, {});

  localStorage.setItem(
    BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
    JSON.stringify(normalizedOverrides),
  );
  scheduleThemeStorageFlush({
    builtInThemeOverrides: normalizedOverrides,
  });
  return normalizedOverrides;
}

function syncThemeCatalog() {
  const builtInOverrides = loadBuiltInThemeOverrides();
  themes = [
    ...BUILT_IN_THEMES.map((theme) => {
      const override = builtInOverrides[theme.id];
      const mergedTheme = override
        ? {
            ...theme,
            name: override.name,
            colors: override.colors,
          }
        : theme;

      return {
        ...mergedTheme,
        colors: resolveThemeColors(mergedTheme),
        isCustom: false,
        isBuiltIn: true,
        hasOverride: Boolean(override),
      };
    }),
    ...loadCustomThemes().map((theme) => ({
      ...theme,
      colors: resolveThemeColors(theme),
      isBuiltIn: false,
      hasOverride: false,
    })),
  ];
  return themes;
}

function findThemeById(themeId) {
  return themes.find((theme) => theme.id === themeId) || null;
}

function buildThemeDraft(baseTheme = null) {
  const source = resolveThemeColors(baseTheme || BUILT_IN_THEMES[0]);
  const draftColors = {};
  THEME_COLOR_FIELDS.forEach(({ key }) => {
    draftColors[key] = source[key] || DEFAULT_THEME_COLORS[key] || "#000000";
  });
  return {
    id: baseTheme?.id || "",
    name: baseTheme?.name || "",
    colors: draftColors,
  };
}

function isLightTheme(themeId) {
  const theme = findThemeById(themeId);
  if (themeId === "ivory-light") return true;
  const rgb = parseHexColor(
    toHexColor(theme?.colors?.primary, DEFAULT_THEME_COLORS.primary),
  );
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.72;
}

const TABLE_SCALE_ITEMS = [
  {
    id: "indexProjectTable",
    label: "时间记录 · 项目表格",
    description: "一级/二级/三级项目表格，以及项目总览/记录卡片尺寸",
  },
  {
    id: "statsWeeklyGrid",
    label: "时间统计 · 时间表格",
    description: "统计页周/多日时间网格大小",
  },
  {
    id: "statsHeatmap",
    label: "时间统计 · 日历热图",
    description: "热图单元格与间距显示尺度",
  },
  {
    id: "planYearView",
    label: "时间计划 · 年视图",
    description: "年视图月份卡片与目标列表大小",
  },
  {
    id: "planMonthView",
    label: "时间计划 · 月视图",
    description: "月视图日期格与计划标签大小",
  },
  {
    id: "planWeeklyGrid",
    label: "时间计划 · 周视图",
    description: "周视图时间轴、列宽与事项块大小",
  },
  {
    id: "todoListView",
    label: "待办事项 · 列表视图",
    description: "待办列表卡片、记录与打卡列表尺寸",
  },
  {
    id: "todoQuadrantView",
    label: "待办事项 · 四象限视图",
    description: "四象限面板与事项卡片尺寸",
  },
];

function clampScale(value, min = 0.1, max = 2.2) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, min), max);
}

function getDefaultTableScaleSettings() {
  return {
    per: {},
  };
}

function normalizeTableScaleSettings(raw) {
  const legacyTodoScaleRaw = parseFloat(raw?.per?.todoLists);
  const legacyTodoScale = Number.isFinite(legacyTodoScaleRaw)
    ? clampScale(legacyTodoScaleRaw, 0.1, 2.2)
    : null;
  const legacyGlobalScaleRaw = parseFloat(raw?.global);
  const legacyGlobalScale = Number.isFinite(legacyGlobalScaleRaw)
    ? clampScale(legacyGlobalScaleRaw, 0.1, 2.2)
    : 1;
  const normalized = {
    per: {},
  };

  TABLE_SCALE_ITEMS.forEach((item) => {
    let nextScale = parseFloat(raw?.per?.[item.id]);
    if (
      !Number.isFinite(nextScale) &&
      legacyTodoScale !== null &&
      (item.id === "todoListView" || item.id === "todoQuadrantView")
    ) {
      nextScale = legacyTodoScale;
    }
    normalized.per[item.id] = Number.isFinite(nextScale)
      ? clampScale(nextScale * legacyGlobalScale, 0.1, 2.2)
      : 1;
  });

  return normalized;
}

function loadTableScaleSettings() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}",
    );
    return normalizeTableScaleSettings(raw);
  } catch (error) {
    console.error("加载表格尺寸设置失败:", error);
    return getDefaultTableScaleSettings();
  }
}

function saveTableScaleSettings(settings) {
  const normalized = normalizeTableScaleSettings(settings);
  try {
    localStorage.setItem(TABLE_SIZE_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error("保存表格尺寸设置失败:", error);
  }
  return normalized;
}

function notifyTableScaleSettingsChanged(settings) {
  try {
    localStorage.setItem(TABLE_SIZE_UPDATED_AT_KEY, String(Date.now()));
  } catch (error) {
    console.error("广播表格尺寸更新失败:", error);
  }

  window.dispatchEvent(
    new CustomEvent(TABLE_SIZE_EVENT_NAME, {
      detail: settings,
    }),
  );
}

function formatScaleText(scale) {
  const safe = clampScale(scale);
  return `${Math.round(safe * 100)}% (${safe.toFixed(2)}x)`;
}

function scheduleSettingsCollapsibleRefresh() {
  if (settingsCollapsibleRefreshFrame !== null) {
    window.cancelAnimationFrame(settingsCollapsibleRefreshFrame);
  }

  settingsCollapsibleRefreshFrame = window.requestAnimationFrame(() => {
    settingsCollapsibleRefreshFrame = null;
    settingsCollapsibleSections.forEach((section) => {
      if (!section?.expanded) {
        return;
      }
      const nextHeight = section.inner.scrollHeight;
      section.body.style.maxHeight = `${nextHeight}px`;
    });
  });
}

function setSettingsCollapsibleExpanded(section, expanded, { immediate = false } = {}) {
  if (!section?.card || !section?.header || !section?.body || !section?.inner) {
    return;
  }

  section.expanded = !!expanded;
  section.card.classList.toggle("is-expanded", section.expanded);
  section.card.classList.toggle("is-collapsed", !section.expanded);
  section.header.setAttribute("aria-expanded", section.expanded ? "true" : "false");
  section.body.style.pointerEvents = section.expanded ? "auto" : "none";

  if (immediate) {
    section.body.style.transition = "none";
  } else {
    section.body.style.transition = "";
  }

  if (section.expanded) {
    section.body.hidden = false;
    section.body.style.opacity = "1";
    section.body.style.maxHeight = `${section.inner.scrollHeight}px`;
  } else {
    if (!immediate) {
      section.body.style.maxHeight = `${section.inner.scrollHeight}px`;
      section.body.style.opacity = "1";
      void section.body.offsetHeight;
    }
    section.body.style.maxHeight = "0px";
    section.body.style.opacity = "0";
  }

  if (immediate) {
    window.requestAnimationFrame(() => {
      section.body.style.transition = "";
    });
  }
}

function initSettingsCollapsibleSections() {
  SETTINGS_COLLAPSIBLE_CARD_SELECTORS.forEach((selector) => {
    const card = document.querySelector(selector);
    if (!(card instanceof HTMLElement) || card.dataset.settingsCollapsibleReady === "true") {
      return;
    }

    const content = card.querySelector(".settings-card-content");
    const heading = content?.querySelector("h2, h3, h4");
    if (!(content instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
      return;
    }

    const titleText = heading.textContent?.trim() || "设置";
    const body = document.createElement("div");
    body.className = "settings-collapsible-body";
    const inner = document.createElement("div");
    inner.className = "settings-collapsible-body-inner";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "settings-collapse-toggle";
    toggle.innerHTML = `
      <span class="settings-collapse-toggle-copy">
        <span class="settings-collapse-toggle-title">${titleText}</span>
        <span class="settings-collapse-toggle-hint">点击展开</span>
      </span>
      <span class="settings-collapse-toggle-icon" aria-hidden="true"></span>
    `;

    card.dataset.settingsCollapsibleReady = "true";
    card.classList.add("settings-card--collapsible");

    const nodesToMove = Array.from(content.childNodes).filter((node) => node !== heading);
    nodesToMove.forEach((node) => {
      inner.appendChild(node);
    });
    body.appendChild(inner);
    content.innerHTML = "";
    content.appendChild(toggle);
    content.appendChild(body);

    const section = {
      card,
      header: toggle,
      body,
      inner,
      expanded: false,
    };

    toggle.addEventListener("click", () => {
      setSettingsCollapsibleExpanded(section, !section.expanded);
      toggle.querySelector(".settings-collapse-toggle-hint").textContent = section.expanded
        ? "点击收起"
        : "点击展开";
      scheduleSettingsCollapsibleRefresh();
    });

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (section.expanded) {
          scheduleSettingsCollapsibleRefresh();
        }
      });
      observer.observe(inner);
      section.observer = observer;
    }

    settingsCollapsibleSections.push(section);
    setSettingsCollapsibleExpanded(section, false, { immediate: true });
    card.removeAttribute("data-settings-collapsible-pending");
  });
}

function renderTableSizeSettingsPanel() {
  const itemsContainer = document.getElementById("table-size-items");
  const resetButton = document.getElementById("table-size-reset");
  if (!itemsContainer) return;

  let settings = loadTableScaleSettings();
  settings = saveTableScaleSettings(settings);

  const persistScale = (mutateSettings) => {
    const latest = loadTableScaleSettings();
    mutateSettings(latest);
    settings = saveTableScaleSettings(latest);
    notifyTableScaleSettingsChanged(settings);
    return settings;
  };

  itemsContainer.innerHTML = "";
  TABLE_SCALE_ITEMS.forEach((item) => {
    const scale = clampScale(settings.per[item.id]);
    const card = document.createElement("div");
    card.className = "table-size-card";
    card.style.backgroundColor = "var(--bg-tertiary)";
    card.style.borderRadius = "10px";
    card.style.padding = "12px";
    card.innerHTML = `
      <div class="table-size-card-title" style="color: var(--text-color); font-size: 14px; font-weight: bold;">
        ${item.label}
      </div>
      <div class="table-size-card-description" style="color: var(--muted-text-color); font-size: 12px; margin: 4px 0 10px 0;">
        ${item.description}
      </div>
      <label class="table-size-slider-row" style="display: flex; align-items: center; gap: 8px; color: var(--text-color); font-size: 13px;">
        <span class="table-size-slider-label">尺寸</span>
        <input
          id="table-size-item-${item.id}"
          type="range"
          min="10"
          max="220"
          step="5"
          value="${Math.round(scale * 100)}"
          style="flex: 1"
        />
        <span class="table-size-item-value" id="table-size-item-value-${item.id}">${formatScaleText(scale)}</span>
      </label>
      <div class="table-size-effective-scale" style="color: var(--muted-text-color); font-size: 12px; margin-top: 8px;">
        已保存缩放: <span id="table-size-item-saved-${item.id}">${formatScaleText(scale)}</span>
      </div>
    `;
    itemsContainer.appendChild(card);

    const itemInput = card.querySelector(`#table-size-item-${item.id}`);
    const itemValue = card.querySelector(`#table-size-item-value-${item.id}`);
    const savedValue = card.querySelector(`#table-size-item-saved-${item.id}`);
    if (itemInput && itemValue && savedValue) {
      itemInput.addEventListener("input", () => {
        const nextScale = clampScale(
          (parseInt(itemInput.value, 10) || 100) / 100,
        );
        itemValue.textContent = formatScaleText(nextScale);
        savedValue.textContent = formatScaleText(nextScale);
        persistScale((latest) => {
          latest.per[item.id] = nextScale;
        });
      });
    }
  });

  if (resetButton) {
    resetButton.onclick = () => {
      settings = saveTableScaleSettings(getDefaultTableScaleSettings());
      notifyTableScaleSettingsChanged(settings);
      renderTableSizeSettingsPanel();
      void showSettingsAlert("表格与热图尺寸已重置为 100%。", {
        title: "重置完成",
      });
    };
  }

  scheduleSettingsCollapsibleRefresh();
}

let themeStorageFlushTimer = 0;
let pendingThemeCoreState = null;

function scheduleThemeStorageFlush(partialCore = null) {
  const canReplaceCoreState =
    typeof window.ControlerStorage?.replaceCoreState === "function";
  const canPersistNow = typeof window.ControlerStorage?.persistNow === "function";
  if (
    partialCore &&
    typeof partialCore === "object" &&
    !Array.isArray(partialCore)
  ) {
    pendingThemeCoreState = {
      ...(pendingThemeCoreState || {}),
      ...partialCore,
    };
  }
  if (!canReplaceCoreState && !canPersistNow) {
    return;
  }
  window.clearTimeout(themeStorageFlushTimer);
  themeStorageFlushTimer = window.setTimeout(async () => {
    themeStorageFlushTimer = 0;
    const nextCorePatch = pendingThemeCoreState;
    pendingThemeCoreState = null;

    if (nextCorePatch && canReplaceCoreState) {
      try {
        await window.ControlerStorage.replaceCoreState(nextCorePatch);
      } catch (error) {
        console.error("同步主题核心状态失败:", error);
      }
    }

    if (canPersistNow) {
      try {
        await window.ControlerStorage.persistNow();
      } catch (error) {
        console.error("刷新主题存储写入失败:", error);
      }
    }
  }, 0);
}

// 保存主题到localStorage
function saveTheme(themeId) {
  try {
    localStorage.setItem("selectedTheme", themeId);
    scheduleThemeStorageFlush({
      selectedTheme: themeId,
    });
  } catch (e) {
    console.error("保存主题失败:", e);
  }
}

// 加载主题
function loadTheme() {
  try {
    syncThemeCatalog();
    const savedTheme = localStorage.getItem("selectedTheme");
    if (savedTheme && findThemeById(savedTheme)) {
      applyTheme(savedTheme);
      return savedTheme;
    }
    applyTheme("default");
    saveTheme("default");
    return "default";
  } catch (e) {
    console.error("加载主题失败:", e);
    applyTheme("default");
    return "default";
  }
}

// 应用主题
function applyTheme(themeId) {
  const theme = findThemeById(themeId) || themes[0] || BUILT_IN_THEMES[0];
  const resolvedColors = resolveThemeColors(theme);

  // 设置CSS变量
  const root = document.documentElement;
  root.style.setProperty("--bg-primary", resolvedColors.primary);
  root.style.setProperty("--bg-secondary", resolvedColors.secondary);
  root.style.setProperty("--bg-tertiary", resolvedColors.tertiary);
  root.style.setProperty("--bg-quaternary", resolvedColors.quaternary);
  root.style.setProperty("--accent-color", resolvedColors.accent);
  root.style.setProperty("--text-color", resolvedColors.text);
  root.style.setProperty("--muted-text-color", resolvedColors.mutedText);
  root.style.setProperty("--border-color", resolvedColors.border);
  root.style.setProperty("--delete-btn", resolvedColors.delete);
  root.style.setProperty("--delete-hover", resolvedColors.deleteHover);
  root.style.setProperty("--project-level-1", resolvedColors.projectLevel1);
  root.style.setProperty("--project-level-2", resolvedColors.projectLevel2);
  root.style.setProperty("--project-level-3", resolvedColors.projectLevel3);
  root.style.setProperty(
    "--panel-bg",
    resolvedColors.panel || resolvedColors.secondary,
  );
  root.style.setProperty(
    "--panel-strong-bg",
    resolvedColors.panelStrong || resolvedColors.tertiary,
  );
  root.style.setProperty(
    "--panel-border-color",
    resolvedColors.panelBorder || "rgba(121,175,133,0.28)",
  );
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
  root.style.setProperty(
    "--accent-color-rgb",
    toRgbChannels(resolvedColors.accent),
  );
  root.style.colorScheme = isLightTheme(theme.id) ? "light" : "dark";

  // 设置data-theme属性
  root.setAttribute("data-theme", theme.id);

  // 更新主题选择器UI
  updateThemeSelector(theme.id);

  window.dispatchEvent(
    new CustomEvent("controler:theme-applied", {
      detail: {
        themeId: theme.id,
        colors: { ...resolvedColors },
      },
    }),
  );
}

// 更新主题选择器UI
function updateThemeSelector(selectedThemeId) {
  const selector = document.getElementById("theme-selector");
  if (!selector) return;

  syncThemeCatalog();
  selector.innerHTML = "";

  themes.forEach((theme) => {
    const resolvedColors = resolveThemeColors(theme);
    const option = document.createElement("div");
    option.className = `theme-option controler-pressable ${theme.id === selectedThemeId ? "selected" : ""}`;
    option.dataset.theme = theme.id;

    const preview = document.createElement("div");
    preview.className = "theme-preview";
    preview.style.background = `
      radial-gradient(circle at 22% 22%, rgba(${toRgbChannels(resolvedColors.accent)}, 0.22), transparent 42%),
      linear-gradient(180deg, color-mix(in srgb, ${resolvedColors.tertiary} 44%, transparent), transparent 62%),
      ${resolvedColors.primary}
    `;

    const previewSurface = document.createElement("div");
    previewSurface.className = "theme-preview-surface";
    previewSurface.style.background = `color-mix(in srgb, ${resolvedColors.panel} 88%, transparent)`;
    previewSurface.style.borderColor = `color-mix(in srgb, ${resolvedColors.panelBorder} 86%, transparent)`;

    const previewAccent = document.createElement("span");
    previewAccent.className = "theme-preview-accent";
    previewAccent.style.background = resolvedColors.accent;
    previewSurface.appendChild(previewAccent);
    preview.appendChild(previewSurface);

    const previewNav = document.createElement("div");
    previewNav.className = "theme-preview-nav";
    previewNav.style.background = `color-mix(in srgb, ${resolvedColors.navBarBg} 92%, transparent)`;
    previewNav.style.borderColor = `color-mix(in srgb, ${resolvedColors.panelBorder} 72%, transparent)`;

    for (let index = 0; index < 3; index += 1) {
      const navItem = document.createElement("span");
      navItem.className = `theme-preview-nav-item ${index === 1 ? "is-active" : ""}`;
      navItem.style.background = resolvedColors.navButtonActiveBg;
      navItem.style.borderColor =
        index === 1
          ? `color-mix(in srgb, ${resolvedColors.navButtonActiveBg} 68%, ${resolvedColors.panelBorder})`
          : `color-mix(in srgb, ${resolvedColors.navButtonActiveBg} 56%, ${resolvedColors.panelBorder})`;
      navItem.style.color = resolvedColors.navButtonActiveText;
      previewNav.appendChild(navItem);
    }

    preview.appendChild(previewNav);
    option.appendChild(preview);

    const header = document.createElement("div");
    header.className = "theme-option-header";

    const name = document.createElement("div");
    name.className = "theme-option-name";
    name.textContent = theme.name;
    header.appendChild(name);

    const badge = document.createElement("span");
    badge.className = "theme-option-badge";
    badge.textContent = theme.isCustom
      ? "自定义"
      : theme.hasOverride
        ? "已修改"
        : "内置";
    header.appendChild(badge);

    option.appendChild(header);

    const footer = document.createElement("div");
    footer.className = "theme-option-footer";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "theme-option-action";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      showThemeEditorModal(theme);
    });
    footer.appendChild(editBtn);
    option.appendChild(footer);

    option.addEventListener("click", () => {
      applyTheme(theme.id);
      saveTheme(theme.id);

      // 更新选中状态
      document.querySelectorAll(".theme-option").forEach((el) => {
        el.classList.remove("selected");
      });
      option.classList.add("selected");
    });

    selector.appendChild(option);
  });

  scheduleSettingsCollapsibleRefresh();
}

function ensureThemeSelectorVisible(selectedThemeId) {
  const selector = document.getElementById("theme-selector");
  if (!selector) return;
  if (selector.children.length === 0) {
    updateThemeSelector(selectedThemeId);
  }
}

function upsertCustomTheme(themeDraft) {
  const existingThemes = loadCustomThemes();
  const isEditing = Boolean(themeDraft.id);
  const normalizedDraft = normalizeThemeObject(
    {
      ...themeDraft,
      id: isEditing
        ? themeDraft.id
        : `custom-${sanitizeThemeId(themeDraft.name)}`,
    },
    existingThemes.length,
  );

  const nextThemes = existingThemes.filter(
    (theme) => theme.id !== normalizedDraft.id,
  );
  nextThemes.push(normalizedDraft);
  saveCustomThemes(nextThemes);
  syncThemeCatalog();
  return normalizedDraft;
}

function upsertBuiltInThemeOverride(themeDraft) {
  const baseTheme = BUILT_IN_THEMES.find((theme) => theme.id === themeDraft.id);
  if (!baseTheme) {
    return null;
  }

  const overrides = loadBuiltInThemeOverrides();
  const normalizedOverride = normalizeBuiltInThemeOverride(
    themeDraft.id,
    themeDraft,
  );
  if (!normalizedOverride) {
    return null;
  }

  overrides[themeDraft.id] = {
    name: normalizedOverride.name,
    colors: normalizedOverride.colors,
  };
  saveBuiltInThemeOverrides(overrides);
  syncThemeCatalog();
  return (
    findThemeById(themeDraft.id) || {
      ...baseTheme,
      name: normalizedOverride.name,
      colors: normalizedOverride.colors,
      hasOverride: true,
    }
  );
}

function upsertThemeDraft(themeDraft) {
  if (BUILT_IN_THEMES.some((theme) => theme.id === themeDraft.id)) {
    return upsertBuiltInThemeOverride(themeDraft);
  }
  return upsertCustomTheme(themeDraft);
}

function deleteCustomTheme(themeId) {
  const nextThemes = loadCustomThemes().filter((theme) => theme.id !== themeId);
  saveCustomThemes(nextThemes);
  syncThemeCatalog();

  if (localStorage.getItem("selectedTheme") === themeId) {
    applyTheme("default");
    saveTheme("default");
  } else {
    updateThemeSelector(localStorage.getItem("selectedTheme") || "default");
  }
}

function resetBuiltInThemeOverride(themeId) {
  const overrides = loadBuiltInThemeOverrides();
  delete overrides[themeId];
  saveBuiltInThemeOverrides(overrides);
  syncThemeCatalog();

  if (localStorage.getItem("selectedTheme") === themeId) {
    applyTheme(themeId);
    saveTheme(themeId);
  } else {
    updateThemeSelector(localStorage.getItem("selectedTheme") || "default");
  }
}

function showThemeEditorModal(theme = null) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "4200";

  const draft = buildThemeDraft(theme);
  const isEditingCustomTheme = Boolean(theme?.isCustom);
  const isBuiltInTheme = Boolean(theme?.isBuiltIn);
  const canResetBuiltIn = Boolean(isBuiltInTheme && theme?.hasOverride);
  const dialogTitle = isEditingCustomTheme
    ? "编辑自定义主题"
    : theme
      ? "编辑主题"
      : "添加自定义主题";

  const fieldsHtml = THEME_COLOR_FIELDS.map(
    ({ key, label }) => `
      <label class="theme-editor-row">
        <span class="theme-editor-row-label">${escapeHtml(label)}</span>
        <input type="color" data-theme-color="${key}" value="${toHexColor(draft.colors[key], DEFAULT_THEME_COLORS[key] || "#000000")}" />
        <input
          type="text"
          class="time-input theme-editor-row-input"
          data-theme-color-text="${key}"
          value="${escapeHtml(draft.colors[key])}"
          placeholder="#79AF85 或 rgba(121, 175, 133, 0.42)"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    `,
  ).join("");

  modal.innerHTML = `
    <div class="modal-content themed-dialog-card ms" style="width:min(920px, calc(100vw - 32px)); max-width:min(920px, calc(100vw - 32px)); max-height:min(90vh, 860px); overflow:auto; padding:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px;">
        <div>
          <div class="themed-dialog-title">${dialogTitle}</div>
          <div class="themed-dialog-message">支持输入 #RRGGBB 与 rgba(...)，保存后会立即应用到按钮、底部导航、面板、弹窗、下拉菜单、小组件与浮层边框等主题适配区域。</div>
        </div>
      </div>
      <label style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <span style="color: var(--text-color); font-size: 13px; font-weight: 600;">主题名称</span>
        <input id="custom-theme-name" type="text" class="time-input" value="${escapeHtml(draft.name)}" placeholder="例如：冰川蓝" />
      </label>
      <div class="theme-editor-grid">${fieldsHtml}</div>
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:18px;">
        <div>
          ${
            isEditingCustomTheme
              ? '<button type="button" class="bts themed-dialog-confirm-btn is-danger" id="delete-custom-theme-btn" style="margin:0;">删除</button>'
              : canResetBuiltIn
                ? '<button type="button" class="bts themed-dialog-confirm-btn is-danger" id="reset-built-in-theme-btn" style="margin:0;">恢复默认</button>'
                : ""
          }
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="bts" id="cancel-custom-theme-btn" style="margin:0;">取消</button>
          <button type="button" class="bts" id="save-custom-theme-btn" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };

  const syncTextWithPicker = (key, value) => {
    const textInput = modal.querySelector(`[data-theme-color-text="${key}"]`);
    if (textInput) {
      textInput.value = value;
    }
  };

  const syncPickerWithText = (key, value) => {
    const pickerInput = modal.querySelector(`[data-theme-color="${key}"]`);
    if (pickerInput && /^#([0-9a-fA-F]{6})$/.test(value)) {
      pickerInput.value = value;
    }
  };

  modal.querySelectorAll("[data-theme-color]").forEach((input) => {
    input.addEventListener("input", () => {
      syncTextWithPicker(input.dataset.themeColor, input.value);
    });
  });

  modal.querySelectorAll("[data-theme-color-text]").forEach((input) => {
    input.addEventListener("input", () => {
      syncPickerWithText(input.dataset.themeColorText, input.value.trim());
    });
  });

  modal
    .querySelector("#cancel-custom-theme-btn")
    ?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  modal
    .querySelector("#save-custom-theme-btn")
    ?.addEventListener("click", async () => {
      const nameInput = modal.querySelector("#custom-theme-name");
      const name = nameInput?.value?.trim();
      if (!name) {
        await showSettingsAlert("请输入主题名称。", {
          title: "主题名称不能为空",
          danger: true,
        });
        return;
      }

      const nextDraft = {
        id: theme?.id || "",
        name,
        colors: {},
      };

      let hasInvalidColor = false;
      THEME_COLOR_FIELDS.forEach(({ key }) => {
        const textInput = modal.querySelector(
          `[data-theme-color-text="${key}"]`,
        );
        const colorValue = textInput?.value?.trim() || "";
        if (!isValidThemeColorValue(colorValue)) {
          hasInvalidColor = true;
        }
        nextDraft.colors[key] = colorValue;
      });

      if (hasInvalidColor) {
        await showSettingsAlert(
          "请为每个颜色项填写合法颜色值，例如 #79AF85 或 rgba(121, 175, 133, 0.42)。",
          {
            title: "颜色格式无效",
            danger: true,
          },
        );
        return;
      }

      const savedTheme = upsertThemeDraft(nextDraft);
      if (!savedTheme) {
        await showSettingsAlert("主题保存失败，请稍后重试。", {
          title: "保存失败",
          danger: true,
        });
        return;
      }
      applyTheme(savedTheme.id);
      saveTheme(savedTheme.id);
      closeModal();
    });

  modal
    .querySelector("#delete-custom-theme-btn")
    ?.addEventListener("click", async () => {
      const confirmed = await requestSettingsConfirmation(
        `确定删除主题“${theme?.name || ""}”吗？`,
        {
          title: "删除自定义主题",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) return;

      deleteCustomTheme(theme.id);
      closeModal();
    });

  modal
    .querySelector("#reset-built-in-theme-btn")
    ?.addEventListener("click", async () => {
      const confirmed = await requestSettingsConfirmation(
        `确定将“${theme?.name || ""}”恢复为默认配色吗？`,
        {
          title: "恢复默认主题",
          confirmText: "恢复默认",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) return;

      resetBuiltInThemeOverride(theme.id);
      closeModal();
    });

  document.body.appendChild(modal);
}

// 计算存储使用情况
function updateStorageStatus() {
  const statusElement = document.getElementById("storage-status");
  if (!statusElement) return;

  const controlerStorage = window.ControlerStorage;
  if (typeof controlerStorage?.getStorageStatus === "function") {
    controlerStorage
      .getStorageStatus()
      .then((status) => {
        if (!status) {
          throw new Error("empty status");
        }

        const sizeKb = Number(status.size || 0) / 1024;
        statusElement.innerHTML = `
          <p>存储模式: ${status.storageMode || status.bundleMode || "directory-bundle"}</p>
          <p>存储使用: ${sizeKb.toFixed(2)} KB</p>
          <p>记录数量: ${status.records || 0} 条</p>
          <p>项目数量: ${status.projects || 0} 个</p>
        `;
        void updateBundleStoragePanels(status);
        void refreshAutoBackupPanel();
        updateDataManagementGuideHint();
      })
      .catch(() => {
        renderLocalStorageStatusFallback(statusElement);
      });
    return;
  }

  renderLocalStorageStatusFallback(statusElement);
}

function renderLocalStorageStatusFallback(statusElement) {
  try {
    let totalBytes = 0;

    // 计算所有localStorage项目的大小
    getStorageEntries().forEach(([key, value]) => {
      totalBytes += key.length + value.length;
    });

    const kb = totalBytes / 1024;
    const records = localStorage.getItem("records")
      ? JSON.parse(localStorage.getItem("records")).length
      : 0;
    const projects = localStorage.getItem("projects")
      ? JSON.parse(localStorage.getItem("projects")).length
      : 0;

    statusElement.innerHTML = `
      <p>存储模式: directory-bundle</p>
      <p>存储使用: ${kb.toFixed(2)} KB</p>
      <p>记录数量: ${records} 条</p>
      <p>项目数量: ${projects} 个</p>
    `;
    void updateBundleStoragePanels({
      storageMode: "directory-bundle",
      storagePath: "browser://localStorage/bundle-manifest.json",
      storageDirectory: "browser://localStorage",
      syncFileName: "bundle-manifest.json",
    });
    void refreshAutoBackupPanel();
    updateDataManagementGuideHint();
  } catch (e) {
    console.error("更新存储状态失败:", e);
    statusElement.textContent = "无法获取存储状态";
    void updateBundleStoragePanels(null);
    void refreshAutoBackupPanel();
    updateDataManagementGuideHint();
  }
}

function getSettingsLanguage() {
  return (
    window.ControlerI18n?.getLanguage?.() ||
    localStorage.getItem("appLanguage") ||
    "zh-CN"
  );
}

function isSettingsEnglish() {
  return getSettingsLanguage() === "en-US";
}

function getGuideDiaryReferenceEntries() {
  const guideTitles = Array.isArray(window.ControlerGuideBundle?.GUIDE_DIARY_TITLES)
    ? window.ControlerGuideBundle.GUIDE_DIARY_TITLES
    : [];
  let storedEntries = [];

  try {
    storedEntries = JSON.parse(localStorage.getItem("diaryEntries") || "[]");
  } catch (error) {
    storedEntries = [];
  }

  if (!guideTitles.length || !Array.isArray(storedEntries)) {
    return [];
  }

  return guideTitles
    .map((title) =>
      storedEntries.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          String(entry.title || "") === title &&
          String(entry.date || "").trim(),
      ),
    )
    .filter(Boolean);
}

function formatGuideDiaryReference(entry) {
  const date = String(entry?.date || "").trim();
  if (!date) {
    return "";
  }
  return date;
}

function updateDataManagementGuideHint() {
  const hintElement = document.getElementById("data-management-guide-hint");
  if (!hintElement) {
    return;
  }

  const guideReferences = getGuideDiaryReferenceEntries()
    .map((entry) => formatGuideDiaryReference(entry))
    .filter(Boolean);

  if (guideReferences.length) {
    hintElement.textContent = isSettingsEnglish()
      ? `Import now has both replace and diff modes. Replace removes content not included in the import, while diff keeps untouched content. Details were written into diary entries on ${guideReferences.join(", ")}.`
      : `导入现在分为“整包替换”和“差异导入”。整包替换会清掉未导入内容，差异导入会保留未导入内容。详细说明写在 ${guideReferences.join("、")} 的日记里。`;
    return;
  }

  hintElement.textContent = isSettingsEnglish()
    ? "Import now has both replace and diff modes. Export a backup before risky operations."
    : "导入现在有“整包替换”和“差异导入”两种模式；高风险操作前先导出备份。";
}

function buildLocalOnlyBackupPayload() {
  const normalizedGuideState =
    window.ControlerGuideBundle?.normalizeGuideState?.(
      JSON.parse(localStorage.getItem("guideState") || "null"),
    ) || {
      bundleVersion: 1,
      dismissedCardIds: [],
    };
  return {
    guideState: normalizedGuideState,
    customThemes: loadCustomThemes(),
    builtInThemeOverrides: loadBuiltInThemeOverrides(),
    tableScaleSettings: normalizeTableScaleSettings(
      JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}"),
    ),
    appNavigationVisibility: normalizeNavigationVisibilityState(
      getNavigationState(),
    ),
    selectedTheme: localStorage.getItem("selectedTheme") || "default",
    timerSessionState: JSON.parse(
      localStorage.getItem("timerSessionState") || "null",
    ),
    timestamp: new Date().toISOString(),
  };
}

function buildBackupPayload() {
  return {
    projects: JSON.parse(localStorage.getItem("projects") || "[]"),
    records: JSON.parse(localStorage.getItem("records") || "[]"),
    plans: JSON.parse(localStorage.getItem("plans") || "[]"),
    todos: JSON.parse(localStorage.getItem("todos") || "[]"),
    checkinItems: JSON.parse(localStorage.getItem("checkinItems") || "[]"),
    dailyCheckins: JSON.parse(localStorage.getItem("dailyCheckins") || "[]"),
    checkins: JSON.parse(localStorage.getItem("checkins") || "[]"),
    yearlyGoals: JSON.parse(localStorage.getItem("yearlyGoals") || "{}"),
    diaryEntries: JSON.parse(localStorage.getItem("diaryEntries") || "[]"),
    diaryCategories: JSON.parse(
      localStorage.getItem("diaryCategories") || "[]",
    ),
    ...buildLocalOnlyBackupPayload(),
  };
}

async function buildBundleAwareBackupPayload() {
  const bundleStorage = getSettingsStorageBundle();
  const controlerStorage = window.ControlerStorage;
  if (
    !bundleStorage?.buildLegacyStateFromBundle ||
    typeof controlerStorage?.getManifest !== "function" ||
    typeof controlerStorage?.getCoreState !== "function" ||
    typeof controlerStorage?.loadSectionRange !== "function"
  ) {
    return buildBackupPayload();
  }

  const manifest = await getSettingsBundleManifest();
  const coreState = await controlerStorage.getCoreState();
  if (!manifest || !coreState) {
    return buildBackupPayload();
  }

  const partitionMap = {};
  for (const section of SETTINGS_PARTITION_SECTION_OPTIONS.map((item) => item.value)) {
    const partitions = getManifestSectionPartitions(manifest, section);
    if (!partitions.length) {
      partitionMap[section] = {};
      continue;
    }

    const result = await controlerStorage.loadSectionRange(section, {
      periodIds: partitions.map((partition) => partition.periodId),
    });
    const grouped = {};
    const items = Array.isArray(result?.items) ? result.items : [];
    partitions.forEach((partition) => {
      grouped[partition.periodId] = items.filter(
        (item) =>
          bundleStorage.getPeriodIdForSectionItem(section, item) ===
          partition.periodId,
      );
    });
    partitionMap[section] = grouped;
  }

  return {
    ...bundleStorage.buildLegacyStateFromBundle({
      manifest,
      core: coreState,
      recurringPlans: Array.isArray(coreState?.recurringPlans)
        ? coreState.recurringPlans
        : [],
      partitionMap,
    }),
    ...buildLocalOnlyBackupPayload(),
  };
}

function normalizeImportedBackupPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("无效的数据格式");
  }
  if (!Array.isArray(data.projects) || !Array.isArray(data.records)) {
    throw new Error("无效的数据格式");
  }

  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const currentSelectedTheme =
    localStorage.getItem("selectedTheme") || "default";
  const currentCustomThemes = loadCustomThemes();
  const currentBuiltInThemeOverrides = loadBuiltInThemeOverrides();

  const importedState = {
    projects: data.projects,
    records: data.records,
    plans: Array.isArray(data.plans) ? data.plans : [],
    todos: Array.isArray(data.todos) ? data.todos : [],
    checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
    dailyCheckins: Array.isArray(data.dailyCheckins) ? data.dailyCheckins : [],
    checkins: Array.isArray(data.checkins) ? data.checkins : [],
    yearlyGoals:
      data.yearlyGoals &&
      typeof data.yearlyGoals === "object" &&
      !Array.isArray(data.yearlyGoals)
        ? data.yearlyGoals
        : {},
    diaryEntries: Array.isArray(data.diaryEntries) ? data.diaryEntries : [],
    diaryCategories: Array.isArray(data.diaryCategories)
      ? data.diaryCategories
      : [],
    guideState:
      window.ControlerGuideBundle?.normalizeGuideState?.(data.guideState) || {
        bundleVersion: 1,
        dismissedCardIds: [],
      },
    customThemes:
      hasOwn("customThemes") && Array.isArray(data.customThemes)
        ? data.customThemes
        : currentCustomThemes,
    builtInThemeOverrides:
      hasOwn("builtInThemeOverrides") &&
      data.builtInThemeOverrides &&
      typeof data.builtInThemeOverrides === "object" &&
      !Array.isArray(data.builtInThemeOverrides)
        ? data.builtInThemeOverrides
        : currentBuiltInThemeOverrides,
    tableScaleSettings: normalizeTableScaleSettings(
      data.tableScaleSettings &&
        typeof data.tableScaleSettings === "object" &&
        !Array.isArray(data.tableScaleSettings)
        ? data.tableScaleSettings
        : {},
    ),
    appNavigationVisibility: normalizeNavigationVisibilityState(
      data.appNavigationVisibility,
    ),
    selectedTheme:
      hasOwn("selectedTheme") &&
      typeof data.selectedTheme === "string" &&
      data.selectedTheme.trim()
        ? data.selectedTheme.trim()
        : currentSelectedTheme,
  };

  if (
    data.timerSessionState &&
    typeof data.timerSessionState === "object" &&
    !Array.isArray(data.timerSessionState)
  ) {
    importedState.timerSessionState = data.timerSessionState;
  }

  return importedState;
}

async function flushStorageWrites() {
  if (typeof window.ControlerStorage?.flush === "function") {
    return window.ControlerStorage.flush();
  }
  if (typeof window.ControlerStorage?.persistNow === "function") {
    return window.ControlerStorage.persistNow();
  }
  if (typeof window.ControlerStorage?.persist === "function") {
    return window.ControlerStorage.persist();
  }
  return null;
}

async function buildClearDataTargetMessage() {
  const status = await getStorageStatusSnapshot();
  const displayPath = resolveStorageDisplayPath(status);
  if (!displayPath) {
    return "";
  }
  return `${
    status?.isCustomPath ? "当前清除目标" : "当前数据目录"
  }：\n${displayPath}`;
}

async function buildClearDataConfirmationMessage(baseMessage) {
  const targetMessage = await buildClearDataTargetMessage();
  return targetMessage ? `${baseMessage}\n\n${targetMessage}` : baseMessage;
}

function buildStorageSwitchSuccessMessage(status, options = {}) {
  const displayPath = resolveStorageDisplayPath(status) || "已选择目标";
  if (status?.switchAction === "adopted-existing") {
    return `已切换到同步目录：\n${displayPath}\n\n检测到目录里已有有效的 bundle 数据，应用将直接载入该目录中的内容。页面将刷新一次以重新载入内容。`;
  }
  if (status?.switchAction === "migrated-legacy") {
    return `已切换到同步目录：\n${displayPath}\n\n检测到旧单文件 JSON，已自动迁移为目录 bundle，并保留旧文件备份。页面将刷新一次以重新载入内容。`;
  }
  return `已切换到同步目录：\n${displayPath}\n\n目标目录中没有可用的 bundle 数据，当前应用数据已写入该目录。页面将刷新一次以重新载入内容。`;
}

async function getStorageStatusSnapshot() {
  if (window.electronAPI?.isElectron) {
    return window.electronAPI.storageStatus();
  }
  if (typeof window.ControlerStorage?.getStorageStatus === "function") {
    return window.ControlerStorage.getStorageStatus();
  }
  return null;
}

async function getAutoBackupStatusSnapshot() {
  if (typeof window.ControlerStorage?.getAutoBackupStatus === "function") {
    return window.ControlerStorage.getAutoBackupStatus();
  }
  if (
    window.electronAPI?.isElectron &&
    typeof window.electronAPI.storageGetAutoBackupStatus === "function"
  ) {
    return window.electronAPI.storageGetAutoBackupStatus();
  }
  return null;
}

function supportsAutoBackupStatusApi() {
  return (
    typeof window.ControlerStorage?.getAutoBackupStatus === "function" ||
    (window.electronAPI?.isElectron &&
      typeof window.electronAPI.storageGetAutoBackupStatus === "function")
  );
}

function resolveStorageDisplayPath(status = null) {
  return resolveStoragePathPresentation(status).displayPath;
}

function resolveStorageDisplayLabel(status = null) {
  return resolveStoragePathPresentation(status).displayLabel;
}

function normalizeSettingsPathValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
}

function buildSettingsBundleManifestPath(directory = "", fileName = "") {
  const safeDirectory = String(directory || "")
    .trim()
    .replace(/[\\/]+$/, "");
  const safeFileName = String(fileName || "")
    .trim()
    .replace(/^[/\\]+/, "");
  if (!safeDirectory) {
    return safeFileName;
  }
  if (!safeFileName) {
    return safeDirectory;
  }
  return `${safeDirectory}/${safeFileName}`;
}

function getSettingsRelativePath(target = "", base = "") {
  const normalizedTarget = normalizeSettingsPathValue(target);
  const normalizedBase = normalizeSettingsPathValue(base).replace(/\/+$/, "");
  if (!normalizedTarget || !normalizedBase) {
    return "";
  }
  if (normalizedTarget === normalizedBase) {
    return "";
  }
  if (normalizedTarget.startsWith(`${normalizedBase}/`)) {
    return normalizedTarget.slice(normalizedBase.length + 1);
  }
  return "";
}

function resolveStorageRawPath(status = null) {
  const actualUri =
    typeof status?.actualUri === "string" ? status.actualUri.trim() : "";
  const storagePath =
    typeof status?.storagePath === "string" ? status.storagePath.trim() : "";
  const defaultStoragePath =
    typeof status?.defaultStoragePath === "string"
      ? status.defaultStoragePath.trim()
      : "";
  const documentsPath =
    typeof status?.documentsPath === "string" ? status.documentsPath.trim() : "";
  const userDataPath =
    typeof status?.userDataPath === "string" ? status.userDataPath.trim() : "";
  const storageDirectory =
    typeof status?.storageDirectory === "string"
      ? status.storageDirectory.trim()
      : "";
  const syncFileName =
    typeof status?.syncFileName === "string" ? status.syncFileName.trim() : "";
  const isBundleMode =
    status?.storageMode === "directory-bundle" ||
    status?.bundleMode === "directory-bundle";

  return (
    storagePath ||
    (isBundleMode && storageDirectory && syncFileName
      ? `${storageDirectory}/${syncFileName}`
      : "") ||
    actualUri ||
    defaultStoragePath ||
    (storageDirectory && syncFileName ? `${storageDirectory}/${syncFileName}` : "") ||
    syncFileName ||
    documentsPath ||
    userDataPath ||
    ""
  );
}

function resolveStoragePathPresentation(status = null) {
  const storageDirectory =
    typeof status?.storageDirectory === "string"
      ? status.storageDirectory.trim()
      : "";
  const syncFileName =
    typeof status?.syncFileName === "string" ? status.syncFileName.trim() : "";
  const storagePath =
    typeof status?.storagePath === "string" ? status.storagePath.trim() : "";
  const actualUri =
    typeof status?.actualUri === "string" ? status.actualUri.trim() : "";
  const userDataPath =
    typeof status?.userDataPath === "string" ? status.userDataPath.trim() : "";
  const documentsPath =
    typeof status?.documentsPath === "string" ? status.documentsPath.trim() : "";
  const isBundleMode =
    status?.storageMode === "directory-bundle" ||
    status?.bundleMode === "directory-bundle";
  const rawPath = resolveStorageRawPath(status);
  const platform = String(status?.platform || "").trim().toLowerCase();
  const isAndroidNative = Boolean(status?.isNativeApp) && platform === "android";
  const privateRoots = [documentsPath, userDataPath]
    .map((item) => normalizeSettingsPathValue(item))
    .filter(Boolean);

  let displayPath =
    (isBundleMode && storageDirectory && syncFileName
      ? buildSettingsBundleManifestPath(storageDirectory, syncFileName)
      : "") ||
    rawPath ||
    syncFileName ||
    actualUri ||
    "";
  let displayDirectory = storageDirectory || "";
  let displayLabel = displayPath || syncFileName || actualUri || "";
  let note = "";

  const privateRoot =
    isAndroidNative && !status?.isCustomPath
      ? privateRoots.find((basePath) => {
          const normalizedDirectory = normalizeSettingsPathValue(storageDirectory);
          const normalizedRawPath = normalizeSettingsPathValue(rawPath);
          return (
            normalizedDirectory === basePath ||
            normalizedRawPath === basePath ||
            normalizedDirectory.startsWith(`${basePath}/`) ||
            normalizedRawPath.startsWith(`${basePath}/`)
          );
        }) || ""
      : "";

  if (privateRoot) {
    const relativeDirectory = getSettingsRelativePath(storageDirectory, privateRoot);
    const relativePath = getSettingsRelativePath(rawPath, privateRoot);
    displayDirectory = relativeDirectory
      ? buildSettingsBundleManifestPath("应用私有目录", relativeDirectory)
      : "应用私有目录";
    displayPath = relativePath
      ? buildSettingsBundleManifestPath("应用私有目录", relativePath)
      : buildSettingsBundleManifestPath(
          displayDirectory,
          syncFileName || "bundle-manifest.json",
        );
    displayLabel = syncFileName
      ? buildSettingsBundleManifestPath("应用私有目录", syncFileName)
      : displayPath;
    note = "位于应用私有目录，系统文件管理器通常不可直接访问。";
  } else if (
    isAndroidNative &&
    status?.isCustomPath &&
    actualUri.startsWith("content://") &&
    !storageDirectory
  ) {
    displayDirectory = "已授权外部目录";
    displayPath = syncFileName
      ? buildSettingsBundleManifestPath(displayDirectory, syncFileName)
      : actualUri;
    displayLabel = syncFileName || actualUri || displayPath;
    note = "这是系统授权的外部目录入口，路径可能显示为内容 URI。";
  }

  return {
    displayPath: displayPath || rawPath || syncFileName || actualUri || "",
    displayLabel: displayLabel || displayPath || syncFileName || actualUri || "",
    displayDirectory: displayDirectory || storageDirectory || "",
    rawPath,
    rawDirectory: storageDirectory,
    note,
  };
}

function escapeSettingsHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSettingsDateTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "暂无";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  try {
    return parsed.toLocaleString();
  } catch (error) {
    return parsed.toISOString();
  }
}

function formatAutoBackupUnitLabel(unit) {
  switch (String(unit || "").trim()) {
    case "hour":
      return "小时";
    case "week":
      return "周";
    case "day":
    default:
      return "天";
  }
}

function formatAutoBackupSize(size) {
  const numeric = Number(size || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)} KB`;
  }
  return `${Math.round(numeric)} B`;
}

function formatBundleBackupSource(source) {
  const normalized = String(source || "").trim();
  switch (normalized) {
    case "legacy-import":
      return "旧单文件导入备份";
    case "legacy-auto-migration":
    case "legacy-migration":
      return "旧单文件自动迁移备份";
    default:
      return normalized || "未知来源";
  }
}

async function updateBundleStoragePanels(status = null) {
  const structureElement = document.getElementById("bundle-structure-info");
  const backupElement = document.getElementById("bundle-backup-info");
  if (!(structureElement instanceof HTMLElement) || !(backupElement instanceof HTMLElement)) {
    return;
  }

  const manifest = await getSettingsBundleManifest();
  const pathPresentation = resolveStoragePathPresentation(status);
  const displayManifestPath = pathPresentation.displayPath;
  const displayDirectory = pathPresentation.displayDirectory;
  const sectionSummaries = SETTINGS_PARTITION_SECTION_OPTIONS.map((item) => {
    const partitions = getManifestSectionPartitions(manifest, item.value);
    return `<div><strong>${escapeSettingsHtml(item.label)}</strong>：${
      partitions.length
        ? `当前有 ${partitions.length} 个按月分片`
        : "当前还没有按月分片"
    }</div>`;
  }).join("");

  structureElement.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">当前 bundle 结构说明</div>
    <div>存储模式：${escapeSettingsHtml(
      status?.storageMode || status?.bundleMode || "directory-bundle",
    )}</div>
    <div>manifest：${escapeSettingsHtml(displayManifestPath || "未知")}</div>
    <div>根目录：${escapeSettingsHtml(displayDirectory || "未知")}</div>
    ${
      pathPresentation.note
        ? `<div>说明：${escapeSettingsHtml(pathPresentation.note)}</div>`
        : ""
    }
    ${
      pathPresentation.rawPath &&
      pathPresentation.rawPath !== displayManifestPath
        ? `<div>原始 manifest 路径：${escapeSettingsHtml(pathPresentation.rawPath)}</div>`
        : ""
    }
    ${
      pathPresentation.rawDirectory &&
      pathPresentation.rawDirectory !== displayDirectory
        ? `<div>原始根目录：${escapeSettingsHtml(pathPresentation.rawDirectory)}</div>`
        : ""
    }
    <div>固定文件：<strong>core.json</strong> 保存项目、待办、打卡项、年度目标、日记分类；<strong>plans-recurring.json</strong> 保存重复计划。</div>
    <div>按月分片：records / diaryEntries / dailyCheckins / checkins / plans（一次性计划）。</div>
    <div style="margin-top: 6px;">${sectionSummaries}</div>
  `;

  const backups = Array.isArray(manifest?.legacyBackups)
    ? manifest.legacyBackups.slice(-6).reverse()
    : [];
  if (!backups.length) {
    backupElement.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px;">最近备份/迁移记录</div>
      <div>当前还没有旧单文件迁移或旧单文件导入备份记录。</div>
    `;
    return;
  }

  backupElement.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">最近备份/迁移记录</div>
    ${backups
      .map((item) => {
        const fileName = String(item?.file || "").trim() || "未命名文件";
        const source = formatBundleBackupSource(item?.source);
        const createdAt = String(item?.createdAt || "").trim() || "未知时间";
        return `<div style="margin-bottom: 8px;">
          <div><strong>${escapeSettingsHtml(fileName)}</strong></div>
          <div>来源：${escapeSettingsHtml(source)}</div>
          <div>时间：${escapeSettingsHtml(createdAt)}</div>
        </div>`;
      })
      .join("")}
  `;
}

function readAutoBackupSettingsFromForm() {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  const intervalValue = Math.max(
    1,
    Math.floor(Number(intervalValueInput?.value || 1) || 1),
  );
  const intervalUnit = ["hour", "day", "week"].includes(
    String(intervalUnitSelect?.value || "").trim(),
  )
    ? String(intervalUnitSelect.value).trim()
    : "day";
  const maxBackups = Math.max(
    1,
    Math.floor(Number(maxBackupsInput?.value || 7) || 7),
  );
  return {
    enabled: !!enabledInput?.checked,
    intervalValue,
    intervalUnit,
    maxBackups,
  };
}

function normalizeAutoBackupStatus(status = null, fallback = null) {
  const source =
    status && typeof status === "object" && !Array.isArray(status) ? status : {};
  const base =
    fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : {};
  const intervalUnitCandidate = String(
    source.intervalUnit || base.intervalUnit || "day",
  ).trim();
  const normalizeOptionalText = (value, defaultValue = null) => {
    if (typeof value !== "string") {
      return defaultValue;
    }
    const trimmed = value.trim();
    return trimmed || defaultValue;
  };

  return {
    enabled:
      source.enabled === undefined ? base.enabled === true : source.enabled === true,
    intervalValue: Math.max(
      1,
      Math.floor(Number(source.intervalValue ?? base.intervalValue ?? 1) || 1),
    ),
    intervalUnit: ["hour", "day", "week"].includes(intervalUnitCandidate)
      ? intervalUnitCandidate
      : "day",
    maxBackups: Math.max(
      1,
      Math.floor(Number(source.maxBackups ?? base.maxBackups ?? 7) || 7),
    ),
    backupDirectory: normalizeOptionalText(
      source.backupDirectory ?? base.backupDirectory,
      "",
    ),
    backupDirectoryKind: normalizeOptionalText(
      source.backupDirectoryKind ?? base.backupDirectoryKind,
      "file-path",
    ),
    backupCount: Math.max(
      0,
      Math.floor(Number(source.backupCount ?? base.backupCount ?? 0) || 0),
    ),
    latestBackupFile: normalizeOptionalText(
      source.latestBackupFile ?? base.latestBackupFile,
    ),
    latestBackupPath: normalizeOptionalText(
      source.latestBackupPath ?? base.latestBackupPath,
    ),
    latestBackupAt: normalizeOptionalText(
      source.latestBackupAt ?? base.latestBackupAt,
    ),
    latestBackupSize: Math.max(
      0,
      Number(source.latestBackupSize ?? base.latestBackupSize ?? 0) || 0,
    ),
    lastAttemptAt: normalizeOptionalText(
      source.lastAttemptAt ?? base.lastAttemptAt,
    ),
    lastError: normalizeOptionalText(source.lastError ?? base.lastError, ""),
    lastBackedUpFingerprint: normalizeOptionalText(
      source.lastBackedUpFingerprint ?? base.lastBackedUpFingerprint,
      "",
    ),
  };
}

function readCachedAutoBackupStatus() {
  if (autoBackupCachedStatus) {
    return autoBackupCachedStatus;
  }

  try {
    const rawValue = localStorage.getItem(AUTO_BACKUP_STATUS_CACHE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      autoBackupCachedStatus = normalizeAutoBackupStatus(parsed);
      return autoBackupCachedStatus;
    }
  } catch (error) {
    console.error("读取自动备份缓存失败:", error);
  }

  return null;
}

function writeCachedAutoBackupStatus(status = null) {
  const normalized = normalizeAutoBackupStatus(status, readCachedAutoBackupStatus());
  autoBackupCachedStatus = normalized;
  try {
    localStorage.setItem(
      AUTO_BACKUP_STATUS_CACHE_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    console.error("写入自动备份缓存失败:", error);
  }
  return normalized;
}

function applyAutoBackupSettingsToForm(status = null) {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  if (enabledInput instanceof HTMLInputElement) {
    enabledInput.checked = status?.enabled === true;
  }
  if (intervalValueInput instanceof HTMLInputElement) {
    intervalValueInput.value = String(
      Math.max(1, Math.floor(Number(status?.intervalValue || 1) || 1)),
    );
  }
  if (intervalUnitSelect instanceof HTMLSelectElement) {
    intervalUnitSelect.value = ["hour", "day", "week"].includes(
      String(status?.intervalUnit || "").trim(),
    )
      ? String(status.intervalUnit).trim()
      : "day";
  }
  if (maxBackupsInput instanceof HTMLInputElement) {
    maxBackupsInput.value = String(
      Math.max(1, Math.floor(Number(status?.maxBackups || 7) || 7)),
    );
  }
}

function updateAutoBackupActionsAlignment() {
  const container = document.querySelector(".settings-auto-backup-actions");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const actionButtons = Array.from(
    container.querySelectorAll(".settings-auto-backup-action"),
  ).filter((button) => button instanceof HTMLElement);
  const visibleButtons = actionButtons.filter((button) => {
    if (button.hidden) {
      return false;
    }
    return window.getComputedStyle(button).display !== "none";
  });

  container.dataset.visibleActions = String(visibleButtons.length);
  actionButtons.forEach((button) => {
    button.style.gridColumn = "";
  });

  if (window.innerWidth > 760 && visibleButtons.length === 2) {
    visibleButtons[0].style.gridColumn = "2";
    visibleButtons[1].style.gridColumn = "3";
  }
}

function renderAutoBackupPanelStatus(status = null, options = {}) {
  const panel = document.getElementById("auto-backup-status-panel");
  const shareButton = document.getElementById("share-latest-auto-backup");
  if (!(panel instanceof HTMLElement)) {
    return null;
  }

  if (shareButton instanceof HTMLElement) {
    shareButton.style.display = window.ControlerStorage?.isNativeApp ? "" : "none";
  }
  updateAutoBackupActionsAlignment();

  if (!status) {
    panel.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px;">自动备份状态</div>
      <div>当前环境暂不支持自动本地 ZIP 备份。</div>
    `;
    return null;
  }

  const nextStatus = normalizeAutoBackupStatus(status, readCachedAutoBackupStatus());
  applyAutoBackupSettingsToForm(nextStatus);

  const intervalLabel = `${Math.max(
    1,
    Math.floor(Number(nextStatus.intervalValue || 1) || 1),
  )} ${formatAutoBackupUnitLabel(nextStatus.intervalUnit)}`;
  const latestBackupText = nextStatus.latestBackupFile
    ? `${nextStatus.latestBackupFile} · ${formatAutoBackupSize(
        nextStatus.latestBackupSize,
      )} · ${formatSettingsDateTime(nextStatus.latestBackupAt)}`
    : "暂无自动备份 ZIP";
  const errorText =
    typeof nextStatus.lastError === "string" && nextStatus.lastError.trim()
      ? nextStatus.lastError.trim()
      : "最近执行正常";
  const statusNote =
    typeof options.statusNote === "string" && options.statusNote.trim()
      ? options.statusNote.trim()
      : "";
  const autoBackupWrappedTextStyle = "word-break: break-all; overflow-wrap: anywhere;";
  panel.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">自动备份状态</div>
    <div>当前状态：${nextStatus.enabled ? "已启用" : "未启用"}</div>
    <div>备份周期：每 ${escapeSettingsHtml(intervalLabel)}</div>
    <div>保留份数：${escapeSettingsHtml(nextStatus.maxBackups || 1)}</div>
    <div>备份目录：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      nextStatus.backupDirectory || "未知",
    )}</span></div>
    <div>目录类型：${escapeSettingsHtml(
      nextStatus.backupDirectoryKind || "file-path",
    )}</div>
    <div>现有备份：${escapeSettingsHtml(nextStatus.backupCount || 0)} 份</div>
    <div>最近备份：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      latestBackupText,
    )}</span></div>
    <div>最近尝试：${escapeSettingsHtml(
      formatSettingsDateTime(nextStatus.lastAttemptAt),
    )}</div>
    <div>最近结果：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      errorText,
    )}</span></div>
    ${
      statusNote
        ? `<div style="margin-top: 8px; color: var(--muted-text-color);">${escapeSettingsHtml(
            statusNote,
          )}</div>`
        : ""
    }
  `;
  return nextStatus;
}

async function refreshAutoBackupPanel(status = null) {
  const cachedStatus = readCachedAutoBackupStatus();
  const canLoadStatus = supportsAutoBackupStatusApi();
  if (!status && cachedStatus && canLoadStatus) {
    renderAutoBackupPanelStatus(cachedStatus, {
      statusNote: "已载入上次保存的设置，正在同步最新状态...",
    });
  }

  let nextStatus =
    status && typeof status === "object" && !Array.isArray(status) ? status : null;
  if (!nextStatus) {
    try {
      nextStatus = await getAutoBackupStatusSnapshot();
    } catch (error) {
      console.error("读取自动备份状态失败:", error);
      nextStatus = null;
    }
  }

  if (!nextStatus) {
    if (!canLoadStatus) {
      return renderAutoBackupPanelStatus(null);
    }
    if (cachedStatus) {
      return cachedStatus;
    }
    return renderAutoBackupPanelStatus(null);
  }

  const normalizedStatus = writeCachedAutoBackupStatus(nextStatus);
  renderAutoBackupPanelStatus(normalizedStatus);
  return normalizedStatus;
}

async function commitAutoBackupSettingsSave(saveVersion) {
  if (typeof window.ControlerStorage?.updateAutoBackupSettings !== "function") {
    await showSettingsAlert("当前环境暂不支持保存自动备份设置。", {
      title: "自动备份",
      danger: true,
    });
    return null;
  }

  if (saveVersion !== autoBackupSaveVersion) {
    return null;
  }

  const fallbackStatus = readCachedAutoBackupStatus();
  const settings = readAutoBackupSettingsFromForm();
  const optimisticStatus = normalizeAutoBackupStatus(settings, fallbackStatus);
  renderAutoBackupPanelStatus(optimisticStatus);

  try {
    const result = await runWithSettingsBusyState(
      {
        title: "正在保存设置",
        message: "正在保存自动备份设置，请稍候。保存完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        const response = await window.ControlerStorage.updateAutoBackupSettings(
          settings,
        );
        if (!response || typeof response !== "object") {
          throw new Error("自动备份设置保存失败，请重试。");
        }
        return response;
      },
    );

    if (saveVersion !== autoBackupSaveVersion) {
      return null;
    }

    const normalizedStatus = writeCachedAutoBackupStatus(result);
    renderAutoBackupPanelStatus(normalizedStatus, {
      statusNote: "设置已保存，正在同步最新备份状态...",
    });
    window.setTimeout(() => {
      void refreshAutoBackupPanel();
    }, 0);
    return normalizedStatus;
  } catch (error) {
    console.error("保存自动备份设置失败:", error);
    const cachedStatus = readCachedAutoBackupStatus();
    if (cachedStatus) {
      renderAutoBackupPanelStatus(cachedStatus);
      applyAutoBackupSettingsToForm(cachedStatus);
    }
    await showSettingsAlert(
      error instanceof Error && error.message
        ? error.message
        : "保存自动备份设置失败，请重试。",
      {
        title: "自动备份",
        danger: true,
      },
    );
    return null;
  }
}

function scheduleAutoBackupSettingsSave(options = {}) {
  const { immediate = false } = options;
  window.clearTimeout(autoBackupSaveTimer);
  const saveVersion = ++autoBackupSaveVersion;
  autoBackupSaveTimer = window.setTimeout(() => {
    autoBackupSaveTimer = 0;
    void commitAutoBackupSettingsSave(saveVersion);
  }, immediate ? 0 : 260);
}

function bindAutoBackupAutoSaveInputs() {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  const immediateSave = () => {
    applyAutoBackupSettingsToForm(readAutoBackupSettingsFromForm());
    scheduleAutoBackupSettingsSave({
      immediate: true,
    });
  };
  const deferredSave = () => {
    scheduleAutoBackupSettingsSave();
  };

  enabledInput?.addEventListener("change", immediateSave);
  intervalUnitSelect?.addEventListener("change", immediateSave);
  intervalValueInput?.addEventListener("input", deferredSave);
  intervalValueInput?.addEventListener("change", immediateSave);
  maxBackupsInput?.addEventListener("input", deferredSave);
  maxBackupsInput?.addEventListener("change", immediateSave);
}

function getSettingsBackupOverlay() {
  return document.getElementById("settings-backup-overlay");
}

function getSettingsLoadingOverlayController() {
  if (settingsLoadingOverlayController) {
    return settingsLoadingOverlayController;
  }
  const overlay = getSettingsBackupOverlay();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  settingsLoadingOverlayController = window.ControlerUI?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".settings-main",
  }) || null;
  return settingsLoadingOverlayController;
}

function syncSettingsNativeBusyLock(active) {
  const nextActive = !!active;
  if (settingsNativeBusyLockActive === nextActive) {
    return;
  }
  settingsNativeBusyLockActive = nextActive;
  window.ControlerNativeBridge?.emitEvent?.("ui.busy-state", {
    href: window.location.href,
    isBusy: nextActive,
  });
}

function setSettingsBusyState(options = {}) {
  const overlay = getSettingsBackupOverlay();
  const runAutoBackupNowBtn = document.getElementById("run-auto-backup-now");
  const {
    active = false,
    lockNativeExit = true,
    title = "正在处理中",
    message = "正在准备当前操作，请稍候。完成前请不要离开当前页面。",
  } = options;
  const titleNode = overlay?.querySelector?.("[data-loading-title]");
  const messageNode = overlay?.querySelector?.("[data-loading-message]");

  document.body.classList.toggle("settings-backup-busy", !!active);

  if (runAutoBackupNowBtn) {
    runAutoBackupNowBtn.disabled = !!active;
    runAutoBackupNowBtn.setAttribute("aria-busy", active ? "true" : "false");
  }

  syncSettingsNativeBusyLock(active && lockNativeExit);

  if (!overlay) {
    return;
  }

  const loadingController = getSettingsLoadingOverlayController();
  if (loadingController) {
    loadingController.setState({
      active,
      mode: "fullscreen",
      title,
      message,
    });
  } else {
    overlay.hidden = !active;
    overlay.setAttribute("aria-hidden", active ? "false" : "true");
    if (titleNode) {
      titleNode.textContent = title;
    }
    if (messageNode) {
      messageNode.textContent = message;
    }
  }

  if (active) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    overlay.focus();
  }
}

function setSettingsBackupBusyState(isBusy) {
  setSettingsBusyState({
    active: !!isBusy,
    title: "正在备份中",
    message: "正在整理并写入备份文件，请稍候。备份完成前请不要离开当前页面。",
  });
}

async function runWithSettingsBusyState(busyOptions = {}, action) {
  const { delayMs = 0, ...resolvedBusyOptions } =
    busyOptions && typeof busyOptions === "object" ? busyOptions : {};
  window.clearTimeout(settingsBusyOverlayTimer);
  if (delayMs > 0) {
    settingsBusyOverlayTimer = window.setTimeout(() => {
      settingsBusyOverlayTimer = 0;
      setSettingsBusyState({
        active: true,
        ...resolvedBusyOptions,
      });
    }, delayMs);
  } else {
    setSettingsBusyState({
      active: true,
      ...resolvedBusyOptions,
    });
  }
  try {
    return await action();
  } finally {
    window.clearTimeout(settingsBusyOverlayTimer);
    settingsBusyOverlayTimer = 0;
    setSettingsBusyState({
      active: false,
    });
  }
}

async function runAutoBackupNowFromPanel() {
  if (typeof window.ControlerStorage?.runAutoBackupNow !== "function") {
    await showSettingsAlert("当前环境暂不支持立即执行自动备份。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }

  let message = "自动备份已完成。";
  let danger = false;

  setSettingsBackupBusyState(true);
  try {
    const result = await window.ControlerStorage.runAutoBackupNow();
    await refreshAutoBackupPanel(result);
    if (typeof result?.lastError === "string" && result.lastError.trim()) {
      message = `自动备份失败：${result.lastError.trim()}`;
      danger = true;
    }
  } catch (error) {
    console.error("立即执行自动备份失败:", error);
    const errorText =
      error instanceof Error ? error.message : String(error || "未知错误");
    message = `自动备份失败：${errorText}`;
    danger = true;
  } finally {
    setSettingsBackupBusyState(false);
  }

  await showSettingsAlert(message, {
    title: "自动备份",
    danger,
  });
}

async function openAutoBackupLocationFromPanel() {
  const status = await getAutoBackupStatusSnapshot();
  const backupDirectory =
    typeof status?.backupDirectory === "string"
      ? status.backupDirectory.trim()
      : "";
  if (!backupDirectory) {
    await showSettingsAlert("当前还没有可显示的备份目录。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  if (window.electronAPI?.isElectron && typeof window.electronAPI.shellOpenPath === "function") {
    const opened = await window.electronAPI.shellOpenPath(backupDirectory);
    if (opened) {
      await showSettingsAlert(`已打开备份目录：\n${backupDirectory}`, {
        title: "自动备份",
      });
      return;
    }
  }
  await showSettingsAlert(`当前备份目录：\n${backupDirectory}`, {
    title: "自动备份",
  });
}

async function shareLatestAutoBackupFromPanel() {
  if (typeof window.ControlerStorage?.shareLatestBackup !== "function") {
    await showSettingsAlert("当前环境暂不支持分享最新备份。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  const result = await window.ControlerStorage.shareLatestBackup();
  await refreshAutoBackupPanel();
  if (result?.ok === false) {
    await showSettingsAlert(result?.message || "分享最新备份失败。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  await showSettingsAlert(result?.message || "已打开最新备份的分享面板。", {
    title: "自动备份",
  });
}

async function showSettingsAlert(message, options = {}) {
  if (window.ControlerUI?.alertDialog) {
    await window.ControlerUI.alertDialog({
      title: localizeSettingsUiText(options.title || "提示"),
      message: localizeSettingsUiText(message),
      confirmText: localizeSettingsUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }
  alert(localizeSettingsUiText(message));
}

async function requestSettingsConfirmation(message, options = {}) {
  if (window.ControlerUI?.confirmDialog) {
    return window.ControlerUI.confirmDialog({
      title: localizeSettingsUiText(options.title || "请确认操作"),
      message: localizeSettingsUiText(message),
      confirmText: localizeSettingsUiText(options.confirmText || "确定"),
      cancelText: localizeSettingsUiText(options.cancelText || "取消"),
      danger: !!options.danger,
    });
  }
  return confirm(localizeSettingsUiText(message));
}

const SETTINGS_PARTITION_SECTION_OPTIONS = [
  { value: "records", label: "记录" },
  { value: "diaryEntries", label: "日记" },
  { value: "dailyCheckins", label: "每日打卡" },
  { value: "checkins", label: "打卡历史" },
  { value: "plans", label: "一次性计划" },
];

function getSettingsStorageBundle() {
  return window.ControlerStorageBundle || null;
}

function getExternalImportHelper() {
  return window.ControlerExternalImport || null;
}

async function getCurrentProjectsForImport() {
  try {
    if (typeof window.ControlerStorage?.getCoreState === "function") {
      const coreState = await window.ControlerStorage.getCoreState();
      if (Array.isArray(coreState?.projects)) {
        return coreState.projects;
      }
    }
  } catch (error) {
    console.error("读取当前项目列表失败，回退本地缓存:", error);
  }
  try {
    return JSON.parse(localStorage.getItem("projects") || "[]");
  } catch (error) {
    return [];
  }
}

function formatImportDatesPreview(dateKeys = [], limit = 6) {
  const normalized = Array.isArray(dateKeys)
    ? dateKeys.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (!normalized.length) {
    return "无";
  }
  if (normalized.length <= limit) {
    return normalized.join("、");
  }
  return `${normalized.slice(0, limit).join("、")} 等 ${normalized.length} 天`;
}

function formatImportPeriodsPreview(periodIds = [], limit = 6) {
  const normalized = Array.isArray(periodIds)
    ? periodIds.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (!normalized.length) {
    return "无";
  }
  if (normalized.length <= limit) {
    return normalized.join("、");
  }
  return `${normalized.slice(0, limit).join("、")} 等 ${normalized.length} 个月份`;
}

function getPartitionSectionLabel(section) {
  const matched = SETTINGS_PARTITION_SECTION_OPTIONS.find(
    (item) => item.value === section,
  );
  return matched?.label || section || "分区";
}

async function getSettingsBundleManifest() {
  try {
    if (typeof window.ControlerStorage?.getManifest === "function") {
      const manifest = await window.ControlerStorage.getManifest();
      if (manifest && typeof manifest === "object") {
        return manifest;
      }
    }
  } catch (error) {
    console.error("读取 bundle manifest 失败，回退本地推导:", error);
  }

  const bundleStorage = getSettingsStorageBundle();
  if (bundleStorage?.splitLegacyState) {
    return bundleStorage.splitLegacyState(buildBackupPayload()).manifest || null;
  }
  return null;
}

function getManifestSectionPartitions(manifest, section) {
  const partitions = manifest?.sections?.[section]?.partitions;
  return Array.isArray(partitions)
    ? partitions.filter(
        (partition) =>
          partition &&
          typeof partition === "object" &&
          typeof partition.periodId === "string" &&
          partition.periodId,
      )
    : [];
}

function buildPartitionFileName(section, periodId) {
  const safeSection = String(section || "partition").trim() || "partition";
  const safePeriodId = String(periodId || "undated").trim() || "undated";
  return `order-${safeSection}-${safePeriodId}.json`;
}

function downloadJsonFile(payload, fileName) {
  const serialized = JSON.stringify(payload, null, 2);
  const dataUri =
    "data:application/json;charset=utf-8," + encodeURIComponent(serialized);
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute("download", fileName);
  linkElement.click();
}

function extractSettingsFileNameFromPath(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) {
    return "";
  }
  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] || normalizedPath;
}

function parseSettingsFileAcceptExtensions(accept = ".json,.zip") {
  return String(accept || "")
    .split(",")
    .map((item) =>
      String(item || "")
        .trim()
        .replace(/^\./, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

function buildNativeSelectedImportFile(payload = {}) {
  const filePath =
    typeof payload?.path === "string" && payload.path.trim()
      ? payload.path.trim()
      : "";
  const nativeImportUri =
    typeof payload?.uri === "string" && payload.uri.trim()
      ? payload.uri.trim()
      : "";
  const fileName = extractSettingsFileNameFromPath(
    payload?.fileName || filePath || nativeImportUri,
  );
  if (!fileName && !nativeImportUri) {
    return null;
  }
  return {
    name: fileName,
    path: filePath,
    nativeImportUri,
    contentText:
      typeof payload?.text === "string" ? payload.text : "",
  };
}

async function promptSettingsFileSelection(accept = ".json,.zip", options = {}) {
  const resolvedOptions =
    options && typeof options === "object" ? options : {};
  const {
    title = "正在导入数据",
    message = "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
  } = resolvedOptions;
  const electronApi = window.electronAPI;

  if (
    electronApi?.isElectron &&
    typeof electronApi.dialogSelectDataFile === "function"
  ) {
    const selectedPath = await electronApi.dialogSelectDataFile({
      title: resolvedOptions.fileDialogTitle || "选择要导入的数据文件",
      extensions: parseSettingsFileAcceptExtensions(accept),
    });
    if (!selectedPath) {
      return null;
    }
    setSettingsBusyState({
      active: true,
      title,
      message,
    });
    return buildNativeSelectedImportFile({
      fileName: extractSettingsFileNameFromPath(selectedPath),
      path: selectedPath,
    });
  }

  if (
    window.ControlerStorage?.isNativeApp &&
    window.ControlerStorage?.platform === "android" &&
    typeof window.ControlerStorage?.pickImportSourceFile === "function"
  ) {
    const selectedFile = await window.ControlerStorage.pickImportSourceFile({
      accept:
        parseSettingsFileAcceptExtensions(accept).every(
          (extension) => extension === "json",
        )
          ? "json"
          : "auto",
    });
    const normalizedFile = buildNativeSelectedImportFile(selectedFile);
    if (!normalizedFile) {
      return null;
    }
    setSettingsBusyState({
      active: true,
      title,
      message,
    });
    return normalizedFile;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (event) => {
      const file = event?.target?.files?.[0] || null;
      if (file) {
        setSettingsBusyState({
          active: true,
          title,
          message,
        });
      }
      resolve(file || null);
    };
    input.click();
  });
}

function readSettingsFileAsText(file) {
  const filePath =
    typeof file?.path === "string" && file.path.trim() ? file.path.trim() : "";
  if (typeof file?.contentText === "string") {
    return Promise.resolve(file.contentText);
  }
  if (
    filePath &&
    typeof window.electronAPI?.fsReadTextFile === "function"
  ) {
    return window.electronAPI.fsReadTextFile(filePath);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(typeof event?.target?.result === "string" ? event.target.result : "");
    };
    reader.onerror = () => {
      reject(reader.error || new Error("读取文件失败"));
    };
    reader.readAsText(file);
  });
}

function isPartitionEnvelopePayload(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof data.section === "string" &&
    typeof data.periodId === "string" &&
    Array.isArray(data.items)
  );
}

function buildFallbackSectionItemsForPeriod(section, periodId) {
  const bundleStorage = getSettingsStorageBundle();
  if (!bundleStorage?.getPeriodIdForSectionItem) {
    return [];
  }
  const backupPayload = buildBackupPayload();
  const sourceItems =
    section === "plans"
      ? (backupPayload.plans || []).filter(
          (item) =>
            !bundleStorage.isRecurringPlan?.(item) &&
            String(item?.repeat || "").trim().toLowerCase() === "none",
        )
      : Array.isArray(backupPayload?.[section])
        ? backupPayload[section]
        : [];
  return sourceItems.filter(
    (item) => bundleStorage.getPeriodIdForSectionItem(section, item) === periodId,
  );
}

async function buildPartitionEnvelopeForExport(section, periodId) {
  const bundleStorage = getSettingsStorageBundle();
  if (!bundleStorage?.createPartitionEnvelope) {
    throw new Error("当前环境缺少分区封装能力");
  }

  let items = [];
  if (typeof window.ControlerStorage?.loadSectionRange === "function") {
    const result = await window.ControlerStorage.loadSectionRange(section, {
      periodIds: [periodId],
    });
    items = Array.isArray(result?.items) ? result.items : [];
  } else {
    items = buildFallbackSectionItemsForPeriod(section, periodId);
  }

  return bundleStorage.createPartitionEnvelope(section, periodId, items);
}

function openSettingsFormDialog({
  title,
  description = "",
  confirmText = "确定",
  cancelText = "取消",
  width = "min(520px, calc(100vw - 28px))",
  renderBody,
  onConfirm,
}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "4300";

    modal.innerHTML = `
      <div class="modal-content themed-dialog-card ms" style="width:${width}; max-width:${width};">
        <div class="themed-dialog-title">${localizeSettingsUiText(title || "设置")}</div>
        <div class="themed-dialog-message" style="white-space:pre-wrap;">${localizeSettingsUiText(description || "")}</div>
        <div class="settings-transfer-body" style="display:grid; gap:12px; margin-top:14px;"></div>
        <div class="settings-transfer-error" style="display:none; color:var(--delete-btn); font-size:12px; margin-top:10px;"></div>
        <div class="themed-dialog-actions" style="margin-top:18px;">
          <button type="button" class="bts settings-transfer-cancel" style="margin:0;">${localizeSettingsUiText(cancelText)}</button>
          <button type="button" class="bts settings-transfer-confirm" style="margin:0;">${localizeSettingsUiText(confirmText)}</button>
        </div>
      </div>
    `;

    const body = modal.querySelector(".settings-transfer-body");
    const errorElement = modal.querySelector(".settings-transfer-error");
    const confirmButton = modal.querySelector(".settings-transfer-confirm");
    const cancelButton = modal.querySelector(".settings-transfer-cancel");

    const cleanup = (result) => {
      document.removeEventListener("keydown", handleKeydown, true);
      window.ControlerUI?.closeModal?.(modal);
      resolve(result);
    };

    const setError = (message) => {
      if (!(errorElement instanceof HTMLElement)) {
        return;
      }
      const safeMessage =
        typeof message === "string" && message.trim() ? message.trim() : "";
      errorElement.textContent = safeMessage;
      errorElement.style.display = safeMessage ? "block" : "none";
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(null);
      }
    };

    if (typeof renderBody === "function" && body instanceof HTMLElement) {
      renderBody({
        modal,
        body,
        setError,
      });
    }

    confirmButton?.addEventListener("click", async (event) => {
      event.preventDefault();
      setError("");
      try {
        const result =
          typeof onConfirm === "function"
            ? await onConfirm({
                modal,
                body,
                setError,
              })
            : true;
        if (result === false) {
          return;
        }
        cleanup(result ?? true);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error || "操作失败"));
      }
    });

    cancelButton?.addEventListener("click", (event) => {
      event.preventDefault();
      cleanup(null);
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cleanup(null);
      }
    });

    document.body.appendChild(modal);
    window.ControlerUI?.stopModalContentPropagation?.(modal);
    if (window.ControlerUI?.enhanceNativeSelect) {
      modal.querySelectorAll("select").forEach((select) => {
        if (!(select instanceof HTMLSelectElement)) {
          return;
        }
        window.ControlerUI.enhanceNativeSelect(select, {
          fullWidth: true,
          minWidth: 240,
          preferredMenuWidth: 320,
          maxMenuWidth: 360,
        });
      });
    }
    document.addEventListener("keydown", handleKeydown, true);
    setTimeout(() => {
      confirmButton?.focus?.();
    }, 0);
  });
}

function createSettingsSelectField({
  label,
  value,
  options = [],
}) {
  const wrapper = document.createElement("label");
  wrapper.style.display = "grid";
  wrapper.style.gap = "8px";
  wrapper.style.color = "var(--text-color)";

  const title = document.createElement("span");
  title.textContent = localizeSettingsUiText(label);
  title.style.fontSize = "13px";
  title.style.color = "var(--muted-text-color)";

  const select = document.createElement("select");
  select.className = "bts";
  select.style.margin = "0";
  select.style.width = "100%";
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = localizeSettingsUiText(option.label);
    select.appendChild(optionElement);
  });
  if (value !== undefined) {
    select.value = value;
  }

  wrapper.appendChild(title);
  wrapper.appendChild(select);
  return {
    wrapper,
    select,
  };
}

async function showExportOptionsDialog(manifest) {
  const supportsBundleExport =
    typeof window.ControlerStorage?.exportBundle === "function";
  const availableSections = SETTINGS_PARTITION_SECTION_OPTIONS.filter(
    (section) => getManifestSectionPartitions(manifest, section.value).length > 0,
  );
  const defaultSection = availableSections[0]?.value || "records";

  return openSettingsFormDialog({
    title: "导出数据",
    description:
      "全部分片 ZIP 会打包 bundle-manifest.json、core.json、plans-recurring.json 和全部月分片。单分区 JSON 只适用于 records / diaryEntries / dailyCheckins / checkins / plans（一次性）。",
    confirmText: "开始导出",
    renderBody({ body }) {
      const exportTypeField = createSettingsSelectField({
        label: "导出类型",
        value: "full",
        options: [
          {
            value: "full",
            label: supportsBundleExport ? "全部分片 ZIP" : "整包 JSON 兼容备份",
          },
          ...(availableSections.length
            ? [{ value: "partition", label: "单分区 JSON" }]
            : []),
        ],
      });
      const sectionField = createSettingsSelectField({
        label: "数据分区",
        value: defaultSection,
        options: availableSections.map((section) => ({
          value: section.value,
          label: getPartitionSectionLabel(section.value),
        })),
      });
      const periodField = createSettingsSelectField({
        label: "月份分区",
        value: getManifestSectionPartitions(manifest, defaultSection)[0]?.periodId || "",
        options: getManifestSectionPartitions(manifest, defaultSection).map((partition) => ({
          value: partition.periodId,
          label: `${partition.periodId} (${partition.count || 0} 条)`,
        })),
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

      const refreshPartitionFields = () => {
        const exportType = exportTypeField.select.value;
        const activeSection = sectionField.select.value;
        const partitions = getManifestSectionPartitions(manifest, activeSection);
        sectionField.wrapper.style.display =
          exportType === "partition" ? "grid" : "none";
        periodField.wrapper.style.display =
          exportType === "partition" ? "grid" : "none";
        periodField.select.innerHTML = "";
        partitions.forEach((partition) => {
          const option = document.createElement("option");
          option.value = partition.periodId;
          option.textContent = `${partition.periodId} (${partition.count || 0} 条)`;
          periodField.select.appendChild(option);
        });
        if (window.ControlerUI?.refreshEnhancedSelect) {
          window.ControlerUI.refreshEnhancedSelect(periodField.select);
        }
        noteElement.textContent =
          exportType === "partition"
            ? availableSections.length
              ? `当前可导出的单分区 section：${availableSections
                  .map((section) => getPartitionSectionLabel(section.value))
                  .join("、")}。如果现在只看到“记录”，表示当前只有记录生成了月分片；项目、待办、打卡项、年度目标、日记分类和重复计划只随整包 ZIP 导出。`
              : "当前还没有任何月分片，因此这里只能导出全部分片 ZIP。"
            : "整包 ZIP 会一起带走 core、重复计划和所有月份分片，适合完整备份、换设备恢复。";
      };

      exportTypeField.select.addEventListener("change", refreshPartitionFields);
      sectionField.select.addEventListener("change", refreshPartitionFields);
      body.appendChild(exportTypeField.wrapper);
      body.appendChild(sectionField.wrapper);
      body.appendChild(periodField.wrapper);
      body.appendChild(noteElement);
      refreshPartitionFields();
    },
    onConfirm({ body, setError }) {
      const selects = body.querySelectorAll("select");
      const exportType = selects[0]?.value || "full";
      const section = selects[1]?.value || "";
      const periodId = selects[2]?.value || "";
      if (exportType === "partition" && (!section || !periodId)) {
        setError("请选择要导出的分区和月份。");
        return false;
      }
      return {
        exportType,
        section,
        periodId,
      };
    },
  });
}

async function inspectImportFile(file) {
  const externalImportHelper = getExternalImportHelper();
  const fileName = String(file?.name || file?.fileName || "").trim();
  const normalizedFileName = fileName.toLowerCase();
  const filePath =
    typeof file?.path === "string" && file.path.trim() ? file.path.trim() : "";
  const nativeImportUri =
    typeof file?.nativeImportUri === "string" && file.nativeImportUri.trim()
      ? file.nativeImportUri.trim()
      : "";
  if (!fileName) {
    throw new Error("无法识别导入文件名。");
  }
  if (
    nativeImportUri &&
    typeof window.ControlerStorage?.inspectImportSourceFile === "function"
  ) {
    const inspected = await window.ControlerStorage.inspectImportSourceFile({
      uri: nativeImportUri,
      fileName,
    });
    if (inspected && typeof inspected === "object") {
      return {
        ...inspected,
        fileName:
          typeof inspected.fileName === "string" && inspected.fileName.trim()
            ? inspected.fileName.trim()
            : fileName,
        filePath,
        nativeImportUri,
      };
    }
    throw new Error("无法检查所选导入文件。");
  }
  if (normalizedFileName.endsWith(".zip")) {
    return {
      sourceKind: "full",
      fileType: "zip-bundle",
      fileName,
      filePath,
      nativeImportUri,
      description: "已识别为全部分片 ZIP。你可以整包替换当前数据，也可以做差异导入。",
    };
  }

  const fileText = await readSettingsFileAsText(file);
  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(fileText);
  } catch (error) {
    throw new Error("所选 JSON 无法解析，请确认文件完整且格式正确。");
  }

  if (isPartitionEnvelopePayload(parsedPayload)) {
    return {
      sourceKind: "partition",
      fileType: "partition-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      section: parsedPayload.section,
      periodId: parsedPayload.periodId,
      description: `已识别为单分区 JSON，只会影响 ${getPartitionSectionLabel(
        parsedPayload.section,
      )} 的 ${parsedPayload.periodId}。`,
    };
  }

  if (
    parsedPayload &&
    typeof parsedPayload === "object" &&
    !Array.isArray(parsedPayload) &&
    Array.isArray(parsedPayload.projects) &&
    Array.isArray(parsedPayload.records)
  ) {
    return {
      sourceKind: "full",
      fileType: "legacy-full-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      description:
        "已识别为旧单文件全量 JSON。导入时会先拆成目录 bundle，再按你选择的模式写入当前数据。",
    };
  }

  const arrayCandidates =
    typeof externalImportHelper?.listArrayCandidates === "function"
      ? externalImportHelper.listArrayCandidates(parsedPayload)
      : [];
  if (arrayCandidates.length) {
    return {
      sourceKind: "external-json",
      fileType: "external-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      arrayCandidates,
      description:
        "已识别为外部 JSON。可从根数组或首层对象数组里选择记录源，并映射项目名、时间和用时字段。",
    };
  }

  throw new Error(
    "无法识别该文件类型。当前只支持旧单文件 JSON、全部分片 ZIP、单分区 JSON，或包含根数组/首层对象数组的外部 JSON。",
  );
}

function buildExternalImportPreview(
  descriptor,
  externalConfig = {},
  currentProjects = [],
) {
  const externalImportHelper = getExternalImportHelper();
  if (
    !externalImportHelper?.normalizeExternalRecords ||
    !externalImportHelper?.reconcileProjectsByName
  ) {
    throw new Error("当前环境缺少外部 JSON 导入能力。");
  }
  const normalized = externalImportHelper.normalizeExternalRecords(
    descriptor?.parsedPayload,
    externalConfig,
  );
  const projectReconciliation = externalImportHelper.reconcileProjectsByName(
    currentProjects,
    normalized.projectNames.map((name) => ({ name })),
  );
  const mappedRecords = externalImportHelper.applyProjectMappingToRecords(
    normalized.records,
    projectReconciliation,
  );
  return {
    ...normalized,
    records: mappedRecords,
    projectReconciliation,
    matchedProjects: projectReconciliation.matchedProjects,
    createdProjects: projectReconciliation.createdProjects,
    replacedDays: normalized.affectedDates.length,
  };
}

async function showExternalImportOptionsDialog(descriptor) {
  const externalImportHelper = getExternalImportHelper();
  if (
    !externalImportHelper?.listObjectFieldKeys ||
    !externalImportHelper?.resolveArraySource
  ) {
    throw new Error("当前环境缺少外部 JSON 映射能力。");
  }

  const currentProjects = await getCurrentProjectsForImport();
  const arrayCandidates = Array.isArray(descriptor?.arrayCandidates)
    ? descriptor.arrayCandidates
    : [];
  const defaultArrayPath =
    arrayCandidates[0]?.path || externalImportHelper.ROOT_ARRAY_PATH || "$";
  const nativePreviewEnabled =
    !!descriptor?.nativeImportUri &&
    typeof window.ControlerStorage?.previewExternalImport === "function" &&
    !descriptor?.parsedPayload;
  const fieldKeysByPath =
    descriptor?.fieldKeysByPath && typeof descriptor.fieldKeysByPath === "object"
      ? descriptor.fieldKeysByPath
      : {};
  const guessedMappingByPath =
    descriptor?.guessedMappingByPath &&
    typeof descriptor.guessedMappingByPath === "object"
      ? descriptor.guessedMappingByPath
      : {};
  let latestPreview = null;
  let latestPreviewToken = 0;

  return openSettingsFormDialog({
    title: "外部 JSON 导入",
    description: `文件：${descriptor?.fileName || "未知文件"}\n请选择记录数组来源，并映射项目名、时间和用时字段。导入会按“日期”替换当天旧记录，其它日期保持不变。`,
    confirmText: "开始导入",
    width: "min(760px, calc(100vw - 32px))",
    renderBody({ body, setError }) {
      const arrayField = createSettingsSelectField({
        label: "记录数组来源",
        value: defaultArrayPath,
        options: arrayCandidates.map((candidate) => ({
          value: candidate.path,
          label: `${candidate.label} (${candidate.count || 0} 条)`,
        })),
      });
      const mappingFields = {
        projectName: createSettingsSelectField({
          label: "项目名字段",
          value: "",
          options: [{ value: "", label: "请选择字段" }],
        }),
        date: createSettingsSelectField({
          label: "日期字段",
          value: "",
          options: [{ value: "", label: "未单独提供日期" }],
        }),
        startTime: createSettingsSelectField({
          label: "开始时间字段",
          value: "",
          options: [{ value: "", label: "请选择字段" }],
        }),
        endTime: createSettingsSelectField({
          label: "结束时间字段",
          value: "",
          options: [{ value: "", label: "未提供，改用时长推导" }],
        }),
        durationMs: createSettingsSelectField({
          label: "时长毫秒字段",
          value: "",
          options: [{ value: "", label: "未提供毫秒时长" }],
        }),
        spendtime: createSettingsSelectField({
          label: "用时文本字段",
          value: "",
          options: [{ value: "", label: "未提供用时文本" }],
        }),
      };
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";
      const previewCard = document.createElement("div");
      previewCard.className = "ms";
      previewCard.style.padding = "14px";
      previewCard.style.borderRadius = "12px";
      previewCard.style.border = "1px solid var(--panel-border-color)";
      previewCard.style.background = "var(--panel-bg-color)";
      previewCard.style.color = "var(--text-color)";

      const buildFieldOptions = (fieldKeys, placeholder) => [
        { value: "", label: placeholder },
        ...fieldKeys.map((fieldKey) => ({
          value: fieldKey,
          label: fieldKey,
        })),
      ];

      const updateSelectOptions = (field, options, nextValue = "") => {
        field.select.innerHTML = "";
        options.forEach((option) => {
          const optionElement = document.createElement("option");
          optionElement.value = option.value;
          optionElement.textContent = option.label;
          field.select.appendChild(optionElement);
        });
        field.select.value = nextValue && options.some((option) => option.value === nextValue)
          ? nextValue
          : options[0]?.value || "";
        if (window.ControlerUI?.refreshEnhancedSelect) {
          window.ControlerUI.refreshEnhancedSelect(field.select);
        }
      };

      const getCurrentConfig = () => ({
        arrayPath:
          arrayField.select.value ||
          externalImportHelper.ROOT_ARRAY_PATH ||
          "$",
        mapping: {
          projectName: mappingFields.projectName.select.value || "",
          date: mappingFields.date.select.value || "",
          startTime: mappingFields.startTime.select.value || "",
          endTime: mappingFields.endTime.select.value || "",
          durationMs: mappingFields.durationMs.select.value || "",
          spendtime: mappingFields.spendtime.select.value || "",
        },
      });

      const resolveFieldKeysForPath = (arrayPath) => {
        if (nativePreviewEnabled) {
          const nativeFieldKeys = fieldKeysByPath?.[arrayPath];
          return Array.isArray(nativeFieldKeys) ? nativeFieldKeys : [];
        }
        const items = externalImportHelper.resolveArraySource(
          descriptor?.parsedPayload,
          arrayPath,
        );
        return externalImportHelper.listObjectFieldKeys(items);
      };

      const resolveGuessedMappingForPath = (arrayPath, fieldKeys) => {
        const nativeGuess =
          guessedMappingByPath?.[arrayPath] &&
          typeof guessedMappingByPath[arrayPath] === "object"
            ? guessedMappingByPath[arrayPath]
            : null;
        return nativeGuess || externalImportHelper.guessExternalMapping(fieldKeys);
      };

      const updateFieldChoices = () => {
        const arrayPath =
          arrayField.select.value || externalImportHelper.ROOT_ARRAY_PATH || "$";
        const fieldKeys = resolveFieldKeysForPath(arrayPath);
        const guessed = resolveGuessedMappingForPath(arrayPath, fieldKeys);
        updateSelectOptions(
          mappingFields.projectName,
          buildFieldOptions(fieldKeys, "请选择字段"),
          mappingFields.projectName.select.value || guessed.projectName,
        );
        updateSelectOptions(
          mappingFields.date,
          buildFieldOptions(fieldKeys, "未单独提供日期"),
          mappingFields.date.select.value || guessed.date,
        );
        updateSelectOptions(
          mappingFields.startTime,
          buildFieldOptions(fieldKeys, "请选择字段"),
          mappingFields.startTime.select.value || guessed.startTime,
        );
        updateSelectOptions(
          mappingFields.endTime,
          buildFieldOptions(fieldKeys, "未提供，改用时长推导"),
          mappingFields.endTime.select.value || guessed.endTime,
        );
        updateSelectOptions(
          mappingFields.durationMs,
          buildFieldOptions(fieldKeys, "未提供毫秒时长"),
          mappingFields.durationMs.select.value || guessed.durationMs,
        );
        updateSelectOptions(
          mappingFields.spendtime,
          buildFieldOptions(fieldKeys, "未提供用时文本"),
          mappingFields.spendtime.select.value || guessed.spendtime,
        );
      };

      const refreshPreview = async () => {
        const previewToken = ++latestPreviewToken;
        setError("");
        const config = getCurrentConfig();
        const hasProjectName = !!config.mapping.projectName;
        const hasStartTime = !!config.mapping.startTime;
        const hasEndTime = !!config.mapping.endTime;
        const hasDuration =
          !!config.mapping.durationMs || !!config.mapping.spendtime;
        noteElement.textContent =
          "支持的组合：开始时间 + 结束时间，或 开始时间 + 时长。日期字段可选；如果开始/结束字段本身已包含完整日期时间，可以留空。项目名字段必填。";

        if (!hasProjectName || !hasStartTime || (!hasEndTime && !hasDuration)) {
          latestPreview = null;
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="color: var(--muted-text-color); line-height:1.7;">
              先完成字段映射：项目名字段必填；开始时间字段必填；并且需要“结束时间字段”或任一“用时字段”。
            </div>
          `;
          return;
        }

        try {
          if (nativePreviewEnabled) {
            previewCard.innerHTML = `
              <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
              <div style="color: var(--muted-text-color); line-height:1.7;">
                正在根据当前字段映射分析文件，请稍候。
              </div>
            `;
            const preview = await window.ControlerStorage.previewExternalImport({
              uri: descriptor.nativeImportUri,
              externalConfig: config,
            });
            if (previewToken !== latestPreviewToken) {
              return;
            }
            latestPreview =
              preview && typeof preview === "object" ? preview : null;
          } else {
            latestPreview = buildExternalImportPreview(
              descriptor,
              config,
              currentProjects,
            );
          }
          if (!latestPreview || typeof latestPreview !== "object") {
            throw new Error("无法生成导入预览。");
          }
          const invalidReasonText = Object.keys(
            latestPreview.invalidReasons || {},
          ).length
            ? Object.entries(latestPreview.invalidReasons)
                .map(([reason, count]) => `${reason}: ${count}`)
                .join("；")
            : "无";
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="display:grid; gap:6px; line-height:1.7;">
              <div>可导入记录：<strong>${latestPreview.validCount || 0}</strong> / ${latestPreview.totalCount || 0}</div>
              <div>无效记录：<strong>${latestPreview.invalidCount || 0}</strong></div>
              <div>命中月份：${escapeSettingsHtml(formatImportPeriodsPreview(latestPreview.affectedPeriodIds || []))}</div>
              <div>命中日期：${escapeSettingsHtml(formatImportDatesPreview(latestPreview.affectedDates || []))}</div>
              <div>将并入已有项目：<strong>${latestPreview.matchedProjects || 0}</strong></div>
              <div>将新建项目：<strong>${latestPreview.createdProjects || 0}</strong></div>
              <div>将按天替换：<strong>${latestPreview.replacedDays || 0}</strong> 天</div>
              <div style="color: var(--muted-text-color);">无效原因统计：${escapeSettingsHtml(invalidReasonText)}</div>
            </div>
          `;
        } catch (error) {
          if (previewToken !== latestPreviewToken) {
            return;
          }
          latestPreview = null;
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="color: var(--delete-btn); line-height:1.7;">
              ${escapeSettingsHtml(error instanceof Error ? error.message : String(error || "无法生成预览"))}
            </div>
          `;
        }
      };

      body.appendChild(arrayField.wrapper);
      Object.values(mappingFields).forEach((field) => {
        body.appendChild(field.wrapper);
      });
      body.appendChild(noteElement);
      body.appendChild(previewCard);

      updateFieldChoices();
      void refreshPreview();
      arrayField.select.addEventListener("change", () => {
        updateFieldChoices();
        void refreshPreview();
      });
      Object.values(mappingFields).forEach((field) => {
        field.select.addEventListener("change", () => {
          void refreshPreview();
        });
      });
    },
    onConfirm({ body, setError }) {
      const config = {
        arrayPath: "",
        mapping: {},
      };
      const selects = body.querySelectorAll("select");
      config.arrayPath = selects[0]?.value || defaultArrayPath;
      config.mapping.projectName = selects[1]?.value || "";
      config.mapping.date = selects[2]?.value || "";
      config.mapping.startTime = selects[3]?.value || "";
      config.mapping.endTime = selects[4]?.value || "";
      config.mapping.durationMs = selects[5]?.value || "";
      config.mapping.spendtime = selects[6]?.value || "";

      if (!config.mapping.projectName) {
        setError("请选择项目名字段。");
        return false;
      }
      if (!config.mapping.startTime) {
        setError("请选择开始时间字段。");
        return false;
      }
      if (!config.mapping.endTime && !config.mapping.durationMs && !config.mapping.spendtime) {
        setError("请至少选择结束时间字段或一个用时字段。");
        return false;
      }
      if (!latestPreview || !latestPreview.validCount) {
        setError("当前映射下没有可导入的有效记录。");
        return false;
      }
      return {
        mode: "replace",
        sourceKind: "external-json",
        externalConfig: config,
        preview: {
          affectedPeriodIds: latestPreview.affectedPeriodIds.slice(),
          affectedDates: latestPreview.affectedDates.slice(),
          createdProjects: latestPreview.createdProjects,
          matchedProjects: latestPreview.matchedProjects,
          replacedDays: latestPreview.replacedDays,
          validCount: latestPreview.validCount,
          invalidCount: latestPreview.invalidCount,
        },
      };
    },
  });
}

async function showResolvedImportOptionsDialog(descriptor) {
  if (descriptor?.sourceKind === "external-json") {
    return showExternalImportOptionsDialog(descriptor);
  }
  const isFullImport =
    descriptor?.sourceKind === "full" ||
    descriptor?.fileType === "zip-bundle" ||
    descriptor?.fileType === "legacy-full-json";
  return openSettingsFormDialog({
    title: "导入数据",
    description: `文件：${descriptor?.fileName || "未知文件"}\n${descriptor?.description || ""}`,
    confirmText: "开始导入",
    renderBody({ body }) {
      const modeField = createSettingsSelectField({
        label: "导入模式",
        value: "replace",
        options: isFullImport
          ? [
              { value: "replace", label: "整包替换当前数据" },
              { value: "diff", label: "差异导入（只替换有差异的单位）" },
            ]
          : [
              { value: "replace", label: "替换该月份分区" },
              { value: "merge", label: "合并该月份分区（按 ID/自然键逐条覆盖）" },
            ],
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

      const refreshModeNote = () => {
        const mode = modeField.select.value;
        if (isFullImport) {
          noteElement.textContent =
            mode === "diff"
              ? "差异导入不会删除未导入内容。它的逻辑是：核心区按字段替换；重复计划和月分片只处理导入源里出现的内容，并按 ID/自然键逐条覆盖；未命中的旧条目会保留。"
              : "整包替换会直接用导入源重建当前 bundle。当前 bundle 中未出现在导入源里的内容会被清掉。";
          return;
        }
        noteElement.textContent =
          mode === "merge"
            ? "单分区合并只覆盖同 ID/自然键的条目，未命中的旧条目会保留。其它 section 和其它月份不受影响。"
            : "单分区替换只会替换一个 section 的一个月份，其它 section 和其它月份保持不变。";
      };

      body.appendChild(modeField.wrapper);
      body.appendChild(noteElement);
      modeField.select.addEventListener("change", refreshModeNote);
      refreshModeNote();
    },
    onConfirm({ body }) {
      const select = body.querySelector("select");
      return {
        mode: select?.value || "replace",
      };
    },
  });
}

async function showNativeImportOptionsDialog(options = {}) {
  return openSettingsFormDialog({
    title: "导入数据",
    description:
      "安卓端整包/单分区导入会先打开系统文件选择器。外部 JSON 导入会先在页面里选择 JSON 文件，再进入字段映射与预览。",
    confirmText: "继续",
    renderBody({ body }) {
      const importTypeField = createSettingsSelectField({
        label: "导入类型",
        value: options.jsonOnly ? "partition" : "full",
        options: options.jsonOnly
          ? [
              { value: "partition", label: "单分区 JSON 导入" },
              { value: "external", label: "外部 JSON 导入" },
            ]
          : [
              { value: "full", label: "整包导入（ZIP / 旧 JSON）" },
              { value: "partition", label: "单分区 JSON 导入" },
              { value: "external", label: "外部 JSON 导入" },
            ],
      });
      const fullModeField = createSettingsSelectField({
        label: "整包导入模式",
        value: "replace",
        options: [
          { value: "replace", label: "整包替换当前数据" },
          { value: "diff", label: "差异导入（只替换有差异的单位）" },
        ],
      });
      const partitionModeField = createSettingsSelectField({
        label: "单分区导入模式",
        value: "replace",
        options: [
          { value: "replace", label: "替换该月份分区" },
          { value: "merge", label: "合并该月份分区（按 ID/自然键逐条覆盖）" },
        ],
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

        const refreshFields = () => {
          const importType = importTypeField.select.value;
          fullModeField.wrapper.style.display = importType === "full" ? "grid" : "none";
          partitionModeField.wrapper.style.display =
            importType === "partition" ? "grid" : "none";
          noteElement.textContent =
            importType === "full"
              ? fullModeField.select.value === "diff"
                ? "差异导入不会删除未导入内容；核心区按字段替换，重复计划和月分片按 ID/自然键逐条覆盖。"
                : "整包替换会清掉当前 bundle 中未出现在导入源里的内容。"
              : importType === "partition"
                ? partitionModeField.select.value === "merge"
                  ? "单分区合并只覆盖同 ID/自然键的条目，其它内容保留。"
                  : "单分区替换只影响一个 section 的一个月份。"
                : "外部 JSON 只导入时间记录；确认后会让你选择记录数组和字段映射，并按日期替换当天旧记录。";
        };

      importTypeField.select.addEventListener("change", refreshFields);
      fullModeField.select.addEventListener("change", refreshFields);
      partitionModeField.select.addEventListener("change", refreshFields);
      body.appendChild(importTypeField.wrapper);
      body.appendChild(fullModeField.wrapper);
      body.appendChild(partitionModeField.wrapper);
      body.appendChild(noteElement);
      refreshFields();
    },
    onConfirm({ body }) {
      const selects = body.querySelectorAll("select");
      const importType = selects[0]?.value || "full";
      return {
        importType,
        mode:
          importType === "full"
            ? selects[1]?.value || "replace"
            : importType === "partition"
              ? selects[2]?.value || "replace"
              : "replace",
      };
    },
  });
}

async function refreshSettingsAfterDataImport(options = {}) {
  autoBackupCachedStatus = null;
  try {
    localStorage.removeItem(AUTO_BACKUP_STATUS_CACHE_KEY);
  } catch (error) {
    console.error("清理自动备份缓存失败:", error);
  }
  updateStorageStatus();
  updateStoragePathInfo();
  renderNavigationVisibilitySettings();
  if (options.reload !== false) {
    window.location.reload();
  }
}

async function importPartitionEnvelopePayload(parsedPayload, options = {}) {
  const bundleStorage = getSettingsStorageBundle();
  if (!isPartitionEnvelopePayload(parsedPayload)) {
    throw new Error("所选文件不是单分区 JSON。");
  }
  if (
    !bundleStorage?.validateItemsForPeriod?.(
      parsedPayload.section,
      parsedPayload.periodId,
      parsedPayload.items,
    )
  ) {
    throw new Error("分区文件中的项目与声明的月份不一致，已拒绝导入。");
  }

  if (typeof window.ControlerStorage?.saveSectionRange === "function") {
    if (
      typeof options.filePath === "string" &&
      options.filePath &&
      !!window.electronAPI?.isElectron &&
      typeof window.ControlerStorage?.importSource === "function"
    ) {
      await window.ControlerStorage.importSource({
        filePath: options.filePath,
        mode: options.mode === "merge" ? "merge" : "replace",
      });
      return;
    }

    await window.ControlerStorage.saveSectionRange(parsedPayload.section, {
      periodId: parsedPayload.periodId,
      items: parsedPayload.items,
      mode: options.mode === "merge" ? "merge" : "replace",
    });
    await flushStorageWrites();
    return;
  }

  const bundleHelper = getSettingsStorageBundle();
  if (!bundleHelper?.mergePartitionItems || !bundleHelper?.getPeriodIdForSectionItem) {
    throw new Error("当前环境不支持单分区导入。");
  }

  const section = parsedPayload.section;
  const existingItems =
    section === "plans"
      ? JSON.parse(localStorage.getItem("plans") || "[]").filter(
          (item) => String(item?.repeat || "").trim().toLowerCase() === "none",
        )
      : JSON.parse(localStorage.getItem(section) || "[]");
  const recurringPlans =
    section === "plans"
      ? JSON.parse(localStorage.getItem("plans") || "[]").filter(
          (item) => String(item?.repeat || "").trim().toLowerCase() !== "none",
        )
      : [];
  const remainingItems = existingItems.filter(
    (item) =>
      bundleHelper.getPeriodIdForSectionItem(section, item) !== parsedPayload.periodId,
  );
  const currentPartitionItems = existingItems.filter(
    (item) =>
      bundleHelper.getPeriodIdForSectionItem(section, item) === parsedPayload.periodId,
  );
  const mergedItems = bundleHelper.mergePartitionItems(
    section,
    currentPartitionItems,
    parsedPayload.items,
    options.mode === "merge" ? "merge" : "replace",
  );
  localStorage.setItem(
    section,
    JSON.stringify(
      section === "plans"
        ? [...remainingItems, ...mergedItems, ...recurringPlans]
        : [...remainingItems, ...mergedItems],
    ),
  );
  await flushStorageWrites();
}

async function exportData() {
  try {
    const exportOptions = await showExportOptionsDialog(
      await getSettingsBundleManifest(),
    );
    if (!exportOptions) {
      return;
    }

    const supportsBundleExport =
      typeof window.ControlerStorage?.exportBundle === "function";
    const exportOutcome = await runWithSettingsBusyState(
      {
        title: "正在准备导出",
        message: "正在整理导出数据并准备文件，请稍候。导出完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        if (exportOptions.exportType === "partition") {
          if (supportsBundleExport) {
            const result = await window.ControlerStorage.exportBundle({
              type: "partition",
              section: exportOptions.section,
              periodId: exportOptions.periodId,
            });
            if (!result) {
              return null;
            }
          } else {
            const envelope = await buildPartitionEnvelopeForExport(
              exportOptions.section,
              exportOptions.periodId,
            );
            const fileName = buildPartitionFileName(
              exportOptions.section,
              exportOptions.periodId,
            );

            if (
              window.ControlerStorage?.isNativeApp &&
              window.ControlerNativeBridge?.isReactNativeApp
            ) {
              const result = await window.ControlerNativeBridge.call(
                "settings.exportData",
                {
                  state: envelope,
                  fileName,
                },
              );
              if (!result?.ok) {
                throw new Error(result?.message || "导出失败");
              }
            } else {
              downloadJsonFile(envelope, fileName);
            }
          }

          return {
            title: "导出成功",
            message: "单分区 JSON 已导出。",
          };
        }

        if (supportsBundleExport) {
          const result = await window.ControlerStorage.exportBundle({
            type: "full",
          });
          if (!result) {
            return null;
          }
          return {
            title: "导出成功",
            message: "全部分片 ZIP 已导出。",
          };
        }

        const data = await buildBundleAwareBackupPayload();
        const fileName = `time-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        if (
          window.ControlerStorage?.isNativeApp &&
          window.ControlerNativeBridge?.isReactNativeApp
        ) {
          const result = await window.ControlerNativeBridge.call(
            "settings.exportData",
            {
              state: data,
              fileName,
            },
          );
          if (!result?.ok) {
            throw new Error(result?.message || "导出失败");
          }
          return {
            title: "导出成功",
            message: "已打开导出分享面板，请选择保存位置或分享应用。",
          };
        }

        downloadJsonFile(data, fileName);
        return {
          title: "导出成功",
          message: "整包 JSON 已导出。",
        };
      },
    );

    if (exportOutcome?.message) {
      await showSettingsAlert(exportOutcome.message, {
        title: exportOutcome.title || "导出成功",
      });
    }
  } catch (e) {
    console.error("导出数据失败:", e);
    await showSettingsAlert("导出数据失败，请重试。", {
      title: "导出失败",
      danger: true,
    });
  }
}

function buildImportSuccessMessage(descriptor, mode, result = null) {
  if (descriptor?.sourceKind === "external-json") {
    const preview =
      result && typeof result === "object"
        ? result
        : descriptor?.preview && typeof descriptor.preview === "object"
          ? descriptor.preview
          : {};
    const importedCount =
      Number.isFinite(preview.importedCount) && preview.importedCount >= 0
        ? preview.importedCount
        : Number.isFinite(preview.validCount) && preview.validCount >= 0
          ? preview.validCount
          : 0;
    return `外部 JSON 导入已完成。已导入 ${importedCount} 条记录，按日期替换 ${preview.replacedDays || 0} 天，新增项目 ${preview.createdProjects || 0} 个，并入已有项目 ${preview.matchedProjects || 0} 个。页面将刷新以载入最新状态。`;
  }
  if (descriptor?.sourceKind === "partition") {
    return mode === "merge"
      ? "单分区合并导入已完成。页面将刷新以载入最新状态。"
      : "单分区替换导入已完成。页面将刷新以载入最新状态。";
  }
  return mode === "diff"
    ? "差异导入已完成。未导入的内容会保留，页面将刷新以载入最新状态。"
    : "整包替换已完成。当前 bundle 已按导入源重建，页面将刷新以载入最新状态。";
}

async function importExternalJsonDescriptor(descriptor, choice = {}) {
  const externalImportHelper = getExternalImportHelper();
  const externalConfig =
    choice?.externalConfig && typeof choice.externalConfig === "object"
      ? choice.externalConfig
      : null;
  if (!externalConfig) {
    throw new Error("缺少外部 JSON 映射配置。");
  }

  if (
    !!descriptor?.nativeImportUri &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
      filePath: descriptor?.filePath || "",
      uri: descriptor.nativeImportUri,
      externalConfig,
      conflictUnit:
        externalImportHelper.DEFAULT_CONFLICT_UNIT || "day",
      projectMapping:
        externalImportHelper.DEFAULT_PROJECT_MAPPING || "name-first",
    });
  }

  const bundleHelper = getSettingsStorageBundle();
  if (
    !externalImportHelper?.mergeRecordsByReplacingDays ||
    !bundleHelper?.getPeriodIdForSectionItem
  ) {
    throw new Error("当前环境不支持外部 JSON 导入。");
  }

  const preview = buildExternalImportPreview(
    descriptor,
    externalConfig,
    await getCurrentProjectsForImport(),
  );
  if (!preview.validCount || !preview.records.length) {
    throw new Error("当前映射下没有可导入的有效记录。");
  }

  if (
    !!window.electronAPI?.isElectron &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
      filePath: descriptor?.filePath || "",
      payload: descriptor?.parsedPayload,
      externalConfig,
      conflictUnit:
        externalImportHelper.DEFAULT_CONFLICT_UNIT || "day",
      projectMapping:
        externalImportHelper.DEFAULT_PROJECT_MAPPING || "name-first",
    });
  }

  if (
    preview.createdProjects > 0 &&
    typeof window.ControlerStorage?.replaceCoreState === "function"
  ) {
    await window.ControlerStorage.replaceCoreState({
      projects: preview.projectReconciliation.projects,
    });
  } else if (preview.createdProjects > 0) {
    localStorage.setItem(
      "projects",
      JSON.stringify(preview.projectReconciliation.projects),
    );
  }

  if (
    typeof window.ControlerStorage?.loadSectionRange === "function" &&
    typeof window.ControlerStorage?.saveSectionRange === "function"
  ) {
    for (const periodId of preview.affectedPeriodIds) {
      const range = await window.ControlerStorage.loadSectionRange("records", {
        periodIds: [periodId],
      });
      const existingItems = Array.isArray(range?.items) ? range.items : [];
      const incomingItems = preview.records.filter(
        (record) =>
          bundleHelper.getPeriodIdForSectionItem("records", record) === periodId,
      );
      const merged = externalImportHelper.mergeRecordsByReplacingDays(
        existingItems,
        incomingItems,
      );
      await window.ControlerStorage.saveSectionRange("records", {
        periodId,
        items: merged.records,
        mode: "replace",
      });
    }
    await flushStorageWrites();
  } else {
    const existingRecords = JSON.parse(localStorage.getItem("records") || "[]");
    const merged = externalImportHelper.mergeRecordsByReplacingDays(
      existingRecords,
      preview.records,
    );
    localStorage.setItem("records", JSON.stringify(merged.records));
    if (preview.createdProjects > 0) {
      localStorage.setItem(
        "projects",
        JSON.stringify(preview.projectReconciliation.projects),
      );
    }
    await flushStorageWrites();
  }

  return {
    ok: true,
    type: "external-json",
    sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
    changedSections:
      preview.createdProjects > 0 ? ["core", "records"] : ["records"],
    changedPeriods: {
      records: preview.affectedPeriodIds.slice(),
    },
    affectedPeriodIds: preview.affectedPeriodIds.slice(),
    affectedDates: preview.affectedDates.slice(),
    createdProjects: preview.createdProjects,
    matchedProjects: preview.matchedProjects,
    replacedDays: preview.replacedDays,
    importedCount: preview.validCount,
    invalidCount: preview.invalidCount,
  };
}

async function importDetectedFile(descriptor, choice = {}) {
  const mode = String(choice?.mode || "").trim() || "replace";
  const filePath =
    typeof descriptor?.filePath === "string" ? descriptor.filePath.trim() : "";
  const nativeImportUri =
    typeof descriptor?.nativeImportUri === "string"
      ? descriptor.nativeImportUri.trim()
      : "";

  if (descriptor?.sourceKind === "external-json") {
    return importExternalJsonDescriptor(descriptor, choice);
  }

  if (descriptor?.sourceKind === "partition") {
    await importPartitionEnvelopePayload(descriptor.parsedPayload, {
      filePath,
      mode,
    });
    return null;
  }

  if (
    (filePath || nativeImportUri) &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      filePath,
      uri: nativeImportUri,
      mode,
    });
  }

  if (descriptor?.fileType !== "legacy-full-json") {
    throw new Error("当前环境仅支持在桌面端导入 ZIP 整包。");
  }
  if (mode !== "replace") {
    throw new Error("当前环境暂不支持无文件路径的整包差异导入。");
  }

  const importedState = normalizeImportedBackupPayload(descriptor.parsedPayload);
  if (typeof window.ControlerStorage?.replaceAll !== "function") {
    throw new Error("当前环境不支持完整导入。");
  }

  window.ControlerStorage.replaceAll(importedState);
  await flushStorageWrites();
  syncThemeCatalog();
  applyTheme(importedState.selectedTheme);
  return null;
}

async function importData(options = {}) {
  const nativeBundleImport =
    window.ControlerStorage?.isNativeApp &&
    typeof window.ControlerStorage?.importSource === "function";

  if (nativeBundleImport) {
    try {
      const importOptions = await showNativeImportOptionsDialog(options);
      if (!importOptions) {
        return;
      }
      if (importOptions.importType === "external") {
        const file = await promptSettingsFileSelection(".json", {
          title: "正在导入数据",
          message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
        });
        if (!file) {
          return;
        }
        const descriptor = await runWithSettingsBusyState(
          {
            title: "正在准备导入",
            message: "正在读取所选文件并分析可导入内容，请稍候。导入开始前请不要离开当前页面。",
            delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
          },
          async () => inspectImportFile(file),
        );
        const choice = await showResolvedImportOptionsDialog(descriptor);
        if (!choice) {
          return;
        }
        const result = await runWithSettingsBusyState(
          {
            title: "正在导入数据",
            message: "正在写入导入内容并刷新数据索引，请稍候。导入完成前请不要离开当前页面。",
            delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
          },
          async () => importDetectedFile(descriptor, choice),
        );
        await showSettingsAlert(
          buildImportSuccessMessage(
            {
              ...descriptor,
              preview:
                choice?.preview && typeof choice.preview === "object"
                  ? choice.preview
                  : descriptor?.preview,
            },
            choice.mode,
            result,
          ),
          {
            title: "导入成功",
          },
        );
        await refreshSettingsAfterDataImport();
        return;
      }
      const accept =
        importOptions.importType === "partition" || options.jsonOnly
          ? "json"
          : "auto";
      const file = await promptSettingsFileSelection(
        accept === "json" ? ".json" : ".json,.zip",
        {
          title: "正在导入数据",
          message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
        },
      );
      if (!file) {
        return;
      }
      const result = await runWithSettingsBusyState(
        {
          title: "正在导入数据",
          message: "正在准备文件并导入数据，请稍候。导入完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () =>
          window.ControlerStorage.importSource({
            type: importOptions.importType,
            mode: importOptions.mode,
            accept,
            filePath: file?.path || "",
            uri: file?.nativeImportUri || "",
          }),
      );
      if (!result || typeof result !== "object") {
        throw new Error("导入未返回结果，请重试。");
      }
      await showSettingsAlert(
        buildImportSuccessMessage(
          {
            sourceKind: result?.type === "partition" ? "partition" : "full",
          },
          result?.mode || importOptions.mode,
          result,
        ),
        {
          title: "导入成功",
        },
      );
      await refreshSettingsAfterDataImport();
      return;
    } catch (e) {
      console.error("导入数据失败:", e);
      await showSettingsAlert(
        e instanceof Error && e.message
          ? e.message
          : "导入数据失败，请确保文件格式正确。",
        {
          title: "导入失败",
          danger: true,
        },
      );
      return;
    }
  }

  const file = await promptSettingsFileSelection(
    options.jsonOnly ? ".json" : ".json,.zip",
    {
      title: "正在导入数据",
      message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
    },
  );
  if (!file) {
    return;
  }

  try {
    const descriptor = await runWithSettingsBusyState(
      {
        title: "正在准备导入",
        message: "正在读取所选文件并分析可导入内容，请稍候。导入开始前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => inspectImportFile(file),
    );
    if (options.jsonOnly && descriptor.fileType === "zip-bundle") {
      throw new Error("当前入口只允许选择 JSON 文件。");
    }
    const choice = await showResolvedImportOptionsDialog(descriptor);
    if (!choice) {
      return;
    }

    const result = await runWithSettingsBusyState(
      {
        title: "正在导入数据",
        message: "正在写入导入内容并刷新数据索引，请稍候。导入完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => importDetectedFile(descriptor, choice),
    );
    await showSettingsAlert(
      buildImportSuccessMessage(
        {
          ...descriptor,
          preview:
            choice?.preview && typeof choice.preview === "object"
              ? choice.preview
              : descriptor?.preview,
        },
        choice.mode,
        result,
      ),
      {
        title: "导入成功",
      },
    );
    await refreshSettingsAfterDataImport();
  } catch (e) {
    console.error("导入数据失败:", e);
    await showSettingsAlert(
      e instanceof Error && e.message
        ? e.message
        : "导入数据失败，请确保文件格式正确。",
      {
        title: "导入失败",
        danger: true,
      },
    );
  }
}

// 清除所有数据（支持预览模式）
function clearAllData() {
  void showClearDataPreview();
}

// 显示清除数据预览
async function showClearDataPreview() {
  const modal = document.getElementById("clear-data-preview-modal");
  const previewList = document.getElementById("preview-data-list");
  const previewCancelBtn = document.getElementById("preview-cancel");
  const previewConfirmBtn = document.getElementById("preview-confirm");

  if (!modal || !previewList) {
    // 如果没有预览模态框，使用传统的确认方式
    const confirmationMessage = await buildClearDataConfirmationMessage(
      "确定要清除所有数据吗？此操作不可撤销！",
    );
    const confirmed = await requestSettingsConfirmation(
      confirmationMessage,
      {
        title: "清除所有数据",
        confirmText: "确认清除",
        cancelText: "取消",
        danger: true,
      },
    );
    if (confirmed) {
      void performClearData();
    }
    return;
  }

  if (previewCancelBtn) {
    previewCancelBtn.onclick = () => {
      hideSettingsModal(modal);
    };
  }

  if (previewConfirmBtn) {
    previewConfirmBtn.onclick = () => {
      void performClearData();
    };
  }

  // 清空预览列表
  previewList.innerHTML = "";

  try {
    const storageStatus = await getStorageStatusSnapshot();
    const clearTargetMessage = await buildClearDataTargetMessage();

    // 收集要清除的数据信息
    const dataToClear = [];

    // 遍历localStorage中的所有键
    getStorageEntries().forEach(([key, value]) => {
      let displayValue = value;

      // 如果是JSON数据，尝试解析以显示更友好的信息
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          displayValue = `数组，包含 ${parsed.length} 个元素`;
        } else if (typeof parsed === "object") {
          displayValue = `对象，包含 ${Object.keys(parsed).length} 个属性`;
        }
      } catch (e) {
        // 如果不是JSON，保持原样
      }

      dataToClear.push({
        key,
        value: displayValue,
        size: key.length + value.length,
      });
    });

    if (dataToClear.length === 0) {
      previewList.innerHTML =
        '<div class="settings-preview-empty">没有可清除的数据</div>';
    } else {
      // 按大小排序
      dataToClear.sort((a, b) => b.size - a.size);

      if (clearTargetMessage) {
        const targetElement = document.createElement("div");
        targetElement.className = "settings-preview-tip";
        targetElement.textContent = clearTargetMessage.replace(/\n/g, " ");
        previewList.appendChild(targetElement);
      }

      if (window.ControlerStorage?.isNativeApp) {
        const tipElement = document.createElement("div");
        tipElement.className = "settings-preview-tip";
        tipElement.textContent =
          storageStatus?.isCustomPath
            ? "当前清除会同步写回已绑定的外部文件或目录。"
            : "当前为移动端应用私有数据目录，清除后会立即同步到本机数据文件。";
        previewList.appendChild(tipElement);
      }

      // 添加到预览列表
      dataToClear.forEach((item) => {
        const itemElement = document.createElement("div");
        itemElement.className = "settings-preview-item";

        itemElement.innerHTML = `
          <div class="settings-preview-item-key">${item.key}</div>
          <div class="settings-preview-item-value">${item.value}</div>
          <div class="settings-preview-item-size">大小: ${item.size} 字节</div>
        `;

        previewList.appendChild(itemElement);
      });

      // 添加总计
      const totalSize = dataToClear.reduce((sum, item) => sum + item.size, 0);
      const totalElement = document.createElement("div");
      totalElement.className = "settings-preview-total";
      totalElement.innerHTML = `总计: ${dataToClear.length} 项数据，${totalSize} 字节`;

      previewList.appendChild(totalElement);
    }

    // 显示模态框
    showSettingsModal(modal);
  } catch (e) {
    console.error("准备预览数据失败:", e);
    // 出错时回退到传统确认
    const confirmationMessage = await buildClearDataConfirmationMessage(
      "预览失败，确定要清除所有数据吗？此操作不可撤销！",
    );
    const confirmed = await requestSettingsConfirmation(
      confirmationMessage,
      {
        title: "清除所有数据",
        confirmText: "确认清除",
        cancelText: "取消",
        danger: true,
      },
    );
    if (confirmed) {
      void performClearData();
    }
  }
}

// 执行实际的数据清除
async function performClearData() {
  try {
    // 清除所有数据
    if (typeof window.ControlerStorage?.clear === "function") {
      window.ControlerStorage.clear();
    } else {
      localStorage.clear();
    }

    await flushStorageWrites();

    syncThemeCatalog();
    applyTheme("default");
    updateStorageStatus();
    updateStoragePathInfo();
    renderNavigationVisibilitySettings();
    await renderWidgetSettingsPanel();

    // 关闭预览模态框（如果存在）
    const modal = document.getElementById("clear-data-preview-modal");
    if (modal) {
      hideSettingsModal(modal);
    }

    await showSettingsAlert("所有数据已清除，并恢复为引导版空白状态。页面将自动刷新。", {
      title: "清除完成",
    });

    // 等待1秒后刷新页面
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (e) {
    console.error("清除数据失败:", e);
    await showSettingsAlert("清除数据失败，请重试。", {
      title: "清除失败",
      danger: true,
    });
  }
}

// 显示存储路径信息
function showStoragePath() {
  const pathInfo = document.getElementById("storage-path-info");
  if (!pathInfo) return;

  // 切换显示状态
  const isVisible = pathInfo.style.display !== "none";
  pathInfo.style.display = isVisible ? "none" : "block";

  if (!isVisible) {
    // 检查是否在Electron环境中
    if (window.electronAPI && window.electronAPI.isElectron) {
      // 在Electron环境中，打开存储文件夹
      window.electronAPI
        .storageStatus()
        .then((status) => {
          if (status && status.storagePath) {
            const storageDir =
              status.storageDirectory ||
              (status.isCustomPath ? status.storagePath : status.userDataPath);

            // 打开文件夹
            window.electronAPI.shellOpenPath(storageDir).then((success) => {
              if (success) {
                pathInfo.innerHTML = `
                <p style="color: var(--accent-color); margin-bottom: 5px;">
                  ✅ 已打开存储文件夹
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px;">
                  路径: ${storageDir}
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  如果文件夹没有自动打开，请手动访问以上路径
                </p>
              `;
              } else {
                pathInfo.innerHTML = `
                <p style="color: var(--delete-btn); margin-bottom: 5px;">
                  ❌ 无法打开存储文件夹
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  路径: ${storageDir}
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  请手动访问以上路径
                </p>
              `;
              }
            });
          } else {
            // 获取状态失败，显示错误
            pathInfo.innerHTML = `
            <p style="color: var(--delete-btn); margin-bottom: 5px;">
              ❌ 无法获取存储路径信息
            </p>
          `;
          }
        })
        .catch((error) => {
          console.error("获取存储状态失败:", error);
          pathInfo.innerHTML = `
          <p style="color: var(--delete-btn); margin-bottom: 5px;">
            ❌ 获取存储状态失败: ${error.message}
          </p>
        `;
        });
    } else if (
      window.ControlerStorage?.isNativeApp &&
      typeof window.ControlerStorage.getStorageStatus === "function"
    ) {
      window.ControlerStorage.getStorageStatus()
        .then((status) => {
          const pathPresentation = resolveStoragePathPresentation(status);
          const displayPath = pathPresentation.displayPath;
          const displayLabel = pathPresentation.displayLabel;
          const displayDirectory = pathPresentation.displayDirectory;
          if (!displayPath) {
            pathInfo.innerHTML = `
              <p style="color: var(--delete-btn); margin-bottom: 5px;">
                ❌ 无法获取移动端存储路径信息
              </p>
            `;
            return;
          }

          pathInfo.innerHTML = `
            <p style="color: var(--accent-color); margin-bottom: 5px;">
              ✅ 当前同步目标 bundle
            </p>
            <p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">
              manifest: ${displayPath}
            </p>
            ${
              displayDirectory
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">bundle 根目录: ${displayDirectory}</p>`
                : ""
            }
            ${
              displayLabel && displayLabel !== displayPath
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">显示名称: ${displayLabel}</p>`
                : ""
            }
            ${
              pathPresentation.note
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px;">${pathPresentation.note}</p>`
                : ""
            }
            ${
              pathPresentation.rawPath &&
              pathPresentation.rawPath !== displayPath
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">原始路径: ${pathPresentation.rawPath}</p>`
                : ""
            }
            ${
              pathPresentation.rawDirectory &&
              pathPresentation.rawDirectory !== displayDirectory
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">原始目录: ${pathPresentation.rawDirectory}</p>`
                : ""
            }
            <p style="font-size: 12px; color: var(--muted-text-color);">
              Android 端实时存储已经是目录 bundle。若要更换实时存储位置，请使用“选择存储目录”；JSON 文件只通过“导入数据”进入。
            </p>
          `;
        })
        .catch((error) => {
          console.error("获取移动端存储状态失败:", error);
          pathInfo.innerHTML = `
            <p style="color: var(--delete-btn); margin-bottom: 5px;">
              ❌ 获取移动端存储状态失败: ${error.message || error}
            </p>
          `;
        });
    } else {
      // 在浏览器环境中，显示控制台信息
      // 在控制台中显示详细的存储信息
      console.log("=== 时间跟踪器 - 存储数据路径信息 ===");
      console.log("当前页面URL:", window.location.href);
      console.log("浏览器:", navigator.userAgent);
      console.log("localStorage 容量:", "通常为 5-10MB，取决于浏览器");
      console.log("");
      console.log("当前存储的键值对:");

      try {
        getStorageEntries().forEach(([key, value], index) => {
          console.log(
            `[${index + 1}] ${key}:`,
            value.substring(0, 100) + (value.length > 100 ? "..." : ""),
          );
        });

        console.log("");
        console.log("如何访问存储数据:");
        console.log("1. 按 F12 打开开发者工具");
        console.log("2. 切换到 'Application' 或 'Storage' 标签页");
        console.log("3. 在左侧面板中找到 'Local Storage'");
        console.log("4. 点击当前网站的域名");
        console.log("5. 右侧将显示所有存储的键值对");
        console.log("========================");
      } catch (e) {
        console.error("无法读取存储数据:", e);
      }

      // 尝试打开开发者工具（某些浏览器支持此功能）
      try {
        if (typeof console !== "undefined" && console.table) {
          const storageData = {};
          getStorageEntries().forEach(([key, value]) => {
            storageData[key] =
              value.length > 50 ? value.substring(0, 50) + "..." : value;
          });
          console.table(storageData);
        }
      } catch (e) {
        // 忽略错误
      }

      pathInfo.innerHTML = `
        <p style="color: var(--text-color); margin-bottom: 5px;">
          存储路径信息已在浏览器控制台中显示。
        </p>
        <p style="font-size: 12px; color: var(--muted-text-color);">
          要查看实际存储数据，请在浏览器中打开开发者工具(F12)，然后查看"Application"或"Storage"选项卡中的"Local Storage"。
        </p>
      `;
    }
  }
}

// 更新存储路径信息显示
function updateStoragePathInfo() {
  const currentPathElement = document.getElementById("current-storage-path");
  const currentDirectoryElement = document.getElementById(
    "current-storage-directory",
  );
  const pathTypeElement = document.getElementById("storage-path-type");

  if (!currentPathElement || !currentDirectoryElement || !pathTypeElement) return;

  // 检查是否在Electron环境中
  if (window.electronAPI && window.electronAPI.isElectron) {
    // 在Electron环境中，获取存储状态
    window.electronAPI
      .storageStatus()
      .then((status) => {
        if (status) {
          currentPathElement.textContent =
            resolveStorageDisplayPath(status) || "未知";
          currentDirectoryElement.textContent =
            status?.storageDirectory || "未知";
          pathTypeElement.textContent =
            status?.isCustomPath ? "自定义目录 bundle" : "默认目录 bundle";
        } else {
          currentPathElement.textContent = "获取失败";
          currentDirectoryElement.textContent = "获取失败";
          pathTypeElement.textContent = "未知";
        }
      })
      .catch((error) => {
        console.error("获取存储状态失败:", error);
        currentPathElement.textContent = "获取失败";
        currentDirectoryElement.textContent = "获取失败";
        pathTypeElement.textContent = "未知";
      });
  } else if (
    window.ControlerStorage?.isNativeApp &&
    typeof window.ControlerStorage.getStorageStatus === "function"
  ) {
    window.ControlerStorage.getStorageStatus()
      .then((status) => {
        const pathPresentation = resolveStoragePathPresentation(status);
        const displayPath = pathPresentation.displayPath;
        currentPathElement.textContent = displayPath || "获取失败";
        currentDirectoryElement.textContent =
          pathPresentation.displayDirectory || "获取失败";
        pathTypeElement.textContent = displayPath
          ? status?.isCustomPath
            ? "已绑定外部目录 bundle"
            : pathPresentation.note
              ? "应用默认目录 bundle（应用私有目录）"
              : "应用默认目录 bundle"
          : "未知";
      })
      .catch((error) => {
        console.error("获取移动端存储状态失败:", error);
        currentPathElement.textContent = "获取失败";
        currentDirectoryElement.textContent = "获取失败";
        pathTypeElement.textContent = "未知";
      });
  } else {
    // 在浏览器环境中，显示localStorage信息
    currentPathElement.textContent = "browser://localStorage/bundle-manifest.json";
    currentDirectoryElement.textContent = "browser://localStorage";
    pathTypeElement.textContent = "浏览器内置目录 bundle";
  }
}

async function changeStorageDirectory() {
  if (window.ControlerStorage?.isNativeApp) {
    if (typeof window.ControlerStorage.selectStorageDirectory !== "function") {
      void showSettingsAlert("当前移动端版本暂不支持选择同步目录。", {
        title: "当前环境不可用",
        danger: true,
      });
      return;
    }

    try {
      const status = await runWithSettingsBusyState(
        {
          title: "正在选择存储目录",
          message:
            "正在打开目录选择并准备迁移数据，请稍候。完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () => window.ControlerStorage.selectStorageDirectory(),
      );
      if (!status) {
        return;
      }
      updateStoragePathInfo();
      updateStorageStatus();
      await showSettingsAlert(
        buildStorageSwitchSuccessMessage(status, {
          targetType: "directory",
        }),
        {
          title: "迁移成功",
        },
      );
      window.location.reload();
    } catch (error) {
      console.error("选择移动端同步目录失败:", error);
      await showSettingsAlert(
        `选择同步目录失败，请重试。\n${error.message || error}`,
        {
          title: "选择失败",
          danger: true,
        },
      );
    }
    return;
  }

  if (!window.electronAPI || !window.electronAPI.isElectron) {
    void showSettingsAlert("在浏览器环境中无法更改存储目录，此功能仅在桌面端或移动端应用中可用。", {
      title: "当前环境不可用",
      danger: true,
    });
    return;
  }

  try {
    const result = await runWithSettingsBusyState(
      {
        title: "正在选择存储目录",
        message:
          "正在打开目录选择并准备迁移数据，请稍候。完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        const selectedPath = await window.electronAPI.dialogSelectFolder();
        if (!selectedPath) {
          return null;
        }
        const nextStatus =
          await window.electronAPI.storageSetDirectory(selectedPath);
        return {
          selectedPath,
          status: nextStatus,
        };
      },
    );
    if (!result?.selectedPath || !result?.status) {
      return;
    }
    updateStoragePathInfo();
    updateStorageStatus();
    await showSettingsAlert(
      buildStorageSwitchSuccessMessage(result.status, {
        targetType: "directory",
      }),
      {
        title: "迁移成功",
      },
    );
    window.location.reload();
  } catch (error) {
    console.error("选择存储目录失败:", error);
    await showSettingsAlert(`选择存储目录失败，请重试。\n${error.message || error}`, {
      title: "选择失败",
      danger: true,
    });
  }
}

// 重置存储路径为默认
async function resetStoragePath() {
  if (window.ControlerStorage?.isNativeApp) {
    if (typeof window.ControlerStorage.resetStorageFile !== "function") {
      void showSettingsAlert("当前移动端版本暂不支持重置同步 bundle 目录。", {
        title: "当前环境不可用",
        danger: true,
      });
      return;
    }

    const confirmed = await requestSettingsConfirmation("确定要重置为应用默认 bundle 目录吗？", {
      title: "重置同步目录",
      confirmText: "重置",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const status = await runWithSettingsBusyState(
        {
          title: "正在重置存储目录",
          message:
            "正在切回应用默认 bundle 目录并准备重新载入数据，请稍候。完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () => window.ControlerStorage.resetStorageFile(),
      );
      updateStoragePathInfo();
      updateStorageStatus();
      await showSettingsAlert(
        `已重置为默认 bundle 目录：\n${resolveStorageDisplayPath(status) || "默认目录"}\n\n页面将刷新一次以重新载入当前数据。`,
        {
          title: "重置成功",
        },
      );
      window.setTimeout(() => {
        window.location.reload();
      }, 120);
    } catch (error) {
      console.error("重置移动端同步文件失败:", error);
      await showSettingsAlert(
        `重置同步 bundle 目录失败，请重试。\n${error.message || error}`,
        {
          title: "重置失败",
          danger: true,
        },
      );
    }
    return;
  }

  // 检查是否在Electron环境中
  if (!window.electronAPI || !window.electronAPI.isElectron) {
    void showSettingsAlert(
      "在浏览器环境中无法重置存储路径，此功能仅在 Electron 应用中可用。",
      {
        title: "当前环境不可用",
        danger: true,
      },
    );
    return;
  }

  const confirmed = await requestSettingsConfirmation("确定要重置为默认 bundle 目录吗？", {
    title: "重置同步目录",
    confirmText: "重置",
    cancelText: "取消",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  try {
    const status = await runWithSettingsBusyState(
      {
        title: "正在重置存储目录",
        message:
          "正在切回默认 bundle 目录并准备重新载入数据，请稍候。完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => window.electronAPI.storageResetDirectory(),
    );
    updateStoragePathInfo();
    updateStorageStatus();
    await showSettingsAlert(
      `已重置为默认 bundle 目录：\n${resolveStorageDisplayPath(status) || "默认目录"}\n\n页面将刷新一次以重新载入默认目录中的数据。`,
      {
        title: "重置成功",
      },
    );
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  } catch (error) {
    console.error("重置存储路径失败:", error);
    await showSettingsAlert(
      `重置同步 bundle 目录失败，请重试。\n${error.message || error}`,
      {
        title: "重置失败",
        danger: true,
      },
    );
  }
}

function bindSettingsMobileDragScroll() {
  if (!window.ControlerUI?.bindVerticalDragScroll) {
    return;
  }

  const isAndroidNative =
    document.documentElement.classList.contains("controler-android-native") ||
    document.body?.classList.contains("controler-android-native");
  if (isAndroidNative) {
    return;
  }

  const isEnabled = () => window.innerWidth <= 690;
  const ignoreSelector =
    "button, input, select, textarea, a, label, .tree-select, .tree-select *, .modal-content, .modal-content *";

  document
    .querySelectorAll(".settings-main, #preview-data-list")
    .forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      window.ControlerUI.bindVerticalDragScroll(element, {
        enabled: isEnabled,
        ignoreSelector,
        pressDelay: 160,
      });
    });
}

function enhanceSettingsLanguageSelect() {
  if (!window.ControlerUI?.enhanceNativeSelect) {
    return;
  }

  const languageSelect = document.getElementById("language-select");
  if (!(languageSelect instanceof HTMLSelectElement)) {
    return;
  }

  const currentLanguage =
    window.ControlerI18n?.getLanguage?.() ||
    localStorage.getItem("appLanguage") ||
    languageSelect.value ||
    "zh-CN";
  if (languageSelect.value !== currentLanguage) {
    languageSelect.value = currentLanguage;
  }

  window.ControlerUI.enhanceNativeSelect(languageSelect, {
    fullWidth: true,
    minWidth: 220,
    preferredMenuWidth: 320,
    maxMenuWidth: 360,
  });
}

function getWidgetBridge() {
  if (window.ControlerWidgetsBridge) {
    return window.ControlerWidgetsBridge;
  }

  const detectElectronShellRuntime = () => {
    const userAgent =
      typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
    return /\bElectron\/\d+/i.test(userAgent);
  };
  const electronAPI = window.electronAPI || null;
  const runtimeMeta =
    electronAPI?.runtimeMeta && typeof electronAPI.runtimeMeta === "object"
      ? electronAPI.runtimeMeta
      : {};
  const capabilities =
    runtimeMeta.capabilities && typeof runtimeMeta.capabilities === "object"
      ? runtimeMeta.capabilities
      : {};
  const isElectron = !!electronAPI?.isElectron;
  const isElectronShell = isElectron || detectElectronShellRuntime();
  const hasElectronBridge = isElectron;
  const supportsDesktopWidgets =
    hasElectronBridge &&
    typeof electronAPI?.desktopWidgetsCreate === "function" &&
    typeof electronAPI?.desktopWidgetsGetState === "function";
  let desktopWidgetBridgeStatus = "unsupported-env";
  let desktopWidgetBridgeMessage = "当前环境暂未声明可用的小组件能力。";
  if (isElectronShell && !hasElectronBridge) {
    desktopWidgetBridgeStatus = "electron-preload-missing";
    desktopWidgetBridgeMessage =
      "检测到当前运行在 Electron 中，但预加载桥接未成功注入。桌面小组件与窗口按钮暂时不可用，请使用修复后的版本重新启动应用。";
  } else if (hasElectronBridge && !supportsDesktopWidgets) {
    desktopWidgetBridgeStatus = "electron-desktop-widget-ipc-missing";
    desktopWidgetBridgeMessage =
      "Electron 桥接已加载，但桌面小组件接口未完整暴露。请重新安装或使用修复后的版本。";
  } else if (supportsDesktopWidgets) {
    desktopWidgetBridgeStatus = "ready";
    desktopWidgetBridgeMessage = "";
  }

  return {
    electronAPI,
    isElectron,
    isElectronShell,
    hasElectronBridge,
    isAndroid: false,
    nativePlatform:
      typeof runtimeMeta.platform === "string" ? runtimeMeta.platform : "web",
    capabilities,
    supportsWidgets: !!capabilities.widgets,
    supportsWidgetManualAdd: !!capabilities.widgetManualAdd,
    supportsWidgetPinning: !!capabilities.widgetPinning,
    supportsDesktopWidgets,
    desktopWidgetBridgeStatus,
    desktopWidgetBridgeMessage,
    async createDesktopWidget(kind) {
      if (!supportsDesktopWidgets) {
        return {
          ok: false,
          message: desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return await electronAPI.desktopWidgetsCreate({ kind });
      } catch (error) {
        console.error("创建桌面小组件失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
    async getDesktopWidgetState() {
      if (typeof electronAPI?.desktopWidgetsGetState !== "function") {
        return {
          available: false,
          widgets: [],
          openAtLogin: false,
          restoreOnLaunch: false,
          keepOnTop: true,
          message: desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return (
          (await electronAPI.desktopWidgetsGetState()) || {
            widgets: [],
            openAtLogin: false,
            restoreOnLaunch: false,
            keepOnTop: true,
          }
        );
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
      if (typeof electronAPI?.desktopWidgetsUpdateSettings !== "function") {
        return {
          ok: false,
          message:
            desktopWidgetBridgeMessage || "当前环境不支持更新桌面小组件设置。",
        };
      }
      try {
        return await electronAPI.desktopWidgetsUpdateSettings(settings);
      } catch (error) {
        console.error("更新桌面小组件设置失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
  };
}

function hasElectronDesktopWidgetBridgeIssue(bridge) {
  return !!bridge?.isElectronShell && !bridge?.supportsDesktopWidgets;
}

function getElectronDesktopWidgetBridgeMessage(bridge) {
  if (!hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return "";
  }
  if (
    typeof bridge?.desktopWidgetBridgeMessage === "string" &&
    bridge.desktopWidgetBridgeMessage.trim()
  ) {
    return bridge.desktopWidgetBridgeMessage.trim();
  }
  return "Electron 桥接异常导致桌面小组件暂时不可用。";
}

function portalSettingsModalToBody(modalId) {
  const modal = document.getElementById(modalId);
  if (!(modal instanceof HTMLElement)) {
    return null;
  }

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  uiTools?.stopModalContentPropagation?.(modal);
  return modal;
}

function showSettingsModal(modal) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  modal.style.display = "flex";
}

function hideSettingsModal(modal) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  modal.style.display = "none";
}

let settingsExternalStorageRefreshQueued = false;

function refreshSettingsFromStorage() {
  settingsExternalStorageRefreshQueued = false;
  updateStorageStatus();
  updateStoragePathInfo();
  void refreshAutoBackupPanel();
  renderNavigationVisibilitySettings();
  void renderWidgetSettingsPanel();
}

function bindSettingsExternalStorageRefresh() {
  window.addEventListener("controler:storage-data-changed", (event) => {
    if (settingsExternalStorageRefreshQueued) {
      return;
    }
    settingsExternalStorageRefreshQueued = true;
    if (settingsExternalStorageRefreshCoordinator) {
      settingsExternalStorageRefreshCoordinator.enqueue(event?.detail || {});
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(refreshSettingsFromStorage);
  });
}

async function showWidgetPanelAlert(message, options = {}) {
  const title =
    typeof options.title === "string" && options.title.trim()
      ? options.title.trim()
      : "桌面小组件";

  if (window.ControlerUI?.alertDialog) {
    await window.ControlerUI.alertDialog({
      title: localizeSettingsUiText(title),
      message: localizeSettingsUiText(
        typeof message === "string" ? message : String(message || ""),
      ),
      confirmText: localizeSettingsUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }

  alert(
    localizeSettingsUiText(
      typeof message === "string" ? message : String(message || ""),
    ),
  );
}

function renderWidgetGuideCard() {
  const container = document.getElementById("widget-guide-card");
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.hidden = true;
}

function getDefaultWidgetPinState() {
  return {
    status: "idle",
    message: "",
    requestedAt: 0,
    completedAt: 0,
    appWidgetId: 0,
  };
}

function getWidgetPinState(kind) {
  const state = settingsWidgetPinStateByKind.get(kind);
  return state && typeof state === "object"
    ? {
        ...getDefaultWidgetPinState(),
        ...state,
      }
    : getDefaultWidgetPinState();
}

function clearWidgetPinTimeout(kind) {
  const timeoutId = settingsWidgetPinTimeouts.get(kind);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    settingsWidgetPinTimeouts.delete(kind);
  }
}

function setWidgetPinState(kind, nextState = {}) {
  if (typeof kind !== "string" || !kind.trim()) {
    return getDefaultWidgetPinState();
  }
  const mergedState = {
    ...getWidgetPinState(kind),
    ...nextState,
  };
  if (mergedState.status !== "pending_confirmation") {
    clearWidgetPinTimeout(kind);
  }
  settingsWidgetPinStateByKind.set(kind, mergedState);
  return mergedState;
}

function scheduleWidgetPinTimeout(kind, requestedAt) {
  clearWidgetPinTimeout(kind);
  const safeRequestedAt = Number(requestedAt) || Date.now();
  const delayMs = Math.max(
    SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS - Math.max(Date.now() - safeRequestedAt, 0),
    0,
  );
  const timeoutId = window.setTimeout(() => {
    settingsWidgetPinTimeouts.delete(kind);
    void renderWidgetSettingsPanel("timeout");
  }, delayMs);
  settingsWidgetPinTimeouts.set(kind, timeoutId);
}

function getLocalizedWidgetTypeName(item) {
  return localizeSettingsUiText(item?.name || "该组件");
}

function buildAndroidWidgetManualStepLines(item) {
  return [
    `1. ${localizeSettingsUiText("长按桌面空白处")}`,
    `2. ${localizeSettingsUiText("打开“小组件”或“插件”")}`,
    `3. ${localizeSettingsUiText("找到 Order 并选择需要的组件")} (${getLocalizedWidgetTypeName(item)})`,
  ];
}

function buildAndroidWidgetManualAlertMessage(item, baseMessage = "") {
  const lines = [];
  const normalizedMessage =
    typeof baseMessage === "string" && baseMessage.trim() ? baseMessage.trim() : "";
  if (normalizedMessage) {
    lines.push(normalizedMessage);
  }
  lines.push(localizeSettingsUiText("手动添加步骤"));
  lines.push(...buildAndroidWidgetManualStepLines(item));
  return lines.join("\n");
}

function normalizeAndroidWidgetPinSupport(support) {
  return {
    ...DEFAULT_ANDROID_WIDGET_PIN_SUPPORT,
    ...(support && typeof support === "object" ? support : {}),
  };
}

async function syncAndroidWidgetPinState(bridge, reason = "render") {
  if (!bridge?.isAndroid) {
    return normalizeAndroidWidgetPinSupport(null);
  }

  let pinSupport = normalizeAndroidWidgetPinSupport(null);
  if (typeof bridge.getPinSupport === "function") {
    pinSupport = normalizeAndroidWidgetPinSupport(
      await bridge.getPinSupport(SETTINGS_WIDGET_TYPES[0]?.id || ""),
    );
  }

  if (typeof bridge.consumePinWidgetResult === "function") {
    const pinResult = await bridge.consumePinWidgetResult();
    if (pinResult?.hasResult) {
      clearWidgetPinTimeout(pinResult.kind);
      setWidgetPinState(pinResult.kind, {
        status: "pinned_success",
        message:
          typeof pinResult.message === "string" && pinResult.message.trim()
            ? pinResult.message.trim()
            : localizeSettingsUiText("已收到系统添加回执。"),
        requestedAt: Number(pinResult.requestedAt) || 0,
        completedAt: Number(pinResult.completedAt) || Date.now(),
        appWidgetId: Number(pinResult.appWidgetId) || 0,
      });
    }
  }

  const now = Date.now();
  const shouldFallbackOnReturn =
    reason === "focus" || reason === "visibility" || reason === "resume";
  SETTINGS_WIDGET_TYPES.forEach((item) => {
    const pinState = getWidgetPinState(item.id);
    if (pinState.status !== "pending_confirmation") {
      return;
    }
    const elapsedMs = Math.max(now - (Number(pinState.requestedAt) || now), 0);
    const timedOut = elapsedMs >= SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS;
    const returnedWithoutResult =
      shouldFallbackOnReturn && elapsedMs >= SETTINGS_WIDGET_PIN_RETURN_GRACE_MS;
    if (!pinSupport.manualOnly && reason !== "timeout" && !timedOut && !returnedWithoutResult) {
      scheduleWidgetPinTimeout(item.id, pinState.requestedAt || now);
      return;
    }
    clearWidgetPinTimeout(item.id);
    setWidgetPinState(item.id, {
      status: "manual_fallback",
      message: pinSupport.manualOnly
        ? pinSupport.message
        : localizeSettingsUiText("当前系统未返回添加成功回执，请改用系统小组件面板手动添加。"),
      requestedAt: pinState.requestedAt,
      completedAt: 0,
      appWidgetId: 0,
    });
  });

  return pinSupport;
}

function getWidgetActionLabel(bridge) {
  if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
    return "创建桌面小组件";
  }
  if (hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return "Electron 桥接异常";
  }
  if (bridge?.supportsWidgetPinning) {
    return "添加到桌面";
  }
  if (bridge?.supportsWidgetManualAdd) {
    return "查看添加方式";
  }
  return "当前环境不可用";
}

function getWidgetPlatformSummary(bridge) {
  if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
    return "桌面端可直接创建桌面小组件，窗口按钮与内容会跟随当前主题。";
  }
  if (hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return getElectronDesktopWidgetBridgeMessage(bridge);
  }
  if (bridge?.supportsWidgetPinning) {
    return "当前原生端支持由应用发起添加桌面小组件。";
  }
  if (bridge?.isAndroid && bridge?.supportsWidgetManualAdd) {
    return "安卓端请通过系统小组件面板手动添加。";
  }
  if (bridge?.nativePlatform === "ios" && bridge?.supportsWidgetManualAdd) {
    return "iOS 端请在系统小组件面板中手动添加 WidgetKit 小组件。";
  }
  return "当前环境暂未声明可用的小组件能力。";
}

function buildWidgetManualAlertMessage(item, bridge) {
  const widgetName = getLocalizedWidgetTypeName(item);
  if (bridge?.nativePlatform === "ios") {
    return [
      `${widgetName} 已支持通过系统小组件面板手动添加。`,
      "请在 iPhone 或 iPad 主屏幕长按空白区域，点击左上角“编辑”或“+”进入小组件面板。",
      "搜索 Order，然后选择对应尺寸并添加。",
      "添加后点击小组件即可跳回应用对应页面。",
    ].join("\n");
  }
  return buildAndroidWidgetManualAlertMessage(item);
}

function updateDesktopWidgetStateText(state = {}) {
  const stateText = document.getElementById("desktop-widget-state-text");
  if (!stateText) {
    return;
  }
  const widgetCount = Array.isArray(state.widgets) ? state.widgets.length : 0;
  if (widgetCount <= 0) {
    stateText.textContent = state.openAtLogin
      ? "已开启开机自启应用，但当前还没有保存的小组件。先创建小组件后，启动恢复设置才会生效。"
      : "当前还没有创建任何桌面小组件，点击下方按钮即可生成。";
    return;
  }

  if (state.openAtLogin && state.restoreOnLaunch) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；系统登录后会自动启动应用并恢复这些小组件。`;
    return;
  }

  if (state.openAtLogin) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；系统登录后会自动启动应用，但不会恢复小组件。如需自动恢复，请同时开启“启动时恢复已创建小组件”。`;
    return;
  }

  if (state.restoreOnLaunch) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；手动启动应用时会恢复这些小组件。如需系统登录时恢复，请同时开启“开机自启应用”。`;
    return;
  }

  stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；当前未开启自动启动或自动恢复。`;
}

async function syncDesktopWidgetSettingsUI(bridge) {
  const desktopSettings = document.getElementById("desktop-widget-settings");
  if (!desktopSettings) {
    return;
  }

  if (!(bridge?.isElectron && bridge?.supportsDesktopWidgets)) {
    desktopSettings.style.display = "none";
    return;
  }

  desktopSettings.style.display = "block";
  const state = await bridge.getDesktopWidgetState();
  const openLoginCheckbox = document.getElementById(
    "desktop-widget-open-login",
  );
  const restoreCheckbox = document.getElementById("desktop-widget-restore");
  const onTopCheckbox = document.getElementById("desktop-widget-always-on-top");
  const applyDesktopWidgetState = (nextState = {}) => {
    if (openLoginCheckbox) {
      openLoginCheckbox.checked = !!nextState.openAtLogin;
    }
    if (restoreCheckbox) {
      restoreCheckbox.checked = !!nextState.restoreOnLaunch;
    }
    if (onTopCheckbox) {
      onTopCheckbox.checked = nextState.keepOnTop !== false;
    }
    updateDesktopWidgetStateText(nextState);
  };

  if (openLoginCheckbox) {
    openLoginCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        openAtLogin: openLoginCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  if (restoreCheckbox) {
    restoreCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        restoreOnLaunch: restoreCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  if (onTopCheckbox) {
    onTopCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        keepOnTop: onTopCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  applyDesktopWidgetState(state);
  scheduleSettingsCollapsibleRefresh();
}

function createWidgetActionDetail(item, bridge, androidPinSupport, pinState) {
  if (!bridge?.isAndroid) {
    return null;
  }

  const detail = document.createElement("div");
  detail.style.display = "grid";
  detail.style.gap = "6px";
  detail.style.marginTop = "2px";

  const addLine = (text, accent = false) => {
    if (typeof text !== "string" || !text.trim()) {
      return;
    }
    const line = document.createElement("div");
    line.textContent = localizeSettingsUiText(text.trim());
    line.style.fontSize = "11px";
    line.style.lineHeight = "1.45";
    line.style.color = accent ? "var(--delete-btn)" : "var(--muted-text-color)";
    detail.appendChild(line);
  };

  const addStepBlock = () => {
    const badge = document.createElement("div");
    badge.textContent = getLocalizedWidgetTypeName(item);
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.width = "fit-content";
    badge.style.padding = "2px 8px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "700";
    badge.style.color = "var(--button-text)";
    badge.style.background =
      "color-mix(in srgb, var(--button-bg) 78%, transparent)";
    detail.appendChild(badge);

    const heading = document.createElement("div");
    heading.textContent = localizeSettingsUiText("手动添加步骤");
    heading.style.fontSize = "11px";
    heading.style.fontWeight = "700";
    heading.style.color = "var(--text-color)";
    detail.appendChild(heading);

    buildAndroidWidgetManualStepLines(item).forEach((line) => {
      addLine(line);
    });
  };

  if (pinState?.status === "pending_confirmation") {
    addLine(
      pinState.message || localizeSettingsUiText("系统可能会要求确认。"),
    );
    addLine(
      localizeSettingsUiText("如果没有自动出现，请返回此页查看结果或改用手动添加。"),
    );
    return detail;
  }

  if (pinState?.status === "pinned_success") {
    addLine(
      pinState.message || localizeSettingsUiText("已收到系统添加回执。"),
    );
    addLine(localizeSettingsUiText("可以返回桌面查看该组件。"));
    return detail;
  }

  if (pinState?.status === "error") {
    addLine(
      pinState.message || localizeSettingsUiText("添加失败，请重试。"),
      true,
    );
    return detail;
  }

  if (pinState?.status === "manual_fallback" || !androidPinSupport?.canRequestPin) {
    addLine(
      pinState?.message ||
        androidPinSupport?.message ||
        localizeSettingsUiText("这个组件可通过系统小组件面板手动添加。"),
    );
    addStepBlock();
    return detail;
  }

  return null;
}

async function handleAndroidWidgetPrimaryAction(item, bridge, androidPinSupport) {
  const pinState = getWidgetPinState(item.id);
  if (pinState.status === "manual_fallback" || !androidPinSupport?.canRequestPin) {
    await showWidgetPanelAlert(
      buildAndroidWidgetManualAlertMessage(
        item,
        pinState.message || androidPinSupport?.message || "",
      ),
      { title: "手动添加" },
    );
    return;
  }

  const result = await bridge.requestPinWidget(item.id);
  if (result?.requestAccepted || result?.ok) {
    const requestedAt = Number(result?.requestedAt) || Date.now();
    setWidgetPinState(item.id, {
      status: "pending_confirmation",
      message:
        typeof result?.message === "string" && result.message.trim()
          ? result.message.trim()
          : localizeSettingsUiText("系统可能会要求确认。"),
      requestedAt,
      completedAt: 0,
      appWidgetId: 0,
    });
    scheduleWidgetPinTimeout(item.id, requestedAt);
    await renderWidgetSettingsPanel("state-change");
    return;
  }

  if (result?.manual) {
    setWidgetPinState(item.id, {
      status: "manual_fallback",
      message:
        typeof result?.message === "string" && result.message.trim()
          ? result.message.trim()
          : localizeSettingsUiText("当前系统不支持应用内直接固定组件。"),
      requestedAt: Number(result?.requestedAt) || 0,
      completedAt: 0,
      appWidgetId: 0,
    });
    await renderWidgetSettingsPanel("state-change");
    return;
  }

  setWidgetPinState(item.id, {
    status: "error",
    message:
      typeof result?.message === "string" && result.message.trim()
        ? result.message.trim()
        : localizeSettingsUiText("添加失败，请重试。"),
    requestedAt: 0,
    completedAt: 0,
    appWidgetId: 0,
  });
  await renderWidgetSettingsPanel("state-change");
}

function buildWidgetActionCard(item, bridge) {
  const actionLabel = getWidgetActionLabel(bridge);
  const isSupported =
    !!bridge?.supportsDesktopWidgets ||
    !!bridge?.supportsWidgetPinning ||
    !!bridge?.supportsWidgetManualAdd;

  const card = document.createElement("div");
  card.className = "ms widget-action-card";
  card.style.padding = "10px";
  card.style.borderRadius = "12px";
  card.style.border = "1px solid var(--panel-border-color)";
  card.style.background =
    "color-mix(in srgb, var(--panel-bg) 76%, transparent)";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.justifyContent = "space-between";
  card.style.gap = "8px";
  card.style.minWidth = "0";
  card.style.height = "100%";
  card.innerHTML = `
    <div class="widget-action-card-copy">
      <div class="widget-action-card-title" style="color: var(--text-color); font-size: 14px; font-weight: 700">${item.name}</div>
      <div class="widget-action-card-description" style="color: var(--muted-text-color); font-size: 11px; line-height: 1.4; margin-top: 4px">${item.description}</div>
    </div>
  `;

  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gap = "8px";

  const button = document.createElement("button");
  button.className = "bts widget-action-card-button";
  button.type = "button";
  button.textContent = actionLabel;
  button.style.margin = "0";
  button.style.width = "100%";
  button.style.padding = "6px 10px";
  button.style.fontSize = "12px";
  button.style.lineHeight = "1.2";
  button.style.whiteSpace = "normal";
  button.disabled = !isSupported;
  if (!isSupported) {
    button.style.opacity = "0.6";
    button.style.cursor = "not-allowed";
  }
  if (button.disabled) {
    button.style.opacity = "0.72";
    button.style.cursor = "default";
  }
  const bridgeIssueMessage = getElectronDesktopWidgetBridgeMessage(bridge);
  if (bridgeIssueMessage) {
    button.title = bridgeIssueMessage;
    button.setAttribute("aria-label", bridgeIssueMessage);
  }

  button.addEventListener("click", async () => {
    if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
      const result = await bridge.createDesktopWidget(item.id);
      if (result?.ok) {
        await showWidgetPanelAlert(
          `${item.name} 小组件已创建，可直接拖动边缘调整尺寸。`,
          { title: "创建成功" },
        );
        await syncDesktopWidgetSettingsUI(bridge);
        return;
      }
      await showWidgetPanelAlert(
        result?.message || `创建 ${item.name} 小组件失败，请重试。`,
        {
          title: "创建失败",
          danger: true,
        },
      );
      return;
    }

    if (bridge?.supportsWidgetPinning && bridge?.isAndroid) {
      await showWidgetPanelAlert(buildAndroidWidgetManualAlertMessage(item), {
        title: "手动添加",
      });
      return;
    }

    if (bridge?.supportsWidgetManualAdd) {
      await showWidgetPanelAlert(buildWidgetManualAlertMessage(item, bridge), {
        title: "手动添加",
      });
      return;
    }

    await showWidgetPanelAlert(
      bridgeIssueMessage || "当前环境暂不支持桌面小组件。",
      {
        title: bridgeIssueMessage ? "Electron 桥接异常" : "当前环境不可用",
        danger: true,
      },
    );
  });

  actions.appendChild(button);
  card.appendChild(actions);
  return card;
}

async function renderWidgetSettingsPanel(reason = "render") {
  const bridge = getWidgetBridge();
  const panel = document.getElementById("widget-settings-panel");
  const summary = document.getElementById("widget-platform-summary");
  const grid = document.getElementById("widget-type-grid");
  if (!panel || !summary || !grid) {
    return;
  }

  summary.textContent = getWidgetPlatformSummary(bridge);
  renderWidgetGuideCard();
  grid.innerHTML = "";
  SETTINGS_WIDGET_TYPES.forEach((item) => {
    grid.appendChild(buildWidgetActionCard(item, bridge));
  });

  await syncDesktopWidgetSettingsUI(bridge);
  scheduleSettingsCollapsibleRefresh();
}

function handleSettingsLaunchAction(payload = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "open-import-wizard") {
    return false;
  }
  window.setTimeout(() => {
    void importData({ source: payload?.source || "launcher" });
  }, 80);
  return true;
}

function initSettingsLaunchAction() {
  const eventName =
    window.ControlerWidgetsBridge?.launchActionEventName ||
    "controler:launch-action";
  let consumedQuery = false;

  const consumeQueryAction = () => {
    if (consumedQuery) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const action = params.get("widgetAction") || "";
    if (!action) {
      return;
    }
    consumedQuery = true;
    handleSettingsLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
    });
    params.delete("widgetAction");
    params.delete("widgetKind");
    params.delete("widgetSource");
    params.delete("widgetLaunchId");
    const queryText = params.toString();
    const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  };

  window.addEventListener(eventName, (event) => {
    handleSettingsLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}
// 初始化设置页面
async function initSettings() {
  scheduleSettingsSlowLoadingOverlay();
  initSettingsCollapsibleSections();
  initSettingsLaunchAction();

  // 加载当前主题
  const currentTheme = loadTheme();
  updateThemeSelector(currentTheme);
  ensureThemeSelectorVisible(currentTheme);

  const addCustomThemeBtn = document.getElementById("add-custom-theme-btn");
  if (addCustomThemeBtn) {
    addCustomThemeBtn.addEventListener("click", () => {
      showThemeEditorModal();
    });
  }

  // 设置导出按钮
  const exportBtn = document.getElementById("export-data");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportData);
  }

  // 设置导入按钮
  const importBtn = document.getElementById("import-data");
  if (importBtn) {
    importBtn.addEventListener("click", importData);
  }

  // 设置清除按钮
  const clearBtn = document.getElementById("clear-data");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearAllData);
  }

  // 更新存储状态
  const cachedAutoBackupStatus = readCachedAutoBackupStatus();
  if (cachedAutoBackupStatus && supportsAutoBackupStatusApi()) {
    renderAutoBackupPanelStatus(cachedAutoBackupStatus, {
      statusNote: "已载入上次保存的设置，正在同步最新状态...",
    });
  }
  updateStorageStatus();

  // 更新存储路径信息
  updateStoragePathInfo();
  void refreshAutoBackupPanel();

  // 设置存储路径管理按钮
  const changeDirectoryBtn = document.getElementById(
    "change-storage-directory-btn",
  );
  if (changeDirectoryBtn) {
    changeDirectoryBtn.addEventListener("click", changeStorageDirectory);
  }

  const resetPathBtn = document.getElementById("reset-storage-path-btn");
  if (resetPathBtn) {
    resetPathBtn.addEventListener("click", resetStoragePath);
  }

  // 设置存储路径显示按钮
  const showStoragePathBtn = document.getElementById("show-storage-path");
  if (showStoragePathBtn) {
    showStoragePathBtn.addEventListener("click", showStoragePath);
  }

  bindAutoBackupAutoSaveInputs();

  const runAutoBackupNowBtn = document.getElementById("run-auto-backup-now");
  if (runAutoBackupNowBtn) {
    runAutoBackupNowBtn.addEventListener("click", runAutoBackupNowFromPanel);
  }

  const openAutoBackupLocationBtn = document.getElementById(
    "open-auto-backup-location",
  );
  if (openAutoBackupLocationBtn) {
    openAutoBackupLocationBtn.addEventListener(
      "click",
      openAutoBackupLocationFromPanel,
    );
  }

  const shareLatestAutoBackupBtn = document.getElementById(
    "share-latest-auto-backup",
  );
  if (shareLatestAutoBackupBtn) {
    shareLatestAutoBackupBtn.addEventListener(
      "click",
      shareLatestAutoBackupFromPanel,
    );
  }

  window.addEventListener("resize", updateAutoBackupActionsAlignment);
  updateAutoBackupActionsAlignment();

  // 设置自动保存选项
  const autoSaveCheckbox = document.getElementById("auto-save");
  if (autoSaveCheckbox) {
    const autoSave = localStorage.getItem("autoSave") !== "false";
    autoSaveCheckbox.checked = autoSave;
    autoSaveCheckbox.addEventListener("change", (e) => {
      localStorage.setItem("autoSave", e.target.checked.toString());
    });
  }

  // 设置通知选项
  const notificationsCheckbox = document.getElementById("notifications");
  if (notificationsCheckbox) {
    const notifications = localStorage.getItem("notifications") !== "false";
    notificationsCheckbox.checked = notifications;
    notificationsCheckbox.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      localStorage.setItem("notifications", enabled.toString());
      await ensureSettingsDeferredRuntimeLoaded();
      if (enabled) {
        await window.ControlerReminders?.ensurePermission?.({
          interactive: true,
        });
      }
      await window.ControlerReminders?.syncNativeSchedule?.({
        force: true,
      });
      window.ControlerReminders?.refresh?.({
        resetWindow: true,
      });
    });
  }

  // 初始化表格与热图尺寸设置面板
  renderTableSizeSettingsPanel();
  renderNavigationVisibilitySettings();
  window.ControlerUI?.markPerfStage?.("first-data-ready");
  bindSettingsExternalStorageRefresh();
  window.addEventListener("focus", () => {
    renderNavigationVisibilitySettings();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderNavigationVisibilitySettings();
    }
  });
  window.addEventListener(
    window.ControlerUI?.appNavigationVisibilityEventName ||
      "controler:app-navigation-visibility-changed",
    () => {
      renderNavigationVisibilitySettings();
    },
  );
  enhanceSettingsLanguageSelect();
  bindSettingsMobileDragScroll();
  scheduleSettingsCollapsibleRefresh();
  updateDataManagementGuideHint();
  window.addEventListener(
    SETTINGS_LANGUAGE_EVENT,
    updateDataManagementGuideHint,
  );
  try {
    await renderWidgetSettingsPanel("init");
  } finally {
    queueSettingsInitialReady();
  }

  // 设置预览模态框按钮事件
  const previewModal = portalSettingsModalToBody("clear-data-preview-modal");
  const previewCancelBtn = document.getElementById("preview-cancel");
  if (previewCancelBtn) {
    const closePreview = () => {
      if (previewModal) {
        hideSettingsModal(previewModal);
      }
    };
    previewCancelBtn.onclick = closePreview;
    previewCancelBtn.onpointerup = (event) => {
      event.preventDefault();
      closePreview();
    };
  }

  const previewConfirmBtn = document.getElementById("preview-confirm");
  if (previewConfirmBtn) {
    previewConfirmBtn.addEventListener("click", performClearData);
  }

  // 点击模态框外部关闭
  if (previewModal) {
    previewModal.addEventListener("click", function (e) {
      if (e.target === this) {
        hideSettingsModal(this);
      }
    });
  }
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}
