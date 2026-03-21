import fs from "fs-extra";
import path from "path";
import { DEFAULT_PAGES, runBenchmark } from "./benchmark-storage-cold-start.mjs";

const DEFAULT_DATASETS = ["S", "M", "L", "XL"];
const DEFAULT_SCENARIOS = ["warm-sidecar", "sidecar-missing"];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    datasets: [...DEFAULT_DATASETS],
    pages: [...DEFAULT_PAGES],
    scenarios: [...DEFAULT_SCENARIOS],
    output: "",
    runsByDataset: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--datasets" && argv[index + 1]) {
      args.datasets = String(argv[index + 1])
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
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
    if (token === "--scenarios" && argv[index + 1]) {
      args.scenarios = String(argv[index + 1])
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (token === "--runs" && argv[index + 1]) {
      const requestedRuns = Math.max(1, Number.parseInt(argv[index + 1], 10) || 1);
      args.datasets.forEach((dataset) => {
        args.runsByDataset[dataset] = requestedRuns;
      });
      index += 1;
      continue;
    }
    if (token === "--output" && argv[index + 1]) {
      args.output = String(argv[index + 1]).trim();
      index += 1;
    }
  }
  return args;
}

function getRunsForDataset(dataset, runsByDataset = {}) {
  if (Number.isFinite(runsByDataset?.[dataset]) && runsByDataset[dataset] > 0) {
    return Math.max(1, Math.floor(runsByDataset[dataset]));
  }
  return dataset === "S" || dataset === "M" ? 2 : 1;
}

function createScenarioOptions(scenarioKey) {
  if (scenarioKey === "sidecar-missing") {
    return {
      scenario: scenarioKey,
      resetSidecarBeforeRun: true,
    };
  }
  return {
    scenario: "warm-sidecar",
    resetSidecarBeforeRun: false,
  };
}

function summarizeVariation(results = []) {
  const warmResults = results.filter((entry) => entry?.scenario === "warm-sidecar");
  const pageBuckets = new Map();
  warmResults.forEach((entry) => {
    (Array.isArray(entry?.summary?.pages) ? entry.summary.pages : []).forEach((page) => {
      const bucket = pageBuckets.get(page.page) || [];
      bucket.push(Math.max(0, Number(page?.avgMs || 0)));
      pageBuckets.set(page.page, bucket);
    });
  });
  return Array.from(pageBuckets.entries()).map(([page, values]) => {
    const maxValue = Math.max(...values, 0);
    const minValue = values.length ? Math.min(...values) : 0;
    return {
      page,
      minAvgMs: Number(minValue.toFixed(2)),
      maxAvgMs: Number(maxValue.toFixed(2)),
      variationPct: maxValue > 0
        ? Number((((maxValue - minValue) / maxValue) * 100).toFixed(2))
        : 0,
    };
  });
}

async function main() {
  const args = parseArgs();
  const results = [];
  for (const dataset of args.datasets) {
    for (const scenario of args.scenarios) {
      const result = await runBenchmark(
        dataset,
        args.pages,
        getRunsForDataset(dataset, args.runsByDataset),
        createScenarioOptions(scenario),
      );
      results.push(result);
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    datasets: args.datasets,
    scenarios: args.scenarios,
    pages: args.pages,
    results,
    warmSidecarVariation: summarizeVariation(results),
  };
  if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, payload, { spaces: 2 });
  }
  console.log(JSON.stringify(payload, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
