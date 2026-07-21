package com.controlerapp;

import android.Manifest;
import android.app.AlarmManager;
import android.content.ClipData;
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
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.Log;
import android.util.AtomicFile;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.database.Cursor;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.widget.Toast;

import com.controlerapp.widgets.ControlerWidgetDataStore;
import com.controlerapp.widgets.ControlerWidgetKinds;
import com.controlerapp.widgets.ControlerWidgetLastPageStore;
import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.controlerapp.widgets.ControlerWidgetRenderer;
import com.controlerapp.widgets.ControlerWidgetPinResultReceiver;
import com.controlerapp.widgets.ControlerWidgetPinStore;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.LifecycleEventListener;
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
import java.io.ByteArrayOutputStream;
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
import java.util.UUID;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class ControlerBridgeModule extends ReactContextBaseJavaModule {
    private static final String TAG = "ControlerBridge";
    private static final String STORAGE_TRACE_PREFIX = "[storage.trace.bridge]";
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static final int REQUEST_SELECT_STORAGE_FILE = 41021;
    private static final int REQUEST_SELECT_STORAGE_DIRECTORY = 41022;
    private static final int REQUEST_NOTIFICATION_PERMISSION = 41023;
    private static final int REQUEST_IMPORT_STORAGE_SOURCE = 41024;
    private static final int REQUEST_PICK_IMPORT_SOURCE = 41025;
    private static final int REQUEST_PICK_DIARY_IMAGES = 41026;
    private static final int IME_VISIBLE_INSET_THRESHOLD_DP = 24;
    private static final String SWITCH_ACTION_ADOPTED_EXISTING = "adopted-existing";
    private static final String SWITCH_ACTION_SEEDED_CURRENT = "seeded-current";
    private static final String ROOT_ARRAY_PATH = "$";
    private static final String EXTERNAL_IMPORT_SOURCE_KIND = "external-json";
    private static final String AUTO_BACKUP_PREFS = "controler_auto_backup_prefs";
    private static final String UI_LANGUAGE_PREFS = "controler_ui_preferences";
    private static final String LAUNCH_THEME_PREFS = "controler_launch_theme_preferences";
    private static final String KEY_AUTO_BACKUP_ENABLED = "enabled";
    private static final String KEY_UI_LANGUAGE = "language";
    private static final String KEY_LAUNCH_THEME_STATE = "theme_state";
    private static final String KEY_AUTO_BACKUP_INTERVAL_VALUE = "interval_value";
    private static final String KEY_AUTO_BACKUP_INTERVAL_UNIT = "interval_unit";
    private static final String KEY_AUTO_BACKUP_MAX_BACKUPS = "max_backups";
    private static final String KEY_AUTO_BACKUP_LAST_ATTEMPT_AT = "last_attempt_at";
    private static final String KEY_AUTO_BACKUP_LAST_ERROR = "last_error";
    private static final String KEY_AUTO_BACKUP_LAST_BACKED_UP_FINGERPRINT =
        "last_backed_up_fingerprint";
    private static final String KEY_AUTO_BACKUP_TARGET_KEY = "target_key";
    private static final String BUNDLE_MANIFEST_FILE_NAME = "bundle-manifest.json";
    private static final String BUNDLE_CORE_FILE_NAME = "core.json";
    private static final String BUNDLE_RECURRING_PLANS_FILE_NAME = "plans-recurring.json";
    private static final String DEFAULT_AUTO_BACKUP_INTERVAL_UNIT = "day";
    private static final String DEFAULT_UI_LANGUAGE = "zh-CN";
    private static final int DEFAULT_AUTO_BACKUP_INTERVAL_VALUE = 1;
    private static final int DEFAULT_AUTO_BACKUP_MAX_BACKUPS = 7;
    private static final String AUTO_BACKUP_DIRECTORY_NAME = "backups";
    private static final String AUTO_BACKUP_INDEX_FILE_NAME = "backup-index.json";
    private static final int AUTO_BACKUP_INDEX_VERSION = 1;
    private static final String DIRECTORY_DOCUMENT_URI_CACHE_FILE_NAME =
        "directory-document-uri-cache.json";
    private static final long STORAGE_SIDE_EFFECT_DELAY_MS = 560L;
    private static final long STORAGE_AUTO_BACKUP_MIN_INTERVAL_MS = 30_000L;
    private static final long STORAGE_AUTO_BACKUP_IDLE_DELAY_MS = 15_000L;

    private static void logStorageBridgeTrace(
        String operation,
        String stage,
        long startedAt,
        String extra
    ) {
        long durationMs =
            startedAt > 0L ? Math.max(0L, SystemClock.elapsedRealtime() - startedAt) : 0L;
        Log.i(
            TAG,
            STORAGE_TRACE_PREFIX
                + " op="
                + String.valueOf(operation == null ? "" : operation)
                + " stage="
                + String.valueOf(stage == null ? "" : stage)
                + " durationMs="
                + durationMs
                + " thread="
                + Thread.currentThread().getName()
                + " "
                + String.valueOf(extra == null ? "" : extra)
        );
    }

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

    private static final class PreparedDiaryImageAsset {
        final byte[] bytes;
        final String mimeType;
        final int width;
        final int height;

        PreparedDiaryImageAsset(byte[] bytes, String mimeType, int width, int height) {
            this.bytes = bytes == null ? new byte[0] : bytes;
            this.mimeType = mimeType == null ? "" : mimeType;
            this.width = Math.max(0, width);
            this.height = Math.max(0, height);
        }
    }

    private Promise pendingSelectStorageFilePromise = null;
    private Promise pendingSelectStorageDirectoryPromise = null;
    private Promise pendingNotificationPermissionPromise = null;
    private boolean pendingExactAlarmPermissionCheck = false;
    private Promise pendingImportStorageSourcePromise = null;
    private JSONObject pendingImportStorageSourceOptions = null;
    private Promise pendingPickImportSourcePromise = null;
    private JSONObject pendingPickImportSourceOptions = null;
    private Promise pendingPickDiaryImagesPromise = null;
    private JSONObject pendingPickDiaryImagesOptions = null;
    private String cachedImportPayloadUri = "";
    private Object cachedImportPayload = null;
    private final ExecutorService storageSideEffectExecutor =
        Executors.newSingleThreadExecutor();
    private final Object storageSideEffectLock = new Object();
    private final Object storageStatusRefreshLock = new Object();
    private final LinkedHashSet<String> pendingNotificationRescheduleSections =
        new LinkedHashSet<>();
    private final LinkedHashSet<String> pendingStorageSideEffectSections =
        new LinkedHashSet<>();
    private boolean pendingImmediateNotificationReschedule = false;
    private boolean pendingStorageWidgetRefresh = false;
    private boolean pendingStorageAutoBackupCheck = false;
    private boolean pendingPreciseStorageStatusRefresh = false;
    private long lastDeferredAutoBackupQueuedAt = 0L;
    private long lastPendingStorageAutoBackupRequestedAt = 0L;
    private final Runnable storageSideEffectDrainRunnable = new Runnable() {
        @Override
        public void run() {
            final JSONArray changedSections;
            final boolean runWidgets;
            final boolean runAutoBackup;
            long rescheduleAutoBackupAfterMs = 0L;
            final long now = System.currentTimeMillis();

            synchronized (storageSideEffectLock) {
                changedSections = toJsonArray(pendingStorageSideEffectSections);
                pendingStorageSideEffectSections.clear();
                runWidgets = pendingStorageWidgetRefresh;
                pendingStorageWidgetRefresh = false;

                if (pendingStorageAutoBackupCheck) {
                    long idleRemaining =
                        STORAGE_AUTO_BACKUP_IDLE_DELAY_MS
                            - Math.max(
                                0L,
                                now - lastPendingStorageAutoBackupRequestedAt
                            );
                    long remaining =
                        STORAGE_AUTO_BACKUP_MIN_INTERVAL_MS
                            - Math.max(0L, now - lastDeferredAutoBackupQueuedAt);
                    if (idleRemaining > 0L || remaining > 0L) {
                        runAutoBackup = false;
                        rescheduleAutoBackupAfterMs = Math.max(
                            rescheduleAutoBackupAfterMs,
                            Math.max(idleRemaining, remaining)
                        );
                    } else {
                        runAutoBackup = true;
                        pendingStorageAutoBackupCheck = false;
                        lastDeferredAutoBackupQueuedAt = now;
                    }
                } else {
                    runAutoBackup = false;
                }
            }

            if (rescheduleAutoBackupAfterMs > 0L) {
                MAIN_HANDLER.postDelayed(
                    storageSideEffectDrainRunnable,
                    rescheduleAutoBackupAfterMs
                );
            }

            if (!runWidgets && !runAutoBackup) {
                return;
            }

            storageSideEffectExecutor.execute(() -> {
                Context context = getReactApplicationContext();
                if (runWidgets) {
                    try {
                        scheduleWidgetRefresh(
                            changedSections,
                            "deferred-storage-side-effects"
                        );
                    } catch (Exception error) {
                        error.printStackTrace();
                    }
                }
                if (runAutoBackup) {
                    try {
                        maybeRunAutoBackup(context);
                    } catch (Exception error) {
                        error.printStackTrace();
                    }
                }
            });
        }
    };
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
                        maybeRequestExactAlarmAccessIfNeeded(true);
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
                } else if (requestCode == REQUEST_PICK_DIARY_IMAGES) {
                    handlePickDiaryImagesSelectionResult(resultCode, intent);
                }
            }
        };
    private final LifecycleEventListener lifecycleEventListener =
        new LifecycleEventListener() {
            @Override
            public void onHostResume() {
                maybeHandleExactAlarmPermissionResult();
                ControlerWidgetRenderer.scheduleDateSensitiveRefreshIfNeeded(
                    getReactApplicationContext(),
                    "host-resume"
                );
            }

            @Override
            public void onHostPause() {}

            @Override
            public void onHostDestroy() {}
        };

    public ControlerBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(activityEventListener);
        reactContext.addLifecycleEventListener(lifecycleEventListener);
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

    private SharedPreferences getLaunchThemePreferences() {
        return getReactApplicationContext().getSharedPreferences(
            LAUNCH_THEME_PREFS,
            Context.MODE_PRIVATE
        );
    }

    private String readStoredUiLanguage() {
        SharedPreferences preferences = getUiLanguagePreferences();
        return normalizeUiLanguage(
            preferences.getString(KEY_UI_LANGUAGE, DEFAULT_UI_LANGUAGE)
        );
    }

    private void persistLaunchThemeState(String themeStateJson) {
        if (TextUtils.isEmpty(themeStateJson)) {
            return;
        }
        getLaunchThemePreferences()
            .edit()
            .putString(KEY_LAUNCH_THEME_STATE, themeStateJson.trim())
            .apply();
    }

    private String buildLaunchThemeStateFromCoreStorage() {
        try {
            JSONObject coreState =
                ControlerWidgetDataStore.getStorageCoreState(getReactApplicationContext());
            if (coreState == null) {
                return "";
            }
            JSONObject normalized = new JSONObject();
            String selectedTheme =
                String.valueOf(coreState.optString("selectedTheme", "default")).trim();
            normalized.put(
                "selectedTheme",
                TextUtils.isEmpty(selectedTheme) ? "default" : selectedTheme
            );
            normalized.put(
                "customThemes",
                coreState.optJSONArray("customThemes") == null
                    ? new JSONArray()
                    : new JSONArray(coreState.optJSONArray("customThemes").toString())
            );
            normalized.put(
                "builtInThemeOverrides",
                coreState.optJSONObject("builtInThemeOverrides") == null
                    ? new JSONObject()
                    : new JSONObject(coreState.optJSONObject("builtInThemeOverrides").toString())
            );
            return normalized.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private String resolveLaunchThemeStateJson() {
        String coreThemeState = buildLaunchThemeStateFromCoreStorage();
        if (!TextUtils.isEmpty(coreThemeState)) {
            persistLaunchThemeState(coreThemeState);
            return coreThemeState;
        }
        return String.valueOf(
            getLaunchThemePreferences().getString(KEY_LAUNCH_THEME_STATE, "")
        ).trim();
    }

    private String describeLaunchThemeStateForTrace(String themeStateJson) {
        if (TextUtils.isEmpty(themeStateJson)) {
            return "selectedTheme=empty customThemeCount=0 builtInOverrideCount=0";
        }
        try {
            JSONObject parsed = new JSONObject(themeStateJson);
            String selectedTheme =
                String.valueOf(parsed.optString("selectedTheme", "default")).trim();
            JSONArray customThemes = parsed.optJSONArray("customThemes");
            JSONObject builtInThemeOverrides = parsed.optJSONObject("builtInThemeOverrides");
            return "selectedTheme="
                + (TextUtils.isEmpty(selectedTheme) ? "default" : selectedTheme)
                + " customThemeCount="
                + (customThemes == null ? 0 : customThemes.length())
                + " builtInOverrideCount="
                + (builtInThemeOverrides == null ? 0 : builtInThemeOverrides.length());
        } catch (Exception error) {
            return "selectedTheme=parse-error customThemeCount=0 builtInOverrideCount=0";
        }
    }

    private String normalizeLaunchThemeState(String themeStateJson) {
        try {
            JSONObject parsed =
                TextUtils.isEmpty(themeStateJson)
                    ? new JSONObject()
                    : new JSONObject(themeStateJson);
            JSONObject normalized = new JSONObject();
            String selectedTheme =
                String.valueOf(parsed.optString("selectedTheme", "default")).trim();
            normalized.put(
                "selectedTheme",
                TextUtils.isEmpty(selectedTheme) ? "default" : selectedTheme
            );
            normalized.put(
                "customThemes",
                parsed.optJSONArray("customThemes") == null
                    ? new JSONArray()
                    : new JSONArray(parsed.optJSONArray("customThemes").toString())
            );
            normalized.put(
                "builtInThemeOverrides",
                parsed.optJSONObject("builtInThemeOverrides") == null
                    ? new JSONObject()
                    : new JSONObject(parsed.optJSONObject("builtInThemeOverrides").toString())
            );
            return normalized.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private void scheduleWidgetRefresh(JSONObject payload) {
        JSONObject safePayload = payload == null ? new JSONObject() : payload;
        try {
            if (TextUtils.isEmpty(safePayload.optString("widgetKindHint", ""))) {
                String widgetKindHint = resolveWidgetKindHint(
                    safePayload.optJSONArray("changedSections")
                );
                if (!TextUtils.isEmpty(widgetKindHint)) {
                    safePayload.put("widgetKindHint", widgetKindHint);
                }
            }
        } catch (Exception ignored) {
            // Keep the refresh request usable even if hint inference fails.
        }
        ControlerWidgetRenderer.scheduleRefresh(getReactApplicationContext(), safePayload);
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

    private void appendChangedSections(
        LinkedHashSet<String> target,
        JSONArray changedSections
    ) {
        if (target == null || changedSections == null) {
            return;
        }
        for (int index = 0; index < changedSections.length(); index++) {
            String section = changedSections.optString(index, "").trim();
            if (!TextUtils.isEmpty(section)) {
                target.add(section);
            }
        }
    }

    private void appendPendingStorageSideEffectSections(JSONArray changedSections) {
        appendChangedSections(pendingStorageSideEffectSections, changedSections);
    }

    private void enqueueImmediateNotificationReschedule(JSONArray changedSections) {
        boolean shouldDispatch = false;
        synchronized (storageSideEffectLock) {
            appendChangedSections(pendingNotificationRescheduleSections, changedSections);
            if (!pendingImmediateNotificationReschedule) {
                pendingImmediateNotificationReschedule = true;
                shouldDispatch = true;
            }
        }
        if (!shouldDispatch) {
            return;
        }
        storageSideEffectExecutor.execute(() -> {
            Context context = getReactApplicationContext();
            while (true) {
                JSONArray sectionsToRefresh;
                synchronized (storageSideEffectLock) {
                    sectionsToRefresh = toJsonArray(pendingNotificationRescheduleSections);
                    pendingNotificationRescheduleSections.clear();
                }
                try {
                    ControlerNotificationScheduler.rescheduleSections(
                        context,
                        sectionsToRefresh
                    );
                } catch (Exception error) {
                    error.printStackTrace();
                }
                synchronized (storageSideEffectLock) {
                    if (pendingNotificationRescheduleSections.isEmpty()) {
                        pendingImmediateNotificationReschedule = false;
                        return;
                    }
                }
            }
        });
    }

    private void enqueueStorageSideEffects(
        JSONArray changedSections,
        boolean refreshNotifications,
        boolean refreshWidgets,
        boolean checkAutoBackup
    ) {
        if (refreshNotifications) {
            enqueueImmediateNotificationReschedule(changedSections);
        }
        synchronized (storageSideEffectLock) {
            appendPendingStorageSideEffectSections(changedSections);
            pendingStorageWidgetRefresh =
                pendingStorageWidgetRefresh || refreshWidgets;
            pendingStorageAutoBackupCheck =
                pendingStorageAutoBackupCheck || checkAutoBackup;
            if (checkAutoBackup) {
                lastPendingStorageAutoBackupRequestedAt = System.currentTimeMillis();
            }
        }
        MAIN_HANDLER.removeCallbacks(storageSideEffectDrainRunnable);
        MAIN_HANDLER.postDelayed(
            storageSideEffectDrainRunnable,
            STORAGE_SIDE_EFFECT_DELAY_MS
        );
    }

    private boolean shouldRefreshNotificationsForSections(JSONArray changedSections) {
        if (changedSections == null || changedSections.length() == 0) {
            return false;
        }

        for (int index = 0; index < changedSections.length(); index += 1) {
            String section = changedSections.optString(index, "").trim();
            if (TextUtils.isEmpty(section)) {
                continue;
            }
            if (
                "plans".equals(section)
                    || "plansRecurring".equals(section)
                    || "todos".equals(section)
                    || "checkinItems".equals(section)
                    || "dailyCheckins".equals(section)
                    || "checkins".equals(section)
            ) {
                return true;
            }
        }
        return false;
    }

    private String resolveWidgetKindHint(JSONArray changedSections) {
        if (changedSections == null || changedSections.length() == 0) {
            return "";
        }

        boolean sawYearView = false;
        boolean sawWeekView = false;
        boolean sawStartTimer = false;

        for (int index = 0; index < changedSections.length(); index++) {
            String section = changedSections.optString(index, "").trim();
            if (TextUtils.isEmpty(section)) {
                continue;
            }
            if ("todos".equals(section)) {
                return ControlerWidgetKinds.TODOS;
            }
            if ("todoSortPreference".equals(section)) {
                return ControlerWidgetKinds.TODOS;
            }
            if (
                "checkinItems".equals(section)
                    || "dailyCheckins".equals(section)
                    || "checkins".equals(section)
            ) {
                return ControlerWidgetKinds.CHECKINS;
            }
            if (
                "timerSessionState".equals(section)
                    || "records".equals(section)
                    || "projects".equals(section)
            ) {
                sawStartTimer = true;
                continue;
            }
            if ("yearlyGoals".equals(section)) {
                sawYearView = true;
                continue;
            }
            if ("plans".equals(section) || "plansRecurring".equals(section)) {
                sawWeekView = true;
            }
        }

        if (sawStartTimer) {
            return ControlerWidgetKinds.START_TIMER;
        }
        if (sawWeekView) {
            return ControlerWidgetKinds.WEEK_VIEW;
        }
        if (sawYearView) {
            return ControlerWidgetKinds.YEAR_VIEW;
        }
        return "";
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
        if (partialCore.has("todoSortPreference")) {
            sections.add("todoSortPreference");
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
    public void getLaunchThemeState(Promise promise) {
        try {
            String resolvedThemeState = resolveLaunchThemeStateJson();
            ControlerStartupTrace.mark(
                "launch_theme_bridge_get",
                describeLaunchThemeStateForTrace(resolvedThemeState)
            );
            promise.resolve(resolvedThemeState);
        } catch (Exception error) {
            promise.resolve("");
        }
    }

    @ReactMethod
    public void setLaunchThemeState(String themeStateJson, Promise promise) {
        try {
            String normalizedThemeState = normalizeLaunchThemeState(themeStateJson);
            ControlerStartupTrace.mark(
                "launch_theme_bridge_set",
                describeLaunchThemeStateForTrace(normalizedThemeState)
            );
            getLaunchThemePreferences()
                .edit()
                .putString(KEY_LAUNCH_THEME_STATE, normalizedThemeState)
                .apply();
            promise.resolve(normalizedThemeState);
        } catch (Exception error) {
            promise.resolve("");
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
        String requestedPage = normalizeLaunchPage(launchAction.optString("page", ""));
        String action = String.valueOf(launchAction.optString("action", "")).trim();
        String widgetKind = String.valueOf(launchAction.optString("widgetKind", "")).trim();
        String targetId = String.valueOf(launchAction.optString("targetId", "")).trim();
        String launchId = String.valueOf(launchAction.optString("launchId", "")).trim();
        long createdAt = launchAction.optLong("createdAt", 0L);
        String source = String.valueOf(launchAction.optString("source", "android-widget")).trim();
        boolean suppressLaunchAction =
            "start-timer".equals(action)
                && ControlerWidgetKinds.START_TIMER.equals(widgetKind);
        String launchActionParam = suppressLaunchAction ? "" : action;
        String page = normalizeLaunchTargetPage(requestedPage, launchActionParam);
        if (suppressLaunchAction) {
            ControlerWidgetLaunchStore.rememberLaunchAction(
                context,
                TextUtils.isEmpty(requestedPage) ? page : requestedPage,
                action,
                widgetKind,
                targetId,
                launchId,
                createdAt
            );
        }

        Uri.Builder builder = Uri.parse(
            "file:///android_asset/controler-web/" + page + ".html"
        ).buildUpon();
        if (!TextUtils.isEmpty(launchActionParam)) {
            builder.appendQueryParameter("widgetAction", launchActionParam);
        }
        if (!TextUtils.isEmpty(widgetKind)) {
            builder.appendQueryParameter("widgetKind", widgetKind);
        }
        if (!TextUtils.isEmpty(launchId)) {
            builder.appendQueryParameter("widgetLaunchId", launchId);
        }
        if (!TextUtils.isEmpty(targetId)) {
            builder.appendQueryParameter("widgetTargetId", targetId);
        }
        if (createdAt > 0L) {
            builder.appendQueryParameter("widgetCreatedAt", String.valueOf(createdAt));
        }
        if (!TextUtils.isEmpty(source) && !TextUtils.isEmpty(launchActionParam)) {
            builder.appendQueryParameter("widgetSource", source);
        }
        String launchUrl = builder.build().toString();
        ControlerStartupTrace.mark(
            "start_url_built",
            "page=" + page
                + " action=" + (TextUtils.isEmpty(launchActionParam) ? "-" : launchActionParam)
                + " widgetKind=" + (TextUtils.isEmpty(widgetKind) ? "-" : widgetKind)
                + " targetId=" + (TextUtils.isEmpty(targetId) ? "-" : targetId)
        );
        return launchUrl;
    }

    private void showToastOnMainThread(final String message) {
        final Context context = getReactApplicationContext();
        final String normalizedMessage = message == null ? "" : message.trim();
        if (context == null || TextUtils.isEmpty(normalizedMessage)) {
            return;
        }
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(context, normalizedMessage, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private String normalizeLaunchPage(String page) {
        String normalized = String.valueOf(page == null ? "" : page).trim();
        if ("stats".equals(normalized)) {
            return "stats";
        }
        if ("plan".equals(normalized)) {
            return "plan";
        }
        if ("todo".equals(normalized)) {
            return "todo";
        }
        if ("diary".equals(normalized)) {
            return "diary";
        }
        if ("settings".equals(normalized)) {
            return "settings";
        }
        return "index";
    }

    private String normalizeLaunchTargetPage(String requestedPage, String action) {
        if ("show-todos".equals(action) || "show-checkins".equals(action)) {
            return "todo";
        }
        return normalizeLaunchPage(requestedPage);
    }

    @ReactMethod
    public void readStorageState(Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("readStorageState", "start", startedAt, "");
        try {
            JSONObject root = ControlerWidgetDataStore.loadRootStrict(getReactApplicationContext());
            JSONObject payload = new JSONObject();
            payload.put("state", root);
            payload.put("status", buildResponsiveStorageStatus(root));
            promise.resolve(payload.toString());
        } catch (Exception error) {
            promise.reject("storage_read_failed", error);
        } finally {
            logStorageBridgeTrace("readStorageState", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void writeStorageState(String stateJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("writeStorageState", "start", startedAt, "");
        try {
            JSONObject root =
                TextUtils.isEmpty(stateJson) ? new JSONObject() : new JSONObject(stateJson);
            boolean saved =
                ControlerWidgetDataStore.saveManagedRoot(getReactApplicationContext(), root);
            if (!saved) {
                promise.reject("storage_write_failed", "保存移动端数据失败。");
                return;
            }

            enqueueStorageSideEffects(
                buildDefaultChangedSections(),
                true,
                true,
                true
            );

            JSONObject payload = new JSONObject();
            payload.put(
                "state",
                ControlerWidgetDataStore.loadRoot(getReactApplicationContext())
            );
            payload.put("status", buildResponsiveStorageStatus(payload.getJSONObject("state")));
            promise.resolve(payload.toString());
        } catch (Exception error) {
            promise.reject("storage_write_failed", error);
        } finally {
            logStorageBridgeTrace("writeStorageState", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void getStorageStatus(Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("getStorageStatus", "start", startedAt, "");
        try {
            promise.resolve(buildResponsiveStorageStatus(null).toString());
        } catch (Exception error) {
            promise.reject("storage_status_failed", error);
        } finally {
            logStorageBridgeTrace("getStorageStatus", "finish", startedAt, "");
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
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("getStorageCoreState", "start", startedAt, "");
        try {
            promise.resolve(
                ControlerWidgetDataStore
                    .getStorageCoreState(getReactApplicationContext())
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_core_failed", error);
        } finally {
            logStorageBridgeTrace("getStorageCoreState", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void getStoragePlanBootstrapState(String optionsJson, Promise promise) {
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            promise.resolve(
                ControlerWidgetDataStore
                    .getStoragePlanBootstrapState(getReactApplicationContext(), options)
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_plan_bootstrap_failed", error);
        }
    }

    @ReactMethod
    public void getStoragePageBootstrapState(String optionsJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            logStorageBridgeTrace(
                "getStoragePageBootstrapState",
                "start",
                startedAt,
                "pageKey=" + options.optString("pageKey", options.optString("page", ""))
            );
            promise.resolve(
                ControlerWidgetDataStore
                    .getStoragePageBootstrapState(getReactApplicationContext(), options)
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_page_bootstrap_failed", error);
        } finally {
            logStorageBridgeTrace("getStoragePageBootstrapState", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void getStorageDraft(String optionsJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("getStorageDraft", "start", startedAt, "");
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            JSONObject result =
                ControlerWidgetDataStore.getStorageDraft(getReactApplicationContext(), options);
            promise.resolve(result == null ? "null" : result.toString());
        } catch (Exception error) {
            promise.reject("storage_draft_get_failed", error);
        } finally {
            logStorageBridgeTrace("getStorageDraft", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void setStorageDraft(String optionsJson, Promise promise) {
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            promise.resolve(
                ControlerWidgetDataStore
                    .setStorageDraft(getReactApplicationContext(), options)
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_draft_set_failed", error);
        }
    }

    @ReactMethod
    public void removeStorageDraft(String optionsJson, Promise promise) {
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            promise.resolve(
                String.valueOf(
                    ControlerWidgetDataStore.removeStorageDraft(
                        getReactApplicationContext(),
                        options
                    )
                )
            );
        } catch (Exception error) {
            promise.reject("storage_draft_remove_failed", error);
        }
    }

    @ReactMethod
    public void getStorageBootstrapState(String optionsJson, Promise promise) {
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            promise.resolve(
                ControlerWidgetDataStore
                    .getStorageBootstrapState(getReactApplicationContext(), options)
                    .toString()
            );
        } catch (Exception error) {
            promise.reject("storage_bootstrap_failed", error);
        }
    }

    @ReactMethod
    public void appendStorageJournal(String payloadJson, Promise promise) {
        try {
            JSONObject payload =
                TextUtils.isEmpty(payloadJson) ? new JSONObject() : new JSONObject(payloadJson);
            JSONObject result =
                ControlerWidgetDataStore.appendStorageJournal(
                    getReactApplicationContext(),
                    payload
                );
            JSONArray changedSections = result.optJSONArray("changedSections");
            enqueueStorageSideEffects(
                changedSections,
                shouldRefreshNotificationsForSections(changedSections),
                true,
                true
            );
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_journal_append_failed", error);
        }
    }

    @ReactMethod
    public void flushStorageJournal(Promise promise) {
        try {
            JSONObject result =
                ControlerWidgetDataStore.flushStorageJournal(getReactApplicationContext());
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_journal_flush_failed", error);
        }
    }

    @ReactMethod
    public void setLastVisiblePage(String pageKey, Promise promise) {
        try {
            String normalizedPage = ControlerWidgetLastPageStore.normalizePage(pageKey);
            if (!TextUtils.isEmpty(normalizedPage)) {
                ControlerWidgetLastPageStore.setLastVisiblePage(
                    getReactApplicationContext(),
                    normalizedPage
                );
            }
            promise.resolve(normalizedPage);
        } catch (Exception error) {
            promise.reject("last_visible_page_failed", error);
        }
    }

    @ReactMethod
    public void showToast(String message, Promise promise) {
        try {
            String normalizedMessage = message == null ? "" : message.trim();
            showToastOnMainThread(normalizedMessage);
            promise.resolve(normalizedMessage);
        } catch (Exception error) {
            promise.reject("show_toast_failed", error);
        }
    }

    @ReactMethod
    public void showSoftInput(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            try {
                JSONObject result = new JSONObject();
                result.put("ok", false);
                result.put("shown", false);
                result.put("focused", false);
                result.put("targetClass", "");
                result.put("message", "当前没有可用的前台页面。");
                promise.resolve(result.toString());
            } catch (Exception error) {
                promise.reject("show_soft_input_failed", error);
            }
            return;
        }

        MAIN_HANDLER.post(() -> {
            try {
                Context context = activity;
                InputMethodManager inputMethodManager =
                    (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
                requestSoftInput(activity, inputMethodManager, false, promise);
            } catch (Exception error) {
                Log.e(TAG, "showSoftInput failed", error);
                promise.reject("show_soft_input_failed", error);
            }
        });
    }

    @ReactMethod
    public void restartSoftInput(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            try {
                JSONObject result = new JSONObject();
                result.put("ok", false);
                result.put("restarted", false);
                result.put("shown", false);
                result.put("focused", false);
                result.put("served", false);
                result.put("targetClass", "");
                result.put("message", "当前没有可用的前台页面。");
                promise.resolve(result.toString());
            } catch (Exception error) {
                promise.reject("restart_soft_input_failed", error);
            }
            return;
        }

        MAIN_HANDLER.post(() -> {
            try {
                Context context = activity;
                InputMethodManager inputMethodManager =
                    (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
                requestSoftInput(activity, inputMethodManager, true, promise);
            } catch (Exception error) {
                Log.e(TAG, "restartSoftInput failed", error);
                promise.reject("restart_soft_input_failed", error);
            }
        });
    }

    @ReactMethod
    public void getSoftInputState(Promise promise) {
        Activity activity = getCurrentActivity();
        try {
            JSONObject result = new JSONObject();
            if (activity == null) {
                result.put("ok", false);
                result.put("reportedVisible", false);
                result.put("actualVisible", false);
                result.put("imeBottomInset", 0);
                result.put("navigationBottomInset", 0);
                result.put("targetClass", "");
                result.put("message", "当前没有可用的前台页面。");
                promise.resolve(result.toString());
                return;
            }

            Context context = activity;
            InputMethodManager inputMethodManager =
                (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
            View targetView = resolveSoftInputTarget(activity, inputMethodManager);
            ImeVisibilityState imeState = readImeVisibilityState(activity, targetView);
            result.put("ok", true);
            result.put("reportedVisible", imeState.reportedVisible);
            result.put("actualVisible", imeState.actualVisible);
            result.put("imeBottomInset", imeState.imeBottomInset);
            result.put("navigationBottomInset", imeState.navigationBottomInset);
            result.put(
                "targetClass",
                targetView == null ? "" : targetView.getClass().getName()
            );
            result.put("message", "");
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("get_soft_input_state_failed", error);
        }
    }

    @ReactMethod
    public void markStartupReady(Promise promise) {
        try {
            ControlerLaunchSplashCoordinator.markStartupReady();
            JSONObject result = new JSONObject();
            result.put("ok", true);
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("mark_startup_ready_failed", error);
        }
    }

    private static final class ImeVisibilityState {
        final boolean reportedVisible;
        final boolean actualVisible;
        final int imeBottomInset;
        final int navigationBottomInset;

        ImeVisibilityState(
            boolean reportedVisible,
            boolean actualVisible,
            int imeBottomInset,
            int navigationBottomInset
        ) {
            this.reportedVisible = reportedVisible;
            this.actualVisible = actualVisible;
            this.imeBottomInset = imeBottomInset;
            this.navigationBottomInset = navigationBottomInset;
        }
    }

    private void requestSoftInput(
        Activity activity,
        InputMethodManager inputMethodManager,
        boolean restart,
        Promise promise
    ) {
        try {
            normalizeActivitySoftInputMode(activity);
            View targetView = resolveSoftInputTarget(activity, inputMethodManager);
            requestSoftInputTargetFocus(targetView);

            boolean restarted =
                restart && restartSoftInputConnection(inputMethodManager, targetView);
            boolean served =
                inputMethodManager != null &&
                targetView != null &&
                inputMethodManager.isActive(targetView);
            boolean requested = false;
            ImeVisibilityState imeState = readImeVisibilityState(activity, targetView);
            if (!imeState.actualVisible && targetView != null) {
                notifySoftInputViewClicked(inputMethodManager, targetView);
                requested =
                    requestInputMethodVisibility(
                        inputMethodManager,
                        targetView,
                        InputMethodManager.SHOW_IMPLICIT
                    );
                WindowInsetsControllerCompat controller =
                    activity.getWindow() == null
                        ? null
                        : WindowCompat.getInsetsController(
                            activity.getWindow(),
                            targetView
                        );
                if (controller != null) {
                    controller.show(WindowInsetsCompat.Type.ime());
                }
            }

            ImeVisibilityState finalState = readImeVisibilityState(activity, targetView);
            JSONObject result = new JSONObject();
            result.put("ok", targetView != null);
            result.put("restarted", restarted);
            result.put("shown", finalState.actualVisible || requested);
            result.put("focused", targetView != null && targetView.hasFocus());
            result.put("served", served);
            result.put("reportedVisible", finalState.reportedVisible);
            result.put("actualVisible", finalState.actualVisible);
            result.put(
                "targetClass",
                targetView == null ? "" : targetView.getClass().getName()
            );
            result.put("message", targetView == null ? "未找到可聚焦的输入承载视图。" : "");
            promise.resolve(result.toString());
        } catch (Exception error) {
            Log.e(TAG, "requestSoftInput failed", error);
            promise.reject("show_soft_input_failed", error);
        }
    }
    private View resolveSoftInputTarget(
        Activity activity,
        InputMethodManager inputMethodManager
    ) {
        if (activity == null || activity.getWindow() == null) {
            return null;
        }
        View currentFocus = activity.getCurrentFocus();
        if (currentFocus != null) {
            return currentFocus;
        }
        View decorView = activity.getWindow().getDecorView();
        View decorFocus = decorView == null ? null : decorView.findFocus();
        return decorFocus != null ? decorFocus : decorView;
    }
    private void requestSoftInputTargetFocus(View targetView) {
        if (targetView == null || targetView.hasFocus()) {
            return;
        }
        targetView.setFocusableInTouchMode(true);
        targetView.requestFocusFromTouch();
    }
    private boolean restartSoftInputConnection(
        InputMethodManager inputMethodManager,
        View targetView
    ) {
        if (inputMethodManager == null || targetView == null) {
            return false;
        }
        try {
            inputMethodManager.restartInput(targetView);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean notifySoftInputViewClicked(
        InputMethodManager inputMethodManager,
        View targetView
    ) {
        if (inputMethodManager == null || targetView == null) {
            return false;
        }
        try {
            inputMethodManager.viewClicked(targetView);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean requestInputMethodVisibility(
        InputMethodManager inputMethodManager,
        View targetView,
        int flags
    ) {
        if (inputMethodManager == null || targetView == null) {
            return false;
        }
        try {
            return inputMethodManager.showSoftInput(targetView, flags);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void normalizeActivitySoftInputMode(Activity activity) {
        if (activity == null || activity.getWindow() == null) {
            return;
        }
        try {
            activity
                .getWindow()
                .setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
                        | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
                );
        } catch (Exception ignored) {
        }
    }

    private int dpToPx(Context context, int dp) {
        if (context == null || dp <= 0) {
            return 0;
        }
        return Math.round(
            dp * context.getResources().getDisplayMetrics().density
        );
    }

    private ImeVisibilityState readImeVisibilityState(Activity activity, View targetView) {
        if (activity == null) {
            return new ImeVisibilityState(false, false, 0, 0);
        }
        View decorView =
            activity.getWindow() == null ? null : activity.getWindow().getDecorView();
        View insetsView = targetView != null ? targetView : decorView;
        if (insetsView == null) {
            return new ImeVisibilityState(false, false, 0, 0);
        }
        try {
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(insetsView);
            if (windowInsets == null) {
                return new ImeVisibilityState(false, false, 0, 0);
            }
            Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            Insets navigationInsets =
                windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            int imeBottomInset = imeInsets != null ? Math.max(0, imeInsets.bottom) : 0;
            int navigationBottomInset =
                navigationInsets != null ? Math.max(0, navigationInsets.bottom) : 0;
            int obscuredBottomInset = readFallbackImeBottomInsetPx(targetView, decorView);
            int visibilityThresholdPx = dpToPx(insetsView.getContext(), IME_VISIBLE_INSET_THRESHOLD_DP);
            boolean reportedVisible =
                windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            boolean actualVisible =
                reportedVisible ||
                imeBottomInset > navigationBottomInset + Math.max(visibilityThresholdPx, 0) ||
                obscuredBottomInset > navigationBottomInset + Math.max(visibilityThresholdPx, 0);
            int effectiveImeBottomInset = 0;
            if (actualVisible) {
                InputMethodManager inputMethodManager =
                    (InputMethodManager)
                        activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                int inputMethodVisibleHeight =
                    readInputMethodWindowVisibleHeightPx(inputMethodManager);
                effectiveImeBottomInset =
                    Math.max(
                        imeBottomInset,
                        Math.max(obscuredBottomInset, inputMethodVisibleHeight)
                    );
            }
            return new ImeVisibilityState(
                reportedVisible || actualVisible,
                actualVisible,
                effectiveImeBottomInset,
                navigationBottomInset
            );
        } catch (Exception error) {
            return new ImeVisibilityState(false, false, 0, 0);
        }
    }

    private int readFallbackImeBottomInsetPx(View targetView, View decorView) {
        View rootView = targetView != null ? targetView.getRootView() : decorView;
        if (rootView == null) {
            return 0;
        }
        try {
            Rect visibleFrame = new Rect();
            rootView.getWindowVisibleDisplayFrame(visibleFrame);
            int visibleBottom = Math.max(0, visibleFrame.bottom);
            if (visibleBottom <= 0) {
                return 0;
            }
            int[] locationOnScreen = new int[] {0, 0};
            rootView.getLocationOnScreen(locationOnScreen);
            int rootBottomOnScreen =
                Math.max(0, locationOnScreen[1]) + Math.max(0, rootView.getHeight());
            if (rootBottomOnScreen <= 0) {
                return 0;
            }
            return Math.max(0, rootBottomOnScreen - visibleBottom);
        } catch (Exception error) {
            return 0;
        }
    }

    private int readInputMethodWindowVisibleHeightPx(InputMethodManager inputMethodManager) {
        if (inputMethodManager == null) {
            return 0;
        }
        try {
            java.lang.reflect.Method visibleHeightMethod =
                InputMethodManager.class.getMethod("getInputMethodWindowVisibleHeight");
            Object rawValue = visibleHeightMethod.invoke(inputMethodManager);
            if (!(rawValue instanceof Number)) {
                return 0;
            }
            return Math.max(0, ((Number) rawValue).intValue());
        } catch (Exception error) {
            return 0;
        }
    }

    @ReactMethod
    public void loadStorageSectionRange(String section, String scopeJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace(
            "loadStorageSectionRange",
            "start",
            startedAt,
            "section=" + String.valueOf(section == null ? "" : section)
        );
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
        } finally {
            logStorageBridgeTrace("loadStorageSectionRange", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void saveStorageSectionRange(String section, String payloadJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace(
            "saveStorageSectionRange",
            "start",
            startedAt,
            "section=" + String.valueOf(section == null ? "" : section)
        );
        try {
            JSONObject payload =
                TextUtils.isEmpty(payloadJson) ? new JSONObject() : new JSONObject(payloadJson);
            JSONObject result =
                ControlerWidgetDataStore.saveStorageSectionRange(
                    getReactApplicationContext(),
                    section,
                    payload
                );
            JSONArray changedSections = new JSONArray().put(section);
            enqueueStorageSideEffects(
                changedSections,
                shouldRefreshNotificationsForSections(changedSections),
                true,
                true
            );
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_range_save_failed", error);
        } finally {
            logStorageBridgeTrace("saveStorageSectionRange", "finish", startedAt, "");
        }
    }

    @ReactMethod
    public void replaceStorageCoreState(String partialCoreJson, Promise promise) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageBridgeTrace("replaceStorageCoreState", "start", startedAt, "");
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
            JSONArray changedSections = inferChangedSectionsFromCorePatch(partialCore);
            enqueueStorageSideEffects(
                changedSections,
                shouldRefreshNotificationsForSections(changedSections),
                true,
                true
            );
            promise.resolve(result.toString());
        } catch (Exception error) {
            promise.reject("storage_core_replace_failed", error);
        } finally {
            logStorageBridgeTrace("replaceStorageCoreState", "finish", startedAt, "");
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
            JSONArray changedSections = new JSONArray().put("plansRecurring");
            enqueueStorageSideEffects(
                changedSections,
                shouldRefreshNotificationsForSections(changedSections),
                true,
                true
            );
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
                    writeCurrentBundleSnapshotToDirectory(
                        getReactApplicationContext(),
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
                result.put("status", buildResponsiveStorageStatus(refreshedRoot));
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
    public void pickDiaryImages(String optionsJson, Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("storage_diary_image_pick_unavailable", "当前没有可用的 Activity。");
            return;
        }
        if (pendingPickDiaryImagesPromise != null) {
            promise.reject("storage_diary_image_pick_busy", "已有图片选择请求在进行中。");
            return;
        }
        try {
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, options.optBoolean("multiple", true));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            pendingPickDiaryImagesPromise = promise;
            pendingPickDiaryImagesOptions = options;
            activity.startActivityForResult(intent, REQUEST_PICK_DIARY_IMAGES);
        } catch (ActivityNotFoundException error) {
            pendingPickDiaryImagesPromise = null;
            pendingPickDiaryImagesOptions = null;
            promise.reject(
                "storage_diary_image_pick_unavailable",
                "当前设备不支持选择图片。"
            );
        } catch (Exception error) {
            pendingPickDiaryImagesPromise = null;
            pendingPickDiaryImagesOptions = null;
            promise.reject("storage_diary_image_pick_failed", error);
        }
    }

    @ReactMethod
    public void saveDiaryImageAsset(String optionsJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            String fileName = String.valueOf(options.optString("fileName", "")).trim();
            String sourceUriText =
                String.valueOf(
                    firstNonEmpty(
                        options.optString("sourceUri", ""),
                        options.optString("uri", "")
                    )
                ).trim();
            PreparedDiaryImageAsset prepared;
            if (!TextUtils.isEmpty(sourceUriText)) {
                Uri sourceUri = Uri.parse(sourceUriText);
                if (TextUtils.isEmpty(fileName)) {
                    fileName = resolveDocumentName(sourceUri);
                }
                prepared = prepareDiaryImageAsset(context, sourceUri, options);
            } else {
                byte[] inlineBytes = decodeDiaryImageBytesFromOptions(options);
                if (inlineBytes.length == 0) {
                    promise.reject("storage_diary_image_save_missing_uri", "缺少图片来源 URI。");
                    return;
                }
                prepared =
                    prepareDiaryImageAssetFromBytes(
                        inlineBytes,
                        fileName,
                        firstNonEmpty(
                            options.optString("mimeType", ""),
                            inferDiaryImageMimeTypeFromInlineData(options)
                        ),
                        options
                    );
            }
            String assetId = String.valueOf(options.optString("assetId", "")).trim();
            if (TextUtils.isEmpty(assetId)) {
                assetId =
                    "diary_media_" + UUID.randomUUID().toString().replace("-", "");
            }
            JSONObject assetPayload = new JSONObject();
            assetPayload.put("assetId", assetId);
            assetPayload.put(
                "mimeType",
                inferImageMimeTypeFromName(
                    fileName,
                    prepared.mimeType
                )
            );
            assetPayload.put("width", prepared.width);
            assetPayload.put("height", prepared.height);
            assetPayload.put("sizeBytes", prepared.bytes.length);
            assetPayload.put(
                "compressionMode",
                "original".equals(options.optString("compressionMode", ""))
                    ? "original"
                    : "compressed"
            );
            JSONObject saved =
                ControlerWidgetDataStore.saveDiaryImageAsset(
                    context,
                    assetPayload,
                    prepared.bytes
                );
            saved.put("uri", buildDataUriFromBytes(prepared.bytes, saved.optString("mimeType", "")));
            promise.resolve(saved.toString());
        } catch (Exception error) {
            promise.reject("storage_diary_image_save_failed", error);
        }
    }

    @ReactMethod
    public void resolveDiaryImageUri(String optionsJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            JSONObject result =
                ControlerWidgetDataStore.resolveDiaryImageUri(context, options);
            promise.resolve(result == null ? "null" : result.toString());
        } catch (Exception error) {
            promise.reject("storage_diary_image_resolve_failed", error);
        }
    }

    @ReactMethod
    public void deleteDiaryImageAssets(String optionsJson, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            JSONObject options =
                TextUtils.isEmpty(optionsJson) ? new JSONObject() : new JSONObject(optionsJson);
            promise.resolve(
                ControlerWidgetDataStore.deleteDiaryImageAssets(context, options).toString()
            );
        } catch (Exception error) {
            promise.reject("storage_diary_image_delete_failed", error);
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
            promise.resolve(buildResponsiveStorageStatus(root).toString());
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
            Context context = getReactApplicationContext();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                if (interactive) {
                    maybeRequestExactAlarmAccessIfNeeded(true);
                }
                ControlerNotificationScheduler.rescheduleAll(context);
                promise.resolve(buildNotificationPermissionResult(true, true, false).toString());
                return;
            }

            boolean granted =
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                if (interactive) {
                    maybeRequestExactAlarmAccessIfNeeded(true);
                }
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
            JSONObject payload =
                TextUtils.isEmpty(scheduleJson) ? new JSONObject() : new JSONObject(scheduleJson);
            int scheduledCount = ControlerNotificationScheduler.syncFromPayload(context, payload);

            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("supported", true);
            result.put("mode", "schedule-payload-native");
            result.put("scheduledCount", scheduledCount);
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
            result.put("status", buildResponsiveStorageStatus(refreshedRoot));
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

    private ArrayList<Uri> collectSelectedUris(Intent intent) {
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        if (intent != null && intent.getData() != null) {
            uris.add(intent.getData());
        }
        ClipData clipData = intent == null ? null : intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                ClipData.Item item = clipData.getItemAt(index);
                Uri uri = item == null ? null : item.getUri();
                if (uri != null) {
                    uris.add(uri);
                }
            }
        }
        return new ArrayList<>(uris);
    }

    private byte[] readAllBytes(InputStream inputStream) throws Exception {
        if (inputStream == null) {
            return new byte[0];
        }
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int readLength;
        while ((readLength = inputStream.read(buffer)) >= 0) {
            if (readLength == 0) {
                continue;
            }
            outputStream.write(buffer, 0, readLength);
        }
        return outputStream.toByteArray();
    }

    private String inferImageMimeTypeFromName(String fileName, String fallbackMimeType) {
        String normalizedFallback =
            String.valueOf(fallbackMimeType == null ? "" : fallbackMimeType)
                .trim()
                .toLowerCase(Locale.US);
        if (!TextUtils.isEmpty(normalizedFallback)) {
            return normalizedFallback;
        }
        String lowerName = String.valueOf(fileName == null ? "" : fileName)
            .trim()
            .toLowerCase(Locale.US);
        if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lowerName.endsWith(".png")) {
            return "image/png";
        }
        if (lowerName.endsWith(".webp")) {
            return "image/webp";
        }
        if (lowerName.endsWith(".gif")) {
            return "image/gif";
        }
        if (lowerName.endsWith(".heic")) {
            return "image/heic";
        }
        if (lowerName.endsWith(".heif")) {
            return "image/heif";
        }
        if (lowerName.endsWith(".bmp")) {
            return "image/bmp";
        }
        if (lowerName.endsWith(".svg")) {
            return "image/svg+xml";
        }
        return "";
    }

    private int[] resolveImageBounds(Context context, Uri uri) {
        InputStream inputStream = null;
        try {
            inputStream = context.getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                return new int[] { 0, 0 };
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(inputStream, null, options);
            return new int[] {
                Math.max(0, options.outWidth),
                Math.max(0, options.outHeight),
            };
        } catch (Exception error) {
            return new int[] { 0, 0 };
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private int[] resolveImageBounds(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            return new int[] { 0, 0 };
        }
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            return new int[] {
                Math.max(0, options.outWidth),
                Math.max(0, options.outHeight),
            };
        } catch (Exception error) {
            return new int[] { 0, 0 };
        }
    }

    private int calculateDiaryImageSampleSize(int width, int height, int maxEdge) {
        int sampleSize = 1;
        int safeWidth = Math.max(1, width);
        int safeHeight = Math.max(1, height);
        int targetEdge = Math.max(1, maxEdge);
        while (Math.max(safeWidth / sampleSize, safeHeight / sampleSize) > targetEdge * 2) {
            sampleSize *= 2;
        }
        return Math.max(1, sampleSize);
    }

    private PreparedDiaryImageAsset prepareDiaryImageAssetFromBytes(
        byte[] originalBytes,
        String fileName,
        String fallbackMimeType,
        JSONObject options
    ) throws Exception {
        String compressionMode =
            "original".equals(String.valueOf(options.optString("compressionMode", "")))
                ? "original"
                : "compressed";
        String sourceMimeType = inferImageMimeTypeFromName(
            fileName,
            fallbackMimeType
        );
        byte[] safeOriginalBytes = originalBytes == null ? new byte[0] : originalBytes;
        if (safeOriginalBytes.length == 0) {
            throw new Exception("无法读取所选图片。");
        }
        int[] originalBounds = resolveImageBounds(safeOriginalBytes);
        if (!"compressed".equals(compressionMode)) {
            return new PreparedDiaryImageAsset(
                safeOriginalBytes,
                sourceMimeType,
                originalBounds[0],
                originalBounds[1]
            );
        }

        BitmapFactory.Options decodeOptions = new BitmapFactory.Options();
        decodeOptions.inSampleSize =
            calculateDiaryImageSampleSize(originalBounds[0], originalBounds[1], 2048);
        Bitmap bitmap =
            BitmapFactory.decodeByteArray(
                safeOriginalBytes,
                0,
                safeOriginalBytes.length,
                decodeOptions
            );
        Bitmap scaledBitmap = null;
        if (bitmap == null) {
            return new PreparedDiaryImageAsset(
                safeOriginalBytes,
                sourceMimeType,
                originalBounds[0],
                originalBounds[1]
            );
        }
        int width = Math.max(1, bitmap.getWidth());
        int height = Math.max(1, bitmap.getHeight());
        int maxEdge = Math.max(width, height);
        if (maxEdge > 2048) {
            float scale = 2048f / (float) maxEdge;
            int targetWidth = Math.max(1, Math.round(width * scale));
            int targetHeight = Math.max(1, Math.round(height * scale));
            scaledBitmap = Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
        } else {
            scaledBitmap = bitmap;
        }
        boolean usePng = scaledBitmap.hasAlpha();
        Bitmap.CompressFormat format =
            usePng ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG;
        String mimeType = usePng ? "image/png" : "image/jpeg";
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        try {
            scaledBitmap.compress(format, usePng ? 100 : 88, outputStream);
            return new PreparedDiaryImageAsset(
                outputStream.toByteArray(),
                mimeType,
                Math.max(0, scaledBitmap.getWidth()),
                Math.max(0, scaledBitmap.getHeight())
            );
        } finally {
            if (scaledBitmap != bitmap && scaledBitmap != null) {
                scaledBitmap.recycle();
            }
            if (bitmap != null) {
                bitmap.recycle();
            }
            outputStream.close();
        }
    }

    private PreparedDiaryImageAsset prepareDiaryImageAsset(
        Context context,
        Uri sourceUri,
        JSONObject options
    ) throws Exception {
        String fileName = resolveDocumentName(sourceUri);
        String sourceMimeType = inferImageMimeTypeFromName(
            fileName,
            context.getContentResolver().getType(sourceUri)
        );
        InputStream originalInputStream = context.getContentResolver().openInputStream(sourceUri);
        if (originalInputStream == null) {
            throw new Exception("无法读取所选图片。");
        }
        byte[] originalBytes;
        try {
            originalBytes = readAllBytes(originalInputStream);
        } finally {
            originalInputStream.close();
        }
        return prepareDiaryImageAssetFromBytes(
            originalBytes,
            fileName,
            sourceMimeType,
            options
        );
    }

    private byte[] decodeDiaryImageBytesFromOptions(JSONObject options) {
        if (options == null) {
            return new byte[0];
        }
        try {
            String dataUrl = String.valueOf(options.optString("dataUrl", "")).trim();
            if (!TextUtils.isEmpty(dataUrl) && dataUrl.startsWith("data:")) {
                int markerIndex = dataUrl.indexOf(";base64,");
                if (markerIndex > 5 && markerIndex + 8 <= dataUrl.length()) {
                    String encoded = dataUrl.substring(markerIndex + 8).trim();
                    if (!TextUtils.isEmpty(encoded)) {
                        return Base64.decode(encoded, Base64.DEFAULT);
                    }
                }
            }
            String dataBase64 = String.valueOf(options.optString("dataBase64", "")).trim();
            if (!TextUtils.isEmpty(dataBase64)) {
                return Base64.decode(dataBase64, Base64.DEFAULT);
            }
        } catch (Exception error) {
            Log.w(TAG, "decodeDiaryImageBytesFromOptions failed", error);
        }
        return new byte[0];
    }

    private String inferDiaryImageMimeTypeFromInlineData(JSONObject options) {
        if (options == null) {
            return "";
        }
        String dataUrl = String.valueOf(options.optString("dataUrl", "")).trim();
        if (!TextUtils.isEmpty(dataUrl) && dataUrl.startsWith("data:")) {
            int markerIndex = dataUrl.indexOf(";base64,");
            if (markerIndex > 5) {
                return dataUrl.substring(5, markerIndex).trim().toLowerCase(Locale.US);
            }
        }
        return "";
    }

    private String buildDataUriFromBytes(byte[] bytes, String mimeType) {
        if (bytes == null || bytes.length <= 0) {
            return "";
        }
        String normalizedMime =
            TextUtils.isEmpty(mimeType) ? "image/jpeg" : mimeType.trim().toLowerCase(Locale.US);
        return "data:"
            + normalizedMime
            + ";base64,"
            + Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private JSONObject buildPickedDiaryImagePayload(Context context, Uri uri) throws Exception {
        String displayName = resolveDocumentName(uri);
        String mimeType = inferImageMimeTypeFromName(
            displayName,
            context.getContentResolver().getType(uri)
        );
        int[] bounds = resolveImageBounds(context, uri);
        JSONObject payload = new JSONObject();
        payload.put("uri", uri.toString());
        payload.put(
            "fileName",
            TextUtils.isEmpty(displayName) ? JSONObject.NULL : displayName
        );
        payload.put(
            "mimeType",
            TextUtils.isEmpty(mimeType) ? JSONObject.NULL : mimeType
        );
        payload.put("sizeBytes", Math.max(0L, queryDocumentSize(context, uri)));
        payload.put("width", Math.max(0, bounds[0]));
        payload.put("height", Math.max(0, bounds[1]));
        return payload;
    }

    private void handlePickDiaryImagesSelectionResult(int resultCode, Intent intent) {
        Promise promise = pendingPickDiaryImagesPromise;
        pendingPickDiaryImagesPromise = null;
        pendingPickDiaryImagesOptions = null;
        if (promise == null) {
            return;
        }
        if (resultCode != Activity.RESULT_OK || intent == null) {
            promise.resolve("{\"items\":[]}");
            return;
        }
        ReactApplicationContext context = getReactApplicationContext();
        try {
            JSONArray items = new JSONArray();
            for (Uri uri : collectSelectedUris(intent)) {
                if (uri == null) {
                    continue;
                }
                int permissionFlags = intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
                if (permissionFlags == 0) {
                    permissionFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
                }
                try {
                    context.getContentResolver().takePersistableUriPermission(uri, permissionFlags);
                } catch (SecurityException error) {
                    Log.w(TAG, "takePersistableUriPermission failed for diary image", error);
                }
                items.put(buildPickedDiaryImagePayload(context, uri));
            }
            promise.resolve(new JSONObject().put("items", items).toString());
        } catch (Exception error) {
            promise.reject("storage_diary_image_pick_failed", error);
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
                buildResponsiveStorageStatus(refreshedRoot, switchPlan.switchAction).toString()
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
        result.put("exactAlarmSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S);
        result.put(
            "exactAlarmGranted",
            hasExactAlarmAccess(getReactApplicationContext())
        );
        return result;
    }

    private boolean hasExactAlarmAccess(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        if (context == null) {
            return false;
        }
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarmManager != null && alarmManager.canScheduleExactAlarms();
    }

    private void maybeRequestExactAlarmAccessIfNeeded(boolean interactive) {
        if (!interactive || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return;
        }

        Context context = getReactApplicationContext();
        if (hasExactAlarmAccess(context)) {
            pendingExactAlarmPermissionCheck = false;
            return;
        }

        Activity activity = getCurrentActivity();
        if (activity == null) {
            return;
        }

        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        pendingExactAlarmPermissionCheck = true;
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException primaryError) {
            try {
                Intent fallbackIntent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(fallbackIntent);
            } catch (Exception secondaryError) {
                pendingExactAlarmPermissionCheck = false;
            }
        } catch (Exception error) {
            pendingExactAlarmPermissionCheck = false;
        }
    }

    private void maybeHandleExactAlarmPermissionResult() {
        if (!pendingExactAlarmPermissionCheck) {
            return;
        }
        if (hasExactAlarmAccess(getReactApplicationContext())) {
            pendingExactAlarmPermissionCheck = false;
            try {
                ControlerNotificationScheduler.rescheduleAll(getReactApplicationContext());
            } catch (Exception error) {
                error.printStackTrace();
            }
        }
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
                if ("needs-recovery".equals(ControlerWidgetDataStore.getStorageRecoveryState())) {
                    throw new Exception(ControlerWidgetDataStore.getStorageRecoveryMessage());
                }
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
            if ("needs-recovery".equals(ControlerWidgetDataStore.getStorageRecoveryState())) {
                throw new Exception(ControlerWidgetDataStore.getStorageRecoveryMessage());
            }
            ControlerNotificationScheduler.rescheduleAll(context, refreshedRoot);
            ControlerWidgetRenderer.scheduleRefreshAll(context);
            maybeRunAutoBackup(context);
            promise.resolve(
                buildResponsiveStorageStatus(
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
                ControlerWidgetDataStore.copyDiaryMediaAssetsFromDirectory(
                    context,
                    bundleRoot,
                    importedRoot.optJSONArray("diaryMediaAssets")
                );
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

    private String readTextFromFile(File file) throws Exception {
        if (file == null || !file.exists()) {
            return "";
        }
        BufferedReader reader =
            new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8)
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
        AtomicFile atomicFile = new AtomicFile(file);
        FileOutputStream outputStream = atomicFile.startWrite();
        try {
            outputStream.write(String.valueOf(content).getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.getFD().sync();
            atomicFile.finishWrite(outputStream);
            outputStream = null;
        } catch (Exception error) {
            atomicFile.failWrite(outputStream);
            throw error;
        } finally {
            if (outputStream != null) {
                outputStream.close();
            }
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

    private LinkedHashSet<String> collectBundleRelativePaths(JSONObject manifest) {
        LinkedHashSet<String> relativePaths = new LinkedHashSet<>();
        relativePaths.add(BUNDLE_MANIFEST_FILE_NAME);
        relativePaths.add(BUNDLE_CORE_FILE_NAME);
        relativePaths.add(BUNDLE_RECURRING_PLANS_FILE_NAME);

        JSONObject sections =
            manifest == null ? null : manifest.optJSONObject("sections");
        if (sections == null) {
            return relativePaths;
        }

        ArrayList<String> sectionKeys = new ArrayList<>();
        for (java.util.Iterator<String> iterator = sections.keys(); iterator.hasNext();) {
            sectionKeys.add(iterator.next());
        }
        Collections.sort(sectionKeys);

        for (String sectionKey : sectionKeys) {
            JSONObject section = sections.optJSONObject(sectionKey);
            JSONArray partitions = section == null ? null : section.optJSONArray("partitions");
            if (partitions == null) {
                continue;
            }
            for (int index = 0; index < partitions.length(); index += 1) {
                JSONObject partition = partitions.optJSONObject(index);
                String relativePath =
                    partition == null ? "" : partition.optString("file", "").trim();
                if (!TextUtils.isEmpty(relativePath)) {
                    relativePaths.add(relativePath);
                }
            }
        }

        return relativePaths;
    }

    private void writeCurrentBundleSnapshotToDirectory(
        Context context,
        File targetDirectory
    ) throws Exception {
        if (targetDirectory == null) {
            throw new Exception("导出目录不可用。");
        }
        deleteRecursively(targetDirectory);
        if (!targetDirectory.exists() && !targetDirectory.mkdirs()) {
            throw new Exception("无法创建导出目录。");
        }

        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (treeUri == null) {
            ControlerWidgetDataStore.writeBundleSnapshotToDirectory(
                context,
                ControlerWidgetDataStore.loadRoot(context),
                targetDirectory
            );
            return;
        }

        JSONObject manifest = ControlerWidgetDataStore.getStorageManifest(context);
        LinkedHashSet<String> relativePaths = collectBundleRelativePaths(manifest);
        for (String relativePath : relativePaths) {
            Uri sourceUri = ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                relativePath,
                false,
                false,
                null
            );
            if (sourceUri == null) {
                throw new Exception("当前 bundle 文件缺失: " + relativePath);
            }
            File targetFile =
                new File(targetDirectory, relativePath.replace('/', File.separatorChar));
            copyUriToFile(context, sourceUri, targetFile);
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

    private void validateBundleZipImportable(File zipFile) throws Exception {
        if (zipFile == null || !zipFile.exists() || !zipFile.isFile()) {
            throw new Exception("备份 ZIP 文件不可用。");
        }
        File validationRoot = new File(
            ensureCacheChildDirectory("auto-backup-validate"),
            "validate-" + System.currentTimeMillis()
        );
        try {
            if (!validationRoot.exists() && !validationRoot.mkdirs()) {
                throw new Exception("无法创建备份校验目录。");
            }
            unzipFileToDirectory(zipFile, validationRoot);
            File bundleRoot = resolveExtractedBundleRoot(validationRoot);
            ControlerWidgetDataStore.loadBundleSnapshotFromDirectory(bundleRoot);
        } finally {
            deleteRecursively(validationRoot);
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

    private Uri resolveMetadataQueryUri(Uri uri) {
        if (uri == null) {
            return null;
        }
        try {
            if (DocumentsContract.isTreeUri(uri)) {
                String treeDocumentId = DocumentsContract.getTreeDocumentId(uri);
                if (!TextUtils.isEmpty(treeDocumentId)) {
                    return DocumentsContract.buildDocumentUriUsingTree(uri, treeDocumentId);
                }
            }
        } catch (Exception ignored) {
        }
        return uri;
    }

    private String resolveDocumentName(Uri uri) {
        Uri targetUri = resolveMetadataQueryUri(uri);
        if (targetUri == null) {
            return "controler-data.json";
        }
        Cursor cursor = null;
        try {
            cursor = getReactApplicationContext().getContentResolver().query(
                targetUri,
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

    private long queryDocumentSize(Context context, Uri uri) {
        Uri targetUri = resolveMetadataQueryUri(uri);
        if (context == null || targetUri == null) {
            return 0L;
        }
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                targetUri,
                new String[] { OpenableColumns.SIZE },
                null,
                null,
                null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int columnIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (columnIndex >= 0 && !cursor.isNull(columnIndex)) {
                    return Math.max(0L, cursor.getLong(columnIndex));
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return 0L;
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
            return "content-uri:" + directoryUri.toString() + "/" + AUTO_BACKUP_DIRECTORY_NAME;
        }
        return "file-path:" + getLocalAutoBackupDirectory(context).getAbsolutePath();
    }

    private File getLocalAutoBackupDirectory(Context context) {
        File defaultStorageFile = ControlerWidgetDataStore.getDefaultStorageFile(context);
        File root = defaultStorageFile == null ? null : defaultStorageFile.getParentFile();
        if (root == null) {
            root = new File(context.getFilesDir(), "Order/app_data");
        }
        return new File(root, AUTO_BACKUP_DIRECTORY_NAME);
    }

    private boolean isExternalStorageDocumentsTreeUri(Uri treeUri) {
        return treeUri != null
            && "com.android.externalstorage.documents".equals(treeUri.getAuthority());
    }

    private File resolveExternalStorageTreeDirectory(Uri treeUri) {
        if (!isExternalStorageDocumentsTreeUri(treeUri)) {
            return null;
        }
        try {
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            if (TextUtils.isEmpty(treeDocumentId)) {
                return null;
            }
            int separatorIndex = treeDocumentId.indexOf(':');
            String volumeId = separatorIndex >= 0
                ? treeDocumentId.substring(0, separatorIndex)
                : treeDocumentId;
            String relativePath = separatorIndex >= 0
                ? treeDocumentId.substring(separatorIndex + 1)
                : "";
            File volumeRoot = "primary".equalsIgnoreCase(volumeId)
                ? Environment.getExternalStorageDirectory()
                : new File("/storage/" + volumeId);
            if (volumeRoot == null || !volumeRoot.exists()) {
                return null;
            }
            if (TextUtils.isEmpty(relativePath)) {
                return volumeRoot;
            }
            return new File(volumeRoot, relativePath.replace("/", File.separator));
        } catch (Exception ignored) {
            return null;
        }
    }

    private File resolveCustomAutoBackupDirectoryFile(Context context) {
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        File storageDirectory = resolveExternalStorageTreeDirectory(treeUri);
        if (storageDirectory == null) {
            return null;
        }
        return new File(storageDirectory, AUTO_BACKUP_DIRECTORY_NAME);
    }

    private String getAutoBackupIndexRelativePath() {
        return AUTO_BACKUP_DIRECTORY_NAME + "/" + AUTO_BACKUP_INDEX_FILE_NAME;
    }

    private File getAutoBackupIndexFile(Context context) {
        return new File(getLocalAutoBackupDirectory(context), AUTO_BACKUP_INDEX_FILE_NAME);
    }

    private File getRuntimeSidecarBaseDirectory(Context context) {
        File root =
            context == null
                ? null
                : (
                    context.getNoBackupFilesDir() != null
                        ? context.getNoBackupFilesDir()
                        : context.getFilesDir()
                );
        File target = new File(root == null ? new File(".") : root, "runtime-sidecar");
        if (!target.exists()) {
            target.mkdirs();
        }
        return target;
    }

    private File getDirectoryDocumentUriCacheFile(Context context) {
        return new File(
            getRuntimeSidecarBaseDirectory(context),
            DIRECTORY_DOCUMENT_URI_CACHE_FILE_NAME
        );
    }

    private JSONObject readRuntimeCacheJson(File file) {
        if (file == null || !file.exists()) {
            return new JSONObject();
        }
        try {
            String raw = readTextFromFile(file).trim();
            if (TextUtils.isEmpty(raw)) {
                return new JSONObject();
            }
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private String sanitizeAutoBackupFileName(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim();
        if (TextUtils.isEmpty(normalized) || normalized.contains("/") || normalized.contains("\\")) {
            return "";
        }
        return normalized.toLowerCase(Locale.US).endsWith(".zip") ? normalized : "";
    }

    private String extractAutoBackupFileName(String relativePath) {
        String normalized = String.valueOf(relativePath == null ? "" : relativePath).trim();
        if (TextUtils.isEmpty(normalized)) {
            return "";
        }
        int separatorIndex = normalized.lastIndexOf('/');
        String fileName = separatorIndex >= 0 ? normalized.substring(separatorIndex + 1) : normalized;
        return sanitizeAutoBackupFileName(fileName);
    }

    private void sortAutoBackupEntries(ArrayList<BackupEntry> entries) {
        Collections.sort(
            entries,
            (left, right) ->
                right.modifiedAt == left.modifiedAt
                    ? String.valueOf(right.fileName).compareTo(String.valueOf(left.fileName))
                    : Long.compare(right.modifiedAt, left.modifiedAt)
        );
    }

    private JSONObject readAutoBackupIndexEnvelope(Context context) {
        try {
            String raw = "";
            Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
            if (treeUri != null) {
                Uri indexUri = ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    getAutoBackupIndexRelativePath(),
                    false,
                    false,
                    "application/json"
                );
                if (indexUri == null) {
                    return new JSONObject();
                }
                raw = readTextFromUri(context, indexUri).trim();
            } else {
                File indexFile = getAutoBackupIndexFile(context);
                if (!indexFile.exists()) {
                    return new JSONObject();
                }
                raw = readTextFromFile(indexFile).trim();
            }
            return TextUtils.isEmpty(raw) ? new JSONObject() : new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private void writeAutoBackupIndexEntries(Context context, ArrayList<BackupEntry> entries)
        throws Exception {
        JSONArray payloadEntries = new JSONArray();
        HashSet<String> seenNames = new HashSet<>();
        ArrayList<BackupEntry> normalizedEntries = entries == null
            ? new ArrayList<>()
            : new ArrayList<>(entries);
        sortAutoBackupEntries(normalizedEntries);
        for (BackupEntry entry : normalizedEntries) {
            String fileName = entry == null ? "" : sanitizeAutoBackupFileName(entry.fileName);
            if (TextUtils.isEmpty(fileName) || seenNames.contains(fileName)) {
                continue;
            }
            seenNames.add(fileName);
            payloadEntries.put(
                new JSONObject()
                    .put("fileName", fileName)
                    .put("size", Math.max(0L, entry.size))
                    .put("modifiedAt", Math.max(0L, entry.modifiedAt))
            );
        }
        JSONObject envelope =
            new JSONObject()
                .put("version", AUTO_BACKUP_INDEX_VERSION)
                .put("updatedAt", isoNow())
                .put("entries", payloadEntries);
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (treeUri != null) {
            Uri indexUri = ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                getAutoBackupIndexRelativePath(),
                true,
                false,
                "application/json"
            );
            if (indexUri == null) {
                throw new Exception("无法写入自动备份索引。");
            }
            writeTextToUri(context, indexUri, envelope.toString(2));
            return;
        }
        File indexFile = getAutoBackupIndexFile(context);
        File parent = indexFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        writeTextToFile(indexFile, envelope.toString(2));
    }

    private BackupEntry resolveIndexedBackupEntry(
        Context context,
        String storedFileName,
        long storedSize,
        long storedModifiedAt
    ) {
        String fileName = sanitizeAutoBackupFileName(storedFileName);
        if (context == null || TextUtils.isEmpty(fileName)) {
            return null;
        }
        if (ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null) {
            Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
            Uri backupUri = ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                AUTO_BACKUP_DIRECTORY_NAME + "/" + fileName,
                false,
                false,
                "application/zip"
            );
            if (backupUri == null) {
                return null;
            }
            File backupDirectory = resolveCustomAutoBackupDirectoryFile(context);
            String backupPath = backupDirectory == null
                ? backupUri.toString()
                : new File(backupDirectory, fileName).getAbsolutePath();
            return queryAutoBackupEntryFromUri(
                context,
                backupUri,
                fileName,
                backupPath,
                storedSize,
                storedModifiedAt
            );
        }

        File targetFile = new File(getLocalAutoBackupDirectory(context), fileName);
        if (!targetFile.exists() || !targetFile.isFile()) {
            return null;
        }
        return new BackupEntry(
            fileName,
            targetFile.getAbsolutePath(),
            null,
            Math.max(0L, targetFile.length()),
            Math.max(
                0L,
                targetFile.lastModified() > 0L ? targetFile.lastModified() : storedModifiedAt
            )
        );
    }

    private BackupEntry queryAutoBackupEntryFromUri(
        Context context,
        Uri uri,
        String fallbackFileName,
        String fallbackPath,
        long fallbackSize,
        long fallbackModifiedAt
    ) {
        if (context == null || uri == null) {
            return null;
        }
        Cursor cursor = null;
        String fileName = sanitizeAutoBackupFileName(fallbackFileName);
        long size = Math.max(0L, fallbackSize);
        long modifiedAt = Math.max(0L, fallbackModifiedAt);
        try {
            cursor = context.getContentResolver().query(
                uri,
                new String[] {
                    OpenableColumns.DISPLAY_NAME,
                    OpenableColumns.SIZE,
                    Document.COLUMN_LAST_MODIFIED,
                },
                null,
                null,
                null
            );
            if (cursor != null && cursor.moveToFirst()) {
                String queriedName = cursor.isNull(0) ? "" : cursor.getString(0);
                long queriedSize = cursor.isNull(1) ? size : cursor.getLong(1);
                long queriedModifiedAt = cursor.isNull(2) ? modifiedAt : cursor.getLong(2);
                String normalizedName = sanitizeAutoBackupFileName(queriedName);
                if (!TextUtils.isEmpty(normalizedName)) {
                    fileName = normalizedName;
                }
                size = Math.max(0L, queriedSize);
                modifiedAt = Math.max(0L, queriedModifiedAt);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        if (TextUtils.isEmpty(fileName)) {
            return null;
        }
        return new BackupEntry(fileName, fallbackPath, uri, size, modifiedAt);
    }

    private ArrayList<BackupEntry> scanLocalAutoBackupEntriesForIndex(Context context) {
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
            String fileName = sanitizeAutoBackupFileName(file.getName());
            if (TextUtils.isEmpty(fileName)) {
                continue;
            }
            entries.add(
                new BackupEntry(
                    fileName,
                    file.getAbsolutePath(),
                    null,
                    Math.max(0L, file.length()),
                    Math.max(0L, file.lastModified())
                )
            );
        }
        sortAutoBackupEntries(entries);
        return entries;
    }

    private ArrayList<BackupEntry> scanCachedDirectoryAutoBackupEntriesForIndex(Context context) {
        ArrayList<BackupEntry> entries = new ArrayList<>();
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (context == null || treeUri == null) {
            return entries;
        }
        JSONObject cache = readRuntimeCacheJson(getDirectoryDocumentUriCacheFile(context));
        String prefix = treeUri.toString() + "|" + AUTO_BACKUP_DIRECTORY_NAME + "/";
        HashSet<String> seenNames = new HashSet<>();
        java.util.Iterator<String> iterator = cache.keys();
        while (iterator.hasNext()) {
            String key = iterator.next();
            if (TextUtils.isEmpty(key) || !key.startsWith(prefix)) {
                continue;
            }
            String relativePath = key.substring(treeUri.toString().length() + 1);
            String fileName = extractAutoBackupFileName(relativePath);
            if (TextUtils.isEmpty(fileName) || seenNames.contains(fileName)) {
                continue;
            }
            BackupEntry resolvedEntry = resolveIndexedBackupEntry(context, fileName, 0L, 0L);
            if (resolvedEntry == null) {
                continue;
            }
            seenNames.add(fileName);
            entries.add(resolvedEntry);
        }
        sortAutoBackupEntries(entries);
        return entries;
    }

    private ArrayList<BackupEntry> loadIndexedAutoBackupEntries(Context context) {
        ArrayList<BackupEntry> entries = new ArrayList<>();
        HashSet<String> seenNames = new HashSet<>();
        boolean changed = false;
        JSONArray storedEntries = readAutoBackupIndexEnvelope(context).optJSONArray("entries");
        if (storedEntries != null) {
            for (int index = 0; index < storedEntries.length(); index += 1) {
                JSONObject item = storedEntries.optJSONObject(index);
                if (item == null) {
                    changed = true;
                    continue;
                }
                String fileName = sanitizeAutoBackupFileName(item.optString("fileName", ""));
                if (TextUtils.isEmpty(fileName) || seenNames.contains(fileName)) {
                    changed = true;
                    continue;
                }
                BackupEntry resolvedEntry =
                    resolveIndexedBackupEntry(
                        context,
                        fileName,
                        Math.max(0L, item.optLong("size", 0L)),
                        Math.max(0L, item.optLong("modifiedAt", 0L))
                    );
                if (resolvedEntry == null) {
                    changed = true;
                    continue;
                }
                entries.add(resolvedEntry);
                seenNames.add(fileName);
                if (
                    resolvedEntry.size != Math.max(0L, item.optLong("size", 0L))
                        || resolvedEntry.modifiedAt
                            != Math.max(0L, item.optLong("modifiedAt", 0L))
                ) {
                    changed = true;
                }
            }
        }

        ArrayList<BackupEntry> discoveredEntries =
            ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null
                ? scanCachedDirectoryAutoBackupEntriesForIndex(context)
                : scanLocalAutoBackupEntriesForIndex(context);
        for (BackupEntry entry : discoveredEntries) {
            String fileName = entry == null ? "" : sanitizeAutoBackupFileName(entry.fileName);
            if (TextUtils.isEmpty(fileName) || seenNames.contains(fileName)) {
                continue;
            }
            seenNames.add(fileName);
            entries.add(entry);
            changed = true;
        }

        sortAutoBackupEntries(entries);
        if (changed) {
            try {
                writeAutoBackupIndexEntries(context, entries);
            } catch (Exception error) {
                Log.w(TAG, "[auto-backup-index-write-failed]", error);
            }
        }
        return entries;
    }

    private void upsertAutoBackupIndexEntry(Context context, BackupEntry targetEntry) throws Exception {
        ArrayList<BackupEntry> entries = loadIndexedAutoBackupEntries(context);
        String fileName = targetEntry == null ? "" : sanitizeAutoBackupFileName(targetEntry.fileName);
        ArrayList<BackupEntry> nextEntries = new ArrayList<>();
        for (BackupEntry entry : entries) {
            if (entry == null) {
                continue;
            }
            if (!TextUtils.isEmpty(fileName) && fileName.equals(entry.fileName)) {
                continue;
            }
            nextEntries.add(entry);
        }
        if (targetEntry != null && !TextUtils.isEmpty(fileName)) {
            nextEntries.add(targetEntry);
        }
        sortAutoBackupEntries(nextEntries);
        writeAutoBackupIndexEntries(context, nextEntries);
    }

    private Uri resolveAutoBackupDirectoryUri(Context context, boolean createIfMissing) {
        Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (treeUri == null) {
            return null;
        }
        ControlerWidgetDataStore.removeDirectoryDocumentUriCacheEntry(
            context,
            treeUri,
            AUTO_BACKUP_DIRECTORY_NAME
        );
        return ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
            context,
            treeUri,
            AUTO_BACKUP_DIRECTORY_NAME,
            createIfMissing,
            true,
            Document.MIME_TYPE_DIR
        );
    }

    private String getAutoBackupDirectoryDisplay(Context context) {
        File backupDirectoryFile = resolveCustomAutoBackupDirectoryFile(context);
        if (backupDirectoryFile != null) {
            return backupDirectoryFile.getAbsolutePath();
        }
        Uri backupDirectoryUri = resolveAutoBackupDirectoryUri(context, false);
        if (backupDirectoryUri != null) {
            return backupDirectoryUri.toString();
        }
        Uri directoryUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
        if (directoryUri != null) {
            return directoryUri.toString() + "/" + AUTO_BACKUP_DIRECTORY_NAME;
        }
        return getLocalAutoBackupDirectory(context).getAbsolutePath();
    }

    private String getAutoBackupDirectoryKind(Context context) {
        if (resolveCustomAutoBackupDirectoryFile(context) != null) {
            return "file-path";
        }
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

    private void deleteBackupEntry(BackupEntry entry) {
        if (entry == null) {
            return;
        }
        try {
            if (entry.uri != null) {
                if ("media".equals(entry.uri.getAuthority())) {
                    getReactApplicationContext().getContentResolver().delete(entry.uri, null, null);
                } else {
                    DocumentsContract.deleteDocument(
                        getReactApplicationContext().getContentResolver(),
                        entry.uri
                    );
                }
                return;
            }
            if (!TextUtils.isEmpty(entry.path)) {
                new File(entry.path).delete();
            }
        } catch (Exception ignored) {
        }
    }

    private void pruneAutoBackups(Context context, int maxBackups) {
        ArrayList<BackupEntry> entries = loadIndexedAutoBackupEntries(context);
        int keepCount = Math.max(1, maxBackups);
        boolean changed = false;
        for (int index = keepCount; index < entries.size(); index += 1) {
            BackupEntry entry = entries.get(index);
            deleteBackupEntry(entry);
            if (
                resolveIndexedBackupEntry(context, entry == null ? "" : entry.fileName, 0L, 0L)
                    == null
            ) {
                changed = true;
            }
        }
        if (!changed) {
            return;
        }
        ArrayList<BackupEntry> survivingEntries = new ArrayList<>();
        for (BackupEntry entry : entries) {
            BackupEntry resolvedEntry =
                resolveIndexedBackupEntry(context, entry == null ? "" : entry.fileName, 0L, 0L);
            if (resolvedEntry != null) {
                survivingEntries.add(resolvedEntry);
            }
        }
        try {
            writeAutoBackupIndexEntries(context, survivingEntries);
        } catch (Exception error) {
            Log.w(TAG, "[auto-backup-index-prune-write-failed]", error);
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
        ArrayList<BackupEntry> entries = loadIndexedAutoBackupEntries(context);
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
            writeCurrentBundleSnapshotToDirectory(context, bundleDirectory);
            zipDirectoryContents(bundleDirectory, zipFile);
            validateBundleZipImportable(zipFile);

            String backupFileName = "order-auto-backup-" + buildAutoBackupTimestampTag() + ".zip";
            if (ControlerWidgetDataStore.getCustomStorageDirectoryUri(context) != null) {
                Uri treeUri = ControlerWidgetDataStore.getCustomStorageDirectoryUri(context);
                String backupRelativePath = AUTO_BACKUP_DIRECTORY_NAME + "/" + backupFileName;
                ControlerWidgetDataStore.removeDirectoryDocumentUriCacheEntry(
                    context,
                    treeUri,
                    AUTO_BACKUP_DIRECTORY_NAME
                );
                ControlerWidgetDataStore.removeDirectoryDocumentUriCacheEntry(
                    context,
                    treeUri,
                    backupRelativePath
                );
                Uri backupUri = ControlerWidgetDataStore.resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    backupRelativePath,
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

            BackupEntry createdEntry =
                resolveIndexedBackupEntry(
                    context,
                    backupFileName,
                    Math.max(0L, zipFile.length()),
                    System.currentTimeMillis()
                );
            if (createdEntry == null) {
                throw new Exception("备份文件写入成功，但索引校验失败。");
            }
            upsertAutoBackupIndexEntry(context, createdEntry);
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
        ArrayList<BackupEntry> entries = loadIndexedAutoBackupEntries(getReactApplicationContext());
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

    private void schedulePreciseStorageStatusRefresh() {
        synchronized (storageStatusRefreshLock) {
            if (pendingPreciseStorageStatusRefresh) {
                return;
            }
            pendingPreciseStorageStatusRefresh = true;
        }

        storageSideEffectExecutor.execute(() -> {
            try {
                ControlerWidgetDataStore.refreshPreciseStorageLocation(
                    getReactApplicationContext()
                );
            } catch (Exception error) {
                error.printStackTrace();
            } finally {
                synchronized (storageStatusRefreshLock) {
                    pendingPreciseStorageStatusRefresh = false;
                }
            }
        });
    }

    private int countManifestSectionItems(JSONObject manifest, String sectionKey) {
        JSONObject section =
            manifest == null || manifest.optJSONObject("sections") == null
                ? null
                : manifest.optJSONObject("sections").optJSONObject(sectionKey);
        JSONArray partitions = section == null ? null : section.optJSONArray("partitions");
        int total = 0;
        if (partitions == null) {
            return total;
        }
        for (int index = 0; index < partitions.length(); index += 1) {
            JSONObject partition = partitions.optJSONObject(index);
            if (partition != null) {
                total += Math.max(0, partition.optInt("count", 0));
            }
        }
        return total;
    }

    private JSONObject buildResponsiveStorageStatus(JSONObject root, String switchAction)
        throws Exception {
        JSONObject status = buildResponsiveStorageStatus(root);
        if (!TextUtils.isEmpty(switchAction)) {
            status.put("switchAction", switchAction);
        }
        return status;
    }

    private JSONObject buildResponsiveStorageStatus(JSONObject root) throws Exception {
        JSONObject status = buildStorageStatus(root);
        if (status.optBoolean("sizePending", false)) {
            schedulePreciseStorageStatusRefresh();
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
        JSONObject manifest =
            ControlerWidgetDataStore.getStorageManifest(getReactApplicationContext());
        JSONObject core =
            root != null
                ? root
                : ControlerWidgetDataStore.getStorageCoreState(getReactApplicationContext());
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
        long serializedSize =
            root == null
                ? 0L
                : root.toString().getBytes(StandardCharsets.UTF_8).length;
        long size = storageLocation.size > 0L ? storageLocation.size : serializedSize;
        String exposedStorageMode =
            ControlerWidgetDataStore.BUNDLE_MANIFEST_FILE_NAME.equals(storageLocation.syncFileName)
                ? ControlerWidgetDataStore.BUNDLE_MODE
                : storageLocation.storageMode;

        JSONObject status = new JSONObject();
        JSONArray projects =
            root != null
                ? root.optJSONArray("projects")
                : core == null
                    ? null
                    : core.optJSONArray("projects");
        JSONArray records = root == null ? null : root.optJSONArray("records");
        status.put("projects", projects == null ? 0 : projects.length());
        status.put(
            "records",
            records == null ? countManifestSectionItems(manifest, "records") : records.length()
        );
        status.put("size", size);
        status.put("sizePending", storageLocation.sizePending);
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
            core == null || core.optJSONObject("syncMeta") == null
                ? JSONObject.NULL
                : core.optJSONObject("syncMeta")
        );
        status.put("recoveryState", ControlerWidgetDataStore.getStorageRecoveryState());
        status.put(
            "recoveryMessage",
            TextUtils.isEmpty(ControlerWidgetDataStore.getStorageRecoveryMessage())
                ? ""
                : ControlerWidgetDataStore.getStorageRecoveryMessage()
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
