import fs from "fs-extra";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const bundleHelper = require("../pages/storage-bundle.js");
const StorageManager = require("../storage-manager.js");

const PROJECT_DIRECT_DURATION_KEY =
  bundleHelper.PROJECT_DIRECT_DURATION_KEY || "cachedDirectDurationMs";
const PROJECT_TOTAL_DURATION_KEY =
  bundleHelper.PROJECT_TOTAL_DURATION_KEY || "cachedTotalDurationMs";

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
    [PROJECT_DIRECT_DURATION_KEY]: directMs,
    [PROJECT_TOTAL_DURATION_KEY]: totalMs,
  };
}

function createBaseState() {
  return {
    projects: [createProject({ id: "root", name: "Root" })],
    records: [],
    plans: [],
    todos: [],
    checkinItems: [],
    dailyCheckins: [],
    checkins: [],
    diaryEntries: [],
    diaryCategories: [],
    yearlyGoals: {},
    guideState: {
      bundleVersion: 2,
      dismissedCardIds: [],
      dismissedGuideDiaryEntryIds: [],
    },
    customThemes: [],
    builtInThemeOverrides: {},
    selectedTheme: "default",
    timerSessionState: {},
    createdAt: "2025-01-01T00:00:00.000Z",
    lastModified: "2025-01-01T00:00:00.000Z",
  };
}

function mapProjectsById(projects = []) {
  return new Map(
    (Array.isArray(projects) ? projects : [])
      .filter((project) => project && typeof project === "object")
      .map((project) => [String(project.id || "").trim(), project]),
  );
}

function scenarioMissingParentPromotion() {
  const result = bundleHelper.repairProjectHierarchy([
    createProject({ id: "root", name: "Root", level: 1 }),
    createProject({
      id: "orphan",
      name: "Orphan",
      level: 2,
      parentId: "missing-parent",
    }),
  ]);
  const byId = mapProjectsById(result.projects);
  const orphan = byId.get("orphan");
  assert(result.repaired === true, "missing parent should trigger repair");
  assert(orphan?.parentId === null, "orphan should be promoted to root");
  assert(orphan?.level === 1, "orphan should become a level-1 project");
  return {
    orphanLevel: orphan?.level || null,
    orphanParentId: orphan?.parentId ?? null,
  };
}

function scenarioLevelMismatchRepair() {
  const result = bundleHelper.repairProjectHierarchy([
    createProject({ id: "root", name: "Root", level: 1 }),
    createProject({
      id: "child",
      name: "Child",
      level: 3,
      parentId: "root",
    }),
  ]);
  const byId = mapProjectsById(result.projects);
  const child = byId.get("child");
  assert(child?.parentId === "root", "child should keep the valid parent");
  assert(child?.level === 2, "level-3 child under root should be repaired to level 2");
  return {
    childLevel: child?.level || null,
  };
}

function scenarioCycleRepair() {
  const result = bundleHelper.repairProjectHierarchy([
    createProject({ id: "self", name: "Self", level: 2, parentId: "self" }),
    createProject({ id: "a", name: "A", level: 2, parentId: "b" }),
    createProject({ id: "b", name: "B", level: 2, parentId: "a" }),
    createProject({ id: "c", name: "C", level: 2, parentId: "d" }),
    createProject({ id: "d", name: "D", level: 2, parentId: "e" }),
    createProject({ id: "e", name: "E", level: 2, parentId: "c" }),
  ]);
  const byId = mapProjectsById(result.projects);
  ["self", "a", "b", "c", "d", "e"].forEach((projectId) => {
    const project = byId.get(projectId);
    assert(project?.parentId === null, `${projectId} should be detached from cycle`);
    assert(project?.level === 1, `${projectId} should become a level-1 project`);
  });
  return {
    repairedCount: 6,
  };
}

function scenarioDepthFlattening() {
  const result = bundleHelper.repairProjectHierarchy([
    createProject({ id: "l1", name: "L1", level: 1 }),
    createProject({ id: "l2", name: "L2", level: 2, parentId: "l1" }),
    createProject({ id: "l3", name: "L3", level: 3, parentId: "l2" }),
    createProject({ id: "l4", name: "L4", level: 3, parentId: "l3" }),
    createProject({ id: "l5", name: "L5", level: 3, parentId: "l4" }),
  ]);
  const byId = mapProjectsById(result.projects);
  const level4 = byId.get("l4");
  const level5 = byId.get("l5");
  assert(level4?.parentId === "l2", "fourth-level node should be flattened under nearest level-2 ancestor");
  assert(level4?.level === 3, "flattened node should stay at level 3");
  assert(level5?.parentId === "l2", "deeper node should also be flattened under the same level-2 ancestor");
  assert(level5?.level === 3, "deeper flattened node should stay at level 3");
  return {
    l4ParentId: level4?.parentId || null,
    l5ParentId: level5?.parentId || null,
  };
}

async function scenarioStorageBootstrapRepair() {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "order-project-hierarchy-"),
  );
  const manager = new StorageManager(createFakeApp(tempRoot));
  try {
    manager.ensureStorageReady();
    const root = manager.getBundleRoot(manager.storagePath);
    manager.writeBundleFromState(root, createBaseState(), {
      touchModified: true,
      touchSyncSave: true,
    });

    const invalidProjects = [
      createProject({
        id: "root",
        name: "Root",
        level: 1,
        directMs: 60_000,
        totalMs: 60_000,
      }),
      createProject({
        id: "orphan",
        name: "Orphan",
        level: 3,
        parentId: "missing-parent",
        directMs: 120_000,
        totalMs: 120_000,
      }),
    ];
    const corePath = manager.getCorePath(root);
    const core = manager.readJsonFileSync(corePath, {});
    core.projects = invalidProjects;
    manager.writeJsonFileSync(corePath, core);

    const bootstrap = manager.buildPageBootstrapPayload("index", {});
    const repairedProjects = Array.isArray(bootstrap?.data?.projects)
      ? bootstrap.data.projects
      : [];
    const repairedById = mapProjectsById(repairedProjects);
    const repairedOrphan = repairedById.get("orphan");
    assert(
      repairedOrphan?.parentId === null && repairedOrphan?.level === 1,
      "bootstrap should return repaired root projects",
    );
    const repairedCore = manager.readJsonFileSync(corePath, {});
    const repairedCoreById = mapProjectsById(repairedCore.projects || []);
    assert(
      repairedCoreById.get("orphan")?.parentId === null &&
        repairedCoreById.get("orphan")?.level === 1,
      "repair should be persisted back to core.json",
    );
    const visibleRootNames = repairedProjects
      .filter((project) => Number(project?.level) === 1)
      .map((project) => project.name)
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    assert(
      visibleRootNames.includes("Orphan"),
      "repaired root should stay visible to root-only project pickers",
    );
    return {
      visibleRootNames,
      projectCount: repairedProjects.length,
    };
  } finally {
    manager.stopWatching?.();
    try {
      await fs.remove(tempRoot);
    } catch (error) {
      console.warn(
        `Cleanup skipped for ${tempRoot}: ${
          error instanceof Error ? error.message : String(error || "")
        }`,
      );
    }
  }
}

async function main() {
  const scenarios = [
    {
      name: "missing-parent-promotion",
      run: async () => scenarioMissingParentPromotion(),
    },
    {
      name: "level-mismatch-repair",
      run: async () => scenarioLevelMismatchRepair(),
    },
    {
      name: "cycle-repair",
      run: async () => scenarioCycleRepair(),
    },
    {
      name: "depth-flattening",
      run: async () => scenarioDepthFlattening(),
    },
    {
      name: "storage-bootstrap-repair",
      run: async () => scenarioStorageBootstrapRepair(),
    },
  ];

  const results = [];
  let failed = false;

  for (const scenario of scenarios) {
    try {
      const details = await scenario.run();
      results.push({
        name: scenario.name,
        pass: true,
        details,
      });
    } catch (error) {
      failed = true;
      results.push({
        name: scenario.name,
        pass: false,
        details: {
          message: error instanceof Error ? error.message : String(error || ""),
        },
      });
    }
  }

  console.log(JSON.stringify({ ok: !failed, results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
