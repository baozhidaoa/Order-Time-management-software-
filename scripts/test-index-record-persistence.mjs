import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const storageBundle = require("../pages/storage-bundle.js");
const indexRecordPersistence = require("../pages/index-record-persistence.js");

function cloneValue(value) {
  return typeof storageBundle?.cloneValue === "function"
    ? storageBundle.cloneValue(value)
    : JSON.parse(JSON.stringify(value));
}

function getPeriodId(record) {
  if (typeof storageBundle?.getPeriodIdForSectionItem === "function") {
    return storageBundle.getPeriodIdForSectionItem("records", record) || "undated";
  }
  const anchor = String(
    record?.endTime || record?.timestamp || record?.startTime || "",
  ).trim();
  return /^\d{4}-\d{2}/.test(anchor) ? anchor.slice(0, 7) : "undated";
}

function buildMergeKey(record) {
  if (typeof storageBundle?.buildPartitionMergeKey === "function") {
    return storageBundle.buildPartitionMergeKey("records", record);
  }
  return indexRecordPersistence.buildRecordMergeKey(record);
}

function sortItems(items = []) {
  if (typeof storageBundle?.sortPartitionItems === "function") {
    return storageBundle.sortPartitionItems("records", items);
  }
  return indexRecordPersistence.sortRecordItems(items);
}

function createRecord({
  id = null,
  name,
  projectId,
  startTime,
  endTime,
  nextProjectId = null,
  nextProjectName = null,
}) {
  const record = {
    name,
    projectId,
    startTime,
    endTime,
    timestamp: endTime,
    spendtime: "60min",
    nextProjectId,
    nextProjectName,
  };
  if (id) {
    record.id = id;
  }
  return record;
}

function summarizeRecords(items = []) {
  return sortItems(items).map((item) => ({
    id: String(item?.id || "").trim() || null,
    name: item?.name || null,
    projectId: String(item?.projectId || "").trim() || null,
    nextProjectId: String(item?.nextProjectId || "").trim() || null,
    nextProjectName: item?.nextProjectName || null,
    endTime: item?.endTime || item?.timestamp || null,
  }));
}

function createStorageHarness(initialPeriods = {}) {
  const periods = new Map(
    Object.entries(initialPeriods).map(([periodId, items]) => [
      String(periodId || "").trim(),
      sortItems(items).map((item) => cloneValue(item)),
    ]),
  );
  const loadCalls = [];
  const saveCalls = [];

  return {
    loadCalls,
    saveCalls,
    async loadSectionRange(section, scope = {}) {
      assert.equal(section, "records");
      loadCalls.push(cloneValue(scope));
      const requestedPeriodIds = Array.isArray(scope?.periodIds)
        ? scope.periodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
        : String(scope?.periodId || "").trim()
          ? [String(scope.periodId).trim()]
          : [];
      const items = requestedPeriodIds.length
        ? requestedPeriodIds.flatMap((periodId) => periods.get(periodId) || [])
        : Array.from(periods.values()).flat();
      return {
        items: sortItems(items).map((item) => cloneValue(item)),
        periodIds: requestedPeriodIds.length
          ? requestedPeriodIds
          : Array.from(periods.keys()),
      };
    },
    async saveSectionRange(section, payload = {}) {
      assert.equal(section, "records");
      saveCalls.push(cloneValue(payload));
      const periodId = String(payload?.periodId || "").trim();
      const existingItems = periods.get(periodId) || [];

      if (payload?.mode === "patch") {
        const merged = new Map();
        sortItems(existingItems).forEach((item) => {
          merged.set(buildMergeKey(item), cloneValue(item));
        });
        const removeIds = new Set(
          [
            ...(Array.isArray(payload?.removeIds) ? payload.removeIds : []),
            ...(Array.isArray(payload?.removedItems)
              ? payload.removedItems.map((item) => item?.id)
              : []),
          ]
            .map((recordId) => String(recordId || "").trim())
            .filter(Boolean),
        );
        removeIds.forEach((recordId) => {
          merged.delete(`id:${recordId}`);
        });
        sortItems(payload?.items || []).forEach((item) => {
          merged.set(buildMergeKey(item), cloneValue(item));
        });
        periods.set(periodId, sortItems(Array.from(merged.values())));
      } else {
        periods.set(
          periodId,
          sortItems(payload?.items || []).map((item) => cloneValue(item)),
        );
      }

      return {
        section,
        periodId,
        count: (periods.get(periodId) || []).length,
      };
    },
    getPeriod(periodId) {
      return sortItems(periods.get(periodId) || []).map((item) => cloneValue(item));
    },
  };
}

function summarizeLoadResult(result = {}) {
  return {
    mode: result?.mode || null,
    loadedPeriodIds: Array.isArray(result?.loadedPeriodIds)
      ? result.loadedPeriodIds.slice()
      : [],
    items: summarizeRecords(result?.items || []),
  };
}

async function runPatchPreservesHiddenRecordsTest() {
  const periodId = "2026-03";
  const hiddenOlderRecord = createRecord({
    id: "hidden-older",
    name: "旧项目",
    projectId: "project-old",
    startTime: "2026-03-05T01:00:00.000Z",
    endTime: "2026-03-05T02:00:00.000Z",
  });
  const renamedBefore = createRecord({
    id: "recent-rename",
    name: "旧项目",
    projectId: "project-old",
    startTime: "2026-03-22T01:00:00.000Z",
    endTime: "2026-03-22T02:00:00.000Z",
    nextProjectId: "project-old",
    nextProjectName: "旧项目",
  });
  const renamedAfter = {
    ...renamedBefore,
    name: "新项目",
    projectId: "project-new",
    nextProjectId: "project-new",
    nextProjectName: "新项目",
  };
  const untouchedRecent = createRecord({
    id: "recent-keep",
    name: "保留项目",
    projectId: "project-keep",
    startTime: "2026-03-22T03:00:00.000Z",
    endTime: "2026-03-22T04:00:00.000Z",
  });
  const storage = createStorageHarness({
    [periodId]: [hiddenOlderRecord, renamedBefore, untouchedRecent],
  });

  await indexRecordPersistence.persistRecordMutations({
    periodIds: [periodId],
    currentRecords: [renamedAfter, untouchedRecent],
    upserts: [renamedAfter],
    removedItems: [renamedBefore],
    allRecordsLoaded: false,
    supportsPatch: true,
    loadSectionRange: storage.loadSectionRange,
    saveSectionRange: storage.saveSectionRange,
    getPeriodId,
    buildMergeKey,
    sortItems,
    cloneValue,
  });

  assert.equal(storage.loadCalls.length, 0, "patch 路径不应回读整月记录");
  assert.equal(storage.saveCalls.length, 1, "patch 路径应只写入一次");
  assert.equal(storage.saveCalls[0].mode, "patch", "应优先使用 patch 保存");
  assert.deepEqual(summarizeRecords(storage.getPeriod(periodId)), [
    summarizeRecords([hiddenOlderRecord])[0],
    summarizeRecords([renamedAfter])[0],
    summarizeRecords([untouchedRecent])[0],
  ]);
}

async function runFallbackReplaceUsesAuthoritativePartitionTest() {
  const periodId = "2026-03";
  const hiddenOlderRecord = createRecord({
    id: "hidden-older",
    name: "历史记录",
    projectId: "project-history",
    startTime: "2026-03-03T01:00:00.000Z",
    endTime: "2026-03-03T02:00:00.000Z",
  });
  const legacyDeletedRecord = createRecord({
    name: "待删除项目",
    projectId: "project-deleted",
    startTime: "2026-03-22T01:00:00.000Z",
    endTime: "2026-03-22T02:00:00.000Z",
  });
  const survivorBefore = createRecord({
    id: "recent-survivor",
    name: "保留项目",
    projectId: "project-keep",
    startTime: "2026-03-22T03:00:00.000Z",
    endTime: "2026-03-22T04:00:00.000Z",
    nextProjectId: "project-deleted",
    nextProjectName: "待删除项目",
  });
  const survivorAfter = {
    ...survivorBefore,
    nextProjectId: "project-keep",
    nextProjectName: "保留项目",
  };
  const storage = createStorageHarness({
    [periodId]: [hiddenOlderRecord, legacyDeletedRecord, survivorBefore],
  });

  await indexRecordPersistence.persistRecordMutations({
    periodIds: [periodId],
    currentRecords: [survivorAfter],
    upserts: [survivorAfter],
    removedItems: [legacyDeletedRecord, survivorBefore],
    allRecordsLoaded: false,
    supportsPatch: true,
    loadSectionRange: storage.loadSectionRange,
    saveSectionRange: storage.saveSectionRange,
    getPeriodId,
    buildMergeKey,
    sortItems,
    cloneValue,
  });

  assert.equal(storage.loadCalls.length, 1, "fallback 路径应回读权威整月分区");
  assert.equal(storage.saveCalls.length, 1, "fallback 路径应只写入一次");
  assert.equal(storage.saveCalls[0].mode, "replace", "fallback 应改为 replace 写回");
  assert.deepEqual(summarizeRecords(storage.getPeriod(periodId)), [
    summarizeRecords([hiddenOlderRecord])[0],
    summarizeRecords([survivorAfter])[0],
  ]);
}

function runRecentRangeLoadUsesWindowItemsOnlyTest() {
  const historicalRecord = createRecord({
    id: "historical-record",
    name: "历史记录",
    projectId: "project-history",
    startTime: "2026-03-05T01:00:00.000Z",
    endTime: "2026-03-05T02:00:00.000Z",
  });
  const visibleRecentRecord = createRecord({
    id: "recent-record",
    name: "最近记录",
    projectId: "project-recent",
    startTime: "2026-03-24T01:00:00.000Z",
    endTime: "2026-03-24T02:00:00.000Z",
  });

  const resolved = indexRecordPersistence.resolveRecordLoadResult({
    mode: "recent-range",
    existingItems: [historicalRecord, visibleRecentRecord],
    fallbackItems: [historicalRecord, visibleRecentRecord],
    rangeItems: [visibleRecentRecord],
    rangePeriodIds: ["2026-03"],
    getPeriodId,
    mergeByPeriods: (existingItems, incomingItems, periodIds) =>
      indexRecordPersistence.mergeRecordItemsByPeriods(
        existingItems,
        incomingItems,
        periodIds,
        { getPeriodId },
      ),
  });

  assert.deepEqual(summarizeLoadResult(resolved), {
    mode: "recent-range",
    loadedPeriodIds: ["2026-03"],
    items: [summarizeRecords([visibleRecentRecord])[0]],
  });
}

function runFullHistoryLoadStillMergesByPeriodsTest() {
  const februaryRecord = createRecord({
    id: "feb-record",
    name: "二月记录",
    projectId: "project-feb",
    startTime: "2026-02-20T01:00:00.000Z",
    endTime: "2026-02-20T02:00:00.000Z",
  });
  const marchBefore = createRecord({
    id: "march-before",
    name: "三月旧记录",
    projectId: "project-march-old",
    startTime: "2026-03-21T01:00:00.000Z",
    endTime: "2026-03-21T02:00:00.000Z",
  });
  const marchAfter = {
    ...marchBefore,
    name: "三月新记录",
    projectId: "project-march-new",
  };

  const resolved = indexRecordPersistence.resolveRecordLoadResult({
    mode: "full-history",
    existingItems: [februaryRecord, marchBefore],
    fallbackItems: [februaryRecord, marchBefore],
    rangeItems: [marchAfter],
    rangePeriodIds: ["2026-03"],
    getPeriodId,
    mergeByPeriods: (existingItems, incomingItems, periodIds) =>
      indexRecordPersistence.mergeRecordItemsByPeriods(
        existingItems,
        incomingItems,
        periodIds,
        { getPeriodId },
      ),
  });

  assert.deepEqual(summarizeLoadResult(resolved), {
    mode: "full-history",
    loadedPeriodIds: ["2026-02", "2026-03"],
    items: [
      summarizeRecords([februaryRecord])[0],
      summarizeRecords([marchAfter])[0],
    ],
  });
}

await runPatchPreservesHiddenRecordsTest();
await runFallbackReplaceUsesAuthoritativePartitionTest();
runRecentRangeLoadUsesWindowItemsOnlyTest();
runFullHistoryLoadStillMergesByPeriodsTest();

console.log("index record persistence regression checks passed");
