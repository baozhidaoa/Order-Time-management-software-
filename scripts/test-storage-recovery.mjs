import fs from "fs-extra";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const StorageManager = require("../storage-manager.js");

function createFakeApp(tempRoot) {
  return {
    getPath(name) {
      if (name === "userData") return path.join(tempRoot, "userData");
      if (name === "documents") return path.join(tempRoot, "documents");
      throw new Error(`Unsupported app path: ${name}`);
    },
    getName() {
      return "Order";
    },
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function createIsoRange(minutesAgo = 45, durationMinutes = 30) {
  const endDate = new Date(Date.now() - Math.max(0, minutesAgo) * 60 * 1000);
  const startDate = new Date(
    endDate.getTime() - Math.max(1, durationMinutes) * 60 * 1000,
  );
  return {
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    dateKey: endDate.toISOString().slice(0, 10),
    periodId: endDate.toISOString().slice(0, 7),
  };
}

function buildRecord(id, minutesAgo, durationMinutes, projectId = "project_alpha") {
  const range = createIsoRange(minutesAgo, durationMinutes);
  return {
    id,
    projectId,
    name: "Recovery Project",
    startTime: range.startTime,
    endTime: range.endTime,
    timestamp: range.endTime,
    spendtime: `${durationMinutes}分钟`,
    durationMs: durationMinutes * 60 * 1000,
    clickCount: 1,
  };
}

function buildFixtureState(baseState = {}) {
  const nextState = cloneValue(baseState || {});
  nextState.projects = [
    {
      id: "project_alpha",
      name: "Recovery Project",
      level: 1,
      parentId: null,
      color: "#79af85",
      cachedDirectDurationMs: 0,
      cachedTotalDurationMs: 0,
      totalDurationMs: 0,
      createdAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
    },
  ];
  nextState.records = [buildRecord("record_base", 50, 30)];
  nextState.plans = [];
  nextState.todos = [];
  nextState.checkinItems = [];
  nextState.dailyCheckins = [];
  nextState.checkins = [];
  nextState.diaryEntries = [];
  nextState.diaryCategories = Array.isArray(nextState.diaryCategories)
    ? nextState.diaryCategories
    : [];
  nextState.yearlyGoals =
    nextState.yearlyGoals && typeof nextState.yearlyGoals === "object"
      ? nextState.yearlyGoals
      : { annual: [] };
  nextState.customThemes = Array.isArray(nextState.customThemes)
    ? nextState.customThemes
    : [];
  nextState.builtInThemeOverrides =
    nextState.builtInThemeOverrides &&
    typeof nextState.builtInThemeOverrides === "object" &&
    !Array.isArray(nextState.builtInThemeOverrides)
      ? nextState.builtInThemeOverrides
      : {};
  nextState.selectedTheme =
    typeof nextState.selectedTheme === "string" && nextState.selectedTheme.trim()
      ? nextState.selectedTheme
      : "default";
  nextState.guideState =
    nextState.guideState &&
    typeof nextState.guideState === "object" &&
    !Array.isArray(nextState.guideState)
      ? nextState.guideState
      : {
          bundleVersion: 2,
          dismissedCardIds: [],
          dismissedGuideDiaryEntryIds: [],
        };
  nextState.timerSessionState =
    nextState.timerSessionState &&
    typeof nextState.timerSessionState === "object" &&
    !Array.isArray(nextState.timerSessionState)
      ? nextState.timerSessionState
      : {
          sessionVersion: 2,
          ptn: 1,
          fpt: new Date().toISOString(),
          spt: null,
          lastspt: null,
          selectedProject: "Recovery Project",
          nextProject: "",
          lastEnteredProjectName: "Recovery Project",
        };
  nextState.lastModified = new Date().toISOString();
  return nextState;
}

async function instantiateManager(tempRoot, storageManifestPath = "") {
  const manager = new StorageManager(createFakeApp(tempRoot));
  if (storageManifestPath) {
    manager.writeConfig({
      storagePath: storageManifestPath,
    });
    manager.storagePath = storageManifestPath;
  }
  manager.ensureStorageReady();
  return manager;
}

async function restartManager(tempRoot, storageManifestPath) {
  return instantiateManager(tempRoot, storageManifestPath);
}

async function setupFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "order-recovery-"));
  const manager = await instantiateManager(tempRoot);
  const initialState = buildFixtureState(manager.loadStorageData());
  const root = manager.getBundleRoot(manager.storagePath);
  manager.writeBundleFromState(root, initialState, {
    touchModified: true,
    touchSyncSave: true,
  });
  await manager.requestSidecarIndexRebuild(manager.storagePath, {
    fullRebuild: true,
  });
  const periodId =
    initialState.records[0]?.endTime?.slice(0, 7) ||
    initialState.records[0]?.timestamp?.slice(0, 7) ||
    new Date().toISOString().slice(0, 7);
  return {
    tempRoot,
    manager,
    root,
    storagePath: manager.storagePath,
    recordPeriodId: periodId,
  };
}

function createScenarioResult(name, pass, details = {}) {
  return {
    name,
    pass: pass === true,
    details,
  };
}

async function main() {
  const context = await setupFixture();
  const {
    tempRoot,
    manager,
    root,
    storagePath,
    recordPeriodId,
  } = context;
  const scenarios = [];

  const draftKey = "recovery:test";
  manager.setDraftValue(draftKey, { text: "before-crash" }, { scope: "recovery" });
  await fs.remove(manager.getSidecarDraftPath(draftKey));
  const draftRecoveredFromLog = manager.getDraftValue(draftKey, {
    includeEnvelope: true,
  });
  scenarios.push(
    createScenarioResult("draft-log-recovers-missing-file", draftRecoveredFromLog?.value?.text === "before-crash", {
      updatedAt: draftRecoveredFromLog?.updatedAt || null,
      text: draftRecoveredFromLog?.value?.text || null,
    }),
  );

  manager.setDraftValue(draftKey, { text: "stale-file" }, { scope: "recovery" });
  const staleEnvelope = manager.getDraftValue(draftKey, { includeEnvelope: true });
  manager.removeDraftValue(draftKey);
  await fs.writeJson(manager.getSidecarDraftPath(draftKey), staleEnvelope, {
    spaces: 2,
  });
  const draftRemovedDespiteStaleFile = manager.getDraftValue(draftKey, {
    includeEnvelope: true,
  });
  scenarios.push(
    createScenarioResult(
      "draft-remove-wins-over-stale-file",
      draftRemovedDespiteStaleFile === null,
      {
        value: draftRemovedDespiteStaleFile,
      },
    ),
  );

  const manifest = manager.getManifest();
  const targetPartition = (manifest?.sections?.records?.partitions || []).find(
    (partition) => partition.periodId === recordPeriodId,
  );
  const targetPartitionPath = targetPartition
    ? path.join(root, targetPartition.file)
    : "";
  const originalEnvelope = manager.readPartitionEnvelopeSync(
    root,
    "records",
    recordPeriodId,
  );
  const crashTempPath = `${targetPartitionPath}.tmp-crash`;
  const tempOnlyRecord = buildRecord("record_temp_ignored", 20, 10);
  await fs.writeJson(
    crashTempPath,
    {
      ...originalEnvelope,
      items: [...(originalEnvelope?.items || []), tempOnlyRecord],
    },
    { spaces: 2 },
  );
  const tempCrashManager = await restartManager(tempRoot, storagePath);
  const tempCrashRange = tempCrashManager.loadSectionRange("records", {
    periodIds: [recordPeriodId],
  });
  tempCrashManager.stopWatching();
  scenarios.push(
    createScenarioResult(
      "temp-partition-file-is-ignored-after-crash",
      !tempCrashRange.items.some((record) => record?.id === tempOnlyRecord.id),
      {
        tempPath: crashTempPath,
        recoveredCount: tempCrashRange.items.length,
      },
    ),
  );

  const orphanRecord = buildRecord("record_orphan_unacked", 5, 5);
  const orphanPeriodId = "2031-01";
  const orphanPath = path.join(root, "records", "2031", "2031-01.json");
  await fs.ensureDir(path.dirname(orphanPath));
  await fs.writeJson(
    orphanPath,
    {
      section: "records",
      periodId: orphanPeriodId,
      count: 1,
      minDate: orphanRecord.timestamp.slice(0, 10),
      maxDate: orphanRecord.timestamp.slice(0, 10),
      fingerprint: "orphan-only",
      items: [orphanRecord],
    },
    { spaces: 2 },
  );
  const orphanManager = await restartManager(tempRoot, storagePath);
  const orphanRange = orphanManager.loadSectionRange("records", {
    periodIds: [orphanPeriodId],
  });
  orphanManager.stopWatching();
  scenarios.push(
    createScenarioResult(
      "orphan-partition-without-manifest-entry-stays-invisible",
      orphanRange.items.length === 0 &&
        !orphanRange.periodIds.includes(orphanPeriodId),
      {
        orphanPath,
        loadedPeriods: orphanRange.periodIds,
      },
    ),
  );

  const staleSidecarFingerprint = manager.readSidecarMetaSync(storagePath)?.sourceFingerprint || "";
  const committedState = buildFixtureState(manager.loadBundleStateSync(root));
  committedState.records = [
    ...(Array.isArray(committedState.records) ? committedState.records : []),
    buildRecord("record_committed_bundle", 8, 12),
  ];
  manager.writeBundleFromState(root, committedState, {
    touchModified: true,
    touchSyncSave: true,
  });
  const committedManager = await restartManager(tempRoot, storagePath);
  const committedBootstrap = committedManager.getPageBootstrapState("index", {});
  await committedManager.requestSidecarIndexRebuild(committedManager.storagePath, {
    fullRebuild: true,
  });
  const committedFingerprint = committedManager
    .buildBundleSourceFingerprint(root, committedManager.readManifestSync(root));
  const committedMeta = committedManager.readSidecarMetaSync(storagePath);
  committedManager.stopWatching();
  scenarios.push(
    createScenarioResult(
      "committed-bundle-wins-over-stale-sidecar",
      committedBootstrap?.data?.recentRecords?.some(
        (record) => record?.id === "record_committed_bundle",
      ) &&
        committedMeta?.sourceFingerprint === committedFingerprint &&
        committedFingerprint !== staleSidecarFingerprint,
      {
        staleSidecarFingerprint,
        committedFingerprint,
        recentRecordIds: (committedBootstrap?.data?.recentRecords || []).map(
          (record) => record?.id || null,
        ),
      },
    ),
  );

  const sqlitePath = manager.getSidecarSqlitePath(storagePath);
  await fs.remove(sqlitePath);
  await fs.remove(manager.getSidecarBootstrapPath("index", storagePath));
  const sqliteRecoveryManager = await restartManager(tempRoot, storagePath);
  const bootstrapAfterSqliteLoss = sqliteRecoveryManager.getPageBootstrapState(
    "index",
    {},
  );
  await sqliteRecoveryManager.requestSidecarIndexRebuild(
    sqliteRecoveryManager.storagePath,
    {
      fullRebuild: true,
    },
  );
  const sqliteRebuilt = await fs.pathExists(sqlitePath);
  sqliteRecoveryManager.stopWatching();
  scenarios.push(
    createScenarioResult(
      "sqlite-loss-rebuilds-from-bundle",
      sqliteRebuilt &&
        bootstrapAfterSqliteLoss?.data?.recentRecords?.some(
          (record) => record?.id === "record_committed_bundle",
        ),
      {
        sqlitePath,
        bootstrapKeys: Object.keys(bootstrapAfterSqliteLoss?.data || {}),
      },
    ),
  );

  manager.stopWatching();

  console.log(
    JSON.stringify(
      {
        allPassed: scenarios.every((scenario) => scenario.pass === true),
        storagePath,
        recordPeriodId,
        scenarios,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
