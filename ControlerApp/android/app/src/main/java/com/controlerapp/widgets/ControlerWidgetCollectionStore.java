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
        public int titleColor = Color.parseColor("#EAF6ED");
        public int metaColor = Color.parseColor("#D2E4D7");
        public int actionTextColor = Color.parseColor("#FFFFFF");
        public boolean openEnabled = false;
        public boolean actionEnabled = true;
    }

    private ControlerWidgetCollectionStore() {}

    public static void saveRows(Context context, int appWidgetId, String kind, JSONArray rows) {
        if (context == null || appWidgetId <= 0) {
            return;
        }
        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putString(buildKey(appWidgetId, kind), rows == null ? "[]" : rows.toString())
            .commit();
    }

    public static List<RowData> loadRows(Context context, int appWidgetId, String kind) {
        ArrayList<RowData> rows = new ArrayList<>();
        if (context == null || appWidgetId <= 0) {
            return rows;
        }

        SharedPreferences preferences =
            context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = preferences.getString(buildKey(appWidgetId, kind), "[]");
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
                row.openEnabled = item.optBoolean("openEnabled", false);
                row.actionEnabled = item.optBoolean("actionEnabled", true);
                rows.add(row);
            }
        } catch (Exception ignored) {
            return rows;
        }
        return rows;
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

    private static String buildKey(int appWidgetId, String kind) {
        return KEY_PREFIX + appWidgetId + ":" + String.valueOf(kind == null ? "" : kind.trim());
    }
}
