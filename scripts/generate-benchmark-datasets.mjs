import fs from "fs-extra";
import path from "path";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const StorageManager = require("../storage-manager.js");

const DATASET_SPECS = {
  S: { records: 1_000, plans: 1_200, diaryEntries: 240, checkins: 900 },
  M: { records: 100_000, plans: 8_000, diaryEntries: 2_400, checkins: 12_000 },
  L: { records: 500_000, plans: 18_000, diaryEntries: 6_000, checkins: 36_000 },
  XL: { records: 1_000_000, plans: 32_000, diaryEntries: 12_000, checkins: 72_000 },
};

function parseRequestedSizes(argv = process.argv.slice(2)) {
  const explicit = argv
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((value) => Object.prototype.hasOwnProperty.call(DATASET_SPECS, value));
  return explicit.length ? explicit : Object.keys(DATASET_SPECS);
}

function isoAt(baseDate, dayOffset, minuteOffset, durationMinutes = 30) {
  const startDate = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCMinutes(minuteOffset);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return {
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    dateKey: startDate.toISOString().slice(0, 10),
  };
}

function buildProjects(count = 24) {
  const projects = [];
  for (let index = 0; index < count; index += 1) {
    const level = index < 6 ? 1 : index < 14 ? 2 : 3;
    const parentId =
      level === 1
        ? null
        : level === 2
          ? `project_${index % 6}`
          : `project_${6 + (index % 8)}`;
    projects.push({
      id: `project_${index}`,
      name: `项目 ${index + 1}`,
      level,
      parentId,
      color: `#${((index * 2654435761) >>> 0).toString(16).slice(0, 6).padEnd(6, "0")}`,
      cachedDirectDurationMs: 0,
      cachedTotalDurationMs: 0,
      totalDurationMs: 0,
      createdAt: new Date(Date.UTC(2024, 0, 1)).toISOString(),
    });
  }
  return projects;
}

function buildState(spec, datasetName) {
  const baseDate = new Date();
  baseDate.setUTCHours(0, 0, 0, 0);
  baseDate.setUTCDate(baseDate.getUTCDate() - 729);
  const projects = buildProjects(datasetName === "S" ? 12 : datasetName === "M" ? 18 : 24);
  const diaryCategories = [
    { id: "cat_reflect", name: "复盘", color: "#2f855a" },
    { id: "cat_work", name: "工作", color: "#2b6cb0" },
    { id: "cat_life", name: "生活", color: "#d69e2e" },
  ];

  const records = Array.from({ length: spec.records }, (_, index) => {
    const project = projects[index % projects.length];
    const durationMinutes = 15 + (index % 9) * 15;
    const { startTime, endTime } = isoAt(
      baseDate,
      index % 730,
      (index * 37) % (20 * 60),
      durationMinutes,
    );
    return {
      id: `record_${index}`,
      projectId: project.id,
      name: project.name,
      startTime,
      endTime,
      timestamp: endTime,
      spendtime: `${durationMinutes}分钟`,
      durationMs: durationMinutes * 60 * 1000,
      clickCount: index + 1,
    };
  });

  const plans = Array.from({ length: spec.plans }, (_, index) => {
    const { dateKey } = isoAt(baseDate, index % 1095, (index * 23) % (18 * 60), 45);
    const repeatOptions = ["none", "none", "weekly", "monthly"];
    const repeat = repeatOptions[index % repeatOptions.length];
    return {
      id: `plan_${index}`,
      name: `计划 ${index + 1}`,
      date: dateKey,
      startTime: `${String(8 + (index % 9)).padStart(2, "0")}:00`,
      endTime: `${String(9 + (index % 9)).padStart(2, "0")}:00`,
      color: index % 2 === 0 ? "#79af85" : "#ed8936",
      repeat,
      repeatDays: repeat === "weekly" ? [index % 7] : [],
      excludedDates: [],
      createdAt: new Date(Date.UTC(2024, 0, 1) + index * 10_000).toISOString(),
      isCompleted: index % 13 === 0,
    };
  });

  const todos = Array.from({ length: Math.max(120, Math.round(spec.plans / 12)) }, (_, index) => ({
    id: `todo_${index}`,
    title: `待办 ${index + 1}`,
    description: `用于 ${datasetName} 基准的待办样本 ${index + 1}`,
    dueDate: isoAt(baseDate, index % 365, 8 * 60).dateKey,
    priority: ["low", "medium", "high"][index % 3],
    tags: [`tag-${index % 6}`, `batch-${index % 12}`],
    repeatType: index % 5 === 0 ? "weekly" : "none",
    repeatWeekdays: index % 5 === 0 ? [index % 7] : [],
    startDate: isoAt(baseDate, index % 365, 8 * 60).dateKey,
    endDate: index % 5 === 0 ? isoAt(baseDate, (index % 365) + 120, 8 * 60).dateKey : "",
    completed: index % 7 === 0,
    completedAt: index % 7 === 0 ? new Date(Date.UTC(2025, 0, 1) + index * 5_000).toISOString() : null,
    color: index % 3 === 2 ? "#f56565" : index % 3 === 1 ? "#ed8936" : "#79af85",
  }));

  const checkinItems = Array.from({ length: Math.max(80, Math.round(spec.plans / 25)) }, (_, index) => ({
    id: `checkin_item_${index}`,
    title: `打卡项 ${index + 1}`,
    startDate: isoAt(baseDate, index % 365, 0).dateKey,
    endDate: "",
    repeatType: index % 3 === 0 ? "weekly" : "daily",
    repeatWeekdays: index % 3 === 0 ? [index % 7] : [],
    color: index % 2 === 0 ? "#4299e1" : "#9f7aea",
  }));

  const dailyCheckins = Array.from({ length: Math.max(300, Math.round(spec.checkins / 6)) }, (_, index) => ({
    itemId: checkinItems[index % checkinItems.length].id,
    date: isoAt(baseDate, index % 365, 0).dateKey,
    checked: index % 4 !== 0,
  }));

  const checkins = Array.from({ length: spec.checkins }, (_, index) => ({
    id: `checkin_${index}`,
    todoId: todos[index % todos.length].id,
    time: isoAt(baseDate, index % 730, (index * 17) % (22 * 60)).endTime,
    updatedAt: isoAt(baseDate, index % 730, (index * 17) % (22 * 60)).endTime,
    message: `进度记录 ${index + 1}`,
  }));

  const diaryEntries = Array.from({ length: spec.diaryEntries }, (_, index) => ({
    id: `diary_${index}`,
    date: isoAt(baseDate, index % 730, 0).dateKey,
    title: `日记 ${index + 1}`,
    content: `这是 ${datasetName} 数据集中的第 ${index + 1} 条日记内容，用于测试冷启动与范围加载。`,
    categoryId: diaryCategories[index % diaryCategories.length].id,
    updatedAt: new Date(Date.UTC(2025, 0, 1) + index * 30_000).toISOString(),
  }));

  return {
    projects,
    records,
    plans,
    todos,
    checkinItems,
    dailyCheckins,
    checkins,
    yearlyGoals: {
      annual: Array.from({ length: 12 }, (_, index) => ({
        id: `goal_${index}`,
        title: `年度目标 ${index + 1}`,
        description: `面向 ${datasetName} 的年度目标样本 ${index + 1}`,
        priority: ["low", "medium", "high"][index % 3],
        createdAt: new Date(Date.UTC(2024, index % 12, 1)).toISOString(),
      })),
    },
    diaryEntries,
    diaryCategories,
    guideState: {
      bundleVersion: 2,
      dismissedCardIds: [],
      dismissedGuideDiaryEntryIds: [],
    },
    customThemes: [],
    builtInThemeOverrides: {},
    selectedTheme: "default",
    timerSessionState: {
      sessionVersion: 2,
      ptn: 1,
      fpt: new Date("2026-03-01T08:00:00.000Z").toISOString(),
      spt: null,
      lastspt: null,
      selectedProject: projects[0]?.name || "",
      nextProject: projects[1]?.name || "",
      lastEnteredProjectName: projects[0]?.name || "",
    },
    createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    lastModified: new Date().toISOString(),
  };
}

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

async function writeDatasetBundle(datasetName, outputRoot, spec) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `order-bench-${datasetName.toLowerCase()}-`));
  const manager = new StorageManager(createFakeApp(tempRoot));
  const bundleRoot = path.join(outputRoot, datasetName);
  await fs.remove(bundleRoot);
  await fs.ensureDir(bundleRoot);
  const state = buildState(spec, datasetName);
  manager.writeBundleFromState(bundleRoot, state, {
    touchModified: true,
    touchSyncSave: true,
  });
  manager.stopWatching();
  await fs.writeJson(
    path.join(bundleRoot, "dataset-summary.json"),
    {
      dataset: datasetName,
      ...spec,
      projectCount: state.projects.length,
      todoCount: state.todos.length,
      checkinItemCount: state.checkinItems.length,
      dailyCheckinCount: state.dailyCheckins.length,
    },
    { spaces: 2 },
  );
  return {
    dataset: datasetName,
    output: bundleRoot,
    summary: {
      projects: state.projects.length,
      records: state.records.length,
      plans: state.plans.length,
      todos: state.todos.length,
      diaryEntries: state.diaryEntries.length,
      checkins: state.checkins.length,
    },
  };
}

async function main() {
  const requestedSizes = parseRequestedSizes();
  const outputRoot = path.resolve("benchmarks", "datasets");
  await fs.ensureDir(outputRoot);
  const results = [];
  for (const datasetName of requestedSizes) {
    console.log(`Generating dataset ${datasetName} ...`);
    results.push(
      await writeDatasetBundle(datasetName, outputRoot, DATASET_SPECS[datasetName]),
    );
  }
  console.log(JSON.stringify(results, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
