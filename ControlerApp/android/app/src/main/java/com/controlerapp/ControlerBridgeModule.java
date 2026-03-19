package com.controlerapp;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.OpenableColumns;
import android.database.Cursor;

import com.controlerapp.widgets.ControlerWidgetDataStore;
import com.controlerapp.widgets.ControlerWidgetKinds;
import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.controlerapp.widgets.ControlerWidgetRenderer;
import com.controlerapp.widgets.ControlerWidgetPinResultReceiver;
import com.controlerapp.widgets.ControlerWidgetPinStore;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import androidx.core.content.FileProvider;

public class ControlerBridgeModule extends ReactContextBaseJavaModule {
    private static final int REQUEST_SELECT_STORAGE_FILE = 41021;
    private static final int REQUEST_SELECT_STORAGE_DIRECTORY = 41022;
    private static final int REQUEST_NOTIFICATION_PERMISSION = 41023;
    private static final int REQUEST_IMPORT_STORAGE_SOURCE = 41024;
    private static final int REQUEST_PICK_IMPORT_SOURCE = 41025;
    private static final String SWITCH_ACTION_ADOPTED_EXISTING = "adopted-existing";
    private static final String SWITCH_ACTION_SEEDED_CURRENT = "seeded-current";
    private static final String ROOT_ARRAY_PATH = "$";
    private static final String EXTERNAL_IMPORT_SOURCE_KIND = "external-json";
    private static final String AUTO_BACKUP_PREFS = "controler_auto_backup_prefs";
    private static final String UI_LANGUAGE_PREFS = "controler_ui_preferences";
    private static final String KEY_AUTO_BACKUP_ENABLED = "enabled";
    private static final String KEY_UI_LANGUAGE = "language";
    private static final String KEY_AUTO_BACKUP_INTERVAL_VALUE = "interval_value";
    private static final String KEY_AUTO_BACKUP_INTERVAL_UNIT = "interval_unit";
    private static final String KEY_AUTO_BACKUP_MAX_BACKUPS = "max_backups";
    private static final String KEY_AUTO_BACKUP_LAST_ATTEMPT_AT = "last_attempt_at";
    private static final String KEY_AUTO_BACKUP_LAST_ERROR = "last_error";
    private static final String KEY_AUTO_BACKUP_LAST_BACKED_UP_FINGERPRINT =
        "last_backed_up_fingerprint";
    private static final String KEY_AUTO_BACKUP_TARGET_KEY = "target_key";
    private static final String DEFAULT_AUTO_BACKUP_INTERVAL_UNIT = "day";
    private static final String DEFAULT_UI_LANGUAGE = "zh-CN";
    private static final int DEFAULT_AUTO_BACKUP_INTERVAL_VALUE = 1;
    private static final int DEFAULT_AUTO_BACKUP_MAX_BACKUPS = 7;

    private static final class WidgetPinSupportState {
        final String kind;
        final boolean apiSupported;
        final boolean launcherSupported;
        final boolean canRequestPin;
        final boolean manualOnly;
        final boolean providerAvailable;
        final String reason;
        final String message;

        WidgetPinSupportState(
            String kind,
            boolean apiSupported,
            boolean launcherSupported,
            boolean canRequestPin,
            boolean manualOnly,
            boolean providerAvailable,
            String reason,
            String message
        ) {
            this.kind = kind == null ? "" : kind;
            this.apiSupported = apiSupported;
            this.launcherSupported = launcherSupported;
            this.canRequestPin = canRequestPin;
            this.manualOnly = manualOnly;
            this.providerAvailable = providerAvailable;
            this.reason = reason == null ? "" : reason;
            this.message = message == null ? "" : message;
        }
    }

    private static final class BackupEntry {
        final String fileName;
        final String path;
        final Uri uri;
        final long size;
        final long modifiedAt;

        BackupEntry(String fileName, String path, Uri uri, long size, long modifiedAt) {
            this.fileName = fileName;
            this.path = path;
            this.uri = uri;
            this.size = size;
            this.modifiedAt = modifiedAt;
        }
    }

    private static final class StorageSwitchPlan {
        final String switchAction;
        final Uri documentUri;

        StorageSwitchPlan(String switchAction, Uri documentUri) {
            this.switchAction = switchAction;
            this.documentUri = documentUri;
        }
    }

    private static final class ExternalRecordResult {
        final JSONObject record;
        final String reason;

        ExternalRecordResult(JSONObject record, String reason) {
            this.record = record;
            this.reason = reason == null ? "" : reason;
        }
    }

    private static final class ExternalNormalizeResult {
        final ArrayList<JSONObject> records = new ArrayList<>();
        final LinkedHashSet<String> projectNames = new LinkedHashSet<>();
        final LinkedHashSet<String> affectedDates = new LinkedHashSet<>();
        final LinkedHashSet<String> affectedPeriodIds = new LinkedHashSet<>();
        final JSONObject invalidReasons = new JSONObject();
        int totalCount = 0;
    }

    private static final class ProjectReconciliationResult {
        final ArrayList<JSONObject> projects;
        final Map<String, JSONObject> nameIndex;
        final int matchedProjects;
        final int createdProjects;

        ProjectReconciliationResult(
            ArrayList<JSONObject> projects,
            Map<String, JSONObject> nameIndex,
            int matchedProjects,
            int createdProjects
        ) {
            this.projects = projects == null ? new ArrayList<JSONObject>() : projects;
            this.nameIndex = nameIndex == null ? new HashMap<String, JSONObject>() : nameIndex;
            this.matchedProjects = matchedProjects;
            this.createdProjects = createdProjects;
        }
    }

    private static final class ExternalImportPreviewResult {
        final JSONObject payload;
        final ArrayList<JSONObject> records;
        final ArrayList<JSONObject> projects;

        ExternalImportPreviewResult(
            JSONObject payload,
            ArrayList<JSONObject> records,
            ArrayList<JSONObject> projects
        ) {
            this.payload = payload == null ? new JSONObject() : payload;
            this.records = records == null ? new ArrayList<JSONObject>() : records;
            this.projects = projects == null ? new ArrayList<JSONObject>() : projects;
        }
    }

    private Promise pendingSelectStorageFilePromise = null;
    private Promise pendingSelectStorageDirectoryPromise = null;
    private Promise pendingNotificationPermissionPromise = null;
    private Promise pendingImportStorageSourcePromise = null;
    private JSONObject pendingImportStorageSourceOptions = null;
    private Promise pendingPickImportSourcePromise = null;
    private JSONObject pendingPickImportSourceOptions = null;
    private String cachedImportPayloadUri = "";
    private Object cachedImportPayload = null;
    private final PermissionListener notificationPermissionListener =
        new PermissionListener() {
            @Override
            public boolean onRequestPermissionsResult(
                int requestCode,
                String[] permissions,
                int[] grantResults
            ) {
                if (requestCode != REQUEST_NOTIFICATION_PERMISSION) {
                    return false;
                }

                Promise promise = pendingNotificationPermissionPromise;
                pendingNotificationPermissionPromise = null;
                if (promise == null) {
                    return true;
                }

                boolean granted =
                    grantResults != null
                        && grantResults.length > 0
                        && grantResults[0] == PackageManager.PERMISSION_GRANTED;
                try {
                    if (granted) {
                        ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
                    }
                    promise.resolve(
                        buildNotificationPermissionResult(true, granted, true).toString()
                    );
                } catch (Exception error) {
                    promise.reject("notification_permission_failed", error);
                }
                return true;
            }
        };
    private final ActivityEventListener activityEventListener =
        new BaseActivityEventListener() {
            @Override
            public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent intent) {
                if (requestCode == REQUEST_SELECT_STORAGE_FILE) {
                    handleStorageFileSelectionResult(resultCode, intent);
                } else if (requestCode == REQUEST_SELECT_STORAGE_DIRECTORY) {
                    handleStorageDirectorySelectionResult(resultCode, intent);
                } else if (requestCode == REQUEST_IMPORT_STORAGE_SOURCE) {
                    handleImportStorageSourceSelectionResult(resultCode, intent);
                } else if (requestCode == REQUEST_PICK_IMPORT_SOURCE) {
                    handlePickImportSourceSelectionResult(resultCode, intent);
                }
            }
        };

    public ControlerBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(activityEventListener);
    }

    @Override
    public String getName() {
        return "ControlerBridge";
    }

    private String normalizeUiLanguage(String language) {
        String normalized = String.valueOf(language == null ? "" : language).trim().toLowerCase();
        if ("en".equals(normalized) || "en-us".equals(normalized)) {
            return "en-US";
        }
        return DEFAULT_UI_LANGUAGE;
    }

    private SharedPreferences getUiLanguagePreferences() {
        return getReactApplicationContext().getSharedPreferences(
            UI_LANGUAGE_PREFS,
            Context.MODE_PRIVATE
        );
    }

    private String readStoredUiLanguage() {
        SharedPreferences preferences = getUiLanguagePreferences();
        return normalizeUiLanguage(
            preferences.getString(KEY_UI_LANGUAGE, DEFAULT_UI_LANGUAGE)
        );
    }

    private void scheduleWidgetRefresh(JSONObject payload) {
        ControlerWidgetRenderer.scheduleRefresh(getReactApplicationContext(), payload);
    }

    private void scheduleWidgetRefresh(JSONArray changedSections, String source) throws Exception {
        JSONObject payload = new JSONObject();
        if (changedSections != null) {
            payload.put("changedSections", changedSections);
        }
        if (!TextUtils.isEmpty(source)) {
            payload.put("source", source);
        }
        scheduleWidgetRefresh(payload);
    }

    private JSONArray toJsonArray(LinkedHashSet<String> sections) {
        JSONArray array = new JSONArray();
        if (sections == null) {
            return array;
        }
        for (String section : sections) {
            if (!TextUtils.isEmpty(section)) {
                array.put(section);
            }
        }
        return array;
    }

    private JSONArray inferChangedSectionsFromCorePatch(JSONObject partialCore) {
        LinkedHashSet<String> sections = new LinkedHashSet<>();
        if (partialCore == null) {
            sections.add("core");
            return toJsonArray(sections);
        }

        if (partialCore.has("projects")) {
            sections.add("projects");
        }
        if (partialCore.has("yearlyGoals")) {
            sections.add("yearlyGoals");
        }
        if (partialCore.has("todos")) {
            sections.add("todos");
        }
        if (partialCore.has("checkinItems")) {
            sections.add("checkinItems");
        }
        if (partialCore.has("dailyCheckins")) {
            sections.add("dailyCheckins");
        }
        if (partialCore.has("checkins")) {
            sections.add("checkins");
        }
        if (partialCore.has("timerSessionState")) {
            sections.add("timerSessionState");
        }
        if (partialCore.has("records")) {
            sections.add("records");
        }
        if (partialCore.has("plans")) {
            sections.add("plans");
        }
        if (partialCore.has("diaryEntries")) {
            sections.add("diaryEntries");
        }
        if (partialCore.has("diaryCategories")) {
            sections.add("diaryCategories");
        }
        if (partialCore.has("guideState")) {
            sections.add("guideState");
        }
        if (partialCore.has("customThemes")) {
            sections.add("customThemes");
        }
        if (partialCore.has("builtInThemeOverrides")) {
            sections.add("builtInThemeOverrides");
        }
        if (partialCore.has("selectedTheme")) {
            sections.add("selectedTheme");
        }
        if (partialCore.has("createdAt")
            || partialCore.has("lastModified")
            || partialCore.has("storagePath")
            || partialCore.has("storageDirectory")
            || partialCore.has("userDataPath")
            || partialCore.has("documentsPath")
            || partialCore.has("syncMeta")) {
            sections.add("core");
        }

        if (sections.isEmpty()) {
            sections.add("core");
        }
        return toJsonArray(sections);
    }

    @ReactMethod
    public void getUiLanguage(Promise promise) {
        try {
            promise.resolve(readStoredUiLanguage());
        } catch (Exception error) {
            promise.resolve(DEFAULT_UI_LANGUAGE);
        }
    }

    @ReactMethod
    public void setUiLanguage(String language, Promise promise) {
        try {
            String normalizedLanguage = normalizeUiLanguage(language);
            getUiLanguagePreferences()
                .edit()
                .putString(KEY_UI_LANGUAGE, normalizedLanguage)
                .apply();
            promise.resolve(normalizedLanguage);
        } catch (Exception error) {
            promise.resolve(DEFAULT_UI_LANGUAGE);
        }
    }

    @ReactMethod
    public void getStartUrl(Promise promise) {
        try {
            promise.resolve(buildStartUrl(getReactApplicationContext()));
        } catch (Exception error) {
            promise.resolve("file:///android_asset/controler-web/index.html");
        }
    }

    private String buildStartUrl(Context context) throws Exception {
        JSONObject launchAction = ControlerWidgetLaunchStore.consumeLaunchAction(context);
        String page = normalizeLaunchPage(launchAction.optString("page", ""));
        String action = String.valueOf(launchAction.optString("action", "")).trim();
        String widgetKind = String.valueOf(launchAction.optString("widgetKind", "")).trim();
        String source = String.valueOf(launchAction.optString("source", "android-widget")).trim();

        Uri.Builder builder = Uri.parse(
            "file:///android_asset/controler-web/" + page + ".html"
        ).buildUpon();
        if (!TextUtils.isEmpty(action)) {
            builder.appendQueryParameter("widgetAction", action);
        }
        if (!TextUtils.isEmpty(widgetKind)) {
            builder.appendQueryParameter("widgetKind", widgetKind);
        }
        if (!TextUtils.isEmpty(source) && !TextUtils.isEmpty(action)) {
            builder.appendQueryParameter("widgetSource", source);
        }
        String launchUrl = builder.build().toString();
        ControlerStartupTrace.mark(
            "start_url_built",
            "page=" + page
                + " action=" + (TextUtils.isEmpty(action) ? "-" : action)
                + " widgetKind=" + (TextUtils.isEmpty(widgetKind) ? "-" : widgetKind)
        );
        return launchUrl;
    }

    private String normalizeLaunchPage(String page) {
        String normalized = String.valueOf(page == null ? "" : page).trim();
        if ("stats".equals(normalized)) {
            return "stats";
        }
        if ("plan".equals(normalized)) {
            return "plan";
        }
        if ("diary".equals(normalized)) {
            return "diary";
        }
        if ("settings".equals(normalized)) {
            return "settings";
        }
        return "index";
    }

    @ReactMethod
    public void readStorageState(Promise promise) {
        try {
            JSONObject root = ControlerWidgetDataStore.loadRootStrict(getReactApplicationContext());
            JSONObject payload = new JSONObject();
            payload.put("state", root);
            payload.put("status", buildStorageStatus(root));
            promise.resolve(payload.toString());
        } catch (Exception error) {
            promise.reject("storage_read_failed", error);
        }
    }

    @ReactMethod
    public void writeStorageState(String stateJson, Promise promise) {
        try {
            JSONObject root =
                TextUtils.isEmpty(stateJson) ? new JSONObject() : new JSONObject(stateJson);
            boolean saved = ControlerWidgetDataStore.saveRoot(getReactApplicationContext(), root);
            if (!saved) {
                promise.reject("storage_write_failed", "保存移动端数据失败。");
                return;
            }

            ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext(), root);
            scheduleWidgetRefresh(buildDefaultChangedSections(), "storage-write");
            maybeRunAutoBackup(getReactApplicationContext());

            JSONObject payload = new JSONObject();
            payload.put(
                "state",
                ControlerWidgetDataStore.loadRoot(getReactApplicationContext())
            );
            payload.put("status", buildStorageStatus(payload.getJSONObject("state")));
            promise.resolve(payload.toString());
        } catch (Exception error) {
            promise.reject("storage_write_failed", error);
        }
    }

    @ReactMethod
    public void getStorageStatus(Promise promise) {
        try {
            JSONObject root = ControlerWidgetDataStore.loadRoot(getReactApplicationContext());
            promise.resolve(buildStorageStatus(root).toString());
        } catch (Exception error) {
            promise.reject("storage_status_failed", error);
        }
    }

    @ReactMethod
    public void getAutoBackupStatus(Promise promise) {
        try {
            promise.resolve(buildAutoBackupStatus(getReactApplicationContext()).toString());
        } catch (Exception error) {
            promise.reject("auto_backup_status_failed", error);
        }
    }

    @ReactMethod
    public void updateAutoBackupSettings(String settingsJson, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            JSONObject settings =
                TextUtils.isEmpty(settingsJson) ? new JSONObject() : new JSONObject(settingsJson);
            saveAutoBackupSettings(context, settings);
            promise.resolve(buildAutoBackupSettingsUpdatePayload(context).toString());
        } catch (Exception error) {
            promise.reject("auto_backup_settings_failed", error);
        }
    }

    @ReactMethod
    public void runAutoBackupNow(Promise promise) {
        try {
            promise.resolve(runAutoBackup(getReactApplicationContext(), true).toString());
        } catch (Exception error) {
            promise.reject("auto_backup_run_failed", error);
        }
    }

    @ReactMethod
    public void shareLatestBackup(Promise promise) {
        try {
            Context context = getCurrentActivity() != null
                ? getCurrentActivity()
                : getReactApplicationContext();
            promise.resolve(shareLatestAutoBackup(context).toString());
        } catch (ActivityNotFoundException error) {
            promise.reject("auto_backup_share_failed", "当前设备没有可用的分享应用。");
        } catch (Exception error) {
            promise.reject("auto_backup_share_failed", error);
        }
    }

    @ReactMethod
    public void getStorageManifest(Promise promise) {
        try {
            promise.resolve(
                ControlerWidgetDataStore
                    .getStorageManifest(getReactApplicationContext())
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_manifest_failed", error);
        }
    }

    @ReactMethod
    public void getStorageCoreState(Promise promise) {
        try {
            promise.resolve(
                ControlerWidgetDataStore
                    .getStorageCoreState(getReactApplicationContext())
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_core_failed", error);
        }
    }

    @ReactMethod
    public void getStoragePlanBootstrapState(Promise promise) {
        try {
            promise.resolve(
                ControlerWidgetDataStore
                    .getStoragePlanBootstrapState(getReactApplicationContext())
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_plan_bootstrap_failed", error);
        }
    }

    @ReactMethod
    public void loadStorageSectionRange(String section, String scopeJson, Promise promise) {
        try {
            JSONObject scope =
                TextUtils.isEmpty(scopeJson) ? new JSONObject() : new JSONObject(scopeJson);
            promise.resolve(
                ControlerWidgetDataStore
                    .loadStorageSectionRange(getReactApplicationContext(), section, scope)
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_range_load_failed", error);
        }
    }

    @ReactMethod
    public void saveStorageSectionRange(String section, String payloadJson, Promise promise) {
        try {
            JSONObject payload =
                TextUtils.isEmpty(payloadJson) ? new JSONObject() : new JSONObject(payloadJson);
            JSONObject result =
                ControlerWidgetDataStore.saveStorageSectionRange(
                    getReactApplicationContext(),
                    section,
                    payload
                );
            ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
            scheduleWidgetRefresh(new JSONArray().put(section), "section-save");
            maybeRunAutoBackup(getReactApplicationContext());
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_range_save_failed", error);
        }
    }

    @ReactMethod
    public void replaceStorageCoreState(String partialCoreJson, Promise promise) {
        try {
            JSONObject partialCore =
                TextUtils.isEmpty(partialCoreJson)
                    ? new JSONObject()
                    : new JSONObject(partialCoreJson);
            JSONObject result =
                ControlerWidgetDataStore.replaceStorageCoreState(
                    getReactApplicationContext(),
                    partialCore
                );
            ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
            scheduleWidgetRefresh(
                inferChangedSectionsFromCorePatch(partialCore),
                "core-replace"
            );
            maybeRunAutoBackup(getReactApplicationContext());
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_core_replace_failed", error);
        }
    }

    @ReactMethod
    public void replaceStorageRecurringPlans(String itemsJson, Promise promise) {
        try {
            JSONArray items =
                TextUtils.isEmpty(itemsJson) ? new JSONArray() : new JSONArray(itemsJson);
            JSONArray result =
                ControlerWidgetDataStore.replaceStorageRecurringPlans(
                    getReactApplicationContext(),
                    items
                );
            ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
            scheduleWidgetRefresh(new JSONArray().put("plansRecurring"), "plans-recurring");
            maybeRunAutoBackup(getReactApplicationContext());
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_recurring_replace_failed", error);
        }
    }

    @ReactMethod
    public void probeStorageStateVersion(boolean includeFallbackHash, Promise promise) {
        try {
            ControlerWidgetDataStore.StorageVersion version =
                ControlerWidgetDataStore.probeStorageVersion(
                    getReactApplicationContext(),
                    includeFallbackHash
                );
            promise.resolve(buildStorageVersionPayload(version).toString());
        } catch (Exception error) {
            promise.reject("storage_probe_failed", error);
        }
    }

    @ReactMethod
    public void exportStorageBundle(String optionsJson, Promise promise) {
        try {
            Context context = getCurrentActivity() != null
                ? getCurrentActivity()
                : getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            File exportDir = ensureCacheChildDirectory("exports");
            String exportType = "partition".equals(options.optString("type", ""))
                ? "partition"
                : "full";

            File exportFile;
            String mimeType;
            String chooserTitle;
            JSONObject result = new JSONObject();

            if ("partition".equals(exportType)) {
                String section = String.valueOf(options.optString("section", "")).trim();
                String periodId = String.valueOf(options.optString("periodId", "")).trim();
                JSONObject envelope =
                    ControlerWidgetDataStore.readStorageSectionPartitionEnvelope(
                        getReactApplicationContext(),
                        section,
                        periodId
                    );
                exportFile = new File(
                    exportDir,
                    sanitizeExportFileName("order-" + section + "-" + periodId + ".json", ".json")
                );
                writeTextToFile(exportFile, envelope.toString(2));
                mimeType = "application/json";
                chooserTitle = "导出单分区 JSON";
                result.put("type", "partition");
                result.put("section", section);
                result.put("periodId", periodId);
            } else {
                File tempBundleDirectory =
                    new File(
                        ensureCacheChildDirectory("bundle-export-temp"),
                        "bundle-" + System.currentTimeMillis()
                    );
                try {
                    ControlerWidgetDataStore.writeBundleSnapshotToDirectory(
                        getReactApplicationContext(),
                        ControlerWidgetDataStore.loadRoot(getReactApplicationContext()),
                        tempBundleDirectory
                    );
                    exportFile = new File(
                        exportDir,
                        sanitizeExportFileName(
                            "order-bundle-" + buildDateTag() + ".zip",
                            ".zip"
                        )
                    );
                    zipDirectoryContents(tempBundleDirectory, exportFile);
                } finally {
                    deleteRecursively(tempBundleDirectory);
                }
                mimeType = "application/zip";
                chooserTitle = "导出全部分片 ZIP";
                result.put("type", "full");
            }

            shareExportFile(context, exportFile, mimeType, chooserTitle);
            result.put("ok", true);
            result.put("shared", true);
            result.put("path", exportFile.getAbsolutePath());
            result.put("message", "已打开导出分享面板。");
            promise.resolve(result.toString());
        } catch (ActivityNotFoundException error) {
            promise.reject("storage_export_share_failed", "当前设备没有可用的分享应用。");
        } catch (Exception error) {
            promise.reject("storage_export_failed", error);
        }
    }

    @ReactMethod
    public void importStorageSource(String optionsJson, Promise promise) {
        if (pendingImportStorageSourcePromise != null) {
            promise.reject("storage_import_busy", "已有导入请求在进行中。");
            return;
        }

        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            String existingUri = String.valueOf(options.optString("uri", "")).trim();
            if (!TextUtils.isEmpty(existingUri)) {
                Uri targetUri = Uri.parse(existingUri);
                String displayName = resolveDocumentName(targetUri);
                JSONObject result =
                    importStorageSourceFromUri(context, targetUri, displayName, options);
                JSONObject refreshedRoot = ControlerWidgetDataStore.loadRoot(context);
                ControlerNotificationScheduler.rescheduleAll(context, refreshedRoot);
                ControlerWidgetRenderer.scheduleRefreshAll(context);
                maybeRunAutoBackup(context);
                result.put("status", buildStorageStatus(refreshedRoot));
                promise.resolve(result.toString());
                return;
            }

            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.reject("storage_import_unavailable", "当前没有可用的 Activity。");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            configureImportSourceIntent(intent, options);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            pendingImportStorageSourcePromise = promise;
            pendingImportStorageSourceOptions = options;
            activity.startActivityForResult(intent, REQUEST_IMPORT_STORAGE_SOURCE);
        } catch (ActivityNotFoundException error) {
            pendingImportStorageSourcePromise = null;
            pendingImportStorageSourceOptions = null;
            promise.reject("storage_import_unavailable", "当前设备不支持选择导入文件。");
        } catch (Exception error) {
            pendingImportStorageSourcePromise = null;
            pendingImportStorageSourceOptions = null;
            promise.reject("storage_import_failed", error);
        }
    }

    @ReactMethod
    public void pickImportSourceFile(String optionsJson, Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("storage_import_pick_unavailable", "当前没有可用的 Activity。");
            return;
        }
        if (pendingPickImportSourcePromise != null) {
            promise.reject("storage_import_pick_busy", "已有导入文件选择请求在进行中。");
            return;
        }

        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            configureImportSourceIntent(intent, options);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            pendingPickImportSourcePromise = promise;
            pendingPickImportSourceOptions = options;
            activity.startActivityForResult(intent, REQUEST_PICK_IMPORT_SOURCE);
        } catch (ActivityNotFoundException error) {
            pendingPickImportSourcePromise = null;
            pendingPickImportSourceOptions = null;
            promise.reject(
                "storage_import_pick_unavailable",
                "当前设备不支持选择导入文件。"
            );
        } catch (Exception error) {
            pendingPickImportSourcePromise = null;
            pendingPickImportSourceOptions = null;
            promise.reject("storage_import_pick_failed", error);
        }
    }

    @ReactMethod
    public void inspectImportSourceFile(String optionsJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            String uriText = String.valueOf(options.optString("uri", "")).trim();
            if (TextUtils.isEmpty(uriText)) {
                promise.reject("storage_import_inspect_missing_uri", "缺少可检查的导入文件。");
                return;
            }
            Uri targetUri = Uri.parse(uriText);
            String displayName =
                firstNonEmpty(
                    String.valueOf(options.optString("fileName", "")).trim(),
                    resolveDocumentName(targetUri)
                );
            promise.resolve(
                inspectImportSourceFileDescriptor(context, targetUri, displayName).toString()
            );
        } catch (Exception error) {
            promise.reject("storage_import_inspect_failed", error);
        }
    }

    @ReactMethod
    public void previewExternalImport(String optionsJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            String uriText = String.valueOf(options.optString("uri", "")).trim();
            if (TextUtils.isEmpty(uriText)) {
                promise.reject("storage_import_preview_missing_uri", "缺少可预览的导入文件。");
                return;
            }
            JSONObject preview =
                buildExternalImportPreview(
                    context,
                    Uri.parse(uriText),
                    options.optJSONObject("externalConfig")
                ).payload;
            promise.resolve(preview.toString());
        } catch (Exception error) {
            promise.reject("storage_import_preview_failed", error);
        }
    }

    @ReactMethod
    public void selectStorageFile(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("storage_select_unavailable", "当前没有可用的 Activity。");
            return;
        }
        if (pendingSelectStorageFilePromise != null) {
            promise.reject("storage_select_busy", "已有文件选择请求在进行中。");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            pendingSelectStorageFilePromise = promise;
            activity.startActivityForResult(intent, REQUEST_SELECT_STORAGE_FILE);
        } catch (ActivityNotFoundException error) {
            pendingSelectStorageFilePromise = null;
            promise.reject("storage_select_unavailable", "当前设备不支持选择 JSON 文件。");
        } catch (Exception error) {
            pendingSelectStorageFilePromise = null;
            promise.reject("storage_select_failed", error);
        }
    }

    @ReactMethod
    public void selectStorageDirectory(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("storage_select_unavailable", "当前没有可用的 Activity。");
            return;
        }
        if (pendingSelectStorageDirectoryPromise != null) {
            promise.reject("storage_select_busy", "已有目录选择请求在进行中。");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            pendingSelectStorageDirectoryPromise = promise;
            activity.startActivityForResult(intent, REQUEST_SELECT_STORAGE_DIRECTORY);
        } catch (ActivityNotFoundException error) {
            pendingSelectStorageDirectoryPromise = null;
            promise.reject("storage_select_unavailable", "当前设备不支持选择同步目录。");
        } catch (Exception error) {
            pendingSelectStorageDirectoryPromise = null;
            promise.reject("storage_select_failed", error);
        }
    }

    @ReactMethod
    public void resetStorageFile(Promise promise) {
        try {
            ControlerWidgetDataStore.clearCustomStorageUri(getReactApplicationContext());
            JSONObject root = ControlerWidgetDataStore.loadRoot(getReactApplicationContext());
            ControlerWidgetRenderer.scheduleRefreshAll(getReactApplicationContext());
            maybeRunAutoBackup(getReactApplicationContext());
            promise.resolve(buildStorageStatus(root).toString());
        } catch (Exception error) {
            promise.reject("storage_reset_failed", error);
        }
    }

    @ReactMethod
    public void getWidgetPinSupport(String kind, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            promise.resolve(buildWidgetPinSupportPayload(context, kind).toString());
        } catch (Exception error) {
            promise.reject("widget_pin_support_failed", error);
        }
    }

    @ReactMethod
    public void requestPinWidget(String kind, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            WidgetPinSupportState support = resolveWidgetPinSupport(context, kind);
            JSONObject result = buildWidgetPinSupportPayload(support);

            if (!TextUtils.isEmpty(support.kind) && ControlerWidgetPinStore.isPending(context, support.kind)) {
                long requestedAt = ControlerWidgetPinStore.getPendingRequestedAt(context, support.kind);
                result.put("ok", true);
                result.put("supported", support.canRequestPin);
                result.put("manual", false);
                result.put("pending", true);
                result.put("requestAccepted", true);
                result.put("flow", "request-sent");
                result.put("requestedAt", requestedAt);
                result.put("message", "已发起添加请求，请先完成系统确认。");
                promise.resolve(result.toString());
                return;
            }

            if (!support.canRequestPin) {
                result.put("ok", false);
                result.put("supported", false);
                result.put("manual", support.manualOnly);
                result.put("pending", false);
                result.put("requestAccepted", false);
                result.put("flow", support.manualOnly ? "manual" : "error");
                promise.resolve(result.toString());
                return;
            }

            ComponentName provider =
                ControlerWidgetKinds.componentNameForKind(context, support.kind);
            if (provider == null) {
                result.put("ok", false);
                result.put("supported", false);
                result.put("manual", false);
                result.put("pending", false);
                result.put("requestAccepted", false);
                result.put("flow", "error");
                result.put("message", "未找到对应的小组件 Provider。");
                promise.resolve(result.toString());
                return;
            }

            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            PendingIntent successCallback = buildWidgetPinSuccessCallback(context, support.kind);
            Bundle extras = new Bundle();
            extras.putString(ControlerWidgetPinResultReceiver.EXTRA_WIDGET_KIND, support.kind);
            boolean requested = appWidgetManager.requestPinAppWidget(
                provider,
                extras,
                successCallback
            );
            if (requested) {
                long requestedAt = System.currentTimeMillis();
                ControlerWidgetPinStore.markPending(context, support.kind, requestedAt);
                result.put("ok", true);
                result.put("supported", true);
                result.put("manual", false);
                result.put("pending", true);
                result.put("requestAccepted", true);
                result.put("flow", "request-sent");
                result.put("requestedAt", requestedAt);
                result.put("message", "已发起添加请求，请在桌面确认。");
                promise.resolve(result.toString());
                return;
            }

            result.put("ok", false);
            result.put("supported", true);
            result.put("manual", true);
            result.put("pending", false);
            result.put("requestAccepted", false);
            result.put("flow", "manual");
            result.put("message", "系统未接受固定请求，请从桌面小组件列表手动添加。");
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("widget_pin_failed", error);
        }
    }

    @ReactMethod
    public void consumePinWidgetResult(Promise promise) {
        try {
            promise.resolve(
                ControlerWidgetPinStore.consumeResult(getReactApplicationContext()).toString()
            );
        } catch (Exception error) {
            promise.reject("widget_pin_result_failed", error);
        }
    }

    @ReactMethod
    public void openHomeScreen(Promise promise) {
        try {
            Context context = getCurrentActivity() != null
                ? getCurrentActivity()
                : getReactApplicationContext();
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_HOME);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("supported", true);
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("home_screen_open_failed", error);
        }
    }

    @ReactMethod
    public void refreshWidgets(String payloadJson, Promise promise) {
        try {
            JSONObject payload =
                TextUtils.isEmpty(payloadJson) ? new JSONObject() : new JSONObject(payloadJson);
            scheduleWidgetRefresh(payload);
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("supported", true);
            result.put("queued", true);
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("widget_refresh_failed", error);
        }
    }

    @ReactMethod
    public void requestNotificationPermission(boolean interactive, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
                promise.resolve(buildNotificationPermissionResult(true, true, false).toString());
                return;
            }

            Context context = getReactApplicationContext();
            boolean granted =
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                ControlerNotificationScheduler.rescheduleAll(context);
                promise.resolve(buildNotificationPermissionResult(true, true, false).toString());
                return;
            }

            if (!interactive) {
                promise.resolve(buildNotificationPermissionResult(true, false, false).toString());
                return;
            }

            Activity activity = getCurrentActivity();
            if (!(activity instanceof PermissionAwareActivity)) {
                promise.reject("notification_permission_unavailable", "当前没有可用的权限请求 Activity。");
                return;
            }
            if (pendingNotificationPermissionPromise != null) {
                promise.reject("notification_permission_busy", "已有通知权限请求正在进行中。");
                return;
            }

            pendingNotificationPermissionPromise = promise;
            ((PermissionAwareActivity) activity).requestPermissions(
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                REQUEST_NOTIFICATION_PERMISSION,
                notificationPermissionListener
            );
        } catch (Exception error) {
            pendingNotificationPermissionPromise = null;
            promise.reject("notification_permission_failed", error);
        }
    }

    @ReactMethod
    public void syncNotificationSchedule(String scheduleJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject root = ControlerWidgetDataStore.loadRoot(context);
            ControlerNotificationScheduler.rescheduleAll(context, root);

            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("supported", true);
            result.put("mode", "storage-native");
            result.put("scheduledCount", 0);
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("notification_schedule_sync_failed", error);
        }
    }

    @ReactMethod
    public void consumeLaunchAction(Promise promise) {
        try {
            promise.resolve(
                ControlerWidgetLaunchStore
                    .consumeLaunchAction(getReactApplicationContext())
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("launch_action_failed", error);
        }
    }

    private WidgetPinSupportState resolveWidgetPinSupport(Context context, String kind) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return new WidgetPinSupportState(
                "",
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O,
                false,
                false,
                false,
                false,
                "invalid-kind",
                "未知的小组件类型。"
            );
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return new WidgetPinSupportState(
                normalizedKind,
                false,
                false,
                false,
                true,
                true,
                "api-unsupported",
                "当前系统版本不支持应用内直接固定小组件，请从桌面手动添加。"
            );
        }

        ComponentName provider =
            ControlerWidgetKinds.componentNameForKind(context, normalizedKind);
        if (provider == null) {
            return new WidgetPinSupportState(
                normalizedKind,
                true,
                false,
                false,
                false,
                false,
                "provider-missing",
                "未找到对应的小组件 Provider。"
            );
        }

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        boolean launcherSupported = appWidgetManager.isRequestPinAppWidgetSupported();
        if (!launcherSupported) {
            return new WidgetPinSupportState(
                normalizedKind,
                true,
                false,
                false,
                true,
                true,
                "launcher-unsupported",
                "当前桌面不支持应用内固定小组件，请从桌面小组件列表手动添加。"
            );
        }

        return new WidgetPinSupportState(
            normalizedKind,
            true,
            true,
            true,
            false,
            true,
            "ready",
            "当前系统支持应用内请求添加小组件。"
        );
    }

    private JSONObject buildWidgetPinSupportPayload(Context context, String kind) throws Exception {
        return buildWidgetPinSupportPayload(resolveWidgetPinSupport(context, kind));
    }

    private JSONObject buildWidgetPinSupportPayload(WidgetPinSupportState support) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("ok", support.canRequestPin);
        payload.put("kind", support.kind);
        payload.put("supported", support.canRequestPin);
        payload.put("apiSupported", support.apiSupported);
        payload.put("launcherSupported", support.launcherSupported);
        payload.put("canRequestPin", support.canRequestPin);
        payload.put("manualOnly", support.manualOnly);
        payload.put("providerAvailable", support.providerAvailable);
        payload.put("reason", support.reason);
        payload.put("message", support.message);
        return payload;
    }

    private PendingIntent buildWidgetPinSuccessCallback(Context context, String kind) {
        Intent intent = new Intent(context, ControlerWidgetPinResultReceiver.class);
        intent.putExtra(ControlerWidgetPinResultReceiver.EXTRA_WIDGET_KIND, kind);

        int requestCode = 8100 + Math.abs(kind.hashCode() % 1000);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    @ReactMethod
    public void exportData(String stateJson, String fileName, Promise promise) {
        try {
            Context context = getCurrentActivity() != null
                ? getCurrentActivity()
                : getReactApplicationContext();
            JSONObject root =
                TextUtils.isEmpty(stateJson) ? new JSONObject() : new JSONObject(stateJson);
            String safeFileName = TextUtils.isEmpty(fileName)
                ? ("order-backup-" + System.currentTimeMillis() + ".json")
                : fileName.trim();
            if (!safeFileName.endsWith(".json")) {
                safeFileName += ".json";
            }

            File exportDir = ensureCacheChildDirectory("exports");

            File exportFile = new File(exportDir, safeFileName);
            writeTextToFile(exportFile, root.toString(2));
            shareExportFile(context, exportFile, "application/json", "导出数据");

            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("shared", true);
            result.put("path", exportFile.getAbsolutePath());
            result.put("message", "已打开导出分享面板。");
            promise.resolve(result.toString());
        } catch (ActivityNotFoundException error) {
            promise.reject("export_share_failed", "当前设备没有可用的分享应用。");
        } catch (Exception error) {
            promise.reject("export_failed", error);
        }
    }

    private void handleImportStorageSourceSelectionResult(int resultCode, Intent intent) {
        Promise promise = pendingImportStorageSourcePromise;
        JSONObject options = pendingImportStorageSourceOptions;
        pendingImportStorageSourcePromise = null;
        pendingImportStorageSourceOptions = null;
        if (promise == null) {
            return;
        }

        if (resultCode != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            promise.resolve(null);
            return;
        }

        Uri targetUri = intent.getData();
        ReactApplicationContext context = getReactApplicationContext();
        try {
            int permissionFlags = intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (permissionFlags == 0) {
                permissionFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            }
            context.getContentResolver().takePersistableUriPermission(targetUri, permissionFlags);

            String displayName = resolveDocumentName(targetUri);
            JSONObject result =
                importStorageSourceFromUri(context, targetUri, displayName, options);
            JSONObject refreshedRoot = ControlerWidgetDataStore.loadRoot(context);
            ControlerNotificationScheduler.rescheduleAll(context, refreshedRoot);
            ControlerWidgetRenderer.scheduleRefreshAll(context);
            maybeRunAutoBackup(context);
            result.put("status", buildStorageStatus(refreshedRoot));
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_import_failed", error);
        }
    }

    private void handlePickImportSourceSelectionResult(int resultCode, Intent intent) {
        Promise promise = pendingPickImportSourcePromise;
        JSONObject options = pendingPickImportSourceOptions;
        pendingPickImportSourcePromise = null;
        pendingPickImportSourceOptions = null;
        if (promise == null) {
            return;
        }

        if (resultCode != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            promise.resolve(null);
            return;
        }

        Uri targetUri = intent.getData();
        ReactApplicationContext context = getReactApplicationContext();
        try {
            int permissionFlags = intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (permissionFlags == 0) {
                permissionFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            }
            context.getContentResolver().takePersistableUriPermission(targetUri, permissionFlags);

            String displayName = resolveDocumentName(targetUri);
            String normalizedName =
                String.valueOf(displayName == null ? "" : displayName)
                    .trim()
                    .toLowerCase(Locale.US);
            JSONObject payload = new JSONObject();
            payload.put("ok", true);
            payload.put("uri", targetUri.toString());
            payload.put(
                "fileName",
                TextUtils.isEmpty(displayName) ? JSONObject.NULL : displayName
            );
            payload.put(
                "accept",
                options == null ? "" : String.valueOf(options.optString("accept", "")).trim()
            );
            promise.resolve(payload.toString());
        } catch (Exception error) {
            promise.reject("storage_import_pick_failed", error);
        }
    }

    private void handleStorageFileSelectionResult(int resultCode, Intent intent) {
        Promise promise = pendingSelectStorageFilePromise;
        pendingSelectStorageFilePromise = null;
        if (promise == null) {
            return;
        }

        if (resultCode != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            promise.resolve(null);
            return;
        }

        Uri targetUri = intent.getData();
        ReactApplicationContext context = getReactApplicationContext();
        try {
            int permissionFlags =
                intent.getFlags()
                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (permissionFlags == 0) {
                permissionFlags =
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            }
            context.getContentResolver().takePersistableUriPermission(targetUri, permissionFlags);

            JSONObject currentRoot = ControlerWidgetDataStore.loadRoot(context);
            StorageSwitchPlan switchPlan = inspectStorageDocumentTarget(context, targetUri);
            if (SWITCH_ACTION_SEEDED_CURRENT.equals(switchPlan.switchAction)) {
                writeTextToUri(context, targetUri, currentRoot.toString(2));
            }
            String displayName = resolveDocumentName(targetUri);
            ControlerWidgetDataStore.setCustomStorageUri(context, targetUri, displayName);
            JSONObject refreshedRoot = ControlerWidgetDataStore.loadRoot(context);
            ControlerNotificationScheduler.rescheduleAll(context, refreshedRoot);
            ControlerWidgetRenderer.scheduleRefreshAll(context);
            maybeRunAutoBackup(context);
            promise.resolve(
                buildStorageStatus(refreshedRoot, switchPlan.switchAction).toString()
            );
        } catch (Exception error) {
            promise.reject("storage_select_failed", error);
        }
    }

    private JSONObject buildNotificationPermissionResult(
        boolean supported,
        boolean granted,
        boolean asked
    ) throws Exception {
        JSONObject result = new JSONObject();
        result.put("supported", supported);
        result.put("granted", granted);
        result.put("asked", asked);
        return result;
    }

    private void handleStorageDirectorySelectionResult(int resultCode, Intent intent) {
        Promise promise = pendingSelectStorageDirectoryPromise;
        pendingSelectStorageDirectoryPromise = null;
        if (promise == null) {
            return;
        }

        if (resultCode != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            promise.resolve(null);
            return;
        }

        Uri targetUri = intent.getData();
        ReactApplicationContext context = getReactApplicationContext();
        try {
            int permissionFlags =
                intent.getFlags()
                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (permissionFlags == 0) {
                permissionFlags =
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            }
            context.getContentResolver().takePersistableUriPermission(targetUri, permissionFlags);

            JSONObject currentRoot = ControlerWidgetDataStore.loadRoot(context);
            boolean hadExistingData =
                ControlerWidgetDataStore.directoryContainsBundleOrLegacy(context, targetUri);
            if (hadExistingData) {
                ControlerWidgetDataStore.setCustomStorageDirectoryUri(context, targetUri, "");
                ControlerWidgetDataStore.loadRoot(context);
            } else {
                ControlerWidgetDataStore.setCustomStorageDirectoryUri(context, targetUri, "");
                boolean saved =
                    ControlerWidgetDataStore.saveRoot(context, currentRoot);
                if (!saved) {
                    throw new Exception("无法在目标目录中写入 bundle 数据。");
                }
            }
            String displayName = resolveDocumentName(targetUri);
            ControlerWidgetDataStore.setCustomStorageDirectoryUri(context, targetUri, displayName);
            JSONObject refreshedRoot = ControlerWidgetDataStore.loadRoot(context);
            ControlerNotificationScheduler.rescheduleAll(context, refreshedRoot);
            ControlerWidgetRenderer.scheduleRefreshAll(context);
            maybeRunAutoBackup(context);
            promise.resolve(
                buildStorageStatus(
                    refreshedRoot,
                    hadExistingData
                        ? SWITCH_ACTION_ADOPTED_EXISTING
                        : SWITCH_ACTION_SEEDED_CURRENT
                ).toString()
            );
        } catch (Exception error) {
            promise.reject("storage_select_failed", error);
        }
    }

    private JSONObject importStorageSourceFromUri(
        ReactApplicationContext context,
        Uri targetUri,
        String displayName,
        JSONObject options
    ) throws Exception {
        String importMode = normalizeImportMode(options);
        String sourceKind = normalizeImportSourceKind(options);
        String normalizedName =
            String.valueOf(displayName == null ? "" : displayName).trim().toLowerCase(Locale.US);
        if (EXTERNAL_IMPORT_SOURCE_KIND.equals(sourceKind)) {
            return importExternalJsonSourceFromUri(context, targetUri, options);
        }
        if (normalizedName.endsWith(".zip")) {
            File importRoot = ensureCacheChildDirectory("bundle-import-temp");
            File requestRoot = new File(importRoot, "import-" + System.currentTimeMillis());
            File zipFile = new File(requestRoot, "source.zip");
            File unzipRoot = new File(requestRoot, "unzipped");
            try {
                if (!requestRoot.exists() && !requestRoot.mkdirs()) {
                    throw new Exception("无法创建临时导入目录。");
                }
                copyUriToFile(context, targetUri, zipFile);
                unzipFileToDirectory(zipFile, unzipRoot);
                File bundleRoot = resolveExtractedBundleRoot(unzipRoot);
                JSONObject importedRoot =
                    ControlerWidgetDataStore.loadBundleSnapshotFromDirectory(bundleRoot);
                importedRoot = ControlerWidgetDataStore.preserveThemeStateIfMissing(
                    context,
                    importedRoot
                );
                JSONObject targetRoot = "diff".equals(importMode)
                    ? ControlerWidgetDataStore.mergeImportedRootWithCurrent(context, importedRoot)
                    : importedRoot;
                boolean saved = ControlerWidgetDataStore.saveRoot(context, targetRoot);
                if (!saved) {
                    throw new Exception("导入 ZIP bundle 失败。");
                }
                return new JSONObject()
                    .put("ok", true)
                    .put("type", "zip")
                    .put("mode", importMode)
                    .put("changedSections", buildDefaultChangedSections())
                    .put("message", "ZIP bundle 已导入。");
            } finally {
                deleteRecursively(requestRoot);
            }
        }

        String rawText = readTextFromUri(context, targetUri);
        if (TextUtils.isEmpty(rawText) || TextUtils.isEmpty(rawText.trim())) {
            throw new Exception("导入文件为空。");
        }

        JSONObject parsedPayload = new JSONObject(rawText.trim());
        if (isPartitionEnvelopePayload(parsedPayload)) {
            JSONObject payload = new JSONObject();
            payload.put("periodId", parsedPayload.optString("periodId", ""));
            payload.put(
                "items",
                parsedPayload.optJSONArray("items") == null
                    ? new JSONArray()
                    : parsedPayload.optJSONArray("items")
            );
            payload.put("mode", "merge".equals(importMode) ? "merge" : "replace");
            JSONObject saveResult =
                ControlerWidgetDataStore.saveStorageSectionRange(
                    context,
                    parsedPayload.optString("section", ""),
                    payload
                );
            String section = saveResult.optString("section", "");
            String periodId = saveResult.optString("periodId", "");
            JSONObject changedPeriods = new JSONObject();
            changedPeriods.put(section, new JSONArray().put(periodId));
            return new JSONObject()
                .put("ok", true)
                .put("type", "partition")
                .put("section", section)
                .put("periodId", periodId)
                .put("changedSections", new JSONArray().put(section))
                .put("changedPeriods", changedPeriods)
                .put("message", "单分区 JSON 已导入。");
        }

        ControlerWidgetDataStore.importLegacyJsonWithBackup(
            context,
            rawText,
            displayName,
            "diff".equals(importMode)
        );
        return new JSONObject()
            .put("ok", true)
            .put("type", "legacy-state")
            .put("mode", importMode)
            .put("changedSections", buildDefaultChangedSections())
            .put("message", "旧 JSON 数据已导入并拆分为 bundle。");
    }

    private StorageSwitchPlan inspectStorageDocumentTarget(Context context, Uri documentUri)
        throws Exception {
        String rawText = readTextFromUri(context, documentUri);
        if (TextUtils.isEmpty(rawText) || TextUtils.isEmpty(rawText.trim())) {
            return new StorageSwitchPlan(SWITCH_ACTION_SEEDED_CURRENT, documentUri);
        }

        JSONObject parsedRoot = new JSONObject(rawText);
        validateStorageRoot(parsedRoot);
        return new StorageSwitchPlan(SWITCH_ACTION_ADOPTED_EXISTING, documentUri);
    }

    private void validateStorageRoot(JSONObject root) throws Exception {
        if (root == null) {
            throw new Exception("目标 JSON 文件内容无效，无法切换。");
        }
        if (root.optJSONArray("projects") == null || root.optJSONArray("records") == null) {
            throw new Exception("目标 JSON 文件缺少必需的数据字段，无法切换。");
        }
    }

    private String readTextFromUri(Context context, Uri uri) throws Exception {
        if (context == null || uri == null) {
            return "";
        }

        InputStream inputStream = context.getContentResolver().openInputStream(uri);
        if (inputStream == null) {
            return "";
        }

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        );
        try {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
            return builder.toString();
        } finally {
            reader.close();
        }
    }

    private void writeTextToUri(Context context, Uri uri, String content) throws Exception {
        if (context == null || uri == null) {
            throw new Exception("目标 JSON 文件不可用。");
        }

        OutputStream outputStream = context.getContentResolver().openOutputStream(uri, "wt");
        if (outputStream == null) {
            throw new Exception("无法写入目标 JSON 文件。");
        }

        try {
            outputStream.write(String.valueOf(content).getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
        } finally {
            outputStream.close();
        }
    }

    private void writeTextToFile(File file, String content) throws Exception {
        File parent = file == null ? null : file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        FileOutputStream outputStream = new FileOutputStream(file, false);
        try {
            outputStream.write(String.valueOf(content).getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
        } finally {
            outputStream.close();
        }
    }

    private void configureImportSourceIntent(Intent intent, JSONObject options) {
        String importType = String.valueOf(options == null ? "" : options.optString("type", "")).trim();
        String acceptMode = String.valueOf(options == null ? "" : options.optString("accept", "")).trim();
        boolean jsonOnly = "partition".equals(importType) || "json".equals(acceptMode);
        if (jsonOnly) {
            intent.setType("application/json");
            intent.putExtra(
                Intent.EXTRA_MIME_TYPES,
                new String[] { "application/json", "text/plain", "application/octet-stream" }
            );
            return;
        }

        intent.setType("*/*");
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[] {
                "application/json",
                "application/zip",
                "application/x-zip-compressed",
                "application/octet-stream",
                "text/plain"
            }
        );
    }

    private String normalizeImportMode(JSONObject options) {
        String mode = String.valueOf(options == null ? "" : options.optString("mode", "")).trim();
        if ("merge".equals(mode) || "diff".equals(mode)) {
            return mode;
        }
        return "replace";
    }

    private String normalizeImportSourceKind(JSONObject options) {
        String sourceKind =
            String.valueOf(options == null ? "" : options.optString("sourceKind", "")).trim();
        if (!TextUtils.isEmpty(sourceKind)) {
            return sourceKind;
        }
        return String.valueOf(options == null ? "" : options.optString("type", "")).trim();
    }

    private boolean isPartitionEnvelopePayload(JSONObject payload) {
        return payload != null
            && !TextUtils.isEmpty(payload.optString("section", ""))
            && !TextUtils.isEmpty(payload.optString("periodId", ""))
            && payload.optJSONArray("items") != null;
    }

    private String firstNonEmpty(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            String normalized = String.valueOf(value == null ? "" : value).trim();
            if (!TextUtils.isEmpty(normalized)) {
                return normalized;
            }
        }
        return "";
    }

    private JSONObject cloneJsonObject(JSONObject source) throws Exception {
        return source == null ? new JSONObject() : new JSONObject(source.toString());
    }

    private JSONArray buildJsonArrayFromStrings(Iterable<String> values) {
        JSONArray array = new JSONArray();
        if (values == null) {
            return array;
        }
        for (String value : values) {
            array.put(value == null ? "" : value);
        }
        return array;
    }

    private JSONArray buildJsonArrayFromObjects(ArrayList<JSONObject> items) throws Exception {
        JSONArray array = new JSONArray();
        if (items == null) {
            return array;
        }
        for (JSONObject item : items) {
            array.put(cloneJsonObject(item));
        }
        return array;
    }

    private ArrayList<JSONObject> jsonArrayToObjectList(JSONArray array) throws Exception {
        ArrayList<JSONObject> items = new ArrayList<>();
        if (array == null) {
            return items;
        }
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject item = array.optJSONObject(index);
            if (item != null) {
                items.add(cloneJsonObject(item));
            }
        }
        return items;
    }

    private ArrayList<String> sortStringSet(Set<String> values) {
        ArrayList<String> sorted = new ArrayList<>();
        if (values != null) {
            sorted.addAll(values);
        }
        Collections.sort(sorted);
        return sorted;
    }

    private void incrementJsonCounter(JSONObject counters, String key) throws Exception {
        String safeKey = TextUtils.isEmpty(key) ? "invalid-record" : key;
        counters.put(safeKey, Math.max(0, counters.optInt(safeKey, 0)) + 1);
    }

    private Object loadImportPayloadFromUri(ReactApplicationContext context, Uri targetUri)
        throws Exception {
        String cacheKey = targetUri == null ? "" : targetUri.toString();
        if (!TextUtils.isEmpty(cacheKey)
            && cacheKey.equals(cachedImportPayloadUri)
            && cachedImportPayload != null) {
            return cachedImportPayload;
        }
        String rawText = readTextFromUri(context, targetUri);
        if (TextUtils.isEmpty(rawText) || TextUtils.isEmpty(rawText.trim())) {
            throw new Exception("导入文件为空。");
        }
        Object parsed = new JSONTokener(rawText.trim()).nextValue();
        if (!(parsed instanceof JSONObject) && !(parsed instanceof JSONArray)) {
            throw new Exception("导入 JSON 顶层必须是对象或数组。");
        }
        cachedImportPayloadUri = cacheKey;
        cachedImportPayload = parsed;
        return parsed;
    }

    private JSONArray resolveArraySource(Object payload, String arrayPath) {
        String normalizedPath = TextUtils.isEmpty(arrayPath) ? ROOT_ARRAY_PATH : arrayPath.trim();
        if (ROOT_ARRAY_PATH.equals(normalizedPath)) {
            return payload instanceof JSONArray ? (JSONArray) payload : null;
        }
        if (payload instanceof JSONObject) {
            return ((JSONObject) payload).optJSONArray(normalizedPath);
        }
        return null;
    }

    private JSONArray listArrayCandidates(Object payload) throws Exception {
        JSONArray candidates = new JSONArray();
        if (payload instanceof JSONArray) {
            candidates.put(
                new JSONObject()
                    .put("path", ROOT_ARRAY_PATH)
                    .put("label", "根数组")
                    .put("count", ((JSONArray) payload).length())
            );
        }
        if (!(payload instanceof JSONObject)) {
            return candidates;
        }
        JSONObject objectPayload = (JSONObject) payload;
        JSONArray names = objectPayload.names();
        if (names == null) {
            return candidates;
        }
        for (int index = 0; index < names.length(); index += 1) {
            String key = names.optString(index, "").trim();
            if (TextUtils.isEmpty(key)) {
                continue;
            }
            JSONArray arrayValue = objectPayload.optJSONArray(key);
            if (arrayValue == null) {
                continue;
            }
            candidates.put(
                new JSONObject()
                    .put("path", key)
                    .put("label", key)
                    .put("count", arrayValue.length())
            );
        }
        return candidates;
    }

    private ArrayList<String> listObjectFieldKeys(JSONArray items) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        if (items == null) {
            return new ArrayList<>();
        }
        int limit = Math.min(items.length(), 100);
        for (int index = 0; index < limit; index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) {
                continue;
            }
            JSONArray names = item.names();
            if (names == null) {
                continue;
            }
            for (int nameIndex = 0; nameIndex < names.length(); nameIndex += 1) {
                String key = names.optString(nameIndex, "").trim();
                if (!TextUtils.isEmpty(key)) {
                    keys.add(key);
                }
            }
        }
        ArrayList<String> sorted = new ArrayList<>(keys);
        Collections.sort(sorted);
        return sorted;
    }

    private String guessFieldByPatterns(ArrayList<String> fieldKeys, String[] patterns) {
        if (fieldKeys == null || patterns == null) {
            return "";
        }
        for (String pattern : patterns) {
            for (String fieldKey : fieldKeys) {
                if (!TextUtils.isEmpty(fieldKey) && fieldKey.matches(pattern)) {
                    return fieldKey;
                }
            }
        }
        return "";
    }

    private JSONObject guessExternalMapping(ArrayList<String> fieldKeys) throws Exception {
        return new JSONObject()
            .put(
                "projectName",
                guessFieldByPatterns(
                    fieldKeys,
                    new String[] {
                        "(?i)^(projectName|project|项目名称|项目)$",
                        "(?i).*name.*"
                    }
                )
            )
            .put("date", guessFieldByPatterns(fieldKeys, new String[] { "(?i)^(date|day|日期)$" }))
            .put(
                "startTime",
                guessFieldByPatterns(
                    fieldKeys,
                    new String[] { "(?i)^(startTime|start|开始时间|开始)$" }
                )
            )
            .put(
                "endTime",
                guessFieldByPatterns(
                    fieldKeys,
                    new String[] { "(?i)^(endTime|end|结束时间|结束)$" }
                )
            )
            .put(
                "durationMs",
                guessFieldByPatterns(
                    fieldKeys,
                    new String[] { "(?i)^(durationMs|duration_milliseconds|ms|时长毫秒)$" }
                )
            )
            .put(
                "spendtime",
                guessFieldByPatterns(
                    fieldKeys,
                    new String[] { "(?i)^(spendtime|duration|用时|时长)$" }
                )
            );
    }

    private JSONObject buildFieldKeysByPath(Object payload, JSONArray arrayCandidates) throws Exception {
        JSONObject fieldKeysByPath = new JSONObject();
        if (arrayCandidates == null) {
            return fieldKeysByPath;
        }
        for (int index = 0; index < arrayCandidates.length(); index += 1) {
            JSONObject candidate = arrayCandidates.optJSONObject(index);
            if (candidate == null) {
                continue;
            }
            String path = candidate.optString("path", "").trim();
            if (TextUtils.isEmpty(path)) {
                continue;
            }
            fieldKeysByPath.put(path, buildJsonArrayFromStrings(listObjectFieldKeys(resolveArraySource(payload, path))));
        }
        return fieldKeysByPath;
    }

    private JSONObject buildGuessedMappingByPath(Object payload, JSONArray arrayCandidates)
        throws Exception {
        JSONObject guessedByPath = new JSONObject();
        if (arrayCandidates == null) {
            return guessedByPath;
        }
        for (int index = 0; index < arrayCandidates.length(); index += 1) {
            JSONObject candidate = arrayCandidates.optJSONObject(index);
            if (candidate == null) {
                continue;
            }
            String path = candidate.optString("path", "").trim();
            if (TextUtils.isEmpty(path)) {
                continue;
            }
            guessedByPath.put(path, guessExternalMapping(listObjectFieldKeys(resolveArraySource(payload, path))));
        }
        return guessedByPath;
    }

    private JSONObject inspectImportSourceFileDescriptor(
        ReactApplicationContext context,
        Uri targetUri,
        String displayName
    ) throws Exception {
        String safeDisplayName = firstNonEmpty(displayName, resolveDocumentName(targetUri));
        String normalizedName = safeDisplayName.toLowerCase(Locale.US);
        if (normalizedName.endsWith(".zip")) {
            return new JSONObject()
                .put("sourceKind", "full")
                .put("fileType", "zip-bundle")
                .put("fileName", safeDisplayName)
                .put(
                    "description",
                    "已识别为全部分片 ZIP。你可以整包替换当前数据，也可以做差异导入。"
                );
        }

        Object parsedPayload = loadImportPayloadFromUri(context, targetUri);
        if (parsedPayload instanceof JSONObject) {
            JSONObject objectPayload = (JSONObject) parsedPayload;
            if (isPartitionEnvelopePayload(objectPayload)) {
                return new JSONObject()
                    .put("sourceKind", "partition")
                    .put("fileType", "partition-json")
                    .put("fileName", safeDisplayName)
                    .put("section", objectPayload.optString("section", ""))
                    .put("periodId", objectPayload.optString("periodId", ""))
                    .put(
                        "description",
                        "已识别为单分区 JSON，只会影响 "
                            + objectPayload.optString("section", "")
                            + " 的 "
                            + objectPayload.optString("periodId", "")
                            + "。"
                    );
            }
            if (objectPayload.optJSONArray("projects") != null
                && objectPayload.optJSONArray("records") != null) {
                return new JSONObject()
                    .put("sourceKind", "full")
                    .put("fileType", "legacy-full-json")
                    .put("fileName", safeDisplayName)
                    .put(
                        "description",
                        "已识别为旧单文件全量 JSON。导入时会先拆成目录 bundle，再按你选择的模式写入当前数据。"
                    );
            }
        }

        JSONArray arrayCandidates = listArrayCandidates(parsedPayload);
        if (arrayCandidates.length() > 0) {
            return new JSONObject()
                .put("sourceKind", EXTERNAL_IMPORT_SOURCE_KIND)
                .put("fileType", EXTERNAL_IMPORT_SOURCE_KIND)
                .put("fileName", safeDisplayName)
                .put("arrayCandidates", arrayCandidates)
                .put("fieldKeysByPath", buildFieldKeysByPath(parsedPayload, arrayCandidates))
                .put("guessedMappingByPath", buildGuessedMappingByPath(parsedPayload, arrayCandidates))
                .put("nativePreviewAvailable", true)
                .put(
                    "description",
                    "已识别为外部 JSON。可从根数组或首层对象数组里选择记录源，并映射项目名、时间和用时字段。"
                );
        }

        throw new Exception(
            "无法识别该文件类型。当前只支持旧单文件 JSON、全部分片 ZIP、单分区 JSON，或包含根数组/首层对象数组的外部 JSON。"
        );
    }

    private String createExternalRecordId(int index) {
        return "external-record-"
            + Long.toString(System.currentTimeMillis(), 36)
            + "-"
            + (index + 1)
            + "-"
            + Integer.toHexString((int) (Math.random() * Integer.MAX_VALUE));
    }

    private String createProjectId(String prefix) {
        String safePrefix = TextUtils.isEmpty(prefix) ? "project-import" : prefix.trim();
        return safePrefix
            + "-"
            + Long.toString(System.currentTimeMillis(), 36)
            + "-"
            + Integer.toHexString((int) (Math.random() * Integer.MAX_VALUE));
    }

    private String normalizeProjectName(Object value) {
        return String.valueOf(value == null || value == JSONObject.NULL ? "" : value).trim();
    }

    private Object getFieldValue(JSONObject item, String fieldName) {
        if (item == null || TextUtils.isEmpty(fieldName)) {
            return null;
        }
        Object value = item.opt(fieldName);
        return value == JSONObject.NULL ? null : value;
    }

    private boolean isTimeOnlyString(String value) {
        if (TextUtils.isEmpty(value)) {
            return false;
        }
        return value.trim().matches("^\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\.\\d{1,3})?$");
    }

    private int[] parseTimeParts(Object value) {
        if (!(value instanceof String)) {
            return null;
        }
        String normalized = String.valueOf(value).trim();
        if (TextUtils.isEmpty(normalized) || !isTimeOnlyString(normalized)) {
            return null;
        }
        String[] hourMinuteParts = normalized.split(":");
        if (hourMinuteParts.length < 2 || hourMinuteParts.length > 3) {
            return null;
        }
        try {
            int hours = Integer.parseInt(hourMinuteParts[0]);
            int minutes = Integer.parseInt(hourMinuteParts[1]);
            int seconds = 0;
            int milliseconds = 0;
            if (hourMinuteParts.length == 3) {
                String secondPart = hourMinuteParts[2];
                String[] secondParts = secondPart.split("\\.", 2);
                seconds = Integer.parseInt(secondParts[0]);
                if (secondParts.length > 1) {
                    String msText = secondParts[1];
                    milliseconds = Integer.parseInt((msText + "000").substring(0, 3));
                }
            }
            if (hours < 0 || hours > 23
                || minutes < 0 || minutes > 59
                || seconds < 0 || seconds > 59
                || milliseconds < 0 || milliseconds > 999) {
                return null;
            }
            return new int[] { hours, minutes, seconds, milliseconds };
        } catch (Exception error) {
            return null;
        }
    }

    private long parseDateValueToMs(Object value) {
        if (value == null || value == JSONObject.NULL) {
            return -1L;
        }
        if (value instanceof Number) {
            double numericValue = ((Number) value).doubleValue();
            return !Double.isNaN(numericValue) && !Double.isInfinite(numericValue)
                ? Math.round(numericValue)
                : -1L;
        }
        String normalized = String.valueOf(value).trim();
        if (TextUtils.isEmpty(normalized) || isTimeOnlyString(normalized)) {
            return -1L;
        }
        String[] patterns = new String[] {
            "yyyy-MM-dd",
            "yyyy/MM/dd",
            "yyyy.MM.dd",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy/MM/dd HH:mm:ss",
            "yyyy.MM.dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setLenient(false);
                if (pattern.contains("'Z'")) {
                    format.setTimeZone(TimeZone.getTimeZone("UTC"));
                } else {
                    format.setTimeZone(TimeZone.getDefault());
                }
                Date parsedDate = format.parse(normalized);
                if (parsedDate != null) {
                    return parsedDate.getTime();
                }
            } catch (Exception ignored) {
            }
        }
        return -1L;
    }

    private long buildDateTimeMs(Object dateValue, Object timeValue) {
        if (timeValue == null || timeValue == JSONObject.NULL) {
            return -1L;
        }
        String normalizedTime = String.valueOf(timeValue).trim();
        if (TextUtils.isEmpty(normalizedTime)) {
            return -1L;
        }
        int[] timeParts = parseTimeParts(timeValue);
        if (timeParts != null) {
            long baseDateMs = parseDateValueToMs(dateValue);
            if (baseDateMs < 0L) {
                return -1L;
            }
            Calendar calendar = Calendar.getInstance();
            calendar.setTimeInMillis(baseDateMs);
            calendar.set(Calendar.HOUR_OF_DAY, timeParts[0]);
            calendar.set(Calendar.MINUTE, timeParts[1]);
            calendar.set(Calendar.SECOND, timeParts[2]);
            calendar.set(Calendar.MILLISECOND, timeParts[3]);
            return calendar.getTimeInMillis();
        }
        return parseDateValueToMs(timeValue);
    }

    private long parseDurationMsValue(Object value) {
        if (value == null || value == JSONObject.NULL) {
            return -1L;
        }
        if (value instanceof Number) {
            double numericValue = ((Number) value).doubleValue();
            return !Double.isNaN(numericValue)
                && !Double.isInfinite(numericValue)
                && numericValue >= 0
                ? Math.round(numericValue)
                : -1L;
        }
        String normalized = String.valueOf(value).trim();
        if (TextUtils.isEmpty(normalized)) {
            return -1L;
        }
        try {
            double parsed = Double.parseDouble(normalized);
            return !Double.isNaN(parsed) && !Double.isInfinite(parsed) && parsed >= 0
                ? Math.round(parsed)
                : -1L;
        } catch (Exception error) {
            return -1L;
        }
    }

    private long parseDurationTextToMs(Object value) {
        long directDurationMs = parseDurationMsValue(value);
        if (directDurationMs >= 0L) {
            return directDurationMs;
        }
        if (!(value instanceof String)) {
            return -1L;
        }
        String text = String.valueOf(value).trim();
        if (TextUtils.isEmpty(text)) {
            return -1L;
        }
        if (text.matches("^\\d{1,2}:\\d{2}(?::\\d{2})?$")) {
            String[] parts = text.split(":");
            try {
                int hours = Integer.parseInt(parts[0]);
                int minutes = Integer.parseInt(parts[1]);
                int seconds = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
                return Math.max(0, hours) * 60L * 60L * 1000L
                    + Math.max(0, minutes) * 60L * 1000L
                    + Math.max(0, seconds) * 1000L;
            } catch (Exception error) {
                return -1L;
            }
        }

        double totalMs = 0D;
        java.util.regex.Matcher dayMatch =
            java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:天|day|days|d)(?:\\b|$)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(text);
        java.util.regex.Matcher hourMatch =
            java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:小时|hr|hrs|hour|hours|h)(?:\\b|$)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(text);
        java.util.regex.Matcher minuteMatch =
            java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:分钟|min|mins|minute|minutes|m)(?:\\b|$)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(text);
        java.util.regex.Matcher secondMatch =
            java.util.regex.Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:秒|sec|secs|second|seconds|s)(?:\\b|$)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(text);
        if (dayMatch.find()) {
            totalMs += Double.parseDouble(dayMatch.group(1)) * 24D * 60D * 60D * 1000D;
        }
        if (hourMatch.find()) {
            totalMs += Double.parseDouble(hourMatch.group(1)) * 60D * 60D * 1000D;
        }
        if (minuteMatch.find()) {
            totalMs += Double.parseDouble(minuteMatch.group(1)) * 60D * 1000D;
        }
        if (secondMatch.find()) {
            totalMs += Double.parseDouble(secondMatch.group(1)) * 1000D;
        }
        if (totalMs <= 0D
            && (text.contains("小于1分钟")
                || text.contains("小于1min")
                || text.toLowerCase(Locale.US).contains("less than 1 min"))) {
            totalMs = 30D * 1000D;
        }
        return totalMs > 0D ? Math.round(totalMs) : -1L;
    }

    private String formatIsoUtc(long timeMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(timeMs));
    }

    private String formatLocalDateKey(long timeMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(timeMs));
    }

    private String formatLocalPeriodId(long timeMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date(timeMs));
    }

    private String formatDurationFromMs(long durationMs) {
        if (durationMs <= 0L) {
            return "小于1分钟";
        }
        long totalMinutes = Math.max(1L, Math.round(durationMs / (1000D * 60D)));
        long totalHours = totalMinutes / 60L;
        long minutes = totalMinutes % 60L;
        long days = totalHours / 24L;
        long hours = totalHours % 24L;
        if (days > 0L) {
            return days + "天" + hours + "小时" + minutes + "分钟";
        }
        if (totalHours > 0L) {
            return totalHours + "小时" + minutes + "分钟";
        }
        return totalMinutes + "分钟";
    }

    private ExternalRecordResult normalizeExternalRecord(
        JSONObject item,
        JSONObject mapping,
        int index
    ) throws Exception {
        JSONObject safeMapping = mapping == null ? new JSONObject() : mapping;
        String projectName =
            normalizeProjectName(getFieldValue(item, safeMapping.optString("projectName", "")));
        if (TextUtils.isEmpty(projectName)) {
            return new ExternalRecordResult(null, "missing-project-name");
        }

        Object dateValue = getFieldValue(item, safeMapping.optString("date", ""));
        long startTimeMs =
            buildDateTimeMs(dateValue, getFieldValue(item, safeMapping.optString("startTime", "")));
        long endTimeMs =
            buildDateTimeMs(dateValue, getFieldValue(item, safeMapping.optString("endTime", "")));
        long mappedDurationMs =
            parseDurationMsValue(getFieldValue(item, safeMapping.optString("durationMs", "")));
        long mappedSpendtimeMs =
            mappedDurationMs >= 0L
                ? mappedDurationMs
                : parseDurationTextToMs(getFieldValue(item, safeMapping.optString("spendtime", "")));

        if (startTimeMs < 0L && endTimeMs < 0L) {
            return new ExternalRecordResult(null, "missing-time-range");
        }
        if (startTimeMs < 0L && endTimeMs >= 0L && mappedSpendtimeMs >= 0L) {
            startTimeMs = Math.max(0L, endTimeMs - mappedSpendtimeMs);
        }
        if (startTimeMs >= 0L && endTimeMs < 0L && mappedSpendtimeMs >= 0L) {
            endTimeMs = startTimeMs + mappedSpendtimeMs;
        }
        if (startTimeMs < 0L || endTimeMs < 0L) {
            return new ExternalRecordResult(null, "missing-duration");
        }

        long durationMs = Math.max(0L, endTimeMs - startTimeMs);
        JSONObject durationMeta = new JSONObject();
        durationMeta.put("recordedMs", durationMs);
        durationMeta.put("originalMs", durationMs);
        durationMeta.put("returnedMs", JSONObject.NULL);
        durationMeta.put("returnTargetProject", "");
        durationMeta.put("appliedCarryover", JSONObject.NULL);

        JSONObject record = new JSONObject();
        String canonicalEndText = formatIsoUtc(endTimeMs);
        String canonicalStartText = formatIsoUtc(startTimeMs);
        record.put("id", createExternalRecordId(index));
        record.put("timestamp", canonicalEndText);
        record.put("sptTime", canonicalEndText);
        record.put("endTime", canonicalEndText);
        record.put("rawEndTime", canonicalEndText);
        record.put("startTime", canonicalStartText);
        record.put("durationMs", durationMs);
        record.put("spendtime", formatDurationFromMs(durationMs));
        record.put("name", projectName);
        record.put("projectId", JSONObject.NULL);
        record.put("clickCount", JSONObject.NULL);
        record.put("timerRollbackState", JSONObject.NULL);
        record.put("durationMeta", durationMeta);
        return new ExternalRecordResult(record, "");
    }

    private ExternalNormalizeResult normalizeExternalRecords(
        Object payload,
        JSONObject externalConfig
    ) throws Exception {
        ExternalNormalizeResult result = new ExternalNormalizeResult();
        JSONObject safeConfig = externalConfig == null ? new JSONObject() : externalConfig;
        String arrayPath = firstNonEmpty(safeConfig.optString("arrayPath", ""), ROOT_ARRAY_PATH);
        JSONArray items = resolveArraySource(payload, arrayPath);
        JSONObject mapping = safeConfig.optJSONObject("mapping");
        result.totalCount = items == null ? 0 : items.length();
        if (items == null) {
            return result;
        }

        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) {
                incrementJsonCounter(result.invalidReasons, "invalid-record");
                continue;
            }
            ExternalRecordResult normalized = normalizeExternalRecord(item, mapping, index);
            if (normalized.record == null) {
                incrementJsonCounter(result.invalidReasons, normalized.reason);
                continue;
            }
            result.records.add(cloneJsonObject(normalized.record));
            String projectName = normalizeProjectName(normalized.record.opt("name"));
            if (!TextUtils.isEmpty(projectName)) {
                result.projectNames.add(projectName);
            }
            long recordTimeMs = parseDateValueToMs(
                firstNonEmpty(
                    normalized.record.optString("endTime", ""),
                    normalized.record.optString("timestamp", ""),
                    normalized.record.optString("startTime", "")
                )
            );
            if (recordTimeMs >= 0L) {
                result.affectedDates.add(formatLocalDateKey(recordTimeMs));
                result.affectedPeriodIds.add(formatLocalPeriodId(recordTimeMs));
            }
        }
        return result;
    }

    private ProjectReconciliationResult reconcileProjectsByName(
        JSONArray existingProjectsArray,
        Set<String> importedProjectNames
    ) throws Exception {
        ArrayList<JSONObject> nextProjects = jsonArrayToObjectList(existingProjectsArray);
        Map<String, JSONObject> nameIndex = new HashMap<>();
        Set<String> usedIds = new HashSet<>();
        int matchedProjects = 0;
        int createdProjects = 0;

        for (JSONObject project : nextProjects) {
            String projectId = String.valueOf(project.optString("id", "")).trim();
            String projectName = normalizeProjectName(project.opt("name"));
            if (!TextUtils.isEmpty(projectId)) {
                usedIds.add(projectId);
            }
            if (!TextUtils.isEmpty(projectName) && !nameIndex.containsKey(projectName)) {
                nameIndex.put(projectName, project);
            }
        }

        for (String projectName : sortStringSet(importedProjectNames)) {
            if (TextUtils.isEmpty(projectName)) {
                continue;
            }
            if (nameIndex.containsKey(projectName)) {
                matchedProjects += 1;
                continue;
            }
            String nextId;
            do {
                nextId = createProjectId("project-import");
            } while (usedIds.contains(nextId));
            usedIds.add(nextId);
            JSONObject project = new JSONObject();
            project.put("id", nextId);
            project.put("name", projectName);
            project.put("level", 1);
            project.put("parentId", JSONObject.NULL);
            project.put("color", JSONObject.NULL);
            project.put("colorMode", "auto");
            project.put("description", "");
            project.put("createdAt", formatIsoUtc(System.currentTimeMillis()));
            nextProjects.add(project);
            nameIndex.put(projectName, project);
            createdProjects += 1;
        }

        return new ProjectReconciliationResult(
            nextProjects,
            nameIndex,
            matchedProjects,
            createdProjects
        );
    }

    private ArrayList<JSONObject> applyProjectMappingToRecords(
        ArrayList<JSONObject> records,
        ProjectReconciliationResult reconciliation
    ) throws Exception {
        ArrayList<JSONObject> mappedRecords = new ArrayList<>();
        if (records == null) {
            return mappedRecords;
        }
        for (JSONObject record : records) {
            JSONObject nextRecord = cloneJsonObject(record);
            String sourceName = normalizeProjectName(nextRecord.opt("name"));
            JSONObject matchedProject =
                TextUtils.isEmpty(sourceName) ? null : reconciliation.nameIndex.get(sourceName);
            nextRecord.put("name", matchedProject == null
                ? (TextUtils.isEmpty(sourceName) ? "未命名项目" : sourceName)
                : matchedProject.optString("name", sourceName));
            if (matchedProject != null
                && !TextUtils.isEmpty(matchedProject.optString("id", "").trim())) {
                nextRecord.put("projectId", matchedProject.optString("id", "").trim());
            } else {
                nextRecord.put("projectId", JSONObject.NULL);
            }
            mappedRecords.add(nextRecord);
        }
        return mappedRecords;
    }

    private long getRecordSortTime(JSONObject record) {
        if (record == null) {
            return -1L;
        }
        return parseDateValueToMs(
            firstNonEmpty(
                record.optString("endTime", ""),
                record.optString("timestamp", ""),
                record.optString("startTime", "")
            )
        );
    }

    private void sortRecords(ArrayList<JSONObject> records) {
        if (records == null) {
            return;
        }
        Collections.sort(
            records,
            (left, right) -> Long.compare(getRecordSortTime(left), getRecordSortTime(right))
        );
    }

    private String getRecordDateKey(JSONObject record) {
        long sortTime = getRecordSortTime(record);
        return sortTime >= 0L ? formatLocalDateKey(sortTime) : "";
    }

    private String getRecordPeriodId(JSONObject record) {
        long sortTime = getRecordSortTime(record);
        return sortTime >= 0L ? formatLocalPeriodId(sortTime) : "";
    }

    private ArrayList<JSONObject> mergeRecordsByReplacingDays(
        ArrayList<JSONObject> existingRecords,
        ArrayList<JSONObject> incomingRecords
    ) throws Exception {
        LinkedHashSet<String> affectedDates = new LinkedHashSet<>();
        if (incomingRecords != null) {
            for (JSONObject record : incomingRecords) {
                String dateKey = getRecordDateKey(record);
                if (!TextUtils.isEmpty(dateKey)) {
                    affectedDates.add(dateKey);
                }
            }
        }

        ArrayList<JSONObject> merged = new ArrayList<>();
        if (existingRecords != null) {
            for (JSONObject record : existingRecords) {
                String dateKey = getRecordDateKey(record);
                if (TextUtils.isEmpty(dateKey) || !affectedDates.contains(dateKey)) {
                    merged.add(cloneJsonObject(record));
                }
            }
        }
        if (incomingRecords != null) {
            for (JSONObject record : incomingRecords) {
                merged.add(cloneJsonObject(record));
            }
        }
        sortRecords(merged);
        return merged;
    }

    private ExternalImportPreviewResult buildExternalImportPreview(
        ReactApplicationContext context,
        Uri targetUri,
        JSONObject externalConfig
    ) throws Exception {
        ExternalNormalizeResult normalized =
            normalizeExternalRecords(loadImportPayloadFromUri(context, targetUri), externalConfig);
        JSONObject currentCore = ControlerWidgetDataStore.getStorageCoreState(context);
        ProjectReconciliationResult projectReconciliation = reconcileProjectsByName(
            currentCore == null ? null : currentCore.optJSONArray("projects"),
            normalized.projectNames
        );
        ArrayList<JSONObject> mappedRecords =
            applyProjectMappingToRecords(normalized.records, projectReconciliation);

        JSONObject payload = new JSONObject();
        payload.put("sourceKind", EXTERNAL_IMPORT_SOURCE_KIND);
        payload.put(
            "arrayPath",
            firstNonEmpty(
                externalConfig == null ? "" : externalConfig.optString("arrayPath", ""),
                ROOT_ARRAY_PATH
            )
        );
        payload.put("totalCount", normalized.totalCount);
        payload.put("validCount", mappedRecords.size());
        payload.put("invalidCount", Math.max(0, normalized.totalCount - mappedRecords.size()));
        payload.put("invalidReasons", new JSONObject(normalized.invalidReasons.toString()));
        payload.put("affectedDates", buildJsonArrayFromStrings(sortStringSet(normalized.affectedDates)));
        payload.put(
            "affectedPeriodIds",
            buildJsonArrayFromStrings(sortStringSet(normalized.affectedPeriodIds))
        );
        payload.put("matchedProjects", projectReconciliation.matchedProjects);
        payload.put("createdProjects", projectReconciliation.createdProjects);
        payload.put("replacedDays", normalized.affectedDates.size());
        return new ExternalImportPreviewResult(
            payload,
            mappedRecords,
            projectReconciliation.projects
        );
    }

    private JSONObject importExternalJsonSourceFromUri(
        ReactApplicationContext context,
        Uri targetUri,
        JSONObject options
    ) throws Exception {
        JSONObject externalConfig =
            options == null ? null : options.optJSONObject("externalConfig");
        if (externalConfig == null) {
            throw new Exception("缺少外部 JSON 映射配置。");
        }
        ExternalImportPreviewResult preview =
            buildExternalImportPreview(context, targetUri, externalConfig);
        if (preview.records.isEmpty()) {
            throw new Exception("当前映射下没有可导入的有效记录。");
        }

        int createdProjects = preview.payload.optInt("createdProjects", 0);
        if (createdProjects > 0) {
            JSONObject partialCore = new JSONObject();
            partialCore.put("projects", buildJsonArrayFromObjects(preview.projects));
            ControlerWidgetDataStore.replaceStorageCoreState(context, partialCore);
        }

        JSONArray affectedPeriodIds = preview.payload.optJSONArray("affectedPeriodIds");
        if (affectedPeriodIds != null) {
            for (int index = 0; index < affectedPeriodIds.length(); index += 1) {
                String periodId = affectedPeriodIds.optString(index, "").trim();
                if (TextUtils.isEmpty(periodId)) {
                    continue;
                }
                JSONObject scope = new JSONObject();
                scope.put("periodIds", new JSONArray().put(periodId));
                JSONObject range =
                    ControlerWidgetDataStore.loadStorageSectionRange(context, "records", scope);
                ArrayList<JSONObject> existingItems =
                    jsonArrayToObjectList(range == null ? null : range.optJSONArray("items"));
                ArrayList<JSONObject> incomingItems = new ArrayList<>();
                for (JSONObject record : preview.records) {
                    if (periodId.equals(getRecordPeriodId(record))) {
                        incomingItems.add(cloneJsonObject(record));
                    }
                }
                JSONObject savePayload = new JSONObject();
                savePayload.put("periodId", periodId);
                savePayload.put("items", buildJsonArrayFromObjects(mergeRecordsByReplacingDays(existingItems, incomingItems)));
                savePayload.put("mode", "replace");
                ControlerWidgetDataStore.saveStorageSectionRange(context, "records", savePayload);
            }
        }

        JSONArray changedSections = createdProjects > 0
            ? new JSONArray().put("core").put("records")
            : new JSONArray().put("records");
        JSONObject changedPeriods = new JSONObject();
        changedPeriods.put(
            "records",
            affectedPeriodIds == null ? new JSONArray() : new JSONArray(affectedPeriodIds.toString())
        );
        return new JSONObject()
            .put("ok", true)
            .put("type", EXTERNAL_IMPORT_SOURCE_KIND)
            .put("sourceKind", EXTERNAL_IMPORT_SOURCE_KIND)
            .put(
                "conflictUnit",
                firstNonEmpty(
                    options == null ? "" : options.optString("conflictUnit", ""),
                    "day"
                )
            )
            .put(
                "projectMapping",
                firstNonEmpty(
                    options == null ? "" : options.optString("projectMapping", ""),
                    "name-first"
                )
            )
            .put("changedSections", changedSections)
            .put("changedPeriods", changedPeriods)
            .put(
                "affectedPeriodIds",
                affectedPeriodIds == null ? new JSONArray() : new JSONArray(affectedPeriodIds.toString())
            )
            .put(
                "affectedDates",
                preview.payload.optJSONArray("affectedDates") == null
                    ? new JSONArray()
                    : new JSONArray(preview.payload.optJSONArray("affectedDates").toString())
            )
            .put("createdProjects", createdProjects)
            .put("matchedProjects", preview.payload.optInt("matchedProjects", 0))
            .put("replacedDays", preview.payload.optInt("replacedDays", 0))
            .put("importedCount", preview.records.size())
            .put("invalidCount", preview.payload.optInt("invalidCount", 0))
            .put("message", "外部 JSON 已导入。");
    }

    private JSONArray buildDefaultChangedSections() {
        return new JSONArray()
            .put("core")
            .put("records")
            .put("plans")
            .put("todos")
            .put("checkinItems")
            .put("dailyCheckins")
            .put("checkins")
            .put("diaryEntries")
            .put("diaryCategories")
            .put("plansRecurring");
    }

    private File ensureCacheChildDirectory(String childName) throws Exception {
        File directory = new File(getReactApplicationContext().getCacheDir(), childName);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new Exception("无法创建缓存目录。");
        }
        return directory;
    }

    private String sanitizeExportFileName(String fileName, String defaultExtension) {
        String safeFileName = String.valueOf(fileName == null ? "" : fileName).trim();
        if (TextUtils.isEmpty(safeFileName)) {
            safeFileName = "order-export";
        }
        safeFileName = safeFileName.replaceAll("[\\\\/:*?\"<>|]+", "-");
        String safeExtension = String.valueOf(defaultExtension == null ? "" : defaultExtension);
        if (!TextUtils.isEmpty(safeExtension)
            && !safeFileName.toLowerCase(Locale.US).endsWith(safeExtension.toLowerCase(Locale.US))) {
            safeFileName += safeExtension;
        }
        return safeFileName;
    }

    private String buildDateTag() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private void shareExportFile(
        Context context,
        File exportFile,
        String mimeType,
        String chooserTitle
    ) {
        Uri fileUri = FileProvider.getUriForFile(
            getReactApplicationContext(),
            getReactApplicationContext().getPackageName() + ".fileprovider",
            exportFile
        );

        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType(TextUtils.isEmpty(mimeType) ? "*/*" : mimeType);
        shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
        shareIntent.putExtra(Intent.EXTRA_SUBJECT, "Order 数据备份");
        shareIntent.putExtra(Intent.EXTRA_TEXT, "Order 数据备份文件");
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Intent chooserIntent = Intent.createChooser(shareIntent, chooserTitle);
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(chooserIntent);
    }

    private void copyUriToFile(Context context, Uri sourceUri, File targetFile) throws Exception {
        if (context == null || sourceUri == null || targetFile == null) {
            throw new Exception("导入文件不可用。");
        }
        File parent = targetFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        InputStream inputStream = context.getContentResolver().openInputStream(sourceUri);
        if (inputStream == null) {
            throw new Exception("无法读取导入文件。");
        }
        FileOutputStream outputStream = new FileOutputStream(targetFile, false);
        try {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = inputStream.read(buffer)) >= 0) {
                if (length == 0) {
                    continue;
                }
                outputStream.write(buffer, 0, length);
            }
            outputStream.flush();
        } finally {
            inputStream.close();
            outputStream.close();
        }
    }

    private void zipDirectoryContents(File sourceDirectory, File zipFile) throws Exception {
        File parent = zipFile == null ? null : zipFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        ZipOutputStream zipOutputStream =
            new ZipOutputStream(new FileOutputStream(zipFile, false));
        try {
            addDirectoryToZip(sourceDirectory, sourceDirectory, zipOutputStream);
        } finally {
            zipOutputStream.close();
        }
    }

    private void addDirectoryToZip(
        File rootDirectory,
        File currentFile,
        ZipOutputStream zipOutputStream
    ) throws Exception {
        if (currentFile == null || !currentFile.exists()) {
            return;
        }
        if (currentFile.isDirectory()) {
            File[] children = currentFile.listFiles();
            if (children == null) {
                return;
            }
            for (File child : children) {
                addDirectoryToZip(rootDirectory, child, zipOutputStream);
            }
            return;
        }

        String entryName =
            rootDirectory.toPath().relativize(currentFile.toPath()).toString().replace("\\", "/");
        ZipEntry entry = new ZipEntry(entryName);
        zipOutputStream.putNextEntry(entry);
        FileInputStream inputStream = new FileInputStream(currentFile);
        try {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = inputStream.read(buffer)) >= 0) {
                if (length == 0) {
                    continue;
                }
                zipOutputStream.write(buffer, 0, length);
            }
        } finally {
            inputStream.close();
            zipOutputStream.closeEntry();
        }
    }

    private void unzipFileToDirectory(File zipFile, File targetDirectory) throws Exception {
        if (!targetDirectory.exists() && !targetDirectory.mkdirs()) {
            throw new Exception("无法创建 ZIP 解压目录。");
        }
        String rootPath = targetDirectory.getCanonicalPath() + File.separator;
        ZipInputStream zipInputStream =
            new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)));
        try {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zipInputStream.getNextEntry()) != null) {
                File targetFile = new File(targetDirectory, entry.getName());
                String canonicalTargetPath = targetFile.getCanonicalPath();
                if (!canonicalTargetPath.equals(targetDirectory.getCanonicalPath())
                    && !canonicalTargetPath.startsWith(rootPath)) {
                    throw new Exception("ZIP 中包含非法路径。");
                }
                if (entry.isDirectory()) {
                    if (!targetFile.exists()) {
                        targetFile.mkdirs();
                    }
                    zipInputStream.closeEntry();
                    continue;
                }
                File parent = targetFile.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                FileOutputStream outputStream = new FileOutputStream(targetFile, false);
                try {
                    int length;
                    while ((length = zipInputStream.read(buffer)) >= 0) {
                        if (length == 0) {
                            continue;
                        }
                        outputStream.write(buffer, 0, length);
                    }
                    outputStream.flush();
                } finally {
                    outputStream.close();
                    zipInputStream.closeEntry();
                }
            }
        } finally {
            zipInputStream.close();
        }
    }

    private File resolveExtractedBundleRoot(File extractedRoot) {
        if (extractedRoot == null) {
            return null;
        }
        File directManifest =
            new File(extractedRoot, ControlerWidgetDataStore.BUNDLE_MANIFEST_FILE_NAME);
        if (directManifest.exists()) {
            return extractedRoot;
        }

        File[] children = extractedRoot.listFiles();
        if (children == null) {
            return extractedRoot;
        }
        for (File child : children) {
            if (!child.isDirectory()) {
                continue;
            }
            File childManifest =
                new File(child, ControlerWidgetDataStore.BUNDLE_MANIFEST_FILE_NAME);
            if (childManifest.exists()) {
                return child;
            }
        }
        return extractedRoot;
    }

    private void deleteRecursively(File target) {
        if (target == null || !target.exists()) {
            return;
        }
        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        target.delete();
    }

    private String resolveDocumentName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getReactApplicationContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int columnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (columnIndex >= 0) {
                    return cursor.getString(columnIndex);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return "controler-data.json";
    }

    private SharedPreferences getAutoBackupPreferences(Context context) {
        return context.getSharedPreferences(AUTO_BACKUP_PREFS, Context.MODE_PRIVATE);
    }

    private String normalizeAutoBackupIntervalUnit(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim();
        if ("hour".equals(normalized) || "week".equals(normalized)) {
            return normalized;
        }
        return DEFAULT_AUTO_BACKUP_INTERVAL_UNIT;
    }

    private JSONObject readAutoBackupSettings(Context context) throws Exception {
        SharedPreferences preferences = getAutoBackupPreferences(context);
        return new JSONObject()
            .put("enabled", preferences.getBoolean(KEY_AUTO_BACKUP_ENABLED, false))
            .put(
                "intervalValue",
                Math.max(
                    1,
                    preferences.getInt(
                        KEY_AUTO_BACKUP_INTERVAL_VALUE,
                        DEFAULT_AUTO_BACKUP_INTERVAL_VALUE
                    )
                )
            )
            .put(
                "intervalUnit",
                normalizeAutoBackupIntervalUnit(
                    preferences.getString(
                        KEY_AUTO_BACKUP_INTERVAL_UNIT,
                        DEFAULT_AUTO_BACKUP_INTERVAL_UNIT
                    )
                )
            )
            .put(
                "maxBackups",
                Math.max(
                    1,
                    preferences.getInt(KEY_AUTO_BACKUP_MAX_BACKUPS, DEFAULT_AUTO_BACKUP_MAX_BACKUPS)
                )
            );
    }

    private JSONObject buildAutoBackupSettingsUpdatePayload(Context context) throws Exception {
        JSONObject payload = readAutoBackupSettings(context);
        String targetKey = getCurrentAutoBackupTargetKey(context);
        String lastAttemptAt = getStoredAutoBackupLastAttemptAt(context, targetKey);
        String lastError = getStoredAutoBackupLastError(context, targetKey);
        String lastFingerprint = getStoredAutoBackupFingerprint(context, targetKey);
        payload.put(
            "lastAttemptAt",
            TextUtils.isEmpty(lastAttemptAt) ? JSONObject.NULL : lastAttemptAt
        );
        payload.put("lastError", TextUtils.isEmpty(lastError) ? JSONObject.NULL : lastError);
        payload.put(
            "lastBackedUpFingerprint",
            TextUtils.isEmpty(lastFingerprint) ? "" : lastFingerprint
        );
        return payload;
    }

    private void saveAutoBackupSettings(Context context, JSONObject settings) throws Exception {
        JSONObject normalized =
            settings == null ? new JSONObject() : new JSONObject(settings.toString());
        boolean enabled = normalized.optBoolean("enabled", false);
        int intervalValue = Math.max(1, normalized.optInt("intervalValue", 1));
        String intervalUnit =
            normalizeAutoBackupIntervalUnit(
                normalized.optString("intervalUnit", DEFAULT_AUTO_BACKUP_INTERVAL_UNIT)
            );
        int maxBackups = Math.max(1, normalized.optInt("maxBackups", DEFAULT_AUTO_BACKUP_MAX_BACKUPS));
        getAutoBackupPreferences(context)
            .edit()
            .putBoolean(KEY_AUTO_BACKUP_ENABLED, enabled)
            .putInt(KEY_AUTO_BACKUP_INTERVAL_VALUE, intervalValue)
            .putString(KEY_AUTO_BACKUP_INTERVAL_UNIT, intervalUnit)
            .putInt(KEY_AUTO_BACKUP_MAX_BACKUPS, maxBackups)
            .apply();
    }

    private String getCurrentAutoBackupTargetKey(Context context) {
        Uri directoryUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (directoryUri != null) {
            return "content-uri:" + directoryUri.toString() + "/backups";
        }
        return "file-path:" + getLocalAutoBackupDirectory(context).getAbsolutePath();
    }

    private File getLocalAutoBackupDirectory(Context context) {
        File defaultStorageFile = ControlerWidgetDataStore.getDefaultStorageFile(context);
        File root = defaultStorageFile == null ? null : defaultStorageFile.getParentFile();
        if (root == null) {
            root = new File(context.getFilesDir(), "Order/app_data");
        }
        return new File(root, "backups");
    }

    private Uri resolveAutoBackupDirectoryUri(Context context, boolean createIfMissing) {
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (treeUri == null) {
            return null;
        }
        return resolveDirectoryRelativeDocumentUri(
            context,
            treeUri,
            "backups",
            createIfMissing,
            true,
            Document.MIME_TYPE_DIR
        );
    }

    private String getAutoBackupDirectoryDisplay(Context context) {
        Uri backupDirectoryUri = resolveAutoBackupDirectoryUri(context, false);
        if (backupDirectoryUri != null) {
            return backupDirectoryUri.toString();
        }
        Uri directoryUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (directoryUri != null) {
            return directoryUri.toString() + "/backups";
        }
        return getLocalAutoBackupDirectory(context).getAbsolutePath();
    }

    private String getAutoBackupDirectoryKind(Context context) {
        return ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null
            ? "content-uri"
            : "file-path";
    }

    private String getStoredAutoBackupTargetKey(Context context) {
        return String.valueOf(
            getAutoBackupPreferences(context).getString(KEY_AUTO_BACKUP_TARGET_KEY, "")
        ).trim();
    }

    private String getStoredAutoBackupLastAttemptAt(Context context, String targetKey) {
        String storedTargetKey = getStoredAutoBackupTargetKey(context);
        if (!targetKey.equals(storedTargetKey)) {
            return "";
        }
        return String.valueOf(
            getAutoBackupPreferences(context).getString(KEY_AUTO_BACKUP_LAST_ATTEMPT_AT, "")
        ).trim();
    }

    private String getStoredAutoBackupLastError(Context context, String targetKey) {
        String storedTargetKey = getStoredAutoBackupTargetKey(context);
        if (!targetKey.equals(storedTargetKey)) {
            return "";
        }
        return String.valueOf(
            getAutoBackupPreferences(context).getString(KEY_AUTO_BACKUP_LAST_ERROR, "")
        ).trim();
    }

    private String getStoredAutoBackupFingerprint(Context context, String targetKey) {
        String storedTargetKey = getStoredAutoBackupTargetKey(context);
        if (!targetKey.equals(storedTargetKey)) {
            return "";
        }
        return String.valueOf(
            getAutoBackupPreferences(context)
                .getString(KEY_AUTO_BACKUP_LAST_BACKED_UP_FINGERPRINT, "")
        ).trim();
    }

    private void saveAutoBackupState(
        Context context,
        String targetKey,
        String attemptedAt,
        String errorText,
        String fingerprint
    ) {
        SharedPreferences.Editor editor = getAutoBackupPreferences(context).edit();
        editor.putString(KEY_AUTO_BACKUP_TARGET_KEY, String.valueOf(targetKey));
        editor.putString(KEY_AUTO_BACKUP_LAST_ATTEMPT_AT, String.valueOf(attemptedAt));
        if (TextUtils.isEmpty(errorText)) {
            editor.remove(KEY_AUTO_BACKUP_LAST_ERROR);
        } else {
            editor.putString(KEY_AUTO_BACKUP_LAST_ERROR, errorText);
        }
        if (!TextUtils.isEmpty(fingerprint)) {
            editor.putString(KEY_AUTO_BACKUP_LAST_BACKED_UP_FINGERPRINT, fingerprint);
        }
        editor.apply();
    }

    private long getAutoBackupIntervalMs(JSONObject settings) {
        int intervalValue = Math.max(1, settings == null ? 1 : settings.optInt("intervalValue", 1));
        String intervalUnit =
            normalizeAutoBackupIntervalUnit(
                settings == null ? DEFAULT_AUTO_BACKUP_INTERVAL_UNIT : settings.optString("intervalUnit", DEFAULT_AUTO_BACKUP_INTERVAL_UNIT)
            );
        long unitMs;
        if ("hour".equals(intervalUnit)) {
            unitMs = 60L * 60L * 1000L;
        } else if ("week".equals(intervalUnit)) {
            unitMs = 7L * 24L * 60L * 60L * 1000L;
        } else {
            unitMs = 24L * 60L * 60L * 1000L;
        }
        return intervalValue * unitMs;
    }

    private String isoNow() {
        SimpleDateFormat formatter =
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
        formatter.setTimeZone(TimeZone.getDefault());
        return formatter.format(new Date());
    }

    private String buildAutoBackupTimestampTag() {
        return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
    }

    private ArrayList<BackupEntry> listLocalAutoBackupEntries(Context context) {
        ArrayList<BackupEntry> entries = new ArrayList<>();
        File backupDirectory = getLocalAutoBackupDirectory(context);
        File[] files = backupDirectory.listFiles();
        if (files == null) {
            return entries;
        }
        for (File file : files) {
            if (file == null || !file.isFile()) {
                continue;
            }
            String name = file.getName();
            if (TextUtils.isEmpty(name) || !name.toLowerCase(Locale.US).endsWith(".zip")) {
                continue;
            }
            entries.add(
                new BackupEntry(
                    name,
                    file.getAbsolutePath(),
                    null,
                    Math.max(0L, file.length()),
                    Math.max(0L, file.lastModified())
                )
            );
        }
        Collections.sort(
            entries,
            (left, right) ->
                right.modifiedAt == left.modifiedAt
                    ? String.valueOf(right.fileName).compareTo(String.valueOf(left.fileName))
                    : Long.compare(right.modifiedAt, left.modifiedAt)
        );
        return entries;
    }

    private ArrayList<BackupEntry> listDirectoryAutoBackupEntries(Context context) {
        ArrayList<BackupEntry> entries = new ArrayList<>();
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        Uri backupDirectoryUri = resolveAutoBackupDirectoryUri(context, false);
        if (treeUri == null || backupDirectoryUri == null) {
            return entries;
        }
        Cursor cursor = null;
        try {
            String parentDocumentId = DocumentsContract.getDocumentId(backupDirectoryUri);
            Uri childrenUri =
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
            cursor = context.getContentResolver().query(
                childrenUri,
                new String[] {
                    Document.COLUMN_DOCUMENT_ID,
                    Document.COLUMN_DISPLAY_NAME,
                    Document.COLUMN_SIZE,
                    Document.COLUMN_LAST_MODIFIED,
                    Document.COLUMN_MIME_TYPE,
                },
                null,
                null,
                null
            );
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String documentId = cursor.getString(0);
                    String displayName = cursor.getString(1);
                    long size = cursor.isNull(2) ? 0L : cursor.getLong(2);
                    long modifiedAt = cursor.isNull(3) ? 0L : cursor.getLong(3);
                    String mimeType = cursor.getString(4);
                    if (Document.MIME_TYPE_DIR.equals(mimeType)) {
                        continue;
                    }
                    if (TextUtils.isEmpty(displayName)
                        || !displayName.toLowerCase(Locale.US).endsWith(".zip")) {
                        continue;
                    }
                    Uri documentUri =
                        DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                    entries.add(
                        new BackupEntry(
                            displayName,
                            documentUri.toString(),
                            documentUri,
                            Math.max(0L, size),
                            Math.max(0L, modifiedAt)
                        )
                    );
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        Collections.sort(
            entries,
            (left, right) ->
                right.modifiedAt == left.modifiedAt
                    ? String.valueOf(right.fileName).compareTo(String.valueOf(left.fileName))
                    : Long.compare(right.modifiedAt, left.modifiedAt)
        );
        return entries;
    }

    private ArrayList<BackupEntry> listAutoBackupEntries(Context context) {
        if (ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null) {
            return listDirectoryAutoBackupEntries(context);
        }
        return listLocalAutoBackupEntries(context);
    }

    private void deleteBackupEntry(BackupEntry entry) {
        if (entry == null) {
            return;
        }
        try {
            if (entry.uri != null) {
                DocumentsContract.deleteDocument(
                    getReactApplicationContext().getContentResolver(),
                    entry.uri
                );
                return;
            }
            if (!TextUtils.isEmpty(entry.path)) {
                new File(entry.path).delete();
            }
        } catch (Exception ignored) {
        }
    }

    private void pruneAutoBackups(Context context, int maxBackups) {
        ArrayList<BackupEntry> entries = listAutoBackupEntries(context);
        int keepCount = Math.max(1, maxBackups);
        for (int index = keepCount; index < entries.size(); index += 1) {
            deleteBackupEntry(entries.get(index));
        }
    }

    private boolean shouldRunAutoBackup(
        Context context,
        JSONObject settings,
        boolean force,
        String fingerprint,
        String targetKey
    ) {
        if (force) {
            return true;
        }
        if (settings == null || !settings.optBoolean("enabled", false)) {
            return false;
        }
        String previousFingerprint = getStoredAutoBackupFingerprint(context, targetKey);
        if (!TextUtils.isEmpty(previousFingerprint) && previousFingerprint.equals(fingerprint)) {
            return false;
        }
        String lastAttemptAt = getStoredAutoBackupLastAttemptAt(context, targetKey);
        if (TextUtils.isEmpty(lastAttemptAt)) {
            return true;
        }
        try {
            long anchorTime =
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
                    .parse(lastAttemptAt)
                    .getTime();
            return System.currentTimeMillis() - anchorTime >= getAutoBackupIntervalMs(settings);
        } catch (Exception error) {
            return true;
        }
    }

    private JSONObject buildAutoBackupStatus(Context context) throws Exception {
        JSONObject settings = readAutoBackupSettings(context);
        String targetKey = getCurrentAutoBackupTargetKey(context);
        ArrayList<BackupEntry> entries = listAutoBackupEntries(context);
        BackupEntry latest = entries.isEmpty() ? null : entries.get(0);
        String lastAttemptAt = getStoredAutoBackupLastAttemptAt(context, targetKey);
        String lastError = getStoredAutoBackupLastError(context, targetKey);
        String lastFingerprint = getStoredAutoBackupFingerprint(context, targetKey);
        JSONObject status = new JSONObject();
        status.put("enabled", settings.optBoolean("enabled", false));
        status.put("intervalValue", settings.optInt("intervalValue", 1));
        status.put("intervalUnit", settings.optString("intervalUnit", DEFAULT_AUTO_BACKUP_INTERVAL_UNIT));
        status.put("maxBackups", settings.optInt("maxBackups", DEFAULT_AUTO_BACKUP_MAX_BACKUPS));
        status.put("backupDirectory", getAutoBackupDirectoryDisplay(context));
        status.put("backupDirectoryKind", getAutoBackupDirectoryKind(context));
        status.put("backupCount", entries.size());
        status.put(
            "latestBackupFile",
            latest == null || TextUtils.isEmpty(latest.fileName)
                ? JSONObject.NULL
                : latest.fileName
        );
        status.put(
            "latestBackupPath",
            latest == null || TextUtils.isEmpty(latest.path) ? JSONObject.NULL : latest.path
        );
        status.put(
            "latestBackupAt",
            latest == null || latest.modifiedAt <= 0L
                ? JSONObject.NULL
                : new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
                    .format(new Date(latest.modifiedAt))
        );
        status.put("latestBackupSize", latest == null ? 0L : latest.size);
        status.put(
            "lastAttemptAt",
            TextUtils.isEmpty(lastAttemptAt) ? JSONObject.NULL : lastAttemptAt
        );
        status.put("lastError", TextUtils.isEmpty(lastError) ? JSONObject.NULL : lastError);
        status.put(
            "lastBackedUpFingerprint",
            TextUtils.isEmpty(lastFingerprint) ? "" : lastFingerprint
        );
        return status;
    }

    private JSONObject runAutoBackup(Context context, boolean force) throws Exception {
        JSONObject settings = readAutoBackupSettings(context);
        String targetKey = getCurrentAutoBackupTargetKey(context);
        ControlerWidgetDataStore.StorageVersion version =
            ControlerWidgetDataStore.probeStorageVersion(context, true);
        String fingerprint = version == null ? "" : String.valueOf(version.fingerprint).trim();
        if (!shouldRunAutoBackup(context, settings, force, fingerprint, targetKey)) {
            return buildAutoBackupStatus(context);
        }

        String attemptedAt = isoNow();
        File tempRoot = new File(
            ensureCacheChildDirectory("auto-backup-temp"),
            "backup-" + System.currentTimeMillis()
        );
        try {
            if (!tempRoot.exists() && !tempRoot.mkdirs()) {
                throw new Exception("无法创建自动备份临时目录。");
            }
            File bundleDirectory = new File(tempRoot, "bundle");
            File zipFile = new File(tempRoot, "backup.zip");
            ControlerWidgetDataStore.writeBundleSnapshotToDirectory(
                context,
                ControlerWidgetDataStore.loadRoot(context),
                bundleDirectory
            );
            zipDirectoryContents(bundleDirectory, zipFile);

            String backupFileName = "order-auto-backup-" + buildAutoBackupTimestampTag() + ".zip";
            if (ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null) {
                Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
                Uri backupUri = resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    "backups/" + backupFileName,
                    true,
                    false,
                    "application/zip"
                );
                if (backupUri == null) {
                    throw new Exception("无法在同步目录中创建备份 ZIP。");
                }
                copyFileToUri(context, zipFile, backupUri);
            } else {
                File backupDirectory = getLocalAutoBackupDirectory(context);
                if (!backupDirectory.exists() && !backupDirectory.mkdirs()) {
                    throw new Exception("无法创建本地备份目录。");
                }
                copyFileToFile(zipFile, new File(backupDirectory, backupFileName));
            }

            saveAutoBackupState(context, targetKey, attemptedAt, "", fingerprint);
            pruneAutoBackups(context, settings.optInt("maxBackups", DEFAULT_AUTO_BACKUP_MAX_BACKUPS));
            return buildAutoBackupStatus(context);
        } catch (Exception error) {
            saveAutoBackupState(
                context,
                targetKey,
                attemptedAt,
                error == null ? "自动备份失败。" : String.valueOf(error.getMessage()),
                getStoredAutoBackupFingerprint(context, targetKey)
            );
            return buildAutoBackupStatus(context);
        } finally {
            deleteRecursively(tempRoot);
        }
    }

    private void maybeRunAutoBackup(Context context) {
        try {
            runAutoBackup(context, false);
        } catch (Exception error) {
            error.printStackTrace();
        }
    }

    private JSONObject shareLatestAutoBackup(Context context) throws Exception {
        ArrayList<BackupEntry> entries = listAutoBackupEntries(getReactApplicationContext());
        BackupEntry latest = entries.isEmpty() ? null : entries.get(0);
        if (latest == null) {
            return new JSONObject()
                .put("ok", false)
                .put("shared", false)
                .put("message", "当前还没有可分享的备份文件。");
        }

        File exportFile;
        if (latest.uri != null) {
            File exportDir = ensureCacheChildDirectory("exports");
            exportFile = new File(
                exportDir,
                sanitizeExportFileName(latest.fileName, ".zip")
            );
            copyUriToFile(getReactApplicationContext(), latest.uri, exportFile);
        } else {
            exportFile = new File(latest.path);
        }

        shareExportFile(context, exportFile, "application/zip", "分享最新备份");
        return new JSONObject()
            .put("ok", true)
            .put("shared", true)
            .put("path", TextUtils.isEmpty(latest.path) ? JSONObject.NULL : latest.path)
            .put("message", "已打开最新备份分享面板。");
    }

    private void copyFileToFile(File sourceFile, File targetFile) throws Exception {
        if (sourceFile == null || targetFile == null) {
            throw new Exception("备份文件不可用。");
        }
        File parent = targetFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        FileInputStream inputStream = new FileInputStream(sourceFile);
        FileOutputStream outputStream = new FileOutputStream(targetFile, false);
        try {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = inputStream.read(buffer)) >= 0) {
                if (length == 0) {
                    continue;
                }
                outputStream.write(buffer, 0, length);
            }
            outputStream.flush();
        } finally {
            inputStream.close();
            outputStream.close();
        }
    }

    private void copyFileToUri(Context context, File sourceFile, Uri targetUri) throws Exception {
        if (context == null || sourceFile == null || targetUri == null) {
            throw new Exception("目标备份文件不可用。");
        }
        FileInputStream inputStream = new FileInputStream(sourceFile);
        OutputStream outputStream = context.getContentResolver().openOutputStream(targetUri, "w");
        if (outputStream == null) {
            inputStream.close();
            throw new Exception("无法写入目标备份文件。");
        }
        try {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = inputStream.read(buffer)) >= 0) {
                if (length == 0) {
                    continue;
                }
                outputStream.write(buffer, 0, length);
            }
            outputStream.flush();
        } finally {
            inputStream.close();
            outputStream.close();
        }
    }

    private Uri resolveDirectoryRelativeDocumentUri(
        Context context,
        Uri treeUri,
        String relativePath,
        boolean createIfMissing,
        boolean directory,
        String fileMimeType
    ) {
        if (context == null || treeUri == null || TextUtils.isEmpty(relativePath)) {
            return null;
        }
        try {
            String[] segments = relativePath.split("/");
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri currentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocumentId);
            for (int index = 0; index < segments.length; index += 1) {
                String segment = segments[index];
                if (TextUtils.isEmpty(segment)) {
                    continue;
                }
                boolean isLast = index == segments.length - 1;
                boolean shouldBeDirectory = isLast ? directory : true;
                Uri childUri = findChildDocumentUri(context, treeUri, currentUri, segment);
                if (childUri == null && createIfMissing) {
                    childUri = DocumentsContract.createDocument(
                        context.getContentResolver(),
                        currentUri,
                        shouldBeDirectory
                            ? Document.MIME_TYPE_DIR
                            : (TextUtils.isEmpty(fileMimeType) ? "application/octet-stream" : fileMimeType),
                        segment
                    );
                }
                if (childUri == null) {
                    return null;
                }
                currentUri = childUri;
            }
            return currentUri;
        } catch (Exception error) {
            return null;
        }
    }

    private Uri findChildDocumentUri(
        Context context,
        Uri treeUri,
        Uri parentDocumentUri,
        String childName
    ) {
        if (context == null || treeUri == null || parentDocumentUri == null) {
            return null;
        }
        Cursor cursor = null;
        try {
            String parentDocumentId = DocumentsContract.getDocumentId(parentDocumentUri);
            Uri childrenUri =
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
            cursor = context.getContentResolver().query(
                childrenUri,
                new String[] { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            );
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String documentId = cursor.getString(0);
                    String displayName = cursor.getString(1);
                    if (childName.equals(displayName)) {
                        return DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    private JSONObject buildStorageStatus(JSONObject root, String switchAction) throws Exception {
        JSONObject status = buildStorageStatus(root);
        if (!TextUtils.isEmpty(switchAction)) {
            status.put("switchAction", switchAction);
        }
        return status;
    }

    private JSONObject buildStorageStatus(JSONObject root) throws Exception {
        ControlerWidgetDataStore.StorageLocation storageLocation =
            ControlerWidgetDataStore.getStorageLocation(getReactApplicationContext());
        ControlerWidgetDataStore.StorageVersion storageVersion =
            ControlerWidgetDataStore.probeStorageVersion(
                getReactApplicationContext(),
                storageLocation.modifiedAt <= 0L
            );
        File defaultStorageFile =
            ControlerWidgetDataStore.getDefaultStorageFile(getReactApplicationContext());
        File defaultStorageDirectory = defaultStorageFile.getParentFile();
        File defaultManifestFile =
            defaultStorageDirectory == null
                ? defaultStorageFile
                : new File(
                    defaultStorageDirectory,
                    ControlerWidgetDataStore.BUNDLE_MANIFEST_FILE_NAME
                );
        String serialized = root.toString();
        long size = storageLocation.size > 0L
            ? storageLocation.size
            : serialized.getBytes(StandardCharsets.UTF_8).length;
        String exposedStorageMode =
            ControlerWidgetDataStore.BUNDLE_MANIFEST_FILE_NAME.equals(storageLocation.syncFileName)
                ? ControlerWidgetDataStore.BUNDLE_MODE
                : storageLocation.storageMode;

        JSONObject status = new JSONObject();
        JSONArray projects = root.optJSONArray("projects");
        JSONArray records = root.optJSONArray("records");
        status.put("projects", projects == null ? 0 : projects.length());
        status.put("records", records == null ? 0 : records.length());
        status.put("size", size);
        status.put("storagePath", storageLocation.storagePath);
        status.put(
            "storageDirectory",
            TextUtils.isEmpty(storageLocation.storageDirectory)
                ? JSONObject.NULL
                : storageLocation.storageDirectory
        );
        status.put("defaultStoragePath", defaultManifestFile.getAbsolutePath());
        status.put(
            "defaultStorageDirectory",
            defaultStorageDirectory == null
                ? JSONObject.NULL
                : defaultStorageDirectory.getAbsolutePath()
        );
        status.put("userDataPath", getReactApplicationContext().getFilesDir().getAbsolutePath());
        status.put("documentsPath", getReactApplicationContext().getFilesDir().getAbsolutePath());
        status.put("isCustomPath", storageLocation.isCustomPath);
        status.put("storageMode", exposedStorageMode);
        status.put("syncFileName", storageLocation.syncFileName);
        status.put("actualUri", storageLocation.actualUri);
        status.put("modifiedAt", storageVersion.modifiedAt);
        status.put("supportsModifiedAt", storageVersion.supportsModifiedAt);
        status.put("fallbackHashUsed", storageVersion.fallbackHashUsed);
        status.put("fingerprint", storageVersion.fingerprint);
        status.put("bundleMode", ControlerWidgetDataStore.BUNDLE_MODE);
        status.put(
            "syncMeta",
            root.optJSONObject("syncMeta") == null
                ? JSONObject.NULL
                : root.optJSONObject("syncMeta")
        );
        status.put("isNativeApp", true);
        status.put("platform", "android");
        return status;
    }

    private JSONObject buildStorageVersionPayload(
        ControlerWidgetDataStore.StorageVersion version
    ) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("storagePath", version == null ? "" : version.storagePath);
        payload.put("actualUri", version == null ? "" : version.actualUri);
        payload.put("storageMode", version == null ? "" : version.storageMode);
        payload.put("size", version == null ? 0L : version.size);
        payload.put("modifiedAt", version == null ? 0L : version.modifiedAt);
        payload.put("fingerprint", version == null ? "" : version.fingerprint);
        payload.put(
            "supportsModifiedAt",
            version != null && version.supportsModifiedAt
        );
        payload.put(
            "fallbackHashUsed",
            version != null && version.fallbackHashUsed
        );
        return payload;
    }
}
