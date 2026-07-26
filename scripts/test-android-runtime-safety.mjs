import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

const contractContext = { console };
contractContext.globalThis = contractContext;
vm.createContext(contractContext);
vm.runInContext(await read("shared/platform-contract.js"), contractContext);

const contract = contractContext.ControlerPlatformContract;
assert.equal(contract.getReactNativeRuntimeProfile("android").runtime, "android-webview");
assert.equal(contract.getReactNativeRuntimeProfile("ios").runtime, "ios-react-native");
assert.equal(contract.isNativeRuntime({ runtime: "android-webview" }), true);
assert.equal(contract.isNativeRuntime({ runtime: "ios-react-native" }), true);
assert.equal(contract.isAndroidWebViewRuntime("react-native"), false);
assert.equal(contract.isElectronRuntime({ runtime: "electron" }), true);

const bridge = await read("pages/rn-bridge.js");
assert.match(bridge, /pageSessionId: PAGE_SESSION_ID/);
assert.match(bridge, /navigationGeneration: NAVIGATION_GENERATION/);
assert.match(bridge, /postMessage\("bridge-session"/);

const postedMessages = [];
const bridgeContext = {
  console,
  JSON,
  Date,
  Math,
  Promise,
  setTimeout,
  clearTimeout,
  window: {
    __CONTROLER_RN_META__: {
      runtime: "android-webview",
      platform: "android",
      navigationGeneration: 9,
      capabilities: {},
    },
    __CONTROLER_RN_SESSION_ID__: "page-session-current",
    ReactNativeWebView: {
      postMessage(value) {
        postedMessages.push(JSON.parse(value));
      },
    },
    setTimeout,
    clearTimeout,
    dispatchEvent() {},
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
};
bridgeContext.globalThis = bridgeContext;
vm.createContext(bridgeContext);
const runtimeClassStart = bridge.indexOf("  function applyRuntimeClasses()");
assert.ok(runtimeClassStart > 0, "Unable to isolate the bridge request runtime");
vm.runInContext(`${bridge.slice(0, runtimeClassStart)}\n})();`, bridgeContext);

assert.deepEqual(postedMessages.shift(), {
  type: "bridge-session",
  pageSessionId: "page-session-current",
  navigationGeneration: 9,
  payload: {},
});

const responsePromise = bridgeContext.window.ControlerNativeBridge.call(
  "storage.getStatus",
);
const requestMessage = postedMessages.shift();
const requestId = requestMessage.payload.id;
let responseSettled = false;
void responsePromise.then(() => {
  responseSettled = true;
});

bridgeContext.window.__controlerReceiveNativeMessage({
  type: "bridge-response",
  pageSessionId: "page-session-stale",
  navigationGeneration: 9,
  payload: { id: requestId, result: { stale: true } },
});
await Promise.resolve();
assert.equal(responseSettled, false);

bridgeContext.window.__controlerReceiveNativeMessage({
  type: "bridge-response",
  pageSessionId: "page-session-current",
  navigationGeneration: 8,
  payload: { id: requestId, result: { stale: true } },
});
await Promise.resolve();
assert.equal(responseSettled, false);

bridgeContext.window.__controlerReceiveNativeMessage({
  type: "bridge-response",
  pageSessionId: "page-session-current",
  navigationGeneration: 9,
  payload: { id: requestId, result: { ok: true } },
});
assert.deepEqual(await responsePromise, { ok: true });

const activity = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/MainActivity.java",
);
assert.match(activity, /settings\.setAllowContentAccess\(false\)/);
assert.match(activity, /settings\.setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/);
assert.match(activity, /"http"\.equalsIgnoreCase\(scheme\)/);
assert.match(activity, /SHELL_URL = WEB_ROOT \+ "android-shell\.html"/);
assert.match(activity, /ControlerAndroidShell\.beginNavigation/);
assert.match(activity, /ControlerAndroidShell\.commitNavigation/);
assert.doesNotMatch(activity, /webView\.loadUrl\(withNavigationRequestId/);
assert.doesNotMatch(activity, /PixelCopy|navigationSurface/);
assert.doesNotMatch(activity, /target\.clearHistory\(\)/);
assert.doesNotMatch(activity, /prewarmPageBootstrapSnapshots/);
assert.doesNotMatch(activity, /Collections\.singleton\("\*"\)/);

const nativeBridge = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/OfflineWebViewBridge.java",
);
assert.match(nativeBridge, /requiresNavigationSerializedSetup/);
assert.match(nativeBridge, /!isCurrentPage\(requestSessionId, requestGeneration\)/);
assert.match(nativeBridge, /cancelInteractiveRequests\("activity_destroyed"/);
assert.match(
  nativeBridge,
  /"storage\.changed"\.equals\(name\)[\s\S]{0,100}sendEvent\(payload\)/,
);
assert.doesNotMatch(
  nativeBridge,
  /case "ui\.setLaunchThemeState":[\s\S]{0,180}applyThemeState\(/,
);

const shell = await read("pages/android-shell.js");
assert.match(shell, /const frameByPage = new Map\(\)/);
assert.match(shell, /controler-shell-resume/);
assert.match(shell, /controler-shell-theme/);
assert.match(shell, /frame\.name = buildThemeWindowName\(\)/);
assert.match(shell, /let currentThemeState = null/);
assert.match(shell, /navigationStateSignature/);
assert.match(shell, /navigationStateInitialized/);
assert.match(shell, /sourcePage === "settings" && reason === "settings-change"/);
assert.match(shell, /__controler_local__:appNavigationVisibility/);
assert.match(
  shell,
  /if \(isSettingsChange\) \{[\s\S]{0,180}localStorage\.setItem\([\s\S]{0,120}navigationStateStorageKey/,
);
assert.match(shell, /localStorage\.getItem\("appNavigationVisibility"\)/);
assert.match(shell, /payload\?\.name === "storage\.changed"/);
assert.match(shell, /controler-shell-storage-changed/);
assert.doesNotMatch(shell, /setInterval/);
const beginNavigationSource = shell.slice(
  shell.indexOf("function beginNavigation"),
  shell.indexOf("function commitNavigation"),
);
const commitNavigationSource = shell.slice(
  shell.indexOf("function commitNavigation"),
  shell.indexOf("function cancelNavigation"),
);
assert.doesNotMatch(beginNavigationSource, /updateCurrentNavigation\(target\.page\)/);
assert.match(commitNavigationSource, /updateCurrentNavigation\(/);

const stats = await read("pages/stats.js");
assert.match(stats, /const initialWorkspacePromise = readStatsWorkspace\(/);
assert.match(stats, /await Promise\.all\(\[/);
const normalizeStatsRecordsSource = stats.slice(
  stats.indexOf("function normalizeStatsLoadedRecords"),
  stats.indexOf("function buildStatsRecordDedupKey"),
);
assert.ok(
  normalizeStatsRecordsSource.indexOf("findStatsProjectById") <
    normalizeStatsRecordsSource.indexOf("findStatsProjectByName"),
);
assert.doesNotMatch(stats, /scheduleStatsInitialFreshValidation/);
assert.doesNotMatch(stats, /bootstrapStatsFromCachedSnapshot/);
assert.ok(
  stats.indexOf("await waitForStatsUiPaint();", stats.indexOf("async function init()")) <
    stats.indexOf("markStatsInitialReady();", stats.indexOf("async function init()")),
);
assert.doesNotMatch(stats, /scheduleStatsVisualizationRuntimePreload/);
const pieRendererSource = stats.slice(
  stats.indexOf("function renderPieHierarchyChart"),
  stats.indexOf("function getLineChartRangeMeta"),
);
assert.doesNotMatch(pieRendererSource, /\bd3\b/);
assert.match(pieRendererSource, /document\.createElementNS\(SVG_NS, "svg"\)/);

const statsHtml = await read("pages/stats.html");
assert.doesNotMatch(statsHtml, /<script[^>]+offline-assets\/chart\.runtime\.js/);
assert.match(stats, /function ensureStatsChartRuntimeLoaded\(\)/);

const storageAdapter = await read("pages/storage-adapter.js");
assert.match(storageAdapter, /function buildManagedBootstrapMirrorState\(/);
assert.match(
  storageAdapter,
  /const persistedState = hasPendingStateChanges\s*\? cachedState\s*:\s*buildManagedBootstrapMirrorState\(cachedState\)/,
);
assert.match(
  storageAdapter,
  /buildManagedMirrorCoverageMetadata\(hasPendingStateChanges\)/,
);

const storageBundleContext = { console };
storageBundleContext.globalThis = storageBundleContext;
vm.createContext(storageBundleContext);
vm.runInContext(await read("pages/storage-bundle.js"), storageBundleContext);
const storageBundle = storageBundleContext.ControlerStorageBundle;
const duplicateCrossMonthRecord = {
  id: "cross-month-record",
  projectId: "sleep",
  name: "睡觉",
  startTime: "2026-06-30T23:00:00.000Z",
  endTime: "2026-07-01T01:00:00.000Z",
  durationMs: 2 * 60 * 60 * 1000,
};
const rebuiltDurationProjects = storageBundle.rebuildProjectDurationCaches(
  [{ id: "sleep", name: "睡觉" }],
  [duplicateCrossMonthRecord, { ...duplicateCrossMonthRecord }],
);
assert.equal(storageBundle.PROJECT_DURATION_CACHE_VERSION, 3);
assert.equal(rebuiltDurationProjects[0].cachedDirectDurationMs, 2 * 60 * 60 * 1000);
const incrementedDurationProjects = storageBundle.applyProjectRecordDurationChanges(
  [{
    id: "sleep",
    name: "睡觉",
    durationCacheVersion: 3,
    cachedDirectDurationMs: 0,
    cachedTotalDurationMs: 0,
  }],
  {
    addedRecords: [duplicateCrossMonthRecord, { ...duplicateCrossMonthRecord }],
  },
);
assert.equal(incrementedDurationProjects[0].cachedDirectDurationMs, 2 * 60 * 60 * 1000);
const exactPathProjects = storageBundle.rebuildProjectDurationCaches(
  [
    { id: "leaf", name: "睡觉" },
    { id: "path", name: "生活/睡觉" },
  ],
  [{ name: "生活/睡觉", durationMs: 60 * 1000 }],
);
assert.equal(exactPathProjects[0].cachedDirectDurationMs, 0);
assert.equal(exactPathProjects[1].cachedDirectDurationMs, 60 * 1000);

const indexCss = await read("pages/index.css");
assert.match(
  indexCss,
  /body\.controler-android-native\.flex\.row[\s\S]{0,160}> \.app-nav \.app-nav-button\s*\{[\s\S]{0,360}transition:\s*none\s*!important;/,
);

const frameBridge = await read("pages/android-shell-frame.js");
assert.match(frameBridge, /rebindSession/);
assert.match(frameBridge, /ui\.shell-back-result/);
assert.match(frameBridge, /themeRuntime\.applyThemeState/);
assert.match(frameBridge, /__CONTROLER_ANDROID_SHELL_THEME_STATE__/);
assert.match(frameBridge, /controler:shell-visibility-changed|controler:native-bridge-event/);
assert.match(frameBridge, /controler-shell-storage-changed/);

assert.match(bridge, /function rebindSession\(nextGeneration\)/);

const uiHelpers = await read("pages/ui-helpers.js");
const navigationInitSource = uiHelpers.slice(
  uiHelpers.indexOf("function initAppNavigationVisibility"),
  uiHelpers.indexOf("function isAndroidNativeRuntime"),
);
assert.doesNotMatch(navigationInitSource, /"focus"|"visibilitychange"|"controler:storage-data-changed"/);
assert.match(uiHelpers, /reason:\s*"settings-change"/);

const dataStore = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/widgets/ControlerWidgetDataStore.java",
);
assert.match(dataStore, /STORAGE_TRANSACTION_FILE = "rollback\.json"/);
assert.match(dataStore, /READ_STATE_CORRUPTED/);
assert.match(dataStore, /sha256Text\(scopeKey\)/);
assert.doesNotMatch(dataStore, /transaction\.put\("ops"/);
assert.doesNotMatch(dataStore, /result\.put\("staleSnapshot"/);
assert.doesNotMatch(dataStore, /scopeKey\.hashCode\(\)/);
assert.match(dataStore, /isDefaultBundleUninitialized/);
assert.match(dataStore, /isBootstrapCacheEligible/);
assert.match(dataStore, /JSONObject root = loadRootStrict\(context\);/);
assert.match(dataStore, /recordStorageReadFailure/);
assert.match(dataStore, /PROJECT_DURATION_CACHE_VERSION = 3/);
assert.match(dataStore, /filterRecordDurationCacheOwners/);
assert.match(dataStore, /touchBundleMetadata\([\s\S]{0,180}repairedCore/);

const storageManager = await read("storage-manager.js");
assert.match(
  storageManager,
  /getPeriodIdForSectionItem\("records", record\) === periodId/,
);

const widgetRenderer = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/widgets/ControlerWidgetRenderer.java",
);
assert.match(widgetRenderer, /renderSource\.root\.has\("readState"\)/);

console.log("Android runtime safety checks passed.");
