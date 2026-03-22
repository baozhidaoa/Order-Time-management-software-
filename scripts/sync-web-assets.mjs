import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sharedContractSourcePath = path.join(
  repoRoot,
  "shared",
  "platform-contract.js",
);
const pagesContractTargetPath = path.join(
  repoRoot,
  "pages",
  "platform-contract.js",
);
const mobileContractTargetPath = path.join(
  repoRoot,
  "ControlerApp",
  "platform-contract.js",
);
const offlineAssetsDir = path.join(repoRoot, "pages", "offline-assets");
const embeddedAssetsDir = path.join(repoRoot, "pages", "embedded-assets");
const chartRuntimeSourcePath = path.join(
  repoRoot,
  "node_modules",
  "chart.js",
  "dist",
  "chart.umd.js",
);
const mobileAndroidWebDir = path.join(
  repoRoot,
  "ControlerApp",
  "android",
  "app",
  "src",
  "main",
  "assets",
  "controler-web",
);
const mobileIosWebDir = path.join(
  repoRoot,
  "ControlerApp",
  "ios",
  "controler-web",
);
const pagesSourceDir = path.join(repoRoot, "pages");
const mobileWebDirs = [mobileAndroidWebDir, mobileIosWebDir];

const assets = [
  {
    from: chartRuntimeSourcePath,
    to: path.join(offlineAssetsDir, "chart.runtime.js"),
  },
  {
    from: path.join(repoRoot, "node_modules", "d3", "dist", "d3.min.js"),
    to: path.join(offlineAssetsDir, "d3.min.js"),
  },
  {
    from: path.join(repoRoot, "node_modules", "d3", "dist", "d3.min.js"),
    to: path.join(offlineAssetsDir, "d3.runtime.js"),
  },
  {
    from: path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.min.js",
    ),
    to: path.join(offlineAssetsDir, "cal-heatmap.min.js"),
  },
  {
    from: path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.min.js",
    ),
    to: path.join(offlineAssetsDir, "cal-heatmap.runtime.js"),
  },
  {
    from: path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.css",
    ),
    to: path.join(offlineAssetsDir, "cal-heatmap.css"),
  },
];

const offlineAssetSourceByName = new Map(
  assets.map((asset) => [path.basename(asset.to), asset.from]),
);

const mobileBootBundleEntries = {
  "mobile-common-boot.js": [
    {
      label: "manual-native-page-ready",
      inline: 'window.__CONTROLER_NATIVE_PAGE_READY_MODE__ = "manual";',
    },
    { label: "shared/platform-contract.js", file: sharedContractSourcePath },
    { label: "pages/rn-bridge.js", file: path.join(pagesSourceDir, "rn-bridge.js") },
    {
      label: "pages/storage-bundle.js",
      file: path.join(pagesSourceDir, "storage-bundle.js"),
    },
    {
      label: "pages/storage-adapter.js",
      file: path.join(pagesSourceDir, "storage-adapter.js"),
    },
    {
      label: "pages/widget-bridge.js",
      file: path.join(pagesSourceDir, "widget-bridge.js"),
    },
    { label: "pages/i18n.js", file: path.join(pagesSourceDir, "i18n.js") },
    {
      label: "pages/i18n-extra.js",
      file: path.join(pagesSourceDir, "i18n-extra.js"),
    },
    {
      label: "pages/theme-init.js",
      file: path.join(pagesSourceDir, "theme-init.js"),
    },
    {
      label: "pages/ui-helpers.js",
      file: path.join(pagesSourceDir, "ui-helpers.js"),
    },
  ],
  "index-boot.js": [
    {
      label: "pages/project-stats-utils.js",
      file: path.join(pagesSourceDir, "project-stats-utils.js"),
    },
    {
      label: "pages/data-index.js",
      file: path.join(pagesSourceDir, "data-index.js"),
    },
    { label: "pages/index.js", file: path.join(pagesSourceDir, "index.js") },
  ],
  "diary-boot.js": [
    {
      label: "pages/data-index.js",
      file: path.join(pagesSourceDir, "data-index.js"),
    },
    { label: "pages/diary.js", file: path.join(pagesSourceDir, "diary.js") },
  ],
  "plan-boot.js": [
    {
      label: "pages/data-index.js",
      file: path.join(pagesSourceDir, "data-index.js"),
    },
    { label: "pages/plan.js", file: path.join(pagesSourceDir, "plan.js") },
  ],
  "todo-boot.js": [
    { label: "pages/todo.js", file: path.join(pagesSourceDir, "todo.js") },
  ],
  "stats-boot.js": [
    {
      label: "pages/project-stats-utils.js",
      file: path.join(pagesSourceDir, "project-stats-utils.js"),
    },
    {
      label: "pages/data-index.js",
      file: path.join(pagesSourceDir, "data-index.js"),
    },
    { label: "pages/stats.js", file: path.join(pagesSourceDir, "stats.js") },
  ],
};

const mobileBootstrapPages = ["index", "diary", "plan", "todo", "stats"];

function formatRelativeRepoPath(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

function getOfflineAssetFallbackSource(sourcePath) {
  if (
    path.normalize(path.dirname(sourcePath)) !== path.normalize(offlineAssetsDir)
  ) {
    return null;
  }
  return offlineAssetSourceByName.get(path.basename(sourcePath)) || null;
}

async function copyFileWithEpermTolerance(fromPath, toPath) {
  try {
    await fs.copy(fromPath, toPath, { overwrite: true });
    return true;
  } catch (error) {
    if (error?.code === "EPERM") {
      console.warn(`跳过被占用的资源文件: ${formatRelativeRepoPath(toPath)}`);
      return false;
    }
    throw error;
  }
}

async function canReuseExistingCopy(fromPath, toPath) {
  try {
    if (!(await fs.pathExists(toPath))) {
      return false;
    }

    const [fromStats, toStats] = await Promise.all([
      fs.stat(fromPath),
      fs.stat(toPath),
    ]);

    return (
      fromStats.isFile() &&
      toStats.isFile() &&
      fromStats.size === toStats.size &&
      Math.trunc(fromStats.mtimeMs) === Math.trunc(toStats.mtimeMs)
    );
  } catch (error) {
    if (error?.code === "EPERM") {
      return true;
    }
    return false;
  }
}

async function copyRuntimeAsset(fromPath, toPath) {
  try {
    await fs.copy(fromPath, toPath, { overwrite: true });
  } catch (error) {
    if (
      error?.code === "EPERM" &&
      (await canReuseExistingCopy(fromPath, toPath))
    ) {
      return;
    }
    if (error?.code === "EPERM") {
      console.warn(`跳过被占用的资源文件: ${formatRelativeRepoPath(toPath)}`);
      return;
    }
    throw error;
  }
}

async function copyDirectoryTree(sourceDir, targetDir) {
  await fs.ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir);

  for (const entry of entries) {
    if (
      sourceDir === pagesSourceDir &&
      entry === "runtime-assets"
    ) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    let sourcePathForCopy = sourcePath;
    let sourceStats = null;

    try {
      sourceStats = await fs.stat(sourcePath);
    } catch (error) {
      if (error?.code !== "EPERM") {
        throw error;
      }
      if (error?.code === "EPERM") {
        const fallbackSourcePath = getOfflineAssetFallbackSource(sourcePath);
        if (fallbackSourcePath) {
          sourcePathForCopy = fallbackSourcePath;
          sourceStats = await fs.stat(sourcePathForCopy);
        } else {
          console.warn(
            `跳过被占用的资源文件: ${formatRelativeRepoPath(sourcePath)}`,
          );
          continue;
        }
      }
    }

    if (sourceStats.isDirectory()) {
      await copyDirectoryTree(sourcePath, targetPath);
      continue;
    }

    if (!sourceStats.isFile()) {
      continue;
    }

    try {
      await fs.copy(sourcePathForCopy, targetPath, { overwrite: true });
    } catch (error) {
      if (error?.code === "EPERM") {
        const fallbackSourcePath = getOfflineAssetFallbackSource(sourcePath);
        if (fallbackSourcePath) {
          await fs.copy(fallbackSourcePath, targetPath, { overwrite: true });
          continue;
        }
        console.warn(
          `跳过被占用的资源文件: ${formatRelativeRepoPath(sourcePath)}`,
        );
        continue;
      }
      throw error;
    }
  }
}

async function buildMobileBootBundles() {
  const bundles = new Map();

  for (const [bundleName, entries] of Object.entries(mobileBootBundleEntries)) {
    const segments = [];
    for (const entry of entries) {
      if (typeof entry.inline === "string") {
        segments.push(`;/* ${entry.label} */\n${entry.inline}\n`);
        continue;
      }

      const sourceText = await fs.readFile(entry.file, "utf8");
      segments.push(`;/* ${entry.label} */\n${sourceText}\n`);
    }
    bundles.set(bundleName, segments.join("\n"));
  }

  return bundles;
}

async function writeMobileBootBundles(targetDir, bundles) {
  for (const [bundleName, bundleContent] of bundles.entries()) {
    await fs.writeFile(
      path.join(targetDir, bundleName),
      `${bundleContent}\n`,
      "utf8",
    );
  }
}

async function rewriteMobileBootstrapHtml(targetDir, pageKey) {
  const htmlPath = path.join(targetDir, `${pageKey}.html`);
  if (!(await fs.pathExists(htmlPath))) {
    return;
  }

  const html = await fs.readFile(htmlPath, "utf8");
  const titleEndIndex = html.indexOf("</title>");
  const firstScriptIndex =
    titleEndIndex === -1 ? -1 : html.indexOf("<script", titleEndIndex);
  const stylesheetIndex =
    titleEndIndex === -1
      ? -1
      : html.indexOf('<link rel="stylesheet"', titleEndIndex);

  if (
    titleEndIndex === -1 ||
    firstScriptIndex === -1 ||
    stylesheetIndex === -1 ||
    firstScriptIndex >= stylesheetIndex
  ) {
    throw new Error(
      `无法识别移动端 HTML 启动脚本区域: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }

  const bootstrapScripts =
    `    <script defer src="mobile-common-boot.js"></script>\n` +
    `    <script defer src="${pageKey}-boot.js"></script>\n`;
  const pageScriptPattern = new RegExp(
    `\\s*<script\\s+src="${pageKey}\\.js(?:\\?[^"]*)?"\\s*><\\/script>\\s*`,
    "i",
  );
  const rewrittenHtml = (
    html.slice(0, firstScriptIndex) +
    bootstrapScripts +
    html.slice(stylesheetIndex)
  ).replace(pageScriptPattern, "\n");

  await fs.writeFile(htmlPath, rewrittenHtml, "utf8");
}

async function validateMobileBootBundles(targetDir, bundles) {
  for (const [bundleName, bundleContent] of bundles.entries()) {
    const bundlePath = path.join(targetDir, bundleName);
    const actualContent = await fs.readFile(bundlePath, "utf8");
    const expectedContent = `${bundleContent}\n`;
    if (actualContent !== expectedContent) {
      throw new Error(
        `移动端启动 bundle 校验失败: ${formatRelativeRepoPath(bundlePath)}`,
      );
    }
  }
}

async function validateMobileBootstrapHtml(targetDir, pageKey) {
  const htmlPath = path.join(targetDir, `${pageKey}.html`);
  if (!(await fs.pathExists(htmlPath))) {
    return;
  }
  const html = await fs.readFile(htmlPath, "utf8");
  const commonBootScript = `<script defer src="mobile-common-boot.js"></script>`;
  const pageBootScript = `<script defer src="${pageKey}-boot.js"></script>`;
  const legacyPageScriptPattern = new RegExp(
    `<script\\s+src="${pageKey}\\.js(?:\\?[^"]*)?"\\s*><\\/script>`,
    "i",
  );
  if (!html.includes(commonBootScript) || !html.includes(pageBootScript)) {
    throw new Error(
      `移动端 HTML 启动脚本校验失败: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }
  if (legacyPageScriptPattern.test(html)) {
    throw new Error(
      `移动端 HTML 仍引用旧页面脚本: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }
}

await fs.ensureDir(offlineAssetsDir);
await fs.ensureDir(embeddedAssetsDir);
if (!(await fs.pathExists(sharedContractSourcePath))) {
  throw new Error(`缺少共享平台契约文件: ${sharedContractSourcePath}`);
}

await copyFileWithEpermTolerance(sharedContractSourcePath, pagesContractTargetPath);

for (const asset of assets) {
  if (!(await fs.pathExists(asset.from))) {
    throw new Error(`缺少资源文件: ${asset.from}`);
  }
  await copyRuntimeAsset(asset.from, asset.to);
  await copyRuntimeAsset(
    asset.from,
    path.join(embeddedAssetsDir, path.basename(asset.to)),
  );
}

const expectedRuntimeAssetFiles = new Set(
  assets.map((asset) => path.basename(asset.to)),
);
for (const runtimeAssetDir of [offlineAssetsDir, embeddedAssetsDir]) {
  for (const entry of await fs.readdir(runtimeAssetDir)) {
    const fullPath = path.join(runtimeAssetDir, entry);
    let stats = null;
    try {
      stats = await fs.stat(fullPath);
    } catch (error) {
      if (error?.code === "EPERM") {
        continue;
      }
      throw error;
    }
    if (stats.isFile() && !expectedRuntimeAssetFiles.has(entry)) {
      await fs.remove(fullPath);
    }
  }
}

if (await fs.pathExists(path.join(repoRoot, "ControlerApp"))) {
  await copyFileWithEpermTolerance(
    sharedContractSourcePath,
    mobileContractTargetPath,
  );

  await fs.emptyDir(mobileAndroidWebDir);
  await fs.emptyDir(mobileIosWebDir);
  await copyDirectoryTree(pagesSourceDir, mobileAndroidWebDir);
  await copyDirectoryTree(pagesSourceDir, mobileIosWebDir);

  const mobileBootBundles = await buildMobileBootBundles();
  for (const mobileWebDir of mobileWebDirs) {
    await copyFileWithEpermTolerance(
      sharedContractSourcePath,
      path.join(mobileWebDir, "platform-contract.js"),
    );
    await writeMobileBootBundles(mobileWebDir, mobileBootBundles);
    for (const pageKey of mobileBootstrapPages) {
      await rewriteMobileBootstrapHtml(mobileWebDir, pageKey);
      await validateMobileBootstrapHtml(mobileWebDir, pageKey);
    }
    await validateMobileBootBundles(mobileWebDir, mobileBootBundles);
  }
}

console.log(
  "已同步离线 Web 资源到 pages/offline-assets 和 React Native 移动端资源目录",
);
