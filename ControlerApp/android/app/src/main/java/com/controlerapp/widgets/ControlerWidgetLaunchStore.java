package com.controlerapp.widgets;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.TextUtils;

import org.json.JSONObject;

public final class ControlerWidgetLaunchStore {
    public static final String EXTRA_PAGE = "widgetPage";
    public static final String EXTRA_ACTION = "widgetAction";
    public static final String EXTRA_KIND = "widgetKind";
    public static final String EXTRA_TARGET_ID = "widgetTargetId";
    public static final String EXTRA_LAUNCH_ID = "widgetLaunchId";
    public static final String EXTRA_CREATED_AT = "widgetCreatedAt";

    private static final String PREFS_NAME = "controler_widget_bridge";
    private static final String KEY_PAGE = "launch_page";
    private static final String KEY_ACTION = "launch_action";
    private static final String KEY_KIND = "launch_kind";
    private static final String KEY_TARGET_ID = "launch_target_id";
    private static final String KEY_LAUNCH_ID = "launch_id";
    private static final String KEY_CREATED_AT = "launch_created_at";
    private static final Object MEMORY_LOCK = new Object();
    private static LaunchSnapshot pendingLaunchSnapshot = null;

    private static final class LaunchSnapshot {
        final String page;
        final String action;
        final String kind;
        final String targetId;
        final String launchId;
        final long createdAt;

        LaunchSnapshot(
            String page,
            String action,
            String kind,
            String targetId,
            String launchId,
            long createdAt
        ) {
            this.page = page == null ? "" : page.trim();
            this.action = action == null ? "" : action.trim();
            this.kind = kind == null ? "" : kind.trim();
            this.targetId = targetId == null ? "" : targetId.trim();
            this.launchId = launchId == null ? "" : launchId.trim();
            this.createdAt = Math.max(0L, createdAt);
        }

        boolean hasAction() {
            return !TextUtils.isEmpty(page)
                || !TextUtils.isEmpty(action)
                || !TextUtils.isEmpty(kind)
                || !TextUtils.isEmpty(targetId)
                || !TextUtils.isEmpty(launchId)
                || createdAt > 0L;
        }

        LaunchSnapshot ensureIdentifiers() {
            if (!hasAction()) {
                return this;
            }
            String nextLaunchId =
                TextUtils.isEmpty(launchId) ? generateLaunchId() : launchId;
            long nextCreatedAt = createdAt > 0L ? createdAt : System.currentTimeMillis();
            return new LaunchSnapshot(page, action, kind, targetId, nextLaunchId, nextCreatedAt);
        }
    }

    private ControlerWidgetLaunchStore() {}

    public static boolean hasLaunchAction(Intent intent) {
        if (intent == null) {
            return false;
        }

        final String page = intent.getStringExtra(EXTRA_PAGE);
        final String action = intent.getStringExtra(EXTRA_ACTION);
        final String kind = intent.getStringExtra(EXTRA_KIND);
        final String targetId = intent.getStringExtra(EXTRA_TARGET_ID);
        final String launchId = intent.getStringExtra(EXTRA_LAUNCH_ID);
        final long createdAt = readCreatedAt(intent);
        return !TextUtils.isEmpty(page)
            || !TextUtils.isEmpty(action)
            || !TextUtils.isEmpty(kind)
            || !TextUtils.isEmpty(targetId)
            || !TextUtils.isEmpty(launchId)
            || createdAt > 0L;
    }

    public static void captureLaunchIntent(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        LaunchSnapshot snapshot = new LaunchSnapshot(
            intent.getStringExtra(EXTRA_PAGE),
            intent.getStringExtra(EXTRA_ACTION),
            intent.getStringExtra(EXTRA_KIND),
            intent.getStringExtra(EXTRA_TARGET_ID),
            intent.getStringExtra(EXTRA_LAUNCH_ID),
            readCreatedAt(intent)
        ).ensureIdentifiers();
        if (!snapshot.hasAction()) {
            return;
        }
        intent.putExtra(EXTRA_PAGE, snapshot.page);
        intent.putExtra(EXTRA_ACTION, snapshot.action);
        intent.putExtra(EXTRA_KIND, snapshot.kind);
        intent.putExtra(EXTRA_TARGET_ID, snapshot.targetId);
        intent.putExtra(EXTRA_LAUNCH_ID, snapshot.launchId);
        intent.putExtra(EXTRA_CREATED_AT, snapshot.createdAt);

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
            .putString(KEY_TARGET_ID, snapshot.targetId)
            .putString(KEY_LAUNCH_ID, snapshot.launchId)
            .putLong(KEY_CREATED_AT, snapshot.createdAt)
            .apply();
    }

    public static JSONObject consumeLaunchAction(Context context) throws Exception {
        LaunchSnapshot snapshot;
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
                preferences.getString(KEY_KIND, ""),
                preferences.getString(KEY_TARGET_ID, ""),
                preferences.getString(KEY_LAUNCH_ID, ""),
                preferences.getLong(KEY_CREATED_AT, 0L)
            );
        }
        snapshot = snapshot.ensureIdentifiers();
        preferences
            .edit()
            .remove(KEY_PAGE)
            .remove(KEY_ACTION)
            .remove(KEY_KIND)
            .remove(KEY_TARGET_ID)
            .remove(KEY_LAUNCH_ID)
            .remove(KEY_CREATED_AT)
            .apply();

        JSONObject result = new JSONObject();
        result.put("hasAction", snapshot.hasAction());
        result.put("page", snapshot.page);
        result.put("action", snapshot.action);
        result.put("widgetKind", snapshot.kind);
        result.put("targetId", snapshot.targetId);
        result.put("launchId", snapshot.launchId);
        result.put("createdAt", snapshot.createdAt);
        result.put("source", "android-widget");
        return result;
    }

    public static void clearMatchingLaunchAction(
        Context context,
        String action,
        String kind
    ) {
        if (context == null) {
            return;
        }

        String normalizedAction = action == null ? "" : action.trim();
        String normalizedKind = kind == null ? "" : kind.trim();
        LaunchSnapshot snapshot;
        synchronized (MEMORY_LOCK) {
            snapshot = pendingLaunchSnapshot;
        }

        SharedPreferences preferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (snapshot == null || !snapshot.hasAction()) {
            snapshot = new LaunchSnapshot(
                preferences.getString(KEY_PAGE, ""),
                preferences.getString(KEY_ACTION, ""),
                preferences.getString(KEY_KIND, ""),
                preferences.getString(KEY_TARGET_ID, ""),
                preferences.getString(KEY_LAUNCH_ID, ""),
                preferences.getLong(KEY_CREATED_AT, 0L)
            );
        }

        if (!snapshot.hasAction()) {
            return;
        }
        if (
            !TextUtils.isEmpty(normalizedAction)
                && !normalizedAction.equals(snapshot.action)
        ) {
            return;
        }
        if (
            !TextUtils.isEmpty(normalizedKind)
                && !normalizedKind.equals(snapshot.kind)
        ) {
            return;
        }

        clearLaunchAction(preferences);
    }

    private static void clearLaunchAction(SharedPreferences preferences) {
        synchronized (MEMORY_LOCK) {
            pendingLaunchSnapshot = null;
        }
        if (preferences == null) {
            return;
        }
        preferences
            .edit()
            .remove(KEY_PAGE)
            .remove(KEY_ACTION)
            .remove(KEY_KIND)
            .remove(KEY_TARGET_ID)
            .remove(KEY_LAUNCH_ID)
            .remove(KEY_CREATED_AT)
            .apply();
    }

    private static long readCreatedAt(Intent intent) {
        if (intent == null) {
            return 0L;
        }
        try {
            long createdAt = intent.getLongExtra(EXTRA_CREATED_AT, 0L);
            if (createdAt > 0L) {
                return createdAt;
            }
            String rawValue = intent.getStringExtra(EXTRA_CREATED_AT);
            if (!TextUtils.isEmpty(rawValue)) {
                return Long.parseLong(rawValue.trim());
            }
        } catch (Exception ignored) {
            return 0L;
        }
        return 0L;
    }

    private static String generateLaunchId() {
        return "widget_"
            + Long.toString(System.currentTimeMillis(), 36)
            + "_"
            + Integer.toHexString((int) (Math.random() * 0x7fffffff));
    }
}
