package com.controlerapp.widgets;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.text.TextUtils;
import android.widget.Toast;

import com.controlerapp.MainApplication;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.TimeZone;

public final class ControlerWidgetActionHandler {
    public static final String ACTION_EXECUTE =
        "com.controler.timetracker.action.EXECUTE_WIDGET_COMMAND";
    public static final String EXTRA_COMMAND = "widgetCommand";
    public static final String EXTRA_TARGET_ID = "widgetTargetId";
    public static final String EXTRA_WIDGET_KIND = "widgetKind";
    public static final String EXTRA_APP_WIDGET_ID = "appWidgetId";

    public static final String COMMAND_TOGGLE_TIMER = "toggle-timer";
    public static final String COMMAND_TOGGLE_TODO = "toggle-todo";
    public static final String COMMAND_TOGGLE_CHECKIN = "toggle-checkin";
    public static final String COMMAND_REFRESH_WIDGET = "refresh-widget";
    private static final HandlerThread ACTION_THREAD = createActionThread();
    private static final Handler ACTION_HANDLER = new Handler(ACTION_THREAD.getLooper());
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private ControlerWidgetActionHandler() {}

    private static HandlerThread createActionThread() {
        HandlerThread thread = new HandlerThread("ControlerWidgetActions");
        thread.start();
        return thread;
    }

    private static final class ActionResult {
        final boolean ok;
        final boolean changed;
        final String message;
        final boolean refreshAll;
        final String refreshKind;
        final int appWidgetId;

        ActionResult(
            boolean ok,
            boolean changed,
            String message,
            boolean refreshAll,
            String refreshKind,
            int appWidgetId
        ) {
            this.ok = ok;
            this.changed = changed;
            this.message = message == null ? "" : message;
            this.refreshAll = refreshAll;
            this.refreshKind = refreshKind == null ? "" : refreshKind;
            this.appWidgetId = appWidgetId;
        }

        static ActionResult fullRefresh(boolean ok, boolean changed, String message) {
            return new ActionResult(
                ok,
                changed,
                message,
                true,
                "",
                AppWidgetManager.INVALID_APPWIDGET_ID
            );
        }

        static ActionResult refreshKind(boolean ok, boolean changed, String message, String refreshKind) {
            return new ActionResult(
                ok,
                changed,
                message,
                false,
                refreshKind,
                AppWidgetManager.INVALID_APPWIDGET_ID
            );
        }

        static ActionResult refreshSingleWidget(
            boolean ok,
            boolean changed,
            String message,
            String refreshKind,
            int appWidgetId
        ) {
            return new ActionResult(ok, changed, message, false, refreshKind, appWidgetId);
        }
    }

    public static boolean canHandleBroadcast(Intent intent) {
        return intent != null && ACTION_EXECUTE.equals(intent.getAction());
    }

    public static void handleBroadcastAsync(
        Context context,
        Intent intent,
        BroadcastReceiver.PendingResult pendingResult
    ) {
        final Context appContext = context == null ? null : context.getApplicationContext();
        if (appContext == null || !canHandleBroadcast(intent)) {
            if (pendingResult != null) {
                pendingResult.finish();
            }
            return;
        }

        final Intent intentCopy = new Intent(intent);
        ACTION_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                try {
                    ActionResult result = execute(appContext, intentCopy);
                    applyActionResult(appContext, result);
                } finally {
                    if (pendingResult != null) {
                        pendingResult.finish();
                    }
                }
            }
        });
    }

    public static boolean handleBroadcast(Context context, Intent intent) {
        if (context == null || !canHandleBroadcast(intent)) {
            return false;
        }

        ActionResult result = execute(context.getApplicationContext(), intent);
        applyActionResult(context.getApplicationContext(), result);
        return true;
    }

    private static void applyActionResult(Context context, ActionResult result) {
        if (context == null || result == null) {
            return;
        }

        if (result.ok && result.changed) {
            ControlerWidgetRenderer.invalidateRenderSourceCache();
            if (result.refreshAll || TextUtils.isEmpty(result.refreshKind)) {
                ControlerWidgetRenderer.refreshAll(context);
            } else if (result.appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                ControlerWidgetRenderer.updateWidgets(
                    context,
                    result.refreshKind,
                    new int[] { result.appWidgetId }
                );
                int[] siblingWidgetIds = getSiblingWidgetIds(
                    context,
                    result.refreshKind,
                    result.appWidgetId
                );
                if (siblingWidgetIds.length > 0) {
                    ControlerWidgetRenderer.scheduleUpdateWidgets(
                        context,
                        result.refreshKind,
                        siblingWidgetIds
                    );
                }
            } else {
                ControlerWidgetRenderer.refreshKind(context, result.refreshKind);
            }
        }

        if (!TextUtils.isEmpty(result.message)) {
            MAIN_HANDLER.post(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(context, result.message, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private static int[] getSiblingWidgetIds(
        Context context,
        String kind,
        int excludedAppWidgetId
    ) {
        if (context == null) {
            return new int[0];
        }

        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return new int[0];
        }

        ComponentName componentName =
            ControlerWidgetKinds.componentNameForKind(context, normalizedKind);
        if (componentName == null) {
            return new int[0];
        }

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        if (appWidgetManager == null) {
            return new int[0];
        }

        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        if (appWidgetIds == null || appWidgetIds.length == 0) {
            return new int[0];
        }

        ArrayList<Integer> siblingIds = new ArrayList<>();
        for (int appWidgetId : appWidgetIds) {
            if (appWidgetId != excludedAppWidgetId) {
                siblingIds.add(appWidgetId);
            }
        }

        int[] result = new int[siblingIds.size()];
        for (int index = 0; index < siblingIds.size(); index++) {
            result[index] = siblingIds.get(index);
        }
        return result;
    }

    private static void emitForegroundStorageChanged(
        final Context context,
        final String[] changedSections,
        final JSONObject changedPeriods,
        final String source
    ) {
        if (context == null || changedSections == null || changedSections.length == 0) {
            return;
        }

        final Context appContext = context.getApplicationContext();
        if (appContext == null) {
            return;
        }

        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                if (!(appContext instanceof MainApplication)) {
                    return;
                }

                ReactContext reactContext =
                    ((MainApplication) appContext)
                        .getReactNativeHost()
                        .getReactInstanceManager()
                        .getCurrentReactContext();
                if (reactContext == null || !reactContext.hasActiveCatalystInstance()) {
                    return;
                }

                WritableMap payload = Arguments.createMap();
                WritableArray sectionArray = Arguments.createArray();
                for (String section : changedSections) {
                    String normalizedSection = section == null ? "" : section.trim();
                    if (!TextUtils.isEmpty(normalizedSection)) {
                        sectionArray.pushString(normalizedSection);
                    }
                }
                payload.putArray("changedSections", sectionArray);

                WritableMap periodMap = Arguments.createMap();
                if (changedPeriods != null) {
                    Iterator<String> keys = changedPeriods.keys();
                    while (keys.hasNext()) {
                        String section = keys.next();
                        String normalizedSection = section == null ? "" : section.trim();
                        if (TextUtils.isEmpty(normalizedSection)) {
                            continue;
                        }
                        JSONArray periodIds = changedPeriods.optJSONArray(section);
                        if (periodIds == null || periodIds.length() == 0) {
                            continue;
                        }
                        WritableArray periodArray = Arguments.createArray();
                        for (int index = 0; index < periodIds.length(); index++) {
                            String periodId = periodIds.optString(index, "").trim();
                            if (!TextUtils.isEmpty(periodId)) {
                                periodArray.pushString(periodId);
                            }
                        }
                        if (periodArray.size() > 0) {
                            periodMap.putArray(normalizedSection, periodArray);
                        }
                    }
                }
                payload.putMap("changedPeriods", periodMap);
                payload.putString(
                    "source",
                    TextUtils.isEmpty(source) ? "android-widget" : source
                );
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("widgets.storageChanged", payload);
            }
        });
    }

    private static JSONObject buildChangedPeriodsPayload(String section, String periodId) {
        String normalizedSection = section == null ? "" : section.trim();
        String normalizedPeriodId = periodId == null ? "" : periodId.trim();
        if (TextUtils.isEmpty(normalizedSection) || TextUtils.isEmpty(normalizedPeriodId)) {
            return null;
        }

        try {
            JSONObject result = new JSONObject();
            JSONArray periodIds = new JSONArray();
            periodIds.put(normalizedPeriodId);
            result.put(normalizedSection, periodIds);
            return result;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static ActionResult execute(Context context, Intent intent) {
        String command = intent.getStringExtra(EXTRA_COMMAND);
        String targetId = intent.getStringExtra(EXTRA_TARGET_ID);
        String widgetKind = intent.getStringExtra(EXTRA_WIDGET_KIND);
        int appWidgetId = intent.getIntExtra(
            EXTRA_APP_WIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        );

        if (COMMAND_TOGGLE_TIMER.equals(command)) {
            return toggleTimer(context);
        }
        if (COMMAND_TOGGLE_TODO.equals(command)) {
            return toggleTodo(context, targetId, appWidgetId);
        }
        if (COMMAND_TOGGLE_CHECKIN.equals(command)) {
            return toggleCheckin(context, targetId, appWidgetId);
        }
        if (COMMAND_REFRESH_WIDGET.equals(command)) {
            return refreshWidget(widgetKind, appWidgetId);
        }

        return ActionResult.fullRefresh(false, false, "未知的小组件动作。");
    }

    private static ActionResult refreshWidget(String widgetKind, int appWidgetId) {
        String normalizedKind = ControlerWidgetKinds.normalize(widgetKind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return ActionResult.fullRefresh(true, true, "已刷新组件");
        }
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            return ActionResult.refreshSingleWidget(
                true,
                true,
                "已刷新组件",
                normalizedKind,
                appWidgetId
            );
        }
        return ActionResult.refreshKind(true, true, "已刷新组件", normalizedKind);
    }

    private static ActionResult toggleTimer(Context context) {
        try {
            JSONObject root = ControlerWidgetDataStore.loadRootForWidgets(context);
            JSONArray projects = ensureArray(root, "projects");
            JSONArray records = ensureArray(root, "records");
            JSONObject timerSession = ensureObject(root, "timerSessionState");

            if (isTimerActive(timerSession)) {
                return stopTimer(context, root, projects, records, timerSession);
            }

            String projectName = chooseProjectName(timerSession, projects);
            JSONObject project = ensureProject(projects, projectName);
            String nowText = isoNow();

            timerSession.put("ptn", 1);
            timerSession.put("fpt", nowText);
            timerSession.put("spt", JSONObject.NULL);
            timerSession.put("lastspt", JSONObject.NULL);
            timerSession.put("diffMs", JSONObject.NULL);
            timerSession.put("selectedProject", project.optString("name", projectName));
            timerSession.put("nextProject", "");
            timerSession.put("lastEnteredProjectName", project.optString("name", projectName));
            timerSession.put("pendingDurationCarryoverState", JSONObject.NULL);
            timerSession.put("savedAt", nowText);

            if (!ControlerWidgetDataStore.saveRoot(context, root)) {
                return ActionResult.fullRefresh(false, false, "开始计时失败。");
            }

            emitForegroundStorageChanged(
                context,
                new String[] { "timerSessionState", "projects" },
                null,
                "android-widget-direct-action"
            );

            return ActionResult.fullRefresh(true, true, "已开始计时");
        } catch (Exception error) {
            error.printStackTrace();
            return ActionResult.fullRefresh(false, false, "开始计时失败。");
        }
    }

    private static ActionResult stopTimer(
        Context context,
        JSONObject root,
        JSONArray projects,
        JSONArray records,
        JSONObject timerSession
    ) {
        try {
            long startMillis = parseIsoToMillis(timerSession.optString("fpt", ""));
            long endMillis = System.currentTimeMillis();
            long durationMs = Math.max(endMillis - Math.max(startMillis, 0L), 0L);

            String projectName = chooseProjectName(timerSession, projects);
            JSONObject project = ensureProject(projects, projectName);
            String nowText = formatIso(endMillis);

            JSONObject record = new JSONObject();
            record.put("id", generateId("record_"));
            record.put("timestamp", nowText);
            record.put("sptTime", nowText);
            record.put("name", project.optString("name", projectName));
            record.put("spendtime", formatDurationFromMs(durationMs));
            record.put(
                "projectId",
                TextUtils.isEmpty(project.optString("id", ""))
                    ? JSONObject.NULL
                    : project.optString("id", "")
            );
            record.put(
                "startTime",
                TextUtils.isEmpty(timerSession.optString("fpt", ""))
                    ? JSONObject.NULL
                    : timerSession.optString("fpt", "")
            );
            record.put("endTime", nowText);
            record.put("rawEndTime", nowText);
            record.put("durationMs", durationMs);
            record.put("clickCount", Math.max(2, timerSession.optInt("ptn", 1) + 1));
            record.put("timerRollbackState", JSONObject.NULL);
            record.put("durationMeta", JSONObject.NULL);
            records.put(record);

            timerSession.put("ptn", 0);
            timerSession.put("fpt", JSONObject.NULL);
            timerSession.put("spt", JSONObject.NULL);
            timerSession.put("lastspt", JSONObject.NULL);
            timerSession.put("diffMs", JSONObject.NULL);
            timerSession.put("selectedProject", project.optString("name", projectName));
            timerSession.put("nextProject", "");
            timerSession.put("lastEnteredProjectName", project.optString("name", projectName));
            timerSession.put("pendingDurationCarryoverState", JSONObject.NULL);
            timerSession.put("savedAt", nowText);

            if (!ControlerWidgetDataStore.saveRoot(context, root)) {
                return ActionResult.fullRefresh(false, false, "保存计时失败。");
            }

            emitForegroundStorageChanged(
                context,
                new String[] { "records", "timerSessionState", "projects" },
                null,
                "android-widget-direct-action"
            );

            return ActionResult.fullRefresh(
                true,
                true,
                "已保存 " + formatDurationFromMs(durationMs)
            );
        } catch (Exception error) {
            error.printStackTrace();
            return ActionResult.fullRefresh(false, false, "保存计时失败。");
        }
    }

    private static ActionResult toggleTodo(Context context, String targetId, int appWidgetId) {
        if (TextUtils.isEmpty(targetId)) {
            return ActionResult.refreshKind(false, false, "未找到待办事项。", ControlerWidgetKinds.TODOS);
        }

        try {
            JSONObject coreState = ControlerWidgetDataStore.getStorageCoreState(context);
            JSONArray todos = coreState.optJSONArray("todos");
            if (todos == null) {
                todos = new JSONArray();
            }
            String nowText = isoNow();

            for (int index = 0; index < todos.length(); index++) {
                JSONObject todo = todos.optJSONObject(index);
                if (todo == null) {
                    continue;
                }
                if (!targetId.equals(todo.optString("id", ""))) {
                    continue;
                }

                boolean nextCompleted = !todo.optBoolean("completed", false);
                todo.put("completed", nextCompleted);
                todo.put("completedAt", nextCompleted ? nowText : JSONObject.NULL);

                JSONObject partialCore = new JSONObject();
                partialCore.put("todos", todos);
                ControlerWidgetDataStore.replaceStorageCoreState(context, partialCore);

                emitForegroundStorageChanged(
                    context,
                    new String[] { "todos" },
                    null,
                    "android-widget-direct-action"
                );

                if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    return ActionResult.refreshSingleWidget(
                        true,
                        true,
                        nextCompleted ? "已完成：" + todo.optString("title", "待办") : "已恢复待办",
                        ControlerWidgetKinds.TODOS,
                        appWidgetId
                    );
                }

                return ActionResult.refreshKind(
                    true,
                    true,
                    nextCompleted ? "已完成：" + todo.optString("title", "待办") : "已恢复待办",
                    ControlerWidgetKinds.TODOS
                );
            }
        } catch (Exception error) {
            error.printStackTrace();
            return ActionResult.refreshKind(false, false, "更新待办失败。", ControlerWidgetKinds.TODOS);
        }

        return ActionResult.refreshKind(false, false, "未找到待办事项。", ControlerWidgetKinds.TODOS);
    }

    private static ActionResult toggleCheckin(Context context, String targetId, int appWidgetId) {
        if (TextUtils.isEmpty(targetId)) {
            return ActionResult.refreshKind(false, false, "未找到打卡项目。", ControlerWidgetKinds.CHECKINS);
        }

        try {
            JSONObject coreState = ControlerWidgetDataStore.getStorageCoreState(context);
            JSONArray checkinItems = coreState.optJSONArray("checkinItems");
            if (checkinItems == null) {
                checkinItems = new JSONArray();
            }
            String today = todayText();
            String periodId = today.length() >= 7 ? today.substring(0, 7) : "";
            String nowText = isoNow();
            String itemTitle = "打卡";
            boolean itemFound = false;

            for (int index = 0; index < checkinItems.length(); index++) {
                JSONObject item = checkinItems.optJSONObject(index);
                if (item == null) {
                    continue;
                }
                if (targetId.equals(item.optString("id", ""))) {
                    itemTitle = item.optString("title", itemTitle);
                    itemFound = true;
                    break;
                }
            }
            if (!itemFound) {
                return ActionResult.refreshKind(false, false, "未找到打卡项目。", ControlerWidgetKinds.CHECKINS);
            }

            JSONObject scope = new JSONObject();
            JSONArray periodIds = new JSONArray();
            periodIds.put(periodId);
            scope.put("periodIds", periodIds);
            JSONObject range = ControlerWidgetDataStore.loadStorageSectionRange(
                context,
                "dailyCheckins",
                scope
            );
            JSONArray dailyCheckins =
                range == null ? null : range.optJSONArray("items");
            if (dailyCheckins == null) {
                dailyCheckins = new JSONArray();
            }

            for (int index = 0; index < dailyCheckins.length(); index++) {
                JSONObject entry = dailyCheckins.optJSONObject(index);
                if (entry == null) {
                    continue;
                }
                if (
                    targetId.equals(entry.optString("itemId", ""))
                        && today.equals(entry.optString("date", ""))
                ) {
                    boolean nextChecked = !entry.optBoolean("checked", false);
                    entry.put("checked", nextChecked);
                    entry.put("time", nowText);

                    JSONObject payload = new JSONObject();
                    payload.put("periodId", periodId);
                    payload.put("items", dailyCheckins);
                    payload.put("mode", "replace");
                    ControlerWidgetDataStore.saveStorageSectionRange(
                        context,
                        "dailyCheckins",
                        payload
                    );

                    emitForegroundStorageChanged(
                        context,
                        new String[] { "dailyCheckins" },
                        buildChangedPeriodsPayload("dailyCheckins", periodId),
                        "android-widget-direct-action"
                    );

                    if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                        return ActionResult.refreshSingleWidget(
                            true,
                            true,
                            nextChecked ? "已打卡：" + itemTitle : "已取消打卡",
                            ControlerWidgetKinds.CHECKINS,
                            appWidgetId
                        );
                    }

                    return ActionResult.refreshKind(
                        true,
                        true,
                        nextChecked ? "已打卡：" + itemTitle : "已取消打卡",
                        ControlerWidgetKinds.CHECKINS
                    );
                }
            }

            JSONObject newEntry = new JSONObject();
            newEntry.put("id", generateId("daily_checkin_"));
            newEntry.put("itemId", targetId);
            newEntry.put("date", today);
            newEntry.put("checked", true);
            newEntry.put("time", nowText);
            dailyCheckins.put(newEntry);

            JSONObject payload = new JSONObject();
            payload.put("periodId", periodId);
            payload.put("items", dailyCheckins);
            payload.put("mode", "replace");
            ControlerWidgetDataStore.saveStorageSectionRange(
                context,
                "dailyCheckins",
                payload
            );

            emitForegroundStorageChanged(
                context,
                new String[] { "dailyCheckins" },
                buildChangedPeriodsPayload("dailyCheckins", periodId),
                "android-widget-direct-action"
            );

            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                return ActionResult.refreshSingleWidget(
                    true,
                    true,
                    "已打卡：" + itemTitle,
                    ControlerWidgetKinds.CHECKINS,
                    appWidgetId
                );
            }

            return ActionResult.refreshKind(true, true, "已打卡：" + itemTitle, ControlerWidgetKinds.CHECKINS);
        } catch (Exception error) {
            error.printStackTrace();
            return ActionResult.refreshKind(false, false, "更新打卡失败。", ControlerWidgetKinds.CHECKINS);
        }
    }

    private static JSONArray ensureArray(JSONObject root, String key) throws Exception {
        JSONArray array = root.optJSONArray(key);
        if (array != null) {
            return array;
        }

        array = new JSONArray();
        root.put(key, array);
        return array;
    }

    private static JSONObject ensureObject(JSONObject root, String key) throws Exception {
        JSONObject object = root.optJSONObject(key);
        if (object != null) {
            return object;
        }

        object = new JSONObject();
        root.put(key, object);
        return object;
    }

    private static boolean isTimerActive(JSONObject timerSession) {
        return timerSession != null
            && timerSession.optInt("ptn", 0) >= 1
            && parseIsoToMillis(timerSession.optString("fpt", "")) > 0L;
    }

    private static String chooseProjectName(JSONObject timerSession, JSONArray projects) {
        String candidate = timerSession == null ? "" : timerSession.optString("selectedProject", "");
        if (TextUtils.isEmpty(candidate) && timerSession != null) {
            candidate = timerSession.optString("lastEnteredProjectName", "");
        }
        if (!TextUtils.isEmpty(candidate)) {
            return candidate;
        }

        if (projects != null) {
            for (int index = 0; index < projects.length(); index++) {
                JSONObject project = projects.optJSONObject(index);
                if (project == null) {
                    continue;
                }
                String name = project.optString("name", "");
                if (!TextUtils.isEmpty(name)) {
                    return name;
                }
            }
        }

        return "快速计时";
    }

    private static JSONObject ensureProject(JSONArray projects, String projectName) throws Exception {
        String normalizedName = TextUtils.isEmpty(projectName) ? "快速计时" : projectName.trim();

        for (int index = 0; index < projects.length(); index++) {
            JSONObject project = projects.optJSONObject(index);
            if (project == null) {
                continue;
            }
            if (normalizedName.equals(project.optString("name", ""))) {
                return project;
            }
        }

        JSONObject project = new JSONObject();
        project.put("id", generateId("project_"));
        project.put("name", normalizedName);
        project.put("level", 1);
        project.put("parentId", JSONObject.NULL);
        project.put("color", "#79af85");
        project.put("description", "");
        project.put("createdAt", isoNow());
        projects.put(project);
        return project;
    }

    private static String generateId(String prefix) {
        return prefix
            + Long.toString(System.currentTimeMillis(), 36)
            + Integer.toHexString((int) (Math.random() * 0xFFFFFF));
    }

    private static String isoNow() {
        return formatIso(System.currentTimeMillis());
    }

    private static String formatIso(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private static String todayText() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
    }

    private static long parseIsoToMillis(String value) {
        if (TextUtils.isEmpty(value)) {
            return 0L;
        }

        String[] patterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsed = format.parse(value);
                if (parsed != null) {
                    return parsed.getTime();
                }
            } catch (Exception ignored) {
            }
        }

        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static String formatDurationFromMs(long durationMs) {
        if (durationMs <= 0L) {
            return "小于1分钟";
        }

        long totalMinutes = durationMs / 60000L;
        if (totalMinutes <= 0L) {
            return "小于1分钟";
        }

        long days = totalMinutes / (24L * 60L);
        long remainder = totalMinutes - days * 24L * 60L;
        long hours = remainder / 60L;
        long minutes = remainder % 60L;

        if (days > 0L) {
            return days + "天" + hours + "小时" + minutes + "分钟";
        }
        if (hours > 0L) {
            return hours + "小时" + minutes + "分钟";
        }
        return minutes + "分钟";
    }
}
