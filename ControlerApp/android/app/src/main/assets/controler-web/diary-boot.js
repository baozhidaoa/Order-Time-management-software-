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
const DIARY_AUTOSAVE_DELAY_MS = 2400;
const DIARY_EDITOR_IMAGE_LONG_PRESS_MS = 320;
const DIARY_EDITOR_NATIVE_INPUT_RESTART_DELAY_MS = 24;
const DIARY_EDITOR_CLOSE_VISUAL_DURATION_MS = 216;
const DIARY_IMAGE_URI_CACHE_LIMIT = 96;
const DIARY_CONTENT_VERSION = 2;
const DIARY_LIST_PREVIEW_IMAGE_LIMIT = 2;
const DIARY_EDITOR_HIGHLIGHT_COLOR = "#FFE082";
const DIARY_EDITOR_TEXT_STYLE_TOKENS = Object.freeze({
  title: "title",
  subtitle: "subtitle",
  subheading: "subheading",
  body: "body",
  note: "note",
});
const DIARY_EDITOR_FONT_SCALE_MIN = -6;
const DIARY_EDITOR_FONT_SCALE_MAX = 12;
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
let diaryEditorRuntime = null;
const diaryImageUriCache = new Map();

function parseDiaryCssDurationMs(rawValue, fallbackMs = 0) {
  const normalizedValue = String(rawValue || "").trim();
  if (!normalizedValue) {
    return Math.max(0, Math.round(Number(fallbackMs) || 0));
  }
  const durationMatch = normalizedValue.match(/^(-?\d*\.?\d+)(ms|s)$/i);
  if (!durationMatch) {
    return Math.max(0, Math.round(Number(fallbackMs) || 0));
  }
  const numericValue = Number(durationMatch[1]);
  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.round(Number(fallbackMs) || 0));
  }
  const durationMs =
    String(durationMatch[2] || "").toLowerCase() === "s"
      ? numericValue * 1000
      : numericValue;
  return Math.max(0, Math.round(durationMs));
}

function readDiaryEditorCloseVisualDurationMs(overlay) {
  if (
    !(overlay instanceof HTMLElement) ||
    typeof window.getComputedStyle !== "function"
  ) {
    return DIARY_EDITOR_CLOSE_VISUAL_DURATION_MS;
  }
  const computedStyle = window.getComputedStyle(overlay);
  return parseDiaryCssDurationMs(
    computedStyle.getPropertyValue("--controler-diary-editor-close-duration"),
    DIARY_EDITOR_CLOSE_VISUAL_DURATION_MS,
  );
}
const diaryImageUriPendingRequests = new Map();
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
  constructor(date, title, content, categoryId = "", options = {}) {
    const normalizedContent =
      typeof content === "string" ? content : String(content ?? "");
    const normalizedRichText = sanitizeDiaryRichTextHtml(
      typeof options?.contentHtml === "string" && options.contentHtml.trim()
        ? options.contentHtml
        : createDiaryParagraphHtmlFromText(normalizedContent),
      {
        attachments: options?.attachments || [],
      },
    );
    this.id = createUniqueId("diary_");
    this.date = date;
    this.title = title || "未命名日记";
    this.content = extractDiaryPlainTextFromHtml(normalizedRichText.html);
    this.contentHtml = normalizedRichText.html;
    this.contentVersion = DIARY_CONTENT_VERSION;
    this.attachments = normalizedRichText.attachments;
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

function normalizeDiaryNumber(
  value,
  fallback,
  min,
  max,
  fractionDigits = 2,
) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return fallback;
  }
  const clampedValue = Math.min(max, Math.max(min, nextValue));
  return Number(clampedValue.toFixed(fractionDigits));
}

function normalizeDiaryFontSizeToken(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "title" || normalized === "h1") {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.title;
  }
  if (normalized === "subtitle" || normalized === "h2") {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.subtitle;
  }
  if (
    normalized === "subheading" ||
    normalized === "sub-title" ||
    normalized === "smalltitle" ||
    normalized === "h3" ||
    normalized === "large" ||
    normalized === "lg"
  ) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.subheading;
  }
  if (
    normalized === "body" ||
    normalized === "normal" ||
    normalized === "medium" ||
    normalized === "md"
  ) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  }
  if (
    normalized === "note" ||
    normalized === "caption" ||
    normalized === "small" ||
    normalized === "sm"
  ) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.note;
  }
  if (/^\d+(\.\d+)?px$/.test(normalized)) {
    const pixels = Number.parseFloat(normalized);
    if (pixels <= 13.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.note;
    }
    if (pixels <= 16.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
    }
    if (pixels <= 20.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.subheading;
    }
    if (pixels <= 26.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.subtitle;
    }
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.title;
  }
  const numericValue = Number.parseFloat(normalized);
  if (Number.isFinite(numericValue)) {
    if (numericValue <= 2.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.note;
    }
    if (numericValue <= 3.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
    }
    if (numericValue <= 4.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.subheading;
    }
    if (numericValue <= 5.5) {
      return DIARY_EDITOR_TEXT_STYLE_TOKENS.subtitle;
    }
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.title;
  }
  if (normalized.includes("title")) {
    return normalized.includes("sub")
      ? DIARY_EDITOR_TEXT_STYLE_TOKENS.subtitle
      : DIARY_EDITOR_TEXT_STYLE_TOKENS.title;
  }
  if (normalized.includes("heading")) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.subheading;
  }
  if (normalized.includes("caption") || normalized.includes("note")) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.note;
  }
  return "";
}

function normalizeDiaryFontScaleValue(value, fallback = 0) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return normalizeDiaryNumber(
      fallback,
      0,
      DIARY_EDITOR_FONT_SCALE_MIN,
      DIARY_EDITOR_FONT_SCALE_MAX,
      0,
    );
  }
  const numericValue = Number.parseFloat(normalized.replace(/px$/i, ""));
  if (!Number.isFinite(numericValue)) {
    return normalizeDiaryNumber(
      fallback,
      0,
      DIARY_EDITOR_FONT_SCALE_MIN,
      DIARY_EDITOR_FONT_SCALE_MAX,
      0,
    );
  }
  return normalizeDiaryNumber(
    numericValue,
    0,
    DIARY_EDITOR_FONT_SCALE_MIN,
    DIARY_EDITOR_FONT_SCALE_MAX,
    0,
  );
}

function normalizeDiaryListStyle(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "circle" || normalized === "square") {
    return normalized;
  }
  return "disc";
}

function normalizeDiaryAttachmentAlignment(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "left" || normalized === "right") {
    return normalized;
  }
  return "center";
}

function normalizeDiaryAttachmentCompressionMode(value) {
  return String(value ?? "").trim().toLowerCase() === "original"
    ? "original"
    : "compressed";
}

function normalizeDiaryAttachment(attachment, index = 0) {
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
    return null;
  }
  const assetId =
    typeof attachment.assetId === "string" ? attachment.assetId.trim() : "";
  if (!assetId) {
    return null;
  }
  const widthPercent = normalizeDiaryNumber(
    attachment.widthPercent,
    82,
    24,
    100,
  );
  const maxOffsetPercent = Number(((100 - widthPercent) / 2).toFixed(2));
  const offsetXPercent = normalizeDiaryNumber(
    attachment.offsetXPercent,
    0,
    -maxOffsetPercent,
    maxOffsetPercent,
  );
  const align =
    Math.abs(offsetXPercent) < 3
      ? "center"
      : offsetXPercent < 0
        ? "left"
        : "right";
  return {
    id:
      typeof attachment.id === "string" && attachment.id.trim()
        ? attachment.id.trim()
        : createUniqueId("diary_attachment_"),
    assetId,
    kind: "image",
    mimeType:
      typeof attachment.mimeType === "string" && attachment.mimeType.trim()
        ? attachment.mimeType.trim()
        : "image/jpeg",
    widthPercent,
    align: normalizeDiaryAttachmentAlignment(attachment.align || align),
    offsetXPercent,
    aspectRatio: normalizeDiaryNumber(
      attachment.aspectRatio,
      4 / 3,
      0.2,
      12,
      4,
    ),
    blockOrder: Number.isFinite(Number(attachment.blockOrder))
      ? Math.max(0, Math.round(Number(attachment.blockOrder)))
      : Math.max(0, index),
    compressionMode: normalizeDiaryAttachmentCompressionMode(
      attachment.compressionMode,
    ),
  };
}

function normalizeDiaryAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment, index) => normalizeDiaryAttachment(attachment, index))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.blockOrder !== right.blockOrder) {
        return left.blockOrder - right.blockOrder;
      }
      return String(left.id || "").localeCompare(String(right.id || ""));
    })
    .map((attachment, index) => ({
      ...attachment,
      blockOrder: index,
    }));
}

function cloneDiaryAttachmentsSnapshot(attachments = []) {
  return normalizeDiaryAttachments(attachments).map((attachment) => ({
    ...attachment,
  }));
}

function mergeDiaryAttachmentsSnapshot(...attachmentGroups) {
  const attachmentsByAssetId = new Map();
  attachmentGroups.flat().forEach((attachment) => {
    const normalizedAttachment = normalizeDiaryAttachment(attachment);
    if (!normalizedAttachment?.assetId) {
      return;
    }
    const existingAttachment = attachmentsByAssetId.get(normalizedAttachment.assetId);
    attachmentsByAssetId.set(normalizedAttachment.assetId, {
      ...existingAttachment,
      ...normalizedAttachment,
      id: normalizedAttachment.id || existingAttachment?.id || "",
      assetId: normalizedAttachment.assetId,
    });
  });
  return normalizeDiaryAttachments(Array.from(attachmentsByAssetId.values()));
}

function hasDiaryAttachmentReferenceRemoval(
  previousAttachments = [],
  nextAttachments = [],
) {
  const previousAssetIds = new Set(
    cloneDiaryAttachmentsSnapshot(previousAttachments)
      .map((attachment) => String(attachment?.assetId || "").trim())
      .filter(Boolean),
  );
  if (!previousAssetIds.size) {
    return false;
  }
  const nextAssetIds = new Set(
    cloneDiaryAttachmentsSnapshot(nextAttachments)
      .map((attachment) => String(attachment?.assetId || "").trim())
      .filter(Boolean),
  );
  for (const assetId of previousAssetIds) {
    if (!nextAssetIds.has(assetId)) {
      return true;
    }
  }
  return false;
}

function createDiaryParagraphHtmlFromText(text) {
  const normalized = String(text ?? "").replace(/\r/g, "");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const inlineHtml = block
        .split(/\n/)
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p>${inlineHtml || "<br>"}</p>`;
    });
  return blocks.length ? blocks.join("") : "<p><br></p>";
}

function getDiaryNodeStyleState(node, tagName = "") {
  const styleText =
    node && node.nodeType === Node.ELEMENT_NODE && node.getAttribute("style")
      ? String(node.getAttribute("style"))
      : "";
  const backgroundColorMatch = styleText.match(/background-color\s*:\s*([^;]+)/i);
  const fontSizeMatch = styleText.match(/font-size\s*:\s*([^;]+)/i);
  const fontScaleMatch = styleText.match(/--diary-inline-font-scale\s*:\s*([^;]+)/i);
  const fontWeightMatch = styleText.match(/font-weight\s*:\s*([^;]+)/i);
  const fontStyleMatch = styleText.match(/font-style\s*:\s*([^;]+)/i);
  const textDecorationMatch = styleText.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/i);
  const backgroundColor = backgroundColorMatch ? backgroundColorMatch[1].trim() : "";
  const fontSize = fontSizeMatch ? fontSizeMatch[1].trim() : "";
  const fontScale = normalizeDiaryFontScaleValue(
    node?.getAttribute?.("data-font-scale") || fontScaleMatch?.[1] || "",
    0,
  );
  const fontWeight = fontWeightMatch ? fontWeightMatch[1].trim().toLowerCase() : "";
  const fontStyle = fontStyleMatch ? fontStyleMatch[1].trim().toLowerCase() : "";
  const textDecoration = textDecorationMatch
    ? textDecorationMatch[1].trim().toLowerCase()
    : "";
  const sizeToken = normalizeDiaryFontSizeToken(
    node?.getAttribute?.("data-size") ||
      node?.getAttribute?.("size") ||
      fontSize ||
      "",
  );
  return {
    sizeToken,
    fontScale,
    highlight:
      tagName === "mark" ||
      (!!backgroundColor &&
        !backgroundColor.includes("transparent") &&
        !backgroundColor.includes("rgba(0, 0, 0, 0)")),
    bold:
      tagName === "strong" ||
      tagName === "b" ||
      fontWeight === "bold" ||
      /^[6-9]00$/.test(fontWeight),
    italic: tagName === "em" || tagName === "i" || fontStyle === "italic",
    underline:
      tagName === "u" ||
      textDecoration.includes("underline"),
  };
}

function wrapDiaryInlineHtml(html, tagName, attributes = "") {
  const nextHtml = String(html ?? "");
  if (!nextHtml) {
    return "";
  }
  const normalizedAttributes =
    typeof attributes === "string" && attributes.trim() ? ` ${attributes.trim()}` : "";
  return `<${tagName}${normalizedAttributes}>${nextHtml}</${tagName}>`;
}

function buildDiaryAttachmentHtml(attachment) {
  return `
    <figure
      class="diary-image-block"
      data-kind="image"
      data-attachment-id="${escapeHtml(attachment.id)}"
      data-asset-id="${escapeHtml(attachment.assetId)}"
      data-width-percent="${escapeHtml(attachment.widthPercent)}"
      data-align="${escapeHtml(attachment.align)}"
      data-offset-x-percent="${escapeHtml(attachment.offsetXPercent)}"
      data-aspect-ratio="${escapeHtml(attachment.aspectRatio)}"
      data-block-order="${escapeHtml(attachment.blockOrder)}"
      data-compression-mode="${escapeHtml(attachment.compressionMode)}"
      contenteditable="false"
      tabindex="0"
    >
      <img
        alt="日记图片"
        data-asset-id="${escapeHtml(attachment.assetId)}"
        draggable="false"
      >
    </figure>
  `.replace(/\s*\n\s*/g, "");
}

function sanitizeDiaryInlineNodes(nodes, context) {
  return Array.from(nodes || [])
    .map((node) => sanitizeDiaryInlineNode(node, context))
    .join("");
}

function sanitizeDiaryInlineNode(node, context) {
  if (!node) {
    return "";
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent || "").replace(/\r?\n/g, "<br>");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const tagName = String(node.tagName || "").toLowerCase();
  if (tagName === "br") {
    return "<br>";
  }
  if (tagName === "figure" || tagName === "img") {
    return "";
  }
  let childHtml = sanitizeDiaryInlineNodes(node.childNodes, context);
  const styleState = getDiaryNodeStyleState(node, tagName);
  if (styleState.fontScale !== 0) {
    childHtml = wrapDiaryInlineHtml(
      childHtml,
      "span",
      `data-font-scale="${escapeHtml(styleState.fontScale)}"`,
    );
  }
  if (styleState.sizeToken) {
    childHtml = wrapDiaryInlineHtml(
      childHtml,
      "span",
      `data-size="${escapeHtml(styleState.sizeToken)}"`,
    );
  }
  if (styleState.highlight) {
    childHtml = wrapDiaryInlineHtml(childHtml, "mark");
  }
  if (styleState.bold) {
    childHtml = wrapDiaryInlineHtml(childHtml, "strong");
  }
  if (styleState.italic) {
    childHtml = wrapDiaryInlineHtml(childHtml, "em");
  }
  if (styleState.underline) {
    childHtml = wrapDiaryInlineHtml(childHtml, "u");
  }
  return childHtml;
}

function extractDiaryAttachmentFromNode(node, context) {
  const tagName = String(node?.tagName || "").toLowerCase();
  const imageElement =
    tagName === "img"
      ? node
      : node && typeof node.querySelector === "function"
        ? node.querySelector("img[data-asset-id], img")
        : null;
  const attachmentId =
    typeof node?.dataset?.attachmentId === "string"
      ? node.dataset.attachmentId.trim()
      : "";
  const assetId =
    (typeof node?.dataset?.assetId === "string"
      ? node.dataset.assetId.trim()
      : "") ||
    (typeof imageElement?.dataset?.assetId === "string"
      ? imageElement.dataset.assetId.trim()
      : "");
  if (!assetId) {
    return null;
  }
  const fallback =
    context?.fallbackAttachmentsById?.get(attachmentId) ||
    context?.fallbackAttachmentsByAssetId?.get(assetId) ||
    null;
  return normalizeDiaryAttachment(
    {
      ...fallback,
      id: attachmentId || fallback?.id,
      assetId,
      mimeType:
        typeof node?.dataset?.mimeType === "string"
          ? node.dataset.mimeType.trim()
          : fallback?.mimeType,
      widthPercent:
        typeof node?.dataset?.widthPercent === "string"
          ? node.dataset.widthPercent
          : fallback?.widthPercent,
      align:
        typeof node?.dataset?.align === "string"
          ? node.dataset.align
          : fallback?.align,
      offsetXPercent:
        typeof node?.dataset?.offsetXPercent === "string"
          ? node.dataset.offsetXPercent
          : fallback?.offsetXPercent,
      aspectRatio:
        typeof node?.dataset?.aspectRatio === "string"
          ? node.dataset.aspectRatio
          : fallback?.aspectRatio,
      blockOrder:
        typeof node?.dataset?.blockOrder === "string"
          ? node.dataset.blockOrder
          : fallback?.blockOrder,
      compressionMode:
        typeof node?.dataset?.compressionMode === "string"
          ? node.dataset.compressionMode
          : fallback?.compressionMode,
    },
    context?.nextAttachments?.length || 0,
  );
}

function sanitizeDiaryListItemHtml(node, context) {
  const blocks = sanitizeDiaryBlockNodes(node?.childNodes || [], context);
  if (!blocks.length) {
    return "<li><br></li>";
  }
  return `<li>${blocks.join("")}</li>`;
}

function sanitizeDiaryListHtml(node, listTag, context) {
  const itemHtml = Array.from(node?.children || [])
    .filter((child) => String(child?.tagName || "").toLowerCase() === "li")
    .map((child) => sanitizeDiaryListItemHtml(child, context))
    .filter(Boolean);
  if (!itemHtml.length) {
    const fallbackInlineHtml = sanitizeDiaryInlineNodes(node?.childNodes || [], context);
    if (fallbackInlineHtml) {
      itemHtml.push(`<li>${fallbackInlineHtml}</li>`);
    }
  }
  if (!itemHtml.length) {
    itemHtml.push("<li><br></li>");
  }
  if (listTag === "ul") {
    const listStyle = normalizeDiaryListStyle(
      node?.dataset?.listStyle ||
        node?.style?.listStyleType ||
        node?.getAttribute?.("type") ||
        "",
    );
    return `<ul data-list-style="${escapeHtml(listStyle)}">${itemHtml.join("")}</ul>`;
  }
  return `<ol>${itemHtml.join("")}</ol>`;
}

function sanitizeDiaryBlockNodes(nodes, context) {
  const blocks = [];
  let inlineBuffer = "";
  const flushInlineBuffer = () => {
    const normalizedInline = String(inlineBuffer || "")
      .replace(/(?:<br>\s*){3,}/g, "<br><br>")
      .trim();
    if (normalizedInline) {
      blocks.push(`<p>${normalizedInline}</p>`);
    }
    inlineBuffer = "";
  };

  Array.from(nodes || []).forEach((node) => {
    const result = sanitizeDiaryBlockNode(node, context);
    if (result.type === "inline") {
      inlineBuffer += result.html;
      return;
    }
    flushInlineBuffer();
    blocks.push(...result.blocks);
  });

  flushInlineBuffer();
  return blocks.filter(Boolean);
}

function sanitizeDiaryBlockNode(node, context) {
  if (!node) {
    return { type: "inline", html: "", blocks: [] };
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return {
      type: "inline",
      html: escapeHtml(node.textContent || "").replace(/\r?\n/g, "<br>"),
      blocks: [],
    };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return { type: "inline", html: "", blocks: [] };
  }
  const tagName = String(node.tagName || "").toLowerCase();
  if (tagName === "br") {
    return { type: "inline", html: "<br>", blocks: [] };
  }
  if (tagName === "figure" || tagName === "img") {
    const attachment = extractDiaryAttachmentFromNode(node, context);
    if (!attachment) {
      return { type: "inline", html: "", blocks: [] };
    }
    context?.usedAttachmentIds?.add(attachment.id);
    context?.usedAttachmentAssetIds?.add(attachment.assetId);
    context?.nextAttachments?.push(attachment);
    return {
      type: "block",
      html: "",
      blocks: [buildDiaryAttachmentHtml(attachment)],
    };
  }
  if (tagName === "ul" || tagName === "ol") {
    return {
      type: "block",
      html: "",
      blocks: [sanitizeDiaryListHtml(node, tagName, context)],
    };
  }
  if (tagName === "blockquote") {
    const quoteBlocks = sanitizeDiaryBlockNodes(node.childNodes, context);
    return {
      type: "block",
      html: "",
      blocks: [
        `<blockquote>${quoteBlocks.length ? quoteBlocks.join("") : "<p><br></p>"}</blockquote>`,
      ],
    };
  }
  if (
    tagName === "p" ||
    tagName === "div" ||
    tagName === "section" ||
    tagName === "article"
  ) {
    const nestedBlocks = sanitizeDiaryBlockNodes(node.childNodes, context);
    return {
      type: "block",
      html: "",
      blocks: nestedBlocks.length ? nestedBlocks : ["<p><br></p>"],
    };
  }
  return {
    type: "inline",
    html: sanitizeDiaryInlineNode(node, context),
    blocks: [],
  };
}

function sanitizeDiaryRichTextHtml(html, options = {}) {
  const container = document.createElement("div");
  container.innerHTML =
    typeof html === "string" && html.trim()
      ? html
      : createDiaryParagraphHtmlFromText("");
  const fallbackAttachments = normalizeDiaryAttachments(options.attachments || []);
  const context = {
    fallbackAttachmentsById: new Map(
      fallbackAttachments.map((attachment) => [attachment.id, attachment]),
    ),
    fallbackAttachmentsByAssetId: new Map(
      fallbackAttachments.map((attachment) => [attachment.assetId, attachment]),
    ),
    nextAttachments: [],
    usedAttachmentIds: new Set(),
    usedAttachmentAssetIds: new Set(),
  };
  const blocks = sanitizeDiaryBlockNodes(container.childNodes, context);
  fallbackAttachments.forEach((attachment) => {
    if (
      context.usedAttachmentIds.has(attachment.id) ||
      context.usedAttachmentAssetIds.has(attachment.assetId)
    ) {
      return;
    }
    const normalizedAttachment = normalizeDiaryAttachment(
      attachment,
      context.nextAttachments.length,
    );
    if (!normalizedAttachment) {
      return;
    }
    context.nextAttachments.push(normalizedAttachment);
    blocks.push(buildDiaryAttachmentHtml(normalizedAttachment));
  });
  const normalizedAttachments = context.nextAttachments.map((attachment, index) =>
    normalizeDiaryAttachment(
      {
        ...attachment,
        blockOrder: index,
      },
      index,
    ),
  );
  const normalizedHtml = (blocks.length ? blocks.join("") : "<p><br></p>").trim();
  return {
    html: normalizedHtml || "<p><br></p>",
    attachments: normalizedAttachments.filter(Boolean),
  };
}

function extractDiaryPlainTextFromHtml(html = "") {
  const container = document.createElement("div");
  container.innerHTML = typeof html === "string" ? html : "";
  const rawText = String(container.innerText || container.textContent || "");
  return rawText
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripDiaryImagesFromHtml(html = "") {
  const container = document.createElement("div");
  container.innerHTML = typeof html === "string" ? html : "";
  container
    .querySelectorAll(".diary-image-block, figure[data-kind=\"image\"], img[data-asset-id]")
    .forEach((node) => {
      if (
        node instanceof HTMLElement &&
        node.tagName &&
        node.tagName.toLowerCase() === "img" &&
        node.parentElement?.classList?.contains("diary-image-block")
      ) {
        return;
      }
      node.remove();
    });
  return container.innerHTML.trim();
}

function collectDiaryEntryAttachmentAssetIds(entry = null) {
  return normalizeDiaryAttachments(entry?.attachments || [])
    .map((attachment) => attachment.assetId)
    .filter(Boolean);
}

function collectDiaryReferencedAssetIds(entries = []) {
  return Array.from(
    new Set(
      (Array.isArray(entries) ? entries : []).flatMap((entry) =>
        collectDiaryEntryAttachmentAssetIds(entry),
      ),
    ),
  );
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
  const richText = sanitizeDiaryRichTextHtml(
    typeof entry.contentHtml === "string" && entry.contentHtml.trim()
      ? entry.contentHtml
      : createDiaryParagraphHtmlFromText(content),
    {
      attachments: entry.attachments || [],
    },
  );
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
    content: extractDiaryPlainTextFromHtml(richText.html),
    contentHtml: richText.html,
    contentVersion: DIARY_CONTENT_VERSION,
    attachments: richText.attachments,
    categoryId,
    createdAt,
    updatedAt,
  };

  const changed =
    normalizedEntry.id !== entry.id ||
    normalizedEntry.date !== entry.date ||
    normalizedEntry.title !== entry.title ||
    normalizedEntry.content !== entry.content ||
    normalizedEntry.contentHtml !== entry.contentHtml ||
    normalizedEntry.contentVersion !== entry.contentVersion ||
    !isDiarySerializableEqual(normalizedEntry.attachments, entry.attachments || []) ||
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

function escapeCssSelector(value) {
  const text = String(value ?? "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(text);
  }
  return text.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function rememberDiaryImageUriCache(assetId, uri) {
  const normalizedAssetId = String(assetId || "").trim();
  const normalizedUri = typeof uri === "string" ? uri.trim() : "";
  if (!normalizedAssetId || !normalizedUri) {
    return normalizedUri;
  }
  if (diaryImageUriCache.has(normalizedAssetId)) {
    diaryImageUriCache.delete(normalizedAssetId);
  }
  diaryImageUriCache.set(normalizedAssetId, normalizedUri);
  while (diaryImageUriCache.size > DIARY_IMAGE_URI_CACHE_LIMIT) {
    const oldestKey = diaryImageUriCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    diaryImageUriCache.delete(oldestKey);
  }
  return normalizedUri;
}

function removeDiaryImageUriCacheEntry(assetId) {
  const normalizedAssetId = String(assetId || "").trim();
  if (!normalizedAssetId) {
    return;
  }
  diaryImageUriCache.delete(normalizedAssetId);
  diaryImageUriPendingRequests.delete(normalizedAssetId);
}

async function resolveDiaryImageUriCached(assetId) {
  const normalizedAssetId = String(assetId || "").trim();
  if (!normalizedAssetId) {
    return null;
  }
  if (diaryImageUriCache.has(normalizedAssetId)) {
    const cachedUri = diaryImageUriCache.get(normalizedAssetId);
    rememberDiaryImageUriCache(normalizedAssetId, cachedUri);
    return {
      assetId: normalizedAssetId,
      uri: cachedUri,
    };
  }
  if (diaryImageUriPendingRequests.has(normalizedAssetId)) {
    return diaryImageUriPendingRequests.get(normalizedAssetId);
  }
  const resolveTask = Promise.resolve(
    window.ControlerStorage?.resolveDiaryImageUri?.({
      assetId: normalizedAssetId,
    }),
  )
    .then((result) => {
      if (result?.uri) {
        rememberDiaryImageUriCache(normalizedAssetId, result.uri);
      }
      return result && typeof result === "object"
        ? result
        : {
            assetId: normalizedAssetId,
            uri: "",
          };
    })
    .catch((error) => {
      console.error("解析日记图片资源失败:", error);
      return null;
    })
    .finally(() => {
      diaryImageUriPendingRequests.delete(normalizedAssetId);
    });
  diaryImageUriPendingRequests.set(normalizedAssetId, resolveTask);
  return resolveTask;
}

let diaryImageHydrationObserver = null;

function getDiaryImageHydrationObserver() {
  if (diaryImageHydrationObserver) {
    return diaryImageHydrationObserver;
  }
  if (typeof IntersectionObserver !== "function") {
    return null;
  }
  diaryImageHydrationObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        diaryImageHydrationObserver?.unobserve(entry.target);
        void hydrateDiaryImageElement(entry.target);
      });
    },
    {
      rootMargin: "220px 0px",
      threshold: 0.01,
    },
  );
  return diaryImageHydrationObserver;
}

async function hydrateDiaryImageElement(target) {
  if (!(target instanceof HTMLImageElement)) {
    return false;
  }
  const assetId = String(target.dataset.assetId || "").trim();
  if (!assetId || target.dataset.hydrated === "true") {
    return !!target.src;
  }
  const resolved = await resolveDiaryImageUriCached(assetId);
  if (!target.isConnected) {
    return false;
  }
  if (resolved?.uri) {
    target.src = resolved.uri;
    target.dataset.hydrated = "true";
    return true;
  }
  target.removeAttribute("src");
  target.dataset.hydrated = "false";
  return false;
}

function queueDiaryImageHydration(target) {
  if (!(target instanceof HTMLImageElement)) {
    return;
  }
  const assetId = String(target.dataset.assetId || "").trim();
  if (!assetId) {
    return;
  }
  if (diaryImageUriCache.has(assetId)) {
    target.src = rememberDiaryImageUriCache(assetId, diaryImageUriCache.get(assetId));
    target.dataset.hydrated = "true";
    return;
  }
  const observer = getDiaryImageHydrationObserver();
  if (observer) {
    observer.observe(target);
    return;
  }
  void hydrateDiaryImageElement(target);
}

function applyDiaryFigureLayout(figure) {
  if (!(figure instanceof HTMLElement)) {
    return null;
  }
  const widthPercent = normalizeDiaryNumber(figure.dataset.widthPercent, 82, 24, 100);
  const maxOffsetPercent = Number(((100 - widthPercent) / 2).toFixed(2));
  const offsetXPercent = normalizeDiaryNumber(
    figure.dataset.offsetXPercent,
    0,
    -maxOffsetPercent,
    maxOffsetPercent,
  );
  const align =
    Math.abs(offsetXPercent) < 3
      ? "center"
      : offsetXPercent < 0
        ? "left"
        : "right";
  const aspectRatio = normalizeDiaryNumber(
    figure.dataset.aspectRatio,
    4 / 3,
    0.2,
    12,
    4,
  );
  figure.dataset.widthPercent = String(widthPercent);
  figure.dataset.offsetXPercent = String(offsetXPercent);
  figure.dataset.align = align;
  figure.dataset.aspectRatio = String(aspectRatio);
  figure.style.setProperty("--diary-image-width-percent", `${widthPercent}%`);
  figure.style.setProperty("--diary-image-offset-percent", `${offsetXPercent}%`);
  figure.style.setProperty("--diary-image-aspect-ratio", String(aspectRatio));
  return {
    widthPercent,
    offsetXPercent,
    aspectRatio,
    align,
  };
}

function resolveDiaryInsertedImageWidthPercent(runtime, aspectRatio) {
  const normalizedAspectRatio = normalizeDiaryNumber(
    aspectRatio,
    4 / 3,
    0.2,
    12,
    4,
  );
  const editorWidth = Math.max(
    1,
    Number(runtime?.elements?.editor?.clientWidth) ||
      Number(document.documentElement?.clientWidth) ||
      Number(window.innerWidth) ||
      360,
  );
  const viewportHeight = Math.max(
    240,
    Number(window.visualViewport?.height) ||
      Number(window.innerHeight) ||
      Number(document.documentElement?.clientHeight) ||
      720,
  );
  const targetHeightPx = Math.max(
    132,
    Math.min(Math.round(viewportHeight * 0.33), 288),
  );
  return normalizeDiaryNumber(
    ((targetHeightPx * normalizedAspectRatio) / editorWidth) * 100,
    82,
    28,
    82,
  );
}

function syncDiaryFigureElementsLayout(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container
    .querySelectorAll(".diary-image-block")
    .forEach((figure) => applyDiaryFigureLayout(figure));
  container
    .querySelectorAll("img[data-asset-id]")
    .forEach((image) => queueDiaryImageHydration(image));
}

async function pruneDiaryImageAssets(entries = diaryEntries) {
  if (typeof window.ControlerStorage?.deleteDiaryImageAssets !== "function") {
    return {
      deletedAssetIds: [],
      remainingAssetCount: 0,
    };
  }
  const storageDump =
    typeof window.ControlerStorage?.dump === "function"
      ? window.ControlerStorage.dump()
      : null;
  const existingAssetIds = Array.isArray(storageDump?.diaryMediaAssets)
    ? storageDump.diaryMediaAssets
        .map((asset) => String(asset?.assetId || "").trim())
        .filter(Boolean)
    : [];
  if (!existingAssetIds.length) {
    return {
      deletedAssetIds: [],
      remainingAssetCount: 0,
    };
  }
  const referencedAssetIdSet = new Set(collectDiaryReferencedAssetIds(entries));
  const staleAssetIds = existingAssetIds.filter(
    (assetId) => !referencedAssetIdSet.has(assetId),
  );
  if (!staleAssetIds.length) {
    return {
      deletedAssetIds: [],
      remainingAssetCount: existingAssetIds.length,
    };
  }
  const result = await window.ControlerStorage.deleteDiaryImageAssets({
    assetIds: staleAssetIds,
  });
  staleAssetIds.forEach((assetId) => removeDiaryImageUriCacheEntry(assetId));
  return result && typeof result === "object"
    ? result
    : {
        deletedAssetIds: staleAssetIds,
        remainingAssetCount: Math.max(0, existingAssetIds.length - staleAssetIds.length),
      };
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
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          return {
            ...entry,
            attachments: cloneDiaryAttachmentsSnapshot(entry.attachments || []),
          };
        })
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

function shouldWriteDiaryFallbackSnapshot(options = {}) {
  if (options.force === true) {
    return true;
  }
  return window.ControlerStorage?.isNativeApp !== true;
}

function persistDiaryFallbackSnapshot(options = {}) {
  if (!shouldWriteDiaryFallbackSnapshot(options)) {
    return true;
  }
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

function waitForDiaryRenderFrames(frameCount = 2) {
  const safeFrameCount = Math.max(1, Math.round(Number(frameCount) || 2));
  const schedule =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  return new Promise((resolve) => {
    let remaining = safeFrameCount;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve(true);
        return;
      }
      schedule(step);
    };
    schedule(step);
  });
}

function renderDiaryVisibleView(options = {}) {
  if (options.includeGuideCard !== false) {
    renderDiaryGuideCard();
  }
  renderCurrentView();
}

async function refreshDiaryVisibleView(options = {}) {
  const includeGuideCard = options.includeGuideCard !== false;
  renderDiaryVisibleView({
    includeGuideCard,
  });
  await waitForDiaryRenderFrames(options.frameCount);
  renderDiaryVisibleView({
    includeGuideCard,
  });
  if (options.waitForSettled === false) {
    return true;
  }
  await Promise.resolve(
    uiTools?.waitForVisualContentStability?.({
      root: options.root || ".diary-main",
      quietWindowMs: options.quietWindowMs,
      maxWaitMs: options.maxWaitMs,
      minQuietFrames: options.minQuietFrames,
    }),
  ).catch(() => false);
  return true;
}

function registerDiaryBeforePageLeaveGuard() {
  if (diaryBeforePageLeaveGuardBound) {
    return;
  }
  diaryBeforePageLeaveGuardBound = true;
  uiTools?.registerBeforePageLeave?.(async () => {
    if (
      diaryEditorRuntime?.root instanceof HTMLElement &&
      diaryEditorRuntime.root.isConnected &&
      typeof diaryEditorRuntime?.close === "function"
    ) {
      const closed = await diaryEditorRuntime.close({
        reason: "page-leave",
      });
      if (closed === false) {
        return false;
      }
    }
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

  const persistMeta = normalizeDiarySaveOptions(applyResult);
  syncDiaryDataIndex();
  const isDeleteMutation = failureTitle === "删除失败";
  const perfAction = isDeleteMutation ? "diary-delete" : "diary-save";
  const loadingDelayMs = isDeleteMutation
    ? 0
    : (
        uiTools?.getBlockingMutationOverlayDelayMs?.({
          mode: "fullscreen",
        }) ?? 1200
      );
  uiTools?.markPerfStage?.("diary-form-save-start", {
    allowRepeat: true,
    action: perfAction,
  });
  const showLoadingTask = isDeleteMutation
    ? showDiaryDeleteLoadingState()
    : setDiaryLoadingState({
        active: true,
        mode: "fullscreen",
        title: "正在保存日记",
        message: "正在写入日记与分类数据，请稍候",
        delayMs: loadingDelayMs,
      });
  if (isDeleteMutation) {
    await showLoadingTask;
  }
  const saveTask = saveDiaryData(persistMeta);
  try {
    if (typeof closeModal === "function") {
      closeModal();
    }
    await refreshDiaryVisibleView({
      includeGuideCard: true,
      root: ".diary-main",
      quietWindowMs: 72,
      maxWaitMs: 520,
      minQuietFrames: 3,
    });
    uiTools?.markPerfStage?.("diary-form-modal-hidden", {
      allowRepeat: true,
      action: perfAction,
    });
  } catch (error) {
    await Promise.resolve(saveTask).catch(() => false);
    await setDiaryLoadingState({
      active: false,
      settledRoot: ".diary-main",
      settleQuietWindowMs: 72,
      settleMaxWaitMs: 520,
      settleMinQuietFrames: 3,
    });
    throw error;
  }
  const saved = await saveTask;
  if (saved) {
    await refreshDiaryVisibleView({
      includeGuideCard: true,
      root: ".diary-main",
      quietWindowMs: 72,
      maxWaitMs: 520,
      minQuietFrames: 3,
    });
    await setDiaryLoadingState({
      active: false,
      settledRoot: ".diary-main",
      settleQuietWindowMs: 72,
      settleMaxWaitMs: 520,
      settleMinQuietFrames: 3,
    });
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
  await refreshDiaryVisibleView({
    includeGuideCard: true,
    root: ".diary-main",
    quietWindowMs: 72,
    maxWaitMs: 520,
    minQuietFrames: 3,
  });
  await setDiaryLoadingState({
    active: false,
    settledRoot: ".diary-main",
    settleQuietWindowMs: 72,
    settleMaxWaitMs: 520,
    settleMinQuietFrames: 3,
  });
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
    delegateToNative = undefined,
    message =
      mode === "fullscreen"
        ? "正在读取当前月份的日记与分类，请稍候"
        : "正在更新当前月份的日记数据，请稍候",
    settledRoot = undefined,
    settleQuietWindowMs = undefined,
    settleMaxWaitMs = undefined,
    settleMinQuietFrames = undefined,
    waitForSettledContent = undefined,
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
    delegateToNative,
    settledRoot,
    settleQuietWindowMs,
    settleMaxWaitMs,
    settleMinQuietFrames,
    waitForSettledContent,
  });
}

function showDiaryDeleteLoadingState(options = {}) {
  return setDiaryLoadingState({
    active: true,
    mode: "fullscreen",
    title: "正在删除日记",
    message: "正在同步删除日记数据，请稍候",
    delayMs: 0,
    delegateToNative: false,
    ...options,
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
      fresh: options.fresh === true,
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
        fresh: options.fresh === true,
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

function normalizeDiarySaveOptions(value = {}) {
  const persistMeta = normalizeDiaryPersistMeta(value);
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...persistMeta,
    pruneDiaryImages: source.pruneDiaryImages === true,
    writeFallbackSnapshot: source.writeFallbackSnapshot !== false,
  };
}

function saveDiaryData(options = {}) {
  const persistMeta = normalizeDiarySaveOptions(options);
  return trackDiaryPersistenceTask((async () => {
    const changedPeriodIds = persistMeta.changedPeriodIds;
    const categoriesChanged = persistMeta.categoriesChanged;
    const guideStateChanged = persistMeta.guideStateChanged;
    const pruneDiaryImages = persistMeta.pruneDiaryImages === true;
    const writeFallbackSnapshot = persistMeta.writeFallbackSnapshot !== false;
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
        if (pruneDiaryImages && changedPeriodIds.length > 0) {
          try {
            await pruneDiaryImageAssets(diaryEntries);
          } catch (cleanupError) {
            console.error("清理未引用日记图片资源失败:", cleanupError);
          }
        }
        if (writeFallbackSnapshot) {
          persistDiaryFallbackSnapshot();
        }
        return true;
      }

      return writeFallbackSnapshot ? persistDiaryFallbackSnapshot() : true;
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
      beforeConfirmClose:
        typeof options.beforeConfirmClose === "function"
          ? options.beforeConfirmClose
          : null,
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
  return {
    minYear: 2000,
    maxYear: new Date().getFullYear(),
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

    const resolvePickerValue = (value) => {
      const numericValue = Number(value);
      return normalizedValues.includes(numericValue)
        ? numericValue
        : normalizedValues[0];
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
  if (!(yearSelect instanceof HTMLSelectElement) || !(monthSelect instanceof HTMLSelectElement)) {
    return;
  }

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const yearOptions = getDiaryYearsForSelector();
  yearSelect.innerHTML = yearOptions
    .map((year) => `<option value="${year}">${year}年</option>`)
    .join("");
  monthSelect.innerHTML = Array.from(
    { length: 12 },
    (_, index) => `<option value="${index + 1}">${index + 1}月</option>`,
  ).join("");
  yearSelect.value = String(currentYear);
  monthSelect.value = String(currentMonth);
  yearSelect.setAttribute("aria-label", `年份，当前 ${currentYear} 年`);
  monthSelect.setAttribute("aria-label", `月份，当前 ${currentMonth} 月`);
  uiTools?.enhanceNativeSelect?.(yearSelect, {
    minWidth: 120,
    matchTriggerWidth: true,
  });
  uiTools?.enhanceNativeSelect?.(monthSelect, {
    minWidth: 110,
    matchTriggerWidth: true,
  });
  uiTools?.refreshEnhancedSelect?.(yearSelect);
  uiTools?.refreshEnhancedSelect?.(monthSelect);
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
  if (!(yearSelect instanceof HTMLSelectElement) || !(monthSelect instanceof HTMLSelectElement)) {
    return;
  }

  syncDiaryPeriodSelectors();
  uiTools?.enhanceNativeSelect?.(yearSelect, {
    minWidth: 120,
    matchTriggerWidth: true,
  });
  uiTools?.enhanceNativeSelect?.(monthSelect, {
    minWidth: 110,
    matchTriggerWidth: true,
  });
  yearSelect.addEventListener("change", () => {
    const nextYear = Number.parseInt(yearSelect.value, 10);
    if (!Number.isFinite(nextYear) || nextYear === currentDate.getFullYear()) {
      syncDiaryPeriodSelectors();
      return;
    }
    setCurrentDiaryMonth(nextYear, currentDate.getMonth() + 1);
  });
  monthSelect.addEventListener("change", () => {
    const nextMonth = Number.parseInt(monthSelect.value, 10);
    if (!Number.isFinite(nextMonth) || nextMonth === currentDate.getMonth() + 1) {
      syncDiaryPeriodSelectors();
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

function buildDiaryListPreviewHtml(entry) {
  const rawHtml = stripDiaryImagesFromHtml(entry?.contentHtml || "");
  if (rawHtml) {
    const sanitized = sanitizeDiaryRichTextHtml(rawHtml, {
      attachments: [],
    });
    if (sanitized.html && extractDiaryPlainTextFromHtml(sanitized.html)) {
      return sanitized.html;
    }
  }
  if (typeof entry?.content === "string" && entry.content.trim()) {
    return createDiaryParagraphHtmlFromText(entry.content.trim());
  }
  return Array.isArray(entry?.attachments) && entry.attachments.length > 0
    ? "<p>（图片日记）</p>"
    : "<p>（无正文）</p>";
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
      contentNode.className = "diary-list-rich-preview";
      contentNode.style.marginTop = "6px";
      contentNode.style.fontSize = `${contentFontSize}px`;
      contentNode.style.color = "var(--text-color)";
      contentNode.style.maxHeight = isCompactMobileLayout() ? "132px" : "156px";
      contentNode.style.overflow = "hidden";
      contentNode.style.overflowWrap = "anywhere";
      contentNode.style.wordBreak = "break-word";
      contentNode.style.lineHeight = "1.6";
      contentNode.innerHTML = buildDiaryListPreviewHtml(entry);
      card.appendChild(contentNode);
      syncDiaryFigureElementsLayout(contentNode);

      if (Array.isArray(entry.attachments) && entry.attachments.length > 0) {
        const mediaRow = document.createElement("div");
        mediaRow.className = "diary-list-image-row";
        entry.attachments
          .slice(0, DIARY_LIST_PREVIEW_IMAGE_LIMIT)
          .forEach((attachment) => {
            const thumb = document.createElement("div");
            thumb.className = "diary-list-image-thumb";
            const image = document.createElement("img");
            image.alt = entry.title || "日记图片";
            image.dataset.assetId = attachment.assetId;
            image.loading = "lazy";
            thumb.appendChild(image);
            mediaRow.appendChild(thumb);
            queueDiaryImageHydration(image);
          });
        card.appendChild(mediaRow);
      }

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
    renderDiaryVisibleView({
      includeGuideCard: false,
    });
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
  beforeConfirmClose = null,
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
    beforeConfirmClose,
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

function getDiaryEditorDraftKey(dateText, entryId = null) {
  return `draft:diary:${entryId || "new"}:${dateText}`;
}

function shouldDiaryEditorUseHistoryBackClose() {
  return (
    typeof history !== "undefined" &&
    typeof history.pushState === "function" &&
    (window.ControlerStorage?.isNativeApp === true || isCompactMobileLayout())
  );
}

function isDiaryEditorVisible() {
  return !!(
    diaryEditorRuntime?.root instanceof HTMLElement &&
    diaryEditorRuntime.root.isConnected
  );
}

function getDiaryEditorSaveStateLabel(state) {
  if (state === "saving") {
    return "保存中";
  }
  if (state === "pending") {
    return "待保存";
  }
  if (state === "error") {
    return "保存失败";
  }
  return "已保存";
}

function setDiaryEditorSaveState(runtime, state) {
  if (!runtime || runtime.destroyed) {
    return;
  }
  runtime.saveState = state;
  const label = getDiaryEditorSaveStateLabel(state);
  [runtime.elements?.topStatus, runtime.elements?.saveStatus].forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.textContent = label;
    element.dataset.state = state;
  });
}

function ensureDiaryEditorHasContentBlock(editor) {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  const childNodes = Array.from(editor.childNodes || []);
  const hasMeaningfulChild = childNodes.some((node) => {
    if (node instanceof HTMLBRElement) {
      return false;
    }
    if (node instanceof Text) {
      return String(node.textContent || "").trim().length > 0;
    }
    return true;
  });
  if (!hasMeaningfulChild) {
    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    editor.replaceChildren(paragraph);
    return;
  }
  if (!editor.querySelector("p, blockquote, ul, ol, .diary-image-block")) {
    const paragraph = document.createElement("p");
    while (editor.firstChild) {
      paragraph.appendChild(editor.firstChild);
    }
    editor.appendChild(paragraph);
  }
}

function isDiaryEditorBlankParagraph(element) {
  if (!(element instanceof HTMLElement) || !element.matches("p")) {
    return false;
  }
  return String(element.textContent || "")
    .replace(/\u200B/g, "")
    .trim().length === 0;
}

function getDiaryEditorLeafNode(node, preferBackward = true) {
  let current = node instanceof Node ? node : null;
  while (
    current instanceof Node &&
    (current.firstChild instanceof Node || current.lastChild instanceof Node)
  ) {
    current = preferBackward ? current.lastChild : current.firstChild;
  }
  return current;
}

function getDiaryEditorSelectionAnchor(editor, rangeOverride = null) {
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const selection = window.getSelection();
  const range =
    rangeOverride instanceof Range
      ? rangeOverride
      : selection && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;
  if (!(range instanceof Range)) {
    return null;
  }
  let anchorNode = range.startContainer;
  if (
    range.collapsed &&
    anchorNode instanceof Element &&
    editor.contains(anchorNode)
  ) {
    const childNodes = Array.from(anchorNode.childNodes || []);
    const candidateNodes = [
      {
        node: childNodes[range.startOffset - 1],
        preferBackward: true,
      },
      {
        node: childNodes[range.startOffset],
        preferBackward: false,
      },
      {
        node: childNodes[range.startOffset + 1],
        preferBackward: false,
      },
    ];
    candidateNodes.some((candidate) => {
      const current = getDiaryEditorLeafNode(
        candidate?.node,
        candidate?.preferBackward !== false,
      );
      if (!(current instanceof Node)) {
        return false;
      }
      const currentElement =
        current instanceof Element ? current : current.parentElement;
      if (!(currentElement instanceof HTMLElement) || !editor.contains(currentElement)) {
        return false;
      }
      anchorNode = current;
      return true;
    });
  }
  if (!anchorNode) {
    return null;
  }
  const anchorElement =
    anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
  if (!(anchorElement instanceof HTMLElement)) {
    return null;
  }
  return editor.contains(anchorElement) ? anchorElement : null;
}

function getDiaryEditorQuickStats(editor) {
  const plainText = String(editor?.textContent || "")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const imageCount =
    editor?.querySelectorAll?.(".diary-image-block[data-asset-id]")?.length || 0;
  return {
    plainText,
    wordCount: plainText.replace(/\s+/g, "").length,
    imageCount,
  };
}

function refreshDiaryEditorFooter(runtime, snapshot = null) {
  if (!runtime || runtime.destroyed) {
    return;
  }
  const stats = snapshot
    ? {
        plainText: snapshot.content,
        wordCount: snapshot.content.replace(/\s+/g, "").length,
        imageCount: snapshot.attachments.length,
      }
    : getDiaryEditorQuickStats(runtime.elements?.editor);
  if (runtime.elements?.wordCount instanceof HTMLElement) {
    runtime.elements.wordCount.textContent = `正文 ${stats.wordCount} 字`;
  }
  if (runtime.elements?.imageCount instanceof HTMLElement) {
    runtime.elements.imageCount.textContent = `图片 ${stats.imageCount} 张`;
  }
}

function buildDiaryEditorSnapshot(runtime) {
  if (!runtime || !(runtime.elements?.editor instanceof HTMLElement)) {
    return {
      rawTitle: "",
      title: "未命名日记",
      categoryId: "",
      content: "",
      contentHtml: "<p><br></p>",
      contentVersion: DIARY_CONTENT_VERSION,
      attachments: [],
      meaningful: false,
      signature: "",
    };
  }
  const editorClone = runtime.elements.editor.cloneNode(true);
  ensureDiaryEditorHasContentBlock(editorClone);
  editorClone
    .querySelectorAll(".diary-editor-image-resize-handle, .diary-editor-image-remove-btn")
    .forEach((node) => node.remove());
  editorClone.querySelectorAll(".diary-image-block").forEach((figure) => {
    figure.classList.remove(
      "diary-editor-figure",
      "is-selected",
      "diary-editor-figure--dragging",
    );
    figure.removeAttribute("style");
    const image = figure.querySelector("img[data-asset-id], img");
    image?.removeAttribute("src");
  });
  const richText = sanitizeDiaryRichTextHtml(editorClone.innerHTML, {
    attachments: runtime.lastKnownAttachments || runtime.initialAttachments || [],
  });
  const rawTitle = String(runtime.elements?.titleInput?.value || "").trim();
  const content = extractDiaryPlainTextFromHtml(richText.html);
  const meaningful = !!(rawTitle || content || richText.attachments.length > 0);
  const snapshot = {
    rawTitle,
    title: rawTitle || "未命名日记",
    categoryId: runtime.categorySelector?.getValue?.() || "",
    content,
    contentHtml: richText.html,
    contentVersion: DIARY_CONTENT_VERSION,
    attachments: cloneDiaryAttachmentsSnapshot(richText.attachments),
    meaningful,
  };
  snapshot.signature = JSON.stringify({
    title: snapshot.title,
    categoryId: snapshot.categoryId,
    contentHtml: snapshot.contentHtml,
    attachments: snapshot.attachments,
  });
  return snapshot;
}

async function removeDiaryEditorDraft(runtime) {
  if (
    !runtime ||
    runtime.destroyed ||
    typeof window.ControlerStorage?.removeDraft !== "function"
  ) {
    return;
  }
  await window.ControlerStorage.removeDraft(runtime.draftKey);
}

async function cleanupDiaryEditorUnreferencedAssets(runtime, snapshot = null) {
  if (
    !runtime ||
    runtime.destroyed ||
    typeof window.ControlerStorage?.deleteDiaryImageAssets !== "function"
  ) {
    return;
  }
  const effectiveSnapshot = snapshot || buildDiaryEditorSnapshot(runtime);
  const referencedAssetIds = new Set(collectDiaryReferencedAssetIds(diaryEntries));
  const removableAssetIds = effectiveSnapshot.attachments
    .map((attachment) => attachment.assetId)
    .filter((assetId) => assetId && !referencedAssetIds.has(assetId));
  if (!removableAssetIds.length) {
    return;
  }
  await window.ControlerStorage.deleteDiaryImageAssets({
    assetIds: Array.from(new Set(removableAssetIds)),
  });
  removableAssetIds.forEach((assetId) => removeDiaryImageUriCacheEntry(assetId));
}

function clearDiaryEditorFigureSelection(runtime) {
  if (!runtime) {
    return;
  }
  if (runtime.selectedFigure instanceof HTMLElement) {
    runtime.selectedFigure.classList.remove("is-selected", "is-manipulation-ready");
  }
  runtime.selectedFigure = null;
}

function selectDiaryEditorFigure(runtime, figure, options = {}) {
  if (!runtime || !(figure instanceof HTMLElement)) {
    clearDiaryEditorFigureSelection(runtime);
    return null;
  }
  if (!runtime.elements?.editor?.contains?.(figure)) {
    clearDiaryEditorFigureSelection(runtime);
    return null;
  }
  if (runtime.selectedFigure === figure) {
    if (options.revealControls === true) {
      figure.classList.add("is-manipulation-ready");
    }
    return figure;
  }
  clearDiaryEditorFigureSelection(runtime);
  runtime.selectedFigure = figure;
  figure.classList.add("is-selected");
  figure.classList.toggle("is-manipulation-ready", options.revealControls === true);
  return figure;
}

function focusDiaryEditor(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  editor.focus({
    preventScroll: true,
  });
  if (options.placeEnd !== true) {
    return;
  }
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function saveDiaryEditorSelection(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const preserveExisting = options.preserveExisting === true;
  const existingRange = runtime?.savedSelectionRange;
  const getExistingRange = () =>
    existingRange instanceof Range && editor.contains(existingRange.commonAncestorContainer)
      ? existingRange.cloneRange()
      : null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount <= 0) {
    const fallbackRange = preserveExisting ? getExistingRange() : null;
    if (fallbackRange instanceof Range) {
      runtime.savedSelectionRange = fallbackRange.cloneRange();
      return fallbackRange;
    }
    runtime.savedSelectionRange = null;
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    const fallbackRange = preserveExisting ? getExistingRange() : null;
    if (fallbackRange instanceof Range) {
      runtime.savedSelectionRange = fallbackRange.cloneRange();
      return fallbackRange;
    }
    runtime.savedSelectionRange = null;
    return null;
  }
  runtime.savedSelectionRange = range.cloneRange();
  return runtime.savedSelectionRange;
}

function summarizeDiaryRangeNode(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return {
      type: "text",
      text: String(node.textContent || "").slice(0, 80),
      parentTag: node.parentElement?.tagName || "",
      parentId: node.parentElement?.id || "",
      parentClass:
        typeof node.parentElement?.className === "string"
          ? node.parentElement.className
          : "",
    };
  }
  if (!(node instanceof Element)) {
    return {
      type: String(node.nodeType || ""),
    };
  }
  return {
    type: "element",
    tag: node.tagName,
    id: node.id || "",
    className: typeof node.className === "string" ? node.className : "",
    text: String(node.textContent || "").slice(0, 80),
  };
}

function buildDiaryDebugSelectionSnapshot(runtime) {
  const editor = runtime?.elements?.editor;
  const liveRange =
    editor instanceof HTMLElement ? getDiaryEditorLiveRange(editor) : null;
  const savedRange = runtime?.savedSelectionRange;
  const snapshotRange = (range) =>
    range instanceof Range
      ? {
          collapsed: range.collapsed,
          startOffset: range.startOffset,
          endOffset: range.endOffset,
          start: summarizeDiaryRangeNode(range.startContainer),
          end: summarizeDiaryRangeNode(range.endContainer),
          text: String(range.toString() || "").slice(0, 80),
        }
      : null;
  return {
    activeElement:
      document.activeElement instanceof HTMLElement
        ? {
            tag: document.activeElement.tagName,
            id: document.activeElement.id || "",
            className:
              typeof document.activeElement.className === "string"
                ? document.activeElement.className
                : "",
          }
        : null,
    liveRange: snapshotRange(liveRange),
    savedRange: snapshotRange(savedRange),
  };
}

function traceDiaryEditorDebug(runtime, eventName, detail = {}) {
  if (
    runtime?.debugTraceEnabled !== true ||
    !isDiaryEditorAndroidNativeRuntime()
  ) {
    return;
  }
  const payload = {
    ts: Date.now(),
    event: eventName,
    ...buildDiaryDebugSelectionSnapshot(runtime),
    ...detail,
  };
  const traceStore = Array.isArray(window.__CONTROLER_DIARY_EDITOR_TRACE__)
    ? window.__CONTROLER_DIARY_EDITOR_TRACE__
    : [];
  traceStore.push(payload);
  if (traceStore.length > 200) {
    traceStore.splice(0, traceStore.length - 200);
  }
  window.__CONTROLER_DIARY_EDITOR_TRACE__ = traceStore;
  try {
    console.error(`[diary-editor] ${JSON.stringify(payload)}`);
  } catch (error) {
    console.error("[diary-editor]", eventName, payload);
  }
}

function getDiaryEditorLiveRange(editor) {
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount <= 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return null;
  }
  return range.cloneRange();
}

function getDiaryEditorToolbarInteractionRange(runtime) {
  const editor = runtime?.elements?.editor;
  const toolbarRange = runtime?.toolbarSavedSelectionRange;
  if (
    !(editor instanceof HTMLElement) ||
    runtime?.toolbarInteractionActive !== true ||
    !(toolbarRange instanceof Range) ||
    !editor.contains(toolbarRange.commonAncestorContainer)
  ) {
    return null;
  }
  return toolbarRange.cloneRange();
}

function getDiaryEditorActionRange(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const toolbarRange = getDiaryEditorToolbarInteractionRange(runtime);
  if (toolbarRange instanceof Range) {
    return toolbarRange;
  }
  const liveRange = getDiaryEditorLiveRange(editor);
  if (liveRange instanceof Range) {
    return liveRange;
  }
  if (options.allowSaved === false) {
    return null;
  }
  const savedRange = runtime?.savedSelectionRange;
  if (savedRange instanceof Range && editor.contains(savedRange.commonAncestorContainer)) {
    return savedRange.cloneRange();
  }
  return null;
}

function getDiaryEditorToolbarStateRange(runtime) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const toolbarRange = getDiaryEditorToolbarInteractionRange(runtime);
  if (toolbarRange instanceof Range) {
    return toolbarRange;
  }
  const liveRange = getDiaryEditorLiveRange(editor);
  if (liveRange instanceof Range) {
    return liveRange;
  }
  if (runtime?.toolbarInteractionActive !== true && document.activeElement !== editor) {
    return null;
  }
  const savedRange = runtime?.savedSelectionRange;
  if (savedRange instanceof Range && editor.contains(savedRange.commonAncestorContainer)) {
    return savedRange.cloneRange();
  }
  return null;
}

function restoreDiaryEditorSelection(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const savedRange = runtime?.savedSelectionRange;
  if (!(savedRange instanceof Range)) {
    if (options.focusFallback === true) {
      focusDiaryEditor(runtime, {
        placeEnd: true,
      });
    }
    return null;
  }
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }
  const nextRange = savedRange.cloneRange();
  if (!editor.contains(nextRange.commonAncestorContainer)) {
    return null;
  }
  if (options.forceFocus === true && document.activeElement !== editor) {
    editor.focus({
      preventScroll: true,
    });
  }
  selection.removeAllRanges();
  selection.addRange(nextRange);
  runtime.savedSelectionRange = nextRange.cloneRange();
  return nextRange;
}

function unwrapDiaryElements(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return false;
  }
  const targets = Array.from(root.querySelectorAll(selector));
  targets.forEach((element) => {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  });
  return targets.length > 0;
}

function resolveDiarySelectionBoundary(node, preferStart = true) {
  let current = node;
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      return {
        container: current,
        offset: preferStart ? 0 : String(current.textContent || "").length,
      };
    }
    const childNodes = Array.from(current.childNodes || []);
    if (childNodes.length) {
      current = preferStart ? childNodes[0] : childNodes[childNodes.length - 1];
      continue;
    }
    const parentNode = current.parentNode;
    if (parentNode) {
      const siblingIndex = Array.prototype.indexOf.call(parentNode.childNodes, current);
      return {
        container: parentNode,
        offset: Math.max(0, siblingIndex + (preferStart ? 0 : 1)),
      };
    }
    current = null;
  }
  return null;
}

function selectDiaryInsertedNodes(runtime, insertedNodes = [], options = {}) {
  const effectiveNodes = insertedNodes.filter((node) => node?.parentNode);
  if (!effectiveNodes.length) {
    return;
  }
  const firstNode = effectiveNodes[0];
  const lastNode = effectiveNodes[effectiveNodes.length - 1];
  const startBoundary = resolveDiarySelectionBoundary(firstNode, true);
  const endBoundary = resolveDiarySelectionBoundary(lastNode, false);
  if (!endBoundary || (options.selectContents === true && !startBoundary)) {
    return;
  }
  const range = document.createRange();
  if (options.selectContents === true && startBoundary) {
    range.setStart(startBoundary.container, startBoundary.offset);
    range.setEnd(endBoundary.container, endBoundary.offset);
  } else {
    range.setStart(endBoundary.container, endBoundary.offset);
    range.collapse(true);
  }
  updateDiaryEditorSelection(runtime, range, options);
}

function updateDiaryEditorSelection(runtime, range, options = {}) {
  const selection = window.getSelection();
  if (!(range instanceof Range)) {
    return false;
  }
  if (runtime) {
    runtime.savedSelectionRange = range.cloneRange();
  }
  if (options.syncWindowSelection === false) {
    return true;
  }
  if (!selection) {
    return false;
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function isDiaryEditorRangeMeaningfullyExpanded(range) {
  if (!(range instanceof Range) || range.collapsed) {
    return false;
  }
  return String(range.toString() || "").replace(/\u200B/g, "").length > 0;
}

function createDiaryCaretMarker() {
  const marker = document.createElement("span");
  marker.dataset.diaryCaretMarker = "true";
  marker.textContent = "\u200B";
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.overflow = "hidden";
  marker.style.pointerEvents = "none";
  return marker;
}

function restoreDiaryCaretFromMarker(runtime, marker, options = {}) {
  if (!(marker instanceof HTMLElement)) {
    return false;
  }
  const parentNode = marker.parentNode;
  if (!(parentNode instanceof Node)) {
    marker.remove();
    return false;
  }
  const offset = Array.prototype.indexOf.call(parentNode.childNodes, marker);
  marker.remove();
  if (parentNode instanceof HTMLElement) {
    parentNode.normalize();
  }
  const range = document.createRange();
  range.setStart(parentNode, Math.max(0, Math.min(offset, parentNode.childNodes.length)));
  range.collapse(true);
  return updateDiaryEditorSelection(runtime, range, options);
}

function unwrapDiaryElement(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const parentNode = target.parentNode;
  if (!(parentNode instanceof Node)) {
    return false;
  }
  while (target.firstChild) {
    parentNode.insertBefore(target.firstChild, target);
  }
  parentNode.removeChild(target);
  return true;
}

function createDiarySelectionHolder() {
  const holder = document.createElement("span");
  holder.dataset.diarySelectionHolder = "true";
  return holder;
}

function createDiarySelectionBoundaryMarker(kind = "start") {
  const marker = document.createElement("span");
  marker.dataset.diarySelectionBoundaryMarker = kind === "end" ? "end" : "start";
  marker.textContent = "\u200B";
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.overflow = "hidden";
  marker.style.pointerEvents = "none";
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

function restoreDiarySelectionFromMarkers(runtime, startMarker, endMarker, options = {}) {
  if (
    !(startMarker instanceof HTMLElement) ||
    !(endMarker instanceof HTMLElement) ||
    !startMarker.isConnected ||
    !endMarker.isConnected
  ) {
    startMarker?.remove?.();
    endMarker?.remove?.();
    return false;
  }
  const range = document.createRange();
  range.setStartAfter(startMarker);
  range.setEndBefore(endMarker);
  const updated = updateDiaryEditorSelection(runtime, range, options);
  startMarker.remove();
  endMarker.remove();
  return updated;
}

function splitDiaryInlineAncestorAroundNode(node, ancestor) {
  if (
    !(node instanceof Node) ||
    !(ancestor instanceof HTMLElement) ||
    node.parentNode !== ancestor
  ) {
    return false;
  }
  const parentNode = ancestor.parentNode;
  if (!(parentNode instanceof Node)) {
    return false;
  }
  const beforeClone = ancestor.cloneNode(false);
  const afterClone = ancestor.cloneNode(false);
  while (ancestor.firstChild && ancestor.firstChild !== node) {
    beforeClone.appendChild(ancestor.firstChild);
  }
  while (node.nextSibling) {
    afterClone.appendChild(node.nextSibling);
  }
  if (beforeClone.firstChild) {
    parentNode.insertBefore(beforeClone, ancestor);
  }
  parentNode.insertBefore(node, ancestor);
  if (afterClone.firstChild) {
    parentNode.insertBefore(afterClone, ancestor);
  }
  parentNode.removeChild(ancestor);
  return true;
}

function liftDiarySelectionHolderOutOfCleanupWrappers(holder, editor, cleanupSelector = "") {
  if (
    !(holder instanceof HTMLElement) ||
    !(editor instanceof HTMLElement) ||
    !cleanupSelector
  ) {
    return false;
  }
  let lifted = false;
  let parent = holder.parentElement;
  while (
    parent instanceof HTMLElement &&
    parent !== editor &&
    parent.matches(cleanupSelector) &&
    holder.parentNode === parent
  ) {
    lifted = splitDiaryInlineAncestorAroundNode(holder, parent) || lifted;
    parent = holder.parentElement;
  }
  return lifted;
}

function replaceDiarySelectionHolder(holder, options = {}) {
  if (!(holder instanceof HTMLElement)) {
    return [];
  }
  const parentNode = holder.parentNode;
  if (!(parentNode instanceof Node)) {
    holder.remove();
    return [];
  }
  const unwrapOnly = options.unwrapOnly === true;
  if (unwrapOnly) {
    const fragment = document.createDocumentFragment();
    const insertedNodes = Array.from(holder.childNodes || []);
    insertedNodes.forEach((node) => {
      fragment.appendChild(node);
    });
    parentNode.insertBefore(fragment, holder);
    holder.remove();
    return insertedNodes;
  }
  const wrapper = document.createElement(options.tagName || "span");
  if (typeof options.attributes === "object" && options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      if (typeof value === "string" && value) {
        wrapper.setAttribute(key, value);
      }
    });
  }
  if (typeof options.textStyleToken === "string" && options.textStyleToken) {
    wrapper.setAttribute("data-size", options.textStyleToken);
  }
  if (Number.isFinite(Number(options.fontScale)) && Number(options.fontScale) !== 0) {
    wrapper.setAttribute(
      "data-font-scale",
      String(normalizeDiaryFontScaleValue(options.fontScale, 0)),
    );
  }
  while (holder.firstChild) {
    wrapper.appendChild(holder.firstChild);
  }
  parentNode.insertBefore(wrapper, holder);
  holder.remove();
  return [wrapper];
}

function pruneEmptyDiaryInlineWrappers(root) {
  if (!(root instanceof HTMLElement)) {
    return;
  }
  Array.from(
    root.querySelectorAll(
      "strong, b, em, i, u, mark, span[data-size], span[data-font-scale]",
    ),
  )
    .reverse()
    .forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const normalizedText = String(element.textContent || "")
        .replace(/\u200B/g, "")
        .trim();
      const hasContentfulChild = Array.from(element.children || []).some((child) => {
        if (!(child instanceof HTMLElement)) {
          return false;
        }
        if (child.matches("br, img, .diary-image-block, [data-diary-caret-marker]")) {
          return true;
        }
        return String(child.textContent || "").replace(/\u200B/g, "").trim().length > 0;
      });
      if (normalizedText || hasContentfulChild) {
        return;
      }
      element.remove();
    });
}

function getDiarySelectedTextForNode(range, node) {
  if (!(range instanceof Range) || !(node instanceof Text)) {
    return "";
  }
  const text = String(node.textContent || "");
  let start = 0;
  let end = text.length;
  if (node === range.startContainer) {
    start = Math.max(0, Math.min(range.startOffset, text.length));
  }
  if (node === range.endContainer) {
    end = Math.max(start, Math.min(range.endOffset, text.length));
  }
  return text.slice(start, end);
}

function doesDiaryRangeIntersectNode(range, node) {
  if (!(range instanceof Range) || !(node instanceof Node)) {
    return false;
  }
  try {
    return range.intersectsNode(node);
  } catch (error) {
    return false;
  }
}

function getDiaryEditorSelectionSampleElements(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return [];
  }
  if (range.collapsed) {
    const anchorElement = getDiaryEditorSelectionAnchor(editor, range);
    return anchorElement instanceof HTMLElement ? [anchorElement] : [];
  }
  const walker = document.createTreeWalker(
    editor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!(node instanceof Text) || !doesDiaryRangeIntersectNode(range, node)) {
          return NodeFilter.FILTER_REJECT;
        }
        const selectedText = getDiarySelectedTextForNode(range, node)
          .replace(/\u200B/g, "")
          .trim();
        if (!selectedText) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  const elements = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    const parentElement = currentNode.parentElement;
    if (parentElement instanceof HTMLElement && editor.contains(parentElement)) {
      elements.push(parentElement);
    }
    currentNode = walker.nextNode();
  }
  if (elements.length) {
    return elements;
  }
  const anchorElement = getDiaryEditorSelectionAnchor(editor, range);
  return anchorElement instanceof HTMLElement ? [anchorElement] : [];
}

function getDiaryEditorBlockHostFromNode(editor, node) {
  if (!(editor instanceof HTMLElement) || !(node instanceof Node)) {
    return null;
  }
  const anchorElement = node instanceof Element ? node : node.parentElement;
  if (!(anchorElement instanceof HTMLElement)) {
    return null;
  }
  const listHost = anchorElement.closest("ul, ol");
  if (listHost instanceof HTMLElement && editor.contains(listHost)) {
    return listHost;
  }
  const blockHost = anchorElement.closest("p, .diary-image-block");
  if (blockHost instanceof HTMLElement && editor.contains(blockHost)) {
    return blockHost;
  }
  return null;
}

function getDiaryEditorSelectedBlocks(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return [];
  }
  if (range.collapsed) {
    const anchorElement = getDiaryEditorSelectionAnchor(editor, range);
    const blockHost =
      anchorElement instanceof HTMLElement
        ? getDiaryEditorBlockHostFromNode(editor, anchorElement)
        : null;
    return blockHost instanceof HTMLElement ? [blockHost] : [];
  }
  const blocks = Array.from(
    editor.querySelectorAll("ul, ol, p, .diary-image-block"),
  ).filter((block) => {
    if (!(block instanceof HTMLElement) || !doesDiaryRangeIntersectNode(range, block)) {
      return false;
    }
    if (block.matches("p") && block.closest("li")) {
      return false;
    }
    return true;
  });
  if (blocks.length) {
    return blocks;
  }
  const fallbackBlock = getDiaryEditorBlockHostFromNode(editor, range.startContainer);
  return fallbackBlock instanceof HTMLElement ? [fallbackBlock] : [];
}

function getDiaryEditorFontSizeTokenFromElement(element) {
  if (!(element instanceof HTMLElement)) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  }
  return (
    normalizeDiaryFontSizeToken(
      element.closest("[data-size]")?.getAttribute("data-size") || "",
    ) || DIARY_EDITOR_TEXT_STYLE_TOKENS.body
  );
}

function getDiaryEditorFontScaleFromElement(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }
  return normalizeDiaryFontScaleValue(
    element.closest("[data-font-scale]")?.getAttribute("data-font-scale") || "",
    0,
  );
}

function getDiaryEditorRangeUniformFontScale(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return 0;
  }
  const sampleElements = getDiaryEditorSelectionSampleElements(editor, range);
  if (!sampleElements.length) {
    return 0;
  }
  const fontScales = sampleElements.map((element) =>
    getDiaryEditorFontScaleFromElement(element),
  );
  return fontScales.every((fontScale) => fontScale === fontScales[0])
    ? fontScales[0]
    : 0;
}

function getDiaryEditorRangeBlockTextStyleToken(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return "";
  }
  const selectedBlocks = getDiaryEditorSelectedBlocks(editor, range).filter(
    (block) => block instanceof HTMLElement && !block.matches(".diary-image-block"),
  );
  if (!selectedBlocks.length) {
    return "";
  }
  const styleContainers = selectedBlocks.flatMap((block) =>
    collectDiaryTextStyleContainersForBlock(block),
  );
  if (!styleContainers.length) {
    return "";
  }
  const normalizedTokens = styleContainers.map((container) => {
    const token = getDiaryTextStyleTokenForContainer(container);
    if (token) {
      return token;
    }
    return range.collapsed ? DIARY_EDITOR_TEXT_STYLE_TOKENS.body : "";
  });
  const firstToken = normalizedTokens[0] || "";
  if (!firstToken) {
    return "";
  }
  return normalizedTokens.every((token) => token === firstToken) ? firstToken : "";
}

function isDiaryEditorRangeUniformInlineStyle(editor, range, selector) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range) || !selector) {
    return false;
  }
  const sampleElements = getDiaryEditorSelectionSampleElements(editor, range);
  if (!sampleElements.length) {
    return false;
  }
  return sampleElements.every(
    (element) => element instanceof HTMLElement && !!element.closest(selector),
  );
}

function isDiaryEditorRangeUniformFontSize(editor, range, token) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range) || !token) {
    return false;
  }
  const sampleElements = getDiaryEditorSelectionSampleElements(editor, range);
  if (!sampleElements.length) {
    return false;
  }
  return sampleElements.every(
    (element) => getDiaryEditorFontSizeTokenFromElement(element) === token,
  );
}

function getDiaryEditorListStyleFromElement(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }
  const list = element.closest("ul, ol");
  if (!(list instanceof HTMLElement)) {
    return "";
  }
  const tagName = list.tagName.toLowerCase();
  if (tagName === "ol") {
    return "decimal";
  }
  if (tagName === "ul") {
    return normalizeDiaryListStyle(list.dataset.listStyle || "");
  }
  return "";
}

function getDiaryEditorRangeListStyle(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return "";
  }
  const blocks = getDiaryEditorSelectedBlocks(editor, range);
  if (!blocks.length) {
    return "";
  }
  const styles = blocks.map((block) => getDiaryEditorListStyleFromElement(block));
  const firstStyle = styles[0] || "";
  if (!firstStyle) {
    return "";
  }
  return styles.every((style) => style === firstStyle) ? firstStyle : "";
}

function isDiaryEditorRangeBlockquoted(editor, range) {
  if (!(editor instanceof HTMLElement) || !(range instanceof Range)) {
    return false;
  }
  const blocks = getDiaryEditorSelectedBlocks(editor, range);
  if (!blocks.length) {
    return false;
  }
  return blocks.every(
    (block) => block instanceof HTMLElement && !!block.closest("blockquote"),
  );
}

function collectDiaryTextStyleContainersForBlock(block, containers = []) {
  if (!(block instanceof HTMLElement)) {
    return containers;
  }
  if (block.matches("p")) {
    containers.push(block);
    return containers;
  }
  if (block.matches("ul, ol")) {
    Array.from(block.children || []).forEach((child) => {
      collectDiaryTextStyleContainersForBlock(child, containers);
    });
    return containers;
  }
  if (block.matches("li")) {
    const blockChildren = Array.from(block.children || []).filter(
      (child) => child instanceof HTMLElement && child.matches("p, ul, ol"),
    );
    if (blockChildren.length) {
      blockChildren.forEach((child) => {
        collectDiaryTextStyleContainersForBlock(child, containers);
      });
      return containers;
    }
    containers.push(block);
    return containers;
  }
  return containers;
}

function getDiaryTextStyleTokenForContainer(container) {
  if (!(container instanceof HTMLElement)) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  }
  const meaningfulChildNodes = Array.from(container.childNodes || []).filter((node) => {
    if (node instanceof Text) {
      return String(node.textContent || "").replace(/\u200B/g, "").trim().length > 0;
    }
    return true;
  });
  if (!meaningfulChildNodes.length) {
    return DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  }
  if (meaningfulChildNodes.length === 1) {
    const onlyChild = meaningfulChildNodes[0];
    if (onlyChild instanceof HTMLElement && onlyChild.matches("[data-size]")) {
      return (
        normalizeDiaryFontSizeToken(onlyChild.getAttribute("data-size") || "") ||
        DIARY_EDITOR_TEXT_STYLE_TOKENS.body
      );
    }
  }
  return container.querySelector("[data-size], font")
    ? ""
    : DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
}

function isDiaryInlineStyleUniformForContainer(container, selector) {
  if (!(container instanceof HTMLElement) || !selector) {
    return false;
  }
  const meaningfulChildNodes = Array.from(container.childNodes || []).filter((node) => {
    if (node instanceof Text) {
      return String(node.textContent || "").replace(/\u200B/g, "").trim().length > 0;
    }
    return true;
  });
  if (!meaningfulChildNodes.length) {
    return false;
  }
  if (meaningfulChildNodes.length === 1) {
    const onlyChild = meaningfulChildNodes[0];
    return onlyChild instanceof HTMLElement && onlyChild.matches(selector);
  }
  return false;
}

function applyDiaryTextStyleToContainer(container, token) {
  if (!(container instanceof HTMLElement)) {
    return false;
  }
  const normalizedToken =
    normalizeDiaryFontSizeToken(token) || DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  unwrapDiaryElements(container, "[data-size], font");
  container.normalize();
  if (normalizedToken === DIARY_EDITOR_TEXT_STYLE_TOKENS.body) {
    return true;
  }
  const wrapper = document.createElement("span");
  wrapper.setAttribute("data-size", normalizedToken);
  while (container.firstChild) {
    wrapper.appendChild(container.firstChild);
  }
  if (!wrapper.firstChild) {
    wrapper.appendChild(document.createElement("br"));
  }
  container.appendChild(wrapper);
  return true;
}

function applyDiaryFontScaleToContainer(container, fontScale) {
  if (!(container instanceof HTMLElement)) {
    return false;
  }
  const normalizedFontScale = normalizeDiaryFontScaleValue(fontScale, 0);
  unwrapDiaryElements(container, "[data-font-scale]");
  container.normalize();
  if (normalizedFontScale === 0) {
    return true;
  }
  const meaningfulChildNodes = Array.from(container.childNodes || []).filter((node) => {
    if (node instanceof Text) {
      return String(node.textContent || "").replace(/\u200B/g, "").trim().length > 0;
    }
    return true;
  });
  const wrapHost =
    meaningfulChildNodes.length === 1 &&
    meaningfulChildNodes[0] instanceof HTMLElement &&
    meaningfulChildNodes[0].matches("[data-size]")
      ? meaningfulChildNodes[0]
      : container;
  const wrapper = document.createElement("span");
  wrapper.setAttribute("data-font-scale", String(normalizedFontScale));
  while (wrapHost.firstChild) {
    wrapper.appendChild(wrapHost.firstChild);
  }
  if (!wrapper.firstChild) {
    wrapper.appendChild(document.createElement("br"));
  }
  wrapHost.appendChild(wrapper);
  return true;
}

function applyDiaryInlineStyleToContainer(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return false;
  }
  const cleanupSelector =
    typeof options.cleanupSelector === "string" && options.cleanupSelector.trim()
      ? options.cleanupSelector.trim()
      : "";
  const tagName =
    typeof options.tagName === "string" && options.tagName.trim()
      ? options.tagName.trim()
      : "span";
  if (cleanupSelector) {
    unwrapDiaryElements(container, cleanupSelector);
  }
  container.normalize();
  if (options.unwrapOnly === true) {
    return true;
  }
  const wrapper = document.createElement(tagName);
  if (typeof options.attributes === "object" && options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      if (typeof value === "string" && value) {
        wrapper.setAttribute(key, value);
      }
    });
  }
  if (Number.isFinite(Number(options.fontScale)) && Number(options.fontScale) !== 0) {
    wrapper.setAttribute(
      "data-font-scale",
      String(normalizeDiaryFontScaleValue(options.fontScale, 0)),
    );
  }
  while (container.firstChild) {
    wrapper.appendChild(container.firstChild);
  }
  if (!wrapper.firstChild) {
    wrapper.appendChild(document.createElement("br"));
  }
  container.appendChild(wrapper);
  return true;
}

function toggleDiaryBlockTextStyleAtCaret(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range) || !range.collapsed) {
    return false;
  }
  const nextToken =
    normalizeDiaryFontSizeToken(options.textStyleToken) || DIARY_EDITOR_TEXT_STYLE_TOKENS.body;
  const selectedBlocks = getDiaryEditorSelectedBlocks(editor, range).filter(
    (block) => block instanceof HTMLElement && !block.matches(".diary-image-block"),
  );
  if (!selectedBlocks.length) {
    return false;
  }
  const styleContainers = selectedBlocks.flatMap((block) =>
    collectDiaryTextStyleContainersForBlock(block),
  );
  if (!styleContainers.length) {
    return false;
  }
  const currentTokens = styleContainers.map((container) =>
    getDiaryTextStyleTokenForContainer(container),
  );
  if (
    nextToken === DIARY_EDITOR_TEXT_STYLE_TOKENS.body &&
    currentTokens.every((token) => token === DIARY_EDITOR_TEXT_STYLE_TOKENS.body)
  ) {
    return false;
  }
  const resolvedToken =
    nextToken !== DIARY_EDITOR_TEXT_STYLE_TOKENS.body &&
    currentTokens.every((token) => token === nextToken)
      ? DIARY_EDITOR_TEXT_STYLE_TOKENS.body
      : nextToken;
  const marker = createDiaryCaretMarker();
  range.insertNode(marker);
  styleContainers.forEach((container) => {
    applyDiaryTextStyleToContainer(container, resolvedToken);
  });
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  ensureDiaryEditorHasContentBlock(editor);
  return restoreDiaryCaretFromMarker(runtime, marker, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function toggleDiaryBlockInlineStyleAtCaret(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range) || !range.collapsed) {
    return false;
  }
  const cleanupSelector =
    typeof options.cleanupSelector === "string" && options.cleanupSelector.trim()
      ? options.cleanupSelector.trim()
      : "";
  if (!cleanupSelector) {
    return false;
  }
  const selectedBlocks = getDiaryEditorSelectedBlocks(editor, range).filter(
    (block) => block instanceof HTMLElement && !block.matches(".diary-image-block"),
  );
  if (!selectedBlocks.length) {
    return false;
  }
  const styleContainers = selectedBlocks.flatMap((block) =>
    collectDiaryTextStyleContainersForBlock(block),
  );
  if (!styleContainers.length) {
    return false;
  }
  const activeSelector =
    typeof options.activeSelector === "string" && options.activeSelector.trim()
      ? options.activeSelector.trim()
      : cleanupSelector;
  const shouldUnwrap = styleContainers.every((container) =>
    isDiaryInlineStyleUniformForContainer(container, activeSelector),
  );
  const marker = createDiaryCaretMarker();
  range.insertNode(marker);
  styleContainers.forEach((container) => {
    applyDiaryInlineStyleToContainer(container, {
      tagName: options.tagName,
      attributes: options.attributes,
      cleanupSelector,
      unwrapOnly: shouldUnwrap,
    });
  });
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  ensureDiaryEditorHasContentBlock(editor);
  return restoreDiaryCaretFromMarker(runtime, marker, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function adjustDiaryBlockFontScaleAtCaret(runtime, delta, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range) || !range.collapsed) {
    return false;
  }
  const normalizedDelta = normalizeDiaryFontScaleValue(delta, 0);
  if (normalizedDelta === 0) {
    return false;
  }
  const selectedBlocks = getDiaryEditorSelectedBlocks(editor, range).filter(
    (block) => block instanceof HTMLElement && !block.matches(".diary-image-block"),
  );
  if (!selectedBlocks.length) {
    return false;
  }
  const styleContainers = selectedBlocks.flatMap((block) =>
    collectDiaryTextStyleContainersForBlock(block),
  );
  if (!styleContainers.length) {
    return false;
  }
  const uniformScale = getDiaryEditorRangeUniformFontScale(editor, range);
  const nextScale = normalizeDiaryFontScaleValue(uniformScale + normalizedDelta, 0);
  if (nextScale === uniformScale) {
    return false;
  }
  const marker = createDiaryCaretMarker();
  range.insertNode(marker);
  styleContainers.forEach((container) => {
    applyDiaryFontScaleToContainer(container, nextScale);
  });
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  ensureDiaryEditorHasContentBlock(editor);
  return restoreDiaryCaretFromMarker(runtime, marker, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function applyDiaryInlineStyleAtCaret(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range) || !range.collapsed) {
    return false;
  }
  const wrapper = document.createElement(options.tagName || "span");
  if (typeof options.attributes === "object" && options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      if (typeof value === "string" && value) {
        wrapper.setAttribute(key, value);
      }
    });
  }
  if (typeof options.textStyleToken === "string" && options.textStyleToken) {
    wrapper.setAttribute("data-size", options.textStyleToken);
  }
  const marker = createDiaryCaretMarker();
  wrapper.appendChild(marker);
  range.insertNode(wrapper);
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  return restoreDiaryCaretFromMarker(runtime, marker, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function toggleDiaryInlineStyleAtCaret(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range) || !range.collapsed) {
    return false;
  }
  const anchorElement = getDiaryEditorSelectionAnchor(editor, range);
  if (!(anchorElement instanceof HTMLElement)) {
    return false;
  }
  const activeSelector =
    typeof options.activeSelector === "string" && options.activeSelector.trim()
      ? options.activeSelector.trim()
      : "";
  if (!activeSelector) {
    return false;
  }
  const target = anchorElement.closest(activeSelector);
  if (!(target instanceof HTMLElement) || !editor.contains(target)) {
    return false;
  }
  const marker = createDiaryCaretMarker();
  range.insertNode(marker);
  if (
    target.matches("[data-size]") &&
    typeof options.textStyleToken === "string" &&
    options.textStyleToken
  ) {
    const currentToken = normalizeDiaryFontSizeToken(target.getAttribute("data-size") || "");
    if (currentToken === options.textStyleToken) {
      unwrapDiaryElement(target);
    } else {
      target.setAttribute("data-size", options.textStyleToken);
    }
  } else {
    unwrapDiaryElement(target);
  }
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  return restoreDiaryCaretFromMarker(runtime, marker, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function groupDiaryConsecutiveBlocks(blocks = []) {
  const groups = [];
  blocks.forEach((block) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }
    const currentGroup = groups[groups.length - 1];
    if (!currentGroup?.length) {
      groups.push([block]);
      return;
    }
    const previousBlock = currentGroup[currentGroup.length - 1];
    if (
      previousBlock.parentNode === block.parentNode &&
      previousBlock.nextElementSibling === block
    ) {
      currentGroup.push(block);
      return;
    }
    groups.push([block]);
  });
  return groups;
}

function splitDiaryBlockquoteByBlocks(blockquote, selectedBlocks = []) {
  if (!(blockquote instanceof HTMLElement) || !selectedBlocks.length) {
    return false;
  }
  const parentNode = blockquote.parentNode;
  if (!(parentNode instanceof Node)) {
    return false;
  }
  const selectedSet = new Set(selectedBlocks);
  const childBlocks = Array.from(blockquote.children).filter(
    (child) =>
      child instanceof HTMLElement &&
      child.matches("p, ul, ol, .diary-image-block"),
  );
  if (!childBlocks.length) {
    blockquote.remove();
    return true;
  }
  const fragment = document.createDocumentFragment();
  let currentBlockquote = null;
  childBlocks.forEach((block) => {
    if (selectedSet.has(block)) {
      currentBlockquote = null;
      fragment.appendChild(block);
      return;
    }
    if (!(currentBlockquote instanceof HTMLElement)) {
      currentBlockquote = document.createElement("blockquote");
      fragment.appendChild(currentBlockquote);
    }
    currentBlockquote.appendChild(block);
  });
  parentNode.insertBefore(fragment, blockquote);
  blockquote.remove();
  return true;
}

function toggleDiaryBlockquoteForSelection(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (!(range instanceof Range)) {
    return false;
  }
  const selectedBlocks = getDiaryEditorSelectedBlocks(editor, range);
  if (!selectedBlocks.length) {
    return false;
  }
  const nextRange = range.cloneRange();
  const shouldUnwrap = selectedBlocks.every((block) => !!block.closest("blockquote"));
  if (shouldUnwrap) {
    const groupedBlocks = new Map();
    selectedBlocks.forEach((block) => {
      const parentBlockquote = block.closest("blockquote");
      if (!(parentBlockquote instanceof HTMLElement)) {
        return;
      }
      if (!groupedBlocks.has(parentBlockquote)) {
        groupedBlocks.set(parentBlockquote, []);
      }
      groupedBlocks.get(parentBlockquote).push(block);
    });
    groupedBlocks.forEach((blocks, blockquote) => {
      splitDiaryBlockquoteByBlocks(blockquote, blocks);
    });
  } else {
    const unquotedBlocks = selectedBlocks.filter((block) => !block.closest("blockquote"));
    groupDiaryConsecutiveBlocks(unquotedBlocks).forEach((group) => {
      const firstBlock = group[0];
      const parentNode = firstBlock?.parentNode;
      if (!(firstBlock instanceof HTMLElement) || !(parentNode instanceof Node)) {
        return;
      }
      const blockquote = document.createElement("blockquote");
      parentNode.insertBefore(blockquote, firstBlock);
      group.forEach((block) => {
        if (block instanceof HTMLElement) {
          blockquote.appendChild(block);
        }
      });
    });
  }
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  ensureDiaryEditorHasContentBlock(editor);
  return updateDiaryEditorSelection(runtime, nextRange, {
    syncWindowSelection: options.syncWindowSelection,
  });
}

function deleteDiaryEditorSelection(runtime, direction = "backward") {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  if (!(runtime.selectedFigure instanceof HTMLElement) || !editor.contains(runtime.selectedFigure)) {
    return false;
  }
  const targetFigure = runtime.selectedFigure;
  const fallbackBlock =
    targetFigure.nextElementSibling instanceof HTMLElement
      ? targetFigure.nextElementSibling
      : targetFigure.previousElementSibling instanceof HTMLElement
        ? targetFigure.previousElementSibling
        : null;
  targetFigure.remove();
  clearDiaryEditorFigureSelection(runtime);
  ensureDiaryEditorHasContentBlock(editor);
  if (fallbackBlock instanceof HTMLElement && editor.contains(fallbackBlock)) {
    const boundary = resolveDiarySelectionBoundary(
      fallbackBlock,
      direction !== "forward",
    );
    if (boundary) {
      const range = document.createRange();
      range.setStart(boundary.container, boundary.offset);
      range.collapse(true);
      updateDiaryEditorSelection(runtime, range, {
        syncWindowSelection: document.activeElement === editor,
      });
    }
  }
  scheduleDiaryEditorNativeInputRestart(runtime);
  return true;
}

function applyDiaryInlineWrapper(runtime, options = {}) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  const range = getDiaryEditorActionRange(runtime);
  if (
    !(range instanceof Range) ||
    range.collapsed ||
    !editor.contains(range.commonAncestorContainer)
  ) {
    return false;
  }
  const cleanupSelector =
    typeof options.cleanupSelector === "string" && options.cleanupSelector.trim()
      ? options.cleanupSelector.trim()
      : "";
  const uniformActive =
    typeof options.isUniformActive === "function"
      ? options.isUniformActive(editor, range)
      : typeof options.activeSelector === "string" && options.activeSelector.trim()
        ? isDiaryEditorRangeUniformInlineStyle(
            editor,
            range,
            options.activeSelector.trim(),
          )
        : false;
  traceDiaryEditorDebug(runtime, "inline-wrapper-start", {
    tagName: options.tagName || "",
    cleanupSelector,
    activeSelector:
      typeof options.activeSelector === "string" ? options.activeSelector : "",
    unwrapOnly: options.unwrapOnly === true,
    uniformActive,
    selectedText: String(range.toString() || "").slice(0, 80),
  });
  const unwrapOnly = options.unwrapOnly === true;
  const effectiveUnwrapOnly = unwrapOnly || (uniformActive && options.toggle !== false);
  const holder = createDiarySelectionHolder();
  const startMarker = createDiarySelectionBoundaryMarker("start");
  const endMarker = createDiarySelectionBoundaryMarker("end");
  holder.appendChild(startMarker);
  holder.appendChild(range.extractContents());
  holder.appendChild(endMarker);
  range.insertNode(holder);
  if (cleanupSelector) {
    unwrapDiaryElements(holder, cleanupSelector);
    liftDiarySelectionHolderOutOfCleanupWrappers(holder, editor, cleanupSelector);
  }
  const insertedNodes = replaceDiarySelectionHolder(holder, {
    unwrapOnly: effectiveUnwrapOnly,
    tagName: options.tagName,
    attributes: options.attributes,
    textStyleToken: options.textStyleToken,
  });
  pruneEmptyDiaryInlineWrappers(editor);
  editor.normalize();
  restoreDiarySelectionFromMarkers(runtime, startMarker, endMarker, {
    syncWindowSelection: options.syncWindowSelection,
  });
  traceDiaryEditorDebug(runtime, "inline-wrapper-end", {
    tagName: options.tagName || "",
    insertedNodeCount: insertedNodes.filter(Boolean).length,
  });
  return true;
}

function restoreDiaryEditorFocusAfterToolbarAction(runtime) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  const savedRange = runtime?.savedSelectionRange;
  const hasSavedRange =
    savedRange instanceof Range && editor.contains(savedRange.commonAncestorContainer);
  const hasToolbarRange = getDiaryEditorToolbarInteractionRange(runtime) instanceof Range;
  const hasLiveRange = getDiaryEditorLiveRange(editor) instanceof Range;
  if (
    document.activeElement !== editor &&
    !hasSavedRange &&
    !hasToolbarRange &&
    !hasLiveRange
  ) {
    return;
  }
  restoreDiaryEditorSelection(runtime, {
    forceFocus: true,
    focusFallback: true,
  });
}

function isDiaryEditorAndroidNativeRuntime() {
  return (
    window.ControlerStorage?.isNativeApp === true &&
    /Android/i.test(String(navigator.userAgent || ""))
  );
}

function scheduleDiaryEditorNativeInputRestart(runtime) {
  if (
    !runtime ||
    runtime.destroyed ||
    runtime.nativeInputRestartQueued === true ||
    !isDiaryEditorAndroidNativeRuntime() ||
    typeof window.ControlerNativeBridge?.call !== "function"
  ) {
    return false;
  }
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return false;
  }
  runtime.nativeInputRestartQueued = true;
  window.clearTimeout(runtime.nativeInputRestartTimer);
  runtime.nativeInputRestartTimer = window.setTimeout(() => {
    runtime.nativeInputRestartTimer = 0;
    runtime.nativeInputRestartQueued = false;
    if (runtime.destroyed) {
      return;
    }
    restoreDiaryEditorSelection(runtime, {
      forceFocus: true,
      focusFallback: true,
    });
    if (document.activeElement !== editor) {
      return;
    }
    void window.ControlerNativeBridge
      .call("ui.restartSoftInput")
      .catch(() => window.ControlerNativeBridge.call("ui.showSoftInput"))
      .catch(() => undefined);
  }, DIARY_EDITOR_NATIVE_INPUT_RESTART_DELAY_MS);
  return true;
}

function buildDiaryEditorFigureElement(attachment) {
  const host = document.createElement("div");
  host.innerHTML = buildDiaryAttachmentHtml(attachment);
  const figure = host.firstElementChild;
  if (!(figure instanceof HTMLElement)) {
    return null;
  }
  figure.dataset.mimeType = attachment.mimeType;
  figure.classList.add("diary-editor-figure");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "diary-editor-image-remove-btn";
  removeButton.dataset.controlerKeepInputFocus = "true";
  removeButton.setAttribute("aria-label", "删除图片");
  removeButton.textContent = "❌";
  const resizeHandle = document.createElement("button");
  resizeHandle.type = "button";
  resizeHandle.className = "diary-editor-image-resize-handle";
  resizeHandle.dataset.controlerKeepInputFocus = "true";
  resizeHandle.setAttribute("aria-label", "调整图片大小");
  figure.appendChild(removeButton);
  figure.appendChild(resizeHandle);
  return figure;
}

function syncDiaryEditorAttachmentFigures(runtime, attachments = []) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const normalizedAttachments = normalizeDiaryAttachments(attachments).sort(
    (left, right) => left.blockOrder - right.blockOrder,
  );
  const attachmentsByAssetId = new Map(
    normalizedAttachments.map((attachment) => [attachment.assetId, attachment]),
  );
  let lastAddedFigure = null;
  Array.from(editor.querySelectorAll(".diary-image-block")).forEach((figure) => {
    if (!(figure instanceof HTMLElement)) {
      return;
    }
    const image = figure.querySelector("img[data-asset-id], img");
    const assetId =
      String(figure.dataset.assetId || "").trim() ||
      String(image?.dataset?.assetId || "").trim();
    const attachment = attachmentsByAssetId.get(assetId);
    if (!attachment) {
      figure.remove();
      return;
    }
    figure.dataset.kind = "image";
    figure.dataset.attachmentId = attachment.id;
    figure.dataset.assetId = attachment.assetId;
    figure.dataset.widthPercent = String(attachment.widthPercent);
    figure.dataset.align = attachment.align;
    figure.dataset.offsetXPercent = String(attachment.offsetXPercent);
    figure.dataset.aspectRatio = String(attachment.aspectRatio);
    figure.dataset.blockOrder = String(attachment.blockOrder);
    figure.dataset.compressionMode = attachment.compressionMode;
    figure.dataset.mimeType = attachment.mimeType;
    if (image instanceof HTMLImageElement) {
      image.dataset.assetId = attachment.assetId;
      image.alt = "日记图片";
      image.draggable = false;
      queueDiaryImageHydration(image);
    }
    attachmentsByAssetId.delete(assetId);
  });
  normalizedAttachments.forEach((attachment) => {
    if (!attachmentsByAssetId.has(attachment.assetId)) {
      return;
    }
    const figure = buildDiaryEditorFigureElement(attachment);
    if (!(figure instanceof HTMLElement)) {
      return;
    }
    const trailingBlankParagraph = Array.from(editor.children)
      .reverse()
      .find((element) => isDiaryEditorBlankParagraph(element));
    if (trailingBlankParagraph instanceof HTMLElement) {
      trailingBlankParagraph.before(figure);
    } else {
      editor.appendChild(figure);
    }
    if (
      !(figure.nextElementSibling instanceof HTMLElement) ||
      figure.nextElementSibling.matches(".diary-image-block")
    ) {
      const paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      figure.after(paragraph);
    }
    attachmentsByAssetId.delete(attachment.assetId);
    lastAddedFigure = figure;
  });
  ensureDiaryEditorHasContentBlock(editor);
  enhanceDiaryEditorFigures(runtime);
  syncDiaryFigureElementsLayout(editor);
  return {
    lastAddedFigure,
  };
}

function reconcileDiaryEditorInsertedImages(runtime, insertedAttachments = []) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const mergedAttachments = mergeDiaryAttachmentsSnapshot(
    runtime.initialAttachments || [],
    runtime.lastKnownAttachments || [],
    insertedAttachments,
  );
  const sanitized = sanitizeDiaryRichTextHtml(editor.innerHTML, {
    attachments: mergedAttachments,
  });
  editor.innerHTML = sanitized.html;
  clearDiaryEditorFigureSelection(runtime);
  runtime.savedSelectionRange = null;
  ensureDiaryEditorHasContentBlock(editor);
  const figureSync = syncDiaryEditorAttachmentFigures(runtime, sanitized.attachments);
  const targetAttachment = insertedAttachments[insertedAttachments.length - 1] || null;
  if (targetAttachment?.assetId) {
    const insertedFigure =
      editor.querySelector(
        `.diary-image-block[data-asset-id="${escapeCssSelector(targetAttachment.assetId)}"]`,
      ) || figureSync?.lastAddedFigure;
    if (insertedFigure instanceof HTMLElement) {
      selectDiaryEditorFigure(runtime, insertedFigure);
      insertedFigure.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
      });
    }
  }
  focusDiaryEditor(runtime, {
    placeEnd: true,
  });
  scheduleDiaryEditorNativeInputRestart(runtime);
  runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(
    sanitized.attachments,
  );
  return sanitized;
}

function enhanceDiaryEditorFigure(runtime, figure) {
  if (!runtime || !(figure instanceof HTMLElement)) {
    return;
  }
  figure.classList.add("diary-editor-figure");
  figure.setAttribute("contenteditable", "false");
  if (!figure.querySelector(".diary-editor-image-remove-btn")) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "diary-editor-image-remove-btn";
    removeButton.dataset.controlerKeepInputFocus = "true";
    removeButton.setAttribute("aria-label", "删除图片");
    removeButton.textContent = "❌";
    figure.appendChild(removeButton);
  } else {
    const removeButton = figure.querySelector(".diary-editor-image-remove-btn");
    if (removeButton instanceof HTMLButtonElement) {
      removeButton.setAttribute("aria-label", "删除图片");
      removeButton.textContent = "❌";
    }
  }
  if (!figure.querySelector(".diary-editor-image-resize-handle")) {
    const resizeHandle = document.createElement("button");
    resizeHandle.type = "button";
    resizeHandle.className = "diary-editor-image-resize-handle";
    resizeHandle.dataset.controlerKeepInputFocus = "true";
    resizeHandle.setAttribute("aria-label", "调整图片大小");
    figure.appendChild(resizeHandle);
  } else {
    const resizeHandle = figure.querySelector(".diary-editor-image-resize-handle");
    if (resizeHandle instanceof HTMLButtonElement) {
      resizeHandle.setAttribute("aria-label", "调整图片大小");
    }
  }
  applyDiaryFigureLayout(figure);
  const image = figure.querySelector("img[data-asset-id], img");
  if (image instanceof HTMLImageElement) {
    image.draggable = false;
    queueDiaryImageHydration(image);
  }
  if (figure.dataset.bound === "true") {
    return;
  }
  figure.dataset.bound = "true";

  const handleChange = () => runtime.handleChange?.();

  const startMoveSession = (pointerDownEvent) => {
    const editor = runtime.elements?.editor;
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    const editorRect = editor.getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "diary-editor-figure-placeholder";
    placeholder.style.height = `${Math.max(48, figureRect.height)}px`;
    figure.parentNode?.insertBefore(placeholder, figure.nextSibling);
    figure.classList.add("diary-editor-figure--dragging");
    figure.style.width = `${figureRect.width}px`;
    figure.style.left = `${figureRect.left}px`;
    figure.style.top = `${figureRect.top}px`;
    figure.style.height = `${figureRect.height}px`;
    const pointerId = pointerDownEvent.pointerId;
    const offsetX = pointerDownEvent.clientX - figureRect.left;
    const offsetY = pointerDownEvent.clientY - figureRect.top;

    const movePlaceholder = (clientY) => {
      const blocks = Array.from(editor.children).filter(
        (child) => child !== figure && child !== placeholder,
      );
      let inserted = false;
      blocks.forEach((child) => {
        if (inserted) {
          return;
        }
        const childRect = child.getBoundingClientRect();
        if (clientY < childRect.top + childRect.height / 2) {
          editor.insertBefore(placeholder, child);
          inserted = true;
        }
      });
      if (!inserted) {
        editor.appendChild(placeholder);
      }
    };

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      moveEvent.preventDefault();
      figure.style.left = `${moveEvent.clientX - offsetX}px`;
      figure.style.top = `${moveEvent.clientY - offsetY}px`;
      movePlaceholder(moveEvent.clientY);
    };

    const handleUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      document.removeEventListener("pointermove", handleMove, true);
      document.removeEventListener("pointerup", handleUp, true);
      document.removeEventListener("pointercancel", handleUp, true);
      figure.classList.remove("diary-editor-figure--dragging");
      figure.removeAttribute("style");
      placeholder.parentNode?.insertBefore(figure, placeholder);
      placeholder.remove();
      const droppedRect = figure.getBoundingClientRect();
      const editorCenterX = editorRect.left + editorRect.width / 2;
      const figureCenterX = droppedRect.left + droppedRect.width / 2;
      figure.dataset.offsetXPercent = String(
        normalizeDiaryNumber(
          ((figureCenterX - editorCenterX) / Math.max(1, editorRect.width)) * 100,
          0,
          -50,
          50,
        ),
      );
      applyDiaryFigureLayout(figure);
      selectDiaryEditorFigure(runtime, figure, {
        revealControls: true,
      });
      handleChange();
    };

    document.addEventListener("pointermove", handleMove, true);
    document.addEventListener("pointerup", handleUp, true);
    document.addEventListener("pointercancel", handleUp, true);
  };

  const startResizeSession = (pointerDownEvent) => {
    const editor = runtime.elements?.editor;
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    const editorRect = editor.getBoundingClientRect();
    const pointerId = pointerDownEvent.pointerId;
    const startX = pointerDownEvent.clientX;
    const startWidthPercent = normalizeDiaryNumber(
      figure.dataset.widthPercent,
      82,
      24,
      100,
    );
    const startOffsetPercent = normalizeDiaryNumber(
      figure.dataset.offsetXPercent,
      0,
      -50,
      50,
    );
    const startWidthPx = (editorRect.width * startWidthPercent) / 100;

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      moveEvent.preventDefault();
      const nextWidthPx = Math.max(80, startWidthPx + (moveEvent.clientX - startX));
      const nextWidthPercent = normalizeDiaryNumber(
        (nextWidthPx / Math.max(1, editorRect.width)) * 100,
        startWidthPercent,
        24,
        100,
      );
      figure.dataset.widthPercent = String(nextWidthPercent);
      figure.dataset.offsetXPercent = String(
        normalizeDiaryNumber(
          startOffsetPercent,
          0,
          -((100 - nextWidthPercent) / 2),
          (100 - nextWidthPercent) / 2,
        ),
      );
      applyDiaryFigureLayout(figure);
    };

    const handleUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      document.removeEventListener("pointermove", handleMove, true);
      document.removeEventListener("pointerup", handleUp, true);
      document.removeEventListener("pointercancel", handleUp, true);
      selectDiaryEditorFigure(runtime, figure, {
        revealControls: true,
      });
      handleChange();
    };

    document.addEventListener("pointermove", handleMove, true);
    document.addEventListener("pointerup", handleUp, true);
    document.addEventListener("pointercancel", handleUp, true);
  };

  figure.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.classList.contains("diary-editor-image-remove-btn")) {
      figure.remove();
      clearDiaryEditorFigureSelection(runtime);
      handleChange();
      return;
    }
    selectDiaryEditorFigure(runtime, figure);
  });

  figure.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.classList.contains("diary-editor-image-remove-btn")) {
      return;
    }
    if (target?.classList.contains("diary-editor-image-resize-handle")) {
      event.preventDefault();
      event.stopPropagation();
      selectDiaryEditorFigure(runtime, figure, {
        revealControls: true,
      });
      startResizeSession(event);
      return;
    }
    const wasSelected = runtime.selectedFigure === figure;
    selectDiaryEditorFigure(runtime, figure);
    if (event.pointerType === "mouse") {
      if (wasSelected) {
        event.preventDefault();
        startMoveSession(event);
      }
      return;
    }
    const originX = event.clientX;
    const originY = event.clientY;
    let longPressTimer = window.setTimeout(() => {
      longPressTimer = 0;
      event.preventDefault();
      startMoveSession(event);
    }, DIARY_EDITOR_IMAGE_LONG_PRESS_MS);
    const cancelLongPress = (moveEvent) => {
      if (!longPressTimer) {
        return;
      }
      if (
        Math.abs(moveEvent.clientX - originX) > 8 ||
        Math.abs(moveEvent.clientY - originY) > 8
      ) {
        window.clearTimeout(longPressTimer);
        longPressTimer = 0;
      }
    };
    const stopLongPress = () => {
      if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = 0;
      }
      document.removeEventListener("pointermove", cancelLongPress, true);
      document.removeEventListener("pointerup", stopLongPress, true);
      document.removeEventListener("pointercancel", stopLongPress, true);
    };
    document.addEventListener("pointermove", cancelLongPress, true);
    document.addEventListener("pointerup", stopLongPress, true);
    document.addEventListener("pointercancel", stopLongPress, true);
  });
}

function enhanceDiaryEditorFigures(runtime) {
  runtime?.elements?.editor
    ?.querySelectorAll?.(".diary-image-block")
    ?.forEach?.((figure) => enhanceDiaryEditorFigure(runtime, figure));
}

function insertDiaryEditorFigureAtSelection(runtime, figure) {
  const editor = runtime?.elements?.editor;
  if (!(editor instanceof HTMLElement) || !(figure instanceof HTMLElement)) {
    return false;
  }
  restoreDiaryEditorSelection(runtime);
  const selection = window.getSelection();
  let inserted = false;
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) {
      const anchorNode =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer?.parentElement;
      const blockHost =
        anchorNode?.closest?.("p, blockquote, ul, ol, .diary-image-block, li") || null;
      if (blockHost instanceof HTMLElement && editor.contains(blockHost)) {
        const insertionTarget =
          blockHost.tagName.toLowerCase() === "li"
            ? blockHost.closest("ul, ol") || blockHost
            : blockHost;
        insertionTarget.after(figure);
        inserted = true;
      }
    }
  }
  if (!inserted) {
    editor.appendChild(figure);
  }
  const nextSibling = figure.nextElementSibling;
  if (!(nextSibling instanceof HTMLElement) || nextSibling.matches(".diary-image-block")) {
    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    figure.after(paragraph);
  }
  enhanceDiaryEditorFigures(runtime);
  selectDiaryEditorFigure(runtime, figure);
  focusDiaryEditor(runtime, {
    placeEnd: true,
  });
  scheduleDiaryEditorNativeInputRestart(runtime);
  return true;
}

function queueDiaryEditorToolbarSync(runtime) {
  if (
    !runtime ||
    runtime.destroyed ||
    runtime.toolbarSyncQueued ||
    runtime.toolbarInteractionActive
  ) {
    return;
  }
  runtime.toolbarSyncQueued = true;
  const schedule =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    runtime.toolbarSyncQueued = false;
    if (runtime.destroyed || runtime.toolbarInteractionActive) {
      return;
    }
    const editor = runtime?.elements?.editor;
    const liveRange =
      editor instanceof HTMLElement ? getDiaryEditorLiveRange(editor) : null;
    if (liveRange instanceof Range) {
      saveDiaryEditorSelection(runtime);
    }
    syncDiaryEditorToolbarState(runtime);
  });
}

function syncDiaryEditorToolbarState(runtime) {
  const toolbar = runtime?.elements?.toolbar;
  const editor = runtime?.elements?.editor;
  if (!(toolbar instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
    return;
  }
  toolbar.querySelectorAll("[data-editor-action]").forEach((button) => {
    button.classList.remove("is-active");
  });
  const range = getDiaryEditorToolbarStateRange(runtime);
  if (!(range instanceof Range)) {
    return;
  }
  const sizeToken = range.collapsed
    ? getDiaryEditorRangeBlockTextStyleToken(editor, range)
    : (() => {
        const sampleElements = getDiaryEditorSelectionSampleElements(editor, range);
        const sizeTokens = sampleElements.map((element) =>
          getDiaryEditorFontSizeTokenFromElement(element),
        );
        return sizeTokens.length && sizeTokens.every((token) => token === sizeTokens[0])
          ? sizeTokens[0]
          : "";
      })();
  const activeListStyle = getDiaryEditorRangeListStyle(editor, range);
  toolbar.querySelectorAll("[data-editor-action]").forEach((button) => {
    const action = button.getAttribute("data-editor-action") || "";
    const value = button.getAttribute("data-editor-value") || "";
    const shouldActivate =
      (action === "font-size" && value === sizeToken) ||
      (action === "bold" &&
        isDiaryEditorRangeUniformInlineStyle(editor, range, "strong, b")) ||
      (action === "italic" &&
        isDiaryEditorRangeUniformInlineStyle(editor, range, "em, i")) ||
      (action === "underline" &&
        isDiaryEditorRangeUniformInlineStyle(editor, range, "u")) ||
      (action === "highlight" &&
        isDiaryEditorRangeUniformInlineStyle(editor, range, "mark")) ||
      (action === "blockquote" && isDiaryEditorRangeBlockquoted(editor, range)) ||
      (action === "unordered-list" && value === activeListStyle) ||
      (action === "ordered-list" && activeListStyle === "decimal");
    button.classList.toggle("is-active", shouldActivate);
  });
}

function executeDiaryEditorToolbarAction(runtime, action, value = "") {
  traceDiaryEditorDebug(runtime, "toolbar-action-start", {
    action,
    value,
  });
  const syncWindowSelection = runtime?.toolbarSelectionHadEditorFocus === true;
  const actionRange = getDiaryEditorActionRange(runtime);
  const hasExpandedSelection =
    isDiaryEditorRangeMeaningfullyExpanded(actionRange) ||
    runtime?.toolbarSelectionHadExpandedText === true;
  const schedule =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  const normalizedSizeToken =
    action === "font-size"
      ? normalizeDiaryFontSizeToken(value) || DIARY_EDITOR_TEXT_STYLE_TOKENS.body
      : "";
  const fontScaleDelta =
    action === "font-scale" ? normalizeDiaryFontScaleValue(value, 0) : 0;
  let handled = false;
  if (action === "font-size") {
    handled =
      (hasExpandedSelection
        ? applyDiaryInlineWrapper(runtime, {
            tagName: "span",
            cleanupSelector: "[data-size], font",
            activeSelector: `[data-size="${escapeCssSelector(normalizedSizeToken)}"]`,
            isUniformActive: (editor, range) =>
              isDiaryEditorRangeUniformFontSize(editor, range, normalizedSizeToken),
            textStyleToken: normalizedSizeToken,
            unwrapOnly: normalizedSizeToken === DIARY_EDITOR_TEXT_STYLE_TOKENS.body,
            syncWindowSelection,
          }) ||
          toggleDiaryBlockTextStyleAtCaret(runtime, {
            textStyleToken: normalizedSizeToken,
            syncWindowSelection,
          })
        : toggleDiaryBlockTextStyleAtCaret(runtime, {
            textStyleToken: normalizedSizeToken,
            syncWindowSelection,
          }) ||
          applyDiaryInlineWrapper(runtime, {
            tagName: "span",
            cleanupSelector: "[data-size], font",
            activeSelector: `[data-size="${escapeCssSelector(normalizedSizeToken)}"]`,
            isUniformActive: (editor, range) =>
              isDiaryEditorRangeUniformFontSize(editor, range, normalizedSizeToken),
            textStyleToken: normalizedSizeToken,
            unwrapOnly: normalizedSizeToken === DIARY_EDITOR_TEXT_STYLE_TOKENS.body,
            syncWindowSelection,
          }));
  } else if (action === "font-scale") {
    const currentFontScale = getDiaryEditorRangeUniformFontScale(
      runtime?.elements?.editor,
      actionRange,
    );
    const nextFontScale = normalizeDiaryFontScaleValue(
      currentFontScale + fontScaleDelta,
      currentFontScale,
    );
    handled =
      (hasExpandedSelection
        ? applyDiaryInlineWrapper(runtime, {
            tagName: "span",
            cleanupSelector: "[data-font-scale]",
            activeSelector: `[data-font-scale="${escapeCssSelector(nextFontScale)}"]`,
            attributes:
              nextFontScale === 0
                ? {}
                : {
                    "data-font-scale": String(nextFontScale),
                  },
            unwrapOnly: nextFontScale === 0,
            toggle: false,
            syncWindowSelection,
          })
        : adjustDiaryBlockFontScaleAtCaret(runtime, fontScaleDelta, {
            syncWindowSelection,
          })) ||
      (nextFontScale !== 0
        ? applyDiaryInlineStyleAtCaret(runtime, {
            tagName: "span",
            attributes: {
              "data-font-scale": String(nextFontScale),
            },
            syncWindowSelection,
          })
        : false);
  } else if (action === "bold") {
    handled =
      (hasExpandedSelection
        ? applyDiaryInlineWrapper(runtime, {
            tagName: "strong",
            cleanupSelector: "strong, b",
            activeSelector: "strong, b",
            syncWindowSelection,
          })
        : toggleDiaryBlockInlineStyleAtCaret(runtime, {
            tagName: "strong",
            cleanupSelector: "strong, b",
            activeSelector: "strong, b",
            syncWindowSelection,
          })) ||
      toggleDiaryInlineStyleAtCaret(runtime, {
        activeSelector: "strong, b",
        syncWindowSelection,
      }) ||
      applyDiaryInlineStyleAtCaret(runtime, {
        tagName: "strong",
        syncWindowSelection,
      });
  } else if (action === "italic") {
    handled =
      (hasExpandedSelection
        ? applyDiaryInlineWrapper(runtime, {
            tagName: "em",
            cleanupSelector: "em, i",
            activeSelector: "em, i",
            syncWindowSelection,
          })
        : toggleDiaryBlockInlineStyleAtCaret(runtime, {
            tagName: "em",
            cleanupSelector: "em, i",
            activeSelector: "em, i",
            syncWindowSelection,
          })) ||
      toggleDiaryInlineStyleAtCaret(runtime, {
        activeSelector: "em, i",
        syncWindowSelection,
      }) ||
      applyDiaryInlineStyleAtCaret(runtime, {
        tagName: "em",
        syncWindowSelection,
      });
  } else if (action === "underline") {
    handled =
      (hasExpandedSelection
        ? applyDiaryInlineWrapper(runtime, {
            tagName: "u",
            cleanupSelector: "u",
            activeSelector: "u",
            syncWindowSelection,
          })
        : toggleDiaryBlockInlineStyleAtCaret(runtime, {
            tagName: "u",
            cleanupSelector: "u",
            activeSelector: "u",
            syncWindowSelection,
          })) ||
      toggleDiaryInlineStyleAtCaret(runtime, {
        activeSelector: "u",
        syncWindowSelection,
      }) ||
      applyDiaryInlineStyleAtCaret(runtime, {
        tagName: "u",
        syncWindowSelection,
      });
  } else if (action === "highlight") {
    handled =
      applyDiaryInlineWrapper(runtime, {
        tagName: "mark",
        cleanupSelector: "mark, span[style], font",
        activeSelector: "mark",
        syncWindowSelection,
      }) ||
      toggleDiaryInlineStyleAtCaret(runtime, {
        activeSelector: "mark",
        syncWindowSelection,
      }) ||
      applyDiaryInlineStyleAtCaret(runtime, {
        tagName: "mark",
        syncWindowSelection,
      });
  } else if (action === "blockquote") {
    handled = toggleDiaryBlockquoteForSelection(runtime, {
      syncWindowSelection,
    });
  } else if (action === "unordered-list") {
    const range = getDiaryEditorActionRange(runtime);
    if (!(range instanceof Range)) {
      return;
    }
    updateDiaryEditorSelection(runtime, range, {
      syncWindowSelection: true,
    });
    restoreDiaryEditorFocusAfterToolbarAction(runtime);
    document.execCommand("insertUnorderedList", false);
    const list = getDiaryEditorSelectionAnchor(runtime?.elements?.editor)?.closest("ul");
    if (list instanceof HTMLElement) {
      list.dataset.listStyle = normalizeDiaryListStyle(value);
    }
    handled = true;
  } else if (action === "ordered-list") {
    const range = getDiaryEditorActionRange(runtime);
    if (!(range instanceof Range)) {
      return;
    }
    updateDiaryEditorSelection(runtime, range, {
      syncWindowSelection: true,
    });
    restoreDiaryEditorFocusAfterToolbarAction(runtime);
    document.execCommand("insertOrderedList", false);
    handled = true;
  }
  if (!handled) {
    traceDiaryEditorDebug(runtime, "toolbar-action-skipped", {
      action,
      value,
    });
    return;
  }
  const postActionRange =
    runtime?.savedSelectionRange instanceof Range
      ? runtime.savedSelectionRange.cloneRange()
      : null;
  restoreDiaryEditorFocusAfterToolbarAction(runtime);
  scheduleDiaryEditorNativeInputRestart(runtime);
  runtime?.handleChange?.();
  syncDiaryEditorToolbarState(runtime);
  if (syncWindowSelection && postActionRange instanceof Range) {
    schedule(() => {
      if (runtime?.destroyed) {
        return;
      }
      runtime.savedSelectionRange = postActionRange.cloneRange();
      restoreDiaryEditorSelection(runtime, {
        forceFocus: true,
      });
      syncDiaryEditorToolbarState(runtime);
    });
  }
  traceDiaryEditorDebug(runtime, "toolbar-action-end", {
    action,
    value,
  });
}

function createDiaryEditorToolbar(runtime) {
  const toolbar = runtime?.elements?.toolbar;
  if (!(toolbar instanceof HTMLElement)) {
    return;
  }
  const toolbarGroups = [
    [
      { label: "标题", action: "font-size", value: "title", className: "is-style-pill" },
      { label: "副标题", action: "font-size", value: "subtitle", className: "is-style-pill" },
      { label: "小标题", action: "font-size", value: "subheading", className: "is-style-pill" },
      { label: "正文", action: "font-size", value: "body", className: "is-style-pill" },
      { label: "注释", action: "font-size", value: "note", className: "is-style-pill" },
    ],
    [
      { label: "A-", action: "font-scale", value: "-1", className: "is-style-pill" },
      { label: "A+", action: "font-scale", value: "1", className: "is-style-pill" },
    ],
    [
      { label: "B", action: "bold", className: "is-icon-btn" },
      { label: "I", action: "italic", className: "is-icon-btn" },
      { label: "U", action: "underline", className: "is-icon-btn" },
      { label: "高亮", action: "highlight" },
      { label: "引用", action: "blockquote" },
    ],
    [
      { label: "●", action: "unordered-list", value: "disc", className: "is-icon-btn" },
      { label: "○", action: "unordered-list", value: "circle", className: "is-icon-btn" },
      { label: "■", action: "unordered-list", value: "square", className: "is-icon-btn" },
      { label: "1.", action: "ordered-list", value: "decimal" },
    ],
  ];
  toolbar.innerHTML = toolbarGroups
    .map(
      (items, groupIndex) => `
        <div class="diary-editor-toolbar-group ${groupIndex === 0 ? "is-style-group" : "is-action-group"}">
          ${items
            .map(
              (item) => `
                <button
                  class="diary-editor-toolbar-btn ${escapeHtml(item.className || "")}"
                  type="button"
                  data-controler-keep-input-focus="true"
                  data-editor-action="${escapeHtml(item.action)}"
                  data-editor-value="${escapeHtml(item.value || "")}"
                >
                  ${escapeHtml(item.label)}
                </button>
              `,
            )
            .join("")}
        </div>
      `,
    )
    .join("");
  const beginToolbarInteraction = (event) => {
    const targetButton =
      event.target instanceof Element
        ? event.target.closest(".diary-editor-toolbar-btn")
        : null;
    if (!(targetButton instanceof HTMLElement) || !toolbar.contains(targetButton)) {
      return;
    }
    event.stopPropagation();
    runtime.toolbarInteractionActive = true;
    saveDiaryEditorSelection(runtime, {
      preserveExisting: true,
    });
    runtime.toolbarSelectionHadEditorFocus =
      document.activeElement === runtime?.elements?.editor ||
      (runtime.savedSelectionRange instanceof Range &&
        runtime.elements?.editor?.contains(
          runtime.savedSelectionRange.commonAncestorContainer,
        ));
    runtime.toolbarSavedSelectionRange =
      runtime.savedSelectionRange instanceof Range
        ? runtime.savedSelectionRange.cloneRange()
        : null;
    runtime.toolbarSelectionHadExpandedText = isDiaryEditorRangeMeaningfullyExpanded(
      runtime.toolbarSavedSelectionRange,
    );
  };
  const resetToolbarInteraction = () => {
    runtime.toolbarInteractionActive = false;
    runtime.toolbarSelectionHadEditorFocus = false;
    runtime.toolbarSavedSelectionRange = null;
    runtime.toolbarSelectionHadExpandedText = false;
  };
  toolbar.addEventListener("pointerdown", beginToolbarInteraction, true);
  toolbar.addEventListener("mousedown", beginToolbarInteraction, true);
  toolbar.addEventListener("pointercancel", resetToolbarInteraction, true);
  toolbar.querySelectorAll(".diary-editor-toolbar-btn").forEach((button) => {
    button.tabIndex = -1;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (runtime.toolbarSavedSelectionRange instanceof Range) {
        runtime.savedSelectionRange = runtime.toolbarSavedSelectionRange.cloneRange();
      }
      executeDiaryEditorToolbarAction(
        runtime,
        button.getAttribute("data-editor-action") || "",
        button.getAttribute("data-editor-value") || "",
      );
      window.setTimeout(() => {
        resetToolbarInteraction();
        runtime.syncToolbarState?.();
      }, 0);
    });
  });
}

function showDiaryEditorChoiceDialog() {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.zIndex = "2600";
    modal.dataset.controlerOpenProtectionDurationMs = "220";
    modal.dataset.controlerCloseProtectionDurationMs = "220";
    modal.dataset.controlerActionProtectionDurationMs = "220";
    modal.dataset.controlerInteractionShieldDurationMs = "220";
    modal.innerHTML = `
      <div class="modal-content ms diary-editor-choice-modal">
        <h3>图片上传方式</h3>
        <p>压缩上传默认推荐。非透明图会压到长边 2048px，透明图保留 PNG。</p>
        <div class="diary-editor-choice-actions">
          <button class="bts" type="button" data-choice="compressed">压缩上传（推荐）</button>
          <button class="bts" type="button" data-choice="original">原图上传</button>
          <button class="bts" type="button" data-choice="cancel">取消</button>
        </div>
      </div>
    `;
    let settled = false;
    const settleDialog = (result = "") => {
      if (settled) {
        return;
      }
      settled = true;
      modal.__controlerCloseModal = null;
      if (typeof uiTools?.closeModal === "function") {
        uiTools.closeModal(modal);
      } else if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      window.setTimeout(() => {
        resolve(result);
      }, 220);
    };
    modal.__controlerCloseModal = () => settleDialog("");
    if (typeof uiTools?.prepareModalOverlay === "function") {
      uiTools.prepareModalOverlay(modal, {
        zIndex: 2600,
        scope: "viewport",
      });
      uiTools?.bindModalAction?.(modal, '[data-choice="compressed"]', () => {
        settleDialog("compressed");
      });
      uiTools?.bindModalAction?.(modal, '[data-choice="original"]', () => {
        settleDialog("original");
      });
      uiTools?.bindModalAction?.(modal, '[data-choice="cancel"]', () => {
        settleDialog("");
      });
      uiTools?.bindModalBackdropDismiss?.(modal, () => {
        settleDialog("");
      });
    } else {
      document.body.appendChild(modal);
      uiTools?.stopModalContentPropagation?.(modal);
      modal.addEventListener("click", (event) => {
        const choiceButton =
          event.target instanceof HTMLElement
            ? event.target.closest("[data-choice]")
            : null;
        if (choiceButton instanceof HTMLElement) {
          const choice = choiceButton.dataset.choice || "cancel";
          event.preventDefault();
          event.stopPropagation();
          settleDialog(choice === "cancel" ? "" : choice);
          return;
        }
        if (event.target === modal) {
          event.preventDefault();
          event.stopPropagation();
          settleDialog("");
        }
      });
    }
  });
}

async function insertDiaryImagesIntoEditor(runtime) {
  const resolveLiveRuntime = () => {
    const candidates = [runtime, diaryEditorRuntime];
    return candidates.find(
      (candidate) =>
        candidate &&
        candidate.destroyed !== true &&
        candidate.elements?.editor instanceof HTMLElement &&
        candidate.elements.editor.isConnected,
    );
  };
  if (!resolveLiveRuntime()) {
    return;
  }
  if (
    typeof window.ControlerStorage?.pickDiaryImages !== "function" ||
    typeof window.ControlerStorage?.saveDiaryImageAsset !== "function"
  ) {
    await showDiaryAlert("当前运行环境不支持日记图片存储。");
    return;
  }
  const compressionMode = await showDiaryEditorChoiceDialog();
  if (!compressionMode) {
    return;
  }
  const initialRuntime = resolveLiveRuntime();
  if (!initialRuntime) {
    return;
  }
  setDiaryEditorSaveState(initialRuntime, "saving");
  try {
    const pickedItems =
      (await window.ControlerStorage.pickDiaryImages({
        accept: "image/*",
        multiple: true,
      })) || [];
    const restoreSaveState = (targetRuntime) => {
      if (!targetRuntime || targetRuntime.destroyed) {
        return;
      }
      setDiaryEditorSaveState(
        targetRuntime,
        buildDiaryEditorSnapshot(targetRuntime).signature === targetRuntime.lastCommittedSignature
          ? "saved"
          : "pending",
      );
    };
    const activeRuntime = resolveLiveRuntime();
    if (!activeRuntime) {
      return;
    }
    if (!pickedItems.length) {
      restoreSaveState(activeRuntime);
      return;
    }
    let insertedCount = 0;
    let failedCount = 0;
    const insertedAttachments = [];
    for (const item of pickedItems) {
      const currentRuntime = resolveLiveRuntime();
      if (!currentRuntime) {
        failedCount += 1;
        break;
      }
      const savedAsset = await window.ControlerStorage.saveDiaryImageAsset({
        sourceUri: item?.uri || item?.sourceUri || "",
        uri: item?.uri || "",
        dataUrl: item?.dataUrl || "",
        fileName: item?.fileName || "",
        mimeType: item?.mimeType || "",
        width: item?.width,
        height: item?.height,
        compressionMode,
      });
      if (!savedAsset?.assetId) {
        failedCount += 1;
        continue;
      }
      if (savedAsset.uri) {
        rememberDiaryImageUriCache(savedAsset.assetId, savedAsset.uri);
      }
      const aspectRatio =
        Number(savedAsset.width) > 0 && Number(savedAsset.height) > 0
          ? Number(savedAsset.width) / Math.max(1, Number(savedAsset.height))
          : Number(item?.width) > 0 && Number(item?.height) > 0
            ? Number(item.width) / Math.max(1, Number(item.height))
            : 4 / 3;
      const attachment = normalizeDiaryAttachment({
        id: createUniqueId("diary_attachment_"),
        assetId: savedAsset.assetId,
        mimeType: savedAsset.mimeType || item?.mimeType || "image/jpeg",
        widthPercent: resolveDiaryInsertedImageWidthPercent(currentRuntime, aspectRatio),
        align: "center",
        offsetXPercent: 0,
        aspectRatio,
        blockOrder:
          currentRuntime.elements?.editor?.querySelectorAll?.(".diary-image-block")?.length ||
          0,
        compressionMode: savedAsset.compressionMode || compressionMode,
      });
      if (!attachment) {
        failedCount += 1;
        continue;
      }
      const figure = buildDiaryEditorFigureElement(attachment);
      if (!(figure instanceof HTMLElement)) {
        failedCount += 1;
        continue;
      }
      const image = figure.querySelector("img[data-asset-id], img");
      const previewUri =
        savedAsset.uri || item?.dataUrl || item?.uri || item?.sourceUri || "";
      if (!savedAsset.uri && previewUri) {
        rememberDiaryImageUriCache(savedAsset.assetId, previewUri);
      }
      if (image instanceof HTMLImageElement && previewUri) {
        image.src = previewUri;
        image.dataset.hydrated = "true";
      }
      if (!insertDiaryEditorFigureAtSelection(currentRuntime, figure)) {
        failedCount += 1;
        continue;
      }
      currentRuntime.lastKnownAttachments = mergeDiaryAttachmentsSnapshot(
        currentRuntime.lastKnownAttachments || [],
        [attachment],
      );
      insertedAttachments.push(attachment);
      insertedCount += 1;
    }
    const finalRuntime = resolveLiveRuntime();
    if (insertedCount > 0 && finalRuntime) {
      const reconciled = reconcileDiaryEditorInsertedImages(
        finalRuntime,
        insertedAttachments,
      );
      if (reconciled) {
        refreshDiaryEditorFooter(finalRuntime, {
          content: extractDiaryPlainTextFromHtml(reconciled.html),
          attachments: reconciled.attachments,
        });
      }
      finalRuntime.handleChange?.();
      if (failedCount > 0) {
        await showDiaryAlert(`已有 ${insertedCount} 张插入，另有 ${failedCount} 张上传失败。`, {
          title: "部分上传失败",
          danger: true,
        });
      }
    } else {
      restoreSaveState(finalRuntime || activeRuntime);
      if (failedCount > 0) {
        setDiaryEditorSaveState(finalRuntime || activeRuntime, "error");
        await showDiaryAlert("图片上传失败，请重试。", {
          title: "上传失败",
          danger: true,
        });
      }
    }
  } catch (error) {
    console.error("插入日记图片失败:", error);
    const activeRuntime = resolveLiveRuntime();
    setDiaryEditorSaveState(activeRuntime || runtime, "error");
    await showDiaryAlert("图片上传失败，请重试。", {
      title: "上传失败",
      danger: true,
    });
  }
}

function isDiaryEditorKeyboardOpen() {
  return (
    document.documentElement?.classList.contains("controler-keyboard-open") === true ||
    document.body?.classList.contains("controler-keyboard-open") === true
  );
}

async function dismissDiaryEditorKeyboard(runtime, options = {}) {
  const titleInput = runtime?.elements?.titleInput;
  const editor = runtime?.elements?.editor;
  const activeElement = document.activeElement;
  const hadFocusedEditorField =
    activeElement instanceof HTMLElement &&
    (activeElement === titleInput || activeElement === editor);
  const shouldWait =
    isDiaryEditorKeyboardOpen() ||
    (window.ControlerStorage?.isNativeApp === true && hadFocusedEditorField);
  if (!shouldWait) {
    return false;
  }
  if (typeof uiTools?.releaseAndroidInteractiveTextControlFocus === "function") {
    uiTools.releaseAndroidInteractiveTextControlFocus();
  }
  if (titleInput instanceof HTMLElement) {
    titleInput.blur?.();
  }
  if (editor instanceof HTMLElement) {
    editor.blur?.();
    window.getSelection()?.removeAllRanges?.();
  }
  const minDelayMs = Math.max(80, Math.round(Number(options.minDelayMs) || 120));
  const maxWaitMs = Math.max(minDelayMs, Math.round(Number(options.maxWaitMs) || 520));
  const startedAt = Date.now();
  await new Promise((resolve) => {
    const poll = () => {
      const elapsedMs = Date.now() - startedAt;
      if ((!isDiaryEditorKeyboardOpen() && elapsedMs >= minDelayMs) || elapsedMs >= maxWaitMs) {
        resolve();
        return;
      }
      window.setTimeout(poll, 36);
    };
    window.setTimeout(poll, 36);
  });
  return true;
}

async function closeDiaryEditorAfterKeyboardDismiss(runtime, options = {}) {
  if (!runtime || runtime.destroyed || runtime.closingAfterKeyboardDismiss === true) {
    return false;
  }
  runtime.closingAfterKeyboardDismiss = true;
  try {
    const keyboardDismissed = await dismissDiaryEditorKeyboard(runtime, {
      minDelayMs: 120,
      maxWaitMs: 560,
    });
    if (keyboardDismissed) {
      runtime.lastKeyboardDismissBeforeCloseAt = Date.now();
      await new Promise((resolve) => {
        window.setTimeout(resolve, 64);
      });
    }
    return runtime.close?.({
      reason: typeof options.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "done",
    });
  } finally {
    runtime.closingAfterKeyboardDismiss = false;
  }
}

function openDiaryEditorPage(dateText, entryId = null) {
  if (isDiaryEditorVisible()) {
    diaryEditorRuntime.pendingOpen = {
      dateText,
      entryId,
    };
    void diaryEditorRuntime.close?.({
      reason: "switch-entry",
    });
    return;
  }

  const existingEntry = findDiaryEntry(dateText, entryId);
  const normalizedEntry = existingEntry ? normalizeDiaryEntry(existingEntry).value : null;
  const overlay = document.createElement("div");
  overlay.className = "diary-editor-overlay";
  overlay.dataset.controlerModalParentSurface = "true";
  overlay.innerHTML = `
    <div class="diary-editor-page">
      <div class="diary-editor-topbar">
        <button class="diary-editor-nav-btn" type="button" data-diary-editor-action="back" aria-label="返回">&lt;</button>
        <div class="diary-editor-topbar-copy">
          <div class="diary-editor-topbar-date">${escapeHtml(dateText)}</div>
          <div class="diary-editor-topbar-status" id="diary-editor-topbar-status">已保存</div>
        </div>
        <div class="diary-editor-topbar-actions">
          ${
            normalizedEntry
              ? '<button class="diary-editor-secondary-btn" type="button" data-diary-editor-action="delete">删除</button>'
              : ""
          }
          <button class="diary-editor-primary-btn" type="button" data-diary-editor-action="done">完成</button>
        </div>
      </div>
      <div class="diary-editor-body">
        <label class="diary-editor-field">
          <span class="diary-editor-label">标题</span>
          <input id="diary-editor-title-input" class="diary-editor-title-input" type="text" placeholder="输入标题">
        </label>
        <div class="diary-editor-field">
          <span class="diary-editor-label">分类</span>
          <div id="diary-editor-category-selector"></div>
        </div>
        <div class="diary-editor-field">
          <span class="diary-editor-label">文本样式</span>
          <div id="diary-editor-toolbar" class="diary-editor-toolbar"></div>
        </div>
        <div class="diary-editor-field diary-editor-field--content">
          <span class="diary-editor-label">正文</span>
          <div id="diary-editor-content" class="diary-editor-content" contenteditable="true" spellcheck="true" data-controler-android-focus-assist="false" data-i18n-skip="true"></div>
        </div>
        <div class="diary-editor-image-actions">
          <button class="diary-editor-secondary-btn" type="button" data-controler-keep-input-focus="true" data-diary-editor-action="insert-image">上传图片</button>
          <span class="diary-editor-image-hint">默认推荐压缩上传，图片单独持久化，避免冷启动和保存拖慢。</span>
        </div>
        <div class="diary-editor-footer">
          <div id="diary-editor-word-count">正文 0 字</div>
          <div id="diary-editor-image-count">图片 0 张</div>
          <div id="diary-editor-save-status">已保存</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("diary-editor-active");

  const runtime = {
    root: overlay,
    destroyed: false,
    dateText,
    entryId: normalizedEntry?.id || entryId || null,
    isEditMode: !!normalizedEntry,
    draftKey: getDiaryEditorDraftKey(dateText, normalizedEntry?.id || entryId || null),
    pendingOpen: null,
    saveState: "saved",
    savePromise: null,
    draftTimer: 0,
    autosaveTimer: 0,
    lastCommittedSignature: "",
    lastDraftSignature: "",
    lastKnownAttachments: cloneDiaryAttachmentsSnapshot(normalizedEntry?.attachments || []),
    initialAttachments: cloneDiaryAttachmentsSnapshot(normalizedEntry?.attachments || []),
    selectedFigure: null,
    savedSelectionRange: null,
    toolbarSavedSelectionRange: null,
    toolbarSelectionHadEditorFocus: false,
    toolbarSelectionHadExpandedText: false,
    toolbarSyncQueued: false,
    toolbarInteractionActive: false,
    closingAfterKeyboardDismiss: false,
    lastKeyboardDismissBeforeCloseAt: 0,
    closeAnimationPromise: null,
    nativeInputRestartTimer: 0,
    nativeInputRestartQueued: false,
    categorySelector: null,
    handleChange: null,
    close: null,
    historyToken: "",
    historyPushed: false,
    suppressHistoryPopClose: false,
    userInteracted: false,
    debugTraceEnabled: window.__CONTROLER_DIARY_EDITOR_DEBUG__ === true,
  };
  runtime.elements = {
    titleInput: overlay.querySelector("#diary-editor-title-input"),
    categoryHost: overlay.querySelector("#diary-editor-category-selector"),
    toolbar: overlay.querySelector("#diary-editor-toolbar"),
    editor: overlay.querySelector("#diary-editor-content"),
    topStatus: overlay.querySelector("#diary-editor-topbar-status"),
    saveStatus: overlay.querySelector("#diary-editor-save-status"),
    wordCount: overlay.querySelector("#diary-editor-word-count"),
    imageCount: overlay.querySelector("#diary-editor-image-count"),
    backButton: overlay.querySelector('[data-diary-editor-action="back"]'),
    doneButton: overlay.querySelector('[data-diary-editor-action="done"]'),
    deleteButton: overlay.querySelector('[data-diary-editor-action="delete"]'),
    insertImageButton: overlay.querySelector('[data-diary-editor-action="insert-image"]'),
  };
  diaryEditorRuntime = runtime;
  runtime.markUserInteracted = () => {
    if (runtime.destroyed) {
      return;
    }
    runtime.userInteracted = true;
  };
  if (shouldDiaryEditorUseHistoryBackClose()) {
    runtime.historyToken = `controler-diary-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    history.pushState(
      {
        ...(history.state && typeof history.state === "object" ? history.state : {}),
        __controlerDiaryEditorToken: runtime.historyToken,
      },
      "",
    );
    runtime.historyPushed = true;
    runtime.handlePopState = () => {
      if (runtime.destroyed) {
        return;
      }
      if (runtime.suppressHistoryPopClose) {
        runtime.suppressHistoryPopClose = false;
        return;
      }
      if (history.state?.__controlerDiaryEditorToken === runtime.historyToken) {
        return;
      }
      void runtime.close?.({
        reason: "history-pop",
      });
    };
    window.addEventListener("popstate", runtime.handlePopState, true);
  }

  const scheduleDraftSave = () => {
    window.clearTimeout(runtime.draftTimer);
    runtime.draftTimer = window.setTimeout(() => {
      void persistDraft().catch((error) => {
        console.error("写入日记编辑页草稿失败:", error);
      });
    }, DIARY_DRAFT_SAVE_DELAY_MS);
  };

  const scheduleAutosave = () => {
    window.clearTimeout(runtime.autosaveTimer);
    runtime.autosaveTimer = window.setTimeout(() => {
      void saveSnapshot({
        reason: "autosave",
      });
    }, DIARY_AUTOSAVE_DELAY_MS);
  };

  const persistDraft = async () => {
    if (
      runtime.destroyed ||
      typeof window.ControlerStorage?.setDraft !== "function"
    ) {
      return false;
    }
    const snapshot = buildDiaryEditorSnapshot(runtime);
    runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(snapshot.attachments);
    refreshDiaryEditorFooter(runtime, snapshot);
    if (!snapshot.meaningful || snapshot.signature === runtime.lastCommittedSignature) {
      await removeDiaryEditorDraft(runtime);
      runtime.lastDraftSignature = "";
      return true;
    }
    if (snapshot.signature === runtime.lastDraftSignature) {
      return true;
    }
    await window.ControlerStorage.setDraft(
      runtime.draftKey,
      {
        dateText,
        entryId: runtime.entryId,
        title: snapshot.rawTitle,
        content: snapshot.content,
        contentHtml: snapshot.contentHtml,
        categoryId: snapshot.categoryId,
        attachments: snapshot.attachments,
      },
      {
        scope: "diary",
      },
    );
    runtime.lastDraftSignature = snapshot.signature;
    return true;
  };

  const saveSnapshot = async ({ reason = "autosave" } = {}) => {
    if (runtime.destroyed) {
      return true;
    }
    if (runtime.savePromise) {
      return runtime.savePromise;
    }
    const task = (async () => {
      const snapshot = buildDiaryEditorSnapshot(runtime);
      runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(snapshot.attachments);
      refreshDiaryEditorFooter(runtime, snapshot);
      if (!snapshot.meaningful && !runtime.isEditMode) {
        await removeDiaryEditorDraft(runtime);
        runtime.lastDraftSignature = "";
        setDiaryEditorSaveState(runtime, "saved");
        return {
          status: "blank",
          snapshot,
        };
      }
      if (snapshot.signature === runtime.lastCommittedSignature) {
        await removeDiaryEditorDraft(runtime);
        runtime.lastDraftSignature = "";
        setDiaryEditorSaveState(runtime, "saved");
        return {
          status: "noop",
          snapshot,
        };
      }

      setDiaryEditorSaveState(runtime, "saving");
      const mutationSnapshot = captureDiaryMutationSnapshot();
      const now = new Date().toISOString();
      try {
        let targetEntry = findDiaryEntry(dateText, runtime.entryId);
        const previousAttachments = cloneDiaryAttachmentsSnapshot(
          targetEntry?.attachments || [],
        );
        if (targetEntry) {
          targetEntry.title = snapshot.title;
          targetEntry.content = snapshot.content;
          targetEntry.contentHtml = snapshot.contentHtml;
          targetEntry.contentVersion = DIARY_CONTENT_VERSION;
          targetEntry.attachments = cloneDiaryAttachmentsSnapshot(
            snapshot.attachments,
          );
          targetEntry.categoryId = snapshot.categoryId;
          targetEntry.updatedAt = now;
        } else {
          const createdEntry = new DiaryEntry(
            dateText,
            snapshot.title,
            snapshot.content,
            snapshot.categoryId,
            {
              contentHtml: snapshot.contentHtml,
              attachments: snapshot.attachments,
            },
          );
          createdEntry.id = runtime.entryId || createdEntry.id;
          createdEntry.createdAt = now;
          createdEntry.updatedAt = now;
          diaryEntries.push(createdEntry);
          targetEntry = createdEntry;
          runtime.entryId = createdEntry.id;
          runtime.isEditMode = true;
        }
        syncDiaryDataIndex();
        const saved = await saveDiaryData({
          changedPeriodIds: [getDiaryEntryPeriodId(targetEntry || { date: dateText })],
          pruneDiaryImages: hasDiaryAttachmentReferenceRemoval(
            previousAttachments,
            snapshot.attachments,
          ),
        });
        if (!saved) {
          restoreDiaryMutationSnapshot(mutationSnapshot);
          setDiaryEditorSaveState(runtime, "error");
          return false;
        }
        runtime.initialAttachments = cloneDiaryAttachmentsSnapshot(snapshot.attachments);
        runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(snapshot.attachments);
        runtime.lastCommittedSignature = snapshot.signature;
        runtime.lastDraftSignature = "";
        await removeDiaryEditorDraft(runtime);
        const latestSnapshot = buildDiaryEditorSnapshot(runtime);
        runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(
          latestSnapshot.attachments,
        );
        setDiaryEditorSaveState(
          runtime,
          latestSnapshot.signature === runtime.lastCommittedSignature
            ? "saved"
            : "pending",
        );
        if (
          latestSnapshot.signature !== runtime.lastCommittedSignature &&
          reason !== "autosave"
        ) {
          scheduleAutosave();
        }
        refreshDiaryEditorFooter(runtime, latestSnapshot);
        return {
          status: "saved",
          snapshot,
        };
      } catch (error) {
        console.error("保存日记编辑页失败:", error);
        restoreDiaryMutationSnapshot(mutationSnapshot);
        setDiaryEditorSaveState(runtime, "error");
        return false;
      }
    })();
    runtime.savePromise = task.finally(() => {
      runtime.savePromise = null;
    });
    return runtime.savePromise;
  };

  const destroyEditor = () => {
    if (runtime.destroyed) {
      return;
    }
    runtime.destroyed = true;
    window.clearTimeout(runtime.draftTimer);
    window.clearTimeout(runtime.autosaveTimer);
    window.clearTimeout(runtime.nativeInputRestartTimer);
    document.removeEventListener("selectionchange", runtime.handleSelectionChange, true);
    document.removeEventListener(
      "visibilitychange",
      runtime.handleVisibilityChange,
      true,
    );
    overlay.removeEventListener("pointerdown", runtime.handleOverlayPointerDown, true);
    window.removeEventListener("pagehide", runtime.handlePageHide, true);
    window.removeEventListener("popstate", runtime.handlePopState, true);
    runtime.categorySelector?.destroy?.();
    clearDiaryEditorFigureSelection(runtime);
    overlay.remove();
    document.body.classList.remove("diary-editor-active");
    if (diaryEditorRuntime === runtime) {
      diaryEditorRuntime = null;
    }
    if (
      runtime.historyPushed &&
      !runtime.suppressHistoryPopClose &&
      history.state?.__controlerDiaryEditorToken === runtime.historyToken
    ) {
      runtime.suppressHistoryPopClose = true;
      history.back();
    }
    if (runtime.pendingOpen) {
      const nextOpen = runtime.pendingOpen;
      runtime.pendingOpen = null;
      openDiaryEditorPage(nextOpen.dateText, nextOpen.entryId);
    }
  };

  const animateDiaryEditorClose = async () => {
    const closeRoot = runtime?.root;
    if (
      !(closeRoot instanceof HTMLElement) ||
      !closeRoot.isConnected ||
      runtime.destroyed
    ) {
      return false;
    }
    if (runtime.closeAnimationPromise) {
      return runtime.closeAnimationPromise;
    }
    const recentlyDismissedKeyboard =
      Date.now() - Number(runtime.lastKeyboardDismissBeforeCloseAt || 0) < 420;
    const closeVisualDurationMs = readDiaryEditorCloseVisualDurationMs(closeRoot);
    runtime.closeAnimationPromise = new Promise((resolve) => {
      const startAnimation = () => {
        if (!(closeRoot instanceof HTMLElement) || !closeRoot.isConnected) {
          resolve(false);
          return;
        }
        closeRoot.classList.add("is-closing");
        closeRoot.setAttribute("aria-hidden", "true");
        window.setTimeout(resolve, closeVisualDurationMs);
      };
      if (recentlyDismissedKeyboard) {
        window.setTimeout(startAnimation, 48);
        return;
      }
      startAnimation();
    }).finally(() => {
      runtime.closeAnimationPromise = null;
    });
    return runtime.closeAnimationPromise;
  };

  const flushEditor = async ({ closeAfter = false, reason = "flush" } = {}) => {
    window.clearTimeout(runtime.draftTimer);
    window.clearTimeout(runtime.autosaveTimer);
    while (runtime.savePromise) {
      await runtime.savePromise;
    }
    const snapshot = buildDiaryEditorSnapshot(runtime);
    runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(snapshot.attachments);
    if (!snapshot.meaningful && !runtime.isEditMode) {
      await removeDiaryEditorDraft(runtime);
      await cleanupDiaryEditorUnreferencedAssets(runtime, snapshot);
      if (closeAfter) {
        await animateDiaryEditorClose();
        destroyEditor();
      }
      return true;
    }
    const saveResult = await saveSnapshot({
      reason,
    });
    if (saveResult === false) {
      if (closeAfter) {
        await showDiaryAlert("保存失败，内容仍停留在当前编辑页。", {
          title: "保存失败",
          danger: true,
        });
      }
      return false;
    }
    if (closeAfter) {
      await refreshDiaryVisibleView({
        includeGuideCard: true,
        root: ".diary-main",
        quietWindowMs: 72,
        maxWaitMs: 520,
        minQuietFrames: 3,
      });
      await animateDiaryEditorClose();
      destroyEditor();
    }
    return true;
  };

  const deleteCurrentEntry = async () => {
    if (!runtime.entryId) {
      return;
    }
    const confirmed = await requestDiaryConfirmation("确定删除该日记吗？", {
      title: "删除日记",
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
      beforeConfirmClose: () => showDiaryDeleteLoadingState(),
    });
    if (!confirmed) {
      return;
    }
    setDiaryEditorSaveState(runtime, "saving");
    const mutationSnapshot = captureDiaryMutationSnapshot();
    const targetEntry = findDiaryEntry(dateText, runtime.entryId);
    if (!targetEntry) {
      setDiaryEditorSaveState(runtime, "error");
      await showDiaryAlert("未找到要删除的日记。", {
        title: "删除失败",
        danger: true,
      });
      return;
    }
    const previousGuideState = readDiaryGuideState();
    const nextGuideState =
      typeof window.ControlerGuideBundle?.dismissGuideDiaryEntry === "function"
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
    if (!deleteDiaryEntry(runtime.entryId, dateText)) {
      restoreDiaryMutationSnapshot(mutationSnapshot);
      setDiaryEditorSaveState(runtime, "error");
      await showDiaryAlert("未找到要删除的日记。", {
        title: "删除失败",
        danger: true,
      });
      return;
    }
    syncDiaryDataIndex();
    await showDiaryDeleteLoadingState();
    const saved = await saveDiaryData({
      changedPeriodIds: [getDiaryEntryPeriodId(targetEntry || { date: dateText })],
      guideStateChanged,
      pruneDiaryImages: Array.isArray(targetEntry?.attachments)
        ? targetEntry.attachments.length > 0
        : false,
    });
    if (!saved) {
      restoreDiaryMutationSnapshot(mutationSnapshot);
      setDiaryEditorSaveState(runtime, "error");
      await setDiaryLoadingState({
        active: false,
        settledRoot: ".diary-main",
        settleQuietWindowMs: 72,
        settleMaxWaitMs: 520,
        settleMinQuietFrames: 3,
      });
      await showDiaryAlert("删除失败，已恢复删除前内容。", {
        title: "删除失败",
        danger: true,
      });
      return;
    }
    await removeDiaryEditorDraft(runtime);
    await refreshDiaryVisibleView({
      includeGuideCard: true,
      root: ".diary-main",
      quietWindowMs: 72,
      maxWaitMs: 520,
      minQuietFrames: 3,
    });
    await animateDiaryEditorClose();
    destroyEditor();
    await setDiaryLoadingState({
      active: false,
      settledRoot: ".diary-main",
      settleQuietWindowMs: 72,
      settleMaxWaitMs: 520,
      settleMinQuietFrames: 3,
    });
  };

  runtime.categorySelector = createDiaryCategorySelector(
    runtime.elements.categoryHost,
    normalizedEntry?.categoryId || "",
    {
      onChange() {
        runtime.handleChange?.();
      },
    },
  );
  createDiaryEditorToolbar(runtime);

  runtime.syncToolbarState = () => {
    queueDiaryEditorToolbarSync(runtime);
  };
  runtime.handleSelectionChange = () => {
    if (runtime.destroyed) {
      return;
    }
    const liveRange = getDiaryEditorLiveRange(runtime.elements?.editor);
    if (liveRange instanceof Range) {
      runtime.savedSelectionRange = liveRange.cloneRange();
    }
    traceDiaryEditorDebug(runtime, "selectionchange");
    runtime.syncToolbarState();
  };
  runtime.handleEditorKeyDown = (event) => {
    runtime.markUserInteracted?.();
    traceDiaryEditorDebug(runtime, "keydown", {
      key: String(event.key || ""),
      inputType: "",
    });
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (
      event.key === "Backspace" ||
      event.key === "Delete" ||
      event.key === "Enter" ||
      event.key.length === 1
    ) {
      saveDiaryEditorSelection(runtime);
    }
    if (event.key !== "Backspace" && event.key !== "Delete") {
      return;
    }
    if (!(runtime.selectedFigure instanceof HTMLElement)) {
      return;
    }
    const handled = deleteDiaryEditorSelection(
      runtime,
      event.key === "Delete" ? "forward" : "backward",
    );
    if (!handled) {
      return;
    }
    event.preventDefault();
    runtime.handleChange?.();
  };
  runtime.handleBeforeInput = (event) => {
    const inputType = String(event?.inputType || "");
    runtime.markUserInteracted?.();
    traceDiaryEditorDebug(runtime, "beforeinput", {
      inputType,
      data: typeof event?.data === "string" ? event.data : "",
      isComposing: event?.isComposing === true,
    });
    if (inputType.startsWith("insert") || inputType.startsWith("delete")) {
      saveDiaryEditorSelection(runtime);
      if (inputType.startsWith("insert")) {
        clearDiaryEditorFigureSelection(runtime);
      }
    }
    if (!inputType.startsWith("delete")) {
      return;
    }
    if (!(runtime.selectedFigure instanceof HTMLElement)) {
      return;
    }
    const handled = deleteDiaryEditorSelection(
      runtime,
      inputType.includes("Forward") ? "forward" : "backward",
    );
    if (!handled) {
      return;
    }
    event.preventDefault();
    runtime.handleChange?.();
  };
  runtime.handleEditorFocus = () => {
    runtime.markUserInteracted?.();
    saveDiaryEditorSelection(runtime, {
      preserveExisting: true,
    });
    traceDiaryEditorDebug(runtime, "focus");
    runtime.syncToolbarState();
  };
  runtime.handleOverlayPointerDown = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const interactiveHost = target.closest(
      [
        ".diary-editor-title-input",
        ".diary-editor-content",
        ".diary-editor-toolbar",
        ".diary-editor-toolbar-group",
        ".tree-select",
        ".tree-select-menu",
        ".tree-select-button",
        ".diary-editor-toolbar-btn",
        ".diary-editor-image-actions button",
        ".diary-editor-nav-btn",
        ".diary-editor-primary-btn",
        ".diary-editor-secondary-btn",
        ".diary-editor-image-remove-btn",
        ".diary-editor-image-resize-handle",
        ".modal-content",
      ].join(", "),
    );
    if (interactiveHost) {
      return;
    }
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement === runtime.elements.titleInput || activeElement === runtime.elements.editor)
    ) {
      activeElement.blur();
      if (activeElement === runtime.elements.editor) {
        window.getSelection()?.removeAllRanges?.();
      }
    }
  };
  runtime.handleChange = () => {
    if (runtime.destroyed) {
      return;
    }
    runtime.markUserInteracted?.();
    traceDiaryEditorDebug(runtime, "input");
    setDiaryEditorSaveState(runtime, "pending");
    refreshDiaryEditorFooter(runtime);
    scheduleDraftSave();
    scheduleAutosave();
    runtime.syncToolbarState();
  };
  runtime.close = async ({ reason = "close" } = {}) => {
    return flushEditor({
      closeAfter: true,
      reason,
    });
  };
  const bindEditorElement = (editor) => {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    editor.addEventListener("input", runtime.handleChange);
    editor.addEventListener("keydown", runtime.handleEditorKeyDown);
    editor.addEventListener("beforeinput", runtime.handleBeforeInput);
    editor.addEventListener("pointerdown", runtime.markUserInteracted, true);
    editor.addEventListener("pointerup", () => {
      window.setTimeout(() => {
        saveDiaryEditorSelection(runtime, {
          preserveExisting: true,
        });
        traceDiaryEditorDebug(runtime, "pointerup");
        runtime.syncToolbarState();
      }, 0);
    });
    editor.addEventListener("mouseup", runtime.syncToolbarState);
    editor.addEventListener("keyup", runtime.syncToolbarState);
    editor.addEventListener("focus", runtime.handleEditorFocus, true);
    editor.addEventListener("compositionstart", (event) => {
      traceDiaryEditorDebug(runtime, "compositionstart", {
        data: typeof event?.data === "string" ? event.data : "",
      });
    });
    editor.addEventListener("compositionupdate", (event) => {
      traceDiaryEditorDebug(runtime, "compositionupdate", {
        data: typeof event?.data === "string" ? event.data : "",
      });
    });
    editor.addEventListener("compositionend", (event) => {
      traceDiaryEditorDebug(runtime, "compositionend", {
        data: typeof event?.data === "string" ? event.data : "",
      });
    });
    editor.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".diary-image-block")) {
        clearDiaryEditorFigureSelection(runtime);
      }
      window.setTimeout(() => {
        saveDiaryEditorSelection(runtime, {
          preserveExisting: true,
        });
        traceDiaryEditorDebug(runtime, "click");
        runtime.syncToolbarState();
      }, 0);
    });
    editor.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (typeof text !== "string") {
        return;
      }
      event.preventDefault();
      document.execCommand("insertText", false, text);
      runtime.handleChange();
    });
  };
  const replaceEditorElementHtml = (html, options = {}) => {
    const currentEditor = runtime.elements?.editor;
    if (!(currentEditor instanceof HTMLElement)) {
      return null;
    }
    const nextEditor = currentEditor.cloneNode(false);
    traceDiaryEditorDebug(runtime, "editor-html-set", {
      reason: typeof options.reason === "string" ? options.reason : "replace-editor",
      htmlLength: typeof html === "string" ? html.length : 0,
    });
    nextEditor.innerHTML =
      typeof html === "string" && html.trim()
        ? html
        : createDiaryParagraphHtmlFromText("");
    currentEditor.replaceWith(nextEditor);
    runtime.elements.editor = nextEditor;
    clearDiaryEditorFigureSelection(runtime);
    runtime.savedSelectionRange = null;
    runtime.toolbarSavedSelectionRange = null;
    runtime.toolbarSelectionHadExpandedText = false;
    ensureDiaryEditorHasContentBlock(nextEditor);
    enhanceDiaryEditorFigures(runtime);
    bindEditorElement(nextEditor);
    if (options.focusEnd === true) {
      focusDiaryEditor(runtime, {
        placeEnd: true,
      });
    }
    return nextEditor;
  };

  runtime.elements.titleInput.value =
    normalizedEntry?.title && normalizedEntry.title !== "未命名日记"
      ? normalizedEntry.title
      : "";
  replaceEditorElementHtml(
    normalizedEntry?.contentHtml || createDiaryParagraphHtmlFromText(""),
    {
      reason: "initial-entry",
    },
  );
  refreshDiaryEditorFooter(runtime);
  if (!normalizedEntry) {
    focusDiaryEditor(runtime, {
      placeEnd: true,
    });
  }
  const initialSnapshot = buildDiaryEditorSnapshot(runtime);
  runtime.lastCommittedSignature = initialSnapshot.signature;
  runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(
    initialSnapshot.attachments,
  );
  setDiaryEditorSaveState(runtime, "saved");
  runtime.elements.titleInput.addEventListener("pointerdown", runtime.markUserInteracted, true);
  runtime.elements.titleInput.addEventListener("focus", runtime.markUserInteracted, true);
  runtime.elements.titleInput.addEventListener("input", runtime.handleChange);
  runtime.elements.backButton?.addEventListener("click", () => {
    void runtime.close({
      reason: "back",
    });
  });
  runtime.elements.doneButton?.addEventListener("click", () => {
    void closeDiaryEditorAfterKeyboardDismiss(runtime, {
      reason: "done",
    });
  });
  runtime.elements.deleteButton?.addEventListener("click", () => {
    void deleteCurrentEntry();
  });
  runtime.elements.insertImageButton?.addEventListener("click", () => {
    void insertDiaryImagesIntoEditor(runtime);
  });
  overlay.addEventListener("pointerdown", runtime.handleOverlayPointerDown, true);
  document.addEventListener("selectionchange", runtime.handleSelectionChange, true);
  runtime.handlePageHide = () => {
    void flushEditor({
      reason: "pagehide",
    });
  };
  runtime.handleVisibilityChange = () => {
    if (document.hidden) {
      void flushEditor({
        reason: "hidden",
      });
    }
  };
  window.addEventListener("pagehide", runtime.handlePageHide, true);
  document.addEventListener(
    "visibilitychange",
    runtime.handleVisibilityChange,
    true,
  );

  if (typeof window.ControlerStorage?.getDraft === "function") {
    void window.ControlerStorage
      .getDraft(runtime.draftKey, {
        includeEnvelope: true,
      })
      .then((draftEnvelope) => {
        const draftValue =
          draftEnvelope && typeof draftEnvelope === "object"
            ? Object.prototype.hasOwnProperty.call(draftEnvelope, "value")
              ? draftEnvelope.value
              : draftEnvelope
            : null;
        traceDiaryEditorDebug(runtime, "draft-restore-result", {
          hasDraft: !!draftValue,
          activeTag:
            document.activeElement instanceof HTMLElement
              ? document.activeElement.tagName
              : "",
          userInteracted: runtime.userInteracted === true,
        });
        if (!draftValue || runtime.destroyed) {
          return;
        }
        const restoredTitle =
          typeof draftValue.title === "string" ? draftValue.title.trim() : "";
        const restoredCategoryId =
          typeof draftValue.categoryId === "string" ? draftValue.categoryId : "";
        const restoredRichText = sanitizeDiaryRichTextHtml(
          typeof draftValue.contentHtml === "string" && draftValue.contentHtml.trim()
            ? draftValue.contentHtml
            : createDiaryParagraphHtmlFromText(draftValue.content || ""),
          {
            attachments: draftValue.attachments || [],
          },
        );
        const restoredSignature = JSON.stringify({
          title: restoredTitle || "未命名日记",
          categoryId: restoredCategoryId,
          contentHtml: restoredRichText.html,
          attachments: cloneDiaryAttachmentsSnapshot(restoredRichText.attachments),
        });
        if (restoredSignature === runtime.lastCommittedSignature) {
          traceDiaryEditorDebug(runtime, "draft-restore-skip-committed", {
            restoredSignature,
          });
          void removeDiaryEditorDraft(runtime).catch((error) => {
            console.error("清理已提交的日记编辑页草稿失败:", error);
          });
          runtime.lastDraftSignature = "";
          return;
        }
        if (
          runtime.userInteracted === true ||
          document.activeElement === runtime.elements.editor ||
          document.activeElement === runtime.elements.titleInput
        ) {
          traceDiaryEditorDebug(runtime, "draft-restore-skip-interacted", {
            restoredSignature,
            activeTag:
              document.activeElement instanceof HTMLElement
                ? document.activeElement.tagName
                : "",
            userInteracted: runtime.userInteracted === true,
          });
          console.warn("跳过覆盖已开始交互的日记编辑页草稿恢复:", runtime.draftKey);
          return;
        }
        if (typeof draftValue.title === "string") {
          runtime.elements.titleInput.value = draftValue.title;
        }
        if (typeof draftValue.categoryId === "string") {
          runtime.categorySelector?.setValue?.(draftValue.categoryId);
        }
        runtime.initialAttachments = cloneDiaryAttachmentsSnapshot(
          restoredRichText.attachments,
        );
        runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(
          restoredRichText.attachments,
        );
        replaceEditorElementHtml(restoredRichText.html, {
          reason: "draft-restore",
        });
        const restoredSnapshot = buildDiaryEditorSnapshot(runtime);
        runtime.lastKnownAttachments = cloneDiaryAttachmentsSnapshot(
          restoredSnapshot.attachments,
        );
        refreshDiaryEditorFooter(runtime, restoredSnapshot);
        if (restoredSnapshot.signature !== runtime.lastCommittedSignature) {
          setDiaryEditorSaveState(runtime, "pending");
          scheduleAutosave();
        } else {
          setDiaryEditorSaveState(runtime, "saved");
        }
      })
      .catch((error) => {
        console.error("恢复日记编辑页草稿失败:", error);
      });
  }
}

function showDiaryModal(dateText, entryId = null) {
  return openDiaryEditorPage(dateText, entryId);
}

function showDiaryModalLegacy(dateText, entryId = null) {
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
      beforeConfirmClose: () => showDiaryDeleteLoadingState(),
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
          pruneDiaryImages: Array.isArray(targetEntry?.attachments)
            ? targetEntry.attachments.length > 0
            : false,
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
  return isDiaryEditorVisible();
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
  const shouldForceFreshTransitionBootstrap =
    window.ControlerStorage?.isNativeApp === true &&
    (!diaryShellPageActive || isDiaryShellTransitionLoading());
  const bootstrappedFromSnapshot = shouldForceFreshTransitionBootstrap
    ? false
    : bootstrapDiaryFromCachedSnapshot();
  let hydrationPromise = null;
  if (shouldDeferDiaryInitialHydration()) {
    diaryInitialHydrationPendingResume = true;
  } else {
    hydrationPromise = startDiaryInitialHydration({
      manageLoading: !bootstrappedFromSnapshot,
      fresh: shouldForceFreshTransitionBootstrap,
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


