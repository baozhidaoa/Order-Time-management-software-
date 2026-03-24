import assert from "assert/strict";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import {
  OFFLINE_ASSET_MANIFEST_FILE_NAME,
  OFFLINE_ASSET_MANIFEST_GLOBAL,
  isOfflineAssetManifest,
} from "./offline-assets-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const offlineAssetsDir = path.join(repoRoot, "pages", "offline-assets");

function createBrowserLikeContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (timerId) => clearTimeout(timerId),
    performance: {
      now: () => Date.now(),
    },
    navigator: {
      userAgent: "node",
    },
    location: {
      href: "http://127.0.0.1:3000/pages/stats.html",
    },
    document: {
      body: {},
      documentElement: {
        namespaceURI: "http://www.w3.org/1999/xhtml",
      },
      createElement() {
        return {};
      },
      createElementNS() {
        return {};
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
    },
    Element: function Element() {},
    Node: function Node() {},
    URL,
    URLSearchParams,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.global = context;
  vm.createContext(context);
  return context;
}

async function loadManifest(context) {
  const manifestPath = path.join(
    offlineAssetsDir,
    OFFLINE_ASSET_MANIFEST_FILE_NAME,
  );
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  vm.runInContext(manifestSource, context, {
    filename: manifestPath,
  });

  const manifest = context[OFFLINE_ASSET_MANIFEST_GLOBAL];
  assert.ok(
    isOfflineAssetManifest(manifest),
    "离线资源 manifest 无效或未正确挂载到全局",
  );
  return manifest;
}

async function runScriptInContext(context, filePath) {
  const source = await fs.readFile(filePath, "utf8");
  vm.runInContext(source, context, {
    filename: filePath,
  });
}

async function main() {
  const context = createBrowserLikeContext();
  const manifest = await loadManifest(context);

  const assetExpectations = [
    {
      key: "chart",
      globalName: "Chart",
    },
    {
      key: "d3",
      globalName: "d3",
    },
    {
      key: "calHeatmapJs",
      globalName: "CalHeatmap",
    },
  ];

  for (const expectation of assetExpectations) {
    const fileName = String(manifest[expectation.key] || "").trim();
    assert.ok(fileName, `manifest 缺少离线资源: ${expectation.key}`);
    await runScriptInContext(context, path.join(offlineAssetsDir, fileName));
    assert.ok(
      typeof context[expectation.globalName] !== "undefined",
      `离线资源未挂载全局变量: ${expectation.globalName}`,
    );
  }

  console.log("离线运行时冒烟校验通过。");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
