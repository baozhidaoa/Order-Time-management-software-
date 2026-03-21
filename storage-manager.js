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
try { archiver = require("archiver"); } catch (error) { archiver = null; }
try { extractZip = require("extract-zip"); } catch (error) { extractZip = null; }

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
    this.defaultStorageDirectory = path.join(this.documentsPath, app.getName(), "app_data");
    this.storagePath = this.resolveStoragePathFromConfig();
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
    this.ensureStorageReady();
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
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
  }
  readManifestSync(root = this.getBundleRoot()) {
    const manifest = this.readJsonFileSync(this.getManifestPath(root), null);
    return manifest ? bundleHelper.normalizeManifest(manifest) : null;
  }

  readCoreSync(root = this.getBundleRoot()) {
    return bundleHelper.ensureObject(this.readJsonFileSync(this.getCorePath(root), {}), {});
  }

  readRecurringPlansSync(root = this.getBundleRoot()) {
    return bundleHelper.ensureArray(this.readJsonFileSync(this.getRecurringPlansPath(root), []));
  }

  readPartitionEnvelopeSync(root, section, periodId) {
    const filePath = path.join(root, bundleHelper.getPartitionRelativePath(section, periodId));
    const parsed = this.readJsonFileSync(filePath, null);
    if (Array.isArray(parsed)) return bundleHelper.createPartitionEnvelope(section, periodId, parsed);
    return bundleHelper.normalizePartitionEnvelope(section, parsed, periodId);
  }

  listBundleFiles(root, manifest = this.readManifestSync(root)) {
    if (!manifest) return [];
    const files = [this.getManifestPath(root), this.getCorePath(root), this.getRecurringPlansPath(root)];
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      (manifest.sections?.[section]?.partitions || []).forEach((partition) => {
        files.push(path.join(root, partition.file));
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
      });
    });
    bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
      (previousManifest?.sections?.[section]?.partitions || []).forEach((partition) => {
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
      core: this.readCoreSync(root),
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

  saveSectionRangeInternal(section, payload = {}, options = {}) {
    this.ensureStorageReady();
    if (!bundleHelper.PARTITIONED_SECTIONS.includes(section)) throw new Error(`不支持的 section: ${section}`);
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
    if (typeof this.changeListener !== "function") return;
    const status = this.getStorageStatus();
    const changedPeriods = normalizeChangedPeriods(options.changedPeriods || {});
    const normalizedChangedSections = normalizeChangedSections(
      options.changedSections,
    );
    const changedSections =
      normalizedChangedSections.length || Object.keys(changedPeriods).length
        ? normalizedChangedSections
        : [...DEFAULT_CHANGED_SECTIONS];
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

  getCoreState() {
    this.ensureStorageReady();
    const root = this.getBundleRoot(this.storagePath);
    return {
      ...bundleHelper.cloneValue(this.readCoreSync(root)),
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
