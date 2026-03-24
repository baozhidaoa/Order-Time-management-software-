import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import vm from "vm";
import {
  OFFLINE_ASSET_KEYS,
  OFFLINE_ASSET_MANIFEST_FILE_NAME,
  OFFLINE_ASSET_MANIFEST_GLOBAL,
  createOfflineAssetDefinitions,
  isOfflineAssetManifest,
} from "./offline-assets-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const platformContract = require(path.join(
  repoRoot,
  "shared",
  "platform-contract.js",
));
const guideBundle = require(path.join(repoRoot, "pages", "guide-bundle.js"));
const offlineAssetDefinitions = createOfflineAssetDefinitions(repoRoot);
const offlineAssetDefinitionMap = new Map(
  offlineAssetDefinitions.map((definition) => [definition.key, definition]),
);
const pagesOfflineAssetsDir = path.join(repoRoot, "pages", "offline-assets");
const androidOfflineAssetsDir = path.join(
  repoRoot,
  "ControlerApp",
  "android",
  "app",
  "src",
  "main",
  "assets",
  "controler-web",
  "offline-assets",
);
const iosOfflineAssetsDir = path.join(
  repoRoot,
  "ControlerApp",
  "ios",
  "controler-web",
  "offline-assets",
);

const failures = [];
const mobileGeneratedBootFiles = new Set([
  "mobile-common-boot.js",
  "index-boot.js",
  "diary-boot.js",
  "plan-boot.js",
  "todo-boot.js",
  "stats-boot.js",
]);
const mobileBootstrapHtmlPages = new Set([
  "index.html",
  "diary.html",
  "plan.html",
  "todo.html",
  "stats.html",
]);

function recordFailure(message) {
  failures.push(message);
}

function toRelativeRepoPath(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

function createManifestVmContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

async function readUtf8(targetPath) {
  return fs.readFile(targetPath, "utf8");
}

async function readOfflineAssetBuffer(targetPath, fallbackSourcePath) {
  try {
    return await fs.readFile(targetPath);
  } catch (error) {
    if (error?.code !== "EPERM" || !fallbackSourcePath) {
      throw error;
    }
    return fs.readFile(fallbackSourcePath);
  }
}

async function loadOfflineAssetManifest(manifestPath, label) {
  let manifestSource = "";
  try {
    manifestSource = await readUtf8(manifestPath);
  } catch (error) {
    recordFailure(`${label} manifest 读取失败: ${toRelativeRepoPath(manifestPath)}`);
    return null;
  }

  const context = createManifestVmContext();
  try {
    vm.runInContext(manifestSource, context, {
      filename: manifestPath,
    });
  } catch (error) {
    recordFailure(
      `${label} manifest 执行失败: ${toRelativeRepoPath(manifestPath)} (${error?.message || error})`,
    );
    return null;
  }

  const manifest = context[OFFLINE_ASSET_MANIFEST_GLOBAL];
  if (!isOfflineAssetManifest(manifest)) {
    recordFailure(`${label} manifest 无效: ${toRelativeRepoPath(manifestPath)}`);
    return null;
  }
  return manifest;
}

function ensureGitTracked(relativePath, label) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch (error) {
    recordFailure(`${label} 未纳入 Git 管理: ${relativePath}`);
  }
}

async function assertFilesEqual(sourcePath, targetPath, label) {
  let sourceText = "";
  let targetText = "";
  try {
    [sourceText, targetText] = await Promise.all([
      readUtf8(sourcePath),
      readUtf8(targetPath),
    ]);
  } catch (error) {
    recordFailure(
      `${label} 读取失败: ${toRelativeRepoPath(targetPath)} (${error?.message || error})`,
    );
    return;
  }
  if (sourceText !== targetText) {
    recordFailure(`${label} 不一致: ${path.relative(repoRoot, targetPath)}`);
  }
}

function shouldExcludeRelativePath(relativePath, excludedRelativePrefixes = []) {
  return excludedRelativePrefixes.some((prefix) => {
    const normalizedPrefix = String(prefix || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalizedPrefix) {
      return false;
    }
    return (
      relativePath === normalizedPrefix ||
      relativePath.startsWith(`${normalizedPrefix}/`)
    );
  });
}

async function listRelativeFiles(rootDir, excludedRelativePrefixes = []) {
  const output = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      if (shouldExcludeRelativePath(relativePath, excludedRelativePrefixes)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        output.push(relativePath);
      }
    }
  }

  await walk(rootDir);
  output.sort((left, right) => left.localeCompare(right));
  return output;
}

function rewriteMobileBootstrapHtml(sourceText, relativePath) {
  const pageKey = path.basename(relativePath, ".html");
  const titleEndIndex = sourceText.indexOf("</title>");
  const firstScriptIndex =
    titleEndIndex === -1 ? -1 : sourceText.indexOf("<script", titleEndIndex);
  const stylesheetIndex =
    titleEndIndex === -1
      ? -1
      : sourceText.indexOf('<link rel="stylesheet"', titleEndIndex);

  if (
    titleEndIndex === -1 ||
    firstScriptIndex === -1 ||
    stylesheetIndex === -1 ||
    firstScriptIndex >= stylesheetIndex
  ) {
    recordFailure(`无法识别移动端 HTML 启动脚本区域: ${relativePath}`);
    return sourceText;
  }

  const bootstrapScripts =
    `    <script defer src="offline-assets/${OFFLINE_ASSET_MANIFEST_FILE_NAME}"></script>\n` +
    `    <script defer src="mobile-common-boot.js"></script>\n` +
    `    <script defer src="${pageKey}-boot.js"></script>\n`;
  const pageScriptPattern = new RegExp(
    `\\s*<script\\s+src="${pageKey}\\.js(?:\\?[^"]*)?"\\s*><\\/script>\\s*`,
    "i",
  );

  return (
    sourceText.slice(0, firstScriptIndex) +
    bootstrapScripts +
    sourceText.slice(stylesheetIndex)
  ).replace(pageScriptPattern, "\n");
}

async function compareDirectories(sourceDir, targetDir, label, options = {}) {
  const isGeneratedMobileWeb =
    label === "pages 与 Android Web 资源" || label === "pages 与 iOS Web 资源";
  const excludedRelativePrefixes = Array.isArray(options.excludedRelativePrefixes)
    ? options.excludedRelativePrefixes
    : [];
  const [sourceFiles, targetFiles] = await Promise.all([
    listRelativeFiles(sourceDir, excludedRelativePrefixes),
    listRelativeFiles(targetDir, excludedRelativePrefixes),
  ]);
  const comparableTargetFiles = isGeneratedMobileWeb
    ? targetFiles.filter((relativePath) => !mobileGeneratedBootFiles.has(relativePath))
    : targetFiles;
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(comparableTargetFiles);

  for (const relativePath of sourceFiles) {
    if (!targetSet.has(relativePath)) {
      recordFailure(`${label} 缺少文件: ${relativePath}`);
    }
  }

  for (const relativePath of comparableTargetFiles) {
    if (!sourceSet.has(relativePath)) {
      recordFailure(`${label} 多出文件: ${relativePath}`);
    }
  }

  for (const relativePath of sourceFiles) {
    if (!targetSet.has(relativePath)) {
      continue;
    }
    const sourcePath = path.join(sourceDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    if (isGeneratedMobileWeb && mobileBootstrapHtmlPages.has(relativePath)) {
      const [sourceText, targetText] = await Promise.all([
        readUtf8(sourcePath),
        readUtf8(targetPath),
      ]);
      const expectedTargetText = rewriteMobileBootstrapHtml(sourceText, relativePath);
      if (expectedTargetText !== targetText) {
        recordFailure(`${label} 文件内容不一致: ${relativePath}`);
      }
      continue;
    }
    const [sourceBuffer, targetBuffer] = await Promise.all([
      fs.readFile(sourcePath),
      fs.readFile(targetPath),
    ]);
    if (!sourceBuffer.equals(targetBuffer)) {
      recordFailure(`${label} 文件内容不一致: ${relativePath}`);
    }
  }
}

async function assertOfflineAssetTargets(
  label,
  offlineAssetDir,
  manifest,
  options = {},
) {
  if (!manifest) {
    return;
  }
  const requireGitManaged = options.requireGitManaged === true;
  const manifestPath = path.join(offlineAssetDir, OFFLINE_ASSET_MANIFEST_FILE_NAME);
  if (!(await fs.pathExists(manifestPath))) {
    recordFailure(`${label} manifest 缺失: ${toRelativeRepoPath(manifestPath)}`);
    return;
  }
  if (requireGitManaged) {
    ensureGitTracked(toRelativeRepoPath(manifestPath), `${label} manifest`);
  }

  for (const assetKey of OFFLINE_ASSET_KEYS) {
    const fileName = String(manifest[assetKey] || "").trim();
    if (!fileName) {
      recordFailure(`${label} manifest 缺少资源键: ${assetKey}`);
      continue;
    }
    if (fileName.includes("/") || fileName.includes("\\")) {
      recordFailure(`${label} manifest 条目必须是文件名: ${assetKey}`);
      continue;
    }

    const definition = offlineAssetDefinitionMap.get(assetKey);
    if (!definition) {
      recordFailure(`${label} 离线资源定义缺失: ${assetKey}`);
      continue;
    }

    const targetPath = path.join(offlineAssetDir, fileName);
    if (!(await fs.pathExists(targetPath))) {
      recordFailure(`${label} 缺少当前离线资源: ${toRelativeRepoPath(targetPath)}`);
      continue;
    }
    if (requireGitManaged) {
      ensureGitTracked(toRelativeRepoPath(targetPath), `${label} 离线资源`);
    }

    const [sourceBuffer, targetBuffer] = await Promise.all([
      fs.readFile(definition.sourcePath),
      readOfflineAssetBuffer(targetPath, definition.sourcePath),
    ]);
    if (!sourceBuffer.equals(targetBuffer)) {
      recordFailure(`${label} 离线资源内容不一致: ${toRelativeRepoPath(targetPath)}`);
    }
  }
}

function parseAndroidBridgeMethods(sourceText) {
  const names = new Set();
  const regex = /@ReactMethod\s+public\s+void\s+([A-Za-z0-9_]+)\s*\(/g;
  let match = regex.exec(sourceText);
  while (match) {
    names.add(match[1]);
    match = regex.exec(sourceText);
  }
  return names;
}

function parseIosBridgeMethods(sourceText) {
  const names = new Set();
  const remapRegex = /RCT_REMAP_METHOD\(\s*([A-Za-z0-9_]+)\s*,/g;
  const exportRegex = /RCT_EXPORT_METHOD\(\s*([A-Za-z0-9_]+)\s*[:)]/g;
  let match = remapRegex.exec(sourceText);
  while (match) {
    names.add(match[1]);
    match = remapRegex.exec(sourceText);
  }
  match = exportRegex.exec(sourceText);
  while (match) {
    names.add(match[1]);
    match = exportRegex.exec(sourceText);
  }
  return names;
}

function assertMethodSet(methodNames, requiredNames, label) {
  for (const requiredName of requiredNames) {
    if (!methodNames.has(requiredName)) {
      recordFailure(`${label} 缺少 bridge 方法: ${requiredName}`);
    }
  }
}

function assertRegexMatch(sourceText, regex, message) {
  if (!regex.test(sourceText)) {
    recordFailure(message);
  }
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunctionBlock(sourceText, functionName) {
  const declarationPattern = new RegExp(
    `function\\s+${escapeRegex(functionName)}\\s*\\(`,
  );
  const declarationMatch = declarationPattern.exec(sourceText);
  if (!declarationMatch) {
    return null;
  }
  const startIndex = declarationMatch.index;

  const paramsStartIndex = sourceText.indexOf("(", startIndex);
  if (paramsStartIndex === -1) {
    return null;
  }

  let paramsDepth = 0;
  let paramsEndIndex = -1;
  for (let index = paramsStartIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "(") {
      paramsDepth += 1;
      continue;
    }
    if (char !== ")") {
      continue;
    }
    paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEndIndex = index;
      break;
    }
  }
  if (paramsEndIndex === -1) {
    return null;
  }

  const bodyStartIndex = sourceText.indexOf("{", paramsEndIndex);
  if (bodyStartIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let index = bodyStartIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return sourceText.slice(startIndex, index + 1);
    }
  }

  return null;
}

function assertIncludesInOrder(sourceText, parts, message) {
  let searchIndex = 0;
  for (const part of parts) {
    const nextIndex = sourceText.indexOf(part, searchIndex);
    if (nextIndex === -1) {
      recordFailure(message);
      return;
    }
    searchIndex = nextIndex + part.length;
  }
}

function parseWidgetKindsFromAndroidKindsSource(sourceText) {
  const regex = /public static final String [A-Z_]+\s*=\s*"([^"]+)";/g;
  const result = new Set();
  let match = regex.exec(sourceText);
  while (match) {
    result.add(match[1]);
    match = regex.exec(sourceText);
  }
  return result;
}

function parseLaunchActionsFromAndroidKindsSource(sourceText) {
  const regex = /return\s+"([^"]+)";/g;
  const result = new Set();
  let match = regex.exec(sourceText);
  while (match) {
    result.add(match[1]);
    match = regex.exec(sourceText);
  }
  return result;
}

function assertRequiredFeaturesMatch(contract) {
  const requiredKeys = [
    "storageSourceSwitch",
    "bundleExportImport",
    "nativeReminders",
    "widgets",
  ];
  const android = contract.getReactNativeRuntimeProfile("android");
  const ios = contract.getReactNativeRuntimeProfile("ios");
  const electron = contract.getElectronRuntimeProfile("darwin");

  for (const key of requiredKeys) {
    if (android.capabilities?.[key] !== true) {
      recordFailure(`共享契约缺少 Android 必需能力: capabilities.${key}`);
    }
    if (ios.capabilities?.[key] !== true) {
      recordFailure(`共享契约缺少 iOS 必需能力: capabilities.${key}`);
    }
    if (electron.capabilities?.[key] !== true) {
      recordFailure(`共享契约缺少 macOS(Electron) 必需能力: capabilities.${key}`);
    }
  }

  const widgetKindIds = contract.getWidgetKindIds();
  const launchActionIds = contract.getLaunchActionIds();
  if (
    JSON.stringify(android.capabilities?.widgetKinds || []) !==
      JSON.stringify(widgetKindIds) ||
    JSON.stringify(ios.capabilities?.widgetKinds || []) !==
      JSON.stringify(widgetKindIds) ||
    JSON.stringify(electron.capabilities?.widgetKinds || []) !==
      JSON.stringify(widgetKindIds)
  ) {
    recordFailure("共享契约的 widgetKinds 能力未在 Android / iOS / Electron 完整声明。");
  }
  if (
    JSON.stringify(android.capabilities?.launchActions || []) !==
      JSON.stringify(launchActionIds) ||
    JSON.stringify(ios.capabilities?.launchActions || []) !==
      JSON.stringify(launchActionIds) ||
    JSON.stringify(electron.capabilities?.launchActions || []) !==
      JSON.stringify(launchActionIds)
  ) {
    recordFailure("共享契约的 launchActions 能力未在 Android / iOS / Electron 完整声明。");
  }
}

async function main() {
  const sharedContractPath = path.join(repoRoot, "shared", "platform-contract.js");
  const mirroredContractPaths = [
    path.join(repoRoot, "pages", "platform-contract.js"),
    path.join(repoRoot, "ControlerApp", "platform-contract.js"),
    path.join(
      repoRoot,
      "ControlerApp",
      "android",
      "app",
      "src",
      "main",
      "assets",
      "controler-web",
      "platform-contract.js",
    ),
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "controler-web",
      "platform-contract.js",
    ),
  ];

  for (const mirroredPath of mirroredContractPaths) {
    await assertFilesEqual(sharedContractPath, mirroredPath, "共享平台契约");
  }

  const pagesManifestPath = path.join(
    pagesOfflineAssetsDir,
    OFFLINE_ASSET_MANIFEST_FILE_NAME,
  );
  const androidManifestPath = path.join(
    androidOfflineAssetsDir,
    OFFLINE_ASSET_MANIFEST_FILE_NAME,
  );
  const iosManifestPath = path.join(
    iosOfflineAssetsDir,
    OFFLINE_ASSET_MANIFEST_FILE_NAME,
  );
  const [pagesOfflineAssetManifest, androidOfflineAssetManifest, iosOfflineAssetManifest] =
    await Promise.all([
      loadOfflineAssetManifest(pagesManifestPath, "pages 离线资源"),
      loadOfflineAssetManifest(androidManifestPath, "Android 离线资源"),
      loadOfflineAssetManifest(iosManifestPath, "iOS 离线资源"),
    ]);

  if (pagesOfflineAssetManifest && androidOfflineAssetManifest) {
    if (
      JSON.stringify(pagesOfflineAssetManifest) !==
      JSON.stringify(androidOfflineAssetManifest)
    ) {
      recordFailure("Android 离线资源 manifest 与 pages 不一致。");
    }
  }
  if (pagesOfflineAssetManifest && iosOfflineAssetManifest) {
    if (
      JSON.stringify(pagesOfflineAssetManifest) !==
      JSON.stringify(iosOfflineAssetManifest)
    ) {
      recordFailure("iOS 离线资源 manifest 与 pages 不一致。");
    }
  }

  await assertFilesEqual(
    pagesManifestPath,
    androidManifestPath,
    "离线资源 manifest",
  );
  await assertFilesEqual(
    pagesManifestPath,
    iosManifestPath,
    "离线资源 manifest",
  );

  const requireGitManagedOfflineAssets = await fs.pathExists(
    path.join(repoRoot, ".git"),
  );
  await assertOfflineAssetTargets(
    "pages 离线资源",
    pagesOfflineAssetsDir,
    pagesOfflineAssetManifest,
    {
      requireGitManaged: requireGitManagedOfflineAssets,
    },
  );
  await assertOfflineAssetTargets(
    "Android 离线资源",
    androidOfflineAssetsDir,
    androidOfflineAssetManifest,
    {
      requireGitManaged: requireGitManagedOfflineAssets,
    },
  );
  await assertOfflineAssetTargets(
    "iOS 离线资源",
    iosOfflineAssetsDir,
    iosOfflineAssetManifest,
    {
      requireGitManaged: requireGitManagedOfflineAssets,
    },
  );

  await compareDirectories(
    path.join(repoRoot, "pages"),
    path.join(
      repoRoot,
      "ControlerApp",
      "android",
      "app",
      "src",
      "main",
      "assets",
      "controler-web",
    ),
    "pages 与 Android Web 资源",
    {
      excludedRelativePrefixes: ["offline-assets"],
    },
  );
  await compareDirectories(
    path.join(repoRoot, "pages"),
    path.join(repoRoot, "ControlerApp", "ios", "controler-web"),
    "pages 与 iOS Web 资源",
    {
      excludedRelativePrefixes: ["offline-assets"],
    },
  );

  const [
    androidBridgeSource,
    iosBridgeSource,
    appTsxSource,
    preloadSource,
    mainProcessSource,
    androidKindsSource,
    iosInfoPlistSource,
    iosProjectSource,
    pagesStorageAdapterSource,
    androidWidgetDataStoreSource,
    guideUiSource,
    diarySource,
    todoSource,
    indexSource,
    statsSource,
  ] =
    await Promise.all([
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "android",
          "app",
          "src",
          "main",
          "java",
          "com",
          "controlerapp",
          "ControlerBridgeModule.java",
        ),
      ),
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "ios",
          "ControlerApp",
          "AppDelegate.mm",
        ),
      ),
      readUtf8(path.join(repoRoot, "ControlerApp", "App.tsx")),
      readUtf8(path.join(repoRoot, "preload.js")),
      readUtf8(path.join(repoRoot, "main.js")),
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "android",
          "app",
          "src",
          "main",
          "java",
          "com",
          "controlerapp",
          "widgets",
          "ControlerWidgetKinds.java",
        ),
      ),
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "ios",
          "ControlerApp",
          "Info.plist",
        ),
      ),
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "ios",
          "ControlerApp.xcodeproj",
          "project.pbxproj",
        ),
      ),
      readUtf8(path.join(repoRoot, "pages", "storage-adapter.js")),
      readUtf8(
        path.join(
          repoRoot,
          "ControlerApp",
          "android",
          "app",
          "src",
          "main",
          "java",
          "com",
          "controlerapp",
          "widgets",
          "ControlerWidgetDataStore.java",
        ),
      ),
      readUtf8(path.join(repoRoot, "pages", "guide-ui.js")),
      readUtf8(path.join(repoRoot, "pages", "diary.js")),
      readUtf8(path.join(repoRoot, "pages", "todo.js")),
      readUtf8(path.join(repoRoot, "pages", "index.js")),
      readUtf8(path.join(repoRoot, "pages", "stats.js")),
    ]);

  assertRegexMatch(
    indexSource,
    /resolveOfflineAssetUrl\(/,
    "记录页图表资源未通过 resolveOfflineAssetUrl 解析。",
  );
  if (/offline-assets\//.test(indexSource)) {
    recordFailure("记录页仍硬编码 offline-assets 资源路径。");
  }

  assertRegexMatch(
    statsSource,
    /resolveOfflineAssetUrl\(/,
    "统计页图表资源未通过 resolveOfflineAssetUrl 解析。",
  );
  if (/offline-assets\//.test(statsSource)) {
    recordFailure("统计页仍硬编码 offline-assets 资源路径。");
  }

  const requiredBridgeMethods = platformContract.getReactNativeBridgeMethodNames();
  assertMethodSet(
    parseAndroidBridgeMethods(androidBridgeSource),
    requiredBridgeMethods,
    "Android 原生桥",
  );
  assertMethodSet(
    parseIosBridgeMethods(iosBridgeSource),
    requiredBridgeMethods,
    "iOS 原生桥",
  );

  const managedCoreSnapshotFunction = extractFunctionBlock(
    pagesStorageAdapterSource,
    "buildManagedCoreStateSnapshot",
  );
  if (!managedCoreSnapshotFunction) {
    recordFailure("找不到 React Native buildManagedCoreStateSnapshot 实现。");
  } else {
    assertIncludesInOrder(
      managedCoreSnapshotFunction,
      [
        "guideState:",
        "customThemes:",
        "builtInThemeOverrides:",
        "selectedTheme:",
        "recurringPlans:",
      ],
      "React Native 受管核心快照缺少 guideState / 主题字段 / recurringPlans。",
    );
  }

  const managedCoreMergeFunction = extractFunctionBlock(
    pagesStorageAdapterSource,
    "mergeManagedStateWithNativeCorePayload",
  );
  if (!managedCoreMergeFunction) {
    recordFailure("找不到 React Native mergeManagedStateWithNativeCorePayload 实现。");
  } else {
    assertIncludesInOrder(
      managedCoreMergeFunction,
      [
        "guideState:",
        "customThemes:",
        "builtInThemeOverrides:",
        "selectedTheme:",
      ],
      "React Native 核心数据合并逻辑未覆盖 guideState 与主题字段。",
    );
  }
  assertRegexMatch(
    pagesStorageAdapterSource,
    /initializeReactNativeStorage\(\)[\s\S]*mergeManagedStateWithNativeCorePayload\(nextCore,\s*readState\(\)\)/,
    "React Native 初始化未复用完整核心快照合并逻辑。",
  );
  assertRegexMatch(
    pagesStorageAdapterSource,
    /async getCoreState\(\)\s*\{[\s\S]*mergeManagedStateWithNativeCorePayload\(parsed,\s*currentState\)/,
    "React Native getCoreState 快路径未复用完整核心快照合并逻辑。",
  );
  assertRegexMatch(
    pagesStorageAdapterSource,
    /async getPageBootstrapState\(pageKey,\s*options = \{\}\)\s*\{[\s\S]*const useFreshBootstrap = normalizedOptions\.fresh === true;[\s\S]*const canUseManagedBootstrapFastPath =[\s\S]*nativeInitializationSettled && canUseManagedBootstrap;[\s\S]*const preferManagedBootstrap =[\s\S]*nativeInitializationSettled &&[\s\S]*hasPendingStateChanges &&[\s\S]*hasManagedCoreSnapshot;[\s\S]*const shouldHydrateManagedMirror =[\s\S]*useFreshBootstrap \|\| !canUseManagedBootstrapFastPath;/,
    "React Native 页面引导快路径仍可能在原生初始化完成前直接复用待补写镜像。",
  );
  assertRegexMatch(
    pagesStorageAdapterSource,
    /async loadSectionRange\(section,\s*scope = \{\}\)\s*\{[\s\S]*const normalizedRange = canServeManagedSectionRange\(section,\s*scope\);[\s\S]*const canUseManagedRangeFastPath =[\s\S]*nativeInitializationSettled && !!normalizedRange;[\s\S]*const preferManagedRange =[\s\S]*nativeInitializationSettled &&[\s\S]*hasPendingStateChanges &&[\s\S]*hasManagedCoreSnapshot;/,
    "React Native 分区范围快路径仍可能在原生初始化完成前直接复用待补写镜像。",
  );
  assertRegexMatch(
    iosBridgeSource,
    /ControlerCoreSectionKeys\(\)[\s\S]*@"guideState"[\s\S]*@"customThemes"[\s\S]*@"builtInThemeOverrides"[\s\S]*@"selectedTheme"/,
    "iOS 核心字段集合缺少 guideState 或主题字段。",
  );
  assertRegexMatch(
    iosBridgeSource,
    /normalizedState:[\s\S]*next\[@\"guideState\"\][\s\S]*next\[@\"builtInThemeOverrides\"\][\s\S]*next\[@\"selectedTheme\"\]/,
    "iOS normalizedState 未为 guideState 或主题字段提供持久化默认值。",
  );
  assertRegexMatch(
    iosBridgeSource,
    /coreStatePayload[\s\S]*for \(NSString \*key in ControlerCoreSectionKeys\(\)\)/,
    "iOS coreStatePayload 未由共享核心字段集合驱动。",
  );
  assertRegexMatch(
    iosBridgeSource,
    /replaceStorageCoreStateWithJson[\s\S]*for \(NSString \*key in ControlerCoreSectionKeys\(\)\)/,
    "iOS replaceStorageCoreState 未由共享核心字段集合驱动。",
  );
  assertRegexMatch(
    androidWidgetDataStoreSource,
    /guideState\.put\("bundleVersion", 2\);[\s\S]*guideState\.put\("dismissedCardIds", new JSONArray\(\)\);[\s\S]*guideState\.put\("dismissedGuideDiaryEntryIds", new JSONArray\(\)\);/,
    "Android guideState fallback 仍未升级到当前 schema。",
  );
  assertIncludesInOrder(
    pagesStorageAdapterSource,
    [
      "const SHARED_BOOTSTRAP_MIRROR_KEYS = Object.freeze([",
      "\"guideState\"",
      "\"customThemes\"",
      "\"builtInThemeOverrides\"",
      "\"selectedTheme\"",
    ],
    "共享 bootstrap 镜像字段缺少 guideState，切页时仍可能回退到旧引导状态。",
  );
  assertIncludesInOrder(
    guideUiSource,
    [
      "let pendingGuideStateSnapshot = null;",
      "function getGuideStateSnapshot()",
      "pending: true",
      "getGuideStateSnapshot,",
    ],
      "共享引导 UI 未保留 guideState 待落盘快照或未通过 core replace 持久化。",
  );
  const guideUiSaveFunction = extractFunctionBlock(guideUiSource, "saveGuideState");
  if (!guideUiSaveFunction) {
    recordFailure("找不到共享引导 saveGuideState 实现。");
  } else {
    assertIncludesInOrder(
      guideUiSaveFunction,
      [
        "pendingGuideStateSnapshot = cloneGuideState(normalizedState);",
        "persistGuideStateViaManagedSetItem(",
        "replaceCoreState(",
      ],
      "共享引导 UI 未先写入即时镜像，再通过 core replace 持久化 guideState。",
    );
  }
  assertRegexMatch(
    preloadSource,
    /storageReplaceCoreStateSync:\s*\(partialCore,\s*options\s*=\s*\{\}\)\s*=>[\s\S]*ipcRenderer\.sendSync\(\"storage:replaceCoreStateSync\"/,
    "preload 未暴露同步 replaceCoreState 桥接接口，桌面切页前仍可能丢失引导持久化。",
  );
  assertRegexMatch(
    mainProcessSource,
    /ipcMain\.on\(\"storage:replaceCoreStateSync\",[\s\S]*event\.returnValue\s*=\s*replaceStorageCoreState\(partialCore,\s*options\)/,
    "主进程未接入同步 replaceCoreState IPC，桌面端无法保证引导删除立即落盘。",
  );
  if (guideBundle.getGuideCard("plan") !== null) {
    recordFailure("计划页引导卡仍在 guide bundle 中启用。");
  }
  if (guideBundle.getGuideCard("diary") !== null) {
    recordFailure("日记页引导卡仍在 guide bundle 中启用。");
  }
  if ((guideBundle.buildGuideDiaryEntries(new Date()) || []).length !== 0) {
    recordFailure("日记引导条目仍在 guide bundle 中生成。");
  }
  if (
    (guideBundle.synchronizeGuideDiaryEntries(
      [
        {
          id: "guide-entry-import-backup",
          title: "导入和导出到底怎么选",
          date: "2026-03-19",
        },
      ],
      new Date("2026-03-19T00:00:00.000Z"),
      null,
    ) || []).length !== 0
  ) {
    recordFailure("旧日记引导条目不会在同步时被清理。");
  }
  assertIncludesInOrder(
    diarySource,
    [
      "window.ControlerGuideUI?.getGuideStateSnapshot",
      "function resolveDiaryGuideStateForHydration",
      "guideStateSnapshot.pending",
      "resolveDiaryGuideStateForHydration(",
      "guideStateChanged && Object.keys(partialCore).length",
      "reason: \"diary-guide-state\"",
    ],
    "日记页未复用共享 guideState 快照，或未优先持久化 guideState 以避免自动补种。",
  );
  const todoInitFunction = extractFunctionBlock(todoSource, "init");
  if (!todoInitFunction) {
    recordFailure("找不到待办页 init 实现。");
  } else {
    assertIncludesInOrder(
      todoInitFunction,
      [
        "bindTodoExternalStorageRefresh();",
        "const snapshot = bootstrapTodoFromCachedSnapshot();",
        "renderTodoWorkspace();",
        "queueTodoInitialReveal();",
        "scheduleTodoDeferredFreshSync();",
      ],
      "待办页初始化未先绑定外部刷新，再基于当前快照快速首屏渲染，并在首屏后调度后台 fresh 同步。",
    );
  }

  if (!appTsxSource.includes("getReactNativeRuntimeProfile")) {
    recordFailure("ControlerApp/App.tsx 尚未基于共享契约生成 RN runtime metadata。");
  }
  if (!appTsxSource.includes("notifications.syncSchedule")) {
    recordFailure("ControlerApp/App.tsx 尚未接入 notifications.syncSchedule bridge 路由。");
  }

  const contractWidgetKinds = new Set(platformContract.getWidgetKindIds());
  const contractLaunchActions = new Set(platformContract.getLaunchActionIds());
  const androidWidgetKinds = parseWidgetKindsFromAndroidKindsSource(androidKindsSource);
  const androidLaunchActions = parseLaunchActionsFromAndroidKindsSource(androidKindsSource);

  for (const widgetKind of contractWidgetKinds) {
    if (!androidWidgetKinds.has(widgetKind)) {
      recordFailure(`Android widget kind 缺失: ${widgetKind}`);
    }
  }
  for (const launchAction of contractLaunchActions) {
    if (!androidLaunchActions.has(launchAction)) {
      recordFailure(`Android launch action 缺失: ${launchAction}`);
    }
  }

  const contractConsumerChecks = [
    {
      file: path.join(repoRoot, "pages", "settings.js"),
      token: "ControlerPlatformContract",
      label: "设置页 widget 元数据",
    },
    {
      file: path.join(repoRoot, "pages", "widget.js"),
      token: "ControlerPlatformContract",
      label: "桌面 widget 页面元数据",
    },
    {
      file: path.join(repoRoot, "pages", "widget-android-parity.js"),
      token: "ControlerPlatformContract",
      label: "Android parity widget 页面元数据",
    },
    {
      file: path.join(repoRoot, "desktop-widget-manager.js"),
      token: "platform-contract",
      label: "Electron 桌面小组件元数据",
    },
    {
      file: path.join(repoRoot, "preload.js"),
      token: "runtimeMeta",
      label: "Electron runtime metadata",
    },
  ];

  for (const check of contractConsumerChecks) {
    const sourceText = await readUtf8(check.file);
    if (!sourceText.includes(check.token)) {
      recordFailure(`${check.label} 尚未切换到共享平台契约。`);
    }
  }

  const iosRequiredAssets = [
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "ControlerApp",
      "ControlerApp.entitlements",
    ),
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "ControlerWidgetExtension",
      "ControlerWidgetsBundle.swift",
    ),
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "ControlerWidgetExtension",
      "ControlerWidget.swift",
    ),
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "ControlerWidgetExtension",
      "Info.plist",
    ),
    path.join(
      repoRoot,
      "ControlerApp",
      "ios",
      "ControlerWidgetExtension",
      "ControlerWidgetExtension.entitlements",
    ),
  ];

  for (const assetPath of iosRequiredAssets) {
    if (!(await fs.pathExists(assetPath))) {
      recordFailure(
        `iOS WidgetKit / entitlements 资产缺失: ${path.relative(repoRoot, assetPath)}`,
      );
    }
  }

  if (!iosInfoPlistSource.includes("controlerapp")) {
    recordFailure("iOS 主应用 Info.plist 缺少 controlerapp URL scheme。");
  }
  if (!iosProjectSource.includes("ControlerWidgetExtension.appex")) {
    recordFailure("iOS Xcode 工程尚未注册 ControlerWidgetExtension target。");
  }
  if (
    !iosProjectSource.includes(
      "ControlerWidgetExtension/ControlerWidgetExtension.entitlements",
    )
  ) {
    recordFailure("iOS Xcode 工程未给 WidgetKit extension 配置 entitlements。");
  }
  if (!iosProjectSource.includes("ControlerApp/ControlerApp.entitlements")) {
    recordFailure("iOS Xcode 工程未给主应用配置 App Group entitlements。");
  }
  if (!iosBridgeSource.includes("UIDocumentPickerDelegate")) {
    recordFailure("iOS 原生桥尚未接入 UIDocumentPicker 外部存储切换能力。");
  }
  if (!iosBridgeSource.includes("ControlerConsumePendingLaunchAction")) {
    recordFailure("iOS 原生桥尚未实现 launch action 消费逻辑。");
  }
  if (!iosBridgeSource.includes("kWidgetAppGroupIdentifier")) {
    recordFailure("iOS 原生桥尚未配置 WidgetKit App Group 快照写入。");
  }

  assertRequiredFeaturesMatch(platformContract);

  if (failures.length > 0) {
    const message = failures.map((item, index) => `${index + 1}. ${item}`).join("\n");
    throw new Error(`平台对齐校验失败:\n${message}`);
  }

  console.log("平台对齐校验通过。");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
