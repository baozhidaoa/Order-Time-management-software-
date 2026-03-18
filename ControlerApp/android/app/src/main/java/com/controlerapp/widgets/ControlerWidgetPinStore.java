package com.controlerapp.widgets;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

public final class ControlerWidgetPinStore {
    private static final String PREFS_NAME = "controler_widget_pin_store";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_RESULTS = "results";
    private static final long PENDING_TIMEOUT_MS = 2L * 60L * 1000L;

    private ControlerWidgetPinStore() {}

    public static synchronized boolean isPending(Context context, String kind) {
        return getPendingRequestedAt(context, kind) > 0L;
    }

    public static synchronized long getPendingRequestedAt(Context context, String kind) {
        SharedPreferences preferences = getPreferences(context);
        JSONObject pending = pruneExpiredPending(readPending(preferences));
        persistPending(preferences, pending);
        return pending.optLong(kind, 0L);
    }

    public static synchronized void markPending(Context context, String kind, long requestedAt) {
        SharedPreferences preferences = getPreferences(context);
        JSONObject pending = pruneExpiredPending(readPending(preferences));
        JSONArray results = readResults(preferences);
        pending.remove(kind);
        putLongSafely(pending, kind, Math.max(requestedAt, 0L));
        persistPending(preferences, pending);
        persistResults(preferences, removeQueuedResultsForKind(results, kind));
    }

    public static synchronized void clearPending(Context context, String kind) {
        SharedPreferences preferences = getPreferences(context);
        JSONObject pending = pruneExpiredPending(readPending(preferences));
        pending.remove(kind);
        persistPending(preferences, pending);
    }

    public static synchronized void recordPinSuccess(
        Context context,
        String kind,
        int appWidgetId,
        long completedAt
    ) {
        SharedPreferences preferences = getPreferences(context);
        JSONObject pending = pruneExpiredPending(readPending(preferences));
        JSONArray results = readResults(preferences);
        long requestedAt = pending.optLong(kind, 0L);
        pending.remove(kind);

        JSONObject result = new JSONObject();
        putStringSafely(result, "kind", kind == null ? "" : kind);
        putLongSafely(result, "appWidgetId", appWidgetId);
        putLongSafely(result, "requestedAt", requestedAt);
        putLongSafely(result, "completedAt", Math.max(completedAt, 0L));
        results.put(result);

        persistPending(preferences, pending);
        persistResults(preferences, results);
    }

    public static synchronized JSONObject consumeResult(Context context) {
        SharedPreferences preferences = getPreferences(context);
        JSONObject pending = pruneExpiredPending(readPending(preferences));
        JSONArray results = readResults(preferences);
        persistPending(preferences, pending);

        JSONObject payload = new JSONObject();
        if (results.length() == 0) {
            putBooleanSafely(payload, "hasResult", false);
            return payload;
        }

        JSONObject entry = results.optJSONObject(0);
        JSONArray remaining = new JSONArray();
        for (int index = 1; index < results.length(); index++) {
            JSONObject next = results.optJSONObject(index);
            if (next != null) {
                remaining.put(next);
            }
        }
        persistResults(preferences, remaining);

        if (entry == null) {
            putBooleanSafely(payload, "hasResult", false);
            return payload;
        }

        putBooleanSafely(payload, "hasResult", true);
        putBooleanSafely(payload, "ok", true);
        putStringSafely(payload, "kind", entry.optString("kind", ""));
        putLongSafely(
            payload,
            "appWidgetId",
            entry.optInt("appWidgetId", AppWidgetManager.INVALID_APPWIDGET_ID)
        );
        putLongSafely(payload, "requestedAt", entry.optLong("requestedAt", 0L));
        putLongSafely(payload, "completedAt", entry.optLong("completedAt", 0L));
        putStringSafely(payload, "message", "已收到系统添加回执。");
        return payload;
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static JSONObject readPending(SharedPreferences preferences) {
        String raw = preferences.getString(KEY_PENDING, "");
        if (TextUtils.isEmpty(raw)) {
            return new JSONObject();
        }
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private static JSONArray readResults(SharedPreferences preferences) {
        String raw = preferences.getString(KEY_RESULTS, "");
        if (TextUtils.isEmpty(raw)) {
            return new JSONArray();
        }
        try {
            return new JSONArray(raw);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void persistPending(SharedPreferences preferences, JSONObject pending) {
        preferences.edit().putString(KEY_PENDING, pending.toString()).apply();
    }

    private static void persistResults(SharedPreferences preferences, JSONArray results) {
        preferences.edit().putString(KEY_RESULTS, results.toString()).apply();
    }

    private static JSONObject pruneExpiredPending(JSONObject pending) {
        JSONObject pruned = new JSONObject();
        long now = System.currentTimeMillis();
        JSONArray keys = pending.names();
        if (keys == null) {
            return pruned;
        }
        for (int index = 0; index < keys.length(); index++) {
            String key = keys.optString(index, "");
            if (TextUtils.isEmpty(key)) {
                continue;
            }
            long requestedAt = pending.optLong(key, 0L);
            if (requestedAt <= 0L) {
                continue;
            }
            if (now - requestedAt > PENDING_TIMEOUT_MS) {
                continue;
            }
            putLongSafely(pruned, key, requestedAt);
        }
        return pruned;
    }

    private static JSONArray removeQueuedResultsForKind(JSONArray results, String kind) {
        JSONArray filtered = new JSONArray();
        for (int index = 0; index < results.length(); index++) {
            JSONObject entry = results.optJSONObject(index);
            if (entry == null) {
                continue;
            }
            if (TextUtils.equals(kind, entry.optString("kind", ""))) {
                continue;
            }
            filtered.put(entry);
        }
        return filtered;
    }

    private static void putBooleanSafely(JSONObject object, String key, boolean value) {
        try {
            object.put(key, value);
        } catch (Exception ignored) {
        }
    }

    private static void putLongSafely(JSONObject object, String key, long value) {
        try {
            object.put(key, value);
        } catch (Exception ignored) {
        }
    }

    private static void putStringSafely(JSONObject object, String key, String value) {
        try {
            object.put(key, value == null ? "" : value);
        } catch (Exception ignored) {
        }
    }
}
