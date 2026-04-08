;/* pages/guide-bundle.js */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerGuideBundle = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GUIDE_BUNDLE_VERSION = 2;
  const GUIDE_STATE_STORAGE_KEY = "guideState";
  const GUIDE_CARD_IDS = Object.freeze({
    record: "guide-card-record",
    plan: "guide-card-plan",
    diary: "guide-card-diary",
    widget: "guide-card-widget",
  });
  const GUIDE_CARD_MAP = Object.freeze({
    record: {
      id: GUIDE_CARD_IDS.record,
      title: "快速上手",
      items: [
        "先创建项目，再开始或结束计时。",
        "第一次计时时可以不输入下一个项目，一次计时结束后会自动形成记录。",
        "统计页会直接读取这些记录。",
        "长按项目拖至目标项目可移动位置或改变分级。",
        "改变创建项目名称，以前所有记录的名称都会跟着改变",
        "创建项目不可同名,改变名称时同名是合并，所有记录合并至目标名称，并删除被改项目",
        "一级二级项目双击折叠收起；项目列表单击（饼状图和折线图处也是）。",
        "单击记录编辑，仅最后一次记录的删除可以回滚时间（可重复）。",
        "其余的只能于统计页面的表格视图中双击编辑名称或删除，不可改变时间。",
        "所有视图均可放大",
      ],
    },
    widget: {
      id: GUIDE_CARD_IDS.widget,
      title: "快速上手",
      items: [
        "先选要放到桌面的组件类型。",
        "添加后可在桌面调整位置和大小。",
        "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。",
      ],
    },
  });
  const GUIDE_DIARY_TITLES = Object.freeze([
    "导入和导出到底怎么选",
    "为什么现在是一个目录里的多份 JSON",
    "换设备 / 合并数据 / 只补一个月数据时该怎么做",
  ]);
  const LEGACY_GUIDE_DIARY_TITLES = Object.freeze([
    "数据导入与备份",
    "同步 JSON 文件怎么选",
    "双端同步（需要时再看）",
  ]);
  const GUIDE_BUSINESS_ARRAY_KEYS = Object.freeze([
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
    return JSON.parse(JSON.stringify(value));
  }

  function isNonEmptyPlainObject(value) {
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    );
  }

  function normalizeGuideIdList(values) {
    return Array.isArray(values)
      ? values
          .map((value) => String(value || "").trim())
          .filter(
            (value, index, list) => value && list.indexOf(value) === index,
          )
      : [];
  }

  function getDefaultGuideState() {
    return {
      bundleVersion: GUIDE_BUNDLE_VERSION,
      dismissedCardIds: [],
      dismissedGuideDiaryEntryIds: [],
    };
  }

  function normalizeGuideState(rawState) {
    const source =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    const dismissedCardIds = normalizeGuideIdList(source.dismissedCardIds);
    const dismissedGuideDiaryEntryIds = normalizeGuideIdList(
      source.dismissedGuideDiaryEntryIds || source.dismissedDiaryEntryIds,
    );

    return {
      bundleVersion: GUIDE_BUNDLE_VERSION,
      dismissedCardIds,
      dismissedGuideDiaryEntryIds,
    };
  }

  function formatDateText(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftDate(baseDate, offsetDays) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + offsetDays);
    return nextDate;
  }

  function buildGuideDiaryEntries(now = new Date()) {
    return [];
  }

  function createGuideSeed(now = new Date()) {
    return {
      guideState: getDefaultGuideState(),
      diaryEntries: buildGuideDiaryEntries(now),
      diaryCategories: [],
    };
  }

  function isStorageGuideDiaryEntry(entry) {
    const id = String(entry?.id || "").trim();
    const title = String(entry?.title || "").trim();
    if (id.startsWith("guide-entry-")) {
      return true;
    }
    return (
      GUIDE_DIARY_TITLES.includes(title) ||
      LEGACY_GUIDE_DIARY_TITLES.includes(title)
    );
  }

  function resolveGuideDiaryEntryId(entry, now = new Date()) {
    const latestGuideEntries = buildGuideDiaryEntries(now);
    const entryId =
      typeof entry === "string" ? String(entry || "").trim() : String(entry?.id || "").trim();
    const entryTitle =
      typeof entry === "string"
        ? String(entry || "").trim()
        : String(entry?.title || "").trim();

    if (entryId) {
      const matchedById = latestGuideEntries.find(
        (guideEntry) => String(guideEntry?.id || "").trim() === entryId,
      );
      if (matchedById?.id) {
        return String(matchedById.id).trim();
      }
    }

    if (entryTitle) {
      const matchedByTitle = latestGuideEntries.find(
        (guideEntry) => String(guideEntry?.title || "").trim() === entryTitle,
      );
      if (matchedByTitle?.id) {
        return String(matchedByTitle.id).trim();
      }
      const legacyIndex = LEGACY_GUIDE_DIARY_TITLES.indexOf(entryTitle);
      if (legacyIndex >= 0 && latestGuideEntries[legacyIndex]?.id) {
        return String(latestGuideEntries[legacyIndex].id).trim();
      }
    }

    return "";
  }

  function dismissGuideDiaryEntry(rawState, entry, now = new Date()) {
    const currentState = normalizeGuideState(rawState);
    const guideDiaryEntryId = resolveGuideDiaryEntryId(entry, now);
    if (
      !guideDiaryEntryId ||
      currentState.dismissedGuideDiaryEntryIds.includes(guideDiaryEntryId)
    ) {
      return currentState;
    }

    return normalizeGuideState({
      ...currentState,
      dismissedGuideDiaryEntryIds: [
        ...currentState.dismissedGuideDiaryEntryIds,
        guideDiaryEntryId,
      ],
    });
  }

  function synchronizeGuideDiaryEntries(
    entries = [],
    now = new Date(),
    guideState = null,
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const retainedEntries = sourceEntries.filter(
      (entry) => !isStorageGuideDiaryEntry(entry),
    );
    if (retainedEntries.length === sourceEntries.length) {
      return sourceEntries;
    }
    return retainedEntries;
  }

  function getGuideCard(pageKey) {
    void pageKey;
    return null;
  }

  function hasMeaningfulBusinessData(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return false;
    }

    if (
      GUIDE_BUSINESS_ARRAY_KEYS.some(
        (key) => Array.isArray(rawState[key]) && rawState[key].length > 0,
      )
    ) {
      return true;
    }

    return isNonEmptyPlainObject(rawState.yearlyGoals);
  }

  function shouldSeedGuideBundle(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return true;
    }

    if (rawState.guideState && typeof rawState.guideState === "object") {
      return false;
    }

    return !hasMeaningfulBusinessData(rawState);
  }

  return {
    GUIDE_BUNDLE_VERSION,
    GUIDE_STATE_STORAGE_KEY,
    GUIDE_CARD_IDS,
    GUIDE_DIARY_TITLES,
    getDefaultGuideState,
    normalizeGuideState,
    buildGuideDiaryEntries,
    createGuideSeed,
    getGuideCard,
    isStorageGuideDiaryEntry,
    resolveGuideDiaryEntryId,
    dismissGuideDiaryEntry,
    synchronizeGuideDiaryEntries,
    shouldSeedGuideBundle,
  };
});


;/* pages/external-import.js */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerExternalImport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOT_ARRAY_PATH = "$";
  const SOURCE_KIND = "external-json";
  const DEFAULT_CONFLICT_UNIT = "day";
  const DEFAULT_PROJECT_MAPPING = "name-first";

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

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

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function extractProjectLeafName(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return "";
    }
    const leafName = normalizedValue
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
    return leafName || normalizedValue;
  }

  function normalizeProjectName(value) {
    return extractProjectLeafName(value);
  }

  function normalizeDateInput(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsedFromNumber = new Date(value);
      return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
    }
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/.test(normalized)) {
      return null;
    }
    const plainDateMatch = normalized.match(
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/,
    );
    if (plainDateMatch) {
      const year = Number.parseInt(plainDateMatch[1], 10);
      const month = Number.parseInt(plainDateMatch[2], 10);
      const day = Number.parseInt(plainDateMatch[3], 10);
      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day)
      ) {
        return new Date(year, month - 1, day);
      }
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

  function formatPeriodId(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
  }

  function parseTimeParts(value) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const match = normalized.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/,
    );
    if (!match) {
      return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;
    const milliseconds = match[4]
      ? Number.parseInt(match[4].padEnd(3, "0"), 10)
      : 0;
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      !Number.isFinite(milliseconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }
    return {
      hours,
      minutes,
      seconds,
      milliseconds,
    };
  }

  function buildDateTime(dateValue, timeValue) {
    if (
      timeValue === null ||
      timeValue === undefined ||
      (typeof timeValue === "string" && !timeValue.trim())
    ) {
      return null;
    }
    const timeParts = parseTimeParts(timeValue);
    if (timeParts) {
      const baseDate = normalizeDateInput(dateValue);
      if (!baseDate) {
        return null;
      }
      return new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        timeParts.hours,
        timeParts.minutes,
        timeParts.seconds,
        timeParts.milliseconds,
      );
    }
    const directTime = normalizeDateInput(timeValue);
    if (directTime) {
      return directTime;
    }
    return null;
  }

  function parseDurationText(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      return null;
    }

    const colonMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (colonMatch) {
      const hours = Number.parseInt(colonMatch[1], 10);
      const minutes = Number.parseInt(colonMatch[2], 10);
      const seconds = colonMatch[3] ? Number.parseInt(colonMatch[3], 10) : 0;
      if (
        Number.isFinite(hours) &&
        Number.isFinite(minutes) &&
        Number.isFinite(seconds)
      ) {
        return (
          Math.max(0, hours) * 60 * 60 * 1000 +
          Math.max(0, minutes) * 60 * 1000 +
          Math.max(0, seconds) * 1000
        );
      }
    }

    const dayMatch = text.match(
      /(\d+(?:\.\d+)?)\s*(?:天|day|days|d)(?:\b|$)/i,
    );
    const hourMatch = text.match(
      /(\d+(?:\.\d+)?)\s*(?:小时|hr|hrs|hour|hours|h)(?:\b|$)/i,
    );
    const minuteMatch = text.match(
      /(\d+(?:\.\d+)?)\s*(?:分钟|min|mins|minute|minutes|m)(?:\b|$)/i,
    );
    const secondMatch = text.match(
      /(\d+(?:\.\d+)?)\s*(?:秒|sec|secs|second|seconds|s)(?:\b|$)/i,
    );
    const lessThanMinute =
      text.includes("小于1分钟") ||
      text.includes("小于1min") ||
      /less than 1\s*min/i.test(text);

    let totalMs = 0;
    if (dayMatch) totalMs += Number.parseFloat(dayMatch[1]) * 24 * 60 * 60 * 1000;
    if (hourMatch) totalMs += Number.parseFloat(hourMatch[1]) * 60 * 60 * 1000;
    if (minuteMatch) totalMs += Number.parseFloat(minuteMatch[1]) * 60 * 1000;
    if (secondMatch) totalMs += Number.parseFloat(secondMatch[1]) * 1000;
    if (!totalMs && lessThanMinute) totalMs = 30 * 1000;

    return totalMs > 0 ? Math.round(totalMs) : null;
  }

  function parseDurationMsValue(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }

  function formatDurationFromMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
      return "小于1分钟";
    }
    const totalMinutes = Math.max(1, Math.round(ms / (1000 * 60)));
    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) {
      return `${days}天${hours}小时${minutes}分钟`;
    }
    if (totalHours > 0) {
      return `${totalHours}小时${minutes}分钟`;
    }
    return `${minutes}分钟`;
  }

  function createRecordId(index) {
    return `external-record-${Date.now().toString(36)}-${index + 1}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function createProjectId(prefix = "project-import") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function listArrayCandidates(payload) {
    const candidates = [];
    if (Array.isArray(payload)) {
      candidates.push({
        path: ROOT_ARRAY_PATH,
        label: "根数组",
        count: payload.length,
      });
    }
    if (!isPlainObject(payload)) {
      return candidates;
    }
    Object.keys(payload).forEach((key) => {
      const value = payload[key];
      if (!Array.isArray(value)) {
        return;
      }
      candidates.push({
        path: key,
        label: key,
        count: value.length,
      });
    });
    return candidates;
  }

  function resolveArraySource(payload, arrayPath) {
    if (arrayPath === ROOT_ARRAY_PATH) {
      return Array.isArray(payload) ? payload : [];
    }
    if (isPlainObject(payload) && Array.isArray(payload[arrayPath])) {
      return payload[arrayPath];
    }
    return [];
  }

  function listObjectFieldKeys(items) {
    const keys = new Set();
    ensureArray(items)
      .filter((item) => isPlainObject(item))
      .slice(0, 100)
      .forEach((item) => {
        Object.keys(item).forEach((key) => {
          if (typeof key === "string" && key.trim()) {
            keys.add(key);
          }
        });
      });
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }

  function guessFieldByPatterns(keys, patterns = []) {
    const normalizedKeys = ensureArray(keys);
    for (const pattern of patterns) {
      const matched = normalizedKeys.find((key) => pattern.test(key));
      if (matched) {
        return matched;
      }
    }
    return "";
  }

  function guessExternalMapping(fieldKeys = []) {
    return {
      projectName: guessFieldByPatterns(fieldKeys, [
        /^(projectName|project|项目名称|项目)$/i,
        /name/i,
      ]),
      date: guessFieldByPatterns(fieldKeys, [/^(date|day|日期)$/i]),
      startTime: guessFieldByPatterns(fieldKeys, [
        /^(startTime|start|开始时间|开始)$/i,
      ]),
      endTime: guessFieldByPatterns(fieldKeys, [
        /^(endTime|end|结束时间|结束)$/i,
      ]),
      durationMs: guessFieldByPatterns(fieldKeys, [
        /^(durationMs|duration_milliseconds|ms|时长毫秒)$/i,
      ]),
      spendtime: guessFieldByPatterns(fieldKeys, [
        /^(spendtime|duration|用时|时长)$/i,
      ]),
    };
  }

  function getFieldValue(item, fieldName) {
    if (!isPlainObject(item) || !fieldName) {
      return undefined;
    }
    return item[fieldName];
  }

  function normalizeExternalRecord(item, mapping = {}, options = {}) {
    const projectName = normalizeProjectName(
      getFieldValue(item, mapping.projectName),
    );
    if (!projectName) {
      return {
        ok: false,
        reason: "missing-project-name",
      };
    }

    const dateValue = getFieldValue(item, mapping.date);
    let startDate = buildDateTime(dateValue, getFieldValue(item, mapping.startTime));
    let endDate = buildDateTime(dateValue, getFieldValue(item, mapping.endTime));
    const mappedDurationMs = parseDurationMsValue(
      getFieldValue(item, mapping.durationMs),
    );
    const mappedSpendtimeMs =
      mappedDurationMs !== null
        ? mappedDurationMs
        : parseDurationText(getFieldValue(item, mapping.spendtime));

    if (!startDate && !endDate) {
      return {
        ok: false,
        reason: "missing-time-range",
      };
    }

    if (!startDate && endDate && Number.isFinite(mappedSpendtimeMs)) {
      startDate = new Date(
        Math.max(0, endDate.getTime() - Math.max(0, mappedSpendtimeMs)),
      );
    }
    if (startDate && !endDate && Number.isFinite(mappedSpendtimeMs)) {
      endDate = new Date(startDate.getTime() + Math.max(0, mappedSpendtimeMs));
    }

    if (!startDate || !endDate) {
      return {
        ok: false,
        reason: "missing-duration",
      };
    }

    const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const safeDurationMs = Number.isFinite(durationMs)
      ? Math.round(durationMs)
      : Math.max(0, Math.round(mappedSpendtimeMs || 0));
    const canonicalEndText = endDate.toISOString();
    const canonicalStartText = startDate.toISOString();

    return {
      ok: true,
      record: {
        id: createRecordId(options.index || 0),
        timestamp: canonicalEndText,
        sptTime: canonicalEndText,
        endTime: canonicalEndText,
        rawEndTime: canonicalEndText,
        startTime: canonicalStartText,
        durationMs: safeDurationMs,
        spendtime: formatDurationFromMs(safeDurationMs),
        name: projectName,
        projectId: null,
        clickCount: null,
        timerRollbackState: null,
        durationMeta: {
          recordedMs: safeDurationMs,
          originalMs: safeDurationMs,
          returnedMs: null,
          returnTargetProject: "",
          appliedCarryover: null,
        },
      },
    };
  }

  function normalizeExternalRecords(payload, externalConfig = {}, options = {}) {
    const sourceConfig = isPlainObject(externalConfig) ? externalConfig : {};
    const arrayPath =
      typeof sourceConfig.arrayPath === "string" && sourceConfig.arrayPath.trim()
        ? sourceConfig.arrayPath.trim()
        : ROOT_ARRAY_PATH;
    const items = resolveArraySource(payload, arrayPath);
    const mapping = isPlainObject(sourceConfig.mapping) ? sourceConfig.mapping : {};
    const records = [];
    const reasons = {};
    const projectNames = new Set();
    const affectedDates = new Set();
    const affectedPeriodIds = new Set();

    ensureArray(items).forEach((item, index) => {
      const normalized = normalizeExternalRecord(item, mapping, {
        ...options,
        index,
      });
      if (!normalized?.ok || !normalized.record) {
        const reason =
          typeof normalized?.reason === "string" && normalized.reason
            ? normalized.reason
            : "invalid-record";
        reasons[reason] = (reasons[reason] || 0) + 1;
        return;
      }
      records.push(normalized.record);
      projectNames.add(normalized.record.name);
      const dateKey = normalizeDateKey(
        normalized.record.endTime ||
          normalized.record.timestamp ||
          normalized.record.startTime,
      );
      const periodId = formatPeriodId(
        normalizeDateInput(
          normalized.record.endTime ||
            normalized.record.timestamp ||
            normalized.record.startTime,
        ),
      );
      if (dateKey) affectedDates.add(dateKey);
      if (periodId) affectedPeriodIds.add(periodId);
    });

    return {
      sourceKind: SOURCE_KIND,
      arrayPath,
      totalCount: items.length,
      validCount: records.length,
      invalidCount: Math.max(0, items.length - records.length),
      invalidReasons: reasons,
      records,
      projectNames: Array.from(projectNames).sort((left, right) =>
        left.localeCompare(right),
      ),
      affectedDates: Array.from(affectedDates).sort((left, right) =>
        left.localeCompare(right),
      ),
      affectedPeriodIds: Array.from(affectedPeriodIds).sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  function sanitizeProject(project, index) {
    const source = isPlainObject(project) ? cloneValue(project) : {};
    const fallbackName = `未命名项目-${index + 1}`;
    return {
      ...source,
      id:
        typeof source.id === "string" && source.id.trim()
          ? source.id.trim()
          : String(source.id || "").trim(),
      name: normalizeProjectName(source.name) || fallbackName,
      level:
        Number.isFinite(source.level) && source.level >= 1 && source.level <= 3
          ? Math.round(source.level)
          : 1,
      parentId:
        typeof source.parentId === "string" && source.parentId.trim()
          ? source.parentId.trim()
          : null,
      color:
        typeof source.color === "string" && source.color.trim()
          ? source.color.trim()
          : null,
      colorMode:
        typeof source.colorMode === "string" && source.colorMode.trim()
          ? source.colorMode.trim()
          : "auto",
      description:
        typeof source.description === "string" ? source.description : "",
      createdAt:
        typeof source.createdAt === "string" && source.createdAt.trim()
          ? source.createdAt.trim()
          : new Date().toISOString(),
    };
  }

  function reconcileProjectsByName(existingProjects = [], importedProjects = []) {
    const nextProjects = ensureArray(existingProjects).map((project, index) =>
      sanitizeProject(project, index),
    );
    const nameIndex = new Map();
    const projectIdMap = new Map();
    const usedIds = new Set();
    const matchedNames = new Set();
    const createdNames = new Set();
    const stagedNewProjects = [];

    nextProjects.forEach((project) => {
      const projectId = String(project?.id || "").trim();
      const projectName = normalizeProjectName(project?.name);
      if (projectId) {
        usedIds.add(projectId);
        projectIdMap.set(projectId, projectId);
      }
      if (projectName && !nameIndex.has(projectName)) {
        nameIndex.set(projectName, project);
      }
    });

    ensureArray(importedProjects).forEach((project, index) => {
      const normalizedProject = sanitizeProject(project, index);
      const importedId = String(normalizedProject.id || "").trim();
      const importedName = normalizeProjectName(normalizedProject.name);
      const existingMatch = importedName ? nameIndex.get(importedName) : null;
      if (existingMatch) {
        if (importedId) {
          projectIdMap.set(importedId, existingMatch.id);
        }
        matchedNames.add(importedName);
        return;
      }

      let nextId = importedId;
      if (!nextId || usedIds.has(nextId)) {
        do {
          nextId = createProjectId("project-import");
        } while (usedIds.has(nextId));
      }
      usedIds.add(nextId);
      if (importedId) {
        projectIdMap.set(importedId, nextId);
      }
      projectIdMap.set(nextId, nextId);

      const createdProject = {
        ...normalizedProject,
        id: nextId,
      };
      nextProjects.push(createdProject);
      nameIndex.set(importedName, createdProject);
      createdNames.add(importedName);
      stagedNewProjects.push({
        sourceParentId: normalizedProject.parentId,
        targetProject: createdProject,
      });
    });

    stagedNewProjects.forEach(({ sourceParentId, targetProject }) => {
      const normalizedParentId = String(sourceParentId || "").trim();
      if (!normalizedParentId) {
        targetProject.parentId = null;
        return;
      }
      const mappedParentId = projectIdMap.get(normalizedParentId) || null;
      targetProject.parentId =
        mappedParentId && mappedParentId !== targetProject.id
          ? mappedParentId
          : null;
    });

    return {
      projects: nextProjects,
      projectIdMap: projectIdMap,
      nameIndex: nameIndex,
      matchedProjects: matchedNames.size,
      createdProjects: createdNames.size,
    };
  }

  function applyProjectMappingToRecords(records = [], reconciliation = {}) {
    const mappedRecords = [];
    const nameIndex =
      reconciliation?.nameIndex instanceof Map
        ? reconciliation.nameIndex
        : new Map();
    const projectIdMap =
      reconciliation?.projectIdMap instanceof Map
        ? reconciliation.projectIdMap
        : new Map();

    ensureArray(records).forEach((record) => {
      const source = isPlainObject(record) ? cloneValue(record) : {};
      const sourceProjectId = String(source.projectId || "").trim();
      const sourceName = normalizeProjectName(source.name);
      const sourceNextProjectId = String(source.nextProjectId || "").trim();
      const sourceNextProjectName = normalizeProjectName(source.nextProjectName);
      let matchedProject = null;
      let matchedNextProject = null;

      if (sourceProjectId && projectIdMap.has(sourceProjectId)) {
        const mappedId = projectIdMap.get(sourceProjectId);
        matchedProject = ensureArray(reconciliation.projects).find(
          (project) => String(project?.id || "").trim() === String(mappedId || ""),
        );
      }
      if (!matchedProject && sourceName) {
        matchedProject = nameIndex.get(sourceName) || null;
      }
      if (sourceNextProjectId && projectIdMap.has(sourceNextProjectId)) {
        const mappedNextId = projectIdMap.get(sourceNextProjectId);
        matchedNextProject = ensureArray(reconciliation.projects).find(
          (project) => String(project?.id || "").trim() === String(mappedNextId || ""),
        );
      }
      if (!matchedNextProject && sourceNextProjectName) {
        matchedNextProject = nameIndex.get(sourceNextProjectName) || null;
      }

      mappedRecords.push({
        ...source,
        name: matchedProject?.name || sourceName || "未命名项目",
        projectId: matchedProject?.id || null,
        nextProjectName: matchedNextProject?.name || sourceNextProjectName || "",
        nextProjectId: matchedNextProject?.id || null,
      });
    });

    return mappedRecords;
  }

  function sortRecords(records = []) {
    return ensureArray(records)
      .slice()
      .sort((left, right) => {
        const leftValue =
          normalizeDateInput(left?.endTime || left?.timestamp || left?.startTime)?.getTime() ||
          0;
        const rightValue =
          normalizeDateInput(right?.endTime || right?.timestamp || right?.startTime)?.getTime() ||
          0;
        return leftValue - rightValue;
      });
  }

  function mergeRecordsByReplacingDays(existingRecords = [], incomingRecords = []) {
    const affectedDates = new Set();
    sortRecords(incomingRecords).forEach((record) => {
      const dateKey = normalizeDateKey(
        record?.endTime || record?.timestamp || record?.startTime,
      );
      if (dateKey) {
        affectedDates.add(dateKey);
      }
    });
    const remainingRecords = sortRecords(existingRecords).filter((record) => {
      const dateKey = normalizeDateKey(
        record?.endTime || record?.timestamp || record?.startTime,
      );
      return dateKey ? !affectedDates.has(dateKey) : true;
    });
    return {
      records: sortRecords([...remainingRecords, ...sortRecords(incomingRecords)]),
      affectedDates: Array.from(affectedDates).sort((left, right) =>
        left.localeCompare(right),
      ),
      replacedDays: affectedDates.size,
    };
  }

  return {
    ROOT_ARRAY_PATH,
    SOURCE_KIND,
    DEFAULT_CONFLICT_UNIT,
    DEFAULT_PROJECT_MAPPING,
    cloneValue,
    ensureArray,
    isPlainObject,
    normalizeDateInput,
    normalizeDateKey,
    formatPeriodId,
    normalizeProjectName,
    formatDurationFromMs,
    parseDurationMsValue,
    parseDurationText,
    listArrayCandidates,
    resolveArraySource,
    listObjectFieldKeys,
    guessExternalMapping,
    normalizeExternalRecord,
    normalizeExternalRecords,
    reconcileProjectsByName,
    applyProjectMappingToRecords,
    mergeRecordsByReplacingDays,
    createProjectId,
  };
});


;/* pages/settings.js */
const uiTools = window.ControlerUI || null;
const themeRuntime = window.ControlerTheme || null;
const DEFAULT_THEME_COLORS = {
  ...(themeRuntime?.DEFAULT_THEME_COLORS || {}),
};
const DEFAULT_THEME_RECORD_CARD = {
  mode: "project",
  color: "#72c28a",
  ...(themeRuntime?.DEFAULT_THEME_RECORD_CARD || {}),
};
const BUILT_IN_THEMES =
  typeof themeRuntime?.getBuiltInThemes === "function"
    ? themeRuntime.getBuiltInThemes()
    : [];
const THEME_FIELD_SECTIONS =
  typeof themeRuntime?.getThemeFieldSections === "function"
    ? themeRuntime.getThemeFieldSections()
    : [];
const THEME_RECORD_CARD_SECTION_ID = "advanced-record-card";
const THEME_WIDGET_SECTION_IDS = new Set(["advanced-widget"]);
const THEME_WIDGET_COLOR_FIELDS = THEME_FIELD_SECTIONS.filter((section) =>
  THEME_WIDGET_SECTION_IDS.has(section?.id),
).flatMap((section) => (Array.isArray(section?.fields) ? section.fields : []));
const ALL_THEME_COLOR_FIELDS = THEME_FIELD_SECTIONS.flatMap((section) =>
  Array.isArray(section?.fields) ? section.fields : [],
);
const OPTIONAL_THEME_COLOR_FIELD_KEYS = new Set(
  ALL_THEME_COLOR_FIELDS.filter(({ optional }) => optional).map(({ key }) => key),
);
const AUTO_DERIVED_THEME_COLOR_FIELD_KEYS = new Set([
  "navBarBorder",
  "navButtonText",
  "navButtonActiveText",
]);

function resolveThemeRuntime() {
  return window.ControlerTheme || themeRuntime || null;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

if (!themeRuntime) {
  console.error("主题运行时未加载，设置页主题编辑已降级。");
}

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
const RGB_COLOR_PATTERN =
  /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;
const COLOR_PICKER_MEMORY_STORAGE_PREFIX =
  "__controler_ui_color_picker_anchor__:";
const themeColorPickerAnchorCache = new Map();

function normalizeThemeColorInputValue(color) {
  return String(color ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[，]/g, ",")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[；]+$/g, "")
    .trim();
}

function normalizeColorPickerMemoryKey(storageKey) {
  const normalizedKey = String(storageKey || "").trim();
  return normalizedKey ? `${COLOR_PICKER_MEMORY_STORAGE_PREFIX}${normalizedKey}` : "";
}

function readThemeColorPickerAnchor(storageKey) {
  const resolvedKey = normalizeColorPickerMemoryKey(storageKey);
  if (!resolvedKey) {
    return "";
  }
  if (themeColorPickerAnchorCache.has(resolvedKey)) {
    return themeColorPickerAnchorCache.get(resolvedKey) || "";
  }
  try {
    const storedValue = localStorage.getItem(resolvedKey) || "";
    const normalizedValue = toHexColor(storedValue, "");
    if (normalizedValue) {
      themeColorPickerAnchorCache.set(resolvedKey, normalizedValue);
      return normalizedValue;
    }
  } catch (error) {
    console.error("读取颜色选择锚点失败:", error);
  }
  return "";
}

function writeThemeColorPickerAnchor(storageKey, color, { persist = false } = {}) {
  const resolvedKey = normalizeColorPickerMemoryKey(storageKey);
  const normalizedColor = toHexColor(color, "");
  if (!resolvedKey || !normalizedColor) {
    return "";
  }
  themeColorPickerAnchorCache.set(resolvedKey, normalizedColor);
  if (persist) {
    try {
      if (localStorage.getItem(resolvedKey) !== normalizedColor) {
        localStorage.setItem(resolvedKey, normalizedColor);
      }
    } catch (error) {
      console.error("写入颜色选择锚点失败:", error);
    }
  }
  return normalizedColor;
}

function setThemeColorPickerDisplayValue(input, color, fallback = "#000000") {
  if (!(input instanceof HTMLInputElement)) {
    return "";
  }
  const nextColor = toHexColor(color, fallback);
  if (!nextColor) {
    return "";
  }
  if (input.value !== nextColor) {
    input.value = nextColor;
  }
  input.dataset.colorPickerDisplayValue = nextColor;
  return nextColor;
}

function bindRememberedThemeColorPicker(
  input,
  {
    anchorKey = "",
    resolveOpenColor = () => "",
    resolveDisplayColor = () =>
      input?.dataset?.colorPickerDisplayValue || input?.value || "#000000",
  } = {},
) {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const normalizedAnchorKey = String(anchorKey || "").trim();
  if (!normalizedAnchorKey || input.dataset.colorPickerMemoryBound === "true") {
    if (!input.dataset.colorPickerDisplayValue && input.value) {
      input.dataset.colorPickerDisplayValue = input.value;
    }
    return;
  }

  const applyOpenColor = () => {
    const preferredColor =
      typeof resolveOpenColor === "function" ? resolveOpenColor() : "";
    const displayFallback =
      input.dataset.colorPickerDisplayValue || input.value || "#000000";
    const storedAnchor = readThemeColorPickerAnchor(normalizedAnchorKey);
    const nextColor = toHexColor(
      preferredColor,
      storedAnchor || displayFallback || "#000000",
    );
    if (nextColor && input.value !== nextColor) {
      input.value = nextColor;
    }
  };

  const restoreDisplayColor = () => {
    const displayColor =
      typeof resolveDisplayColor === "function" ? resolveDisplayColor() : "";
    setThemeColorPickerDisplayValue(
      input,
      displayColor,
      input.dataset.colorPickerDisplayValue || input.value || "#000000",
    );
  };

  if (!input.dataset.colorPickerDisplayValue && input.value) {
    input.dataset.colorPickerDisplayValue = input.value;
  }

  input.dataset.colorPickerMemoryBound = "true";
  input.addEventListener("pointerdown", applyOpenColor);
  input.addEventListener("mousedown", applyOpenColor);
  input.addEventListener("touchstart", applyOpenColor, {
    passive: true,
  });
  input.addEventListener("focus", applyOpenColor);
  input.addEventListener("input", () => {
    writeThemeColorPickerAnchor(normalizedAnchorKey, input.value, {
      persist: false,
    });
    input.dataset.colorPickerDisplayValue = input.value;
  });
  input.addEventListener("change", () => {
    const storedAnchor = writeThemeColorPickerAnchor(
      normalizedAnchorKey,
      input.value,
      {
        persist: true,
      },
    );
    if (storedAnchor) {
      input.dataset.colorPickerDisplayValue = storedAnchor;
    }
  });
  input.addEventListener("blur", restoreDisplayColor);
  restoreDisplayColor();
}

const SETTINGS_LANGUAGE_EVENT = "controler:language-changed";
let settingsInitialReadyReported = false;
let settingsInitialReadyPromise = null;
let settingsDeferredRuntimePromise = null;
let settingsDeferredPanelInitPromise = null;
const SETTINGS_BUSY_OVERLAY_DELAY_MS = Math.max(
  0,
  Math.round(Number(window.ControlerUI?.pageLoadingOverlayDelayMs) || 120),
);
const AUTO_BACKUP_STATUS_CACHE_KEY = "controler.settings.autoBackupStatus";
let settingsBusyOverlayTimer = 0;
let settingsInitialLoadOverlayTimer = 0;
let settingsInitialLoadOverlayVisible = false;
let settingsStorageStatusRetryTimer = 0;
let autoBackupCachedStatus = null;
let autoBackupSaveTimer = 0;
let autoBackupSaveVersion = 0;
let settingsLoadingOverlayController = null;
let settingsNativeBusyLockActive = false;
const settingsExternalStorageRefreshCoordinator =
  window.ControlerUI?.createDeferredRefreshController?.({
    run: async () => {
      refreshSettingsFromStorage();
    },
  }) || null;
window.ControlerUI?.markPerfStage?.("settings-script-loaded");

function emitThemeEditDebugEvent(stage, detail = {}) {
  try {
    window.ControlerNativeBridge?.emitEvent?.("ui.debug-theme-edit-probe", {
      href: window.location.href,
      page: "settings",
      stage: String(stage || "").trim() || "unknown",
      visibilityState: document.visibilityState || "",
      ...detail,
    });
  } catch (error) {}
}

window.addEventListener(
  "pagehide",
  (event) => {
    emitThemeEditDebugEvent("pagehide", {
      persisted: event?.persisted === true,
    });
  },
  true,
);

window.addEventListener(
  "beforeunload",
  () => {
    emitThemeEditDebugEvent("beforeunload");
  },
  true,
);

function ensureSettingsDeferredRuntimeLoaded() {
  if (settingsDeferredRuntimePromise) {
    return settingsDeferredRuntimePromise;
  }
  if (typeof window.ControlerUI?.loadScriptOnce !== "function") {
    settingsDeferredRuntimePromise = Promise.resolve();
    return settingsDeferredRuntimePromise;
  }

  settingsDeferredRuntimePromise = window.ControlerUI
    .loadScriptOnce("reminders.js")
    .catch((error) => {
      console.error("加载设置页提醒脚本失败:", error);
    });
  return settingsDeferredRuntimePromise;
}

function scheduleSettingsSlowLoadingOverlay() {
  window.clearTimeout(settingsInitialLoadOverlayTimer);
  settingsInitialLoadOverlayTimer = 0;
  settingsInitialLoadOverlayVisible = true;
  setSettingsBusyState({
    active: true,
    title: "正在加载设置",
    message: "设置项较多，正在准备当前页面，请稍候。",
    lockNativeExit: false,
  });
}

function finishSettingsSlowLoadingOverlay() {
  window.clearTimeout(settingsInitialLoadOverlayTimer);
  settingsInitialLoadOverlayTimer = 0;
  if (!settingsInitialLoadOverlayVisible) {
    return Promise.resolve(false);
  }
  settingsInitialLoadOverlayVisible = false;
  return setSettingsBusyState({
    active: false,
    lockNativeExit: false,
  });
}

function queueSettingsInitialReady() {
  if (settingsInitialReadyReported) {
    return settingsInitialReadyPromise || Promise.resolve(true);
  }
  if (settingsInitialReadyPromise) {
    return settingsInitialReadyPromise;
  }
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  settingsInitialReadyPromise = new Promise((resolve) => {
    schedule(() => {
      schedule(() => {
        Promise.resolve(
          window.ControlerUI?.waitForVisualContentStability?.({
            root: ".settings-main",
            quietWindowMs: 72,
            maxWaitMs: 680,
            minQuietFrames: 3,
          }),
        )
          .catch(() => false)
          .finally(async () => {
            settingsInitialReadyReported = true;
            document.body?.classList.remove("settings-bootstrap-pending");
            document.body?.classList.add("settings-bootstrap-ready");
            await finishSettingsSlowLoadingOverlay();
            window.ControlerUI?.markPerfStage?.("first-render-done");
            window.ControlerUI?.markNativePageReady?.();
            settingsInitialReadyPromise = null;
            resolve(true);
          });
      });
    });
  });
  return settingsInitialReadyPromise;
}

function scheduleSettingsDeferredPanelInitialization() {
  if (settingsDeferredPanelInitPromise) {
    return settingsDeferredPanelInitPromise;
  }

  const schedule =
    typeof window.requestIdleCallback === "function"
      ? (callback) =>
          window.requestIdleCallback(callback, {
            timeout: 240,
          })
      : (callback) => window.setTimeout(callback, 32);

  settingsDeferredPanelInitPromise = new Promise((resolve) => {
    schedule(async () => {
      window.ControlerUI?.markPerfStage?.("settings-deferred-init-start");

      try {
        updateStorageStatus();
      } catch (error) {
        console.error("设置页延后刷新存储状态失败:", error);
      }

      try {
        updateStoragePathInfo();
      } catch (error) {
        console.error("设置页延后刷新存储路径失败:", error);
      }

      try {
        await refreshAutoBackupPanel();
      } catch (error) {
        console.error("设置页延后刷新自动备份面板失败:", error);
      }

      try {
        await renderWidgetSettingsPanel("init");
      } catch (error) {
        console.error("设置页延后渲染小组件面板失败:", error);
      }

      scheduleSettingsCollapsibleRefresh();
      window.ControlerUI?.markPerfStage?.("settings-deferred-init-complete");
      resolve(true);
    });
  });

  return settingsDeferredPanelInitPromise;
}

let themes = [];
const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
const BUILT_IN_THEME_LEGACY_NAME_MAP = Object.freeze({
  "graphite-mist": Object.freeze(["石墨灰"]),
  "porcelain-mist": Object.freeze(["瓷雾白"]),
  "oyster-linen": Object.freeze(["雾贝绢白"]),
});
const LEGACY_BUILT_IN_THEME_OVERRIDE_SNAPSHOTS = Object.freeze({
  "graphite-mist": Object.freeze({
    name: "石墨灰",
    colors: Object.freeze({
      primary: "#2a2d32",
      secondary: "rgba(58, 62, 69, 0.5)",
      tertiary: "rgba(76, 81, 90, 0.58)",
      quaternary: "rgba(240, 243, 250, 0.1)",
      accent: "#f0f3fa",
      text: "#f8f9fc",
      mutedText: "rgba(248, 249, 252, 0.74)",
      border: "rgba(224, 227, 234, 0.24)",
      delete: "#ff8787",
      deleteHover: "#ff6b6b",
      projectLevel1: "#d8dde7",
      projectLevel2: "#aeb5c2",
      projectLevel3: "#808897",
      panel: "rgba(39, 42, 48, 0.86)",
      panelStrong: "rgba(45, 49, 56, 0.94)",
      panelBorder: "rgba(224, 227, 234, 0.15)",
      buttonBg: "#f0f3fa",
      buttonBgHover: "#ffffff",
      buttonText: "#222832",
      buttonBorder: "rgba(240, 243, 250, 0.56)",
      onAccentText: "#222832",
      navBarBg: "rgba(33, 36, 41, 0.9)",
      navButtonBg: "rgba(240, 243, 250, 0.06)",
      navButtonActiveBg: "rgba(124, 134, 149, 0.82)",
      overlay: "rgba(8, 10, 12, 0.45)",
    }),
    recordCard: Object.freeze({
      mode: "project",
      color: "#d8dde7",
    }),
  }),
});

const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const APP_NAV_VISIBILITY_STORAGE_KEY = "appNavigationVisibility";
const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
const APP_NAV_REORDER_DESKTOP_HOLD_MS = 280;
const APP_NAV_REORDER_TOUCH_HOLD_MS = 420;
const APP_NAV_REORDER_CANCEL_DISTANCE_PX = 10;
const APP_NAV_REORDER_ANDROID_TOUCH_CANCEL_DISTANCE_PX = 18;
const SETTINGS_COLLAPSIBLE_CARD_SELECTORS = [
  ".settings-card--themes",
  ".settings-card--table-scale",
  ".settings-card--widgets",
  ".settings-storage-card--bundle",
];
const settingsCollapsibleSections = [];
let settingsCollapsibleRefreshFrame = null;
function localizeSettingsUiText(value) {
  return window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "");
}
const ANDROID_WIDGET_MANUAL_ADD_HINT =
  "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加";
const SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS = 20000;
const SETTINGS_WIDGET_PIN_RETURN_GRACE_MS = 1200;
const DEFAULT_ANDROID_WIDGET_PIN_SUPPORT = Object.freeze({
  ok: false,
  kind: "",
  supported: false,
  apiSupported: false,
  launcherSupported: false,
  canRequestPin: false,
  manualOnly: false,
  providerAvailable: false,
  reason: "unsupported-env",
  message: "当前环境不支持 Android 小组件固定。",
});
const SETTINGS_WIDGET_TYPES_SOURCE =
  typeof window.ControlerPlatformContract?.getWidgetKinds === "function"
    ? window.ControlerPlatformContract.getWidgetKinds()
    : Array.isArray(window.ControlerPlatformContract?.widgetKinds)
      ? window.ControlerPlatformContract.widgetKinds
      : [];
const SETTINGS_WIDGET_TYPES = (
  Array.isArray(SETTINGS_WIDGET_TYPES_SOURCE)
    ? SETTINGS_WIDGET_TYPES_SOURCE
    : []
).map((item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
}));
const settingsWidgetPinStateByKind = new Map();
const settingsWidgetPinTimeouts = new Map();
const SETTINGS_NAVIGATION_ITEMS = [
  {
    key: "index",
    title: "记录",
    description: "显示时间记录入口。",
  },
  {
    key: "stats",
    title: "统计",
    description: "显示统计视图入口。",
  },
  {
    key: "plan",
    title: "计划",
    description: "显示计划页面入口。",
  },
  {
    key: "todo",
    title: "待办",
    description: "显示待办与打卡入口。",
  },
  {
    key: "diary",
    title: "日记",
    description: "显示日记页面入口。",
  },
  {
    key: "settings",
    title: "设置",
    description: "显示设置页面入口。",
  },
];
const SETTINGS_NAVIGATION_DEFAULT_AFTER_MAP = new Map(
  SETTINGS_NAVIGATION_ITEMS.map((item, index) => [
    item.key,
    index > 0 ? SETTINGS_NAVIGATION_ITEMS[index - 1].key : "",
  ]),
);

function normalizeNavigationVisibilityState(rawState) {
  const source =
    rawState && typeof rawState === "object" && !Array.isArray(rawState)
      ? rawState
      : {};
  const hiddenPages = Array.isArray(source.hiddenPages)
    ? source.hiddenPages
        .map((pageKey) => String(pageKey || "").trim())
        .filter(
          (pageKey, index, list) =>
            SETTINGS_NAVIGATION_ITEMS.some((item) => item.key === pageKey) &&
            pageKey !== "settings" &&
            list.indexOf(pageKey) === index,
        )
    : [];
  const rawOrder = Array.isArray(source.order) ? source.order : [];
  const order = rawOrder
    .map((pageKey) => String(pageKey || "").trim())
    .filter(
      (pageKey, index, list) =>
        SETTINGS_NAVIGATION_ITEMS.some((item) => item.key === pageKey) &&
        list.indexOf(pageKey) === index,
    );

  SETTINGS_NAVIGATION_ITEMS.forEach((item) => {
    if (order.includes(item.key)) {
      return;
    }
    const previousDefaultKey =
      SETTINGS_NAVIGATION_DEFAULT_AFTER_MAP.get(item.key) || "";
    const previousIndex = previousDefaultKey
      ? order.indexOf(previousDefaultKey)
      : -1;
    if (previousIndex >= 0) {
      order.splice(previousIndex + 1, 0, item.key);
      return;
    }
    order.push(item.key);
  });

  return {
    hiddenPages,
    order,
  };
}

function getNavigationState() {
  if (typeof window.ControlerUI?.getAppNavigationState === "function") {
    return window.ControlerUI.getAppNavigationState();
  }

  try {
    return normalizeNavigationVisibilityState(
      JSON.parse(localStorage.getItem(APP_NAV_VISIBILITY_STORAGE_KEY) || "{}"),
    );
  } catch (error) {
    return normalizeNavigationVisibilityState(null);
  }
}

function getHiddenNavigationPages() {
  return [...getNavigationState().hiddenPages];
}

function getOrderedNavigationPages() {
  return [...getNavigationState().order];
}

function saveNavigationState(nextState = {}) {
  const currentState = getNavigationState();
  const normalizedState = normalizeNavigationVisibilityState({
    hiddenPages: Array.isArray(nextState.hiddenPages)
      ? nextState.hiddenPages
      : currentState.hiddenPages,
    order: Array.isArray(nextState.order) ? nextState.order : currentState.order,
  });

  if (typeof window.ControlerUI?.setAppNavigationState === "function") {
    return window.ControlerUI.setAppNavigationState(normalizedState);
  }

  localStorage.setItem(
    APP_NAV_VISIBILITY_STORAGE_KEY,
    JSON.stringify(normalizedState),
  );
  window.ControlerUI?.applyAppNavigationVisibility?.();
  return normalizedState;
}

function saveHiddenNavigationPages(hiddenPages = []) {
  return saveNavigationState({
    hiddenPages,
  });
}

function saveOrderedNavigationPages(order = []) {
  return saveNavigationState({
    order,
  });
}

function updateNavigationVisibilityHint(navigationState = null) {
  const hint = document.getElementById("navigation-visibility-hint");
  if (!hint) {
    return;
  }
  hint.textContent = "";
  hint.hidden = true;
}

function getNavigationToggleStateLabel(isFixed, checked) {
  if (isFixed) {
    return "固定";
  }
  return checked ? "显示中" : "已隐藏";
}

function getNavigationToggleActionLabel(isFixed, checked) {
  if (isFixed) {
    return "固定显示";
  }
  return checked ? "隐藏" : "显示";
}

function updateNavigationToggleCardState(card, checked) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const nextChecked = !!checked;
  const input = card.querySelector("[data-navigation-toggle]");
  const actionButton = card.querySelector("[data-navigation-toggle-action]");
  const stateLabel = card.querySelector("[data-navigation-state-label]");
  const isFixed =
    (input instanceof HTMLInputElement && input.disabled) ||
    (actionButton instanceof HTMLButtonElement && actionButton.disabled);

  card.classList.toggle("is-visible", nextChecked);
  card.dataset.checked = nextChecked ? "true" : "false";
  card.dataset.visibilityState = isFixed
    ? "fixed"
    : nextChecked
      ? "visible"
      : "hidden";

  if (stateLabel instanceof HTMLElement) {
    stateLabel.textContent = getNavigationToggleStateLabel(isFixed, nextChecked);
  }

  if (actionButton instanceof HTMLButtonElement) {
    actionButton.textContent = getNavigationToggleActionLabel(
      isFixed,
      nextChecked,
    );
    actionButton.setAttribute("aria-pressed", nextChecked ? "true" : "false");
  }
}

function refreshNavigationToggleCardStates(grid) {
  if (!(grid instanceof HTMLElement)) {
    return;
  }

  grid.querySelectorAll(".settings-nav-toggle[data-navigation-item]").forEach((card) => {
    const input = card.querySelector("[data-navigation-toggle]");
    updateNavigationToggleCardState(
      card,
      input instanceof HTMLInputElement && input.checked,
    );
  });
}

function isAndroidNativeSettingsRuntime() {
  return (
    document.documentElement.classList.contains("controler-android-native") ||
    document.body?.classList.contains("controler-android-native")
  );
}

function bindNavigationReorderInteractions(grid) {
  const itemSelector = ".settings-nav-toggle[data-navigation-item]";
  const androidTouchRuntime = isAndroidNativeSettingsRuntime();
  grid.classList.toggle("settings-nav-grid--android-touch", androidTouchRuntime);

  const swapNavigationOrder = (sourceKey, targetKey) => {
    const nextOrder = getOrderedNavigationPages();
    const sourceIndex = nextOrder.indexOf(sourceKey);
    const targetIndex = nextOrder.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    [nextOrder[sourceIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[sourceIndex],
    ];
    saveOrderedNavigationPages(nextOrder);
    renderNavigationVisibilitySettings();
  };

  const resolveTargetItemFromPoint = (sourceItem, clientX, clientY) => {
    const element = document.elementFromPoint(clientX, clientY);
    const nextTarget =
      element instanceof Element ? element.closest(itemSelector) : null;
    return nextTarget instanceof HTMLElement && nextTarget !== sourceItem
      ? nextTarget
      : null;
  };

  grid.querySelectorAll(itemSelector).forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    if (androidTouchRuntime) {
      item.addEventListener(
        "touchstart",
        (event) => {
          if (!(event.currentTarget instanceof HTMLElement)) {
            return;
          }
          if (event.touches.length !== 1) {
            return;
          }
          if (
            event.target instanceof Element &&
            event.target.closest(".settings-nav-toggle-check")
          ) {
            return;
          }

          const sourceItem = event.currentTarget;
          const sourceKey = String(sourceItem.dataset.navigationItem || "").trim();
          if (!sourceKey) {
            return;
          }

          const initialTouch = event.touches[0];
          const touchId = initialTouch.identifier;
          const startX = initialTouch.clientX;
          const startY = initialTouch.clientY;
          let active = false;
          let targetItem = null;
          let suppressNextClick = false;
          let holdTimer = window.setTimeout(() => {
            active = true;
            suppressNextClick = true;
            sourceItem.classList.add("is-reorder-source");
            grid.classList.add("is-touch-reordering");
            document.documentElement.classList.add(
              "controler-android-touch-reordering",
            );
            document.body?.classList.add("controler-android-touch-reordering");
            window.navigator?.vibrate?.(12);
            updateTarget(startX, startY);
          }, APP_NAV_REORDER_TOUCH_HOLD_MS);

          const clearHoldTimer = () => {
            if (holdTimer) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
          };

          const resolveTouchByIdentifier = (touchList) => {
            if (!touchList) {
              return null;
            }
            for (let index = 0; index < touchList.length; index += 1) {
              const touch = touchList[index];
              if (touch.identifier === touchId) {
                return touch;
              }
            }
            return null;
          };

          const updateTarget = (clientX, clientY) => {
            const resolvedTarget = resolveTargetItemFromPoint(
              sourceItem,
              clientX,
              clientY,
            );
            if (targetItem === resolvedTarget) {
              return;
            }
            targetItem?.classList.remove("is-reorder-target");
            targetItem = resolvedTarget;
            targetItem?.classList.add("is-reorder-target");
          };

          const handleClickCapture = (clickEvent) => {
            if (!suppressNextClick) {
              return;
            }
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            suppressNextClick = false;
          };

          sourceItem.addEventListener("click", handleClickCapture, true);

          const cleanup = () => {
            clearHoldTimer();
            targetItem?.classList.remove("is-reorder-target");
            sourceItem.classList.remove("is-reorder-source");
            grid.classList.remove("is-touch-reordering");
            document.documentElement.classList.remove(
              "controler-android-touch-reordering",
            );
            document.body?.classList.remove("controler-android-touch-reordering");
            window.removeEventListener("touchmove", handleTouchMove, {
              capture: true,
            });
            window.removeEventListener("touchend", handleTouchEnd, {
              capture: true,
            });
            window.removeEventListener("touchcancel", handleTouchCancel, {
              capture: true,
            });
            const releaseClickCapture = () => {
              sourceItem.removeEventListener("click", handleClickCapture, true);
            };
            if (suppressNextClick) {
              window.setTimeout(releaseClickCapture, 0);
              return;
            }
            releaseClickCapture();
          };

          const handleTouchMove = (moveEvent) => {
            const activeTouch = resolveTouchByIdentifier(moveEvent.touches);
            if (!activeTouch) {
              return;
            }

            if (!active) {
              if (
                Math.abs(activeTouch.clientX - startX) >
                  APP_NAV_REORDER_ANDROID_TOUCH_CANCEL_DISTANCE_PX ||
                Math.abs(activeTouch.clientY - startY) >
                  APP_NAV_REORDER_ANDROID_TOUCH_CANCEL_DISTANCE_PX
              ) {
                cleanup();
              }
              return;
            }

            updateTarget(activeTouch.clientX, activeTouch.clientY);
            if (moveEvent.cancelable) {
              moveEvent.preventDefault();
            }
          };

          const handleTouchEnd = (endEvent) => {
            const endedTouch = resolveTouchByIdentifier(endEvent.changedTouches);
            if (!endedTouch) {
              return;
            }
            if (active) {
              updateTarget(endedTouch.clientX, endedTouch.clientY);
              if (endEvent.cancelable) {
                endEvent.preventDefault();
              }
            }
            const resolvedTargetItem = targetItem;
            const nextTargetKey = String(
              resolvedTargetItem?.dataset.navigationItem || "",
            );
            cleanup();
            if (active && nextTargetKey && nextTargetKey !== sourceKey) {
              swapNavigationOrder(sourceKey, nextTargetKey);
            }
          };

          const handleTouchCancel = (cancelEvent) => {
            if (!resolveTouchByIdentifier(cancelEvent.changedTouches)) {
              return;
            }
            cleanup();
          };

          window.addEventListener("touchmove", handleTouchMove, {
            capture: true,
            passive: false,
          });
          window.addEventListener("touchend", handleTouchEnd, {
            capture: true,
            passive: false,
          });
          window.addEventListener("touchcancel", handleTouchCancel, {
            capture: true,
          });
        },
        {
          passive: true,
        },
      );
      return;
    }
    item.addEventListener("pointerdown", (event) => {
      if (!(event.currentTarget instanceof HTMLElement)) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest(".settings-nav-toggle-check")
      ) {
        return;
      }

      const sourceItem = event.currentTarget;
      const sourceKey = String(sourceItem.dataset.navigationItem || "").trim();
      if (!sourceKey) {
        return;
      }

      const pointerType = event.pointerType || "mouse";
      const holdDelay =
        pointerType === "touch"
          ? APP_NAV_REORDER_TOUCH_HOLD_MS
          : APP_NAV_REORDER_DESKTOP_HOLD_MS;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let targetItem = null;
      let holdTimer = window.setTimeout(() => {
        active = true;
        try {
          sourceItem.setPointerCapture?.(pointerId);
        } catch (error) {
          // ignore capture errors in unsupported runtimes
        }
        sourceItem.classList.add("is-reorder-source");
        grid.classList.add(
          pointerType === "touch"
            ? "is-touch-reordering"
            : "is-desktop-reordering",
        );
        if (pointerType === "touch") {
          window.navigator?.vibrate?.(12);
        }
      }, holdDelay);

      const clearHoldTimer = () => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      const updateTarget = (clientX, clientY) => {
        const resolvedTarget = resolveTargetItemFromPoint(
          sourceItem,
          clientX,
          clientY,
        );
        if (targetItem === resolvedTarget) {
          return;
        }
        targetItem?.classList.remove("is-reorder-target");
        targetItem = resolvedTarget;
        targetItem?.classList.add("is-reorder-target");
      };

      const cleanup = () => {
        clearHoldTimer();
        targetItem?.classList.remove("is-reorder-target");
        sourceItem.classList.remove("is-reorder-source");
        grid.classList.remove("is-touch-reordering", "is-desktop-reordering");
        window.removeEventListener("pointermove", handlePointerMove, {
          capture: true,
        });
        window.removeEventListener("pointerup", handlePointerUp, {
          capture: true,
        });
        window.removeEventListener("pointercancel", handlePointerCancel, {
          capture: true,
        });
        try {
          sourceItem.releasePointerCapture?.(pointerId);
        } catch (error) {
          // ignore release errors for browsers that don't support it here
        }
      };

      const handlePointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }

        if (!active) {
          if (
            Math.abs(moveEvent.clientX - startX) >
              APP_NAV_REORDER_CANCEL_DISTANCE_PX ||
            Math.abs(moveEvent.clientY - startY) >
              APP_NAV_REORDER_CANCEL_DISTANCE_PX
          ) {
            cleanup();
          }
          return;
        }

        updateTarget(moveEvent.clientX, moveEvent.clientY);
        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }
      };

      const handlePointerUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        if (active) {
          updateTarget(upEvent.clientX, upEvent.clientY);
        }
        const resolvedTargetItem = targetItem;
        const nextTargetKey = String(
          resolvedTargetItem?.dataset.navigationItem || "",
        );
        cleanup();
        if (active && nextTargetKey && nextTargetKey !== sourceKey) {
          swapNavigationOrder(sourceKey, nextTargetKey);
        }
      };

      const handlePointerCancel = (cancelEvent) => {
        if (cancelEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
      };

      window.addEventListener("pointermove", handlePointerMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener("pointerup", handlePointerUp, {
        capture: true,
      });
      window.addEventListener("pointercancel", handlePointerCancel, {
        capture: true,
      });
    });
  });
}

function renderNavigationVisibilitySettings() {
  const grid = document.getElementById("navigation-visibility-grid");
  if (!grid) {
    return;
  }

  const navigationState = getNavigationState();
  const hiddenPages = new Set(navigationState.hiddenPages);
  grid.innerHTML = "";

  navigationState.order
    .map((pageKey) =>
      SETTINGS_NAVIGATION_ITEMS.find((item) => item.key === pageKey),
    )
    .filter(Boolean)
    .forEach((item) => {
      const card = document.createElement("div");
      const isFixed = item.key === "settings";
      const isVisible = isFixed || !hiddenPages.has(item.key);
      card.className = `settings-nav-toggle${isFixed ? " is-fixed" : ""}`;
      card.dataset.navigationItem = item.key;
      card.innerHTML = `
        <div class="settings-nav-toggle-header">
          <div class="settings-nav-toggle-title">${item.title}</div>
          <span class="settings-nav-toggle-status" data-navigation-state-label>${getNavigationToggleStateLabel(isFixed, isVisible)}</span>
        </div>
        <div class="settings-nav-toggle-description">${item.description}</div>
        <div class="settings-nav-toggle-footer">
          <button
            type="button"
            class="settings-nav-toggle-check"
            data-navigation-toggle-action="${item.key}"
            aria-pressed="${isVisible ? "true" : "false"}"
            ${isFixed ? "disabled" : ""}
          >
            ${getNavigationToggleActionLabel(isFixed, isVisible)}
          </button>
        </div>
        <input
          type="checkbox"
          class="settings-nav-toggle-input"
          data-navigation-toggle="${item.key}"
          ${isVisible ? "checked" : ""}
          ${isFixed ? "disabled" : ""}
          tabindex="-1"
          aria-hidden="true"
        />
      `;
      grid.appendChild(card);
    });

  const syncVisibility = async (changedKey) => {
    if (changedKey === "settings") {
      const fixedInput = grid.querySelector(`[data-navigation-toggle="settings"]`);
      if (fixedInput instanceof HTMLInputElement) {
        fixedInput.checked = true;
      }
      return;
    }

    const nextHiddenPages = SETTINGS_NAVIGATION_ITEMS.filter((item) => {
      if (item.key === "settings") {
        return false;
      }
      const input = grid.querySelector(`[data-navigation-toggle="${item.key}"]`);
      return !(input instanceof HTMLInputElement) || !input.checked;
    }).map((item) => item.key);

    if (
      nextHiddenPages.length >=
      SETTINGS_NAVIGATION_ITEMS.filter((item) => item.key !== "settings").length
    ) {
      const changedInput = grid.querySelector(
        `[data-navigation-toggle="${changedKey}"]`,
      );
      if (changedInput instanceof HTMLInputElement) {
        changedInput.checked = true;
      }
      await showSettingsAlert("至少保留一个导航按钮，不能全部隐藏。", {
        title: "无法保存",
        danger: true,
      });
      return;
    }

    const nextState = saveHiddenNavigationPages(nextHiddenPages);
    updateNavigationVisibilityHint(nextState);
  };

  grid.querySelectorAll("[data-navigation-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      const pageKey = String(input.dataset.navigationToggle || "").trim();
      await syncVisibility(pageKey);
      refreshNavigationToggleCardStates(grid);
    });
  });

  grid.querySelectorAll("[data-navigation-toggle-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const pageKey = String(button.dataset.navigationToggleAction || "").trim();
      const input = grid.querySelector(`[data-navigation-toggle="${pageKey}"]`);
      if (!(input instanceof HTMLInputElement) || input.disabled) {
        return;
      }

      input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  bindNavigationReorderInteractions(grid);
  refreshNavigationToggleCardStates(grid);
  updateNavigationVisibilityHint(navigationState);
}

function getStorageEntries() {
  const keys =
    typeof window !== "undefined" &&
    window.ControlerStorage &&
    typeof window.ControlerStorage.keys === "function"
      ? window.ControlerStorage.keys()
      : Array.from({ length: localStorage.length }, (_, index) =>
          localStorage.key(index),
        ).filter(Boolean);

  return keys.map((key) => [key, localStorage.getItem(key) || ""]);
}

function parseHexColor(color) {
  const match = normalizeThemeColorInputValue(color).match(HEX_COLOR_PATTERN);
  if (!match) return null;
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

function toHexColor(color, fallback = "#000000") {
  const hex = parseHexColor(color);
  if (hex) {
    return `#${normalizeThemeColorInputValue(color).slice(1).toUpperCase()}`;
  }

  const rgbMatch = normalizeThemeColorInputValue(color).match(RGB_COLOR_PATTERN);
  if (rgbMatch) {
    return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((value) => Number(value).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }

  return fallback;
}

function toRgbChannels(color) {
  if (!color) return "121,175,133";

  const normalized = normalizeThemeColorInputValue(color);
  const hex = normalized.match(HEX_COLOR_PATTERN);
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    return `${r},${g},${b}`;
  }

  const rgb = normalized.match(RGB_COLOR_PATTERN);
  if (rgb) {
    return `${rgb[1]},${rgb[2]},${rgb[3]}`;
  }

  return "121,175,133";
}

function toRgbaColor(color, alpha = 1) {
  return `rgba(${toRgbChannels(color)}, ${alpha})`;
}

function isValidThemeColorValue(color) {
  const normalized = normalizeThemeColorInputValue(color);
  return (
    HEX_COLOR_PATTERN.test(normalized) || RGB_COLOR_PATTERN.test(normalized)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getReadableTextColor(
  color,
  darkText = "#173326",
  lightText = "#f8fafc",
) {
  const rgb = parseHexColor(toHexColor(color, ""));
  if (!rgb) {
    return darkText;
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.62 ? darkText : lightText;
}

function getRelativeLuminance(color) {
  const rgb = parseHexColor(toHexColor(color, ""));
  if (!rgb) {
    return null;
  }

  const normalizeChannel = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * normalizeChannel(rgb.r) +
    0.7152 * normalizeChannel(rgb.g) +
    0.0722 * normalizeChannel(rgb.b)
  );
}

function getContrastRatio(backgroundColor, textColor) {
  const backgroundLuminance = getRelativeLuminance(backgroundColor);
  const textLuminance = getRelativeLuminance(textColor);
  if (
    !Number.isFinite(backgroundLuminance) ||
    !Number.isFinite(textLuminance)
  ) {
    return 0;
  }

  const lighter = Math.max(backgroundLuminance, textLuminance);
  const darker = Math.min(backgroundLuminance, textLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableTextColor(
  backgroundColor,
  preferredTextColor,
  darkText = "#173326",
  lightText = "#f8fafc",
  minContrast = 4.2,
) {
  const fallbackTextColor = getReadableTextColor(
    backgroundColor,
    darkText,
    lightText,
  );
  if (!isValidThemeColorValue(preferredTextColor)) {
    return fallbackTextColor;
  }

  const normalizedTextColor = preferredTextColor.trim();
  return getContrastRatio(backgroundColor, normalizedTextColor) >= minContrast
    ? normalizedTextColor
    : fallbackTextColor;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveOptionalThemeColorValue(color) {
  return isValidThemeColorValue(color) ? color.trim() : "";
}

function resolveThemeEditorWidgetColorFallbacks(colors = {}) {
  const resolvedColors = resolveThemeColors({
    colors: {
      ...DEFAULT_THEME_COLORS,
      ...(colors && typeof colors === "object" ? colors : {}),
    },
  });
  const widgetColors =
    typeof window.ControlerTheme?.resolveWidgetThemeColors === "function"
      ? window.ControlerTheme.resolveWidgetThemeColors(resolvedColors)
      : null;
  return {
    widgetCardBg: firstNonEmpty(
      widgetColors?.cardBase,
      resolvedColors.panelStrong,
      resolvedColors.panel,
      DEFAULT_THEME_COLORS.panelStrong,
    ),
    widgetItemBg: firstNonEmpty(
      widgetColors?.itemCardBase,
      widgetColors?.subtleSurface,
      resolvedColors.panel,
      DEFAULT_THEME_COLORS.panel,
    ),
    widgetText: firstNonEmpty(
      widgetColors?.textColor,
      resolvedColors.text,
      DEFAULT_THEME_COLORS.text,
    ),
    widgetButtonBg: firstNonEmpty(
      widgetColors?.buttonBg,
      widgetColors?.accentActionBg,
      resolvedColors.buttonBg,
      DEFAULT_THEME_COLORS.buttonBg,
    ),
    widgetButtonText: firstNonEmpty(
      widgetColors?.buttonText,
      resolvedColors.buttonText,
      DEFAULT_THEME_COLORS.buttonText,
    ),
  };
}

function normalizeThemeRecordCardMode(mode, fallback = DEFAULT_THEME_RECORD_CARD.mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode === "theme" || normalizedMode === "custom") {
    return "theme";
  }
  if (normalizedMode === "project" || normalizedMode === "stats") {
    return "project";
  }
  return fallback === "theme" ? "theme" : "project";
}

function resolveThemeRecordCard(theme = null, resolvedColors = null) {
  if (typeof resolveThemeRuntime()?.resolveThemeRecordCard === "function") {
    return resolveThemeRuntime().resolveThemeRecordCard(theme, resolvedColors);
  }
  return {
    mode: normalizeThemeRecordCardMode(theme?.recordCard?.mode),
    color: DEFAULT_THEME_RECORD_CARD.color,
  };
}

function resolveThemeColors(theme = null) {
  if (typeof resolveThemeRuntime()?.resolveThemeColors === "function") {
    return resolveThemeRuntime().resolveThemeColors(theme);
  }
  return {
    ...DEFAULT_THEME_COLORS,
  };
}

function sanitizeThemeId(name, existingId = "") {
  if (typeof resolveThemeRuntime()?.sanitizeThemeId === "function") {
    return resolveThemeRuntime().sanitizeThemeId(name, existingId);
  }
  const normalized = String(name || existingId || "custom-theme")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || existingId || `custom-theme-${Date.now().toString(36)}`;
}

function normalizeThemeObject(theme, index = 0) {
  if (typeof resolveThemeRuntime()?.normalizeThemeObject === "function") {
    return resolveThemeRuntime().normalizeThemeObject(theme, index);
  }
  return {
    id: `custom-${sanitizeThemeId(theme?.id || theme?.name || `theme-${index + 1}`)}`,
    name: theme?.name || `自定义主题 ${index + 1}`,
    colors: resolveThemeColors(theme),
    recordCard: resolveThemeRecordCard(theme),
    isCustom: true,
    isBuiltIn: false,
    hasOverride: false,
  };
}

function readThemeStorageRawValue(storageKey) {
  const normalizedKey = String(storageKey || "").trim();
  if (!normalizedKey) {
    return null;
  }
  try {
    const storageValue = localStorage.getItem(normalizedKey);
    if (storageValue !== null && typeof storageValue !== "undefined") {
      return storageValue;
    }
  } catch (error) {
    console.error("读取主题存储失败:", error);
  }
  try {
    return localStorage.getItem(`${LOCAL_ONLY_STORAGE_PREFIX}${normalizedKey}`);
  } catch (error) {
    console.error("读取主题本地镜像失败:", error);
    return null;
  }
}

function writeThemeStorageValue(storageKey, rawValue) {
  const normalizedKey = String(storageKey || "").trim();
  if (!normalizedKey) {
    return;
  }
  const nextValue =
    typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue ?? null);
  try {
    if (localStorage.getItem(normalizedKey) !== nextValue) {
      localStorage.setItem(normalizedKey, nextValue);
    }
  } catch (error) {
    console.error("写入主题存储失败:", error);
  }
  try {
    const localMirrorKey = `${LOCAL_ONLY_STORAGE_PREFIX}${normalizedKey}`;
    if (localStorage.getItem(localMirrorKey) !== nextValue) {
      localStorage.setItem(localMirrorKey, nextValue);
    }
  } catch (error) {
    console.error("写入主题本地镜像失败:", error);
  }
}

function parseThemeStorageJson(storageKey, fallback) {
  const rawValue = readThemeStorageRawValue(storageKey);
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed === null || typeof parsed === "undefined" ? fallback : parsed;
  } catch (error) {
    console.error("解析主题存储失败:", error);
    return fallback;
  }
}

function getStoredThemeStateSnapshot() {
  if (typeof resolveThemeRuntime()?.getStoredThemeState === "function") {
    return resolveThemeRuntime().getStoredThemeState();
  }
  const selectedThemeRaw = readThemeStorageRawValue("selectedTheme");
  const customThemes = parseThemeStorageJson(CUSTOM_THEMES_STORAGE_KEY, []);
  const builtInThemeOverrides = parseThemeStorageJson(
    BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
    {},
  );
  return {
    selectedTheme:
      typeof selectedThemeRaw === "string" && selectedThemeRaw.trim()
        ? selectedThemeRaw.trim()
        : "obsidian-mono",
    customThemes: Array.isArray(customThemes) ? customThemes : [],
    builtInThemeOverrides:
      builtInThemeOverrides &&
      typeof builtInThemeOverrides === "object" &&
      !Array.isArray(builtInThemeOverrides)
        ? builtInThemeOverrides
        : {},
  };
}

function getStoredSelectedThemeId() {
  const storedThemeState = getStoredThemeStateSnapshot();
  const selectedTheme =
    typeof storedThemeState?.selectedTheme === "string" &&
    storedThemeState.selectedTheme.trim()
      ? storedThemeState.selectedTheme.trim()
      : "";
  if (selectedTheme) {
    return selectedTheme;
  }
  const resolvedThemeId =
    typeof storedThemeState?.themeId === "string" && storedThemeState.themeId.trim()
      ? storedThemeState.themeId.trim()
      : "";
  return resolvedThemeId || "obsidian-mono";
}

function loadCustomThemes() {
  try {
    const raw = getStoredThemeStateSnapshot()?.customThemes;
    if (!Array.isArray(raw)) return [];
    return raw.map((theme, index) => normalizeThemeObject(theme, index));
  } catch (error) {
    console.error("加载自定义主题失败:", error);
    return [];
  }
}

function serializeCustomThemeForStorage(theme, index = 0) {
  const normalizedTheme = normalizeThemeObject(theme, index);
  return {
    id: normalizedTheme.id,
    name: normalizedTheme.name,
    colors: { ...(normalizedTheme.colors || {}) },
    recordCard: { ...(normalizedTheme.recordCard || {}) },
  };
}

function saveCustomThemes(customThemes) {
  const normalized = Array.isArray(customThemes)
    ? customThemes.map((theme, index) => normalizeThemeObject(theme, index))
    : [];
  const storedThemes = normalized.map((theme, index) =>
    serializeCustomThemeForStorage(theme, index),
  );
  writeThemeStorageValue(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(storedThemes));
  scheduleThemeStorageFlush({
    customThemes: storedThemes,
  });
  return normalized;
}

function resolveThemeDraftSource(baseTheme = null) {
  const sourceTheme =
    baseTheme && typeof baseTheme === "object" && !Array.isArray(baseTheme)
      ? baseTheme
      : null;
  const themeId =
    typeof sourceTheme?.id === "string" && sourceTheme.id.trim()
      ? sourceTheme.id.trim()
      : "";
  if (!themeId) {
    return BUILT_IN_THEMES[0] || null;
  }

  const builtInTheme = BUILT_IN_THEMES.find((theme) => theme.id === themeId);
  if (builtInTheme) {
    return (
      resolveBuiltInThemeDefinition(
        themeId,
        loadBuiltInThemeOverrides()?.[themeId],
      ) || builtInTheme
    );
  }

  const storedCustomTheme = loadCustomThemes().find((theme) => theme.id === themeId);
  if (storedCustomTheme) {
    return storedCustomTheme;
  }

  return normalizeThemeObject(sourceTheme);
}

function resolveBuiltInThemeDefinition(themeId, override = null) {
  if (typeof resolveThemeRuntime()?.resolveBuiltInTheme === "function") {
    return resolveThemeRuntime().resolveBuiltInTheme(themeId, override);
  }

  const baseTheme = BUILT_IN_THEMES.find((item) => item.id === themeId);
  if (!baseTheme) {
    return null;
  }

  const normalizedOverride = normalizeBuiltInThemeOverride(themeId, override);
  const draftTheme = {
    ...baseTheme,
    name: normalizedOverride?.name || baseTheme.name,
    colors: {
      ...(isPlainObject(baseTheme.colors) ? baseTheme.colors : {}),
      ...(isPlainObject(normalizedOverride?.colors)
        ? normalizedOverride.colors
        : {}),
    },
    recordCard: {
      ...(isPlainObject(baseTheme.recordCard) ? baseTheme.recordCard : {}),
      ...(isPlainObject(normalizedOverride?.recordCard)
        ? normalizedOverride.recordCard
        : {}),
    },
    isCustom: false,
    isBuiltIn: true,
    hasOverride: Boolean(normalizedOverride),
  };
  const resolvedColors = resolveThemeColors(draftTheme);
  return {
    ...draftTheme,
    colors: resolvedColors,
    recordCard: resolveThemeRecordCard(draftTheme, resolvedColors),
  };
}

function normalizeThemeComparisonValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function areThemeColorMapsEqual(leftColors = {}, rightColors = {}) {
  return Object.keys(DEFAULT_THEME_COLORS).every(
    (key) =>
      normalizeThemeComparisonValue(leftColors?.[key]) ===
      normalizeThemeComparisonValue(rightColors?.[key]),
  );
}

function areThemeRecordCardsEqual(leftRecordCard = {}, rightRecordCard = {}) {
  return (
    normalizeThemeRecordCardMode(leftRecordCard?.mode) ===
      normalizeThemeRecordCardMode(rightRecordCard?.mode) &&
    normalizeThemeComparisonValue(leftRecordCard?.color) ===
      normalizeThemeComparisonValue(rightRecordCard?.color)
  );
}

function buildComparableBuiltInThemeOverride(baseTheme, override = {}) {
  if (
    !baseTheme ||
    !override ||
    typeof override !== "object" ||
    Array.isArray(override)
  ) {
    return null;
  }
  const normalizeThemeColorComparisonValue = (color) =>
    isValidThemeColorValue(color)
      ? String(color).trim().toLowerCase().replace(/\s+/g, "")
      : "";
  const autoDerivedNavKeys = [
    "navBarBorder",
    "navButtonText",
    "navButtonActiveText",
  ];
  const storedColors = {};
  Object.entries(override?.colors || {}).forEach(([key, value]) => {
    if (isValidThemeColorValue(value)) {
      storedColors[key] = value.trim();
    }
  });
  const autoDerivedComparisonColors = { ...storedColors };
  autoDerivedNavKeys.forEach((key) => {
    delete autoDerivedComparisonColors[key];
  });
  const autoDerivedColors = resolveThemeColors({
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...autoDerivedComparisonColors,
    },
  });
  const baseResolvedColors = resolveThemeColors(baseTheme);
  autoDerivedNavKeys.forEach((key) => {
    if (
      normalizeThemeColorComparisonValue(storedColors[key]) &&
      (normalizeThemeColorComparisonValue(storedColors[key]) ===
        normalizeThemeColorComparisonValue(autoDerivedColors[key]) ||
        normalizeThemeColorComparisonValue(storedColors[key]) ===
          normalizeThemeColorComparisonValue(baseResolvedColors[key]))
    ) {
      delete storedColors[key];
    }
  });
  Object.keys(storedColors).forEach((key) => {
    if (autoDerivedNavKeys.includes(key)) {
      return;
    }
    if (
      normalizeThemeColorComparisonValue(storedColors[key]) ===
      normalizeThemeColorComparisonValue(baseResolvedColors[key])
    ) {
      delete storedColors[key];
    }
  });
  const normalizedColors = resolveThemeColors({
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...storedColors,
    },
  });
  const normalizedRecordCard = resolveThemeRecordCard(
    {
      ...baseTheme,
      recordCard: {
        ...(baseTheme.recordCard || {}),
        ...(override?.recordCard || {}),
      },
    },
    normalizedColors,
  );
  const trimmedOverrideName =
    typeof override?.name === "string" ? override.name.trim() : "";
  const legacyNames = Array.isArray(BUILT_IN_THEME_LEGACY_NAME_MAP[baseTheme.id])
    ? BUILT_IN_THEME_LEGACY_NAME_MAP[baseTheme.id]
    : [];
  return {
    id: baseTheme.id,
    name: trimmedOverrideName
      ? legacyNames.includes(trimmedOverrideName)
        ? baseTheme.name
        : trimmedOverrideName
      : baseTheme.name,
    colors: storedColors,
    resolvedColors: normalizedColors,
    recordCard: normalizedRecordCard,
  };
}

function buildLegacyBuiltInThemeSnapshot(baseTheme) {
  const snapshot = LEGACY_BUILT_IN_THEME_OVERRIDE_SNAPSHOTS[baseTheme?.id];
  if (!snapshot) {
    return null;
  }
  return buildComparableBuiltInThemeOverride(baseTheme, snapshot);
}

function normalizeBuiltInThemeOverride(themeId, override = {}) {
  if (typeof resolveThemeRuntime()?.normalizeBuiltInThemeOverride === "function") {
    return resolveThemeRuntime().normalizeBuiltInThemeOverride(themeId, override);
  }
  const baseTheme = BUILT_IN_THEMES.find((item) => item.id === themeId);
  const comparableOverride = buildComparableBuiltInThemeOverride(baseTheme, override);
  if (!comparableOverride) {
    return null;
  }
  const baseRecordCard = resolveThemeRecordCard(
    baseTheme,
    resolveThemeColors(baseTheme),
  );
  const isEquivalentToBase =
    comparableOverride.name === baseTheme.name &&
    Object.keys(comparableOverride.colors).length === 0 &&
    areThemeRecordCardsEqual(comparableOverride.recordCard, baseRecordCard);
  if (isEquivalentToBase) {
    return null;
  }
  const legacySnapshot = buildLegacyBuiltInThemeSnapshot(baseTheme);
  if (
    legacySnapshot &&
    comparableOverride.name === legacySnapshot.name &&
    areThemeColorMapsEqual(
      comparableOverride.resolvedColors,
      legacySnapshot.resolvedColors,
    ) &&
    areThemeRecordCardsEqual(
      comparableOverride.recordCard,
      legacySnapshot.recordCard,
    )
  ) {
    return null;
  }
  return {
    id: comparableOverride.id,
    name: comparableOverride.name,
    colors: comparableOverride.colors,
    recordCard: comparableOverride.recordCard,
  };
}

function normalizeBuiltInThemeOverridesMap(rawOverrides = {}) {
  if (
    typeof resolveThemeRuntime()?.normalizeBuiltInThemeOverridesMap ===
    "function"
  ) {
    return resolveThemeRuntime().normalizeBuiltInThemeOverridesMap(rawOverrides);
  }
  return BUILT_IN_THEMES.reduce((accumulator, theme) => {
    const override = normalizeBuiltInThemeOverride(theme.id, rawOverrides?.[theme.id]);
    if (override) {
      accumulator[theme.id] = {
        name: override.name,
        colors: override.colors,
        recordCard: override.recordCard,
      };
    }
    return accumulator;
  }, {});
}

function loadBuiltInThemeOverrides() {
  try {
    const raw = getStoredThemeStateSnapshot()?.builtInThemeOverrides;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const normalizedOverrides = normalizeBuiltInThemeOverridesMap(raw);
    const normalizedSnapshot = JSON.stringify(normalizedOverrides);
    if (normalizedSnapshot !== JSON.stringify(raw)) {
      writeThemeStorageValue(
        BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
        normalizedSnapshot,
      );
      scheduleThemeStorageFlush({
        builtInThemeOverrides: normalizedOverrides,
      });
    }
    return normalizedOverrides;
  } catch (error) {
    console.error("加载内置主题覆盖失败:", error);
    return {};
  }
}

function saveBuiltInThemeOverrides(overrides) {
  const normalizedOverrides = normalizeBuiltInThemeOverridesMap(overrides);

  writeThemeStorageValue(
    BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
    JSON.stringify(normalizedOverrides),
  );
  scheduleThemeStorageFlush({
    builtInThemeOverrides: normalizedOverrides,
  });
  return normalizedOverrides;
}

function syncThemeCatalog() {
  const builtInOverrides = loadBuiltInThemeOverrides();
  themes = [
    ...BUILT_IN_THEMES.map(
      (theme) =>
        resolveBuiltInThemeDefinition(theme.id, builtInOverrides[theme.id]) || {
          ...theme,
          colors: resolveThemeColors(theme),
          recordCard: resolveThemeRecordCard(theme),
          isCustom: false,
          isBuiltIn: true,
          hasOverride: false,
        },
    ),
    ...loadCustomThemes().map((theme) => ({
      ...theme,
      colors: resolveThemeColors(theme),
      isBuiltIn: false,
      hasOverride: false,
    })),
  ];
  return themes;
}

function findThemeById(themeId) {
  return themes.find((theme) => theme.id === themeId) || null;
}

function buildThemeDraft(baseTheme = null) {
  const sourceTheme = resolveThemeDraftSource(baseTheme) || BUILT_IN_THEMES[0];
  const sourceColors = resolveThemeColors(sourceTheme);
  const explicitColors = isPlainObject(sourceTheme?.colors)
    ? { ...sourceTheme.colors }
    : {};
  const recordCard = resolveThemeRecordCard(sourceTheme, sourceColors);
  const draftColors = {};
  ALL_THEME_COLOR_FIELDS.forEach(({ key }) => {
    const explicitValue =
      typeof explicitColors[key] === "string" ? explicitColors[key].trim() : "";
    if (OPTIONAL_THEME_COLOR_FIELD_KEYS.has(key)) {
      draftColors[key] = explicitValue || "";
      return;
    }
    draftColors[key] = explicitValue || sourceColors[key] || DEFAULT_THEME_COLORS[key] || "#000000";
  });
  return {
    id: sourceTheme?.id || baseTheme?.id || "",
    name: sourceTheme?.name || baseTheme?.name || "",
    colors: draftColors,
    explicitColors,
    recordCard,
  };
}

function isLightTheme(themeId) {
  const theme = findThemeById(themeId);
  if (typeof resolveThemeRuntime()?.isLightTheme === "function") {
    return resolveThemeRuntime().isLightTheme(theme);
  }
  if (
    themeId === "ivory-light" ||
    themeId === "champagne-sandstone" ||
    themeId === "porcelain-mist" ||
    themeId === "sage-cashmere" ||
    themeId === "oyster-linen"
  ) {
    return true;
  }
  const rgb = parseHexColor(
    toHexColor(theme?.colors?.primary, DEFAULT_THEME_COLORS.primary),
  );
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.72;
}

const TABLE_SCALE_ITEMS = [
  {
    id: "indexProjectTable",
    label: "时间记录 · 项目表格",
    description: "一级/二级/三级项目表格，以及项目总览/记录卡片尺寸",
  },
  {
    id: "statsWeeklyGrid",
    label: "时间统计 · 时间表格",
    description: "统计页周/多日时间网格大小",
  },
  {
    id: "statsHeatmap",
    label: "时间统计 · 日历热图",
    description: "热图单元格与间距显示尺度",
  },
  {
    id: "planYearView",
    label: "时间计划 · 年视图",
    description: "年视图月份卡片与目标列表大小",
  },
  {
    id: "planMonthView",
    label: "时间计划 · 月视图",
    description: "月视图日期格与计划标签大小",
  },
  {
    id: "planWeeklyGrid",
    label: "时间计划 · 周视图",
    description: "周视图时间轴、列宽与事项块大小",
  },
  {
    id: "todoListView",
    label: "待办事项 · 列表视图",
    description: "待办列表卡片、记录与打卡列表尺寸",
  },
  {
    id: "todoQuadrantView",
    label: "待办事项 · 四象限视图",
    description: "四象限面板与事项卡片尺寸",
  },
];

function clampScale(value, min = 0.1, max = 2.2) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, min), max);
}

function getDefaultTableScaleSettings() {
  return {
    per: {},
  };
}

function normalizeTableScaleSettings(raw) {
  const legacyTodoScaleRaw = parseFloat(raw?.per?.todoLists);
  const legacyTodoScale = Number.isFinite(legacyTodoScaleRaw)
    ? clampScale(legacyTodoScaleRaw, 0.1, 2.2)
    : null;
  const legacyGlobalScaleRaw = parseFloat(raw?.global);
  const legacyGlobalScale = Number.isFinite(legacyGlobalScaleRaw)
    ? clampScale(legacyGlobalScaleRaw, 0.1, 2.2)
    : 1;
  const normalized = {
    per: {},
  };

  TABLE_SCALE_ITEMS.forEach((item) => {
    let nextScale = parseFloat(raw?.per?.[item.id]);
    if (
      !Number.isFinite(nextScale) &&
      legacyTodoScale !== null &&
      (item.id === "todoListView" || item.id === "todoQuadrantView")
    ) {
      nextScale = legacyTodoScale;
    }
    normalized.per[item.id] = Number.isFinite(nextScale)
      ? clampScale(nextScale * legacyGlobalScale, 0.1, 2.2)
      : 1;
  });

  return normalized;
}

function loadTableScaleSettings() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}",
    );
    return normalizeTableScaleSettings(raw);
  } catch (error) {
    console.error("加载表格尺寸设置失败:", error);
    return getDefaultTableScaleSettings();
  }
}

function saveTableScaleSettings(settings) {
  const normalized = normalizeTableScaleSettings(settings);
  try {
    localStorage.setItem(TABLE_SIZE_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error("保存表格尺寸设置失败:", error);
  }
  return normalized;
}

function notifyTableScaleSettingsChanged(settings) {
  try {
    localStorage.setItem(TABLE_SIZE_UPDATED_AT_KEY, String(Date.now()));
  } catch (error) {
    console.error("广播表格尺寸更新失败:", error);
  }

  window.dispatchEvent(
    new CustomEvent(TABLE_SIZE_EVENT_NAME, {
      detail: settings,
    }),
  );
}

function formatScaleText(scale) {
  const safe = clampScale(scale);
  return `${Math.round(safe * 100)}% (${safe.toFixed(2)}x)`;
}

function scheduleSettingsCollapsibleRefresh() {
  if (settingsCollapsibleRefreshFrame !== null) {
    window.cancelAnimationFrame(settingsCollapsibleRefreshFrame);
  }

  settingsCollapsibleRefreshFrame = window.requestAnimationFrame(() => {
    settingsCollapsibleRefreshFrame = null;
    settingsCollapsibleSections.forEach((section) => {
      syncSettingsCollapsibleSectionLayout(section);
    });
  });
}

function syncSettingsCollapsibleSectionLayout(section) {
  if (!section?.card || !section?.content || !section?.body || !section?.inner) {
    return;
  }
  section.card.style.display = "block";
  section.card.style.height = "";
  section.card.style.maxHeight = "";
  section.card.style.overflow = "";
  section.content.style.display = "flex";
  section.content.style.flexDirection = "column";
  section.content.style.alignItems = "stretch";
  section.content.style.width = "100%";
  section.body.hidden = !section.expanded;
  section.body.style.display = section.expanded ? "block" : "none";
  section.body.style.height = "";
  section.body.style.maxHeight = "";
  section.body.style.overflow = "";
  section.body.style.pointerEvents = "";
  section.body.style.opacity = "";
  section.inner.style.display = "block";
  section.inner.style.height = "";
  section.inner.style.maxHeight = "";
  section.inner.style.overflow = "";
}

function setSettingsCollapsibleExpanded(section, expanded, { immediate = false } = {}) {
  if (!section?.card || !section?.content || !section?.header || !section?.body || !section?.inner) {
    return;
  }

  section.expanded = !!expanded;
  section.card.classList.toggle("is-expanded", section.expanded);
  section.card.classList.toggle("is-collapsed", !section.expanded);
  section.header.setAttribute("aria-expanded", section.expanded ? "true" : "false");
  syncSettingsCollapsibleSectionLayout(section);
}

function initSettingsCollapsibleSections() {
  SETTINGS_COLLAPSIBLE_CARD_SELECTORS.forEach((selector) => {
    const card = document.querySelector(selector);
    if (!(card instanceof HTMLElement) || card.dataset.settingsCollapsibleReady === "true") {
      return;
    }

    const content = card.querySelector(".settings-card-content");
    const heading = content?.querySelector("h2, h3, h4");
    if (!(content instanceof HTMLElement) || !(heading instanceof HTMLElement)) {
      return;
    }

    const titleText = heading.textContent?.trim() || "设置";
    const body = document.createElement("div");
    body.className = "settings-collapsible-body";
    const inner = document.createElement("div");
    inner.className = "settings-collapsible-body-inner";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "settings-collapse-toggle";
    toggle.innerHTML = `
      <span class="settings-collapse-toggle-copy">
        <span class="settings-collapse-toggle-title">${titleText}</span>
        <span class="settings-collapse-toggle-hint">点击展开</span>
      </span>
      <span class="settings-collapse-toggle-icon" aria-hidden="true"></span>
    `;

    card.dataset.settingsCollapsibleReady = "true";
    card.classList.add("settings-card--collapsible");
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.alignItems = "stretch";
    content.style.width = "100%";
    body.style.display = "none";
    body.style.width = "100%";
    body.style.height = "0px";
    body.style.maxHeight = "0px";
    body.style.overflow = "hidden";
    inner.style.display = "block";
    inner.style.width = "100%";
    inner.style.height = "auto";
    inner.style.maxHeight = "none";
    inner.style.overflow = "visible";

    const nodesToMove = Array.from(content.childNodes).filter((node) => node !== heading);
    nodesToMove.forEach((node) => {
      inner.appendChild(node);
    });
    body.appendChild(inner);
    content.innerHTML = "";
    content.appendChild(toggle);
    content.appendChild(body);

    const section = {
      card,
      content,
      header: toggle,
      body,
      inner,
      expanded: false,
    };

    toggle.addEventListener("click", () => {
      setSettingsCollapsibleExpanded(section, !section.expanded);
      toggle.querySelector(".settings-collapse-toggle-hint").textContent = section.expanded
        ? "点击收起"
        : "点击展开";
      scheduleSettingsCollapsibleRefresh();
    });

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (section.expanded) {
          scheduleSettingsCollapsibleRefresh();
        }
      });
      observer.observe(inner);
      section.observer = observer;
    }

    settingsCollapsibleSections.push(section);
    setSettingsCollapsibleExpanded(section, false, { immediate: true });
    card.removeAttribute("data-settings-collapsible-pending");
  });
}

function renderTableSizeSettingsPanel() {
  const itemsContainer = document.getElementById("table-size-items");
  const resetButton = document.getElementById("table-size-reset");
  if (!itemsContainer) return;

  let settings = loadTableScaleSettings();
  settings = saveTableScaleSettings(settings);

  const persistScale = (mutateSettings) => {
    const latest = loadTableScaleSettings();
    mutateSettings(latest);
    settings = saveTableScaleSettings(latest);
    notifyTableScaleSettingsChanged(settings);
    return settings;
  };

  itemsContainer.innerHTML = "";
  TABLE_SCALE_ITEMS.forEach((item) => {
    const scale = clampScale(settings.per[item.id]);
    const card = document.createElement("div");
    card.className = "table-size-card";
    card.style.backgroundColor = "var(--bg-tertiary)";
    card.style.borderRadius = "10px";
    card.style.padding = "12px";
    card.innerHTML = `
      <div class="table-size-card-title" style="color: var(--text-color); font-size: 14px; font-weight: bold;">
        ${item.label}
      </div>
      <div class="table-size-card-description" style="color: var(--muted-text-color); font-size: 12px; margin: 4px 0 10px 0;">
        ${item.description}
      </div>
      <div class="table-size-slider-row" style="display: flex; align-items: center; gap: 8px; color: var(--text-color); font-size: 13px;">
        <span class="table-size-slider-label">尺寸</span>
        <input
          id="table-size-item-${item.id}"
          type="range"
          min="10"
          max="220"
          step="5"
          value="${Math.round(scale * 100)}"
          style="flex: 1"
        />
        <span class="table-size-item-value" id="table-size-item-value-${item.id}">${formatScaleText(scale)}</span>
      </div>
      <div class="table-size-effective-scale" style="color: var(--muted-text-color); font-size: 12px; margin-top: 8px;">
        已保存缩放: <span id="table-size-item-saved-${item.id}">${formatScaleText(scale)}</span>
      </div>
    `;
    itemsContainer.appendChild(card);

    const itemInput = card.querySelector(`#table-size-item-${item.id}`);
    const itemValue = card.querySelector(`#table-size-item-value-${item.id}`);
    const savedValue = card.querySelector(`#table-size-item-saved-${item.id}`);
    if (itemInput && itemValue && savedValue) {
      itemInput.addEventListener("input", () => {
        const nextScale = clampScale(
          (parseInt(itemInput.value, 10) || 100) / 100,
        );
        itemValue.textContent = formatScaleText(nextScale);
        savedValue.textContent = formatScaleText(nextScale);
        persistScale((latest) => {
          latest.per[item.id] = nextScale;
        });
      });
    }
  });

  if (resetButton) {
    resetButton.onclick = () => {
      settings = saveTableScaleSettings(getDefaultTableScaleSettings());
      notifyTableScaleSettingsChanged(settings);
      renderTableSizeSettingsPanel();
      void showSettingsAlert("表格与热图尺寸已重置为 100%。", {
        title: "重置完成",
      });
    };
  }

  scheduleSettingsCollapsibleRefresh();
}

let themeStorageFlushTimer = 0;
let pendingThemeCoreState = null;
let themeStorageFlushChain = Promise.resolve(false);
let themeStorageTransactionDepth = 0;
const SETTINGS_THEME_STORAGE_SECTIONS = new Set([
  "selectedTheme",
  "customThemes",
  "builtInThemeOverrides",
]);

function isThemeStorageTransactionActive() {
  return themeStorageTransactionDepth > 0;
}

async function runThemeStorageTransaction(task) {
  themeStorageTransactionDepth += 1;
  try {
    return await task();
  } finally {
    themeStorageTransactionDepth = Math.max(0, themeStorageTransactionDepth - 1);
    if (!isThemeStorageTransactionActive() && pendingThemeCoreState) {
      await flushThemeStorageNow();
    }
  }
}

function scheduleThemeStorageFlush(partialCore = null) {
  if (
    partialCore &&
    typeof partialCore === "object" &&
    !Array.isArray(partialCore)
  ) {
    pendingThemeCoreState = {
      ...(pendingThemeCoreState || {}),
      ...partialCore,
    };
  }
  const canReplaceCoreState =
    typeof window.ControlerStorage?.replaceCoreState === "function";
  const canPersistNow = typeof window.ControlerStorage?.persistNow === "function";
  if (!canReplaceCoreState && !canPersistNow) {
    return Promise.resolve(false);
  }
  if (isThemeStorageTransactionActive()) {
    return themeStorageFlushChain;
  }
  window.clearTimeout(themeStorageFlushTimer);
  themeStorageFlushTimer = window.setTimeout(() => {
    themeStorageFlushTimer = 0;
    void flushThemeStorageNow();
  }, 0);
  return themeStorageFlushChain;
}

function flushThemeStorageNow(partialCore = null) {
  if (
    partialCore &&
    typeof partialCore === "object" &&
    !Array.isArray(partialCore)
  ) {
    pendingThemeCoreState = {
      ...(pendingThemeCoreState || {}),
      ...partialCore,
    };
  }

  const canReplaceCoreState =
    typeof window.ControlerStorage?.replaceCoreState === "function";
  const canPersistNow = typeof window.ControlerStorage?.persistNow === "function";
  if (!canReplaceCoreState && !canPersistNow) {
    pendingThemeCoreState = null;
    return Promise.resolve(false);
  }
  if (isThemeStorageTransactionActive()) {
    return themeStorageFlushChain;
  }

  window.clearTimeout(themeStorageFlushTimer);
  themeStorageFlushTimer = 0;

  const nextCorePatch = pendingThemeCoreState;
  pendingThemeCoreState = null;

  const runFlush = async () => {
    if (nextCorePatch && canReplaceCoreState) {
      const changedSections = getSettingsNormalizedChangedSections(
        Object.keys(nextCorePatch),
      );
      if (changedSections.length) {
        window.ControlerStorage?.markRecentLocalEcho?.({
          changedSections,
          source: "settings-theme-write",
          originPageInstanceId: getSettingsStoragePageInstanceId(),
        });
      }
      try {
        await window.ControlerStorage.replaceCoreState(nextCorePatch);
      } catch (error) {
        console.error("同步主题核心状态失败:", error);
      }
    }

    if (canPersistNow) {
      try {
        await window.ControlerStorage.persistNow();
      } catch (error) {
        console.error("刷新主题存储写入失败:", error);
      }
    }

    return true;
  };

  themeStorageFlushChain = themeStorageFlushChain.then(runFlush, runFlush);
  return themeStorageFlushChain;
}

async function refreshThemeWidgets() {
  if (typeof window.ControlerWidgetBridge?.notifyDataChanged !== "function") {
    return false;
  }

  try {
    return !!(await window.ControlerWidgetBridge.notifyDataChanged());
  } catch (error) {
    console.error("刷新小组件显示失败:", error);
    return false;
  }
}

// 保存主题到localStorage
function saveTheme(themeId) {
  try {
    writeThemeStorageValue("selectedTheme", themeId);
    return flushThemeStorageNow({
      selectedTheme: themeId,
    });
  } catch (e) {
    console.error("保存主题失败:", e);
    return Promise.resolve(false);
  }
}

// 加载主题
function loadTheme(options = {}) {
  const shouldUpdateSelector = options?.updateSelector !== false;
  try {
    syncThemeCatalog();
    const storedThemeState = getStoredThemeStateSnapshot();
    const savedTheme = getStoredSelectedThemeId();
    if (savedTheme && findThemeById(savedTheme)) {
      applyTheme(savedTheme, {
        updateSelector: shouldUpdateSelector,
      });
      return savedTheme;
    }
    const resolvedThemeId =
      typeof storedThemeState?.themeId === "string" && storedThemeState.themeId.trim()
        ? storedThemeState.themeId.trim()
        : "";
    if (resolvedThemeId && findThemeById(resolvedThemeId)) {
      applyTheme(resolvedThemeId, {
        updateSelector: shouldUpdateSelector,
      });
      return resolvedThemeId;
    }
    applyTheme("obsidian-mono", {
      updateSelector: shouldUpdateSelector,
    });
    saveTheme("obsidian-mono");
    return "obsidian-mono";
  } catch (e) {
    console.error("加载主题失败:", e);
    applyTheme("obsidian-mono", {
      updateSelector: shouldUpdateSelector,
    });
    return "obsidian-mono";
  }
}

// 应用主题
function applyTheme(themeId, options = {}) {
  const theme = findThemeById(themeId) || themes[0] || BUILT_IN_THEMES[0];
  if (typeof resolveThemeRuntime()?.applyThemeState === "function") {
    resolveThemeRuntime().applyThemeState(theme.id, theme);
  }

  // 更新主题选择器UI
  if (options?.updateSelector !== false) {
    updateThemeSelector(theme.id);
  }
}

function resolveThemePreviewModel(theme) {
  const resolvedColors = resolveThemeColors(theme);
  const navTokens =
    typeof resolveThemeRuntime()?.resolveNavThemeTokens === "function"
      ? resolveThemeRuntime().resolveNavThemeTokens(resolvedColors)
      : {
          containerBg: resolvedColors.navBarBg,
          containerBorder: resolvedColors.navBarBorder || resolvedColors.panelBorder,
          itemBg: resolvedColors.navButtonBg,
          itemText: resolvedColors.navButtonText || resolvedColors.mutedText,
          itemBorder: resolvedColors.panelBorder,
          itemActiveBg: resolvedColors.navButtonActiveBg,
          itemActiveText: resolvedColors.navButtonActiveText,
          itemActiveBorder: resolvedColors.panelBorder,
        };
  const recordCardSurface =
    typeof resolveThemeRuntime()?.resolveRecordCardSurfaceStyles === "function"
      ? resolveThemeRuntime().resolveRecordCardSurfaceStyles({
          theme,
          resolvedColors,
        })
      : {
          background: `linear-gradient(180deg, ${resolvedColors.panelStrong} 0%, ${resolvedColors.panel} 100%)`,
          borderColor: resolvedColors.panelBorder,
          shadow: "none",
          titleColor: resolvedColors.accent,
        };

  return {
    resolvedColors,
    navTokens,
  };
}

let lastSettingsThemeSelectorSignature = null;

function buildSettingsThemeSelectorSignature(selectedThemeId = "obsidian-mono") {
  const storedThemeState = getStoredThemeStateSnapshot();
  const resolvedThemeId =
    typeof selectedThemeId === "string" && selectedThemeId.trim()
      ? selectedThemeId.trim()
      : "obsidian-mono";
  const customThemes = Array.isArray(storedThemeState?.customThemes)
    ? storedThemeState.customThemes
    : [];
  const builtInThemeOverrides =
    storedThemeState?.builtInThemeOverrides &&
    typeof storedThemeState.builtInThemeOverrides === "object" &&
    !Array.isArray(storedThemeState.builtInThemeOverrides)
      ? storedThemeState.builtInThemeOverrides
      : {};
  return JSON.stringify({
    selectedTheme: resolvedThemeId,
    customThemes,
    builtInThemeOverrides,
  });
}

function refreshThemeSelectorIfNeeded(selectedThemeId, options = {}) {
  const selector = document.getElementById("theme-selector");
  const resolvedThemeId =
    typeof selectedThemeId === "string" && selectedThemeId.trim()
      ? selectedThemeId.trim()
      : "obsidian-mono";
  const nextSignature = buildSettingsThemeSelectorSignature(resolvedThemeId);
  if (
    options?.force !== true &&
    selector &&
    selector.children.length > 0 &&
    nextSignature === lastSettingsThemeSelectorSignature
  ) {
    return false;
  }
  updateThemeSelector(resolvedThemeId, {
    themeSelectorSignature: nextSignature,
  });
  return true;
}

// 更新主题选择器UI
function updateThemeSelector(selectedThemeId, options = {}) {
  const selector = document.getElementById("theme-selector");
  if (!selector) return;

  const shouldReportBootstrapPerf = document.body?.classList.contains(
    "settings-bootstrap-pending",
  );
  const renderStartTime =
    shouldReportBootstrapPerf &&
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
      ? performance.now()
      : 0;
  lastSettingsThemeSelectorSignature =
    typeof options?.themeSelectorSignature === "string" &&
    options.themeSelectorSignature
      ? options.themeSelectorSignature
      : buildSettingsThemeSelectorSignature(selectedThemeId);
  syncThemeCatalog();
  const fragment = document.createDocumentFragment();

  themes.forEach((theme) => {
    const { resolvedColors, navTokens } = resolveThemePreviewModel(theme);
    const option = document.createElement("div");
    option.className = `theme-option ${theme.id === selectedThemeId ? "selected" : ""}`;
    const surfaceBtn = document.createElement("button");
    surfaceBtn.type = "button";
    surfaceBtn.className = "theme-option-surface";

    const preview = document.createElement("div");
    preview.className = "theme-preview";
    preview.style.background = resolvedColors.primary;
    preview.style.borderColor = `color-mix(in srgb, ${resolvedColors.panelBorder} 46%, transparent)`;

    const previewSurface = document.createElement("div");
    previewSurface.className = "theme-preview-surface";
    previewSurface.style.background = resolvedColors.panel;
    previewSurface.style.borderColor = `color-mix(in srgb, ${resolvedColors.panelBorder} 54%, transparent)`;

    const previewAccent = document.createElement("span");
    previewAccent.className = "theme-preview-accent";
    previewAccent.style.background = resolvedColors.accent;
    previewSurface.appendChild(previewAccent);

    const previewNav = document.createElement("div");
    previewNav.className = "theme-preview-nav";
    previewNav.style.background = navTokens.containerBg;
    previewNav.style.borderColor = navTokens.containerBorder;
    previewNav.style.boxShadow = "none";
    const previewNavButtonBg = "transparent";
    const previewNavButtonActiveBg = navTokens.itemActiveBg;

    preview.appendChild(previewSurface);

    for (let index = 0; index < 5; index += 1) {
      const navItem = document.createElement("span");
      const isActive = index === 2;
      navItem.className = `theme-preview-nav-item ${isActive ? "is-active" : ""}`;
      navItem.style.background = isActive
        ? previewNavButtonActiveBg
        : previewNavButtonBg;
      navItem.style.borderColor = isActive ? navTokens.itemActiveBorder : "transparent";
      navItem.style.color = isActive
        ? navTokens.itemActiveText
        : navTokens.itemText;
      previewNav.appendChild(navItem);
    }
    preview.appendChild(previewNav);
    surfaceBtn.appendChild(preview);

    const header = document.createElement("div");
    header.className = "theme-option-header";

    const name = document.createElement("div");
    name.className = "theme-option-name";
    name.textContent = theme.name;
    header.appendChild(name);

    const badge = document.createElement("span");
    badge.className = "theme-option-badge";
    badge.textContent = theme.isCustom
      ? "自定义"
      : theme.hasOverride
        ? "已修改"
        : "内置";
    header.appendChild(badge);

    surfaceBtn.appendChild(header);
    option.appendChild(surfaceBtn);

    const footer = document.createElement("div");
    footer.className = "theme-option-footer";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "theme-option-action";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", (event) => {
      emitThemeEditDebugEvent("theme-edit-button-click", {
        themeId: theme.id,
        themeName: theme.name,
        targetTag: event?.target?.tagName || "",
        currentTargetTag: event?.currentTarget?.tagName || "",
      });
      event.stopPropagation();
      showThemeEditorModal(theme);
    });
    footer.appendChild(editBtn);
    option.appendChild(footer);

    surfaceBtn.addEventListener("click", async () => {
      emitThemeEditDebugEvent("theme-option-click", {
        themeId: theme.id,
        themeName: theme.name,
      });
      applyTheme(theme.id);
      await saveTheme(theme.id);
      await refreshThemeWidgets();
    });

    fragment.appendChild(option);
  });

  selector.replaceChildren(fragment);
  scheduleSettingsCollapsibleRefresh();
  if (renderStartTime) {
    const durationMs =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? Math.max(0, Math.round(performance.now() - renderStartTime))
        : 0;
    window.ControlerUI?.markPerfStage?.("settings-theme-selector-ready", {
      themeCount: themes.length,
      durationMs,
      selectedThemeId: String(selectedThemeId || "").trim() || "obsidian-mono",
    });
  }
}

function ensureThemeSelectorVisible(selectedThemeId) {
  const selector = document.getElementById("theme-selector");
  if (!selector) return;
  if (selector.children.length === 0) {
    refreshThemeSelectorIfNeeded(selectedThemeId, {
      force: true,
    });
  }
}

function upsertCustomTheme(themeDraft) {
  const existingThemes = loadCustomThemes();
  const isEditing = Boolean(themeDraft.id);
  const normalizedDraft = normalizeThemeObject(
    {
      ...themeDraft,
      id: isEditing
        ? themeDraft.id
        : `custom-${sanitizeThemeId(themeDraft.name)}`,
    },
    existingThemes.length,
  );

  const nextThemes = existingThemes.filter(
    (theme) => theme.id !== normalizedDraft.id,
  );
  nextThemes.push(normalizedDraft);
  saveCustomThemes(nextThemes);
  syncThemeCatalog();
  return normalizedDraft;
}

function upsertBuiltInThemeOverride(themeDraft) {
  const baseTheme = BUILT_IN_THEMES.find((theme) => theme.id === themeDraft.id);
  if (!baseTheme) {
    return null;
  }

  const overrides = loadBuiltInThemeOverrides();
  const normalizedOverride = normalizeBuiltInThemeOverride(
    themeDraft.id,
    themeDraft,
  );
  if (!normalizedOverride) {
    delete overrides[themeDraft.id];
    saveBuiltInThemeOverrides(overrides);
    syncThemeCatalog();
    return findThemeById(themeDraft.id) || resolveBuiltInThemeDefinition(themeDraft.id);
  }

  overrides[themeDraft.id] = {
    name: normalizedOverride.name,
    colors: normalizedOverride.colors,
    recordCard: normalizedOverride.recordCard,
  };
  saveBuiltInThemeOverrides(overrides);
  syncThemeCatalog();
  return (
    findThemeById(themeDraft.id) ||
    resolveBuiltInThemeDefinition(themeDraft.id, overrides[themeDraft.id])
  );
}

function upsertThemeDraft(themeDraft) {
  if (BUILT_IN_THEMES.some((theme) => theme.id === themeDraft.id)) {
    return upsertBuiltInThemeOverride(themeDraft);
  }
  return upsertCustomTheme(themeDraft);
}

async function deleteCustomTheme(themeId) {
  return runThemeStorageTransaction(async () => {
    const nextThemes = loadCustomThemes().filter((theme) => theme.id !== themeId);
    saveCustomThemes(nextThemes);
    syncThemeCatalog();

    const selectedThemeId = getStoredSelectedThemeId();
    if (selectedThemeId === themeId) {
      applyTheme("obsidian-mono");
      await saveTheme("obsidian-mono");
      await refreshThemeWidgets();
      return true;
    }
    updateThemeSelector(selectedThemeId || "obsidian-mono");
    return true;
  });
}

async function resetBuiltInThemeOverride(themeId) {
  return runThemeStorageTransaction(async () => {
    const overrides = loadBuiltInThemeOverrides();
    delete overrides[themeId];
    saveBuiltInThemeOverrides(overrides);
    syncThemeCatalog();

    const selectedThemeId = getStoredSelectedThemeId();
    if (selectedThemeId === themeId) {
      applyTheme(themeId);
      await saveTheme(themeId);
      await refreshThemeWidgets();
      return true;
    }
    updateThemeSelector(selectedThemeId || "obsidian-mono");
    return true;
  });
}

function prepareSettingsModalOverlayElement(modal, options = {}) {
  if (!(modal instanceof HTMLElement)) {
    return null;
  }
  const nextOptions = { ...options };
  const body = document.body;
  if (
    !nextOptions.scope &&
    body instanceof HTMLElement &&
    (body.classList.contains("controler-mobile-runtime") ||
      body.classList.contains("controler-android-native"))
  ) {
    nextOptions.scope = "viewport";
  }
  const currentZIndex = Number.parseInt(modal.style.zIndex || "", 10);
  if (
    !Number.isFinite(nextOptions.zIndex) &&
    Number.isFinite(currentZIndex) &&
    currentZIndex > 0
  ) {
    nextOptions.zIndex = currentZIndex;
  }
  if (typeof uiTools?.prepareModalOverlay === "function") {
    const preparedModal = uiTools.prepareModalOverlay(modal, nextOptions);
    emitThemeEditDebugEvent("prepare-settings-modal-overlay", {
      scope:
        String(preparedModal?.dataset?.controlerOverlayScope || "").trim() ||
        String(nextOptions.scope || "").trim() ||
        "viewport",
      isConnected: preparedModal?.isConnected === true,
      parentTag: preparedModal?.parentElement?.tagName || "",
      modalClass: preparedModal?.className || "",
    });
    return preparedModal;
  }
  if (nextOptions.append !== false && !modal.isConnected && document.body) {
    document.body.appendChild(modal);
  }
  if (nextOptions.visible === false) {
    modal.style.display = "none";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  } else if (nextOptions.visible === true) {
    modal.style.display = "flex";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }
  uiTools?.stopModalContentPropagation?.(modal);
  emitThemeEditDebugEvent("prepare-settings-modal-overlay-fallback", {
    scope: String(nextOptions.scope || "").trim() || "viewport",
    isConnected: modal.isConnected === true,
    parentTag: modal.parentElement?.tagName || "",
    modalClass: modal.className || "",
  });
  return modal;
}

function buildThemeFieldInputRowHtml(field, draftColors = {}, widgetFallbacks = {}) {
  if (!field?.key) {
    return "";
  }
  const key = field.key;
  const fieldValue = String(draftColors[key] || "").trim();
  const fallbackValue = OPTIONAL_THEME_COLOR_FIELD_KEYS.has(key)
    ? firstNonEmpty(widgetFallbacks[key], DEFAULT_THEME_COLORS.buttonBg, "#000000")
    : firstNonEmpty(fieldValue, DEFAULT_THEME_COLORS[key], "#000000");
  const placeholder =
    field.placeholder || "#79AF85 或 rgba(121, 175, 133, 0.42)";
  return `
    <label class="theme-editor-row" data-theme-field="${escapeHtml(key)}">
      <span class="theme-editor-row-label">${escapeHtml(field.label || key)}</span>
      <input type="color" data-theme-color="${escapeHtml(key)}" value="${toHexColor(fieldValue || fallbackValue, "#000000")}" />
      <input
        type="text"
        class="time-input theme-editor-row-input"
        data-theme-color-text="${escapeHtml(key)}"
        value="${escapeHtml(fieldValue)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
        spellcheck="false"
      />
      ${
        OPTIONAL_THEME_COLOR_FIELD_KEYS.has(key)
          ? `
            <div class="theme-editor-row-meta">
              <span data-widget-theme-default-label="${escapeHtml(key)}" class="theme-editor-row-meta-text">默认：${escapeHtml(fallbackValue)}</span>
              <button
                type="button"
                class="bts theme-editor-row-meta-action"
                data-widget-theme-reset="${escapeHtml(key)}"
              >恢复默认</button>
            </div>
          `
          : ""
      }
      ${
        field.description
          ? `<div class="theme-editor-row-description">${escapeHtml(field.description)}</div>`
          : ""
      }
    </label>
  `;
}

function buildThemeRecordCardSectionHtml(
  section,
  initialRecordCardMode,
  initialRecordCardColor,
) {
  return `
    <section class="theme-editor-section theme-editor-section--record-card" data-theme-section="${escapeHtml(section?.id || THEME_RECORD_CARD_SECTION_ID)}">
      <div class="theme-editor-section-header">
        <div class="theme-editor-section-title">${escapeHtml(section?.title || "记录卡片")}</div>
        ${
          section?.description
            ? `<div class="theme-editor-section-description">${escapeHtml(section.description)}</div>`
            : ""
        }
      </div>
      <div class="theme-editor-record-card-mode-grid">
        <button
          type="button"
          class="bts theme-record-card-mode-btn"
          data-record-card-mode="project"
          style="margin:0; text-align:left; padding:14px; border-radius:14px;"
        >
          <div style="font-size:14px; font-weight:700;">跟随项目颜色</div>
          <div style="margin-top:6px; font-size:12px; color: var(--button-muted-text, color-mix(in srgb, var(--button-text) 72%, var(--button-bg)));">保留当前效果，每张记录卡片按所属项目当前颜色显示不同颜色。</div>
        </button>
        <button
          type="button"
          class="bts theme-record-card-mode-btn"
          data-record-card-mode="theme"
          style="margin:0; text-align:left; padding:14px; border-radius:14px;"
        >
          <div style="font-size:14px; font-weight:700;">统一主题卡片色</div>
          <div style="margin-top:6px; font-size:12px; color: var(--button-muted-text, color-mix(in srgb, var(--button-text) 72%, var(--button-bg)));">使用更实心、轻微透明的统一卡片外观，和跟随项目色的卡片样式分开。</div>
        </button>
      </div>
      <label
        id="theme-record-card-color-row"
        class="theme-editor-record-card-color-row"
        style="${initialRecordCardMode === "theme" ? "" : "display:none;"}"
      >
        <span class="theme-editor-row-label">统一记录卡片颜色</span>
        <div class="theme-editor-record-card-color-inputs">
          <input type="color" data-record-card-color value="${toHexColor(initialRecordCardColor, DEFAULT_THEME_RECORD_CARD.color)}" />
          <input
            type="text"
            class="time-input"
            data-record-card-color-text
            value="${escapeHtml(initialRecordCardColor)}"
            placeholder="#79AF85 或 rgba(121, 175, 133, 0.42)"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="theme-editor-row-description">只影响“统一主题卡片色”模式的卡片主色，切回项目色模式时会保留这个值。</div>
      </label>
    </section>
  `;
}

function buildThemeEditorSectionHtml(section, context = {}) {
  if (!section || typeof section !== "object") {
    return "";
  }
  if (section.kind === "record-card") {
    return buildThemeRecordCardSectionHtml(
      section,
      context.initialRecordCardMode,
      context.initialRecordCardColor,
    );
  }
  const rowsHtml = (Array.isArray(section.fields) ? section.fields : [])
    .map((field) =>
      buildThemeFieldInputRowHtml(
        field,
        context.draftColors,
        context.widgetFallbacks,
      ),
    )
    .join("");
  if (!rowsHtml) {
    return "";
  }
  return `
    <section class="theme-editor-section" data-theme-section="${escapeHtml(section.id || "")}">
      <div class="theme-editor-section-header">
        <div class="theme-editor-section-title">${escapeHtml(section.title || "主题颜色")}</div>
        ${
          section.description
            ? `<div class="theme-editor-section-description">${escapeHtml(section.description)}</div>`
            : ""
        }
      </div>
      <div class="theme-editor-section-grid">${rowsHtml}</div>
    </section>
  `;
}

function buildThemeEditorGroupHtml(groupKey, groupTitle, context = {}) {
  const sectionsHtml = THEME_FIELD_SECTIONS.filter(
    (section) => section?.group === groupKey,
  )
    .map((section) => buildThemeEditorSectionHtml(section, context))
    .join("");
  if (!sectionsHtml) {
    return "";
  }
  return `
    <section class="theme-editor-group" data-theme-group="${escapeHtml(groupKey)}">
      <div class="theme-editor-group-heading">${escapeHtml(groupTitle)}</div>
      <div class="theme-editor-sections">${sectionsHtml}</div>
    </section>
  `;
}

function showThemeEditorModal(theme = null) {
  emitThemeEditDebugEvent("show-theme-editor-modal-enter", {
    themeId: String(theme?.id || "").trim(),
    themeName: String(theme?.name || "").trim(),
    isCustom: theme?.isCustom === true,
    isBuiltIn: theme?.isBuiltIn === true,
  });
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = "4200";
  const isAndroidNativeThemeEditor =
    document.body?.classList.contains("controler-android-native") === true;
  if (isAndroidNativeThemeEditor) {
    // The Android modal autofocus assist is helpful for small forms, but this
    // theme editor has a tall scrollable body with many inputs. Letting the
    // user tap the name field explicitly avoids the IME double-pop on open.
    modal.dataset.controlerDisableAutofocus = "true";
  }

  const draft = buildThemeDraft(theme);
  const explicitDraftColors = isPlainObject(draft?.explicitColors)
    ? { ...draft.explicitColors }
    : {};
  const isEditingCustomTheme = Boolean(theme?.isCustom);
  const isBuiltInTheme = Boolean(theme?.isBuiltIn);
  const canResetBuiltIn = Boolean(isBuiltInTheme && theme?.hasOverride);
  const dialogTitle = isEditingCustomTheme
    ? "编辑自定义主题"
    : theme
      ? "编辑主题"
      : "添加自定义主题";
  const initialRecordCardMode = normalizeThemeRecordCardMode(
    draft.recordCard?.mode,
  );
  const initialRecordCardColor =
    draft.recordCard?.color || DEFAULT_THEME_RECORD_CARD.color;
  const initialWidgetFallbacks = resolveThemeEditorWidgetColorFallbacks(draft.colors);
  const themeEditorContext = {
    draftColors: draft.colors,
    widgetFallbacks: initialWidgetFallbacks,
    initialRecordCardMode,
    initialRecordCardColor,
  };
  const themeColorAnchorScope =
    typeof theme?.id === "string" && theme.id.trim() ? theme.id.trim() : "draft";
  const baseGroupHtml = buildThemeEditorGroupHtml(
    "base",
    "基础颜色",
    themeEditorContext,
  );
  const advancedGroupHtml = buildThemeEditorGroupHtml(
    "advanced",
    "高级颜色",
    themeEditorContext,
  );

  modal.innerHTML = `
    <div class="modal-content themed-dialog-card ms controler-form-modal settings-theme-editor-modal" style="width:min(920px, 100%); max-width:min(920px, 100%); max-height:min(var(--controler-modal-overlay-available-height, calc(var(--controler-modal-overlay-height) - 32px)), 860px); padding:20px;">
      <div class="controler-form-modal-body" style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>
            <div class="themed-dialog-title">${dialogTitle}</div>
          </div>
        </div>
        <label style="display:flex; flex-direction:column; gap:8px;">
          <span style="color: var(--text-color); font-size: 13px; font-weight: 600;">主题名称</span>
          <input id="custom-theme-name" type="text" class="time-input" value="${escapeHtml(draft.name)}" placeholder="例如：冰川蓝" />
        </label>
        ${baseGroupHtml}
        ${advancedGroupHtml}
      </div>
      <div class="controler-form-modal-footer settings-theme-editor-modal-footer" style="display:flex; align-items:center; gap:12px; margin-top:0;">
        <div class="controler-form-modal-footer-actions settings-theme-editor-modal-footer-actions" style="display:flex; gap:10px; width:100%;">
          ${
            isEditingCustomTheme
              ? '<button type="button" class="bts themed-dialog-confirm-btn is-danger" id="delete-custom-theme-btn" style="margin:0;">删除</button>'
              : canResetBuiltIn
                ? '<button type="button" class="bts themed-dialog-confirm-btn is-danger" id="reset-built-in-theme-btn" style="margin:0;">恢复默认</button>'
                : ""
          }
          <button type="button" class="bts" id="cancel-custom-theme-btn" style="margin:0;">取消</button>
          <button type="button" class="bts" id="save-custom-theme-btn" style="margin:0;">保存</button>
        </div>
      </div>
    </div>
  `;
  if (isAndroidNativeThemeEditor) {
    modal
      .querySelector(".settings-theme-editor-modal")
      ?.classList.add("settings-theme-editor-modal-entering");
  }

  const closeModal = () => {
    if (typeof window.ControlerUI?.closeModal === "function") {
      window.ControlerUI.closeModal(modal);
      return;
    }
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };

  const syncTextWithPicker = (key, value) => {
    const textInput = modal.querySelector(`[data-theme-color-text="${key}"]`);
    if (textInput) {
      textInput.value = value;
    }
  };

  const syncPickerWithText = (key, value) => {
    const pickerInput = modal.querySelector(`[data-theme-color="${key}"]`);
    const displayColor = toHexColor(value, "");
    if (pickerInput && displayColor) {
      setThemeColorPickerDisplayValue(
        pickerInput,
        displayColor,
        pickerInput.value || "#000000",
      );
    }
  };

  const dirtyThemeColorFieldKeys = new Set();

  const collectDraftThemeColors = () => {
    const nextColors = {
      ...draft.colors,
    };
    ALL_THEME_COLOR_FIELDS.forEach(({ key }) => {
      const textInput = modal.querySelector(`[data-theme-color-text="${key}"]`);
      if (textInput) {
        nextColors[key] = normalizeThemeColorInputValue(textInput.value);
      }
    });
    return nextColors;
  };

  const updateWidgetThemeFallbackUi = () => {
    const currentColors = collectDraftThemeColors();
    THEME_WIDGET_COLOR_FIELDS.forEach(({ key }) => {
      const fallbackColors = resolveThemeEditorWidgetColorFallbacks({
        ...currentColors,
        [key]: "",
      });
      const fallbackValue = firstNonEmpty(
        fallbackColors[key],
        DEFAULT_THEME_COLORS.buttonBg,
      );
      const defaultLabel = modal.querySelector(
        `[data-widget-theme-default-label="${key}"]`,
      );
      if (defaultLabel) {
        defaultLabel.textContent = `默认：${fallbackValue}`;
      }
      const textInput = modal.querySelector(`[data-theme-color-text="${key}"]`);
      const pickerInput = modal.querySelector(`[data-theme-color="${key}"]`);
      if (textInput && pickerInput && !textInput.value.trim()) {
        setThemeColorPickerDisplayValue(
          pickerInput,
          fallbackValue,
          pickerInput.value || "#000000",
        );
      }
    });
  };

  const syncRecordCardTextWithPicker = (value) => {
    const textInput = modal.querySelector("[data-record-card-color-text]");
    if (textInput) {
      textInput.value = value;
    }
  };

  const syncRecordCardPickerWithText = (value) => {
    const pickerInput = modal.querySelector("[data-record-card-color]");
    const displayColor = toHexColor(value, "");
    if (pickerInput && displayColor) {
      setThemeColorPickerDisplayValue(
        pickerInput,
        displayColor,
        pickerInput.value || DEFAULT_THEME_RECORD_CARD.color,
      );
    }
  };

  let recordCardMode = initialRecordCardMode;
  const updateRecordCardModeUi = () => {
    const colorRow = modal.querySelector("#theme-record-card-color-row");
    if (colorRow instanceof HTMLElement) {
      colorRow.style.display = recordCardMode === "theme" ? "flex" : "none";
    }
    modal.querySelectorAll("[data-record-card-mode]").forEach((button) => {
      const isActive = button.dataset.recordCardMode === recordCardMode;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.style.background = isActive
        ? "var(--button-bg)"
        : "color-mix(in srgb, var(--panel-strong-bg) 88%, transparent)";
      button.style.color = isActive ? "var(--button-text)" : "var(--text-color)";
      button.style.border = isActive
        ? "1px solid var(--button-border)"
        : "1px solid var(--panel-border-color)";
      button.style.boxShadow = isActive
        ? "0 10px 24px color-mix(in srgb, var(--button-bg) 26%, transparent)"
        : "none";
      button.style.transform = isActive ? "translateY(-1px)" : "translateY(0)";
    });
  };

  modal.querySelectorAll("[data-theme-color]").forEach((input) => {
    const fieldKey = String(input.dataset.themeColor || "").trim();
    bindRememberedThemeColorPicker(input, {
      anchorKey: `theme-editor:${themeColorAnchorScope}:${fieldKey}`,
      resolveOpenColor: () => {
        const textInput = modal.querySelector(`[data-theme-color-text="${fieldKey}"]`);
        return normalizeThemeColorInputValue(textInput?.value || "");
      },
      resolveDisplayColor: () => {
        const textInput = modal.querySelector(
          `[data-theme-color-text="${fieldKey}"]`,
        );
        return toHexColor(
          normalizeThemeColorInputValue(textInput?.value || ""),
          input.dataset.colorPickerDisplayValue || input.value || "#000000",
        );
      },
    });
    input.addEventListener("input", () => {
      dirtyThemeColorFieldKeys.add(String(input.dataset.themeColor || "").trim());
      syncTextWithPicker(input.dataset.themeColor, input.value);
      updateWidgetThemeFallbackUi();
    });
  });

  modal.querySelectorAll("[data-theme-color-text]").forEach((input) => {
    input.addEventListener("input", () => {
      dirtyThemeColorFieldKeys.add(
        String(input.dataset.themeColorText || "").trim(),
      );
      syncPickerWithText(
        input.dataset.themeColorText,
        normalizeThemeColorInputValue(input.value),
      );
      updateWidgetThemeFallbackUi();
    });
  });

  modal.querySelectorAll("[data-widget-theme-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.widgetThemeReset;
      const textInput = modal.querySelector(`[data-theme-color-text="${key}"]`);
      if (textInput) {
        textInput.value = "";
      }
      updateWidgetThemeFallbackUi();
    });
  });

  modal.querySelectorAll("[data-record-card-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      recordCardMode = normalizeThemeRecordCardMode(button.dataset.recordCardMode);
      updateRecordCardModeUi();
    });
  });

  const recordCardColorInput = modal.querySelector("[data-record-card-color]");
  if (recordCardColorInput instanceof HTMLInputElement) {
    bindRememberedThemeColorPicker(recordCardColorInput, {
      anchorKey: `theme-editor:${themeColorAnchorScope}:record-card-color`,
      resolveOpenColor: () =>
        normalizeThemeColorInputValue(
          modal.querySelector("[data-record-card-color-text]")?.value || "",
        ),
      resolveDisplayColor: () => {
        const textValue = normalizeThemeColorInputValue(
          modal.querySelector("[data-record-card-color-text]")?.value || "",
        );
        return toHexColor(
          textValue,
          recordCardColorInput.dataset.colorPickerDisplayValue ||
            recordCardColorInput.value ||
            DEFAULT_THEME_RECORD_CARD.color,
        );
      },
    });
    recordCardColorInput.addEventListener("input", (event) => {
      syncRecordCardTextWithPicker(event.currentTarget.value);
    });
  }
  modal
    .querySelector("[data-record-card-color-text]")
    ?.addEventListener("input", (event) => {
      syncRecordCardPickerWithText(
        normalizeThemeColorInputValue(event.currentTarget.value),
      );
    });

  updateRecordCardModeUi();
  updateWidgetThemeFallbackUi();

  modal
    .querySelector("#cancel-custom-theme-btn")
    ?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  modal
    .querySelector("#save-custom-theme-btn")
    ?.addEventListener("click", async () => {
      const nameInput = modal.querySelector("#custom-theme-name");
      const name = nameInput?.value?.trim();
      if (!name) {
        await showSettingsAlert("请输入主题名称。", {
          title: "主题名称不能为空",
          danger: true,
        });
        return;
      }

      const nextDraft = {
        id: theme?.id || "",
        name,
        colors: {},
        recordCard: {
          mode: recordCardMode,
          color:
            normalizeThemeColorInputValue(
              modal.querySelector("[data-record-card-color-text]")?.value || "",
            ) || DEFAULT_THEME_RECORD_CARD.color,
        },
      };

      let hasInvalidColor = false;
      ALL_THEME_COLOR_FIELDS.forEach(({ key }) => {
        const textInput = modal.querySelector(
          `[data-theme-color-text="${key}"]`,
        );
        const colorValue = normalizeThemeColorInputValue(textInput?.value || "");
        if (
          (OPTIONAL_THEME_COLOR_FIELD_KEYS.has(key) && colorValue && !isValidThemeColorValue(colorValue)) ||
          (!OPTIONAL_THEME_COLOR_FIELD_KEYS.has(key) && !isValidThemeColorValue(colorValue))
        ) {
          hasInvalidColor = true;
        }
        nextDraft.colors[key] = colorValue;
      });
      const autoDerivedBaseColors = { ...nextDraft.colors };
      AUTO_DERIVED_THEME_COLOR_FIELD_KEYS.forEach((key) => {
        if (!dirtyThemeColorFieldKeys.has(key)) {
          delete autoDerivedBaseColors[key];
        }
      });
      const autoDerivedResolvedColors = resolveThemeColors({
        ...nextDraft,
        colors: autoDerivedBaseColors,
      });
      AUTO_DERIVED_THEME_COLOR_FIELD_KEYS.forEach((key) => {
        if (dirtyThemeColorFieldKeys.has(key)) {
          return;
        }
        const explicitValue = isValidThemeColorValue(explicitDraftColors[key])
          ? explicitDraftColors[key].trim()
          : "";
        nextDraft.colors[key] = explicitValue || autoDerivedResolvedColors[key] || "";
      });
      if (!isValidThemeColorValue(nextDraft.recordCard.color)) {
        hasInvalidColor = true;
      }

      if (hasInvalidColor) {
        await showSettingsAlert(
          "请为主题颜色和记录卡片颜色填写合法颜色值；小组件配件颜色可以留空，若填写则也需要是合法颜色，例如 #79AF85 或 rgba(121, 175, 133, 0.42)。",
          {
            title: "颜色格式无效",
            danger: true,
          },
        );
        return;
      }

      const savedTheme = await runThemeStorageTransaction(async () => {
        const nextSavedTheme = upsertThemeDraft(nextDraft);
        if (!nextSavedTheme) {
          return null;
        }
        applyTheme(nextSavedTheme.id);
        await saveTheme(nextSavedTheme.id);
        return nextSavedTheme;
      });
      if (!savedTheme) {
        await showSettingsAlert("主题保存失败，请稍后重试。", {
          title: "保存失败",
          danger: true,
        });
        return;
      }
      await refreshThemeWidgets();
      closeModal();
    });

  modal
    .querySelector("#delete-custom-theme-btn")
    ?.addEventListener("click", async () => {
      const confirmed = await requestSettingsConfirmation(
        `确定删除主题“${theme?.name || ""}”吗？`,
        {
          title: "删除自定义主题",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) return;

      try {
        await deleteCustomTheme(theme.id);
        closeModal();
      } catch (error) {
        console.error("删除自定义主题失败:", error);
        await showSettingsAlert("删除主题失败，请稍后重试。", {
          title: "删除失败",
          danger: true,
        });
      }
    });

  modal
    .querySelector("#reset-built-in-theme-btn")
    ?.addEventListener("click", async () => {
      const confirmed = await requestSettingsConfirmation(
        `确定将“${theme?.name || ""}”恢复为默认配色吗？`,
        {
          title: "恢复默认主题",
          confirmText: "恢复默认",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) return;

      closeModal();
      try {
        await resetBuiltInThemeOverride(theme.id);
      } catch (error) {
        console.error("恢复默认主题失败:", error);
        await showSettingsAlert("恢复默认失败，请稍后重试。", {
          title: "恢复失败",
          danger: true,
        });
      }
    });

  prepareSettingsModalOverlayElement(modal);
  emitThemeEditDebugEvent("show-theme-editor-modal-mounted", {
    themeId: String(theme?.id || "").trim(),
    isConnected: modal.isConnected === true,
    scope: String(modal.dataset?.controlerOverlayScope || "").trim(),
    parentTag: modal.parentElement?.tagName || "",
  });
  if (isAndroidNativeThemeEditor) {
    const nameInput = modal.querySelector("#custom-theme-name");
    const themeEditorSurface = modal.querySelector(".settings-theme-editor-modal");
    const releaseEnteringState = () => {
      themeEditorSurface?.classList.remove("settings-theme-editor-modal-entering");
    };
    const blurTransientNameFocus = () => {
      if (
        nameInput instanceof HTMLElement &&
        document.activeElement === nameInput
      ) {
        try {
          nameInput.blur();
        } catch (error) {}
      }
    };
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    blurTransientNameFocus();
    schedule(() => {
      blurTransientNameFocus();
      window.setTimeout(blurTransientNameFocus, 72);
      window.setTimeout(releaseEnteringState, 220);
    });
  }
}

// 计算存储使用情况
function updateStorageStatus() {
  const statusElement = document.getElementById("storage-status");
  if (!statusElement) return;
  window.clearTimeout(settingsStorageStatusRetryTimer);
  settingsStorageStatusRetryTimer = 0;

  const controlerStorage = window.ControlerStorage;
  if (typeof controlerStorage?.getStorageStatus === "function") {
    controlerStorage
      .getStorageStatus()
      .then((status) => {
        if (!status) {
          throw new Error("empty status");
        }

        const sizeKb = Number(status.size || 0) / 1024;
        const sizeLabel =
          status?.sizePending === true
            ? `${sizeKb.toFixed(2)} KB（正在刷新精确体积）`
            : `${sizeKb.toFixed(2)} KB`;
        const recoverySummary =
          status?.recoverySummary &&
          typeof status.recoverySummary === "object" &&
          !Array.isArray(status.recoverySummary)
            ? status.recoverySummary
            : null;
        const recoveryLines = [];
        if (status?.recoveryState && status.recoveryState !== "ok") {
          recoveryLines.push(
            `<p>恢复状态: ${status.recoveryState === "needs-recovery" ? "需要人工恢复" : "已自动修复"}</p>`,
          );
        }
        if (
          recoverySummary &&
          Number.isFinite(recoverySummary.totalInvalidCount) &&
          recoverySummary.totalInvalidCount > 0
        ) {
          recoveryLines.push(
            `<p>恢复摘要: ${recoverySummary.totalInvalidCount} 项异常，${Math.max(0, Number(recoverySummary.hardInvalidCount || 0))} 项高风险</p>`,
          );
          if (
            typeof recoverySummary.lastCapturedAt === "string" &&
            recoverySummary.lastCapturedAt
          ) {
            const detectedAt = new Date(recoverySummary.lastCapturedAt);
            if (!Number.isNaN(detectedAt.getTime())) {
              recoveryLines.push(
                `<p>最近检测: ${detectedAt.toLocaleString()}</p>`,
              );
            }
          }
        }
        if (typeof status?.persistError === "string" && status.persistError.trim()) {
          recoveryLines.push(
            `<p>最近写入错误: ${status.persistError.trim()}${status?.persistErrorCode ? ` (${status.persistErrorCode})` : ""}</p>`,
          );
        }
        statusElement.innerHTML = `
          <p>存储模式: ${status.storageMode || status.bundleMode || "directory-bundle"}</p>
          <p>存储使用: ${sizeLabel}</p>
          <p>记录数量: ${status.records || 0} 条</p>
          <p>项目数量: ${status.projects || 0} 个</p>
          ${recoveryLines.join("")}
        `;
        void updateBundleStoragePanels(status);
        void refreshAutoBackupPanel();
        updateDataManagementGuideHint();
        if (status?.sizePending === true) {
          settingsStorageStatusRetryTimer = window.setTimeout(() => {
            updateStorageStatus();
          }, 1200);
        }
      })
      .catch(() => {
        renderLocalStorageStatusFallback(statusElement);
      });
    return;
  }

  renderLocalStorageStatusFallback(statusElement);
}

function renderLocalStorageStatusFallback(statusElement) {
  try {
    let totalBytes = 0;

    // 计算所有localStorage项目的大小
    getStorageEntries().forEach(([key, value]) => {
      totalBytes += key.length + value.length;
    });

    const kb = totalBytes / 1024;
    const records = localStorage.getItem("records")
      ? JSON.parse(localStorage.getItem("records")).length
      : 0;
    const projects = localStorage.getItem("projects")
      ? JSON.parse(localStorage.getItem("projects")).length
      : 0;

    statusElement.innerHTML = `
      <p>存储模式: directory-bundle</p>
      <p>存储使用: ${kb.toFixed(2)} KB</p>
      <p>记录数量: ${records} 条</p>
      <p>项目数量: ${projects} 个</p>
    `;
    void updateBundleStoragePanels({
      storageMode: "directory-bundle",
      storagePath: "browser://localStorage/bundle-manifest.json",
      storageDirectory: "browser://localStorage",
      syncFileName: "bundle-manifest.json",
    });
    void refreshAutoBackupPanel();
    updateDataManagementGuideHint();
  } catch (e) {
    console.error("更新存储状态失败:", e);
    statusElement.textContent = "无法获取存储状态";
    void updateBundleStoragePanels(null);
    void refreshAutoBackupPanel();
    updateDataManagementGuideHint();
  }
}

function getSettingsLanguage() {
  return (
    window.ControlerI18n?.getLanguage?.() ||
    localStorage.getItem("appLanguage") ||
    "zh-CN"
  );
}

function isSettingsEnglish() {
  return getSettingsLanguage() === "en-US";
}

function getGuideDiaryReferenceEntries() {
  const guideTitles =
    typeof window.ControlerGuideBundle?.buildGuideDiaryEntries === "function"
      ? window.ControlerGuideBundle.buildGuideDiaryEntries()
          .map((entry) => String(entry?.title || "").trim())
          .filter(Boolean)
      : Array.isArray(window.ControlerGuideBundle?.GUIDE_DIARY_TITLES)
        ? window.ControlerGuideBundle.GUIDE_DIARY_TITLES
        : [];
  let storedEntries = [];

  try {
    storedEntries = JSON.parse(localStorage.getItem("diaryEntries") || "[]");
  } catch (error) {
    storedEntries = [];
  }

  if (!guideTitles.length || !Array.isArray(storedEntries)) {
    return [];
  }

  return guideTitles
    .map((title) =>
      storedEntries.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          String(entry.title || "") === title &&
          String(entry.date || "").trim(),
      ),
    )
    .filter(Boolean);
}

function formatGuideDiaryReference(entry) {
  const date = String(entry?.date || "").trim();
  if (!date) {
    return "";
  }
  return date;
}

function updateDataManagementGuideHint() {
  const hintElement = document.getElementById("data-management-guide-hint");
  if (!hintElement) {
    return;
  }

  const guideReferences = getGuideDiaryReferenceEntries()
    .map((entry) => formatGuideDiaryReference(entry))
    .filter(Boolean);

  if (guideReferences.length) {
    hintElement.textContent = isSettingsEnglish()
      ? `Import now has both replace and diff modes. Replace removes content not included in the import, while diff keeps untouched content. Details were written into diary entries on ${guideReferences.join(", ")}.`
      : `导入现在分为“整包替换”和“差异导入”。整包替换会清掉未导入内容，差异导入会保留未导入内容。详细说明写在 ${guideReferences.join("、")} 的日记里。`;
    return;
  }

  hintElement.textContent = isSettingsEnglish()
    ? "Import now has both replace and diff modes. Export a backup before risky operations."
    : "导入现在有“整包替换”和“差异导入”两种模式；高风险操作前先导出备份。";
}

function buildLocalOnlyBackupPayload() {
  const normalizedGuideState =
    window.ControlerGuideBundle?.normalizeGuideState?.(
      JSON.parse(localStorage.getItem("guideState") || "null"),
    ) || {
      bundleVersion: 1,
      dismissedCardIds: [],
    };
  return {
    guideState: normalizedGuideState,
    customThemes: loadCustomThemes(),
    builtInThemeOverrides: loadBuiltInThemeOverrides(),
    tableScaleSettings: normalizeTableScaleSettings(
      JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}"),
    ),
    appNavigationVisibility: normalizeNavigationVisibilityState(
      getNavigationState(),
    ),
    selectedTheme: getStoredSelectedThemeId(),
    timerSessionState: JSON.parse(
      localStorage.getItem("timerSessionState") || "null",
    ),
    timestamp: new Date().toISOString(),
  };
}

function buildBackupPayload() {
  return {
    projects: JSON.parse(localStorage.getItem("projects") || "[]"),
    records: JSON.parse(localStorage.getItem("records") || "[]"),
    plans: JSON.parse(localStorage.getItem("plans") || "[]"),
    todos: JSON.parse(localStorage.getItem("todos") || "[]"),
    checkinItems: JSON.parse(localStorage.getItem("checkinItems") || "[]"),
    dailyCheckins: JSON.parse(localStorage.getItem("dailyCheckins") || "[]"),
    checkins: JSON.parse(localStorage.getItem("checkins") || "[]"),
    yearlyGoals: JSON.parse(localStorage.getItem("yearlyGoals") || "{}"),
    diaryEntries: JSON.parse(localStorage.getItem("diaryEntries") || "[]"),
    diaryCategories: JSON.parse(
      localStorage.getItem("diaryCategories") || "[]",
    ),
    ...buildLocalOnlyBackupPayload(),
  };
}

async function buildBundleAwareBackupPayload() {
  const bundleStorage = getSettingsStorageBundle();
  const controlerStorage = window.ControlerStorage;
  if (
    !bundleStorage?.buildLegacyStateFromBundle ||
    typeof controlerStorage?.getManifest !== "function" ||
    typeof controlerStorage?.getCoreState !== "function" ||
    typeof controlerStorage?.loadSectionRange !== "function"
  ) {
    return buildBackupPayload();
  }

  const manifest = await getSettingsBundleManifest();
  const coreState = await controlerStorage.getCoreState();
  if (!manifest || !coreState) {
    return buildBackupPayload();
  }

  const partitionMap = {};
  for (const section of SETTINGS_PARTITION_SECTION_OPTIONS.map((item) => item.value)) {
    const partitions = getManifestSectionPartitions(manifest, section);
    if (!partitions.length) {
      partitionMap[section] = {};
      continue;
    }

    const result = await controlerStorage.loadSectionRange(section, {
      periodIds: partitions.map((partition) => partition.periodId),
    });
    const grouped = {};
    const items = Array.isArray(result?.items) ? result.items : [];
    partitions.forEach((partition) => {
      grouped[partition.periodId] = items.filter(
        (item) =>
          bundleStorage.getPeriodIdForSectionItem(section, item) ===
          partition.periodId,
      );
    });
    partitionMap[section] = grouped;
  }

  return {
    ...bundleStorage.buildLegacyStateFromBundle({
      manifest,
      core: coreState,
      recurringPlans: Array.isArray(coreState?.recurringPlans)
        ? coreState.recurringPlans
        : [],
      partitionMap,
    }),
    ...buildLocalOnlyBackupPayload(),
  };
}

function normalizeImportedBackupPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("无效的数据格式");
  }
  if (!Array.isArray(data.projects) || !Array.isArray(data.records)) {
    throw new Error("无效的数据格式");
  }

  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const currentSelectedTheme = getStoredSelectedThemeId();
  const currentCustomThemes = loadCustomThemes();
  const currentBuiltInThemeOverrides = loadBuiltInThemeOverrides();

  const importedState = {
    projects: data.projects,
    records: data.records,
    plans: Array.isArray(data.plans) ? data.plans : [],
    todos: Array.isArray(data.todos) ? data.todos : [],
    checkinItems: Array.isArray(data.checkinItems) ? data.checkinItems : [],
    dailyCheckins: Array.isArray(data.dailyCheckins) ? data.dailyCheckins : [],
    checkins: Array.isArray(data.checkins) ? data.checkins : [],
    yearlyGoals:
      data.yearlyGoals &&
      typeof data.yearlyGoals === "object" &&
      !Array.isArray(data.yearlyGoals)
        ? data.yearlyGoals
        : {},
    diaryEntries: Array.isArray(data.diaryEntries) ? data.diaryEntries : [],
    diaryCategories: Array.isArray(data.diaryCategories)
      ? data.diaryCategories
      : [],
    guideState:
      window.ControlerGuideBundle?.normalizeGuideState?.(data.guideState) || {
        bundleVersion: 1,
        dismissedCardIds: [],
      },
    customThemes:
      hasOwn("customThemes") && Array.isArray(data.customThemes)
        ? data.customThemes
        : currentCustomThemes,
    builtInThemeOverrides:
      hasOwn("builtInThemeOverrides") &&
      data.builtInThemeOverrides &&
      typeof data.builtInThemeOverrides === "object" &&
      !Array.isArray(data.builtInThemeOverrides)
        ? data.builtInThemeOverrides
        : currentBuiltInThemeOverrides,
    tableScaleSettings: normalizeTableScaleSettings(
      data.tableScaleSettings &&
        typeof data.tableScaleSettings === "object" &&
        !Array.isArray(data.tableScaleSettings)
        ? data.tableScaleSettings
        : {},
    ),
    appNavigationVisibility: normalizeNavigationVisibilityState(
      data.appNavigationVisibility,
    ),
    selectedTheme:
      hasOwn("selectedTheme") &&
      typeof data.selectedTheme === "string" &&
      data.selectedTheme.trim()
        ? data.selectedTheme.trim()
        : currentSelectedTheme,
  };

  if (
    data.timerSessionState &&
    typeof data.timerSessionState === "object" &&
    !Array.isArray(data.timerSessionState)
  ) {
    importedState.timerSessionState = data.timerSessionState;
  }

  return importedState;
}

async function flushStorageWrites() {
  if (typeof window.ControlerStorage?.saveCoordinator?.flush === "function") {
    return window.ControlerStorage.saveCoordinator.flush(
      "settings-flush",
      "settings-persistence",
    );
  }
  if (typeof window.ControlerStorage?.flush === "function") {
    return window.ControlerStorage.flush();
  }
  if (typeof window.ControlerStorage?.persistNow === "function") {
    return window.ControlerStorage.persistNow();
  }
  if (typeof window.ControlerStorage?.persist === "function") {
    return window.ControlerStorage.persist();
  }
  return null;
}

async function buildClearDataTargetMessage() {
  const status = await getStorageStatusSnapshot();
  const displayPath = resolveStorageDisplayPath(status);
  if (!displayPath) {
    return "";
  }
  return `${
    status?.isCustomPath ? "当前清除目标" : "当前数据目录"
  }：\n${displayPath}`;
}

async function buildClearDataConfirmationMessage(baseMessage) {
  const targetMessage = await buildClearDataTargetMessage();
  return targetMessage ? `${baseMessage}\n\n${targetMessage}` : baseMessage;
}

function buildStorageSwitchSuccessMessage(status, options = {}) {
  const displayPath = resolveStorageDisplayPath(status) || "已选择目标";
  if (status?.switchAction === "adopted-existing") {
    return `已切换到同步目录：\n${displayPath}\n\n检测到目录里已有有效的 bundle 数据，应用将直接载入该目录中的内容。页面将刷新一次以重新载入内容。`;
  }
  if (status?.switchAction === "migrated-legacy") {
    return `已切换到同步目录：\n${displayPath}\n\n检测到旧单文件 JSON，已自动迁移为目录 bundle，并保留旧文件备份。页面将刷新一次以重新载入内容。`;
  }
  return `已切换到同步目录：\n${displayPath}\n\n目标目录中没有可用的 bundle 数据，当前应用数据已写入该目录。页面将刷新一次以重新载入内容。`;
}

async function getStorageStatusSnapshot() {
  if (window.electronAPI?.isElectron) {
    return window.electronAPI.storageStatus();
  }
  if (typeof window.ControlerStorage?.getStorageStatus === "function") {
    return window.ControlerStorage.getStorageStatus();
  }
  return null;
}

async function getAutoBackupStatusSnapshot() {
  if (typeof window.ControlerStorage?.getAutoBackupStatus === "function") {
    return window.ControlerStorage.getAutoBackupStatus();
  }
  if (
    window.electronAPI?.isElectron &&
    typeof window.electronAPI.storageGetAutoBackupStatus === "function"
  ) {
    return window.electronAPI.storageGetAutoBackupStatus();
  }
  return null;
}

function supportsAutoBackupStatusApi() {
  return (
    typeof window.ControlerStorage?.getAutoBackupStatus === "function" ||
    (window.electronAPI?.isElectron &&
      typeof window.electronAPI.storageGetAutoBackupStatus === "function")
  );
}

function resolveStorageDisplayPath(status = null) {
  return resolveStoragePathPresentation(status).displayPath;
}

function resolveStorageDisplayLabel(status = null) {
  return resolveStoragePathPresentation(status).displayLabel;
}

function normalizeSettingsPathValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
}

function buildSettingsBundleManifestPath(directory = "", fileName = "") {
  const safeDirectory = String(directory || "")
    .trim()
    .replace(/[\\/]+$/, "");
  const safeFileName = String(fileName || "")
    .trim()
    .replace(/^[/\\]+/, "");
  if (!safeDirectory) {
    return safeFileName;
  }
  if (!safeFileName) {
    return safeDirectory;
  }
  return `${safeDirectory}/${safeFileName}`;
}

function getSettingsRelativePath(target = "", base = "") {
  const normalizedTarget = normalizeSettingsPathValue(target);
  const normalizedBase = normalizeSettingsPathValue(base).replace(/\/+$/, "");
  if (!normalizedTarget || !normalizedBase) {
    return "";
  }
  if (normalizedTarget === normalizedBase) {
    return "";
  }
  if (normalizedTarget.startsWith(`${normalizedBase}/`)) {
    return normalizedTarget.slice(normalizedBase.length + 1);
  }
  return "";
}

function resolveStorageRawPath(status = null) {
  const actualUri =
    typeof status?.actualUri === "string" ? status.actualUri.trim() : "";
  const storagePath =
    typeof status?.storagePath === "string" ? status.storagePath.trim() : "";
  const defaultStoragePath =
    typeof status?.defaultStoragePath === "string"
      ? status.defaultStoragePath.trim()
      : "";
  const documentsPath =
    typeof status?.documentsPath === "string" ? status.documentsPath.trim() : "";
  const userDataPath =
    typeof status?.userDataPath === "string" ? status.userDataPath.trim() : "";
  const storageDirectory =
    typeof status?.storageDirectory === "string"
      ? status.storageDirectory.trim()
      : "";
  const syncFileName =
    typeof status?.syncFileName === "string" ? status.syncFileName.trim() : "";
  const isBundleMode =
    status?.storageMode === "directory-bundle" ||
    status?.bundleMode === "directory-bundle";

  return (
    storagePath ||
    (isBundleMode && storageDirectory && syncFileName
      ? `${storageDirectory}/${syncFileName}`
      : "") ||
    actualUri ||
    defaultStoragePath ||
    (storageDirectory && syncFileName ? `${storageDirectory}/${syncFileName}` : "") ||
    syncFileName ||
    documentsPath ||
    userDataPath ||
    ""
  );
}

function resolveStoragePathPresentation(status = null) {
  const storageDirectory =
    typeof status?.storageDirectory === "string"
      ? status.storageDirectory.trim()
      : "";
  const syncFileName =
    typeof status?.syncFileName === "string" ? status.syncFileName.trim() : "";
  const storagePath =
    typeof status?.storagePath === "string" ? status.storagePath.trim() : "";
  const actualUri =
    typeof status?.actualUri === "string" ? status.actualUri.trim() : "";
  const userDataPath =
    typeof status?.userDataPath === "string" ? status.userDataPath.trim() : "";
  const documentsPath =
    typeof status?.documentsPath === "string" ? status.documentsPath.trim() : "";
  const isBundleMode =
    status?.storageMode === "directory-bundle" ||
    status?.bundleMode === "directory-bundle";
  const rawPath = resolveStorageRawPath(status);
  const platform = String(status?.platform || "").trim().toLowerCase();
  const isAndroidNative = Boolean(status?.isNativeApp) && platform === "android";
  const privateRoots = [documentsPath, userDataPath]
    .map((item) => normalizeSettingsPathValue(item))
    .filter(Boolean);

  let displayPath =
    (isBundleMode && storageDirectory && syncFileName
      ? buildSettingsBundleManifestPath(storageDirectory, syncFileName)
      : "") ||
    rawPath ||
    syncFileName ||
    actualUri ||
    "";
  let displayDirectory = storageDirectory || "";
  let displayLabel = displayPath || syncFileName || actualUri || "";
  let note = "";

  const privateRoot =
    isAndroidNative && !status?.isCustomPath
      ? privateRoots.find((basePath) => {
          const normalizedDirectory = normalizeSettingsPathValue(storageDirectory);
          const normalizedRawPath = normalizeSettingsPathValue(rawPath);
          return (
            normalizedDirectory === basePath ||
            normalizedRawPath === basePath ||
            normalizedDirectory.startsWith(`${basePath}/`) ||
            normalizedRawPath.startsWith(`${basePath}/`)
          );
        }) || ""
      : "";

  if (privateRoot) {
    const relativeDirectory = getSettingsRelativePath(storageDirectory, privateRoot);
    const relativePath = getSettingsRelativePath(rawPath, privateRoot);
    displayDirectory = relativeDirectory
      ? buildSettingsBundleManifestPath("应用私有目录", relativeDirectory)
      : "应用私有目录";
    displayPath = relativePath
      ? buildSettingsBundleManifestPath("应用私有目录", relativePath)
      : buildSettingsBundleManifestPath(
          displayDirectory,
          syncFileName || "bundle-manifest.json",
        );
    displayLabel = syncFileName
      ? buildSettingsBundleManifestPath("应用私有目录", syncFileName)
      : displayPath;
    note = "位于应用私有目录，系统文件管理器通常不可直接访问。";
  } else if (
    isAndroidNative &&
    status?.isCustomPath &&
    actualUri.startsWith("content://") &&
    !storageDirectory
  ) {
    displayDirectory = "已授权外部目录";
    displayPath = syncFileName
      ? buildSettingsBundleManifestPath(displayDirectory, syncFileName)
      : actualUri;
    displayLabel = syncFileName || actualUri || displayPath;
    note = "这是系统授权的外部目录入口，路径可能显示为内容 URI。";
  }

  return {
    displayPath: displayPath || rawPath || syncFileName || actualUri || "",
    displayLabel: displayLabel || displayPath || syncFileName || actualUri || "",
    displayDirectory: displayDirectory || storageDirectory || "",
    rawPath,
    rawDirectory: storageDirectory,
    note,
  };
}

function escapeSettingsHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSettingsDateTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "暂无";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  try {
    return parsed.toLocaleString();
  } catch (error) {
    return parsed.toISOString();
  }
}

function formatAutoBackupUnitLabel(unit) {
  switch (String(unit || "").trim()) {
    case "hour":
      return "小时";
    case "week":
      return "周";
    case "day":
    default:
      return "天";
  }
}

function formatAutoBackupSize(size) {
  const numeric = Number(size || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)} KB`;
  }
  return `${Math.round(numeric)} B`;
}

function formatBundleBackupSource(source) {
  const normalized = String(source || "").trim();
  switch (normalized) {
    case "legacy-import":
      return "旧单文件导入备份";
    case "legacy-auto-migration":
    case "legacy-migration":
      return "旧单文件自动迁移备份";
    default:
      return normalized || "未知来源";
  }
}

async function updateBundleStoragePanels(status = null) {
  const structureElement = document.getElementById("bundle-structure-info");
  const backupElement = document.getElementById("bundle-backup-info");
  if (!(structureElement instanceof HTMLElement) || !(backupElement instanceof HTMLElement)) {
    return;
  }

  const manifest = await getSettingsBundleManifest();
  const pathPresentation = resolveStoragePathPresentation(status);
  const displayManifestPath = pathPresentation.displayPath;
  const displayDirectory = pathPresentation.displayDirectory;
  const sectionSummaries = SETTINGS_PARTITION_SECTION_OPTIONS.map((item) => {
    const partitions = getManifestSectionPartitions(manifest, item.value);
    return `<div><strong>${escapeSettingsHtml(item.label)}</strong>：${
      partitions.length
        ? `当前有 ${partitions.length} 个按月分片`
        : "当前还没有按月分片"
    }</div>`;
  }).join("");

  structureElement.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">当前 bundle 结构说明</div>
    <div>存储模式：${escapeSettingsHtml(
      status?.storageMode || status?.bundleMode || "directory-bundle",
    )}</div>
    <div>manifest：${escapeSettingsHtml(displayManifestPath || "未知")}</div>
    <div>根目录：${escapeSettingsHtml(displayDirectory || "未知")}</div>
    ${
      pathPresentation.note
        ? `<div>说明：${escapeSettingsHtml(pathPresentation.note)}</div>`
        : ""
    }
    ${
      pathPresentation.rawPath &&
      pathPresentation.rawPath !== displayManifestPath
        ? `<div>原始 manifest 路径：${escapeSettingsHtml(pathPresentation.rawPath)}</div>`
        : ""
    }
    ${
      pathPresentation.rawDirectory &&
      pathPresentation.rawDirectory !== displayDirectory
        ? `<div>原始根目录：${escapeSettingsHtml(pathPresentation.rawDirectory)}</div>`
        : ""
    }
    <div>固定文件：<strong>core.json</strong> 保存项目、待办、打卡项、年度目标、日记分类；<strong>plans-recurring.json</strong> 保存重复计划。</div>
    <div>按月分片：records / diaryEntries / dailyCheckins / checkins / plans（一次性计划）。</div>
    <div style="margin-top: 6px;">${sectionSummaries}</div>
  `;

  const backups = Array.isArray(manifest?.legacyBackups)
    ? manifest.legacyBackups.slice(-6).reverse()
    : [];
  if (!backups.length) {
    backupElement.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px;">最近备份/迁移记录</div>
      <div>当前还没有旧单文件迁移或旧单文件导入备份记录。</div>
    `;
    return;
  }

  backupElement.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">最近备份/迁移记录</div>
    ${backups
      .map((item) => {
        const fileName = String(item?.file || "").trim() || "未命名文件";
        const source = formatBundleBackupSource(item?.source);
        const createdAt = String(item?.createdAt || "").trim() || "未知时间";
        return `<div style="margin-bottom: 8px;">
          <div><strong>${escapeSettingsHtml(fileName)}</strong></div>
          <div>来源：${escapeSettingsHtml(source)}</div>
          <div>时间：${escapeSettingsHtml(createdAt)}</div>
        </div>`;
      })
      .join("")}
  `;
}

function readAutoBackupSettingsFromForm() {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  const intervalValue = Math.max(
    1,
    Math.floor(Number(intervalValueInput?.value || 1) || 1),
  );
  const intervalUnit = ["hour", "day", "week"].includes(
    String(intervalUnitSelect?.value || "").trim(),
  )
    ? String(intervalUnitSelect.value).trim()
    : "day";
  const maxBackups = Math.max(
    1,
    Math.floor(Number(maxBackupsInput?.value || 7) || 7),
  );
  return {
    enabled: !!enabledInput?.checked,
    intervalValue,
    intervalUnit,
    maxBackups,
  };
}

function normalizeAutoBackupStatus(status = null, fallback = null) {
  const source =
    status && typeof status === "object" && !Array.isArray(status) ? status : {};
  const base =
    fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : {};
  const intervalUnitCandidate = String(
    source.intervalUnit || base.intervalUnit || "day",
  ).trim();
  const normalizeOptionalText = (value, defaultValue = null) => {
    if (typeof value !== "string") {
      return defaultValue;
    }
    const trimmed = value.trim();
    return trimmed || defaultValue;
  };
  const hasOwnStatusField = (fieldName) =>
    !!source &&
    typeof source === "object" &&
    Object.prototype.hasOwnProperty.call(source, fieldName);
  const resolveOptionalTextField = (fieldName, defaultValue = null) =>
    normalizeOptionalText(
      hasOwnStatusField(fieldName) ? source[fieldName] : base[fieldName],
      defaultValue,
    );

  return {
    enabled:
      source.enabled === undefined ? base.enabled === true : source.enabled === true,
    intervalValue: Math.max(
      1,
      Math.floor(Number(source.intervalValue ?? base.intervalValue ?? 1) || 1),
    ),
    intervalUnit: ["hour", "day", "week"].includes(intervalUnitCandidate)
      ? intervalUnitCandidate
      : "day",
    maxBackups: Math.max(
      1,
      Math.floor(Number(source.maxBackups ?? base.maxBackups ?? 7) || 7),
    ),
    backupDirectory: resolveOptionalTextField("backupDirectory", ""),
    backupDirectoryKind: resolveOptionalTextField("backupDirectoryKind", "file-path"),
    backupCount: Math.max(
      0,
      Math.floor(Number(source.backupCount ?? base.backupCount ?? 0) || 0),
    ),
    latestBackupFile: resolveOptionalTextField("latestBackupFile"),
    latestBackupPath: resolveOptionalTextField("latestBackupPath"),
    latestBackupAt: resolveOptionalTextField("latestBackupAt"),
    latestBackupSize: Math.max(
      0,
      Number(source.latestBackupSize ?? base.latestBackupSize ?? 0) || 0,
    ),
    lastAttemptAt: resolveOptionalTextField("lastAttemptAt"),
    lastError: resolveOptionalTextField("lastError", ""),
    lastBackedUpFingerprint: resolveOptionalTextField(
      "lastBackedUpFingerprint",
      "",
    ),
  };
}

function readCachedAutoBackupStatus() {
  if (autoBackupCachedStatus) {
    return autoBackupCachedStatus;
  }

  try {
    const rawValue = localStorage.getItem(AUTO_BACKUP_STATUS_CACHE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      autoBackupCachedStatus = normalizeAutoBackupStatus(parsed);
      return autoBackupCachedStatus;
    }
  } catch (error) {
    console.error("读取自动备份缓存失败:", error);
  }

  return null;
}

function writeCachedAutoBackupStatus(status = null) {
  const normalized = normalizeAutoBackupStatus(status, readCachedAutoBackupStatus());
  autoBackupCachedStatus = normalized;
  try {
    localStorage.setItem(
      AUTO_BACKUP_STATUS_CACHE_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    console.error("写入自动备份缓存失败:", error);
  }
  return normalized;
}

function applyAutoBackupSettingsToForm(status = null) {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  if (enabledInput instanceof HTMLInputElement) {
    enabledInput.checked = status?.enabled === true;
  }
  if (intervalValueInput instanceof HTMLInputElement) {
    intervalValueInput.value = String(
      Math.max(1, Math.floor(Number(status?.intervalValue || 1) || 1)),
    );
  }
  if (intervalUnitSelect instanceof HTMLSelectElement) {
    intervalUnitSelect.value = ["hour", "day", "week"].includes(
      String(status?.intervalUnit || "").trim(),
    )
      ? String(status.intervalUnit).trim()
      : "day";
  }
  if (maxBackupsInput instanceof HTMLInputElement) {
    maxBackupsInput.value = String(
      Math.max(1, Math.floor(Number(status?.maxBackups || 7) || 7)),
    );
  }
}

function updateAutoBackupActionsAlignment() {
  const container = document.querySelector(".settings-auto-backup-actions");
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const actionButtons = Array.from(
    container.querySelectorAll(".settings-auto-backup-action"),
  ).filter((button) => button instanceof HTMLElement);
  const visibleButtons = actionButtons.filter((button) => {
    if (button.hidden) {
      return false;
    }
    return window.getComputedStyle(button).display !== "none";
  });

  container.dataset.visibleActions = String(visibleButtons.length);
  actionButtons.forEach((button) => {
    button.style.gridColumn = "";
  });

  if (window.innerWidth > 760 && visibleButtons.length === 2) {
    visibleButtons[0].style.gridColumn = "2";
    visibleButtons[1].style.gridColumn = "3";
  }
}

function renderAutoBackupPanelStatus(status = null, options = {}) {
  const panel = document.getElementById("auto-backup-status-panel");
  const shareButton = document.getElementById("share-latest-auto-backup");
  if (!(panel instanceof HTMLElement)) {
    return null;
  }

  if (shareButton instanceof HTMLElement) {
    shareButton.style.display = window.ControlerStorage?.isNativeApp ? "" : "none";
  }
  updateAutoBackupActionsAlignment();

  if (!status) {
    panel.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px;">自动备份状态</div>
      <div>当前环境暂不支持自动本地 ZIP 备份。</div>
    `;
    return null;
  }

  const nextStatus = normalizeAutoBackupStatus(status, readCachedAutoBackupStatus());
  applyAutoBackupSettingsToForm(nextStatus);

  const intervalLabel = `${Math.max(
    1,
    Math.floor(Number(nextStatus.intervalValue || 1) || 1),
  )} ${formatAutoBackupUnitLabel(nextStatus.intervalUnit)}`;
  const latestBackupText = nextStatus.latestBackupFile
    ? `${nextStatus.latestBackupFile} · ${formatAutoBackupSize(
        nextStatus.latestBackupSize,
      )} · ${formatSettingsDateTime(nextStatus.latestBackupAt)}`
    : "暂无自动备份 ZIP";
  const errorText =
    typeof nextStatus.lastError === "string" && nextStatus.lastError.trim()
      ? nextStatus.lastError.trim()
      : "最近执行正常";
  const statusNote =
    typeof options.statusNote === "string" && options.statusNote.trim()
      ? options.statusNote.trim()
      : "";
  const autoBackupWrappedTextStyle = "word-break: break-all; overflow-wrap: anywhere;";
  panel.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 6px;">自动备份状态</div>
    <div>当前状态：${nextStatus.enabled ? "已启用" : "未启用"}</div>
    <div>备份周期：每 ${escapeSettingsHtml(intervalLabel)}</div>
    <div>保留份数：${escapeSettingsHtml(nextStatus.maxBackups || 1)}</div>
    <div>备份目录：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      nextStatus.backupDirectory || "未知",
    )}</span></div>
    <div>目录类型：${escapeSettingsHtml(
      nextStatus.backupDirectoryKind || "file-path",
    )}</div>
    <div>现有备份：${escapeSettingsHtml(nextStatus.backupCount || 0)} 份</div>
    <div>最近备份：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      latestBackupText,
    )}</span></div>
    <div>最近尝试：${escapeSettingsHtml(
      formatSettingsDateTime(nextStatus.lastAttemptAt),
    )}</div>
    <div>最近结果：<span style="${autoBackupWrappedTextStyle}">${escapeSettingsHtml(
      errorText,
    )}</span></div>
    ${
      statusNote
        ? `<div style="margin-top: 8px; color: var(--muted-text-color);">${escapeSettingsHtml(
            statusNote,
          )}</div>`
        : ""
    }
  `;
  return nextStatus;
}

async function refreshAutoBackupPanel(status = null) {
  const cachedStatus = readCachedAutoBackupStatus();
  const canLoadStatus = supportsAutoBackupStatusApi();
  if (!status && cachedStatus && canLoadStatus) {
    renderAutoBackupPanelStatus(cachedStatus, {
      statusNote: "已载入上次保存的设置，正在同步最新状态...",
    });
  }

  let nextStatus =
    status && typeof status === "object" && !Array.isArray(status) ? status : null;
  if (!nextStatus) {
    try {
      nextStatus = await getAutoBackupStatusSnapshot();
    } catch (error) {
      console.error("读取自动备份状态失败:", error);
      nextStatus = null;
    }
  }

  if (!nextStatus) {
    if (!canLoadStatus) {
      return renderAutoBackupPanelStatus(null);
    }
    if (cachedStatus) {
      return cachedStatus;
    }
    return renderAutoBackupPanelStatus(null);
  }

  const normalizedStatus = writeCachedAutoBackupStatus(nextStatus);
  renderAutoBackupPanelStatus(normalizedStatus);
  return normalizedStatus;
}

async function commitAutoBackupSettingsSave(saveVersion) {
  if (typeof window.ControlerStorage?.updateAutoBackupSettings !== "function") {
    await showSettingsAlert("当前环境暂不支持保存自动备份设置。", {
      title: "自动备份",
      danger: true,
    });
    return null;
  }

  if (saveVersion !== autoBackupSaveVersion) {
    return null;
  }

  const fallbackStatus = readCachedAutoBackupStatus();
  const settings = readAutoBackupSettingsFromForm();
  const optimisticStatus = normalizeAutoBackupStatus(settings, fallbackStatus);
  renderAutoBackupPanelStatus(optimisticStatus);

  try {
    const result = await runWithSettingsBusyState(
      {
        title: "正在保存设置",
        message: "正在保存自动备份设置，请稍候。保存完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        const response = await window.ControlerStorage.updateAutoBackupSettings(
          settings,
        );
        if (!response || typeof response !== "object") {
          throw new Error("自动备份设置保存失败，请重试。");
        }
        return response;
      },
    );

    if (saveVersion !== autoBackupSaveVersion) {
      return null;
    }

    const normalizedStatus = writeCachedAutoBackupStatus(result);
    renderAutoBackupPanelStatus(normalizedStatus, {
      statusNote: "设置已保存，正在同步最新备份状态...",
    });
    window.setTimeout(() => {
      void refreshAutoBackupPanel();
    }, 0);
    return normalizedStatus;
  } catch (error) {
    console.error("保存自动备份设置失败:", error);
    const cachedStatus = readCachedAutoBackupStatus();
    if (cachedStatus) {
      renderAutoBackupPanelStatus(cachedStatus);
      applyAutoBackupSettingsToForm(cachedStatus);
    }
    await showSettingsAlert(
      error instanceof Error && error.message
        ? error.message
        : "保存自动备份设置失败，请重试。",
      {
        title: "自动备份",
        danger: true,
      },
    );
    return null;
  }
}

function scheduleAutoBackupSettingsSave(options = {}) {
  const { immediate = false } = options;
  window.clearTimeout(autoBackupSaveTimer);
  const saveVersion = ++autoBackupSaveVersion;
  autoBackupSaveTimer = window.setTimeout(() => {
    autoBackupSaveTimer = 0;
    void commitAutoBackupSettingsSave(saveVersion);
  }, immediate ? 0 : 260);
}

function bindAutoBackupAutoSaveInputs() {
  const enabledInput = document.getElementById("auto-backup-enabled");
  const intervalValueInput = document.getElementById("auto-backup-interval-value");
  const intervalUnitSelect = document.getElementById("auto-backup-interval-unit");
  const maxBackupsInput = document.getElementById("auto-backup-max-backups");
  const immediateSave = () => {
    applyAutoBackupSettingsToForm(readAutoBackupSettingsFromForm());
    scheduleAutoBackupSettingsSave({
      immediate: true,
    });
  };
  const deferredSave = () => {
    scheduleAutoBackupSettingsSave();
  };

  enabledInput?.addEventListener("change", immediateSave);
  intervalUnitSelect?.addEventListener("change", immediateSave);
  intervalValueInput?.addEventListener("input", deferredSave);
  intervalValueInput?.addEventListener("change", immediateSave);
  maxBackupsInput?.addEventListener("input", deferredSave);
  maxBackupsInput?.addEventListener("change", immediateSave);
}

function getSettingsBackupOverlay() {
  return document.getElementById("settings-backup-overlay");
}

function getSettingsLoadingOverlayController() {
  if (settingsLoadingOverlayController) {
    return settingsLoadingOverlayController;
  }
  const overlay = getSettingsBackupOverlay();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  settingsLoadingOverlayController = window.ControlerUI?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".settings-main",
    scopeFullscreenToInlineHost: false,
  }) || null;
  return settingsLoadingOverlayController;
}

function syncSettingsNativeBusyLock(active, lockNavigation = false) {
  const nextActive = !!active;
  const nextLockNavigation = !!lockNavigation;
  if (
    settingsNativeBusyLockActive === nextActive &&
    window.__controlerSettingsNativeLockNavigation === nextLockNavigation
  ) {
    return;
  }
  settingsNativeBusyLockActive = nextActive;
  window.__controlerSettingsNativeLockNavigation = nextLockNavigation;
  window.ControlerNativeBridge?.emitEvent?.("ui.busy-state", {
    href: window.location.href,
    isBusy: nextActive,
    lockNavigation: nextLockNavigation,
  });
}

function setSettingsBusyState(options = {}) {
  const overlay = getSettingsBackupOverlay();
  const runAutoBackupNowBtn = document.getElementById("run-auto-backup-now");
  const {
    active = false,
    lockNativeExit = true,
    title = "正在处理中",
    message = "正在准备当前操作，请稍候。完成前请不要离开当前页面。",
  } = options;
  const titleNode = overlay?.querySelector?.("[data-loading-title]");
  const messageNode = overlay?.querySelector?.("[data-loading-message]");

  document.body.classList.toggle("settings-backup-busy", !!active);

  if (runAutoBackupNowBtn) {
    runAutoBackupNowBtn.disabled = !!active;
    runAutoBackupNowBtn.setAttribute("aria-busy", active ? "true" : "false");
  }

  syncSettingsNativeBusyLock(active, active && lockNativeExit);

  if (!overlay) {
    return Promise.resolve(false);
  }

  const loadingController = getSettingsLoadingOverlayController();
  let statePromise = Promise.resolve(true);
  if (loadingController) {
    statePromise = Promise.resolve(
      loadingController.setState({
        active,
        mode: "fullscreen",
        title,
        message,
      }),
    );
  } else {
    overlay.hidden = !active;
    overlay.setAttribute("aria-hidden", active ? "false" : "true");
    if (titleNode) {
      titleNode.textContent = title;
    }
    if (messageNode) {
      messageNode.textContent = message;
    }
  }

  if (active) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    overlay.focus();
  }

  return statePromise;
}

function setSettingsBackupBusyState(isBusy) {
  setSettingsBusyState({
    active: !!isBusy,
    title: "正在备份中",
    message: "正在整理并写入备份文件，请稍候。备份完成前请不要离开当前页面。",
  });
}

async function runWithSettingsBusyState(busyOptions = {}, action) {
  const { delayMs = 0, ...resolvedBusyOptions } =
    busyOptions && typeof busyOptions === "object" ? busyOptions : {};
  window.clearTimeout(settingsBusyOverlayTimer);
  if (delayMs > 0) {
    settingsBusyOverlayTimer = window.setTimeout(() => {
      settingsBusyOverlayTimer = 0;
      setSettingsBusyState({
        active: true,
        ...resolvedBusyOptions,
      });
    }, delayMs);
  } else {
    setSettingsBusyState({
      active: true,
      ...resolvedBusyOptions,
    });
  }
  try {
    return await action();
  } finally {
    window.clearTimeout(settingsBusyOverlayTimer);
    settingsBusyOverlayTimer = 0;
    setSettingsBusyState({
      active: false,
    });
  }
}

async function runAutoBackupNowFromPanel() {
  if (typeof window.ControlerStorage?.runAutoBackupNow !== "function") {
    await showSettingsAlert("当前环境暂不支持立即执行自动备份。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }

  let message = "自动备份已完成。";
  let danger = false;

  setSettingsBackupBusyState(true);
  try {
    const result = await window.ControlerStorage.runAutoBackupNow();
    await refreshAutoBackupPanel(result);
    if (typeof result?.lastError === "string" && result.lastError.trim()) {
      message = `自动备份失败：${result.lastError.trim()}`;
      danger = true;
    }
  } catch (error) {
    console.error("立即执行自动备份失败:", error);
    const errorText =
      error instanceof Error ? error.message : String(error || "未知错误");
    message = `自动备份失败：${errorText}`;
    danger = true;
  } finally {
    setSettingsBackupBusyState(false);
  }

  await showSettingsAlert(message, {
    title: "自动备份",
    danger,
  });
}

async function openAutoBackupLocationFromPanel() {
  const status = await getAutoBackupStatusSnapshot();
  const backupDirectory =
    typeof status?.backupDirectory === "string"
      ? status.backupDirectory.trim()
      : "";
  if (!backupDirectory) {
    await showSettingsAlert("当前还没有可显示的备份目录。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  if (window.electronAPI?.isElectron && typeof window.electronAPI.shellOpenPath === "function") {
    const opened = await window.electronAPI.shellOpenPath(backupDirectory);
    if (opened) {
      await showSettingsAlert(`已打开备份目录：\n${backupDirectory}`, {
        title: "自动备份",
      });
      return;
    }
  }
  await showSettingsAlert(`当前备份目录：\n${backupDirectory}`, {
    title: "自动备份",
  });
}

async function shareLatestAutoBackupFromPanel() {
  if (typeof window.ControlerStorage?.shareLatestBackup !== "function") {
    await showSettingsAlert("当前环境暂不支持分享最新备份。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  const result = await window.ControlerStorage.shareLatestBackup();
  await refreshAutoBackupPanel();
  if (result?.ok === false) {
    await showSettingsAlert(result?.message || "分享最新备份失败。", {
      title: "自动备份",
      danger: true,
    });
    return;
  }
  await showSettingsAlert(result?.message || "已打开最新备份的分享面板。", {
    title: "自动备份",
  });
}

async function showSettingsAlert(message, options = {}) {
  if (window.ControlerUI?.alertDialog) {
    await window.ControlerUI.alertDialog({
      title: localizeSettingsUiText(options.title || "提示"),
      message: localizeSettingsUiText(message),
      confirmText: localizeSettingsUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }
  alert(localizeSettingsUiText(message));
}

async function requestSettingsConfirmation(message, options = {}) {
  if (window.ControlerUI?.confirmDialog) {
    return window.ControlerUI.confirmDialog({
      title: localizeSettingsUiText(options.title || "请确认操作"),
      message: localizeSettingsUiText(message),
      confirmText: localizeSettingsUiText(options.confirmText || "确定"),
      cancelText: localizeSettingsUiText(options.cancelText || "取消"),
      danger: !!options.danger,
    });
  }
  return confirm(localizeSettingsUiText(message));
}

const SETTINGS_PARTITION_SECTION_OPTIONS = [
  { value: "records", label: "记录" },
  { value: "diaryEntries", label: "日记" },
  { value: "dailyCheckins", label: "每日打卡" },
  { value: "checkins", label: "打卡历史" },
  { value: "plans", label: "一次性计划" },
];

function getSettingsStorageBundle() {
  return window.ControlerStorageBundle || null;
}

function getExternalImportHelper() {
  return window.ControlerExternalImport || null;
}

async function getCurrentProjectsForImport() {
  try {
    if (typeof window.ControlerStorage?.getCoreState === "function") {
      const coreState = await window.ControlerStorage.getCoreState();
      if (Array.isArray(coreState?.projects)) {
        return coreState.projects;
      }
    }
  } catch (error) {
    console.error("读取当前项目列表失败，回退本地缓存:", error);
  }
  try {
    return JSON.parse(localStorage.getItem("projects") || "[]");
  } catch (error) {
    return [];
  }
}

async function loadAllRecordsForImportRepair(fallbackRecords = []) {
  if (typeof window.ControlerStorage?.loadSectionRange === "function") {
    try {
      const range = await window.ControlerStorage.loadSectionRange("records", {
        all: true,
      });
      if (Array.isArray(range?.items)) {
        return range.items;
      }
    } catch (error) {
      console.error("读取全量记录以修复导入后的项目时长缓存失败:", error);
    }
  }
  try {
    const storedRecords = JSON.parse(localStorage.getItem("records") || "[]");
    if (Array.isArray(storedRecords)) {
      return storedRecords;
    }
  } catch (error) {
    console.error("读取本地记录缓存失败，回退导入记录快照:", error);
  }
  return Array.isArray(fallbackRecords) ? fallbackRecords.slice() : [];
}

function rebuildImportedProjectDurationCaches(projectList = [], recordList = []) {
  const bundleHelper = getSettingsStorageBundle();
  if (typeof bundleHelper?.rebuildProjectDurationCaches !== "function") {
    return Array.isArray(projectList) ? projectList.slice() : [];
  }
  const rebuiltProjects = bundleHelper.rebuildProjectDurationCaches(
    Array.isArray(projectList) ? projectList : [],
    Array.isArray(recordList) ? recordList : [],
  );
  return Array.isArray(rebuiltProjects) ? rebuiltProjects : [];
}

function formatImportDatesPreview(dateKeys = [], limit = 6) {
  const normalized = Array.isArray(dateKeys)
    ? dateKeys.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (!normalized.length) {
    return "无";
  }
  if (normalized.length <= limit) {
    return normalized.join("、");
  }
  return `${normalized.slice(0, limit).join("、")} 等 ${normalized.length} 天`;
}

function formatImportPeriodsPreview(periodIds = [], limit = 6) {
  const normalized = Array.isArray(periodIds)
    ? periodIds.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (!normalized.length) {
    return "无";
  }
  if (normalized.length <= limit) {
    return normalized.join("、");
  }
  return `${normalized.slice(0, limit).join("、")} 等 ${normalized.length} 个月份`;
}

function getPartitionSectionLabel(section) {
  const matched = SETTINGS_PARTITION_SECTION_OPTIONS.find(
    (item) => item.value === section,
  );
  return matched?.label || section || "分区";
}

async function getSettingsBundleManifest() {
  try {
    if (typeof window.ControlerStorage?.getManifest === "function") {
      const manifest = await window.ControlerStorage.getManifest();
      if (manifest && typeof manifest === "object") {
        return manifest;
      }
    }
  } catch (error) {
    console.error("读取 bundle manifest 失败，回退本地推导:", error);
  }

  const bundleStorage = getSettingsStorageBundle();
  if (bundleStorage?.splitLegacyState) {
    return bundleStorage.splitLegacyState(buildBackupPayload()).manifest || null;
  }
  return null;
}

function getManifestSectionPartitions(manifest, section) {
  const partitions = manifest?.sections?.[section]?.partitions;
  return Array.isArray(partitions)
    ? partitions.filter(
        (partition) =>
          partition &&
          typeof partition === "object" &&
          typeof partition.periodId === "string" &&
          partition.periodId,
      )
    : [];
}

function buildPartitionFileName(section, periodId) {
  const safeSection = String(section || "partition").trim() || "partition";
  const safePeriodId = String(periodId || "undated").trim() || "undated";
  return `order-${safeSection}-${safePeriodId}.json`;
}

function downloadJsonFile(payload, fileName) {
  const serialized = JSON.stringify(payload, null, 2);
  const dataUri =
    "data:application/json;charset=utf-8," + encodeURIComponent(serialized);
  const linkElement = document.createElement("a");
  linkElement.setAttribute("href", dataUri);
  linkElement.setAttribute("download", fileName);
  linkElement.click();
}

function extractSettingsFileNameFromPath(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) {
    return "";
  }
  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] || normalizedPath;
}

function parseSettingsFileAcceptExtensions(accept = ".json,.zip") {
  return String(accept || "")
    .split(",")
    .map((item) =>
      String(item || "")
        .trim()
        .replace(/^\./, "")
        .toLowerCase(),
    )
    .filter(Boolean);
}

function buildNativeSelectedImportFile(payload = {}) {
  const filePath =
    typeof payload?.path === "string" && payload.path.trim()
      ? payload.path.trim()
      : "";
  const nativeImportUri =
    typeof payload?.uri === "string" && payload.uri.trim()
      ? payload.uri.trim()
      : "";
  const fileName = extractSettingsFileNameFromPath(
    payload?.fileName || filePath || nativeImportUri,
  );
  if (!fileName && !nativeImportUri) {
    return null;
  }
  return {
    name: fileName,
    path: filePath,
    nativeImportUri,
    contentText:
      typeof payload?.text === "string" ? payload.text : "",
  };
}

async function promptSettingsFileSelection(accept = ".json,.zip", options = {}) {
  const resolvedOptions =
    options && typeof options === "object" ? options : {};
  const {
    title = "正在导入数据",
    message = "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
  } = resolvedOptions;
  const electronApi = window.electronAPI;

  if (
    electronApi?.isElectron &&
    typeof electronApi.dialogSelectDataFile === "function"
  ) {
    const selectedPath = await electronApi.dialogSelectDataFile({
      title: resolvedOptions.fileDialogTitle || "选择要导入的数据文件",
      extensions: parseSettingsFileAcceptExtensions(accept),
    });
    if (!selectedPath) {
      return null;
    }
    setSettingsBusyState({
      active: true,
      title,
      message,
    });
    return buildNativeSelectedImportFile({
      fileName: extractSettingsFileNameFromPath(selectedPath),
      path: selectedPath,
    });
  }

  if (
    window.ControlerStorage?.isNativeApp &&
    typeof window.ControlerStorage?.pickImportSourceFile === "function"
  ) {
    const selectedFile = await window.ControlerStorage.pickImportSourceFile({
      accept:
        parseSettingsFileAcceptExtensions(accept).every(
          (extension) => extension === "json",
        )
          ? "json"
          : "auto",
    });
    const normalizedFile = buildNativeSelectedImportFile(selectedFile);
    if (!normalizedFile) {
      return null;
    }
    setSettingsBusyState({
      active: true,
      title,
      message,
    });
    return normalizedFile;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = (event) => {
      const file = event?.target?.files?.[0] || null;
      if (file) {
        setSettingsBusyState({
          active: true,
          title,
          message,
        });
      }
      resolve(file || null);
    };
    input.click();
  });
}

function readSettingsFileAsText(file) {
  const filePath =
    typeof file?.path === "string" && file.path.trim() ? file.path.trim() : "";
  if (typeof file?.contentText === "string") {
    return Promise.resolve(file.contentText);
  }
  if (
    filePath &&
    typeof window.electronAPI?.fsReadTextFile === "function"
  ) {
    return window.electronAPI.fsReadTextFile(filePath);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(typeof event?.target?.result === "string" ? event.target.result : "");
    };
    reader.onerror = () => {
      reject(reader.error || new Error("读取文件失败"));
    };
    reader.readAsText(file);
  });
}

function isPartitionEnvelopePayload(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof data.section === "string" &&
    typeof data.periodId === "string" &&
    Array.isArray(data.items)
  );
}

function buildFallbackSectionItemsForPeriod(section, periodId) {
  const bundleStorage = getSettingsStorageBundle();
  if (!bundleStorage?.getPeriodIdForSectionItem) {
    return [];
  }
  const backupPayload = buildBackupPayload();
  const sourceItems =
    section === "plans"
      ? (backupPayload.plans || []).filter(
          (item) =>
            !bundleStorage.isRecurringPlan?.(item) &&
            String(item?.repeat || "").trim().toLowerCase() === "none",
        )
      : Array.isArray(backupPayload?.[section])
        ? backupPayload[section]
        : [];
  return sourceItems.filter(
    (item) => bundleStorage.getPeriodIdForSectionItem(section, item) === periodId,
  );
}

async function buildPartitionEnvelopeForExport(section, periodId) {
  const bundleStorage = getSettingsStorageBundle();
  if (!bundleStorage?.createPartitionEnvelope) {
    throw new Error("当前环境缺少分区封装能力");
  }

  let items = [];
  if (typeof window.ControlerStorage?.loadSectionRange === "function") {
    const result = await window.ControlerStorage.loadSectionRange(section, {
      periodIds: [periodId],
    });
    items = Array.isArray(result?.items) ? result.items : [];
  } else {
    items = buildFallbackSectionItemsForPeriod(section, periodId);
  }

  return bundleStorage.createPartitionEnvelope(section, periodId, items);
}

function openSettingsFormDialog({
  title,
  description = "",
  confirmText = "确定",
  cancelText = "取消",
  width = "min(520px, calc(100vw - 28px))",
  renderBody,
  onConfirm,
}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "4300";

    modal.innerHTML = `
      <div class="modal-content themed-dialog-card ms" style="width:${width}; max-width:${width};">
        <div class="themed-dialog-title">${localizeSettingsUiText(title || "设置")}</div>
        <div class="themed-dialog-message" style="white-space:pre-wrap;">${localizeSettingsUiText(description || "")}</div>
        <div class="settings-transfer-body" style="display:grid; gap:12px; margin-top:14px;"></div>
        <div class="settings-transfer-error" style="display:none; color:var(--delete-btn); font-size:12px; margin-top:10px;"></div>
        <div class="themed-dialog-actions" style="margin-top:18px;">
          <button type="button" class="bts settings-transfer-cancel" style="margin:0;">${localizeSettingsUiText(cancelText)}</button>
          <button type="button" class="bts settings-transfer-confirm" style="margin:0;">${localizeSettingsUiText(confirmText)}</button>
        </div>
      </div>
    `;

    const body = modal.querySelector(".settings-transfer-body");
    const errorElement = modal.querySelector(".settings-transfer-error");
    const confirmButton = modal.querySelector(".settings-transfer-confirm");
    const cancelButton = modal.querySelector(".settings-transfer-cancel");

    const cleanup = (result) => {
      document.removeEventListener("keydown", handleKeydown, true);
      window.ControlerUI?.closeModal?.(modal);
      resolve(result);
    };

    const setError = (message) => {
      if (!(errorElement instanceof HTMLElement)) {
        return;
      }
      const safeMessage =
        typeof message === "string" && message.trim() ? message.trim() : "";
      errorElement.textContent = safeMessage;
      errorElement.style.display = safeMessage ? "block" : "none";
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(null);
      }
    };

    if (typeof renderBody === "function" && body instanceof HTMLElement) {
      renderBody({
        modal,
        body,
        setError,
      });
    }

    confirmButton?.addEventListener("click", async (event) => {
      event.preventDefault();
      setError("");
      try {
        const result =
          typeof onConfirm === "function"
            ? await onConfirm({
                modal,
                body,
                setError,
              })
            : true;
        if (result === false) {
          return;
        }
        cleanup(result ?? true);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error || "操作失败"));
      }
    });

    cancelButton?.addEventListener("click", (event) => {
      event.preventDefault();
      cleanup(null);
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cleanup(null);
      }
    });

    prepareSettingsModalOverlayElement(modal);
    if (window.ControlerUI?.enhanceNativeSelect) {
      modal.querySelectorAll("select").forEach((select) => {
        if (!(select instanceof HTMLSelectElement)) {
          return;
        }
        window.ControlerUI.enhanceNativeSelect(select, {
          fullWidth: true,
          minWidth: 240,
          preferredMenuWidth: 320,
          maxMenuWidth: 360,
        });
      });
    }
    document.addEventListener("keydown", handleKeydown, true);
    setTimeout(() => {
      confirmButton?.focus?.();
    }, 0);
  });
}

function createSettingsSelectField({
  label,
  value,
  options = [],
}) {
  const wrapper = document.createElement("label");
  wrapper.style.display = "grid";
  wrapper.style.gap = "8px";
  wrapper.style.color = "var(--text-color)";

  const title = document.createElement("span");
  title.textContent = localizeSettingsUiText(label);
  title.style.fontSize = "13px";
  title.style.color = "var(--muted-text-color)";

  const select = document.createElement("select");
  select.className = "bts";
  select.style.margin = "0";
  select.style.width = "100%";
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = localizeSettingsUiText(option.label);
    select.appendChild(optionElement);
  });
  if (value !== undefined) {
    select.value = value;
  }

  wrapper.appendChild(title);
  wrapper.appendChild(select);
  return {
    wrapper,
    select,
  };
}

async function showExportOptionsDialog(manifest) {
  const supportsBundleExport =
    typeof window.ControlerStorage?.exportBundle === "function";
  const availableSections = SETTINGS_PARTITION_SECTION_OPTIONS.filter(
    (section) => getManifestSectionPartitions(manifest, section.value).length > 0,
  );
  const defaultSection = availableSections[0]?.value || "records";

  return openSettingsFormDialog({
    title: "导出数据",
    description:
      "全部分片 ZIP 会打包 bundle-manifest.json、core.json、plans-recurring.json 和全部月分片。单分区 JSON 只适用于 records / diaryEntries / dailyCheckins / checkins / plans（一次性）。",
    confirmText: "开始导出",
    renderBody({ body }) {
      const exportTypeField = createSettingsSelectField({
        label: "导出类型",
        value: "full",
        options: [
          {
            value: "full",
            label: supportsBundleExport ? "全部分片 ZIP" : "整包 JSON 兼容备份",
          },
          ...(availableSections.length
            ? [{ value: "partition", label: "单分区 JSON" }]
            : []),
        ],
      });
      const sectionField = createSettingsSelectField({
        label: "数据分区",
        value: defaultSection,
        options: availableSections.map((section) => ({
          value: section.value,
          label: getPartitionSectionLabel(section.value),
        })),
      });
      const periodField = createSettingsSelectField({
        label: "月份分区",
        value: getManifestSectionPartitions(manifest, defaultSection)[0]?.periodId || "",
        options: getManifestSectionPartitions(manifest, defaultSection).map((partition) => ({
          value: partition.periodId,
          label: `${partition.periodId} (${partition.count || 0} 条)`,
        })),
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

      const refreshPartitionFields = () => {
        const exportType = exportTypeField.select.value;
        const activeSection = sectionField.select.value;
        const partitions = getManifestSectionPartitions(manifest, activeSection);
        sectionField.wrapper.style.display =
          exportType === "partition" ? "grid" : "none";
        periodField.wrapper.style.display =
          exportType === "partition" ? "grid" : "none";
        periodField.select.innerHTML = "";
        partitions.forEach((partition) => {
          const option = document.createElement("option");
          option.value = partition.periodId;
          option.textContent = `${partition.periodId} (${partition.count || 0} 条)`;
          periodField.select.appendChild(option);
        });
        if (window.ControlerUI?.refreshEnhancedSelect) {
          window.ControlerUI.refreshEnhancedSelect(periodField.select);
        }
        noteElement.textContent =
          exportType === "partition"
            ? availableSections.length
              ? `当前可导出的单分区 section：${availableSections
                  .map((section) => getPartitionSectionLabel(section.value))
                  .join("、")}。如果现在只看到“记录”，表示当前只有记录生成了月分片；项目、待办、打卡项、年度目标、日记分类和重复计划只随整包 ZIP 导出。`
              : "当前还没有任何月分片，因此这里只能导出全部分片 ZIP。"
            : "整包 ZIP 会一起带走 core、重复计划和所有月份分片，适合完整备份、换设备恢复。";
      };

      exportTypeField.select.addEventListener("change", refreshPartitionFields);
      sectionField.select.addEventListener("change", refreshPartitionFields);
      body.appendChild(exportTypeField.wrapper);
      body.appendChild(sectionField.wrapper);
      body.appendChild(periodField.wrapper);
      body.appendChild(noteElement);
      refreshPartitionFields();
    },
    onConfirm({ body, setError }) {
      const selects = body.querySelectorAll("select");
      const exportType = selects[0]?.value || "full";
      const section = selects[1]?.value || "";
      const periodId = selects[2]?.value || "";
      if (exportType === "partition" && (!section || !periodId)) {
        setError("请选择要导出的分区和月份。");
        return false;
      }
      return {
        exportType,
        section,
        periodId,
      };
    },
  });
}

async function inspectImportFile(file) {
  const externalImportHelper = getExternalImportHelper();
  const fileName = String(file?.name || file?.fileName || "").trim();
  const normalizedFileName = fileName.toLowerCase();
  const filePath =
    typeof file?.path === "string" && file.path.trim() ? file.path.trim() : "";
  const nativeImportUri =
    typeof file?.nativeImportUri === "string" && file.nativeImportUri.trim()
      ? file.nativeImportUri.trim()
      : "";
  if (!fileName) {
    throw new Error("无法识别导入文件名。");
  }
  if (
    nativeImportUri &&
    typeof window.ControlerStorage?.inspectImportSourceFile === "function"
  ) {
    const inspected = await window.ControlerStorage.inspectImportSourceFile({
      uri: nativeImportUri,
      fileName,
    });
    if (inspected && typeof inspected === "object") {
      return {
        ...inspected,
        fileName:
          typeof inspected.fileName === "string" && inspected.fileName.trim()
            ? inspected.fileName.trim()
            : fileName,
        filePath,
        nativeImportUri,
      };
    }
    throw new Error("无法检查所选导入文件。");
  }
  if (normalizedFileName.endsWith(".zip")) {
    return {
      sourceKind: "full",
      fileType: "zip-bundle",
      fileName,
      filePath,
      nativeImportUri,
      description: "已识别为全部分片 ZIP。你可以整包替换当前数据，也可以做差异导入。",
    };
  }

  const fileText = await readSettingsFileAsText(file);
  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(fileText);
  } catch (error) {
    throw new Error("所选 JSON 无法解析，请确认文件完整且格式正确。");
  }

  if (isPartitionEnvelopePayload(parsedPayload)) {
    return {
      sourceKind: "partition",
      fileType: "partition-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      section: parsedPayload.section,
      periodId: parsedPayload.periodId,
      description: `已识别为单分区 JSON，只会影响 ${getPartitionSectionLabel(
        parsedPayload.section,
      )} 的 ${parsedPayload.periodId}。`,
    };
  }

  if (
    parsedPayload &&
    typeof parsedPayload === "object" &&
    !Array.isArray(parsedPayload) &&
    Array.isArray(parsedPayload.projects) &&
    Array.isArray(parsedPayload.records)
  ) {
    return {
      sourceKind: "full",
      fileType: "legacy-full-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      description:
        "已识别为旧单文件全量 JSON。导入时会先拆成目录 bundle，再按你选择的模式写入当前数据。",
    };
  }

  const arrayCandidates =
    typeof externalImportHelper?.listArrayCandidates === "function"
      ? externalImportHelper.listArrayCandidates(parsedPayload)
      : [];
  if (arrayCandidates.length) {
    return {
      sourceKind: "external-json",
      fileType: "external-json",
      fileName,
      filePath,
      nativeImportUri,
      parsedPayload,
      arrayCandidates,
      description:
        "已识别为外部 JSON。可从根数组或首层对象数组里选择记录源，并映射项目名、时间和用时字段。",
    };
  }

  throw new Error(
    "无法识别该文件类型。当前只支持旧单文件 JSON、全部分片 ZIP、单分区 JSON，或包含根数组/首层对象数组的外部 JSON。",
  );
}

function buildExternalImportPreview(
  descriptor,
  externalConfig = {},
  currentProjects = [],
) {
  const externalImportHelper = getExternalImportHelper();
  if (
    !externalImportHelper?.normalizeExternalRecords ||
    !externalImportHelper?.reconcileProjectsByName
  ) {
    throw new Error("当前环境缺少外部 JSON 导入能力。");
  }
  const normalized = externalImportHelper.normalizeExternalRecords(
    descriptor?.parsedPayload,
    externalConfig,
  );
  const projectReconciliation = externalImportHelper.reconcileProjectsByName(
    currentProjects,
    normalized.projectNames.map((name) => ({ name })),
  );
  const mappedRecords = externalImportHelper.applyProjectMappingToRecords(
    normalized.records,
    projectReconciliation,
  );
  return {
    ...normalized,
    records: mappedRecords,
    projectReconciliation,
    matchedProjects: projectReconciliation.matchedProjects,
    createdProjects: projectReconciliation.createdProjects,
    replacedDays: normalized.affectedDates.length,
  };
}

async function showExternalImportOptionsDialog(descriptor) {
  const externalImportHelper = getExternalImportHelper();
  if (
    !externalImportHelper?.listObjectFieldKeys ||
    !externalImportHelper?.resolveArraySource
  ) {
    throw new Error("当前环境缺少外部 JSON 映射能力。");
  }

  const currentProjects = await getCurrentProjectsForImport();
  const arrayCandidates = Array.isArray(descriptor?.arrayCandidates)
    ? descriptor.arrayCandidates
    : [];
  const defaultArrayPath =
    arrayCandidates[0]?.path || externalImportHelper.ROOT_ARRAY_PATH || "$";
  const nativePreviewEnabled =
    !!descriptor?.nativeImportUri &&
    typeof window.ControlerStorage?.previewExternalImport === "function" &&
    !descriptor?.parsedPayload;
  const fieldKeysByPath =
    descriptor?.fieldKeysByPath && typeof descriptor.fieldKeysByPath === "object"
      ? descriptor.fieldKeysByPath
      : {};
  const guessedMappingByPath =
    descriptor?.guessedMappingByPath &&
    typeof descriptor.guessedMappingByPath === "object"
      ? descriptor.guessedMappingByPath
      : {};
  let latestPreview = null;
  let latestPreviewToken = 0;

  return openSettingsFormDialog({
    title: "外部 JSON 导入",
    description: `文件：${descriptor?.fileName || "未知文件"}\n请选择记录数组来源，并映射项目名、时间和用时字段。导入会按“日期”替换当天旧记录，其它日期保持不变。`,
    confirmText: "开始导入",
    width: "min(760px, calc(100vw - 32px))",
    renderBody({ body, setError }) {
      const arrayField = createSettingsSelectField({
        label: "记录数组来源",
        value: defaultArrayPath,
        options: arrayCandidates.map((candidate) => ({
          value: candidate.path,
          label: `${candidate.label} (${candidate.count || 0} 条)`,
        })),
      });
      const mappingFields = {
        projectName: createSettingsSelectField({
          label: "项目名字段",
          value: "",
          options: [{ value: "", label: "请选择字段" }],
        }),
        date: createSettingsSelectField({
          label: "日期字段",
          value: "",
          options: [{ value: "", label: "未单独提供日期" }],
        }),
        startTime: createSettingsSelectField({
          label: "开始时间字段",
          value: "",
          options: [{ value: "", label: "请选择字段" }],
        }),
        endTime: createSettingsSelectField({
          label: "结束时间字段",
          value: "",
          options: [{ value: "", label: "未提供，改用时长推导" }],
        }),
        durationMs: createSettingsSelectField({
          label: "时长毫秒字段",
          value: "",
          options: [{ value: "", label: "未提供毫秒时长" }],
        }),
        spendtime: createSettingsSelectField({
          label: "用时文本字段",
          value: "",
          options: [{ value: "", label: "未提供用时文本" }],
        }),
      };
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";
      const previewCard = document.createElement("div");
      previewCard.className = "ms";
      previewCard.style.padding = "14px";
      previewCard.style.borderRadius = "12px";
      previewCard.style.border = "1px solid var(--panel-border-color)";
      previewCard.style.background = "var(--panel-bg-color)";
      previewCard.style.color = "var(--text-color)";

      const buildFieldOptions = (fieldKeys, placeholder) => [
        { value: "", label: placeholder },
        ...fieldKeys.map((fieldKey) => ({
          value: fieldKey,
          label: fieldKey,
        })),
      ];

      const updateSelectOptions = (field, options, nextValue = "") => {
        field.select.innerHTML = "";
        options.forEach((option) => {
          const optionElement = document.createElement("option");
          optionElement.value = option.value;
          optionElement.textContent = option.label;
          field.select.appendChild(optionElement);
        });
        field.select.value = nextValue && options.some((option) => option.value === nextValue)
          ? nextValue
          : options[0]?.value || "";
        if (window.ControlerUI?.refreshEnhancedSelect) {
          window.ControlerUI.refreshEnhancedSelect(field.select);
        }
      };

      const getCurrentConfig = () => ({
        arrayPath:
          arrayField.select.value ||
          externalImportHelper.ROOT_ARRAY_PATH ||
          "$",
        mapping: {
          projectName: mappingFields.projectName.select.value || "",
          date: mappingFields.date.select.value || "",
          startTime: mappingFields.startTime.select.value || "",
          endTime: mappingFields.endTime.select.value || "",
          durationMs: mappingFields.durationMs.select.value || "",
          spendtime: mappingFields.spendtime.select.value || "",
        },
      });

      const resolveFieldKeysForPath = (arrayPath) => {
        if (nativePreviewEnabled) {
          const nativeFieldKeys = fieldKeysByPath?.[arrayPath];
          return Array.isArray(nativeFieldKeys) ? nativeFieldKeys : [];
        }
        const items = externalImportHelper.resolveArraySource(
          descriptor?.parsedPayload,
          arrayPath,
        );
        return externalImportHelper.listObjectFieldKeys(items);
      };

      const resolveGuessedMappingForPath = (arrayPath, fieldKeys) => {
        const nativeGuess =
          guessedMappingByPath?.[arrayPath] &&
          typeof guessedMappingByPath[arrayPath] === "object"
            ? guessedMappingByPath[arrayPath]
            : null;
        return nativeGuess || externalImportHelper.guessExternalMapping(fieldKeys);
      };

      const updateFieldChoices = () => {
        const arrayPath =
          arrayField.select.value || externalImportHelper.ROOT_ARRAY_PATH || "$";
        const fieldKeys = resolveFieldKeysForPath(arrayPath);
        const guessed = resolveGuessedMappingForPath(arrayPath, fieldKeys);
        updateSelectOptions(
          mappingFields.projectName,
          buildFieldOptions(fieldKeys, "请选择字段"),
          mappingFields.projectName.select.value || guessed.projectName,
        );
        updateSelectOptions(
          mappingFields.date,
          buildFieldOptions(fieldKeys, "未单独提供日期"),
          mappingFields.date.select.value || guessed.date,
        );
        updateSelectOptions(
          mappingFields.startTime,
          buildFieldOptions(fieldKeys, "请选择字段"),
          mappingFields.startTime.select.value || guessed.startTime,
        );
        updateSelectOptions(
          mappingFields.endTime,
          buildFieldOptions(fieldKeys, "未提供，改用时长推导"),
          mappingFields.endTime.select.value || guessed.endTime,
        );
        updateSelectOptions(
          mappingFields.durationMs,
          buildFieldOptions(fieldKeys, "未提供毫秒时长"),
          mappingFields.durationMs.select.value || guessed.durationMs,
        );
        updateSelectOptions(
          mappingFields.spendtime,
          buildFieldOptions(fieldKeys, "未提供用时文本"),
          mappingFields.spendtime.select.value || guessed.spendtime,
        );
      };

      const refreshPreview = async () => {
        const previewToken = ++latestPreviewToken;
        setError("");
        const config = getCurrentConfig();
        const hasProjectName = !!config.mapping.projectName;
        const hasStartTime = !!config.mapping.startTime;
        const hasEndTime = !!config.mapping.endTime;
        const hasDuration =
          !!config.mapping.durationMs || !!config.mapping.spendtime;
        noteElement.textContent =
          "支持的组合：开始时间 + 结束时间，或 开始时间 + 时长。日期字段可选；如果开始/结束字段本身已包含完整日期时间，可以留空。项目名字段必填。";

        if (!hasProjectName || !hasStartTime || (!hasEndTime && !hasDuration)) {
          latestPreview = null;
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="color: var(--muted-text-color); line-height:1.7;">
              先完成字段映射：项目名字段必填；开始时间字段必填；并且需要“结束时间字段”或任一“用时字段”。
            </div>
          `;
          return;
        }

        try {
          if (nativePreviewEnabled) {
            previewCard.innerHTML = `
              <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
              <div style="color: var(--muted-text-color); line-height:1.7;">
                正在根据当前字段映射分析文件，请稍候。
              </div>
            `;
            const preview = await window.ControlerStorage.previewExternalImport({
              uri: descriptor.nativeImportUri,
              externalConfig: config,
            });
            if (previewToken !== latestPreviewToken) {
              return;
            }
            latestPreview =
              preview && typeof preview === "object" ? preview : null;
          } else {
            latestPreview = buildExternalImportPreview(
              descriptor,
              config,
              currentProjects,
            );
          }
          if (!latestPreview || typeof latestPreview !== "object") {
            throw new Error("无法生成导入预览。");
          }
          const invalidReasonText = Object.keys(
            latestPreview.invalidReasons || {},
          ).length
            ? Object.entries(latestPreview.invalidReasons)
                .map(([reason, count]) => `${reason}: ${count}`)
                .join("；")
            : "无";
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="display:grid; gap:6px; line-height:1.7;">
              <div>可导入记录：<strong>${latestPreview.validCount || 0}</strong> / ${latestPreview.totalCount || 0}</div>
              <div>无效记录：<strong>${latestPreview.invalidCount || 0}</strong></div>
              <div>命中月份：${escapeSettingsHtml(formatImportPeriodsPreview(latestPreview.affectedPeriodIds || []))}</div>
              <div>命中日期：${escapeSettingsHtml(formatImportDatesPreview(latestPreview.affectedDates || []))}</div>
              <div>将并入已有项目：<strong>${latestPreview.matchedProjects || 0}</strong></div>
              <div>将新建项目：<strong>${latestPreview.createdProjects || 0}</strong></div>
              <div>将按天替换：<strong>${latestPreview.replacedDays || 0}</strong> 天</div>
              <div style="color: var(--muted-text-color);">无效原因统计：${escapeSettingsHtml(invalidReasonText)}</div>
            </div>
          `;
        } catch (error) {
          if (previewToken !== latestPreviewToken) {
            return;
          }
          latestPreview = null;
          previewCard.innerHTML = `
            <div style="font-weight:600; margin-bottom:8px;">导入预览</div>
            <div style="color: var(--delete-btn); line-height:1.7;">
              ${escapeSettingsHtml(error instanceof Error ? error.message : String(error || "无法生成预览"))}
            </div>
          `;
        }
      };

      body.appendChild(arrayField.wrapper);
      Object.values(mappingFields).forEach((field) => {
        body.appendChild(field.wrapper);
      });
      body.appendChild(noteElement);
      body.appendChild(previewCard);

      updateFieldChoices();
      void refreshPreview();
      arrayField.select.addEventListener("change", () => {
        updateFieldChoices();
        void refreshPreview();
      });
      Object.values(mappingFields).forEach((field) => {
        field.select.addEventListener("change", () => {
          void refreshPreview();
        });
      });
    },
    onConfirm({ body, setError }) {
      const config = {
        arrayPath: "",
        mapping: {},
      };
      const selects = body.querySelectorAll("select");
      config.arrayPath = selects[0]?.value || defaultArrayPath;
      config.mapping.projectName = selects[1]?.value || "";
      config.mapping.date = selects[2]?.value || "";
      config.mapping.startTime = selects[3]?.value || "";
      config.mapping.endTime = selects[4]?.value || "";
      config.mapping.durationMs = selects[5]?.value || "";
      config.mapping.spendtime = selects[6]?.value || "";

      if (!config.mapping.projectName) {
        setError("请选择项目名字段。");
        return false;
      }
      if (!config.mapping.startTime) {
        setError("请选择开始时间字段。");
        return false;
      }
      if (!config.mapping.endTime && !config.mapping.durationMs && !config.mapping.spendtime) {
        setError("请至少选择结束时间字段或一个用时字段。");
        return false;
      }
      if (!latestPreview || !latestPreview.validCount) {
        setError("当前映射下没有可导入的有效记录。");
        return false;
      }
      return {
        mode: "replace",
        sourceKind: "external-json",
        externalConfig: config,
        preview: {
          affectedPeriodIds: latestPreview.affectedPeriodIds.slice(),
          affectedDates: latestPreview.affectedDates.slice(),
          createdProjects: latestPreview.createdProjects,
          matchedProjects: latestPreview.matchedProjects,
          replacedDays: latestPreview.replacedDays,
          validCount: latestPreview.validCount,
          invalidCount: latestPreview.invalidCount,
        },
      };
    },
  });
}

async function showResolvedImportOptionsDialog(descriptor) {
  if (descriptor?.sourceKind === "external-json") {
    return showExternalImportOptionsDialog(descriptor);
  }
  const isFullImport =
    descriptor?.sourceKind === "full" ||
    descriptor?.fileType === "zip-bundle" ||
    descriptor?.fileType === "legacy-full-json";
  return openSettingsFormDialog({
    title: "导入数据",
    description: `文件：${descriptor?.fileName || "未知文件"}\n${descriptor?.description || ""}`,
    confirmText: "开始导入",
    renderBody({ body }) {
      const modeField = createSettingsSelectField({
        label: "导入模式",
        value: "replace",
        options: isFullImport
          ? [
              { value: "replace", label: "整包替换当前数据" },
              { value: "diff", label: "差异导入（只替换有差异的单位）" },
            ]
          : [
              { value: "replace", label: "替换该月份分区" },
              { value: "merge", label: "合并该月份分区（按 ID/自然键逐条覆盖）" },
            ],
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

      const refreshModeNote = () => {
        const mode = modeField.select.value;
        if (isFullImport) {
          noteElement.textContent =
            mode === "diff"
              ? "差异导入不会删除未导入内容。它的逻辑是：核心区按字段替换；重复计划和月分片只处理导入源里出现的内容，并按 ID/自然键逐条覆盖；未命中的旧条目会保留。"
              : "整包替换会直接用导入源重建当前 bundle。当前 bundle 中未出现在导入源里的内容会被清掉。";
          return;
        }
        noteElement.textContent =
          mode === "merge"
            ? "单分区合并只覆盖同 ID/自然键的条目，未命中的旧条目会保留。其它 section 和其它月份不受影响。"
            : "单分区替换只会替换一个 section 的一个月份，其它 section 和其它月份保持不变。";
      };

      body.appendChild(modeField.wrapper);
      body.appendChild(noteElement);
      modeField.select.addEventListener("change", refreshModeNote);
      refreshModeNote();
    },
    onConfirm({ body }) {
      const select = body.querySelector("select");
      return {
        mode: select?.value || "replace",
      };
    },
  });
}

async function showNativeImportOptionsDialog(options = {}) {
  return openSettingsFormDialog({
    title: "导入数据",
    description:
      "安卓端整包/单分区导入会先打开系统文件选择器。外部 JSON 导入会先在页面里选择 JSON 文件，再进入字段映射与预览。",
    confirmText: "继续",
    renderBody({ body }) {
      const importTypeField = createSettingsSelectField({
        label: "导入类型",
        value: options.jsonOnly ? "partition" : "full",
        options: options.jsonOnly
          ? [
              { value: "partition", label: "单分区 JSON 导入" },
              { value: "external", label: "外部 JSON 导入" },
            ]
          : [
              { value: "full", label: "整包导入（ZIP / 旧 JSON）" },
              { value: "partition", label: "单分区 JSON 导入" },
              { value: "external", label: "外部 JSON 导入" },
            ],
      });
      const fullModeField = createSettingsSelectField({
        label: "整包导入模式",
        value: "replace",
        options: [
          { value: "replace", label: "整包替换当前数据" },
          { value: "diff", label: "差异导入（只替换有差异的单位）" },
        ],
      });
      const partitionModeField = createSettingsSelectField({
        label: "单分区导入模式",
        value: "replace",
        options: [
          { value: "replace", label: "替换该月份分区" },
          { value: "merge", label: "合并该月份分区（按 ID/自然键逐条覆盖）" },
        ],
      });
      const noteElement = document.createElement("div");
      noteElement.style.fontSize = "12px";
      noteElement.style.lineHeight = "1.7";
      noteElement.style.color = "var(--muted-text-color)";

        const refreshFields = () => {
          const importType = importTypeField.select.value;
          fullModeField.wrapper.style.display = importType === "full" ? "grid" : "none";
          partitionModeField.wrapper.style.display =
            importType === "partition" ? "grid" : "none";
          noteElement.textContent =
            importType === "full"
              ? fullModeField.select.value === "diff"
                ? "差异导入不会删除未导入内容；核心区按字段替换，重复计划和月分片按 ID/自然键逐条覆盖。"
                : "整包替换会清掉当前 bundle 中未出现在导入源里的内容。"
              : importType === "partition"
                ? partitionModeField.select.value === "merge"
                  ? "单分区合并只覆盖同 ID/自然键的条目，其它内容保留。"
                  : "单分区替换只影响一个 section 的一个月份。"
                : "外部 JSON 只导入时间记录；确认后会让你选择记录数组和字段映射，并按日期替换当天旧记录。";
        };

      importTypeField.select.addEventListener("change", refreshFields);
      fullModeField.select.addEventListener("change", refreshFields);
      partitionModeField.select.addEventListener("change", refreshFields);
      body.appendChild(importTypeField.wrapper);
      body.appendChild(fullModeField.wrapper);
      body.appendChild(partitionModeField.wrapper);
      body.appendChild(noteElement);
      refreshFields();
    },
    onConfirm({ body }) {
      const selects = body.querySelectorAll("select");
      const importType = selects[0]?.value || "full";
      return {
        importType,
        mode:
          importType === "full"
            ? selects[1]?.value || "replace"
            : importType === "partition"
              ? selects[2]?.value || "replace"
              : "replace",
      };
    },
  });
}

async function refreshSettingsAfterDataImport(options = {}) {
  autoBackupCachedStatus = null;
  try {
    localStorage.removeItem(AUTO_BACKUP_STATUS_CACHE_KEY);
  } catch (error) {
    console.error("清理自动备份缓存失败:", error);
  }
  updateStorageStatus();
  updateStoragePathInfo();
  renderNavigationVisibilitySettings();
  if (options.reload !== false) {
    window.location.reload();
  }
}

async function importPartitionEnvelopePayload(parsedPayload, options = {}) {
  const bundleStorage = getSettingsStorageBundle();
  if (!isPartitionEnvelopePayload(parsedPayload)) {
    throw new Error("所选文件不是单分区 JSON。");
  }
  if (
    !bundleStorage?.validateItemsForPeriod?.(
      parsedPayload.section,
      parsedPayload.periodId,
      parsedPayload.items,
    )
  ) {
    throw new Error("分区文件中的项目与声明的月份不一致，已拒绝导入。");
  }

  if (typeof window.ControlerStorage?.saveSectionRange === "function") {
    if (
      typeof options.filePath === "string" &&
      options.filePath &&
      !!window.electronAPI?.isElectron &&
      typeof window.ControlerStorage?.importSource === "function"
    ) {
      await window.ControlerStorage.importSource({
        filePath: options.filePath,
        mode: options.mode === "merge" ? "merge" : "replace",
      });
      return;
    }

    await window.ControlerStorage.saveSectionRange(parsedPayload.section, {
      periodId: parsedPayload.periodId,
      items: parsedPayload.items,
      mode: options.mode === "merge" ? "merge" : "replace",
    });
    await flushStorageWrites();
    return;
  }

  const bundleHelper = getSettingsStorageBundle();
  if (!bundleHelper?.mergePartitionItems || !bundleHelper?.getPeriodIdForSectionItem) {
    throw new Error("当前环境不支持单分区导入。");
  }

  const section = parsedPayload.section;
  const existingItems =
    section === "plans"
      ? JSON.parse(localStorage.getItem("plans") || "[]").filter(
          (item) => String(item?.repeat || "").trim().toLowerCase() === "none",
        )
      : JSON.parse(localStorage.getItem(section) || "[]");
  const recurringPlans =
    section === "plans"
      ? JSON.parse(localStorage.getItem("plans") || "[]").filter(
          (item) => String(item?.repeat || "").trim().toLowerCase() !== "none",
        )
      : [];
  const remainingItems = existingItems.filter(
    (item) =>
      bundleHelper.getPeriodIdForSectionItem(section, item) !== parsedPayload.periodId,
  );
  const currentPartitionItems = existingItems.filter(
    (item) =>
      bundleHelper.getPeriodIdForSectionItem(section, item) === parsedPayload.periodId,
  );
  const mergedItems = bundleHelper.mergePartitionItems(
    section,
    currentPartitionItems,
    parsedPayload.items,
    options.mode === "merge" ? "merge" : "replace",
  );
  localStorage.setItem(
    section,
    JSON.stringify(
      section === "plans"
        ? [...remainingItems, ...mergedItems, ...recurringPlans]
        : [...remainingItems, ...mergedItems],
    ),
  );
  await flushStorageWrites();
}

async function exportData() {
  try {
    const exportOptions = await showExportOptionsDialog(
      await getSettingsBundleManifest(),
    );
    if (!exportOptions) {
      return;
    }

    const supportsBundleExport =
      typeof window.ControlerStorage?.exportBundle === "function";
    const exportOutcome = await runWithSettingsBusyState(
      {
        title: "正在准备导出",
        message: "正在整理导出数据并准备文件，请稍候。导出完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        if (exportOptions.exportType === "partition") {
          if (supportsBundleExport) {
            const result = await window.ControlerStorage.exportBundle({
              type: "partition",
              section: exportOptions.section,
              periodId: exportOptions.periodId,
            });
            if (!result) {
              return null;
            }
          } else {
            const envelope = await buildPartitionEnvelopeForExport(
              exportOptions.section,
              exportOptions.periodId,
            );
            const fileName = buildPartitionFileName(
              exportOptions.section,
              exportOptions.periodId,
            );

            if (
              window.ControlerStorage?.isNativeApp &&
              window.ControlerNativeBridge?.isReactNativeApp
            ) {
              const result = await window.ControlerNativeBridge.call(
                "settings.exportData",
                {
                  state: envelope,
                  fileName,
                },
              );
              if (!result?.ok) {
                throw new Error(result?.message || "导出失败");
              }
            } else {
              downloadJsonFile(envelope, fileName);
            }
          }

          return {
            title: "导出成功",
            message: "单分区 JSON 已导出。",
          };
        }

        if (supportsBundleExport) {
          const result = await window.ControlerStorage.exportBundle({
            type: "full",
          });
          if (!result) {
            return null;
          }
          return {
            title: "导出成功",
            message: "全部分片 ZIP 已导出。",
          };
        }

        const data = await buildBundleAwareBackupPayload();
        const fileName = `time-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        if (
          window.ControlerStorage?.isNativeApp &&
          window.ControlerNativeBridge?.isReactNativeApp
        ) {
          const result = await window.ControlerNativeBridge.call(
            "settings.exportData",
            {
              state: data,
              fileName,
            },
          );
          if (!result?.ok) {
            throw new Error(result?.message || "导出失败");
          }
          return {
            title: "导出成功",
            message: "已打开导出分享面板，请选择保存位置或分享应用。",
          };
        }

        downloadJsonFile(data, fileName);
        return {
          title: "导出成功",
          message: "整包 JSON 已导出。",
        };
      },
    );

    if (exportOutcome?.message) {
      await showSettingsAlert(exportOutcome.message, {
        title: exportOutcome.title || "导出成功",
      });
    }
  } catch (e) {
    console.error("导出数据失败:", e);
    await showSettingsAlert("导出数据失败，请重试。", {
      title: "导出失败",
      danger: true,
    });
  }
}

function buildImportSuccessMessage(descriptor, mode, result = null) {
  if (descriptor?.sourceKind === "external-json") {
    const preview =
      result && typeof result === "object"
        ? result
        : descriptor?.preview && typeof descriptor.preview === "object"
          ? descriptor.preview
          : {};
    const importedCount =
      Number.isFinite(preview.importedCount) && preview.importedCount >= 0
        ? preview.importedCount
        : Number.isFinite(preview.validCount) && preview.validCount >= 0
          ? preview.validCount
          : 0;
    return `外部 JSON 导入已完成。已导入 ${importedCount} 条记录，按日期替换 ${preview.replacedDays || 0} 天，新增项目 ${preview.createdProjects || 0} 个，并入已有项目 ${preview.matchedProjects || 0} 个。页面将刷新以载入最新状态。`;
  }
  if (descriptor?.sourceKind === "partition") {
    return mode === "merge"
      ? "单分区合并导入已完成。页面将刷新以载入最新状态。"
      : "单分区替换导入已完成。页面将刷新以载入最新状态。";
  }
  return mode === "diff"
    ? "差异导入已完成。未导入的内容会保留，页面将刷新以载入最新状态。"
    : "整包替换已完成。当前 bundle 已按导入源重建，页面将刷新以载入最新状态。";
}

async function importExternalJsonDescriptor(descriptor, choice = {}) {
  const externalImportHelper = getExternalImportHelper();
  const externalConfig =
    choice?.externalConfig && typeof choice.externalConfig === "object"
      ? choice.externalConfig
      : null;
  if (!externalConfig) {
    throw new Error("缺少外部 JSON 映射配置。");
  }

  if (
    !!descriptor?.nativeImportUri &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
      filePath: descriptor?.filePath || "",
      uri: descriptor.nativeImportUri,
      externalConfig,
      conflictUnit:
        externalImportHelper.DEFAULT_CONFLICT_UNIT || "day",
      projectMapping:
        externalImportHelper.DEFAULT_PROJECT_MAPPING || "name-first",
    });
  }

  const bundleHelper = getSettingsStorageBundle();
  if (
    !externalImportHelper?.mergeRecordsByReplacingDays ||
    !bundleHelper?.getPeriodIdForSectionItem
  ) {
    throw new Error("当前环境不支持外部 JSON 导入。");
  }

  const preview = buildExternalImportPreview(
    descriptor,
    externalConfig,
    await getCurrentProjectsForImport(),
  );
  if (!preview.validCount || !preview.records.length) {
    throw new Error("当前映射下没有可导入的有效记录。");
  }

  if (
    !!window.electronAPI?.isElectron &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
      filePath: descriptor?.filePath || "",
      payload: descriptor?.parsedPayload,
      externalConfig,
      conflictUnit:
        externalImportHelper.DEFAULT_CONFLICT_UNIT || "day",
      projectMapping:
        externalImportHelper.DEFAULT_PROJECT_MAPPING || "name-first",
    });
  }

  if (
    typeof window.ControlerStorage?.loadSectionRange === "function" &&
    typeof window.ControlerStorage?.saveSectionRange === "function"
  ) {
    for (const periodId of preview.affectedPeriodIds) {
      const range = await window.ControlerStorage.loadSectionRange("records", {
        periodIds: [periodId],
      });
      const existingItems = Array.isArray(range?.items) ? range.items : [];
      const incomingItems = preview.records.filter(
        (record) =>
          bundleHelper.getPeriodIdForSectionItem("records", record) === periodId,
      );
      const merged = externalImportHelper.mergeRecordsByReplacingDays(
        existingItems,
        incomingItems,
      );
      await window.ControlerStorage.saveSectionRange("records", {
        periodId,
        items: merged.records,
        mode: "replace",
      });
    }
  } else {
    const existingRecords = JSON.parse(localStorage.getItem("records") || "[]");
    const merged = externalImportHelper.mergeRecordsByReplacingDays(
      existingRecords,
      preview.records,
    );
    localStorage.setItem("records", JSON.stringify(merged.records));
  }

  await flushStorageWrites();

  const authoritativeRecords = await loadAllRecordsForImportRepair(preview.records);
  const repairedProjects = rebuildImportedProjectDurationCaches(
    preview.projectReconciliation.projects,
    authoritativeRecords,
  );

  if (typeof window.ControlerStorage?.replaceCoreState === "function") {
    await window.ControlerStorage.replaceCoreState({
      projects: repairedProjects,
    });
  } else {
    localStorage.setItem("projects", JSON.stringify(repairedProjects));
  }

  await flushStorageWrites();

  return {
    ok: true,
    type: "external-json",
    sourceKind: externalImportHelper.SOURCE_KIND || "external-json",
    changedSections:
      preview.createdProjects > 0 ? ["core", "records"] : ["records"],
    changedPeriods: {
      records: preview.affectedPeriodIds.slice(),
    },
    affectedPeriodIds: preview.affectedPeriodIds.slice(),
    affectedDates: preview.affectedDates.slice(),
    createdProjects: preview.createdProjects,
    matchedProjects: preview.matchedProjects,
    replacedDays: preview.replacedDays,
    importedCount: preview.validCount,
    invalidCount: preview.invalidCount,
  };
}

async function importDetectedFile(descriptor, choice = {}) {
  const mode = String(choice?.mode || "").trim() || "replace";
  const filePath =
    typeof descriptor?.filePath === "string" ? descriptor.filePath.trim() : "";
  const nativeImportUri =
    typeof descriptor?.nativeImportUri === "string"
      ? descriptor.nativeImportUri.trim()
      : "";

  if (descriptor?.sourceKind === "external-json") {
    return importExternalJsonDescriptor(descriptor, choice);
  }

  if (descriptor?.sourceKind === "partition") {
    await importPartitionEnvelopePayload(descriptor.parsedPayload, {
      filePath,
      mode,
    });
    return null;
  }

  if (
    (filePath || nativeImportUri) &&
    typeof window.ControlerStorage?.importSource === "function"
  ) {
    return window.ControlerStorage.importSource({
      filePath,
      uri: nativeImportUri,
      mode,
    });
  }

  if (descriptor?.fileType !== "legacy-full-json") {
    throw new Error("当前环境仅支持在桌面端导入 ZIP 整包。");
  }
  if (mode !== "replace") {
    throw new Error("当前环境暂不支持无文件路径的整包差异导入。");
  }

  const importedState = normalizeImportedBackupPayload(descriptor.parsedPayload);
  if (typeof window.ControlerStorage?.replaceAll !== "function") {
    throw new Error("当前环境不支持完整导入。");
  }

  window.ControlerStorage.replaceAll(importedState);
  await flushStorageWrites();
  syncThemeCatalog();
  applyTheme(importedState.selectedTheme);
  return null;
}

async function importData(options = {}) {
  const nativeBundleImport =
    window.ControlerStorage?.isNativeApp &&
    typeof window.ControlerStorage?.importSource === "function";
  const canPreselectNativeImportFile =
    nativeBundleImport &&
    typeof window.ControlerStorage?.pickImportSourceFile === "function";

  if (nativeBundleImport) {
    try {
      const importOptions = await showNativeImportOptionsDialog(options);
      if (!importOptions) {
        return;
      }
      if (importOptions.importType === "external") {
        const file = await promptSettingsFileSelection(".json", {
          title: "正在导入数据",
          message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
        });
        if (!file) {
          return;
        }
        const descriptor = await runWithSettingsBusyState(
          {
            title: "正在准备导入",
            message: "正在读取所选文件并分析可导入内容，请稍候。导入开始前请不要离开当前页面。",
            delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
          },
          async () => inspectImportFile(file),
        );
        const choice = await showResolvedImportOptionsDialog(descriptor);
        if (!choice) {
          return;
        }
        const result = await runWithSettingsBusyState(
          {
            title: "正在导入数据",
            message: "正在写入导入内容并刷新数据索引，请稍候。导入完成前请不要离开当前页面。",
            delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
          },
          async () => importDetectedFile(descriptor, choice),
        );
        await showSettingsAlert(
          buildImportSuccessMessage(
            {
              ...descriptor,
              preview:
                choice?.preview && typeof choice.preview === "object"
                  ? choice.preview
                  : descriptor?.preview,
            },
            choice.mode,
            result,
          ),
          {
            title: "导入成功",
          },
        );
        await refreshSettingsAfterDataImport();
        return;
      }
      const accept =
        importOptions.importType === "partition" || options.jsonOnly
          ? "json"
          : "auto";
      const result = await runWithSettingsBusyState(
        {
          title: "正在导入数据",
          message: "正在准备文件并导入数据，请稍候。导入完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () => {
          if (!canPreselectNativeImportFile) {
            return window.ControlerStorage.importSource({
              type: importOptions.importType,
              mode: importOptions.mode,
              accept,
            });
          }

          const file = await promptSettingsFileSelection(
            accept === "json" ? ".json" : ".json,.zip",
            {
              title: "正在导入数据",
              message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
            },
          );
          if (!file) {
            return null;
          }

          return window.ControlerStorage.importSource({
            type: importOptions.importType,
            mode: importOptions.mode,
            accept,
            filePath: file?.path || "",
            uri: file?.nativeImportUri || "",
          });
        },
      );
      if (result === null) {
        return;
      }
      if (!result || typeof result !== "object") {
        throw new Error("导入未返回结果，请重试。");
      }
      await showSettingsAlert(
        buildImportSuccessMessage(
          {
            sourceKind: result?.type === "partition" ? "partition" : "full",
          },
          result?.mode || importOptions.mode,
          result,
        ),
        {
          title: "导入成功",
        },
      );
      await refreshSettingsAfterDataImport();
      return;
    } catch (e) {
      console.error("导入数据失败:", e);
      await showSettingsAlert(
        e instanceof Error && e.message
          ? e.message
          : "导入数据失败，请确保文件格式正确。",
        {
          title: "导入失败",
          danger: true,
        },
      );
      return;
    }
  }

  const file = await promptSettingsFileSelection(
    options.jsonOnly ? ".json" : ".json,.zip",
    {
      title: "正在导入数据",
      message: "已选择文件，正在准备导入，请稍候。导入完成前请不要离开当前页面。",
    },
  );
  if (!file) {
    return;
  }

  try {
    const descriptor = await runWithSettingsBusyState(
      {
        title: "正在准备导入",
        message: "正在读取所选文件并分析可导入内容，请稍候。导入开始前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => inspectImportFile(file),
    );
    if (options.jsonOnly && descriptor.fileType === "zip-bundle") {
      throw new Error("当前入口只允许选择 JSON 文件。");
    }
    const choice = await showResolvedImportOptionsDialog(descriptor);
    if (!choice) {
      return;
    }

    const result = await runWithSettingsBusyState(
      {
        title: "正在导入数据",
        message: "正在写入导入内容并刷新数据索引，请稍候。导入完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => importDetectedFile(descriptor, choice),
    );
    await showSettingsAlert(
      buildImportSuccessMessage(
        {
          ...descriptor,
          preview:
            choice?.preview && typeof choice.preview === "object"
              ? choice.preview
              : descriptor?.preview,
        },
        choice.mode,
        result,
      ),
      {
        title: "导入成功",
      },
    );
    await refreshSettingsAfterDataImport();
  } catch (e) {
    console.error("导入数据失败:", e);
    await showSettingsAlert(
      e instanceof Error && e.message
        ? e.message
        : "导入数据失败，请确保文件格式正确。",
      {
        title: "导入失败",
        danger: true,
      },
    );
  }
}

// 清除所有数据（支持预览模式）
function clearAllData() {
  void showClearDataPreview();
}

// 显示清除数据预览
async function showClearDataPreview() {
  const modal = document.getElementById("clear-data-preview-modal");
  const previewList = document.getElementById("preview-data-list");
  const previewCancelBtn = document.getElementById("preview-cancel");
  const previewConfirmBtn = document.getElementById("preview-confirm");

  if (!modal || !previewList) {
    // 如果没有预览模态框，使用传统的确认方式
    const confirmationMessage = await buildClearDataConfirmationMessage(
      "确定要清除所有数据吗？此操作不可撤销！",
    );
    const confirmed = await requestSettingsConfirmation(
      confirmationMessage,
      {
        title: "清除所有数据",
        confirmText: "确认清除",
        cancelText: "取消",
        danger: true,
      },
    );
    if (confirmed) {
      void performClearData();
    }
    return;
  }

  if (previewCancelBtn) {
    previewCancelBtn.onclick = () => {
      hideSettingsModal(modal);
    };
  }

  if (previewConfirmBtn) {
    previewConfirmBtn.onclick = () => {
      void performClearData();
    };
  }

  // 清空预览列表
  previewList.innerHTML = "";

  try {
    const storageStatus = await getStorageStatusSnapshot();
    const clearTargetMessage = await buildClearDataTargetMessage();

    // 收集要清除的数据信息
    const dataToClear = [];

    // 遍历localStorage中的所有键
    getStorageEntries().forEach(([key, value]) => {
      let displayValue = value;

      // 如果是JSON数据，尝试解析以显示更友好的信息
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          displayValue = `数组，包含 ${parsed.length} 个元素`;
        } else if (typeof parsed === "object") {
          displayValue = `对象，包含 ${Object.keys(parsed).length} 个属性`;
        }
      } catch (e) {
        // 如果不是JSON，保持原样
      }

      dataToClear.push({
        key,
        value: displayValue,
        size: key.length + value.length,
      });
    });

    if (dataToClear.length === 0) {
      previewList.innerHTML =
        '<div class="settings-preview-empty">没有可清除的数据</div>';
    } else {
      // 按大小排序
      dataToClear.sort((a, b) => b.size - a.size);

      if (clearTargetMessage) {
        const targetElement = document.createElement("div");
        targetElement.className = "settings-preview-tip";
        targetElement.textContent = clearTargetMessage.replace(/\n/g, " ");
        previewList.appendChild(targetElement);
      }

      if (window.ControlerStorage?.isNativeApp) {
        const tipElement = document.createElement("div");
        tipElement.className = "settings-preview-tip";
        tipElement.textContent =
          storageStatus?.isCustomPath
            ? "当前清除会同步写回已绑定的外部文件或目录。"
            : "当前为移动端应用私有数据目录，清除后会立即同步到本机数据文件。";
        previewList.appendChild(tipElement);
      }

      // 添加到预览列表
      dataToClear.forEach((item) => {
        const itemElement = document.createElement("div");
        itemElement.className = "settings-preview-item";

        itemElement.innerHTML = `
          <div class="settings-preview-item-key">${item.key}</div>
          <div class="settings-preview-item-value">${item.value}</div>
          <div class="settings-preview-item-size">大小: ${item.size} 字节</div>
        `;

        previewList.appendChild(itemElement);
      });

      // 添加总计
      const totalSize = dataToClear.reduce((sum, item) => sum + item.size, 0);
      const totalElement = document.createElement("div");
      totalElement.className = "settings-preview-total";
      totalElement.innerHTML = `总计: ${dataToClear.length} 项数据，${totalSize} 字节`;

      previewList.appendChild(totalElement);
    }

    // 显示模态框
    showSettingsModal(modal);
  } catch (e) {
    console.error("准备预览数据失败:", e);
    // 出错时回退到传统确认
    const confirmationMessage = await buildClearDataConfirmationMessage(
      "预览失败，确定要清除所有数据吗？此操作不可撤销！",
    );
    const confirmed = await requestSettingsConfirmation(
      confirmationMessage,
      {
        title: "清除所有数据",
        confirmText: "确认清除",
        cancelText: "取消",
        danger: true,
      },
    );
    if (confirmed) {
      void performClearData();
    }
  }
}

// 执行实际的数据清除
async function performClearData() {
  try {
    // 清除所有数据
    if (typeof window.ControlerStorage?.clear === "function") {
      window.ControlerStorage.clear();
    } else {
      localStorage.clear();
    }

    await flushStorageWrites();

    syncThemeCatalog();
    applyTheme("obsidian-mono");
    updateStorageStatus();
    updateStoragePathInfo();
    renderNavigationVisibilitySettings();
    await renderWidgetSettingsPanel();

    // 关闭预览模态框（如果存在）
    const modal = document.getElementById("clear-data-preview-modal");
    if (modal) {
      hideSettingsModal(modal);
    }

    await showSettingsAlert("所有数据已清除，并恢复为引导版空白状态。页面将自动刷新。", {
      title: "清除完成",
    });

    // 等待1秒后刷新页面
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (e) {
    console.error("清除数据失败:", e);
    await showSettingsAlert("清除数据失败，请重试。", {
      title: "清除失败",
      danger: true,
    });
  }
}

// 显示存储路径信息
function showStoragePath() {
  const pathInfo = document.getElementById("storage-path-info");
  if (!pathInfo) return;

  // 切换显示状态
  const isVisible = pathInfo.style.display !== "none";
  pathInfo.style.display = isVisible ? "none" : "block";

  if (!isVisible) {
    // 检查是否在Electron环境中
    if (window.electronAPI && window.electronAPI.isElectron) {
      // 在Electron环境中，打开存储文件夹
      window.electronAPI
        .storageStatus()
        .then((status) => {
          if (status && status.storagePath) {
            const storageDir =
              status.storageDirectory ||
              (status.isCustomPath ? status.storagePath : status.userDataPath);

            // 打开文件夹
            window.electronAPI.shellOpenPath(storageDir).then((success) => {
              if (success) {
                pathInfo.innerHTML = `
                <p style="color: var(--accent-color); margin-bottom: 5px;">
                  ✅ 已打开存储文件夹
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px;">
                  路径: ${storageDir}
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  如果文件夹没有自动打开，请手动访问以上路径
                </p>
              `;
              } else {
                pathInfo.innerHTML = `
                <p style="color: var(--delete-btn); margin-bottom: 5px;">
                  ❌ 无法打开存储文件夹
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  路径: ${storageDir}
                </p>
                <p style="font-size: 12px; color: var(--muted-text-color);">
                  请手动访问以上路径
                </p>
              `;
              }
            });
          } else {
            // 获取状态失败，显示错误
            pathInfo.innerHTML = `
            <p style="color: var(--delete-btn); margin-bottom: 5px;">
              ❌ 无法获取存储路径信息
            </p>
          `;
          }
        })
        .catch((error) => {
          console.error("获取存储状态失败:", error);
          pathInfo.innerHTML = `
          <p style="color: var(--delete-btn); margin-bottom: 5px;">
            ❌ 获取存储状态失败: ${error.message}
          </p>
        `;
        });
    } else if (
      window.ControlerStorage?.isNativeApp &&
      typeof window.ControlerStorage.getStorageStatus === "function"
    ) {
      window.ControlerStorage.getStorageStatus()
        .then((status) => {
          const pathPresentation = resolveStoragePathPresentation(status);
          const displayPath = pathPresentation.displayPath;
          const displayLabel = pathPresentation.displayLabel;
          const displayDirectory = pathPresentation.displayDirectory;
          if (!displayPath) {
            pathInfo.innerHTML = `
              <p style="color: var(--delete-btn); margin-bottom: 5px;">
                ❌ 无法获取移动端存储路径信息
              </p>
            `;
            return;
          }

          pathInfo.innerHTML = `
            <p style="color: var(--accent-color); margin-bottom: 5px;">
              ✅ 当前同步目标 bundle
            </p>
            <p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">
              manifest: ${displayPath}
            </p>
            ${
              displayDirectory
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">bundle 根目录: ${displayDirectory}</p>`
                : ""
            }
            ${
              displayLabel && displayLabel !== displayPath
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">显示名称: ${displayLabel}</p>`
                : ""
            }
            ${
              pathPresentation.note
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px;">${pathPresentation.note}</p>`
                : ""
            }
            ${
              pathPresentation.rawPath &&
              pathPresentation.rawPath !== displayPath
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">原始路径: ${pathPresentation.rawPath}</p>`
                : ""
            }
            ${
              pathPresentation.rawDirectory &&
              pathPresentation.rawDirectory !== displayDirectory
                ? `<p style="font-size: 12px; color: var(--muted-text-color); margin-bottom: 5px; word-break: break-all;">原始目录: ${pathPresentation.rawDirectory}</p>`
                : ""
            }
            <p style="font-size: 12px; color: var(--muted-text-color);">
              Android 端实时存储已经是目录 bundle。若要更换实时存储位置，请使用“选择存储目录”；JSON 文件只通过“导入数据”进入。
            </p>
          `;
        })
        .catch((error) => {
          console.error("获取移动端存储状态失败:", error);
          pathInfo.innerHTML = `
            <p style="color: var(--delete-btn); margin-bottom: 5px;">
              ❌ 获取移动端存储状态失败: ${error.message || error}
            </p>
          `;
        });
    } else {
      // 在浏览器环境中，显示控制台信息
      // 在控制台中显示详细的存储信息
      console.log("=== 时间跟踪器 - 存储数据路径信息 ===");
      console.log("当前页面URL:", window.location.href);
      console.log("浏览器:", navigator.userAgent);
      console.log("localStorage 容量:", "通常为 5-10MB，取决于浏览器");
      console.log("");
      console.log("当前存储的键值对:");

      try {
        getStorageEntries().forEach(([key, value], index) => {
          console.log(
            `[${index + 1}] ${key}:`,
            value.substring(0, 100) + (value.length > 100 ? "..." : ""),
          );
        });

        console.log("");
        console.log("如何访问存储数据:");
        console.log("1. 按 F12 打开开发者工具");
        console.log("2. 切换到 'Application' 或 'Storage' 标签页");
        console.log("3. 在左侧面板中找到 'Local Storage'");
        console.log("4. 点击当前网站的域名");
        console.log("5. 右侧将显示所有存储的键值对");
        console.log("========================");
      } catch (e) {
        console.error("无法读取存储数据:", e);
      }

      // 尝试打开开发者工具（某些浏览器支持此功能）
      try {
        if (typeof console !== "undefined" && console.table) {
          const storageData = {};
          getStorageEntries().forEach(([key, value]) => {
            storageData[key] =
              value.length > 50 ? value.substring(0, 50) + "..." : value;
          });
          console.table(storageData);
        }
      } catch (e) {
        // 忽略错误
      }

      pathInfo.innerHTML = `
        <p style="color: var(--text-color); margin-bottom: 5px;">
          存储路径信息已在浏览器控制台中显示。
        </p>
        <p style="font-size: 12px; color: var(--muted-text-color);">
          要查看实际存储数据，请在浏览器中打开开发者工具(F12)，然后查看"Application"或"Storage"选项卡中的"Local Storage"。
        </p>
      `;
    }
  }
}

// 更新存储路径信息显示
function updateStoragePathInfo() {
  const currentPathElement = document.getElementById("current-storage-path");
  const currentDirectoryElement = document.getElementById(
    "current-storage-directory",
  );
  const pathTypeElement = document.getElementById("storage-path-type");

  if (!currentPathElement || !currentDirectoryElement || !pathTypeElement) return;

  // 检查是否在Electron环境中
  if (window.electronAPI && window.electronAPI.isElectron) {
    // 在Electron环境中，获取存储状态
    window.electronAPI
      .storageStatus()
      .then((status) => {
        if (status) {
          currentPathElement.textContent =
            resolveStorageDisplayPath(status) || "未知";
          currentDirectoryElement.textContent =
            status?.storageDirectory || "未知";
          pathTypeElement.textContent =
            status?.isCustomPath ? "自定义目录 bundle" : "默认目录 bundle";
        } else {
          currentPathElement.textContent = "获取失败";
          currentDirectoryElement.textContent = "获取失败";
          pathTypeElement.textContent = "未知";
        }
      })
      .catch((error) => {
        console.error("获取存储状态失败:", error);
        currentPathElement.textContent = "获取失败";
        currentDirectoryElement.textContent = "获取失败";
        pathTypeElement.textContent = "未知";
      });
  } else if (
    window.ControlerStorage?.isNativeApp &&
    typeof window.ControlerStorage.getStorageStatus === "function"
  ) {
    window.ControlerStorage.getStorageStatus()
      .then((status) => {
        const pathPresentation = resolveStoragePathPresentation(status);
        const displayPath = pathPresentation.displayPath;
        currentPathElement.textContent = displayPath || "获取失败";
        currentDirectoryElement.textContent =
          pathPresentation.displayDirectory || "获取失败";
        pathTypeElement.textContent = displayPath
          ? status?.isCustomPath
            ? "已绑定外部目录 bundle"
            : pathPresentation.note
              ? "应用默认目录 bundle（应用私有目录）"
              : "应用默认目录 bundle"
          : "未知";
      })
      .catch((error) => {
        console.error("获取移动端存储状态失败:", error);
        currentPathElement.textContent = "获取失败";
        currentDirectoryElement.textContent = "获取失败";
        pathTypeElement.textContent = "未知";
      });
  } else {
    // 在浏览器环境中，显示localStorage信息
    currentPathElement.textContent = "browser://localStorage/bundle-manifest.json";
    currentDirectoryElement.textContent = "browser://localStorage";
    pathTypeElement.textContent = "浏览器内置目录 bundle";
  }
}

async function changeStorageDirectory() {
  if (window.ControlerStorage?.isNativeApp) {
    if (typeof window.ControlerStorage.selectStorageDirectory !== "function") {
      void showSettingsAlert("当前移动端版本暂不支持选择同步目录。", {
        title: "当前环境不可用",
        danger: true,
      });
      return;
    }

    try {
      const status = await runWithSettingsBusyState(
        {
          title: "正在选择存储目录",
          message:
            "正在打开目录选择并准备迁移数据，请稍候。完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () => window.ControlerStorage.selectStorageDirectory(),
      );
      if (!status) {
        return;
      }
      updateStoragePathInfo();
      updateStorageStatus();
      await showSettingsAlert(
        buildStorageSwitchSuccessMessage(status, {
          targetType: "directory",
        }),
        {
          title: "迁移成功",
        },
      );
      window.location.reload();
    } catch (error) {
      console.error("选择移动端同步目录失败:", error);
      await showSettingsAlert(
        `选择同步目录失败，请重试。\n${error.message || error}`,
        {
          title: "选择失败",
          danger: true,
        },
      );
    }
    return;
  }

  if (!window.electronAPI || !window.electronAPI.isElectron) {
    void showSettingsAlert("在浏览器环境中无法更改存储目录，此功能仅在桌面端或移动端应用中可用。", {
      title: "当前环境不可用",
      danger: true,
    });
    return;
  }

  try {
    const result = await runWithSettingsBusyState(
      {
        title: "正在选择存储目录",
        message:
          "正在打开目录选择并准备迁移数据，请稍候。完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => {
        const selectedPath = await window.electronAPI.dialogSelectFolder();
        if (!selectedPath) {
          return null;
        }
        const nextStatus =
          await window.electronAPI.storageSetDirectory(selectedPath);
        return {
          selectedPath,
          status: nextStatus,
        };
      },
    );
    if (!result?.selectedPath || !result?.status) {
      return;
    }
    updateStoragePathInfo();
    updateStorageStatus();
    await showSettingsAlert(
      buildStorageSwitchSuccessMessage(result.status, {
        targetType: "directory",
      }),
      {
        title: "迁移成功",
      },
    );
    window.location.reload();
  } catch (error) {
    console.error("选择存储目录失败:", error);
    await showSettingsAlert(`选择存储目录失败，请重试。\n${error.message || error}`, {
      title: "选择失败",
      danger: true,
    });
  }
}

// 重置存储路径为默认
async function resetStoragePath() {
  if (window.ControlerStorage?.isNativeApp) {
    if (typeof window.ControlerStorage.resetStorageFile !== "function") {
      void showSettingsAlert("当前移动端版本暂不支持重置同步 bundle 目录。", {
        title: "当前环境不可用",
        danger: true,
      });
      return;
    }

    const confirmed = await requestSettingsConfirmation("确定要重置为应用默认 bundle 目录吗？", {
      title: "重置同步目录",
      confirmText: "重置",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const status = await runWithSettingsBusyState(
        {
          title: "正在重置存储目录",
          message:
            "正在切回应用默认 bundle 目录并准备重新载入数据，请稍候。完成前请不要离开当前页面。",
          delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
        },
        async () => window.ControlerStorage.resetStorageFile(),
      );
      updateStoragePathInfo();
      updateStorageStatus();
      await showSettingsAlert(
        `已重置为默认 bundle 目录：\n${resolveStorageDisplayPath(status) || "默认目录"}\n\n页面将刷新一次以重新载入当前数据。`,
        {
          title: "重置成功",
        },
      );
      window.setTimeout(() => {
        window.location.reload();
      }, 120);
    } catch (error) {
      console.error("重置移动端同步文件失败:", error);
      await showSettingsAlert(
        `重置同步 bundle 目录失败，请重试。\n${error.message || error}`,
        {
          title: "重置失败",
          danger: true,
        },
      );
    }
    return;
  }

  // 检查是否在Electron环境中
  if (!window.electronAPI || !window.electronAPI.isElectron) {
    void showSettingsAlert(
      "在浏览器环境中无法重置存储路径，此功能仅在 Electron 应用中可用。",
      {
        title: "当前环境不可用",
        danger: true,
      },
    );
    return;
  }

  const confirmed = await requestSettingsConfirmation("确定要重置为默认 bundle 目录吗？", {
    title: "重置同步目录",
    confirmText: "重置",
    cancelText: "取消",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  try {
    const status = await runWithSettingsBusyState(
      {
        title: "正在重置存储目录",
        message:
          "正在切回默认 bundle 目录并准备重新载入数据，请稍候。完成前请不要离开当前页面。",
        delayMs: SETTINGS_BUSY_OVERLAY_DELAY_MS,
      },
      async () => window.electronAPI.storageResetDirectory(),
    );
    updateStoragePathInfo();
    updateStorageStatus();
    await showSettingsAlert(
      `已重置为默认 bundle 目录：\n${resolveStorageDisplayPath(status) || "默认目录"}\n\n页面将刷新一次以重新载入默认目录中的数据。`,
      {
        title: "重置成功",
      },
    );
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  } catch (error) {
    console.error("重置存储路径失败:", error);
    await showSettingsAlert(
      `重置同步 bundle 目录失败，请重试。\n${error.message || error}`,
      {
        title: "重置失败",
        danger: true,
      },
    );
  }
}

function bindSettingsMobileDragScroll() {
  if (!window.ControlerUI?.bindVerticalDragScroll) {
    return;
  }

  const isAndroidNative =
    document.documentElement.classList.contains("controler-android-native") ||
    document.body?.classList.contains("controler-android-native");
  if (isAndroidNative) {
    return;
  }
  const isEnabled = () => window.innerWidth <= 690;
  const ignoreSelector =
    "button, input, select, textarea, a, label, .tree-select, .tree-select *, .modal-content, .modal-content *";

  document
    .querySelectorAll(".settings-main, #preview-data-list")
    .forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      window.ControlerUI.bindVerticalDragScroll(element, {
        enabled: isEnabled,
        ignoreSelector,
        pressDelay: 160,
      });
    });
}

function bindSettingsAndroidExpandedPageScrollProxy() {
  const isAndroidNative =
    document.documentElement.classList.contains("controler-android-native") ||
    document.body?.classList.contains("controler-android-native");
  if (!isAndroidNative) {
    return;
  }

  const root = document.querySelector(".settings-main");
  if (
    !(root instanceof HTMLElement) ||
    root.dataset.settingsAndroidExpandedScrollProxyBound === "true"
  ) {
    return;
  }
  root.dataset.settingsAndroidExpandedScrollProxyBound = "true";

  const activationSelector = [
    ".settings-card--themes .settings-collapse-toggle",
    ".settings-card--themes.is-expanded .settings-collapsible-body",
    ".settings-card--table-scale .settings-collapse-toggle",
    ".settings-card--table-scale.is-expanded .settings-collapsible-body",
    ".settings-card--widgets .settings-collapse-toggle",
    ".settings-card--widgets.is-expanded .settings-collapsible-body",
  ].join(", ");
  const ignoreSelector = [
    "input[type='text']",
    "input[type='search']",
    "input[type='email']",
    "input[type='url']",
    "input[type='tel']",
    "input[type='password']",
    "input[type='number']",
    "input[type='date']",
    "input[type='time']",
    "input[type='datetime-local']",
    "input[type='checkbox']",
    "input[type='radio']",
    "input[type='color']",
    "input[type='range']",
    "textarea",
    "select",
    "a[href]",
    "[contenteditable='true']",
    ".tree-select",
    ".tree-select *",
    ".native-select-enhancer",
    ".native-select-enhancer *",
    ".modal-content",
    ".modal-content *",
  ].join(", ");
  let trackingTouchId = null;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let gestureHost = null;
  let isDragging = false;
  let suppressedTarget = null;
  let suppressUntil = 0;
  let scrollVelocity = 0;
  let lastSampleTime = 0;
  let lastSampleFingerY = 0;
  let inertiaFrameId = 0;

  const stopInertia = () => {
    if (inertiaFrameId) {
      window.cancelAnimationFrame(inertiaFrameId);
      inertiaFrameId = 0;
    }
    scrollVelocity = 0;
  };

  const clampScrollTop = (nextScrollTop) => {
    const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    return Math.min(maxScrollTop, Math.max(0, nextScrollTop));
  };

  const startInertia = (initialVelocity) => {
    stopInertia();
    if (!Number.isFinite(initialVelocity) || Math.abs(initialVelocity) < 0.08) {
      return;
    }
    scrollVelocity = initialVelocity;
    let previousTimestamp = 0;
    const step = (timestamp) => {
      if (!previousTimestamp) {
        previousTimestamp = timestamp;
        inertiaFrameId = window.requestAnimationFrame(step);
        return;
      }
      const elapsedMs = Math.max(1, Math.min(24, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      if (Math.abs(scrollVelocity) < 0.02) {
        stopInertia();
        return;
      }
      const currentScrollTop = root.scrollTop;
      const nextScrollTop = clampScrollTop(
        currentScrollTop + scrollVelocity * elapsedMs,
      );
      root.scrollTop = nextScrollTop;
      if (Math.abs(nextScrollTop - currentScrollTop) < 0.5) {
        stopInertia();
        return;
      }
      scrollVelocity *= Math.pow(0.92, elapsedMs / 16);
      inertiaFrameId = window.requestAnimationFrame(step);
    };
    inertiaFrameId = window.requestAnimationFrame(step);
  };

  const clearTracking = () => {
    trackingTouchId = null;
    startX = 0;
    startY = 0;
    lastY = 0;
    gestureHost = null;
    isDragging = false;
    lastSampleTime = 0;
    lastSampleFingerY = 0;
  };

  const resolveTouchByIdentifier = (touchList) => {
    if (!touchList || trackingTouchId === null) {
      return null;
    }
    for (let index = 0; index < touchList.length; index += 1) {
      const touch = touchList[index];
      if (touch.identifier === trackingTouchId) {
        return touch;
      }
    }
    return null;
  };

  root.addEventListener(
    "touchstart",
    (event) => {
      clearTracking();
      stopInertia();
      if (!event.touches || event.touches.length !== 1) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        !(target instanceof Element) ||
        !root.contains(target) ||
        target.closest(ignoreSelector)
      ) {
        return;
      }

      const resolvedHost = target.closest(activationSelector);
      if (!(resolvedHost instanceof HTMLElement) || !root.contains(resolvedHost)) {
        return;
      }

      const touch = event.touches[0];
      trackingTouchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      lastSampleFingerY = touch.clientY;
      lastSampleTime = Date.now();
      gestureHost = resolvedHost;
    },
    {
      capture: true,
      passive: true,
    },
  );

  root.addEventListener(
    "touchmove",
    (event) => {
      const touch = resolveTouchByIdentifier(event.touches);
      if (!touch || !(gestureHost instanceof HTMLElement)) {
        return;
      }
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!isDragging) {
        if (Math.abs(deltaY) < 8) {
          return;
        }
        if (Math.abs(deltaY) <= Math.abs(deltaX) + 4) {
          if (Math.abs(deltaX) >= 16) {
            clearTracking();
          }
          return;
        }
        isDragging = true;
        suppressedTarget = gestureHost;
        suppressUntil = Date.now() + 480;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const moveY = touch.clientY - lastY;
      if (moveY) {
        root.scrollTop = clampScrollTop(root.scrollTop - moveY);
      }
      lastY = touch.clientY;

      const now = Date.now();
      const elapsedMs = Math.max(1, now - lastSampleTime);
      const fingerVelocity = (touch.clientY - lastSampleFingerY) / elapsedMs;
      scrollVelocity = -fingerVelocity;
      lastSampleTime = now;
      lastSampleFingerY = touch.clientY;
    },
    {
      capture: true,
      passive: false,
    },
  );

  const clearTouchTrackingOnEnd = (event) => {
    const touch = resolveTouchByIdentifier(event.changedTouches);
    if (!touch) {
      return;
    }
    if (isDragging && event.cancelable) {
      event.preventDefault();
    }
    startInertia(scrollVelocity);
    clearTracking();
  };

  root.addEventListener("touchend", clearTouchTrackingOnEnd, {
    capture: true,
    passive: false,
  });
  root.addEventListener("touchcancel", clearTouchTrackingOnEnd, {
    capture: true,
    passive: false,
  });

  root.addEventListener(
    "click",
    (event) => {
      if (
        !(suppressedTarget instanceof HTMLElement) ||
        suppressUntil <= Date.now()
      ) {
        suppressedTarget = null;
        suppressUntil = 0;
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        !(target instanceof Element) ||
        !(
          suppressedTarget === target ||
          suppressedTarget.contains(target) ||
          target.contains(suppressedTarget)
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      suppressedTarget = null;
      suppressUntil = 0;
    },
    true,
  );
}

function enhanceSettingsLanguageSelect() {
  if (!window.ControlerUI?.enhanceNativeSelect) {
    return;
  }

  const languageSelect = document.getElementById("language-select");
  if (!(languageSelect instanceof HTMLSelectElement)) {
    return;
  }

  const currentLanguage =
    window.ControlerI18n?.getLanguage?.() ||
    localStorage.getItem("appLanguage") ||
    languageSelect.value ||
    "zh-CN";
  if (languageSelect.value !== currentLanguage) {
    languageSelect.value = currentLanguage;
  }

  window.ControlerUI.enhanceNativeSelect(languageSelect, {
    fullWidth: true,
    minWidth: 220,
    preferredMenuWidth: 320,
    maxMenuWidth: 360,
  });
}

function getWidgetBridge() {
  if (window.ControlerWidgetsBridge) {
    return window.ControlerWidgetsBridge;
  }

  const detectElectronShellRuntime = () => {
    const userAgent =
      typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
    return /\bElectron\/\d+/i.test(userAgent);
  };
  const electronAPI = window.electronAPI || null;
  const runtimeMeta =
    electronAPI?.runtimeMeta && typeof electronAPI.runtimeMeta === "object"
      ? electronAPI.runtimeMeta
      : {};
  const capabilities =
    runtimeMeta.capabilities && typeof runtimeMeta.capabilities === "object"
      ? runtimeMeta.capabilities
      : {};
  const isElectron = !!electronAPI?.isElectron;
  const isElectronShell = isElectron || detectElectronShellRuntime();
  const hasElectronBridge = isElectron;
  const supportsDesktopWidgets =
    hasElectronBridge &&
    typeof electronAPI?.desktopWidgetsCreate === "function" &&
    typeof electronAPI?.desktopWidgetsGetState === "function";
  let desktopWidgetBridgeStatus = "unsupported-env";
  let desktopWidgetBridgeMessage = "当前环境暂未声明可用的小组件能力。";
  if (isElectronShell && !hasElectronBridge) {
    desktopWidgetBridgeStatus = "electron-preload-missing";
    desktopWidgetBridgeMessage =
      "检测到当前运行在 Electron 中，但预加载桥接未成功注入。桌面小组件与窗口按钮暂时不可用，请使用修复后的版本重新启动应用。";
  } else if (hasElectronBridge && !supportsDesktopWidgets) {
    desktopWidgetBridgeStatus = "electron-desktop-widget-ipc-missing";
    desktopWidgetBridgeMessage =
      "Electron 桥接已加载，但桌面小组件接口未完整暴露。请重新安装或使用修复后的版本。";
  } else if (supportsDesktopWidgets) {
    desktopWidgetBridgeStatus = "ready";
    desktopWidgetBridgeMessage = "";
  }

  return {
    electronAPI,
    isElectron,
    isElectronShell,
    hasElectronBridge,
    isAndroid: false,
    nativePlatform:
      typeof runtimeMeta.platform === "string" ? runtimeMeta.platform : "web",
    capabilities,
    supportsWidgets: !!capabilities.widgets,
    supportsWidgetManualAdd: !!capabilities.widgetManualAdd,
    supportsWidgetPinning: !!capabilities.widgetPinning,
    supportsDesktopWidgets,
    desktopWidgetBridgeStatus,
    desktopWidgetBridgeMessage,
    async createDesktopWidget(kind) {
      if (!supportsDesktopWidgets) {
        return {
          ok: false,
          message: desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return await electronAPI.desktopWidgetsCreate({ kind });
      } catch (error) {
        console.error("创建桌面小组件失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
    async getDesktopWidgetState() {
      if (typeof electronAPI?.desktopWidgetsGetState !== "function") {
        return {
          available: false,
          widgets: [],
          openAtLogin: false,
          restoreOnLaunch: false,
          keepOnTop: true,
          message: desktopWidgetBridgeMessage || "当前环境不支持桌面小组件。",
        };
      }
      try {
        return (
          (await electronAPI.desktopWidgetsGetState()) || {
            widgets: [],
            openAtLogin: false,
            restoreOnLaunch: false,
            keepOnTop: true,
          }
        );
      } catch (error) {
        console.error("读取桌面小组件状态失败:", error);
        return {
          available: false,
          widgets: [],
          openAtLogin: false,
          restoreOnLaunch: false,
          keepOnTop: true,
          message: error?.message || String(error),
        };
      }
    },
    async updateDesktopWidgetSettings(settings = {}) {
      if (typeof electronAPI?.desktopWidgetsUpdateSettings !== "function") {
        return {
          ok: false,
          message:
            desktopWidgetBridgeMessage || "当前环境不支持更新桌面小组件设置。",
        };
      }
      try {
        return await electronAPI.desktopWidgetsUpdateSettings(settings);
      } catch (error) {
        console.error("更新桌面小组件设置失败:", error);
        return {
          ok: false,
          message: error?.message || String(error),
        };
      }
    },
  };
}

function hasElectronDesktopWidgetBridgeIssue(bridge) {
  return !!bridge?.isElectronShell && !bridge?.supportsDesktopWidgets;
}

function getElectronDesktopWidgetBridgeMessage(bridge) {
  if (!hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return "";
  }
  if (
    typeof bridge?.desktopWidgetBridgeMessage === "string" &&
    bridge.desktopWidgetBridgeMessage.trim()
  ) {
    return bridge.desktopWidgetBridgeMessage.trim();
  }
  return "Electron 桥接异常导致桌面小组件暂时不可用。";
}

function portalSettingsModalToBody(modalId) {
  const modal = document.getElementById(modalId);
  if (!(modal instanceof HTMLElement)) {
    return null;
  }

  prepareSettingsModalOverlayElement(modal, {
    visible: modal.style.display !== "none" && !modal.hidden,
  });
  return modal;
}

function showSettingsModal(modal) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  prepareSettingsModalOverlayElement(modal, {
    visible: true,
  });
}

function hideSettingsModal(modal) {
  if (!(modal instanceof HTMLElement)) {
    return;
  }
  modal.style.display = "none";
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

let settingsExternalStorageRefreshQueued = false;
let pendingSettingsStorageRefreshDetail = null;

function mergeSettingsStorageRefreshDetail(detail = {}) {
  const nextDetail =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? detail
      : {};
  const previousDetail =
    pendingSettingsStorageRefreshDetail &&
    typeof pendingSettingsStorageRefreshDetail === "object" &&
    !Array.isArray(pendingSettingsStorageRefreshDetail)
      ? pendingSettingsStorageRefreshDetail
      : {};
  pendingSettingsStorageRefreshDetail = {
    ...previousDetail,
    ...nextDetail,
    changedSections: getSettingsNormalizedChangedSections([
      ...(Array.isArray(previousDetail.changedSections)
        ? previousDetail.changedSections
        : []),
      ...(Array.isArray(nextDetail.changedSections) ? nextDetail.changedSections : []),
    ]),
  };
  return pendingSettingsStorageRefreshDetail;
}

function consumeSettingsStorageRefreshDetail() {
  const detail =
    pendingSettingsStorageRefreshDetail &&
    typeof pendingSettingsStorageRefreshDetail === "object" &&
    !Array.isArray(pendingSettingsStorageRefreshDetail)
      ? pendingSettingsStorageRefreshDetail
      : {};
  pendingSettingsStorageRefreshDetail = null;
  return detail;
}

function isThemeOnlySettingsRefresh(detail = {}) {
  const changedSections = getSettingsNormalizedChangedSections(
    detail?.changedSections,
  );
  return (
    changedSections.length > 0 &&
    changedSections.every((section) => SETTINGS_THEME_STORAGE_SECTIONS.has(section))
  );
}

function getSettingsNormalizedChangedSections(changedSections = []) {
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

function getSettingsStoragePageInstanceId() {
  return typeof window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ === "string"
    ? window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
    : "";
}

function shouldRefreshSettingsForExternalChange(detail = {}) {
  const originPageInstanceId =
    typeof detail?.originPageInstanceId === "string"
      ? detail.originPageInstanceId.trim()
      : "";
  if (
    originPageInstanceId &&
    originPageInstanceId === getSettingsStoragePageInstanceId()
  ) {
    return false;
  }
  if (window.ControlerStorage?.shouldIgnoreRecentLocalEcho?.(detail)) {
    return false;
  }
  const reason = typeof detail?.reason === "string" ? detail.reason.trim() : "";
  const source = typeof detail?.source === "string" ? detail.source.trim() : "";
  const changedSections = getSettingsNormalizedChangedSections(
    detail?.changedSections,
  );
  if (reason === "initial-sync" && !changedSections.length) {
    return false;
  }
  if (
    window.ControlerStorage?.isNativeApp === true &&
    !changedSections.length &&
    !source &&
    (reason === "external-update" || reason === "shell-resume")
  ) {
    return false;
  }
  return true;
}

function refreshSettingsFromStorage() {
  settingsExternalStorageRefreshQueued = false;
  const detail = consumeSettingsStorageRefreshDetail();
  const currentThemeId = getStoredSelectedThemeId();
  refreshThemeSelectorIfNeeded(currentThemeId);
  ensureThemeSelectorVisible(currentThemeId);
  if (isThemeOnlySettingsRefresh(detail)) {
    return;
  }
  updateStorageStatus();
  updateStoragePathInfo();
  void refreshAutoBackupPanel();
  renderNavigationVisibilitySettings();
  void renderWidgetSettingsPanel();
}

function scheduleSettingsStorageRefresh(detail = {}) {
  mergeSettingsStorageRefreshDetail(detail);
  if (settingsExternalStorageRefreshQueued) {
    return;
  }
  settingsExternalStorageRefreshQueued = true;
  if (settingsExternalStorageRefreshCoordinator) {
    settingsExternalStorageRefreshCoordinator.enqueue(detail);
    return;
  }
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(refreshSettingsFromStorage);
}

function bindSettingsExternalStorageRefresh() {
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail =
      event?.detail && typeof event.detail === "object" ? event.detail : {};
    if (!shouldRefreshSettingsForExternalChange(detail)) {
      return;
    }
    scheduleSettingsStorageRefresh(detail);
  });
}

async function showWidgetPanelAlert(message, options = {}) {
  const title =
    typeof options.title === "string" && options.title.trim()
      ? options.title.trim()
      : "桌面小组件";

  if (window.ControlerUI?.alertDialog) {
    await window.ControlerUI.alertDialog({
      title: localizeSettingsUiText(title),
      message: localizeSettingsUiText(
        typeof message === "string" ? message : String(message || ""),
      ),
      confirmText: localizeSettingsUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }

  alert(
    localizeSettingsUiText(
      typeof message === "string" ? message : String(message || ""),
    ),
  );
}

function renderWidgetGuideCard() {
  const container = document.getElementById("widget-guide-card");
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.hidden = true;
}

function getDefaultWidgetPinState() {
  return {
    status: "idle",
    message: "",
    requestedAt: 0,
    completedAt: 0,
    appWidgetId: 0,
  };
}

function getWidgetPinState(kind) {
  const state = settingsWidgetPinStateByKind.get(kind);
  return state && typeof state === "object"
    ? {
        ...getDefaultWidgetPinState(),
        ...state,
      }
    : getDefaultWidgetPinState();
}

function clearWidgetPinTimeout(kind) {
  const timeoutId = settingsWidgetPinTimeouts.get(kind);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    settingsWidgetPinTimeouts.delete(kind);
  }
}

function setWidgetPinState(kind, nextState = {}) {
  if (typeof kind !== "string" || !kind.trim()) {
    return getDefaultWidgetPinState();
  }
  const mergedState = {
    ...getWidgetPinState(kind),
    ...nextState,
  };
  if (mergedState.status !== "pending_confirmation") {
    clearWidgetPinTimeout(kind);
  }
  settingsWidgetPinStateByKind.set(kind, mergedState);
  return mergedState;
}

function scheduleWidgetPinTimeout(kind, requestedAt) {
  clearWidgetPinTimeout(kind);
  const safeRequestedAt = Number(requestedAt) || Date.now();
  const delayMs = Math.max(
    SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS - Math.max(Date.now() - safeRequestedAt, 0),
    0,
  );
  const timeoutId = window.setTimeout(() => {
    settingsWidgetPinTimeouts.delete(kind);
    void renderWidgetSettingsPanel("timeout");
  }, delayMs);
  settingsWidgetPinTimeouts.set(kind, timeoutId);
}

function getLocalizedWidgetTypeName(item) {
  return localizeSettingsUiText(item?.name || "该组件");
}

function buildAndroidWidgetManualStepLines(item) {
  return [
    `1. ${localizeSettingsUiText("长按桌面空白处")}`,
    `2. ${localizeSettingsUiText("打开“小组件”或“插件”")}`,
    `3. ${localizeSettingsUiText("找到 Order 并选择需要的组件")} (${getLocalizedWidgetTypeName(item)})`,
  ];
}

function buildAndroidWidgetManualAlertMessage(item, baseMessage = "") {
  const lines = [];
  const normalizedMessage =
    typeof baseMessage === "string" && baseMessage.trim() ? baseMessage.trim() : "";
  if (normalizedMessage) {
    lines.push(normalizedMessage);
  }
  lines.push(localizeSettingsUiText("手动添加步骤"));
  lines.push(...buildAndroidWidgetManualStepLines(item));
  return lines.join("\n");
}

function normalizeAndroidWidgetPinSupport(support) {
  return {
    ...DEFAULT_ANDROID_WIDGET_PIN_SUPPORT,
    ...(support && typeof support === "object" ? support : {}),
  };
}

async function syncAndroidWidgetPinState(bridge, reason = "render") {
  if (!bridge?.isAndroid) {
    return normalizeAndroidWidgetPinSupport(null);
  }

  let pinSupport = normalizeAndroidWidgetPinSupport(null);
  if (typeof bridge.getPinSupport === "function") {
    pinSupport = normalizeAndroidWidgetPinSupport(
      await bridge.getPinSupport(SETTINGS_WIDGET_TYPES[0]?.id || ""),
    );
  }

  if (typeof bridge.consumePinWidgetResult === "function") {
    const pinResult = await bridge.consumePinWidgetResult();
    if (pinResult?.hasResult) {
      clearWidgetPinTimeout(pinResult.kind);
      setWidgetPinState(pinResult.kind, {
        status: "pinned_success",
        message:
          typeof pinResult.message === "string" && pinResult.message.trim()
            ? pinResult.message.trim()
            : localizeSettingsUiText("已收到系统添加回执。"),
        requestedAt: Number(pinResult.requestedAt) || 0,
        completedAt: Number(pinResult.completedAt) || Date.now(),
        appWidgetId: Number(pinResult.appWidgetId) || 0,
      });
    }
  }

  const now = Date.now();
  const shouldFallbackOnReturn =
    reason === "focus" || reason === "visibility" || reason === "resume";
  SETTINGS_WIDGET_TYPES.forEach((item) => {
    const pinState = getWidgetPinState(item.id);
    if (pinState.status !== "pending_confirmation") {
      return;
    }
    const elapsedMs = Math.max(now - (Number(pinState.requestedAt) || now), 0);
    const timedOut = elapsedMs >= SETTINGS_WIDGET_PIN_PENDING_TIMEOUT_MS;
    const returnedWithoutResult =
      shouldFallbackOnReturn && elapsedMs >= SETTINGS_WIDGET_PIN_RETURN_GRACE_MS;
    if (!pinSupport.manualOnly && reason !== "timeout" && !timedOut && !returnedWithoutResult) {
      scheduleWidgetPinTimeout(item.id, pinState.requestedAt || now);
      return;
    }
    clearWidgetPinTimeout(item.id);
    setWidgetPinState(item.id, {
      status: "manual_fallback",
      message: pinSupport.manualOnly
        ? pinSupport.message
        : localizeSettingsUiText("当前系统未返回添加成功回执，请改用系统小组件面板手动添加。"),
      requestedAt: pinState.requestedAt,
      completedAt: 0,
      appWidgetId: 0,
    });
  });

  return pinSupport;
}

function getWidgetActionLabel(bridge) {
  if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
    return "创建桌面小组件";
  }
  if (hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return "Electron 桥接异常";
  }
  if (bridge?.supportsWidgetPinning) {
    return "添加到桌面";
  }
  if (bridge?.supportsWidgetManualAdd) {
    return "查看添加方式";
  }
  return "当前环境不可用";
}

function getWidgetPlatformSummary(bridge) {
  if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
    return "桌面端可直接创建桌面小组件，窗口按钮与内容会跟随当前主题。";
  }
  if (hasElectronDesktopWidgetBridgeIssue(bridge)) {
    return getElectronDesktopWidgetBridgeMessage(bridge);
  }
  if (bridge?.supportsWidgetPinning) {
    return "当前原生端支持由应用发起添加桌面小组件。";
  }
  if (bridge?.isAndroid && bridge?.supportsWidgetManualAdd) {
    return "安卓端请通过系统小组件面板手动添加。";
  }
  if (bridge?.nativePlatform === "ios" && bridge?.supportsWidgetManualAdd) {
    return "iOS 端请在系统小组件面板中手动添加 WidgetKit 小组件。";
  }
  return "当前环境暂未声明可用的小组件能力。";
}

function buildWidgetManualAlertMessage(item, bridge) {
  const widgetName = getLocalizedWidgetTypeName(item);
  if (bridge?.nativePlatform === "ios") {
    return [
      `${widgetName} 已支持通过系统小组件面板手动添加。`,
      "请在 iPhone 或 iPad 主屏幕长按空白区域，点击左上角“编辑”或“+”进入小组件面板。",
      "搜索 Order，然后选择对应尺寸并添加。",
      "添加后点击小组件即可跳回应用对应页面。",
    ].join("\n");
  }
  return buildAndroidWidgetManualAlertMessage(item);
}

function updateDesktopWidgetStateText(state = {}) {
  const stateText = document.getElementById("desktop-widget-state-text");
  if (!stateText) {
    return;
  }
  const widgetCount = Array.isArray(state.widgets) ? state.widgets.length : 0;
  if (widgetCount <= 0) {
    stateText.textContent = state.openAtLogin
      ? "已开启开机自启应用，但当前还没有保存的小组件。先创建小组件后，启动恢复设置才会生效。"
      : "当前还没有创建任何桌面小组件，点击下方按钮即可生成。";
    return;
  }

  if (state.openAtLogin && state.restoreOnLaunch) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；系统登录后会自动启动应用并恢复这些小组件。`;
    return;
  }

  if (state.openAtLogin) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；系统登录后会自动启动应用，但不会恢复小组件。如需自动恢复，请同时开启“启动时恢复已创建小组件”。`;
    return;
  }

  if (state.restoreOnLaunch) {
    stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；手动启动应用时会恢复这些小组件。如需系统登录时恢复，请同时开启“开机自启应用”。`;
    return;
  }

  stateText.textContent = `当前已保存 ${widgetCount} 个桌面小组件配置；当前未开启自动启动或自动恢复。`;
}

async function syncDesktopWidgetSettingsUI(bridge) {
  const desktopSettings = document.getElementById("desktop-widget-settings");
  if (!desktopSettings) {
    return;
  }

  if (!(bridge?.isElectron && bridge?.supportsDesktopWidgets)) {
    desktopSettings.style.display = "none";
    return;
  }

  desktopSettings.style.display = "block";
  const state = await bridge.getDesktopWidgetState();
  const openLoginCheckbox = document.getElementById(
    "desktop-widget-open-login",
  );
  const restoreCheckbox = document.getElementById("desktop-widget-restore");
  const onTopCheckbox = document.getElementById("desktop-widget-always-on-top");
  const applyDesktopWidgetState = (nextState = {}) => {
    if (openLoginCheckbox) {
      openLoginCheckbox.checked = !!nextState.openAtLogin;
    }
    if (restoreCheckbox) {
      restoreCheckbox.checked = !!nextState.restoreOnLaunch;
    }
    if (onTopCheckbox) {
      onTopCheckbox.checked = nextState.keepOnTop !== false;
    }
    updateDesktopWidgetStateText(nextState);
  };

  if (openLoginCheckbox) {
    openLoginCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        openAtLogin: openLoginCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  if (restoreCheckbox) {
    restoreCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        restoreOnLaunch: restoreCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  if (onTopCheckbox) {
    onTopCheckbox.onchange = async () => {
      const nextState = await bridge.updateDesktopWidgetSettings({
        keepOnTop: onTopCheckbox.checked,
      });
      applyDesktopWidgetState(nextState || (await bridge.getDesktopWidgetState()));
    };
  }

  applyDesktopWidgetState(state);
  scheduleSettingsCollapsibleRefresh();
}

function createWidgetActionDetail(item, bridge, androidPinSupport, pinState) {
  if (!bridge?.isAndroid) {
    return null;
  }

  const detail = document.createElement("div");
  detail.style.display = "grid";
  detail.style.gap = "6px";
  detail.style.marginTop = "2px";

  const addLine = (text, accent = false) => {
    if (typeof text !== "string" || !text.trim()) {
      return;
    }
    const line = document.createElement("div");
    line.textContent = localizeSettingsUiText(text.trim());
    line.style.fontSize = "11px";
    line.style.lineHeight = "1.45";
    line.style.color = accent ? "var(--delete-btn)" : "var(--muted-text-color)";
    detail.appendChild(line);
  };

  const addStepBlock = () => {
    const badge = document.createElement("div");
    badge.textContent = getLocalizedWidgetTypeName(item);
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.width = "fit-content";
    badge.style.padding = "2px 8px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "700";
    badge.style.color = "var(--button-text)";
    badge.style.background =
      "color-mix(in srgb, var(--button-bg) 78%, transparent)";
    detail.appendChild(badge);

    const heading = document.createElement("div");
    heading.textContent = localizeSettingsUiText("手动添加步骤");
    heading.style.fontSize = "11px";
    heading.style.fontWeight = "700";
    heading.style.color = "var(--text-color)";
    detail.appendChild(heading);

    buildAndroidWidgetManualStepLines(item).forEach((line) => {
      addLine(line);
    });
  };

  if (pinState?.status === "pending_confirmation") {
    addLine(
      pinState.message || localizeSettingsUiText("系统可能会要求确认。"),
    );
    addLine(
      localizeSettingsUiText("如果没有自动出现，请返回此页查看结果或改用手动添加。"),
    );
    return detail;
  }

  if (pinState?.status === "pinned_success") {
    addLine(
      pinState.message || localizeSettingsUiText("已收到系统添加回执。"),
    );
    addLine(localizeSettingsUiText("可以返回桌面查看该组件。"));
    return detail;
  }

  if (pinState?.status === "error") {
    addLine(
      pinState.message || localizeSettingsUiText("添加失败，请重试。"),
      true,
    );
    return detail;
  }

  if (pinState?.status === "manual_fallback" || !androidPinSupport?.canRequestPin) {
    addLine(
      pinState?.message ||
        androidPinSupport?.message ||
        localizeSettingsUiText("这个组件可通过系统小组件面板手动添加。"),
    );
    addStepBlock();
    return detail;
  }

  return null;
}

async function handleAndroidWidgetPrimaryAction(item, bridge, androidPinSupport) {
  const pinState = getWidgetPinState(item.id);
  if (pinState.status === "manual_fallback" || !androidPinSupport?.canRequestPin) {
    await showWidgetPanelAlert(
      buildAndroidWidgetManualAlertMessage(
        item,
        pinState.message || androidPinSupport?.message || "",
      ),
      { title: "手动添加" },
    );
    return;
  }

  const result = await bridge.requestPinWidget(item.id);
  if (result?.requestAccepted || result?.ok) {
    const requestedAt = Number(result?.requestedAt) || Date.now();
    setWidgetPinState(item.id, {
      status: "pending_confirmation",
      message:
        typeof result?.message === "string" && result.message.trim()
          ? result.message.trim()
          : localizeSettingsUiText("系统可能会要求确认。"),
      requestedAt,
      completedAt: 0,
      appWidgetId: 0,
    });
    scheduleWidgetPinTimeout(item.id, requestedAt);
    await renderWidgetSettingsPanel("state-change");
    return;
  }

  if (result?.manual) {
    setWidgetPinState(item.id, {
      status: "manual_fallback",
      message:
        typeof result?.message === "string" && result.message.trim()
          ? result.message.trim()
          : localizeSettingsUiText("当前系统不支持应用内直接固定组件。"),
      requestedAt: Number(result?.requestedAt) || 0,
      completedAt: 0,
      appWidgetId: 0,
    });
    await renderWidgetSettingsPanel("state-change");
    return;
  }

  setWidgetPinState(item.id, {
    status: "error",
    message:
      typeof result?.message === "string" && result.message.trim()
        ? result.message.trim()
        : localizeSettingsUiText("添加失败，请重试。"),
    requestedAt: 0,
    completedAt: 0,
    appWidgetId: 0,
  });
  await renderWidgetSettingsPanel("state-change");
}

function buildWidgetActionCard(item, bridge) {
  const actionLabel = getWidgetActionLabel(bridge);
  const isSupported =
    !!bridge?.supportsDesktopWidgets ||
    !!bridge?.supportsWidgetPinning ||
    !!bridge?.supportsWidgetManualAdd;

  const card = document.createElement("div");
  card.className = "widget-action-card";
  card.style.padding = "10px";
  card.style.borderRadius = "12px";
  card.style.border = "1px solid var(--panel-border-color)";
  card.style.background =
    "color-mix(in srgb, var(--panel-bg) 76%, transparent)";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.justifyContent = "space-between";
  card.style.gap = "8px";
  card.style.minWidth = "0";
  card.style.height = "100%";
  card.innerHTML = `
    <div class="widget-action-card-copy">
      <div class="widget-action-card-title" style="color: var(--text-color); font-size: 14px; font-weight: 700">${item.name}</div>
      <div class="widget-action-card-description" style="color: var(--muted-text-color); font-size: 11px; line-height: 1.4; margin-top: 4px">${item.description}</div>
    </div>
  `;

  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gap = "8px";

  const button = document.createElement("button");
  button.className = "bts widget-action-card-button";
  button.type = "button";
  button.textContent = actionLabel;
  button.style.margin = "0";
  button.style.width = "100%";
  button.style.padding = "6px 10px";
  button.style.fontSize = "12px";
  button.style.lineHeight = "1.2";
  button.style.whiteSpace = "normal";
  button.disabled = !isSupported;
  if (!isSupported) {
    button.style.opacity = "0.6";
    button.style.cursor = "not-allowed";
  }
  if (button.disabled) {
    button.style.opacity = "0.72";
    button.style.cursor = "default";
  }
  const bridgeIssueMessage = getElectronDesktopWidgetBridgeMessage(bridge);
  if (bridgeIssueMessage) {
    button.title = bridgeIssueMessage;
    button.setAttribute("aria-label", bridgeIssueMessage);
  }

  button.addEventListener("click", async () => {
    if (bridge?.isElectron && bridge?.supportsDesktopWidgets) {
      const result = await bridge.createDesktopWidget(item.id);
      if (result?.ok) {
        await showWidgetPanelAlert(
          `${item.name} 小组件已创建，可直接拖动边缘调整尺寸。`,
          { title: "创建成功" },
        );
        await syncDesktopWidgetSettingsUI(bridge);
        return;
      }
      await showWidgetPanelAlert(
        result?.message || `创建 ${item.name} 小组件失败，请重试。`,
        {
          title: "创建失败",
          danger: true,
        },
      );
      return;
    }

    if (bridge?.supportsWidgetPinning && bridge?.isAndroid) {
      await showWidgetPanelAlert(buildAndroidWidgetManualAlertMessage(item), {
        title: "手动添加",
      });
      return;
    }

    if (bridge?.supportsWidgetManualAdd) {
      await showWidgetPanelAlert(buildWidgetManualAlertMessage(item, bridge), {
        title: "手动添加",
      });
      return;
    }

    await showWidgetPanelAlert(
      bridgeIssueMessage || "当前环境暂不支持桌面小组件。",
      {
        title: bridgeIssueMessage ? "Electron 桥接异常" : "当前环境不可用",
        danger: true,
      },
    );
  });

  actions.appendChild(button);
  card.appendChild(actions);
  return card;
}

async function renderWidgetSettingsPanel(reason = "render") {
  const bridge = getWidgetBridge();
  const panel = document.getElementById("widget-settings-panel");
  const summary = document.getElementById("widget-platform-summary");
  const grid = document.getElementById("widget-type-grid");
  if (!panel || !summary || !grid) {
    return;
  }

  summary.textContent = getWidgetPlatformSummary(bridge);
  renderWidgetGuideCard();
  grid.innerHTML = "";
  SETTINGS_WIDGET_TYPES.forEach((item) => {
    grid.appendChild(buildWidgetActionCard(item, bridge));
  });

  await syncDesktopWidgetSettingsUI(bridge);
  scheduleSettingsCollapsibleRefresh();
}

function handleSettingsLaunchAction(payload = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "open-import-wizard") {
    return false;
  }
  window.setTimeout(() => {
    void importData({ source: payload?.source || "launcher" });
  }, 80);
  return true;
}

function initSettingsLaunchAction() {
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
    handleSettingsLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
    });
    params.delete("widgetAction");
    params.delete("widgetKind");
    params.delete("widgetSource");
    params.delete("widgetLaunchId");
    const queryText = params.toString();
    const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  };

  window.addEventListener(eventName, (event) => {
    handleSettingsLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}
// 初始化设置页面
async function initSettings() {
  window.ControlerUI?.markPerfStage?.("settings-init-start");
  scheduleSettingsSlowLoadingOverlay();
  initSettingsCollapsibleSections();
  initSettingsLaunchAction();

  // 加载当前主题
  const currentTheme = loadTheme({
    updateSelector: false,
  });
  updateThemeSelector(currentTheme);
  window.ControlerUI?.markPerfStage?.("settings-init-theme-ready");

  const addCustomThemeBtn = document.getElementById("add-custom-theme-btn");
  if (addCustomThemeBtn) {
    addCustomThemeBtn.addEventListener("click", () => {
      showThemeEditorModal();
    });
  }

  // 设置导出按钮
  const exportBtn = document.getElementById("export-data");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportData);
  }

  // 设置导入按钮
  const importBtn = document.getElementById("import-data");
  if (importBtn) {
    importBtn.addEventListener("click", importData);
  }

  // 设置清除按钮
  const clearBtn = document.getElementById("clear-data");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearAllData);
  }

  // 更新存储状态
  const cachedAutoBackupStatus = readCachedAutoBackupStatus();
  if (cachedAutoBackupStatus && supportsAutoBackupStatusApi()) {
    renderAutoBackupPanelStatus(cachedAutoBackupStatus, {
      statusNote: "已载入上次保存的设置，正在同步最新状态...",
    });
  }

  // 设置存储路径管理按钮
  const changeDirectoryBtn = document.getElementById(
    "change-storage-directory-btn",
  );
  if (changeDirectoryBtn) {
    changeDirectoryBtn.addEventListener("click", changeStorageDirectory);
  }

  const resetPathBtn = document.getElementById("reset-storage-path-btn");
  if (resetPathBtn) {
    resetPathBtn.addEventListener("click", resetStoragePath);
  }

  // 设置存储路径显示按钮
  const showStoragePathBtn = document.getElementById("show-storage-path");
  if (showStoragePathBtn) {
    showStoragePathBtn.addEventListener("click", showStoragePath);
  }

  bindAutoBackupAutoSaveInputs();
  window.ControlerUI?.markPerfStage?.("settings-init-backup-bind-ready");

  const runAutoBackupNowBtn = document.getElementById("run-auto-backup-now");
  if (runAutoBackupNowBtn) {
    runAutoBackupNowBtn.addEventListener("click", runAutoBackupNowFromPanel);
  }

  const openAutoBackupLocationBtn = document.getElementById(
    "open-auto-backup-location",
  );
  if (openAutoBackupLocationBtn) {
    openAutoBackupLocationBtn.addEventListener(
      "click",
      openAutoBackupLocationFromPanel,
    );
  }

  const shareLatestAutoBackupBtn = document.getElementById(
    "share-latest-auto-backup",
  );
  if (shareLatestAutoBackupBtn) {
    shareLatestAutoBackupBtn.addEventListener(
      "click",
      shareLatestAutoBackupFromPanel,
    );
  }

  window.addEventListener("resize", updateAutoBackupActionsAlignment);
  updateAutoBackupActionsAlignment();

  // 设置自动保存选项
  const autoSaveCheckbox = document.getElementById("auto-save");
  if (autoSaveCheckbox) {
    const autoSave = localStorage.getItem("autoSave") !== "false";
    autoSaveCheckbox.checked = autoSave;
    autoSaveCheckbox.addEventListener("change", (e) => {
      localStorage.setItem("autoSave", e.target.checked.toString());
    });
  }

  // 设置通知选项
  const notificationsCheckbox = document.getElementById("notifications");
  if (notificationsCheckbox) {
    const notifications = localStorage.getItem("notifications") !== "false";
    notificationsCheckbox.checked = notifications;
    notificationsCheckbox.addEventListener("change", async (e) => {
      const enabled = !!e.target.checked;
      localStorage.setItem("notifications", enabled.toString());
      await ensureSettingsDeferredRuntimeLoaded();
      if (enabled) {
        await window.ControlerReminders?.ensurePermission?.({
          interactive: true,
        });
      }
      await window.ControlerReminders?.syncNativeSchedule?.({
        force: true,
      });
      window.ControlerReminders?.refresh?.({
        resetWindow: true,
      });
    });
  }

  // 初始化表格与热图尺寸设置面板
  renderTableSizeSettingsPanel();
  window.ControlerUI?.markPerfStage?.("settings-init-table-ready");
  renderNavigationVisibilitySettings();
  window.ControlerUI?.markPerfStage?.("settings-init-navigation-ready");
  window.ControlerUI?.markPerfStage?.("first-data-ready");
  bindSettingsExternalStorageRefresh();
  const refreshSettingsOnResume = () => {
    scheduleSettingsStorageRefresh({
      reason: "resume",
    });
  };
  window.addEventListener("focus", refreshSettingsOnResume);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshSettingsOnResume();
    }
  });
  window.addEventListener(
    window.ControlerUI?.shellVisibilityEventName ||
      "controler:shell-visibility-changed",
    (event) => {
      if (event?.detail?.active === false) {
        return;
      }
      refreshSettingsOnResume();
    },
  );
  window.addEventListener(
    window.ControlerUI?.appNavigationVisibilityEventName ||
      "controler:app-navigation-visibility-changed",
    () => {
      renderNavigationVisibilitySettings();
    },
  );
  enhanceSettingsLanguageSelect();
  bindSettingsMobileDragScroll();
  bindSettingsAndroidExpandedPageScrollProxy();
  scheduleSettingsCollapsibleRefresh();
  updateDataManagementGuideHint();
  window.addEventListener(
    SETTINGS_LANGUAGE_EVENT,
    updateDataManagementGuideHint,
  );
  window.ControlerUI?.markPerfStage?.("settings-init-before-ready");
  await queueSettingsInitialReady();
  void scheduleSettingsDeferredPanelInitialization();

  // 设置预览模态框按钮事件
  const previewModal = portalSettingsModalToBody("clear-data-preview-modal");
  const previewCancelBtn = document.getElementById("preview-cancel");
  if (previewCancelBtn) {
    const closePreview = () => {
      if (previewModal) {
        hideSettingsModal(previewModal);
      }
    };
    previewCancelBtn.onclick = closePreview;
    previewCancelBtn.onpointerup = (event) => {
      event.preventDefault();
      closePreview();
    };
  }

  const previewConfirmBtn = document.getElementById("preview-confirm");
  if (previewConfirmBtn) {
    previewConfirmBtn.addEventListener("click", performClearData);
  }

  // 点击模态框外部关闭
  if (previewModal) {
    previewModal.addEventListener("click", function (e) {
      if (e.target === this) {
        hideSettingsModal(this);
      }
    });
  }
}

async function startSettingsInitialization() {
  try {
    await initSettings();
  } catch (error) {
    console.error("初始化设置页面失败:", error);
    try {
      await queueSettingsInitialReady();
    } catch (readyError) {
      console.error("设置页初始化失败后释放首屏状态失败:", readyError);
    }
  }
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void startSettingsInitialization();
  });
} else {
  void startSettingsInitialization();
}


