package com.controlerapp.widgets;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class ControlerWidgetCollectionStore {
    private static final String PREFS_NAME = "controler_widget_collection_rows";
    private static final String KEY_PREFIX = "rows:";

    public static final class RowData {
        public String title = "";
        public String meta = "";
        public String actionLabel = "";
        public String page = "";
        public String action = "";
        public String command = "";
        public String targetId = "";
        public int accentColor = Color.parseColor("#8ED6A4");
        public int backgroundColor = Color.parseColor("#20362B");
        public int outlineColor = Color.parseColor("#24FFFFFF");
        public int titleColor = Color.parseColor("#EAF6ED");
        public int metaColor = Color.parseColor("#D2E4D7");
        public int actionTextColor = Color.parseColor("#FFFFFF");
        public String badgeText = "";
        public int badgeColor = Color.parseColor("#ED8936");
        public int badgeTextColor = Color.parseColor("#FFFFFF");
        public boolean completed = false;
        public int completionFillColor = Color.TRANSPARENT;
        public int completionOutlineColor = Color.parseColor("#24FFFFFF");
        public int completionTextColor = Color.parseColor("#FFFFFF");
        public boolean openEnabled = false;
        public boolean actionEnabled = true;
        public boolean compactGoalStyle = false;
    }

    private ControlerWidgetCollectionStore() {}

    public static void saveRows(Context context, int appWidgetId, String kind, JSONArray rows) {
        saveRows(context, appWidgetId, kind, "", rows);
    }

    public static void saveRows(
        Context context,
        int appWidgetId,
        String kind,
        String slot,
        JSONArray rows
    ) {
        if (context == null || appWidgetId <= 0) {
            return;
        }
        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putString(buildKey(appWidgetId, kind, slot), rows == null ? "[]" : rows.toString())
            .commit();
    }

    public static List<RowData> loadRows(Context context, int appWidgetId, String kind) {
        return loadRows(context, appWidgetId, kind, "");
    }

    public static List<RowData> loadRows(Context context, int appWidgetId, String kind, String slot) {
        ArrayList<RowData> rows = new ArrayList<>();
        if (context == null || appWidgetId <= 0) {
            return rows;
        }

        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = preferences.getString(buildKey(appWidgetId, kind, slot), "[]");
        if (TextUtils.isEmpty(raw)) {
            return rows;
        }

        try {
            JSONArray items = new JSONArray(raw);
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.optJSONObject(index);
                if (item == null) {
                    continue;
                }
                RowData row = new RowData();
                row.title = item.optString("title", "").trim();
                row.meta = item.optString("meta", "").trim();
                row.actionLabel = item.optString("actionLabel", "").trim();
                row.page = item.optString("page", "").trim();
                row.action = item.optString("action", "").trim();
                row.command = item.optString("command", "").trim();
                row.targetId = item.optString("targetId", "").trim();
                row.accentColor = item.optInt(
                    "accentColor",
                    Color.parseColor("#8ED6A4")
                );
                row.backgroundColor = item.optInt(
                    "backgroundColor",
                    Color.parseColor("#20362B")
                );
                row.outlineColor = item.optInt(
                    "outlineColor",
                    Color.parseColor("#24FFFFFF")
                );
                row.titleColor = item.optInt(
                    "titleColor",
                    Color.parseColor("#EAF6ED")
                );
                row.metaColor = item.optInt(
                    "metaColor",
                    Color.parseColor("#D2E4D7")
                );
                row.actionTextColor = item.optInt(
                    "actionTextColor",
                    Color.parseColor("#FFFFFF")
                );
                row.badgeText = item.optString("badgeText", "").trim();
                row.badgeColor = item.optInt(
                    "badgeColor",
                    Color.parseColor("#ED8936")
                );
                row.badgeTextColor = item.optInt(
                    "badgeTextColor",
                    Color.parseColor("#FFFFFF")
                );
                row.completed = item.optBoolean("completed", false);
                row.completionFillColor = item.optInt(
                    "completionFillColor",
                    Color.TRANSPARENT
                );
                row.completionOutlineColor = item.optInt(
                    "completionOutlineColor",
                    Color.parseColor("#24FFFFFF")
                );
                row.completionTextColor = item.optInt(
                    "completionTextColor",
                    Color.parseColor("#FFFFFF")
                );
                row.openEnabled = item.optBoolean("openEnabled", false);
                row.actionEnabled = item.optBoolean("actionEnabled", true);
                row.compactGoalStyle = item.optBoolean("compactGoalStyle", false);
                rows.add(row);
            }
        } catch (Exception ignored) {
            return rows;
        }
        return rows;
    }

    public static Boolean peekTodoCompleted(Context context, int appWidgetId, String targetId) {
        return peekActionState(
            context,
            appWidgetId,
            ControlerWidgetKinds.TODOS,
            targetId,
            "已完成",
            "完成"
        );
    }

    public static Boolean peekCheckinChecked(Context context, int appWidgetId, String targetId) {
        return peekActionState(
            context,
            appWidgetId,
            ControlerWidgetKinds.CHECKINS,
            targetId,
            "已打卡",
            "打卡"
        );
    }

    public static boolean markRowPending(
        Context context,
        int appWidgetId,
        String kind,
        String targetId,
        String nextActionLabel
    ) {
        if (context == null || appWidgetId <= 0 || TextUtils.isEmpty(targetId)) {
            return false;
        }

        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return false;
        }

        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Map<String, ?> entries = preferences.getAll();
        if (entries == null || entries.isEmpty()) {
            return false;
        }

        SharedPreferences.Editor editor = preferences.edit();
        String keyPrefix = KEY_PREFIX + appWidgetId + ":" + normalizedKind;
        boolean updatedAny = false;
        for (Map.Entry<String, ?> entry : entries.entrySet()) {
            String key = entry.getKey();
            Object rawValue = entry.getValue();
            if (
                TextUtils.isEmpty(key)
                    || rawValue == null
                    || !key.startsWith(keyPrefix)
                    || !(rawValue instanceof String)
            ) {
                continue;
            }

            try {
                JSONArray rows = new JSONArray(String.valueOf(rawValue));
                boolean updated = false;
                for (int index = 0; index < rows.length(); index++) {
                    JSONObject row = rows.optJSONObject(index);
                    if (
                        row == null
                            || !TextUtils.equals(
                                targetId.trim(),
                                row.optString("targetId", "").trim()
                            )
                    ) {
                        continue;
                    }
                    String meta = row.optString("meta", "").trim();
                    if (TextUtils.isEmpty(meta)) {
                        row.put("meta", "同步中");
                    } else if (!meta.contains("同步中")) {
                        row.put("meta", meta + " · 同步中");
                    }
                    String normalizedNextActionLabel =
                        nextActionLabel == null ? "" : nextActionLabel.trim();
                    String currentActionLabel = row.optString("actionLabel", "").trim();
                    row.put(
                        "actionLabel",
                        TextUtils.isEmpty(normalizedNextActionLabel)
                            ? currentActionLabel
                            : normalizedNextActionLabel
                    );
                    row.put("actionEnabled", false);
                    updated = true;
                }
                if (!updated) {
                    continue;
                }
                editor.putString(key, rows.toString());
                updatedAny = true;
            } catch (Exception ignored) {
                // Keep the previous launcher cache if this row payload is malformed.
            }
        }

        if (!updatedAny) {
            return false;
        }
        return editor.commit();
    }

    public static void clearRows(Context context, int[] appWidgetIds) {
        if (context == null || appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }

        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Map<String, ?> entries = preferences.getAll();
        if (entries == null || entries.isEmpty()) {
            return;
        }

        SharedPreferences.Editor editor = preferences.edit();
        for (int appWidgetId : appWidgetIds) {
            String prefix = KEY_PREFIX + appWidgetId + ":";
            for (String key : entries.keySet()) {
                if (key != null && key.startsWith(prefix)) {
                    editor.remove(key);
                }
            }
        }
        editor.apply();
    }

    private static String buildKey(int appWidgetId, String kind, String slot) {
        String safeKind = String.valueOf(kind == null ? "" : kind.trim());
        String safeSlot = String.valueOf(slot == null ? "" : slot.trim());
        if (TextUtils.isEmpty(safeSlot)) {
            return KEY_PREFIX + appWidgetId + ":" + safeKind;
        }
        return KEY_PREFIX + appWidgetId + ":" + safeKind + ":" + safeSlot;
    }

    private static Boolean peekActionState(
        Context context,
        int appWidgetId,
        String kind,
        String targetId,
        String activeActionLabel,
        String inactiveActionLabel
    ) {
        if (context == null || appWidgetId <= 0 || TextUtils.isEmpty(targetId)) {
            return null;
        }

        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return null;
        }

        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Map<String, ?> entries = preferences.getAll();
        if (entries == null || entries.isEmpty()) {
            return null;
        }

        String keyPrefix = KEY_PREFIX + appWidgetId + ":" + normalizedKind;
        for (Map.Entry<String, ?> entry : entries.entrySet()) {
            String key = entry.getKey();
            Object rawValue = entry.getValue();
            if (
                TextUtils.isEmpty(key)
                    || rawValue == null
                    || !key.startsWith(keyPrefix)
                    || !(rawValue instanceof String)
            ) {
                continue;
            }

            try {
                JSONArray rows = new JSONArray(String.valueOf(rawValue));
                for (int index = 0; index < rows.length(); index++) {
                    JSONObject row = rows.optJSONObject(index);
                    if (
                        row == null
                            || !TextUtils.equals(
                                targetId.trim(),
                                row.optString("targetId", "").trim()
                            )
                    ) {
                        continue;
                    }
                    String actionLabel = row.optString("actionLabel", "").trim();
                    if (TextUtils.equals(activeActionLabel, actionLabel)) {
                        return true;
                    }
                    if (TextUtils.equals(inactiveActionLabel, actionLabel)) {
                        return false;
                    }
                }
            } catch (Exception ignored) {
                // Ignore malformed launcher cache rows and fall back to storage probing.
            }
        }
        return null;
    }
}
