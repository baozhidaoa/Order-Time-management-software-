(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerStorageBundle = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORMAT_VERSION = 1;
  const BUNDLE_MODE = "directory-bundle";
  const PERIOD_UNIT = "month";
  const UNDATED_PERIOD_ID = "undated";
  const CORE_FILE_NAME = "core.json";
  const MANIFEST_FILE_NAME = "bundle-manifest.json";
  const RECURRING_PLANS_FILE_NAME = "plans-recurring.json";
  const PROJECT_DURATION_CACHE_VERSION = 1;
  const PROJECT_DURATION_CACHE_VERSION_KEY = "durationCacheVersion";
  const PROJECT_DIRECT_DURATION_KEY = "cachedDirectDurationMs";
  const PROJECT_TOTAL_DURATION_KEY = "cachedTotalDurationMs";
  const PARTITIONED_SECTIONS = Object.freeze([
    "records",
    "diaryEntries",
    "dailyCheckins",
    "checkins",
    "plans",
  ]);
  const CORE_SECTION_KEYS = Object.freeze([
    "projects",
    "todos",
    "checkinItems",
    "yearlyGoals",
    "diaryCategories",
    "guideState",
    "customThemes",
    "builtInThemeOverrides",
    "selectedTheme",
    "createdAt",
    "lastModified",
    "storagePath",
    "storageDirectory",
    "userDataPath",
    "documentsPath",
    "syncMeta",
  ]);
  const SECTION_DIRECTORY_MAP = Object.freeze({
    records: "records",
    diaryEntries: "diaryEntries",
    dailyCheckins: "dailyCheckins",
    checkins: "checkins",
    plans: "plans",
  });
  const SECTION_REQUIRED_ARRAY_KEYS = Object.freeze([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "diaryEntries",
    "diaryCategories",
  ]);

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function ensureObject(value, fallback = {}) {
    return isPlainObject(value) ? value : fallback;
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateToPeriodId(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
  }

  function normalizeDateInput(value) {
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [yearText, monthText, dayText] = normalized.split("-");
      const year = Number.parseInt(yearText, 10);
      const month = Number.parseInt(monthText, 10);
      const day = Number.parseInt(dayText, 10);
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return null;
      }
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeDateKey(value) {
    const parsed = normalizeDateInput(value);
    if (!parsed) {
      return "";
    }
    return `${parsed.getFullYear()}-${padNumber(parsed.getMonth() + 1)}-${padNumber(parsed.getDate())}`;
  }

  function normalizePeriodId(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }
    if (normalized === UNDATED_PERIOD_ID) {
      return normalized;
    }
    return /^\d{4}-\d{2}$/.test(normalized) ? normalized : "";
  }

  function compareDates(left, right) {
    const leftValue = normalizeDateInput(left)?.getTime() || 0;
    const rightValue = normalizeDateInput(right)?.getTime() || 0;
    return leftValue - rightValue;
  }

  function sortPartitionItems(section, items = []) {
    const nextItems = ensureArray(items).slice();
    switch (section) {
      case "records":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.endTime || left?.timestamp || left?.startTime, right?.endTime || right?.timestamp || right?.startTime),
        );
        break;
      case "plans":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.date, right?.date) ||
            String(left?.startTime || "").localeCompare(String(right?.startTime || "")),
        );
        break;
      case "diaryEntries":
        nextItems.sort(
          (left, right) =>
            compareDates(left?.date || left?.updatedAt, right?.date || right?.updatedAt),
        );
        break;
      case "dailyCheckins":
        nextItems.sort((left, right) => compareDates(left?.date, right?.date));
        break;
      case "checkins":
        nextItems.sort((left, right) => compareDates(left?.updatedAt || left?.time, right?.updatedAt || right?.time));
        break;
      default:
        break;
    }
    return nextItems;
  }

  function normalizeDurationMs(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.round(Number(value) || 0));
  }

  function collectProjectCycleIds(parentById = new Map()) {
    const cycleIds = new Set();
    const resolvedIds = new Set();

    parentById.forEach((_parentId, projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId || resolvedIds.has(normalizedProjectId)) {
        return;
      }

      const trail = [];
      const visitedAt = new Map();
      let currentId = normalizedProjectId;

      while (
        currentId &&
        parentById.has(currentId) &&
        !resolvedIds.has(currentId)
      ) {
        if (visitedAt.has(currentId)) {
          const cycleStartIndex = visitedAt.get(currentId);
          trail.slice(cycleStartIndex).forEach((cycleProjectId) => {
            cycleIds.add(cycleProjectId);
          });
          break;
        }

        visitedAt.set(currentId, trail.length);
        trail.push(currentId);
        currentId = String(parentById.get(currentId) || "").trim();
      }

      trail.forEach((trailProjectId) => {
        resolvedIds.add(trailProjectId);
      });
    });

    return cycleIds;
  }

  function repairProjectHierarchy(projects = []) {
    const nextProjects = ensureArray(projects).map((project) =>
      cloneValue(project && typeof project === "object" ? project : {}),
    );
    const byId = new Map();
    const requestedParentById = new Map();
    let repaired = false;

    nextProjects.forEach((project, index) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || byId.has(projectId)) {
        return;
      }
      byId.set(projectId, {
        index,
        project,
      });
    });

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || !byId.has(projectId)) {
        return;
      }

      const rawParentId = String(project?.parentId || "").trim();
      if (
        !rawParentId ||
        rawParentId === projectId ||
        !byId.has(rawParentId)
      ) {
        requestedParentById.set(projectId, null);
        if (rawParentId) {
          repaired = true;
        }
        return;
      }

      requestedParentById.set(projectId, rawParentId);
    });

    const cycleIds = collectProjectCycleIds(requestedParentById);
    const resolvedStateById = new Map();
    const resolvingIds = new Set();

    const resolveProjectState = (projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId || !byId.has(normalizedProjectId)) {
        return {
          parentId: null,
          level: 1,
          level2AncestorId: null,
        };
      }

      if (resolvedStateById.has(normalizedProjectId)) {
        return resolvedStateById.get(normalizedProjectId);
      }

      if (resolvingIds.has(normalizedProjectId)) {
        repaired = true;
        const fallbackState = {
          parentId: null,
          level: 1,
          level2AncestorId: null,
        };
        resolvedStateById.set(normalizedProjectId, fallbackState);
        return fallbackState;
      }

      resolvingIds.add(normalizedProjectId);
      let parentId = requestedParentById.get(normalizedProjectId) || null;
      if (cycleIds.has(normalizedProjectId)) {
        parentId = null;
        repaired = true;
      }

      let resolvedState = {
        parentId: null,
        level: 1,
        level2AncestorId: null,
      };

      if (parentId) {
        const parentState = resolveProjectState(parentId);
        if (parentState.level === 1) {
          resolvedState = {
            parentId,
            level: 2,
            level2AncestorId: normalizedProjectId,
          };
        } else if (parentState.level === 2) {
          resolvedState = {
            parentId,
            level: 3,
            level2AncestorId: parentState.level2AncestorId || parentId,
          };
        } else if (parentState.level >= 3) {
          const flattenedParentId = String(
            parentState.level2AncestorId || "",
          ).trim();
          if (flattenedParentId && flattenedParentId !== normalizedProjectId) {
            resolvedState = {
              parentId: flattenedParentId,
              level: 3,
              level2AncestorId: flattenedParentId,
            };
            repaired = true;
          } else {
            resolvedState = {
              parentId: null,
              level: 1,
              level2AncestorId: null,
            };
            repaired = true;
          }
        }
      }

      resolvingIds.delete(normalizedProjectId);
      resolvedStateById.set(normalizedProjectId, resolvedState);
      return resolvedState;
    };

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId || !byId.has(projectId)) {
        return;
      }

      const resolvedState = resolveProjectState(projectId);
      const previousParentId = String(project?.parentId || "").trim() || null;
      const nextParentId = resolvedState.parentId || null;
      const previousLevel = Number.parseInt(project?.level, 10);
      const nextLevel = resolvedState.level;

      if (previousParentId !== nextParentId) {
        repaired = true;
      }
      if (previousLevel !== nextLevel) {
        repaired = true;
      }

      project.parentId = nextParentId;
      project.level = nextLevel;
    });

    return {
      projects: nextProjects,
      repaired,
    };
  }

  function parseSpendTimeToMs(spendtime) {
    if (typeof spendtime !== "string") {
      return 0;
    }

    const text = spendtime.trim();
    if (!text) {
      return 0;
    }

    let totalMs = 0;
    const addMatches = (pattern, multiplier) => {
      let match = pattern.exec(text);
      while (match) {
        totalMs += normalizeDurationMs(Number.parseInt(match[1], 10) * multiplier);
        match = pattern.exec(text);
      }
    };

    addMatches(/(\d+)\s*天/g, 24 * 60 * 60 * 1000);
    addMatches(/(\d+)\s*(?:小时|h(?:ours?)?)/gi, 60 * 60 * 1000);
    addMatches(/(\d+)\s*(?:分钟|min(?:ute)?s?)/gi, 60 * 1000);

    if (
      /小于\s*1\s*(?:分钟|min)/i.test(text) ||
      /less\s+than\s+1\s*min/i.test(text) ||
      /<\s*1\s*(?:分钟|min)/i.test(text)
    ) {
      totalMs += 30 * 1000;
    }

    return totalMs;
  }

  function getRecordDurationMs(record = {}) {
    if (!record || typeof record !== "object") {
      return 0;
    }

    if (Number.isFinite(record.durationMs) && record.durationMs >= 0) {
      return normalizeDurationMs(record.durationMs);
    }

    if (
      Number.isFinite(record?.durationMeta?.recordedMs) &&
      record.durationMeta.recordedMs >= 0
    ) {
      return normalizeDurationMs(record.durationMeta.recordedMs);
    }

    const startTime = normalizeDateInput(record.startTime);
    const endTime =
      normalizeDateInput(record.endTime) ||
      normalizeDateInput(record.timestamp) ||
      normalizeDateInput(record.sptTime);

    if (startTime && endTime) {
      return normalizeDurationMs(endTime.getTime() - startTime.getTime());
    }

    return parseSpendTimeToMs(record.spendtime);
  }

  function normalizeProjectDurationCache(project = {}) {
    const source =
      project && typeof project === "object" && !Array.isArray(project) ? project : {};
    return {
      ...source,
      [PROJECT_DURATION_CACHE_VERSION_KEY]: PROJECT_DURATION_CACHE_VERSION,
      [PROJECT_DIRECT_DURATION_KEY]: normalizeDurationMs(
        source[PROJECT_DIRECT_DURATION_KEY],
      ),
      [PROJECT_TOTAL_DURATION_KEY]: normalizeDurationMs(
        source[PROJECT_TOTAL_DURATION_KEY],
      ),
    };
  }

  function hasValidProjectDurationCache(project = {}) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      return false;
    }
    return (
      Number(project[PROJECT_DURATION_CACHE_VERSION_KEY]) ===
        PROJECT_DURATION_CACHE_VERSION &&
      Number.isFinite(project[PROJECT_DIRECT_DURATION_KEY]) &&
      project[PROJECT_DIRECT_DURATION_KEY] >= 0 &&
      Number.isFinite(project[PROJECT_TOTAL_DURATION_KEY]) &&
      project[PROJECT_TOTAL_DURATION_KEY] >= 0
    );
  }

  function projectsHaveValidDurationCache(projects = []) {
    return ensureArray(projects).every((project) =>
      hasValidProjectDurationCache(project),
    );
  }

  function buildProjectDurationContext(projects = []) {
    const hierarchyRepairResult = repairProjectHierarchy(projects);
    const normalizedProjects = ensureArray(hierarchyRepairResult.projects).map(
      (project) => normalizeProjectDurationCache(project),
    );
    const byId = new Map();
    const byName = new Map();
    const childrenByParent = new Map();
    const roots = [];

    normalizedProjects.forEach((project, index) => {
      const projectId = String(project?.id || "").trim();
      const projectName = String(project?.name || "").trim();
      if (projectId) {
        byId.set(projectId, {
          index,
          project,
        });
      }
      if (projectName) {
        byName.set(projectName, {
          index,
          project,
        });
      }
    });

    normalizedProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      const parentId = String(project?.parentId || "").trim();
      if (projectId && parentId && parentId !== projectId && byId.has(parentId)) {
        if (!childrenByParent.has(parentId)) {
          childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(projectId);
        return;
      }
      if (projectId) {
        roots.push(projectId);
      }
    });

    return {
      projects: normalizedProjects,
      byId,
      byName,
      childrenByParent,
      roots,
    };
  }

  function findProjectIndexForRecord(record = {}, contextOrProjects = []) {
    const context =
      contextOrProjects &&
      contextOrProjects.byId instanceof Map &&
      contextOrProjects.byName instanceof Map
        ? contextOrProjects
        : buildProjectDurationContext(contextOrProjects);

    const recordProjectId = String(record?.projectId || "").trim();
    if (recordProjectId && context.byId.has(recordProjectId)) {
      return context.byId.get(recordProjectId).index;
    }

    const recordName = String(record?.name || "").trim();
    if (!recordName) {
      return -1;
    }

    if (context.byName.has(recordName)) {
      return context.byName.get(recordName).index;
    }

    const leafName = recordName
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();

    if (leafName && context.byName.has(leafName)) {
      return context.byName.get(leafName).index;
    }

    return -1;
  }

  function attachProjectIdsToRecords(records = [], projects = []) {
    const context = buildProjectDurationContext(projects);
    return ensureArray(records).map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        return cloneValue(record);
      }

      const normalizedProjectId = String(record.projectId || "").trim();
      if (normalizedProjectId) {
        return cloneValue(record);
      }

      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return cloneValue(record);
      }

      const targetProject = context.projects[projectIndex];
      return {
        ...cloneValue(record),
        projectId: String(targetProject?.id || "").trim() || null,
      };
    });
  }

  function recalculateProjectDurationTotals(projects = []) {
    const context = buildProjectDurationContext(projects);
    const computed = new Map();
    const visiting = new Set();

    const computeTotal = (projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId) {
        return 0;
      }
      if (computed.has(normalizedProjectId)) {
        return computed.get(normalizedProjectId);
      }

      const entry = context.byId.get(normalizedProjectId);
      if (!entry) {
        return 0;
      }

      if (visiting.has(normalizedProjectId)) {
        return normalizeDurationMs(
          entry.project[PROJECT_DIRECT_DURATION_KEY],
        );
      }

      visiting.add(normalizedProjectId);
      let totalMs = normalizeDurationMs(entry.project[PROJECT_DIRECT_DURATION_KEY]);
      (context.childrenByParent.get(normalizedProjectId) || []).forEach(
        (childId) => {
          totalMs += computeTotal(childId);
        },
      );
      visiting.delete(normalizedProjectId);

      const normalizedTotalMs = normalizeDurationMs(totalMs);
      entry.project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      entry.project[PROJECT_TOTAL_DURATION_KEY] = normalizedTotalMs;
      computed.set(normalizedProjectId, normalizedTotalMs);
      return normalizedTotalMs;
    };

    context.projects.forEach((project) => {
      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        project[PROJECT_DIRECT_DURATION_KEY],
      );
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    context.roots.forEach((projectId) => {
      computeTotal(projectId);
    });

    context.projects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      if (!projectId) {
        project[PROJECT_TOTAL_DURATION_KEY] = normalizeDurationMs(
          project[PROJECT_DIRECT_DURATION_KEY],
        );
        return;
      }
      if (!computed.has(projectId)) {
        computeTotal(projectId);
      }
    });

    return context.projects;
  }

  function rebuildProjectDurationCaches(projects = [], records = []) {
    const context = buildProjectDurationContext(projects);
    context.projects.forEach((project) => {
      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = 0;
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    attachProjectIdsToRecords(records, context.projects).forEach((record) => {
      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return;
      }
      const targetProject = context.projects[projectIndex];
      targetProject[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        targetProject[PROJECT_DIRECT_DURATION_KEY] + getRecordDurationMs(record),
      );
    });

    return recalculateProjectDurationTotals(context.projects);
  }

  function reconcileProjectDurationCaches(projects = [], previousProjects = []) {
    const nextProjects = ensureArray(projects).map((project) =>
      normalizeProjectDurationCache(project),
    );
    const previousContext = buildProjectDurationContext(previousProjects);
    const previousByName = new Map();

    previousContext.projects.forEach((project) => {
      const projectName = String(project?.name || "").trim();
      if (!projectName) {
        return;
      }
      if (!previousByName.has(projectName)) {
        previousByName.set(projectName, project);
        return;
      }
      previousByName.set(projectName, null);
    });

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      const projectName = String(project?.name || "").trim();
      const matchedById = projectId
        ? previousContext.byId.get(projectId)?.project || null
        : null;
      const matchedByName =
        !matchedById && projectName ? previousByName.get(projectName) || null : null;
      const matchedProject = matchedById || matchedByName;

      project[PROJECT_DURATION_CACHE_VERSION_KEY] =
        PROJECT_DURATION_CACHE_VERSION;
      project[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(
        matchedProject?.[PROJECT_DIRECT_DURATION_KEY],
      );
      project[PROJECT_TOTAL_DURATION_KEY] = 0;
    });

    return recalculateProjectDurationTotals(nextProjects);
  }

  function applyProjectRecordDurationChanges(projects = [], changes = {}) {
    const context = buildProjectDurationContext(projects);
    const removedRecords = attachProjectIdsToRecords(
      ensureArray(changes?.removedRecords),
      context.projects,
    );
    const addedRecords = attachProjectIdsToRecords(
      ensureArray(changes?.addedRecords),
      context.projects,
    );

    const applyChange = (record, factor) => {
      const projectIndex = findProjectIndexForRecord(record, context);
      if (projectIndex === -1) {
        return;
      }
      const targetProject = context.projects[projectIndex];
      const nextDirectMs =
        normalizeDurationMs(targetProject[PROJECT_DIRECT_DURATION_KEY]) +
        factor * getRecordDurationMs(record);
      targetProject[PROJECT_DIRECT_DURATION_KEY] = normalizeDurationMs(nextDirectMs);
    };

    removedRecords.forEach((record) => {
      applyChange(record, -1);
    });
    addedRecords.forEach((record) => {
      applyChange(record, 1);
    });

    return recalculateProjectDurationTotals(context.projects);
  }

  function createBaseSyncMeta(syncMeta = {}, options = {}) {
    const source = ensureObject(syncMeta);
    const fileName =
      typeof options.fileName === "string" && options.fileName.trim()
        ? options.fileName.trim()
        : source.fileName || "controler-data.json";
    return {
      mode: source.mode || "directory-bundle",
      fileName,
      autoSyncEnabled: source.autoSyncEnabled !== false,
      lastSavedAt:
        typeof source.lastSavedAt === "string" && source.lastSavedAt
          ? source.lastSavedAt
          : null,
      lastTriggeredAt:
        typeof source.lastTriggeredAt === "string" && source.lastTriggeredAt
          ? source.lastTriggeredAt
          : null,
      lastFlushStartedAt:
        typeof source.lastFlushStartedAt === "string" && source.lastFlushStartedAt
          ? source.lastFlushStartedAt
          : null,
      lastFlushCompletedAt:
        typeof source.lastFlushCompletedAt === "string" &&
        source.lastFlushCompletedAt
          ? source.lastFlushCompletedAt
          : null,
      pendingWriteCount: Number.isFinite(source.pendingWriteCount)
        ? Math.max(0, Number(source.pendingWriteCount))
        : 0,
    };
  }

  function createEmptyLegacyState(options = {}) {
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : new Date().toISOString();
    return {
      projects: [],
      records: [],
      plans: [],
      todos: [],
      checkinItems: [],
      dailyCheckins: [],
      checkins: [],
      yearlyGoals: {},
      diaryEntries: [],
      diaryCategories: [],
      customThemes: [],
      builtInThemeOverrides: {},
      selectedTheme: "default",
      createdAt: now,
      lastModified: now,
      storagePath:
        typeof options.storagePath === "string" ? options.storagePath : null,
      storageDirectory:
        typeof options.storageDirectory === "string"
          ? options.storageDirectory
          : null,
      userDataPath:
        typeof options.userDataPath === "string" ? options.userDataPath : null,
      documentsPath:
        typeof options.documentsPath === "string" ? options.documentsPath : null,
      syncMeta: createBaseSyncMeta(options.syncMeta, {
        fileName: options.fileName,
      }),
    };
  }

  function createEmptyBundle(options = {}) {
    const baseState = createEmptyLegacyState(options);
    return splitLegacyState(baseState, {
      ...options,
      legacyBackups: ensureArray(options.legacyBackups),
    });
  }

  function isRecurringPlan(item) {
    const repeatValue = String(item?.repeat || "").trim().toLowerCase();
    return !!repeatValue && repeatValue !== "none";
  }

  function getSectionItemDate(section, item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    switch (section) {
      case "records":
        return (
          normalizeDateInput(item.endTime) ||
          normalizeDateInput(item.timestamp) ||
          normalizeDateInput(item.startTime)
        );
      case "diaryEntries":
        return (
          normalizeDateInput(item.date) || normalizeDateInput(item.updatedAt)
        );
      case "dailyCheckins":
        return normalizeDateInput(item.date);
      case "checkins":
        return (
          normalizeDateInput(item.updatedAt) || normalizeDateInput(item.time)
        );
      case "plans":
        return normalizeDateInput(item.date);
      default:
        return null;
    }
  }

  function getPeriodIdForSectionItem(section, item) {
    if (section === "plans" && isRecurringPlan(item)) {
      return "";
    }
    const itemDate = getSectionItemDate(section, item);
    return formatDateToPeriodId(itemDate) || UNDATED_PERIOD_ID;
  }

  function getPartitionRelativePath(section, periodId) {
    const sectionDirectory = SECTION_DIRECTORY_MAP[section];
    if (!sectionDirectory) {
      throw new Error(`Unsupported section: ${section}`);
    }
    const normalizedPeriodId = normalizePeriodId(periodId);
    if (!normalizedPeriodId) {
      throw new Error(`Unsupported periodId for ${section}: ${periodId}`);
    }
    if (normalizedPeriodId === UNDATED_PERIOD_ID) {
      return `${sectionDirectory}/undated.json`;
    }
    const [yearText] = normalizedPeriodId.split("-");
    return `${sectionDirectory}/${yearText}/${normalizedPeriodId}.json`;
  }

  function buildPartitionFingerprint(section, periodId, items = []) {
    const nextItems = sortPartitionItems(section, items);
    const minDate =
      nextItems.length > 0
        ? normalizeDateKey(getSectionItemDate(section, nextItems[0]))
        : "";
    const maxDate =
      nextItems.length > 0
        ? normalizeDateKey(
            getSectionItemDate(section, nextItems[nextItems.length - 1]),
          )
        : "";
    return `${section}:${periodId}:${nextItems.length}:${minDate}:${maxDate}:${JSON.stringify(nextItems).length}`;
  }

  function createPartitionEnvelope(section, periodId, items = [], options = {}) {
    const normalizedPeriodId = normalizePeriodId(periodId) || UNDATED_PERIOD_ID;
    const nextItems = sortPartitionItems(section, items);
    const minDate =
      nextItems.length > 0
        ? normalizeDateKey(getSectionItemDate(section, nextItems[0]))
        : "";
    const maxDate =
      nextItems.length > 0
        ? normalizeDateKey(
            getSectionItemDate(section, nextItems[nextItems.length - 1]),
          )
        : "";
    return {
      formatVersion: FORMAT_VERSION,
      section,
      periodUnit: PERIOD_UNIT,
      periodId: normalizedPeriodId,
      count: nextItems.length,
      minDate: minDate || null,
      maxDate: maxDate || null,
      fingerprint:
        typeof options.fingerprint === "string" && options.fingerprint
          ? options.fingerprint
          : buildPartitionFingerprint(section, normalizedPeriodId, nextItems),
      items: cloneValue(nextItems),
    };
  }

  function createSectionManifest(section, partitions = new Map()) {
    const normalizedPartitions = [];
    partitions.forEach((items, periodId) => {
      const nextItems = sortPartitionItems(section, items);
      if (!nextItems.length) {
        return;
      }
      const envelope = createPartitionEnvelope(section, periodId, nextItems);
      normalizedPartitions.push({
        periodId: envelope.periodId,
        file: getPartitionRelativePath(section, envelope.periodId),
        count: envelope.count,
        minDate: envelope.minDate,
        maxDate: envelope.maxDate,
        fingerprint: envelope.fingerprint,
      });
    });
    normalizedPartitions.sort((left, right) =>
      String(left.periodId).localeCompare(String(right.periodId)),
    );
    return {
      periodUnit: PERIOD_UNIT,
      partitions: normalizedPartitions,
    };
  }

  function splitLegacyState(rawState = {}, options = {}) {
    const source = ensureObject(rawState);
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : source.lastModified || source.createdAt || new Date().toISOString();
    const normalizedGuideState = ensureObject(source.guideState, null);
    const core = {
      projects: ensureArray(source.projects),
      todos: ensureArray(source.todos),
      checkinItems: ensureArray(source.checkinItems),
      yearlyGoals: ensureObject(source.yearlyGoals, {}),
      diaryCategories: ensureArray(source.diaryCategories),
      customThemes: ensureArray(source.customThemes),
      builtInThemeOverrides: ensureObject(source.builtInThemeOverrides, {}),
      selectedTheme:
        typeof source.selectedTheme === "string" && source.selectedTheme.trim()
          ? source.selectedTheme.trim()
          : "default",
      createdAt:
        typeof source.createdAt === "string" && source.createdAt
          ? source.createdAt
          : now,
      lastModified:
        typeof source.lastModified === "string" && source.lastModified
          ? source.lastModified
          : now,
      storagePath:
        typeof options.storagePath === "string"
          ? options.storagePath
          : typeof source.storagePath === "string"
            ? source.storagePath
            : null,
      storageDirectory:
        typeof options.storageDirectory === "string"
          ? options.storageDirectory
          : typeof source.storageDirectory === "string"
            ? source.storageDirectory
            : null,
      userDataPath:
        typeof options.userDataPath === "string"
          ? options.userDataPath
          : typeof source.userDataPath === "string"
            ? source.userDataPath
            : null,
      documentsPath:
        typeof options.documentsPath === "string"
          ? options.documentsPath
          : typeof source.documentsPath === "string"
            ? source.documentsPath
            : null,
      syncMeta: createBaseSyncMeta(source.syncMeta, {
        fileName:
          typeof options.fileName === "string" ? options.fileName : undefined,
      }),
    };
    if (normalizedGuideState) {
      core.guideState = normalizedGuideState;
    }
    const recurringPlans = [];
    const partitionMap = {};
    PARTITIONED_SECTIONS.forEach((section) => {
      partitionMap[section] = new Map();
      ensureArray(source[section]).forEach((item) => {
        if (section === "plans" && isRecurringPlan(item)) {
          recurringPlans.push(cloneValue(item));
          return;
        }
        const periodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
        if (!partitionMap[section].has(periodId)) {
          partitionMap[section].set(periodId, []);
        }
        partitionMap[section].get(periodId).push(cloneValue(item));
      });
    });
    const manifest = {
      formatVersion: FORMAT_VERSION,
      bundleMode: BUNDLE_MODE,
      createdAt: core.createdAt,
      lastModified: core.lastModified,
      sections: {
        core: {
          file: CORE_FILE_NAME,
        },
        plansRecurring: {
          file: RECURRING_PLANS_FILE_NAME,
          count: recurringPlans.length,
        },
      },
      legacyBackups: ensureArray(options.legacyBackups).slice(),
    };
    PARTITIONED_SECTIONS.forEach((section) => {
      manifest.sections[section] = createSectionManifest(section, partitionMap[section]);
    });
    return {
      manifest,
      core,
      recurringPlans,
      partitionMap,
    };
  }

  function buildLegacyStateFromBundle(bundle = {}) {
    const core = ensureObject(bundle.core, {});
    const manifest = ensureObject(bundle.manifest, {});
    const partitionMap = ensureObject(bundle.partitionMap, {});
    const nextState = createEmptyLegacyState({
      now: core.lastModified || core.createdAt,
      storagePath: core.storagePath,
      storageDirectory: core.storageDirectory,
      userDataPath: core.userDataPath,
      documentsPath: core.documentsPath,
      syncMeta: core.syncMeta,
    });
    CORE_SECTION_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(core, key)) {
        nextState[key] = cloneValue(core[key]);
      }
    });
    PARTITIONED_SECTIONS.forEach((section) => {
      const sectionPartitions = partitionMap[section];
      const items = [];
      if (sectionPartitions instanceof Map) {
        Array.from(sectionPartitions.values()).forEach((partitionItems) => {
          items.push(...ensureArray(partitionItems).map((item) => cloneValue(item)));
        });
      } else if (isPlainObject(sectionPartitions)) {
        Object.keys(sectionPartitions).forEach((periodId) => {
          items.push(
            ...ensureArray(sectionPartitions[periodId]).map((item) =>
              cloneValue(item),
            ),
          );
        });
      }
      nextState[section] = sortPartitionItems(section, items);
    });
    nextState.plans = sortPartitionItems("plans", [
      ...ensureArray(nextState.plans),
      ...ensureArray(bundle.recurringPlans).map((item) => cloneValue(item)),
    ]);
    if (!nextState.createdAt) {
      nextState.createdAt = manifest.createdAt || new Date().toISOString();
    }
    if (!nextState.lastModified) {
      nextState.lastModified = manifest.lastModified || nextState.createdAt;
    }
    SECTION_REQUIRED_ARRAY_KEYS.forEach((key) => {
      nextState[key] = ensureArray(nextState[key]);
    });
    nextState.customThemes = ensureArray(nextState.customThemes);
    nextState.yearlyGoals = ensureObject(nextState.yearlyGoals, {});
    nextState.builtInThemeOverrides = ensureObject(
      nextState.builtInThemeOverrides,
      {},
    );
    nextState.selectedTheme =
      typeof nextState.selectedTheme === "string" &&
      nextState.selectedTheme.trim()
        ? nextState.selectedTheme.trim()
        : "default";
    nextState.syncMeta = createBaseSyncMeta(nextState.syncMeta);
    return nextState;
  }

  function getPeriodIdsForRange(startDate, endDate) {
    const start = normalizeDateInput(startDate);
    const end = normalizeDateInput(endDate);
    if (!start || !end) {
      return [];
    }
    const lower = start.getTime() <= end.getTime() ? start : end;
    const upper = start.getTime() <= end.getTime() ? end : start;
    const cursor = new Date(lower.getFullYear(), lower.getMonth(), 1);
    const target = new Date(upper.getFullYear(), upper.getMonth(), 1);
    const results = [];
    while (cursor.getTime() <= target.getTime()) {
      results.push(formatDateToPeriodId(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return results;
  }

  function normalizeRangeInput(scope = {}) {
    const source = ensureObject(scope, {});
    const periodIds = Array.isArray(source.periodIds)
      ? source.periodIds
          .map((periodId) => normalizePeriodId(periodId))
          .filter(Boolean)
      : [];
    if (periodIds.length) {
      return {
        periodIds,
        startDate: null,
        endDate: null,
      };
    }
    const startDate = normalizeDateKey(source.startDate || source.start);
    const endDate = normalizeDateKey(source.endDate || source.end);
    return {
      periodIds:
        startDate && endDate ? getPeriodIdsForRange(startDate, endDate) : [],
      startDate: startDate || null,
      endDate: endDate || null,
    };
  }

  function normalizePartitionEnvelope(section, rawEnvelope = {}, fallbackPeriodId = "") {
    const source = ensureObject(rawEnvelope, {});
    const periodId =
      normalizePeriodId(source.periodId) ||
      normalizePeriodId(fallbackPeriodId) ||
      UNDATED_PERIOD_ID;
    const items = ensureArray(source.items);
    return createPartitionEnvelope(section, periodId, items, {
      fingerprint:
        typeof source.fingerprint === "string" ? source.fingerprint : "",
    });
  }

  function normalizeManifest(rawManifest = {}, options = {}) {
    const source = ensureObject(rawManifest, {});
    const now =
      typeof options.now === "string" && options.now
        ? options.now
        : new Date().toISOString();
    const sections = ensureObject(source.sections, {});
    const manifest = {
      formatVersion: FORMAT_VERSION,
      bundleMode: BUNDLE_MODE,
      createdAt:
        typeof source.createdAt === "string" && source.createdAt
          ? source.createdAt
          : now,
      lastModified:
        typeof source.lastModified === "string" && source.lastModified
          ? source.lastModified
          : now,
      sections: {
        core: {
          file:
            typeof sections.core?.file === "string" && sections.core.file
              ? sections.core.file
              : CORE_FILE_NAME,
        },
        plansRecurring: {
          file:
            typeof sections.plansRecurring?.file === "string" &&
            sections.plansRecurring.file
              ? sections.plansRecurring.file
              : RECURRING_PLANS_FILE_NAME,
          count: Number.isFinite(sections.plansRecurring?.count)
            ? Math.max(0, Number(sections.plansRecurring.count))
            : 0,
        },
      },
      legacyBackups: ensureArray(source.legacyBackups),
    };
    PARTITIONED_SECTIONS.forEach((section) => {
      const rawSection = ensureObject(sections[section], {});
      const partitions = ensureArray(rawSection.partitions)
        .map((partition) => ({
          periodId: normalizePeriodId(partition?.periodId),
          file:
            typeof partition?.file === "string" && partition.file
              ? partition.file
              : "",
          count: Number.isFinite(partition?.count)
            ? Math.max(0, Number(partition.count))
            : 0,
          minDate:
            typeof partition?.minDate === "string" && partition.minDate
              ? partition.minDate
              : null,
          maxDate:
            typeof partition?.maxDate === "string" && partition.maxDate
              ? partition.maxDate
              : null,
          fingerprint:
            typeof partition?.fingerprint === "string" && partition.fingerprint
              ? partition.fingerprint
              : "",
        }))
        .filter((partition) => partition.periodId && partition.file);
      manifest.sections[section] = {
        periodUnit: PERIOD_UNIT,
        partitions,
      };
    });
    return manifest;
  }

  function buildPartitionMergeKey(section, item = {}) {
    const source = ensureObject(item, {});
    if (source.id) {
      return `id:${String(source.id)}`;
    }
    switch (section) {
      case "records":
        return [
          source.projectId || "",
          source.name || "",
          source.startTime || "",
          source.endTime || "",
          source.timestamp || "",
          source.spendtime || "",
        ].join("|");
      case "diaryEntries":
        return [source.date || "", source.title || "", source.updatedAt || ""].join("|");
      case "dailyCheckins":
        return [source.itemId || "", source.date || ""].join("|");
      case "checkins":
        return [source.todoId || "", source.time || "", source.message || ""].join("|");
      case "plans":
        return [
          source.name || "",
          source.date || "",
          source.startTime || "",
          source.endTime || "",
          source.repeat || "",
        ].join("|");
      default:
        return JSON.stringify(source);
    }
  }

  function mergePartitionItems(section, existingItems = [], incomingItems = [], mode = "replace") {
    if (mode !== "merge") {
      return sortPartitionItems(section, incomingItems);
    }
    const merged = new Map();
    sortPartitionItems(section, existingItems).forEach((item) => {
      merged.set(buildPartitionMergeKey(section, item), cloneValue(item));
    });
    sortPartitionItems(section, incomingItems).forEach((item) => {
      merged.set(buildPartitionMergeKey(section, item), cloneValue(item));
    });
    return sortPartitionItems(section, Array.from(merged.values()));
  }

  function validateItemsForPeriod(section, periodId, items = []) {
    const normalizedPeriodId = normalizePeriodId(periodId) || UNDATED_PERIOD_ID;
    return ensureArray(items).every((item) => {
      const itemPeriodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
      return itemPeriodId === normalizedPeriodId;
    });
  }

  function groupItemsByPeriod(section, items = []) {
    const grouped = new Map();
    ensureArray(items).forEach((item) => {
      const periodId = getPeriodIdForSectionItem(section, item) || UNDATED_PERIOD_ID;
      if (!grouped.has(periodId)) {
        grouped.set(periodId, []);
      }
      grouped.get(periodId).push(cloneValue(item));
    });
    return grouped;
  }

  return {
    FORMAT_VERSION,
    BUNDLE_MODE,
    PERIOD_UNIT,
    UNDATED_PERIOD_ID,
    CORE_FILE_NAME,
    MANIFEST_FILE_NAME,
    RECURRING_PLANS_FILE_NAME,
    PROJECT_DURATION_CACHE_VERSION,
    PROJECT_DURATION_CACHE_VERSION_KEY,
    PROJECT_DIRECT_DURATION_KEY,
    PROJECT_TOTAL_DURATION_KEY,
    PARTITIONED_SECTIONS,
    CORE_SECTION_KEYS,
    SECTION_DIRECTORY_MAP,
    cloneValue,
    ensureArray,
    ensureObject,
    normalizeDurationMs,
    normalizeDateInput,
    normalizeDateKey,
    normalizePeriodId,
    normalizeRangeInput,
    getPeriodIdsForRange,
    getSectionItemDate,
    getPeriodIdForSectionItem,
    getPartitionRelativePath,
    parseSpendTimeToMs,
    getRecordDurationMs,
    normalizeProjectDurationCache,
    hasValidProjectDurationCache,
    projectsHaveValidDurationCache,
    repairProjectHierarchy,
    attachProjectIdsToRecords,
    recalculateProjectDurationTotals,
    rebuildProjectDurationCaches,
    reconcileProjectDurationCaches,
    applyProjectRecordDurationChanges,
    createBaseSyncMeta,
    createEmptyLegacyState,
    createEmptyBundle,
    createPartitionEnvelope,
    normalizePartitionEnvelope,
    normalizeManifest,
    splitLegacyState,
    buildLegacyStateFromBundle,
    buildPartitionFingerprint,
    buildPartitionMergeKey,
    mergePartitionItems,
    validateItemsForPeriod,
    groupItemsByPeriod,
    isRecurringPlan,
    sortPartitionItems,
  };
});
