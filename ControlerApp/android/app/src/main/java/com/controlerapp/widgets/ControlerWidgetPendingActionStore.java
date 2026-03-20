package com.controlerapp.widgets;

import android.appwidget.AppWidgetManager;
import android.text.TextUtils;

import java.util.HashMap;
import java.util.Map;

public final class ControlerWidgetPendingActionStore {
    public static final class PendingAction {
        public final String kind;
        public final String targetId;
        public final int appWidgetId;
        public final boolean todoCompleted;
        public final boolean checkinChecked;
        public final long createdAtMs;

        PendingAction(
            String kind,
            String targetId,
            int appWidgetId,
            boolean todoCompleted,
            boolean checkinChecked
        ) {
            this.kind = kind == null ? "" : kind;
            this.targetId = targetId == null ? "" : targetId;
            this.appWidgetId = appWidgetId;
            this.todoCompleted = todoCompleted;
            this.checkinChecked = checkinChecked;
            this.createdAtMs = System.currentTimeMillis();
        }
    }

    private static final Object LOCK = new Object();
    private static final Map<String, PendingAction> PENDING_ACTIONS = new HashMap<>();

    private ControlerWidgetPendingActionStore() {}

    public static boolean beginTodo(String targetId, int appWidgetId, boolean nextCompleted) {
        return putPendingAction(
            ControlerWidgetKinds.TODOS,
            targetId,
            appWidgetId,
            nextCompleted,
            false
        );
    }

    public static boolean beginCheckin(String targetId, int appWidgetId, boolean nextChecked) {
        return putPendingAction(
            ControlerWidgetKinds.CHECKINS,
            targetId,
            appWidgetId,
            false,
            nextChecked
        );
    }

    public static PendingAction get(String kind, String targetId, int appWidgetId) {
        synchronized (LOCK) {
            return PENDING_ACTIONS.get(buildKey(kind, targetId, appWidgetId));
        }
    }

    public static void clear(String kind, String targetId, int appWidgetId) {
        synchronized (LOCK) {
            PENDING_ACTIONS.remove(buildKey(kind, targetId, appWidgetId));
        }
    }

    private static boolean putPendingAction(
        String kind,
        String targetId,
        int appWidgetId,
        boolean todoCompleted,
        boolean checkinChecked
    ) {
        String key = buildKey(kind, targetId, appWidgetId);
        if (TextUtils.isEmpty(key)) {
            return false;
        }

        synchronized (LOCK) {
            if (PENDING_ACTIONS.containsKey(key)) {
                return false;
            }
            PENDING_ACTIONS.put(
                key,
                new PendingAction(kind, targetId, appWidgetId, todoCompleted, checkinChecked)
            );
        }
        return true;
    }

    private static String buildKey(String kind, String targetId, int appWidgetId) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        String normalizedTargetId = targetId == null ? "" : targetId.trim();
        if (TextUtils.isEmpty(normalizedKind) || TextUtils.isEmpty(normalizedTargetId)) {
          return "";
        }
        int normalizedWidgetId =
            appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID ? -1 : appWidgetId;
        return normalizedKind + "|" + normalizedTargetId + "|" + normalizedWidgetId;
    }
}
