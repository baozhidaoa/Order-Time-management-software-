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
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ControlerWidgetDataStore {
    private static final String TAG = "ControlerDataStore";
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
    private static final String DIRECTORY_DOCUMENT_URI_CACHE_FILE_NAME =
        "directory-document-uri-cache.json";
    private static final String BUNDLE_SIZE_CACHE_FILE_NAME = "bundle-size-cache.json";
    private static final String STORAGE_BINDING_FILE_NAME = "storage-binding.json";
    private static final String STORAGE_BINDING_KIND_RESET = "reset";
    private static final String STORAGE_BINDING_KIND_FILE = "file";
    private static final String STORAGE_BINDING_KIND_DIRECTORY = "directory";
    private static final long BUNDLE_STORAGE_READY_CACHE_WINDOW_MS = 2500L;
    private static final long STORAGE_BINDING_RESOLUTION_CACHE_WINDOW_MS = 2500L;
    private static final int PROJECT_DURATION_CACHE_VERSION = 1;
    private static final String PROJECT_DURATION_CACHE_VERSION_KEY = "durationCacheVersion";
    private static final String PROJECT_DIRECT_DURATION_KEY = "cachedDirectDurationMs";
    private static final String PROJECT_TOTAL_DURATION_KEY = "cachedTotalDurationMs";
    private static volatile String storageRecoveryState = STORAGE_RECOVERY_STATE_OK;
    private static volatile String storageRecoveryMessage = "";
    private static volatile long bundleStorageReadyVerifiedAt = 0L;
    private static volatile String bundleStorageReadyCacheKey = "";
    private static volatile long storageBindingResolvedAt = 0L;

    private ControlerWidgetDataStore() {}

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
        public String repeatType = "daily";
        public List<Integer> repeatWeekdays = new ArrayList<>();
        public String color = "#4299e1";
    }

    public static final class DailyCheckinInfo {
        public String itemId = "";
        public String date = "";
        public boolean checked = false;
    }

    public static final class PlanInfo {
        public String name = "";
        public String date = "";
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
        try {
            if (usesDirectoryBundleStorage(context)) {
                return loadBundleRoot(context, false);
            }
            String raw = readStorageText(context).trim();
            return normalizeRoot(
                context,
                TextUtils.isEmpty(raw) ? new JSONObject() : new JSONObject(raw),
                false
            );
        } catch (Exception error) {
            error.printStackTrace();
            return normalizeRoot(context, new JSONObject(), false);
        }
    }

    public static synchronized JSONObject loadRootForWidgets(Context context) {
        try {
            if (usesDirectoryBundleStorage(context)) {
                return loadBundleRoot(context, false, false);
            }
            String raw = readStorageText(context).trim();
            return normalizeRoot(
                context,
                TextUtils.isEmpty(raw) ? new JSONObject() : new JSONObject(raw),
                false,
                false
            );
        } catch (Exception error) {
            error.printStackTrace();
            return normalizeRoot(context, new JSONObject(), false, false);
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
                JSONObject recordScope =
                    normalizedKinds.contains(ControlerWidgetKinds.DAY_PIE)
                        ? buildRelativeDateRangeScope(-45, 0)
                        : normalizedKinds.contains(ControlerWidgetKinds.WEEK_GRID)
                            ? buildRelativeDateRangeScope(-6, 0)
                        : buildDefaultRecordBootstrapScope();
                JSONObject recordRange = loadStorageSectionRange(
                    context,
                    "records",
                    recordScope
                );
                root.put("projects", cloneJsonArray(core.optJSONArray("projects")));
                root.put("records", cloneJsonArray(recordRange.optJSONArray("items")));
                root.put(
                    "timerSessionState",
                    cloneJsonObject(core.optJSONObject("timerSessionState"))
                );
            }

            boolean needsTodoState =
                normalizedKinds.contains(ControlerWidgetKinds.TODOS)
                    || normalizedKinds.contains(ControlerWidgetKinds.CHECKINS);
            if (needsTodoState) {
                JSONObject dailyCheckinRange = loadStorageSectionRange(
                    context,
                    "dailyCheckins",
                    buildCurrentDayScope()
                );
                root.put("todos", cloneJsonArray(core.optJSONArray("todos")));
                root.put(
                    "checkinItems",
                    cloneJsonArray(core.optJSONArray("checkinItems"))
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
                root.put(
                    "yearlyGoals",
                    cloneJsonObject(core.optJSONObject("yearlyGoals"))
                );
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
                root.put(
                    "diaryCategories",
                    cloneJsonArray(core.optJSONArray("diaryCategories"))
                );
            }

            return root;
        } catch (Exception error) {
            error.printStackTrace();
            return loadRootForWidgets(context);
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
            "yearlyGoals",
            cloneJsonObject(core.optJSONObject("yearlyGoals"))
        );
        target.put(
            "diaryCategories",
            cloneJsonArray(core.optJSONArray("diaryCategories"))
        );
    }

    public static synchronized JSONObject loadRootStrict(Context context) throws Exception {
        if (usesDirectoryBundleStorage(context)) {
            return loadBundleRoot(context, true);
        }
        String raw = readStorageText(context);
        if (TextUtils.isEmpty(raw) || TextUtils.isEmpty(raw.trim())) {
            throw new Exception("同步 JSON 文件为空。");
        }

        JSONObject parsedRoot = new JSONObject(raw.trim());
        validateRootShape(parsedRoot);
        return normalizeRoot(context, parsedRoot, false);
    }

    public static synchronized boolean saveRoot(Context context, JSONObject root) {
        try {
            if (usesDirectoryBundleStorage(context)) {
                ensureBundleStorageReady(context);
                assertStorageWritable();
                JSONObject normalizedRoot = normalizeRoot(context, root, true);
                return writeBundleRoot(context, normalizedRoot);
            }
            JSONObject normalizedRoot = normalizeRoot(context, root, true);
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
            return true;
        } catch (Exception error) {
            error.printStackTrace();
            return false;
        }
    }

    public static synchronized boolean saveManagedRoot(Context context, JSONObject root) {
        try {
            if (!usesDirectoryBundleStorage(context)) {
                return saveRoot(context, root);
            }
            ensureBundleStorageReady(context);
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
        JSONObject currentRoot = normalizeRoot(context, loadRoot(context), false);
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

    private static void resetStorageRecoveryState() {
        storageRecoveryState = STORAGE_RECOVERY_STATE_OK;
        storageRecoveryMessage = "";
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
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            return MODE_DIRECTORY + ":" + (directoryUri == null ? "" : directoryUri.toString());
        }
        File root = getDefaultBundleRootDirectory(context);
        return MODE_DEFAULT + ":" + (root == null ? "" : root.getAbsolutePath());
    }

    private static boolean canUseBundleStorageReadyCache(Context context) {
        if (
            context == null
                || !usesDirectoryBundleStorage(context)
                || !STORAGE_RECOVERY_STATE_OK.equals(getStorageRecoveryState())
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
        return SystemClock.elapsedRealtime() - bundleStorageReadyVerifiedAt
            <= BUNDLE_STORAGE_READY_CACHE_WINDOW_MS;
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
            JSONObject manifest = readBundleManifest(context);
            if (manifest != null) {
                return manifest;
            }
        }
        return buildStorageManifest(loadRoot(context));
    }

    public static synchronized JSONObject getStorageCoreState(Context context) {
        if (usesDirectoryBundleStorage(context)) {
            JSONObject directCore = readBundleCoreState(context);
            if (directCore != null) {
                return directCore;
            }
        }
        JSONObject root = loadRoot(context);
        JSONObject core = new JSONObject();
        try {
            core.put("projects", cloneJsonArray(root.optJSONArray("projects")));
            core.put("todos", cloneJsonArray(root.optJSONArray("todos")));
            core.put("checkinItems", cloneJsonArray(root.optJSONArray("checkinItems")));
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
        return core;
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
            error.printStackTrace();
            try {
                payload.put("page", page);
                payload.put("snapshotVersion", "");
                payload.put("generatedAt", isoNow());
                payload.put("changedSections", new JSONArray());
                payload.put("changedPeriods", new JSONObject());
                payload.put("pendingCompaction", false);
                payload.put("pageData", pageData);
            } catch (Exception ignored) {
                // Ignore bootstrap fallback serialization errors.
            }
        }
        return payload;
    }

    public static synchronized JSONObject getStoragePageBootstrapState(Context context, JSONObject options) {
        JSONObject source = options == null ? new JSONObject() : options;
        JSONObject sourceOptions = source.optJSONObject("options");
        JSONObject pageOptions = sourceOptions == null ? source : sourceOptions;
        String page = normalizeBootstrapPage(
            firstNonEmpty(source.optString("pageKey", ""), source.optString("page", ""))
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
            error.printStackTrace();
            try {
                payload.put("page", page);
                payload.put("sourceFingerprint", "");
                payload.put("builtAt", isoNow());
                payload.put("loadedPeriodIds", loadedPeriodIds);
                payload.put("data", data);
            } catch (Exception ignored) {
                // Ignore bootstrap fallback serialization errors.
            }
        }
        return payload;
    }

    public static synchronized JSONObject getStoragePlanBootstrapState(Context context, JSONObject options) {
        boolean includeYearlyGoals =
            options == null || options.optBoolean("includeYearlyGoals", true);
        boolean includeRecurringPlans =
            options == null || options.optBoolean("includeRecurringPlans", true);
        if (usesDirectoryBundleStorage(context)) {
            JSONObject core = readBundleCore(context);
            JSONObject payload = new JSONObject();
            try {
                if (includeYearlyGoals) {
                    payload.put(
                        "yearlyGoals",
                        cloneJsonObject(core == null ? null : core.optJSONObject("yearlyGoals"))
                    );
                }
                if (includeRecurringPlans) {
                    payload.put("recurringPlans", readBundleRecurringPlans(context));
                }
            } catch (Exception error) {
                error.printStackTrace();
            }
            return payload;
        }

        JSONObject root = loadRoot(context);
        JSONObject payload = new JSONObject();
        try {
            if (includeYearlyGoals) {
                payload.put("yearlyGoals", cloneJsonObject(root.optJSONObject("yearlyGoals")));
            }
            if (includeRecurringPlans) {
                payload.put("recurringPlans", collectRecurringPlans(root.optJSONArray("plans")));
            }
        } catch (Exception error) {
            error.printStackTrace();
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
        String normalizedSection = normalizeBundleSection(section);
        if (TextUtils.isEmpty(normalizedSection)) {
            throw new Exception("不支持的 section");
        }

        if (usesDirectoryBundleStorage(context)) {
            return loadBundleSectionRange(context, normalizedSection, scope);
        }

        JSONObject root = loadRoot(context);
        Set<String> requestedPeriodIds = resolveRequestedPeriodIds(normalizedSection, scope);
        JSONArray sourceItems = root.optJSONArray(normalizedSection);
        ArrayList<JSONObject> matchedItems = new ArrayList<>();
        Set<String> matchedPeriodIds = new HashSet<>();

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
                if (!sectionItemMatchesScope(normalizedSection, item, scope)) {
                    continue;
                }
                matchedItems.add(cloneJsonObject(item));
                matchedPeriodIds.addAll(itemPeriodIds);
            }
        }

        sortJsonItems(normalizedSection, matchedItems);
        ArrayList<String> sortedPeriodIds = new ArrayList<>(matchedPeriodIds);
        Collections.sort(sortedPeriodIds);

        JSONObject result = new JSONObject();
        result.put("section", normalizedSection);
        result.put("periodUnit", PERIOD_UNIT);
        result.put("periodIds", buildJsonArrayFromStrings(sortedPeriodIds));
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
        result.put("items", buildJsonArrayFromObjects(matchedItems));
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

        if (usesDirectoryBundleStorage(context)) {
            return saveBundleSectionRange(context, normalizedSection, payload);
        }

        JSONArray incomingArray = payload == null ? null : payload.optJSONArray("items");
        if (!validateItemsForPeriod(normalizedSection, periodId, incomingArray)) {
            throw new Exception("分区文件中的项目不属于目标月份");
        }

        ArrayList<JSONObject> incomingItems = jsonArrayToObjectList(incomingArray);
        JSONObject root = loadRoot(context);
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
        CorePayloadSanitizeResult sanitizeResult =
            stripPartitionedSectionsFromCorePayload(
                partialCore == null ? new JSONObject() : partialCore
            );
        JSONObject source = sanitizeResult.payload;
        if (usesDirectoryBundleStorage(context)) {
            logBundleCorePollutionCleanup("replaceStorageCoreState", sanitizeResult.removedSections);
            return replaceBundleCoreState(context, source);
        }
        JSONObject root = loadRoot(context);
        String[] mutableKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
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
        return buildCoreStateReplaceResult(source);
    }

    public static synchronized JSONArray replaceStorageRecurringPlans(
        Context context,
        JSONArray items
    ) throws Exception {
        if (usesDirectoryBundleStorage(context)) {
            return replaceBundleRecurringPlans(context, items);
        }
        JSONObject root = loadRoot(context);
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
        JSONObject currentRoot = normalizeRoot(context, loadRoot(context), false);
        JSONObject incomingRoot = normalizeRoot(context, importedRoot, false);
        JSONObject nextRoot = cloneJsonObject(currentRoot);

        String[] coreKeys = new String[] {
            "projects",
            "todos",
            "checkinItems",
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
            context == null ? new JSONObject() : loadRoot(context),
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
        ensureBundleStorageReady(context);
        JSONObject manifest = readBundleManifest(context);
        if (manifest == null) {
            if (strict) {
                throw new Exception("同步 bundle 为空。");
            }
            return normalizeRoot(context, new JSONObject(), false, rebuildProjectDurationCaches);
        }

        JSONObject root = readBundleCore(context);
        if (root == null) {
            root = new JSONObject();
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
                    JSONObject envelope = readBundlePartitionEnvelope(
                        context,
                        partition.optString("file", "")
                    );
                    JSONArray items = envelope == null ? null : envelope.optJSONArray("items");
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
                JSONArray recurringPlans = readBundleRecurringPlans(context);
                if (recurringPlans != null) {
                    for (int index = 0; index < recurringPlans.length(); index += 1) {
                        JSONObject item = recurringPlans.optJSONObject(index);
                        if (item != null) {
                            mergedItems.put(cloneJsonObject(item));
                        }
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

        return normalizeRoot(context, root, false, rebuildProjectDurationCaches);
    }

    private static boolean writeBundleRoot(Context context, JSONObject normalizedRoot) {
        try {
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
            return true;
        } catch (Exception error) {
            error.printStackTrace();
            return false;
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
            return new JSONArray();
        }
    }

    private static JSONObject readBundleCoreState(Context context) {
        try {
            ensureBundleStorageReady(context);
            JSONObject core = loadBundleCoreWithProjectDurationCache(context);
            core.put("recurringPlans", readBundleRecurringPlans(context));
            return core;
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONObject loadBundleSectionRange(
        Context context,
        String section,
        JSONObject scope
    ) throws Exception {
        ensureBundleStorageReady(context);
        JSONObject manifest = readBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
        Set<String> requestedPeriodIds = resolveRequestedPeriodIds(section, scope);
        ArrayList<JSONObject> matchedItems = new ArrayList<>();
        ArrayList<String> matchedPeriodIds = new ArrayList<>();

        JSONObject sectionObject =
            manifest == null || manifest.optJSONObject("sections") == null
                ? null
                : manifest.optJSONObject("sections").optJSONObject(section);
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
                JSONObject envelope = readBundlePartitionEnvelopeWithConflictRecovery(
                    context,
                    section,
                    periodId,
                    partition.optString("file", "")
                );
                JSONArray items = envelope == null ? null : envelope.optJSONArray("items");
                if (items == null) {
                    continue;
                }
                for (int itemIndex = 0; itemIndex < items.length(); itemIndex += 1) {
                    JSONObject item = items.optJSONObject(itemIndex);
                    if (item != null && sectionItemMatchesScope(section, item, scope)) {
                        matchedItems.add(cloneJsonObject(item));
                    }
                }
                if (!TextUtils.isEmpty(periodId)) {
                    matchedPeriodIds.add(periodId);
                }
            }
        }

        if ("records".equals(section)) {
            matchedItems = mergePartitionItems(section, new ArrayList<>(), matchedItems, true);
        }
        Collections.sort(matchedPeriodIds);
        sortJsonItems(section, matchedItems);

        JSONObject result = new JSONObject();
        result.put("section", section);
        result.put("periodUnit", PERIOD_UNIT);
        result.put("periodIds", buildJsonArrayFromStrings(matchedPeriodIds));
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
        result.put("items", buildJsonArrayFromObjects(matchedItems));
        return result;
    }

    private static boolean sectionItemMatchesScope(
        String section,
        JSONObject item,
        JSONObject scope
    ) {
        String normalizedSection = normalizeBundleSection(section);
        if (item == null || TextUtils.isEmpty(normalizedSection)) {
            return false;
        }

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
            return true;
        }

        String lowerDate = startDate.compareTo(endDate) <= 0 ? startDate : endDate;
        String upperDate = startDate.compareTo(endDate) <= 0 ? endDate : startDate;
        if ("records".equals(normalizedSection)) {
            return recordOverlapsDateScope(item, lowerDate, upperDate);
        }

        String itemDateKey = getSectionItemDateKey(normalizedSection, item);
        if (TextUtils.isEmpty(itemDateKey)) {
            return false;
        }
        return itemDateKey.compareTo(lowerDate) >= 0 && itemDateKey.compareTo(upperDate) <= 0;
    }

    private static boolean recordOverlapsDateScope(
        JSONObject record,
        String lowerDate,
        String upperDate
    ) {
        if (record == null || TextUtils.isEmpty(lowerDate) || TextUtils.isEmpty(upperDate)) {
            return record != null;
        }

        Calendar lowerCalendar = calendarFromDateText(lowerDate);
        Calendar upperCalendar = calendarFromDateText(upperDate);
        if (lowerCalendar == null || upperCalendar == null) {
            return true;
        }
        lowerCalendar.set(Calendar.HOUR_OF_DAY, 0);
        lowerCalendar.set(Calendar.MINUTE, 0);
        lowerCalendar.set(Calendar.SECOND, 0);
        lowerCalendar.set(Calendar.MILLISECOND, 0);
        upperCalendar.set(Calendar.HOUR_OF_DAY, 23);
        upperCalendar.set(Calendar.MINUTE, 59);
        upperCalendar.set(Calendar.SECOND, 59);
        upperCalendar.set(Calendar.MILLISECOND, 999);
        long lowerTimeMs = lowerCalendar.getTimeInMillis();
        long upperExclusiveTimeMs = upperCalendar.getTimeInMillis() + 1L;

        long startTimeMs = parseRecordTimestampMs(
            firstNonEmpty(
                record.optString("startTime", ""),
                record.optString("timestamp", ""),
                record.optString("endTime", "")
            )
        );
        long endTimeMs = parseRecordTimestampMs(
            firstNonEmpty(
                record.optString("endTime", ""),
                record.optString("timestamp", ""),
                record.optString("startTime", "")
            )
        );

        if (startTimeMs < 0L && endTimeMs < 0L) {
            String anchorDate = getSectionItemDateKey("records", record);
            if (TextUtils.isEmpty(anchorDate)) {
                return false;
            }
            return anchorDate.compareTo(lowerDate) >= 0 && anchorDate.compareTo(upperDate) <= 0;
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

        return endTimeMs > lowerTimeMs && startTimeMs < upperExclusiveTimeMs;
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
                        normalizedExistingItems,
                        mergedItems
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
        if (!usesDirectoryBundleStorage(context)) {
            return;
        }
        if (canUseBundleStorageReadyCache(context)) {
            return;
        }

        deleteIgnoredBundleArtifacts(context, "ensureBundleStorageReady");
        String previousRecoveryState = getStorageRecoveryState();
        BundleArtifactInspection inspection = inspectBundleArtifacts(context);
        if (inspection.manifestExists || inspection.hasBundleArtifacts()) {
            if (!shouldRepairBundleArtifacts(context, inspection)) {
                if (!STORAGE_RECOVERY_STATE_OK.equals(previousRecoveryState)) {
                    setStorageRecoveryState(STORAGE_RECOVERY_STATE_OK, "");
                }
                markBundleStorageReadyVerified(context);
                return;
            }
            if (repairBundleArtifactsIfNeeded(context, inspection)) {
                return;
            }

            String recoveryMessage =
                "检测到存储目录中存在未完成或损坏的 bundle 数据，当前无法自动修复，请先恢复后再继续。";
            setStorageRecoveryState(STORAGE_RECOVERY_STATE_NEEDS_RECOVERY, recoveryMessage);
            throw new Exception(recoveryMessage);
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

    private static boolean shouldRepairBundleArtifacts(
        Context context,
        BundleArtifactInspection inspection
    ) throws Exception {
        if (inspection == null) {
            return false;
        }
        if (!inspection.manifestExists) {
            return inspection.hasBundleArtifacts();
        }
        if (inspection.manifestInvalid || inspection.manifest == null) {
            return true;
        }
        if (!inspection.coreExists) {
            return true;
        }

        Set<String> manifestFiles = collectBundleFilesFromManifest(inspection.manifest);
        for (String file : manifestFiles) {
            if (BUNDLE_MANIFEST_FILE_NAME.equals(file)) {
                continue;
            }
            if (!bundlePathExists(context, file)) {
                return true;
            }
        }
        return false;
    }

    private static boolean repairBundleArtifactsIfNeeded(
        Context context,
        BundleArtifactInspection inspection
    ) throws Exception {
        if (inspection == null || !shouldRepairBundleArtifacts(context, inspection)) {
            return false;
        }

        JSONObject repairedRoot = buildRecoveredBundlePayloadFromFilesystem(context, inspection);
        if (repairedRoot == null) {
            return false;
        }

        writeRecoveredBundleRoot(context, repairedRoot, inspection.manifest);
        setStorageRecoveryState(
            STORAGE_RECOVERY_STATE_REPAIRED,
            "检测到存储索引缺失或过期，已根据现有数据文件自动修复。"
        );
        return true;
    }

    private static BundleArtifactInspection inspectBundleArtifacts(Context context) {
        BundleArtifactInspection inspection = new BundleArtifactInspection();
        inspection.manifestExists = bundlePathExists(context, BUNDLE_MANIFEST_FILE_NAME);
        inspection.coreExists = bundlePathExists(context, BUNDLE_CORE_FILE_NAME);
        inspection.recurringExists = bundlePathExists(context, BUNDLE_RECURRING_PLANS_FILE_NAME);
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            Uri directoryUri = getCustomStorageDirectoryUri(context);
            inspection.legacyExists =
                resolveDirectoryRelativeDocumentUri(
                    context,
                    directoryUri,
                    "controler-data.json",
                    false,
                    false
                ) != null;
            inspection.partitionFiles.addAll(listBundlePartitionRelativePaths(context, directoryUri, null));
        } else {
            File legacyFile = getStorageFile(context);
            inspection.legacyExists = legacyFile != null && legacyFile.exists();
            inspection.partitionFiles.addAll(
                listBundlePartitionRelativePaths(
                    context,
                    null,
                    getDefaultBundleRootDirectory(context)
                )
            );
        }
        if (inspection.manifestExists) {
            inspection.manifest = tryReadBundleJsonObject(context, BUNDLE_MANIFEST_FILE_NAME);
            inspection.manifestInvalid = inspection.manifest == null;
        }
        return inspection;
    }

    private static JSONObject buildRecoveredBundlePayloadFromFilesystem(
        Context context,
        BundleArtifactInspection inspection
    ) throws Exception {
        if (inspection == null || !inspection.hasBundleArtifacts()) {
            return null;
        }

        JSONObject root =
            tryReadBundleJsonObject(context, BUNDLE_CORE_FILE_NAME);
        boolean recoveredAnyArtifacts = root != null;
        if (root == null) {
            root = new JSONObject();
        } else {
            root = cloneJsonObject(root);
        }

        String[] sections = new String[] {
            "records",
            "diaryEntries",
            "dailyCheckins",
            "checkins",
            "plans"
        };
        for (String section : sections) {
            JSONArray mergedItems = new JSONArray();
            ArrayList<String> sectionFiles = new ArrayList<>();
            if (inspection.manifestExists && inspection.manifest != null) {
                JSONObject sectionObject =
                    inspection.manifest.optJSONObject("sections") == null
                        ? null
                        : inspection.manifest.optJSONObject("sections").optJSONObject(section);
                JSONArray partitions =
                    sectionObject == null ? null : sectionObject.optJSONArray("partitions");
                if (partitions != null) {
                    for (int partitionIndex = 0; partitionIndex < partitions.length(); partitionIndex += 1) {
                        JSONObject partition = partitions.optJSONObject(partitionIndex);
                        String file =
                            partition == null ? "" : normalizeBundleRelativePath(partition.optString("file", ""));
                        if (!TextUtils.isEmpty(file)) {
                            sectionFiles.add(file);
                        }
                    }
                }
            } else {
                sectionFiles.addAll(inspection.partitionFiles);
            }
            for (String relativePath : sectionFiles) {
                String normalizedPath = normalizeBundleRelativePath(relativePath);
                if (!normalizedPath.startsWith(section + "/")) {
                    continue;
                }
                JSONObject envelope = readBundlePartitionEnvelope(context, normalizedPath);
                JSONArray items = envelope == null ? null : envelope.optJSONArray("items");
                if (items == null) {
                    continue;
                }
                recoveredAnyArtifacts = true;
                for (int itemIndex = 0; itemIndex < items.length(); itemIndex += 1) {
                    JSONObject item = items.optJSONObject(itemIndex);
                    if (item != null) {
                        mergedItems.put(cloneJsonObject(item));
                    }
                }
            }
            if ("plans".equals(section)) {
                JSONArray recurringPlans = tryReadBundleJsonArray(
                    context,
                    BUNDLE_RECURRING_PLANS_FILE_NAME
                );
                if (recurringPlans != null) {
                    recoveredAnyArtifacts = true;
                    for (int index = 0; index < recurringPlans.length(); index += 1) {
                        JSONObject item = recurringPlans.optJSONObject(index);
                        if (item != null) {
                            mergedItems.put(cloneJsonObject(item));
                        }
                    }
                }
            }
            root.put(section, mergedItems);
        }

        if (!recoveredAnyArtifacts) {
            return null;
        }
        return normalizeRoot(context, root, false);
    }

    private static JSONObject tryReadBundleJsonObject(Context context, String relativePath) {
        try {
            return readBundleJsonObject(context, relativePath);
        } catch (Exception error) {
            return null;
        }
    }

    private static JSONArray tryReadBundleJsonArray(Context context, String relativePath) {
        try {
            return readBundleJsonArray(context, relativePath);
        } catch (Exception error) {
            return null;
        }
    }

    private static void writeRecoveredBundleRoot(
        Context context,
        JSONObject normalizedRoot,
        JSONObject previousManifest
    ) throws Exception {
        if (MODE_DIRECTORY.equals(getStorageMode(context))) {
            clearDirectoryDocumentUriCache(context, getCustomStorageDirectoryUri(context));
        }
        JSONObject manifest = buildStorageManifest(normalizedRoot);
        if (previousManifest != null && previousManifest.optJSONArray("legacyBackups") != null) {
            manifest.put(
                "legacyBackups",
                cloneJsonArray(previousManifest.optJSONArray("legacyBackups"))
            );
        }

        writeBundleJson(context, BUNDLE_CORE_FILE_NAME, buildCoreStateFromRoot(normalizedRoot));
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
    }

    private static JSONObject buildCoreStateFromRoot(JSONObject root) {
        JSONObject core = new JSONObject();
        try {
            core.put("projects", cloneJsonArray(root.optJSONArray("projects")));
            core.put("todos", cloneJsonArray(root.optJSONArray("todos")));
            core.put("checkinItems", cloneJsonArray(root.optJSONArray("checkinItems")));
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

    public static JSONObject flushStorageJournal(Context context) throws Exception {
        JSONObject result = new JSONObject();
        StorageVersion version = probeStorageVersion(context, false);
        result.put("ok", true);
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
        ensureBundleStorageReady(context);
        JSONObject storedCore = readBundleCore(context);
        if (storedCore == null) {
            JSONObject rebuiltCore = buildCoreStateFromRoot(loadBundleRoot(context, false));
            writeBundleJson(context, BUNDLE_CORE_FILE_NAME, rebuiltCore);
            return rebuiltCore;
        }
        CorePayloadSanitizeResult sanitizeResult =
            stripPartitionedSectionsFromCorePayload(storedCore);
        JSONObject core = sanitizeResult.payload;
        boolean themeStateChanged = ensureThemeStateInCore(core);
        boolean projectDurationCacheValid = projectsHaveValidDurationCache(
            core.optJSONArray("projects")
        );
        if (projectDurationCacheValid && !themeStateChanged && !sanitizeResult.repaired()) {
            return core;
        }
        JSONObject repairedCore = cloneJsonObject(core);
        if (!projectDurationCacheValid) {
            JSONObject repairedRoot = loadBundleRoot(context, false);
            repairedCore.put("projects", cloneJsonArray(repairedRoot.optJSONArray("projects")));
        }
        ensureThemeStateInCore(repairedCore);
        writeBundleJson(context, BUNDLE_CORE_FILE_NAME, repairedCore);
        logBundleCorePollutionCleanup(
            "loadBundleCoreWithProjectDurationCache",
            sanitizeResult.removedSections
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
        String[] timezoneAwarePatterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX"
        };
        for (String pattern : timezoneAwarePatterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsedDate = format.parse(trimmedValue);
                if (parsedDate != null) {
                    return parsedDate;
                }
            } catch (Exception ignored) {
            }
        }
        String[] localPatterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : localPatterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getDefault());
                Date parsedDate = format.parse(trimmedValue);
                if (parsedDate != null) {
                    return parsedDate;
                }
            } catch (Exception ignored) {
            }
        }
        return null;
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

        ArrayList<JSONObject> normalizedRecords = attachProjectIdsToRecords(records, context);
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

    private static boolean shouldUseRecoveredConflictPartition(int activeCount, int recoveredCount) {
        if (recoveredCount <= activeCount || recoveredCount <= 0) {
            return false;
        }
        if (activeCount <= 1) {
            return true;
        }
        return activeCount < 16
            && recoveredCount >= 64
            && recoveredCount >= activeCount * 4;
    }

    private static ArrayList<String> listBundleConflictPartitionRelativePaths(
        Context context,
        String relativePath
    ) {
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (TextUtils.isEmpty(normalizedRelativePath) || !normalizedRelativePath.endsWith(".json")) {
            return new ArrayList<>();
        }
        int separatorIndex = normalizedRelativePath.lastIndexOf('/');
        String directoryPrefix =
            separatorIndex >= 0 ? normalizedRelativePath.substring(0, separatorIndex + 1) : "";
        String fileName =
            separatorIndex >= 0
                ? normalizedRelativePath.substring(separatorIndex + 1)
                : normalizedRelativePath;
        String fileBaseName = fileName.substring(0, fileName.length() - 5);
        String conflictPrefix = directoryPrefix + fileBaseName + ".sync-conflict-";
        Uri treeUri = usesDirectoryBundleStorage(context) ? getCustomStorageDirectoryUri(context) : null;
        File localRoot = treeUri == null ? getDefaultBundleRootDirectory(context) : null;
        ArrayList<String> matches = new ArrayList<>();
        for (String candidatePath : listBundlePartitionRelativePaths(context, treeUri, localRoot)) {
            if (candidatePath.startsWith(conflictPrefix) && candidatePath.endsWith(".json")) {
                matches.add(candidatePath);
            }
        }
        Collections.sort(matches);
        return matches;
    }

    private static JSONObject readBundlePartitionEnvelopeWithConflictRecovery(
        Context context,
        String section,
        String periodId,
        String relativePath
    ) {
        JSONObject activeEnvelope = readBundlePartitionEnvelope(context, relativePath);
        ArrayList<JSONObject> activeItems = jsonArrayToObjectList(
            activeEnvelope == null ? null : activeEnvelope.optJSONArray("items")
        );
        int activeCount = activeItems.size();
        if (activeCount > 1) {
            return activeEnvelope;
        }

        ArrayList<String> conflictPaths = listBundleConflictPartitionRelativePaths(context, relativePath);
        if (conflictPaths.isEmpty()) {
            return activeEnvelope;
        }

        ArrayList<JSONObject> recoveredItems = new ArrayList<>(activeItems);
        for (String conflictPath : conflictPaths) {
            JSONObject conflictEnvelope = readBundlePartitionEnvelope(context, conflictPath);
            ArrayList<JSONObject> conflictItems = jsonArrayToObjectList(
                conflictEnvelope == null ? null : conflictEnvelope.optJSONArray("items")
            );
            if (conflictItems.isEmpty()) {
                continue;
            }
            recoveredItems = mergePartitionItems(section, recoveredItems, conflictItems, true);
        }

        ArrayList<JSONObject> filteredRecoveredItems = new ArrayList<>();
        for (JSONObject item : recoveredItems) {
            if (item == null) {
                continue;
            }
            if (getPeriodIdsForSectionItem(section, item).contains(periodId)) {
                filteredRecoveredItems.add(cloneJsonObject(item));
            }
        }
        sortJsonItems(section, filteredRecoveredItems);

        if (!shouldUseRecoveredConflictPartition(activeCount, filteredRecoveredItems.size())) {
            return activeEnvelope;
        }

        Log.i(
            TAG,
            "[storage.partition-conflict-repair] section="
                + section
                + " periodId="
                + periodId
                + " activeCount="
                + activeCount
                + " recoveredCount="
                + filteredRecoveredItems.size()
                + " conflictFileCount="
                + conflictPaths.size()
                + " relativePath="
                + safeText(relativePath)
        );
        try {
            return buildPartitionEnvelope(section, periodId, filteredRecoveredItems);
        } catch (Exception error) {
            Log.w(
                TAG,
                "[storage.partition-conflict-repair-build-failed] section="
                    + section
                    + " periodId="
                    + periodId
                    + " recoveredCount="
                    + filteredRecoveredItems.size()
                    + " relativePath="
                    + safeText(relativePath),
                error
            );
            return activeEnvelope;
        }
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
            ensureJsonArray(normalized, "diaryCategories");
            ensureJsonArray(normalized, "customThemes");
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
            return new JSONArray();
        }
        return new JSONArray(raw.trim());
    }

    private static void writeBundleJson(Context context, String relativePath, JSONObject value)
        throws Exception {
        writeBundleText(
            context,
            relativePath,
            value == null ? "{}" : value.toString()
        );
    }

    private static void writeBundleJson(Context context, String relativePath, JSONArray value)
        throws Exception {
        writeBundleText(
            context,
            relativePath,
            value == null ? "[]" : value.toString()
        );
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
                        Uri canonicalUri = buildDirectChildDocumentUri(treeUri, rootDocumentUri, baseName);
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

    private static void removeDirectoryDocumentUriCacheEntry(
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
        clearDirectoryDocumentUriCache(context, null);
        File sizeCacheFile = getBundleSizeCacheFile(context);
        if (sizeCacheFile.exists()) {
            sizeCacheFile.delete();
        }
        clearStorageBindingResolutionCache();
    }

    private static void clearStorageBindingResolutionCache() {
        storageBindingResolvedAt = 0L;
    }

    private static boolean canUseStorageBindingResolutionCache() {
        return storageBindingResolvedAt > 0L
            && SystemClock.elapsedRealtime() - storageBindingResolvedAt
                <= STORAGE_BINDING_RESOLUTION_CACHE_WINDOW_MS;
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
        return root;
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
        String normalizedRelativePath = normalizeBundleRelativePath(relativePath);
        if (context == null || treeUri == null || TextUtils.isEmpty(normalizedRelativePath)) {
            return null;
        }
        try {
            Uri cachedDocumentUri = getCachedDirectoryDocumentUri(
                context,
                treeUri,
                normalizedRelativePath
            );
            if (cachedDocumentUri != null) {
                if (queryDocumentExists(context, cachedDocumentUri)) {
                    return cachedDocumentUri;
                }
                removeDirectoryDocumentUriCacheEntry(context, treeUri, normalizedRelativePath);
            }

            String[] segments = normalizedRelativePath.split("/");
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri currentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocumentId);
            for (int index = 0; index < segments.length; index += 1) {
                String segment = segments[index];
                if (TextUtils.isEmpty(segment)) {
                    continue;
                }
                boolean isLast = index == segments.length - 1;
                boolean shouldBeDirectory = isLast ? directory : true;
                Uri directChildUri = buildDirectChildDocumentUri(treeUri, currentUri, segment);
                if (directChildUri != null && queryDocumentExists(context, directChildUri)) {
                    currentUri = directChildUri;
                    continue;
                }
                Uri childUri = findChildDocumentUri(context, treeUri, currentUri, segment);
                if (childUri == null && createIfMissing) {
                    Uri createdUri = DocumentsContract.createDocument(
                        context.getContentResolver(),
                        currentUri,
                        shouldBeDirectory ? Document.MIME_TYPE_DIR : "application/json",
                        segment
                    );
                    String createdName = queryDisplayName(context, createdUri);
                    if (!TextUtils.isEmpty(createdName) && !segment.equals(createdName)) {
                        Uri canonicalChildUri = buildDirectChildDocumentUri(treeUri, currentUri, segment);
                        if (canonicalChildUri != null && queryDocumentExists(context, canonicalChildUri)) {
                            deleteDocumentQuietly(context, createdUri);
                            childUri = canonicalChildUri;
                            Log.w(
                                TAG,
                                "[storage.directory-conflict] expected="
                                    + segment
                                    + " created="
                                    + createdName
                                    + " resolved=canonical"
                            );
                        } else {
                            childUri = createdUri;
                            Log.w(
                                TAG,
                                "[storage.directory-conflict] expected="
                                    + segment
                                    + " created="
                                    + createdName
                                    + " resolved=created"
                            );
                        }
                    } else {
                        childUri = createdUri;
                    }
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

    private static Uri findChildDocumentUri(
        Context context,
        Uri treeUri,
        Uri parentDocumentUri,
        String childName
    ) {
        if (context == null || treeUri == null || parentDocumentUri == null) {
            return null;
        }
        Uri directChildUri = buildDirectChildDocumentUri(treeUri, parentDocumentUri, childName);
        if (directChildUri != null && queryDocumentExists(context, directChildUri)) {
            return directChildUri;
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

    private static boolean isExternalStorageDocumentsTreeUri(Uri treeUri) {
        return treeUri != null
            && "com.android.externalstorage.documents".equals(treeUri.getAuthority());
    }

    private static Uri buildDirectChildDocumentUri(
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

    private static String addMonthOffsetToPeriodId(String periodId, int monthOffset) {
        String normalizedPeriodId = normalizePeriodId(periodId);
        if (TextUtils.isEmpty(normalizedPeriodId)) {
            return "";
        }

        String[] parts = normalizedPeriodId.split("-");
        if (parts.length != 2) {
            return "";
        }
        int year;
        int month;
        try {
            year = Integer.parseInt(parts[0]);
            month = Integer.parseInt(parts[1]);
        } catch (NumberFormatException error) {
            return "";
        }

        Calendar calendar = Calendar.getInstance();
        calendar.clear();
        calendar.set(year, month - 1, 1, 0, 0, 0);
        calendar.add(Calendar.MONTH, monthOffset);
        return String.format(
            Locale.US,
            "%04d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1
        );
    }

    private static Set<String> resolveRequestedPeriodIds(String section, JSONObject scope) {
        String normalizedSection = normalizeBundleSection(section);
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
            if ("records".equals(normalizedSection)) {
                for (String periodId : normalizedPeriodIds) {
                    periodIds.add(periodId);
                    String previousPeriodId = addMonthOffsetToPeriodId(periodId, -1);
                    String nextPeriodId = addMonthOffsetToPeriodId(periodId, 1);
                    if (!TextUtils.isEmpty(previousPeriodId)) {
                        periodIds.add(previousPeriodId);
                    }
                    if (!TextUtils.isEmpty(nextPeriodId)) {
                        periodIds.add(nextPeriodId);
                    }
                }
            } else {
                periodIds.addAll(normalizedPeriodIds);
            }
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

        if ("records".equals(normalizedSection)) {
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
            lower.add(Calendar.MONTH, -1);
            upper.add(Calendar.MONTH, 1);

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
        return value.length() >= 10 ? value.substring(0, 10) : value;
    }

    public static int extractHour(String timestamp) {
        if (TextUtils.isEmpty(timestamp)) {
            return 0;
        }
        try {
            if (timestamp.length() >= 13) {
                return Math.max(0, Math.min(23, Integer.parseInt(timestamp.substring(11, 13))));
            }
        } catch (Exception ignored) {
        }

        Date parsedDate = parseDateTimeValue(timestamp);
        if (parsedDate != null) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(parsedDate);
            return calendar.get(Calendar.HOUR_OF_DAY);
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
            checkinItem.repeatType = item.optString("repeatType", "daily");
            checkinItem.repeatWeekdays = parseIntArray(item.optJSONArray("repeatWeekdays"));
            checkinItem.color = item.optString("color", "#4299e1");
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
