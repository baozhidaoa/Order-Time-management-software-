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

    private ControlerWidgetLaunchStore() {}

    public static void captureLaunchIntent(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        final String page = intent.getStringExtra("widgetPage");
        final String action = intent.getStringExtra("widgetAction");
        if (TextUtils.isEmpty(page) && TextUtils.isEmpty(action)) {
            return;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putString(KEY_PAGE, page == null ? "" : page)
            .putString(KEY_ACTION, action == null ? "" : action)
            .apply();
    }

    public static JSONObject consumeLaunchAction(Context context) throws Exception {
        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String page = preferences.getString(KEY_PAGE, "");
        String action = preferences.getString(KEY_ACTION, "");
        preferences.edit().remove(KEY_PAGE).remove(KEY_ACTION).apply();

        JSONObject result = new JSONObject();
        result.put("hasAction", !TextUtils.isEmpty(page) || !TextUtils.isEmpty(action));
        result.put("page", page == null ? "" : page);
        result.put("action", action == null ? "" : action);
        result.put("source", "android-widget");
        return result;
    }
}
