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

const failures = [];

function recordFailure(message) {
  failures.push(message);
}

async function readUtf8(targetPath) {
  return fs.readFile(targetPath, "utf8");
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

async function compareDirectories(sourceDir, targetDir, label) {
  const [sourceFiles, targetFiles] = await Promise.all([
    listRelativeFiles(sourceDir),
    listRelativeFiles(targetDir),
  ]);
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);

  for (const relativePath of sourceFiles) {
    if (!targetSet.has(relativePath)) {
      recordFailure(`${label} 缺少文件: ${relativePath}`);
    }
  }

  for (const relativePath of targetFiles) {
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
    const [sourceBuffer, targetBuffer] = await Promise.all([
      fs.readFile(sourcePath),
      fs.readFile(targetPath),
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

  const [androidBridgeSource, iosBridgeSource, appTsxSource, androidKindsSource, iosInfoPlistSource, iosProjectSource] =
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
