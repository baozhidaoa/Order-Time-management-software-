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

  function normalizeProjectName(value) {
    return String(value || "").trim();
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
      let matchedProject = null;

      if (sourceProjectId && projectIdMap.has(sourceProjectId)) {
        const mappedId = projectIdMap.get(sourceProjectId);
        matchedProject = ensureArray(reconciliation.projects).find(
          (project) => String(project?.id || "").trim() === String(mappedId || ""),
        );
      }
      if (!matchedProject && sourceName) {
        matchedProject = nameIndex.get(sourceName) || null;
      }

      mappedRecords.push({
        ...source,
        name: matchedProject?.name || sourceName || "未命名项目",
        projectId: matchedProject?.id || null,
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
