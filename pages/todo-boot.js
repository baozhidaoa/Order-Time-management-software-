;/* pages/checkin-schedule-utils.js */
(() => {
  const MAX_DATE_KEY = "9999-12-31";

  function normalizeCheckinScheduleDateKey(dateValue = "") {
    const directText = String(dateValue || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(directText)) {
      return directText;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(directText)) {
      return directText.slice(0, 10);
    }
    if (!directText) {
      return "";
    }
    const parsed = new Date(directText);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate(),
    ).padStart(2, "0")}`;
  }

  function normalizeCheckinScheduleReferenceDate(referenceDate = null) {
    if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
      return normalizeCheckinScheduleDateKey(referenceDate);
    }
    return normalizeCheckinScheduleDateKey(referenceDate) || normalizeCheckinScheduleDateKey(new Date());
  }

  function parseCheckinScheduleTimestamp(value = "") {
    const timestamp = Date.parse(String(value || "").trim());
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function buildNormalizedCheckinScheduleRange(
    rangeLike = {},
    itemLike = {},
    sourceIndex = 0,
  ) {
    const normalizedStartDate = normalizeCheckinScheduleDateKey(
      rangeLike?.startDate || itemLike?.startDate || "",
    );
    if (!normalizedStartDate) {
      return null;
    }
    return {
      id: String(rangeLike?.id || "").trim(),
      startDate: normalizedStartDate,
      endDate: normalizeCheckinScheduleDateKey(
        rangeLike?.endDate || itemLike?.endDate || "",
      ),
      createdAt:
        String(rangeLike?.createdAt || itemLike?.createdAt || "").trim() || "",
      updatedAt:
        String(rangeLike?.updatedAt || itemLike?.updatedAt || "").trim() || "",
      sourceIndex:
        Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : 0,
    };
  }

  function getCheckinScheduleSourceRanges(itemLike = {}) {
    if (Array.isArray(itemLike?.scheduleRanges) && itemLike.scheduleRanges.length > 0) {
      return itemLike.scheduleRanges;
    }
    return itemLike && typeof itemLike === "object" ? [itemLike] : [];
  }

  function isCheckinScheduleRangeOngoing(rangeLike = {}, referenceDate = null) {
    const normalizedReferenceDate =
      normalizeCheckinScheduleReferenceDate(referenceDate);
    const normalizedEndDate = normalizeCheckinScheduleDateKey(rangeLike?.endDate);
    return !normalizedEndDate || normalizedReferenceDate < normalizedEndDate;
  }

  function isBetterCheckinScheduleRangeCandidate(
    candidate,
    current,
    referenceDate = null,
  ) {
    if (!current) {
      return true;
    }

    const candidateOngoing = isCheckinScheduleRangeOngoing(
      candidate,
      referenceDate,
    );
    const currentOngoing = isCheckinScheduleRangeOngoing(current, referenceDate);
    if (candidateOngoing !== currentOngoing) {
      return candidateOngoing;
    }

    const candidateEndScore =
      normalizeCheckinScheduleDateKey(candidate?.endDate) || MAX_DATE_KEY;
    const currentEndScore =
      normalizeCheckinScheduleDateKey(current?.endDate) || MAX_DATE_KEY;
    if (candidateEndScore !== currentEndScore) {
      return candidateEndScore > currentEndScore;
    }

    const candidateUpdatedAt = Math.max(
      parseCheckinScheduleTimestamp(candidate?.updatedAt),
      parseCheckinScheduleTimestamp(candidate?.createdAt),
    );
    const currentUpdatedAt = Math.max(
      parseCheckinScheduleTimestamp(current?.updatedAt),
      parseCheckinScheduleTimestamp(current?.createdAt),
    );
    if (candidateUpdatedAt !== currentUpdatedAt) {
      return candidateUpdatedAt > currentUpdatedAt;
    }

    return (candidate?.sourceIndex || 0) >= (current?.sourceIndex || 0);
  }

  function getCheckinScheduleDisplayRanges(itemLike = {}, options = {}) {
    const normalizedReferenceDate = normalizeCheckinScheduleReferenceDate(
      options?.referenceDate,
    );
    const groupedByStartDate = new Map();

    getCheckinScheduleSourceRanges(itemLike).forEach((rangeLike, sourceIndex) => {
      const normalizedRange = buildNormalizedCheckinScheduleRange(
        rangeLike,
        itemLike,
        sourceIndex,
      );
      if (!normalizedRange) {
        return;
      }

      const rangeKey = normalizedRange.startDate;
      const current = groupedByStartDate.get(rangeKey) || null;
      if (
        isBetterCheckinScheduleRangeCandidate(
          normalizedRange,
          current,
          normalizedReferenceDate,
        )
      ) {
        groupedByStartDate.set(rangeKey, normalizedRange);
      }
    });

    return Array.from(groupedByStartDate.values()).sort((left, right) => {
      if (left.startDate !== right.startDate) {
        return left.startDate.localeCompare(right.startDate);
      }
      return (left.sourceIndex || 0) - (right.sourceIndex || 0);
    });
  }

  function formatCheckinScheduleDisplayDate(dateText = "", formatter = null) {
    const normalizedDate = normalizeCheckinScheduleDateKey(dateText);
    if (!normalizedDate) {
      return "";
    }
    if (typeof formatter === "function") {
      const formatted = formatter(normalizedDate);
      return String(formatted || "").trim();
    }
    const parsed = new Date(normalizedDate);
    if (Number.isNaN(parsed.getTime())) {
      return normalizedDate;
    }
    return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  }

  function formatCheckinScheduleDisplayLabel(rangeLike = {}, options = {}) {
    const normalizedReferenceDate = normalizeCheckinScheduleReferenceDate(
      options?.referenceDate,
    );
    const startLabel = formatCheckinScheduleDisplayDate(
      rangeLike?.startDate,
      options?.formatDate,
    );
    if (!startLabel) {
      return "";
    }
    if (isCheckinScheduleRangeOngoing(rangeLike, normalizedReferenceDate)) {
      return startLabel;
    }
    const endLabel = formatCheckinScheduleDisplayDate(
      rangeLike?.endDate,
      options?.formatDate,
    );
    return endLabel ? `${startLabel}—${endLabel}` : startLabel;
  }

  function getCheckinScheduleDisplayLabels(itemLike = {}, options = {}) {
    return getCheckinScheduleDisplayRanges(itemLike, options)
      .map((rangeLike) => formatCheckinScheduleDisplayLabel(rangeLike, options))
      .filter(Boolean);
  }

  window.ControlerCheckinScheduleUtils = {
    normalizeDateKey: normalizeCheckinScheduleDateKey,
    normalizeReferenceDate: normalizeCheckinScheduleReferenceDate,
    isRangeOngoing: isCheckinScheduleRangeOngoing,
    getDisplayRanges: getCheckinScheduleDisplayRanges,
    formatDisplayDate: formatCheckinScheduleDisplayDate,
    formatDisplayLabel: formatCheckinScheduleDisplayLabel,
    getDisplayLabels: getCheckinScheduleDisplayLabels,
  };
})();


;/* pages/todo.js */
(() => {
  // 待办事项页面JavaScript
  let todos = []; // 存储普通待办事项对象
  let checkinItems = []; // 存储打卡项目对象
  let checkinHistorySummary = {}; // 存储打卡历史汇总索引
  let dailyCheckins = []; // 存储每日打卡记录
  let checkins = []; // 待办事项打卡记录
  let currentFilter = "all"; // 当前筛选器
  const TODO_SORT_PREFERENCE_KEY = "todoSortPreference";
  const CHECKIN_STATUS_FILTER_STORAGE_KEY = "todoCheckinStatusFilter";
  let pendingTodoSortPreferenceCoreBackfill = "";
  let currentSort = readPersistedTodoSortPreference(); // 当前排序方式
  let currentCheckinStatusFilter = readPersistedCheckinStatusFilter();
  let currentView = "todos"; // 当前视图: "todos" 或 "checkins"
  let todoLayoutMode = "list"; // "list" | "quadrant"
  const uiTools = window.ControlerUI || null;
  let reminderTools = window.ControlerReminders || null;
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
  const TODO_LOADING_OVERLAY_DELAY_MS = Math.max(
    0,
    Math.round(Number(uiTools?.pageLoadingOverlayDelayMs) || 120),
  );
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
  let todoPendingReminderRefresh = false;
  let todoReminderRefreshFlushPromise = null;
  let todoLastPersistenceError = null;
  let todoActiveSwipeDeleteShell = null;
  let todoSwipeDeleteDismissBound = false;
  let todoSwipeDeleteConfirmationShell = null;
  let todoInitialReadyReported = false;
  let todoInitialDataLoaded = false;
  let todoInitialDataValidated = false;
  let todoDeferredFreshSyncQueued = false;
  let todoInitialFreshSyncPromise = null;
  let todoBootstrappedFromPageBootstrap = false;
  let todoLoadingOverlayController = null;
  let todoShellPageActive = uiTools?.isShellPageActive?.() !== false;
  let todoShellVisibilityBound = false;
  let todoDeferredFreshSyncPendingResume = false;
  let todoExternalRefreshPendingResume = false;
  let todoDeferredFreshSyncGeneration = 0;
  let todoDeferredFreshSyncTimerId = 0;
  let todoDeferredFreshSyncIdleId = 0;
  let todoReminderRuntimePromise = null;
  const TODO_TOGGLE_PERSIST_DEBOUNCE_MS =
    window.ControlerStorage?.isNativeApp === true ? 0 : 180;
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
  const TODO_SELF_REFRESH_IGNORE_WINDOW_MS = 10000;
  const TODO_SELF_REFRESH_IGNORE_MAX_USES = 4;
  let todoIgnoredRefreshEvents = [];
  let todoQueuedExternalStorageRefreshDetail = null;

  function isTodoShellTransitionLoading() {
    if (typeof uiTools?.getShellVisibilityState !== "function") {
      return false;
    }
    return uiTools.getShellVisibilityState()?.transitionLoading === true;
  }

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

  function readTodoLocalSortPreferenceValue() {
    try {
      const localValue = localStorage.getItem(TODO_SORT_PREFERENCE_KEY) || "";
      if (localValue.trim()) {
        return normalizeTodoSortPreference(localValue);
      }
    } catch (error) {
      console.error("读取待办本地排序设置失败:", error);
    }
    return "";
  }

  function readPersistedTodoSortPreference() {
    const localValue = readTodoLocalSortPreferenceValue();
    try {
      const managedValue =
        typeof window.ControlerStorage?.getStateValue === "function"
          ? window.ControlerStorage.getStateValue(TODO_SORT_PREFERENCE_KEY)
          : typeof window.ControlerStorage?.dump === "function"
            ? window.ControlerStorage.dump()?.todoSortPreference
            : "";
      if (typeof managedValue === "string" && managedValue.trim()) {
        const normalizedManagedValue =
          normalizeTodoSortPreference(managedValue);
        if (normalizedManagedValue !== "dueDate") {
          pendingTodoSortPreferenceCoreBackfill = "";
          return normalizedManagedValue;
        }
        if (localValue) {
          if (normalizedManagedValue !== localValue) {
            pendingTodoSortPreferenceCoreBackfill = localValue;
          }
          return localValue;
        }
        pendingTodoSortPreferenceCoreBackfill = "";
        return normalizedManagedValue;
      }
    } catch (error) {
      console.error("读取待办排序设置失败，回退本地设置:", error);
    }

    if (localValue) {
      pendingTodoSortPreferenceCoreBackfill = localValue;
      return localValue;
    }

    pendingTodoSortPreferenceCoreBackfill = "";
    return "dueDate";
  }

  function flushPendingTodoSortPreferenceCoreBackfill() {
    const nextSort = normalizeTodoSortPreference(
      pendingTodoSortPreferenceCoreBackfill,
    );
    if (!pendingTodoSortPreferenceCoreBackfill || nextSort === "dueDate") {
      pendingTodoSortPreferenceCoreBackfill = "";
      return;
    }
    pendingTodoSortPreferenceCoreBackfill = "";
    void queueTodoCoreSave(
      {
        todoSortPreference: nextSort,
      },
      {
        reason: "todo-sort-preference-backfill",
      },
    );
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

  function getTodoStoragePageInstanceId() {
    return typeof window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ === "string"
      ? window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
      : "";
  }

  function isTodoOwnStorageChange(detail = {}) {
    const originPageInstanceId =
      typeof detail?.originPageInstanceId === "string"
        ? detail.originPageInstanceId.trim()
        : "";
    return (
      !!originPageInstanceId &&
      originPageInstanceId === getTodoStoragePageInstanceId()
    );
  }

  function isTodoInitialStorageBootstrapChange(detail = {}) {
    const reason =
      typeof detail?.reason === "string" ? detail.reason.trim() : "";
    const changedSections = getTodoNormalizedChangedSections(
      detail?.changedSections,
    );
    return reason === "initial-sync" && !changedSections.length;
  }

  function isTodoAmbiguousNativeExternalChange(detail = {}) {
    if (window.ControlerStorage?.isNativeApp !== true) {
      return false;
    }
    const changedSections = getTodoNormalizedChangedSections(
      detail?.changedSections,
    );
    if (changedSections.length) {
      return false;
    }
    const reason =
      typeof detail?.reason === "string" ? detail.reason.trim() : "";
    const source =
      typeof detail?.source === "string" ? detail.source.trim() : "";
    return (
      !source && (reason === "external-update" || reason === "shell-resume")
    );
  }

  function shouldRefreshTodoForExternalChange(detail = {}) {
    if (
      isTodoOwnStorageChange(detail) ||
      isTodoInitialStorageBootstrapChange(detail)
    ) {
      return false;
    }
    if (window.ControlerStorage?.shouldIgnoreRecentLocalEcho?.(detail)) {
      return false;
    }
    if (isTodoAmbiguousNativeExternalChange(detail)) {
      return false;
    }
    const changedSections = getTodoNormalizedChangedSections(
      detail?.changedSections,
    );
    if (!changedSections.length) {
      return true;
    }
    return changedSections.some((section) =>
      [
        "todos",
        "checkinItems",
        "checkinHistorySummary",
        "dailyCheckins",
        "checkins",
        "core",
      ].includes(
        section,
      ),
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

  function createEmptyCheckinHistorySummaryEntry(updatedAt = "") {
    return {
      checkedDaysCount: 0,
      checkedDates: [],
      updatedAt:
        typeof updatedAt === "string" && updatedAt.trim() ? updatedAt.trim() : "",
    };
  }

  function normalizeCheckinHistorySummaryDateList(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((dateText) => normalizeTodoOccurrenceDateKey(dateText))
          .filter(Boolean),
      ),
    ).sort();
  }

  function normalizeCheckinHistorySummaryEntry(entry = {}) {
    const source =
      entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const checkedDates = normalizeCheckinHistorySummaryDateList(
      source.checkedDates,
    );
    const explicitCount = Math.max(
      0,
      Math.round(Number(source.checkedDaysCount) || 0),
    );
    const updatedAt =
      typeof source.updatedAt === "string" && source.updatedAt.trim()
        ? source.updatedAt.trim()
        : "";
    return {
      checkedDaysCount:
        checkedDates.length > 0 ? checkedDates.length : explicitCount,
      checkedDates,
      updatedAt,
    };
  }

  function normalizeCheckinHistorySummary(summary = {}) {
    const source =
      summary && typeof summary === "object" && !Array.isArray(summary)
        ? summary
        : {};
    const normalized = {};
    Object.keys(source).forEach((itemId) => {
      const normalizedItemId = String(itemId || "").trim();
      if (!normalizedItemId) {
        return;
      }
      normalized[normalizedItemId] = normalizeCheckinHistorySummaryEntry(
        source[itemId],
      );
    });
    return normalized;
  }

  function collectTodoCheckinItemIdsFromCollection(items = checkinItems) {
    return Array.from(
      new Set(
        (Array.isArray(items) ? items : [])
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function hasCheckinHistorySummaryCoverage(
    summary = checkinHistorySummary,
    items = checkinItems,
  ) {
    const normalizedSummary = normalizeCheckinHistorySummary(summary);
    return collectTodoCheckinItemIdsFromCollection(items).every((itemId) => {
      const entry = normalizedSummary[itemId];
      return (
        entry &&
        Array.isArray(entry.checkedDates) &&
        entry.checkedDaysCount === entry.checkedDates.length
      );
    });
  }

  function captureTodoWorkspaceSnapshot() {
    return {
      todos: cloneTodoValue(todos),
      checkinItems: cloneTodoValue(checkinItems),
      checkinHistorySummary: cloneTodoValue(checkinHistorySummary),
      dailyCheckins: cloneTodoValue(dailyCheckins),
      checkins: cloneTodoValue(checkins),
    };
  }

  function mergeTodoWorkspaceSnapshot(
    snapshot = {},
    fallbackSnapshot = captureTodoWorkspaceSnapshot(),
  ) {
    const fallback =
      fallbackSnapshot &&
      typeof fallbackSnapshot === "object" &&
      !Array.isArray(fallbackSnapshot)
        ? fallbackSnapshot
        : captureTodoWorkspaceSnapshot();
    return {
      todos: Array.isArray(snapshot?.todos)
        ? cloneTodoValue(snapshot.todos)
        : cloneTodoValue(fallback.todos),
      checkinItems: Array.isArray(snapshot?.checkinItems)
        ? cloneTodoValue(snapshot.checkinItems)
        : cloneTodoValue(fallback.checkinItems),
      checkinHistorySummary:
        snapshot?.checkinHistorySummary &&
        typeof snapshot.checkinHistorySummary === "object" &&
        !Array.isArray(snapshot.checkinHistorySummary)
          ? normalizeCheckinHistorySummary(snapshot.checkinHistorySummary)
          : normalizeCheckinHistorySummary(fallback.checkinHistorySummary),
      dailyCheckins: Array.isArray(snapshot?.dailyCheckins)
        ? cloneTodoValue(snapshot.dailyCheckins)
        : cloneTodoValue(fallback.dailyCheckins),
      checkins: Array.isArray(snapshot?.checkins)
        ? cloneTodoValue(snapshot.checkins)
        : cloneTodoValue(fallback.checkins),
    };
  }

  function hasTodoWorkspaceCoreItems(snapshot = {}) {
    return (
      (Array.isArray(snapshot?.todos) && snapshot.todos.length > 0) ||
      (Array.isArray(snapshot?.checkinItems) &&
        snapshot.checkinItems.length > 0)
    );
  }

  function hasTodoWorkspaceRenderableData(snapshot = {}) {
    return (
      hasTodoWorkspaceCoreItems(snapshot) ||
      (Array.isArray(snapshot?.checkins) && snapshot.checkins.length > 0) ||
      (Array.isArray(snapshot?.dailyCheckins) &&
        snapshot.dailyCheckins.length > 0)
    );
  }

  function restoreTodoCoreFromFallbackSnapshot(
    snapshot = null,
    fallbackSnapshot = null,
  ) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return null;
    }
    const fallback =
      fallbackSnapshot &&
      typeof fallbackSnapshot === "object" &&
      !Array.isArray(fallbackSnapshot)
        ? mergeTodoWorkspaceSnapshot(fallbackSnapshot)
        : mergeTodoWorkspaceSnapshot();
    const normalizedSnapshot = mergeTodoWorkspaceSnapshot(snapshot, fallback);
    if (!hasTodoWorkspaceCoreItems(fallback)) {
      return normalizedSnapshot;
    }
    const shouldRestoreTodos =
      Array.isArray(snapshot?.todos) &&
      snapshot.todos.length === 0 &&
      Array.isArray(fallback.todos) &&
      fallback.todos.length > 0;
    const shouldRestoreCheckinItems =
      Array.isArray(snapshot?.checkinItems) &&
      snapshot.checkinItems.length === 0 &&
      Array.isArray(fallback.checkinItems) &&
      fallback.checkinItems.length > 0;
    if (!shouldRestoreTodos && !shouldRestoreCheckinItems) {
      return normalizedSnapshot;
    }
    return {
      ...normalizedSnapshot,
      todos: shouldRestoreTodos
        ? cloneTodoValue(fallback.todos)
        : normalizedSnapshot.todos,
      checkinItems: shouldRestoreCheckinItems
        ? cloneTodoValue(fallback.checkinItems)
        : normalizedSnapshot.checkinItems,
    };
  }

  function normalizeTodoCoreUpdate(partialCore = {}) {
    const source =
      partialCore &&
      typeof partialCore === "object" &&
      !Array.isArray(partialCore)
        ? cloneTodoValue(partialCore)
        : {};
    if (Object.prototype.hasOwnProperty.call(source, "todos")) {
      source.todos = Array.isArray(source.todos)
        ? cloneTodoValue(source.todos)
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(source, "checkinItems")) {
      source.checkinItems = Array.isArray(source.checkinItems)
        ? cloneTodoValue(source.checkinItems)
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(source, "checkinHistorySummary")) {
      source.checkinHistorySummary = normalizeCheckinHistorySummary(
        source.checkinHistorySummary,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(source, TODO_SORT_PREFERENCE_KEY)
    ) {
      source[TODO_SORT_PREFERENCE_KEY] = normalizeTodoSortPreference(
        source[TODO_SORT_PREFERENCE_KEY],
      );
    }
    return source;
  }

  function getReminderTools() {
    reminderTools = window.ControlerReminders || reminderTools || null;
    return reminderTools;
  }

  function ensureTodoReminderRuntimeLoaded() {
    const availableTools = getReminderTools();
    if (availableTools) {
      return Promise.resolve(availableTools);
    }
    if (todoReminderRuntimePromise) {
      return todoReminderRuntimePromise;
    }
    if (typeof uiTools?.loadScriptOnce !== "function") {
      todoReminderRuntimePromise = Promise.resolve(getReminderTools());
      return todoReminderRuntimePromise;
    }
    todoReminderRuntimePromise = Promise.resolve(
      uiTools.loadScriptOnce("reminders.js"),
    )
      .catch((error) => {
        console.error("加载待办提醒脚本失败:", error);
      })
      .then(() => {
        reminderTools = window.ControlerReminders || reminderTools || null;
        return reminderTools;
      });
    return todoReminderRuntimePromise;
  }

  function getLocalDateText(dateValue = new Date()) {
    const date =
      dateValue instanceof Date
        ? new Date(dateValue.getTime())
        : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeCheckinLifecycleStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "stopped" ||
      normalized === "paused" ||
      normalized === "已停止"
    ) {
      return "stopped";
    }
    if (normalized === "ended" || normalized === "结束") {
      return "ended";
    }
    return "in_progress";
  }

  function getCheckinStatusLabel(status) {
    switch (normalizeCheckinLifecycleStatus(status)) {
      case "stopped":
        return "已停止";
      case "ended":
        return "结束";
      case "in_progress":
      default:
        return "进行中";
    }
  }

  function readPersistedCheckinStatusFilter() {
    try {
      return normalizeCheckinLifecycleStatus(
        localStorage.getItem(CHECKIN_STATUS_FILTER_STORAGE_KEY) || "",
      );
    } catch (error) {
      console.error("读取打卡状态筛选设置失败:", error);
      return "in_progress";
    }
  }

  function persistCheckinStatusFilter(value) {
    const normalized = normalizeCheckinLifecycleStatus(value);
    currentCheckinStatusFilter = normalized;
    try {
      localStorage.setItem(CHECKIN_STATUS_FILTER_STORAGE_KEY, normalized);
    } catch (error) {
      console.error("保存打卡状态筛选设置失败:", error);
    }
    return normalized;
  }

  function normalizeCheckinTitleKey(title) {
    return String(title || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("zh-CN");
  }

  function isCheckinItemDeleted(item) {
    return !!String(item?.deletedAt || "").trim();
  }

  function getCheckinItemEffectiveStatus(
    item,
    todayText = getLocalDateText(),
  ) {
    if (!item || isCheckinItemDeleted(item)) {
      return "deleted";
    }
    const storedStatus = normalizeCheckinLifecycleStatus(item.status);
    if (storedStatus === "ended" || storedStatus === "stopped") {
      return storedStatus;
    }
    const endDate = String(item?.endDate || "").trim();
    if (endDate && todayText && todayText >= endDate) {
      return "stopped";
    }
    return "in_progress";
  }

  function isCheckinItemActive(item, todayText = getLocalDateText()) {
    return getCheckinItemEffectiveStatus(item, todayText) === "in_progress";
  }

  function getCheckinModalDefaultStatus(item, options = {}) {
    const forcedStatus =
      typeof options?.forcedStatus === "string" && options.forcedStatus.trim()
        ? normalizeCheckinLifecycleStatus(options.forcedStatus)
        : "";
    if (forcedStatus) {
      return forcedStatus;
    }
    if (options?.resumeMode === true) {
      return item
        ? getCheckinItemEffectiveStatus(item) === "ended"
          ? "ended"
          : "stopped"
        : "stopped";
    }
    return item ? getCheckinItemEffectiveStatus(item) : "in_progress";
  }

  function createCheckinScheduleRange(
    sourceLike = {},
    options = {},
  ) {
    const nowIso = new Date().toISOString();
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime: sourceLike?.startTime,
      endTime: sourceLike?.endTime,
    });
    const repeatType = normalizeTodoRepeatType(sourceLike?.repeatType || "daily");
    const startDate =
      String(
        sourceLike?.startDate ||
          options?.defaultStartDate ||
          getLocalDateText(),
      ).trim() || getLocalDateText();
    let endDate = String(sourceLike?.endDate || "").trim();
    const closedDate = String(options?.closedDate || "").trim();
    if (closedDate && (!endDate || endDate > closedDate)) {
      endDate = closedDate;
    }
    return {
      id:
        String(sourceLike?.rangeId || sourceLike?.scheduleRangeId || "").trim() ||
        `checkin-range-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      startDate,
      endDate,
      repeatType,
      repeatWeekdays:
        repeatType === "weekly"
          ? (Array.isArray(sourceLike?.repeatWeekdays)
              ? sourceLike.repeatWeekdays
              : []
            )
              .map((day) => parseInt(day, 10))
              .filter((day) => day >= 0 && day <= 6)
          : [],
      repeatMonthDays:
        repeatType === "monthly"
          ? normalizeTodoMonthDayList(sourceLike?.repeatMonthDays)
          : [],
      startTime: normalizedTimeRange.startTime,
      endTime: normalizedTimeRange.endTime,
      notification: normalizeCheckinNotificationConfig(
        sourceLike?.notification,
        {
          ...sourceLike,
          startDate,
          repeatType,
        },
      ),
      createdAt:
        String(sourceLike?.createdAt || "").trim() ||
        nowIso,
      updatedAt:
        String(sourceLike?.updatedAt || sourceLike?.createdAt || "").trim() ||
        nowIso,
    };
  }

  function dedupeCheckinScheduleRangesByStartDate(
    ranges = [],
    referenceDate = getLocalDateText(),
  ) {
    const normalizedRanges = Array.isArray(ranges) ? ranges : [];
    const checkinScheduleUtils = window.ControlerCheckinScheduleUtils;
    if (typeof checkinScheduleUtils?.getDisplayRanges === "function") {
      return checkinScheduleUtils
        .getDisplayRanges(
          {
            scheduleRanges: normalizedRanges,
          },
          {
            referenceDate,
          },
        )
        .map((rangeLike) => {
          const sourceIndex = Number.isInteger(rangeLike?.sourceIndex)
            ? rangeLike.sourceIndex
            : -1;
          const sourceRange =
            sourceIndex >= 0 ? normalizedRanges[sourceIndex] : null;
          return sourceRange && typeof sourceRange === "object"
            ? {
                ...sourceRange,
                startDate:
                  String(rangeLike?.startDate || sourceRange.startDate || "").trim(),
                endDate: String(rangeLike?.endDate || sourceRange.endDate || "").trim(),
              }
            : createCheckinScheduleRange(rangeLike, {
                defaultStartDate: rangeLike?.startDate || getLocalDateText(),
              });
        })
        .filter((rangeLike) => !!String(rangeLike?.startDate || "").trim())
        .sort((left, right) =>
          String(left?.startDate || "").localeCompare(String(right?.startDate || "")),
        );
    }

    const groupedByStartDate = new Map();
    normalizedRanges.forEach((rangeLike, sourceIndex) => {
      const nextRange = {
        ...(rangeLike && typeof rangeLike === "object" ? rangeLike : {}),
        sourceIndex,
      };
      const startDate = String(nextRange?.startDate || "").trim();
      if (!startDate) {
        return;
      }
      const endDate = String(nextRange?.endDate || "").trim();
      const currentRange = groupedByStartDate.get(startDate) || null;
      const nextIsOngoing = !endDate || referenceDate < endDate;
      const currentEndDate = String(currentRange?.endDate || "").trim();
      const currentIsOngoing =
        !currentEndDate || referenceDate < currentEndDate;
      if (!currentRange) {
        groupedByStartDate.set(startDate, nextRange);
        return;
      }
      if (nextIsOngoing !== currentIsOngoing) {
        if (nextIsOngoing) {
          groupedByStartDate.set(startDate, nextRange);
        }
        return;
      }
      if (endDate !== currentEndDate) {
        if ((endDate || "9999-12-31") > (currentEndDate || "9999-12-31")) {
          groupedByStartDate.set(startDate, nextRange);
        }
        return;
      }
      if ((nextRange.sourceIndex || 0) >= (currentRange.sourceIndex || 0)) {
        groupedByStartDate.set(startDate, nextRange);
      }
    });
    return Array.from(groupedByStartDate.values())
      .map((rangeLike) => {
        const nextRange = {
          ...rangeLike,
        };
        delete nextRange.sourceIndex;
        return nextRange;
      })
      .sort((left, right) =>
        String(left?.startDate || "").localeCompare(String(right?.startDate || "")),
      );
  }

  function normalizeCheckinScheduleRanges(
    ranges = [],
    fallbackSource = null,
  ) {
    const sourceRanges = Array.isArray(ranges) ? ranges : [];
    const normalized = sourceRanges
      .map((range) =>
        createCheckinScheduleRange(
          {
            ...(fallbackSource && typeof fallbackSource === "object"
              ? fallbackSource
              : {}),
            ...(range && typeof range === "object" ? range : {}),
          },
          {
            defaultStartDate:
              fallbackSource?.startDate || getLocalDateText(),
          },
        ),
      )
      .filter((range) => !!String(range?.startDate || "").trim());

    if (normalized.length > 0) {
      return dedupeCheckinScheduleRangesByStartDate(normalized);
    }

    if (
      fallbackSource &&
      typeof fallbackSource === "object" &&
      String(fallbackSource?.startDate || "").trim()
    ) {
      return [
        createCheckinScheduleRange(fallbackSource, {
          defaultStartDate: fallbackSource.startDate,
        }),
      ];
    }

    return [];
  }

  function closeCheckinScheduleRanges(item, closedDate = getLocalDateText()) {
    if (!item || !Array.isArray(item.scheduleRanges)) {
      return;
    }
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges,
      item,
    );
    if (!item.scheduleRanges.length) {
      return;
    }
    item.scheduleRanges = item.scheduleRanges.map((range, index) => {
      if (index !== item.scheduleRanges.length - 1) {
        return range;
      }
      if (
        !range ||
        typeof range !== "object" ||
        !String(range.startDate || "").trim()
      ) {
        return range;
      }
      const nextRange = {
        ...range,
      };
      if (!nextRange.endDate || nextRange.endDate > closedDate) {
        nextRange.endDate = closedDate;
      }
      nextRange.updatedAt = new Date().toISOString();
      return nextRange;
    });
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges,
      item,
    );
  }

  function appendCheckinScheduleRange(item, sourceLike = {}, options = {}) {
    if (!item || typeof item !== "object") {
      return;
    }
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges,
      item,
    );
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges.concat(
        createCheckinScheduleRange(sourceLike, {
          defaultStartDate: sourceLike?.startDate || getLocalDateText(),
          closedDate: options?.closedDate,
        }),
      ),
      item,
    );
  }

  function syncCheckinScheduleRangeForCurrentConfig(
    item,
    sourceLike = {},
    options = {},
  ) {
    if (!item || typeof item !== "object") {
      return;
    }
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges,
      item,
    );
    const nextRange = createCheckinScheduleRange(sourceLike, {
      defaultStartDate: sourceLike?.startDate || item.startDate || getLocalDateText(),
      closedDate: options?.closedDate,
    });
    if (item.scheduleRanges.length === 0) {
      item.scheduleRanges = [nextRange];
      return;
    }
    item.scheduleRanges[item.scheduleRanges.length - 1] = {
      ...item.scheduleRanges[item.scheduleRanges.length - 1],
      ...nextRange,
      id:
        String(item.scheduleRanges[item.scheduleRanges.length - 1]?.id || "").trim() ||
        nextRange.id,
    };
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      item.scheduleRanges,
      item,
    );
  }

  function getCheckinItemVisibleDateRanges(item) {
    const checkinScheduleUtils = window.ControlerCheckinScheduleUtils;
    if (typeof checkinScheduleUtils?.getDisplayLabels === "function") {
      return checkinScheduleUtils.getDisplayLabels(item, {
        referenceDate: getLocalDateText(),
        formatDate: formatCheckinRangeDateText,
      });
    }

    const ranges = normalizeCheckinScheduleRanges(item?.scheduleRanges, item);
    const todayText = getLocalDateText();
    return ranges
      .map((range) => {
        const startDate = String(range?.startDate || "").trim();
        if (!startDate) {
          return "";
        }
        const endDate = String(range?.endDate || "").trim();
        const showEndDate = !!endDate && todayText >= endDate;
        const startLabel = formatCheckinRangeDateText(startDate);
        const endLabel = showEndDate ? formatCheckinRangeDateText(endDate) : "";
        return endLabel ? `${startLabel}—${endLabel}` : startLabel;
      })
      .filter(Boolean);
  }

  function formatCheckinRangeDateText(dateText) {
    const parsed = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) {
      return String(dateText || "").trim();
    }
    return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  }

  function createCheckinOccurrenceScheduleContext(item = null) {
    const includedDates = getTodoIncludedDateList(item);
    return {
      scheduleRanges: normalizeCheckinScheduleRanges(item?.scheduleRanges, item),
      includedDates,
      includedDateSet: new Set(includedDates),
      scheduledCache: new Map(),
    };
  }

  function resolveCheckinOccurrenceScheduleContext(item = null, context = null) {
    if (
      context &&
      Array.isArray(context.scheduleRanges) &&
      Array.isArray(context.includedDates) &&
      context.includedDateSet instanceof Set &&
      context.scheduledCache instanceof Map
    ) {
      return context;
    }
    return createCheckinOccurrenceScheduleContext(item);
  }

  function findCheckinScheduleRangeForDate(
    item = null,
    dateText = "",
    context = null,
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return null;
    }
    const resolvedContext = resolveCheckinOccurrenceScheduleContext(item, context);
    let matchedRange = null;
    resolvedContext.scheduleRanges.forEach((rangeLike) => {
      const startDate = normalizeTodoOccurrenceDateKey(rangeLike?.startDate);
      const endDate = normalizeTodoOccurrenceDateKey(rangeLike?.endDate);
      if (!startDate || normalizedDate < startDate) {
        return;
      }
      if (endDate && normalizedDate >= endDate) {
        return;
      }
      if (
        !matchedRange ||
        startDate > normalizeTodoOccurrenceDateKey(matchedRange?.startDate)
      ) {
        matchedRange = rangeLike;
      }
    });
    return matchedRange;
  }

  function isCheckinOccurrenceScheduledOnDate(
    item = null,
    dateText = "",
    context = null,
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    const resolvedContext = resolveCheckinOccurrenceScheduleContext(item, context);
    if (resolvedContext.scheduledCache.has(normalizedDate)) {
      return resolvedContext.scheduledCache.get(normalizedDate) === true;
    }

    let scheduled = false;
    if (resolvedContext.includedDateSet.has(normalizedDate)) {
      scheduled = true;
    } else {
      const matchedRange = findCheckinScheduleRangeForDate(
        item,
        normalizedDate,
        resolvedContext,
      );
      if (matchedRange) {
        const parsedDate = parseTodoOccurrenceDateKey(normalizedDate);
        if (parsedDate instanceof Date) {
          const repeatType = normalizeTodoRepeatType(
            matchedRange?.repeatType || item?.repeatType || "daily",
          );
          if (repeatType === "weekly") {
            scheduled = (Array.isArray(matchedRange?.repeatWeekdays)
              ? matchedRange.repeatWeekdays
              : []
            ).includes(parsedDate.getDay());
          } else if (repeatType === "monthly") {
            scheduled = normalizeTodoMonthDayList(
              matchedRange?.repeatMonthDays,
            ).includes(parsedDate.getDate());
          } else {
            scheduled = true;
          }
        }
      }
    }

    resolvedContext.scheduledCache.set(normalizedDate, scheduled);
    return scheduled;
  }

  function mergeCheckinScheduleRanges(targetItem, sourceItem) {
    const merged = [
      ...normalizeCheckinScheduleRanges(targetItem?.scheduleRanges, targetItem),
      ...normalizeCheckinScheduleRanges(sourceItem?.scheduleRanges, sourceItem),
    ];
    const deduped = new Map();
    merged.forEach((range) => {
      const key = [
        String(range?.startDate || "").trim(),
        String(range?.endDate || "").trim(),
        String(range?.repeatType || "").trim(),
        Array.isArray(range?.repeatWeekdays)
          ? range.repeatWeekdays.join(",")
          : "",
        Array.isArray(range?.repeatMonthDays)
          ? range.repeatMonthDays.join(",")
          : "",
        String(range?.startTime || "").trim(),
        String(range?.endTime || "").trim(),
      ].join("|");
      if (key) {
        deduped.set(key, range);
      }
    });
    targetItem.scheduleRanges = normalizeCheckinScheduleRanges(
      Array.from(deduped.values()),
      targetItem,
    );
  }

  function mergeCheckinItemOccurrenceState(targetItem, sourceItem) {
    if (!targetItem || !sourceItem) {
      return targetItem || sourceItem || null;
    }
    targetItem.includedDates = normalizePlanDateListForTodo([
      ...(Array.isArray(targetItem?.includedDates) ? targetItem.includedDates : []),
      ...(Array.isArray(sourceItem?.includedDates) ? sourceItem.includedDates : []),
    ]);
    const targetLastResolved = normalizeTodoOccurrenceDateKey(
      targetItem?.lastResolvedOccurrenceDate,
    );
    const sourceLastResolved = normalizeTodoOccurrenceDateKey(
      sourceItem?.lastResolvedOccurrenceDate,
    );
    targetItem.lastResolvedOccurrenceDate =
      sourceLastResolved && (!targetLastResolved || sourceLastResolved > targetLastResolved)
        ? sourceLastResolved
        : targetLastResolved;
    return targetItem;
  }

  function mergeDailyCheckinsByItemIdInList(
    entryList = [],
    targetItemId = "",
    sourceItemId = "",
  ) {
    const normalizedTargetItemId = String(targetItemId || "").trim();
    const normalizedSourceItemId = String(sourceItemId || "").trim();
    const sourceEntries = Array.isArray(entryList) ? entryList : [];
    if (
      !normalizedTargetItemId ||
      !normalizedSourceItemId ||
      normalizedTargetItemId === normalizedSourceItemId
    ) {
      return {
        items: sourceEntries.map((entry) => ({ ...(entry || {}) })),
        changed: false,
        mergedCount: 0,
      };
    }

    const groupedByDate = new Map();
    const remaining = [];
    let mergedCount = 0;
    sourceEntries.forEach((entry) => {
      const entryItemId = String(entry?.itemId || "").trim();
      if (
        entryItemId !== normalizedTargetItemId &&
        entryItemId !== normalizedSourceItemId
      ) {
        remaining.push({
          ...(entry || {}),
        });
        return;
      }
      const date = String(entry?.date || "").trim();
      if (!date) {
        if (entryItemId === normalizedSourceItemId) {
          mergedCount += 1;
        }
        return;
      }
      if (entryItemId === normalizedSourceItemId) {
        mergedCount += 1;
      }
      const normalizedEntry = {
        ...(entry || {}),
        itemId: normalizedTargetItemId,
      };
      const existing = groupedByDate.get(date);
      if (!existing) {
        groupedByDate.set(date, normalizedEntry);
        return;
      }
      const existingTimestamp = getTodoCheckinEntryTimestamp(existing);
      const nextTimestamp = getTodoCheckinEntryTimestamp(normalizedEntry);
      groupedByDate.set(
        date,
        {
          ...(nextTimestamp >= existingTimestamp ? normalizedEntry : existing),
          itemId: normalizedTargetItemId,
          checked: !!existing.checked || !!normalizedEntry.checked,
        },
      );
    });

    return {
      items: remaining.concat(
        Array.from(groupedByDate.values()).sort((left, right) =>
          String(left?.date || "").localeCompare(String(right?.date || "")),
        ),
      ),
      changed: mergedCount > 0,
      mergedCount,
    };
  }

  function mergeDailyCheckinsByItemId(targetItemId, sourceItemId) {
    const mergeResult = mergeDailyCheckinsByItemIdInList(
      dailyCheckins,
      targetItemId,
      sourceItemId,
    );
    dailyCheckins = mergeResult.items;
    return mergeResult;
  }

  function canDeletedCheckinItemBeRevived(item, lookup = null) {
    if (!isCheckinItemDeleted(item)) {
      return false;
    }
    return getCheckedTodoDailyCheckinDates(item?.id, lookup).size > 0;
  }

  function findReusableDeletedCheckinItemByTitle(title = "", excludeId = "") {
    const titleKey = normalizeCheckinTitleKey(title);
    if (!titleKey) {
      return null;
    }
    const dailyCheckinLookup = createTodoDailyCheckinLookup();
    return (
      checkinItems
        .slice()
        .reverse()
        .find(
          (item) =>
            !String(item?.mergedIntoId || "").trim() &&
            !matchesId(item?.id, excludeId) &&
            canDeletedCheckinItemBeRevived(item, dailyCheckinLookup) &&
            normalizeCheckinTitleKey(item?.title) === titleKey,
        ) || null
    );
  }

  function findLiveCheckinItemByTitle(title = "", excludeId = "") {
    const titleKey = normalizeCheckinTitleKey(title);
    if (!titleKey) {
      return null;
    }
    return (
      checkinItems.find(
        (item) =>
          !matchesId(item?.id, excludeId) &&
          !isCheckinItemDeleted(item) &&
          normalizeCheckinTitleKey(item?.title) === titleKey,
      ) || null
    );
  }

  function getVisibleCheckinItems() {
    return checkinItems.filter((item) => !isCheckinItemDeleted(item));
  }

  function getFilteredCheckinItems() {
    const todayText = getLocalDateText();
    return getVisibleCheckinItems().filter(
      (item) =>
        getCheckinItemEffectiveStatus(item, todayText) ===
        currentCheckinStatusFilter,
    );
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
    modal
      ?.querySelectorAll?.("input, textarea, select")
      ?.forEach?.((control) => {
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
    const dispatchControlEvents = (control, eventNames = []) => {
      if (!(control instanceof HTMLElement)) {
        return;
      }
      eventNames.forEach((eventName) => {
        control.dispatchEvent(new Event(eventName, { bubbles: true }));
      });
    };
    Object.keys(source).forEach((key) => {
      const idSelector = `#${escapeTodoSelectorValue(key)}`;
      const namedControls = Array.from(
        modal?.querySelectorAll?.(`[name="${escapeTodoSelectorValue(key)}"]`) ||
          [],
      );
      const controlById = modal?.querySelector?.(idSelector) || null;
      if (namedControls.length && namedControls[0]?.type === "radio") {
        const changedControls = [];
        namedControls.forEach((control) => {
          const nextChecked = String(control.value) === String(source[key] ?? "");
          if (!!control.checked === nextChecked) {
            return;
          }
          control.checked = nextChecked;
          changedControls.push(control);
        });
        changedControls.forEach((control) => {
          dispatchControlEvents(control, ["change"]);
        });
        return;
      }
      if (
        namedControls.length > 1 &&
        namedControls[0]?.type === "checkbox" &&
        Array.isArray(source[key])
      ) {
        const selectedValues = new Set(
          source[key].map((value) => String(value)),
        );
        const changedControls = [];
        namedControls.forEach((control) => {
          const nextChecked = selectedValues.has(String(control.value));
          if (!!control.checked === nextChecked) {
            return;
          }
          control.checked = nextChecked;
          changedControls.push(control);
        });
        changedControls.forEach((control) => {
          dispatchControlEvents(control, ["change"]);
        });
        return;
      }
      const targetControl = controlById || namedControls[0] || null;
      if (!targetControl) {
        return;
      }
      let didChange = false;
      if (targetControl.type === "checkbox") {
        const nextChecked = !!source[key];
        if (!!targetControl.checked !== nextChecked) {
          targetControl.checked = nextChecked;
          didChange = true;
        }
      } else {
        const nextValue = source[key] ?? "";
        if (String(targetControl.value ?? "") !== String(nextValue)) {
          targetControl.value = nextValue;
          didChange = true;
        }
      }
      if (!didChange) {
        return;
      }
      dispatchControlEvents(targetControl, ["input", "change"]);
    });
  }

  function createTodoModalDraftSession(modal, draftKey, scope = "todo") {
    let timer = 0;
    let persistenceActive = false;
    const registeredControls = [];
    const initialFieldsSignature = JSON.stringify(
      captureTodoModalDraftFields(modal),
    );
    const scheduleSave = () => {
      if (!persistenceActive) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persistDraft();
      }, TODO_DRAFT_SAVE_DELAY_MS);
    };
    const bindFieldPersistence = () => {
      if (persistenceActive) {
        return true;
      }
      const controls = Array.from(
        modal?.querySelectorAll?.("input, textarea, select") || [],
      );
      controls.forEach((control) => {
        if (!(control instanceof HTMLElement)) {
          return;
        }
        control.addEventListener("input", scheduleSave);
        control.addEventListener("change", scheduleSave);
        registeredControls.push(control);
      });
      persistenceActive = true;
      return true;
    };
    const unbindFieldPersistence = () => {
      registeredControls.splice(0).forEach((control) => {
        control.removeEventListener("input", scheduleSave);
        control.removeEventListener("change", scheduleSave);
      });
      persistenceActive = false;
    };
    const persistDraft = async () => {
      if (
        !modal?.isConnected ||
        typeof window.ControlerStorage?.setDraft !== "function"
      ) {
        return;
      }
      const fields = captureTodoModalDraftFields(modal);
      if (JSON.stringify(fields) === initialFieldsSignature) {
        if (typeof window.ControlerStorage?.removeDraft === "function") {
          await window.ControlerStorage.removeDraft(draftKey);
        }
        return;
      }
      await window.ControlerStorage.setDraft(
        draftKey,
        {
          fields,
        },
        {
          scope,
        },
      );
    };
    const handlePageHide = () => {
      void persistDraft();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void persistDraft();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return {
      activate() {
        return bindFieldPersistence();
      },
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
        unbindFieldPersistence();
        window.removeEventListener("pagehide", handlePageHide);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
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
    dailyCheckins = hydrateTodoCollection(
      "dailyCheckins",
      snapshot.dailyCheckins,
    );
    checkinHistorySummary =
      window.ControlerStorage?.isNativeApp === true ||
      hasCheckinHistorySummaryCoverage(
        snapshot?.checkinHistorySummary,
        checkinItems,
      )
        ? normalizeCheckinHistorySummary(snapshot.checkinHistorySummary)
        : buildCheckinHistorySummaryFromEntries(dailyCheckins, {
            items: checkinItems,
          });
    checkins = hydrateTodoCollection("checkins", snapshot.checkins);
    todoLoadedSectionPeriods.dailyCheckins = new Set(
      getTodoSectionPeriodIds("dailyCheckins", dailyCheckins),
    );
    todoLoadedSectionPeriods.checkins = new Set(
      getTodoSectionPeriodIds("checkins", checkins),
    );
    invalidateTodoDerivedCaches();
  }

  function isTodoSerializableEqual(left, right) {
    if (typeof uiTools?.isSerializableEqual === "function") {
      return uiTools.isSerializableEqual(left, right);
    }
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch (error) {
      return false;
    }
  }

  function buildTodoWorkspacePerfDetail(
    snapshot = captureTodoWorkspaceSnapshot(),
  ) {
    const source =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? snapshot
        : captureTodoWorkspaceSnapshot();
    return {
      todoCount: Array.isArray(source.todos) ? source.todos.length : 0,
      checkinItemCount: Array.isArray(source.checkinItems)
        ? source.checkinItems.length
        : 0,
      checkinHistorySummaryCount:
        source?.checkinHistorySummary &&
        typeof source.checkinHistorySummary === "object" &&
        !Array.isArray(source.checkinHistorySummary)
          ? Object.keys(source.checkinHistorySummary).length
          : 0,
      dailyCheckinCount: Array.isArray(source.dailyCheckins)
        ? source.dailyCheckins.length
        : 0,
      recentCheckinCount: Array.isArray(source.checkins)
        ? source.checkins.length
        : 0,
    };
  }

  function hasTodoWorkspaceSnapshotChanged(nextSnapshot = {}) {
    const currentSnapshot = captureTodoWorkspaceSnapshot();
    const normalizedNextSnapshot = mergeTodoWorkspaceSnapshot(
      nextSnapshot,
      currentSnapshot,
    );
    return !isTodoSerializableEqual(normalizedNextSnapshot, currentSnapshot);
  }

  function markTodoInitialDataReady(snapshot = captureTodoWorkspaceSnapshot()) {
    const perfDetail = buildTodoWorkspacePerfDetail(snapshot);
    uiTools?.markPerfStage?.("first-data-ready", perfDetail);
    uiTools?.markPerfStage?.("todo-snapshot-data-ready", perfDetail);
  }

  function bootstrapTodoFromCachedSnapshot() {
    const bootstrapSnapshot = readTodoWorkspaceSnapshotFromPageBootstrap();
    const snapshot = bootstrapSnapshot || readTodoWorkspaceSnapshot();
    applyTodoWorkspaceSnapshot(snapshot);
    todoInitialDataLoaded = true;
    todoInitialDataValidated =
      window.ControlerStorage?.isNativeApp === true && !!bootstrapSnapshot;
    todoBootstrappedFromPageBootstrap = !!bootstrapSnapshot;
    return snapshot;
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
    const readObject = (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    };
    return {
      todos: readArray("todos"),
      checkinItems: readArray("checkinItems"),
      checkinHistorySummary: readObject("checkinHistorySummary"),
      dailyCheckins: readArray("dailyCheckins"),
      checkins: readArray("checkins"),
      __hasMirror:
        localStorage.getItem("todos") !== null ||
        localStorage.getItem("checkinItems") !== null ||
        localStorage.getItem("checkinHistorySummary") !== null ||
        localStorage.getItem("dailyCheckins") !== null ||
        localStorage.getItem("checkins") !== null,
    };
  }

  function readTodoWorkspaceSnapshotFromManagedStorage() {
    try {
      const getStateValue = window.ControlerStorage?.getStateValue;
      const snapshot =
        typeof getStateValue === "function"
          ? {
              todos: getStateValue("todos"),
              checkinItems: getStateValue("checkinItems"),
              checkinHistorySummary: getStateValue("checkinHistorySummary"),
              dailyCheckins: getStateValue("dailyCheckins"),
              checkins: getStateValue("checkins"),
            }
          : typeof window.ControlerStorage?.dump === "function"
            ? window.ControlerStorage.dump()
            : null;
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot)
      ) {
        return null;
      }
      return {
        todos: Array.isArray(snapshot.todos) ? snapshot.todos : [],
        checkinItems: Array.isArray(snapshot.checkinItems)
          ? snapshot.checkinItems
          : [],
        checkinHistorySummary:
          snapshot?.checkinHistorySummary &&
          typeof snapshot.checkinHistorySummary === "object" &&
          !Array.isArray(snapshot.checkinHistorySummary)
            ? snapshot.checkinHistorySummary
            : {},
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
      if (
        typeof window.ControlerStorage?.peekPageBootstrapState !== "function"
      ) {
        return null;
      }
      const bootstrap = window.ControlerStorage.peekPageBootstrapState("todo");
      const data =
        bootstrap?.data && typeof bootstrap.data === "object"
          ? bootstrap.data
          : null;
      if (!data) {
        return null;
      }
      return mergeTodoWorkspaceSnapshot({
        todos: Array.isArray(data.todos) ? data.todos : [],
        checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
        checkinHistorySummary:
          data?.checkinHistorySummary &&
          typeof data.checkinHistorySummary === "object" &&
          !Array.isArray(data.checkinHistorySummary)
            ? data.checkinHistorySummary
            : {},
        dailyCheckins: Array.isArray(data.todayDailyCheckins)
          ? data.todayDailyCheckins
          : [],
        checkins: Array.isArray(data.recentCheckins) ? data.recentCheckins : [],
      });
    } catch (error) {
      console.error("读取待办页引导快照失败，回退旧快照:", error);
      return null;
    }
  }

  function mergeTodoBootstrapSnapshotWithAuthoritativeCore(
    bootstrapSnapshot = null,
    authoritativeSnapshot = null,
  ) {
    if (
      !bootstrapSnapshot ||
      typeof bootstrapSnapshot !== "object" ||
      Array.isArray(bootstrapSnapshot)
    ) {
      return null;
    }
    const normalizedBootstrap = mergeTodoWorkspaceSnapshot(bootstrapSnapshot);
    if (
      !authoritativeSnapshot ||
      typeof authoritativeSnapshot !== "object" ||
      Array.isArray(authoritativeSnapshot)
    ) {
      return normalizedBootstrap;
    }
    const normalizedAuthoritative = mergeTodoWorkspaceSnapshot(
      authoritativeSnapshot,
      normalizedBootstrap,
    );
    const mergedDailyCheckins = (() => {
      const latestByItemDate = new Map();
      const mergeSource = (items = [], sourceRank = 0) => {
        (Array.isArray(items) ? items : []).forEach((entry) => {
          const itemId = String(entry?.itemId || "").trim();
          const dateKey = normalizeTodoOccurrenceDateKey(entry?.date);
          if (!itemId || !dateKey) {
            return;
          }
          const key = `${itemId}::${dateKey}`;
          const candidate = {
            entry: {
              ...(entry || {}),
              itemId,
              date: dateKey,
            },
            timestamp: getTodoCheckinEntryTimestamp(entry),
            sourceRank,
          };
          const current = latestByItemDate.get(key);
          if (
            !current ||
            candidate.timestamp > current.timestamp ||
            (candidate.timestamp === current.timestamp &&
              candidate.sourceRank > current.sourceRank)
          ) {
            latestByItemDate.set(key, candidate);
          }
        });
      };
      mergeSource(normalizedBootstrap.dailyCheckins, 0);
      mergeSource(normalizedAuthoritative.dailyCheckins, 1);
      return Array.from(latestByItemDate.values())
        .map((candidate) => candidate.entry)
        .sort((left, right) =>
          `${String(left?.date || "").trim()}::${String(left?.itemId || "").trim()}`.localeCompare(
            `${String(right?.date || "").trim()}::${String(right?.itemId || "").trim()}`,
          ),
        );
    })();
    return {
      ...normalizedBootstrap,
      todos: cloneTodoValue(normalizedAuthoritative.todos),
      checkinItems: cloneTodoValue(normalizedAuthoritative.checkinItems),
      checkinHistorySummary: normalizeCheckinHistorySummary(
        normalizedAuthoritative.checkinHistorySummary ||
          normalizedBootstrap.checkinHistorySummary ||
          {},
      ),
      dailyCheckins: mergedDailyCheckins,
      checkins:
        Array.isArray(normalizedBootstrap.checkins) &&
        normalizedBootstrap.checkins.length > 0
          ? cloneTodoValue(normalizedBootstrap.checkins)
          : cloneTodoValue(normalizedAuthoritative.checkins),
    };
  }

  function readTodoWorkspaceSnapshot() {
    const localSnapshot = readTodoWorkspaceSnapshotFromLocalStorage();
    const localMirrorSnapshot = localSnapshot?.__hasMirror
      ? mergeTodoWorkspaceSnapshot(localSnapshot)
      : null;
    const managedSnapshot = readTodoWorkspaceSnapshotFromManagedStorage();
    const bootstrapSnapshot = readTodoWorkspaceSnapshotFromPageBootstrap();
    if (bootstrapSnapshot) {
      const effectiveBootstrapSnapshot =
        window.ControlerStorage?.isNativeApp === true
          ? mergeTodoBootstrapSnapshotWithAuthoritativeCore(
              bootstrapSnapshot,
              managedSnapshot || localMirrorSnapshot || localSnapshot,
            )
          : bootstrapSnapshot;
      return (
        restoreTodoCoreFromFallbackSnapshot(
          effectiveBootstrapSnapshot,
          localMirrorSnapshot || managedSnapshot || localSnapshot,
        ) || mergeTodoWorkspaceSnapshot(effectiveBootstrapSnapshot)
      );
    }
    if (window.ControlerStorage?.isNativeApp) {
      return (
        restoreTodoCoreFromFallbackSnapshot(
          managedSnapshot,
          localMirrorSnapshot || localSnapshot,
        ) ||
        localMirrorSnapshot ||
        mergeTodoWorkspaceSnapshot(localSnapshot)
      );
    }
    if (localMirrorSnapshot) {
      return localMirrorSnapshot;
    }
    return (
      restoreTodoCoreFromFallbackSnapshot(
        managedSnapshot,
        mergeTodoWorkspaceSnapshot(localSnapshot),
      ) || mergeTodoWorkspaceSnapshot(localSnapshot)
    );
  }

  async function readFreshTodoWorkspaceSnapshot(options = {}) {
    if (typeof window.ControlerStorage?.getPageBootstrapState !== "function") {
      return readTodoWorkspaceSnapshot();
    }
    try {
      const pageBootstrap = await window.ControlerStorage.getPageBootstrapState(
        "todo",
        {
          fresh: options?.fresh === true,
        },
      );
      const data =
        pageBootstrap?.data && typeof pageBootstrap.data === "object"
          ? pageBootstrap.data
          : null;
      if (!data) {
        throw new Error("missing todo bootstrap data");
      }
      const bootstrapSnapshot = mergeTodoWorkspaceSnapshot({
        todos: Array.isArray(data.todos) ? data.todos : [],
        checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
        checkinHistorySummary:
          data?.checkinHistorySummary &&
          typeof data.checkinHistorySummary === "object" &&
          !Array.isArray(data.checkinHistorySummary)
            ? data.checkinHistorySummary
            : {},
        dailyCheckins: Array.isArray(data.todayDailyCheckins)
          ? data.todayDailyCheckins
          : [],
        checkins: Array.isArray(data.recentCheckins) ? data.recentCheckins : [],
      });
      if (window.ControlerStorage?.isNativeApp === true) {
        return (
          mergeTodoBootstrapSnapshotWithAuthoritativeCore(
            bootstrapSnapshot,
            readTodoWorkspaceSnapshotFromManagedStorage() ||
              readTodoWorkspaceSnapshotFromLocalStorage(),
          ) || bootstrapSnapshot
        );
      }
      return bootstrapSnapshot;
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
    params.delete("widgetTargetId");
    params.delete("widgetCreatedAt");
    const queryText = params.toString();
    const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
    return true;
  }

  function waitForTodoStorageReady() {
    if (
      window.ControlerStorage?.isNativeApp === true &&
      (
        typeof window.ControlerStorage?.getPageBootstrapState === "function" ||
        typeof window.ControlerStorage?.loadSectionRange === "function"
      )
    ) {
      return Promise.resolve(true);
    }
    if (typeof window.ControlerStorage?.whenReady !== "function") {
      return Promise.resolve(true);
    }
    return window.ControlerStorage.whenReady().catch((error) => {
      console.error("等待待办页原生存储就绪失败，继续使用当前快照:", error);
      return false;
    });
  }

  function getTodoLoadingOverlayElement() {
    return document.getElementById("todo-loading-overlay");
  }

  function getTodoLoadingOverlayController() {
    if (todoLoadingOverlayController) {
      return todoLoadingOverlayController;
    }
    const overlay = getTodoLoadingOverlayElement();
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    todoLoadingOverlayController =
      uiTools?.createPageLoadingOverlayController?.({
        overlay,
        inlineHost: ".todo-main",
        scopeFullscreenToInlineHost: false,
      }) || null;
    return todoLoadingOverlayController;
  }

  function setTodoLoadingState(options = {}) {
    const overlay = getTodoLoadingOverlayElement();
    if (!(overlay instanceof HTMLElement)) {
      return Promise.resolve(false);
    }

    const {
      active = false,
      mode = "inline",
      title = "正在加载数据中",
      delayMs = 0,
      delegateToNative = true,
      message = mode === "fullscreen"
        ? "正在读取待办、打卡与今日进度，请稍候"
        : "正在同步待办与打卡数据，请稍候",
    } = options;
    const loadingController = getTodoLoadingOverlayController();
    if (!loadingController) {
      return Promise.resolve(false);
    }

    return loadingController.setState({
      active,
      mode,
      title,
      message,
      delayMs,
      delegateToNative,
    });
  }

  function waitForTodoUiPaint() {
    return new Promise((resolve) => {
      const schedule =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16);
      schedule(() => {
        window.setTimeout(resolve, 0);
      });
    });
  }

  const todoRefreshController = uiTools?.createAtomicRefreshController?.({
    defaultDelayMs: TODO_LOADING_OVERLAY_DELAY_MS,
    showLoading: (loadingOptions = {}) => {
      return setTodoLoadingState({
        active: true,
        ...loadingOptions,
      });
    },
    hideLoading: () => {
      return setTodoLoadingState({
        active: false,
      });
    },
  });

  function isTodoWidgetTargetVisible(action = "") {
    if (action === "open-create-todo") {
      const titleInput = document.getElementById("todo-title-input");
      return (
        todoPlanSidebarInitialized &&
        currentView === "todos" &&
        titleInput instanceof HTMLElement
      );
    }
    const expectedView = action === "show-checkins" ? "checkins" : "todos";
    return todoPlanSidebarInitialized && currentView === expectedView;
  }

  function getTodoSectionPeriodId(section, item) {
    if (typeof storageBundleApi?.getPeriodIdForSectionItem === "function") {
      return (
        storageBundleApi.getPeriodIdForSectionItem(section, item) || "undated"
      );
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
    const preservedItems = (
      Array.isArray(existingItems) ? existingItems : []
    ).filter(
      (item) => !targetPeriods.has(getTodoSectionPeriodId(section, item)),
    );
    return hydrateTodoCollection(section, [
      ...preservedItems,
      ...(incomingItems || []),
    ]);
  }

  function getTodoNormalizedChangedPeriods(changedPeriods = {}) {
    const source =
      changedPeriods &&
      typeof changedPeriods === "object" &&
      !Array.isArray(changedPeriods)
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

  function buildTodoStorageChangeSignature(
    changedSections = [],
    changedPeriods = {},
  ) {
    const normalizedSections =
      getTodoNormalizedChangedSections(changedSections);
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

  function markTodoSelfRefreshIgnored(
    changedSections = [],
    changedPeriods = {},
  ) {
    const signature = buildTodoStorageChangeSignature(
      changedSections,
      changedPeriods,
    );
    if (!signature) {
      return;
    }
    const now = Date.now();
    pruneTodoIgnoredRefreshEvents(now);
    todoIgnoredRefreshEvents.push({
      signature,
      expiresAt: now + TODO_SELF_REFRESH_IGNORE_WINDOW_MS,
      remainingUses: TODO_SELF_REFRESH_IGNORE_MAX_USES,
    });
  }

  function shouldIgnoreTodoSelfRefresh(detail = {}) {
    const source = String(detail?.source || "")
      .trim()
      .toLowerCase();
    if (source && !source.includes("renderer") && !source.includes("webview")) {
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
    const match = todoIgnoredRefreshEvents[matchIndex];
    if (
      !match ||
      !Number.isFinite(match.remainingUses) ||
      match.remainingUses <= 1
    ) {
      todoIgnoredRefreshEvents.splice(matchIndex, 1);
    } else {
      match.remainingUses -= 1;
    }
    return true;
  }

  function mergeTodoStorageChangeDetails(base = {}, detail = {}) {
    const normalizedBase =
      base && typeof base === "object" && !Array.isArray(base) ? base : {};
    const normalizedDetail =
      detail && typeof detail === "object" && !Array.isArray(detail)
        ? detail
        : {};
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
        typeof normalizedDetail.reason === "string" &&
        normalizedDetail.reason.trim()
          ? normalizedDetail.reason.trim()
          : typeof normalizedBase.reason === "string" &&
              normalizedBase.reason.trim()
            ? normalizedBase.reason.trim()
            : "",
      source:
        typeof normalizedDetail.source === "string" &&
        normalizedDetail.source.trim()
          ? normalizedDetail.source.trim()
          : typeof normalizedBase.source === "string" &&
              normalizedBase.source.trim()
            ? normalizedBase.source.trim()
            : "",
    };
  }

  function getTodoToggleCommitMap(kind) {
    return kind === "checkin"
      ? todoDeferredToggleCommits.checkin
      : todoDeferredToggleCommits.todo;
  }

  function collectTodoToggleCommitControllers(options = {}) {
    const normalizedKind =
      options?.kind === "checkin" || options?.kind === "todo"
        ? options.kind
        : "";
    const normalizedTargetId = String(options?.targetId || "").trim();
    const controllerEntries = [];
    const collectFromMap = (kind, commitMap) => {
      if (!(commitMap instanceof Map)) {
        return;
      }
      commitMap.forEach((controller, targetId) => {
        const normalizedControllerId = String(targetId || "").trim();
        if (!normalizedControllerId) {
          return;
        }
        if (
          normalizedTargetId &&
          normalizedControllerId !== normalizedTargetId
        ) {
          return;
        }
        controllerEntries.push({
          kind,
          targetId: normalizedControllerId,
          controller,
        });
      });
    };

    if (normalizedKind) {
      collectFromMap(normalizedKind, getTodoToggleCommitMap(normalizedKind));
      return controllerEntries;
    }

    collectFromMap("todo", todoDeferredToggleCommits.todo);
    collectFromMap("checkin", todoDeferredToggleCommits.checkin);
    return controllerEntries;
  }

  async function flushTodoDeferredToggleCommits(options = {}) {
    const controllerEntries = collectTodoToggleCommitControllers(options).filter(
      ({ controller }) =>
        controller &&
        (controller.pending === true ||
          controller.running === true ||
          Number(controller.timer) > 0),
    );
    if (!controllerEntries.length) {
      return true;
    }
    controllerEntries.forEach(({ controller }) => {
      if (Number(controller?.timer) > 0) {
        window.clearTimeout(controller.timer);
        controller.timer = 0;
      }
    });
    await Promise.all(
      controllerEntries.map(({ kind, targetId }) =>
        flushTodoToggleCommit(kind, targetId),
      ),
    );
    return true;
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
    if (!todoShellPageActive && !isTodoShellTransitionLoading()) {
      todoExternalRefreshPendingResume = true;
      return;
    }
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
    scheduleTodoExternalStorageRefresh(
      todoQueuedExternalStorageRefreshDetail || {},
    );
  }

  function clearTodoDeferredFreshSyncSchedule() {
    if (todoDeferredFreshSyncTimerId) {
      window.clearTimeout(todoDeferredFreshSyncTimerId);
      todoDeferredFreshSyncTimerId = 0;
    }
    if (todoDeferredFreshSyncIdleId) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(todoDeferredFreshSyncIdleId);
      } else {
        window.clearTimeout(todoDeferredFreshSyncIdleId);
      }
      todoDeferredFreshSyncIdleId = 0;
    }
  }

  function invalidateTodoDeferredFreshSync(options = {}) {
    todoDeferredFreshSyncGeneration += 1;
    todoDeferredFreshSyncQueued = false;
    clearTodoDeferredFreshSyncSchedule();
    todoRefreshController?.invalidate?.();
    if (options.pendingResume === true && !todoInitialDataValidated) {
      todoDeferredFreshSyncPendingResume = true;
    }
  }

  function invalidateTodoDeferredFreshSyncForLocalToggle(reason = "") {
    if (todoInitialDataValidated) {
      return false;
    }
    invalidateTodoDeferredFreshSync();
    uiTools?.markPerfStage?.("todo-fresh-sync-deferred", {
      reason:
        typeof reason === "string" && reason.trim()
          ? reason.trim()
          : "local-toggle-mutation",
    });
    return true;
  }

  function bindTodoShellVisibilityGate() {
    if (todoShellVisibilityBound) {
      return;
    }
    todoShellVisibilityBound = true;
    const eventName =
      uiTools?.shellVisibilityEventName || "controler:shell-visibility-changed";
    window.addEventListener(eventName, (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      const nextActive = detail.active !== false;
      if (todoShellPageActive === nextActive) {
        return;
      }

      todoShellPageActive = nextActive;
      if (!todoShellPageActive) {
        if (hasTodoPendingLocalMutations()) {
          void flushTodoPendingPersistence().catch((error) => {
            console.error("待办页后台前刷新待提交变更失败:", error);
          });
        }
        if (
          todoExternalStorageRefreshQueued ||
          todoExternalStorageRefreshCoordinator?.hasPending?.()
        ) {
          todoExternalRefreshPendingResume = true;
        }
        todoExternalStorageRefreshCoordinator?.cancel?.();
        invalidateTodoDeferredFreshSync({
          pendingResume: !todoInitialDataValidated,
        });
        return;
      }

      if (todoExternalRefreshPendingResume) {
        todoExternalRefreshPendingResume = false;
        scheduleTodoExternalStorageRefresh(
          todoQueuedExternalStorageRefreshDetail || {},
        );
      }
      flushTodoDeferredExternalRefreshIfNeeded();
      if (todoDeferredFreshSyncPendingResume) {
        todoDeferredFreshSyncPendingResume = false;
        scheduleTodoDeferredFreshSync();
      }
    });
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

  async function loadAllTodoSectionItemsFromStorage(section, options = {}) {
    const normalizedSection =
      section === "dailyCheckins" || section === "checkins" ? section : "";
    if (!normalizedSection) {
      return [];
    }
    const bundleStorage = window.ControlerStorage;
    if (typeof bundleStorage?.loadSectionRange === "function") {
      const range = await bundleStorage.loadSectionRange(normalizedSection, {
        authoritative: options?.authoritative === true,
      });
      return hydrateTodoCollection(
        normalizedSection,
        Array.isArray(range?.items) ? range.items : [],
      );
    }
    return getTodoSectionStateSnapshot(normalizedSection);
  }

  function shouldPersistTodoSharedLocalMirror() {
    return window.ControlerStorage?.isNativeApp !== true;
  }

  function persistTodoLocalCoreValue(key, value) {
    if (!shouldPersistTodoSharedLocalMirror()) {
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  function persistTodoLocalSection(section, items = []) {
    persistTodoLocalCoreValue(section, items);
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
      if (section === "checkinHistorySummary") {
        persistTodoLocalCoreValue(
          section,
          normalizeCheckinHistorySummary(source[section]),
        );
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

  function getCheckinHistorySummarySnapshot() {
    return normalizeCheckinHistorySummary(checkinHistorySummary);
  }

  function getCheckinHistorySummaryEntry(itemId = "") {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) {
      return null;
    }
    const entry = checkinHistorySummary?.[normalizedItemId];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    return normalizeCheckinHistorySummaryEntry(entry);
  }

  function replaceCheckinHistorySummary(nextSummary = {}) {
    const normalizedSummary = normalizeCheckinHistorySummary(nextSummary);
    const changed = !isTodoSerializableEqual(
      normalizedSummary,
      checkinHistorySummary,
    );
    checkinHistorySummary = normalizedSummary;
    return changed;
  }

  function setCheckinHistorySummaryEntry(itemId = "", entry = {}) {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) {
      return false;
    }
    return replaceCheckinHistorySummary({
      ...checkinHistorySummary,
      [normalizedItemId]: normalizeCheckinHistorySummaryEntry(entry),
    });
  }

  function ensureCheckinHistorySummaryEntry(itemId = "", updatedAt = "") {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId || getCheckinHistorySummaryEntry(normalizedItemId)) {
      return false;
    }
    return setCheckinHistorySummaryEntry(
      normalizedItemId,
      createEmptyCheckinHistorySummaryEntry(updatedAt),
    );
  }

  function buildCheckinHistorySummaryFromEntries(entryList = [], options = {}) {
    const sourceEntries = Array.isArray(entryList) ? entryList : [];
    const latestByItemDate = new Map();
    const knownItemIds = new Set(
      collectTodoCheckinItemIdsFromCollection(options?.items || checkinItems),
    );
    const updatedAtFallback =
      typeof options?.updatedAt === "string" && options.updatedAt.trim()
        ? options.updatedAt.trim()
        : new Date().toISOString();
    sourceEntries.forEach((entry, index) => {
      const itemId = String(entry?.itemId || "").trim();
      const dateKey = normalizeTodoOccurrenceDateKey(entry?.date);
      if (!itemId || !dateKey) {
        return;
      }
      knownItemIds.add(itemId);
      const key = `${itemId}::${dateKey}`;
      const candidate = {
        entry: {
          ...(entry || {}),
          itemId,
          date: dateKey,
        },
        timestamp: getTodoCheckinEntryTimestamp(entry),
        index,
      };
      const current = latestByItemDate.get(key);
      if (
        !current ||
        candidate.timestamp > current.timestamp ||
        (candidate.timestamp === current.timestamp &&
          candidate.index >= current.index)
      ) {
        latestByItemDate.set(key, candidate);
      }
    });
    const checkedDatesByItem = new Map();
    const updatedAtByItem = new Map();
    latestByItemDate.forEach(({ entry, timestamp }) => {
      const itemId = String(entry?.itemId || "").trim();
      const dateKey = normalizeTodoOccurrenceDateKey(entry?.date);
      if (!itemId || !dateKey) {
        return;
      }
      const nextDates = checkedDatesByItem.get(itemId) || new Set();
      if (entry?.checked) {
        nextDates.add(dateKey);
      }
      checkedDatesByItem.set(itemId, nextDates);
      const currentTimestamp = updatedAtByItem.get(itemId)?.timestamp || 0;
      if (timestamp >= currentTimestamp) {
        updatedAtByItem.set(itemId, {
          timestamp,
          updatedAt:
            typeof entry?.time === "string" && entry.time.trim()
              ? entry.time.trim()
              : typeof entry?.updatedAt === "string" && entry.updatedAt.trim()
                ? entry.updatedAt.trim()
                : updatedAtFallback,
        });
      }
    });
    const summary = {};
    knownItemIds.forEach((itemId) => {
      const checkedDates = Array.from(
        checkedDatesByItem.get(itemId) || new Set(),
      ).sort();
      summary[itemId] = {
        checkedDaysCount: checkedDates.length,
        checkedDates,
        updatedAt: updatedAtByItem.get(itemId)?.updatedAt || updatedAtFallback,
      };
    });
    return normalizeCheckinHistorySummary(summary);
  }

  function rebuildCheckinHistorySummaryForItemIdsFromEntries(
    entryList = [],
    itemIds = [],
    options = {},
  ) {
    const normalizedItemIds = Array.from(
      new Set(
        (Array.isArray(itemIds) ? itemIds : [])
          .map((itemId) => String(itemId || "").trim())
          .filter(Boolean),
      ),
    );
    if (!normalizedItemIds.length) {
      return false;
    }
    const rebuiltSummary = buildCheckinHistorySummaryFromEntries(entryList, {
      items: normalizedItemIds.map((itemId) => ({ id: itemId })),
      updatedAt: options?.updatedAt,
    });
    const nextSummary = {
      ...checkinHistorySummary,
    };
    normalizedItemIds.forEach((itemId) => {
      nextSummary[itemId] =
        rebuiltSummary[itemId] ||
        createEmptyCheckinHistorySummaryEntry(options?.updatedAt);
    });
    return replaceCheckinHistorySummary(nextSummary);
  }

  function updateCheckinHistorySummaryForDate(
    itemId = "",
    dateText = "",
    nextChecked = false,
    updatedAt = "",
  ) {
    const normalizedItemId = String(itemId || "").trim();
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedItemId || !normalizedDate) {
      return false;
    }
    const currentEntry =
      getCheckinHistorySummaryEntry(normalizedItemId) ||
      createEmptyCheckinHistorySummaryEntry(updatedAt);
    const nextDates = new Set(
      normalizeCheckinHistorySummaryDateList(currentEntry.checkedDates),
    );
    if (nextChecked) {
      nextDates.add(normalizedDate);
    } else {
      nextDates.delete(normalizedDate);
    }
    return setCheckinHistorySummaryEntry(normalizedItemId, {
      checkedDaysCount: nextDates.size,
      checkedDates: Array.from(nextDates).sort(),
      updatedAt:
        typeof updatedAt === "string" && updatedAt.trim()
          ? updatedAt.trim()
          : currentEntry.updatedAt || "",
    });
  }

  function mergeCheckinHistorySummaryEntries(
    targetItemId = "",
    sourceItemId = "",
    updatedAt = "",
  ) {
    const normalizedTargetItemId = String(targetItemId || "").trim();
    const normalizedSourceItemId = String(sourceItemId || "").trim();
    if (
      !normalizedTargetItemId ||
      !normalizedSourceItemId ||
      normalizedTargetItemId === normalizedSourceItemId
    ) {
      return false;
    }
    const mergedDates = normalizeCheckinHistorySummaryDateList([
      ...Array.from(getCheckedTodoDailyCheckinDates(normalizedTargetItemId)),
      ...Array.from(getCheckedTodoDailyCheckinDates(normalizedSourceItemId)),
    ]);
    return replaceCheckinHistorySummary({
      ...checkinHistorySummary,
      [normalizedTargetItemId]: {
        checkedDaysCount: mergedDates.length,
        checkedDates: mergedDates,
        updatedAt:
          typeof updatedAt === "string" && updatedAt.trim()
            ? updatedAt.trim()
            : new Date().toISOString(),
      },
      [normalizedSourceItemId]: createEmptyCheckinHistorySummaryEntry(updatedAt),
    });
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

  function createTodoDailyCheckinLookup(entries = dailyCheckins) {
    const latestByItemDate = new Map();
    const checkedDatesByItem = new Map();
    const sourceEntries = Array.isArray(entries) ? entries : [];

    sourceEntries.forEach((entry, index) => {
      const itemId = String(entry?.itemId || "").trim();
      const dateKey = normalizeTodoOccurrenceDateKey(entry?.date);
      if (!itemId || !dateKey) {
        return;
      }

      const candidate = {
        entry,
        index,
        timestamp: getTodoCheckinEntryTimestamp(entry),
      };
      const lookupKey = `${itemId}::${dateKey}`;
      const current = latestByItemDate.get(lookupKey) || null;
      if (isTodoCheckinEntryNewer(candidate, current)) {
        latestByItemDate.set(lookupKey, candidate);
      }

      if (entry?.checked) {
        let checkedDates = checkedDatesByItem.get(itemId);
        if (!(checkedDates instanceof Set)) {
          checkedDates = new Set();
          checkedDatesByItem.set(itemId, checkedDates);
        }
        checkedDates.add(dateKey);
      }
    });

    return {
      latestByItemDate,
      checkedDatesByItem,
    };
  }

  function getLatestTodoDailyCheckinEntryFromLookup(
    lookup,
    itemId,
    date,
  ) {
    if (!(lookup?.latestByItemDate instanceof Map)) {
      return getLatestTodoDailyCheckinEntry(itemId, date);
    }
    const normalizedItemId = String(itemId || "").trim();
    const normalizedDate = normalizeTodoOccurrenceDateKey(date);
    if (!normalizedItemId || !normalizedDate) {
      return null;
    }
    return (
      lookup.latestByItemDate.get(`${normalizedItemId}::${normalizedDate}`)
        ?.entry || null
    );
  }

  function getCheckedTodoDailyCheckinDates(itemId, lookup = null) {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) {
      return new Set();
    }
    const summaryEntry = getCheckinHistorySummaryEntry(normalizedItemId);
    if (summaryEntry && Array.isArray(summaryEntry.checkedDates)) {
      return new Set(summaryEntry.checkedDates);
    }
    if (lookup?.checkedDatesByItem instanceof Map) {
      return lookup.checkedDatesByItem.get(normalizedItemId) || new Set();
    }
    return new Set(
      dailyCheckins
        .filter(
          (checkin) =>
            String(checkin?.itemId || "").trim() === normalizedItemId &&
            checkin?.checked,
        )
        .map((checkin) => normalizeTodoOccurrenceDateKey(checkin?.date))
        .filter(Boolean),
    );
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
    const { errorLabel = "保存待办数据失败:", refreshReminders = false } =
      options;
    invalidateTodoDerivedCaches();
    if (refreshReminders) {
      todoPendingReminderRefresh = true;
    }
    todoLastPersistenceError = null;
    todoPendingPersistenceCount += 1;
    todoPersistChain = todoPersistChain
      .catch(() => undefined)
      .then(() => task())
      .catch((error) => {
        todoLastPersistenceError =
          error instanceof Error
            ? error
            : new Error(String(error || "保存失败"));
        console.error(errorLabel, todoLastPersistenceError);
        return false;
      })
      .finally(() => {
        todoPendingPersistenceCount = Math.max(
          0,
          todoPendingPersistenceCount - 1,
        );
        if (todoPendingPersistenceCount <= 0) {
          flushTodoDeferredExternalRefreshIfNeeded();
          flushTodoReminderRefreshIfNeeded();
        }
      });
    return todoPersistChain;
  }

  function flushTodoReminderRefreshIfNeeded() {
    if (!todoPendingReminderRefresh || todoPendingPersistenceCount > 0) {
      return;
    }
    if (todoReminderRefreshFlushPromise) {
      return;
    }
    todoPendingReminderRefresh = false;
    todoReminderRefreshFlushPromise = Promise.resolve(
      ensureTodoReminderRuntimeLoaded(),
    )
      .then((tools) => {
        if (!tools) {
          return false;
        }
        tools.refresh?.({
          resetWindow: true,
        });
        return Promise.resolve(
          tools.syncNativeSchedule?.({
            force: true,
          }),
        );
      })
      .catch((error) => {
        console.error("刷新待办提醒状态失败:", error);
        return false;
      })
      .finally(() => {
        todoReminderRefreshFlushPromise = null;
        if (todoPendingReminderRefresh && todoPendingPersistenceCount <= 0) {
          flushTodoReminderRefreshIfNeeded();
        }
      });
  }

  async function flushTodoPendingPersistence() {
    await flushTodoDeferredToggleCommits();
    if (todoPendingPersistenceCount > 0) {
      await todoPersistChain.catch(() => false);
    }
    if (todoLastPersistenceError) {
      throw todoLastPersistenceError;
    }
    return true;
  }

  function queueTodoCoreSave(partialCore = {}, options = {}) {
    const source =
      partialCore &&
      typeof partialCore === "object" &&
      !Array.isArray(partialCore)
        ? partialCore
        : {};
    const changedSections = getTodoNormalizedChangedSections(
      Object.keys(source),
    );
    if (!changedSections.length) {
      return Promise.resolve(true);
    }
    const protectedSource = normalizeTodoCoreUpdate(source);
    persistTodoLocalMirrorCore(protectedSource);
    markTodoSelfRefreshIgnored(changedSections);
    return queueTodoPersistenceTask(
      async () => {
        const bundleStorage = window.ControlerStorage;
        if (typeof bundleStorage?.appendJournal === "function") {
          await bundleStorage.appendJournal(
            [
              {
                kind: "replaceCoreState",
                partialCore: cloneTodoValue(protectedSource),
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
          await bundleStorage.replaceCoreState(
            cloneTodoValue(protectedSource),
            {
              reason:
                typeof options?.reason === "string" && options.reason.trim()
                  ? options.reason.trim()
                  : "todo-core-save",
            },
          );
          return true;
        }
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
    return queueTodoSaveWithLinkedPlan({
      sectionSaves: [
        {
          section: normalizedSection,
          periodIds: options?.periodIds,
          previousItems: options?.previousItems,
        },
      ],
      reason:
        typeof options?.reason === "string" && options.reason.trim()
          ? options.reason.trim()
          : `todo-section-save:${normalizedSection}`,
      errorLabel:
        options?.errorLabel ||
        `保存${normalizedSection === "dailyCheckins" ? "每日打卡" : "进度记录"}分区数据失败:`,
      refreshReminders: options?.refreshReminders === true,
    });
  }

  function normalizeTodoLinkedPlanSourceType(value) {
    const normalized = String(value || "").trim();
    return normalized === "checkin" ? "checkin" : normalized === "todo" ? "todo" : "";
  }

  function isTodoLinkedPlanRecurring(planLike = null) {
    return (
      String(planLike?.repeat || "none")
        .trim()
        .toLowerCase() !== "none"
    );
  }

  function getTodoLinkedPlanPeriodId(planLike = {}) {
    const dateText = String(
      planLike?.startDate || planLike?.date || "",
    ).trim();
    return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : "";
  }

  function readTodoLinkedPlanCollection() {
    try {
      const planSnapshot =
        typeof window.ControlerStorage?.getStateValue === "function"
          ? window.ControlerStorage.getStateValue("plans")
          : typeof window.ControlerStorage?.dump === "function"
            ? window.ControlerStorage.dump()?.plans
            : null;
      if (Array.isArray(planSnapshot)) {
        return reconcileTodoLinkedPlanCollection(planSnapshot);
      }
    } catch (error) {
      console.error("读取关联计划快照失败，回退本地计划镜像:", error);
    }
    if (!shouldPersistTodoSharedLocalMirror()) {
      return [];
    }
    try {
      const savedPlans = JSON.parse(localStorage.getItem("plans") || "[]");
      return reconcileTodoLinkedPlanCollection(
        Array.isArray(savedPlans) ? savedPlans : [],
      );
    } catch (error) {
      console.error("读取本地计划镜像失败:", error);
      return [];
    }
  }

  function findTodoLinkedPlanIndex(
    planItems = [],
    sourceType = "",
    sourceId = "",
  ) {
    const normalizedSourceType = normalizeTodoLinkedPlanSourceType(sourceType);
    const normalizedSourceId = String(sourceId || "").trim();
    if (!normalizedSourceType || !normalizedSourceId) {
      return -1;
    }
    return (Array.isArray(planItems) ? planItems : []).findIndex(
      (plan) =>
        normalizeTodoLinkedPlanSourceType(plan?.linkedSourceType) ===
          normalizedSourceType &&
        String(plan?.linkedSourceId || "").trim() === normalizedSourceId,
    );
  }

  function getTodoLinkedPlanSnapshot(sourceType = "", sourceId = "") {
    const allPlans = readTodoLinkedPlanCollection();
    const index = findTodoLinkedPlanIndex(allPlans, sourceType, sourceId);
    return index >= 0 ? cloneTodoValue(allPlans[index]) : null;
  }

  function followResolvedCheckinLinkedSource(itemLike = null) {
    let currentItem = itemLike && typeof itemLike === "object" ? itemLike : null;
    const visitedIds = new Set();
    while (currentItem) {
      const currentId = String(currentItem?.id || "").trim();
      if (!currentId || visitedIds.has(currentId)) {
        break;
      }
      visitedIds.add(currentId);
      const mergedIntoId = String(currentItem?.mergedIntoId || "").trim();
      if (!mergedIntoId) {
        break;
      }
      const mergedTarget =
        checkinItems.find((item) => matchesId(item?.id, mergedIntoId)) || null;
      if (!mergedTarget) {
        break;
      }
      currentItem = mergedTarget;
    }
    return currentItem;
  }

  function resolveTodoLinkedPlanSource(sourceType = "", sourceId = "", options = {}) {
    const normalizedSourceType = normalizeTodoLinkedPlanSourceType(sourceType);
    const normalizedSourceId = String(sourceId || "").trim();
    const titleKey = normalizeCheckinTitleKey(options?.title || options?.name || "");
    if (!normalizedSourceType) {
      return null;
    }
    if (normalizedSourceType === "todo") {
      const exactTodo =
        todos.find((todo) => matchesId(todo?.id, normalizedSourceId)) || null;
      if (exactTodo) {
        return {
          sourceType: normalizedSourceType,
          requestedId: normalizedSourceId,
          resolvedId: String(exactTodo.id || "").trim(),
          source: cloneTodoValue(exactTodo),
          resolvedBy: "id",
        };
      }
      if (titleKey) {
        const matchedTodos = todos.filter(
          (todo) => normalizeCheckinTitleKey(todo?.title) === titleKey,
        );
        if (matchedTodos.length === 1) {
          return {
            sourceType: normalizedSourceType,
            requestedId: normalizedSourceId,
            resolvedId: String(matchedTodos[0]?.id || "").trim(),
            source: cloneTodoValue(matchedTodos[0]),
            resolvedBy: "title",
          };
        }
      }
      return {
        sourceType: normalizedSourceType,
        requestedId: normalizedSourceId,
        resolvedId: "",
        source: null,
        resolvedBy: "missing",
      };
    }
    const exactItem =
      checkinItems.find((item) => matchesId(item?.id, normalizedSourceId)) || null;
    const mergedTarget = followResolvedCheckinLinkedSource(exactItem);
    if (mergedTarget && !isCheckinItemDeleted(mergedTarget)) {
      return {
        sourceType: normalizedSourceType,
        requestedId: normalizedSourceId,
        resolvedId: String(mergedTarget.id || "").trim(),
        source: cloneTodoValue(mergedTarget),
        resolvedBy:
          exactItem && matchesId(exactItem?.id, mergedTarget?.id) ? "id" : "merged",
      };
    }
    if (titleKey) {
      const visibleMatches = checkinItems.filter(
        (item) =>
          !isCheckinItemDeleted(item) &&
          normalizeCheckinTitleKey(item?.title) === titleKey,
      );
      const activeMatches = visibleMatches.filter((item) => isCheckinItemActive(item));
      const fallbackItem =
        activeMatches.length === 1
          ? activeMatches[0]
          : visibleMatches.length === 1
            ? visibleMatches[0]
            : null;
      if (fallbackItem) {
        return {
          sourceType: normalizedSourceType,
          requestedId: normalizedSourceId,
          resolvedId: String(fallbackItem.id || "").trim(),
          source: cloneTodoValue(fallbackItem),
          resolvedBy: "title",
        };
      }
    }
    return {
      sourceType: normalizedSourceType,
      requestedId: normalizedSourceId,
      resolvedId: "",
      source: null,
      resolvedBy: "missing",
    };
  }

  function doesTodoLinkedPlanOccurOnDate(planLike = null, dateText = "") {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!planLike || !normalizedDate) {
      return false;
    }
    const excludedDates = normalizePlanDateListForTodo(planLike?.excludedDates || []);
    if (excludedDates.includes(normalizedDate)) {
      return false;
    }
    const includedDates = normalizePlanDateListForTodo(planLike?.includedDates || []);
    if (includedDates.includes(normalizedDate)) {
      return true;
    }

    const startDate = normalizeTodoOccurrenceDateKey(
      planLike?.startDate || planLike?.date || "",
    );
    if (!startDate) {
      return false;
    }

    const repeat = String(planLike?.repeat || "none")
      .trim()
      .toLowerCase();
    if (repeat === "none") {
      return normalizedDate === startDate;
    }
    if (normalizedDate < startDate) {
      return false;
    }

    const endDate = normalizeTodoOccurrenceDateKey(planLike?.endDate || "");
    if (endDate && normalizedDate > endDate) {
      return false;
    }

    const targetDate = parseTodoOccurrenceDateKey(normalizedDate);
    if (!(targetDate instanceof Date)) {
      return false;
    }

    if (repeat === "weekly") {
      const repeatDays = Array.isArray(planLike?.repeatDays)
        ? planLike.repeatDays
            .map((day) => Number.parseInt(day, 10))
            .filter((day) => day >= 0 && day <= 6)
        : [];
      return repeatDays.includes(targetDate.getDay());
    }

    if (repeat === "monthly") {
      const repeatMonthDays = normalizeTodoMonthDayList(
        planLike?.repeatMonthDays,
      );
      if (repeatMonthDays.length) {
        return repeatMonthDays.includes(targetDate.getDate());
      }
      const baseDate = parseTodoOccurrenceDateKey(startDate);
      return baseDate instanceof Date && baseDate.getDate() === targetDate.getDate();
    }

    return true;
  }

  function isTodoLinkedPlanOccurrenceAvailable(
    sourceType = "",
    sourceLike = null,
    dateText = "",
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (
      !sourceLike ||
      typeof sourceLike.isScheduledOn !== "function" ||
      !normalizedDate ||
      !sourceLike.isScheduledOn(normalizedDate)
    ) {
      return false;
    }
    const normalizedType = normalizeTodoLinkedPlanSourceType(sourceType);
    if (!normalizedType || !sourceLike?.id) {
      return true;
    }
    const linkedPlan = getTodoLinkedPlanSnapshot(normalizedType, sourceLike.id);
    if (!linkedPlan) {
      return true;
    }
    return doesTodoLinkedPlanOccurOnDate(linkedPlan, normalizedDate);
  }

  function buildTodoLinkedPlanId(sourceType = "", sourceId = "") {
    return `linked-plan:${normalizeTodoLinkedPlanSourceType(sourceType)}:${String(sourceId || "").trim()}`;
  }

  function shouldTodoSourceExposeLinkedPlan(sourceLike = null) {
    if (
      normalizeTodoLinkedPlanSourceType(sourceLike?.type || sourceLike?.linkedSourceType) ===
        "checkin" &&
      !isCheckinItemActive(sourceLike)
    ) {
      return false;
    }
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime: sourceLike?.startTime,
      endTime: sourceLike?.endTime,
    });
    if (!normalizedTimeRange.startTime || !normalizedTimeRange.endTime) {
      return false;
    }
    if (normalizedTimeRange.startTime >= normalizedTimeRange.endTime) {
      return false;
    }
    const repeatType = normalizeTodoRepeatType(sourceLike?.repeatType);
    if (repeatType === "none") {
      return !!String(sourceLike?.dueDate || sourceLike?.startDate || "").trim();
    }
    return !!String(sourceLike?.startDate || sourceLike?.dueDate || "").trim();
  }

  function createTodoLinkedPlanDraft(
    sourceType = "",
    sourceLike = null,
    existingPlan = null,
  ) {
    const normalizedSourceType = normalizeTodoLinkedPlanSourceType(sourceType);
    if (!normalizedSourceType || !sourceLike?.id) {
      return null;
    }
    if (!shouldTodoSourceExposeLinkedPlan(sourceLike)) {
      return null;
    }
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime: sourceLike?.startTime,
      endTime: sourceLike?.endTime,
    });
    const repeatType = normalizeTodoRepeatType(sourceLike?.repeatType);
    const startDate =
      repeatType === "none"
        ? String(sourceLike?.dueDate || sourceLike?.startDate || "").trim()
        : String(sourceLike?.startDate || sourceLike?.dueDate || "").trim();
    if (!startDate) {
      return null;
    }
    const repeatWeekdays =
      repeatType === "weekly"
        ? Array.isArray(sourceLike?.repeatWeekdays)
          ? sourceLike.repeatWeekdays
          : []
        : [];
    const repeatMonthDays =
      repeatType === "monthly"
        ? Array.isArray(sourceLike?.repeatMonthDays)
          ? sourceLike.repeatMonthDays
          : []
        : [];
    const sourceNotification =
      normalizedSourceType === "checkin"
        ? normalizeCheckinNotificationConfig(sourceLike?.notification, {
            ...sourceLike,
            startDate,
            repeatType,
          })
        : normalizeTodoNotificationConfig(sourceLike?.notification, {
            ...sourceLike,
            dueDate: String(sourceLike?.dueDate || startDate || "").trim(),
            startDate,
            repeatType,
          });
    const nextPlan = {
      ...(existingPlan && typeof existingPlan === "object" ? existingPlan : {}),
      id:
        String(existingPlan?.id || "").trim() ||
        buildTodoLinkedPlanId(normalizedSourceType, sourceLike.id),
      name: String(sourceLike?.title || "").trim() || "未命名计划",
      date: startDate,
      startDate,
      endDate:
        repeatType === "none"
          ? ""
          : String(sourceLike?.endDate || "").trim(),
      startTime: normalizedTimeRange.startTime,
      endTime: normalizedTimeRange.endTime,
      color:
        normalizedSourceType === "checkin"
          ? sourceLike?.color || existingPlan?.color || "#4299e1"
          : existingPlan?.color || sourceLike?.color || "#79af85",
      repeat: repeatType,
      repeatDays:
        repeatType === "weekly"
          ? (Array.isArray(repeatWeekdays) ? repeatWeekdays : [])
          : [],
      repeatMonthDays:
        repeatType === "monthly"
          ? normalizeTodoMonthDayList(repeatMonthDays)
          : [],
      notification:
        sourceLike &&
        typeof sourceLike === "object" &&
        Object.prototype.hasOwnProperty.call(sourceLike, "notification")
          ? sourceNotification
          : existingPlan?.notification || null,
      projectId: existingPlan?.projectId || null,
      createdAt: existingPlan?.createdAt || new Date().toISOString(),
      linkedSourceType: normalizedSourceType,
      linkedSourceId: String(sourceLike.id || "").trim(),
      linkManaged: true,
      includedDates: normalizePlanDateListForTodo(
        Array.isArray(sourceLike?.includedDates)
          ? sourceLike.includedDates
          : existingPlan?.includedDates || [],
      ),
      excludedDates: Array.isArray(existingPlan?.excludedDates)
        ? existingPlan.excludedDates
        : [],
    };

    if (
      normalizedSourceType === "todo" &&
      repeatType === "none"
    ) {
      nextPlan.isCompleted = !!sourceLike?.completed;
      nextPlan.completedDates = [];
      nextPlan.uncompletedDates = [];
    } else {
      nextPlan.isCompleted =
        normalizedSourceType === "todo" && repeatType !== "none"
          ? false
          : !!existingPlan?.isCompleted;
      nextPlan.completedDates = normalizePlanDateListForTodo(
        Array.isArray(sourceLike?.completedDates)
          ? sourceLike.completedDates
          : existingPlan?.completedDates || [],
      );
      nextPlan.uncompletedDates = normalizePlanDateListForTodo(
        Array.isArray(sourceLike?.uncompletedDates)
          ? sourceLike.uncompletedDates
          : existingPlan?.uncompletedDates || [],
      );
    }

    return nextPlan;
  }

  function applyTodoLinkedPlanCompletionState(
    planLike = null,
    nextCompleted = false,
    occurrenceDate = "",
  ) {
    if (!planLike || typeof planLike !== "object") {
      return planLike;
    }
    const plan = {
      ...planLike,
      completedDates: Array.isArray(planLike.completedDates)
        ? planLike.completedDates
        : [],
      uncompletedDates: Array.isArray(planLike.uncompletedDates)
        ? planLike.uncompletedDates
        : [],
    };
    const repeat = String(plan.repeat || "none").trim().toLowerCase();
    const dateKey = String(occurrenceDate || plan.startDate || plan.date || "")
      .trim()
      .slice(0, 10);
    if (repeat === "none" || !dateKey) {
      plan.isCompleted = !!nextCompleted;
      plan.completedDates = [];
      plan.uncompletedDates = [];
      return plan;
    }
    const completedDates = normalizePlanDateListForTodo(
      plan.completedDates.filter((item) => item !== dateKey),
    );
    const uncompletedDates = normalizePlanDateListForTodo(
      plan.uncompletedDates.filter((item) => item !== dateKey),
    );
    if (!!nextCompleted !== !!plan.isCompleted) {
      if (nextCompleted) {
        completedDates.push(dateKey);
      } else {
        uncompletedDates.push(dateKey);
      }
    }
    plan.completedDates = normalizePlanDateListForTodo(completedDates);
    plan.uncompletedDates = normalizePlanDateListForTodo(uncompletedDates);
    return plan;
  }

  function normalizePlanDateListForTodo(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((item) => String(item || "").trim().slice(0, 10))
          .filter(Boolean),
      ),
    ).sort();
  }

  function normalizeTodoOccurrenceDateKey(dateValue = null) {
    if (dateValue instanceof Date) {
      return getLocalDateText(dateValue);
    }
    const directText = String(dateValue || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(directText)) {
      return directText;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(directText)) {
      return directText.slice(0, 10);
    }
    if (!directText) {
      return "";
    }
    const parsed = new Date(directText);
    return Number.isNaN(parsed.getTime()) ? "" : getLocalDateText(parsed);
  }

  function parseTodoOccurrenceDateKey(dateKey = "") {
    const normalizedDateKey = normalizeTodoOccurrenceDateKey(dateKey);
    if (!normalizedDateKey) {
      return null;
    }
    const [yearText, monthText, dayText] = normalizedDateKey.split("-");
    const parsed = new Date(
      Number.parseInt(yearText, 10),
      Number.parseInt(monthText, 10) - 1,
      Number.parseInt(dayText, 10),
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function shiftTodoOccurrenceDateKey(dateKey = "", dayOffset = 0) {
    const parsed = parseTodoOccurrenceDateKey(dateKey);
    if (!(parsed instanceof Date)) {
      return "";
    }
    parsed.setDate(parsed.getDate() + Math.trunc(Number(dayOffset) || 0));
    return getLocalDateText(parsed);
  }

  function formatTodoOccurrenceDateLabel(dateKey = "") {
    const parsed = parseTodoOccurrenceDateKey(dateKey);
    if (!(parsed instanceof Date)) {
      return String(dateKey || "").trim();
    }
    return `${getLocalDateText(parsed)}（${getWeekdayLabel(parsed.getDay())}）`;
  }

  function getTodoIncludedDateList(sourceLike = null) {
    return normalizePlanDateListForTodo(sourceLike?.includedDates || []);
  }

  function hasTodoIncludedDate(sourceLike = null, dateText = "") {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    return getTodoIncludedDateList(sourceLike).includes(normalizedDate);
  }

  function addTodoIncludedDate(sourceLike = null, dateText = "") {
    if (!sourceLike || typeof sourceLike !== "object") {
      return false;
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    const nextDates = normalizePlanDateListForTodo([
      ...getTodoIncludedDateList(sourceLike),
      normalizedDate,
    ]);
    const changed =
      nextDates.length !== getTodoIncludedDateList(sourceLike).length ||
      !getTodoIncludedDateList(sourceLike).every((item, index) => item === nextDates[index]);
    sourceLike.includedDates = nextDates;
    return changed;
  }

  function removeTodoIncludedDate(sourceLike = null, dateText = "") {
    if (!sourceLike || typeof sourceLike !== "object") {
      return false;
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    const currentDates = getTodoIncludedDateList(sourceLike);
    const nextDates = currentDates.filter((item) => item !== normalizedDate);
    if (nextDates.length === currentDates.length) {
      return false;
    }
    sourceLike.includedDates = nextDates;
    return true;
  }

  function getTodoCompletionStateOnDate(todoLike = null, dateText = "") {
    if (!todoLike || typeof todoLike !== "object") {
      return false;
    }
    if (normalizeTodoRepeatType(todoLike?.repeatType) === "none") {
      return !!todoLike.completed;
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    const uncompletedDates = normalizePlanDateListForTodo(
      todoLike.uncompletedDates || [],
    );
    if (uncompletedDates.includes(normalizedDate)) {
      return false;
    }
    const completedDates = normalizePlanDateListForTodo(
      todoLike.completedDates || [],
    );
    if (completedDates.includes(normalizedDate)) {
      return true;
    }
    const legacyCompletedDate = normalizeTodoOccurrenceDateKey(
      todoLike.completedAt || todoLike.updatedAt || "",
    );
    return !!todoLike.completed && legacyCompletedDate === normalizedDate;
  }

  function setTodoCompletionStateOnDate(
    todoLike = null,
    nextCompleted = false,
    dateText = "",
  ) {
    if (!todoLike || typeof todoLike !== "object") {
      return false;
    }
    const repeatType = normalizeTodoRepeatType(todoLike?.repeatType);
    const nowIso = new Date().toISOString();
    if (repeatType === "none") {
      todoLike.completed = !!nextCompleted;
      todoLike.completedAt = nextCompleted ? nowIso : null;
      return !!todoLike.completed;
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    const completedDates = normalizePlanDateListForTodo(
      (Array.isArray(todoLike.completedDates) ? todoLike.completedDates : []).filter(
        (item) => item !== normalizedDate,
      ),
    );
    const uncompletedDates = normalizePlanDateListForTodo(
      (Array.isArray(todoLike.uncompletedDates) ? todoLike.uncompletedDates : []).filter(
        (item) => item !== normalizedDate,
      ),
    );
    if (nextCompleted) {
      completedDates.push(normalizedDate);
    } else {
      uncompletedDates.push(normalizedDate);
    }
    todoLike.completed = false;
    todoLike.completedAt = nextCompleted ? nowIso : null;
    todoLike.completedDates = normalizePlanDateListForTodo(completedDates);
    todoLike.uncompletedDates = normalizePlanDateListForTodo(uncompletedDates);
    return getTodoCompletionStateOnDate(todoLike, normalizedDate);
  }

  function getTodoDisplayCompletionState(
    todoLike = null,
    dateText = getLocalDateText(),
  ) {
    return getTodoCompletionStateOnDate(todoLike, dateText);
  }

  function getCheckinCompletionStateOnDate(
    itemLike = null,
    dateText = "",
    lookup = null,
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!itemLike?.id || !normalizedDate) {
      return false;
    }
    const summaryEntry = getCheckinHistorySummaryEntry(itemLike.id);
    if (summaryEntry && Array.isArray(summaryEntry.checkedDates)) {
      return summaryEntry.checkedDates.includes(normalizedDate);
    }
    return !!getLatestTodoDailyCheckinEntryFromLookup(
      lookup,
      itemLike.id,
      normalizedDate,
    )?.checked;
  }

  function getTodoLastResolvedOccurrenceDate(sourceLike = null) {
    return normalizeTodoOccurrenceDateKey(sourceLike?.lastResolvedOccurrenceDate);
  }

  function setTodoLastResolvedOccurrenceDate(sourceLike = null, dateText = "") {
    if (!sourceLike || typeof sourceLike !== "object") {
      return "";
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    sourceLike.lastResolvedOccurrenceDate = normalizedDate || "";
    return sourceLike.lastResolvedOccurrenceDate;
  }

  function buildTodoLinkedPlanMutation(sourceType = "", sourceLike = null) {
    const allPlans = readTodoLinkedPlanCollection();
    const index = findTodoLinkedPlanIndex(
      allPlans,
      sourceType,
      sourceLike?.id || "",
    );
    const previousPlan = index >= 0 ? cloneTodoValue(allPlans[index]) : null;
    const nextPlan = createTodoLinkedPlanDraft(
      sourceType,
      sourceLike,
      index >= 0 ? allPlans[index] : null,
    );
    if (index >= 0) {
      if (nextPlan) {
        allPlans[index] = nextPlan;
      } else {
        allPlans.splice(index, 1);
      }
    } else if (nextPlan) {
      allPlans.push(nextPlan);
    }
    return {
      allPlans,
      previousPlan,
      nextPlan: nextPlan ? cloneTodoValue(nextPlan) : null,
    };
  }

  function mergeTodoLinkedPlanDraftState(basePlan = null, incomingPlan = null) {
    const primary =
      basePlan && typeof basePlan === "object" ? cloneTodoValue(basePlan) : null;
    const secondary =
      incomingPlan && typeof incomingPlan === "object"
        ? cloneTodoValue(incomingPlan)
        : null;
    if (!primary && !secondary) {
      return null;
    }
    const merged = {
      ...(primary || {}),
      ...(secondary || {}),
    };
    if (
      secondary &&
      Object.prototype.hasOwnProperty.call(secondary, "notification")
    ) {
      merged.notification = cloneTodoValue(secondary.notification);
    } else if (
      primary &&
      Object.prototype.hasOwnProperty.call(primary, "notification")
    ) {
      merged.notification = cloneTodoValue(primary.notification);
    } else {
      merged.notification = null;
    }
    merged.projectId = primary?.projectId || secondary?.projectId || null;
    merged.color = primary?.color || secondary?.color || "";
    const createdAtCandidates = [primary?.createdAt, secondary?.createdAt]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = Date.parse(left);
        const rightTime = Date.parse(right);
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return leftTime - rightTime;
        }
        if (Number.isFinite(leftTime)) {
          return -1;
        }
        if (Number.isFinite(rightTime)) {
          return 1;
        }
        return left.localeCompare(right);
      });
    merged.createdAt = createdAtCandidates[0] || new Date().toISOString();
    const primaryIncludedDates = normalizePlanDateListForTodo(
      Array.isArray(primary?.includedDates) ? primary.includedDates : [],
    );
    const primaryExcludedDates = normalizePlanDateListForTodo(
      Array.isArray(primary?.excludedDates) ? primary.excludedDates : [],
    );
    const primaryCompletedDates = normalizePlanDateListForTodo(
      Array.isArray(primary?.completedDates) ? primary.completedDates : [],
    );
    const primaryUncompletedDates = normalizePlanDateListForTodo(
      Array.isArray(primary?.uncompletedDates) ? primary.uncompletedDates : [],
    );
    const secondaryIncludedDates = normalizePlanDateListForTodo(
      (Array.isArray(secondary?.includedDates) ? secondary.includedDates : []).filter(
        (dateKey) => !primaryExcludedDates.includes(dateKey),
      ),
    );
    const secondaryExcludedDates = normalizePlanDateListForTodo(
      (Array.isArray(secondary?.excludedDates) ? secondary.excludedDates : []).filter(
        (dateKey) => !primaryIncludedDates.includes(dateKey),
      ),
    );
    const secondaryCompletedDates = normalizePlanDateListForTodo(
      (Array.isArray(secondary?.completedDates) ? secondary.completedDates : []).filter(
        (dateKey) => !primaryUncompletedDates.includes(dateKey),
      ),
    );
    const secondaryUncompletedDates = normalizePlanDateListForTodo(
      (Array.isArray(secondary?.uncompletedDates) ? secondary.uncompletedDates : []).filter(
        (dateKey) => !primaryCompletedDates.includes(dateKey),
      ),
    );
    merged.includedDates = normalizePlanDateListForTodo([
      ...primaryIncludedDates,
      ...secondaryIncludedDates,
    ]);
    merged.excludedDates = normalizePlanDateListForTodo([
      ...primaryExcludedDates,
      ...secondaryExcludedDates,
    ]);
    merged.completedDates = normalizePlanDateListForTodo([
      ...primaryCompletedDates,
      ...secondaryCompletedDates,
    ]);
    merged.uncompletedDates = normalizePlanDateListForTodo([
      ...primaryUncompletedDates,
      ...secondaryUncompletedDates,
    ]);
    merged.isCompleted = !!primary?.isCompleted || !!secondary?.isCompleted;
    return merged;
  }

  function reconcileTodoLinkedPlanCollection(planItems = []) {
    if (!Array.isArray(planItems) || !planItems.length) {
      return [];
    }
    const reconciledPlans = [];
    planItems.forEach((rawPlan) => {
      const nextPlan =
        rawPlan && typeof rawPlan === "object" ? cloneTodoValue(rawPlan) : null;
      if (!nextPlan) {
        return;
      }
      const sourceType = normalizeTodoLinkedPlanSourceType(nextPlan?.linkedSourceType);
      const sourceId = String(nextPlan?.linkedSourceId || "").trim();
      if (sourceType && sourceId) {
        const resolvedSource = resolveTodoLinkedPlanSource(sourceType, sourceId, {
          title: nextPlan?.name || "",
        });
        const resolvedId = String(resolvedSource?.resolvedId || "").trim();
        if (resolvedId) {
          nextPlan.linkedSourceId = resolvedId;
          nextPlan.id = buildTodoLinkedPlanId(sourceType, resolvedId);
        }
      }
      const linkedSourceType = normalizeTodoLinkedPlanSourceType(
        nextPlan?.linkedSourceType,
      );
      const linkedSourceId = String(nextPlan?.linkedSourceId || "").trim();
      const existingIndex =
        linkedSourceType && linkedSourceId
          ? findTodoLinkedPlanIndex(
              reconciledPlans,
              linkedSourceType,
              linkedSourceId,
            )
          : -1;
      if (existingIndex === -1) {
        reconciledPlans.push(nextPlan);
        return;
      }
      reconciledPlans[existingIndex] = mergeTodoLinkedPlanDraftState(
        reconciledPlans[existingIndex],
        nextPlan,
      );
    });
    return reconciledPlans.map((planLike) => cloneTodoValue(planLike));
  }

  function buildTodoLinkedPlanMergeMutation(
    sourceType = "",
    targetSourceLike = null,
    sourceId = "",
  ) {
    const normalizedSourceType = normalizeTodoLinkedPlanSourceType(sourceType);
    const normalizedTargetId = String(targetSourceLike?.id || "").trim();
    const normalizedSourceId = String(sourceId || "").trim();
    if (
      !normalizedSourceType ||
      !normalizedTargetId ||
      !normalizedSourceId ||
      normalizedTargetId === normalizedSourceId
    ) {
      return buildTodoLinkedPlanMutation(sourceType, targetSourceLike);
    }
    const allPlans = readTodoLinkedPlanCollection();
    const targetIndex = findTodoLinkedPlanIndex(
      allPlans,
      normalizedSourceType,
      normalizedTargetId,
    );
    const sourceIndex = findTodoLinkedPlanIndex(
      allPlans,
      normalizedSourceType,
      normalizedSourceId,
    );
    const targetPlan = targetIndex >= 0 ? cloneTodoValue(allPlans[targetIndex]) : null;
    const sourcePlan = sourceIndex >= 0 ? cloneTodoValue(allPlans[sourceIndex]) : null;
    const previousPlans = [targetPlan, sourcePlan]
      .filter((planLike) => planLike && typeof planLike === "object")
      .filter((planLike, index, collection) => {
        const planId = String(planLike?.id || "").trim();
        if (!planId) {
          return true;
        }
        return (
          collection.findIndex(
            (candidate) => String(candidate?.id || "").trim() === planId,
          ) === index
        );
      })
      .map((planLike) => cloneTodoValue(planLike));
    const mergedPlanSeed = mergeTodoLinkedPlanDraftState(targetPlan, sourcePlan);
    const nextPlan = createTodoLinkedPlanDraft(
      normalizedSourceType,
      targetSourceLike,
      mergedPlanSeed,
    );
    const nextPlans = nextPlan ? [cloneTodoValue(nextPlan)] : [];
    const nextAllPlans = (Array.isArray(allPlans) ? allPlans : []).filter(
      (_plan, index) => index !== targetIndex && index !== sourceIndex,
    );
    if (nextPlan) {
      nextAllPlans.push(nextPlan);
    }
    return {
      allPlans: nextAllPlans,
      previousPlans,
      nextPlans,
      previousPlan: previousPlans[0] ? cloneTodoValue(previousPlans[0]) : null,
      nextPlan: nextPlan ? cloneTodoValue(nextPlan) : null,
    };
  }

  function buildTodoLinkedPlanCompletionMutation(
    sourceType = "",
    sourceId = "",
    nextCompleted = false,
    occurrenceDate = "",
    options = {},
  ) {
    const allPlans = readTodoLinkedPlanCollection();
    const normalizedSourceId =
      typeof sourceId === "object" && sourceId
        ? String(sourceId.id || "").trim()
        : String(sourceId || "").trim();
    const sourceLike =
      options?.sourceLike && typeof options.sourceLike === "object"
        ? options.sourceLike
        : typeof sourceId === "object" && sourceId
          ? sourceId
          : null;
    const index = findTodoLinkedPlanIndex(
      allPlans,
      sourceType,
      normalizedSourceId,
    );
    const previousPlan = index >= 0 ? cloneTodoValue(allPlans[index]) : null;
    let nextPlan =
      index >= 0
        ? cloneTodoValue(allPlans[index])
        : options?.createIfMissing === true || nextCompleted === true
          ? createTodoLinkedPlanDraft(sourceType, sourceLike, null)
          : null;
    if (!nextPlan) {
      return null;
    }

    const normalizedOccurrenceDate = normalizeTodoOccurrenceDateKey(
      occurrenceDate,
    );
    if (normalizedOccurrenceDate && nextCompleted === true) {
      nextPlan.excludedDates = normalizePlanDateListForTodo(
        (Array.isArray(nextPlan.excludedDates) ? nextPlan.excludedDates : []).filter(
          (item) => item !== normalizedOccurrenceDate,
        ),
      );
    }
    if (options?.includeDate === true && normalizedOccurrenceDate) {
      nextPlan.includedDates = normalizePlanDateListForTodo([
        ...(Array.isArray(nextPlan.includedDates) ? nextPlan.includedDates : []),
        normalizedOccurrenceDate,
      ]);
    }

    nextPlan = applyTodoLinkedPlanCompletionState(
      nextPlan,
      nextCompleted,
      occurrenceDate,
    );
    if (options?.forceGlobalCompletion === true) {
      nextPlan.isCompleted = !!nextCompleted;
      nextPlan.completedDates = [];
      nextPlan.uncompletedDates = [];
    }
    if (index >= 0) {
      allPlans[index] = nextPlan;
    } else {
      allPlans.push(nextPlan);
    }
    return {
      allPlans,
      previousPlan,
      nextPlan: cloneTodoValue(nextPlan),
    };
  }

  function buildTodoLinkedPlanRemovalMutation(sourceType = "", sourceId = "") {
    const allPlans = readTodoLinkedPlanCollection();
    const index = findTodoLinkedPlanIndex(allPlans, sourceType, sourceId);
    if (index === -1) {
      return null;
    }
    const previousPlan = cloneTodoValue(allPlans[index]);
    allPlans.splice(index, 1);
    return {
      allPlans,
      previousPlan,
      nextPlan: null,
    };
  }

  function clearTodoCompletionStateOnDate(todoLike = null, dateText = "") {
    if (!todoLike || typeof todoLike !== "object") {
      return false;
    }
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedDate) {
      return false;
    }
    let changed = false;
    const currentCompletedDates = normalizePlanDateListForTodo(
      todoLike.completedDates || [],
    );
    const nextCompletedDates = currentCompletedDates.filter(
      (item) => item !== normalizedDate,
    );
    if (nextCompletedDates.length !== currentCompletedDates.length) {
      todoLike.completedDates = nextCompletedDates;
      changed = true;
    }
    const currentUncompletedDates = normalizePlanDateListForTodo(
      todoLike.uncompletedDates || [],
    );
    const nextUncompletedDates = currentUncompletedDates.filter(
      (item) => item !== normalizedDate,
    );
    if (nextUncompletedDates.length !== currentUncompletedDates.length) {
      todoLike.uncompletedDates = nextUncompletedDates;
      changed = true;
    }
    const legacyCompletedDate = normalizeTodoOccurrenceDateKey(
      todoLike.completedAt || todoLike.updatedAt || "",
    );
    if (!!todoLike.completed && legacyCompletedDate === normalizedDate) {
      todoLike.completed = false;
      todoLike.completedAt = null;
      changed = true;
    }
    return changed;
  }

  function removeTodoDailyCheckinEntriesOnDate(itemId = "", dateText = "") {
    const normalizedItemId = String(itemId || "").trim();
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedItemId || !normalizedDate) {
      return {
        changed: false,
        removedEntries: [],
      };
    }
    const removedEntries = dailyCheckins.filter(
      (entry) =>
        String(entry?.itemId || "").trim() === normalizedItemId &&
        normalizeTodoOccurrenceDateKey(entry?.date) === normalizedDate,
    );
    if (!removedEntries.length) {
      return {
        changed: false,
        removedEntries: [],
      };
    }
    dailyCheckins = dailyCheckins.filter(
      (entry) =>
        !(
          String(entry?.itemId || "").trim() === normalizedItemId &&
          normalizeTodoOccurrenceDateKey(entry?.date) === normalizedDate
        ),
    );
    return {
      changed: true,
      removedEntries: cloneTodoValue(removedEntries),
    };
  }

  function shouldCleanupRemovedLinkedPlanOccurrence(
    sourceType = "",
    sourceLike = null,
    dateText = "",
  ) {
    const normalizedType = normalizeTodoLinkedPlanSourceType(sourceType);
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (
      !normalizedType ||
      !sourceLike?.id ||
      !normalizedDate ||
      !hasTodoIncludedDate(sourceLike, normalizedDate)
    ) {
      return false;
    }
    const linkedPlan = getTodoLinkedPlanSnapshot(normalizedType, sourceLike.id);
    return !linkedPlan || !doesTodoLinkedPlanOccurOnDate(linkedPlan, normalizedDate);
  }

  async function syncTodoSourceAfterLinkedPlanOccurrenceRemoval(
    sourceType = "",
    sourceId = "",
    dateText = "",
  ) {
    const normalizedType = normalizeTodoLinkedPlanSourceType(sourceType);
    const normalizedSourceId = String(sourceId || "").trim();
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!normalizedType || !normalizedSourceId || !normalizedDate) {
      return false;
    }

    const sourceLike =
      normalizedType === "checkin"
        ? checkinItems.find((item) => matchesId(item.id, normalizedSourceId)) ||
          null
        : todos.find((todo) => matchesId(todo.id, normalizedSourceId)) || null;
    if (
      !sourceLike ||
      !shouldCleanupRemovedLinkedPlanOccurrence(
        normalizedType,
        sourceLike,
        normalizedDate,
      )
    ) {
      return false;
    }

    const previousSnapshot = captureTodoWorkspaceSnapshot();
    let changed = removeTodoIncludedDate(sourceLike, normalizedDate);
    if (getTodoLastResolvedOccurrenceDate(sourceLike) === normalizedDate) {
      setTodoLastResolvedOccurrenceDate(sourceLike, "");
      changed = true;
    }

    const nowIso = new Date().toISOString();
    let partialCore = {};
    let sectionSaves = [];
    let reason = "";
    let errorLabel = "";
    let rollbackMessage = "";

    if (normalizedType === "checkin") {
      const removedCheckins = removeTodoDailyCheckinEntriesOnDate(
        normalizedSourceId,
        normalizedDate,
      );
      changed = removedCheckins.changed || changed;
      if (!changed) {
        return false;
      }
      sourceLike.updatedAt = nowIso;
      updateCheckinHistorySummaryForDate(
        normalizedSourceId,
        normalizedDate,
        false,
        nowIso,
      );
      partialCore = {
        checkinItems: getTodoSectionStateSnapshot("checkinItems"),
        checkinHistorySummary: getCheckinHistorySummarySnapshot(),
      };
      sectionSaves = removedCheckins.changed
        ? [
            {
              section: "dailyCheckins",
              periodIds: [
                getTodoSectionPeriodId("dailyCheckins", {
                  date: normalizedDate,
                }),
              ],
              previousItems: removedCheckins.removedEntries,
              items: getTodoSectionStateSnapshot("dailyCheckins"),
            },
          ]
        : [];
      reason = "checkin-linked-plan-occurrence-delete-sync";
      errorLabel = "同步打卡关联计划删除状态失败:";
      rollbackMessage = "计划已删除，但关联打卡的临时打卡状态同步失败，请重试。";
    } else {
      changed = clearTodoCompletionStateOnDate(sourceLike, normalizedDate) || changed;
      if (!changed) {
        return false;
      }
      sourceLike.updatedAt = nowIso;
      partialCore = {
        todos: getTodoSectionStateSnapshot("todos"),
      };
      reason = "todo-linked-plan-occurrence-delete-sync";
      errorLabel = "同步待办关联计划删除状态失败:";
      rollbackMessage = "计划已删除，但关联待办的临时完成状态同步失败，请重试。";
    }

    invalidateTodoDerivedCaches();
    scheduleTodoInterfaceRefresh();
    const saved = await queueTodoSaveWithLinkedPlan({
      partialCore,
      sectionSaves,
      reason,
      errorLabel,
      refreshReminders: true,
    });
    if (saved === false) {
      await rollbackTodoOptimisticChange(previousSnapshot, {
        title: "同步失败",
        message: rollbackMessage,
      });
      return false;
    }
    return true;
  }

  function buildTodoLinkedPlanJournalOperations(
    allPlans = [],
    previousPlan = null,
    nextPlan = null,
  ) {
    const normalizedPlans = Array.isArray(allPlans) ? allPlans : [];
    const oneTimePlans = normalizedPlans.filter(
      (plan) =>
        String(plan?.repeat || "none")
          .trim()
          .toLowerCase() === "none",
    );
    const recurringPlans = normalizedPlans.filter((plan) =>
      isTodoLinkedPlanRecurring(plan),
    );
    const normalizeMutationPlanList = (planLike) => {
      const rawList = Array.isArray(planLike)
        ? planLike
        : planLike && typeof planLike === "object"
          ? [planLike]
          : [];
      const seenPlanIds = new Set();
      return rawList
        .filter((entry) => entry && typeof entry === "object")
        .filter((entry) => {
          const planId = String(entry?.id || "").trim();
          if (!planId) {
            return true;
          }
          if (seenPlanIds.has(planId)) {
            return false;
          }
          seenPlanIds.add(planId);
          return true;
        })
        .map((entry) => cloneTodoValue(entry));
    };
    const previousPlans = normalizeMutationPlanList(previousPlan);
    const nextPlans = normalizeMutationPlanList(nextPlan);
    const periodIds = Array.from(
      new Set(
        [...previousPlans, ...nextPlans]
          .filter(
            (plan) =>
              plan &&
              String(plan?.repeat || "none")
                .trim()
                .toLowerCase() === "none",
          )
          .map((plan) => getTodoLinkedPlanPeriodId(plan))
          .filter(Boolean),
      ),
    );
    const operations = periodIds.map((periodId) => ({
      kind: "saveSectionRange",
      section: "plans",
      payload: {
        periodId,
        items: oneTimePlans.filter(
          (plan) => getTodoLinkedPlanPeriodId(plan) === periodId,
        ),
        mode: "replace",
      },
    }));
    if (
      [...previousPlans, ...nextPlans].some((planLike) =>
        isTodoLinkedPlanRecurring(planLike),
      )
    ) {
      operations.push({
        kind: "replaceRecurringPlans",
        items: recurringPlans,
      });
    }
    return operations;
  }

  function normalizeTodoSectionSaveEntries(sectionSaves = [], options = {}) {
    return (Array.isArray(sectionSaves) ? sectionSaves : [])
      .map((entry = {}) => {
        const section =
          entry?.section === "dailyCheckins" || entry?.section === "checkins"
            ? entry.section
            : "";
        if (!section) {
          return null;
        }
        const currentItems = hydrateTodoCollection(
          section,
          Array.isArray(entry?.items)
            ? entry.items
            : getTodoSectionStateSnapshot(section),
        );
        const previousItems = hydrateTodoCollection(
          section,
          Array.isArray(entry?.previousItems) ? entry.previousItems : [],
        );
        const explicitPeriodIds = getTodoNormalizedPeriodIds(entry?.periodIds);
        const previousPeriodIds = getTodoSectionPeriodIds(section, previousItems);
        const periodIds = explicitPeriodIds.length
          ? explicitPeriodIds
          : getTodoNormalizedPeriodIds([
              ...getTodoSectionPeriodIds(section, currentItems),
              ...previousPeriodIds,
            ]);
        return {
          section,
          currentItems,
          previousItems,
          periodIds,
          itemsAreAuthoritative:
            options?.itemsAreAuthoritative === true ||
            entry?.itemsAreAuthoritative === true,
        };
      })
      .filter((entry) => !!entry && entry.periodIds.length > 0);
  }

  function getTodoSectionMergeKey(section, item = {}) {
    const source = item && typeof item === "object" ? item : {};
    if (source.id) {
      return `id:${String(source.id)}`;
    }
    switch (section) {
      case "dailyCheckins":
        return [source.itemId || "", source.date || ""].join("|");
      case "checkins":
        return [source.todoId || "", source.time || "", source.message || ""].join(
          "|",
        );
      default:
        return JSON.stringify(source);
    }
  }

  function sortTodoPartitionSectionItems(section, items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    if (typeof storageBundleApi?.sortPartitionItems === "function") {
      return storageBundleApi.sortPartitionItems(section, safeItems);
    }
    return safeItems.slice();
  }

  async function loadTodoSectionItemsByPeriodsFromStorage(section, periodIds = []) {
    const normalizedPeriodIds = getTodoNormalizedPeriodIds(periodIds);
    const bundleStorage = window.ControlerStorage;
    if (typeof bundleStorage?.loadSectionRange === "function") {
      const range = await bundleStorage.loadSectionRange(section, {
        periodIds: normalizedPeriodIds,
        authoritative: true,
      });
      return hydrateTodoCollection(
        section,
        Array.isArray(range?.items) ? range.items : [],
      );
    }
    const periodIdSet = new Set(normalizedPeriodIds);
    return hydrateTodoCollection(section, getTodoSectionStateSnapshot(section)).filter(
      (item) =>
        !periodIdSet.size || periodIdSet.has(getTodoSectionPeriodId(section, item)),
    );
  }

  function replaceTodoSectionItemsForPeriod(
    section,
    items = [],
    periodId = "",
    nextPeriodItems = [],
  ) {
    const normalizedPeriodId = String(periodId || "").trim();
    const preservedItems = (Array.isArray(items) ? items : []).filter(
      (item) => getTodoSectionPeriodId(section, item) !== normalizedPeriodId,
    );
    return sortTodoPartitionSectionItems(section, [
      ...preservedItems,
      ...(Array.isArray(nextPeriodItems) ? nextPeriodItems : []),
    ]);
  }

  function reconcileTodoSectionPeriodItems(
    section,
    existingItems = [],
    currentItems = [],
    previousItems = [],
  ) {
    const merged = new Map();
    sortTodoPartitionSectionItems(section, existingItems).forEach((item) => {
      merged.set(
        getTodoSectionMergeKey(section, item),
        cloneTodoValue(item),
      );
    });
    (Array.isArray(previousItems) ? previousItems : []).forEach((item) => {
      merged.delete(getTodoSectionMergeKey(section, item));
    });
    sortTodoPartitionSectionItems(section, currentItems).forEach((item) => {
      merged.set(
        getTodoSectionMergeKey(section, item),
        cloneTodoValue(item),
      );
    });
    return sortTodoPartitionSectionItems(section, Array.from(merged.values()));
  }

  async function buildTodoSectionSaveOperations(sectionSaves = []) {
    const normalizedEntries = normalizeTodoSectionSaveEntries(sectionSaves);
    if (!normalizedEntries.length) {
      return [];
    }

    const loadedSectionItems = new Map();
    await Promise.all(
      Array.from(
        normalizedEntries.reduce((grouped, entry) => {
          if (!grouped.has(entry.section)) {
            grouped.set(entry.section, new Set());
          }
          entry.periodIds.forEach((periodId) => {
            grouped.get(entry.section).add(periodId);
          });
          return grouped;
        }, new Map()),
      ).map(async ([section, periodIdSet]) => {
        loadedSectionItems.set(
          section,
          await loadTodoSectionItemsByPeriodsFromStorage(
            section,
            Array.from(periodIdSet),
          ),
        );
      }),
    );

    const workingSectionItems = new Map(
      Array.from(loadedSectionItems.entries()).map(([section, items]) => [
        section,
        sortTodoPartitionSectionItems(section, items),
      ]),
    );

    normalizedEntries.forEach((entry) => {
      let workingItems = workingSectionItems.get(entry.section) || [];
      entry.periodIds.forEach((periodId) => {
        const currentPeriodItems = entry.currentItems.filter(
          (item) => getTodoSectionPeriodId(entry.section, item) === periodId,
        );
        const previousPeriodItems = entry.previousItems.filter(
          (item) => getTodoSectionPeriodId(entry.section, item) === periodId,
        );
        const nextPeriodItems = entry.itemsAreAuthoritative
          ? sortTodoPartitionSectionItems(entry.section, currentPeriodItems)
          : reconcileTodoSectionPeriodItems(
              entry.section,
              workingItems.filter(
                (item) => getTodoSectionPeriodId(entry.section, item) === periodId,
              ),
              currentPeriodItems,
              previousPeriodItems,
            );
        workingItems = replaceTodoSectionItemsForPeriod(
          entry.section,
          workingItems,
          periodId,
          nextPeriodItems,
        );
      });
      workingSectionItems.set(entry.section, workingItems);
      todoLoadedSectionPeriods[entry.section] = new Set(
        getTodoSectionPeriodIds(entry.section, entry.currentItems),
      );
    });

    return normalizedEntries.flatMap((entry) => {
      const workingItems = workingSectionItems.get(entry.section) || [];
      return entry.periodIds.map((periodId) => ({
        kind: "saveSectionRange",
        section: entry.section,
        payload: {
          periodId,
          items: workingItems.filter(
            (item) => getTodoSectionPeriodId(entry.section, item) === periodId,
          ),
          mode: "replace",
        },
      }));
    });
  }

  function persistTodoLinkedPlanLocalMirror(allPlans = []) {
    if (!shouldPersistTodoSharedLocalMirror()) {
      return;
    }
    try {
      localStorage.setItem("plans", JSON.stringify(allPlans));
    } catch (error) {
      console.error("回写本地计划镜像失败:", error);
    }
  }

  function queueTodoSaveWithLinkedPlan(options = {}) {
    const partialCore =
      options?.partialCore &&
      typeof options.partialCore === "object" &&
      !Array.isArray(options.partialCore)
        ? normalizeTodoCoreUpdate(options.partialCore)
        : {};
    const changedCoreSections = getTodoNormalizedChangedSections(
      Object.keys(partialCore),
    );
    if (changedCoreSections.length) {
      persistTodoLocalMirrorCore(partialCore);
      markTodoSelfRefreshIgnored(changedCoreSections);
    }

    const sectionSaves = normalizeTodoSectionSaveEntries(options?.sectionSaves);
    sectionSaves.forEach((entry) => {
      persistTodoLocalSection(entry.section, entry.currentItems);
      if (entry.periodIds.length) {
        markTodoSelfRefreshIgnored([entry.section], {
          [entry.section]: entry.periodIds,
        });
      }
    });

    const linkedPlanMutation =
      options?.linkedPlanMutation &&
      typeof options.linkedPlanMutation === "object"
        ? options.linkedPlanMutation
        : null;
    if (linkedPlanMutation?.allPlans) {
      persistTodoLinkedPlanLocalMirror(linkedPlanMutation.allPlans);
    }

    const linkedPlanOperations = buildTodoLinkedPlanJournalOperations(
      linkedPlanMutation?.allPlans || [],
      linkedPlanMutation?.previousPlans ||
        linkedPlanMutation?.previousPlan ||
        null,
      linkedPlanMutation?.nextPlans || linkedPlanMutation?.nextPlan || null,
    );

    if (
      !changedCoreSections.length &&
      !sectionSaves.length &&
      !linkedPlanOperations.length
    ) {
      return Promise.resolve(true);
    }

    return queueTodoPersistenceTask(
      async () => {
        const bundleStorage = window.ControlerStorage;
        const sectionOperations = await buildTodoSectionSaveOperations(sectionSaves);
        const journalOperations = [
          ...(changedCoreSections.length
            ? [
                {
                  kind: "replaceCoreState",
                  partialCore: cloneTodoValue(partialCore),
                },
              ]
            : []),
          ...sectionOperations,
          ...linkedPlanOperations,
        ];
        if (!journalOperations.length) {
          return true;
        }
        if (typeof bundleStorage?.appendJournal === "function") {
          await bundleStorage.appendJournal(journalOperations, {
            reason:
              typeof options?.reason === "string" && options.reason.trim()
                ? options.reason.trim()
                : "todo-linked-plan-save",
          });
          return true;
        }

        if (changedCoreSections.length && typeof bundleStorage?.replaceCoreState === "function") {
          await bundleStorage.replaceCoreState(cloneTodoValue(partialCore), {
            reason:
              typeof options?.reason === "string" && options.reason.trim()
                ? options.reason.trim()
                : "todo-linked-plan-save",
          });
        }

        if (sectionOperations.length && typeof bundleStorage?.saveSectionRange === "function") {
          await Promise.all(
            sectionOperations.map((operation) =>
              bundleStorage.saveSectionRange(operation.section, operation.payload),
            ),
          );
        }

        for (const operation of linkedPlanOperations) {
          if (
            operation.kind === "saveSectionRange" &&
            typeof bundleStorage?.saveSectionRange === "function"
          ) {
            await bundleStorage.saveSectionRange(
              operation.section,
              operation.payload,
            );
            continue;
          }
          if (
            operation.kind === "replaceRecurringPlans" &&
            typeof bundleStorage?.replaceRecurringPlans === "function"
          ) {
            await bundleStorage.replaceRecurringPlans(operation.items || []);
          }
        }
        return true;
      },
      {
        errorLabel: options?.errorLabel || "保存待办与计划联动数据失败:",
        refreshReminders: options?.refreshReminders === true,
      },
    );
  }

  function queueTodoSaveWithAuthoritativeSections(options = {}) {
    return queueTodoSaveWithLinkedPlan({
      ...options,
      sectionSaves: (Array.isArray(options?.sectionSaves) ? options.sectionSaves : []).map(
        (entry = {}) => ({
          ...entry,
          itemsAreAuthoritative: true,
        }),
      ),
    });
  }

  function handleTodoNonBlockingSaveFailure(message, options = {}) {
    console.error(message, options.error || "");
    const rollbackSnapshot =
      options?.rollbackSnapshot &&
      typeof options.rollbackSnapshot === "object" &&
      !Array.isArray(options.rollbackSnapshot)
        ? options.rollbackSnapshot
        : null;
    const retainedSnapshot = mergeTodoWorkspaceSnapshot(
      options?.retainedSnapshot,
      rollbackSnapshot || captureTodoWorkspaceSnapshot(),
    );
    if (rollbackSnapshot) {
      applyTodoWorkspaceSnapshot(retainedSnapshot);
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
            applyTodoWorkspaceSnapshot(
              mergeTodoWorkspaceSnapshot(result.state, retainedSnapshot),
            );
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
    invalidateTodoDeferredFreshSyncForLocalToggle(
      `${kind === "checkin" ? "checkin" : "todo"}-toggle-local-mutation`,
    );
    controller.pending = true;
    controller.buildCommitPlan = buildCommitPlan;
    if (!controller.rollbackSnapshot && rollbackSnapshot) {
      controller.rollbackSnapshot = rollbackSnapshot;
    }
    if (controller.timer) {
      window.clearTimeout(controller.timer);
    }
    if (TODO_TOGGLE_PERSIST_DEBOUNCE_MS <= 0) {
      controller.timer = 0;
      void flushTodoToggleCommit(kind, normalizedId);
      return true;
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
      if (!todoInitialDataValidated && !hasTodoPendingLocalMutations()) {
        scheduleTodoDeferredFreshSync();
      }
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
    const protectedSnapshot = mergeTodoWorkspaceSnapshot(nextSnapshot);
    const bundleStorage = window.ControlerStorage;
    const sectionSaves = ["dailyCheckins", "checkins"]
      .map((section) => ({
        section,
        items: protectedSnapshot[section] || [],
        periodIds: Array.from(
          new Set([
            ...getTodoSectionPeriodIds(section, protectedSnapshot[section] || []),
            ...Array.from(todoLoadedSectionPeriods[section] || []),
          ]),
        ),
      }))
      .filter((entry) => entry.periodIds.length > 0);
    const sectionOperations = await buildTodoSectionSaveOperations(sectionSaves);
    if (typeof bundleStorage?.appendJournal === "function") {
      ["dailyCheckins", "checkins"].forEach((section) => {
        const sectionEntry = sectionSaves.find((entry) => entry.section === section);
        todoLoadedSectionPeriods[section] = new Set(
          sectionEntry
            ? getTodoSectionPeriodIds(section, sectionEntry.items)
            : [],
        );
      });
      await bundleStorage.appendJournal(
        [
          {
            kind: "replaceCoreState",
            partialCore: {
              todos: cloneTodoValue(protectedSnapshot.todos || []),
              checkinItems: cloneTodoValue(
                protectedSnapshot.checkinItems || [],
              ),
              checkinHistorySummary: normalizeCheckinHistorySummary(
                protectedSnapshot.checkinHistorySummary,
              ),
            },
          },
          ...sectionOperations,
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
      await bundleStorage.replaceCoreState(
        {
          todos: cloneTodoValue(protectedSnapshot.todos || []),
          checkinItems: cloneTodoValue(protectedSnapshot.checkinItems || []),
          checkinHistorySummary: normalizeCheckinHistorySummary(
            protectedSnapshot.checkinHistorySummary,
          ),
        },
        {
          reason: "todo-workspace",
        },
      );
      if (sectionOperations.length) {
        await Promise.all(
          sectionOperations.map((operation) =>
            bundleStorage.saveSectionRange(operation.section, operation.payload),
          ),
        );
      } else {
        todoLoadedSectionPeriods.dailyCheckins = new Set();
        todoLoadedSectionPeriods.checkins = new Set();
      }
      return true;
    }

    localStorage.setItem(
      "todos",
      JSON.stringify(protectedSnapshot.todos || []),
    );
    localStorage.setItem(
      "checkins",
      JSON.stringify(protectedSnapshot.checkins || []),
    );
    localStorage.setItem(
      "checkinItems",
      JSON.stringify(protectedSnapshot.checkinItems || []),
    );
    localStorage.setItem(
      "checkinHistorySummary",
      JSON.stringify(
        normalizeCheckinHistorySummary(protectedSnapshot.checkinHistorySummary),
      ),
    );
    localStorage.setItem(
      "dailyCheckins",
      JSON.stringify(protectedSnapshot.dailyCheckins || []),
    );
    return true;
  }

  function queueTodoPersist() {
    const snapshot = mergeTodoWorkspaceSnapshot({
      todos: cloneTodoValue(todos),
      checkinItems: cloneTodoValue(checkinItems),
      checkinHistorySummary: cloneTodoValue(checkinHistorySummary),
      dailyCheckins: cloneTodoValue(dailyCheckins),
      checkins: cloneTodoValue(checkins),
    });
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

    document.body.classList.add(
      "desktop-widget-page",
      "desktop-widget-todo-page",
    );
    document.body.dataset.widgetKind =
      TODO_WIDGET_CONTEXT.kind ||
      (resolvePreferredTodoView() === "checkins" ? "checkins" : "todos");
    document.title =
      resolvePreferredTodoView() === "checkins"
        ? "打卡列表 小组件"
        : "待办事项 小组件";

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

    body.desktop-widget-todo-page .modal-overlay {
      padding: 12px;
      box-sizing: border-box;
      align-items: flex-start;
      overflow: auto;
    }

    body.desktop-widget-todo-page .modal-content {
      max-width: min(100%, 560px) !important;
      width: min(100%, 560px) !important;
      max-height: calc(100vh - 24px);
      overflow: auto;
    }
  `;
    document.head.appendChild(style);
  }

  function matchesId(left, right) {
    return String(left ?? "") === String(right ?? "");
  }

  function clampTodoReminderNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }

  function normalizeTodoReminderTimeText(value, fallback = "09:00") {
    const normalizedText = String(value || fallback || "09:00").trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(normalizedText);
    if (!match) {
      if (normalizedText === "09:00") {
        return "09:00";
      }
      return normalizeTodoReminderTimeText(fallback, "09:00");
    }
    const hours = clampTodoReminderNumber(match[1], 0, 23, 9);
    const minutes = clampTodoReminderNumber(match[2], 0, 59, 0);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function normalizeTodoReminderOffsetDays(value, fallback = 0) {
    return clampTodoReminderNumber(
      value,
      -30,
      30,
      clampTodoReminderNumber(fallback, -30, 30, 0),
    );
  }

  function hasStoredReminderPreference(rawNotification = {}) {
    if (!rawNotification || typeof rawNotification !== "object") {
      return false;
    }
    return [
      "enabled",
      "mode",
      "customTime",
      "customOffsetDays",
      "minutesBefore",
    ].some((key) => Object.prototype.hasOwnProperty.call(rawNotification, key));
  }

  function buildStartReminderSeed(
    startTime = "",
    endTime = "",
    minutesBefore = getReminderTools()?.DEFAULT_START_REMINDER_MINUTES || 5,
  ) {
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime,
      endTime,
    });
    if (
      !normalizedTimeRange.startTime ||
      !normalizedTimeRange.endTime ||
      normalizedTimeRange.startTime >= normalizedTimeRange.endTime
    ) {
      return null;
    }
    const sharedSeed = getReminderTools()?.buildStartReminderSeed?.(
      normalizedTimeRange.startTime,
      minutesBefore,
    );
    if (sharedSeed) {
      return sharedSeed;
    }
    const [hoursText, minutesText] = normalizedTimeRange.startTime.split(":");
    let totalMinutes =
      parseInt(hoursText, 10) * 60 +
      parseInt(minutesText, 10) -
      Math.max(1, Number(minutesBefore) || 5);
    let customOffsetDays = 0;
    while (totalMinutes < 0) {
      totalMinutes += 24 * 60;
      customOffsetDays -= 1;
    }
    return {
      customTime: `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`,
      customOffsetDays,
      minutesBefore: Math.max(1, Number(minutesBefore) || 5),
    };
  }

  function getTodoEffectiveEndDate({
    startDate = "",
    endDate = "",
    dueDate = "",
  } = {}) {
    return String(endDate || dueDate || "").trim();
  }

  function isTodoNonRepeatSingleDay({
    startDate = "",
    endDate = "",
    dueDate = "",
  } = {}) {
    const normalizedStartDate = String(startDate || dueDate || "").trim();
    const normalizedEndDate = getTodoEffectiveEndDate({
      startDate: normalizedStartDate,
      endDate,
      dueDate,
    });
    return (
      !!normalizedStartDate &&
      !!normalizedEndDate &&
      normalizedStartDate === normalizedEndDate
    );
  }

  function inferTodoReminderMode(
    rawNotification = {},
    allowedModes = [],
    fallback = "none",
  ) {
    const rawMode = String(rawNotification?.mode || "").trim();
    if (allowedModes.includes(rawMode)) {
      return rawMode;
    }
    if (rawNotification?.enabled === false) {
      return "none";
    }
    if (allowedModes.includes("before_start") && rawNotification?.minutesBefore != null) {
      return "before_start";
    }
    if (rawNotification?.customTime) {
      return "custom";
    }
    return fallback;
  }

  function normalizeTodoNotificationConfigFallback(
    rawNotification,
    todoLike = {},
  ) {
    const reminder =
      rawNotification && typeof rawNotification === "object" ? rawNotification : {};
    const defaultSeed = buildStartReminderSeed(
      todoLike?.startTime,
      todoLike?.endTime,
    );
    const mode = inferTodoReminderMode(
      reminder,
      ["none", "custom"],
      !hasStoredReminderPreference(reminder) && defaultSeed ? "custom" : "none",
    );
    return {
      enabled: mode !== "none" && reminder.enabled !== false,
      mode,
      customTime: normalizeTodoReminderTimeText(
        reminder.customTime || defaultSeed?.customTime || "09:00",
      ),
      customOffsetDays: normalizeTodoReminderOffsetDays(
        reminder.customOffsetDays,
        defaultSeed?.customOffsetDays || 0,
      ),
    };
  }

  function normalizeCheckinNotificationConfigFallback(
    rawNotification,
    itemLike = {},
  ) {
    const reminder =
      rawNotification && typeof rawNotification === "object" ? rawNotification : {};
    const defaultSeed = buildStartReminderSeed(
      itemLike?.startTime,
      itemLike?.endTime,
    );
    const mode = inferTodoReminderMode(
      reminder,
      ["none", "custom"],
      !hasStoredReminderPreference(reminder) && defaultSeed ? "custom" : "none",
    );
    return {
      enabled: mode !== "none" && reminder.enabled !== false,
      mode,
      customTime: normalizeTodoReminderTimeText(
        reminder.customTime ||
          defaultSeed?.customTime ||
          itemLike?.customTime ||
          "09:00",
      ),
      customOffsetDays: normalizeTodoReminderOffsetDays(
        reminder.customOffsetDays,
        defaultSeed?.customOffsetDays || 0,
      ),
    };
  }

  function normalizeTodoNotificationConfig(rawNotification, todoLike = {}) {
    return (
      getReminderTools()?.normalizeTodoReminder?.(rawNotification, todoLike) ||
      normalizeTodoNotificationConfigFallback(rawNotification, todoLike)
    );
  }

  function normalizeCheckinNotificationConfig(rawNotification, itemLike = {}) {
    return (
      getReminderTools()?.normalizeCheckinReminder?.(rawNotification, itemLike) ||
      normalizeCheckinNotificationConfigFallback(rawNotification, itemLike)
    );
  }

  function getTodoReminderBaseDate(todoLike = null) {
    return (
      todoLike?._occurrenceDate ||
      todoLike?.startDate ||
      todoLike?.dueDate ||
      getLocalDateText()
    );
  }

  function normalizeReminderDateInputText(value, fallback = "") {
    const normalizedText = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedText)) {
      return normalizedText;
    }
    const fallbackText = String(fallback || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(fallbackText) ? fallbackText : "";
  }

  function normalizeTodoReminderCustomTimeInputValue(
    value,
    fallback = "09:00",
  ) {
    return (
      normalizeTodoTimeText(value) || normalizeTodoReminderTimeText(value, fallback)
    );
  }

  function splitReminderDateTimeValueParts(
    dateTimeValue,
    fallbackDateText,
    fallbackTimeText,
    normalizeTimeText,
  ) {
    const normalizedValue = String(dateTimeValue || "").trim();
    const separatorIndex = normalizedValue.indexOf("T");
    const dateText =
      separatorIndex >= 0
        ? normalizedValue.slice(0, separatorIndex)
        : normalizedValue;
    const timeText =
      separatorIndex >= 0 ? normalizedValue.slice(separatorIndex + 1) : "";
    return {
      dateText: normalizeReminderDateInputText(dateText, fallbackDateText),
      timeText: normalizeTimeText(
        timeText || fallbackTimeText,
        fallbackTimeText,
      ),
    };
  }

  function buildReminderDateTimeValueFromParts(
    dateText,
    timeText,
    fallbackDateText,
    fallbackTimeText,
    normalizeTimeText,
  ) {
    const normalizedDateText = normalizeReminderDateInputText(
      dateText,
      fallbackDateText,
    );
    const normalizedTimeText = normalizeTimeText(timeText, fallbackTimeText);
    return normalizedDateText
      ? `${normalizedDateText}T${normalizedTimeText}`
      : "";
  }

  function resolveTodoReminderCustomInputParts(
    baseDateText,
    reminderConfig,
    fallbackTimeText = "09:00",
  ) {
    const resolvedFallbackTime = normalizeTodoReminderCustomTimeInputValue(
      fallbackTimeText,
      "09:00",
    );
    const customDateTimeValue =
      getReminderTools()?.buildRelativeCustomDateTimeValue?.(
        baseDateText,
        reminderConfig,
        resolvedFallbackTime,
      ) ||
      buildReminderDateTimeValueFromParts(
        baseDateText,
        reminderConfig?.customTime || resolvedFallbackTime,
        baseDateText,
        resolvedFallbackTime,
        normalizeTodoReminderCustomTimeInputValue,
      );
    return splitReminderDateTimeValueParts(
      customDateTimeValue,
      baseDateText,
      resolvedFallbackTime,
      normalizeTodoReminderCustomTimeInputValue,
    );
  }

  function parseTodoReminderCustomInputParts(
    dateText,
    timeText,
    baseDateText,
    options = {},
  ) {
    const fallbackTimeText = normalizeTodoReminderCustomTimeInputValue(
      options?.fallbackTime || "09:00",
      "09:00",
    );
    const fallbackOffsetDays = normalizeTodoReminderOffsetDays(
      options?.fallbackOffsetDays,
      0,
    );
    const customDateTimeValue = buildReminderDateTimeValueFromParts(
      dateText,
      timeText,
      baseDateText,
      fallbackTimeText,
      normalizeTodoReminderCustomTimeInputValue,
    );
    return (
      getReminderTools()?.parseRelativeCustomDateTimeInput?.(
        customDateTimeValue,
        baseDateText,
        {
          fallbackTime: fallbackTimeText,
          fallbackOffsetDays,
        },
      ) || {
        customTime: fallbackTimeText,
        customOffsetDays: fallbackOffsetDays,
      }
    );
  }

  function getTodoReminderSectionHtml(todo = null, prefix = "todo") {
    const baseDateText = getTodoReminderBaseDate(todo);
    const reminderConfig = normalizeTodoNotificationConfig(todo?.notification, {
      ...todo,
      dueDate: todo?.dueDate || baseDateText,
      startDate: todo?.startDate || baseDateText,
    });
    const customReminderParts = resolveTodoReminderCustomInputParts(
      baseDateText,
      reminderConfig,
      reminderConfig.customTime || "09:00",
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
          提醒时间
        </label>
        <div class="modal-date-range controler-form-modal-date-range" style="display: flex; gap: 10px;">
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
              提醒日期
            </label>
            <input
              type="date"
              id="${prefix}-notification-custom-date-input"
              class="modal-date-input themed-native-picker-input"
              value="${customReminderParts.dateText}"
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
          </div>
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
              提醒时间
            </label>
            <input
              type="text"
              id="${prefix}-notification-custom-time-input"
              class="modal-date-input controler-time-text-input"
              value="${customReminderParts.timeText}"
              placeholder="？？：？？"
              inputmode="numeric"
              maxlength="5"
              spellcheck="false"
              autocomplete="off"
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
          </div>
        </div>
        <div style="margin-top: 8px; color: var(--muted-text-color); font-size: 12px; line-height: 1.5;">
          若待办启用了重复或使用“开始日期 - 结束日期”模式，将按相同的相对提醒时间同步到后续重复日期。
        </div>
      </div>
    </div>
  `;
  }

  function bindTodoReminderInputs(modal, prefix = "todo", options = {}) {
    const radios = modal.querySelectorAll(
      `input[name="${prefix}-notification-mode"]`,
    );
    const customWrap = modal.querySelector(
      `#${prefix}-notification-custom-wrap`,
    );
    const customDateInput = modal.querySelector(
      `#${prefix}-notification-custom-date-input`,
    );
    const customTimeInput = modal.querySelector(
      `#${prefix}-notification-custom-time-input`,
    );
    const noneRadio = modal.querySelector(
      `input[name="${prefix}-notification-mode"][value="none"]`,
    );
    const customRadio = modal.querySelector(
      `input[name="${prefix}-notification-mode"][value="custom"]`,
    );
    const startDateInput = modal.querySelector("#todo-start-date-input");
    const startTimeInput = modal.querySelector("#todo-start-time-input");
    const endTimeInput = modal.querySelector("#todo-end-time-input");
    const repeatInputs = modal.querySelectorAll(
      'input[name="todo-repeat-type"]',
    );
    const hasPersistedPreference =
      getReminderTools()?.hasStoredReminderPreference?.(
        options?.todoLike?.notification,
      ) || hasStoredReminderPreference(options?.todoLike?.notification);
    let reminderTouched = hasPersistedPreference;
    let applyingDefaultMode = false;
    let lastBaseDateText = startDateInput?.value || getLocalDateText();

    const syncReminderMode = () => {
      const activeMode =
        modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
          ?.value || "none";
      if (customWrap) {
        customWrap.style.display = activeMode === "custom" ? "block" : "none";
      }
    };

    const syncCustomReminderInput = () => {
      if (
        !(customDateInput instanceof HTMLInputElement) ||
        !(customTimeInput instanceof HTMLInputElement)
      ) {
        return;
      }
      const baseDateText = startDateInput?.value || getLocalDateText();
      const defaultSeed = buildStartReminderSeed(
        startTimeInput?.value,
        endTimeInput?.value,
      );
      const currentConfig =
        !hasPersistedPreference && !reminderTouched && defaultSeed
          ? defaultSeed
          : parseTodoReminderCustomInputParts(
              customDateInput.value,
              customTimeInput.value,
              lastBaseDateText,
              {
                fallbackTime: defaultSeed?.customTime || "09:00",
                fallbackOffsetDays: defaultSeed?.customOffsetDays || 0,
              },
            );
      const nextParts = resolveTodoReminderCustomInputParts(
        baseDateText,
        currentConfig,
        currentConfig.customTime || defaultSeed?.customTime || "09:00",
      );
      customDateInput.value = nextParts.dateText;
      customTimeInput.value = nextParts.timeText;
      lastBaseDateText = baseDateText;
    };

    const syncReminderDefaults = () => {
      const defaultSeed = buildStartReminderSeed(
        startTimeInput?.value,
        endTimeInput?.value,
      );
      if (!hasPersistedPreference && !reminderTouched) {
        applyingDefaultMode = true;
        if (defaultSeed) {
          customRadio && (customRadio.checked = true);
        } else {
          noneRadio && (noneRadio.checked = true);
        }
        applyingDefaultMode = false;
      }
      syncReminderMode();
      syncCustomReminderInput();
    };

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!applyingDefaultMode) {
          reminderTouched = true;
        }
        syncReminderMode();
        syncCustomReminderInput();
      });
    });
    customDateInput?.addEventListener("change", () => {
      reminderTouched = true;
      syncCustomReminderInput();
    });
    customTimeInput?.addEventListener("input", () => {
      reminderTouched = true;
    });
    customTimeInput?.addEventListener("change", () => {
      reminderTouched = true;
      syncCustomReminderInput();
    });
    startDateInput?.addEventListener("change", syncReminderDefaults);
    startTimeInput?.addEventListener("change", syncReminderDefaults);
    endTimeInput?.addEventListener("change", syncReminderDefaults);
    repeatInputs.forEach((input) => {
      input.addEventListener("change", syncReminderDefaults);
    });
    syncReminderDefaults();
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
    const defaultSeed = buildStartReminderSeed(
      todoLike?.startTime,
      todoLike?.endTime,
    );
    const parsedCustomConfig = parseTodoReminderCustomInputParts(
      modal.querySelector(`#${prefix}-notification-custom-date-input`)?.value ||
        "",
      modal.querySelector(`#${prefix}-notification-custom-time-input`)?.value ||
        "",
      baseDateText,
      {
        fallbackTime: defaultSeed?.customTime || "09:00",
        fallbackOffsetDays: defaultSeed?.customOffsetDays || 0,
      },
    );
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
          type="text"
          id="${prefix}-notification-time-input"
          class="modal-date-input controler-time-text-input"
          value="${reminderConfig.customTime}"
          data-reminder-offset-days="${reminderConfig.customOffsetDays || 0}"
          placeholder="？？：？？"
          inputmode="numeric"
          maxlength="5"
          spellcheck="false"
          autocomplete="off"
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

  function bindCheckinReminderInputs(modal, prefix = "checkin", options = {}) {
    const radios = modal.querySelectorAll(
      `input[name="${prefix}-notification-mode"]`,
    );
    const customWrap = modal.querySelector(
      `#${prefix}-notification-custom-wrap`,
    );
    const customInput = modal.querySelector(
      `#${prefix}-notification-time-input`,
    );
    const noneRadio = modal.querySelector(
      `input[name="${prefix}-notification-mode"][value="none"]`,
    );
    const customRadio = modal.querySelector(
      `input[name="${prefix}-notification-mode"][value="custom"]`,
    );
    const startTimeInput = modal.querySelector("#checkin-start-time-input");
    const endTimeInput = modal.querySelector("#checkin-end-time-input");
    const hasPersistedPreference =
      getReminderTools()?.hasStoredReminderPreference?.(
        options?.itemLike?.notification,
      ) || hasStoredReminderPreference(options?.itemLike?.notification);
    let reminderTouched = hasPersistedPreference;
    let customInputDirty = false;
    let applyingDefaultMode = false;

    const syncReminderMode = () => {
      const activeMode =
        modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
          ?.value || "none";
      if (customWrap) {
        customWrap.style.display = activeMode === "custom" ? "block" : "none";
      }
    };

    const syncReminderDefaults = () => {
      const defaultSeed = buildStartReminderSeed(
        startTimeInput?.value,
        endTimeInput?.value,
      );
      if (!hasPersistedPreference && !reminderTouched) {
        applyingDefaultMode = true;
        if (defaultSeed) {
          customRadio && (customRadio.checked = true);
        } else {
          noneRadio && (noneRadio.checked = true);
        }
        applyingDefaultMode = false;
      }
      syncReminderMode();
      if (
        customInput instanceof HTMLInputElement &&
        !customInputDirty &&
        !hasPersistedPreference &&
        defaultSeed
      ) {
        customInput.value = defaultSeed.customTime;
        customInput.dataset.reminderOffsetDays = String(
          defaultSeed.customOffsetDays || 0,
        );
      }
    };

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!applyingDefaultMode) {
          reminderTouched = true;
        }
        syncReminderMode();
      });
    });
    customInput?.addEventListener("input", () => {
      customInputDirty = true;
      reminderTouched = true;
      customInput.dataset.reminderOffsetDays = "0";
    });
    customInput?.addEventListener("change", () => {
      customInputDirty = true;
      reminderTouched = true;
      customInput.dataset.reminderOffsetDays = "0";
    });
    startTimeInput?.addEventListener("change", syncReminderDefaults);
    endTimeInput?.addEventListener("change", syncReminderDefaults);
    syncReminderDefaults();
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
          modal.querySelector(`#${prefix}-notification-time-input`)?.value ||
          "09:00",
        customOffsetDays:
          modal.querySelector(`#${prefix}-notification-time-input`)?.dataset
            ?.reminderOffsetDays || 0,
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
    const progress =
      actionWidth > 0 ? Math.min(1, Math.abs(clampedOffset) / actionWidth) : 0;
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
    const exceptShell =
      options?.except instanceof HTMLElement ? options.except : null;
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
        if (
          target instanceof Node &&
          todoActiveSwipeDeleteShell.contains(target)
        ) {
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
    if (
      !(surface instanceof HTMLElement) ||
      !(deleteButton instanceof HTMLButtonElement)
    ) {
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
    let lastDeleteTriggerAt = 0;

    const getOffset = () =>
      Number.parseFloat(shell.dataset.swipeOffset || "0") || 0;
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
      const eventTarget = getTodoEventTargetElement(event);
      if (
        eventTarget &&
        eventTarget.closest(
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
      if (
        !isPointerDown ||
        pointerId !== event.pointerId ||
        !isTodoSwipeDeleteEnabled()
      ) {
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
          Math.abs(finalOffset) >=
          actionWidth * MOBILE_SWIPE_DELETE_OPEN_THRESHOLD;
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

    const triggerDeleteAction = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      if (deletePending) {
        return;
      }
      const now = Date.now();
      if (now - lastDeleteTriggerAt < 320) {
        return;
      }
      lastDeleteTriggerAt = now;
      deletePending = true;
      todoSwipeDeleteConfirmationShell = shell;
      deleteButton.disabled = true;
      shell.dataset.deletePending = "true";
      try {
        const deleteResult =
          (typeof options.onDelete === "function"
            ? await options.onDelete()
            : false) === true;
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

    const handleDeletePointerDown = (event) => {
      event.stopPropagation();
    };

    const handleDeleteActivate = (event) => {
      void triggerDeleteAction(event);
    };

    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("pointermove", handlePointerMove);
    surface.addEventListener("pointerup", handlePointerEnd);
    surface.addEventListener("pointercancel", handlePointerEnd);
    surface.addEventListener("lostpointercapture", handlePointerEnd);
    surface.addEventListener("click", handleClickCapture, true);
    deleteButton.addEventListener("pointerdown", handleDeletePointerDown);
    deleteButton.addEventListener("click", handleDeleteActivate);

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
        deleteButton.removeEventListener(
          "pointerdown",
          handleDeletePointerDown,
        );
        deleteButton.removeEventListener("click", handleDeleteActivate);
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
    deleteButton.title =
      options.kind === "checkin" ? "删除打卡项目" : "删除待办事项";
    deleteButton.style.touchAction = "manipulation";
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
    if (value === "monthly") return "monthly";
    return "none";
  }

  function normalizeTodoMonthDayList(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((day) => Number.parseInt(day, 10))
          .filter((day) => Number.isFinite(day) && day >= 1 && day <= 31),
      ),
    ).sort((left, right) => left - right);
  }

  function normalizeTodoTimeText(value = "") {
    const normalizedText = String(value || "").trim();
    if (!normalizedText) {
      return "";
    }
    const formatNormalizedTime = (hoursText, minutesText) => {
      const hours = Number.parseInt(hoursText, 10);
      const minutes = Number.parseInt(minutesText, 10);
      if (
        !Number.isFinite(hours) ||
        !Number.isFinite(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
      ) {
        return "";
      }
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };
    const explicitMatch = /^(\d{1,2}):(\d{1,2})$/.exec(normalizedText);
    if (explicitMatch) {
      return formatNormalizedTime(explicitMatch[1], explicitMatch[2]);
    }
    const minuteOnlyMatch = /^:(\d{1,2})$/.exec(normalizedText);
    if (minuteOnlyMatch) {
      return formatNormalizedTime("00", minuteOnlyMatch[1]);
    }
    const hourOnlyMatch = /^(\d{1,2}):?$/.exec(normalizedText);
    if (hourOnlyMatch) {
      return (
        formatNormalizedTime(hourOnlyMatch[1], "00") ||
        formatNormalizedTime("00", hourOnlyMatch[1])
      );
    }
    return "";
  }

  function normalizeTodoTimeRangeFields({
    startTime = "",
    endTime = "",
  } = {}) {
    const normalizedStartTime = normalizeTodoTimeText(startTime);
    const normalizedEndTime = normalizeTodoTimeText(endTime);
    return {
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
    };
  }

  function normalizeTodoScheduleFields({
    dueDate = "",
    repeatType = "none",
    repeatWeekdays = [],
    repeatMonthDays = [],
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
    const normalizedRepeatMonthDays =
      normalizedRepeatType === "monthly"
        ? normalizeTodoMonthDayList(repeatMonthDays)
        : [];
    const normalizedStartDate =
      normalizedRepeatType === "none"
        ? startDate || dueDate || todayText
        : startDate || todayText;
    const normalizedEndDate =
      normalizedRepeatType === "none" ? endDate || "" : endDate || "";
    const normalizedDueDate =
      normalizedRepeatType === "none"
        ? getTodoEffectiveEndDate({
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            dueDate,
          })
        : "";

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

    if (
      normalizedRepeatType === "monthly" &&
      normalizedRepeatMonthDays.length === 0 &&
      normalizedStartDate
    ) {
      const start = new Date(normalizedStartDate);
      if (!Number.isNaN(start.getTime())) {
        normalizedRepeatMonthDays.push(start.getDate());
      }
    }

    return {
      repeatType: normalizedRepeatType,
      repeatWeekdays: normalizedRepeatWeekdays,
      repeatMonthDays: normalizedRepeatMonthDays,
      dueDate: normalizedDueDate,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    };
  }

  function formatMonthlyRepeatSummaryText(days = []) {
    const normalizedDays = normalizeTodoMonthDayList(days);
    return `每月 ${normalizedDays.map((day) => `${day}号`).join("、") || "未设置"}`;
  }

  function buildMonthlyRepeatOptionsHtml(
    inputName = "repeat-month-day",
    selectedDays = [],
  ) {
    const normalizedSelectedDays = normalizeTodoMonthDayList(selectedDays);
    return Array.from({ length: 31 }, (_, index) => index + 1)
      .map(
        (day) => `
          <label class="controler-repeat-day-chip">
            <input type="checkbox" name="${inputName}" value="${day}" ${
              normalizedSelectedDays.includes(day) ? "checked" : ""
            }>
            <span>${day}号</span>
          </label>
        `,
      )
      .join("");
  }

  function getTableScaleSetting(tableKey, fallback = 1, legacyKeys = []) {
    try {
      const settings = JSON.parse(
        localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}",
      );
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
    const readTableScaleRefreshSignature = () => {
      try {
        return [
          localStorage.getItem(TABLE_SIZE_UPDATED_AT_KEY) || "",
          localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "",
        ].join("|");
      } catch (error) {
        return "";
      }
    };
    let tableScaleRefreshSignature = readTableScaleRefreshSignature();
    let tableScaleRefreshPending = false;
    const canApplyTableScaleRefresh = () =>
      document.hidden !== true && (uiTools?.isShellPageActive?.() !== false);
    const markTableScaleRefreshApplied = () => {
      tableScaleRefreshPending = false;
      tableScaleRefreshSignature = readTableScaleRefreshSignature();
    };
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    let rerenderQueued = false;
    const rerender = () => {
      renderCurrentView();
      markTableScaleRefreshApplied();
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
    const requestTableScaleRefresh = () => {
      const nextSignature = readTableScaleRefreshSignature();
      if (
        !tableScaleRefreshPending &&
        nextSignature === tableScaleRefreshSignature
      ) {
        return;
      }
      if (!canApplyTableScaleRefresh()) {
        tableScaleRefreshPending = true;
        return;
      }
      scheduleRerender();
    };

    window.addEventListener(TABLE_SIZE_EVENT_NAME, requestTableScaleRefresh);
    window.addEventListener("storage", (event) => {
      if (
        event.key === TABLE_SIZE_STORAGE_KEY ||
        event.key === TABLE_SIZE_UPDATED_AT_KEY
      ) {
        requestTableScaleRefresh();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) requestTableScaleRefresh();
    });
    window.addEventListener("resize", scheduleRerender);
    window.visualViewport?.addEventListener("resize", scheduleRerender);
    window.addEventListener("focus", requestTableScaleRefresh);
    window.addEventListener("pageshow", requestTableScaleRefresh);
    window.addEventListener(
      uiTools?.shellVisibilityEventName || "controler:shell-visibility-changed",
      (event) => {
        if (event?.detail?.active === false) {
          return;
        }
        requestTableScaleRefresh();
      },
    );
  }

  let todoExternalStorageRefreshQueued = false;

  async function refreshTodoFromExternalStorageChange(detail = {}) {
    const refreshDetail = mergeTodoStorageChangeDetails(
      todoQueuedExternalStorageRefreshDetail,
      detail,
    );
    todoQueuedExternalStorageRefreshDetail = null;
    if (!todoShellPageActive && !isTodoShellTransitionLoading()) {
      todoExternalStorageRefreshQueued = false;
      todoExternalRefreshPendingResume = true;
      todoQueuedExternalStorageRefreshDetail = mergeTodoStorageChangeDetails(
        todoQueuedExternalStorageRefreshDetail,
        refreshDetail,
      );
      return;
    }
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
      const applyFreshSnapshot = async (freshSnapshot) => {
        if (hasTodoPendingLocalMutations()) {
          todoPendingExternalStorageRefresh = true;
          window.__controlerTodoRuntimePendingExternalRefresh = true;
          todoQueuedExternalStorageRefreshDetail =
            mergeTodoStorageChangeDetails(
              todoQueuedExternalStorageRefreshDetail,
              refreshDetail,
            );
          return false;
        }
        applyTodoWorkspaceSnapshot(freshSnapshot);
        refreshTodoInterface();
        todoInitialDataLoaded = true;
        return true;
      };
      if (!todoRefreshController) {
        await applyFreshSnapshot(await readFreshTodoWorkspaceSnapshot());
        return;
      }
      await todoRefreshController.run(() => readFreshTodoWorkspaceSnapshot(), {
        delayMs: todoInitialDataLoaded ? TODO_LOADING_OVERLAY_DELAY_MS : 0,
        manageLoading: !todoInitialDataLoaded,
        loadingOptions: {
          mode: todoInitialDataLoaded ? "inline" : "fullscreen",
          message: "正在同步待办与打卡数据，请稍候",
        },
        commit: async (freshSnapshot) => {
          await applyFreshSnapshot(freshSnapshot);
        },
      });
      return;
    }

    try {
      let nextTodos = null;
      let nextCheckinItems = null;
      let nextCheckinHistorySummary = null;
      let nextDailyCheckins = null;
      let nextCheckins = null;
      if (
        changedSections.includes("todos") ||
        changedSections.includes("checkinItems") ||
        changedSections.includes("checkinHistorySummary")
      ) {
        const coreSnapshot = await bundleStorage.getCoreState();
        const protectedCoreSnapshot = mergeTodoWorkspaceSnapshot(
          {
            todos: Array.isArray(coreSnapshot?.todos) ? coreSnapshot.todos : [],
            checkinItems: Array.isArray(coreSnapshot?.checkinItems)
              ? coreSnapshot.checkinItems
              : [],
            checkinHistorySummary:
              coreSnapshot?.checkinHistorySummary &&
              typeof coreSnapshot.checkinHistorySummary === "object" &&
              !Array.isArray(coreSnapshot.checkinHistorySummary)
                ? coreSnapshot.checkinHistorySummary
                : {},
          },
          captureTodoWorkspaceSnapshot(),
        );
        if (changedSections.includes("todos")) {
          nextTodos = hydrateTodoCollection(
            "todos",
            protectedCoreSnapshot?.todos,
          );
        }
        if (changedSections.includes("checkinItems")) {
          nextCheckinItems = hydrateTodoCollection(
            "checkinItems",
            protectedCoreSnapshot?.checkinItems,
          );
        }
        if (
          changedSections.includes("checkinItems") ||
          changedSections.includes("checkinHistorySummary")
        ) {
          nextCheckinHistorySummary = normalizeCheckinHistorySummary(
            protectedCoreSnapshot?.checkinHistorySummary,
          );
        }
      }

      const refreshRangeSection = async (section, currentItems) => {
        const periodIds = Array.isArray(
          refreshDetail?.changedPeriods?.[section],
        )
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
        nextDailyCheckins = await refreshRangeSection(
          "dailyCheckins",
          dailyCheckins,
        );
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
      if (nextCheckinHistorySummary !== null) {
        checkinHistorySummary = nextCheckinHistorySummary;
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
      todoInitialDataLoaded = true;
    } catch (error) {
      console.error("精确刷新待办数据失败，回退全量加载:", error);
      applyTodoWorkspaceSnapshot(await readFreshTodoWorkspaceSnapshot());
      todoInitialDataLoaded = true;
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
      const customCloseHandler = modal?.__controlerCloseModal;
      if (customCloseHandler) {
        modal.__controlerCloseModal = null;
      }
      uiTools.closeModal(modal);
      if (customCloseHandler && modal?.isConnected) {
        modal.__controlerCloseModal = customCloseHandler;
      }
      return;
    }
    if (modal?.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }

  const TODO_MANAGED_MODAL_SELECTOR =
    '.modal-overlay[data-todo-managed-modal="true"]';

  function closeTodoManagedModals(options = {}) {
    if (typeof document === "undefined") {
      return;
    }
    const exceptModal =
      options?.except instanceof HTMLElement ? options.except : null;
    document.querySelectorAll(TODO_MANAGED_MODAL_SELECTOR).forEach((modal) => {
      if (!(modal instanceof HTMLElement) || modal === exceptModal) {
        return;
      }
      if (
        modal.__controlerRemovalQueued === "true" ||
        modal.dataset.controlerModalClosing === "true"
      ) {
        return;
      }
      closeModalElement(modal);
    });
  }

  function isTodoManagedModalDeferredAutofocusRuntime() {
    return document.body?.classList.contains("controler-android-native") === true;
  }

  function getTodoManagedModalTextAutofocusOptions() {
    return {
      delayMs: 0,
      retryDelayMs: 72,
      retrySequence: [72],
      selectText: true,
    };
  }

  function resumeTodoManagedModalTextAutofocus(modal) {
    if (!(modal instanceof HTMLElement) || !modal.isConnected) {
      return false;
    }
    if (typeof uiTools?.resumeAndroidModalAutofocus === "function") {
      return (
        uiTools.resumeAndroidModalAutofocus(modal, {
          ...getTodoManagedModalTextAutofocusOptions(),
          clearDisableFlag: true,
        }) || false
      );
    }
    delete modal.dataset.controlerDisableAutofocus;
    const disableAutofocusUntil = Number.parseInt(
      modal.dataset.controlerDisableAutofocusUntil || "0",
      10,
    );
    if (disableAutofocusUntil > Date.now()) {
      return false;
    }
    delete modal.dataset.controlerDisableAutofocusUntil;
    const activeControl = document.activeElement;
    if (activeControl instanceof HTMLElement && modal.contains(activeControl)) {
      return false;
    }
    return (
      uiTools?.autofocusInteractiveTextControl?.(
        modal,
        getTodoManagedModalTextAutofocusOptions(),
      ) || false
    );
  }

  function scheduleTodoManagedModalTextAutofocusResume(modal) {
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    const pendingFrameId = Number(
      modal.__controlerTodoManagedAutofocusFrameId || 0,
    );
    if (pendingFrameId > 0) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(pendingFrameId);
      } else {
        window.clearTimeout(pendingFrameId);
      }
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);
    modal.__controlerTodoManagedAutofocusFrameId = schedule(() => {
      modal.__controlerTodoManagedAutofocusFrameId = 0;
      if (!modal.isConnected || modal.hidden || modal.style.display === "none") {
        return;
      }
      resumeTodoManagedModalTextAutofocus(modal);
    });
    return true;
  }

  function restoreTodoManagedModalDraftSession(
    modal,
    draftSession,
    options = {},
  ) {
    const {
      errorLabel = "恢复草稿失败:",
      deferTextAutofocus = false,
      activateAfterRestore = false,
    } = options;
    if (
      !(modal instanceof HTMLElement) ||
      !draftSession ||
      typeof draftSession.restore !== "function"
    ) {
      return Promise.resolve(null);
    }
    if (deferTextAutofocus) {
      scheduleTodoManagedModalTextAutofocusResume(modal);
    }
    return Promise.resolve()
      .then(() => draftSession.restore())
      .catch((error) => {
        console.error(errorLabel, error);
        return null;
      })
      .finally(() => {
        if (activateAfterRestore && typeof draftSession.activate === "function") {
          draftSession.activate();
        }
      });
  }

  function appendTodoManagedModal(modal, role = "", options = {}) {
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
    const body = document.body;
    const preferViewportScope =
      body instanceof HTMLElement &&
      (body.classList.contains("controler-mobile-runtime") ||
        body.classList.contains("controler-android-native"));
    const deferTextAutofocus =
      options?.deferTextAutofocus === true &&
      isTodoManagedModalDeferredAutofocusRuntime();
    if (deferTextAutofocus) {
      modal.dataset.controlerDisableAutofocus = "true";
    } else {
      delete modal.dataset.controlerDisableAutofocus;
    }
    if (typeof uiTools?.prepareModalOverlay === "function") {
      uiTools.prepareModalOverlay(modal, {
        zIndex: Number.parseInt(modal.style.zIndex || "", 10),
        scope: preferViewportScope ? "viewport" : undefined,
        textAutofocus: deferTextAutofocus
          ? null
          : getTodoManagedModalTextAutofocusOptions(),
      });
    } else {
      document.body.appendChild(modal);
      if (!deferTextAutofocus) {
        uiTools?.autofocusInteractiveTextControl?.(
          modal,
          getTodoManagedModalTextAutofocusOptions(),
        );
      }
    }
  }

  function getTopVisibleTodoModalOverlayZIndex(fallbackZIndex = 2000) {
    if (typeof document === "undefined") {
      return fallbackZIndex;
    }
    return Array.from(document.querySelectorAll(".modal-overlay")).reduce(
      (maxZIndex, modal) => {
        if (!(modal instanceof HTMLElement)) {
          return maxZIndex;
        }
        const computedStyle = window.getComputedStyle(modal);
        const hiddenByStyle =
          modal.hidden ||
          computedStyle.display === "none" ||
          computedStyle.visibility === "hidden";
        if (hiddenByStyle) {
          return maxZIndex;
        }
        const modalZIndex = Number.parseInt(
          modal.style.zIndex || computedStyle.zIndex,
          10,
        );
        if (!Number.isFinite(modalZIndex)) {
          return maxZIndex;
        }
        return Math.max(maxZIndex, modalZIndex);
      },
      fallbackZIndex,
    );
  }

  function showTodoFallbackConfirmationDialog(options = {}) {
    if (
      !(typeof document !== "undefined" && document.body instanceof HTMLElement)
    ) {
      if (
        typeof window !== "undefined" &&
        typeof window.confirm === "function"
      ) {
        return Promise.resolve(window.confirm(String(options.message || "")));
      }
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const {
        title = "请确认操作",
        message = "",
        confirmText = "确定",
        cancelText = "取消",
        danger = false,
        allowBackdropClose = false,
      } = options;

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.style.display = "flex";
      modal.style.zIndex = String(
        getTopVisibleTodoModalOverlayZIndex(4200) + 20,
      );
      modal.innerHTML = `
      <div class="modal-content themed-dialog-card ms" style="width:min(420px, calc(100% - 32px)); max-width:min(420px, calc(100% - 32px));">
        <div class="themed-dialog-title">${escapeHtml(title)}</div>
        <div class="themed-dialog-message">${escapeHtml(String(message ?? ""))}</div>
        <div class="themed-dialog-actions">
          <button type="button" class="bts themed-dialog-cancel-btn" data-todo-fallback-dialog-action="cancel" style="margin:0;">
            ${escapeHtml(cancelText)}
          </button>
          <button type="button" class="bts themed-dialog-confirm-btn${danger ? " is-danger" : ""}" data-todo-fallback-dialog-action="confirm" style="margin:0;">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

      const confirmButton = modal.querySelector(
        '[data-todo-fallback-dialog-action="confirm"]',
      );
      const cancelButton = modal.querySelector(
        '[data-todo-fallback-dialog-action="cancel"]',
      );
      let settled = false;
      const openedAt = Date.now();
      const interactionLockUntil =
        openedAt +
        Math.min(
          220,
          Math.max(
            120,
            Math.round(TODO_MODAL_TOUCH_ACTION_DEDUP_WINDOW_MS / 2),
          ),
        );
      const initialInteractionEventNames = [
        "pointerup",
        "click",
        "touchend",
        "mouseup",
      ];

      const ignoreInitialTouchChain = (event) => {
        if (Date.now() >= interactionLockUntil) {
          return false;
        }
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (typeof event?.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return true;
      };

      let releaseInitialInteractionShield = () => {};
      if (typeof document?.addEventListener === "function") {
        const shieldInitialInteractionChain = (event) => {
          if (Date.now() >= interactionLockUntil) {
            releaseInitialInteractionShield();
            return;
          }
          const target = event?.target;
          if (
            target instanceof Node &&
            (modal.contains(target) ||
              confirmButton?.contains?.(target) ||
              cancelButton?.contains?.(target))
          ) {
            return;
          }
          event?.preventDefault?.();
          event?.stopPropagation?.();
          if (typeof event?.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        };
        releaseInitialInteractionShield = () => {
          initialInteractionEventNames.forEach((eventName) => {
            document.removeEventListener(
              eventName,
              shieldInitialInteractionChain,
              true,
            );
          });
        };
        initialInteractionEventNames.forEach((eventName) => {
          document.addEventListener(
            eventName,
            shieldInitialInteractionChain,
            true,
          );
        });
      }

      const cleanup = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        releaseInitialInteractionShield();
        document.removeEventListener("keydown", handleKeydown, true);
        closeModalElement(modal);
        resolve(result === true);
      };

      const handleKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          cleanup(true);
        }
      };

      confirmButton?.addEventListener("click", (event) => {
        if (ignoreInitialTouchChain(event)) {
          return;
        }
        event.preventDefault();
        cleanup(true);
      });
      cancelButton?.addEventListener("click", (event) => {
        if (ignoreInitialTouchChain(event)) {
          return;
        }
        event.preventDefault();
        cleanup(false);
      });
      modal.addEventListener("click", (event) => {
        if (ignoreInitialTouchChain(event)) {
          return;
        }
        if (allowBackdropClose && event.target === modal) {
          if (Date.now() - openedAt < TODO_MODAL_TOUCH_ACTION_DEDUP_WINDOW_MS) {
            return;
          }
          cleanup(false);
        }
      });

      modal.style.pointerEvents = "none";
      if (typeof uiTools?.prepareModalOverlay === "function") {
        uiTools.prepareModalOverlay(modal, {
          zIndex: Number.parseInt(modal.style.zIndex || "", 10),
        });
      } else {
        document.body.appendChild(modal);
        uiTools?.stopModalContentPropagation?.(modal);
      }
      document.addEventListener("keydown", handleKeydown, true);
      window.setTimeout(
        () => {
          if (modal.isConnected) {
            modal.style.pointerEvents = "auto";
          }
        },
        Math.max(0, interactionLockUntil - Date.now()),
      );
      window.setTimeout(() => {
        (confirmButton || cancelButton)?.focus?.();
      }, 0);
    });
  }

  function showTodoFallbackChoiceDialog(options = {}) {
    if (
      !(typeof document !== "undefined" && document.body instanceof HTMLElement)
    ) {
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      const {
        title = "请选择操作",
        message = "",
        choices = [],
        cancelText = "取消",
      } = options;

      const normalizedChoices = (Array.isArray(choices) ? choices : [])
        .map((choice) => ({
          key: String(choice?.key || "").trim(),
          label: String(choice?.label || "").trim(),
          description: String(choice?.description || "").trim(),
          danger: choice?.danger === true,
        }))
        .filter((choice) => choice.key && choice.label);

      if (!normalizedChoices.length) {
        resolve("");
        return;
      }

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.style.display = "flex";
      modal.style.zIndex = String(
        getTopVisibleTodoModalOverlayZIndex(4200) + 20,
      );
      modal.innerHTML = `
      <div class="modal-content themed-dialog-card ms" style="width:min(460px, calc(100% - 32px)); max-width:min(460px, calc(100% - 32px));">
        <div class="themed-dialog-title">${escapeHtml(title)}</div>
        <div class="themed-dialog-message">${escapeHtml(String(message ?? ""))}</div>
        <div class="themed-dialog-actions themed-dialog-actions-vertical">
          ${normalizedChoices
            .map(
              (choice) => `
            <button
              type="button"
              class="bts themed-dialog-confirm-btn themed-dialog-option-btn${choice.danger ? " is-danger" : ""}"
              data-todo-choice-dialog-action="${escapeHtml(choice.key)}"
              style="margin:0;"
            >
              <span class="themed-dialog-option-label">${escapeHtml(choice.label)}</span>
              ${
                choice.description
                  ? `<span class="themed-dialog-option-desc">${escapeHtml(choice.description)}</span>`
                  : ""
              }
            </button>
          `,
            )
            .join("")}
          <button type="button" class="bts themed-dialog-cancel-btn" data-todo-choice-dialog-action="cancel" style="margin:0;">
            ${escapeHtml(cancelText)}
          </button>
        </div>
      </div>
    `;

      const actionButtons = Array.from(
        modal.querySelectorAll("[data-todo-choice-dialog-action]"),
      );
      const cancelButton = modal.querySelector(
        '[data-todo-choice-dialog-action="cancel"]',
      );
      let settled = false;
      const openedAt = Date.now();
      const interactionLockUntil =
        openedAt +
        Math.min(
          220,
          Math.max(
            120,
            Math.round(TODO_MODAL_TOUCH_ACTION_DEDUP_WINDOW_MS / 2),
          ),
        );
      const initialInteractionEventNames = [
        "pointerup",
        "click",
        "touchend",
        "mouseup",
      ];

      const ignoreInitialTouchChain = (event) => {
        if (Date.now() >= interactionLockUntil) {
          return false;
        }
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (typeof event?.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return true;
      };

      let releaseInitialInteractionShield = () => {};
      if (typeof document?.addEventListener === "function") {
        const shieldInitialInteractionChain = (event) => {
          if (Date.now() >= interactionLockUntil) {
            releaseInitialInteractionShield();
            return;
          }
          const target = event?.target;
          if (
            target instanceof Node &&
            (modal.contains(target) ||
              actionButtons.some((button) => button.contains?.(target)))
          ) {
            return;
          }
          event?.preventDefault?.();
          event?.stopPropagation?.();
          if (typeof event?.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        };
        initialInteractionEventNames.forEach((eventName) => {
          document.addEventListener(
            eventName,
            shieldInitialInteractionChain,
            true,
          );
        });
        releaseInitialInteractionShield = () => {
          initialInteractionEventNames.forEach((eventName) => {
            document.removeEventListener(
              eventName,
              shieldInitialInteractionChain,
              true,
            );
          });
        };
      }

      const cleanup = () => {
        releaseInitialInteractionShield();
        document.removeEventListener("keydown", handleKeydown, true);
      };

      const settle = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        closeModalElement(modal);
        resolve(result);
      };

      const handleKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          settle("");
        }
      };

      actionButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          if (ignoreInitialTouchChain(event)) {
            return;
          }
          const actionKey =
            button.getAttribute("data-todo-choice-dialog-action") || "";
          settle(actionKey === "cancel" ? "" : actionKey);
        });
      });

      document.addEventListener("keydown", handleKeydown, true);
      if (typeof uiTools?.prepareModalOverlay === "function") {
        uiTools.prepareModalOverlay(modal, {
          zIndex: Number.parseInt(modal.style.zIndex || "", 10),
        });
      } else {
        document.body.appendChild(modal);
        uiTools?.stopModalContentPropagation?.(modal);
      }
      window.setTimeout(
        () => {
          if (modal.isConnected) {
            modal.style.pointerEvents = "auto";
          }
        },
        Math.max(0, interactionLockUntil - Date.now()),
      );
      window.setTimeout(() => {
        (actionButtons[0] || cancelButton)?.focus?.();
      }, 0);
    });
  }

  async function requestTodoConfirmation(message, options = {}) {
    const forceFallback = options.forceFallback === true;
    const dialogOptions = {
      title: options.title || "请确认操作",
      message,
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      danger: !!options.danger,
    };

    if (!forceFallback && typeof uiTools?.confirmDialog === "function") {
      try {
        const result = await uiTools.confirmDialog(dialogOptions);
        if (typeof result === "boolean") {
          return result;
        }
        console.warn("待办确认弹窗返回了非布尔值，回退内置确认弹窗:", result);
      } catch (error) {
        console.error("调用全局确认弹窗失败，回退内置确认弹窗:", error);
      }
    }

    return showTodoFallbackConfirmationDialog(dialogOptions);
  }

  async function requestTodoChoice(message, options = {}) {
    return showTodoFallbackChoiceDialog({
      title: options.title || "请选择操作",
      message,
      choices: options.choices || [],
      cancelText: options.cancelText || "取消",
    });
  }

  async function showTodoAlert(message, options = {}) {
    const alertDialog =
      uiTools?.alertDialog ||
      (typeof window !== "undefined" ? window.ControlerUI?.alertDialog : null);
    if (typeof alertDialog === "function") {
      await alertDialog({
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
    const { refreshView = true, sourceModal = null } = options;

    if (typeof closeModal === "function") {
      closeModal();
    }
    closeTodoManagedModals({
      except: sourceModal,
    });

    if (refreshView) {
      scheduleTodoInterfaceRefresh();
    }

    return true;
  }

  async function runTodoBlockingMutation(options = {}, task = null) {
    const {
      closeModal = null,
      refreshView = true,
      sourceModal = null,
      title = "正在保存数据",
      message = "正在写入待办与打卡数据，请稍候",
      perfAction = "todo-mutation",
      delegateToNative = false,
    } = options;
    const loadingDelayMs =
      uiTools?.getBlockingMutationOverlayDelayMs?.({
        mode: "fullscreen",
      }) ?? 1200;
    uiTools?.markPerfStage?.("todo-form-save-start", {
      allowRepeat: true,
      action: perfAction,
    });
    setTodoLoadingState({
      active: true,
      mode: "fullscreen",
      title,
      message,
      delayMs: loadingDelayMs,
      delegateToNative,
    });
    try {
      if (typeof closeModal === "function") {
        finalizeTodoModalChange(closeModal, {
          refreshView,
          sourceModal,
        });
        uiTools?.markPerfStage?.("todo-form-modal-hidden", {
          allowRepeat: true,
          action: perfAction,
        });
      }
      const result = typeof task === "function" ? await task() : true;
      if (result !== false) {
        uiTools?.markPerfStage?.("todo-form-storage-acked", {
          allowRepeat: true,
          action: perfAction,
        });
      }
      return result;
    } finally {
      setTodoLoadingState({
        active: false,
        delegateToNative,
      });
    }
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

  function createTodoModalConfirmedAction(modal, confirmAction, action) {
    const runLockedAction = createTodoModalLockedAction(modal, action);
    return async (...args) => {
      if (typeof confirmAction === "function") {
        const confirmed = await confirmAction(...args);
        if (!confirmed) {
          return false;
        }
      }
      return runLockedAction(...args);
    };
  }

  function restoreTodoStateSnapshot(snapshot = {}) {
    if (Object.prototype.hasOwnProperty.call(snapshot, "todos")) {
      todos = hydrateTodoCollection("todos", snapshot.todos);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "checkinItems")) {
      checkinItems = hydrateTodoCollection(
        "checkinItems",
        snapshot.checkinItems,
      );
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "dailyCheckins")) {
      dailyCheckins = hydrateTodoCollection(
        "dailyCheckins",
        snapshot.dailyCheckins,
      );
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

  function bindTodoFormBackdropDismiss(modal, closeHandler) {
    if (
      !(modal instanceof HTMLElement) ||
      typeof closeHandler !== "function" ||
      modal.dataset.todoFormBackdropDismissBound === "true"
    ) {
      return modal;
    }
    modal.dataset.todoFormBackdropDismissBound = "true";
    if (typeof uiTools?.bindModalBackdropDismiss === "function") {
      uiTools.bindModalBackdropDismiss(modal, closeHandler);
      return modal;
    }
    modal.addEventListener("click", (event) => {
      if (event.target !== modal) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeHandler(event);
    });
    return modal;
  }

  function bindTodoModalActions(modal, handlers = {}) {
    const modalContent = modal?.querySelector?.(".modal-content") || modal;
    if (!modalContent) {
      return () => {};
    }

    if (typeof uiTools?.bindModalAction === "function") {
      Array.from(
        modalContent.querySelectorAll?.("[data-todo-modal-action]") || [],
      ).forEach((actionButton) => {
        if (
          !(actionButton instanceof HTMLElement) ||
          actionButton.dataset.todoModalActionBound === "true"
        ) {
          return;
        }
        const actionName = String(actionButton.dataset.todoModalAction || "").trim();
        const handler = handlers[actionName];
        if (typeof handler !== "function") {
          return;
        }
        actionButton.dataset.todoModalActionBound = "true";
        uiTools.bindModalAction(modal, actionButton, (event, button) => {
          const resolvedButton =
            button instanceof HTMLElement ? button : actionButton;
          resolvedButton.blur?.();
          return handler(resolvedButton, event);
        });
      });
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
      const clickOnlyAction =
        actionName === "delete-progress" ||
        actionName === "delete-todo" ||
        actionName === "delete-checkin";
      if (event.type === "pointerup" && clickOnlyAction) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      if (event.type === "pointerup") {
        handledTouchActions.set(actionButton, Date.now());
      } else if (event.type === "click" && clickOnlyAction) {
        handledTouchActions.set(actionButton, Date.now());
      }
      actionButton.blur?.();
      Promise.resolve()
        .then(() => handler(actionButton, event))
        .catch((error) => {
          console.error("待办模态框按钮处理失败:", error);
          return false;
        })
        .finally(() => {
          if (
            modal instanceof HTMLElement &&
            modal.isConnected &&
            modal.__controlerRemovalQueued !== "true" &&
            modal.dataset.controlerModalClosing !== "true" &&
            typeof uiTools?.clearAndroidModalDismissPending === "function"
          ) {
            uiTools.clearAndroidModalDismissPending(modal);
          }
        });
    };

    modalContent.addEventListener("pointerup", listener);
    modalContent.addEventListener("click", listener);
    return () => {
      modalContent.removeEventListener("pointerup", listener);
      modalContent.removeEventListener("click", listener);
    };
  }

  function bindTodoActionButton(button, handler) {
    if (!(button instanceof HTMLElement) || typeof handler !== "function") {
      return () => {};
    }

    const listener = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      button.blur?.();
      Promise.resolve(handler(event)).catch((error) => {
        console.error("待办动作按钮处理失败:", error);
      });
    };

    button.addEventListener("click", listener);
    return () => {
      button.removeEventListener("click", listener);
    };
  }

  function getTodoEventTargetElement(event) {
    const rawTarget = event?.target || null;
    if (rawTarget instanceof Element) {
      return rawTarget;
    }
    if (
      rawTarget &&
      typeof rawTarget === "object" &&
      rawTarget.parentElement instanceof Element
    ) {
      return rawTarget.parentElement;
    }
    return null;
  }

  function getTodoListContentWidth(listScale, baseWidth = 980) {
    return Math.max(280, Math.round(baseWidth * listScale));
  }

  function getGeneratedItemResponsiveScale(baseScale) {
    return Math.min(
      Math.max(
        baseScale *
          (isCompactMobileLayout() ? MOBILE_GENERATED_ITEM_SHRINK_RATIO : 1),
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
      container.style.alignItems = isCompactMobileLayout()
        ? "stretch"
        : "center";
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

  function applyCenteredEmptyStateLayout(
    emptyCard,
    contentWidth,
    options = {},
  ) {
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
    emptyCard.style.gridColumn =
      options.useTwoColumnGrid === true ? "1 / -1" : "";
    emptyCard.style.justifySelf =
      options.useTwoColumnGrid === true ? "stretch" : "";
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
      repeatMonthDays = [],
      startDate = "",
      endDate = "",
      startTime = "",
      endTime = "",
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
      this.completedDates = [];
      this.uncompletedDates = [];
      this.includedDates = [];
      this.lastResolvedOccurrenceDate = "";
      this.color = this.getPriorityColor();
      this.type = "todo"; // 类型标识
      const normalizedSchedule = normalizeTodoScheduleFields({
        dueDate,
        repeatType,
        repeatWeekdays,
        repeatMonthDays,
        startDate,
        endDate,
      });
      const normalizedTimeRange = normalizeTodoTimeRangeFields({
        startTime,
        endTime,
      });
      this.repeatType = normalizedSchedule.repeatType;
      this.repeatWeekdays = normalizedSchedule.repeatWeekdays;
      this.repeatMonthDays = normalizedSchedule.repeatMonthDays;
      this.dueDate = normalizedSchedule.dueDate;
      this.startDate = normalizedSchedule.startDate;
      this.endDate = normalizedSchedule.endDate;
      this.startTime = normalizedTimeRange.startTime;
      this.endTime = normalizedTimeRange.endTime;
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
      if (getTodoCompletionStateOnDate(this, this.dueDate || getLocalDateText())) {
        return false;
      }
      if (this.repeatType !== "none") return false;
      const today = new Date();
      const dueDate = new Date(this.dueDate);
      return dueDate < today;
    }

    // 检查是否今天到期
    isDueToday() {
      const todayText = getLocalDateText();
      if (getTodoCompletionStateOnDate(this, todayText)) return false;
      if (this.repeatType !== "none") {
        return this.isScheduledOn(todayText);
      }
      const today = new Date();
      const dueDate = new Date(this.dueDate);
      return today.toDateString() === dueDate.toDateString();
    }

    isScheduledOn(dateText) {
      const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
      if (!normalizedDate) {
        return false;
      }
      if (hasTodoIncludedDate(this, normalizedDate)) {
        return true;
      }
      if (this.repeatType === "none") {
        const normalizedStartDate =
          normalizeTodoOccurrenceDateKey(this.startDate || this.dueDate) || "";
        const normalizedEndDate =
          normalizeTodoOccurrenceDateKey(this.dueDate || this.endDate) || "";
        if (!normalizedStartDate && !normalizedEndDate) {
          return false;
        }
        if (normalizedStartDate && normalizedDate < normalizedStartDate) {
          return false;
        }
        if (normalizedEndDate && normalizedDate > normalizedEndDate) {
          return false;
        }
        return true;
      }

      const date = new Date(normalizedDate);
      if (Number.isNaN(date.getTime())) return false;

      const start = new Date(this.startDate || this.dueDate || normalizedDate);
      if (Number.isNaN(start.getTime())) return false;

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

      if (this.repeatType === "monthly") {
        return this.repeatMonthDays.includes(date.getDate());
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
      if (this.repeatType === "monthly") {
        return formatMonthlyRepeatSummaryText(this.repeatMonthDays);
      }
      return this.dueDate ? `一次性 · 截止 ${this.dueDate}` : "一次性";
    }

    getCompletionState(dateText = getLocalDateText()) {
      return getTodoCompletionStateOnDate(this, dateText);
    }

    setCompletionState(nextCompleted = false, dateText = getLocalDateText()) {
      return setTodoCompletionStateOnDate(this, nextCompleted, dateText);
    }

    // 获取截止日期显示文本
    getDueDateDisplay() {
      if (this.repeatType !== "none") {
        return this.getRepeatSummary();
      }
      if (!this.dueDate) {
        if (this.startDate) {
          const startDate = new Date(this.startDate);
          if (!Number.isNaN(startDate.getTime())) {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            let label = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
            if (startDate.toDateString() === today.toDateString()) {
              label = "今天";
            } else if (startDate.toDateString() === tomorrow.toDateString()) {
              label = "明天";
            } else if (startDate.toDateString() === yesterday.toDateString()) {
              label = "昨天";
            }
            return `${label}起`;
          }
        }
        return "无截止日期";
      }

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
      if (this.getCompletionState()) return "";
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
      repeatMonthDays = [],
      startDate = "",
      endDate = "",
      startTime = "",
      endTime = "",
      notification = null,
      status = "in_progress",
    ) {
      this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      this.title = title;
      this.description = description || "";
      this.color = color;
      this.repeatType = normalizeTodoRepeatType(repeatType);
      this.repeatWeekdays = Array.isArray(repeatWeekdays)
        ? repeatWeekdays
            .map((day) => parseInt(day, 10))
            .filter((day) => day >= 0 && day <= 6)
        : [];
      this.repeatMonthDays = normalizeTodoMonthDayList(repeatMonthDays);

      const today = getLocalDateText();
      this.startDate = startDate || today;
      this.endDate = endDate || "";
      const normalizedTimeRange = normalizeTodoTimeRangeFields({
        startTime,
        endTime,
      });
      this.startTime = normalizedTimeRange.startTime;
      this.endTime = normalizedTimeRange.endTime;

      if (this.repeatType === "weekly" && this.repeatWeekdays.length === 0) {
        this.repeatWeekdays = [new Date(this.startDate).getDay()];
      }
      if (this.repeatType === "monthly" && this.repeatMonthDays.length === 0) {
        this.repeatMonthDays = [new Date(this.startDate).getDate()];
      }
      this.createdAt = new Date().toISOString();
      this.updatedAt = this.createdAt;
      this.type = "checkin"; // 类型标识
      this.includedDates = [];
      this.lastResolvedOccurrenceDate = "";
      this.status = normalizeCheckinLifecycleStatus(status);
      this.deletedAt = "";
      this.mergedIntoId = "";
      this.notification = normalizeCheckinNotificationConfig(notification, {
        startDate: this.startDate,
        repeatType: this.repeatType,
      });
      this.scheduleRanges =
        this.status === "ended"
          ? []
          : [
              createCheckinScheduleRange({
                startDate: this.startDate,
                endDate: this.endDate,
                repeatType: this.repeatType,
                repeatWeekdays: this.repeatWeekdays,
                repeatMonthDays: this.repeatMonthDays,
                startTime: this.startTime,
                endTime: this.endTime,
                notification: this.notification,
                createdAt: this.createdAt,
              }),
            ];
    }

    isScheduledOn(dateText) {
      return isCheckinOccurrenceScheduledOnDate(this, dateText);
    }

    // 获取今日打卡状态
    getTodayCheckinStatus(lookup = null, dateText = getLocalDateText()) {
      const checkin = getLatestTodoDailyCheckinEntryFromLookup(
        lookup,
        this.id,
        dateText,
      );
      return checkin ? checkin.checked : false;
    }

    // 切换今日打卡状态
    toggleTodayCheckin() {
      return toggleCheckinCompletionOnDate(this.id, getLocalDateText());
    }

    getCheckedDaysCount(lookup = null) {
      return getCheckedTodoDailyCheckinDates(this.id, lookup).size;
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
      if (this.repeatType === "monthly") {
        return formatMonthlyRepeatSummaryText(this.repeatMonthDays);
      }
      if (this.repeatType === "none") {
        return "一次性";
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

  function commitTodoCompletionForDate(
    todo,
    dateText,
    options = {},
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!todo || !normalizedDate) {
      return false;
    }
    const previousSnapshot = captureTodoWorkspaceSnapshot();
    const includeDate = options?.includeDate === true;
    if (includeDate) {
      addTodoIncludedDate(todo, normalizedDate);
    }
    const nextCompleted =
      typeof options?.nextCompleted === "boolean"
        ? options.nextCompleted
        : !getTodoCompletionStateOnDate(todo, normalizedDate);
    todo.setCompletionState(nextCompleted, normalizedDate);
    if (nextCompleted) {
      setTodoLastResolvedOccurrenceDate(todo, normalizedDate);
    } else if (getTodoLastResolvedOccurrenceDate(todo) === normalizedDate) {
      setTodoLastResolvedOccurrenceDate(todo, "");
    }
    todo.updatedAt = new Date().toISOString();
    invalidateTodoDerivedCaches();
    uiTools?.markPerfStage?.("todo-action-ui-committed", {
      allowRepeat: true,
      action: "toggle-todo-completion",
      todoId: todo.id,
      occurrenceDate: normalizedDate,
    });
    scheduleTodoInterfaceRefresh();
    scheduleTodoToggleCommit(
      "todo",
      todo.id,
      () => ({
        save: () =>
          queueTodoSaveWithLinkedPlan({
            partialCore: {
              todos: getTodoSectionStateSnapshot("todos"),
            },
            linkedPlanMutation: buildTodoLinkedPlanCompletionMutation(
              "todo",
              todo,
              nextCompleted,
              normalizedDate,
              {
                sourceLike: todo,
                includeDate,
                createIfMissing: includeDate,
              },
            ),
            reason:
              includeDate === true
                ? "todo-toggle-completion-manual-occurrence"
                : "todo-toggle-completion",
            errorLabel: "保存待办完成状态失败:",
            refreshReminders: true,
          }),
        onSuccess: () => {
          clearTodoPersistenceError();
          uiTools?.markPerfStage?.("todo-action-storage-acked", {
            allowRepeat: true,
            action: "toggle-todo-completion",
            todoId: todo.id,
            occurrenceDate: normalizedDate,
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

  async function toggleRecurringTodoCompletionForDate(todo, dateText) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!todo || !normalizedDate) {
      return false;
    }
    if (isTodoLinkedPlanOccurrenceAvailable("todo", todo, normalizedDate)) {
      return commitTodoCompletionForDate(todo, normalizedDate);
    }
    return commitTodoCompletionForDate(todo, normalizedDate, {
      includeDate: true,
      nextCompleted: true,
    });
  }

  function commitCheckinCompletionOnDate(
    targetItem,
    dateText,
    options = {},
  ) {
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!targetItem || !normalizedDate) {
      return false;
    }
    const previousSnapshot = captureTodoWorkspaceSnapshot();
    const includeDate = options?.includeDate === true;
    if (includeDate) {
      addTodoIncludedDate(targetItem, normalizedDate);
      targetItem.updatedAt = new Date().toISOString();
    }
    const latestMatch = dedupeTodoDailyCheckinsForDate(
      targetItem.id,
      normalizedDate,
    );
    const index = latestMatch ? latestMatch.index : -1;
    const nowText = new Date().toISOString();
    const nextChecked =
      typeof options?.nextChecked === "boolean"
        ? options.nextChecked
        : !(index !== -1 ? !!dailyCheckins[index]?.checked : false);
    if (nextChecked) {
      setTodoLastResolvedOccurrenceDate(targetItem, normalizedDate);
    } else if (getTodoLastResolvedOccurrenceDate(targetItem) === normalizedDate) {
      setTodoLastResolvedOccurrenceDate(targetItem, "");
    }

    if (index !== -1) {
      dailyCheckins[index].checked = nextChecked;
      dailyCheckins[index].time = nowText;
    } else {
      dailyCheckins.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        itemId: targetItem.id,
        date: normalizedDate,
        checked: nextChecked,
        time: nowText,
      });
    }

    updateCheckinHistorySummaryForDate(
      targetItem.id,
      normalizedDate,
      nextChecked,
      nowText,
    );
    invalidateTodoDerivedCaches();
    uiTools?.markPerfStage?.("todo-action-ui-committed", {
      allowRepeat: true,
      action: "toggle-checkin",
      itemId: targetItem.id,
      date: normalizedDate,
    });
    scheduleTodoInterfaceRefresh();
    const periodId = getTodoSectionPeriodId("dailyCheckins", {
      date: normalizedDate,
      time: nowText,
    });
    scheduleTodoToggleCommit(
      "checkin",
      targetItem.id,
      () => ({
        save: () => {
          const linkedPlanMutation = buildTodoLinkedPlanCompletionMutation(
            "checkin",
            targetItem,
            !!getLatestTodoDailyCheckinEntry(targetItem.id, normalizedDate)
              ?.checked,
            normalizedDate,
            {
              sourceLike: targetItem,
              includeDate,
              createIfMissing: includeDate,
            },
          );
          return queueTodoSaveWithLinkedPlan({
            partialCore: {
              checkinItems: getTodoSectionStateSnapshot("checkinItems"),
              checkinHistorySummary: getCheckinHistorySummarySnapshot(),
            },
            sectionSaves: [
              {
                section: "dailyCheckins",
                periodIds: [periodId],
                items: getTodoSectionStateSnapshot("dailyCheckins"),
              },
            ],
            linkedPlanMutation,
            reason:
              includeDate === true
                ? "checkin-toggle-completion-manual-occurrence"
                : "checkin-toggle-completion",
            errorLabel: "保存打卡状态失败:",
          });
        },
        onSuccess: () => {
          clearTodoPersistenceError();
          uiTools?.markPerfStage?.("todo-action-storage-acked", {
            allowRepeat: true,
            action: "toggle-checkin",
            itemId: targetItem.id,
            date: normalizedDate,
          });
          scheduleTodoInterfaceRefresh();
        },
        onFailure: async (rollbackSnapshot) => {
          handleTodoNonBlockingSaveFailure("保存打卡状态失败。", {
            message: "打卡状态同步失败，已尝试恢复当前数据。",
            rollbackSnapshot: rollbackSnapshot || previousSnapshot,
          });
        },
      }),
      previousSnapshot,
    );
    return true;
  }

  function toggleCheckinCompletionOnDate(itemId, dateText) {
    const targetItem = checkinItems.find((item) => matchesId(item.id, itemId));
    const normalizedDate = normalizeTodoOccurrenceDateKey(dateText);
    if (!targetItem || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return false;
    }
    if (
      isTodoLinkedPlanOccurrenceAvailable(
        "checkin",
        targetItem,
        normalizedDate,
      )
    ) {
      return commitCheckinCompletionOnDate(targetItem, normalizedDate);
    }
    return commitCheckinCompletionOnDate(targetItem, normalizedDate, {
      includeDate: true,
      nextChecked: true,
    });
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
      Array.isArray(rawTodo.repeatMonthDays) ? rawTodo.repeatMonthDays : [],
      rawTodo.startDate || "",
      rawTodo.endDate || "",
      rawTodo.startTime || "",
      rawTodo.endTime || "",
      rawTodo.notification || null,
    );

    todo.id = rawTodo.id || todo.id;
    todo.createdAt = rawTodo.createdAt || todo.createdAt;
    todo.updatedAt = rawTodo.updatedAt || rawTodo.createdAt || todo.createdAt;
    todo.completed = !!rawTodo.completed;
    todo.completedAt = rawTodo.completedAt || null;
    todo.color = rawTodo.color || todo.getPriorityColor();
    const normalizedSchedule = normalizeTodoScheduleFields({
      dueDate: rawTodo.dueDate || "",
      repeatType: rawTodo.repeatType || todo.repeatType,
      repeatWeekdays: Array.isArray(rawTodo.repeatWeekdays)
        ? rawTodo.repeatWeekdays
        : todo.repeatWeekdays,
      repeatMonthDays: Array.isArray(rawTodo.repeatMonthDays)
        ? rawTodo.repeatMonthDays
        : todo.repeatMonthDays,
      startDate: rawTodo.startDate || todo.startDate,
      endDate: rawTodo.endDate || todo.endDate,
    });
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime: rawTodo.startTime || todo.startTime,
      endTime: rawTodo.endTime || todo.endTime,
    });
    todo.repeatType = normalizedSchedule.repeatType;
    todo.repeatWeekdays = normalizedSchedule.repeatWeekdays;
    todo.repeatMonthDays = normalizedSchedule.repeatMonthDays;
    todo.dueDate = normalizedSchedule.dueDate;
    todo.startDate = normalizedSchedule.startDate;
    todo.endDate = normalizedSchedule.endDate;
    todo.startTime = normalizedTimeRange.startTime;
    todo.endTime = normalizedTimeRange.endTime;
    todo.notification = normalizeTodoNotificationConfig(rawTodo.notification, {
      ...rawTodo,
      dueDate: todo.dueDate,
      startDate: todo.startDate,
      repeatType: todo.repeatType,
    });
    todo.includedDates = normalizePlanDateListForTodo(rawTodo.includedDates || []);
    todo.completedDates = normalizePlanDateListForTodo(rawTodo.completedDates || []);
    todo.uncompletedDates = normalizePlanDateListForTodo(rawTodo.uncompletedDates || []);
    todo.lastResolvedOccurrenceDate = normalizeTodoOccurrenceDateKey(
      rawTodo.lastResolvedOccurrenceDate,
    );
    if (todo.repeatType !== "none") {
      const legacyCompletedDate = normalizeTodoOccurrenceDateKey(
        rawTodo.completedAt || rawTodo.updatedAt || rawTodo.createdAt || "",
      );
      if (
        todo.completed &&
        legacyCompletedDate &&
        !todo.completedDates.includes(legacyCompletedDate)
      ) {
        todo.completedDates = normalizePlanDateListForTodo([
          ...todo.completedDates,
          legacyCompletedDate,
        ]);
      }
      todo.completed = false;
    }
    return todo;
  }

  function hydrateCheckinItem(rawItem) {
    const item = new CheckinItem(
      rawItem.title || "未命名打卡",
      rawItem.description || "",
      rawItem.color || "#4299e1",
      rawItem.repeatType || "daily",
      Array.isArray(rawItem.repeatWeekdays) ? rawItem.repeatWeekdays : [],
      Array.isArray(rawItem.repeatMonthDays) ? rawItem.repeatMonthDays : [],
      rawItem.startDate || "",
      rawItem.endDate || "",
      rawItem.startTime || "",
      rawItem.endTime || "",
      rawItem.notification || null,
      rawItem.status || "in_progress",
    );
    item.id = rawItem.id || item.id;
    item.createdAt = rawItem.createdAt || item.createdAt;
    item.updatedAt = rawItem.updatedAt || item.updatedAt || item.createdAt;
    item.status = normalizeCheckinLifecycleStatus(rawItem.status);
    item.deletedAt = String(rawItem.deletedAt || "").trim();
    item.mergedIntoId = String(rawItem.mergedIntoId || "").trim();
    item.includedDates = normalizePlanDateListForTodo(rawItem.includedDates || []);
    item.lastResolvedOccurrenceDate = normalizeTodoOccurrenceDateKey(
      rawItem.lastResolvedOccurrenceDate,
    );
    item.notification = normalizeCheckinNotificationConfig(
      rawItem.notification,
      {
        ...rawItem,
        startDate: item.startDate,
        repeatType: item.repeatType,
      },
    );
    item.scheduleRanges = normalizeCheckinScheduleRanges(
      rawItem.scheduleRanges,
      {
        ...item,
        ...rawItem,
        notification: item.notification,
      },
    );
    if (
      (item.status === "stopped" || item.status === "ended" || item.deletedAt) &&
      item.scheduleRanges.length > 0 &&
      (!item.scheduleRanges[item.scheduleRanges.length - 1].endDate ||
        item.scheduleRanges[item.scheduleRanges.length - 1].endDate >
          getLocalDateText())
    ) {
      closeCheckinScheduleRanges(
        item,
        String(item.endDate || item.deletedAt || getLocalDateText()).slice(0, 10) ||
          getLocalDateText(),
      );
    }
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
    const retainedSnapshot = captureTodoWorkspaceSnapshot();
    try {
      applyTodoWorkspaceSnapshot(readTodoWorkspaceSnapshot());
      todoInitialDataLoaded = true;
    } catch (e) {
      console.error("加载数据失败:", e);
      applyTodoWorkspaceSnapshot(retainedSnapshot);
    }
  }

  // 保存数据
  function saveData() {
    try {
      invalidateTodoDerivedCaches();
      return queueTodoPersist();
    } catch (e) {
      console.error("保存数据失败:", e);
      return Promise.resolve(false);
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
        menuWidthFactor: getExpandWidthFactor(
          MOBILE_TODO_DROPDOWN_WIDTH_FACTOR,
        ),
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
      flushPendingTodoSortPreferenceCoreBackfill();
      uiTools?.enhanceNativeSelect?.(sortSelect, {
        fullWidth: true,
        minWidth: 0,
        preferredMenuWidth: 220,
        maxMenuWidth: 260,
        widthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
        menuWidthFactor: getExpandWidthFactor(
          MOBILE_TODO_DROPDOWN_WIDTH_FACTOR,
        ),
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

  function initCheckinStatusFilter() {
    const filterSelect = document.getElementById("checkin-status-filter-select");
    if (!(filterSelect instanceof HTMLSelectElement)) {
      return;
    }
    filterSelect.value = currentCheckinStatusFilter;
    uiTools?.enhanceNativeSelect?.(filterSelect, {
      fullWidth: true,
      minWidth: 0,
      preferredMenuWidth: 220,
      maxMenuWidth: 260,
      widthFactor: getExpandWidthFactor(MOBILE_TODO_DROPDOWN_WIDTH_FACTOR),
      menuWidthFactor: getExpandWidthFactor(
        MOBILE_TODO_DROPDOWN_WIDTH_FACTOR,
      ),
    });
    filterSelect.addEventListener("change", () => {
      persistCheckinStatusFilter(filterSelect.value);
      filterSelect.value = currentCheckinStatusFilter;
      uiTools?.refreshEnhancedSelect?.(filterSelect);
      if (currentView === "checkins") {
        renderCheckinList();
      }
    });
    uiTools?.refreshEnhancedSelect?.(filterSelect);
  }

  // 初始化添加按钮
  function openTodoCreateFlow(options = {}) {
    const prefillTodo =
      options?.prefillTodo && typeof options.prefillTodo === "object"
        ? options.prefillTodo
        : null;
    if (prefillTodo) {
      showTodoEditModal(prefillTodo);
      return;
    }
    if (currentView === "checkins") {
      showCheckinItemModal();
      return;
    }
    showTodoEditModal();
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
      getLocalDateText(),
      searchTerm,
      todos.length,
      todos[0]?.updatedAt || todos[0]?.createdAt || "",
      todos[todos.length - 1]?.updatedAt ||
        todos[todos.length - 1]?.createdAt ||
        "",
    ].join("|");
    if (cacheKey === cachedTodoFilterKey) {
      return cachedFilteredTodos.slice();
    }

    let filteredTodos = todos.filter((todo) => {
      const completedToday = getTodoDisplayCompletionState(todo);
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
          return !completedToday;
        case "completed":
          return completedToday;
        case "overdue":
          return !completedToday && todo.isOverdue();
        case "today":
          return !completedToday && todo.isDueToday();
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

    const todosInScope = getFilteredSortedTodos().filter(
      (todo) => !getTodoDisplayCompletionState(todo),
    );
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
    const isImportant = (todo) =>
      todo.priority === "high" || todo.priority === "medium";

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
    const completedToday = getTodoDisplayCompletionState(todo);
    const todayDate = getLocalDateText();
    const isScheduledToday =
      todo.repeatType === "none"
        ? true
        : isTodoLinkedPlanOccurrenceAvailable("todo", todo, todayDate);
    const showCompletedAction = completedToday;
    const cardScale = getTodoListDensityScale(listScale);
    const titleFontSize = Math.max(12, Math.round(20 * cardScale));
    const descriptionFontSize = Math.max(10, Math.round(14 * cardScale));
    const metaFontSize = Math.max(9, Math.round(12 * cardScale));
    const actionFontSize = Math.max(10, Math.round(13 * cardScale));
    const cardMaxWidth = getTodoListCardMaxWidth(listScale);
    const cardPadding = Math.max(7, Math.round(12 * cardScale));
    const cardGap = Math.max(3, Math.round(6 * cardScale));
    const progressCardWidth = Math.max(96, Math.round(160 * cardScale));
    todoElement.className = `todo-item ${completedToday ? "completed" : ""}`;
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
    todoElement.style.alignSelf = isCompactMobileLayout()
      ? "stretch"
      : "center";
    todoElement.style.display = "flex";
    todoElement.style.flexDirection = "column";
    todoElement.style.gap = `${cardGap}px`;

    // 获取相关打卡记录
    const todoCheckins = getTodoCheckins(todo.id);
    todoCheckins.sort(
      (left, right) => new Date(right.time) - new Date(left.time),
    );
    const hasProgressRecords = todoCheckins.length > 0;
    const progressSummaryText = hasProgressRecords
      ? `已记录 ${todoCheckins.length} 条`
      : "暂无进度，点右侧“＋”补一条";
    const reminderSummary =
      getReminderTools()?.describeTodoReminder?.(todo) || "不通知";
    const showRepeatSummary =
      todo.repeatType && todo.repeatType !== "none";
    const showDueDateBadge = !showRepeatSummary;

    // 构建HTML
    todoElement.innerHTML = `
    <div class="todo-header">
      <h3 class="todo-title">${escapeHtml(todo.title)}</h3>
      ${
        showDueDateBadge
          ? `
      <span class="todo-due-date ${todo.getDueDateClass()}">
        ${escapeHtml(todo.getDueDateDisplay())}
      </span>
    `
          : ""
      }
    </div>
    
    <p class="todo-description">${escapeHtml(todo.description || "无描述")}</p>
    ${
      showRepeatSummary
        ? `
      <div class="todo-repeat-summary" style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 10px;">
        ${escapeHtml(todo.getRepeatSummary())} · ${escapeHtml(todo.startDate || "-")} ${todo.endDate ? `至 ${escapeHtml(todo.endDate)}` : "起"}
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
      `
          : ""
      }
      <div class="todo-progress-bottom-row">
        <div class="todo-progress-lane">
          <div class="todo-progress-summary-row">
            <div class="todo-progress-caption">进度记录</div>
            <div
              class="todo-progress-status"
              title="${escapeHtml(progressSummaryText)}"
            >
              ${escapeHtml(progressSummaryText)}
            </div>
          </div>
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
            ${showCompletedAction ? "取消完成" : "完成"}
          </button>
        </div>
      </div>
    </div>
  `;

    const completeButton = todoElement.querySelector(
      '[data-action="complete"]',
    );
    const progressButton = todoElement.querySelector(
      '[data-action="add-progress"]',
    );
    const headerElement = todoElement.querySelector(".todo-header");
    const titleElement = todoElement.querySelector(".todo-title");
    const dueDateElement = todoElement.querySelector(".todo-due-date");
    const descriptionElement = todoElement.querySelector(".todo-description");
    const reminderSummaryElement = todoElement.querySelector(
      ".todo-reminder-summary",
    );
    const tagsContainerElement = todoElement.querySelector(".todo-tags");
    const tagElements = todoElement.querySelectorAll(".todo-tag");
    const footerElement = todoElement.querySelector(".todo-footer");
    const progressBottomRowElement = todoElement.querySelector(
      ".todo-progress-bottom-row",
    );
    const actionStackElement = todoElement.querySelector(".todo-action-stack");
    const progressLaneElement = todoElement.querySelector(
      ".todo-progress-lane",
    );
    const progressSummaryRowElement = todoElement.querySelector(
      ".todo-progress-summary-row",
    );
    const repeatSummaryElement = todoElement.querySelector(
      ".todo-repeat-summary",
    );
    const progressCaptionElement = todoElement.querySelector(
      ".todo-progress-caption",
    );
    const progressStatusElement = todoElement.querySelector(
      ".todo-progress-status",
    );
    const progressRecordsContainer = todoElement.querySelector(
      ".todo-progress-records-row",
    );
    const progressRecords = todoElement.querySelectorAll(
      ".todo-progress-record",
    );
    const progressDateElements = todoElement.querySelectorAll(".checkin-date");
    const progressMessageElements =
      todoElement.querySelectorAll(".checkin-message");

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
      descriptionElement.style.webkitLineClamp = isCompactMobileLayout()
        ? "1"
        : "2";
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
    if (progressStatusElement) {
      progressStatusElement.style.fontSize = `${metaFontSize}px`;
      progressStatusElement.style.lineHeight = "1.2";
      progressStatusElement.style.whiteSpace = "nowrap";
      progressStatusElement.style.overflow = "hidden";
      progressStatusElement.style.textOverflow = "ellipsis";
      progressStatusElement.style.minWidth = "0";
    }
    if (footerElement) {
      footerElement.style.display = "flex";
      footerElement.style.flexDirection = "column";
      footerElement.style.alignItems = "stretch";
      footerElement.style.gap = `${Math.max(2, Math.round(4 * cardScale))}px`;
      footerElement.style.minWidth = "0";
    }
    if (progressBottomRowElement) {
      progressBottomRowElement.style.display = "flex";
      progressBottomRowElement.style.flexWrap = "nowrap";
      progressBottomRowElement.style.alignItems = "center";
      progressBottomRowElement.style.justifyContent = "space-between";
      progressBottomRowElement.style.gap = `${Math.max(6, Math.round(8 * cardScale))}px`;
      progressBottomRowElement.style.minWidth = "0";
      progressBottomRowElement.style.overflow = "hidden";
    }
    if (progressLaneElement) {
      progressLaneElement.style.display = "flex";
      progressLaneElement.style.alignItems = "center";
      progressLaneElement.style.flex = "1 1 auto";
      progressLaneElement.style.minWidth = "0";
      progressLaneElement.style.overflow = "hidden";
    }
    if (progressSummaryRowElement) {
      progressSummaryRowElement.style.display = "flex";
      progressSummaryRowElement.style.alignItems = "center";
      progressSummaryRowElement.style.gap = `${Math.max(4, Math.round(6 * cardScale))}px`;
      progressSummaryRowElement.style.flexWrap = "nowrap";
      progressSummaryRowElement.style.width = "100%";
      progressSummaryRowElement.style.minWidth = "0";
    }
    if (actionStackElement) {
      actionStackElement.style.gap = `${Math.max(6, Math.round(8 * cardScale))}px`;
      actionStackElement.style.marginLeft = "auto";
      actionStackElement.style.flex = "0 0 auto";
      actionStackElement.style.width = "";
      actionStackElement.style.flexWrap = "nowrap";
      actionStackElement.style.alignItems = "center";
      actionStackElement.style.justifyContent = "flex-end";
      actionStackElement.style.alignSelf = "center";
    }
    if (progressRecordsContainer) {
      progressRecordsContainer.style.gap = `${Math.max(4, Math.round(6 * cardScale))}px`;
      progressRecordsContainer.style.flex = "0 1 auto";
      progressRecordsContainer.style.width = "100%";
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
      completeButton.style.padding = `${Math.max(4, Math.round(5 * cardScale))}px ${Math.max(9, Math.round(12 * cardScale))}px`;
      completeButton.style.whiteSpace = "nowrap";
      completeButton.style.flexShrink = "0";
      completeButton.disabled = false;
      completeButton.textContent = showCompletedAction ? "取消完成" : "完成";
      completeButton.title =
        todo.repeatType !== "none" && !isScheduledToday
          ? completedToday
            ? "取消今天这次完成"
            : "今天未安排，点击后记为今天完成"
          : completedToday
            ? "取消这次完成状态"
            : "标记这次为完成";
      bindTodoActionButton(completeButton, () => {
        toggleTodoCompletion(todo.id);
      });
    }
    if (progressButton) {
      progressButton.style.fontSize = `${Math.max(actionFontSize + 1, Math.round(15 * cardScale))}px`;
      progressButton.style.width = `${Math.max(26, Math.round(32 * cardScale))}px`;
      progressButton.style.height = `${Math.max(26, Math.round(32 * cardScale))}px`;
      progressButton.style.padding = "0";
      progressButton.style.display = "inline-flex";
      progressButton.style.alignItems = "center";
      progressButton.style.justifyContent = "center";
      progressButton.style.lineHeight = "1";
      progressButton.style.textAlign = "center";
      progressButton.style.flexShrink = "0";
      bindTodoActionButton(progressButton, () => {
        showCheckinModal(todo.id);
      });
    }
    progressRecords.forEach((recordElement) => {
      recordElement.style.padding = `${Math.max(4, Math.round(5 * cardScale))}px ${Math.max(7, Math.round(9 * cardScale))}px`;
      recordElement.style.marginTop = "0";
      recordElement.style.minWidth = `${progressCardWidth}px`;
      recordElement.style.maxWidth = `${Math.max(progressCardWidth, Math.round(196 * cardScale))}px`;
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
      const actionButton = getTodoEventTargetElement(event)?.closest(
        "[data-action]",
      );
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
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
  function toggleTodoCompletion(todoId, dateText = getLocalDateText()) {
    const todo = todos.find((t) => matchesId(t.id, todoId));
    if (!todo) {
      return false;
    }
    const normalizedDate =
      normalizeTodoOccurrenceDateKey(dateText) || getLocalDateText();
    if (todo.repeatType !== "none") {
      void toggleRecurringTodoCompletionForDate(todo, normalizedDate).catch(
        (error) => {
          console.error("切换重复待办完成状态失败:", error);
        },
      );
      return true;
    }
    return commitTodoCompletionForDate(todo, normalizedDate);
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
    const previousLinkedPlans = readTodoLinkedPlanCollection();

    // 删除待办事项
    const index = todos.findIndex((t) => matchesId(t.id, todoId));
    if (index !== -1) {
      todos.splice(index, 1);
    } else {
      void showTodoAlert("删除失败：未找到该待办事项，请刷新后重试。", {
        title: "删除失败",
        danger: true,
      });
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
    void queueTodoSaveWithLinkedPlan({
      partialCore: {
        todos: getTodoSectionStateSnapshot("todos"),
      },
      sectionSaves: [
        {
          section: "checkins",
          previousItems: removedCheckins,
        },
      ],
      linkedPlanMutation: buildTodoLinkedPlanRemovalMutation("todo", todoId),
      reason: "todo-delete",
      errorLabel: "删除待办后保存联动数据失败:",
      refreshReminders: true,
    }).then(async (saved) => {
      if (saved) {
        return;
      }
      persistTodoLinkedPlanLocalMirror(previousLinkedPlans);
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
    const isEditMode = !!(todo && typeof todo === "object" && todo.id);

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
    <div class="modal-content ms controler-form-modal todo-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh;">
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
        
        <!-- 起止日期 -->
        <div
          id="todo-repeat-date-range"
          class="modal-date-range controler-form-modal-date-range"
          style="opacity: 1;"
        >
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始日期
            </label>
            <input type="date" id="todo-start-date-input" class="modal-date-input themed-native-picker-input" value="${todo?.startDate || todo?.dueDate || getLocalDateText()}" style="
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
            <input type="date" id="todo-end-date-input" class="modal-date-input themed-native-picker-input" value="${todo?.endDate || ""}" style="
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
          id="todo-time-range-disabled-hint"
          class="controler-form-modal-disabled-hint"
          hidden
        >
          仅不重复且同一天时可设置时间
        </div>

        <div
          id="todo-time-range-section"
          class="controler-form-modal-split controler-form-modal-time-range"
        >
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始时间
            </label>
            <input type="text" id="todo-start-time-input" class="modal-date-input controler-time-text-input" value="${todo?.startTime || ""}" placeholder="？？：？？" inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off" style="
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
              结束时间
            </label>
            <input type="text" id="todo-end-time-input" class="modal-date-input controler-time-text-input" value="${todo?.endTime || ""}" placeholder="？？：？？" inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off" style="
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
        
      
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer controler-form-modal-footer-inline todo-form-modal-footer" style="display: flex; align-items: center; gap: 10px; margin-top: 25px;">
        ${
          isEditMode
            ? `
          <button class="bts" type="button" id="delete-todo-btn" data-todo-modal-action="delete-todo" data-controler-modal-action-role="confirm" style="background-color: var(--delete-btn);">
            删除待办事项
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-todo-btn" data-todo-modal-action="cancel" data-controler-modal-action-role="cancel">取消</button>
          <button class="bts" type="button" id="save-todo-btn" data-todo-modal-action="save" data-controler-modal-action-role="confirm">${isEditMode ? "保存更改" : "创建待办事项"}</button>
        </div>
      </div>
    </div>
  `;

    const deferModalTextAutofocus = isTodoManagedModalDeferredAutofocusRuntime();
    appendTodoManagedModal(modal, "todo-edit", {
      deferTextAutofocus: deferModalTextAutofocus,
    });
    uiTools?.stopModalContentPropagation?.(modal);

    let unbindModalActions = () => {};
    const todoDraftSession = createTodoModalDraftSession(
      modal,
      `draft:todo:${todo?.id || "new"}:${isEditMode ? "edit" : "create"}`,
      "todo",
    );
    void restoreTodoManagedModalDraftSession(modal, todoDraftSession, {
      errorLabel: "恢复待办草稿失败:",
      deferTextAutofocus: deferModalTextAutofocus,
      activateAfterRestore: true,
    });
    const discardTodoDraft = () => {
      void todoDraftSession.clear().catch((error) => {
        console.error("清理待办草稿失败:", error);
      });
    };
    const closeTodoModal = (options = {}) => {
      todoDraftSession.destroy();
      unbindModalActions();
      closeModalElement(modal);
      if (options?.discardDraft === true) {
        discardTodoDraft();
      }
    };
    modal.__controlerCloseModal = () =>
      closeTodoModal({
        discardDraft: true,
      });

    const repeatDateRange = modal.querySelector("#todo-repeat-date-range");
    const timeRangeHint = modal.querySelector("#todo-time-range-disabled-hint");
    const timeRangeSection = modal.querySelector("#todo-time-range-section");
    const startDateInput = modal.querySelector("#todo-start-date-input");
    const endDateInput = modal.querySelector("#todo-end-date-input");
    const startTimeInput = modal.querySelector("#todo-start-time-input");
    const endTimeInput = modal.querySelector("#todo-end-time-input");
    const syncTodoTimeRangeState = (disabled) => {
      if (!(timeRangeSection instanceof HTMLElement)) {
        return;
      }
      timeRangeSection.classList.toggle("is-disabled", disabled);
      if (timeRangeHint instanceof HTMLElement) {
        timeRangeHint.hidden = !disabled;
      }
      if (disabled) {
        timeRangeSection.setAttribute("aria-disabled", "true");
        return;
      }
      timeRangeSection.removeAttribute("aria-disabled");
    };
    const syncTodoScheduleInputs = () => {
      const allowSingleDayTime =
        isTodoNonRepeatSingleDay({
          startDate: startDateInput?.value,
          endDate: endDateInput?.value,
        });
      if (repeatDateRange) {
        repeatDateRange.style.opacity = "1";
      }
      [startDateInput, endDateInput].forEach((input) => {
        if (input) {
          input.disabled = false;
        }
      });
      [startTimeInput, endTimeInput].forEach((input) => {
        if (input) {
          input.disabled = !allowSingleDayTime;
          if (!allowSingleDayTime) {
            input.value = "";
          }
        }
      });
      syncTodoTimeRangeState(!allowSingleDayTime);
    };
    startDateInput?.addEventListener("change", syncTodoScheduleInputs);
    endDateInput?.addEventListener("change", syncTodoScheduleInputs);
    syncTodoScheduleInputs();
    bindTodoReminderInputs(modal, "todo", {
      todoLike: todo,
    });
    unbindModalActions = bindTodoModalActions(modal, {
      cancel: () => closeTodoModal({ discardDraft: true }),
      save: createTodoModalLockedAction(modal, () =>
        saveTodo(modal, isEditMode, todo, {
          draftSession: todoDraftSession,
          closeModal: closeTodoModal,
        }),
      ),
      "delete-todo": createTodoModalConfirmedAction(
        modal,
        () => {
          if (!isEditMode || !todo) {
            return false;
          }
          return requestTodoConfirmation(
            "确定要删除这个待办事项吗？此操作不可撤销！",
            {
              title: "删除待办事项",
              confirmText: "删除",
              cancelText: "取消",
              danger: true,
            },
          );
        },
        async () => {
          if (!isEditMode || !todo) {
            return false;
          }
          await todoDraftSession.clear().catch((error) => {
            console.error("清理待办草稿失败:", error);
          });
          return deleteTodo(todo.id, {
            confirmDelete: false,
            closeModal: closeTodoModal,
          });
        },
      ),
    });

    bindTodoFormBackdropDismiss(modal, () =>
      closeTodoModal({
        discardDraft: true,
      }),
    );
  }

  // 保存待办事项
  async function saveTodo(modal, isEditMode, todoData, options = {}) {
    const {
      closeModal = () => closeModalElement(modal),
      refreshView = true,
      draftSession = null,
    } = options;
    const title = modal.querySelector("#todo-title-input").value.trim();
    const description = modal
      .querySelector("#todo-description-input")
      .value.trim();
    const rawStartDate =
      modal.querySelector("#todo-start-date-input")?.value ||
      getLocalDateText();
    const rawEndDate = modal.querySelector("#todo-end-date-input")?.value || "";
    const startTime = modal.querySelector("#todo-start-time-input")?.value || "";
    const endTime = modal.querySelector("#todo-end-time-input")?.value || "";
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
      void showTodoAlert("请输入待办事项标题", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    const normalizedSchedule = normalizeTodoScheduleFields({
      dueDate: rawEndDate || "",
      repeatType: "none",
      repeatWeekdays: [],
      repeatMonthDays: [],
      startDate: rawStartDate,
      endDate: rawEndDate,
    });
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime,
      endTime,
    });
    const hasInvalidTimeRangeInput =
      (!!String(startTime || "").trim() && !normalizedTimeRange.startTime) ||
      (!!String(endTime || "").trim() && !normalizedTimeRange.endTime);
    const reminderConfig = readTodoReminderConfig(
      modal,
      {
        ...todoData,
        dueDate: normalizedSchedule.dueDate,
        startDate: normalizedSchedule.startDate,
        endDate: normalizedSchedule.endDate,
        repeatType: normalizedSchedule.repeatType,
        _occurrenceDate: normalizedSchedule.startDate,
        startTime: normalizedTimeRange.startTime,
        endTime: normalizedTimeRange.endTime,
      },
      "todo",
    );
    const isSingleDayNonRepeatTodo = isTodoNonRepeatSingleDay({
      startDate: normalizedSchedule.startDate,
      endDate: normalizedSchedule.endDate,
      dueDate: normalizedSchedule.dueDate,
    });

    if (
      normalizedSchedule.endDate &&
      normalizedSchedule.startDate &&
      normalizedSchedule.endDate < normalizedSchedule.startDate
    ) {
      void showTodoAlert("结束日期不能早于开始日期", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    if (hasInvalidTimeRangeInput) {
      void showTodoAlert("请输入 24 小时制时间，格式如 13:00", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    if (
      (!!normalizedTimeRange.startTime && !normalizedTimeRange.endTime) ||
      (!normalizedTimeRange.startTime && !!normalizedTimeRange.endTime)
    ) {
      void showTodoAlert("请同时选择开始时间和结束时间", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    if (
      normalizedTimeRange.startTime &&
      normalizedTimeRange.endTime &&
      normalizedTimeRange.startTime >= normalizedTimeRange.endTime
    ) {
      void showTodoAlert("结束时间必须晚于开始时间", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    if (
      normalizedSchedule.repeatType === "none" &&
      normalizedTimeRange.startTime &&
      !isSingleDayNonRepeatTodo
    ) {
      void showTodoAlert("不重复的待办只有在开始日期和结束日期为同一天时才能设置时间", {
        title: "无法保存待办事项",
        danger: true,
      });
      return false;
    }

    const previousTodos = getTodoSectionStateSnapshot("todos");
    if (isEditMode && todoData) {
      // 更新现有待办事项
      const index = todos.findIndex((t) => matchesId(t.id, todoData.id));
      if (index === -1) {
        void showTodoAlert("保存失败：未找到该待办事项，请刷新后重试。", {
          title: "保存失败",
          danger: true,
        });
        return false;
      }
      const completionInput = modal.querySelector("#todo-completed-checkbox");
      const isCompleted =
        completionInput instanceof HTMLInputElement
          ? completionInput.checked
          : getTodoDisplayCompletionState(todos[index]);

      todos[index] = hydrateTodo({
        ...todos[index],
        title,
        description,
        dueDate: normalizedSchedule.dueDate,
        priority,
        tags,
        repeatType: normalizedSchedule.repeatType,
        repeatWeekdays: normalizedSchedule.repeatWeekdays,
        repeatMonthDays: normalizedSchedule.repeatMonthDays,
        startDate: normalizedSchedule.startDate,
        endDate: normalizedSchedule.endDate,
        startTime: normalizedTimeRange.startTime,
        endTime: normalizedTimeRange.endTime,
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
        normalizedSchedule.repeatMonthDays,
        normalizedSchedule.startDate,
        normalizedSchedule.endDate,
        normalizedTimeRange.startTime,
        normalizedTimeRange.endTime,
        reminderConfig,
      );
      todos.push(newTodo);
    }

    const saved = await runTodoBlockingMutation(
      {
        closeModal,
        refreshView,
        sourceModal: modal,
        title: isEditMode ? "正在保存待办" : "正在创建待办",
        message: "正在写入待办与同步数据，请稍候",
        perfAction: isEditMode ? "todo-edit" : "todo-create",
      },
      async () => {
        const targetTodo =
          isEditMode && todoData
            ? todos.find((item) => matchesId(item.id, todoData.id)) || null
            : todos[todos.length - 1] || null;
        const persisted = await queueTodoSaveWithLinkedPlan({
          partialCore: {
            todos: getTodoSectionStateSnapshot("todos"),
          },
          linkedPlanMutation: buildTodoLinkedPlanMutation("todo", targetTodo),
          reason: isEditMode ? "todo-edit" : "todo-create",
          errorLabel: "保存待办事项失败:",
          refreshReminders: true,
        });
        if (!persisted) {
          await rollbackTodoOptimisticChange(
            {
              todos: previousTodos,
            },
            {
              message: "保存待办事项失败，本次修改已撤销。",
              refreshView,
            },
          );
          return false;
        }
        return true;
      },
    );

    if (saved && draftSession && typeof draftSession.clear === "function") {
      try {
        await draftSession.clear();
      } catch (error) {
        console.error("清理待办草稿失败:", error);
      }
    }
    if (saved) {
      const permissionTask = getReminderTools()?.requestPermissionIfNeeded?.(
        "待办",
        reminderConfig,
        {
          silentWhenDisabled: false,
        },
      );
      void permissionTask?.catch?.((error) => {
        console.error("请求待办提醒权限失败:", error);
      });
    }
    return saved;
  }

  function showCheckinModal(todoId, checkinId = null) {
    const todo = todos.find((item) => matchesId(item.id, todoId));
    if (!todo) return;

    const existingRecord = checkinId ? getTodoCheckinById(checkinId) : null;
    const isEditMode =
      !!existingRecord && matchesId(existingRecord.todoId, todoId);

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
    <div class="modal-content ms controler-form-modal todo-form-modal" style="padding: 25px; border-radius: 15px; max-width: 420px; width: 90%; max-height: 90vh;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${isEditMode ? `📝 编辑"${escapeHtml(todo.title)}"的进度` : `📝 为"${escapeHtml(todo.title)}"添加进度`}
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
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
            font-size: 16px;
            min-height: 120px;
            resize: vertical;
          ">${escapeHtml(existingRecord?.message || "")}</textarea>
        </div>
      </div>
      
      <div class="controler-form-modal-footer controler-form-modal-footer-inline todo-form-modal-footer" style="display: flex; align-items: center; gap: 10px; margin-top: 25px;">
        ${
          isEditMode
            ? '<button class="bts" type="button" id="delete-checkin-progress-btn" data-todo-modal-action="delete-progress" data-controler-modal-action-role="confirm" style="margin:0; background-color: var(--delete-btn);">删除</button>'
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-checkin-btn" data-todo-modal-action="cancel" data-controler-modal-action-role="cancel" style="margin:0;">取消</button>
          <button class="bts" type="button" id="save-checkin-btn" data-todo-modal-action="save" data-controler-modal-action-role="confirm" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

    const deferModalTextAutofocus = isTodoManagedModalDeferredAutofocusRuntime();
    appendTodoManagedModal(modal, "todo-progress", {
      deferTextAutofocus: deferModalTextAutofocus,
    });
    uiTools?.stopModalContentPropagation?.(modal);

    let unbindModalActions = () => {};
    const progressDraftSession = createTodoModalDraftSession(
      modal,
      `draft:todo-progress:${todoId}:${existingRecord?.id || "new"}`,
      "todo-progress",
    );
    void restoreTodoManagedModalDraftSession(modal, progressDraftSession, {
      errorLabel: "恢复进度草稿失败:",
      deferTextAutofocus: deferModalTextAutofocus,
      activateAfterRestore: true,
    });
    const discardProgressDraft = () => {
      void progressDraftSession.clear().catch((error) => {
        console.error("清理进度草稿失败:", error);
      });
    };
    const closeModal = (options = {}) => {
      progressDraftSession.destroy();
      unbindModalActions();
      closeModalElement(modal);
      if (options?.discardDraft === true) {
        discardProgressDraft();
      }
    };
    modal.__controlerCloseModal = () =>
      closeModal({
        discardDraft: true,
      });

    const saveAction = async () => {
      const message = modal
        .querySelector("#checkin-message-input")
        .value.trim();
      if (!message) {
        await showTodoAlert("请输入进度内容", {
          title: "无法保存进度",
          danger: true,
        });
        return false;
      }

      const previousCheckins = getTodoSectionStateSnapshot("checkins");
      const saved = saveTodoProgressRecord(
        todoId,
        message,
        existingRecord?.id || null,
      );
      if (!saved) {
        await showTodoAlert("保存失败，请刷新后重试", {
          title: "保存失败",
          danger: true,
        });
        return false;
      }

      const targetCheckin = existingRecord?.id
        ? getTodoCheckinById(existingRecord.id)
        : checkins[checkins.length - 1] || null;
      const persisted = await runTodoBlockingMutation(
        {
          closeModal,
          refreshView: true,
          sourceModal: modal,
          title: existingRecord ? "正在保存进度" : "正在创建进度",
          message: "正在写入进度记录，请稍候",
          perfAction: existingRecord ? "progress-edit" : "progress-create",
        },
        async () => {
          const savedResult = await queueTodoSectionSave("checkins", {
            periodIds: [getTodoSectionPeriodId("checkins", targetCheckin)],
            errorLabel: "保存进度记录失败:",
          });
          if (savedResult) {
            return true;
          }
          await rollbackTodoOptimisticChange(
            {
              checkins: previousCheckins,
            },
            {
              message: "保存进度记录失败，本次修改已撤销。",
            },
          );
          return false;
        },
      );
      if (persisted) {
        try {
          await progressDraftSession.clear();
        } catch (error) {
          console.error("清理进度草稿失败:", error);
        }
      }
      return persisted;
    };

    const confirmDeleteAction = async () => {
      if (!existingRecord) {
        return false;
      }
      const confirmed = await requestTodoConfirmation(
        "确定删除这条进度记录吗？",
        {
          title: "删除进度记录",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
          forceFallback: true,
        },
      );
      if (!confirmed) {
        closeModal({
          discardDraft: true,
        });
        return false;
      }
      return true;
    };

    const deleteAction = async () => {
      if (!existingRecord) return false;
      const previousCheckins = getTodoSectionStateSnapshot("checkins");
      const deleted = deleteTodoProgressRecord(existingRecord.id);
      if (!deleted) {
        await showTodoAlert("删除失败，请刷新后重试", {
          title: "删除失败",
          danger: true,
        });
        return false;
      }
      const persisted = await runTodoBlockingMutation(
        {
          closeModal,
          refreshView: true,
          sourceModal: modal,
          title: "正在删除进度",
          message: "正在同步删除进度记录，请稍候",
          perfAction: "progress-delete",
        },
        async () => {
          const savedResult = await queueTodoSectionSave("checkins", {
            previousItems: [existingRecord],
            periodIds: [getTodoSectionPeriodId("checkins", existingRecord)],
            errorLabel: "删除进度记录失败:",
          });
          if (savedResult) {
            return true;
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
          return false;
        },
      );
      if (persisted) {
        try {
          await progressDraftSession.clear();
        } catch (error) {
          console.error("清理进度草稿失败:", error);
        }
      }
      return persisted;
    };

    unbindModalActions = bindTodoModalActions(modal, {
      cancel: () => closeModal({ discardDraft: true }),
      save: createTodoModalLockedAction(modal, saveAction),
      "delete-progress": createTodoModalConfirmedAction(
        modal,
        confirmDeleteAction,
        deleteAction,
      ),
    });

    bindTodoFormBackdropDismiss(modal, () =>
      closeModal({
        discardDraft: true,
      }),
    );
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
        const completedToday = getTodoDisplayCompletionState(todo);
        result.total += 1;
        if (completedToday) {
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

  function updateCheckinStats(options = {}) {
    const todayCountElement = document.getElementById("today-checkin-count");
    const totalCountElement = document.getElementById("total-checkin-count");
    const maxStreakElement = document.getElementById("max-streak-days");
    if (!todayCountElement || !totalCountElement) return;

    const today = normalizeTodoOccurrenceDateKey(options?.todayText) || getLocalDateText();
    const dailyCheckinLookup =
      options?.dailyCheckinLookup || createTodoDailyCheckinLookup();
    const visibleItems = Array.isArray(options?.visibleItems)
      ? options.visibleItems
      : getVisibleCheckinItems();
    const scheduledItems = visibleItems.filter(
      (item) =>
        isCheckinItemActive(item, today) &&
        typeof item.isScheduledOn === "function" &&
        item.isScheduledOn(today),
    );
    const checkedTodayCount = scheduledItems.reduce((count, item) => {
      return count +
        (getLatestTodoDailyCheckinEntryFromLookup(
          dailyCheckinLookup,
          item.id,
          today,
        )?.checked
          ? 1
          : 0);
    }, 0);

    todayCountElement.textContent = String(checkedTodayCount);
    totalCountElement.textContent = String(scheduledItems.length);

    const maxStreak = visibleItems.reduce((max, item) => {
      const checkedDays =
        typeof item.getCheckedDaysCount === "function"
          ? item.getCheckedDaysCount(dailyCheckinLookup) || 0
          : 0;
      return Math.max(max, checkedDays);
    }, 0);
    if (maxStreakElement) {
      maxStreakElement.textContent = String(maxStreak);
    }

    const panelTotal = document.getElementById("checkin-stat-total-items");
    const panelScheduled = document.getElementById(
      "checkin-stat-today-scheduled",
    );
    const panelDone = document.getElementById("checkin-stat-today-done");
    const panelStreak = document.getElementById("checkin-stat-max-streak");
    if (panelTotal) panelTotal.textContent = String(visibleItems.length);
    if (panelScheduled)
      panelScheduled.textContent = String(scheduledItems.length);
    if (panelDone) panelDone.textContent = String(checkedTodayCount);
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
        [],
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

  function buildCheckinModalSeedItem(item = null, options = {}) {
    const resumeMode = options?.resumeMode === true;
    const todayText = getLocalDateText();
    const source =
      item && typeof item === "object"
        ? {
            ...item,
          }
        : {};
    const status = getCheckinModalDefaultStatus(item, options);
    return {
      ...source,
      status,
      startDate: resumeMode
        ? todayText
        : String(source.startDate || "").trim() || todayText,
      endDate: resumeMode ? "" : String(source.endDate || "").trim(),
    };
  }

  function bindCheckinModalInputState(modal) {
    if (!(modal instanceof HTMLElement)) {
      return () => {};
    }

    const statusSelect = modal.querySelector("#checkin-status-select");
    const repeatRadios = modal.querySelectorAll(
      'input[name="checkin-repeat-type"]',
    );
    const weekdayWrap = modal.querySelector("#checkin-weekday-wrap");
    const monthdayWrap = modal.querySelector("#checkin-monthday-wrap");
    const scheduleSection = modal.querySelector("#checkin-schedule-section");
    const dateRangeSection = modal.querySelector("#checkin-date-range-section");
    const timeRangeSection = modal.querySelector("#checkin-time-range-section");
    const reminderSection = modal.querySelector("#checkin-reminder-section");

    const syncRepeatWraps = () => {
      const activeRepeatType =
        modal.querySelector('input[name="checkin-repeat-type"]:checked')
          ?.value || "daily";
      if (weekdayWrap) {
        weekdayWrap.style.display =
          activeRepeatType === "weekly" ? "block" : "none";
      }
      if (monthdayWrap) {
        monthdayWrap.style.display =
          activeRepeatType === "monthly" ? "block" : "none";
      }
    };

    const setSectionDisabled = (section, disabled) => {
      if (!(section instanceof HTMLElement)) {
        return;
      }
      section.style.opacity = disabled ? "0.56" : "1";
      section
        .querySelectorAll("input, select, textarea, button")
        .forEach((control) => {
          if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement ||
            control instanceof HTMLButtonElement
          ) {
            if (
              control.id === "checkin-title-input" ||
              control.id === "checkin-description-input" ||
              control.id === "checkin-status-select" ||
              control.id === "checkin-save-checkin-item-btn" ||
              control.id === "save-checkin-item-btn" ||
              control.id === "cancel-checkin-item-btn" ||
              control.id === "delete-checkin-btn"
            ) {
              return;
            }
            control.disabled = disabled;
          }
        });
    };

    const syncStatus = () => {
      const status = normalizeCheckinLifecycleStatus(statusSelect?.value);
      const disabled = status === "ended";
      setSectionDisabled(scheduleSection, disabled);
      setSectionDisabled(dateRangeSection, disabled);
      setSectionDisabled(timeRangeSection, disabled);
      setSectionDisabled(reminderSection, disabled);
      syncRepeatWraps();
    };

    repeatRadios.forEach((radio) => {
      radio.addEventListener("change", syncRepeatWraps);
    });
    statusSelect?.addEventListener("change", syncStatus);
    syncStatus();

    return () => {
      statusSelect?.removeEventListener("change", syncStatus);
      repeatRadios.forEach((radio) => {
        radio.removeEventListener("change", syncRepeatWraps);
      });
    };
  }

  // 显示打卡项目创建弹窗
  function showCheckinItemModal(item = null, options = {}) {
    const resumeMode = options?.resumeMode === true;
    const modalItem = buildCheckinModalSeedItem(item, options);
    const isEditMode = !!(item && typeof item === "object" && item.id);
    const weekDays = Array.isArray(modalItem?.repeatWeekdays)
      ? modalItem.repeatWeekdays
      : [];
    const monthDays = Array.isArray(modalItem?.repeatMonthDays)
      ? modalItem.repeatMonthDays
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
    <div class="modal-content ms controler-form-modal todo-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${
          resumeMode
            ? "继续打卡项目"
            : isEditMode
              ? "编辑打卡项目"
              : "创建打卡项目"
        }
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
        <!-- 标题 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            标题 *
          </label>
          <input type="text" id="checkin-title-input" value="${modalItem?.title || ""}" placeholder="输入打卡项目标题" style="
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
          ">${modalItem?.description || ""}</textarea>
        </div>

        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            状态
          </label>
          <select id="checkin-status-select" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 15px;
          ">
            <option value="in_progress" ${normalizeCheckinLifecycleStatus(modalItem?.status) === "in_progress" ? "selected" : ""}>进行中</option>
            <option value="stopped" ${normalizeCheckinLifecycleStatus(modalItem?.status) === "stopped" ? "selected" : ""}>已停止</option>
            <option value="ended" ${normalizeCheckinLifecycleStatus(modalItem?.status) === "ended" ? "selected" : ""}>结束</option>
          </select>
        </div>

        <!-- 重复规则 -->
        <div id="checkin-schedule-section">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            重复规则
          </label>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="checkin-repeat-type" value="daily" ${(modalItem?.repeatType || "daily") === "daily" ? "checked" : ""}>
              每天
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="checkin-repeat-type" value="weekly" ${modalItem?.repeatType === "weekly" ? "checked" : ""}>
              每周
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 6px;">
              <input type="radio" name="checkin-repeat-type" value="monthly" ${modalItem?.repeatType === "monthly" ? "checked" : ""}>
              每月
            </label>
          </div>
          <div id="checkin-weekday-wrap" style="
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            background-color: var(--bg-tertiary);
            display: ${modalItem?.repeatType === "weekly" ? "block" : "none"};
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
          <div id="checkin-monthday-wrap" style="
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            background-color: var(--bg-tertiary);
            display: ${modalItem?.repeatType === "monthly" ? "block" : "none"};
          ">
            <div style="color: var(--muted-text-color); font-size: 12px; margin-bottom: 8px;">
              每月重复日期
            </div>
            <div class="controler-repeat-day-grid">
              ${buildMonthlyRepeatOptionsHtml(
                "checkin-repeat-month-day",
                monthDays,
              )}
            </div>
          </div>
        </div>

        <!-- 起止日期 -->
        <div id="checkin-date-range-section" class="modal-date-range controler-form-modal-date-range">
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始日期
            </label>
            <input type="date" id="checkin-start-date-input" class="modal-date-input themed-native-picker-input" value="${modalItem?.startDate || getLocalDateText()}" style="
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
            <input type="date" id="checkin-end-date-input" class="modal-date-input themed-native-picker-input" value="${modalItem?.endDate || ""}" style="
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

        <div id="checkin-time-range-section" class="controler-form-modal-split controler-form-modal-time-range">
          <div class="modal-date-field">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始时间
            </label>
            <input type="text" id="checkin-start-time-input" class="modal-date-input controler-time-text-input" value="${modalItem?.startTime || ""}" placeholder="？？：？？" inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off" style="
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
              结束时间
            </label>
            <input type="text" id="checkin-end-time-input" class="modal-date-input controler-time-text-input" value="${modalItem?.endTime || ""}" placeholder="？？：？？" inputmode="numeric" maxlength="5" spellcheck="false" autocomplete="off" style="
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

        <div id="checkin-reminder-section">
          ${getCheckinReminderSectionHtml(modalItem, "checkin")}
        </div>
        
        <!-- 颜色选择 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            项目颜色
          </label>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#4299e1" ${!modalItem?.color || modalItem?.color === "#4299e1" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #4299e1; border-radius: 4px;"></span>
              <span style="font-size: 14px;">蓝色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#48bb78" ${modalItem?.color === "#48bb78" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #48bb78; border-radius: 4px;"></span>
              <span style="font-size: 14px;">绿色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#ed8936" ${modalItem?.color === "#ed8936" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #ed8936; border-radius: 4px;"></span>
              <span style="font-size: 14px;">橙色</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="checkin-color" value="#9f7aea" ${modalItem?.color === "#9f7aea" ? "checked" : ""}>
              <span style="display: inline-block; width: 20px; height: 20px; background-color: #9f7aea; border-radius: 4px;"></span>
              <span style="font-size: 14px;">紫色</span>
            </label>
          </div>
        </div>
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer controler-form-modal-footer-inline todo-form-modal-footer" style="display: flex; align-items: center; gap: 10px; margin-top: 25px;">
        ${
          isEditMode
            ? `
          <button class="bts" type="button" id="delete-checkin-btn" data-todo-modal-action="delete-checkin-item" data-controler-modal-action-role="confirm" style="background-color: var(--delete-btn);">
            删除打卡项目
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button class="bts" type="button" id="cancel-checkin-item-btn" data-todo-modal-action="cancel" data-controler-modal-action-role="cancel">取消</button>
          <button class="bts" type="button" id="save-checkin-item-btn" data-todo-modal-action="save" data-controler-modal-action-role="confirm">${
            resumeMode
              ? "保存并继续"
              : isEditMode
                ? "保存更改"
                : "创建打卡项目"
          }</button>
        </div>
      </div>
    </div>
  `;

    const deferModalTextAutofocus = isTodoManagedModalDeferredAutofocusRuntime();
    appendTodoManagedModal(modal, "checkin-item", {
      deferTextAutofocus: deferModalTextAutofocus,
    });
    uiTools?.stopModalContentPropagation?.(modal);

    let unbindModalActions = () => {};
    const unbindModalStateSync = bindCheckinModalInputState(modal);
    const closeCheckinItemModal = () => {
      unbindModalStateSync();
      unbindModalActions();
      closeModalElement(modal);
    };

    const statusSelect = modal.querySelector("#checkin-status-select");
    uiTools?.enhanceNativeSelect?.(statusSelect, {
      fullWidth: true,
      minWidth: 0,
      preferredMenuWidth: 220,
      maxMenuWidth: 260,
    });
    bindCheckinReminderInputs(modal, "checkin", {
      itemLike: modalItem,
    });

    // 绑定事件
    const cancelAction = () => {
      closeCheckinItemModal();
    };
    const saveAction = () => {
      return saveCheckinItem(modal, isEditMode, item, {
        closeModal: closeCheckinItemModal,
        resumeMode,
      });
    };

    unbindModalActions = bindTodoModalActions(modal, {
      cancel: cancelAction,
      save: createTodoModalLockedAction(modal, saveAction),
      "delete-checkin-item": createTodoModalConfirmedAction(
        modal,
        () => {
          if (!isEditMode || !item) {
            return false;
          }
          return requestTodoConfirmation(
            "确定要删除这个打卡项目吗？此操作不可撤销！",
            {
              title: "删除打卡项目",
              confirmText: "删除",
              cancelText: "取消",
              danger: true,
            },
          );
        },
        async () => {
          if (!isEditMode || !item) {
            return false;
          }
          return deleteCheckinItem(item.id, {
            confirmDelete: false,
            closeModal: closeCheckinItemModal,
          });
        },
      ),
    });

    bindTodoFormBackdropDismiss(modal, () => {
      closeCheckinItemModal();
    });
    if (deferModalTextAutofocus) {
      scheduleTodoManagedModalTextAutofocusResume(modal);
    }
  }

  // 保存打卡项目
  async function saveCheckinItem(modal, isEditMode, itemData, options = {}) {
    const {
      closeModal = () => closeModalElement(modal),
      refreshView = true,
      resumeMode = false,
    } = options;
    const title = modal.querySelector("#checkin-title-input").value.trim();
    const description = modal
      .querySelector("#checkin-description-input")
      .value.trim();
    const selectedStatus = normalizeCheckinLifecycleStatus(
      modal.querySelector("#checkin-status-select")?.value,
    );
    const repeatType =
      modal.querySelector('input[name="checkin-repeat-type"]:checked')?.value ||
      "daily";
    const repeatWeekdays = Array.from(
      modal.querySelectorAll('input[name="checkin-repeat-weekday"]:checked'),
    ).map((input) => parseInt(input.value, 10));
    const repeatMonthDays = Array.from(
      modal.querySelectorAll('input[name="checkin-repeat-month-day"]:checked'),
    ).map((input) => parseInt(input.value, 10));
    const startDate =
      modal.querySelector("#checkin-start-date-input")?.value ||
      getLocalDateText();
    const endDate = modal.querySelector("#checkin-end-date-input")?.value || "";
    const startTime =
      modal.querySelector("#checkin-start-time-input")?.value || "";
    const endTime = modal.querySelector("#checkin-end-time-input")?.value || "";
    const color = modal.querySelector(
      'input[name="checkin-color"]:checked',
    ).value;
    const normalizedTimeRange = normalizeTodoTimeRangeFields({
      startTime,
      endTime,
    });
    const hasInvalidTimeRangeInput =
      (!!String(startTime || "").trim() && !normalizedTimeRange.startTime) ||
      (!!String(endTime || "").trim() && !normalizedTimeRange.endTime);
    const todayText = getLocalDateText();
    const nowIso = new Date().toISOString();
    let effectiveEndDate = endDate;
    let reminderConfig =
      selectedStatus === "ended"
        ? normalizeCheckinNotificationConfig(
            {
              enabled: false,
              mode: "none",
            },
            itemData || {},
          )
        : readCheckinReminderConfig(
            modal,
            {
              ...itemData,
              startDate,
              endDate,
              repeatType,
              startTime: normalizedTimeRange.startTime,
              endTime: normalizedTimeRange.endTime,
            },
            "checkin",
          );

    // 验证输入
    if (!title) {
      void showTodoAlert("请输入打卡项目标题", {
        title: "无法保存打卡项目",
        danger: true,
      });
      return false;
    }

    if (selectedStatus !== "ended") {
      if (!startDate) {
        void showTodoAlert("请选择开始日期", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (selectedStatus === "stopped" && (!effectiveEndDate || effectiveEndDate > todayText)) {
        effectiveEndDate = todayText;
      }

      if (effectiveEndDate && effectiveEndDate < startDate) {
        void showTodoAlert("结束日期不能早于开始日期", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (repeatType === "weekly" && repeatWeekdays.length === 0) {
        void showTodoAlert("请选择每周重复的日期", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (repeatType === "monthly" && repeatMonthDays.length === 0) {
        void showTodoAlert("请选择每月重复的日期", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (hasInvalidTimeRangeInput) {
        void showTodoAlert("请输入 24 小时制时间，格式如 13:00", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (
        (!!normalizedTimeRange.startTime && !normalizedTimeRange.endTime) ||
        (!normalizedTimeRange.startTime && !!normalizedTimeRange.endTime)
      ) {
        void showTodoAlert("请同时选择开始时间和结束时间", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }

      if (
        normalizedTimeRange.startTime &&
        normalizedTimeRange.endTime &&
        normalizedTimeRange.startTime >= normalizedTimeRange.endTime
      ) {
        void showTodoAlert("结束时间必须晚于开始时间", {
          title: "无法保存打卡项目",
          danger: true,
        });
        return false;
      }
    }

    const previousCheckinItems = getTodoSectionStateSnapshot("checkinItems");
    const previousDailyCheckins = getTodoSectionStateSnapshot("dailyCheckins");
    const previousCheckinHistorySummary = getCheckinHistorySummarySnapshot();
    let linkedPlanSourceItem = null;
    let dailyCheckinsChanged = false;
    let mergeCheckinAcrossAllPeriods = false;
    let mutationReason = "checkin-item-create";
    let progressTitle = "正在创建打卡";
    let progressMessage = "正在写入打卡项目与同步数据，请稍候";
    let perfAction = "checkin-item-create";

    const liveSameTitle =
      isEditMode && itemData
        ? findLiveCheckinItemByTitle(title, itemData.id)
        : null;

    if (isEditMode && itemData && liveSameTitle) {
      const sourceIndex = checkinItems.findIndex((item) =>
        matchesId(item.id, itemData.id),
      );
      const targetIndex = checkinItems.findIndex((item) =>
        matchesId(item.id, liveSameTitle.id),
      );
      if (sourceIndex === -1 || targetIndex === -1) {
        void showTodoAlert("保存失败：未找到需要合并的打卡项目，请刷新后重试。", {
          title: "保存失败",
          danger: true,
        });
        return false;
      }
      const sourceItem = hydrateCheckinItem(checkinItems[sourceIndex]);
      const targetItem = hydrateCheckinItem(checkinItems[targetIndex]);
      closeCheckinScheduleRanges(sourceItem, todayText);
      const visibleDailyMergeResult = mergeDailyCheckinsByItemId(
        targetItem.id,
        sourceItem.id,
      );
      mergeCheckinHistorySummaryEntries(targetItem.id, sourceItem.id, nowIso);
      mergeCheckinScheduleRanges(targetItem, sourceItem);
      mergeCheckinItemOccurrenceState(targetItem, sourceItem);
      targetItem.title = title;
      targetItem.updatedAt = nowIso;
      sourceItem.status = "ended";
      sourceItem.deletedAt = nowIso;
      sourceItem.mergedIntoId = targetItem.id;
      sourceItem.updatedAt = nowIso;
      checkinItems[targetIndex] = targetItem;
      checkinItems[sourceIndex] = sourceItem;
      linkedPlanSourceItem = targetItem;
      dailyCheckinsChanged = visibleDailyMergeResult.changed;
      mergeCheckinAcrossAllPeriods = true;
      mutationReason = "checkin-item-merge-by-title";
      progressTitle = "正在合并打卡";
      progressMessage = "正在合并同名打卡项目与历史记录，请稍候";
      perfAction = "checkin-item-merge";
    } else if (isEditMode && itemData) {
      const index = checkinItems.findIndex((item) =>
        matchesId(item.id, itemData.id),
      );
      if (index === -1) {
        void showTodoAlert("保存失败：未找到该打卡项目，请刷新后重试。", {
          title: "保存失败",
          danger: true,
        });
        return false;
      }
      const currentItem = checkinItems[index];
      const nextItem = hydrateCheckinItem({
        ...currentItem,
        title,
        description,
        color,
        repeatType:
          selectedStatus === "ended" ? currentItem.repeatType : repeatType,
        repeatWeekdays:
          selectedStatus === "ended"
            ? currentItem.repeatWeekdays
            : repeatWeekdays,
        repeatMonthDays:
          selectedStatus === "ended"
            ? currentItem.repeatMonthDays
            : repeatMonthDays,
        startDate:
          selectedStatus === "ended"
            ? currentItem.startDate || startDate || todayText
            : startDate,
        endDate:
          selectedStatus === "ended"
            ? currentItem.endDate || ""
            : effectiveEndDate,
        startTime:
          selectedStatus === "ended"
            ? currentItem.startTime || ""
            : normalizedTimeRange.startTime,
        endTime:
          selectedStatus === "ended"
            ? currentItem.endTime || ""
            : normalizedTimeRange.endTime,
        notification:
          selectedStatus === "ended"
            ? normalizeCheckinNotificationConfig(
                {
                  enabled: false,
                  mode: "none",
                },
                currentItem,
              )
            : reminderConfig,
        status: selectedStatus,
        deletedAt: "",
        mergedIntoId: "",
        updatedAt: nowIso,
      });
      nextItem.scheduleRanges = normalizeCheckinScheduleRanges(
        currentItem.scheduleRanges,
        currentItem,
      );
      if (resumeMode) {
        if (selectedStatus === "ended") {
          closeCheckinScheduleRanges(nextItem, todayText);
        } else {
          appendCheckinScheduleRange(
            nextItem,
            {
              ...nextItem,
              notification: nextItem.notification,
            },
            {
              closedDate:
                selectedStatus === "stopped" ? effectiveEndDate : "",
            },
          );
        }
      } else if (selectedStatus === "ended") {
        closeCheckinScheduleRanges(nextItem, todayText);
      } else {
        syncCheckinScheduleRangeForCurrentConfig(
          nextItem,
          {
            ...nextItem,
            notification: nextItem.notification,
          },
          {
            closedDate:
              selectedStatus === "stopped" ? effectiveEndDate : "",
          },
        );
      }
      checkinItems[index] = nextItem;
      linkedPlanSourceItem = nextItem;
      mutationReason = resumeMode
        ? "checkin-item-continue"
        : "checkin-item-edit";
      progressTitle = resumeMode ? "正在继续打卡" : "正在保存打卡";
      perfAction = resumeMode ? "checkin-item-continue" : "checkin-item-edit";
    } else {
      const reusableDeletedItem = findLiveCheckinItemByTitle(title)
        ? null
        : findReusableDeletedCheckinItemByTitle(title);
      if (reusableDeletedItem) {
        const index = checkinItems.findIndex((item) =>
          matchesId(item.id, reusableDeletedItem.id),
        );
        const revivedItem = hydrateCheckinItem({
          ...reusableDeletedItem,
          title,
          description,
          color,
          repeatType:
            selectedStatus === "ended"
              ? reusableDeletedItem.repeatType
              : repeatType,
          repeatWeekdays:
            selectedStatus === "ended"
              ? reusableDeletedItem.repeatWeekdays
              : repeatWeekdays,
          repeatMonthDays:
            selectedStatus === "ended"
              ? reusableDeletedItem.repeatMonthDays
              : repeatMonthDays,
          startDate:
            selectedStatus === "ended"
              ? reusableDeletedItem.startDate || todayText
              : startDate,
          endDate:
            selectedStatus === "ended"
              ? reusableDeletedItem.endDate || ""
              : effectiveEndDate,
          startTime:
            selectedStatus === "ended"
              ? reusableDeletedItem.startTime || ""
              : normalizedTimeRange.startTime,
          endTime:
            selectedStatus === "ended"
              ? reusableDeletedItem.endTime || ""
              : normalizedTimeRange.endTime,
          notification:
            selectedStatus === "ended"
              ? normalizeCheckinNotificationConfig(
                  {
                    enabled: false,
                    mode: "none",
                  },
                  reusableDeletedItem,
                )
              : reminderConfig,
          status: selectedStatus,
          deletedAt: "",
          mergedIntoId: "",
          updatedAt: nowIso,
        });
        revivedItem.scheduleRanges = normalizeCheckinScheduleRanges(
          reusableDeletedItem.scheduleRanges,
          reusableDeletedItem,
        );
        if (selectedStatus !== "ended") {
          appendCheckinScheduleRange(
            revivedItem,
            {
              ...revivedItem,
              notification: revivedItem.notification,
            },
            {
              closedDate:
                selectedStatus === "stopped" ? effectiveEndDate : "",
            },
          );
        }
        checkinItems[index] = revivedItem;
        linkedPlanSourceItem = revivedItem;
        mutationReason = "checkin-item-revive";
        progressTitle = "正在恢复打卡";
        perfAction = "checkin-item-revive";
      } else {
        const newItem = hydrateCheckinItem(
          new CheckinItem(
            title,
            description,
            color,
            repeatType,
            repeatWeekdays,
            repeatMonthDays,
            startDate || todayText,
            selectedStatus === "ended" ? "" : effectiveEndDate,
            selectedStatus === "ended" ? "" : normalizedTimeRange.startTime,
            selectedStatus === "ended" ? "" : normalizedTimeRange.endTime,
            selectedStatus === "ended" ? null : reminderConfig,
            selectedStatus,
          ),
        );
        newItem.updatedAt = nowIso;
        if (selectedStatus === "ended") {
          newItem.notification = normalizeCheckinNotificationConfig(
            {
              enabled: false,
              mode: "none",
            },
            newItem,
          );
          newItem.scheduleRanges = [];
        } else {
          newItem.scheduleRanges = normalizeCheckinScheduleRanges(
            newItem.scheduleRanges,
            newItem,
          );
          if (selectedStatus === "stopped") {
            closeCheckinScheduleRanges(newItem, effectiveEndDate);
          }
        }
        checkinItems.push(newItem);
        ensureCheckinHistorySummaryEntry(newItem.id, nowIso);
        linkedPlanSourceItem = newItem;
      }
    }

    const saved = await runTodoBlockingMutation(
      {
        closeModal,
        refreshView,
        sourceModal: modal,
        title: progressTitle,
        message: progressMessage,
        perfAction,
      },
      async () => {
        const targetItem = linkedPlanSourceItem
          ? checkinItems.find((item) => matchesId(item.id, linkedPlanSourceItem.id)) ||
            linkedPlanSourceItem
          : checkinItems[checkinItems.length - 1] || null;
        const linkedPlanMutation =
          mergeCheckinAcrossAllPeriods && itemData
            ? buildTodoLinkedPlanMergeMutation(
                "checkin",
                targetItem,
                itemData.id,
              )
            : buildTodoLinkedPlanMutation("checkin", targetItem);
        let persisted = false;
        if (mergeCheckinAcrossAllPeriods && itemData) {
          await flushTodoPendingPersistence();
          const authoritativeDailyCheckins =
            await loadAllTodoSectionItemsFromStorage("dailyCheckins", {
              authoritative: true,
            });
          const authoritativeDailyMergeResult = mergeDailyCheckinsByItemIdInList(
            authoritativeDailyCheckins,
            targetItem?.id || "",
            itemData.id,
          );
          const authoritativeDailyPeriodIds = Array.from(
            new Set(
              getTodoSectionPeriodIds("dailyCheckins", [
                ...authoritativeDailyCheckins,
                ...authoritativeDailyMergeResult.items,
              ]),
            ),
          );
          rebuildCheckinHistorySummaryForItemIdsFromEntries(
            authoritativeDailyMergeResult.items,
            [targetItem?.id || "", itemData.id],
            {
              updatedAt: nowIso,
            },
          );
          persisted = await queueTodoSaveWithAuthoritativeSections({
            partialCore: {
              checkinItems: getTodoSectionStateSnapshot("checkinItems"),
              checkinHistorySummary: getCheckinHistorySummarySnapshot(),
            },
            sectionSaves: authoritativeDailyMergeResult.changed
              ? [
                  {
                    section: "dailyCheckins",
                    periodIds: authoritativeDailyPeriodIds,
                    items: authoritativeDailyMergeResult.items,
                  },
                ]
              : [],
            linkedPlanMutation,
            reason: mutationReason,
            errorLabel: "保存打卡项目失败:",
            refreshReminders: true,
          });
        } else {
          const sectionSaves = dailyCheckinsChanged
            ? [
                {
                  section: "dailyCheckins",
                  periodIds: Array.from(
                    new Set(
                      getTodoSectionPeriodIds("dailyCheckins", [
                        ...previousDailyCheckins,
                        ...dailyCheckins,
                      ]),
                    ),
                  ),
                  items: getTodoSectionStateSnapshot("dailyCheckins"),
                },
              ]
            : [];
          const shouldPersistSummary =
            !isEditMode || mergeCheckinAcrossAllPeriods || dailyCheckinsChanged;
          persisted = await queueTodoSaveWithLinkedPlan({
            partialCore: {
              checkinItems: getTodoSectionStateSnapshot("checkinItems"),
              ...(shouldPersistSummary
                ? {
                    checkinHistorySummary: getCheckinHistorySummarySnapshot(),
                  }
                : {}),
            },
            sectionSaves,
            linkedPlanMutation,
            reason: mutationReason,
            errorLabel: "保存打卡项目失败:",
            refreshReminders: true,
          });
        }
        if (!persisted) {
          await rollbackTodoOptimisticChange(
            {
              checkinItems: previousCheckinItems,
              checkinHistorySummary: previousCheckinHistorySummary,
              dailyCheckins: previousDailyCheckins,
            },
            {
              message: "保存打卡项目失败，本次修改已撤销。",
              refreshView,
            },
          );
          return false;
        }
        return true;
      },
    );
    if (saved && linkedPlanSourceItem && isCheckinItemActive(linkedPlanSourceItem)) {
      const permissionTask = getReminderTools()?.requestPermissionIfNeeded?.(
        "打卡",
        linkedPlanSourceItem?.notification || reminderConfig,
        {
          silentWhenDisabled: false,
        },
      );
      void permissionTask?.catch?.((error) => {
        console.error("请求打卡提醒权限失败:", error);
      });
    }
    return saved;
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
    const index = checkinItems.findIndex((c) => matchesId(c.id, itemId));
    if (index === -1) {
      void showTodoAlert("删除失败：未找到该打卡项目，请刷新后重试。", {
        title: "删除失败",
        danger: true,
      });
      return false;
    }
    const deletedAt = new Date().toISOString();
    const deletedItem = hydrateCheckinItem({
      ...checkinItems[index],
      status: "ended",
      deletedAt,
      updatedAt: deletedAt,
    });
    closeCheckinScheduleRanges(deletedItem, getLocalDateText(deletedAt));
    checkinItems[index] = deletedItem;

    if (typeof closeModal === "function") {
      closeModal();
    }
    if (refreshView) {
      scheduleTodoInterfaceRefresh();
    }
    void queueTodoSaveWithLinkedPlan(
      {
        partialCore: {
          checkinItems: getTodoSectionStateSnapshot("checkinItems"),
        },
        linkedPlanMutation: buildTodoLinkedPlanMutation("checkin", deletedItem),
        reason: "checkin-item-delete",
        errorLabel: "删除打卡项目后保存列表失败:",
        refreshReminders: true,
      },
    ).then(async (saved) => {
      if (saved) {
        return;
      }
      await rollbackTodoOptimisticChange(
        {
          checkinItems: previousCheckinItems,
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

    const todayText = getLocalDateText();
    const dailyCheckinLookup = createTodoDailyCheckinLookup();
    const visibleItems = getVisibleCheckinItems();
    const filteredItems = visibleItems
      .filter(
        (item) =>
          getCheckinItemEffectiveStatus(item, todayText) ===
          currentCheckinStatusFilter,
      )
      .slice()
      .sort((left, right) => {
        const leftStatus = getCheckinItemEffectiveStatus(left, todayText);
        const rightStatus = getCheckinItemEffectiveStatus(right, todayText);
        if (leftStatus !== rightStatus) {
          return leftStatus.localeCompare(rightStatus);
        }
        if (currentCheckinStatusFilter === "in_progress") {
          const leftChecked = !!left.getTodayCheckinStatus?.(
            dailyCheckinLookup,
            todayText,
          );
          const rightChecked = !!right.getTodayCheckinStatus?.(
            dailyCheckinLookup,
            todayText,
          );
          if (leftChecked !== rightChecked) {
            return Number(leftChecked) - Number(rightChecked);
          }
        }
        return (
          new Date(right?.updatedAt || right?.createdAt || 0).getTime() -
          new Date(left?.updatedAt || left?.createdAt || 0).getTime()
        );
      });

    // 如果没有打卡项目，显示空状态
    if (filteredItems.length === 0) {
      const emptyTitle =
        visibleItems.length === 0
          ? "暂无打卡项目"
          : `暂无${getCheckinStatusLabel(currentCheckinStatusFilter)}打卡项目`;
      const emptyDescription =
        visibleItems.length === 0
          ? '点击"添加项目"按钮创建打卡项目'
          : currentCheckinStatusFilter === "in_progress"
            ? "切换筛选器，或把已停止/结束项目继续后会出现在这里"
            : "切换筛选器或继续已有项目后，这里会自动更新";
      const emptyStateWidthStyle =
        Number.isFinite(contentWidth) && contentWidth > 0
          ? `max-width: ${contentWidth}px;`
          : "max-width: 100%;";
      container.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-color); ${emptyStateWidthStyle}">
        <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
        <h3 style="color: var(--text-color)">${emptyTitle}</h3>
        <p style="color: var(--muted-text-color); margin-bottom: 20px">
          ${emptyDescription}
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
      updateCheckinStats({
        todayText,
        dailyCheckinLookup,
        visibleItems,
      });
      updateStatsPanel();
      return;
    }

    // 渲染打卡项目列表
    filteredItems.forEach((item) => {
      const itemElement = createCheckinItemElement(item, listScale, {
        todayText,
        dailyCheckinLookup,
      });
      applyTodoCollectionItemLayout(itemElement, {
        useTwoColumnGrid,
      });
      container.appendChild(itemElement);
    });

    updateCheckinStats({
      todayText,
      dailyCheckinLookup,
      visibleItems,
    });
    updateStatsPanel();
  }

  // 创建打卡项目元素
  function createCheckinItemElement(item, listScale = 1, options = {}) {
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
    itemElement.style.alignSelf = isCompactMobileLayout()
      ? "stretch"
      : "center";
    itemElement.style.display = "flex";
    itemElement.style.flexDirection = "column";
    itemElement.style.gap = `${Math.max(6, Math.round(10 * cardScale))}px`;

    const today = normalizeTodoOccurrenceDateKey(options?.todayText) || getLocalDateText();
    const dailyCheckinLookup = options?.dailyCheckinLookup || null;
    const effectiveStatus = getCheckinItemEffectiveStatus(item, today);
    const checkedDays = item.getCheckedDaysCount(dailyCheckinLookup);
    const isScheduledToday =
      effectiveStatus === "in_progress" &&
      isTodoLinkedPlanOccurrenceAvailable("checkin", item, today);
    const checked =
      effectiveStatus === "in_progress" &&
      item.getTodayCheckinStatus(dailyCheckinLookup, today);
    const repeatSummary =
      typeof item.getRepeatSummary === "function"
        ? item.getRepeatSummary()
        : "每天";
    const reminderSummary =
      getReminderTools()?.describeCheckinReminder?.(item) || "不通知";
    const statusLabel = getCheckinStatusLabel(effectiveStatus);
    const visibleRanges = getCheckinItemVisibleDateRanges(item);
    const currentRangeLabel =
      visibleRanges[visibleRanges.length - 1] ||
      `${item.startDate || "-"}${item.endDate ? `—${item.endDate}` : ""}`;
    const showContinueButton =
      effectiveStatus === "stopped" || effectiveStatus === "ended";

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
        ${
          showContinueButton
            ? `
          <button class="bts checkin-continue-btn" type="button" style="margin: 0; padding: ${Math.max(6, Math.round(7 * cardScale))}px ${Math.max(12, Math.round(14 * cardScale))}px; min-height: 0; line-height: 1.1;">
            继续
          </button>
        `
            : `
          <button class="checkin-toggle-btn" type="button" style="
            width: ${Math.max(28, Math.round(38 * cardScale))}px;
            height: ${Math.max(28, Math.round(38 * cardScale))}px;
            border-radius: 50%;
            border: none;
            background-color: ${checked ? item.color : "var(--bg-quaternary)"};
            color: white;
            cursor: pointer;
            font-size: ${Math.max(13, Math.round(20 * cardScale))}px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            opacity: ${!isScheduledToday ? "0.72" : "1"};
          ">
            ${checked ? "✓" : "○"}
          </button>
        `
        }
      </div>
    </div>
    
    <p class="checkin-description" style="font-size: ${metaFontSize}px; color: var(--muted-text-color); margin: 0; line-height: 1.4;">
      ${item.description || "无描述"}
    </p>
    
    <div class="checkin-footer" style="display: flex; justify-content: space-between; align-items: center; gap: ${Math.max(8, Math.round(12 * cardScale))}px; flex-wrap: wrap;">
      <div style="font-size: ${Math.max(10, Math.round(13 * cardScale))}px; color: var(--text-color); opacity: 0.88;">
        ${repeatSummary}
        <div style="font-size: ${Math.max(9, Math.round(12 * cardScale))}px; opacity: 0.72; margin-top: 2px;">
          ${currentRangeLabel}
          ${
            visibleRanges.length > 1
              ? ` · 共 ${visibleRanges.length} 段`
              : ""
          }
        </div>
        ${
          effectiveStatus === "in_progress" && item.notification?.enabled
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
          effectiveStatus !== "in_progress"
            ? statusLabel
            : !isScheduledToday
              ? checked
                ? "已记为今日打卡"
                : "今日未安排，可记为今日打卡"
              : checked
                ? "今日已打卡"
                : "今日未打卡"
        }
      </div>
    </div>
  `;

    // 添加事件监听器
    const descriptionElement = itemElement.querySelector(
      ".checkin-description",
    );
    const toggleBtn = itemElement.querySelector(".checkin-toggle-btn");
    const continueBtn = itemElement.querySelector(".checkin-continue-btn");

    if (descriptionElement && isCompactMobileLayout()) {
      descriptionElement.style.webkitLineClamp = "1";
    }

    if (toggleBtn instanceof HTMLButtonElement) {
      toggleBtn.disabled = false;
      toggleBtn.setAttribute("aria-busy", "false");
      toggleBtn.title = isScheduledToday
        ? "切换今日打卡状态"
        : checked
          ? "取消今天这次打卡"
          : "今天未安排，点击后记为今天打卡";
      bindTodoActionButton(toggleBtn, () => {
        item.toggleTodayCheckin();
      });
    }

    if (continueBtn instanceof HTMLButtonElement) {
      bindTodoActionButton(continueBtn, () => {
        showCheckinItemModal(item, {
          resumeMode: true,
        });
      });
    }

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
        setTodoView("todos", {
          persistWidgetView: true,
        });
        renderCurrentView();
      });

      checkinViewBtn.addEventListener("click", () => {
        setTodoView("checkins", {
          persistWidgetView: true,
        });
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
        uiTools?.setAccentButtonState?.(quadrantBtn, true);
        uiTools?.setAccentButtonState?.(listBtn, false);
      } else {
        uiTools?.setAccentButtonState?.(listBtn, true);
        uiTools?.setAccentButtonState?.(quadrantBtn, false);
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
        menuWidthFactor: getExpandWidthFactor(
          MOBILE_TODO_DROPDOWN_WIDTH_FACTOR,
        ),
      });
      layoutSelect.addEventListener("change", () => {
        todoLayoutMode =
          layoutSelect.value === "quadrant" ? "quadrant" : "list";
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
    const todoQuadrantContainer = document.getElementById(
      "todo-quadrant-container",
    );
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
        todoContainer.style.display =
          todoLayoutMode === "list" ? "block" : "none";
      }
      if (todoQuadrantContainer) {
        todoQuadrantContainer.style.display =
          todoLayoutMode === "quadrant" ? "block" : "none";
      }
      if (checkinContainer) checkinContainer.style.display = "none";
      if (todoControls) todoControls.style.display = "block";
      if (checkinControls) checkinControls.style.display = "none";
      uiTools?.refreshEnhancedSelect?.(
        document.getElementById("todo-layout-select"),
      );
      uiTools?.refreshEnhancedSelect?.(document.getElementById("todo-sort"));
      renderTodoArea();
    } else {
      if (todoContainer) todoContainer.style.display = "none";
      if (todoQuadrantContainer) todoQuadrantContainer.style.display = "none";
      if (checkinContainer) checkinContainer.style.display = "block";
      if (todoControls) todoControls.style.display = "none";
      if (checkinControls) checkinControls.style.display = "block";
      uiTools?.refreshEnhancedSelect?.(
        document.getElementById("checkin-status-filter-select"),
      );
      renderCheckinList();
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
    applyTodoDesktopWidgetMode();
    if (!todoUiBindingsInitialized) {
      if (options?.skipInitialDataLoad !== true) {
        loadData();
      }
      initFilters();
      initSearch();
      initSort();
      initCheckinStatusFilter();
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

  async function applyTodoFreshSnapshot(freshSnapshot, options = {}) {
    const normalizedSnapshot = mergeTodoWorkspaceSnapshot(
      freshSnapshot,
      captureTodoWorkspaceSnapshot(),
    );
    uiTools?.markPerfStage?.(
      options.perfStageReady || "todo-fresh-sync-ready",
      buildTodoWorkspacePerfDetail(normalizedSnapshot),
    );

    if (!hasTodoWorkspaceSnapshotChanged(normalizedSnapshot)) {
      todoInitialDataValidated = true;
      uiTools?.markPerfStage?.("todo-fresh-sync-skipped", {
        reason: options.reason || "unchanged",
        ...buildTodoWorkspacePerfDetail(normalizedSnapshot),
      });
      return false;
    }

    if (hasTodoPendingLocalMutations()) {
      scheduleTodoExternalStorageRefresh({
        reason: "todo-initial-fresh-sync",
      });
      uiTools?.markPerfStage?.("todo-fresh-sync-deferred", {
        reason: "pending-local-mutations",
        ...buildTodoWorkspacePerfDetail(normalizedSnapshot),
      });
      return false;
    }

    applyTodoWorkspaceSnapshot(normalizedSnapshot);
    refreshTodoInterface();
    todoInitialDataLoaded = true;
    todoInitialDataValidated = true;
    uiTools?.markPerfStage?.(
      options.perfStageApplied || "todo-fresh-sync-applied",
      buildTodoWorkspacePerfDetail(normalizedSnapshot),
    );
    return true;
  }

  async function syncTodoFreshSnapshotNow(options = {}) {
    if (hasTodoPendingLocalMutations()) {
      await flushTodoPendingPersistence();
    }
    await waitForTodoStorageReady();
    const freshSnapshot = await readFreshTodoWorkspaceSnapshot({
      fresh: true,
    });
    await applyTodoFreshSnapshot(freshSnapshot, {
      reason: options?.reason || "runtime-explicit-fresh-sync",
      perfStageReady: options?.perfStageReady || "todo-runtime-fresh-sync-ready",
      perfStageApplied:
        options?.perfStageApplied || "todo-runtime-fresh-sync-applied",
    });
    return captureTodoWorkspaceSnapshot();
  }

  async function syncTodoFreshSnapshotInBackground() {
    const deferredGeneration = todoDeferredFreshSyncGeneration;
    if (todoInitialDataValidated) {
      return false;
    }
    if (todoInitialFreshSyncPromise) {
      return todoInitialFreshSyncPromise;
    }

    const runFreshSync = async () => {
      if (deferredGeneration !== todoDeferredFreshSyncGeneration) {
        return false;
      }
      uiTools?.markPerfStage?.("todo-fresh-sync-start");
      if (!todoShellPageActive && !isTodoShellTransitionLoading()) {
        todoDeferredFreshSyncPendingResume = true;
        return false;
      }

      if (!todoRefreshController) {
        await waitForTodoStorageReady();
        const freshSnapshot = await readFreshTodoWorkspaceSnapshot({
          fresh: true,
        });
        return applyTodoFreshSnapshot(freshSnapshot);
      }

      let applied = false;
      const refreshResult = await todoRefreshController.run(
        async () => {
          await waitForTodoStorageReady();
          return readFreshTodoWorkspaceSnapshot({
            fresh: true,
          });
        },
        {
          manageLoading: false,
          commit: async (freshSnapshot) => {
            applied = await applyTodoFreshSnapshot(freshSnapshot);
          },
        },
      );

      if (refreshResult?.stale) {
        uiTools?.markPerfStage?.("todo-fresh-sync-skipped", {
          reason: "stale",
        });
        return false;
      }
      if (deferredGeneration !== todoDeferredFreshSyncGeneration) {
        uiTools?.markPerfStage?.("todo-fresh-sync-skipped", {
          reason: "hidden-invalidated",
        });
        return false;
      }

      return applied;
    };

    todoInitialFreshSyncPromise = runFreshSync()
      .catch((error) => {
        console.error("待办页后台 fresh 同步失败:", error);
        uiTools?.markPerfStage?.("todo-fresh-sync-failed", {
          message:
            error instanceof Error
              ? error.message
              : String(error || "unknown-error"),
        });
        return false;
      })
      .finally(() => {
        todoInitialFreshSyncPromise = null;
      });

    return todoInitialFreshSyncPromise;
  }

  function scheduleTodoDeferredFreshSync() {
    if (
      todoInitialDataValidated ||
      todoDeferredFreshSyncQueued ||
      todoInitialFreshSyncPromise
    ) {
      return;
    }
    if (!todoShellPageActive && !isTodoShellTransitionLoading()) {
      todoDeferredFreshSyncPendingResume = true;
      return;
    }

    todoDeferredFreshSyncQueued = true;
    const deferredGeneration = todoDeferredFreshSyncGeneration;
    const run = () => {
      todoDeferredFreshSyncTimerId = 0;
      todoDeferredFreshSyncIdleId = 0;
      todoDeferredFreshSyncQueued = false;
      if (deferredGeneration !== todoDeferredFreshSyncGeneration) {
        return;
      }
      void syncTodoFreshSnapshotInBackground();
    };
    const scheduleAfterPaint = () => {
      if (deferredGeneration !== todoDeferredFreshSyncGeneration) {
        todoDeferredFreshSyncQueued = false;
        return;
      }
      if (typeof window.requestIdleCallback === "function") {
        todoDeferredFreshSyncIdleId = window.requestIdleCallback(
          () => {
            todoDeferredFreshSyncIdleId = 0;
            run();
          },
          {
            timeout: 320,
          },
        );
        return;
      }
      todoDeferredFreshSyncTimerId = window.setTimeout(() => {
        todoDeferredFreshSyncTimerId = 0;
        run();
      }, 48);
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(scheduleAfterPaint);
      });
      return;
    }

    todoDeferredFreshSyncTimerId = window.setTimeout(() => {
      todoDeferredFreshSyncTimerId = 0;
      scheduleAfterPaint();
    }, 32);
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
      if (
        !launchId ||
        typeof window.ControlerNativeBridge?.emitEvent !== "function"
      ) {
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
    const targetId =
      typeof payload?.targetId === "string" && payload.targetId.trim()
        ? payload.targetId.trim()
        : "";
    if (
      action !== "show-todos" &&
      action !== "show-checkins" &&
      action !== "open-create-todo"
    ) {
      return false;
    }
    setTodoView(action === "show-checkins" ? "checkins" : "todos", {
      persistWidgetView: true,
    });
    applyTodoWidgetMode();
    renderTodoWorkspace();
    if (action === "open-create-todo") {
      openTodoCreateFlow({
        prefillTodo: {
          title: targetId,
        },
      });
    }
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
      handleTodoWidgetLaunchAction(
        {
          action,
          source: params.get("widgetSource") || "query",
          launchId: params.get("widgetLaunchId") || "",
        },
        {
          clearQuery: true,
        },
      );
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

  function markTodoInitialReady() {
    if (todoInitialReadyReported) {
      return;
    }
    todoInitialReadyReported = true;
    uiTools?.markPerfStage?.("first-render-done");
    uiTools?.markNativePageReady?.();
  }

  window.ControlerTodoRuntime = {
    initPlanSidebar,
    editTodoById(todoId) {
      const targetTodo =
        todos.find((todo) => matchesId(todo.id, todoId)) || null;
      if (!targetTodo) {
        return false;
      }
      initPlanSidebar({
        initialView: "todos",
        persistWidgetView: true,
      });
      showTodoEditModal(targetTodo);
      return true;
    },
    editCheckinById(itemId) {
      const targetItem =
        checkinItems.find((item) => matchesId(item.id, itemId)) || null;
      if (!targetItem) {
        return false;
      }
      initPlanSidebar({
        initialView: "checkins",
        persistWidgetView: true,
      });
      showCheckinItemModal(targetItem);
      return true;
    },
    toggleTodoCompletionById(todoId, dateText = getLocalDateText()) {
      initPlanSidebar({
        initialView: "todos",
        persistWidgetView: true,
      });
      return toggleTodoCompletion(todoId, dateText);
    },
    setTodoCompletionById(
      todoId,
      nextCompleted,
      dateText = getLocalDateText(),
    ) {
      initPlanSidebar({
        initialView: "todos",
        persistWidgetView: true,
      });
      const targetTodo =
        todos.find((todo) => matchesId(todo.id, todoId)) || null;
      if (!targetTodo) {
        return false;
      }
      const normalizedDate =
        normalizeTodoOccurrenceDateKey(dateText) || getLocalDateText();
      if (
        getTodoCompletionStateOnDate(targetTodo, normalizedDate) ===
        !!nextCompleted
      ) {
        return true;
      }
      return commitTodoCompletionForDate(targetTodo, normalizedDate, {
        nextCompleted: !!nextCompleted,
      });
    },
    toggleCheckinByIdOnDate(itemId, dateText) {
      initPlanSidebar({
        initialView: "checkins",
        persistWidgetView: true,
      });
      return toggleCheckinCompletionOnDate(itemId, dateText);
    },
    setCheckinCompletionByIdOnDate(itemId, nextChecked, dateText) {
      initPlanSidebar({
        initialView: "checkins",
        persistWidgetView: true,
      });
      const targetItem =
        checkinItems.find((item) => matchesId(item.id, itemId)) || null;
      if (!targetItem) {
        return false;
      }
      const normalizedDate =
        normalizeTodoOccurrenceDateKey(dateText) || getLocalDateText();
      if (
        getCheckinCompletionStateOnDate(targetItem, normalizedDate) ===
        !!nextChecked
      ) {
        return true;
      }
      return commitCheckinCompletionOnDate(targetItem, normalizedDate, {
        nextChecked: !!nextChecked,
      });
    },
    resolveLinkedPlanSource(sourceType, sourceId, options = {}) {
      initPlanSidebar({
        initialView: sourceType === "checkin" ? "checkins" : "todos",
        persistWidgetView: true,
      });
      return resolveTodoLinkedPlanSource(sourceType, sourceId, options);
    },
    cleanupLinkedPlanSourceOccurrence(sourceType, sourceId, dateText) {
      initPlanSidebar({
        initialView: sourceType === "checkin" ? "checkins" : "todos",
        persistWidgetView: true,
      });
      return syncTodoSourceAfterLinkedPlanOccurrenceRemoval(
        sourceType,
        sourceId,
        dateText,
      );
    },
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
          typeof options?.initialView === "string"
            ? options.initialView
            : currentView,
        persistWidgetView: true,
      });
      openTodoCreateFlow(options);
    },
    async syncFreshSnapshot(options = {}) {
      initPlanSidebar({
        initialView:
          typeof options?.initialView === "string"
            ? options.initialView
            : currentView,
        persistWidgetView: true,
      });
      return syncTodoFreshSnapshotNow({
        reason: options?.reason || "runtime-explicit-fresh-sync",
      });
    },
    async flushPendingChanges(options = {}) {
      await flushTodoDeferredToggleCommits(options);
      await flushTodoPendingPersistence();
      return true;
    },
  };

  // 初始化
  async function init() {
    const reminderRuntimeTask = ensureTodoReminderRuntimeLoaded();
    initTodoWidgetLaunchAction();
    bindTodoShellVisibilityGate();
    bindTodoExternalStorageRefresh();
    const snapshot = bootstrapTodoFromCachedSnapshot();
    await reminderRuntimeTask;
    ensureTodoBaseBindings({
      skipInitialDataLoad: true,
    });
    applyTodoWidgetMode();
    renderTodoWorkspace();
    todoPlanSidebarInitialized = true;
    let initialReadySnapshot = snapshot;
    const shouldForceFreshTransitionBootstrap =
      window.ControlerStorage?.isNativeApp === true &&
      (!todoShellPageActive || isTodoShellTransitionLoading());
    const shouldBlockInitialReveal =
      window.ControlerStorage?.isNativeApp === true &&
      (shouldForceFreshTransitionBootstrap ||
        !hasTodoWorkspaceRenderableData(snapshot));
    if (shouldBlockInitialReveal) {
      uiTools?.markPerfStage?.("todo-initial-blocking-refresh-start", {
        reason: shouldForceFreshTransitionBootstrap
          ? "transition-bootstrap"
          : todoBootstrappedFromPageBootstrap
            ? "empty-bootstrap"
            : "empty-initial-snapshot",
        ...buildTodoWorkspacePerfDetail(snapshot),
      });
      await waitForTodoStorageReady();
      const freshSnapshot = await readFreshTodoWorkspaceSnapshot({
        fresh: true,
      });
      await applyTodoFreshSnapshot(freshSnapshot, {
        reason: "initial-empty-snapshot",
        perfStageReady: "todo-initial-blocking-refresh-ready",
        perfStageApplied: "todo-initial-blocking-refresh-applied",
      });
      initialReadySnapshot = captureTodoWorkspaceSnapshot();
    } else if (
      window.ControlerStorage?.isNativeApp === true &&
      todoBootstrappedFromPageBootstrap &&
      !todoInitialDataValidated
    ) {
      uiTools?.markPerfStage?.("todo-initial-bootstrap-validation-start", {
        reason: "page-bootstrap-unvalidated",
        ...buildTodoWorkspacePerfDetail(snapshot),
      });
    }
    markTodoInitialDataReady(initialReadySnapshot);
    await waitForTodoUiPaint();
    markTodoInitialReady();
    if (!todoInitialDataValidated) {
      scheduleTodoDeferredFreshSync();
    }
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


