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
    if (!dateText) {
      return null;
    }

    return {
      ...record,
      sourceIndex,
      startTime,
      endTime,
      dateText,
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


;/* pages/plan.js */
// 计划页面JavaScript
let plans = []; // 存储计划对象
let currentDate = new Date(); // 当前显示的日期
let currentView = "weekly-grid"; // "year", "month", "weekly-grid"
let editPlanId = null; // 当前编辑的计划ID
let yearlyGoals = {}; // { [year]: { annual: Goal[], [month]: Goal[] } }
let suppressYearGoalModalOpen = false;
const uiTools = window.ControlerUI || null;
const planDataIndex = window.ControlerDataIndex?.createStore?.() || null;
const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const PLAN_WEEKLY_GRID_SHRINK_RATIO = 2 / 3;
const PLAN_WEEKLY_TIME_COLUMN_SHRINK_RATIO = 4 / 5;
const MOBILE_LAYOUT_MAX_WIDTH = 690;
const MOBILE_TABLE_SCALE_RATIO = 0.82 * (2 / 3);
const PLAN_YEAR_VIEW_CARD_SHRINK_RATIO = 2 / 3;
const PLAN_LOADING_OVERLAY_DELAY_MS = 180;
const PLAN_DRAFT_SAVE_DELAY_MS = 300;
const PLAN_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS = 1200;
const PLAN_TODO_RUNTIME_ASSET_URL = "todo.js?v=20260310-modal-fix";
let reminderTools = window.ControlerReminders || null;
let planLoadedPeriodIds = [];
let planLoadRequestId = 0;
let planDeferredRuntimePromise = null;
let planInitialDataLoaded = false;
let planInitialDataValidated = false;
let planLoadingOverlayTimer = 0;
let planLoadingOverlayController = null;
let planShellRendered = false;
let planShellReady = false;
let planInitialDataLoadPromise = null;
let planDeferredBootstrapQueued = false;
let todoSidebarRuntimePromise = null;
let todoSidebarRuntimeReady = false;
let todoSidebarIdleBootstrapQueued = false;
let planDeferredRuntimeIdleBootstrapQueued = false;
let pendingTodoSidebarRuntimeOptions = null;
let planShellPageActive = uiTools?.isShellPageActive?.() !== false;
let planDeferredBootstrapPendingResume = false;
let planDeferredRuntimePendingResume = false;
let todoSidebarIdleBootstrapPendingResume = false;
let planExternalStorageRefreshPendingResume = false;
let planCoverageLoadKey = "";
let planCalendarMountDeferred = false;
let planShellRefs = null;
let planShellVisibilityBound = false;
let planPersistChain = Promise.resolve(true);
let planPendingPersistenceCount = 0;
let planLastPersistenceError = null;
let planBeforePageLeaveGuardBound = false;

function waitForPlanStorageReady() {
  if (typeof window.ControlerStorage?.whenReady !== "function") {
    return Promise.resolve(true);
  }
  return window.ControlerStorage.whenReady().catch((error) => {
    console.error("等待计划页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

function escapePlanSelectorValue(value) {
  if (typeof window.CSS?.escape === "function") {
    return window.CSS.escape(String(value ?? ""));
  }
  return String(value ?? "").replace(/["\\]/g, "\\$&");
}

function capturePlanModalDraftFields(modal) {
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

function applyPlanModalDraftFields(modal, fields = {}) {
  const source = fields && typeof fields === "object" ? fields : {};
  Object.keys(source).forEach((key) => {
    const idSelector = `#${escapePlanSelectorValue(key)}`;
    const namedControls = Array.from(
      modal?.querySelectorAll?.(`[name="${escapePlanSelectorValue(key)}"]`) || [],
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

function createPlanModalDraftSession(modal, draftKey) {
  let timer = 0;
  const persistDraft = async () => {
    if (!modal?.isConnected || typeof window.ControlerStorage?.setDraft !== "function") {
      return;
    }
    await window.ControlerStorage.setDraft(
      draftKey,
      {
        fields: capturePlanModalDraftFields(modal),
      },
      {
        scope: "plan",
      },
    );
  };
  const scheduleSave = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void persistDraft();
    }, PLAN_DRAFT_SAVE_DELAY_MS);
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
      applyPlanModalDraftFields(modal, draftValue.fields);
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

function queuePlanPersistenceTask(
  task,
  errorLabel = "保存计划页数据失败:",
) {
  planLastPersistenceError = null;
  planPendingPersistenceCount += 1;
  const queuedTask = planPersistChain
    .catch(() => true)
    .then(() => (typeof task === "function" ? task() : true))
    .catch((error) => {
      planLastPersistenceError =
        error instanceof Error ? error : new Error(String(error || "保存失败"));
      console.error(errorLabel, planLastPersistenceError);
      return false;
    })
    .finally(() => {
      planPendingPersistenceCount = Math.max(0, planPendingPersistenceCount - 1);
    });
  planPersistChain = queuedTask.then(() => true);
  return queuedTask;
}

function clearPlanPersistenceError() {
  planLastPersistenceError = null;
}

async function flushPlanPendingPersistence() {
  if (planPendingPersistenceCount > 0) {
    await planPersistChain.catch(() => false);
  }
  if (planLastPersistenceError) {
    throw planLastPersistenceError;
  }
  if (typeof window.ControlerStorage?.flush === "function") {
    await window.ControlerStorage.flush();
  }
  if (planLastPersistenceError) {
    throw planLastPersistenceError;
  }
  return true;
}

function registerPlanBeforePageLeaveGuard() {
  if (planBeforePageLeaveGuardBound) {
    return;
  }
  planBeforePageLeaveGuardBound = true;
  uiTools?.registerBeforePageLeave?.(async () => {
    if (planPendingPersistenceCount <= 0 && !planLastPersistenceError) {
      return true;
    }
    return flushPlanPendingPersistence();
  });
}

function getReminderTools() {
  reminderTools = window.ControlerReminders || reminderTools || null;
  return reminderTools;
}

function ensurePlanDeferredRuntimeLoaded() {
  if (!planShellPageActive) {
    planDeferredRuntimePendingResume = true;
    return Promise.resolve();
  }
  if (planDeferredRuntimePromise) {
    return planDeferredRuntimePromise;
  }
  if (typeof uiTools?.loadScriptOnce !== "function") {
    planDeferredRuntimePromise = Promise.resolve();
    return planDeferredRuntimePromise;
  }

  planDeferredRuntimePromise = Promise.allSettled([
    uiTools.loadScriptOnce("guide-bundle.js"),
    uiTools.loadScriptOnce("guide-ui.js"),
    uiTools.loadScriptOnce("reminders.js"),
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("加载计划页延后脚本失败:", result.reason);
      }
    });
    reminderTools = window.ControlerReminders || reminderTools || null;
    renderPlanGuideCard();
  });
  return planDeferredRuntimePromise;
}

function bindPlanShellVisibilityGate() {
  if (planShellVisibilityBound) {
    return;
  }
  planShellVisibilityBound = true;
  const eventName =
    uiTools?.shellVisibilityEventName || "controler:shell-visibility-changed";
  window.addEventListener(eventName, (event) => {
    const detail =
      event && typeof event.detail === "object" && event.detail
        ? event.detail
        : {};
    const nextActive = detail.active !== false;
    if (planShellPageActive === nextActive) {
      return;
    }

    planShellPageActive = nextActive;
    if (!planShellPageActive) {
      return;
    }

    if (planExternalStorageRefreshPendingResume) {
      planExternalStorageRefreshPendingResume = false;
      refreshPlanFromExternalStorageChange();
    }
    if (planDeferredBootstrapPendingResume) {
      planDeferredBootstrapPendingResume = false;
      scheduleDeferredPlanBootstrap();
    }
    if (planDeferredRuntimePendingResume) {
      planDeferredRuntimePendingResume = false;
      void ensurePlanDeferredRuntimeLoaded();
    }
    if (todoSidebarIdleBootstrapPendingResume) {
      todoSidebarIdleBootstrapPendingResume = false;
      scheduleTodoSidebarIdleBootstrap();
    }
  });
}

function isRecurringPlanItem(plan) {
  return typeof window.ControlerStorageBundle?.isRecurringPlan === "function"
    ? window.ControlerStorageBundle.isRecurringPlan(plan)
    : String(plan?.repeat || "").trim().toLowerCase() !== "none";
}

function readPlanBootstrapSnapshotFromState(sourceState = {}, periodIds = []) {
  const requestedPeriodIds = Array.isArray(periodIds)
    ? periodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
    : [];
  const requestedPeriodSet = new Set(requestedPeriodIds);
  const planItems = Array.isArray(sourceState?.plans) ? sourceState.plans : [];
  const oneTimePlans = planItems.filter((plan) => {
    if (isRecurringPlanItem(plan)) {
      return false;
    }
    const periodId = String(plan?.date || "").slice(0, 7);
    return requestedPeriodSet.size === 0 || requestedPeriodSet.has(periodId);
  });
  const recurringPlans = planItems.filter((plan) => isRecurringPlanItem(plan));
  return {
    plans: [...oneTimePlans, ...recurringPlans].map((rawPlan) => hydratePlan(rawPlan)),
    yearlyGoals: normalizeYearlyGoalsState(sourceState?.yearlyGoals || {}),
    loadedPeriodIds: requestedPeriodIds.slice(),
  };
}

function readPlanCachedSnapshotState(options = {}) {
  const periodIds =
    Array.isArray(options.periodIds) && options.periodIds.length
      ? options.periodIds
      : getPlanPeriodIdsForVisibleView();
  try {
    if (typeof window.ControlerStorage?.peekPageBootstrapState === "function") {
      const bootstrapState = window.ControlerStorage.peekPageBootstrapState(
        "plan",
        {
          periodIds,
        },
      );
      if (bootstrapState && typeof bootstrapState === "object") {
        return normalizePlanPageBootstrapSnapshot(bootstrapState);
      }
    }
  } catch (error) {
    console.error("读取计划同步引导快照失败:", error);
  }
  try {
    const storageSnapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    if (storageSnapshot && typeof storageSnapshot === "object") {
      return readPlanBootstrapSnapshotFromState(storageSnapshot, periodIds);
    }
  } catch (error) {
    console.error("读取计划缓存快照失败:", error);
  }

  try {
    const rawPlans = JSON.parse(localStorage.getItem("plans") || "[]");
    const rawGoals = JSON.parse(localStorage.getItem("yearlyGoals") || "{}");
    return readPlanBootstrapSnapshotFromState(
      {
        plans: Array.isArray(rawPlans) ? rawPlans : [],
        yearlyGoals: rawGoals,
      },
      periodIds,
    );
  } catch (error) {
    console.error("读取计划本地兜底快照失败:", error);
  }

  return readPlanBootstrapSnapshotFromState({}, periodIds);
}

function bootstrapPlanFromCachedSnapshot() {
  try {
    const snapshot = readPlanCachedSnapshotState();
    applyPlanWorkspaceState(snapshot);
    planInitialDataLoaded = true;
    planInitialDataValidated = false;
    uiTools?.markPerfStage?.("plan-cache-bootstrap-hit", {
      periodIds: planLoadedPeriodIds.slice(),
      planCount: plans.length,
    });
    return true;
  } catch (error) {
    console.error("使用计划缓存快照引导首屏失败:", error);
    return false;
  }
}

function normalizeTodoSidebarRuntimeOptions(options = {}) {
  return {
    initialView:
      String(options?.initialView || "").trim() === "checkins" ? "checkins" : "todos",
    openComposer: options?.openComposer === true,
    persistWidgetView: options.persistWidgetView !== false,
    reason:
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "manual",
  };
}

function normalizePlanPageBootstrapSnapshot(payload = {}) {
  const data =
    payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? payload.data
      : {};
  const visiblePlans = Array.isArray(data.visiblePlans) ? data.visiblePlans : [];
  const recurringPlans = Array.isArray(data.recurringPlans)
    ? data.recurringPlans
    : [];
  return {
    plans: [...visiblePlans, ...recurringPlans].map((rawPlan) => hydratePlan(rawPlan)),
    yearlyGoals: normalizeYearlyGoalsState(data.yearlyGoals || {}),
    loadedPeriodIds:
      Array.isArray(payload?.loadedPeriodIds) && payload.loadedPeriodIds.length
        ? payload.loadedPeriodIds.slice()
        : [],
  };
}

async function readPlanBootstrapState(options = {}) {
  if (typeof window.ControlerStorage?.getPageBootstrapState === "function") {
    const payload = await window.ControlerStorage.getPageBootstrapState(
      "plan",
      options,
    );
    if (payload && typeof payload === "object") {
      const data =
        payload.data && typeof payload.data === "object" ? payload.data : {};
      return {
        yearlyGoals: data.yearlyGoals || {},
        recurringPlans: Array.isArray(data.recurringPlans)
          ? data.recurringPlans
          : [],
      };
    }
  }
  if (typeof window.ControlerStorage?.getPlanBootstrapState === "function") {
    const payload = await window.ControlerStorage.getPlanBootstrapState(options);
    if (payload && typeof payload === "object") {
      return payload;
    }
  }
  if (typeof window.ControlerStorage?.getCoreState === "function") {
    return (await window.ControlerStorage.getCoreState()) || {};
  }
  return {};
}

function renderTodoSidebarPlaceholder(options = {}) {
  const loading = options.loading === true;
  const statsTitle = document.getElementById("stats-panel-title");
  const todoControls = document.getElementById("todo-view-controls");
  const checkinControls = document.getElementById("checkin-view-controls");
  const todoListContainer = document.getElementById("todo-list-container");
  const todoQuadrantContainer = document.getElementById("todo-quadrant-container");
  const checkinListContainer = document.getElementById("checkin-list-container");
  const todoStatsPanel = document.getElementById("todo-stats-panel");
  const checkinStatsPanel = document.getElementById("checkin-stats-panel");
  const message = loading
    ? "正在载入待办与打卡，请稍候"
    : "待办与打卡会在你打开侧栏或首屏空闲后载入";

  if (statsTitle) {
    statsTitle.textContent = "待办与打卡";
  }
  if (todoControls) {
    todoControls.style.display = "none";
  }
  if (checkinControls) {
    checkinControls.style.display = "none";
  }
  if (todoQuadrantContainer) {
    todoQuadrantContainer.style.display = "none";
    todoQuadrantContainer.innerHTML = "";
  }
  if (checkinListContainer) {
    checkinListContainer.style.display = "none";
    checkinListContainer.innerHTML = "";
  }
  if (todoStatsPanel) {
    todoStatsPanel.style.display = "none";
  }
  if (checkinStatsPanel) {
    checkinStatsPanel.style.display = "none";
  }
  if (todoListContainer) {
    todoListContainer.style.display = "block";
    todoListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${loading ? "⏳" : "📝"}</div>
        <h3 style="color: var(--text-color)">
          ${loading ? "正在准备待办侧栏" : "待办与打卡已延后初始化"}
        </h3>
        <p style="color: var(--muted-text-color); margin-bottom: 0;">
          ${message}
        </p>
      </div>
    `;
  }
}

async function ensureTodoSidebarRuntimeLoaded(options = {}) {
  const normalizedOptions = normalizeTodoSidebarRuntimeOptions(options);
  pendingTodoSidebarRuntimeOptions = normalizedOptions;

  if (
    todoSidebarRuntimeReady &&
    typeof window.ControlerTodoRuntime?.initPlanSidebar === "function"
  ) {
    window.ControlerTodoRuntime.initPlanSidebar({
      initialView: normalizedOptions.initialView,
      persistWidgetView: normalizedOptions.persistWidgetView,
    });
    pendingTodoSidebarRuntimeOptions = null;
    if (
      normalizedOptions.openComposer &&
      typeof window.ControlerTodoRuntime?.openComposer === "function"
    ) {
      window.ControlerTodoRuntime.openComposer({
        initialView: normalizedOptions.initialView,
      });
    }
    return window.ControlerTodoRuntime;
  }

  if (todoSidebarRuntimePromise) {
    return todoSidebarRuntimePromise;
  }

  uiTools?.markPerfStage?.("todo-sidebar-init-start", {
    allowRepeat: true,
    initialView: normalizedOptions.initialView,
    reason: normalizedOptions.reason,
  });
  renderTodoSidebarPlaceholder({
    loading: true,
  });

  const loadRuntime =
    typeof uiTools?.loadScriptOnce === "function"
      ? uiTools.loadScriptOnce(PLAN_TODO_RUNTIME_ASSET_URL)
      : Promise.resolve();

  todoSidebarRuntimePromise = Promise.resolve(loadRuntime)
    .then(() => {
      const resolvedOptions = pendingTodoSidebarRuntimeOptions || normalizedOptions;
      pendingTodoSidebarRuntimeOptions = null;
      if (typeof window.ControlerTodoRuntime?.initPlanSidebar !== "function") {
        throw new Error("待办侧栏运行时未正确初始化。");
      }
      window.ControlerTodoRuntime.initPlanSidebar({
        initialView: resolvedOptions.initialView,
        persistWidgetView: resolvedOptions.persistWidgetView,
      });
      todoSidebarRuntimeReady = true;
      if (
        resolvedOptions.openComposer &&
        typeof window.ControlerTodoRuntime?.openComposer === "function"
      ) {
        window.ControlerTodoRuntime.openComposer({
          initialView: resolvedOptions.initialView,
        });
      }
      uiTools?.markPerfStage?.("todo-sidebar-init-done", {
        allowRepeat: true,
        initialView: resolvedOptions.initialView,
      });
      return window.ControlerTodoRuntime;
    })
    .catch((error) => {
      pendingTodoSidebarRuntimeOptions = null;
      console.error("加载待办侧栏运行时失败:", error);
      renderTodoSidebarPlaceholder({
        loading: false,
      });
      throw error;
    })
    .finally(() => {
      todoSidebarRuntimePromise = null;
    });

  return todoSidebarRuntimePromise;
}

function scheduleTodoSidebarIdleBootstrap() {
  if (
    todoSidebarIdleBootstrapQueued ||
    todoSidebarRuntimeReady ||
    todoSidebarRuntimePromise
  ) {
    return;
  }
  if (!planShellPageActive) {
    todoSidebarIdleBootstrapPendingResume = true;
    return;
  }
  todoSidebarIdleBootstrapQueued = true;
  const run = () => {
    todoSidebarIdleBootstrapQueued = false;
    if (!planShellPageActive) {
      todoSidebarIdleBootstrapPendingResume = true;
      return;
    }
    void ensureTodoSidebarRuntimeLoaded({
      initialView: window.__controlerTodoWidgetView || "todos",
      reason: "idle",
      persistWidgetView: true,
    }).catch(() => undefined);
  };
  const scheduleAfterPaint = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, {
        timeout: 1200,
      });
      return;
    }
    window.setTimeout(run, 240);
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scheduleAfterPaint);
    });
    return;
  }
  window.setTimeout(scheduleAfterPaint, 64);
}

function schedulePlanDeferredRuntimeIdleBootstrap() {
  if (planDeferredRuntimeIdleBootstrapQueued || planDeferredRuntimePromise) {
    return;
  }
  if (!planShellPageActive) {
    planDeferredRuntimePendingResume = true;
    return;
  }
  planDeferredRuntimeIdleBootstrapQueued = true;
  const run = () => {
    planDeferredRuntimeIdleBootstrapQueued = false;
    if (!planShellPageActive) {
      planDeferredRuntimePendingResume = true;
      return;
    }
    void ensurePlanDeferredRuntimeLoaded().catch(() => undefined);
  };
  const scheduleAfterPaint = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, {
        timeout: 1800,
      });
      return;
    }
    window.setTimeout(run, 420);
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scheduleAfterPaint);
    });
    return;
  }
  window.setTimeout(scheduleAfterPaint, 96);
}

function syncPlanDataIndex(fields = ["plans"]) {
  if (!planDataIndex) {
    return;
  }

  const nextState = {};
  fields.forEach((fieldName) => {
    if (fieldName === "plans") {
      nextState.plans = plans;
    }
  });
  planDataIndex.replaceState(nextState);
}

function getPlanPeriodIdsForVisibleView() {
  const bundle = window.ControlerStorageBundle || null;
  let startDate = null;
  let endDate = null;

  if (currentView === "year") {
    startDate = new Date(currentDate.getFullYear(), 0, 1);
    endDate = new Date(currentDate.getFullYear(), 11, 31);
  } else if (currentView === "month") {
    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  } else {
    startDate = getWeekStartDate(currentDate);
    endDate = getWeekEndDate(currentDate);
  }

  if (typeof bundle?.getPeriodIdsForRange === "function") {
    return bundle.getPeriodIdsForRange(startDate, endDate);
  }

  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const results = [];
  while (cursor <= last) {
    results.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return results;
}

function planOccursOnDateCached(plan, dateText) {
  if (typeof plan?.isOnDate === "function") {
    return plan.isOnDate(dateText);
  }
  const fallbackMatcher = window.ControlerDataIndex?.defaultPlanMatcher;
  if (typeof fallbackMatcher === "function") {
    return fallbackMatcher(applyPlanDerivedFields(plan), dateText);
  }
  return hydratePlan(plan).isOnDate(dateText);
}
function localizePlanUiText(value) {
  return window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "");
}

function preparePlanModalOverlay(modal, options = {}) {
  if (!(modal instanceof HTMLElement)) {
    return null;
  }
  if (typeof uiTools?.prepareModalOverlay === "function") {
    return uiTools.prepareModalOverlay(modal, options);
  }
  if (typeof options.close === "function") {
    modal.__controlerCloseModal = options.close;
  }
  if (options.persistent === true) {
    modal.dataset.controlerModalPersistent = "true";
  }
  if (options.append !== false && !modal.isConnected && document.body) {
    document.body.appendChild(modal);
  }
  uiTools?.stopModalContentPropagation?.(modal);
  return modal;
}

function removePlanModalElement(modal) {
  if (modal?.parentNode) {
    modal.parentNode.removeChild(modal);
  }
}

function bindPlanFormModalEventShield(modal) {
  if (!(modal instanceof HTMLElement) || modal.dataset.planFormShieldBound === "true") {
    return modal;
  }
  modal.dataset.planFormShieldBound = "true";
  const stopOverlayEvent = (event) => {
    if (event?.target === modal) {
      event.preventDefault();
    }
    event?.stopPropagation?.();
  };
  modal.addEventListener("pointerdown", stopOverlayEvent);
  modal.addEventListener("mousedown", stopOverlayEvent);
  modal.addEventListener("click", stopOverlayEvent);
  modal.addEventListener("touchstart", stopOverlayEvent, {
    passive: false,
  });
  modal.addEventListener("touchend", stopOverlayEvent, {
    passive: false,
  });
  return modal;
}

const PLAN_WIDGET_CONTEXT = (() => {
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

function getPlanWidgetTitle(kind = "") {
  switch (kind) {
    case "todos":
      return "待办事项";
    case "checkins":
      return "打卡列表";
    case "week-view":
      return "周视图";
    case "month-view":
      return "月视图";
    case "year-view":
      return "年视图";
    default:
      return "时间计划";
  }
}

function applyPlanDesktopWidgetMode() {
  if (!PLAN_WIDGET_CONTEXT.enabled) {
    return;
  }

  document.body.classList.add("desktop-widget-page", "desktop-widget-plan-page");
  document.body.dataset.widgetKind = PLAN_WIDGET_CONTEXT.kind || "week-view";
  document.title = localizePlanUiText(
    `${getPlanWidgetTitle(PLAN_WIDGET_CONTEXT.kind)} 小组件`,
  );

  if (!document.getElementById("desktop-widget-plan-style")) {
    const style = document.createElement("style");
    style.id = "desktop-widget-plan-style";
    style.textContent = `
      body.desktop-widget-plan-page {
        overflow: hidden;
      }

      body.desktop-widget-plan-page .app-sidebar,
      body.desktop-widget-plan-page .plan-topbar {
        display: none !important;
      }

      body.desktop-widget-plan-page .plan-main {
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

      body.desktop-widget-plan-page #planner-dashboard {
        display: flex !important;
        flex: 1 1 auto !important;
        align-items: stretch !important;
        min-height: 0 !important;
        height: 100% !important;
        padding: 0 !important;
        gap: 12px !important;
        overflow: hidden !important;
        grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.92fr) !important;
      }

      body.desktop-widget-plan-page .planner-panel {
        display: flex !important;
        flex: 1 1 0 !important;
        flex-direction: column !important;
        min-width: 0 !important;
        min-height: 0 !important;
        height: 100% !important;
        overflow: hidden !important;
      }

      body.desktop-widget-plan-page .planner-panel-header,
      body.desktop-widget-plan-page .todo-primary-toolbar,
      body.desktop-widget-plan-page #todo-view-controls,
      body.desktop-widget-plan-page #checkin-view-controls,
      body.desktop-widget-plan-page #todo-view-controls > .todo-control-strip,
      body.desktop-widget-plan-page #checkin-view-controls > div {
        flex: 0 0 auto !important;
        min-height: 0 !important;
      }

      body.desktop-widget-plan-page #stats-container,
      body.desktop-widget-plan-page #todo-panel-anchor,
      body.desktop-widget-plan-page .todo-panel-stack,
      body.desktop-widget-plan-page #todo-list-container,
      body.desktop-widget-plan-page #todo-quadrant-container,
      body.desktop-widget-plan-page #checkin-list-container {
        min-height: 0 !important;
      }

      body.desktop-widget-plan-page #stats-container {
        flex: 1 1 auto !important;
        height: auto !important;
        overflow: auto !important;
        overscroll-behavior: contain;
      }

      body.desktop-widget-plan-page #todo-panel-anchor {
        flex: 1 1 auto !important;
      }

      body.desktop-widget-plan-page .todo-panel-stack {
        display: flex !important;
        flex: 1 1 auto !important;
        flex-direction: column !important;
        gap: 12px !important;
        min-height: 0 !important;
        padding-right: 2px;
        overflow: auto !important;
        overscroll-behavior: contain;
      }

      body.desktop-widget-plan-page .todo-panel-stack > * {
        min-width: 0 !important;
      }

      body.desktop-widget-plan-page #todo-list-container,
      body.desktop-widget-plan-page #todo-quadrant-container,
      body.desktop-widget-plan-page #checkin-list-container {
        flex: 0 0 auto !important;
        overflow: visible !important;
      }

      body.desktop-widget-plan-page #todo-stats-panel,
      body.desktop-widget-plan-page #checkin-stats-panel {
        gap: 8px !important;
      }

      body.desktop-widget-plan-page .modal-overlay {
        z-index: 3000 !important;
      }

      body.desktop-widget-plan-page .modal-content {
        max-height: calc(100vh - 24px) !important;
      }
    `;
    document.head.appendChild(style);
  }

  const dashboard = document.getElementById("planner-dashboard");
  const plansPanel = document.querySelector(".planner-panel--plans");
  const todoPanel = document.getElementById("todo-panel-anchor");

  if (dashboard instanceof HTMLElement) {
    dashboard.style.display = "flex";
    dashboard.style.height = "100%";
    dashboard.style.minHeight = "0";
    dashboard.style.padding = "0";
    dashboard.style.overflow = "hidden";
  }

  if (["todos", "checkins"].includes(PLAN_WIDGET_CONTEXT.kind)) {
    if (plansPanel instanceof HTMLElement) {
      plansPanel.style.display = "none";
    }
    if (todoPanel instanceof HTMLElement) {
      todoPanel.style.display = "flex";
      todoPanel.style.height = "100%";
    }
    window.location.hash = "#todo-panel-anchor";
    window.__controlerPlannerMobilePanel = "todos";
    window.__controlerTodoWidgetView =
      PLAN_WIDGET_CONTEXT.kind === "checkins" ? "checkins" : "todos";
    return;
  }

  if (plansPanel instanceof HTMLElement) {
    plansPanel.style.display = "flex";
    plansPanel.style.height = "100%";
  }
  if (todoPanel instanceof HTMLElement) {
    todoPanel.style.display = "none";
  }
}

function matchesId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function isCompactMobileLayout() {
  return window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH;
}

function isReactNativePlannerRuntime() {
  return !!window.ControlerNativeBridge?.isReactNativeApp;
}

function getPlannerPagerMode() {
  if (PLAN_WIDGET_CONTEXT.enabled || !isCompactMobileLayout()) {
    return "";
  }
  return isReactNativePlannerRuntime() ? "mobile" : "desktop";
}

function shouldUseCompactPlannerPager() {
  return getPlannerPagerMode() !== "";
}

function normalizePlanNotificationConfig(rawNotification, planLike = {}) {
  return getReminderTools()?.normalizePlanReminder?.(rawNotification, planLike) || {
    enabled: false,
    mode: "none",
    minutesBefore: 15,
    customTime: planLike?.startTime || "09:00",
    customOffsetDays: 0,
  };
}

function getPlanReminderBaseDate(planLike = null) {
  return (
    planLike?._occurrenceDate ||
    planLike?.date ||
    currentDate.toISOString().split("T")[0]
  );
}

function getPlanReminderSectionHtml(planLike = null, prefix = "plan") {
  const baseDateText = getPlanReminderBaseDate(planLike);
  const reminderConfig = normalizePlanNotificationConfig(planLike?.notification, {
    ...planLike,
    date: baseDateText,
  });
  const customDateTimeValue =
    getReminderTools()?.buildRelativeCustomDateTimeValue?.(
      baseDateText,
      reminderConfig,
      planLike?.startTime || "09:00",
    ) || "";

  return `
    <div>
      <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
        通知
      </label>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
          <input type="radio" name="${prefix}-notification-mode" value="none" ${!reminderConfig.enabled || reminderConfig.mode === "none" ? "checked" : ""}>
          <span style="font-size: 14px;">不通知</span>
        </label>
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
          <input type="radio" name="${prefix}-notification-mode" value="before_start" ${reminderConfig.enabled && reminderConfig.mode === "before_start" ? "checked" : ""}>
          <span style="font-size: 14px;">开始前提醒</span>
        </label>
        <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
          <input type="radio" name="${prefix}-notification-mode" value="custom" ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "checked" : ""}>
          <span style="font-size: 14px;">自定义时间</span>
        </label>
      </div>
      <div id="${prefix}-notification-before-wrap" style="
        margin-top: 10px;
        padding: 10px;
        border-radius: 8px;
        background-color: var(--bg-tertiary);
        display: ${reminderConfig.enabled && reminderConfig.mode === "before_start" ? "block" : "none"};
      ">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
          提前多少分钟提醒
        </label>
        <input
          type="number"
          id="${prefix}-notification-before-minutes-input"
          min="1"
          max="${getReminderTools()?.MAX_PLAN_BEFORE_MINUTES || 10080}"
          value="${reminderConfig.minutesBefore}"
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
      <div id="${prefix}-notification-custom-wrap" style="
        margin-top: 10px;
        padding: 10px;
        border-radius: 8px;
        background-color: var(--bg-tertiary);
        display: ${reminderConfig.enabled && reminderConfig.mode === "custom" ? "block" : "none"};
      ">
        <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 13px;">
          自定义提醒时间
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
          若计划开启重复，将按相同的相对提醒时间应用到自动重复的计划上。
        </div>
      </div>
    </div>
  `;
}

function bindPlanReminderInputs(modal, prefix = "plan") {
  const radios = modal.querySelectorAll(
    `input[name="${prefix}-notification-mode"]`,
  );
  const beforeWrap = modal.querySelector(
    `#${prefix}-notification-before-wrap`,
  );
  const customWrap = modal.querySelector(
    `#${prefix}-notification-custom-wrap`,
  );
  const syncReminderMode = () => {
    const activeMode =
      modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
        ?.value || "none";
    if (beforeWrap) {
      beforeWrap.style.display =
        activeMode === "before_start" ? "block" : "none";
    }
    if (customWrap) {
      customWrap.style.display = activeMode === "custom" ? "block" : "none";
    }
  };
  radios.forEach((radio) => {
    radio.addEventListener("change", syncReminderMode);
  });
  syncReminderMode();
}

function bindPlanReminderBaseDateSync(
  modal,
  prefix = "plan",
  options = {},
) {
  const customInput = modal.querySelector(`#${prefix}-notification-custom-input`);
  if (!customInput) {
    return;
  }

  const dateInput = modal.querySelector(options.dateSelector || "");
  const startTimeInput = modal.querySelector(options.startTimeSelector || "");
  const repeatInputs = modal.querySelectorAll(options.repeatSelector || "");
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
    const baseDateText =
      dateInput?.value || currentDate.toISOString().split("T")[0];
    const timeText =
      (customInput.value.includes("T") ? customInput.value.split("T")[1] : "") ||
      startTimeInput?.value ||
      "09:00";
    customInput.value = `${baseDateText}T${timeText}`;
  };

  customInput.addEventListener("change", () => {
    customInputDirty = true;
  });
  dateInput?.addEventListener("change", syncCustomReminderInput);
  startTimeInput?.addEventListener("change", syncCustomReminderInput);
  repeatInputs.forEach((input) => {
    input.addEventListener("change", syncCustomReminderInput);
  });
  syncCustomReminderInput();
}

function readPlanReminderConfig(modal, planLike = {}, prefix = "plan") {
  const mode =
    modal.querySelector(`input[name="${prefix}-notification-mode"]:checked`)
      ?.value || "none";
  const baseDateText = getPlanReminderBaseDate(planLike);

  if (mode === "before_start") {
    return normalizePlanNotificationConfig(
      {
        enabled: true,
        mode,
        minutesBefore: modal.querySelector(
          `#${prefix}-notification-before-minutes-input`,
        )?.value,
      },
      {
        ...planLike,
        date: baseDateText,
      },
    );
  }

  if (mode === "custom") {
    const customInputValue =
      modal.querySelector(`#${prefix}-notification-custom-input`)?.value || "";
    const parsedCustomConfig =
      reminderTools?.parseRelativeCustomDateTimeInput?.(
        customInputValue,
        baseDateText,
        {
          fallbackTime: planLike?.startTime || "09:00",
        },
      ) || {
        customTime: planLike?.startTime || "09:00",
        customOffsetDays: 0,
      };

    return normalizePlanNotificationConfig(
      {
        enabled: true,
        mode,
        customTime: parsedCustomConfig.customTime,
        customOffsetDays: parsedCustomConfig.customOffsetDays,
      },
      {
        ...planLike,
        date: baseDateText,
      },
    );
  }

  return normalizePlanNotificationConfig(
    {
      enabled: false,
      mode: "none",
    },
    {
      ...planLike,
      date: baseDateText,
    },
  );
}

function getMobileResponsiveScaleFactor() {
  return isCompactMobileLayout() ? MOBILE_TABLE_SCALE_RATIO : 1;
}

function getTableScaleSetting(tableKey, fallback = 1) {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("读取计划页尺寸设置失败:", error);
  }

  const perScale = parseFloat(settings?.per?.[tableKey]);
  const legacyScale = parseFloat(localStorage.getItem("planWeekScale") || "");

  const safePer = Number.isFinite(perScale)
    ? Math.min(Math.max(perScale, 0.1), 2.2)
    : Number.isFinite(legacyScale)
      ? Math.min(Math.max(legacyScale, 0.1), 2.2)
      : fallback;

  return Math.min(
    Math.max(safePer * getMobileResponsiveScaleFactor(), 0.1),
    2.2,
  );
}

function bindTableScaleLiveRefresh() {
  const rerender = () => {
    renderCalendarContent();
  };

  window.addEventListener(TABLE_SIZE_EVENT_NAME, rerender);
  window.addEventListener("resize", rerender);
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
}

let planExternalStorageRefreshQueued = false;
const planExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async () => {
      await refreshPlanFromExternalStorageChange();
    },
  }) || null;

function getPlanNormalizedChangedSections(changedSections = []) {
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

function hasPlanChangedPeriodOverlap(changedPeriodIds = [], currentPeriodIds = []) {
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

function isPlanSerializableEqual(left, right) {
  if (typeof uiTools?.isSerializableEqual === "function") {
    return uiTools.isSerializableEqual(left, right);
  }
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch (error) {
    return false;
  }
}

function shouldRefreshPlanCoreData(nextData = null) {
  if (!nextData || typeof nextData !== "object") {
    return true;
  }
  return !isPlanSerializableEqual(nextData.yearlyGoals || {}, yearlyGoals || {});
}

function shouldRefreshPlanForExternalChange(detail = {}) {
  const changedSections = getPlanNormalizedChangedSections(detail?.changedSections);
  if (!changedSections.length) {
    return true;
  }
  const planChanged = changedSections.includes("plans");
  const recurringChanged = changedSections.includes("plansRecurring");
  const yearlyGoalsChanged =
    changedSections.includes("yearlyGoals") || changedSections.includes("core");
  if (!planChanged && !recurringChanged && !yearlyGoalsChanged) {
    return false;
  }
  if (recurringChanged) {
    return true;
  }
  if (
    planChanged &&
    hasPlanChangedPeriodOverlap(
      detail?.changedPeriods?.plans || [],
      planLoadedPeriodIds.length ? planLoadedPeriodIds : getPlanPeriodIdsForVisibleView(),
    )
  ) {
    return true;
  }
  if (yearlyGoalsChanged && shouldRefreshPlanCoreData(detail?.data)) {
    return true;
  }
  return false;
}

function renderPlanGuideCard() {
  const container = document.getElementById("plan-guide-card");
  const guideCard = window.ControlerGuideBundle?.getGuideCard?.("plan");
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (PLAN_WIDGET_CONTEXT.enabled) {
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

function refreshPlanTodoSidebarFromExternalChange(detail = {}) {
  const changedSections = getPlanNormalizedChangedSections(detail?.changedSections);
  const todoRelatedChanged =
    changedSections.includes("todos") ||
    changedSections.includes("checkinItems") ||
    changedSections.includes("dailyCheckins") ||
    changedSections.includes("checkins") ||
    changedSections.includes("core");
  if (!todoRelatedChanged) {
    return false;
  }
  if (
    !todoSidebarRuntimeReady ||
    typeof window.ControlerTodoRuntime?.initPlanSidebar !== "function"
  ) {
    return false;
  }
  window.ControlerTodoRuntime.initPlanSidebar({
    initialView: window.__controlerTodoWidgetView || "todos",
    persistWidgetView: true,
  });
  return true;
}

function refreshPlanFromExternalStorageChange() {
  if (!planShellPageActive) {
    planExternalStorageRefreshPendingResume = true;
    planExternalStorageRefreshQueued = false;
    return;
  }
  planExternalStorageRefreshQueued = false;
  const requestId = ++planLoadRequestId;
  const runRefresh = async () => {
    if (!planRefreshController) {
      setPlanLoadingState({
        active: true,
        mode: getPlanLoadingMode({
          blocking: true,
        }),
        delayMs: getPlanLoadingDelayMs({
          blocking: true,
        }),
        message: "正在同步最新计划数据，请稍候",
      });
      try {
        const snapshot = await readPlanWorkspace();
        if (requestId !== planLoadRequestId) {
          return;
        }
        applyPlanWorkspaceState(snapshot);
        renderPlanGuideCard();
        renderCalendarContent();
        planInitialDataLoaded = true;
      } finally {
        if (requestId === planLoadRequestId) {
          setPlanLoadingState({
            active: false,
          });
        }
      }
      return;
    }

    await planRefreshController.run(
      () => readPlanWorkspace(),
      {
        delayMs: getPlanLoadingDelayMs({
          blocking: true,
        }),
        loadingOptions: {
          mode: getPlanLoadingMode({
            blocking: true,
          }),
          message: "正在同步最新计划数据，请稍候",
        },
        commit: async (snapshot) => {
          if (requestId !== planLoadRequestId) {
            return;
          }
          applyPlanWorkspaceState(snapshot);
          renderPlanGuideCard();
          renderCalendarContent();
          planInitialDataLoaded = true;
          planInitialDataValidated = true;
        },
      },
    );
  };
  void runRefresh().catch((error) => {
    console.error("刷新计划页外部存储失败:", error);
  });
}

function bindPlanExternalStorageRefresh() {
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail = event?.detail || {};
    const changedSections = getPlanNormalizedChangedSections(detail?.changedSections);
    if (changedSections.includes("guideState")) {
      renderPlanGuideCard();
    }
    refreshPlanTodoSidebarFromExternalChange(detail);
    if (!shouldRefreshPlanForExternalChange(detail)) {
      uiTools?.markPerfStage?.("refresh-skipped", {
        reason: "plan-storage-change-irrelevant",
      });
      return;
    }
    if (planExternalStorageRefreshQueued) {
      return;
    }
    planExternalStorageRefreshQueued = true;
    if (planExternalStorageRefreshCoordinator) {
      planExternalStorageRefreshCoordinator.enqueue(detail);
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(refreshPlanFromExternalStorageChange);
  });
}

function normalizePlanDateKey(value) {
  return (
    window.ControlerDataIndex?.formatDateKey?.(value) ||
    (typeof value === "string" ? String(value || "").trim().slice(0, 10) : "")
  );
}

function normalizePlanDateList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => normalizePlanDateKey(item))
        .filter(Boolean),
    ),
  ).sort();
}

function parsePlanDateFromKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "").trim())) {
    return null;
  }
  const [yearText, monthText, dayText] = String(dateKey).split("-");
  const parsed = new Date(
    Number.parseInt(yearText, 10),
    Number.parseInt(monthText, 10) - 1,
    Number.parseInt(dayText, 10),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function applyPlanDerivedFields(plan) {
  if (!plan || typeof plan !== "object") {
    return plan;
  }
  const dateKey = normalizePlanDateKey(plan.date);
  const baseDate = parsePlanDateFromKey(dateKey);
  plan.dateKey = dateKey;
  plan.startDateMs = baseDate ? baseDate.getTime() : 0;
  plan.dayOfWeek = baseDate ? baseDate.getDay() : -1;
  plan.dayOfMonth = baseDate ? baseDate.getDate() : 0;
  plan.repeatDays = Array.isArray(plan.repeatDays)
    ? plan.repeatDays
        .map((day) => parseInt(day, 10))
        .filter((day) => day >= 0 && day <= 6)
    : [];
  plan.excludedDates = normalizePlanDateList(plan.excludedDates);
  plan.excludedDateSet = new Set(plan.excludedDates);
  plan.completedDates = normalizePlanDateList(plan.completedDates);
  plan.completedDateSet = new Set(plan.completedDates);
  plan.uncompletedDates = normalizePlanDateList(plan.uncompletedDates);
  plan.uncompletedDateSet = new Set(plan.uncompletedDates);
  return plan;
}

function isRecurringPlan(planLike = null) {
  return String(planLike?.repeat || "none").trim().toLowerCase() !== "none";
}

function getPlanOccurrenceDateKey(planLike = null, occurrenceDate = null) {
  return normalizePlanDateKey(
    occurrenceDate || planLike?._occurrenceDate || planLike?.date,
  );
}

function getPlanCompletionState(planLike = null, occurrenceDate = null) {
  if (!planLike || typeof planLike !== "object") {
    return false;
  }
  const plan = applyPlanDerivedFields(planLike);
  const dateKey = getPlanOccurrenceDateKey(plan, occurrenceDate);
  if (isRecurringPlan(plan) && dateKey) {
    if (plan.uncompletedDateSet instanceof Set && plan.uncompletedDateSet.has(dateKey)) {
      return false;
    }
    if (plan.completedDateSet instanceof Set && plan.completedDateSet.has(dateKey)) {
      return true;
    }
  }
  return !!plan.isCompleted;
}

function setStoredPlanCompletionState(planLike = null, nextCompleted = false, occurrenceDate = null) {
  if (!planLike || typeof planLike !== "object") {
    return planLike;
  }
  const plan = applyPlanDerivedFields(planLike);
  if (!isRecurringPlan(plan)) {
    plan.isCompleted = !!nextCompleted;
    plan.completedDates = [];
    plan.uncompletedDates = [];
    return applyPlanDerivedFields(plan);
  }

  const dateKey = getPlanOccurrenceDateKey(plan, occurrenceDate);
  if (!dateKey) {
    plan.isCompleted = !!nextCompleted;
    return applyPlanDerivedFields(plan);
  }

  const fallbackCompleted = !!plan.isCompleted;
  const completedDates = normalizePlanDateList(
    (Array.isArray(plan.completedDates) ? plan.completedDates : []).filter(
      (item) => item !== dateKey,
    ),
  );
  const uncompletedDates = normalizePlanDateList(
    (Array.isArray(plan.uncompletedDates) ? plan.uncompletedDates : []).filter(
      (item) => item !== dateKey,
    ),
  );

  if (!!nextCompleted !== fallbackCompleted) {
    if (nextCompleted) {
      completedDates.push(dateKey);
    } else {
      uncompletedDates.push(dateKey);
    }
  }

  plan.completedDates = normalizePlanDateList(completedDates);
  plan.uncompletedDates = normalizePlanDateList(uncompletedDates);
  return applyPlanDerivedFields(plan);
}

// 计划数据结构
class Plan {
  constructor(
    name,
    date,
    startTime,
    endTime,
    color = null,
    repeat = "none",
    projectId = null,
    repeatDays = [],
    notification = null,
  ) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.name = name;
    this.date = date; // YYYY-MM-DD格式
    this.startTime = startTime; // HH:MM格式
    this.endTime = endTime; // HH:MM格式
    this.color = color || this.generateColor();
    this.repeat = repeat; // "none", "daily", "weekly", "monthly"
    this.projectId = projectId; // 关联的项目ID
    this.repeatDays = Array.isArray(repeatDays) ? repeatDays : []; // 每周重复对应的周几数组（0-6）
    this.excludedDates = []; // 针对重复计划，排除某一次出现
    this.completedDates = [];
    this.uncompletedDates = [];
    this.createdAt = new Date().toISOString();
    this.isCompleted = false;
    this.notification = normalizePlanNotificationConfig(notification, {
      date,
      startTime,
    });
    applyPlanDerivedFields(this);
  }

  generateColor() {
    // 生成随机但视觉友好的颜色
    const colors = [
      "#79af85",
      "#4299e1",
      "#ed8936",
      "#9f7aea",
      "#f56565",
      "#48bb78",
      "#ecc94b",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // 检查计划是否在特定日期
  isOnDate(checkDate) {
    const targetDateKey = normalizePlanDateKey(checkDate);
    if (!targetDateKey) return false;
    if (this.excludedDateSet instanceof Set && this.excludedDateSet.has(targetDateKey)) {
      return false;
    }
    if (!this.dateKey) {
      applyPlanDerivedFields(this);
    }
    if (!this.dateKey) {
      return false;
    }

    // 如果日期匹配
    if (this.dateKey === targetDateKey) {
      return true;
    }

    // 检查重复规则
    if (this.repeat === "none") {
      return false;
    }

    // 重复计划不应在起始日期之前生效
    if (targetDateKey < this.dateKey) return false;

    if (this.repeat === "daily") {
      return true; // 每天都重复
    } else if (this.repeat === "weekly") {
      const targetDate = parsePlanDateFromKey(targetDateKey);
      if (!(targetDate instanceof Date)) {
        return false;
      }
      // 支持选择每周的具体星期几
      if (Array.isArray(this.repeatDays) && this.repeatDays.length > 0) {
        return this.repeatDays.includes(targetDate.getDay());
      }
      // 兼容旧数据：按起始日重复
      return this.dayOfWeek === targetDate.getDay();
    } else if (this.repeat === "monthly") {
      const targetDate = parsePlanDateFromKey(targetDateKey);
      if (!(targetDate instanceof Date)) {
        return false;
      }
      // 每月同一天
      return this.dayOfMonth === targetDate.getDate();
    }

    return false;
  }
}

function hydratePlan(rawPlan) {
  const plan = new Plan(
    rawPlan.name || "未命名计划",
    rawPlan.date || new Date().toISOString().split("T")[0],
    rawPlan.startTime || "09:00",
    rawPlan.endTime || "10:00",
    rawPlan.color || null,
    rawPlan.repeat || "none",
    rawPlan.projectId || null,
    Array.isArray(rawPlan.repeatDays)
      ? rawPlan.repeatDays
          .map((day) => parseInt(day, 10))
          .filter((day) => day >= 0 && day <= 6)
      : [],
    rawPlan.notification || null,
  );

  if (rawPlan.id) {
    plan.id = rawPlan.id;
  }
  if (rawPlan.createdAt) {
    plan.createdAt = rawPlan.createdAt;
  }
  plan.isCompleted = !!rawPlan.isCompleted;
  plan.excludedDates = Array.isArray(rawPlan.excludedDates)
    ? rawPlan.excludedDates
    : [];
  plan.completedDates = Array.isArray(rawPlan.completedDates)
    ? rawPlan.completedDates
    : [];
  plan.uncompletedDates = Array.isArray(rawPlan.uncompletedDates)
    ? rawPlan.uncompletedDates
    : [];
  plan.notification = normalizePlanNotificationConfig(rawPlan.notification, {
    ...rawPlan,
    date: plan.date,
    startTime: plan.startTime,
  });
  return applyPlanDerivedFields(plan);
}

function loadYearlyGoals() {
  try {
    if (typeof window.ControlerStorage?.getCoreState === "function") {
      return window.ControlerStorage.getCoreState().then((coreState) => {
        yearlyGoals = normalizeYearlyGoalsState(coreState?.yearlyGoals || {});
      });
    }
    const savedGoals = localStorage.getItem("yearlyGoals");
    yearlyGoals = normalizeYearlyGoalsState(
      savedGoals ? JSON.parse(savedGoals) : {},
    );
  } catch (error) {
    console.error("加载年度目标失败:", error);
    yearlyGoals = {};
  }
}

function saveYearlyGoals() {
  return queuePlanPersistenceTask(() => {
    yearlyGoals = normalizeYearlyGoalsState(yearlyGoals);
    if (typeof window.ControlerStorage?.appendJournal === "function") {
      return window.ControlerStorage.appendJournal(
        [
          {
            kind: "replaceCoreState",
            partialCore: {
              yearlyGoals,
            },
          },
        ],
        {
          reason: "plan-yearly-goals-save",
        },
      );
    }
    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      return window.ControlerStorage.replaceCoreState({
        yearlyGoals,
      });
    }
    localStorage.setItem("yearlyGoals", JSON.stringify(yearlyGoals));
    return true;
  }, "保存年度目标失败:");
}

async function requestPlanConfirmation(message, options = {}) {
  if (uiTools?.confirmDialog) {
    return uiTools.confirmDialog({
      title: localizePlanUiText(options.title || "请确认操作"),
      message: localizePlanUiText(message),
      confirmText: localizePlanUiText(options.confirmText || "确定"),
      cancelText: localizePlanUiText(options.cancelText || "取消"),
      danger: !!options.danger,
    });
  }
  return confirm(localizePlanUiText(message));
}

async function showPlanAlert(message, options = {}) {
  if (uiTools?.alertDialog) {
    await uiTools.alertDialog({
      title: localizePlanUiText(options.title || "提示"),
      message: localizePlanUiText(message),
      confirmText: localizePlanUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }
  alert(localizePlanUiText(message));
}

function handlePlanNonBlockingSaveFailure(message, options = {}) {
  console.error(message, options.error || "");
  if (typeof window.ControlerStorage?.syncFromSource === "function") {
    void window.ControlerStorage
      .syncFromSource({
        reason: "plan-save-recovery",
      })
      .then((result) => {
        if (!result?.state || typeof result.state !== "object") {
          return;
        }
        applyPlanWorkspaceState({
          plans: result.state.plans || [],
          yearlyGoals: result.state.yearlyGoals || {},
          loadedPeriodIds: planLoadedPeriodIds,
        });
        renderPlanGuideCard();
        renderCalendarContent();
        clearPlanPersistenceError();
      })
      .catch((error) => {
        console.error("恢复计划工作区失败:", error);
      });
  }
  void showPlanAlert(options.message || "保存计划失败，请稍后重试。", {
    title: options.title || "保存失败",
    danger: true,
  }).catch?.(() => {});
}

// 加载数据
async function readPlanWorkspace(options = {}) {
  try {
    const targetView =
      typeof options?.view === "string" && options.view.trim()
        ? options.view.trim()
        : currentView;
    const shouldLoadPlans =
      options.includePlans !== false && targetView !== "year";
    const retainedPlans = Array.isArray(options?.basePlans)
      ? options.basePlans
      : Array.isArray(plans)
        ? plans
        : [];
    const retainedPeriodIds = Array.isArray(options?.loadedPeriodIds)
      ? options.loadedPeriodIds
      : planLoadedPeriodIds;
    const bootstrapOptions = {
      includeYearlyGoals: options.includeYearlyGoals !== false,
      includeRecurringPlans:
        shouldLoadPlans && options.includeRecurringPlans !== false,
    };
    if (typeof window.ControlerStorage?.getPageBootstrapState === "function") {
      const periodIds = shouldLoadPlans
        ? Array.isArray(options.periodIds) && options.periodIds.length
          ? options.periodIds
          : getPlanPeriodIdsForVisibleView()
        : [];
      uiTools?.markPerfStage?.("plan-bootstrap-bridge-start", {
        allowRepeat: true,
        periodIds: periodIds.slice(),
        view: targetView,
      });
      const pageBootstrap = await window.ControlerStorage.getPageBootstrapState(
        "plan",
        {
          ...bootstrapOptions,
          periodIds,
        },
      );
      uiTools?.markPerfStage?.("plan-bootstrap-bridge-done", {
        allowRepeat: true,
        periodIds: periodIds.slice(),
        planCount: Array.isArray(pageBootstrap?.data?.visiblePlans)
          ? pageBootstrap.data.visiblePlans.length
          : 0,
        view: targetView,
      });
      if (pageBootstrap && typeof pageBootstrap === "object") {
        const snapshot = normalizePlanPageBootstrapSnapshot(pageBootstrap);
        return shouldLoadPlans
          ? snapshot
          : {
              plans: retainedPlans.map((rawPlan) => hydratePlan(rawPlan)),
              yearlyGoals: snapshot.yearlyGoals,
              loadedPeriodIds: Array.isArray(retainedPeriodIds)
                ? retainedPeriodIds.slice()
                : [],
            };
      }
    }
    if (
      typeof window.ControlerStorage?.loadSectionRange === "function" &&
      (
        typeof window.ControlerStorage?.getPlanBootstrapState === "function" ||
        typeof window.ControlerStorage?.getCoreState === "function"
      )
    ) {
      const periodIds = shouldLoadPlans
        ? Array.isArray(options.periodIds) && options.periodIds.length
          ? options.periodIds
          : getPlanPeriodIdsForVisibleView()
        : [];
      uiTools?.markPerfStage?.("plan-bootstrap-bridge-start", {
        allowRepeat: true,
        periodIds: periodIds.slice(),
        view: targetView,
      });
      const [planResult, bootstrapState] = await Promise.all([
        shouldLoadPlans
          ? window.ControlerStorage.loadSectionRange("plans", { periodIds })
          : Promise.resolve({
              items: retainedPlans,
            }),
        readPlanBootstrapState(bootstrapOptions),
      ]);
      uiTools?.markPerfStage?.("plan-bootstrap-bridge-done", {
        allowRepeat: true,
        periodIds: periodIds.slice(),
        planCount: Array.isArray(planResult?.items) ? planResult.items.length : 0,
        view: targetView,
      });
      const recurringPlans = Array.isArray(bootstrapState?.recurringPlans)
        ? bootstrapState.recurringPlans
        : [];
      return {
        plans: (
          shouldLoadPlans
            ? [...(planResult?.items || []), ...recurringPlans]
            : retainedPlans
        ).map((rawPlan) =>
          hydratePlan(rawPlan),
        ),
        yearlyGoals: normalizeYearlyGoalsState(bootstrapState?.yearlyGoals || {}),
        loadedPeriodIds: shouldLoadPlans
          ? periodIds.slice()
          : Array.isArray(retainedPeriodIds)
            ? retainedPeriodIds.slice()
            : [],
      };
    }

    if (!shouldLoadPlans) {
      const savedGoals = localStorage.getItem("yearlyGoals");
      return {
        plans: retainedPlans.map((rawPlan) => hydratePlan(rawPlan)),
        yearlyGoals: normalizeYearlyGoalsState(
          savedGoals ? JSON.parse(savedGoals) : yearlyGoals,
        ),
        loadedPeriodIds: Array.isArray(retainedPeriodIds)
          ? retainedPeriodIds.slice()
          : [],
      };
    }

    const savedPlans = localStorage.getItem("plans");
    const savedGoals = localStorage.getItem("yearlyGoals");
    const parsedPlans = savedPlans ? JSON.parse(savedPlans) : [];
    return {
      plans: Array.isArray(parsedPlans)
        ? parsedPlans.map((rawPlan) => hydratePlan(rawPlan))
        : [],
      yearlyGoals: normalizeYearlyGoalsState(
        savedGoals ? JSON.parse(savedGoals) : yearlyGoals,
      ),
      loadedPeriodIds: [],
    };
  } catch (e) {
    console.error("加载计划数据失败:", e);
    return {
      plans: [],
      yearlyGoals: normalizeYearlyGoalsState({}),
      loadedPeriodIds: [],
    };
  }
}

function applyPlanWorkspaceState(snapshot = {}) {
  plans = Array.isArray(snapshot.plans) ? snapshot.plans : [];
  yearlyGoals = normalizeYearlyGoalsState(snapshot.yearlyGoals || {});
  planLoadedPeriodIds = Array.isArray(snapshot.loadedPeriodIds)
    ? snapshot.loadedPeriodIds.slice()
    : [];
  syncPlanDataIndex(["plans"]);
}

async function loadPlans(options = {}) {
  const snapshot = await readPlanWorkspace(options);
  applyPlanWorkspaceState(snapshot);
  return snapshot;
}

// 保存数据
function savePlans() {
  return queuePlanPersistenceTask(async () => {
    const oneTimePlans = plans.filter(
      (plan) => String(plan?.repeat || "").trim() === "none",
    );
    const recurringPlans = plans.filter(
      (plan) => String(plan?.repeat || "").trim() !== "none",
    );
    const periodIds = planLoadedPeriodIds.length
      ? planLoadedPeriodIds
      : [
          ...new Set(
            oneTimePlans
              .map((plan) => String(plan?.date || "").slice(0, 7))
              .filter(Boolean),
          ),
        ];
    if (typeof window.ControlerStorage?.appendJournal === "function") {
      await window.ControlerStorage.appendJournal(
        [
          ...periodIds.map((periodId) => ({
            kind: "saveSectionRange",
            section: "plans",
            payload: {
              periodId,
              items: oneTimePlans.filter(
                (plan) => String(plan?.date || "").slice(0, 7) === periodId,
              ),
              mode: "replace",
            },
          })),
          {
            kind: "replaceRecurringPlans",
            items: recurringPlans,
          },
        ],
        {
          reason: "plan-save",
        },
      );
      syncPlanDataIndex(["plans"]);
      getReminderTools()?.refresh?.({
        resetWindow: true,
      });
      uiTools?.markPerfStage?.("plan-action-storage-acked", {
        allowRepeat: true,
        oneTimeCount: oneTimePlans.length,
        recurringCount: recurringPlans.length,
      });
      return true;
    }
    if (
      typeof window.ControlerStorage?.saveSectionRange === "function" &&
      typeof window.ControlerStorage?.replaceRecurringPlans === "function"
    ) {
      await Promise.all(
        periodIds.map((periodId) =>
          window.ControlerStorage.saveSectionRange("plans", {
            periodId,
            items: oneTimePlans.filter(
              (plan) => String(plan?.date || "").slice(0, 7) === periodId,
            ),
            mode: "replace",
          }),
        ),
      );
      await window.ControlerStorage.replaceRecurringPlans(recurringPlans);
      syncPlanDataIndex(["plans"]);
      getReminderTools()?.refresh?.({
        resetWindow: true,
      });
      return true;
    }

    localStorage.setItem("plans", JSON.stringify(plans));
    syncPlanDataIndex(["plans"]);
    getReminderTools()?.refresh?.({
      resetWindow: true,
    });
    return true;
  }, "保存计划数据失败:").then((result) => {
    if (result !== false) {
      return result;
    }
    handlePlanNonBlockingSaveFailure("保存计划数据失败:", {
      error: planLastPersistenceError,
      message: "计划数据同步失败，已尝试恢复当前页面内容。",
    });
    return result;
  });
}

// 保存视图状态
function saveViewState() {
  try {
    localStorage.setItem("planViewState", currentView);
  } catch (e) {
    console.error("保存视图状态失败:", e);
  }
}

// 加载视图状态
function loadViewState() {
  try {
    const savedView = localStorage.getItem("planViewState");
    if (savedView) {
      if (["year", "month", "weekly-grid"].includes(savedView)) {
        currentView = savedView;
      } else if (savedView === "week" || savedView === "day") {
        currentView = "weekly-grid";
      } else {
        currentView = "weekly-grid";
      }
    }
  } catch (e) {
    console.error("加载视图状态失败:", e);
  }
}

function bindAddPlanInlineButton() {
  const addPlanButton = document.getElementById("add-plan-btn-inline");
  if (!addPlanButton || addPlanButton.dataset.bound === "true") {
    return;
  }

  addPlanButton.dataset.bound = "true";
  addPlanButton.addEventListener("click", showPlanEditModal);
}

function getRequestedPlannerPanel() {
  if (window.location.hash === "#todo-panel-anchor") {
    return "todos";
  }
  if (window.location.hash === "#plan-panel-anchor") {
    return "plans";
  }
  if (
    window.__controlerPlannerMobilePanel === "plans" ||
    window.__controlerPlannerMobilePanel === "todos"
  ) {
    return window.__controlerPlannerMobilePanel;
  }
  if (
    PLAN_WIDGET_CONTEXT.enabled &&
    ["todos", "checkins"].includes(PLAN_WIDGET_CONTEXT.kind)
  ) {
    return "todos";
  }
  return "todos";
}

let planInitialRevealQueued = false;

function queuePlanInitialReveal() {
  const body = document.body;
  if (!(body instanceof HTMLElement) || planInitialRevealQueued) {
    return;
  }
  if (!planShellRendered) {
    return;
  }
  if (!body.classList.contains("plan-bootstrap-pending")) {
    planShellReady = true;
    uiTools?.markNativePageReady?.();
    return;
  }

  planInitialRevealQueued = true;
  window.requestAnimationFrame(() => {
    syncPlannerPanelFromHash("auto");
    window.requestAnimationFrame(() => {
      planInitialRevealQueued = false;
      planShellReady = true;
      document.body?.classList.remove("plan-bootstrap-pending");
      document.body?.classList.add("plan-bootstrap-ready");
      window.dispatchEvent(new CustomEvent("controler:plan-initial-ready"));
      uiTools?.markPerfStage?.("first-render-done");
      uiTools?.markNativePageReady?.();
    });
  });
}

function getPlanLoadingOverlayElement() {
  return document.getElementById("plan-loading-overlay");
}

function getPlanLoadingOverlayController() {
  if (planLoadingOverlayController) {
    return planLoadingOverlayController;
  }
  const overlay = getPlanLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  planLoadingOverlayController = uiTools?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".app-main",
  }) || null;
  return planLoadingOverlayController;
}

function getPlanLoadingMode(options = {}) {
  if (options?.blocking === true || !planInitialDataValidated) {
    return "fullscreen";
  }
  return planShellRendered ? "inline" : "fullscreen";
}

function getPlanLoadingDelayMs(options = {}) {
  if (options?.blocking === true || !planInitialDataValidated) {
    return 0;
  }
  return planShellRendered ? PLAN_LOADING_OVERLAY_DELAY_MS : 0;
}

function setPlanLoadingState(options = {}) {
  const overlay = getPlanLoadingOverlayElement();
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
        ? "正在读取当前计划范围，请稍候"
        : "正在刷新当前计划内容，请稍候",
  } = options;
  const loadingController = getPlanLoadingOverlayController();
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

const planRefreshController = uiTools?.createAtomicRefreshController?.({
  defaultDelayMs: PLAN_LOADING_OVERLAY_DELAY_MS,
  showLoading: (loadingOptions = {}) => {
    setPlanLoadingState({
      active: true,
      ...loadingOptions,
    });
  },
  hideLoading: () => {
    setPlanLoadingState({
      active: false,
    });
  },
});

function getPlannerPanelElements(dashboard) {
  if (!(dashboard instanceof HTMLElement)) {
    return [];
  }

  return Array.from(dashboard.querySelectorAll("[data-mobile-panel]")).filter(
    (panel) => panel instanceof HTMLElement,
  );
}

function getNearestPlannerPanel(dashboard) {
  const panels = getPlannerPanelElements(dashboard);
  if (panels.length === 0) {
    return "";
  }

  const currentLeft = dashboard.scrollLeft;
  let nearestPanel = "todos";
  let nearestDistance = Number.POSITIVE_INFINITY;

  panels.forEach((panel) => {
    const panelName = panel.getAttribute("data-mobile-panel") || "";
    const distance = Math.abs(panel.offsetLeft - currentLeft);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPanel = panelName;
    }
  });

  return nearestPanel;
}

function syncPlannerPagerMode() {
  const dashboard = document.getElementById("planner-dashboard");
  if (!(dashboard instanceof HTMLElement)) {
    return "";
  }

  const pagerMode = getPlannerPagerMode();
  if (pagerMode) {
    dashboard.dataset.pagerMode = pagerMode;
  } else {
    delete dashboard.dataset.pagerMode;
    dashboard.classList.remove("planner-dashboard--dragging");
  }
  return pagerMode;
}

function scrollPlannerToPanel(panelName, behavior = "smooth") {
  const dashboard = document.getElementById("planner-dashboard");
  if (!(dashboard instanceof HTMLElement) || !shouldUseCompactPlannerPager()) {
    return;
  }

  const targetPanel = dashboard.querySelector(
    `[data-mobile-panel="${panelName}"]`,
  );
  if (!(targetPanel instanceof HTMLElement)) {
    return;
  }

  const targetLeft = targetPanel.offsetLeft;
  if (Math.abs(dashboard.scrollLeft - targetLeft) < 1) {
    return;
  }

  dashboard.scrollTo({
    left: targetLeft,
    behavior,
  });
}

function bindTodoSidebarBootstrapGate() {
  const todoPanel = document.getElementById("todo-panel-anchor");
  if (!(todoPanel instanceof HTMLElement) || todoPanel.dataset.runtimeGateBound === "true") {
    return;
  }

  todoPanel.dataset.runtimeGateBound = "true";
  todoPanel.addEventListener(
    "click",
    (event) => {
      if (todoSidebarRuntimeReady) {
        return;
      }
      const interactiveTarget = event.target?.closest(
        "button, input, textarea, select, option, label",
      );
      if (!(interactiveTarget instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void ensureTodoSidebarRuntimeLoaded({
        initialView: interactiveTarget.id === "checkin-view-btn" ? "checkins" : "todos",
        openComposer:
          interactiveTarget.id === "add-todo-btn" ||
          interactiveTarget.id === "add-first-todo-btn",
        reason: "interaction",
        persistWidgetView: true,
      }).catch(() => undefined);
    },
    true,
  );
}

function syncPlannerPanelFromHash(behavior = "auto") {
  if (!syncPlannerPagerMode()) {
    return;
  }
  const requestedPanel = getRequestedPlannerPanel();
  scrollPlannerToPanel(requestedPanel, behavior);
  if (requestedPanel === "plans" && planCalendarMountDeferred) {
    renderCalendarView({
      skipCoverageCheck: true,
    });
  }
  if (
    requestedPanel === "todos" &&
    window.location.hash === "#todo-panel-anchor"
  ) {
    void ensureTodoSidebarRuntimeLoaded({
      initialView: window.__controlerTodoWidgetView || "todos",
      reason: "hash-navigation",
      persistWidgetView: true,
    }).catch(() => undefined);
  }
}

function isPlannerPagerInteractiveTarget(target, dashboard) {
  if (!(target instanceof Element) || !(dashboard instanceof HTMLElement)) {
    return false;
  }

  if (
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "option",
        "label",
        "a",
        "[role='button']",
        "[contenteditable='true']",
        ".tree-select",
        ".tree-select-menu",
        ".tree-select-option",
        ".native-select-enhancer",
        ".weekly-glass-scroller",
        ".checkin-records-inline",
        ".modal-overlay",
        ".modal-content",
      ].join(","),
    )
  ) {
    return true;
  }

  let current = target;
  while (current && current !== dashboard) {
    if (current instanceof HTMLElement) {
      const canScrollHorizontally =
        current.scrollWidth - current.clientWidth > 8 &&
        /auto|scroll/i.test(window.getComputedStyle(current).overflowX || "");
      if (canScrollHorizontally) {
        return true;
      }
    }
    current = current.parentElement;
  }

  return false;
}

function bindPlannerMobileSwipe() {
  const dashboard = document.getElementById("planner-dashboard");
  if (!(dashboard instanceof HTMLElement) || dashboard.dataset.swipeBound === "true") {
    return;
  }

  dashboard.dataset.swipeBound = "true";
  window.__controlerPlannerMobilePanel = getRequestedPlannerPanel();

  let scrollFrame = 0;
  const desktopDragState = {
    active: false,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
  };

  const finishDesktopDrag = (event = null) => {
    if (
      event &&
      desktopDragState.pointerId !== null &&
      event.pointerId !== desktopDragState.pointerId
    ) {
      return;
    }
    if (!desktopDragState.active && !desktopDragState.dragging) {
      return;
    }

    if (
      desktopDragState.pointerId !== null &&
      dashboard.hasPointerCapture?.(desktopDragState.pointerId)
    ) {
      try {
        dashboard.releasePointerCapture(desktopDragState.pointerId);
      } catch (error) {
        // Ignore capture release errors during resize or rapid pointer changes.
      }
    }

    const shouldSnap =
      desktopDragState.dragging && getPlannerPagerMode() === "desktop";
    desktopDragState.active = false;
    desktopDragState.dragging = false;
    desktopDragState.pointerId = null;
    dashboard.classList.remove("planner-dashboard--dragging");

    if (!shouldSnap) {
      return;
    }

    const nearestPanel = getNearestPlannerPanel(dashboard);
    if (!nearestPanel) {
      return;
    }
    window.__controlerPlannerMobilePanel = nearestPanel;
    scrollPlannerToPanel(nearestPanel, "smooth");
  };

  dashboard.addEventListener(
    "scroll",
    () => {
      if (!shouldUseCompactPlannerPager()) {
        return;
      }

      if (scrollFrame) {
        window.cancelAnimationFrame(scrollFrame);
      }
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const nearestPanel = getNearestPlannerPanel(dashboard);
        if (nearestPanel) {
          window.__controlerPlannerMobilePanel = nearestPanel;
          if (nearestPanel === "todos") {
            void ensureTodoSidebarRuntimeLoaded({
              initialView: window.__controlerTodoWidgetView || "todos",
              reason: "panel-visible",
              persistWidgetView: true,
            }).catch(() => undefined);
          }
        }
      });
    },
    { passive: true },
  );

  dashboard.addEventListener("pointerdown", (event) => {
    if (getPlannerPagerMode() !== "desktop") {
      return;
    }
    if (event.pointerType === "touch" || event.button !== 0) {
      return;
    }
    if (isPlannerPagerInteractiveTarget(event.target, dashboard)) {
      return;
    }

    desktopDragState.active = true;
    desktopDragState.dragging = false;
    desktopDragState.pointerId = event.pointerId;
    desktopDragState.startX = event.clientX;
    desktopDragState.startY = event.clientY;
    desktopDragState.startLeft = dashboard.scrollLeft;
    dashboard.classList.remove("planner-dashboard--dragging");
    try {
      dashboard.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore pointer capture failures on unsupported runtimes.
    }
  });

  dashboard.addEventListener(
    "pointermove",
    (event) => {
      if (
        !desktopDragState.active ||
        desktopDragState.pointerId === null ||
        event.pointerId !== desktopDragState.pointerId ||
        getPlannerPagerMode() !== "desktop"
      ) {
        return;
      }

      const deltaX = event.clientX - desktopDragState.startX;
      const deltaY = event.clientY - desktopDragState.startY;

      if (!desktopDragState.dragging) {
        if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
          return;
        }
        if (Math.abs(deltaX) <= Math.abs(deltaY)) {
          finishDesktopDrag(event);
          return;
        }
        desktopDragState.dragging = true;
        dashboard.classList.add("planner-dashboard--dragging");
      }

      event.preventDefault();
      dashboard.scrollLeft = desktopDragState.startLeft - deltaX;
    },
    { passive: false },
  );

  dashboard.addEventListener("pointerup", finishDesktopDrag);
  dashboard.addEventListener("pointercancel", finishDesktopDrag);
  dashboard.addEventListener("lostpointercapture", finishDesktopDrag);

  syncPlannerPagerMode();
}

function parseDateInputValue() {
  return null;
}


function initTimeSelector() {
  const applyBtn = document.getElementById("apply-time-range");
  const resetBtn = document.getElementById("reset-time-range");
  const startDate = document.getElementById("start-date-select");
  const endDate = document.getElementById("end-date-select");
  const customTimeStart = document.getElementById("custom-time-start");
  const customTimeEnd = document.getElementById("custom-time-end");

  // 设置默认日期（今天）
  const today = new Date();
  const todayStr = formatDateInputValue(today);

  if (startDate && !startDate.value) startDate.value = todayStr;
  if (endDate && !endDate.value) endDate.value = todayStr;
  if (customTimeStart) customTimeStart.value = "00:00";
  if (customTimeEnd) customTimeEnd.value = "23:59";

  const setButtonActive = (activeButton) => {
    const quickBtns = document.querySelectorAll(".time-quick-btn");
    quickBtns.forEach((b) => {
      b.style.backgroundColor = "";
      b.style.color = "";
    });

    if (activeButton) {
      activeButton.style.backgroundColor = "var(--accent-color)";
      activeButton.style.color = "white";
    }
  };

  const applyRange = (startDateObj, endDateObj, activeButton = null) => {
    if (!startDate || !endDate || !startDateObj || !endDateObj) return;

    startDate.value = formatDateInputValue(startDateObj);
    endDate.value = formatDateInputValue(endDateObj);
    setButtonActive(activeButton);
    updateCurrentTimeRangeDisplay();

    currentDate = new Date(startDateObj);
    if (!["year", "month", "weekly-grid"].includes(currentView)) {
      currentView = "weekly-grid";
    }

    renderCalendarView();
  };

  // 应用按钮事件 - 更新日历视图
  if (applyBtn) {
    applyBtn.addEventListener("click", function () {
      const startDateObj = parseDateInputValue(startDate?.value);
      const endDateObj = parseDateInputValue(endDate?.value);
      if (!startDateObj || !endDateObj) {
        alert("请选择有效的开始日期和结束日期");
        return;
      }

      applyRange(startDateObj, endDateObj, null);
    });
  }

  // 重置按钮事件
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      const today = new Date();
      const todayStr = formatDateInputValue(today);

      if (startDate) startDate.value = todayStr;
      if (endDate) endDate.value = todayStr;
      if (customTimeStart) customTimeStart.value = "00:00";
      if (customTimeEnd) customTimeEnd.value = "23:59";

      currentDate = today;
      if (!["year", "month", "weekly-grid"].includes(currentView)) {
        currentView = "weekly-grid";
      }

      updateCurrentTimeRangeDisplay();
      setButtonActive(document.getElementById("today-btn"));
      renderCalendarView();
    });
  }

  // 快速按钮事件
  const quickBtns = document.querySelectorAll(".time-quick-btn");
  quickBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      if (!startDate || !endDate) return;

      const currentStart = parseDateInputValue(startDate.value) || new Date();
      const currentEnd = parseDateInputValue(endDate.value) || new Date();
      const fromToday = this.getAttribute("data-from-today") === "true";
      const today = new Date();

      const applyTodayShift = (shiftDays = 0) => {
        const baseStart = new Date(today);
        const baseEnd = new Date(today);
        baseStart.setDate(baseStart.getDate() + shiftDays);
        baseEnd.setDate(baseEnd.getDate() + shiftDays);
        applyRange(baseStart, baseEnd, this);
      };

      if (this.id === "today-btn") {
        applyTodayShift(0);
        return;
      }

      if (this.id === "today-prev-btn" || this.id === "today-next-btn") {
        const diff = this.id === "today-prev-btn" ? -1 : 1;
        applyTodayShift(diff);
        return;
      }

      if (this.id === "prev-week-btn" || this.id === "next-week-btn") {
        const diff = this.id === "prev-week-btn" ? -7 : 7;
        const weekStart = getWeekStartDate(fromToday ? today : currentStart);
        const nextWeekStart = new Date(weekStart);
        nextWeekStart.setDate(nextWeekStart.getDate() + diff);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
        applyRange(nextWeekStart, nextWeekEnd, this);
        return;
      }

      if (this.id === "prev-month-btn" || this.id === "next-month-btn") {
        const monthOffset = this.id === "prev-month-btn" ? -1 : 1;
        const baseMonth = new Date(
          (fromToday ? today : currentStart).getFullYear(),
          (fromToday ? today : currentStart).getMonth() + monthOffset,
          1,
        );
        const monthStart = new Date(
          baseMonth.getFullYear(),
          baseMonth.getMonth(),
          1,
        );
        const monthEnd = new Date(
          baseMonth.getFullYear(),
          baseMonth.getMonth() + 1,
          0,
        );
        applyRange(monthStart, monthEnd, this);
      }
    });
  });

  updateCurrentTimeRangeDisplay();
  setButtonActive(document.getElementById("today-btn"));
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

  let displayText = `显示: ${formatDateForDisplay(start)}`;
  if (start !== end) {
    displayText += ` 至 ${formatDateForDisplay(end)}`;
  }

  rangeElement.textContent = displayText;
}

// 格式化日期显示
function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return "今天";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "昨天";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "明天";
  } else {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
}

// 渲染日历视图
function ensurePlanShellStructure() {
  const container = document.getElementById("stats-container");
  if (!(container instanceof HTMLElement)) {
    return null;
  }

  if (
    planShellRefs &&
    planShellRefs.host === container &&
    planShellRefs.calendarContent?.isConnected
  ) {
    return planShellRefs;
  }

  container.innerHTML = "";

  const calendarContainer = document.createElement("div");
  calendarContainer.className = "calendar-container";
  calendarContainer.style.padding = "15px";
  calendarContainer.style.width = "100%";
  calendarContainer.style.maxWidth = "100%";
  calendarContainer.style.minWidth = "0";
  calendarContainer.style.boxSizing = "border-box";

  const calendarHeader = document.createElement("div");
  calendarHeader.className = "plan-calendar-header";
  calendarHeader.style.display = "flex";
  calendarHeader.style.justifyContent = "space-between";
  calendarHeader.style.alignItems = "center";
  calendarHeader.style.marginBottom = "20px";
  calendarHeader.style.padding = "10px 15px";
  calendarHeader.style.backgroundColor = "var(--bg-secondary)";
  calendarHeader.style.borderRadius = "10px";
  calendarHeader.style.flexWrap = "wrap";
  calendarHeader.style.gap = "12px";
  calendarHeader.style.width = "100%";
  calendarHeader.style.boxSizing = "border-box";

  const viewButtons = document.createElement("div");
  viewButtons.className = "plan-view-buttons";
  viewButtons.style.display = "flex";
  viewButtons.style.gap = "10px";
  viewButtons.style.flexWrap = "wrap";
  viewButtons.appendChild(createViewButton("周视图", "weekly-grid"));
  viewButtons.appendChild(createViewButton("月视图", "month"));
  viewButtons.appendChild(createViewButton("年视图", "year"));

  const currentDateDisplay = document.createElement("div");
  currentDateDisplay.className = "plan-current-date-display";
  currentDateDisplay.style.color = "var(--text-color)";
  currentDateDisplay.style.fontWeight = "bold";
  currentDateDisplay.style.fontSize = "18px";
  currentDateDisplay.id = "current-date-display";

  const navButtons = document.createElement("div");
  navButtons.className = "plan-nav-buttons";
  navButtons.style.display = "flex";
  navButtons.style.gap = "6px";

  const prevBtn = document.createElement("button");
  prevBtn.className = "bts";
  prevBtn.classList.add("plan-nav-arrow-btn");
  prevBtn.textContent = "<";
  prevBtn.style.margin = "0";
  prevBtn.style.padding = "8px 12px";
  prevBtn.addEventListener("click", navigateCalendar.bind(null, -1));

  const todayBtn = document.createElement("button");
  todayBtn.className = "bts";
  todayBtn.classList.add("plan-today-btn");
  todayBtn.textContent = "今天";
  todayBtn.style.margin = "0";
  todayBtn.style.padding = "8px 12px";
  todayBtn.addEventListener("click", goToToday);

  const nextBtn = document.createElement("button");
  nextBtn.className = "bts";
  nextBtn.classList.add("plan-nav-arrow-btn");
  nextBtn.textContent = ">";
  nextBtn.style.margin = "0";
  nextBtn.style.padding = "8px 12px";
  nextBtn.addEventListener("click", navigateCalendar.bind(null, 1));

  navButtons.appendChild(prevBtn);
  navButtons.appendChild(todayBtn);
  navButtons.appendChild(nextBtn);

  const dateNavGroup = document.createElement("div");
  dateNavGroup.className = "plan-date-nav-group";
  dateNavGroup.appendChild(currentDateDisplay);
  dateNavGroup.appendChild(navButtons);

  calendarHeader.appendChild(viewButtons);
  calendarHeader.appendChild(dateNavGroup);
  calendarContainer.appendChild(calendarHeader);

  const calendarContent = document.createElement("div");
  calendarContent.id = "calendar-content";
  calendarContent.className = "resizable-panel";
  calendarContent.style.resize = "none";
  calendarContent.style.overflow = "visible";
  calendarContent.style.minHeight = "auto";
  calendarContent.style.minWidth = "0";
  calendarContent.style.width = "100%";
  calendarContent.style.maxWidth = "100%";
  calendarContent.style.flex = "0 0 auto";
  calendarContent.style.display = "flex";
  calendarContent.style.flexDirection = "column";
  calendarContent.style.backgroundColor = "var(--bg-secondary)";
  calendarContent.style.borderRadius = "10px";
  calendarContent.style.padding = "15px";

  calendarContainer.appendChild(calendarContent);
  container.appendChild(calendarContainer);
  planShellRefs = {
    host: container,
    calendarContainer,
    calendarContent,
  };
  return planShellRefs;
}

function renderDeferredCalendarPlaceholder(message = "切回计划面板后再加载日历内容") {
  const shell = ensurePlanShellStructure();
  const calendarContent = shell?.calendarContent;
  if (!(calendarContent instanceof HTMLElement)) {
    return;
  }
  calendarContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📅</div>
      <h3 style="color: var(--text-color)">计划面板已延后挂载</h3>
      <p style="color: var(--muted-text-color); margin-bottom: 0;">${message}</p>
    </div>
  `;
}

function renderPlanShell(options = {}) {
  planShellRendered = true;
  ensurePlanShellStructure();
  if (options.deferCalendarMount === true) {
    planCalendarMountDeferred = true;
    updateCurrentDateDisplay();
    renderDeferredCalendarPlaceholder();
  } else {
    planCalendarMountDeferred = false;
    renderCalendarView({
      skipCoverageCheck: true,
    });
  }
  if (!todoSidebarRuntimeReady) {
    renderTodoSidebarPlaceholder({
      loading: options.todoLoading === true || !!todoSidebarRuntimePromise,
    });
  }
  bindTodoSidebarBootstrapGate();
  uiTools?.markPerfStage?.("plan-shell-ready", {
    allowRepeat: true,
    fromCache: options.fromCache === true,
    planCount: plans.length,
    periodIds: planLoadedPeriodIds.slice(),
  });
}

function renderCalendarView(options = {}) {
  const shell = ensurePlanShellStructure();
  const contentElement = shell?.calendarContent;
  if (!(contentElement instanceof HTMLElement)) return;
  planCalendarMountDeferred = false;
  if (!options?.skipCoverageCheck && ensurePlansLoadedForCurrentView()) return;

  // 更新日期显示并渲染日历内容
  updateCurrentDateDisplay();
  renderCalendarContent();
  bindAddPlanInlineButton();
  bindPlannerMobileSwipe();
  syncPlannerPanelFromHash("auto");
}

function setCalendarView(viewType, options = {}) {
  const { nextDate = null, rerender = true } = options;

  if (nextDate instanceof Date && !Number.isNaN(nextDate.getTime())) {
    currentDate = new Date(nextDate);
  }

  currentView = ["year", "month", "weekly-grid"].includes(viewType)
    ? viewType
    : "weekly-grid";
  saveViewState();

  document.querySelectorAll("[data-view]").forEach((button) => {
    uiTools?.setAccentButtonState(button, button.dataset.view === currentView);
  });

  if (rerender) {
    renderCalendarContent();
    updateCurrentDateDisplay();
  }
}

// 创建视图按钮
function createViewButton(text, viewType) {
  const btn = document.createElement("button");
  btn.className = "bts";
  btn.textContent = text;
  btn.dataset.view = viewType;
  btn.style.padding = "8px 15px";

  // 设置当前视图按钮的激活状态
  if (viewType === currentView) {
    uiTools?.setAccentButtonState(btn, true);
  }

  btn.addEventListener("click", function () {
    setCalendarView(viewType);
  });

  return btn;
}

// 更新当前日期显示
function updateCurrentDateDisplay() {
  const displayElement = document.getElementById("current-date-display");
  if (!displayElement) return;

  if (currentView === "year") {
    displayElement.textContent = `${currentDate.getFullYear()}年`;
  } else if (currentView === "month") {
    displayElement.textContent = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
  } else if (currentView === "weekly-grid") {
    const weekStart = getWeekStartDate(currentDate);
    const weekEnd = getWeekEndDate(currentDate);
    displayElement.textContent = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
  }
}

// 渲染日历内容
function renderCalendarContent() {
  const contentElement = document.getElementById("calendar-content");
  if (!contentElement) return;

  contentElement.innerHTML = "";
  contentElement.style.overflow = "visible";
  contentElement.style.height = "auto";

  switch (currentView) {
    case "year":
      renderYearView(contentElement);
      break;
    case "month":
      renderMonthView(contentElement);
      break;
    case "weekly-grid":
      renderWeeklyGridView(contentElement);
      break;
    default:
      currentView = "weekly-grid";
      renderWeeklyGridView(contentElement);
      break;
  }
}

function normalizeYearGoalScope(scope) {
  if (scope === "annual") {
    return "annual";
  }

  const month = parseInt(scope, 10);
  if (month >= 1 && month <= 12) {
    return String(month);
  }
  return "";
}

function normalizeYearlyGoalsState(rawYearlyGoals) {
  const source =
    rawYearlyGoals && typeof rawYearlyGoals === "object" && !Array.isArray(rawYearlyGoals)
      ? rawYearlyGoals
      : {};
  const normalized = {};

  Object.entries(source).forEach(([yearKey, yearBucket]) => {
    const safeYearKey = String(yearKey || "").trim();
    if (!safeYearKey) {
      return;
    }

    const safeBucket =
      yearBucket && typeof yearBucket === "object" && !Array.isArray(yearBucket)
        ? yearBucket
        : {};
    const nextBucket = {};

    if (Array.isArray(safeBucket.annual)) {
      nextBucket.annual = safeBucket.annual.map((goal) => normalizeYearGoal(goal));
    }

    for (let month = 1; month <= 12; month += 1) {
      const monthKey = String(month);
      if (!Array.isArray(safeBucket[monthKey])) {
        continue;
      }
      nextBucket[monthKey] = safeBucket[monthKey].map((goal) =>
        normalizeYearGoal(goal),
      );
    }

    normalized[safeYearKey] = nextBucket;
  });

  return normalized;
}

function ensureYearGoalBucket(year, scope = "annual") {
  const yearKey = String(year);
  const scopeKey = normalizeYearGoalScope(scope);
  if (!scopeKey) {
    return [];
  }
  if (!yearlyGoals[yearKey]) {
    yearlyGoals[yearKey] = {};
  }
  const yearBucket =
    yearlyGoals[yearKey] &&
    typeof yearlyGoals[yearKey] === "object" &&
    !Array.isArray(yearlyGoals[yearKey])
      ? yearlyGoals[yearKey]
      : {};
  yearlyGoals[yearKey] = yearBucket;
  if (!Array.isArray(yearBucket[scopeKey])) {
    yearBucket[scopeKey] = [];
  }
  yearBucket[scopeKey] = yearBucket[scopeKey].map((goal) => normalizeYearGoal(goal));
  return yearBucket[scopeKey];
}

function getYearGoalScopeTitle(year, scope = "annual") {
  return scope === "annual" ? `${year}年年度总目标` : `${year}年${scope}月目标`;
}

function getYearGoalScopeDisplayName(scope = "annual") {
  return scope === "annual" ? "年度总目标" : `${scope}月`;
}

function getYearGoalScopeEmptyText(scope = "annual") {
  return scope === "annual"
    ? "点击卡片添加年度总目标"
    : "点击卡片添加本月目标";
}

function getYearGoalScopeDescriptionPlaceholder(scope = "annual") {
  return scope === "annual"
    ? "输入年度总目标的详细描述..."
    : "输入本月目标的详细描述...";
}

function getYearGoalDeletePrompt(scope = "annual") {
  return scope === "annual"
    ? "确定删除这个年度目标吗？"
    : "确定删除这个月目标吗？";
}

function getYearGoalDeleteTitle(scope = "annual") {
  return scope === "annual" ? "删除年度目标" : "删除月目标";
}

function normalizeYearGoal(goal) {
  if (!goal || typeof goal !== "object") {
    return {
      id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      title: "未命名目标",
      description: "",
      priority: "medium",
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
  }

  const rawTitle = goal.title || goal.text || "";
  const rawDescription =
    goal.description ||
    (!goal.description && goal.text && goal.title ? goal.text : "");
  const priority = ["low", "medium", "high"].includes(goal.priority)
    ? goal.priority
    : "medium";

  return {
    id: goal.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    title: rawTitle || "未命名目标",
    description: rawDescription || "",
    priority,
    isCompleted: !!goal.isCompleted,
    createdAt: goal.createdAt || new Date().toISOString(),
  };
}

function saveYearGoalEntry(year, scope, goalData, goalId = null) {
  const goals = ensureYearGoalBucket(year, scope);
  const targetIndex = goalId
    ? goals.findIndex((item) => matchesId(item.id, goalId))
    : -1;
  const existingGoal = targetIndex !== -1 ? normalizeYearGoal(goals[targetIndex]) : null;
  const normalizedGoal = normalizeYearGoal({
    ...existingGoal,
    ...goalData,
    id: goalId || goalData.id || existingGoal?.id,
  });

  if (targetIndex !== -1) {
    goals[targetIndex] = normalizedGoal;
  } else {
    goals.push(normalizedGoal);
  }

  saveYearlyGoals();
  return normalizedGoal;
}

function deleteYearGoalEntry(year, scope, goalId) {
  const goals = ensureYearGoalBucket(year, scope);
  const targetIndex = goals.findIndex((item) => matchesId(item.id, goalId));
  if (targetIndex === -1) {
    return false;
  }

  goals.splice(targetIndex, 1);
  saveYearlyGoals();
  return true;
}

function getGoalPriorityLabel(priority) {
  switch (priority) {
    case "high":
      return { text: "高优先级", shortText: "高", color: "#f56565" };
    case "low":
      return { text: "低优先级", shortText: "低", color: "#48bb78" };
    default:
      return { text: "中优先级", shortText: "中", color: "#ed8936" };
  }
}

function setYearGoalEntryCompletion(year, scope, goalId, nextCompleted = false) {
  const goals = ensureYearGoalBucket(year, scope);
  const targetIndex = goals.findIndex((item) => matchesId(item.id, goalId));
  if (targetIndex === -1) {
    return false;
  }
  goals[targetIndex] = normalizeYearGoal({
    ...goals[targetIndex],
    isCompleted: !!nextCompleted,
  });
  saveYearlyGoals();
  return true;
}

function runWithYearGoalModalSuppressed(callback) {
  suppressYearGoalModalOpen = true;
  try {
    callback();
  } finally {
    window.setTimeout(() => {
      suppressYearGoalModalOpen = false;
    }, 0);
  }
}

function createYearGoalCard({
  year,
  scope,
  label,
  goals,
  monthCardScale,
  minCardHeight,
  isMobileYearView,
  cardPadding,
  cardGap,
  titleFontSize,
  actionFontSize,
  badgeFontSize,
}) {
  const card = document.createElement("div");
  card.style.minHeight = `${Math.max(
    minCardHeight,
    Math.round((isMobileYearView ? 188 : 154) * monthCardScale),
  )}px`;
  card.style.borderRadius = `${Math.max(12, Math.round(16 * monthCardScale))}px`;
  card.style.padding = `${cardPadding}px`;
  card.style.backgroundColor = "var(--bg-tertiary)";
  card.style.border = "1px solid var(--panel-border-color)";
  card.style.cursor = "pointer";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = `${cardGap}px`;
  card.style.height = "auto";
  card.dataset.scope = String(scope);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.gap = `${Math.max(6, Math.round(10 * monthCardScale))}px`;

  const title = document.createElement("strong");
  title.textContent = label;
  title.style.color = "var(--text-color)";
  title.style.fontSize = `${titleFontSize}px`;
  header.appendChild(title);

  const addBtn = document.createElement("button");
  addBtn.className = "bts";
  addBtn.textContent = "添加目标";
  addBtn.style.margin = "0";
  addBtn.style.padding = `${Math.max(4, Math.round(6 * monthCardScale))}px ${Math.max(
    8,
    Math.round(10 * monthCardScale),
  )}px`;
  addBtn.style.fontSize = `${actionFontSize}px`;
  addBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    showYearGoalModal(year, scope);
  });
  header.appendChild(addBtn);

  card.appendChild(header);

  const goalList = document.createElement("div");
  goalList.style.display = "flex";
  goalList.style.flexDirection = "column";
  goalList.style.gap = `${Math.max(4, Math.round(8 * monthCardScale))}px`;
  goalList.style.maxHeight = "none";
  goalList.style.minHeight = "0";
  goalList.style.flex = "1 1 auto";
  goalList.style.overflow = "visible";

  if (goals.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = getYearGoalScopeEmptyText(scope);
    empty.style.fontSize = `${Math.max(10, Math.round(13 * monthCardScale))}px`;
    empty.style.opacity = "0.75";
    empty.style.color = "var(--text-color)";
    empty.style.display = "flex";
    empty.style.alignItems = "center";
    empty.style.justifyContent = "center";
    empty.style.flex = "1";
    empty.style.textAlign = "center";
    empty.style.border =
      "1px dashed color-mix(in srgb, var(--panel-border-color) 75%, transparent)";
    empty.style.borderRadius = `${Math.max(10, Math.round(14 * monthCardScale))}px`;
    empty.style.padding = `${Math.max(6, Math.round(10 * monthCardScale))}px`;
    goalList.appendChild(empty);
  } else {
    goals.forEach((goal) => {
      const normalizedGoal = normalizeYearGoal(goal);
      const priorityMeta = getGoalPriorityLabel(normalizedGoal.priority);
      const goalCompleted = !!normalizedGoal.isCompleted;
      const goalItem = document.createElement("div");
      goalItem.className = "controler-pressable plan-year-goal-item";
      if (goalCompleted) {
        goalItem.classList.add("plan-year-goal-item-completed");
      }
      goalItem.style.display = "flex";
      goalItem.style.alignItems = "center";
      goalItem.style.justifyContent = "space-between";
      goalItem.style.gap = `${Math.max(6, Math.round(10 * monthCardScale))}px`;
      goalItem.style.padding = `${Math.max(5, Math.round(8 * monthCardScale))}px ${Math.max(
        10,
        Math.round(12 * monthCardScale),
      )}px`;
      goalItem.style.borderRadius = `${Math.max(14, Math.round(18 * monthCardScale))}px`;
      goalItem.style.backgroundColor = goalCompleted
        ? "color-mix(in srgb, var(--bg-secondary) 90%, rgba(var(--accent-color-rgb), 0.12) 10%)"
        : "color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-quaternary) 12%)";
      goalItem.style.border =
        goalCompleted
          ? "1px solid color-mix(in srgb, rgba(var(--accent-color-rgb), 0.38) 72%, var(--panel-border-color) 28%)"
          : "1px solid color-mix(in srgb, var(--panel-border-color) 75%, transparent)";
      goalItem.style.color = "var(--text-color)";
      goalItem.style.fontSize = `${Math.max(10, Math.round(12 * monthCardScale))}px`;
      goalItem.style.cursor = "pointer";
      goalItem.title = normalizedGoal.description || normalizedGoal.title;

      const goalTextWrap = document.createElement("div");
      goalTextWrap.style.display = "flex";
      goalTextWrap.style.alignItems = "center";
      goalTextWrap.style.flex = "1 1 auto";
      goalTextWrap.style.minWidth = "0";

      const goalTitle = document.createElement("strong");
      goalTitle.textContent = normalizedGoal.title;
      goalTitle.style.color = "var(--text-color)";
      goalTitle.style.fontSize = `${Math.max(10, Math.round(12 * monthCardScale))}px`;
      goalTitle.style.flex = "1";
      goalTitle.style.minWidth = "0";
      goalTitle.style.overflow = "hidden";
      goalTitle.style.textOverflow = "ellipsis";
      goalTitle.style.whiteSpace = "nowrap";
      goalTitle.style.opacity = goalCompleted ? "0.74" : "1";
      goalTitle.style.textDecoration = goalCompleted ? "line-through" : "none";
      goalTextWrap.appendChild(goalTitle);

      const goalMeta = document.createElement("div");
      goalMeta.style.display = "flex";
      goalMeta.style.alignItems = "center";
      goalMeta.style.justifyContent = "flex-end";
      goalMeta.style.gap = `${Math.max(4, Math.round(6 * monthCardScale))}px`;
      goalMeta.style.flex = "0 0 auto";
      goalMeta.style.minWidth = "0";

      const priorityBadge = document.createElement("span");
      priorityBadge.textContent =
        isMobileYearView ? priorityMeta.shortText : priorityMeta.text;
      priorityBadge.style.fontSize = `${Math.max(
        8,
        badgeFontSize - (isMobileYearView ? 1 : 0),
      )}px`;
      priorityBadge.style.padding = `${Math.max(2, Math.round(3 * monthCardScale))}px ${Math.max(
        5,
        Math.round((isMobileYearView ? 6.5 : 8) * monthCardScale),
      )}px`;
      priorityBadge.style.borderRadius = "999px";
      priorityBadge.style.backgroundColor = priorityMeta.color;
      priorityBadge.style.color = "white";
      priorityBadge.style.flexShrink = "0";
      priorityBadge.style.maxWidth = isMobileYearView ? "32px" : "none";
      priorityBadge.style.lineHeight = "1.15";
      priorityBadge.style.textAlign = "center";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "plan-complete-toggle";
      if (goalCompleted) {
        toggleButton.classList.add("is-completed");
      }
      const toggleSize = Math.max(22, Math.round((isMobileYearView ? 26 : 28) * monthCardScale));
      toggleButton.style.width = `${toggleSize}px`;
      toggleButton.style.height = `${toggleSize}px`;
      toggleButton.style.minWidth = `${toggleSize}px`;
      toggleButton.style.minHeight = `${toggleSize}px`;
      toggleButton.style.backgroundColor = goalCompleted
        ? "color-mix(in srgb, var(--accent-color) 82%, white 18%)"
        : "color-mix(in srgb, var(--bg-secondary) 70%, var(--bg-quaternary) 30%)";
      toggleButton.style.color = goalCompleted ? "var(--on-accent-text)" : "transparent";
      toggleButton.style.fontSize = `${Math.max(11, Math.round(14 * monthCardScale))}px`;
      toggleButton.style.fontWeight = "700";
      toggleButton.setAttribute(
        "aria-label",
        goalCompleted ? "标记目标为未完成" : "标记目标为已完成",
      );
      toggleButton.title = goalCompleted ? "标记为未完成" : "标记为已完成";
      toggleButton.textContent = goalCompleted ? "✓" : "";
      toggleButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const changed = setYearGoalEntryCompletion(
          year,
          scope,
          normalizedGoal.id,
          !goalCompleted,
        );
        if (changed) {
          renderCalendarContent();
        }
      });

      goalMeta.appendChild(priorityBadge);
      goalMeta.appendChild(toggleButton);
      goalItem.appendChild(goalTextWrap);
      goalItem.appendChild(goalMeta);
      goalItem.addEventListener("click", (event) => {
        event.stopPropagation();
        if (suppressYearGoalModalOpen) return;
        showYearGoalModal(year, scope, normalizedGoal.id);
      });
      goalList.appendChild(goalItem);
    });
  }

  card.classList.add("controler-pressable");
  card.appendChild(goalList);
  card.addEventListener("click", () => {
    if (suppressYearGoalModalOpen) return;
    showYearGoalModal(year, scope);
  });
  return card;
}

function renderYearView(container) {
  const year = currentDate.getFullYear();
  const isMobileYearView = isCompactMobileLayout();
  const scale = Math.min(
    Math.max(getTableScaleSetting("planYearView", 1), 0.1),
    2.2,
  );
  const monthCardScale = isMobileYearView
    ? Math.max(scale * PLAN_YEAR_VIEW_CARD_SHRINK_RATIO, 0.1)
    : Math.max(scale * 0.76, 0.1);
  const minCardWidth = isMobileYearView ? 140 : 156;
  const minCardHeight = isMobileYearView ? 108 : 124;
  const baseCardWidth = isMobileYearView ? 260 : 186;
  const cardMinWidth = Math.max(minCardWidth, Math.round(baseCardWidth * monthCardScale));
  const cardPadding = Math.max(8, Math.round(14 * monthCardScale));
  const cardGap = Math.max(6, Math.round(10 * monthCardScale));
  const titleFontSize = Math.max(13, Math.round(18 * monthCardScale));
  const actionFontSize = Math.max(10, Math.round(12 * monthCardScale));
  const badgeFontSize = Math.max(9, Math.round(11 * monthCardScale));
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

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.width = "100%";
  grid.style.gridTemplateColumns = isMobileYearView
    ? `repeat(auto-fit, minmax(min(100%, ${cardMinWidth}px), 1fr))`
    : `repeat(auto-fit, minmax(${cardMinWidth}px, 1fr))`;
  grid.style.gap = `${Math.max(8, Math.round(14 * monthCardScale))}px`;
  grid.style.alignItems = "stretch";
  grid.style.margin = "0 auto";

  const cardBaseOptions = {
    year,
    monthCardScale,
    minCardHeight,
    isMobileYearView,
    cardPadding,
    cardGap,
    titleFontSize,
    actionFontSize,
    badgeFontSize,
  };

  grid.appendChild(
    createYearGoalCard({
      ...cardBaseOptions,
      scope: "annual",
      label: "年度总目标",
      goals: ensureYearGoalBucket(year, "annual"),
    }),
  );

  for (let month = 1; month <= 12; month += 1) {
    grid.appendChild(
      createYearGoalCard({
        ...cardBaseOptions,
        scope: month,
        label: monthNames[month - 1],
        goals: ensureYearGoalBucket(year, month),
      }),
    );
  }

  container.appendChild(grid);
}

function showYearGoalModal(year, scope = "annual", goalId = null) {
  const normalizedScope = normalizeYearGoalScope(scope);
  if (!normalizedScope) {
    return;
  }
  const goals = ensureYearGoalBucket(year, normalizedScope);
  const editingGoalRaw =
    goals.find((item) => matchesId(item.id, goalId)) || null;
  const editingGoal = editingGoalRaw ? normalizeYearGoal(editingGoalRaw) : null;
  const isEditMode = !!editingGoal;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "2100";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.backgroundColor = "var(--overlay-bg)";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 22px; border-radius: 15px; max-width: 480px; width: 90%;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 12px;">
        ${getYearGoalScopeTitle(year, normalizedScope)}
      </h2>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">目标名称</label>
          <input id="year-goal-title-input" type="text" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 14px;
          " placeholder="例如：完成季度复盘">
        </div>
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">优先级</label>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:5px; color:var(--text-color); font-size:13px;">
              <input type="radio" name="year-goal-priority" value="high" ${editingGoal?.priority === "high" ? "checked" : ""}>
              高
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:var(--text-color); font-size:13px;">
              <input type="radio" name="year-goal-priority" value="medium" ${!editingGoal || editingGoal?.priority === "medium" ? "checked" : ""}>
              中
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:var(--text-color); font-size:13px;">
              <input type="radio" name="year-goal-priority" value="low" ${editingGoal?.priority === "low" ? "checked" : ""}>
              低
            </label>
          </div>
        </div>
        <div>
          <label style="display:block; color:var(--text-color); margin-bottom:5px; font-size:13px;">详细描述</label>
          <textarea id="year-goal-description-input" style="
        width: 100%;
        min-height: 120px;
        resize: vertical;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--bg-tertiary);
        background-color: var(--bg-quaternary);
        color: var(--text-color);
        font-size: 14px;
      " placeholder="${getYearGoalScopeDescriptionPlaceholder(normalizedScope)}"></textarea>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 16px;">
        ${
          isEditMode
            ? '<button type="button" class="bts" id="delete-year-goal-btn" style="background-color: var(--delete-btn); margin: 0;">删除目标</button>'
            : "<span></span>"
        }
        <div style="display: flex; gap: 8px;">
          <button type="button" class="bts" id="cancel-year-goal-btn" style="margin: 0;">取消</button>
          <button type="button" class="bts" id="save-year-goal-btn" style="margin: 0;">保存</button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    if (modal.parentNode) {
      document.body.removeChild(modal);
    }
  };

  const closeModalSafely = () => {
    runWithYearGoalModalSuppressed(() => {
      closeModal();
    });
  };

  preparePlanModalOverlay(modal, {
    close: closeModalSafely,
    zIndex: 2100,
  });

  const yearGoalTitleInput = modal.querySelector("#year-goal-title-input");
  const yearGoalDescriptionInput = modal.querySelector(
    "#year-goal-description-input",
  );
  if (yearGoalTitleInput) {
    yearGoalTitleInput.value = editingGoal?.title || "";
  }
  if (yearGoalDescriptionInput) {
    yearGoalDescriptionInput.value = editingGoal?.description || "";
  }

  const saveYearGoalAction = () => {
    const title = modal.querySelector("#year-goal-title-input").value.trim();
    const description = modal
      .querySelector("#year-goal-description-input")
      .value.trim();
    const priority =
      modal.querySelector('input[name="year-goal-priority"]:checked')?.value ||
      "medium";
    if (!title) {
      alert("请输入目标名称");
      return;
    }

    saveYearGoalEntry(
      year,
      normalizedScope,
      {
        title,
        description,
        priority,
        createdAt: editingGoal?.createdAt || new Date().toISOString(),
      },
      editingGoal?.id || null,
    );
    runWithYearGoalModalSuppressed(() => {
      closeModal();
      renderCalendarContent();
    });
  };

  const deleteBtn = modal.querySelector("#delete-year-goal-btn");
  const deleteYearGoalAction = async () => {
    if (deleteBtn) {
      const confirmed = await requestPlanConfirmation(
        getYearGoalDeletePrompt(normalizedScope),
        {
          title: getYearGoalDeleteTitle(normalizedScope),
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) return;
      const deleted = deleteYearGoalEntry(
        year,
        normalizedScope,
        editingGoal?.id || goalId,
      );
      if (!deleted) {
        await showPlanAlert("删除失败：未找到该目标，请刷新后重试。", {
          title: "删除失败",
          danger: true,
        });
        return;
      }
      runWithYearGoalModalSuppressed(() => {
        closeModal();
        renderCalendarContent();
      });
    }
  };

  if (uiTools?.bindModalAction) {
    uiTools.bindModalAction(modal, "#cancel-year-goal-btn", closeModalSafely);
    uiTools.bindModalAction(modal, "#save-year-goal-btn", saveYearGoalAction);
    if (deleteBtn) {
      uiTools.bindModalAction(
        modal,
        "#delete-year-goal-btn",
        deleteYearGoalAction,
      );
    }
  } else {
    modal
      .querySelector("#cancel-year-goal-btn")
      .addEventListener("click", closeModalSafely);
    modal
      .querySelector("#save-year-goal-btn")
      .addEventListener("click", saveYearGoalAction);
    deleteBtn?.addEventListener("click", deleteYearGoalAction);
  }

  modal.addEventListener("click", function (event) {
    if (event.target === this) {
      closeModalSafely();
    }
  });
}

// 渲染月视图
function renderMonthView(container) {
  const scale = Math.min(
    Math.max(getTableScaleSetting("planMonthView", 1), 0.1),
    2.2,
  );
  const monthShell = document.createElement("div");
  monthShell.style.width = "100%";
  monthShell.style.margin = "0";
  monthShell.style.maxWidth = "100%";
  monthShell.style.minWidth = "0";
  monthShell.style.boxSizing = "border-box";

  // 获取当月第一天和最后一天
  const firstDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  );
  const lastDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  );

  // 获取当月第一天是星期几（0=周日，1=周一，...，6=周六）
  const firstDayOfWeek = firstDay.getDay();

  // 创建星期标题
  const weekdaysContainer = document.createElement("div");
  weekdaysContainer.style.display = "grid";
  weekdaysContainer.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
  weekdaysContainer.style.gap = `${Math.max(3, Math.round(5 * scale))}px`;
  weekdaysContainer.style.marginBottom = `${Math.max(8, Math.round(10 * scale))}px`;
  weekdaysContainer.style.width = "100%";
  weekdaysContainer.style.minWidth = "0";
  weekdaysContainer.style.boxSizing = "border-box";

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  weekdays.forEach((day) => {
    const dayElement = document.createElement("div");
    dayElement.textContent = day;
    dayElement.style.textAlign = "center";
    dayElement.style.padding = `${Math.max(7, Math.round(10 * scale))}px`;
    dayElement.style.color = "var(--text-color)";
    dayElement.style.fontWeight = "bold";
    dayElement.style.fontSize = `${Math.max(11, Math.round(14 * scale))}px`;
    dayElement.style.backgroundColor = "var(--bg-tertiary)";
    dayElement.style.borderRadius = "5px";
    weekdaysContainer.appendChild(dayElement);
  });

  monthShell.appendChild(weekdaysContainer);

  // 创建日期网格
  const daysContainer = document.createElement("div");
  daysContainer.style.display = "grid";
  daysContainer.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
  daysContainer.style.gap = `${Math.max(3, Math.round(5 * scale))}px`;
  daysContainer.style.width = "100%";
  daysContainer.style.minWidth = "0";
  daysContainer.style.boxSizing = "border-box";

  // 计算需要显示的日期范围（可能包括上个月和下个月的部分日期）
  const totalDays = 42; // 6行 * 7天

  // 计算网格起始日期（可能是上个月的日期）
  const startDate = new Date(firstDay);
  startDate.setDate(1 - firstDayOfWeek);

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const dayElement = createDayElement(date, scale);
    daysContainer.appendChild(dayElement);
  }

  monthShell.appendChild(daysContainer);
  container.appendChild(monthShell);
}

// 渲染周视图
function renderWeekView(container) {
  // 获取周开始日期（周一）
  const weekStart = getWeekStartDate(currentDate);

  // 创建时间轴容器
  const timelineContainer = document.createElement("div");
  timelineContainer.style.display = "flex";
  timelineContainer.style.height = "600px";
  timelineContainer.style.overflowY = "auto";

  // 时间列
  const timeColumn = document.createElement("div");
  timeColumn.style.width = "60px";
  timeColumn.style.flexShrink = "0";

  // 时间刻度
  for (let hour = 0; hour < 24; hour++) {
    const timeSlot = document.createElement("div");
    timeSlot.style.height = "50px";
    timeSlot.style.borderBottom = "1px solid var(--bg-tertiary)";
    timeSlot.style.display = "flex";
    timeSlot.style.alignItems = "center";
    timeSlot.style.justifyContent = "center";
    timeSlot.style.color = "var(--text-color)";
    timeSlot.style.fontSize = "12px";
    timeSlot.textContent = `${hour.toString().padStart(2, "0")}:00`;
    timeColumn.appendChild(timeSlot);
  }

  timelineContainer.appendChild(timeColumn);

  // 星期列
  const daysContainer = document.createElement("div");
  daysContainer.style.display = "grid";
  daysContainer.style.gridTemplateColumns = "repeat(7, 1fr)";
  daysContainer.style.flex = "1";
  daysContainer.style.gap = "1px";

  // 创建每天的时间轴
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);

    const dayColumn = createDayTimeline(date);
    daysContainer.appendChild(dayColumn);
  }

  timelineContainer.appendChild(daysContainer);
  container.appendChild(timelineContainer);
}

// 渲染日视图
function renderDayView(container) {
  // 创建时间轴容器
  const timelineContainer = document.createElement("div");
  timelineContainer.style.display = "flex";
  timelineContainer.style.height = "700px";
  timelineContainer.style.overflowY = "auto";

  // 时间列
  const timeColumn = document.createElement("div");
  timeColumn.style.width = "60px";
  timeColumn.style.flexShrink = "0";

  // 时间刻度
  for (let hour = 0; hour < 24; hour++) {
    const timeSlot = document.createElement("div");
    timeSlot.style.height = "60px";
    timeSlot.style.borderBottom = "1px solid var(--bg-tertiary)";
    timeSlot.style.display = "flex";
    timeSlot.style.alignItems = "center";
    timeSlot.style.justifyContent = "center";
    timeSlot.style.color = "var(--text-color)";
    timeSlot.style.fontSize = "12px";
    timeSlot.textContent = `${hour.toString().padStart(2, "0")}:00`;
    timeColumn.appendChild(timeSlot);
  }

  timelineContainer.appendChild(timeColumn);

  // 当天时间轴
  const dayColumn = createDayTimeline(currentDate);
  dayColumn.style.flex = "1";

  timelineContainer.appendChild(dayColumn);
  container.appendChild(timelineContainer);
}

// 创建日期元素
function createDayElement(date, scale = 1) {
  const dayElement = document.createElement("div");
  dayElement.className = "calendar-day";
  const occurrenceDate =
    normalizePlanDateKey(date) || date.toISOString().split("T")[0];
  dayElement.dataset.date = occurrenceDate;
  const safeScale = Math.min(Math.max(scale, 0.1), 2.2);
  const dayPadding = Math.max(6, Math.round(8 * safeScale));
  const dayMinHeight = Math.max(82, Math.round(100 * safeScale));
  const dateFontSize = Math.max(13, Math.round(16 * safeScale));
  const planFontSize = Math.max(9, Math.round(10 * safeScale));
  const planPaddingY = Math.max(2, Math.round(2 * safeScale));
  const planPaddingX = Math.max(4, Math.round(4 * safeScale));
  const planGap = Math.max(2, Math.round(2 * safeScale));

  // 设置样式
  dayElement.style.minHeight = `${dayMinHeight}px`;
  dayElement.style.width = "100%";
  dayElement.style.minWidth = "0";
  dayElement.style.boxSizing = "border-box";
  dayElement.style.display = "flex";
  dayElement.style.flexDirection = "column";
  dayElement.style.overflow = "hidden";
  dayElement.style.padding = `${dayPadding}px`;
  dayElement.style.borderRadius = "8px";
  dayElement.style.cursor = "pointer";
  dayElement.style.transition = "all 0.2s ease";

  // 判断日期类型
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const isCurrentMonth = date.getMonth() === currentDate.getMonth();

  if (isToday) {
    dayElement.style.backgroundColor = "var(--accent-color)";
    dayElement.style.color = "white";
  } else if (isCurrentMonth) {
    dayElement.style.backgroundColor = "var(--bg-tertiary)";
    dayElement.style.color = "var(--text-color)";
  } else {
    dayElement.style.backgroundColor = "var(--bg-secondary)";
    dayElement.style.color = "rgba(255,255,255,0.5)";
  }

  // 日期数字
  const dateNumber = document.createElement("div");
  dateNumber.textContent = date.getDate();
  dateNumber.style.fontSize = `${dateFontSize}px`;
  dateNumber.style.fontWeight = "bold";
  dateNumber.style.marginBottom = `${Math.max(4, Math.round(5 * safeScale))}px`;
  dayElement.appendChild(dateNumber);

  // 添加点击事件（切换到周视图）
  dayElement.addEventListener("click", function (event) {
    if (
      event?.target instanceof Element &&
      event.target.closest(
        "[data-plan-detail-trigger='true'], [data-plan-more-trigger='true']",
      )
    ) {
      return;
    }
    setCalendarView("weekly-grid", { nextDate: date });
  });

  // 显示该日期的计划
  const dayPlans = getPlansForDate(date);
  if (dayPlans.length > 0) {
    const plansContainer = document.createElement("div");
    plansContainer.style.display = "flex";
    plansContainer.style.flexDirection = "column";
    plansContainer.style.gap = `${planGap}px`;
    plansContainer.style.width = "100%";
    plansContainer.style.minWidth = "0";

    // 只显示前3个计划
    dayPlans.slice(0, 3).forEach((plan) => {
      const planCompleted = getPlanCompletionState(plan, occurrenceDate);
      const planIndicator = document.createElement("div");
      planIndicator.className = "controler-pressable";
      planIndicator.dataset.planDetailTrigger = "true";
      planIndicator.setAttribute("role", "button");
      planIndicator.tabIndex = 0;
      planIndicator.textContent =
        plan.name.length > 8 ? plan.name.substring(0, 8) + "..." : plan.name;
      planIndicator.style.backgroundColor = planCompleted
        ? `color-mix(in srgb, ${plan.color} 36%, var(--bg-secondary) 64%)`
        : plan.color;
      planIndicator.style.color = "white";
      planIndicator.style.padding = `${planPaddingY}px ${planPaddingX}px`;
      planIndicator.style.borderRadius = "3px";
      planIndicator.style.fontSize = `${planFontSize}px`;
      planIndicator.style.maxWidth = "100%";
      planIndicator.style.overflow = "hidden";
      planIndicator.style.whiteSpace = "nowrap";
      planIndicator.style.textOverflow = "ellipsis";
      planIndicator.style.cursor = "pointer";
      planIndicator.style.border = planCompleted
        ? "1px dashed rgba(255,255,255,0.45)"
        : "1px solid transparent";
      planIndicator.style.opacity = planCompleted ? "0.84" : "1";
      planIndicator.style.textDecoration = planCompleted ? "line-through" : "none";
      planIndicator.title = `${plan.name} ${plan.startTime}-${plan.endTime}`;

      planIndicator.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        showPlanDetailModal(plan, occurrenceDate);
      });
      const stopMonthPlanEvent = (event) => {
        event.stopPropagation();
      };
      planIndicator.addEventListener("pointerdown", stopMonthPlanEvent);
      planIndicator.addEventListener("mousedown", stopMonthPlanEvent);
      planIndicator.addEventListener("touchstart", stopMonthPlanEvent, {
        passive: true,
      });
      planIndicator.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        showPlanDetailModal(plan, occurrenceDate);
      });

      plansContainer.appendChild(planIndicator);
    });

    // 如果还有更多计划，显示计数
    if (dayPlans.length > 3) {
      const moreIndicator = document.createElement("div");
      moreIndicator.dataset.planMoreTrigger = "true";
      moreIndicator.textContent = `+${dayPlans.length - 3} 更多`;
      moreIndicator.style.color = "var(--accent-color)";
      moreIndicator.style.fontSize = `${planFontSize}px`;
      moreIndicator.style.padding = `${planPaddingY}px ${planPaddingX}px`;
      moreIndicator.style.textAlign = "center";
      moreIndicator.style.cursor = "pointer";

      moreIndicator.addEventListener("click", function (e) {
        e.stopPropagation();
        setCalendarView("weekly-grid", { nextDate: date });
      });

      plansContainer.appendChild(moreIndicator);
    }

    dayElement.appendChild(plansContainer);
  }

  // 悬停效果
  dayElement.addEventListener("mouseenter", function () {
    this.style.transform = "scale(1.02)";
    this.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  });

  dayElement.addEventListener("mouseleave", function () {
    this.style.transform = "scale(1)";
    this.style.boxShadow = "none";
  });

  return dayElement;
}

// 创建天时间轴
function createDayTimeline(date) {
  const dayColumn = document.createElement("div");
  dayColumn.className = "day-timeline";
  dayColumn.dataset.date = date.toISOString().split("T")[0];

  // 日期标题
  const dateHeader = document.createElement("div");
  dateHeader.style.textAlign = "center";
  dateHeader.style.padding = "10px";
  dateHeader.style.backgroundColor = "var(--bg-tertiary)";
  dateHeader.style.borderRadius = "5px 5px 0 0";
  dateHeader.style.color = "var(--text-color)";
  dateHeader.style.fontWeight = "bold";

  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    dateHeader.textContent = "今天";
    dateHeader.style.backgroundColor = "var(--accent-color)";
    dateHeader.style.color = "white";
  } else {
    const weekdayNames = [
      "周日",
      "周一",
      "周二",
      "周三",
      "周四",
      "周五",
      "周六",
    ];
    dateHeader.textContent = `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayNames[date.getDay()]}`;
  }

  dayColumn.appendChild(dateHeader);

  // 时间轴容器
  const timeline = document.createElement("div");
  timeline.style.position = "relative";
  timeline.style.height = "1200px"; // 24小时 * 50px

  // 时间刻度背景
  for (let hour = 0; hour < 24; hour++) {
    const hourSlot = document.createElement("div");
    hourSlot.style.height = "50px";
    hourSlot.style.borderBottom = "1px solid var(--bg-tertiary)";
    hourSlot.style.boxSizing = "border-box";
    timeline.appendChild(hourSlot);
  }

  // 添加该日期的计划
  const dayPlans = getPlansForDate(date);
  dayPlans.forEach((plan) => {
    const planBlock = createPlanTimelineBlock(
      plan,
      date.toISOString().split("T")[0],
    );
    timeline.appendChild(planBlock);
  });

  dayColumn.appendChild(timeline);

  // 添加双击事件创建新计划
  timeline.addEventListener("dblclick", function (e) {
    const rect = timeline.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / 50);
    const minute = Math.floor(((y % 50) / 50) * 60);

    // 创建新计划
    showPlanEditModal({
      date: date.toISOString().split("T")[0],
      startTime: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      endTime: `${Math.min(23, hour + 1)
        .toString()
        .padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    });
  });

  return dayColumn;
}

// 创建计划时间块
function createPlanTimelineBlock(
  plan,
  occurrenceDate = null,
  slotHeight = 50,
  visualScale = slotHeight / 50,
) {
  const block = document.createElement("div");
  block.className = "plan-timeline-block";
  block.dataset.planId = plan.id;
  const blockOccurrenceDate = getPlanOccurrenceDateKey(plan, occurrenceDate);
  const planCompleted = getPlanCompletionState(plan, blockOccurrenceDate);
  const safeScale = Math.min(
    Math.max(visualScale || slotHeight / 50, 0.3),
    2.2,
  );
  const titleFontSize = Math.max(9, Math.round(12 * safeScale));
  const timeFontSize = Math.max(8, Math.round(10 * safeScale));

  // 解析开始和结束时间
  const startTime = parseTime(plan.startTime);
  const endTime = parseTime(plan.endTime);

  // 计算位置和高度
  const startMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;
  const durationMinutes = endMinutes - startMinutes;

  // 设置位置和大小
  block.style.position = "absolute";
  block.style.top = `${(startMinutes / 60) * slotHeight}px`;
  block.style.height = `${Math.max((durationMinutes / 60) * slotHeight, Math.max(14, Math.round(18 * safeScale)))}px`;
  block.style.left = "5px";
  block.style.right = "5px";
  block.style.background = planCompleted
    ? `linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02)), color-mix(in srgb, ${plan.color} 34%, rgba(20, 24, 32, 0.92) 66%)`
    : `linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.02)), ${plan.color}`;
  block.style.border = planCompleted
    ? "1px dashed rgba(255,255,255,0.34)"
    : "1px solid rgba(255,255,255,0.2)";
  block.style.borderRadius = `${Math.max(8, Math.round(12 * safeScale))}px`;
  block.style.padding = `${Math.max(3, Math.round(5 * safeScale))}px`;
  block.style.overflow = "hidden";
  block.style.cursor = "pointer";
  block.style.backdropFilter = "blur(10px) saturate(120%)";
  block.style.webkitBackdropFilter = "blur(10px) saturate(120%)";
  block.style.boxShadow = planCompleted
    ? "0 8px 18px rgba(0,0,0,0.16)"
    : "0 12px 24px rgba(0,0,0,0.22)";
  block.style.zIndex = "10";
  block.style.opacity = planCompleted ? "0.92" : "1";

  // 计划内容
  block.innerHTML = `
    <div style="font-size: ${titleFontSize}px; font-weight: bold; color: white; margin-bottom: 2px; ${planCompleted ? "text-decoration: line-through; opacity: 0.88;" : ""}">
      ${planCompleted ? "✓ " : ""}${plan.name}
    </div>
    <div style="font-size: ${timeFontSize}px; color: rgba(255,255,255,0.9)">
      ${plan.startTime} - ${plan.endTime}${planCompleted ? " · 已完成" : ""}
    </div>
  `;

  // 点击事件
  block.addEventListener("click", function () {
    showPlanDetailModal(
      plan,
      blockOccurrenceDate || plan.date || new Date().toISOString().split("T")[0],
    );
  });

  // 悬停效果
  block.addEventListener("mouseenter", function () {
    this.style.transform = "scale(1.02)";
    this.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
    this.style.zIndex = "20";
  });

  block.addEventListener("mouseleave", function () {
    this.style.transform = "scale(1)";
    this.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    this.style.zIndex = "10";
  });

  return block;
}

// 获取周开始日期（周一）
function getWeekStartDate(date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1); // 调整：周日设为前一周的周一
  return new Date(result.setDate(diff));
}

// 获取周结束日期（周日）
function getWeekEndDate(date) {
  const start = getWeekStartDate(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

// 获取指定日期的计划
function getPlansForDate(date) {
  const dateStr =
    window.ControlerDataIndex?.formatDateKey?.(date) ||
    date.toISOString().split("T")[0];
  return (
    planDataIndex?.getPlansForDate?.(dateStr, planOccursOnDateCached) ||
    []
  );
}

// 解析时间字符串
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

// 导航日历
function navigateCalendar(direction) {
  switch (currentView) {
    case "year":
      currentDate.setFullYear(currentDate.getFullYear() + direction);
      break;
    case "month":
      currentDate.setMonth(currentDate.getMonth() + direction);
      break;
    case "weekly-grid":
      currentDate.setDate(currentDate.getDate() + direction * 7);
      break;
    default:
      currentDate.setDate(currentDate.getDate() + direction * 7);
      currentView = "weekly-grid";
      break;
  }

  renderCalendarContent();
  updateCurrentDateDisplay();
}

// 渲染表格视图
function renderWeeklyGridView(container) {
  const weekStart = getWeekStartDate(currentDate);
  const scale = Math.min(
    Math.max(
      getTableScaleSetting("planWeeklyGrid", 1) * PLAN_WEEKLY_GRID_SHRINK_RATIO,
      0.1,
    ),
    2.2,
  );
  const compactMobile = isCompactMobileLayout();
  const slotHeight = Math.max(10, Math.round(32 * scale));
  const timeColumnWidth = Math.max(
    30,
    Math.min(
      72,
      Math.round(54 * scale * PLAN_WEEKLY_TIME_COLUMN_SHRINK_RATIO),
    ),
  );
  const dateColumnWidth = Math.max(
    34,
    Math.min(220, Math.round(76 * scale + 16)),
  );
  const dateGridWidth = dateColumnWidth * 7;
  const statsLikeHeaderFont = Math.max(
    8,
    Math.max(9, Math.round(11 * Math.max(scale, 0.78))) - 1,
  );
  const headerHeight = Math.max(40, Math.round(statsLikeHeaderFont * 3.35));
  const helperFontSize = Math.max(11, Math.round(14 * scale));
  const timeLabelFont = Math.max(
    8,
    Math.min(
      14,
      Math.round(
        Math.min(
          11 * Math.max(scale, MOBILE_TABLE_SCALE_RATIO),
          (timeColumnWidth - 6) * 0.24,
        ),
      ),
    ),
  );
  const dayHeaderFont = compactMobile
    ? Math.max(8, Math.min(statsLikeHeaderFont, timeLabelFont + 1))
    : statsLikeHeaderFont;
  const totalTimelineWidth = timeColumnWidth + dateGridWidth;
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.justifyContent = "flex-start";
  controls.style.alignItems = "center";
  controls.style.gap = "12px";
  controls.style.flexWrap = "wrap";
  controls.style.marginBottom = "12px";
  controls.innerHTML = `
    <div style="color: var(--text-color); font-size: ${helperFontSize}px;">
      点击空白时间位置创建事项
    </div>
  `;
  container.appendChild(controls);

  const weeklyShell = document.createElement("div");
  weeklyShell.className = "weekly-glass-shell";
  weeklyShell.style.width = "100%";
  weeklyShell.style.maxWidth = "100%";
  weeklyShell.style.minWidth = "0";
  weeklyShell.style.boxSizing = "border-box";
  weeklyShell.style.alignSelf = "stretch";
  weeklyShell.style.overflow = "visible";

  const weeklyScroller = document.createElement("div");
  weeklyScroller.className = "weekly-glass-scroller";
  weeklyScroller.style.width = "100%";
  weeklyScroller.style.minWidth = "0";
  weeklyScroller.style.boxSizing = "border-box";
  weeklyScroller.style.overflowX = "auto";
  weeklyScroller.style.overflowY = "visible";
  if (isCompactMobileLayout()) {
    weeklyScroller.style.overflowY = "hidden";
    weeklyScroller.style.webkitOverflowScrolling = "touch";
    weeklyScroller.style.touchAction = "auto";
    weeklyScroller.style.overscrollBehaviorX = "contain";
  }

  const timelineContainer = document.createElement("div");
  timelineContainer.style.display = "grid";
  timelineContainer.style.gridTemplateColumns = `${timeColumnWidth}px ${dateGridWidth}px`;
  timelineContainer.style.width = `${totalTimelineWidth}px`;
  timelineContainer.style.minWidth = `${totalTimelineWidth}px`;
  timelineContainer.style.boxSizing = "border-box";

  const timeColumn = document.createElement("div");
  timeColumn.style.width = `${timeColumnWidth}px`;
  timeColumn.style.flexShrink = "0";
  timeColumn.style.backgroundColor = "transparent";

  const headerSpacer = document.createElement("div");
  headerSpacer.className = "weekly-glass-header-cell";
  headerSpacer.classList.add("weekly-glass-round-start");
  headerSpacer.style.height = `${headerHeight}px`;
  headerSpacer.style.borderBottom =
    "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
  timeColumn.appendChild(headerSpacer);

  for (let hour = 0; hour < 24; hour++) {
    const slot = document.createElement("div");
    slot.className = "weekly-glass-time-cell";
    slot.style.height = `${slotHeight}px`;
    slot.style.borderBottom =
      "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
    slot.style.display = "flex";
    slot.style.alignItems = "center";
    slot.style.justifyContent = "center";
    slot.style.padding = compactMobile ? "0 2px" : "0 3px";
    slot.style.color = "var(--text-color)";
    slot.style.fontSize = `${timeLabelFont}px`;
    slot.style.lineHeight = "1.05";
    slot.style.boxSizing = "border-box";
    slot.style.overflow = "hidden";
    slot.style.whiteSpace = "nowrap";
    slot.style.textOverflow = "ellipsis";
    slot.textContent = `${hour.toString().padStart(2, "0")}:00`;
    slot.title = `${hour.toString().padStart(2, "0")}:00`;
    timeColumn.appendChild(slot);
  }

  timelineContainer.appendChild(timeColumn);

  const daysGrid = document.createElement("div");
  daysGrid.style.display = "grid";
  daysGrid.style.gridTemplateColumns = `repeat(7, ${dateColumnWidth}px)`;
  daysGrid.style.width = `${dateGridWidth}px`;
  daysGrid.style.minWidth = `${dateGridWidth}px`;
  daysGrid.style.boxSizing = "border-box";

  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = normalizePlanDateKey(date) || date.toISOString().split("T")[0];

    const dayColumn = document.createElement("div");
    dayColumn.className = "weekly-glass-day-column";
    dayColumn.style.display = "flex";
    dayColumn.style.flexDirection = "column";
    dayColumn.style.width = `${dateColumnWidth}px`;
    dayColumn.style.minWidth = `${dateColumnWidth}px`;
    dayColumn.style.boxSizing = "border-box";
    dayColumn.style.borderLeft =
      i === 0
        ? "none"
        : "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
    dayColumn.style.borderRight =
      i === weekdays.length - 1
        ? "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)"
        : "none";

    const dayHeader = document.createElement("div");
    dayHeader.className = "weekly-glass-header-cell";
    if (i === weekdays.length - 1) {
      dayHeader.classList.add("weekly-glass-round-end");
    }
    dayHeader.style.height = `${headerHeight}px`;
    dayHeader.style.display = "flex";
    dayHeader.style.flexDirection = "column";
    dayHeader.style.alignItems = "center";
    dayHeader.style.justifyContent = "center";
    dayHeader.style.borderBottom =
      "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
    dayHeader.style.color = "var(--text-color)";
    dayHeader.style.fontSize = `${dayHeaderFont}px`;
    dayHeader.style.padding = compactMobile ? "5px 4px" : "6px 6px";
    dayHeader.style.gap = compactMobile ? "1px" : "2px";
    dayHeader.style.boxSizing = "border-box";
    dayHeader.style.overflow = "hidden";
    dayHeader.innerHTML = `
      <div style="display:block; width:100%; line-height:1.22; font-size:${dayHeaderFont}px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;">${date.getMonth() + 1}/${date.getDate()}</div>
      <div style="display:block; width:100%; line-height:1.22; font-size:${dayHeaderFont}px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0.92; font-weight:600;">${weekdays[i]}</div>
    `;
    dayColumn.appendChild(dayHeader);

    const timeline = document.createElement("div");
    timeline.className = "weekly-glass-timeline";
    timeline.style.position = "relative";
    timeline.style.height = `${slotHeight * 24}px`;
    timeline.style.minHeight = `${slotHeight * 24}px`;
    timeline.style.cursor = "pointer";
    timeline.style.overflow = "hidden";
    timeline.style.boxSizing = "border-box";

    for (let hour = 0; hour < 24; hour++) {
      const hourLine = document.createElement("div");
      hourLine.style.height = `${slotHeight}px`;
      hourLine.style.borderBottom =
        "1px solid color-mix(in srgb, var(--panel-border-color) 72%, transparent)";
      hourLine.style.boxSizing = "border-box";
      timeline.appendChild(hourLine);
    }

    const dayPlans = getPlansForDate(date);
    dayPlans.forEach((plan) => {
      const block = createPlanTimelineBlock(plan, dateStr, slotHeight, scale);
      block.style.left = "4px";
      block.style.right = "4px";
      timeline.appendChild(block);
    });

    timeline.addEventListener("click", (event) => {
      if (event.target.closest(".plan-timeline-block")) return;
      const rect = timeline.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const hour = Math.floor(y / slotHeight);
      const minute = Math.floor(((y % slotHeight) / slotHeight) * 60);

      const startHour = Math.max(0, Math.min(23, hour));
      const endHour = Math.min(23, startHour + 1);
      const minuteText = String(minute).padStart(2, "0");

      showWeeklyGridPlanModal({
        date: dateStr,
        startTime: `${String(startHour).padStart(2, "0")}:${minuteText}`,
        endTime: `${String(endHour).padStart(2, "0")}:${minuteText}`,
      });
    });

    dayColumn.appendChild(timeline);
    daysGrid.appendChild(dayColumn);
  }

  timelineContainer.appendChild(daysGrid);
  weeklyScroller.appendChild(timelineContainer);
  weeklyShell.appendChild(weeklyScroller);
  container.appendChild(weeklyShell);
}

// 获取指定时间段内的计划
function getPlansForTimeSlot(dateStr, startTime, durationMinutes) {
  const slotStart = parseTime(startTime);
  const slotEndMinutes =
    slotStart.hours * 60 + slotStart.minutes + durationMinutes;

  return getPlansForDate(dateStr).filter((plan) => {
    if (!planOccursOnDateCached(plan, dateStr)) return false;

    const planStart = parseTime(plan.startTime);
    const planEnd = parseTime(plan.endTime);
    const planStartMinutes = planStart.hours * 60 + planStart.minutes;
    const planEndMinutes = planEnd.hours * 60 + planEnd.minutes;

    // 检查计划是否与时间段有重叠
    return (
      planStartMinutes < slotEndMinutes &&
      planEndMinutes > slotStart.hours * 60 + slotStart.minutes
    );
  });
}

async function deletePlanWithRepeatChoice(planId, occurrenceDate = null) {
  const index = plans.findIndex((p) => matchesId(p.id, planId));
  if (index === -1) {
    await showPlanAlert("删除失败：未找到该计划，请刷新后重试。", {
      title: "删除失败",
      danger: true,
    });
    return false;
  }

  const plan = plans[index];
  const isRepeatPlan = plan.repeat && plan.repeat !== "none";
  const normalizedOccurrenceDate = getPlanOccurrenceDateKey(plan, occurrenceDate);

  if (!isRepeatPlan) {
    plans.splice(index, 1);
    const saveResult = await savePlans();
    if (saveResult === false) {
      return false;
    }
    renderCalendarContent();
    updateCurrentDateDisplay();
    return true;
  }

  if (normalizedOccurrenceDate) {
    const deleteAll = await requestPlanConfirmation(
      "该计划是重复计划。\n点击“确定”删除所有重复计划；点击“取消”仅删除当前这一天。",
      {
        title: "删除重复计划",
        confirmText: "删除全部",
        cancelText: "仅删当天",
        danger: true,
      },
    );

    if (deleteAll) {
      plans.splice(index, 1);
    } else {
      if (!Array.isArray(plans[index].excludedDates)) {
        plans[index].excludedDates = [];
      }
      if (!plans[index].excludedDates.includes(normalizedOccurrenceDate)) {
        plans[index].excludedDates.push(normalizedOccurrenceDate);
        applyPlanDerivedFields(plans[index]);
      }
    }
  } else {
    const deleteAll = await requestPlanConfirmation(
      "该计划是重复计划，当前无法定位具体日期。\n点击“确定”删除所有重复计划。",
      {
        title: "删除重复计划",
        confirmText: "删除全部",
        cancelText: "取消",
        danger: true,
      },
    );
    if (!deleteAll) return false;
    plans.splice(index, 1);
  }

  const saveResult = await savePlans();
  if (saveResult === false) {
    return false;
  }
  renderCalendarContent();
  updateCurrentDateDisplay();
  return true;
}

// 显示表格视图的计划编辑弹窗
function showWeeklyGridPlanModal(planData = null) {
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

  // 重复选项的详细设置
  const repeatOptionsHtml = `
    <div style="margin-top: 10px; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; display: none;" id="repeat-details">
      <div style="margin-bottom: 10px; font-size: 13px; color: var(--text-color);">
        每周重复设置:
      </div>
      <div style="display: flex; gap: 5px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="1"> 周一
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="2"> 周二
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="3"> 周三
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="4"> 周四
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="5"> 周五
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="6"> 周六
        </label>
        <label style="display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-color);">
          <input type="checkbox" name="repeat-days" value="0"> 周日
        </label>
      </div>
    </div>
  `;

  // 弹窗内容
  modal.innerHTML = `
    <div class="modal-content ms controler-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${planData?.id ? "编辑计划" : "添加新计划"}
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
        <!-- 计划名称 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            计划名称
          </label>
          <input type="text" id="weekly-plan-name-input" value="${planData?.name || ""}" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 日期 -->
        <div>
          <div style="flex: 1;">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              日期
            </label>
            <input type="date" id="weekly-plan-date-input" value="${planData?.date || currentDate.toISOString().split("T")[0]}" style="
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
        <!-- 时间范围 -->
        <div class="controler-form-modal-split controler-form-modal-time-range" style="display: flex; gap: 10px;">
          <div style="flex: 1;">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始时间
            </label>
            <input type="time" id="weekly-plan-start-time-input" value="${planData?.startTime || "09:00"}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 16px;
            ">
          </div>
          <div style="flex: 1;">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              结束时间
            </label>
            <input type="time" id="weekly-plan-end-time-input" value="${planData?.endTime || "10:00"}" style="
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
        
        <!-- 重复设置 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            重复设置
          </label>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="weekly-plan-repeat" value="none" ${!planData?.repeat || planData?.repeat === "none" ? "checked" : ""}>
              <span style="font-size: 14px;">不重复</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="weekly-plan-repeat" value="daily" ${planData?.repeat === "daily" ? "checked" : ""}>
              <span style="font-size: 14px;">每天</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="weekly-plan-repeat" value="weekly" ${planData?.repeat === "weekly" ? "checked" : ""}>
              <span style="font-size: 14px;">每周</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="weekly-plan-repeat" value="monthly" ${planData?.repeat === "monthly" ? "checked" : ""}>
              <span style="font-size: 14px;">每月</span>
            </label>
          </div>
          ${repeatOptionsHtml}
        </div>

        ${getPlanReminderSectionHtml(planData, "weekly-plan")}
        
        <!-- 颜色选择 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            颜色
          </label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="color" id="weekly-plan-color-input" value="${planData?.color || "#79af85"}" style="
              width: 50px;
              height: 50px;
              cursor: pointer;
              border: none;
              border-radius: 8px;
              overflow: hidden;
            ">
            <div style="color: var(--text-color); font-size: 14px;">点击选择颜色</div>
          </div>
        </div>
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer" style="display: flex; justify-content: space-between; margin-top: 25px;">
        ${
          planData?.id
            ? `
          <button type="button" class="bts" id="weekly-delete-plan-btn" style="background-color: var(--delete-btn);">
            删除计划
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button type="button" class="bts" id="weekly-cancel-plan-btn">取消</button>
          <button type="button" class="bts" id="weekly-save-plan-btn">${planData?.id ? "保存更改" : "创建计划"}</button>
        </div>
      </div>
    </div>
  `;

  preparePlanModalOverlay(modal, {
    zIndex: 2000,
  });
  bindPlanFormModalEventShield(modal);

  // 显示/隐藏每周重复详细设置
  const weeklyRadio = modal.querySelector(
    'input[name="weekly-plan-repeat"][value="weekly"]',
  );
  const repeatDetails = modal.querySelector("#repeat-details");

  // 编辑模式下恢复每周重复的周几
  const existingWeeklyDays = Array.isArray(planData?.repeatDays)
    ? planData.repeatDays
    : [];
  if (existingWeeklyDays.length > 0) {
    existingWeeklyDays.forEach((day) => {
      const checkbox = modal.querySelector(
        `input[name="repeat-days"][value="${day}"]`,
      );
      if (checkbox) {
        checkbox.checked = true;
      }
    });
  } else if (planData?.repeat === "weekly" && planData?.date) {
    const fallbackDay = new Date(planData.date).getDay();
    const checkbox = modal.querySelector(
      `input[name="repeat-days"][value="${fallbackDay}"]`,
    );
    if (checkbox) {
      checkbox.checked = true;
    }
  }

  weeklyRadio.addEventListener("change", function () {
    if (this.checked) {
      repeatDetails.style.display = "block";
    }
  });

  modal
    .querySelectorAll('input[name="weekly-plan-repeat"]:not([value="weekly"])')
    .forEach((radio) => {
      radio.addEventListener("change", function () {
        if (this.checked) {
          repeatDetails.style.display = "none";
        }
      });
    });

  // 如果初始就是每周重复，显示详细设置
  if (planData?.repeat === "weekly") {
    repeatDetails.style.display = "block";
  }

  bindPlanReminderInputs(modal, "weekly-plan");
  bindPlanReminderBaseDateSync(modal, "weekly-plan", {
    dateSelector: "#weekly-plan-date-input",
    startTimeSelector: "#weekly-plan-start-time-input",
    repeatSelector: 'input[name="weekly-plan-repeat"]',
  });
  const weeklyPlanDraftSession = createPlanModalDraftSession(
    modal,
    `draft:plan:weekly:${planData?.id || "new"}:${planData?._occurrenceDate || planData?.date || currentDate.toISOString().split("T")[0]}`,
  );
  void weeklyPlanDraftSession.restore().catch((error) => {
    console.error("恢复周视图计划草稿失败:", error);
  });

  const closeWeeklyPlanModal = () => {
    weeklyPlanDraftSession.destroy();
    removePlanModalElement(modal);
  };
  modal.__controlerCloseModal = closeWeeklyPlanModal;

  if (uiTools?.bindModalAction) {
    uiTools.bindModalAction(
      modal,
      "#weekly-cancel-plan-btn",
      closeWeeklyPlanModal,
    );
    uiTools.bindModalAction(modal, "#weekly-save-plan-btn", () => {
      void saveWeeklyGridPlan(modal, planData, {
        draftSession: weeklyPlanDraftSession,
      });
    });
  } else {
    modal
      .querySelector("#weekly-cancel-plan-btn")
      .addEventListener("click", closeWeeklyPlanModal);
    modal
      .querySelector("#weekly-save-plan-btn")
      .addEventListener("click", () => {
        void saveWeeklyGridPlan(modal, planData, {
          draftSession: weeklyPlanDraftSession,
        });
      });
  }

  if (planData?.id) {
    const deleteWeeklyPlanAction = async () => {
      const deleted = await deletePlanWithRepeatChoice(
        planData.id,
        planData._occurrenceDate || planData.date,
      );
      if (deleted) {
        await weeklyPlanDraftSession.clear().catch((error) => {
          console.error("清理周视图计划草稿失败:", error);
        });
      }
      if (deleted) {
        closeWeeklyPlanModal();
      }
    };
    if (uiTools?.bindModalAction) {
      uiTools.bindModalAction(
        modal,
        "#weekly-delete-plan-btn",
        deleteWeeklyPlanAction,
      );
    } else {
      modal
        .querySelector("#weekly-delete-plan-btn")
        .addEventListener("click", deleteWeeklyPlanAction);
    }
  }

}

// 保存表格视图的计划
async function saveWeeklyGridPlan(modal, planData, options = {}) {
  const draftSession = options?.draftSession || null;
  const name = modal.querySelector("#weekly-plan-name-input").value.trim();
  const date = modal.querySelector("#weekly-plan-date-input").value;
  const startTime = modal.querySelector("#weekly-plan-start-time-input").value;
  const endTime = modal.querySelector("#weekly-plan-end-time-input").value;
  const color = modal.querySelector("#weekly-plan-color-input").value;
  const repeat = modal.querySelector(
    'input[name="weekly-plan-repeat"]:checked',
  ).value;
  const reminderConfig = readPlanReminderConfig(
    modal,
    {
      ...planData,
      date: planData?.date || date,
      startTime,
      _occurrenceDate: planData?._occurrenceDate || date,
    },
    "weekly-plan",
  );

  // 如果是每周重复，获取选中的星期几
  let weeklyDays = [];
  if (repeat === "weekly") {
    modal
      .querySelectorAll('input[name="repeat-days"]:checked')
      .forEach((checkbox) => {
        weeklyDays.push(parseInt(checkbox.value));
      });

    // 如果未勾选具体星期，则默认使用所选日期对应的星期
    if (weeklyDays.length === 0) {
      weeklyDays.push(new Date(date).getDay());
    }
  }

  // 验证输入
  if (!name) {
    alert("请输入计划名称");
    return;
  }

  if (!date) {
    alert("请选择日期");
    return;
  }

  if (!startTime || !endTime) {
    alert("请选择开始和结束时间");
    return;
  }

  // 检查结束时间是否晚于开始时间
  if (startTime >= endTime) {
    alert("结束时间必须晚于开始时间");
    return;
  }

  const isEditMode = !!planData && !!planData.id;

  if (isEditMode) {
    // 更新现有计划
    const index = plans.findIndex((p) => matchesId(p.id, planData.id));
    if (index !== -1) {
      const updatedPlan = hydratePlan({
        ...plans[index],
        name,
        date,
        startTime,
        endTime,
        color,
        repeat,
        repeatDays: repeat === "weekly" ? weeklyDays : [],
        notification: reminderConfig,
      });
      updatedPlan.id = plans[index].id;
      updatedPlan.createdAt = plans[index].createdAt;
      setStoredPlanCompletionState(updatedPlan, plans[index].isCompleted, null);
      plans[index] = updatedPlan;
    }
  } else {
    // 创建新计划
    const newPlan = new Plan(
      name,
      date,
      startTime,
      endTime,
      color,
      repeat,
      null,
      repeat === "weekly" ? weeklyDays : [],
      reminderConfig,
    );
    plans.push(newPlan);
  }

  // 保存并更新UI
  syncPlanDataIndex(["plans"]);
  const saveResult = await savePlans();
  if (draftSession && typeof draftSession.clear === "function") {
    await draftSession.clear().catch((error) => {
      console.error("清理周视图计划草稿失败:", error);
    });
  }
  await getReminderTools()?.requestPermissionIfNeeded?.("计划", reminderConfig, {
    silentWhenDisabled: false,
  });
  renderPlanGuideCard();
  renderCalendarView({
    skipCoverageCheck: true,
  });
  if (saveResult === false) {
    return;
  }
  draftSession?.destroy?.();
  removePlanModalElement(modal);
}

// 回到今天
function goToToday() {
  const today = new Date();
  currentDate = today;
  renderCalendarContent();
  updateCurrentDateDisplay();
}

// 显示计划编辑弹窗
function showPlanEditModal(planData = null) {
  // 如果传入了计划数据，是编辑模式；否则是创建模式
  const isEditMode = !!planData && !!planData.id;
  const completionChecked = planData?._occurrenceDate
    ? getPlanCompletionState(planData, planData._occurrenceDate)
    : !!planData?.isCompleted;
  const weeklyRepeatDays = Array.isArray(planData?.repeatDays)
    ? planData.repeatDays
        .map((day) => parseInt(day, 10))
        .filter((day) => day >= 0 && day <= 6)
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

  // 弹窗内容
  modal.innerHTML = `
    <div class="modal-content ms controler-form-modal" style="padding: 25px; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin-top: 0; color: var(--text-color); margin-bottom: 20px;">
        ${isEditMode ? "编辑计划" : "创建新计划"}
      </h2>
      
      <div class="controler-form-modal-body" style="display: flex; flex-direction: column; gap: 15px;">
        <!-- 计划名称 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            计划名称
          </label>
          <input type="text" id="plan-name-input" value="${planData?.name || ""}" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 日期 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            日期
          </label>
          <input type="date" id="plan-date-input" value="${planData?.date || currentDate.toISOString().split("T")[0]}" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <!-- 时间范围 -->
        <div class="controler-form-modal-split controler-form-modal-time-range" style="display: flex; gap: 10px;">
          <div style="flex: 1;">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              开始时间
            </label>
            <input type="time" id="plan-start-time-input" value="${planData?.startTime || "09:00"}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--bg-tertiary);
              background-color: var(--bg-quaternary);
              color: var(--text-color);
              font-size: 16px;
            ">
          </div>
          <div style="flex: 1;">
            <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
              结束时间
            </label>
            <input type="time" id="plan-end-time-input" value="${planData?.endTime || "10:00"}" style="
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
        
        <!-- 重复设置 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            重复设置
          </label>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="plan-repeat" value="none" ${!planData?.repeat || planData?.repeat === "none" ? "checked" : ""}>
              <span style="font-size: 14px;">不重复</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="plan-repeat" value="daily" ${planData?.repeat === "daily" ? "checked" : ""}>
              <span style="font-size: 14px;">每天</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="plan-repeat" value="weekly" ${planData?.repeat === "weekly" ? "checked" : ""}>
              <span style="font-size: 14px;">每周</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color); gap: 5px;">
              <input type="radio" name="plan-repeat" value="monthly" ${planData?.repeat === "monthly" ? "checked" : ""}>
              <span style="font-size: 14px;">每月</span>
            </label>
          </div>
          <div id="plan-repeat-days-wrap" style="
            margin-top: 10px;
            padding: 10px;
            border-radius: 8px;
            background-color: var(--bg-tertiary);
            display: ${planData?.repeat === "weekly" ? "block" : "none"};
          ">
            <div style="color: var(--muted-text-color); font-size: 12px; margin-bottom: 8px;">
              每周重复日期
            </div>
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
                  <input type="checkbox" name="plan-repeat-days" value="${value}" ${weeklyRepeatDays.includes(parseInt(value, 10)) ? "checked" : ""}>
                  ${label}
                </label>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>

        ${getPlanReminderSectionHtml(planData, "plan")}
        
        <!-- 颜色选择 -->
        <div>
          <label style="color: var(--text-color); display: block; margin-bottom: 5px; font-size: 14px;">
            颜色
          </label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="color" id="plan-color-input" value="${planData?.color || "#79af85"}" style="
              width: 50px;
              height: 50px;
              cursor: pointer;
              border: none;
              border-radius: 8px;
              overflow: hidden;
            ">
            <div style="color: var(--text-color); font-size: 14px;">点击选择颜色</div>
          </div>
        </div>
        
        <!-- 完成状态 -->
        <div>
          <label style="display: flex; align-items: center; color: var(--text-color); gap: 10px; font-size: 14px;">
            <input type="checkbox" id="plan-completed-checkbox" ${completionChecked ? "checked" : ""}>
            <span>标记为已完成</span>
          </label>
        </div>
      </div>
      
      <!-- 按钮区域 -->
      <div class="controler-form-modal-footer" style="display: flex; justify-content: space-between; margin-top: 25px;">
        ${
          isEditMode
            ? `
          <button type="button" class="bts" id="delete-plan-btn" style="background-color: var(--delete-btn);">
            删除计划
          </button>
        `
            : ""
        }
        <div class="controler-form-modal-footer-actions" style="display: flex; gap: 10px;">
          <button type="button" class="bts" id="cancel-plan-btn">取消</button>
          <button type="button" class="bts" id="save-plan-btn">${isEditMode ? "保存更改" : "创建计划"}</button>
        </div>
      </div>
    </div>
  `;

  preparePlanModalOverlay(modal, {
    zIndex: 2000,
  });
  bindPlanFormModalEventShield(modal);

  const repeatRadios = modal.querySelectorAll('input[name="plan-repeat"]');
  const repeatDaysWrap = modal.querySelector("#plan-repeat-days-wrap");
  repeatRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!repeatDaysWrap) return;
      repeatDaysWrap.style.display =
        radio.value === "weekly" && radio.checked ? "block" : "none";
    });
  });
  bindPlanReminderInputs(modal, "plan");
  bindPlanReminderBaseDateSync(modal, "plan", {
    dateSelector: "#plan-date-input",
    startTimeSelector: "#plan-start-time-input",
    repeatSelector: 'input[name="plan-repeat"]',
  });
  const planDraftSession = createPlanModalDraftSession(
    modal,
    `draft:plan:main:${planData?.id || "new"}:${planData?._occurrenceDate || planData?.date || currentDate.toISOString().split("T")[0]}`,
  );
  void planDraftSession.restore().catch((error) => {
    console.error("恢复计划草稿失败:", error);
  });

  const closePlanModal = () => {
    planDraftSession.destroy();
    removePlanModalElement(modal);
  };
  modal.__controlerCloseModal = closePlanModal;

  if (uiTools?.bindModalAction) {
    uiTools.bindModalAction(modal, "#cancel-plan-btn", closePlanModal);
    uiTools.bindModalAction(modal, "#save-plan-btn", () => {
      void savePlan(modal, isEditMode, planData, {
        draftSession: planDraftSession,
      });
    });
  } else {
    modal
      .querySelector("#cancel-plan-btn")
      .addEventListener("click", closePlanModal);
    modal.querySelector("#save-plan-btn").addEventListener("click", () => {
      void savePlan(modal, isEditMode, planData, {
        draftSession: planDraftSession,
      });
    });
  }

  if (isEditMode) {
    const deletePlanAction = async () => {
      const deleted = await deletePlanWithRepeatChoice(
        planData.id,
        planData._occurrenceDate || planData.date,
      );
      if (deleted) {
        await planDraftSession.clear().catch((error) => {
          console.error("清理计划草稿失败:", error);
        });
      }
      if (deleted) {
        closePlanModal();
      }
    };
    if (uiTools?.bindModalAction) {
      uiTools.bindModalAction(modal, "#delete-plan-btn", deletePlanAction);
    } else {
      modal
        .querySelector("#delete-plan-btn")
        .addEventListener("click", deletePlanAction);
    }
  }

}

// 保存计划
async function savePlan(modal, isEditMode, planData, options = {}) {
  const draftSession = options?.draftSession || null;
  const name = modal.querySelector("#plan-name-input").value.trim();
  const date = modal.querySelector("#plan-date-input").value;
  const startTime = modal.querySelector("#plan-start-time-input").value;
  const endTime = modal.querySelector("#plan-end-time-input").value;
  const color = modal.querySelector("#plan-color-input").value;
  const repeat = modal.querySelector('input[name="plan-repeat"]:checked').value;
  const isCompleted = modal.querySelector("#plan-completed-checkbox").checked;
  const reminderConfig = readPlanReminderConfig(
    modal,
    {
      ...planData,
      date: planData?.date || date,
      startTime,
      _occurrenceDate: planData?._occurrenceDate || date,
    },
    "plan",
  );
  const selectedRepeatDays = Array.from(
    modal.querySelectorAll('input[name="plan-repeat-days"]:checked'),
  ).map((input) => parseInt(input.value, 10));
  const repeatDays =
    repeat === "weekly"
      ? selectedRepeatDays.length > 0
        ? selectedRepeatDays
        : [new Date(date).getDay()]
      : [];

  // 验证输入
  if (!name) {
    alert("请输入计划名称");
    return;
  }

  if (!date) {
    alert("请选择日期");
    return;
  }

  if (!startTime || !endTime) {
    alert("请选择开始和结束时间");
    return;
  }

  // 检查结束时间是否晚于开始时间
  if (startTime >= endTime) {
    alert("结束时间必须晚于开始时间");
    return;
  }

  if (isEditMode && planData) {
    // 更新现有计划
    const index = plans.findIndex((p) => matchesId(p.id, planData.id));
    if (index !== -1) {
      const updatedPlan = hydratePlan({
        ...plans[index],
        name,
        date,
        startTime,
        endTime,
        color,
        repeat,
        repeatDays,
        notification: reminderConfig,
        isCompleted: plans[index].isCompleted,
      });
      updatedPlan.id = plans[index].id;
      updatedPlan.createdAt = plans[index].createdAt;
      setStoredPlanCompletionState(
        updatedPlan,
        isCompleted,
        isRecurringPlan(updatedPlan) && planData?._occurrenceDate
          ? getPlanOccurrenceDateKey(planData, planData?._occurrenceDate || date)
          : null,
      );
      plans[index] = updatedPlan;
    }
  } else {
    // 创建新计划
    const newPlan = new Plan(
      name,
      date,
      startTime,
      endTime,
      color,
      repeat,
      null,
      repeatDays,
      reminderConfig,
    );
    setStoredPlanCompletionState(
      newPlan,
      isCompleted,
      isRecurringPlan(newPlan) && planData?._occurrenceDate
        ? getPlanOccurrenceDateKey(planData, planData?._occurrenceDate || date)
        : null,
    );
    plans.push(newPlan);
  }

  // 保存并更新UI
  syncPlanDataIndex(["plans"]);
  const saveResult = await savePlans();
  if (draftSession && typeof draftSession.clear === "function") {
    await draftSession.clear().catch((error) => {
      console.error("清理计划草稿失败:", error);
    });
  }
  await getReminderTools()?.requestPermissionIfNeeded?.("计划", reminderConfig, {
    silentWhenDisabled: false,
  });
  renderPlanGuideCard();
  renderCalendarView({
    skipCoverageCheck: true,
  });
  if (saveResult === false) {
    return;
  }
  draftSession?.destroy?.();
  removePlanModalElement(modal);
}

// 显示计划详情弹窗
function showPlanDetailModal(plan, occurrenceDate = null) {
  // 创建弹窗
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

  // 重复设置文本
  const repeatText =
    {
      none: "不重复",
      daily: "每天重复",
      weekly: "每周重复",
      monthly: "每月重复",
    }[plan.repeat] || "不重复";
  const reminderSummary =
    getReminderTools()?.describePlanReminder?.(
      plan,
      occurrenceDate || plan.date,
    ) || "不通知";
  const detailDate = getPlanOccurrenceDateKey(plan, occurrenceDate) || plan.date;
  const detailCompleted = getPlanCompletionState(plan, detailDate);

  // 弹窗内容
  modal.innerHTML = `
    <div class="modal-content ms" style="padding: 25px; border-radius: 15px; max-width: 450px; width: 90%;">
      <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <div style="width: 20px; height: 20px; background-color: ${plan.color}; border-radius: 4px; margin-right: 10px;"></div>
        <h2 style="margin: 0; color: var(--text-color);">${plan.name}</h2>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 25px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">📅 日期:</span>
          <span style="color: var(--text-color); font-size: 16px; font-weight: bold;">${detailDate}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">⏰ 时间:</span>
          <span style="color: var(--text-color); font-size: 16px; font-weight: bold;">${plan.startTime} - ${plan.endTime}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">🔄 重复:</span>
          <span style="color: var(--text-color); font-size: 16px;">${repeatText}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">🔔 通知:</span>
          <span style="color: var(--text-color); font-size: 16px;">${reminderSummary}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">✅ 状态:</span>
          <span style="color: ${detailCompleted ? "var(--accent-color)" : "var(--text-color)"}; font-size: 16px;">
            ${detailCompleted ? "已完成" : "未完成"}
          </span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--text-color); font-size: 14px; opacity: 0.8;">📝 创建时间:</span>
          <span style="color: var(--text-color); font-size: 14px;">
            ${new Date(plan.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between;">
        <button type="button" class="bts" id="close-detail-btn">关闭</button>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="bts" id="toggle-complete-btn" style="background-color: ${detailCompleted ? "var(--bg-tertiary)" : "var(--accent-color)"};">
            ${detailCompleted ? "标记为未完成" : "标记为已完成"}
          </button>
          <button type="button" class="bts" id="edit-plan-btn">编辑</button>
        </div>
      </div>
    </div>
  `;

  preparePlanModalOverlay(modal, {
    zIndex: 2000,
  });

  // 绑定事件
  const closeDetailModal = () => {
    removePlanModalElement(modal);
  };
  modal.__controlerCloseModal = closeDetailModal;

  const editPlanAction = () => {
    closeDetailModal();
    setTimeout(
      () =>
        showPlanEditModal({
          ...plan,
          _occurrenceDate: detailDate,
        }),
      100,
    );
  };

  const togglePlanCompleteAction = async () => {
    const index = plans.findIndex((p) => matchesId(p.id, plan.id));
    if (index !== -1) {
      const nextCompleted = !getPlanCompletionState(plans[index], detailDate);
      setStoredPlanCompletionState(plans[index], nextCompleted, detailDate);
      const saveResult = await savePlans();
      if (saveResult !== false) {
        renderCalendarContent();
        updateCurrentDateDisplay();
        closeDetailModal();
      }
    }
  };

  if (uiTools?.bindModalAction) {
    uiTools.bindModalAction(modal, "#close-detail-btn", closeDetailModal);
    uiTools.bindModalAction(modal, "#edit-plan-btn", editPlanAction);
    uiTools.bindModalAction(
      modal,
      "#toggle-complete-btn",
      togglePlanCompleteAction,
    );
  } else {
    modal
      .querySelector("#close-detail-btn")
      .addEventListener("click", closeDetailModal);
    modal
      .querySelector("#edit-plan-btn")
      .addEventListener("click", editPlanAction);
    modal
      .querySelector("#toggle-complete-btn")
      .addEventListener("click", togglePlanCompleteAction);
  }

  // 点击外部关闭
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      closeDetailModal();
    }
  });
}

// 创建测试计划
function createTestPlans() {
  const today = new Date();

  // 创建一些测试计划
  const testPlans = [
    new Plan(
      "团队会议",
      today.toISOString().split("T")[0],
      "10:00",
      "11:30",
      "#4299e1",
      "weekly",
    ),
    new Plan(
      "项目开发",
      today.toISOString().split("T")[0],
      "14:00",
      "17:00",
      "#79af85",
    ),
    new Plan(
      "健身时间",
      today.toISOString().split("T")[0],
      "19:00",
      "20:00",
      "#f56565",
      "daily",
    ),
  ];

  // 创建一些未来几天的计划
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  testPlans.push(
    new Plan(
      "客户会议",
      tomorrow.toISOString().split("T")[0],
      "09:00",
      "10:30",
      "#ed8936",
    ),
  );

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  testPlans.push(
    new Plan(
      "月度报告",
      nextWeek.toISOString().split("T")[0],
      "13:00",
      "15:00",
      "#9f7aea",
      "monthly",
    ),
  );

  // 添加到计划列表
  plans = testPlans;

  // 保存到localStorage
  savePlans();

  console.log("测试计划数据创建成功，共", plans.length, "个计划");
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


function initGridViewButton() {
  const gridViewBtn = document.getElementById("weekly-grid-btn");
  if (gridViewBtn) {
    gridViewBtn.addEventListener("click", function () {
      currentView = "weekly-grid";
      renderCalendarView();

      // 更新按钮激活状态
      document.querySelectorAll("[data-view]").forEach((b) => {
        uiTools?.setAccentButtonState(b, false);
      });

      // 激活表格视图按钮
      const existingGridViewBtn = document.querySelector(
        "#weekly-grid-btn[data-view]",
      );
      if (existingGridViewBtn) {
        uiTools?.setAccentButtonState(existingGridViewBtn, true);
      }
    });
  }
}

function ensurePlansLoadedForCurrentView() {
  if (typeof window.ControlerStorage?.loadSectionRange !== "function") {
    return false;
  }
  if (currentView === "year") {
    return false;
  }
  const neededPeriodIds = getPlanPeriodIdsForVisibleView();
  const coverageLoadKey = `${currentView}:${neededPeriodIds.join("|")}`;
  const hasCoverage =
    neededPeriodIds.length > 0 &&
    neededPeriodIds.every((periodId) => planLoadedPeriodIds.includes(periodId));
  if (hasCoverage) {
    if (planCoverageLoadKey === coverageLoadKey) {
      planCoverageLoadKey = "";
    }
    return false;
  }
  if (planCoverageLoadKey === coverageLoadKey) {
    return true;
  }
  planCoverageLoadKey = coverageLoadKey;
  const requestId = ++planLoadRequestId;
  const runRefresh = async () => {
    if (!planRefreshController) {
      setPlanLoadingState({
        active: true,
        mode: getPlanLoadingMode({
          blocking: true,
        }),
        delayMs: getPlanLoadingDelayMs({
          blocking: true,
        }),
        message: "正在加载当前时间范围的计划，请稍候",
      });
      try {
        const snapshot = await readPlanWorkspace({
          periodIds: neededPeriodIds,
        });
        if (requestId !== planLoadRequestId) {
          return;
        }
        applyPlanWorkspaceState(snapshot);
        renderCalendarView();
        planInitialDataLoaded = true;
        planInitialDataValidated = true;
      } finally {
        if (requestId === planLoadRequestId) {
          if (planCoverageLoadKey === coverageLoadKey) {
            planCoverageLoadKey = "";
          }
          setPlanLoadingState({
            active: false,
          });
        }
      }
      return;
    }

    await planRefreshController.run(
      () =>
        readPlanWorkspace({
          periodIds: neededPeriodIds,
        }),
      {
        delayMs: getPlanLoadingDelayMs({
          blocking: true,
        }),
        loadingOptions: {
          mode: getPlanLoadingMode({
            blocking: true,
          }),
          message: "正在加载当前时间范围的计划，请稍候",
        },
        commit: async (snapshot) => {
          if (requestId !== planLoadRequestId) {
            return;
          }
          applyPlanWorkspaceState(snapshot);
          renderCalendarView();
          planInitialDataLoaded = true;
          planInitialDataValidated = true;
        },
      },
    );
    if (planCoverageLoadKey === coverageLoadKey) {
      planCoverageLoadKey = "";
    }
  };
  void runRefresh().catch((error) => {
    if (planCoverageLoadKey === coverageLoadKey) {
      planCoverageLoadKey = "";
    }
    console.error("加载当前视图计划失败:", error);
  });
  return true;
}

function isPlanWidgetTargetVisible(action = "") {
  switch (action) {
    case "show-week-view":
      return planInitialDataValidated && planShellReady && currentView === "weekly-grid";
    case "show-month-view":
      return planInitialDataValidated && planShellReady && currentView === "month";
    case "show-year-view":
      return planInitialDataValidated && planShellReady && currentView === "year";
    case "show-todos":
    case "show-checkins": {
      const todoPanel = document.getElementById("todo-panel-anchor");
      const expectedTodoView = action === "show-checkins" ? "checkins" : "todos";
      return (
        todoPanel instanceof HTMLElement &&
        todoSidebarRuntimeReady &&
        window.__controlerTodoWidgetView === expectedTodoView &&
        (
          !syncPlannerPagerMode() ||
          window.__controlerPlannerMobilePanel === "todos" ||
          window.location.hash === "#todo-panel-anchor"
        )
      );
    }
    default:
      return false;
  }
}

function clearPlanWidgetLaunchQuery() {
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

function schedulePlanWidgetLaunchHandled(
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
      clearPlanWidgetLaunchQuery();
    }
    if (!launchId || typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return true;
    }
    window.ControlerNativeBridge.emitEvent("widgets.launchHandled", {
      launchId,
      page: "plan",
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
    if (Date.now() - startedAt >= PLAN_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS) {
      return;
    }
    schedule(waitForHandled);
  };
  schedule(waitForHandled);
  return true;
}

function redirectLegacyTodoWidgetLaunch(payload = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "show-todos" && action !== "show-checkins") {
    return false;
  }

  const params = new URLSearchParams(window.location.search || "");
  params.set("widgetAction", action);
  params.set("widgetKind", action === "show-checkins" ? "checkins" : "todos");
  if (typeof payload?.source === "string" && payload.source.trim()) {
    params.set("widgetSource", payload.source.trim());
  }
  if (typeof payload?.launchId === "string" && payload.launchId.trim()) {
    params.set("widgetLaunchId", payload.launchId.trim());
  }
  const queryText = params.toString();
  const nextUrl = `todo.html${queryText ? `?${queryText}` : ""}`;
  if (
    window.ControlerUI?.navigateAppHref?.(nextUrl, {
      replaceHistory: true,
    })
  ) {
    return true;
  }
  window.location.replace(nextUrl);
  return true;
}

function handlePlanWidgetLaunchAction(payload = {}, options = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (!action) {
    return false;
  }

  switch (action) {
    case "show-week-view":
      currentView = "weekly-grid";
      if (PLAN_WIDGET_CONTEXT.enabled) {
        window.__controlerTodoWidgetView = "";
      }
      break;
    case "show-month-view":
      currentView = "month";
      if (PLAN_WIDGET_CONTEXT.enabled) {
        window.__controlerTodoWidgetView = "";
      }
      break;
    case "show-year-view":
      currentView = "year";
      if (PLAN_WIDGET_CONTEXT.enabled) {
        window.__controlerTodoWidgetView = "";
      }
      break;
    case "show-todos":
    case "show-checkins":
      return redirectLegacyTodoWidgetLaunch(payload);
    default:
      return false;
  }

  saveViewState();
  schedulePlanWidgetLaunchHandled(payload, () =>
    isPlanWidgetTargetVisible(action),
    options,
  );
  if (!planInitialDataLoaded) {
    scheduleDeferredPlanBootstrap();
    return true;
  }
  renderCalendarView();
  return true;
}

function initPlanWidgetLaunchAction() {
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
    handlePlanWidgetLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
      launchId: params.get("widgetLaunchId") || "",
    }, {
      clearQuery: true,
    });
  };

  window.addEventListener(eventName, (event) => {
    handlePlanWidgetLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}

async function loadInitialPlanWorkspace() {
  if (planInitialDataValidated) {
    return;
  }
  if (planInitialDataLoadPromise) {
    return planInitialDataLoadPromise;
  }

  const initialPeriodIds = getPlanPeriodIdsForVisibleView();
  const initialView = currentView;
  const requestId = ++planLoadRequestId;
  const runInitialLoad = async () => {
    if (!planRefreshController) {
      const snapshot = await readPlanWorkspace({
        periodIds: initialPeriodIds,
        view: initialView,
        basePlans: plans,
        loadedPeriodIds: planLoadedPeriodIds,
      });
      if (requestId !== planLoadRequestId) {
        return;
      }
      const dataChanged =
        !isPlanSerializableEqual(snapshot?.plans || [], plans || []) ||
        !isPlanSerializableEqual(snapshot?.yearlyGoals || {}, yearlyGoals || {}) ||
        !isPlanSerializableEqual(
          snapshot?.loadedPeriodIds || [],
          planLoadedPeriodIds || [],
        );
      if (dataChanged) {
        applyPlanWorkspaceState(snapshot);
      }
      uiTools?.markPerfStage?.("first-data-ready", {
        periodIds: planLoadedPeriodIds.slice(),
        planCount: plans.length,
      });
      uiTools?.markPerfStage?.("plan-first-data-ready", {
        periodIds: planLoadedPeriodIds.slice(),
        planCount: plans.length,
      });
      const calendarContent = document.getElementById("calendar-content");
      const shouldRenderCalendar =
        dataChanged ||
        !planShellRendered ||
        !(calendarContent instanceof HTMLElement) ||
        calendarContent.childElementCount === 0;
      if (shouldRenderCalendar && !planCalendarMountDeferred) {
        renderCalendarView();
      }
      planInitialDataLoaded = true;
      planInitialDataValidated = true;
      schedulePlanDeferredRuntimeIdleBootstrap();
      return;
    }

    const refreshResult = await planRefreshController.run(
      () =>
        readPlanWorkspace({
          periodIds: initialPeriodIds,
        }),
      {
        delayMs: 0,
        loadingOptions: {
          mode: getPlanLoadingMode(),
          message: "正在读取当前计划范围，请稍候",
        },
        commit: async (snapshot) => {
          if (requestId !== planLoadRequestId) {
            return;
          }
          const dataChanged =
            !isPlanSerializableEqual(snapshot?.plans || [], plans || []) ||
            !isPlanSerializableEqual(snapshot?.yearlyGoals || {}, yearlyGoals || {}) ||
            !isPlanSerializableEqual(
              snapshot?.loadedPeriodIds || [],
              planLoadedPeriodIds || [],
            );
          if (dataChanged) {
            applyPlanWorkspaceState(snapshot);
          }
          uiTools?.markPerfStage?.("first-data-ready", {
            periodIds: planLoadedPeriodIds.slice(),
            planCount: plans.length,
          });
          uiTools?.markPerfStage?.("plan-first-data-ready", {
            periodIds: planLoadedPeriodIds.slice(),
            planCount: plans.length,
          });
          const calendarContent = document.getElementById("calendar-content");
          const shouldRenderCalendar =
            dataChanged ||
            !planShellRendered ||
            !(calendarContent instanceof HTMLElement) ||
            calendarContent.childElementCount === 0;
          if (shouldRenderCalendar && !planCalendarMountDeferred) {
            renderCalendarView();
          }
          planInitialDataLoaded = true;
          planInitialDataValidated = true;
          schedulePlanDeferredRuntimeIdleBootstrap();
        },
      },
    );
    if (refreshResult?.stale) {
      return;
    }
  };
  planInitialDataLoadPromise = runInitialLoad()
    .catch((error) => {
      console.error("初始化计划数据失败:", error);
      renderCalendarView();
      planInitialDataLoaded = true;
      planInitialDataValidated = true;
    })
    .finally(() => {
      planInitialDataLoadPromise = null;
      if (!planRefreshController && requestId === planLoadRequestId) {
        setPlanLoadingState({
          active: false,
        });
      }
    });

  return planInitialDataLoadPromise;
}

async function hydratePlanData() {
  return loadInitialPlanWorkspace();
}

function scheduleDeferredPlanBootstrap() {
  if (
    planDeferredBootstrapQueued ||
    planInitialDataValidated ||
    planInitialDataLoadPromise
  ) {
    return;
  }
  if (!planShellPageActive) {
    planDeferredBootstrapPendingResume = true;
    return;
  }

  planDeferredBootstrapQueued = true;
  const run = () => {
    planDeferredBootstrapQueued = false;
    if (!planShellPageActive) {
      planDeferredBootstrapPendingResume = true;
      return;
    }
    void loadInitialPlanWorkspace();
  };

  const scheduleAfterPaint = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, {
        timeout: 320,
      });
      return;
    }
    window.setTimeout(run, 48);
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scheduleAfterPaint);
    });
    return;
  }

  window.setTimeout(scheduleAfterPaint, 32);
}

async function init() {
  let lastCompactLayout = isCompactMobileLayout();
  const useWidgetLaunchFastPath =
    typeof PLAN_WIDGET_CONTEXT.launchAction === "string" &&
    PLAN_WIDGET_CONTEXT.launchAction.trim().length > 0;
  const shouldDeferCalendarMount =
    PLAN_WIDGET_CONTEXT.launchAction === "show-todos" ||
    PLAN_WIDGET_CONTEXT.launchAction === "show-checkins";

  try {
    // 加载主题设置
    loadThemeSettings();

    // 加载视图状态
    loadViewState();
    applyPlanDesktopWidgetMode();
    await waitForPlanStorageReady();
    registerPlanBeforePageLeaveGuard();

    // 尺寸设置实时联动
    bindTableScaleLiveRefresh();
    bindPlanShellVisibilityGate();
    initPlanWidgetLaunchAction();
    initGridViewButton();
    bindAddPlanInlineButton();
    bindPlanExternalStorageRefresh();
    renderPlanGuideCard();
    const bootstrappedFromSnapshot = bootstrapPlanFromCachedSnapshot();
    renderPlanShell({
      fromCache: bootstrappedFromSnapshot,
      deferCalendarMount: shouldDeferCalendarMount,
    });
    window.__controlerPlannerMobilePanel = getRequestedPlannerPanel();
    bindPlannerMobileSwipe();

    window.addEventListener("hashchange", () => {
      syncPlannerPanelFromHash("auto");
    });
    window.addEventListener("resize", () => {
      const nextCompactLayout = isCompactMobileLayout();
      if (nextCompactLayout !== lastCompactLayout) {
        lastCompactLayout = nextCompactLayout;
        syncPlannerPanelFromHash("auto");
      }
    });

    setPlanLoadingState({
      active: !planInitialDataValidated,
      mode: getPlanLoadingMode(),
      message: "正在读取当前计划范围，请稍候",
    });
    queuePlanInitialReveal();

    if (!planInitialDataValidated && !planShellPageActive) {
      scheduleDeferredPlanBootstrap();
    } else if (!planInitialDataValidated) {
      await hydratePlanData();
    } else if (useWidgetLaunchFastPath) {
      scheduleDeferredPlanBootstrap();
    }
  } catch (error) {
    console.error("初始化计划页失败:", error);
  } finally {
    setPlanLoadingState({
      active: false,
    });
    queuePlanInitialReveal();
  }
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


