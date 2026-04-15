;/* pages/data-index.js */
(() => {
  const projectStatsApi = window.ControlerProjectStats || null;

  function clampNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function parseFlexibleDate(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const normalized = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [yearText, monthText, dayText] = normalized.split("-");
      const year = Number.parseInt(yearText, 10);
      const month = Number.parseInt(monthText, 10);
      const day = Number.parseInt(dayText, 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
      }
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateKey(value) {
    const date = parseFlexibleDate(value);
    if (!date) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatMonthKey(value) {
    const date = parseFlexibleDate(value);
    if (!date) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function parseSpendTimeToHours(spendtime) {
    if (typeof projectStatsApi?.parseSpendTimeToHours === "function") {
      return projectStatsApi.parseSpendTimeToHours(spendtime);
    }
    if (!spendtime || typeof spendtime !== "string") return 0;

    let hours = 0;
    const dayMatch = spendtime.match(/(\d+)天/);
    const hourMatch = spendtime.match(/(\d+)小时/);
    const minuteMatch = spendtime.match(/(\d+)分钟/);
    const lessThanMinute =
      spendtime.includes("小于1分钟") || spendtime.includes("小于1min");

    if (dayMatch) hours += Number.parseInt(dayMatch[1], 10) * 24;
    if (hourMatch) hours += Number.parseInt(hourMatch[1], 10);
    if (minuteMatch) hours += Number.parseInt(minuteMatch[1], 10) / 60;
    if (lessThanMinute) hours += 1 / 60;
    return hours;
  }

  function resolveRecordDurationMs(record) {
    if (!record || typeof record !== "object") {
      return 0;
    }
    if (Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      return Math.round(record.durationMs);
    }
    if (
      Number.isFinite(record?.durationMeta?.recordedMs) &&
      record.durationMeta.recordedMs >= 0
    ) {
      return Math.round(record.durationMeta.recordedMs);
    }
    return Math.max(
      0,
      Math.round(parseSpendTimeToHours(record.spendtime) * 60 * 60 * 1000),
    );
  }

  function resolveRecordAnchorTime(record) {
    return parseFlexibleDate(
      record?.endTime ||
        record?.sptTime ||
        record?.timestamp ||
        record?.rawEndTime ||
        record?.startTime,
    );
  }

  function buildFallbackProjectHierarchyIndex(projects = []) {
    const allNodes = (Array.isArray(projects) ? projects : [])
      .filter((project) => project && typeof project === "object")
      .map((project) => ({
        ...project,
        id: String(project.id || "").trim(),
        name: String(project.name || "").trim(),
        level: Number.parseInt(project.level, 10) || 1,
        parentId: project.parentId ? String(project.parentId).trim() : "",
      }))
      .filter((project) => project.id && project.name);

    const byId = new Map(allNodes.map((project) => [project.id, project]));
    const byName = new Map(allNodes.map((project) => [project.name, project]));
    const childrenByParent = new Map();
    const roots = [];

    const pushChild = (parentId, project) => {
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId).push(project);
    };

    allNodes.forEach((project) => {
      if (
        project.parentId &&
        project.parentId !== project.id &&
        byId.has(project.parentId)
      ) {
        pushChild(project.parentId, project);
        return;
      }
      roots.push(project);
    });

    return {
      allNodes,
      byId,
      byName,
      childrenByParent,
      roots,
    };
  }

  function defaultPlanMatcher(plan, dateText) {
    const targetDateKey = formatDateKey(dateText) || String(dateText || "").trim();
    if (!plan || !targetDateKey) {
      return false;
    }
    if (typeof plan.isOnDate === "function") {
      return plan.isOnDate(targetDateKey);
    }
    const excludedDateSet =
      plan.excludedDateSet instanceof Set
        ? plan.excludedDateSet
        : Array.isArray(plan.excludedDates)
          ? new Set(
              plan.excludedDates
                .map((item) => formatDateKey(item) || String(item || "").trim())
                .filter(Boolean),
            )
          : null;
    if (excludedDateSet?.has(targetDateKey)) {
      return false;
    }
    const includedDateSet =
      plan.includedDateSet instanceof Set
        ? plan.includedDateSet
        : Array.isArray(plan.includedDates)
          ? new Set(
              plan.includedDates
                .map((item) => formatDateKey(item) || String(item || "").trim())
                .filter(Boolean),
            )
          : null;
    if (includedDateSet?.has(targetDateKey)) {
      return true;
    }

    const planDateKey = formatDateKey(
      plan.dateKey || plan.startDate || plan.date,
    );
    if (!planDateKey) {
      return false;
    }
    const endDateKey = formatDateKey(plan.endDateKey || plan.endDate);
    if (endDateKey && targetDateKey > endDateKey) {
      return false;
    }
    if (planDateKey === targetDateKey) {
      return true;
    }

    const repeat = String(plan.repeat || "none").trim().toLowerCase();
    if (repeat === "none" || targetDateKey < planDateKey) {
      return false;
    }
    if (repeat === "daily") {
      return true;
    }

    const targetDate = parseFlexibleDate(targetDateKey);
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return false;
    }

    if (repeat === "weekly") {
      const repeatDays = Array.isArray(plan.repeatDays)
        ? plan.repeatDays
            .map((day) => Number.parseInt(day, 10))
            .filter((day) => day >= 0 && day <= 6)
        : [];
      if (repeatDays.length > 0) {
        return repeatDays.includes(targetDate.getDay());
      }
      const planDate = parseFlexibleDate(planDateKey);
      return (
        plan.dayOfWeek ??
        (planDate instanceof Date && !Number.isNaN(planDate.getTime())
          ? planDate.getDay()
          : -1)
      ) === targetDate.getDay();
    }

    if (repeat === "monthly") {
      const repeatMonthDays = Array.isArray(plan.repeatMonthDays)
        ? plan.repeatMonthDays
            .map((day) => Number.parseInt(day, 10))
            .filter((day) => day >= 1 && day <= 31)
        : [];
      if (repeatMonthDays.length > 0) {
        return repeatMonthDays.includes(targetDate.getDate());
      }
      const planDate = parseFlexibleDate(planDateKey);
      return (
        plan.dayOfMonth ??
        (planDate instanceof Date && !Number.isNaN(planDate.getTime())
          ? planDate.getDate()
          : 0)
      ) === targetDate.getDate();
    }

    return false;
  }

  function buildTimeRecord(record, sourceIndex) {
    if (!record?.name) {
      return null;
    }

    const explicitStartTime = parseFlexibleDate(record.startTime);
    const explicitEndTime = parseFlexibleDate(record.endTime || record.sptTime);
    const fallbackAnchor = resolveRecordAnchorTime(record);
    const durationMs = resolveRecordDurationMs(record);

    let startTime = explicitStartTime;
    let endTime = explicitEndTime;

    if (
      (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) &&
      fallbackAnchor instanceof Date &&
      !Number.isNaN(fallbackAnchor.getTime())
    ) {
      endTime = new Date(fallbackAnchor);
    }

    if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
      if (
        endTime instanceof Date &&
        !Number.isNaN(endTime.getTime()) &&
        durationMs > 0
      ) {
        startTime = new Date(endTime.getTime() - durationMs);
      } else if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime())
      ) {
        if (durationMs > 0) {
          startTime = new Date(fallbackAnchor.getTime() - durationMs);
        } else {
          startTime = new Date(fallbackAnchor);
        }
      }
    }

    if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) {
      if (
        startTime instanceof Date &&
        !Number.isNaN(startTime.getTime()) &&
        durationMs > 0
      ) {
        endTime = new Date(startTime.getTime() + durationMs);
      } else if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime())
      ) {
        endTime = new Date(fallbackAnchor.getTime() + Math.max(durationMs, 0));
      }
    }

    if (
      startTime instanceof Date &&
      !Number.isNaN(startTime.getTime()) &&
      endTime instanceof Date &&
      !Number.isNaN(endTime.getTime()) &&
      endTime.getTime() <= startTime.getTime() &&
      durationMs > 0
    ) {
      if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime()) &&
        fallbackAnchor.getTime() > startTime.getTime()
      ) {
        endTime = new Date(fallbackAnchor);
        if (endTime.getTime() <= startTime.getTime()) {
          startTime = new Date(endTime.getTime() - durationMs);
        }
      } else {
        endTime = new Date(startTime.getTime() + durationMs);
      }
    }

    if (
      !(startTime instanceof Date) ||
      Number.isNaN(startTime.getTime()) ||
      !(endTime instanceof Date) ||
      Number.isNaN(endTime.getTime()) ||
      endTime.getTime() <= startTime.getTime()
    ) {
      return null;
    }

    const dateText = formatDateKey(startTime);
    const anchorDateText = formatDateKey(endTime);
    if (!dateText || !anchorDateText) {
      return null;
    }

    return {
      ...record,
      sourceIndex,
      startTime,
      endTime,
      dateText,
      anchorDateText,
      durationHours: clampNumber(durationMs / (1000 * 60 * 60), 0),
    };
  }

  function createStore(initialState = {}) {
    const state = {
      projects: [],
      records: [],
      plans: [],
      diaryEntries: [],
      ...initialState,
    };
    const dirty = new Set(["projects", "records", "plans", "diaryEntries"]);
    const cache = {
      projectById: new Map(),
      projectByName: new Map(),
      projectHierarchyIndex: null,
      recordsByDate: new Map(),
      recordsByDateHour: new Map(),
      timeRecords: [],
      diaryEntriesByMonth: new Map(),
      plansByDate: new Map(),
      planMatcher: null,
    };

    function invalidate(fields = []) {
      fields.forEach((fieldName) => {
        dirty.add(fieldName);
        if (fieldName === "projects") {
          cache.projectById.clear();
          cache.projectByName.clear();
          cache.projectHierarchyIndex = null;
        } else if (fieldName === "records") {
          cache.recordsByDate.clear();
          cache.recordsByDateHour.clear();
          cache.timeRecords = [];
        } else if (fieldName === "plans") {
          cache.plansByDate.clear();
          cache.planMatcher = null;
        } else if (fieldName === "diaryEntries") {
          cache.diaryEntriesByMonth.clear();
        }
      });
    }

    function replaceState(nextState = {}) {
      const changedFields = [];
      ["projects", "records", "plans", "diaryEntries"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(nextState, fieldName)) {
          state[fieldName] = Array.isArray(nextState[fieldName])
            ? nextState[fieldName]
            : [];
          changedFields.push(fieldName);
        }
      });
      invalidate(changedFields);
      return state;
    }

    function setField(fieldName, value) {
      state[fieldName] = Array.isArray(value) ? value : [];
      invalidate([fieldName]);
      return state[fieldName];
    }

    function markDirty(...fieldNames) {
      invalidate(fieldNames.flat().filter(Boolean));
    }

    function ensureProjectCache() {
      if (!dirty.has("projects") && cache.projectHierarchyIndex) {
        return;
      }

      const hierarchy =
        typeof projectStatsApi?.buildProjectHierarchyIndex === "function"
          ? projectStatsApi.buildProjectHierarchyIndex(state.projects)
          : buildFallbackProjectHierarchyIndex(state.projects);

      cache.projectHierarchyIndex = hierarchy;
      cache.projectById = hierarchy.byId ? new Map(hierarchy.byId) : new Map();
      cache.projectByName = hierarchy.byName
        ? new Map(hierarchy.byName)
        : new Map(
            (Array.isArray(state.projects) ? state.projects : [])
              .filter((project) => project?.name)
              .map((project) => [String(project.name), project]),
          );
      dirty.delete("projects");
    }

    function getProjectHierarchyIndex() {
      ensureProjectCache();
      return cache.projectHierarchyIndex;
    }

    function getProjectByIdMap() {
      ensureProjectCache();
      return cache.projectById;
    }

    function getProjectByNameMap() {
      ensureProjectCache();
      return cache.projectByName;
    }

    function getProjectForRecord(record) {
      ensureProjectCache();
      if (record?.projectId) {
        const byId = cache.projectById.get(String(record.projectId).trim());
        if (byId) {
          return byId;
        }
      }
      if (record?.name) {
        const normalizedName = String(record.name).trim();
        if (cache.projectByName.has(normalizedName)) {
          return cache.projectByName.get(normalizedName);
        }
        const leafName = normalizedName
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean)
          .pop();
        if (leafName && cache.projectByName.has(leafName)) {
          return cache.projectByName.get(leafName);
        }
      }
      return null;
    }

    function ensureRecordCache() {
      if (!dirty.has("records") && cache.recordsByDate.size > 0) {
        return;
      }

      cache.recordsByDate = new Map();
      cache.recordsByDateHour = new Map();
      cache.timeRecords = [];

      (Array.isArray(state.records) ? state.records : []).forEach(
        (record, sourceIndex) => {
          const timeRecord = buildTimeRecord(record, sourceIndex);
          const dateText =
            timeRecord?.anchorDateText ||
            formatDateKey(resolveRecordAnchorTime(record));

          if (dateText) {
            if (!cache.recordsByDate.has(dateText)) {
              cache.recordsByDate.set(dateText, []);
            }
            cache.recordsByDate.get(dateText).push(record);
          }

          if (!timeRecord) {
            return;
          }

          cache.timeRecords.push(timeRecord);
          if (!cache.recordsByDateHour.has(timeRecord.dateText)) {
            cache.recordsByDateHour.set(timeRecord.dateText, new Map());
          }
          const hourKey = timeRecord.startTime.getHours();
          const hourBucket = cache.recordsByDateHour.get(timeRecord.dateText);
          if (!hourBucket.has(hourKey)) {
            hourBucket.set(hourKey, []);
          }
          hourBucket.get(hourKey).push(timeRecord);
        },
      );

      dirty.delete("records");
    }

    function getRecordsByDateMap() {
      ensureRecordCache();
      return cache.recordsByDate;
    }

    function getRecordsForDate(dateLike) {
      const dateKey = formatDateKey(dateLike);
      if (!dateKey) {
        return [];
      }
      ensureRecordCache();
      return cache.recordsByDate.get(dateKey) || [];
    }

    function getRecordsByDateHourMap() {
      ensureRecordCache();
      return cache.recordsByDateHour;
    }

    function getRecordsForDateHour(dateLike, hour) {
      const dateKey = formatDateKey(dateLike);
      if (!dateKey) {
        return [];
      }
      ensureRecordCache();
      return cache.recordsByDateHour.get(dateKey)?.get(Number(hour)) || [];
    }

    function getTimeRecords() {
      ensureRecordCache();
      return cache.timeRecords;
    }

    function ensureDiaryCache() {
      if (!dirty.has("diaryEntries") && cache.diaryEntriesByMonth.size > 0) {
        return;
      }

      cache.diaryEntriesByMonth = new Map();
      (Array.isArray(state.diaryEntries) ? state.diaryEntries : []).forEach(
        (entry) => {
          const monthKey = formatMonthKey(entry?.date);
          if (!monthKey) {
            return;
          }
          if (!cache.diaryEntriesByMonth.has(monthKey)) {
            cache.diaryEntriesByMonth.set(monthKey, []);
          }
          cache.diaryEntriesByMonth.get(monthKey).push(entry);
        },
      );

      cache.diaryEntriesByMonth.forEach((entries) => {
        entries.sort((left, right) => {
          const leftDate = String(left?.date || "");
          const rightDate = String(right?.date || "");
          if (leftDate === rightDate) {
            return String(right?.updatedAt || "").localeCompare(
              String(left?.updatedAt || ""),
            );
          }
          return leftDate < rightDate ? 1 : -1;
        });
      });

      dirty.delete("diaryEntries");
    }

    function getDiaryEntriesByMonthMap() {
      ensureDiaryCache();
      return cache.diaryEntriesByMonth;
    }

    function getDiaryEntriesForMonth(dateLike) {
      const monthKey = formatMonthKey(dateLike);
      if (!monthKey) {
        return [];
      }
      ensureDiaryCache();
      return cache.diaryEntriesByMonth.get(monthKey) || [];
    }

    function getPlansForDate(dateLike, matcher = defaultPlanMatcher) {
      const dateKey = formatDateKey(dateLike) || String(dateLike || "").trim();
      if (!dateKey) {
        return [];
      }
      if (dirty.has("plans") || cache.planMatcher !== matcher) {
        cache.plansByDate.clear();
        cache.planMatcher = matcher;
        dirty.delete("plans");
      }
      if (!cache.plansByDate.has(dateKey)) {
        cache.plansByDate.set(
          dateKey,
          (Array.isArray(state.plans) ? state.plans : []).filter((plan) =>
            matcher(plan, dateKey),
          ),
        );
      }
      return cache.plansByDate.get(dateKey) || [];
    }

    replaceState(initialState);

    return {
      replaceState,
      setField,
      markDirty,
      getState: () => state,
      getProjectHierarchyIndex,
      getProjectByIdMap,
      getProjectByNameMap,
      getProjectForRecord,
      getRecordsByDateMap,
      getRecordsForDate,
      getRecordsByDateHourMap,
      getRecordsForDateHour,
      getTimeRecords,
      getDiaryEntriesByMonthMap,
      getDiaryEntriesForMonth,
      getPlansForDate,
      formatDateKey,
      formatMonthKey,
      defaultPlanMatcher,
      parseFlexibleDate,
      parseSpendTimeToHours,
    };
  }

  window.ControlerDataIndex = {
    createStore,
    formatDateKey,
    formatMonthKey,
    defaultPlanMatcher,
    parseFlexibleDate,
    parseSpendTimeToHours,
  };
})();


;/* pages/diary.js */
let diaryEntries = [];
let diaryCategories = [];
let diaryView = "month";
let currentDate = new Date();
let diaryCategoryFilter = "all";
let diarySearchQuery = "";
const uiTools = window.ControlerUI || null;
const diaryDataIndex = window.ControlerDataIndex?.createStore?.() || null;
const MOBILE_LAYOUT_MAX_WIDTH = 690;
const MOBILE_DIARY_SCALE_RATIO = 0.82 * (2 / 3);
const DIARY_CATEGORY_WIDTH_FACTOR = 0.5;
const DIARY_LIST_BATCH_SIZE = 60;
const DIARY_SEARCH_DEBOUNCE_MS = 160;
const DIARY_DRAFT_SAVE_DELAY_MS = 300;
const DIARY_PREFETCH_MONTH_OFFSETS = Object.freeze([-1, 0, 1]);
const DIARY_SELECTOR_YEAR_RANGE_OFFSET = 100;
const DIARY_LOADING_OVERLAY_DELAY_MS = Math.max(
  0,
  Math.round(Number(uiTools?.pageLoadingOverlayDelayMs) || 120),
);
const DIARY_STORAGE_REQUEST_TIMEOUT_MS = 4000;
const DIARY_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS = 1200;
let diaryFilteredEntriesCacheKey = "";
let diaryFilteredEntriesCacheValue = [];
let diarySearchInputTimer = 0;
let diaryLoadedPeriodIds = [];
let diaryInitialReadyReported = false;
let diaryDeferredRuntimePromise = null;
let diaryInitialHydrationPromise = null;
let diaryInitialDataLoaded = false;
let diaryInitialDataValidated = false;
let diaryLoadRequestId = 0;
let diaryLoadingOverlayTimer = 0;
let diaryLoadingOverlayController = null;
let diaryInitialRevealQueued = false;
let diaryInitialRevealPromise = null;
let diaryPrefetchRequestId = 0;
let diaryShellPageActive = uiTools?.isShellPageActive?.() !== false;
let diaryShellVisibilityBound = false;
let diaryInitialHydrationPendingResume = false;
let diaryExternalRefreshPendingResume = false;
let diaryDeferredRuntimePendingResume = false;
let diaryPendingExternalStorageRefresh = false;
const diaryPendingPersistenceTasks = new Set();
let diaryBeforePageLeaveGuardBound = false;
const diaryExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async () => {
      await refreshDiaryFromExternalStorageChange();
    },
  }) || null;

function isDiaryShellTransitionLoading() {
  if (typeof uiTools?.getShellVisibilityState !== "function") {
    return false;
  }
  return uiTools.getShellVisibilityState()?.transitionLoading === true;
}

function shouldDeferDiaryInitialHydration() {
  return (
    !diaryShellPageActive &&
    !isDiaryShellTransitionLoading() &&
    document.visibilityState === "hidden"
  );
}

function startDiaryInitialHydration(options = {}) {
  return hydrateDiaryInitialData({
    mode: diaryInitialDataValidated ? "inline" : "fullscreen",
    ...options,
  });
}

function getDiaryNormalizedChangedSections(changedSections = []) {
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

function hasDiaryChangedPeriodOverlap(changedPeriodIds = [], currentPeriodIds = []) {
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

function isDiarySerializableEqual(left, right) {
  if (typeof uiTools?.isSerializableEqual === "function") {
    return uiTools.isSerializableEqual(left, right);
  }
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch (error) {
    return false;
  }
}

function getDiaryStoragePageInstanceId() {
  return typeof window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ === "string"
    ? window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
    : "";
}

function isDiaryOwnStorageChange(detail = {}) {
  const originPageInstanceId =
    typeof detail?.originPageInstanceId === "string"
      ? detail.originPageInstanceId.trim()
      : "";
  return (
    !!originPageInstanceId &&
    originPageInstanceId === getDiaryStoragePageInstanceId()
  );
}

function isDiaryInitialStorageBootstrapChange(detail = {}) {
  const reason =
    typeof detail?.reason === "string" ? detail.reason.trim() : "";
  const changedSections = getDiaryNormalizedChangedSections(detail?.changedSections);
  return reason === "initial-sync" && !changedSections.length;
}

function isDiaryAmbiguousNativeExternalChange(detail = {}) {
  if (window.ControlerStorage?.isNativeApp !== true) {
    return false;
  }
  const changedSections = getDiaryNormalizedChangedSections(detail?.changedSections);
  if (changedSections.length) {
    return false;
  }
  const reason =
    typeof detail?.reason === "string" ? detail.reason.trim() : "";
  const source =
    typeof detail?.source === "string" ? detail.source.trim() : "";
  return !source && (reason === "external-update" || reason === "shell-resume");
}

function shouldRefreshDiaryCoreData(nextData = null) {
  if (!nextData || typeof nextData !== "object") {
    return true;
  }
  return !isDiarySerializableEqual(
    nextData.diaryCategories || [],
    diaryCategories || [],
  );
}

function shouldRefreshDiaryForExternalChange(detail = {}) {
  if (
    isDiaryOwnStorageChange(detail) ||
    isDiaryInitialStorageBootstrapChange(detail)
  ) {
    return false;
  }
  if (window.ControlerStorage?.shouldIgnoreRecentLocalEcho?.(detail)) {
    return false;
  }
  if (isDiaryAmbiguousNativeExternalChange(detail)) {
    return false;
  }
  const changedSections = getDiaryNormalizedChangedSections(detail?.changedSections);
  if (!changedSections.length) {
    return true;
  }
  const entriesChanged = changedSections.includes("diaryEntries");
  const categoriesChanged =
    changedSections.includes("diaryCategories") || changedSections.includes("core");
  if (!entriesChanged && !categoriesChanged) {
    return false;
  }
  if (
    entriesChanged &&
    hasDiaryChangedPeriodOverlap(
      detail?.changedPeriods?.diaryEntries || [],
      diaryLoadedPeriodIds.length
        ? diaryLoadedPeriodIds
        : getDiaryPrefetchPeriodIds(currentDate),
    )
  ) {
    return true;
  }
  if (categoriesChanged && shouldRefreshDiaryCoreData(detail?.data)) {
    return true;
  }
  return false;
}

function waitForDiaryStorageReady() {
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
    console.error("等待日记页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

function ensureDiaryDeferredRuntimeLoaded() {
  if (!diaryShellPageActive) {
    diaryDeferredRuntimePendingResume = true;
    return Promise.resolve();
  }
  if (diaryDeferredRuntimePromise) {
    return diaryDeferredRuntimePromise;
  }
  if (typeof uiTools?.loadScriptOnce !== "function") {
    diaryDeferredRuntimePromise = Promise.resolve();
    return diaryDeferredRuntimePromise;
  }

  diaryDeferredRuntimePromise = Promise.allSettled([
    uiTools.loadScriptOnce("guide-bundle.js"),
    uiTools.loadScriptOnce("guide-ui.js"),
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("加载日记页延后脚本失败:", result.reason);
      }
    });
    renderDiaryGuideCard();
  });
  return diaryDeferredRuntimePromise;
}

function syncDiaryDataIndex() {
  diaryDataIndex?.replaceState({
    diaryEntries,
  });
  diaryFilteredEntriesCacheKey = "";
  diaryFilteredEntriesCacheValue = [];
}
function localizeDiaryUiText(value) {
  return window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "");
}
const DIARY_WIDGET_CONTEXT = (() => {
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
let diaryPendingWidgetLaunchAction =
  DIARY_WIDGET_CONTEXT.launchAction &&
  DIARY_WIDGET_CONTEXT.launchAction.trim() === "new-diary"
    ? {
        action: DIARY_WIDGET_CONTEXT.launchAction.trim(),
        source: DIARY_WIDGET_CONTEXT.launchSource || "query",
      }
    : null;

function applyDiaryDesktopWidgetMode() {
  if (!DIARY_WIDGET_CONTEXT.enabled) {
    return;
  }

  document.body.classList.add("desktop-widget-page", "desktop-widget-diary-page");
  document.body.dataset.widgetKind = DIARY_WIDGET_CONTEXT.kind || "write-diary";
  document.title = localizeDiaryUiText("写日记 小组件");

  if (!document.getElementById("desktop-widget-diary-style")) {
    const style = document.createElement("style");
    style.id = "desktop-widget-diary-style";
    style.textContent = `
      body.desktop-widget-diary-page {
        overflow: hidden;
      }

      body.desktop-widget-diary-page .app-sidebar,
      body.desktop-widget-diary-page .diary-topbar {
        display: none !important;
      }

      body.desktop-widget-diary-page .diary-main {
        margin: 0 !important;
        padding: 12px !important;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        min-height: 0 !important;
        height: 100vh !important;
        box-sizing: border-box;
        overflow: hidden !important;
      }

      body.desktop-widget-diary-page .diary-shell {
        margin: 0 !important;
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }

      body.desktop-widget-diary-page #diary-view-container {
        min-height: 0 !important;
        flex: 1 1 auto;
      }

      body.desktop-widget-diary-page .modal-overlay {
        padding: 12px;
        box-sizing: border-box;
        align-items: flex-start;
        overflow: auto;
      }

      body.desktop-widget-diary-page .modal-content {
        max-width: min(100%, 760px) !important;
        width: min(100%, 760px) !important;
        max-height: calc(100vh - 24px);
        overflow: auto;
      }
    `;
    document.head.appendChild(style);
  }

  document.querySelector(".diary-shell > h3")?.remove();
  document.querySelector(".diary-filter-row")?.remove();
  document.getElementById("diary-category-btn")?.remove();
  const buttonRow = document.getElementById("diary-month-view-btn")?.parentElement;
  if (buttonRow instanceof HTMLElement) {
    buttonRow.style.display = "none";
  }

  const widgetMain = document.querySelector(".diary-main");
  window.ControlerUI?.mountDesktopWidgetScale?.(widgetMain, {
    minBaseWidth: 560,
    minBaseHeight: 400,
  });
}

function isCompactMobileLayout() {
  return window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH;
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

function getDiaryResponsiveScale() {
  return isCompactMobileLayout() ? MOBILE_DIARY_SCALE_RATIO : 1;
}

function createUniqueId(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

class DiaryEntry {
  constructor(date, title, content, categoryId = "") {
    this.id = createUniqueId("diary_");
    this.date = date;
    this.title = title || "未命名日记";
    this.content = content || "";
    this.categoryId = categoryId || "";
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function normalizeDiaryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { changed: false, value: null };
  }

  const date =
    typeof entry.date === "string" && parseDateInputValue(entry.date)
      ? entry.date
      : formatDateInputValue(new Date());
  const title =
    typeof entry.title === "string" && entry.title.trim()
      ? entry.title
      : "未命名日记";
  const content = typeof entry.content === "string" ? entry.content : "";
  const categoryId =
    typeof entry.categoryId === "string" ? entry.categoryId : "";
  const createdAt =
    typeof entry.createdAt === "string" && entry.createdAt
      ? entry.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof entry.updatedAt === "string" && entry.updatedAt
      ? entry.updatedAt
      : createdAt;
  const id =
    typeof entry.id === "string" && entry.id
      ? entry.id
      : createUniqueId("diary_");

  const normalizedEntry = {
    ...entry,
    id,
    date,
    title,
    content,
    categoryId,
    createdAt,
    updatedAt,
  };

  const changed =
    normalizedEntry.id !== entry.id ||
    normalizedEntry.date !== entry.date ||
    normalizedEntry.title !== entry.title ||
    normalizedEntry.content !== entry.content ||
    normalizedEntry.categoryId !== entry.categoryId ||
    normalizedEntry.createdAt !== entry.createdAt ||
    normalizedEntry.updatedAt !== entry.updatedAt;

  return { changed, value: normalizedEntry };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const htmlEscapeMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return htmlEscapeMap[char] || char;
  });
}

function normalizeDiaryColorInputValue(color) {
  return String(color ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[，]/g, ",")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .trim();
}

function toDiaryHexColor(color, fallback = "#4299E1") {
  const normalizedColor = normalizeDiaryColorInputValue(color);
  const hexMatch = normalizedColor.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    return `#${hexMatch[1].toUpperCase()}`;
  }
  const rgbMatch = normalizedColor.match(
    /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i,
  );
  if (rgbMatch) {
    return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((channel) =>
        Number(channel).toString(16).padStart(2, "0").toUpperCase(),
      )
      .join("")}`;
  }
  const normalizedFallback = normalizeDiaryColorInputValue(fallback);
  if (/^#([0-9a-f]{6})$/i.test(normalizedFallback)) {
    return normalizedFallback.toUpperCase();
  }
  return "#4299E1";
}

function getDiaryEntryPeriodId(entry) {
  const dateText =
    typeof entry?.date === "string" && entry.date
      ? entry.date
      : typeof entry?.updatedAt === "string"
        ? entry.updatedAt
        : "";
  return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : "undated";
}

function getDiaryPrefetchPeriodIds(anchorDate = currentDate) {
  const baseDate = parseDateInputValue(anchorDate) || anchorDate || new Date();
  return DIARY_PREFETCH_MONTH_OFFSETS.map((offset) => {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function getDiaryCurrentPeriodId(anchorDate = currentDate) {
  return getDiaryPrefetchPeriodIds(anchorDate)[1] || getDiaryPrefetchPeriodIds(anchorDate)[0];
}

function normalizeDiaryPersistPeriodId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return /^\d{4}-\d{2}$/.test(normalized) || normalized === "undated"
    ? normalized
    : "";
}

function collectDiaryPersistPeriodIds(values = []) {
  const results = [];
  const seen = new Set();
  values.forEach((value) => {
    const periodId = normalizeDiaryPersistPeriodId(value);
    if (!periodId || seen.has(periodId)) {
      return;
    }
    seen.add(periodId);
    results.push(periodId);
  });
  return results;
}

function cloneDiaryEntriesSnapshot(entries = []) {
  return Array.isArray(entries)
    ? entries
        .map((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? { ...entry }
            : null,
        )
        .filter(Boolean)
    : [];
}

function cloneDiaryCategoriesSnapshot(categories = []) {
  return Array.isArray(categories)
    ? categories
        .map((category) =>
          category && typeof category === "object" && !Array.isArray(category)
            ? { ...category }
            : null,
        )
        .filter(Boolean)
    : [];
}

function getDiaryGuideStateSnapshot() {
  if (typeof window.ControlerGuideUI?.getGuideStateSnapshot === "function") {
    const snapshot = window.ControlerGuideUI.getGuideStateSnapshot();
    return {
      hasGuideState: snapshot?.hasGuideState === true,
      guideState: snapshot?.guideState || null,
      pending: snapshot?.pending === true,
    };
  }

  try {
    const managedState =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    if (
      managedState &&
      typeof managedState === "object" &&
      !Array.isArray(managedState) &&
      managedState.guideState &&
      typeof managedState.guideState === "object"
    ) {
      return {
        hasGuideState: true,
        guideState:
          window.ControlerGuideBundle?.normalizeGuideState?.(
            managedState.guideState,
          ) || null,
        pending: false,
      };
    }
  } catch (error) {
    console.error("读取日记受管引导状态失败，回退本地读取:", error);
  }

  try {
    const rawGuideState = localStorage.getItem("guideState");
    return {
      hasGuideState: rawGuideState !== null,
      guideState:
        rawGuideState !== null
          ? window.ControlerGuideBundle?.normalizeGuideState?.(
              JSON.parse(rawGuideState),
            ) || null
          : null,
      pending: false,
    };
  } catch (error) {
    return {
      hasGuideState: true,
      guideState:
        window.ControlerGuideBundle?.getDefaultGuideState?.() || null,
      pending: false,
    };
  }
}

function readDiaryGuideState() {
  const snapshot = getDiaryGuideStateSnapshot();
  return (
    snapshot.guideState ||
    window.ControlerGuideBundle?.getDefaultGuideState?.() ||
    null
  );
}

function resolveDiaryGuideStateForHydration(coreGuideState = null) {
  const guideStateSnapshot = getDiaryGuideStateSnapshot();
  if (guideStateSnapshot.pending && guideStateSnapshot.guideState) {
    return guideStateSnapshot.guideState;
  }
  return (
    window.ControlerGuideBundle?.normalizeGuideState?.(coreGuideState) ||
    guideStateSnapshot.guideState ||
    window.ControlerGuideBundle?.getDefaultGuideState?.() ||
    null
  );
}

function synchronizeDiaryEntriesWithGuideState(entries = [], guideState = null) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  if (
    typeof window.ControlerGuideBundle?.synchronizeGuideDiaryEntries !==
    "function"
  ) {
    return {
      entries: normalizedEntries,
      changed: false,
    };
  }

  const synchronizedEntries =
    window.ControlerGuideBundle.synchronizeGuideDiaryEntries(
      normalizedEntries,
      new Date(),
      guideState,
    );

  return {
    entries: Array.isArray(synchronizedEntries)
      ? synchronizedEntries
      : normalizedEntries,
    changed: !isDiarySerializableEqual(synchronizedEntries, normalizedEntries),
  };
}

function saveDiaryGuideState(nextState) {
  if (typeof window.ControlerGuideUI?.saveGuideState === "function") {
    return window.ControlerGuideUI.saveGuideState(nextState);
  }
  const normalizedState =
    window.ControlerGuideBundle?.normalizeGuideState?.(nextState) ||
    nextState ||
    {};
  localStorage.setItem("guideState", JSON.stringify(normalizedState));
  return normalizedState;
}

function restoreDiaryGuideStateSnapshot(snapshot = {}) {
  if (snapshot.hasGuideState) {
    saveDiaryGuideState(snapshot.guideState);
    return;
  }
  localStorage.removeItem("guideState");
}

function captureDiaryMutationSnapshot() {
  return {
    diaryEntries: cloneDiaryEntriesSnapshot(diaryEntries),
    diaryCategories: cloneDiaryCategoriesSnapshot(diaryCategories),
    guideStateSnapshot: getDiaryGuideStateSnapshot(),
    diaryCategoryFilter,
    diarySearchQuery,
    diaryView,
    currentDate:
      currentDate instanceof Date && !Number.isNaN(currentDate.getTime())
        ? new Date(currentDate.getTime())
        : new Date(),
    diaryLoadedPeriodIds: diaryLoadedPeriodIds.slice(),
  };
}

function restoreDiaryMutationSnapshot(snapshot = {}) {
  diaryEntries = cloneDiaryEntriesSnapshot(snapshot.diaryEntries);
  diaryCategories = cloneDiaryCategoriesSnapshot(snapshot.diaryCategories);
  restoreDiaryGuideStateSnapshot(snapshot.guideStateSnapshot);
  diaryCategoryFilter =
    typeof snapshot.diaryCategoryFilter === "string"
      ? snapshot.diaryCategoryFilter
      : "all";
  diarySearchQuery =
    typeof snapshot.diarySearchQuery === "string"
      ? snapshot.diarySearchQuery
      : "";
  diaryView = snapshot.diaryView === "list" ? "list" : "month";
  currentDate =
    snapshot.currentDate instanceof Date &&
    !Number.isNaN(snapshot.currentDate.getTime())
      ? new Date(snapshot.currentDate.getTime())
      : new Date();
  diaryLoadedPeriodIds = Array.isArray(snapshot.diaryLoadedPeriodIds)
    ? snapshot.diaryLoadedPeriodIds
        .map((periodId) => normalizeDiaryPersistPeriodId(periodId))
        .filter(Boolean)
    : [];
  syncDiaryDataIndex();
  scheduleDiaryViewRefresh();
}

function normalizeDiaryPersistMeta(value = {}) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    changedPeriodIds: collectDiaryPersistPeriodIds(source.changedPeriodIds || []),
    categoriesChanged: source.categoriesChanged === true,
    guideStateChanged: source.guideStateChanged === true,
  };
}

function persistDiaryFallbackSnapshot() {
  try {
    localStorage.setItem("diaryEntries", JSON.stringify(diaryEntries));
    localStorage.setItem("diaryCategories", JSON.stringify(diaryCategories));
    localStorage.setItem("guideState", JSON.stringify(readDiaryGuideState()));
    return true;
  } catch (error) {
    console.error("写入日记本地兜底快照失败:", error);
    return false;
  }
}

function waitForDiaryUiPaint() {
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

function trackDiaryPersistenceTask(taskPromise) {
  let trackedTask = null;
  trackedTask = Promise.resolve(taskPromise).finally(() => {
    diaryPendingPersistenceTasks.delete(trackedTask);
  });
  diaryPendingPersistenceTasks.add(trackedTask);
  return trackedTask;
}

async function flushDiaryPendingPersistence() {
  while (diaryPendingPersistenceTasks.size > 0) {
    await Promise.allSettled(Array.from(diaryPendingPersistenceTasks));
  }
  return true;
}

function registerDiaryBeforePageLeaveGuard() {
  if (diaryBeforePageLeaveGuardBound) {
    return;
  }
  diaryBeforePageLeaveGuardBound = true;
  uiTools?.registerBeforePageLeave?.(async () => {
    if (diaryPendingPersistenceTasks.size <= 0) {
      return true;
    }
    return flushDiaryPendingPersistence();
  });
}

async function commitDiaryLocalChange({
  applyChange,
  beforeClose = null,
  closeModal,
  failureTitle = "保存失败",
  failureMessage = "保存日记失败，已恢复修改前内容。",
} = {}) {
  if (typeof applyChange !== "function") {
    return false;
  }

  const snapshot = captureDiaryMutationSnapshot();
  let applyResult = null;
  try {
    applyResult = applyChange(snapshot);
    if (applyResult === false) {
      return false;
    }
  } catch (error) {
    console.error("应用日记本地变更失败:", error);
    restoreDiaryMutationSnapshot(snapshot);
    await showDiaryAlert(failureMessage, {
      title: failureTitle,
      danger: true,
    });
    return false;
  }

  const persistMeta = normalizeDiaryPersistMeta(applyResult);
  syncDiaryDataIndex();
  const perfAction = failureTitle === "删除失败" ? "diary-delete" : "diary-save";
  uiTools?.markPerfStage?.("diary-form-save-start", {
    allowRepeat: true,
    action: perfAction,
  });
  setDiaryLoadingState({
    active: true,
    mode: "fullscreen",
    title: failureTitle === "删除失败" ? "正在删除日记" : "正在保存日记",
    message:
      failureTitle === "删除失败"
        ? "正在同步删除日记数据，请稍候"
        : "正在写入日记与分类数据，请稍候",
    delayMs: 0,
  });
  const saveTask = saveDiaryData(persistMeta);
  try {
    await waitForDiaryUiPaint();
    if (typeof closeModal === "function") {
      closeModal();
    }
    scheduleDiaryViewRefresh();
    uiTools?.markPerfStage?.("diary-form-modal-hidden", {
      allowRepeat: true,
      action: perfAction,
    });
  } catch (error) {
    await Promise.resolve(saveTask).catch(() => false);
    setDiaryLoadingState({
      active: false,
    });
    throw error;
  }
  const saved = await saveTask;
  setDiaryLoadingState({
    active: false,
  });
  if (saved) {
    if (typeof beforeClose === "function") {
      void Promise.resolve(beforeClose()).catch((error) => {
        console.error("清理日记草稿失败:", error);
      });
    }
    uiTools?.markPerfStage?.("diary-form-storage-acked", {
      allowRepeat: true,
      action: perfAction,
    });
    return true;
  }

  restoreDiaryMutationSnapshot(snapshot);
  scheduleDiaryViewRefresh();
  await showDiaryAlert(failureMessage, {
    title: failureTitle,
    danger: true,
  });
  return false;
}

function queueDiaryInitialReveal() {
  if (diaryInitialReadyReported) {
    return diaryInitialRevealPromise || Promise.resolve(true);
  }
  const body = document.body;
  if (!(body instanceof HTMLElement)) {
    return Promise.resolve(false);
  }
  if (!body.classList.contains("diary-bootstrap-pending")) {
    diaryInitialReadyReported = true;
    uiTools?.markNativePageReady?.();
    return Promise.resolve(true);
  }
  if (diaryInitialRevealQueued) {
    return diaryInitialRevealPromise || Promise.resolve(true);
  }

  diaryInitialRevealQueued = true;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  diaryInitialRevealPromise = new Promise((resolve) => {
    schedule(() => {
      schedule(() => {
        Promise.resolve(
          uiTools?.waitForVisualContentStability?.({
            root: ".diary-main",
            quietWindowMs: 72,
            maxWaitMs: 680,
            minQuietFrames: 3,
          }),
        )
          .catch(() => false)
          .finally(() => {
            diaryInitialRevealQueued = false;
            diaryInitialReadyReported = true;
            body.classList.remove("diary-bootstrap-pending");
            body.classList.add("diary-bootstrap-ready");
            uiTools?.markPerfStage?.("first-render-done");
            uiTools?.markNativePageReady?.();
            diaryInitialRevealPromise = null;
            resolve(true);
          });
      });
    });
  });
  return diaryInitialRevealPromise;
}

function getDiaryLoadingOverlayElement() {
  return document.getElementById("diary-loading-overlay");
}

function getDiaryLoadingOverlayController() {
  if (diaryLoadingOverlayController) {
    return diaryLoadingOverlayController;
  }
  const overlay = getDiaryLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  diaryLoadingOverlayController = uiTools?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".diary-main",
    scopeFullscreenToInlineHost: false,
  }) || null;
  return diaryLoadingOverlayController;
}

function hideDiaryLoadingStateImmediately() {
  return (
    getDiaryLoadingOverlayController()?.setState({
      active: false,
      waitForSettledContent: false,
    }) || Promise.resolve(false)
  );
}

function withDiaryTimeout(promise, label = "日记数据加载") {
  const timeoutMs = Math.max(0, Number(DIARY_STORAGE_REQUEST_TIMEOUT_MS) || 0);
  if (timeoutMs <= 0) {
    return Promise.resolve(promise);
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label}超时`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeDiaryLoadedState(payload = {}) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries
        .map((entry) => {
          const normalized = normalizeDiaryEntry(entry);
          return normalized.value;
        })
        .filter(Boolean)
    : [];
  const categories = Array.isArray(payload.categories)
    ? payload.categories
        .map((category) =>
          category && typeof category === "object" && !Array.isArray(category)
            ? { ...category }
            : null,
        )
        .filter(Boolean)
    : [];
  const loadedPeriodIds = Array.isArray(payload.loadedPeriodIds)
    ? payload.loadedPeriodIds
        .map((periodId) => normalizeDiaryPersistPeriodId(periodId))
        .filter(Boolean)
    : [];

  return {
    entries,
    categories,
    loadedPeriodIds:
      loadedPeriodIds.length > 0
        ? loadedPeriodIds
        : collectDiaryPersistPeriodIds(
            entries.map((entry) => getDiaryEntryPeriodId(entry)),
          ),
    shouldPersist: payload.shouldPersist === true,
    persistMeta: normalizeDiaryPersistMeta(payload.persistMeta || {}),
  };
}

function applyDiaryLoadedState(payload = {}) {
  const normalized = normalizeDiaryLoadedState(payload);
  diaryEntries = normalized.entries;
  diaryCategories = normalized.categories;
  diaryLoadedPeriodIds = normalized.loadedPeriodIds;
  syncDiaryDataIndex();
  return normalized;
}

function getDiaryLoadedStateWeight(snapshot = {}) {
  const entryCount = Array.isArray(snapshot?.entries) ? snapshot.entries.length : 0;
  const categoryCount = Array.isArray(snapshot?.categories)
    ? snapshot.categories.length
    : 0;
  const loadedPeriodCount = Array.isArray(snapshot?.loadedPeriodIds)
    ? snapshot.loadedPeriodIds.length
    : 0;
  return entryCount * 4 + categoryCount * 2 + loadedPeriodCount;
}

function pickPreferredDiaryLoadedState(primarySnapshot = null, fallbackSnapshot = null) {
  if (!primarySnapshot) {
    return fallbackSnapshot;
  }
  if (!fallbackSnapshot) {
    return primarySnapshot;
  }
  return getDiaryLoadedStateWeight(fallbackSnapshot) >
    getDiaryLoadedStateWeight(primarySnapshot)
    ? fallbackSnapshot
    : primarySnapshot;
}

function getDiaryCachedSnapshotPeriodIds() {
  return [getDiaryCurrentPeriodId(currentDate)];
}

function readDiaryCachedSnapshotState() {
  const isNativeApp = window.ControlerStorage?.isNativeApp === true;
  const snapshotPeriodIds = isNativeApp
    ? getDiaryCachedSnapshotPeriodIds()
    : getDiaryPrefetchPeriodIds(currentDate);
  let preferredSnapshot = null;
  try {
    if (typeof window.ControlerStorage?.peekPageBootstrapState === "function") {
      const bootstrap = window.ControlerStorage.peekPageBootstrapState("diary", {
        periodIds: snapshotPeriodIds,
      });
      const data =
        bootstrap?.data && typeof bootstrap.data === "object" ? bootstrap.data : null;
      if (data) {
        preferredSnapshot = pickPreferredDiaryLoadedState(
          preferredSnapshot,
          normalizeDiaryLoadedState({
            entries: data.currentMonthEntries,
            categories: data.diaryCategories,
            loadedPeriodIds:
              Array.isArray(bootstrap.loadedPeriodIds) &&
              bootstrap.loadedPeriodIds.length
                ? bootstrap.loadedPeriodIds
                : snapshotPeriodIds,
          }),
        );
      }
    }
  } catch (error) {
    console.error("读取日记引导快照失败:", error);
  }
  if (isNativeApp) {
    return preferredSnapshot;
  }
  try {
    const storageSnapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    if (storageSnapshot && typeof storageSnapshot === "object") {
      preferredSnapshot = pickPreferredDiaryLoadedState(
        preferredSnapshot,
        normalizeDiaryLoadedState({
          entries: storageSnapshot.diaryEntries,
          categories: storageSnapshot.diaryCategories,
        }),
      );
    }
  } catch (error) {
    console.error("读取日记缓存快照失败:", error);
  }

  try {
    preferredSnapshot = pickPreferredDiaryLoadedState(
      preferredSnapshot,
      normalizeDiaryLoadedState({
        entries: JSON.parse(localStorage.getItem("diaryEntries") || "[]"),
        categories: JSON.parse(localStorage.getItem("diaryCategories") || "[]"),
      }),
    );
  } catch (error) {
    console.error("读取本地日记兜底快照失败:", error);
  }

  return preferredSnapshot || normalizeDiaryLoadedState();
}

function bootstrapDiaryFromCachedSnapshot() {
  try {
    const snapshotState = readDiaryCachedSnapshotState();
    if (!snapshotState) {
      return false;
    }
    applyDiaryLoadedState(snapshotState);
    renderDiaryGuideCard();
    renderCurrentView();
    diaryInitialDataLoaded = true;
    diaryInitialDataValidated = false;
    uiTools?.markPerfStage?.("first-data-ready", {
      periodIds: diaryLoadedPeriodIds.slice(),
      entryCount: diaryEntries.length,
      fromCache: true,
    });
    return true;
  } catch (error) {
    console.error("使用日记缓存快照引导首屏失败:", error);
    return false;
  }
}

function setDiaryLoadingState(options = {}) {
  const overlay = getDiaryLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return Promise.resolve(false);
  }

  const {
    active = false,
    mode = "inline",
    title = "正在加载数据中",
    delayMs = 0,
    message =
      mode === "fullscreen"
        ? "正在读取当前月份的日记与分类，请稍候"
        : "正在更新当前月份的日记数据，请稍候",
  } = options;
  const loadingController = getDiaryLoadingOverlayController();
  if (!loadingController) {
    return Promise.resolve(false);
  }

  return loadingController.setState({
    active,
    mode,
    title,
    message,
    delayMs,
  });
}

const diaryRefreshController = uiTools?.createAtomicRefreshController?.({
  defaultDelayMs: DIARY_LOADING_OVERLAY_DELAY_MS,
  showLoading: (loadingOptions = {}) => {
    return setDiaryLoadingState({
      active: true,
      ...loadingOptions,
    });
  },
  hideLoading: () => {
    return setDiaryLoadingState({
      active: false,
    });
  },
});

function invalidateDiaryVisibleDataRequests() {
  diaryLoadRequestId += 1;
  diaryRefreshController?.invalidate?.();
}

function buildDiaryCurrentMonthEmptyState() {
  return normalizeDiaryLoadedState({
    entries: [],
    categories: diaryCategories,
    loadedPeriodIds: [getDiaryCurrentPeriodId(currentDate)],
  });
}

function flushDiaryDeferredExternalRefreshIfNeeded() {
  if (!diaryPendingExternalStorageRefresh) {
    return;
  }
  if (diaryInitialHydrationPromise || !diaryInitialDataLoaded) {
    return;
  }
  if (!diaryShellPageActive && !isDiaryShellTransitionLoading()) {
    diaryExternalRefreshPendingResume = true;
    return;
  }
  diaryPendingExternalStorageRefresh = false;
  refreshDiaryFromExternalStorageChange();
}

async function waitForDiaryInitialHydrationWithDeadline(hydrationPromise) {
  const timeoutMs = Math.max(
    DIARY_STORAGE_REQUEST_TIMEOUT_MS + 1200,
    5200,
  );
  const result = await Promise.race([
    Promise.resolve(hydrationPromise).then((value) => ({
      timedOut: false,
      value,
    })),
    new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          timedOut: true,
        });
      }, timeoutMs);
    }),
  ]);

  if (result?.timedOut !== true) {
    return result?.value;
  }

  console.error("日记页首轮 hydration 超时，回退当前可用快照并转后台重试。");
  invalidateDiaryVisibleDataRequests();
  diaryInitialHydrationPromise = null;
  await hideDiaryLoadingStateImmediately();
  const fallbackSnapshot =
    readDiaryCachedSnapshotState() || buildDiaryCurrentMonthEmptyState();
  applyDiaryLoadedState(fallbackSnapshot);
  renderDiaryGuideCard();
  renderCurrentView();
  diaryInitialDataLoaded = true;
  diaryInitialDataValidated = false;
  if (!diaryInitialReadyReported) {
    await queueDiaryInitialReveal();
  }
  if (!diaryShellPageActive && !isDiaryShellTransitionLoading()) {
    diaryInitialHydrationPendingResume = true;
    return false;
  }
  window.setTimeout(() => {
    void hydrateDiaryInitialData({
      mode: "inline",
      manageLoading: false,
    }).catch((error) => {
      console.error("重试日记页首轮 hydration 失败:", error);
    });
  }, 0);
  return false;
}

function scheduleDiaryAdjacentPrefetch(anchorDate = currentDate) {
  const prefetchPeriodIds = getDiaryPrefetchPeriodIds(anchorDate);
  const currentPeriodId = getDiaryCurrentPeriodId(anchorDate);
  const anchorPeriodId = currentPeriodId;
  const missingPeriodIds = prefetchPeriodIds.filter(
    (periodId) =>
      periodId &&
      periodId !== currentPeriodId &&
      !diaryLoadedPeriodIds.includes(periodId),
  );
  if (!missingPeriodIds.length) {
    return;
  }

  window.setTimeout(() => {
    const prefetchRequestId = ++diaryPrefetchRequestId;
    const baseLoadRequestId = diaryLoadRequestId;
    void loadDiaryData({
      periodIds: prefetchPeriodIds,
    })
      .then((loadedState) => {
        if (
          prefetchRequestId !== diaryPrefetchRequestId ||
          baseLoadRequestId !== diaryLoadRequestId ||
          getDiaryCurrentPeriodId(currentDate) !== anchorPeriodId
        ) {
          return;
        }
        const appliedState = applyDiaryLoadedState(loadedState);
        if (appliedState.shouldPersist) {
          void saveDiaryData(appliedState.persistMeta);
        }
        scheduleDiaryViewRefresh();
      })
      .catch((error) => {
        console.error("预取相邻月份日记失败:", error);
      });
  }, 40);
}

function hydrateDiaryInitialData(options = {}) {
  if (diaryInitialHydrationPromise) {
    return diaryInitialHydrationPromise;
  }

  const shouldManageLoading =
    options.manageLoading !== false && !diaryInitialDataLoaded;
  diaryInitialHydrationPromise = refreshDiaryVisibleData({
    ...options,
    periodIds:
      Array.isArray(options.periodIds) && options.periodIds.length
        ? options.periodIds
        : [getDiaryCurrentPeriodId(currentDate)],
    mode: options.mode || "fullscreen",
    delayMs: 0,
    manageLoading: shouldManageLoading,
    message: "正在读取当前月份的日记与分类，请稍候",
    reportFirstData: true,
  }).finally(() => {
    diaryInitialHydrationPromise = null;
    flushDiaryDeferredExternalRefreshIfNeeded();
  });

  return diaryInitialHydrationPromise;
}

async function refreshDiaryVisibleData(options = {}) {
  const requestId = ++diaryLoadRequestId;
  const mode =
    options.mode || (diaryInitialDataValidated ? "inline" : "fullscreen");
  const manageLoading = options.manageLoading !== false;
  const anchorDate = options.anchorDate || currentDate;
  const delayMs =
    Number.isFinite(options.delayMs) && options.delayMs >= 0
      ? options.delayMs
      : diaryInitialDataValidated
        ? DIARY_LOADING_OVERLAY_DELAY_MS
        : 0;
  const message =
    typeof options.message === "string" && options.message.trim()
      ? options.message.trim()
      : mode === "fullscreen"
        ? "正在读取当前月份的日记与分类，请稍候"
        : "正在更新当前月份的日记数据，请稍候";
  const loadTask = () =>
    loadDiaryData({
      anchorDate,
      periodIds:
        Array.isArray(options.periodIds) && options.periodIds.length
          ? options.periodIds
          : undefined,
    });
  const commitLoadedState = async (loadedState) => {
    if (requestId !== diaryLoadRequestId) {
      return;
    }
    const appliedState = applyDiaryLoadedState(loadedState);
    persistDiaryFallbackSnapshot();
    if (appliedState.shouldPersist) {
      void saveDiaryData(appliedState.persistMeta);
    }
    renderDiaryGuideCard();
    renderCurrentView();
    diaryInitialDataLoaded = true;
    diaryInitialDataValidated = true;
    if (options.reportFirstData) {
      uiTools?.markPerfStage?.("first-data-ready", {
        periodIds: diaryLoadedPeriodIds.slice(),
        entryCount: diaryEntries.length,
      });
    }
    if (options.includeAdjacentPrefetch !== false) {
      scheduleDiaryAdjacentPrefetch(anchorDate);
    }
    if (!diaryInitialReadyReported) {
      await queueDiaryInitialReveal();
    }
  };

  try {
    if (!diaryRefreshController) {
      if (manageLoading) {
        setDiaryLoadingState({
          active: true,
          mode,
          delayMs,
          message,
        });
      }
      try {
        const loadedState = await loadTask();
        await commitLoadedState(loadedState);
        return requestId === diaryLoadRequestId;
      } finally {
        if (manageLoading && requestId === diaryLoadRequestId) {
          await setDiaryLoadingState({
            active: false,
          });
        }
      }
    }

    const refreshResult = await diaryRefreshController.run(
      () => loadTask(),
      {
        delayMs,
        manageLoading,
        loadingOptions: {
          mode,
          message,
        },
        commit: async (loadedState) => {
          await commitLoadedState(loadedState);
        },
      },
    );
    if (refreshResult?.stale || requestId !== diaryLoadRequestId) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("刷新日记可见数据失败:", error);
    if (requestId !== diaryLoadRequestId) {
      return false;
    }
    const cachedSnapshot = readDiaryCachedSnapshotState();
    if (cachedSnapshot) {
      applyDiaryLoadedState(cachedSnapshot);
    }
    renderDiaryGuideCard();
    renderCurrentView();
    diaryInitialDataLoaded = true;
    diaryInitialDataValidated = true;
    return false;
  }
}

async function loadDiaryData(options = {}) {
  const bundleStorage = window.ControlerStorage;
  if (typeof bundleStorage?.getPageBootstrapState === "function") {
    const periodIds =
      Array.isArray(options.periodIds) && options.periodIds.length
        ? options.periodIds
        : getDiaryPrefetchPeriodIds(options.anchorDate || currentDate);
    const bootstrap = await withDiaryTimeout(
      bundleStorage.getPageBootstrapState("diary", {
        periodIds,
      }),
      "读取日记引导数据",
    );
    const data =
      bootstrap?.data && typeof bootstrap.data === "object" ? bootstrap.data : null;
    if (data) {
      const effectiveGuideState = resolveDiaryGuideStateForHydration(
        data.guideState || null,
      );
      let shouldPersist = false;
      const entries = Array.isArray(data.currentMonthEntries)
        ? data.currentMonthEntries
            .map((entry) => {
              const normalized = normalizeDiaryEntry(entry);
              if (normalized.changed) {
                shouldPersist = true;
              }
              return normalized.value;
            })
            .filter(Boolean)
        : [];
      const synchronizedEntries = synchronizeDiaryEntriesWithGuideState(
        entries,
        effectiveGuideState,
      );
      if (synchronizedEntries.changed) {
        shouldPersist = true;
      }
      return normalizeDiaryLoadedState({
        entries: synchronizedEntries.entries,
        categories: Array.isArray(data.diaryCategories) ? data.diaryCategories : [],
        loadedPeriodIds:
          Array.isArray(bootstrap.loadedPeriodIds) && bootstrap.loadedPeriodIds.length
            ? bootstrap.loadedPeriodIds
            : periodIds.slice(),
        shouldPersist,
        persistMeta: shouldPersist
          ? {
              changedPeriodIds: periodIds,
            }
          : {},
      });
    }
  }
  if (
    typeof bundleStorage?.loadSectionRange === "function" &&
    typeof bundleStorage?.getCoreState === "function"
  ) {
    const periodIds =
      Array.isArray(options.periodIds) && options.periodIds.length
        ? options.periodIds
        : getDiaryPrefetchPeriodIds(options.anchorDate || currentDate);
    const [entriesResult, coreState] = await Promise.all([
      withDiaryTimeout(
        bundleStorage.loadSectionRange("diaryEntries", {
          periodIds,
        }),
        "读取日记分区",
      ),
      withDiaryTimeout(bundleStorage.getCoreState(), "读取日记核心数据"),
    ]);
    const effectiveGuideState = resolveDiaryGuideStateForHydration(
      coreState?.guideState || null,
    );

    let shouldPersist = false;
    const entries = Array.isArray(entriesResult?.items)
      ? entriesResult.items
          .map((entry) => {
            const normalized = normalizeDiaryEntry(entry);
            if (normalized.changed) {
              shouldPersist = true;
            }
            return normalized.value;
          })
          .filter(Boolean)
      : [];
    const synchronizedEntries = synchronizeDiaryEntriesWithGuideState(
      entries,
      effectiveGuideState,
    );
    if (synchronizedEntries.changed) {
      shouldPersist = true;
    }

    return normalizeDiaryLoadedState({
      entries: synchronizedEntries.entries,
      categories: Array.isArray(coreState?.diaryCategories)
        ? coreState.diaryCategories
        : [],
      loadedPeriodIds: periodIds.slice(),
      shouldPersist,
      persistMeta: shouldPersist
        ? {
            changedPeriodIds: periodIds,
          }
        : {},
    });
  }

  const entries = JSON.parse(localStorage.getItem("diaryEntries") || "[]");
  const categories = JSON.parse(localStorage.getItem("diaryCategories") || "[]");
  let shouldPersist = false;
  const normalizedEntries = Array.isArray(entries)
    ? entries
        .map((entry) => {
          const normalized = normalizeDiaryEntry(entry);
          if (normalized.changed) {
            shouldPersist = true;
          }
          return normalized.value;
        })
        .filter(Boolean)
    : [];
  const synchronizedEntries = synchronizeDiaryEntriesWithGuideState(
    normalizedEntries,
    readDiaryGuideState(),
  );
  if (synchronizedEntries.changed) {
    shouldPersist = true;
  }

  return normalizeDiaryLoadedState({
    entries: synchronizedEntries.entries,
    categories: Array.isArray(categories) ? categories : [],
    shouldPersist,
    persistMeta: shouldPersist
      ? {
          changedPeriodIds: [
            ...new Set(
              synchronizedEntries.entries.map((entry) =>
                getDiaryEntryPeriodId(entry),
              ),
            ),
          ],
        }
      : {},
  });
}

function saveDiaryData(options = {}) {
  const persistMeta = normalizeDiaryPersistMeta(options);
  return trackDiaryPersistenceTask((async () => {
    const changedPeriodIds = persistMeta.changedPeriodIds;
    const categoriesChanged = persistMeta.categoriesChanged;
    const guideStateChanged = persistMeta.guideStateChanged;
    try {
      const bundleStorage = window.ControlerStorage;
      if (
        typeof bundleStorage?.saveSectionRange === "function" &&
        typeof bundleStorage?.replaceCoreState === "function"
      ) {
        const partialCore = {};
        if (categoriesChanged) {
          partialCore.diaryCategories = diaryCategories;
        }
        if (guideStateChanged) {
          partialCore.guideState = readDiaryGuideState();
        }
        if (guideStateChanged && Object.keys(partialCore).length) {
          await bundleStorage.replaceCoreState(partialCore, {
            reason: "diary-guide-state",
          });
        }
        const periodIds = changedPeriodIds.length
          ? changedPeriodIds
          : diaryLoadedPeriodIds.length
            ? diaryLoadedPeriodIds.slice()
            : [...new Set(diaryEntries.map((entry) => getDiaryEntryPeriodId(entry)))];
        if (periodIds.length) {
          await Promise.all(
            periodIds.map((periodId) =>
              bundleStorage.saveSectionRange("diaryEntries", {
                periodId,
                items: diaryEntries.filter(
                  (entry) => getDiaryEntryPeriodId(entry) === periodId,
                ),
                mode: "replace",
              }),
            ),
          );
        }
        if (categoriesChanged && !guideStateChanged) {
          await bundleStorage.replaceCoreState(partialCore, {
            reason: "core-replace",
          });
        }
        persistDiaryFallbackSnapshot();
        return true;
      }

      return persistDiaryFallbackSnapshot();
    } catch (error) {
      console.error("保存日记数据失败:", error);
      return false;
    }
  })());
}

async function requestDiaryConfirmation(message, options = {}) {
  if (uiTools?.confirmDialog) {
    return uiTools.confirmDialog({
      title: localizeDiaryUiText(options.title || "请确认操作"),
      message: localizeDiaryUiText(message),
      confirmText: localizeDiaryUiText(options.confirmText || "确定"),
      cancelText: localizeDiaryUiText(options.cancelText || "取消"),
      danger: !!options.danger,
    });
  }
  return confirm(localizeDiaryUiText(message));
}

async function showDiaryAlert(message, options = {}) {
  const alertDialog =
    uiTools?.alertDialog ||
    (typeof window !== "undefined" ? window.ControlerUI?.alertDialog : null);
  if (typeof alertDialog === "function") {
    await alertDialog({
      title: localizeDiaryUiText(options.title || "提示"),
      message: localizeDiaryUiText(message),
      confirmText: localizeDiaryUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }
  alert(localizeDiaryUiText(message));
}

function getCategoryById(categoryId) {
  return diaryCategories.find((category) => category.id === categoryId) || null;
}

function entryMatchesDiaryCategoryFilter(entry) {
  if (diaryCategoryFilter === "all") return true;
  if (diaryCategoryFilter === "uncategorized") return !entry?.categoryId;
  return String(entry?.categoryId || "") === String(diaryCategoryFilter);
}

function normalizeDiarySearchQuery(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hasDiarySearchQuery() {
  return diarySearchQuery.length > 0;
}

function entryMatchesDiarySearchQuery(entry) {
  if (!hasDiarySearchQuery()) {
    return true;
  }

  const keyword = diarySearchQuery.toLocaleLowerCase();
  const numericKeyword = keyword.replace(/\D+/g, "");
  const categoryName = getCategoryById(entry?.categoryId)?.name || "";
  const entryDate = String(entry?.date || "").trim();
  const compactDate = entryDate.replace(/\D+/g, "");
  const parsedDate = parseDateInputValue(entryDate);
  const dateFragments = parsedDate
    ? [
        String(parsedDate.getFullYear()),
        String(parsedDate.getMonth() + 1),
        String(parsedDate.getDate()),
        `${parsedDate.getMonth() + 1}-${parsedDate.getDate()}`,
        `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}`,
      ]
    : [];
  const searchableFields = [
    entry?.title,
    entry?.content,
    categoryName,
    entryDate,
    compactDate,
    ...dateFragments,
  ];

  if (
    numericKeyword &&
    compactDate &&
    compactDate.includes(numericKeyword)
  ) {
    return true;
  }

  return searchableFields.some((fieldValue) =>
    String(fieldValue || "").toLocaleLowerCase().includes(keyword),
  );
}

function compareDiaryEntriesDescending(leftEntry, rightEntry) {
  if (leftEntry.date === rightEntry.date) {
    return String(rightEntry.updatedAt || "").localeCompare(
      String(leftEntry.updatedAt || ""),
    );
  }
  return leftEntry.date < rightEntry.date ? 1 : -1;
}

function getFilteredDiaryEntries({ currentMonthOnly = false } = {}) {
  const monthKey = currentMonthOnly
    ? window.ControlerDataIndex?.formatMonthKey?.(currentDate) ||
      `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`
    : "all";
  const cacheKey = [
    monthKey,
    diaryCategoryFilter,
    diarySearchQuery,
    diaryEntries.length,
    diaryEntries[0]?.updatedAt || diaryEntries[0]?.date || "",
    diaryEntries[diaryEntries.length - 1]?.updatedAt ||
      diaryEntries[diaryEntries.length - 1]?.date ||
      "",
  ].join("|");
  if (cacheKey === diaryFilteredEntriesCacheKey) {
    return diaryFilteredEntriesCacheValue;
  }

  const sourceEntries = currentMonthOnly
    ? diaryDataIndex?.getDiaryEntriesForMonth?.(currentDate) || []
    : diaryEntries;
  const filteredEntries = sourceEntries
    .filter((entry) => {
      const date = parseDateInputValue(entry.date);
      if (!date) return false;
      return (
        entryMatchesDiaryCategoryFilter(entry) &&
        entryMatchesDiarySearchQuery(entry)
      );
    })
    .sort(compareDiaryEntriesDescending);
  diaryFilteredEntriesCacheKey = cacheKey;
  diaryFilteredEntriesCacheValue = filteredEntries;
  return filteredEntries;
}

function getVisibleDiaryEntriesForCurrentMonth() {
  return getFilteredDiaryEntries({ currentMonthOnly: true });
}

function getVisibleDiarySearchResults() {
  return getFilteredDiaryEntries();
}

function getCurrentDiaryMonthLabel() {
  return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
}

function getDiaryYearBounds() {
  const currentYear = currentDate.getFullYear();
  const nowYear = new Date().getFullYear();
  let minYear = Math.min(
    currentYear,
    nowYear - DIARY_SELECTOR_YEAR_RANGE_OFFSET,
  );
  let maxYear = Math.max(
    currentYear,
    nowYear + DIARY_SELECTOR_YEAR_RANGE_OFFSET,
  );
  const monthMap = diaryDataIndex?.getDiaryEntriesByMonthMap?.() || new Map();
  monthMap.forEach((_entries, monthKey) => {
    const year = Number.parseInt(String(monthKey).slice(0, 4), 10);
    if (Number.isFinite(year)) {
      minYear = Math.min(minYear, year);
      maxYear = Math.max(maxYear, year);
    }
  });
  return {
    minYear,
    maxYear,
  };
}

function getDiaryYearsForSelector() {
  const { minYear, maxYear } = getDiaryYearBounds();
  const result = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    result.push(year);
  }
  return result;
}

function getNearestDiaryPickerOption(list) {
  if (!(list instanceof HTMLElement)) {
    return null;
  }
  const optionButtons = Array.from(
    list.querySelectorAll(".diary-period-picker-option"),
  );
  if (!optionButtons.length) {
    return null;
  }
  const listCenter = list.scrollTop + list.clientHeight / 2;
  return optionButtons.reduce((nearest, candidate) => {
    if (!(nearest instanceof HTMLElement)) {
      return candidate;
    }
    const nearestDistance = Math.abs(
      nearest.offsetTop + nearest.offsetHeight / 2 - listCenter,
    );
    const candidateDistance = Math.abs(
      candidate.offsetTop + candidate.offsetHeight / 2 - listCenter,
    );
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, null);
}

function readDiaryPickerOptionValue(optionButton) {
  const nextValue =
    optionButton instanceof HTMLElement
      ? Number(optionButton.dataset.value)
      : Number.NaN;
  return Number.isFinite(nextValue) ? nextValue : null;
}

function scrollDiaryPickerOptionIntoCenter(list, optionButton, behavior = "auto") {
  if (!(list instanceof HTMLElement) || !(optionButton instanceof HTMLElement)) {
    return;
  }
  const targetTop = Math.max(
    0,
    optionButton.offsetTop - (list.clientHeight - optionButton.offsetHeight) / 2,
  );
  list.dataset.controlerDiaryPickerAutoScrolling = "true";
  list.scrollTo({
    top: targetTop,
    behavior,
  });
  window.setTimeout(() => {
    delete list.dataset.controlerDiaryPickerAutoScrolling;
  }, behavior === "smooth" ? 260 : 80);
}

function showDiarySingleColumnPickerDialog({
  title = "请选择",
  values = [],
  selectedValue = null,
  secondaryText = "",
  formatValueText = (value) => String(value ?? ""),
} = {}) {
  const normalizedValues = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter(Number.isFinite),
    ),
  );
  if (!normalizedValues.length) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "4600";
    modal.innerHTML = `
      <div class="modal-content themed-dialog-card diary-period-picker-dialog ms" style="width:min(420px, calc(100vw - 24px)); max-width:min(420px, calc(100vw - 24px));">
        <div class="themed-dialog-title">${title}</div>
        <div class="diary-period-picker-preview">
          <div class="diary-period-picker-preview-secondary" data-diary-picker-preview-secondary></div>
          <div class="diary-period-picker-preview-primary" data-diary-picker-preview-primary></div>
        </div>
        <div class="diary-period-picker-wheel">
          <div class="diary-period-picker-wheel-band" aria-hidden="true"></div>
          <div class="diary-period-picker-wheel-list" data-diary-picker-list></div>
        </div>
        <div class="themed-dialog-actions diary-period-picker-actions">
          <button type="button" class="bts" data-diary-picker-cancel style="margin:0;">取消</button>
          <button type="button" class="bts" data-diary-picker-confirm style="margin:0;">设置</button>
        </div>
      </div>
    `;

    let currentValue = normalizedValues.includes(Number(selectedValue))
      ? Number(selectedValue)
      : normalizedValues[0];
    const previewSecondary = modal.querySelector(
      "[data-diary-picker-preview-secondary]",
    );
    const previewPrimary = modal.querySelector(
      "[data-diary-picker-preview-primary]",
    );
    const list = modal.querySelector("[data-diary-picker-list]");
    let dialogSettled = false;
    const pickerEventCleanups = [];
    const pickerOptionHeightPx = 54;
    const pickerVisibleRadius = 3;
    const pickerSlotOffsets = Array.from(
      {
        length: pickerVisibleRadius * 2 + 1,
      },
      (_, index) => index - pickerVisibleRadius,
    );
    const pickerOptionButtons = [];
    let selectedIndex = Math.max(
      0,
      normalizedValues.indexOf(currentValue),
    );
    let gestureActive = false;
    let gestureMoved = false;
    let gestureStartY = 0;
    let gestureOffsetPx = 0;
    let gestureStartTime = 0;
    let gestureLastY = 0;
    let gestureLastTime = 0;
    let suppressOptionClick = false;

    const syncPreview = () => {
      if (previewSecondary instanceof HTMLElement) {
        previewSecondary.textContent = secondaryText || title;
      }
      if (previewPrimary instanceof HTMLElement) {
        previewPrimary.textContent = formatValueText(currentValue);
      }
    };

    const clampPickerIndex = (index) =>
      Math.max(0, Math.min(normalizedValues.length - 1, Number(index) || 0));

    const clampPickerIndexFloat = (index) =>
      Math.max(
        0,
        Math.min(normalizedValues.length - 1, Number(index) || 0),
      );

    const syncPreviewValue = (nextIndex) => {
      const resolvedIndex = clampPickerIndex(nextIndex);
      const nextValue = normalizedValues[resolvedIndex] ?? normalizedValues[0];
      if (nextValue !== currentValue) {
        currentValue = nextValue;
      }
      syncPreview();
      return currentValue;
    };

    const setCurrentValueByIndex = (nextIndex) => {
      selectedIndex = clampPickerIndex(nextIndex);
      syncPreviewValue(selectedIndex);
      return currentValue;
    };

    const computeWheelVisualState = () => {
      const rawIndex = clampPickerIndexFloat(
        selectedIndex - gestureOffsetPx / pickerOptionHeightPx,
      );
      const visualIndex = clampPickerIndex(Math.round(rawIndex));
      const visualOffsetPx = Math.max(
        -pickerOptionHeightPx,
        Math.min(
          pickerOptionHeightPx,
          (visualIndex - rawIndex) * pickerOptionHeightPx,
        ),
      );
      return {
        rawIndex,
        visualIndex,
        visualOffsetPx,
      };
    };

    const renderWheelPosition = ({ animate = false } = {}) => {
      if (!(list instanceof HTMLElement)) {
        return;
      }
      const { visualIndex, visualOffsetPx } = computeWheelVisualState();
      const transitionValue = animate
        ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, color 180ms ease"
        : "none";
      syncPreviewValue(visualIndex);
      pickerOptionButtons.forEach((optionButton) => {
        if (!(optionButton instanceof HTMLElement)) {
          return;
        }
        optionButton.style.transition = transitionValue;
        const slotOffset = Number(optionButton.dataset.slotOffset || 0);
        const valueIndex = visualIndex + slotOffset;
        if (valueIndex < 0 || valueIndex >= normalizedValues.length) {
          optionButton.hidden = true;
          optionButton.style.display = "none";
          optionButton.style.pointerEvents = "none";
          optionButton.dataset.value = "";
          optionButton.dataset.valueIndex = "";
          optionButton.textContent = "";
          return;
        }
        const optionValue = normalizedValues[valueIndex];
        const optionText = formatValueText(optionValue);
        if (optionButton.textContent !== optionText) {
          optionButton.textContent = optionText;
        }
        optionButton.hidden = false;
        optionButton.style.display = "flex";
        optionButton.style.pointerEvents = gestureActive ? "none" : "auto";
        optionButton.dataset.value = String(optionValue);
        optionButton.dataset.valueIndex = String(valueIndex);
        const isSelected = valueIndex === visualIndex;
        optionButton.classList.toggle("selected", isSelected);
        const distance = Math.abs(slotOffset);
        optionButton.style.opacity = isSelected
          ? "1"
          : String(Math.max(0.16, 0.78 - distance * 0.18));
        const scale = isSelected
          ? 1.04
          : Math.max(0.92, 1 - distance * 0.04);
        const translateY = slotOffset * pickerOptionHeightPx + visualOffsetPx;
        optionButton.style.transform = `translate3d(0, ${translateY}px, 0) translateY(-50%) scale(${scale.toFixed(
          3,
        )})`;
      });
    };

    const readGestureClientY = (event) => {
      if (!event) {
        return null;
      }
      const touchPoint = event.touches?.[0] || event.changedTouches?.[0] || null;
      const clientY =
        typeof touchPoint?.clientY === "number"
          ? touchPoint.clientY
          : typeof event.clientY === "number"
            ? event.clientY
            : null;
      return Number.isFinite(clientY) ? clientY : null;
    };

    const renderOptionSlots = (behavior = "auto") => {
      if (!(list instanceof HTMLElement)) {
        return;
      }
      list.innerHTML = "";
      pickerOptionButtons.length = 0;
      pickerSlotOffsets.forEach((slotOffset) => {
        const optionButton = document.createElement("button");
        optionButton.type = "button";
        optionButton.className = "diary-period-picker-option";
        optionButton.dataset.slotOffset = String(slotOffset);
        optionButton.addEventListener("click", (event) => {
          if (dialogSettled || gestureActive || suppressOptionClick) {
            suppressOptionClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const nextIndex = Number(optionButton.dataset.valueIndex);
          if (!Number.isFinite(nextIndex)) {
            return;
          }
          gestureOffsetPx = 0;
          setCurrentValueByIndex(nextIndex);
          renderWheelPosition({
            animate: true,
          });
        });
        list.appendChild(optionButton);
        pickerOptionButtons.push(optionButton);
      });

      setCurrentValueByIndex(selectedIndex);
      window.requestAnimationFrame?.(() => {
        renderWheelPosition({
          animate: behavior === "smooth",
        });
      });
    };

    const bindPickerEvent = (target, eventName, handler, options = undefined) => {
      if (
        !target ||
        typeof target.addEventListener !== "function" ||
        typeof target.removeEventListener !== "function"
      ) {
        return;
      }
      target.addEventListener(eventName, handler, options);
      pickerEventCleanups.push(() => {
        target.removeEventListener(eventName, handler, options);
      });
    };

    const beginPickerGesture = (event) => {
      if (dialogSettled) {
        return;
      }
      const clientY = readGestureClientY(event);
      if (!Number.isFinite(clientY)) {
        return;
      }
      gestureActive = true;
      gestureMoved = false;
      suppressOptionClick = false;
      gestureOffsetPx = 0;
      gestureStartY = clientY;
      gestureLastY = clientY;
      gestureStartTime = Date.now();
      gestureLastTime = gestureStartTime;
      if (event.cancelable) {
        event.preventDefault();
      }
      renderWheelPosition();
    };

    const updatePickerGesture = (event) => {
      if (!gestureActive || dialogSettled) {
        return;
      }
      const clientY = readGestureClientY(event);
      if (!Number.isFinite(clientY)) {
        return;
      }
      gestureOffsetPx = clientY - gestureStartY;
      gestureLastY = clientY;
      gestureLastTime = Date.now();
      if (Math.abs(gestureOffsetPx) > 6) {
        gestureMoved = true;
        suppressOptionClick = true;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      renderWheelPosition();
    };

    const finishPickerGesture = (event = null) => {
      if (!gestureActive) {
        return;
      }
      const clientY = readGestureClientY(event);
      if (Number.isFinite(clientY)) {
        gestureOffsetPx = clientY - gestureStartY;
        gestureLastY = clientY;
        gestureLastTime = Date.now();
      }
      const elapsedMs = Math.max(16, gestureLastTime - gestureStartTime);
      const velocityPxPerMs = (gestureLastY - gestureStartY) / elapsedMs;
      let projectedIndex =
        selectedIndex - gestureOffsetPx / pickerOptionHeightPx;
      if (Math.abs(velocityPxPerMs) > 0.45 && Math.abs(gestureOffsetPx) > 18) {
        projectedIndex -= Math.sign(velocityPxPerMs) * 0.85;
      }
      gestureActive = false;
      gestureOffsetPx = 0;
      setCurrentValueByIndex(Math.round(projectedIndex));
      if (event?.cancelable) {
        event.preventDefault();
      }
      renderWheelPosition({
        animate: true,
      });
      window.setTimeout(() => {
        gestureMoved = false;
        suppressOptionClick = false;
      }, 0);
    };

    ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
      bindPickerEvent(list, eventName, beginPickerGesture, {
        passive: eventName === "touchstart",
      });
    });
    ["pointermove", "mousemove", "touchmove"].forEach((eventName) => {
      bindPickerEvent(window, eventName, updatePickerGesture, {
        passive: false,
      });
    });
    ["pointerup", "mouseup", "touchend", "touchcancel", "pointercancel"].forEach(
      (eventName) => {
        bindPickerEvent(window, eventName, finishPickerGesture, {
          passive: false,
        });
      },
    );
    bindPickerEvent(
      list,
      "wheel",
      (event) => {
        if (dialogSettled) {
          return;
        }
        const direction = Math.sign(Number(event.deltaY) || 0);
        if (!direction) {
          return;
        }
        gestureActive = false;
        gestureOffsetPx = 0;
        suppressOptionClick = false;
        setCurrentValueByIndex(selectedIndex + direction);
        if (event.cancelable) {
          event.preventDefault();
        }
        renderWheelPosition({
          animate: true,
        });
      },
      {
        passive: false,
      },
    );

    const settleDialog = (result = null) => {
      dialogSettled = true;
      gestureActive = false;
      gestureOffsetPx = 0;
      pickerEventCleanups.splice(0).forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn("清理日记滚轮选择器事件失败:", error);
        }
      });
      modal.__controlerCloseModal = null;
      if (typeof uiTools?.closeModal === "function") {
        uiTools.closeModal(modal);
      } else if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      window.setTimeout(() => {
        resolve(result);
      }, 120);
    };

    modal.__controlerCloseModal = () => settleDialog(null);
    if (typeof uiTools?.prepareModalOverlay === "function") {
      uiTools.prepareModalOverlay(modal, {
        zIndex: 4600,
        scope: "viewport",
        keyboardConfirmSelector: "[data-diary-picker-confirm]",
        keyboardCancelSelector: "[data-diary-picker-cancel]",
      });
      uiTools?.activateModalInteractionShield?.(180);
    } else {
      document.body.appendChild(modal);
      uiTools?.stopModalContentPropagation?.(modal);
    }

    uiTools?.bindModalAction?.(modal, "[data-diary-picker-cancel]", () => {
      settleDialog(null);
    });
    uiTools?.bindModalAction?.(modal, "[data-diary-picker-confirm]", () => {
      settleDialog(currentValue);
    });
    uiTools?.bindModalBackdropDismiss?.(modal, () => {
      settleDialog(null);
    });

    syncPreview();
    renderOptionSlots();
  });
}

function ensureDiaryPeriodTriggerContent(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return null;
  }
  let label = button.querySelector("[data-diary-period-trigger-label]");
  if (!(label instanceof HTMLElement)) {
    button.textContent = "";
    label = document.createElement("span");
    label.className = "diary-period-trigger-label";
    label.dataset.diaryPeriodTriggerLabel = "true";
    button.appendChild(label);
  }
  let caret = button.querySelector(".diary-period-trigger-caret");
  if (!(caret instanceof HTMLElement)) {
    caret = document.createElement("span");
    caret.className = "diary-period-trigger-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    button.appendChild(caret);
  }
  return label;
}

function syncDiaryPeriodSelectors() {
  const yearSelect = document.getElementById("diary-year-select");
  const monthSelect = document.getElementById("diary-month-select");
  if (!(yearSelect instanceof HTMLButtonElement) || !(monthSelect instanceof HTMLButtonElement)) {
    return;
  }

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const yearLabel = ensureDiaryPeriodTriggerContent(yearSelect);
  const monthLabel = ensureDiaryPeriodTriggerContent(monthSelect);
  if (yearLabel instanceof HTMLElement) {
    yearLabel.textContent = `${currentYear}年`;
    yearLabel.title = `${currentYear}年`;
  }
  if (monthLabel instanceof HTMLElement) {
    monthLabel.textContent = `${currentMonth}月`;
    monthLabel.title = `${currentMonth}月`;
  }
  yearSelect.dataset.value = String(currentYear);
  monthSelect.dataset.value = String(currentMonth);
  yearSelect.setAttribute("aria-label", `年份，当前 ${currentYear} 年`);
  monthSelect.setAttribute("aria-label", `月份，当前 ${currentMonth} 月`);
  yearSelect.title = `${currentYear}年`;
  monthSelect.title = `${currentMonth}月`;
}

function setCurrentDiaryMonth(year, month) {
  currentDate = new Date(year, month - 1, 1);
  void refreshDiaryVisibleData({
    anchorDate: currentDate,
    message: "正在加载所选月份的日记数据，请稍候",
  });
}

function initDiaryPeriodSelectors() {
  const yearSelect = document.getElementById("diary-year-select");
  const monthSelect = document.getElementById("diary-month-select");
  if (!(yearSelect instanceof HTMLButtonElement) || !(monthSelect instanceof HTMLButtonElement)) {
    return;
  }

  syncDiaryPeriodSelectors();

  yearSelect.addEventListener("click", async () => {
    const { minYear, maxYear } = getDiaryYearBounds();
    const yearValues = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      yearValues.push(year);
    }
    const nextYear = await showDiarySingleColumnPickerDialog({
      title: "选择年份",
      secondaryText: "年份",
      values: yearValues,
      selectedValue: currentDate.getFullYear(),
      formatValueText: (value) => `${value}年`,
    });
    if (!Number.isFinite(nextYear) || nextYear === currentDate.getFullYear()) {
      return;
    }
    setCurrentDiaryMonth(nextYear, currentDate.getMonth() + 1);
  });

  monthSelect.addEventListener("click", async () => {
    const nextMonth = await showDiarySingleColumnPickerDialog({
      title: "选择月份",
      secondaryText: `${currentDate.getFullYear()}年`,
      values: Array.from({ length: 12 }, (_, index) => index + 1),
      selectedValue: currentDate.getMonth() + 1,
      formatValueText: (value) => `${value}月`,
    });
    if (!Number.isFinite(nextMonth) || nextMonth === currentDate.getMonth() + 1) {
      return;
    }
    setCurrentDiaryMonth(currentDate.getFullYear(), nextMonth);
  });
}

function syncDiaryCategoryFilterSelector() {
  const categoryFilter = document.getElementById("diary-category-filter");
  if (!categoryFilter) return;

  const options = [
    { value: "all", label: "全部" },
    { value: "uncategorized", label: "未分类" },
    ...diaryCategories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  const availableValues = new Set(options.map((option) => option.value));
  if (!availableValues.has(diaryCategoryFilter)) {
    diaryCategoryFilter = "all";
  }

  categoryFilter.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  categoryFilter.value = diaryCategoryFilter;
  uiTools?.enhanceNativeSelect?.(categoryFilter, {
    minWidth: 140,
    widthFactor: DIARY_CATEGORY_WIDTH_FACTOR,
    menuWidthFactor: DIARY_CATEGORY_WIDTH_FACTOR,
  });
}

function initDiaryCategoryFilterSelector() {
  const categoryFilter = document.getElementById("diary-category-filter");
  if (!categoryFilter) return;

  syncDiaryCategoryFilterSelector();
  uiTools?.enhanceNativeSelect?.(categoryFilter, {
    minWidth: 140,
    widthFactor: DIARY_CATEGORY_WIDTH_FACTOR,
    menuWidthFactor: DIARY_CATEGORY_WIDTH_FACTOR,
  });
  categoryFilter.addEventListener("change", () => {
    diaryCategoryFilter = categoryFilter.value || "all";
    renderCurrentView();
  });
}

function syncDiaryViewButtons() {
  const monthBtn = document.getElementById("diary-month-view-btn");
  const listBtn = document.getElementById("diary-list-view-btn");
  [monthBtn, listBtn].forEach((btn) => {
    if (btn) {
      uiTools?.setAccentButtonState(btn, false);
    }
  });
  if (diaryView === "month") {
    uiTools?.setAccentButtonState(monthBtn, true);
  } else {
    uiTools?.setAccentButtonState(listBtn, true);
  }
}

function setDiaryView(nextView) {
  diaryView = nextView === "list" ? "list" : "month";
  syncDiaryViewButtons();
  renderCurrentView();
}

function initViewButtons() {
  const monthBtn = document.getElementById("diary-month-view-btn");
  const listBtn = document.getElementById("diary-list-view-btn");
  const categoryBtn = document.getElementById("diary-category-btn");
  if (!monthBtn || !listBtn || !categoryBtn) return;

  monthBtn.addEventListener("click", () => {
    setDiaryView("month");
  });

  listBtn.addEventListener("click", () => {
    setDiaryView("list");
  });

  categoryBtn.addEventListener("click", () => {
    showCategoryModal();
  });

  syncDiaryViewButtons();
}

function syncDiarySearchControls() {
  const searchInput = document.getElementById("diary-search-input");
  if (searchInput && searchInput.value !== diarySearchQuery) {
    searchInput.value = diarySearchQuery;
  }
}

function setDiarySearchQuery(nextQuery, options = {}) {
  const normalizedQuery = normalizeDiarySearchQuery(nextQuery);
  const shouldSwitchToList =
    !!options.switchToListOnSearch &&
    normalizedQuery &&
    diaryView !== "list";
  const queryChanged = normalizedQuery !== diarySearchQuery;

  diarySearchQuery = normalizedQuery;
  syncDiarySearchControls();

  if (shouldSwitchToList) {
    diaryView = "list";
    syncDiaryViewButtons();
  }

  if (queryChanged || shouldSwitchToList) {
    renderCurrentView();
  }
}

function resolveDiarySearchViewportMetrics() {
  const visualViewport = window.visualViewport;
  const viewportTop = Math.max(Number(visualViewport?.offsetTop) || 0, 0);
  const viewportHeight = Math.max(
    Number(visualViewport?.height) ||
      Number(window.innerHeight) ||
      Number(document.documentElement?.clientHeight) ||
      Number(document.body?.clientHeight) ||
      0,
    0,
  );

  return {
    viewportTop,
    viewportBottom: viewportTop + viewportHeight,
  };
}

function isDiarySearchScrollHost(candidate) {
  if (!(candidate instanceof HTMLElement)) {
    return false;
  }
  const computedStyle =
    typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(candidate)
      : null;
  const overflowY = String(computedStyle?.overflowY || "").toLowerCase();
  return (
    ["auto", "scroll", "overlay"].includes(overflowY) ||
    candidate.scrollHeight > candidate.clientHeight + 1
  );
}

function resolveDiarySearchScrollHost(searchInput) {
  const candidates = [
    searchInput?.closest?.(".app-main.diary-main"),
    searchInput?.closest?.(".diary-main"),
    searchInput?.closest?.(".app-main"),
    document.scrollingElement,
    document.documentElement,
    document.body,
  ];
  return (
    candidates.find((candidate) => isDiarySearchScrollHost(candidate)) ||
    document.scrollingElement ||
    document.documentElement ||
    document.body
  );
}

function initDiarySearchControls() {
  const searchInput = document.getElementById("diary-search-input");
  if (!searchInput) return;

  diarySearchQuery = "";
  searchInput.value = "";
  syncDiarySearchControls();

  let viewportSyncFrameId = 0;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  const cancelScheduled =
    typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);
  let searchViewportSyncTimers = [];
  const syncSearchInputIntoViewport = () => {
    viewportSyncFrameId = 0;
    if (document.activeElement !== searchInput) {
      return;
    }
    const searchShell =
      searchInput.closest(".diary-filter-shell") || searchInput;
    if (!(searchShell instanceof HTMLElement)) {
      return;
    }
    const scrollHost = resolveDiarySearchScrollHost(searchInput);
    const { viewportTop, viewportBottom } = resolveDiarySearchViewportMetrics();

    const shellRect = searchShell.getBoundingClientRect();
    const targetTop = viewportTop + 10;
    const targetBottom = viewportBottom - 18;
    let scrollDelta = 0;
    if (shellRect.top < targetTop) {
      scrollDelta = shellRect.top - targetTop;
    } else if (shellRect.bottom > targetBottom) {
      scrollDelta = shellRect.bottom - targetBottom;
    }

    if (Math.abs(scrollDelta) <= 1) {
      return;
    }

    if (scrollHost instanceof HTMLElement && typeof scrollHost.scrollBy === "function") {
      scrollHost.scrollBy({
        top: scrollDelta,
        behavior: "auto",
      });
      return;
    }
    window.scrollBy({
      top: scrollDelta,
      behavior: "auto",
    });
  };
  const scheduleSearchInputViewportSync = () => {
    if (viewportSyncFrameId) {
      return;
    }
    viewportSyncFrameId = schedule(syncSearchInputIntoViewport);
  };
  const clearSearchInputViewportSync = () => {
    if (!viewportSyncFrameId) {
      searchViewportSyncTimers.forEach((timerId) => window.clearTimeout(timerId));
      searchViewportSyncTimers = [];
      return;
    }
    cancelScheduled(viewportSyncFrameId);
    viewportSyncFrameId = 0;
    searchViewportSyncTimers.forEach((timerId) => window.clearTimeout(timerId));
    searchViewportSyncTimers = [];
  };

  const handleSearchInput = () => {
    window.clearTimeout(diarySearchInputTimer);
    diarySearchInputTimer = window.setTimeout(() => {
      setDiarySearchQuery(searchInput.value, {
        switchToListOnSearch: true,
      });
    }, DIARY_SEARCH_DEBOUNCE_MS);
  };
  const handleSearchFocus = () => {
    searchViewportSyncTimers.forEach((timerId) => window.clearTimeout(timerId));
    scheduleSearchInputViewportSync();
    searchViewportSyncTimers = [72, 160, 320, 520].map((delay) =>
      window.setTimeout(scheduleSearchInputViewportSync, delay),
    );
  };

  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("focus", handleSearchFocus);
  searchInput.addEventListener("blur", clearSearchInputViewportSync);
  window.visualViewport?.addEventListener?.(
    "resize",
    scheduleSearchInputViewportSync,
    { passive: true },
  );
  window.visualViewport?.addEventListener?.(
    "scroll",
    scheduleSearchInputViewportSync,
    { passive: true },
  );
  window.addEventListener("pageshow", () => {
    searchInput.value = "";
    setDiarySearchQuery("");
    clearSearchInputViewportSync();
  });
}

function renderCurrentView() {
  const container = document.getElementById("diary-view-container");
  if (!container) return;

  syncDiaryPeriodSelectors();
  syncDiaryCategoryFilterSelector();
  syncDiarySearchControls();
  container.innerHTML = "";

  if (diaryView === "month") {
    renderMonthView(container);
  } else {
    renderListView(container);
  }
}

function renderMonthView(container) {
  const scale = getDiaryResponsiveScale();
  const isCompactDiaryLayout = isCompactMobileLayout();
  const gridGap = Math.max(4, Math.round(6 * scale));
  const cellMinHeight = Math.max(82, Math.round(108 * scale));
  const cellPadding = Math.max(6, Math.round(8 * scale));
  const cellRadius = Math.max(8, Math.round(10 * scale));
  const badgeFontSize = isCompactDiaryLayout
    ? Math.max(9, Math.round(10 * scale))
    : Math.max(10, Math.round(11 * scale));
  const previewFontSize = isCompactDiaryLayout
    ? Math.max(9, Math.round(10 * scale))
    : Math.max(11, Math.round(12 * scale));
  const titleFontSize = Math.max(16, Math.round(18 * scale));
  const visibleEntries = getVisibleDiaryEntriesForCurrentMonth();
  const entryByDate = new Map(
    visibleEntries.map((entry) => [entry.date, entry]),
  );
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.marginBottom = "10px";

  const title = document.createElement("div");
  title.style.color = "var(--text-color)";
  title.style.fontWeight = "bold";
  title.style.fontSize = `${titleFontSize}px`;
  title.textContent = getCurrentDiaryMonthLabel();
  header.appendChild(title);

  const nav = document.createElement("div");
  nav.style.display = "flex";
  nav.style.gap = `${gridGap}px`;
  nav.innerHTML = `
    <button class="bts" id="diary-month-prev" style="margin:0;padding:${Math.max(5, Math.round(6 * scale))}px ${Math.max(8, Math.round(10 * scale))}px;">&lt;</button>
    <button class="bts" id="diary-month-today" style="margin:0;padding:${Math.max(5, Math.round(6 * scale))}px ${Math.max(10, Math.round(12 * scale))}px;">今天</button>
    <button class="bts" id="diary-month-next" style="margin:0;padding:${Math.max(5, Math.round(6 * scale))}px ${Math.max(8, Math.round(10 * scale))}px;">&gt;</button>
  `;
  header.appendChild(nav);
  container.appendChild(header);

  const weekdayRow = document.createElement("div");
  weekdayRow.style.display = "grid";
  weekdayRow.style.gridTemplateColumns = "repeat(7, 1fr)";
  weekdayRow.style.gap = `${gridGap}px`;
  weekdayRow.style.marginBottom = `${Math.max(6, Math.round(8 * scale))}px`;
  ["日", "一", "二", "三", "四", "五", "六"].forEach((day) => {
    const node = document.createElement("div");
    node.textContent = day;
    node.style.textAlign = "center";
    node.style.padding = `${cellPadding}px`;
    node.style.borderRadius = "8px";
    node.style.backgroundColor = "var(--bg-tertiary)";
    node.style.color = "var(--text-color)";
    node.style.fontSize = `${Math.max(11, Math.round(12 * scale))}px`;
    weekdayRow.appendChild(node);
  });
  container.appendChild(weekdayRow);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(7, 1fr)";
  grid.style.gap = `${gridGap}px`;

  const firstDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  );
  const start = new Date(firstDay);
  start.setDate(1 - firstDay.getDay());

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateText = formatDateInputValue(date);
    const inCurrentMonth = date.getMonth() === currentDate.getMonth();
    const isToday = dateText === formatDateInputValue(new Date());
    const entry = entryByDate.get(dateText) || null;

    const cell = document.createElement("div");
    cell.className = "controler-pressable";
    cell.style.minHeight = `${cellMinHeight}px`;
    cell.style.borderRadius = `${cellRadius}px`;
    cell.style.padding = `${cellPadding}px`;
    cell.style.cursor = "pointer";
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
    cell.style.gap = `${Math.max(4, Math.round(5 * scale))}px`;
    cell.style.overflow = "hidden";
    cell.style.backgroundColor = inCurrentMonth
      ? "var(--bg-tertiary)"
      : "var(--bg-secondary)";
    cell.style.opacity = inCurrentMonth ? "1" : "0.65";
    if (isToday) {
      cell.style.border = "2px solid var(--accent-color)";
    } else {
      cell.style.border = "1px solid var(--bg-secondary)";
    }

    const dayNo = document.createElement("div");
    dayNo.textContent = String(date.getDate());
    dayNo.style.fontWeight = "bold";
    dayNo.style.color = "var(--text-color)";
    dayNo.style.fontSize = `${Math.max(12, Math.round(13 * scale))}px`;
    dayNo.style.flex = "0 0 auto";
    cell.appendChild(dayNo);

    if (entry) {
      const tag = getCategoryById(entry.categoryId);
      const badge = document.createElement("div");
      badge.style.display = "grid";
      badge.style.gridTemplateColumns = `${Math.max(6, Math.round(8 * scale))}px minmax(0, 1fr)`;
      badge.style.alignItems = "start";
      badge.style.columnGap = `${Math.max(4, Math.round(4 * scale))}px`;
      badge.style.width = "100%";
      badge.style.maxWidth = "100%";
      badge.style.minWidth = "0";
      badge.style.flex = "0 0 auto";
      badge.style.overflow = "hidden";
      badge.style.fontSize = `${badgeFontSize}px`;
      badge.style.color = "var(--text-color)";
      const colorDot = document.createElement("span");
      colorDot.style.display = "inline-block";
      colorDot.style.width = `${Math.max(6, Math.round(8 * scale))}px`;
      colorDot.style.height = `${Math.max(6, Math.round(8 * scale))}px`;
      colorDot.style.borderRadius = "50%";
      colorDot.style.background = tag?.color || "var(--accent-color)";
      colorDot.style.flex = "0 0 auto";
      colorDot.style.marginTop = "0.15em";
      badge.appendChild(colorDot);

      const badgeText = document.createElement("span");
      badgeText.textContent = tag?.name || "未分类";
      badgeText.title = badgeText.textContent;
      badgeText.style.display = "block";
      badgeText.style.overflow = "hidden";
      badgeText.style.textOverflow = "ellipsis";
      badgeText.style.whiteSpace = "nowrap";
      badgeText.style.lineHeight = "1.2";
      badgeText.style.minWidth = "0";
      badgeText.style.maxWidth = "100%";
      badgeText.style.flex = "1 1 auto";
      badge.appendChild(badgeText);
      cell.appendChild(badge);

      const preview = document.createElement("div");
      preview.style.fontSize = `${previewFontSize}px`;
      preview.style.color = "var(--muted-text-color)";
      preview.style.flex = "1 1 auto";
      preview.style.minHeight = "0";
      preview.style.display = "-webkit-box";
      preview.style.setProperty("-webkit-box-orient", "vertical");
      preview.style.setProperty(
        "-webkit-line-clamp",
        isCompactDiaryLayout ? "4" : "5",
      );
      preview.style.overflow = "hidden";
      preview.style.whiteSpace = "normal";
      preview.style.overflowWrap = "break-word";
      preview.style.wordBreak = "normal";
      preview.style.lineBreak = "auto";
      preview.style.writingMode = "horizontal-tb";
      preview.style.lineHeight = "1.25";
      preview.textContent = entry.title || entry.content || "（无正文）";
      preview.title = preview.textContent;
      cell.appendChild(preview);
    } else {
      const empty = document.createElement("div");
      empty.style.fontSize = `${previewFontSize}px`;
      empty.style.color = "var(--muted-text-color)";
      cell.appendChild(empty);
    }

    cell.addEventListener("click", () => {
      if (entry?.id) {
        showDiaryModal(entry.date, entry.id);
        return;
      }
      showDiaryModal(dateText);
    });
    grid.appendChild(cell);
  }

  container.appendChild(grid);

  const prevBtn = nav.querySelector("#diary-month-prev");
  const nextBtn = nav.querySelector("#diary-month-next");
  const todayBtn = nav.querySelector("#diary-month-today");

  prevBtn.addEventListener("click", () => {
    setCurrentDiaryMonth(currentDate.getFullYear(), currentDate.getMonth());
  });
  nextBtn.addEventListener("click", () => {
    setCurrentDiaryMonth(currentDate.getFullYear(), currentDate.getMonth() + 2);
  });
  todayBtn.addEventListener("click", () => {
    setCurrentDiaryMonth(new Date().getFullYear(), new Date().getMonth() + 1);
  });
}

function renderListView(container) {
  const scale = getDiaryResponsiveScale();
  const titleFontSize = Math.max(16, Math.round(18 * scale));
  const metaFontSize = Math.max(11, Math.round(13 * scale));
  const contentFontSize = Math.max(12, Math.round(13 * scale));
  const isSearchMode = hasDiarySearchQuery();
  const list = isSearchMode
    ? getVisibleDiarySearchResults()
    : getVisibleDiaryEntriesForCurrentMonth();

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.marginBottom = "12px";

  const title = document.createElement("div");
  title.style.color = "var(--text-color)";
  title.style.fontWeight = "bold";
  title.style.fontSize = `${titleFontSize}px`;
  title.textContent = localizeDiaryUiText(
    isSearchMode ? "搜索结果" : `${getCurrentDiaryMonthLabel()} 列表`,
  );
  header.appendChild(title);

  const count = document.createElement("div");
  count.style.color = "var(--muted-text-color)";
  count.style.fontSize = `${metaFontSize}px`;
  count.textContent = localizeDiaryUiText(
    isSearchMode ? `共 ${list.length} 篇匹配` : `共 ${list.length} 篇`,
  );
  header.appendChild(count);
  container.appendChild(header);

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "30px";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted-text-color)";
    empty.textContent = localizeDiaryUiText(
      isSearchMode
        ? `没有找到包含“${diarySearchQuery}”的日记`
        : `${getCurrentDiaryMonthLabel()} 暂无日记`,
    );
    container.appendChild(empty);
    return;
  }

  const listWrap = document.createElement("div");
  listWrap.style.display = "flex";
  listWrap.style.flexDirection = "column";
  listWrap.style.gap = "10px";

  container.appendChild(listWrap);
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  let nextIndex = 0;

  const appendBatch = () => {
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(nextIndex + DIARY_LIST_BATCH_SIZE, list.length);
    for (; nextIndex < endIndex; nextIndex += 1) {
      const entry = list[nextIndex];
      const category = getCategoryById(entry.categoryId);
      const card = document.createElement("div");
      card.className = "controler-pressable";
      card.style.borderRadius = "10px";
      card.style.padding = `${Math.max(10, Math.round(12 * scale))}px`;
      card.style.backgroundColor = "var(--bg-tertiary)";
      card.style.border = "1px solid var(--bg-secondary)";
      card.style.cursor = "pointer";

      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.justifyContent = "space-between";
      topRow.style.alignItems = "center";
      topRow.style.gap = "8px";

      const titleNode = document.createElement("strong");
      titleNode.style.color = "var(--text-color)";
      titleNode.style.flex = "1 1 auto";
      titleNode.style.minWidth = "0";
      titleNode.style.overflowWrap = "anywhere";
      titleNode.style.wordBreak = "break-word";
      titleNode.textContent = entry.title || "未命名日记";
      topRow.appendChild(titleNode);

      const dateNode = document.createElement("span");
      dateNode.style.flex = "0 0 auto";
      dateNode.style.fontSize = `${Math.max(11, Math.round(12 * scale))}px`;
      dateNode.style.color = "var(--muted-text-color)";
      dateNode.textContent = entry.date;
      topRow.appendChild(dateNode);
      card.appendChild(topRow);

      const contentNode = document.createElement("div");
      contentNode.style.marginTop = "6px";
      contentNode.style.fontSize = `${contentFontSize}px`;
      contentNode.style.color = "var(--text-color)";
      contentNode.style.display = "-webkit-box";
      contentNode.style.setProperty("-webkit-box-orient", "vertical");
      contentNode.style.setProperty(
        "-webkit-line-clamp",
        isCompactMobileLayout() ? "4" : "5",
      );
      contentNode.style.overflow = "hidden";
      contentNode.style.whiteSpace = "normal";
      contentNode.style.overflowWrap = "anywhere";
      contentNode.style.wordBreak = "break-word";
      contentNode.style.lineHeight = "1.6";
      contentNode.textContent =
        String(entry.content || "").replace(/\s+/g, " ").trim() || "（无正文）";
      card.appendChild(contentNode);

      const categoryNode = document.createElement("div");
      categoryNode.style.marginTop = "8px";
      categoryNode.style.fontSize = `${Math.max(11, Math.round(12 * scale))}px`;
      categoryNode.style.color = "var(--muted-text-color)";
      categoryNode.textContent = category
        ? `分类：${category.name}`
        : "分类：未设置";
      card.appendChild(categoryNode);

      card.addEventListener("click", () => {
        showDiaryModal(entry.date, entry.id);
      });
      fragment.appendChild(card);
    }

    listWrap.appendChild(fragment);
    if (nextIndex < list.length) {
      schedule(appendBatch);
    }
  };

  appendBatch();
}

function findDiaryEntry(dateText, entryId = null) {
  if (entryId) {
    const byId = diaryEntries.find((entry) => entry.id === entryId);
    if (byId) {
      return byId;
    }
  }
  return diaryEntries.find((entry) => entry.date === dateText) || null;
}

function deleteDiaryEntry(entryId, dateText) {
  const beforeLength = diaryEntries.length;
  if (entryId) {
    diaryEntries = diaryEntries.filter((entry) => entry.id !== entryId);
  } else {
    const targetIndex = diaryEntries.findIndex(
      (entry) => entry.date === dateText,
    );
    if (targetIndex >= 0) {
      diaryEntries.splice(targetIndex, 1);
    }
  }
  return diaryEntries.length !== beforeLength;
}

function scheduleDiaryViewRefresh() {
  const rerender = () => {
    renderCurrentView();
  };

  rerender();

  const schedule =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 0);

  schedule(() => {
    rerender();
  });
}

let diaryExternalStorageRefreshQueued = false;

function renderDiaryGuideCard() {
  const container = document.getElementById("diary-guide-card");
  const guideCard = window.ControlerGuideBundle?.getGuideCard?.("diary");
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (DIARY_WIDGET_CONTEXT.enabled) {
    container.hidden = true;
    return;
  }
  if (!guideCard || typeof window.ControlerGuideUI?.renderCard !== "function") {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  window.ControlerGuideUI.renderCard(container, guideCard);
}

function refreshDiaryFromExternalStorageChange() {
  if (!diaryShellPageActive && !isDiaryShellTransitionLoading()) {
    diaryExternalStorageRefreshQueued = false;
    diaryExternalRefreshPendingResume = true;
    return;
  }
  if (diaryInitialHydrationPromise && !diaryInitialDataValidated) {
    diaryExternalStorageRefreshQueued = false;
    diaryPendingExternalStorageRefresh = true;
    return;
  }
  diaryExternalStorageRefreshQueued = false;
  void refreshDiaryVisibleData({
    anchorDate: currentDate,
    manageLoading: !diaryInitialDataLoaded,
    mode: diaryInitialDataLoaded ? "inline" : "fullscreen",
    message: "正在同步最新日记数据，请稍候",
  });
}

function refreshDiaryGuideEntriesFromGuideState(nextGuideState = null) {
  const synchronizedEntries = synchronizeDiaryEntriesWithGuideState(
    diaryEntries,
    nextGuideState,
  );
  if (!synchronizedEntries.changed) {
    return false;
  }
  diaryEntries = synchronizedEntries.entries;
  syncDiaryDataIndex();
  scheduleDiaryViewRefresh();
  return true;
}

function bindDiaryShellVisibilityGate() {
  if (diaryShellVisibilityBound) {
    return;
  }
  diaryShellVisibilityBound = true;
  const eventName =
    uiTools?.shellVisibilityEventName || "controler:shell-visibility-changed";
  window.addEventListener(eventName, (event) => {
    const detail =
      event && typeof event.detail === "object" && event.detail
        ? event.detail
        : {};
    const nextActive = detail.active !== false;
    if (diaryShellPageActive === nextActive) {
      return;
    }

    diaryShellPageActive = nextActive;
    if (!diaryShellPageActive) {
      return;
    }

    if (
      diaryInitialHydrationPendingResume ||
      (!diaryInitialDataLoaded && !diaryInitialHydrationPromise)
    ) {
      diaryInitialHydrationPendingResume = false;
      void startDiaryInitialHydration().then((hydrated) => {
        if (hydrated !== false) {
          flushDiaryPendingWidgetLaunchAction();
        }
      });
    }
    if (diaryExternalRefreshPendingResume) {
      diaryExternalRefreshPendingResume = false;
      refreshDiaryFromExternalStorageChange();
    }
    flushDiaryDeferredExternalRefreshIfNeeded();
    if (diaryDeferredRuntimePendingResume) {
      diaryDeferredRuntimePendingResume = false;
      void ensureDiaryDeferredRuntimeLoaded();
    }
  });
}

function bindDiaryExternalStorageRefresh() {
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail = event?.detail || {};
    const changedSections = getDiaryNormalizedChangedSections(detail?.changedSections);
    if (changedSections.includes("guideState")) {
      refreshDiaryGuideEntriesFromGuideState(
        detail?.data?.guideState || readDiaryGuideState(),
      );
      renderDiaryGuideCard();
    }
    if (!shouldRefreshDiaryForExternalChange(detail)) {
      uiTools?.markPerfStage?.("refresh-skipped", {
        reason: "diary-storage-change-irrelevant",
      });
      return;
    }
    if (diaryExternalStorageRefreshQueued) {
      return;
    }
    diaryExternalStorageRefreshQueued = true;
    if (diaryExternalStorageRefreshCoordinator) {
      diaryExternalStorageRefreshCoordinator.enqueue(detail);
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(refreshDiaryFromExternalStorageChange);
  });
}

async function confirmDiaryModalDelete({
  confirmMessage,
  deleteOperation,
  notFoundMessage = "未找到要删除的内容",
  beforeClose = null,
  closeModal,
  failureTitle = "删除失败",
  failureMessage = "删除后保存失败，已恢复删除前内容。",
}) {
  if (
    typeof deleteOperation !== "function" ||
    typeof closeModal !== "function"
  ) {
    return false;
  }
  const confirmed = await requestDiaryConfirmation(confirmMessage, {
    title: "删除日记内容",
    confirmText: "删除",
    cancelText: "取消",
    danger: true,
  });
  if (!confirmed) {
    return false;
  }

  let deleteResult = null;
  const deleted = await commitDiaryLocalChange({
    applyChange: () => {
      deleteResult = deleteOperation();
      return deleteResult;
    },
    beforeClose,
    closeModal,
    failureTitle,
    failureMessage,
  });
  if (deleteResult === false) {
    await showDiaryAlert(notFoundMessage, {
      title: "删除失败",
      danger: true,
    });
    return false;
  }

  return deleted;
}

function bindDiaryModalActions(modal, handlers = {}) {
  const modalContent = modal?.querySelector?.(".modal-content") || modal;
  if (!modalContent) {
    return () => {};
  }

  const listener = (event) => {
    const actionButton =
      event.target instanceof Element
        ? event.target.closest("[data-diary-modal-action]")
        : null;
    if (!actionButton || !modalContent.contains(actionButton)) {
      return;
    }

    const actionName = actionButton.dataset.diaryModalAction;
    const handler = handlers[actionName];
    if (typeof handler !== "function") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    handler(actionButton, event);
  };

  modalContent.addEventListener("click", listener);

  return () => {
    modalContent.removeEventListener("click", listener);
  };
}

function createDiaryCategorySelector(container, selectedValue = "", config = {}) {
  if (!container) {
    return {
      destroy() {},
      getValue() {
        return selectedValue || "";
      },
      setValue() {},
    };
  }

  const options = [
    { value: "", label: "未分类", color: "", meta: "默认" },
    ...diaryCategories.map((category) => ({
      value: category.id,
      label: category.name,
      color: category.color,
      meta: "分类",
    })),
  ];

  let currentValue = options.some((option) => option.value === selectedValue)
    ? selectedValue
    : "";
  const widthFactor = getExpandWidthFactor();
  const scaledMinWidth = scaleExpandConstraint(160, widthFactor);
  const selectorWidth =
    uiTools?.measureExpandSurfaceWidth?.(
      options.map((option) =>
        option.meta ? `${option.label} ${option.meta}` : option.label,
      ),
      {
        anchor: container,
        minWidth: scaledMinWidth,
        maxWidth: Number.POSITIVE_INFINITY,
        extraPadding: 92,
        widthFactor,
        floorWidth: scaledMinWidth,
      },
    ) || scaledMinWidth;

  container.innerHTML = "";

  const selector = document.createElement("div");
  selector.className = "tree-select";
  selector.style.width = `${selectorWidth}px`;
  selector.style.minWidth = "0";
  selector.style.maxWidth = "100%";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tree-select-button";
  trigger.style.width = `${selectorWidth}px`;
  trigger.style.maxWidth = "100%";

  const triggerText = document.createElement("span");
  triggerText.className = "tree-select-button-text";
  trigger.appendChild(triggerText);

  const caret = document.createElement("span");
  caret.className = "tree-select-button-caret";
  caret.textContent = "▾";
  trigger.appendChild(caret);

  const menu = document.createElement("div");
  menu.className = "tree-select-menu";
  menu.style.width = "100%";
  menu.style.minWidth = "100%";

  const optionButtons = [];
  const repositionMenu = () => {
    uiTools?.positionFloatingMenu?.(selector, menu, {
      minWidth: Math.max(selector.offsetWidth || 0, selectorWidth),
      preferredWidth: Math.max(selector.offsetWidth || 0, selectorWidth + 8),
      maxWidth: Math.max(
        selectorWidth + 12,
        scaleExpandConstraint(420, widthFactor),
      ),
    });
  };

  const handleOutsideClick = (event) => {
    if (!selector.contains(event.target)) {
      selector.classList.remove("open");
      document.removeEventListener("click", handleOutsideClick, true);
      window.removeEventListener("resize", repositionMenu, true);
      window.removeEventListener("scroll", repositionMenu, true);
    }
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

  const updateTrigger = (option) => {
    triggerText.textContent = "";
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const dot = document.createElement("span");
    dot.style.display = "inline-block";
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.flexShrink = "0";
    if (option.color) {
      dot.style.background = option.color;
    } else {
      dot.style.background = "transparent";
      dot.style.border = "1px solid var(--muted-text-color)";
    }
    wrap.appendChild(dot);

    const label = document.createElement("span");
    label.textContent = option.label;
    wrap.appendChild(label);
    triggerText.appendChild(wrap);
  };

  const setSelectedValue = (nextValue) => {
    currentValue = options.some((option) => option.value === nextValue)
      ? nextValue
      : "";
    const selectedOption =
      options.find((option) => option.value === currentValue) || options[0];
    updateTrigger(selectedOption);
    optionButtons.forEach(({ button, value }) => {
      button.classList.toggle("selected", value === currentValue);
    });
    if (typeof config?.onChange === "function") {
      config.onChange(currentValue);
    }
  };

  options.forEach((optionData) => {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-select-node";

    const option = document.createElement("button");
    option.type = "button";
    option.className = "tree-select-option";

    const dot = document.createElement("span");
    dot.style.display = "inline-block";
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.flexShrink = "0";
    if (optionData.color) {
      dot.style.background = optionData.color;
    } else {
      dot.style.background = "transparent";
      dot.style.border = "1px solid var(--muted-text-color)";
    }
    option.appendChild(dot);

    const label = document.createElement("span");
    label.className = "tree-select-option-label";
    label.textContent = optionData.label;
    option.appendChild(label);

    const meta = document.createElement("span");
    meta.className = "tree-select-option-meta";
    meta.textContent = optionData.meta;
    option.appendChild(meta);

    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedValue(optionData.value);
      closeSelector();
    });

    optionButtons.push({ button: option, value: optionData.value });
    wrapper.appendChild(option);
    menu.appendChild(wrapper);
  });

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (selector.classList.contains("open")) {
      closeSelector();
      return;
    }
    openSelector();
  });

  selector.appendChild(trigger);
  selector.appendChild(menu);
  container.appendChild(selector);
  setSelectedValue(currentValue);

  return {
    destroy() {
      closeSelector();
    },
    getValue() {
      return currentValue;
    },
    setValue(nextValue) {
      setSelectedValue(nextValue);
    },
  };
}

function showDiaryModal(dateText, entryId = null) {
  const existing = findDiaryEntry(dateText, entryId);
  const isEditMode = !!existing;
  const activeEntryId = existing?.id || entryId || null;
  const diaryDraftKey = `draft:diary:${activeEntryId || "new"}:${dateText}`;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2200";

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 22px; border-radius: 15px; max-width: 520px; width: 90%; max-height: calc(var(--controler-modal-overlay-height) - 24px); overflow-y: auto;">
      <h2 style="margin-top:0; color: var(--text-color); margin-bottom: 14px;">
        ${dateText} 日记
      </h2>
      <div style="display:flex; flex-direction:column; gap: 12px;">
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">标题</label>
          <input id="diary-title-input" type="text" placeholder="输入日记标题" style="
            width:100%; padding:10px; border-radius:8px; border:1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary); color: var(--text-color); font-size:14px;">
        </div>
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">分类</label>
          <div id="diary-category-selector"></div>
        </div>
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">正文</label>
          <textarea id="diary-content-input" placeholder="写下今天..." style="
            width:100%; min-height:180px; resize:vertical; padding:10px; border-radius:8px;
            border:1px solid var(--bg-tertiary); background-color: var(--bg-quaternary);
            color: var(--text-color); font-size:14px;"></textarea>
        </div>
      </div>
        <div class="controler-form-modal-footer controler-form-modal-footer-inline" style="display:flex; align-items:center; gap:10px; margin-top:16px;">
          ${
            isEditMode
              ? '<button class="bts" type="button" id="delete-diary-btn" data-diary-modal-action="delete-entry" style="margin:0; background-color: var(--delete-btn);">删除</button>'
              : ""
          }
        <div class="controler-form-modal-footer-actions" style="display:flex; gap:8px;">
          <button class="bts" type="button" id="cancel-diary-btn" data-diary-modal-action="cancel" style="margin:0;">取消</button>
          <button class="bts" type="button" id="save-diary-btn" data-diary-modal-action="save" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

  if (typeof uiTools?.prepareModalOverlay === "function") {
    uiTools.prepareModalOverlay(modal, {
      zIndex: 2200,
    });
    uiTools?.activateModalInteractionShield?.(180);
  } else {
    document.body.appendChild(modal);
    uiTools?.stopModalContentPropagation?.(modal);
  }

  const titleInput = modal.querySelector("#diary-title-input");
  const contentInput = modal.querySelector("#diary-content-input");
  if (titleInput) {
    titleInput.value = existing?.title || "";
  }
  if (contentInput) {
    contentInput.value = existing?.content || "";
  }

  let draftTimer = 0;
  let scheduleDraftSave = () => {};
  const categorySelector = createDiaryCategorySelector(
    modal.querySelector("#diary-category-selector"),
    existing?.categoryId || "",
    {
      onChange() {
        scheduleDraftSave();
      },
    },
  );

  const buildDiaryDraftPayload = () => ({
    dateText,
    entryId: activeEntryId,
    title: titleInput?.value || "",
    content: contentInput?.value || "",
    categoryId: categorySelector.getValue(),
  });
  const initialDiaryDraftSignature = JSON.stringify(buildDiaryDraftPayload());
  const persistDiaryDraft = async () => {
    if (!modal.isConnected || typeof window.ControlerStorage?.setDraft !== "function") {
      return;
    }
    const payload = buildDiaryDraftPayload();
    if (JSON.stringify(payload) === initialDiaryDraftSignature) {
      if (typeof window.ControlerStorage?.removeDraft === "function") {
        await window.ControlerStorage.removeDraft(diaryDraftKey);
      }
      return;
    }
    if (!payload.title.trim() && !payload.content.trim() && !payload.categoryId) {
      if (typeof window.ControlerStorage?.removeDraft === "function") {
        await window.ControlerStorage.removeDraft(diaryDraftKey);
      }
      return;
    }
    await window.ControlerStorage.setDraft(diaryDraftKey, payload, {
      scope: "diary",
    });
  };
  scheduleDraftSave = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      void persistDiaryDraft();
    }, DIARY_DRAFT_SAVE_DELAY_MS);
  };
  const handleDiaryDraftPageHide = () => {
    void persistDiaryDraft();
  };
  const handleDiaryDraftVisibilityChange = () => {
    if (document.hidden) {
      void persistDiaryDraft();
    }
  };
  window.addEventListener("pagehide", handleDiaryDraftPageHide);
  document.addEventListener(
    "visibilitychange",
    handleDiaryDraftVisibilityChange,
  );
  [titleInput, contentInput].forEach((input) => {
    input?.addEventListener("input", scheduleDraftSave);
    input?.addEventListener("change", scheduleDraftSave);
  });
  if (typeof window.ControlerStorage?.getDraft === "function") {
    void window.ControlerStorage
      .getDraft(diaryDraftKey, {
        includeEnvelope: true,
      })
      .then((draftEnvelope) => {
        const draftValue =
          draftEnvelope && typeof draftEnvelope === "object"
            ? Object.prototype.hasOwnProperty.call(draftEnvelope, "value")
              ? draftEnvelope.value
              : draftEnvelope
            : null;
        if (!draftValue || !modal.isConnected) {
          return;
        }
        if (titleInput && typeof draftValue.title === "string") {
          titleInput.value = draftValue.title;
        }
        if (contentInput && typeof draftValue.content === "string") {
          contentInput.value = draftValue.content;
        }
        if (typeof draftValue.categoryId === "string") {
          categorySelector.setValue(draftValue.categoryId);
        }
      })
      .catch((error) => {
        console.error("恢复日记草稿失败:", error);
      });
  }

  let unbindModalActions = () => {};
  const discardDiaryDraft = () => {
    if (typeof window.ControlerStorage?.removeDraft !== "function") {
      return;
    }
    void window.ControlerStorage.removeDraft(diaryDraftKey).catch((error) => {
      console.error("清理日记草稿失败:", error);
    });
  };
  const closeModal = (options = {}) => {
    window.clearTimeout(draftTimer);
    window.removeEventListener("pagehide", handleDiaryDraftPageHide);
    document.removeEventListener(
      "visibilitychange",
      handleDiaryDraftVisibilityChange,
    );
    unbindModalActions();
    categorySelector.destroy();
    if (typeof uiTools?.closeModal === "function") {
      const customCloseHandler = modal.__controlerCloseModal;
      modal.__controlerCloseModal = null;
      uiTools.closeModal(modal);
      if (customCloseHandler && modal.isConnected) {
        modal.__controlerCloseModal = customCloseHandler;
      }
    } else if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    if (options?.discardDraft === true) {
      discardDiaryDraft();
    }
  };
  modal.__controlerCloseModal = () =>
    closeModal({
      discardDraft: true,
    });

  const saveAction = async () => {
    const title = modal.querySelector("#diary-title-input").value.trim();
    const content = modal.querySelector("#diary-content-input").value.trim();
    const categoryId = categorySelector.getValue();

    if (!title && !content) {
      await showDiaryAlert("请至少输入标题或正文");
      return;
    }

    void commitDiaryLocalChange({
      applyChange: () => {
        if (existing) {
          existing.title = title || existing.title || "未命名日记";
          existing.content = content;
          existing.categoryId = categoryId;
          existing.updatedAt = new Date().toISOString();
        } else {
          const created = new DiaryEntry(
            dateText,
            title || "未命名日记",
            content,
            categoryId,
          );
          diaryEntries.push(created);
        }
        return {
          changedPeriodIds: [getDiaryEntryPeriodId(existing || { date: dateText })],
        };
      },
      beforeClose: async () => {
        if (typeof window.ControlerStorage?.removeDraft === "function") {
          await window.ControlerStorage.removeDraft(diaryDraftKey);
        }
      },
      closeModal,
      failureTitle: "保存失败",
      failureMessage: "保存日记失败，已恢复修改前内容。",
    });
  };

  const deleteBtn = modal.querySelector("#delete-diary-btn");
  const deleteAction = () => {
    if (!deleteBtn) {
      return;
    }
    void confirmDiaryModalDelete({
      confirmMessage: "确定删除该日记吗？",
      deleteOperation: () => {
        const targetEntry = findDiaryEntry(dateText, activeEntryId);
        if (!deleteDiaryEntry(activeEntryId, dateText)) {
          return false;
        }
        const previousGuideState = readDiaryGuideState();
        const nextGuideState =
          typeof window.ControlerGuideBundle?.dismissGuideDiaryEntry ===
          "function"
            ? window.ControlerGuideBundle.dismissGuideDiaryEntry(
                previousGuideState,
                targetEntry,
              )
            : previousGuideState;
        const guideStateChanged =
          JSON.stringify(nextGuideState) !== JSON.stringify(previousGuideState);
        if (guideStateChanged) {
          saveDiaryGuideState(nextGuideState);
        }
        return {
          changedPeriodIds: [getDiaryEntryPeriodId(targetEntry || { date: dateText })],
          guideStateChanged,
        };
      },
      beforeClose: async () => {
        if (typeof window.ControlerStorage?.removeDraft === "function") {
          await window.ControlerStorage.removeDraft(diaryDraftKey);
        }
      },
      notFoundMessage: "未找到要删除的日记",
      closeModal,
    });
  };

  unbindModalActions = bindDiaryModalActions(modal, {
    cancel: () =>
      closeModal({
        discardDraft: true,
      }),
    save: saveAction,
    "delete-entry": deleteAction,
  });

  if (typeof uiTools?.bindModalBackdropDismiss === "function") {
    uiTools.bindModalBackdropDismiss(modal, () => {
      closeModal({
        discardDraft: true,
      });
    });
  } else {
    modal.addEventListener("click", function (event) {
      if (event.target === this) {
        closeModal({
          discardDraft: true,
        });
      }
    });
  }
}

function showCategoryModal() {
  const defaultCategoryColor = "#4299E1";
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2200";

  const categoryListHtml = diaryCategories
    .map(
      (category) => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background: var(--bg-tertiary); border-radius:8px; padding:8px;">
        <div style="display:flex; align-items:center; gap:6px; color: var(--text-color);">
          <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${category.color};"></span>
          ${escapeHtml(category.name)}
        </div>
        <button class="bts diary-delete-category-btn" type="button" data-diary-modal-action="delete-category" data-category-id="${category.id}" style="margin:0; padding:5px 10px; background-color: var(--delete-btn);">删除</button>
      </div>
    `,
    )
    .join("");

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 22px; border-radius: 15px; max-width: 460px; width: 90%;">
      <h2 style="margin-top:0; color: var(--text-color); margin-bottom: 12px;">日记分类管理</h2>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 14px; max-height: 220px; overflow-y: auto;">
        ${categoryListHtml || '<div style="color:var(--muted-text-color);">暂无分类</div>'}
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 14px;">
        <input id="new-diary-category-name" type="text" placeholder="新分类名称" style="
          width:100%; padding:10px; border-radius:8px; border:1px solid var(--bg-tertiary);
          background-color: var(--bg-quaternary); color: var(--text-color);" autocomplete="off">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button class="bts" type="button" id="new-diary-category-color-trigger" style="margin:0; display:inline-flex; align-items:center; gap:8px; min-width:0;">
            <span id="new-diary-category-color-preview" aria-hidden="true" style="display:inline-block; width:16px; height:16px; border-radius:999px; background:${defaultCategoryColor}; box-shadow:0 0 0 1px rgba(255,255,255,0.16) inset;"></span>
            <span>选择颜色</span>
          </button>
          <input id="new-diary-category-color" type="text" class="time-input" value="${defaultCategoryColor}" placeholder="#4299E1 或 rgb(66, 153, 225)" autocomplete="off" spellcheck="false" style="flex:1 1 180px; min-width:180px;">
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="bts" type="button" id="cancel-diary-category-btn" data-diary-modal-action="cancel" style="margin:0;">取消</button>
        <button class="bts" type="button" id="save-diary-category-btn" data-diary-modal-action="save" style="margin:0;">保存</button>
      </div>
    </div>
  `;

  if (typeof uiTools?.prepareModalOverlay === "function") {
    uiTools.prepareModalOverlay(modal, {
      zIndex: 2200,
    });
    uiTools?.activateModalInteractionShield?.(180);
  } else {
    document.body.appendChild(modal);
    uiTools?.stopModalContentPropagation?.(modal);
  }

  const colorInput = modal.querySelector("#new-diary-category-color");
  const colorPreview = modal.querySelector("#new-diary-category-color-preview");
  const colorTrigger = modal.querySelector("#new-diary-category-color-trigger");
  const syncCategoryColorUi = (rawColor = "", { commit = false } = {}) => {
    const nextColor = toDiaryHexColor(rawColor, defaultCategoryColor);
    if (colorPreview instanceof HTMLElement) {
      colorPreview.style.background = nextColor;
    }
    if (colorTrigger instanceof HTMLElement) {
      colorTrigger.setAttribute("aria-label", `选择颜色，当前为 ${nextColor}`);
    }
    if (commit && colorInput instanceof HTMLInputElement) {
      colorInput.value = nextColor;
    }
    return nextColor;
  };
  syncCategoryColorUi(colorInput?.value || defaultCategoryColor, {
    commit: true,
  });
  colorInput?.addEventListener("input", () => {
    syncCategoryColorUi(colorInput.value);
  });
  colorInput?.addEventListener("change", () => {
    syncCategoryColorUi(colorInput.value, {
      commit: true,
    });
  });
  colorInput?.addEventListener("blur", () => {
    syncCategoryColorUi(colorInput.value, {
      commit: true,
    });
  });
  colorTrigger?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextColor = await uiTools?.showManagedColorPickerDialog?.({
      title: "选择颜色",
      initialColor: colorInput?.value || defaultCategoryColor,
      confirmText: "设置",
      cancelText: "取消",
      zIndex: 4600,
    });
    if (!nextColor || !(colorInput instanceof HTMLInputElement)) {
      return;
    }
    colorInput.value = toDiaryHexColor(nextColor, defaultCategoryColor);
    syncCategoryColorUi(colorInput.value, {
      commit: true,
    });
    colorInput.dispatchEvent(new Event("input", { bubbles: true }));
    colorInput.dispatchEvent(new Event("change", { bubbles: true }));
  });

  let unbindModalActions = () => {};
  const closeModal = () => {
    unbindModalActions();
    if (typeof uiTools?.closeModal === "function") {
      uiTools.closeModal(modal);
      return;
    }
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };

  const saveCategoryAction = async () => {
    const name = modal.querySelector("#new-diary-category-name").value.trim();
    const color = toDiaryHexColor(
      modal.querySelector("#new-diary-category-color").value,
      defaultCategoryColor,
    );
    if (!name) {
      await showDiaryAlert("请输入分类名称");
      return;
    }
    if (diaryCategories.some((category) => category.name === name)) {
      await showDiaryAlert("分类名称已存在");
      return;
    }

    void commitDiaryLocalChange({
      applyChange: () => {
        diaryCategories.push({
          id: createUniqueId("diary_category_"),
          name,
          color,
        });
        return {
          categoriesChanged: true,
        };
      },
      closeModal,
      failureTitle: "保存失败",
      failureMessage: "保存分类失败，已恢复修改前内容。",
    });
  };

  const deleteCategoryAction = (button) => {
    const categoryId = button?.dataset?.categoryId;
    if (!categoryId) {
      return;
    }

    void confirmDiaryModalDelete({
      confirmMessage: "确定删除该分类吗？相关日记将转为未分类。",
      deleteOperation: () => {
        const affectedPeriodIds = collectDiaryPersistPeriodIds(
          diaryEntries
            .filter((entry) => entry.categoryId === categoryId)
            .map((entry) => getDiaryEntryPeriodId(entry)),
        );
        const beforeLength = diaryCategories.length;
        diaryCategories = diaryCategories.filter(
          (category) => category.id !== categoryId,
        );
        if (diaryCategories.length === beforeLength) {
          return false;
        }

        diaryEntries.forEach((entry) => {
          if (entry.categoryId === categoryId) {
            entry.categoryId = "";
          }
        });
        return {
          changedPeriodIds: affectedPeriodIds,
          categoriesChanged: true,
        };
      },
      notFoundMessage: "未找到要删除的分类",
      closeModal,
      failureTitle: "删除失败",
      failureMessage: "删除分类失败，已恢复删除前内容。",
    });
  };

  unbindModalActions = bindDiaryModalActions(modal, {
    cancel: closeModal,
    save: saveCategoryAction,
    "delete-category": deleteCategoryAction,
  });

  if (typeof uiTools?.bindModalBackdropDismiss === "function") {
    uiTools.bindModalBackdropDismiss(modal, () => {
      closeModal();
    });
  } else {
    modal.addEventListener("click", function (event) {
      if (event.target === this) {
        closeModal();
      }
    });
  }
}

function isDiaryWidgetModalVisible() {
  const titleInput = document.getElementById("diary-title-input");
  const modal = titleInput?.closest?.(".modal-overlay");
  return (
    titleInput instanceof HTMLElement &&
    modal instanceof HTMLElement &&
    modal.parentNode === document.body &&
    modal.style.display !== "none"
  );
}

function clearDiaryWidgetLaunchQuery() {
  const params = new URLSearchParams(window.location.search);
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

function scheduleDiaryWidgetLaunchHandled(
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
      clearDiaryWidgetLaunchQuery();
    }
    if (!launchId || typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return true;
    }
    window.ControlerNativeBridge.emitEvent("widgets.launchHandled", {
      launchId,
      page: "diary",
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
    if (Date.now() - startedAt >= DIARY_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS) {
      return;
    }
    schedule(waitForHandled);
  };
  schedule(waitForHandled);
  return true;
}

function handleDiaryWidgetLaunchAction(payload = {}, options = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "new-diary") {
    return false;
  }
  diaryPendingWidgetLaunchAction = {
    action,
    source: payload?.source || "widget",
  };
  if (diaryInitialDataLoaded) {
    const pendingAction = diaryPendingWidgetLaunchAction;
    diaryPendingWidgetLaunchAction = null;
    if (pendingAction?.action === "new-diary") {
      showDiaryModal(formatDateInputValue(new Date()));
    }
  }
  scheduleDiaryWidgetLaunchHandled(
    payload,
    isDiaryWidgetModalVisible,
    options,
  );
  return true;
}

function flushDiaryPendingWidgetLaunchAction() {
  const pendingAction = diaryPendingWidgetLaunchAction;
  if (!pendingAction) {
    return false;
  }
  diaryPendingWidgetLaunchAction = null;
  if (pendingAction.action !== "new-diary") {
    return false;
  }
  showDiaryModal(formatDateInputValue(new Date()));
  return true;
}

function initDiaryWidgetLaunchAction() {
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
    handleDiaryWidgetLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
      launchId: params.get("widgetLaunchId") || "",
    }, {
      clearQuery: true,
    });
  };

  window.addEventListener(eventName, (event) => {
    handleDiaryWidgetLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}

async function init() {
  let lastCompactLayout = isCompactMobileLayout();

  applyDiaryDesktopWidgetMode();
  await waitForDiaryStorageReady();
  registerDiaryBeforePageLeaveGuard();
  bindDiaryShellVisibilityGate();
  bindDiaryExternalStorageRefresh();
  const bootstrappedFromSnapshot = bootstrapDiaryFromCachedSnapshot();
  let hydrationPromise = null;
  if (shouldDeferDiaryInitialHydration()) {
    diaryInitialHydrationPendingResume = true;
  } else {
    hydrationPromise = startDiaryInitialHydration({
      manageLoading: !bootstrappedFromSnapshot,
    });
  }
  initDiaryPeriodSelectors();
  initDiaryCategoryFilterSelector();
  initDiarySearchControls();
  initViewButtons();
  initDiaryWidgetLaunchAction();
  renderDiaryGuideCard();
  window.addEventListener("resize", () => {
    const nextCompactLayout = isCompactMobileLayout();
    if (nextCompactLayout !== lastCompactLayout) {
      lastCompactLayout = nextCompactLayout;
      renderCurrentView();
    }
  });
  try {
    if (hydrationPromise) {
      if (bootstrappedFromSnapshot) {
        void hydrationPromise.then((hydrated) => {
          if (hydrated !== false) {
            flushDiaryPendingWidgetLaunchAction();
          }
        });
      } else {
        const hydrated =
          await waitForDiaryInitialHydrationWithDeadline(hydrationPromise);
        if (hydrated !== false) {
          flushDiaryPendingWidgetLaunchAction();
        }
      }
    }
  } finally {
    if (diaryInitialDataValidated || bootstrappedFromSnapshot) {
      await queueDiaryInitialReveal();
    }
  }
  void ensureDiaryDeferredRuntimeLoaded();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init().catch((error) => {
      console.error("初始化日记页失败:", error);
    });
  });
} else {
  void init().catch((error) => {
    console.error("初始化日记页失败:", error);
  });
}


