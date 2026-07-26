package com.controlerapp;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.BridgeReactContext;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.lang.reflect.Method;
import java.util.ArrayDeque;
import java.util.Calendar;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Offline bridge for the Android WebView host. The React Native bridge module is
 * reused as a storage implementation, but no React runtime is created.
 */
public final class OfflineWebViewBridge {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicInteger navigationGeneration = new AtomicInteger();
    private final ReactApplicationContext reactContext;
    private final ControlerBridgeModule module;
    private final ArrayDeque<PendingNativeMessage> pendingMessages = new ArrayDeque<>();
    private WebView webView;
    private Activity activity;
    private DatePickerDialog activeDatePicker;
    private String pageSessionId = "";
    private boolean foreground = true;

    private static final class PendingNativeMessage {
        final JSONObject message;
        final String pageSessionId;
        final int navigationGeneration;

        PendingNativeMessage(JSONObject message, String pageSessionId, int navigationGeneration) {
            this.message = message;
            this.pageSessionId = pageSessionId;
            this.navigationGeneration = navigationGeneration;
        }
    }

    public OfflineWebViewBridge(Activity activity) {
        this.activity = activity;
        this.reactContext = new BridgeReactContext(activity.getApplicationContext());
        this.module = new ControlerBridgeModule(reactContext);
    }

    public void attach(WebView view) {
        webView = view;
    }

    public synchronized int onNavigationStarted() {
        int generation = navigationGeneration.incrementAndGet();
        pageSessionId = "";
        pendingMessages.clear();
        cancelInteractiveRequests("navigation_changed", "页面已切换，请求已取消。");
        return generation;
    }

    public synchronized void onResume(Activity nextActivity) {
        activity = nextActivity;
        foreground = true;
        reactContext.onHostResume(nextActivity);
        flushPendingMessages();
    }

    public synchronized void onPause() {
        foreground = false;
        reactContext.onHostPause();
    }

    public synchronized void onDestroy() {
        navigationGeneration.incrementAndGet();
        pageSessionId = "";
        pendingMessages.clear();
        cancelInteractiveRequests("activity_destroyed", "页面已关闭，请求已取消。");
        reactContext.onHostDestroy();
        executor.shutdownNow();
        webView = null;
        activity = null;
    }

    public void emitBridgeEvent(JSONObject payload) {
        if (payload != null) sendEvent(payload);
    }

    public void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        if (activity != null) {
            reactContext.onActivityResult(activity, requestCode, resultCode, data);
        }
    }

    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        module.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @JavascriptInterface
    public String getRuntimeMeta() {
        return "{\"runtime\":\"android-webview\",\"platform\":\"android\",\"isNative\":true,\"navigationGeneration\":"
            + navigationGeneration.get()
            + ",\"debug\":"
            + BuildConfig.DEBUG
            + ",\"performanceTracing\":"
            + BuildConfig.DEBUG
            + ",\"capabilities\":{\"storage\":true,\"widgets\":true,\"notifications\":true,\"offline\":true,\"hostPageNavigation\":true}}";
    }

    @JavascriptInterface
    public void postMessage(String rawMessage) {
        final JSONObject message;
        try {
            message = new JSONObject(rawMessage == null ? "{}" : rawMessage);
        } catch (Exception error) {
            return;
        }

        String type = message.optString("type", "");
        String requestSessionId = message.optString("pageSessionId", "").trim();
        int requestGeneration = message.optInt("navigationGeneration", -1);
        if ("bridge-session".equals(type)) {
            synchronized (this) {
                if (requestGeneration == navigationGeneration.get() && !requestSessionId.isEmpty()) {
                    pageSessionId = requestSessionId;
                }
            }
            return;
        }
        if (!isCurrentPage(requestSessionId, requestGeneration)) {
            return;
        }
        JSONObject payload = message.optJSONObject("payload");
        if (payload == null) {
            payload = new JSONObject();
        }
        if ("bridge-request".equals(type)) {
            final String id = payload.optString("id", "");
            final String method = payload.optString("method", "");
            final JSONObject requestPayload = payload.optJSONObject("payload");
            executor.execute(() -> dispatchRequest(
                id,
                method,
                requestPayload == null ? new JSONObject() : requestPayload,
                requestSessionId,
                requestGeneration
            ));
            return;
        }
        if ("bridge-event".equals(type)) {
            handleEvent(payload, requestSessionId, requestGeneration);
        }
    }

    private void dispatchRequest(
        String id,
        String method,
        JSONObject payload,
        String requestSessionId,
        int requestGeneration
    ) {
        if (id == null || id.trim().isEmpty()) {
            return;
        }
        if (!isCurrentPage(requestSessionId, requestGeneration)) {
            return;
        }
        ResponsePromise promise = new ResponsePromise(
            id,
            requestSessionId,
            requestGeneration
        );
        try {
            if (requiresNavigationSerializedSetup(method)) {
                synchronized (this) {
                    if (!isCurrentPage(requestSessionId, requestGeneration)) return;
                    invoke(
                        method,
                        payload,
                        promise,
                        requestSessionId,
                        requestGeneration
                    );
                }
            } else {
                invoke(method, payload, promise, requestSessionId, requestGeneration);
            }
        } catch (Exception error) {
            sendError(
                id,
                error.getMessage() == null ? error.toString() : error.getMessage(),
                requestSessionId,
                requestGeneration
            );
        }
    }

    private static boolean requiresNavigationSerializedSetup(String method) {
        return "storage.importSource".equals(method)
            || "storage.pickImportSourceFile".equals(method)
            || "storage.pickDiaryImages".equals(method)
            || "storage.selectFile".equals(method)
            || "storage.selectDirectory".equals(method)
            || "notifications.requestPermission".equals(method)
            || "ui.pickDate".equals(method);
    }

    private void invoke(
        String method,
        JSONObject payload,
        Promise promise,
        String requestSessionId,
        int requestGeneration
    ) throws Exception {
        switch (method) {
            case "storage.readState": call("readStorageState", promise); return;
            case "storage.writeState": call("writeStorageState", jsonObject(payload.opt("state")), promise); return;
            case "storage.getStatus": call("getStorageStatus", promise); return;
            case "storage.getManifest": call("getStorageManifest", promise); return;
            case "storage.getCoreState": call("getStorageCoreState", promise); return;
            case "storage.getPageBootstrapState": call("getStoragePageBootstrapState", payloadJson(payload, "pageKey", "options"), promise); return;
            case "storage.getBootstrapState": call("getStorageBootstrapState", jsonObject(payload.opt("options")), promise); return;
            case "storage.getPlanBootstrapState": call("getStoragePlanBootstrapState", jsonObject(payload.opt("options")), promise); return;
            case "storage.getDraft": call("getStorageDraft", draftPayload(payload), promise); return;
            case "storage.setDraft": call("setStorageDraft", draftPayload(payload), promise); return;
            case "storage.removeDraft": call("removeStorageDraft", jsonObject(payload), promise); return;
            case "storage.pickDiaryImages": call("pickDiaryImages", jsonObject(payload.opt("options")), promise); return;
            case "storage.saveDiaryImageAsset": call("saveDiaryImageAsset", jsonObject(payload.opt("options")), promise); return;
            case "storage.resolveDiaryImageUri": call("resolveDiaryImageUri", jsonObject(payload.opt("options")), promise); return;
            case "storage.deleteDiaryImageAssets": call("deleteDiaryImageAssets", jsonObject(payload.opt("options")), promise); return;
            case "storage.getAutoBackupStatus": call("getAutoBackupStatus", promise); return;
            case "storage.updateAutoBackupSettings": call("updateAutoBackupSettings", jsonObject(payload.opt("settings")), promise); return;
            case "storage.runAutoBackupNow": call("runAutoBackupNow", promise); return;
            case "storage.shareLatestBackup": call("shareLatestBackup", promise); return;
            case "storage.loadSectionRange": call("loadStorageSectionRange", payload.optString("section", ""), jsonObject(payload.opt("scope")), promise); return;
            case "storage.saveSectionRange": call("saveStorageSectionRange", payload.optString("section", ""), jsonObject(payload.opt("payload")), promise); return;
            case "storage.replaceCoreState": call("replaceStorageCoreState", jsonObject(payload.opt("partialCore")), promise); return;
            case "storage.appendJournal": call("appendStorageJournal", jsonObject(payload.opt("payload")), promise); return;
            case "storage.flushJournal": call("flushStorageJournal", promise); return;
            case "storage.replaceRecurringPlans": call("replaceStorageRecurringPlans", jsonArray(payload.opt("items")), promise); return;
            case "storage.probeStateVersion": call("probeStorageStateVersion", payload.optBoolean("includeFallbackHash", false), promise); return;
            case "storage.exportBundle": call("exportStorageBundle", jsonObject(payload.opt("options")), promise); return;
            case "storage.importSource": call("importStorageSource", jsonObject(payload.opt("options")), promise); return;
            case "storage.pickImportSourceFile": call("pickImportSourceFile", jsonObject(payload.opt("options")), promise); return;
            case "storage.inspectImportSourceFile": call("inspectImportSourceFile", jsonObject(payload.opt("options")), promise); return;
            case "storage.previewExternalImport": call("previewExternalImport", jsonObject(payload.opt("options")), promise); return;
            case "storage.selectFile": call("selectStorageFile", promise); return;
            case "storage.selectDirectory": call("selectStorageDirectory", promise); return;
            case "storage.resetFile": call("resetStorageFile", promise); return;
            case "widgets.requestPinWidget": call("requestPinWidget", payload.optString("kind", ""), promise); return;
            case "widgets.getPinSupport": call("getWidgetPinSupport", payload.optString("kind", ""), promise); return;
            case "widgets.consumePinWidgetResult": call("consumePinWidgetResult", promise); return;
            case "widgets.openHomeScreen": call("openHomeScreen", promise); return;
            case "widgets.refresh": call("refreshWidgets", payload.toString(), promise); return;
            case "widgets.consumeLaunchAction": call("consumeLaunchAction", promise); return;
            case "settings.exportData": call("exportData", jsonObject(payload.opt("state")), payload.optString("fileName", ""), promise); return;
            case "notifications.requestPermission": call("requestNotificationPermission", payload.optBoolean("interactive", true), promise); return;
            case "notifications.syncSchedule": call("syncNotificationSchedule", payload.toString(), promise); return;
            case "ui.setLastVisiblePage": call("setLastVisiblePage", payload.optString("pageKey", ""), promise); return;
            case "ui.setLaunchThemeState":
                JSONObject themeState = payload.optJSONObject("themeState");
                call("setLaunchThemeState", jsonObject(themeState), promise);
                return;
            case "ui.showToast": call("showToast", payload.optString("message", ""), promise); return;
            case "ui.pickDate":
                pickDate(
                    payload.optString("value", ""),
                    promise,
                    requestSessionId,
                    requestGeneration
                );
                return;
            case "ui.showSoftInput": call("showSoftInput", promise); return;
            case "ui.restartSoftInput": call("restartSoftInput", promise); return;
            case "ui.getSoftInputState": call("getSoftInputState", promise); return;
            case "ui.getLanguage": call("getUiLanguage", promise); return;
            case "ui.setLanguage": call("setUiLanguage", payload.optString("language", ""), promise); return;
            case "ui.getLaunchThemeState": call("getLaunchThemeState", promise); return;
            case "ui.getStartUrl": call("getStartUrl", promise); return;
            case "ui.markStartupReady": call("markStartupReady", promise); return;
            default: throw new IllegalArgumentException("Unsupported native bridge method: " + method);
        }
    }

    private void pickDate(
        String value,
        Promise promise,
        String requestSessionId,
        int requestGeneration
    ) {
        mainHandler.post(() -> {
            if (
                !isCurrentPage(requestSessionId, requestGeneration)
                    || activity == null
                    || activity.isFinishing()
            ) {
                promise.reject("pick_date_failed", "当前没有可用的前台页面。");
                return;
            }

            Calendar initialDate = Calendar.getInstance();
            String[] dateParts = value == null ? new String[0] : value.trim().split("-");
            if (dateParts.length == 3) {
                try {
                    initialDate.set(
                        Integer.parseInt(dateParts[0]),
                        Integer.parseInt(dateParts[1]) - 1,
                        Integer.parseInt(dateParts[2])
                    );
                } catch (NumberFormatException ignored) {}
            }

            boolean[] resolved = {false};
            DatePickerDialog dialog = new DatePickerDialog(
                activity,
                (view, year, month, day) -> {
                    resolved[0] = true;
                    promise.resolve(
                        String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, day)
                    );
                },
                initialDate.get(Calendar.YEAR),
                initialDate.get(Calendar.MONTH),
                initialDate.get(Calendar.DAY_OF_MONTH)
            );
            dialog.setOnDismissListener(ignored -> {
                synchronized (OfflineWebViewBridge.this) {
                    if (activeDatePicker == dialog) activeDatePicker = null;
                }
                if (!resolved[0]) {
                    resolved[0] = true;
                    promise.resolve(null);
                }
            });
            synchronized (OfflineWebViewBridge.this) {
                activeDatePicker = dialog;
            }
            dialog.show();
        });
    }

    private void call(String methodName, Object... actualArgs) throws Exception {
        Method target = null;
        for (Method candidate : ControlerBridgeModule.class.getMethods()) {
            if (!candidate.getName().equals(methodName) || candidate.getParameterTypes().length != actualArgs.length) {
                continue;
            }
            target = candidate;
            break;
        }
        if (target == null) {
            throw new NoSuchMethodException(methodName);
        }
        target.invoke(module, actualArgs);
    }

    private static String jsonObject(Object value) {
        if (value instanceof JSONObject) return value.toString();
        if (value instanceof JSONArray) return value.toString();
        if (value == null || value == JSONObject.NULL) return "{}";
        return String.valueOf(value);
    }

    private static String jsonArray(Object value) {
        if (value instanceof JSONArray) return value.toString();
        return value == null || value == JSONObject.NULL ? "[]" : String.valueOf(value);
    }

    private static String draftPayload(JSONObject payload) {
        JSONObject result = new JSONObject();
        try {
            result.put("key", payload.optString("key", ""));
            result.put("value", payload.opt("value"));
            result.put("options", payload.optJSONObject("options") == null ? new JSONObject() : payload.optJSONObject("options"));
        } catch (Exception ignored) {}
        return result.toString();
    }

    private static String payloadJson(JSONObject payload, String key, String optionsKey) {
        JSONObject result = new JSONObject();
        try {
            result.put(key, payload.optString(key, "index"));
            result.put("options", payload.optJSONObject(optionsKey) == null ? new JSONObject() : payload.optJSONObject(optionsKey));
        } catch (Exception ignored) {}
        return result.toString();
    }

    private void handleEvent(JSONObject payload, String requestSessionId, int requestGeneration) {
        String name = payload.optString("name", "");
        if ("ui.navigate".equals(name)) {
            final JSONObject request = payload == null ? new JSONObject() : payload;
            mainHandler.post(() -> {
                if (isCurrentPage(requestSessionId, requestGeneration) && activity instanceof MainActivity) {
                    ((MainActivity) activity).handleWebNavigation(request);
                }
            });
            return;
        }
        if ("ui.theme-applied".equals(name)) {
            JSONObject themeState = new JSONObject();
            try {
                themeState.put("selectedTheme", payload.optString("selectedTheme", "default"));
                themeState.put("customThemes", payload.optJSONArray("customThemes") == null ? new JSONArray() : payload.optJSONArray("customThemes"));
                themeState.put("builtInThemeOverrides", payload.optJSONObject("builtInThemeOverrides") == null ? new JSONObject() : payload.optJSONObject("builtInThemeOverrides"));
                themeState.put("colors", payload.optJSONObject("colors") == null ? new JSONObject() : payload.optJSONObject("colors"));
                themeState.put("recordCard", payload.optJSONObject("recordCard") == null ? new JSONObject() : payload.optJSONObject("recordCard"));
            } catch (Exception ignored) {}
            applyThemeState(themeState, requestSessionId, requestGeneration);
            return;
        }
        if ("ui.navigation-visibility".equals(name)) {
            mainHandler.post(() -> {
                if (isCurrentPage(requestSessionId, requestGeneration) && activity instanceof MainActivity) {
                    ((MainActivity) activity).applyShellNavigationState(payload);
                }
            });
            return;
        }
        if ("storage.changed".equals(name)) {
            sendEvent(payload);
            return;
        }
        if ("ui.shell-back-result".equals(name)) {
            mainHandler.post(() -> {
                if (isCurrentPage(requestSessionId, requestGeneration) && activity instanceof MainActivity) {
                    ((MainActivity) activity).onShellBackResult(payload.optBoolean("handled", false));
                }
            });
            return;
        }
        if ("ui.page-ready".equals(name)) {
            mainHandler.post(() -> {
                if (isCurrentPage(requestSessionId, requestGeneration) && activity instanceof MainActivity) {
                    ((MainActivity) activity).onWebPageReady(payload);
                }
            });
            return;
        }
        if (
            "perf.metric".equals(name)
                && "page-ready-emitted".equals(payload.optString("stage", ""))
        ) {
            Log.i("ControlerPerf", payload.toString());
        }
    }

    private void applyThemeState(JSONObject themeState) {
        final String targetSession;
        final int targetGeneration;
        synchronized (this) {
            targetSession = pageSessionId;
            targetGeneration = navigationGeneration.get();
        }
        applyThemeState(themeState, targetSession, targetGeneration);
    }

    private void applyThemeState(
        JSONObject themeState,
        String targetSession,
        int targetGeneration
    ) {
        final JSONObject safeState = themeState == null ? new JSONObject() : themeState;
        mainHandler.post(() -> {
            if (isCurrentPage(targetSession, targetGeneration) && activity instanceof MainActivity) {
                ((MainActivity) activity).applyWebThemeState(safeState);
            }
        });
    }

    private void sendEvent(JSONObject eventPayload) {
        final String targetSession;
        final int targetGeneration;
        synchronized (this) {
            targetSession = pageSessionId;
            targetGeneration = navigationGeneration.get();
        }
        if (targetSession.isEmpty()) return;
        JSONObject message = new JSONObject();
        try {
            message.put("type", "bridge-event");
            message.put("payload", eventPayload);
        } catch (Exception ignored) { return; }
        sendMessage(message, targetSession, targetGeneration);
    }

    public void emitNavigationAck(JSONObject request, String state, String reason) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("name", "ui.navigate-ack");
            payload.put("requestId", request == null ? "" : request.optString("requestId", ""));
            payload.put("page", request == null ? "" : request.optString("page", ""));
            payload.put("href", request == null ? "" : request.optString("href", ""));
            payload.put("state", state == null ? "rejected" : state);
            payload.put("reason", reason == null ? "" : reason);
        } catch (Exception ignored) {
            return;
        }
        sendEvent(payload);
    }

    private void sendError(String id, String error, String targetSession, int targetGeneration) {
        JSONObject payload = new JSONObject();
        try { payload.put("id", id); payload.put("error", error == null ? "native bridge error" : error); } catch (Exception ignored) {}
        JSONObject message = new JSONObject();
        try { message.put("type", "bridge-response"); message.put("payload", payload); } catch (Exception ignored) { return; }
        sendMessage(message, targetSession, targetGeneration);
    }

    private void sendResult(String id, Object value, String targetSession, int targetGeneration) {
        JSONObject payload = new JSONObject();
        try { payload.put("id", id); payload.put("result", normalizeResult(value)); } catch (Exception ignored) {}
        JSONObject message = new JSONObject();
        try { message.put("type", "bridge-response"); message.put("payload", payload); } catch (Exception ignored) { return; }
        sendMessage(message, targetSession, targetGeneration);
    }

    private static Object normalizeResult(Object value) {
        if (!(value instanceof String)) return value == null ? JSONObject.NULL : value;
        String text = (String) value;
        try {
            Object parsed = new JSONTokener(text).nextValue();
            if (parsed instanceof JSONObject || parsed instanceof JSONArray) return parsed;
        } catch (Exception ignored) {}
        return text;
    }

    private void sendMessage(JSONObject message, String targetSession, int targetGeneration) {
        try {
            message.put("pageSessionId", targetSession);
            message.put("navigationGeneration", targetGeneration);
        } catch (Exception ignored) {
            return;
        }
        mainHandler.post(() -> {
            synchronized (OfflineWebViewBridge.this) {
                if (!isCurrentPage(targetSession, targetGeneration) || webView == null) return;
                if (!foreground) {
                    if (pendingMessages.size() >= 64) pendingMessages.removeFirst();
                    pendingMessages.addLast(
                        new PendingNativeMessage(message, targetSession, targetGeneration)
                    );
                    return;
                }
                evaluateMessage(message);
            }
        });
    }

    private synchronized boolean isCurrentPage(String sessionId, int generation) {
        return generation == navigationGeneration.get()
            && sessionId != null
            && !sessionId.isEmpty()
            && sessionId.equals(pageSessionId);
    }

    private void evaluateMessage(JSONObject message) {
        if (webView == null) return;
        final String script = "(function(){var m=" + message.toString() + ";if(window.ControlerAndroidShell&&typeof window.ControlerAndroidShell.routeNativeMessage==='function'){window.ControlerAndroidShell.routeNativeMessage(m);return true;}if(typeof window.__controlerReceiveNativeMessage==='function'){window.__controlerReceiveNativeMessage(m);}else{(window.__CONTROLER_PENDING_NATIVE_MESSAGES__=window.__CONTROLER_PENDING_NATIVE_MESSAGES__||[]).push(m);}return true;})();";
        webView.evaluateJavascript(script, null);
    }

    private void flushPendingMessages() {
        while (!pendingMessages.isEmpty()) {
            PendingNativeMessage pending = pendingMessages.removeFirst();
            if (isCurrentPage(pending.pageSessionId, pending.navigationGeneration)) {
                evaluateMessage(pending.message);
            }
        }
    }

    private void cancelInteractiveRequests(String code, String message) {
        module.cancelPendingRequests(code, message);
        final DatePickerDialog dialog = activeDatePicker;
        activeDatePicker = null;
        if (dialog != null) {
            mainHandler.post(dialog::dismiss);
        }
    }

    private final class ResponsePromise implements Promise {
        private final String id;
        private final String targetSession;
        private final int targetGeneration;
        ResponsePromise(String id, String targetSession, int targetGeneration) {
            this.id = id;
            this.targetSession = targetSession;
            this.targetGeneration = targetGeneration;
        }
        @Override public void resolve(Object value) { sendResult(id, value, targetSession, targetGeneration); }
        @Override public void reject(String code, String message) { sendError(id, message == null ? code : message, targetSession, targetGeneration); }
        @Override public void reject(String code, Throwable e) { sendError(id, e == null ? code : e.getMessage(), targetSession, targetGeneration); }
        @Override public void reject(String code, String message, Throwable e) { sendError(id, message == null ? code : message, targetSession, targetGeneration); }
        @Override public void reject(Throwable reason) { sendError(id, reason == null ? "native bridge error" : reason.getMessage(), targetSession, targetGeneration); }
        @Override public void reject(Throwable reason, WritableMap userInfo) { reject(reason); }
        @Override public void reject(String code, WritableMap userInfo) { sendError(id, code, targetSession, targetGeneration); }
        @Override public void reject(String code, Throwable reason, WritableMap userInfo) { reject(code, reason); }
        @Override public void reject(String code, String message, WritableMap userInfo) { sendError(id, message == null ? code : message, targetSession, targetGeneration); }
        @Override public void reject(String code, String message, Throwable e, WritableMap userInfo) { sendError(id, message == null ? code : message, targetSession, targetGeneration); }
        @Override public void reject(String code) { sendError(id, code, targetSession, targetGeneration); }
    }

}
