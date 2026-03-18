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
};

const electronAPI = window.electronAPI || null;
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

let widgetRenderTimer = 0;
let widgetWindowChromeBound = false;
let widgetWindowControlsBound = false;
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
  if (!electronAPI?.isElectron || typeof electronAPI.windowUpdateAppearance !== "function") {
    return null;
  }

  try {
    return await electronAPI.windowUpdateAppearance({
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

  if (
    moveHandle &&
    typeof window.electronAPI?.windowSetPosition === "function" &&
    typeof window.ControlerUI?.bindWindowMoveHandle === "function"
  ) {
    window.ControlerUI.bindWindowMoveHandle(moveHandle, window.electronAPI);
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

async function openWidgetMainView(widgetType) {
  if (!widgetType) {
    return;
  }

  const bridge = window.ControlerWidgetsBridge || null;
  if (typeof bridge?.openMainAction === "function") {
    await bridge.openMainAction({
      page: widgetType.page,
      action: widgetType.action,
      source: "desktop-widget",
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
  window.location.href = `${nextUrl.pathname.split("/").pop()}${nextUrl.search}`;
}

function readAppState() {
  try {
    if (typeof window.ControlerStorage?.dump === "function") {
      const dumped = window.ControlerStorage.dump();
      if (dumped && typeof dumped === "object") {
        return {
          ...createEmptyAppState(),
          ...dumped,
        };
      }
    }
  } catch (error) {
    console.warn("读取 ControlerStorage.dump() 失败，回退 localStorage:", error);
  }

  const readArray = (key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]");
    } catch (error) {
      return [];
    }
  };
  const readObject = (key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "{}");
    } catch (error) {
      return {};
    }
  };

  return {
    ...createEmptyAppState(),
    records: readArray("records"),
    projects: readArray("projects"),
    todos: readArray("todos"),
    checkinItems: readArray("checkinItems"),
    dailyCheckins: readArray("dailyCheckins"),
    checkins: readArray("checkins"),
    plans: readArray("plans"),
    diaryEntries: readArray("diaryEntries"),
    diaryCategories: readArray("diaryCategories"),
    guideState:
      window.ControlerGuideBundle?.normalizeGuideState?.(readObject("guideState")) ||
      createEmptyAppState().guideState,
    timerSessionState: readObject("timerSessionState"),
    yearlyGoals: readObject("yearlyGoals"),
    customThemes: readArray("customThemes"),
    tableScaleSettings: readObject("tableScaleSettings"),
    selectedTheme: window.localStorage.getItem("selectedTheme") || "default",
  };
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

  if (typeof window.ControlerStorage?.replaceAll === "function") {
    window.ControlerStorage.replaceAll(safeState);
  } else {
    const keysToPersist = [
      "records",
      "projects",
      "todos",
      "checkinItems",
      "dailyCheckins",
      "checkins",
      "plans",
      "diaryEntries",
      "diaryCategories",
      "guideState",
      "timerSessionState",
      "yearlyGoals",
      "customThemes",
      "tableScaleSettings",
    ];

    keysToPersist.forEach((key) => {
      window.localStorage.setItem(key, JSON.stringify(safeState[key] ?? null));
    });
    window.localStorage.setItem(
      "selectedTheme",
      String(safeState.selectedTheme || "default"),
    );
  }

  window.dispatchEvent(
    new CustomEvent("controler:storage-data-changed", {
      detail: {
        reason: "widget-inline-action",
        data: cloneState(safeState),
      },
    }),
  );
  void window.ControlerWidgetsBridge?.notifyDataChanged?.();
  scheduleRender();
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

function getDateText(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
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

  const today = parseDate(getDateText(new Date()));
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

  const today = getDateText(new Date());
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

function getTodoDueState(todo = {}, today = getDateText(new Date())) {
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
  const today = getDateText(new Date());
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

function getTodayTodoItems(state, limit = 6) {
  const today = getDateText(new Date());
  return (Array.isArray(state?.todos) ? state.todos : [])
    .filter((todo) => todoScheduledOn(todo, today))
    .slice()
    .sort((left, right) => {
      const completedCompare = Number(!!left?.completed) - Number(!!right?.completed);
      if (completedCompare !== 0) {
        return completedCompare;
      }
      const dateCompare = compareDateText(
        left?.dueDate || left?.startDate || "",
        right?.dueDate || right?.startDate || "",
      );
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();
    })
    .slice(0, limit)
    .map((todo) => {
      const progressRecords = getTodoProgressRecords(state, todo?.id || "");
      const lastProgress = progressRecords[0] || null;
      const dueState = getTodoDueState(todo, today);
      return {
        id: todo?.id || "",
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

function getCheckinTodayEntry(state, itemId, today = getDateText(new Date())) {
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
  if (!checkinScheduledOn(target, getDateText(cursor))) {
    return 0;
  }

  let streak = 0;
  for (let loop = 0; loop < 400; loop += 1) {
    const currentDateText = getDateText(cursor);
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
  const today = getDateText(new Date());
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
  const today = getDateText(new Date());
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
  const plans = Array.isArray(state.plans) ? state.plans : [];

  return Array.from({ length: 7 }).map((_, offset) => {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const dateText = getDateText(date);
    const matches = plans.filter((plan) => planOccursOnDate(plan, dateText));
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
  const records = Array.isArray(state.records) ? state.records : [];
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

  const values = monthNames.map((label, index) => {
    const monthRecords = records.filter((record) => {
      const date = parseDate(record?.timestamp || record?.startTime);
      return !!date && date.getFullYear() === currentYear && date.getMonth() === index;
    });
    const minutes = monthRecords.reduce((sum, record) => sum + resolveRecordMinutes(record), 0);
    const goals = Array.isArray(yearGoalBucket[String(index + 1)])
      ? yearGoalBucket[String(index + 1)]
      : [];
    return {
      label,
      minutes,
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

function getTodayRecords(state) {
  const today = getDateText(new Date());
  return (Array.isArray(state.records) ? state.records : []).filter(
    (record) => getRecordDateText(record) === today,
  );
}

function buildDayPieEntries(state) {
  const projectMap = getProjectMap(state?.projects);
  const summary = new Map();
  getTodayRecords(state).forEach((record) => {
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

function resolveWidgetMetrics() {
  const width = Math.max(window.innerWidth || 0, 1);
  const height = Math.max(window.innerHeight || 0, 1);
  let sizeClass = "medium";
  if (width < 170 || height < 110) {
    sizeClass = "compact";
  } else if (width >= 260 && height >= 180) {
    sizeClass = "large";
  }
  return {
    width,
    height,
    sizeClass,
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
    (metrics.sizeClass === "compact" || metrics.width < 210 || metrics.height < 175)
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
  if (metrics.height < 215 || metrics.width < 200) {
    return Math.min(itemCards.length, 4);
  }
  return Math.min(itemCards.length, 5);
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
    return !!metrics && !shouldUseMinimalListCards(content.kind, metrics) && metrics.sizeClass === "large";
  }
  if (isPreviewPrimaryKind(content.kind)) {
    return !!metrics && metrics.sizeClass === "large";
  }
  return !!metrics && metrics.sizeClass !== "compact";
}

function resolveLineCapacity(content, metrics, hasPreview, visibleItemCount) {
  if (!content || !metrics || visibleItemCount > 0) {
    return 0;
  }
  if (isPreviewPrimaryKind(content.kind)) {
    if (metrics.sizeClass === "compact") {
      return 0;
    }
    if (metrics.sizeClass === "medium") {
      return hasPreview ? 1 : 2;
    }
    return hasPreview ? 2 : 3;
  }
  if (metrics.sizeClass === "compact") {
    return 2;
  }
  if (metrics.sizeClass === "medium") {
    return hasPreview ? 2 : 3;
  }
  return 3;
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
  const todayText = getDateText(new Date());

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
      const row = rowMap.get(getDateText(cursor));
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
  };
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
  const weekTotal = rows.reduce((sum, row) => sum + row.totalMinutes, 0);
  content.subtitle = translateWidgetUiText("一周时间分布");
  content.statPrimary = translateWidgetUiText("近 7 天");
  content.statSecondary = formatMinutes(weekTotal);
  content.preview = {
    kind: "timeline",
    rows,
    emptyText: translateWidgetUiText("暂无时间记录"),
  };
  if (weekTotal <= 0) {
    content.lines.push(translateWidgetUiText("近 7 天还没有时间记录。"));
    return;
  }
  content.lines.push(
    translateWidgetUiText(`近 7 天累计 ${formatMinutes(weekTotal)}`),
  );
  rows
    .slice()
    .reverse()
    .slice(0, 2)
    .reverse()
    .forEach((row) => {
      content.lines.push(
        translateWidgetUiText(`${row.label} ${formatMinutes(row.totalMinutes)}`),
      );
    });
}

function fillDayPieContent(content, state) {
  const entries = buildDayPieEntries(state);
  const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
  content.subtitle = translateWidgetUiText("今日项目占比");
  content.preview = {
    kind: "pie",
    entries,
    totalMinutes,
  };
  if (totalMinutes <= 0) {
    content.lines.push(translateWidgetUiText("今天暂无可统计数据。"));
    return;
  }
  content.statPrimary = `${translateWidgetUiText("总计")} ${formatMinutes(totalMinutes)}`;
  content.statSecondary = `${translateWidgetUiText("项目")} ${entries.length} ${translateWidgetUiText("个")}`;
  entries.slice(0, 3).forEach((item) => {
    const percent = Math.round((item.minutes / Math.max(1, totalMinutes)) * 100);
    content.lines.push(
      translateWidgetUiText(`${item.label} ${percent}% · ${formatMinutes(item.minutes)}`),
    );
  });
}

function fillTodosContent(content, state) {
  const stats = getTodayTodoStats(state);
  const items = getTodayTodoItems(state, 5).map((item) => ({
    ...item,
    command: TODO_TOGGLE_COMMAND,
    targetId: item.id,
  }));
  content.subtitle = translateWidgetUiText("今日待办");
  content.actionLabel = translateWidgetUiText("打开待办");
  content.statPrimary = `${translateWidgetUiText("共")} ${stats.total} ${translateWidgetUiText("项")}`;
  content.statSecondary = `${translateWidgetUiText("已完成")} ${stats.doneCount} ${translateWidgetUiText("项")}`;
  if (items.length === 0) {
    content.lines.push(translateWidgetUiText("今天没有待办任务。"));
    content.lines.push(translateWidgetUiText("打开应用创建新的待办事项。"));
    return;
  }
  content.lines.push(translateWidgetUiText("下方卡片可直接完成或撤回。"));
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
  const summary = buildWeekPlanSummary(state);
  const total = summary.reduce((sum, item) => sum + item.count, 0);
  const busiest = summary.reduce(
    (best, item) => (item.count > best.count ? item : best),
    { count: 0, title: "" },
  );
  content.subtitle = translateWidgetUiText("未来 7 天计划");
  content.statPrimary = `${translateWidgetUiText("总计")} ${total} ${translateWidgetUiText("项")}`;
  content.statSecondary =
    busiest.count > 0
      ? translateWidgetUiText(`${busiest.title.split(" · ")[0]} ${busiest.count} 项`)
      : translateWidgetUiText("本周暂无计划");
  content.preview = {
    kind: "timeline",
    rows,
    emptyText: translateWidgetUiText("暂无计划安排"),
  };
  content.lines.push(
    total > 0
      ? translateWidgetUiText(`未来 7 天共 ${total} 项安排`)
      : translateWidgetUiText("未来 7 天暂无计划安排。"),
  );
  content.lines.push(
    busiest.count > 0
      ? translateWidgetUiText(`${busiest.title.split(" · ")[0]} 最忙（${busiest.count} 项）`)
      : translateWidgetUiText("打开原页查看完整周视图。"),
  );
}

function fillYearViewContent(content, state) {
  const monthItems = buildYearSummary(state);
  const yearMinutes = monthItems.reduce((sum, item) => sum + item.minutes, 0);
  const annualGoals = getWidgetYearGoalList(state, "annual");
  const currentMonthGoals = getWidgetYearGoalList(
    state,
    String(new Date().getMonth() + 1),
  );
  const maxMonth = monthItems.reduce(
    (best, item) => (item.minutes > best.minutes ? item : best),
    { label: "", minutes: 0 },
  );
  content.subtitle = translateWidgetUiText("年度视图");
  content.statPrimary = formatMinutes(yearMinutes);
  content.statSecondary = `${translateWidgetUiText("年度目标")} ${annualGoals.length} ${translateWidgetUiText("个")}`;
  content.preview = {
    kind: "goals",
    ...buildYearPreviewData(state),
  };
  content.lines.push(translateWidgetUiText(`全年投入 ${formatMinutes(yearMinutes)}`));
  content.lines.push(
    translateWidgetUiText(`本月目标 ${currentMonthGoals.length} 个`),
  );
  content.lines.push(
    maxMonth.minutes > 0
      ? translateWidgetUiText(`${maxMonth.label} 最高`)
      : translateWidgetUiText("暂无年度统计数据。"),
  );
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
    void openWidgetMainView(widgetType);
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
  const hasAnySegments = preview.rows.some((row) => row.segments.length > 0);
  if (metrics.width < 220) {
    wrapper.classList.add("is-compact");
  }

  preview.rows.forEach((row) => {
    const rowNode = createElement("div", "widget-timeline-row");
    if (row.today) {
      rowNode.classList.add("is-today");
    }

    if (showLabels) {
      rowNode.appendChild(createElement("div", "widget-timeline-label", row.label));
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
      segmentNode.style.background = segment.color;
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
  if (metrics.width < 220) {
    wrapper.classList.add("is-compact");
  }

  const donutShell = createElement("div", "widget-pie-shell");
  const donut = createElement("div", "widget-pie-donut");
  const limitedEntries = preview.entries.slice(0, metrics.width < 220 ? 3 : 4);
  if (limitedEntries.length === 0 || preview.totalMinutes <= 0) {
    donut.style.background = "conic-gradient(rgba(255,255,255,0.14) 0deg 360deg)";
  } else {
    let angle = 0;
    const parts = limitedEntries.map((entry) => {
      const sweep = (entry.minutes / Math.max(1, preview.totalMinutes)) * 360;
      const start = angle;
      angle += sweep;
      return `${entry.color} ${start}deg ${angle}deg`;
    });
    donut.style.background = `conic-gradient(${parts.join(", ")})`;
  }
  donutShell.appendChild(donut);

  if (preview.totalMinutes > 0) {
    const center = createElement("div", "widget-pie-center");
    center.appendChild(createElement("div", "widget-pie-center-value", formatMinutesCompact(preview.totalMinutes)));
    donutShell.appendChild(center);
  }

  wrapper.appendChild(donutShell);

  const legend = createElement("div", "widget-pie-legend");
  if (limitedEntries.length === 0 || preview.totalMinutes <= 0) {
    legend.appendChild(
      createElement("div", "widget-preview-empty", translateWidgetUiText("暂无统计数据")),
    );
  } else {
    limitedEntries.forEach((entry) => {
      const item = createElement("div", "widget-pie-legend-item");
      const dot = createElement("span", "widget-pie-legend-dot");
      dot.style.background = entry.color;
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
  if (metrics.width < 220) {
    wrapper.classList.add("is-stacked");
  }

  const buildGoalCard = (title, goals, toneClass) => {
    const card = createElement("div", `widget-goal-card ${toneClass}`);
    const head = createElement("div", "widget-goal-card-head");
    head.appendChild(createElement("div", "widget-goal-card-title", title));
    head.appendChild(createElement("div", "widget-goal-card-count", `${goals.length}项`));
    card.appendChild(head);

    const list = createElement("div", "widget-goal-card-list");
    const itemLimit = metrics.height < 140 ? 1 : 2;
    if (goals.length === 0) {
      list.appendChild(createElement("div", "widget-goal-card-item", translateWidgetUiText("暂无目标")));
    } else {
      goals.slice(0, itemLimit).forEach((goal) => {
        list.appendChild(
          createElement("div", "widget-goal-card-item", `• ${truncateText(goal.title, 16)}`),
        );
      });
    }
    card.appendChild(list);
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

function handleItemAction(item) {
  if (!item?.command || !item?.targetId) {
    return;
  }
  if (item.command === TODO_TOGGLE_COMMAND) {
    commitWidgetStateMutation((nextState) => toggleTodoInState(nextState, item.targetId));
    return;
  }
  if (item.command === CHECKIN_TOGGLE_COMMAND) {
    commitWidgetStateMutation((nextState) => toggleCheckinInState(nextState, item.targetId));
  }
}

function buildItemListNode(widgetType, items, metrics) {
  if (!Array.isArray(items) || items.length === 0) {
    return buildEmptyState(
      "当前没有需要处理的项目。",
      "这里会保留与你今天最相关的内容与操作。",
    );
  }

  const wrapper = createElement("div", "widget-item-list");
  if (shouldUseCompactListCards(widgetType.id, metrics)) {
    wrapper.classList.add("is-compact");
  }
  if (shouldUseMinimalListCards(widgetType.id, metrics)) {
    wrapper.classList.add("is-minimal");
  }

  items.forEach((item) => {
    const card = createElement("article", "widget-item-card");
    card.dataset.openable = "true";
    card.addEventListener("click", () => {
      void openWidgetMainView(widgetType);
    });

    const accent = createElement("div", "widget-item-accent");
    accent.style.background = item.accent || "var(--accent-color, #8ed6a4)";
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
    if (item.note && !shouldUseMinimalListCards(widgetType.id, metrics)) {
      main.appendChild(createElement("div", "widget-item-note", item.note));
    }
    card.appendChild(main);

    const action = createElement("button", "widget-item-action", item.actionLabel || "操作");
    action.type = "button";
    action.dataset.tone = item.actionTone || "accent";
    action.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleItemAction(item);
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
      void openWidgetMainView(widgetType);
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

  const visibleItemCount = resolveVisibleItemCount(widgetType.id, content.itemCards, metrics);
  const lineCapacity = resolveLineCapacity(content, metrics, !!previewNode, visibleItemCount);
  const linesNode = buildLinesNode(content.lines, lineCapacity);
  if (linesNode) {
    card.appendChild(linesNode);
  }

  if (visibleItemCount > 0) {
    card.appendChild(
      buildItemListNode(widgetType, content.itemCards.slice(0, visibleItemCount), metrics),
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
  root.innerHTML = "";
  root.dataset.widgetState = "failed";
  document.body.classList.add("widget-render-failed");
  const card = createElement("div", "widget-card");
  card.appendChild(buildWidgetErrorState(widgetType, error));
  root.appendChild(card);
}

function bindWidgetRuntimeErrorHandlers() {
  if (widgetRuntimeErrorHandlersBound) {
    return;
  }
  widgetRuntimeErrorHandlersBound = true;

  const reportError = (errorLike) => {
    const root = document.getElementById("widget-root");
    const { widgetType } = getWidgetDefinition();
    const message = normalizeWidgetRuntimeErrorMessage(errorLike);
    window.ControlerWidgetRuntime.renderState = "failed";
    window.ControlerWidgetRuntime.lastError = message;
    renderWidgetFailureState(root, widgetType, message);
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

function renderWidget() {
  const root = document.getElementById("widget-root");
  if (!root) return;
  window.ControlerWidgetRuntime.renderState = "rendering";
  window.ControlerWidgetRuntime.lastError = null;

  const { widgetType } = getWidgetDefinition();
  const metrics = resolveWidgetMetrics();

  root.innerHTML = "";
  root.dataset.widgetState = "rendering";
  document.body.classList.remove("widget-render-failed");
  document.body.dataset.widgetKind = widgetType.id || "";
  document.body.dataset.widgetSizeClass = metrics.sizeClass;
  updateWidgetWindowChrome(widgetType);

  let state = createEmptyAppState();
  try {
    state = readAppState();
  } catch (error) {
    console.error("读取小组件状态失败:", error);
  }

  try {
    const content = buildWidgetContent(widgetType, state);
    const card = buildWidgetCard(widgetType, content, metrics);
    root.appendChild(card);
    window.ControlerWidgetRuntime.renderState = "rendered";
    window.ControlerWidgetRuntime.lastRenderedAt = new Date().toISOString();
    root.dataset.widgetState = "rendered";
  } catch (error) {
    console.error("渲染小组件失败:", error);
    window.ControlerWidgetRuntime.renderState = "failed";
    window.ControlerWidgetRuntime.lastError =
      error instanceof Error ? error.message : String(error);
    renderWidgetFailureState(root, widgetType, error);
  }
}

function scheduleRender() {
  window.clearTimeout(widgetRenderTimer);
  widgetRenderTimer = window.setTimeout(renderWidget, 120);
}

window.ControlerWidgetRuntime.renderNow = renderWidget;

window.addEventListener("resize", scheduleRender);
window.addEventListener("controler:storage-data-changed", scheduleRender);
window.addEventListener("controler:language-changed", scheduleRender);
window.addEventListener("storage", scheduleRender);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindWidgetWindowChrome();
    bindWindowControls();
    bindWidgetRuntimeErrorHandlers();
    void syncWidgetWindowAppearance();
    renderWidget();
  });
} else {
  bindWidgetWindowChrome();
  bindWindowControls();
  bindWidgetRuntimeErrorHandlers();
  void syncWidgetWindowAppearance();
  renderWidget();
}
