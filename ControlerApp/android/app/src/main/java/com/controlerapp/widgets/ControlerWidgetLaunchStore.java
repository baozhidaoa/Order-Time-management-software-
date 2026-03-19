package com.controlerapp.widgets;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.TextUtils;

import org.json.JSONObject;

public final class ControlerWidgetLaunchStore {
    private static final String PREFS_NAME = "controler_widget_bridge";
    private static final String KEY_PAGE = "launch_page";
    private static final String KEY_ACTION = "launch_action";
    private static final String KEY_KIND = "launch_kind";
    private static final Object MEMORY_LOCK = new Object();
    private static LaunchSnapshot pendingLaunchSnapshot = null;

    private static final class LaunchSnapshot {
        final String page;
        final String action;
        final String kind;

        LaunchSnapshot(String page, String action, String kind) {
            this.page = page == null ? "" : page;
            this.action = action == null ? "" : action;
            this.kind = kind == null ? "" : kind;
        }

        boolean hasAction() {
            return !TextUtils.isEmpty(page) || !TextUtils.isEmpty(action) || !TextUtils.isEmpty(kind);
        }
    }

    private ControlerWidgetLaunchStore() {}

    public static boolean hasLaunchAction(Intent intent) {
        if (intent == null) {
            return false;
        }

        final String page = intent.getStringExtra("widgetPage");
        final String action = intent.getStringExtra("widgetAction");
        final String kind = intent.getStringExtra("widgetKind");
        return !TextUtils.isEmpty(page) || !TextUtils.isEmpty(action) || !TextUtils.isEmpty(kind);
    }

    public static void captureLaunchIntent(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        final String page = intent.getStringExtra("widgetPage");
        final String action = intent.getStringExtra("widgetAction");
        final String kind = intent.getStringExtra("widgetKind");
        if (TextUtils.isEmpty(page) && TextUtils.isEmpty(action) && TextUtils.isEmpty(kind)) {
            return;
        }

        LaunchSnapshot snapshot = new LaunchSnapshot(page, action, kind);
        synchronized (MEMORY_LOCK) {
            pendingLaunchSnapshot = snapshot;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putString(KEY_PAGE, snapshot.page)
            .putString(KEY_ACTION, snapshot.action)
            .putString(KEY_KIND, snapshot.kind)
            .apply();
    }

    public static JSONObject consumeLaunchAction(Context context) throws Exception {
        LaunchSnapshot snapshot = null;
        synchronized (MEMORY_LOCK) {
            snapshot = pendingLaunchSnapshot;
            pendingLaunchSnapshot = null;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (snapshot == null || !snapshot.hasAction()) {
            snapshot = new LaunchSnapshot(
                preferences.getString(KEY_PAGE, ""),
                preferences.getString(KEY_ACTION, ""),
                preferences.getString(KEY_KIND, "")
            );
        }
        preferences.edit().remove(KEY_PAGE).remove(KEY_ACTION).remove(KEY_KIND).apply();

        JSONObject result = new JSONObject();
        result.put("hasAction", snapshot.hasAction());
        result.put("page", snapshot.page);
        result.put("action", snapshot.action);
        result.put("widgetKind", snapshot.kind);
        result.put("source", "android-widget");
        return result;
    }
}
