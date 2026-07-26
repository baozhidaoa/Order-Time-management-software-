package com.controlerapp.widgets;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.AtomicFile;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ControlerWidgetDataStore {
    private static final String TAG = "ControlerDataStore";
    private static final String TRACE_PREFIX = "[storage.trace]";
    private static final Pattern DAY_PATTERN = Pattern.compile("(\\d+)天");
    private static final Pattern HOUR_PATTERN = Pattern.compile("(\\d+)小时");
    private static final Pattern MINUTE_PATTERN = Pattern.compile("(\\d+)分钟");
    private static final Pattern DURATION_HOUR_PATTERN =
        Pattern.compile("(\\d+)\\s*(?:小时|h(?:ours?)?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DURATION_MINUTE_PATTERN =
        Pattern.compile("(\\d+)\\s*(?:分钟|min(?:ute)?s?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern LESS_THAN_ONE_MINUTE_PATTERN =
        Pattern.compile(
            "(?:小于\\s*1\\s*(?:分钟|min)|less\\s+than\\s+1\\s*min|<\\s*1\\s*(?:分钟|min))",
            Pattern.CASE_INSENSITIVE
        );
    private static final String STORAGE_PREFS = "controler_storage_prefs";
    private static final String KEY_STORAGE_MODE = "storage_mode";
    private static final String KEY_CUSTOM_STORAGE_URI = "custom_storage_uri";
    private static final String KEY_CUSTOM_STORAGE_NAME = "custom_storage_name";
    private static final String KEY_CUSTOM_STORAGE_DIRECTORY_URI = "custom_storage_directory_uri";
    private static final String KEY_CUSTOM_STORAGE_DIRECTORY_NAME = "custom_storage_directory_name";
    private static final String MODE_DEFAULT = "default";
    private static final String MODE_FILE = "file";
    private static final String MODE_DIRECTORY = "directory";
    public static final int BUNDLE_FORMAT_VERSION = 1;
    public static final String BUNDLE_MODE = "directory-bundle";
    public static final String PERIOD_UNIT = "month";
    public static final String UNDATED_PERIOD_ID = "undated";
    public static final String BUNDLE_MANIFEST_FILE_NAME = "bundle-manifest.json";
    public static final String BUNDLE_CORE_FILE_NAME = "core.json";
    public static final String BUNDLE_RECURRING_PLANS_FILE_NAME = "plans-recurring.json";
    public static final String DIARY_MEDIA_DIR_NAME = "diary-media";
    private static final String[] PARTITIONED_SECTION_KEYS = new String[] {
        "records",
        "diaryEntries",
        "dailyCheckins",
        "checkins",
        "plans"
    };
    private static final String STORAGE_RECOVERY_STATE_OK = "ok";
    private static final String STORAGE_RECOVERY_STATE_REPAIRED = "repaired";
    private static final String STORAGE_RECOVERY_STATE_NEEDS_RECOVERY = "needs-recovery";
    public static final String READ_STATE_VALID = "VALID";
    public static final String READ_STATE_NOT_FOUND = "NOT_FOUND";
    public static final String READ_STATE_UNREADABLE = "UNREADABLE";
    public static final String READ_STATE_CORRUPTED = "CORRUPTED";
    private static final String DIRECTORY_DOCUMENT_URI_CACHE_FILE_NAME =
        "directory-document-uri-cache.json";
    private static final int[] DIRECTORY_CREATE_RESOLVE_RETRY_DELAYS_MS =
        new int[] { 0, 48, 128, 256, 512 };
    private static final String[] DIRECTORY_DOCUMENT_OUTPUT_STREAM_MODES =
        new String[] { "rwt", "wt", "w" };
    private static final String BUNDLE_SIZE_CACHE_FILE_NAME = "bundle-size-cache.json";
    private static final String STORAGE_BINDING_FILE_NAME = "storage-binding.json";
    private static final String STORAGE_BINDING_KIND_RESET = "reset";
    private static final String STORAGE_BINDING_KIND_FILE = "file";
    private static final String STORAGE_BINDING_KIND_DIRECTORY = "directory";
    private static final String STORAGE_TRANSACTION_DIRECTORY = "storage-transactions";
    private static final String STORAGE_TRANSACTION_FILE = "rollback.json";
    private static final String LEGACY_STORAGE_TRANSACTION_FILE = "pending.json";
    private static final String SINGLE_FILE_TRANSACTION_TARGET = "@single-file";
    private static final String PAGE_BOOTSTRAP_SNAPSHOT_DIRECTORY =
        "page-bootstrap-snapshots";
    private static final int PROJECT_DURATION_CACHE_VERSION = 3;
    private static final String PROJECT_DURATION_CACHE_VERSION_KEY = "durationCacheVersion";
    private static final String PROJECT_DIRECT_DURATION_KEY = "cachedDirectDurationMs";
    private static final String PROJECT_TOTAL_DURATION_KEY = "cachedTotalDurationMs";
    private static volatile String storageRecoveryState = STORAGE_RECOVERY_STATE_OK;
    private static volatile String storageRecoveryMessage = "";
    private static volatile String storageReadState = READ_STATE_NOT_FOUND;
    private static volatile String storageReadMessage = "";
    private static volatile long bundleStorageReadyVerifiedAt = 0L;
    private static volatile String bundleStorageReadyCacheKey = "";
    private static volatile long storageBindingResolvedAt = 0L;
    private static final ThreadLocal<Boolean> STORAGE_TRANSACTION_ACTIVE =
        new ThreadLocal<Boolean>() {
            @Override
            protected Boolean initialValue() {
                return Boolean.FALSE;
            }
        };
    private static final int PROCESS_PAGE_BOOTSTRAP_CACHE_LIMIT = 6;
    private static final int DISK_PAGE_BOOTSTRAP_CACHE_LIMIT = 24;
    private static final int PROCESS_PARTITION_CACHE_LIMIT = 12;
    private static final long DISK_PAGE_BOOTSTRAP_MAX_AGE_MS = 14L * 24L * 60L * 60L * 1000L;
    private static final LinkedHashMap<String, JSONObject> PROCESS_PAGE_BOOTSTRAP_CACHE =
        new LinkedHashMap<String, JSONObject>(PROCESS_PAGE_BOOTSTRAP_CACHE_LIMIT + 1, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, JSONObject> eldest) {
                return size() > PROCESS_PAGE_BOOTSTRAP_CACHE_LIMIT;
            }
        };
    private static final LinkedHashMap<String, JSONObject> PROCESS_PARTITION_CACHE =
        new LinkedHashMap<String, JSONObject>(PROCESS_PARTITION_CACHE_LIMIT + 1, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, JSONObject> eldest) {
                return size() > PROCESS_PARTITION_CACHE_LIMIT;
            }
        };
    private static String processCoreFingerprint = "";
    private static JSONObject processCoreState;
    private static StorageVersion processBootstrapVersion;
    private static long processBootstrapVersionAt;

    private ControlerWidgetDataStore() {}

    private static final class StorageReadException extends Exception {
        final String readState;

        StorageReadException(String readState, String message, Throwable cause) {
            super(message, cause);
            this.readState = readState;
        }
    }

    private static void invalidateProcessStorageCaches() {
        processCoreFingerprint = "";
        processCoreState = null;
        processBootstrapVersion = null;
        processBootstrapVersionAt = 0L;
        PROCESS_PAGE_BOOTSTRAP_CACHE.clear();
        PROCESS_PARTITION_CACHE.clear();
    }

    private static void logStorageTrace(String operation, String stage, long startedAt, String extra) {
        long durationMs =
            startedAt > 0L ? Math.max(0L, SystemClock.elapsedRealtime() - startedAt) : 0L;
        Log.i(
            TAG,
            TRACE_PREFIX
                + " op="
                + safeText(operation)
                + " stage="
                + safeText(stage)
                + " durationMs="
                + durationMs
                + " thread="
                + safeText(Thread.currentThread().getName())
                + " "
                + safeText(extra)
        );
    }

    private static String summarizeScope(JSONObject scope) {
        if (scope == null) {
            return "scope=null";
        }
        return "startDate="
            + safeText(firstNonEmpty(scope.optString("startDate", ""), scope.optString("start", "")))
            + " endDate="
            + safeText(firstNonEmpty(scope.optString("endDate", ""), scope.optString("end", "")))
            + " all="
            + scope.optBoolean("all", false)
            + " periodCount="
            + (scope.optJSONArray("periodIds") == null ? 0 : scope.optJSONArray("periodIds").length());
    }

    public static final class ProjectInfo {
        public String id = "";
        public String name = "";
        public String color = "#79af85";
    }

    public static final class RecordInfo {
        public String timestamp = "";
        public String startTime = "";
        public String endTime = "";
        public String dateText = "";
        public int hour = 0;
        public String name = "";
        public String spendtime = "";
        public int minutes = 0;
        public String projectId = "";
    }

    public static final class TodoInfo {
        public String id = "";
        public String title = "";
        public String dueDate = "";
        public String startDate = "";
        public String endDate = "";
        public String startTime = "";
        public String endTime = "";
        public String repeatType = "none";
        public List<Integer> repeatWeekdays = new ArrayList<>();
        public boolean completed = false;
        public String color = "#ed8936";
        public String priority = "medium";
        public String createdAt = "";
    }

    private static final class CorePayloadSanitizeResult {
        final JSONObject payload;
        final ArrayList<String> removedSections;

        CorePayloadSanitizeResult(JSONObject payload, ArrayList<String> removedSections) {
            this.payload = payload == null ? new JSONObject() : payload;
            this.removedSections =
                removedSections == null ? new ArrayList<String>() : removedSections;
        }

        boolean repaired() {
            return !removedSections.isEmpty();
        }
    }

    public static final class CheckinItemInfo {
        public String id = "";
        public String title = "";
        public String startDate = "";
        public String endDate = "";
        public String startTime = "";
        public String endTime = "";
        public String repeatType = "daily";
        public List<Integer> repeatWeekdays = new ArrayList<>();
        public List<Integer> repeatMonthDays = new ArrayList<>();
        public String color = "#4299e1";
        public String status = "in_progress";
        public String deletedAt = "";
    }

    public static final class DailyCheckinInfo {
        public String itemId = "";
        public String date = "";
        public boolean checked = false;
    }

    public static final class PlanInfo {
        public String name = "";
        public String date = "";
        public String endDate = "";
        public String startTime = "";
        public String endTime = "";
        public String color = "#79af85";
        public String repeat = "none";
        public List<Integer> repeatDays = new ArrayList<>();
        public List<String> excludedDates = new ArrayList<>();
    }

    public static final class GoalInfo {
        public String id = "";
        public String title = "";
        public String description = "";
        public String priority = "medium";
        public boolean isCompleted = false;
        public String createdAt = "";
    }

    public static final class DiaryEntryInfo {
        public String id = "";
        public String date = "";
        public String title = "";
        public String content = "";
        public String updatedAt = "";
    }

    public static final class TimerSessionInfo {
        public int ptn = 0;
        public String fpt = "";
        public String spt = "";
        public String lastspt = "";
        public String selectedProject = "";
        public String nextProject = "";
        public String lastEnteredProjectName = "";
    }

    public static final class State {
        public final List<ProjectInfo> projects = new ArrayList<>();
        public final List<RecordInfo> records = new ArrayList<>();
        public final List<TodoInfo> todos = new ArrayList<>();
        public final List<CheckinItemInfo> checkinItems = new ArrayList<>();
        public final List<DailyCheckinInfo> dailyCheckins = new ArrayList<>();
        public final List<PlanInfo> plans = new ArrayList<>();
        public final List<DiaryEntryInfo> diaryEntries = new ArrayList<>();
        public final Map<Integer, Integer> goalCountsByMonth = new HashMap<>();
        public final Map<Integer, List<GoalInfo>> goalsByMonth = new HashMap<>();
        public final List<GoalInfo> annualGoals = new ArrayList<>();
        public final TimerSessionInfo timerSession = new TimerSessionInfo();
        public String todoSortPreference = "dueDate";

        public Map<String, ProjectInfo> projectMap() {
            Map<String, ProjectInfo> map = new HashMap<>();
            for (ProjectInfo project : projects) {
                map.put(project.id, project);
            }
            return map;
        }
    }

    public static final class StorageLocation {
        public String storagePath = "";
        public String storageDirectory = "";
        public String syncFileName = "controler-data.json";
        public String actualUri = "";
        public boolean isCustomPath = false;
        public String storageMode = MODE_DEFAULT;
        public long size = 0L;
        public long modifiedAt = 0L;
        public boolean sizePending = false;
    }

    public static final class StorageVersion {
        public String storagePath = "";
        public String actualUri = "";
        public String storageMode = MODE_DEFAULT;
        public long size = 0L;
        public long modifiedAt = 0L;
        public String fingerprint = "";
        public boolean supportsModifiedAt = false;
        public boolean fallbackHashUsed = false;
    }

    private static final class StoredStorageBinding {
        public String kind = "";
        public Uri uri = null;
        public String displayName = "";
        public long updatedAt = 0L;
    }

    private static final class StorageBindingCandidate {
        public Uri uri = null;
        public String displayName = "";
        public long persistedAt = 0L;
        public int score = Integer.MIN_VALUE;
    }

    private static final class SectionDateRange {
        public final String lowerDate;
        public final String upperDate;
        public final long lowerTimeMs;
        public final long upperExclusiveTimeMs;

        private SectionDateRange(
            String lowerDate,
            String upperDate,
            long lowerTimeMs,
            long upperExclusiveTimeMs
        ) {
            this.lowerDate = lowerDate;
            this.upperDate = upperDate;
            this.lowerTimeMs = lowerTimeMs;
            this.upperExclusiveTimeMs = upperExclusiveTimeMs;
        }
    }

    private static final class ProjectDurationIndexEntry {
        public final int index;
        public final JSONObject project;

        private ProjectDurationIndexEntry(int index, JSONObject project) {
            this.index = index;
            this.project = project;
        }
    }

    private static final class BundleArtifactInspection {
        public boolean manifestExists = false;
        public boolean manifestInvalid = false;
        public boolean coreExists = false;
        public boolean recurringExists = false;
        public boolean legacyExists = false;
        public final ArrayList<String> partitionFiles = new ArrayList<>();
        public JSONObject manifest = null;

        public boolean hasBundleArtifacts() {
            return coreExists || recurringExists || !partitionFiles.isEmpty();
        }

        public boolean hasAnyArtifacts() {
            return manifestExists || legacyExists || hasBundleArtifacts();
        }
    }

    private static final class ProjectDurationContext {
        public final ArrayList<JSONObject> projects = new ArrayList<>();
        public final Map<String, ProjectDurationIndexEntry> byId = new HashMap<>();
        public final Map<String, ProjectDurationIndexEntry> byName = new HashMap<>();
        public final Map<String, ArrayList<String>> childrenByParent = new HashMap<>();
        public final ArrayList<String> roots = new ArrayList<>();
    }

    public static synchronized State load(Context context) {
        try {
            JSONObject root = loadRoot(context);
            return loadFromRoot(root);
        } catch (Exception error) {
            error.printStackTrace();
            return new State();
        }
    }

    public static State loadFromRoot(JSONObject root) {
        State state = new State();
        if (root == null) {
            return state;
        }

        try {
            parseProjects(root.optJSONArray("projects"), state);
            parseRecords(root.optJSONArray("records"), state);
            parseTodos(root.optJSONArray("todos"), state);
            parseCheckinItems(root.optJSONArray("checkinItems"), state);
            parseDailyCheckins(root.optJSONArray("dailyCheckins"), state);
            parsePlans(root.optJSONArray("plans"), state);
            parseDiaryEntries(root.optJSONArray("diaryEntries"), state);
            parseYearGoals(root.optJSONObject("yearlyGoals"), state);
            parseTimerSession(root.optJSONObject("timerSessionState"), state);
            state.todoSortPreference =
                normalizeTodoSortPreference(root.optString("todoSortPreference", "dueDate"));
        } catch (Exception error) {
            error.printStackTrace();
        }
        return state;
    }

    public static synchronized JSONObject loadRoot(Context context) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace(
            "loadRoot",
            "start",
            startedAt,
            "bundleMode=" + usesDirectoryBundleStorage(context)
        );
        try {
            return loadRootChecked(context, true);
        } catch (Exception error) {
            return buildReadErrorRoot();
        } finally {
            logStorageTrace("loadRoot", "finish", startedAt, "");
        }
    }

    public static synchronized JSONObject loadRootForWidgets(Context context) {
        try {
            return loadRootChecked(context, false);
        } catch (Exception error) {
            return buildReadErrorRoot();
        }
    }

    public static synchronized JSONObject loadRootForWidgetKinds(
        Context context,
        Set<String> requestedKinds
    ) {
        if (context == null) {
            return new JSONObject();
        }
        try {
            if (!usesDirectoryBundleStorage(context)) {
                return loadRootForWidgets(context);
            }

            LinkedHashSet<String> normalizedKinds = new LinkedHashSet<>();
            if (requestedKinds != null) {
                for (String kind : requestedKinds) {
                    String normalizedKind = ControlerWidgetKinds.normalize(kind);
                    if (!TextUtils.isEmpty(normalizedKind)) {
                        normalizedKinds.add(normalizedKind);
                    }
                }
            }
            if (normalizedKinds.isEmpty()) {
                return loadRootForWidgets(context);
            }

            JSONObject core = getStorageCoreState(context);
            JSONObject root = new JSONObject();
            copyWidgetCoreFields(root, core);

            boolean needsWindowedRecords =
                normalizedKinds.contains(ControlerWidgetKinds.DAY_PIE)
                    || normalizedKinds.contains(ControlerWidgetKinds.WEEK_GRID);
            boolean needsRecentRecords =
                normalizedKinds.contains(ControlerWidgetKinds.START_TIMER);
            if (needsWindowedRecords || needsRecentRecords) {
                // Widget render sources are shared across all requested kinds in a batch,
                // so records must cover the widest active widget window instead of the
                // first matching kind.
                JSONObject recordScope =
                    normalizedKinds.contains(ControlerWidgetKinds.WEEK_GRID)
                        ? buildRelativeDateRangeScope(-6, 0)
                        : normalizedKinds.contains(ControlerWidgetKinds.DAY_PIE)
                            ? buildCurrentDayScope()
                            : buildDefaultRecordBootstrapScope();
                JSONObject recordRange = loadStorageSectionRange(
                    context,
                    "records",
                    recordScope
                );
                root.put("records", cloneJsonArray(recordRange.optJSONArray("items")));
            }

            if (normalizedKinds.contains(ControlerWidgetKinds.CHECKINS)) {
                JSONObject dailyCheckinRange = loadStorageSectionRange(
                    context,
                    "dailyCheckins",
                    buildCurrentDayScope()
                );
                root.put(
                    "dailyCheckins",
                    cloneJsonArray(dailyCheckinRange.optJSONArray("items"))
                );
            }

            boolean needsPlanState =
                normalizedKinds.contains(ControlerWidgetKinds.WEEK_VIEW)
                    || normalizedKinds.contains(ControlerWidgetKinds.YEAR_VIEW);
            if (needsPlanState) {
                JSONObject planScope =
                    normalizedKinds.contains(ControlerWidgetKinds.WEEK_VIEW)
                        ? buildRelativeDateRangeScope(0, 32)
                        : buildCurrentMonthScope();
                if (normalizedKinds.contains(ControlerWidgetKinds.WEEK_VIEW)) {
                    try {
                        Log.i(
                            TAG,
                            "[widget.week-view-load] stage=start startDate="
                                + safeText(planScope.optString("startDate", ""))
                                + " endDate="
                                + safeText(planScope.optString("endDate", ""))
                        );
                    } catch (Exception ignored) {
                    }
                }
                JSONObject planRange = loadStorageSectionRange(
                    context,
                    "plans",
                    planScope
                );
                JSONArray mergedPlans = cloneJsonArray(planRange.optJSONArray("items"));
                JSONArray recurringPlans = cloneJsonArray(core.optJSONArray("recurringPlans"));
                for (int index = 0; index < recurringPlans.length(); index++) {
                    mergedPlans.put(cloneJsonValue(recurringPlans.opt(index)));
                }
                if (normalizedKinds.contains(ControlerWidgetKinds.WEEK_VIEW)) {
                    try {
                        JSONArray loadedOneTimePlans = planRange.optJSONArray("items");
                        Log.i(
                            TAG,
                            "[widget.week-view-load] stage=loaded oneTimePlanCount="
                                + (loadedOneTimePlans == null ? 0 : loadedOneTimePlans.length())
                                + " recurringPlanCount="
                                + recurringPlans.length()
                                + " loadedPeriodCount="
                                + (planRange.optJSONArray("periodIds") == null
                                    ? 0
                                    : planRange.optJSONArray("periodIds").length())
                        );
                    } catch (Exception ignored) {
                    }
                }
                root.put("plans", mergedPlans);
            }

            if (normalizedKinds.contains(ControlerWidgetKinds.WRITE_DIARY)) {
                JSONObject diaryRange = loadStorageSectionRange(
                    context,
                    "diaryEntries",
                    buildCurrentMonthScope()
                );
                root.put(
                    "diaryEntries",
                    cloneJsonArray(diaryRange.optJSONArray("items"))
                );
            }

            return root;
        } catch (Exception error) {
            return buildReadErrorRoot();
        }
    }

    private static void copyWidgetCoreFields(JSONObject target, JSONObject core) throws Exception {
        if (target == null || core == null) {
            return;
        }
        target.put(
            "customThemes",
            cloneJsonArray(core.optJSONArray("customThemes"))
        );
        target.put(
            "builtInThemeOverrides",
            cloneJsonObject(core.optJSONObject("builtInThemeOverrides"))
        );
        target.put(
            "selectedTheme",
            sanitizeJsonString(core.optString("selectedTheme", "default"))
        );
        target.put(
            "todoSortPreference",
            sanitizeJsonString(core.optString("todoSortPreference", "dueDate"))
        );
        target.put(
            "timerSessionState",
            cloneJsonObject(core.optJSONObject("timerSessionState"))
        );
        target.put("projects", cloneJsonArray(core.optJSONArray("projects")));
        target.put("todos", cloneJsonArray(core.optJSONArray("todos")));
        target.put(
            "checkinItems",
            cloneJsonArray(core.optJSONArray("checkinItems"))
        );
        target.put(
            "checkinHistorySummary",
            cloneJsonObject(core.optJSONObject("checkinHistorySummary"))
        );
        target.put(
            "yearlyGoals",
            cloneJsonObject(core.optJSONObject("yearlyGoals"))
        );
        target.put(
            "diaryCategories",
            cloneJsonArray(core.optJSONArray("diaryCategories"))
        );
    }

    public static synchronized JSONObject loadRootStrict(Context context) throws Exception {
        return loadRootChecked(context, true);
    }

    private static JSONObject loadRootChecked(Context context, boolean rebuildCaches)
        throws Exception {
        try {
            ensureBoundStorageReadable(context);
            recoverRollbackTransaction(context);
            if (usesDirectoryBundleStorage(context)) {
                BundleArtifactInspection inspection = inspectBundleArtifacts(context);
                if (!inspection.hasAnyArtifacts()) {
                    if (MODE_DEFAULT.equals(getStorageMode(context))) {
                        setStorageReadState(READ_STATE_NOT_FOUND, "默认存储尚未创建。");
                        return normalizeRoot(context, new JSONObject(), false, rebuildCaches);
                    }
                    throw new StorageReadException(
                        READ_STATE_NOT_FOUND,
                        "已绑定的存储目录中没有 bundle 数据。",
                        null
                    );
                }
                JSONObject root = loadBundleRoot(context, true, rebuildCaches);
                validateRootShape(root);
                setStorageReadState(READ_STATE_VALID, "");
                return root;
            }
            String raw = readStorageText(context);
            if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
                throw new StorageReadException(
                    READ_STATE_CORRUPTED,
                    "已绑定的同步 JSON 文件为空。",
                    null
                );
            }
            JSONObject parsedRoot = new JSONObject(raw.trim());
            validateRootShape(parsedRoot);
            setStorageReadState(READ_STATE_VALID, "");
            return normalizeRoot(context, parsedRoot, false, rebuildCaches);
        } catch (StorageReadException error) {
            failStorageRead(error.readState, error.getMessage());
            throw error;
        } catch (SecurityException error) {
            failStorageRead(READ_STATE_UNREADABLE, "存储授权已失效，无法读取数据。");
            throw new StorageReadException(
                READ_STATE_UNREADABLE,
                getStorageReadMessage(),
                error
            );
        } catch (org.json.JSONException error) {
            failStorageRead(READ_STATE_CORRUPTED, "存储 JSON 已损坏，无法安全读取。");
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                getStorageReadMessage(),
                error
            );
        } catch (Exception error) {
            String state = isUnreadableStorageError(error)
                ? READ_STATE_UNREADABLE
                : READ_STATE_CORRUPTED;
            String message = READ_STATE_UNREADABLE.equals(state)
                ? "存储不可读取或授权已失效。"
                : "bundle 文件缺失、损坏或与 manifest 不一致。";
            failStorageRead(state, message);
            throw new StorageReadException(state, message, error);
        }
    }

    private static void ensureBoundStorageReadable(Context context)
        throws StorageReadException {
        String mode = getStorageMode(context);
        Uri uri = MODE_FILE.equals(mode)
            ? getCustomStorageUri(context)
            : MODE_DIRECTORY.equals(mode)
                ? getCustomStorageDirectoryUri(context)
                : null;
        if (!MODE_FILE.equals(mode) && !MODE_DIRECTORY.equals(mode)) return;
        if (uri == null) {
            throw new StorageReadException(
                READ_STATE_NOT_FOUND,
                "已绑定的存储位置不存在。",
                null
            );
        }
        if (!hasPersistedUriAccess(context, uri)) {
            throw new StorageReadException(
                READ_STATE_UNREADABLE,
                "存储授权已失效，无法读取数据。",
                null
            );
        }
        if (!queryDocumentExists(context, resolveMetadataQueryUri(uri))) {
            throw new StorageReadException(
                READ_STATE_NOT_FOUND,
                "已绑定的存储文件或目录不存在。",
                null
            );
        }
    }

    private static boolean isUnreadableStorageError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SecurityException) return true;
            String message = safeText(current.getMessage()).toLowerCase(Locale.US);
            if (
                message.contains("permission")
                    || message.contains("denied")
                    || message.contains("授权")
                    || message.contains("不可用")
                    || message.contains("无法读取")
            ) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static void recordStorageReadFailure(
        Throwable error,
        String unreadableMessage,
        String corruptedMessage
    ) {
        if (error instanceof StorageReadException) {
            StorageReadException readError = (StorageReadException) error;
            failStorageRead(readError.readState, readError.getMessage());
            return;
        }
        if (isUnreadableStorageError(error)) {
            failStorageRead(READ_STATE_UNREADABLE, unreadableMessage);
        } else {
            failStorageRead(READ_STATE_CORRUPTED, corruptedMessage);
        }
    }

    private static JSONObject buildReadErrorRoot() {
        JSONObject result = new JSONObject();
        try {
            result.put("readState", getStorageReadState());
            result.put("readMessage", getStorageReadMessage());
            result.put("recoveryState", getStorageRecoveryState());
        } catch (Exception ignored) {}
        return result;
    }

    public static synchronized boolean saveRoot(Context context, JSONObject root) {
        boolean ownsTransaction = false;
        try {
            assertStorageWritable();
            if (usesDirectoryBundleStorage(context)) {
                loadRootChecked(context, false);
                JSONObject normalizedRoot = normalizeRoot(context, root, true);
                return writeBundleRoot(context, normalizedRoot);
            }
            loadRootChecked(context, false);
            JSONObject normalizedRoot = normalizeRoot(context, root, true);
            if (!STORAGE_TRANSACTION_ACTIVE.get()) {
                beginRollbackTransaction(
                    context,
                    Collections.singleton(SINGLE_FILE_TRANSACTION_TARGET)
                );
                STORAGE_TRANSACTION_ACTIVE.set(Boolean.TRUE);
                ownsTransaction = true;
            }
            OutputStream outputStream = openStorageOutputStream(context);
            if (outputStream == null) {
                return false;
            }
            try {
                outputStream.write(normalizedRoot.toString().getBytes(StandardCharsets.UTF_8));
                outputStream.flush();
            } finally {
                outputStream.close();
            }
            if (ownsTransaction) completeRollbackTransaction(context);
            invalidateProcessStorageCaches();
            return true;
        } catch (Exception error) {
            if (ownsTransaction) {
                try {
                    rollbackActiveTransaction(context, error);
                } catch (Exception rollbackError) {
                    rollbackError.printStackTrace();
                }
            }
            error.printStackTrace();
            return false;
        } finally {
            if (ownsTransaction) STORAGE_TRANSACTION_ACTIVE.set(Boolean.FALSE);
        }
    }

    public static synchronized boolean saveManagedRoot(Context context, JSONObject root) {
        try {
            if (!usesDirectoryBundleStorage(context)) {
                return saveRoot(context, root);
            }
            assertStorageWritable();
            JSONObject mergedRoot = mergeBundleWriteRootWithCurrent(context, root);
            return writeBundleRoot(context, mergedRoot);
        } catch (Exception error) {
            error.printStackTrace();
            return false;
        }
    }

    private static JSONObject mergeBundleWriteRootWithCurrent(
        Context context,
        JSONObject incomingRoot
    ) throws Exception {
        JSONObject currentRoot = normalizeRoot(context, loadRootChecked(context, false), false);
        JSONObject normalizedIncoming = normalizeRoot(context, incomingRoot, false);
        JSONObject nextRoot = cloneJsonObject(normalizedIncoming);
        boolean suspiciousShrink = isSuspiciousManagedSnapshotShrink(
            currentRoot,
            normalizedIncoming
        );

        String[] coreKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
            "checkinHistorySummary",
            "timerSessionState",
            "yearlyGoals",
            "diaryCategories",
            "guideState",
            "customThemes",
            "builtInThemeOverrides",
            "selectedTheme",
            "tableScaleSettings"
        };
        for (String key : coreKeys) {
            if (
                suspiciousShrink
                    && shouldPreserveManagedCoreValue(key, currentRoot, normalizedIncoming)
            ) {
                nextRoot.put(key, cloneJsonValue(currentRoot.opt(key)));
            }
        }

        String[] partitionedSections = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        for (String section : partitionedSections) {
            Map<String, ArrayList<JSONObject>> mergedByPeriod = groupItemsByPeriod(
                section,
                currentRoot.optJSONArray(section)
            );
            Map<String, ArrayList<JSONObject>> incomingByPeriod = groupItemsByPeriod(
                section,
                normalizedIncoming.optJSONArray(section)
            );
            for (Map.Entry<String, ArrayList<JSONObject>> entry : incomingByPeriod.entrySet()) {
                String periodId = entry.getKey();
                ArrayList<JSONObject> mergedItems = mergePartitionItems(
                    section,
                    mergedByPeriod.get(periodId),
                    entry.getValue(),
                    true
                );
                if (mergedItems.isEmpty()) {
                    mergedByPeriod.remove(periodId);
                } else {
                    mergedByPeriod.put(periodId, mergedItems);
                }
            }

            ArrayList<String> periodIds = new ArrayList<>(mergedByPeriod.keySet());
            Collections.sort(periodIds);
            ArrayList<JSONObject> flattenedItems = new ArrayList<>();
            for (String periodId : periodIds) {
                ArrayList<JSONObject> items = mergedByPeriod.get(periodId);
                if (items != null) {
                    flattenedItems.addAll(items);
                }
            }
            sortJsonItems(section, flattenedItems);
            nextRoot.put(section, buildJsonArrayFromObjects(flattenedItems));
        }

        ArrayList<JSONObject> mergedRecurringPlans = mergePartitionItems(
            "plans",
            jsonArrayToObjectList(collectRecurringPlans(currentRoot.optJSONArray("plans"))),
            jsonArrayToObjectList(collectRecurringPlans(normalizedIncoming.optJSONArray("plans"))),
            true
        );
        JSONArray nextPlans = nextRoot.optJSONArray("plans");
        if (nextPlans == null) {
            nextPlans = new JSONArray();
        }
        for (JSONObject recurringPlan : mergedRecurringPlans) {
            nextPlans.put(cloneJsonObject(recurringPlan));
        }
        ArrayList<JSONObject> sortedPlans = jsonArrayToObjectList(nextPlans);
        sortJsonItems("plans", sortedPlans);
        nextRoot.put("plans", buildJsonArrayFromObjects(sortedPlans));
        Set<String> referencedDiaryAssetIds =
            collectReferencedDiaryAssetIds(nextRoot.optJSONArray("diaryEntries"));
        JSONArray mergedDiaryMediaAssets = normalizeDiaryMediaAssets(
            currentRoot.optJSONArray("diaryMediaAssets")
        );
        JSONArray incomingDiaryMediaAssets = normalizeDiaryMediaAssets(
            incomingRoot.optJSONArray("diaryMediaAssets")
        );
        JSONObject diaryMediaById = new JSONObject();
        for (int index = 0; index < mergedDiaryMediaAssets.length(); index += 1) {
            JSONObject entry = mergedDiaryMediaAssets.optJSONObject(index);
            if (entry != null) {
                diaryMediaById.put(entry.optString("assetId", ""), cloneJsonObject(entry));
            }
        }
        for (int index = 0; index < incomingDiaryMediaAssets.length(); index += 1) {
            JSONObject entry = incomingDiaryMediaAssets.optJSONObject(index);
            if (entry != null) {
                diaryMediaById.put(entry.optString("assetId", ""), cloneJsonObject(entry));
            }
        }
        JSONArray nextDiaryMediaAssets = new JSONArray();
        for (String assetId : referencedDiaryAssetIds) {
            JSONObject entry = diaryMediaById.optJSONObject(assetId);
            if (entry != null) {
                nextDiaryMediaAssets.put(cloneJsonObject(entry));
            }
        }
        nextRoot.put("diaryMediaAssets", nextDiaryMediaAssets);
        nextRoot.put(
            "createdAt",
            firstNonEmpty(
                currentRoot.optString("createdAt", ""),
                normalizedIncoming.optString("createdAt", ""),
                isoNow()
            )
        );

        return normalizeRoot(context, nextRoot, true);
    }

    private static boolean isSuspiciousManagedSnapshotShrink(
        JSONObject currentRoot,
        JSONObject incomingRoot
    ) {
        String[] primarySections = new String[] {
            "projects",
            "records",
            "plans",
            "todos",
            "checkinItems",
            "dailyCheckins",
            "checkins",
            "yearlyGoals",
            "diaryEntries",
            "diaryCategories"
        };
        int droppedSections = 0;
        int currentTotal = 0;
        int incomingTotal = 0;
        for (String key : primarySections) {
            int currentCount = countManagedSnapshotItems(key, currentRoot.opt(key));
            int incomingCount = countManagedSnapshotItems(key, incomingRoot.opt(key));
            currentTotal += currentCount;
            incomingTotal += incomingCount;
            if (currentCount > 0 && incomingCount == 0) {
                droppedSections += 1;
            }
        }
        if (currentTotal <= 0 || droppedSections <= 0) {
            return false;
        }
        if (droppedSections >= 3 && incomingTotal <= Math.max(6, currentTotal / 2)) {
            return true;
        }
        return droppedSections >= 2
            && currentTotal >= 24
            && incomingTotal <= Math.max(8, Math.round(currentTotal * 0.40f));
    }

    private static boolean shouldPreserveManagedCoreValue(
        String key,
        JSONObject currentRoot,
        JSONObject incomingRoot
    ) {
        int currentCount = countManagedSnapshotItems(key, currentRoot.opt(key));
        if (currentCount <= 0) {
            return false;
        }
        return countManagedSnapshotItems(key, incomingRoot.opt(key)) == 0;
    }

    private static int countManagedSnapshotItems(String key, Object rawValue) {
        if ("yearlyGoals".equals(key)) {
            return countYearGoalEntries(rawValue instanceof JSONObject ? (JSONObject) rawValue : null);
        }
        if (rawValue instanceof JSONArray) {
            return ((JSONArray) rawValue).length();
        }
        if (rawValue instanceof JSONObject) {
            return ((JSONObject) rawValue).length();
        }
        if (rawValue instanceof String) {
            return TextUtils.isEmpty(((String) rawValue).trim()) ? 0 : 1;
        }
        return 0;
    }

    private static int countYearGoalEntries(JSONObject yearlyGoals) {
        if (yearlyGoals == null) {
            return 0;
        }
        int total = 0;
        JSONArray yearKeys = yearlyGoals.names();
        if (yearKeys == null) {
            return 0;
        }
        for (int yearIndex = 0; yearIndex < yearKeys.length(); yearIndex += 1) {
            String yearKey = safeText(yearKeys.optString(yearIndex, ""));
            if (TextUtils.isEmpty(yearKey)) {
                continue;
            }
            JSONObject yearBucket = yearlyGoals.optJSONObject(yearKey);
            if (yearBucket == null) {
                continue;
            }
            JSONArray scopeKeys = yearBucket.names();
            if (scopeKeys == null) {
                continue;
            }
            for (int scopeIndex = 0; scopeIndex < scopeKeys.length(); scopeIndex += 1) {
                String scopeKey = safeText(scopeKeys.optString(scopeIndex, ""));
                if (TextUtils.isEmpty(scopeKey)) {
                    continue;
                }
                JSONArray goals = yearBucket.optJSONArray(scopeKey);
                if (goals != null) {
                    total += goals.length();
                }
            }
        }
        return total;
    }

    public static String getStorageRecoveryState() {
        return TextUtils.isEmpty(storageRecoveryState)
            ? STORAGE_RECOVERY_STATE_OK
            : storageRecoveryState;
    }

    public static String getStorageRecoveryMessage() {
        return TextUtils.isEmpty(storageRecoveryMessage) ? "" : storageRecoveryMessage;
    }

    public static String getStorageReadState() {
        return TextUtils.isEmpty(storageReadState) ? READ_STATE_NOT_FOUND : storageReadState;
    }

    public static String getStorageReadMessage() {
        return TextUtils.isEmpty(storageReadMessage) ? "" : storageReadMessage;
    }

    private static void setStorageReadState(String state, String message) {
        storageReadState = TextUtils.isEmpty(state) ? READ_STATE_VALID : state;
        storageReadMessage = TextUtils.isEmpty(message) ? "" : message;
        if (
            (READ_STATE_VALID.equals(storageReadState)
                || READ_STATE_NOT_FOUND.equals(storageReadState))
                && STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())
        ) {
            setStorageRecoveryState(STORAGE_RECOVERY_STATE_OK, "");
        }
    }

    private static void failStorageRead(String state, String message) {
        setStorageReadState(state, message);
        setStorageRecoveryState(STORAGE_RECOVERY_STATE_NEEDS_RECOVERY, message);
        invalidateProcessStorageCaches();
    }

    private static void resetStorageRecoveryState() {
        storageRecoveryState = STORAGE_RECOVERY_STATE_OK;
        storageRecoveryMessage = "";
        storageReadState = READ_STATE_NOT_FOUND;
        storageReadMessage = "";
        clearBundleStorageReadyCache();
    }

    private static void setStorageRecoveryState(String state, String message) {
        storageRecoveryState =
            TextUtils.isEmpty(state) ? STORAGE_RECOVERY_STATE_OK : state;
        storageRecoveryMessage = TextUtils.isEmpty(message) ? "" : message;
        if (!STORAGE_RECOVERY_STATE_OK.equals(storageRecoveryState)) {
            clearBundleStorageReadyCache();
        }
    }

    private static void clearBundleStorageReadyCache() {
        bundleStorageReadyVerifiedAt = 0L;
        bundleStorageReadyCacheKey = "";
    }

    private static String buildBundleStorageReadyCacheKey(Context context) {
        if (context == null) {
            return "";
        }
        StorageVersion version = probeBootstrapStorageVersionUncached(context);
        String fingerprint = version == null ? "" : safeText(version.fingerprint);
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            return MODE_DIRECTORY
                + ":"
                + (directoryUri == null ? "" : directoryUri.toString())
                + "|"
                + fingerprint;
        }
        File root = getDefaultBundleRootDirectory(context);
        return MODE_DEFAULT
            + ":"
            + (root == null ? "" : root.getAbsolutePath())
            + "|"
            + fingerprint;
    }

    private static boolean canUseBundleStorageReadyCache(Context context) {
        if (
            context == null
                || !usesDirectoryBundleStorage(context)
                || STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())
        ) {
            return false;
        }
        String nextCacheKey = buildBundleStorageReadyCacheKey(context);
        if (
            TextUtils.isEmpty(nextCacheKey)
                || !nextCacheKey.equals(bundleStorageReadyCacheKey)
                || bundleStorageReadyVerifiedAt <= 0L
        ) {
            return false;
        }
        return true;
    }

    private static void markBundleStorageReadyVerified(Context context) {
        bundleStorageReadyCacheKey = buildBundleStorageReadyCacheKey(context);
        bundleStorageReadyVerifiedAt = SystemClock.elapsedRealtime();
    }

    private static void assertStorageWritable() throws Exception {
        if (STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())) {
            throw new Exception(
                TextUtils.isEmpty(getStorageRecoveryMessage())
                    ? "当前存储目录需要恢复，已阻止写入。"
                    : getStorageRecoveryMessage()
            );
        }
    }

    public static synchronized StorageVersion probeStorageVersion(
        Context context,
        boolean includeFallbackHash
    ) {
        StorageLocation location = getStorageLocation(context);
        StorageVersion version = new StorageVersion();
        version.storagePath = location.storagePath;
        version.actualUri = firstNonEmpty(location.actualUri, location.storagePath);
        version.storageMode = location.storageMode;
        version.size = Math.max(0L, location.size);
        version.modifiedAt = Math.max(0L, location.modifiedAt);
        version.supportsModifiedAt = version.modifiedAt > 0L;

        if (version.supportsModifiedAt) {
            version.fingerprint = buildStorageFingerprint(
                version.size,
                version.modifiedAt,
                version.actualUri
            );
            return version;
        }

        if (includeFallbackHash) {
            String hash = computeStorageContentHash(context);
            if (!TextUtils.isEmpty(hash)) {
                version.fingerprint =
                    version.size + ":" + hash + ":" + version.actualUri;
                version.fallbackHashUsed = true;
                return version;
            }
        }

        version.fingerprint = buildStorageFingerprint(
            version.size,
            version.modifiedAt,
            version.actualUri
        );
        return version;
    }

    public static synchronized JSONObject getStorageManifest(Context context) {
        if (usesDirectoryBundleStorage(context)) {
            try {
                ensureBundleStorageReady(context);
                JSONObject manifest = readBundleJsonObject(
                    context,
                    BUNDLE_MANIFEST_FILE_NAME
                );
                if (manifest == null && isDefaultBundleUninitialized(context)) {
                    setStorageReadState(READ_STATE_NOT_FOUND, "默认存储尚未创建。");
                    return buildStorageManifest(
                        normalizeRoot(context, new JSONObject(), false)
                    );
                }
                validateBundleManifest(context, manifest);
                setStorageReadState(READ_STATE_VALID, "");
                return manifest;
            } catch (Exception error) {
                recordStorageReadFailure(
                    error,
                    "存储授权已失效，无法读取 manifest。",
                    "bundle manifest 缺失、损坏或与文件布局不一致。"
                );
                return buildReadErrorRoot();
            }
        }
        JSONObject root = loadRoot(context);
        return root.has("readState") ? buildReadErrorRoot() : buildStorageManifest(root);
    }

    public static synchronized JSONObject getStorageCoreState(Context context) {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace("getStorageCoreState", "start", startedAt, "");
        try {
            ensureBoundStorageReadable(context);
        } catch (StorageReadException error) {
            failStorageRead(error.readState, error.getMessage());
            throw new IllegalStateException(error.getMessage(), error);
        }
        StorageVersion version = probeBootstrapStorageVersion(context);
        String fingerprint = isBootstrapCacheEligible(context, version)
            ? safeText(version.fingerprint)
            : "";
        if (
            processCoreState != null
                && !TextUtils.isEmpty(fingerprint)
                && fingerprint.equals(processCoreFingerprint)
        ) {
            return cloneJsonObject(processCoreState);
        }
        if (usesDirectoryBundleStorage(context)) {
            JSONObject directCore = readBundleCoreState(context);
            if (directCore == null || directCore.optJSONArray("projects") == null) {
                if (
                    MODE_DEFAULT.equals(getStorageMode(context))
                        && READ_STATE_NOT_FOUND.equals(getStorageReadState())
                ) {
                    directCore = null;
                } else {
                    if (!STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())) {
                        failStorageRead(READ_STATE_CORRUPTED, "无法读取有效的 core.json。");
                    }
                    throw new IllegalStateException(getStorageReadMessage());
                }
            }
            if (directCore != null) {
                logStorageTrace(
                    "getStorageCoreState",
                    "finish",
                    startedAt,
                    "source=bundle-core projectCount="
                        + (directCore.optJSONArray("projects") == null
                            ? 0
                            : directCore.optJSONArray("projects").length())
                );
                JSONObject resolvedCore = directCore;
                try {
                    resolvedCore = ensureCheckinHistorySummaryInCore(context, directCore);
                } catch (Exception error) {
                    error.printStackTrace();
                }
                if (!TextUtils.isEmpty(fingerprint)) {
                    processCoreFingerprint = fingerprint;
                    processCoreState = cloneJsonObject(resolvedCore);
                }
                return cloneJsonObject(resolvedCore);
            }
        }
        JSONObject root = loadRoot(context);
        if (root.has("readState")) {
            throw new IllegalStateException(root.optString("readMessage", "存储读取失败。"));
        }
        JSONObject core = new JSONObject();
        try {
            core.put("projects", cloneJsonArray(root.optJSONArray("projects")));
            core.put("todos", cloneJsonArray(root.optJSONArray("todos")));
            core.put("checkinItems", cloneJsonArray(root.optJSONArray("checkinItems")));
            core.put(
                "checkinHistorySummary",
                resolveCheckinHistorySummaryForCore(
                    root.optJSONObject("checkinHistorySummary"),
                    root.optJSONArray("dailyCheckins"),
                    root.optJSONArray("checkinItems")
                )
            );
            core.put("timerSessionState", cloneJsonObject(root.optJSONObject("timerSessionState")));
            core.put("yearlyGoals", cloneJsonObject(root.optJSONObject("yearlyGoals")));
            core.put("diaryCategories", cloneJsonArray(root.optJSONArray("diaryCategories")));
            core.put("guideState", cloneJsonObject(root.optJSONObject("guideState")));
            core.put("customThemes", cloneJsonArray(root.optJSONArray("customThemes")));
            core.put(
                "builtInThemeOverrides",
                cloneJsonObject(root.optJSONObject("builtInThemeOverrides"))
            );
            core.put(
                "selectedTheme",
                sanitizeJsonString(root.optString("selectedTheme", "default"))
            );
            core.put(
                "todoSortPreference",
                sanitizeJsonString(root.optString("todoSortPreference", "dueDate"))
            );
            core.put("createdAt", sanitizeJsonString(root.optString("createdAt", isoNow())));
            core.put(
                "lastModified",
                sanitizeJsonString(root.optString("lastModified", root.optString("createdAt", isoNow())))
            );
            putNullableString(core, "storagePath", root.optString("storagePath", ""));
            putNullableString(core, "storageDirectory", root.optString("storageDirectory", ""));
            putNullableString(core, "userDataPath", root.optString("userDataPath", ""));
            putNullableString(core, "documentsPath", root.optString("documentsPath", ""));
            core.put("syncMeta", cloneJsonObject(root.optJSONObject("syncMeta")));
            core.put("recurringPlans", collectRecurringPlans(root.optJSONArray("plans")));
        } catch (Exception error) {
            error.printStackTrace();
        }
        logStorageTrace(
            "getStorageCoreState",
            "finish",
            startedAt,
            "source=root projectCount="
                + (core.optJSONArray("projects") == null ? 0 : core.optJSONArray("projects").length())
        );
        JSONObject resolvedCore = core;
        try {
            resolvedCore = ensureCheckinHistorySummaryInCore(context, core);
        } catch (Exception error) {
            error.printStackTrace();
        }
        if (!TextUtils.isEmpty(fingerprint)) {
            processCoreFingerprint = fingerprint;
            processCoreState = cloneJsonObject(resolvedCore);
        }
        return cloneJsonObject(resolvedCore);
    }

    public static synchronized JSONObject getStorageBootstrapState(Context context, JSONObject options) {
        JSONObject source = options == null ? new JSONObject() : options;
        String page = normalizeBootstrapPage(source.optString("page", ""));
        JSONObject payload = new JSONObject();
        JSONObject pageData = new JSONObject();
        try {
            StorageVersion version = probeBootstrapStorageVersion(context);
            JSONObject core = getStorageCoreState(context);
            payload.put("page", page);
            payload.put("snapshotVersion", version == null ? "" : safeText(version.fingerprint));
            payload.put("generatedAt", isoNow());
            payload.put("changedSections", new JSONArray());
            payload.put("changedPeriods", new JSONObject());
            payload.put("pendingCompaction", false);

            if ("index".equals(page)) {
                JSONObject recordScope = resolveBootstrapSectionScope(
                    source,
                    "records",
                    buildDefaultRecordBootstrapScope()
                );
                JSONObject range = loadStorageSectionRange(context, "records", recordScope);
                pageData.put("projects", cloneJsonArray(core.optJSONArray("projects")));
                pageData.put(
                    "timerSessionState",
                    cloneJsonObject(core.optJSONObject("timerSessionState"))
                );
                pageData.put("records", cloneJsonArray(range.optJSONArray("items")));
                pageData.put("recordPeriodIds", cloneJsonArray(range.optJSONArray("periodIds")));
                pageData.put("recordScope", cloneJsonObject(recordScope));
            } else if ("todo".equals(page)) {
                JSONObject dailyCheckinScope = resolveBootstrapSectionScope(
                    source,
                    "dailyCheckins",
                    buildCurrentDayScope()
                );
                JSONObject checkinScope = resolveBootstrapSectionScope(
                    source,
                    "checkins",
                    buildCurrentMonthScope()
                );
                JSONObject dailyCheckinRange =
                    loadStorageSectionRange(context, "dailyCheckins", dailyCheckinScope);
                JSONObject checkinRange =
                    loadStorageSectionRange(context, "checkins", checkinScope);
                pageData.put("todos", cloneJsonArray(core.optJSONArray("todos")));
                pageData.put("checkinItems", cloneJsonArray(core.optJSONArray("checkinItems")));
                pageData.put(
                    "checkinHistorySummary",
                    cloneJsonObject(core.optJSONObject("checkinHistorySummary"))
                );
                pageData.put(
                    "dailyCheckins",
                    cloneJsonArray(dailyCheckinRange.optJSONArray("items"))
                );
                pageData.put("checkins", cloneJsonArray(checkinRange.optJSONArray("items")));
                pageData.put(
                    "dailyCheckinPeriodIds",
                    cloneJsonArray(dailyCheckinRange.optJSONArray("periodIds"))
                );
                pageData.put(
                    "checkinPeriodIds",
                    cloneJsonArray(checkinRange.optJSONArray("periodIds"))
                );
            } else if ("stats".equals(page)) {
                JSONObject recordScope = resolveBootstrapSectionScope(
                    source,
                    "records",
                    buildCurrentMonthScope()
                );
                JSONObject range = loadStorageSectionRange(context, "records", recordScope);
                pageData.put("projects", cloneJsonArray(core.optJSONArray("projects")));
                pageData.put("records", cloneJsonArray(range.optJSONArray("items")));
                pageData.put("recordPeriodIds", cloneJsonArray(range.optJSONArray("periodIds")));
                pageData.put("recordScope", cloneJsonObject(recordScope));
            } else if ("plan".equals(page)) {
                JSONObject planScope = resolveBootstrapSectionScope(
                    source,
                    "plans",
                    buildCurrentMonthScope()
                );
                JSONObject range = loadStorageSectionRange(context, "plans", planScope);
                JSONObject planBootstrap = getStoragePlanBootstrapState(context, source);
                pageData.put("plans", cloneJsonArray(range.optJSONArray("items")));
                pageData.put("planPeriodIds", cloneJsonArray(range.optJSONArray("periodIds")));
                pageData.put(
                    "recurringPlans",
                    cloneJsonArray(planBootstrap.optJSONArray("recurringPlans"))
                );
                pageData.put(
                    "yearlyGoals",
                    cloneJsonObject(planBootstrap.optJSONObject("yearlyGoals"))
                );
            } else {
                pageData.put("core", cloneJsonObject(core));
            }

            payload.put("pageData", pageData);
        } catch (Exception error) {
            if (!STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())) {
                failStorageRead(READ_STATE_CORRUPTED, "启动数据读取失败。");
            }
            throw new IllegalStateException(getStorageReadMessage(), error);
        }
        return payload;
    }

    public static synchronized JSONObject getStoragePageBootstrapState(Context context, JSONObject options) {
        JSONObject source = options == null ? new JSONObject() : cloneJsonObject(options);
        JSONObject sourceOptions = source.optJSONObject("options");
        JSONObject pageOptions = sourceOptions == null ? source : sourceOptions;
        String page = normalizeBootstrapPage(
            firstNonEmpty(source.optString("pageKey", ""), source.optString("page", ""))
        );
        File snapshotFile = getPageBootstrapSnapshotFile(context, page, pageOptions);
        String currentFingerprint = "";
        try {
            StorageVersion version = probeBootstrapStorageVersion(context);
            currentFingerprint = isBootstrapCacheEligible(context, version)
                ? safeText(version.fingerprint)
                : "";
            String optionsKey = canonicalJson(pageOptions);
            String processCacheKey = page + "|" + optionsKey + "|" + currentFingerprint;
            JSONObject processCached = TextUtils.isEmpty(currentFingerprint)
                ? null
                : PROCESS_PAGE_BOOTSTRAP_CACHE.get(processCacheKey);
            if (processCached != null) {
                JSONObject result = cloneJsonObject(processCached);
                result.put("fromCache", true);
                result.put("syncPending", false);
                return result;
            }
            JSONObject cached = readPageBootstrapSnapshot(snapshotFile);
            if (cached != null) {
                String cachedFingerprint = safeText(cached.optString("sourceFingerprint", ""));
                JSONObject cachedPayload = cached.optJSONObject("payload");
                if (
                    cachedPayload != null
                        && !TextUtils.isEmpty(currentFingerprint)
                        && cachedFingerprint.equals(currentFingerprint)
                ) {
                    JSONObject result = cloneJsonObject(cachedPayload);
                    result.put("fromCache", true);
                    result.put("syncPending", false);
                    PROCESS_PAGE_BOOTSTRAP_CACHE.put(processCacheKey, cloneJsonObject(result));
                    return result;
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "读取页面启动快照失败，将读取权威分区。", error);
        }

        JSONObject fresh = buildStoragePageBootstrapState(context, source);
        if (!TextUtils.isEmpty(currentFingerprint)) {
            try {
                writePageBootstrapSnapshot(snapshotFile, currentFingerprint, fresh);
                String processCacheKey = page + "|" + canonicalJson(pageOptions) + "|" + currentFingerprint;
                PROCESS_PAGE_BOOTSTRAP_CACHE.put(processCacheKey, cloneJsonObject(fresh));
            } catch (Exception error) {
                Log.w(TAG, "写入页面启动快照失败。", error);
            }
        }
        return fresh;
    }

    private static boolean isBootstrapCacheEligible(
        Context context,
        StorageVersion version
    ) {
        if (context == null || version == null || TextUtils.isEmpty(version.fingerprint)) {
            return false;
        }
        String mode = getStorageMode(context);
        if (MODE_FILE.equals(mode)) {
            Uri uri = getCustomStorageUri(context);
            return uri != null && queryDocumentExists(context, uri);
        }
        if (MODE_DIRECTORY.equals(mode)) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            Uri manifestUri = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                BUNDLE_MANIFEST_FILE_NAME,
                false,
                false
            );
            return manifestUri != null && queryDocumentExists(context, manifestUri);
        }
        File manifest = new File(
            getDefaultBundleRootDirectory(context),
            BUNDLE_MANIFEST_FILE_NAME
        );
        return manifest.isFile() && manifest.length() > 0L;
    }

    private static JSONObject buildStoragePageBootstrapState(Context context, JSONObject options) {
        long startedAt = SystemClock.elapsedRealtime();
        JSONObject source = options == null ? new JSONObject() : options;
        JSONObject sourceOptions = source.optJSONObject("options");
        JSONObject pageOptions = sourceOptions == null ? source : sourceOptions;
        String page = normalizeBootstrapPage(
            firstNonEmpty(source.optString("pageKey", ""), source.optString("page", ""))
        );
        logStorageTrace(
            "getStoragePageBootstrapState",
            "start",
            startedAt,
            "page=" + safeText(page)
        );
        JSONObject payload = new JSONObject();
        JSONObject data = new JSONObject();
        JSONArray loadedPeriodIds = new JSONArray();
        try {
            StorageVersion version = probeBootstrapStorageVersion(context);
            JSONObject core = getStorageCoreState(context);
            payload.put("page", page);
            payload.put("sourceFingerprint", version == null ? "" : safeText(version.fingerprint));
            payload.put("builtAt", isoNow());

            if ("index".equals(page)) {
                JSONObject recordScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "records",
                    buildDefaultRecordBootstrapScope()
                );
                JSONObject range = loadStorageSectionRange(context, "records", recordScope);
                loadedPeriodIds = cloneJsonArray(range.optJSONArray("periodIds"));
                data.put("projects", cloneJsonArray(core.optJSONArray("projects")));
                data.put("recentRecords", cloneJsonArray(range.optJSONArray("items")));
                data.put(
                    "timerSessionState",
                    cloneJsonObject(core.optJSONObject("timerSessionState"))
                );
                data.put(
                    "projectTotalsSummary",
                    buildProjectTotalsSummary(core.optJSONArray("projects"))
                );
            } else if ("plan".equals(page)) {
                JSONObject planScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "plans",
                    buildCurrentMonthScope()
                );
                JSONObject range = loadStorageSectionRange(context, "plans", planScope);
                JSONObject planBootstrap = getStoragePlanBootstrapState(context, pageOptions);
                loadedPeriodIds = cloneJsonArray(range.optJSONArray("periodIds"));
                data.put("visiblePlans", cloneJsonArray(range.optJSONArray("items")));
                data.put(
                    "recurringPlans",
                    cloneJsonArray(planBootstrap.optJSONArray("recurringPlans"))
                );
                data.put(
                    "yearlyGoals",
                    cloneJsonObject(planBootstrap.optJSONObject("yearlyGoals"))
                );
            } else if ("todo".equals(page)) {
                JSONObject dailyCheckinScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "dailyCheckins",
                    buildCurrentDayScope()
                );
                JSONObject checkinScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "checkins",
                    buildCurrentMonthScope()
                );
                JSONObject dailyRange =
                    loadStorageSectionRange(context, "dailyCheckins", dailyCheckinScope);
                JSONObject checkinRange =
                    loadStorageSectionRange(context, "checkins", checkinScope);
                LinkedHashSet<String> periodIds = new LinkedHashSet<>();
                appendStringArrayToSet(periodIds, dailyRange.optJSONArray("periodIds"));
                appendStringArrayToSet(periodIds, checkinRange.optJSONArray("periodIds"));
                loadedPeriodIds = buildJsonArrayFromStrings(new ArrayList<>(periodIds));
                data.put("todos", cloneJsonArray(core.optJSONArray("todos")));
                data.put("checkinItems", cloneJsonArray(core.optJSONArray("checkinItems")));
                data.put(
                    "checkinHistorySummary",
                    cloneJsonObject(core.optJSONObject("checkinHistorySummary"))
                );
                data.put(
                    "todayDailyCheckins",
                    cloneJsonArray(dailyRange.optJSONArray("items"))
                );
                data.put("recentCheckins", cloneJsonArray(checkinRange.optJSONArray("items")));
            } else if ("diary".equals(page)) {
                JSONObject diaryScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "diaryEntries",
                    buildCurrentMonthScope()
                );
                JSONObject range = loadStorageSectionRange(context, "diaryEntries", diaryScope);
                loadedPeriodIds = cloneJsonArray(range.optJSONArray("periodIds"));
                data.put(
                    "currentMonthEntries",
                    cloneJsonArray(range.optJSONArray("items"))
                );
                data.put(
                    "diaryCategories",
                    cloneJsonArray(core.optJSONArray("diaryCategories"))
                );
                data.put("guideState", cloneJsonObject(core.optJSONObject("guideState")));
            } else if ("stats".equals(page)) {
                JSONObject recordScope = resolveBootstrapSectionScope(
                    pageOptions,
                    "records",
                    buildCurrentMonthScope()
                );
                JSONObject range = loadStorageSectionRange(context, "records", recordScope);
                loadedPeriodIds = cloneJsonArray(range.optJSONArray("periodIds"));
                data.put("projects", cloneJsonArray(core.optJSONArray("projects")));
                data.put(
                    "defaultRangeRecordsOrAggregate",
                    cloneJsonArray(range.optJSONArray("items"))
                );
                data.put("statsPreferences", new JSONObject());
                Log.i(
                    TAG,
                    "[stats.page-bootstrap] startDate="
                        + normalizeDateText(
                            firstNonEmpty(
                                recordScope.optString("startDate", ""),
                                recordScope.optString("start", "")
                            )
                        )
                        + " endDate="
                        + normalizeDateText(
                            firstNonEmpty(
                                recordScope.optString("endDate", ""),
                                recordScope.optString("end", "")
                            )
                        )
                        + " loadedPeriodCount="
                        + loadedPeriodIds.length()
                        + " recordCount="
                        + (range.optJSONArray("items") == null ? 0 : range.optJSONArray("items").length())
                );
            } else {
                data.put("storageStatus", JSONObject.NULL);
                data.put("autoBackupStatus", JSONObject.NULL);
                data.put("themeSummary", buildThemeSummary(core));
                data.put("navigationVisibility", JSONObject.NULL);
            }

            payload.put("loadedPeriodIds", loadedPeriodIds);
            payload.put("data", data);
        } catch (Exception error) {
            if (!STORAGE_RECOVERY_STATE_NEEDS_RECOVERY.equals(getStorageRecoveryState())) {
                failStorageRead(READ_STATE_CORRUPTED, "页面启动数据读取失败。");
            }
            throw new IllegalStateException(getStorageReadMessage(), error);
        } finally {
            logStorageTrace(
                "getStoragePageBootstrapState",
                "finish",
                startedAt,
                "page="
                    + safeText(page)
                    + " loadedPeriodCount="
                    + loadedPeriodIds.length()
                    + " dataKeys="
                    + data.length()
            );
        }
        return payload;
    }

    private static File getPageBootstrapSnapshotFile(
        Context context,
        String page,
        JSONObject pageOptions
    ) {
        String dateKey = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String scopeKey = safeText(page) + "|" + dateKey + "|"
            + canonicalJson(pageOptions);
        String fileName = safeText(page) + "-" + sha256Text(scopeKey) + ".json";
        return new File(
            new File(context.getFilesDir(), PAGE_BOOTSTRAP_SNAPSHOT_DIRECTORY),
            fileName
        );
    }

    private static JSONObject readPageBootstrapSnapshot(File file) {
        try {
            if (file == null || !file.exists()) {
                return null;
            }
            return new JSONObject(readTextFromFile(file));
        } catch (Exception error) {
            return null;
        }
    }

    private static void writePageBootstrapSnapshot(
        File file,
        String sourceFingerprint,
        JSONObject payload
    ) throws Exception {
        if (file == null || payload == null) {
            return;
        }
        JSONObject envelope = new JSONObject();
        envelope.put(
            "sourceFingerprint",
            TextUtils.isEmpty(sourceFingerprint)
                ? safeText(payload.optString("sourceFingerprint", ""))
                : sourceFingerprint
        );
        envelope.put("verifiedAt", isoNow());
        envelope.put("payload", cloneJsonObject(payload));
        writeTextToFile(file, envelope.toString());
        prunePageBootstrapSnapshots(file.getParentFile());
    }

    private static String canonicalJson(Object value) {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            TreeSet<String> keys = new TreeSet<>();
            java.util.Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            StringBuilder builder = new StringBuilder("{");
            boolean first = true;
            for (String key : keys) {
                if (!first) builder.append(',');
                first = false;
                builder.append(JSONObject.quote(key)).append(':').append(canonicalJson(object.opt(key)));
            }
            return builder.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder builder = new StringBuilder("[");
            for (int index = 0; index < array.length(); index += 1) {
                if (index > 0) builder.append(',');
                builder.append(canonicalJson(array.opt(index)));
            }
            return builder.append(']').toString();
        }
        if (value instanceof String) return JSONObject.quote((String) value);
        if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
        return JSONObject.quote(String.valueOf(value));
    }

    private static void prunePageBootstrapSnapshots(File directory) {
        if (directory == null || !directory.isDirectory()) return;
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - DISK_PAGE_BOOTSTRAP_MAX_AGE_MS;
        ArrayList<File> retained = new ArrayList<>();
        for (File file : files) {
            if (file.lastModified() < cutoff) {
                file.delete();
            } else {
                retained.add(file);
            }
        }
        retained.sort((left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        for (int index = DISK_PAGE_BOOTSTRAP_CACHE_LIMIT; index < retained.size(); index += 1) {
            retained.get(index).delete();
        }
    }

    public static synchronized JSONObject getStoragePlanBootstrapState(Context context, JSONObject options) {
        boolean includeYearlyGoals =
            options == null || options.optBoolean("includeYearlyGoals", true);
        boolean includeRecurringPlans =
            options == null || options.optBoolean("includeRecurringPlans", true);
        JSONObject core = getStorageCoreState(context);
        JSONObject payload = new JSONObject();
        try {
            if (includeYearlyGoals) {
                payload.put("yearlyGoals", cloneJsonObject(core.optJSONObject("yearlyGoals")));
            }
            if (includeRecurringPlans) {
                payload.put(
                    "recurringPlans",
                    cloneJsonArray(core.optJSONArray("recurringPlans"))
                );
            }
        } catch (Exception error) {
            throw new IllegalStateException("无法构建计划启动数据。", error);
        }
        return payload;
    }

    public static JSONObject getStorageDraft(Context context, JSONObject options) {
        String key =
            safeText(options == null ? "" : options.optString("key", ""));
        if (TextUtils.isEmpty(key)) {
            return null;
        }
        JSONObject envelope = readDraftEnvelope(context, key);
        JSONObject latestOperation = readLatestDraftOperation(context, key);
        JSONObject resolvedEnvelope = envelope == null ? null : cloneJsonObject(envelope);
        if (latestOperation != null && "remove".equals(latestOperation.optString("action", ""))) {
            if (
                resolvedEnvelope == null
                    || !safeText(resolvedEnvelope.optString("lastOperationId", ""))
                        .equals(safeText(latestOperation.optString("operationId", "")))
            ) {
                resolvedEnvelope = null;
            }
        } else if (
            latestOperation != null
                && "set".equals(latestOperation.optString("action", ""))
                && (
                    resolvedEnvelope == null
                        || !safeText(resolvedEnvelope.optString("lastOperationId", ""))
                            .equals(safeText(latestOperation.optString("operationId", "")))
                )
        ) {
            resolvedEnvelope = new JSONObject();
            try {
                resolvedEnvelope.put("key", key);
                resolvedEnvelope.put(
                    "updatedAt",
                    safeText(latestOperation.optString("updatedAt", isoNow()))
                );
                resolvedEnvelope.put(
                    "lastOperationId",
                    safeText(latestOperation.optString("operationId", ""))
                );
                resolvedEnvelope.put(
                    "value",
                    cloneJsonValue(latestOperation.opt("value"))
                );
            } catch (Exception ignored) {
                return null;
            }
        }
        return resolvedEnvelope;
    }

    public static JSONObject setStorageDraft(Context context, JSONObject options) throws Exception {
        String key =
            safeText(options == null ? "" : options.optString("key", ""));
        if (TextUtils.isEmpty(key)) {
            throw new Exception("草稿 key 不能为空");
        }
        JSONObject operation = buildDraftOperation(
            "set",
            key,
            options == null ? JSONObject.NULL : options.opt("value")
        );
        appendDraftOperation(context, key, operation);
        JSONObject envelope = new JSONObject();
        envelope.put("key", key);
        envelope.put("updatedAt", safeText(operation.optString("updatedAt", isoNow())));
        envelope.put(
            "lastOperationId",
            safeText(operation.optString("operationId", ""))
        );
        envelope.put(
            "value",
            cloneJsonValue(options == null ? JSONObject.NULL : options.opt("value"))
        );
        JSONObject sourceOptions = options == null ? null : options.optJSONObject("options");
        if (sourceOptions != null) {
            envelope.put("options", cloneJsonObject(sourceOptions));
        }
        writeTextToFile(getDraftFile(context, key), envelope.toString(2));
        return envelope;
    }

    public static boolean removeStorageDraft(Context context, JSONObject options) throws Exception {
        String key =
            safeText(options == null ? "" : options.optString("key", ""));
        if (TextUtils.isEmpty(key)) {
            return false;
        }
        appendDraftOperation(context, key, buildDraftOperation("remove", key, null));
        File draftFile = getDraftFile(context, key);
        if (draftFile.exists()) {
            draftFile.delete();
        }
        return true;
    }

    public static synchronized JSONObject loadStorageSectionRange(
        Context context,
        String section,
        JSONObject scope
    ) throws Exception {
        long startedAt = SystemClock.elapsedRealtime();
        String normalizedSection = normalizeBundleSection(section);
        if (TextUtils.isEmpty(normalizedSection)) {
            throw new Exception("不支持的 section");
        }
        logStorageTrace(
            "loadStorageSectionRange",
            "start",
            startedAt,
            "section=" + safeText(normalizedSection) + " " + summarizeScope(scope)
        );

        if (usesDirectoryBundleStorage(context)) {
            JSONObject result;
            try {
                result = loadBundleSectionRange(context, normalizedSection, scope);
                if (!READ_STATE_NOT_FOUND.equals(getStorageReadState())) {
                    setStorageReadState(READ_STATE_VALID, "");
                }
            } catch (Exception error) {
                recordStorageReadFailure(
                    error,
                    "存储授权已失效，无法读取分区数据。",
                    "分区文件缺失、损坏或与 manifest 不一致。"
                );
                throw error;
            }
            logStorageTrace(
                "loadStorageSectionRange",
                "finish",
                startedAt,
                "section="
                    + safeText(normalizedSection)
                    + " itemCount="
                    + (result.optJSONArray("items") == null ? 0 : result.optJSONArray("items").length())
                    + " periodCount="
                    + (result.optJSONArray("periodIds") == null
                        ? 0
                        : result.optJSONArray("periodIds").length())
            );
            return result;
        }

        JSONObject root = loadRootStrict(context);
        Set<String> requestedPeriodIds = resolveRequestedPeriodIds(normalizedSection, scope);
        JSONArray sourceItems = root.optJSONArray(normalizedSection);
        ArrayList<JSONObject> matchedItems = new ArrayList<>();
        Set<String> matchedPeriodIds = new HashSet<>();
        SectionDateRange dateRange = resolveSectionDateRange(scope);

        if (sourceItems != null) {
            for (int index = 0; index < sourceItems.length(); index += 1) {
                JSONObject item = sourceItems.optJSONObject(index);
                if (item == null) {
                    continue;
                }
                if ("plans".equals(normalizedSection) && isRecurringPlan(item)) {
                    continue;
                }
                ArrayList<String> itemPeriodIds = getPeriodIdsForSectionItem(normalizedSection, item);
                boolean matchesRequestedPeriods = requestedPeriodIds.isEmpty();
                if (!matchesRequestedPeriods) {
                    for (String itemPeriodId : itemPeriodIds) {
                        if (requestedPeriodIds.contains(itemPeriodId)) {
                            matchesRequestedPeriods = true;
                            break;
                        }
                    }
                }
                if (!matchesRequestedPeriods) {
                    continue;
                }
                if (!sectionItemMatchesScope(normalizedSection, item, dateRange)) {
                    continue;
                }
                matchedItems.add(item);
                matchedPeriodIds.addAll(itemPeriodIds);
            }
        }

        sortJsonItems(normalizedSection, matchedItems);
        ArrayList<String> sortedPeriodIds = new ArrayList<>(matchedPeriodIds);
        Collections.sort(sortedPeriodIds);

        JSONObject result = buildSectionRangeResult(
            normalizedSection,
            scope,
            sortedPeriodIds,
            matchedItems
        );
        if ("records".equals(section) || "plans".equals(section)) {
            Log.i(
                TAG,
                "[storage.section-range] section="
                    + section
                    + " startDate="
                    + normalizeDateText(
                        scope == null
                            ? ""
                            : firstNonEmpty(
                                scope.optString("startDate", ""),
                                scope.optString("start", "")
                            )
                    )
                    + " endDate="
                    + normalizeDateText(
                        scope == null
                            ? ""
                            : firstNonEmpty(
                                scope.optString("endDate", ""),
                                scope.optString("end", "")
                            )
                    )
                    + " requestedPeriodCount="
                    + requestedPeriodIds.size()
                    + " matchedPeriodCount="
                    + matchedPeriodIds.size()
                    + " matchedItemCount="
                    + matchedItems.size()
            );
        }
        logStorageTrace(
            "loadStorageSectionRange",
            "finish",
            startedAt,
            "section="
                + safeText(normalizedSection)
                + " itemCount="
                + matchedItems.size()
                + " periodCount="
                + sortedPeriodIds.size()
        );
        return result;
    }

    public static synchronized JSONObject saveStorageSectionRange(
        Context context,
        String section,
        JSONObject payload
    ) throws Exception {
        String normalizedSection = normalizeBundleSection(section);
        if (TextUtils.isEmpty(normalizedSection)) {
            throw new Exception("不支持的 section");
        }

        String periodId =
            normalizePeriodId(payload == null ? "" : payload.optString("periodId", ""));
        if (TextUtils.isEmpty(periodId)) {
            throw new Exception("分区 periodId 无效");
        }

        if (!STORAGE_TRANSACTION_ACTIVE.get()) {
            JSONObject operation = new JSONObject();
            operation.put("kind", "saveSectionRange");
            operation.put("section", normalizedSection);
            operation.put("payload", payload == null ? new JSONObject() : cloneJsonObject(payload));
            return firstTransactionResult(
                executeStorageTransaction(context, new JSONArray().put(operation))
            );
        }

        if (usesDirectoryBundleStorage(context)) {
            return saveBundleSectionRange(context, normalizedSection, payload);
        }

        JSONArray incomingArray = payload == null ? null : payload.optJSONArray("items");
        if (!validateItemsForPeriod(normalizedSection, periodId, incomingArray)) {
            throw new Exception("分区文件中的项目不属于目标月份");
        }

        ArrayList<JSONObject> incomingItems = jsonArrayToObjectList(incomingArray);
        JSONObject root = loadRootStrict(context);
        JSONArray sourceItems = root.optJSONArray(normalizedSection);
        ArrayList<JSONObject> existingPartitionItems = new ArrayList<>();
        ArrayList<JSONObject> retainedItems = new ArrayList<>();
        ArrayList<JSONObject> recurringPlans = new ArrayList<>();

        if (sourceItems != null) {
            for (int index = 0; index < sourceItems.length(); index += 1) {
                JSONObject item = sourceItems.optJSONObject(index);
                if (item == null) {
                    continue;
                }
                if ("plans".equals(normalizedSection) && isRecurringPlan(item)) {
                    recurringPlans.add(cloneJsonObject(item));
                    continue;
                }
                if (getPeriodIdsForSectionItem(normalizedSection, item).contains(periodId)) {
                    existingPartitionItems.add(cloneJsonObject(item));
                } else {
                    retainedItems.add(cloneJsonObject(item));
                }
            }
        }

        ArrayList<JSONObject> normalizedExistingPartitionItems = existingPartitionItems;
        ArrayList<JSONObject> normalizedIncomingItems = incomingItems;
        if ("records".equals(normalizedSection)) {
            ArrayList<JSONObject> currentProjects =
                jsonArrayToObjectList(root.optJSONArray("projects"));
            normalizedExistingPartitionItems = attachProjectIdsToRecords(
                existingPartitionItems,
                currentProjects
            );
            normalizedIncomingItems = attachProjectIdsToRecords(incomingItems, currentProjects);
        }

        ArrayList<JSONObject> mergedItems = mergePartitionItems(
            normalizedSection,
            normalizedExistingPartitionItems,
            normalizedIncomingItems,
            payload != null && "merge".equals(payload.optString("mode", "replace"))
        );

        ArrayList<JSONObject> nextItems = new ArrayList<>(retainedItems);
        nextItems.addAll(mergedItems);
        sortJsonItems(normalizedSection, nextItems);

        JSONArray nextSectionArray = buildJsonArrayFromObjects(nextItems);
        if ("plans".equals(normalizedSection) && !recurringPlans.isEmpty()) {
            for (JSONObject recurringPlan : recurringPlans) {
                nextSectionArray.put(cloneJsonObject(recurringPlan));
            }
        }
        root.put(normalizedSection, nextSectionArray);

        if (!saveRoot(context, root)) {
            throw new Exception("保存移动端数据失败。");
        }

        JSONObject result = new JSONObject();
        result.put("section", normalizedSection);
        result.put("periodId", periodId);
        result.put("count", mergedItems.size());
        return result;
    }

    private static JSONObject buildCoreStateReplaceResult(JSONObject partialCore) throws Exception {
        JSONObject result = new JSONObject();
        ArrayList<String> changedSections = inferBootstrapChangedSectionsFromCorePatch(partialCore);
        result.put("ok", true);
        result.put("kind", "replaceCoreState");
        result.put("changedSections", buildJsonArrayFromStrings(changedSections));
        result.put("changedSectionCount", changedSections.size());
        return result;
    }

    private static JSONObject buildRecurringPlansReplaceResult(JSONArray items) throws Exception {
        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("kind", "replaceRecurringPlans");
        result.put("count", items == null ? 0 : items.length());
        return result;
    }

    public static synchronized JSONObject replaceStorageCoreState(
        Context context,
        JSONObject partialCore
    ) throws Exception {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace(
            "replaceStorageCoreState",
            "start",
            startedAt,
            "keys=" + (partialCore == null ? 0 : partialCore.length())
        );
        CorePayloadSanitizeResult sanitizeResult =
            stripPartitionedSectionsFromCorePayload(
                partialCore == null ? new JSONObject() : partialCore
            );
        JSONObject source = sanitizeResult.payload;
        if (!STORAGE_TRANSACTION_ACTIVE.get()) {
            JSONObject operation = new JSONObject();
            operation.put("kind", "replaceCoreState");
            operation.put("partialCore", cloneJsonObject(source));
            return firstTransactionResult(
                executeStorageTransaction(context, new JSONArray().put(operation))
            );
        }
        if (usesDirectoryBundleStorage(context)) {
            logBundleCorePollutionCleanup("replaceStorageCoreState", sanitizeResult.removedSections);
            JSONObject result = replaceBundleCoreState(context, source);
            logStorageTrace("replaceStorageCoreState", "finish", startedAt, "bundleMode=true");
            return result;
        }
        JSONObject root = loadRootStrict(context);
        String[] mutableKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
            "checkinHistorySummary",
            "timerSessionState",
            "yearlyGoals",
            "diaryCategories",
            "guideState",
            "customThemes",
            "builtInThemeOverrides",
            "selectedTheme",
            "todoSortPreference",
            "createdAt",
            "storagePath",
            "storageDirectory",
            "userDataPath",
            "documentsPath",
            "syncMeta"
        };

        for (String key : mutableKeys) {
            if (!source.has(key)) {
                continue;
            }
            root.put(key, cloneJsonValue(source.opt(key)));
        }

        if (!saveRoot(context, root)) {
            throw new Exception("保存移动端数据失败。");
        }
        logBundleCorePollutionCleanup("replaceStorageCoreState", sanitizeResult.removedSections);
        JSONObject result = buildCoreStateReplaceResult(source);
        logStorageTrace("replaceStorageCoreState", "finish", startedAt, "bundleMode=false");
        return result;
    }

    public static synchronized JSONArray replaceStorageRecurringPlans(
        Context context,
        JSONArray items
    ) throws Exception {
        if (!STORAGE_TRANSACTION_ACTIVE.get()) {
            JSONObject operation = new JSONObject();
            operation.put("kind", "replaceRecurringPlans");
            operation.put("items", cloneJsonArray(items));
            executeStorageTransaction(context, new JSONArray().put(operation));
            return cloneJsonArray(items);
        }
        if (usesDirectoryBundleStorage(context)) {
            return replaceBundleRecurringPlans(context, items);
        }
        JSONObject root = loadRootStrict(context);
        JSONArray plans = root.optJSONArray("plans");
        ArrayList<JSONObject> oneTimePlans = new ArrayList<>();
        if (plans != null) {
            for (int index = 0; index < plans.length(); index += 1) {
                JSONObject item = plans.optJSONObject(index);
                if (item == null || isRecurringPlan(item)) {
                    continue;
                }
                oneTimePlans.add(cloneJsonObject(item));
            }
        }

        ArrayList<JSONObject> recurringPlans = new ArrayList<>();
        if (items != null) {
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item == null || !isRecurringPlan(item)) {
                    continue;
                }
                recurringPlans.add(cloneJsonObject(item));
            }
        }

        sortJsonItems("plans", oneTimePlans);
        JSONArray nextPlans = buildJsonArrayFromObjects(oneTimePlans);
        for (JSONObject recurringPlan : recurringPlans) {
            nextPlans.put(cloneJsonObject(recurringPlan));
        }
        root.put("plans", nextPlans);

        if (!saveRoot(context, root)) {
            throw new Exception("保存移动端数据失败。");
        }

        return buildJsonArrayFromObjects(recurringPlans);
    }

    public static boolean directoryContainsBundleOrLegacy(Context context, Uri treeUri) {
        if (context == null || treeUri == null) {
            return false;
        }
        return resolveDirectoryRelativeDocumentUri(
            context,
            treeUri,
            BUNDLE_MANIFEST_FILE_NAME,
            false,
            false
        ) != null
            || resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                BUNDLE_CORE_FILE_NAME,
                false,
                false
            ) != null
            || resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                BUNDLE_RECURRING_PLANS_FILE_NAME,
                false,
                false
            ) != null
            || !listBundlePartitionRelativePaths(context, treeUri, null).isEmpty()
            || resolveDirectoryStorageDocumentUri(context, treeUri, false) != null;
    }

    public static void writeBundleSnapshotToDirectory(
        Context context,
        JSONObject root,
        File targetDirectory
    ) throws Exception {
        if (targetDirectory == null) {
            throw new Exception("导出目录不可用。");
        }
        if (!targetDirectory.exists() && !targetDirectory.mkdirs()) {
            throw new Exception("无法创建导出目录。");
        }
        clearLocalDirectory(targetDirectory);
        JSONObject normalizedRoot = normalizeRoot(context, root, false);
        writeLocalBundleSnapshot(targetDirectory, normalizedRoot);
    }

    public static JSONObject loadBundleSnapshotFromDirectory(File sourceDirectory) throws Exception {
        if (sourceDirectory == null || !sourceDirectory.exists()) {
            throw new Exception("bundle 目录不存在。");
        }
        File manifestFile = new File(sourceDirectory, BUNDLE_MANIFEST_FILE_NAME);
        if (!manifestFile.exists()) {
            throw new Exception("bundle-manifest.json 缺失。");
        }
        JSONObject manifest = new JSONObject(readTextFromFile(manifestFile));
        JSONObject root = readLocalBundleRootFromManifest(sourceDirectory, manifest);
        validateRootShape(root);
        return root;
    }

    public static synchronized JSONObject readStorageSectionPartitionEnvelope(
        Context context,
        String section,
        String periodId
    ) throws Exception {
        String normalizedSection = normalizeBundleSection(section);
        String normalizedPeriodId = normalizePeriodId(periodId);
        if (TextUtils.isEmpty(normalizedSection) || TextUtils.isEmpty(normalizedPeriodId)) {
            throw new Exception("导出分区参数无效。");
        }

        if (usesDirectoryBundleStorage(context)) {
            ensureBundleStorageReady(context);
            String relativePath = getPartitionRelativePath(normalizedSection, normalizedPeriodId);
            JSONObject envelope = readBundlePartitionEnvelopeWithConflictRecovery(
                context,
                normalizedSection,
                normalizedPeriodId,
                relativePath
            );
            if (envelope != null) {
                return envelope;
            }
        }

        JSONObject range = loadStorageSectionRange(
            context,
            normalizedSection,
            new JSONObject().put("periodIds", new JSONArray().put(normalizedPeriodId))
        );
        return buildPartitionEnvelope(
            normalizedSection,
            normalizedPeriodId,
            jsonArrayToObjectList(range.optJSONArray("items"))
        );
    }

    public static JSONObject importLegacyJsonWithBackup(
        Context context,
        String rawJson,
        String sourceName
    ) throws Exception {
        return importLegacyJsonWithBackup(context, rawJson, sourceName, false);
    }

    public static JSONObject importLegacyJsonWithBackup(
        Context context,
        String rawJson,
        String sourceName,
        boolean diffMerge
    ) throws Exception {
        String safeRawJson = rawJson == null ? "" : rawJson.trim();
        if (TextUtils.isEmpty(safeRawJson)) {
            throw new Exception("导入的 JSON 文件为空。");
        }

        JSONObject parsedRoot = new JSONObject(safeRawJson);
        validateRootShape(parsedRoot);
        JSONObject normalizedRoot = normalizeRoot(
            context,
            preserveThemeStateIfMissing(context, parsedRoot),
            true
        );
        JSONObject targetRoot = diffMerge
            ? mergeImportedRootWithCurrent(context, normalizedRoot)
            : normalizedRoot;
        if (!saveRoot(context, targetRoot)) {
            throw new Exception("导入旧 JSON 数据失败。");
        }

        if (usesDirectoryBundleStorage(context)) {
            String backupRelativePath = buildLegacyImportBackupRelativePath(sourceName);
            writeBundleText(context, backupRelativePath, safeRawJson);
            appendLegacyBackupEntry(context, backupRelativePath, "legacy-import");
        }

        return targetRoot;
    }

    public static JSONObject mergeImportedRootWithCurrent(
        Context context,
        JSONObject importedRoot
    ) throws Exception {
        JSONObject currentRoot = normalizeRoot(context, loadRootStrict(context), false);
        JSONObject incomingRoot = normalizeRoot(context, importedRoot, false);
        JSONObject nextRoot = cloneJsonObject(currentRoot);

        String[] coreKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
            "checkinHistorySummary",
            "yearlyGoals",
            "diaryCategories"
        };
        for (String key : coreKeys) {
            nextRoot.put(key, cloneJsonValue(incomingRoot.opt(key)));
        }

        String[] partitionedSections = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        for (String section : partitionedSections) {
            Map<String, ArrayList<JSONObject>> mergedByPeriod = groupItemsByPeriod(
                section,
                currentRoot.optJSONArray(section)
            );
            Map<String, ArrayList<JSONObject>> importedByPeriod = groupItemsByPeriod(
                section,
                incomingRoot.optJSONArray(section)
            );
            for (Map.Entry<String, ArrayList<JSONObject>> entry : importedByPeriod.entrySet()) {
                String periodId = entry.getKey();
                ArrayList<JSONObject> mergedItems = mergePartitionItems(
                    section,
                    mergedByPeriod.get(periodId),
                    entry.getValue(),
                    true
                );
                if (mergedItems.isEmpty()) {
                    mergedByPeriod.remove(periodId);
                } else {
                    mergedByPeriod.put(periodId, mergedItems);
                }
            }

            ArrayList<String> periodIds = new ArrayList<>(mergedByPeriod.keySet());
            Collections.sort(periodIds);
            ArrayList<JSONObject> flattenedItems = new ArrayList<>();
            for (String periodId : periodIds) {
                ArrayList<JSONObject> items = mergedByPeriod.get(periodId);
                if (items != null) {
                    flattenedItems.addAll(items);
                }
            }
            sortJsonItems(section, flattenedItems);
            nextRoot.put(section, buildJsonArrayFromObjects(flattenedItems));
        }

        ArrayList<JSONObject> mergedRecurringPlans = mergePartitionItems(
            "plans",
            jsonArrayToObjectList(collectRecurringPlans(currentRoot.optJSONArray("plans"))),
            jsonArrayToObjectList(collectRecurringPlans(incomingRoot.optJSONArray("plans"))),
            true
        );
        JSONArray nextPlans = nextRoot.optJSONArray("plans");
        if (nextPlans == null) {
            nextPlans = new JSONArray();
        }
        for (JSONObject recurringPlan : mergedRecurringPlans) {
            nextPlans.put(cloneJsonObject(recurringPlan));
        }
        ArrayList<JSONObject> sortedPlans = jsonArrayToObjectList(nextPlans);
        sortJsonItems("plans", sortedPlans);
        nextRoot.put("plans", buildJsonArrayFromObjects(sortedPlans));
        nextRoot.put(
            "createdAt",
            firstNonEmpty(
                currentRoot.optString("createdAt", ""),
                incomingRoot.optString("createdAt", ""),
                isoNow()
            )
        );

        return normalizeRoot(context, nextRoot, true);
    }

    public static JSONObject preserveThemeStateIfMissing(Context context, JSONObject importedRoot)
        throws Exception {
        JSONObject source = cloneJsonObject(importedRoot);
        if (
            source.optJSONArray("customThemes") != null &&
            source.optJSONObject("builtInThemeOverrides") != null &&
            !TextUtils.isEmpty(source.optString("selectedTheme", ""))
        ) {
            return source;
        }

        JSONObject currentRoot = normalizeRoot(
            context,
            context == null ? new JSONObject() : loadRootStrict(context),
            false
        );

        if (source.optJSONArray("customThemes") == null) {
            source.put("customThemes", cloneJsonArray(currentRoot.optJSONArray("customThemes")));
        }
        if (source.optJSONObject("builtInThemeOverrides") == null) {
            source.put(
                "builtInThemeOverrides",
                cloneJsonObject(currentRoot.optJSONObject("builtInThemeOverrides"))
            );
        }
        if (TextUtils.isEmpty(source.optString("selectedTheme", ""))) {
            source.put(
                "selectedTheme",
                sanitizeJsonString(currentRoot.optString("selectedTheme", "default"))
            );
        }

        return source;
    }

    private static boolean usesDirectoryBundleStorage(Context context) {
        return !MODE_FILE.equals(getStorageMode(context));
    }

    private static JSONObject loadBundleRoot(Context context, boolean strict) throws Exception {
        return loadBundleRoot(context, strict, true);
    }

    private static JSONObject loadBundleRoot(
        Context context,
        boolean strict,
        boolean rebuildProjectDurationCaches
    ) throws Exception {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace(
            "loadBundleRoot",
            "start",
            startedAt,
            "strict=" + strict + " rebuildProjectDurationCaches=" + rebuildProjectDurationCaches
        );
        ensureBundleStorageReady(context);
        JSONObject manifest = readBundleManifest(context);
        if (manifest == null) {
            if (strict) {
                throw new Exception("同步 bundle 为空。");
            }
            JSONObject normalizedEmpty =
                normalizeRoot(context, new JSONObject(), false, rebuildProjectDurationCaches);
            logStorageTrace("loadBundleRoot", "finish", startedAt, "manifestMissing=true");
            return normalizedEmpty;
        }
        validateBundleManifest(context, manifest);

        JSONObject root = readBundleCore(context);
        if (root == null) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "bundle 缺少有效的 core.json。",
                null
            );
        }
        if (root.optJSONArray("projects") == null) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "core.json 缺少必需字段。",
                null
            );
        }
        JSONArray sections = new JSONArray()
            .put("records")
            .put("diaryEntries")
            .put("dailyCheckins")
            .put("checkins")
            .put("plans");
        JSONObject sectionsObject = manifest.optJSONObject("sections");

        for (int sectionIndex = 0; sectionIndex < sections.length(); sectionIndex += 1) {
            String section = sections.optString(sectionIndex, "");
            JSONArray mergedItems = new JSONArray();
            JSONObject sectionObject =
                sectionsObject == null ? null : sectionsObject.optJSONObject(section);
            JSONArray partitions = sectionObject == null ? null : sectionObject.optJSONArray("partitions");
            if (partitions != null) {
                for (int index = 0; index < partitions.length(); index += 1) {
                    JSONObject partition = partitions.optJSONObject(index);
                    if (partition == null) {
                        continue;
                    }
                    JSONObject envelope = readValidatedBundlePartition(
                        context,
                        section,
                        partition
                    );
                    JSONArray items = envelope.optJSONArray("items");
                    for (int itemIndex = 0; itemIndex < items.length(); itemIndex += 1) {
                        JSONObject item = items.optJSONObject(itemIndex);
                        if (item != null) {
                            mergedItems.put(cloneJsonObject(item));
                        }
                    }
                }
            }

            if ("plans".equals(section)) {
                JSONArray recurringPlans = readBundleRecurringPlans(context);
                JSONObject recurringMetadata = sectionsObject.optJSONObject("plansRecurring");
                int expectedRecurringCount = recurringMetadata.optInt("count", -1);
                if (
                    recurringPlans == null
                        || expectedRecurringCount < 0
                        || recurringPlans.length() != expectedRecurringCount
                ) {
                    throw new StorageReadException(
                        READ_STATE_CORRUPTED,
                        "plans-recurring.json 与 manifest 计数不一致。",
                        null
                    );
                }
                for (int index = 0; index < recurringPlans.length(); index += 1) {
                    JSONObject item = recurringPlans.optJSONObject(index);
                    if (item != null) {
                        mergedItems.put(cloneJsonObject(item));
                    }
                }
            }

            if ("records".equals(section)) {
                mergedItems = buildJsonArrayFromObjects(
                    mergePartitionItems(
                        section,
                        new ArrayList<>(),
                        jsonArrayToObjectList(mergedItems),
                        true
                    )
                );
            }
            root.put(section, mergedItems);
        }

        JSONObject normalizedRoot = normalizeRoot(context, root, false, rebuildProjectDurationCaches);
        normalizedRoot.put(
            "diaryMediaAssets",
            normalizeDiaryMediaAssets(
                manifest.optJSONObject("assets") == null
                    ? null
                    : manifest.optJSONObject("assets").optJSONArray("diaryMedia")
            )
        );
        logStorageTrace(
            "loadBundleRoot",
            "finish",
            startedAt,
            "recordCount="
                + (normalizedRoot.optJSONArray("records") == null
                    ? 0
                    : normalizedRoot.optJSONArray("records").length())
                + " projectCount="
                + (normalizedRoot.optJSONArray("projects") == null
                    ? 0
                    : normalizedRoot.optJSONArray("projects").length())
        );
        return normalizedRoot;
    }

    private static void validateBundleManifest(Context context, JSONObject manifest) throws Exception {
        if (
            manifest == null
                || manifest.optInt("formatVersion", -1) != BUNDLE_FORMAT_VERSION
                || !BUNDLE_MODE.equals(manifest.optString("bundleMode", ""))
        ) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "bundle-manifest.json 格式无效。",
                null
            );
        }
        JSONObject sections = manifest.optJSONObject("sections");
        JSONObject core = sections == null ? null : sections.optJSONObject("core");
        JSONObject recurring = sections == null ? null : sections.optJSONObject("plansRecurring");
        if (
            core == null
                || !BUNDLE_CORE_FILE_NAME.equals(core.optString("file", ""))
                || recurring == null
                || !BUNDLE_RECURRING_PLANS_FILE_NAME.equals(recurring.optString("file", ""))
                || !bundlePathExists(context, BUNDLE_CORE_FILE_NAME)
                || !bundlePathExists(context, BUNDLE_RECURRING_PLANS_FILE_NAME)
        ) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "bundle manifest 缺少必需文件声明。",
                null
            );
        }
    }

    private static JSONObject readValidatedBundlePartition(
        Context context,
        String section,
        JSONObject metadata
    ) throws Exception {
        String periodId = normalizePeriodId(metadata == null ? "" : metadata.optString("periodId", ""));
        String relativePath = normalizeBundleRelativePath(
            metadata == null ? "" : metadata.optString("file", "")
        );
        if (
            TextUtils.isEmpty(periodId)
                || !getPartitionRelativePath(section, periodId).equals(relativePath)
        ) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "manifest 引用的分区文件缺失或路径无效。",
                null
            );
        }
        String metadataFingerprint = metadata.optString("fingerprint", "");
        String cacheKey = section + "|" + periodId + "|" + metadataFingerprint;
        JSONObject cachedEnvelope = PROCESS_PARTITION_CACHE.get(cacheKey);
        if (cachedEnvelope != null) {
            return cachedEnvelope;
        }
        if (!bundlePathExists(context, relativePath)) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "manifest 引用的分区文件缺失或路径无效。",
                null
            );
        }
        JSONObject envelope = readBundleJsonObject(context, relativePath);
        JSONArray items = envelope == null ? null : envelope.optJSONArray("items");
        ArrayList<JSONObject> itemList = jsonArrayToObjectList(items);
        String expectedFingerprint = buildPartitionFingerprint(section, periodId, itemList);
        String legacyFingerprint = buildLegacyPartitionFingerprint(section, periodId, itemList);
        String envelopeFingerprint = envelope == null
            ? ""
            : envelope.optString("fingerprint", "");
        String manifestFingerprint = metadata.optString("fingerprint", "");
        boolean fingerprintValid =
            envelopeFingerprint.equals(manifestFingerprint)
                && (
                    expectedFingerprint.equals(envelopeFingerprint)
                        || legacyFingerprint.equals(envelopeFingerprint)
                );
        if (
            envelope == null
                || items == null
                || !section.equals(envelope.optString("section", ""))
                || !periodId.equals(envelope.optString("periodId", ""))
                || envelope.optInt("count", -1) != items.length()
                || metadata.optInt("count", -1) != items.length()
                || !fingerprintValid
        ) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "分区文件与 manifest 的 fingerprint/count 不一致。",
                null
            );
        }
        PROCESS_PARTITION_CACHE.put(cacheKey, envelope);
        return envelope;
    }

    private static boolean writeBundleRoot(Context context, JSONObject normalizedRoot) {
        boolean ownsTransaction = false;
        try {
            assertStorageWritable();
            if (MODE_DIRECTORY.equals(getStorageMode(context))) {
                clearDirectoryDocumentUriCache(context, getCustomStorageDirectoryUri(context));
            }
            JSONObject previousManifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
            JSONObject manifest = buildStorageManifest(normalizedRoot);
            if (previousManifest != null && previousManifest.optJSONArray("legacyBackups") != null) {
                manifest.put(
                    "legacyBackups",
                    cloneJsonArray(previousManifest.optJSONArray("legacyBackups"))
                );
            }
            if (!STORAGE_TRANSACTION_ACTIVE.get()) {
                LinkedHashSet<String> targets = new LinkedHashSet<>();
                targets.add(BUNDLE_MANIFEST_FILE_NAME);
                targets.addAll(collectBundleFilesFromManifest(previousManifest));
                targets.addAll(collectBundleFilesFromManifest(manifest));
                beginRollbackTransaction(context, targets);
                STORAGE_TRANSACTION_ACTIVE.set(Boolean.TRUE);
                ownsTransaction = true;
            }

            writeBundleJson(
                context,
                BUNDLE_CORE_FILE_NAME,
                buildCoreStateFromRoot(normalizedRoot)
            );
            writeBundleJson(
                context,
                BUNDLE_RECURRING_PLANS_FILE_NAME,
                collectRecurringPlans(normalizedRoot.optJSONArray("plans"))
            );

            String[] sections = new String[] {
                "records",
                "diaryEntries",
                "dailyCheckins",
                "checkins",
                "plans"
            };
            for (String section : sections) {
                Map<String, ArrayList<JSONObject>> grouped = groupItemsByPeriod(
                    section,
                    normalizedRoot.optJSONArray(section)
                );
                for (Map.Entry<String, ArrayList<JSONObject>> entry : grouped.entrySet()) {
                    writeBundleJson(
                        context,
                        getPartitionRelativePath(section, entry.getKey()),
                        buildPartitionEnvelope(section, entry.getKey(), entry.getValue())
                    );
                }
            }

            writeBundleJson(context, BUNDLE_MANIFEST_FILE_NAME, manifest);
            deleteStaleBundleFiles(context, previousManifest, manifest);
            deleteIgnoredBundleArtifacts(context, "writeBundleRoot");
            if (ownsTransaction) completeRollbackTransaction(context);
            return true;
        } catch (Exception error) {
            if (ownsTransaction) {
                try {
                    rollbackActiveTransaction(context, error);
                } catch (Exception rollbackError) {
                    rollbackError.printStackTrace();
                }
            }
            error.printStackTrace();
            return false;
        } finally {
            if (ownsTransaction) STORAGE_TRANSACTION_ACTIVE.set(Boolean.FALSE);
        }
    }

    private static JSONObject readBundleManifest(Context context) {
        try {
            ensureBundleStorageReady(context);
            return readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject readBundleCore(Context context) {
        try {
            return readBundleJsonObject(context, BUNDLE_CORE_FILE_NAME);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONArray readBundleRecurringPlans(Context context) {
        try {
            return readBundleJsonArray(context, BUNDLE_RECURRING_PLANS_FILE_NAME);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject readBundleCoreState(Context context) {
        try {
            ensureBundleStorageReady(context);
            JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
            if (manifest == null && isDefaultBundleUninitialized(context)) {
                setStorageReadState(READ_STATE_NOT_FOUND, "默认存储尚未创建。");
                return null;
            }
            if (manifest == null) {
                throw new StorageReadException(
                    READ_STATE_NOT_FOUND,
                    "已绑定的存储目录缺少 bundle-manifest.json。",
                    null
                );
            }
            validateBundleManifest(context, manifest);
            JSONObject core = loadBundleCoreWithProjectDurationCache(context);
            JSONArray recurringPlans = readBundleRecurringPlans(context);
            JSONObject recurringMetadata = manifest
                .getJSONObject("sections")
                .getJSONObject("plansRecurring");
            if (
                core == null
                    || core.optJSONArray("projects") == null
                    || recurringPlans == null
                    || recurringMetadata.optInt("count", -1) != recurringPlans.length()
            ) {
                throw new Exception("core 或 plans-recurring 与 manifest 不一致。");
            }
            core.put("recurringPlans", recurringPlans);
            setStorageReadState(READ_STATE_VALID, "");
            return core;
        } catch (Exception error) {
            recordStorageReadFailure(
                error,
                "存储授权已失效，无法读取 core bundle 数据。",
                "无法读取有效的 core bundle 数据。"
            );
            return null;
        }
    }

    private static JSONObject loadBundleSectionRange(
        Context context,
        String section,
        JSONObject scope
    ) throws Exception {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace(
            "loadBundleSectionRange",
            "start",
            startedAt,
            "section=" + safeText(section) + " " + summarizeScope(scope)
        );
        ensureBundleStorageReady(context);
        JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        if (manifest == null && isDefaultBundleUninitialized(context)) {
            setStorageReadState(READ_STATE_NOT_FOUND, "默认存储尚未创建。");
            return buildSectionRangeResult(
                section,
                scope,
                new ArrayList<>(),
                new ArrayList<>()
            );
        }
        if (manifest == null) {
            throw new StorageReadException(
                READ_STATE_NOT_FOUND,
                "已绑定的存储目录缺少 bundle-manifest.json。",
                null
            );
        }
        validateBundleManifest(context, manifest);
        Set<String> requestedPeriodIds = resolveRequestedPeriodIds(section, scope);
        ArrayList<JSONObject> matchedItems = new ArrayList<>();
        ArrayList<String> matchedPeriodIds = new ArrayList<>();
        SectionDateRange dateRange = resolveSectionDateRange(scope);

        JSONObject sectionObject =
            manifest == null || manifest.optJSONObject("sections") == null
                ? null
                : manifest.optJSONObject("sections").optJSONObject(section);
        if (sectionObject == null || sectionObject.optJSONArray("partitions") == null) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "manifest 缺少分区 section: " + section,
                null
            );
        }
        JSONArray partitions = sectionObject == null ? null : sectionObject.optJSONArray("partitions");
        if (partitions != null) {
            for (int index = 0; index < partitions.length(); index += 1) {
                JSONObject partition = partitions.optJSONObject(index);
                if (partition == null) {
                    continue;
                }
                String periodId = normalizePeriodId(partition.optString("periodId", ""));
                if (!requestedPeriodIds.isEmpty() && !requestedPeriodIds.contains(periodId)) {
                    continue;
                }
                JSONObject envelope = readValidatedBundlePartition(context, section, partition);
                JSONArray items = envelope.optJSONArray("items");
                for (int itemIndex = 0; itemIndex < items.length(); itemIndex += 1) {
                    JSONObject item = items.optJSONObject(itemIndex);
                    if (item != null && sectionItemMatchesScope(section, item, dateRange)) {
                        matchedItems.add(item);
                    }
                }
                if (!TextUtils.isEmpty(periodId)) {
                    matchedPeriodIds.add(periodId);
                }
            }
        }

        if ("records".equals(section) && matchedPeriodIds.size() > 1) {
            Map<String, JSONObject> uniqueItems = new LinkedHashMap<>();
            for (JSONObject item : matchedItems) {
                uniqueItems.put(buildPartitionMergeKey(section, item), item);
            }
            matchedItems = new ArrayList<>(uniqueItems.values());
        }
        Collections.sort(matchedPeriodIds);
        sortJsonItems(section, matchedItems);

        JSONObject result = buildSectionRangeResult(
            section,
            scope,
            matchedPeriodIds,
            matchedItems
        );
        logStorageTrace(
            "loadBundleSectionRange",
            "finish",
            startedAt,
            "section="
                + safeText(section)
                + " itemCount="
                + matchedItems.size()
                + " periodCount="
                + matchedPeriodIds.size()
        );
        return result;
    }

    private static JSONObject buildSectionRangeResult(
        String section,
        JSONObject scope,
        List<String> periodIds,
        List<JSONObject> items
    ) throws Exception {
        JSONObject result = new JSONObject();
        result.put("section", section);
        result.put("periodUnit", PERIOD_UNIT);
        result.put(
            "periodIds",
            buildJsonArrayFromStrings(
                periodIds == null ? new ArrayList<>() : new ArrayList<>(periodIds)
            )
        );
        putNullableString(
            result,
            "startDate",
            normalizeDateText(
                scope == null
                    ? ""
                    : firstNonEmpty(scope.optString("startDate", ""), scope.optString("start", ""))
            )
        );
        putNullableString(
            result,
            "endDate",
            normalizeDateText(
                scope == null
                    ? ""
                    : firstNonEmpty(scope.optString("endDate", ""), scope.optString("end", ""))
            )
        );
        JSONArray resultItems = new JSONArray();
        if (items != null) {
            for (JSONObject item : items) {
                resultItems.put(item);
            }
        }
        result.put("items", resultItems);
        return result;
    }

    private static SectionDateRange resolveSectionDateRange(JSONObject scope) {
        String startDate = normalizeDateText(
            scope == null
                ? ""
                : firstNonEmpty(scope.optString("startDate", ""), scope.optString("start", ""))
        );
        String endDate = normalizeDateText(
            scope == null
                ? ""
                : firstNonEmpty(scope.optString("endDate", ""), scope.optString("end", ""))
        );
        if (TextUtils.isEmpty(startDate) || TextUtils.isEmpty(endDate)) {
            return null;
        }

        String lowerDate = startDate.compareTo(endDate) <= 0 ? startDate : endDate;
        String upperDate = startDate.compareTo(endDate) <= 0 ? endDate : startDate;
        Calendar lowerCalendar = calendarFromDateText(lowerDate);
        Calendar upperCalendar = calendarFromDateText(upperDate);
        if (lowerCalendar == null || upperCalendar == null) {
            return new SectionDateRange(lowerDate, upperDate, -1L, -1L);
        }
        upperCalendar.add(Calendar.DAY_OF_MONTH, 1);
        return new SectionDateRange(
            lowerDate,
            upperDate,
            lowerCalendar.getTimeInMillis(),
            upperCalendar.getTimeInMillis()
        );
    }

    private static boolean sectionItemMatchesScope(
        String section,
        JSONObject item,
        SectionDateRange dateRange
    ) {
        String normalizedSection = normalizeBundleSection(section);
        if (item == null || TextUtils.isEmpty(normalizedSection)) {
            return false;
        }
        if (dateRange == null) {
            return true;
        }
        if ("records".equals(normalizedSection)) {
            return recordOverlapsDateScope(item, dateRange);
        }

        String itemDateKey = getSectionItemDateKey(normalizedSection, item);
        if (TextUtils.isEmpty(itemDateKey)) {
            return false;
        }
        return itemDateKey.compareTo(dateRange.lowerDate) >= 0
            && itemDateKey.compareTo(dateRange.upperDate) <= 0;
    }

    private static boolean recordOverlapsDateScope(
        JSONObject record,
        SectionDateRange dateRange
    ) {
        if (record == null || dateRange == null) {
            return record != null;
        }

        String startTime = firstNonEmpty(
            record.optString("startTime", ""),
            record.optString("timestamp", ""),
            record.optString("endTime", "")
        );
        String endTime = firstNonEmpty(
            record.optString("endTime", ""),
            record.optString("timestamp", ""),
            record.optString("startTime", "")
        );
        String startDate = normalizeDateText(startTime);
        String endDate = normalizeDateText(endTime);
        if (!TextUtils.isEmpty(startDate) && !TextUtils.isEmpty(endDate)) {
            if (endDate.compareTo(startDate) < 0) {
                String swappedDate = startDate;
                startDate = endDate;
                endDate = swappedDate;
                String swappedTime = startTime;
                startTime = endTime;
                endTime = swappedTime;
            }
            if (
                endDate.compareTo(dateRange.lowerDate) < 0
                    || startDate.compareTo(dateRange.upperDate) > 0
            ) {
                return false;
            }
            if (endDate.compareTo(dateRange.lowerDate) > 0) {
                return true;
            }
            long boundaryEndTimeMs = parseRecordTimestampMs(endTime);
            return boundaryEndTimeMs < 0L
                || dateRange.lowerTimeMs < 0L
                || boundaryEndTimeMs > dateRange.lowerTimeMs;
        }

        long startTimeMs = parseRecordTimestampMs(startTime);
        long endTimeMs = parseRecordTimestampMs(endTime);

        if (startTimeMs < 0L && endTimeMs < 0L) {
            String anchorDate = getSectionItemDateKey("records", record);
            if (TextUtils.isEmpty(anchorDate)) {
                return false;
            }
            return anchorDate.compareTo(dateRange.lowerDate) >= 0
                && anchorDate.compareTo(dateRange.upperDate) <= 0;
        }
        if (startTimeMs < 0L) {
            startTimeMs = endTimeMs;
        }
        if (endTimeMs < 0L) {
            endTimeMs = startTimeMs;
        }
        if (endTimeMs < startTimeMs) {
            long swapped = startTimeMs;
            startTimeMs = endTimeMs;
            endTimeMs = swapped;
        }

        if (dateRange.lowerTimeMs < 0L || dateRange.upperExclusiveTimeMs < 0L) {
            return true;
        }
        return endTimeMs > dateRange.lowerTimeMs
            && startTimeMs < dateRange.upperExclusiveTimeMs;
    }

    private static JSONObject saveBundleSectionRange(
        Context context,
        String section,
        JSONObject payload
    ) throws Exception {
        ensureBundleStorageReady(context);
        String periodId = normalizePeriodId(payload == null ? "" : payload.optString("periodId", ""));
        JSONArray incomingArray = payload == null ? null : payload.optJSONArray("items");
        if (!validateItemsForPeriod(section, periodId, incomingArray)) {
            throw new Exception("分区文件中的项目不属于目标月份");
        }

        JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        if (manifest == null) {
            manifest = buildStorageManifest(normalizeRoot(context, new JSONObject(), false));
        }

        String relativePath = getPartitionRelativePath(section, periodId);
        JSONObject existingEnvelope = readBundlePartitionEnvelopeWithConflictRecovery(
            context,
            section,
            periodId,
            relativePath
        );
        ArrayList<JSONObject> existingItems =
            jsonArrayToObjectList(
                existingEnvelope == null ? null : existingEnvelope.optJSONArray("items")
            );
        ArrayList<JSONObject> incomingItems = jsonArrayToObjectList(incomingArray);
        JSONObject currentCore = null;
        ArrayList<JSONObject> normalizedExistingItems = existingItems;
        ArrayList<JSONObject> normalizedIncomingItems = incomingItems;
        if ("records".equals(section)) {
            currentCore = loadBundleCoreWithProjectDurationCache(context);
            ArrayList<JSONObject> currentProjects =
                jsonArrayToObjectList(currentCore.optJSONArray("projects"));
            normalizedExistingItems = attachProjectIdsToRecords(existingItems, currentProjects);
            normalizedIncomingItems = attachProjectIdsToRecords(incomingItems, currentProjects);
        }
        String mode = payload == null ? "replace" : payload.optString("mode", "replace");
        ArrayList<JSONObject> mergedItems =
            "records".equals(section) && "patch".equals(mode)
                ? applyRecordPartitionPatch(
                    normalizedExistingItems,
                    normalizedIncomingItems,
                    payload == null ? null : payload.optJSONArray("removedItems"),
                    payload == null ? null : payload.optJSONArray("removeIds")
                )
                : mergePartitionItems(
                    section,
                    normalizedExistingItems,
                    normalizedIncomingItems,
                    "merge".equals(mode)
                );
        boolean deletePartitionAfterManifestCommit = mergedItems.isEmpty();

        if (!deletePartitionAfterManifestCommit) {
            writeBundleJson(
                context,
                relativePath,
                buildPartitionEnvelope(section, periodId, mergedItems)
            );
        }

        updateManifestSectionPartition(manifest, section, periodId, mergedItems);
        if ("records".equals(section) && currentCore != null) {
            currentCore.put(
                "projects",
                buildJsonArrayFromObjects(
                    applyProjectRecordDurationChanges(
                        jsonArrayToObjectList(currentCore.optJSONArray("projects")),
                        filterRecordDurationCacheOwners(periodId, normalizedExistingItems),
                        filterRecordDurationCacheOwners(periodId, mergedItems)
                    )
                )
            );
            touchBundleMetadata(context, manifest, currentCore);
        } else {
            touchBundleMetadata(context, manifest);
        }
        if (deletePartitionAfterManifestCommit) {
            deleteBundlePath(context, relativePath);
        }

        JSONObject result = new JSONObject();
        result.put("section", section);
        result.put("periodId", periodId);
        result.put("count", mergedItems.size());
        return result;
    }

    private static JSONObject replaceBundleCoreState(
        Context context,
        JSONObject partialCore
    ) throws Exception {
        ensureBundleStorageReady(context);
        JSONObject previousCore = loadBundleCoreWithProjectDurationCache(context);
        JSONObject core = cloneJsonObject(previousCore);
        JSONObject source = partialCore == null ? new JSONObject() : partialCore;
        String[] mutableKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
            "checkinHistorySummary",
            "timerSessionState",
            "yearlyGoals",
            "diaryCategories",
            "guideState",
            "customThemes",
            "builtInThemeOverrides",
            "selectedTheme",
            "todoSortPreference",
            "createdAt",
            "storagePath",
            "storageDirectory",
            "userDataPath",
            "documentsPath",
            "syncMeta"
        };
        for (String key : mutableKeys) {
            if (source.has(key)) {
                core.put(key, cloneJsonValue(source.opt(key)));
            }
        }

        if (source.has("projects")) {
            core.put(
                "projects",
                buildJsonArrayFromObjects(
                    reconcileProjectDurationCaches(
                        jsonArrayToObjectList(source.optJSONArray("projects")),
                        jsonArrayToObjectList(previousCore.optJSONArray("projects"))
                    )
                )
            );
        } else {
            // Preserve the existing duration cache for non-project core writes so
            // timer/theme/todo/checkin updates stay on the lightweight path.
            core.put(
                "projects",
                cloneJsonArray(previousCore.optJSONArray("projects"))
            );
        }

        JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        touchBundleMetadata(context, manifest, core);
        return buildCoreStateReplaceResult(source);
    }

    private static JSONArray replaceBundleRecurringPlans(
        Context context,
        JSONArray items
    ) throws Exception {
        ensureBundleStorageReady(context);
        ArrayList<JSONObject> recurringPlans = new ArrayList<>();
        if (items != null) {
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item != null && isRecurringPlan(item)) {
                    recurringPlans.add(cloneJsonObject(item));
                }
            }
        }
        writeBundleJson(
            context,
            BUNDLE_RECURRING_PLANS_FILE_NAME,
            buildJsonArrayFromObjects(recurringPlans)
        );

        JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        if (manifest == null) {
            manifest = buildStorageManifest(normalizeRoot(context, new JSONObject(), false));
        }
        JSONObject sections = manifest.optJSONObject("sections");
        if (sections == null) {
            sections = new JSONObject();
            manifest.put("sections", sections);
        }
        sections.put(
            "plansRecurring",
            new JSONObject()
                .put("file", BUNDLE_RECURRING_PLANS_FILE_NAME)
                .put("count", recurringPlans.size())
        );
        touchBundleMetadata(context, manifest);
        return buildJsonArrayFromObjects(recurringPlans);
    }

    private static void ensureBundleStorageReady(Context context) throws Exception {
        ensureBoundStorageReadable(context);
        recoverRollbackTransaction(context);
        if (!usesDirectoryBundleStorage(context)) {
            return;
        }
        if (canUseBundleStorageReadyCache(context)) {
            return;
        }

        String previousRecoveryState = getStorageRecoveryState();
        JSONObject manifest = tryReadBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        if (manifest != null) {
            validateBundleManifest(context, manifest);
            if (!STORAGE_RECOVERY_STATE_OK.equals(previousRecoveryState)) {
                setStorageRecoveryState(STORAGE_RECOVERY_STATE_OK, "");
            }
            markBundleStorageReadyVerified(context);
            return;
        }

        BundleArtifactInspection inspection = inspectBundleArtifacts(context);
        if (inspection.manifestExists || inspection.hasBundleArtifacts()) {
            String recoveryMessage =
                "检测到 bundle 文件缺失、损坏或与 manifest 不一致，已停止读写以等待恢复。";
            failStorageRead(READ_STATE_CORRUPTED, recoveryMessage);
            throw new StorageReadException(READ_STATE_CORRUPTED, recoveryMessage, null);
        }

        if (inspection.legacyExists) {
            if (MODE_DIRECTORY.equals(getStorageMode(context))) {
                Uri directoryUri = getCustomStorageDirectoryUri(context);
                Uri legacyDocument =
                    resolveDirectoryRelativeDocumentUri(
                        context,
                        directoryUri,
                        "controler-data.json",
                        false,
                        false
                    );
                if (legacyDocument != null) {
                    migrateLegacyDirectoryDocumentToBundle(context, directoryUri, legacyDocument);
                }
            } else {
                File legacyFile = getStorageFile(context);
                if (legacyFile.exists()) {
                    migrateLegacyLocalFileToBundle(context, legacyFile);
                }
            }
            if (!STORAGE_RECOVERY_STATE_OK.equals(previousRecoveryState)) {
                setStorageRecoveryState(STORAGE_RECOVERY_STATE_OK, "");
            }
            markBundleStorageReadyVerified(context);
            return;
        }

        if (!STORAGE_RECOVERY_STATE_OK.equals(previousRecoveryState)) {
            setStorageRecoveryState(STORAGE_RECOVERY_STATE_OK, "");
        }
        markBundleStorageReadyVerified(context);
    }

    private static BundleArtifactInspection inspectBundleArtifacts(Context context) {
        BundleArtifactInspection inspection = new BundleArtifactInspection();
        inspection.manifestExists = bundlePathExists(context, BUNDLE_MANIFEST_FILE_NAME);
        inspection.coreExists = bundlePathExists(context, BUNDLE_CORE_FILE_NAME);
        inspection.recurringExists = bundlePathExists(context, BUNDLE_RECURRING_PLANS_FILE_NAME);
        if (inspection.manifestExists) {
            inspection.manifest = tryReadBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
            inspection.manifestInvalid = inspection.manifest == null;
        }
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            if (!inspection.manifestExists || inspection.manifestInvalid) {
                inspection.partitionFiles.addAll(
                    listBundlePartitionRelativePaths(context, directoryUri, null)
                );
            }
            boolean hasBundleArtifacts =
                inspection.manifestExists
                    || inspection.coreExists
                    || inspection.recurringExists
                    || !inspection.partitionFiles.isEmpty();
            if (!hasBundleArtifacts) {
                inspection.legacyExists =
                    resolveDirectoryRelativeDocumentUri(
                        context,
                        directoryUri,
                        "controler-data.json",
                        false,
                        false
                    ) != null;
            }
        } else {
            File legacyFile = getStorageFile(context);
            if (!inspection.manifestExists || inspection.manifestInvalid) {
                inspection.partitionFiles.addAll(
                    listBundlePartitionRelativePaths(
                        context,
                        null,
                        getDefaultBundleRootDirectory(context)
                    )
                );
            }
            boolean hasBundleArtifacts =
                inspection.manifestExists
                    || inspection.coreExists
                    || inspection.recurringExists
                    || !inspection.partitionFiles.isEmpty();
            if (!hasBundleArtifacts) {
                inspection.legacyExists = legacyFile != null && legacyFile.exists();
            }
        }
        return inspection;
    }

    private static boolean isDefaultBundleUninitialized(Context context) {
        return MODE_DEFAULT.equals(getStorageMode(context))
            && !inspectBundleArtifacts(context).hasAnyArtifacts();
    }

    private static JSONObject tryReadBundleJsonObject(Context context, String relativePath) {
        try {
            return readBundleJsonObject(context, relativePath);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject buildCoreStateFromRoot(JSONObject root) {
        JSONObject core = new JSONObject();
        try {
            core.put("projects", cloneJsonArray(root.optJSONArray("projects")));
            core.put("todos", cloneJsonArray(root.optJSONArray("todos")));
            core.put("checkinItems", cloneJsonArray(root.optJSONArray("checkinItems")));
            core.put(
                "checkinHistorySummary",
                resolveCheckinHistorySummaryForCore(
                    root.optJSONObject("checkinHistorySummary"),
                    root.optJSONArray("dailyCheckins"),
                    root.optJSONArray("checkinItems")
                )
            );
            core.put("timerSessionState", cloneJsonObject(root.optJSONObject("timerSessionState")));
            core.put("yearlyGoals", cloneJsonObject(root.optJSONObject("yearlyGoals")));
            core.put("diaryCategories", cloneJsonArray(root.optJSONArray("diaryCategories")));
            core.put("guideState", cloneJsonObject(root.optJSONObject("guideState")));
            core.put("customThemes", cloneJsonArray(root.optJSONArray("customThemes")));
            core.put(
                "builtInThemeOverrides",
                cloneJsonObject(root.optJSONObject("builtInThemeOverrides"))
            );
            core.put(
                "selectedTheme",
                sanitizeJsonString(root.optString("selectedTheme", "default"))
            );
            core.put(
                "todoSortPreference",
                sanitizeJsonString(root.optString("todoSortPreference", "dueDate"))
            );
            core.put("createdAt", sanitizeJsonString(root.optString("createdAt", isoNow())));
            core.put(
                "lastModified",
                sanitizeJsonString(root.optString("lastModified", root.optString("createdAt", isoNow())))
            );
            putNullableString(core, "storagePath", root.optString("storagePath", ""));
            putNullableString(core, "storageDirectory", root.optString("storageDirectory", ""));
            putNullableString(core, "userDataPath", root.optString("userDataPath", ""));
            putNullableString(core, "documentsPath", root.optString("documentsPath", ""));
            core.put("syncMeta", cloneJsonObject(root.optJSONObject("syncMeta")));
        } catch (Exception error) {
            error.printStackTrace();
        }
        return core;
    }

    public static synchronized JSONObject appendStorageJournal(Context context, JSONObject payload) throws Exception {
        JSONObject source = payload == null ? new JSONObject() : payload;
        JSONArray operations = source.optJSONArray("ops");
        return executeStorageTransaction(
            context,
            operations == null ? new JSONArray() : cloneJsonArray(operations)
        );
    }

    private static JSONObject applyStorageOperations(Context context, JSONArray operations)
        throws Exception {
        JSONArray results = new JSONArray();
        LinkedHashSet<String> changedSections = new LinkedHashSet<>();
        JSONObject changedPeriods = new JSONObject();
        if (operations != null) {
            for (int index = 0; index < operations.length(); index += 1) {
                JSONObject operation = operations.optJSONObject(index);
                if (operation == null) {
                    continue;
                }
                String kind = safeText(operation.optString("kind", ""));
                if ("replaceCoreState".equals(kind)) {
                    JSONObject partialCore = operation.optJSONObject("partialCore");
                    results.put(replaceStorageCoreState(context, partialCore));
                    for (String section : inferBootstrapChangedSectionsFromCorePatch(partialCore)) {
                        changedSections.add(section);
                    }
                    continue;
                }
                if ("saveSectionRange".equals(kind)) {
                    String section = safeText(operation.optString("section", ""));
                    JSONObject sectionPayload = operation.optJSONObject("payload");
                    if (TextUtils.isEmpty(section)) {
                        continue;
                    }
                    JSONObject result = saveStorageSectionRange(context, section, sectionPayload);
                    results.put(result);
                    changedSections.add(section);
                    String periodId =
                        sectionPayload == null
                            ? ""
                            : normalizePeriodId(sectionPayload.optString("periodId", ""));
                    if (!TextUtils.isEmpty(periodId)) {
                        JSONArray sectionPeriods = changedPeriods.optJSONArray(section);
                        if (sectionPeriods == null) {
                            sectionPeriods = new JSONArray();
                            changedPeriods.put(section, sectionPeriods);
                        }
                        sectionPeriods.put(periodId);
                    }
                    continue;
                }
                if ("replaceRecurringPlans".equals(kind)) {
                    JSONArray items = operation.optJSONArray("items");
                    replaceStorageRecurringPlans(context, items);
                    results.put(buildRecurringPlansReplaceResult(items));
                    changedSections.add("plansRecurring");
                }
            }
        }

        JSONObject result = new JSONObject();
        StorageVersion version = probeStorageVersion(context, false);
        result.put("ok", true);
        result.put("results", results);
        result.put("changedSections", buildJsonArrayFromStrings(new ArrayList<>(changedSections)));
        result.put("changedPeriods", changedPeriods);
        result.put("snapshotVersion", version == null ? "" : safeText(version.fingerprint));
        result.put("generatedAt", isoNow());
        return result;
    }

    private static JSONObject executeStorageTransaction(Context context, JSONArray operations)
        throws Exception {
        if (STORAGE_TRANSACTION_ACTIVE.get()) {
            return applyStorageOperations(context, operations);
        }

        JSONArray safeOperations = operations == null ? new JSONArray() : cloneJsonArray(operations);
        validateStorageOperations(safeOperations);
        assertStorageWritable();
        initializeDefaultBundleIfNeeded(context);
        beginRollbackTransaction(context, collectOperationTransactionTargets(context, safeOperations));
        STORAGE_TRANSACTION_ACTIVE.set(Boolean.TRUE);
        try {
            JSONObject result = applyStorageOperations(context, safeOperations);
            completeRollbackTransaction(context);
            return result;
        } catch (Exception error) {
            rollbackActiveTransaction(context, error);
            throw error;
        } finally {
            STORAGE_TRANSACTION_ACTIVE.set(Boolean.FALSE);
        }
    }

    private static void initializeDefaultBundleIfNeeded(Context context) throws Exception {
        if (!usesDirectoryBundleStorage(context) || !isDefaultBundleUninitialized(context)) {
            return;
        }
        JSONObject emptyRoot = normalizeRoot(context, new JSONObject(), false);
        if (!saveRoot(context, emptyRoot)) {
            throw new Exception("无法初始化默认 bundle 存储。");
        }
    }

    private static void validateStorageOperations(JSONArray operations) throws Exception {
        for (int index = 0; index < operations.length(); index += 1) {
            JSONObject operation = operations.optJSONObject(index);
            if (operation == null) {
                throw new Exception("存储事务包含无效操作。");
            }
            String kind = safeText(operation.optString("kind", ""));
            if ("replaceCoreState".equals(kind)) {
                if (operation.optJSONObject("partialCore") == null) {
                    throw new Exception("replaceCoreState 缺少 partialCore。");
                }
                continue;
            }
            if ("saveSectionRange".equals(kind)) {
                String section = normalizeBundleSection(operation.optString("section", ""));
                JSONObject sectionPayload = operation.optJSONObject("payload");
                String periodId = normalizePeriodId(
                    sectionPayload == null ? "" : sectionPayload.optString("periodId", "")
                );
                if (TextUtils.isEmpty(section) || TextUtils.isEmpty(periodId)) {
                    throw new Exception("saveSectionRange 的 section 或 periodId 无效。");
                }
                if (!validateItemsForPeriod(section, periodId, sectionPayload.optJSONArray("items"))) {
                    throw new Exception("分区文件中的项目不属于目标月份。");
                }
                continue;
            }
            if ("replaceRecurringPlans".equals(kind)) {
                if (operation.optJSONArray("items") == null) {
                    throw new Exception("replaceRecurringPlans 缺少 items。");
                }
                continue;
            }
            throw new Exception("不支持的存储事务操作: " + kind);
        }
    }

    private static File getRollbackTransactionFile(Context context) {
        File directory = new File(context.getFilesDir(), STORAGE_TRANSACTION_DIRECTORY);
        return new File(directory, STORAGE_TRANSACTION_FILE);
    }

    private static File getLegacyStorageTransactionFile(Context context) {
        return new File(
            new File(context.getFilesDir(), STORAGE_TRANSACTION_DIRECTORY),
            LEGACY_STORAGE_TRANSACTION_FILE
        );
    }

    private static LinkedHashSet<String> collectOperationTransactionTargets(
        Context context,
        JSONArray operations
    ) {
        LinkedHashSet<String> targets = new LinkedHashSet<>();
        if (!usesDirectoryBundleStorage(context)) {
            targets.add(SINGLE_FILE_TRANSACTION_TARGET);
            return targets;
        }
        targets.add(BUNDLE_CORE_FILE_NAME);
        targets.add(BUNDLE_MANIFEST_FILE_NAME);
        for (int index = 0; operations != null && index < operations.length(); index += 1) {
            JSONObject operation = operations.optJSONObject(index);
            String kind = operation == null ? "" : operation.optString("kind", "");
            if ("saveSectionRange".equals(kind)) {
                JSONObject payload = operation.optJSONObject("payload");
                String section = normalizeBundleSection(operation.optString("section", ""));
                String periodId = normalizePeriodId(
                    payload == null ? "" : payload.optString("periodId", "")
                );
                targets.add(getPartitionRelativePath(section, periodId));
            } else if ("replaceRecurringPlans".equals(kind)) {
                targets.add(BUNDLE_RECURRING_PLANS_FILE_NAME);
            }
        }
        return targets;
    }

    private static String getStorageBindingKey(Context context) {
        String mode = getStorageMode(context);
        if (MODE_FILE.equals(mode)) {
            Uri uri = getCustomStorageUri(context);
            return MODE_FILE + ":" + (uri == null ? "" : uri.toString());
        }
        if (MODE_DIRECTORY.equals(mode)) {
            Uri uri = getCustomStorageDirectoryUri(context);
            return MODE_DIRECTORY + ":" + (uri == null ? "" : uri.toString());
        }
        File root = getDefaultBundleRootDirectory(context);
        return MODE_DEFAULT + ":" + (root == null ? "" : root.getAbsolutePath());
    }

    private static void beginRollbackTransaction(Context context, Set<String> targetPaths)
        throws Exception {
        recoverRollbackTransaction(context);
        File transactionFile = getRollbackTransactionFile(context);
        File transactionDirectory = transactionFile.getParentFile();
        if (transactionDirectory.exists()) deleteRollbackDirectory(context, transactionDirectory);
        if (!transactionDirectory.mkdirs() && !transactionDirectory.isDirectory()) {
            throw new Exception("无法创建存储回滚目录。");
        }
        File backupDirectory = new File(transactionDirectory, "backups");
        if (!backupDirectory.mkdirs() && !backupDirectory.isDirectory()) {
            throw new Exception("无法创建存储回滚备份目录。");
        }

        JSONObject transaction = new JSONObject();
        transaction.put("id", UUID.randomUUID().toString());
        transaction.put("state", "prepared");
        transaction.put("createdAt", isoNow());
        transaction.put("storageBinding", getStorageBindingKey(context));
        JSONArray entries = new JSONArray();
        int index = 0;
        for (String targetPath : targetPaths) {
            boolean existed = transactionTargetExists(context, targetPath);
            String oldContent = existed ? readTransactionTarget(context, targetPath) : "";
            String backupName = index + ".bak";
            writeTextToFile(new File(backupDirectory, backupName), oldContent);
            JSONObject entry = new JSONObject();
            entry.put("path", targetPath);
            entry.put("existed", existed);
            entry.put("backup", backupName);
            entry.put("oldSha256", sha256Text(oldContent));
            entries.put(entry);
            index += 1;
        }
        transaction.put("targets", entries);
        String manifest = bundlePathExists(context, BUNDLE_MANIFEST_FILE_NAME)
            ? readBundleText(context, BUNDLE_MANIFEST_FILE_NAME)
            : "";
        transaction.put("originalManifestFingerprint", sha256Text(manifest));
        writeTextToFile(transactionFile, transaction.toString());
    }

    private static void completeRollbackTransaction(Context context) throws Exception {
        File transactionFile = getRollbackTransactionFile(context);
        JSONObject transaction = new JSONObject(readTextFromFile(transactionFile));
        JSONArray targets = transaction.optJSONArray("targets");
        for (int index = 0; targets != null && index < targets.length(); index += 1) {
            JSONObject entry = targets.getJSONObject(index);
            String path = entry.getString("path");
            boolean exists = transactionTargetExists(context, path);
            entry.put("expectedExists", exists);
            entry.put(
                "expectedSha256",
                exists ? sha256Text(readTransactionTarget(context, path)) : ""
            );
        }
        transaction.put("state", "written");
        transaction.put("writtenAt", isoNow());
        writeTextToFile(transactionFile, transaction.toString());
        if (!validateTransactionTargets(context, transaction, true)) {
            throw new Exception("写入后的存储文件校验失败。");
        }
        clearRollbackTransaction(context);
        invalidateProcessStorageCaches();
    }

    private static void recoverRollbackTransaction(Context context) throws Exception {
        if (context == null || STORAGE_TRANSACTION_ACTIVE.get()) {
            return;
        }
        File legacyFile = getLegacyStorageTransactionFile(context);
        File transactionFile = getRollbackTransactionFile(context);
        if (legacyFile.exists() && !transactionFile.exists()) {
            String message = "检测到旧版未完成的操作重放日志，已停止写入以避免重复应用。";
            failStorageRead(READ_STATE_CORRUPTED, message);
            throw new Exception(message);
        }
        if (!transactionFile.exists()) {
            return;
        }
        JSONObject transaction = new JSONObject(readTextFromFile(transactionFile));
        if (!getStorageBindingKey(context).equals(transaction.optString("storageBinding", ""))) {
            String message = "存储绑定已变化，无法安全应用上次写入的回滚日志。";
            failStorageRead(READ_STATE_UNREADABLE, message);
            throw new Exception(message);
        }
        if (
            "written".equals(transaction.optString("state", ""))
                && validateTransactionTargets(context, transaction, true)
        ) {
            clearRollbackTransaction(context);
            return;
        }
        STORAGE_TRANSACTION_ACTIVE.set(Boolean.TRUE);
        try {
            restoreTransactionTargets(context, transaction);
            if (!validateTransactionTargets(context, transaction, false)) {
                throw new Exception("回滚后的文件校验失败。");
            }
            clearRollbackTransaction(context);
            setStorageRecoveryState(
                STORAGE_RECOVERY_STATE_REPAIRED,
                "已回滚上次中断的存储写入。"
            );
            setStorageReadState(READ_STATE_VALID, "");
        } catch (Exception error) {
            String message = "上次写入中断且无法自动回滚，存储已进入只读恢复状态。";
            failStorageRead(READ_STATE_CORRUPTED, message);
            throw new Exception(message, error);
        } finally {
            STORAGE_TRANSACTION_ACTIVE.set(Boolean.FALSE);
        }
    }

    private static void rollbackActiveTransaction(Context context, Exception cause) throws Exception {
        try {
            JSONObject transaction = new JSONObject(readTextFromFile(getRollbackTransactionFile(context)));
            restoreTransactionTargets(context, transaction);
            if (validateTransactionTargets(context, transaction, false)) {
                clearRollbackTransaction(context);
                return;
            }
        } catch (Exception rollbackError) {
            cause.addSuppressed(rollbackError);
        }
        String message = "写入失败且无法恢复旧数据，存储已进入只读恢复状态。";
        failStorageRead(READ_STATE_CORRUPTED, message);
        throw new Exception(message, cause);
    }

    private static void restoreTransactionTargets(Context context, JSONObject transaction)
        throws Exception {
        JSONArray targets = transaction.optJSONArray("targets");
        File backupDirectory = new File(
            getRollbackTransactionFile(context).getParentFile(),
            "backups"
        );
        for (int pass = 0; pass < 2; pass += 1) {
            for (int index = 0; targets != null && index < targets.length(); index += 1) {
                JSONObject entry = targets.getJSONObject(index);
                String path = entry.getString("path");
                boolean manifest = BUNDLE_MANIFEST_FILE_NAME.equals(path);
                if ((pass == 0 && manifest) || (pass == 1 && !manifest)) continue;
                if (entry.optBoolean("existed", false)) {
                    String content = readTextFromFile(
                        new File(backupDirectory, entry.getString("backup"))
                    );
                    writeTransactionTarget(context, path, content);
                } else {
                    deleteTransactionTarget(context, path);
                }
            }
        }
    }

    private static boolean validateTransactionTargets(
        Context context,
        JSONObject transaction,
        boolean expected
    ) {
        try {
            JSONArray targets = transaction.optJSONArray("targets");
            for (int index = 0; targets != null && index < targets.length(); index += 1) {
                JSONObject entry = targets.getJSONObject(index);
                String path = entry.getString("path");
                boolean shouldExist = expected
                    ? entry.optBoolean("expectedExists", false)
                    : entry.optBoolean("existed", false);
                if (transactionTargetExists(context, path) != shouldExist) return false;
                if (!shouldExist) continue;
                String content = readTransactionTarget(context, path);
                String expectedHash = expected
                    ? entry.optString("expectedSha256", "")
                    : entry.optString("oldSha256", "");
                if (!sha256Text(content).equals(expectedHash) || !isValidTransactionJson(path, content)) {
                    return false;
                }
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static boolean isValidTransactionJson(String path, String content) {
        try {
            if (BUNDLE_RECURRING_PLANS_FILE_NAME.equals(path)) {
                new JSONArray(content);
            } else {
                new JSONObject(content);
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static boolean transactionTargetExists(Context context, String path) {
        if (SINGLE_FILE_TRANSACTION_TARGET.equals(path)) {
            return MODE_FILE.equals(getStorageMode(context)) && getCustomStorageUri(context) != null;
        }
        return bundlePathExists(context, path);
    }

    private static String readTransactionTarget(Context context, String path) throws Exception {
        return SINGLE_FILE_TRANSACTION_TARGET.equals(path)
            ? readStorageText(context)
            : readBundleText(context, path);
    }

    private static void writeTransactionTarget(Context context, String path, String content)
        throws Exception {
        if (SINGLE_FILE_TRANSACTION_TARGET.equals(path)) {
            OutputStream output = openStorageOutputStream(context);
            if (output == null) throw new Exception("无法恢复单文件存储。");
            try {
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
            } finally {
                output.close();
            }
            return;
        }
        writeBundleText(context, path, content);
    }

    private static void deleteTransactionTarget(Context context, String path) {
        if (!SINGLE_FILE_TRANSACTION_TARGET.equals(path)) {
            deleteBundlePath(context, path);
        }
    }

    private static void clearRollbackTransaction(Context context) {
        deleteRollbackDirectory(context, getRollbackTransactionFile(context).getParentFile());
    }

    private static void deleteRollbackDirectory(Context context, File target) {
        if (context == null || target == null) return;
        File allowedRoot = new File(context.getFilesDir(), STORAGE_TRANSACTION_DIRECTORY);
        try {
            String allowedPath = allowedRoot.getCanonicalPath();
            String targetPath = target.getCanonicalPath();
            if (!targetPath.equals(allowedPath) && !targetPath.startsWith(allowedPath + File.separator)) {
                return;
            }
        } catch (Exception error) {
            return;
        }
        File[] children = target.listFiles();
        if (children != null) {
            for (File child : children) deleteRollbackDirectory(context, child);
        }
        target.delete();
    }

    private static JSONObject firstTransactionResult(JSONObject transactionResult)
        throws Exception {
        JSONArray results = transactionResult == null ? null : transactionResult.optJSONArray("results");
        JSONObject first = results == null ? null : results.optJSONObject(0);
        if (first == null) {
            throw new Exception("存储事务未返回操作结果。");
        }
        return first;
    }

    public static synchronized JSONObject flushStorageJournal(Context context) throws Exception {
        recoverRollbackTransaction(context);
        JSONObject result = new JSONObject();
        StorageVersion version = probeStorageVersion(context, false);
        result.put("ok", true);
        result.put("pending", getRollbackTransactionFile(context).exists());
        result.put("snapshotVersion", version == null ? "" : safeText(version.fingerprint));
        result.put("generatedAt", isoNow());
        return result;
    }

    private static void rebuildProjectDurationCachesInRoot(JSONObject root) throws Exception {
        if (root == null) {
            return;
        }
        root.put(
            "projects",
            buildJsonArrayFromObjects(
                rebuildProjectDurationCaches(
                    jsonArrayToObjectList(root.optJSONArray("projects")),
                    jsonArrayToObjectList(root.optJSONArray("records"))
                )
            )
        );
    }

    private static boolean ensureThemeStateInCore(JSONObject core) throws Exception {
        if (core == null) {
            return false;
        }
        boolean changed = false;
        if (core.optJSONObject("guideState") == null) {
            JSONObject guideState = new JSONObject();
            guideState.put("bundleVersion", 2);
            guideState.put("dismissedCardIds", new JSONArray());
            guideState.put("dismissedGuideDiaryEntryIds", new JSONArray());
            core.put("guideState", guideState);
            changed = true;
        }
        if (core.optJSONArray("customThemes") == null) {
            core.put("customThemes", new JSONArray());
            changed = true;
        }
        if (core.optJSONObject("builtInThemeOverrides") == null) {
            core.put("builtInThemeOverrides", new JSONObject());
            changed = true;
        }
        if (TextUtils.isEmpty(core.optString("selectedTheme", ""))) {
            core.put("selectedTheme", "default");
            changed = true;
        }
        if (TextUtils.isEmpty(core.optString("todoSortPreference", ""))) {
            core.put("todoSortPreference", "dueDate");
            changed = true;
        }
        if (core.optJSONObject("checkinHistorySummary") == null) {
            core.put("checkinHistorySummary", new JSONObject());
            changed = true;
        }
        return changed;
    }

    private static CorePayloadSanitizeResult stripPartitionedSectionsFromCorePayload(
        JSONObject corePayload
    ) {
        JSONObject sanitized = corePayload == null ? new JSONObject() : cloneJsonObject(corePayload);
        ArrayList<String> removedSections = new ArrayList<>();
        for (String section : PARTITIONED_SECTION_KEYS) {
            if (!sanitized.has(section)) {
                continue;
            }
            sanitized.remove(section);
            removedSections.add(section);
        }
        return new CorePayloadSanitizeResult(sanitized, removedSections);
    }

    private static void logBundleCorePollutionCleanup(
        String source,
        ArrayList<String> removedSections
    ) {
        if (removedSections == null || removedSections.isEmpty()) {
            return;
        }
        try {
            Log.i(
                TAG,
                "Sanitized polluted bundle core from "
                    + safeText(source)
                    + ", removed sections: "
                    + TextUtils.join(", ", removedSections)
            );
        } catch (Exception ignored) {
        }
    }

    private static JSONObject loadBundleCoreWithProjectDurationCache(Context context)
        throws Exception {
        long startedAt = SystemClock.elapsedRealtime();
        logStorageTrace("loadBundleCoreWithProjectDurationCache", "start", startedAt, "");
        ensureBundleStorageReady(context);
        JSONObject storedCore = readBundleCore(context);
        if (storedCore == null) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "bundle 缺少有效的 core.json。",
                null
            );
        }
        CorePayloadSanitizeResult sanitizeResult =
            stripPartitionedSectionsFromCorePayload(storedCore);
        JSONObject core = sanitizeResult.payload;
        boolean themeStateChanged = ensureThemeStateInCore(core);
        boolean projectDurationCacheValid = projectsHaveValidDurationCache(
            core.optJSONArray("projects")
        );
        if (projectDurationCacheValid && !themeStateChanged && !sanitizeResult.repaired()) {
            logStorageTrace(
                "loadBundleCoreWithProjectDurationCache",
                "finish",
                startedAt,
                "projectDurationCacheValid=true themeStateChanged=false sanitized=false"
            );
            return core;
        }
        JSONObject repairedCore = cloneJsonObject(core);
        if (!projectDurationCacheValid) {
            JSONObject repairedRoot = loadBundleRoot(context, false);
            repairedCore.put("projects", cloneJsonArray(repairedRoot.optJSONArray("projects")));
        }
        ensureThemeStateInCore(repairedCore);
        touchBundleMetadata(
            context,
            readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME),
            repairedCore
        );
        logBundleCorePollutionCleanup(
            "loadBundleCoreWithProjectDurationCache",
            sanitizeResult.removedSections
        );
        logStorageTrace(
            "loadBundleCoreWithProjectDurationCache",
            "finish",
            startedAt,
            "projectDurationCacheValid="
                + projectDurationCacheValid
                + " themeStateChanged="
                + themeStateChanged
                + " sanitized="
                + sanitizeResult.repaired()
        );
        return repairedCore;
    }

    private static long normalizeDurationMs(long value) {
        return Math.max(0L, value);
    }

    private static long coerceLongValue(Object value, long fallbackValue) {
        if (value == null || value == JSONObject.NULL) {
            return fallbackValue;
        }
        if (value instanceof Number) {
            double numericValue = ((Number) value).doubleValue();
            if (Double.isNaN(numericValue) || Double.isInfinite(numericValue)) {
                return fallbackValue;
            }
            return Math.round(numericValue);
        }
        if (value instanceof String) {
            try {
                double numericValue = Double.parseDouble(((String) value).trim());
                if (Double.isNaN(numericValue) || Double.isInfinite(numericValue)) {
                    return fallbackValue;
                }
                return Math.round(numericValue);
            } catch (Exception ignored) {
            }
        }
        return fallbackValue;
    }

    private static boolean hasValidProjectDurationCache(JSONObject project) {
        if (project == null) {
            return false;
        }
        long version = coerceLongValue(project.opt(PROJECT_DURATION_CACHE_VERSION_KEY), -1L);
        long directDurationMs = coerceLongValue(project.opt(PROJECT_DIRECT_DURATION_KEY), -1L);
        long totalDurationMs = coerceLongValue(project.opt(PROJECT_TOTAL_DURATION_KEY), -1L);
        return version == PROJECT_DURATION_CACHE_VERSION
            && directDurationMs >= 0L
            && totalDurationMs >= 0L;
    }

    private static boolean projectsHaveValidDurationCache(JSONArray projects) {
        if (projects == null) {
            return false;
        }
        for (int index = 0; index < projects.length(); index += 1) {
            if (!hasValidProjectDurationCache(projects.optJSONObject(index))) {
                return false;
            }
        }
        return true;
    }

    private static JSONObject normalizeProjectDurationCache(JSONObject project) {
        JSONObject normalizedProject = project == null ? new JSONObject() : cloneJsonObject(project);
        try {
            normalizedProject.put(
                PROJECT_DURATION_CACHE_VERSION_KEY,
                PROJECT_DURATION_CACHE_VERSION
            );
            normalizedProject.put(
                PROJECT_DIRECT_DURATION_KEY,
                normalizeDurationMs(
                    coerceLongValue(normalizedProject.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                )
            );
            normalizedProject.put(
                PROJECT_TOTAL_DURATION_KEY,
                normalizeDurationMs(
                    coerceLongValue(normalizedProject.opt(PROJECT_TOTAL_DURATION_KEY), 0L)
                )
            );
        } catch (Exception error) {
            error.printStackTrace();
        }
        return normalizedProject;
    }

    private static ProjectDurationContext buildProjectDurationContext(
        ArrayList<JSONObject> projects
    ) {
        ProjectDurationContext context = new ProjectDurationContext();
        ArrayList<JSONObject> safeProjects =
            projects == null ? new ArrayList<JSONObject>() : projects;
        for (int index = 0; index < safeProjects.size(); index += 1) {
            JSONObject normalizedProject = normalizeProjectDurationCache(safeProjects.get(index));
            context.projects.add(normalizedProject);
            String projectId = normalizedProject.optString("id", "").trim();
            String projectName = normalizedProject.optString("name", "").trim();
            if (!TextUtils.isEmpty(projectId)) {
                context.byId.put(projectId, new ProjectDurationIndexEntry(index, normalizedProject));
            }
            if (!TextUtils.isEmpty(projectName)) {
                context.byName.put(projectName, new ProjectDurationIndexEntry(index, normalizedProject));
            }
        }

        for (JSONObject project : context.projects) {
            if (project == null) {
                continue;
            }
            String projectId = project.optString("id", "").trim();
            String parentId = project.optString("parentId", "").trim();
            if (
                !TextUtils.isEmpty(projectId)
                    && !TextUtils.isEmpty(parentId)
                    && !parentId.equals(projectId)
                    && context.byId.containsKey(parentId)
            ) {
                ArrayList<String> childIds = context.childrenByParent.get(parentId);
                if (childIds == null) {
                    childIds = new ArrayList<>();
                    context.childrenByParent.put(parentId, childIds);
                }
                childIds.add(projectId);
                continue;
            }
            if (!TextUtils.isEmpty(projectId)) {
                context.roots.add(projectId);
            }
        }

        return context;
    }

    private static String getPathLeafName(String value) {
        if (TextUtils.isEmpty(value)) {
            return "";
        }
        String[] parts = value.split("/");
        for (int index = parts.length - 1; index >= 0; index -= 1) {
            String part = parts[index] == null ? "" : parts[index].trim();
            if (!TextUtils.isEmpty(part)) {
                return part;
            }
        }
        return "";
    }

    private static int findProjectIndexForRecord(
        JSONObject record,
        ProjectDurationContext context
    ) {
        if (record == null) {
            return -1;
        }
        ProjectDurationContext safeContext =
            context == null ? buildProjectDurationContext(new ArrayList<JSONObject>()) : context;
        String projectId = record.optString("projectId", "").trim();
        if (!TextUtils.isEmpty(projectId) && safeContext.byId.containsKey(projectId)) {
            return safeContext.byId.get(projectId).index;
        }

        String projectName = record.optString("name", "").trim();
        if (TextUtils.isEmpty(projectName)) {
            return -1;
        }
        if (safeContext.byName.containsKey(projectName)) {
            return safeContext.byName.get(projectName).index;
        }

        String leafName = getPathLeafName(projectName);
        if (!TextUtils.isEmpty(leafName) && safeContext.byName.containsKey(leafName)) {
            return safeContext.byName.get(leafName).index;
        }
        return -1;
    }

    private static ArrayList<JSONObject> attachProjectIdsToRecords(
        ArrayList<JSONObject> records,
        ArrayList<JSONObject> projects
    ) {
        return attachProjectIdsToRecords(records, buildProjectDurationContext(projects));
    }

    private static ArrayList<JSONObject> attachProjectIdsToRecords(
        ArrayList<JSONObject> records,
        ProjectDurationContext context
    ) {
        ArrayList<JSONObject> normalizedRecords = new ArrayList<>();
        if (records == null) {
            return normalizedRecords;
        }
        ProjectDurationContext safeContext =
            context == null ? buildProjectDurationContext(new ArrayList<JSONObject>()) : context;
        for (JSONObject record : records) {
            if (record == null) {
                continue;
            }
            JSONObject normalizedRecord = cloneJsonObject(record);
            String projectId = normalizedRecord.optString("projectId", "").trim();
            if (TextUtils.isEmpty(projectId)) {
                int projectIndex = findProjectIndexForRecord(normalizedRecord, safeContext);
                if (projectIndex >= 0 && projectIndex < safeContext.projects.size()) {
                    String matchedProjectId =
                        safeContext.projects.get(projectIndex).optString("id", "").trim();
                    if (!TextUtils.isEmpty(matchedProjectId)) {
                        try {
                            normalizedRecord.put("projectId", matchedProjectId);
                        } catch (Exception error) {
                            error.printStackTrace();
                        }
                    }
                }
            }
            normalizedRecords.add(normalizedRecord);
        }
        return normalizedRecords;
    }

    private static long collectDurationPatternMs(
        String text,
        Pattern pattern,
        long multiplierMs
    ) {
        if (TextUtils.isEmpty(text) || pattern == null || multiplierMs <= 0L) {
            return 0L;
        }
        long totalMs = 0L;
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            totalMs += normalizeDurationMs((long) safeParse(matcher.group(1)) * multiplierMs);
        }
        return totalMs;
    }

    private static long parseSpendTimeToMs(String spendText) {
        if (TextUtils.isEmpty(spendText)) {
            return 0L;
        }
        String normalizedText = spendText.trim();
        if (TextUtils.isEmpty(normalizedText)) {
            return 0L;
        }
        long totalMs = 0L;
        totalMs += collectDurationPatternMs(normalizedText, DAY_PATTERN, 24L * 60L * 60L * 1000L);
        totalMs += collectDurationPatternMs(normalizedText, DURATION_HOUR_PATTERN, 60L * 60L * 1000L);
        totalMs += collectDurationPatternMs(normalizedText, DURATION_MINUTE_PATTERN, 60L * 1000L);
        if (LESS_THAN_ONE_MINUTE_PATTERN.matcher(normalizedText).find()) {
            totalMs += 30L * 1000L;
        }
        return normalizeDurationMs(totalMs);
    }

    private static Date parseDateTimeValue(String value) {
        if (TextUtils.isEmpty(value)) {
            return null;
        }
        String trimmedValue = value.trim();
        if (trimmedValue.length() < 19) {
            return null;
        }

        char dateTimeSeparator = trimmedValue.charAt(10);
        boolean hasMilliseconds =
            trimmedValue.length() > 19 && trimmedValue.charAt(19) == '.';
        String pattern;
        boolean timezoneAware = false;
        if (dateTimeSeparator == ' ') {
            pattern = hasMilliseconds
                ? "yyyy-MM-dd HH:mm:ss.SSS"
                : "yyyy-MM-dd HH:mm:ss";
        } else if (dateTimeSeparator == 'T') {
            int timezoneMarkerIndex = -1;
            if (trimmedValue.endsWith("Z")) {
                timezoneMarkerIndex = trimmedValue.length() - 1;
            } else {
                int plusIndex = trimmedValue.indexOf('+', 19);
                int minusIndex = trimmedValue.indexOf('-', 19);
                timezoneMarkerIndex = plusIndex >= 0 ? plusIndex : minusIndex;
            }
            if (timezoneMarkerIndex < 0) {
                pattern = hasMilliseconds
                    ? "yyyy-MM-dd'T'HH:mm:ss.SSS"
                    : "yyyy-MM-dd'T'HH:mm:ss";
            } else {
                timezoneAware = true;
                String timezoneSuffix = trimmedValue.substring(timezoneMarkerIndex);
                String timezonePattern = timezoneSuffix.indexOf(':') >= 0
                    ? "XXX"
                    : timezoneSuffix.length() == 5
                        ? "XX"
                        : "X";
                pattern = hasMilliseconds
                    ? "yyyy-MM-dd'T'HH:mm:ss.SSS" + timezonePattern
                    : "yyyy-MM-dd'T'HH:mm:ss" + timezonePattern;
            }
        } else {
            return null;
        }

        try {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
            format.setTimeZone(
                timezoneAware ? TimeZone.getTimeZone("UTC") : TimeZone.getDefault()
            );
            return format.parse(trimmedValue);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static long parseRecordTimestampMs(String value) {
        Date parsedDate = parseDateTimeValue(value);
        return parsedDate == null ? -1L : parsedDate.getTime();
    }

    private static long getRecordDurationMs(JSONObject record) {
        if (record == null) {
            return 0L;
        }

        long directDurationMs = coerceLongValue(record.opt("durationMs"), -1L);
        if (directDurationMs >= 0L) {
            return normalizeDurationMs(directDurationMs);
        }

        JSONObject durationMeta = record.optJSONObject("durationMeta");
        long recordedDurationMs =
            durationMeta == null ? -1L : coerceLongValue(durationMeta.opt("recordedMs"), -1L);
        if (recordedDurationMs >= 0L) {
            return normalizeDurationMs(recordedDurationMs);
        }

        long startTimeMs = parseRecordTimestampMs(record.optString("startTime", ""));
        long endTimeMs = parseRecordTimestampMs(
            firstNonEmpty(
                record.optString("endTime", ""),
                record.optString("timestamp", ""),
                record.optString("sptTime", "")
            )
        );
        if (startTimeMs >= 0L && endTimeMs >= 0L) {
            return normalizeDurationMs(endTimeMs - startTimeMs);
        }

        return parseSpendTimeToMs(record.optString("spendtime", ""));
    }

    private static long computeProjectDurationTotal(
        String projectId,
        ProjectDurationContext context,
        Map<String, Long> computedTotals,
        Set<String> visiting
    ) {
        String normalizedProjectId = projectId == null ? "" : projectId.trim();
        if (TextUtils.isEmpty(normalizedProjectId)) {
            return 0L;
        }
        if (computedTotals.containsKey(normalizedProjectId)) {
            return normalizeDurationMs(computedTotals.get(normalizedProjectId));
        }

        ProjectDurationIndexEntry entry = context.byId.get(normalizedProjectId);
        if (entry == null || entry.project == null) {
            return 0L;
        }

        if (visiting.contains(normalizedProjectId)) {
            return normalizeDurationMs(
                coerceLongValue(entry.project.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
            );
        }

        visiting.add(normalizedProjectId);
        long totalDurationMs =
            normalizeDurationMs(coerceLongValue(entry.project.opt(PROJECT_DIRECT_DURATION_KEY), 0L));
        ArrayList<String> childIds = context.childrenByParent.get(normalizedProjectId);
        if (childIds != null) {
            for (String childId : childIds) {
                totalDurationMs += computeProjectDurationTotal(
                    childId,
                    context,
                    computedTotals,
                    visiting
                );
            }
        }
        visiting.remove(normalizedProjectId);

        long normalizedTotalMs = normalizeDurationMs(totalDurationMs);
        try {
            entry.project.put(PROJECT_DURATION_CACHE_VERSION_KEY, PROJECT_DURATION_CACHE_VERSION);
            entry.project.put(PROJECT_TOTAL_DURATION_KEY, normalizedTotalMs);
        } catch (Exception error) {
            error.printStackTrace();
        }
        computedTotals.put(normalizedProjectId, normalizedTotalMs);
        return normalizedTotalMs;
    }

    private static ArrayList<JSONObject> recalculateProjectDurationTotals(
        ArrayList<JSONObject> projects
    ) {
        ProjectDurationContext context = buildProjectDurationContext(projects);
        Map<String, Long> computedTotals = new HashMap<>();
        Set<String> visiting = new HashSet<>();

        for (JSONObject project : context.projects) {
            if (project == null) {
                continue;
            }
            try {
                project.put(PROJECT_DURATION_CACHE_VERSION_KEY, PROJECT_DURATION_CACHE_VERSION);
                project.put(
                    PROJECT_DIRECT_DURATION_KEY,
                    normalizeDurationMs(
                        coerceLongValue(project.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                    )
                );
                project.put(PROJECT_TOTAL_DURATION_KEY, 0L);
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        for (String rootProjectId : context.roots) {
            computeProjectDurationTotal(rootProjectId, context, computedTotals, visiting);
        }

        for (JSONObject project : context.projects) {
            if (project == null) {
                continue;
            }
            String projectId = project.optString("id", "").trim();
            if (TextUtils.isEmpty(projectId)) {
                try {
                    project.put(
                        PROJECT_TOTAL_DURATION_KEY,
                        normalizeDurationMs(
                            coerceLongValue(project.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                        )
                    );
                } catch (Exception error) {
                    error.printStackTrace();
                }
                continue;
            }
            if (!computedTotals.containsKey(projectId)) {
                computeProjectDurationTotal(projectId, context, computedTotals, visiting);
            }
        }

        return context.projects;
    }

    private static ArrayList<JSONObject> rebuildProjectDurationCaches(
        ArrayList<JSONObject> projects,
        ArrayList<JSONObject> records
    ) {
        ProjectDurationContext context = buildProjectDurationContext(projects);
        for (JSONObject project : context.projects) {
            if (project == null) {
                continue;
            }
            try {
                project.put(PROJECT_DURATION_CACHE_VERSION_KEY, PROJECT_DURATION_CACHE_VERSION);
                project.put(PROJECT_DIRECT_DURATION_KEY, 0L);
                project.put(PROJECT_TOTAL_DURATION_KEY, 0L);
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        ArrayList<JSONObject> uniqueRecords = mergePartitionItems(
            "records",
            new ArrayList<>(),
            records,
            true
        );
        ArrayList<JSONObject> normalizedRecords = attachProjectIdsToRecords(
            uniqueRecords,
            context
        );
        for (JSONObject record : normalizedRecords) {
            int projectIndex = findProjectIndexForRecord(record, context);
            if (projectIndex < 0 || projectIndex >= context.projects.size()) {
                continue;
            }
            JSONObject targetProject = context.projects.get(projectIndex);
            long nextDirectDurationMs =
                normalizeDurationMs(
                    coerceLongValue(targetProject.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                        + getRecordDurationMs(record)
                );
            try {
                targetProject.put(PROJECT_DIRECT_DURATION_KEY, nextDirectDurationMs);
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        return recalculateProjectDurationTotals(context.projects);
    }

    private static ArrayList<JSONObject> reconcileProjectDurationCaches(
        ArrayList<JSONObject> projects,
        ArrayList<JSONObject> previousProjects
    ) {
        ArrayList<JSONObject> nextProjects = new ArrayList<>();
        if (projects != null) {
            for (JSONObject project : projects) {
                nextProjects.add(normalizeProjectDurationCache(project));
            }
        }

        ProjectDurationContext previousContext = buildProjectDurationContext(previousProjects);
        Map<String, JSONObject> previousByName = new HashMap<>();
        for (JSONObject project : previousContext.projects) {
            if (project == null) {
                continue;
            }
            String projectName = project.optString("name", "").trim();
            if (TextUtils.isEmpty(projectName)) {
                continue;
            }
            if (previousByName.containsKey(projectName)) {
                previousByName.put(projectName, null);
                continue;
            }
            previousByName.put(projectName, project);
        }

        for (JSONObject project : nextProjects) {
            if (project == null) {
                continue;
            }
            String projectId = project.optString("id", "").trim();
            String projectName = project.optString("name", "").trim();
            JSONObject matchedProject =
                !TextUtils.isEmpty(projectId) && previousContext.byId.containsKey(projectId)
                    ? previousContext.byId.get(projectId).project
                    : null;
            if (matchedProject == null && !TextUtils.isEmpty(projectName)) {
                matchedProject = previousByName.get(projectName);
            }
            try {
                project.put(PROJECT_DURATION_CACHE_VERSION_KEY, PROJECT_DURATION_CACHE_VERSION);
                project.put(
                    PROJECT_DIRECT_DURATION_KEY,
                    normalizeDurationMs(
                        matchedProject == null
                            ? 0L
                            : coerceLongValue(matchedProject.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                    )
                );
                project.put(PROJECT_TOTAL_DURATION_KEY, 0L);
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        return recalculateProjectDurationTotals(nextProjects);
    }

    private static ArrayList<JSONObject> applyProjectRecordDurationChanges(
        ArrayList<JSONObject> projects,
        ArrayList<JSONObject> removedRecords,
        ArrayList<JSONObject> addedRecords
    ) {
        ProjectDurationContext context = buildProjectDurationContext(projects);
        ArrayList<JSONObject> normalizedRemovedRecords =
            attachProjectIdsToRecords(removedRecords, context);
        ArrayList<JSONObject> normalizedAddedRecords =
            attachProjectIdsToRecords(addedRecords, context);

        for (JSONObject record : normalizedRemovedRecords) {
            int projectIndex = findProjectIndexForRecord(record, context);
            if (projectIndex < 0 || projectIndex >= context.projects.size()) {
                continue;
            }
            JSONObject targetProject = context.projects.get(projectIndex);
            long nextDirectDurationMs =
                coerceLongValue(targetProject.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                    - getRecordDurationMs(record);
            try {
                targetProject.put(
                    PROJECT_DIRECT_DURATION_KEY,
                    normalizeDurationMs(nextDirectDurationMs)
                );
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        for (JSONObject record : normalizedAddedRecords) {
            int projectIndex = findProjectIndexForRecord(record, context);
            if (projectIndex < 0 || projectIndex >= context.projects.size()) {
                continue;
            }
            JSONObject targetProject = context.projects.get(projectIndex);
            long nextDirectDurationMs =
                coerceLongValue(targetProject.opt(PROJECT_DIRECT_DURATION_KEY), 0L)
                    + getRecordDurationMs(record);
            try {
                targetProject.put(
                    PROJECT_DIRECT_DURATION_KEY,
                    normalizeDurationMs(nextDirectDurationMs)
                );
            } catch (Exception error) {
                error.printStackTrace();
            }
        }

        return recalculateProjectDurationTotals(context.projects);
    }

    private static ArrayList<JSONObject> filterRecordDurationCacheOwners(
        String periodId,
        ArrayList<JSONObject> records
    ) {
        ArrayList<JSONObject> ownedRecords = new ArrayList<>();
        if (records == null) {
            return ownedRecords;
        }
        String normalizedPeriodId = normalizePeriodId(periodId);
        for (JSONObject record : records) {
            if (
                record != null &&
                normalizedPeriodId.equals(getPeriodIdForSectionItem("records", record))
            ) {
                ownedRecords.add(record);
            }
        }
        return ownedRecords;
    }

    private static JSONObject buildPartitionEnvelope(
        String section,
        String periodId,
        ArrayList<JSONObject> items
    ) throws Exception {
        ArrayList<JSONObject> sortedItems =
            items == null ? new ArrayList<JSONObject>() : new ArrayList<>(items);
        sortJsonItems(section, sortedItems);
        JSONObject envelope = new JSONObject();
        envelope.put("formatVersion", BUNDLE_FORMAT_VERSION);
        envelope.put("section", section);
        envelope.put("periodUnit", PERIOD_UNIT);
        envelope.put("periodId", periodId);
        envelope.put("count", sortedItems.size());
        String minDate =
            sortedItems.isEmpty() ? "" : getSectionItemDateKey(section, sortedItems.get(0));
        String maxDate =
            sortedItems.isEmpty()
                ? ""
                : getSectionItemDateKey(section, sortedItems.get(sortedItems.size() - 1));
        envelope.put("minDate", TextUtils.isEmpty(minDate) ? JSONObject.NULL : minDate);
        envelope.put("maxDate", TextUtils.isEmpty(maxDate) ? JSONObject.NULL : maxDate);
        envelope.put("fingerprint", buildPartitionFingerprint(section, periodId, sortedItems));
        envelope.put("items", buildJsonArrayFromObjects(sortedItems));
        return envelope;
    }

    private static JSONObject readBundlePartitionEnvelope(Context context, String relativePath) {
        try {
            return readBundleJsonObject(context, relativePath);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject readBundlePartitionEnvelopeWithConflictRecovery(
        Context context,
        String section,
        String periodId,
        String relativePath
    ) {
        return readBundlePartitionEnvelope(context, relativePath);
    }

    private static JSONObject normalizeRoot(Context context, JSONObject root, boolean touchSyncSave) {
        return normalizeRoot(context, root, touchSyncSave, true);
    }

    private static JSONObject normalizeRoot(
        Context context,
        JSONObject root,
        boolean touchSyncSave,
        boolean rebuildProjectDurationCaches
    ) {
        try {
            JSONObject normalized = root == null ? new JSONObject() : new JSONObject(root.toString());
            ensureJsonArray(normalized, "projects");
            ensureJsonArray(normalized, "records");
            ensureJsonArray(normalized, "plans");
            ensureJsonArray(normalized, "todos");
            ensureJsonArray(normalized, "checkinItems");
            ensureJsonArray(normalized, "dailyCheckins");
            ensureJsonArray(normalized, "checkins");
            ensureJsonArray(normalized, "diaryEntries");
            ensureJsonArray(normalized, "diaryMediaAssets");
            ensureJsonArray(normalized, "diaryCategories");
            ensureJsonArray(normalized, "customThemes");
            normalized.put(
                "diaryMediaAssets",
                normalizeDiaryMediaAssets(normalized.optJSONArray("diaryMediaAssets"))
            );
            ensureJsonObject(normalized, "yearlyGoals");
            ensureJsonObject(normalized, "builtInThemeOverrides");
            ensureJsonObject(normalized, "tableScaleSettings");
            ensureJsonObject(normalized, "timerSessionState");
            if (rebuildProjectDurationCaches) {
                rebuildProjectDurationCachesInRoot(normalized);
            }

            if (TextUtils.isEmpty(normalized.optString("selectedTheme", ""))) {
                normalized.put("selectedTheme", "default");
            }
            if (TextUtils.isEmpty(normalized.optString("createdAt", ""))) {
                normalized.put("createdAt", isoNow());
            }

            StorageLocation location = getStorageLocation(context);
            String storagePath = TextUtils.isEmpty(location.storagePath)
                ? getDefaultStorageFile(context).getAbsolutePath()
                : location.storagePath;
            String storageDirectory = TextUtils.isEmpty(location.storageDirectory)
                ? (getDefaultStorageFile(context).getParentFile() == null
                    ? ""
                    : getDefaultStorageFile(context).getParentFile().getAbsolutePath())
                : location.storageDirectory;

            normalized.put("storagePath", storagePath);
            normalized.put(
                "storageDirectory",
                TextUtils.isEmpty(storageDirectory) ? JSONObject.NULL : storageDirectory
            );
            normalized.put(
                "userDataPath",
                context == null ? JSONObject.NULL : context.getFilesDir().getAbsolutePath()
            );
            normalized.put(
                "documentsPath",
                context == null ? JSONObject.NULL : context.getFilesDir().getAbsolutePath()
            );
            normalized.put("lastModified", isoNow());

            JSONObject syncMeta = ensureJsonObject(normalized, "syncMeta");
            syncMeta.put("mode", usesDirectoryBundleStorage(context) ? BUNDLE_MODE : "folder-file");
            syncMeta.put(
                "fileName",
                TextUtils.isEmpty(location.syncFileName)
                    ? (usesDirectoryBundleStorage(context)
                        ? BUNDLE_MANIFEST_FILE_NAME
                        : "controler-data.json")
                    : location.syncFileName
            );
            syncMeta.put("autoSyncEnabled", true);
            syncMeta.put(
                "storageDirectory",
                TextUtils.isEmpty(storageDirectory) ? JSONObject.NULL : storageDirectory
            );
            if (touchSyncSave) {
                String now = isoNow();
                syncMeta.put("lastSavedAt", now);
                syncMeta.put("lastTriggeredAt", now);
            } else {
                if (!syncMeta.has("lastSavedAt")) {
                    syncMeta.put("lastSavedAt", JSONObject.NULL);
                }
                if (!syncMeta.has("lastTriggeredAt")) {
                    syncMeta.put("lastTriggeredAt", JSONObject.NULL);
                }
            }
            normalized.put("syncMeta", syncMeta);
            return normalized;
        } catch (Exception error) {
            error.printStackTrace();
            return root == null ? new JSONObject() : root;
        }
    }

    private static void validateRootShape(JSONObject root) throws Exception {
        if (root == null) {
            throw new Exception("同步 JSON 文件内容无效。");
        }
        if (root.optJSONArray("projects") == null || root.optJSONArray("records") == null) {
            throw new Exception("同步 JSON 文件缺少必需的数据字段。");
        }
    }

    private static JSONArray ensureJsonArray(JSONObject root, String key) throws Exception {
        JSONArray array = root.optJSONArray(key);
        if (array == null) {
            array = new JSONArray();
            root.put(key, array);
        }
        return array;
    }

    private static JSONObject ensureJsonObject(JSONObject root, String key) throws Exception {
        JSONObject object = root.optJSONObject(key);
        if (object == null) {
            object = new JSONObject();
            root.put(key, object);
        }
        return object;
    }

    private static String normalizeDiaryMediaExtension(String value) {
        String normalized = String.valueOf(value == null ? "" : value)
            .trim()
            .replaceFirst("^\\.+", "")
            .toLowerCase(Locale.US);
        return normalized.matches("^[a-z0-9]{2,8}$") ? normalized : "";
    }

    private static String inferDiaryMediaMimeType(String fileName, String fallbackMimeType) {
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

    private static String extensionForDiaryMimeType(String mimeType, String fallbackFileName) {
        String normalizedMime = String.valueOf(mimeType == null ? "" : mimeType)
            .trim()
            .toLowerCase(Locale.US);
        if ("image/jpeg".equals(normalizedMime)) {
            return "jpg";
        }
        if ("image/png".equals(normalizedMime)) {
            return "png";
        }
        if ("image/webp".equals(normalizedMime)) {
            return "webp";
        }
        if ("image/gif".equals(normalizedMime)) {
            return "gif";
        }
        if ("image/heic".equals(normalizedMime)) {
            return "heic";
        }
        if ("image/heif".equals(normalizedMime)) {
            return "heif";
        }
        if ("image/bmp".equals(normalizedMime)) {
            return "bmp";
        }
        if ("image/svg+xml".equals(normalizedMime)) {
            return "svg";
        }
        String extension = normalizeDiaryMediaExtension(getBundleRelativeFileName(fallbackFileName));
        if (!TextUtils.isEmpty(extension)) {
            return extension;
        }
        int lastDotIndex =
            String.valueOf(fallbackFileName == null ? "" : fallbackFileName).lastIndexOf('.');
        if (lastDotIndex >= 0) {
            return normalizeDiaryMediaExtension(
                String.valueOf(fallbackFileName).substring(lastDotIndex + 1)
            );
        }
        return "";
    }

    private static String buildDiaryMediaRelativePath(
        String assetId,
        String mimeType,
        String fallbackFileName
    ) {
        String normalizedAssetId = String.valueOf(assetId == null ? "" : assetId)
            .trim()
            .replaceAll("[^a-zA-Z0-9._-]+", "-");
        if (TextUtils.isEmpty(normalizedAssetId)) {
            return "";
        }
        String extension = extensionForDiaryMimeType(mimeType, fallbackFileName);
        return DIARY_MEDIA_DIR_NAME
            + "/"
            + normalizedAssetId
            + (TextUtils.isEmpty(extension) ? "" : "." + extension);
    }

    private static JSONObject normalizeDiaryMediaAssetEntry(JSONObject entry) {
        try {
            if (entry == null) {
                return null;
            }
            String assetId = sanitizeJsonString(
                firstNonEmpty(entry.optString("assetId", ""), entry.optString("id", ""))
            );
            if (TextUtils.isEmpty(assetId)) {
                return null;
            }
            String mimeType = inferDiaryMediaMimeType(
                firstNonEmpty(entry.optString("file", ""), entry.optString("path", "")),
                entry.optString("mimeType", "")
            );
            String file = normalizeBundleRelativePath(
                firstNonEmpty(
                    entry.optString("file", ""),
                    entry.optString("path", ""),
                    buildDiaryMediaRelativePath(assetId, mimeType, entry.optString("file", ""))
                )
            );
            if (TextUtils.isEmpty(file) || !file.startsWith(DIARY_MEDIA_DIR_NAME + "/")) {
                file = buildDiaryMediaRelativePath(assetId, mimeType, entry.optString("file", ""));
            }
            if (TextUtils.isEmpty(file)) {
                return null;
            }
            JSONObject normalized = new JSONObject();
            normalized.put("assetId", assetId);
            normalized.put("file", file);
            normalized.put("mimeType", mimeType);
            normalized.put("width", Math.max(0, entry.optInt("width", 0)));
            normalized.put("height", Math.max(0, entry.optInt("height", 0)));
            normalized.put("sizeBytes", Math.max(0L, entry.optLong("sizeBytes", 0L)));
            normalized.put(
                "updatedAt",
                sanitizeJsonString(entry.optString("updatedAt", isoNow()))
            );
            normalized.put(
                "compressionMode",
                "original".equals(entry.optString("compressionMode", ""))
                    ? "original"
                    : "compressed"
            );
            return normalized;
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONArray normalizeDiaryMediaAssets(JSONArray assets) {
        JSONArray normalized = new JSONArray();
        Set<String> seenAssetIds = new HashSet<>();
        if (assets == null) {
            return normalized;
        }
        for (int index = 0; index < assets.length(); index += 1) {
            JSONObject entry = normalizeDiaryMediaAssetEntry(assets.optJSONObject(index));
            if (entry == null) {
                continue;
            }
            String assetId = entry.optString("assetId", "");
            if (TextUtils.isEmpty(assetId) || seenAssetIds.contains(assetId)) {
                continue;
            }
            seenAssetIds.add(assetId);
            normalized.put(entry);
        }
        return normalized;
    }

    private static Set<String> collectReferencedDiaryAssetIds(JSONArray diaryEntries) {
        Set<String> assetIds = new LinkedHashSet<>();
        if (diaryEntries == null) {
            return assetIds;
        }
        for (int index = 0; index < diaryEntries.length(); index += 1) {
            JSONObject entry = diaryEntries.optJSONObject(index);
            JSONArray attachments = entry == null ? null : entry.optJSONArray("attachments");
            if (attachments == null) {
                continue;
            }
            for (int attachmentIndex = 0; attachmentIndex < attachments.length(); attachmentIndex += 1) {
                JSONObject attachment = attachments.optJSONObject(attachmentIndex);
                if (attachment == null) {
                    continue;
                }
                String assetId = sanitizeJsonString(attachment.optString("assetId", ""));
                if (!TextUtils.isEmpty(assetId)) {
                    assetIds.add(assetId);
                }
            }
        }
        return assetIds;
    }

    private static JSONArray filterDiaryMediaAssetsByReferencedIds(
        JSONArray assets,
        Set<String> referencedAssetIds
    ) {
        JSONArray filtered = new JSONArray();
        if (referencedAssetIds == null || referencedAssetIds.isEmpty()) {
            return filtered;
        }
        JSONArray normalizedAssets = normalizeDiaryMediaAssets(assets);
        for (int index = 0; index < normalizedAssets.length(); index += 1) {
            JSONObject entry = normalizedAssets.optJSONObject(index);
            if (entry == null) {
                continue;
            }
            if (referencedAssetIds.contains(entry.optString("assetId", ""))) {
                filtered.put(cloneJsonObject(entry));
            }
        }
        return filtered;
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private static JSONObject buildStorageManifest(JSONObject root) {
        JSONObject manifest = new JSONObject();
        try {
            String createdAt = sanitizeJsonString(root == null ? "" : root.optString("createdAt", ""));
            String lastModified = sanitizeJsonString(
                root == null ? "" : root.optString("lastModified", createdAt)
            );
            if (TextUtils.isEmpty(createdAt)) {
                createdAt = isoNow();
            }
            if (TextUtils.isEmpty(lastModified)) {
                lastModified = createdAt;
            }

            JSONObject sections = new JSONObject();
            sections.put("core", new JSONObject().put("file", BUNDLE_CORE_FILE_NAME));
            sections.put(
                "plansRecurring",
                new JSONObject()
                    .put("file", BUNDLE_RECURRING_PLANS_FILE_NAME)
                    .put("count", countRecurringPlans(root == null ? null : root.optJSONArray("plans")))
            );
            sections.put(
                "records",
                buildSectionManifest("records", root == null ? null : root.optJSONArray("records"))
            );
            sections.put(
                "diaryEntries",
                buildSectionManifest(
                    "diaryEntries",
                    root == null ? null : root.optJSONArray("diaryEntries")
                )
            );
            sections.put(
                "dailyCheckins",
                buildSectionManifest(
                    "dailyCheckins",
                    root == null ? null : root.optJSONArray("dailyCheckins")
                )
            );
            sections.put(
                "checkins",
                buildSectionManifest("checkins", root == null ? null : root.optJSONArray("checkins"))
            );
            sections.put(
                "plans",
                buildSectionManifest("plans", root == null ? null : root.optJSONArray("plans"))
            );

            manifest.put("formatVersion", BUNDLE_FORMAT_VERSION);
            manifest.put("bundleMode", BUNDLE_MODE);
            manifest.put("createdAt", createdAt);
            manifest.put("lastModified", lastModified);
            manifest.put("sections", sections);
            manifest.put(
                "assets",
                new JSONObject().put(
                    "diaryMedia",
                    normalizeDiaryMediaAssets(
                        root == null ? null : root.optJSONArray("diaryMediaAssets")
                    )
                )
            );
            manifest.put("legacyBackups", new JSONArray());
        } catch (Exception error) {
            error.printStackTrace();
        }
        return manifest;
    }

    private static JSONObject buildSectionManifest(String section, JSONArray sourceItems) {
        JSONObject sectionManifest = new JSONObject();
        try {
            sectionManifest.put("periodUnit", PERIOD_UNIT);
            Map<String, ArrayList<JSONObject>> grouped = groupItemsByPeriod(section, sourceItems);
            ArrayList<String> periodIds = new ArrayList<>(grouped.keySet());
            Collections.sort(periodIds);
            JSONArray partitions = new JSONArray();
            for (String periodId : periodIds) {
                ArrayList<JSONObject> items = grouped.get(periodId);
                if (items == null || items.isEmpty()) {
                    continue;
                }
                sortJsonItems(section, items);
                JSONObject partition = buildPartitionMetadata(section, periodId, items);
                partitions.put(partition);
            }
            sectionManifest.put("partitions", partitions);
        } catch (Exception error) {
            error.printStackTrace();
        }
        return sectionManifest;
    }

    private static JSONObject buildPartitionMetadata(
        String section,
        String periodId,
        ArrayList<JSONObject> items
    ) throws Exception {
        JSONObject partition = new JSONObject();
        String minDate = "";
        String maxDate = "";
        if (items != null && !items.isEmpty()) {
            minDate = getSectionItemDateKey(section, items.get(0));
            maxDate = getSectionItemDateKey(section, items.get(items.size() - 1));
        }
        partition.put("periodId", periodId);
        partition.put("file", getPartitionRelativePath(section, periodId));
        partition.put("count", items == null ? 0 : items.size());
        if (TextUtils.isEmpty(minDate)) {
            partition.put("minDate", JSONObject.NULL);
        } else {
            partition.put("minDate", minDate);
        }
        if (TextUtils.isEmpty(maxDate)) {
            partition.put("maxDate", JSONObject.NULL);
        } else {
            partition.put("maxDate", maxDate);
        }
        partition.put("fingerprint", buildPartitionFingerprint(section, periodId, items));
        return partition;
    }

    private static void updateManifestSectionPartition(
        JSONObject manifest,
        String section,
        String periodId,
        ArrayList<JSONObject> items
    ) throws Exception {
        JSONObject sections = manifest.optJSONObject("sections");
        if (sections == null) {
            sections = new JSONObject();
            manifest.put("sections", sections);
        }
        JSONObject sectionObject = sections.optJSONObject(section);
        if (sectionObject == null) {
            sectionObject = new JSONObject();
            sectionObject.put("periodUnit", PERIOD_UNIT);
            sectionObject.put("partitions", new JSONArray());
            sections.put(section, sectionObject);
        }

        JSONArray existingPartitions = sectionObject.optJSONArray("partitions");
        JSONArray nextPartitions = new JSONArray();
        if (existingPartitions != null) {
            for (int index = 0; index < existingPartitions.length(); index += 1) {
                JSONObject partition = existingPartitions.optJSONObject(index);
                if (partition == null) {
                    continue;
                }
                if (periodId.equals(normalizePeriodId(partition.optString("periodId", "")))) {
                    continue;
                }
                nextPartitions.put(cloneJsonObject(partition));
            }
        }

        if (items != null && !items.isEmpty()) {
            nextPartitions.put(buildPartitionMetadata(section, periodId, items));
        }

        ArrayList<JSONObject> sortable = jsonArrayToObjectList(nextPartitions);
        Collections.sort(
            sortable,
            (left, right) ->
                String.valueOf(left.optString("periodId", ""))
                    .compareTo(String.valueOf(right.optString("periodId", "")))
        );
        sectionObject.put("periodUnit", PERIOD_UNIT);
        sectionObject.put("partitions", buildJsonArrayFromObjects(sortable));
        sections.put(section, sectionObject);
    }

    private static void touchBundleMetadata(Context context, JSONObject manifest) throws Exception {
        touchBundleMetadata(context, manifest, loadBundleCoreWithProjectDurationCache(context));
    }

    private static void touchBundleMetadata(
        Context context,
        JSONObject manifest,
        JSONObject core
    ) throws Exception {
        String now = isoNow();
        JSONObject safeCore =
            core == null
                ? buildCoreStateFromRoot(normalizeRoot(context, new JSONObject(), false))
                : core;
        CorePayloadSanitizeResult sanitizeResult =
            stripPartitionedSectionsFromCorePayload(safeCore);
        safeCore = sanitizeResult.payload;
        JSONObject syncMeta = safeCore.optJSONObject("syncMeta");
        if (syncMeta == null) {
            syncMeta = new JSONObject();
        }
        syncMeta.put("mode", BUNDLE_MODE);
        syncMeta.put("fileName", BUNDLE_MANIFEST_FILE_NAME);
        syncMeta.put("autoSyncEnabled", true);
        syncMeta.put("lastSavedAt", now);
        syncMeta.put("lastTriggeredAt", now);
        safeCore.put("syncMeta", syncMeta);
        safeCore.put("lastModified", now);
        writeBundleJson(context, BUNDLE_CORE_FILE_NAME, safeCore);
        logBundleCorePollutionCleanup("touchBundleMetadata", sanitizeResult.removedSections);

        if (manifest != null) {
            manifest.put("lastModified", now);
            writeBundleJson(context, BUNDLE_MANIFEST_FILE_NAME, manifest);
        }
        deleteIgnoredBundleArtifacts(context, "touchBundleMetadata");
    }

    private static JSONObject readBundleJsonObject(Context context, String relativePath)
        throws Exception {
        String raw = readBundleText(context, relativePath);
        if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
            return null;
        }
        return new JSONObject(raw.trim());
    }

    private static JSONArray readBundleJsonArray(Context context, String relativePath)
        throws Exception {
        String raw = readBundleText(context, relativePath);
        if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
            throw new StorageReadException(
                READ_STATE_CORRUPTED,
                "bundle JSON 数组文件为空: " + relativePath,
                null
            );
        }
        return new JSONArray(raw.trim());
    }

    private static void writeBundleJson(Context context, String relativePath, JSONObject value)
        throws Exception {
        writeBundleJsonText(
            context,
            relativePath,
            value == null ? "{}" : value.toString(),
            false
        );
    }

    private static void writeBundleJson(Context context, String relativePath, JSONArray value)
        throws Exception {
        writeBundleJsonText(
            context,
            relativePath,
            value == null ? "[]" : value.toString(),
            true
        );
    }

    private static void writeBundleJsonText(
        Context context,
        String relativePath,
        String content,
        boolean array
    ) throws Exception {
        boolean ownsTransaction = !STORAGE_TRANSACTION_ACTIVE.get();
        if (ownsTransaction) {
            assertStorageWritable();
            beginRollbackTransaction(context, Collections.singleton(relativePath));
            STORAGE_TRANSACTION_ACTIVE.set(Boolean.TRUE);
        }
        try {
            writeBundleText(context, relativePath, content);
            String actual = readBundleText(context, relativePath).trim();
            if (array) new JSONArray(actual); else new JSONObject(actual);
            if (!sha256Text(content).equals(sha256Text(actual))) {
                throw new Exception("bundle 文件写入后校验失败: " + relativePath);
            }
            if (ownsTransaction) completeRollbackTransaction(context);
        } catch (Exception error) {
            if (ownsTransaction) rollbackActiveTransaction(context, error);
            throw error;
        } finally {
            if (ownsTransaction) STORAGE_TRANSACTION_ACTIVE.set(Boolean.FALSE);
        }
    }

    private static boolean bundlePathExists(Context context, String relativePath) {
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            return resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                relativePath,
                false,
                false
            ) != null;
        }

        File root = getDefaultBundleRootDirectory(context);
        return new File(root, relativePath.replace("/", File.separator)).exists();
    }

    private static void deleteBundlePath(Context context, String relativePath) {
        try {
            if (MODE_DIRECTORY.equals(getStorageMode(context))) {
                Uri treeUri = getCustomStorageDirectoryUri(context);
                Uri documentUri = resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    relativePath,
                    false,
                    false
                );
                if (documentUri != null) {
                    DocumentsContract.deleteDocument(context.getContentResolver(), documentUri);
                }
                removeDirectoryDocumentUriCacheEntry(context, treeUri, relativePath);
                return;
            }

            File root = getDefaultBundleRootDirectory(context);
            File target = new File(root, relativePath.replace("/", File.separator));
            if (target.exists()) {
                target.delete();
            }
        } catch (Exception ignored) {
        }
    }

    private static void deleteStaleBundleFiles(
        Context context,
        JSONObject previousManifest,
        JSONObject nextManifest
    ) {
        if (previousManifest == null) {
            return;
        }
        Set<String> previousFiles = collectBundleFilesFromManifest(previousManifest);
        Set<String> nextFiles = collectBundleFilesFromManifest(nextManifest);
        for (String file : previousFiles) {
            if (nextFiles.contains(file)) {
                continue;
            }
            deleteBundlePath(context, file);
        }
    }

    private static Set<String> collectBundleFilesFromManifest(JSONObject manifest) {
        Set<String> files = new HashSet<>();
        if (manifest == null) {
            return files;
        }
        files.add(BUNDLE_MANIFEST_FILE_NAME);
        files.add(BUNDLE_CORE_FILE_NAME);
        files.add(BUNDLE_RECURRING_PLANS_FILE_NAME);
        JSONObject sections = manifest.optJSONObject("sections");
        if (sections == null) {
            return files;
        }
        String[] sectionKeys = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        for (String sectionKey : sectionKeys) {
            JSONObject section = sections.optJSONObject(sectionKey);
            JSONArray partitions = section == null ? null : section.optJSONArray("partitions");
            if (partitions == null) {
                continue;
            }
            for (int index = 0; index < partitions.length(); index += 1) {
                JSONObject partition = partitions.optJSONObject(index);
                if (partition != null) {
                    String file = partition.optString("file", "");
                    if (!TextUtils.isEmpty(file)) {
                        files.add(file);
                    }
                }
            }
        }
        JSONObject assets = manifest.optJSONObject("assets");
        JSONArray diaryMedia = assets == null ? null : assets.optJSONArray("diaryMedia");
        if (diaryMedia != null) {
            for (int index = 0; index < diaryMedia.length(); index += 1) {
                JSONObject entry = normalizeDiaryMediaAssetEntry(
                    diaryMedia.optJSONObject(index)
                );
                if (entry == null) {
                    continue;
                }
                String file = entry.optString("file", "");
                if (!TextUtils.isEmpty(file)) {
                    files.add(file);
                }
            }
        }
        return files;
    }

    private static void migrateLegacyLocalFileToBundle(Context context, File legacyFile)
        throws Exception {
        if (legacyFile == null || !legacyFile.exists()) {
            return;
        }
        String raw = readTextFromFile(legacyFile);
        if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
            return;
        }
        JSONObject parsedRoot = new JSONObject(raw.trim());
        validateRootShape(parsedRoot);
        JSONObject normalizedRoot = normalizeRoot(
            context,
            preserveThemeStateIfMissing(context, parsedRoot),
            true
        );
        if (!writeBundleRoot(context, normalizedRoot)) {
            throw new Exception("旧数据迁移失败。");
        }

        String backupName = "controler-data.legacy-" + System.currentTimeMillis() + ".json";
        File backupFile = new File(legacyFile.getParentFile(), backupName);
        if (!legacyFile.renameTo(backupFile)) {
            writeTextToFile(backupFile, raw);
        }
        appendLegacyBackupEntry(context, backupName, "legacy-migration");
    }

    private static void migrateLegacyDirectoryDocumentToBundle(
        Context context,
        Uri treeUri,
        Uri legacyDocument
    ) throws Exception {
        String raw = readTextFromUri(context, legacyDocument);
        if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
            return;
        }
        JSONObject parsedRoot = new JSONObject(raw.trim());
        validateRootShape(parsedRoot);
        JSONObject normalizedRoot = normalizeRoot(
            context,
            preserveThemeStateIfMissing(context, parsedRoot),
            true
        );
        if (!writeBundleRoot(context, normalizedRoot)) {
            throw new Exception("旧目录数据迁移失败。");
        }

        String backupName = "controler-data.legacy-" + System.currentTimeMillis() + ".json";
        Uri renamed = DocumentsContract.renameDocument(
            context.getContentResolver(),
            legacyDocument,
            backupName
        );
        if (renamed == null) {
            Uri backupDocument = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                backupName,
                true,
                false
            );
            if (backupDocument != null) {
                writeTextToUri(context, backupDocument, raw);
            }
        }
        appendLegacyBackupEntry(context, backupName, "legacy-migration");
    }

    private static void appendLegacyBackupEntry(
        Context context,
        String fileName,
        String source
    ) throws Exception {
        JSONObject manifest = readBundleManifest(context);
        if (manifest == null) {
            return;
        }
        JSONArray backups = manifest.optJSONArray("legacyBackups");
        if (backups == null) {
            backups = new JSONArray();
            manifest.put("legacyBackups", backups);
        }
        JSONObject backup = new JSONObject();
        backup.put("file", fileName);
        backup.put("source", source);
        backup.put("createdAt", isoNow());
        backups.put(backup);
        writeBundleJson(context, BUNDLE_MANIFEST_FILE_NAME, manifest);
    }

    private static String buildLegacyImportBackupRelativePath(String sourceName) {
        String safeSourceName = String.valueOf(sourceName == null ? "" : sourceName).trim();
        String sanitizedName = sanitizeBundleFileName(safeSourceName);
        if (TextUtils.isEmpty(sanitizedName)) {
            sanitizedName = "legacy-import.json";
        }
        if (!sanitizedName.toLowerCase(Locale.US).endsWith(".json")) {
            sanitizedName += ".json";
        }
        return "imports/" + System.currentTimeMillis() + "-" + sanitizedName;
    }

    private static String sanitizeBundleFileName(String value) {
        if (TextUtils.isEmpty(value)) {
            return "";
        }
        return value.replaceAll("[\\\\/:*?\"<>|]+", "-").replaceAll("\\s+", "-");
    }

    private static String readBundleText(Context context, String relativePath) throws Exception {
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            Uri documentUri = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                relativePath,
                false,
                false
            );
            if (documentUri == null) {
                return "";
            }
            return readTextFromUri(context, documentUri);
        }

        File root = getDefaultBundleRootDirectory(context);
        File target = new File(root, relativePath.replace("/", File.separator));
        return target.exists() ? readTextFromFile(target) : "";
    }

    private static void writeBundleText(Context context, String relativePath, String content)
        throws Exception {
        invalidateProcessStorageCaches();
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            Uri documentUri = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                relativePath,
                true,
                false
            );
            if (documentUri == null) {
                throw new Exception("无法写入 bundle 文件");
            }
            writeTextToUri(context, documentUri, content);
            return;
        }

        File root = getDefaultBundleRootDirectory(context);
        File target = new File(root, relativePath.replace("/", File.separator));
        File parent = target.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        writeTextToFile(target, content);
    }

    private static byte[] readAllBytes(InputStream inputStream) throws Exception {
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

    private static byte[] readBundleBytes(Context context, String relativePath) throws Exception {
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            Uri documentUri = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                relativePath,
                false,
                false
            );
            if (documentUri == null) {
                return new byte[0];
            }
            InputStream inputStream = context.getContentResolver().openInputStream(documentUri);
            try {
                return readAllBytes(inputStream);
            } finally {
                if (inputStream != null) {
                    inputStream.close();
                }
            }
        }

        File root = getDefaultBundleRootDirectory(context);
        File target = new File(root, relativePath.replace("/", File.separator));
        if (!target.exists()) {
            return new byte[0];
        }
        InputStream inputStream = new FileInputStream(target);
        try {
            return readAllBytes(inputStream);
        } finally {
            inputStream.close();
        }
    }

    private static void writeBundleBytes(Context context, String relativePath, byte[] content)
        throws Exception {
        byte[] safeContent = content == null ? new byte[0] : content;
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri treeUri = getCustomStorageDirectoryUri(context);
            String fileMimeType = inferBundleRelativeFileMimeType(normalizedRelativePath);
            Uri documentUri = resolveDirectoryRelativeDocumentUri(
                context,
                treeUri,
                normalizedRelativePath,
                true,
                false,
                fileMimeType
            );
            if (documentUri == null) {
                documentUri =
                    buildExternalStorageTreeRelativeDocumentUri(treeUri, normalizedRelativePath);
            }
            if (documentUri == null) {
                throw new Exception("无法写入 bundle 二进制文件");
            }
            OutputStream outputStream =
                openBundleDocumentOutputStream(
                    context,
                    treeUri,
                    normalizedRelativePath,
                    documentUri,
                    fileMimeType
                );
            if (outputStream == null) {
                throw new Exception("无法打开 bundle 二进制写入流");
            }
            try {
                outputStream.write(safeContent);
                outputStream.flush();
            } finally {
                outputStream.close();
            }
            return;
        }

        File root = getDefaultBundleRootDirectory(context);
        String targetRelativePath =
            TextUtils.isEmpty(normalizedRelativePath) ? relativePath : normalizedRelativePath;
        File target = new File(root, targetRelativePath.replace("/", File.separator));
        File parent = target.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        OutputStream outputStream = new FileOutputStream(target, false);
        try {
            outputStream.write(safeContent);
            outputStream.flush();
        } finally {
            outputStream.close();
        }
    }

    private static String buildDataUriFromBytes(byte[] bytes, String mimeType) {
        byte[] safeBytes = bytes == null ? new byte[0] : bytes;
        if (safeBytes.length <= 0) {
            return "";
        }
        String normalizedMime =
            TextUtils.isEmpty(mimeType) ? "image/jpeg" : mimeType.trim().toLowerCase(Locale.US);
        return "data:"
            + normalizedMime
            + ";base64,"
            + Base64.encodeToString(safeBytes, Base64.NO_WRAP);
    }

    private static JSONArray readDiaryMediaManifestEntries(Context context) throws Exception {
        JSONObject manifest = readBundleManifest(context);
        JSONObject assets = manifest == null ? null : manifest.optJSONObject("assets");
        return normalizeDiaryMediaAssets(assets == null ? null : assets.optJSONArray("diaryMedia"));
    }

    private static void writeDiaryMediaManifestEntries(Context context, JSONArray assetEntries)
        throws Exception {
        JSONObject manifest = readBundleManifest(context);
        if (manifest == null) {
            manifest = buildStorageManifest(normalizeRoot(context, new JSONObject(), false));
        }
        JSONObject assets = manifest.optJSONObject("assets");
        if (assets == null) {
            assets = new JSONObject();
            manifest.put("assets", assets);
        }
        assets.put("diaryMedia", normalizeDiaryMediaAssets(assetEntries));
        touchBundleMetadata(context, manifest);
    }

    private static JSONObject findDiaryMediaAssetEntry(Context context, String assetId)
        throws Exception {
        String normalizedAssetId = sanitizeJsonString(assetId);
        if (TextUtils.isEmpty(normalizedAssetId)) {
            return null;
        }
        JSONArray entries = readDiaryMediaManifestEntries(context);
        for (int index = 0; index < entries.length(); index += 1) {
            JSONObject entry = entries.optJSONObject(index);
            if (
                entry != null &&
                normalizedAssetId.equals(entry.optString("assetId", ""))
            ) {
                return cloneJsonObject(entry);
            }
        }
        return null;
    }

    public static synchronized JSONObject saveDiaryImageAsset(
        Context context,
        JSONObject assetPayload,
        byte[] content
    ) throws Exception {
        assertStorageWritable();
        ensureBundleStorageReady(context);
        JSONObject normalizedEntry = normalizeDiaryMediaAssetEntry(assetPayload);
        if (normalizedEntry == null) {
            throw new Exception("无效的日记图片资源描述。");
        }
        writeBundleBytes(context, normalizedEntry.optString("file", ""), content);
        JSONArray entries = readDiaryMediaManifestEntries(context);
        JSONArray nextEntries = new JSONArray();
        String assetId = normalizedEntry.optString("assetId", "");
        for (int index = 0; index < entries.length(); index += 1) {
            JSONObject entry = entries.optJSONObject(index);
            if (
                entry == null ||
                assetId.equals(entry.optString("assetId", ""))
            ) {
                continue;
            }
            nextEntries.put(cloneJsonObject(entry));
        }
        nextEntries.put(cloneJsonObject(normalizedEntry));
        writeDiaryMediaManifestEntries(context, nextEntries);
        return cloneJsonObject(normalizedEntry);
    }

    public static synchronized JSONObject resolveDiaryImageUri(
        Context context,
        JSONObject options
    ) throws Exception {
        ensureBundleStorageReady(context);
        String assetId =
            sanitizeJsonString(
                firstNonEmpty(
                    options == null ? "" : options.optString("assetId", ""),
                    options == null ? "" : options.optString("id", "")
                )
            );
        if (TextUtils.isEmpty(assetId)) {
            return null;
        }
        JSONObject entry = findDiaryMediaAssetEntry(context, assetId);
        if (entry == null) {
            return null;
        }
        byte[] bytes = readBundleBytes(context, entry.optString("file", ""));
        JSONObject result = cloneJsonObject(entry);
        result.put("exists", bytes.length > 0);
        result.put("uri", buildDataUriFromBytes(bytes, entry.optString("mimeType", "")));
        return result;
    }

    public static synchronized JSONObject deleteDiaryImageAssets(
        Context context,
        JSONObject options
    ) throws Exception {
        assertStorageWritable();
        ensureBundleStorageReady(context);
        Set<String> targetAssetIds = new LinkedHashSet<>();
        Set<String> keepAssetIds = new LinkedHashSet<>();
        JSONArray assetIds = options == null ? null : options.optJSONArray("assetIds");
        if (assetIds != null) {
            for (int index = 0; index < assetIds.length(); index += 1) {
                String assetId = sanitizeJsonString(assetIds.optString(index, ""));
                if (!TextUtils.isEmpty(assetId)) {
                    targetAssetIds.add(assetId);
                }
            }
        }
        JSONArray keepIds = options == null ? null : options.optJSONArray("keepAssetIds");
        if (keepIds != null) {
            for (int index = 0; index < keepIds.length(); index += 1) {
                String assetId = sanitizeJsonString(keepIds.optString(index, ""));
                if (!TextUtils.isEmpty(assetId)) {
                    keepAssetIds.add(assetId);
                }
            }
        }
        JSONArray entries = readDiaryMediaManifestEntries(context);
        JSONArray nextEntries = new JSONArray();
        JSONArray deletedAssetIds = new JSONArray();
        ArrayList<String> deletedPaths = new ArrayList<>();
        for (int index = 0; index < entries.length(); index += 1) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry == null) {
                continue;
            }
            String assetId = entry.optString("assetId", "");
            boolean shouldDelete =
                !targetAssetIds.isEmpty()
                    ? targetAssetIds.contains(assetId)
                    : !keepAssetIds.isEmpty() && !keepAssetIds.contains(assetId);
            if (!shouldDelete) {
                nextEntries.put(cloneJsonObject(entry));
                continue;
            }
            deletedPaths.add(entry.optString("file", ""));
            deletedAssetIds.put(assetId);
        }
        if (deletedAssetIds.length() > 0 || !keepAssetIds.isEmpty()) {
            writeDiaryMediaManifestEntries(context, nextEntries);
            for (String path : deletedPaths) deleteBundlePath(context, path);
        }
        JSONObject result = new JSONObject();
        result.put("deletedAssetIds", deletedAssetIds);
        result.put("remainingAssetCount", nextEntries.length());
        return result;
    }

    private static File getDefaultBundleRootDirectory(Context context) {
        File defaultFile = getDefaultStorageFile(context);
        File parent = defaultFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        return parent == null ? defaultFile.getParentFile() : parent;
    }

    private static long queryBundleSize(Context context, Uri treeUri, File localRoot) {
        try {
            JSONObject manifest;
            if (treeUri != null) {
                Uri manifestUri = resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    BUNDLE_MANIFEST_FILE_NAME,
                    false,
                    false
                );
                if (manifestUri == null) {
                    return 0L;
                }
                manifest = new JSONObject(readTextFromUri(context, manifestUri));
            } else if (localRoot != null) {
                File manifestFile = new File(localRoot, BUNDLE_MANIFEST_FILE_NAME);
                if (!manifestFile.exists()) {
                    return 0L;
                }
                manifest = new JSONObject(readTextFromFile(manifestFile));
            } else {
                return 0L;
            }

            long total = 0L;
            for (String file : collectBundleFilesFromManifest(manifest)) {
                if (treeUri != null) {
                    Uri documentUri = resolveDirectoryRelativeDocumentUri(
                        context,
                        treeUri,
                        file,
                        false,
                        false
                    );
                    if (documentUri != null) {
                        total += queryDocumentSize(context, documentUri);
                    }
                } else if (localRoot != null) {
                    File target = new File(localRoot, file.replace("/", File.separator));
                    if (target.exists()) {
                        total += target.length();
                    }
                }
            }
            return total;
        } catch (Exception error) {
            return 0L;
        }
    }

    private static String normalizeBundleRelativePath(String relativePath) {
        return String.valueOf(relativePath == null ? "" : relativePath)
            .replace('\\', '/')
            .replaceAll("/+", "/")
            .replaceAll("^/+|/+$", "");
    }

    private static String getBundleRelativeFileName(String relativePath) {
        String normalizedPath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedPath)) {
            return "";
        }
        int separatorIndex = normalizedPath.lastIndexOf('/');
        return separatorIndex >= 0
            ? normalizedPath.substring(separatorIndex + 1)
            : normalizedPath;
    }

    private static boolean isIgnoredBundleArtifactRelativePath(String relativePath) {
        String normalizedPath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedPath)) {
            return false;
        }
        String normalizedLower = normalizedPath.toLowerCase(Locale.US);
        if (normalizedLower.endsWith(".json") && normalizedLower.contains(".sync-conflict-")) {
            return true;
        }
        String fileName = getBundleRelativeFileName(normalizedPath);
        String fileNameLower = fileName.toLowerCase(Locale.US);
        if (!fileNameLower.endsWith(".json")) {
            return false;
        }
        if (fileName.matches("(?i).+ \\(\\d+\\)\\.json$")) {
            return true;
        }
        return false;
    }

    private static boolean isIgnoredBundleArtifactDirectoryName(String directoryName) {
        String normalizedName = safeText(directoryName);
        if (TextUtils.isEmpty(normalizedName)) {
            return false;
        }
        if (!normalizedName.matches(".+ \\(\\d+\\)$")) {
            return false;
        }
        String baseName = normalizedName.replaceFirst(" \\(\\d+\\)$", "");
        return "records".equals(baseName)
            || "dailyCheckins".equals(baseName)
            || "checkins".equals(baseName)
            || "plans".equals(baseName)
            || "diaryEntries".equals(baseName)
            || "backups".equals(baseName);
    }

    private static String getIgnoredBundleArtifactDirectoryBaseName(String directoryName) {
        String normalizedName = safeText(directoryName);
        if (!isIgnoredBundleArtifactDirectoryName(normalizedName)) {
            return "";
        }
        return normalizedName.replaceFirst(" \\(\\d+\\)$", "");
    }

    private static ArrayList<String> listBundleJsonRelativePaths(
        Context context,
        Uri treeUri,
        File localRoot
    ) {
        ArrayList<String> relativePaths = new ArrayList<>();
        if (treeUri != null && context != null) {
            try {
                Uri rootDocumentUri = DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    DocumentsContract.getTreeDocumentId(treeUri)
                );
                collectDirectoryBundleJsonPaths(
                    context,
                    treeUri,
                    rootDocumentUri,
                    "",
                    relativePaths
                );
            } catch (Exception ignored) {
            }
        } else if (localRoot != null && localRoot.exists()) {
            collectLocalBundleJsonPaths(localRoot, "", relativePaths);
        }

        ArrayList<String> normalizedPaths = new ArrayList<>();
        for (String relativePath : relativePaths) {
            String normalizedPath = normalizeBundleRelativePath(relativePath);
            if (!TextUtils.isEmpty(normalizedPath)
                && normalizedPath.toLowerCase(Locale.US).endsWith(".json")) {
                normalizedPaths.add(normalizedPath);
            }
        }
        Collections.sort(normalizedPaths);
        return normalizedPaths;
    }

    private static ArrayList<String> listBundlePartitionRelativePaths(
        Context context,
        Uri treeUri,
        File localRoot
    ) {
        ArrayList<String> partitions = new ArrayList<>();
        for (String relativePath : listBundleJsonRelativePaths(context, treeUri, localRoot)) {
            String normalizedPath = normalizeBundleRelativePath(relativePath);
            if (isBundlePartitionRelativePath(normalizedPath)) {
                partitions.add(normalizedPath);
            }
        }
        Collections.sort(partitions);
        return partitions;
    }

    private static void deleteIgnoredBundleArtifacts(Context context, String reason) {
        Uri treeUri = usesDirectoryBundleStorage(context) ? getCustomStorageDirectoryUri(context) : null;
        File localRoot = treeUri == null ? getDefaultBundleRootDirectory(context) : null;
        ArrayList<String> candidates = listBundleJsonRelativePaths(context, treeUri, localRoot);
        ArrayList<String> deletedSamples = new ArrayList<>();
        int deletedCount = 0;
        for (String relativePath : candidates) {
            if (!isIgnoredBundleArtifactRelativePath(relativePath)) {
                continue;
            }
            deleteBundlePath(context, relativePath);
            deletedCount += 1;
            if (deletedSamples.size() < 6) {
                deletedSamples.add(relativePath);
            }
        }
        deletedCount += deleteIgnoredBundleArtifactDirectories(
            context,
            treeUri,
            localRoot,
            deletedSamples
        );
        if (deletedCount > 0) {
            Log.i(
                TAG,
                "[storage.bundle-artifact-cleanup] reason="
                    + safeText(reason)
                    + " deletedCount="
                    + deletedCount
                    + " samples="
                    + deletedSamples.toString()
            );
        }
    }

    private static int deleteIgnoredBundleArtifactDirectories(
        Context context,
        Uri treeUri,
        File localRoot,
        ArrayList<String> deletedSamples
    ) {
        int deletedCount = 0;
        if (treeUri != null && context != null) {
            Uri rootDocumentUri = resolveMetadataQueryUri(treeUri);
            Cursor cursor = null;
            try {
                String rootDocumentId = DocumentsContract.getDocumentId(rootDocumentUri);
                Uri childrenUri =
                    DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, rootDocumentId);
                cursor = context.getContentResolver().query(
                    childrenUri,
                    new String[] {
                        Document.COLUMN_DOCUMENT_ID,
                        Document.COLUMN_DISPLAY_NAME,
                        Document.COLUMN_MIME_TYPE
                    },
                    null,
                    null,
                    null
                );
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        String documentId = cursor.getString(0);
                        String displayName = cursor.getString(1);
                        String mimeType = cursor.getString(2);
                        if (!Document.MIME_TYPE_DIR.equals(mimeType)) {
                            continue;
                        }
                        if (!isIgnoredBundleArtifactDirectoryName(displayName)) {
                            continue;
                        }
                        String baseName = getIgnoredBundleArtifactDirectoryBaseName(displayName);
                        if (TextUtils.isEmpty(baseName)) {
                            continue;
                        }
                        Uri canonicalUri = findChildDocumentUri(
                            context,
                            treeUri,
                            rootDocumentUri,
                            baseName
                        );
                        if (canonicalUri == null || !queryDocumentExists(context, canonicalUri)) {
                            continue;
                        }
                        Uri duplicateUri =
                            DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                        deleteDocumentQuietly(context, duplicateUri);
                        deletedCount += 1;
                        if (deletedSamples != null && deletedSamples.size() < 6) {
                            deletedSamples.add(displayName + "/");
                        }
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (cursor != null) {
                    cursor.close();
                }
            }
            return deletedCount;
        }

        if (localRoot == null || !localRoot.exists()) {
            return 0;
        }
        File[] children = localRoot.listFiles();
        if (children == null) {
            return 0;
        }
        for (File child : children) {
            if (child == null || !child.isDirectory()) {
                continue;
            }
            String baseName = getIgnoredBundleArtifactDirectoryBaseName(child.getName());
            if (TextUtils.isEmpty(baseName)) {
                continue;
            }
            File canonicalDirectory = new File(localRoot, baseName);
            if (!canonicalDirectory.exists() || !canonicalDirectory.isDirectory()) {
                continue;
            }
            clearLocalDirectory(child);
            child.delete();
            deletedCount += 1;
            if (deletedSamples != null && deletedSamples.size() < 6) {
                deletedSamples.add(child.getName() + "/");
            }
        }
        return deletedCount;
    }

    private static void collectLocalBundleJsonPaths(
        File directory,
        String relativePrefix,
        ArrayList<String> output
    ) {
        if (directory == null || output == null || !directory.exists()) {
            return;
        }
        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (child == null) {
                continue;
            }
            String relativePath =
                TextUtils.isEmpty(relativePrefix)
                    ? child.getName()
                    : relativePrefix + "/" + child.getName();
            if (child.isDirectory()) {
                collectLocalBundleJsonPaths(child, relativePath, output);
                continue;
            }
            if (child.isFile() && child.getName().toLowerCase(Locale.US).endsWith(".json")) {
                output.add(normalizeBundleRelativePath(relativePath));
            }
        }
    }

    private static void collectDirectoryBundleJsonPaths(
        Context context,
        Uri treeUri,
        Uri parentDocumentUri,
        String relativePrefix,
        ArrayList<String> output
    ) {
        if (context == null || treeUri == null || parentDocumentUri == null || output == null) {
            return;
        }
        Cursor cursor = null;
        try {
            String parentDocumentId = DocumentsContract.getDocumentId(parentDocumentUri);
            Uri childrenUri =
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
            cursor = context.getContentResolver().query(
                childrenUri,
                new String[] {
                    Document.COLUMN_DOCUMENT_ID,
                    Document.COLUMN_DISPLAY_NAME,
                    Document.COLUMN_MIME_TYPE
                },
                null,
                null,
                null
            );
            if (cursor == null) {
                return;
            }
            while (cursor.moveToNext()) {
                String documentId = cursor.getString(0);
                String displayName = cursor.getString(1);
                String mimeType = cursor.getString(2);
                if (TextUtils.isEmpty(documentId) || TextUtils.isEmpty(displayName)) {
                    continue;
                }
                String relativePath =
                    TextUtils.isEmpty(relativePrefix)
                        ? displayName
                        : relativePrefix + "/" + displayName;
                Uri childDocumentUri =
                    DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                if (Document.MIME_TYPE_DIR.equals(mimeType)) {
                    collectDirectoryBundleJsonPaths(
                        context,
                        treeUri,
                        childDocumentUri,
                        relativePath,
                        output
                    );
                    continue;
                }
                if (displayName.toLowerCase(Locale.US).endsWith(".json")) {
                    output.add(normalizeBundleRelativePath(relativePath));
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private static boolean isBundlePartitionRelativePath(String relativePath) {
        String normalizedPath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedPath)
            || isIgnoredBundleArtifactRelativePath(normalizedPath)
            || BUNDLE_MANIFEST_FILE_NAME.equals(normalizedPath)
            || BUNDLE_CORE_FILE_NAME.equals(normalizedPath)
            || BUNDLE_RECURRING_PLANS_FILE_NAME.equals(normalizedPath)
            || "controler-data.json".equals(normalizedPath)) {
            return false;
        }
        for (String section : new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        }) {
            if (normalizedPath.startsWith(section + "/")
                && normalizedPath.toLowerCase(Locale.US).endsWith(".json")) {
                return true;
            }
        }
        return false;
    }

    private static File getRuntimeSidecarCacheFile(Context context, String fileName) {
        return new File(
            getRuntimeSidecarBaseDirectory(context),
            TextUtils.isEmpty(fileName) ? "cache.json" : fileName
        );
    }

    private static JSONObject readRuntimeCacheJson(File file) {
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

    private static void writeRuntimeCacheJson(File file, JSONObject value) {
        if (file == null) {
            return;
        }
        try {
            writeTextToFile(file, value == null ? "{}" : value.toString());
        } catch (Exception ignored) {
        }
    }

    private static File getDirectoryDocumentUriCacheFile(Context context) {
        return getRuntimeSidecarCacheFile(context, DIRECTORY_DOCUMENT_URI_CACHE_FILE_NAME);
    }

    private static File getBundleSizeCacheFile(Context context) {
        return getRuntimeSidecarCacheFile(context, BUNDLE_SIZE_CACHE_FILE_NAME);
    }

    private static String buildDirectoryDocumentUriCacheKey(Uri treeUri, String relativePath) {
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (treeUri == null || TextUtils.isEmpty(normalizedRelativePath)) {
            return "";
        }
        return treeUri.toString() + "|" + normalizedRelativePath;
    }

    private static Uri getCachedDirectoryDocumentUri(
        Context context,
        Uri treeUri,
        String relativePath
    ) {
        String cacheKey = buildDirectoryDocumentUriCacheKey(treeUri, relativePath);
        if (TextUtils.isEmpty(cacheKey)) {
            return null;
        }
        String rawUri =
            safeText(readRuntimeCacheJson(getDirectoryDocumentUriCacheFile(context)).optString(cacheKey, ""));
        if (TextUtils.isEmpty(rawUri)) {
            return null;
        }
        try {
            return Uri.parse(rawUri);
        } catch (Exception error) {
            removeDirectoryDocumentUriCacheEntry(context, treeUri, relativePath);
            return null;
        }
    }

    private static void putDirectoryDocumentUriCacheEntry(
        Context context,
        Uri treeUri,
        String relativePath,
        Uri documentUri
    ) {
        String cacheKey = buildDirectoryDocumentUriCacheKey(treeUri, relativePath);
        if (TextUtils.isEmpty(cacheKey) || documentUri == null) {
            return;
        }
        File cacheFile = getDirectoryDocumentUriCacheFile(context);
        JSONObject cache = readRuntimeCacheJson(cacheFile);
        try {
            cache.put(cacheKey, documentUri.toString());
            writeRuntimeCacheJson(cacheFile, cache);
        } catch (Exception ignored) {
        }
    }

    public static void removeDirectoryDocumentUriCacheEntry(
        Context context,
        Uri treeUri,
        String relativePath
    ) {
        String cacheKey = buildDirectoryDocumentUriCacheKey(treeUri, relativePath);
        if (TextUtils.isEmpty(cacheKey)) {
            return;
        }
        File cacheFile = getDirectoryDocumentUriCacheFile(context);
        JSONObject cache = readRuntimeCacheJson(cacheFile);
        if (!cache.has(cacheKey)) {
            return;
        }
        cache.remove(cacheKey);
        if (cache.length() == 0) {
            cacheFile.delete();
            return;
        }
        writeRuntimeCacheJson(cacheFile, cache);
    }

    private static void clearDirectoryDocumentUriCache(Context context, Uri treeUri) {
        File cacheFile = getDirectoryDocumentUriCacheFile(context);
        if (!cacheFile.exists()) {
            return;
        }
        if (treeUri == null) {
            cacheFile.delete();
            return;
        }

        JSONObject cache = readRuntimeCacheJson(cacheFile);
        String prefix = treeUri.toString() + "|";
        ArrayList<String> keysToRemove = new ArrayList<>();
        java.util.Iterator<String> iterator = cache.keys();
        while (iterator.hasNext()) {
            String key = iterator.next();
            if (key != null && key.startsWith(prefix)) {
                keysToRemove.add(key);
            }
        }
        if (keysToRemove.isEmpty()) {
            return;
        }
        for (String key : keysToRemove) {
            cache.remove(key);
        }
        if (cache.length() == 0) {
            cacheFile.delete();
            return;
        }
        writeRuntimeCacheJson(cacheFile, cache);
    }

    private static String buildBundleSizeCacheKey(Uri treeUri, File localRoot) {
        if (treeUri != null) {
            return "tree:" + treeUri.toString();
        }
        if (localRoot != null) {
            return "local:" + localRoot.getAbsolutePath();
        }
        return "";
    }

    private static JSONObject getBundleSizeCacheEntry(
        Context context,
        Uri treeUri,
        File localRoot
    ) {
        String cacheKey = buildBundleSizeCacheKey(treeUri, localRoot);
        if (TextUtils.isEmpty(cacheKey)) {
            return null;
        }
        return readRuntimeCacheJson(getBundleSizeCacheFile(context)).optJSONObject(cacheKey);
    }

    private static long getCachedBundleSize(Context context, Uri treeUri, File localRoot) {
        JSONObject entry = getBundleSizeCacheEntry(context, treeUri, localRoot);
        if (entry == null || !entry.has("size")) {
            return 0L;
        }
        return Math.max(0L, entry.optLong("size", 0L));
    }

    private static String getCachedBundleSizeFingerprint(
        Context context,
        Uri treeUri,
        File localRoot
    ) {
        JSONObject entry = getBundleSizeCacheEntry(context, treeUri, localRoot);
        return safeText(entry == null ? "" : entry.optString("manifestFingerprint", ""));
    }

    private static void putBundleSizeCacheEntry(
        Context context,
        Uri treeUri,
        File localRoot,
        String manifestFingerprint,
        long size
    ) {
        String cacheKey = buildBundleSizeCacheKey(treeUri, localRoot);
        if (TextUtils.isEmpty(cacheKey)) {
            return;
        }
        File cacheFile = getBundleSizeCacheFile(context);
        JSONObject cache = readRuntimeCacheJson(cacheFile);
        try {
            JSONObject entry = new JSONObject();
            entry.put("size", Math.max(0L, size));
            entry.put("manifestFingerprint", safeText(manifestFingerprint));
            entry.put("updatedAt", System.currentTimeMillis());
            cache.put(cacheKey, entry);
            writeRuntimeCacheJson(cacheFile, cache);
        } catch (Exception ignored) {
        }
    }

    private static void clearBundleSizeCacheEntry(Context context, Uri treeUri, File localRoot) {
        String cacheKey = buildBundleSizeCacheKey(treeUri, localRoot);
        if (TextUtils.isEmpty(cacheKey)) {
            return;
        }
        File cacheFile = getBundleSizeCacheFile(context);
        JSONObject cache = readRuntimeCacheJson(cacheFile);
        if (!cache.has(cacheKey)) {
            return;
        }
        cache.remove(cacheKey);
        if (cache.length() == 0) {
            cacheFile.delete();
            return;
        }
        writeRuntimeCacheJson(cacheFile, cache);
    }

    public static void clearStorageRuntimeCaches(Context context) {
        resetStorageRecoveryState();
        invalidateProcessStorageCaches();
        clearPageBootstrapSnapshots(context);
        clearDirectoryDocumentUriCache(context, null);
        File sizeCacheFile = getBundleSizeCacheFile(context);
        if (sizeCacheFile.exists()) {
            sizeCacheFile.delete();
        }
        clearStorageBindingResolutionCache();
    }

    private static void clearPageBootstrapSnapshots(Context context) {
        if (context == null) return;
        File directory = new File(context.getFilesDir(), PAGE_BOOTSTRAP_SNAPSHOT_DIRECTORY);
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile()) file.delete();
            }
        }
        directory.delete();
    }

    private static void clearStorageBindingResolutionCache() {
        storageBindingResolvedAt = 0L;
    }

    private static boolean canUseStorageBindingResolutionCache() {
        return storageBindingResolvedAt > 0L;
    }

    private static void markStorageBindingResolved() {
        storageBindingResolvedAt = SystemClock.elapsedRealtime();
    }

    private static File getStorageBindingFile(Context context) {
        File root =
            context == null
                ? null
                : (
                    context.getNoBackupFilesDir() != null
                        ? context.getNoBackupFilesDir()
                        : context.getFilesDir()
                );
        File directory = new File(root == null ? new File(".") : root, "runtime-sidecar");
        if (!directory.exists()) {
            directory.mkdirs();
        }
        return new File(directory, STORAGE_BINDING_FILE_NAME);
    }

    private static String getStoredStorageModeRaw(Context context) {
        if (context == null) {
            return MODE_DEFAULT;
        }
        return getStoragePreferences(context).getString(KEY_STORAGE_MODE, MODE_DEFAULT);
    }

    private static String getStoredCustomStorageNameRaw(Context context) {
        if (context == null) {
            return "";
        }
        return getStoragePreferences(context).getString(KEY_CUSTOM_STORAGE_NAME, "");
    }

    private static String getStoredCustomStorageDirectoryNameRaw(Context context) {
        if (context == null) {
            return "";
        }
        return getStoragePreferences(context).getString(KEY_CUSTOM_STORAGE_DIRECTORY_NAME, "");
    }

    private static Uri parseStoredUri(String rawUri) {
        if (TextUtils.isEmpty(rawUri)) {
            return null;
        }
        try {
            return Uri.parse(rawUri);
        } catch (Exception error) {
            return null;
        }
    }

    private static Uri getStoredCustomStorageUriRaw(Context context) {
        if (context == null) {
            return null;
        }
        return parseStoredUri(getStoragePreferences(context).getString(KEY_CUSTOM_STORAGE_URI, ""));
    }

    private static Uri getStoredCustomStorageDirectoryUriRaw(Context context) {
        if (context == null) {
            return null;
        }
        return parseStoredUri(
            getStoragePreferences(context).getString(KEY_CUSTOM_STORAGE_DIRECTORY_URI, "")
        );
    }

    private static void persistStorageBindingSnapshot(
        Context context,
        String kind,
        Uri uri,
        String displayName
    ) {
        if (context == null) {
            return;
        }
        File file = getStorageBindingFile(context);
        try {
            JSONObject snapshot = new JSONObject();
            snapshot.put("kind", safeText(kind));
            snapshot.put(
                "uri",
                uri == null || TextUtils.isEmpty(uri.toString()) ? JSONObject.NULL : uri.toString()
            );
            snapshot.put(
                "displayName",
                TextUtils.isEmpty(displayName) ? JSONObject.NULL : displayName
            );
            snapshot.put("updatedAt", System.currentTimeMillis());
            writeTextToFile(file, snapshot.toString(2));
        } catch (Exception error) {
            Log.w(TAG, "[storage.binding] stage=snapshot-write-failed", error);
        }
    }

    private static void markStorageBindingReset(Context context) {
        persistStorageBindingSnapshot(context, STORAGE_BINDING_KIND_RESET, null, "");
    }

    private static StoredStorageBinding readStoredStorageBinding(Context context) {
        StoredStorageBinding binding = new StoredStorageBinding();
        if (context == null) {
            return binding;
        }
        File file = getStorageBindingFile(context);
        if (!file.exists()) {
            return binding;
        }
        try {
            JSONObject snapshot = new JSONObject(readTextFromFile(file));
            binding.kind = safeText(snapshot.optString("kind", ""));
            binding.uri = parseStoredUri(snapshot.optString("uri", ""));
            binding.displayName = safeText(snapshot.optString("displayName", ""));
            binding.updatedAt = Math.max(0L, snapshot.optLong("updatedAt", 0L));
        } catch (Exception error) {
            Log.w(TAG, "[storage.binding] stage=snapshot-read-failed", error);
        }
        return binding;
    }

    private static boolean hasPersistedUriAccess(Context context, Uri uri) {
        if (context == null || uri == null) {
            return false;
        }
        try {
            List<UriPermission> permissions = context.getContentResolver().getPersistedUriPermissions();
            for (UriPermission permission : permissions) {
                if (permission == null || permission.getUri() == null) {
                    continue;
                }
                if (!uri.equals(permission.getUri())) {
                    continue;
                }
                if (permission.isReadPermission() || permission.isWritePermission()) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private static void releasePersistedUriPermissionQuietly(Context context, Uri uri) {
        if (context == null || uri == null) {
            return;
        }
        try {
            context
                .getContentResolver()
                .releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
        } catch (Exception ignored) {
        }
    }

    private static boolean isAccessibleStorageFileUri(Context context, Uri uri) {
        return uri != null
            && hasPersistedUriAccess(context, uri)
            && queryDocumentExists(context, resolveMetadataQueryUri(uri));
    }

    private static boolean isAccessibleStorageDirectoryUri(Context context, Uri treeUri) {
        return treeUri != null
            && hasPersistedUriAccess(context, treeUri)
            && queryDocumentExists(context, resolveMetadataQueryUri(treeUri));
    }

    private static void logStorageBindingState(
        String stage,
        String reason,
        String mode,
        Uri uri,
        String extra
    ) {
        Log.i(
            TAG,
            "[storage.binding] stage="
                + safeText(stage)
                + " reason="
                + safeText(reason)
                + " mode="
                + safeText(mode)
                + " uri="
                + (uri == null ? "" : uri.toString())
                + " extra="
                + safeText(extra)
        );
    }

    private static void restoreStorageBindingFromSnapshot(
        Context context,
        StoredStorageBinding binding,
        String reason
    ) {
        if (context == null || binding == null || binding.uri == null) {
            return;
        }
        if (STORAGE_BINDING_KIND_FILE.equals(binding.kind)) {
            setCustomStorageUri(
                context,
                binding.uri,
                firstNonEmpty(binding.displayName, queryDisplayName(context, binding.uri))
            );
            logStorageBindingState(
                "restored-from-snapshot",
                reason,
                MODE_FILE,
                binding.uri,
                binding.displayName
            );
            return;
        }
        if (STORAGE_BINDING_KIND_DIRECTORY.equals(binding.kind)) {
            setCustomStorageDirectoryUri(
                context,
                binding.uri,
                firstNonEmpty(binding.displayName, queryDisplayName(context, binding.uri))
            );
            logStorageBindingState(
                "restored-from-snapshot",
                reason,
                MODE_DIRECTORY,
                binding.uri,
                binding.displayName
            );
        }
    }

    private static StorageBindingCandidate findPersistedDirectoryBindingCandidate(Context context) {
        StorageBindingCandidate best = null;
        if (context == null) {
            return null;
        }
        int inspectedCount = 0;
        int matchedCount = 0;
        try {
            List<UriPermission> permissions = context.getContentResolver().getPersistedUriPermissions();
            for (UriPermission permission : permissions) {
                Uri uri = permission == null ? null : permission.getUri();
                if (uri == null || !permission.isReadPermission()) {
                    continue;
                }
                if (!DocumentsContract.isTreeUri(uri)) {
                    continue;
                }
                inspectedCount += 1;
                boolean hasBundleData = false;
                try {
                    hasBundleData = directoryContainsBundleOrLegacy(context, uri);
                } catch (Exception ignored) {
                    hasBundleData = false;
                }
                logStorageBindingState(
                    "persisted-scan",
                    "scan-persisted-tree",
                    MODE_DIRECTORY,
                    uri,
                    "hasBundleData=" + hasBundleData
                );
                if (!hasBundleData) {
                    continue;
                }
                matchedCount += 1;
                String displayName = queryDisplayName(context, uri);
                int score = 1000;
                String lowerDisplayName = String.valueOf(displayName).toLowerCase(Locale.US);
                String lowerUri = uri.toString().toLowerCase(Locale.US);
                if (permission.isWritePermission()) {
                    score += 100;
                }
                if (lowerDisplayName.contains("order")) {
                    score += 50;
                }
                if (lowerUri.contains("order")) {
                    score += 25;
                }
                score += (int) Math.min(Integer.MAX_VALUE / 4, permission.getPersistedTime() / 1000L);
                if (best == null || score > best.score) {
                    best = new StorageBindingCandidate();
                    best.uri = uri;
                    best.displayName = displayName;
                    best.persistedAt = permission.getPersistedTime();
                    best.score = score;
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "[storage.binding] stage=persisted-scan-failed", error);
            return null;
        }
        logStorageBindingState(
            "persisted-scan-summary",
            "scan-persisted-tree",
            MODE_DIRECTORY,
            best == null ? null : best.uri,
            "inspected=" + inspectedCount + " matched=" + matchedCount
        );
        return best;
    }

    private static void ensureStorageBindingResolved(Context context, String reason) {
        if (context == null || canUseStorageBindingResolutionCache()) {
            return;
        }
        try {
            String rawMode = getStoredStorageModeRaw(context);
            Uri rawFileUri = getStoredCustomStorageUriRaw(context);
            Uri rawDirectoryUri = getStoredCustomStorageDirectoryUriRaw(context);
            if (MODE_FILE.equals(rawMode) && isAccessibleStorageFileUri(context, rawFileUri)) {
                persistStorageBindingSnapshot(
                    context,
                    STORAGE_BINDING_KIND_FILE,
                    rawFileUri,
                    firstNonEmpty(
                        getStoredCustomStorageNameRaw(context),
                        queryDisplayName(context, rawFileUri)
                    )
                );
                logStorageBindingState("active-pref", reason, MODE_FILE, rawFileUri, "accessible");
                return;
            }
            if (
                MODE_DIRECTORY.equals(rawMode)
                    && isAccessibleStorageDirectoryUri(context, rawDirectoryUri)
            ) {
                persistStorageBindingSnapshot(
                    context,
                    STORAGE_BINDING_KIND_DIRECTORY,
                    rawDirectoryUri,
                    firstNonEmpty(
                        getStoredCustomStorageDirectoryNameRaw(context),
                        queryDisplayName(context, rawDirectoryUri)
                    )
                );
                logStorageBindingState(
                    "active-pref",
                    reason,
                    MODE_DIRECTORY,
                    rawDirectoryUri,
                    "accessible"
                );
                return;
            }

            StoredStorageBinding snapshot = readStoredStorageBinding(context);
            if (STORAGE_BINDING_KIND_RESET.equals(snapshot.kind)) {
                logStorageBindingState("skip-reset-marker", reason, rawMode, null, "snapshot-reset");
                return;
            }

            if (
                STORAGE_BINDING_KIND_FILE.equals(snapshot.kind)
                    && isAccessibleStorageFileUri(context, snapshot.uri)
            ) {
                restoreStorageBindingFromSnapshot(context, snapshot, reason);
                return;
            }

            if (
                STORAGE_BINDING_KIND_DIRECTORY.equals(snapshot.kind)
                    && isAccessibleStorageDirectoryUri(context, snapshot.uri)
                    && directoryContainsBundleOrLegacy(context, snapshot.uri)
            ) {
                restoreStorageBindingFromSnapshot(context, snapshot, reason);
                return;
            }

            StorageBindingCandidate candidate = findPersistedDirectoryBindingCandidate(context);
            if (candidate != null && candidate.uri != null) {
                setCustomStorageDirectoryUri(
                    context,
                    candidate.uri,
                    firstNonEmpty(candidate.displayName, queryDisplayName(context, candidate.uri))
                );
                logStorageBindingState(
                    "restored-from-persisted",
                    reason,
                    MODE_DIRECTORY,
                    candidate.uri,
                    candidate.displayName
                );
                return;
            }

            logStorageBindingState("fall-back-default", reason, rawMode, null, "no-restorable-binding");
        } finally {
            markStorageBindingResolved();
        }
    }

    private static boolean queryDocumentExists(Context context, Uri uri) {
        if (context == null || uri == null) {
            return false;
        }
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                uri,
                new String[] { Document.COLUMN_DOCUMENT_ID },
                null,
                null,
                null
            );
            return cursor != null && cursor.moveToFirst();
        } catch (Exception ignored) {
            return false;
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private static StorageVersion buildBundleManifestStorageVersion(
        Context context,
        Uri treeUri,
        File localRoot,
        String storagePath,
        String fallbackActualUri
    ) {
        StorageVersion version = new StorageVersion();
        version.storageMode = BUNDLE_MODE;
        version.storagePath = safeText(storagePath);

        Uri manifestUri =
            treeUri == null
                ? null
                : resolveDirectoryRelativeDocumentUri(
                    context,
                    treeUri,
                    BUNDLE_MANIFEST_FILE_NAME,
                    false,
                    false
                );
        File manifestFile =
            treeUri == null && localRoot != null
                ? new File(localRoot, BUNDLE_MANIFEST_FILE_NAME)
                : null;

        long manifestSize = 0L;
        long modifiedAt = 0L;
        String actualUri = safeText(fallbackActualUri);

        if (manifestUri != null) {
            actualUri = manifestUri.toString();
            manifestSize = queryDocumentSize(context, manifestUri);
            modifiedAt = queryDocumentModifiedAt(context, manifestUri);
        } else if (manifestFile != null && manifestFile.exists()) {
            actualUri = manifestFile.getAbsolutePath();
            manifestSize = Math.max(0L, manifestFile.length());
            modifiedAt = Math.max(0L, manifestFile.lastModified());
        }

        version.actualUri = firstNonEmpty(actualUri, version.storagePath);
        version.size = Math.max(0L, manifestSize);
        version.modifiedAt = Math.max(0L, modifiedAt);
        version.supportsModifiedAt = version.modifiedAt > 0L;
        version.fingerprint = buildStorageFingerprint(
            version.size,
            version.modifiedAt,
            version.actualUri
        );
        return version;
    }

    private static StorageLocation buildBundleStorageLocation(
        Context context,
        Uri treeUri,
        File localRoot,
        String storageDirectory,
        String storagePath,
        String fallbackActualUri,
        boolean isCustomPath
    ) {
        StorageLocation location = new StorageLocation();
        location.syncFileName = BUNDLE_MANIFEST_FILE_NAME;
        location.storageMode = BUNDLE_MODE;
        location.isCustomPath = isCustomPath;
        location.storageDirectory = safeText(storageDirectory);
        location.storagePath = safeText(storagePath);

        StorageVersion manifestVersion = buildBundleManifestStorageVersion(
            context,
            treeUri,
            localRoot,
            storagePath,
            fallbackActualUri
        );
        JSONObject cachedSizeEntry = getBundleSizeCacheEntry(context, treeUri, localRoot);
        boolean hasCachedSize = cachedSizeEntry != null && cachedSizeEntry.has("size");
        String cachedFingerprint = getCachedBundleSizeFingerprint(context, treeUri, localRoot);

        location.actualUri = firstNonEmpty(
            manifestVersion.actualUri,
            safeText(fallbackActualUri),
            location.storagePath
        );
        location.modifiedAt = Math.max(0L, manifestVersion.modifiedAt);
        location.size = hasCachedSize
            ? Math.max(0L, getCachedBundleSize(context, treeUri, localRoot))
            : Math.max(0L, manifestVersion.size);
        boolean hasManifestMetadata =
            manifestVersion.supportsModifiedAt || manifestVersion.size > 0L;
        location.sizePending =
            hasManifestMetadata
                && !safeText(manifestVersion.fingerprint).equals(cachedFingerprint);
        return location;
    }

    private static StorageVersion probeBootstrapStorageVersion(Context context) {
        long now = SystemClock.elapsedRealtime();
        if (
            processBootstrapVersion != null
                && now - processBootstrapVersionAt <= 64L
        ) {
            return processBootstrapVersion;
        }
        processBootstrapVersion = probeBootstrapStorageVersionUncached(context);
        processBootstrapVersionAt = now;
        return processBootstrapVersion;
    }

    private static StorageVersion probeBootstrapStorageVersionUncached(Context context) {
        String actualMode = getStorageMode(context);
        if (MODE_FILE.equals(actualMode)) {
            return probeStorageVersion(context, false);
        }
        if (MODE_DIRECTORY.equals(actualMode)) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            String directoryName = firstNonEmpty(
                getStoredCustomStorageDirectoryName(context),
                queryDisplayName(context, directoryUri),
                "已选择目录"
            );
            return buildBundleManifestStorageVersion(
                context,
                directoryUri,
                null,
                directoryName + "/" + BUNDLE_MANIFEST_FILE_NAME,
                directoryUri == null ? "" : directoryUri.toString()
            );
        }

        File bundleRoot = getDefaultBundleRootDirectory(context);
        File manifestFile = new File(bundleRoot, BUNDLE_MANIFEST_FILE_NAME);
        return buildBundleManifestStorageVersion(
            context,
            null,
            bundleRoot,
            manifestFile.getAbsolutePath(),
            manifestFile.getAbsolutePath()
        );
    }

    public static StorageLocation refreshPreciseStorageLocation(Context context) {
        String actualMode = getStorageMode(context);
        if (MODE_FILE.equals(actualMode)) {
            return getStorageLocation(context);
        }

        Uri treeUri = MODE_DIRECTORY.equals(actualMode)
            ? getCustomStorageDirectoryUri(context)
            : null;
        File localRoot = MODE_DIRECTORY.equals(actualMode)
            ? null
            : getDefaultBundleRootDirectory(context);
        StorageVersion manifestVersion = probeBootstrapStorageVersion(context);
        if (TextUtils.isEmpty(manifestVersion.actualUri)) {
            clearBundleSizeCacheEntry(context, treeUri, localRoot);
            return getStorageLocation(context);
        }

        long preciseSize = queryBundleSize(context, treeUri, localRoot);
        putBundleSizeCacheEntry(
            context,
            treeUri,
            localRoot,
            manifestVersion.fingerprint,
            preciseSize
        );
        return getStorageLocation(context);
    }

    private static File getRuntimeSidecarBaseDirectory(Context context) {
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

    private static String buildDraftNamespaceSeed(Context context) {
        StorageLocation location = getStorageLocation(context);
        return firstNonEmpty(
            safeText(location.actualUri),
            safeText(location.storageDirectory),
            safeText(location.storagePath),
            "default"
        );
    }

    private static String sha256Text(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(String.valueOf(value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            return toHex(digest.digest());
        } catch (Exception ignored) {
            return String.valueOf(value == null ? "" : value);
        }
    }

    private static File getRuntimeSidecarNamespaceDirectory(Context context) {
        File target = new File(
            getRuntimeSidecarBaseDirectory(context),
            sha256Text(buildDraftNamespaceSeed(context))
        );
        if (!target.exists()) {
            target.mkdirs();
        }
        return target;
    }

    private static String buildDraftStem(String key) {
        String normalizedKey = safeText(key);
        String preview =
            normalizedKey
                .replaceAll("[^a-zA-Z0-9_-]+", "_")
                .replaceAll("^_+|_+$", "")
                .toLowerCase(Locale.US);
        if (preview.length() > 48) {
            preview = preview.substring(0, 48);
        }
        return (TextUtils.isEmpty(preview) ? "draft" : preview)
            + "-"
            + sha256Text(normalizedKey);
    }

    private static File getDraftDirectory(Context context) {
        File target = new File(getRuntimeSidecarNamespaceDirectory(context), "drafts");
        if (!target.exists()) {
            target.mkdirs();
        }
        return target;
    }

    private static File getDraftOplogDirectory(Context context) {
        File target = new File(getRuntimeSidecarNamespaceDirectory(context), "oplog/drafts");
        if (!target.exists()) {
            target.mkdirs();
        }
        return target;
    }

    private static File getDraftFile(Context context, String key) {
        return new File(getDraftDirectory(context), buildDraftStem(key) + ".json");
    }

    private static File getDraftLogFile(Context context, String key) {
        return new File(getDraftOplogDirectory(context), buildDraftStem(key) + ".jsonl");
    }

    private static JSONObject buildDraftOperation(String action, String key, Object value)
        throws Exception {
        JSONObject operation = new JSONObject();
        String updatedAt = isoNow();
        String operationId =
            sha256Text(
                safeText(key)
                    + ":"
                    + safeText(action)
                    + ":"
                    + updatedAt
                    + ":"
                    + System.nanoTime()
            );
        operation.put("operationId", operationId);
        operation.put("action", safeText(action));
        operation.put("key", safeText(key));
        operation.put("updatedAt", updatedAt);
        operation.put("value", cloneJsonValue(value == null ? JSONObject.NULL : value));
        return operation;
    }

    private static void appendDraftOperation(Context context, String key, JSONObject operation)
        throws Exception {
        File target = getDraftLogFile(context, key);
        File parent = target.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        FileOutputStream outputStream = new FileOutputStream(target, true);
        try {
            outputStream.write((operation.toString() + "\n").getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.getFD().sync();
        } finally {
            outputStream.close();
        }
    }

    private static JSONObject readDraftEnvelope(Context context, String key) {
        try {
            File target = getDraftFile(context, key);
            if (!target.exists()) {
                return null;
            }
            JSONObject parsed = new JSONObject(readTextFromFile(target));
            return cloneJsonObject(parsed);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static JSONObject readLatestDraftOperation(Context context, String key) {
        try {
            File target = getDraftLogFile(context, key);
            if (!target.exists()) {
                return null;
            }
            String raw = readTextFromFile(target).trim();
            if (TextUtils.isEmpty(raw)) {
                return null;
            }
            String[] lines = raw.split("\\r?\\n");
            if (lines.length == 0) {
                return null;
            }
            return new JSONObject(lines[lines.length - 1]);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String readTextFromFile(File file) throws Exception {
        FileInputStream inputStream = new FileInputStream(file);
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

    private static void writeTextToFile(File file, String content) throws Exception {
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

    private static void clearLocalDirectory(File directory) {
        if (directory == null || !directory.exists()) {
            return;
        }
        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (child.isDirectory()) {
                clearLocalDirectory(child);
            }
            child.delete();
        }
    }

    private static void writeLocalBundleSnapshot(File rootDirectory, JSONObject normalizedRoot)
        throws Exception {
        JSONObject manifest = buildStorageManifest(normalizedRoot);
        writeTextToFile(new File(rootDirectory, BUNDLE_CORE_FILE_NAME), buildCoreStateFromRoot(normalizedRoot).toString(2));
        writeTextToFile(
            new File(rootDirectory, BUNDLE_RECURRING_PLANS_FILE_NAME),
            collectRecurringPlans(normalizedRoot.optJSONArray("plans")).toString(2)
        );

        String[] sections = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        for (String section : sections) {
            Map<String, ArrayList<JSONObject>> grouped = groupItemsByPeriod(
                section,
                normalizedRoot.optJSONArray(section)
            );
            for (Map.Entry<String, ArrayList<JSONObject>> entry : grouped.entrySet()) {
                File target = new File(
                    rootDirectory,
                    getPartitionRelativePath(section, entry.getKey()).replace("/", File.separator)
                );
                File parent = target.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                writeTextToFile(
                    target,
                    buildPartitionEnvelope(section, entry.getKey(), entry.getValue()).toString(2)
                );
            }
        }

        writeTextToFile(new File(rootDirectory, BUNDLE_MANIFEST_FILE_NAME), manifest.toString(2));
    }

    private static JSONObject readLocalBundleRootFromManifest(File rootDirectory, JSONObject manifest)
        throws Exception {
        JSONObject core = new JSONObject(
            readTextFromFile(new File(rootDirectory, BUNDLE_CORE_FILE_NAME))
        );
        JSONObject root = cloneJsonObject(core);
        String[] sections = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        JSONObject sectionsObject = manifest.optJSONObject("sections");
        for (String section : sections) {
            JSONArray mergedItems = new JSONArray();
            JSONObject sectionObject =
                sectionsObject == null ? null : sectionsObject.optJSONObject(section);
            JSONArray partitions = sectionObject == null ? null : sectionObject.optJSONArray("partitions");
            if (partitions != null) {
                for (int index = 0; index < partitions.length(); index += 1) {
                    JSONObject partition = partitions.optJSONObject(index);
                    if (partition == null) {
                        continue;
                    }
                    String relativePath = partition.optString("file", "");
                    if (TextUtils.isEmpty(relativePath)) {
                        continue;
                    }
                    File partitionFile = new File(
                        rootDirectory,
                        relativePath.replace("/", File.separator)
                    );
                    if (!partitionFile.exists()) {
                        continue;
                    }
                    JSONObject envelope = new JSONObject(readTextFromFile(partitionFile));
                    JSONArray items = envelope.optJSONArray("items");
                    if (items == null) {
                        continue;
                    }
                    for (int itemIndex = 0; itemIndex < items.length(); itemIndex += 1) {
                        JSONObject item = items.optJSONObject(itemIndex);
                        if (item != null) {
                            mergedItems.put(cloneJsonObject(item));
                        }
                    }
                }
            }
            if ("plans".equals(section)) {
                File recurringFile = new File(rootDirectory, BUNDLE_RECURRING_PLANS_FILE_NAME);
                if (recurringFile.exists()) {
                    JSONArray recurringItems = new JSONArray(readTextFromFile(recurringFile));
                    for (int index = 0; index < recurringItems.length(); index += 1) {
                        JSONObject item = recurringItems.optJSONObject(index);
                        if (item != null) {
                            mergedItems.put(cloneJsonObject(item));
                        }
                    }
                }
            }
            root.put(section, mergedItems);
        }
        root.put(
            "diaryMediaAssets",
            normalizeDiaryMediaAssets(
                manifest.optJSONObject("assets") == null
                    ? null
                    : manifest.optJSONObject("assets").optJSONArray("diaryMedia")
            )
        );
        return root;
    }

    public static void copyDiaryMediaAssetsFromDirectory(
        Context context,
        File sourceDirectory,
        JSONArray assetEntries
    ) throws Exception {
        if (sourceDirectory == null || !sourceDirectory.exists()) {
            return;
        }
        JSONArray normalizedAssets = normalizeDiaryMediaAssets(assetEntries);
        for (int index = 0; index < normalizedAssets.length(); index += 1) {
            JSONObject entry = normalizedAssets.optJSONObject(index);
            if (entry == null) {
                continue;
            }
            String relativePath = entry.optString("file", "");
            if (TextUtils.isEmpty(relativePath)) {
                continue;
            }
            File sourceFile = new File(
                sourceDirectory,
                relativePath.replace("/", File.separator)
            );
            if (!sourceFile.exists()) {
                continue;
            }
            InputStream inputStream = new FileInputStream(sourceFile);
            try {
                writeBundleBytes(context, relativePath, readAllBytes(inputStream));
            } finally {
                inputStream.close();
            }
        }
    }

    private static String readTextFromUri(Context context, Uri uri) throws Exception {
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

    private static void writeTextToUri(Context context, Uri uri, String content) throws Exception {
        if (context == null || uri == null) {
            throw new Exception("目标文件不可用。");
        }

        OutputStream outputStream = context.getContentResolver().openOutputStream(uri, "wt");
        if (outputStream == null) {
            throw new Exception("无法写入目标文件。");
        }

        try {
            outputStream.write(String.valueOf(content).getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
        } finally {
            outputStream.close();
        }
    }

    private static Uri resolveDirectoryRelativeDocumentUri(
        Context context,
        Uri treeUri,
        String relativePath,
        boolean createIfMissing,
        boolean directory
    ) {
        return resolveDirectoryRelativeDocumentUriInternal(
            context,
            treeUri,
            relativePath,
            createIfMissing,
            directory,
            null
        );
    }

    public static Uri resolveDirectoryRelativeDocumentUri(
        Context context,
        Uri treeUri,
        String relativePath,
        boolean createIfMissing,
        boolean directory,
        String fileMimeType
    ) {
        return resolveDirectoryRelativeDocumentUriInternal(
            context,
            treeUri,
            relativePath,
            createIfMissing,
            directory,
            fileMimeType
        );
    }

    private static Uri resolveDirectoryRelativeDocumentUriInternal(
        Context context,
        Uri treeUri,
        String relativePath,
        boolean createIfMissing,
        boolean directory,
        String fileMimeType
    ) {
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (context == null || treeUri == null || TextUtils.isEmpty(normalizedRelativePath)) {
            return null;
        }
        try {
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri treeDocumentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocumentId);
            Uri cachedDocumentUri = getCachedDirectoryDocumentUri(
                context,
                treeUri,
                normalizedRelativePath
            );
            if (cachedDocumentUri != null) {
                String expectedDocumentName =
                    getBundleRelativeFileName(normalizedRelativePath);
                if (
                    queryDocumentExists(context, cachedDocumentUri)
                        && isDocumentUriNameMatch(
                            context,
                            cachedDocumentUri,
                            expectedDocumentName
                        )
                ) {
                    return cachedDocumentUri;
                }
                removeDirectoryDocumentUriCacheEntry(context, treeUri, normalizedRelativePath);
            }

            String[] segments = normalizedRelativePath.split("/");
            Uri currentUri = treeDocumentUri;
            for (int index = 0; index < segments.length; index += 1) {
                String segment = segments[index];
                if (TextUtils.isEmpty(segment)) {
                    continue;
                }
                boolean isLast = index == segments.length - 1;
                boolean shouldBeDirectory = isLast ? directory : true;
                Uri childUri = findChildDocumentUri(context, treeUri, currentUri, segment);
                if (childUri == null && createIfMissing) {
                    childUri =
                        createChildDocumentUri(
                            context,
                            treeUri,
                            treeDocumentUri,
                            currentUri,
                            segment,
                            shouldBeDirectory,
                            shouldBeDirectory ? null : fileMimeType
                        );
                }
                if (childUri == null) {
                    return null;
                }
                currentUri = childUri;
            }
            putDirectoryDocumentUriCacheEntry(
                context,
                treeUri,
                normalizedRelativePath,
                currentUri
            );
            return currentUri;
        } catch (Exception error) {
            return null;
        }
    }

    private static Uri createChildDocumentUri(
        Context context,
        Uri treeUri,
        Uri treeDocumentUri,
        Uri parentDocumentUri,
        String childName,
        boolean directory,
        String fileMimeType
    ) {
        Uri createdUri = tryCreateChildDocumentUri(
            context,
            parentDocumentUri,
            childName,
            directory,
            fileMimeType
        );
        Uri resolvedUri = resolveCreatedChildDocumentUri(
            context,
            treeUri,
            parentDocumentUri,
            childName,
            createdUri
        );
        if (resolvedUri != null) {
            return resolvedUri;
        }

        if (isSameDocumentUri(parentDocumentUri, treeDocumentUri)) {
            Uri rootCreatedUri = tryCreateChildDocumentUri(
                context,
                treeUri,
                childName,
                directory,
                fileMimeType
            );
            resolvedUri = resolveCreatedChildDocumentUri(
                context,
                treeUri,
                parentDocumentUri,
                childName,
                rootCreatedUri
            );
            if (resolvedUri != null) {
                return resolvedUri;
            }
        }
        if (!directory) {
            Uri fallbackUri =
                buildExternalStorageChildDocumentUri(treeUri, parentDocumentUri, childName);
            if (fallbackUri != null) {
                return fallbackUri;
            }
        }
        return null;
    }

    private static Uri tryCreateChildDocumentUri(
        Context context,
        Uri parentDocumentUri,
        String childName,
        boolean directory,
        String fileMimeType
    ) {
        if (context == null || parentDocumentUri == null || TextUtils.isEmpty(childName)) {
            return null;
        }
        try {
            return DocumentsContract.createDocument(
                context.getContentResolver(),
                parentDocumentUri,
                directory
                    ? Document.MIME_TYPE_DIR
                    : (TextUtils.isEmpty(fileMimeType) ? "application/json" : fileMimeType),
                childName
            );
        } catch (Exception error) {
            Log.w(
                TAG,
                "[storage.directory-create-failed] parent="
                    + parentDocumentUri
                    + " child="
                    + childName
                    + " dir="
                    + directory,
                error
            );
            return null;
        }
    }

    private static Uri resolveCreatedChildDocumentUri(
        Context context,
        Uri treeUri,
        Uri parentDocumentUri,
        String childName,
        Uri createdUri
    ) {
        Uri enumeratedChildUri =
            findChildDocumentUriWithRetry(
                context,
                treeUri,
                parentDocumentUri,
                childName
            );
        if (enumeratedChildUri != null) {
            return enumeratedChildUri;
        }

        String createdName = queryDisplayName(context, createdUri);
        String createdDocumentId = getDocumentIdQuietly(createdUri);
        if (
            createdUri != null
                && queryDocumentExists(context, createdUri)
                && (
                    childName.equals(createdName) ||
                    doesDocumentIdMatchChildName(createdDocumentId, childName)
                )
        ) {
            Uri canonicalCreatedUri = buildDocumentUriUsingTreeQuietly(treeUri, createdDocumentId);
            return canonicalCreatedUri == null ? createdUri : canonicalCreatedUri;
        }
        if (createdUri != null && !TextUtils.isEmpty(createdName) && !childName.equals(createdName)) {
            Log.w(
                TAG,
                "[storage.directory-create-mismatch] expected="
                    + childName
                    + " created="
                    + createdName
                    + " createdDocumentId="
                    + createdDocumentId
                    + " createdUri="
                    + createdUri
                    + " parent="
                    + parentDocumentUri
            );
        }
        return null;
    }

    private static boolean isSameDocumentUri(Uri left, Uri right) {
        if (left == right) {
            return true;
        }
        if (left == null || right == null) {
            return false;
        }
        try {
            return TextUtils.equals(
                DocumentsContract.getDocumentId(left),
                DocumentsContract.getDocumentId(right)
            );
        } catch (Exception ignored) {
            return left.equals(right);
        }
    }

    private static String getDocumentIdQuietly(Uri uri) {
        if (uri == null) {
            return "";
        }
        try {
            return String.valueOf(DocumentsContract.getDocumentId(uri));
        } catch (Exception ignored) {
            return "";
        }
    }

    private static boolean doesDocumentIdMatchChildName(String documentId, String childName) {
        if (TextUtils.isEmpty(documentId) || TextUtils.isEmpty(childName)) {
            return false;
        }
        return documentId.endsWith("/" + childName)
            || documentId.endsWith(":" + childName)
            || childName.equals(documentId);
    }

    private static boolean isDocumentUriNameMatch(
        Context context,
        Uri documentUri,
        String expectedName
    ) {
        if (documentUri == null || TextUtils.isEmpty(expectedName)) {
            return false;
        }
        String displayName = queryDisplayName(context, documentUri);
        if (expectedName.equals(displayName)) {
            return true;
        }
        return doesDocumentIdMatchChildName(
            getDocumentIdQuietly(documentUri),
            expectedName
        );
    }

    private static Uri findChildDocumentUriWithRetry(
        Context context,
        Uri treeUri,
        Uri parentDocumentUri,
        String childName
    ) {
        for (int index = 0; index < DIRECTORY_CREATE_RESOLVE_RETRY_DELAYS_MS.length; index += 1) {
            int delayMs = DIRECTORY_CREATE_RESOLVE_RETRY_DELAYS_MS[index];
            if (delayMs > 0) {
                SystemClock.sleep(delayMs);
            }
            Uri childUri = findChildDocumentUri(context, treeUri, parentDocumentUri, childName);
            if (childUri != null) {
                return childUri;
            }
        }
        return null;
    }

    private static Uri buildDocumentUriUsingTreeQuietly(Uri treeUri, String documentId) {
        if (treeUri == null || TextUtils.isEmpty(documentId)) {
            return null;
        }
        try {
            return DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isExternalStorageDocumentsTreeUri(Uri treeUri) {
        return treeUri != null
            && "com.android.externalstorage.documents".equals(treeUri.getAuthority());
    }

    private static Uri buildExternalStorageTreeRelativeDocumentUri(
        Uri treeUri,
        String relativePath
    ) {
        if (!isExternalStorageDocumentsTreeUri(treeUri)) {
            return null;
        }
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedRelativePath)) {
            return null;
        }
        try {
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            if (TextUtils.isEmpty(treeDocumentId)) {
                return null;
            }
            return DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                treeDocumentId + "/" + normalizedRelativePath
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Uri buildExternalStorageChildDocumentUri(
        Uri treeUri,
        Uri parentDocumentUri,
        String childName
    ) {
        if (!isExternalStorageDocumentsTreeUri(treeUri) || parentDocumentUri == null) {
            return null;
        }
        try {
            String parentDocumentId = DocumentsContract.getDocumentId(parentDocumentUri);
            if (TextUtils.isEmpty(parentDocumentId) || TextUtils.isEmpty(childName)) {
                return null;
            }
            return DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                parentDocumentId + "/" + childName
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String inferBundleRelativeFileMimeType(String relativePath) {
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedRelativePath)) {
            return "application/octet-stream";
        }
        String lowerRelativePath = normalizedRelativePath.toLowerCase(Locale.US);
        if (lowerRelativePath.endsWith(".json")) {
            return "application/json";
        }
        String inferredMimeType = inferDiaryMediaMimeType(normalizedRelativePath, "");
        return TextUtils.isEmpty(inferredMimeType)
            ? "application/octet-stream"
            : inferredMimeType;
    }

    private static void appendUniqueDocumentUriCandidate(List<Uri> candidates, Uri candidate) {
        if (candidates == null || candidate == null) {
            return;
        }
        for (Uri existingCandidate : candidates) {
            if (isSameDocumentUri(existingCandidate, candidate)) {
                return;
            }
        }
        candidates.add(candidate);
    }

    private static OutputStream tryOpenDocumentOutputStream(Context context, Uri documentUri) {
        if (context == null || documentUri == null) {
            return null;
        }
        for (String mode : DIRECTORY_DOCUMENT_OUTPUT_STREAM_MODES) {
            try {
                OutputStream outputStream =
                    context.getContentResolver().openOutputStream(documentUri, mode);
                if (outputStream != null) {
                    return outputStream;
                }
            } catch (Exception ignored) {
            }
        }
        try {
            return context.getContentResolver().openOutputStream(documentUri);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static OutputStream openBundleDocumentOutputStream(
        Context context,
        Uri treeUri,
        String relativePath,
        Uri preferredDocumentUri,
        String fileMimeType
    ) {
        if (context == null || treeUri == null) {
            return null;
        }
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        ArrayList<Uri> candidateUris = new ArrayList<>();
        appendUniqueDocumentUriCandidate(candidateUris, preferredDocumentUri);
        appendUniqueDocumentUriCandidate(
            candidateUris,
            buildExternalStorageTreeRelativeDocumentUri(treeUri, normalizedRelativePath)
        );
        for (Uri candidateUri : candidateUris) {
            OutputStream outputStream = tryOpenDocumentOutputStream(context, candidateUri);
            if (outputStream != null) {
                return outputStream;
            }
        }
        if (TextUtils.isEmpty(normalizedRelativePath)) {
            return null;
        }
        removeDirectoryDocumentUriCacheEntry(context, treeUri, normalizedRelativePath);
        Uri refreshedDocumentUri = resolveDirectoryRelativeDocumentUri(
            context,
            treeUri,
            normalizedRelativePath,
            true,
            false,
            fileMimeType
        );
        ArrayList<Uri> refreshedCandidateUris = new ArrayList<>();
        appendUniqueDocumentUriCandidate(refreshedCandidateUris, refreshedDocumentUri);
        appendUniqueDocumentUriCandidate(
            refreshedCandidateUris,
            buildExternalStorageTreeRelativeDocumentUri(treeUri, normalizedRelativePath)
        );
        for (Uri candidateUri : refreshedCandidateUris) {
            OutputStream outputStream = tryOpenDocumentOutputStream(context, candidateUri);
            if (outputStream != null) {
                return outputStream;
            }
        }
        Log.w(
            TAG,
            "[storage.bundle-open-output-failed] relativePath="
                + normalizedRelativePath
                + " preferred="
                + preferredDocumentUri
                + " refreshed="
                + refreshedDocumentUri
        );
        return null;
    }

    private static Uri findChildDocumentUri(
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

    public static File getStorageFile(Context context) {
        if (context == null) {
            return getLegacyStorageFile();
        }

        File storageDirectory = new File(context.getFilesDir(), "Order/app_data");
        File targetFile = new File(storageDirectory, "controler-data.json");
        migrateLegacyStorageIfNeeded(targetFile);
        return targetFile;
    }

    public static File getDefaultStorageFile(Context context) {
        return getStorageFile(context);
    }

    public static String getStorageMode(Context context) {
        ensureStorageBindingResolved(context, "get-storage-mode");
        if (context == null) {
            return MODE_DEFAULT;
        }
        String mode = getStoredStorageModeRaw(context);
        if (MODE_FILE.equals(mode) || MODE_DIRECTORY.equals(mode)) {
            return mode;
        }
        return MODE_DEFAULT;
    }

    public static StorageLocation getStorageLocation(Context context) {
        StorageLocation location = new StorageLocation();
        File defaultFile = getDefaultStorageFile(context);
        String actualMode = getStorageMode(context);
        boolean bundleMode = usesDirectoryBundleStorage(context);
        location.syncFileName = bundleMode
            ? BUNDLE_MANIFEST_FILE_NAME
            : defaultFile.getName();
        location.storageMode = bundleMode ? BUNDLE_MODE : actualMode;

        if (MODE_FILE.equals(actualMode)) {
            Uri customUri = getCustomStorageUri(context);
            if (customUri != null && context != null) {
                location.isCustomPath = true;
                location.actualUri = customUri.toString();
                location.syncFileName = firstNonEmpty(
                    getStoredCustomStorageName(context),
                    queryDisplayName(context, customUri),
                    location.syncFileName
                );
                location.storagePath = location.syncFileName;
                location.storageDirectory = "已选择的同步文档";
                location.size = queryDocumentSize(context, customUri);
                location.modifiedAt = queryDocumentModifiedAt(context, customUri);
                return location;
            }
        }

        if (MODE_DIRECTORY.equals(actualMode)) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            if (directoryUri != null && context != null) {
                location.isCustomPath = true;
                String directoryName = firstNonEmpty(
                    getStoredCustomStorageDirectoryName(context),
                    queryDisplayName(context, directoryUri),
                    "已选择目录"
                );
                return buildBundleStorageLocation(
                    context,
                    directoryUri,
                    null,
                    directoryName,
                    directoryName + "/" + BUNDLE_MANIFEST_FILE_NAME,
                    directoryUri.toString(),
                    true
                );
            }
        }

        File bundleRoot = getDefaultBundleRootDirectory(context);
        File manifestFile = new File(bundleRoot, BUNDLE_MANIFEST_FILE_NAME);
        return buildBundleStorageLocation(
            context,
            null,
            bundleRoot,
            bundleRoot == null ? "" : bundleRoot.getAbsolutePath(),
            manifestFile.getAbsolutePath(),
            manifestFile.getAbsolutePath(),
            false
        );
    }

    public static void setCustomStorageUri(Context context, Uri uri, String displayName) {
        if (context == null || uri == null) {
            return;
        }

        clearStorageRuntimeCaches(context);

        SharedPreferences preferences = getStoragePreferences(context);
        preferences
            .edit()
            .putString(KEY_STORAGE_MODE, MODE_FILE)
            .putString(KEY_CUSTOM_STORAGE_URI, uri.toString())
            .putString(KEY_CUSTOM_STORAGE_NAME, firstNonEmpty(displayName, "controler-data.json"))
            .remove(KEY_CUSTOM_STORAGE_DIRECTORY_URI)
            .remove(KEY_CUSTOM_STORAGE_DIRECTORY_NAME)
            .apply();
        persistStorageBindingSnapshot(
            context,
            STORAGE_BINDING_KIND_FILE,
            uri,
            firstNonEmpty(displayName, "controler-data.json")
        );
    }

    public static void setCustomStorageDirectoryUri(Context context, Uri uri, String displayName) {
        if (context == null || uri == null) {
            return;
        }

        clearStorageRuntimeCaches(context);

        SharedPreferences preferences = getStoragePreferences(context);
        preferences
            .edit()
            .putString(KEY_STORAGE_MODE, MODE_DIRECTORY)
            .putString(KEY_CUSTOM_STORAGE_DIRECTORY_URI, uri.toString())
            .putString(KEY_CUSTOM_STORAGE_DIRECTORY_NAME, firstNonEmpty(displayName, "已选择目录"))
            .remove(KEY_CUSTOM_STORAGE_URI)
            .remove(KEY_CUSTOM_STORAGE_NAME)
            .apply();
        persistStorageBindingSnapshot(
            context,
            STORAGE_BINDING_KIND_DIRECTORY,
            uri,
            firstNonEmpty(displayName, "已选择目录")
        );
    }

    public static void clearCustomStorageUri(Context context) {
        if (context == null) {
            return;
        }

        Uri currentFileUri = getStoredCustomStorageUriRaw(context);
        Uri currentDirectoryUri = getStoredCustomStorageDirectoryUriRaw(context);
        StoredStorageBinding snapshot = readStoredStorageBinding(context);
        clearStorageRuntimeCaches(context);

        SharedPreferences preferences = getStoragePreferences(context);
        preferences
            .edit()
            .putString(KEY_STORAGE_MODE, MODE_DEFAULT)
            .remove(KEY_CUSTOM_STORAGE_URI)
            .remove(KEY_CUSTOM_STORAGE_NAME)
            .remove(KEY_CUSTOM_STORAGE_DIRECTORY_URI)
            .remove(KEY_CUSTOM_STORAGE_DIRECTORY_NAME)
            .apply();
        releasePersistedUriPermissionQuietly(context, currentFileUri);
        releasePersistedUriPermissionQuietly(context, currentDirectoryUri);
        if (snapshot != null) {
            releasePersistedUriPermissionQuietly(context, snapshot.uri);
        }
        markStorageBindingReset(context);
    }

    public static String getStoredCustomStorageName(Context context) {
        ensureStorageBindingResolved(context, "get-stored-file-name");
        return getStoredCustomStorageNameRaw(context);
    }

    public static Uri getCustomStorageUri(Context context) {
        ensureStorageBindingResolved(context, "get-custom-file-uri");
        return getStoredCustomStorageUriRaw(context);
    }

    public static String getStoredCustomStorageDirectoryName(Context context) {
        ensureStorageBindingResolved(context, "get-stored-directory-name");
        return getStoredCustomStorageDirectoryNameRaw(context);
    }

    public static Uri getCustomStorageDirectoryUri(Context context) {
        ensureStorageBindingResolved(context, "get-custom-directory-uri");
        return getStoredCustomStorageDirectoryUriRaw(context);
    }

    private static SharedPreferences getStoragePreferences(Context context) {
        return context.getSharedPreferences(STORAGE_PREFS, Context.MODE_PRIVATE);
    }

    private static String readStorageText(Context context) throws Exception {
        StringBuilder builder = new StringBuilder();
        InputStream inputStream = openStorageInputStream(context);
        if (inputStream == null) {
            return "";
        }

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        );
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        } finally {
            reader.close();
        }
        return builder.toString();
    }

    private static InputStream openStorageInputStream(Context context) throws Exception {
        String mode = getStorageMode(context);
        if (MODE_FILE.equals(mode)) {
            Uri customUri = getCustomStorageUri(context);
            if (customUri != null && context != null) {
                return context.getContentResolver().openInputStream(customUri);
            }
        } else if (MODE_DIRECTORY.equals(mode)) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            if (directoryUri != null && context != null) {
                Uri documentUri = resolveDirectoryStorageDocumentUri(context, directoryUri, true);
                if (documentUri != null) {
                    return context.getContentResolver().openInputStream(documentUri);
                }
            }
        }

        File file = getStorageFile(context);
        if (!file.exists()) {
            return null;
        }
        return new FileInputStream(file);
    }

    private static OutputStream openStorageOutputStream(Context context) throws Exception {
        String mode = getStorageMode(context);
        if (MODE_FILE.equals(mode)) {
            Uri customUri = getCustomStorageUri(context);
            if (customUri != null && context != null) {
                return context.getContentResolver().openOutputStream(customUri, "wt");
            }
        } else if (MODE_DIRECTORY.equals(mode)) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            if (directoryUri != null && context != null) {
                Uri documentUri = resolveDirectoryStorageDocumentUri(context, directoryUri, true);
                if (documentUri != null) {
                    return context.getContentResolver().openOutputStream(documentUri, "wt");
                }
            }
        }

        File file = getStorageFile(context);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        return new FileOutputStream(file, false);
    }

    private static Uri resolveMetadataQueryUri(Uri uri) {
        if (uri == null) {
            return null;
        }
        try {
            if (isRawTreeDocumentUri(uri)) {
                String treeDocumentId = DocumentsContract.getTreeDocumentId(uri);
                if (!TextUtils.isEmpty(treeDocumentId)) {
                    return DocumentsContract.buildDocumentUriUsingTree(uri, treeDocumentId);
                }
            }
        } catch (Exception ignored) {
        }
        return uri;
    }

    private static boolean isRawTreeDocumentUri(Uri uri) {
        if (uri == null) {
            return false;
        }
        try {
            if (!DocumentsContract.isTreeUri(uri)) {
                return false;
            }
        } catch (Exception ignored) {
            return false;
        }
        List<String> pathSegments = uri.getPathSegments();
        return pathSegments != null
            && pathSegments.size() == 2
            && "tree".equals(pathSegments.get(0));
    }

    private static void deleteDocumentQuietly(Context context, Uri documentUri) {
        if (context == null || documentUri == null) {
            return;
        }
        try {
            DocumentsContract.deleteDocument(context.getContentResolver(), documentUri);
        } catch (Exception ignored) {
        }
    }

    private static long queryDocumentSize(Context context, Uri uri) {
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
                    return cursor.getLong(columnIndex);
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

    private static long queryDocumentModifiedAt(Context context, Uri uri) {
        Uri targetUri = resolveMetadataQueryUri(uri);
        if (context == null || targetUri == null) {
            return 0L;
        }

        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                targetUri,
                new String[] { Document.COLUMN_LAST_MODIFIED },
                null,
                null,
                null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int columnIndex = cursor.getColumnIndex(Document.COLUMN_LAST_MODIFIED);
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

    public static Uri resolveDirectoryStorageDocumentUri(
        Context context,
        Uri treeUri,
        boolean createIfMissing
    ) {
        if (context == null || treeUri == null) {
            return null;
        }

        try {
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri childrenUri =
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, treeDocumentId);
            Cursor cursor = null;
            try {
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
                        if ("controler-data.json".equals(displayName)) {
                            return DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                        }
                    }
                }
            } finally {
                if (cursor != null) {
                    cursor.close();
                }
            }

            if (!createIfMissing) {
                return null;
            }

            Uri parentDocumentUri =
                DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocumentId);
            return DocumentsContract.createDocument(
                context.getContentResolver(),
                parentDocumentUri,
                "application/json",
                "controler-data.json"
            );
        } catch (Exception error) {
            return null;
        }
    }

    private static String queryDisplayName(Context context, Uri uri) {
        Uri targetUri = resolveMetadataQueryUri(uri);
        if (context == null || targetUri == null) {
            return "";
        }

        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
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
        return "";
    }

    private static String computeStorageContentHash(Context context) {
        try {
            if (usesDirectoryBundleStorage(context)) {
                ensureBundleStorageReady(context);
                JSONObject manifest = readBundleManifest(context);
                if (manifest == null) {
                    return "";
                }
                ArrayList<String> bundleFiles =
                    new ArrayList<>(collectBundleFilesFromManifest(manifest));
                Collections.sort(bundleFiles);
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                for (String file : bundleFiles) {
                    if (TextUtils.isEmpty(file)) {
                        continue;
                    }
                    digest.update(file.getBytes(StandardCharsets.UTF_8));
                    String content = readBundleText(context, file);
                    if (!TextUtils.isEmpty(content)) {
                        digest.update(content.getBytes(StandardCharsets.UTF_8));
                    }
                }
                return toHex(digest.digest());
            }

            InputStream inputStream = openStorageInputStream(context);
            if (inputStream == null) {
                return "";
            }
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[8192];
                int readLength;
                while ((readLength = inputStream.read(buffer)) >= 0) {
                    if (readLength == 0) {
                        continue;
                    }
                    digest.update(buffer, 0, readLength);
                }
                return toHex(digest.digest());
            } finally {
                inputStream.close();
            }
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String normalizeBundleSection(String section) {
        String normalized = String.valueOf(section == null ? "" : section).trim();
        if ("records".equals(normalized)
            || "diaryEntries".equals(normalized)
            || "dailyCheckins".equals(normalized)
            || "checkins".equals(normalized)
            || "plans".equals(normalized)) {
            return normalized;
        }
        return "";
    }

    private static JSONArray collectRecurringPlans(JSONArray plans) {
        JSONArray recurringPlans = new JSONArray();
        if (plans == null) {
            return recurringPlans;
        }

        for (int index = 0; index < plans.length(); index += 1) {
            JSONObject item = plans.optJSONObject(index);
            if (item == null || !isRecurringPlan(item)) {
                continue;
            }
            recurringPlans.put(cloneJsonObject(item));
        }
        return recurringPlans;
    }

    private static int countRecurringPlans(JSONArray plans) {
        int count = 0;
        if (plans == null) {
            return count;
        }
        for (int index = 0; index < plans.length(); index += 1) {
            if (isRecurringPlan(plans.optJSONObject(index))) {
                count += 1;
            }
        }
        return count;
    }

    private static boolean isRecurringPlan(JSONObject item) {
        if (item == null) {
            return false;
        }
        String repeat = item.optString("repeat", "").trim().toLowerCase(Locale.US);
        return !TextUtils.isEmpty(repeat) && !"none".equals(repeat);
    }

    private static String normalizeBootstrapPage(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.US);
        if (
            "index".equals(normalized)
                || "todo".equals(normalized)
                || "diary".equals(normalized)
                || "stats".equals(normalized)
                || "plan".equals(normalized)
        ) {
            return normalized;
        }
        return "index";
    }

    private static JSONObject resolveBootstrapSectionScope(
        JSONObject options,
        String section,
        JSONObject fallbackScope
    ) {
        JSONObject scope = null;
        boolean explicitScopeProvided = false;
        ArrayList<String> scopeKeys = getBootstrapSectionScopeKeys(section);
        if (options != null) {
            for (String scopeKey : scopeKeys) {
                if (options.has(scopeKey)) {
                    scope = options.optJSONObject(scopeKey);
                    explicitScopeProvided = true;
                    break;
                }
            }
            if (!explicitScopeProvided) {
                JSONObject scopes = options.optJSONObject("scopes");
                if (scopes != null && scopes.has(section)) {
                    scope = scopes.optJSONObject(section);
                    explicitScopeProvided = true;
                }
            }
            if (!explicitScopeProvided) {
                JSONObject pageData = options.optJSONObject("pageData");
                if (pageData != null) {
                    for (String scopeKey : scopeKeys) {
                        if (pageData.has(scopeKey)) {
                            scope = pageData.optJSONObject(scopeKey);
                            explicitScopeProvided = true;
                            break;
                        }
                    }
                }
            }
        }

        JSONObject resolved = cloneJsonObject(scope);
        if (!explicitScopeProvided && fallbackScope != null) {
            resolved = cloneJsonObject(fallbackScope);
        }
        return resolved;
    }

    private static ArrayList<String> getBootstrapSectionScopeKeys(String section) {
        String normalizedSection = normalizeBundleSection(section);
        LinkedHashSet<String> scopeKeys = new LinkedHashSet<>();
        if (TextUtils.isEmpty(normalizedSection)) {
            return new ArrayList<>(scopeKeys);
        }
        scopeKeys.add(normalizedSection + "Scope");
        if ("records".equals(normalizedSection)) {
            scopeKeys.add("recordScope");
        } else if ("plans".equals(normalizedSection)) {
            scopeKeys.add("planScope");
        } else if ("diaryEntries".equals(normalizedSection)) {
            scopeKeys.add("diaryScope");
        } else if ("dailyCheckins".equals(normalizedSection)) {
            scopeKeys.add("dailyCheckinScope");
        } else if ("checkins".equals(normalizedSection)) {
            scopeKeys.add("checkinScope");
        }
        return new ArrayList<>(scopeKeys);
    }

    private static JSONObject buildDefaultRecordBootstrapScope() {
        Calendar end = Calendar.getInstance();
        end.set(Calendar.HOUR_OF_DAY, 0);
        end.set(Calendar.MINUTE, 0);
        end.set(Calendar.SECOND, 0);
        end.set(Calendar.MILLISECOND, 0);
        Calendar start = (Calendar) end.clone();
        start.add(Calendar.DAY_OF_MONTH, -1);
        JSONObject scope = new JSONObject();
        try {
            scope.put("startDate", formatDateText(start));
            scope.put("endDate", formatDateText(end));
        } catch (Exception ignored) {
        }
        return scope;
    }

    private static JSONObject buildRelativeDateRangeScope(int startOffsetDays, int endOffsetDays) {
        Calendar start = Calendar.getInstance();
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        start.add(Calendar.DAY_OF_MONTH, startOffsetDays);
        Calendar end = Calendar.getInstance();
        end.set(Calendar.HOUR_OF_DAY, 0);
        end.set(Calendar.MINUTE, 0);
        end.set(Calendar.SECOND, 0);
        end.set(Calendar.MILLISECOND, 0);
        end.add(Calendar.DAY_OF_MONTH, endOffsetDays);

        Calendar lower = start.getTimeInMillis() <= end.getTimeInMillis()
            ? start
            : end;
        Calendar upper = start.getTimeInMillis() <= end.getTimeInMillis()
            ? end
            : start;
        JSONObject scope = new JSONObject();
        try {
            scope.put("startDate", formatDateText(lower));
            scope.put("endDate", formatDateText(upper));
        } catch (Exception ignored) {
        }
        return scope;
    }

    private static JSONObject buildCurrentMonthScope() {
        Calendar start = Calendar.getInstance();
        start.set(Calendar.DAY_OF_MONTH, 1);
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        Calendar end = (Calendar) start.clone();
        end.set(Calendar.DAY_OF_MONTH, end.getActualMaximum(Calendar.DAY_OF_MONTH));
        JSONObject scope = new JSONObject();
        try {
            scope.put("startDate", formatDateText(start));
            scope.put("endDate", formatDateText(end));
        } catch (Exception ignored) {
        }
        return scope;
    }

    private static JSONObject buildCurrentDayScope() {
        Calendar day = Calendar.getInstance();
        day.set(Calendar.HOUR_OF_DAY, 0);
        day.set(Calendar.MINUTE, 0);
        day.set(Calendar.SECOND, 0);
        day.set(Calendar.MILLISECOND, 0);
        JSONObject scope = new JSONObject();
        try {
            String dateText = formatDateText(day);
            scope.put("startDate", dateText);
            scope.put("endDate", dateText);
        } catch (Exception ignored) {
        }
        return scope;
    }

    private static ArrayList<String> inferBootstrapChangedSectionsFromCorePatch(
        JSONObject partialCore
    ) {
        LinkedHashSet<String> sections = new LinkedHashSet<>();
        if (partialCore == null) {
            sections.add("core");
            return new ArrayList<>(sections);
        }

        if (partialCore.has("projects")) {
            sections.add("projects");
        }
        if (partialCore.has("todos")) {
            sections.add("todos");
        }
        if (partialCore.has("checkinItems")) {
            sections.add("checkinItems");
        }
        if (partialCore.has("checkinHistorySummary")) {
            sections.add("checkinHistorySummary");
        }
        if (partialCore.has("timerSessionState")) {
            sections.add("timerSessionState");
        }
        if (partialCore.has("yearlyGoals")) {
            sections.add("yearlyGoals");
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
        if (
            partialCore.has("createdAt")
                || partialCore.has("lastModified")
                || partialCore.has("storagePath")
                || partialCore.has("storageDirectory")
                || partialCore.has("userDataPath")
                || partialCore.has("documentsPath")
                || partialCore.has("syncMeta")
        ) {
            sections.add("core");
        }

        if (sections.isEmpty()) {
            sections.add("core");
        }
        return new ArrayList<>(sections);
    }

    private static Set<String> resolveRequestedPeriodIds(String section, JSONObject scope) {
        Set<String> periodIds = new HashSet<>();
        if (scope == null) {
            return periodIds;
        }

        JSONArray explicitPeriodIds = scope.optJSONArray("periodIds");
        if (explicitPeriodIds != null && explicitPeriodIds.length() > 0) {
            ArrayList<String> normalizedPeriodIds = new ArrayList<>();
            for (int index = 0; index < explicitPeriodIds.length(); index += 1) {
                String periodId = normalizePeriodId(explicitPeriodIds.optString(index, ""));
                if (!TextUtils.isEmpty(periodId)) {
                    normalizedPeriodIds.add(periodId);
                }
            }
            periodIds.addAll(normalizedPeriodIds);
            return periodIds;
        }

        String startDate = normalizeDateText(
            firstNonEmpty(scope.optString("startDate", ""), scope.optString("start", ""))
        );
        String endDate = normalizeDateText(
            firstNonEmpty(scope.optString("endDate", ""), scope.optString("end", ""))
        );
        if (TextUtils.isEmpty(startDate) || TextUtils.isEmpty(endDate)) {
            return periodIds;
        }

        periodIds.addAll(buildPeriodIdsForRange(startDate, endDate));
        return periodIds;
    }

    private static ArrayList<String> buildPeriodIdsForRange(String startDate, String endDate) {
        ArrayList<String> periodIds = new ArrayList<>();
        Calendar startCalendar = parseFlexibleDate(startDate);
        Calendar endCalendar = parseFlexibleDate(endDate);
        if (startCalendar == null || endCalendar == null) {
            return periodIds;
        }

        Calendar lower = startCalendar.getTimeInMillis() <= endCalendar.getTimeInMillis()
            ? (Calendar) startCalendar.clone()
            : (Calendar) endCalendar.clone();
        Calendar upper = startCalendar.getTimeInMillis() <= endCalendar.getTimeInMillis()
            ? (Calendar) endCalendar.clone()
            : (Calendar) startCalendar.clone();
        lower.set(Calendar.DAY_OF_MONTH, 1);
        upper.set(Calendar.DAY_OF_MONTH, 1);

        while (lower.getTimeInMillis() <= upper.getTimeInMillis()) {
            periodIds.add(
                String.format(
                    Locale.US,
                    "%04d-%02d",
                    lower.get(Calendar.YEAR),
                    lower.get(Calendar.MONTH) + 1
                )
            );
            lower.add(Calendar.MONTH, 1);
        }
        return periodIds;
    }

    private static Calendar parseFlexibleDate(String value) {
        String normalizedDate = normalizeDateText(value);
        if (!TextUtils.isEmpty(normalizedDate)) {
            return calendarFromDateText(normalizedDate);
        }

        if (TextUtils.isEmpty(value)) {
            return null;
        }

        Date parsedDate = parseDateTimeValue(value);
        if (parsedDate != null) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(parsedDate);
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            return calendar;
        }
        return null;
    }

    private static String normalizePeriodId(String value) {
        if (TextUtils.isEmpty(value)) {
            return "";
        }
        String normalized = value.trim();
        if (UNDATED_PERIOD_ID.equals(normalized)) {
            return normalized;
        }
        return normalized.matches("^\\d{4}-\\d{2}$") ? normalized : "";
    }

    private static String normalizeDateText(String value) {
        if (TextUtils.isEmpty(value)) {
            return "";
        }
        String normalized = extractDateText(value.trim());
        return normalized.matches("^\\d{4}-\\d{2}-\\d{2}$") ? normalized : "";
    }

    private static String getSectionItemDateKey(String section, JSONObject item) {
        if (item == null) {
            return "";
        }
        String normalizedSection = normalizeBundleSection(section);
        if ("records".equals(normalizedSection)) {
            return normalizeDateText(
                firstNonEmpty(
                    item.optString("endTime", ""),
                    item.optString("timestamp", ""),
                    item.optString("startTime", "")
                )
            );
        }
        if ("diaryEntries".equals(normalizedSection)) {
            return normalizeDateText(
                firstNonEmpty(item.optString("date", ""), item.optString("updatedAt", ""))
            );
        }
        if ("dailyCheckins".equals(normalizedSection)) {
            return normalizeDateText(item.optString("date", ""));
        }
        if ("checkins".equals(normalizedSection)) {
            return normalizeDateText(
                firstNonEmpty(item.optString("updatedAt", ""), item.optString("time", ""))
            );
        }
        if ("plans".equals(normalizedSection)) {
            return normalizeDateText(item.optString("date", ""));
        }
        return "";
    }

    private static ArrayList<String> getRecordPeriodIdsForSectionItem(JSONObject item) {
        long startTimeMs = parseRecordTimestampMs(
            firstNonEmpty(
                item == null ? "" : item.optString("startTime", ""),
                item == null ? "" : item.optString("timestamp", ""),
                item == null ? "" : item.optString("endTime", "")
            )
        );
        long endTimeMs = parseRecordTimestampMs(
            firstNonEmpty(
                item == null ? "" : item.optString("endTime", ""),
                item == null ? "" : item.optString("timestamp", ""),
                item == null ? "" : item.optString("startTime", "")
            )
        );
        if (startTimeMs < 0L && endTimeMs < 0L) {
            String anchorDate = getSectionItemDateKey("records", item);
            if (!TextUtils.isEmpty(anchorDate) && anchorDate.length() >= 7) {
                return new ArrayList<>(Collections.singletonList(anchorDate.substring(0, 7)));
            }
            return new ArrayList<>(Collections.singletonList(UNDATED_PERIOD_ID));
        }
        if (startTimeMs < 0L) {
            startTimeMs = endTimeMs;
        }
        if (endTimeMs < 0L) {
            endTimeMs = startTimeMs;
        }
        if (endTimeMs < startTimeMs) {
            long swapped = startTimeMs;
            startTimeMs = endTimeMs;
            endTimeMs = swapped;
        }
        Calendar cursor = Calendar.getInstance();
        cursor.setTimeInMillis(startTimeMs);
        cursor.set(Calendar.DAY_OF_MONTH, 1);
        cursor.set(Calendar.HOUR_OF_DAY, 0);
        cursor.set(Calendar.MINUTE, 0);
        cursor.set(Calendar.SECOND, 0);
        cursor.set(Calendar.MILLISECOND, 0);
        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(endTimeMs);
        target.set(Calendar.DAY_OF_MONTH, 1);
        target.set(Calendar.HOUR_OF_DAY, 0);
        target.set(Calendar.MINUTE, 0);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        LinkedHashSet<String> periodIds = new LinkedHashSet<>();
        while (cursor.getTimeInMillis() <= target.getTimeInMillis()) {
            periodIds.add(
                String.format(
                    Locale.US,
                    "%04d-%02d",
                    cursor.get(Calendar.YEAR),
                    cursor.get(Calendar.MONTH) + 1
                )
            );
            cursor.add(Calendar.MONTH, 1);
        }
        if (periodIds.isEmpty()) {
            periodIds.add(UNDATED_PERIOD_ID);
        }
        return new ArrayList<>(periodIds);
    }

    private static ArrayList<String> getPeriodIdsForSectionItem(String section, JSONObject item) {
        String normalizedSection = normalizeBundleSection(section);
        if ("plans".equals(normalizedSection) && isRecurringPlan(item)) {
            return new ArrayList<>();
        }
        if ("records".equals(normalizedSection)) {
            return getRecordPeriodIdsForSectionItem(item);
        }
        String dateKey = getSectionItemDateKey(normalizedSection, item);
        if (TextUtils.isEmpty(dateKey) || dateKey.length() < 7) {
            return new ArrayList<>(Collections.singletonList(UNDATED_PERIOD_ID));
        }
        return new ArrayList<>(Collections.singletonList(dateKey.substring(0, 7)));
    }

    private static String getPeriodIdForSectionItem(String section, JSONObject item) {
        ArrayList<String> periodIds = getPeriodIdsForSectionItem(section, item);
        return periodIds.isEmpty() ? UNDATED_PERIOD_ID : periodIds.get(0);
    }

    private static String getPartitionRelativePath(String section, String periodId) {
        String normalizedSection = normalizeBundleSection(section);
        String normalizedPeriodId = normalizePeriodId(periodId);
        if (TextUtils.isEmpty(normalizedSection) || TextUtils.isEmpty(normalizedPeriodId)) {
            return "";
        }
        if (UNDATED_PERIOD_ID.equals(normalizedPeriodId)) {
            return normalizedSection + "/undated.json";
        }
        return normalizedSection
            + "/"
            + normalizedPeriodId.substring(0, 4)
            + "/"
            + normalizedPeriodId
            + ".json";
    }

    private static String buildPartitionFingerprint(
        String section,
        String periodId,
        ArrayList<JSONObject> items
    ) {
        return buildPartitionFingerprint(section, periodId, items, true);
    }

    private static String buildLegacyPartitionFingerprint(
        String section,
        String periodId,
        ArrayList<JSONObject> items
    ) {
        return buildPartitionFingerprint(section, periodId, items, false);
    }

    private static String buildPartitionFingerprint(
        String section,
        String periodId,
        ArrayList<JSONObject> items,
        boolean includeArraySyntax
    ) {
        String minDate = "";
        String maxDate = "";
        if (items != null && !items.isEmpty()) {
            minDate = getSectionItemDateKey(section, items.get(0));
            maxDate = getSectionItemDateKey(section, items.get(items.size() - 1));
        }
        int serializedLength = 0;
        if (items != null) {
            for (JSONObject item : items) {
                serializedLength += item == null ? 0 : item.toString().length();
            }
            if (includeArraySyntax) {
                serializedLength += items.isEmpty() ? 2 : items.size() + 1;
            }
        }
        return section
            + ":"
            + periodId
            + ":"
            + (items == null ? 0 : items.size())
            + ":"
            + minDate
            + ":"
            + maxDate
            + ":"
            + serializedLength;
    }

    private static Map<String, ArrayList<JSONObject>> groupItemsByPeriod(
        String section,
        JSONArray sourceItems
    ) {
        Map<String, ArrayList<JSONObject>> grouped = new HashMap<>();
        if (sourceItems == null) {
            return grouped;
        }

        for (int index = 0; index < sourceItems.length(); index += 1) {
            JSONObject item = sourceItems.optJSONObject(index);
            if (item == null) {
                continue;
            }
            if ("plans".equals(section) && isRecurringPlan(item)) {
                continue;
            }
            for (String periodId : getPeriodIdsForSectionItem(section, item)) {
                ArrayList<JSONObject> items = grouped.get(periodId);
                if (items == null) {
                    items = new ArrayList<>();
                    grouped.put(periodId, items);
                }
                items.add(cloneJsonObject(item));
            }
        }
        return grouped;
    }

    private static boolean validateItemsForPeriod(
        String section,
        String periodId,
        JSONArray items
    ) {
        if (items == null) {
            return true;
        }
        String normalizedPeriodId = normalizePeriodId(periodId);
        if (TextUtils.isEmpty(normalizedPeriodId)) {
            return false;
        }
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) {
                continue;
            }
            ArrayList<String> itemPeriodIds = getPeriodIdsForSectionItem(section, item);
            if (!itemPeriodIds.contains(normalizedPeriodId)) {
                Log.i(
                    TAG,
                    "[storage.range-validate] stage=invalid"
                        + " section="
                        + section
                        + " periodId="
                        + normalizedPeriodId
                        + " index="
                        + index
                        + " itemId="
                        + item.optString("id", "")
                        + " itemName="
                        + item.optString("name", "")
                        + " projectId="
                        + item.optString("projectId", "")
                        + " startTime="
                        + item.optString("startTime", "")
                        + " endTime="
                        + item.optString("endTime", "")
                        + " timestamp="
                        + item.optString("timestamp", "")
                        + " itemPeriodIds="
                        + TextUtils.join(",", itemPeriodIds)
                );
                return false;
            }
        }
        return true;
    }

    private static ArrayList<JSONObject> mergePartitionItems(
        String section,
        ArrayList<JSONObject> existingItems,
        ArrayList<JSONObject> incomingItems,
        boolean merge
    ) {
        ArrayList<JSONObject> safeIncoming =
            incomingItems == null ? new ArrayList<JSONObject>() : incomingItems;
        if (!merge) {
            sortJsonItems(section, safeIncoming);
            return safeIncoming;
        }

        Map<String, JSONObject> merged = new HashMap<>();
        if (existingItems != null) {
            for (JSONObject item : existingItems) {
                merged.put(buildPartitionMergeKey(section, item), cloneJsonObject(item));
            }
        }
        for (JSONObject item : safeIncoming) {
            merged.put(buildPartitionMergeKey(section, item), cloneJsonObject(item));
        }
        ArrayList<JSONObject> mergedItems = new ArrayList<>(merged.values());
        sortJsonItems(section, mergedItems);
        return mergedItems;
    }

    private static ArrayList<JSONObject> applyRecordPartitionPatch(
        ArrayList<JSONObject> existingItems,
        ArrayList<JSONObject> incomingItems,
        JSONArray removedItems,
        JSONArray removeIds
    ) {
        Map<String, JSONObject> merged = new HashMap<>();
        if (existingItems != null) {
            for (JSONObject item : existingItems) {
                merged.put(buildPartitionMergeKey("records", item), cloneJsonObject(item));
            }
        }

        Set<String> removedKeys = new HashSet<>();
        if (removeIds != null) {
            for (int index = 0; index < removeIds.length(); index += 1) {
                String recordId = removeIds.optString(index, "").trim();
                if (!TextUtils.isEmpty(recordId)) {
                    removedKeys.add("id:" + recordId);
                }
            }
        }
        if (removedItems != null) {
            for (int index = 0; index < removedItems.length(); index += 1) {
                JSONObject item = removedItems.optJSONObject(index);
                if (item == null) {
                    continue;
                }
                String recordId = item.optString("id", "").trim();
                if (!TextUtils.isEmpty(recordId)) {
                    removedKeys.add("id:" + recordId);
                }
                String mergeKey = buildPartitionMergeKey("records", item);
                if (!TextUtils.isEmpty(mergeKey)) {
                    removedKeys.add(mergeKey);
                }
            }
        }
        for (String removedKey : removedKeys) {
            merged.remove(removedKey);
        }

        if (incomingItems != null) {
            for (JSONObject item : incomingItems) {
                merged.put(buildPartitionMergeKey("records", item), cloneJsonObject(item));
            }
        }

        ArrayList<JSONObject> mergedItems = new ArrayList<>(merged.values());
        sortJsonItems("records", mergedItems);
        return mergedItems;
    }

    private static String buildPartitionMergeKey(String section, JSONObject item) {
        if (item == null) {
            return "";
        }
        String id = item.optString("id", "");
        if (!TextUtils.isEmpty(id)) {
            return "id:" + id;
        }
        if ("records".equals(section)) {
            return item.optString("projectId", "")
                + "|"
                + item.optString("name", "")
                + "|"
                + item.optString("startTime", "")
                + "|"
                + item.optString("endTime", "")
                + "|"
                + item.optString("timestamp", "")
                + "|"
                + item.optString("spendtime", "");
        }
        if ("diaryEntries".equals(section)) {
            return item.optString("date", "")
                + "|"
                + item.optString("title", "")
                + "|"
                + item.optString("updatedAt", "");
        }
        if ("dailyCheckins".equals(section)) {
            return item.optString("itemId", "") + "|" + item.optString("date", "");
        }
        if ("checkins".equals(section)) {
            return item.optString("todoId", "")
                + "|"
                + item.optString("time", "")
                + "|"
                + item.optString("message", "");
        }
        if ("plans".equals(section)) {
            return item.optString("name", "")
                + "|"
                + item.optString("date", "")
                + "|"
                + item.optString("startTime", "")
                + "|"
                + item.optString("endTime", "")
                + "|"
                + item.optString("repeat", "");
        }
        return item.toString();
    }

    private static void sortJsonItems(String section, ArrayList<JSONObject> items) {
        if (items == null) {
            return;
        }
        Collections.sort(
            items,
            (left, right) -> buildSectionSortKey(section, left).compareTo(buildSectionSortKey(section, right))
        );
    }

    private static String buildSectionSortKey(String section, JSONObject item) {
        String normalizedSection = normalizeBundleSection(section);
        if ("records".equals(normalizedSection)) {
            return buildSortableDateKey(
                firstNonEmpty(
                    item == null ? "" : item.optString("endTime", ""),
                    item == null ? "" : item.optString("timestamp", ""),
                    item == null ? "" : item.optString("startTime", "")
                )
            );
        }
        if ("plans".equals(normalizedSection)) {
            return buildSortableDateKey(item == null ? "" : item.optString("date", ""))
                + "|"
                + sanitizeJsonString(item == null ? "" : item.optString("startTime", ""));
        }
        if ("diaryEntries".equals(normalizedSection)) {
            return buildSortableDateKey(
                firstNonEmpty(
                    item == null ? "" : item.optString("date", ""),
                    item == null ? "" : item.optString("updatedAt", "")
                )
            );
        }
        if ("dailyCheckins".equals(normalizedSection)) {
            return buildSortableDateKey(item == null ? "" : item.optString("date", ""));
        }
        if ("checkins".equals(normalizedSection)) {
            return buildSortableDateKey(
                firstNonEmpty(
                    item == null ? "" : item.optString("updatedAt", ""),
                    item == null ? "" : item.optString("time", "")
                )
            );
        }
        return item == null ? "" : item.toString();
    }

    private static String buildSortableDateKey(String value) {
        if (TextUtils.isEmpty(value)) {
            return "9999-99-99T99:99:99";
        }
        String normalized = value.trim();
        if (normalized.length() >= 19) {
            return normalized.substring(0, 19);
        }
        String dateText = normalizeDateText(normalized);
        if (!TextUtils.isEmpty(dateText)) {
            return dateText + "T99:99:99";
        }
        if (normalized.length() >= 7 && normalized.matches("^\\d{4}-\\d{2}.*$")) {
            return normalized.substring(0, 7) + "-99T99:99:99";
        }
        return normalized;
    }

    private static ArrayList<JSONObject> jsonArrayToObjectList(JSONArray array) {
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

    private static JSONArray buildJsonArrayFromObjects(List<JSONObject> items) {
        JSONArray array = new JSONArray();
        if (items == null) {
            return array;
        }
        for (JSONObject item : items) {
            array.put(cloneJsonObject(item));
        }
        return array;
    }

    private static JSONArray buildJsonArrayFromStrings(List<String> items) {
        JSONArray array = new JSONArray();
        if (items == null) {
            return array;
        }
        for (String item : items) {
            array.put(item);
        }
        return array;
    }

    private static void appendStringArrayToSet(
        Set<String> target,
        JSONArray items
    ) {
        if (target == null || items == null) {
            return;
        }
        for (int index = 0; index < items.length(); index += 1) {
            String value = safeText(items.optString(index, ""));
            if (!TextUtils.isEmpty(value)) {
                target.add(value);
            }
        }
    }

    private static ArrayList<String> normalizeCheckinHistorySummaryDates(JSONArray items) {
        TreeSet<String> normalizedDates = new TreeSet<>();
        if (items != null) {
            for (int index = 0; index < items.length(); index += 1) {
                String dateText = normalizeDateText(items.optString(index, ""));
                if (!TextUtils.isEmpty(dateText)) {
                    normalizedDates.add(dateText);
                }
            }
        }
        return new ArrayList<>(normalizedDates);
    }

    private static JSONObject buildCheckinHistorySummaryEntry(
        List<String> checkedDates,
        String updatedAt
    ) throws Exception {
        JSONObject entry = new JSONObject();
        ArrayList<String> normalizedDates = new ArrayList<>();
        if (checkedDates != null) {
            TreeSet<String> deduped = new TreeSet<>();
            for (String dateText : checkedDates) {
                String normalizedDate = normalizeDateText(dateText);
                if (!TextUtils.isEmpty(normalizedDate)) {
                    deduped.add(normalizedDate);
                }
            }
            normalizedDates.addAll(deduped);
        }
        entry.put("checkedDaysCount", normalizedDates.size());
        entry.put("checkedDates", buildJsonArrayFromStrings(normalizedDates));
        entry.put(
            "updatedAt",
            TextUtils.isEmpty(updatedAt) ? "" : updatedAt.trim()
        );
        return entry;
    }

    private static boolean isCheckinHistorySummaryComplete(
        JSONObject summary,
        JSONArray checkinItems
    ) {
        if (summary == null) {
            return false;
        }
        for (int index = 0; index < (checkinItems == null ? 0 : checkinItems.length()); index += 1) {
            JSONObject item = checkinItems.optJSONObject(index);
            String itemId = safeText(item == null ? "" : item.optString("id", ""));
            if (TextUtils.isEmpty(itemId)) {
                continue;
            }
            JSONObject entry = summary.optJSONObject(itemId);
            if (entry == null) {
                return false;
            }
            ArrayList<String> normalizedDates =
                normalizeCheckinHistorySummaryDates(entry.optJSONArray("checkedDates"));
            if (entry.optInt("checkedDaysCount", normalizedDates.size()) != normalizedDates.size()) {
                return false;
            }
        }
        return true;
    }

    private static JSONObject buildCheckinHistorySummaryFromDailyCheckins(
        JSONArray dailyCheckins,
        JSONArray checkinItems
    ) throws Exception {
        LinkedHashSet<String> knownItemIds = new LinkedHashSet<>();
        if (checkinItems != null) {
            for (int index = 0; index < checkinItems.length(); index += 1) {
                JSONObject item = checkinItems.optJSONObject(index);
                String itemId = safeText(item == null ? "" : item.optString("id", ""));
                if (!TextUtils.isEmpty(itemId)) {
                    knownItemIds.add(itemId);
                }
            }
        }

        HashMap<String, JSONObject> latestEntryByItemDate = new HashMap<>();
        HashMap<String, String> latestSortKeyByItemDate = new HashMap<>();
        HashMap<String, Integer> latestIndexByItemDate = new HashMap<>();
        if (dailyCheckins != null) {
            for (int index = 0; index < dailyCheckins.length(); index += 1) {
                JSONObject entry = dailyCheckins.optJSONObject(index);
                if (entry == null) {
                    continue;
                }
                String itemId = safeText(entry.optString("itemId", ""));
                String dateText = normalizeDateText(entry.optString("date", ""));
                if (TextUtils.isEmpty(itemId) || TextUtils.isEmpty(dateText)) {
                    continue;
                }
                knownItemIds.add(itemId);
                String key = itemId + "::" + dateText;
                String sortKey =
                    buildSortableDateKey(
                        firstNonEmpty(
                            entry.optString("time", ""),
                            entry.optString("updatedAt", ""),
                            dateText
                        )
                    );
                String currentSortKey = latestSortKeyByItemDate.get(key);
                Integer currentIndex = latestIndexByItemDate.get(key);
                if (
                    currentSortKey == null
                        || sortKey.compareTo(currentSortKey) > 0
                        || (
                            sortKey.equals(currentSortKey)
                                && (currentIndex == null || index >= currentIndex.intValue())
                        )
                ) {
                    latestEntryByItemDate.put(key, cloneJsonObject(entry));
                    latestSortKeyByItemDate.put(key, sortKey);
                    latestIndexByItemDate.put(key, Integer.valueOf(index));
                }
            }
        }

        HashMap<String, TreeSet<String>> checkedDatesByItem = new HashMap<>();
        HashMap<String, String> latestUpdatedAtByItem = new HashMap<>();
        HashMap<String, String> latestUpdatedAtSortKeyByItem = new HashMap<>();
        for (Map.Entry<String, JSONObject> entry : latestEntryByItemDate.entrySet()) {
            JSONObject latestEntry = entry.getValue();
            if (latestEntry == null) {
                continue;
            }
            String itemId = safeText(latestEntry.optString("itemId", ""));
            String dateText = normalizeDateText(latestEntry.optString("date", ""));
            if (TextUtils.isEmpty(itemId) || TextUtils.isEmpty(dateText)) {
                continue;
            }
            if (latestEntry.optBoolean("checked", false)) {
                TreeSet<String> checkedDates = checkedDatesByItem.get(itemId);
                if (checkedDates == null) {
                    checkedDates = new TreeSet<>();
                    checkedDatesByItem.put(itemId, checkedDates);
                }
                checkedDates.add(dateText);
            }
            String updatedAt =
                firstNonEmpty(
                    latestEntry.optString("time", ""),
                    latestEntry.optString("updatedAt", ""),
                    dateText
                );
            String updatedAtSortKey = buildSortableDateKey(updatedAt);
            String currentUpdatedAtSortKey = latestUpdatedAtSortKeyByItem.get(itemId);
            if (
                currentUpdatedAtSortKey == null
                    || updatedAtSortKey.compareTo(currentUpdatedAtSortKey) >= 0
            ) {
                latestUpdatedAtSortKeyByItem.put(itemId, updatedAtSortKey);
                latestUpdatedAtByItem.put(itemId, updatedAt);
            }
        }

        ArrayList<String> orderedItemIds = new ArrayList<>(knownItemIds);
        Collections.sort(orderedItemIds);
        JSONObject summary = new JSONObject();
        for (String itemId : orderedItemIds) {
            TreeSet<String> checkedDates = checkedDatesByItem.get(itemId);
            summary.put(
                itemId,
                buildCheckinHistorySummaryEntry(
                    checkedDates == null ? new ArrayList<>() : new ArrayList<>(checkedDates),
                    latestUpdatedAtByItem.get(itemId)
                )
            );
        }
        return summary;
    }

    private static JSONObject resolveCheckinHistorySummaryForCore(
        JSONObject summary,
        JSONArray dailyCheckins,
        JSONArray checkinItems
    ) throws Exception {
        if (isCheckinHistorySummaryComplete(summary, checkinItems)) {
            return cloneJsonObject(summary);
        }
        return buildCheckinHistorySummaryFromDailyCheckins(dailyCheckins, checkinItems);
    }

    private static void persistCheckinHistorySummaryToStorage(
        Context context,
        JSONObject core
    ) throws Exception {
        if (context == null || core == null) {
            return;
        }
        if (usesDirectoryBundleStorage(context)) {
            JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
            touchBundleMetadata(context, manifest, core);
            return;
        }
        JSONObject root = loadRootStrict(context);
        root.put(
            "checkinHistorySummary",
            cloneJsonObject(core.optJSONObject("checkinHistorySummary"))
        );
        if (!saveRoot(context, root)) {
            throw new Exception("保存移动端数据失败。");
        }
    }

    private static JSONObject ensureCheckinHistorySummaryInCore(
        Context context,
        JSONObject core
    ) throws Exception {
        JSONObject safeCore = cloneJsonObject(core);
        if (
            isCheckinHistorySummaryComplete(
                safeCore.optJSONObject("checkinHistorySummary"),
                safeCore.optJSONArray("checkinItems")
            )
        ) {
            return safeCore;
        }
        JSONObject dailyRange = loadStorageSectionRange(context, "dailyCheckins", new JSONObject());
        safeCore.put(
            "checkinHistorySummary",
            resolveCheckinHistorySummaryForCore(
                safeCore.optJSONObject("checkinHistorySummary"),
                dailyRange == null ? null : dailyRange.optJSONArray("items"),
                safeCore.optJSONArray("checkinItems")
            )
        );
        persistCheckinHistorySummaryToStorage(context, safeCore);
        return safeCore;
    }

    private static JSONObject buildProjectTotalsSummary(JSONArray projectItems) {
        JSONObject summary = new JSONObject();
        int projectCount = 0;
        long totalDurationMs = 0L;
        JSONArray safeProjects = projectItems == null ? new JSONArray() : projectItems;
        for (int index = 0; index < safeProjects.length(); index += 1) {
            JSONObject project = safeProjects.optJSONObject(index);
            if (project == null) {
                continue;
            }
            projectCount += 1;
            long durationMs = project.optLong(
                "cachedTotalDurationMs",
                project.optLong("totalDurationMs", 0L)
            );
            totalDurationMs += Math.max(0L, durationMs);
        }
        try {
            summary.put("projectCount", projectCount);
            summary.put("totalDurationMs", totalDurationMs);
        } catch (Exception ignored) {
            // Ignore summary serialization failures.
        }
        return summary;
    }

    private static JSONObject buildThemeSummary(JSONObject core) {
        JSONObject summary = new JSONObject();
        JSONObject safeCore = core == null ? new JSONObject() : core;
        String selectedTheme = safeText(safeCore.optString("selectedTheme", "default"));
        if (TextUtils.isEmpty(selectedTheme)) {
            selectedTheme = "default";
        }
        JSONArray customThemes = safeCore.optJSONArray("customThemes");
        JSONObject builtInThemeOverrides = safeCore.optJSONObject("builtInThemeOverrides");
        try {
            summary.put("selectedTheme", selectedTheme);
            summary.put("customThemeCount", customThemes == null ? 0 : customThemes.length());
            summary.put(
                "hasBuiltInOverrides",
                builtInThemeOverrides != null && builtInThemeOverrides.length() > 0
            );
        } catch (Exception ignored) {
            // Ignore theme summary serialization failures.
        }
        return summary;
    }

    private static JSONObject cloneJsonObject(JSONObject object) {
        if (object == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(object.toString());
        } catch (Exception error) {
            return new JSONObject();
        }
    }

    private static JSONArray cloneJsonArray(JSONArray array) {
        if (array == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(array.toString());
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static Object cloneJsonValue(Object value) {
        if (value instanceof JSONObject) {
            return cloneJsonObject((JSONObject) value);
        }
        if (value instanceof JSONArray) {
            return cloneJsonArray((JSONArray) value);
        }
        if (value == null || value == JSONObject.NULL) {
            return JSONObject.NULL;
        }
        return value;
    }

    private static void putNullableString(JSONObject target, String key, String value)
        throws Exception {
        if (TextUtils.isEmpty(value)) {
            target.put(key, JSONObject.NULL);
            return;
        }
        target.put(key, value);
    }

    private static String sanitizeJsonString(String value) {
        return TextUtils.isEmpty(value) ? "" : value;
    }

    private static String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String buildStorageFingerprint(long size, long modifiedAt, String locationKey) {
        return Math.max(0L, size)
            + ":"
            + Math.max(0L, modifiedAt)
            + ":"
            + firstNonEmpty(locationKey, "controler-data.json");
    }

    private static String toHex(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            return "";
        }

        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value));
        }
        return builder.toString();
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value;
            }
        }
        return "";
    }

    private static String formatDateText(Calendar calendar) {
        if (calendar == null) {
            return "";
        }
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static File getLegacyStorageFile() {
        File documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        File storageDirectory = new File(documents, "Order/app_data");
        return new File(storageDirectory, "controler-data.json");
    }

    private static void migrateLegacyStorageIfNeeded(File targetFile) {
        if (targetFile.exists()) {
            return;
        }

        File legacyFile = getLegacyStorageFile();
        if (!legacyFile.exists()) {
            return;
        }

        File parent = targetFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        try {
            FileInputStream inputStream = new FileInputStream(legacyFile);
            FileOutputStream outputStream = new FileOutputStream(targetFile, false);
            try {
                byte[] buffer = new byte[8192];
                int readLength;
                while ((readLength = inputStream.read(buffer)) >= 0) {
                    if (readLength == 0) {
                        continue;
                    }
                    outputStream.write(buffer, 0, readLength);
                }
                outputStream.flush();
            } finally {
                inputStream.close();
                outputStream.close();
            }
        } catch (Exception ignored) {
        }
    }

    public static int parseSpendMinutes(String spendText) {
        if (TextUtils.isEmpty(spendText)) {
            return 0;
        }
        int totalMinutes = 0;
        Matcher dayMatcher = DAY_PATTERN.matcher(spendText);
        Matcher hourMatcher = HOUR_PATTERN.matcher(spendText);
        Matcher minuteMatcher = MINUTE_PATTERN.matcher(spendText);
        if (dayMatcher.find()) {
            totalMinutes += safeParse(dayMatcher.group(1)) * 24 * 60;
        }
        if (hourMatcher.find()) {
            totalMinutes += safeParse(hourMatcher.group(1)) * 60;
        }
        if (minuteMatcher.find()) {
            totalMinutes += safeParse(minuteMatcher.group(1));
        }
        if (spendText.contains("小于1分钟") || spendText.contains("小于1min")) {
            totalMinutes += 1;
        }
        return Math.max(0, totalMinutes);
    }

    public static int safeParse(String value) {
        try {
            return Integer.parseInt(value);
        } catch (Exception error) {
            return 0;
        }
    }

    public static String extractDateText(String value) {
        if (TextUtils.isEmpty(value)) {
            return "";
        }
        String trimmedValue = value.trim();
        if (trimmedValue.length() >= 19 && trimmedValue.charAt(10) == ' ') {
            return trimmedValue.substring(0, 10);
        }
        Date parsedDate = parseDateTimeValue(trimmedValue);
        if (parsedDate != null) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(parsedDate);
            return String.format(
                Locale.US,
                "%04d-%02d-%02d",
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH) + 1,
                calendar.get(Calendar.DAY_OF_MONTH)
            );
        }
        return trimmedValue.length() >= 10 ? trimmedValue.substring(0, 10) : trimmedValue;
    }

    public static int extractHour(String timestamp) {
        if (TextUtils.isEmpty(timestamp)) {
            return 0;
        }
        String trimmedTimestamp = timestamp.trim();
        if (trimmedTimestamp.length() >= 19 && trimmedTimestamp.charAt(10) == ' ') {
            try {
                return Math.max(
                    0,
                    Math.min(23, Integer.parseInt(trimmedTimestamp.substring(11, 13)))
                );
            } catch (Exception ignored) {
            }
        }
        Date parsedDate = parseDateTimeValue(timestamp);
        if (parsedDate != null) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(parsedDate);
            return calendar.get(Calendar.HOUR_OF_DAY);
        }
        try {
            if (timestamp.length() >= 13) {
                return Math.max(0, Math.min(23, Integer.parseInt(timestamp.substring(11, 13))));
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    public static Calendar calendarFromDateText(String dateText) {
        if (TextUtils.isEmpty(dateText)) {
            return null;
        }
        try {
            String[] parts = dateText.split("-");
            if (parts.length != 3) {
                return null;
            }
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.YEAR, safeParse(parts[0]));
            calendar.set(Calendar.MONTH, Math.max(0, safeParse(parts[1]) - 1));
            calendar.set(Calendar.DAY_OF_MONTH, safeParse(parts[2]));
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            return calendar;
        } catch (Exception error) {
            return null;
        }
    }

    private static void parseProjects(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            ProjectInfo project = new ProjectInfo();
            project.id = item.optString("id", "");
            project.name = item.optString("name", "未命名项目");
            project.color = item.optString("color", "#79af85");
            state.projects.add(project);
        }
    }

    private static void parseRecords(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            RecordInfo record = new RecordInfo();
            record.timestamp = item.optString("timestamp", "");
            record.startTime = item.optString("startTime", "");
            record.endTime = item.optString("endTime", "");
            String anchorTime = firstNonEmpty(record.endTime, record.timestamp, record.startTime);
            record.dateText = extractDateText(anchorTime);
            record.hour = extractHour(anchorTime);
            record.name = item.optString("name", "未命名项目");
            record.spendtime = item.optString("spendtime", "");
            record.minutes = parseSpendMinutes(record.spendtime);
            record.projectId = item.optString("projectId", "");
            state.records.add(record);
        }
    }

    private static void parseTodos(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            TodoInfo todo = new TodoInfo();
            todo.id = item.optString("id", "");
            todo.title = item.optString("title", "未命名待办");
            todo.dueDate = item.optString("dueDate", "");
            todo.startDate = item.optString("startDate", "");
            todo.endDate = item.optString("endDate", "");
            todo.startTime = item.optString("startTime", "");
            todo.endTime = item.optString("endTime", "");
            todo.repeatType = item.optString("repeatType", "none");
            todo.completed = item.optBoolean("completed", false);
            todo.color = item.optString("color", "#ed8936");
            todo.priority = item.optString("priority", "medium");
            todo.createdAt = item.optString("createdAt", "");
            todo.repeatWeekdays = parseIntArray(item.optJSONArray("repeatWeekdays"));
            state.todos.add(todo);
        }
    }

    private static String normalizeTodoSortPreference(String value) {
        String normalized = value == null ? "" : value.trim();
        if (
            "priority".equals(normalized)
                || "createdAt".equals(normalized)
                || "title".equals(normalized)
        ) {
            return normalized;
        }
        return "dueDate";
    }

    private static void parseCheckinItems(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            CheckinItemInfo checkinItem = new CheckinItemInfo();
            checkinItem.id = item.optString("id", "");
            checkinItem.title = item.optString("title", "未命名打卡");
            checkinItem.startDate = item.optString("startDate", "");
            checkinItem.endDate = item.optString("endDate", "");
            checkinItem.startTime = item.optString("startTime", "");
            checkinItem.endTime = item.optString("endTime", "");
            checkinItem.repeatType = item.optString("repeatType", "daily");
            checkinItem.repeatWeekdays = parseIntArray(item.optJSONArray("repeatWeekdays"));
            checkinItem.repeatMonthDays = parseIntArray(item.optJSONArray("repeatMonthDays"));
            checkinItem.color = item.optString("color", "#4299e1");
            checkinItem.status = item.optString("status", "in_progress");
            checkinItem.deletedAt = item.optString("deletedAt", "");
            state.checkinItems.add(checkinItem);
        }
    }

    private static void parseDailyCheckins(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            DailyCheckinInfo checkin = new DailyCheckinInfo();
            checkin.itemId = item.optString("itemId", "");
            checkin.date = item.optString("date", "");
            checkin.checked = item.optBoolean("checked", false);
            state.dailyCheckins.add(checkin);
        }
    }

    private static void parsePlans(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            PlanInfo plan = new PlanInfo();
            plan.name = item.optString("name", "未命名计划");
            plan.date = item.optString("date", "");
            plan.endDate = item.optString("endDate", "");
            plan.startTime = item.optString("startTime", "");
            plan.endTime = item.optString("endTime", "");
            plan.color = item.optString("color", "#79af85");
            plan.repeat = item.optString("repeat", "none");
            plan.repeatDays = parseIntArray(item.optJSONArray("repeatDays"));
            plan.excludedDates = parseStringArray(item.optJSONArray("excludedDates"));
            state.plans.add(plan);
        }
    }

    private static void parseDiaryEntries(JSONArray array, State state) {
        if (array == null) return;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            if (item == null) continue;
            DiaryEntryInfo entry = new DiaryEntryInfo();
            entry.id = item.optString("id", "");
            entry.date = item.optString("date", "");
            entry.title = item.optString("title", "未命名日记");
            entry.content = item.optString("content", "");
            entry.updatedAt = item.optString("updatedAt", "");
            state.diaryEntries.add(entry);
        }
    }

    private static void parseYearGoals(JSONObject object, State state) {
        if (object == null) return;
        String currentYear = String.valueOf(Calendar.getInstance().get(Calendar.YEAR));
        JSONObject yearBucket = object.optJSONObject(currentYear);
        if (yearBucket == null) return;
        state.annualGoals.addAll(parseGoalArray(yearBucket.optJSONArray("annual")));
        for (int month = 1; month <= 12; month++) {
            JSONArray goals = yearBucket.optJSONArray(String.valueOf(month));
            state.goalCountsByMonth.put(month, goals == null ? 0 : goals.length());
            state.goalsByMonth.put(month, parseGoalArray(goals));
        }
    }

    private static void parseTimerSession(JSONObject object, State state) {
        if (object == null || state == null) return;
        state.timerSession.ptn = object.optInt("ptn", 0);
        state.timerSession.fpt = object.optString("fpt", "");
        state.timerSession.spt = object.optString("spt", "");
        state.timerSession.lastspt = object.optString("lastspt", "");
        state.timerSession.selectedProject = object.optString("selectedProject", "");
        state.timerSession.nextProject = object.optString("nextProject", "");
        state.timerSession.lastEnteredProjectName =
            object.optString("lastEnteredProjectName", "");
    }

    private static List<Integer> parseIntArray(JSONArray array) {
        List<Integer> values = new ArrayList<>();
        if (array == null) return values;
        for (int index = 0; index < array.length(); index++) {
            values.add(array.optInt(index));
        }
        return values;
    }

    private static List<String> parseStringArray(JSONArray array) {
        List<String> values = new ArrayList<>();
        if (array == null) return values;
        for (int index = 0; index < array.length(); index++) {
            values.add(array.optString(index, ""));
        }
        return values;
    }

    private static List<GoalInfo> parseGoalArray(JSONArray array) {
        List<GoalInfo> goals = new ArrayList<>();
        if (array == null) return goals;
        for (int index = 0; index < array.length(); index++) {
            JSONObject item = array.optJSONObject(index);
            GoalInfo goal = new GoalInfo();
            if (item == null) {
                goal.id = "";
                goal.title = "未命名目标";
                goal.description = "";
                goal.priority = "medium";
                goal.isCompleted = false;
                goal.createdAt = "";
            } else {
                goal.id = item.optString("id", "");
                goal.title = item.optString("title", item.optString("text", "未命名目标"));
                goal.description = item.optString("description", "");
                goal.priority = item.optString("priority", "medium");
                goal.isCompleted = item.optBoolean(
                    "isCompleted",
                    item.optBoolean("completed", false)
                );
                goal.createdAt = item.optString("createdAt", "");
            }
            if (TextUtils.isEmpty(goal.priority)) {
                goal.priority = "medium";
            }
            if (TextUtils.isEmpty(goal.title)) {
                goal.title = "未命名目标";
            }
            goals.add(goal);
        }
        return goals;
    }
}
