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
