import fs from "fs-extra";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const StorageManager = require("../storage-manager.js");

const FIXTURE_PERIOD_ID = "2026-03";
const FIXTURE_RECORD_START = "2026-03-20T08:00:00.000Z";
const FIXTURE_RECORD_END = "2026-03-20T09:00:00.000Z";

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function createProject({
  id,
  name,
  level = 1,
  parentId = null,
  directMs = 0,
  totalMs = directMs,
}) {
  return {
    id,
    name,
    level,
    parentId,
    color: "#79af85",
    colorMode: "auto",
    createdAt: "2025-01-01T00:00:00.000Z",
    cachedDirectDurationMs: directMs,
    cachedTotalDurationMs: totalMs,
    totalDurationMs: totalMs,
  };
}

function createRecord({
  id,
  name = "Recovery Project",
  projectId = "project_alpha",
  startTime = FIXTURE_RECORD_START,
  endTime = FIXTURE_RECORD_END,
  timestamp = endTime,
  durationMinutes = 60,
} = {}) {
  return {
    id,
    projectId,
    name,
    startTime,
    endTime,
    timestamp,
    spendtime: `${durationMinutes}分钟`,
    durationMs: durationMinutes * 60 * 1000,
    clickCount: 1,
  };
}

function createBaseState(overrides = {}) {
  const source = cloneValue(overrides || {});
  return {
    projects: Array.isArray(source.projects)
      ? source.projects
      : [createProject({ id: "project_alpha", name: "Recovery Project" })],
    records: Array.isArray(source.records)
      ? source.records
      : [createRecord({ id: "record_base" })],
    plans: Array.isArray(source.plans) ? source.plans : [],
    todos: Array.isArray(source.todos) ? source.todos : [],
    checkinItems: Array.isArray(source.checkinItems)
      ? source.checkinItems
      : [],
    dailyCheckins: Array.isArray(source.dailyCheckins)
      ? source.dailyCheckins
      : [],
    checkins: Array.isArray(source.checkins) ? source.checkins : [],
    diaryEntries: Array.isArray(source.diaryEntries)
      ? source.diaryEntries
      : [],
    diaryCategories: Array.isArray(source.diaryCategories)
      ? source.diaryCategories
      : [],
    yearlyGoals:
      source.yearlyGoals &&
      typeof source.yearlyGoals === "object" &&
      !Array.isArray(source.yearlyGoals)
        ? source.yearlyGoals
        : { annual: [] },
    customThemes: Array.isArray(source.customThemes) ? source.customThemes : [],
    builtInThemeOverrides:
      source.builtInThemeOverrides &&
      typeof source.builtInThemeOverrides === "object" &&
      !Array.isArray(source.builtInThemeOverrides)
        ? source.builtInThemeOverrides
        : {},
    selectedTheme:
      typeof source.selectedTheme === "string" && source.selectedTheme.trim()
        ? source.selectedTheme.trim()
        : "default",
    guideState:
      source.guideState &&
      typeof source.guideState === "object" &&
      !Array.isArray(source.guideState)
        ? source.guideState
        : {
            bundleVersion: 2,
            dismissedCardIds: [],
            dismissedGuideDiaryEntryIds: [],
          },
    timerSessionState:
      source.timerSessionState &&
      typeof source.timerSessionState === "object" &&
      !Array.isArray(source.timerSessionState)
        ? source.timerSessionState
        : {
            sessionVersion: 2,
            ptn: 1,
            fpt: "2026-03-20T07:00:00.000Z",
            spt: null,
            lastspt: null,
            selectedProject: "Recovery Project",
            nextProject: "",
            lastEnteredProjectName: "Recovery Project",
          },
    createdAt:
      typeof source.createdAt === "string" && source.createdAt
        ? source.createdAt
        : "2025-01-01T00:00:00.000Z",
    lastModified:
      typeof source.lastModified === "string" && source.lastModified
        ? source.lastModified
        : "2026-03-20T09:00:00.000Z",
  };
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

async function withFixture(run, options = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "order-hardening-"));
  const manager = await instantiateManager(tempRoot);
  const state = createBaseState(options.state);
  const root = manager.getBundleRoot(manager.storagePath);
  manager.writeBundleFromState(root, state, {
    touchModified: true,
    touchSyncSave: true,
  });
  await manager.requestSidecarIndexRebuild(manager.storagePath, {
    fullRebuild: true,
  });
  try {
    return await run({
      tempRoot,
      manager,
      root,
      storagePath: manager.storagePath,
      state,
    });
  } finally {
    manager.stopWatching?.();
    await fs.remove(tempRoot);
  }
}

function createScenarioResult(name, pass, details = {}) {
  return {
    name,
    pass: pass === true,
    details,
  };
}

function captureExpectedFailure(action, expectedCode) {
  let error = null;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  assert(error, `Expected ${expectedCode} to block the write.`);
  assert(
    error?.code === expectedCode,
    `Expected error code ${expectedCode}, received ${error?.code || "none"}.`,
  );
  return error;
}

function loadPeriodIds(manager, section, periodId = FIXTURE_PERIOD_ID) {
  return manager.loadSectionRange(section, {
    periodIds: [periodId],
  });
}

async function scenarioDuplicateProjectLoadTriggersRecovery() {
  return withFixture(async ({ manager, root, tempRoot, storagePath }) => {
    const corePath = manager.getCorePath(root);
    const core = manager.readJsonFileSync(corePath, {});
    core.projects = [
      createProject({ id: "project_alpha", name: "Recovery Project" }),
      createProject({ id: "project_alpha", name: "Duplicated Project" }),
    ];
    manager.writeJsonFileSync(corePath, core);
    manager.stopWatching?.();

    const restarted = await instantiateManager(tempRoot, storagePath);
    try {
      const status = restarted.getStorageStatus();
      const bootstrap = restarted.getPageBootstrapState("settings", {});
      let blockedError = null;
      try {
        restarted.replaceCoreState({ selectedTheme: "ocean-frost" });
      } catch (error) {
        blockedError = error;
      }
      const currentCore = restarted.readJsonFileSync(
        restarted.getCorePath(restarted.getBundleRoot(restarted.storagePath)),
        {},
      );
      const duplicateProjectCount = Array.isArray(currentCore.projects)
        ? currentCore.projects.filter((project) => project?.id === "project_alpha")
            .length
        : 0;

      assert(status?.recoveryState === "needs-recovery", "Duplicate project load should force needs-recovery mode.");
      assert(
        status?.protectionMode === "readonly_due_to_load_failure",
        "Needs-recovery storage should become readonly.",
      );
      assert(
        Number(status?.recoverySummary?.hardReasonCounts?.["duplicate-project-id"] || 0) === 1,
        "Status should expose the duplicate-project-id recovery summary.",
      );
      assert(
        Number(
          bootstrap?.data?.recoverySummary?.hardReasonCounts?.[
            "duplicate-project-id"
          ] || 0,
        ) === 1,
        "Settings bootstrap should expose duplicate-project-id recovery summary.",
      );
      assert(
        blockedError instanceof Error,
        "Writes should be blocked while storage is in needs-recovery mode.",
      );
      assert(
        duplicateProjectCount === 2,
        "Loaded duplicate project data should stay untouched for manual recovery.",
      );

      return {
        recoveryState: status?.recoveryState || null,
        protectionMode: status?.protectionMode || null,
        blockedMessage: blockedError?.message || "",
        hardReasonCounts: status?.recoverySummary?.hardReasonCounts || {},
      };
    } finally {
      restarted.stopWatching?.();
    }
  });
}

async function scenarioDuplicateProjectWriteBlocked() {
  return withFixture(async ({ manager, root }) => {
    const error = captureExpectedFailure(() => {
      manager.replaceCoreState({
        projects: [
          createProject({ id: "project_alpha", name: "Recovery Project" }),
          createProject({ id: "project_alpha", name: "Duplicated Project" }),
        ],
      });
    }, "duplicate-project-id");

    const status = manager.getStorageStatus();
    const core = manager.readJsonFileSync(manager.getCorePath(root), {});

    assert(
      status?.persistErrorCode === "duplicate-project-id",
      "Duplicate project write should publish persistErrorCode.",
    );
    assert(
      status?.protectionMode === "blocked_due_to_persist_failure",
      "Blocked project write should put storage in persist-failure protection mode.",
    );
    assert(
      Array.isArray(core.projects) && core.projects.length === 1,
      "Blocked project write should leave the original core untouched.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      projectIds: Array.isArray(core.projects)
        ? core.projects.map((project) => project?.id || null)
        : [],
    };
  });
}

async function scenarioDuplicateRecordReplaceBlocked() {
  return withFixture(async ({ manager }) => {
    const beforeRange = loadPeriodIds(manager, "records");
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("records", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          createRecord({
            id: "record_duplicate",
            startTime: "2026-03-20T10:00:00.000Z",
            endTime: "2026-03-20T11:00:00.000Z",
          }),
          createRecord({
            id: "record_duplicate",
            startTime: "2026-03-20T12:00:00.000Z",
            endTime: "2026-03-20T13:00:00.000Z",
          }),
        ],
      });
    }, "duplicate-record-id");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "records");

    assert(
      status?.persistErrorCode === "duplicate-record-id",
      "Duplicate record replace should publish persistErrorCode.",
    );
    assert(
      beforeRange.items.length === afterRange.items.length &&
        afterRange.items.some((record) => record?.id === "record_base"),
      "Blocked record replace should keep the original partition data.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      recordIds: afterRange.items.map((record) => record?.id || null),
    };
  });
}

async function scenarioDuplicateRecordPatchBlocked() {
  return withFixture(async ({ manager }) => {
    const beforeRange = loadPeriodIds(manager, "records");
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("records", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "patch",
        items: [
          createRecord({
            id: "record_patch_duplicate",
            startTime: "2026-03-20T14:00:00.000Z",
            endTime: "2026-03-20T15:00:00.000Z",
          }),
          createRecord({
            id: "record_patch_duplicate",
            startTime: "2026-03-20T16:00:00.000Z",
            endTime: "2026-03-20T17:00:00.000Z",
          }),
        ],
      });
    }, "duplicate-record-id");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "records");

    assert(
      status?.persistErrorCode === "duplicate-record-id",
      "Duplicate record patch should publish persistErrorCode.",
    );
    assert(
      beforeRange.items.length === afterRange.items.length &&
        afterRange.items.some((record) => record?.id === "record_base"),
      "Blocked record patch should keep the original partition data.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      recordIds: afterRange.items.map((record) => record?.id || null),
    };
  });
}

async function scenarioRecordMissingTimeBlocked() {
  return withFixture(async ({ manager }) => {
    const beforeRange = loadPeriodIds(manager, "records");
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("records", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "record_missing_time",
            name: "Missing Time",
            projectId: "project_alpha",
          },
        ],
      });
    }, "missing-record-time");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "records");

    assert(
      status?.persistErrorCode === "missing-record-time",
      "Record missing time should publish persistErrorCode.",
    );
    assert(
      beforeRange.items.length === afterRange.items.length,
      "Blocked record write should keep the original partition data.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      recordIds: afterRange.items.map((record) => record?.id || null),
    };
  });
}

async function scenarioRecordMissingReferenceBlocked() {
  return withFixture(async ({ manager }) => {
    const beforeRange = loadPeriodIds(manager, "records");
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("records", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "record_missing_reference",
            endTime: "2026-03-20T12:30:00.000Z",
            timestamp: "2026-03-20T12:30:00.000Z",
          },
        ],
      });
    }, "missing-record-reference");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "records");

    assert(
      status?.persistErrorCode === "missing-record-reference",
      "Record missing reference should publish persistErrorCode.",
    );
    assert(
      beforeRange.items.length === afterRange.items.length,
      "Blocked record write should keep the original partition data.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      recordIds: afterRange.items.map((record) => record?.id || null),
    };
  });
}

async function scenarioPlanMissingDateBlocked() {
  return withFixture(async ({ manager }) => {
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("plans", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "plan_missing_date",
            name: "Missing Date",
            repeat: "none",
          },
        ],
      });
    }, "missing-plan-date");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "plans");

    assert(
      status?.persistErrorCode === "missing-plan-date",
      "Plan missing date should publish persistErrorCode.",
    );
    assert(afterRange.items.length === 0, "Blocked plan write should not persist invalid plans.");

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      planCount: afterRange.items.length,
    };
  });
}

async function scenarioDiaryMissingDateBlocked() {
  return withFixture(async ({ manager }) => {
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("diaryEntries", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "diary_missing_date",
            title: "Missing Date",
          },
        ],
      });
    }, "missing-diary-date");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "diaryEntries");

    assert(
      status?.persistErrorCode === "missing-diary-date",
      "Diary missing date should publish persistErrorCode.",
    );
    assert(
      afterRange.items.length === 0,
      "Blocked diary write should not persist invalid diary entries.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      diaryCount: afterRange.items.length,
    };
  });
}

async function scenarioDailyCheckinMissingDateBlocked() {
  return withFixture(async ({ manager }) => {
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("dailyCheckins", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "daily_checkin_missing_date",
            itemId: "checkin_item_alpha",
          },
        ],
      });
    }, "missing-daily-checkin-date");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "dailyCheckins");

    assert(
      status?.persistErrorCode === "missing-daily-checkin-date",
      "Daily checkin missing date should publish persistErrorCode.",
    );
    assert(
      afterRange.items.length === 0,
      "Blocked daily checkin write should not persist invalid items.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      dailyCheckinCount: afterRange.items.length,
    };
  });
}

async function scenarioCheckinMissingTimeBlocked() {
  return withFixture(async ({ manager }) => {
    const error = captureExpectedFailure(() => {
      manager.saveSectionRange("checkins", {
        periodId: FIXTURE_PERIOD_ID,
        mode: "replace",
        items: [
          {
            id: "checkin_missing_time",
            todoId: "todo_alpha",
          },
        ],
      });
    }, "missing-checkin-time");

    const status = manager.getStorageStatus();
    const afterRange = loadPeriodIds(manager, "checkins");

    assert(
      status?.persistErrorCode === "missing-checkin-time",
      "Checkin missing time should publish persistErrorCode.",
    );
    assert(
      afterRange.items.length === 0,
      "Blocked checkin write should not persist invalid items.",
    );

    return {
      errorCode: error?.code || null,
      persistErrorCode: status?.persistErrorCode || null,
      checkinCount: afterRange.items.length,
    };
  });
}

const scenarioDefinitions = [
  {
    name: "load-duplicate-project-id-enters-needs-recovery",
    run: scenarioDuplicateProjectLoadTriggersRecovery,
  },
  {
    name: "replace-core-blocks-duplicate-project-id",
    run: scenarioDuplicateProjectWriteBlocked,
  },
  {
    name: "replace-records-blocks-duplicate-record-id",
    run: scenarioDuplicateRecordReplaceBlocked,
  },
  {
    name: "patch-records-blocks-duplicate-record-id",
    run: scenarioDuplicateRecordPatchBlocked,
  },
  {
    name: "replace-records-blocks-missing-record-time",
    run: scenarioRecordMissingTimeBlocked,
  },
  {
    name: "replace-records-blocks-missing-record-reference",
    run: scenarioRecordMissingReferenceBlocked,
  },
  {
    name: "replace-plans-blocks-missing-plan-date",
    run: scenarioPlanMissingDateBlocked,
  },
  {
    name: "replace-diary-blocks-missing-diary-date",
    run: scenarioDiaryMissingDateBlocked,
  },
  {
    name: "replace-daily-checkins-blocks-missing-date",
    run: scenarioDailyCheckinMissingDateBlocked,
  },
  {
    name: "replace-checkins-blocks-missing-time",
    run: scenarioCheckinMissingTimeBlocked,
  },
];

async function main() {
  const scenarios = [];
  for (const scenario of scenarioDefinitions) {
    try {
      const details = await scenario.run();
      scenarios.push(createScenarioResult(scenario.name, true, details));
    } catch (error) {
      scenarios.push(
        createScenarioResult(scenario.name, false, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : "",
        }),
      );
    }
  }

  const allPassed = scenarios.every((scenario) => scenario.pass === true);
  console.log(
    JSON.stringify(
      {
        allPassed,
        periodId: FIXTURE_PERIOD_ID,
        scenarios,
      },
      null,
      2,
    ),
  );

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
