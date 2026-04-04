import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import {
  OFFLINE_ASSET_MANIFEST_FILE_NAME,
  buildOfflineAssetManifest,
  buildOfflineAssetManifestSource,
  createOfflineAssetDefinitions,
} from "./offline-assets-config.mjs";

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
const legacyPageAssetDirs = ["embedded-assets", "runtime-assets", "vendor"];
const offlineAssetDefinitions = createOfflineAssetDefinitions(repoRoot);
const pageMirrorExcludedDirs = new Set(["offline-assets"]);
const desktopThemePreloadFileName = "desktop-theme-preload.js";

const desktopBootBundleEntries = {
  "desktop-common-boot.js": [
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
    {
      label: "pages/index-record-persistence.js",
      file: path.join(pagesSourceDir, "index-record-persistence.js"),
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
    {
      label: "pages/index-record-persistence.js",
      file: path.join(pagesSourceDir, "index-record-persistence.js"),
    },
    { label: "pages/stats.js", file: path.join(pagesSourceDir, "stats.js") },
  ],
  "settings-boot.js": [
    {
      label: "pages/guide-bundle.js",
      file: path.join(pagesSourceDir, "guide-bundle.js"),
    },
    {
      label: "pages/external-import.js",
      file: path.join(pagesSourceDir, "external-import.js"),
    },
    {
      label: "pages/settings.js",
      file: path.join(pagesSourceDir, "settings.js"),
    },
  ],
};

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
    {
      label: "pages/index-record-persistence.js",
      file: path.join(pagesSourceDir, "index-record-persistence.js"),
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
    {
      label: "pages/index-record-persistence.js",
      file: path.join(pagesSourceDir, "index-record-persistence.js"),
    },
    { label: "pages/stats.js", file: path.join(pagesSourceDir, "stats.js") },
  ],
  "settings-boot.js": [
    {
      label: "pages/guide-bundle.js",
      file: path.join(pagesSourceDir, "guide-bundle.js"),
    },
    {
      label: "pages/external-import.js",
      file: path.join(pagesSourceDir, "external-import.js"),
    },
    {
      label: "pages/settings.js",
      file: path.join(pagesSourceDir, "settings.js"),
    },
  ],
};

const desktopBootstrapPages = [
  "index",
  "diary",
  "plan",
  "todo",
  "stats",
  "settings",
];
const mobileBootstrapPages = [
  "index",
  "diary",
  "plan",
  "todo",
  "stats",
  "settings",
];

function formatRelativeRepoPath(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

async function writeFileIfChanged(targetPath, content) {
  const nextBuffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content || ""), "utf8");

  try {
    if (await fs.pathExists(targetPath)) {
      const currentBuffer = await fs.readFile(targetPath);
      if (currentBuffer.equals(nextBuffer)) {
        return false;
      }
    }
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.ensureDir(path.dirname(targetPath));
  try {
    await fs.writeFile(targetPath, nextBuffer);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") {
      console.warn(`跳过被占用的资源文件: ${formatRelativeRepoPath(targetPath)}`);
      return false;
    }
    throw error;
  }
}

async function buildOfflineAssetBuffers(definitions) {
  const buffers = new Map();
  for (const definition of definitions) {
    if (!(await fs.pathExists(definition.sourcePath))) {
      throw new Error(`缺少资源文件: ${definition.sourcePath}`);
    }
    buffers.set(definition.key, await fs.readFile(definition.sourcePath));
  }
  return buffers;
}

async function syncOfflineAssetsToTargetDir(targetDir, manifest, assetBuffersByKey) {
  await fs.ensureDir(targetDir);

  const manifestSource = buildOfflineAssetManifestSource(manifest);
  await writeFileIfChanged(
    path.join(targetDir, OFFLINE_ASSET_MANIFEST_FILE_NAME),
    manifestSource,
  );

  for (const definition of offlineAssetDefinitions) {
    const fileName = manifest[definition.key];
    const sourceBuffer = assetBuffersByKey.get(definition.key);
    if (!fileName || !Buffer.isBuffer(sourceBuffer)) {
      throw new Error(`离线资源清单不完整: ${definition.key}`);
    }
    await writeFileIfChanged(path.join(targetDir, fileName), sourceBuffer);
  }
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

async function copyDirectoryTree(sourceDir, targetDir) {
  await fs.ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir);
  const expectedEntries = new Set(
    entries.filter(
      (entry) => !(sourceDir === pagesSourceDir && legacyPageAssetDirs.includes(entry)),
    ),
  );

  for (const entry of entries) {
    if (sourceDir === pagesSourceDir && legacyPageAssetDirs.includes(entry)) {
      continue;
    }
    if (sourceDir === pagesSourceDir && pageMirrorExcludedDirs.has(entry)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    const sourceStats = await fs.stat(sourcePath);

    if (sourceStats.isDirectory()) {
      await copyDirectoryTree(sourcePath, targetPath);
      continue;
    }

    if (!sourceStats.isFile()) {
      continue;
    }

    await fs.copy(sourcePath, targetPath, { overwrite: true });
  }

  const targetEntries = await fs.readdir(targetDir);
  for (const entry of targetEntries) {
    if (expectedEntries.has(entry)) {
      continue;
    }
    await fs.remove(path.join(targetDir, entry));
  }
}

async function buildBootBundles(bundleEntries = {}) {
  const bundles = new Map();

  for (const [bundleName, entries] of Object.entries(bundleEntries)) {
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

async function writeBootBundles(targetDir, bundles) {
  for (const [bundleName, bundleContent] of bundles.entries()) {
    await fs.writeFile(
      path.join(targetDir, bundleName),
      `${bundleContent}\n`,
      "utf8",
    );
  }
}

async function rewriteBootstrapHtml(
  targetDir,
  pageKey,
  {
    commonBundleName,
    preloadScripts = [],
  } = {},
) {
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

  const preloadScriptMarkup = preloadScripts
    .map((scriptName) => `    <script src="${scriptName}"></script>`)
    .join("\n");
  const bootstrapScripts =
    `${preloadScriptMarkup ? `${preloadScriptMarkup}\n` : ""}` +
    `    <script defer src="offline-assets/${OFFLINE_ASSET_MANIFEST_FILE_NAME}"></script>\n` +
    `    <script defer src="${commonBundleName}"></script>\n` +
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

async function validateBootBundles(targetDir, bundles) {
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

async function validateBootstrapHtml(
  targetDir,
  pageKey,
  {
    commonBundleName,
    platformLabel,
    preloadScripts = [],
  } = {},
) {
  const htmlPath = path.join(targetDir, `${pageKey}.html`);
  if (!(await fs.pathExists(htmlPath))) {
    return;
  }
  const html = await fs.readFile(htmlPath, "utf8");
  const manifestScript =
    `<script defer src="offline-assets/${OFFLINE_ASSET_MANIFEST_FILE_NAME}"></script>`;
  const commonBootScript = `<script defer src="${commonBundleName}"></script>`;
  const pageBootScript = `<script defer src="${pageKey}-boot.js"></script>`;
  const expectedPreloadScripts = preloadScripts.map(
    (scriptName) => `<script src="${scriptName}"></script>`,
  );
  const legacyPageScriptPattern = new RegExp(
    `<script\\s+src="${pageKey}\\.js(?:\\?[^"]*)?"\\s*><\\/script>`,
    "i",
  );
  if (
    !html.includes(manifestScript) ||
    !html.includes(commonBootScript) ||
    !html.includes(pageBootScript)
  ) {
    throw new Error(
      `${platformLabel} HTML 启动脚本校验失败: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }
  if (expectedPreloadScripts.some((scriptTag) => !html.includes(scriptTag))) {
    throw new Error(
      `${platformLabel} HTML 预加载脚本校验失败: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }
  if (legacyPageScriptPattern.test(html)) {
    throw new Error(
      `${platformLabel} HTML 仍引用旧页面脚本: ${formatRelativeRepoPath(htmlPath)}`,
    );
  }
}

await fs.ensureDir(offlineAssetsDir);
if (!(await fs.pathExists(sharedContractSourcePath))) {
  throw new Error(`缺少共享平台契约文件: ${sharedContractSourcePath}`);
}

await copyFileWithEpermTolerance(sharedContractSourcePath, pagesContractTargetPath);
for (const legacyDir of legacyPageAssetDirs) {
  await fs.remove(path.join(pagesSourceDir, legacyDir));
}

const offlineAssetBuffers = await buildOfflineAssetBuffers(offlineAssetDefinitions);
const offlineAssetManifest = buildOfflineAssetManifest(
  offlineAssetDefinitions,
  offlineAssetBuffers,
);
await syncOfflineAssetsToTargetDir(
  offlineAssetsDir,
  offlineAssetManifest,
  offlineAssetBuffers,
);
const desktopBootBundles = await buildBootBundles(desktopBootBundleEntries);
await writeBootBundles(pagesSourceDir, desktopBootBundles);
for (const pageKey of desktopBootstrapPages) {
  await rewriteBootstrapHtml(pagesSourceDir, pageKey, {
    commonBundleName: "desktop-common-boot.js",
    preloadScripts: [desktopThemePreloadFileName],
  });
  await validateBootstrapHtml(pagesSourceDir, pageKey, {
    commonBundleName: "desktop-common-boot.js",
    platformLabel: "桌面端",
    preloadScripts: [desktopThemePreloadFileName],
  });
}
await validateBootBundles(pagesSourceDir, desktopBootBundles);

if (await fs.pathExists(path.join(repoRoot, "ControlerApp"))) {
  await copyFileWithEpermTolerance(
    sharedContractSourcePath,
    mobileContractTargetPath,
  );

  await copyDirectoryTree(pagesSourceDir, mobileAndroidWebDir);
  await copyDirectoryTree(pagesSourceDir, mobileIosWebDir);

  const mobileBootBundles = await buildBootBundles(mobileBootBundleEntries);
  for (const mobileWebDir of mobileWebDirs) {
    await copyFileWithEpermTolerance(
      sharedContractSourcePath,
      path.join(mobileWebDir, "platform-contract.js"),
    );
    await syncOfflineAssetsToTargetDir(
      path.join(mobileWebDir, "offline-assets"),
      offlineAssetManifest,
      offlineAssetBuffers,
    );
    await writeBootBundles(mobileWebDir, mobileBootBundles);
    for (const pageKey of mobileBootstrapPages) {
      await rewriteBootstrapHtml(mobileWebDir, pageKey, {
        commonBundleName: "mobile-common-boot.js",
      });
      await validateBootstrapHtml(mobileWebDir, pageKey, {
        commonBundleName: "mobile-common-boot.js",
        platformLabel: "移动端",
      });
    }
    await validateBootBundles(mobileWebDir, mobileBootBundles);
  }
}

console.log(
  "已同步离线资源 manifest 与当前版本运行时资源到桌面页面和 React Native 资源目录",
);
