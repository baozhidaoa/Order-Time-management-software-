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
assert.doesNotMatch(activity, /target\.clearHistory\(\)/);
assert.doesNotMatch(activity, /Collections\.singleton\("\*"\)/);

const nativeBridge = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/OfflineWebViewBridge.java",
);
assert.match(nativeBridge, /requiresNavigationSerializedSetup/);
assert.match(nativeBridge, /!isCurrentPage\(requestSessionId, requestGeneration\)/);
assert.match(nativeBridge, /cancelInteractiveRequests\("activity_destroyed"/);

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

const widgetRenderer = await read(
  "ControlerApp/android/app/src/main/java/com/controlerapp/widgets/ControlerWidgetRenderer.java",
);
assert.match(widgetRenderer, /renderSource\.root\.has\("readState"\)/);

console.log("Android runtime safety checks passed.");
