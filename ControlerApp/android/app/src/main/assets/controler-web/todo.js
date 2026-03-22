(() => {
// 待办事项页面JavaScript
let todos = []; // 存储普通待办事项对象
let checkinItems = []; // 存储打卡项目对象
let dailyCheckins = []; // 存储每日打卡记录
let checkins = []; // 待办事项打卡记录
let currentFilter = "all"; // 当前筛选器
const TODO_SORT_PREFERENCE_KEY = "todoSortPreference";
let currentSort = readPersistedTodoSortPreference(); // 当前排序方式
let currentView = "todos"; // 当前视图: "todos" 或 "checkins"
let todoLayoutMode = "list"; // "list" | "quadrant"
const uiTools = window.ControlerUI || null;
const reminderTools = window.ControlerReminders || null;
const storageBundleApi = window.ControlerStorageBundle || null;
const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const MOBILE_LAYOUT_MAX_WIDTH = 690;
const TODO_CARD_MIN_WIDTH = 320;
const TODO_CARD_MIN_WIDTH_MOBILE = 220;
const MOBILE_GENERATED_ITEM_SHRINK_RATIO = 2 / 3;
const MOBILE_TODO_DROPDOWN_WIDTH_FACTOR = 0.5;
const TODO_WIDGET_VIEW_EVENT = "controler:todo-widget-view";
const TODO_SEARCH_DEBOUNCE_MS = 160;
const TODO_DRAFT_SAVE_DELAY_MS = 300;
const TODO_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS = 1200;
const MOBILE_SWIPE_DELETE_ACTION_WIDTH = 92;
const MOBILE_SWIPE_DELETE_START_THRESHOLD = 8;
const MOBILE_SWIPE_DELETE_DIRECTION_LOCK_THRESHOLD = 10;
const MOBILE_SWIPE_DELETE_OPEN_THRESHOLD = 0.45;
const MOBILE_SWIPE_DELETE_OPEN_VELOCITY = -0.32;
const MOBILE_SWIPE_DELETE_CLOSE_VELOCITY = 0.32;
const TODO_MODAL_TOUCH_ACTION_DEDUP_WINDOW_MS = 420;
let todoSearchTimer = 0;
let cachedTodoFilterKey = "";
let cachedFilteredTodos = [];
let todoUiBindingsInitialized = false;
let todoExternalStorageListenerBound = false;
let todoWidgetViewListenerBound = false;
let todoPlanSidebarInitialized = false;
let todoWidgetLaunchActionInitialized = false;
let todoPendingExternalStorageRefresh =
  window.__controlerTodoRuntimePendingExternalRefresh === true;
let todoPersistChain = Promise.resolve();
let todoPendingPersistenceCount = 0;
let todoLastPersistenceError = null;
let todoActiveSwipeDeleteShell = null;
let todoSwipeDeleteDismissBound = false;
let todoSwipeDeleteConfirmationShell = null;
let todoBeforePageLeaveGuardBound = false;
let todoInitialRevealQueued = false;
let todoInitialReadyReported = false;
const TODO_TOGGLE_PERSIST_DEBOUNCE_MS = 180;
const todoDeferredToggleCommits = {
  checkin: new Map(),
  todo: new Map(),
};
const todoLoadedSectionPeriods = {
  dailyCheckins: new Set(),
  checkins: new Set(),
};
const todoExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async (detail = {}) => {
      await refreshTodoFromExternalStorageChange(detail);
    },
  }) || null;
const TODO_SELF_REFRESH_IGNORE_WINDOW_MS = 1200;
let todoIgnoredRefreshEvents = [];
let todoQueuedExternalStorageRefreshDetail = null;

function getTodoNormalizedChangedSections(changedSections = []) {
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

function normalizeTodoSortPreference(value) {
  switch (String(value || "").trim()) {
    case "priority":
    case "createdAt":
    case "title":
      return String(value || "").trim();
    default:
      return "dueDate";
  }
}

function readPersistedTodoSortPreference() {
  try {
    const managedSnapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    const managedValue =
      managedSnapshot && typeof managedSnapshot === "object"
        ? managedSnapshot.todoSortPreference
        : "";
    if (typeof managedValue === "string" && managedValue.trim()) {
      return normalizeTodoSortPreference(managedValue);
    }
  } catch (error) {
    console.error("读取待办排序设置失败，回退本地设置:", error);
  }

  try {
    const localValue = localStorage.getItem(TODO_SORT_PREFERENCE_KEY) || "";
    if (localValue.trim()) {
      return normalizeTodoSortPreference(localValue);
    }
  } catch (error) {
    console.error("读取待办本地排序设置失败:", error);
  }

  return "dueDate";
}

function persistTodoSortPreference(nextSort, options = {}) {
  const normalizedSort = normalizeTodoSortPreference(nextSort);
  currentSort = normalizedSort;
  try {
    localStorage.setItem(TODO_SORT_PREFERENCE_KEY, normalizedSort);
  } catch (error) {
    console.error("保存待办本地排序设置失败:", error);
  }
  if (options.persistCore === true) {
    void queueTodoCoreSave(
      {
        todoSortPreference: normalizedSort,
      },
      {
        reason: "todo-sort-preference-save",
      },
    );
  }
  return normalizedSort;
}

function shouldRefreshTodoForExternalChange(detail = {}) {
  const changedSections = getTodoNormalizedChangedSections(detail?.changedSections);
  if (!changedSections.length) {
    return true;
  }
  return changedSections.some((section) =>
    ["todos", "checkinItems", "dailyCheckins", "checkins", "core"].includes(section),
  );
}

function invalidateTodoDerivedCaches() {
  cachedTodoFilterKey = "";
  cachedFilteredTodos = [];
}

function cloneTodoValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function captureTodoWorkspaceSnapshot() {
  return {
    todos: cloneTodoValue(todos),
    checkinItems: cloneTodoValue(checkinItems),
    dailyCheckins: cloneTodoValue(dailyCheckins),
    checkins: cloneTodoValue(checkins),
  };
}

function getLocalDateText(dateValue = new Date()) {
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeTodoSelectorValue(value) {
  if (typeof window.CSS?.escape === "function") {
    return window.CSS.escape(String(value ?? ""));
  }
  return String(value ?? "").replace(/["\\]/g, "\\$&");
}

function captureTodoModalDraftFields(modal) {
  const fields = {};
  const checkboxGroupCounts = {};
  modal
    ?.querySelectorAll?.('input[type="checkbox"][name]')
    ?.forEach?.((control) => {
      checkboxGroupCounts[control.name] =
        (checkboxGroupCounts[control.name] || 0) + 1;
    });
  modal?.querySelectorAll?.("input, textarea, select")?.forEach?.((control) => {
    const key = control.id || control.name;
    if (!key) {
      return;
    }
    if (control.type === "radio") {
      if (control.checked) {
        fields[key] = control.value;
      }
      return;
    }
    if (control.type === "checkbox") {
      if (control.name && checkboxGroupCounts[control.name] > 1) {
        if (!Array.isArray(fields[key])) {
          fields[key] = [];
        }
        if (control.checked) {
          fields[key].push(control.value);
        }
        return;
      }
      fields[key] = !!control.checked;
      return;
    }
    fields[key] = control.value;
  });
  return fields;
}

function applyTodoModalDraftFields(modal, fields = {}) {
  const source = fields && typeof fields === "object" ? fields : {};
  Object.keys(source).forEach((key) => {
    const idSelector = `#${escapeTodoSelectorValue(key)}`;
    const namedControls = Array.from(
      modal?.querySelectorAll?.(`[name="${escapeTodoSelectorValue(key)}"]`) || [],
    );
    const controlById = modal?.querySelector?.(idSelector) || null;
    if (namedControls.length && namedControls[0]?.type === "radio") {
      namedControls.forEach((control) => {
        control.checked = String(control.value) === String(source[key] ?? "");
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return;
    }
    if (
      namedControls.length > 1 &&
      namedControls[0]?.type === "checkbox" &&
      Array.isArray(source[key])
    ) {
      const selectedValues = new Set(source[key].map((value) => String(value)));
      namedControls.forEach((control) => {
        control.checked = selectedValues.has(String(control.value));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return;
    }
    const targetControl = controlById || namedControls[0] || null;
    if (!targetControl) {
      return;
    }
    if (targetControl.type === "checkbox") {
      targetControl.checked = !!source[key];
    } else {
      targetControl.value = source[key] ?? "";
    }
    targetControl.dispatchEvent(new Event("input", { bubbles: true }));
    targetControl.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function createTodoModalDraftSession(modal, draftKey, scope = "todo") {
  let timer = 0;
  const persistDraft = async () => {
    if (!modal?.isConnected || typeof window.ControlerStorage?.setDraft !== "function") {
      return;
    }
    await window.ControlerStorage.setDraft(
      draftKey,
      {
        fields: captureTodoModalDraftFields(modal),
      },
      {
        scope,
      },
    );
  };
  const scheduleSave = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void persistDraft();
    }, TODO_DRAFT_SAVE_DELAY_MS);
  };
  const handlePageHide = () => {
    void persistDraft();
  };
  const handleVisibilityChange = () => {
    if (document.hidden) {
      void persistDraft();
    }
  };
  modal?.querySelectorAll?.("input, textarea, select")?.forEach?.((control) => {
    control.addEventListener("input", scheduleSave);
    control.addEventListener("change", scheduleSave);
  });
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return {
    async restore() {
      if (typeof window.ControlerStorage?.getDraft !== "function") {
        return null;
      }
      const draftEnvelope = await window.ControlerStorage.getDraft(draftKey, {
        includeEnvelope: true,
      });
      const draftValue =
        draftEnvelope && typeof draftEnvelope === "object"
          ? Object.prototype.hasOwnProperty.call(draftEnvelope, "value")
            ? draftEnvelope.value
            : draftEnvelope
          : null;
      if (!draftValue?.fields || !modal?.isConnected) {
        return null;
      }
      applyTodoModalDraftFields(modal, draftValue.fields);
      return draftValue;
    },
    async clear() {
      window.clearTimeout(timer);
      if (typeof window.ControlerStorage?.removeDraft === "function") {
        await window.ControlerStorage.removeDraft(draftKey);
      }
      return true;
    },
    destroy() {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}

function hydrateTodoCollection(section, items = []) {
  const sourceItems = Array.isArray(items) ? items : [];
  switch (section) {
    case "todos":
      return sourceItems.map((todo) => hydrateTodo(todo));
    case "checkinItems":
      return sourceItems.map((item) => hydrateCheckinItem(item));
    case "checkins":
      return sourceItems.map((checkin) => hydrateCheckin(checkin));
    case "dailyCheckins":
    default:
      return sourceItems.map((item) => ({ ...(item || {}) }));
  }
}

function applyTodoWorkspaceSnapshot(snapshot = {}) {
  todos = hydrateTodoCollection("todos", snapshot.todos);
  checkinItems = hydrateTodoCollection("checkinItems", snapshot.checkinItems);
  dailyCheckins = hydrateTodoCollection("dailyCheckins", snapshot.dailyCheckins);
  checkins = hydrateTodoCollection("checkins", snapshot.checkins);
  todoLoadedSectionPeriods.dailyCheckins = new Set(
    getTodoSectionPeriodIds("dailyCheckins", dailyCheckins),
  );
  todoLoadedSectionPeriods.checkins = new Set(
    getTodoSectionPeriodIds("checkins", checkins),
  );
  invalidateTodoDerivedCaches();
}

function clearTodoPersistenceError() {
  todoLastPersistenceError = null;
}

function readTodoWorkspaceSnapshotFromLocalStorage() {
  const readArray = (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  };
  return {
    todos: readArray("todos"),
    checkinItems: readArray("checkinItems"),
    dailyCheckins: readArray("dailyCheckins"),
    checkins: readArray("checkins"),
    __hasMirror:
      localStorage.getItem("todos") !== null ||
      localStorage.getItem("checkinItems") !== null ||
      localStorage.getItem("dailyCheckins") !== null ||
      localStorage.getItem("checkins") !== null,
  };
}

function readTodoWorkspaceSnapshotFromManagedStorage() {
  try {
    const snapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return null;
    }
    return {
      todos: Array.isArray(snapshot.todos) ? snapshot.todos : [],
      checkinItems: Array.isArray(snapshot.checkinItems) ? snapshot.checkinItems : [],
      dailyCheckins: Array.isArray(snapshot.dailyCheckins)
        ? snapshot.dailyCheckins
        : [],
      checkins: Array.isArray(snapshot.checkins) ? snapshot.checkins : [],
    };
  } catch (error) {
    console.error("读取待办受管存储快照失败，回退本地快照:", error);
    return null;
  }
}

function readTodoWorkspaceSnapshotFromPageBootstrap() {
  try {
    if (typeof window.ControlerStorage?.peekPageBootstrapState !== "function") {
      return null;
    }
    const bootstrap = window.ControlerStorage.peekPageBootstrapState("todo");
    const data =
      bootstrap?.data && typeof bootstrap.data === "object" ? bootstrap.data : null;
    if (!data) {
      return null;
    }
    return {
      todos: Array.isArray(data.todos) ? data.todos : [],
      checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
      dailyCheckins: Array.isArray(data.todayDailyCheckins)
        ? data.todayDailyCheckins
        : [],
      checkins: Array.isArray(data.recentCheckins) ? data.recentCheckins : [],
    };
  } catch (error) {
    console.error("读取待办页引导快照失败，回退旧快照:", error);
    return null;
  }
}

function readTodoWorkspaceSnapshot() {
  const bootstrapSnapshot = readTodoWorkspaceSnapshotFromPageBootstrap();
  if (bootstrapSnapshot) {
    return bootstrapSnapshot;
  }
  const localSnapshot = readTodoWorkspaceSnapshotFromLocalStorage();
  const managedSnapshot = readTodoWorkspaceSnapshotFromManagedStorage();
  if (window.ControlerStorage?.isNativeApp) {
    return managedSnapshot || localSnapshot;
  }
  if (localSnapshot?.__hasMirror) {
    return localSnapshot;
  }
  return managedSnapshot || localSnapshot;
}

async function readFreshTodoWorkspaceSnapshot() {
  if (typeof window.ControlerStorage?.getPageBootstrapState !== "function") {
    return readTodoWorkspaceSnapshot();
  }
  try {
    const pageBootstrap = await window.ControlerStorage.getPageBootstrapState(
      "todo",
      {
        fresh: true,
      },
    );
    const data =
      pageBootstrap?.data && typeof pageBootstrap.data === "object"
        ? pageBootstrap.data
        : null;
    if (!data) {
      throw new Error("missing todo bootstrap data");
    }
    return {
      todos: Array.isArray(data.todos) ? data.todos : [],
      checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
      dailyCheckins: Array.isArray(data.todayDailyCheckins)
        ? data.todayDailyCheckins
        : [],
      checkins: Array.isArray(data.recentCheckins) ? data.recentCheckins : [],
    };
  } catch (error) {
    console.error("读取待办页最新引导数据失败，回退当前快照:", error);
    return readTodoWorkspaceSnapshot();
  }
}

function clearTodoWidgetLaunchQuery() {
  const params = new URLSearchParams(window.location.search || "");
  if (!params.get("widgetAction")) {
    return false;
  }
  params.delete("widgetAction");
  params.delete("widgetKind");
  params.delete("widgetSource");
  params.delete("widgetLaunchId");
  const queryText = params.toString();
  const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  return true;
}

function waitForTodoStorageReady() {
  if (typeof window.ControlerStorage?.whenReady !== "function") {
    return Promise.resolve(true);
  }
  return window.ControlerStorage.whenReady().catch((error) => {
    console.error("等待待办页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

function isTodoWidgetTargetVisible(action = "") {
  const expectedView = action === "show-checkins" ? "checkins" : "todos";
  return todoPlanSidebarInitialized && currentView === expectedView;
}

function getTodoSectionPeriodId(section, item) {
  if (typeof storageBundleApi?.getPeriodIdForSectionItem === "function") {
    return storageBundleApi.getPeriodIdForSectionItem(section, item) || "undated";
  }
  const dateText =
    typeof item?.date === "string" && item.date
      ? item.date
      : typeof item?.time === "string" && item.time
        ? item.time
        : typeof item?.timestamp === "string" && item.timestamp
          ? item.timestamp
          : typeof item?.updatedAt === "string" && item.updatedAt
            ? item.updatedAt
            : "";
  return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : "undated";
}

function getTodoSectionPeriodIds(section, items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => getTodoSectionPeriodId(section, item))
        .filter(Boolean),
    ),
  );
}

function getTodoNormalizedPeriodIds(periodIds = []) {
  return Array.from(
    new Set(
      (Array.isArray(periodIds) ? periodIds : [])
        .map((periodId) => String(periodId || "").trim())
        .filter(Boolean),
    ),
  );
}

function mergeTodoSectionItemsByPeriods(
  section,
  existingItems = [],
  incomingItems = [],
  periodIds = [],
) {
  const normalizedPeriodIds = Array.from(
    new Set(
      (Array.isArray(periodIds) ? periodIds : [])
        .map((periodId) => String(periodId || "").trim())
        .filter(Boolean),
    ),
  );
  if (!normalizedPeriodIds.length) {
    return hydrateTodoCollection(section, incomingItems);
  }
  const targetPeriods = new Set(normalizedPeriodIds);
  const preservedItems = (Array.isArray(existingItems) ? existingItems : []).filter(
    (item) => !targetPeriods.has(getTodoSectionPeriodId(section, item)),
  );
  return hydrateTodoCollection(section, [...preservedItems, ...(incomingItems || [])]);
}

function getTodoNormalizedChangedPeriods(changedPeriods = {}) {
  const source =
    changedPeriods && typeof changedPeriods === "object" && !Array.isArray(changedPeriods)
      ? changedPeriods
      : {};
  return Object.keys(source)
    .sort()
    .reduce((result, section) => {
      const normalizedSection = String(section || "").trim();
      if (!normalizedSection) {
        return result;
      }
      const normalizedPeriodIds = getTodoNormalizedPeriodIds(source[section]);
      if (normalizedPeriodIds.length) {
        result[normalizedSection] = normalizedPeriodIds;
      }
      return result;
    }, {});
}

function buildTodoStorageChangeSignature(changedSections = [], changedPeriods = {}) {
  const normalizedSections = getTodoNormalizedChangedSections(changedSections);
  const normalizedPeriods = getTodoNormalizedChangedPeriods(changedPeriods);
  if (!normalizedSections.length && !Object.keys(normalizedPeriods).length) {
    return "";
  }
  return JSON.stringify({
    changedSections: normalizedSections,
    changedPeriods: normalizedPeriods,
  });
}

function pruneTodoIgnoredRefreshEvents(now = Date.now()) {
  todoIgnoredRefreshEvents = todoIgnoredRefreshEvents.filter(
    (entry) => Number(entry?.expiresAt) > now,
  );
}

function markTodoSelfRefreshIgnored(changedSections = [], changedPeriods = {}) {
  const signature = buildTodoStorageChangeSignature(changedSections, changedPeriods);
  if (!signature) {
    return;
  }
  const now = Date.now();
  pruneTodoIgnoredRefreshEvents(now);
  todoIgnoredRefreshEvents.push({
    signature,
    expiresAt: now + TODO_SELF_REFRESH_IGNORE_WINDOW_MS,
  });
}

function shouldIgnoreTodoSelfRefresh(detail = {}) {
  const source = String(detail?.source || "").trim().toLowerCase();
  if (
    source &&
    !source.includes("renderer") &&
    !source.includes("webview")
  ) {
    return false;
  }
  const signature = buildTodoStorageChangeSignature(
    detail?.changedSections,
    detail?.changedPeriods,
  );
  if (!signature) {
    return false;
  }
  const now = Date.now();
  pruneTodoIgnoredRefreshEvents(now);
  const matchIndex = todoIgnoredRefreshEvents.findIndex(
    (entry) => entry.signature === signature,
  );
  if (matchIndex === -1) {
    return false;
  }
  todoIgnoredRefreshEvents.splice(matchIndex, 1);
  return true;
}

function mergeTodoStorageChangeDetails(base = {}, detail = {}) {
  const normalizedBase =
    base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const normalizedDetail =
    detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
  const changedSections = getTodoNormalizedChangedSections([
    ...(normalizedBase.changedSections || []),
    ...(normalizedDetail.changedSections || []),
  ]);
  const changedPeriods = {};
  Array.from(
    new Set([
      ...Object.keys(normalizedBase.changedPeriods || {}),
      ...Object.keys(normalizedDetail.changedPeriods || {}),
    ]),
  ).forEach((section) => {
    const periodIds = getTodoNormalizedPeriodIds([
      ...(normalizedBase.changedPeriods?.[section] || []),
      ...(normalizedDetail.changedPeriods?.[section] || []),
    ]);
    if (periodIds.length) {
      changedPeriods[section] = periodIds;
    }
  });
  return {
    ...normalizedBase,
    ...normalizedDetail,
    changedSections,
    changedPeriods,
    reason:
      typeof normalizedDetail.reason === "string" && normalizedDetail.reason.trim()
        ? normalizedDetail.reason.trim()
        : typeof normalizedBase.reason === "string" && normalizedBase.reason.trim()
          ? normalizedBase.reason.trim()
          : "",
    source:
      typeof normalizedDetail.source === "string" && normalizedDetail.source.trim()
        ? normalizedDetail.source.trim()
        : typeof normalizedBase.source === "string" && normalizedBase.source.trim()
          ? normalizedBase.source.trim()
          : "",
  };
}

function getTodoToggleCommitMap(kind) {
  return kind === "checkin"
    ? todoDeferredToggleCommits.checkin
    : todoDeferredToggleCommits.todo;
}

function hasTodoPendingLocalMutations() {
  if (todoPendingPersistenceCount > 0) {
    return true;
  }
  return Object.values(todoDeferredToggleCommits).some((commitMap) =>
    Array.from(commitMap.values()).some(
      (controller) =>
        controller &&
        (controller.pending === true ||
          controller.running === true ||
          Number(controller.timer) > 0),
    ),
  );
}

function scheduleTodoExternalStorageRefresh(detail = {}) {
  todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
    todoQueuedExternalStorageRefreshDetail,
    detail,
  );
  if (hasTodoPendingLocalMutations()) {
    todoPendingExternalStorageRefresh = true;
    window.__controlerTodoRuntimePendingExternalRefresh = true;
    return;
  }
  if (todoExternalStorageRefreshQueued) {
    return;
  }
  todoExternalStorageRefreshQueued = true;
  if (todoExternalStorageRefreshCoordinator) {
    todoExternalStorageRefreshCoordinator.enqueue({});
    return;
  }
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    void refreshTodoFromExternalStorageChange({});
  });
}

function flushTodoDeferredExternalRefreshIfNeeded() {
  if (!todoPendingExternalStorageRefresh || hasTodoPendingLocalMutations()) {
    return;
  }
  todoPendingExternalStorageRefresh = false;
  window.__controlerTodoRuntimePendingExternalRefresh = false;
  scheduleTodoExternalStorageRefresh(todoQueuedExternalStorageRefreshDetail || {});
}

function getTodoSectionStateSnapshot(section) {
  switch (section) {
    case "todos":
      return cloneTodoValue(todos);
    case "checkinItems":
      return cloneTodoValue(checkinItems);
    case "dailyCheckins":
      return cloneTodoValue(dailyCheckins);
    case "checkins":
      return cloneTodoValue(checkins);
    default:
      return [];
  }
}

function persistTodoLocalSection(section, items = []) {
  localStorage.setItem(section, JSON.stringify(items));
}

function persistTodoLocalMirrorCore(source = {}) {
  Object.keys(source).forEach((section) => {
    if (
      section === "todos" ||
      section === "checkinItems" ||
      section === "dailyCheckins" ||
      section === "checkins"
    ) {
      persistTodoLocalSection(section, cloneTodoValue(source[section] || []));
      return;
    }
    if (section === TODO_SORT_PREFERENCE_KEY) {
      try {
        localStorage.setItem(
          TODO_SORT_PREFERENCE_KEY,
          normalizeTodoSortPreference(source[section]),
        );
      } catch (error) {
        console.error("同步待办排序本地镜像失败:", error);
      }
    }
  });
}

function getTodoCheckinEntryTimestamp(entry = {}) {
  const candidate = Date.parse(String(entry?.time || entry?.updatedAt || ""));
  return Number.isFinite(candidate) ? candidate : 0;
}

function isTodoCheckinEntryNewer(candidate, current) {
  if (!current) {
    return true;
  }
  if (candidate.timestamp !== current.timestamp) {
    return candidate.timestamp > current.timestamp;
  }
  return candidate.index > current.index;
}

function findLatestTodoDailyCheckinMatch(itemId, date) {
  const normalizedItemId = String(itemId || "").trim();
  const normalizedDate = String(date || "").trim();
  if (!normalizedItemId || !normalizedDate) {
    return null;
  }
  let latest = null;
  dailyCheckins.forEach((entry, index) => {
    if (
      String(entry?.itemId || "").trim() !== normalizedItemId ||
      String(entry?.date || "").trim() !== normalizedDate
    ) {
      return;
    }
    const candidate = {
      entry,
      index,
      timestamp: getTodoCheckinEntryTimestamp(entry),
    };
    if (isTodoCheckinEntryNewer(candidate, latest)) {
      latest = candidate;
    }
  });
  return latest;
}

function getLatestTodoDailyCheckinEntry(itemId, date) {
  return findLatestTodoDailyCheckinMatch(itemId, date)?.entry || null;
}

function dedupeTodoDailyCheckinsForDate(itemId, date) {
  const latest = findLatestTodoDailyCheckinMatch(itemId, date);
  if (!latest) {
    return null;
  }
  const normalizedItemId = String(itemId || "").trim();
  const normalizedDate = String(date || "").trim();
  let duplicateCount = 0;
  dailyCheckins = dailyCheckins.filter((entry, index) => {
    if (
      String(entry?.itemId || "").trim() !== normalizedItemId ||
      String(entry?.date || "").trim() !== normalizedDate
    ) {
      return true;
    }
    duplicateCount += 1;
    return index === latest.index;
  });
  return duplicateCount > 1
    ? findLatestTodoDailyCheckinMatch(itemId, date)
    : latest;
}

function queueTodoPersistenceTask(task, options = {}) {
  const {
    errorLabel = "保存待办数据失败:",
    refreshReminders = false,
  } = options;
  invalidateTodoDerivedCaches();
  if (refreshReminders) {
    reminderTools?.refresh?.({
      resetWindow: true,
    });
  }
  todoLastPersistenceError = null;
  todoPendingPersistenceCount += 1;
  todoPersistChain = todoPersistChain
    .catch(() => undefined)
    .then(() => task())
    .catch((error) => {
      todoLastPersistenceError =
        error instanceof Error ? error : new Error(String(error || "保存失败"));
      console.error(errorLabel, todoLastPersistenceError);
      return false;
    })
    .finally(() => {
      todoPendingPersistenceCount = Math.max(0, todoPendingPersistenceCount - 1);
      if (todoPendingPersistenceCount <= 0) {
        flushTodoDeferredExternalRefreshIfNeeded();
      }
    });
  return todoPersistChain;
}

async function flushTodoPendingPersistence() {
  if (todoPendingPersistenceCount > 0) {
    await todoPersistChain.catch(() => false);
  }
  if (todoLastPersistenceError) {
    throw todoLastPersistenceError;
  }
  if (typeof window.ControlerStorage?.flush === "function") {
    await window.ControlerStorage.flush();
  }
  if (todoLastPersistenceError) {
    throw todoLastPersistenceError;
  }
  return true;
}

function registerTodoBeforePageLeaveGuard() {
  if (todoBeforePageLeaveGuardBound) {
    return;
  }
  todoBeforePageLeaveGuardBound = true;
  uiTools?.registerBeforePageLeave?.(async () => {
    if (todoPendingPersistenceCount <= 0 && !todoLastPersistenceError) {
      return true;
    }
    return flushTodoPendingPersistence();
  }, {
    showLoadingOverlay: false,
  });
}

function queueTodoCoreSave(partialCore = {}, options = {}) {
  const source =
    partialCore && typeof partialCore === "object" && !Array.isArray(partialCore)
      ? partialCore
      : {};
  const changedSections = getTodoNormalizedChangedSections(Object.keys(source));
  if (!changedSections.length) {
    return Promise.resolve(true);
  }
  persistTodoLocalMirrorCore(source);
  markTodoSelfRefreshIgnored(changedSections);
  return queueTodoPersistenceTask(
    async () => {
      const bundleStorage = window.ControlerStorage;
      if (typeof bundleStorage?.appendJournal === "function") {
        await bundleStorage.appendJournal(
          [
            {
              kind: "replaceCoreState",
              partialCore: cloneTodoValue(source),
            },
          ],
          {
            reason:
              typeof options?.reason === "string" && options.reason.trim()
                ? options.reason.trim()
                : "todo-core-save",
          },
        );
        return true;
      }
      if (typeof bundleStorage?.replaceCoreState === "function") {
        await bundleStorage.replaceCoreState(cloneTodoValue(source), {
          reason:
            typeof options?.reason === "string" && options.reason.trim()
              ? options.reason.trim()
              : "todo-core-save",
        });
        return true;
      }
      changedSections.forEach((section) => {
        persistTodoLocalSection(section, source[section] || []);
      });
      return true;
    },
    {
      errorLabel: options?.errorLabel || "保存待办核心数据失败:",
      refreshReminders: options?.refreshReminders === true,
    },
  );
}

function queueTodoSectionSave(section, options = {}) {
  const normalizedSection =
    section === "dailyCheckins" || section === "checkins" ? section : "";
  if (!normalizedSection) {
    return Promise.resolve(false);
  }

  const currentItems = getTodoSectionStateSnapshot(normalizedSection);
  const explicitPeriodIds = getTodoNormalizedPeriodIds(options?.periodIds);
  const previousPeriodIds = getTodoSectionPeriodIds(
    normalizedSection,
    options?.previousItems,
  );
  const periodIds = explicitPeriodIds.length
    ? explicitPeriodIds
    : getTodoNormalizedPeriodIds([
        ...getTodoSectionPeriodIds(normalizedSection, currentItems),
        ...previousPeriodIds,
      ]);

  if (!periodIds.length) {
    todoLoadedSectionPeriods[normalizedSection] = new Set(
      getTodoSectionPeriodIds(normalizedSection, currentItems),
    );
    return Promise.resolve(true);
  }

  persistTodoLocalSection(normalizedSection, currentItems);

  periodIds.forEach((periodId) => {
    markTodoSelfRefreshIgnored([normalizedSection], {
      [normalizedSection]: [periodId],
    });
  });

  return queueTodoPersistenceTask(
    async () => {
      const bundleStorage = window.ControlerStorage;
      if (typeof bundleStorage?.appendJournal === "function") {
        await bundleStorage.appendJournal(
          periodIds.map((periodId) => ({
            kind: "saveSectionRange",
            section: normalizedSection,
            payload: {
              periodId,
              items: currentItems.filter(
                (item) =>
                  getTodoSectionPeriodId(normalizedSection, item) === periodId,
              ),
              mode: "replace",
            },
          })),
          {
            reason: `todo-section-save:${normalizedSection}`,
          },
        );
      } else if (typeof bundleStorage?.saveSectionRange === "function") {
        await Promise.all(
          periodIds.map((periodId) =>
            bundleStorage.saveSectionRange(normalizedSection, {
              periodId,
              items: currentItems.filter(
                (item) =>
                  getTodoSectionPeriodId(normalizedSection, item) === periodId,
              ),
              mode: "replace",
            }),
          ),
        );
      } else {
        persistTodoLocalSection(normalizedSection, currentItems);
      }
      todoLoadedSectionPeriods[normalizedSection] = new Set(
        getTodoSectionPeriodIds(normalizedSection, currentItems),
      );
      return true;
    },
    {
      errorLabel:
        options?.errorLabel ||
        `保存${normalizedSection === "dailyCheckins" ? "每日打卡" : "进度记录"}分区数据失败:`,
      refreshReminders: options?.refreshReminders === true,
    },
  );
}

function handleTodoNonBlockingSaveFailure(message, options = {}) {
  console.error(message, options.error || "");
  const rollbackSnapshot =
    options?.rollbackSnapshot &&
    typeof options.rollbackSnapshot === "object" &&
    !Array.isArray(options.rollbackSnapshot)
      ? options.rollbackSnapshot
      : null;
  if (rollbackSnapshot) {
    applyTodoWorkspaceSnapshot(rollbackSnapshot);
    clearTodoPersistenceError();
    scheduleTodoInterfaceRefresh();
  }
  const bundleStorage = window.ControlerStorage;
  if (typeof bundleStorage?.syncFromSource === "function") {
    void bundleStorage
      .syncFromSource({
        reason: "todo-save-recovery",
      })
      .then((result) => {
        if (result?.state && typeof result.state === "object") {
          applyTodoWorkspaceSnapshot(result.state);
          clearTodoPersistenceError();
          scheduleTodoInterfaceRefresh();
        }
      })
      .catch((error) => {
        console.error("恢复待办工作区失败:", error);
      });
  }
  void showTodoAlert(options.message || "保存失败，请稍后重试。", {
    title: options.title || "保存失败",
    danger: true,
  }).catch?.(() => {});
}

function scheduleTodoToggleCommit(
  kind,
  targetId,
  buildCommitPlan,
  rollbackSnapshot = null,
) {
  const normalizedId = String(targetId || "").trim();
  if (!normalizedId || typeof buildCommitPlan !== "function") {
    return false;
  }
  const commitMap = getTodoToggleCommitMap(kind);
  let controller = commitMap.get(normalizedId);
  if (!controller) {
    controller = {
      timer: 0,
      running: false,
      pending: false,
      buildCommitPlan: null,
      rollbackSnapshot: null,
    };
    commitMap.set(normalizedId, controller);
  }
  controller.pending = true;
  controller.buildCommitPlan = buildCommitPlan;
  if (!controller.rollbackSnapshot && rollbackSnapshot) {
    controller.rollbackSnapshot = rollbackSnapshot;
  }
  if (controller.timer) {
    window.clearTimeout(controller.timer);
  }
  controller.timer = window.setTimeout(() => {
    controller.timer = 0;
    void flushTodoToggleCommit(kind, normalizedId);
  }, TODO_TOGGLE_PERSIST_DEBOUNCE_MS);
  return true;
}

async function flushTodoToggleCommit(kind, targetId) {
  const commitMap = getTodoToggleCommitMap(kind);
  const controller = commitMap.get(targetId);
  if (!controller || controller.running) {
    return;
  }
  controller.running = true;
  try {
    while (controller.pending) {
      controller.pending = false;
      const commitPlan =
        typeof controller.buildCommitPlan === "function"
          ? controller.buildCommitPlan()
          : null;
      if (!commitPlan || typeof commitPlan.save !== "function") {
        controller.rollbackSnapshot = null;
        continue;
      }
      const saved = await commitPlan.save();
      if (!saved) {
        if (controller.pending) {
          continue;
        }
        if (typeof commitPlan.onFailure === "function") {
          await commitPlan.onFailure(controller.rollbackSnapshot);
        }
        controller.rollbackSnapshot = null;
        break;
      }
      if (typeof commitPlan.onSuccess === "function") {
        commitPlan.onSuccess();
      }
      if (controller.pending) {
        continue;
      }
      controller.rollbackSnapshot = null;
    }
  } finally {
    controller.running = false;
    if (!controller.timer && controller.pending) {
      void flushTodoToggleCommit(kind, targetId);
      return;
    }
    if (!controller.timer && !controller.pending) {
      commitMap.delete(targetId);
    }
    flushTodoDeferredExternalRefreshIfNeeded();
  }
}

async function persistTodoWorkspaceSnapshot(snapshot) {
  const nextSnapshot =
    snapshot && typeof snapshot === "object"
      ? snapshot
      : {
          todos,
          checkinItems,
          dailyCheckins,
          checkins,
        };
  const bundleStorage = window.ControlerStorage;
  if (
    typeof bundleStorage?.appendJournal === "function"
  ) {
    const sectionOps = ["dailyCheckins", "checkins"].flatMap((section) => {
      const items = nextSnapshot[section] || [];
      const periodIds = Array.from(
        new Set([
          ...getTodoSectionPeriodIds(section, items),
          ...Array.from(todoLoadedSectionPeriods[section] || []),
        ]),
      );
      if (!periodIds.length) {
        todoLoadedSectionPeriods[section] = new Set();
        return [];
      }
      todoLoadedSectionPeriods[section] = new Set(
        getTodoSectionPeriodIds(section, items),
      );
      return periodIds.map((periodId) => ({
        kind: "saveSectionRange",
        section,
        payload: {
          periodId,
          items: (items || []).filter(
            (item) => getTodoSectionPeriodId(section, item) === periodId,
          ),
          mode: "replace",
        },
      }));
    });
    await bundleStorage.appendJournal(
      [
        {
          kind: "replaceCoreState",
          partialCore: {
            todos: cloneTodoValue(nextSnapshot.todos || []),
            checkinItems: cloneTodoValue(nextSnapshot.checkinItems || []),
          },
        },
        ...sectionOps,
      ],
      {
        reason: "todo-workspace",
        flush: true,
      },
    );
    return true;
  }
  if (
    typeof bundleStorage?.replaceCoreState === "function" &&
    typeof bundleStorage?.saveSectionRange === "function"
  ) {
    await bundleStorage.replaceCoreState({
      todos: cloneTodoValue(nextSnapshot.todos || []),
      checkinItems: cloneTodoValue(nextSnapshot.checkinItems || []),
    }, {
      reason: "todo-workspace",
    });

    const persistRangeSection = async (section, items) => {
      const periodIds = Array.from(
        new Set([
          ...getTodoSectionPeriodIds(section, items),
          ...Array.from(todoLoadedSectionPeriods[section] || []),
        ]),
      );
      if (!periodIds.length) {
        todoLoadedSectionPeriods[section] = new Set();
        return;
      }
      await Promise.all(
        periodIds.map((periodId) =>
          bundleStorage.saveSectionRange(section, {
            periodId,
            items: (items || []).filter(
              (item) => getTodoSectionPeriodId(section, item) === periodId,
            ),
            mode: "replace",
          }),
        ),
      );
      todoLoadedSectionPeriods[section] = new Set(
        getTodoSectionPeriodIds(section, items),
      );
    };

    await persistRangeSection("dailyCheckins", nextSnapshot.dailyCheckins || []);
    await persistRangeSection("checkins", nextSnapshot.checkins || []);
    return true;
  }

  localStorage.setItem("todos", JSON.stringify(nextSnapshot.todos || []));
  localStorage.setItem("checkins", JSON.stringify(nextSnapshot.checkins || []));
  localStorage.setItem("checkinItems", JSON.stringify(nextSnapshot.checkinItems || []));
  localStorage.setItem(
    "dailyCheckins",
    JSON.stringify(nextSnapshot.dailyCheckins || []),
  );
  return true;
}

function queueTodoPersist() {
  const snapshot = {
    todos: cloneTodoValue(todos),
    checkinItems: cloneTodoValue(checkinItems),
    dailyCheckins: cloneTodoValue(dailyCheckins),
    checkins: cloneTodoValue(checkins),
  };
  persistTodoLocalMirrorCore(snapshot);
  return queueTodoPersistenceTask(
    () => persistTodoWorkspaceSnapshot(snapshot),
    {
      errorLabel: "保存待办数据失败:",
    },
  );
}
const TODO_WIDGET_CONTEXT = (() => {
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

function resolvePreferredTodoView() {
  if (TODO_WIDGET_CONTEXT.launchAction === "show-checkins") {
    return "checkins";
  }
  if (TODO_WIDGET_CONTEXT.launchAction === "show-todos") {
    return "todos";
  }
  if (window.__controlerTodoWidgetView === "checkins") {
    return "checkins";
  }
  if (window.__controlerTodoWidgetView === "todos") {
    return "todos";
  }
  if (TODO_WIDGET_CONTEXT.kind === "checkins") {
    return "checkins";
  }
  if (TODO_WIDGET_CONTEXT.kind === "todos") {
    return "todos";
  }
  return "";
}

function normalizeTodoView(view) {
  return view === "checkins" ? "checkins" : "todos";
}

function setTodoView(view, options = {}) {
  const nextView = normalizeTodoView(view);
  currentView = nextView;
  if (options.persistWidgetView !== false) {
    window.__controlerTodoWidgetView = nextView;
  }
  return nextView;
}

function applyTodoWidgetMode() {
  const preferredView = resolvePreferredTodoView();
  if (preferredView) {
    currentView = preferredView;
  }

  const todoViewBtn = document.getElementById("todo-view-btn");
  const checkinViewBtn = document.getElementById("checkin-view-btn");
  if (!TODO_WIDGET_CONTEXT.enabled) {
    return;
  }

  if (preferredView === "todos" && checkinViewBtn) {
    checkinViewBtn.style.display = "none";
  }
  if (preferredView === "checkins" && todoViewBtn) {
    todoViewBtn.style.display = "none";
  }
}

function applyTodoDesktopWidgetMode() {
  if (!TODO_WIDGET_CONTEXT.enabled) {
    return;
  }

  document.body.classList.add("desktop-widget-page", "desktop-widget-todo-page");
  document.body.dataset.widgetKind =
    TODO_WIDGET_CONTEXT.kind ||
    (resolvePreferredTodoView() === "checkins" ? "checkins" : "todos");
  document.title =
    resolvePreferredTodoView() === "checkins" ? "打卡列表 小组件" : "待办事项 小组件";

  if (document.getElementById("desktop-widget-todo-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "desktop-widget-todo-style";
  style.textContent = `
    body.desktop-widget-todo-page {
      overflow: hidden;
    }

    body.desktop-widget-todo-page .app-sidebar,
    body.desktop-widget-todo-page .todo-topbar {
      display: none !important;
    }

    body.desktop-widget-todo-page .todo-main {
      margin: 0 !important;
      padding: 12px !important;
      display: flex;
      flex-direction: column;
      min-height: 0 !important;
      height: 100vh !important;
      box-sizing: border-box;
      overflow: hidden !important;
    }

    body.desktop-widget-todo-page .todo-shell {
      margin: 0 !important;
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow: hidden auto !important;
    }
  `;
  document.head.appendChild(style);
}

function matchesId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function normalizeTodoNotificationConfig(rawNotification, todoLike = {}) {
  return reminderTools?.normalizeTodoReminder?.(rawNotification, todoLike) || {
    enabled: false,
    mode: "none",
    customTime: "09:00",
    customOffsetDays: 0,
  };
}

function normalizeCheckinNotificationConfig(rawNotification, itemLike = {}) {
  return reminderTools?.normalizeCheckinReminder?.(rawNotification, itemLike) || {
    enabled: false,
    mode: "none",
    customTime: "09:00",
    customOffsetDays: 0,
  };
}

function getTodoReminderBaseDate(todoLike = null) {
  return (
    todoLike?._occurrenceDate ||
    todoLike?.dueDate ||
    todoLike?.startDate ||
    getLocalDateText()
  );
}

function getTodoReminderSectionHtml(todo = null, prefix = "todo") {
  const baseDateText = getTodoReminderBaseDate(todo);
  const reminderConfig = normalizeTodoNotificationConfig(todo?.notification, {
    ...todo,
    dueDate: todo?.dueDate || baseDateText,
    startDate: todo?.startDate || baseDateText,
  });
  const customDateTimeValue =
    reminderTools?.buildRelativeCustomDateTimeValue?.(
      baseDateText,
      reminderConfig,
      reminderConfig.customTime || "09:00",
    ) || "";

  return `
    <div>
      <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
        通知
      </label>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
          <input type="radio" name="${prefix}-notification-mode" value="none" ${!reminderConfig.enabled || reminderConfig.mode === "none" ? "checked" : ""}>
          不通知
        </label>
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
          <input type="radio" name="${prefix}-notification-mode" value="custom" ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "checked" : ""}>
          自定义时间
        </label>
      </div>
      <div id="${prefix}-notification-custom-wrap" style="
        margin-top: 10px;
        padding: 10px;
        border-radius: 8px;
        background-color: var(--bg-tertiary);
        display: ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "block" : "none"};
      ">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
          提醒时间
        </label>
        <input
          type="datetime-local"
          id="${prefix}-notification-custom-input"
          value="${customDateTimeValue}"
          style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-quaternary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 15px;
          "
        >
        <div style="margin-top: 8px; color: var(--muted-text-color); font-size: 12px; line-height: 1.5;">
          若待办启用了重复或使用“开始日期 - 结束日期”模式，将按相同的相对提醒时间同步到后续重复日期。
        </div>
      </div>
    </div>
  `;
}

function bindTodoReminderInputs(modal, prefix = "todo") {
  const radios = modal.querySelectorAll(
    `input[name="${prefix}-notification-mode"]`,
  );
  const customWrap = modal.querySelector(
    `#${prefix}-notification-custom-wrap`,
  );
  const syncReminderMode = () => {
    const activeMode =
      modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
        ?.value || "none";
    if (customWrap) {
      customWrap.style.display = activeMode === "custom" ? "block" : "none";
    }
  };
  radios.forEach((radio) => {
    radio.addEventListener("change", syncReminderMode);
  });
  syncReminderMode();
}

function bindTodoReminderBaseDateSync(modal, prefix = "todo") {
  const customInput = modal.querySelector(`#${prefix}-notification-custom-input`);
  if (!customInput) {
    return;
  }

  const dueDateInput = modal.querySelector("#todo-due-date-input");
  const startDateInput = modal.querySelector("#todo-start-date-input");
  const repeatInputs = modal.querySelectorAll('input[name="todo-repeat-type"]');
  let customInputDirty = false;

  const syncCustomReminderInput = () => {
    if (customInputDirty) {
      return;
    }
    const activeMode =
      modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
        ?.value || "none";
    if (activeMode !== "custom") {
      return;
    }
    const repeatType =
      modal.querySelector('input[name="todo-repeat-type"]:checked')?.value ||
      "none";
    const baseDateText =
      repeatType === "none"
        ? dueDateInput?.value ||
          startDateInput?.value ||
          getLocalDateText()
        : startDateInput?.value ||
          dueDateInput?.value ||
          getLocalDateText();
    const timeText =
      (customInput.value.includes("T") ? customInput.value.split("T")[1] : "") ||
      "09:00";
    customInput.value = `${baseDateText}T${timeText}`;
  };

  customInput.addEventListener("change", () => {
    customInputDirty = true;
  });
  dueDateInput?.addEventListener("change", syncCustomReminderInput);
  startDateInput?.addEventListener("change", syncCustomReminderInput);
  repeatInputs.forEach((input) => {
    input.addEventListener("change", syncCustomReminderInput);
  });
  syncCustomReminderInput();
}

function readTodoReminderConfig(modal, todoLike = {}, prefix = "todo") {
  const mode =
    modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
      ?.value || "none";
  const baseDateText = getTodoReminderBaseDate(todoLike);
  if (mode !== "custom") {
    return normalizeTodoNotificationConfig(
      {
        enabled: false,
        mode: "none",
      },
      todoLike,
    );
  }
  const customInputValue =
    modal.querySelector(`#${prefix}-notification-custom-input`)?.value || "";
  const parsedCustomConfig =
    reminderTools?.parseRelativeCustomDateTimeInput?.(
      customInputValue,
      baseDateText,
      {
        fallbackTime: "09:00",
      },
    ) || {
      customTime: "09:00",
      customOffsetDays: 0,
    };
  return normalizeTodoNotificationConfig(
    {
      enabled: true,
      mode,
      customTime: parsedCustomConfig.customTime,
      customOffsetDays: parsedCustomConfig.customOffsetDays,
    },
    todoLike,
  );
}

function getCheckinReminderSectionHtml(item = null, prefix = "checkin") {
  const reminderConfig = normalizeCheckinNotificationConfig(
    item?.notification,
    item,
  );
  return `
    <div>
      <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
        通知
      </label>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
          <input type="radio" name="${prefix}-notification-mode" value="none" ${!reminderConfig.enabled || reminderConfig.mode === "none" ? "checked" : ""}>
          不通知
        </label>
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
          <input type="radio" name="${prefix}-notification-mode" value="custom" ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "checked" : ""}>
          自定义时间
        </label>
      </div>
      <div id="${prefix}-notification-custom-wrap" style="
        margin-top: 10px;
        padding: 10px;
        border-radius: 8px;
        background-color: var(--bg-tertiary);
        display: ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "block" : "none"};
      ">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
          每天提醒时间
        </label>
        <input
          type="time"
          id="${prefix}-notification-time-input"
          value="${reminderConfig.customTime}"
          style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-quaternary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 15px;
          "
        >
        <div style="margin-top: 8px; color: var(--muted-text-color); font-size: 12px; line-height: 1.5;">
          若打卡项目设置了每日或每周重复，将在对应重复日期的这个时间提醒。
        </div>
      </div>
    </div>
  `;
}

function bindCheckinReminderInputs(modal, prefix = "checkin") {
  const radios = modal.querySelectorAll(
    `input[name="${prefix}-notification-mode"]`,
  );
  const customWrap = modal.querySelector(
    `#${prefix}-notification-custom-wrap`,
  );
  const syncReminderMode = () => {
    const activeMode =
      modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
        ?.value || "none";
    if (customWrap) {
      customWrap.style.display = activeMode === "custom" ? "block" : "none";
    }
  };
  radios.forEach((radio) => {
    radio.addEventListener("change", syncReminderMode);
  });
  syncReminderMode();
}

function readCheckinReminderConfig(modal, itemLike = {}, prefix = "checkin") {
  const mode =
    modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
      ?.value || "none";
  if (mode !== "custom") {
    return normalizeCheckinNotificationConfig(
      {
        enabled: false,
        mode: "none",
      },
      itemLike,
    );
  }
  return normalizeCheckinNotificationConfig(
    {
      enabled: true,
      mode,
      customTime:
        modal.querySelector(`#${prefix}-notification-time-input`)?.value || "09:00",
    },
    itemLike,
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isCompactMobileLayout() {
  return window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH;
}

function isTodoSwipeDeleteEnabled() {
  return (
    isCompactMobileLayout() ||
    document.body?.classList.contains("controler-mobile-runtime") ||
    window.ControlerStorage?.isNativeApp === true
  );
}

function getTodoSwipeDeleteActionWidth() {
  return MOBILE_SWIPE_DELETE_ACTION_WIDTH;
}

function setTodoSwipeDeleteOffset(shell, nextOffset, options = {}) {
  if (!(shell instanceof HTMLElement)) {
    return 0;
  }
  const surface = shell.querySelector(".todo-swipe-card");
  if (!(surface instanceof HTMLElement)) {
    return 0;
  }
  const actionWidth = getTodoSwipeDeleteActionWidth();
  const enabled = isTodoSwipeDeleteEnabled();
  const clampedOffset = enabled
    ? Math.max(-actionWidth, Math.min(0, Number(nextOffset) || 0))
    : 0;
  const progress = actionWidth > 0 ? Math.min(1, Math.abs(clampedOffset) / actionWidth) : 0;
  const isOpen = progress >= 0.98 && enabled;

  shell.dataset.swipeEnabled = enabled ? "true" : "false";
  shell.dataset.swipeOpen = isOpen ? "true" : "false";
  shell.dataset.swipeOffset = String(clampedOffset);
  shell.style.setProperty("--todo-swipe-action-width", `${actionWidth}px`);
  shell.style.setProperty("--todo-swipe-progress", progress.toFixed(3));
  shell.classList.toggle("is-open", isOpen);
  shell.classList.toggle("is-swiping", options.animate === false);
  surface.style.transform = `translate3d(${clampedOffset}px, 0, 0)`;

  if (!isOpen && todoActiveSwipeDeleteShell === shell) {
    todoActiveSwipeDeleteShell = null;
  }
  return clampedOffset;
}

function closeTodoSwipeDeleteShell(shell, options = {}) {
  if (!(shell instanceof HTMLElement)) {
    if (!options?.except) {
      todoActiveSwipeDeleteShell = null;
    }
    return;
  }
  setTodoSwipeDeleteOffset(shell, 0, {
    animate: options.animate !== false,
  });
}

function openTodoSwipeDeleteShell(shell, options = {}) {
  if (!(shell instanceof HTMLElement) || !isTodoSwipeDeleteEnabled()) {
    return;
  }
  closeTodoSwipeDeleteShells({
    except: shell,
    animate: options.animate !== false,
  });
  setTodoSwipeDeleteOffset(shell, -getTodoSwipeDeleteActionWidth(), {
    animate: options.animate !== false,
  });
  todoActiveSwipeDeleteShell = shell;
}

function closeTodoSwipeDeleteShells(options = {}) {
  const exceptShell = options?.except instanceof HTMLElement ? options.except : null;
  document.querySelectorAll(".todo-swipe-shell.is-open").forEach((shell) => {
    if (shell instanceof HTMLElement && shell !== exceptShell) {
      closeTodoSwipeDeleteShell(shell, {
        animate: options.animate !== false,
      });
    }
  });
  if (!exceptShell) {
    todoActiveSwipeDeleteShell = null;
  }
}

function ensureTodoSwipeDeleteDismissBinding() {
  if (todoSwipeDeleteDismissBound || typeof document === "undefined") {
    return;
  }
  todoSwipeDeleteDismissBound = true;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !(todoActiveSwipeDeleteShell instanceof HTMLElement) ||
        !todoActiveSwipeDeleteShell.isConnected
      ) {
        todoActiveSwipeDeleteShell = null;
        todoSwipeDeleteConfirmationShell = null;
        return;
      }
      if (todoSwipeDeleteConfirmationShell === todoActiveSwipeDeleteShell) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && todoActiveSwipeDeleteShell.contains(target)) {
        return;
      }
      closeTodoSwipeDeleteShell(todoActiveSwipeDeleteShell);
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!(todoActiveSwipeDeleteShell instanceof HTMLElement)) {
      return;
    }
    if (todoSwipeDeleteConfirmationShell === todoActiveSwipeDeleteShell) {
      return;
    }
    closeTodoSwipeDeleteShell(todoActiveSwipeDeleteShell);
  });
}

async function confirmTodoSwipeDelete(kind, itemId) {
  if (kind === "checkin") {
    const confirmed = await requestTodoConfirmation(
      "确定要删除这个打卡项目吗？此操作不可撤销！",
      {
        title: "删除打卡项目",
        confirmText: "删除",
        cancelText: "取消",
        danger: true,
      },
    );
    if (!confirmed) {
      return false;
    }
    return deleteCheckinItem(itemId, {
      confirmDelete: false,
      refreshView: true,
    });
  }

  const confirmed = await requestTodoConfirmation(
    "确定要删除这个待办事项吗？此操作不可撤销！",
    {
      title: "删除待办事项",
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    },
  );
  if (!confirmed) {
    return false;
  }
  return deleteTodo(itemId, {
    confirmDelete: false,
    refreshView: true,
  });
}

function bindTodoSwipeDeleteShell(shell, options = {}) {
  if (!(shell instanceof HTMLElement)) {
    return null;
  }
  if (shell.__todoSwipeDeleteApi) {
    return shell.__todoSwipeDeleteApi;
  }

  ensureTodoSwipeDeleteDismissBinding();

  const surface = shell.querySelector(".todo-swipe-card");
  const deleteButton = shell.querySelector(".todo-swipe-delete-btn");
  if (!(surface instanceof HTMLElement) || !(deleteButton instanceof HTMLButtonElement)) {
    return null;
  }

  surface.style.touchAction = "pan-y";
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let lastMoveX = 0;
  let lastMoveTime = 0;
  let velocityX = 0;
  let isPointerDown = false;
  let isDragging = false;
  let suppressNextClick = false;
  let deletePending = false;
  let previousBodyUserSelect = "";

  const getOffset = () => Number.parseFloat(shell.dataset.swipeOffset || "0") || 0;
  const releasePointerCapture = () => {
    if (
      pointerId !== null &&
      typeof surface.hasPointerCapture === "function" &&
      surface.hasPointerCapture(pointerId)
    ) {
      try {
        surface.releasePointerCapture(pointerId);
      } catch {}
    }
  };
  const resetDragState = (didDrag = false) => {
    releasePointerCapture();
    pointerId = null;
    isPointerDown = false;
    if (isDragging || didDrag) {
      document.body.style.userSelect = previousBodyUserSelect;
    }
    shell.classList.remove("is-swiping");
    if (didDrag) {
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
    isDragging = false;
    velocityX = 0;
  };

  const handlePointerDown = (event) => {
    if (!isTodoSwipeDeleteEnabled() || deletePending) {
      return;
    }
    if (event.isPrimary === false) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest(
        "button, input, select, textarea, a, label, [role='button'], [data-checkin-id]",
      )
    ) {
      return;
    }

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startOffset = getOffset();
    lastMoveX = event.clientX;
    lastMoveTime = event.timeStamp || Date.now();
    previousBodyUserSelect = document.body.style.userSelect || "";
    isPointerDown = true;
    isDragging = false;
    velocityX = 0;

    if (typeof surface.setPointerCapture === "function") {
      try {
        surface.setPointerCapture(pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (event) => {
    if (!isPointerDown || pointerId !== event.pointerId || !isTodoSwipeDeleteEnabled()) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (!isDragging) {
      if (Math.abs(deltaX) < MOBILE_SWIPE_DELETE_START_THRESHOLD) {
        return;
      }
      if (
        Math.abs(deltaX) <=
        Math.abs(deltaY) + MOBILE_SWIPE_DELETE_DIRECTION_LOCK_THRESHOLD
      ) {
        return;
      }
      isDragging = true;
      document.body.style.userSelect = "none";
      shell.classList.add("is-swiping");
      closeTodoSwipeDeleteShells({
        except: shell,
        animate: true,
      });
    }

    const currentTime = event.timeStamp || Date.now();
    const deltaTime = Math.max(currentTime - lastMoveTime, 1);
    velocityX = (event.clientX - lastMoveX) / deltaTime;
    lastMoveX = event.clientX;
    lastMoveTime = currentTime;

    event.preventDefault();
    setTodoSwipeDeleteOffset(shell, startOffset + deltaX, {
      animate: false,
    });
  };

  const handlePointerEnd = (event) => {
    if (
      pointerId !== null &&
      event?.pointerId !== undefined &&
      event.pointerId !== pointerId
    ) {
      return;
    }

    const didDrag = isDragging;
    const finalOffset = getOffset();
    if (didDrag) {
      const actionWidth = getTodoSwipeDeleteActionWidth();
      let shouldOpen =
        Math.abs(finalOffset) >= actionWidth * MOBILE_SWIPE_DELETE_OPEN_THRESHOLD;
      if (velocityX <= MOBILE_SWIPE_DELETE_OPEN_VELOCITY) {
        shouldOpen = true;
      }
      if (velocityX >= MOBILE_SWIPE_DELETE_CLOSE_VELOCITY) {
        shouldOpen = false;
      }
      if (shouldOpen) {
        openTodoSwipeDeleteShell(shell, {
          animate: true,
        });
      } else {
        closeTodoSwipeDeleteShell(shell, {
          animate: true,
        });
      }
    }
    resetDragState(didDrag);
  };

  const handleClickCapture = (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!shell.classList.contains("is-open")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeTodoSwipeDeleteShell(shell);
  };

  const handleDeleteClick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (deletePending) {
      return;
    }
    deletePending = true;
    todoSwipeDeleteConfirmationShell = shell;
    deleteButton.disabled = true;
    shell.dataset.deletePending = "true";
    try {
      const deleteResult =
        (typeof options.onDelete === "function" ? await options.onDelete() : false) === true;
      if (shell.isConnected) {
        closeTodoSwipeDeleteShell(shell, {
          animate: true,
        });
      }
      return deleteResult;
    } finally {
      if (todoSwipeDeleteConfirmationShell === shell) {
        todoSwipeDeleteConfirmationShell = null;
      }
      deletePending = false;
      if (shell.isConnected) {
        deleteButton.disabled = false;
        shell.dataset.deletePending = "false";
      }
    }
  };

  surface.addEventListener("pointerdown", handlePointerDown);
  surface.addEventListener("pointermove", handlePointerMove);
  surface.addEventListener("pointerup", handlePointerEnd);
  surface.addEventListener("pointercancel", handlePointerEnd);
  surface.addEventListener("lostpointercapture", handlePointerEnd);
  surface.addEventListener("click", handleClickCapture, true);
  deleteButton.addEventListener("click", handleDeleteClick);

  const api = {
    open() {
      openTodoSwipeDeleteShell(shell);
    },
    close(options = {}) {
      closeTodoSwipeDeleteShell(shell, options);
    },
    destroy() {
      resetDragState(false);
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerup", handlePointerEnd);
      surface.removeEventListener("pointercancel", handlePointerEnd);
      surface.removeEventListener("lostpointercapture", handlePointerEnd);
      surface.removeEventListener("click", handleClickCapture, true);
      deleteButton.removeEventListener("click", handleDeleteClick);
      delete shell.__todoSwipeDeleteApi;
    },
  };

  shell.__todoSwipeDeleteApi = api;
  setTodoSwipeDeleteOffset(shell, 0, {
    animate: true,
  });
  return api;
}

function wrapTodoSwipeDeleteCard(cardElement, options = {}) {
  if (!(cardElement instanceof HTMLElement) || !isTodoSwipeDeleteEnabled()) {
    return cardElement;
  }

  const shell = document.createElement("div");
  shell.className = `todo-swipe-shell todo-swipe-shell--${options.kind === "checkin" ? "checkin" : "todo"}`;
  shell.dataset.swipeKind = options.kind === "checkin" ? "checkin" : "todo";
  shell.dataset.swipeItemId = String(options.itemId || "");
  shell.dataset.swipeEnabled = "true";
  shell.style.width = cardElement.style.width || "100%";
  shell.style.maxWidth = cardElement.style.maxWidth || "100%";
  shell.style.alignSelf = cardElement.style.alignSelf || "stretch";
  shell.style.borderRadius = cardElement.style.borderRadius || "22px";
  shell.style.marginBottom = cardElement.style.marginBottom || "0";
  shell.style.setProperty(
    "--todo-swipe-action-width",
    `${getTodoSwipeDeleteActionWidth()}px`,
  );

  cardElement.style.width = "100%";
  cardElement.style.maxWidth = "100%";
  cardElement.style.alignSelf = "stretch";
  cardElement.style.marginBottom = "0";

  const actions = document.createElement("div");
  actions.className = "todo-swipe-actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "todo-swipe-delete-btn";
  deleteButton.textContent = "删除";
  deleteButton.setAttribute(
    "aria-label",
    options.kind === "checkin" ? "删除打卡项目" : "删除待办事项",
  );
  deleteButton.title = options.kind === "checkin" ? "删除打卡项目" : "删除待办事项";
  actions.appendChild(deleteButton);

  const surface = document.createElement("div");
  surface.className = "todo-swipe-card";
  surface.appendChild(cardElement);

  shell.append(actions, surface);
  bindTodoSwipeDeleteShell(shell, {
    onDelete: options.onDelete,
  });
  return shell;
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

function getMobileResponsiveScaleFactor() {
  return isCompactMobileLayout() ? 0.82 : 1;
}

function normalizeTodoRepeatType(value) {
  if (value === "weekly") return "weekly";
  if (value === "daily") return "daily";
  return "none";
}

function normalizeTodoScheduleFields({
  dueDate = "",
  repeatType = "none",
  repeatWeekdays = [],
  startDate = "",
  endDate = "",
} = {}) {
  const normalizedRepeatType = normalizeTodoRepeatType(repeatType);
  const todayText = getLocalDateText();
  const normalizedRepeatWeekdays =
    normalizedRepeatType === "weekly"
      ? Array.isArray(repeatWeekdays)
          ? repeatWeekdays
              .map((day) => parseInt(day, 10))
              .filter((day) => day >= 0 && day <= 6)
          : []
      : [];
  const normalizedDueDate = normalizedRepeatType === "none" ? dueDate || "" : "";
  const normalizedStartDate =
    normalizedRepeatType === "none"
      ? normalizedDueDate || startDate || todayText
      : startDate || todayText;
  const normalizedEndDate = normalizedRepeatType === "none" ? "" : endDate || "";

  if (
    normalizedRepeatType === "weekly" &&
    normalizedRepeatWeekdays.length === 0 &&
    normalizedStartDate
  ) {
    const start = new Date(normalizedStartDate);
    if (!Number.isNaN(start.getTime())) {
      normalizedRepeatWeekdays.push(start.getDay());
    }
  }

  return {
    repeatType: normalizedRepeatType,
    repeatWeekdays: normalizedRepeatWeekdays,
    dueDate: normalizedDueDate,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  };
}

function getTableScaleSetting(tableKey, fallback = 1, legacyKeys = []) {
  try {
    const settings = JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}");
    let perScale = Number.NaN;
    [tableKey, ...legacyKeys].some((key) => {
      const parsed = parseFloat(settings?.per?.[key]);
      if (Number.isFinite(parsed)) {
        perScale = parsed;
        return true;
      }
      return false;
    });
    const safePer = Number.isFinite(perScale)
      ? Math.min(Math.max(perScale, 0.1), 2.2)
      : fallback;
    return Math.min(
      Math.max(safePer * getMobileResponsiveScaleFactor(), 0.1),
      2.2,
    );
  } catch (error) {
    console.error("读取待办尺寸设置失败:", error);
    return Math.min(
      Math.max(fallback * getMobileResponsiveScaleFactor(), 0.1),
      2.2,
    );
  }
}

function bindTableScaleLiveRefresh() {
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  let rerenderQueued = false;
  const rerender = () => {
    renderCurrentView();
  };
  const scheduleRerender = () => {
    if (rerenderQueued) {
      return;
    }
    rerenderQueued = true;
    schedule(() => {
      rerenderQueued = false;
      rerender();
    });
  };

  window.addEventListener(TABLE_SIZE_EVENT_NAME, scheduleRerender);
  window.addEventListener("storage", (event) => {
    if (
      event.key === TABLE_SIZE_STORAGE_KEY ||
      event.key === TABLE_SIZE_UPDATED_AT_KEY
    ) {
      scheduleRerender();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRerender();
  });
  window.addEventListener("resize", scheduleRerender);
  window.visualViewport?.addEventListener("resize", scheduleRerender);
}

let todoExternalStorageRefreshQueued = false;

async function refreshTodoFromExternalStorageChange(detail = {}) {
  const refreshDetail = mergeTodoStorageChangeDetails(
    todoQueuedExternalStorageRefreshDetail,
    detail,
  );
  todoQueuedExternalStorageRefreshDetail = null;
  if (!todoPlanSidebarInitialized) {
    todoExternalStorageRefreshQueued = false;
    todoPendingExternalStorageRefresh = true;
    window.__controlerTodoRuntimePendingExternalRefresh = true;
    todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
      todoQueuedExternalStorageRefreshDetail,
      refreshDetail,
    );
    return;
  }
  if (hasTodoPendingLocalMutations()) {
    todoExternalStorageRefreshQueued = false;
    todoPendingExternalStorageRefresh = true;
    window.__controlerTodoRuntimePendingExternalRefresh = true;
    todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
      todoQueuedExternalStorageRefreshDetail,
      refreshDetail,
    );
    return;
  }
  todoExternalStorageRefreshQueued = false;
  todoPendingExternalStorageRefresh = false;
  window.__controlerTodoRuntimePendingExternalRefresh = false;
  const changedSections = getTodoNormalizedChangedSections(
    refreshDetail?.changedSections,
  );
  const bundleStorage = window.ControlerStorage;
  const canUsePreciseRefresh =
    changedSections.length > 0 &&
    !changedSections.includes("core") &&
    typeof bundleStorage?.getCoreState === "function" &&
    typeof bundleStorage?.loadSectionRange === "function";

  if (!canUsePreciseRefresh) {
    const freshSnapshot = await readFreshTodoWorkspaceSnapshot();
    if (hasTodoPendingLocalMutations()) {
      todoPendingExternalStorageRefresh = true;
      window.__controlerTodoRuntimePendingExternalRefresh = true;
      todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
        todoQueuedExternalStorageRefreshDetail,
        refreshDetail,
      );
      return;
    }
    applyTodoWorkspaceSnapshot(freshSnapshot);
    refreshTodoInterface();
    return;
  }

  try {
    let nextTodos = null;
    let nextCheckinItems = null;
    let nextDailyCheckins = null;
    let nextCheckins = null;
    if (changedSections.includes("todos") || changedSections.includes("checkinItems")) {
      const coreSnapshot = await bundleStorage.getCoreState();
      if (changedSections.includes("todos")) {
        nextTodos = hydrateTodoCollection("todos", coreSnapshot?.todos);
      }
      if (changedSections.includes("checkinItems")) {
        nextCheckinItems = hydrateTodoCollection(
          "checkinItems",
          coreSnapshot?.checkinItems,
        );
      }
    }

    const refreshRangeSection = async (section, currentItems) => {
      const periodIds = Array.isArray(refreshDetail?.changedPeriods?.[section])
        ? refreshDetail.changedPeriods[section]
        : [];
      if (!periodIds.length) {
        throw new Error(`missing-changed-periods:${section}`);
      }
      const range = await bundleStorage.loadSectionRange(section, {
        periodIds,
      });
      return mergeTodoSectionItemsByPeriods(
        section,
        currentItems,
        Array.isArray(range?.items) ? range.items : [],
        periodIds,
      );
    };

    if (changedSections.includes("dailyCheckins")) {
      nextDailyCheckins = await refreshRangeSection("dailyCheckins", dailyCheckins);
    }
    if (changedSections.includes("checkins")) {
      nextCheckins = await refreshRangeSection("checkins", checkins);
    }
    if (hasTodoPendingLocalMutations()) {
      todoPendingExternalStorageRefresh = true;
      window.__controlerTodoRuntimePendingExternalRefresh = true;
      todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
        todoQueuedExternalStorageRefreshDetail,
        refreshDetail,
      );
      return;
    }
    if (nextTodos) {
      todos = nextTodos;
    }
    if (nextCheckinItems) {
      checkinItems = nextCheckinItems;
    }
    if (nextDailyCheckins) {
      dailyCheckins = nextDailyCheckins;
    }
    if (nextCheckins) {
      checkins = nextCheckins;
    }
    todoLoadedSectionPeriods.dailyCheckins = new Set(
      getTodoSectionPeriodIds("dailyCheckins", dailyCheckins),
    );
    todoLoadedSectionPeriods.checkins = new Set(
      getTodoSectionPeriodIds("checkins", checkins),
    );
    invalidateTodoDerivedCaches();
  } catch (error) {
    console.error("精确刷新待办数据失败，回退全量加载:", error);
    loadData();
  }
  refreshTodoInterface();
}

function bindTodoExternalStorageRefresh() {
  if (todoExternalStorageListenerBound) {
    return;
  }
  todoExternalStorageListenerBound = true;
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail = event?.detail || {};
    if (!shouldRefreshTodoForExternalChange(detail)) {
      return;
    }
    if (shouldIgnoreTodoSelfRefresh(detail)) {
      return;
    }
    scheduleTodoExternalStorageRefresh(detail);
  });
}

function closeModalElement(modal) {
  if (uiTools?.closeModal) {
    uiTools.closeModal(modal);
    return;
  }
  if (modal?.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}

const TODO_MANAGED_MODAL_SELECTOR =
  '.modal-overlay[data-todo-managed-modal="true"]';

function closeTodoManagedModals() {
  if (typeof document === "undefined") {
    return;
  }
  document.querySelectorAll(TODO_MANAGED_MODAL_SELECTOR).forEach((modal) => {
    if (modal instanceof HTMLElement) {
      closeModalElement(modal);
    }
  });
}

function appendTodoManagedModal(modal, role = "") {
  if (
    !(modal instanceof HTMLElement) ||
    !(typeof document !== "undefined" && document.body instanceof HTMLElement)
  ) {
    return;
  }
  closeTodoManagedModals();
  modal.dataset.todoManagedModal = "true";
  if (typeof role === "string" && role.trim()) {
    modal.dataset.todoModalRole = role.trim();
  }
  document.body.appendChild(modal);
}

async function requestTodoConfirmation(message, options = {}) {
  if (uiTools?.confirmDialog) {
    return uiTools.confirmDialog({
      title: options.title || "请确认操作",
      message,
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      danger: !!options.danger,
    });
  }
  return confirm(message);
}

async function showTodoAlert(message, options = {}) {
  if (uiTools?.alertDialog) {
    await uiTools.alertDialog({
      title: options.title || "提示",
      message,
      confirmText: options.confirmText || "知道了",
      danger: !!options.danger,
    });
    return;
  }
  alert(message);
}

function refreshTodoInterface() {
  renderCurrentView();
  updateStats();
  updateCheckinStats();
  updateStatsPanel();
}

let todoInterfaceRefreshHandle = 0;

function flushScheduledTodoInterfaceRefresh() {
  todoInterfaceRefreshHandle = 0;
  refreshTodoInterface();
}

function scheduleTodoInterfaceRefresh() {
  if (todoInterfaceRefreshHandle) {
    return;
  }

  const canUseAnimationFrame =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function" &&
    typeof document !== "undefined" &&
    !document.hidden;

  if (canUseAnimationFrame) {
    todoInterfaceRefreshHandle = window.requestAnimationFrame(() => {
      flushScheduledTodoInterfaceRefresh();
    });
    return;
  }

  todoInterfaceRefreshHandle = window.setTimeout(() => {
    flushScheduledTodoInterfaceRefresh();
  }, 0);
}

function finalizeTodoModalChange(closeModal, options = {}) {
  const { refreshView = true } = options;

  if (typeof closeModal === "function") {
    closeModal();
  }
  closeTodoManagedModals();

  if (refreshView) {
    scheduleTodoInterfaceRefresh();
  }

  return true;
}

function setTodoModalSubmissionLock(modal, locked) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  const modalContent = modal.querySelector(".modal-content") || modal;
  const controls = modalContent.querySelectorAll(
    "button, input, textarea, select",
  );
  controls.forEach((control) => {
    if (!(control instanceof HTMLElement)) {
      return;
    }
    if (locked) {
      control.dataset.todoModalDisabledBefore = control.disabled
        ? "true"
        : "false";
      control.disabled = true;
      return;
    }
    control.disabled = control.dataset.todoModalDisabledBefore === "true";
    delete control.dataset.todoModalDisabledBefore;
  });
  modal.dataset.todoModalSubmitting = locked ? "true" : "false";
}

function acquireTodoModalSubmissionLock(modal) {
  if (!(modal instanceof HTMLElement)) {
    return false;
  }
  if (modal.dataset.todoModalSubmitting === "true") {
    return false;
  }
  setTodoModalSubmissionLock(modal, true);
  return true;
}

function releaseTodoModalSubmissionLock(modal) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  if (modal.dataset.todoModalSubmitting !== "true") {
    return;
  }
  setTodoModalSubmissionLock(modal, false);
}

function createTodoModalLockedAction(modal, action) {
  return async (...args) => {
    if (!acquireTodoModalSubmissionLock(modal)) {
      return false;
    }
    try {
      const result = await action(...args);
      if (result === false && modal.isConnected) {
        releaseTodoModalSubmissionLock(modal);
      }
      return result;
    } catch (error) {
      if (modal.isConnected) {
        releaseTodoModalSubmissionLock(modal);
      }
      console.error("执行待办模态框操作失败:", error);
      await showTodoAlert("操作失败，请稍后重试。", {
        title: "操作失败",
        danger: true,
      });
      return false;
    }
  };
}

function restoreTodoStateSnapshot(snapshot = {}) {
  if (Object.prototype.hasOwnProperty.call(snapshot, "todos")) {
    todos = hydrateTodoCollection("todos", snapshot.todos);
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, "checkinItems")) {
    checkinItems = hydrateTodoCollection("checkinItems", snapshot.checkinItems);
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, "dailyCheckins")) {
    dailyCheckins = hydrateTodoCollection("dailyCheckins", snapshot.dailyCheckins);
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, "checkins")) {
    checkins = hydrateTodoCollection("checkins", snapshot.checkins);
  }
}

async function rollbackTodoOptimisticChange(snapshot = {}, options = {}) {
  restoreTodoStateSnapshot(snapshot);
  if (options.refreshView !== false) {
    scheduleTodoInterfaceRefresh();
  }
  await showTodoAlert(options.message || "保存失败，本次修改已撤销。", {
    title: options.title || "保存失败",
    danger: true,
  });
  return false;
}

function bindTodoModalActions(modal, handlers = {}) {
  const modalContent = modal?.querySelector?.(".modal-content") || modal;
  if (!modalContent) {
    return () => {};
  }

  const handledTouchActions = new WeakMap();
  const listener = (event) => {
    const actionButton =
      event.target instanceof Element
        ? event.target.closest("[data-todo-modal-action]")
        : null;
    if (!actionButton || !modalContent.contains(actionButton)) {
      return;
    }
    if (event.type === "pointerup" && event.pointerType === "mouse") {
      return;
    }
    const lastHandledAt = handledTouchActions.get(actionButton) || 0;
    if (
      event.type === "click" &&
      Date.now() - lastHandledAt < TODO_MODAL_TOUCH_ACTION_DEDUP_WINDOW_MS
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      return;
    }

    const actionName = actionButton.dataset.todoModalAction;
    const handler = handlers[actionName];
    if (typeof handler !== "function") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    if (event.type === "pointerup") {
      handledTouchActions.set(actionButton, Date.now());
    }
    actionButton.blur?.();
    Promise.resolve(handler(actionButton, event)).catch((error) => {
      console.error("待办模态框按钮处理失败:", error);
    });
  };

  modalContent.addEventListener("pointerup", listener);
  modalContent.addEventListener("click", listener);
  return () => {
    modalContent.removeEventListener("pointerup", listener);
    modalContent.removeEventListener("click", listener);
  };
}

function getTodoListContentWidth(listScale, baseWidth = 980) {
  return Math.max(280, Math.round(baseWidth * listScale));
}

function getGeneratedItemResponsiveScale(baseScale) {
  return Math.min(
    Math.max(
      baseScale * (isCompactMobileLayout() ? MOBILE_GENERATED_ITEM_SHRINK_RATIO : 1),
      0.1,
    ),
    2.2,
  );
}

function getTodoListCardScale(listScale) {
  return Math.min(
    Math.max(getGeneratedItemResponsiveScale(listScale), 0.1),
    2.2,
  );
}

function getTodoListDensityScale(listScale) {
  return Math.min(Math.max(getTodoListCardScale(listScale), 0.1), 2.2);
}

function getCompactTodoCardWidth(listScale, baseWidth = 560) {
  const widthScale = Math.max(getTodoListCardScale(listScale), 0.1);
  const minWidth = isCompactMobileLayout()
    ? TODO_CARD_MIN_WIDTH_MOBILE
    : TODO_CARD_MIN_WIDTH;
  return Math.max(minWidth, Math.round(baseWidth * widthScale));
}

function getTodoListCardMaxWidth(listScale, baseWidth = 560) {
  if (isCompactMobileLayout()) {
    return null;
  }
  return getCompactTodoCardWidth(listScale, baseWidth);
}

function shouldUseTodoDesktopGridLayout(container) {
  if (isCompactMobileLayout() || !(container instanceof HTMLElement)) {
    return false;
  }
  const measuredWidth = Math.max(
    container.clientWidth || 0,
    Math.round(container.getBoundingClientRect?.().width || 0),
  );
  return measuredWidth > 0;
}

function applyTodoCollectionContainerLayout(container, densityScale) {
  if (!(container instanceof HTMLElement)) {
    return { useTwoColumnGrid: false };
  }

  const useTwoColumnGrid = shouldUseTodoDesktopGridLayout(container);
  const gap = `${Math.max(6, Math.round(10 * densityScale))}px`;
  container.style.width = "100%";
  container.style.maxWidth = "100%";
  container.style.boxSizing = "border-box";
  container.style.gap = gap;
  container.style.overflow = "visible";

  if (useTwoColumnGrid) {
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    // Keep visual order aligned with the sorted array: left-to-right, then next row.
    container.style.gridAutoFlow = "row";
    container.style.gridAutoRows = "minmax(0, auto)";
    container.style.alignItems = "start";
    container.style.alignContent = "start";
    container.style.justifyItems = "stretch";
    container.style.flexDirection = "";
  } else {
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = isCompactMobileLayout() ? "stretch" : "center";
    container.style.alignContent = "";
    container.style.justifyItems = "";
    container.style.gridTemplateColumns = "";
    container.style.gridAutoFlow = "";
    container.style.gridAutoRows = "";
  }

  return { useTwoColumnGrid };
}

function applyTodoCollectionItemLayout(itemElement, options = {}) {
  if (!(itemElement instanceof HTMLElement)) {
    return;
  }
  itemElement.style.minWidth = "0";
  if (options.useTwoColumnGrid === true) {
    itemElement.style.width = "100%";
    itemElement.style.maxWidth = "100%";
    itemElement.style.alignSelf = "stretch";
    itemElement.style.justifySelf = "stretch";
    return;
  }
  itemElement.style.justifySelf = "";
}

function applyCenteredEmptyStateLayout(emptyCard, contentWidth, options = {}) {
  if (!(emptyCard instanceof HTMLElement)) {
    return;
  }
  emptyCard.style.width = "100%";
  emptyCard.style.maxWidth =
    options.useTwoColumnGrid === true
      ? "100%"
      : Number.isFinite(contentWidth) && contentWidth > 0
      ? `${contentWidth}px`
      : "100%";
  emptyCard.style.boxSizing = "border-box";
  emptyCard.style.alignSelf = isCompactMobileLayout() ? "stretch" : "center";
  emptyCard.style.flex = "1 1 auto";
  emptyCard.style.display = "flex";
  emptyCard.style.flexDirection = "column";
  emptyCard.style.justifyContent = "center";
  emptyCard.style.minHeight = "220px";
  emptyCard.style.gridColumn = options.useTwoColumnGrid === true ? "1 / -1" : "";
  emptyCard.style.justifySelf = options.useTwoColumnGrid === true ? "stretch" : "";
}

// 普通待办事项数据结构
class Todo {
  constructor(
    title,
    description,
    dueDate,
    priority = "medium",
    tags = [],
    projectId = null,
    repeatType = "none",
    repeatWeekdays = [],
    startDate = "",
    endDate = "",
    notification = null,
  ) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.title = title;
    this.description = description || "";
    this.priority = priority; // "low", "medium", "high"
    this.tags = tags;
    this.projectId = projectId; // 关联的项目ID
    this.createdAt = new Date().toISOString();
    this.completed = false;
    this.completedAt = null;
    this.color = this.getPriorityColor();
    this.type = "todo"; // 类型标识
    const normalizedSchedule = normalizeTodoScheduleFields({
      dueDate,
      repeatType,
      repeatWeekdays,
      startDate,
      endDate,
    });
    this.repeatType = normalizedSchedule.repeatType;
    this.repeatWeekdays = normalizedSchedule.repeatWeekdays;
    this.dueDate = normalizedSchedule.dueDate;
    this.startDate = normalizedSchedule.startDate;
    this.endDate = normalizedSchedule.endDate;
    this.notification = normalizeTodoNotificationConfig(notification, {
      dueDate: this.dueDate,
      startDate: this.startDate,
      repeatType: this.repeatType,
    });
  }

  // 获取优先级颜色
  getPriorityColor() {
    const colors = {
      high: "#f56565", // 红色
      medium: "#ed8936", // 橙色
      low: "#79af85", // 绿色
    };
    return colors[this.priority] || "#79af85";
  }

  // 检查是否过期
  isOverdue() {
    if (this.completed) return false;
    if (this.repeatType !== "none") return false;
    const today = new Date();
    const dueDate = new Date(this.dueDate);
    return dueDate < today;
  }

  // 检查是否今天到期
  isDueToday() {
    if (this.completed) return false;
    if (this.repeatType !== "none") {
      const todayText = getLocalDateText();
      return this.isScheduledOn(todayText);
    }
    const today = new Date();
    const dueDate = new Date(this.dueDate);
    return today.toDateString() === dueDate.toDateString();
  }

  isScheduledOn(dateText) {
    if (this.repeatType === "none") {
      if (!this.dueDate) return false;
      return this.dueDate === dateText;
    }

    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return false;

    const start = new Date(this.startDate || this.dueDate || dateText);
    if (Number.isNaN(start.getTime())) return false;

    const normalizedDate = date.toISOString().split("T")[0];
    const normalizedStart = start.toISOString().split("T")[0];
    if (normalizedDate < normalizedStart) return false;

    if (this.endDate) {
      const end = new Date(this.endDate);
      if (!Number.isNaN(end.getTime())) {
        const normalizedEnd = end.toISOString().split("T")[0];
        if (normalizedDate > normalizedEnd) return false;
      }
    }

    if (this.repeatType === "weekly") {
      return this.repeatWeekdays.includes(date.getDay());
    }

    return true;
  }

  getRepeatSummary() {
    if (this.repeatType === "daily") {
      return "每天重复";
    }
    if (this.repeatType === "weekly") {
      const weekdayMap = ["日", "一", "二", "三", "四", "五", "六"];
      const labels = this.repeatWeekdays
        .slice()
        .sort((a, b) => a - b)
        .map((day) => `周${weekdayMap[day]}`)
        .join("、");
      return `每周 ${labels || "未设置"}`;
    }
    return this.dueDate ? `一次性 · 截止 ${this.dueDate}` : "一次性";
  }

  // 获取截止日期显示文本
  getDueDateDisplay() {
    if (this.repeatType !== "none") {
      return this.getRepeatSummary();
    }
    if (!this.dueDate) return "无截止日期";

    const dueDate = new Date(this.dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (dueDate.toDateString() === today.toDateString()) {
      return "今天";
    } else if (dueDate.toDateString() === tomorrow.toDateString()) {
      return "明天";
    } else if (dueDate.toDateString() === yesterday.toDateString()) {
      return "昨天";
    } else {
      return `${dueDate.getMonth() + 1}月${dueDate.getDate()}日`;
    }
  }

  // 获取截止日期CSS类
  getDueDateClass() {
    if (this.completed) return "";
    if (this.isOverdue()) return "overdue";
    if (this.isDueToday()) return "today";
    return "";
  }
}

// 打卡项目数据结构
class CheckinItem {
  constructor(
    title,
    description,
    color = "#4299e1",
    repeatType = "daily",
    repeatWeekdays = [],
    startDate = "",
    endDate = "",
    notification = null,
  ) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.title = title;
    this.description = description || "";
    this.color = color;
    this.repeatType = repeatType === "weekly" ? "weekly" : "daily";
    this.repeatWeekdays = Array.isArray(repeatWeekdays)
      ? repeatWeekdays
          .map((day) => parseInt(day, 10))
          .filter((day) => day >= 0 && day <= 6)
      : [];

    const today = getLocalDateText();
    this.startDate = startDate || today;
    this.endDate = endDate || "";

    if (this.repeatType === "weekly" && this.repeatWeekdays.length === 0) {
      this.repeatWeekdays = [new Date(this.startDate).getDay()];
    }
    this.createdAt = new Date().toISOString();
    this.type = "checkin"; // 类型标识
    this.notification = normalizeCheckinNotificationConfig(notification, {
      startDate: this.startDate,
      repeatType: this.repeatType,
    });
  }

  isScheduledOn(dateText) {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return false;

    const checkDateStr = date.toISOString().split("T")[0];
    const start = new Date(this.startDate || checkDateStr);
    if (Number.isNaN(start.getTime())) return false;

    const startStr = start.toISOString().split("T")[0];
    if (checkDateStr < startStr) return false;

    if (this.endDate) {
      const end = new Date(this.endDate);
      if (!Number.isNaN(end.getTime())) {
        const endStr = end.toISOString().split("T")[0];
        if (checkDateStr > endStr) return false;
      }
    }

    if (this.repeatType === "weekly") {
      return this.repeatWeekdays.includes(date.getDay());
    }

    return true;
  }

  // 获取今日打卡状态
  getTodayCheckinStatus() {
    const today = getLocalDateText(); // YYYY-MM-DD
    const checkin = getLatestTodoDailyCheckinEntry(this.id, today);
    return checkin ? checkin.checked : false;
  }

  // 切换今日打卡状态
  toggleTodayCheckin() {
    const today = getLocalDateText();
    if (!this.isScheduledOn(today)) {
      return false;
    }
    const previousSnapshot = captureTodoWorkspaceSnapshot();
    const latestMatch = dedupeTodoDailyCheckinsForDate(this.id, today);
    const index = latestMatch ? latestMatch.index : -1;
    const nowText = new Date().toISOString();

    if (index !== -1) {
      // 切换现有记录
      dailyCheckins[index].checked = !dailyCheckins[index].checked;
      dailyCheckins[index].time = nowText;
    } else {
      // 创建新记录
      dailyCheckins.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        itemId: this.id,
        date: today,
        checked: true,
        time: nowText,
      });
    }

    uiTools?.markPerfStage?.("todo-action-ui-committed", {
      allowRepeat: true,
      action: "toggle-checkin",
      itemId: this.id,
    });
    scheduleTodoInterfaceRefresh();
    const todayPeriodId = getTodoSectionPeriodId("dailyCheckins", {
      date: today,
      time: nowText,
    });
    scheduleTodoToggleCommit(
      "checkin",
      this.id,
      () => ({
        save: () =>
          queueTodoSectionSave("dailyCheckins", {
            periodIds: [todayPeriodId],
            errorLabel: "保存今日打卡状态失败:",
          }),
        onSuccess: () => {
          clearTodoPersistenceError();
          uiTools?.markPerfStage?.("todo-action-storage-acked", {
            allowRepeat: true,
            action: "toggle-checkin",
            itemId: this.id,
          });
          scheduleTodoInterfaceRefresh();
        },
        onFailure: async (rollbackSnapshot) => {
          handleTodoNonBlockingSaveFailure("保存今日打卡状态失败。", {
            message: "今日打卡同步失败，已尝试恢复当前数据。",
            rollbackSnapshot: rollbackSnapshot || previousSnapshot,
          });
        },
      }),
      previousSnapshot,
    );
    return true;
  }

  getCheckedDaysCount() {
    return new Set(
      dailyCheckins
        .filter((checkin) => checkin.itemId === this.id && checkin.checked)
        .map((checkin) => checkin.date)
        .filter(Boolean),
    ).size;
  }

  // 获取连续打卡天数
  getStreakDays() {
    if (dailyCheckins.length === 0) return 0;

    const checkedSet = new Set(
      dailyCheckins
        .filter((c) => c.itemId === this.id && c.checked)
        .map((c) => c.date),
    );

    const startCursor = new Date();
    startCursor.setHours(0, 0, 0, 0);
    const maxLoop = 400;
    let loops = 0;
    let streak = 0;

    if (!this.isScheduledOn(getLocalDateText(startCursor))) {
      return 0;
    }

    while (loops < maxLoop) {
      const dateStr = getLocalDateText(startCursor);
      if (this.isScheduledOn(dateStr)) {
        if (!checkedSet.has(dateStr)) {
          break;
        }
        streak++;
      }

      startCursor.setDate(startCursor.getDate() - 1);
      loops++;
    }

    return streak;
  }

  getRepeatSummary() {
    if (this.repeatType === "weekly") {
      const weekdayMap = ["日", "一", "二", "三", "四", "五", "六"];
      const weekdays = this.repeatWeekdays
        .slice()
        .sort((a, b) => a - b)
        .map((day) => `周${weekdayMap[day]}`)
        .join("、");
      return `每周 ${weekdays || "未设置"}`;
    }
    return "每天";
  }
}

// 每日打卡记录数据结构
class DailyCheckin {
  constructor(itemId, date, checked = false) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.itemId = itemId;
    this.date = date; // YYYY-MM-DD格式
    this.checked = checked;
    this.time = new Date().toISOString();
  }
}

class Checkin {
  constructor(todoId, message) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.todoId = todoId;
    this.message = message || "";
    this.time = new Date().toISOString();
  }

  getTimeDisplay() {
    return new Date(this.time).toLocaleString();
  }
}

function getTodoCheckins(todoId) {
  return checkins.filter((checkin) => matchesId(checkin.todoId, todoId));
}

function getTodoCheckinById(checkinId) {
  return checkins.find((checkin) => matchesId(checkin.id, checkinId)) || null;
}

function saveTodoProgressRecord(todoId, message, checkinId = null) {
  if (checkinId) {
    const existing = getTodoCheckinById(checkinId);
    if (!existing) return false;
    existing.message = message;
    existing.updatedAt = new Date().toISOString();
    return true;
  }

  checkins.push(new Checkin(todoId, message));
  return true;
}

function deleteTodoProgressRecord(checkinId) {
  const beforeLength = checkins.length;
  checkins = checkins.filter((checkin) => !matchesId(checkin.id, checkinId));
  return checkins.length !== beforeLength;
}

function getDateText(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function getWeekdayLabel(day) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day] || "";
}

function hydrateTodo(rawTodo) {
  const todo = new Todo(
    rawTodo.title || "未命名待办",
    rawTodo.description || "",
    rawTodo.dueDate || "",
    rawTodo.priority || "medium",
    Array.isArray(rawTodo.tags) ? rawTodo.tags : [],
    rawTodo.projectId || null,
    rawTodo.repeatType || "none",
    Array.isArray(rawTodo.repeatWeekdays) ? rawTodo.repeatWeekdays : [],
    rawTodo.startDate || "",
    rawTodo.endDate || "",
    rawTodo.notification || null,
  );

  todo.id = rawTodo.id || todo.id;
  todo.createdAt = rawTodo.createdAt || todo.createdAt;
  todo.completed = !!rawTodo.completed;
  todo.completedAt = rawTodo.completedAt || null;
  todo.color = rawTodo.color || todo.getPriorityColor();
  const normalizedSchedule = normalizeTodoScheduleFields({
    dueDate: rawTodo.dueDate || "",
    repeatType: rawTodo.repeatType || todo.repeatType,
    repeatWeekdays: Array.isArray(rawTodo.repeatWeekdays)
      ? rawTodo.repeatWeekdays
      : todo.repeatWeekdays,
    startDate: rawTodo.startDate || todo.startDate,
    endDate: rawTodo.endDate || todo.endDate,
  });
  todo.repeatType = normalizedSchedule.repeatType;
  todo.repeatWeekdays = normalizedSchedule.repeatWeekdays;
  todo.dueDate = normalizedSchedule.dueDate;
  todo.startDate = normalizedSchedule.startDate;
  todo.endDate = normalizedSchedule.endDate;
  todo.notification = normalizeTodoNotificationConfig(rawTodo.notification, {
    ...rawTodo,
    dueDate: todo.dueDate,
    startDate: todo.startDate,
    repeatType: todo.repeatType,
  });
  return todo;
}

function hydrateCheckinItem(rawItem) {
  const item = new CheckinItem(
    rawItem.title || "未命名打卡",
    rawItem.description || "",
    rawItem.color || "#4299e1",
    rawItem.repeatType || "daily",
    Array.isArray(rawItem.repeatWeekdays) ? rawItem.repeatWeekdays : [],
    rawItem.startDate || "",
    rawItem.endDate || "",
    rawItem.notification || null,
  );
  item.id = rawItem.id || item.id;
  item.createdAt = rawItem.createdAt || item.createdAt;
  item.notification = normalizeCheckinNotificationConfig(rawItem.notification, {
    ...rawItem,
    startDate: item.startDate,
    repeatType: item.repeatType,
  });
  return item;
}

function hydrateCheckin(rawCheckin) {
  const checkin = new Checkin(rawCheckin.todoId, rawCheckin.message || "");
  checkin.id = rawCheckin.id || checkin.id;
  checkin.time = rawCheckin.time || checkin.time;
  return checkin;
}

// 加载数据
function loadData() {
  try {
    applyTodoWorkspaceSnapshot(readTodoWorkspaceSnapshot());
  } catch (e) {
    console.error("加载数据失败:", e);
    applyTodoWorkspaceSnapshot({});
  }
}

// 保存数据
function saveData() {
  try {
    invalidateTodoDerivedCaches();
    reminderTools?.refresh?.({
      resetWindow: true,
    });
    return queueTodoPersist();
  } catch (e) {
    console.error("保存数据失败:", e);
    return Promise.resolve(false);
  }
}

// 加载主题设置
function loadThemeSettings() {
  try {
    const savedTheme = localStorage.getItem("selectedTheme");
    if (savedTheme) {
      const root = document.documentElement;
      root.setAttribute("data-theme", savedTheme);
    }
  } catch (e) {
    console.error("加载主题设置失败:", e);
  }
}

// 初始化筛选器
function initFilters() {
  const filterSelect = document.getElementById("todo-filter-select");
  if (filterSelect) {
    filterSelect.value = currentFilter;
    uiTools?.enhanceNativeSelect?.(filterSelect, {
      fullWidth: true,
      minWidth: 0,
      preferredMenuWidth: 220,
      maxMenuWidth: 260,
      widthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
      menuWidthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
    });
    filterSelect.addEventListener("change", function () {
      currentFilter = this.value || "all";
      invalidateTodoDerivedCaches();
      renderTodoArea();
    });
  }

  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      // 更新按钮状态
      filterBtns.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      // 更新当前筛选器
      currentFilter = this.dataset.filter;
      if (filterSelect) {
        filterSelect.value = currentFilter;
        uiTools?.refreshEnhancedSelect?.(filterSelect);
      }

      // 重新渲染待办事项列表
      invalidateTodoDerivedCaches();
      renderTodoArea();
    });
  });
}

// 初始化搜索
function initSearch() {
  const searchInput = document.getElementById("todo-search");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      window.clearTimeout(todoSearchTimer);
      todoSearchTimer = window.setTimeout(() => {
        invalidateTodoDerivedCaches();
        renderTodoArea();
      }, TODO_SEARCH_DEBOUNCE_MS);
    });
  }
}

// 初始化排序
function initSort() {
  const sortSelect = document.getElementById("todo-sort");
  if (sortSelect) {
    currentSort = readPersistedTodoSortPreference();
    sortSelect.value = currentSort;
    uiTools?.enhanceNativeSelect?.(sortSelect, {
      fullWidth: true,
      minWidth: 0,
      preferredMenuWidth: 220,
      maxMenuWidth: 260,
      widthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
      menuWidthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
    });
    sortSelect.addEventListener("change", function () {
      persistTodoSortPreference(this.value, {
        persistCore: true,
      });
      sortSelect.value = currentSort;
      invalidateTodoDerivedCaches();
      renderTodoArea();
    });
  }
}

// 初始化添加按钮
function openTodoCreateFlow() {
  if (currentView === "checkins") {
    showCheckinItemModal();
    return;
  }
  if (TODO_WIDGET_CONTEXT.enabled) {
    showTodoEditModal();
    return;
  }
  showTodoTypeModal();
}

function initAddButtons() {
  const addTodoBtn = document.getElementById("add-todo-btn");
  const addFirstTodoBtn = document.getElementById("add-first-todo-btn");

  if (addTodoBtn) {
    addTodoBtn.addEventListener("click", function () {
      openTodoCreateFlow();
    });
  }

  if (addFirstTodoBtn) {
    addFirstTodoBtn.addEventListener("click", function () {
      openTodoCreateFlow();
    });
  }
}

// 渲染待办事项列表
function getFilteredSortedTodos() {
  const searchInput = document.getElementById("todo-search");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const cacheKey = [
    currentFilter,
    currentSort,
    searchTerm,
    todos.length,
    todos[0]?.updatedAt || todos[0]?.createdAt || "",
    todos[todos.length - 1]?.updatedAt || todos[todos.length - 1]?.createdAt || "",
  ].join("|");
  if (cacheKey === cachedTodoFilterKey) {
    return cachedFilteredTodos.slice();
  }

  let filteredTodos = todos.filter((todo) => {
    if (
      searchTerm &&
      !todo.title.toLowerCase().includes(searchTerm) &&
      !todo.description.toLowerCase().includes(searchTerm)
    ) {
      return false;
    }

    switch (currentFilter) {
      case "all":
        return true;
      case "pending":
        return !todo.completed;
      case "completed":
        return todo.completed;
      case "overdue":
        return !todo.completed && todo.isOverdue();
      case "today":
        return !todo.completed && todo.isDueToday();
      default:
        return true;
    }
  });

  filteredTodos.sort((a, b) => {
    switch (currentSort) {
      case "dueDate":
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      case "priority":
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      case "createdAt":
        return new Date(b.createdAt) - new Date(a.createdAt);
      case "title":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  cachedTodoFilterKey = cacheKey;
  cachedFilteredTodos = filteredTodos.slice();
  return filteredTodos;
}

function renderTodoList() {
  const container = document.getElementById("todo-list-container");
  const emptyStateTemplate = document.getElementById("empty-state-template");
  if (!container) return;
  const listScale = Math.min(
    Math.max(getTableScaleSetting("todoListView", 1, ["todoLists"]), 0.1),
    2.2,
  );
  const densityScale = getTodoListDensityScale(listScale);
  const contentWidth = getTodoListCardMaxWidth(listScale);
  container.style.fontSize = `${Math.max(10, Math.round(14 * densityScale))}px`;
  container.style.padding = `${Math.max(8, Math.round(15 * densityScale))}px`;
  const { useTwoColumnGrid } = applyTodoCollectionContainerLayout(
    container,
    densityScale,
  );
  const filteredTodos = getFilteredSortedTodos();

  // 清除容器内容
  container.innerHTML = "";

  // 如果没有待办事项，显示空状态
  if (filteredTodos.length === 0) {
    if (emptyStateTemplate instanceof HTMLTemplateElement) {
      const fragment = emptyStateTemplate.content.cloneNode(true);
      container.appendChild(fragment);
      const emptyCard = container.querySelector(".empty-state");
      applyCenteredEmptyStateLayout(emptyCard, contentWidth, {
        useTwoColumnGrid,
      });
      const createBtn = container.querySelector("#add-first-todo-btn");
      if (createBtn) {
        createBtn.addEventListener("click", openTodoCreateFlow);
      }
    } else {
      const emptyStateWidthStyle =
        Number.isFinite(contentWidth) && contentWidth > 0
          ? `max-width: ${contentWidth}px; width: 100%;`
          : "width: 100%; max-width: 100%;";
      container.innerHTML = `
        <div class="empty-state" style="${emptyStateWidthStyle}">
          <div class="empty-state-icon">📝</div>
          <h3 style="color: var(--text-color)">暂无待办事项</h3>
          <p style="color: var(--muted-text-color); margin-bottom: 20px">
            点击"添加项目"按钮开始创建
          </p>
          <button class="bts" id="add-first-todo-btn">创建第一个待办事项</button>
        </div>
      `;
      applyCenteredEmptyStateLayout(
        container.querySelector(".empty-state"),
        contentWidth,
        {
          useTwoColumnGrid,
        },
      );
      container
        .querySelector("#add-first-todo-btn")
        ?.addEventListener("click", openTodoCreateFlow);
    }
    return;
  }

  // 渲染待办事项列表
  filteredTodos.forEach((todo) => {
    const todoElement = createTodoElement(todo, listScale);
    applyTodoCollectionItemLayout(todoElement, {
      useTwoColumnGrid,
    });
    container.appendChild(todoElement);
  });
}

function renderTodoQuadrantView() {
  const container = document.getElementById("todo-quadrant-container");
  if (!container) return;

  const listScale = Math.min(
    Math.max(getTableScaleSetting("todoQuadrantView", 1, ["todoLists"]), 0.1),
    2.2,
  );
  const quadrantScale = getGeneratedItemResponsiveScale(listScale);
  container.style.fontSize = `${Math.max(10, Math.round(14 * listScale))}px`;
  container.style.padding = `${Math.max(8, Math.round(15 * listScale))}px`;
  container.style.overflow = "visible";
  container.innerHTML = "";

  const todosInScope = getFilteredSortedTodos().filter((todo) => !todo.completed);
  if (todosInScope.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">📌</div>
        <h3 style="color: var(--text-color)">当前筛选条件下暂无可分配事项</h3>
        <p style="color: var(--muted-text-color)">切换筛选器或新增待办后会自动联动到四象限。</p>
      </div>
    `;
    return;
  }

  const isUrgent = (todo) => todo.isOverdue() || todo.isDueToday();
  const isImportant = (todo) => todo.priority === "high" || todo.priority === "medium";

  const quadrants = [
    {
      key: "q1",
      title: "重要且紧急",
      description: "优先立即处理",
      border: "#f56565",
      items: [],
    },
    {
      key: "q2",
      title: "重要不紧急",
      description: "重点规划推进",
      border: "#ed8936",
      items: [],
    },
    {
      key: "q3",
      title: "紧急不重要",
      description: "尽量委托或限时处理",
      border: "#4299e1",
      items: [],
    },
    {
      key: "q4",
      title: "不紧急不重要",
      description: "批量安排低优先级",
      border: "#79af85",
      items: [],
    },
  ];
  todosInScope.forEach((todo) => {
    const important = isImportant(todo);
    const urgent = isUrgent(todo);
    if (important && urgent) {
      quadrants[0].items.push(todo);
    } else if (important) {
      quadrants[1].items.push(todo);
    } else if (urgent) {
      quadrants[2].items.push(todo);
    } else {
      quadrants[3].items.push(todo);
    }
  });

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  grid.style.gridTemplateRows = `repeat(2, minmax(${Math.max(140, Math.round(230 * quadrantScale))}px, auto))`;
  grid.style.gap = `${Math.max(6, Math.round(12 * quadrantScale))}px`;
  grid.style.gridAutoRows = `minmax(${Math.max(140, Math.round(230 * quadrantScale))}px, auto)`;
  grid.style.minWidth = "0";
  grid.style.width = "100%";
  grid.style.maxWidth = "100%";

  quadrants.forEach((quadrant) => {
    const panel = document.createElement("div");
    panel.style.backgroundColor = "var(--bg-tertiary)";
    panel.style.borderRadius = `${Math.max(9, Math.round(12 * quadrantScale))}px`;
    panel.style.padding = `${Math.max(8, Math.round(12 * quadrantScale))}px`;
    panel.style.borderTop = `${Math.max(3, Math.round(4 * quadrantScale))}px solid ${quadrant.border}`;
    panel.style.minHeight = `${Math.max(140, Math.round(230 * quadrantScale))}px`;
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:${Math.max(6, Math.round(8 * quadrantScale))}px;">
        <strong style="color: var(--text-color); font-size: ${Math.max(11, Math.round(14 * quadrantScale))}px;">${quadrant.title}</strong>
        <span style="color: var(--accent-color); font-size: ${Math.max(10, Math.round(13 * quadrantScale))}px;">${quadrant.items.length} 项</span>
      </div>
      <div style="color: var(--muted-text-color); font-size: ${Math.max(9, Math.round(12 * quadrantScale))}px; margin: ${Math.max(3, Math.round(4 * quadrantScale))}px 0 ${Math.max(7, Math.round(10 * quadrantScale))}px 0;">
        ${quadrant.description}
      </div>
    `;

    if (quadrant.items.length === 0) {
      const empty = document.createElement("div");
      empty.style.fontSize = `${Math.max(9, Math.round(12 * quadrantScale))}px`;
      empty.style.color = "var(--muted-text-color)";
      empty.style.padding = `${Math.max(6, Math.round(8 * quadrantScale))}px`;
      empty.style.backgroundColor = "var(--bg-secondary)";
      empty.style.borderRadius = `${Math.max(6, Math.round(8 * quadrantScale))}px`;
      empty.textContent = "暂无事项";
      panel.appendChild(empty);
    } else {
      quadrant.items.forEach((todo) => {
        const item = document.createElement("button");
        item.type = "button";
        item.style.width = "100%";
        item.style.textAlign = "left";
        item.style.border = "1px solid var(--bg-quaternary)";
        item.style.backgroundColor = "var(--bg-secondary)";
        item.style.color = "var(--text-color)";
        item.style.borderRadius = `${Math.max(6, Math.round(8 * quadrantScale))}px`;
        item.style.padding = `${Math.max(6, Math.round(8 * quadrantScale))}px ${Math.max(8, Math.round(10 * quadrantScale))}px`;
        item.style.marginBottom = `${Math.max(6, Math.round(8 * quadrantScale))}px`;
        item.style.cursor = "pointer";
        item.innerHTML = `
          <div style="font-size: ${Math.max(10, Math.round(13 * quadrantScale))}px; font-weight: bold; color: ${todo.color};">${escapeHtml(todo.title)}</div>
          <div style="font-size: ${Math.max(9, Math.round(12 * quadrantScale))}px; color: var(--muted-text-color); margin-top: ${Math.max(1, Math.round(2 * quadrantScale))}px;">
            ${escapeHtml(todo.getDueDateDisplay())}
          </div>
        `;
        item.addEventListener("click", () => showTodoEditModal(todo));
        panel.appendChild(item);
      });
    }

    grid.appendChild(panel);
  });

  container.appendChild(grid);
}

function renderTodoArea() {
  if (todoLayoutMode === "quadrant") {
    renderTodoQuadrantView();
  } else {
    renderTodoList();
  }
}

// 创建待办事项元素
function createTodoElement(todo, listScale = 1) {
  const todoElement = document.createElement("div");
  const cardScale = getTodoListDensityScale(listScale);
  const titleFontSize = Math.max(12, Math.round(20 * cardScale));
  const descriptionFontSize = Math.max(10, Math.round(14 * cardScale));
  const metaFontSize = Math.max(9, Math.round(12 * cardScale));
  const actionFontSize = Math.max(10, Math.round(13 * cardScale));
  const cardMaxWidth = getTodoListCardMaxWidth(listScale);
  const cardPadding = Math.max(8, Math.round(14 * cardScale));
  const cardGap = Math.max(4, Math.round(8 * cardScale));
  const progressCardWidth = Math.max(104, Math.round(176 * cardScale));
  todoElement.className = `todo-item ${todo.completed ? "completed" : ""}`;
  todoElement.dataset.todoId = todo.id;
  todoElement.style.setProperty(
    "--todo-item-accent",
    todo.color || "var(--accent-color)",
  );
  todoElement.style.padding = `${cardPadding}px`;
  todoElement.style.marginBottom = "0";
  todoElement.style.borderLeftWidth = `${Math.max(2, Math.round(4 * cardScale))}px`;
  todoElement.style.borderRadius = `${Math.max(18, Math.round(26 * cardScale))}px`;
  todoElement.style.width = "100%";
  todoElement.style.maxWidth = cardMaxWidth ? `${cardMaxWidth}px` : "100%";
  todoElement.style.alignSelf = isCompactMobileLayout() ? "stretch" : "center";
  todoElement.style.display = "flex";
  todoElement.style.flexDirection = "column";
  todoElement.style.gap = `${cardGap}px`;

  // 获取相关打卡记录
  const todoCheckins = getTodoCheckins(todo.id);
  todoCheckins.sort((left, right) => new Date(right.time) - new Date(left.time));
  const hasProgressRecords = todoCheckins.length > 0;
  const reminderSummary =
    reminderTools?.describeTodoReminder?.(todo) || "不通知";

  // 构建HTML
  todoElement.innerHTML = `
    <div class="todo-header">
      <h3 class="todo-title">${escapeHtml(todo.title)}</h3>
      <span class="todo-due-date ${todo.getDueDateClass()}">
        ${escapeHtml(todo.getDueDateDisplay())}
      </span>
    </div>
    
    <p class="todo-description">${escapeHtml(todo.description || "无描述")}</p>
    ${
      todo.repeatType && todo.repeatType !== "none"
        ? `
      <div class="todo-repeat-summary" style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 10px;">
        🔁 ${escapeHtml(todo.getRepeatSummary())} · ${escapeHtml(todo.startDate || "-")} ${todo.endDate ? `至 ${escapeHtml(todo.endDate)}` : "起"}
      </div>
    `
        : ""
    }
    ${
      todo.notification?.enabled
        ? `
      <div class="todo-reminder-summary" style="font-size: 12px; color: var(--muted-text-color); margin-top: -4px;">
        🔔 ${escapeHtml(reminderSummary)}
      </div>
    `
        : ""
    }
    
    ${
      todo.tags.length > 0
        ? `
      <div class="todo-tags">
        ${todo.tags
          .map((tag) => `<span class="todo-tag">${escapeHtml(tag)}</span>`)
          .join("")}
      </div>
    `
        : ""
    }
    
    <div class="todo-footer ${hasProgressRecords ? "has-progress-records" : "is-progress-empty"}">
      ${
        hasProgressRecords
          ? `
        <div class="todo-progress-caption">进度记录</div>
        <div class="todo-progress-bottom-row">
          <div class="checkin-records checkin-records-inline todo-progress-records-row">
            ${todoCheckins
              .map(
                (checkin) => `
              <div
                class="checkin-record todo-progress-record"
                role="button"
                tabindex="0"
                data-checkin-id="${escapeHtml(checkin.id)}"
                title="点击编辑这条进度记录：${escapeHtml(checkin.message)}"
              >
                <div class="checkin-date">${escapeHtml(checkin.getTimeDisplay())}</div>
                <div class="checkin-message">${escapeHtml(checkin.message)}</div>
              </div>
            `,
              )
              .join("")}
          </div>
          <div class="todo-action-stack">
            <button
              type="button"
              class="todo-action-btn todo-progress-btn"
              data-action="add-progress"
              title="添加进度记录"
            >
              +
            </button>
            <button type="button" class="todo-action-btn complete-btn" data-action="complete">
              ${todo.completed ? "取消完成" : "完成"}
            </button>
          </div>
        </div>
      `
          : `
        <div class="todo-progress-bottom-row">
          <div class="todo-progress-lane">
            <div class="todo-progress-caption">进度记录</div>
            <div class="todo-progress-empty">暂无进度，点右侧“＋”补一条</div>
          </div>
          <div class="todo-action-stack">
            <button
              type="button"
              class="todo-action-btn todo-progress-btn"
              data-action="add-progress"
              title="添加进度记录"
            >
              +
            </button>
            <button type="button" class="todo-action-btn complete-btn" data-action="complete">
              ${todo.completed ? "取消完成" : "完成"}
            </button>
          </div>
        </div>
      `
      }
    </div>
  `;

  const completeButton = todoElement.querySelector('[data-action="complete"]');
  const progressButton = todoElement.querySelector('[data-action="add-progress"]');
  const headerElement = todoElement.querySelector(".todo-header");
  const titleElement = todoElement.querySelector(".todo-title");
  const dueDateElement = todoElement.querySelector(".todo-due-date");
  const descriptionElement = todoElement.querySelector(".todo-description");
  const reminderSummaryElement = todoElement.querySelector(".todo-reminder-summary");
  const tagsContainerElement = todoElement.querySelector(".todo-tags");
  const tagElements = todoElement.querySelectorAll(".todo-tag");
  const footerElement = todoElement.querySelector(".todo-footer");
  const progressBottomRowElement = todoElement.querySelector(".todo-progress-bottom-row");
  const actionStackElement = todoElement.querySelector(".todo-action-stack");
  const progressLaneElement = todoElement.querySelector(".todo-progress-lane");
  const repeatSummaryElement = todoElement.querySelector(".todo-repeat-summary");
  const progressCaptionElement = todoElement.querySelector(".todo-progress-caption");
  const progressEmptyElement = todoElement.querySelector(".todo-progress-empty");
  const progressRecordsContainer = todoElement.querySelector(".todo-progress-records-row");
  const progressRecords = todoElement.querySelectorAll(".todo-progress-record");
  const progressDateElements = todoElement.querySelectorAll(".checkin-date");
  const progressMessageElements = todoElement.querySelectorAll(".checkin-message");
  const shouldStackEmptyProgress = !hasProgressRecords && isCompactMobileLayout();

  if (headerElement) {
    headerElement.style.gap = `${Math.max(6, Math.round(10 * cardScale))}px`;
  }
  if (titleElement) {
    titleElement.style.fontSize = `${titleFontSize}px`;
  }
  if (dueDateElement) {
    dueDateElement.style.fontSize = `${Math.max(10, Math.round(14 * cardScale))}px`;
    dueDateElement.style.padding = `${Math.max(3, Math.round(4 * cardScale))}px ${Math.max(8, Math.round(10 * cardScale))}px`;
    dueDateElement.style.borderRadius = `${Math.max(10, Math.round(14 * cardScale))}px`;
  }
  if (descriptionElement) {
    descriptionElement.style.fontSize = `${descriptionFontSize}px`;
    descriptionElement.style.marginBottom = "0";
    descriptionElement.style.webkitLineClamp = isCompactMobileLayout() ? "1" : "2";
  }
  if (repeatSummaryElement) {
    repeatSummaryElement.style.fontSize = `${metaFontSize}px`;
    repeatSummaryElement.style.marginBottom = "0";
  }
  if (reminderSummaryElement) {
    reminderSummaryElement.style.fontSize = `${metaFontSize}px`;
    reminderSummaryElement.style.marginTop = "0";
  }
  if (tagsContainerElement) {
    tagsContainerElement.style.gap = `${Math.max(4, Math.round(8 * cardScale))}px`;
  }
  if (progressCaptionElement) {
    progressCaptionElement.style.fontSize = `${Math.max(9, Math.round(11 * cardScale))}px`;
    progressCaptionElement.style.lineHeight = "1.15";
    progressCaptionElement.style.whiteSpace = "nowrap";
  }
  if (progressEmptyElement) {
    progressEmptyElement.style.fontSize = `${metaFontSize}px`;
    progressEmptyElement.style.lineHeight = "1.25";
    progressEmptyElement.style.display = "block";
    progressEmptyElement.style.width = "100%";
  }
  if (footerElement) {
    footerElement.style.display = "flex";
    footerElement.style.flexDirection = "column";
    footerElement.style.alignItems = "stretch";
    footerElement.style.gap = `${Math.max(3, Math.round(5 * cardScale))}px`;
    footerElement.style.minWidth = "0";
  }
  if (progressBottomRowElement) {
    progressBottomRowElement.style.display = "flex";
    progressBottomRowElement.style.flexWrap = shouldStackEmptyProgress ? "wrap" : "nowrap";
    progressBottomRowElement.style.alignItems = shouldStackEmptyProgress
      ? "stretch"
      : hasProgressRecords
        ? "flex-end"
        : "center";
    progressBottomRowElement.style.justifyContent = "space-between";
    progressBottomRowElement.style.gap = `${Math.max(8, Math.round(10 * cardScale))}px`;
    progressBottomRowElement.style.minWidth = "0";
  }
  if (progressLaneElement) {
    progressLaneElement.style.display = "flex";
    progressLaneElement.style.flexDirection = "column";
    progressLaneElement.style.gap = `${Math.max(1, Math.round(2 * cardScale))}px`;
    progressLaneElement.style.flex = shouldStackEmptyProgress ? "1 1 100%" : "1 1 auto";
    progressLaneElement.style.width = shouldStackEmptyProgress ? "100%" : "";
    progressLaneElement.style.minWidth = "0";
  }
  if (actionStackElement) {
    actionStackElement.style.gap = `${Math.max(6, Math.round(8 * cardScale))}px`;
    actionStackElement.style.marginLeft = shouldStackEmptyProgress ? "0" : "auto";
    actionStackElement.style.flex = shouldStackEmptyProgress ? "1 1 100%" : "0 0 auto";
    actionStackElement.style.width = shouldStackEmptyProgress ? "100%" : "";
    actionStackElement.style.flexWrap = "nowrap";
    actionStackElement.style.alignItems = "center";
    actionStackElement.style.justifyContent = "flex-end";
    actionStackElement.style.alignSelf = shouldStackEmptyProgress
      ? "stretch"
      : hasProgressRecords
        ? "flex-end"
        : "center";
  }
  if (progressRecordsContainer) {
    progressRecordsContainer.style.gap = `${Math.max(4, Math.round(6 * cardScale))}px`;
    progressRecordsContainer.style.flex = "1 1 auto";
    progressRecordsContainer.style.minWidth = "0";
    progressRecordsContainer.style.paddingBottom = "0";
    progressRecordsContainer.style.alignItems = "stretch";
  }
  tagElements.forEach((tagElement) => {
    tagElement.style.fontSize = `${metaFontSize}px`;
    tagElement.style.padding = `${Math.max(3, Math.round(4 * cardScale))}px ${Math.max(7, Math.round(9 * cardScale))}px`;
    tagElement.style.borderRadius = `${Math.max(10, Math.round(14 * cardScale))}px`;
  });
  if (completeButton) {
    completeButton.style.fontSize = `${actionFontSize}px`;
    completeButton.style.padding = `${Math.max(4, Math.round(6 * cardScale))}px ${Math.max(10, Math.round(13 * cardScale))}px`;
    completeButton.style.whiteSpace = "nowrap";
    completeButton.style.flexShrink = "0";
    completeButton.disabled = false;
    completeButton.textContent = todo.completed ? "取消完成" : "完成";
    completeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTodoCompletion(todo.id);
    });
  }
  if (progressButton) {
    progressButton.style.fontSize = `${Math.max(actionFontSize + 2, Math.round(16 * cardScale))}px`;
    progressButton.style.width = `${Math.max(28, Math.round(34 * cardScale))}px`;
    progressButton.style.height = `${Math.max(28, Math.round(34 * cardScale))}px`;
    progressButton.style.padding = "0";
    progressButton.style.display = "inline-flex";
    progressButton.style.alignItems = "center";
    progressButton.style.justifyContent = "center";
    progressButton.style.lineHeight = "1";
    progressButton.style.textAlign = "center";
    progressButton.style.flexShrink = "0";
    progressButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showCheckinModal(todo.id);
    });
  }
  progressRecords.forEach((recordElement) => {
    recordElement.style.padding = `${Math.max(4, Math.round(6 * cardScale))}px ${Math.max(8, Math.round(10 * cardScale))}px`;
    recordElement.style.marginTop = "0";
    recordElement.style.minWidth = `${progressCardWidth}px`;
    recordElement.style.maxWidth = `${Math.max(progressCardWidth, Math.round(214 * cardScale))}px`;
    recordElement.style.borderRadius = `${Math.max(12, Math.round(18 * cardScale))}px`;
    const openProgressEditor = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const checkinId = recordElement.dataset.checkinId || "";
      if (!checkinId) return;
      showCheckinModal(todo.id, checkinId);
    };
    recordElement.addEventListener("click", openProgressEditor);
    recordElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      openProgressEditor(event);
    });
  });
  progressDateElements.forEach((dateElement) => {
    dateElement.style.fontSize = `${Math.max(8, Math.round(11 * cardScale))}px`;
  });
  progressMessageElements.forEach((messageElement) => {
    messageElement.style.fontSize = `${Math.max(9, Math.round(12 * cardScale))}px`;
  });

  todoElement.addEventListener("click", (event) => {
    const actionButton =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (actionButton?.dataset.action === "complete") {
      event.preventDefault();
      event.stopPropagation();
      toggleTodoCompletion(todo.id);
      return;
    }
    if (actionButton?.dataset.action === "add-progress") {
      event.preventDefault();
      event.stopPropagation();
      showCheckinModal(todo.id);
      return;
    }

    showTodoEditModal(todo);
  });

  return wrapTodoSwipeDeleteCard(todoElement, {
    kind: "todo",
    itemId: todo.id,
    onDelete: () => confirmTodoSwipeDelete("todo", todo.id),
  });
}

// 切换待办事项完成状态
function toggleTodoCompletion(todoId) {
  const todo = todos.find((t) => matchesId(t.id, todoId));
  if (!todo) {
    return false;
  }
  const previousSnapshot = captureTodoWorkspaceSnapshot();
  todo.completed = !todo.completed;
  todo.completedAt = todo.completed ? new Date().toISOString() : null;
  uiTools?.markPerfStage?.("todo-action-ui-committed", {
    allowRepeat: true,
    action: "toggle-todo-completion",
    todoId: todo.id,
  });
  scheduleTodoInterfaceRefresh();
  scheduleTodoToggleCommit(
    "todo",
    todo.id,
    () => ({
      save: () =>
        queueTodoCoreSave(
          {
            todos: getTodoSectionStateSnapshot("todos"),
          },
          {
            reason: "todo-toggle-completion",
            errorLabel: "保存待办完成状态失败:",
            refreshReminders: true,
          },
        ),
      onSuccess: () => {
        clearTodoPersistenceError();
        uiTools?.markPerfStage?.("todo-action-storage-acked", {
          allowRepeat: true,
          action: "toggle-todo-completion",
          todoId: todo.id,
        });
        scheduleTodoInterfaceRefresh();
      },
      onFailure: async (rollbackSnapshot) => {
        handleTodoNonBlockingSaveFailure("保存待办完成状态失败。", {
          message: "待办完成状态同步失败，已尝试恢复当前数据。",
          rollbackSnapshot: rollbackSnapshot || previousSnapshot,
        });
      },
    }),
    previousSnapshot,
  );
  return true;
}

// 删除待办事项
function deleteTodo(todoId, options = {}) {
  const {
    confirmDelete = true,
    refreshView = true,
    closeModal = null,
  } = options;
  if (
    confirmDelete &&
    !confirm("确定要删除这个待办事项吗？此操作不可撤销！")
  ) {
    return false;
  }

  const previousTodos = getTodoSectionStateSnapshot("todos");
  const previousCheckins = getTodoSectionStateSnapshot("checkins");

  // 删除待办事项
  const index = todos.findIndex((t) => matchesId(t.id, todoId));
  if (index !== -1) {
    todos.splice(index, 1);
  } else {
    alert("删除失败：未找到该待办事项，请刷新后重试。");
    return false;
  }

  // 删除相关打卡记录
  const removedCheckins = checkins.filter((checkin) =>
    matchesId(checkin.todoId, todoId),
  );
  checkins = checkins.filter((checkin) => !matchesId(checkin.todoId, todoId));

  if (typeof closeModal === "function") {
    closeModal();
  }
  if (refreshView) {
    scheduleTodoInterfaceRefresh();
  }
  void Promise.all([
    queueTodoCoreSave(
      {
        todos: getTodoSectionStateSnapshot("todos"),
      },
      {
        reason: "todo-delete",
        errorLabel: "删除待办后保存列表失败:",
        refreshReminders: true,
      },
    ),
    queueTodoSectionSave("checkins", {
      previousItems: removedCheckins,
      errorLabel: "删除待办后保存进度记录失败:",
    }),
  ]).then(async ([todoSaved, checkinsSaved]) => {
    if (todoSaved && checkinsSaved) {
      return;
    }
    await rollbackTodoOptimisticChange(
      {
        todos: previousTodos,
        checkins: previousCheckins,
      },
      {
        title: "删除失败",
        message: "删除待办事项失败，本次修改已撤销。",
        refreshView,
      },
    );
  });
  return true;
}

// 显示待办事项编辑弹窗
function showTodoEditModal(todo = null) {
  const isEditMode = !!todo;
  const todoWeekdays = Array.isArray(todo?.repeatWeekdays)
    ? todo.repeatWeekdays
    : [];

  // 创建弹窗
  const modal = document.createElement("div");
  modal.className = "modal-overlay controler-form-modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2000";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "var(--overlay-bg)";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  // 构建弹窗内容
  modal.innerHTML = `
    <div class="modal-content ms controler-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${isEditMode ? "编辑待办事项" : "创建待办事项"}
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
        <!-- 标题 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            标题 *
          </label>
          <input type="text" id="todo-title-input" value="${todo?.title || ""}" placeholder="输入待办事项标题" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 描述 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            描述
          </label>
          <textarea id="todo-description-input" placeholder="输入待办事项描述（可选）" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
            min-height: 80px;
            resize: vertical;
          ">${todo?.description || ""}</textarea>
        </div>
        
        <!-- 截止日期 -->
        <div id="todo-due-date-field">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            截止日期
          </label>
          <input type="date" id="todo-due-date-input" value="${todo?.dueDate || ""}" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>

        <!-- 重复规则 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            重复规则
          </label>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="todo-repeat-type" value="none" ${!todo?.repeatType || todo?.repeatType === "none" ? "checked" : ""}>
              不重复
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="todo-repeat-type" value="daily" ${todo?.repeatType === "daily" ? "checked" : ""}>
              每天重复
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="todo-repeat-type" value="weekly" ${todo?.repeatType === "weekly" ? "checked" : ""}>
              每周指定天
            </label>
          </div>
          <div id="todo-weekday-wrap" style="
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            background-color: var(--bg-tertiary);
            display: ${todo?.repeatType === "weekly" ? "block" : "none"};
          ">
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${[
                ["1", "周一"],
                ["2", "周二"],
                ["3", "周三"],
                ["4", "周四"],
                ["5", "周五"],
                ["6", "周六"],
                ["0", "周日"],
              ]
                .map(
                  ([value, label]) => `
                <label style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-color); font-size: 13px;">
                  <input type="checkbox" name="todo-repeat-weekday" value="${value}" ${todoWeekdays.includes(parseInt(value, 10)) ? "checked" : ""}>
                  ${label}
                </label>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>

        <!-- 起止日期 -->
        <div
          id="todo-repeat-date-range"
          class="modal-date-range controler-form-modal-date-range"
          style="opacity: ${todo?.repeatType && todo.repeatType !== "none" ? "1" : "0.6"};"
        >
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始日期
            </label>
            <input type="date" id="todo-start-date-input" class="modal-date-input" value="${todo?.startDate || todo?.dueDate || getLocalDateText()}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 14px;
            ">
          </div>
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              结束日期（可选）
            </label>
            <input type="date" id="todo-end-date-input" class="modal-date-input" value="${todo?.endDate || ""}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 14px;
            ">
          </div>
        </div>
        <div
          style="margin-top: -8px; color: var(--muted-text-color); font-size: 12px;"
        >
          “开始日期 - 结束日期”仅在启用重复时生效，不能与“截止日期”同时设置。
        </div>

        ${getTodoReminderSectionHtml(todo, "todo")}
        
        <!-- 优先级 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            优先级
          </label>
          <div style="display: flex; gap: 10px;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="todo-priority" value="low" ${!todo?.priority || todo?.priority === "low" ? "checked" : ""}>
              <span style="color: #79af85; font-size: 14px;">低</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="todo-priority" value="medium" ${todo?.priority === "medium" ? "checked" : ""}>
              <span style="color: #ed8936; font-size: 14px;">中</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="todo-priority" value="high" ${todo?.priority === "high" ? "checked" : ""}>
              <span style="color: #f56565; font-size: 14px;">高</span>
            </label>
          </div>
        </div>
        
        <!-- 标签 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            标签（用逗号分隔）
          </label>
          <input type="text" id="todo-tags-input" value="${todo?.tags?.join(", ") || ""}" placeholder="例如：工作, 紧急, 项目" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 完成状态（仅编辑模式） -->
        ${
          isEditMode
            ? `
          <div>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 10px; font-size: 14px;">
              <input type="checkbox" id="todo-completed-checkbox" ${todo?.completed ? "checked" : ""}>
              <span>标记为已完成</span>
            </label>
          </div>
        `
            : ""
        }
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer" style="display: flex; justify-content: space-between; margin-top: 25px;">
        ${
          isEditMode
            ? `
          <button class="bts" type="button" id="delete-todo-btn" data-todo-modal-action="delete-todo" style="background-color: var(--delete-btn);">
            删除待办事项
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-todo-btn" data-todo-modal-action="cancel">取消</button>
          <button class="bts" type="button" id="save-todo-btn" data-todo-modal-action="save">${isEditMode ? "保存更改" : "创建待办事项"}</button>
        </div>
      </div>
    </div>
  `;

  appendTodoManagedModal(modal, "todo-edit");
  uiTools?.stopModalContentPropagation?.(modal);

  let unbindModalActions = () => {};
  const todoDraftSession = createTodoModalDraftSession(
    modal,
    `draft:todo:${todo?.id || "new"}:${isEditMode ? "edit" : "create"}`,
    "todo",
  );
  void todoDraftSession.restore().catch((error) => {
    console.error("恢复待办草稿失败:", error);
  });
  const closeTodoModal = () => {
    todoDraftSession.destroy();
    unbindModalActions();
    closeModalElement(modal);
  };

  const repeatRadios = modal.querySelectorAll('input[name="todo-repeat-type"]');
  const weekdayWrap = modal.querySelector("#todo-weekday-wrap");
  const dueDateField = modal.querySelector("#todo-due-date-field");
  const dueDateInput = modal.querySelector("#todo-due-date-input");
  const repeatDateRange = modal.querySelector("#todo-repeat-date-range");
  const startDateInput = modal.querySelector("#todo-start-date-input");
  const endDateInput = modal.querySelector("#todo-end-date-input");
  const syncTodoScheduleInputs = () => {
    const activeRepeatType =
      modal.querySelector('input[name="todo-repeat-type"]:checked')?.value ||
      "none";
    const repeatEnabled = activeRepeatType !== "none";
    if (weekdayWrap) {
      weekdayWrap.style.display = activeRepeatType === "weekly" ? "block" : "none";
    }
    if (repeatDateRange) {
      repeatDateRange.style.opacity = repeatEnabled ? "1" : "0.6";
    }
    if (dueDateField) {
      dueDateField.style.opacity = repeatEnabled ? "0.6" : "1";
    }
    if (dueDateInput) {
      dueDateInput.disabled = repeatEnabled;
      if (repeatEnabled) {
        dueDateInput.value = "";
      }
    }
    [startDateInput, endDateInput].forEach((input) => {
      if (input) {
        input.disabled = !repeatEnabled;
      }
    });
  };
  repeatRadios.forEach((radio) => {
    radio.addEventListener("change", syncTodoScheduleInputs);
  });
  syncTodoScheduleInputs();
  bindTodoReminderInputs(modal, "todo");
  bindTodoReminderBaseDateSync(modal, "todo");
  unbindModalActions = bindTodoModalActions(modal, {
    cancel: closeTodoModal,
    save: createTodoModalLockedAction(modal, () =>
      saveTodo(modal, isEditMode, todo, {
        draftSession: todoDraftSession,
        closeModal: closeTodoModal,
      }),
    ),
    "delete-todo": createTodoModalLockedAction(modal, async () => {
      if (!isEditMode || !todo) {
        return false;
      }
      const confirmed = await requestTodoConfirmation(
        "确定要删除这个待办事项吗？此操作不可撤销！",
        {
          title: "删除待办事项",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) {
        return false;
      }
      await todoDraftSession.clear().catch((error) => {
        console.error("清理待办草稿失败:", error);
      });
      return deleteTodo(todo.id, {
        confirmDelete: false,
        closeModal: closeTodoModal,
      });
    }),
  });

  // 点击外部关闭
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      closeTodoModal();
    }
  });
}

// 保存待办事项
async function saveTodo(modal, isEditMode, todoData, options = {}) {
  const {
    closeModal = () => closeModalElement(modal),
    refreshView = true,
    draftSession = null,
  } =
    options;
  const title = modal.querySelector("#todo-title-input").value.trim();
  const description = modal
    .querySelector("#todo-description-input")
    .value.trim();
  const dueDate = modal.querySelector("#todo-due-date-input").value;
  const repeatType =
    modal.querySelector('input[name="todo-repeat-type"]:checked')?.value ||
    "none";
  const repeatWeekdays = Array.from(
    modal.querySelectorAll('input[name="todo-repeat-weekday"]:checked'),
  ).map((input) => parseInt(input.value, 10));
  const rawStartDate =
    modal.querySelector("#todo-start-date-input")?.value ||
    dueDate ||
    getLocalDateText();
  const rawEndDate = modal.querySelector("#todo-end-date-input")?.value || "";
  const priority = modal.querySelector(
    'input[name="todo-priority"]:checked',
  ).value;
  const tagsInput = modal.querySelector("#todo-tags-input").value.trim();
  const tags = tagsInput
    ? tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag)
    : [];

  // 验证输入
  if (!title) {
    alert("请输入待办事项标题");
    return false;
  }

  const normalizedSchedule = normalizeTodoScheduleFields({
    dueDate,
    repeatType,
    repeatWeekdays,
    startDate: rawStartDate,
    endDate: rawEndDate,
  });
  const reminderConfig = readTodoReminderConfig(
    modal,
    {
      ...todoData,
      dueDate: normalizedSchedule.dueDate,
      startDate: normalizedSchedule.startDate,
      repeatType: normalizedSchedule.repeatType,
      _occurrenceDate:
        normalizedSchedule.repeatType === "none"
          ? normalizedSchedule.dueDate
          : normalizedSchedule.startDate,
    },
    "todo",
  );

  if (
    normalizedSchedule.repeatType === "weekly" &&
    normalizedSchedule.repeatWeekdays.length === 0
  ) {
    alert("请选择每周重复的日期");
    return false;
  }

  if (
    normalizedSchedule.repeatType !== "none" &&
    normalizedSchedule.endDate &&
    normalizedSchedule.startDate &&
    normalizedSchedule.endDate < normalizedSchedule.startDate
  ) {
    alert("结束日期不能早于开始日期");
    return false;
  }

  const previousTodos = getTodoSectionStateSnapshot("todos");
  if (isEditMode && todoData) {
    // 更新现有待办事项
    const index = todos.findIndex((t) => matchesId(t.id, todoData.id));
    if (index === -1) {
      alert("保存失败：未找到该待办事项，请刷新后重试。");
      return false;
    }
    const isCompleted =
      modal.querySelector("#todo-completed-checkbox")?.checked || false;

    todos[index] = hydrateTodo({
      ...todos[index],
      title,
      description,
      dueDate: normalizedSchedule.dueDate,
      priority,
      tags,
      repeatType: normalizedSchedule.repeatType,
      repeatWeekdays: normalizedSchedule.repeatWeekdays,
      startDate: normalizedSchedule.startDate,
      endDate: normalizedSchedule.endDate,
      notification: reminderConfig,
      completed: isCompleted,
      completedAt: isCompleted
        ? todos[index].completedAt || new Date().toISOString()
        : null,
      color:
        priority === "high"
          ? "#f56565"
          : priority === "medium"
            ? "#ed8936"
            : "#79af85",
    });
  } else {
    // 创建新待办事项
    const newTodo = new Todo(
      title,
      description,
      normalizedSchedule.dueDate,
      priority,
      tags,
      null,
      normalizedSchedule.repeatType,
      normalizedSchedule.repeatWeekdays,
      normalizedSchedule.startDate,
      normalizedSchedule.endDate,
      reminderConfig,
    );
    todos.push(newTodo);
  }

  if (draftSession && typeof draftSession.clear === "function") {
    await draftSession.clear().catch((error) => {
      console.error("清理待办草稿失败:", error);
    });
  }
  finalizeTodoModalChange(closeModal, { refreshView });

  void queueTodoCoreSave(
    {
      todos: getTodoSectionStateSnapshot("todos"),
    },
    {
      reason: isEditMode ? "todo-edit" : "todo-create",
      errorLabel: "保存待办事项失败:",
      refreshReminders: true,
    },
  ).then(async (saved) => {
    if (!saved) {
      await rollbackTodoOptimisticChange(
        {
          todos: previousTodos,
        },
        {
          message: "保存待办事项失败，本次修改已撤销。",
          refreshView,
        },
      );
      return;
    }
    try {
      await reminderTools?.requestPermissionIfNeeded?.("待办", reminderConfig, {
        silentWhenDisabled: false,
      });
    } catch (error) {
      console.error("请求待办提醒权限失败:", error);
    }
  });
  return true;
}

function showCheckinModal(todoId, checkinId = null) {
  const todo = todos.find((item) => matchesId(item.id, todoId));
  if (!todo) return;

  const existingRecord = checkinId ? getTodoCheckinById(checkinId) : null;
  const isEditMode =
    !!existingRecord && matchesId(existingRecord.todoId, todoId);

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2000";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "var(--overlay-bg)";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 25px; border-radius: 15px; max-width: 420px; width: 90%;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${isEditMode ? `📝 编辑"${escapeHtml(todo.title)}"的进度` : `📝 为"${escapeHtml(todo.title)}"添加进度`}
      </h2>
      
      <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 25px;">
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            进度内容
          </label>
          <textarea id="checkin-message-input" placeholder="记录你的进度或想法..." style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 15px;
            min-height: 120px;
            resize: vertical;
          ">${escapeHtml(existingRecord?.message || "")}</textarea>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; gap: 10px;">
        ${
          isEditMode
            ? '<button class="bts" type="button" id="delete-checkin-progress-btn" data-todo-modal-action="delete-progress" style="margin:0; background-color: var(--delete-btn);">删除</button>'
            : "<span></span>"
        }
        <div style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-checkin-btn" data-todo-modal-action="cancel" style="margin:0;">收起</button>
          <button class="bts" type="button" id="save-checkin-btn" data-todo-modal-action="save" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

  appendTodoManagedModal(modal, "todo-progress");
  uiTools?.stopModalContentPropagation?.(modal);

  let unbindModalActions = () => {};
  const progressDraftSession = createTodoModalDraftSession(
    modal,
    `draft:todo-progress:${todoId}:${existingRecord?.id || "new"}`,
    "todo-progress",
  );
  void progressDraftSession.restore().catch((error) => {
    console.error("恢复进度草稿失败:", error);
  });
  const closeModal = () => {
    progressDraftSession.destroy();
    unbindModalActions();
    closeModalElement(modal);
  };

  const saveAction = async () => {
    const message = modal.querySelector("#checkin-message-input").value.trim();
    if (!message) {
      alert("请输入进度内容");
      return false;
    }

    const previousCheckins = getTodoSectionStateSnapshot("checkins");
    const saved = saveTodoProgressRecord(
      todoId,
      message,
      existingRecord?.id || null,
    );
    if (!saved) {
      alert("保存失败，请刷新后重试");
      return false;
    }

    const targetCheckin = existingRecord?.id
      ? getTodoCheckinById(existingRecord.id)
      : checkins[checkins.length - 1] || null;
    await progressDraftSession.clear().catch((error) => {
      console.error("清理进度草稿失败:", error);
    });
    finalizeTodoModalChange(closeModal);
    void queueTodoSectionSave("checkins", {
      periodIds: [getTodoSectionPeriodId("checkins", targetCheckin)],
      errorLabel: "保存进度记录失败:",
    }).then(async (persisted) => {
      if (persisted) {
        return;
      }
      await rollbackTodoOptimisticChange(
        {
          checkins: previousCheckins,
        },
        {
          message: "保存进度记录失败，本次修改已撤销。",
        },
      );
    });
    return true;
  };

  const deleteAction = async () => {
    if (!existingRecord) return false;
    const confirmed = await requestTodoConfirmation("确定删除这条进度记录吗？", {
      title: "删除进度记录",
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) return false;
    const previousCheckins = getTodoSectionStateSnapshot("checkins");
    const deleted = deleteTodoProgressRecord(existingRecord.id);
    if (!deleted) {
      await showTodoAlert("删除失败，请刷新后重试", {
        title: "删除失败",
        danger: true,
      });
      return false;
    }
    await progressDraftSession.clear().catch((error) => {
      console.error("清理进度草稿失败:", error);
    });
    finalizeTodoModalChange(closeModal);
    void queueTodoSectionSave("checkins", {
      previousItems: [existingRecord],
      periodIds: [getTodoSectionPeriodId("checkins", existingRecord)],
      errorLabel: "删除进度记录失败:",
    }).then(async (persisted) => {
      if (persisted) {
        return;
      }
      await rollbackTodoOptimisticChange(
        {
          checkins: previousCheckins,
        },
        {
          title: "删除失败",
          message: "删除进度记录失败，本次修改已撤销。",
        },
      );
    });
    return true;
  };

  unbindModalActions = bindTodoModalActions(modal, {
    cancel: closeModal,
    save: createTodoModalLockedAction(modal, saveAction),
    "delete-progress": createTodoModalLockedAction(modal, deleteAction),
  });

  modal.addEventListener("click", function (event) {
    if (event.target === this) {
      closeModal();
    }
  });
}

// 更新统计信息
function updateStats() {
  const totalTodos = document.getElementById("total-todos");
  const pendingTodos = document.getElementById("pending-todos");
  const completedTodos = document.getElementById("completed-todos");
  const todayTodos = document.getElementById("today-todos");

  if (!totalTodos || !pendingTodos || !completedTodos || !todayTodos) return;

  const summary = todos.reduce(
    (result, todo) => {
      result.total += 1;
      if (todo.completed) {
        result.completed += 1;
      } else {
        result.pending += 1;
        if (todo.isDueToday()) {
          result.today += 1;
        }
      }
      return result;
    },
    {
      total: 0,
      pending: 0,
      completed: 0,
      today: 0,
    },
  );

  totalTodos.textContent = summary.total;
  pendingTodos.textContent = summary.pending;
  completedTodos.textContent = summary.completed;
  todayTodos.textContent = summary.today;
  updateStatsPanel();
}

function updateCheckinStats() {
  const todayCountElement = document.getElementById("today-checkin-count");
  const totalCountElement = document.getElementById("total-checkin-count");
  const maxStreakElement = document.getElementById("max-streak-days");
  if (!todayCountElement || !totalCountElement || !maxStreakElement) return;

  const today = getLocalDateText();
  const scheduledItems = checkinItems.filter((item) =>
    typeof item.isScheduledOn === "function" ? item.isScheduledOn(today) : true,
  );
  const scheduledIds = new Set(scheduledItems.map((item) => item.id));
  const checkedToday = dailyCheckins.filter(
    (entry) => entry.date === today && entry.checked && scheduledIds.has(entry.itemId),
  );

  todayCountElement.textContent = String(checkedToday.length);
  totalCountElement.textContent = String(scheduledItems.length);

  const maxStreak = checkinItems.reduce((max, item) => {
    const streak =
      typeof item.getStreakDays === "function" ? item.getStreakDays() : 0;
    return Math.max(max, streak);
  }, 0);
  maxStreakElement.textContent = String(maxStreak);

  const panelTotal = document.getElementById("checkin-stat-total-items");
  const panelScheduled = document.getElementById("checkin-stat-today-scheduled");
  const panelDone = document.getElementById("checkin-stat-today-done");
  const panelStreak = document.getElementById("checkin-stat-max-streak");
  if (panelTotal) panelTotal.textContent = String(checkinItems.length);
  if (panelScheduled) panelScheduled.textContent = String(scheduledItems.length);
  if (panelDone) panelDone.textContent = String(checkedToday.length);
  if (panelStreak) panelStreak.textContent = String(maxStreak);
}

function updateStatsPanel() {
  const title = document.getElementById("stats-panel-title");
  const todoPanel = document.getElementById("todo-stats-panel");
  const checkinPanel = document.getElementById("checkin-stats-panel");
  if (!title || !todoPanel || !checkinPanel) return;

  if (currentView === "checkins") {
    title.textContent = "打卡统计";
    todoPanel.style.display = "none";
    checkinPanel.style.display = "grid";
  } else {
    title.textContent = "待办事项统计";
    todoPanel.style.display = "grid";
    checkinPanel.style.display = "none";
  }
}

function createDemoCheckinItems() {
  const today = new Date();
  const todayText = getDateText(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const mondayText = getDateText(monday);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const demoItems = [
    new CheckinItem(
      "晨间拉伸",
      "每天 10 分钟唤醒身体",
      "#48bb78",
      "daily",
      [],
      todayText,
      "",
    ),
    new CheckinItem(
      "英语口语",
      "每周一三五练习 20 分钟",
      "#4299e1",
      "weekly",
      [1, 3, 5],
      mondayText,
      getDateText(monthEnd),
    ),
  ];

  checkinItems = demoItems;

  dailyCheckins = [];
  for (let offset = 0; offset < 10; offset++) {
    const cursor = new Date(today);
    cursor.setDate(today.getDate() - offset);
    const cursorText = getDateText(cursor);

    demoItems.forEach((item, index) => {
      const scheduled = item.isScheduledOn(cursorText);
      if (!scheduled) return;

      const shouldCheck =
        index === 0
          ? offset !== 2 // 每天打卡，故意漏一天
          : offset % 2 === 0; // 每周项隔次打卡
      if (!shouldCheck) return;

      dailyCheckins.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        itemId: item.id,
        date: cursorText,
        checked: true,
        time: new Date(cursor.getTime() + 9 * 3600 * 1000).toISOString(),
      });
    });
  }
}

function clearDemoCheckinData() {
  checkinItems = [];
  dailyCheckins = [];
  saveData();
  renderCheckinList();
  updateCheckinStats();
  updateStatsPanel();
}

// 创建测试待办事项
function createTestTodos() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  // 创建测试待办事项
  const testTodos = [
    new Todo(
      "完成项目报告",
      "撰写项目总结报告，包括成果和遇到的问题",
      today.toISOString().split("T")[0],
      "high",
      ["工作", "报告", "项目"],
    ),
    new Todo(
      "学习React Hooks",
      "深入学习useState, useEffect, useContext等Hook",
      tomorrow.toISOString().split("T")[0],
      "medium",
      ["学习", "编程", "React"],
      null,
      "weekly",
      [1, 3, 5],
      today.toISOString().split("T")[0],
      nextWeek.toISOString().split("T")[0],
    ),
    new Todo(
      "健身锻炼",
      "完成今日的健身计划，包括有氧和力量训练",
      today.toISOString().split("T")[0],
      "low",
      ["健康", "健身", "日常"],
    ),
    new Todo(
      "团队会议准备",
      "准备下周一团队会议的演示材料",
      nextWeek.toISOString().split("T")[0],
      "medium",
      ["工作", "会议", "演示"],
    ),
    new Todo(
      "阅读技术文章",
      "阅读最新的前端技术文章，了解行业动态",
      null,
      "low",
      ["学习", "阅读", "技术"],
    ),
  ];

  // 标记一个为已完成
  testTodos[0].completed = true;
  testTodos[0].completedAt = new Date().toISOString();

  // 创建一些测试打卡记录
  const testCheckins = [
    new Checkin(testTodos[0].id, "已完成项目报告的初稿，等待评审"),
    new Checkin(testTodos[0].id, "报告已根据反馈进行修改"),
    new Checkin(testTodos[1].id, "学习了useState和useEffect的基本用法"),
  ];

  // 设置数据
  todos = testTodos;
  checkins = testCheckins;
  createDemoCheckinItems();

  // 保存数据
  saveData();

  console.log("测试待办事项数据创建成功，共", todos.length, "个待办事项");
}

// 显示类型选择弹窗
function showTodoTypeModal() {
  const modal = document.createElement("div");
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  let nextModalQueued = false;
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2000";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "var(--overlay-bg)";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 25px; border-radius: 15px; max-width: 400px; width: 90%;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        创建项目类型
      </h2>
      
      <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 25px;">
        <button class="bts" id="create-todo-btn" style="text-align: left; padding: 15px; font-size: 16px;">
          📝 普通待办事项
          <div style="font-size: 14px; color: var(--muted-text-color); margin-top: 5px;">
            有截止日期、优先级、标签的待办事项
          </div>
        </button>
        
        <button class="bts" id="create-checkin-btn" style="text-align: left; padding: 15px; font-size: 16px;">
          ✅ 打卡项目
          <div style="font-size: 14px; color: var(--muted-text-color); margin-top: 5px;">
            每日打卡，记录连续打卡天数
          </div>
        </button>
      </div>
      
      <div style="display: flex; justify-content: flex-end;">
        <button class="bts" id="cancel-type-btn">取消</button>
      </div>
    </div>
  `;

  appendTodoManagedModal(modal, "todo-type");
  uiTools?.stopModalContentPropagation?.(modal);
  const closeThenOpen = (openNext) => {
    if (nextModalQueued || typeof openNext !== "function") {
      return;
    }
    nextModalQueued = true;
    closeModalElement(modal);
    schedule(() => {
      nextModalQueued = false;
      openNext();
    });
  };

  // 绑定事件
  modal.querySelector("#cancel-type-btn").addEventListener("click", () => {
    closeModalElement(modal);
  });

  modal.querySelector("#create-todo-btn").addEventListener("click", () => {
    closeThenOpen(() => {
      showTodoEditModal();
    });
  });

  modal.querySelector("#create-checkin-btn").addEventListener("click", () => {
    closeThenOpen(() => {
      showCheckinItemModal();
    });
  });

  // 点击外部关闭
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      closeModalElement(modal);
    }
  });
}

// 显示打卡项目创建弹窗
function showCheckinItemModal(item = null) {
  const isEditMode = !!item;
  const weekDays = Array.isArray(item?.repeatWeekdays)
    ? item.repeatWeekdays
    : [];

  const modal = document.createElement("div");
  modal.className = "modal-overlay controler-form-modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2000";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "var(--overlay-bg)";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  modal.innerHTML = `
    <div class="modal-content ms controler-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${isEditMode ? "编辑打卡项目" : "创建打卡项目"}
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
        <!-- 标题 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            标题 *
          </label>
          <input type="text" id="checkin-title-input" value="${item?.title || ""}" placeholder="输入打卡项目标题" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 描述 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            描述
          </label>
          <textarea id="checkin-description-input" placeholder="输入打卡项目描述（可选）" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
            min-height: 80px;
            resize: vertical;
          ">${item?.description || ""}</textarea>
        </div>

        <!-- 重复规则 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            重复规则
          </label>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="checkin-repeat-type" value="daily" ${(item?.repeatType || "daily") === "daily" ? "checked" : ""}>
              每天重复
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="checkin-repeat-type" value="weekly" ${item?.repeatType === "weekly" ? "checked" : ""}>
              每周指定天
            </label>
          </div>
          <div id="checkin-weekday-wrap" style="
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            background-color: var(--bg-tertiary);
            display: ${item?.repeatType === "weekly" ? "block" : "none"};
          ">
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${[
                ["1", "周一"],
                ["2", "周二"],
                ["3", "周三"],
                ["4", "周四"],
                ["5", "周五"],
                ["6", "周六"],
                ["0", "周日"],
              ]
                .map(
                  ([value, label]) => `
                <label style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-color); font-size: 13px;">
                  <input type="checkbox" name="checkin-repeat-weekday" value="${value}" ${weekDays.includes(parseInt(value, 10)) ? "checked" : ""}>
                  ${label}
                </label>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>

        <!-- 起止日期 -->
        <div class="modal-date-range controler-form-modal-date-range">
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始日期
            </label>
            <input type="date" id="checkin-start-date-input" class="modal-date-input" value="${item?.startDate || getLocalDateText()}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 14px;
            ">
          </div>
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              结束日期（可选）
            </label>
            <input type="date" id="checkin-end-date-input" class="modal-date-input" value="${item?.endDate || ""}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 14px;
            ">
          </div>
        </div>

        ${getCheckinReminderSectionHtml(item, "checkin")}
        
        <!-- 颜色选择 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            项目颜色
          </label>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#4299e1" ${!item?.color || item?.color === "#4299e1" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #4299e1; border-radius: 4px;"></span>
              <span style="font-size: 14px;">蓝色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#48bb78" ${item?.color === "#48bb78" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #48bb78; border-radius: 4px;"></span>
              <span style="font-size: 14px;">绿色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#ed8936" ${item?.color === "#ed8936" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #ed8936; border-radius: 4px;"></span>
              <span style="font-size: 14px;">橙色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#9f7aea" ${item?.color === "#9f7aea" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #9f7aea; border-radius: 4px;"></span>
              <span style="font-size: 14px;">紫色</span>
            </label>
          </div>
        </div>
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer" style="display: flex; justify-content: space-between; margin-top: 25px;">
        ${
          isEditMode
            ? `
          <button class="bts" type="button" id="delete-checkin-btn" data-todo-modal-action="delete-checkin-item" style="background-color: var(--delete-btn);">
            删除打卡项目
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-checkin-item-btn" data-todo-modal-action="cancel">取消</button>
          <button class="bts" type="button" id="save-checkin-item-btn" data-todo-modal-action="save">${isEditMode ? "保存更改" : "创建打卡项目"}</button>
        </div>
      </div>
    </div>
  `;

  appendTodoManagedModal(modal, "checkin-item");
  uiTools?.stopModalContentPropagation?.(modal);

  let unbindModalActions = () => {};
  const closeCheckinItemModal = () => {
    unbindModalActions();
    closeModalElement(modal);
  };

  const repeatRadios = modal.querySelectorAll('input[name="checkin-repeat-type"]');
  const weekdayWrap = modal.querySelector("#checkin-weekday-wrap");
  repeatRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!weekdayWrap) return;
      weekdayWrap.style.display = radio.value === "weekly" && radio.checked ? "block" : "none";
    });
  });
  bindCheckinReminderInputs(modal, "checkin");

  // 绑定事件
  const cancelAction = () => {
    closeCheckinItemModal();
  };
  const saveAction = () => {
    return saveCheckinItem(modal, isEditMode, item, {
      closeModal: closeCheckinItemModal,
    });
  };

  unbindModalActions = bindTodoModalActions(modal, {
    cancel: cancelAction,
    save: createTodoModalLockedAction(modal, saveAction),
    "delete-checkin-item": createTodoModalLockedAction(modal, async () => {
      if (!isEditMode || !item) {
        return false;
      }
      const confirmed = await requestTodoConfirmation(
        "确定要删除这个打卡项目吗？此操作不可撤销！",
        {
          title: "删除打卡项目",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) {
        return false;
      }
      return deleteCheckinItem(item.id, {
        confirmDelete: false,
        closeModal: closeCheckinItemModal,
      });
    }),
  });

  // 点击外部关闭
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      closeCheckinItemModal();
    }
  });
}

// 保存打卡项目
async function saveCheckinItem(modal, isEditMode, itemData, options = {}) {
  const { closeModal = () => closeModalElement(modal), refreshView = true } =
    options;
  const title = modal.querySelector("#checkin-title-input").value.trim();
  const description = modal
    .querySelector("#checkin-description-input")
    .value.trim();
  const repeatType =
    modal.querySelector('input[name="checkin-repeat-type"]:checked')?.value ||
    "daily";
  const repeatWeekdays = Array.from(
    modal.querySelectorAll('input[name="checkin-repeat-weekday"]:checked'),
  ).map((input) => parseInt(input.value, 10));
  const startDate =
    modal.querySelector("#checkin-start-date-input")?.value ||
    getLocalDateText();
  const endDate = modal.querySelector("#checkin-end-date-input")?.value || "";
  const color = modal.querySelector(
    'input[name="checkin-color"]:checked',
  ).value;
  const reminderConfig = readCheckinReminderConfig(
    modal,
    {
      ...itemData,
      startDate,
      repeatType,
    },
    "checkin",
  );

  // 验证输入
  if (!title) {
    alert("请输入打卡项目标题");
    return false;
  }

  if (!startDate) {
    alert("请选择开始日期");
    return false;
  }

  if (endDate && endDate < startDate) {
    alert("结束日期不能早于开始日期");
    return false;
  }

  if (repeatType === "weekly" && repeatWeekdays.length === 0) {
    alert("请选择每周重复的日期");
    return false;
  }

  const previousCheckinItems = getTodoSectionStateSnapshot("checkinItems");
  if (isEditMode && itemData) {
    // 更新现有打卡项目
    const index = checkinItems.findIndex((c) => matchesId(c.id, itemData.id));
    if (index === -1) {
      alert("保存失败：未找到该打卡项目，请刷新后重试。");
      return false;
    }
    checkinItems[index] = hydrateCheckinItem({
      ...checkinItems[index],
      title,
      description,
      color,
      repeatType,
      repeatWeekdays,
      startDate,
      endDate,
      notification: reminderConfig,
    });
  } else {
    // 创建新打卡项目
    const newItem = new CheckinItem(
      title,
      description,
      color,
      repeatType,
      repeatWeekdays,
      startDate,
      endDate,
      reminderConfig,
    );
    checkinItems.push(newItem);
  }

  finalizeTodoModalChange(closeModal, { refreshView });

  void queueTodoCoreSave(
    {
      checkinItems: getTodoSectionStateSnapshot("checkinItems"),
    },
    {
      reason: isEditMode ? "checkin-item-edit" : "checkin-item-create",
      errorLabel: "保存打卡项目失败:",
      refreshReminders: true,
    },
  ).then(async (saved) => {
    if (!saved) {
      await rollbackTodoOptimisticChange(
        {
          checkinItems: previousCheckinItems,
        },
        {
          message: "保存打卡项目失败，本次修改已撤销。",
          refreshView,
        },
      );
      return;
    }
    try {
      await reminderTools?.requestPermissionIfNeeded?.("打卡", reminderConfig, {
        silentWhenDisabled: false,
      });
    } catch (error) {
      console.error("请求打卡提醒权限失败:", error);
    }
  });
  return true;
}

// 删除打卡项目
function deleteCheckinItem(itemId, options = {}) {
  const {
    confirmDelete = true,
    refreshView = true,
    closeModal = null,
  } = options;
  if (
    confirmDelete &&
    !confirm("确定要删除这个打卡项目吗？此操作不可撤销！")
  ) {
    return false;
  }

  const previousCheckinItems = getTodoSectionStateSnapshot("checkinItems");
  const previousDailyCheckins = getTodoSectionStateSnapshot("dailyCheckins");

  // 删除打卡项目
  const index = checkinItems.findIndex((c) => matchesId(c.id, itemId));
  if (index !== -1) {
    checkinItems.splice(index, 1);
  } else {
    alert("删除失败：未找到该打卡项目，请刷新后重试。");
    return false;
  }

  // 删除相关打卡记录
  const removedDailyCheckins = dailyCheckins.filter((checkin) =>
    matchesId(checkin.itemId, itemId),
  );
  dailyCheckins = dailyCheckins.filter(
    (checkin) => !matchesId(checkin.itemId, itemId),
  );

  if (typeof closeModal === "function") {
    closeModal();
  }
  if (refreshView) {
    scheduleTodoInterfaceRefresh();
  }
  void Promise.all([
    queueTodoCoreSave(
      {
        checkinItems: getTodoSectionStateSnapshot("checkinItems"),
      },
      {
        reason: "checkin-item-delete",
        errorLabel: "删除打卡项目后保存项目列表失败:",
        refreshReminders: true,
      },
    ),
    queueTodoSectionSave("dailyCheckins", {
      previousItems: removedDailyCheckins,
      errorLabel: "删除打卡项目后保存打卡记录失败:",
    }),
  ]).then(async ([itemSaved, checkinSaved]) => {
    if (itemSaved && checkinSaved) {
      return;
    }
    await rollbackTodoOptimisticChange(
      {
        checkinItems: previousCheckinItems,
        dailyCheckins: previousDailyCheckins,
      },
      {
        title: "删除失败",
        message: "删除打卡项目失败，本次修改已撤销。",
        refreshView,
      },
    );
  });
  return true;
}

// 渲染打卡项目列表
function renderCheckinList() {
  const container = document.getElementById("checkin-list-container");
  if (!container) return;
  const listScale = Math.min(
    Math.max(getTableScaleSetting("todoListView", 1, ["todoLists"]), 0.1),
    2.2,
  );
  const densityScale = getTodoListDensityScale(listScale);
  const contentWidth = getTodoListCardMaxWidth(listScale, 540);
  container.style.fontSize = `${Math.max(10, Math.round(14 * densityScale))}px`;
  container.style.padding = `${Math.max(8, Math.round(15 * densityScale))}px`;
  const { useTwoColumnGrid } = applyTodoCollectionContainerLayout(
    container,
    densityScale,
  );

  // 清除容器内容
  container.innerHTML = "";

  // 如果没有打卡项目，显示空状态
  if (checkinItems.length === 0) {
    const emptyStateWidthStyle =
      Number.isFinite(contentWidth) && contentWidth > 0
        ? `max-width: ${contentWidth}px;`
        : "max-width: 100%;";
    container.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-color); ${emptyStateWidthStyle}">
        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
        <h3 style="color: var(--text-color)">暂无打卡项目</h3>
        <p style="color: var(--muted-text-color); margin-bottom: 20px">
          点击"添加项目"按钮创建打卡项目
        </p>
      </div>
    `;
    applyCenteredEmptyStateLayout(
      container.querySelector(".empty-state"),
      contentWidth,
      {
        useTwoColumnGrid,
      },
    );
    updateCheckinStats();
    updateStatsPanel();
    return;
  }

  // 渲染打卡项目列表
  checkinItems.forEach((item) => {
    const itemElement = createCheckinItemElement(item, listScale);
    applyTodoCollectionItemLayout(itemElement, {
      useTwoColumnGrid,
    });
    container.appendChild(itemElement);
  });

  updateCheckinStats();
  updateStatsPanel();
}

// 创建打卡项目元素
function createCheckinItemElement(item, listScale = 1) {
  const itemElement = document.createElement("div");
  const cardScale = getTodoListDensityScale(listScale);
  const titleFontSize = Math.max(12, Math.round(20 * cardScale));
  const metaFontSize = Math.max(10, Math.round(14 * cardScale));
  const cardMaxWidth = getTodoListCardMaxWidth(listScale, 540);
  itemElement.className = "checkin-item";
  itemElement.dataset.itemId = item.id;
  itemElement.style.backgroundColor = "var(--bg-tertiary)";
  itemElement.style.borderRadius = `${Math.max(18, Math.round(26 * cardScale))}px`;
  itemElement.style.padding = `${Math.max(8, Math.round(16 * cardScale))}px`;
  itemElement.style.marginBottom = "0";
  itemElement.style.color = "var(--text-color)";
  itemElement.style.transition = "all 0.3s ease";
  itemElement.style.borderLeft = `${Math.max(2, Math.round(4 * cardScale))}px solid ${item.color}`;
  itemElement.style.width = "100%";
  itemElement.style.maxWidth = cardMaxWidth ? `${cardMaxWidth}px` : "100%";
  itemElement.style.alignSelf = isCompactMobileLayout() ? "stretch" : "center";
  itemElement.style.display = "flex";
  itemElement.style.flexDirection = "column";
  itemElement.style.gap = `${Math.max(6, Math.round(10 * cardScale))}px`;

  const checked = item.getTodayCheckinStatus();
  const checkedDays = item.getCheckedDaysCount();
  const today = getLocalDateText();
  const isScheduledToday =
    typeof item.isScheduledOn === "function" ? item.isScheduledOn(today) : true;
  const repeatSummary =
    typeof item.getRepeatSummary === "function" ? item.getRepeatSummary() : "每天";
  const reminderSummary =
    reminderTools?.describeCheckinReminder?.(item) || "不通知";

  // 构建HTML
  itemElement.innerHTML = `
    <div class="checkin-header" style="display: flex; justify-content: space-between; align-items: center; gap: ${Math.max(8, Math.round(12 * cardScale))}px; flex-wrap: wrap;">
      <h3 class="checkin-title" style="font-size: ${titleFontSize}px; font-weight: bold; color: var(--text-color); margin: 0;">
        ${item.title}
      </h3>
      <div class="checkin-status" style="display: flex; align-items: center; gap: ${Math.max(6, Math.round(10 * cardScale))}px;">
        <span class="streak-days" style="font-size: ${metaFontSize}px; color: var(--accent-color); background-color: rgba(var(--accent-color-rgb), 0.18); padding: ${Math.max(3, Math.round(4 * cardScale))}px ${Math.max(8, Math.round(10 * cardScale))}px; border-radius: ${Math.max(10, Math.round(14 * cardScale))}px;">
          🔥 ${checkedDays}天
        </span>
        <button class="checkin-toggle-btn" style="
          width: ${Math.max(28, Math.round(38 * cardScale))}px;
          height: ${Math.max(28, Math.round(38 * cardScale))}px;
          border-radius: 50%;
          border: none;
          background-color: ${checked ? item.color : "var(--bg-quaternary)"};
          color: white;
          cursor: ${!isScheduledToday ? "not-allowed" : "pointer"};
          font-size: ${Math.max(13, Math.round(20 * cardScale))}px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          opacity: ${!isScheduledToday ? "0.55" : "1"};
        ">
          ${checked ? "✓" : "○"}
        </button>
      </div>
    </div>
    
    <p class="checkin-description" style="font-size: ${metaFontSize}px; color: var(--muted-text-color); margin: 0; line-height: 1.4;">
      ${item.description || "无描述"}
    </p>
    
    <div class="checkin-footer" style="display: flex; justify-content: space-between; align-items: center; gap: ${Math.max(8, Math.round(12 * cardScale))}px; flex-wrap: wrap;">
      <div style="font-size: ${Math.max(10, Math.round(13 * cardScale))}px; color: var(--text-color); opacity: 0.88;">
        ${repeatSummary}
        <div style="font-size: ${Math.max(9, Math.round(12 * cardScale))}px; opacity: 0.72; margin-top: 2px;">
          ${item.startDate || "-"} ${item.endDate ? `至 ${item.endDate}` : "起"}
        </div>
        ${
          item.notification?.enabled
            ? `
          <div style="font-size: ${Math.max(9, Math.round(12 * cardScale))}px; opacity: 0.72; margin-top: 4px;">
            🔔 ${reminderSummary}
          </div>
        `
            : ""
        }
      </div>
      <div class="checkin-today-status" style="font-size: ${metaFontSize}px; color: ${checked ? item.color : "var(--muted-text-color)"};">
        ${
          !isScheduledToday
            ? "今日不在打卡周期"
            : checked
              ? "今日已打卡"
              : "今日未打卡"
        }
      </div>
    </div>
  `;

  // 添加事件监听器
  const descriptionElement = itemElement.querySelector(".checkin-description");
  const toggleBtn = itemElement.querySelector(".checkin-toggle-btn");

  if (descriptionElement && isCompactMobileLayout()) {
    descriptionElement.style.webkitLineClamp = "1";
  }

  toggleBtn.disabled = !isScheduledToday;
  toggleBtn.setAttribute("aria-busy", "false");
  toggleBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isScheduledToday) return;
    item.toggleTodayCheckin();
  });

  itemElement.addEventListener("click", () => {
    showCheckinItemModal(item);
  });

  // 悬停效果
  itemElement.addEventListener("mouseenter", () => {
    itemElement.style.transform = "translateY(-2px)";
    itemElement.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.15)";
  });

  itemElement.addEventListener("mouseleave", () => {
    itemElement.style.transform = "translateY(0)";
    itemElement.style.boxShadow = "none";
  });

  return wrapTodoSwipeDeleteCard(itemElement, {
    kind: "checkin",
    itemId: item.id,
    onDelete: () => confirmTodoSwipeDelete("checkin", item.id),
  });
}

// 初始化视图切换
function initViewToggle() {
  const todoViewBtn = document.getElementById("todo-view-btn");
  const checkinViewBtn = document.getElementById("checkin-view-btn");

  if (todoViewBtn && checkinViewBtn) {
    todoViewBtn.addEventListener("click", () => {
      currentView = "todos";
      todoViewBtn.classList.add("active");
      checkinViewBtn.classList.remove("active");
      renderCurrentView();
    });

    checkinViewBtn.addEventListener("click", () => {
      currentView = "checkins";
      checkinViewBtn.classList.add("active");
      todoViewBtn.classList.remove("active");
      renderCurrentView();
    });
  }
}

function initTodoLayoutToggle() {
  const layoutSelect = document.getElementById("todo-layout-select");
  const listBtn = document.getElementById("todo-layout-list-btn");
  const quadrantBtn = document.getElementById("todo-layout-quadrant-btn");

  const syncButtonState = () => {
    if (layoutSelect) {
      layoutSelect.value = todoLayoutMode;
      uiTools?.refreshEnhancedSelect?.(layoutSelect);
    }

    if (!listBtn || !quadrantBtn) {
      return;
    }

    if (todoLayoutMode === "quadrant") {
      quadrantBtn.style.backgroundColor = "var(--accent-color)";
      quadrantBtn.style.color = "var(--button-text)";
      listBtn.style.backgroundColor = "";
      listBtn.style.color = "";
    } else {
      listBtn.style.backgroundColor = "var(--accent-color)";
      listBtn.style.color = "var(--button-text)";
      quadrantBtn.style.backgroundColor = "";
      quadrantBtn.style.color = "";
    }
  };

  if (layoutSelect) {
    layoutSelect.value = todoLayoutMode;
    uiTools?.enhanceNativeSelect?.(layoutSelect, {
      fullWidth: true,
      minWidth: 0,
      preferredMenuWidth: 220,
      maxMenuWidth: 260,
      widthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
      menuWidthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
    });
    layoutSelect.addEventListener("change", () => {
      todoLayoutMode = layoutSelect.value === "quadrant" ? "quadrant" : "list";
      syncButtonState();
      renderCurrentView();
    });
  }

  listBtn?.addEventListener("click", () => {
    todoLayoutMode = "list";
    syncButtonState();
    renderCurrentView();
  });

  quadrantBtn?.addEventListener("click", () => {
    todoLayoutMode = "quadrant";
    syncButtonState();
    renderCurrentView();
  });

  syncButtonState();
}

// 渲染当前视图
function renderCurrentView() {
  closeTodoSwipeDeleteShells({
    animate: false,
  });
  const todoContainer = document.getElementById("todo-list-container");
  const todoQuadrantContainer = document.getElementById("todo-quadrant-container");
  const checkinContainer = document.getElementById("checkin-list-container");
  const todoControls = document.getElementById("todo-view-controls");
  const checkinControls = document.getElementById("checkin-view-controls");
  const todoViewBtn = document.getElementById("todo-view-btn");
  const checkinViewBtn = document.getElementById("checkin-view-btn");

  if (todoViewBtn && checkinViewBtn) {
    todoViewBtn.classList.toggle("active", currentView === "todos");
    checkinViewBtn.classList.toggle("active", currentView === "checkins");
  }

  if (currentView === "todos") {
    if (todoContainer) {
      todoContainer.style.display = todoLayoutMode === "list" ? "block" : "none";
    }
    if (todoQuadrantContainer) {
      todoQuadrantContainer.style.display =
        todoLayoutMode === "quadrant" ? "block" : "none";
    }
    if (checkinContainer) checkinContainer.style.display = "none";
    if (todoControls) todoControls.style.display = "block";
    if (checkinControls) checkinControls.style.display = "none";
    renderTodoArea();
  } else {
    if (todoContainer) todoContainer.style.display = "none";
    if (todoQuadrantContainer) todoQuadrantContainer.style.display = "none";
    if (checkinContainer) checkinContainer.style.display = "block";
    if (todoControls) todoControls.style.display = "none";
    if (checkinControls) checkinControls.style.display = "block";
    renderCheckinList();
    updateCheckinStats();
  }
  updateStatsPanel();
}

function applyPendingTodoRefreshIfNeeded() {
  if (!todoPendingExternalStorageRefresh) {
    return;
  }
  flushTodoDeferredExternalRefreshIfNeeded();
}

function renderTodoWorkspace() {
  renderCurrentView();
  updateStats();
  updateCheckinStats();
  updateStatsPanel();
}

function ensureTodoBaseBindings(options = {}) {
  loadThemeSettings();
  applyTodoDesktopWidgetMode();
  if (!todoUiBindingsInitialized) {
    if (options?.skipInitialDataLoad !== true) {
      loadData();
    }
    initFilters();
    initSearch();
    initSort();
    initAddButtons();
    initViewToggle();
    initTodoLayoutToggle();
    bindTableScaleLiveRefresh();
    bindTodoExternalStorageRefresh();
    if (!todoWidgetViewListenerBound) {
      todoWidgetViewListenerBound = true;
      window.addEventListener(TODO_WIDGET_VIEW_EVENT, (event) => {
        const nextView = setTodoView(event?.detail?.view, {
          persistWidgetView: true,
        });
        applyTodoWidgetMode();
        if (todoPlanSidebarInitialized) {
          renderCurrentView();
          updateStats();
          updateCheckinStats();
        } else {
          currentView = nextView;
        }
      });
    }
    todoUiBindingsInitialized = true;
  }
  initTodoWidgetLaunchAction();
  applyPendingTodoRefreshIfNeeded();
}

function scheduleTodoWidgetLaunchHandled(
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
      clearTodoWidgetLaunchQuery();
    }
    if (!launchId || typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return true;
    }
    window.ControlerNativeBridge.emitEvent("widgets.launchHandled", {
      launchId,
      page: "todo",
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
    if (Date.now() - startedAt >= TODO_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS) {
      return;
    }
    schedule(waitForHandled);
  };
  schedule(waitForHandled);
  return true;
}

function handleTodoWidgetLaunchAction(payload = {}, options = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "show-todos" && action !== "show-checkins") {
    return false;
  }
  setTodoView(action === "show-checkins" ? "checkins" : "todos", {
    persistWidgetView: true,
  });
  applyTodoWidgetMode();
  renderTodoWorkspace();
  scheduleTodoWidgetLaunchHandled(
    payload,
    () => isTodoWidgetTargetVisible(action),
    options,
  );
  return true;
}

function initTodoWidgetLaunchAction() {
  if (todoWidgetLaunchActionInitialized) {
    return;
  }
  todoWidgetLaunchActionInitialized = true;
  const eventName =
    window.ControlerWidgetsBridge?.launchActionEventName ||
    "controler:launch-action";
  let consumedQuery = false;

  const consumeQueryAction = () => {
    if (consumedQuery) {
      return;
    }
    const params = new URLSearchParams(window.location.search || "");
    const action = params.get("widgetAction") || "";
    if (!action) {
      return;
    }
    consumedQuery = true;
    handleTodoWidgetLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
      launchId: params.get("widgetLaunchId") || "",
    }, {
      clearQuery: true,
    });
  };

  window.addEventListener(eventName, (event) => {
    handleTodoWidgetLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}

function initPlanSidebar(options = {}) {
  ensureTodoBaseBindings();
  const initialView = normalizeTodoView(
    typeof options?.initialView === "string" && options.initialView.trim()
      ? options.initialView.trim()
      : resolvePreferredTodoView() || currentView,
  );
  setTodoView(initialView, {
    persistWidgetView: options.persistWidgetView !== false,
  });
  applyTodoWidgetMode();
  renderTodoWorkspace();
  todoPlanSidebarInitialized = true;
  return {
    view: currentView,
  };
}

function queueTodoInitialReveal() {
  if (todoInitialReadyReported) {
    return;
  }
  const body = document.body;
  if (!(body instanceof HTMLElement)) {
    return;
  }
  if (!body.classList.contains("todo-bootstrap-pending")) {
    todoInitialReadyReported = true;
    uiTools?.markNativePageReady?.();
    return;
  }
  if (todoInitialRevealQueued) {
    return;
  }

  todoInitialRevealQueued = true;
  todoInitialReadyReported = true;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    schedule(() => {
      todoInitialRevealQueued = false;
      body.classList.remove("todo-bootstrap-pending");
      body.classList.add("todo-bootstrap-ready");
      uiTools?.markPerfStage?.("first-render-done");
      uiTools?.markNativePageReady?.();
    });
  });
}

window.ControlerTodoRuntime = {
  initPlanSidebar,
  switchView(view) {
    initPlanSidebar({
      initialView: view,
      persistWidgetView: true,
    });
    return {
      view: currentView,
    };
  },
  openComposer(options = {}) {
    initPlanSidebar({
      initialView:
        typeof options?.initialView === "string" ? options.initialView : currentView,
      persistWidgetView: true,
    });
    openTodoCreateFlow();
  },
};

// 初始化
async function init() {
  initTodoWidgetLaunchAction();
  registerTodoBeforePageLeaveGuard();
  applyTodoWorkspaceSnapshot(await readFreshTodoWorkspaceSnapshot());
  ensureTodoBaseBindings({
    skipInitialDataLoad: true,
  });
  applyTodoWidgetMode();
  renderTodoWorkspace();
  todoPlanSidebarInitialized = true;
  uiTools?.markPerfStage?.("first-data-ready", {
    todoCount: todos.length,
    checkinItemCount: checkinItems.length,
    dailyCheckinCount: dailyCheckins.length,
    recentCheckinCount: checkins.length,
  });
  queueTodoInitialReveal();
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!document.body?.classList.contains("page-plan")) {
      init();
    }
  });
} else {
  if (!document.body?.classList.contains("page-plan")) {
    init();
  }
}
})();
