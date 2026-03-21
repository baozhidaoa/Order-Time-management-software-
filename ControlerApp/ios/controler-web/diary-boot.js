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

    const planDateKey = formatDateKey(plan.dateKey || plan.date);
    if (!planDateKey) {
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
    if (!record?.name || !record?.spendtime) {
      return null;
    }

    const explicitStartTime = record.startTime ? new Date(record.startTime) : null;
    const explicitEndTime = record.endTime ? new Date(record.endTime) : null;
    const fallbackAnchor = record.timestamp ? new Date(record.timestamp) : null;
    const durationMs = Math.max(
      0,
      Math.round(parseSpendTimeToHours(record.spendtime) * 60 * 60 * 1000),
    );

    let startTime = explicitStartTime;
    let endTime = explicitEndTime;

    if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
      if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime())
      ) {
        if (
          endTime instanceof Date &&
          !Number.isNaN(endTime.getTime()) &&
          durationMs > 0
        ) {
          startTime = new Date(endTime.getTime() - durationMs);
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
        endTime = new Date(fallbackAnchor.getTime() + durationMs);
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
    if (!dateText) {
      return null;
    }

    return {
      ...record,
      sourceIndex,
      startTime,
      endTime,
      dateText,
      durationHours: clampNumber(parseSpendTimeToHours(record.spendtime), 0),
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
            timeRecord?.dateText ||
            formatDateKey(record?.timestamp || record?.startTime || record?.endTime);

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
const DIARY_PREFETCH_MONTH_OFFSETS = Object.freeze([-1, 0, 1]);
const DIARY_LOADING_OVERLAY_DELAY_MS = 180;
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
let diaryPrefetchRequestId = 0;
const diaryExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async () => {
      await refreshDiaryFromExternalStorageChange();
    },
  }) || null;

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
  if (typeof window.ControlerStorage?.whenReady !== "function") {
    return Promise.resolve(true);
  }
  return window.ControlerStorage.whenReady().catch((error) => {
    console.error("等待日记页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

function ensureDiaryDeferredRuntimeLoaded() {
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
  const [year, month, day] = value.split("-").map(Number);
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

async function commitDiaryLocalChange({
  applyChange,
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
  if (typeof closeModal === "function") {
    closeModal();
  }
  scheduleDiaryViewRefresh();

  const saved = await saveDiaryData(persistMeta);
  if (saved) {
    return true;
  }

  restoreDiaryMutationSnapshot(snapshot);
  await showDiaryAlert(failureMessage, {
    title: failureTitle,
    danger: true,
  });
  return false;
}

function queueDiaryInitialReveal() {
  if (diaryInitialReadyReported) {
    return;
  }
  const body = document.body;
  if (
    !(body instanceof HTMLElement) ||
    !body.classList.contains("diary-bootstrap-pending") ||
    diaryInitialRevealQueued
  ) {
    return;
  }

  diaryInitialRevealQueued = true;
  diaryInitialReadyReported = true;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    schedule(() => {
      diaryInitialRevealQueued = false;
      body.classList.remove("diary-bootstrap-pending");
      body.classList.add("diary-bootstrap-ready");
      uiTools?.markPerfStage?.("first-render-done");
      uiTools?.markNativePageReady?.();
    });
  });
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
  }) || null;
  return diaryLoadingOverlayController;
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

function readDiaryCachedSnapshotState() {
  try {
    const storageSnapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    if (storageSnapshot && typeof storageSnapshot === "object") {
      return normalizeDiaryLoadedState({
        entries: storageSnapshot.diaryEntries,
        categories: storageSnapshot.diaryCategories,
      });
    }
  } catch (error) {
    console.error("读取日记缓存快照失败:", error);
  }

  try {
    return normalizeDiaryLoadedState({
      entries: JSON.parse(localStorage.getItem("diaryEntries") || "[]"),
      categories: JSON.parse(localStorage.getItem("diaryCategories") || "[]"),
    });
  } catch (error) {
    console.error("读取本地日记兜底快照失败:", error);
  }

  return normalizeDiaryLoadedState();
}

function bootstrapDiaryFromCachedSnapshot() {
  try {
    const snapshotState = readDiaryCachedSnapshotState();
    applyDiaryLoadedState(snapshotState);
    renderDiaryGuideCard();
    renderCurrentView();
    diaryInitialDataLoaded = true;
    diaryInitialDataValidated = false;
    return true;
  } catch (error) {
    console.error("使用日记缓存快照引导首屏失败:", error);
    return false;
  }
}

function setDiaryLoadingState(options = {}) {
  const overlay = getDiaryLoadingOverlayElement();
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
        ? "正在读取当前月份的日记与分类，请稍候"
        : "正在更新当前月份的日记数据，请稍候",
  } = options;
  const loadingController = getDiaryLoadingOverlayController();
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

const diaryRefreshController = uiTools?.createAtomicRefreshController?.({
  defaultDelayMs: DIARY_LOADING_OVERLAY_DELAY_MS,
  showLoading: (loadingOptions = {}) => {
    setDiaryLoadingState({
      active: true,
      ...loadingOptions,
    });
  },
  hideLoading: () => {
    setDiaryLoadingState({
      active: false,
    });
  },
});

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

  diaryInitialHydrationPromise = refreshDiaryVisibleData({
    ...options,
    periodIds:
      Array.isArray(options.periodIds) && options.periodIds.length
        ? options.periodIds
        : [getDiaryCurrentPeriodId(currentDate)],
    mode: options.mode || "fullscreen",
    delayMs: 0,
    message: "正在读取当前月份的日记与分类，请稍候",
    reportFirstData: true,
  }).finally(() => {
    diaryInitialHydrationPromise = null;
  });

  return diaryInitialHydrationPromise;
}

async function refreshDiaryVisibleData(options = {}) {
  const requestId = ++diaryLoadRequestId;
  const mode =
    options.mode || (diaryInitialDataValidated ? "inline" : "fullscreen");
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
  const commitLoadedState = (loadedState) => {
    if (requestId !== diaryLoadRequestId) {
      return;
    }
    const appliedState = applyDiaryLoadedState(loadedState);
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
  };

  try {
    if (!diaryRefreshController) {
      setDiaryLoadingState({
        active: true,
        mode,
        delayMs,
        message,
      });
      const loadedState = await loadTask();
      commitLoadedState(loadedState);
      return requestId === diaryLoadRequestId;
    }

    const refreshResult = await diaryRefreshController.run(
      () => loadTask(),
      {
        delayMs,
        loadingOptions: {
          mode,
          message,
        },
        commit: async (loadedState) => {
          commitLoadedState(loadedState);
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
    applyDiaryLoadedState(readDiaryCachedSnapshotState());
    renderDiaryGuideCard();
    renderCurrentView();
    diaryInitialDataLoaded = true;
    diaryInitialDataValidated = true;
    return false;
  } finally {
    if (!diaryRefreshController && requestId === diaryLoadRequestId) {
      setDiaryLoadingState({
        active: false,
      });
    }
  }
}

async function loadDiaryData(options = {}) {
  const bundleStorage = window.ControlerStorage;
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

async function saveDiaryData(options = {}) {
  const persistMeta = normalizeDiaryPersistMeta(options);
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
      return true;
    }

    localStorage.setItem("diaryEntries", JSON.stringify(diaryEntries));
    localStorage.setItem("diaryCategories", JSON.stringify(diaryCategories));
    if (guideStateChanged) {
      localStorage.setItem("guideState", JSON.stringify(readDiaryGuideState()));
    }
    return true;
  } catch (error) {
    console.error("保存日记数据失败:", error);
    return false;
  }
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
  if (uiTools?.alertDialog) {
    await uiTools.alertDialog({
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
  return [entry?.title, entry?.content].some((fieldValue) =>
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

function getDiaryYearsForSelector() {
  const yearSet = new Set([
    currentDate.getFullYear(),
    new Date().getFullYear(),
  ]);
  const monthMap = diaryDataIndex?.getDiaryEntriesByMonthMap?.() || new Map();
  monthMap.forEach((_entries, monthKey) => {
    const year = Number.parseInt(String(monthKey).slice(0, 4), 10);
    if (Number.isFinite(year)) {
      yearSet.add(year);
    }
  });

  const yearList = Array.from(yearSet);
  const minYear = Math.min(...yearList) - 3;
  const maxYear = Math.max(...yearList) + 3;
  const result = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    result.push(year);
  }
  return result;
}

function syncDiaryPeriodSelectors() {
  const yearSelect = document.getElementById("diary-year-select");
  const monthSelect = document.getElementById("diary-month-select");
  if (!yearSelect || !monthSelect) return;

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  yearSelect.innerHTML = getDiaryYearsForSelector()
    .map((year) => `<option value="${year}">${year}年</option>`)
    .join("");
  monthSelect.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return `<option value="${month}">${month}月</option>`;
  }).join("");

  yearSelect.value = String(currentYear);
  monthSelect.value = String(currentMonth);
  uiTools?.enhanceNativeSelect?.(yearSelect, { minWidth: 120 });
  uiTools?.enhanceNativeSelect?.(monthSelect, { minWidth: 110 });
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
  if (!yearSelect || !monthSelect) return;

  syncDiaryPeriodSelectors();
  uiTools?.enhanceNativeSelect?.(yearSelect, { minWidth: 120 });
  uiTools?.enhanceNativeSelect?.(monthSelect, { minWidth: 110 });

  yearSelect.addEventListener("change", () => {
    const nextYear = Number(yearSelect.value) || currentDate.getFullYear();
    setCurrentDiaryMonth(nextYear, currentDate.getMonth() + 1);
  });

  monthSelect.addEventListener("change", () => {
    const nextMonth = Number(monthSelect.value) || currentDate.getMonth() + 1;
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

function initDiarySearchControls() {
  const searchInput = document.getElementById("diary-search-input");
  if (!searchInput) return;

  diarySearchQuery = "";
  searchInput.value = "";
  syncDiarySearchControls();

  const handleSearchInput = () => {
    window.clearTimeout(diarySearchInputTimer);
    diarySearchInputTimer = window.setTimeout(() => {
      setDiarySearchQuery(searchInput.value, {
        switchToListOnSearch: true,
      });
    }, DIARY_SEARCH_DEBOUNCE_MS);
  };

  searchInput.addEventListener("input", handleSearchInput);
  window.addEventListener("pageshow", () => {
    searchInput.value = "";
    setDiarySearchQuery("");
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
  const gridGap = Math.max(4, Math.round(6 * scale));
  const cellMinHeight = Math.max(82, Math.round(108 * scale));
  const cellPadding = Math.max(6, Math.round(8 * scale));
  const cellRadius = Math.max(8, Math.round(10 * scale));
  const badgeFontSize = Math.max(10, Math.round(11 * scale));
  const previewFontSize = Math.max(11, Math.round(12 * scale));
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
    cell.appendChild(dayNo);

    if (entry) {
      const tag = getCategoryById(entry.categoryId);
      const badge = document.createElement("div");
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.gap = "5px";
      badge.style.fontSize = `${badgeFontSize}px`;
      badge.style.color = "var(--text-color)";
      const colorDot = document.createElement("span");
      colorDot.style.display = "inline-block";
      colorDot.style.width = `${Math.max(6, Math.round(8 * scale))}px`;
      colorDot.style.height = `${Math.max(6, Math.round(8 * scale))}px`;
      colorDot.style.borderRadius = "50%";
      colorDot.style.background = tag?.color || "var(--accent-color)";
      badge.appendChild(colorDot);

      const badgeText = document.createElement("span");
      badgeText.textContent = tag?.name || "未分类";
      badge.appendChild(badgeText);
      cell.appendChild(badge);

      const preview = document.createElement("div");
      preview.style.fontSize = `${previewFontSize}px`;
      preview.style.color = "var(--muted-text-color)";
      preview.style.whiteSpace = "pre-wrap";
      preview.textContent = entry.title || entry.content.slice(0, 20);
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
      titleNode.textContent = entry.title || "未命名日记";
      topRow.appendChild(titleNode);

      const dateNode = document.createElement("span");
      dateNode.style.fontSize = `${Math.max(11, Math.round(12 * scale))}px`;
      dateNode.style.color = "var(--muted-text-color)";
      dateNode.textContent = entry.date;
      topRow.appendChild(dateNode);
      card.appendChild(topRow);

      const contentNode = document.createElement("div");
      contentNode.style.marginTop = "6px";
      contentNode.style.fontSize = `${contentFontSize}px`;
      contentNode.style.color = "var(--text-color)";
      contentNode.style.whiteSpace = "pre-wrap";
      contentNode.textContent = entry.content || "（无正文）";
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
  diaryExternalStorageRefreshQueued = false;
  void refreshDiaryVisibleData({
    anchorDate: currentDate,
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

function createDiaryCategorySelector(container, selectedValue = "") {
  if (!container) {
    return {
      destroy() {},
      getValue() {
        return selectedValue || "";
      },
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
  };
}

function showDiaryModal(dateText, entryId = null) {
  const existing = findDiaryEntry(dateText, entryId);
  const isEditMode = !!existing;
  const activeEntryId = existing?.id || entryId || null;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2200";

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 22px; border-radius: 15px; max-width: 520px; width: 90%; max-height: 88vh; overflow-y: auto;">
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
        <div style="display:flex; justify-content:space-between; margin-top:16px;">
          ${
            isEditMode
              ? '<button class="bts" type="button" id="delete-diary-btn" data-diary-modal-action="delete-entry" style="margin:0; background-color: var(--delete-btn);">删除</button>'
              : "<span></span>"
          }
        <div style="display:flex; gap:8px;">
          <button class="bts" type="button" id="cancel-diary-btn" data-diary-modal-action="cancel" style="margin:0;">收起</button>
          <button class="bts" type="button" id="save-diary-btn" data-diary-modal-action="save" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  uiTools?.stopModalContentPropagation?.(modal);

  const titleInput = modal.querySelector("#diary-title-input");
  const contentInput = modal.querySelector("#diary-content-input");
  if (titleInput) {
    titleInput.value = existing?.title || "";
  }
  if (contentInput) {
    contentInput.value = existing?.content || "";
  }

  const categorySelector = createDiaryCategorySelector(
    modal.querySelector("#diary-category-selector"),
    existing?.categoryId || "",
  );

  let unbindModalActions = () => {};
  const closeModal = () => {
    unbindModalActions();
    categorySelector.destroy();
    if (modal.parentNode) {
      document.body.removeChild(modal);
    }
  };

  const saveAction = () => {
    const title = modal.querySelector("#diary-title-input").value.trim();
    const content = modal.querySelector("#diary-content-input").value.trim();
    const categoryId = categorySelector.getValue();

    if (!title && !content) {
      alert("请至少输入标题或正文");
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
      notFoundMessage: "未找到要删除的日记",
      closeModal,
    });
  };

  unbindModalActions = bindDiaryModalActions(modal, {
    cancel: closeModal,
    save: saveAction,
    "delete-entry": deleteAction,
  });

  modal.addEventListener("click", function (event) {
    if (event.target === this) {
      closeModal();
    }
  });
}

function showCategoryModal() {
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
          background-color: var(--bg-quaternary); color: var(--text-color);">
        <input id="new-diary-category-color" type="color" value="#4299e1" style="width: 58px; height: 40px; border:none; border-radius:8px;">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="bts" type="button" id="cancel-diary-category-btn" data-diary-modal-action="cancel" style="margin:0;">取消</button>
        <button class="bts" type="button" id="save-diary-category-btn" data-diary-modal-action="save" style="margin:0;">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  uiTools?.stopModalContentPropagation?.(modal);

  let unbindModalActions = () => {};
  const closeModal = () => {
    unbindModalActions();
    if (modal.parentNode) {
      document.body.removeChild(modal);
    }
  };

  const saveCategoryAction = () => {
    const name = modal.querySelector("#new-diary-category-name").value.trim();
    const color = modal.querySelector("#new-diary-category-color").value;
    if (!name) {
      alert("请输入分类名称");
      return;
    }
    if (diaryCategories.some((category) => category.name === name)) {
      alert("分类名称已存在");
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

  modal.addEventListener("click", function (event) {
    if (event.target === this) {
      closeModal();
    }
  });
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
  bootstrapDiaryFromCachedSnapshot();
  initDiaryPeriodSelectors();
  initDiaryCategoryFilterSelector();
  initDiarySearchControls();
  initViewButtons();
  initDiaryWidgetLaunchAction();
  bindDiaryExternalStorageRefresh();
  renderDiaryGuideCard();
  window.addEventListener("resize", () => {
    const nextCompactLayout = isCompactMobileLayout();
    if (nextCompactLayout !== lastCompactLayout) {
      lastCompactLayout = nextCompactLayout;
      renderCurrentView();
    }
  });
  try {
    const hydrationPromise = hydrateDiaryInitialData({
      mode: diaryInitialDataValidated ? "inline" : "fullscreen",
    });
    const hydrated = await hydrationPromise;
    if (hydrated !== false) {
      flushDiaryPendingWidgetLaunchAction();
    }
  } finally {
    queueDiaryInitialReveal();
  }
  void ensureDiaryDeferredRuntimeLoaded();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


