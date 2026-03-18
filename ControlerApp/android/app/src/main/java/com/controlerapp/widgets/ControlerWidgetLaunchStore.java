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

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putString(KEY_PAGE, page == null ? "" : page)
            .putString(KEY_ACTION, action == null ? "" : action)
            .putString(KEY_KIND, kind == null ? "" : kind)
            .commit();
    }

    public static JSONObject consumeLaunchAction(Context context) throws Exception {
        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String page = preferences.getString(KEY_PAGE, "");
        String action = preferences.getString(KEY_ACTION, "");
        String kind = preferences.getString(KEY_KIND, "");
        preferences.edit().remove(KEY_PAGE).remove(KEY_ACTION).remove(KEY_KIND).commit();

        JSONObject result = new JSONObject();
        result.put(
            "hasAction",
            !TextUtils.isEmpty(page) || !TextUtils.isEmpty(action) || !TextUtils.isEmpty(kind)
        );
        result.put("page", page == null ? "" : page);
        result.put("action", action == null ? "" : action);
        result.put("widgetKind", kind == null ? "" : kind);
        result.put("source", "android-widget");
        return result;
    }
}
