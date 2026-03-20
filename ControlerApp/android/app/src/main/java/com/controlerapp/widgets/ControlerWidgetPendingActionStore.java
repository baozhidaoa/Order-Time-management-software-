package com.controlerapp.widgets;

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
        public boolean pending;
        public long expiresAtMs;

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
            this.pending = true;
            this.expiresAtMs = 0L;
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
            String key = buildKey(kind, targetId, appWidgetId);
            pruneExpiredLocked(key);
            return PENDING_ACTIONS.get(key);
        }
    }

    public static void clear(String kind, String targetId, int appWidgetId) {
        synchronized (LOCK) {
            PENDING_ACTIONS.remove(buildKey(kind, targetId, appWidgetId));
        }
    }

    public static void complete(
        String kind,
        String targetId,
        int appWidgetId,
        long cooldownMs
    ) {
        String key = buildKey(kind, targetId, appWidgetId);
        if (TextUtils.isEmpty(key)) {
            return;
        }
        synchronized (LOCK) {
            PendingAction action = PENDING_ACTIONS.get(key);
            if (action == null) {
                return;
            }
            action.pending = false;
            action.expiresAtMs =
                System.currentTimeMillis() + Math.max(0L, cooldownMs);
            if (action.expiresAtMs <= System.currentTimeMillis()) {
                PENDING_ACTIONS.remove(key);
            }
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
            pruneExpiredLocked(key);
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
        return normalizedKind + "|" + normalizedTargetId;
    }

    private static void pruneExpiredLocked(String key) {
        if (TextUtils.isEmpty(key)) {
            return;
        }
        PendingAction action = PENDING_ACTIONS.get(key);
        if (action == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (!action.pending && action.expiresAtMs > 0L && action.expiresAtMs <= now) {
            PENDING_ACTIONS.remove(key);
        }
    }
}
