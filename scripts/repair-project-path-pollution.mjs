import os from "os";
import path from "path";
import fs from "fs-extra";

import StorageManager from "../storage-manager.js";
import bundleHelper from "../pages/storage-bundle.js";

function parseArgs(argv = []) {
  const result = {
    root: "",
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || "").trim();
    if (!value) {
      continue;
    }
    if (value === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if ((value === "--root" || value === "-r") && argv[index + 1]) {
      result.root = String(argv[index + 1] || "").trim();
      index += 1;
    }
  }
  return result;
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return fs.readJsonSync(filePath);
  } catch (error) {
    return fallback;
  }
}

function loadRawBundleState(root) {
  const manifest =
    readJsonFile(path.join(root, bundleHelper.MANIFEST_FILE_NAME), null) ||
    bundleHelper.createEmptyBundle().manifest;
  const core =
    readJsonFile(path.join(root, bundleHelper.CORE_FILE_NAME), null) || {};
  const recurringPlans = readJsonFile(
    path.join(root, bundleHelper.RECURRING_PLANS_FILE_NAME),
    [],
  );
  const partitionMap = {};
  bundleHelper.PARTITIONED_SECTIONS.forEach((section) => {
    const sectionMap = new Map();
    (manifest.sections?.[section]?.partitions || []).forEach((partition) => {
      const periodId = String(partition?.periodId || "").trim();
      const relativePath = String(partition?.file || "").trim();
      if (!periodId || !relativePath) {
        return;
      }
      const envelope = readJsonFile(path.join(root, relativePath), null);
      sectionMap.set(
        periodId,
        Array.isArray(envelope?.items) ? envelope.items : [],
      );
    });
    partitionMap[section] = sectionMap;
  });
  return bundleHelper.buildLegacyStateFromBundle({
    manifest,
    core,
    recurringPlans: Array.isArray(recurringPlans) ? recurringPlans : [],
    partitionMap,
  });
}

function countPathLikeRecords(records = []) {
  return bundleHelper
    .ensureArray(records)
    .filter((record) => bundleHelper.isProjectPathLikeName(record?.name))
    .length;
}

function countPathLikeProjects(projects = []) {
  return bundleHelper
    .ensureArray(projects)
    .filter((project) => bundleHelper.isProjectPathLikeName(project?.name))
    .length;
}

function countPeriodRecordsWithPathNames(records = [], periodId = "") {
  return bundleHelper
    .ensureArray(records)
    .filter(
      (record) =>
        bundleHelper.getPeriodIdForSectionItem("records", record) === periodId &&
        bundleHelper.isProjectPathLikeName(record?.name),
    ).length;
}

function collectSummary(state = {}) {
  const records = Array.isArray(state?.records) ? state.records : [];
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  return {
    recordCount: records.length,
    projectCount: projects.length,
    pathLikeRecordCount: countPathLikeRecords(records),
    pathLikeProjectCount: countPathLikeProjects(projects),
    janPathLikeRecordCount: countPeriodRecordsWithPathNames(records, "2026-01"),
    febPathLikeRecordCount: countPeriodRecordsWithPathNames(records, "2026-02"),
    marPathLikeRecordCount: countPeriodRecordsWithPathNames(records, "2026-03"),
    recordPeriods: bundleHelper.getPeriodIdsForRange("2026-01-01", "2026-03-31"),
  };
}

function createFakeApp(tempBase) {
  return {
    getName() {
      return "Order";
    },
    getPath(name) {
      if (name === "userData") {
        return path.join(tempBase, "userData");
      }
      if (name === "documents") {
        return path.join(tempBase, "documents");
      }
      throw new Error(`Unsupported app path key: ${name}`);
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || "");
  if (!root) {
    throw new Error("缺少 --root 参数");
  }
  if (!(await fs.pathExists(root))) {
    throw new Error(`目标目录不存在: ${root}`);
  }

  const rawState = loadRawBundleState(root);
  const before = collectSummary(rawState);
  const repairPreview = bundleHelper.repairPathNamedRecordProjects(
    rawState.projects,
    rawState.records,
  );

  let after = before;
  let manager = null;
  if (!args.dryRun) {
    const tempBase = path.join(
      os.tmpdir(),
      "order-project-path-repair",
      `${Date.now()}`,
    );
    await fs.ensureDir(tempBase);
    manager = new StorageManager(createFakeApp(tempBase));
    const normalizedState = manager.writeBundleFromState(root, rawState, {
      touchModified: true,
      touchSyncSave: true,
    });
    after = collectSummary(normalizedState);
  }

  console.log(
    JSON.stringify(
      {
        root,
        dryRun: args.dryRun,
        repairPreview: {
          changed: repairPreview.changed,
          mergedProjectCount: repairPreview.mergedProjectCount,
          renamedProjectCount: repairPreview.renamedProjectCount,
          repairedRecordCount: repairPreview.repairedRecordCount,
        },
        before,
        after,
      },
      null,
      2,
    ),
  );
  if (typeof manager?.stopWatching === "function") {
    manager.stopWatching();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
