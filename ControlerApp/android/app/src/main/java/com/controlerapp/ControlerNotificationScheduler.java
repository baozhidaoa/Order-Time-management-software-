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
    private static final int HORIZON_DAYS = 60;
    private static final int MAX_CUSTOM_OFFSET_DAYS = 30;
    private static final int MAX_PLAN_BEFORE_MINUTES = 7 * 24 * 60;
    private static final int MAX_SCAN_DAYS = 190;
    private static final int MAX_ENTRIES = 180;

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

        try {
            rescheduleAll(context, ControlerWidgetDataStore.loadRoot(context));
        } catch (Exception error) {
            error.printStackTrace();
        }
    }

    public static void rescheduleAll(Context context, JSONObject root) {
        if (context == null) {
            return;
        }

        cancelAllScheduled(context);
        ensureNotificationChannel(context);

        if (!areNotificationsEnabled(root)) {
            persistScheduledCodes(context, new HashSet<String>());
            return;
        }

        ArrayList<ReminderEntry> entries = collectReminderEntries(root, System.currentTimeMillis());
        if (entries.isEmpty()) {
            persistScheduledCodes(context, new HashSet<String>());
            return;
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            return;
        }

        Set<String> scheduledCodes = new HashSet<>();
        for (ReminderEntry entry : entries) {
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    entry.reminderAtMillis,
                    pendingIntent
                );
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    entry.reminderAtMillis,
                    pendingIntent
                );
            } else {
                alarmManager.set(
                    AlarmManager.RTC_WAKEUP,
                    entry.reminderAtMillis,
                    pendingIntent
                );
            }

            scheduledCodes.add(String.valueOf(entry.requestCode));
        }

        persistScheduledCodes(context, scheduledCodes);
    }

    public static void cancelAllScheduled(Context context) {
        if (context == null) {
            return;
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            persistScheduledCodes(context, new HashSet<String>());
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

        persistScheduledCodes(context, new HashSet<String>());
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

    private static void persistScheduledCodes(Context context, Set<String> codes) {
        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences.edit().putStringSet(KEY_SCHEDULED_CODES, new HashSet<String>(codes)).apply();
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

        Collections.sort(
            entries,
            new Comparator<ReminderEntry>() {
                @Override
                public int compare(ReminderEntry left, ReminderEntry right) {
                    return Long.compare(left.reminderAtMillis, right.reminderAtMillis);
                }
            }
        );

        ArrayList<ReminderEntry> filteredEntries = new ArrayList<>();
        for (ReminderEntry entry : entries) {
            if (entry.reminderAtMillis <= nowMillis + 1000L) {
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

    private static int buildStableRequestCode(String key) {
        return key.hashCode() & 0x7fffffff;
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
