import fs from "fs-extra";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const StorageManager = require("../storage-manager.js");

const DEFAULT_PAGES = ["index", "plan", "todo", "diary", "stats", "settings"];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dataset: "S",
    pages: [...DEFAULT_PAGES],
    runs: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--dataset" && argv[index + 1]) {
      args.dataset = String(argv[index + 1]).trim().toUpperCase();
      index += 1;
      continue;
    }
    if (token === "--pages" && argv[index + 1]) {
      args.pages = String(argv[index + 1])
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (token === "--runs" && argv[index + 1]) {
      args.runs = Math.max(1, Number.parseInt(argv[index + 1], 10) || 1);
      index += 1;
    }
  }
  return args;
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

async function instantiateManager(storageManifestPath, tempRoot) {
  const manager = new StorageManager(createFakeApp(tempRoot));
  manager.writeConfig({
    storagePath: storageManifestPath,
  });
  manager.storagePath = storageManifestPath;
  manager.ensureStorageReady();
  return manager;
}

function summarizeBenchmarkMeasurements(measurements = []) {
  const pageMap = new Map();
  let initTotalMs = 0;
  let pageTotalMs = 0;
  let pageCount = 0;
  measurements.forEach((run) => {
    initTotalMs += Math.max(0, Number(run?.managerInitMs || 0));
    (Array.isArray(run?.pages) ? run.pages : []).forEach((pageEntry) => {
      const pageKey = String(pageEntry?.page || "").trim() || "unknown";
      const durationMs = Math.max(0, Number(pageEntry?.durationMs || 0));
      const bucket = pageMap.get(pageKey) || [];
      bucket.push(durationMs);
      pageMap.set(pageKey, bucket);
      pageTotalMs += durationMs;
      pageCount += 1;
    });
  });
  const average = (numbers = []) =>
    numbers.length
      ? Number(
          (
            numbers.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) /
            numbers.length
          ).toFixed(2),
        )
      : 0;
  return {
    averageManagerInitMs: measurements.length
      ? Number((initTotalMs / measurements.length).toFixed(2))
      : 0,
    averagePageBootstrapMs: pageCount ? Number((pageTotalMs / pageCount).toFixed(2)) : 0,
    pages: Array.from(pageMap.entries()).map(([page, values]) => ({
      page,
      avgMs: average(values),
      maxMs: Number(Math.max(...values).toFixed(2)),
      minMs: Number(Math.min(...values).toFixed(2)),
    })),
  };
}

async function runBenchmark(datasetName, pages, runs, options = {}) {
  const datasetRoot = path.resolve("benchmarks", "datasets", datasetName);
  const manifestPath = path.join(datasetRoot, "bundle-manifest.json");
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`Dataset ${datasetName} not found at ${manifestPath}`);
  }

  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), `order-bench-run-${datasetName.toLowerCase()}-`));
  const primeManager = await instantiateManager(manifestPath, runtimeRoot);
  const rebuildStartedAt = performance.now();
  await primeManager.requestSidecarIndexRebuild(primeManager.storagePath, {
    fullRebuild: true,
  });
  const primeRebuildMs = Number((performance.now() - rebuildStartedAt).toFixed(2));
  const sidecarDirectory = primeManager.getSidecarDirectory(primeManager.storagePath);
  primeManager.stopWatching();

  const measurements = [];
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    if (options.resetSidecarBeforeRun === true) {
      await fs.remove(sidecarDirectory);
    }
    const initStartedAt = performance.now();
    const runManager = await instantiateManager(manifestPath, runtimeRoot);
    const managerInitMs = Number((performance.now() - initStartedAt).toFixed(2));
    const pageMeasurements = [];
    for (const pageKey of pages) {
      const startedAt = performance.now();
      const payload = runManager.getPageBootstrapState(pageKey, {});
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      pageMeasurements.push({
        page: pageKey,
        durationMs,
        dataKeys: Object.keys(payload?.data || {}),
        loadedPeriodCount: Array.isArray(payload?.loadedPeriodIds)
          ? payload.loadedPeriodIds.length
          : 0,
      });
    }
    runManager.stopWatching();
    measurements.push({
      run: runIndex + 1,
      managerInitMs,
      pages: pageMeasurements,
    });
  }

  const scenario =
    typeof options?.scenario === "string" && options.scenario.trim()
      ? options.scenario.trim()
      : options.resetSidecarBeforeRun === true
        ? "sidecar-missing"
        : "warm-sidecar";
  return {
    dataset: datasetName,
    scenario,
    runs,
    pages,
    primeRebuildMs,
    measurements,
    summary: summarizeBenchmarkMeasurements(measurements),
  };
}

async function main() {
  const { dataset, pages, runs } = parseArgs();
  const result = await runBenchmark(dataset, pages, runs);
  console.log(JSON.stringify(result, null, 2));
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export {
  DEFAULT_PAGES,
  createFakeApp,
  instantiateManager,
  runBenchmark,
  summarizeBenchmarkMeasurements,
};
