const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const guideBundle = require(path.join(__dirname, "pages", "guide-bundle.js"));
const bundleHelper = require(path.join(__dirname, "pages", "storage-bundle.js"));
const externalImportHelper = require(path.join(
  __dirname,
  "pages",
  "external-import.js",
));

let archiver = null;
let extractZip = null;
let initSqlJs = null;
try { archiver = require("archiver"); } catch (error) { archiver = null; }
try { extractZip = require("extract-zip"); } catch (error) { extractZip = null; }
try { initSqlJs = require("sql.js/dist/sql-wasm.js"); } catch (error) { initSqlJs = null; }

const SHARED_ARRAY_KEYS = Object.freeze([
  "projects",
  "records",
  "plans",
  "todos",
  "checkinItems",
  "dailyCheckins",
  "checkins",
  "diaryEntries",
  "diaryCategories",
  "customThemes",
]);
const DEFAULT_CHANGED_SECTIONS = Object.freeze([
  "projects",
  "records",
  "plans",
  "todos",
  "checkinItems",
  "dailyCheckins",
  "checkins",
  "yearlyGoals",
  "diaryEntries",
  "diaryCategories",
  "guideState",
  "customThemes",
  "builtInThemeOverrides",
  "selectedTheme",
  "plansRecurring",
]);
const PRECISE_CORE_SECTION_KEYS = new Set([
  "projects",
  "todos",
  "checkinItems",
  "yearlyGoals",
  "diaryCategories",
  "guideState",
  "customThemes",
  "builtInThemeOverrides",
  "selectedTheme",
]);
const DIFF_IMPORT_CORE_KEYS = Object.freeze([
  "todos",
  "checkinItems",
  "yearlyGoals",
  "diaryCategories",
]);
const WATCH_DEBOUNCE_MS = 180;
const AUTO_BACKUP_UNITS = Object.freeze({
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
});
const DEFAULT_AUTO_BACKUP_SETTINGS = Object.freeze({
  enabled: false,
  intervalValue: 1,
  intervalUnit: "day",
  maxBackups: 7,
});
const EMPTY_AUTO_BACKUP_STATE = Object.freeze({
  lastAttemptAt: null,
  lastError: null,
  lastBackedUpFingerprint: "",
  latestBackupFile: null,
  latestBackupPath: null,
  latestBackupAt: null,
  latestBackupSize: 0,
  targetBackupDirectory: null,
});
const SIDECAR_PAGE_KEYS = Object.freeze([
  "index",
  "plan",
  "todo",
  "diary",
  "stats",
  "settings",
]);
const RECURRING_PLAN_PERIOD_ID = "__recurring__";
const RECORD_PARTITION_PATCH_DIR_SUFFIX = ".ops";
const RECORD_PARTITION_PATCH_COMPACT_THRESHOLD = 24;
const RECORD_PARTITION_PATCH_COMPACT_DELAY_MS = 1200;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeChangedSections(changedSections = []) {
  return Array.from(
    new Set(
      (Array.isArray(changedSections) ? changedSections : [])
        .map((section) => String(section || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeChangedPeriods(changedPeriods = {}) {
  const source =
    changedPeriods && typeof changedPeriods === "object" ? changedPeriods : {};
  const normalized = {};
  Object.keys(source).forEach((section) => {
    const normalizedSection = String(section || "").trim();
    if (!normalizedSection) {
      return;
    }
    const periodIds = Array.from(
      new Set(
        (Array.isArray(source[section]) ? source[section] : [])
          .map((periodId) => String(periodId || "").trim())
          .filter(Boolean),
      ),
    );
    if (periodIds.length) {
      normalized[normalizedSection] = periodIds;
    }
  });
  return normalized;
}

function mergeChangedPeriods(...maps) {
  const merged = {};
  maps.forEach((entry) => {
    const normalizedEntry = normalizeChangedPeriods(entry);
    Object.keys(normalizedEntry).forEach((section) => {
      merged[section] = Array.from(
        new Set([...(merged[section] || []), ...normalizedEntry[section]]),
      );
    });
  });
  return merged;
}

function normalizeRebuildPeriodIds(periodIds = []) {
  return Array.from(
    new Set(
      (Array.isArray(periodIds) ? periodIds : [])
        .map((periodId) => String(periodId || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => String(left).localeCompare(String(right)));
}

function buildSqlPlaceholders(count = 0) {
  return Array.from(
    { length: Math.max(0, Number(count) || 0) },
    () => "?",
  ).join(", ");
}

function mergeSidecarRebuildRequest(current = {}, next = {}) {
  const safeCurrent = isPlainObject(current) ? current : {};
  const safeNext = isPlainObject(next) ? next : {};
  const currentChangedSections = normalizeChangedSections(safeCurrent.changedSections);
  const nextChangedSections = normalizeChangedSections(safeNext.changedSections);
  return {
    fullRebuild: safeCurrent.fullRebuild === true || safeNext.fullRebuild === true,
    sourceFingerprint:
      typeof safeNext?.sourceFingerprint === "string" && safeNext.sourceFingerprint.trim()
        ? safeNext.sourceFingerprint.trim()
        : typeof safeCurrent?.sourceFingerprint === "string" &&
            safeCurrent.sourceFingerprint.trim()
          ? safeCurrent.sourceFingerprint.trim()
          : "",
    changedSections: normalizeChangedSections([
      ...currentChangedSections,
      ...nextChangedSections,
    ]),
    changedPeriods: mergeChangedPeriods(
      safeCurrent.changedPeriods || {},
      safeNext.changedPeriods || {},
    ),
  };
}

function inferChangedSectionsFromCorePatch(partialCore = {}) {
  const source =
    partialCore && typeof partialCore === "object" && !Array.isArray(partialCore)
      ? partialCore
      : {};
  const sections = new Set();

  Object.keys(source).forEach((key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return;
    }
    if (PRECISE_CORE_SECTION_KEYS.has(normalizedKey)) {
      sections.add(normalizedKey);
      return;
    }
    if (normalizedKey === "recurringPlans") {
      sections.add("plansRecurring");
      return;
    }
    if (normalizedKey === "storagePath" || normalizedKey === "storageDirectory" || normalizedKey === "userDataPath" || normalizedKey === "documentsPath" || normalizedKey === "createdAt" || normalizedKey === "lastModified" || normalizedKey === "syncMeta") {
      sections.add("core");
      return;
    }
    if (SHARED_ARRAY_KEYS.includes(normalizedKey) || normalizedKey === "builtInThemeOverrides" || normalizedKey === "selectedTheme" || normalizedKey === "guideState" || normalizedKey === "yearlyGoals") {
      sections.add(normalizedKey);
      return;
    }
    sections.add("core");
  });

  return sections.size ? Array.from(sections) : ["core"];
}

function normalizeJournalOperations(operations = []) {
  return (Array.isArray(operations) ? operations : [])
    .map((operation) => {
      const kind = String(operation?.kind || "").trim();
      if (kind === "replaceCoreState") {
        return {
          kind,
          partialCore:
            operation?.partialCore &&
            typeof operation.partialCore === "object" &&
            !Array.isArray(operation.partialCore)
              ? bundleHelper.cloneValue(operation.partialCore)
              : {},
        };
      }
      if (kind === "saveSectionRange") {
        const section = String(operation?.section || "").trim();
        if (!section) {
          return null;
        }
        return {
          kind,
          section,
          payload:
            operation?.payload &&
            typeof operation.payload === "object" &&
            !Array.isArray(operation.payload)
              ? bundleHelper.cloneValue(operation.payload)
              : {},
        };
      }
      if (kind === "replaceRecurringPlans") {
        return {
          kind,
          items: bundleHelper.cloneValue(
            Array.isArray(operation?.items) ? operation.items : [],
          ),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function coalesceJournalOperations(operations = []) {
  const orderedKeys = [];
  const operationsByKey = new Map();
  normalizeJournalOperations(operations).forEach((operation) => {
    let key = "";
    let nextOperation = operation;
    if (operation.kind === "replaceCoreState") {
      key = "replaceCoreState";
      const existing = operationsByKey.get(key);
      nextOperation = {
        kind: "replaceCoreState",
        partialCore: {
          ...(existing?.partialCore &&
          typeof existing.partialCore === "object" &&
          !Array.isArray(existing.partialCore)
            ? existing.partialCore
            : {}),
          ...(operation?.partialCore &&
          typeof operation.partialCore === "object" &&
          !Array.isArray(operation.partialCore)
            ? operation.partialCore
            : {}),
        },
      };
    } else if (operation.kind === "saveSectionRange") {
      const periodId = String(operation?.payload?.periodId || "").trim();
      key = `saveSectionRange:${operation.section}:${periodId}`;
      nextOperation = {
        kind: "saveSectionRange",
        section: operation.section,
        payload: bundleHelper.cloneValue(operation.payload || {}),
      };
    } else if (operation.kind === "replaceRecurringPlans") {
      key = "replaceRecurringPlans";
      nextOperation = {
        kind: "replaceRecurringPlans",
        items: bundleHelper.cloneValue(operation.items || []),
      };
    }
    if (!key) {
      return;
    }
    if (!operationsByKey.has(key)) {
      orderedKeys.push(key);
    }
    operationsByKey.set(key, nextOperation);
  });
  return orderedKeys
    .map((key) => operationsByKey.get(key))
    .filter(Boolean);
}

function collectJournalMetadata(operations = []) {
  const changedSections = [];
  let changedPeriods = {};
  coalesceJournalOperations(operations).forEach((operation) => {
    if (operation.kind === "replaceCoreState") {
      changedSections.push(
        ...inferChangedSectionsFromCorePatch(operation.partialCore),
      );
      return;
    }
    if (operation.kind === "saveSectionRange") {
      changedSections.push(operation.section);
      const periodId = String(operation?.payload?.periodId || "").trim();
      if (periodId) {
        changedPeriods = mergeChangedPeriods(changedPeriods, {
          [operation.section]: [periodId],
        });
      }
      return;
    }
    if (operation.kind === "replaceRecurringPlans") {
      changedSections.push("plansRecurring");
    }
  });
  return {
    changedSections: normalizeChangedSections(changedSections),
    changedPeriods: normalizeChangedPeriods(changedPeriods),
  };
}

function buildJournalResult(operations = [], metadata = {}, extra = {}) {
  const normalizedOperations = coalesceJournalOperations(operations);
  const normalizedMetadata = collectJournalMetadata(normalizedOperations);
  const changedSections =
    normalizedMetadata.changedSections.length ||
    Object.keys(normalizedMetadata.changedPeriods).length
      ? normalizedMetadata.changedSections
      : normalizeChangedSections(metadata.changedSections);
  const changedPeriods =
    Object.keys(normalizedMetadata.changedPeriods).length
      ? normalizedMetadata.changedPeriods
      : normalizeChangedPeriods(metadata.changedPeriods);
  return {
    ok: true,
    operationCount: normalizedOperations.length,
    changedSections,
    changedPeriods,
    ...extra,
  };
}

function addMonthOffsetToPeriodId(periodId, monthOffset = 0) {
  const normalized = String(periodId || "").trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return "";
  }
  const [yearText, monthText] = normalized.split("-");
  const cursor = new Date(
    Number.parseInt(yearText, 10),
    Number.parseInt(monthText, 10) - 1,
    1,
  );
  if (Number.isNaN(cursor.getTime())) {
    return "";
  }
  cursor.setMonth(cursor.getMonth() + Math.round(Number(monthOffset) || 0));
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
}

function expandRecordScopePeriodIds(range = {}, rawScope = {}) {
  const normalizedPeriodIds = Array.isArray(range?.periodIds)
    ? range.periodIds
        .map((periodId) => String(periodId || "").trim())
        .filter(Boolean)
    : [];
  const periodIds = new Set(normalizedPeriodIds);

  if (periodIds.size > 0) {
    normalizedPeriodIds.forEach((periodId) => {
      const previousPeriodId = addMonthOffsetToPeriodId(periodId, -1);
      const nextPeriodId = addMonthOffsetToPeriodId(periodId, 1);
      if (previousPeriodId) {
        periodIds.add(previousPeriodId);
      }
      if (nextPeriodId) {
        periodIds.add(nextPeriodId);
      }
    });
  } else {
    const startValue = rawScope?.startDate || rawScope?.start || null;
    const endValue = rawScope?.endDate || rawScope?.end || null;
    const startDate = bundleHelper.normalizeDateInput(startValue);
    const endDate = bundleHelper.normalizeDateInput(endValue);
    if (startDate && endDate) {
      const lower = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
      const upper = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
      const cursor = new Date(lower.getFullYear(), lower.getMonth() - 1, 1);
      const target = new Date(upper.getFullYear(), upper.getMonth() + 1, 1);
      while (cursor.getTime() <= target.getTime()) {
        periodIds.add(
          `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        );
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  return Array.from(periodIds).sort((left, right) => left.localeCompare(right));
}

function recordOverlapsScope(record = {}, rawScope = {}) {
  const startValue = rawScope?.startDate || rawScope?.start || null;
  const endValue = rawScope?.endDate || rawScope?.end || null;
  const rangeStart = bundleHelper.normalizeDateInput(startValue);
  const rangeEnd = bundleHelper.normalizeDateInput(endValue);
  if (!rangeStart || !rangeEnd) {
    return true;
  }

  const lower = rangeStart.getTime() <= rangeEnd.getTime() ? rangeStart : rangeEnd;
  const upper = rangeStart.getTime() <= rangeEnd.getTime() ? rangeEnd : rangeStart;
  lower.setHours(0, 0, 0, 0);
  upper.setHours(23, 59, 59, 999);
  const upperExclusive = upper.getTime() + 1;

  const rawStart =
    bundleHelper.normalizeDateInput(record?.startTime) ||
    bundleHelper.normalizeDateInput(record?.timestamp) ||
    bundleHelper.normalizeDateInput(record?.endTime);
  const rawEnd =
    bundleHelper.normalizeDateInput(record?.endTime) ||
    bundleHelper.normalizeDateInput(record?.timestamp) ||
    bundleHelper.normalizeDateInput(record?.startTime);

  if (!rawStart && !rawEnd) {
    return false;
  }

  let startTime = rawStart ? rawStart.getTime() : rawEnd.getTime();
  let endTime = rawEnd ? rawEnd.getTime() : rawStart.getTime();
  if (endTime < startTime) {
    const swapped = startTime;
    startTime = endTime;
    endTime = swapped;
  }

  return endTime > lower.getTime() && startTime < upperExclusive;
}

class StorageManager {
  constructor(app) {
    this.app = app;
    this.fileName = "controler-data.json";
    this.userDataPath = app.getPath("userData");
    this.documentsPath = app.getPath("documents");
    this.legacyStoragePath = path.join(this.userDataPath, "storage.json");
    this.configPath = path.join(this.userDataPath, "storage-config.json");
    this.sidecarBaseDir = path.join(this.userDataPath, "runtime-sidecar");
    this.sidecarSchemaVersion = 2;
    this.defaultStorageDirectory = path.join(this.documentsPath, app.getName(), "app_data");
    this.storagePath = this.resolveStoragePathFromConfig();
    this.sidecarSqliteModule = null;
    this.sidecarSqliteInitPromise = null;
    this.sidecarSqliteInitError = null;
    this.sidecarDatabaseCache = new Map();
    this.sidecarRebuildStateByNamespace = new Map();
    this.cachedStorageSnapshot = null;
    this.pendingSnapshot = null;
    this.pendingWriteReason = "";
    this.pendingWriteChangedSections = [];
    this.pendingWriteChangedPeriods = {};
    this.pendingWriteCount = 0;
    this.flushInFlight = null;
    this.changeListener = null;
    this.watchHandle = null;
    this.watchManifestPath = null;
    this.pendingExternalCheckTimer = null;
    this.lastKnownFileVersion = null;
    this.lastExternalChangeAt = null;
    this.autoBackupInFlight = null;
    this.recordPartitionCompactionTimers = new Map();
    this.recordPartitionCompactions = new Map();
    this.ensureStorageReady();
    void this.initializeSidecarSqliteRuntime()
      .then(() =>
        this.requestSidecarIndexRebuild(this.storagePath, {
          fullRebuild: true,
        }),
      )
      .catch(() => {});
  }

  createEmptyStorageData() {
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
      createdAt: new Date().toISOString(),
      lastModified: null,
      syncMeta: {
        mode: bundleHelper.BUNDLE_MODE,
        fileName: this.getBundleSyncFileName(),
        autoSyncEnabled: true,
        lastSavedAt: null,
        lastTriggeredAt: null,
        lastFlushStartedAt: null,
        lastFlushCompletedAt: null,
        pendingWriteCount: 0,
      },
    };
  }

  createDefaultStorageData() {
    const now = new Date();
    const defaults = this.createEmptyStorageData();
    const guideSeed = guideBundle.createGuideSeed(now);
    return {
      ...defaults,
      diaryEntries: Array.isArray(guideSeed.diaryEntries) ? guideSeed.diaryEntries : defaults.diaryEntries,
      diaryCategories: Array.isArray(guideSeed.diaryCategories) ? guideSeed.diaryCategories : defaults.diaryCategories,
      guideState:
        guideSeed.guideState &&
        typeof guideSeed.guideState === "object" &&
        !Array.isArray(guideSeed.guideState)
          ? guideSeed.guideState
          : guideBundle.getDefaultGuideState(),
      createdAt: now.toISOString(),
    };
  }

  getCurrentFileName(storagePath = this.storagePath) {
    const target = typeof storagePath === "string" && storagePath.trim()
      ? storagePath
      : path.join(this.defaultStorageDirectory, this.fileName);
    return path.basename(target) || this.fileName;
  }

  getBundleSyncFileName() { return bundleHelper.MANIFEST_FILE_NAME; }

  getBundleDisplayPath(root = this.getBundleRoot()) {
    return path.join(root, this.getBundleSyncFileName());
  }

  getAutoBackupDirectory(root = this.getBundleRoot()) {
    return path.join(root, "backups");
  }

  normalizeConfiguredStoragePath(storagePath) {
    const rawPath = String(storagePath || "").trim();
    if (!rawPath) {
      return path.join(this.defaultStorageDirectory, this.fileName);
    }
    const resolvedPath = path.resolve(rawPath);
    try {
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        return path.join(resolvedPath, this.fileName);
      }
    } catch (error) {
      console.error("读取存储配置目标失败:", error);
    }
    if (!path.extname(resolvedPath)) {
      return path.join(resolvedPath, this.fileName);
    }
    const baseName = path.basename(resolvedPath).toLowerCase();
    if (baseName === this.fileName.toLowerCase()) {
      return resolvedPath;
    }
    if (baseName === this.getBundleSyncFileName().toLowerCase()) {
      return path.join(path.dirname(resolvedPath), this.fileName);
    }
    return path.join(path.dirname(resolvedPath), this.fileName);
  }

  normalizeStorageFilePath(filePath) {
    const rawPath = String(filePath || "").trim();
    if (!rawPath) throw new Error("存储文件路径不能为空");
    let targetPath = path.resolve(rawPath);
    const parsed = path.parse(targetPath);
    if (!parsed.ext) targetPath += ".json";
    else if (parsed.ext.toLowerCase() !== ".json") throw new Error("存储文件必须是 .json 文件");
    return targetPath;
  }

  normalizeStorageData(data = {}, options = {}) {
    const defaults = this.createEmptyStorageData();
    const source = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    const normalizedGuideState =
      source.guideState &&
      typeof source.guideState === "object" &&
      !Array.isArray(source.guideState)
        ? guideBundle.normalizeGuideState(source.guideState)
        : null;
    const shouldSeedGuideBundle = guideBundle.shouldSeedGuideBundle(
      normalizedGuideState
        ? { ...source, guideState: normalizedGuideState }
        : source,
    );
    const storagePath = typeof options.storagePath === "string" && options.storagePath.trim()
      ? options.storagePath
      : this.getBundleDisplayPath(this.getBundleRoot(this.storagePath));
    const next = { ...defaults };
    SHARED_ARRAY_KEYS.forEach((key) => { next[key] = Array.isArray(source[key]) ? source[key] : []; });
    next.yearlyGoals = source.yearlyGoals && typeof source.yearlyGoals === "object" && !Array.isArray(source.yearlyGoals)
      ? source.yearlyGoals
      : {};
    next.builtInThemeOverrides =
      source.builtInThemeOverrides &&
      typeof source.builtInThemeOverrides === "object" &&
      !Array.isArray(source.builtInThemeOverrides)
        ? source.builtInThemeOverrides
        : {};
    next.selectedTheme =
      typeof source.selectedTheme === "string" && source.selectedTheme.trim()
        ? source.selectedTheme.trim()
        : "default";
    if (shouldSeedGuideBundle) {
      next.diaryEntries = guideBundle.buildGuideDiaryEntries();
      next.diaryCategories = [];
      next.guideState = guideBundle.getDefaultGuideState();
    } else if (normalizedGuideState) {
      next.guideState = normalizedGuideState;
    }
    if (!shouldSeedGuideBundle && typeof guideBundle.synchronizeGuideDiaryEntries === "function") {
      next.diaryEntries = guideBundle.synchronizeGuideDiaryEntries(
        next.diaryEntries,
        new Date(),
        normalizedGuideState,
      );
    }
    next.projects = bundleHelper.rebuildProjectDurationCaches(
      next.projects,
      next.records,
    );
    next.createdAt = typeof source.createdAt === "string" && source.createdAt ? source.createdAt : defaults.createdAt;
    next.lastModified = typeof source.lastModified === "string" && source.lastModified ? source.lastModified : next.createdAt;
    next.storagePath = storagePath;
    next.storageDirectory = path.dirname(storagePath);
    next.userDataPath = this.userDataPath;
    next.documentsPath = this.documentsPath;
    next.syncMeta = source.syncMeta && typeof source.syncMeta === "object"
      ? { ...defaults.syncMeta, ...source.syncMeta }
      : { ...defaults.syncMeta };
    next.syncMeta.mode = bundleHelper.BUNDLE_MODE;
    next.syncMeta.fileName = this.getBundleSyncFileName();
    next.syncMeta.autoSyncEnabled = true;
    next.syncMeta.pendingWriteCount = Number.isFinite(options.pendingWriteCount)
      ? Math.max(0, Number(options.pendingWriteCount))
      : Number.isFinite(next.syncMeta.pendingWriteCount)
        ? Math.max(0, Number(next.syncMeta.pendingWriteCount))
        : 0;
    const now = new Date().toISOString();
    if (options.touchModified || !next.lastModified) next.lastModified = now;
    if (options.touchSyncSave) {
      next.syncMeta.lastSavedAt = now;
      next.syncMeta.lastTriggeredAt = now;
    }
    ["lastSavedAt", "lastTriggeredAt", "lastFlushStartedAt", "lastFlushCompletedAt"].forEach((key) => {
      if (typeof next.syncMeta[key] !== "string" || !next.syncMeta[key]) next.syncMeta[key] = null;
    });
    return next;
  }

  preserveThemeStateIfMissing(importedState = {}) {
    const source =
      importedState && typeof importedState === "object" && !Array.isArray(importedState)
        ? { ...importedState }
        : {};
    const currentState = this.loadStorageData();

    if (!Object.prototype.hasOwnProperty.call(source, "customThemes")) {
      source.customThemes = Array.isArray(currentState?.customThemes)
        ? JSON.parse(JSON.stringify(currentState.customThemes))
        : [];
    }

    if (!Object.prototype.hasOwnProperty.call(source, "builtInThemeOverrides")) {
      source.builtInThemeOverrides =
        currentState?.builtInThemeOverrides &&
        typeof currentState.builtInThemeOverrides === "object" &&
        !Array.isArray(currentState.builtInThemeOverrides)
          ? JSON.parse(JSON.stringify(currentState.builtInThemeOverrides))
          : {};
    }

    if (
      !(
        typeof source.selectedTheme === "string" &&
        source.selectedTheme.trim()
      )
    ) {
      source.selectedTheme =
        typeof currentState?.selectedTheme === "string" &&
        currentState.selectedTheme.trim()
          ? currentState.selectedTheme.trim()
          : "default";
    }

    return source;
  }

  normalizeAutoBackupSettings(settings = {}) {
    const source = settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {};
    const intervalUnit = Object.prototype.hasOwnProperty.call(AUTO_BACKUP_UNITS, source.intervalUnit)
      ? source.intervalUnit
      : DEFAULT_AUTO_BACKUP_SETTINGS.intervalUnit;
    return {
      enabled: source.enabled === true,
      intervalValue: Number.isFinite(source.intervalValue)
        ? Math.max(1, Math.floor(Number(source.intervalValue)))
        : DEFAULT_AUTO_BACKUP_SETTINGS.intervalValue,
      intervalUnit,
      maxBackups: Number.isFinite(source.maxBackups)
        ? Math.max(1, Math.floor(Number(source.maxBackups)))
        : DEFAULT_AUTO_BACKUP_SETTINGS.maxBackups,
    };
  }

  normalizeAutoBackupState(state = {}) {
    const source = state && typeof state === "object" && !Array.isArray(state)
      ? state
      : {};
    const next = { ...EMPTY_AUTO_BACKUP_STATE };
    [
      "lastAttemptAt",
      "lastError",
      "lastBackedUpFingerprint",
      "latestBackupFile",
      "latestBackupPath",
      "latestBackupAt",
      "targetBackupDirectory",
    ].forEach((key) => {
      if (typeof source[key] === "string" && source[key].trim()) {
        next[key] = source[key].trim();
      }
    });
    next.latestBackupSize = Number.isFinite(source.latestBackupSize)
      ? Math.max(0, Number(source.latestBackupSize))
      : 0;
    return next;
  }

  buildNormalizedConfig(rawConfig = {}) {
    const source = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? rawConfig
      : {};
    const autoBackupSource =
      source.autoBackup && typeof source.autoBackup === "object" && !Array.isArray(source.autoBackup)
        ? source.autoBackup
        : {};
    const settingsSource =
      autoBackupSource.settings && typeof autoBackupSource.settings === "object"
        ? autoBackupSource.settings
        : autoBackupSource;
    const stateSource =
      autoBackupSource.state && typeof autoBackupSource.state === "object"
        ? autoBackupSource.state
        : source.autoBackupState && typeof source.autoBackupState === "object"
          ? source.autoBackupState
          : autoBackupSource;
    const storagePath = typeof source.storagePath === "string" && source.storagePath.trim()
      ? this.normalizeConfiguredStoragePath(source.storagePath)
      : this.normalizeConfiguredStoragePath(this.storagePath);
    return {
      storagePath,
      autoBackup: {
        settings: this.normalizeAutoBackupSettings(settingsSource),
        state: this.normalizeAutoBackupState(stateSource),
      },
    };
  }

  readConfig() {
    try {
      if (!fs.existsSync(this.configPath)) return {};
      return this.buildNormalizedConfig(JSON.parse(fs.readFileSync(this.configPath, "utf8")) || {});
    } catch (error) {
      console.error("读取存储配置失败:", error);
      return {};
    }
  }

  writeConfig(config = {}) {
    try {
      const current = this.readConfig();
      const nextRaw = config && typeof config === "object" && !Array.isArray(config) ? config : {};
      const normalizedStoragePath = this.normalizeConfiguredStoragePath(nextRaw.storagePath || current.storagePath || this.storagePath);
      const root = this.getBundleRoot(normalizedStoragePath);
      const incomingAutoBackup =
        nextRaw.autoBackup && typeof nextRaw.autoBackup === "object" && !Array.isArray(nextRaw.autoBackup)
          ? nextRaw.autoBackup
          : {};
      const nextConfig = this.buildNormalizedConfig({
        storagePath: this.getBundleDisplayPath(root),
        autoBackup: {
          settings:
            incomingAutoBackup.settings && typeof incomingAutoBackup.settings === "object"
              ? incomingAutoBackup.settings
              : current?.autoBackup?.settings || DEFAULT_AUTO_BACKUP_SETTINGS,
          state:
            incomingAutoBackup.state && typeof incomingAutoBackup.state === "object"
              ? incomingAutoBackup.state
              : current?.autoBackup?.state || EMPTY_AUTO_BACKUP_STATE,
        },
      });
      fs.ensureDirSync(path.dirname(this.configPath));
      fs.writeFileSync(this.configPath, JSON.stringify({
        storagePath: nextConfig.storagePath,
        autoBackup: nextConfig.autoBackup,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
      return true;
    } catch (error) {
      console.error("写入存储配置失败:", error);
      return false;
    }
  }

  resolveStoragePathFromConfig() {
    const config = this.readConfig();
    if (typeof config.storagePath === "string" && config.storagePath.trim()) {
      return this.normalizeConfiguredStoragePath(config.storagePath);
    }
    return path.join(this.defaultStorageDirectory, this.fileName);
  }

  getAutoBackupSettings() {
    return this.normalizeAutoBackupSettings(this.readConfig()?.autoBackup?.settings || {});
  }

  getStoredAutoBackupState() {
    return this.normalizeAutoBackupState(this.readConfig()?.autoBackup?.state || {});
  }

  getEffectiveAutoBackupState(root = this.getBundleRoot(this.storagePath)) {
    const state = this.getStoredAutoBackupState();
    const backupDirectory = this.getAutoBackupDirectory(root);
    if (state.targetBackupDirectory && path.resolve(state.targetBackupDirectory) === path.resolve(backupDirectory)) {
      return state;
    }
    return { ...EMPTY_AUTO_BACKUP_STATE };
  }

  getBundleRoot(storagePath = this.storagePath) {
    return path.dirname(this.normalizeConfiguredStoragePath(storagePath));
  }
  getLegacyFilePath(storagePath = this.storagePath) {
    return this.normalizeConfiguredStoragePath(storagePath);
  }
  getManifestPath(root = this.getBundleRoot()) { return path.join(root, bundleHelper.MANIFEST_FILE_NAME); }
  getCorePath(root = this.getBundleRoot()) { return path.join(root, bundleHelper.CORE_FILE_NAME); }
  getRecurringPlansPath(root = this.getBundleRoot()) { return path.join(root, bundleHelper.RECURRING_PLANS_FILE_NAME); }
  getSidecarNamespaceKey(storagePath = this.storagePath) {
    const root = this.getBundleRoot(storagePath);
    return crypto.createHash("sha1").update(path.resolve(root)).digest("hex");
  }
  getSidecarDirectory(storagePath = this.storagePath) {
    return path.join(this.sidecarBaseDir, this.getSidecarNamespaceKey(storagePath));
  }
  getSidecarMetaPath(storagePath = this.storagePath) {
    return path.join(this.getSidecarDirectory(storagePath), "meta.json");
  }
  getSidecarSqlitePath(storagePath = this.storagePath) {
    return path.join(this.getSidecarDirectory(storagePath), "index.sqlite");
  }
  getSidecarBootstrapPath(pageKey, storagePath = this.storagePath) {
    return path.join(this.getSidecarDirectory(storagePath), "bootstrap", `${String(pageKey || "index").trim() || "index"}.json`);
  }
  getSidecarDraftStem(key = "") {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return "";
    }
    const preview = normalizedKey
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48)
      .toLowerCase();
    const digest = crypto.createHash("sha1").update(normalizedKey).digest("hex");
    return `${preview || "draft"}-${digest}`;
  }
  getSidecarDraftPath(key, storagePath = this.storagePath) {
    return path.join(
      this.getSidecarDirectory(storagePath),
      "drafts",
      `${this.getSidecarDraftStem(key)}.json`,
    );
  }
  getSidecarDraftLogPath(key, storagePath = this.storagePath) {
    return path.join(
      this.getSidecarDirectory(storagePath),
      "oplog",
      "drafts",
      `${this.getSidecarDraftStem(key)}.jsonl`,
    );
  }

  ensureSidecarLayout(storagePath = this.storagePath) {
    const sidecarDir = this.getSidecarDirectory(storagePath);
    fs.ensureDirSync(path.join(sidecarDir, "bootstrap"));
    fs.ensureDirSync(path.join(sidecarDir, "drafts"));
    fs.ensureDirSync(path.join(sidecarDir, "oplog"));
    fs.ensureDirSync(path.join(sidecarDir, "oplog", "drafts"));
    const sqlitePath = this.getSidecarSqlitePath(storagePath);
    if (!fs.existsSync(sqlitePath)) {
      fs.ensureFileSync(sqlitePath);
    }
    return sidecarDir;
  }

  readSidecarMetaSync(storagePath = this.storagePath) {
    const meta = this.readJsonFileSync(this.getSidecarMetaPath(storagePath), {});
    return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  }

  writeSidecarMetaSync(storagePath = this.storagePath, meta = {}) {
    this.ensureSidecarLayout(storagePath);
    this.writeJsonFileSync(this.getSidecarMetaPath(storagePath), {
      schemaVersion: this.sidecarSchemaVersion,
      updatedAt: new Date().toISOString(),
      ...(meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {}),
    });
  }

  writeBufferFileSync(filePath, value) {
    fs.ensureDirSync(path.dirname(filePath));
    const buffer = Buffer.isBuffer(value)
      ? value
      : value instanceof Uint8Array
        ? Buffer.from(value)
        : Buffer.from([]);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    let fileDescriptor = null;
    try {
      fileDescriptor = fs.openSync(tempPath, "w");
      if (buffer.length) {
        fs.writeSync(fileDescriptor, buffer, 0, buffer.length, 0);
      }
      fs.fsyncSync(fileDescriptor);
    } finally {
      if (fileDescriptor !== null) {
        fs.closeSync(fileDescriptor);
      }
    }
    fs.moveSync(tempPath, filePath, { overwrite: true });
  }

  appendTextFileSync(filePath, text = "") {
    fs.ensureDirSync(path.dirname(filePath));
    let fileDescriptor = null;
    try {
      fileDescriptor = fs.openSync(filePath, "a");
      if (text) {
        fs.writeSync(fileDescriptor, String(text), undefined, "utf8");
      }
      fs.fsyncSync(fileDescriptor);
    } finally {
      if (fileDescriptor !== null) {
        fs.closeSync(fileDescriptor);
      }
    }
  }

  async initializeSidecarSqliteRuntime() {
    if (this.sidecarSqliteModule) {
      return this.sidecarSqliteModule;
    }
    if (this.sidecarSqliteInitPromise) {
      return this.sidecarSqliteInitPromise;
    }
    if (typeof initSqlJs !== "function") {
      this.sidecarSqliteInitError = new Error("当前环境缺少 sql.js 依赖。");
      return null;
    }
    this.sidecarSqliteInitPromise = Promise.resolve()
      .then(() =>
        initSqlJs({
          locateFile: (fileName) => {
            if (fileName === "sql-wasm.wasm") {
              return require.resolve("sql.js/dist/sql-wasm.wasm");
            }
            return fileName;
          },
        }),
      )
      .then((module) => {
        this.sidecarSqliteModule = module;
        this.sidecarSqliteInitError = null;
        return module;
      })
      .catch((error) => {
        this.sidecarSqliteInitError = error;
        console.error("初始化 sidecar SQLite 失败:", error);
        return null;
      });
    return this.sidecarSqliteInitPromise;
  }

  readSidecarSqliteMetaValueSync(db, key) {
    try {
      const statement = db.prepare(
        "SELECT value FROM sidecar_meta WHERE key = ? LIMIT 1",
      );
      try {
        statement.bind([String(key || "")]);
        if (!statement.step()) {
          return "";
        }
        const row = statement.getAsObject();
        return typeof row?.value === "string" ? row.value : "";
      } finally {
        statement.free();
      }
    } catch (error) {
      return "";
    }
  }

  upsertSidecarSqliteMetaValueSync(db, key, value) {
    db.run(
      "INSERT INTO sidecar_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(key || ""), String(value || "")],
    );
  }

  ensureSidecarSqliteSchemaSync(db) {
    const existingVersion = Number.parseInt(
      this.readSidecarSqliteMetaValueSync(db, "schemaVersion"),
      10,
    );
    if (
      Number.isFinite(existingVersion) &&
      existingVersion > 0 &&
      existingVersion !== this.sidecarSchemaVersion
    ) {
      [
        "partition_fingerprints",
        "record_index",
        "plan_index",
        "diary_index",
        "stats_aggregate",
        "page_bootstrap_snapshots",
        "sidecar_meta",
      ].forEach((tableName) => {
        db.run(`DROP TABLE IF EXISTS ${tableName}`);
      });
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS sidecar_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS partition_fingerprints (
        section TEXT NOT NULL,
        period_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        file_rel TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        min_date TEXT,
        max_date TEXT,
        indexed_at TEXT NOT NULL,
        PRIMARY KEY (section, period_id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS record_index (
        record_key TEXT PRIMARY KEY,
        record_id TEXT,
        period_id TEXT NOT NULL,
        project_id TEXT,
        start_time TEXT,
        end_time TEXT,
        timestamp TEXT,
        date_key TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS record_index_period_idx ON record_index (period_id, date_key)");
    db.run("CREATE INDEX IF NOT EXISTS record_index_project_idx ON record_index (project_id, date_key)");
    db.run(`
      CREATE TABLE IF NOT EXISTS plan_index (
        plan_key TEXT PRIMARY KEY,
        plan_id TEXT,
        period_id TEXT NOT NULL,
        plan_date TEXT,
        start_time TEXT,
        end_time TEXT,
        repeat_type TEXT,
        project_id TEXT,
        completed INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS plan_index_period_idx ON plan_index (period_id, plan_date)");
    db.run(`
      CREATE TABLE IF NOT EXISTS diary_index (
        diary_key TEXT PRIMARY KEY,
        diary_id TEXT,
        period_id TEXT NOT NULL,
        entry_date TEXT,
        updated_at TEXT,
        category_id TEXT,
        title_preview TEXT
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS diary_index_period_idx ON diary_index (period_id, entry_date)");
    db.run(`
      CREATE TABLE IF NOT EXISTS stats_aggregate (
        bucket_kind TEXT NOT NULL,
        bucket_key TEXT NOT NULL,
        project_id TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        record_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_kind, bucket_key, project_id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS page_bootstrap_snapshots (
        page_key TEXT NOT NULL,
        options_hash TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        built_at TEXT NOT NULL,
        loaded_period_ids_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (page_key, options_hash, source_fingerprint)
      )
    `);
    this.upsertSidecarSqliteMetaValueSync(
      db,
      "schemaVersion",
      String(this.sidecarSchemaVersion),
    );
  }

  getSidecarDatabaseEntrySync(storagePath = this.storagePath) {
    if (!this.sidecarSqliteModule) {
      return null;
    }
    this.ensureSidecarLayout(storagePath);
    const sqlitePath = this.getSidecarSqlitePath(storagePath);
    const cacheKey = path.resolve(sqlitePath);
    const cachedEntry = this.sidecarDatabaseCache.get(cacheKey);
    if (cachedEntry?.db) {
      return cachedEntry;
    }
    let db = null;
    try {
      const rawFile =
        fs.existsSync(sqlitePath) && Number(fs.statSync(sqlitePath).size || 0) > 0
          ? fs.readFileSync(sqlitePath)
          : null;
      db =
        rawFile && rawFile.length
          ? new this.sidecarSqliteModule.Database(rawFile)
          : new this.sidecarSqliteModule.Database();
    } catch (error) {
      console.error("打开 sidecar SQLite 失败，准备重建:", error);
      db = new this.sidecarSqliteModule.Database();
    }
    const entry = {
      db,
      dirty: false,
      storagePath,
      sqlitePath,
    };
    this.ensureSidecarSqliteSchemaSync(db);
    this.sidecarDatabaseCache.set(cacheKey, entry);
    return entry;
  }

  persistSidecarDatabaseSync(storagePath = this.storagePath) {
    const entry = this.getSidecarDatabaseEntrySync(storagePath);
    if (!entry || entry.dirty !== true) {
      return false;
    }
    const exported = entry.db.export();
    this.writeBufferFileSync(entry.sqlitePath, Buffer.from(exported));
    entry.dirty = false;
    return true;
  }

  markSidecarDatabaseDirty(storagePath = this.storagePath) {
    const entry = this.getSidecarDatabaseEntrySync(storagePath);
    if (entry) {
      entry.dirty = true;
    }
  }

  buildDraftOperation(action, key, value) {
    const updatedAt = new Date().toISOString();
    const operationId = crypto
      .createHash("sha1")
      .update(`${key}:${action}:${updatedAt}:${Math.random()}`)
      .digest("hex");
    return {
      operationId,
      action,
      key,
      updatedAt,
      value:
        action === "set"
          ? bundleHelper.cloneValue(
              typeof value === "undefined" ? null : value,
            )
          : null,
    };
  }

  readLatestDraftOperationSync(key, storagePath = this.storagePath) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    const logPath = this.getSidecarDraftLogPath(normalizedKey, storagePath);
    if (!fs.existsSync(logPath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(logPath, "utf8");
      const lines = String(raw || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        return null;
      }
      const parsed = JSON.parse(lines[lines.length - 1]);
      return isPlainObject(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  readDraftEnvelopeSync(key, storagePath = this.storagePath) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    const envelope = this.readJsonFileSync(
      this.getSidecarDraftPath(normalizedKey, storagePath),
      null,
    );
    return isPlainObject(envelope) ? envelope : null;
  }

  getDraft(key, options = {}) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    this.ensureSidecarLayout();
    const envelope = this.readDraftEnvelopeSync(normalizedKey);
    const latestOperation = this.readLatestDraftOperationSync(normalizedKey);

    let resolvedEnvelope = envelope;
    if (latestOperation?.action === "remove") {
      if (
        !resolvedEnvelope ||
        resolvedEnvelope.lastOperationId !== latestOperation.operationId
      ) {
        resolvedEnvelope = null;
      }
    } else if (
      latestOperation?.action === "set" &&
      (!resolvedEnvelope ||
        resolvedEnvelope.lastOperationId !== latestOperation.operationId)
    ) {
      resolvedEnvelope = {
        key: normalizedKey,
        lastOperationId: latestOperation.operationId,
        updatedAt: latestOperation.updatedAt,
        value: bundleHelper.cloneValue(latestOperation.value),
      };
    }

    if (!resolvedEnvelope) {
      return null;
    }
    if (options.includeEnvelope === true) {
      return bundleHelper.cloneValue(resolvedEnvelope);
    }
    return bundleHelper.cloneValue(
      Object.prototype.hasOwnProperty.call(resolvedEnvelope, "value")
        ? resolvedEnvelope.value
        : null,
    );
  }

  setDraft(key, value, options = {}) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    this.ensureSidecarLayout();
    const operation = this.buildDraftOperation("set", normalizedKey, value);
    const envelope = {
      key: normalizedKey,
      updatedAt: operation.updatedAt,
      lastOperationId: operation.operationId,
      value: bundleHelper.cloneValue(
        typeof value === "undefined" ? null : value,
      ),
      scope:
        typeof options?.scope === "string" && options.scope.trim()
          ? options.scope.trim()
          : "",
    };
    this.appendTextFileSync(
      this.getSidecarDraftLogPath(normalizedKey),
      `${JSON.stringify(operation)}\n`,
    );
    this.writeJsonFileSync(this.getSidecarDraftPath(normalizedKey), envelope);
    return {
      key: normalizedKey,
      updatedAt: operation.updatedAt,
      operationId: operation.operationId,
    };
  }

  removeDraft(key) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return false;
    }
    this.ensureSidecarLayout();
    const operation = this.buildDraftOperation("remove", normalizedKey, null);
    this.appendTextFileSync(
      this.getSidecarDraftLogPath(normalizedKey),
      `${JSON.stringify(operation)}\n`,
    );
    fs.removeSync(this.getSidecarDraftPath(normalizedKey));
    return true;
  }

  createTimestampTag(date = new Date()) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hour}${minute}${second}`;
  }

  getAutoBackupIntervalMs(settings = this.getAutoBackupSettings()) {
    const intervalUnit = Object.prototype.hasOwnProperty.call(AUTO_BACKUP_UNITS, settings?.intervalUnit)
      ? settings.intervalUnit
      : DEFAULT_AUTO_BACKUP_SETTINGS.intervalUnit;
    const intervalValue = Number.isFinite(settings?.intervalValue)
      ? Math.max(1, Math.floor(Number(settings.intervalValue)))
      : DEFAULT_AUTO_BACKUP_SETTINGS.intervalValue;
    return intervalValue * AUTO_BACKUP_UNITS[intervalUnit];
  }

  listAutoBackupEntries(root = this.getBundleRoot(this.storagePath)) {
    const backupDirectory = this.getAutoBackupDirectory(root);
    if (!fs.existsSync(backupDirectory)) {
      return [];
    }
    try {
      return fs.readdirSync(backupDirectory)
        .filter((name) => typeof name === "string" && name.toLowerCase().endsWith(".zip"))
        .map((name) => {
          const filePath = path.join(backupDirectory, name);
          try {
            const stats = fs.statSync(filePath);
            return {
              file: name,
              path: filePath,
              size: Math.max(0, Number(stats.size || 0)),
              modifiedAt: Number(stats.mtimeMs || 0),
              modifiedAtIso: stats.mtime ? new Date(stats.mtime).toISOString() : null,
            };
          } catch (error) {
            return null;
          }
        })
        .filter(Boolean)
        .sort((left, right) =>
          right.modifiedAt - left.modifiedAt || String(right.file).localeCompare(String(left.file)));
    } catch (error) {
      return [];
    }
  }

  async pruneAutoBackupEntries(root = this.getBundleRoot(this.storagePath), maxBackups = DEFAULT_AUTO_BACKUP_SETTINGS.maxBackups) {
    const entries = this.listAutoBackupEntries(root);
    const keepCount = Number.isFinite(maxBackups)
      ? Math.max(1, Math.floor(Number(maxBackups)))
      : DEFAULT_AUTO_BACKUP_SETTINGS.maxBackups;
    const targets = entries.slice(keepCount);
    await Promise.all(targets.map((entry) =>
      fs.remove(entry.path).catch((error) => {
        console.error("删除旧自动备份失败:", error);
      })));
  }

  updateAutoBackupState(nextState = {}, options = {}) {
    const root = this.getBundleRoot(this.storagePath);
    const backupDirectory = this.getAutoBackupDirectory(root);
    const mergedState = this.normalizeAutoBackupState({
      ...this.getEffectiveAutoBackupState(root),
      ...(nextState && typeof nextState === "object" && !Array.isArray(nextState) ? nextState : {}),
      targetBackupDirectory: backupDirectory,
    });
    this.writeConfig({
      storagePath: this.getBundleDisplayPath(root),
      autoBackup: {
        settings:
          options.settings && typeof options.settings === "object"
            ? options.settings
            : this.getAutoBackupSettings(),
        state: mergedState,
      },
    });
    return mergedState;
  }

  getAutoBackupStatus() {
    try {
      this.ensureStorageReady();
      const root = this.getBundleRoot(this.storagePath);
      const settings = this.getAutoBackupSettings();
      const state = this.getEffectiveAutoBackupState(root);
      const entries = this.listAutoBackupEntries(root);
      const latest = entries[0] || null;
      return {
        enabled: settings.enabled,
        intervalValue: settings.intervalValue,
        intervalUnit: settings.intervalUnit,
        maxBackups: settings.maxBackups,
        backupDirectory: this.getAutoBackupDirectory(root),
        backupDirectoryKind: "file-path",
        backupCount: entries.length,
        latestBackupFile: latest?.file || null,
        latestBackupPath: latest?.path || null,
        latestBackupAt: latest?.modifiedAtIso || null,
        latestBackupSize: latest?.size || 0,
        lastAttemptAt: state.lastAttemptAt || null,
        lastError: state.lastError || null,
        lastBackedUpFingerprint: state.lastBackedUpFingerprint || "",
      };
    } catch (error) {
      console.error("获取自动备份状态失败:", error);
      return {
        ...DEFAULT_AUTO_BACKUP_SETTINGS,
        backupDirectory: this.getAutoBackupDirectory(this.getBundleRoot(this.storagePath)),
        backupDirectoryKind: "file-path",
        backupCount: 0,
        latestBackupFile: null,
        latestBackupPath: null,
        latestBackupAt: null,
        latestBackupSize: 0,
        lastAttemptAt: null,
        lastError: error?.message || "获取自动备份状态失败",
        lastBackedUpFingerprint: "",
      };
    }
  }

  updateAutoBackupSettings(settings = {}) {
    const nextSettings = this.normalizeAutoBackupSettings({
      ...this.getAutoBackupSettings(),
      ...(settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {}),
    });
    this.writeConfig({
      storagePath: this.getBundleDisplayPath(this.getBundleRoot(this.storagePath)),
      autoBackup: {
        settings: nextSettings,
        state: this.getEffectiveAutoBackupState(),
      },
    });
    return this.getAutoBackupStatus();
  }

  shouldRunAutoBackup(settings, state, fingerprint, options = {}) {
    if (options.force === true) {
      return true;
    }
    if (settings.enabled !== true) {
      return false;
    }
    if (
      state.lastBackedUpFingerprint &&
      fingerprint &&
      state.lastBackedUpFingerprint === fingerprint
    ) {
      return false;
    }
    const anchorAt = state.latestBackupAt || state.lastAttemptAt || null;
    if (!anchorAt) {
      return true;
    }
    const anchorTime = new Date(anchorAt).getTime();
    if (!Number.isFinite(anchorTime) || anchorTime <= 0) {
      return true;
    }
    return Date.now() - anchorTime >= this.getAutoBackupIntervalMs(settings);
  }

  async executeAutoBackup(options = {}) {
    if (this.autoBackupInFlight) {
      return this.autoBackupInFlight;
    }
    this.autoBackupInFlight = Promise.resolve().then(async () => {
      this.ensureStorageReady();
      const root = this.getBundleRoot(this.storagePath);
      const settings = this.getAutoBackupSettings();
      const state = this.getEffectiveAutoBackupState(root);
      const storageStatus = this.getStorageStatus();
      const fingerprint = String(storageStatus?.fingerprint || "").trim();
      if (!this.shouldRunAutoBackup(settings, state, fingerprint, options)) {
        return this.getAutoBackupStatus();
      }
      const attemptedAt = new Date().toISOString();
      const backupDirectory = this.getAutoBackupDirectory(root);
      try {
        if (!archiver) {
          throw new Error("当前环境缺少 ZIP 备份支持");
        }
        await fs.ensureDir(backupDirectory);
        const backupFile = `order-auto-backup-${this.createTimestampTag()}.zip`;
        const backupPath = path.join(backupDirectory, backupFile);
        await this.exportBundle({
          type: "full",
          filePath: backupPath,
        });
        const stats = await fs.stat(backupPath);
        await this.pruneAutoBackupEntries(root, settings.maxBackups);
        this.updateAutoBackupState({
          lastAttemptAt: attemptedAt,
          lastError: null,
          lastBackedUpFingerprint: fingerprint,
          latestBackupFile: backupFile,
          latestBackupPath: backupPath,
          latestBackupAt: attemptedAt,
          latestBackupSize: Math.max(0, Number(stats?.size || 0)),
        }, {
          settings,
        });
      } catch (error) {
        this.updateAutoBackupState({
          lastAttemptAt: attemptedAt,
          lastError: error?.message || String(error || "自动备份失败"),
        }, {
          settings,
        });
      }
      return this.getAutoBackupStatus();
    }).finally(() => {
      this.autoBackupInFlight = null;
    });
    return this.autoBackupInFlight;
  }

  async runAutoBackupNow() {
    return this.executeAutoBackup({ force: true, reason: "manual" });
  }

  maybeRunAutoBackup(options = {}) {
    void this.executeAutoBackup(options);
  }

  bundleExists(root = this.getBundleRoot()) { return fs.existsSync(this.getManifestPath(root)); }

  readJsonFileSync(filePath, fallback = null) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, "utf8");
      if (!String(raw || "").trim()) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  writeJsonFileSync(filePath, value) {
    fs.ensureDirSync(path.dirname(filePath));
    const serialized = JSON.stringify(value, null, 2);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    let fileDescriptor = null;
    try {
      fileDescriptor = fs.openSync(tempPath, "w");
      fs.writeFileSync(fileDescriptor, serialized, "utf8");
      fs.fsyncSync(fileDescriptor);
    } finally {
      if (fileDescriptor !== null) {
        fs.closeSync(fileDescriptor);
      }
    }
    fs.moveSync(tempPath, filePath, { overwrite: true });
  }
  readManifestSync(root = this.getBundleRoot()) {
    const manifest = this.readJsonFileSync(this.getManifestPath(root), null);
    return manifest ? bundleHelper.normalizeManifest(manifest) : null;
  }

  readCoreSync(root = this.getBundleRoot()) {
    return bundleHelper.ensureObject(this.readJsonFileSync(this.getCorePath(root), {}), {});
  }

  normalizeCoreProjectsSnapshot(core = {}) {
    const nextCore = bundleHelper.ensureObject(
      bundleHelper.cloneValue(core),
      {},
    );
    const rawProjects = bundleHelper.ensureArray(nextCore.projects);
    const repairResult =
      typeof bundleHelper.repairProjectHierarchy === "function"
        ? bundleHelper.repairProjectHierarchy(rawProjects)
        : {
            projects: rawProjects,
            repaired: false,
          };
    const needsDurationRepair =
      typeof bundleHelper.projectsHaveValidDurationCache === "function"
        ? !bundleHelper.projectsHaveValidDurationCache(repairResult.projects)
        : false;

    nextCore.projects =
      repairResult.repaired || needsDurationRepair
        ? bundleHelper.recalculateProjectDurationTotals(repairResult.projects)
        : repairResult.projects;

    return {
      core: nextCore,
      repaired: repairResult.repaired || needsDurationRepair,
    };
  }

  repairStoredCoreProjectsIfNeeded(root = this.getBundleRoot()) {
    const currentCore = this.readCoreSync(root);
    const normalized = this.normalizeCoreProjectsSnapshot(currentCore);
    if (!normalized.repaired) {
      return normalized.core;
    }

    const repairedAt = new Date().toISOString();
    normalized.core.lastModified = repairedAt;
    this.writeJsonFileSync(this.getCorePath(root), normalized.core);

    const manifest = this.readManifestSync(root);
    if (manifest) {
      manifest.lastModified = repairedAt;
      this.writeJsonFileSync(this.getManifestPath(root), manifest);
    }

    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    return normalized.core;
  }

  readRecurringPlansSync(root = this.getBundleRoot()) {
    return bundleHelper.ensureArray(this.readJsonFileSync(this.getRecurringPlansPath(root), []));
  }

  getRecordPartitionPatchDir(root, periodId) {
    const relativePath = bundleHelper.getPartitionRelativePath("records", periodId);
    const parsedPath = path.parse(relativePath);
    return path.join(root, parsedPath.dir, `${parsedPath.name}${RECORD_PARTITION_PATCH_DIR_SUFFIX}`);
  }

  listRecordPartitionPatchFiles(root, periodId) {
    const patchDir = this.getRecordPartitionPatchDir(root, periodId);
    if (!fs.existsSync(patchDir)) {
      return [];
    }
    return fs.readdirSync(patchDir)
      .filter((fileName) => /\.json$/i.test(String(fileName || "")))
      .sort((left, right) => String(left).localeCompare(String(right)))
      .map((fileName) => path.join(patchDir, fileName));
  }

  buildRecordPartitionPatchFingerprint(periodId, upsertItems = [], removeIds = []) {
    return crypto
      .createHash("sha1")
      .update(JSON.stringify({
        periodId: bundleHelper.normalizePeriodId(periodId) || bundleHelper.UNDATED_PERIOD_ID,
        upsertItems: bundleHelper.sortPartitionItems("records", upsertItems),
        removeIds: Array.from(
          new Set(
            bundleHelper.ensureArray(removeIds)
              .map((recordId) => String(recordId || "").trim())
              .filter(Boolean),
          ),
        ).sort((left, right) => String(left).localeCompare(String(right))),
      }))
      .digest("hex");
  }

  buildRecordPartitionPatchEnvelope(periodId, payload = {}) {
    const normalizedPeriodId =
      bundleHelper.normalizePeriodId(periodId) || bundleHelper.UNDATED_PERIOD_ID;
    const upsertItems = bundleHelper.sortPartitionItems(
      "records",
      bundleHelper.ensureArray(payload.upsertItems || payload.items),
    );
    const removedItems = bundleHelper.sortPartitionItems(
      "records",
      bundleHelper.ensureArray(payload.removedItems),
    );
    const removeIds = Array.from(
      new Set([
        ...bundleHelper.ensureArray(payload.removeIds)
          .map((recordId) => String(recordId || "").trim())
          .filter(Boolean),
        ...removedItems
          .map((record) => String(record?.id || "").trim())
          .filter(Boolean),
      ]),
    ).sort((left, right) => String(left).localeCompare(String(right)));
    const dateKeys = upsertItems
      .map((item) => bundleHelper.normalizeDateKey(bundleHelper.getSectionItemDate("records", item)))
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)));
    return {
      formatVersion: bundleHelper.FORMAT_VERSION,
      section: "records",
      periodUnit: bundleHelper.PERIOD_UNIT,
      periodId: normalizedPeriodId,
      patchKind: "record-patch",
      createdAt:
        typeof payload?.createdAt === "string" && payload.createdAt
          ? payload.createdAt
          : new Date().toISOString(),
      fingerprint: this.buildRecordPartitionPatchFingerprint(
        normalizedPeriodId,
        upsertItems,
        removeIds,
      ),
      minDate: dateKeys.length ? dateKeys[0] : null,
      maxDate: dateKeys.length ? dateKeys[dateKeys.length - 1] : null,
      upsertItems: bundleHelper.cloneValue(upsertItems),
      removedItems: bundleHelper.cloneValue(removedItems),
      removeIds,
    };
  }

  readRecordPartitionPatchEnvelopeSync(filePath, periodId) {
    const parsed = this.readJsonFileSync(filePath, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return this.buildRecordPartitionPatchEnvelope(periodId, parsed);
  }

  readRecordPartitionPatchEnvelopesSync(root, periodId) {
    return this.listRecordPartitionPatchFiles(root, periodId).map((filePath) =>
      this.readRecordPartitionPatchEnvelopeSync(filePath, periodId),
    ).filter(Boolean);
  }

  buildRecordPartitionOverlayFingerprint(baseFingerprint = "", patchEnvelopes = []) {
    return crypto
      .createHash("sha1")
      .update(JSON.stringify({
        baseFingerprint: String(baseFingerprint || ""),
        patches: bundleHelper.ensureArray(patchEnvelopes).map((patchEnvelope) => ({
          createdAt: patchEnvelope?.createdAt || "",
          fingerprint: patchEnvelope?.fingerprint || "",
        })),
      }))
      .digest("hex");
  }

  applyRecordPartitionPatchEnvelopes(items = [], patchEnvelopes = []) {
    const merged = new Map();
    bundleHelper.sortPartitionItems("records", items).forEach((record) => {
      merged.set(this.buildRecordIndexKey(record), bundleHelper.cloneValue(record));
    });
    bundleHelper.ensureArray(patchEnvelopes).forEach((patchEnvelope) => {
      bundleHelper.ensureArray(patchEnvelope?.removeIds).forEach((recordId) => {
        merged.delete(`id:${String(recordId || "").trim()}`);
      });
      bundleHelper.ensureArray(patchEnvelope?.upsertItems).forEach((record) => {
        merged.set(this.buildRecordIndexKey(record), bundleHelper.cloneValue(record));
      });
    });
    return bundleHelper.sortPartitionItems("records", Array.from(merged.values()));
  }

  appendRecordPartitionPatchSync(root, periodId, patchEnvelope = {}) {
    const patchDir = this.getRecordPartitionPatchDir(root, periodId);
    const operationId = [
      Date.now(),
      process.pid,
      crypto.randomBytes(4).toString("hex"),
    ].join("-");
    const filePath = path.join(patchDir, `${operationId}.json`);
    this.writeJsonFileSync(filePath, patchEnvelope);
    return filePath;
  }

  lookupExistingRecordIdsInSidecarSync(periodId, recordIds = []) {
    const normalizedIds = Array.from(
      new Set(
        bundleHelper.ensureArray(recordIds)
          .map((recordId) => String(recordId || "").trim())
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) {
      return new Set();
    }
    const entry = this.getSidecarDatabaseEntrySync(this.storagePath);
    if (!entry?.db) {
      return new Set();
    }
    const result = new Set();
    const statement = entry.db.prepare(
      `SELECT record_id
         FROM record_index
        WHERE period_id = ?
          AND record_id IN (${buildSqlPlaceholders(normalizedIds.length)})`,
    );
    try {
      statement.bind([String(periodId || ""), ...normalizedIds]);
      while (statement.step()) {
        const row = statement.getAsObject();
        const recordId = String(row?.record_id || "").trim();
        if (recordId) {
          result.add(recordId);
        }
      }
    } finally {
      statement.free();
    }
    return result;
  }

  applyRecordPatchRecordIdOverlay(recordIds = new Set(), patchEnvelopes = []) {
    const overlay = new Set(
      recordIds instanceof Set ? Array.from(recordIds) : bundleHelper.ensureArray(recordIds),
    );
    bundleHelper.ensureArray(patchEnvelopes).forEach((patchEnvelope) => {
      bundleHelper.ensureArray(patchEnvelope?.removeIds).forEach((recordId) => {
        const normalizedRecordId = String(recordId || "").trim();
        if (normalizedRecordId) {
          overlay.delete(normalizedRecordId);
        }
      });
      bundleHelper.ensureArray(patchEnvelope?.upsertItems).forEach((record) => {
        const recordId = String(record?.id || "").trim();
        if (recordId) {
          overlay.add(recordId);
        }
      });
    });
    return overlay;
  }

  buildRecordManifestPartitionFromPatch(
    root,
    manifest,
    periodId,
    currentPatchEnvelope = {},
    previousPatchEnvelopes = [],
  ) {
    const normalizedPeriodId = bundleHelper.normalizePeriodId(periodId);
    if (!normalizedPeriodId) {
      return null;
    }
    const relativePath = bundleHelper.getPartitionRelativePath("records", normalizedPeriodId);
    const existingPartition = (manifest?.sections?.records?.partitions || []).find(
      (partition) => partition.periodId === normalizedPeriodId,
    );
    const upsertItems = bundleHelper.ensureArray(currentPatchEnvelope?.upsertItems);
    const removeIds = bundleHelper.ensureArray(currentPatchEnvelope?.removeIds);
    const overlayIds = this.applyRecordPatchRecordIdOverlay(
      this.lookupExistingRecordIdsInSidecarSync(normalizedPeriodId, [
        ...bundleHelper.ensureArray(previousPatchEnvelopes).flatMap((patchEnvelope) => [
          ...bundleHelper.ensureArray(patchEnvelope?.removeIds),
          ...bundleHelper.ensureArray(patchEnvelope?.upsertItems).map((record) =>
            String(record?.id || "").trim(),
          ),
        ]),
        ...upsertItems.map((record) => String(record?.id || "").trim()),
        ...removeIds,
      ]),
      previousPatchEnvelopes,
    );
    const removeIdSet = new Set(
      removeIds
        .map((recordId) => String(recordId || "").trim())
        .filter(Boolean),
    );
    const upsertIdSet = new Set(
      upsertItems
        .map((record) => String(record?.id || "").trim())
        .filter(Boolean),
    );
    let nextCount = Math.max(0, Number(existingPartition?.count || 0));
    upsertIdSet.forEach((recordId) => {
      if (!overlayIds.has(recordId) && !removeIdSet.has(recordId)) {
        nextCount += 1;
      }
    });
    removeIdSet.forEach((recordId) => {
      if (overlayIds.has(recordId) && !upsertIdSet.has(recordId)) {
        nextCount -= 1;
      }
    });
    nextCount = Math.max(0, nextCount);

    const minDateCandidates = [
      typeof existingPartition?.minDate === "string" && existingPartition.minDate
        ? existingPartition.minDate
        : null,
      ...upsertItems
        .map((record) => bundleHelper.normalizeDateKey(bundleHelper.getSectionItemDate("records", record)))
        .filter(Boolean),
    ].filter(Boolean);
    const maxDateCandidates = minDateCandidates.slice();
    minDateCandidates.sort((left, right) => String(left).localeCompare(String(right)));
    maxDateCandidates.sort((left, right) => String(right).localeCompare(String(left)));
    return {
      periodId: normalizedPeriodId,
      file: relativePath,
      count: nextCount,
      minDate: nextCount > 0 ? minDateCandidates[0] || null : null,
      maxDate: nextCount > 0 ? maxDateCandidates[0] || null : null,
      fingerprint: this.buildRecordPartitionOverlayFingerprint(
        existingPartition?.fingerprint || "",
        [
          ...bundleHelper.ensureArray(previousPatchEnvelopes),
          currentPatchEnvelope,
        ],
      ),
    };
  }

  scheduleRecordPartitionCompaction(storagePath = this.storagePath, periodId = "") {
    const normalizedPeriodId = bundleHelper.normalizePeriodId(periodId);
    if (!normalizedPeriodId) {
      return;
    }
    const key = `${path.resolve(this.getBundleRoot(storagePath))}:${normalizedPeriodId}`;
    if (this.recordPartitionCompactionTimers.has(key)) {
      clearTimeout(this.recordPartitionCompactionTimers.get(key));
    }
    const timer = setTimeout(() => {
      this.recordPartitionCompactionTimers.delete(key);
      void this.compactRecordPartition(storagePath, normalizedPeriodId);
    }, RECORD_PARTITION_PATCH_COMPACT_DELAY_MS);
    this.recordPartitionCompactionTimers.set(key, timer);
  }

  async compactRecordPartition(storagePath = this.storagePath, periodId = "") {
    const normalizedPeriodId = bundleHelper.normalizePeriodId(periodId);
    if (!normalizedPeriodId) {
      return null;
    }
    const key = `${path.resolve(this.getBundleRoot(storagePath))}:${normalizedPeriodId}`;
    if (this.recordPartitionCompactions.has(key)) {
      return this.recordPartitionCompactions.get(key);
    }
    const task = Promise.resolve().then(async () => {
      const root = this.getBundleRoot(storagePath);
      const patchFiles = this.listRecordPartitionPatchFiles(root, normalizedPeriodId);
      if (!patchFiles.length) {
        return null;
      }
      const envelope = this.readPartitionEnvelopeSync(root, "records", normalizedPeriodId);
      const compactedEnvelope = bundleHelper.createPartitionEnvelope(
        "records",
        normalizedPeriodId,
        envelope.items || [],
      );
      const relativePath = bundleHelper.getPartitionRelativePath("records", normalizedPeriodId);
      const targetPath = path.join(root, relativePath);
      if (bundleHelper.ensureArray(compactedEnvelope?.items).length) {
        this.writeJsonFileSync(targetPath, compactedEnvelope);
      } else if (fs.existsSync(targetPath)) {
        fs.removeSync(targetPath);
      }
      fs.removeSync(this.getRecordPartitionPatchDir(root, normalizedPeriodId));
      const manifest = this.readManifestSync(root) || bundleHelper.createEmptyBundle().manifest;
      const partitions = (manifest.sections?.records?.partitions || []).filter(
        (partition) => partition.periodId !== normalizedPeriodId,
      );
      if (bundleHelper.ensureArray(compactedEnvelope?.items).length) {
        partitions.push({
          periodId: normalizedPeriodId,
          file: relativePath,
          count: compactedEnvelope.count,
          minDate: compactedEnvelope.minDate,
          maxDate: compactedEnvelope.maxDate,
          fingerprint: compactedEnvelope.fingerprint,
        });
      }
      partitions.sort((left, right) => String(left.periodId).localeCompare(String(right.periodId)));
      manifest.lastModified = new Date().toISOString();
      manifest.sections.records = {
        periodUnit: bundleHelper.PERIOD_UNIT,
        partitions,
      };
      const core = this.readCoreSync(root);
      core.lastModified = manifest.lastModified;
      core.storagePath = this.storagePath;
      core.storageDirectory = root;
      core.userDataPath = this.userDataPath;
      core.documentsPath = this.documentsPath;
      this.writeJsonFileSync(this.getCorePath(root), core);
      this.writeJsonFileSync(this.getManifestPath(root), manifest);
      this.cachedStorageSnapshot = null;
      this.markKnownFileVersion({ includeHash: true });
      const sourceFingerprint = this.buildBundleSourceFingerprint(root, manifest);
      await this.requestSidecarIndexRebuild(storagePath, {
        fullRebuild: false,
        sourceFingerprint,
        changedSections: ["records"],
        changedPeriods: {
          records: [normalizedPeriodId],
        },
      });
      return {
        periodId: normalizedPeriodId,
        count: compactedEnvelope.count,
      };
    }).finally(() => {
      this.recordPartitionCompactions.delete(key);
    });
    this.recordPartitionCompactions.set(key, task);
    return task;
  }

  readPartitionEnvelopeSync(root, section, periodId) {
    const filePath = path.join(root, bundleHelper.getPartitionRelativePath(section, periodId));
    const parsed = this.readJsonFileSync(filePath, null);
    const baseEnvelope = Array.isArray(parsed)
      ? bundleHelper.createPartitionEnvelope(section, periodId, parsed)
      : bundleHelper.normalizePartitionEnvelope(section, parsed, periodId);
    if (section !== "records") {
      return baseEnvelope;
    }
    const patchEnvelopes = this.readRecordPartitionPatchEnvelopesSync(root, periodId);
    if (!patchEnvelopes.length) {
      return baseEnvelope;
    }
    return bundleHelper.createPartitionEnvelope(
      section,
      periodId,
      this.applyRecordPartitionPatchEnvelopes(baseEnvelope.items || [], patchEnvelopes),
      {
        fingerprint: this.buildRecordPartitionOverlayFingerprint(
          baseEnvelope?.fingerprint || "",
          patchEnvelopes,
        ),
      },
    );
  }

  listBundleFiles(root, manifest = this.readManifestSync(root)) {
    if (!manifest) return [];
    const files = [this.getManifestPath(root), this.getCorePath(root), this.getRecurringPlansPath(root)];
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      (manifest.sections?.[section]?.partitions || []).forEach((partition) => {
        files.push(path.join(root, partition.file));
        if (section === "records") {
          files.push(...this.listRecordPartitionPatchFiles(root, partition.periodId));
        }
      });
    });
    return files;
  }

  computeBundleSize(root, manifest = this.readManifestSync(root)) {
    return this.listBundleFiles(root, manifest).reduce((total, filePath) => {
      try { return total + Math.max(0, Number(fs.statSync(filePath).size || 0)); }
      catch (error) { return total; }
    }, 0);
  }

  buildBundleSourceFingerprint(root = this.getBundleRoot(), manifest = this.readManifestSync(root)) {
    const files = this.listBundleFiles(root, manifest)
      .map((filePath) => path.resolve(filePath))
      .sort((left, right) => String(left).localeCompare(String(right)));
    const summary = files.map((filePath) => {
      try {
        const stats = fs.statSync(filePath);
        return `${path.relative(root, filePath).replace(/\\/g, "/")}:${Math.max(0, Number(stats.size || 0))}:${Math.max(0, Number(stats.mtimeMs || 0))}:${Math.max(0, Number(stats.ctimeMs || 0))}`;
      } catch (error) {
        return `${path.relative(root, filePath).replace(/\\/g, "/")}:missing`;
      }
    });
    return crypto.createHash("sha1").update(summary.join("|")).digest("hex");
  }

  normalizePageBootstrapKey(pageKey) {
    const normalized = String(pageKey || "").trim().toLowerCase();
    return ["index", "plan", "todo", "diary", "stats", "settings"].includes(normalized)
      ? normalized
      : "index";
  }

  buildBootstrapDateKey(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  buildBootstrapPeriodId(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  buildRecentHoursScope(hours = 48) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime());
    startDate.setHours(startDate.getHours() - Math.max(1, Number(hours) || 48));
    return {
      startDate: this.buildBootstrapDateKey(startDate),
      endDate: this.buildBootstrapDateKey(endDate),
    };
  }

  buildCurrentMonthScope(anchorDate = new Date()) {
    const periodId = this.buildBootstrapPeriodId(anchorDate);
    return {
      periodIds: periodId ? [periodId] : [],
    };
  }

  buildCurrentDayScope(anchorDate = new Date()) {
    const dateKey = this.buildBootstrapDateKey(anchorDate);
    const periodId = this.buildBootstrapPeriodId(anchorDate);
    return {
      startDate: dateKey || null,
      endDate: dateKey || null,
      periodIds: periodId ? [periodId] : [],
    };
  }

  buildProjectTotalsSummary(projects = []) {
    return bundleHelper.ensureArray(projects).reduce((summary, project) => {
      const durationMs = Number.isFinite(project?.cachedTotalDurationMs)
        ? Number(project.cachedTotalDurationMs)
        : Number.isFinite(project?.totalDurationMs)
          ? Number(project.totalDurationMs)
          : 0;
      summary.projectCount += 1;
      summary.totalDurationMs += Math.max(0, durationMs);
      return summary;
    }, {
      projectCount: 0,
      totalDurationMs: 0,
    });
  }

  buildRecordIndexKey(record = {}) {
    const identifier = String(record?.id || "").trim();
    if (identifier) {
      return `id:${identifier}`;
    }
    return crypto
      .createHash("sha1")
      .update(
        JSON.stringify({
          projectId: record?.projectId || "",
          name: record?.name || "",
          startTime: record?.startTime || "",
          endTime: record?.endTime || "",
          timestamp: record?.timestamp || "",
          spendtime: record?.spendtime || "",
        }),
      )
      .digest("hex");
  }

  resolveRecordDurationMs(record = {}) {
    if (Number.isFinite(record?.durationMeta?.recordedMs)) {
      return Math.max(0, Math.round(Number(record.durationMeta.recordedMs)));
    }
    if (Number.isFinite(record?.durationMs)) {
      return Math.max(0, Math.round(Number(record.durationMs)));
    }
    const startTime = bundleHelper.normalizeDateInput(
      record?.startTime || record?.timestamp,
    );
    const endTime = bundleHelper.normalizeDateInput(
      record?.endTime || record?.timestamp || record?.startTime,
    );
    if (startTime && endTime) {
      return Math.max(0, endTime.getTime() - startTime.getTime());
    }
    return 0;
  }

  writePageBootstrapSnapshotToDbSync(
    db,
    pageKey,
    options = {},
    sourceFingerprint = "",
    payload = {},
  ) {
    const normalizedPage = this.normalizePageBootstrapKey(pageKey);
    const optionsHash = crypto
      .createHash("sha1")
      .update(JSON.stringify(options || {}))
      .digest("hex");
    db.run(
      `
        INSERT INTO page_bootstrap_snapshots (
          page_key,
          options_hash,
          source_fingerprint,
          built_at,
          loaded_period_ids_json,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_key, options_hash, source_fingerprint)
        DO UPDATE SET
          built_at = excluded.built_at,
          loaded_period_ids_json = excluded.loaded_period_ids_json,
          payload_json = excluded.payload_json
      `,
      [
        normalizedPage,
        optionsHash,
        String(sourceFingerprint || ""),
        String(payload?.builtAt || new Date().toISOString()),
        JSON.stringify(
          Array.isArray(payload?.loadedPeriodIds) ? payload.loadedPeriodIds : [],
        ),
        JSON.stringify(payload || {}),
      ],
    );
  }

  readPageBootstrapSnapshotFromDbSync(
    pageKey,
    options = {},
    sourceFingerprint = "",
  ) {
    const entry = this.getSidecarDatabaseEntrySync();
    if (!entry) {
      return null;
    }
    const optionsHash = crypto
      .createHash("sha1")
      .update(JSON.stringify(options || {}))
      .digest("hex");
    try {
      const statement = entry.db.prepare(
        `
          SELECT payload_json
          FROM page_bootstrap_snapshots
          WHERE page_key = ?
            AND options_hash = ?
            AND source_fingerprint = ?
          LIMIT 1
        `,
      );
      try {
        statement.bind([
          this.normalizePageBootstrapKey(pageKey),
          optionsHash,
          String(sourceFingerprint || ""),
        ]);
        if (!statement.step()) {
          return null;
        }
        const row = statement.getAsObject();
        var rawPayload = row?.payload_json;
      } finally {
        statement.free();
      }
      if (!rawPayload) {
        return null;
      }
      const parsed = JSON.parse(String(rawPayload));
      return isPlainObject(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  refreshPartitionFingerprintsForSectionSync(
    db,
    manifest,
    section,
    indexedAt = new Date().toISOString(),
    periodIds = null,
  ) {
    const requestedPeriodIds = normalizeRebuildPeriodIds(periodIds);
    if (requestedPeriodIds.length) {
      db.run(
        `DELETE FROM partition_fingerprints WHERE section = ? AND period_id IN (${buildSqlPlaceholders(requestedPeriodIds.length)})`,
        [section, ...requestedPeriodIds],
      );
    } else {
      db.run("DELETE FROM partition_fingerprints WHERE section = ?", [section]);
    }
    const partitions = bundleHelper
      .ensureArray(manifest?.sections?.[section]?.partitions || [])
      .filter(
        (partition) =>
          requestedPeriodIds.length === 0 ||
          requestedPeriodIds.includes(String(partition?.periodId || "").trim()),
      );
    const statement = db.prepare(`
      INSERT INTO partition_fingerprints (
        section,
        period_id,
        fingerprint,
        file_rel,
        item_count,
        min_date,
        max_date,
        indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      partitions.forEach((partition) => {
        statement.run([
          section,
          String(partition?.periodId || ""),
          String(partition?.fingerprint || ""),
          String(partition?.file || ""),
          Math.max(0, Number(partition?.count || 0)),
          partition?.minDate || null,
          partition?.maxDate || null,
          indexedAt,
        ]);
      });
    } finally {
      statement.free();
    }
  }

  rebuildRecordIndexSync(db, root, manifest, periodIds = null) {
    const requestedPeriodIds = normalizeRebuildPeriodIds(periodIds);
    if (requestedPeriodIds.length) {
      db.run(
        `DELETE FROM record_index WHERE period_id IN (${buildSqlPlaceholders(requestedPeriodIds.length)})`,
        requestedPeriodIds,
      );
    } else {
      db.run("DELETE FROM record_index");
    }
    const statement = db.prepare(`
      INSERT INTO record_index (
        record_key,
        record_id,
        period_id,
        project_id,
        start_time,
        end_time,
        timestamp,
        date_key,
        duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      bundleHelper
        .ensureArray(manifest?.sections?.records?.partitions || [])
        .filter(
          (partition) =>
            requestedPeriodIds.length === 0 ||
            requestedPeriodIds.includes(String(partition?.periodId || "").trim()),
        )
        .forEach((partition) => {
          const periodId = String(partition?.periodId || "").trim();
          const envelope = this.readPartitionEnvelopeSync(root, "records", periodId);
          bundleHelper.ensureArray(envelope?.items).forEach((record) => {
            const dateKey = this.buildBootstrapDateKey(
              record?.endTime || record?.timestamp || record?.startTime,
            );
            statement.run([
              this.buildRecordIndexKey(record),
              String(record?.id || ""),
              periodId,
              String(record?.projectId || ""),
              record?.startTime || null,
              record?.endTime || null,
              record?.timestamp || null,
              dateKey || null,
              this.resolveRecordDurationMs(record),
            ]);
          });
        });
    } finally {
      statement.free();
    }
  }

  rebuildPlanIndexSync(db, root, manifest, recurringPlans = [], options = {}) {
    const requestedPeriodIds = normalizeRebuildPeriodIds(options?.periodIds);
    const refreshRecurringExplicit = Object.prototype.hasOwnProperty.call(
      options,
      "refreshRecurring",
    );
    const refreshRecurring = refreshRecurringExplicit
      ? options.refreshRecurring === true
      : requestedPeriodIds.length === 0;
    const isPartialRebuild =
      requestedPeriodIds.length > 0 || refreshRecurringExplicit;
    if (isPartialRebuild) {
      if (requestedPeriodIds.length) {
        db.run(
          `DELETE FROM plan_index WHERE period_id IN (${buildSqlPlaceholders(requestedPeriodIds.length)})`,
          requestedPeriodIds,
        );
      }
      if (refreshRecurring) {
        db.run("DELETE FROM plan_index WHERE period_id = ?", [
          RECURRING_PLAN_PERIOD_ID,
        ]);
      }
    } else {
      db.run("DELETE FROM plan_index");
    }
    const statement = db.prepare(`
      INSERT INTO plan_index (
        plan_key,
        plan_id,
        period_id,
        plan_date,
        start_time,
        end_time,
        repeat_type,
        project_id,
        completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      bundleHelper
        .ensureArray(manifest?.sections?.plans?.partitions || [])
        .filter(
          (partition) =>
            requestedPeriodIds.length === 0 ||
            requestedPeriodIds.includes(String(partition?.periodId || "").trim()),
        )
        .forEach((partition) => {
          const periodId = String(partition?.periodId || "").trim();
          const envelope = this.readPartitionEnvelopeSync(root, "plans", periodId);
          bundleHelper.ensureArray(envelope?.items).forEach((plan) => {
            statement.run([
              this.buildRecordIndexKey(plan),
              String(plan?.id || ""),
              periodId,
              plan?.date || null,
              plan?.startTime || null,
              plan?.endTime || null,
              plan?.repeat || null,
              plan?.projectId || null,
              plan?.isCompleted ? 1 : 0,
            ]);
          });
        });
      if (refreshRecurring) {
        bundleHelper.ensureArray(recurringPlans).forEach((plan) => {
          statement.run([
            this.buildRecordIndexKey(plan),
            String(plan?.id || ""),
            RECURRING_PLAN_PERIOD_ID,
            plan?.date || null,
            plan?.startTime || null,
            plan?.endTime || null,
            plan?.repeat || null,
            plan?.projectId || null,
            plan?.isCompleted ? 1 : 0,
          ]);
        });
      }
    } finally {
      statement.free();
    }
  }

  rebuildDiaryIndexSync(db, root, manifest, periodIds = null) {
    const requestedPeriodIds = normalizeRebuildPeriodIds(periodIds);
    if (requestedPeriodIds.length) {
      db.run(
        `DELETE FROM diary_index WHERE period_id IN (${buildSqlPlaceholders(requestedPeriodIds.length)})`,
        requestedPeriodIds,
      );
    } else {
      db.run("DELETE FROM diary_index");
    }
    const statement = db.prepare(`
      INSERT INTO diary_index (
        diary_key,
        diary_id,
        period_id,
        entry_date,
        updated_at,
        category_id,
        title_preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      bundleHelper.ensureArray(
        manifest?.sections?.diaryEntries?.partitions || [],
      )
        .filter(
          (partition) =>
            requestedPeriodIds.length === 0 ||
            requestedPeriodIds.includes(String(partition?.periodId || "").trim()),
        )
        .forEach((partition) => {
        const periodId = String(partition?.periodId || "").trim();
        const envelope = this.readPartitionEnvelopeSync(root, "diaryEntries", periodId);
        bundleHelper.ensureArray(envelope?.items).forEach((entry) => {
          statement.run([
            this.buildRecordIndexKey(entry),
            String(entry?.id || ""),
            periodId,
            entry?.date || null,
            entry?.updatedAt || null,
            entry?.categoryId || null,
            String(entry?.title || "").slice(0, 160),
          ]);
        });
        });
    } finally {
      statement.free();
    }
  }

  rebuildStatsAggregateSync(db, root, manifest, periodIds = null) {
    const requestedPeriodIds = normalizeRebuildPeriodIds(periodIds);
    if (requestedPeriodIds.length) {
      requestedPeriodIds.forEach((periodId) => {
        db.run(
          `
            DELETE FROM stats_aggregate
            WHERE (bucket_kind = 'month' AND bucket_key = ?)
              OR (bucket_kind = 'day' AND bucket_key LIKE ?)
          `,
          [periodId, `${periodId}-%`],
        );
      });
    } else {
      db.run("DELETE FROM stats_aggregate");
    }
    const aggregateMap = new Map();
    const touchAggregate = (bucketKind, bucketKey, projectId, durationMs = 0) => {
      const normalizedProjectId = String(projectId || "");
      const mapKey = `${bucketKind}:${bucketKey}:${normalizedProjectId}`;
      const existing = aggregateMap.get(mapKey) || {
        bucketKind,
        bucketKey,
        projectId: normalizedProjectId,
        durationMs: 0,
        recordCount: 0,
      };
      existing.durationMs += Math.max(0, Math.round(Number(durationMs) || 0));
      existing.recordCount += 1;
      aggregateMap.set(mapKey, existing);
    };
    bundleHelper
      .ensureArray(manifest?.sections?.records?.partitions || [])
      .filter(
        (partition) =>
          requestedPeriodIds.length === 0 ||
          requestedPeriodIds.includes(String(partition?.periodId || "").trim()),
      )
      .forEach((partition) => {
        const periodId = String(partition?.periodId || "").trim();
        const envelope = this.readPartitionEnvelopeSync(root, "records", periodId);
        bundleHelper.ensureArray(envelope?.items).forEach((record) => {
          const dateKey = this.buildBootstrapDateKey(
            record?.endTime || record?.timestamp || record?.startTime,
          );
          const durationMs = this.resolveRecordDurationMs(record);
          touchAggregate("month", periodId, record?.projectId || "", durationMs);
          if (dateKey) {
            touchAggregate("day", dateKey, record?.projectId || "", durationMs);
          }
        });
      });
    const statement = db.prepare(`
      INSERT INTO stats_aggregate (
        bucket_kind,
        bucket_key,
        project_id,
        duration_ms,
        record_count
      ) VALUES (?, ?, ?, ?, ?)
    `);
    try {
      aggregateMap.forEach((entry) => {
        statement.run([
          entry.bucketKind,
          entry.bucketKey,
          entry.projectId,
          entry.durationMs,
          entry.recordCount,
        ]);
      });
    } finally {
      statement.free();
    }
  }

  async rebuildSidecarIndex(storagePath = this.storagePath, request = {}) {
    const sqlModule = await this.initializeSidecarSqliteRuntime();
    if (!sqlModule) {
      return null;
    }
    this.ensureStorageReady();
    const root = this.getBundleRoot(storagePath);
    const manifest = this.readManifestSync(root);
    if (!manifest) {
      return null;
    }
    const recurringPlans = this.readRecurringPlansSync(root);
    const sourceFingerprint =
      typeof request?.sourceFingerprint === "string" && request.sourceFingerprint
        ? request.sourceFingerprint
        : this.buildBundleSourceFingerprint(root, manifest);
    const previousMeta = this.readSidecarMetaSync(storagePath);
    const hasIncrementalChangeContext =
      request?.fullRebuild !== true &&
      Array.isArray(request?.changedSections) &&
      request.changedSections.length > 0 &&
      previousMeta.schemaVersion === this.sidecarSchemaVersion;
    const fullRebuild =
      request?.fullRebuild === true ||
      previousMeta.schemaVersion !== this.sidecarSchemaVersion ||
      (!hasIncrementalChangeContext &&
        previousMeta.sourceFingerprint !== sourceFingerprint);
    const indexedAt = new Date().toISOString();
    const entry = this.getSidecarDatabaseEntrySync(storagePath);
    if (!entry) {
      return null;
    }
    entry.db.run("BEGIN");
    try {
      if (fullRebuild || !request?.changedSections?.length) {
        ["records", "plans", "diaryEntries"].forEach((section) => {
          this.refreshPartitionFingerprintsForSectionSync(
            entry.db,
            manifest,
            section,
            indexedAt,
          );
        });
        this.rebuildRecordIndexSync(entry.db, root, manifest);
        this.rebuildPlanIndexSync(entry.db, root, manifest, recurringPlans);
        this.rebuildDiaryIndexSync(entry.db, root, manifest);
        this.rebuildStatsAggregateSync(entry.db, root, manifest);
      } else {
        const changedSections = normalizeChangedSections(request.changedSections);
        const changedPeriods = normalizeChangedPeriods(request.changedPeriods);
        if (changedSections.includes("records")) {
          const recordPeriods = changedPeriods.records || [];
          this.refreshPartitionFingerprintsForSectionSync(
            entry.db,
            manifest,
            "records",
            indexedAt,
            recordPeriods,
          );
          this.rebuildRecordIndexSync(
            entry.db,
            root,
            manifest,
            recordPeriods.length ? recordPeriods : null,
          );
          this.rebuildStatsAggregateSync(
            entry.db,
            root,
            manifest,
            recordPeriods.length ? recordPeriods : null,
          );
        }
        if (
          changedSections.includes("plans") ||
          changedSections.includes("plansRecurring")
        ) {
          const planPeriods = changedPeriods.plans || [];
          if (changedSections.includes("plans") && !planPeriods.length) {
            this.refreshPartitionFingerprintsForSectionSync(
              entry.db,
              manifest,
              "plans",
              indexedAt,
            );
            this.rebuildPlanIndexSync(entry.db, root, manifest, recurringPlans);
          } else {
            this.refreshPartitionFingerprintsForSectionSync(
              entry.db,
              manifest,
              "plans",
              indexedAt,
              planPeriods,
            );
            this.rebuildPlanIndexSync(entry.db, root, manifest, recurringPlans, {
              periodIds: changedSections.includes("plans") ? planPeriods : [],
              refreshRecurring: changedSections.includes("plansRecurring"),
            });
          }
        }
        if (changedSections.includes("diaryEntries")) {
          const diaryPeriods = changedPeriods.diaryEntries || [];
          this.refreshPartitionFingerprintsForSectionSync(
            entry.db,
            manifest,
            "diaryEntries",
            indexedAt,
            diaryPeriods,
          );
          this.rebuildDiaryIndexSync(
            entry.db,
            root,
            manifest,
            diaryPeriods.length ? diaryPeriods : null,
          );
        }
      }

      SIDECAR_PAGE_KEYS.forEach((pageKey) => {
        const payload = this.buildPageBootstrapPayload(pageKey, {});
        this.writePageBootstrapSnapshotToDbSync(
          entry.db,
          pageKey,
          {},
          sourceFingerprint,
          payload,
        );
        this.writeJsonFileSync(this.getSidecarBootstrapPath(pageKey, storagePath), {
          schemaVersion: this.sidecarSchemaVersion,
          page: pageKey,
          sourceFingerprint,
          optionsHash: crypto
            .createHash("sha1")
            .update(JSON.stringify({}))
            .digest("hex"),
          payload,
        });
      });

      this.upsertSidecarSqliteMetaValueSync(
        entry.db,
        "sourceFingerprint",
        sourceFingerprint,
      );
      this.upsertSidecarSqliteMetaValueSync(entry.db, "indexedAt", indexedAt);
      entry.db.run("COMMIT");
      entry.dirty = true;
      this.persistSidecarDatabaseSync(storagePath);
      this.writeSidecarMetaSync(storagePath, {
        storagePath: this.getBundleDisplayPath(root),
        sourceFingerprint,
        indexedAt,
        sqliteReady: true,
      });
      return {
        sourceFingerprint,
        indexedAt,
      };
    } catch (error) {
      try {
        entry.db.run("ROLLBACK");
      } catch (rollbackError) {
        // Ignore rollback failures while recovering the sidecar index.
      }
      console.error("重建 sidecar SQLite 索引失败:", error);
      throw error;
    }
  }

  requestSidecarIndexRebuild(storagePath = this.storagePath, request = {}) {
    const namespaceKey = this.getSidecarNamespaceKey(storagePath);
    const currentState = this.sidecarRebuildStateByNamespace.get(namespaceKey) || {
      running: false,
      pending: null,
      promise: Promise.resolve(null),
    };
    currentState.pending = mergeSidecarRebuildRequest(
      currentState.pending,
      request,
    );
    if (currentState.running) {
      this.sidecarRebuildStateByNamespace.set(namespaceKey, currentState);
      return currentState.promise;
    }
    currentState.running = true;
    currentState.promise = Promise.resolve()
      .then(async () => {
        while (currentState.pending) {
          const nextRequest = currentState.pending;
          currentState.pending = null;
          await this.rebuildSidecarIndex(storagePath, nextRequest);
        }
        return true;
      })
      .catch((error) => {
        console.error("Sidecar 索引刷新失败:", error);
        return false;
      })
      .finally(() => {
        currentState.running = false;
        if (!currentState.pending) {
          this.sidecarRebuildStateByNamespace.delete(namespaceKey);
        }
      });
    this.sidecarRebuildStateByNamespace.set(namespaceKey, currentState);
    return currentState.promise;
  }

  primeSidecarIfStale(storagePath = this.storagePath) {
    if (typeof initSqlJs !== "function") {
      return;
    }
    const root = this.getBundleRoot(storagePath);
    const manifest = this.readManifestSync(root);
    if (!manifest) {
      return;
    }
    const sourceFingerprint = this.buildBundleSourceFingerprint(root, manifest);
    const meta = this.readSidecarMetaSync(storagePath);
    if (
      meta.schemaVersion !== this.sidecarSchemaVersion ||
      meta.sourceFingerprint !== sourceFingerprint ||
      meta.sqliteReady !== true
    ) {
      void this.requestSidecarIndexRebuild(storagePath, {
        fullRebuild: true,
        sourceFingerprint,
      });
    }
  }

  readPageBootstrapCacheSync(pageKey, options = {}, sourceFingerprint = "") {
    try {
      const dbPayload = this.readPageBootstrapSnapshotFromDbSync(
        pageKey,
        options,
        sourceFingerprint,
      );
      if (dbPayload) {
        return dbPayload;
      }
      const cache = this.readJsonFileSync(
        this.getSidecarBootstrapPath(pageKey),
        null,
      );
      if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
        return null;
      }
      const optionsHash = crypto
        .createHash("sha1")
        .update(JSON.stringify(options || {}))
        .digest("hex");
      if (
        cache.schemaVersion !== this.sidecarSchemaVersion ||
        cache.page !== this.normalizePageBootstrapKey(pageKey) ||
        cache.sourceFingerprint !== sourceFingerprint ||
        cache.optionsHash !== optionsHash ||
        !cache.payload ||
        typeof cache.payload !== "object" ||
        Array.isArray(cache.payload)
      ) {
        return null;
      }
      return cache.payload;
    } catch (error) {
      return null;
    }
  }

  writePageBootstrapCacheSync(pageKey, options = {}, sourceFingerprint = "", payload = {}) {
    this.ensureSidecarLayout();
    const normalizedPage = this.normalizePageBootstrapKey(pageKey);
    const optionsHash = crypto
      .createHash("sha1")
      .update(JSON.stringify(options || {}))
      .digest("hex");
    this.writeJsonFileSync(this.getSidecarBootstrapPath(normalizedPage), {
      schemaVersion: this.sidecarSchemaVersion,
      page: normalizedPage,
      sourceFingerprint,
      optionsHash,
      payload,
    });
    const dbEntry = this.getSidecarDatabaseEntrySync();
    if (dbEntry) {
      this.writePageBootstrapSnapshotToDbSync(
        dbEntry.db,
        normalizedPage,
        options,
        sourceFingerprint,
        payload,
      );
      dbEntry.dirty = true;
      this.persistSidecarDatabaseSync();
    }
    const meta = this.readSidecarMetaSync();
    const nextPages =
      meta.pages && typeof meta.pages === "object" && !Array.isArray(meta.pages)
        ? meta.pages
        : {};
    this.writeSidecarMetaSync(this.storagePath, {
      storagePath: this.getBundleDisplayPath(this.getBundleRoot(this.storagePath)),
      sourceFingerprint,
      pages: {
        ...nextPages,
        [normalizedPage]: {
          sourceFingerprint,
          builtAt:
            typeof payload?.builtAt === "string" && payload.builtAt
              ? payload.builtAt
              : new Date().toISOString(),
          optionsHash,
        },
      },
    });
  }

  buildPageBootstrapPayload(pageKey, options = {}) {
    const normalizedPage = this.normalizePageBootstrapKey(pageKey);
    const root = this.getBundleRoot(this.storagePath);
    const core = this.repairStoredCoreProjectsIfNeeded(root);
    const manifest = this.readManifestSync(root);
    const recurringPlans = this.readRecurringPlansSync(root);
    const sourceFingerprint = this.buildBundleSourceFingerprint(root, manifest);
    const builtAt = new Date().toISOString();
    let loadedPeriodIds = [];
    let data = {};

    if (normalizedPage === "index") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : this.buildRecentHoursScope(48);
      const range = this.loadSectionRange("records", recordScope);
      loadedPeriodIds = bundleHelper.ensureArray(range?.periodIds);
      data = {
        projects: bundleHelper.cloneValue(core?.projects || []),
        recentRecords: bundleHelper.cloneValue(range?.items || []),
        timerSessionState: null,
        projectTotalsSummary: this.buildProjectTotalsSummary(core?.projects),
      };
    } else if (normalizedPage === "plan") {
      const planScope =
        options?.planScope && typeof options.planScope === "object"
          ? options.planScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : this.buildCurrentMonthScope();
      const range = this.loadSectionRange("plans", planScope);
      loadedPeriodIds = bundleHelper.ensureArray(range?.periodIds);
      data = {
        visiblePlans: bundleHelper.cloneValue(range?.items || []),
        recurringPlans: bundleHelper.cloneValue(recurringPlans),
        yearlyGoals: bundleHelper.cloneValue(core?.yearlyGoals || {}),
      };
    } else if (normalizedPage === "todo") {
      const dailyCheckinScope =
        options?.dailyCheckinScope && typeof options.dailyCheckinScope === "object"
          ? options.dailyCheckinScope
          : this.buildCurrentDayScope();
      const checkinScope =
        options?.checkinScope && typeof options.checkinScope === "object"
          ? options.checkinScope
          : this.buildCurrentMonthScope();
      const dailyRange = this.loadSectionRange("dailyCheckins", dailyCheckinScope);
      const checkinRange = this.loadSectionRange("checkins", checkinScope);
      loadedPeriodIds = Array.from(new Set([
        ...bundleHelper.ensureArray(dailyRange?.periodIds),
        ...bundleHelper.ensureArray(checkinRange?.periodIds),
      ])).sort((left, right) => String(left).localeCompare(String(right)));
      data = {
        todos: bundleHelper.cloneValue(core?.todos || []),
        checkinItems: bundleHelper.cloneValue(core?.checkinItems || []),
        todayDailyCheckins: bundleHelper.cloneValue(dailyRange?.items || []),
        recentCheckins: bundleHelper.cloneValue(checkinRange?.items || []),
      };
    } else if (normalizedPage === "diary") {
      const diaryScope =
        options?.diaryScope && typeof options.diaryScope === "object"
          ? options.diaryScope
          : Array.isArray(options?.periodIds) && options.periodIds.length
            ? { periodIds: options.periodIds }
            : this.buildCurrentMonthScope();
      const range = this.loadSectionRange("diaryEntries", diaryScope);
      loadedPeriodIds = bundleHelper.ensureArray(range?.periodIds);
      data = {
        currentMonthEntries: bundleHelper.cloneValue(range?.items || []),
        diaryCategories: bundleHelper.cloneValue(core?.diaryCategories || []),
        guideState: bundleHelper.cloneValue(core?.guideState || guideBundle.getDefaultGuideState()),
      };
    } else if (normalizedPage === "stats") {
      const recordScope =
        options?.recordScope && typeof options.recordScope === "object"
          ? options.recordScope
          : this.buildCurrentMonthScope();
      const range = this.loadSectionRange("records", recordScope);
      loadedPeriodIds = bundleHelper.ensureArray(range?.periodIds);
      data = {
        projects: bundleHelper.cloneValue(core?.projects || []),
        defaultRangeRecordsOrAggregate: bundleHelper.cloneValue(range?.items || []),
        statsPreferences: {},
      };
    } else {
      data = {
        storageStatus: this.getStorageStatus(),
        autoBackupStatus: this.getAutoBackupStatus(),
        themeSummary: {
          selectedTheme:
            typeof core?.selectedTheme === "string" && core.selectedTheme.trim()
              ? core.selectedTheme.trim()
              : "default",
          customThemeCount: Array.isArray(core?.customThemes) ? core.customThemes.length : 0,
          hasBuiltInOverrides:
            core?.builtInThemeOverrides &&
            typeof core.builtInThemeOverrides === "object" &&
            !Array.isArray(core.builtInThemeOverrides) &&
            Object.keys(core.builtInThemeOverrides).length > 0,
        },
        navigationVisibility: null,
      };
    }

    return {
      page: normalizedPage,
      sourceFingerprint,
      builtAt,
      loadedPeriodIds,
      data,
    };
  }

  getPageBootstrapState(pageKey, options = {}) {
    this.ensureStorageReady();
    this.primeSidecarIfStale(this.storagePath);
    const normalizedPage = this.normalizePageBootstrapKey(pageKey);
    const normalizedOptions =
      options && typeof options === "object" && !Array.isArray(options)
        ? bundleHelper.cloneValue(options)
        : {};
    const root = this.getBundleRoot(this.storagePath);
    const manifest = this.readManifestSync(root);
    const sourceFingerprint = this.buildBundleSourceFingerprint(root, manifest);
    this.ensureSidecarLayout();
    const cachedPayload = this.readPageBootstrapCacheSync(
      normalizedPage,
      normalizedOptions,
      sourceFingerprint,
    );
    if (cachedPayload) {
      return cachedPayload;
    }
    const payload = this.buildPageBootstrapPayload(
      normalizedPage,
      normalizedOptions,
    );
    this.writePageBootstrapCacheSync(
      normalizedPage,
      normalizedOptions,
      sourceFingerprint,
      payload,
    );
    return payload;
  }

  inspectStorageVersion(targetPath = this.storagePath, options = {}) {
    const root = this.getBundleRoot(targetPath);
    const manifestPath = this.getManifestPath(root);
    const basePath = fs.existsSync(manifestPath) ? manifestPath : this.getLegacyFilePath(targetPath);
    if (!fs.existsSync(basePath)) {
      return { exists: false, size: 0, modifiedAt: 0, mtimeMs: 0, ctimeMs: 0, actualUri: root, fingerprint: "", baseFingerprint: "", supportsModifiedAt: false, fallbackHashUsed: false };
    }
    const stats = fs.statSync(basePath);
    const size = fs.existsSync(manifestPath) ? this.computeBundleSize(root) : Math.max(0, Number(stats.size || 0));
    const mtimeMs = Math.max(0, Number(stats.mtimeMs || 0));
    const ctimeMs = Math.max(0, Number(stats.ctimeMs || 0));
    const modifiedAt = Math.max(mtimeMs, ctimeMs);
    const baseFingerprint = `${fs.existsSync(manifestPath) ? "bundle" : "legacy"}:${size}:${mtimeMs}:${ctimeMs}`;
    const hash = options.includeHash === true ? crypto.createHash("sha1").update(fs.readFileSync(basePath)).digest("hex") : "";
    return {
      exists: true,
      size,
      modifiedAt,
      mtimeMs,
      ctimeMs,
      actualUri: fs.existsSync(manifestPath) ? root : basePath,
      fingerprint: hash ? `${baseFingerprint}:${hash}` : baseFingerprint,
      baseFingerprint,
      supportsModifiedAt: modifiedAt > 0,
      fallbackHashUsed: !!hash,
    };
  }

  markKnownFileVersion(options = {}) {
    this.lastKnownFileVersion = options.version || this.inspectStorageVersion(this.storagePath, options);
    return this.lastKnownFileVersion;
  }

  buildBundlePayloadFromState(rawState, root, options = {}) {
    const storagePath = this.getBundleDisplayPath(root);
    const normalized = this.normalizeStorageData(rawState, {
      storagePath,
      touchModified: options.touchModified === true,
      touchSyncSave: options.touchSyncSave === true,
      pendingWriteCount: Number.isFinite(options.pendingWriteCount) ? options.pendingWriteCount : 0,
    });
    return bundleHelper.splitLegacyState(normalized, {
      storagePath,
      storageDirectory: root,
      userDataPath: this.userDataPath,
      documentsPath: this.documentsPath,
      fileName: this.getBundleSyncFileName(),
      legacyBackups: Array.isArray(options.legacyBackups) ? options.legacyBackups : this.readManifestSync(root)?.legacyBackups || [],
    });
  }

  writeBundlePayloadSync(root, payload, previousManifest = this.readManifestSync(root)) {
    fs.ensureDirSync(root);
    const desiredFiles = new Set();
    this.writeJsonFileSync(this.getCorePath(root), payload.core);
    this.writeJsonFileSync(this.getRecurringPlansPath(root), payload.recurringPlans);
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      const partitions = payload.partitionMap?.[section];
      if (!(partitions instanceof Map)) return;
      partitions.forEach((items, periodId) => {
        const relativePath = bundleHelper.getPartitionRelativePath(section, periodId);
        desiredFiles.add(relativePath);
        this.writeJsonFileSync(path.join(root, relativePath), bundleHelper.createPartitionEnvelope(section, periodId, items));
        if (section === "records") {
          fs.removeSync(this.getRecordPartitionPatchDir(root, periodId));
        }
      });
    });
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      (previousManifest?.sections?.[section]?.partitions || []).forEach((partition) => {
        if (section === "records") {
          fs.removeSync(this.getRecordPartitionPatchDir(root, partition.periodId));
        }
        if (!desiredFiles.has(partition.file)) fs.removeSync(path.join(root, partition.file));
      });
    });
    this.writeJsonFileSync(this.getManifestPath(root), payload.manifest);
  }

  writeBundleFromState(root, rawState, options = {}) {
    const payload = this.buildBundlePayloadFromState(rawState, root, options);
    this.writeBundlePayloadSync(root, payload);
    return this.normalizeStorageData(bundleHelper.buildLegacyStateFromBundle(payload), {
      storagePath: this.getBundleDisplayPath(root),
    });
  }

  loadBundleStateSync(root = this.getBundleRoot()) {
    const manifest = this.readManifestSync(root);
    if (!manifest) return null;
    const partitionMap = {};
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      const sectionMap = new Map();
      (manifest.sections?.[section]?.partitions || []).forEach((partition) => {
        const envelope = this.readPartitionEnvelopeSync(root, section, partition.periodId);
        sectionMap.set(partition.periodId, envelope.items || []);
      });
      partitionMap[section] = sectionMap;
    });
    return this.normalizeStorageData(bundleHelper.buildLegacyStateFromBundle({
      manifest,
      core: this.repairStoredCoreProjectsIfNeeded(root),
      recurringPlans: this.readRecurringPlansSync(root),
      partitionMap,
    }), {
      storagePath: this.getBundleDisplayPath(root),
      pendingWriteCount: this.pendingWriteCount,
    });
  }

  validateStorageData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("无效的数据格式");
    if (!Array.isArray(data.projects) || !Array.isArray(data.records)) throw new Error("缺少必需的数据字段");
    return data;
  }

  remapProjectIdsInArray(items = [], projectIdMap = new Map()) {
    return bundleHelper.ensureArray(items).map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return bundleHelper.cloneValue(item);
      }
      const sourceProjectId = String(item.projectId || "").trim();
      if (!sourceProjectId || !projectIdMap.has(sourceProjectId)) {
        return bundleHelper.cloneValue(item);
      }
      return {
        ...bundleHelper.cloneValue(item),
        projectId: projectIdMap.get(sourceProjectId) || null,
      };
    });
  }

  remapImportedProjectReferences(importedState, reconciliation = {}) {
    const nextImported = this.normalizeStorageData(importedState, {
      storagePath: importedState?.storagePath || this.storagePath,
    });
    nextImported.projects = bundleHelper.cloneValue(reconciliation.projects || []);
    nextImported.records = externalImportHelper.applyProjectMappingToRecords(
      nextImported.records,
      reconciliation,
    );
    nextImported.plans = this.remapProjectIdsInArray(
      nextImported.plans,
      reconciliation.projectIdMap,
    );
    nextImported.todos = this.remapProjectIdsInArray(
      nextImported.todos,
      reconciliation.projectIdMap,
    );
    nextImported.checkinItems = this.remapProjectIdsInArray(
      nextImported.checkinItems,
      reconciliation.projectIdMap,
    );
    return nextImported;
  }

  collectRecordDateKeys(records = []) {
    return Array.from(
      bundleHelper.ensureArray(records).reduce((dates, record) => {
        const dateKey = externalImportHelper.normalizeDateKey(
          record?.endTime || record?.timestamp || record?.startTime,
        );
        if (dateKey) {
          dates.add(dateKey);
        }
        return dates;
      }, new Set()),
    ).sort((left, right) => String(left).localeCompare(String(right)));
  }

  collectAffectedPeriodIdsFromState(state = {}) {
    const affectedPeriodIds = new Set();
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      bundleHelper.ensureArray(state?.[section]).forEach((item) => {
        const periodId = bundleHelper.getPeriodIdForSectionItem(section, item);
        if (periodId) {
          affectedPeriodIds.add(periodId);
        }
      });
    });
    return Array.from(affectedPeriodIds).sort((left, right) =>
      String(left).localeCompare(String(right)),
    );
  }

  buildImportMetrics(state = {}, extras = {}) {
    return {
      affectedPeriodIds: this.collectAffectedPeriodIdsFromState(state),
      affectedDates: this.collectRecordDateKeys(state?.records || []),
      matchedProjects: Math.max(0, Number(extras.matchedProjects || 0)),
      createdProjects: Math.max(0, Number(extras.createdProjects || 0)),
      replacedDays: Math.max(0, Number(extras.replacedDays || 0)),
    };
  }

  replaceCoreStateInternal(partialCore = {}, options = {}) {
    this.ensureStorageReady();
    const root = this.getBundleRoot(this.storagePath);
    const currentCore = this.readCoreSync(root);
    const nextCore = {
      ...currentCore,
      ...bundleHelper.ensureObject(partialCore, {}),
      lastModified: new Date().toISOString(),
      storagePath: this.storagePath,
      storageDirectory: root,
      userDataPath: this.userDataPath,
      documentsPath: this.documentsPath,
    };
    if (Object.prototype.hasOwnProperty.call(partialCore, "projects")) {
      nextCore.projects = bundleHelper.reconcileProjectDurationCaches(
        bundleHelper.ensureArray(partialCore.projects),
        bundleHelper.ensureArray(currentCore.projects),
      );
    } else {
      nextCore.projects = bundleHelper.recalculateProjectDurationTotals(
        bundleHelper.ensureArray(currentCore.projects),
      );
    }
    this.writeJsonFileSync(this.getCorePath(root), nextCore);
    const manifest = this.readManifestSync(root);
    if (manifest) {
      manifest.lastModified = nextCore.lastModified;
      this.writeJsonFileSync(this.getManifestPath(root), manifest);
    }
    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    const changeReason =
      typeof options.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "core-replace";
    if (options.emitChange !== false) {
      this.emitChange(changeReason, {
        changedSections: inferChangedSectionsFromCorePatch(partialCore),
      });
      this.maybeRunAutoBackup({ reason: changeReason });
    }
    return nextCore;
  }

  saveRecordPatchRangeInternal(payload = {}, options = {}) {
    const periodId = bundleHelper.normalizePeriodId(payload.periodId);
    if (!periodId) {
      throw new Error("分区 periodId 无效");
    }
    const root = this.getBundleRoot(this.storagePath);
    const currentCore = this.readCoreSync(root);
    const normalizedIncoming = bundleHelper.attachProjectIdsToRecords(
      bundleHelper.ensureArray(payload.items),
      currentCore.projects || [],
    );
    const normalizedRemoved = bundleHelper.attachProjectIdsToRecords(
      bundleHelper.ensureArray(payload.removedItems),
      currentCore.projects || [],
    );
    if (!bundleHelper.validateItemsForPeriod("records", periodId, normalizedIncoming)) {
      throw new Error("分区文件中的项目不属于目标月份");
    }
    if (!bundleHelper.validateItemsForPeriod("records", periodId, normalizedRemoved)) {
      throw new Error("删除项目中的记录不属于目标月份");
    }
    const patchEnvelope = this.buildRecordPartitionPatchEnvelope(periodId, {
      upsertItems: normalizedIncoming,
      removedItems: normalizedRemoved,
      removeIds: payload.removeIds,
    });
    if (
      !bundleHelper.ensureArray(patchEnvelope.upsertItems).length &&
      !bundleHelper.ensureArray(patchEnvelope.removeIds).length
    ) {
      const currentEnvelope = this.readPartitionEnvelopeSync(root, "records", periodId);
      return {
        section: "records",
        periodId,
        count: currentEnvelope.count,
        mode: "patch",
        patched: false,
      };
    }

    const relativePath = bundleHelper.getPartitionRelativePath("records", periodId);
    const partitionPath = path.join(root, relativePath);
    if (!fs.existsSync(partitionPath)) {
      this.writeJsonFileSync(
        partitionPath,
        bundleHelper.createPartitionEnvelope("records", periodId, []),
      );
    }
    this.appendRecordPartitionPatchSync(root, periodId, patchEnvelope);
    const allPatchEnvelopes = this.readRecordPartitionPatchEnvelopesSync(root, periodId);
    const previousPatchEnvelopes =
      allPatchEnvelopes.length > 1 ? allPatchEnvelopes.slice(0, -1) : [];
    const latestPatchEnvelope =
      allPatchEnvelopes.length > 0 ? allPatchEnvelopes[allPatchEnvelopes.length - 1] : patchEnvelope;

    const manifest = this.readManifestSync(root) || bundleHelper.createEmptyBundle().manifest;
    const partitions = (manifest.sections?.records?.partitions || []).filter(
      (partition) => partition.periodId !== periodId,
    );
    const nextPartition = this.buildRecordManifestPartitionFromPatch(
      root,
      manifest,
      periodId,
      latestPatchEnvelope,
      previousPatchEnvelopes,
    );
    if (nextPartition) {
      partitions.push(nextPartition);
    }
    partitions.sort((left, right) => String(left.periodId).localeCompare(String(right.periodId)));
    manifest.lastModified = new Date().toISOString();
    manifest.sections.records = {
      periodUnit: bundleHelper.PERIOD_UNIT,
      partitions,
    };
    currentCore.projects = bundleHelper.applyProjectRecordDurationChanges(
      currentCore.projects || [],
      {
        removedRecords: normalizedRemoved,
        addedRecords: normalizedIncoming,
      },
    );
    currentCore.lastModified = manifest.lastModified;
    currentCore.storagePath = this.storagePath;
    currentCore.storageDirectory = root;
    currentCore.userDataPath = this.userDataPath;
    currentCore.documentsPath = this.documentsPath;
    this.writeJsonFileSync(this.getCorePath(root), currentCore);
    this.writeJsonFileSync(this.getManifestPath(root), manifest);
    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    if (allPatchEnvelopes.length >= RECORD_PARTITION_PATCH_COMPACT_THRESHOLD) {
      this.scheduleRecordPartitionCompaction(this.storagePath, periodId);
    }
    if (options.emitChange !== false) {
      this.emitChange("section-save", {
        changedSections: ["records"],
        changedPeriods: { records: [periodId] },
      });
      this.maybeRunAutoBackup({
        reason: "section-save",
        changedSections: ["records"],
        changedPeriods: { records: [periodId] },
      });
    }
    return {
      section: "records",
      periodId,
      count: Math.max(0, Number(nextPartition?.count || 0)),
      mode: "patch",
      patched: true,
      patchCount: allPatchEnvelopes.length,
    };
  }

  saveSectionRangeInternal(section, payload = {}, options = {}) {
    this.ensureStorageReady();
    if (!bundleHelper.PARTITIONED_SECTIONS.includes(section)) throw new Error(`不支持的 section: ${section}`);
    if (section === "records" && payload?.mode === "patch") {
      return this.saveRecordPatchRangeInternal(payload, options);
    }
    const periodId = bundleHelper.normalizePeriodId(payload.periodId);
    if (!periodId) throw new Error("分区 periodId 无效");
    const incomingItems = bundleHelper.ensureArray(payload.items);
    if (!bundleHelper.validateItemsForPeriod(section, periodId, incomingItems)) throw new Error("分区文件中的项目不属于目标月份");
    const root = this.getBundleRoot(this.storagePath);
    const currentCore = this.readCoreSync(root);
    const existing = this.readPartitionEnvelopeSync(root, section, periodId).items || [];
    const normalizedExisting =
      section === "records"
        ? bundleHelper.attachProjectIdsToRecords(
            existing,
            currentCore.projects || [],
          )
        : existing;
    const normalizedIncoming =
      section === "records"
        ? bundleHelper.attachProjectIdsToRecords(
            incomingItems,
            currentCore.projects || [],
          )
        : incomingItems;
    const mergedItems = bundleHelper.mergePartitionItems(
      section,
      normalizedExisting,
      normalizedIncoming,
      payload.mode === "merge" ? "merge" : "replace",
    );
    const relativePath = bundleHelper.getPartitionRelativePath(section, periodId);
    if (mergedItems.length) this.writeJsonFileSync(path.join(root, relativePath), bundleHelper.createPartitionEnvelope(section, periodId, mergedItems));
    else fs.removeSync(path.join(root, relativePath));
    if (section === "records") {
      fs.removeSync(this.getRecordPartitionPatchDir(root, periodId));
    }
    const manifest = this.readManifestSync(root) || bundleHelper.createEmptyBundle().manifest;
    const partitions = (manifest.sections?.[section]?.partitions || []).filter((partition) => partition.periodId !== periodId);
    if (mergedItems.length) {
      const envelope = bundleHelper.createPartitionEnvelope(section, periodId, mergedItems);
      partitions.push({ periodId: envelope.periodId, file: relativePath, count: envelope.count, minDate: envelope.minDate, maxDate: envelope.maxDate, fingerprint: envelope.fingerprint });
    }
    partitions.sort((left, right) => String(left.periodId).localeCompare(String(right.periodId)));
    manifest.lastModified = new Date().toISOString();
    manifest.sections[section] = { periodUnit: bundleHelper.PERIOD_UNIT, partitions };
    if (section === "records") {
      currentCore.projects = bundleHelper.applyProjectRecordDurationChanges(
        currentCore.projects || [],
        {
          removedRecords: normalizedExisting,
          addedRecords: mergedItems,
        },
      );
      currentCore.lastModified = manifest.lastModified;
      currentCore.storagePath = this.storagePath;
      currentCore.storageDirectory = root;
      currentCore.userDataPath = this.userDataPath;
      currentCore.documentsPath = this.documentsPath;
      this.writeJsonFileSync(this.getCorePath(root), currentCore);
    }
    this.writeJsonFileSync(this.getManifestPath(root), manifest);
    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    if (options.emitChange !== false) {
      this.emitChange("section-save", { changedSections: [section], changedPeriods: { [section]: [periodId] } });
      this.maybeRunAutoBackup({
        reason: "section-save",
        changedSections: [section],
        changedPeriods: { [section]: [periodId] },
      });
    }
    return { section, periodId, count: mergedItems.length };
  }

  mergeRecurringPlans(existingItems = [], incomingItems = []) {
    return bundleHelper
      .mergePartitionItems(
        "plans",
        bundleHelper.ensureArray(existingItems).filter((item) => bundleHelper.isRecurringPlan(item)),
        bundleHelper.ensureArray(incomingItems).filter((item) => bundleHelper.isRecurringPlan(item)),
        "merge",
      )
      .filter((item) => bundleHelper.isRecurringPlan(item));
  }

  mergeFullImportState(currentState, importedState) {
    const root = this.getBundleRoot(this.storagePath);
    const storagePath = this.getBundleDisplayPath(root);
    const current = this.normalizeStorageData(currentState, { storagePath });
    const imported = this.normalizeStorageData(importedState, { storagePath });
    const projectReconciliation = externalImportHelper.reconcileProjectsByName(
      current.projects,
      imported.projects,
    );
    const importedWithProjectMapping = this.remapImportedProjectReferences(
      imported,
      projectReconciliation,
    );
    const currentBundle = bundleHelper.splitLegacyState(current, {
      storagePath,
      storageDirectory: root,
      userDataPath: this.userDataPath,
      documentsPath: this.documentsPath,
      fileName: this.getBundleSyncFileName(),
    });
    const importedBundle = bundleHelper.splitLegacyState(importedWithProjectMapping, {
      storagePath,
      storageDirectory: root,
      userDataPath: this.userDataPath,
      documentsPath: this.documentsPath,
      fileName: this.getBundleSyncFileName(),
    });
    const next = this.normalizeStorageData(current, { storagePath });

    DIFF_IMPORT_CORE_KEYS.forEach((key) => {
      next[key] = bundleHelper.cloneValue(importedWithProjectMapping[key]);
    });
    next.projects = bundleHelper.cloneValue(projectReconciliation.projects);

    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      const currentSectionMap = currentBundle.partitionMap?.[section] instanceof Map
        ? currentBundle.partitionMap[section]
        : new Map();
      const importedSectionMap = importedBundle.partitionMap?.[section] instanceof Map
        ? importedBundle.partitionMap[section]
        : new Map();
      const mergedSectionMap = new Map();

      currentSectionMap.forEach((items, periodId) => {
        mergedSectionMap.set(periodId, bundleHelper.cloneValue(items));
      });

      importedSectionMap.forEach((items, periodId) => {
        const mergedItems = bundleHelper.mergePartitionItems(
          section,
          mergedSectionMap.get(periodId) || [],
          items,
          "merge",
        );
        if (mergedItems.length) mergedSectionMap.set(periodId, mergedItems);
        else mergedSectionMap.delete(periodId);
      });

      const flattenedItems = [];
      Array.from(mergedSectionMap.keys())
        .sort((left, right) => String(left).localeCompare(String(right)))
        .forEach((periodId) => {
          flattenedItems.push(...bundleHelper.ensureArray(mergedSectionMap.get(periodId)));
        });
      next[section] = bundleHelper.sortPartitionItems(section, flattenedItems);
    });

    const nextRecurringPlans = this.mergeRecurringPlans(
      currentBundle.recurringPlans,
      importedBundle.recurringPlans,
    );
    next.plans = bundleHelper.sortPartitionItems("plans", [
      ...bundleHelper.ensureArray(next.plans).filter((item) => !bundleHelper.isRecurringPlan(item)),
      ...nextRecurringPlans,
    ]);
    next.createdAt = current.createdAt || imported.createdAt || new Date().toISOString();
    next.lastModified = new Date().toISOString();
    next.syncMeta = {
      ...bundleHelper.cloneValue(current.syncMeta || {}),
      mode: bundleHelper.BUNDLE_MODE,
      fileName: this.getBundleSyncFileName(),
      autoSyncEnabled: true,
    };
    const mergedState = this.normalizeStorageData(next, {
      storagePath,
      touchModified: true,
      touchSyncSave: true,
    });
    return {
      state: mergedState,
      ...this.buildImportMetrics(importedWithProjectMapping, {
        matchedProjects: projectReconciliation.matchedProjects,
        createdProjects: projectReconciliation.createdProjects,
        replacedDays: 0,
      }),
    };
  }

  async importExternalJsonSource(options = {}) {
    this.ensureStorageReady();
    const filePath =
      typeof options.filePath === "string" && options.filePath.trim()
        ? path.resolve(options.filePath.trim())
        : "";
    const payload =
      options.payload !== undefined
        ? options.payload
        : filePath
          ? this.readJsonFileSync(filePath, null)
          : null;
    if (payload === null || payload === undefined) {
      throw new Error("外部 JSON 导入缺少可读取的数据源");
    }

    const externalConfig =
      options.externalConfig && typeof options.externalConfig === "object"
        ? options.externalConfig
        : {};
    const normalizedExternal = externalImportHelper.normalizeExternalRecords(
      payload,
      externalConfig,
    );
    if (!normalizedExternal.validCount || !normalizedExternal.records.length) {
      throw new Error("外部 JSON 中没有可导入的有效时间记录");
    }

    const currentState = this.loadStorageData();
    const projectReconciliation = externalImportHelper.reconcileProjectsByName(
      currentState.projects,
      normalizedExternal.projectNames.map((name) => ({ name })),
    );
    const mappedRecords = externalImportHelper.applyProjectMappingToRecords(
      normalizedExternal.records,
      projectReconciliation,
    );

    if (projectReconciliation.createdProjects > 0) {
      this.replaceCoreStateInternal(
        {
          projects: projectReconciliation.projects,
        },
        { emitChange: false },
      );
    }

    const changedPeriods = {};
    let replacedDays = 0;
    normalizedExternal.affectedPeriodIds.forEach((periodId) => {
      const existingItems =
        this.readPartitionEnvelopeSync(
          this.getBundleRoot(this.storagePath),
          "records",
          periodId,
        ).items || [];
      const incomingItems = mappedRecords.filter(
        (record) =>
          bundleHelper.getPeriodIdForSectionItem("records", record) === periodId,
      );
      const mergeResult = externalImportHelper.mergeRecordsByReplacingDays(
        existingItems,
        incomingItems,
      );
      replacedDays += Math.max(0, Number(mergeResult.replacedDays || 0));
      this.saveSectionRangeInternal(
        "records",
        {
          periodId,
          items: mergeResult.records,
          mode: "replace",
        },
        { emitChange: false },
      );
    });
    if (normalizedExternal.affectedPeriodIds.length) {
      changedPeriods.records = normalizedExternal.affectedPeriodIds.slice();
    }

    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    const changedSections =
      projectReconciliation.createdProjects > 0
        ? ["projects", "records"]
        : ["records"];

    this.emitChange("import", {
      changedSections,
      changedPeriods,
      source: "import:external-json",
    });
    this.maybeRunAutoBackup({ reason: "import:external-json" });

    return {
      ok: true,
      type: "external-json",
      sourceKind: externalImportHelper.SOURCE_KIND,
      conflictUnit:
        typeof options.conflictUnit === "string" && options.conflictUnit.trim()
          ? options.conflictUnit.trim()
          : externalImportHelper.DEFAULT_CONFLICT_UNIT,
      projectMapping:
        typeof options.projectMapping === "string" && options.projectMapping.trim()
          ? options.projectMapping.trim()
          : externalImportHelper.DEFAULT_PROJECT_MAPPING,
      filePath,
      changedSections,
      changedPeriods,
      affectedPeriodIds: normalizedExternal.affectedPeriodIds.slice(),
      affectedDates: normalizedExternal.affectedDates.slice(),
      createdProjects: projectReconciliation.createdProjects,
      matchedProjects: projectReconciliation.matchedProjects,
      replacedDays,
      importedCount: mappedRecords.length,
      invalidCount: normalizedExternal.invalidCount,
    };
  }

  migrateLegacyFileToBundleRoot(legacyFilePath, root) {
    const parsed = JSON.parse(fs.readFileSync(legacyFilePath, "utf8"));
    this.validateStorageData(parsed);
    const backupName = `controler-data.legacy-${this.createTimestampTag()}.json`;
    const backupPath = path.join(root, backupName);
    const payload = this.buildBundlePayloadFromState(parsed, root, {
      touchModified: true,
      touchSyncSave: true,
      legacyBackups: [...(this.readManifestSync(root)?.legacyBackups || []), { file: backupName, source: "legacy-auto-migration", createdAt: new Date().toISOString() }],
    });
    this.writeBundlePayloadSync(root, payload, null);
    fs.moveSync(legacyFilePath, backupPath, { overwrite: false });
    return backupPath;
  }

  ensureStorageReady() {
    this.storagePath = this.resolveStoragePathFromConfig();
    const root = this.getBundleRoot(this.storagePath);
    let migratedLegacyData = false;
    fs.ensureDirSync(root);
    if (this.bundleExists(root)) {
      this.startWatching();
      return;
    }
    const legacyFile = this.getLegacyFilePath(this.storagePath);
    if (fs.existsSync(legacyFile)) {
      try {
        this.migrateLegacyFileToBundleRoot(legacyFile, root);
        migratedLegacyData = true;
      } catch (error) { console.error("迁移旧单文件失败:", error); }
    } else if (this.storagePath !== this.legacyStoragePath && fs.existsSync(this.legacyStoragePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.legacyStoragePath, "utf8"));
        this.validateStorageData(parsed);
        this.writeBundleFromState(root, parsed, { touchModified: true, touchSyncSave: true });
        migratedLegacyData = true;
      } catch (error) {
        console.error("迁移旧存储文件失败:", error);
      }
    }
    if (!this.bundleExists(root)) {
      this.writeBundleFromState(root, this.createDefaultStorageData(), { touchModified: true, touchSyncSave: true });
    }
    this.writeConfig({ storagePath: this.getBundleDisplayPath(root) });
    this.startWatching();
    if (migratedLegacyData) {
      this.maybeRunAutoBackup({ reason: "legacy-migration" });
    }
  }

  loadStorageData() {
    try {
      this.ensureStorageReady();
      this.cachedStorageSnapshot = this.loadBundleStateSync(this.getBundleRoot(this.storagePath));
      this.markKnownFileVersion({ includeHash: true });
      return this.cachedStorageSnapshot;
    } catch (error) {
      console.error("加载存储数据失败:", error);
      return this.normalizeStorageData(this.createDefaultStorageData(), { storagePath: this.storagePath });
    }
  }

  async loadStorageSnapshot() { return this.loadStorageData(); }

  saveStorageData(data, options = {}) {
    try {
      this.ensureStorageReady();
      const current = this.loadStorageData();
      const incoming = data && typeof data === "object" ? data : {};
      const next = options.replace ? incoming : { ...current, ...incoming };
      this.cachedStorageSnapshot = this.writeBundleFromState(this.getBundleRoot(this.storagePath), next, { touchModified: true, touchSyncSave: true });
      this.markKnownFileVersion({ includeHash: true });
      this.emitChange(options.reason || "save");
      this.maybeRunAutoBackup({ reason: options.reason || "save" });
      return true;
    } catch (error) {
      console.error("保存存储数据失败:", error);
      return false;
    }
  }

  saveStorageSnapshot(data, options = {}) {
    try {
      const normalizedChangedSections = normalizeChangedSections(
        options.changedSections,
      );
      const normalizedChangedPeriods = normalizeChangedPeriods(
        options.changedPeriods,
      );
      this.pendingSnapshot = this.normalizeStorageData(data, {
        storagePath: this.storagePath,
        touchModified: true,
        touchSyncSave: true,
        pendingWriteCount: this.pendingWriteCount + 1,
      });
      this.pendingWriteReason = typeof options.reason === "string" && options.reason.trim() ? options.reason.trim() : "save";
      this.pendingWriteChangedSections = normalizeChangedSections([
        ...this.pendingWriteChangedSections,
        ...normalizedChangedSections,
      ]);
      this.pendingWriteChangedPeriods = mergeChangedPeriods(
        this.pendingWriteChangedPeriods,
        normalizedChangedPeriods,
      );
      this.pendingWriteCount += 1;
      void this.flushPendingWrites();
      return true;
    } catch (error) {
      console.error("队列化保存存储数据失败:", error);
      return false;
    }
  }

  async flushPendingWrites() {
    if (this.flushInFlight) return this.flushInFlight;
    if (!this.pendingSnapshot) return this.getStorageStatus();
    this.flushInFlight = Promise.resolve().then(async () => {
      let latestStatus = this.getStorageStatus();
      while (this.pendingSnapshot) {
        const snapshot = this.pendingSnapshot;
        const reason = this.pendingWriteReason || "save";
        const changedSections = normalizeChangedSections(
          this.pendingWriteChangedSections,
        );
        const changedPeriods = normalizeChangedPeriods(
          this.pendingWriteChangedPeriods,
        );
        this.pendingSnapshot = null;
        this.pendingWriteReason = "";
        this.pendingWriteChangedSections = [];
        this.pendingWriteChangedPeriods = {};
        this.pendingWriteCount = 0;
        this.cachedStorageSnapshot = this.writeBundleFromState(
          this.getBundleRoot(this.storagePath),
          snapshot,
        );
        this.markKnownFileVersion({ includeHash: true });
        this.emitChange(
          reason,
          changedSections.length || Object.keys(changedPeriods).length
            ? {
                changedSections,
                changedPeriods,
              }
            : {},
        );
        this.maybeRunAutoBackup({ reason });
        latestStatus = this.getStorageStatus();
      }
      return latestStatus;
    }).finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  clearStorageData() {
    return this.saveStorageData(this.createDefaultStorageData(), { replace: true, reason: "clear" });
  }
  inspectStorageTarget(nextStoragePath, currentData) {
    const root = this.getBundleRoot(nextStoragePath);
    if (this.bundleExists(root)) return { switchAction: "adopted-existing", shouldWrite: false };
    if (fs.existsSync(this.getLegacyFilePath(nextStoragePath))) return { switchAction: "migrated-legacy", shouldWrite: false };
    return {
      switchAction: "seeded-current",
      shouldWrite: true,
      data: this.normalizeStorageData(currentData, {
        storagePath: nextStoragePath,
        touchModified: true,
        touchSyncSave: true,
      }),
    };
  }

  activateStoragePath(nextStoragePath, options = {}) {
    this.stopWatching();
    this.storagePath = nextStoragePath;
    this.cachedStorageSnapshot = null;
    this.pendingSnapshot = null;
    this.pendingWriteReason = "";
    this.pendingWriteChangedSections = [];
    this.pendingWriteChangedPeriods = {};
    this.pendingWriteCount = 0;
    this.writeConfig({ storagePath: this.getBundleDisplayPath(this.getBundleRoot(nextStoragePath)) });
    this.startWatching();
    this.emitChange(options.reason || "storage-path-changed");
    this.maybeRunAutoBackup({ reason: options.reason || "storage-path-changed" });
    const status = this.getStorageStatus();
    if (status && options.switchAction) status.switchAction = options.switchAction;
    return status;
  }

  setStorageDirectory(directoryPath) {
    const targetDirectory = path.resolve(String(directoryPath || "").trim());
    if (!targetDirectory) throw new Error("存储目录不能为空");
    const nextStoragePath = path.join(targetDirectory, this.fileName);
    const currentData = this.loadStorageData();
    fs.ensureDirSync(targetDirectory);
    const plan = this.inspectStorageTarget(nextStoragePath, currentData);
    if (plan.switchAction === "migrated-legacy") {
      this.migrateLegacyFileToBundleRoot(nextStoragePath, targetDirectory);
    } else if (plan.shouldWrite) {
      this.writeBundleFromState(targetDirectory, plan.data, { touchModified: true, touchSyncSave: true });
    }
    return this.activateStoragePath(nextStoragePath, {
      reason: "storage-path-changed",
      switchAction: plan.switchAction,
    });
  }

  setStorageFile(filePath) {
    const normalized = this.normalizeStorageFilePath(filePath);
    const targetDirectory = path.dirname(normalized);
    const baseName = path.basename(normalized).toLowerCase();
    if (baseName === this.getBundleSyncFileName().toLowerCase()) {
      return this.setStorageDirectory(targetDirectory);
    }
    if (baseName === this.fileName.toLowerCase()) {
      return this.setStorageDirectory(targetDirectory);
    }

    const parsed = this.readJsonFileSync(normalized, null);
    this.validateStorageData(parsed);
    fs.ensureDirSync(targetDirectory);
    const root = targetDirectory;
    const backupFile = `imports/legacy-file-selection-${this.createTimestampTag()}.json`;
    fs.ensureDirSync(path.join(root, "imports"));
    fs.copySync(normalized, path.join(root, backupFile));
    this.writeBundleFromState(root, parsed, {
      touchModified: true,
      touchSyncSave: true,
      legacyBackups: [...(this.readManifestSync(root)?.legacyBackups || []), {
        file: backupFile,
        source: "legacy-import",
        createdAt: new Date().toISOString(),
      }],
    });
    return this.activateStoragePath(path.join(root, this.fileName), {
      reason: "storage-path-changed",
      switchAction: "migrated-legacy",
    });
  }

  resetStoragePath() { return this.setStorageDirectory(this.defaultStorageDirectory); }

  getStorageStatus() {
    try {
      this.ensureStorageReady();
      const root = this.getBundleRoot(this.storagePath);
      const manifestPath = this.getBundleDisplayPath(root);
      const manifest = this.readManifestSync(root);
      const core = this.readCoreSync(root);
      const version = this.inspectStorageVersion(this.storagePath, { includeHash: true });
      const count = (section) => (manifest?.sections?.[section]?.partitions || []).reduce(
        (total, partition) => total + Math.max(0, Number(partition?.count || 0)),
        0,
      );
      return {
        projects: Array.isArray(core.projects) ? core.projects.length : 0,
        records: count("records"),
        size: version.size,
        modifiedAt: version.modifiedAt,
        fingerprint: version.fingerprint,
        supportsModifiedAt: version.supportsModifiedAt,
        fallbackHashUsed: version.fallbackHashUsed,
        storagePath: manifestPath,
        actualUri: version.actualUri || manifestPath,
        storageDirectory: root,
        defaultStoragePath: this.getBundleDisplayPath(this.defaultStorageDirectory),
        defaultStorageDirectory: this.defaultStorageDirectory,
        userDataPath: this.userDataPath,
        documentsPath: this.documentsPath,
        storageMode: bundleHelper.BUNDLE_MODE,
        isCustomPath: path.resolve(root) !== path.resolve(this.defaultStorageDirectory),
        syncFileName: this.getBundleSyncFileName(),
        lastExternalChangeAt: this.lastExternalChangeAt,
        syncMeta: core.syncMeta || null,
        bundleMode: bundleHelper.BUNDLE_MODE,
        formatVersion: manifest?.formatVersion || bundleHelper.FORMAT_VERSION,
        legacyBackups: Array.isArray(manifest?.legacyBackups) ? manifest.legacyBackups : [],
      };
    } catch (error) {
      console.error("获取存储状态失败:", error);
      return null;
    }
  }

  setChangeListener(listener) {
    this.changeListener = typeof listener === "function" ? listener : null;
  }

  emitChange(reason, options = {}) {
    const status = this.getStorageStatus();
    const changedPeriods = normalizeChangedPeriods(options.changedPeriods || {});
    const normalizedChangedSections = normalizeChangedSections(
      options.changedSections,
    );
    const changedSections =
      normalizedChangedSections.length || Object.keys(changedPeriods).length
        ? normalizedChangedSections
        : [...DEFAULT_CHANGED_SECTIONS];
    try {
      const root = this.getBundleRoot(this.storagePath);
      const manifest = this.readManifestSync(root);
      const sourceFingerprint = manifest
        ? this.buildBundleSourceFingerprint(root, manifest)
        : "";
      void this.requestSidecarIndexRebuild(this.storagePath, {
        fullRebuild:
          reason === "external-update" ||
          reason === "storage-path-changed" ||
          reason === "import" ||
          reason === "clear",
        sourceFingerprint,
        changedSections,
        changedPeriods,
      });
    } catch (error) {
      console.error("调度 sidecar 索引刷新失败:", error);
    }
    if (typeof this.changeListener !== "function") {
      return;
    }
    this.changeListener({
      reason,
      status,
      changedSections,
      changedPeriods,
      source: options.source || "storage-manager",
      snapshotFingerprint: status?.fingerprint || "",
    });
  }

  startWatching() {
    const root = this.getBundleRoot(this.storagePath);
    if (this.watchHandle && this.watchManifestPath === this.getManifestPath(root)) return;
    this.stopWatching();
    this.watchManifestPath = this.getManifestPath(root);
    try {
      this.watchHandle = fs.watch(root, { recursive: true }, () => {
        if (this.pendingExternalCheckTimer) clearTimeout(this.pendingExternalCheckTimer);
        this.pendingExternalCheckTimer = setTimeout(() => {
          this.pendingExternalCheckTimer = null;
          const nextVersion = this.inspectStorageVersion(this.storagePath, { includeHash: true });
          if (this.lastKnownFileVersion && nextVersion.fingerprint === this.lastKnownFileVersion.fingerprint) return;
          this.lastKnownFileVersion = nextVersion;
          this.cachedStorageSnapshot = null;
          this.lastExternalChangeAt = new Date().toISOString();
          this.emitChange("external-update", { source: "external-watch" });
        }, WATCH_DEBOUNCE_MS);
      });
      this.watchHandle.on?.("error", () => {});
    } catch (error) {
      this.watchHandle = null;
    }
    if (this.watchManifestPath) {
      fs.watchFile(this.watchManifestPath, { interval: 1200 }, () => {
        this.lastKnownFileVersion = null;
      });
    }
    this.markKnownFileVersion({ includeHash: true });
  }

  stopWatching() {
    if (this.watchHandle) {
      try { this.watchHandle.close(); } catch (error) { console.error("停止存储监听失败:", error); }
      this.watchHandle = null;
    }
    if (this.watchManifestPath) {
      fs.unwatchFile(this.watchManifestPath);
      this.watchManifestPath = null;
    }
    if (this.pendingExternalCheckTimer) {
      clearTimeout(this.pendingExternalCheckTimer);
      this.pendingExternalCheckTimer = null;
    }
  }

  getManifest() {
    this.ensureStorageReady();
    return this.readManifestSync(this.getBundleRoot(this.storagePath));
  }

  getDraftValue(key, options = {}) {
    this.ensureStorageReady();
    return this.getDraft(key, options);
  }

  setDraftValue(key, value, options = {}) {
    this.ensureStorageReady();
    return this.setDraft(key, value, options);
  }

  removeDraftValue(key) {
    this.ensureStorageReady();
    return this.removeDraft(key);
  }

  getCoreState() {
    this.ensureStorageReady();
    const root = this.getBundleRoot(this.storagePath);
    return {
      ...bundleHelper.cloneValue(this.repairStoredCoreProjectsIfNeeded(root)),
      recurringPlans: bundleHelper.cloneValue(this.readRecurringPlansSync(root)),
      storagePath: this.getBundleDisplayPath(root),
      storageDirectory: root,
    };
  }

  loadSectionRange(section, scope = {}) {
    this.ensureStorageReady();
    if (!bundleHelper.PARTITIONED_SECTIONS.includes(section)) throw new Error(`不支持的 section: ${section}`);
    const root = this.getBundleRoot(this.storagePath);
    const manifest = this.readManifestSync(root);
    const range = bundleHelper.normalizeRangeInput(scope);
    const effectivePeriodIds =
      section === "records"
        ? expandRecordScopePeriodIds(range, scope)
        : range.periodIds || [];
    const requested = new Set(effectivePeriodIds);
    const matched = (manifest?.sections?.[section]?.partitions || []).filter(
      (partition) => requested.size === 0 || requested.has(partition.periodId),
    );
    let items = [];
    matched.forEach((partition) => {
      items.push(...bundleHelper.ensureArray(this.readPartitionEnvelopeSync(root, section, partition.periodId).items));
    });
    if (section === "records") {
      items = items.filter((item) => recordOverlapsScope(item, scope));
    }
    return {
      section,
      periodUnit: bundleHelper.PERIOD_UNIT,
      periodIds: matched.map((partition) => partition.periodId),
      startDate: range.startDate || null,
      endDate: range.endDate || null,
      items: bundleHelper.sortPartitionItems(section, items),
      manifestPartitions: matched,
    };
  }

  saveSectionRange(section, payload = {}) {
    return this.saveSectionRangeInternal(section, payload, { emitChange: true });
  }
  replaceCoreState(partialCore = {}, options = {}) {
    return this.replaceCoreStateInternal(partialCore, {
      emitChange: options?.emitChange !== false,
      reason: options?.reason,
    });
  }

  replaceRecurringPlansInternal(items = [], options = {}) {
    this.ensureStorageReady();
    const root = this.getBundleRoot(this.storagePath);
    const recurringPlans = bundleHelper.ensureArray(items).filter((item) => bundleHelper.isRecurringPlan(item));
    this.writeJsonFileSync(this.getRecurringPlansPath(root), recurringPlans);
    const manifest = this.readManifestSync(root);
    if (manifest) {
      manifest.lastModified = new Date().toISOString();
      manifest.sections.plansRecurring = { file: bundleHelper.RECURRING_PLANS_FILE_NAME, count: recurringPlans.length };
      this.writeJsonFileSync(this.getManifestPath(root), manifest);
    }
    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    const changeReason =
      typeof options.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "plans-recurring-replace";
    if (options.emitChange !== false) {
      this.emitChange(changeReason, { changedSections: ["plansRecurring"] });
      this.maybeRunAutoBackup({ reason: changeReason });
    }
    return recurringPlans;
  }

  appendJournal(operations = [], options = {}) {
    this.ensureStorageReady();
    const normalizedOperations = coalesceJournalOperations(operations);
    const metadata = collectJournalMetadata(normalizedOperations);
    const reason =
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : "journal-append";
    if (!normalizedOperations.length) {
      const status = this.getStorageStatus();
      return buildJournalResult([], metadata, {
        status,
        snapshotVersion:
          typeof status?.fingerprint === "string" ? status.fingerprint : "",
      });
    }

    normalizedOperations.forEach((operation) => {
      if (operation.kind === "replaceCoreState") {
        this.replaceCoreStateInternal(operation.partialCore, {
          emitChange: false,
          reason,
        });
        return;
      }
      if (operation.kind === "saveSectionRange") {
        this.saveSectionRangeInternal(operation.section, operation.payload, {
          emitChange: false,
          reason,
        });
        return;
      }
      if (operation.kind === "replaceRecurringPlans") {
        this.replaceRecurringPlansInternal(operation.items, {
          emitChange: false,
          reason,
        });
      }
    });

    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    this.emitChange(reason, {
      changedSections: metadata.changedSections,
      changedPeriods: metadata.changedPeriods,
      source: options?.source || "storage-journal",
    });
    this.maybeRunAutoBackup({
      reason,
      changedSections: metadata.changedSections,
      changedPeriods: metadata.changedPeriods,
    });
    const status = this.getStorageStatus();
    return buildJournalResult(normalizedOperations, metadata, {
      status,
      snapshotVersion:
        typeof status?.fingerprint === "string" ? status.fingerprint : "",
    });
  }

  replaceRecurringPlans(items = []) {
    return this.replaceRecurringPlansInternal(items, { emitChange: true });
  }

  async exportBundle(options = {}) {
    this.ensureStorageReady();
    const type = typeof options.type === "string" ? options.type : "full";
    const filePath = path.resolve(String(options.filePath || "").trim());
    if (!filePath) throw new Error("导出路径不能为空");
    const root = this.getBundleRoot(this.storagePath);
    if (type === "partition") {
      const section = String(options.section || "").trim();
      const periodId = bundleHelper.normalizePeriodId(options.periodId);
      if (!bundleHelper.PARTITIONED_SECTIONS.includes(section) || !periodId) throw new Error("导出分区参数无效");
      this.writeJsonFileSync(filePath, this.readPartitionEnvelopeSync(root, section, periodId));
      return { type: "partition", filePath, section, periodId };
    }
    if (!archiver) throw new Error("当前环境缺少 ZIP 导出支持");
    const manifest = this.readManifestSync(root);
    await fs.ensureDir(path.dirname(filePath));
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      this.listBundleFiles(root, manifest).forEach((sourcePath) => {
        archive.file(sourcePath, { name: path.relative(root, sourcePath).replace(/\\/g, "/") });
      });
      archive.finalize().catch(reject);
    });
    return { type: "full", filePath };
  }

  async importSource(options = {}) {
    this.ensureStorageReady();
    const sourceKind = String(options.sourceKind || "").trim();
    const filePath =
      typeof options.filePath === "string" && options.filePath.trim()
        ? path.resolve(options.filePath.trim())
        : "";
    if (
      sourceKind === externalImportHelper.SOURCE_KIND ||
      options.type === externalImportHelper.SOURCE_KIND
    ) {
      return this.importExternalJsonSource({
        ...options,
        sourceKind: externalImportHelper.SOURCE_KIND,
        filePath,
      });
    }
    if (!filePath || !(await fs.pathExists(filePath))) throw new Error("导入文件不存在");
    const fullImportMode = String(options.mode || options.importMode || "").trim() === "diff" ? "diff" : "replace";
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".zip") {
      if (!extractZip) throw new Error("当前环境缺少 ZIP 导入支持");
      const tempRoot = path.join(this.userDataPath, "bundle-import", this.createTimestampTag());
      try {
        await fs.ensureDir(tempRoot);
        await extractZip(filePath, { dir: tempRoot });
        const imported = this.preserveThemeStateIfMissing(
          this.loadBundleStateSync(tempRoot),
        );
        if (!imported) throw new Error("ZIP bundle 内容无效");
        const mergedResult = fullImportMode === "diff"
          ? this.mergeFullImportState(this.loadStorageData(), imported)
          : null;
        const nextState = mergedResult?.state || imported;
        const metrics = mergedResult || this.buildImportMetrics(imported);
        this.writeBundleFromState(this.getBundleRoot(this.storagePath), nextState, { touchModified: true, touchSyncSave: true });
        this.cachedStorageSnapshot = null;
        this.markKnownFileVersion({ includeHash: true });
        this.emitChange("import", { source: "import:zip" });
        this.maybeRunAutoBackup({ reason: "import:zip" });
        return {
          ok: true,
          type: "zip",
          sourceKind: "zip-bundle",
          mode: fullImportMode,
          filePath,
          changedSections: [...DEFAULT_CHANGED_SECTIONS],
          ...metrics,
        };
      } finally {
        await fs.remove(tempRoot);
      }
    }
    const parsed = this.readJsonFileSync(filePath, null);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.section === "string" && typeof parsed.periodId === "string" && Array.isArray(parsed.items)) {
      const result = this.saveSectionRange(parsed.section, {
        periodId: parsed.periodId,
        items: parsed.items,
        mode: options.mode === "merge" ? "merge" : "replace",
      });
      return {
        ok: true,
        type: "partition",
        sourceKind: "partition-json",
        section: result.section,
        periodId: result.periodId,
        count: result.count,
        changedSections: [result.section],
        changedPeriods: { [result.section]: [result.periodId] },
        affectedPeriodIds: [result.periodId],
        affectedDates:
          result.section === "records"
            ? this.collectRecordDateKeys(parsed.items || [])
            : [],
        createdProjects: 0,
        matchedProjects: 0,
        replacedDays: 0,
      };
    }
    const normalizedParsed = this.preserveThemeStateIfMissing(parsed);
    this.validateStorageData(normalizedParsed);
    const root = this.getBundleRoot(this.storagePath);
    const importsDirectory = path.join(root, "imports");
    const backupName = `legacy-import-${this.createTimestampTag()}.json`;
    await fs.ensureDir(importsDirectory);
    await fs.copy(filePath, path.join(importsDirectory, backupName));
    const mergedResult = fullImportMode === "diff"
      ? this.mergeFullImportState(this.loadStorageData(), normalizedParsed)
      : null;
    const nextState = mergedResult?.state || normalizedParsed;
    const metrics = mergedResult || this.buildImportMetrics(normalizedParsed);
    this.writeBundleFromState(root, nextState, {
      touchModified: true,
      touchSyncSave: true,
      legacyBackups: [...(this.readManifestSync(root)?.legacyBackups || []), { file: `imports/${backupName}`, source: "legacy-import", createdAt: new Date().toISOString() }],
    });
    this.cachedStorageSnapshot = null;
    this.markKnownFileVersion({ includeHash: true });
    this.emitChange("import", { source: "import:legacy-json" });
    this.maybeRunAutoBackup({ reason: "import:legacy-json" });
    return {
      ok: true,
      type: "legacy-state",
      sourceKind: "legacy-full-json",
      mode: fullImportMode,
      filePath,
      backupFile: `imports/${backupName}`,
      changedSections: [...DEFAULT_CHANGED_SECTIONS],
      ...metrics,
    };
  }

  exportDataToFile(filePath) {
    const targetPath = path.resolve(String(filePath || "").trim());
    if (path.extname(targetPath).toLowerCase() === ".zip") return this.exportBundle({ type: "full", filePath: targetPath });
    fs.writeFileSync(targetPath, JSON.stringify(this.loadStorageData(), null, 2), "utf8");
    return true;
  }

  importDataFromFile(filePath) {
    return this.importSource({ filePath });
  }
}

module.exports = StorageManager;
