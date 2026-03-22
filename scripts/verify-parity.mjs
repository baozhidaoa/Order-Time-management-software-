import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

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
const unreadableOfflineAssetFallbacks = new Map([
  [
    "pages/offline-assets/d3.min.js",
    path.join(repoRoot, "node_modules", "d3", "dist", "d3.min.js"),
  ],
  [
    "pages/offline-assets/cal-heatmap.min.js",
    path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.min.js",
    ),
  ],
]);

function recordFailure(message) {
  failures.push(message);
}

function resolveUnreadableOfflineAssetFallback(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replace(/\\/g, "/");
  return unreadableOfflineAssetFallbacks.get(relativePath) || null;
}

async function readFileWithFallback(targetPath, encoding = null) {
  try {
    if (encoding) {
      return await fs.readFile(targetPath, encoding);
    }
    return await fs.readFile(targetPath);
  } catch (error) {
    if (error?.code !== "EPERM") {
      throw error;
    }
    const fallbackPath = resolveUnreadableOfflineAssetFallback(targetPath);
    if (!fallbackPath) {
      throw error;
    }
    if (encoding) {
      return fs.readFile(fallbackPath, encoding);
    }
    return fs.readFile(fallbackPath);
  }
}

async function readUtf8(targetPath) {
  return readFileWithFallback(targetPath, "utf8");
}

async function assertFilesEqual(sourcePath, targetPath, label) {
  const [sourceText, targetText] = await Promise.all([
    readUtf8(sourcePath),
    readUtf8(targetPath),
  ]);
  if (sourceText !== targetText) {
    recordFailure(`${label} 不一致: ${path.relative(repoRoot, targetPath)}`);
  }
}

async function listRelativeFiles(rootDir) {
  const output = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      if (
        relativePath === "runtime-assets" ||
        relativePath.startsWith("runtime-assets/")
      ) {
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

async function compareDirectories(sourceDir, targetDir, label) {
  const isGeneratedMobileWeb =
    label === "pages 与 Android Web 资源" || label === "pages 与 iOS Web 资源";
  const [sourceFiles, targetFiles] = await Promise.all([
    listRelativeFiles(sourceDir),
    listRelativeFiles(targetDir),
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
      readFileWithFallback(sourcePath),
      readFileWithFallback(targetPath),
    ]);
    if (!sourceBuffer.equals(targetBuffer)) {
      recordFailure(`${label} 文件内容不一致: ${relativePath}`);
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

function extractFunctionBlock(sourceText, functionName) {
  const declaration = `function ${functionName}`;
  const startIndex = sourceText.indexOf(declaration);
  if (startIndex === -1) {
    return null;
  }

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
  );
  await compareDirectories(
    path.join(repoRoot, "pages"),
    path.join(repoRoot, "ControlerApp", "ios", "controler-web"),
    "pages 与 iOS Web 资源",
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
    ]);

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
