// 统计页面JavaScript
let records = [];
let projects = [];
let statsPreferencesState = createDefaultStatsPreferences();
let statsLoadedRecordPeriodIds = [];
let statsPersistChain = Promise.resolve(true);
let statsPendingPersistenceCount = 0;
let statsLastPersistenceError = null;
let statsBeforePageLeaveGuardBound = false;
const uiTools = window.ControlerUI || null;
const projectStatsApi = window.ControlerProjectStats || null;
const statsDataIndex = window.ControlerDataIndex?.createStore?.() || null;
const IS_ANDROID_NATIVE_STATS_RUNTIME =
  window.ControlerNativeBridge?.platform === "android";
const IS_NATIVE_STATS_RUNTIME =
  IS_ANDROID_NATIVE_STATS_RUNTIME ||
  window.ControlerNativeBridge?.platform === "ios";
let heatmapState = {
  dataType: "project", // "project" | "checkin"
  projectFilter: "all", // all | project:<id>
  checkinItemId: "all", // all | <itemId>
  lightMaxHours: 2,
  mediumMaxHours: 6,
  currentMonthKey: "", // YYYY-MM
  monthCount: 1,
};
let calHeatmapInstance = null;
let timeTableLevelFilter = "all";
let pieChartState = {
  selectionValue: "summary:all",
};
let lineChartState = {
  dataType: "project",
  selectionValue: "summary:all",
};
let statsLegendCollapseState = {
  line: new Set(),
  pie: new Set(),
};
let statsViewMode = "table";
let statsRememberedGeneralRangeUnit = "day";
let statsRememberedHeatmapRangeUnit = "month";
let statsRangeState = {
  unit: "day",
  anchorDate: getDateOnly(new Date()),
};
let statsToolbarRevealQueued = false;
let statsInitialReadyReported = false;
let statsInitialDataLoaded = false;
let statsLoadingOverlayTimer = 0;
let statsLoadingOverlayController = null;
let statsChartRuntimeLoader = null;
let statsHeatmapRuntimeLoader = null;
const STATS_CHART_RUNTIME_URL = "offline-assets/chart.runtime.js";
const STATS_D3_RUNTIME_URL = "offline-assets/d3.min.js";
const STATS_HEATMAP_STYLE_URL = "offline-assets/cal-heatmap.css";
const STATS_HEATMAP_RUNTIME_URL = "offline-assets/cal-heatmap.min.js";
const STATS_VIEW_LABELS = {
  table: "表格视图",
  charts: "饼状图和折线图",
  heatmap: "日历热图",
  "record-list": "时间记录列表",
  "day-pie": "一天的饼状图",
  "day-line": "一天的折线图",
};
const STATS_VIEW_MODES = new Set([
  "table",
  "charts",
  "heatmap",
  "record-list",
  "day-pie",
  "day-line",
]);
const STATS_MAIN_VIEW_MODES = new Set(["table", "charts", "heatmap"]);
const STATS_RANGE_UNITS = new Set(["day", "week", "month", "year"]);
const STATS_HEATMAP_RANGE_UNITS = new Set(["month", "year"]);
const STATS_LEVEL_FILTER_VALUES = new Set(["all", "1", "2", "3"]);
function getStatsToolbarViewValue(viewMode) {
  switch (viewMode) {
    case "record-list":
      return "table";
    case "day-pie":
    case "day-line":
      return "charts";
    case "heatmap":
    case "charts":
    case "table":
      return viewMode;
    default:
      return "table";
  }
}
const LINE_CHART_COLOR_POOL = [
  "#79af85",
  "#4299e1",
  "#ed8936",
  "#9f7aea",
  "#f56565",
  "#48bb78",
  "#ecc94b",
  "#667eea",
  "#ed64a6",
  "#38b2ac",
];
const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const STATS_MIN_VISIBLE_DAYS = 7;
const STATS_MAX_VISIBLE_DAYS = 14;
const MOBILE_LAYOUT_MAX_WIDTH = 690;
const MOBILE_LAYOUT_HYSTERESIS_PX = 24;
const MOBILE_TABLE_SCALE_RATIO = 0.82;
const MOBILE_TABLE_EXTRA_SHRINK_RATIO = 2 / 3;
const MOBILE_NO_EXTRA_TABLE_SHRINK_KEYS = new Set(["statsHeatmap"]);
const MOBILE_LINE_FILTER_WIDTH_FACTOR = 2 / 3;
const MOBILE_HEATMAP_FILTER_WIDTH_FACTOR = 2 / 3;
const MOBILE_HEATMAP_CELL_SHRINK_RATIO = 0.92;
const STATS_PREFERENCES_STORAGE_KEY = "statsPreferences";
const STATS_LOADING_OVERLAY_DELAY_MS = 180;
const STATS_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS = 1200;
const HEATMAP_THRESHOLD_DEFAULTS = Object.freeze({
  lightMaxHours: 2,
  mediumMaxHours: 6,
});
const DOUBLE_TAP_ACTIVATION_DELAY_MS = 320;

function waitForStatsStorageReady() {
  if (typeof window.ControlerStorage?.whenReady !== "function") {
    return Promise.resolve(true);
  }
  return window.ControlerStorage.whenReady().catch((error) => {
    console.error("等待统计页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

function queueStatsPersistenceTask(
  task,
  errorLabel = "保存统计记录失败:",
) {
  statsLastPersistenceError = null;
  statsPendingPersistenceCount += 1;
  const queuedTask = statsPersistChain
    .catch(() => true)
    .then(() => (typeof task === "function" ? task() : true))
    .catch((error) => {
      statsLastPersistenceError =
        error instanceof Error ? error : new Error(String(error || "保存失败"));
      console.error(errorLabel, statsLastPersistenceError);
      return false;
    })
    .finally(() => {
      statsPendingPersistenceCount = Math.max(
        0,
        statsPendingPersistenceCount - 1,
      );
    });
  statsPersistChain = queuedTask.then(() => true);
  return queuedTask;
}

async function flushStatsPendingPersistence() {
  if (statsPendingPersistenceCount > 0) {
    await statsPersistChain.catch(() => false);
  }
  if (statsLastPersistenceError) {
    throw statsLastPersistenceError;
  }
  if (typeof window.ControlerStorage?.flush === "function") {
    await window.ControlerStorage.flush();
  }
  if (statsLastPersistenceError) {
    throw statsLastPersistenceError;
  }
  return true;
}

function registerStatsBeforePageLeaveGuard() {
  if (statsBeforePageLeaveGuardBound) {
    return;
  }
  statsBeforePageLeaveGuardBound = true;
  uiTools?.registerBeforePageLeave?.(async () => {
    if (statsPendingPersistenceCount <= 0 && !statsLastPersistenceError) {
      return true;
    }
    return flushStatsPendingPersistence();
  });
}

const DOUBLE_TAP_ACTIVATION_MOVE_TOLERANCE_PX = 24;
const IS_ELECTRON_DESKTOP = !!window.electronAPI?.isElectron;
const HAS_COARSE_POINTER =
  (typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches) ||
  Number(globalThis?.navigator?.maxTouchPoints || 0) > 0;
const DISABLE_ELECTRON_STATS_BLOCK_DRAG =
  IS_ELECTRON_DESKTOP || HAS_COARSE_POINTER;
const DISABLE_ELECTRON_STATS_GLASS_EFFECT = IS_ELECTRON_DESKTOP;
const DISABLE_ELECTRON_STATS_BLOCK_HOVER_EFFECT = IS_ELECTRON_DESKTOP;
const STATS_ELECTRON_COMPAT_STYLE_ID =
  "controler-stats-electron-compat-style";
const STATS_WIDGET_CONTEXT = (() => {
  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (error) {
    params = null;
  }

  return {
    enabled: params?.get("widgetMode") === "desktop-widget",
    kind: params?.get("widgetKind") || "",
    launchAction: params?.get("widgetAction") || "",
    launchSource: params?.get("widgetSource") || "",
  };
})();

function isStatsDesktopWidgetMode() {
  return STATS_WIDGET_CONTEXT.enabled;
}

function renderStatsRuntimeMessage(container, title, message) {
  container.innerHTML = "";
  const panel = document.createElement("section");
  panel.className = "stats-section-panel";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.alignSelf = "stretch";

  const titleNode = document.createElement("div");
  titleNode.className = "stats-section-title";
  titleNode.textContent = title;
  panel.appendChild(titleNode);

  const body = document.createElement("div");
  body.className = "stats-section-body";
  body.innerHTML = `
    <div style="padding: 22px; color: var(--muted-text-color); text-align: center;">
      ${message}
    </div>
  `;
  panel.appendChild(body);
  container.appendChild(panel);
}

function ensureStatsChartRuntimeLoaded() {
  if (typeof window.Chart !== "undefined") {
    return Promise.resolve();
  }
  if (statsChartRuntimeLoader) {
    return statsChartRuntimeLoader;
  }
  const loader =
    typeof uiTools?.loadScriptOnce === "function"
      ? uiTools.loadScriptOnce(STATS_CHART_RUNTIME_URL)
      : Promise.reject(new Error("缺少动态图表脚本加载能力"));
  statsChartRuntimeLoader = loader.catch((error) => {
    statsChartRuntimeLoader = null;
    throw error;
  });
  return statsChartRuntimeLoader;
}

function ensureStatsD3RuntimeLoaded() {
  if (typeof window.d3 !== "undefined") {
    return Promise.resolve();
  }
  if (statsHeatmapRuntimeLoader && typeof window.d3 === "undefined") {
    return statsHeatmapRuntimeLoader;
  }
  const loader =
    typeof uiTools?.loadScriptOnce === "function"
      ? uiTools.loadScriptOnce(STATS_D3_RUNTIME_URL)
      : Promise.reject(new Error("缺少 D3 脚本加载能力"));
  return loader;
}

function ensureStatsHeatmapRuntimeLoaded() {
  if (
    typeof window.d3 !== "undefined" &&
    typeof window.CalHeatmap !== "undefined"
  ) {
    return Promise.resolve();
  }
  if (statsHeatmapRuntimeLoader) {
    return statsHeatmapRuntimeLoader;
  }
  statsHeatmapRuntimeLoader = (async () => {
    if (typeof uiTools?.loadStyleOnce === "function") {
      // Some local WebView runtimes do not reliably dispatch `load` for asset CSS.
      // The stylesheet improves appearance only, so avoid blocking the heatmap scripts on it.
      void uiTools.loadStyleOnce(STATS_HEATMAP_STYLE_URL).catch((error) => {
        console.warn("热图样式加载失败，继续使用默认样式:", error);
      });
    }
    await ensureStatsD3RuntimeLoaded();
    if (typeof window.CalHeatmap === "undefined") {
      if (typeof uiTools?.loadScriptOnce !== "function") {
        throw new Error("缺少热图脚本加载能力");
      }
      await uiTools.loadScriptOnce(STATS_HEATMAP_RUNTIME_URL);
    }
  })().catch((error) => {
    statsHeatmapRuntimeLoader = null;
    throw error;
  });
  return statsHeatmapRuntimeLoader;
}

const statsViewRefreshScheduler = uiTools?.createFrameScheduler?.(
  () => {
    renderCurrentView();
  },
  { delay: 70 },
);
let cachedStatsTimeRecords = null;
const statsExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async () => {
      refreshStatsFromExternalStorageChange();
    },
  }) || null;

function getStatsNormalizedChangedSections(changedSections = []) {
  if (typeof uiTools?.normalizeChangedSections === "function") {
    return uiTools.normalizeChangedSections(changedSections);
  }
  return Array.from(
    new Set(
      (Array.isArray(changedSections) ? changedSections : [])
        .map((section) => String(section || "").trim())
        .filter(Boolean),
    ),
  );
}

function hasStatsChangedPeriodOverlap(changedPeriodIds = [], currentPeriodIds = []) {
  if (typeof uiTools?.hasPeriodOverlap === "function") {
    return uiTools.hasPeriodOverlap(changedPeriodIds, currentPeriodIds);
  }
  const normalizedChanged = Array.isArray(changedPeriodIds)
    ? changedPeriodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
    : [];
  const normalizedCurrent = Array.isArray(currentPeriodIds)
    ? currentPeriodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
    : [];
  if (!normalizedChanged.length || !normalizedCurrent.length) {
    return true;
  }
  const currentSet = new Set(normalizedCurrent);
  return normalizedChanged.some((periodId) => currentSet.has(periodId));
}

function isStatsSerializableEqual(left, right) {
  if (typeof uiTools?.isSerializableEqual === "function") {
    return uiTools.isSerializableEqual(left, right);
  }
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch (error) {
    return false;
  }
}

function shouldRefreshStatsCoreData(nextData = null) {
  if (!nextData || typeof nextData !== "object") {
    return true;
  }
  return !isStatsSerializableEqual(nextData.projects || [], projects || []);
}

function shouldRefreshStatsForExternalChange(detail = {}) {
  const changedSections = getStatsNormalizedChangedSections(detail?.changedSections);
  if (!changedSections.length) {
    return true;
  }
  const recordsChanged = changedSections.includes("records");
  const checkinsChanged =
    changedSections.includes("dailyCheckins") ||
    changedSections.includes("checkinItems");
  const projectsChanged =
    changedSections.includes("projects") || changedSections.includes("core");
  if (!recordsChanged && !checkinsChanged && !projectsChanged) {
    return false;
  }
  if (checkinsChanged) {
    return true;
  }
  if (
    recordsChanged &&
    hasStatsChangedPeriodOverlap(
      detail?.changedPeriods?.records || [],
      statsLoadedRecordPeriodIds.length
        ? statsLoadedRecordPeriodIds
        : getExpandedStatsRecordLoadScope(getStatsLoadScope()).periodIds,
    )
  ) {
    return true;
  }
  if (projectsChanged && shouldRefreshStatsCoreData(detail?.data)) {
    return true;
  }
  return false;
}

function invalidateStatsDerivedCaches(fields = []) {
  if (fields.includes("records") || fields.includes("projects")) {
    cachedStatsTimeRecords = null;
  }
}

function syncStatsDataIndex(fields = ["records", "projects"]) {
  if (!statsDataIndex) {
    return;
  }

  const nextState = {};
  fields.forEach((fieldName) => {
    if (fieldName === "records") {
      nextState.records = records;
    } else if (fieldName === "projects") {
      nextState.projects = projects;
    }
  });

  statsDataIndex.replaceState(nextState);
  invalidateStatsDerivedCaches(fields);
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

function normalizeStatsMainViewMode(viewMode) {
  const normalizedMode = String(viewMode || "").trim();
  return STATS_MAIN_VIEW_MODES.has(normalizedMode) ? normalizedMode : "table";
}

function normalizeStatsViewMode(viewMode, fallback = "table") {
  const normalizedMode = String(viewMode || "").trim();
  if (STATS_VIEW_MODES.has(normalizedMode)) {
    return normalizedMode;
  }
  return STATS_VIEW_MODES.has(fallback) ? fallback : "table";
}

function normalizeStatsRangeUnit(unit, fallback = "day") {
  const normalizedUnit = String(unit || "").trim();
  if (STATS_RANGE_UNITS.has(normalizedUnit)) {
    return normalizedUnit;
  }
  return STATS_RANGE_UNITS.has(fallback) ? fallback : "day";
}

function normalizeHeatmapRangeUnit(unit) {
  const normalizedUnit = String(unit || "").trim();
  return STATS_HEATMAP_RANGE_UNITS.has(normalizedUnit)
    ? normalizedUnit
    : "month";
}

function normalizeStatsLevelFilter(levelFilter) {
  const normalizedFilter = String(levelFilter || "").trim();
  return STATS_LEVEL_FILTER_VALUES.has(normalizedFilter)
    ? normalizedFilter
    : "all";
}

function normalizeStatsSelectionValue(value) {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || "summary:all";
}

function normalizeStatsStoredKeyArray(rawKeys) {
  if (!Array.isArray(rawKeys)) {
    return [];
  }

  const normalizedKeys = [];
  const seenKeys = new Set();
  rawKeys.forEach((key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || seenKeys.has(normalizedKey)) {
      return;
    }
    seenKeys.add(normalizedKey);
    normalizedKeys.push(normalizedKey);
  });

  return normalizedKeys;
}

function normalizeStatsHeatmapDataType(dataType) {
  return String(dataType || "").trim() === "checkin" ? "checkin" : "project";
}

function normalizeStatsUiState(rawUiState) {
  const baseUiState = createDefaultStatsPreferences().uiState;
  const source = rawUiState && typeof rawUiState === "object" ? rawUiState : {};
  const pieState = source.pie && typeof source.pie === "object" ? source.pie : {};
  const lineState =
    source.line && typeof source.line === "object" ? source.line : {};
  const heatmapUiState =
    source.heatmap && typeof source.heatmap === "object"
      ? source.heatmap
      : {};

  return {
    ...baseUiState,
    viewMode: normalizeStatsViewMode(source.viewMode),
    generalRangeUnit: normalizeStatsRangeUnit(source.generalRangeUnit, "day"),
    heatmapRangeUnit: normalizeHeatmapRangeUnit(source.heatmapRangeUnit),
    tableLevelFilter: normalizeStatsLevelFilter(source.tableLevelFilter),
    pie: {
      ...baseUiState.pie,
      selectionValue: normalizeStatsSelectionValue(pieState.selectionValue),
      collapsedKeys: normalizeStatsStoredKeyArray(pieState.collapsedKeys),
    },
    line: {
      ...baseUiState.line,
      selectionValue: normalizeStatsSelectionValue(lineState.selectionValue),
      collapsedKeys: normalizeStatsStoredKeyArray(lineState.collapsedKeys),
    },
    heatmap: {
      ...baseUiState.heatmap,
      dataType: normalizeStatsHeatmapDataType(heatmapUiState.dataType),
      projectFilter: String(heatmapUiState.projectFilter || "all").trim() || "all",
      checkinItemId: String(heatmapUiState.checkinItemId || "all").trim() || "all",
      monthCount: clamp(parseInt(heatmapUiState.monthCount, 10) || 1, 1, 12),
    },
  };
}

function normalizeHeatmapThresholdConfig(rawConfig) {
  const lightValue = Number.parseFloat(
    rawConfig?.lightMaxHours ?? HEATMAP_THRESHOLD_DEFAULTS.lightMaxHours,
  );
  const mediumValue = Number.parseFloat(
    rawConfig?.mediumMaxHours ?? HEATMAP_THRESHOLD_DEFAULTS.mediumMaxHours,
  );
  const safeLightValue =
    Number.isFinite(lightValue) && lightValue >= 0
      ? lightValue
      : HEATMAP_THRESHOLD_DEFAULTS.lightMaxHours;
  const safeMediumValue =
    Number.isFinite(mediumValue) && mediumValue >= safeLightValue
      ? mediumValue
      : Math.max(safeLightValue, HEATMAP_THRESHOLD_DEFAULTS.mediumMaxHours);

  return {
    lightMaxHours: safeLightValue,
    mediumMaxHours: safeMediumValue,
  };
}

function normalizeStatsPreferences(rawPreferences) {
  const base = createDefaultStatsPreferences();
  const source =
    rawPreferences && typeof rawPreferences === "object" ? rawPreferences : {};
  const rawThresholds =
    source.heatmapThresholdsByFilter &&
    typeof source.heatmapThresholdsByFilter === "object"
      ? source.heatmapThresholdsByFilter
      : {};
  const normalizedThresholds = {};

  Object.entries(rawThresholds).forEach(([filterKey, config]) => {
    const normalizedKey = String(filterKey || "").trim();
    if (!normalizedKey) {
      return;
    }
    normalizedThresholds[normalizedKey] =
      normalizeHeatmapThresholdConfig(config);
  });

  return {
    ...base,
    ...source,
    heatmapThresholdsByFilter: normalizedThresholds,
    uiState: normalizeStatsUiState(source.uiState),
  };
}

function readStatsPreferencesFromStorage() {
  try {
    const savedPreferences = localStorage.getItem(
      STATS_PREFERENCES_STORAGE_KEY,
    );
    return normalizeStatsPreferences(savedPreferences ? JSON.parse(savedPreferences) : {});
  } catch (error) {
    console.error("加载统计偏好配置失败:", error);
    return createDefaultStatsPreferences();
  }
}

function loadStatsPreferencesFromStorage() {
  statsPreferencesState = readStatsPreferencesFromStorage();
  return statsPreferencesState;
}

function saveStatsPreferencesToStorage() {
  try {
    statsPreferencesState = normalizeStatsPreferences(statsPreferencesState);
    localStorage.setItem(
      STATS_PREFERENCES_STORAGE_KEY,
      JSON.stringify(statsPreferencesState),
    );
  } catch (error) {
    console.error("保存统计偏好配置失败:", error);
  }
}

function getHeatmapThresholdStorageKey(
  filterValue = heatmapState.projectFilter,
) {
  const normalizedKey = String(filterValue || "").trim();
  return normalizedKey || "all";
}

function getHeatmapThresholdsForFilter(
  filterValue = heatmapState.projectFilter,
) {
  const filterKey = getHeatmapThresholdStorageKey(filterValue);
  const storedThresholds =
    statsPreferencesState?.heatmapThresholdsByFilter?.[filterKey];
  return normalizeHeatmapThresholdConfig(storedThresholds);
}

function applyPersistedHeatmapThresholds(
  filterValue = heatmapState.projectFilter,
) {
  const thresholdConfig = getHeatmapThresholdsForFilter(filterValue);
  heatmapState.lightMaxHours = thresholdConfig.lightMaxHours;
  heatmapState.mediumMaxHours = thresholdConfig.mediumMaxHours;
  return thresholdConfig;
}

function persistHeatmapThresholdsForFilter(
  filterValue = heatmapState.projectFilter,
  lightValue = heatmapState.lightMaxHours,
  mediumValue = heatmapState.mediumMaxHours,
) {
  const filterKey = getHeatmapThresholdStorageKey(filterValue);
  const nextThresholdConfig = normalizeHeatmapThresholdConfig({
    lightMaxHours: lightValue,
    mediumMaxHours: mediumValue,
  });

  statsPreferencesState = normalizeStatsPreferences({
    ...statsPreferencesState,
    heatmapThresholdsByFilter: {
      ...(statsPreferencesState?.heatmapThresholdsByFilter || {}),
      [filterKey]: nextThresholdConfig,
    },
  });
  saveStatsPreferencesToStorage();
  return nextThresholdConfig;
}

function localizeStatsUiText(value) {
  const text = String(value ?? "");
  return (
    window.ControlerI18n?.translateUiText?.(text) ||
    window.ControlerI18n?.translateText?.(text) ||
    text
  );
}

function isStatsEnglish() {
  return (
    !!window.ControlerI18n?.isEnglish?.() ||
    window.ControlerI18n?.getLanguage?.() === "en-US"
  );
}

function formatStatsWidgetWindowTitle(viewTitle) {
  const safeTitle = String(viewTitle || "时间统计");
  return isStatsEnglish()
    ? `${localizeStatsUiText(safeTitle)} Widget`
    : `${safeTitle} 小组件`;
}

function formatStatsHoursText(value, fractionDigits = 2) {
  const safeValue = Number(value);
  const normalizedValue = Number.isFinite(safeValue) ? safeValue : 0;
  return isStatsEnglish()
    ? `${normalizedValue.toFixed(fractionDigits)} h`
    : `${normalizedValue.toFixed(fractionDigits)}小时`;
}

function formatStatsHourBucketLabel(startHour, endHour) {
  return isStatsEnglish()
    ? `${String(startHour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:00`
    : `${startHour}-${endHour}点`;
}

function formatStatsWeekBucketLabel(date) {
  return isStatsEnglish()
    ? `${date.getMonth() + 1}/${date.getDate()} wk`
    : `${date.getMonth() + 1}/${date.getDate()}起`;
}

function queueStatsToolbarReveal() {
  const body = document.body;
  if (
    !(body instanceof HTMLElement) ||
    !body.classList.contains("stats-toolbar-bootstrap-pending") ||
    statsToolbarRevealQueued
  ) {
    return;
  }

  statsToolbarRevealQueued = true;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      statsToolbarRevealQueued = false;
      body.classList.remove("stats-toolbar-bootstrap-pending");
      body.classList.add("stats-toolbar-bootstrap-ready");
      if (!statsInitialReadyReported) {
        statsInitialReadyReported = true;
        uiTools?.markPerfStage?.("first-render-done");
        uiTools?.markNativePageReady?.();
      }
    });
  });
}

function getStatsLoadingOverlayElement() {
  return document.getElementById("stats-loading-overlay");
}

function getStatsLoadingOverlayController() {
  if (statsLoadingOverlayController) {
    return statsLoadingOverlayController;
  }
  const overlay = getStatsLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  statsLoadingOverlayController = uiTools?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".stats-main",
  }) || null;
  return statsLoadingOverlayController;
}

function setStatsLoadingState(options = {}) {
  const overlay = getStatsLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return;
  }

  const {
    active = false,
    mode = "inline",
    title = "正在加载数据中",
    delayMs = 0,
    message =
      mode === "fullscreen"
        ? "正在整理统计索引与范围数据，请稍候"
        : "正在更新统计结果，请稍候",
  } = options;
  const loadingController = getStatsLoadingOverlayController();
  if (!loadingController) {
    return;
  }

  loadingController.setState({
    active,
    mode,
    title,
    message,
    delayMs,
  });
}

const statsRefreshController = uiTools?.createAtomicRefreshController?.({
  defaultDelayMs: STATS_LOADING_OVERLAY_DELAY_MS,
  showLoading: (loadingOptions = {}) => {
    setStatsLoadingState({
      active: true,
      ...loadingOptions,
    });
  },
  hideLoading: () => {
    setStatsLoadingState({
      active: false,
    });
  },
});

function getStatsWidgetRendererConfig() {
  if (!STATS_WIDGET_CONTEXT.enabled) {
    return null;
  }

  switch (STATS_WIDGET_CONTEXT.kind) {
    case "record-list":
      return {
        title: "时间记录列表",
        render: renderWidgetRecordList,
      };
    case "week-grid":
      return {
        title: "一周表格视图",
        render: renderWeeklyTimeGrid,
      };
    case "day-pie":
      return {
        title: "一天的饼状图",
        render: renderPieChart,
      };
    case "heatmap":
      return {
        title: "日历热图",
        render: renderHeatmap,
      };
    case "day-line":
      return {
        title: "一天的折线图",
        render: renderLineChart,
      };
    default:
      return null;
  }
}

function applyStatsDesktopWidgetMode() {
  if (!STATS_WIDGET_CONTEXT.enabled) {
    return;
  }

  const widgetConfig = getStatsWidgetRendererConfig();
  document.body.classList.add(
    "desktop-widget-page",
    "desktop-widget-stats-page",
  );
  document.body.dataset.widgetKind = STATS_WIDGET_CONTEXT.kind || "record-list";
  document.title = formatStatsWidgetWindowTitle(widgetConfig?.title);

  if (!document.getElementById("desktop-widget-stats-style")) {
    const style = document.createElement("style");
    style.id = "desktop-widget-stats-style";
    style.textContent = `
      body.desktop-widget-stats-page {
        overflow: hidden;
      }

      body.desktop-widget-stats-page .app-sidebar,
      body.desktop-widget-stats-page .stats-topbar,
      body.desktop-widget-stats-page #stats-toolbar {
        display: none !important;
      }

      body.desktop-widget-stats-page .stats-main {
        margin: 0 !important;
        padding: 12px !important;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        min-height: 0 !important;
        height: 100vh !important;
        box-sizing: border-box;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page .stats-shell,
      body.desktop-widget-stats-page #stats-container,
      body.desktop-widget-stats-page .stats-section-panel,
      body.desktop-widget-stats-page .stats-section-body,
      body.desktop-widget-stats-page .stats-view-shell,
      body.desktop-widget-stats-page .stats-view-content,
      body.desktop-widget-stats-page .stats-content,
      body.desktop-widget-stats-page .stats-chart-viewport,
      body.desktop-widget-stats-page .stats-heatmap-root,
      body.desktop-widget-stats-page .stats-heatmap-month-panel,
      body.desktop-widget-stats-page .weekly-glass-shell,
      body.desktop-widget-stats-page .weekly-glass-scroller,
      body.desktop-widget-stats-page .stats-widget-record-list,
      body.desktop-widget-stats-page .stats-pie-layout,
      body.desktop-widget-stats-page .stats-pie-canvas-host,
      body.desktop-widget-stats-page .stats-pie-legend {
        min-width: 0 !important;
        min-height: 0 !important;
      }

      body.desktop-widget-stats-page .stats-shell {
        margin: 0 !important;
        padding: 12px !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
        flex: 1 1 auto !important;
        gap: 0 !important;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page #stats-container {
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        gap: 0 !important;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page .stats-section-panel,
      body.desktop-widget-stats-page .stats-section-body,
      body.desktop-widget-stats-page .stats-view-shell,
      body.desktop-widget-stats-page .stats-view-content,
      body.desktop-widget-stats-page .stats-content {
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
      }

      body.desktop-widget-stats-page .stats-section-panel {
        height: 100% !important;
        padding: 12px !important;
      }

      body.desktop-widget-stats-page .stats-section-title {
        margin-bottom: 10px !important;
      }

      body.desktop-widget-stats-page .stats-view-shell {
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page .stats-view-content {
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page .stats-content {
        padding: 12px !important;
        gap: 12px !important;
        overflow: hidden !important;
      }

      body.desktop-widget-stats-page .stats-content > :last-child,
      body.desktop-widget-stats-page .stats-chart-viewport,
      body.desktop-widget-stats-page .stats-heatmap-root,
      body.desktop-widget-stats-page .stats-heatmap-month-panel,
      body.desktop-widget-stats-page .weekly-glass-shell,
      body.desktop-widget-stats-page .weekly-glass-scroller,
      body.desktop-widget-stats-page .stats-widget-record-list,
      body.desktop-widget-stats-page .stats-pie-layout,
      body.desktop-widget-stats-page .stats-pie-canvas-host,
      body.desktop-widget-stats-page .stats-pie-legend {
        flex: 1 1 auto !important;
      }

      body.desktop-widget-stats-page .stats-widget-record-list,
      body.desktop-widget-stats-page .weekly-glass-scroller,
      body.desktop-widget-stats-page .stats-pie-legend,
      body.desktop-widget-stats-page .stats-heatmap-month-panel,
      body.desktop-widget-stats-page .stats-heatmap-calendar-strip {
        overflow: auto !important;
      }

      body.desktop-widget-stats-page .stats-heatmap-calendar-strip {
        flex: 1 1 auto !important;
        align-content: flex-start;
      }

      body.desktop-widget-stats-page .stats-heatmap-header {
        padding: 12px !important;
      }

      body.desktop-widget-stats-page .stats-heatmap-row--nav {
        flex-wrap: nowrap;
      }

      body.desktop-widget-stats-page .stats-heatmap-row--nav > * {
        min-width: 0;
      }

      body.desktop-widget-stats-page .stats-heatmap-control-group,
      body.desktop-widget-stats-page .stats-heatmap-target-control,
      body.desktop-widget-stats-page
        .stats-heatmap-control-group
        :is(.tree-select, .native-select-enhancer, .tree-select-button, input, select) {
        min-width: 0;
        max-width: 100%;
      }
    `;
    document.head.appendChild(style);
  }

  document.querySelector(".stats-shell > h3")?.remove();
}

function ensureElectronStatsCompatibilityStyles() {
  if (
    !IS_ELECTRON_DESKTOP ||
    document.getElementById(STATS_ELECTRON_COMPAT_STYLE_ID)
  ) {
    return;
  }

  const style = document.createElement("style");
  style.id = STATS_ELECTRON_COMPAT_STYLE_ID;
  style.textContent = `
    body.controler-electron-window.page-stats :is(
      .stats-shell,
      .stats-toolbar-group,
      .stats-section-panel,
      .weekly-glass-shell,
      .weekly-glass-table thead th,
      .weekly-glass-table .weekly-glass-header-cell,
      .weekly-glass-cell,
      .weekly-glass-time-cell,
      .weekly-glass-timeline
    ) {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    body.controler-electron-window.page-stats .weekly-glass-shell {
      background:
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.035),
          rgba(255, 255, 255, 0.01)
        ),
        color-mix(in srgb, var(--panel-bg) 88%, transparent) !important;
    }

    body.controler-electron-window.page-stats .weekly-glass-time-block,
    body.controler-electron-window.page-stats .weekly-glass-time-block::before,
    body.controler-electron-window.page-stats .weekly-glass-time-block::after {
      transition: none !important;
      animation: none !important;
      filter: none !important;
    }

    body.controler-electron-window.page-stats .weekly-glass-time-block::before,
    body.controler-electron-window.page-stats .weekly-glass-time-block::after {
      content: none !important;
    }

    body.controler-electron-window.page-stats .weekly-glass-block-layer,
    body.controler-electron-window.page-stats .weekly-glass-time-block > * {
      pointer-events: none !important;
    }

    body.controler-electron-window.page-stats .weekly-glass-cell:hover,
    body.controler-electron-window.page-stats .weekly-glass-timeline:hover,
    body.controler-electron-window.page-stats .weekly-glass-time-block:hover,
    body.controler-electron-window.page-stats .weekly-glass-time-block:active {
      transform: none !important;
      box-shadow: none !important;
      filter: none !important;
    }
  `;
  document.head.appendChild(style);
}

function readTableScaleSettings() {
  try {
    return JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("读取统计页尺寸设置失败:", error);
    return {};
  }
}

function isCompactMobileLayout() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const currentMode = isCompactMobileLayout.__currentMode;

  if (typeof currentMode !== "boolean") {
    const initialMode = width <= MOBILE_LAYOUT_MAX_WIDTH;
    isCompactMobileLayout.__currentMode = initialMode;
    return initialMode;
  }

  if (currentMode) {
    if (width >= MOBILE_LAYOUT_MAX_WIDTH + MOBILE_LAYOUT_HYSTERESIS_PX) {
      isCompactMobileLayout.__currentMode = false;
    }
  } else if (width <= MOBILE_LAYOUT_MAX_WIDTH - MOBILE_LAYOUT_HYSTERESIS_PX) {
    isCompactMobileLayout.__currentMode = true;
  }

  return isCompactMobileLayout.__currentMode;
}

function shouldHideWeeklyGridInlineLabels() {
  return IS_ANDROID_NATIVE_STATS_RUNTIME || isCompactMobileLayout();
}

function getWeeklyTimeColumnFontSize(scale, timeColumnWidth) {
  return Math.max(
    8,
    Math.min(
      14,
      Math.round(
        Math.min(
          11 * Math.max(Number(scale) || 1, MOBILE_TABLE_SCALE_RATIO),
          (Math.max(Number(timeColumnWidth) || 0, 0) - 6) * 0.24,
        ),
      ),
    ),
  );
}

function getExpandWidthFactor(mobileFactor = null) {
  const baseFactor = uiTools?.getDefaultExpandSurfaceWidthFactor?.() ?? 0.75;
  if (!isCompactMobileLayout() || !Number.isFinite(mobileFactor)) {
    return baseFactor;
  }
  return (
    uiTools?.normalizeExpandSurfaceWidthFactor?.(mobileFactor, baseFactor) ||
    mobileFactor
  );
}

function scaleExpandConstraint(value, widthFactor) {
  return (
    uiTools?.scaleExpandSurfaceConstraint?.(value, widthFactor) ||
    Math.max(0, Math.round(Number(value || 0) * Number(widthFactor || 1)))
  );
}

function getMobileResponsiveScaleFactor(tableKey = "") {
  if (!isCompactMobileLayout()) return 1;
  const extraShrinkRatio = MOBILE_NO_EXTRA_TABLE_SHRINK_KEYS.has(tableKey)
    ? 1
    : MOBILE_TABLE_EXTRA_SHRINK_RATIO;
  return MOBILE_TABLE_SCALE_RATIO * extraShrinkRatio;
}

function getTableScaleSetting(tableKey, fallback = 1) {
  const settings = readTableScaleSettings();
  const perScale = parseFloat(settings?.per?.[tableKey]);

  const safePer = Number.isFinite(perScale)
    ? Math.min(Math.max(perScale, 0.1), 2.2)
    : fallback;

  return Math.min(
    Math.max(safePer * getMobileResponsiveScaleFactor(tableKey), 0.1),
    2.2,
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createStatsHoverTooltip(text) {
  const tooltip = document.createElement("div");
  tooltip.textContent = text;
  tooltip.style.position = "fixed";
  tooltip.style.left = "0";
  tooltip.style.top = "0";
  tooltip.style.maxWidth = `${Math.min(260, Math.max(180, window.innerWidth - 24))}px`;
  tooltip.style.padding = "7px 10px";
  tooltip.style.borderRadius = "8px";
  tooltip.style.fontSize = "11px";
  tooltip.style.lineHeight = "1.45";
  tooltip.style.whiteSpace = "pre-line";
  tooltip.style.wordBreak = "break-word";
  tooltip.style.pointerEvents = "none";
  tooltip.style.background =
    "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), var(--panel-strong-bg)";
  tooltip.style.color = "var(--text-color)";
  tooltip.style.border = "1px solid var(--panel-border-color)";
  tooltip.style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.22)";
  if (!DISABLE_ELECTRON_STATS_GLASS_EFFECT) {
    tooltip.style.backdropFilter = "blur(14px) saturate(120%)";
    tooltip.style.webkitBackdropFilter = "blur(14px) saturate(120%)";
  }
  tooltip.style.zIndex = "5000";
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionStatsHoverTooltip(tooltip, anchorElement) {
  if (!tooltip || !anchorElement) return;

  const margin = 12;
  const gap = 10;
  const anchorRect = anchorElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const maxLeft = Math.max(
    margin,
    window.innerWidth - tooltipRect.width - margin,
  );
  const maxTop = Math.max(
    margin,
    window.innerHeight - tooltipRect.height - margin,
  );

  let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  left = clamp(left, margin, maxLeft);

  let top = anchorRect.top - tooltipRect.height - gap;
  if (top < margin) {
    top = anchorRect.bottom + gap;
  }
  top = clamp(top, margin, maxTop);

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function positionStatsPointerTooltip(tooltip, clientX, clientY) {
  if (!tooltip) return;

  const margin = 12;
  const gap = 14;
  const tooltipRect = tooltip.getBoundingClientRect();
  const maxLeft = Math.max(
    margin,
    window.innerWidth - tooltipRect.width - margin,
  );
  const maxTop = Math.max(
    margin,
    window.innerHeight - tooltipRect.height - margin,
  );

  let left = clientX + gap;
  if (left + tooltipRect.width > window.innerWidth - margin) {
    left = clientX - tooltipRect.width - gap;
  }
  left = clamp(left, margin, maxLeft);

  let top = clientY + gap;
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = clientY - tooltipRect.height - gap;
  }
  top = clamp(top, margin, maxTop);

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showStatsHoverTooltip(anchorElement, text) {
  hideStatsHoverTooltip(anchorElement);
  const tooltip = createStatsHoverTooltip(text);
  positionStatsHoverTooltip(tooltip, anchorElement);
  anchorElement.tooltip = tooltip;
}

function hideStatsHoverTooltip(anchorElement) {
  if (!anchorElement?.tooltip) return;
  anchorElement.tooltip.remove();
  anchorElement.tooltip = null;
}

function bindStatsHoverPreview(element, tooltipText, options = {}) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const {
    baseZIndex = "6",
    hoverZIndex = "10",
    hoverScale = "1.012",
    hoverShadow = "0 10px 24px rgba(0,0,0,0.18)",
    restTransform = DISABLE_ELECTRON_STATS_BLOCK_HOVER_EFFECT
      ? "none"
      : "scale(1)",
  } = options;
  const shouldAnimateHover = !DISABLE_ELECTRON_STATS_BLOCK_HOVER_EFFECT;
  const applyHoverState = (active) => {
    if (active) {
      element.style.transform = shouldAnimateHover
        ? `scale(${hoverScale})`
        : restTransform;
      element.style.zIndex = hoverZIndex;
      element.style.boxShadow = shouldAnimateHover ? hoverShadow : "none";
      if (tooltipText) {
        showStatsHoverTooltip(element, tooltipText);
      }
      return;
    }

    element.style.transform = restTransform;
    element.style.zIndex = baseZIndex;
    element.style.boxShadow = "none";
    hideStatsHoverTooltip(element);
  };

  element.addEventListener("pointerenter", () => {
    applyHoverState(true);
  });
  element.addEventListener("pointerleave", () => {
    applyHoverState(false);
  });
  element.addEventListener("blur", () => {
    applyHoverState(false);
  });
  element.addEventListener("pointercancel", () => {
    applyHoverState(false);
  });
}

function getDateOnly(dateValue) {
  const date =
    dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekStartDate(dateValue) {
  const date = getDateOnly(dateValue);
  if (!date) return null;
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getWeekEndDate(dateValue) {
  const weekStart = getWeekStartDate(dateValue);
  if (!weekStart) return null;
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return end;
}

function getMonthStartDate(dateValue) {
  const date = getDateOnly(dateValue);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEndDate(dateValue) {
  const date = getDateOnly(dateValue);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getYearStartDate(dateValue) {
  const date = getDateOnly(dateValue);
  if (!date) return null;
  return new Date(date.getFullYear(), 0, 1);
}

function getYearEndDate(dateValue) {
  const date = getDateOnly(dateValue);
  if (!date) return null;
  return new Date(date.getFullYear(), 11, 31);
}

function isHeatmapToolbarViewMode(viewMode = statsViewMode) {
  return getStatsToolbarViewValue(viewMode) === "heatmap";
}

function getSafeHeatmapMonthCount() {
  return clamp(parseInt(heatmapState.monthCount, 10) || 1, 1, 12);
}

function getHeatmapYearAnchor(
  yearValue,
  monthCount = getSafeHeatmapMonthCount(),
) {
  const parsedYear = Number.parseInt(yearValue, 10);
  const safeYear = Number.isFinite(parsedYear)
    ? parsedYear
    : new Date().getFullYear();
  return new Date(safeYear, Math.max(0, monthCount - 1), 1);
}

function getInitialStatsAnchorForView(viewMode = statsViewMode) {
  const today = getDateOnly(new Date());
  if (!isHeatmapToolbarViewMode(viewMode)) {
    return today;
  }

  return statsRememberedHeatmapRangeUnit === "year"
    ? getHeatmapYearAnchor(today.getFullYear())
    : new Date(today.getFullYear(), today.getMonth(), 1);
}

function getWidgetLaunchAnchorDate(payload = {}, fallbackDate = getDateOnly(new Date())) {
  const rawAnchorDate =
    typeof payload?.widgetAnchorDate === "string" && payload.widgetAnchorDate.trim()
      ? payload.widgetAnchorDate.trim()
      : typeof payload?.anchorDate === "string" && payload.anchorDate.trim()
        ? payload.anchorDate.trim()
        : "";
  return getDateOnly(rawAnchorDate) || getDateOnly(fallbackDate) || getDateOnly(new Date());
}

function normalizeStatsAnchorForView(
  unit,
  anchorDateValue,
  viewMode = statsViewMode,
) {
  const baseAnchor = getDateOnly(anchorDateValue) || getDateOnly(new Date());
  if (!isHeatmapToolbarViewMode(viewMode)) {
    return baseAnchor;
  }

  return new Date(baseAnchor.getFullYear(), baseAnchor.getMonth(), 1);
}

function getHeatmapRangeForAnchor(anchorDateValue) {
  const monthCount = getSafeHeatmapMonthCount();
  const endMonth = getDateOnly(anchorDateValue) || getDateOnly(new Date());
  const safeEndMonth = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
  const start = new Date(
    safeEndMonth.getFullYear(),
    safeEndMonth.getMonth() - monthCount + 1,
    1,
  );
  const end = new Date(
    safeEndMonth.getFullYear(),
    safeEndMonth.getMonth() + 1,
    0,
  );

  return {
    start,
    end,
  };
}

function rememberStatsRangeUnit(unit, viewMode = statsViewMode) {
  if (isHeatmapToolbarViewMode(viewMode)) {
    statsRememberedHeatmapRangeUnit = normalizeHeatmapRangeUnit(unit);
    return statsRememberedHeatmapRangeUnit;
  }

  statsRememberedGeneralRangeUnit = normalizeStatsRangeUnit(unit, "day");
  return statsRememberedGeneralRangeUnit;
}

function syncStatsTimeUnitOptions(select = null) {
  const unitSelect =
    select instanceof HTMLSelectElement
      ? select
      : document.getElementById("stats-range-unit-select");
  if (!(unitSelect instanceof HTMLSelectElement)) {
    return;
  }

  const heatmapView = isHeatmapToolbarViewMode();
  Array.from(unitSelect.options).forEach((optionNode) => {
    const optionValue = String(optionNode?.value || "").trim();
    optionNode.disabled =
      heatmapView && (optionValue === "day" || optionValue === "week");
  });

  const expectedUnit = heatmapView
    ? normalizeHeatmapRangeUnit(
        statsRangeState.unit || statsRememberedHeatmapRangeUnit,
      )
    : normalizeStatsRangeUnit(
        statsRangeState.unit || statsRememberedGeneralRangeUnit,
        "day",
      );

  if (unitSelect.value !== expectedUnit) {
    unitSelect.value = expectedUnit;
  }
  uiTools?.refreshEnhancedSelect?.(unitSelect);
}

function shouldUseWeeklyWindowForDayUnit() {
  return statsViewMode === "table";
}

function isSameDate(left, right) {
  const leftDate = getDateOnly(left);
  const rightDate = getDateOnly(right);

  return Boolean(
    leftDate && rightDate && leftDate.getTime() === rightDate.getTime(),
  );
}

function getStatsRangeForUnit(unit, anchorDateValue) {
  const safeUnit = normalizeStatsRangeUnit(unit, "day");
  const anchorDate = getDateOnly(anchorDateValue) || getDateOnly(new Date());
  if (
    isHeatmapToolbarViewMode() &&
    STATS_HEATMAP_RANGE_UNITS.has(normalizeHeatmapRangeUnit(safeUnit))
  ) {
    return getHeatmapRangeForAnchor(anchorDate);
  }

  switch (safeUnit) {
    case "week":
      return {
        start: getWeekStartDate(anchorDate),
        end: getWeekEndDate(anchorDate),
      };
    case "month":
      return {
        start: getMonthStartDate(anchorDate),
        end: getMonthEndDate(anchorDate),
      };
    case "year":
      return {
        start: getYearStartDate(anchorDate),
        end: getYearEndDate(anchorDate),
      };
    case "day":
      if (shouldUseWeeklyWindowForDayUnit()) {
        return {
          start: getWeekStartDate(anchorDate),
          end: getWeekEndDate(anchorDate),
        };
      }
      return {
        start: anchorDate,
        end: anchorDate,
      };
    default:
      return {
        start: anchorDate,
        end: anchorDate,
      };
  }
}

function shiftStatsAnchorDate(anchorDateValue, unit, amount) {
  const safeUnit = isHeatmapToolbarViewMode()
    ? normalizeHeatmapRangeUnit(unit)
    : normalizeStatsRangeUnit(unit, "day");
  const anchorDate =
    getDateOnly(anchorDateValue) || getInitialStatsAnchorForView();
  const nextAnchor = new Date(anchorDate);

  if (isHeatmapToolbarViewMode() && STATS_HEATMAP_RANGE_UNITS.has(safeUnit)) {
    nextAnchor.setMonth(
      nextAnchor.getMonth() + amount * getSafeHeatmapMonthCount(),
    );
    return new Date(nextAnchor.getFullYear(), nextAnchor.getMonth(), 1);
  }

  switch (safeUnit) {
    case "week":
      nextAnchor.setDate(nextAnchor.getDate() + amount * 7);
      break;
    case "month":
      nextAnchor.setMonth(nextAnchor.getMonth() + amount);
      break;
    case "year":
      nextAnchor.setFullYear(nextAnchor.getFullYear() + amount);
      break;
    case "day":
      nextAnchor.setDate(
        nextAnchor.getDate() +
          amount * (shouldUseWeeklyWindowForDayUnit() ? 7 : 1),
      );
      break;
    default:
      nextAnchor.setDate(nextAnchor.getDate() + amount);
      break;
  }

  return nextAnchor;
}

function resolveStatsAnchorFromInputs(unit, changeSource = "end") {
  const startValue = document.getElementById("start-date-select")?.value;
  const endValue = document.getElementById("end-date-select")?.value;
  const startDate = getDateOnly(startValue);
  const endDate = getDateOnly(endValue);
  const safeUnit = isHeatmapToolbarViewMode()
    ? normalizeHeatmapRangeUnit(unit)
    : normalizeStatsRangeUnit(unit, "day");

  if (isHeatmapToolbarViewMode() && STATS_HEATMAP_RANGE_UNITS.has(safeUnit)) {
    if (safeUnit === "year") {
      const referenceDate =
        changeSource === "start" ? startDate || endDate : endDate || startDate;
      return getHeatmapYearAnchor(
        (referenceDate || getDateOnly(new Date())).getFullYear(),
      );
    }

    if (changeSource === "start" && startDate) {
      return new Date(
        startDate.getFullYear(),
        startDate.getMonth() + getSafeHeatmapMonthCount() - 1,
        1,
      );
    }

    if (endDate) {
      return new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }
    if (startDate) {
      return new Date(
        startDate.getFullYear(),
        startDate.getMonth() + getSafeHeatmapMonthCount() - 1,
        1,
      );
    }
    return getInitialStatsAnchorForView();
  }

  if (safeUnit === "year" && startDate) {
    return getYearStartDate(startDate);
  }
  if (safeUnit === "month" && startDate) {
    return getMonthStartDate(startDate);
  }
  if (safeUnit === "week" && startDate) {
    return getWeekStartDate(startDate);
  }
  if (safeUnit === "day" && shouldUseWeeklyWindowForDayUnit() && startDate) {
    return startDate;
  }

  return startDate || endDate || getDateOnly(new Date());
}

function applyStatsRange(unit, anchorDateValue, shouldRender = true) {
  const safeUnit = isHeatmapToolbarViewMode()
    ? normalizeHeatmapRangeUnit(unit)
    : normalizeStatsRangeUnit(unit, "day");
  const anchorDate = normalizeStatsAnchorForView(safeUnit, anchorDateValue);
  const range = getStatsRangeForUnit(safeUnit, anchorDate);
  const startDateInput = document.getElementById("start-date-select");
  const endDateInput = document.getElementById("end-date-select");
  const unitSelect = document.getElementById("stats-range-unit-select");

  statsRangeState.unit = safeUnit;
  statsRangeState.anchorDate = anchorDate;
  rememberStatsRangeUnit(safeUnit);
  if (isHeatmapToolbarViewMode()) {
    heatmapState.currentMonthKey = formatMonthKey(range.end);
  }

  if (unitSelect) {
    unitSelect.value = safeUnit;
  }
  if (startDateInput) {
    startDateInput.value = formatDateInputValue(range.start);
  }
  if (endDateInput) {
    endDateInput.value = formatDateInputValue(range.end);
  }

  updateCurrentTimeRangeDisplay();
  syncStatsTimeUnitOptions(unitSelect);
  saveStatsUiStateToPreferences();

  if (shouldRender) {
    void refreshStatsRangeData(true);
  }
}

function applyStatsUiStateFromPreferences(
  preferences = statsPreferencesState,
) {
  const uiState = normalizeStatsUiState(preferences?.uiState);

  statsViewMode = uiState.viewMode;
  statsRememberedGeneralRangeUnit = uiState.generalRangeUnit;
  statsRememberedHeatmapRangeUnit = uiState.heatmapRangeUnit;
  timeTableLevelFilter = uiState.tableLevelFilter;
  pieChartState.selectionValue = uiState.pie.selectionValue;
  lineChartState.selectionValue = uiState.line.selectionValue;
  statsLegendCollapseState = {
    line: new Set(uiState.line.collapsedKeys),
    pie: new Set(uiState.pie.collapsedKeys),
  };
  heatmapState = {
    ...heatmapState,
    dataType: uiState.heatmap.dataType,
    projectFilter: uiState.heatmap.projectFilter,
    checkinItemId: uiState.heatmap.checkinItemId,
    monthCount: uiState.heatmap.monthCount,
  };
  statsRangeState.unit =
    statsViewMode === "heatmap"
      ? statsRememberedHeatmapRangeUnit
      : statsRememberedGeneralRangeUnit;
  statsRangeState.anchorDate = getInitialStatsAnchorForView(statsViewMode);
}

function saveStatsUiStateToPreferences() {
  const nextUiState = normalizeStatsUiState({
    viewMode: normalizeStatsViewMode(statsViewMode),
    generalRangeUnit: statsRememberedGeneralRangeUnit,
    heatmapRangeUnit: statsRememberedHeatmapRangeUnit,
    tableLevelFilter: timeTableLevelFilter,
    pie: {
      selectionValue: pieChartState.selectionValue,
      collapsedKeys: Array.from(getStatsLegendCollapseSet("pie")),
    },
    line: {
      selectionValue: lineChartState.selectionValue,
      collapsedKeys: Array.from(getStatsLegendCollapseSet("line")),
    },
    heatmap: {
      dataType: heatmapState.dataType,
      projectFilter: heatmapState.projectFilter,
      checkinItemId: heatmapState.checkinItemId,
      monthCount: heatmapState.monthCount,
    },
  });

  statsPreferencesState = normalizeStatsPreferences({
    ...statsPreferencesState,
    uiState: nextUiState,
  });
  saveStatsPreferencesToStorage();
}

function resolveWeeklyGridRange(startDateValue, endDateValue) {
  const today = getDateOnly(new Date());
  const rawStart = getDateOnly(startDateValue) || today;
  const rawEnd = getDateOnly(endDateValue) || today;
  let start = rawStart;
  let end = rawEnd;

  if (statsRangeState.unit === "day") {
    const anchor = getDateOnly(statsRangeState.anchorDate) || rawStart || today;
    start = getWeekStartDate(anchor) || rawStart;
    end = getWeekEndDate(anchor) || rawEnd;
  }

  if (start > end) {
    [start, end] = [end, start];
  }

  const dayCount =
    Math.floor((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

  if (dayCount < STATS_MIN_VISIBLE_DAYS) {
    const extendedEnd = new Date(start);
    extendedEnd.setDate(extendedEnd.getDate() + STATS_MIN_VISIBLE_DAYS - 1);
    return {
      start,
      end: extendedEnd,
      adjusted: "expanded",
      selectedDayCount: dayCount,
    };
  }

  if (dayCount <= STATS_MAX_VISIBLE_DAYS) {
    return {
      start,
      end,
      adjusted: false,
      selectedDayCount: dayCount,
    };
  }

  const cappedEnd = new Date(start);
  cappedEnd.setDate(cappedEnd.getDate() + STATS_MAX_VISIBLE_DAYS - 1);
  return {
    start,
    end: cappedEnd,
    adjusted: "capped",
    selectedDayCount: dayCount,
  };
}

function readViewResizeState(viewKey) {
  try {
    return JSON.parse(
      localStorage.getItem(`stats-view-size:${viewKey}`) || "{}",
    );
  } catch (error) {
    console.error("读取统计视图尺寸失败:", error);
    return {};
  }
}

function saveViewResizeState(viewKey, state) {
  try {
    localStorage.setItem(`stats-view-size:${viewKey}`, JSON.stringify(state));
  } catch (error) {
    console.error("保存统计视图尺寸失败:", error);
  }
}

function applyResizableViewShell(container, viewKey, defaults = {}) {
  const widgetMode = isStatsDesktopWidgetMode();
  const {
    minHeight = 460,
    minWidth = 0,
    height = 640,
    width = null,
  } = defaults;
  const saved = readViewResizeState(viewKey);

  const shell = document.createElement("div");
  shell.className = "resizable-panel stats-view-shell";
  shell.style.resize = "none";
  shell.style.overflow = "auto";
  shell.style.minHeight = `${minHeight}px`;
  shell.style.minWidth = `${minWidth}px`;
  shell.style.height = `${saved.height || height}px`;
  shell.style.maxWidth = "100%";
  shell.style.border = "1px solid var(--bg-tertiary)";
  shell.style.backgroundColor = "var(--bg-secondary)";
  shell.style.borderRadius = "14px";
  shell.style.padding = "10px";

  if (saved.width || width) {
    shell.style.width = saved.width ? `${saved.width}px` : width;
  } else {
    shell.style.width = "100%";
  }

  const content = document.createElement("div");
  content.className = "stats-view-content";
  content.style.minHeight = "100%";
  shell.appendChild(content);
  container.appendChild(shell);

  const persistSize = () => {
    saveViewResizeState(viewKey, {
      width: Math.round(shell.offsetWidth),
      height: Math.round(shell.offsetHeight),
    });
  };

  if (!widgetMode) {
    shell.addEventListener("mouseup", persistSize);
    shell.addEventListener("mouseleave", persistSize);
    window.addEventListener("beforeunload", persistSize);
  }

  return { shell, content };
}

function applyStatsPageFlowShell(shell, content, options = {}) {
  const widgetMode = isStatsDesktopWidgetMode();
  const { gap = 0, padding = "0", transparent = true } = options;
  shell.style.resize = "none";
  shell.style.display = "flex";
  shell.style.flexDirection = "column";
  shell.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  shell.style.width = "100%";
  shell.style.minWidth = "0";
  shell.style.height = widgetMode ? "100%" : "auto";
  shell.style.minHeight = "0";
  shell.style.maxHeight = widgetMode ? "100%" : "none";
  shell.style.padding = padding;
  shell.style.overflow = widgetMode ? "hidden" : "visible";

  if (transparent) {
    shell.style.background = "transparent";
    shell.style.border = "none";
    shell.style.boxShadow = "none";
  }

  content.style.display = "flex";
  content.style.flexDirection = "column";
  content.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  content.style.width = "100%";
  content.style.minWidth = "0";
  content.style.minHeight = widgetMode ? "0" : "auto";
  content.style.height = widgetMode ? "100%" : "auto";
  content.style.gap = typeof gap === "number" ? `${gap}px` : gap;
  content.style.overflow = widgetMode ? "hidden" : "visible";
}

function getStatsChartViewportHeight() {
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 800;
  const widgetMode = isStatsDesktopWidgetMode();
  const ratio = widgetMode ? 0.5 : isCompactMobileLayout() ? 0.38 : 0.48;
  const minHeight = widgetMode ? 220 : isCompactMobileLayout() ? 260 : 320;
  const maxHeight = widgetMode ? 440 : isCompactMobileLayout() ? 460 : 560;
  return `${Math.max(minHeight, Math.min(Math.round(viewportHeight * ratio), maxHeight))}px`;
}

function getStatsLoadScope() {
  const startValue = document.getElementById("start-date-select")?.value;
  const endValue = document.getElementById("end-date-select")?.value;
  if (startValue && endValue) {
    return {
      startDate: startValue,
      endDate: endValue,
    };
  }
  const range = getStatsRangeForUnit(
    statsRangeState.unit,
    statsRangeState.anchorDate,
  );
  return {
    startDate: formatDateInputValue(range.start),
    endDate: formatDateInputValue(range.end),
  };
}

let statsRangeDataRequestId = 0;

function applyStatsWorkspaceState(snapshot = {}) {
  records = Array.isArray(snapshot.records) ? snapshot.records : [];
  projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  statsPreferencesState = normalizeStatsPreferences(snapshot.preferences || {});
  statsLoadedRecordPeriodIds = Array.isArray(snapshot.loadedRecordPeriodIds)
    ? snapshot.loadedRecordPeriodIds.slice()
    : [];
  syncStatsDataIndex(["records", "projects"]);
}

async function readStatsWorkspace(scope = getStatsLoadScope(), options = {}) {
  const preferences = readStatsPreferencesFromStorage();
  try {
    if (typeof window.ControlerStorage?.getPageBootstrapState === "function") {
      const recordScope = getExpandedStatsRecordLoadScope(scope);
      const pageBootstrap = await window.ControlerStorage.getPageBootstrapState(
        "stats",
        {
          fresh: options?.fresh === true,
          recordScope,
        },
      );
      const data =
        pageBootstrap?.data && typeof pageBootstrap.data === "object"
          ? pageBootstrap.data
          : null;
      if (data) {
        const nextRecords = Array.isArray(data.defaultRangeRecordsOrAggregate)
          ? data.defaultRangeRecordsOrAggregate
          : [];
        return {
          preferences:
            data.statsPreferences && typeof data.statsPreferences === "object"
              ? data.statsPreferences
              : preferences,
          records: nextRecords,
          projects: Array.isArray(data.projects) ? data.projects : [],
          loadedRecordPeriodIds:
            Array.isArray(pageBootstrap.loadedPeriodIds) &&
            pageBootstrap.loadedPeriodIds.length
              ? pageBootstrap.loadedPeriodIds.slice()
              : [...new Set(nextRecords.map((record) => getStatsRecordPeriodId(record)))],
        };
      }
    }
    if (
      typeof window.ControlerStorage?.loadSectionRange === "function" &&
      typeof window.ControlerStorage?.getCoreState === "function"
    ) {
      const recordScope = getExpandedStatsRecordLoadScope(scope);
      const [recordsResult, coreState] = await Promise.all([
        window.ControlerStorage.loadSectionRange("records", recordScope),
        window.ControlerStorage.getCoreState(),
      ]);
      const nextRecords = Array.isArray(recordsResult?.items) ? recordsResult.items : [];
      return {
        preferences,
        records: nextRecords,
        projects: Array.isArray(coreState?.projects) ? coreState.projects : [],
        loadedRecordPeriodIds:
          Array.isArray(recordsResult?.periodIds) && recordsResult.periodIds.length
          ? recordsResult.periodIds.slice()
          : [...new Set(nextRecords.map((record) => getStatsRecordPeriodId(record)))],
      };
    }

    const savedRecords = localStorage.getItem("records");
    const savedProjects = localStorage.getItem("projects");
    const parsedRecords = savedRecords ? JSON.parse(savedRecords) : [];
    const parsedProjects = savedProjects ? JSON.parse(savedProjects) : [];
    return {
      preferences,
      records: Array.isArray(parsedRecords) ? parsedRecords : [],
      projects: Array.isArray(parsedProjects) ? parsedProjects : [],
      loadedRecordPeriodIds: [],
    };
  } catch (e) {
    console.error("加载数据失败:", e);
    return {
      preferences: createDefaultStatsPreferences(),
      records: [],
      projects: [],
      loadedRecordPeriodIds: [],
    };
  }
}

async function loadData(scope = getStatsLoadScope(), options = {}) {
  const snapshot = await readStatsWorkspace(scope, options);
  applyStatsWorkspaceState(snapshot);
  return snapshot;
}

async function refreshStatsRangeData(shouldRender = true) {
  const requestId = ++statsRangeDataRequestId;
  const scope = getStatsLoadScope();
  const mode = statsInitialDataLoaded ? "inline" : "fullscreen";
  const delayMs = statsInitialDataLoaded ? STATS_LOADING_OVERLAY_DELAY_MS : 0;
  const commitLoadedState = (snapshot) => {
    if (requestId !== statsRangeDataRequestId) {
      return;
    }
    applyStatsWorkspaceState(snapshot);
    if (shouldRender) {
      renderCurrentView();
    }
    statsInitialDataLoaded = true;
  };

  try {
    if (!statsRefreshController) {
      setStatsLoadingState({
        active: true,
        mode,
        delayMs,
        message: "正在更新统计范围与图表数据，请稍候",
      });
      const snapshot = await readStatsWorkspace(scope);
      commitLoadedState(snapshot);
      return;
    }

    const refreshResult = await statsRefreshController.run(
      () => readStatsWorkspace(scope),
      {
        delayMs,
        loadingOptions: {
          mode,
          message: "正在更新统计范围与图表数据，请稍候",
        },
        commit: async (snapshot) => {
          commitLoadedState(snapshot);
        },
      },
    );
    if (refreshResult?.stale) {
      return;
    }
  } finally {
    if (!statsRefreshController && requestId === statsRangeDataRequestId) {
      setStatsLoadingState({
        active: false,
      });
    }
  }
}


function initTimeSelector() {
  const startDate = document.getElementById("start-date-select");
  const endDate = document.getElementById("end-date-select");
  const prevBtn = document.getElementById("stats-range-prev");
  const nextBtn = document.getElementById("stats-range-next");
  const unitSelect = document.getElementById("stats-range-unit-select");

  if (!startDate || !endDate || !prevBtn || !nextBtn || !unitSelect) {
    return;
  }

  uiTools?.enhanceNativeSelect?.(unitSelect, {
    minWidth: 54,
    preferredMenuWidth: 140,
    maxMenuWidth: 180,
  });
  syncStatsTimeUnitOptions(unitSelect);

  unitSelect.addEventListener("change", () => {
    const nextUnit = isHeatmapToolbarViewMode()
      ? normalizeHeatmapRangeUnit(unitSelect.value)
      : normalizeStatsRangeUnit(unitSelect.value, "day");
    const nextAnchor = isHeatmapToolbarViewMode()
      ? resolveStatsAnchorFromInputs(nextUnit, "end")
      : getInitialStatsAnchorForView();
    applyStatsRange(nextUnit, nextAnchor);
  });

  prevBtn.addEventListener("click", () => {
    applyStatsRange(
      statsRangeState.unit,
      shiftStatsAnchorDate(
        statsRangeState.anchorDate ||
          resolveStatsAnchorFromInputs(statsRangeState.unit),
        statsRangeState.unit,
        -1,
      ),
    );
  });

  nextBtn.addEventListener("click", () => {
    applyStatsRange(
      statsRangeState.unit,
      shiftStatsAnchorDate(
        statsRangeState.anchorDate ||
          resolveStatsAnchorFromInputs(statsRangeState.unit),
        statsRangeState.unit,
        1,
      ),
    );
  });

  const handleDateChange = (changeSource) => {
    const nextAnchor =
      resolveStatsAnchorFromInputs(statsRangeState.unit, changeSource) ||
      getInitialStatsAnchorForView();
    statsRangeState.anchorDate = nextAnchor;

    if (isHeatmapToolbarViewMode()) {
      applyStatsRange(statsRangeState.unit, nextAnchor);
      return;
    }

    if (statsRangeState.unit === "day" && shouldUseWeeklyWindowForDayUnit()) {
      applyStatsRange(statsRangeState.unit, nextAnchor);
      return;
    }

    updateCurrentTimeRangeDisplay();
    void refreshStatsRangeData(true);
  };

  startDate.addEventListener("change", () => handleDateChange("start"));
  endDate.addEventListener("change", () => handleDateChange("end"));

  applyStatsRange(statsRangeState.unit, statsRangeState.anchorDate, false);
  updateCurrentTimeRangeDisplay();
}

// 更新时间范围显示
function updateCurrentTimeRangeDisplay() {
  const rangeElement = document.getElementById("current-time-range");
  if (!rangeElement) return;

  const startDate = document.getElementById("start-date-select");
  const endDate = document.getElementById("end-date-select");

  if (!startDate || !endDate) return;

  const start = startDate.value;
  const end = endDate.value;
  const unitLabels = {
    day: "天",
    week: "周",
    month: "月",
    year: "年",
  };

  let displayText = `显示: ${start}`;
  if (start !== end) {
    displayText += ` 至 ${end}`;
  }
  displayText += ` · ${unitLabels[statsRangeState.unit] || "天"}范围`;
  rangeElement.textContent = displayText;
}

function getSelectedStatsDateRange() {
  return {
    startDate: document.getElementById("start-date-select")?.value || "",
    endDate: document.getElementById("end-date-select")?.value || "",
  };
}

function formatStatsWidgetRecordTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return date.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderWidgetRecordList(container) {
  const widgetMode = isStatsDesktopWidgetMode();
  container.innerHTML = "";
  const { shell: viewShell, content: viewRoot } = applyResizableViewShell(
    container,
    "widget-record-list",
    {
      minHeight: 420,
      minWidth: 0,
      height: 560,
    },
  );
  applyStatsPageFlowShell(viewShell, viewRoot);

  const { startDate, endDate } = getSelectedStatsDateRange();
  const filteredRecords = filterRecordsByDateRange(startDate, endDate)
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left?.timestamp || 0).getTime();
      const rightTime = new Date(right?.timestamp || 0).getTime();
      return rightTime - leftTime;
    });

  const totalHours = filteredRecords.reduce((sum, record) => {
    return sum + parseSpendTimeToHours(record?.spendtime);
  }, 0);

  const summary = document.createElement("div");
  summary.style.display = "flex";
  summary.style.justifyContent = "space-between";
  summary.style.alignItems = "center";
  summary.style.flexWrap = "wrap";
  summary.style.gap = "12px";
  summary.style.padding = widgetMode ? "0 0 10px" : "0 0 14px";
  summary.innerHTML = `
    <div style="color: var(--text-color); font-size: 14px;">
      共 ${filteredRecords.length} 条记录
    </div>
    <div style="color: var(--accent-color); font-size: 14px; font-weight: 600;">
      ${Math.max(totalHours, 0).toFixed(2)} 小时
    </div>
  `;
  viewRoot.appendChild(summary);

  if (filteredRecords.length === 0) {
    viewRoot.innerHTML += `
      <div style="color: var(--muted-text-color); padding: 20px; text-align: center; border-radius: 12px; background-color: var(--bg-secondary);">
        当前范围内还没有时间记录
      </div>
    `;
    return;
  }

  const list = document.createElement("div");
  list.className = "stats-widget-record-list";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "10px";
  if (widgetMode) {
    list.style.flex = "1 1 auto";
    list.style.minHeight = "0";
    list.style.overflow = "auto";
    list.style.paddingRight = "2px";
  }

  filteredRecords.slice(0, 18).forEach((record) => {
    const item = document.createElement("div");
    item.style.display = "grid";
    item.style.gridTemplateColumns = "minmax(0, 1fr) auto";
    item.style.gap = "10px";
    item.style.alignItems = "center";
    item.style.padding = "12px 14px";
    item.style.borderRadius = "12px";
    item.style.backgroundColor = "var(--bg-secondary)";
    item.style.border = "1px solid var(--bg-tertiary)";
    item.innerHTML = `
      <div style="min-width: 0;">
        <div style="color: var(--text-color); font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${record?.name || "未命名项目"}
        </div>
        <div style="margin-top: 4px; color: var(--muted-text-color); font-size: 12px;">
          ${formatStatsWidgetRecordTime(record?.timestamp)}
        </div>
      </div>
      <div style="color: var(--accent-color); font-size: 13px; font-weight: 600; white-space: nowrap;">
        ${record?.spendtime || "未知时长"}
      </div>
    `;
    list.appendChild(item);
  });

  viewRoot.appendChild(list);
}

function getNormalizedStatsFilterRange(startDate, endDate) {
  const start = getDateOnly(startDate) || getDateOnly(new Date(0));
  const end = getDateOnly(endDate) || getDateOnly(new Date());
  const normalizedStart = start <= end ? new Date(start) : new Date(end);
  const normalizedEnd = start <= end ? new Date(end) : new Date(start);
  normalizedStart.setHours(0, 0, 0, 0);
  normalizedEnd.setHours(23, 59, 59, 999);
  return {
    start: normalizedStart,
    end: normalizedEnd,
    endExclusive: new Date(normalizedEnd.getTime() + 1),
  };
}

function getStatsRecordLoadScope(scope = {}) {
  const startValue = scope?.startDate || scope?.start || null;
  const endValue = scope?.endDate || scope?.end || null;
  const range = getNormalizedStatsFilterRange(startValue, endValue);
  const periodCursor = new Date(range.start);
  periodCursor.setDate(1);
  periodCursor.setHours(0, 0, 0, 0);

  const periodTarget = new Date(range.end);
  periodTarget.setDate(1);
  periodTarget.setHours(0, 0, 0, 0);

  const periodIds = [];
  while (periodCursor.getTime() <= periodTarget.getTime()) {
    periodIds.push(
      `${periodCursor.getFullYear()}-${String(periodCursor.getMonth() + 1).padStart(2, "0")}`,
    );
    periodCursor.setMonth(periodCursor.getMonth() + 1);
  }

  return {
    startDate: formatDateInputValue(range.start),
    endDate: formatDateInputValue(range.end),
    periodIds,
  };
}

function getExpandedStatsRecordLoadScope(scope = {}) {
  return getStatsRecordLoadScope(scope);
}

function getFilteredStatsTimeRecords(startDate, endDate) {
  const range = getNormalizedStatsFilterRange(startDate, endDate);
  return convertToTimeRecords().filter((record) => {
    if (!(record?.startTime instanceof Date) || !(record?.endTime instanceof Date)) {
      return false;
    }
    return (
      record.endTime.getTime() > range.start.getTime() &&
      record.startTime.getTime() < range.endExclusive.getTime()
    );
  });
}

function filterRecordsByDateRange(startDate, endDate) {
  const seenRecordKeys = new Set();
  return getFilteredStatsTimeRecords(startDate, endDate)
    .map((record) => ({
      key: record?.sourceRecordKey || "",
      rawRecord: record?.rawRecord || null,
    }))
    .filter((entry) => {
      if (!entry.rawRecord || seenRecordKeys.has(entry.key)) {
        return false;
      }
      seenRecordKeys.add(entry.key);
      return true;
    })
    .map((entry) => entry.rawRecord);
}

function createScopedStatsContext(filteredRecords = []) {
  if (!projectStatsApi?.createStatsContext) {
    return null;
  }

  return projectStatsApi.createStatsContext(projects, filteredRecords, {
    // Scoped stats must reflect only the currently filtered records and must not
    // fall back to cached full-cycle project totals when the range is empty.
    useStoredDurations: false,
  });
}

function buildChartStatsContext(startDate, endDate) {
  return createScopedStatsContext(filterRecordsByDateRange(startDate, endDate));
}

function buildChartProjectSelectorTree(allLabel = "全部项目（汇总）") {
  if (!projectStatsApi?.createStatsContext) {
    return buildProjectSelectorTree(allLabel);
  }
  return projectStatsApi
    .createStatsContext(projects, [])
    .buildChartSelectorTree(allLabel);
}

function ensureValidChartSelection(treeNodes, selectedValue) {
  const validValues = flattenProjectSelectorTree(treeNodes).map(
    (node) => node.value,
  );
  return validValues.includes(selectedValue)
    ? selectedValue
    : treeNodes[0]?.value || "summary:all";
}

function formatMsToHoursText(totalMs) {
  return formatStatsHoursText(Math.max(totalMs || 0, 0) / (1000 * 60 * 60), 2);
}

function getNormalizedStatsPeriodRange() {
  const { startDate, endDate } = getSelectedStatsDateRange();
  let start = getDateOnly(startDate) || getDateOnly(new Date());
  let end = getDateOnly(endDate) || getDateOnly(new Date());

  if (start > end) {
    [start, end] = [end, start];
  }

  const normalizedStart = new Date(start);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedEnd = new Date(end);
  normalizedEnd.setHours(23, 59, 59, 999);

  const dayCount = Math.max(
    1,
    Math.floor(
      (getDateOnly(end).getTime() - getDateOnly(start).getTime()) /
        (1000 * 3600 * 24),
    ) + 1,
  );

  return {
    start: normalizedStart,
    end: normalizedEnd,
    dayCount,
  };
}

function resolveProjectPeriodMatchedRecords(
  selectionValue,
  filteredRecords,
  statsContext,
  breakdownTree,
) {
  if (
    !statsContext ||
    !Array.isArray(filteredRecords) ||
    filteredRecords.length === 0
  ) {
    return [];
  }

  const selection =
    typeof statsContext.parseSelectionValue === "function"
      ? statsContext.parseSelectionValue(selectionValue)
      : { type: "summary", levelFilter: "all" };

  if (selection?.type === "project" && selection.projectId) {
    const selectedProjectIds =
      typeof statsContext.collectProjectSubtreeIds === "function"
        ? statsContext.collectProjectSubtreeIds(selection.projectId)
        : new Set([String(selection.projectId)]);
    return filteredRecords.filter((record) => {
      const project = statsContext.findProjectForRecord?.(record);
      return !!project && selectedProjectIds.has(String(project.id || ""));
    });
  }

  const matchTargets = Array.isArray(breakdownTree?.children)
    ? breakdownTree.children.filter((item) => item && item.matchMode)
    : [];
  if (
    matchTargets.length === 0 ||
    typeof statsContext.matchesRecord !== "function"
  ) {
    return [];
  }

  return filteredRecords.filter((record) =>
    matchTargets.some((item) => statsContext.matchesRecord(record, item)),
  );
}

function calculateProjectPeriodSummary(selectionValue, selectionLabel) {
  const range = getNormalizedStatsPeriodRange();
  const fallbackLabel = "全部项目（汇总）";
  const filteredRecords = filterRecordsByDateRange(range.start, range.end);
  let totalMs = 0;
  let activeDayCount = 0;

  if (projectStatsApi?.createStatsContext) {
    const statsContext = createScopedStatsContext(filteredRecords);
    if (!statsContext) {
      return {
        label: selectionLabel || fallbackLabel,
        totalMs: 0,
        averagePerDayMs: 0,
        averagePerActiveDayMs: 0,
        activeDayCount: 0,
        dayCount: range.dayCount,
        range,
      };
    }
    const breakdownTree = statsContext.buildBreakdownTree(selectionValue, {
      includeZero: true,
    });
    totalMs = Math.max(0, breakdownTree?.valueMs || 0);
    const matchedRecords = resolveProjectPeriodMatchedRecords(
      selectionValue,
      filteredRecords,
      statsContext,
      breakdownTree,
    );
    const activeDaySet = new Set();
    matchedRecords.forEach((record) => {
      const date = getDateOnly(
        record?.timestamp || record?.startTime || record?.endTime,
      );
      if (date) {
        activeDaySet.add(formatDateInputValue(date));
      }
    });
    activeDayCount = activeDaySet.size;
  }

  return {
    label: selectionLabel || fallbackLabel,
    totalMs,
    averagePerDayMs: totalMs / Math.max(range.dayCount, 1),
    averagePerActiveDayMs: totalMs / Math.max(activeDayCount, 1),
    activeDayCount,
    dayCount: range.dayCount,
    range,
  };
}

function getHeatmapProjectPeriodSummary() {
  const treeNodes = buildProjectSelectorTree("全部项目（汇总）");
  const safeSelection = flattenProjectSelectorTree(treeNodes).some(
    (node) => node.value === heatmapState.projectFilter,
  )
    ? heatmapState.projectFilter
    : treeNodes[0]?.value || "all";
  const selectionNode = findProjectSelectorNode(treeNodes, safeSelection);

  return calculateProjectPeriodSummary(
    safeSelection === "all" ? "summary:all" : safeSelection,
    selectionNode?.triggerLabel || selectionNode?.label || "全部项目（汇总）",
  );
}

function getLineChartPeriodSummary() {
  const treeNodes = buildChartProjectSelectorTree("全部项目（汇总）");
  const safeSelection = ensureValidChartSelection(
    treeNodes,
    lineChartState.selectionValue,
  );
  const selectionNode = findProjectSelectorNode(treeNodes, safeSelection);

  return calculateProjectPeriodSummary(
    safeSelection,
    selectionNode?.triggerLabel || selectionNode?.label || "全部项目（汇总）",
  );
}

function shouldHideEquivalentSingleBreakdownNode(node, parentNode) {
  if (!node || !parentNode) {
    return false;
  }
  if (parentNode.kind !== "total" || node.kind !== "single") {
    return false;
  }
  if (String(parentNode.projectId || "") !== String(node.projectId || "")) {
    return false;
  }

  const parentValueMs = Number(parentNode.valueMs || 0);
  const childValueMs = Number(node.valueMs || 0);
  if (!Number.isFinite(parentValueMs) || !Number.isFinite(childValueMs)) {
    return false;
  }
  if (parentValueMs <= 0) {
    return false;
  }

  return Math.abs(parentValueMs - childValueMs) < 1;
}

function sanitizeBreakdownTreeForDisplay(tree) {
  const cloneNode = (node) => {
    if (!node || typeof node !== "object") {
      return null;
    }

    const nextNode = {
      ...node,
      subtreeIds:
        node.subtreeIds instanceof Set ? new Set(node.subtreeIds) : node.subtreeIds,
      children: [],
    };
    const nextChildren = Array.isArray(node.children)
      ? node.children.map((child) => cloneNode(child)).filter(Boolean)
      : [];
    nextNode.children = nextChildren.filter(
      (child) => !shouldHideEquivalentSingleBreakdownNode(child, nextNode),
    );
    nextNode.children.sort(compareStatsDurationDesc);
    return nextNode;
  };

  return cloneNode(tree);
}

function compareStatsDurationDesc(left, right) {
  const leftValue = Number(left?.valueMs || left?.totalHours || left?.hours || 0);
  const rightValue = Number(
    right?.valueMs || right?.totalHours || right?.hours || 0,
  );
  if (leftValue !== rightValue) {
    return rightValue - leftValue;
  }

  const leftDepth = Number(left?.depth || 0);
  const rightDepth = Number(right?.depth || 0);
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  return String(left?.label || left?.name || "").localeCompare(
    String(right?.label || right?.name || ""),
    "zh-CN",
  );
}

function sortStatsLegendItemsByDuration(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareStatsDurationDesc);
}

function createStatsPeriodSummaryCard(summaryData, options = {}) {
  const { compact = false } = options;
  const card = document.createElement("section");
  card.className = "stats-period-summary";
  if (compact) {
    card.classList.add("is-compact");
  }

  const title = document.createElement("div");
  title.className = "stats-period-summary-title";
  title.textContent = localizeStatsUiText("当前筛选周期汇总");
  card.appendChild(title);

  const target = document.createElement("div");
  target.className = "stats-period-summary-target";
  const targetText = String(summaryData?.label || "全部项目（汇总）");
  target.textContent = targetText;
  target.title = targetText;
  card.appendChild(target);

  const metrics = document.createElement("div");
  metrics.className = "stats-period-summary-metrics";
  [
    {
      label: "日均时长",
      value: formatMsToHoursText(summaryData?.averagePerDayMs || 0),
    },
    {
      label: "实际日时长",
      value: formatMsToHoursText(summaryData?.averagePerActiveDayMs || 0),
    },
  ].forEach((item) => {
    const metric = document.createElement("div");
    metric.className = "stats-period-summary-item";

    const metricLabel = document.createElement("span");
    metricLabel.className = "stats-period-summary-label";
    metricLabel.textContent = localizeStatsUiText(item.label);

    const metricValue = document.createElement("strong");
    metricValue.className = "stats-period-summary-value";
    metricValue.textContent = item.value;

    metric.appendChild(metricLabel);
    metric.appendChild(metricValue);
    metrics.appendChild(metric);
  });

  card.appendChild(metrics);
  return card;
}

function getStatsLegendCollapseSet(stateKey = "line") {
  const key = stateKey === "pie" ? "pie" : "line";
  const current = statsLegendCollapseState[key];
  if (current instanceof Set) {
    return current;
  }
  const next = new Set(Array.isArray(current) ? current : []);
  statsLegendCollapseState[key] = next;
  return next;
}

function toggleStatsLegendCollapse(stateKey = "line", itemKey = "") {
  const safeItemKey = String(itemKey || "").trim();
  if (!safeItemKey) {
    return false;
  }
  const collapsedKeys = getStatsLegendCollapseSet(stateKey);
  if (collapsedKeys.has(safeItemKey)) {
    collapsedKeys.delete(safeItemKey);
  } else {
    collapsedKeys.add(safeItemKey);
  }
  saveStatsUiStateToPreferences();
  return collapsedKeys.has(safeItemKey);
}

function buildStatsLegendItemIndex(items = []) {
  const itemsByKey = new Map();
  const childCountByParent = new Map();

  items.forEach((item) => {
    const itemKey = String(item?.key || "").trim();
    if (!itemKey || itemsByKey.has(itemKey)) {
      return;
    }
    itemsByKey.set(itemKey, item);
  });

  items.forEach((item) => {
    const itemKey = String(item?.key || "").trim();
    const parentKey = String(item?.parentKey || "").trim();
    if (!itemKey || !parentKey || !itemsByKey.has(parentKey)) {
      return;
    }
    childCountByParent.set(parentKey, (childCountByParent.get(parentKey) || 0) + 1);
  });

  return {
    itemsByKey,
    childCountByParent,
  };
}

function hasCollapsedLegendAncestor(item, itemsByKey, collapsedKeys) {
  let parentKey = String(item?.parentKey || "").trim();
  while (parentKey) {
    if (collapsedKeys.has(parentKey)) {
      return true;
    }
    parentKey = String(itemsByKey.get(parentKey)?.parentKey || "").trim();
  }
  return false;
}

function getVisibleStatsLegendItems(items = [], stateKey = "line") {
  const collapsedKeys = getStatsLegendCollapseSet(stateKey);
  const { itemsByKey } = buildStatsLegendItemIndex(items);
  return items.filter((item) => {
    const itemKey = String(item?.key || "").trim();
    return !!itemKey && !hasCollapsedLegendAncestor(item, itemsByKey, collapsedKeys);
  });
}

function pruneStatsBreakdownTreeByCollapseState(tree, stateKey = "pie") {
  if (!tree || typeof tree !== "object") {
    return tree;
  }
  const collapsedKeys = getStatsLegendCollapseSet(stateKey);

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return null;
    }
    const nodeKey = String(node.key || "").trim();
    const shouldCollapseChildren = nodeKey && collapsedKeys.has(nodeKey);
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const nextChildren = shouldCollapseChildren
      ? []
      : rawChildren.map((child) => visit(child)).filter(Boolean);
    return {
      ...node,
      children: nextChildren,
    };
  };

  return visit(tree);
}

function renderStatsHierarchyLegend(container, items = [], options = {}) {
  if (!container) return;

  container.innerHTML = "";
  container.hidden = !items.length;
  if (!items.length) {
    return;
  }

  const { variant = "pie", stateKey = variant === "pie" ? "pie" : "line" } = options;
  const { childCountByParent } = buildStatsLegendItemIndex(items);
  const collapsedKeys = getStatsLegendCollapseSet(stateKey);
  const visibleItems = getVisibleStatsLegendItems(items, stateKey);

  visibleItems.forEach((item) => {
    const itemKey = String(item?.key || "").trim();
    if (!itemKey) {
      return;
    }
    const expandable = (childCountByParent.get(itemKey) || 0) > 0;
    const collapsed = collapsedKeys.has(itemKey);

    const row = document.createElement("div");
    row.className = "stats-hierarchy-legend-row";
    if (expandable) {
      row.classList.add("is-expandable");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-expanded", collapsed ? "false" : "true");
      row.setAttribute("title", `${item.pathLabel || item.label || ""}\n单击折叠或展开子项目`);
    } else {
      row.title = item.pathLabel || item.label || "";
    }
    row.classList.toggle("is-collapsed", collapsed);
    row.style.setProperty(
      "--stats-legend-indent",
      `${Math.max(0, (item.depth || 1) - 1) * (isCompactMobileLayout() ? 10 : 14)}px`,
    );

    const left = document.createElement("div");
    left.className = "stats-hierarchy-legend-left";

    const caret = document.createElement("span");
    caret.className = "stats-hierarchy-legend-caret";
    caret.textContent = "▾";
    if (!expandable) {
      caret.style.visibility = "hidden";
    }
    left.appendChild(caret);

    if (variant === "line") {
      const swatch = document.createElement("span");
      swatch.className = "stats-line-legend-swatch";

      const line = document.createElement("span");
      line.className = "stats-line-legend-line";
      if (item.kind === "single") {
        line.classList.add("is-dashed");
      }
      line.style.borderTopColor = item.color || "var(--accent-color)";

      const dot = document.createElement("span");
      dot.className = "stats-line-legend-dot";
      dot.style.backgroundColor = item.color || "var(--accent-color)";

      swatch.appendChild(line);
      swatch.appendChild(dot);
      left.appendChild(swatch);
    } else {
      const dot = document.createElement("span");
      dot.className = "stats-hierarchy-legend-dot";
      dot.style.backgroundColor = item.color || "var(--accent-color)";
      left.appendChild(dot);
    }

    const label = document.createElement("span");
    label.className = "stats-hierarchy-legend-label";
    if (item.kind === "total") {
      label.classList.add("is-total");
    }
    label.textContent = item.label || "";
    left.appendChild(label);

    const right = document.createElement("span");
    right.className = "stats-hierarchy-legend-value";
    right.textContent = formatMsToHoursText(item.valueMs || 0);

    row.appendChild(left);
    row.appendChild(right);

    if (expandable) {
      const handleToggle = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleStatsLegendCollapse(stateKey, itemKey);
        if (typeof options?.onToggle === "function") {
          options.onToggle({
            item,
            stateKey,
          });
          return;
        }
        renderStatsHierarchyLegend(container, items, options);
      };

      row.addEventListener("click", handleToggle);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          handleToggle(event);
        }
      });
    }

    container.appendChild(row);
  });
}

function createLineChartLegend(container, datasets = [], options = {}) {
  const legendItems = Array.isArray(options?.legendItems)
    ? options.legendItems
    : datasets.map((dataset) => ({
        key: dataset?.legendKey || dataset?.label || "",
        parentKey: dataset?.legendParentKey || "",
        depth: dataset?.legendDepth || 1,
        label: dataset?.label || "",
        pathLabel: dataset?.legendPathLabel || dataset?.label || "",
        kind: dataset?.legendKind || "leaf",
        valueMs: dataset?.legendValueMs || 0,
        color:
          (Array.isArray(dataset?.borderColor)
            ? dataset.borderColor[0]
            : dataset?.borderColor || dataset?.backgroundColor) ||
          "var(--accent-color)",
      }));
  renderStatsHierarchyLegend(
    container,
    legendItems,
    {
      ...options,
      stateKey: "line",
      variant: "line",
    },
  );
}

function renderPieHierarchyChart(chartContainer, breakdownTree, options = {}) {
  if (!chartContainer) return;
  const widgetMode = isStatsDesktopWidgetMode();

  if (window.pieChart && typeof window.pieChart.destroy === "function") {
    window.pieChart.destroy();
    window.pieChart = null;
  }

  document
    .querySelectorAll(".stats-pie-hover-tooltip")
    .forEach((tooltipNode) => tooltipNode.remove());

  if (chartContainer._pieTooltip) {
    chartContainer._pieTooltip.remove();
    chartContainer._pieTooltip = null;
  }

  chartContainer.innerHTML = "";

  if (!(breakdownTree?.children || []).length) {
    chartContainer.innerHTML = `
      <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted-text-color); text-align: center; padding: 20px;">
        当前筛选条件下暂无可展示的项目时长
      </div>
    `;
    return;
  }

  if (typeof d3 === "undefined") {
    chartContainer.innerHTML = `
      <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted-text-color); text-align: center; padding: 20px;">
        D3 未加载，无法渲染层级饼状图
      </div>
    `;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "stats-pie-layout";
  const availableWidth = Math.max(chartContainer.clientWidth || 0, 320);
  const availableHeight = Math.max(
    chartContainer.clientHeight || 0,
    widgetMode ? 320 : 0,
    window.innerHeight || 660,
  );
  const useStackedLayout =
    isCompactMobileLayout() || availableWidth < (widgetMode ? 640 : 560);
  const legendReservedWidth = useStackedLayout ? 0 : widgetMode ? 252 : 290;
  const chartWidthBudget = Math.max(
    widgetMode ? 220 : 280,
    availableWidth - legendReservedWidth - (useStackedLayout ? 0 : 20),
  );
  const chartHeightBudget = Math.max(
    widgetMode ? 220 : 280,
    availableHeight - (useStackedLayout ? 148 : 20),
  );
  const chartSize = clamp(
    Math.round(Math.min(chartWidthBudget, chartHeightBudget)),
    widgetMode ? 220 : 280,
    widgetMode ? 400 : 430,
  );
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = useStackedLayout ? "column" : "row";
  wrapper.style.flexWrap = "nowrap";
  wrapper.style.alignItems = useStackedLayout ? "stretch" : "flex-start";
  wrapper.style.gap = widgetMode ? "12px" : "16px";
  wrapper.style.height = widgetMode ? "100%" : "auto";
  wrapper.style.minHeight = widgetMode ? "0" : "400px";

  const svgHost = document.createElement("div");
  svgHost.className = "stats-pie-canvas-host";
  svgHost.style.flex = useStackedLayout
    ? "1 1 auto"
    : widgetMode
      ? "1 1 280px"
      : "1 1 320px";
  svgHost.style.minWidth = useStackedLayout
    ? "0"
    : widgetMode
      ? "240px"
      : "280px";
  svgHost.style.minHeight = `${chartSize}px`;
  svgHost.style.display = "flex";
  svgHost.style.alignItems = "center";
  svgHost.style.justifyContent = "center";

  const legendHost = document.createElement("div");
  legendHost.className = "stats-pie-legend";
  legendHost.style.flex = useStackedLayout
    ? "0 0 auto"
    : widgetMode
      ? "0 1 240px"
      : "0 1 260px";
  legendHost.style.minWidth = useStackedLayout
    ? "0"
    : widgetMode
      ? "220px"
      : "240px";
  legendHost.style.maxWidth = "100%";
  legendHost.style.maxHeight = widgetMode ? "100%" : "none";
  legendHost.style.overflow =
    widgetMode || useStackedLayout ? "auto" : "visible";
  legendHost.style.paddingRight = "0";
  legendHost.style.display = "flex";
  legendHost.style.flexDirection = "column";
  legendHost.style.gap = isCompactMobileLayout() ? "6px" : "7px";

  wrapper.appendChild(svgHost);
  wrapper.appendChild(legendHost);
  chartContainer.appendChild(wrapper);

  const tooltip = document.createElement("div");
  tooltip.style.position = "fixed";
  tooltip.style.pointerEvents = "none";
  tooltip.style.opacity = "0";
  tooltip.style.transition = "opacity 120ms ease";
  tooltip.style.background = "var(--bg-secondary)";
  tooltip.style.color = "var(--text-color)";
  tooltip.style.border = "1px solid var(--accent-color)";
  tooltip.style.borderRadius = "10px";
  tooltip.style.padding = "8px 10px";
  tooltip.style.boxShadow = "0 10px 24px rgba(0,0,0,0.22)";
  tooltip.style.zIndex = "1200";
  tooltip.className = "stats-pie-hover-tooltip";
  tooltip.style.maxWidth = `${Math.min(280, Math.max(180, window.innerWidth - 24))}px`;
  tooltip.style.whiteSpace = "pre-line";
  tooltip.style.wordBreak = "break-word";
  document.body.appendChild(tooltip);
  chartContainer._pieTooltip = tooltip;

  const radius = Math.max(widgetMode ? 92 : 120, chartSize / 2 - 10);

  const toHierarchyNode = (node) => {
    const children = (node.children || []).map((child) =>
      toHierarchyNode(child),
    );
    return {
      ...node,
      displayMs: node.valueMs || 0,
      weightMs: children.length > 0 ? 0 : node.valueMs || 0,
      children,
    };
  };

  const hierarchyRoot = d3
    .hierarchy(toHierarchyNode(breakdownTree))
    .sum((node) => Math.max(node.weightMs || 0, 0));
  d3.partition().size([2 * Math.PI, hierarchyRoot.height + 1])(hierarchyRoot);

  const svg = d3
    .create("svg")
    .attr(
      "viewBox",
      `${-chartSize / 2} ${-chartSize / 2} ${chartSize} ${chartSize}`,
    )
    .style("width", `${chartSize}px`)
    .style("height", `${chartSize}px`)
    .style("max-width", "100%");

  const arc = d3
    .arc()
    .startAngle((node) => node.x0)
    .endAngle((node) => node.x1)
    .padAngle((node) => Math.min((node.x1 - node.x0) / 2, 0.007))
    .padRadius(radius * 1.1)
    .innerRadius((node) => (node.y0 / (hierarchyRoot.height + 1)) * radius)
    .outerRadius((node) =>
      Math.max(
        (node.y1 / (hierarchyRoot.height + 1)) * radius - 1,
        (node.y0 / (hierarchyRoot.height + 1)) * radius + 2,
      ),
    );

  const arcNodes = hierarchyRoot
    .descendants()
    .filter((node) => node.depth > 0 && node.x1 > node.x0 && node.value > 0);

  svg
    .append("g")
    .selectAll("path")
    .data(arcNodes)
    .join("path")
    .attr("d", arc)
    .attr("fill", (node) => node.data.color || "var(--accent-color)")
    .attr("stroke", "rgba(255, 255, 255, 0.26)")
    .attr("stroke-width", (node) => (node.data.kind === "single" ? 1.15 : 0.85))
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.97)
    .on("mouseenter", function (event, node) {
      const totalPercent =
        breakdownTree.valueMs > 0
          ? ((node.value / breakdownTree.valueMs) * 100).toFixed(1)
          : "0.0";
      const parentPercent =
        node.parent?.value > 0
          ? ((node.value / node.parent.value) * 100).toFixed(1)
          : "0.0";
      tooltip.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${node.data.label}</div>
        <div>时长：${formatMsToHoursText(node.data.displayMs || node.value || 0)}</div>
        <div>占整体：${totalPercent}%</div>
        <div>占上级：${parentPercent}%</div>
      `;
      tooltip.style.opacity = "1";
      positionStatsPointerTooltip(tooltip, event.clientX, event.clientY);
      d3.select(this)
        .attr("opacity", 1)
        .attr("stroke-width", node.data.kind === "single" ? 1.35 : 1.05);
    })
    .on("mousemove", (event) => {
      positionStatsPointerTooltip(tooltip, event.clientX, event.clientY);
    })
    .on("mouseleave", function (event, node) {
      tooltip.style.opacity = "0";
      d3.select(this)
        .attr("opacity", 0.97)
        .attr("stroke-width", node.data.kind === "single" ? 1.15 : 0.85);
    });

  svgHost.appendChild(svg.node());

  const legendItems = Array.isArray(options?.legendItems) ? options.legendItems : [];

  renderStatsHierarchyLegend(legendHost, legendItems, {
    onToggle: options?.onToggle,
    stateKey: "pie",
    variant: "pie",
  });
}

function getLineChartRangeMeta(startDate, endDate) {
  const startSeed = startDate ? new Date(startDate) : new Date();
  const endSeed = endDate ? new Date(endDate) : new Date();
  const normalizedStart = startSeed <= endSeed ? startSeed : endSeed;
  const normalizedEnd = startSeed <= endSeed ? endSeed : startSeed;

  normalizedStart.setHours(0, 0, 0, 0);
  normalizedEnd.setHours(23, 59, 59, 999);

  const daysDiff =
    Math.floor(
      (normalizedEnd.getTime() - normalizedStart.getTime()) /
        (1000 * 3600 * 24),
    ) + 1;

  const mode =
    daysDiff <= 1
      ? "hour"
      : daysDiff <= 31
        ? "day"
        : daysDiff <= 365
          ? "week"
          : "month";
  const labels = [];

  if (mode === "hour") {
    for (let hour = 0; hour < 24; hour += 4) {
      labels.push(formatStatsHourBucketLabel(hour, hour + 4));
    }
  } else if (mode === "day") {
    for (let offset = 0; offset < daysDiff; offset += 1) {
      const current = new Date(normalizedStart);
      current.setDate(normalizedStart.getDate() + offset);
      labels.push(`${current.getMonth() + 1}/${current.getDate()}`);
    }
  } else if (mode === "week") {
    const weekCount = Math.ceil(daysDiff / 7);
    for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
      const current = new Date(normalizedStart);
      current.setDate(normalizedStart.getDate() + weekIndex * 7);
      labels.push(formatStatsWeekBucketLabel(current));
    }
  } else {
    const monthCount =
      (normalizedEnd.getFullYear() - normalizedStart.getFullYear()) * 12 +
      (normalizedEnd.getMonth() - normalizedStart.getMonth()) +
      1;
    for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
      const current = new Date(
        normalizedStart.getFullYear(),
        normalizedStart.getMonth() + monthIndex,
        1,
      );
      labels.push(`${current.getFullYear()}/${current.getMonth() + 1}`);
    }
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
    labels,
    mode,
  };
}

function getLineChartBucketIndex(recordDate, rangeMeta) {
  if (!(recordDate instanceof Date) || Number.isNaN(recordDate.getTime())) {
    return -1;
  }

  if (recordDate < rangeMeta.start || recordDate > rangeMeta.end) {
    return -1;
  }

  if (rangeMeta.mode === "hour") {
    return Math.min(5, Math.floor(recordDate.getHours() / 4));
  }

  if (rangeMeta.mode === "day") {
    return Math.floor(
      (new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate(),
      ).getTime() -
        rangeMeta.start.getTime()) /
        (1000 * 3600 * 24),
    );
  }

  if (rangeMeta.mode === "week") {
    return Math.floor(
      (new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate(),
      ).getTime() -
        rangeMeta.start.getTime()) /
        (1000 * 3600 * 24 * 7),
    );
  }

  return (
    (recordDate.getFullYear() - rangeMeta.start.getFullYear()) * 12 +
    (recordDate.getMonth() - rangeMeta.start.getMonth())
  );
}

function buildLineDataset(label, values, color) {
  return {
    label,
    data: values.map((value) => Number(value.toFixed(2))),
    borderColor: color,
    backgroundColor: `${color}20`,
    tension: 0.3,
    fill: false,
  };
}

function accumulateLineChartValues(rangeMeta, matcher) {
  const values = Array.from({ length: rangeMeta.labels.length }, () => 0);

  records.forEach((record) => {
    if (!record?.timestamp || !record?.spendtime) return;

    const recordDate = new Date(record.timestamp);
    const bucketIndex = getLineChartBucketIndex(recordDate, rangeMeta);
    if (bucketIndex < 0 || bucketIndex >= values.length) return;

    const project = findProjectForRecord(record);
    if (!matcher(record, project)) return;

    values[bucketIndex] += parseSpendTimeToHours(record.spendtime);
  });

  return values;
}

function getLineChartProjectsByTotal(rangeMeta, options = {}) {
  const { level = null, subtree = false, limit = 5 } = options;
  const hierarchy = buildProjectHierarchyIndex();
  const totals = [];

  const candidates = subtree
    ? hierarchy.roots.filter((node) => (parseInt(node.level, 10) || 1) === 1)
    : projects.filter((project) => {
        if (!project || typeof project !== "object") return false;
        if (level === null) return true;
        return (parseInt(project.level, 10) || 1) === level;
      });

  candidates.forEach((project, index) => {
    const projectId = String(project.id || "");
    const subtreeIds =
      subtree && projectId
        ? collectProjectSubtreeIds(projectId, hierarchy)
        : null;
    const total = accumulateLineChartValues(rangeMeta, (record, linkedProject) => {
      if (!linkedProject) return false;
      if (subtreeIds) {
        const linkedProjectId = String(linkedProject.id || "");
        if (linkedProjectId && subtreeIds.has(linkedProjectId)) {
          return true;
        }
        return !linkedProjectId && linkedProject.name === project.name;
      }
      const linkedProjectId = String(linkedProject.id || "");
      if (projectId && linkedProjectId) {
        return linkedProjectId === projectId;
      }
      return linkedProject.name === project.name;
    }).reduce((sum, value) => sum + value, 0);

    if (total > 0) {
      totals.push({
        project,
        total,
        color:
          project.color ||
          LINE_CHART_COLOR_POOL[index % LINE_CHART_COLOR_POOL.length],
      });
    }
  });

  return totals.sort((left, right) => right.total - left.total).slice(0, limit);
}

function accumulateFilteredLineChartValues(
  filteredRecords,
  statsContext,
  rangeMeta,
  displayItem,
) {
  const values = Array.from({ length: rangeMeta.labels.length }, () => 0);

  filteredRecords.forEach((record) => {
    const recordDate = new Date(record.timestamp);
    const bucketIndex = getLineChartBucketIndex(recordDate, rangeMeta);
    if (bucketIndex < 0 || bucketIndex >= values.length) return;
    if (!statsContext.matchesRecord(record, displayItem)) return;

    values[bucketIndex] +=
      projectStatsApi?.parseSpendTimeToHours?.(record.spendtime) ||
      parseSpendTimeToHours(record.spendtime);
  });

  return values;
}

function buildHierarchyLineDataset(item, values) {
  const baseColor = item.color || getProjectColor(item.label);
  return {
    legendKey: item.key,
    legendParentKey: item.parentKey || "",
    legendDepth: item.depth || 1,
    legendKind: item.kind || "leaf",
    legendPathLabel: item.pathLabel || item.label || "",
    legendValueMs: item.valueMs || 0,
    label: item.label,
    data: values.map((value) => Number(value.toFixed(2))),
    borderColor: baseColor,
    backgroundColor: baseColor,
    tension: 0.32,
    fill: false,
    borderWidth:
      item.kind === "total" ? 2.8 : item.kind === "single" ? 2.2 : 1.9,
    borderDash:
      item.kind === "single" ? [5, 3] : item.kind === "leaf" ? [3, 3] : [],
    pointRadius: 2.1,
    pointHoverRadius: 4.4,
    pointStyle: item.kind === "single" ? "rectRounded" : "circle",
    pointBackgroundColor: baseColor,
    pointBorderColor: "rgba(255, 255, 255, 0.88)",
    pointBorderWidth: 1,
  };
}

// 渲染当前视图
function renderCurrentView() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  destroyCalHeatmapInstance();
  if (window.pieChart && typeof window.pieChart.destroy === "function") {
    window.pieChart.destroy();
    window.pieChart = null;
  }
  if (window.lineChart && typeof window.lineChart.destroy === "function") {
    window.lineChart.destroy();
    window.lineChart = null;
  }
  container.innerHTML = "";

  const widgetRenderer = getStatsWidgetRendererConfig();
  if (widgetRenderer) {
    renderStatsSectionPanel(
      container,
      widgetRenderer.title,
      widgetRenderer.render,
    );
    return;
  }

  const renderers = {
    table: renderWeeklyTimeGrid,
    charts: renderCombinedCharts,
    heatmap: renderHeatmap,
    "record-list": renderWidgetRecordList,
    "day-pie": renderPieChart,
    "day-line": renderLineChart,
  };
  const safeMode = renderers[statsViewMode] ? statsViewMode : "table";
  if (safeMode === "charts") {
    const missingChart = typeof window.Chart === "undefined";
    const missingD3 = typeof window.d3 === "undefined";
    if (missingChart || missingD3) {
      renderStatsRuntimeMessage(
        container,
        STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
        "正在加载图表资源...",
      );
      void Promise.all([
        missingChart ? ensureStatsChartRuntimeLoaded() : Promise.resolve(),
        missingD3 ? ensureStatsD3RuntimeLoaded() : Promise.resolve(),
      ])
        .then(() => {
          if (statsViewMode === safeMode) {
            renderCurrentView();
          }
        })
        .catch((error) => {
          renderStatsRuntimeMessage(
            container,
            STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
            `图表资源加载失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }
  }
  if (safeMode === "day-line") {
    if (typeof window.Chart === "undefined") {
      renderStatsRuntimeMessage(
        container,
        STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
        "正在加载图表资源...",
      );
      void ensureStatsChartRuntimeLoaded()
        .then(() => {
          if (statsViewMode === safeMode) {
            renderCurrentView();
          }
        })
        .catch((error) => {
          renderStatsRuntimeMessage(
            container,
            STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
            `图表资源加载失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }
  }
  if (safeMode === "day-pie") {
    if (typeof window.d3 === "undefined") {
      renderStatsRuntimeMessage(
        container,
        STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
        "正在加载图表资源...",
      );
      void ensureStatsD3RuntimeLoaded()
        .then(() => {
          if (statsViewMode === safeMode) {
            renderCurrentView();
          }
        })
        .catch((error) => {
          renderStatsRuntimeMessage(
            container,
            STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
            `图表资源加载失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }
  }
  if (safeMode === "heatmap") {
    if (
      typeof window.d3 === "undefined" ||
      typeof window.CalHeatmap === "undefined"
    ) {
      renderStatsRuntimeMessage(
        container,
        STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
        "正在加载热图资源...",
      );
      void ensureStatsHeatmapRuntimeLoaded()
        .then(() => {
          if (statsViewMode === safeMode) {
            renderCurrentView();
          }
        })
        .catch((error) => {
          renderStatsRuntimeMessage(
            container,
            STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
            `热图资源加载失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }
  }
  renderStatsSectionPanel(
    container,
    STATS_VIEW_LABELS[safeMode] || STATS_VIEW_LABELS.table,
    renderers[safeMode] || renderers.table,
  );
}

function renderStatsSectionPanel(container, title, renderContent) {
  const widgetMode = isStatsDesktopWidgetMode();
  const section = document.createElement("section");
  section.className = "stats-section-panel";
  section.style.display = "flex";
  section.style.flexDirection = "column";
  section.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  section.style.alignSelf = "stretch";
  section.style.height = widgetMode ? "100%" : "auto";
  section.style.minHeight = "0";

  const titleNode = document.createElement("div");
  titleNode.className = "stats-section-title";
  titleNode.textContent = title;
  section.appendChild(titleNode);

  const body = document.createElement("div");
  body.className = "stats-section-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  body.style.height = widgetMode ? "100%" : "auto";
  body.style.minHeight = "0";
  section.appendChild(body);

  container.appendChild(section);
  try {
    renderContent(body);
  } catch (error) {
    console.error("渲染统计视图失败:", error);
    body.innerHTML = `
      <div style="padding: 22px; color: var(--muted-text-color); text-align: center;">
        当前视图渲染失败，请稍后重试
      </div>
    `;
  }
}

function setStatsChartCarouselActive(buttons, activeIndex) {
  buttons.forEach((button, index) => {
    const isActive = index === activeIndex;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function bindStatsChartCarousel(grid, buttons) {
  if (!grid || buttons.length === 0) return;

  const snapToNearestSlide = (behavior = "smooth") => {
    const slideWidth = grid.clientWidth || 1;
    const activeIndex = Math.min(
      buttons.length - 1,
      Math.max(0, Math.round(grid.scrollLeft / slideWidth)),
    );
    const targetSlide = grid.children[activeIndex];
    if (!targetSlide) return;
    targetSlide.scrollIntoView({
      behavior,
      block: "nearest",
      inline: "start",
    });
    setStatsChartCarouselActive(buttons, activeIndex);
  };

  const syncActive = () => {
    const slideWidth = grid.clientWidth || 1;
    const activeIndex = Math.min(
      buttons.length - 1,
      Math.max(0, Math.round(grid.scrollLeft / slideWidth)),
    );
    setStatsChartCarouselActive(buttons, activeIndex);
  };

  let frameId = 0;
  grid.addEventListener(
    "scroll",
    () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        syncActive();
        frameId = 0;
      });
    },
    { passive: true },
  );

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const targetSlide = grid.children[index];
      if (!targetSlide) return;
      targetSlide.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
      setStatsChartCarouselActive(buttons, index);
    });
  });

  if (window.ControlerUI?.bindHorizontalDragScroll && isCompactMobileLayout()) {
    window.ControlerUI.bindHorizontalDragScroll(grid, {
      enabled: isCompactMobileLayout,
      ignoreSelector:
        "button, input, select, textarea, a, label, .native-select-wrapper, .tree-select-menu, .tree-select-trigger",
      onRelease: () => snapToNearestSlide("smooth"),
    });
  }

  syncActive();
}

function renderCombinedCharts(container) {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "stats-dual-grid";
  const useMobileCarousel = false;
  if (useMobileCarousel) {
    grid.classList.add("stats-chart-carousel");
  }

  const buildChartColumn = (title, chartKey) => {
    const column = document.createElement("div");
    column.className = "stats-dual-grid-item";
    if (useMobileCarousel) {
      column.dataset.chartSlide = chartKey;
    }

    const titleNode = document.createElement("div");
    titleNode.className = "stats-subpanel-title";
    titleNode.textContent = title;
    column.appendChild(titleNode);

    const host = document.createElement("div");
    column.appendChild(host);
    grid.appendChild(column);
    return host;
  };

  const pieHost = buildChartColumn("饼状图", "pie");
  const lineHost = buildChartColumn("折线图", "line");
  container.appendChild(grid);

  if (useMobileCarousel) {
    const controls = document.createElement("div");
    controls.className = "stats-chart-carousel-controls";
    const buttons = [
      { label: "饼状图", key: "pie" },
      { label: "折线图", key: "line" },
    ].map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bts stats-chart-carousel-toggle";
      button.dataset.chartTarget = item.key;
      button.textContent = item.label;
      button.setAttribute("aria-pressed", "false");
      controls.appendChild(button);
      return button;
    });
    container.appendChild(controls);
    bindStatsChartCarousel(grid, buttons);
  }

  renderPieChart(pieHost);
  renderLineChart(lineHost);
}

// 动态时间表格（周视图）
function renderWeeklyTimeGrid(container) {
  const widgetMode = isStatsDesktopWidgetMode();
  container.innerHTML = "";
  const { shell: viewShell, content: viewRoot } = applyResizableViewShell(
    container,
    "weekly-grid",
    {
      minHeight: 560,
      minWidth: 0,
      height: 720,
    },
  );
  applyStatsPageFlowShell(viewShell, viewRoot);

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;

  if (!startDate || !endDate) return;

  const resolvedRange = resolveWeeklyGridRange(startDate, endDate);
  const start = resolvedRange.start;
  const end = resolvedRange.end;

  // 计算天数
  const timeDiff = end.getTime() - start.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

  if (daysDiff <= 0 || daysDiff > STATS_MAX_VISIBLE_DAYS) {
    viewRoot.innerHTML = `<div style="color: var(--text-color); padding: 20px; text-align: center">请选择合适的时间范围（表格视图最低显示 7 天，最多显示 14 天）</div>`;
    return;
  }

  const weeklyGridScale = Math.min(
    Math.max(getTableScaleSetting("statsWeeklyGrid", 1), 0.1),
    2.2,
  );

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "flex-start";
  header.style.gap = "16px";
  header.style.flexWrap = "wrap";
  header.style.padding = widgetMode ? "0 0 10px" : "0 0 14px";
  header.style.flex = "0 0 auto";

  const titleWrap = document.createElement("div");
  titleWrap.innerHTML = `
    <p style="margin: 6px 0 0 0; color: var(--muted-text-color); font-size: 14px">
      显示 ${formatDateInputValue(start)} 至 ${formatDateInputValue(end)}
    </p>
  `;

  const filterWrap = document.createElement("div");
  filterWrap.style.display = "flex";
  filterWrap.style.alignItems = "center";
  filterWrap.style.gap = "10px";
  filterWrap.style.flexWrap = "wrap";
  filterWrap.innerHTML = `
    <span style="color: var(--text-color); font-size: 14px">显示层级</span>
    <div id="weekly-grid-level-filter-host"></div>
  `;

  header.appendChild(titleWrap);
  header.appendChild(filterWrap);
  viewRoot.appendChild(header);

  renderProjectTreeSelector(
    header.querySelector("#weekly-grid-level-filter-host"),
    {
      selectedValue: timeTableLevelFilter,
      onChange: (value) => {
        timeTableLevelFilter = value;
        saveStatsUiStateToPreferences();
        renderWeeklyTimeGrid(container);
      },
      allLabel: "全部",
      minWidth: 120,
      treeNodes: buildLevelSelectorTree("全部"),
    },
  );

  // 创建时间表格
  const gridContainer = document.createElement("div");
  gridContainer.className = "weekly-glass-shell weekly-grid-size-shell";
  gridContainer.style.padding = "0";
  gridContainer.style.overflow = "hidden";
  gridContainer.style.minHeight = "0";
  gridContainer.style.height = "auto";
  gridContainer.style.flex = "0 0 auto";
  gridContainer.style.display = "flex";
  gridContainer.style.flexDirection = "column";

  const compactTimelineRatio = isCompactMobileLayout()
    ? 0.82
    : widgetMode
      ? 0.92
      : 1;
  const compactWidthRatio = isCompactMobileLayout()
    ? 0.9
    : widgetMode
      ? 0.94
      : 1;
  const compactMobileLayout = isCompactMobileLayout();
  const slotHeight = clamp(
    Math.round(30 * weeklyGridScale * compactTimelineRatio),
    12,
    108,
  );
  const baseTimeColumnWidth = clamp(
    Math.round(56 * weeklyGridScale * compactWidthRatio),
    30,
    112,
  );
  const colWidth = clamp(
    Math.round(82 * weeklyGridScale * compactWidthRatio),
    34,
    150,
  );
  const rowFontSize = Math.max(
    8,
    Math.round(12 * Math.max(weeklyGridScale, 0.72)),
  );
  const headerFontSize = Math.max(
    9,
    Math.round(11 * Math.max(weeklyGridScale, 0.78)),
  );
  const compactTimeColumnFontSize = Math.max(
    6,
    Math.min(
      getWeeklyTimeColumnFontSize(weeklyGridScale, baseTimeColumnWidth) - 3,
      Math.floor((baseTimeColumnWidth - 2) / 4.8),
    ),
  );
  const timeColumnWidth = compactMobileLayout
    ? Math.max(
        baseTimeColumnWidth,
        Math.ceil(compactTimeColumnFontSize * 6.8) + 8,
      )
    : baseTimeColumnWidth;
  const timeColumnFontSize = compactMobileLayout
    ? Math.max(
        6,
        Math.min(
          compactTimeColumnFontSize,
          Math.floor((timeColumnWidth - 1) / 4.9),
        ),
      )
    : Math.max(
        8,
        getWeeklyTimeColumnFontSize(weeklyGridScale, timeColumnWidth),
      );
  const totalTableWidth = timeColumnWidth + daysDiff * colWidth;
  const totalTimelineHeight = slotHeight * 24;
  gridContainer.style.minHeight = widgetMode ? "0" : `${totalTimelineHeight}px`;
  gridContainer.style.setProperty("--stats-slot-height", `${slotHeight}px`);
  viewShell.style.width = "100%";
  viewShell.style.minWidth = "0";
  gridContainer.style.width = "100%";
  gridContainer.style.maxWidth = "100%";
  gridContainer.style.minWidth = "0";
  gridContainer.style.alignSelf = "stretch";
  gridContainer.style.display = widgetMode ? "flex" : "block";
  gridContainer.style.boxSizing = "border-box";
  gridContainer.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  gridContainer.style.height = widgetMode ? "100%" : "auto";

  const scroller = document.createElement("div");
  scroller.className = "weekly-glass-scroller";
  scroller.classList.add("stats-table-horizontal-scroll");
  scroller.style.maxHeight = widgetMode ? "100%" : "none";
  scroller.style.width = "100%";
  scroller.style.boxSizing = "border-box";
  scroller.style.overflowX = "auto";
  scroller.style.overflowY = widgetMode ? "auto" : "visible";
  scroller.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  scroller.style.minHeight = widgetMode ? "0" : `${totalTimelineHeight}px`;
  scroller.style.height = widgetMode ? "100%" : "auto";
  scroller.style.touchAction = "auto";
  scroller.style.overscrollBehaviorX = "contain";
  if (isCompactMobileLayout()) {
    scroller.style.overflowY = "hidden";
    scroller.style.webkitOverflowScrolling = "touch";
  }

  const dates = [];
  const currentDate = new Date(start);
  const today = getDateOnly(new Date());
  for (let i = 0; i < daysDiff; i++) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + i);
    dates.push(date);
  }

  const weeklyGridSegmentsByCell = buildWeeklyGridSegmentsByCell(
    dates,
    timeTableLevelFilter,
  );
  const columnTemplate = `${timeColumnWidth}px repeat(${daysDiff}, ${colWidth}px)`;
  const surface = document.createElement("div");
  surface.style.width = `${totalTableWidth}px`;
  surface.style.minWidth = `${totalTableWidth}px`;
  surface.style.display = "flex";
  surface.style.flexDirection = "column";
  surface.style.position = "relative";
  surface.style.boxSizing = "border-box";

  const headerGrid = document.createElement("div");
  headerGrid.style.display = "grid";
  headerGrid.style.gridTemplateColumns = columnTemplate;
  headerGrid.style.width = `${totalTableWidth}px`;
  headerGrid.style.minWidth = `${totalTableWidth}px`;
  headerGrid.style.position = widgetMode ? "sticky" : "sticky";
  headerGrid.style.top = "0";
  headerGrid.style.zIndex = "4";
  headerGrid.style.boxSizing = "border-box";

  const timeHeader = document.createElement("div");
  timeHeader.textContent = "时间";
  timeHeader.className = "weekly-glass-header-cell";
  timeHeader.style.display = "flex";
  timeHeader.style.alignItems = "center";
  timeHeader.style.justifyContent = "center";
  timeHeader.style.padding = compactMobileLayout ? "6px 2px" : "7px 6px";
  timeHeader.style.color = "var(--text-color)";
  timeHeader.style.textAlign = "center";
  timeHeader.style.fontSize = `${Math.max(10, headerFontSize)}px`;
  timeHeader.style.whiteSpace = "nowrap";
  timeHeader.style.boxSizing = "border-box";
  timeHeader.style.borderRight =
    "1px solid color-mix(in srgb, var(--panel-border-color) 76%, transparent)";
  timeHeader.style.borderBottom =
    "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
  timeHeader.style.background =
    "linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)), color-mix(in srgb, var(--panel-strong-bg) 80%, transparent)";
  headerGrid.appendChild(timeHeader);

  dates.forEach((date, dayIndex) => {
    const isTodayColumn = isSameDate(date, today);
    const dayHeader = document.createElement("div");
    dayHeader.className = "weekly-glass-header-cell";
    if (isTodayColumn) {
      dayHeader.classList.add("weekly-glass-today-header");
      dayHeader.style.background =
        "linear-gradient(180deg, rgba(var(--accent-color-rgb), 0.22), rgba(var(--accent-color-rgb), 0.08)), color-mix(in srgb, var(--panel-strong-bg) 82%, rgba(var(--accent-color-rgb), 0.18))";
      dayHeader.style.boxShadow =
        "inset 0 0 0 1px rgba(var(--accent-color-rgb), 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(255, 255, 255, 0.02)";
    } else {
      dayHeader.style.background =
        "linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)), color-mix(in srgb, var(--panel-strong-bg) 80%, transparent)";
    }
    dayHeader.style.display = "flex";
    dayHeader.style.flexDirection = "column";
    dayHeader.style.alignItems = "center";
    dayHeader.style.justifyContent = "center";
    dayHeader.style.padding = "7px 4px";
    dayHeader.style.color = "var(--text-color)";
    dayHeader.style.textAlign = "center";
    dayHeader.style.fontSize = `${headerFontSize}px`;
    dayHeader.style.lineHeight = "1.22";
    dayHeader.style.boxSizing = "border-box";
    dayHeader.style.borderRight =
      dayIndex === daysDiff - 1
        ? "none"
        : "1px solid color-mix(in srgb, var(--panel-border-color) 76%, transparent)";
    dayHeader.style.borderBottom =
      "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
    dayHeader.innerHTML = `
      <div>${date.getMonth() + 1}/${date.getDate()}</div>
      <div>${getDayName(date.getDay())}</div>
      ${isTodayColumn ? '<div class="weekly-glass-today-badge">今天</div>' : ""}
    `;
    headerGrid.appendChild(dayHeader);
  });

  const table = document.createElement("div");
  table.className = "weekly-glass-table";
  table.style.width = `${totalTableWidth}px`;
  table.style.minWidth = `${totalTableWidth}px`;
  table.style.height = `${totalTimelineHeight}px`;
  table.style.minHeight = `${totalTimelineHeight}px`;
  table.style.fontSize = `${rowFontSize}px`;
  table.style.display = "grid";
  table.style.gridTemplateColumns = columnTemplate;
  table.style.gridTemplateRows = `repeat(24, ${slotHeight}px)`;
  table.style.position = "relative";
  table.style.boxSizing = "border-box";
  const weeklyGridCellRefs = new Map();

  // 每小时一行，从0点到24点
  for (let hour = 0; hour < 24; hour++) {
    const timeCell = document.createElement("div");
    timeCell.textContent = `${hour.toString().padStart(2, "0")}:00`;
    timeCell.style.padding = compactMobileLayout ? "1px 0" : "4px 3px";
    timeCell.className = "weekly-glass-time-cell";
    timeCell.style.color = "var(--text-color)";
    timeCell.style.textAlign = "center";
    timeCell.style.fontSize = `${timeColumnFontSize}px`;
    timeCell.style.fontVariantNumeric = "tabular-nums";
    timeCell.style.letterSpacing = "-0.02em";
    timeCell.style.lineHeight = "1.08";
    timeCell.style.whiteSpace = "nowrap";
    timeCell.style.overflow = "hidden";
    timeCell.style.textOverflow = "clip";
    timeCell.style.boxSizing = "border-box";
    timeCell.style.display = "flex";
    timeCell.style.alignItems = "center";
    timeCell.style.justifyContent = "center";
    timeCell.style.gridColumn = "1";
    timeCell.style.gridRow = `${hour + 1}`;
    timeCell.style.borderRight =
      "1px solid color-mix(in srgb, var(--panel-border-color) 76%, transparent)";
    timeCell.style.borderBottom =
      hour === 23
        ? "none"
        : "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
    table.appendChild(timeCell);

    // 每一天的单元格
    for (let dayIndex = 0; dayIndex < daysDiff; dayIndex++) {
      const dayDate = dates[dayIndex];
      const cell = document.createElement("div");
      cell.className = "weekly-glass-cell";
      if (isSameDate(dayDate, today)) {
        cell.classList.add("weekly-glass-today-cell");
      }
      cell.style.padding = "0";
      cell.style.position = "relative";
      cell.style.overflow = "visible";
      cell.style.boxSizing = "border-box";
      cell.style.gridColumn = `${dayIndex + 2}`;
      cell.style.gridRow = `${hour + 1}`;
      cell.style.borderRight =
        dayIndex === daysDiff - 1
          ? "none"
          : "1px solid color-mix(in srgb, var(--panel-border-color) 76%, transparent)";
      cell.style.borderBottom =
        hour === 23
          ? "none"
          : "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
      weeklyGridCellRefs.set(`${formatDateInputValue(dayDate)}-${hour}`, cell);
      table.appendChild(cell);
    }
  }

  scroller.style.position = "relative";
  surface.appendChild(headerGrid);
  surface.appendChild(table);
  scroller.appendChild(surface);
  gridContainer.appendChild(scroller);
  viewRoot.appendChild(gridContainer);

  renderWeeklyGridBlocksOverlay({
    scroller: table,
    table,
    cellRefs: weeklyGridCellRefs,
    segmentsByCell: weeklyGridSegmentsByCell,
    scale: weeklyGridScale,
  });

  // 添加图例
  const legend = document.createElement("div");
  legend.style.padding = "15px 0 0";
  legend.style.flex = "0 0 auto";
  legend.innerHTML = `
    <p style="margin: 0 0 10px 0; color: var(--text-color); font-size: 14px">
      <strong>图例：</strong> 每个色块代表一个时间段，鼠标悬停可查看详情，双击记录可编辑
    </p>
    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      ${getProjectColorsLegend({
        startDate,
        endDate,
        levelFilter: timeTableLevelFilter,
      })}
    </div>
  `;
  viewRoot.appendChild(legend);
}

function formatWeeklyGridSegmentRange(record) {
  return `${formatTime(record.displayStart || record.startTime)}-${formatTime(
    record.displayEnd || record.endTime,
  )}`;
}

function bindStatsRecordEditActivation(element, onActivate) {
  if (!(element instanceof HTMLElement) || typeof onActivate !== "function") {
    return;
  }
  if (element.__statsRecordActivationBound) {
    return;
  }
  element.__statsRecordActivationBound = true;

  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  element.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });

  element.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }

    const now = Date.now();
    const deltaX = Math.abs(event.clientX - lastTapX);
    const deltaY = Math.abs(event.clientY - lastTapY);
    const tappedTwice =
      now - lastTapAt <= DOUBLE_TAP_ACTIVATION_DELAY_MS &&
      deltaX <= DOUBLE_TAP_ACTIVATION_MOVE_TOLERANCE_PX &&
      deltaY <= DOUBLE_TAP_ACTIVATION_MOVE_TOLERANCE_PX;

    lastTapAt = now;
    lastTapX = event.clientX;
    lastTapY = event.clientY;

    if (!tappedTwice) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    lastTapAt = 0;
    onActivate();
  });
}

function buildStatsRecordLocator(record, sourceIndex) {
  const sourceId = String(record?.id || "").trim();
  const fingerprint = [
    record?.timestamp || "",
    record?.startTime || "",
    record?.endTime || "",
    record?.name || "",
    record?.spendtime || "",
    sourceIndex,
  ].join("|");

  return {
    recordRef: record,
    sourceId,
    sourceIndex,
    fingerprint,
  };
}

function getStatsRecordLocatorKey(locator) {
  if (locator?.sourceId) {
    return `id:${locator.sourceId}`;
  }
  return `fp:${locator?.fingerprint || ""}`;
}

function findStatsSourceRecordIndex(locator) {
  if (!locator || !Array.isArray(records)) {
    return -1;
  }

  const byReferenceIndex =
    locator.recordRef && typeof locator.recordRef === "object"
      ? records.indexOf(locator.recordRef)
      : -1;
  if (byReferenceIndex >= 0) {
    return byReferenceIndex;
  }

  if (locator.sourceId) {
    const byIdIndex = records.findIndex(
      (record) => String(record?.id || "") === locator.sourceId,
    );
    if (byIdIndex >= 0) {
      return byIdIndex;
    }
  }

  if (
    Number.isInteger(locator.sourceIndex) &&
    locator.sourceIndex >= 0 &&
    locator.sourceIndex < records.length
  ) {
    const candidateRecord = records[locator.sourceIndex];
    if (
      getStatsRecordLocatorKey(
        buildStatsRecordLocator(candidateRecord, locator.sourceIndex),
      ) === getStatsRecordLocatorKey(locator)
    ) {
      return locator.sourceIndex;
    }
  }

  return records.findIndex((record, index) => {
    return (
      buildStatsRecordLocator(record, index).fingerprint === locator.fingerprint
    );
  });
}

function saveStatsRecordsToStorage() {
  return queueStatsPersistenceTask(async () => {
    if (typeof window.ControlerStorage?.saveSectionRange === "function") {
      const periodIds = statsLoadedRecordPeriodIds.length
        ? statsLoadedRecordPeriodIds.slice()
        : [...new Set(records.map((record) => getStatsRecordPeriodId(record)))];
      await Promise.all(
        periodIds.map((periodId) =>
          window.ControlerStorage.saveSectionRange("records", {
            periodId,
            items: records.filter(
              (record) => getStatsRecordPeriodId(record) === periodId,
            ),
            mode: "replace",
          }),
        ),
      );
    } else {
      localStorage.setItem("records", JSON.stringify(records));
    }
    syncStatsDataIndex(["records"]);
    return true;
  }, "保存统计记录失败:");
}

function getStatsRecordPeriodId(record) {
  if (typeof window.ControlerStorageBundle?.getPeriodIdForSectionItem === "function") {
    return (
      window.ControlerStorageBundle.getPeriodIdForSectionItem("records", record) ||
      "undated"
    );
  }
  const anchor =
    record?.endTime || record?.timestamp || record?.startTime || "";
  return /^\d{4}-\d{2}/.test(anchor) ? anchor.slice(0, 7) : "undated";
}

function getStatsProjectPath(project) {
  if (!project) return "";
  const names = [project.name];
  let current = project;
  let safety = 0;

  while (current?.parentId && safety < 8) {
    const parent = projects.find(
      (item) => String(item?.id || "") === String(current.parentId || ""),
    );
    if (!parent) {
      break;
    }
    names.unshift(parent.name);
    current = parent;
    safety += 1;
  }

  return names.join("/");
}

function resolveStatsProjectNameFromInput(rawInput) {
  const normalizedInput = String(rawInput || "").trim();
  if (!normalizedInput) {
    return "";
  }

  const exactPathMatch = projects.find(
    (project) => getStatsProjectPath(project) === normalizedInput,
  );
  if (exactPathMatch) {
    return exactPathMatch.name;
  }

  if (normalizedInput.includes("/")) {
    return normalizedInput
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
  }

  return normalizedInput;
}

function getStatsRecordInputDisplayValue(record) {
  const project = findProjectForRecord(record);
  return project ? getStatsProjectPath(project) : record?.name || "";
}

async function openStatsRecordEditModal(locator) {
  const recordIndex = findStatsSourceRecordIndex(locator);
  if (recordIndex < 0) {
    if (uiTools?.alertDialog) {
      await uiTools.alertDialog({
        title: "未找到记录",
        message: "当前记录已不存在，请刷新后重试。",
        confirmText: "知道了",
        danger: true,
      });
    } else {
      window.alert("当前记录已不存在，请刷新后重试。");
    }
    void refreshStatsRangeData(true);
    return;
  }

  const sourceRecord = records[recordIndex];
  const timeRecord = convertToTimeRecords().find(
    (record) =>
      getStatsRecordLocatorKey(record.sourceLocator) ===
      getStatsRecordLocatorKey(locator),
  );
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "3200";
  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 22px; border-radius: 15px; width: min(520px, calc(100vw - 24px)); max-width: min(520px, calc(100vw - 24px)); max-height: calc(var(--controler-visual-viewport-height, 100vh) - 24px); overflow-y: auto;">
      <h3 style="margin: 0 0 16px 0; color: var(--text-color);">编辑记录</h3>
      <div style="display:flex; flex-direction:column; gap: 12px;">
        <label style="display:flex; flex-direction:column; gap:6px; color: var(--text-color);">
          <span>项目名称</span>
          <input id="stats-record-name-input" type="text" autocomplete="off" spellcheck="false" style="width:100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--bg-tertiary); background: var(--bg-quaternary); color: var(--text-color); font-size: 16px;" />
        </label>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; color: var(--muted-text-color); font-size: 13px;">
          <div class="ss" style="padding: 10px 12px; border-radius: 10px;">开始：${timeRecord ? `${formatDateInputValue(timeRecord.startTime)} ${formatTime(timeRecord.startTime)}` : "未知"}</div>
          <div class="ss" style="padding: 10px 12px; border-radius: 10px;">结束：${timeRecord ? `${formatDateInputValue(timeRecord.endTime)} ${formatTime(timeRecord.endTime)}` : "未知"}</div>
          <div class="ss" style="padding: 10px 12px; border-radius: 10px;">时长：${sourceRecord?.spendtime || timeRecord?.spendtime || "未知"}</div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top: 18px;">
        <button class="bts" type="button" id="stats-record-delete-btn" style="margin:0; background-color: var(--delete-btn);">删除</button>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="bts" type="button" id="stats-record-cancel-btn" style="margin:0;">收起</button>
          <button class="bts" type="button" id="stats-record-save-btn" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  uiTools?.stopModalContentPropagation?.(modal);

  const closeModal = () => {
    uiTools?.closeModal?.(modal);
  };
  const refreshAfterMutation = () => {
    closeModal();
    renderCurrentView();
  };
  const nameInput = modal.querySelector("#stats-record-name-input");
  const cancelBtn = modal.querySelector("#stats-record-cancel-btn");
  const saveBtn = modal.querySelector("#stats-record-save-btn");
  const deleteBtn = modal.querySelector("#stats-record-delete-btn");

  if (nameInput) {
    nameInput.value = getStatsRecordInputDisplayValue(sourceRecord);
    window.setTimeout(() => {
      nameInput.focus();
      nameInput.select?.();
    }, 0);
  }

  cancelBtn?.addEventListener("click", () => {
    closeModal();
  });

  saveBtn?.addEventListener("click", async () => {
    const nextName = resolveStatsProjectNameFromInput(nameInput?.value);
    if (!nextName) {
      if (uiTools?.alertDialog) {
        await uiTools.alertDialog({
          title: "无法保存记录",
          message: "请输入项目名称",
          confirmText: "知道了",
          danger: true,
        });
      } else {
        window.alert("请输入项目名称");
      }
      nameInput?.focus();
      return;
    }

    const liveRecordIndex = findStatsSourceRecordIndex(locator);
    if (liveRecordIndex < 0) {
      closeModal();
      void refreshStatsRangeData(true);
      return;
    }

    const nextProject =
      projects.find((project) => project.name === nextName) || null;
    records[liveRecordIndex] = {
      ...records[liveRecordIndex],
      name: nextName,
      projectId: nextProject?.id || null,
    };
    const persistPromise = saveStatsRecordsToStorage();
    refreshAfterMutation();
    await persistPromise;
  });

  deleteBtn?.addEventListener("click", async () => {
    const confirmed =
      (await uiTools?.confirmDialog?.({
        title: "删除记录",
        message: "确定要删除这条时间记录吗？",
        confirmText: "删除",
        cancelText: "取消",
        danger: true,
      })) ?? window.confirm("确定要删除这条时间记录吗？");
    if (!confirmed) {
      return;
    }

    const liveRecordIndex = findStatsSourceRecordIndex(locator);
    if (liveRecordIndex < 0) {
      closeModal();
      void refreshStatsRangeData(true);
      return;
    }

    records.splice(liveRecordIndex, 1);
    const persistPromise = saveStatsRecordsToStorage();
    refreshAfterMutation();
    await persistPromise;
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

function matchesWeeklyGridLevelFilter(
  record,
  levelFilter = timeTableLevelFilter,
) {
  if (levelFilter === "all") {
    return true;
  }
  const project = findProjectForRecord(record);
  return String(parseInt(project?.level, 10) || 1) === String(levelFilter);
}

function buildWeeklyGridSegmentsByCell(
  dates = [],
  levelFilter = timeTableLevelFilter,
) {
  const segmentMap = new Map();
  if (!Array.isArray(dates) || dates.length === 0) {
    return segmentMap;
  }

  const visibleDateKeys = new Set(
    dates.map((date) => formatDateInputValue(date)),
  );
  const rangeStart = new Date(
    dates[0].getFullYear(),
    dates[0].getMonth(),
    dates[0].getDate(),
    0,
    0,
    0,
    0,
  );
  const lastDate = dates[dates.length - 1];
  const rangeEnd = new Date(
    lastDate.getFullYear(),
    lastDate.getMonth(),
    lastDate.getDate() + 1,
    0,
    0,
    0,
    0,
  );

  convertToTimeRecords().forEach((record) => {
    if (
      !matchesWeeklyGridLevelFilter(record, levelFilter) ||
      record.endTime.getTime() <= rangeStart.getTime() ||
      record.startTime.getTime() >= rangeEnd.getTime()
    ) {
      return;
    }

    let cursor = new Date(
      Math.max(record.startTime.getTime(), rangeStart.getTime()),
    );
    const clippedEndTime = Math.min(
      record.endTime.getTime(),
      rangeEnd.getTime(),
    );

    while (cursor.getTime() < clippedEndTime) {
      const dayStart = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        0,
        0,
        0,
        0,
      );
      const dayKey = formatDateInputValue(dayStart);
      const nextDay = new Date(dayStart);
      nextDay.setDate(dayStart.getDate() + 1);
      const segmentEnd = new Date(Math.min(clippedEndTime, nextDay.getTime()));

      if (visibleDateKeys.has(dayKey)) {
        const cellKey = `${dayKey}-${cursor.getHours()}`;
        const segment = {
          ...record,
          displayStart: new Date(cursor),
          displayEnd: new Date(segmentEnd),
          durationMs: segmentEnd.getTime() - cursor.getTime(),
          segmentKey: `${record.sourceRecordKey}:${cursor.toISOString()}`,
          sourceSpendtime: record.spendtime,
        };
        if (!segmentMap.has(cellKey)) {
          segmentMap.set(cellKey, []);
        }
        segmentMap.get(cellKey).push(segment);
      }

      cursor = segmentEnd;
    }
  });

  segmentMap.forEach((segments) => {
    segments.sort((left, right) => {
      if (left.displayStart.getTime() !== right.displayStart.getTime()) {
        return left.displayStart.getTime() - right.displayStart.getTime();
      }
      return right.durationMs - left.durationMs;
    });
  });

  return segmentMap;
}

function compareWeeklyGridSegmentsByStart(left, right) {
  if (!left || !right) {
    return 0;
  }
  const startDiff =
    left.displayStart.getTime() - right.displayStart.getTime();
  if (startDiff !== 0) {
    return startDiff;
  }
  const durationDiff = right.durationMs - left.durationMs;
  if (durationDiff !== 0) {
    return durationDiff;
  }
  return String(left.segmentKey || "").localeCompare(
    String(right.segmentKey || ""),
  );
}

function assignWeeklyGridSegmentLanes(segments = []) {
  const positionedSegments = [];
  const segmentsByDay = new Map();

  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    if (!segment?.displayStart || !segment?.displayEnd) {
      return;
    }
    const dayKey = formatDateInputValue(segment.displayStart);
    if (!segmentsByDay.has(dayKey)) {
      segmentsByDay.set(dayKey, []);
    }
    segmentsByDay.get(dayKey).push(segment);
  });

  segmentsByDay.forEach((daySegments) => {
    const sortedSegments = daySegments
      .slice()
      .sort(compareWeeklyGridSegmentsByStart);
    let cluster = [];
    let clusterEndTime = 0;

    const flushCluster = () => {
      if (cluster.length === 0) {
        return;
      }
      const laneEndTimes = [];
      cluster.forEach((segment) => {
        const startTime = segment.displayStart.getTime();
        const endTime = segment.displayEnd.getTime();
        let laneIndex = laneEndTimes.findIndex(
          (laneEndTime) => laneEndTime <= startTime,
        );
        if (laneIndex < 0) {
          laneIndex = laneEndTimes.length;
          laneEndTimes.push(endTime);
        } else {
          laneEndTimes[laneIndex] = endTime;
        }
        segment.laneIndex = laneIndex;
      });

      const laneCount = Math.max(1, laneEndTimes.length);
      cluster.forEach((segment) => {
        segment.laneCount = laneCount;
        positionedSegments.push(segment);
      });
      cluster = [];
      clusterEndTime = 0;
    };

    sortedSegments.forEach((segment) => {
      const startTime = segment.displayStart.getTime();
      const endTime = segment.displayEnd.getTime();
      if (cluster.length === 0) {
        cluster = [segment];
        clusterEndTime = endTime;
        return;
      }
      if (startTime < clusterEndTime) {
        cluster.push(segment);
        clusterEndTime = Math.max(clusterEndTime, endTime);
        return;
      }
      flushCluster();
      cluster = [segment];
      clusterEndTime = endTime;
    });

    flushCluster();
  });

  return positionedSegments;
}

function renderWeeklyGridBlocksOverlay({
  scroller,
  table,
  cellRefs,
  segmentsByCell,
  scale = 1,
}) {
  if (!(scroller instanceof HTMLElement) || !(table instanceof HTMLElement)) {
    return;
  }

  scroller
    .querySelectorAll(".weekly-glass-block-layer")
    .forEach((node) => node.remove());

  const uniqueSegments = new Map();
  (segmentsByCell instanceof Map
    ? Array.from(segmentsByCell.values())
    : []
  ).forEach((segments) => {
    (segments || []).forEach((segment) => {
      if (!uniqueSegments.has(segment.segmentKey)) {
        uniqueSegments.set(segment.segmentKey, segment);
      }
    });
  });

  if (uniqueSegments.size === 0) {
    return;
  }

  const positionedSegments = assignWeeklyGridSegmentLanes(
    Array.from(uniqueSegments.values()),
  );
  const positionedSegmentKeys = new Set(
    positionedSegments.map((segment) => String(segment?.segmentKey || "")),
  );
  const overlay = document.createElement("div");
  overlay.className = "weekly-glass-block-layer";
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = `${table.offsetWidth}px`;
  overlay.style.height = `${table.offsetHeight}px`;
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "1";
  overlay.style.background = "transparent";
  overlay.style.isolation = "isolate";
  scroller.appendChild(overlay);

  const blockLabelFontSize = Math.max(7, Math.round(9 * scale));
  const blockTimeFontSize = Math.max(6, Math.round(8 * scale));
  const blockInset = Math.max(1, Math.round(2 * scale));
  const blockLaneGap = Math.max(1, Math.round(2 * scale));
  const skippedSegmentKeys = new Set();
  let renderedBlockCount = 0;

  positionedSegments.forEach((segment) => {
    const metrics = resolveWeeklyGridSegmentMetrics(segment, cellRefs);
    if (!metrics) {
      skippedSegmentKeys.add(segment.segmentKey);
      return;
    }
    const laneCount = Math.max(1, segment.laneCount || 1);
    const laneIndex = Math.max(0, segment.laneIndex || 0);
    const usableWidth = Math.max(
      8,
      metrics.width - Math.max(0, laneCount - 1) * blockLaneGap,
    );
    const laneWidth = usableWidth / laneCount;
    const blockLeft =
      metrics.left + laneIndex * (laneWidth + blockLaneGap) + blockInset;
    const blockWidth = Math.max(6, laneWidth - blockInset * 2);
    if (!Number.isFinite(blockLeft) || !Number.isFinite(blockWidth)) {
      skippedSegmentKeys.add(segment.segmentKey);
      return;
    }

    const timeBlock = document.createElement("div");
    const projectColor = segment.color || getProjectColor(segment.name);
    const segmentRangeText = formatWeeklyGridSegmentRange(segment);
    const tooltipText = `${segment.name}\n${segmentRangeText}\n${segment.sourceSpendtime || segment.spendtime || "未知时长"}`;
    timeBlock.className = "weekly-glass-time-block";
    timeBlock.style.position = "absolute";
    timeBlock.style.left = `${blockLeft}px`;
    timeBlock.style.width = `${blockWidth}px`;
    timeBlock.style.top = `${metrics.top}px`;
    timeBlock.style.height = `${metrics.height}px`;
    timeBlock.style.zIndex = "6";
    timeBlock.style.background = `linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.04)), ${projectColor}`;
    timeBlock.style.border = "1px solid rgba(255,255,255,0.18)";
    timeBlock.style.borderRadius = `${Math.max(6, Math.round(10 * scale))}px`;
    timeBlock.style.cursor = "pointer";
    timeBlock.style.transition =
      DISABLE_ELECTRON_STATS_BLOCK_HOVER_EFFECT
        ? "none"
        : "transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, filter 0.2s ease";
    timeBlock.style.overflow = "hidden";
    timeBlock.style.userSelect = "none";
    timeBlock.style.webkitUserSelect = "none";
    timeBlock.style.webkitTouchCallout = "none";
    timeBlock.style.touchAction = "manipulation";
    timeBlock.style.pointerEvents = "auto";
    if (!DISABLE_ELECTRON_STATS_GLASS_EFFECT) {
      timeBlock.style.backdropFilter = "blur(10px) saturate(120%)";
      timeBlock.style.webkitBackdropFilter = "blur(10px) saturate(120%)";
    }
    timeBlock.setAttribute("role", "button");
    timeBlock.setAttribute("tabindex", "0");
    timeBlock.setAttribute("data-record-id", segment.sourceRecordKey);
    timeBlock.setAttribute("data-segment-id", segment.segmentKey);
    timeBlock.title = tooltipText.replace(/\n+/g, " · ");

    const canRenderInlineLabels = !shouldHideWeeklyGridInlineLabels();
    const canRenderNameLabel =
      canRenderInlineLabels && metrics.height >= 20 && blockWidth >= 42;
    const canRenderTimeLabel =
      canRenderInlineLabels && metrics.height >= 30 && blockWidth >= 58;
    const maxNameLength = blockWidth < 56 ? 4 : blockWidth < 72 ? 6 : 8;

    if (canRenderNameLabel) {
      const nameLabel = document.createElement("div");
      nameLabel.textContent =
        segment.name.length > maxNameLength
          ? `${segment.name.substring(0, maxNameLength)}...`
          : segment.name;
      nameLabel.style.color = "white";
      nameLabel.style.fontSize = `${blockLabelFontSize}px`;
      nameLabel.style.fontWeight = "bold";
      nameLabel.style.padding = `${Math.max(1, Math.round(2 * scale))}px ${Math.max(3, Math.round(4 * scale))}px`;
      nameLabel.style.overflow = "hidden";
      nameLabel.style.whiteSpace = "nowrap";
      nameLabel.style.textOverflow = "ellipsis";
      nameLabel.style.textAlign = "center";
      nameLabel.style.pointerEvents = "none";
      timeBlock.appendChild(nameLabel);

      if (canRenderTimeLabel) {
        const timeLabel = document.createElement("div");
        timeLabel.textContent = segmentRangeText;
        timeLabel.style.color = "rgba(255,255,255,0.9)";
        timeLabel.style.fontSize = `${blockTimeFontSize}px`;
        timeLabel.style.padding = `0 ${Math.max(3, Math.round(4 * scale))}px ${Math.max(1, Math.round(2 * scale))}px ${Math.max(3, Math.round(4 * scale))}px`;
        timeLabel.style.textAlign = "center";
        timeLabel.style.pointerEvents = "none";
        timeBlock.appendChild(timeLabel);
      }
    }

    bindStatsHoverPreview(
      timeBlock,
      tooltipText,
      {
        baseZIndex: "6",
        hoverZIndex: "10",
        hoverScale: "1.012",
        hoverShadow: "0 10px 24px rgba(0,0,0,0.18)",
      },
    );
    timeBlock.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    timeBlock.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openStatsRecordEditModal(segment.sourceLocator);
    });
    bindStatsRecordEditActivation(timeBlock, () => {
      openStatsRecordEditModal(segment.sourceLocator);
    });

    overlay.appendChild(timeBlock);
    renderedBlockCount += 1;
  });

  if (renderedBlockCount !== uniqueSegments.size) {
    uniqueSegments.forEach((_, segmentKey) => {
      if (!positionedSegmentKeys.has(segmentKey)) {
        skippedSegmentKeys.add(segmentKey);
      }
    });
    console.warn("周表格时间块渲染数量不一致:", {
      expectedCount: uniqueSegments.size,
      actualCount: renderedBlockCount,
      skippedSegmentKeys: Array.from(skippedSegmentKeys),
    });
  }
}

function resolveWeeklyGridSegmentMetrics(segment, cellRefs) {
  if (!segment || !(cellRefs instanceof Map)) {
    return null;
  }

  const startDayKey = formatDateInputValue(segment.displayStart);
  const startHourKey = `${startDayKey}-${segment.displayStart.getHours()}`;
  const startCell = cellRefs.get(startHourKey);
  if (!(startCell instanceof HTMLElement)) {
    return null;
  }

  const left = startCell.offsetLeft;
  const width = startCell.offsetWidth;
  const cellTopOffset =
    (segment.displayStart.getMinutes() / 60) * startCell.offsetHeight;
  const top =
    startCell.offsetTop + cellTopOffset;

  let bottom = top + Math.max(4, startCell.offsetHeight * (1 / 60));
  const endsAtNextMidnight =
    segment.displayEnd.getHours() === 0 &&
    segment.displayEnd.getMinutes() === 0 &&
    segment.displayEnd.getSeconds() === 0 &&
    !isSameDate(segment.displayEnd, segment.displayStart);

  if (endsAtNextMidnight) {
    const lastHourCell = cellRefs.get(`${startDayKey}-23`);
    if (lastHourCell instanceof HTMLElement) {
      bottom = lastHourCell.offsetTop + lastHourCell.offsetHeight;
    }
  } else {
    const endDayKey = formatDateInputValue(segment.displayEnd);
    const endHourKey = `${endDayKey}-${segment.displayEnd.getHours()}`;
    const endCell = cellRefs.get(endHourKey);
    if (endCell instanceof HTMLElement) {
      bottom =
        endCell.offsetTop +
        (segment.displayEnd.getMinutes() / 60) * endCell.offsetHeight;
    }
  }

  return {
    left,
    width,
    top,
    cellTopOffset,
    startCell,
    height: Math.max(4, bottom - top),
  };
}

// 获取项目颜色
function getProjectColor(projectName) {
  if (!projectName) return "#79af85";

  // 如果projectName是对象且有name属性
  let nameToSearch = projectName;
  if (typeof projectName === "object" && projectName.name) {
    nameToSearch = projectName.name;
  }

  // 首先尝试直接匹配项目名称
  const project = projects.find((p) => p.name === nameToSearch);
  if (project && project.color) return project.color;

  // 尝试在项目中查找任何匹配
  for (const p of projects) {
    if (
      p.name === nameToSearch ||
      (typeof p.name === "string" && p.name.includes(nameToSearch))
    ) {
      return p.color || "#79af85";
    }
  }

  // 生成基于名称的确定性颜色
  const hash = stringHash(nameToSearch);
  const colors = [
    "#79af85",
    "#4299e1",
    "#ed8936",
    "#9f7aea",
    "#f56565",
    "#48bb78",
    "#ecc94b",
    "#667eea",
    "#ed64a6",
    "#38b2ac",
    "#9ccc65",
    "#ff7043",
    "#42a5f5",
    "#7e57c2",
  ];
  return colors[hash % colors.length];
}

// 简单字符串哈希函数
function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 转换为32位整数
  }
  return Math.abs(hash);
}

// 获取特定日期和小时的记录
function getRecordsForTimeSlot(date, hour) {
  return statsDataIndex?.getRecordsForDateHour?.(date, hour) || [];
}

// 将现有记录转换为TimeRecord对象
function convertToTimeRecords() {
  if (cachedStatsTimeRecords) {
    return cachedStatsTimeRecords;
  }

  const baseRecords = statsDataIndex?.getTimeRecords?.() || [];
  cachedStatsTimeRecords = baseRecords
    .map((record) => {
      const sourceIndex = Number.isInteger(record?.sourceIndex)
        ? record.sourceIndex
        : records.indexOf(record);
      const rawRecord =
        records[sourceIndex] || record.rawRecord || record;
      const project = findProjectForRecord(rawRecord);
      const sourceLocator = buildStatsRecordLocator(rawRecord, sourceIndex);

      return {
        rawRecord,
        sourceIndex,
        sourceLocator,
        sourceRecordKey: getStatsRecordLocatorKey(sourceLocator),
        name: rawRecord.name || record.name,
        projectId: rawRecord.projectId || project?.id || "",
        startTime: record.startTime,
        endTime: record.endTime,
        durationMs:
          record.durationMs ||
          Math.max(0, record.endTime.getTime() - record.startTime.getTime()),
        spendtime:
          rawRecord.spendtime ||
          record.spendtime ||
          formatMergedSpendtime(record.endTime.getTime() - record.startTime.getTime()),
        color: project?.color || "#79af85",
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime(),
    );
  return cachedStatsTimeRecords;
}

function formatMergedSpendtime(durationMs) {
  const safeMinutes = Math.max(1, Math.round((durationMs || 0) / 60000));
  const days = Math.floor(safeMinutes / (24 * 60));
  const remainderMinutes = safeMinutes - days * 24 * 60;
  const hours = Math.floor(remainderMinutes / 60);
  const minutes = remainderMinutes % 60;

  if (days > 0) {
    return `${days}天${hours}小时${minutes}分钟`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

// 获取星期几名称
function getDayName(dayIndex) {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  return days[dayIndex];
}

// 格式化时间
function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// 获取项目颜色图例
function getProjectsWithRecordedTimeInRange({
  startDate,
  endDate,
  levelFilter = timeTableLevelFilter,
} = {}) {
  const legendProjects = new Map();

  filterRecordsByDateRange(startDate, endDate).forEach((record) => {
    const project = findProjectForRecord(record);
    const projectLevel = parseInt(project?.level, 10) || 1;
    if (levelFilter !== "all" && String(projectLevel) !== String(levelFilter)) {
      return;
    }

    const projectName = String(project?.name || record?.name || "").trim();
    if (!projectName) {
      return;
    }

    const projectKey = project?.id
      ? `id:${project.id}`
      : `name:${projectName}`;
    if (!legendProjects.has(projectKey)) {
      legendProjects.set(projectKey, {
        key: projectKey,
        name: projectName,
        color: project?.color || getProjectColor(projectName),
        level: projectLevel,
        totalHours: 0,
      });
    }

    legendProjects.get(projectKey).totalHours += parseSpendTimeToHours(
      record?.spendtime,
    );
  });

  return Array.from(legendProjects.values()).sort(compareStatsDurationDesc);
}

function getProjectColorsLegend(options = {}) {
  const legendProjects = getProjectsWithRecordedTimeInRange(options);
  if (!legendProjects.length) {
    return `
      <span style="color: var(--muted-text-color); font-size: 12px;">
        当前时间范围内暂无记录
      </span>
    `;
  }

  return legendProjects
    .map(
      (item) => `
        <div style="display: flex; align-items: center; gap: 5px">
          <div style="width: 16px; height: 16px; background-color: ${item.color}; border-radius: 3px"></div>
          <span style="color: var(--text-color); font-size: 12px">${item.name}</span>
        </div>
      `,
    )
    .join("");
}

// 按层级过滤渲染时间表格
function renderWeeklyTimeGridWithLevel(container, level) {
  // 清除当前表格内容但保留标题和筛选器
  const gridContainer = container.querySelector("div:last-child");
  const legend = container.querySelector("div:last-child");

  if (gridContainer && gridContainer.style.padding === "15px") {
    gridContainer.remove();
  }
  if (legend && legend.style.borderTop) {
    legend.remove();
  }

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;

  if (!startDate || !endDate) return;

  const start = new Date(startDate);
  const end = new Date(endDate);

  // 计算天数
  const timeDiff = end.getTime() - start.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

  if (daysDiff <= 0 || daysDiff > 31) {
    return;
  }

  // 创建时间表格容器
  const newGridContainer = document.createElement("div");
  newGridContainer.className = "stats-table-horizontal-scroll";
  newGridContainer.style.padding = "15px";
  newGridContainer.style.overflowX = "auto";
  const legacyTimeColumnWidth = isCompactMobileLayout() ? 52 : 64;
  const legacyTimeColumnFontSize = getWeeklyTimeColumnFontSize(
    isCompactMobileLayout() ? MOBILE_TABLE_SCALE_RATIO : 1,
    legacyTimeColumnWidth,
  );

  // 创建表格
  const table = document.createElement("table");
  table.style.width = "max-content";
  table.style.minWidth = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  // 创建表头 - 日期
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // 时间列标题
  const timeHeader = document.createElement("th");
  timeHeader.textContent = "时间";
  timeHeader.style.padding = "8px";
  timeHeader.style.border = "1px solid var(--bg-tertiary)";
  timeHeader.style.backgroundColor = "var(--bg-secondary)";
  timeHeader.style.color = "var(--text-color)";
  timeHeader.style.textAlign = "left";
  timeHeader.style.width = `${legacyTimeColumnWidth}px`;
  timeHeader.style.minWidth = `${legacyTimeColumnWidth}px`;
  timeHeader.style.maxWidth = `${legacyTimeColumnWidth}px`;
  timeHeader.style.whiteSpace = "nowrap";
  timeHeader.style.overflow = "hidden";
  timeHeader.style.textOverflow = "ellipsis";
  headerRow.appendChild(timeHeader);

  // 日期标题
  const dates = [];
  const currentDate = new Date(start);
  for (let i = 0; i < daysDiff; i++) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + i);
    dates.push(date);

    const th = document.createElement("th");
    th.textContent = `${date.getMonth() + 1}/${date.getDate()}\n${getDayName(date.getDay())}`;
    th.style.padding = "8px";
    th.style.border = "1px solid var(--bg-tertiary)";
    th.style.backgroundColor = "var(--bg-secondary)";
    th.style.color = "var(--text-color)";
    th.style.textAlign = "center";
    th.style.minWidth = "80px";
    th.style.whiteSpace = "pre-line";
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格主体 - 时间行
  const tbody = document.createElement("tbody");

  // 每小时一行，从0点到24点
  for (let hour = 0; hour < 24; hour++) {
    const row = document.createElement("tr");

    // 时间单元格
    const timeCell = document.createElement("td");
    const compactHourLabel =
      isCompactMobileLayout() && daysDiff >= 6
        ? hour.toString().padStart(2, "0")
        : `${hour.toString().padStart(2, "0")}:00`;
    timeCell.textContent = compactHourLabel;
    timeCell.style.padding = "4px";
    timeCell.style.border = "1px solid var(--bg-tertiary)";
    timeCell.style.backgroundColor = "var(--bg-secondary)";
    timeCell.style.color = "var(--text-color)";
    timeCell.style.textAlign = "center";
    timeCell.style.width = `${legacyTimeColumnWidth}px`;
    timeCell.style.minWidth = `${legacyTimeColumnWidth}px`;
    timeCell.style.maxWidth = `${legacyTimeColumnWidth}px`;
    timeCell.style.fontSize = `${legacyTimeColumnFontSize}px`;
    timeCell.style.lineHeight = "1";
    timeCell.style.whiteSpace = "nowrap";
    timeCell.style.overflow = "hidden";
    timeCell.style.textOverflow = "ellipsis";
    row.appendChild(timeCell);

    // 每一天的单元格
    for (let dayIndex = 0; dayIndex < daysDiff; dayIndex++) {
      const cell = document.createElement("td");
      cell.style.padding = "0";
      cell.style.border = "1px solid var(--bg-tertiary)";
      cell.style.position = "relative";
      cell.style.height = "40px";
      cell.style.backgroundColor = "var(--bg-primary)";

      // 在这个单元格中查找对应时间段的记录
      const dayDate = dates[dayIndex];
      const recordsForCell = getRecordsForTimeSlotWithLevel(
        dayDate,
        hour,
        level,
      );

      // 如果有记录，创建时间区块
      if (recordsForCell.length > 0) {
        recordsForCell.forEach((record) => {
          const timeBlock = document.createElement("div");
          timeBlock.style.position = "absolute";
          timeBlock.style.left = "0";
          timeBlock.style.right = "0";

          // 使用项目颜色
          const projectColor = getProjectColor(record.name);
          timeBlock.style.backgroundColor = projectColor;

          timeBlock.style.borderRadius = "2px";
          timeBlock.style.cursor = "pointer";
          timeBlock.style.transition = DISABLE_ELECTRON_STATS_BLOCK_HOVER_EFFECT
            ? "none"
            : "all 0.2s ease";
          timeBlock.style.overflow = "hidden";

          // 设置区块高度和位置
          const startMinute = record.startTime.getMinutes();
          const top = (startMinute / 60) * 40;
          const height = Math.max(
            4,
            Math.round(
              ((record.endTime.getTime() - record.startTime.getTime()) /
                60000 /
                60) *
                40,
            ),
          );

          timeBlock.style.top = `${top}px`;
          timeBlock.style.height = `${height}px`;
          timeBlock.style.zIndex = "6";

          bindStatsHoverPreview(
            timeBlock,
            `${record.name}\n${formatTime(record.startTime)} - ${formatTime(record.endTime)}\n${record.spendtime || "未知时长"}`,
            {
              baseZIndex: "6",
              hoverZIndex: "10",
              hoverScale: "1.02",
              hoverShadow: "0 2px 8px rgba(0,0,0,0.2)",
            },
          );

          cell.appendChild(timeBlock);
        });
      }

      row.appendChild(cell);
    }

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  newGridContainer.appendChild(table);
  container.appendChild(newGridContainer);

  // 添加图例（按层级过滤）
  const newLegend = document.createElement("div");
  newLegend.style.padding = "15px";
  newLegend.style.borderTop = "1px solid var(--bg-tertiary)";
  const legendHTML = getProjectColorsLegend({
    startDate,
    endDate,
    levelFilter: level === null ? "all" : String(level),
  });

  newLegend.innerHTML = `
    <p style="margin: 0 0 10px 0; color: var(--text-color); font-size: 14px">
      <strong>图例：</strong> 每个色块代表一个时间段，鼠标悬停可查看详情
    </p>
    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      ${legendHTML}
    </div>
  `;
  container.appendChild(newLegend);
}

// 获取特定日期、小时和层级的记录
function getRecordsForTimeSlotWithLevel(date, hour, level) {
  const slotRecords = statsDataIndex?.getRecordsForDateHour?.(date, hour) || [];
  if (level === null) {
    return slotRecords;
  }
  return slotRecords.filter((record) => {
    const project = findProjectForRecord(record.rawRecord || record);
    return (Number.parseInt(project?.level, 10) || 1) === level;
  });
}

// 获取饼状图数据
function getPieChartData(startDate, endDate) {
  const data = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        borderColor: "var(--bg-primary)",
        borderWidth: 1,
      },
    ],
  };

  // 计算每个项目的时间
  const projectTimes = {};

  // 过滤记录
  const filteredRecords = records.filter((record) => {
    if (!record.timestamp || !record.spendtime) return false;

    const recordDate = new Date(record.timestamp);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();

    return recordDate >= start && recordDate <= end;
  });

  // 计算每个项目的总时间
  filteredRecords.forEach((record) => {
    if (record.name && record.spendtime) {
      const timeStr = record.spendtime;
      let totalMs = 0;

      // 解析时间字符串
      const dayMatch = timeStr.match(/(\d+)天/);
      const hourMatch = timeStr.match(/(\d+)小时/);
      const minMatch = timeStr.match(/(\d+)分钟/);
      const lessMinMatch = timeStr.includes("小于1分钟");

      if (dayMatch) totalMs += parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;
      if (hourMatch) totalMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
      if (minMatch) totalMs += parseInt(minMatch[1]) * 60 * 1000;
      if (lessMinMatch) totalMs += 30 * 1000;

      projectTimes[record.name] = (projectTimes[record.name] || 0) + totalMs;
    }
  });

  // 转换为小时
  Object.keys(projectTimes).forEach((projectName) => {
    const hours = projectTimes[projectName] / (1000 * 60 * 60);
    if (hours > 0) {
      data.labels.push(projectName);
      data.datasets[0].data.push(hours);

      // 获取项目颜色
      const project = projects.find((p) => p.name === projectName);
      if (project && project.color) {
        data.datasets[0].backgroundColor.push(project.color);
      } else {
        // 生成随机颜色
        const hue = Math.floor(Math.random() * 360);
        data.datasets[0].backgroundColor.push(`hsl(${hue}, 70%, 60%)`);
      }
    }
  });

  return data;
}

function renderPieChart(container) {
  const widgetMode = isStatsDesktopWidgetMode();
  container.innerHTML = "";
  const { shell: viewShell, content: viewRoot } = applyResizableViewShell(
    container,
    "pie",
    {
      minHeight: 500,
      minWidth: 0,
      height: 620,
    },
  );
  applyStatsPageFlowShell(viewShell, viewRoot);

  const statsContent = document.createElement("div");
  statsContent.className = "stats-content";
  statsContent.style.padding = "15px";
  statsContent.style.display = "flex";
  statsContent.style.flexDirection = "column";
  statsContent.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  statsContent.style.minHeight = "0";
  statsContent.style.gap = widgetMode ? "12px" : "0";

  const filterRow = document.createElement("div");
  filterRow.style.display = "flex";
  filterRow.style.alignItems = "center";
  filterRow.style.gap = "10px";
  filterRow.style.flexWrap = "wrap";
  filterRow.style.flex = "0 0 auto";
  filterRow.style.marginBottom = widgetMode ? "0" : "15px";
  filterRow.innerHTML = `
    <span style="color: var(--text-color); font-size: 13px;">项目筛选</span>
    <div id="pie-project-filter-host"></div>
  `;

  const chartContainer = document.createElement("div");
  chartContainer.className = "stats-chart-viewport";
  chartContainer.style.position = "relative";
  chartContainer.style.width = "100%";
  chartContainer.style.flex = "1 1 auto";
  chartContainer.style.height = widgetMode ? "100%" : "auto";
  chartContainer.style.minHeight = getStatsChartViewportHeight();

  statsContent.appendChild(filterRow);
  statsContent.appendChild(chartContainer);
  viewRoot.appendChild(statsContent);

  const treeNodes = buildChartProjectSelectorTree("全部项目（汇总）");
  const normalizedPieSelection = ensureValidChartSelection(
    treeNodes,
    pieChartState.selectionValue,
  );
  if (normalizedPieSelection !== pieChartState.selectionValue) {
    pieChartState.selectionValue = normalizedPieSelection;
    saveStatsUiStateToPreferences();
  }
  pieChartState.selectionValue = normalizedPieSelection;

  renderProjectTreeSelector(
    filterRow.querySelector("#pie-project-filter-host"),
    {
      selectedValue: pieChartState.selectionValue,
      onChange: (value) => {
        pieChartState.selectionValue = value;
        saveStatsUiStateToPreferences();
        renderPieChartWithCategory(viewRoot);
      },
      allLabel: "全部项目（汇总）",
      minWidth: widgetMode ? 220 : 260,
      treeNodes,
    },
  );

  renderPieChartWithCategory(viewRoot);
}

function renderPieChartWithSort(container) {
  renderPieChartWithCategory(container);
}

function renderPieChartWithCategory(container) {
  const chartContainer = container.querySelector(
    ".stats-content > div:last-child",
  );
  if (!chartContainer) return;

  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;
  const statsContext = buildChartStatsContext(startDate, endDate);

  if (!statsContext) {
    chartContainer.innerHTML = `
      <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted-text-color); text-align: center; padding: 20px;">
        统计工具未加载，无法渲染层级饼状图
      </div>
    `;
    return;
  }

  const breakdownTree = sanitizeBreakdownTreeForDisplay(
    statsContext.buildBreakdownTree(pieChartState.selectionValue, {
      includeZero: false,
    }),
  );
  const legendItems = statsContext.flattenBreakdownTree(breakdownTree, {
    includeRoot: false,
  });
  renderPieHierarchyChart(
    chartContainer,
    pruneStatsBreakdownTreeByCollapseState(breakdownTree, "pie"),
    {
      legendItems,
      onToggle: () => {
        renderPieChartWithCategory(container);
      },
    },
  );
}

function getPieChartDataWithLevelFilter(startDate, endDate) {
  const statsContext = buildChartStatsContext(startDate, endDate);
  const breakdownTree = sanitizeBreakdownTreeForDisplay(
    statsContext?.buildBreakdownTree(pieChartState.selectionValue, {
      includeZero: false,
    }),
  );
  const items =
    breakdownTree && statsContext
      ? statsContext.flattenBreakdownTree(breakdownTree, { includeRoot: false })
      : [];

  return {
    labels: items.map((item) => item.label),
    datasets: [
      {
        data: items.map((item) =>
          Number(((item.valueMs || 0) / (1000 * 60 * 60)).toFixed(2)),
        ),
        backgroundColor: items.map((item) => item.color),
        borderColor: "var(--bg-primary)",
        borderWidth: 1,
      },
    ],
  };
}

// 排序图表数据
function sortChartData(chartData, sortOrder) {
  const labels = [...chartData.labels];
  const data = [...chartData.datasets[0].data];
  const colors = [...chartData.datasets[0].backgroundColor];

  // 创建索引数组并排序
  const indices = labels.map((_, index) => index);
  indices.sort((a, b) => {
    if (sortOrder === "asc") {
      return data[a] - data[b];
    } else {
      return data[b] - data[a];
    }
  });

  // 重新排序数组
  const sortedLabels = indices.map((i) => labels[i]);
  const sortedData = indices.map((i) => data[i]);
  const sortedColors = indices.map((i) => colors[i]);

  return {
    labels: sortedLabels,
    datasets: [
      {
        data: sortedData,
        backgroundColor: sortedColors,
        borderColor: "var(--bg-primary)",
        borderWidth: 1,
      },
    ],
  };
}

function renderLineChart(container) {
  const widgetMode = isStatsDesktopWidgetMode();
  container.innerHTML = "";
  const { shell: viewShell, content: viewRoot } = applyResizableViewShell(
    container,
    "line",
    {
      minHeight: 500,
      minWidth: 0,
      height: 620,
    },
  );
  applyStatsPageFlowShell(viewShell, viewRoot);

  if (typeof Chart === "undefined") {
    viewRoot.innerHTML = `
      <div style="color: var(--text-color); padding: 20px; text-align: center">
        <h4>折线图统计</h4>
        <p>Chart.js 库未加载，请检查本地资源</p>
      </div>
    `;
    return;
  }

  const statsContent = document.createElement("div");
  statsContent.className = "stats-content";
  statsContent.style.padding = "15px";
  statsContent.style.display = "flex";
  statsContent.style.flexDirection = "column";
  statsContent.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  statsContent.style.minHeight = "0";
  statsContent.style.gap = widgetMode ? "12px" : "0";
  lineChartState.dataType = "project";

  const filterRow = document.createElement("div");
  filterRow.style.display = "flex";
  filterRow.style.alignItems = "center";
  filterRow.style.gap = "8px";
  filterRow.style.flexWrap = "wrap";
  filterRow.style.flex = "0 0 auto";
  filterRow.style.marginBottom = widgetMode ? "0" : "15px";
  filterRow.innerHTML = `
    <span style="color: var(--text-color); font-size: 13px;">项目筛选</span>
    <div id="line-chart-project-filter-host"></div>
  `;

  const chartContainer = document.createElement("div");
  chartContainer.className = "stats-chart-viewport stats-chart-viewport--line";
  chartContainer.style.position = "relative";
  chartContainer.style.width = "100%";
  chartContainer.style.display = "flex";
  chartContainer.style.flexDirection = "column";
  chartContainer.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  chartContainer.style.height = "auto";
  chartContainer.style.minHeight = "0";

  statsContent.appendChild(filterRow);
  statsContent.appendChild(chartContainer);
  viewRoot.appendChild(statsContent);

  const treeNodes = buildChartProjectSelectorTree("全部项目（汇总）");
  const normalizedLineSelection = ensureValidChartSelection(
    treeNodes,
    lineChartState.selectionValue,
  );
  if (normalizedLineSelection !== lineChartState.selectionValue) {
    lineChartState.selectionValue = normalizedLineSelection;
    saveStatsUiStateToPreferences();
  }
  lineChartState.selectionValue = normalizedLineSelection;

  renderProjectTreeSelector(
    filterRow.querySelector("#line-chart-project-filter-host"),
    {
      selectedValue: lineChartState.selectionValue,
      onChange: (value) => {
        lineChartState.selectionValue = value;
        saveStatsUiStateToPreferences();
        renderLineChartWithData(viewRoot, lineChartState.dataType);
      },
      allLabel: "全部项目（汇总）",
      minWidth: widgetMode ? 220 : 260,
      treeNodes,
    },
  );

  renderLineChartWithData(viewRoot, lineChartState.dataType);
}

function getLineChartData(
  startDate,
  endDate,
  dataType = lineChartState.dataType,
) {
  const rangeMeta = getLineChartRangeMeta(startDate, endDate);
  const chartData = {
    labels: rangeMeta.labels,
    datasets: [],
    legendItems: [],
  };

  if (!projectStatsApi?.createStatsContext || dataType !== "project") {
    return chartData;
  }

  const filteredRecords = filterRecordsByDateRange(startDate, endDate);
  const statsContext = createScopedStatsContext(filteredRecords);
  if (!statsContext) {
    return chartData;
  }
  const breakdownTree = sanitizeBreakdownTreeForDisplay(
    statsContext.buildBreakdownTree(lineChartState.selectionValue, {
      includeZero: false,
    }),
  );
  const items = statsContext.flattenBreakdownTree(breakdownTree, {
    includeRoot: false,
  });
  chartData.legendItems = items;
  const visibleItems = getVisibleStatsLegendItems(items, "line");

  visibleItems.forEach((item) => {
    const values = accumulateFilteredLineChartValues(
      filteredRecords,
      statsContext,
      rangeMeta,
      item,
    );
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      chartData.datasets.push(buildHierarchyLineDataset(item, values));
    }
  });

  return chartData;
}

function renderLineChartWithData(container, dataType) {
  const widgetMode = isStatsDesktopWidgetMode();
  const chartContainer = container.querySelector(
    ".stats-content > div:last-child",
  );
  if (!chartContainer) return;

  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;
  const chartData = getLineChartData(startDate, endDate, dataType);
  const summaryData = getLineChartPeriodSummary();
  const compactMobileSummary = isCompactMobileLayout();

  if (window.lineChart) {
    window.lineChart.destroy();
    window.lineChart = null;
  }

  const layout = document.createElement("div");
  layout.className = "stats-line-chart-layout";
  layout.style.height = widgetMode ? "100%" : "auto";
  if (compactMobileSummary) {
    layout.classList.add("is-compact-mobile");
  }

  const header = document.createElement("div");
  header.className = "stats-line-chart-header";

  const legendHost = document.createElement("div");
  legendHost.className = "stats-line-legend";
  createLineChartLegend(legendHost, chartData.datasets, {
    legendItems: chartData.legendItems,
    onToggle: () => {
      renderLineChartWithData(container, dataType);
    },
  });
  legendHost.hidden = chartData.datasets.length === 0;
  header.appendChild(legendHost);
  const summaryCard = createStatsPeriodSummaryCard(summaryData, {
    compact: compactMobileSummary,
  });
  const summaryHost = document.createElement("div");
  summaryHost.className = "stats-line-chart-summary-host";
  summaryHost.appendChild(summaryCard);
  header.appendChild(summaryHost);

  const plotFrame = document.createElement("div");
  plotFrame.className = "stats-line-chart-frame";
  if (widgetMode) {
    plotFrame.style.height = "100%";
    plotFrame.style.minHeight = "0";
  } else {
    const plotHeight = getStatsChartViewportHeight();
    plotFrame.style.height = plotHeight;
    plotFrame.style.minHeight = plotHeight;
  }

  const canvasHost = document.createElement("div");
  canvasHost.className = "stats-line-chart-canvas-host";

  layout.appendChild(header);
  plotFrame.appendChild(canvasHost);
  layout.appendChild(plotFrame);
  chartContainer.innerHTML = "";
  chartContainer.appendChild(layout);

  if (chartData.datasets.length === 0) {
    canvasHost.innerHTML = `
      <div class="stats-line-empty-state">
        当前时间范围内暂无可绘制的数据
      </div>
    `;
    return;
  }

  const ctx = document.createElement("canvas");
  ctx.style.width = "100%";
  ctx.style.height = "100%";
  canvasHost.appendChild(ctx);

  window.lineChart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          mode: "index",
          intersect: false,
          itemSort(left, right) {
            const leftValue = Number(left?.parsed?.y || 0);
            const rightValue = Number(right?.parsed?.y || 0);
            if (leftValue !== rightValue) {
              return rightValue - leftValue;
            }
            return (left?.datasetIndex || 0) - (right?.datasetIndex || 0);
          },
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = context.parsed.y || 0;
              return `${label}: ${formatStatsHoursText(value, 2)}`;
            },
          },
          backgroundColor: "var(--panel-strong-bg)",
          titleColor: "var(--text-color)",
          bodyColor: "var(--text-color)",
          borderColor: "var(--panel-border-color)",
          borderWidth: 1,
          padding: 10,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          border: {
            color: "rgba(255, 255, 255, 0.18)",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.08)",
          },
          ticks: {
            color: "var(--text-color)",
            padding: 6,
          },
        },
        y: {
          beginAtZero: true,
          border: {
            color: "rgba(255, 255, 255, 0.18)",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.08)",
          },
          ticks: {
            color: "var(--text-color)",
            padding: 6,
            callback(value) {
              return `${value}h`;
            },
          },
        },
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      animation: false,
    },
  });
}

// 创建测试数据
function createTestData() {
  console.log("创建测试记录数据...");

  records = [];
  if (projects.length === 0) {
    createTestProjects();
  }

  const today = new Date();
  const preferredNames = [
    "工作",
    "编程",
    "计时项目",
    "重构",
    "会议",
    "周会记录",
    "学习",
    "英语",
    "单词复习",
    "生活",
    "运动",
    "晨跑",
  ];
  const testProjects = preferredNames
    .map((name) => projects.find((project) => project.name === name))
    .filter(Boolean);
  const durationPool = [35, 45, 60, 75, 90, 110, 130];
  const toSpendText = (minutes) => {
    const safe = Math.max(1, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
  };

  for (let offset = 0; offset < 240; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const weekday = date.getDay();
    const recordCount = weekday === 0 || weekday === 6 ? 1 : 2;

    for (let index = 0; index < recordCount; index++) {
      const project = testProjects[(offset + index) % testProjects.length];
      const startHour = 8 + ((offset + index * 2) % 10);
      const startMinute = ((offset + index) % 4) * 15;
      const duration = durationPool[(offset * 2 + index) % durationPool.length];
      const timestamp = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        startHour,
        startMinute,
        0,
      );

      records.push({
        id: `r-${offset}-${index}-${Date.now()}`,
        timestamp: timestamp.toISOString(),
        name: project.name,
        spendtime: toSpendText(duration),
        projectId: project.id,
      });
    }
  }

  // 保存到localStorage
  try {
    void saveStatsRecordsToStorage();
    console.log("测试记录数据创建成功，共", records.length, "条记录");
  } catch (e) {
    console.error("保存测试数据失败:", e);
  }
}

// 月视图时间表格
function renderMonthlyGridView(container) {
  container.innerHTML = "";

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;

  if (!startDate || !endDate) return;

  const start = new Date(startDate);
  const end = new Date(endDate);

  // 计算天数
  const timeDiff = end.getTime() - start.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

  // 月视图应该显示更长时间范围，例如30-90天
  if (daysDiff < 28) {
    container.innerHTML = `<div style="color: var(--text-color); padding: 20px; text-align: center">月视图需要至少28天的时间范围，请选择更长的时间范围</div>`;
    return;
  }

  if (daysDiff > 90) {
    container.innerHTML = `<div style="color: var(--text-color); padding: 20px; text-align: center">月视图最多支持90天，请选择更短的时间范围</div>`;
    return;
  }

  // 创建月视图标题
  const header = document.createElement("div");
  header.style.padding = "15px";
  header.style.borderBottom = "1px solid var(--bg-tertiary)";

  const filterHtml = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <div>
        <h4 style="margin: 0; color: var(--text-color)">月视图时间统计</h4>
        <p style="margin: 5px 0 0 0; color: #aaa; font-size: 14px">
          显示 ${startDate} 至 ${endDate} 的时间分配情况（${daysDiff}天）
        </p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span style="color: var(--text-color); font-size: 14px">显示类型:</span>
        <div style="display: flex; gap: 5px;">
          <button class="bts monthly-view-type-filter" data-type="daily" style="padding: 5px 10px; font-size: 12px; background-color: var(--accent-color); color: var(--on-accent-text);">每日总计</button>
          <button class="bts monthly-view-type-filter" data-type="weekly" style="padding: 5px 10px; font-size: 12px">每周总计</button>
          <button class="bts monthly-view-type-filter" data-type="monthly" style="padding: 5px 10px; font-size: 12px">项目总计</button>
        </div>
      </div>
    </div>
  `;

  header.innerHTML = filterHtml;
  container.appendChild(header);

  // 添加类型筛选事件
  setTimeout(() => {
    const typeFilters = header.querySelectorAll(".monthly-view-type-filter");
    typeFilters.forEach((btn) => {
      btn.addEventListener("click", function () {
        // 更新按钮状态
        typeFilters.forEach((b) => {
          uiTools?.setAccentButtonState(b, false);
        });
        uiTools?.setAccentButtonState(this, true);

        // 重新渲染月视图
        const viewType = this.dataset.type;
        renderMonthlyGridViewWithType(container, viewType);
      });
    });
  }, 0);

  // 初始渲染
  renderMonthlyGridViewWithType(container, "daily");
}

// 按类型渲染月视图
function renderMonthlyGridViewWithType(container, viewType) {
  // 清除当前内容但保留标题
  const content = container.querySelectorAll("div:not(:first-child)");
  content.forEach((el) => el.remove());

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;

  if (!startDate || !endDate) return;

  const start = new Date(startDate);
  const end = new Date(endDate);

  // 计算天数
  const timeDiff = end.getTime() - start.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

  if (daysDiff < 28 || daysDiff > 90) return;

  // 创建内容容器
  const contentContainer = document.createElement("div");
  contentContainer.className = "stats-table-horizontal-scroll";
  contentContainer.style.padding = "15px";
  contentContainer.style.overflowX = "auto";

  switch (viewType) {
    case "daily":
      renderMonthlyDailyView(contentContainer, start, end, daysDiff);
      break;
    case "weekly":
      renderMonthlyWeeklyView(contentContainer, start, end, daysDiff);
      break;
    case "monthly":
      renderMonthlyProjectView(contentContainer, start, end);
      break;
  }

  container.appendChild(contentContainer);
}

// 渲染每日视图
function renderMonthlyDailyView(container, start, end, daysDiff) {
  // 创建表格
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  // 创建表头
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const headers = ["日期", "星期", "总时间", "主要项目", "时间分配"];
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.padding = "8px";
    th.style.border = "1px solid var(--bg-tertiary)";
    th.style.backgroundColor = "var(--bg-secondary)";
    th.style.color = "var(--text-color)";
    th.style.textAlign = "center";
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格主体
  const tbody = document.createElement("tbody");

  // 计算每天的总时间
  const dailyData = calculateDailyTimeData(start, end, daysDiff);

  // 填充数据行
  dailyData.forEach((dayData) => {
    const row = document.createElement("tr");

    // 日期
    const dateCell = document.createElement("td");
    dateCell.textContent = dayData.date;
    dateCell.style.padding = "8px";
    dateCell.style.border = "1px solid var(--bg-tertiary)";
    dateCell.style.backgroundColor = "var(--bg-primary)";
    dateCell.style.color = "var(--text-color)";
    dateCell.style.textAlign = "center";
    row.appendChild(dateCell);

    // 星期
    const dayCell = document.createElement("td");
    dayCell.textContent = dayData.dayName;
    dayCell.style.padding = "8px";
    dayCell.style.border = "1px solid var(--bg-tertiary)";
    dayCell.style.backgroundColor = "var(--bg-primary)";
    dayCell.style.color = "var(--text-color)";
    dayCell.style.textAlign = "center";
    row.appendChild(dayCell);

    // 总时间
    const totalTimeCell = document.createElement("td");
    totalTimeCell.textContent =
      dayData.totalHours > 0 ? `${dayData.totalHours.toFixed(1)}小时` : "-";
    totalTimeCell.style.padding = "8px";
    totalTimeCell.style.border = "1px solid var(--bg-tertiary)";
    totalTimeCell.style.backgroundColor = "var(--bg-primary)";
    totalTimeCell.style.color = "var(--text-color)";
    totalTimeCell.style.textAlign = "center";
    if (dayData.totalHours > 0) {
      totalTimeCell.style.fontWeight = "bold";
      totalTimeCell.style.color = "var(--accent-color)";
    }
    row.appendChild(totalTimeCell);

    // 主要项目
    const mainProjectCell = document.createElement("td");
    mainProjectCell.textContent = dayData.mainProject || "-";
    mainProjectCell.style.padding = "8px";
    mainProjectCell.style.border = "1px solid var(--bg-tertiary)";
    mainProjectCell.style.backgroundColor = "var(--bg-primary)";
    mainProjectCell.style.color = "var(--text-color)";
    mainProjectCell.style.textAlign = "center";
    row.appendChild(mainProjectCell);

    // 时间分配（可视化）
    const allocationCell = document.createElement("td");
    allocationCell.style.padding = "8px";
    allocationCell.style.border = "1px solid var(--bg-tertiary)";
    allocationCell.style.backgroundColor = "var(--bg-primary)";
    allocationCell.style.position = "relative";
    allocationCell.style.height = "24px";

    if (dayData.projects.length > 0) {
      const barContainer = document.createElement("div");
      barContainer.style.width = "100%";
      barContainer.style.height = "20px";
      barContainer.style.display = "flex";
      barContainer.style.borderRadius = "3px";
      barContainer.style.overflow = "hidden";

      dayData.projects.forEach((project) => {
        if (project.hours > 0) {
          const barSegment = document.createElement("div");
          barSegment.style.backgroundColor = getProjectColor(project.name);
          barSegment.style.flex = project.hours / dayData.totalHours;
          barSegment.style.height = "100%";
          barContainer.appendChild(barSegment);
        }
      });

      allocationCell.appendChild(barContainer);
    } else {
      allocationCell.textContent = "-";
      allocationCell.style.textAlign = "center";
      allocationCell.style.color = "var(--text-color)";
    }

    row.appendChild(allocationCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// 渲染每周视图
function renderMonthlyWeeklyView(container, start, end, daysDiff) {
  // 计算每周数据
  const weeklyData = calculateWeeklyTimeData(start, end, daysDiff);

  // 创建表格
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  // 创建表头
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const headers = ["周数", "日期范围", "总时间", "平均每日时间", "项目分布"];
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.padding = "8px";
    th.style.border = "1px solid var(--bg-tertiary)";
    th.style.backgroundColor = "var(--bg-secondary)";
    th.style.color = "var(--text-color)";
    th.style.textAlign = "center";
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格主体
  const tbody = document.createElement("tbody");

  weeklyData.forEach((weekData, index) => {
    const row = document.createElement("tr");

    // 周数
    const weekNumCell = document.createElement("td");
    weekNumCell.textContent = `第${index + 1}周`;
    weekNumCell.style.padding = "8px";
    weekNumCell.style.border = "1px solid var(--bg-tertiary)";
    weekNumCell.style.backgroundColor = "var(--bg-primary)";
    weekNumCell.style.color = "var(--text-color)";
    weekNumCell.style.textAlign = "center";
    row.appendChild(weekNumCell);

    // 日期范围
    const dateRangeCell = document.createElement("td");
    dateRangeCell.textContent = weekData.dateRange;
    dateRangeCell.style.padding = "8px";
    dateRangeCell.style.border = "1px solid var(--bg-tertiary)";
    dateRangeCell.style.backgroundColor = "var(--bg-primary)";
    dateRangeCell.style.color = "var(--text-color)";
    dateRangeCell.style.textAlign = "center";
    row.appendChild(dateRangeCell);

    // 总时间
    const totalTimeCell = document.createElement("td");
    totalTimeCell.textContent =
      weekData.totalHours > 0 ? `${weekData.totalHours.toFixed(1)}小时` : "-";
    totalTimeCell.style.padding = "8px";
    totalTimeCell.style.border = "1px solid var(--bg-tertiary)";
    totalTimeCell.style.backgroundColor = "var(--bg-primary)";
    totalTimeCell.style.color = "var(--text-color)";
    totalTimeCell.style.textAlign = "center";
    if (weekData.totalHours > 0) {
      totalTimeCell.style.fontWeight = "bold";
      totalTimeCell.style.color = "var(--accent-color)";
    }
    row.appendChild(totalTimeCell);

    // 平均每日时间
    const avgTimeCell = document.createElement("td");
    avgTimeCell.textContent =
      weekData.averageDailyHours > 0
        ? `${weekData.averageDailyHours.toFixed(1)}小时`
        : "-";
    avgTimeCell.style.padding = "8px";
    avgTimeCell.style.border = "1px solid var(--bg-tertiary)";
    avgTimeCell.style.backgroundColor = "var(--bg-primary)";
    avgTimeCell.style.color = "var(--text-color)";
    avgTimeCell.style.textAlign = "center";
    row.appendChild(avgTimeCell);

    // 项目分布
    const distributionCell = document.createElement("td");
    distributionCell.style.padding = "8px";
    distributionCell.style.border = "1px solid var(--bg-tertiary)";
    distributionCell.style.backgroundColor = "var(--bg-primary)";
    distributionCell.style.position = "relative";

    if (weekData.projects.length > 0) {
      let distributionHTML = "";
      weekData.projects.forEach((project) => {
        const percentage =
          weekData.totalHours > 0
            ? ((project.hours / weekData.totalHours) * 100).toFixed(0)
            : 0;
        if (percentage > 0) {
          distributionHTML += `
            <div style="display: flex; align-items: center; margin-bottom: 3px;">
              <div style="width: 12px; height: 12px; background-color: ${getProjectColor(project.name)}; border-radius: 2px; margin-right: 5px;"></div>
              <span style="color: var(--text-color); font-size: 11px;">${project.name} (${percentage}%)</span>
            </div>
          `;
        }
      });
      distributionCell.innerHTML = distributionHTML;
    } else {
      distributionCell.textContent = "-";
      distributionCell.style.textAlign = "center";
      distributionCell.style.color = "var(--text-color)";
    }

    row.appendChild(distributionCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// 渲染项目视图
function renderMonthlyProjectView(container, start, end) {
  // 计算项目总计
  const projectData = calculateProjectTimeData(start, end);

  // 创建表格
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  // 创建表头
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const headers = ["项目", "颜色", "总时间", "平均每日时间", "占比", "进度条"];
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.padding = "8px";
    th.style.border = "1px solid var(--bg-tertiary)";
    th.style.backgroundColor = "var(--bg-secondary)";
    th.style.color = "var(--text-color)";
    th.style.textAlign = "center";
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格主体
  const tbody = document.createElement("tbody");

  const totalHours =
    projectData
      .filter((project) => (project.depth || 0) === 0)
      .reduce((sum, project) => sum + project.totalHours, 0) ||
    projectData.reduce((sum, project) => sum + project.totalHours, 0);

  projectData.forEach((project) => {
    const row = document.createElement("tr");

    // 项目名称
    const nameCell = document.createElement("td");
    nameCell.textContent = project.name;
    nameCell.style.padding = "8px";
    nameCell.style.border = "1px solid var(--bg-tertiary)";
    nameCell.style.backgroundColor = "var(--bg-primary)";
    nameCell.style.color = "var(--text-color)";
    nameCell.style.textAlign = "left";
    nameCell.style.paddingLeft = `${8 + Math.max(0, project.depth || 0) * 16}px`;
    row.appendChild(nameCell);

    // 颜色
    const colorCell = document.createElement("td");
    const colorBox = document.createElement("div");
    colorBox.style.width = "16px";
    colorBox.style.height = "16px";
    colorBox.style.backgroundColor =
      project.color || getProjectColor(project.name);
    colorBox.style.borderRadius = "3px";
    colorBox.style.margin = "0 auto";
    colorCell.appendChild(colorBox);
    colorCell.style.padding = "8px";
    colorCell.style.border = "1px solid var(--bg-tertiary)";
    colorCell.style.backgroundColor = "var(--bg-primary)";
    colorCell.style.textAlign = "center";
    row.appendChild(colorCell);

    // 总时间
    const totalTimeCell = document.createElement("td");
    totalTimeCell.textContent =
      project.totalHours > 0 ? `${project.totalHours.toFixed(1)}小时` : "-";
    totalTimeCell.style.padding = "8px";
    totalTimeCell.style.border = "1px solid var(--bg-tertiary)";
    totalTimeCell.style.backgroundColor = "var(--bg-primary)";
    totalTimeCell.style.color = "var(--text-color)";
    totalTimeCell.style.textAlign = "center";
    if (project.totalHours > 0) {
      totalTimeCell.style.fontWeight = "bold";
    }
    row.appendChild(totalTimeCell);

    // 平均每日时间
    const avgTimeCell = document.createElement("td");
    const daysDiff =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    const avgHours = project.totalHours / daysDiff;
    avgTimeCell.textContent =
      project.totalHours > 0 ? `${avgHours.toFixed(1)}小时` : "-";
    avgTimeCell.style.padding = "8px";
    avgTimeCell.style.border = "1px solid var(--bg-tertiary)";
    avgTimeCell.style.backgroundColor = "var(--bg-primary)";
    avgTimeCell.style.color = "var(--text-color)";
    avgTimeCell.style.textAlign = "center";
    row.appendChild(avgTimeCell);

    // 占比
    const percentageCell = document.createElement("td");
    const percentage =
      totalHours > 0 ? ((project.totalHours / totalHours) * 100).toFixed(1) : 0;
    percentageCell.textContent = totalHours > 0 ? `${percentage}%` : "-";
    percentageCell.style.padding = "8px";
    percentageCell.style.border = "1px solid var(--bg-tertiary)";
    percentageCell.style.backgroundColor = "var(--bg-primary)";
    percentageCell.style.color = "var(--text-color)";
    percentageCell.style.textAlign = "center";
    row.appendChild(percentageCell);

    // 进度条
    const progressCell = document.createElement("td");
    progressCell.style.padding = "8px";
    progressCell.style.border = "1px solid var(--bg-tertiary)";
    progressCell.style.backgroundColor = "var(--bg-primary)";

    if (totalHours > 0 && project.totalHours > 0) {
      const progressBar = document.createElement("div");
      progressBar.style.width = "100%";
      progressBar.style.height = "16px";
      progressBar.style.backgroundColor = "var(--bg-tertiary)";
      progressBar.style.borderRadius = "8px";
      progressBar.style.overflow = "hidden";

      const progressFill = document.createElement("div");
      progressFill.style.width = `${percentage}%`;
      progressFill.style.height = "100%";
      progressFill.style.backgroundColor = getProjectColor(project.name);
      progressFill.style.transition = "width 0.3s ease";

      progressBar.appendChild(progressFill);
      progressCell.appendChild(progressBar);
    } else {
      progressCell.textContent = "-";
      progressCell.style.textAlign = "center";
      progressCell.style.color = "var(--text-color)";
    }

    row.appendChild(progressCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// 计算每日时间数据
function calculateDailyTimeData(start, end, daysDiff) {
  const dailyData = [];
  const recordsByDate = statsDataIndex?.getRecordsByDateMap?.() || new Map();

  // 遍历每一天
  for (let i = 0; i < daysDiff; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);

    // 格式化日期
    const dateStr = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
    const dayName = getDayName(currentDate.getDay());

    // 过滤当天的记录
    const dayKey = statsDataIndex?.formatDateKey?.(currentDate) || "";
    const dayRecords = dayKey ? recordsByDate.get(dayKey) || [] : [];

    // 计算当天总时间
    let totalHours = 0;
    const projectHours = {};

    dayRecords.forEach((record) => {
      const timeStr = record.spendtime;
      let hours = 0;

      // 解析时间字符串
      const dayMatch = timeStr.match(/(\d+)天/);
      const hourMatch = timeStr.match(/(\d+)小时/);
      const minMatch = timeStr.match(/(\d+)分钟/);
      const lessMinMatch = timeStr.includes("小于1分钟");

      if (dayMatch) hours += parseInt(dayMatch[1]) * 24;
      if (hourMatch) hours += parseInt(hourMatch[1]);
      if (minMatch) hours += parseInt(minMatch[1]) / 60;
      if (lessMinMatch) hours += 0.5;

      totalHours += hours;
      projectHours[record.name] = (projectHours[record.name] || 0) + hours;
    });

    // 找到主要项目
    let mainProject = "";
    let maxHours = 0;
    Object.entries(projectHours).forEach(([project, hours]) => {
      if (hours > maxHours) {
        maxHours = hours;
        mainProject = project;
      }
    });

    // 转换项目数据为数组
    const projects = Object.entries(projectHours)
      .map(([name, hours]) => ({
        name,
        hours,
      }))
      .filter((project) => project.hours > 0)
      .sort(compareStatsDurationDesc);

    dailyData.push({
      date: dateStr,
      dayName: dayName,
      totalHours: totalHours,
      mainProject: mainProject,
      projects: projects,
    });
  }

  return dailyData;
}

// 计算每周时间数据
function calculateWeeklyTimeData(start, end, daysDiff) {
  const weeklyData = [];
  const dailyData = calculateDailyTimeData(start, end, daysDiff);

  // 将天数分成周（7天一周）
  const numWeeks = Math.ceil(daysDiff / 7);

  for (let week = 0; week < numWeeks; week++) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + week * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > end) weekEnd = end;

    const weekDays = Math.min(7, daysDiff - week * 7);

    // 计算本周总数据
    let weekTotalHours = 0;
    const weekProjectHours = {};

    // 遍历本周的每一天
    for (let day = 0; day < weekDays; day++) {
      const daySummary = dailyData[week * 7 + day];
      if (!daySummary) {
        continue;
      }

      weekTotalHours += daySummary.totalHours;
      daySummary.projects.forEach((project) => {
        weekProjectHours[project.name] =
          (weekProjectHours[project.name] || 0) + project.hours;
      });
    }

    // 格式化日期范围
    const dateRange = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

    // 转换项目数据为数组
    const projects = Object.entries(weekProjectHours)
      .map(([name, hours]) => ({ name, hours }))
      .filter((p) => p.hours > 0)
      .sort(compareStatsDurationDesc);

    weeklyData.push({
      dateRange: dateRange,
      totalHours: weekTotalHours,
      averageDailyHours: weekTotalHours / weekDays,
      projects: projects,
    });
  }

  return weeklyData;
}

// 计算项目时间数据
function calculateProjectTimeData(start, end) {
  if (!projectStatsApi?.createStatsContext) {
    return [];
  }

  const filteredRecords = records.filter((record) => {
    if (!record?.timestamp || !record?.spendtime) return false;
    const recordDate = new Date(record.timestamp);
    return (
      !Number.isNaN(recordDate.getTime()) &&
      recordDate >= start &&
      recordDate <= end
    );
  });

  const statsContext = createScopedStatsContext(filteredRecords);
  if (!statsContext) {
    return [];
  }
  return statsContext
    .buildAllProjectRows({ includeZero: false })
    .map((item) => ({
      name: item.label,
      totalHours: (item.valueMs || 0) / (1000 * 60 * 60),
      color: item.color,
      depth: Math.max(0, item.depth - 1),
      kind: item.kind,
    }))
    .filter((item) => item.totalHours > 0)
    .sort(compareStatsDurationDesc);
}

// 创建测试项目
function createTestProjects() {
  console.log("创建测试项目数据...");

  // 清空现有项目
  projects = [];

  const seed = Date.now();
  const makeId = (index) =>
    `stats-project-${seed}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  const testProjects = [
    { name: "工作", level: 1, color: "#79af85" },
    { name: "学习", level: 1, color: "#4299e1" },
    { name: "生活", level: 1, color: "#ed8936" },
    { name: "编程", level: 2, parentName: "工作", color: "#9f7aea" },
    { name: "会议", level: 2, parentName: "工作", color: "#48bb78" },
    { name: "英语", level: 2, parentName: "学习", color: "#38b2ac" },
    { name: "运动", level: 2, parentName: "生活", color: "#f56565" },
    { name: "计时项目", level: 3, parentName: "编程", color: "#667eea" },
    { name: "重构", level: 3, parentName: "编程", color: "#ecc94b" },
    { name: "周会记录", level: 3, parentName: "会议", color: "#ed64a6" },
    { name: "单词复习", level: 3, parentName: "英语", color: "#ff7043" },
    { name: "晨跑", level: 3, parentName: "运动", color: "#42a5f5" },
  ];

  testProjects.forEach((project, index) => {
    projects.push({
      id: makeId(index + 1),
      name: project.name,
      level: project.level,
      parentId: null,
      color: project.color,
      createdAt: new Date().toISOString(),
    });
  });

  testProjects.forEach((project) => {
    if (!project.parentName) return;
    const currentProject = projects.find((item) => item.name === project.name);
    const parentProject = projects.find(
      (item) => item.name === project.parentName,
    );
    if (currentProject && parentProject) {
      currentProject.parentId = parentProject.id;
    }
  });

  // 保存到localStorage
  try {
    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      void window.ControlerStorage.replaceCoreState({
        projects,
      });
    } else {
      localStorage.setItem("projects", JSON.stringify(projects));
    }
    syncStatsDataIndex(["projects"]);
    console.log("测试项目数据创建成功，共", projects.length, "个项目");
  } catch (e) {
    console.error("保存测试项目失败:", e);
  }
}


function initViewSelector(options = {}) {
  const shouldRender = options?.shouldRender !== false;
  const viewSelect = document.getElementById("stats-section-select");
  if (!viewSelect) {
    const shouldRestoreMainViewRange = STATS_MAIN_VIEW_MODES.has(statsViewMode);
    statsRangeState.unit = shouldRestoreMainViewRange
      ? isHeatmapToolbarViewMode()
        ? statsRememberedHeatmapRangeUnit
        : statsRememberedGeneralRangeUnit
      : normalizeStatsRangeUnit(statsRangeState.unit, "day");
    syncStatsTimeUnitOptions();
    applyStatsRange(
      statsRangeState.unit,
      shouldRestoreMainViewRange
        ? getInitialStatsAnchorForView()
        : statsRangeState.anchorDate,
      shouldRender,
    );
    return;
  }

  viewSelect.value = getStatsToolbarViewValue(statsViewMode);
  uiTools?.enhanceNativeSelect?.(viewSelect, {
    minWidth: 132,
    preferredMenuWidth: 220,
    maxMenuWidth: 260,
  });

  viewSelect.addEventListener("change", () => {
    const nextViewMode = normalizeStatsMainViewMode(viewSelect.value);
    statsViewMode = nextViewMode;
    statsRangeState.unit = isHeatmapToolbarViewMode(nextViewMode)
      ? statsRememberedHeatmapRangeUnit
      : statsRememberedGeneralRangeUnit;
    syncStatsTimeUnitOptions();
    applyStatsRange(statsRangeState.unit, getInitialStatsAnchorForView(nextViewMode));
  });

  const shouldRestoreMainViewRange = STATS_MAIN_VIEW_MODES.has(statsViewMode);
  statsRangeState.unit = shouldRestoreMainViewRange
    ? isHeatmapToolbarViewMode()
      ? statsRememberedHeatmapRangeUnit
      : statsRememberedGeneralRangeUnit
    : normalizeStatsRangeUnit(statsRangeState.unit, "day");
  syncStatsTimeUnitOptions();
  applyStatsRange(
    statsRangeState.unit,
    shouldRestoreMainViewRange
      ? getInitialStatsAnchorForView()
      : statsRangeState.anchorDate,
    shouldRender,
  );
}

function bindTableScaleLiveRefresh() {
  const rerender = () => {
    if (statsViewRefreshScheduler) {
      statsViewRefreshScheduler.schedule();
      return;
    }
    renderCurrentView();
  };
  let lastCompactLayout = isCompactMobileLayout();

  const handleResize = () => {
    const nextCompactLayout = isCompactMobileLayout();
    if (nextCompactLayout === lastCompactLayout) {
      return;
    }
    lastCompactLayout = nextCompactLayout;
    rerender();
  };

  window.addEventListener(TABLE_SIZE_EVENT_NAME, rerender);
  window.addEventListener("controler:language-changed", () => {
    if (STATS_WIDGET_CONTEXT.enabled) {
      applyStatsDesktopWidgetMode();
    }
    rerender();
  });
  window.addEventListener("resize", handleResize);
  window.addEventListener("storage", (event) => {
    if (
      event.key === TABLE_SIZE_STORAGE_KEY ||
      event.key === TABLE_SIZE_UPDATED_AT_KEY
    ) {
      rerender();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) rerender();
  });
  window.addEventListener("beforeunload", () => {
    statsViewRefreshScheduler?.cancel?.();
  });
}

let statsExternalStorageRefreshQueued = false;

function refreshStatsFromExternalStorageChange() {
  statsExternalStorageRefreshQueued = false;
  void refreshStatsRangeData(true);
}

function bindStatsExternalStorageRefresh() {
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail = event?.detail || {};
    if (!shouldRefreshStatsForExternalChange(detail)) {
      uiTools?.markPerfStage?.("refresh-skipped", {
        reason: "stats-storage-change-irrelevant",
      });
      return;
    }
    if (statsExternalStorageRefreshQueued) {
      return;
    }
    statsExternalStorageRefreshQueued = true;
    if (statsExternalStorageRefreshCoordinator) {
      statsExternalStorageRefreshCoordinator.enqueue(detail);
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(refreshStatsFromExternalStorageChange);
  });
}

function getStatsWidgetLaunchTargetMode(action = "") {
  switch (action) {
    case "show-heatmap":
      return "heatmap";
    case "show-day-pie":
      return "day-pie";
    case "show-day-line":
      return "day-line";
    case "show-week-grid":
      return "table";
    case "show-record-list":
      return "record-list";
    default:
      return "";
  }
}

function isStatsWidgetTargetVisible(action = "") {
  const expectedMode = getStatsWidgetLaunchTargetMode(action);
  const container = document.getElementById("stats-container");
  return (
    !!expectedMode &&
    statsViewMode === expectedMode &&
    container instanceof HTMLElement &&
    !!container.querySelector(".stats-section-panel")
  );
}

function clearStatsWidgetLaunchQuery() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("widgetAction")) {
    return false;
  }
  params.delete("widgetAction");
  params.delete("widgetKind");
  params.delete("widgetSource");
  params.delete("widgetLaunchId");
  params.delete("widgetAnchorDate");
  const queryText = params.toString();
  const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  return true;
}

function scheduleStatsWidgetLaunchHandled(
  payload = {},
  isHandled = () => true,
  options = {},
) {
  const launchId =
    typeof payload?.launchId === "string" && payload.launchId.trim()
      ? payload.launchId.trim()
      : "";
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  const source =
    typeof payload?.source === "string" && payload.source.trim()
      ? payload.source.trim()
      : "widget";

  const finalizeHandled = () => {
    if (options.clearQuery === true) {
      clearStatsWidgetLaunchQuery();
    }
    if (!launchId || typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return true;
    }
    window.ControlerNativeBridge.emitEvent("widgets.launchHandled", {
      launchId,
      page: "stats",
      action,
      handled: true,
      source,
    });
    return true;
  };

  if (isHandled()) {
    return finalizeHandled();
  }

  const startedAt = Date.now();
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  const waitForHandled = () => {
    if (isHandled()) {
      finalizeHandled();
      return;
    }
    if (Date.now() - startedAt >= STATS_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS) {
      return;
    }
    schedule(waitForHandled);
  };
  schedule(waitForHandled);
  return true;
}

function handleStatsWidgetLaunchAction(payload = {}, options = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (!action) {
    return false;
  }

  switch (action) {
    case "show-heatmap":
      statsViewMode = "heatmap";
      statsRangeState.unit = statsRememberedHeatmapRangeUnit;
      statsRangeState.anchorDate = getInitialStatsAnchorForView("heatmap");
      break;
    case "show-day-pie":
      statsViewMode = "day-pie";
      statsRememberedGeneralRangeUnit = "day";
      statsRangeState.unit = "day";
      statsRangeState.anchorDate = getWidgetLaunchAnchorDate(payload);
      break;
    case "show-day-line":
      statsViewMode = "day-line";
      statsRememberedGeneralRangeUnit = "day";
      statsRangeState.unit = "day";
      statsRangeState.anchorDate = getDateOnly(new Date());
      break;
    case "show-week-grid":
      statsViewMode = "table";
      statsRememberedGeneralRangeUnit = "week";
      statsRangeState.unit = "week";
      statsRangeState.anchorDate = getDateOnly(new Date());
      break;
    case "show-record-list":
      statsViewMode = "record-list";
      statsRememberedGeneralRangeUnit = "day";
      statsRangeState.unit = "day";
      statsRangeState.anchorDate = getDateOnly(new Date());
      break;
    default:
      return false;
  }

  const viewSelect = document.getElementById("stats-section-select");
  if (viewSelect) {
    viewSelect.value = getStatsToolbarViewValue(statsViewMode);
    uiTools?.refreshEnhancedSelect?.(viewSelect);
  }
  syncStatsTimeUnitOptions();
  scheduleStatsWidgetLaunchHandled(
    payload,
    () => isStatsWidgetTargetVisible(action),
    options,
  );
  if (!statsInitialDataLoaded) {
    applyStatsRange(statsRangeState.unit, statsRangeState.anchorDate, false);
    return true;
  }
  renderCurrentView();
  applyStatsRange(statsRangeState.unit, statsRangeState.anchorDate);
  return true;
}

function initStatsWidgetLaunchAction() {
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
    handleStatsWidgetLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
      launchId: params.get("widgetLaunchId") || "",
      widgetAnchorDate: params.get("widgetAnchorDate") || "",
    }, {
      clearQuery: true,
    });
  };

  window.addEventListener(eventName, (event) => {
    handleStatsWidgetLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}
async function init() {
  ensureElectronStatsCompatibilityStyles();
  const useWidgetLaunchFastPath =
    typeof STATS_WIDGET_CONTEXT.launchAction === "string" &&
    STATS_WIDGET_CONTEXT.launchAction.trim().length > 0;
  setStatsLoadingState({
    active: true,
    mode: useWidgetLaunchFastPath ? "inline" : "fullscreen",
  });
  try {
    loadStatsPreferencesFromStorage();
    applyStatsUiStateFromPreferences(statsPreferencesState);
    initStatsWidgetLaunchAction();
    registerStatsBeforePageLeaveGuard();
    if (useWidgetLaunchFastPath) {
      queueStatsToolbarReveal();
    }
    await loadData(getStatsLoadScope(), {
      fresh: true,
    });
    uiTools?.markPerfStage?.("first-data-ready", {
      rangeUnit: statsRangeState.unit,
      recordCount: records.length,
      projectCount: projects.length,
    });
    applyStatsDesktopWidgetMode();
    initTimeSelector();

    // 尺寸设置实时联动
    bindTableScaleLiveRefresh();
    initViewSelector({ shouldRender: false });
    bindStatsExternalStorageRefresh();
    renderCurrentView();
    statsInitialDataLoaded = true;
  } finally {
    setStatsLoadingState({
      active: false,
    });
    queueStatsToolbarReveal();
  }
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// 日历热图视图
function renderHeatmap(container) {
  const widgetMode = isStatsDesktopWidgetMode();
  container.innerHTML = "";
  const { shell: heatmapShell, content: viewRoot } = applyResizableViewShell(
    container,
    "heatmap",
    {
      minHeight: 520,
      minWidth: 0,
      height: 700,
    },
  );
  applyStatsPageFlowShell(heatmapShell, viewRoot);
  destroyCalHeatmapInstance();

  statsRangeState.unit = normalizeHeatmapRangeUnit(
    statsRangeState.unit || statsRememberedHeatmapRangeUnit,
  );
  heatmapState.monthCount = getSafeHeatmapMonthCount();
  syncStatsTimeUnitOptions();
  const activeRange = getStatsRangeForUnit(
    statsRangeState.unit,
    statsRangeState.anchorDate || getInitialStatsAnchorForView("heatmap"),
  );
  const rangeStart = new Date(
    activeRange.start.getFullYear(),
    activeRange.start.getMonth(),
    1,
  );
  const rangeEnd = new Date(
    activeRange.end.getFullYear(),
    activeRange.end.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const displayMonths = getMonthKeysInRange(rangeStart, rangeEnd).map((key) =>
    parseMonthKeyToDate(key, rangeStart),
  );
  const lastMonth = displayMonths[displayMonths.length - 1] || rangeStart;
  heatmapState.currentMonthKey = formatMonthKey(lastMonth);

  const heatmapScale = Math.min(
    Math.max(getTableScaleSetting("statsHeatmap", 1), 0.1),
    2.2,
  );
  const compactCellRatio = isCompactMobileLayout()
    ? MOBILE_HEATMAP_CELL_SHRINK_RATIO
    : 1;
  const cellSize = clamp(
    Math.round(28 * heatmapScale * compactCellRatio),
    14,
    52,
  );
  const cellGap = clamp(Math.round(6 * heatmapScale), 2, 12);
  const weekdayLabelWidth = clamp(Math.round(26 * heatmapScale), 18, 40);
  const palette = getHeatmapPalette();
  const checkinData = loadCheckinHeatmapData();
  const projectSelectorTree = buildProjectSelectorTree("全部项目（汇总）");
  const validProjectFilters = flattenProjectSelectorTree(
    projectSelectorTree,
  ).map((node) => node.value);
  if (!validProjectFilters.includes(heatmapState.projectFilter)) {
    heatmapState.projectFilter = projectSelectorTree[0]?.value || "all";
    saveStatsUiStateToPreferences();
  }
  applyPersistedHeatmapThresholds(heatmapState.projectFilter);

  const projectDailyMap = {};
  const checkinDailyMap = {};
  const projectHierarchyIndex = buildProjectHierarchyIndex();
  const selectedProjectId = heatmapState.projectFilter.startsWith("project:")
    ? String(heatmapState.projectFilter.split(":")[1] || "")
    : "";
  const selectedProjectIdSet = selectedProjectId
    ? collectProjectSubtreeIds(selectedProjectId, projectHierarchyIndex)
    : null;
  if (heatmapState.dataType === "project") {
    records.forEach((record) => {
      if (!record?.timestamp || !record?.spendtime) return;
      const recordDate = new Date(record.timestamp);
      if (
        Number.isNaN(recordDate.getTime()) ||
        recordDate < rangeStart ||
        recordDate > rangeEnd
      ) {
        return;
      }

      const project = findProjectForRecord(record);
      if (!recordMatchesProjectFilter(record, project, selectedProjectIdSet)) {
        return;
      }
      const hours = parseSpendTimeToHours(record.spendtime);
      if (hours <= 0) return;

      const dateText = formatDateKey(recordDate);
      if (!projectDailyMap[dateText]) {
        projectDailyMap[dateText] = { hours: 0, byProject: {} };
      }
      projectDailyMap[dateText].hours += hours;
      const projectName = project?.name || record.name || "未命名项目";
      projectDailyMap[dateText].byProject[projectName] =
        (projectDailyMap[dateText].byProject[projectName] || 0) + hours;
    });
  } else {
    const itemNameById = new Map(
      checkinData.items.map((item) => [
        item.id,
        item.title || "未命名打卡项目",
      ]),
    );
    checkinData.daily.forEach((entry) => {
      if (!entry?.date || !entry?.checked) return;
      const date = new Date(entry.date);
      if (
        Number.isNaN(date.getTime()) ||
        date < rangeStart ||
        date > rangeEnd
      ) {
        return;
      }
      if (
        heatmapState.checkinItemId !== "all" &&
        entry.itemId !== heatmapState.checkinItemId
      ) {
        return;
      }
      const dateText = formatDateKey(date);
      if (!checkinDailyMap[dateText]) {
        checkinDailyMap[dateText] = { checked: false, items: [] };
      }
      checkinDailyMap[dateText].checked = true;
      const itemName = itemNameById.get(entry.itemId) || "未命名打卡项目";
      if (!checkinDailyMap[dateText].items.includes(itemName)) {
        checkinDailyMap[dateText].items.push(itemName);
      }
    });
  }

  let activeDayCount = 0;
  if (heatmapState.dataType === "project") {
    activeDayCount = Object.values(projectDailyMap).filter(
      (dayInfo) => (dayInfo?.hours || 0) > 0,
    ).length;
  } else {
    activeDayCount = Object.values(checkinDailyMap).filter(
      (dayInfo) => !!dayInfo?.checked,
    ).length;
  }

  const root = document.createElement("div");
  root.className = "stats-heatmap-root";
  root.style.padding = widgetMode ? "12px" : "15px";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = widgetMode ? "12px" : "15px";
  root.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  root.style.minHeight = "0";

  const header = document.createElement("div");
  header.className = "stats-heatmap-header";
  header.style.display = "flex";
  header.style.flexDirection = "column";
  header.style.gap = "12px";
  header.style.padding = widgetMode ? "12px" : "15px";
  header.style.borderRadius = "12px";
  header.style.backgroundColor = "var(--bg-secondary)";
  header.style.flex = "0 0 auto";
  header.innerHTML = `
    <div class="stats-heatmap-row stats-heatmap-row--primary">
      <label class="stats-heatmap-control-group" style="color:var(--text-color); font-size:13px;">
        显示月份
        <select id="heatmap-month-count" style="padding: 6px 8px; border-radius: 8px; border: 1px solid var(--bg-tertiary); background: var(--bg-quaternary); color: var(--text-color);"></select>
      </label>
      <div class="stats-heatmap-control-group">
        <span style="color: var(--text-color); font-size: 13px;">数据类型</span>
        <select id="heatmap-data-type" style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--bg-tertiary); background: var(--bg-quaternary); color: var(--text-color);">
          <option value="project">项目时长</option>
          <option value="checkin">打卡项目</option>
        </select>
      </div>
    </div>
    <div class="stats-heatmap-row stats-heatmap-row--filters">
      <div class="stats-heatmap-control-group">
        <span id="heatmap-target-label" style="color: var(--text-color); font-size: 13px;">项目筛选</span>
        <div id="heatmap-target-control" class="stats-heatmap-target-control"></div>
      </div>
      <div id="heatmap-threshold-group" class="stats-heatmap-control-group stats-heatmap-threshold-group">
        <span style="color: var(--text-color); font-size: 13px;">浅色 ≤</span>
        <input id="heatmap-light-max" type="number" min="0" step="0.1" style="width: 72px; padding: 6px; border-radius: 8px; border: 1px solid var(--bg-tertiary); background: var(--bg-quaternary); color: var(--text-color);" />
        <span style="color: var(--text-color); font-size: 13px;">中色 ≤</span>
        <input id="heatmap-medium-max" type="number" min="0" step="0.1" style="width: 72px; padding: 6px; border-radius: 8px; border: 1px solid var(--bg-tertiary); background: var(--bg-quaternary); color: var(--text-color);" />
        <span style="color: var(--text-color); font-size: 13px;">小时</span>
      </div>
    </div>
  `;
  root.appendChild(header);

  const monthCountSelect = header.querySelector("#heatmap-month-count");
  const dataTypeSelect = header.querySelector("#heatmap-data-type");
  const targetControl = header.querySelector("#heatmap-target-control");
  const targetLabel = header.querySelector("#heatmap-target-label");
  const thresholdGroup = header.querySelector("#heatmap-threshold-group");
  const lightMaxInput = header.querySelector("#heatmap-light-max");
  const mediumMaxInput = header.querySelector("#heatmap-medium-max");

  for (let count = 1; count <= 12; count++) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count}个月`;
    monthCountSelect.appendChild(option);
  }
  monthCountSelect.value = String(heatmapState.monthCount);

  dataTypeSelect.value = heatmapState.dataType;
  lightMaxInput.value = String(heatmapState.lightMaxHours);
  mediumMaxInput.value = String(heatmapState.mediumMaxHours);
  uiTools?.enhanceNativeSelect?.(monthCountSelect, { minWidth: 112 });
  uiTools?.enhanceNativeSelect?.(dataTypeSelect, { minWidth: 132 });

  const populateTargetSelector = () => {
    targetControl.innerHTML = "";
    if (heatmapState.dataType === "project") {
      targetLabel.textContent = "项目筛选";
      thresholdGroup.style.display = "flex";
      renderProjectTreeSelector(targetControl, {
        selectedValue: heatmapState.projectFilter,
        onChange: (value) => {
          heatmapState.projectFilter = value;
          applyPersistedHeatmapThresholds(value);
          saveStatsUiStateToPreferences();
          renderHeatmap(container);
        },
        allLabel: "全部项目（汇总）",
        minWidth: 240,
        widthFactor: getExpandWidthFactor(MOBILE_HEATMAP_FILTER_WIDTH_FACTOR),
        selectorClassName: isCompactMobileLayout()
          ? "stats-heatmap-filter-mobile"
          : "",
      });
      return;
    }

    targetLabel.textContent = "打卡项目";
    thresholdGroup.style.display = "none";
    const checkinOptions = [
      { value: "all", label: "全部打卡项目" },
      ...checkinData.items.map((item) => ({
        value: item.id,
        label: item.title || "未命名打卡项目",
      })),
    ];

    const optionValues = checkinOptions.map((option) => option.value);
    if (!optionValues.includes(heatmapState.checkinItemId)) {
      heatmapState.checkinItemId = checkinOptions[0]?.value || "all";
      saveStatsUiStateToPreferences();
    }

    const targetSelect = document.createElement("select");
    targetSelect.id = "heatmap-target-select";
    targetSelect.style.padding = "6px 10px";
    targetSelect.style.borderRadius = "8px";
    targetSelect.style.border = "1px solid var(--bg-tertiary)";
    targetSelect.style.background = "var(--bg-quaternary)";
    targetSelect.style.color = "var(--text-color)";
    targetSelect.style.minWidth = "210px";
    checkinOptions.forEach((optionData) => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      targetSelect.appendChild(option);
    });
    targetSelect.value = heatmapState.checkinItemId;
    targetSelect.addEventListener("change", () => {
      heatmapState.checkinItemId = targetSelect.value;
      saveStatsUiStateToPreferences();
      renderHeatmap(container);
    });
    targetControl.appendChild(targetSelect);
    uiTools?.enhanceNativeSelect?.(targetSelect, {
      minWidth: 210,
      widthFactor: getExpandWidthFactor(MOBILE_HEATMAP_FILTER_WIDTH_FACTOR),
      menuWidthFactor: getExpandWidthFactor(MOBILE_HEATMAP_FILTER_WIDTH_FACTOR),
    });
  };
  populateTargetSelector();

  const monthPanel = document.createElement("div");
  monthPanel.className = "stats-heatmap-month-panel";
  monthPanel.style.padding = widgetMode ? "12px" : "15px";
  monthPanel.style.borderRadius = "12px";
  monthPanel.style.backgroundColor = "var(--bg-secondary)";
  monthPanel.style.display = "flex";
  monthPanel.style.flexDirection = "column";
  monthPanel.style.gap = widgetMode ? "10px" : "12px";
  monthPanel.style.minHeight = "0";
  monthPanel.style.width = "100%";
  monthPanel.style.overflow = widgetMode ? "auto" : "visible";
  monthPanel.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";

  const rangeTitle = document.createElement("div");
  rangeTitle.style.color = "var(--text-color)";
  rangeTitle.style.fontWeight = "bold";
  rangeTitle.style.fontSize = "16px";
  rangeTitle.textContent =
    displayMonths.length > 1
      ? `${formatMonthLabel(formatMonthKey(displayMonths[0]))} - ${formatMonthLabel(formatMonthKey(lastMonth))}`
      : formatMonthLabel(formatMonthKey(displayMonths[0]));
  monthPanel.appendChild(rangeTitle);

  const calendarStrip = document.createElement("div");
  calendarStrip.className = "stats-heatmap-calendar-strip";
  calendarStrip.style.display = "flex";
  calendarStrip.style.flexWrap = "wrap";
  calendarStrip.style.alignItems = "flex-start";
  calendarStrip.style.gap = "12px";
  calendarStrip.style.overflow = widgetMode ? "auto" : "visible";
  calendarStrip.style.paddingBottom = widgetMode ? "4px" : "0";
  calendarStrip.style.flex = widgetMode ? "1 1 auto" : "0 0 auto";
  monthPanel.appendChild(calendarStrip);

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  displayMonths.forEach((monthDate) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthKey = formatMonthKey(monthDate);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);

    const card = document.createElement("div");
    card.style.backgroundColor = "var(--bg-primary)";
    card.style.border = "1px solid var(--bg-tertiary)";
    card.style.borderRadius = "14px";
    card.style.padding = "12px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "10px";
    card.style.flex = widgetMode ? "0 0 auto" : "1 1 auto";
    card.style.width = "fit-content";
    card.style.maxWidth = "100%";
    card.style.minWidth = `${weekCount * cellSize + (weekCount - 1) * cellGap + weekdayLabelWidth + 38}px`;

    const cardTitle = document.createElement("div");
    cardTitle.style.color = "var(--text-color)";
    cardTitle.style.fontSize = "14px";
    cardTitle.style.fontWeight = "600";
    cardTitle.textContent = formatMonthLabel(monthKey);
    card.appendChild(cardTitle);

    const calendarBody = document.createElement("div");
    calendarBody.style.display = "flex";
    calendarBody.style.gap = `${Math.max(6, Math.round(cellGap + 2))}px`;
    card.appendChild(calendarBody);

    const weekdayColumn = document.createElement("div");
    weekdayColumn.style.display = "grid";
    weekdayColumn.style.gridTemplateRows = `repeat(7, ${cellSize}px)`;
    weekdayColumn.style.gap = `${cellGap}px`;
    weekdayColumn.style.alignItems = "center";
    weekdayColumn.style.width = `${weekdayLabelWidth}px`;
    weekdays.forEach((weekday) => {
      const label = document.createElement("div");
      label.style.color = "var(--muted-text-color)";
      label.style.fontSize = `${Math.max(10, Math.round(11 * heatmapScale))}px`;
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.justifyContent = "center";
      label.style.textAlign = "center";
      label.textContent = weekday;
      weekdayColumn.appendChild(label);
    });
    calendarBody.appendChild(weekdayColumn);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateRows = `repeat(7, ${cellSize}px)`;
    grid.style.gridTemplateColumns = `repeat(${weekCount}, ${cellSize}px)`;
    grid.style.gap = `${cellGap}px`;
    calendarBody.appendChild(grid);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      const index = firstWeekday + day - 1;
      const row = (index % 7) + 1;
      const col = Math.floor(index / 7) + 1;

      const value =
        heatmapState.dataType === "project"
          ? projectDailyMap[dateKey]?.hours || 0
          : checkinDailyMap[dateKey]?.checked
            ? 1
            : 0;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.style.gridRow = String(row);
      cell.style.gridColumn = String(col);
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      cell.style.borderRadius = `${Math.max(4, Math.round(cellSize * 0.28))}px`;
      cell.style.border = `1px solid ${palette.border}`;
      cell.style.backgroundColor = resolveHeatmapCellColor(
        Number(value || 0),
        palette,
      );
      cell.style.display = "flex";
      cell.style.alignItems = "center";
      cell.style.justifyContent = "center";
      cell.style.padding = "0";
      cell.style.cursor = "default";
      cell.style.color = "var(--muted-text-color)";
      cell.style.fontSize = `${Math.max(9, Math.round(10 * heatmapScale))}px`;
      cell.style.fontWeight = "500";
      cell.style.lineHeight = "1";
      cell.textContent = String(day);

      if (heatmapState.dataType === "project") {
        const info = projectDailyMap[dateKey];
        const detailText = info
          ? Object.entries(info.byProject || {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([name, hour]) => `${name}: ${hour.toFixed(1)}h`)
              .join("\n")
          : "";
        cell.title = info
          ? `${dateKey}\n总时长: ${info.hours.toFixed(2)}小时${detailText ? `\n${detailText}` : ""}`
          : `${dateKey}\n无记录`;
      } else {
        const info = checkinDailyMap[dateKey];
        cell.title = info?.checked
          ? `${dateKey}\n已打卡: ${info.items.slice(0, 4).join("、")}`
          : `${dateKey}\n未打卡`;
      }

      grid.appendChild(cell);
    }

    calendarStrip.appendChild(card);
  });

  const legend = document.createElement("div");
  legend.style.display = "flex";
  legend.style.flexWrap = "wrap";
  legend.style.alignItems = "center";
  legend.style.gap = "12px";
  legend.style.color = "var(--text-color)";
  legend.style.fontSize = "12px";
  if (heatmapState.dataType === "project") {
    legend.innerHTML = `
      <span>命中天数: ${activeDayCount}</span>
      <span style="display:flex; align-items:center; gap:6px;">
        <i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${palette.projectLow};border:1px solid ${palette.border};"></i>
        ≤ ${heatmapState.lightMaxHours} 小时
      </span>
      <span style="display:flex; align-items:center; gap:6px;">
        <i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${palette.projectMedium};border:1px solid ${palette.border};"></i>
        ${heatmapState.lightMaxHours} - ${heatmapState.mediumMaxHours} 小时
      </span>
      <span style="display:flex; align-items:center; gap:6px;">
        <i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${palette.projectHigh};border:1px solid ${palette.border};"></i>
        > ${heatmapState.mediumMaxHours} 小时
      </span>
    `;
  } else {
    legend.innerHTML = `
      <span>已打卡天数: ${activeDayCount}</span>
      <span style="display:flex; align-items:center; gap:6px;">
        <i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${palette.checkin};border:1px solid ${palette.border};"></i>
        当天有打卡记录
      </span>
    `;
  }

  monthPanel.appendChild(legend);
  if (heatmapState.dataType === "project") {
    monthPanel.appendChild(
      createStatsPeriodSummaryCard(getHeatmapProjectPeriodSummary()),
    );
  }
  root.appendChild(monthPanel);
  viewRoot.appendChild(root);

  monthCountSelect.addEventListener("change", () => {
    heatmapState.monthCount = clamp(parseInt(monthCountSelect.value, 10) || 1, 1, 12);
    saveStatsUiStateToPreferences();
    const nextAnchor =
      statsRangeState.unit === "year"
        ? getHeatmapYearAnchor(rangeStart.getFullYear(), heatmapState.monthCount)
        : new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    applyStatsRange(statsRangeState.unit, nextAnchor);
  });
  dataTypeSelect.addEventListener("change", () => {
    heatmapState.dataType = dataTypeSelect.value;
    if (heatmapState.dataType === "project") {
      applyPersistedHeatmapThresholds(heatmapState.projectFilter);
    }
    saveStatsUiStateToPreferences();
    renderHeatmap(container);
  });
  lightMaxInput.addEventListener("change", () => {
    const value = parseFloat(lightMaxInput.value);
    if (!Number.isNaN(value) && value >= 0) {
      heatmapState.lightMaxHours = value;
      if (heatmapState.mediumMaxHours < value) {
        heatmapState.mediumMaxHours = value;
      }
      persistHeatmapThresholdsForFilter(
        heatmapState.projectFilter,
        heatmapState.lightMaxHours,
        heatmapState.mediumMaxHours,
      );
      renderHeatmap(container);
    }
  });
  mediumMaxInput.addEventListener("change", () => {
    const value = parseFloat(mediumMaxInput.value);
    if (!Number.isNaN(value) && value >= heatmapState.lightMaxHours) {
      heatmapState.mediumMaxHours = value;
      persistHeatmapThresholdsForFilter(
        heatmapState.projectFilter,
        heatmapState.lightMaxHours,
        heatmapState.mediumMaxHours,
      );
      renderHeatmap(container);
    }
  });
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function resolveHeatmapCellColor(value, palette) {
  if (!value || value <= 0) {
    return palette.empty;
  }

  if (heatmapState.dataType === "checkin") {
    return palette.checkin;
  }

  if (value <= heatmapState.lightMaxHours) {
    return palette.projectLow;
  }

  if (value <= heatmapState.mediumMaxHours) {
    return palette.projectMedium;
  }

  return palette.projectHigh;
}

function destroyCalHeatmapInstance() {
  if (calHeatmapInstance && typeof calHeatmapInstance.destroy === "function") {
    const destroyResult = calHeatmapInstance.destroy();
    if (destroyResult && typeof destroyResult.catch === "function") {
      destroyResult.catch(() => {});
    }
  }
  calHeatmapInstance = null;
}

function loadCheckinHeatmapData() {
  try {
    const items = JSON.parse(localStorage.getItem("checkinItems") || "[]");
    const daily = JSON.parse(localStorage.getItem("dailyCheckins") || "[]");
    return {
      items: Array.isArray(items) ? items : [],
      daily: Array.isArray(daily) ? daily : [],
    };
  } catch (error) {
    console.error("加载打卡数据失败:", error);
    return { items: [], daily: [] };
  }
}

function getMonthKeysInRange(start, end) {
  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    keys.push(formatMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
}

function formatDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getHeatmapDataDateBounds(checkinData, seedDate = new Date()) {
  const seed =
    seedDate instanceof Date && !Number.isNaN(seedDate.getTime())
      ? seedDate
      : new Date();
  let minDate = new Date(seed);
  let maxDate = new Date(seed);

  const absorbDate = (raw) => {
    if (!raw) return;
    const parsed = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed < minDate) minDate = new Date(parsed);
    if (parsed > maxDate) maxDate = new Date(parsed);
  };

  records.forEach((record) => {
    absorbDate(record?.timestamp);
  });

  if (checkinData && Array.isArray(checkinData.daily)) {
    checkinData.daily.forEach((entry) => absorbDate(entry?.date));
  }

  const start = new Date(minDate.getFullYear(), minDate.getMonth() - 2, 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 1);
  return { start, end };
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isValidMonthKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function parseMonthKeyToDate(monthKey, fallbackDate = new Date()) {
  if (!isValidMonthKey(monthKey)) {
    return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
  }

  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
  }

  return new Date(year, month - 1, 1);
}

function shiftMonthKey(monthKey, deltaMonths = 0) {
  const base = parseMonthKeyToDate(monthKey, new Date());
  const shifted = new Date(
    base.getFullYear(),
    base.getMonth() + deltaMonths,
    1,
  );
  return formatMonthKey(shifted);
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year}年${parseInt(month, 10)}月`;
}

function getProjectHeatmapOptions() {
  const options = [{ value: "all", label: "全部项目（汇总）" }];
  const hierarchy = buildProjectHierarchyIndex();
  const visited = new Set();

  const labelPrefix = (depth) => {
    if (depth <= 0) return "一级";
    if (depth === 1) return "二级";
    return "三级";
  };

  const walk = (node, depth = 0) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);

    const indent = "  ".repeat(Math.min(depth, 6));
    options.push({
      value: `project:${node.id}`,
      label: `${indent}${labelPrefix(depth)} · ${node.name}`,
    });

    const children = (hierarchy.childrenByParent.get(node.id) || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    children.forEach((child) => walk(child, depth + 1));
  };

  hierarchy.roots.forEach((root) => walk(root, 0));

  hierarchy.allNodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name, "zh-CN");
    })
    .forEach((node) => walk(node, Math.max(0, (node.level || 1) - 1)));

  return options;
}

function buildProjectHierarchyIndex() {
  if (statsDataIndex?.getProjectHierarchyIndex) {
    return statsDataIndex.getProjectHierarchyIndex();
  }
  return projectStatsApi?.buildProjectHierarchyIndex?.(projects) || {
    allNodes: [],
    byId: new Map(),
    byName: new Map(),
    childrenByParent: new Map(),
    roots: [],
  };
}

function collectProjectSubtreeIds(projectId, hierarchyIndex) {
  const rootId = String(projectId || "");
  if (!rootId) return new Set();

  const result = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = hierarchyIndex.childrenByParent.get(current) || [];
    children.forEach((child) => {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    });
  }

  return result;
}

function getProjectSelectorLevelLabel(level) {
  if (level === 1) return "一级";
  if (level === 2) return "二级";
  return "三级";
}

function buildProjectSelectorTree(allLabel = "全部项目（汇总）") {
  const hierarchy = buildProjectHierarchyIndex();
  const visited = new Set();

  const createNode = (node) => {
    visited.add(node.id);
    const children = (hierarchy.childrenByParent.get(node.id) || [])
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      .map((child) => createNode(child));

    return {
      value: `project:${node.id}`,
      label: node.name,
      level: Math.min(Math.max(parseInt(node.level, 10) || 1, 1), 3),
      children,
    };
  };

  const roots = hierarchy.roots.map((root) => createNode(root));
  const detached = hierarchy.allNodes
    .filter((node) => !visited.has(node.id))
    .sort((left, right) => {
      if (left.level !== right.level) {
        return left.level - right.level;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    })
    .map((node) => createNode(node));

  return [
    {
      value: "all",
      label: allLabel,
      level: 0,
      children: [],
    },
    ...roots,
    ...detached,
  ];
}

function buildLevelSelectorTree(allLabel = "全部") {
  return [
    {
      value: "all",
      label: allLabel,
      level: 0,
      children: [],
    },
    {
      value: "1",
      label: "一级",
      level: 1,
      children: [],
    },
    {
      value: "2",
      label: "二级",
      level: 2,
      children: [],
    },
    {
      value: "3",
      label: "三级",
      level: 3,
      children: [],
    },
  ];
}

function flattenProjectSelectorTree(treeNodes) {
  const flattened = [];
  const walk = (nodes) => {
    nodes.forEach((node) => {
      flattened.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children);
      }
    });
  };
  walk(treeNodes);
  return flattened;
}

function findProjectSelectorNode(treeNodes, targetValue) {
  return flattenProjectSelectorTree(treeNodes).find(
    (node) => node.value === targetValue,
  );
}

function findProjectSelectorPathValues(treeNodes, targetValue, path = []) {
  for (const node of treeNodes) {
    const nextPath = [...path, node.value];
    if (node.value === targetValue) {
      return nextPath;
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const nestedPath = findProjectSelectorPathValues(
        node.children,
        targetValue,
        nextPath,
      );
      if (nestedPath) {
        return nestedPath;
      }
    }
  }
  return null;
}

function renderProjectTreeSelector(
  container,
  {
    selectedValue = "all",
    onChange,
    allLabel = "全部项目（汇总）",
    minWidth = 220,
    treeNodes = null,
    widthFactor = uiTools?.getDefaultExpandSurfaceWidthFactor?.() ?? 0.75,
    selectorClassName = "",
  } = {},
) {
  if (!container) return;

  const effectiveTreeNodes =
    Array.isArray(treeNodes) && treeNodes.length > 0
      ? treeNodes
      : buildProjectSelectorTree(allLabel);
  const flattened = flattenProjectSelectorTree(effectiveTreeNodes);
  const safeSelectedValue = flattened.some(
    (node) => node.value === selectedValue,
  )
    ? selectedValue
    : effectiveTreeNodes[0]?.value || "all";
  const selectedNode =
    findProjectSelectorNode(effectiveTreeNodes, safeSelectedValue) ||
    effectiveTreeNodes[0] ||
    null;
  const selectedPath = new Set(
    findProjectSelectorPathValues(effectiveTreeNodes, safeSelectedValue) || [],
  );
  const safeWidthFactor = getExpandWidthFactor(widthFactor);
  const scaledMinWidth = scaleExpandConstraint(minWidth, safeWidthFactor);
  const selectorWidth =
    uiTools?.measureExpandSurfaceWidth?.(
      flattened.map(
        (node) =>
          node.triggerLabel ||
          (node.level > 0
            ? `${node.label} ${getProjectSelectorLevelLabel(node.level)}`
            : `${node.label} 全部`),
      ),
      {
        anchor: container,
        minWidth: scaledMinWidth,
        maxWidth: Number.POSITIVE_INFINITY,
        extraPadding: 92,
        widthFactor: safeWidthFactor,
        floorWidth: Math.max(
          scaleExpandConstraint(container.offsetWidth || 0, safeWidthFactor),
          scaledMinWidth,
        ),
      },
    ) ||
    Math.max(
      scaleExpandConstraint(container.offsetWidth || 0, safeWidthFactor),
      scaledMinWidth,
    );

  container.innerHTML = "";

  const selector = document.createElement("div");
  selector.className = "tree-select";
  if (selectorClassName) {
    selector.classList.add(...selectorClassName.split(/\s+/).filter(Boolean));
  }
  selector.style.width = `${selectorWidth}px`;
  selector.style.minWidth = "0";
  selector.style.maxWidth = "100%";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tree-select-button";
  trigger.style.width = `${selectorWidth}px`;
  trigger.style.minWidth = "0";
  trigger.style.maxWidth = "100%";
  trigger.innerHTML = `
    <span class="tree-select-button-text"></span>
    <span class="tree-select-button-caret">▾</span>
  `;
  const triggerText = trigger.querySelector(".tree-select-button-text");
  if (triggerText) {
    triggerText.textContent =
      selectedNode?.triggerLabel || selectedNode?.label || allLabel;
  }

  const menu = document.createElement("div");
  menu.className = "tree-select-menu";

  const repositionMenu = () => {
    uiTools?.positionFloatingMenu?.(selector, menu, {
      minWidth: Math.max(scaledMinWidth, selectorWidth),
      preferredWidth: Math.max(selectorWidth + 8, scaledMinWidth),
      maxWidth: Math.max(
        selectorWidth + 12,
        scaleExpandConstraint(520, safeWidthFactor),
      ),
    });
  };

  const closeSelector = () => {
    selector.classList.remove("open");
    document.removeEventListener("click", handleOutsideClick, true);
    window.removeEventListener("resize", repositionMenu, true);
    window.removeEventListener("scroll", repositionMenu, true);
  };

  const openSelector = () => {
    repositionMenu();
    selector.classList.add("open");
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick, true);
      window.addEventListener("resize", repositionMenu, true);
      window.addEventListener("scroll", repositionMenu, true);
    }, 0);
  };

  const handleOutsideClick = (event) => {
    if (!selector.contains(event.target)) {
      closeSelector();
    }
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (selector.classList.contains("open")) {
      closeSelector();
      return;
    }
    openSelector();
  });

  const buildNode = (node, depth = 0) => {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-select-node";
    if (Array.isArray(node.children) && node.children.length > 0) {
      wrapper.classList.add("has-children");
    }
    if (selectedPath.has(node.value)) {
      wrapper.classList.add("is-open");
    }

    const option = document.createElement("button");
    option.type = "button";
    option.className = "tree-select-option";
    option.style.paddingLeft = `${12 + depth * 14}px`;
    if (node.value === safeSelectedValue) {
      option.classList.add("selected");
    }

    const label = document.createElement("span");
    label.className = "tree-select-option-label";
    label.textContent = node.label;
    option.appendChild(label);

    const meta = document.createElement("span");
    meta.className = "tree-select-option-meta";
    meta.textContent =
      node.level > 0 ? getProjectSelectorLevelLabel(node.level) : "全部";
    option.appendChild(meta);

    if (Array.isArray(node.children) && node.children.length > 0) {
      const expand = document.createElement("span");
      expand.className = "tree-select-expand";
      expand.textContent = "▾";
      option.appendChild(expand);
    }

    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (triggerText) {
        triggerText.textContent = node.triggerLabel || node.label;
      }
      closeSelector();
      if (typeof onChange === "function") {
        onChange(node.value);
      }
    });

    wrapper.appendChild(option);

    if (Array.isArray(node.children) && node.children.length > 0) {
      const children = document.createElement("div");
      children.className = "tree-select-children";
      node.children.forEach((child) => {
        children.appendChild(buildNode(child, depth + 1));
      });
      wrapper.appendChild(children);
    }

    return wrapper;
  };

  effectiveTreeNodes.forEach((node) => {
    menu.appendChild(buildNode(node));
  });

  selector.appendChild(trigger);
  selector.appendChild(menu);
  container.appendChild(selector);

  return {
    treeNodes: effectiveTreeNodes,
    selectedValue: safeSelectedValue,
  };
}

function findProjectForRecord(record) {
  return statsDataIndex?.getProjectForRecord?.(record) || null;
}

function parseSpendTimeToHours(spendtime) {
  if (!spendtime || typeof spendtime !== "string") return 0;

  let hours = 0;
  const dayMatch = spendtime.match(/(\d+)天/);
  const hourMatch = spendtime.match(/(\d+)小时/);
  const minuteMatch = spendtime.match(/(\d+)分钟/);
  const lessThanMinute = spendtime.includes("小于1分钟");

  if (dayMatch) hours += parseInt(dayMatch[1], 10) * 24;
  if (hourMatch) hours += parseInt(hourMatch[1], 10);
  if (minuteMatch) hours += parseInt(minuteMatch[1], 10) / 60;
  if (lessThanMinute) hours += 1 / 60;

  return hours;
}

function recordMatchesProjectFilter(
  record,
  project,
  selectedProjectIdSet = null,
  filter = heatmapState.projectFilter,
) {
  if (filter === "all") return true;

  if (filter.startsWith("project:")) {
    const projectId = String(filter.split(":")[1] || "");
    const safeSelectedSet =
      selectedProjectIdSet && selectedProjectIdSet.size > 0
        ? selectedProjectIdSet
        : new Set([projectId]);
    const recordProjectId = record?.projectId ? String(record.projectId) : "";
    const targetProjectId = project?.id ? String(project.id) : "";
    return (
      (targetProjectId && safeSelectedSet.has(targetProjectId)) ||
      (recordProjectId && safeSelectedSet.has(recordProjectId))
    );
  }

  return true;
}

function buildProjectHeatmapDailyMap(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const dayMap = {};
  const hierarchyIndex = buildProjectHierarchyIndex();
  const selectedProjectId = heatmapState.projectFilter.startsWith("project:")
    ? String(heatmapState.projectFilter.split(":")[1] || "")
    : "";
  const selectedProjectIdSet = selectedProjectId
    ? collectProjectSubtreeIds(selectedProjectId, hierarchyIndex)
    : null;

  records.forEach((record) => {
    if (!record?.timestamp || !record?.spendtime) return;

    const recordDate = new Date(record.timestamp);
    if (
      Number.isNaN(recordDate.getTime()) ||
      recordDate.getFullYear() !== year ||
      recordDate.getMonth() !== month
    ) {
      return;
    }

    const project = findProjectForRecord(record);
    if (!recordMatchesProjectFilter(record, project, selectedProjectIdSet)) {
      return;
    }

    const hours = parseSpendTimeToHours(record.spendtime);
    if (hours <= 0) return;

    const day = recordDate.getDate();
    if (!dayMap[day]) {
      dayMap[day] = { hours: 0, byProject: {} };
    }

    dayMap[day].hours += hours;
    const projectName = project?.name || record.name || "未命名项目";
    dayMap[day].byProject[projectName] =
      (dayMap[day].byProject[projectName] || 0) + hours;
  });

  Object.keys(dayMap).forEach((dayKey) => {
    const byProject = dayMap[dayKey].byProject;
    dayMap[dayKey].details = Object.entries(byProject)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);
    delete dayMap[dayKey].byProject;
  });

  return dayMap;
}

function buildCheckinHeatmapDailyMap(monthDate, checkinData) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const itemNameById = new Map(
    checkinData.items.map((item) => [item.id, item.title || "未命名打卡项目"]),
  );
  const dayMap = {};

  checkinData.daily.forEach((entry) => {
    if (!entry?.date || !entry?.checked) return;

    const date = new Date(entry.date);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month
    ) {
      return;
    }

    if (
      heatmapState.checkinItemId !== "all" &&
      entry.itemId !== heatmapState.checkinItemId
    ) {
      return;
    }

    const day = date.getDate();
    if (!dayMap[day]) {
      dayMap[day] = { checked: false, items: [] };
    }

    dayMap[day].checked = true;
    const itemName = itemNameById.get(entry.itemId) || "未命名打卡项目";
    if (!dayMap[day].items.includes(itemName)) {
      dayMap[day].items.push(itemName);
    }
  });

  return dayMap;
}

function parseCssColor(colorText) {
  if (!colorText) return null;
  const color = colorText.trim();

  const hex3 = color.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((ch) => parseInt(ch + ch, 16));
    return { r, g, b };
  }

  const hex6 = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) {
    return {
      r: parseInt(hex6[1].slice(0, 2), 16),
      g: parseInt(hex6[1].slice(2, 4), 16),
      b: parseInt(hex6[1].slice(4, 6), 16),
    };
  }

  const rgb = color.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: Math.min(255, parseInt(rgb[1], 10)),
      g: Math.min(255, parseInt(rgb[2], 10)),
      b: Math.min(255, parseInt(rgb[3], 10)),
    };
  }

  return null;
}

function getHeatmapPalette() {
  const styles = getComputedStyle(document.documentElement);
  const accent =
    parseCssColor(styles.getPropertyValue("--accent-color")) ||
    parseCssColor("#79af85");
  const tertiary =
    parseCssColor(styles.getPropertyValue("--bg-tertiary")) ||
    parseCssColor("#356047");
  const text =
    parseCssColor(styles.getPropertyValue("--text-color")) ||
    parseCssColor("#f5fff8");

  const projectLow = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.24)`;
  const projectMedium = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.48)`;
  const projectHigh = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.78)`;
  const checkin = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.72)`;
  const empty = `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, 0.28)`;
  const border = `rgba(${text.r}, ${text.g}, ${text.b}, 0.16)`;

  return {
    projectLow,
    projectMedium,
    projectHigh,
    light: projectLow,
    medium: projectMedium,
    dark: projectHigh,
    checkin,
    empty,
    border,
  };
}
