package com.controlerapp.widgets;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

public final class ControlerWidgetLastPageStore {
    private static final String PREFS_NAME = "controler_widget_last_page";
    private static final String KEY_LAST_VISIBLE_PAGE = "last_visible_page";

    private ControlerWidgetLastPageStore() {}

    public static String normalizePage(String pageKey) {
        String normalized = pageKey == null ? "" : pageKey.trim();
        if (
            "index".equals(normalized)
                || "stats".equals(normalized)
                || "plan".equals(normalized)
                || "diary".equals(normalized)
                || "settings".equals(normalized)
        ) {
            return normalized;
        }
        return "";
    }

    public static void setLastVisiblePage(Context context, String pageKey) {
        if (context == null) {
            return;
        }

        String normalizedPage = normalizePage(pageKey);
        if (TextUtils.isEmpty(normalizedPage)) {
            return;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        preferences.edit().putString(KEY_LAST_VISIBLE_PAGE, normalizedPage).apply();
    }

    public static String getLastVisiblePage(Context context) {
        if (context == null) {
            return "";
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return normalizePage(preferences.getString(KEY_LAST_VISIBLE_PAGE, ""));
    }
}
