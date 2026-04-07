package com.controlerapp;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.text.TextUtils;

import com.controlerapp.widgets.ControlerWidgetDataStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class ControlerNotificationScheduler {
    public static final String CHANNEL_ID = "controler_reminders";
    private static final String CHANNEL_NAME = "事项提醒";
    private static final String CHANNEL_DESCRIPTION = "计划、待办与打卡提醒";
    private static final String PREFS_NAME = "controler_notification_scheduler";
    private static final String KEY_SCHEDULED_CODES = "scheduled_codes";
    private static final String KEY_SCHEDULE_SNAPSHOT = "schedule_snapshot";
    private static final int HORIZON_DAYS = 60;
    private static final int MAX_CUSTOM_OFFSET_DAYS = 30;
    private static final int MAX_PLAN_BEFORE_MINUTES = 7 * 24 * 60;
    private static final int MAX_SCAN_DAYS = 190;
    private static final int MAX_ENTRIES = 180;
    private static final Object SCHEDULE_LOCK = new Object();

    private ControlerNotificationScheduler() {}

    public static void ensureNotificationChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }

        NotificationChannel channel =
            new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.enableLights(true);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static void rescheduleAll(Context context) {
        if (context == null) {
            return;
        }

        synchronized (SCHEDULE_LOCK) {
            try {
                long nowMillis = System.currentTimeMillis();
                StoredScheduleSnapshot storedSnapshot = loadStoredScheduleSnapshot(context);
                if (storedSnapshot != null) {
                    ArrayList<ReminderEntry> futureEntries = storedSnapshot.notificationsEnabled
                        ? filterFutureReminderEntries(storedSnapshot.entries, nowMillis)
                        : new ArrayList<ReminderEntry>();
                    if (!storedSnapshot.notificationsEnabled || !futureEntries.isEmpty()) {
                        applyReminderEntries(
                            context,
                            storedSnapshot.notificationsEnabled,
                            futureEntries,
                            buildStoredScheduleSnapshot(
                                storedSnapshot.notificationsEnabled,
                                futureEntries
                            )
                        );
                        return;
                    }
                }
                rescheduleAllLocked(
                    context,
                    buildSchedulingRoot(context, nowMillis)
                );
            } catch (Exception error) {
                error.printStackTrace();
            }
        }
    }

    public static void rescheduleSections(Context context, JSONArray changedSections) {
        if (context == null || !shouldRescheduleForChangedSections(changedSections)) {
            return;
        }

        synchronized (SCHEDULE_LOCK) {
            try {
                rescheduleAllLocked(
                    context,
                    buildSchedulingRoot(context, System.currentTimeMillis())
                );
            } catch (Exception error) {
                error.printStackTrace();
            }
        }
    }

    public static void rescheduleAll(Context context, JSONObject root) {
        if (context == null) {
            return;
        }

        synchronized (SCHEDULE_LOCK) {
            rescheduleAllLocked(context, root);
        }
    }

    private static void rescheduleAllLocked(Context context, JSONObject root) {
        boolean notificationsEnabled = areNotificationsEnabled(root);
        ArrayList<ReminderEntry> entries = notificationsEnabled
            ? collectReminderEntries(root, System.currentTimeMillis())
            : new ArrayList<ReminderEntry>();
        applyReminderEntries(
            context,
            notificationsEnabled,
            entries,
            buildStoredScheduleSnapshot(notificationsEnabled, entries)
        );
    }

    public static int syncFromPayload(Context context, JSONObject schedulePayload) {
        if (context == null) {
            return 0;
        }

        synchronized (SCHEDULE_LOCK) {
            long nowMillis = System.currentTimeMillis();
            boolean notificationsEnabled = readNotificationsEnabled(schedulePayload, true);
            ArrayList<ReminderEntry> entries = notificationsEnabled
                ? filterFutureReminderEntries(
                    parseReminderEntries(schedulePayload == null ? null : schedulePayload.optJSONArray("entries")),
                    nowMillis
                )
                : new ArrayList<ReminderEntry>();
            applyReminderEntries(
                context,
                notificationsEnabled,
                entries,
                buildStoredScheduleSnapshot(notificationsEnabled, entries)
            );
            return entries.size();
        }
    }

    private static boolean shouldRescheduleForChangedSections(JSONArray changedSections) {
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

    private static JSONObject buildSchedulingRoot(Context context, long nowMillis) throws Exception {
        JSONObject core = ControlerWidgetDataStore.getStorageCoreState(context);
        JSONObject root = new JSONObject();
        String scanStartDateText = toDateText(nowMillis, -MAX_CUSTOM_OFFSET_DAYS);
        String scanEndDateText = toDateText(nowMillis, HORIZON_DAYS + MAX_CUSTOM_OFFSET_DAYS);
        JSONObject scope = new JSONObject()
            .put("startDate", scanStartDateText)
            .put("endDate", scanEndDateText);

        root.put("todos", cloneJsonArray(core.optJSONArray("todos")));
        root.put("checkinItems", cloneJsonArray(core.optJSONArray("checkinItems")));

        JSONObject dailyCheckinRange =
            ControlerWidgetDataStore.loadStorageSectionRange(context, "dailyCheckins", scope);
        root.put(
            "dailyCheckins",
            cloneJsonArray(dailyCheckinRange.optJSONArray("items"))
        );

        JSONObject planRange =
            ControlerWidgetDataStore.loadStorageSectionRange(context, "plans", scope);
        JSONArray mergedPlans = cloneJsonArray(planRange.optJSONArray("items"));
        JSONArray recurringPlans = cloneJsonArray(core.optJSONArray("recurringPlans"));
        for (int index = 0; index < recurringPlans.length(); index += 1) {
            mergedPlans.put(cloneJsonValue(recurringPlans.opt(index)));
        }
        root.put("plans", mergedPlans);

        return root;
    }

    public static void cancelAllScheduled(Context context) {
        if (context == null) {
            return;
        }

        synchronized (SCHEDULE_LOCK) {
            cancelAllScheduledInternal(context, true);
        }
    }

    private static void cancelAllScheduledInternal(Context context, boolean persistState) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            if (persistState) {
                persistScheduleState(context, new HashSet<String>(), null);
            }
            return;
        }

        Set<String> storedCodes = getStoredScheduledCodes(context);
        for (String codeText : storedCodes) {
            int requestCode = safeParseInt(codeText, -1);
            if (requestCode < 0) {
                continue;
            }

            PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    buildReminderIntent(context, requestCode),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        }

        if (persistState) {
            persistScheduleState(context, new HashSet<String>(), null);
        }
    }

    private static void applyReminderEntries(
        Context context,
        boolean notificationsEnabled,
        ArrayList<ReminderEntry> entries,
        JSONObject snapshot
    ) {
        cancelAllScheduledInternal(context, false);
        ensureNotificationChannel(context);

        ArrayList<ReminderEntry> safeEntries =
            entries == null ? new ArrayList<ReminderEntry>() : new ArrayList<ReminderEntry>(entries);

        if (!notificationsEnabled || safeEntries.isEmpty()) {
            persistScheduleState(context, new HashSet<String>(), snapshot);
            return;
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            persistScheduleState(context, new HashSet<String>(), snapshot);
            return;
        }

        Set<String> scheduledCodes = new HashSet<>();
        for (ReminderEntry entry : safeEntries) {
            Intent intent = buildReminderIntent(context, entry);
            PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                    context,
                    entry.requestCode,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
            if (pendingIntent == null) {
                continue;
            }

            scheduleReminderAlarm(context, alarmManager, entry, pendingIntent);

            scheduledCodes.add(String.valueOf(entry.requestCode));
        }

        persistScheduleState(context, scheduledCodes, snapshot);
    }

    private static Intent buildReminderIntent(Context context, ReminderEntry entry) {
        Intent intent = buildReminderIntent(context, entry.requestCode);
        intent.putExtra("notification_id", entry.requestCode);
        intent.putExtra("notification_title", entry.title);
        intent.putExtra("notification_message", entry.message);
        intent.putExtra("notification_color", entry.color);
        intent.putExtra("notification_type", entry.type);
        intent.putExtra("notification_item_id", entry.itemId);
        intent.putExtra("notification_occurrence_date", entry.occurrenceDateText);
        intent.putExtra("notification_reminder_at", entry.reminderAtMillis);
        return intent;
    }

    private static Intent buildReminderIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, ControlerNotificationReceiver.class);
        intent.setAction(ControlerNotificationReceiver.ACTION_SHOW_REMINDER);
        intent.putExtra("notification_id", requestCode);
        return intent;
    }

    private static Set<String> getStoredScheduledCodes(Context context) {
        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> stored = preferences.getStringSet(KEY_SCHEDULED_CODES, null);
        return stored == null ? new HashSet<String>() : new HashSet<String>(stored);
    }

    private static StoredScheduleSnapshot loadStoredScheduleSnapshot(Context context) {
        if (context == null) {
            return null;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String snapshotJson = preferences.getString(KEY_SCHEDULE_SNAPSHOT, "");
        if (TextUtils.isEmpty(snapshotJson)) {
            return null;
        }

        try {
            JSONObject snapshot = new JSONObject(snapshotJson);
            boolean notificationsEnabled = readNotificationsEnabled(snapshot, true);
            ArrayList<ReminderEntry> entries =
                parseStoredReminderEntries(snapshot.optJSONArray("entries"));
            return new StoredScheduleSnapshot(notificationsEnabled, entries);
        } catch (Exception error) {
            error.printStackTrace();
            return null;
        }
    }

    private static void persistScheduleState(
        Context context,
        Set<String> codes,
        JSONObject snapshot
    ) {
        if (context == null) {
            return;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String serialized = snapshot == null ? "" : snapshot.toString();
        SharedPreferences.Editor editor = preferences.edit();
        editor.putStringSet(
            KEY_SCHEDULED_CODES,
            new HashSet<String>(codes == null ? new HashSet<String>() : codes)
        );
        editor.putString(KEY_SCHEDULE_SNAPSHOT, serialized);
        editor.commit();
    }

    private static JSONObject buildStoredScheduleSnapshot(
        boolean notificationsEnabled,
        ArrayList<ReminderEntry> entries
    ) {
        JSONObject snapshot = new JSONObject();
        JSONArray serializedEntries = new JSONArray();
        ArrayList<ReminderEntry> safeEntries =
            entries == null ? new ArrayList<ReminderEntry>() : entries;
        try {
            snapshot.put("notificationsEnabled", notificationsEnabled);
            for (ReminderEntry entry : safeEntries) {
                if (entry == null) {
                    continue;
                }
                JSONObject item = new JSONObject();
                item.put("requestCode", entry.requestCode);
                item.put("type", entry.type);
                item.put("itemId", entry.itemId);
                item.put("occurrenceDate", entry.occurrenceDateText);
                item.put("reminderAt", entry.reminderAtMillis);
                item.put("title", entry.title);
                item.put("message", entry.message);
                item.put("color", entry.color);
                serializedEntries.put(item);
            }
            snapshot.put("entries", serializedEntries);
        } catch (Exception error) {
            error.printStackTrace();
        }
        return snapshot;
    }

    private static boolean readNotificationsEnabled(JSONObject root, boolean fallback) {
        if (root == null || !root.has("notificationsEnabled")) {
            return fallback;
        }

        Object value = root.opt("notificationsEnabled");
        if (value instanceof Boolean) {
            return ((Boolean) value).booleanValue();
        }
        if (value instanceof String) {
            String normalized = ((String) value).trim();
            if (TextUtils.isEmpty(normalized)) {
                return fallback;
            }
            return !"false".equalsIgnoreCase(normalized);
        }
        return fallback;
    }

    private static ArrayList<ReminderEntry> parseStoredReminderEntries(JSONArray items) {
        ArrayList<ReminderEntry> entries = new ArrayList<>();
        if (items == null) {
            return entries;
        }

        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) {
                continue;
            }
            long reminderAt = item.optLong("reminderAt", 0L);
            if (reminderAt <= 0L) {
                continue;
            }
            String type = normalizeReminderType(item.optString("type", ""));
            String occurrenceDateText = item.optString("occurrenceDate", "");
            if (TextUtils.isEmpty(type) || TextUtils.isEmpty(occurrenceDateText)) {
                continue;
            }
            int requestCode = item.optInt(
                "requestCode",
                buildStableRequestCode(type + ":" + item.optString("itemId", "") + ":" + occurrenceDateText + ":" + reminderAt)
            );
            entries.add(
                new ReminderEntry(
                    requestCode,
                    type,
                    item.optString("itemId", ""),
                    occurrenceDateText,
                    reminderAt,
                    item.optString("title", defaultTitleForType(type)),
                    item.optString("message", ""),
                    item.optInt("color", defaultColorForType(type))
                )
            );
        }

        return entries;
    }

    private static ArrayList<ReminderEntry> parseReminderEntries(JSONArray items) {
        ArrayList<ReminderEntry> entries = new ArrayList<>();
        if (items == null) {
            return entries;
        }

        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) {
                continue;
            }

            long reminderAt = item.optLong("reminderAt", 0L);
            if (reminderAt <= 0L) {
                continue;
            }

            JSONObject payload = item.optJSONObject("payload");
            String type = normalizeReminderType(
                firstNonEmpty(
                    item.optString("type", ""),
                    payload == null ? "" : payload.optString("itemType", "")
                )
            );
            String itemId = payload == null ? "" : payload.optString("itemId", "");
            String occurrenceDateText =
                payload == null ? "" : payload.optString("occurrenceDate", "");
            if (TextUtils.isEmpty(type) || TextUtils.isEmpty(occurrenceDateText)) {
                continue;
            }

            String key = item.optString("key", "");
            int requestCode =
                buildStableRequestCode(
                    TextUtils.isEmpty(key)
                        ? type + ":" + itemId + ":" + occurrenceDateText + ":" + reminderAt
                        : key
                );
            entries.add(
                new ReminderEntry(
                    requestCode,
                    type,
                    itemId,
                    occurrenceDateText,
                    reminderAt,
                    item.optString("title", defaultTitleForType(type)),
                    item.optString("message", ""),
                    parseColor(item.optString("color", ""), defaultColorTextForType(type))
                )
            );
        }

        return entries;
    }

    private static String normalizeReminderType(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim();
        if ("plan".equals(normalized) || "todo".equals(normalized) || "checkin".equals(normalized)) {
            return normalized;
        }
        return "";
    }

    private static String defaultTitleForType(String type) {
        if ("todo".equals(type)) {
            return "待办提醒";
        }
        if ("checkin".equals(type)) {
            return "打卡提醒";
        }
        return "计划提醒";
    }

    private static String defaultColorTextForType(String type) {
        if ("todo".equals(type)) {
            return "#ed8936";
        }
        if ("checkin".equals(type)) {
            return "#4299e1";
        }
        return "#79af85";
    }

    private static int defaultColorForType(String type) {
        return parseColor("", defaultColorTextForType(type));
    }

    private static boolean areNotificationsEnabled(JSONObject root) {
        if (root == null || !root.has("notifications")) {
            return true;
        }

        Object value = root.opt("notifications");
        if (value instanceof Boolean) {
            return ((Boolean) value).booleanValue();
        }
        if (value instanceof String) {
            return !"false".equalsIgnoreCase(((String) value).trim());
        }
        return true;
    }

    private static JSONArray cloneJsonArray(JSONArray source) {
        if (source == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(source.toString());
        } catch (Exception error) {
            error.printStackTrace();
            return new JSONArray();
        }
    }

    private static Object cloneJsonValue(Object value) {
        if (value == null || value == JSONObject.NULL) {
            return JSONObject.NULL;
        }
        if (value instanceof JSONObject) {
            try {
                return new JSONObject(value.toString());
            } catch (Exception error) {
                error.printStackTrace();
                return value;
            }
        }
        if (value instanceof JSONArray) {
            try {
                return new JSONArray(value.toString());
            } catch (Exception error) {
                error.printStackTrace();
                return value;
            }
        }
        return value;
    }

    public static boolean shouldDeliverReminder(
        Context context,
        String type,
        String itemId,
        String occurrenceDateText,
        long scheduledReminderAtMillis
    ) {
        if (context == null || TextUtils.isEmpty(type) || TextUtils.isEmpty(occurrenceDateText)) {
            return false;
        }

        try {
            StoredScheduleSnapshot storedSnapshot = loadStoredScheduleSnapshot(context);
            if (storedSnapshot != null) {
                if (!storedSnapshot.notificationsEnabled) {
                    return false;
                }
                return hasScheduledReminder(
                    storedSnapshot.entries,
                    type,
                    itemId,
                    occurrenceDateText,
                    scheduledReminderAtMillis
                );
            }

            JSONObject root = ControlerWidgetDataStore.loadRoot(context);
            if (!areNotificationsEnabled(root)) {
                return false;
            }

            if ("plan".equals(type)) {
                return shouldDeliverPlanReminder(
                    root.optJSONArray("plans"),
                    itemId,
                    occurrenceDateText,
                    scheduledReminderAtMillis
                );
            }
            if ("todo".equals(type)) {
                return shouldDeliverTodoReminder(
                    root.optJSONArray("todos"),
                    itemId,
                    occurrenceDateText,
                    scheduledReminderAtMillis
                );
            }
            if ("checkin".equals(type)) {
                return shouldDeliverCheckinReminder(
                    root.optJSONArray("checkinItems"),
                    root.optJSONArray("dailyCheckins"),
                    itemId,
                    occurrenceDateText,
                    scheduledReminderAtMillis
                );
            }
        } catch (Exception error) {
            error.printStackTrace();
        }

        return false;
    }

    private static boolean hasScheduledReminder(
        ArrayList<ReminderEntry> entries,
        String type,
        String itemId,
        String occurrenceDateText,
        long scheduledReminderAtMillis
    ) {
        if (entries == null || entries.isEmpty()) {
            return false;
        }

        String normalizedType = normalizeReminderType(type);
        for (ReminderEntry entry : entries) {
            if (entry == null) {
                continue;
            }
            if (!normalizedType.equals(entry.type)) {
                continue;
            }
            if (!String.valueOf(itemId).equals(entry.itemId)) {
                continue;
            }
            if (!occurrenceDateText.equals(entry.occurrenceDateText)) {
                continue;
            }
            if (scheduledReminderAtMillis > 0L && scheduledReminderAtMillis != entry.reminderAtMillis) {
                continue;
            }
            return true;
        }
        return false;
    }

    private static ArrayList<ReminderEntry> collectReminderEntries(JSONObject root, long nowMillis) {
        ArrayList<ReminderEntry> entries = new ArrayList<>();
        if (root == null) {
            return entries;
        }

        String scanStartDateText = toDateText(nowMillis, -MAX_CUSTOM_OFFSET_DAYS);
        String scanEndDateText = toDateText(nowMillis, HORIZON_DAYS + MAX_CUSTOM_OFFSET_DAYS);
        JSONArray dailyCheckins = root.optJSONArray("dailyCheckins");

        collectPlanEntries(
            entries,
            root.optJSONArray("plans"),
            scanStartDateText,
            scanEndDateText,
            nowMillis
        );
        collectTodoEntries(
            entries,
            root.optJSONArray("todos"),
            scanStartDateText,
            scanEndDateText,
            nowMillis
        );
        collectCheckinEntries(
            entries,
            root.optJSONArray("checkinItems"),
            dailyCheckins,
            scanStartDateText,
            scanEndDateText,
            nowMillis
        );

        return filterFutureReminderEntries(entries, nowMillis);
    }

    private static ArrayList<ReminderEntry> filterFutureReminderEntries(
        ArrayList<ReminderEntry> entries,
        long nowMillis
    ) {
        ArrayList<ReminderEntry> safeEntries =
            entries == null ? new ArrayList<ReminderEntry>() : new ArrayList<ReminderEntry>(entries);
        Collections.sort(
            safeEntries,
            new Comparator<ReminderEntry>() {
                @Override
                public int compare(ReminderEntry left, ReminderEntry right) {
                    return Long.compare(left.reminderAtMillis, right.reminderAtMillis);
                }
            }
        );

        ArrayList<ReminderEntry> filteredEntries = new ArrayList<>();
        for (ReminderEntry entry : safeEntries) {
            if (entry == null || entry.reminderAtMillis <= nowMillis + 1000L) {
                continue;
            }
            filteredEntries.add(entry);
            if (filteredEntries.size() >= MAX_ENTRIES) {
                break;
            }
        }

        return filteredEntries;
    }

    private static void collectPlanEntries(
        ArrayList<ReminderEntry> entries,
        JSONArray plans,
        String scanStartDateText,
        String scanEndDateText,
        long nowMillis
    ) {
        if (plans == null) {
            return;
        }

        for (int index = 0; index < plans.length(); index += 1) {
            JSONObject plan = plans.optJSONObject(index);
            if (plan == null || plan.optBoolean("isCompleted", false)) {
                continue;
            }

            ReminderConfig reminder = parsePlanReminder(plan);
            if (!reminder.enabled) {
                continue;
            }

            String occurrenceDateText = scanStartDateText;
            int loopGuard = 0;
            while (
                !TextUtils.isEmpty(occurrenceDateText) &&
                occurrenceDateText.compareTo(scanEndDateText) <= 0 &&
                loopGuard < MAX_SCAN_DAYS
            ) {
                if (planOccursOnDate(plan, occurrenceDateText)) {
                    Long reminderAt =
                        getPlanReminderAtMillis(plan, reminder, occurrenceDateText);
                    if (reminderAt != null && reminderAt.longValue() > nowMillis + 1000L) {
                        String planName = plan.optString("name", "未命名计划");
                        String startTime = sanitizeTime(plan.optString("startTime", "09:00"), "09:00");
                        entries.add(
                            new ReminderEntry(
                                buildStableRequestCode(
                                    "plan:" + plan.optString("id", "") + ":" + occurrenceDateText + ":" + reminderAt
                                ),
                                "plan",
                                plan.optString("id", ""),
                                occurrenceDateText,
                                reminderAt.longValue(),
                                "计划提醒",
                                planName + " 将于 " + occurrenceDateText + " " + startTime + " 开始",
                                parseColor(plan.optString("color", "#79af85"), "#79af85")
                            )
                        );
                    }
                }
                occurrenceDateText = shiftDateText(occurrenceDateText, 1);
                loopGuard += 1;
            }
        }
    }

    private static void collectTodoEntries(
        ArrayList<ReminderEntry> entries,
        JSONArray todos,
        String scanStartDateText,
        String scanEndDateText,
        long nowMillis
    ) {
        if (todos == null) {
            return;
        }

        for (int index = 0; index < todos.length(); index += 1) {
            JSONObject todo = todos.optJSONObject(index);
            if (todo == null || todo.optBoolean("completed", false)) {
                continue;
            }

            ReminderConfig reminder = parseTodoReminder(todo);
            if (!reminder.enabled) {
                continue;
            }

            String occurrenceDateText = scanStartDateText;
            int loopGuard = 0;
            while (
                !TextUtils.isEmpty(occurrenceDateText) &&
                occurrenceDateText.compareTo(scanEndDateText) <= 0 &&
                loopGuard < MAX_SCAN_DAYS
            ) {
                if (todoOccursOnDate(todo, occurrenceDateText)) {
                    Long reminderAt =
                        getTodoReminderAtMillis(todo, reminder, occurrenceDateText);
                    if (reminderAt != null && reminderAt.longValue() > nowMillis + 1000L) {
                        String todoTitle = todo.optString("title", "未命名待办");
                        entries.add(
                            new ReminderEntry(
                                buildStableRequestCode(
                                    "todo:" + todo.optString("id", "") + ":" + occurrenceDateText + ":" + reminderAt
                                ),
                                "todo",
                                todo.optString("id", ""),
                                occurrenceDateText,
                                reminderAt.longValue(),
                                "待办提醒",
                                todoTitle + " 计划于 " + occurrenceDateText + " 提醒你处理",
                                parseColor(todo.optString("color", "#ed8936"), "#ed8936")
                            )
                        );
                    }
                }
                occurrenceDateText = shiftDateText(occurrenceDateText, 1);
                loopGuard += 1;
            }
        }
    }

    private static void collectCheckinEntries(
        ArrayList<ReminderEntry> entries,
        JSONArray checkinItems,
        JSONArray dailyCheckins,
        String scanStartDateText,
        String scanEndDateText,
        long nowMillis
    ) {
        if (checkinItems == null) {
            return;
        }

        for (int index = 0; index < checkinItems.length(); index += 1) {
            JSONObject item = checkinItems.optJSONObject(index);
            if (item == null) {
                continue;
            }

            ReminderConfig reminder = parseCheckinReminder(item);
            if (!reminder.enabled) {
                continue;
            }

            String occurrenceDateText = scanStartDateText;
            int loopGuard = 0;
            while (
                !TextUtils.isEmpty(occurrenceDateText) &&
                occurrenceDateText.compareTo(scanEndDateText) <= 0 &&
                loopGuard < MAX_SCAN_DAYS
            ) {
                if (checkinOccursOnDate(item, occurrenceDateText)
                    && !hasCheckedCheckinOccurrence(dailyCheckins, item.optString("id", ""), occurrenceDateText)) {
                    Long reminderAt =
                        getCheckinReminderAtMillis(reminder, occurrenceDateText);
                    if (reminderAt != null && reminderAt.longValue() > nowMillis + 1000L) {
                        String title = item.optString("title", "未命名打卡");
                        entries.add(
                            new ReminderEntry(
                                buildStableRequestCode(
                                    "checkin:" + item.optString("id", "") + ":" + occurrenceDateText + ":" + reminderAt
                                ),
                                "checkin",
                                item.optString("id", ""),
                                occurrenceDateText,
                                reminderAt.longValue(),
                                "打卡提醒",
                                title + " 到时间了，记得完成今天的打卡",
                                parseColor(item.optString("color", "#4299e1"), "#4299e1")
                            )
                        );
                    }
                }
                occurrenceDateText = shiftDateText(occurrenceDateText, 1);
                loopGuard += 1;
            }
        }
    }

    private static ReminderConfig parsePlanReminder(JSONObject plan) {
        JSONObject reminder = plan.optJSONObject("notification");
        String mode = "none";
        if (reminder != null) {
            mode = reminder.optString("mode", "none");
            if (!"before_start".equals(mode) && !"custom".equals(mode) && !"none".equals(mode)) {
                if (reminder.has("minutesBefore")) {
                    mode = "before_start";
                } else if (!TextUtils.isEmpty(reminder.optString("customTime", ""))) {
                    mode = "custom";
                } else {
                    mode = "none";
                }
            }
        }
        boolean enabled = reminder != null && reminder.optBoolean("enabled", true) && !"none".equals(mode);
        return new ReminderConfig(
            enabled,
            mode,
            clampInt(
                reminder == null ? 15 : reminder.optInt("minutesBefore", 15),
                1,
                MAX_PLAN_BEFORE_MINUTES,
                15
            ),
            sanitizeTime(
                reminder == null
                    ? plan.optString("startTime", "09:00")
                    : reminder.optString("customTime", plan.optString("startTime", "09:00")),
                plan.optString("startTime", "09:00")
            ),
            clampInt(
                reminder == null ? 0 : reminder.optInt("customOffsetDays", 0),
                -MAX_CUSTOM_OFFSET_DAYS,
                MAX_CUSTOM_OFFSET_DAYS,
                0
            )
        );
    }

    private static ReminderConfig parseTodoReminder(JSONObject todo) {
        JSONObject reminder = todo.optJSONObject("notification");
        String mode = "none";
        if (reminder != null) {
            mode = reminder.optString("mode", "none");
            if (!"custom".equals(mode) && !"none".equals(mode)) {
                mode = !TextUtils.isEmpty(reminder.optString("customTime", "")) ? "custom" : "none";
            }
        }
        boolean enabled = reminder != null && reminder.optBoolean("enabled", true) && !"none".equals(mode);
        return new ReminderConfig(
            enabled,
            mode,
            0,
            sanitizeTime(reminder == null ? "09:00" : reminder.optString("customTime", "09:00"), "09:00"),
            clampInt(
                reminder == null ? 0 : reminder.optInt("customOffsetDays", 0),
                -MAX_CUSTOM_OFFSET_DAYS,
                MAX_CUSTOM_OFFSET_DAYS,
                0
            )
        );
    }

    private static ReminderConfig parseCheckinReminder(JSONObject item) {
        JSONObject reminder = item.optJSONObject("notification");
        String mode = "none";
        if (reminder != null) {
            mode = reminder.optString("mode", "none");
            if (!"custom".equals(mode) && !"none".equals(mode)) {
                mode = !TextUtils.isEmpty(reminder.optString("customTime", "")) ? "custom" : "none";
            }
        }
        boolean enabled = reminder != null && reminder.optBoolean("enabled", true) && !"none".equals(mode);
        return new ReminderConfig(
            enabled,
            mode,
            0,
            sanitizeTime(reminder == null ? "09:00" : reminder.optString("customTime", "09:00"), "09:00"),
            0
        );
    }

    private static boolean shouldDeliverPlanReminder(
        JSONArray plans,
        String itemId,
        String occurrenceDateText,
        long scheduledReminderAtMillis
    ) {
        JSONObject plan = findItemById(plans, itemId);
        if (plan == null || plan.optBoolean("isCompleted", false)) {
            return false;
        }
        if (!planOccursOnDate(plan, occurrenceDateText)) {
            return false;
        }

        ReminderConfig reminder = parsePlanReminder(plan);
        Long expectedReminderAt = getPlanReminderAtMillis(plan, reminder, occurrenceDateText);
        return matchesReminderSchedule(expectedReminderAt, scheduledReminderAtMillis);
    }

    private static boolean shouldDeliverTodoReminder(
        JSONArray todos,
        String itemId,
        String occurrenceDateText,
        long scheduledReminderAtMillis
    ) {
        JSONObject todo = findItemById(todos, itemId);
        if (todo == null || todo.optBoolean("completed", false)) {
            return false;
        }
        if (!todoOccursOnDate(todo, occurrenceDateText)) {
            return false;
        }

        ReminderConfig reminder = parseTodoReminder(todo);
        Long expectedReminderAt = getTodoReminderAtMillis(todo, reminder, occurrenceDateText);
        return matchesReminderSchedule(expectedReminderAt, scheduledReminderAtMillis);
    }

    private static boolean shouldDeliverCheckinReminder(
        JSONArray checkinItems,
        JSONArray dailyCheckins,
        String itemId,
        String occurrenceDateText,
        long scheduledReminderAtMillis
    ) {
        JSONObject item = findItemById(checkinItems, itemId);
        if (item == null) {
            return false;
        }
        if (!checkinOccursOnDate(item, occurrenceDateText)) {
            return false;
        }
        if (hasCheckedCheckinOccurrence(dailyCheckins, itemId, occurrenceDateText)) {
            return false;
        }

        ReminderConfig reminder = parseCheckinReminder(item);
        Long expectedReminderAt = getCheckinReminderAtMillis(reminder, occurrenceDateText);
        return matchesReminderSchedule(expectedReminderAt, scheduledReminderAtMillis);
    }

    private static boolean planOccursOnDate(JSONObject plan, String occurrenceDateText) {
        String startDateText = plan.optString("date", "");
        if (TextUtils.isEmpty(startDateText)) {
            return false;
        }
        JSONArray excludedDates = plan.optJSONArray("excludedDates");
        if (excludedDates != null) {
            for (int index = 0; index < excludedDates.length(); index += 1) {
                if (occurrenceDateText.equals(excludedDates.optString(index, ""))) {
                    return false;
                }
            }
        }
        if (occurrenceDateText.equals(startDateText)) {
            return true;
        }
        if (occurrenceDateText.compareTo(startDateText) < 0) {
            return false;
        }
        String endDateText = plan.optString("endDate", "");
        if (!TextUtils.isEmpty(endDateText) && occurrenceDateText.compareTo(endDateText) > 0) {
            return false;
        }

        String repeat = plan.optString("repeat", "none");
        if ("daily".equals(repeat)) {
            return true;
        }
        if ("weekly".equals(repeat)) {
            JSONArray repeatDays = plan.optJSONArray("repeatDays");
            int weekday = getWeekdayFromDateText(occurrenceDateText);
            if (repeatDays != null && repeatDays.length() > 0) {
                for (int index = 0; index < repeatDays.length(); index += 1) {
                    if (repeatDays.optInt(index, -1) == weekday) {
                        return true;
                    }
                }
                return false;
            }
            return getWeekdayFromDateText(startDateText) == weekday;
        }
        if ("monthly".equals(repeat)) {
            return getDayOfMonth(startDateText) == getDayOfMonth(occurrenceDateText);
        }
        return false;
    }

    private static boolean todoOccursOnDate(JSONObject todo, String occurrenceDateText) {
        if (todo.optBoolean("completed", false)) {
            return false;
        }
        String repeatType = todo.optString("repeatType", "none");
        if ("none".equals(repeatType)) {
            return occurrenceDateText.equals(todo.optString("dueDate", ""));
        }

        String startDateText = firstNonEmpty(todo.optString("startDate", ""), todo.optString("dueDate", ""));
        if (TextUtils.isEmpty(startDateText) || occurrenceDateText.compareTo(startDateText) < 0) {
            return false;
        }

        String endDateText = todo.optString("endDate", "");
        if (!TextUtils.isEmpty(endDateText) && occurrenceDateText.compareTo(endDateText) > 0) {
            return false;
        }

        if ("weekly".equals(repeatType)) {
            JSONArray repeatDays = todo.optJSONArray("repeatWeekdays");
            int weekday = getWeekdayFromDateText(occurrenceDateText);
            if (repeatDays != null && repeatDays.length() > 0) {
                for (int index = 0; index < repeatDays.length(); index += 1) {
                    if (repeatDays.optInt(index, -1) == weekday) {
                        return true;
                    }
                }
                return false;
            }
            return getWeekdayFromDateText(startDateText) == weekday;
        }

        return true;
    }

    private static boolean checkinOccursOnDate(JSONObject item, String occurrenceDateText) {
        String startDateText = firstNonEmpty(item.optString("startDate", ""), occurrenceDateText);
        if (occurrenceDateText.compareTo(startDateText) < 0) {
            return false;
        }
        String endDateText = item.optString("endDate", "");
        if (!TextUtils.isEmpty(endDateText) && occurrenceDateText.compareTo(endDateText) > 0) {
            return false;
        }

        String repeatType = item.optString("repeatType", "daily");
        if ("weekly".equals(repeatType)) {
            JSONArray repeatDays = item.optJSONArray("repeatWeekdays");
            int weekday = getWeekdayFromDateText(occurrenceDateText);
            if (repeatDays != null && repeatDays.length() > 0) {
                for (int index = 0; index < repeatDays.length(); index += 1) {
                    if (repeatDays.optInt(index, -1) == weekday) {
                        return true;
                    }
                }
                return false;
            }
            return getWeekdayFromDateText(startDateText) == weekday;
        }

        return true;
    }

    private static boolean hasCheckedCheckinOccurrence(
        JSONArray dailyCheckins,
        String itemId,
        String occurrenceDateText
    ) {
        if (dailyCheckins == null) {
            return false;
        }

        for (int index = 0; index < dailyCheckins.length(); index += 1) {
            JSONObject entry = dailyCheckins.optJSONObject(index);
            if (entry == null) {
                continue;
            }
            if (itemId.equals(entry.optString("itemId", ""))
                && occurrenceDateText.equals(entry.optString("date", ""))
                && entry.optBoolean("checked", false)) {
                return true;
            }
        }
        return false;
    }

    private static Long getPlanReminderAtMillis(
        JSONObject plan,
        ReminderConfig reminder,
        String occurrenceDateText
    ) {
        if (!reminder.enabled) {
            return null;
        }

        if ("before_start".equals(reminder.mode)) {
            Long startMillis = buildDateTimeMillis(
                occurrenceDateText,
                sanitizeTime(plan.optString("startTime", "09:00"), "09:00")
            );
            if (startMillis == null) {
                return null;
            }
            return Long.valueOf(startMillis.longValue() - reminder.minutesBefore * 60L * 1000L);
        }

        if ("custom".equals(reminder.mode)) {
            String reminderDateText = shiftDateText(occurrenceDateText, reminder.customOffsetDays);
            return buildDateTimeMillis(reminderDateText, reminder.customTime);
        }

        return null;
    }

    private static Long getTodoReminderAtMillis(
        JSONObject todo,
        ReminderConfig reminder,
        String occurrenceDateText
    ) {
        if (!reminder.enabled) {
            return null;
        }

        String reminderDateText = shiftDateText(occurrenceDateText, reminder.customOffsetDays);
        return buildDateTimeMillis(reminderDateText, reminder.customTime);
    }

    private static Long getCheckinReminderAtMillis(
        ReminderConfig reminder,
        String occurrenceDateText
    ) {
        if (!reminder.enabled) {
            return null;
        }
        return buildDateTimeMillis(occurrenceDateText, reminder.customTime);
    }

    private static JSONObject findItemById(JSONArray items, String itemId) {
        if (items == null || TextUtils.isEmpty(itemId)) {
            return null;
        }

        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item != null && itemId.equals(item.optString("id", ""))) {
                return item;
            }
        }

        return null;
    }

    private static boolean matchesReminderSchedule(
        Long expectedReminderAt,
        long scheduledReminderAtMillis
    ) {
        if (expectedReminderAt == null) {
            return false;
        }
        if (scheduledReminderAtMillis <= 0L) {
            return true;
        }
        return expectedReminderAt.longValue() == scheduledReminderAtMillis;
    }

    private static String toDateText(long baseMillis, int dayOffset) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(baseMillis);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        calendar.add(Calendar.DATE, dayOffset);
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static String shiftDateText(String dateText, int dayOffset) {
        Calendar calendar = parseDateText(dateText);
        if (calendar == null) {
            return "";
        }
        calendar.add(Calendar.DATE, dayOffset);
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static Calendar parseDateText(String dateText) {
        if (TextUtils.isEmpty(dateText) || dateText.length() != 10) {
            return null;
        }
        try {
            int year = Integer.parseInt(dateText.substring(0, 4));
            int month = Integer.parseInt(dateText.substring(5, 7)) - 1;
            int day = Integer.parseInt(dateText.substring(8, 10));
            Calendar calendar = Calendar.getInstance();
            calendar.setLenient(false);
            calendar.set(Calendar.YEAR, year);
            calendar.set(Calendar.MONTH, month);
            calendar.set(Calendar.DAY_OF_MONTH, day);
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            calendar.getTimeInMillis();
            return calendar;
        } catch (Exception error) {
            return null;
        }
    }

    private static Long buildDateTimeMillis(String dateText, String timeText) {
        Calendar dateCalendar = parseDateText(dateText);
        if (dateCalendar == null) {
            return null;
        }
        int[] timeParts = parseTimeText(timeText, "09:00");
        dateCalendar.set(Calendar.HOUR_OF_DAY, timeParts[0]);
        dateCalendar.set(Calendar.MINUTE, timeParts[1]);
        dateCalendar.set(Calendar.SECOND, 0);
        dateCalendar.set(Calendar.MILLISECOND, 0);
        return Long.valueOf(dateCalendar.getTimeInMillis());
    }

    private static int[] parseTimeText(String timeText, String fallback) {
        String safeText = sanitizeTime(timeText, fallback);
        return new int[] {
            safeParseInt(safeText.substring(0, 2), 9),
            safeParseInt(safeText.substring(3, 5), 0),
        };
    }

    private static String sanitizeTime(String timeText, String fallback) {
        String safeFallback = TextUtils.isEmpty(fallback) ? "09:00" : fallback;
        if (TextUtils.isEmpty(timeText) || !timeText.matches("^\\d{1,2}:\\d{2}$")) {
            return sanitizeTime(safeFallback, "09:00");
        }
        String[] parts = timeText.split(":");
        int hours = clampInt(safeParseInt(parts[0], 9), 0, 23, 9);
        int minutes = clampInt(safeParseInt(parts[1], 0), 0, 59, 0);
        return String.format(Locale.US, "%02d:%02d", hours, minutes);
    }

    private static int getWeekdayFromDateText(String dateText) {
        Calendar calendar = parseDateText(dateText);
        if (calendar == null) {
            return -1;
        }
        int dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK);
        return dayOfWeek == Calendar.SUNDAY ? 0 : dayOfWeek - 1;
    }

    private static int getDayOfMonth(String dateText) {
        Calendar calendar = parseDateText(dateText);
        return calendar == null ? -1 : calendar.get(Calendar.DAY_OF_MONTH);
    }

    private static String firstNonEmpty(String firstValue, String fallbackValue) {
        return TextUtils.isEmpty(firstValue) ? fallbackValue : firstValue;
    }

    private static int clampInt(int value, int min, int max, int fallback) {
        if (value < min || value > max) {
            return fallback;
        }
        return value;
    }

    private static int safeParseInt(String value, int fallback) {
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception error) {
            return fallback;
        }
    }

    private static int parseColor(String colorText, String fallbackColor) {
        try {
            return Color.parseColor(colorText);
        } catch (Exception error) {
            try {
                return Color.parseColor(fallbackColor);
            } catch (Exception ignored) {
                return Color.parseColor("#79af85");
            }
        }
    }

    private static void scheduleReminderAlarm(
        Context context,
        AlarmManager alarmManager,
        ReminderEntry entry,
        PendingIntent pendingIntent
    ) {
        if (context == null || alarmManager == null || entry == null || pendingIntent == null) {
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                alarmManager.setAlarmClock(
                    new AlarmManager.AlarmClockInfo(
                        entry.reminderAtMillis,
                        buildReminderShowIntent(context, entry)
                    ),
                    pendingIntent
                );
                return;
            }
        } catch (SecurityException error) {
            // Fall through to the lower-cost APIs when the OEM still rejects alarm-clock
            // alarms for this package state.
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    entry.reminderAtMillis,
                    pendingIntent
                );
                return;
            } catch (SecurityException error) {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    entry.reminderAtMillis,
                    pendingIntent
                );
                return;
            }
        }

        alarmManager.set(
            AlarmManager.RTC_WAKEUP,
            entry.reminderAtMillis,
            pendingIntent
        );
    }

    private static PendingIntent buildReminderShowIntent(Context context, ReminderEntry entry) {
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int requestCode = entry == null ? 0 : entry.requestCode;
        return PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int buildStableRequestCode(String key) {
        return key.hashCode() & 0x7fffffff;
    }

    private static final class StoredScheduleSnapshot {
        final boolean notificationsEnabled;
        final ArrayList<ReminderEntry> entries;

        StoredScheduleSnapshot(boolean notificationsEnabled, ArrayList<ReminderEntry> entries) {
            this.notificationsEnabled = notificationsEnabled;
            this.entries = entries == null ? new ArrayList<ReminderEntry>() : entries;
        }
    }

    private static final class ReminderConfig {
        final boolean enabled;
        final String mode;
        final int minutesBefore;
        final String customTime;
        final int customOffsetDays;

        ReminderConfig(
            boolean enabled,
            String mode,
            int minutesBefore,
            String customTime,
            int customOffsetDays
        ) {
            this.enabled = enabled;
            this.mode = mode;
            this.minutesBefore = minutesBefore;
            this.customTime = customTime;
            this.customOffsetDays = customOffsetDays;
        }
    }

    private static final class ReminderEntry {
        final int requestCode;
        final String type;
        final String itemId;
        final String occurrenceDateText;
        final long reminderAtMillis;
        final String title;
        final String message;
        final int color;

        ReminderEntry(
            int requestCode,
            String type,
            String itemId,
            String occurrenceDateText,
            long reminderAtMillis,
            String title,
            String message,
            int color
        ) {
            this.requestCode = requestCode;
            this.type = type;
            this.itemId = itemId;
            this.occurrenceDateText = occurrenceDateText;
            this.reminderAtMillis = reminderAtMillis;
            this.title = title;
            this.message = message;
            this.color = color;
        }
    }
}
