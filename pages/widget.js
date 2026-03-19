const DESKTOP_WIDGET_TYPES =
  window.ControlerPlatformContract?.getWidgetKinds?.()?.map((item) => ({
    id: item.id,
    name: item.name,
    subtitle: item.subtitle,
    page: item.page,
    action: item.action,
  })) || [];

const widgetTypeMap = new Map(
  DESKTOP_WIDGET_TYPES.map((item) => [item.id, item]),
);

window.ControlerWidgetRuntime = window.ControlerWidgetRuntime || {
  renderState: "idle",
  renderNow: null,
  lastError: null,
  lastRenderedAt: null,
  cachedPayload: null,
  cachedViewModel: null,
  cachedDataKey: "",
  pendingRefreshToken: 0,
  ignoredRefreshSections: [],
  ignoredRefreshUntil: 0,
  successfulRenderCount: 0,
  startupRetryCount: 0,
  autoRetryTimer: 0,
};

const widgetElectronApi = window.electronAPI || null;
const widgetDataIndex = window.ControlerDataIndex?.createStore?.() || null;
const WIDGET_WINDOW_OVERLAY_HEIGHT = 28;
const THEME_APPLIED_EVENT_NAME =
  window.ControlerTheme?.themeAppliedEventName || "controler:theme-applied";
const WIDGET_WEEKDAY_NAMES_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WIDGET_WEEKDAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTION_ONLY_WIDGET_TYPE_IDS = new Set(["start-timer", "write-diary"]);
const LIST_FIRST_WIDGET_TYPE_IDS = new Set(["todos", "checkins"]);
const PREVIEW_PRIMARY_WIDGET_TYPE_IDS = new Set([
  "week-grid",
  "day-pie",
  "week-view",
  "year-view",
]);
const TODO_TOGGLE_COMMAND = "toggle-todo";
const CHECKIN_TOGGLE_COMMAND = "toggle-checkin";
const WIDGET_REFRESH_DELAY_MS = 150;
const WIDGET_SELF_MUTATION_IGNORE_WINDOW_MS = 1200;
const WIDGET_INITIAL_RENDER_RETRY_DELAYS_MS = Object.freeze([180, 560]);
const WIDGET_DATA_DEPENDENCIES = Object.freeze({
  "start-timer": Object.freeze([]),
  "write-diary": Object.freeze([]),
  "day-pie": Object.freeze(["core", "records"]),
  "week-grid": Object.freeze(["core", "records"]),
  todos: Object.freeze(["core", "checkins"]),
  checkins: Object.freeze(["core", "dailyCheckins"]),
  "week-view": Object.freeze(["plans", "plansRecurring"]),
  "year-view": Object.freeze(["core"]),
});

let widgetRenderTimer = 0;
let widgetWindowChromeBound = false;
let widgetWindowControlsBound = false;
let widgetWindowHoverStateBound = false;
let widgetRuntimeErrorHandlersBound = false;

function translateWidgetUiText(value) {
  return (
    window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "")
  );
}

function isWidgetEnglish() {
  return !!window.ControlerI18n?.isEnglish?.();
}

function getWidgetDisplayName(widgetType) {
  return translateWidgetUiText(widgetType?.name || "桌面小组件");
}

function getWidgetDisplaySubtitle(widgetType) {
  return translateWidgetUiText(widgetType?.subtitle || "");
}

function clearWidgetStartupRetryTimer() {
  const runtime = window.ControlerWidgetRuntime;
  if (!runtime?.autoRetryTimer) {
    return;
  }
  window.clearTimeout(runtime.autoRetryTimer);
  runtime.autoRetryTimer = 0;
}

function createElement(tagName, className = "", text = null) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (text !== null) {
    node.textContent = text;
  }
  return node;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readWidgetThemeCssVar(propertyName, fallback = "") {
  try {
    return (
      window.getComputedStyle(document.documentElement)
        .getPropertyValue(propertyName)
        ?.trim() || fallback
    );
  } catch (error) {
    return fallback;
  }
}

function getWidgetSurfaceReferenceColor() {
  return firstNonEmpty(
    readWidgetThemeCssVar("--widget-surface-reference"),
    readWidgetThemeCssVar("--panel-strong-bg"),
    readWidgetThemeCssVar("--bg-primary"),
    "#20362b",
  );
}

function getWidgetAccentFallbackColor() {
  return firstNonEmpty(
    readWidgetThemeCssVar("--widget-accent-action-bg"),
    readWidgetThemeCssVar("--accent-color"),
    "#8ed6a4",
  );
}

function resolveWidgetShapeColor(color, fallback = "") {
  const safeFallback = firstNonEmpty(fallback, getWidgetAccentFallbackColor());
  const safeColor = firstNonEmpty(color, safeFallback);
  if (typeof window.ControlerTheme?.ensureReadableShapeColor === "function") {
    return window.ControlerTheme.ensureReadableShapeColor(
      safeColor,
      getWidgetSurfaceReferenceColor(),
      safeFallback,
      2.05,
    );
  }
  return safeColor;
}

function resolveWidgetReadableTextColor(backgroundColor, preferredTextColor = "") {
  if (typeof window.ControlerTheme?.getReadableTextColorForBackground === "function") {
    return window.ControlerTheme.getReadableTextColorForBackground(
      backgroundColor,
      preferredTextColor,
      4.1,
    );
  }
  return firstNonEmpty(
    preferredTextColor,
    readWidgetThemeCssVar("--widget-control-text"),
    readWidgetThemeCssVar("--text-color"),
    "#f5fff8",
  );
}

function createEmptyAppState() {
  return {
    records: [],
    projects: [],
    todos: [],
    checkinItems: [],
    dailyCheckins: [],
    checkins: [],
    plans: [],
    diaryEntries: [],
    diaryCategories: [],
    guideState:
      window.ControlerGuideBundle?.getDefaultGuideState?.() || {
        bundleVersion: 1,
        dismissedCardIds: [],
      },
    timerSessionState: null,
    yearlyGoals: {},
    customThemes: [],
    tableScaleSettings: {},
    selectedTheme: "default",
  };
}

function readWindowThemeColors(themeDetail = null) {
  const resolvedColors =
    themeDetail && typeof themeDetail === "object" ? themeDetail.colors || {} : {};
  const computed = window.getComputedStyle(document.documentElement);
  const readVar = (propertyName, fallback = "") =>
    computed.getPropertyValue(propertyName)?.trim() || fallback;

  return {
    backgroundColor:
      resolvedColors.primary || readVar("--bg-primary", "#243b2b"),
    overlayColor:
      resolvedColors.panelStrong ||
      readVar("--panel-strong-bg", readVar("--bg-secondary", "#20362b")),
    symbolColor: resolvedColors.text || readVar("--text-color", "#f5fff8"),
  };
}

async function syncWidgetWindowAppearance(themeDetail = null) {
  if (
    !widgetElectronApi?.isElectron ||
    typeof widgetElectronApi.windowUpdateAppearance !== "function"
  ) {
    return null;
  }

  try {
    return await widgetElectronApi.windowUpdateAppearance({
      ...readWindowThemeColors(themeDetail),
      overlayHeight: WIDGET_WINDOW_OVERLAY_HEIGHT,
    });
  } catch (error) {
    console.error("同步小组件窗口主题失败:", error);
    return null;
  }
}

function bindWidgetWindowChrome() {
  if (widgetWindowChromeBound) {
    return;
  }
  widgetWindowChromeBound = true;

  if (widgetElectronApi?.isElectron && widgetElectronApi.platform !== "darwin") {
    document.documentElement.classList.add("controler-electron-widget-root");
    document.body?.classList?.add("controler-electron-widget");
  }

  window.addEventListener(THEME_APPLIED_EVENT_NAME, (event) => {
    void syncWidgetWindowAppearance(event.detail || null);
    scheduleRender();
  });
  window.addEventListener("focus", () => {
    void syncWidgetWindowAppearance();
  });
}

function bindWindowControls() {
  if (widgetWindowControlsBound) {
    return;
  }
  widgetWindowControlsBound = true;

  const moveHandle = document.getElementById("widget-window-move");
  const closeButton = document.getElementById("widget-window-close");

  if (moveHandle && window.electronAPI?.isElectron && window.electronAPI.platform !== "darwin") {
    moveHandle.dataset.controlerMoveHandleBound = "native-drag";
    moveHandle.dataset.dragMode = "native";
    moveHandle.setAttribute("draggable", "false");
  } else if (moveHandle instanceof HTMLElement) {
    moveHandle.hidden = true;
  }

  closeButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof window.electronAPI?.windowClose === "function") {
      await window.electronAPI.windowClose();
      return;
    }
    window.close();
  });
}

function bindWindowHoverState() {
  if (widgetWindowHoverStateBound) {
    return;
  }
  widgetWindowHoverStateBound = true;

  const chrome = document.querySelector(".widget-window-chrome");
  if (!(chrome instanceof HTMLElement)) {
    return;
  }

  const hoverInsetPx = 8;
  const setHoverActive = (active) => {
    if (active) {
      chrome.dataset.hoverActive = "true";
      return;
    }
    delete chrome.dataset.hoverActive;
  };

  const isPointerWithinChrome = (clientX, clientY) => {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }
    const rect = chrome.getBoundingClientRect();
    return (
      clientX >= rect.left - hoverInsetPx &&
      clientX <= rect.right + hoverInsetPx &&
      clientY >= rect.top - hoverInsetPx &&
      clientY <= rect.bottom + hoverInsetPx
    );
  };

  const syncHoverFromEvent = (event) => {
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    setHoverActive(isPointerWithinChrome(clientX, clientY));
  };

  chrome.addEventListener("mouseenter", () => {
    setHoverActive(true);
  });
  chrome.addEventListener("focusin", () => {
    setHoverActive(true);
  });
  document.addEventListener("mousemove", syncHoverFromEvent, true);
  document.addEventListener("pointerdown", syncHoverFromEvent, true);
  window.addEventListener("blur", () => {
    setHoverActive(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      setHoverActive(false);
    }
  });
}

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || "";
  } catch (error) {
    return "";
  }
}

function getWidgetDefinition() {
  const widgetId = getQueryParam("widgetId") || `widget-${Date.now()}`;
  const widgetType =
    widgetTypeMap.get(getQueryParam("kind")) || DESKTOP_WIDGET_TYPES[0];
  return { widgetId, widgetType };
}

function updateWidgetWindowChrome(widgetType) {
  const titleText =
    widgetType && typeof widgetType.name === "string" && widgetType.name.trim()
      ? translateWidgetUiText(`${widgetType.name} 小组件`)
      : translateWidgetUiText("桌面小组件");

  document.title = titleText;
  const loadingTitle = document.getElementById("widget-loading-title");
  if (loadingTitle) {
    loadingTitle.textContent = titleText;
  }
}

async function openWidgetMainView(widgetType, extraPayload = {}) {
  if (!widgetType) {
    return;
  }

  const launchPayload =
    extraPayload && typeof extraPayload === "object" ? { ...extraPayload } : {};
  const bridge = window.ControlerWidgetsBridge || null;
  if (typeof bridge?.openMainAction === "function") {
    await bridge.openMainAction({
      page: widgetType.page,
      action: widgetType.action,
      source: "desktop-widget",
      ...launchPayload,
    });
    return;
  }

  const nextUrl = new URL(
    `${widgetType.page || "index"}.html`,
    window.location.href,
  );
  if (widgetType.action) {
    nextUrl.searchParams.set("widgetAction", widgetType.action);
    nextUrl.searchParams.set("widgetSource", "desktop-widget");
  }
  if (
    typeof launchPayload.widgetAnchorDate === "string" &&
    launchPayload.widgetAnchorDate.trim()
  ) {
    nextUrl.searchParams.set(
      "widgetAnchorDate",
      launchPayload.widgetAnchorDate.trim(),
    );
  }
  window.location.href = `${nextUrl.pathname.split("/").pop()}${nextUrl.search}`;
}

function readAppState() {
  const cachedPayload = window.ControlerWidgetRuntime?.cachedPayload;
  const nextState = {
    ...createEmptyAppState(),
    ...(cloneState(cachedPayload) || {}),
  };
  syncWidgetDataIndexFromState(nextState);
  return nextState;
}

function cloneState(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch (error) {
    return value ?? null;
  }
}

function persistAppState(nextState) {
  const safeState = {
    ...createEmptyAppState(),
    ...(cloneState(nextState) || {}),
  };
  updateWidgetRuntimeCache(safeState, {
    cachedDataKey: buildWidgetDataKey(safeState),
  });
  return safeState;
}

function commitWidgetStateMutation(mutator) {
  const nextState = cloneState(readAppState()) || createEmptyAppState();
  const result = typeof mutator === "function" ? mutator(nextState) : null;
  if (result === false || (result && result.ok === false)) {
    return result || { ok: false };
  }
  persistAppState(nextState);
  return result && typeof result === "object" ? result : { ok: true };
}

function syncWidgetDataIndexFromState(state = {}) {
  widgetDataIndex?.replaceState({
    projects: Array.isArray(state?.projects) ? state.projects : [],
    records: Array.isArray(state?.records) ? state.records : [],
    plans: Array.isArray(state?.plans) ? state.plans : [],
    diaryEntries: Array.isArray(state?.diaryEntries) ? state.diaryEntries : [],
  });
}

function buildWidgetDataKey(payload = {}) {
  try {
    return JSON.stringify(payload ?? {});
  } catch (error) {
    return `${Date.now()}`;
  }
}

function updateWidgetRuntimeCache(payload, options = {}) {
  const runtime = window.ControlerWidgetRuntime;
  if (!runtime) {
    return;
  }
  const nextPayload = {
    ...createEmptyAppState(),
    ...(cloneState(payload) || {}),
  };
  runtime.cachedPayload = nextPayload;
  runtime.cachedDataKey =
    typeof options.cachedDataKey === "string" && options.cachedDataKey
      ? options.cachedDataKey
      : buildWidgetDataKey(nextPayload);
  if (options.cachedViewModel === null) {
    runtime.cachedViewModel = null;
  } else if (options.cachedViewModel !== undefined) {
    runtime.cachedViewModel = cloneState(options.cachedViewModel);
  }
  syncWidgetDataIndexFromState(nextPayload);
}

function markWidgetSelfMutationIgnored(sections = []) {
  const runtime = window.ControlerWidgetRuntime;
  if (!runtime) {
    return;
  }
  runtime.ignoredRefreshSections = Array.from(
    new Set(
      (Array.isArray(sections) ? sections : [])
        .map((section) => String(section || "").trim())
        .filter(Boolean),
    ),
  );
  runtime.ignoredRefreshUntil = Date.now() + WIDGET_SELF_MUTATION_IGNORE_WINDOW_MS;
}

function shouldIgnoreWidgetSelfRefresh(changedSections = []) {
  const runtime = window.ControlerWidgetRuntime;
  if (!runtime || !Array.isArray(runtime.ignoredRefreshSections)) {
    return false;
  }
  if (runtime.ignoredRefreshUntil <= Date.now()) {
    runtime.ignoredRefreshSections = [];
    runtime.ignoredRefreshUntil = 0;
    return false;
  }
  const normalizedSections = (Array.isArray(changedSections) ? changedSections : [])
    .map((section) => String(section || "").trim())
    .filter(Boolean);
  if (!normalizedSections.length) {
    return false;
  }
  const ignoredSet = new Set(runtime.ignoredRefreshSections);
  const shouldIgnore = normalizedSections.every((section) => ignoredSet.has(section));
  if (shouldIgnore) {
    runtime.ignoredRefreshSections = [];
    runtime.ignoredRefreshUntil = 0;
  }
  return shouldIgnore;
}

function getDateText(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function getLocalDateText(dateValue = new Date()) {
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function truncateText(value, maxLength = 32) {
  const text = String(value ?? "").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function formatMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (isWidgetEnglish()) {
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function formatMinutesCompact(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}小时${minutes}分`;
  }
  if (hours > 0) {
    return `${hours}小时`;
  }
  return `${minutes}分`;
}

function formatTimeLabel(dateValue) {
  const date = parseDate(dateValue);
  if (!date) {
    return "";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMonthDay(dateText) {
  const date = parseDate(dateText);
  if (!date) {
    return String(dateText || "");
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatRelativeDateLabel(dateText) {
  const date = parseDate(dateText);
  if (!date) {
    return String(dateText || "");
  }

  const today = parseDate(getLocalDateText(new Date()));
  if (!today) {
    return isWidgetEnglish()
      ? `${date.getMonth() + 1}/${date.getDate()}`
      : `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  const diffDays = Math.round(
    (parseDate(getDateText(date))?.getTime() - today.getTime()) / 86400000,
  );

  if (diffDays === 0) return translateWidgetUiText("今天");
  if (diffDays === 1) return translateWidgetUiText("明天");
  if (diffDays === -1) return translateWidgetUiText("昨天");
  return isWidgetEnglish()
    ? `${date.getMonth() + 1}/${date.getDate()}`
    : `${date.getMonth() + 1}月${date.getDate()}日`;
}

function compareDateText(left, right) {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (!leftDate && !rightDate) return 0;
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  return leftDate.getTime() - rightDate.getTime();
}

function parseSpendMinutes(spendText) {
  const text = typeof spendText === "string" ? spendText : "";
  if (!text) return 0;
  const dayMatch = text.match(/(\d+)天/);
  const hourMatch = text.match(/(\d+)小时/);
  const minuteMatch = text.match(/(\d+)分钟/);
  const lessThanMinute = text.includes("小于1分钟") || text.includes("小于1min");

  let totalMinutes = 0;
  if (dayMatch) totalMinutes += parseInt(dayMatch[1], 10) * 24 * 60;
  if (hourMatch) totalMinutes += parseInt(hourMatch[1], 10) * 60;
  if (minuteMatch) totalMinutes += parseInt(minuteMatch[1], 10);
  if (lessThanMinute) totalMinutes += 1;
  return Math.max(0, totalMinutes);
}

function formatDurationFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return isWidgetEnglish() ? "< 1 min" : "小于1min";
  }

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes <= 0) {
    return isWidgetEnglish() ? "< 1 min" : "小于1min";
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const remainder = totalMinutes - days * 24 * 60;
  const hours = Math.floor(remainder / 60);
  const minutes = remainder % 60;

  if (isWidgetEnglish()) {
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }
  if (days > 0) {
    return `${days}天${hours}小时${minutes}分钟`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function normalizeProjectName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortProjectsByPath(projects = []) {
  const byId = new Map(
    (Array.isArray(projects) ? projects : []).map((project) => [project?.id, project]),
  );

  const buildPath = (project) => {
    if (!project) return "";
    const names = [project.name || "未命名项目"];
    let current = project;
    let safety = 0;
    while (current?.parentId && safety < 6) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      names.unshift(parent.name || "未命名项目");
      current = parent;
      safety += 1;
    }
    return names.join("/");
  };

  return (Array.isArray(projects) ? projects : [])
    .slice()
    .sort((left, right) => buildPath(left).localeCompare(buildPath(right), "zh-CN"));
}

function normalizeTimerSession(rawSession = null) {
  const session = rawSession && typeof rawSession === "object" ? rawSession : {};
  return {
    ptn:
      Number.isFinite(session.ptn) && session.ptn >= 0
        ? Math.max(0, Math.floor(session.ptn))
        : 0,
    fpt: typeof session.fpt === "string" ? session.fpt : null,
    lastEnteredProjectName: normalizeProjectName(session.lastEnteredProjectName),
    selectedProject: normalizeProjectName(session.selectedProject),
  };
}

function getActiveTimerInfo(state) {
  const session = normalizeTimerSession(state?.timerSessionState);
  const startedAt = parseDate(session.fpt);
  if (!startedAt || session.ptn < 1) {
    return null;
  }

  const projectName =
    session.selectedProject ||
    session.lastEnteredProjectName ||
    sortProjectsByPath(state?.projects).find((project) => normalizeProjectName(project?.name))
      ?.name ||
    "快速计时";

  return {
    session,
    startedAt,
    projectName,
    elapsedMs: Math.max(Date.now() - startedAt.getTime(), 0),
  };
}

function toggleTodoInState(state, todoId) {
  const todo = (Array.isArray(state?.todos) ? state.todos : []).find(
    (item) => String(item?.id || "") === String(todoId || ""),
  );
  if (!todo) {
    return { ok: false, message: "未找到待办事项。" };
  }
  todo.completed = !todo.completed;
  todo.completedAt = todo.completed ? new Date().toISOString() : null;
  return { ok: true, completed: todo.completed };
}

function toggleCheckinInState(state, itemId) {
  const target = (Array.isArray(state?.checkinItems) ? state.checkinItems : []).find(
    (item) => String(item?.id || "") === String(itemId || ""),
  );
  if (!target) {
    return { ok: false, message: "未找到打卡项目。" };
  }

  const today = getLocalDateText(new Date());
  if (!Array.isArray(state.dailyCheckins)) {
    state.dailyCheckins = [];
  }
  const existing = state.dailyCheckins.find(
    (entry) => String(entry?.itemId || "") === String(itemId || "") && entry?.date === today,
  );

  if (existing) {
    existing.checked = !existing.checked;
    existing.time = new Date().toISOString();
    return { ok: true, checked: existing.checked };
  }

  state.dailyCheckins.push({
    id: `daily_checkin_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    itemId: target.id,
    date: today,
    checked: true,
    time: new Date().toISOString(),
  });
  return { ok: true, checked: true };
}

function normalizeTodoSchedule(todo = {}) {
  return {
    repeatType: todo.repeatType || "none",
    repeatWeekdays: Array.isArray(todo.repeatWeekdays)
      ? todo.repeatWeekdays
          .map((item) => parseInt(item, 10))
          .filter((item) => item >= 0 && item <= 6)
      : [],
    dueDate: typeof todo.dueDate === "string" ? todo.dueDate : "",
    startDate: typeof todo.startDate === "string" ? todo.startDate : "",
    endDate: typeof todo.endDate === "string" ? todo.endDate : "",
  };
}

function todoScheduledOn(todo, dateText) {
  const schedule = normalizeTodoSchedule(todo);
  if (schedule.repeatType === "none") {
    return !!schedule.dueDate && schedule.dueDate === dateText;
  }

  const date = parseDate(dateText);
  const start = parseDate(schedule.startDate || schedule.dueDate || dateText);
  if (!date || !start) return false;

  const normalizedDate = getDateText(date);
  const normalizedStart = getDateText(start);
  if (normalizedDate < normalizedStart) return false;

  if (schedule.endDate) {
    const end = parseDate(schedule.endDate);
    if (end && normalizedDate > getDateText(end)) {
      return false;
    }
  }

  if (schedule.repeatType === "weekly") {
    return schedule.repeatWeekdays.includes(date.getDay());
  }

  return true;
}

function getTodoProgressRecords(state, todoId) {
  return (Array.isArray(state?.checkins) ? state.checkins : [])
    .filter((item) => String(item?.todoId || "") === String(todoId || ""))
    .slice()
    .sort((left, right) => new Date(right?.time || 0).getTime() - new Date(left?.time || 0).getTime());
}

function getTodoRepeatSummary(todo = {}) {
  if (todo?.repeatType === "daily") {
    return "每天重复";
  }
  if (todo?.repeatType === "weekly") {
    const weekdayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const labels = Array.isArray(todo?.repeatWeekdays)
      ? todo.repeatWeekdays
          .map((item) => parseInt(item, 10))
          .filter((item) => item >= 0 && item <= 6)
          .sort((left, right) => left - right)
          .map((item) => weekdayMap[item])
      : [];
    return `每周 ${labels.join("、") || "未设置"}`;
  }
  return todo?.dueDate ? `截止 ${formatRelativeDateLabel(todo.dueDate)}` : "待安排";
}

function getTodoDueState(todo = {}, today = getLocalDateText(new Date())) {
  if (todo?.completed) {
    return {
      eyebrow: "已完成",
      status: "已完成",
    };
  }

  if (todo?.repeatType && todo.repeatType !== "none") {
    return {
      eyebrow: getTodoRepeatSummary(todo),
      status: "今日待做",
    };
  }

  const dueDate = typeof todo?.dueDate === "string" ? todo.dueDate : "";
  if (!dueDate) {
    return {
      eyebrow: "未设置日期",
      status: "待安排",
    };
  }

  const tomorrow = (() => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    return getDateText(nextDate);
  })();

  if (dueDate < today) {
    return {
      eyebrow: `原定 ${formatRelativeDateLabel(dueDate)}`,
      status: "已逾期",
    };
  }
  if (dueDate === today) {
    return {
      eyebrow: "今天截止",
      status: "今日优先",
    };
  }
  if (dueDate === tomorrow) {
    return {
      eyebrow: "明天截止",
      status: "即将截止",
    };
  }

  return {
    eyebrow: `截止 ${formatRelativeDateLabel(dueDate)}`,
    status: "待处理",
  };
}

function getTodoCardDescription(todo = {}, progressRecords = []) {
  const description = String(todo?.description || "").trim();
  if (description) {
    return description;
  }
  const lastMessage = String(progressRecords?.[0]?.message || "").trim();
  if (lastMessage) {
    return `最近进度：${lastMessage}`;
  }
  return "保留核心信息与完成操作，点击按钮即可直接同步状态。";
}

function getTodayTodoStats(state) {
  const today = getLocalDateText(new Date());
  const scheduled = (Array.isArray(state?.todos) ? state.todos : []).filter((todo) =>
    todoScheduledOn(todo, today),
  );
  const doneCount = scheduled.filter((todo) => !!todo?.completed).length;
  return {
    total: scheduled.length,
    doneCount,
    pendingCount: Math.max(0, scheduled.length - doneCount),
  };
}

function isTodoWidgetOverdue(todo = {}, today = getLocalDateText(new Date())) {
  if (todo?.completed) {
    return false;
  }
  if (todo?.repeatType && todo.repeatType !== "none") {
    return false;
  }
  return typeof todo?.dueDate === "string" && !!todo.dueDate && todo.dueDate < today;
}

function addDaysToDateText(dateText, offset = 0) {
  const date = parseDate(dateText);
  if (!date) {
    return "";
  }
  date.setDate(date.getDate() + offset);
  return getDateText(date);
}

function getWidgetDependencySections(kind = "") {
  return WIDGET_DATA_DEPENDENCIES[String(kind || "").trim()] || [];
}

function shouldRefreshWidgetForSections(kind = "", changedSections = []) {
  const normalizedSections = (Array.isArray(changedSections) ? changedSections : [])
    .map((section) => String(section || "").trim())
    .filter(Boolean);
  if (!normalizedSections.length) {
    return true;
  }
  const dependencySections = getWidgetDependencySections(kind);
  if (!dependencySections.length) {
    return false;
  }
  return normalizedSections.some((section) => dependencySections.includes(section));
}

function getWidgetPeriodIdFromDateText(dateText = "") {
  const normalized = String(dateText || "").trim();
  return /^\d{4}-\d{2}/.test(normalized) ? normalized.slice(0, 7) : "";
}

function collectWidgetPeriodIdsBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) {
    return [];
  }
  const lower = start.getTime() <= end.getTime() ? start : end;
  const upper = start.getTime() <= end.getTime() ? end : start;
  const cursor = new Date(lower.getFullYear(), lower.getMonth(), 1);
  const target = new Date(upper.getFullYear(), upper.getMonth(), 1);
  const periodIds = [];

  while (cursor.getTime() <= target.getTime()) {
    periodIds.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return periodIds;
}

function readWidgetLocalJson(key, fallback = null) {
  try {
    const rawValue = window.localStorage.getItem(String(key || "").trim());
    if (!rawValue) {
      return fallback;
    }
    return JSON.parse(rawValue);
  } catch (error) {
    return fallback;
  }
}

function readWidgetTimerSessionState() {
  const parsed = readWidgetLocalJson("timerSessionState", null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

async function loadWidgetCoreState() {
  if (typeof window.ControlerStorage?.getCoreState === "function") {
    try {
      return (await window.ControlerStorage.getCoreState()) || {};
    } catch (error) {
      console.error("读取小组件核心状态失败:", error);
    }
  }
  return {};
}

async function loadWidgetSectionRange(section, scope = {}) {
  if (typeof window.ControlerStorage?.loadSectionRange === "function") {
    try {
      return (await window.ControlerStorage.loadSectionRange(section, scope)) || {
        items: [],
        periodIds: [],
      };
    } catch (error) {
      console.error(`读取小组件 section 失败: ${section}`, error);
    }
  }
  return {
    items: [],
    periodIds: [],
  };
}

function createWidgetStateFromCore(coreState = {}) {
  return {
    ...createEmptyAppState(),
    projects: Array.isArray(coreState?.projects) ? coreState.projects : [],
    todos: Array.isArray(coreState?.todos) ? coreState.todos : [],
    checkinItems: Array.isArray(coreState?.checkinItems) ? coreState.checkinItems : [],
    yearlyGoals:
      coreState?.yearlyGoals && typeof coreState.yearlyGoals === "object"
        ? coreState.yearlyGoals
        : {},
    customThemes: Array.isArray(coreState?.customThemes) ? coreState.customThemes : [],
    selectedTheme:
      typeof coreState?.selectedTheme === "string" && coreState.selectedTheme.trim()
        ? coreState.selectedTheme.trim()
        : "default",
  };
}

async function loadWidgetDataPayload(widgetType) {
  const widgetKind = String(widgetType?.id || "").trim();
  const todayText = getLocalDateText(new Date());

  switch (widgetKind) {
    case "start-timer":
      return {
        ...createEmptyAppState(),
        timerSessionState: readWidgetTimerSessionState(),
      };
    case "write-diary":
      return createEmptyAppState();
    case "day-pie": {
      const startDate = addDaysToDateText(todayText, -45) || todayText;
      const [coreState, recordsResult] = await Promise.all([
        loadWidgetCoreState(),
        loadWidgetSectionRange("records", {
          startDate,
          endDate: todayText,
        }),
      ]);
      return {
        ...createWidgetStateFromCore(coreState),
        records: Array.isArray(recordsResult?.items) ? recordsResult.items : [],
      };
    }
    case "week-grid": {
      const startDate = addDaysToDateText(todayText, -6);
      const [coreState, recordsResult] = await Promise.all([
        loadWidgetCoreState(),
        loadWidgetSectionRange("records", {
          startDate,
          endDate: todayText,
        }),
      ]);
      return {
        ...createWidgetStateFromCore(coreState),
        records: Array.isArray(recordsResult?.items) ? recordsResult.items : [],
      };
    }
    case "todos": {
      const previousMonthDate = addDaysToDateText(todayText, -32) || todayText;
      const [coreState, checkinsResult] = await Promise.all([
        loadWidgetCoreState(),
        loadWidgetSectionRange("checkins", {
          periodIds: Array.from(
            new Set([
              getWidgetPeriodIdFromDateText(todayText),
              getWidgetPeriodIdFromDateText(previousMonthDate),
            ].filter(Boolean)),
          ),
        }),
      ]);
      return {
        ...createWidgetStateFromCore(coreState),
        checkins: Array.isArray(checkinsResult?.items) ? checkinsResult.items : [],
      };
    }
    case "checkins": {
      const startDate = addDaysToDateText(todayText, -399);
      const [coreState, dailyCheckinsResult] = await Promise.all([
        loadWidgetCoreState(),
        loadWidgetSectionRange("dailyCheckins", {
          startDate,
          endDate: todayText,
        }),
      ]);
      return {
        ...createWidgetStateFromCore(coreState),
        dailyCheckins: Array.isArray(dailyCheckinsResult?.items)
          ? dailyCheckinsResult.items
          : [],
      };
    }
    case "week-view": {
      const endDate = addDaysToDateText(todayText, 32) || todayText;
      const [coreState, plansResult] = await Promise.all([
        loadWidgetCoreState(),
        loadWidgetSectionRange("plans", {
          periodIds: collectWidgetPeriodIdsBetween(todayText, endDate),
        }),
      ]);
      return {
        ...createWidgetStateFromCore(coreState),
        plans: [
          ...(Array.isArray(plansResult?.items) ? plansResult.items : []),
          ...(Array.isArray(coreState?.recurringPlans) ? coreState.recurringPlans : []),
        ],
      };
    }
    case "year-view": {
      const coreState = await loadWidgetCoreState();
      return createWidgetStateFromCore(coreState);
    }
    default:
      return createEmptyAppState();
  }
}

function findTodoNextScheduledDate(todo = {}, today = getLocalDateText(new Date()), maxDays = 14) {
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const dateText = addDaysToDateText(today, offset);
    if (dateText && todoScheduledOn(todo, dateText)) {
      return dateText;
    }
  }
  return "";
}

function resolveTodoWidgetSortDate(todo = {}, today = getLocalDateText(new Date())) {
  if (todoScheduledOn(todo, today)) {
    return today;
  }
  if (todo?.repeatType && todo.repeatType !== "none") {
    const nextScheduledDate = findTodoNextScheduledDate(todo, today);
    if (nextScheduledDate) {
      return nextScheduledDate;
    }
  }
  if (typeof todo?.dueDate === "string" && todo.dueDate) {
    return todo.dueDate;
  }
  if (typeof todo?.startDate === "string" && todo.startDate) {
    return todo.startDate;
  }
  if (typeof todo?.createdAt === "string" && todo.createdAt) {
    return getDateText(todo.createdAt);
  }
  return "";
}

function compareTodoWidgetPriority(left, right, today = getLocalDateText(new Date())) {
  const leftToday = todoScheduledOn(left, today);
  const rightToday = todoScheduledOn(right, today);
  if (leftToday !== rightToday) {
    return leftToday ? -1 : 1;
  }

  const leftCompleted = !!left?.completed;
  const rightCompleted = !!right?.completed;
  if (leftCompleted !== rightCompleted) {
    return Number(leftCompleted) - Number(rightCompleted);
  }

  const leftOverdue = isTodoWidgetOverdue(left, today);
  const rightOverdue = isTodoWidgetOverdue(right, today);
  if (leftOverdue !== rightOverdue) {
    return leftOverdue ? -1 : 1;
  }

  const dateCompare = compareDateText(
    resolveTodoWidgetSortDate(left, today),
    resolveTodoWidgetSortDate(right, today),
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const createdAtCompare =
    new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return String(left?.title || "").localeCompare(String(right?.title || ""), "zh-CN");
}

function getWidgetTodoItems(state, limit = 6) {
  const today = getLocalDateText(new Date());
  return (Array.isArray(state?.todos) ? state.todos : [])
    .filter((todo) => todoScheduledOn(todo, today) || !todo?.completed)
    .slice()
    .sort((left, right) => compareTodoWidgetPriority(left, right, today))
    .slice(0, limit)
    .map((todo) => {
      const progressRecords = getTodoProgressRecords(state, todo?.id || "");
      const lastProgress = progressRecords[0] || null;
      const dueState = getTodoDueState(todo, today);
      return {
        id: todo?.id || "",
        isToday: todoScheduledOn(todo, today),
        title: todo?.title || "未命名待办",
        eyebrow: dueState.eyebrow,
        badge: dueState.status,
        meta:
          progressRecords.length > 0
            ? `最近记录 ${formatTimeLabel(lastProgress?.time) || formatMonthDay(lastProgress?.time)}`
            : todo?.completed
              ? "已完成，可直接撤回"
              : "可直接在这里完成",
        note: truncateText(getTodoCardDescription(todo, progressRecords), 64),
        accent: todo?.color || "#ed8936",
        actionLabel: todo?.completed ? "撤回" : "完成",
        actionTone: todo?.completed ? "muted" : "success",
      };
    });
}

function checkinScheduledOn(item, dateText) {
  const repeatType = item?.repeatType === "weekly" ? "weekly" : "daily";
  const weekdays = Array.isArray(item?.repeatWeekdays)
    ? item.repeatWeekdays
        .map((value) => parseInt(value, 10))
        .filter((value) => value >= 0 && value <= 6)
    : [];
  const start = parseDate(item?.startDate || dateText);
  const date = parseDate(dateText);
  if (!date || !start) return false;
  const currentText = getDateText(date);
  const startText = getDateText(start);
  if (currentText < startText) return false;

  if (item?.endDate) {
    const end = parseDate(item.endDate);
    if (end && currentText > getDateText(end)) {
      return false;
    }
  }

  if (repeatType === "weekly") {
    return weekdays.includes(date.getDay());
  }
  return true;
}

function getCheckinTodayEntry(state, itemId, today = getLocalDateText(new Date())) {
  return (Array.isArray(state?.dailyCheckins) ? state.dailyCheckins : []).find(
    (entry) => String(entry?.itemId || "") === String(itemId || "") && entry?.date === today,
  );
}

function getCheckinRepeatSummary(item = {}) {
  if (item?.repeatType === "weekly") {
    const weekdayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const labels = Array.isArray(item?.repeatWeekdays)
      ? item.repeatWeekdays
          .map((value) => parseInt(value, 10))
          .filter((value) => value >= 0 && value <= 6)
          .sort((left, right) => left - right)
          .map((value) => weekdayMap[value])
      : [];
    return `每周 ${labels.join("、") || "未设置"}`;
  }
  return "每天";
}

function getCheckinStreakDays(state, itemId) {
  const target = (Array.isArray(state?.checkinItems) ? state.checkinItems : []).find(
    (item) => String(item?.id || "") === String(itemId || ""),
  );
  if (!target) {
    return 0;
  }

  const checkedSet = new Set(
    (Array.isArray(state?.dailyCheckins) ? state.dailyCheckins : [])
      .filter((entry) => String(entry?.itemId || "") === String(itemId || "") && entry?.checked)
      .map((entry) => entry?.date)
      .filter(Boolean),
  );

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!checkinScheduledOn(target, getLocalDateText(cursor))) {
    return 0;
  }

  let streak = 0;
  for (let loop = 0; loop < 400; loop += 1) {
    const currentDateText = getLocalDateText(cursor);
    if (checkinScheduledOn(target, currentDateText)) {
      if (!checkedSet.has(currentDateText)) {
        break;
      }
      streak += 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getTodayCheckinStats(state) {
  const today = getLocalDateText(new Date());
  const scheduled = (Array.isArray(state?.checkinItems) ? state.checkinItems : []).filter(
    (item) => checkinScheduledOn(item, today),
  );
  const doneCount = scheduled.filter((item) =>
    getCheckinTodayEntry(state, item?.id, today)?.checked,
  ).length;
  return {
    total: scheduled.length,
    doneCount,
    pendingCount: Math.max(0, scheduled.length - doneCount),
  };
}

function getTodayCheckinItems(state, limit = 6) {
  const today = getLocalDateText(new Date());
  return (Array.isArray(state?.checkinItems) ? state.checkinItems : [])
    .filter((item) => checkinScheduledOn(item, today))
    .slice()
    .sort((left, right) => {
      const leftChecked = !!getCheckinTodayEntry(state, left?.id, today)?.checked;
      const rightChecked = !!getCheckinTodayEntry(state, right?.id, today)?.checked;
      const checkedCompare = Number(leftChecked) - Number(rightChecked);
      if (checkedCompare !== 0) {
        return checkedCompare;
      }
      const dateCompare = compareDateText(left?.startDate || "", right?.startDate || "");
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();
    })
    .slice(0, limit)
    .map((item) => {
      const todayEntry = getCheckinTodayEntry(state, item?.id, today);
      const streak = getCheckinStreakDays(state, item?.id);
      return {
        id: item?.id || "",
        title: item?.title || "未命名打卡",
        eyebrow: getCheckinRepeatSummary(item),
        badge: todayEntry?.checked ? "已打卡" : "待打卡",
        meta: todayEntry?.checked
          ? `打卡时间 ${formatTimeLabel(todayEntry?.time) || "已记录"}`
          : "可直接在这里完成打卡",
        note: streak > 0 ? `连续 ${streak} 天` : "从今天开始保持连击",
        accent: item?.color || "#4299e1",
        actionLabel: todayEntry?.checked ? "撤回" : "打卡",
        actionTone: todayEntry?.checked ? "muted" : "accent",
      };
    });
}

function planOccursOnDate(plan, dateText) {
  if (!plan || !dateText) return false;
  const target = parseDate(dateText);
  const start = parseDate(plan?.date);
  if (!target || !start) return false;

  const excluded = Array.isArray(plan?.excludedDates) ? plan.excludedDates : [];
  if (excluded.includes(dateText)) return false;

  if (getDateText(start) === dateText) return true;
  const repeat = plan?.repeat || "none";
  if (repeat === "none") return false;
  if (target.getTime() < start.getTime()) return false;
  if (repeat === "daily") return true;
  if (repeat === "weekly") {
    const repeatDays = Array.isArray(plan?.repeatDays)
      ? plan.repeatDays
          .map((item) => parseInt(item, 10))
          .filter((item) => item >= 0 && item <= 6)
      : [];
    return repeatDays.length > 0
      ? repeatDays.includes(target.getDay())
      : start.getDay() === target.getDay();
  }
  if (repeat === "monthly") {
    return start.getDate() === target.getDate();
  }
  return false;
}

function buildWeekPlanSummary(state) {
  const base = new Date();
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return Array.from({ length: 7 }).map((_, offset) => {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const dateText = getDateText(date);
    const matches =
      widgetDataIndex?.getPlansForDate?.(dateText, planOccursOnDate) || [];
    const firstPlan = matches[0];
    return {
      title: `${dayNames[date.getDay()]} · ${date.getMonth() + 1}/${date.getDate()}`,
      dateText,
      meta:
        matches.length === 0
          ? "无计划"
          : matches.length === 1
            ? `${firstPlan?.name || "计划"} ${firstPlan?.startTime || ""}`.trim()
            : `${matches.length} 项安排`,
      accent: firstPlan?.color || "#79af85",
      count: matches.length,
      firstPlanName: firstPlan?.name || "",
    };
  });
}

function buildYearSummary(state) {
  const currentYear = new Date().getFullYear();
  const yearlyGoals =
    state.yearlyGoals && typeof state.yearlyGoals === "object" ? state.yearlyGoals : {};
  const yearGoalBucket =
    yearlyGoals[String(currentYear)] &&
    typeof yearlyGoals[String(currentYear)] === "object"
      ? yearlyGoals[String(currentYear)]
      : {};
  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ];
  const monthMinutes = Array.from({ length: 12 }, () => 0);
  const recordsByDate = widgetDataIndex?.getRecordsByDateMap?.() || new Map();

  recordsByDate.forEach((dayRecords, dateText) => {
    const date = parseDate(dateText);
    if (!date || date.getFullYear() !== currentYear) {
      return;
    }
    const monthIndex = date.getMonth();
    dayRecords.forEach((record) => {
      monthMinutes[monthIndex] += resolveRecordMinutes(record);
    });
  });

  const values = monthNames.map((label, index) => {
    const goals = Array.isArray(yearGoalBucket[String(index + 1)])
      ? yearGoalBucket[String(index + 1)]
      : [];
    return {
      label,
      minutes: monthMinutes[index],
      goalCount: goals.length,
    };
  });

  const maxMinutes = Math.max(1, ...values.map((item) => item.minutes));
  return values.map((item) => ({
    ...item,
    widthPercent: Math.max(8, Math.round((item.minutes / maxMinutes) * 100)),
  }));
}

function normalizeWidgetYearGoal(goal) {
  if (!goal || typeof goal !== "object") {
    return {
      title: "未命名目标",
      description: "",
      priority: "medium",
    };
  }

  return {
    title: String(goal.title || goal.text || "未命名目标"),
    description: String(goal.description || ""),
    priority: String(goal.priority || "medium"),
  };
}

function getYearGoalBucketForCurrentYear(state) {
  const yearlyGoals =
    state?.yearlyGoals && typeof state.yearlyGoals === "object" ? state.yearlyGoals : {};
  const currentYear = new Date().getFullYear();
  const yearBucket = yearlyGoals[String(currentYear)];
  return yearBucket && typeof yearBucket === "object" && !Array.isArray(yearBucket)
    ? yearBucket
    : {};
}

function getWidgetYearGoalList(state, scope = "annual") {
  const yearBucket = getYearGoalBucketForCurrentYear(state);
  const rawGoals = Array.isArray(yearBucket?.[scope]) ? yearBucket[scope] : [];
  return rawGoals.map((goal) => normalizeWidgetYearGoal(goal));
}

function getProjectMap(projects = []) {
  return new Map(
    (Array.isArray(projects) ? projects : []).map((project) => [project.id, project]),
  );
}

function getRecordDateText(record) {
  if (typeof record?.dateText === "string" && record.dateText) {
    return record.dateText;
  }
  const parsed = parseDate(record?.timestamp || record?.startTime || record?.endTime);
  return parsed ? getDateText(parsed) : "";
}

function resolveRecordMinutes(record) {
  if (Number.isFinite(record?.minutes) && record.minutes > 0) {
    return Math.round(record.minutes);
  }
  if (Number.isFinite(record?.durationMs) && record.durationMs > 0) {
    return Math.max(1, Math.round(record.durationMs / 60000));
  }
  return parseSpendMinutes(record?.spendtime);
}

function getWidgetRecordsForDate(state, dateText) {
  const normalizedDateText = String(dateText || "").trim();
  if (!normalizedDateText) {
    return [];
  }
  if (typeof widgetDataIndex?.getRecordsForDate === "function") {
    return widgetDataIndex.getRecordsForDate(normalizedDateText) || [];
  }
  return (Array.isArray(state?.records) ? state.records : []).filter(
    (record) => getRecordDateText(record) === normalizedDateText,
  );
}

function findLatestWidgetRecordDate(state) {
  let latestDateText = "";
  (Array.isArray(state?.records) ? state.records : []).forEach((record) => {
    const dateText = getRecordDateText(record);
    if (!dateText) {
      return;
    }
    if (!latestDateText || compareDateText(dateText, latestDateText) > 0) {
      latestDateText = dateText;
    }
  });
  return latestDateText;
}

function resolveDayPieWidgetSnapshot(state) {
  const todayText = getLocalDateText(new Date());
  const todayRecords = getWidgetRecordsForDate(state, todayText);
  const activeDateText =
    todayRecords.length > 0 ? todayText : findLatestWidgetRecordDate(state) || todayText;
  return {
    dateText: activeDateText,
    isFallback: activeDateText !== todayText,
  };
}

function buildDayPieEntries(state, dateText) {
  const projectMap = getProjectMap(state?.projects);
  const summary = new Map();
  getWidgetRecordsForDate(state, dateText).forEach((record) => {
    const project = projectMap.get(record?.projectId);
    const label = project?.name || record?.name || "未分类";
    const current = summary.get(label) || {
      label,
      color: project?.color || "#8ed6a4",
      minutes: 0,
    };
    current.minutes += resolveRecordMinutes(record);
    summary.set(label, current);
  });

  return Array.from(summary.values()).sort((left, right) => right.minutes - left.minutes);
}

function parseClockMinutes(value) {
  const parts = String(value || "").split(":");
  if (parts.length !== 2) {
    return -1;
  }

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return -1;
  }

  return Math.max(0, Math.min(1440, hours * 60 + minutes));
}

function resolvePlanDurationMinutes(plan = {}) {
  const startMinutes = parseClockMinutes(plan?.startTime);
  const endMinutes = parseClockMinutes(plan?.endTime);
  if (startMinutes < 0 || endMinutes <= startMinutes) {
    return 0;
  }
  return endMinutes - startMinutes;
}

function buildDateTextRange(startDate, dayCount = 7) {
  const start =
    parseDate(startDate) ||
    (() => {
      const fallback = new Date();
      fallback.setHours(0, 0, 0, 0);
      return fallback;
    })();
  start.setHours(0, 0, 0, 0);

  const dates = [];
  const dateTexts = [];
  const dateTextSet = new Set();
  for (let offset = 0; offset < dayCount; offset += 1) {
    const nextDate = new Date(start);
    nextDate.setDate(start.getDate() + offset);
    const dateText = getDateText(nextDate);
    dates.push(nextDate);
    dateTexts.push(dateText);
    dateTextSet.add(dateText);
  }

  return {
    dates,
    dateTexts,
    dateTextSet,
    dayCount: Math.max(1, dayCount),
  };
}

function buildRecordProjectSummary(state, startDate, dayCount = 7) {
  const range = buildDateTextRange(startDate, dayCount);
  const projectMap = getProjectMap(state?.projects);
  const summary = new Map();

  (Array.isArray(state?.records) ? state.records : []).forEach((record) => {
    const dateText = getRecordDateText(record);
    if (!range.dateTextSet.has(dateText)) {
      return;
    }

    const minutes = resolveRecordMinutes(record);
    if (minutes <= 0) {
      return;
    }

    const project = projectMap.get(record?.projectId);
    const title = project?.name || record?.name || "未分类";
    const current = summary.get(title) || {
      title,
      accent: project?.color || "#8ed6a4",
      totalMinutes: 0,
      dayMinutes: new Map(),
    };

    current.totalMinutes += minutes;
    current.dayMinutes.set(dateText, (current.dayMinutes.get(dateText) || 0) + minutes);
    summary.set(title, current);
  });

  return Array.from(summary.values())
    .map((item) => {
      let bestDayText = "";
      let bestDayMinutes = 0;
      item.dayMinutes.forEach((minutes, dateText) => {
        if (minutes > bestDayMinutes) {
          bestDayMinutes = minutes;
          bestDayText = dateText;
        }
      });

      return {
        title: item.title,
        accent: item.accent,
        totalMinutes: item.totalMinutes,
        averageMinutes: Math.round(item.totalMinutes / range.dayCount),
        activeDays: item.dayMinutes.size,
        activeAverageMinutes: Math.round(
          item.totalMinutes / Math.max(item.dayMinutes.size, 1),
        ),
        bestDayText,
        bestDayMinutes,
      };
    })
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
}

function buildUpcomingPlanSummary(state, dayCount = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const range = buildDateTextRange(today, dayCount);
  const plans = Array.isArray(state?.plans) ? state.plans : [];
  const summary = new Map();

  range.dateTexts.forEach((dateText) => {
    plans
      .filter((plan) => planOccursOnDate(plan, dateText))
      .forEach((plan) => {
        const title = String(plan?.name || "计划").trim() || "计划";
        const durationMinutes = resolvePlanDurationMinutes(plan);
        const current = summary.get(title) || {
          title,
          accent: plan?.color || "#79af85",
          totalMinutes: 0,
          dayMinutes: new Map(),
          planCount: 0,
        };

        current.planCount += 1;
        current.totalMinutes += durationMinutes;
        current.dayMinutes.set(dateText, (current.dayMinutes.get(dateText) || 0) + durationMinutes);
        summary.set(title, current);
      });
  });

  return Array.from(summary.values())
    .map((item) => {
      let bestDayText = "";
      let bestDayMinutes = 0;
      item.dayMinutes.forEach((minutes, dateText) => {
        if (minutes > bestDayMinutes) {
          bestDayMinutes = minutes;
          bestDayText = dateText;
        }
      });

      return {
        title: item.title,
        accent: item.accent,
        totalMinutes: item.totalMinutes,
        averageMinutes: Math.round(item.totalMinutes / range.dayCount),
        scheduledDays: item.dayMinutes.size,
        planCount: item.planCount,
        bestDayText,
        bestDayMinutes,
      };
    })
    .sort((left, right) => {
      if (right.totalMinutes !== left.totalMinutes) {
        return right.totalMinutes - left.totalMinutes;
      }
      return right.planCount - left.planCount;
    });
}

function resolveWidgetMetrics() {
  const width = Math.max(window.innerWidth || 0, 1);
  const height = Math.max(window.innerHeight || 0, 1);
  let sizeClass = "compact";
  if (width >= 480 || height >= 340) {
    sizeClass = "xlarge";
  } else if (width >= 320 || height >= 220) {
    sizeClass = "large";
  } else if (width >= 210 || height >= 145) {
    sizeClass = "medium";
  } else {
    sizeClass = "compact";
  }
  return {
    width,
    height,
    sizeClass,
    aspectRatio: width / Math.max(1, height),
    isWide: width >= height * 1.12,
    isTall: height >= width * 1.16,
    isSpacious: width >= 420 || height >= 280 || sizeClass === "xlarge",
  };
}

function isActionOnlyKind(kind = "") {
  return ACTION_ONLY_WIDGET_TYPE_IDS.has(String(kind || ""));
}

function isListFirstKind(kind = "") {
  return LIST_FIRST_WIDGET_TYPE_IDS.has(String(kind || ""));
}

function isPreviewPrimaryKind(kind = "") {
  return PREVIEW_PRIMARY_WIDGET_TYPE_IDS.has(String(kind || ""));
}

function shouldUseMinimalListCards(kind, metrics) {
  return (
    isListFirstKind(kind) &&
    metrics &&
    (metrics.width < 170 || metrics.height < 145)
  );
}

function shouldUseCompactListCards(kind, metrics) {
  return (
    isListFirstKind(kind) &&
    metrics &&
    (metrics.sizeClass === "compact" ||
      (metrics.sizeClass === "medium" && (metrics.width < 260 || metrics.height < 210)))
  );
}

function shouldUseMinimalPreviewSupplementaryCards(kind, metrics) {
  return (
    isPreviewPrimaryKind(kind) &&
    metrics &&
    (metrics.width < 260 || metrics.height < 190)
  );
}

function shouldUseCompactPreviewSupplementaryCards(kind, metrics) {
  return (
    isPreviewPrimaryKind(kind) &&
    metrics &&
    (metrics.sizeClass === "medium" ||
      metrics.width < 360 ||
      metrics.height < 250)
  );
}

function resolveVisibleItemCount(kind, itemCards, metrics) {
  if (!Array.isArray(itemCards) || itemCards.length === 0 || !metrics) {
    return 0;
  }
  if (!isListFirstKind(kind)) {
    return 0;
  }
  if (shouldUseMinimalListCards(kind, metrics)) {
    return Math.min(itemCards.length, metrics.height >= 168 ? 4 : 3);
  }
  if (metrics.height < 155 || metrics.width < 170) {
    return Math.min(itemCards.length, 3);
  }
  if (
    metrics.sizeClass === "medium" ||
    metrics.height < 215 ||
    metrics.width < 200
  ) {
    return Math.min(itemCards.length, 4);
  }
  if (metrics.sizeClass === "xlarge") {
    return Math.min(itemCards.length, metrics.height >= 440 ? 8 : 7);
  }
  return Math.min(itemCards.length, metrics.height >= 320 ? 7 : 6);
}

function resolvePreviewSupplementaryItemCount(kind, itemCards, metrics) {
  if (
    !Array.isArray(itemCards) ||
    itemCards.length === 0 ||
    !metrics ||
    !isPreviewPrimaryKind(kind)
  ) {
    return 0;
  }
  if (metrics.width < 200 || metrics.height < 150) {
    return 0;
  }
  if (shouldUseMinimalPreviewSupplementaryCards(kind, metrics)) {
    return 1;
  }
  if (shouldUseCompactPreviewSupplementaryCards(kind, metrics)) {
    return Math.min(itemCards.length, metrics.height >= 220 ? 2 : 1);
  }
  if (metrics.sizeClass === "xlarge") {
    return Math.min(itemCards.length, metrics.height >= 420 ? 5 : 4);
  }
  return Math.min(itemCards.length, metrics.height >= 300 ? 4 : 3);
}

function shouldShowPreview(content, metrics) {
  return !!content?.preview && !!metrics && isPreviewPrimaryKind(content.kind);
}

function shouldShowStats(content, metrics) {
  if (!content || !metrics) {
    return false;
  }
  if (isActionOnlyKind(content.kind) || isListFirstKind(content.kind)) {
    return false;
  }
  if (metrics.sizeClass === "compact") {
    return false;
  }
  return !!(content.statPrimary || content.statSecondary);
}

function shouldShowTitle(content, metrics) {
  if (!content || !content.title) {
    return false;
  }
  if (isActionOnlyKind(content.kind)) {
    return false;
  }
  if (isListFirstKind(content.kind) && shouldUseMinimalListCards(content.kind, metrics)) {
    return false;
  }
  if (isPreviewPrimaryKind(content.kind) && metrics?.sizeClass === "compact") {
    return false;
  }
  return true;
}

function shouldShowSubtitle(content, metrics) {
  if (!content || !content.subtitle) {
    return false;
  }
  if (isActionOnlyKind(content.kind)) {
    return false;
  }
  if (isListFirstKind(content.kind)) {
    return !!metrics && !shouldUseMinimalListCards(content.kind, metrics);
  }
  if (isPreviewPrimaryKind(content.kind)) {
    return !!metrics && metrics.sizeClass !== "compact";
  }
  return !!metrics && metrics.sizeClass !== "compact";
}

function resolveLineCapacity(content, metrics, hasPreview, visibleItemCount) {
  if (!content || !metrics) {
    return 0;
  }
  if (isListFirstKind(content.kind) && visibleItemCount > 0) {
    return 0;
  }
  if (isPreviewPrimaryKind(content.kind)) {
    if (metrics.sizeClass === "compact") {
      return 0;
    }
    if (metrics.sizeClass === "medium") {
      return visibleItemCount > 0 ? 1 : hasPreview ? 2 : 3;
    }
    if (metrics.sizeClass === "xlarge") {
      return visibleItemCount > 0 ? 3 : hasPreview ? 4 : 5;
    }
    return visibleItemCount > 0 ? 2 : hasPreview ? 3 : 4;
  }
  if (metrics.sizeClass === "compact") {
    return 2;
  }
  if (metrics.sizeClass === "medium") {
    return hasPreview ? 2 : 3;
  }
  if (metrics.sizeClass === "xlarge") {
    return hasPreview ? 4 : 5;
  }
  return hasPreview ? 3 : 4;
}

function resolveRecordPreviewRange(record) {
  if (!record) {
    return null;
  }

  const startDate =
    parseDate(record.startTime) ||
    parseDate(record.timestamp) ||
    parseDate(record.endTime);
  const endDate =
    parseDate(record.endTime) ||
    (startDate && Number.isFinite(record?.durationMs) && record.durationMs > 0
      ? new Date(startDate.getTime() + record.durationMs)
      : null) ||
    (startDate && resolveRecordMinutes(record) > 0
      ? new Date(startDate.getTime() + resolveRecordMinutes(record) * 60000)
      : null);

  if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) {
    return null;
  }

  return {
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
  };
}

function resolveProjectColor(record, projectMap) {
  return projectMap.get(record?.projectId)?.color || "#8ed6a4";
}

function buildWeekGridRows(state) {
  const rows = [];
  const rowMap = new Map();
  const startDay = new Date();
  startDay.setHours(0, 0, 0, 0);
  startDay.setDate(startDay.getDate() - 6);
  const todayText = getLocalDateText(new Date());

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(startDay);
    day.setDate(startDay.getDate() + offset);
    const dateText = getDateText(day);
    const row = {
      label: todayText === dateText ? "今天" : WIDGET_WEEKDAY_NAMES_ZH[day.getDay()],
      dateText,
      today: todayText === dateText,
      segments: [],
      totalMinutes: 0,
    };
    rows.push(row);
    rowMap.set(dateText, row);
  }

  const projectMap = getProjectMap(state?.projects);
  (Array.isArray(state?.records) ? state.records : []).forEach((record) => {
    const range = resolveRecordPreviewRange(record);
    if (!range) {
      return;
    }

    const cursor = new Date(range.startMs);
    cursor.setHours(0, 0, 0, 0);
    const lastDay = new Date(Math.max(range.startMs, range.endMs - 1));
    lastDay.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= lastDay.getTime()) {
      const row = rowMap.get(getLocalDateText(cursor));
      if (row) {
        const dayStart = cursor.getTime();
        const dayEnd = dayStart + 86400000;
        const overlapStart = Math.max(range.startMs, dayStart);
        const overlapEnd = Math.min(range.endMs, dayEnd);
        if (overlapEnd > overlapStart) {
          const startMinutes = Math.max(
            0,
            Math.floor((overlapStart - dayStart) / 60000),
          );
          const endMinutes = Math.min(
            1440,
            Math.max(startMinutes + 1, Math.ceil((overlapEnd - dayStart) / 60000)),
          );
          const overlapMinutes = Math.max(
            1,
            Math.ceil((overlapEnd - overlapStart) / 60000),
          );
          row.totalMinutes += overlapMinutes;
          row.segments.push({
            label: truncateText(record?.name || "未分类", 10),
            detail: formatMinutesCompact(overlapMinutes),
            color: resolveProjectColor(record, projectMap),
            startMinutes,
            endMinutes,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  rows.forEach((row) => {
    row.segments.sort((left, right) => left.startMinutes - right.startMinutes);
  });

  return rows;
}

function buildWeekViewRows(state) {
  const plans = Array.isArray(state?.plans) ? state.plans : [];
  const base = new Date();
  const rows = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(base);
    day.setHours(0, 0, 0, 0);
    day.setDate(base.getDate() + offset);
    const dateText = getDateText(day);
    const matches = plans.filter((plan) => planOccursOnDate(plan, dateText));
    const segments = matches
      .map((plan) => {
        const startParts = String(plan?.startTime || "").split(":");
        const endParts = String(plan?.endTime || "").split(":");
        const startMinutes =
          startParts.length === 2
            ? Math.max(
                0,
                Math.min(
                  1440,
                  parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10),
                ),
              )
            : -1;
        const endMinutes =
          endParts.length === 2
            ? Math.max(
                0,
                Math.min(
                  1440,
                  parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10),
                ),
              )
            : -1;

        if (startMinutes < 0 || endMinutes <= startMinutes) {
          return null;
        }

        return {
          label: truncateText(plan?.name || "计划", 10),
          detail: `${plan.startTime}-${plan.endTime}`,
          color: plan?.color || "#79af85",
          startMinutes,
          endMinutes,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.startMinutes - right.startMinutes);

    rows.push({
      label:
        offset === 0
          ? "今天"
          : offset === 1
            ? "明天"
            : WIDGET_WEEKDAY_NAMES_ZH[day.getDay()],
      dateText,
      today: offset === 0,
      segments,
      totalMinutes: segments.reduce(
        (sum, segment) => sum + Math.max(0, segment.endMinutes - segment.startMinutes),
        0,
      ),
    });
  }

  return rows;
}

function buildYearPreviewData(state) {
  const annualGoals = getWidgetYearGoalList(state, "annual");
  const currentMonthScope = String(new Date().getMonth() + 1);
  const monthGoals = getWidgetYearGoalList(state, currentMonthScope);
  return {
    annualGoals,
    monthGoals,
  };
}

function createBaseContent(widgetType) {
  return {
    kind: widgetType?.id || "",
    title: getWidgetDisplayName(widgetType),
    subtitle: getWidgetDisplaySubtitle(widgetType),
    page: widgetType?.page || "index",
    action: widgetType?.action || "",
    actionLabel: translateWidgetUiText("打开应用"),
    actionOnly: false,
    statPrimary: "",
    statSecondary: "",
    lines: [],
    itemCards: [],
    preview: null,
    launchPayload: null,
  };
}

function buildRecordSummaryItemCards(summaryItems, actionLabel) {
  return summaryItems.map((item) => ({
    title: item.title,
    badge: `${translateWidgetUiText("总计")} ${formatMinutesCompact(item.totalMinutes)}`,
    meta: translateWidgetUiText(
      `日均 ${formatMinutesCompact(item.averageMinutes)} · 实际日 ${formatMinutesCompact(item.activeAverageMinutes)}`,
    ),
    note: translateWidgetUiText(`有效 ${item.activeDays} 天`),
    accent: item.accent,
    actionLabel,
    actionTone: "accent",
  }));
}

function buildPlanSummaryItemCards(summaryItems, actionLabel) {
  return summaryItems.map((item) => ({
    title: item.title,
    badge: `${translateWidgetUiText("安排")} ${item.planCount} ${translateWidgetUiText("项")}`,
    meta: translateWidgetUiText(`${item.scheduledDays} 天安排`),
    note:
      item.bestDayText
        ? translateWidgetUiText(`${formatRelativeDateLabel(item.bestDayText)} 安排较多`)
        : translateWidgetUiText("打开原页查看完整周计划。"),
    accent: item.accent,
    actionLabel,
    actionTone: "accent",
  }));
}

function fillStartTimerContent(content, state) {
  const activeTimer = getActiveTimerInfo(state);
  content.actionOnly = true;
  content.subtitle = "";
  content.actionLabel = translateWidgetUiText(activeTimer ? "记录" : "开始计时");
}

function fillWriteDiaryContent(content) {
  content.actionOnly = true;
  content.subtitle = "";
  content.actionLabel = translateWidgetUiText("写日记");
}

function fillWeekGridContent(content, state) {
  const rows = buildWeekGridRows(state);
  const projectSummary = buildRecordProjectSummary(
    state,
    rows[0]?.dateText || getLocalDateText(new Date()),
    rows.length || 7,
  );
  content.subtitle = translateWidgetUiText("近 7 天时间分布");
  content.preview = {
    kind: "timeline",
    rows,
    emptyText: translateWidgetUiText("暂无时间记录"),
    showRowTotals: true,
  };
  content.itemCards = buildRecordSummaryItemCards(
    projectSummary.slice(0, 8),
    translateWidgetUiText("查看记录"),
  );
}

function fillDayPieContent(content, state) {
  const pieSnapshot = resolveDayPieWidgetSnapshot(state);
  const entries = buildDayPieEntries(state, pieSnapshot.dateText);
  const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
  content.subtitle = pieSnapshot.isFallback
    ? `${formatRelativeDateLabel(pieSnapshot.dateText)} ${translateWidgetUiText("项目占比")}`
    : translateWidgetUiText("今日项目占比");
  content.preview = {
    kind: "pie",
    entries,
    totalMinutes,
  };
  content.launchPayload =
    typeof pieSnapshot.dateText === "string" && pieSnapshot.dateText
      ? {
          widgetAnchorDate: pieSnapshot.dateText,
        }
      : null;
  if (totalMinutes <= 0) {
    return;
  }
  content.statPrimary = `${translateWidgetUiText("总计")} ${formatMinutes(totalMinutes)}`;
  content.statSecondary = `${translateWidgetUiText("项目")} ${entries.length} ${translateWidgetUiText("个")}`;
}

function fillTodosContent(content, state) {
  const stats = getTodayTodoStats(state);
  const pendingCount = (Array.isArray(state?.todos) ? state.todos : []).filter(
    (todo) => !todo?.completed,
  ).length;
  const items = getWidgetTodoItems(state, 5).map((item) => ({
    ...item,
    command: TODO_TOGGLE_COMMAND,
    targetId: item.id,
  }));
  const hasSupplementalItems = items.some((item) => !item.isToday);
  content.subtitle = translateWidgetUiText(stats.total > 0 ? "今日待办" : "待处理待办");
  content.actionLabel = translateWidgetUiText("打开待办");
  content.statPrimary = `${translateWidgetUiText("今日")} ${stats.total} ${translateWidgetUiText("项")}`;
  content.statSecondary = `${translateWidgetUiText("待处理")} ${pendingCount} ${translateWidgetUiText("项")}`;
  if (items.length === 0) {
    content.lines.push(translateWidgetUiText("当前没有待处理的待办。"));
    content.lines.push(translateWidgetUiText("打开应用创建新的待办事项。"));
    return;
  }
  content.lines.push(
    translateWidgetUiText(
      hasSupplementalItems
        ? "优先展示今日待办，不足时补充最近待处理项。"
        : "下方卡片可直接完成或撤回。",
    ),
  );
  content.itemCards = items;
}

function fillCheckinsContent(content, state) {
  const stats = getTodayCheckinStats(state);
  const items = getTodayCheckinItems(state, 5).map((item) => ({
    ...item,
    command: CHECKIN_TOGGLE_COMMAND,
    targetId: item.id,
  }));
  content.subtitle = translateWidgetUiText("今日打卡");
  content.actionLabel = translateWidgetUiText("打开打卡");
  content.statPrimary = `${translateWidgetUiText("完成")} ${stats.doneCount}/${stats.total}`;
  content.statSecondary =
    stats.total > 0 && stats.doneCount >= stats.total
      ? translateWidgetUiText("今日已清空")
      : translateWidgetUiText("仍有待打卡");
  if (items.length === 0) {
    content.lines.push(translateWidgetUiText("今天暂无打卡任务。"));
    content.lines.push(translateWidgetUiText("打开应用创建新的打卡项目。"));
    return;
  }
  content.lines.push(translateWidgetUiText("下方卡片可逐项打卡或撤回。"));
  content.itemCards = items;
}

function fillWeekViewContent(content, state) {
  const rows = buildWeekViewRows(state);
  const upcomingPlanSummary = buildUpcomingPlanSummary(state, rows.length || 7);
  content.subtitle = translateWidgetUiText("未来 7 天计划");
  content.preview = {
    kind: "timeline",
    rows,
    emptyText: translateWidgetUiText("暂无计划安排"),
    showRowTotals: false,
  };
  content.itemCards = buildPlanSummaryItemCards(
    upcomingPlanSummary.slice(0, 8),
    translateWidgetUiText("查看计划"),
  );
}

function fillYearViewContent(content, state) {
  content.subtitle = translateWidgetUiText("年度目标");
  content.preview = {
    kind: "goals",
    ...buildYearPreviewData(state),
  };
}

function buildWidgetContent(widgetType, state) {
  const content = createBaseContent(widgetType);
  switch (widgetType?.id) {
    case "start-timer":
      fillStartTimerContent(content, state);
      break;
    case "write-diary":
      fillWriteDiaryContent(content, state);
      break;
    case "week-grid":
      fillWeekGridContent(content, state);
      break;
    case "day-pie":
      fillDayPieContent(content, state);
      break;
    case "todos":
      fillTodosContent(content, state);
      break;
    case "checkins":
      fillCheckinsContent(content, state);
      break;
    case "week-view":
      fillWeekViewContent(content, state);
      break;
    case "year-view":
      fillYearViewContent(content, state);
      break;
    default:
      content.lines.push(translateWidgetUiText("当前小组件类型暂未定义。"));
      break;
  }
  return content;
}

function buildEmptyState(
  message = "当前还没有可显示的数据。",
  detail = "数据会在你下一次记录、计划或打卡后自动同步到这里。",
) {
  const empty = createElement("div", "widget-empty");
  empty.appendChild(createElement("div", "widget-empty-title", translateWidgetUiText(message)));
  empty.appendChild(
    createElement("div", "widget-empty-detail", translateWidgetUiText(detail)),
  );
  return empty;
}

function normalizeWidgetRuntimeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const message =
      typeof error.reason === "string"
        ? error.reason
        : typeof error.message === "string"
          ? error.message
          : "";
    if (message.trim()) {
      return message.trim();
    }
  }
  return "小组件内容未能成功加载，请重试或打开原页。";
}

function buildWidgetErrorState(widgetType, error) {
  const shell = createElement("section", "widget-state-shell widget-state-shell--error");
  shell.appendChild(createElement("div", "widget-state-title", translateWidgetUiText("加载失败")));
  shell.appendChild(
    createElement(
      "div",
      "widget-state-detail",
      translateWidgetUiText(normalizeWidgetRuntimeErrorMessage(error)),
    ),
  );

  const actions = createElement("div", "widget-state-actions");

  const retryButton = createElement(
    "button",
    "widget-state-btn widget-state-btn--primary",
    translateWidgetUiText("重试"),
  );
  retryButton.type = "button";
  retryButton.addEventListener("click", () => {
    scheduleRender();
  });
  actions.appendChild(retryButton);

  const openButton = createElement(
    "button",
    "widget-state-btn",
    translateWidgetUiText("打开原页"),
  );
  openButton.type = "button";
  openButton.addEventListener("click", () => {
    void openWidgetMainView(widgetType);
  });
  actions.appendChild(openButton);

  shell.appendChild(actions);
  return shell;
}

function buildStatsRow(content) {
  const row = createElement("div", "widget-stats");
  if (content.statPrimary) {
    row.appendChild(createElement("div", "widget-stat-pill", content.statPrimary));
  }
  if (content.statSecondary) {
    row.appendChild(createElement("div", "widget-stat-pill", content.statSecondary));
  }
  return row;
}

function buildLinesNode(lines, lineCapacity) {
  if (!Array.isArray(lines) || lineCapacity <= 0) {
    return null;
  }
  const visibleLines = lines.filter(Boolean).slice(0, lineCapacity);
  if (visibleLines.length === 0) {
    return null;
  }
  const wrapper = createElement("div", "widget-lines");
  visibleLines.forEach((line) => {
    wrapper.appendChild(createElement("div", "widget-line", line));
  });
  return wrapper;
}

function buildActionOnlyNode(widgetType, content) {
  const wrapper = createElement("div", "widget-action-only-shell");
  const button = createElement(
    "button",
    "widget-action-only-button",
    content.actionLabel || getWidgetDisplayName(widgetType),
  );
  button.type = "button";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openWidgetMainView(widgetType, content?.launchPayload);
  });
  wrapper.appendChild(button);
  return wrapper;
}

function buildHeaderNode(content, metrics) {
  if (!shouldShowTitle(content, metrics) && !shouldShowSubtitle(content, metrics)) {
    return null;
  }

  const header = createElement("div", "widget-card-header");
  if (shouldShowTitle(content, metrics)) {
    header.appendChild(createElement("div", "widget-card-title", content.title));
  }
  if (shouldShowSubtitle(content, metrics)) {
    header.appendChild(createElement("div", "widget-card-subtitle", content.subtitle));
  }
  return header;
}

function getSegmentText(segment, metrics) {
  const widthPercent = ((segment.endMinutes - segment.startMinutes) / 1440) * 100;
  if (metrics.sizeClass === "compact" || widthPercent < 12) {
    return "";
  }
  if (widthPercent >= 22 && segment.detail) {
    return `${segment.label} ${segment.detail}`;
  }
  if (widthPercent >= 16) {
    return segment.label;
  }
  return segment.detail || "";
}

function buildTimelinePreviewNode(preview, metrics) {
  const wrapper = createElement("div", "widget-preview widget-preview--timeline");
  const showLabels = metrics.width >= 120;
  const showEmptyText = metrics.sizeClass !== "compact";
  const showRowTotals = preview?.showRowTotals !== false;
  const hasAnySegments = preview.rows.some((row) => row.segments.length > 0);
  if (metrics.width < 220) {
    wrapper.classList.add("is-compact");
  }
  if (metrics.isSpacious) {
    wrapper.classList.add("is-spacious");
  }

  preview.rows.forEach((row) => {
    const rowNode = createElement("div", "widget-timeline-row");
    if (row.today) {
      rowNode.classList.add("is-today");
    }

    if (showLabels) {
      const labelText =
        showRowTotals && metrics.isSpacious && row.totalMinutes > 0
          ? `${row.label} ${formatMinutesCompact(row.totalMinutes)}`
          : row.label;
      rowNode.appendChild(createElement("div", "widget-timeline-label", labelText));
    }

    const track = createElement("div", "widget-timeline-track");
    track.appendChild(createElement("div", "widget-timeline-grid"));

    if (row.segments.length === 0) {
      track.appendChild(createElement("div", "widget-timeline-placeholder"));
    }

    row.segments.forEach((segment) => {
      const segmentNode = createElement("div", "widget-timeline-segment");
      const leftPercent = (segment.startMinutes / 1440) * 100;
      const widthPercent = Math.max(
        1.2,
        ((segment.endMinutes - segment.startMinutes) / 1440) * 100,
      );
      segmentNode.style.left = `${leftPercent}%`;
      segmentNode.style.width = `${Math.min(100 - leftPercent, widthPercent)}%`;
      const segmentColor = resolveWidgetShapeColor(segment.color);
      segmentNode.style.background = segmentColor;
      segmentNode.style.color = resolveWidgetReadableTextColor(
        segmentColor,
        readWidgetThemeCssVar("--widget-accent-action-text"),
      );
      const segmentText = getSegmentText(segment, metrics);
      if (segmentText) {
        segmentNode.textContent = segmentText;
      }
      track.appendChild(segmentNode);
    });

    rowNode.appendChild(track);
    wrapper.appendChild(rowNode);
  });

  if (!hasAnySegments && showEmptyText && preview.emptyText) {
    wrapper.appendChild(createElement("div", "widget-preview-empty", preview.emptyText));
  }
  return wrapper;
}

function buildPiePreviewNode(preview, metrics) {
  const wrapper = createElement("div", "widget-preview widget-preview--pie");
  const legendLimit =
    metrics.sizeClass === "xlarge"
      ? 6
      : metrics.sizeClass === "large"
        ? 5
        : metrics.width < 220
          ? 3
          : 4;
  const donutSize = Math.max(
    metrics.sizeClass === "compact" ? 68 : metrics.sizeClass === "medium" ? 80 : 92,
    Math.min(
      Math.round(
        metrics.width *
          (metrics.sizeClass === "xlarge"
            ? 0.34
            : metrics.sizeClass === "large"
              ? 0.34
              : metrics.sizeClass === "medium"
                ? 0.3
                : 0.26),
      ),
      Math.round(metrics.height * (metrics.isSpacious ? 0.74 : 0.66)),
      metrics.sizeClass === "xlarge" ? 236 : metrics.sizeClass === "large" ? 192 : 132,
    ),
  );
  if (metrics.width < 220) {
    wrapper.classList.add("is-compact");
  }
  if (metrics.isSpacious) {
    wrapper.classList.add("is-spacious");
  }
  wrapper.style.setProperty("--widget-pie-size", `${donutSize}px`);

  const donutShell = createElement("div", "widget-pie-shell");
  const donut = createElement("div", "widget-pie-donut");
  donutShell.style.setProperty("--widget-pie-size", `${donutSize}px`);
  const limitedEntries = preview.entries.slice(0, legendLimit).map((entry) => ({
    ...entry,
    widgetColor: resolveWidgetShapeColor(entry.color),
  }));
  if (limitedEntries.length === 0 || preview.totalMinutes <= 0) {
    donut.style.background =
      "conic-gradient(var(--widget-chart-track-bg, rgba(255,255,255,0.14)) 0deg 360deg)";
  } else {
    let angle = 0;
    const parts = limitedEntries.map((entry) => {
      const sweep = (entry.minutes / Math.max(1, preview.totalMinutes)) * 360;
      const start = angle;
      angle += sweep;
      return `${entry.widgetColor} ${start}deg ${angle}deg`;
    });
    donut.style.background = `conic-gradient(${parts.join(", ")})`;
  }
  donutShell.appendChild(donut);

  wrapper.appendChild(donutShell);

  const legend = createElement("div", "widget-pie-legend");
  if (metrics.isSpacious) {
    legend.classList.add("is-spacious");
  }
  if (limitedEntries.length === 0 || preview.totalMinutes <= 0) {
    legend.appendChild(
      createElement("div", "widget-preview-empty", translateWidgetUiText("暂无统计数据")),
    );
  } else {
    limitedEntries.forEach((entry) => {
      const item = createElement("div", "widget-pie-legend-item");
      const dot = createElement("span", "widget-pie-legend-dot");
      dot.style.background = entry.widgetColor;
      item.appendChild(dot);
      const percent = Math.round((entry.minutes / Math.max(1, preview.totalMinutes)) * 100);
      const label =
        metrics.width < 220
          ? `${percent}% · ${formatMinutesCompact(entry.minutes)}`
          : `${entry.label} ${percent}% · ${formatMinutesCompact(entry.minutes)}`;
      item.appendChild(createElement("span", "widget-pie-legend-text", label));
      legend.appendChild(item);
    });
  }
  wrapper.appendChild(legend);
  return wrapper;
}

function buildGoalPreviewNode(preview, metrics) {
  const wrapper = createElement("div", "widget-preview widget-preview--goals");
  if (metrics.width < 280 || metrics.isTall) {
    wrapper.classList.add("is-stacked");
  }

  const getGoalPriorityMeta = (priority) => {
    switch (String(priority || "medium")) {
      case "high":
        return { text: "高优先级", color: "#f56565" };
      case "low":
        return { text: "低优先级", color: "#48bb78" };
      default:
        return { text: "中优先级", color: "#ed8936" };
    }
  };

  const buildGoalCard = (title, goals, toneClass) => {
    const card = createElement("article", `widget-goal-card widget-item-card ${toneClass}`);
    const accent = createElement("div", "widget-goal-accent");
    card.appendChild(accent);

    const main = createElement("div", "widget-goal-main");
    const head = createElement("div", "widget-item-top");
    head.appendChild(createElement("div", "widget-item-title", title));
    head.appendChild(createElement("div", "widget-item-badge", `${goals.length}项`));
    main.appendChild(head);

    const list = createElement("div", "widget-goal-card-list");
    const itemLimit =
      metrics.sizeClass === "xlarge"
        ? 5
        : metrics.sizeClass === "large"
          ? 4
          : metrics.height < 150
            ? 2
            : 3;
    if (goals.length === 0) {
      list.appendChild(createElement("div", "widget-goal-card-item", translateWidgetUiText("暂无目标")));
    } else {
      goals.slice(0, itemLimit).forEach((goal) => {
        const priorityMeta = getGoalPriorityMeta(goal.priority);
        const goalItem = createElement("div", "widget-goal-card-item");
        const textBlock = createElement("div", "widget-goal-card-item-text");
        textBlock.appendChild(
          createElement(
            "strong",
            "widget-goal-card-item-title",
            truncateText(goal.title, metrics.sizeClass === "xlarge" ? 26 : 18),
          ),
        );
        if (metrics.sizeClass === "xlarge" && goal.description) {
          textBlock.appendChild(
            createElement(
              "div",
              "widget-goal-card-item-description",
              truncateText(goal.description, 24),
            ),
          );
        }
        goalItem.appendChild(textBlock);
        const priorityBadge = createElement(
          "span",
          "widget-goal-card-item-priority",
          translateWidgetUiText(priorityMeta.text),
        );
        const priorityColor = resolveWidgetShapeColor(priorityMeta.color);
        priorityBadge.style.background = priorityColor;
        priorityBadge.style.color = resolveWidgetReadableTextColor(
          priorityColor,
          readWidgetThemeCssVar("--widget-accent-action-text"),
        );
        goalItem.appendChild(priorityBadge);
        list.appendChild(goalItem);
      });
    }
    main.appendChild(list);
    card.appendChild(main);
    return card;
  };

  wrapper.appendChild(
    buildGoalCard(translateWidgetUiText("今年年度目标"), preview.annualGoals, "is-annual"),
  );
  wrapper.appendChild(
    buildGoalCard(translateWidgetUiText("本月目标"), preview.monthGoals, "is-month"),
  );
  return wrapper;
}

function buildPreviewNode(content, metrics) {
  if (!shouldShowPreview(content, metrics)) {
    return null;
  }

  if (content.preview.kind === "timeline") {
    return buildTimelinePreviewNode(content.preview, metrics);
  }
  if (content.preview.kind === "pie") {
    return buildPiePreviewNode(content.preview, metrics);
  }
  if (content.preview.kind === "goals") {
    return buildGoalPreviewNode(content.preview, metrics);
  }
  return null;
}

async function persistWidgetTodoMutation(item) {
  const runtime = window.ControlerWidgetRuntime || {};
  const nextState = cloneState(runtime.cachedPayload) || createEmptyAppState();
  const result = toggleTodoInState(nextState, item?.targetId);
  if (!result?.ok) {
    return result;
  }

  const { widgetType } = getWidgetDefinition();
  updateWidgetRuntimeCache(nextState, {
    cachedViewModel: buildWidgetContent(widgetType, nextState),
    cachedDataKey: buildWidgetDataKey(nextState),
  });
  renderWidgetFromCache({
    reason: "todo-toggle-local",
    rebuildViewModel: false,
  });
  markWidgetSelfMutationIgnored(["core"]);

  try {
    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      await window.ControlerStorage.replaceCoreState({
        todos: nextState.todos,
      });
      return result;
    }
  } catch (error) {
    console.error("保存待办小组件状态失败:", error);
  }

  scheduleRender({
    reloadData: true,
    reason: "todo-toggle-recovery",
  });
  return result;
}

async function persistWidgetCheckinMutation(item) {
  const runtime = window.ControlerWidgetRuntime || {};
  const nextState = cloneState(runtime.cachedPayload) || createEmptyAppState();
  const result = toggleCheckinInState(nextState, item?.targetId);
  if (!result?.ok) {
    return result;
  }

  const todayPeriodId = getWidgetPeriodIdFromDateText(getLocalDateText(new Date()));
  if (!todayPeriodId) {
    return result;
  }

  const { widgetType } = getWidgetDefinition();
  updateWidgetRuntimeCache(nextState, {
    cachedViewModel: buildWidgetContent(widgetType, nextState),
    cachedDataKey: buildWidgetDataKey(nextState),
  });
  renderWidgetFromCache({
    reason: "checkin-toggle-local",
    rebuildViewModel: false,
  });
  markWidgetSelfMutationIgnored(["dailyCheckins"]);

  try {
    if (typeof window.ControlerStorage?.saveSectionRange === "function") {
      await window.ControlerStorage.saveSectionRange("dailyCheckins", {
        periodId: todayPeriodId,
        items: (Array.isArray(nextState.dailyCheckins) ? nextState.dailyCheckins : []).filter(
          (entry) => getWidgetPeriodIdFromDateText(entry?.date || "") === todayPeriodId,
        ),
        mode: "replace",
      });
      return result;
    }
  } catch (error) {
    console.error("保存打卡小组件状态失败:", error);
  }

  scheduleRender({
    reloadData: true,
    reason: "checkin-toggle-recovery",
  });
  return result;
}

function handleItemAction(item) {
  if (!item?.command || !item?.targetId) {
    return;
  }
  if (item.command === TODO_TOGGLE_COMMAND) {
    void persistWidgetTodoMutation(item);
    return;
  }
  if (item.command === CHECKIN_TOGGLE_COMMAND) {
    void persistWidgetCheckinMutation(item);
  }
}

function buildItemListNode(widgetType, items, metrics, content = null) {
  if (!Array.isArray(items) || items.length === 0) {
    return buildEmptyState(
      "当前没有需要处理的项目。",
      "这里会保留与你今天最相关的内容与操作。",
    );
  }

  const wrapper = createElement("div", "widget-item-list");
  const useCompactCards =
    shouldUseCompactListCards(widgetType.id, metrics) ||
    shouldUseCompactPreviewSupplementaryCards(widgetType.id, metrics);
  const useMinimalCards =
    shouldUseMinimalListCards(widgetType.id, metrics) ||
    shouldUseMinimalPreviewSupplementaryCards(widgetType.id, metrics);
  if (isPreviewPrimaryKind(widgetType.id)) {
    wrapper.classList.add("is-preview-supplementary");
  }
  wrapper.dataset.widgetKind = widgetType.id || "";
  if (useCompactCards) {
    wrapper.classList.add("is-compact");
  }
  if (useMinimalCards) {
    wrapper.classList.add("is-minimal");
  }

  items.forEach((item) => {
    const card = createElement("article", "widget-item-card");
    card.dataset.openable = "true";
    card.addEventListener("click", () => {
      void openWidgetMainView(widgetType, content?.launchPayload);
    });

    const accent = createElement("div", "widget-item-accent");
    accent.style.background = resolveWidgetShapeColor(item.accent);
    card.appendChild(accent);

    const main = createElement("div", "widget-item-main");
    const top = createElement("div", "widget-item-top");
    top.appendChild(createElement("div", "widget-item-title", item.title || ""));
    if (item.badge) {
      top.appendChild(createElement("div", "widget-item-badge", item.badge));
    }
    main.appendChild(top);
    if (item.meta) {
      main.appendChild(createElement("div", "widget-item-meta", item.meta));
    }
    if (item.note && !useMinimalCards) {
      main.appendChild(createElement("div", "widget-item-note", item.note));
    }
    card.appendChild(main);

    const action = createElement(
      "button",
      "widget-item-action",
      item.actionLabel || translateWidgetUiText("打开"),
    );
    action.type = "button";
    action.dataset.tone = item.actionTone || "accent";
    action.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (item?.command && item?.targetId) {
        handleItemAction(item);
        return;
      }
      void openWidgetMainView(widgetType, content?.launchPayload);
    });
    card.appendChild(action);

    wrapper.appendChild(card);
  });

  return wrapper;
}

function buildWidgetCard(widgetType, content, metrics) {
  const card = createElement("section", "widget-card");
  card.dataset.widgetKind = widgetType.id || "";
  card.dataset.sizeClass = metrics.sizeClass;
  if (content.actionOnly) {
    card.classList.add("widget-card--action-only");
  }
  if (isListFirstKind(widgetType.id)) {
    card.classList.add("widget-card--list-first");
  }
  if (isPreviewPrimaryKind(widgetType.id)) {
    card.classList.add("widget-card--preview-primary");
  }
  if (!content.actionOnly) {
    card.dataset.cardOpenable = "true";
    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button")) {
        return;
      }
      void openWidgetMainView(widgetType, content?.launchPayload);
    });
  }

  const header = buildHeaderNode(content, metrics);
  if (header) {
    card.appendChild(header);
  }

  if (content.actionOnly) {
    card.appendChild(buildActionOnlyNode(widgetType, content));
    return card;
  }

  const previewNode = buildPreviewNode(content, metrics);
  if (previewNode) {
    card.appendChild(previewNode);
  }

  if (shouldShowStats(content, metrics)) {
    card.appendChild(buildStatsRow(content));
  }

  const visibleItemCount = isPreviewPrimaryKind(widgetType.id)
    ? resolvePreviewSupplementaryItemCount(widgetType.id, content.itemCards, metrics)
    : resolveVisibleItemCount(widgetType.id, content.itemCards, metrics);
  const lineCapacity = resolveLineCapacity(content, metrics, !!previewNode, visibleItemCount);
  const linesNode = buildLinesNode(content.lines, lineCapacity);
  if (linesNode) {
    card.appendChild(linesNode);
  }

  if (visibleItemCount > 0) {
    card.appendChild(
      buildItemListNode(
        widgetType,
        content.itemCards.slice(0, visibleItemCount),
        metrics,
        content,
      ),
    );
  }

  if (
    !previewNode &&
    !linesNode &&
    visibleItemCount === 0 &&
    !shouldShowStats(content, metrics)
  ) {
    card.appendChild(
      buildEmptyState(
        "当前还没有可显示的数据。",
        "打开原页补充数据后会自动同步到这里。",
      ),
    );
  }

  return card;
}

function renderWidgetFailureState(root, widgetType, error) {
  if (!root) {
    return;
  }
  root.replaceChildren();
  root.dataset.widgetState = "failed";
  document.body.classList.add("widget-render-failed");
  const card = createElement("div", "widget-card");
  card.appendChild(buildWidgetErrorState(widgetType, error));
  root.appendChild(card);
}

function scheduleInitialWidgetRetry(root, widgetType, error, options = {}) {
  const runtime = window.ControlerWidgetRuntime || {};
  if (runtime.successfulRenderCount > 0) {
    return false;
  }

  const delayMs = WIDGET_INITIAL_RENDER_RETRY_DELAYS_MS[runtime.startupRetryCount];
  if (!Number.isFinite(delayMs)) {
    return false;
  }

  runtime.startupRetryCount += 1;
  clearWidgetStartupRetryTimer();
  renderWidgetLoadingState(root, widgetType, {
    detail: translateWidgetUiText("正在重新尝试载入小组件..."),
  });
  runtime.autoRetryTimer = window.setTimeout(() => {
    runtime.autoRetryTimer = 0;
    renderWidget({
      reason: options.reason || "widget-startup-retry",
      reloadData: options.reloadData !== false,
      rebuildViewModel: true,
      immediateLoading: true,
      delayMs: 0,
    });
  }, delayMs);
  console.warn("小组件启动阶段异常，已安排自动重试:", error);
  return true;
}

function handleWidgetRenderFailure(root, widgetType, error, options = {}) {
  const runtime = window.ControlerWidgetRuntime || {};
  const normalizedMessage = normalizeWidgetRuntimeErrorMessage(error);

  if (
    options.allowStartupRetry !== false &&
    scheduleInitialWidgetRetry(root, widgetType, normalizedMessage, {
      reason: options.reason,
      reloadData: options.reloadData,
    })
  ) {
    runtime.lastError = normalizedMessage;
    return;
  }

  if (options.preserveRenderedUi === true && runtime.successfulRenderCount > 0) {
    runtime.lastError = normalizedMessage;
    console.warn("小组件后台异常，保留当前已渲染画面:", error);
    return;
  }

  runtime.renderState = "failed";
  runtime.lastError = normalizedMessage;
  renderWidgetFailureState(root, widgetType, normalizedMessage);
}

function buildWidgetLoadingCard(widgetType, options = {}) {
  const card = createElement("section", "widget-card");
  const shell = createElement("div", "widget-state-shell");
  const title = createElement(
    "div",
    "widget-state-title",
    options.title || getWidgetDisplayName(widgetType),
  );
  const detail = createElement(
    "div",
    "widget-state-detail",
    options.detail || translateWidgetUiText("正在准备当前小组件内容..."),
  );
  shell.appendChild(title);
  shell.appendChild(detail);
  card.appendChild(shell);
  return card;
}

function renderWidgetLoadingState(root, widgetType, options = {}) {
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const card = buildWidgetLoadingCard(widgetType, options);
  root.replaceChildren(card);
  root.dataset.widgetState = "loading";
  document.body.classList.remove("widget-render-failed");
  document.body.dataset.widgetKind = widgetType?.id || "";
  document.body.dataset.widgetSizeClass = resolveWidgetMetrics().sizeClass;
  updateWidgetWindowChrome(widgetType);
  window.ControlerWidgetRuntime.renderState = "loading";
  window.ControlerWidgetRuntime.lastError = null;
}

function renderWidgetFromCache(options = {}) {
  const root = document.getElementById("widget-root");
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const runtime = window.ControlerWidgetRuntime || {};
  const { widgetType } = getWidgetDefinition();
  const metrics = resolveWidgetMetrics();
  const payload = {
    ...createEmptyAppState(),
    ...(cloneState(runtime.cachedPayload) || {}),
  };
  const shouldRebuildViewModel =
    options.rebuildViewModel === true || !runtime.cachedViewModel;
  const content = shouldRebuildViewModel
    ? buildWidgetContent(widgetType, payload)
    : cloneState(runtime.cachedViewModel);
  const card = buildWidgetCard(widgetType, content, metrics);

  if (shouldRebuildViewModel) {
    runtime.cachedViewModel = cloneState(content);
  }
  clearWidgetStartupRetryTimer();
  runtime.renderState = "rendered";
  runtime.lastError = null;
  runtime.lastRenderedAt = new Date().toISOString();
  runtime.startupRetryCount = 0;
  runtime.successfulRenderCount = Math.max(
    1,
    Number.isFinite(runtime.successfulRenderCount)
      ? runtime.successfulRenderCount + 1
      : 1,
  );
  root.replaceChildren(card);
  root.dataset.widgetState = "rendered";
  document.body.classList.remove("widget-render-failed");
  document.body.dataset.widgetKind = widgetType.id || "";
  document.body.dataset.widgetSizeClass = metrics.sizeClass;
  updateWidgetWindowChrome(widgetType);
}

function getWidgetRefreshController() {
  if (window.ControlerWidgetRuntime.refreshController) {
    return window.ControlerWidgetRuntime.refreshController;
  }
  if (typeof window.ControlerUI?.createAtomicRefreshController !== "function") {
    return null;
  }
  window.ControlerWidgetRuntime.refreshController =
    window.ControlerUI.createAtomicRefreshController({
      defaultDelayMs: WIDGET_REFRESH_DELAY_MS,
      showLoading: (loadingOptions = {}) => {
        const root = document.getElementById("widget-root");
        const { widgetType } = getWidgetDefinition();
        renderWidgetLoadingState(root, widgetType, {
          detail:
            loadingOptions.detail ||
            translateWidgetUiText("正在同步当前小组件内容，请稍候..."),
        });
      },
      hideLoading: () => {},
    });
  return window.ControlerWidgetRuntime.refreshController;
}

async function refreshWidgetData(options = {}) {
  const root = document.getElementById("widget-root");
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const runtime = window.ControlerWidgetRuntime || {};
  const { widgetType } = getWidgetDefinition();
  const reason =
    typeof options.reason === "string" && options.reason.trim()
      ? options.reason.trim()
      : "widget-refresh";
  const refreshController = getWidgetRefreshController();

  runtime.pendingRefreshToken += 1;
  const currentToken = runtime.pendingRefreshToken;
  if (options.immediateLoading === true) {
    window.ControlerUI?.markPerfStage?.("widget-restore-start", {
      kind: widgetType?.id || "",
      reason,
      allowRepeat: true,
    });
    renderWidgetLoadingState(root, widgetType, {
      detail: translateWidgetUiText("正在准备当前小组件内容..."),
    });
  }

  const commitLoadedPayload = async (payload) => {
    if (runtime.pendingRefreshToken !== currentToken) {
      window.ControlerUI?.markPerfStage?.("refresh-skipped", {
        reason: "widget-refresh-stale",
      });
      return;
    }
    updateWidgetRuntimeCache(payload, {
      cachedDataKey: buildWidgetDataKey(payload),
      cachedViewModel: null,
    });
    renderWidgetFromCache({
      reason,
      rebuildViewModel: true,
    });
    window.ControlerUI?.markPerfStage?.("widget-data-commit", {
      kind: widgetType?.id || "",
      reason,
      allowRepeat: true,
    });
  };

  try {
    if (!refreshController) {
      const payload = await loadWidgetDataPayload(widgetType);
      await commitLoadedPayload(payload);
      return;
    }

    const refreshResult = await refreshController.run(
      async () => loadWidgetDataPayload(widgetType),
      {
        immediateLoading: options.immediateLoading === true,
        delayMs:
          Number.isFinite(options.delayMs) && options.delayMs >= 0
            ? options.delayMs
            : WIDGET_REFRESH_DELAY_MS,
        loadingOptions: {
          detail:
            typeof options.loadingDetail === "string" && options.loadingDetail.trim()
              ? options.loadingDetail.trim()
              : translateWidgetUiText("正在同步当前小组件内容，请稍候..."),
        },
        commit: async (payload) => {
          await commitLoadedPayload(payload);
        },
      },
    );
    if (refreshResult?.stale) {
      window.ControlerUI?.markPerfStage?.("refresh-skipped", {
        reason: "widget-refresh-stale",
      });
    }
  } catch (error) {
    console.error("刷新小组件数据失败:", error);
    handleWidgetRenderFailure(root, widgetType, error, {
      reason: `${reason}-failed`,
      reloadData: true,
      preserveRenderedUi: true,
    });
  }
}

function bindWidgetRuntimeErrorHandlers() {
  if (widgetRuntimeErrorHandlersBound) {
    return;
  }
  widgetRuntimeErrorHandlersBound = true;

  const reportError = (errorLike) => {
    const root = document.getElementById("widget-root");
    const { widgetType } = getWidgetDefinition();
    handleWidgetRenderFailure(root, widgetType, errorLike, {
      reason: "widget-runtime-error",
      reloadData: true,
      preserveRenderedUi: true,
    });
  };

  window.addEventListener("error", (event) => {
    const root = document.getElementById("widget-root");
    if (!(root instanceof HTMLElement) || !root.children.length) {
      return;
    }
    reportError(event?.error || event?.message || "小组件发生未知错误。");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const root = document.getElementById("widget-root");
    if (!(root instanceof HTMLElement) || !root.children.length) {
      return;
    }
    reportError(event?.reason || "小组件发生未知错误。");
  });
}

function renderWidget(options = {}) {
  if (options.reloadData === true || !window.ControlerWidgetRuntime?.cachedPayload) {
    void refreshWidgetData({
      reason: options.reason || "widget-render",
      immediateLoading: options.immediateLoading === true,
      delayMs: options.delayMs,
    });
    return;
  }
  try {
    renderWidgetFromCache({
      reason: options.reason || "widget-render-cache",
      rebuildViewModel: options.rebuildViewModel === true,
    });
  } catch (error) {
    const root = document.getElementById("widget-root");
    const { widgetType } = getWidgetDefinition();
    console.error("渲染小组件失败:", error);
    handleWidgetRenderFailure(root, widgetType, error, {
      reason: "widget-render-failed",
      reloadData: false,
      preserveRenderedUi: true,
    });
  }
}

function scheduleRender(options = {}) {
  window.clearTimeout(widgetRenderTimer);
  widgetRenderTimer = window.setTimeout(() => {
    renderWidget(options);
  }, Number.isFinite(options.delayMs) ? options.delayMs : 96);
}

window.ControlerWidgetRuntime.renderNow = renderWidget;

window.addEventListener("resize", () => {
  scheduleRender({
    reason: "widget-resize",
    rebuildViewModel: false,
    reloadData: false,
    delayMs: 64,
  });
});
window.addEventListener("controler:storage-data-changed", (event) => {
  const { widgetType } = getWidgetDefinition();
  const changedSections = Array.isArray(event?.detail?.changedSections)
    ? event.detail.changedSections
    : [];
  if (shouldIgnoreWidgetSelfRefresh(changedSections)) {
    window.ControlerUI?.markPerfStage?.("refresh-skipped", {
      reason: "widget-self-refresh-ignored",
    });
    return;
  }
  if (!shouldRefreshWidgetForSections(widgetType?.id, changedSections)) {
    window.ControlerUI?.markPerfStage?.("refresh-skipped", {
      reason: "widget-section-miss",
    });
    return;
  }
  scheduleRender({
    reason: "widget-storage-refresh",
    reloadData: true,
  });
});
window.addEventListener("controler:language-changed", () => {
  scheduleRender({
    reason: "widget-language-refresh",
    rebuildViewModel: true,
    reloadData: false,
    delayMs: 48,
  });
});
window.addEventListener("storage", () => {
  scheduleRender({
    reason: "widget-storage-event",
    reloadData: true,
  });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindWidgetWindowChrome();
    bindWindowControls();
    bindWindowHoverState();
    bindWidgetRuntimeErrorHandlers();
    void syncWidgetWindowAppearance();
    renderWidget({
      reason: "widget-initial-load",
      reloadData: true,
      immediateLoading: true,
      delayMs: 0,
    });
  });
} else {
  bindWidgetWindowChrome();
  bindWindowControls();
  bindWindowHoverState();
  bindWidgetRuntimeErrorHandlers();
  void syncWidgetWindowAppearance();
  renderWidget({
    reason: "widget-initial-load",
    reloadData: true,
    immediateLoading: true,
    delayMs: 0,
  });
}
