package com.controlerapp.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.text.TextUtils;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.controlerapp.ControlerStartupTrace;
import com.controlerapp.MainActivity;
import com.controlerapp.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ControlerWidgetRenderer {
    private static final String OPEN_WIDGET_ACTION_PREFIX =
        "com.controler.timetracker.action.OPEN_WIDGET_TARGET";
    private static final int SIZE_COMPACT = 0;
    private static final int SIZE_MEDIUM = 1;
    private static final int SIZE_LARGE = 2;
    private static final int MAX_WIDGET_ITEM_CARD_COUNT = 5;
    private static final Pattern RGB_PATTERN = Pattern.compile(
        "rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})(?:\\s*,\\s*([\\d.]+))?\\s*\\)"
    );
    private static final long DEBOUNCED_REFRESH_DELAY_MS = 120L;
    private static final long SAME_KIND_REFRESH_DELAY_MS = 90L;
    private static final long AFFECTED_REFRESH_DELAY_MS = 320L;
    private static final long THEME_REFRESH_DELAY_MS = 1200L;
    private static final long DEFERRED_PREVIEW_REFRESH_DELAY_MS = 100L;
    private static final String PREVIEW_SIGNATURE_NONE = "preview:none";
    private static final int CARD_BACKGROUND_CACHE_BYTES = 4 * 1024 * 1024;
    private static final int PREVIEW_BITMAP_CACHE_BYTES = 8 * 1024 * 1024;
    private static final long RENDER_SOURCE_CACHE_TTL_MS = 260L;
    private static final Object REFRESH_LOCK = new Object();
    private static final Object RENDER_STATE_LOCK = new Object();
    private static final HandlerThread REFRESH_THREAD = createRefreshThread();
    private static final Handler REFRESH_HANDLER = new Handler(REFRESH_THREAD.getLooper());
    private static final Map<Integer, String> LAST_RENDER_KEYS = new HashMap<>();
    private static long lastRenderSourceLoadedAtMs = 0L;
    private static RenderSource lastRenderSource = null;
    private static final LruCache<String, Bitmap> CARD_BACKGROUND_CACHE =
        new LruCache<String, Bitmap>(CARD_BACKGROUND_CACHE_BYTES) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return bitmapSizeOf(value);
            }
        };
    private static final LruCache<String, Bitmap> PREVIEW_BITMAP_CACHE =
        new LruCache<String, Bitmap>(PREVIEW_BITMAP_CACHE_BYTES) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return bitmapSizeOf(value);
            }
        };
    private static Runnable pendingRefreshRunnable = null;
    private static Runnable pendingSameKindRefreshRunnable = null;
    private static Runnable pendingAffectedRefreshRunnable = null;
    private static Runnable pendingThemeRefreshRunnable = null;
    private static RefreshBatch pendingImmediateBatch = new RefreshBatch();
    private static RefreshBatch pendingSameKindBatch = new RefreshBatch();
    private static RefreshBatch pendingAffectedBatch = new RefreshBatch();
    private static RefreshBatch pendingThemeBatch = new RefreshBatch();

    private ControlerWidgetRenderer() {}

    private static HandlerThread createRefreshThread() {
        HandlerThread thread = new HandlerThread("ControlerWidgetRefresh");
        thread.start();
        return thread;
    }

    private static final class WidgetContent {
        String title = "Order 小组件";
        String subtitle = "";
        String page = "index";
        String action = "";
        String actionLabel = "打开应用";
        String directCommand = "";
        String directTargetId = "";
        String statPrimary = "";
        String statSecondary = "";
        String contentSignature = "";
        String actionSignature = "";
        String previewSignature = PREVIEW_SIGNATURE_NONE;
        Bitmap previewBitmap = null;
        boolean actionOnly = false;
        final List<String> lines = new ArrayList<>();
        final List<WidgetItemCard> itemCards = new ArrayList<>();
    }

    private static final class WidgetItemCard {
        String title = "";
        String meta = "";
        String actionLabel = "";
        String command = "";
        String targetId = "";
        int accentColor = Color.parseColor("#8ED6A4");
        boolean pending = false;
        boolean actionDisabled = false;
    }

    private static final class ThemePalette {
        int backgroundColor = Color.parseColor("#243B2B");
        int surfaceColor = Color.parseColor("#20362B");
        int borderColor = Color.parseColor("#5F7D6A");
        int titleColor = Color.parseColor("#F2FFF5");
        int subtitleColor = Color.parseColor("#D2E4D7");
        int bodyColor = Color.parseColor("#EAF6ED");
        int actionTextColor = Color.parseColor("#FFFFFF");
        int accentColor = Color.parseColor("#8ED6A4");
        int accentTextColor = Color.parseColor("#173326");
        int contrastReferenceColor = Color.WHITE;
        int cardFillColor = Color.parseColor("#20362B");
        int cardBorderColor = Color.parseColor("#5F7D6A");
        int cardGlossColor = Color.argb(18, 255, 255, 255);
        boolean surfaceIsLight = false;
    }

    private static final class WidgetMetrics {
        int sizeClass = SIZE_MEDIUM;
        int minWidthDp = 0;
        int minHeightDp = 0;
        float scale = 1f;
    }

    private static final class PreviewSegment {
        String label = "";
        String detail = "";
        int color = Color.parseColor("#8ED6A4");
        int startMinutes = 0;
        int endMinutes = 0;
    }

    private static final class PreviewDayRow {
        String label = "";
        boolean today = false;
        final List<PreviewSegment> segments = new ArrayList<>();
    }

    private static final class PreviewLegendEntry {
        String label = "";
        int minutes = 0;
        int color = Color.parseColor("#8ED6A4");
    }

    private static final class PreviewTimeRange {
        long startMs = 0L;
        long endMs = 0L;
    }

    private static final class RenderSource {
        JSONObject root = null;
        ThemePalette palette = new ThemePalette();
        ControlerWidgetDataStore.State state = new ControlerWidgetDataStore.State();
    }

    private static final class PendingWidgetUpdate {
        final int appWidgetId;
        final WidgetMetrics metrics;
        final String renderKey;
        final boolean deferPreview;
        final WidgetContent content;

        PendingWidgetUpdate(
            int appWidgetId,
            WidgetMetrics metrics,
            String renderKey,
            boolean deferPreview,
            WidgetContent content
        ) {
            this.appWidgetId = appWidgetId;
            this.metrics = metrics;
            this.renderKey = renderKey == null ? "" : renderKey;
            this.deferPreview = deferPreview;
            this.content = content;
        }
    }

    private static final class RefreshRequest {
        final Set<String> changedSections = new HashSet<>();
        String widgetKindHint = "";
        int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
        String source = "";
        boolean requestAll = false;
        boolean themeRefresh = false;
    }

    private static final class RefreshBatch {
        final Set<String> kinds = new HashSet<>();
        final Set<Integer> widgetIds = new HashSet<>();
        boolean refreshAll = false;
        String reason = "";

        void merge(RefreshBatch incoming) {
            if (incoming == null) {
                return;
            }
            refreshAll = refreshAll || incoming.refreshAll;
            kinds.addAll(incoming.kinds);
            widgetIds.addAll(incoming.widgetIds);
            if (TextUtils.isEmpty(reason) && !TextUtils.isEmpty(incoming.reason)) {
                reason = incoming.reason;
            }
        }
    }

    private static final class RecordSummaryAccumulator {
        String title = "";
        int accentColor = Color.parseColor("#8ED6A4");
        int totalMinutes = 0;
        final Map<String, Integer> dayMinutes = new HashMap<>();
    }

    private static final class PlanSummaryAccumulator {
        String title = "";
        int accentColor = Color.parseColor("#79AF85");
        int totalMinutes = 0;
        int planCount = 0;
        final Map<String, Integer> dayMinutes = new HashMap<>();
    }

    private static final class SignatureAccumulator {
        private static final long FNV_OFFSET = 0xcbf29ce484222325L;
        private static final long FNV_PRIME = 0x100000001b3L;
        private long value = FNV_OFFSET;

        void addString(String text) {
            String safeText = text == null ? "" : text;
            addInt(safeText.length());
            for (int index = 0; index < safeText.length(); index++) {
                value ^= safeText.charAt(index);
                value *= FNV_PRIME;
            }
        }

        void addInt(int number) {
            value ^= number;
            value *= FNV_PRIME;
        }

        void addBoolean(boolean enabled) {
            addInt(enabled ? 1 : 0);
        }

        String finish() {
            return Long.toHexString(value);
        }
    }

    public static void scheduleRefreshAll(Context context) {
        if (context == null) {
            return;
        }

        RefreshBatch batch = new RefreshBatch();
        batch.refreshAll = true;
        batch.reason = "refresh-all";
        scheduleRefreshBatch(
            context.getApplicationContext(),
            batch,
            DEBOUNCED_REFRESH_DELAY_MS,
            "full"
        );
    }

    public static void scheduleRefresh(Context context, JSONObject payload) {
        if (context == null) {
            return;
        }

        RefreshRequest request = parseRefreshRequest(payload);
        if (request.requestAll) {
            scheduleRefreshAll(context);
            return;
        }

        Set<String> affectedKinds =
            request.changedSections.isEmpty()
                ? new HashSet<String>()
                : resolveKindsForSections(request.changedSections);
        if (affectedKinds.isEmpty() && request.appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            String normalizedHint = ControlerWidgetKinds.normalize(request.widgetKindHint);
            if (TextUtils.isEmpty(normalizedHint)) {
                return;
            }
            affectedKinds.add(normalizedHint);
        }

        String normalizedHint = ControlerWidgetKinds.normalize(request.widgetKindHint);
        if (
            request.appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
                || !TextUtils.isEmpty(normalizedHint)
        ) {
            RefreshBatch immediateBatch = new RefreshBatch();
            immediateBatch.reason = "immediate";
            if (!TextUtils.isEmpty(normalizedHint)) {
                immediateBatch.kinds.add(normalizedHint);
            }
            if (request.appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                immediateBatch.widgetIds.add(request.appWidgetId);
            }
            scheduleRefreshBatch(
                context.getApplicationContext(),
                immediateBatch,
                0L,
                "full"
            );
        }

        if (!TextUtils.isEmpty(normalizedHint) && affectedKinds.contains(normalizedHint)) {
            RefreshBatch sameKindBatch = new RefreshBatch();
            sameKindBatch.reason = "same-kind";
            sameKindBatch.kinds.add(normalizedHint);
            scheduleRefreshBatch(
                context.getApplicationContext(),
                sameKindBatch,
                SAME_KIND_REFRESH_DELAY_MS,
                "same-kind"
            );
            affectedKinds.remove(normalizedHint);
        }

        RefreshBatch affectedBatch = new RefreshBatch();
        affectedBatch.reason = request.themeRefresh ? "theme" : "affected";
        affectedBatch.kinds.addAll(affectedKinds);
        if (request.themeRefresh) {
            scheduleRefreshBatch(
                context.getApplicationContext(),
                affectedBatch,
                THEME_REFRESH_DELAY_MS,
                "theme"
            );
        } else if (!affectedBatch.kinds.isEmpty()) {
            scheduleRefreshBatch(
                context.getApplicationContext(),
                affectedBatch,
                AFFECTED_REFRESH_DELAY_MS,
                "affected"
            );
        }
    }

    public static void refreshAll(Context context) {
        if (context == null) {
            return;
        }

        cancelPendingRefresh();
        RefreshBatch batch = new RefreshBatch();
        batch.refreshAll = true;
        batch.reason = "refresh-all";
        runRefreshBatch(context.getApplicationContext(), batch);
    }

    public static void refreshKind(Context context, String kind) {
        if (context == null) {
            return;
        }

        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return;
        }

        cancelPendingRefresh();
        RefreshBatch batch = new RefreshBatch();
        batch.reason = "refresh-kind";
        batch.kinds.add(normalizedKind);
        runRefreshBatch(context.getApplicationContext(), batch);
    }

    public static void clearRenderState(int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }

        synchronized (RENDER_STATE_LOCK) {
            for (int appWidgetId : appWidgetIds) {
                LAST_RENDER_KEYS.remove(appWidgetId);
            }
        }
    }

    public static void updateWidgets(Context context, String kind, int[] appWidgetIds) {
        if (context == null || appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return;
        }

        Context appContext = context.getApplicationContext();
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(appContext);
        RenderSource renderSource = loadRenderSource(appContext);
        updateWidgets(appContext, normalizedKind, appWidgetIds, appWidgetManager, renderSource);
    }

    public static void scheduleUpdateWidgets(Context context, String kind, int[] appWidgetIds) {
        if (context == null || appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }

        final String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return;
        }

        final Context appContext = context.getApplicationContext();
        final int[] appWidgetIdsCopy = appWidgetIds.clone();
        REFRESH_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(appContext);
                RenderSource renderSource = loadRenderSource(appContext);
                updateWidgets(
                    appContext,
                    normalizedKind,
                    appWidgetIdsCopy,
                    appWidgetManager,
                    renderSource
                );
            }
        });
    }

    private static RefreshRequest parseRefreshRequest(JSONObject payload) {
        RefreshRequest request = new RefreshRequest();
        if (payload == null) {
            request.requestAll = true;
            return request;
        }

        JSONArray changedSections = payload.optJSONArray("changedSections");
        if (changedSections != null) {
            for (int index = 0; index < changedSections.length(); index++) {
                String section = changedSections.optString(index, "");
                if (!TextUtils.isEmpty(section)) {
                    request.changedSections.add(section.trim());
                }
            }
        }
        request.widgetKindHint =
            ControlerWidgetKinds.normalize(payload.optString("widgetKindHint", ""));
        request.appWidgetId =
            payload.optInt("appWidgetId", AppWidgetManager.INVALID_APPWIDGET_ID);
        request.source = payload.optString("source", "");
        request.themeRefresh =
            request.changedSections.contains("theme")
                || request.changedSections.contains("core/theme")
                || request.changedSections.contains("selectedTheme")
                || request.changedSections.contains("customThemes")
                || request.changedSections.contains("builtInThemeOverrides");
        request.requestAll =
            request.changedSections.isEmpty()
                && TextUtils.isEmpty(request.widgetKindHint)
                && request.appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID;
        return request;
    }

    private static Set<String> resolveKindsForSections(Set<String> changedSections) {
        Set<String> affectedKinds = new HashSet<>();
        if (changedSections == null || changedSections.isEmpty()) {
            affectedKinds.addAll(ControlerWidgetKinds.allKinds());
            return affectedKinds;
        }

        for (String section : changedSections) {
            String normalized = section == null ? "" : section.trim();
            if (TextUtils.isEmpty(normalized) || "diaryEntries".equals(normalized)) {
                continue;
            }
            if (
                "core".equals(normalized)
                    || "theme".equals(normalized)
                    || "core/theme".equals(normalized)
                    || "selectedTheme".equals(normalized)
                    || "customThemes".equals(normalized)
                    || "builtInThemeOverrides".equals(normalized)
            ) {
                affectedKinds.addAll(ControlerWidgetKinds.allKinds());
                continue;
            }
            if ("projects".equals(normalized)) {
                affectedKinds.add(ControlerWidgetKinds.START_TIMER);
                affectedKinds.add(ControlerWidgetKinds.WEEK_GRID);
                affectedKinds.add(ControlerWidgetKinds.DAY_PIE);
                affectedKinds.add(ControlerWidgetKinds.WEEK_VIEW);
                affectedKinds.add(ControlerWidgetKinds.YEAR_VIEW);
                continue;
            }
            if ("records".equals(normalized) || "timerSessionState".equals(normalized)) {
                affectedKinds.add(ControlerWidgetKinds.START_TIMER);
                affectedKinds.add(ControlerWidgetKinds.WEEK_GRID);
                affectedKinds.add(ControlerWidgetKinds.DAY_PIE);
                continue;
            }
            if (
                "plans".equals(normalized)
                    || "plansRecurring".equals(normalized)
                    || "yearlyGoals".equals(normalized)
            ) {
                affectedKinds.add(ControlerWidgetKinds.WEEK_VIEW);
                affectedKinds.add(ControlerWidgetKinds.YEAR_VIEW);
                continue;
            }
            if ("todos".equals(normalized)) {
                affectedKinds.add(ControlerWidgetKinds.TODOS);
                continue;
            }
            if (
                "checkinItems".equals(normalized)
                    || "dailyCheckins".equals(normalized)
                    || "checkins".equals(normalized)
            ) {
                affectedKinds.add(ControlerWidgetKinds.CHECKINS);
            }
        }
        return affectedKinds;
    }

    private static Runnable getPendingRunnableForBucket(String bucket) {
        if ("same-kind".equals(bucket)) {
            return pendingSameKindRefreshRunnable;
        }
        if ("affected".equals(bucket)) {
            return pendingAffectedRefreshRunnable;
        }
        if ("theme".equals(bucket)) {
            return pendingThemeRefreshRunnable;
        }
        return pendingRefreshRunnable;
    }

    private static void setPendingRunnableForBucket(String bucket, Runnable runnable) {
        if ("same-kind".equals(bucket)) {
            pendingSameKindRefreshRunnable = runnable;
            return;
        }
        if ("affected".equals(bucket)) {
            pendingAffectedRefreshRunnable = runnable;
            return;
        }
        if ("theme".equals(bucket)) {
            pendingThemeRefreshRunnable = runnable;
            return;
        }
        pendingRefreshRunnable = runnable;
    }

    private static RefreshBatch getPendingBatchForBucket(String bucket) {
        if ("same-kind".equals(bucket)) {
            return pendingSameKindBatch;
        }
        if ("affected".equals(bucket)) {
            return pendingAffectedBatch;
        }
        if ("theme".equals(bucket)) {
            return pendingThemeBatch;
        }
        return null;
    }

    private static void scheduleRefreshBatch(
        final Context appContext,
        RefreshBatch incomingBatch,
        long delayMs,
        final String bucket
    ) {
        if (appContext == null || incomingBatch == null) {
            return;
        }

        synchronized (REFRESH_LOCK) {
            final RefreshBatch aggregateBatch;
            if ("same-kind".equals(bucket)) {
                pendingSameKindBatch.merge(incomingBatch);
                aggregateBatch = pendingSameKindBatch;
            } else if ("affected".equals(bucket)) {
                pendingAffectedBatch.merge(incomingBatch);
                aggregateBatch = pendingAffectedBatch;
            } else if ("theme".equals(bucket)) {
                pendingThemeBatch.merge(incomingBatch);
                aggregateBatch = pendingThemeBatch;
            } else {
                pendingImmediateBatch.merge(incomingBatch);
                aggregateBatch = pendingImmediateBatch;
            }

            Runnable pendingRunnable = getPendingRunnableForBucket(bucket);
            if (pendingRunnable != null) {
                REFRESH_HANDLER.removeCallbacks(pendingRunnable);
            }

            final Runnable[] runnableHolder = new Runnable[1];
            runnableHolder[0] = new Runnable() {
                @Override
                public void run() {
                    RefreshBatch batchToRun = aggregateBatch;
                    synchronized (REFRESH_LOCK) {
                        if (getPendingRunnableForBucket(bucket) != runnableHolder[0]) {
                            return;
                        }
                        setPendingRunnableForBucket(bucket, null);
                        if ("same-kind".equals(bucket)) {
                            batchToRun = pendingSameKindBatch;
                            pendingSameKindBatch = new RefreshBatch();
                        } else if ("affected".equals(bucket)) {
                            batchToRun = pendingAffectedBatch;
                            pendingAffectedBatch = new RefreshBatch();
                        } else if ("theme".equals(bucket)) {
                            batchToRun = pendingThemeBatch;
                            pendingThemeBatch = new RefreshBatch();
                        } else {
                            batchToRun = pendingImmediateBatch;
                            pendingImmediateBatch = new RefreshBatch();
                        }
                    }
                    runRefreshBatch(appContext, batchToRun);
                }
            };
            setPendingRunnableForBucket(bucket, runnableHolder[0]);
            if (delayMs <= 0L) {
                REFRESH_HANDLER.post(runnableHolder[0]);
            } else {
                REFRESH_HANDLER.postDelayed(runnableHolder[0], delayMs);
            }
        }
    }

    private static void runRefreshBatch(Context context, RefreshBatch batch) {
        if (context == null || batch == null) {
            return;
        }

        Context appContext = context.getApplicationContext();
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(appContext);
        if (appWidgetManager == null) {
            return;
        }

        Map<String, int[]> widgetIdsByKind =
            resolveWidgetIdsByKind(appContext, appWidgetManager, batch);
        if (widgetIdsByKind.isEmpty()) {
            return;
        }

        invalidateRenderSourceCache();
        ControlerStartupTrace.mark(
            "widget-refresh-batch-start",
            "reason="
                + safeText(batch.reason)
                + " kinds="
                + widgetIdsByKind.keySet().toString()
                + " widgetCount="
                + countWidgetIds(widgetIdsByKind)
        );

        RenderSource renderSource = loadRenderSource(appContext);
        for (Map.Entry<String, int[]> entry : widgetIdsByKind.entrySet()) {
            updateWidgets(
                appContext,
                entry.getKey(),
                entry.getValue(),
                appWidgetManager,
                renderSource
            );
        }
        ControlerStartupTrace.mark(
            "widget-refresh-batch-done",
            "reason="
                + safeText(batch.reason)
                + " kinds="
                + widgetIdsByKind.keySet().toString()
                + " widgetCount="
                + countWidgetIds(widgetIdsByKind)
        );
    }

    private static Map<String, int[]> resolveWidgetIdsByKind(
        Context context,
        AppWidgetManager appWidgetManager,
        RefreshBatch batch
    ) {
        Map<String, Set<Integer>> widgetIdsByKind = new HashMap<>();
        Set<String> requestedKinds = new HashSet<>();
        if (batch.refreshAll) {
            requestedKinds.addAll(ControlerWidgetKinds.allKinds());
        } else {
            requestedKinds.addAll(batch.kinds);
        }

        for (String kind : requestedKinds) {
            String normalizedKind = ControlerWidgetKinds.normalize(kind);
            if (TextUtils.isEmpty(normalizedKind)) {
                continue;
            }
            ComponentName componentName =
                ControlerWidgetKinds.componentNameForKind(context, normalizedKind);
            if (componentName == null) {
                continue;
            }
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
            if (appWidgetIds == null || appWidgetIds.length == 0) {
                continue;
            }
            Set<Integer> bucket = new HashSet<>();
            for (int appWidgetId : appWidgetIds) {
                bucket.add(appWidgetId);
            }
            widgetIdsByKind.put(normalizedKind, bucket);
        }

        if (!batch.widgetIds.isEmpty()) {
            for (int appWidgetId : batch.widgetIds) {
                String kind = findWidgetKindForId(context, appWidgetManager, appWidgetId);
                if (TextUtils.isEmpty(kind)) {
                    continue;
                }
                Set<Integer> bucket = widgetIdsByKind.get(kind);
                if (bucket == null) {
                    bucket = new HashSet<>();
                    widgetIdsByKind.put(kind, bucket);
                }
                bucket.add(appWidgetId);
            }
        }

        Map<String, int[]> resolved = new HashMap<>();
        for (Map.Entry<String, Set<Integer>> entry : widgetIdsByKind.entrySet()) {
            if (entry.getValue() == null || entry.getValue().isEmpty()) {
                continue;
            }
            int[] ids = new int[entry.getValue().size()];
            int cursor = 0;
            for (Integer id : entry.getValue()) {
                ids[cursor] = id == null ? AppWidgetManager.INVALID_APPWIDGET_ID : id;
                cursor += 1;
            }
            resolved.put(entry.getKey(), ids);
        }
        return resolved;
    }

    private static String findWidgetKindForId(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId
    ) {
        if (context == null || appWidgetManager == null) {
            return "";
        }

        for (String kind : ControlerWidgetKinds.allKinds()) {
            ComponentName componentName =
                ControlerWidgetKinds.componentNameForKind(context, kind);
            if (componentName == null) {
                continue;
            }
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
            if (appWidgetIds == null) {
                continue;
            }
            for (int currentId : appWidgetIds) {
                if (currentId == appWidgetId) {
                    return kind;
                }
            }
        }
        return "";
    }

    private static int countWidgetIds(Map<String, int[]> widgetIdsByKind) {
        int total = 0;
        if (widgetIdsByKind == null) {
            return 0;
        }
        for (int[] ids : widgetIdsByKind.values()) {
            total += ids == null ? 0 : ids.length;
        }
        return total;
    }

    public static void invalidateRenderSourceCache() {
        synchronized (RENDER_STATE_LOCK) {
            lastRenderSourceLoadedAtMs = 0L;
            lastRenderSource = null;
        }
    }

    private static RenderSource loadRenderSource(Context context) {
        long now = System.currentTimeMillis();
        synchronized (RENDER_STATE_LOCK) {
            if (
                lastRenderSource != null
                    && now - lastRenderSourceLoadedAtMs <= RENDER_SOURCE_CACHE_TTL_MS
            ) {
                return lastRenderSource;
            }
        }

        RenderSource renderSource = new RenderSource();
        if (context == null) {
            return renderSource;
        }

        try {
            renderSource.root = ControlerWidgetDataStore.loadRootForWidgets(context);
            renderSource.palette = resolveThemePalette(renderSource.root);
            renderSource.state = ControlerWidgetDataStore.loadFromRoot(renderSource.root);
        } catch (Exception error) {
            error.printStackTrace();
        }

        synchronized (RENDER_STATE_LOCK) {
            lastRenderSourceLoadedAtMs = now;
            lastRenderSource = renderSource;
        }
        return renderSource;
    }

    private static void updateWidgets(
        Context context,
        String normalizedKind,
        int[] appWidgetIds,
        AppWidgetManager appWidgetManager,
        RenderSource renderSource
    ) {
        if (
            context == null
                || appWidgetManager == null
                || appWidgetIds == null
                || appWidgetIds.length == 0
                || TextUtils.isEmpty(normalizedKind)
        ) {
            return;
        }

        ThemePalette palette =
            renderSource == null || renderSource.palette == null
                ? new ThemePalette()
                : renderSource.palette;
        ControlerWidgetDataStore.State state =
            renderSource == null || renderSource.state == null
                ? new ControlerWidgetDataStore.State()
                : renderSource.state;
        Map<Integer, WidgetMetrics> metricsById = new HashMap<>();
        boolean includePreview = false;
        for (int appWidgetId : appWidgetIds) {
            WidgetMetrics metrics = resolveWidgetMetrics(appWidgetManager, appWidgetId);
            metricsById.put(appWidgetId, metrics);
            if (metrics.sizeClass != SIZE_COMPACT) {
                includePreview = true;
            }
        }

        List<PendingWidgetUpdate> pendingUpdates = new ArrayList<>();
        for (int appWidgetId : appWidgetIds) {
            WidgetMetrics metrics = metricsById.get(appWidgetId);
            WidgetContent content = null;
            try {
                content = buildWidgetContent(
                    context,
                    normalizedKind,
                    state,
                    includePreview,
                    appWidgetId
                );
            } catch (Exception error) {
                error.printStackTrace();
            }
            if (content == null) {
                content = buildFallbackWidgetContent(normalizedKind);
            }
            String renderKey = buildRenderKey(normalizedKind, metrics, palette, content);
            if (hasSameRenderKey(appWidgetId, renderKey)) {
                continue;
            }
            boolean deferPreview =
                TextUtils.isEmpty(getRememberedRenderKey(appWidgetId))
                    && shouldShowPreview(normalizedKind, content, metrics);
            pendingUpdates.add(
                new PendingWidgetUpdate(appWidgetId, metrics, renderKey, deferPreview, content)
            );
        }

        if (pendingUpdates.isEmpty()) {
            return;
        }

        final List<Integer> deferredPreviewWidgetIds = new ArrayList<>();
        for (PendingWidgetUpdate pendingUpdate : pendingUpdates) {
            RemoteViews remoteViews;
            try {
                WidgetContent content = pendingUpdate.content;
                content.previewBitmap = shouldShowPreview(
                    normalizedKind,
                    content,
                    pendingUpdate.metrics
                ) && !pendingUpdate.deferPreview
                    ? resolvePreviewBitmap(
                        context,
                        normalizedKind,
                        state,
                        palette,
                        pendingUpdate.metrics,
                        content.previewSignature
                    )
                    : null;
                remoteViews =
                    buildRemoteViews(
                        context,
                        pendingUpdate.appWidgetId,
                        normalizedKind,
                        content,
                        palette,
                        pendingUpdate.metrics
                    );
            } catch (Exception error) {
                error.printStackTrace();
                ThemePalette fallbackPalette = new ThemePalette();
                WidgetContent fallbackContent = buildFallbackWidgetContent(normalizedKind);
                remoteViews =
                    buildRemoteViews(
                        context,
                        pendingUpdate.appWidgetId,
                        normalizedKind,
                        fallbackContent,
                        fallbackPalette,
                        pendingUpdate.metrics
                    );
                appWidgetManager.updateAppWidget(pendingUpdate.appWidgetId, remoteViews);
                if (isListFirstKind(normalizedKind)) {
                    appWidgetManager.notifyAppWidgetViewDataChanged(
                        pendingUpdate.appWidgetId,
                        R.id.widget_collection_list
                    );
                }
                rememberRenderKey(
                    pendingUpdate.appWidgetId,
                    buildRenderKey(normalizedKind, pendingUpdate.metrics, fallbackPalette, fallbackContent)
                );
                continue;
            }
            appWidgetManager.updateAppWidget(pendingUpdate.appWidgetId, remoteViews);
            if (isListFirstKind(normalizedKind)) {
                appWidgetManager.notifyAppWidgetViewDataChanged(
                    pendingUpdate.appWidgetId,
                    R.id.widget_collection_list
                );
            }
            rememberRenderKey(
                pendingUpdate.appWidgetId,
                pendingUpdate.deferPreview
                    ? pendingUpdate.renderKey + "|preview-pending"
                    : pendingUpdate.renderKey
            );
            if (pendingUpdate.deferPreview) {
                deferredPreviewWidgetIds.add(pendingUpdate.appWidgetId);
            }
        }

        if (!deferredPreviewWidgetIds.isEmpty()) {
            final Context appContext = context.getApplicationContext();
            final int[] deferredIds = toIntArray(deferredPreviewWidgetIds);
            REFRESH_HANDLER.postDelayed(new Runnable() {
                @Override
                public void run() {
                    AppWidgetManager nextAppWidgetManager = AppWidgetManager.getInstance(appContext);
                    RenderSource deferredRenderSource = loadRenderSource(appContext);
                    updateWidgets(
                        appContext,
                        normalizedKind,
                        deferredIds,
                        nextAppWidgetManager,
                        deferredRenderSource
                    );
                }
            }, DEFERRED_PREVIEW_REFRESH_DELAY_MS);
        }
    }

    private static WidgetContent buildFallbackWidgetContent(String kind) {
        WidgetContent content = new WidgetContent();
        content.title = ControlerWidgetKinds.label(kind);
        content.subtitle = "小组件内容已准备";
        content.page = ControlerWidgetKinds.defaultPage(kind);
        content.action = ControlerWidgetKinds.defaultAction(kind);
        content.actionLabel = "打开应用";
        content.lines.add("如果摘要暂未出现，可点击打开应用后返回桌面。");
        content.lines.add("数据已保存在当前同步 JSON 文件中。");
        return finalizeWidgetContent(content, kind, null, false);
    }

    private static RemoteViews buildRemoteViews(
        Context context,
        int appWidgetId,
        String kind,
        WidgetContent content,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.controler_widget_frame);
        int[] itemContainerIds = new int[] {
            R.id.widget_item1,
            R.id.widget_item2,
            R.id.widget_item3,
            R.id.widget_item4,
            R.id.widget_item5
        };
        int[] itemAccentIds = new int[] {
            R.id.widget_item1_accent,
            R.id.widget_item2_accent,
            R.id.widget_item3_accent,
            R.id.widget_item4_accent,
            R.id.widget_item5_accent
        };
        int[] itemTitleIds = new int[] {
            R.id.widget_item1_title,
            R.id.widget_item2_title,
            R.id.widget_item3_title,
            R.id.widget_item4_title,
            R.id.widget_item5_title
        };
        int[] itemMetaIds = new int[] {
            R.id.widget_item1_meta,
            R.id.widget_item2_meta,
            R.id.widget_item3_meta,
            R.id.widget_item4_meta,
            R.id.widget_item5_meta
        };
        int[] itemActionIds = new int[] {
            R.id.widget_item1_action,
            R.id.widget_item2_action,
            R.id.widget_item3_action,
            R.id.widget_item4_action,
            R.id.widget_item5_action
        };

        views.setTextViewText(R.id.widget_title, safeText(content.title));
        views.setTextViewText(R.id.widget_subtitle, safeText(content.subtitle));
        views.setTextViewText(R.id.widget_action, safeText(content.actionLabel));
        views.setTextViewText(R.id.widget_action_only_button, safeText(content.actionLabel));
        views.setTextColor(R.id.widget_title, palette.titleColor);
        views.setTextColor(R.id.widget_subtitle, palette.subtitleColor);
        views.setTextColor(R.id.widget_line1, palette.bodyColor);
        views.setTextColor(R.id.widget_line2, palette.bodyColor);
        views.setTextColor(R.id.widget_line3, palette.bodyColor);
        views.setTextColor(R.id.widget_stat_primary, palette.bodyColor);
        views.setTextColor(R.id.widget_stat_secondary, palette.bodyColor);
        views.setTextColor(R.id.widget_action, palette.actionTextColor);
        views.setTextColor(R.id.widget_action_only_button, palette.actionTextColor);
        for (int index = 0; index < itemTitleIds.length; index++) {
            views.setTextColor(itemTitleIds[index], palette.bodyColor);
            views.setTextColor(itemMetaIds[index], palette.subtitleColor);
            views.setTextColor(itemActionIds[index], palette.actionTextColor);
        }
        views.setInt(R.id.widget_root, "setBackgroundColor", Color.TRANSPARENT);
        views.setImageViewBitmap(
            R.id.widget_card_background,
            resolveCardBackgroundBitmap(context, palette, metrics)
        );
        applyResponsiveSizing(context, views, metrics, kind);

        boolean showPreview =
            shouldShowPreview(kind, content, metrics) && content.previewBitmap != null;
        boolean showActionOnlyShell = shouldShowActionOnlyShell(kind, content, metrics);
        views.setViewVisibility(R.id.widget_preview, showPreview ? View.VISIBLE : View.GONE);
        if (showPreview) {
            views.setImageViewBitmap(R.id.widget_preview, content.previewBitmap);
        }

        boolean showStats = shouldShowStats(kind, content, metrics);
        views.setViewVisibility(R.id.widget_stats_row, showStats ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_stat_primary, safeText(content.statPrimary));
        views.setTextViewText(R.id.widget_stat_secondary, safeText(content.statSecondary));
        views.setViewVisibility(
            R.id.widget_stat_primary,
            showStats && !TextUtils.isEmpty(content.statPrimary) ? View.VISIBLE : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_stat_secondary,
            showStats && !TextUtils.isEmpty(content.statSecondary) ? View.VISIBLE : View.GONE
        );

        PendingIntent openIntent = buildOpenMainPendingIntent(context, appWidgetId, kind, content);
        boolean useCollectionList = isListFirstKind(kind);
        if (useCollectionList) {
            ControlerWidgetCollectionStore.saveRows(
                context,
                appWidgetId,
                kind,
                buildCollectionRowsPayload(content, palette)
            );
            views.setRemoteAdapter(
                R.id.widget_collection_list,
                buildCollectionServiceIntent(context, appWidgetId, kind)
            );
            views.setPendingIntentTemplate(
                R.id.widget_collection_list,
                buildCollectionItemTemplatePendingIntent(context, appWidgetId, kind, content)
            );
            views.setEmptyView(R.id.widget_collection_list, R.id.widget_collection_empty);
            views.setTextViewText(
                R.id.widget_collection_empty,
                safeText(
                    content.itemCards.isEmpty()
                        ? pickLine(content.lines, 0)
                        : "点击条目进入应用继续处理"
                )
            );
            views.setTextColor(
                R.id.widget_collection_empty,
                resolveReadableTextColor(
                    palette.subtitleColor,
                    resolveCollectionRowSurfaceColor(palette),
                    3.0d
                )
            );
        }
        int visibleCardCount = useCollectionList
            ? 0
            : resolveVisibleCardCount(kind, content, metrics);
        views.setViewVisibility(
            R.id.widget_collection_shell,
            useCollectionList ? View.VISIBLE : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_item_list,
            visibleCardCount > 0 ? View.VISIBLE : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_action_only_shell,
            showActionOnlyShell ? View.VISIBLE : View.GONE
        );
        for (int index = 0; index < itemContainerIds.length; index++) {
            applyItemCardContent(
                context,
                views,
                appWidgetId,
                kind,
                palette,
                index < visibleCardCount ? content.itemCards.get(index) : null,
                itemContainerIds[index],
                itemAccentIds[index],
                itemTitleIds[index],
                itemMetaIds[index],
                itemActionIds[index],
                openIntent,
                metrics
            );
        }

        int lineCapacity = showActionOnlyShell
            ? 0
            : resolveLineCapacity(kind, metrics, showPreview, visibleCardCount);
        applyLineContent(views, R.id.widget_line1, pickLine(content.lines, 0), lineCapacity >= 1);
        applyLineContent(views, R.id.widget_line2, pickLine(content.lines, 1), lineCapacity >= 2);
        applyLineContent(views, R.id.widget_line3, pickLine(content.lines, 2), lineCapacity >= 3);
        boolean hasDirectAction = !TextUtils.isEmpty(content.directCommand);
        boolean showPrimaryAction =
            !showActionOnlyShell && shouldShowAction(kind, content, metrics);
        PendingIntent primaryActionIntent = hasDirectAction
            ? buildDirectActionPendingIntent(context, appWidgetId, kind, content)
            : openIntent;
        PendingIntent rootClickIntent =
            showActionOnlyShell && hasDirectAction ? primaryActionIntent : openIntent;
        views.setViewVisibility(
            R.id.widget_subtitle,
            !showActionOnlyShell && shouldShowSubtitle(kind, content, metrics)
                ? View.VISIBLE
                : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_title,
            !showActionOnlyShell && shouldShowTitle(kind, content, metrics)
                ? View.VISIBLE
                : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_action,
            showPrimaryAction ? View.VISIBLE : View.GONE
        );
        views.setViewVisibility(
            R.id.widget_footer_spacer,
            !showActionOnlyShell && showPrimaryAction ? View.VISIBLE : View.GONE
        );

        views.setOnClickPendingIntent(R.id.widget_root, rootClickIntent);
        views.setOnClickPendingIntent(R.id.widget_preview, openIntent);
        views.setOnClickPendingIntent(R.id.widget_action, primaryActionIntent);
        views.setOnClickPendingIntent(R.id.widget_action_only_shell, primaryActionIntent);
        views.setOnClickPendingIntent(R.id.widget_action_only_button, primaryActionIntent);

        return views;
    }

    private static ThemePalette resolveThemePalette(JSONObject root) {
        ThemePalette palette = new ThemePalette();
        Map<String, String> colors = buildBuiltInThemeColors(
            root == null ? "default" : root.optString("selectedTheme", "default")
        );

        if (root != null) {
            String selectedTheme = root.optString("selectedTheme", "default");
            JSONObject builtInOverrides = root.optJSONObject("builtInThemeOverrides");
            if (builtInOverrides != null) {
                JSONObject selectedOverride = builtInOverrides.optJSONObject(selectedTheme);
                if (selectedOverride != null) {
                    mergeThemeColors(colors, selectedOverride.optJSONObject("colors"));
                }
            }

            JSONArray customThemes = root.optJSONArray("customThemes");
            if (customThemes != null) {
                for (int index = 0; index < customThemes.length(); index++) {
                    JSONObject item = customThemes.optJSONObject(index);
                    if (item == null) {
                        continue;
                    }
                    if (selectedTheme.equals(item.optString("id", ""))) {
                        mergeThemeColors(colors, item.optJSONObject("colors"));
                        break;
                    }
                }
            }
        }

        palette.backgroundColor = parseColor(
            firstNonEmpty(colors.get("primary"), colors.get("panelStrong"), colors.get("panel")),
            palette.backgroundColor
        );
        palette.surfaceColor = parseColor(
            firstNonEmpty(colors.get("panelStrong"), colors.get("panel"), colors.get("secondary")),
            palette.surfaceColor
        );
        palette.surfaceIsLight = isLightColor(palette.surfaceColor);
        palette.contrastReferenceColor = contrastReferenceColor(palette.surfaceIsLight);
        palette.accentColor = resolveVisibleAccentColor(
            parseColor(colors.get("accent"), palette.accentColor),
            palette.surfaceColor,
            palette.accentColor
        );
        palette.borderColor = resolveVisibleAccentColor(
            parseColor(
                firstNonEmpty(colors.get("panelBorder"), colors.get("border"), colors.get("accent")),
                palette.borderColor
            ),
            palette.surfaceColor,
            palette.accentColor
        );
        int preferredTitleColor = parseColor(colors.get("text"), palette.titleColor);
        palette.titleColor = resolveReadableTextColor(
            preferredTitleColor,
            palette.surfaceColor,
            4.5d
        );
        palette.subtitleColor = resolveReadableTextColor(
            parseColor(
                firstNonEmpty(colors.get("mutedText"), colors.get("text")),
                palette.subtitleColor
            ),
            palette.surfaceColor,
            2.8d
        );
        palette.bodyColor = resolveReadableTextColor(
            preferredTitleColor,
            palette.surfaceColor,
            4.2d
        );
        int preferredActionTextColor = parseColor(
            firstNonEmpty(colors.get("buttonText"), colors.get("onAccentText"), colors.get("text")),
            palette.actionTextColor
        );
        int actionSurfaceColor = blendColors(
            palette.surfaceColor,
            palette.contrastReferenceColor,
            palette.surfaceIsLight ? 0.08f : 36f / 255f
        );
        palette.actionTextColor = resolveReadableTextColor(
            preferredActionTextColor,
            actionSurfaceColor,
            4.1d
        );
        palette.accentTextColor = resolveReadableTextColor(
            preferredActionTextColor,
            palette.accentColor,
            4.2d
        );
        palette.cardFillColor = blendColors(
            palette.surfaceColor,
            palette.backgroundColor,
            palette.surfaceIsLight ? 0.10f : 0.18f
        );
        palette.cardBorderColor = blendColors(
            palette.borderColor,
            palette.contrastReferenceColor,
            palette.surfaceIsLight ? 0.10f : 0.14f
        );
        palette.cardGlossColor = Color.argb(
            palette.surfaceIsLight ? 72 : 16,
            255,
            255,
            255
        );
        return palette;
    }

    private static Map<String, String> buildBuiltInThemeColors(String themeId) {
        Map<String, String> colors = new HashMap<>();
        String safeThemeId = TextUtils.isEmpty(themeId) ? "default" : themeId;

        colors.put("primary", "#1f2f28");
        colors.put("panel", "rgba(24, 41, 33, 0.62)");
        colors.put("panelStrong", "rgba(31, 53, 42, 0.74)");
        colors.put("accent", "#8ed6a4");
        colors.put("text", "#f5fff8");
        colors.put("mutedText", "rgba(245, 255, 248, 0.72)");
        colors.put("border", "#6ea283");
        colors.put("panelBorder", "rgba(142, 214, 164, 0.28)");
        colors.put("buttonBg", "#8ed6a4");
        colors.put("buttonText", "#173326");
        colors.put("onAccentText", "#173326");

        if ("blue-ocean".equals(safeThemeId)) {
            colors.put("primary", "#12263f");
            colors.put("panel", "rgba(17, 37, 61, 0.65)");
            colors.put("panelStrong", "rgba(22, 45, 73, 0.76)");
            colors.put("accent", "#7ec6ff");
            colors.put("text", "#eef6ff");
            colors.put("mutedText", "rgba(238, 246, 255, 0.72)");
            colors.put("border", "#6d7ba4");
            colors.put("panelBorder", "rgba(126, 198, 255, 0.28)");
            colors.put("buttonBg", "#7ec6ff");
            colors.put("buttonText", "#123052");
            colors.put("onAccentText", "#123052");
        } else if ("sunset-orange".equals(safeThemeId)) {
            colors.put("primary", "#4b261b");
            colors.put("panel", "rgba(70, 37, 26, 0.68)");
            colors.put("panelStrong", "rgba(88, 46, 31, 0.76)");
            colors.put("accent", "#ffbf78");
            colors.put("text", "#fff5ea");
            colors.put("mutedText", "rgba(255, 245, 234, 0.74)");
            colors.put("border", "#bdb38b");
            colors.put("panelBorder", "rgba(255, 191, 120, 0.30)");
            colors.put("buttonBg", "#ffc78a");
            colors.put("buttonText", "#522a1c");
            colors.put("onAccentText", "#522a1c");
        } else if ("minimal-gray".equals(safeThemeId)) {
            colors.put("primary", "#1f252e");
            colors.put("panel", "rgba(33, 39, 49, 0.66)");
            colors.put("panelStrong", "rgba(40, 47, 58, 0.78)");
            colors.put("accent", "#d1d9e3");
            colors.put("text", "#f6f8fb");
            colors.put("mutedText", "rgba(246, 248, 251, 0.72)");
            colors.put("border", "#bebebe");
            colors.put("panelBorder", "rgba(209, 217, 227, 0.30)");
            colors.put("buttonBg", "#d9e1ec");
            colors.put("buttonText", "#262f3d");
            colors.put("onAccentText", "#262f3d");
        } else if ("obsidian-mono".equals(safeThemeId)) {
            colors.put("primary", "#0d0f12");
            colors.put("panel", "rgba(16, 18, 22, 0.72)");
            colors.put("panelStrong", "rgba(20, 23, 28, 0.82)");
            colors.put("accent", "#f1f4fa");
            colors.put("text", "#f4f6fb");
            colors.put("mutedText", "rgba(244, 246, 251, 0.76)");
            colors.put("border", "rgba(215, 221, 232, 0.32)");
            colors.put("panelBorder", "rgba(215, 221, 232, 0.22)");
            colors.put("buttonBg", "#f1f4fa");
            colors.put("buttonText", "#10141d");
            colors.put("onAccentText", "#10141d");
        } else if ("ivory-light".equals(safeThemeId)) {
            colors.put("primary", "#eceff3");
            colors.put("panel", "rgba(255, 255, 255, 0.74)");
            colors.put("panelStrong", "rgba(249, 252, 255, 0.86)");
            colors.put("accent", "#3f495f");
            colors.put("text", "#202633");
            colors.put("mutedText", "rgba(32, 38, 51, 0.7)");
            colors.put("border", "#7b8598");
            colors.put("panelBorder", "rgba(110, 122, 143, 0.24)");
            colors.put("buttonBg", "#3f495f");
            colors.put("buttonText", "#f4f7ff");
            colors.put("onAccentText", "#f4f7ff");
        } else if ("graphite-mist".equals(safeThemeId)) {
            colors.put("primary", "#2a2d32");
            colors.put("panel", "rgba(43, 46, 52, 0.66)");
            colors.put("panelStrong", "rgba(53, 57, 64, 0.78)");
            colors.put("accent", "#f0f3fa");
            colors.put("text", "#f8f9fc");
            colors.put("mutedText", "rgba(248, 249, 252, 0.74)");
            colors.put("border", "rgba(224, 227, 234, 0.34)");
            colors.put("panelBorder", "rgba(224, 227, 234, 0.26)");
            colors.put("buttonBg", "#f0f3fa");
            colors.put("buttonText", "#222832");
            colors.put("onAccentText", "#222832");
        } else if ("aurora-mist".equals(safeThemeId)) {
            colors.put("primary", "#162a2d");
            colors.put("panel", "rgba(20, 39, 42, 0.66)");
            colors.put("panelStrong", "rgba(26, 49, 52, 0.78)");
            colors.put("accent", "#8fd3d1");
            colors.put("text", "#effcfb");
            colors.put("mutedText", "rgba(239, 252, 251, 0.74)");
            colors.put("border", "#7ca8aa");
            colors.put("panelBorder", "rgba(143, 211, 209, 0.26)");
            colors.put("buttonBg", "#96dcda");
            colors.put("buttonText", "#133235");
            colors.put("onAccentText", "#133235");
        } else if ("velvet-bordeaux".equals(safeThemeId)) {
            colors.put("primary", "#2f141d");
            colors.put("panel", "rgba(43, 20, 29, 0.68)");
            colors.put("panelStrong", "rgba(57, 26, 37, 0.80)");
            colors.put("accent", "#d8a6b8");
            colors.put("text", "#fff3f6");
            colors.put("mutedText", "rgba(255, 243, 246, 0.74)");
            colors.put("border", "#b78898");
            colors.put("panelBorder", "rgba(216, 166, 184, 0.26)");
            colors.put("buttonBg", "#e2b0c2");
            colors.put("buttonText", "#421d2a");
            colors.put("onAccentText", "#421d2a");
        } else if ("champagne-sandstone".equals(safeThemeId)) {
            colors.put("primary", "#f1ebe2");
            colors.put("panel", "rgba(255, 251, 246, 0.78)");
            colors.put("panelStrong", "rgba(250, 245, 239, 0.90)");
            colors.put("accent", "#8b6f57");
            colors.put("text", "#2f261f");
            colors.put("mutedText", "rgba(47, 38, 31, 0.68)");
            colors.put("border", "#b59f8c");
            colors.put("panelBorder", "rgba(143, 119, 95, 0.22)");
            colors.put("buttonBg", "#8b6f57");
            colors.put("buttonText", "#f8f3ec");
            colors.put("onAccentText", "#f8f3ec");
        } else if ("midnight-indigo".equals(safeThemeId)) {
            colors.put("primary", "#111a35");
            colors.put("panel", "rgba(16, 26, 52, 0.68)");
            colors.put("panelStrong", "rgba(21, 33, 64, 0.80)");
            colors.put("accent", "#9cb8ff");
            colors.put("text", "#eef3ff");
            colors.put("mutedText", "rgba(238, 243, 255, 0.74)");
            colors.put("border", "#7d91c9");
            colors.put("panelBorder", "rgba(156, 184, 255, 0.28)");
            colors.put("buttonBg", "#9cb8ff");
            colors.put("buttonText", "#162447");
            colors.put("onAccentText", "#162447");
        }

        return colors;
    }

    private static void mergeThemeColors(Map<String, String> target, JSONObject colorSource) {
        if (target == null || colorSource == null) {
            return;
        }

        String[] keys = new String[] {
            "primary",
            "panel",
            "panelStrong",
            "accent",
            "text",
            "mutedText",
            "border",
            "panelBorder",
            "buttonBg",
            "buttonText",
            "onAccentText"
        };

        for (String key : keys) {
            String value = colorSource.optString(key, "");
            if (!TextUtils.isEmpty(value)) {
                target.put(key, value);
            }
        }
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value;
            }
        }
        return "";
    }

    private static int resolveReadableTextColor(int preferredColor, int backgroundColor) {
        return resolveReadableTextColor(preferredColor, backgroundColor, 3.2d);
    }

    private static int resolveReadableTextColor(
        int preferredColor,
        int backgroundColor,
        double minContrast
    ) {
        if (contrastRatio(preferredColor, backgroundColor) >= minContrast) {
            return preferredColor;
        }
        return relativeLuminance(backgroundColor) >= 0.42d
            ? Color.parseColor("#17212B")
            : Color.parseColor("#F7FAFF");
    }

    private static boolean isLightColor(int color) {
        return relativeLuminance(color) >= 0.58d;
    }

    private static int contrastReferenceColor(boolean lightSurface) {
        return lightSurface ? Color.parseColor("#17212B") : Color.WHITE;
    }

    private static int resolveVisibleAccentColor(
        int preferredColor,
        int backgroundColor,
        int fallbackColor
    ) {
        if (contrastRatio(preferredColor, backgroundColor) >= 2.05d) {
            return preferredColor;
        }
        int readableReference = resolveReadableTextColor(
            preferredColor,
            backgroundColor,
            2.05d
        );
        int mixedColor = blendColors(preferredColor, readableReference, 0.42f);
        if (contrastRatio(mixedColor, backgroundColor) >= 2.05d) {
            return mixedColor;
        }
        if (contrastRatio(fallbackColor, backgroundColor) >= 2.05d) {
            return fallbackColor;
        }
        return readableReference;
    }

    private static double contrastRatio(int foregroundColor, int backgroundColor) {
        double foreground = relativeLuminance(foregroundColor);
        double background = relativeLuminance(backgroundColor);
        double lighter = Math.max(foreground, background);
        double darker = Math.min(foreground, background);
        return (lighter + 0.05d) / (darker + 0.05d);
    }

    private static double relativeLuminance(int color) {
        return 0.2126d * colorChannelToLinear(Color.red(color))
            + 0.7152d * colorChannelToLinear(Color.green(color))
            + 0.0722d * colorChannelToLinear(Color.blue(color));
    }

    private static double colorChannelToLinear(int channel) {
        double normalized = clampFloat(channel / 255f, 0f, 1f);
        return normalized <= 0.03928d
            ? normalized / 12.92d
            : Math.pow((normalized + 0.055d) / 1.055d, 2.4d);
    }

    private static int parseColor(String colorText, int fallbackColor) {
        if (TextUtils.isEmpty(colorText)) {
            return fallbackColor;
        }

        String normalized = colorText.trim();
        try {
            if (normalized.startsWith("#")) {
                return Color.parseColor(normalized);
            }
        } catch (Exception ignored) {
        }

        Matcher matcher = RGB_PATTERN.matcher(normalized);
        if (matcher.matches()) {
            int red = clampColorChannel(matcher.group(1));
            int green = clampColorChannel(matcher.group(2));
            int blue = clampColorChannel(matcher.group(3));
            String alphaValue = matcher.group(4);
            if (!TextUtils.isEmpty(alphaValue)) {
                try {
                    float alpha = Math.max(0f, Math.min(1f, Float.parseFloat(alphaValue)));
                    return Color.argb(Math.round(alpha * 255f), red, green, blue);
                } catch (Exception ignored) {
                    return Color.rgb(red, green, blue);
                }
            }
            return Color.rgb(red, green, blue);
        }

        return fallbackColor;
    }

    private static int clampColorChannel(String value) {
        try {
            return Math.max(0, Math.min(255, Integer.parseInt(value)));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static void applyLineContent(RemoteViews views, int viewId, String text, boolean visible) {
        if (visible && !TextUtils.isEmpty(text)) {
            views.setTextViewText(viewId, text);
            views.setViewVisibility(viewId, View.VISIBLE);
        } else {
            views.setTextViewText(viewId, "");
            views.setViewVisibility(viewId, View.GONE);
        }
    }

    private static WidgetMetrics resolveWidgetMetrics(
        AppWidgetManager appWidgetManager,
        int appWidgetId
    ) {
        WidgetMetrics metrics = new WidgetMetrics();
        Bundle options = appWidgetManager.getAppWidgetOptions(appWidgetId);
        metrics.minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        metrics.minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);

        if (metrics.minWidthDp < 170 || metrics.minHeightDp < 110) {
            metrics.sizeClass = SIZE_COMPACT;
        } else if (metrics.minWidthDp >= 260 && metrics.minHeightDp >= 180) {
            metrics.sizeClass = SIZE_LARGE;
        } else {
            metrics.sizeClass = SIZE_MEDIUM;
        }

        float widthRatio = metrics.minWidthDp > 0 ? metrics.minWidthDp / 230f : 1f;
        float heightRatio = metrics.minHeightDp > 0 ? metrics.minHeightDp / 160f : 1f;
        metrics.scale = clampFloat(Math.min(widthRatio, heightRatio), 0.72f, 1.18f);
        return metrics;
    }

    private static void applyResponsiveSizing(
        Context context,
        RemoteViews views,
        WidgetMetrics metrics,
        String kind
    ) {
        float scale = metrics == null ? 1f : metrics.scale;
        boolean flatActionOnly =
            isActionOnlyKind(kind)
                && metrics != null
                && (
                    metrics.minHeightDp < 78
                        || (metrics.minHeightDp < 96 && metrics.minWidthDp < 200)
                );
        boolean listFirstKind = isListFirstKind(kind);
        boolean previewPrimaryKind = isPreviewPrimaryKind(kind);
        boolean compactListCards = shouldUseCompactListCards(kind, metrics);
        boolean minimalListCards = shouldUseMinimalListCards(kind, metrics);
        boolean compactPreviewCards = shouldUseCompactPreviewSupplementaryCards(kind, metrics);
        boolean minimalPreviewCards = shouldUseMinimalPreviewSupplementaryCards(kind, metrics);
        boolean compactItemCards = compactListCards || compactPreviewCards;
        boolean minimalItemCards = minimalListCards || minimalPreviewCards;
        boolean denseItemCards = listFirstKind || previewPrimaryKind;
        int[] itemContainerIds = new int[] {
            R.id.widget_item1,
            R.id.widget_item2,
            R.id.widget_item3,
            R.id.widget_item4,
            R.id.widget_item5
        };
        int[] itemTitleIds = new int[] {
            R.id.widget_item1_title,
            R.id.widget_item2_title,
            R.id.widget_item3_title,
            R.id.widget_item4_title,
            R.id.widget_item5_title
        };
        int[] itemMetaIds = new int[] {
            R.id.widget_item1_meta,
            R.id.widget_item2_meta,
            R.id.widget_item3_meta,
            R.id.widget_item4_meta,
            R.id.widget_item5_meta
        };
        int[] itemActionIds = new int[] {
            R.id.widget_item1_action,
            R.id.widget_item2_action,
            R.id.widget_item3_action,
            R.id.widget_item4_action,
            R.id.widget_item5_action
        };

        views.setTextViewTextSize(
            R.id.widget_title,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(14f * scale, 11f, 16f)
        );
        views.setTextViewTextSize(
            R.id.widget_subtitle,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(11f * scale, 9f, 12f)
        );
        views.setTextViewTextSize(
            R.id.widget_line1,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(12f * scale, 9f, 13f)
        );
        views.setTextViewTextSize(
            R.id.widget_line2,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(12f * scale, 9f, 13f)
        );
        views.setTextViewTextSize(
            R.id.widget_line3,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(12f * scale, 9f, 13f)
        );
        views.setTextViewTextSize(
            R.id.widget_stat_primary,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(11f * scale, 8.5f, 12f)
        );
        views.setTextViewTextSize(
            R.id.widget_stat_secondary,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat(11f * scale, 8.5f, 12f)
        );
        views.setTextViewTextSize(
            R.id.widget_action,
            TypedValue.COMPLEX_UNIT_SP,
            clampFloat((compactItemCards ? 12f : 11f) * scale, 9f, 13f)
        );
        views.setTextViewTextSize(
            R.id.widget_action_only_button,
            TypedValue.COMPLEX_UNIT_SP,
            flatActionOnly
                ? clampFloat(16f * scale, 12f, 18f)
                : clampFloat(20f * scale, 16f, 24f)
        );

        for (int index = 0; index < itemTitleIds.length; index++) {
            views.setTextViewTextSize(
                itemTitleIds[index],
                TypedValue.COMPLEX_UNIT_SP,
                clampFloat(
                    (minimalItemCards ? 12f : denseItemCards ? 11.2f : 12f) * scale,
                    9.8f,
                    13.4f
                )
            );
            views.setTextViewTextSize(
                itemMetaIds[index],
                TypedValue.COMPLEX_UNIT_SP,
                clampFloat(
                    (compactItemCards ? 9.2f : denseItemCards ? 9.8f : 10.5f) * scale,
                    8f,
                    11.5f
                )
            );
            views.setTextViewTextSize(
                itemActionIds[index],
                TypedValue.COMPLEX_UNIT_SP,
                clampFloat(
                    (minimalItemCards ? 9.2f : denseItemCards ? 9.6f : 10.5f) * scale,
                    8f,
                    11.5f
                )
            );
        }

        int cardPadding = dpToPx(
            context,
            Math.round(
                (
                    flatActionOnly
                        ? 6f
                        : denseItemCards
                        ? (minimalItemCards ? 4f : compactItemCards ? 6f : 8f)
                        : 14f
                ) * scale
            )
        );
        int statPaddingHorizontal = dpToPx(context, Math.round(10f * scale));
        int statPaddingVertical = dpToPx(context, Math.round(6f * scale));
        int actionPaddingHorizontal = dpToPx(
            context,
            Math.round((compactItemCards ? 14f : 12f) * scale)
        );
        int actionPaddingVertical = dpToPx(
            context,
            Math.round((compactItemCards ? 10f : 6f) * scale)
        );
        int itemHorizontalPadding = dpToPx(
            context,
            Math.round(
                (minimalItemCards ? 6f : compactItemCards ? 7f : denseItemCards ? 8f : 10f) * scale
            )
        );
        int itemVerticalPadding = dpToPx(
            context,
            Math.round(
                (minimalItemCards ? 4f : compactItemCards ? 5f : denseItemCards ? 6f : 10f) * scale
            )
        );
        int itemActionHorizontalPadding = dpToPx(
            context,
            Math.round((minimalItemCards ? 7f : compactItemCards ? 8f : 10f) * scale)
        );
        int itemActionVerticalPadding = dpToPx(
            context,
            Math.round((minimalItemCards ? 3f : compactItemCards ? 4f : 6f) * scale)
        );
        int actionOnlyHorizontalPadding = dpToPx(
            context,
            Math.round((flatActionOnly ? 10f : 18f) * scale)
        );
        int actionOnlyVerticalPadding = dpToPx(
            context,
            Math.round((flatActionOnly ? 5f : 14f) * scale)
        );

        views.setViewPadding(
            R.id.widget_card,
            cardPadding,
            cardPadding,
            cardPadding,
            cardPadding
        );
        views.setViewPadding(
            R.id.widget_stat_primary,
            statPaddingHorizontal,
            statPaddingVertical,
            statPaddingHorizontal,
            statPaddingVertical
        );
        views.setViewPadding(
            R.id.widget_stat_secondary,
            statPaddingHorizontal,
            statPaddingVertical,
            statPaddingHorizontal,
            statPaddingVertical
        );
        views.setViewPadding(
            R.id.widget_action,
            actionPaddingHorizontal,
            actionPaddingVertical,
            actionPaddingHorizontal,
            actionPaddingVertical
        );
        views.setViewPadding(
            R.id.widget_action_only_button,
            actionOnlyHorizontalPadding,
            actionOnlyVerticalPadding,
            actionOnlyHorizontalPadding,
            actionOnlyVerticalPadding
        );
        for (int index = 0; index < itemContainerIds.length; index++) {
            views.setViewPadding(
                itemContainerIds[index],
                itemHorizontalPadding,
                itemVerticalPadding,
                itemHorizontalPadding,
                itemVerticalPadding
            );
            views.setViewPadding(
                itemActionIds[index],
                itemActionHorizontalPadding,
                itemActionVerticalPadding,
                itemActionHorizontalPadding,
                itemActionVerticalPadding
            );
        }

        views.setInt(R.id.widget_title, "setMaxLines", metrics.sizeClass == SIZE_LARGE ? 2 : 1);
        views.setInt(R.id.widget_subtitle, "setMaxLines", metrics.sizeClass == SIZE_LARGE ? 2 : 1);
        for (int index = 0; index < itemTitleIds.length; index++) {
            views.setInt(
                itemTitleIds[index],
                "setMaxLines",
                denseItemCards || compactItemCards ? 1 : metrics.sizeClass == SIZE_LARGE ? 2 : 1
            );
        }
        views.setInt(R.id.widget_action_only_button, "setMaxLines", 1);
    }

    private static Bitmap resolveCardBackgroundBitmap(
        Context context,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        String cacheKey = buildCardBackgroundCacheKey(palette, metrics);
        synchronized (RENDER_STATE_LOCK) {
            Bitmap cachedBitmap = CARD_BACKGROUND_CACHE.get(cacheKey);
            if (cachedBitmap != null) {
                return cachedBitmap;
            }
        }

        int widthPx = dpToPx(context, Math.max(metrics.minWidthDp, 170));
        int heightPx = dpToPx(context, Math.max(metrics.minHeightDp, 110));
        Bitmap bitmap = Bitmap.createBitmap(
            Math.max(widthPx, 1),
            Math.max(heightPx, 1),
            Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(bitmap);
        float radius = dpToPx(context, 22);
        float inset = Math.max(1f, dpToPx(context, 2));

        Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        fillPaint.setColor(palette.cardFillColor);
        Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(inset);
        borderPaint.setColor(palette.cardBorderColor);
        Paint glossPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        glossPaint.setColor(palette.cardGlossColor);

        RectF outer = new RectF(inset / 2f, inset / 2f, widthPx - inset / 2f, heightPx - inset / 2f);
        RectF gloss = new RectF(inset, inset, widthPx - inset, Math.max(heightPx * 0.44f, radius * 2f));
        canvas.drawRoundRect(outer, radius, radius, fillPaint);
        canvas.drawRoundRect(outer, radius, radius, borderPaint);
        canvas.drawRoundRect(gloss, radius, radius, glossPaint);
        synchronized (RENDER_STATE_LOCK) {
            CARD_BACKGROUND_CACHE.put(cacheKey, bitmap);
        }
        return bitmap;
    }

    private static Bitmap resolvePreviewBitmap(
        Context context,
        String kind,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics,
        String previewSignature
    ) {
        if (context == null || TextUtils.isEmpty(kind) || PREVIEW_SIGNATURE_NONE.equals(previewSignature)) {
            return null;
        }

        String cacheKey = kind
            + "|"
            + paletteSignature(palette)
            + "|"
            + metricsSignature(metrics)
            + "|"
            + previewSignature;
        synchronized (RENDER_STATE_LOCK) {
            Bitmap cachedBitmap = PREVIEW_BITMAP_CACHE.get(cacheKey);
            if (cachedBitmap != null) {
                return cachedBitmap;
            }
        }

        Bitmap bitmap = buildPreviewBitmap(context, kind, state, palette, metrics);
        if (bitmap != null) {
            synchronized (RENDER_STATE_LOCK) {
                PREVIEW_BITMAP_CACHE.put(cacheKey, bitmap);
            }
        }
        return bitmap;
    }

    private static String buildRenderKey(
        String kind,
        WidgetMetrics metrics,
        ThemePalette palette,
        WidgetContent content
    ) {
        SignatureAccumulator signature = new SignatureAccumulator();
        signature.addString(kind);
        signature.addString(metricsSignature(metrics));
        signature.addString(paletteSignature(palette));
        signature.addString(buildVisibleContentSignature(kind, content, metrics));
        signature.addString(buildVisibleActionSignature(kind, content, metrics));
        signature.addString(
            shouldShowPreview(kind, content, metrics) ? content.previewSignature : PREVIEW_SIGNATURE_NONE
        );
        return signature.finish();
    }

    private static String buildVisibleContentSignature(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        SignatureAccumulator signature = new SignatureAccumulator();
        boolean showPreview = shouldShowPreview(kind, content, metrics);
        boolean showStats = shouldShowStats(kind, content, metrics);
        int visibleCardCount = resolveVisibleCardCount(kind, content, metrics);
        int lineCapacity = resolveLineCapacity(kind, metrics, showPreview, visibleCardCount);

        signature.addString(
            shouldShowTitle(kind, content, metrics) && content != null ? content.title : ""
        );
        signature.addString(
            shouldShowSubtitle(kind, content, metrics) && content != null ? content.subtitle : ""
        );
        signature.addString(
            shouldShowActionOnlyShell(kind, content, metrics) && content != null
                ? content.actionLabel
                : ""
        );
        signature.addString(showStats && content != null ? content.statPrimary : "");
        signature.addString(showStats && content != null ? content.statSecondary : "");
        signature.addInt(lineCapacity);
        for (int index = 0; index < lineCapacity; index++) {
            signature.addString(pickLine(content == null ? null : content.lines, index));
        }

        signature.addInt(visibleCardCount);
        for (int index = 0; index < visibleCardCount; index++) {
            WidgetItemCard item = content.itemCards.get(index);
            signature.addString(item == null ? "" : item.title);
            signature.addString(item == null ? "" : item.meta);
            signature.addString(item == null ? "" : item.actionLabel);
            signature.addInt(item == null ? 0 : item.accentColor);
            signature.addBoolean(item != null && item.pending);
        }
        return signature.finish();
    }

    private static String buildVisibleActionSignature(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        SignatureAccumulator signature = new SignatureAccumulator();
        signature.addString(content == null ? "" : content.page);
        signature.addString(content == null ? "" : content.action);
        signature.addString(
            shouldShowAction(kind, content, metrics) && content != null ? content.directCommand : ""
        );
        signature.addString(
            shouldShowAction(kind, content, metrics) && content != null ? content.directTargetId : ""
        );

        int visibleCardCount = resolveVisibleCardCount(kind, content, metrics);
        signature.addInt(visibleCardCount);
        for (int index = 0; index < visibleCardCount; index++) {
            WidgetItemCard item = content.itemCards.get(index);
            signature.addString(item == null ? "" : item.command);
            signature.addString(item == null ? "" : item.targetId);
            signature.addBoolean(item != null && item.actionDisabled);
        }
        return signature.finish();
    }

    private static boolean shouldShowPreview(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (isActionOnlyKind(kind) || isListFirstKind(kind)) {
            return false;
        }
        if (metrics == null || content == null) {
            return false;
        }
        if (PREVIEW_SIGNATURE_NONE.equals(content.previewSignature)) {
            return false;
        }
        return isPreviewPrimaryKind(kind) || metrics.sizeClass != SIZE_COMPACT;
    }

    private static boolean shouldShowStats(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (isActionOnlyKind(kind) || isListFirstKind(kind)) {
            return false;
        }
        if (isPreviewPrimaryKind(kind) && metrics != null && metrics.sizeClass == SIZE_COMPACT) {
            return false;
        }
        return metrics != null
            && metrics.sizeClass != SIZE_COMPACT
            && content != null
            && (!TextUtils.isEmpty(content.statPrimary) || !TextUtils.isEmpty(content.statSecondary));
    }

    private static boolean shouldShowSubtitle(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (content == null) {
            return false;
        }
        if (isActionOnlyKind(kind)) {
            return false;
        }
        if (isListFirstKind(kind)) {
            return metrics != null
                && !shouldUseMinimalListCards(kind, metrics)
                && metrics.sizeClass == SIZE_LARGE
                && !TextUtils.isEmpty(content.subtitle);
        }
        if (isPreviewPrimaryKind(kind)) {
            return metrics != null
                && metrics.sizeClass == SIZE_LARGE
                && !TextUtils.isEmpty(content.subtitle);
        }
        return metrics != null
            && metrics.sizeClass != SIZE_COMPACT
            && !TextUtils.isEmpty(content.subtitle);
    }

    private static boolean shouldShowTitle(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (content == null || TextUtils.isEmpty(content.title)) {
            return false;
        }
        if (isActionOnlyKind(kind)) {
            return false;
        }
        if (isListFirstKind(kind) && shouldUseMinimalListCards(kind, metrics)) {
            return false;
        }
        if (isPreviewPrimaryKind(kind) && metrics != null && metrics.sizeClass == SIZE_COMPACT) {
            return false;
        }
        return true;
    }

    private static boolean shouldShowAction(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (isListFirstKind(kind) || isActionOnlyKind(kind)) {
            return false;
        }
        if (isPreviewPrimaryKind(kind)) {
            return false;
        }
        return content != null && !TextUtils.isEmpty(content.actionLabel);
    }

    private static boolean shouldShowActionOnlyShell(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        return isActionOnlyKind(kind)
            && content != null
            && !TextUtils.isEmpty(content.actionLabel);
    }

    private static int resolveVisibleCardCount(
        String kind,
        WidgetContent content,
        WidgetMetrics metrics
    ) {
        if (content == null || content.itemCards.isEmpty() || metrics == null) {
            return 0;
        }
        if (isListFirstKind(kind) || isPreviewPrimaryKind(kind)) {
            if (metrics.minWidthDp < 150 || metrics.minHeightDp < 112) {
                return Math.min(content.itemCards.size(), 1);
            }
            return Math.min(content.itemCards.size(), MAX_WIDGET_ITEM_CARD_COUNT);
        }
        return Math.min(
            content.itemCards.size(),
            metrics.sizeClass == SIZE_COMPACT ? 1 : metrics.sizeClass == SIZE_MEDIUM ? 2 : 3
        );
    }

    private static boolean isListFirstKind(String kind) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        return ControlerWidgetKinds.TODOS.equals(normalizedKind)
            || ControlerWidgetKinds.CHECKINS.equals(normalizedKind);
    }

    private static String resolveListItemDirectCommand(String kind) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        if (ControlerWidgetKinds.TODOS.equals(normalizedKind)) {
            return ControlerWidgetActionHandler.COMMAND_TOGGLE_TODO;
        }
        if (ControlerWidgetKinds.CHECKINS.equals(normalizedKind)) {
            return ControlerWidgetActionHandler.COMMAND_TOGGLE_CHECKIN;
        }
        return "";
    }

    private static boolean shouldUseCompactListCards(String kind, WidgetMetrics metrics) {
        return isListFirstKind(kind)
            && metrics != null
            && (
                metrics.sizeClass == SIZE_COMPACT
                    || metrics.minWidthDp < 210
                    || metrics.minHeightDp < 175
            );
    }

    private static boolean shouldUseMinimalListCards(String kind, WidgetMetrics metrics) {
        return isListFirstKind(kind)
            && metrics != null
            && (metrics.minWidthDp < 170 || metrics.minHeightDp < 145);
    }

    private static boolean shouldUseCompactPreviewSupplementaryCards(
        String kind,
        WidgetMetrics metrics
    ) {
        return isPreviewPrimaryKind(kind)
            && metrics != null
            && (
                metrics.sizeClass != SIZE_LARGE
                    || metrics.minWidthDp < 260
                    || metrics.minHeightDp < 215
            );
    }

    private static boolean shouldUseMinimalPreviewSupplementaryCards(
        String kind,
        WidgetMetrics metrics
    ) {
        return isPreviewPrimaryKind(kind)
            && metrics != null
            && (metrics.minWidthDp < 210 || metrics.minHeightDp < 160);
    }

    private static boolean isActionOnlyKind(String kind) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        return ControlerWidgetKinds.START_TIMER.equals(normalizedKind)
            || ControlerWidgetKinds.WRITE_DIARY.equals(normalizedKind);
    }

    private static boolean isPreviewPrimaryKind(String kind) {
        String normalizedKind = ControlerWidgetKinds.normalize(kind);
        return ControlerWidgetKinds.WEEK_GRID.equals(normalizedKind)
            || ControlerWidgetKinds.DAY_PIE.equals(normalizedKind)
            || ControlerWidgetKinds.WEEK_VIEW.equals(normalizedKind)
            || ControlerWidgetKinds.YEAR_VIEW.equals(normalizedKind);
    }

    private static int resolveLineCapacity(
        String kind,
        WidgetMetrics metrics,
        boolean showPreview,
        int visibleCardCount
    ) {
        if (metrics == null) {
            return 0;
        }
        if (isListFirstKind(kind)) {
            return 0;
        }
        if (visibleCardCount > 0) {
            return 0;
        }
        if (isPreviewPrimaryKind(kind)) {
            if (metrics.sizeClass == SIZE_COMPACT) {
                return 0;
            }
            if (metrics.sizeClass == SIZE_MEDIUM) {
                return showPreview ? 1 : 2;
            }
            return showPreview ? 2 : 3;
        }
        if (metrics.sizeClass == SIZE_COMPACT) {
            return 2;
        }
        if (metrics.sizeClass == SIZE_MEDIUM) {
            return showPreview ? 2 : 3;
        }
        return 3;
    }

    private static String buildCardBackgroundCacheKey(ThemePalette palette, WidgetMetrics metrics) {
        return paletteSignature(palette)
            + "|"
            + Math.max(metrics == null ? 0 : metrics.minWidthDp, 170)
            + "x"
            + Math.max(metrics == null ? 0 : metrics.minHeightDp, 110)
            + "|"
            + metricsSignature(metrics);
    }

    private static String paletteSignature(ThemePalette palette) {
        SignatureAccumulator signature = new SignatureAccumulator();
        if (palette == null) {
            return signature.finish();
        }
        signature.addInt(palette.backgroundColor);
        signature.addInt(palette.surfaceColor);
        signature.addInt(palette.borderColor);
        signature.addInt(palette.titleColor);
        signature.addInt(palette.subtitleColor);
        signature.addInt(palette.bodyColor);
        signature.addInt(palette.actionTextColor);
        signature.addInt(palette.accentColor);
        signature.addInt(palette.accentTextColor);
        signature.addInt(palette.contrastReferenceColor);
        signature.addInt(palette.cardFillColor);
        signature.addInt(palette.cardBorderColor);
        signature.addInt(palette.cardGlossColor);
        signature.addBoolean(palette.surfaceIsLight);
        return signature.finish();
    }

    private static String metricsSignature(WidgetMetrics metrics) {
        SignatureAccumulator signature = new SignatureAccumulator();
        if (metrics == null) {
            return signature.finish();
        }
        signature.addInt(metrics.sizeClass);
        signature.addInt(metrics.minWidthDp);
        signature.addInt(metrics.minHeightDp);
        signature.addInt(Math.round(metrics.scale * 1000f));
        return signature.finish();
    }

    private static boolean hasSameRenderKey(int appWidgetId, String renderKey) {
        synchronized (RENDER_STATE_LOCK) {
            return TextUtils.equals(LAST_RENDER_KEYS.get(appWidgetId), renderKey);
        }
    }

    private static String getRememberedRenderKey(int appWidgetId) {
        synchronized (RENDER_STATE_LOCK) {
            String renderKey = LAST_RENDER_KEYS.get(appWidgetId);
            return renderKey == null ? "" : renderKey;
        }
    }

    private static void rememberRenderKey(int appWidgetId, String renderKey) {
        synchronized (RENDER_STATE_LOCK) {
            LAST_RENDER_KEYS.put(appWidgetId, renderKey == null ? "" : renderKey);
        }
    }

    private static int[] toIntArray(List<Integer> values) {
        if (values == null || values.isEmpty()) {
            return new int[0];
        }
        int[] result = new int[values.size()];
        for (int index = 0; index < values.size(); index++) {
            result[index] = values.get(index) == null ? 0 : values.get(index);
        }
        return result;
    }

    private static void cancelPendingRefresh() {
        synchronized (REFRESH_LOCK) {
            if (pendingRefreshRunnable != null) {
                REFRESH_HANDLER.removeCallbacks(pendingRefreshRunnable);
                pendingRefreshRunnable = null;
            }
            if (pendingSameKindRefreshRunnable != null) {
                REFRESH_HANDLER.removeCallbacks(pendingSameKindRefreshRunnable);
                pendingSameKindRefreshRunnable = null;
            }
            if (pendingAffectedRefreshRunnable != null) {
                REFRESH_HANDLER.removeCallbacks(pendingAffectedRefreshRunnable);
                pendingAffectedRefreshRunnable = null;
            }
            if (pendingThemeRefreshRunnable != null) {
                REFRESH_HANDLER.removeCallbacks(pendingThemeRefreshRunnable);
                pendingThemeRefreshRunnable = null;
            }
            pendingImmediateBatch = new RefreshBatch();
            pendingSameKindBatch = new RefreshBatch();
            pendingAffectedBatch = new RefreshBatch();
            pendingThemeBatch = new RefreshBatch();
        }
    }

    private static int bitmapSizeOf(Bitmap bitmap) {
        return bitmap == null ? 0 : bitmap.getByteCount();
    }

    private static int dpToPx(Context context, int dp) {
        float density = context == null ? 1f : context.getResources().getDisplayMetrics().density;
        return Math.max(1, Math.round(dp * density));
    }

    private static float clampFloat(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private static int safeParse(String value) {
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static int withAlpha(int color, double alphaFraction) {
        int safeAlpha = (int) Math.round(clampFloat((float) alphaFraction, 0f, 1f) * 255f);
        return Color.argb(safeAlpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    private static int blendColors(int baseColor, int overlayColor, float overlayRatio) {
        float safeRatio = clampFloat(overlayRatio, 0f, 1f);
        float inverseRatio = 1f - safeRatio;
        return Color.argb(
            Math.round(Color.alpha(baseColor) * inverseRatio + Color.alpha(overlayColor) * safeRatio),
            Math.round(Color.red(baseColor) * inverseRatio + Color.red(overlayColor) * safeRatio),
            Math.round(Color.green(baseColor) * inverseRatio + Color.green(overlayColor) * safeRatio),
            Math.round(Color.blue(baseColor) * inverseRatio + Color.blue(overlayColor) * safeRatio)
        );
    }

    private static Uri buildWidgetPendingIntentData(
        String type,
        int appWidgetId,
        String kind,
        String action,
        String targetId
    ) {
        Uri.Builder builder = new Uri.Builder()
            .scheme("controler-widget")
            .authority(TextUtils.isEmpty(type) ? "action" : type)
            .appendPath(String.valueOf(appWidgetId));
        if (!TextUtils.isEmpty(kind)) {
            builder.appendQueryParameter("kind", kind);
        }
        if (!TextUtils.isEmpty(action)) {
            builder.appendQueryParameter("action", action);
        }
        if (!TextUtils.isEmpty(targetId)) {
            builder.appendQueryParameter("targetId", targetId);
        }
        return builder.build();
    }

    private static int buildStablePendingIntentRequestCode(Uri identityUri) {
        if (identityUri == null) {
            return 0;
        }
        return identityUri.toString().hashCode() & 0x7fffffff;
    }

    private static PendingIntent buildOpenMainPendingIntent(
        Context context,
        int appWidgetId,
        String kind,
        WidgetContent content
    ) {
        String launchAction =
            ControlerWidgetKinds.START_TIMER.equals(ControlerWidgetKinds.normalize(kind))
                    && content != null
                    && ControlerWidgetActionHandler.COMMAND_TOGGLE_TIMER.equals(content.directCommand)
                ? ""
                : content == null ? "" : content.action;
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(OPEN_WIDGET_ACTION_PREFIX + "." + kind + "." + appWidgetId);
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_PAGE, content.page);
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_ACTION, launchAction);
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_KIND, kind);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        Uri identityUri = buildWidgetPendingIntentData(
            "open",
            appWidgetId,
            kind,
            launchAction,
            content == null ? "" : content.page
        );
        intent.setData(identityUri);

        int requestCode = buildStablePendingIntentRequestCode(identityUri);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    private static JSONArray buildCollectionRowsPayload(
        WidgetContent content,
        ThemePalette palette
    ) {
        JSONArray rows = new JSONArray();
        if (content == null || content.itemCards.isEmpty()) {
            return rows;
        }

        int rowSurfaceColor = resolveCollectionRowSurfaceColor(palette);
        int rowTitleColor = resolveReadableTextColor(
            palette == null ? Color.parseColor("#EAF6ED") : palette.bodyColor,
            rowSurfaceColor,
            4.2d
        );
        int rowMetaColor = resolveReadableTextColor(
            palette == null ? Color.parseColor("#D2E4D7") : palette.subtitleColor,
            rowSurfaceColor,
            3.0d
        );

        for (WidgetItemCard item : content.itemCards) {
            if (item == null) {
                continue;
            }
            JSONObject row = new JSONObject();
            try {
                row.put("title", safeText(item.title));
                row.put("meta", safeText(item.meta));
                row.put("targetId", safeText(item.targetId));
                row.put("accentColor", item.accentColor);
                row.put("backgroundColor", rowSurfaceColor);
                row.put("titleColor", rowTitleColor);
                row.put("metaColor", rowMetaColor);
                rows.put(row);
            } catch (Exception ignored) {
                // Skip malformed row payloads so the rest of the collection can render.
            }
        }
        return rows;
    }

    private static int resolveCollectionRowSurfaceColor(ThemePalette palette) {
        ThemePalette safePalette = palette == null ? new ThemePalette() : palette;
        return blendColors(
            safePalette.cardFillColor,
            safePalette.contrastReferenceColor,
            safePalette.surfaceIsLight ? 0.08f : 0.10f
        );
    }

    private static Intent buildCollectionServiceIntent(
        Context context,
        int appWidgetId,
        String kind
    ) {
        Intent intent = new Intent(context, ControlerWidgetCollectionService.class);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID, appWidgetId);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND, kind);
        intent.setData(
            buildWidgetPendingIntentData("collection", appWidgetId, kind, "rows", "")
        );
        return intent;
    }

    private static PendingIntent buildCollectionItemTemplatePendingIntent(
        Context context,
        int appWidgetId,
        String kind,
        WidgetContent content
    ) {
        String directCommand = resolveListItemDirectCommand(kind);
        if (!TextUtils.isEmpty(directCommand)) {
            Intent intent = new Intent(
                context,
                ControlerWidgetKinds.providerClassForKind(kind)
            );
            intent.setAction(ControlerWidgetActionHandler.ACTION_EXECUTE);
            intent.putExtra(ControlerWidgetActionHandler.EXTRA_COMMAND, directCommand);
            intent.putExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND, kind);
            intent.putExtra(ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID, appWidgetId);
            Uri identityUri = buildWidgetPendingIntentData(
                "collection-direct",
                appWidgetId,
                kind,
                directCommand,
                ""
            );
            intent.setData(identityUri);

            int requestCode = buildStablePendingIntentRequestCode(identityUri);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            return PendingIntent.getBroadcast(context, requestCode, intent, flags);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(
            OPEN_WIDGET_ACTION_PREFIX + ".collection." + kind + "." + appWidgetId
        );
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_PAGE, content.page);
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_ACTION, content.action);
        intent.putExtra(ControlerWidgetLaunchStore.EXTRA_KIND, kind);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        Uri identityUri = buildWidgetPendingIntentData(
            "collection-open",
            appWidgetId,
            kind,
            content == null ? "" : content.action,
            content == null ? "" : content.page
        );
        intent.setData(identityUri);

        int requestCode = buildStablePendingIntentRequestCode(identityUri);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    private static PendingIntent buildDirectActionPendingIntent(
        Context context,
        int appWidgetId,
        String kind,
        WidgetContent content
    ) {
        return buildDirectActionPendingIntent(
            context,
            appWidgetId,
            kind,
            content == null ? "" : content.directCommand,
            content == null ? "" : content.directTargetId
        );
    }

    private static PendingIntent buildDirectActionPendingIntent(
        Context context,
        int appWidgetId,
        String kind,
        String command,
        String targetId
    ) {
        Intent intent = new Intent(
            context,
            ControlerWidgetKinds.providerClassForKind(kind)
        );
        intent.setAction(ControlerWidgetActionHandler.ACTION_EXECUTE);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_COMMAND, command);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_TARGET_ID, targetId);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND, kind);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID, appWidgetId);
        Uri identityUri = buildWidgetPendingIntentData(
            "direct",
            appWidgetId,
            kind,
            command,
            targetId
        );
        intent.setData(identityUri);

        int requestCode = buildStablePendingIntentRequestCode(identityUri);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    private static PendingIntent buildRefreshPendingIntent(
        Context context,
        int appWidgetId,
        String kind
    ) {
        Intent intent = new Intent(
            context,
            ControlerWidgetKinds.providerClassForKind(kind)
        );
        intent.setAction(ControlerWidgetActionHandler.ACTION_EXECUTE);
        intent.putExtra(
            ControlerWidgetActionHandler.EXTRA_COMMAND,
            ControlerWidgetActionHandler.COMMAND_REFRESH_WIDGET
        );
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND, kind);
        intent.putExtra(ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID, appWidgetId);
        Uri identityUri = buildWidgetPendingIntentData(
            "refresh",
            appWidgetId,
            kind,
            ControlerWidgetActionHandler.COMMAND_REFRESH_WIDGET,
            ""
        );
        intent.setData(identityUri);

        int requestCode = buildStablePendingIntentRequestCode(identityUri);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    private static void applyItemCardContent(
        Context context,
        RemoteViews views,
        int appWidgetId,
        String kind,
        ThemePalette palette,
        WidgetItemCard item,
        int containerId,
        int accentId,
        int titleId,
        int metaId,
        int actionId,
        PendingIntent openIntent,
        WidgetMetrics metrics
    ) {
        if (item == null) {
            views.setViewVisibility(containerId, View.GONE);
            views.setTextViewText(titleId, "");
            views.setTextViewText(metaId, "");
            views.setTextViewText(actionId, "");
            return;
        }

        boolean compactListCards = shouldUseCompactListCards(kind, metrics);
        boolean minimalListCards = shouldUseMinimalListCards(kind, metrics);
        views.setViewVisibility(containerId, View.VISIBLE);
        views.setTextViewText(titleId, safeText(item.title));
        views.setTextViewText(metaId, safeText(item.meta));
        views.setViewVisibility(
            metaId,
            compactListCards || minimalListCards || TextUtils.isEmpty(item.meta)
                ? View.GONE
                : View.VISIBLE
        );
        views.setTextViewText(actionId, safeText(item.actionLabel));
        views.setViewVisibility(
            actionId,
            minimalListCards || TextUtils.isEmpty(item.actionLabel) ? View.GONE : View.VISIBLE
        );
        int accentColor =
            palette == null
                ? item.accentColor
                : resolveVisibleAccentColor(item.accentColor, palette.surfaceColor, palette.accentColor);
        views.setInt(accentId, "setBackgroundColor", accentColor);
        views.setViewVisibility(
            accentId,
            compactListCards || minimalListCards ? View.GONE : View.VISIBLE
        );

        PendingIntent actionIntent = TextUtils.isEmpty(item.command)
            ? openIntent
            : buildDirectActionPendingIntent(
                context,
                appWidgetId,
                kind,
                item.command,
                item.targetId
            );
        PendingIntent disabledIntent = buildRefreshPendingIntent(
            context,
            appWidgetId,
            kind
        );
        PendingIntent effectiveActionIntent =
            item.actionDisabled ? disabledIntent : actionIntent;
        views.setOnClickPendingIntent(
            containerId,
            item.actionDisabled
                ? disabledIntent
                : TextUtils.isEmpty(item.command)
                    ? openIntent
                    : actionIntent
        );
        views.setOnClickPendingIntent(actionId, effectiveActionIntent);
    }

    private static String defaultOpenActionLabel(String kind) {
        switch (kind) {
            case ControlerWidgetKinds.WRITE_DIARY:
                return "继续记录";
            case ControlerWidgetKinds.WEEK_GRID:
                return "查看周表";
            case ControlerWidgetKinds.DAY_PIE:
                return "查看饼图";
            case ControlerWidgetKinds.WEEK_VIEW:
                return "查看周视图";
            case ControlerWidgetKinds.YEAR_VIEW:
                return "查看年视图";
            default:
                return "打开应用";
        }
    }

    private static WidgetContent buildWidgetContent(
        Context context,
        String kind,
        ControlerWidgetDataStore.State state,
        boolean includePreview,
        int appWidgetId
    ) {
        WidgetContent content = new WidgetContent();
        content.title = ControlerWidgetKinds.label(kind);
        content.page = ControlerWidgetKinds.defaultPage(kind);
        content.action = ControlerWidgetKinds.defaultAction(kind);
        content.actionLabel = defaultOpenActionLabel(kind);

        switch (kind) {
            case ControlerWidgetKinds.START_TIMER:
                fillStartTimerContent(content, state);
                break;
            case ControlerWidgetKinds.WRITE_DIARY:
                fillWriteDiaryContent(content, state);
                break;
            case ControlerWidgetKinds.WEEK_GRID:
                fillWeekGridContent(content, state);
                break;
            case ControlerWidgetKinds.DAY_PIE:
                fillDayPieContent(content, state);
                break;
            case ControlerWidgetKinds.TODOS:
                fillTodosContent(content, state, appWidgetId);
                break;
            case ControlerWidgetKinds.CHECKINS:
                fillCheckinsContent(content, state, appWidgetId);
                break;
            case ControlerWidgetKinds.WEEK_VIEW:
                fillWeekViewContent(content, state);
                break;
            case ControlerWidgetKinds.YEAR_VIEW:
                fillYearViewContent(content, state);
                break;
            default:
                content.subtitle = "打开应用查看详情";
                content.lines.add("当前小组件类型暂未定义。");
                break;
        }
        return finalizeWidgetContent(content, kind, state, includePreview);
    }

    private static WidgetContent finalizeWidgetContent(
        WidgetContent content,
        String kind,
        ControlerWidgetDataStore.State state,
        boolean includePreview
    ) {
        if (content == null) {
            content = new WidgetContent();
        }

        if (TextUtils.isEmpty(content.actionLabel)) {
            content.actionLabel = TextUtils.isEmpty(content.directCommand)
                ? "打开应用"
                : "执行";
        }

        if (content.lines.isEmpty() && !content.actionOnly) {
            content.lines.add("暂无数据，打开应用后可继续补充。");
        }
        while (!content.actionOnly && content.lines.size() < 3) {
            content.lines.add("");
        }

        content.contentSignature = buildContentSignature(content);
        content.actionSignature = buildActionSignature(content);
        content.previewSignature =
            includePreview && hasPreviewData(kind, state)
                ? buildPreviewSignature(kind, state)
                : PREVIEW_SIGNATURE_NONE;
        content.previewBitmap = null;
        return content;
    }

    private static String buildContentSignature(WidgetContent content) {
        SignatureAccumulator signature = new SignatureAccumulator();
        signature.addString(content == null ? "" : content.title);
        signature.addString(content == null ? "" : content.subtitle);
        signature.addString(content == null ? "" : content.actionLabel);
        signature.addString(content == null ? "" : content.statPrimary);
        signature.addString(content == null ? "" : content.statSecondary);

        int lineLimit = content == null ? 0 : Math.min(content.lines.size(), 3);
        signature.addInt(lineLimit);
        for (int index = 0; index < lineLimit; index++) {
            signature.addString(pickLine(content.lines, index));
        }

        int itemLimit = content == null ? 0 : content.itemCards.size();
        signature.addInt(itemLimit);
        for (int index = 0; index < itemLimit; index++) {
            WidgetItemCard item = content.itemCards.get(index);
            signature.addString(item == null ? "" : item.title);
            signature.addString(item == null ? "" : item.meta);
            signature.addString(item == null ? "" : item.actionLabel);
            signature.addInt(item == null ? 0 : item.accentColor);
            signature.addBoolean(item != null && item.pending);
        }
        return signature.finish();
    }

    private static String buildActionSignature(WidgetContent content) {
        SignatureAccumulator signature = new SignatureAccumulator();
        signature.addString(content == null ? "" : content.page);
        signature.addString(content == null ? "" : content.action);
        signature.addString(content == null ? "" : content.directCommand);
        signature.addString(content == null ? "" : content.directTargetId);

        int itemLimit = content == null ? 0 : content.itemCards.size();
        signature.addInt(itemLimit);
        for (int index = 0; index < itemLimit; index++) {
            WidgetItemCard item = content.itemCards.get(index);
            signature.addString(item == null ? "" : item.command);
            signature.addString(item == null ? "" : item.targetId);
            signature.addBoolean(item != null && item.actionDisabled);
        }
        return signature.finish();
    }

    private static boolean hasPreviewData(String kind, ControlerWidgetDataStore.State state) {
        if (TextUtils.isEmpty(kind)) {
            return false;
        }
        if (state == null) {
            return false;
        }

        switch (kind) {
            case ControlerWidgetKinds.START_TIMER:
            case ControlerWidgetKinds.WRITE_DIARY:
                return false;
            case ControlerWidgetKinds.DAY_PIE:
                return hasTodayRecordMinutes(state.records);
            default:
                return true;
        }
    }

    private static boolean hasTodayRecordMinutes(List<ControlerWidgetDataStore.RecordInfo> records) {
        String today = todayText();
        if (records == null) {
            return false;
        }
        for (ControlerWidgetDataStore.RecordInfo record : records) {
            if (record != null && isRecordOnDate(record, today) && Math.max(0, record.minutes) > 0) {
                return true;
            }
        }
        return false;
    }

    private static String buildPreviewSignature(
        String kind,
        ControlerWidgetDataStore.State state
    ) {
        SignatureAccumulator signature = new SignatureAccumulator();
        signature.addString(kind);
        if (state == null) {
            return signature.finish();
        }

        switch (kind) {
            case ControlerWidgetKinds.START_TIMER:
                appendRecordSignature(signature, state.records);
                appendTimerSessionSignature(signature, state.timerSession);
                break;
            case ControlerWidgetKinds.WRITE_DIARY:
                appendDiaryEntriesSignature(signature, state.diaryEntries);
                break;
            case ControlerWidgetKinds.WEEK_GRID:
            case ControlerWidgetKinds.DAY_PIE:
                appendProjectSignature(signature, state.projects);
                appendRecordSignature(signature, state.records);
                break;
            case ControlerWidgetKinds.TODOS:
                appendTodoSignature(signature, state.todos);
                break;
            case ControlerWidgetKinds.CHECKINS:
                appendCheckinItemSignature(signature, state.checkinItems);
                appendDailyCheckinSignature(signature, state.dailyCheckins);
                break;
            case ControlerWidgetKinds.WEEK_VIEW:
                appendPlanSignature(signature, state.plans);
                break;
            case ControlerWidgetKinds.YEAR_VIEW:
                appendRecordSignature(signature, state.records);
                appendYearGoalSignature(signature, state.goalsByMonth, state.annualGoals);
                break;
            default:
                break;
        }

        return signature.finish();
    }

    private static void fillStartTimerContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        boolean timerActive = isTimerSessionActive(state);
        content.actionOnly = true;
        content.subtitle = "";
        content.actionLabel = timerActive ? "停止计时" : "开始计时";
        content.directCommand = ControlerWidgetActionHandler.COMMAND_TOGGLE_TIMER;
        content.directTargetId = "";
        content.statPrimary = "";
        content.statSecondary = "";
    }

    private static void fillWriteDiaryContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        content.actionOnly = true;
        content.subtitle = "";
        content.actionLabel = "写日记";
        content.directCommand = "";
        content.directTargetId = "";
        content.statPrimary = "";
        content.statSecondary = "";
    }

    private static void fillRecordListContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        List<ControlerWidgetDataStore.RecordInfo> records = new ArrayList<>(state.records);
        sortRecordsByTimestampDesc(records);
        content.subtitle = "今天和昨天";
        int recentMinutes = 0;
        int recentCount = 0;
        String today = todayText();
        Calendar yesterday = Calendar.getInstance();
        yesterday.add(Calendar.DAY_OF_MONTH, -1);
        String yesterdayText = dateText(yesterday);
        List<ControlerWidgetDataStore.RecordInfo> recentRecords = new ArrayList<>();
        for (ControlerWidgetDataStore.RecordInfo record : records) {
            if (isRecordOnDate(record, today) || isRecordOnDate(record, yesterdayText)) {
                recentMinutes += Math.max(0, record.minutes);
                recentCount++;
                recentRecords.add(record);
            }
        }
        content.statPrimary = "近 2 天 " + recentCount + " 条";
        content.statSecondary = formatMinutes(recentMinutes);
        int limit = Math.min(3, recentRecords.size());
        for (int i = 0; i < limit; i++) {
            ControlerWidgetDataStore.RecordInfo record = recentRecords.get(i);
            String title = safeText(record.name);
            String spend = !TextUtils.isEmpty(record.spendtime) ? record.spendtime : formatMinutes(record.minutes);
            String dayLabel = isRecordOnDate(record, today)
                ? "今天"
                : isRecordOnDate(record, yesterdayText) ? "昨天" : safeText(record.dateText);
            content.lines.add(dayLabel + " · " + title + " · " + spend);
        }
        if (limit == 0) {
            content.lines.add("暂无时间记录");
        }
    }

    private static void fillWeekGridContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        content.subtitle = "一周时间分布";
        Calendar today = Calendar.getInstance();
        resetToStartOfDay(today);
        Calendar startDay = (Calendar) today.clone();
        startDay.add(Calendar.DAY_OF_MONTH, -6);
        Map<String, Integer> minutesByDate = new HashMap<>();
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            String date = resolveRecordDateText(record);
            if (!TextUtils.isEmpty(date)) {
                minutesByDate.put(date, minutesByDate.containsKey(date)
                    ? minutesByDate.get(date) + Math.max(0, record.minutes)
                    : Math.max(0, record.minutes));
            }
        }

        int weekTotal = 0;
        for (int offset = 0; offset < 7; offset++) {
            Calendar date = (Calendar) today.clone();
            date.add(Calendar.DAY_OF_MONTH, -offset);
            String dateText = dateText(date);
            weekTotal += minutesByDate.containsKey(dateText) ? minutesByDate.get(dateText) : 0;
        }
        content.statPrimary = "近 7 天";
        content.statSecondary = formatMinutes(weekTotal);
        content.lines.add("近 7 天累计 " + formatMinutes(weekTotal));
        content.itemCards.addAll(buildWeekGridSummaryCards(state, startDay, 7));

        for (int offset = 0; offset < 2; offset++) {
            Calendar date = (Calendar) today.clone();
            date.add(Calendar.DAY_OF_MONTH, -offset);
            String dateText = dateText(date);
            int minutes = minutesByDate.containsKey(dateText) ? minutesByDate.get(dateText) : 0;
            content.lines.add(shortWeekLabel(date) + " " + formatMinutes(minutes));
        }
    }

    private static void fillDayPieContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        String today = todayText();
        Map<String, Integer> minutesByProject = new HashMap<>();
        int total = 0;

        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (!isRecordOnDate(record, today)) {
                continue;
            }
            int minutes = Math.max(0, record.minutes);
            if (minutes <= 0) {
                continue;
            }
            String key = !TextUtils.isEmpty(record.projectId) ? record.projectId : record.name;
            if (TextUtils.isEmpty(key)) {
                key = "未分类";
            }
            minutesByProject.put(key, minutesByProject.containsKey(key)
                ? minutesByProject.get(key) + minutes
                : minutes);
            total += minutes;
        }

        content.subtitle = "今日项目占比";
        if (total <= 0) {
            content.lines.add("今天暂无可统计数据");
            return;
        }
        content.statPrimary = "总计 " + formatMinutes(total);

        List<Map.Entry<String, Integer>> entries = new ArrayList<>(minutesByProject.entrySet());
        Collections.sort(entries, new Comparator<Map.Entry<String, Integer>>() {
            @Override
            public int compare(Map.Entry<String, Integer> left, Map.Entry<String, Integer> right) {
                return right.getValue() - left.getValue();
            }
        });

        content.statSecondary = "项目 " + entries.size() + " 个";
    }

    private static void fillHeatmapContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        content.subtitle = "近 20 周活跃热度";
        Set<String> activeDays = new HashSet<>();
        Map<String, Integer> minutesByDate = new HashMap<>();
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            String date = !TextUtils.isEmpty(record.dateText)
                ? record.dateText
                : ControlerWidgetDataStore.extractDateText(record.timestamp);
            if (TextUtils.isEmpty(date)) {
                continue;
            }
            activeDays.add(date);
            minutesByDate.put(date, minutesByDate.containsKey(date)
                ? minutesByDate.get(date) + Math.max(0, record.minutes)
                : Math.max(0, record.minutes));
        }

        int recentWeekMinutes = 0;
        Calendar now = Calendar.getInstance();
        for (int i = 0; i < 7; i++) {
            Calendar date = (Calendar) now.clone();
            date.add(Calendar.DAY_OF_MONTH, -i);
            String dateText = dateText(date);
            recentWeekMinutes += minutesByDate.containsKey(dateText) ? minutesByDate.get(dateText) : 0;
        }

        content.lines.add("活跃天数 " + activeDays.size() + " 天");
        content.lines.add("近 7 天 " + formatMinutes(recentWeekMinutes));
        content.lines.add("打开应用查看完整热度视图");
        content.statPrimary = "活跃 " + activeDays.size() + " 天";
        content.statSecondary = formatMinutes(recentWeekMinutes);
    }

    private static void fillDayLineContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        String today = todayText();
        int[] buckets = new int[24];
        int total = 0;
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (!isRecordOnDate(record, today)) {
                continue;
            }
            int hour = Math.max(0, Math.min(23, record.hour));
            int minutes = Math.max(0, record.minutes);
            buckets[hour] += minutes;
            total += minutes;
        }

        content.subtitle = "今日小时投入曲线";
        content.lines.add("今日总计 " + formatMinutes(total));
        content.statPrimary = "今日 " + formatMinutes(total);
        for (int rank = 0; rank < 2; rank++) {
            int bestHour = -1;
            int bestMinutes = -1;
            for (int hour = 0; hour < buckets.length; hour++) {
                if (buckets[hour] > bestMinutes) {
                    bestMinutes = buckets[hour];
                    bestHour = hour;
                }
            }
            if (bestHour < 0 || bestMinutes <= 0) {
                content.lines.add(rank == 0 ? "暂无峰值小时" : "");
                break;
            }
            if (rank == 0) {
                content.statSecondary =
                    String.format(Locale.CHINA, "%02d:00 %s", bestHour, formatMinutes(bestMinutes));
            }
            content.lines.add(String.format(Locale.CHINA, "%02d:00 %s", bestHour, formatMinutes(bestMinutes)));
            buckets[bestHour] = 0;
        }
    }

    private static boolean isTodoPendingForWidget(
        ControlerWidgetDataStore.TodoInfo todo,
        int appWidgetId
    ) {
        return todo != null
            && ControlerWidgetPendingActionStore.get(
                ControlerWidgetKinds.TODOS,
                todo.id,
                appWidgetId
            ) != null;
    }

    private static boolean resolveTodoCompletedForWidget(
        ControlerWidgetDataStore.TodoInfo todo,
        int appWidgetId
    ) {
        ControlerWidgetPendingActionStore.PendingAction pendingAction =
            todo == null
                ? null
                : ControlerWidgetPendingActionStore.get(
                    ControlerWidgetKinds.TODOS,
                    todo.id,
                    appWidgetId
                );
        return pendingAction != null ? pendingAction.todoCompleted : todo != null && todo.completed;
    }

    private static boolean resolveCheckinDoneForWidget(
        ControlerWidgetDataStore.State state,
        String itemId,
        String today,
        int appWidgetId
    ) {
        ControlerWidgetPendingActionStore.PendingAction pendingAction =
            ControlerWidgetPendingActionStore.get(
                ControlerWidgetKinds.CHECKINS,
                itemId,
                appWidgetId
            );
        return pendingAction != null
            ? pendingAction.checkinChecked
            : isCheckinDoneForDate(state.dailyCheckins, itemId, today);
    }

    private static boolean isCheckinPendingForWidget(
        String itemId,
        int appWidgetId
    ) {
        return ControlerWidgetPendingActionStore.get(
            ControlerWidgetKinds.CHECKINS,
            itemId,
            appWidgetId
        ) != null;
    }

    private static String appendPendingMeta(String meta) {
        String normalized = safeText(meta);
        return TextUtils.isEmpty(normalized) ? "同步中" : normalized + " · 同步中";
    }

    private static void fillTodosContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state,
        int appWidgetId
    ) {
        String today = todayText();
        List<ControlerWidgetDataStore.TodoInfo> visibleTodos = new ArrayList<>();
        int todayCount = 0;
        int pendingCount = 0;
        for (ControlerWidgetDataStore.TodoInfo todo : state.todos) {
            boolean scheduledToday = todoScheduledOn(todo, calendarFromDateText(today), today);
            boolean completed = resolveTodoCompletedForWidget(todo, appWidgetId);
            if (scheduledToday) {
                todayCount++;
                visibleTodos.add(todo);
            }
            if (!completed) {
                pendingCount++;
                if (!scheduledToday) {
                    visibleTodos.add(todo);
                }
            }
        }
        Collections.sort(
            visibleTodos,
            new Comparator<ControlerWidgetDataStore.TodoInfo>() {
                @Override
                public int compare(
                    ControlerWidgetDataStore.TodoInfo left,
                    ControlerWidgetDataStore.TodoInfo right
                ) {
                    boolean leftToday = todoScheduledOn(left, calendarFromDateText(today), today);
                    boolean rightToday = todoScheduledOn(right, calendarFromDateText(today), today);
                    boolean leftCompleted = resolveTodoCompletedForWidget(left, appWidgetId);
                    boolean rightCompleted = resolveTodoCompletedForWidget(right, appWidgetId);
                    if (leftToday != rightToday) {
                        return leftToday ? -1 : 1;
                    }
                    if (leftCompleted != rightCompleted) {
                        return leftCompleted ? 1 : -1;
                    }
                    boolean leftOverdue = isWidgetTodoOverdue(left, today, leftCompleted);
                    boolean rightOverdue = isWidgetTodoOverdue(right, today, rightCompleted);
                    if (leftOverdue != rightOverdue) {
                        return leftOverdue ? -1 : 1;
                    }
                    int dateCompare = compareWidgetDateText(
                        resolveWidgetTodoSortDate(left, today),
                        resolveWidgetTodoSortDate(right, today)
                    );
                    if (dateCompare != 0) {
                        return dateCompare;
                    }
                    return safeText(left.title).compareTo(safeText(right.title));
                }
            }
        );
        content.subtitle = todayCount > 0 ? "今日待办" : "待处理待办";
        content.actionLabel = "打开待办";
        content.statPrimary = "今日 " + todayCount + " 项";
        content.statSecondary = "待处理 " + pendingCount + " 项";
        if (visibleTodos.isEmpty()) {
            content.lines.add("当前没有待处理的待办");
            content.lines.add("打开应用创建新的待办事项");
            return;
        }
        for (ControlerWidgetDataStore.TodoInfo todo : visibleTodos) {
            boolean completed = resolveTodoCompletedForWidget(todo, appWidgetId);
            boolean pending = isTodoPendingForWidget(todo, appWidgetId);
            WidgetItemCard card = new WidgetItemCard();
            card.title = safeText(todo.title);
            card.meta = pending
                ? appendPendingMeta(describeTodoCardMeta(todo, today, completed))
                : describeTodoCardMeta(todo, today, completed);
            card.actionLabel = completed ? "恢复" : "完成";
            card.command = ControlerWidgetActionHandler.COMMAND_TOGGLE_TODO;
            card.targetId = safeText(todo.id);
            card.accentColor = parseColor(todo.color, Color.parseColor("#ED8936"));
            card.pending = pending;
            card.actionDisabled = pending;
            content.itemCards.add(card);
        }
    }

    private static void fillCheckinsContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state,
        int appWidgetId
    ) {
        String today = todayText();
        Calendar todayCalendar = Calendar.getInstance();
        List<ControlerWidgetDataStore.CheckinItemInfo> scheduled = new ArrayList<>();
        int total = 0;
        int done = 0;
        for (ControlerWidgetDataStore.CheckinItemInfo item : state.checkinItems) {
            if (!checkinScheduledOn(item, todayCalendar, today)) {
                continue;
            }
            scheduled.add(item);
            total++;
            boolean checked = resolveCheckinDoneForWidget(
                state,
                item.id,
                today,
                appWidgetId
            );
            if (checked) {
                done++;
            }
        }
        Collections.sort(
            scheduled,
            new Comparator<ControlerWidgetDataStore.CheckinItemInfo>() {
                @Override
                public int compare(
                    ControlerWidgetDataStore.CheckinItemInfo left,
                    ControlerWidgetDataStore.CheckinItemInfo right
                ) {
                    boolean leftDone =
                        resolveCheckinDoneForWidget(state, left.id, today, appWidgetId);
                    boolean rightDone =
                        resolveCheckinDoneForWidget(state, right.id, today, appWidgetId);
                    if (leftDone != rightDone) {
                        return leftDone ? 1 : -1;
                    }
                    return safeText(left.startDate).compareTo(safeText(right.startDate));
                }
            }
        );
        content.subtitle = "今日打卡";
        content.statPrimary = "完成 " + done + "/" + total;
        content.statSecondary = done >= total && total > 0 ? "今日已清空" : "仍有待打卡";
        content.actionLabel = "打开打卡";
        if (scheduled.isEmpty()) {
            content.lines.add("今天暂无打卡任务");
            content.lines.add("打开应用创建新的打卡项目");
            return;
        }
        for (ControlerWidgetDataStore.CheckinItemInfo item : scheduled) {
            boolean checked = resolveCheckinDoneForWidget(
                state,
                item.id,
                today,
                appWidgetId
            );
            boolean pending = isCheckinPendingForWidget(item.id, appWidgetId);
            WidgetItemCard card = new WidgetItemCard();
            card.title = safeText(item.title);
            card.meta = pending
                ? appendPendingMeta(
                    describeCheckinCardMeta(
                        item,
                        checked,
                        countCheckinStreak(state, item, today)
                    )
                )
                : describeCheckinCardMeta(
                    item,
                    checked,
                    countCheckinStreak(state, item, today)
                );
            card.actionLabel = checked ? "取消" : "打卡";
            card.command = ControlerWidgetActionHandler.COMMAND_TOGGLE_CHECKIN;
            card.targetId = safeText(item.id);
            card.accentColor = parseColor(item.color, Color.parseColor("#4299E1"));
            card.pending = pending;
            card.actionDisabled = pending;
            content.itemCards.add(card);
        }
    }

    private static void fillWeekViewContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        Calendar base = Calendar.getInstance();
        resetToStartOfDay(base);
        int total = 0;
        int busiestCount = 0;
        String busiestDay = "";

        for (int offset = 0; offset < 7; offset++) {
            Calendar day = (Calendar) base.clone();
            day.add(Calendar.DAY_OF_MONTH, offset);
            String dayText = dateText(day);
            int count = countPlansOnDate(state.plans, dayText);
            total += count;
            if (count > busiestCount) {
                busiestCount = count;
                busiestDay = shortWeekLabel(day);
            }
        }

        content.subtitle = "未来 7 天计划";
        content.statPrimary = "总计 " + total + " 项";
        content.statSecondary =
            busiestCount > 0 ? (busiestDay + " " + busiestCount + " 项") : "本周暂无计划";
        content.lines.add("总计 " + total + " 项安排");
        content.lines.add(
            busiestCount > 0
                ? busiestDay + " 最忙（" + busiestCount + " 项）"
                : "本周暂无计划安排"
        );
        content.lines.add("打开应用查看完整周视图");
        content.itemCards.addAll(buildWeekViewSummaryCards(state, base, 7));
    }

    private static String resolveRecordDateText(ControlerWidgetDataStore.RecordInfo record) {
        if (record == null) {
            return "";
        }
        if (!TextUtils.isEmpty(record.dateText)) {
            return record.dateText;
        }
        return ControlerWidgetDataStore.extractDateText(
            firstNonEmpty(record.timestamp, record.startTime, record.endTime)
        );
    }

    private static List<WidgetItemCard> buildWeekGridSummaryCards(
        ControlerWidgetDataStore.State state,
        Calendar startDay,
        int dayCount
    ) {
        List<WidgetItemCard> cards = new ArrayList<>();
        if (state == null || state.records == null || dayCount <= 0) {
            return cards;
        }

        Calendar cursor = startDay == null ? Calendar.getInstance() : (Calendar) startDay.clone();
        resetToStartOfDay(cursor);
        Set<String> dateTexts = new HashSet<>();
        for (int offset = 0; offset < dayCount; offset++) {
            dateTexts.add(dateText(cursor));
            cursor.add(Calendar.DAY_OF_MONTH, 1);
        }

        Map<String, ControlerWidgetDataStore.ProjectInfo> projectMap = state.projectMap();
        Map<String, RecordSummaryAccumulator> summaryByKey = new HashMap<>();
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            String recordDateText = resolveRecordDateText(record);
            if (!dateTexts.contains(recordDateText)) {
                continue;
            }
            int minutes = Math.max(0, record == null ? 0 : record.minutes);
            if (minutes <= 0) {
                continue;
            }

            ControlerWidgetDataStore.ProjectInfo project =
                record == null || TextUtils.isEmpty(record.projectId)
                    ? null
                    : projectMap.get(record.projectId);
            String title = firstNonEmpty(
                project == null ? "" : project.name,
                record == null ? "" : record.name,
                "未分类"
            );
            String key = !TextUtils.isEmpty(record == null ? "" : record.projectId)
                ? "project:" + record.projectId
                : "name:" + title;
            RecordSummaryAccumulator accumulator = summaryByKey.get(key);
            if (accumulator == null) {
                accumulator = new RecordSummaryAccumulator();
                accumulator.title = title;
                accumulator.accentColor =
                    parseColor(project == null ? "" : project.color, Color.parseColor("#8ED6A4"));
                summaryByKey.put(key, accumulator);
            }
            accumulator.totalMinutes += minutes;
            accumulator.dayMinutes.put(
                recordDateText,
                (accumulator.dayMinutes.containsKey(recordDateText)
                    ? accumulator.dayMinutes.get(recordDateText)
                    : 0) + minutes
            );
        }

        List<RecordSummaryAccumulator> summaries = new ArrayList<>(summaryByKey.values());
        Collections.sort(
            summaries,
            new Comparator<RecordSummaryAccumulator>() {
                @Override
                public int compare(
                    RecordSummaryAccumulator left,
                    RecordSummaryAccumulator right
                ) {
                    if (right.totalMinutes != left.totalMinutes) {
                        return right.totalMinutes - left.totalMinutes;
                    }
                    return safeText(left.title).compareTo(safeText(right.title));
                }
            }
        );

        for (RecordSummaryAccumulator summary : summaries) {
            WidgetItemCard card = new WidgetItemCard();
            card.title = safeText(summary.title);
            card.meta =
                "总计 "
                    + formatMinutesCompact(summary.totalMinutes)
                    + " · 日均 "
                    + formatMinutesCompact(Math.round(summary.totalMinutes / (float) dayCount))
                    + " · "
                    + summary.dayMinutes.size()
                    + " 天";
            card.actionLabel = "查看记录";
            card.accentColor = summary.accentColor;
            cards.add(card);
        }
        return cards;
    }

    private static List<WidgetItemCard> buildWeekViewSummaryCards(
        ControlerWidgetDataStore.State state,
        Calendar startDay,
        int dayCount
    ) {
        List<WidgetItemCard> cards = new ArrayList<>();
        if (state == null || state.plans == null || dayCount <= 0) {
            return cards;
        }

        Calendar cursor = startDay == null ? Calendar.getInstance() : (Calendar) startDay.clone();
        resetToStartOfDay(cursor);
        Map<String, PlanSummaryAccumulator> summaryByTitle = new HashMap<>();
        for (int offset = 0; offset < dayCount; offset++) {
            String currentDateText = dateText(cursor);
            for (ControlerWidgetDataStore.PlanInfo plan : state.plans) {
                if (!planOccursOnDate(plan, currentDateText)) {
                    continue;
                }

                String title = firstNonEmpty(plan == null ? "" : plan.name, "计划");
                int durationMinutes = resolvePlanDurationMinutes(plan);
                PlanSummaryAccumulator accumulator = summaryByTitle.get(title);
                if (accumulator == null) {
                    accumulator = new PlanSummaryAccumulator();
                    accumulator.title = title;
                    accumulator.accentColor =
                        parseColor(plan == null ? "" : plan.color, Color.parseColor("#79AF85"));
                    summaryByTitle.put(title, accumulator);
                }

                accumulator.planCount++;
                accumulator.totalMinutes += durationMinutes;
                accumulator.dayMinutes.put(
                    currentDateText,
                    (accumulator.dayMinutes.containsKey(currentDateText)
                        ? accumulator.dayMinutes.get(currentDateText)
                        : 0) + durationMinutes
                );
            }
            cursor.add(Calendar.DAY_OF_MONTH, 1);
        }

        List<PlanSummaryAccumulator> summaries = new ArrayList<>(summaryByTitle.values());
        Collections.sort(
            summaries,
            new Comparator<PlanSummaryAccumulator>() {
                @Override
                public int compare(
                    PlanSummaryAccumulator left,
                    PlanSummaryAccumulator right
                ) {
                    if (right.totalMinutes != left.totalMinutes) {
                        return right.totalMinutes - left.totalMinutes;
                    }
                    if (right.planCount != left.planCount) {
                        return right.planCount - left.planCount;
                    }
                    return safeText(left.title).compareTo(safeText(right.title));
                }
            }
        );

        for (PlanSummaryAccumulator summary : summaries) {
            String busiestDateText = "";
            int busiestMinutes = -1;
            for (Map.Entry<String, Integer> entry : summary.dayMinutes.entrySet()) {
                int value = entry.getValue() == null ? 0 : entry.getValue();
                if (value > busiestMinutes) {
                    busiestMinutes = value;
                    busiestDateText = safeText(entry.getKey());
                }
            }

            WidgetItemCard card = new WidgetItemCard();
            card.title = safeText(summary.title);
            String busiestLabel = formatFutureRelativeDateLabel(busiestDateText);
            card.meta =
                summary.planCount
                    + " 项 · "
                    + summary.dayMinutes.size()
                    + " 天 · "
                    + (
                        TextUtils.isEmpty(busiestLabel)
                            ? formatMinutesCompact(summary.totalMinutes)
                            : busiestLabel + "较多"
                    );
            card.actionLabel = "查看计划";
            card.accentColor = summary.accentColor;
            cards.add(card);
        }
        return cards;
    }

    private static void fillMonthViewContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        Calendar now = Calendar.getInstance();
        int year = now.get(Calendar.YEAR);
        int month = now.get(Calendar.MONTH);

        int monthMinutes = 0;
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            Calendar calendar = calendarFromDateText(record.dateText);
            if (calendar == null) {
                continue;
            }
            if (calendar.get(Calendar.YEAR) == year && calendar.get(Calendar.MONTH) == month) {
                monthMinutes += Math.max(0, record.minutes);
            }
        }

        int monthPlanCount = countPlansInMonth(state.plans, year, month);
        content.subtitle = "本月概览";
        content.statPrimary = formatMinutes(monthMinutes);
        content.statSecondary = monthPlanCount + " 项计划";
        content.lines.add("时间投入 " + formatMinutes(monthMinutes));
        content.lines.add("计划条目 " + monthPlanCount + " 项");
        content.lines.add("打开应用查看完整月历");
    }

    private static void fillYearViewContent(
        WidgetContent content,
        ControlerWidgetDataStore.State state
    ) {
        Calendar now = Calendar.getInstance();
        int currentYear = now.get(Calendar.YEAR);
        int yearMinutes = 0;
        int activeMonths = 0;
        int maxMonthMinutes = 0;
        int maxMonth = -1;
        int[] monthBuckets = new int[12];

        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            Calendar calendar = calendarFromDateText(record.dateText);
            if (calendar == null || calendar.get(Calendar.YEAR) != currentYear) {
                continue;
            }
            int month = calendar.get(Calendar.MONTH);
            int minutes = Math.max(0, record.minutes);
            monthBuckets[month] += minutes;
            yearMinutes += minutes;
        }
        for (int month = 0; month < monthBuckets.length; month++) {
            if (monthBuckets[month] > 0) {
                activeMonths++;
            }
            if (monthBuckets[month] > maxMonthMinutes) {
                maxMonthMinutes = monthBuckets[month];
                maxMonth = month;
            }
        }

        int goalMonths = 0;
        for (Map.Entry<Integer, Integer> entry : state.goalCountsByMonth.entrySet()) {
            if (entry.getValue() != null && entry.getValue() > 0) {
                goalMonths++;
            }
        }
        int currentMonth = now.get(Calendar.MONTH) + 1;
        List<ControlerWidgetDataStore.GoalInfo> currentMonthGoals =
            state.goalsByMonth.get(currentMonth);
        int currentMonthGoalCount = currentMonthGoals == null ? 0 : currentMonthGoals.size();
        int annualGoalCount = state.annualGoals == null ? 0 : state.annualGoals.size();

        content.subtitle = "年度视图";
        content.statPrimary = formatMinutes(yearMinutes);
        content.statSecondary = "年度目标 " + annualGoalCount + " 个";
        content.lines.add("全年投入 " + formatMinutes(yearMinutes));
        content.lines.add("本月目标 " + currentMonthGoalCount + " 个");
        content.lines.add(
            maxMonth >= 0
                ? ((maxMonth + 1) + " 月最高，目标月 " + goalMonths + " 个")
                : "暂无年度统计数据"
        );
    }

    private static Bitmap buildPreviewBitmap(
        Context context,
        String kind,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        if (context == null) {
            return null;
        }

        switch (kind) {
            case ControlerWidgetKinds.START_TIMER:
                return buildStartTimerPreview(context, state, palette);
            case ControlerWidgetKinds.WRITE_DIARY:
                return buildDiaryPreview(context, state, palette);
            case ControlerWidgetKinds.WEEK_GRID:
                return buildWeekGridPreview(context, state, palette, metrics);
            case ControlerWidgetKinds.DAY_PIE:
                return buildDayPiePreview(context, state, palette, metrics);
            case ControlerWidgetKinds.TODOS:
                return buildTodoPreview(context, state, palette);
            case ControlerWidgetKinds.CHECKINS:
                return buildCheckinPreview(context, state, palette);
            case ControlerWidgetKinds.WEEK_VIEW:
                return buildWeekViewPreview(context, state, palette, metrics);
            case ControlerWidgetKinds.YEAR_VIEW:
                return buildYearViewPreview(context, state, palette, metrics);
            default:
                return null;
        }
    }

    private static Bitmap buildStartTimerPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        String today = todayText();
        int todayMinutes = 0;
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (isRecordOnDate(record, today)) {
                todayMinutes += Math.max(0, record.minutes);
            }
        }
        boolean active = isTimerSessionActive(state);
        float progress = Math.max(0.16f, Math.min(1f, todayMinutes / 240f));
        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Paint trackPaint = createPaint(applyAlpha(palette.bodyColor, 34), Paint.Style.STROKE, dp(context, 12));
        Paint fillPaint = createPaint(active ? palette.accentColor : applyAlpha(palette.accentColor, 180), Paint.Style.STROKE, dp(context, 12));
        RectF arcRect = new RectF(dp(context, 28), dp(context, 13), dp(context, 102), dp(context, 87));
        canvas.drawArc(arcRect, -210f, 240f, false, trackPaint);
        canvas.drawArc(arcRect, -210f, 240f * progress, false, fillPaint);

        Paint dotPaint = createPaint(palette.bodyColor, Paint.Style.FILL, 0f);
        float centerX = arcRect.centerX();
        float centerY = arcRect.centerY();
        canvas.drawCircle(centerX, centerY, dp(context, 6), dotPaint);

        Paint barTrackPaint = createPaint(applyAlpha(palette.bodyColor, 24), Paint.Style.FILL, 0f);
        Paint barPaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        RectF barTrack = new RectF(dp(context, 118), dp(context, 18), dp(context, 150), dp(context, 82));
        canvas.drawRoundRect(barTrack, dp(context, 10), dp(context, 10), barTrackPaint);
        float fillTop = barTrack.bottom - (barTrack.height() * progress);
        RectF barFill = new RectF(barTrack.left, fillTop, barTrack.right, barTrack.bottom);
        canvas.drawRoundRect(barFill, dp(context, 10), dp(context, 10), barPaint);
        return bitmap;
    }

    private static Bitmap buildDiaryPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Paint pagePaint = createPaint(applyAlpha(palette.bodyColor, 20), Paint.Style.FILL, 0f);
        RectF pageRect = new RectF(dp(context, 14), dp(context, 10), dp(context, 150), dp(context, 80));
        canvas.drawRoundRect(pageRect, dp(context, 14), dp(context, 14), pagePaint);

        Paint titlePaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        canvas.drawRoundRect(
            new RectF(dp(context, 26), dp(context, 22), dp(context, 118), dp(context, 30)),
            dp(context, 4),
            dp(context, 4),
            titlePaint
        );

        Paint linePaint = createPaint(applyAlpha(palette.bodyColor, 96), Paint.Style.FILL, 0f);
        for (int index = 0; index < 4; index++) {
            float top = dp(context, 38 + index * 10);
            float right = index == 3 ? dp(context, 96) : dp(context, 132);
            canvas.drawRoundRect(
                new RectF(dp(context, 26), top, right, top + dp(context, 4)),
                dp(context, 3),
                dp(context, 3),
                linePaint
            );
        }
        return bitmap;
    }

    private static Bitmap buildRecordListPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        List<ControlerWidgetDataStore.RecordInfo> records = new ArrayList<>(state.records);
        sortRecordsByTimestampDesc(records);
        int limit = Math.min(4, records.size());
        if (limit <= 0) {
            return null;
        }

        int maxMinutes = 1;
        for (int index = 0; index < limit; index++) {
            maxMinutes = Math.max(maxMinutes, Math.max(0, records.get(index).minutes));
        }

        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Paint trackPaint = createPaint(applyAlpha(palette.bodyColor, 22), Paint.Style.FILL, 0f);
        Paint fillPaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        for (int index = 0; index < limit; index++) {
            float top = dp(context, 14 + index * 18);
            RectF trackRect = new RectF(dp(context, 18), top, dp(context, 146), top + dp(context, 10));
            canvas.drawRoundRect(trackRect, dp(context, 8), dp(context, 8), trackPaint);
            float percent = Math.max(0.14f, records.get(index).minutes / (float) maxMinutes);
            RectF fillRect = new RectF(trackRect.left, trackRect.top, trackRect.left + trackRect.width() * percent, trackRect.bottom);
            canvas.drawRoundRect(fillRect, dp(context, 8), dp(context, 8), fillPaint);
        }
        return bitmap;
    }

    private static Bitmap buildWeekGridPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        return drawTimelineRowsPreview(
            context,
            palette,
            metrics,
            buildWeekGridRows(state, palette),
            "暂无时间记录"
        );
    }

    private static Bitmap buildDayPiePreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        List<PreviewLegendEntry> entries = buildDayPieEntries(state, palette);
        if (entries.isEmpty()) {
            return null;
        }

        int total = 0;
        for (PreviewLegendEntry entry : entries) {
            total += Math.max(0, entry.minutes);
        }
        if (total <= 0) {
            return null;
        }

        boolean compactLegend = metrics != null
            && (metrics.sizeClass == SIZE_COMPACT || metrics.minWidthDp < 220);
        float widthDp = resolvePreviewWidthDp(
            metrics,
            compactLegend ? 168f : 182f,
            compactLegend ? 172f : 188f
        );
        float minPreviewHeightDp = compactLegend ? 96f : 108f;
        float targetHeightDp =
            minPreviewHeightDp + Math.max(0, entries.size() - 4) * (compactLegend ? 12f : 13.5f);
        float maxPreviewHeightDp =
            metrics != null && metrics.minHeightDp > 0
                ? Math.max(minPreviewHeightDp, metrics.minHeightDp * 0.72f)
                : 156f;
        Bitmap bitmap = createPreviewBitmap(
            context,
            widthDp,
            clampFloat(targetHeightDp, minPreviewHeightDp, maxPreviewHeightDp)
        );
        Canvas canvas = new Canvas(bitmap);
        float width = bitmap.getWidth();
        float height = bitmap.getHeight();

        float padding = dp(context, compactLegend ? 7f : 8f);
        float pieOuterSize = Math.min(
            height - padding * 2f,
            Math.max(
                dp(context, compactLegend ? 54f : 68f),
                width * (compactLegend ? 0.34f : 0.38f)
            )
        );
        float arcStrokeWidth = Math.max(
            dp(context, compactLegend ? 11f : 13f),
            pieOuterSize * 0.2f
        );
        // Arc strokes are centered on the oval bounds, so inset the drawing rect
        // to keep the full ring and round caps inside the bitmap.
        float pieInset = (arcStrokeWidth / 2f) + dp(context, 1f);
        float pieSize = Math.max(1f, pieOuterSize - pieInset * 2f);
        RectF pieRect = new RectF(
            padding + pieInset,
            ((height - pieOuterSize) / 2f) + pieInset,
            padding + pieInset + pieSize,
            ((height - pieOuterSize) / 2f) + pieInset + pieSize
        );

        Paint arcPaint = createPaint(
            palette.accentColor,
            Paint.Style.STROKE,
            arcStrokeWidth
        );
        Paint holePaint = createPaint(
            blendColors(palette.backgroundColor, palette.surfaceColor, 0.45f),
            Paint.Style.FILL,
            0f
        );
        Paint legendDotPaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        Paint legendTextPaint = createPaint(palette.bodyColor, Paint.Style.FILL, 0f);
        legendTextPaint.setTextSize(
            sp(
                context,
                compactLegend
                    ? (entries.size() > 6 ? 6.5f : 7.0f)
                    : (entries.size() > 7 ? 6.9f : 7.8f)
            )
        );

        float startAngle = -90f;
        for (int index = 0; index < entries.size(); index++) {
            PreviewLegendEntry entry = entries.get(index);
            float sweep = 360f * (entry.minutes / (float) total);
            arcPaint.setColor(entry.color);
            canvas.drawArc(pieRect, startAngle, sweep, false, arcPaint);
            startAngle += sweep;
        }
        canvas.drawCircle(pieRect.centerX(), pieRect.centerY(), pieSize * 0.24f, holePaint);

        float legendLeft = pieRect.right + dp(context, compactLegend ? 10f : 12f);
        float legendTop = padding + dp(context, 1f);
        float legendWidth = Math.max(dp(context, 38), width - legendLeft - padding);
        float lineHeight = (height - legendTop - padding) / Math.max(1, entries.size());
        float dotRadius = dp(
            context,
            compactLegend
                ? (entries.size() > 6 ? 2.5f : 2.9f)
                : (entries.size() > 7 ? 2.8f : 3.3f)
        );

        for (int index = 0; index < entries.size(); index++) {
            PreviewLegendEntry entry = entries.get(index);
            float centerY = legendTop + lineHeight * index + lineHeight / 2f;
            legendDotPaint.setColor(entry.color);
            canvas.drawCircle(legendLeft + dotRadius + dp(context, 1f), centerY, dotRadius, legendDotPaint);
            int percent = Math.round((entry.minutes * 100f) / Math.max(1, total));
            String text =
                safeText(entry.label) + " " + percent + "% · " + formatMinutesCompact(entry.minutes);
            RectF textRect = new RectF(
                legendLeft + dotRadius * 2f + dp(context, 4f),
                centerY - lineHeight / 2f,
                legendLeft + legendWidth,
                centerY + lineHeight / 2f
            );
            drawTextInRect(canvas, textRect, text, legendTextPaint, dp(context, 1.5f));
        }
        return bitmap;
    }

    private static Bitmap buildHeatmapPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        Map<String, Integer> minutesByDate = new HashMap<>();
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (TextUtils.isEmpty(record.dateText)) {
                continue;
            }
            minutesByDate.put(record.dateText, minutesByDate.containsKey(record.dateText)
                ? minutesByDate.get(record.dateText) + Math.max(0, record.minutes)
                : Math.max(0, record.minutes));
        }

        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Calendar cursor = Calendar.getInstance();
        cursor.add(Calendar.DAY_OF_MONTH, -139);
        float cellSize = dp(context, 5);
        float gap = dp(context, 2);
        for (int index = 0; index < 140; index++) {
            String dateText = dateText(cursor);
            int minutes = minutesByDate.containsKey(dateText) ? minutesByDate.get(dateText) : 0;
            int alpha = minutes >= 180 ? 230 : minutes >= 90 ? 172 : minutes > 0 ? 96 : 20;
            Paint cellPaint = createPaint(applyAlpha(palette.accentColor, alpha), Paint.Style.FILL, 0f);
            int week = index / 7;
            int day = index % 7;
            float left = dp(context, 10) + week * (cellSize + gap);
            float top = dp(context, 10) + day * (cellSize + gap);
            RectF cellRect = new RectF(left, top, left + cellSize, top + cellSize);
            canvas.drawRoundRect(cellRect, dp(context, 2), dp(context, 2), cellPaint);
            cursor.add(Calendar.DAY_OF_MONTH, 1);
        }
        return bitmap;
    }

    private static Bitmap buildDayLinePreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        String today = todayText();
        int[] buckets = new int[24];
        int peak = 0;
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (!isRecordOnDate(record, today)) {
                continue;
            }
            int hour = Math.max(0, Math.min(23, record.hour));
            buckets[hour] += Math.max(0, record.minutes);
            peak = Math.max(peak, buckets[hour]);
        }
        if (peak <= 0) {
            return null;
        }

        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Paint gridPaint = createPaint(applyAlpha(palette.bodyColor, 22), Paint.Style.STROKE, dp(context, 1));
        Paint fillPaint = createPaint(applyAlpha(palette.accentColor, 46), Paint.Style.FILL, 0f);
        Paint linePaint = createPaint(palette.accentColor, Paint.Style.STROKE, dp(context, 3));
        float left = dp(context, 12);
        float top = dp(context, 10);
        float right = dp(context, 152);
        float bottom = dp(context, 78);
        for (int index = 0; index < 4; index++) {
            float y = top + ((bottom - top) / 3f) * index;
            canvas.drawLine(left, y, right, y, gridPaint);
        }

        Path fillPath = new Path();
        Path linePath = new Path();
        for (int hour = 0; hour < 24; hour++) {
            float x = left + ((right - left) / 23f) * hour;
            float y = bottom - ((bottom - top) * (buckets[hour] / (float) peak));
            if (hour == 0) {
                linePath.moveTo(x, y);
                fillPath.moveTo(x, bottom);
                fillPath.lineTo(x, y);
            } else {
                linePath.lineTo(x, y);
                fillPath.lineTo(x, y);
            }
        }
        fillPath.lineTo(right, bottom);
        fillPath.close();
        canvas.drawPath(fillPath, fillPaint);
        canvas.drawPath(linePath, linePaint);
        return bitmap;
    }

    private static Bitmap buildTodoPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        int total = state.todos.size();
        int completed = 0;
        for (ControlerWidgetDataStore.TodoInfo todo : state.todos) {
            if (todo.completed) {
                completed++;
            }
        }
        return buildCompletionPreview(context, palette, completed, Math.max(total, 1), false);
    }

    private static Bitmap buildCheckinPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        String today = todayText();
        Calendar todayCalendar = Calendar.getInstance();
        int total = 0;
        int completed = 0;
        for (ControlerWidgetDataStore.CheckinItemInfo item : state.checkinItems) {
            if (!checkinScheduledOn(item, todayCalendar, today)) {
                continue;
            }
            total++;
            if (isCheckinDoneForDate(state.dailyCheckins, item.id, today)) {
                completed++;
            }
        }
        return buildCompletionPreview(context, palette, completed, Math.max(total, 1), true);
    }

    private static Bitmap buildCompletionPreview(
        Context context,
        ThemePalette palette,
        int completed,
        int total,
        boolean drawDots
    ) {
        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        float progress = total <= 0 ? 0f : completed / (float) total;
        Paint trackPaint = createPaint(applyAlpha(palette.bodyColor, 28), Paint.Style.FILL, 0f);
        Paint fillPaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        RectF trackRect = new RectF(dp(context, 14), dp(context, 34), dp(context, 150), dp(context, 54));
        canvas.drawRoundRect(trackRect, dp(context, 12), dp(context, 12), trackPaint);
        RectF fillRect = new RectF(trackRect.left, trackRect.top, trackRect.left + trackRect.width() * Math.max(progress, total == 0 ? 0f : 0.14f), trackRect.bottom);
        canvas.drawRoundRect(fillRect, dp(context, 12), dp(context, 12), fillPaint);

        if (drawDots) {
            for (int index = 0; index < Math.min(total, 6); index++) {
                Paint dotPaint = createPaint(index < completed ? palette.accentColor : applyAlpha(palette.bodyColor, 52), Paint.Style.FILL, 0f);
                canvas.drawCircle(dp(context, 24 + index * 20), dp(context, 70), dp(context, 5), dotPaint);
            }
        } else {
            for (int index = 0; index < 4; index++) {
                Paint chipPaint = createPaint(index < completed ? palette.accentColor : applyAlpha(palette.bodyColor, 38), Paint.Style.FILL, 0f);
                float top = dp(context, 62);
                float left = dp(context, 18 + index * 34);
                canvas.drawRoundRect(new RectF(left, top, left + dp(context, 22), top + dp(context, 10)), dp(context, 5), dp(context, 5), chipPaint);
            }
        }
        return bitmap;
    }

    private static Bitmap buildWeekViewPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        return drawTimelineRowsPreview(
            context,
            palette,
            metrics,
            buildWeekViewRows(state, palette),
            "暂无计划安排"
        );
    }

    private static Bitmap buildMonthViewPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Calendar now = Calendar.getInstance();
        Calendar monthStart = (Calendar) now.clone();
        monthStart.set(Calendar.DAY_OF_MONTH, 1);
        int shift = monthStart.get(Calendar.DAY_OF_WEEK) - 1;
        monthStart.add(Calendar.DAY_OF_MONTH, -shift);
        float cellWidth = dp(context, 18);
        float cellHeight = dp(context, 11);
        float gap = dp(context, 2);
        for (int index = 0; index < 42; index++) {
            Calendar cell = (Calendar) monthStart.clone();
            cell.add(Calendar.DAY_OF_MONTH, index);
            int count = countPlansOnDate(state.plans, dateText(cell));
            int alpha = count >= 3 ? 220 : count == 2 ? 164 : count == 1 ? 98 : 24;
            Paint cellPaint = createPaint(applyAlpha(palette.accentColor, alpha), Paint.Style.FILL, 0f);
            float left = dp(context, 10) + (index % 7) * (cellWidth + gap);
            float top = dp(context, 8) + (index / 7) * (cellHeight + gap);
            RectF cellRect = new RectF(left, top, left + cellWidth, top + cellHeight);
            canvas.drawRoundRect(cellRect, dp(context, 3), dp(context, 3), cellPaint);
            if (
                cell.get(Calendar.YEAR) == now.get(Calendar.YEAR)
                    && cell.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
            ) {
                Paint borderPaint = createPaint(palette.bodyColor, Paint.Style.STROKE, dp(context, 1.5f));
                canvas.drawRoundRect(cellRect, dp(context, 3), dp(context, 3), borderPaint);
            }
        }
        return bitmap;
    }

    private static Bitmap buildYearViewPreview(
        Context context,
        ControlerWidgetDataStore.State state,
        ThemePalette palette,
        WidgetMetrics metrics
    ) {
        Calendar now = Calendar.getInstance();
        int currentMonth = now.get(Calendar.MONTH) + 1;
        List<ControlerWidgetDataStore.GoalInfo> currentMonthGoals = state.goalsByMonth.get(currentMonth);
        List<ControlerWidgetDataStore.GoalInfo> annualGoals =
            state.annualGoals == null ? Collections.<ControlerWidgetDataStore.GoalInfo>emptyList() : state.annualGoals;
        List<ControlerWidgetDataStore.GoalInfo> monthGoals =
            currentMonthGoals == null
                ? Collections.<ControlerWidgetDataStore.GoalInfo>emptyList()
                : currentMonthGoals;

        float widthDp = resolvePreviewWidthDp(metrics, 156f, 164f);
        Bitmap bitmap = createPreviewBitmap(context, widthDp, 90f);
        Canvas canvas = new Canvas(bitmap);
        float width = bitmap.getWidth();
        float height = bitmap.getHeight();
        float padding = dp(context, 6);
        float gap = dp(context, 6);
        boolean stacked = metrics != null && metrics.minWidthDp < 220;
        boolean showGoalList = metrics == null || metrics.minWidthDp >= 210;

        RectF annualRect;
        RectF monthRect;
        if (stacked) {
            float cardHeight = (height - padding * 2f - gap) / 2f;
            annualRect = new RectF(padding, padding, width - padding, padding + cardHeight);
            monthRect = new RectF(padding, annualRect.bottom + gap, width - padding, height - padding);
        } else {
            float cardWidth = (width - padding * 2f - gap) / 2f;
            annualRect = new RectF(padding, padding, padding + cardWidth, height - padding);
            monthRect = new RectF(annualRect.right + gap, padding, width - padding, height - padding);
        }

        int annualAccent = palette.accentColor;
        int monthAccent = blendColors(palette.accentColor, palette.bodyColor, 0.32f);
        drawYearGoalPreviewCard(
            context,
            canvas,
            annualRect,
            "今年年度目标",
            annualGoals,
            palette,
            annualAccent,
            showGoalList
        );
        drawYearGoalPreviewCard(
            context,
            canvas,
            monthRect,
            "本月目标",
            monthGoals,
            palette,
            monthAccent,
            showGoalList
        );
        return bitmap;
    }

    private static Bitmap buildBarSeriesPreview(
        Context context,
        ThemePalette palette,
        int[] values,
        int maxValue
    ) {
        Bitmap bitmap = createPreviewBitmap(context, 164, 90);
        Canvas canvas = new Canvas(bitmap);
        Paint trackPaint = createPaint(applyAlpha(palette.bodyColor, 24), Paint.Style.FILL, 0f);
        Paint barPaint = createPaint(palette.accentColor, Paint.Style.FILL, 0f);
        float left = dp(context, 10);
        float right = dp(context, 154);
        float bottom = dp(context, 78);
        float top = dp(context, 12);
        int length = Math.max(1, values.length);
        float gap = dp(context, 3);
        float barWidth = ((right - left) - gap * (length - 1)) / length;
        for (int index = 0; index < length; index++) {
            float barLeft = left + index * (barWidth + gap);
            RectF trackRect = new RectF(barLeft, top, barLeft + barWidth, bottom);
            canvas.drawRoundRect(trackRect, dp(context, 4), dp(context, 4), trackPaint);
            float percent = Math.max(values[index] > 0 ? 0.12f : 0f, values[index] / (float) Math.max(maxValue, 1));
            RectF barRect = new RectF(barLeft, bottom - (bottom - top) * percent, barLeft + barWidth, bottom);
            canvas.drawRoundRect(barRect, dp(context, 4), dp(context, 4), barPaint);
        }
        return bitmap;
    }

    private static List<PreviewDayRow> buildWeekGridRows(
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        List<PreviewDayRow> rows = new ArrayList<>();
        Map<String, PreviewDayRow> rowMap = new HashMap<>();
        Map<String, Integer> colorByProjectId = new HashMap<>();
        Map<String, Integer> colorByProjectName = new HashMap<>();

        if (state != null && state.projects != null) {
            for (ControlerWidgetDataStore.ProjectInfo project : state.projects) {
                if (project == null) {
                    continue;
                }
                int color = resolveVisibleAccentColor(
                    parseColor(project.color, palette.accentColor),
                    palette.surfaceColor,
                    palette.accentColor
                );
                if (!TextUtils.isEmpty(project.id)) {
                    colorByProjectId.put(project.id, color);
                }
                if (!TextUtils.isEmpty(project.name)) {
                    colorByProjectName.put(project.name, color);
                }
            }
        }

        Calendar startDay = Calendar.getInstance();
        resetToStartOfDay(startDay);
        startDay.add(Calendar.DAY_OF_MONTH, -6);
        String today = todayText();
        for (int offset = 0; offset < 7; offset++) {
            Calendar day = (Calendar) startDay.clone();
            day.add(Calendar.DAY_OF_MONTH, offset);
            String dayText = dateText(day);
            PreviewDayRow row = new PreviewDayRow();
            row.label = today.equals(dayText) ? "今天" : shortWeekLabel(day);
            row.today = today.equals(dayText);
            rows.add(row);
            rowMap.put(dayText, row);
        }

        if (state == null || state.records == null) {
            return rows;
        }

        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            PreviewTimeRange range = resolveRecordPreviewRange(record);
            if (range == null || range.endMs <= range.startMs) {
                continue;
            }

            Calendar cursor = Calendar.getInstance();
            cursor.setTimeInMillis(range.startMs);
            resetToStartOfDay(cursor);
            Calendar lastDay = Calendar.getInstance();
            lastDay.setTimeInMillis(Math.max(range.startMs, range.endMs - 1L));
            resetToStartOfDay(lastDay);

            while (!cursor.after(lastDay)) {
                String dayText = dateText(cursor);
                PreviewDayRow row = rowMap.get(dayText);
                if (row != null) {
                    long dayStartMs = cursor.getTimeInMillis();
                    long dayEndMs = dayStartMs + 86400000L;
                    long overlapStartMs = Math.max(range.startMs, dayStartMs);
                    long overlapEndMs = Math.min(range.endMs, dayEndMs);
                    if (overlapEndMs > overlapStartMs) {
                        PreviewSegment segment = new PreviewSegment();
                        segment.label = firstNonEmpty(record.name, "未分类");
                        int overlapMinutes = Math.max(
                            1,
                            (int) Math.ceil((overlapEndMs - overlapStartMs) / 60000d)
                        );
                        segment.detail = formatMinutesCompact(overlapMinutes);
                        segment.startMinutes = Math.max(
                            0,
                            Math.min(1439, (int) ((overlapStartMs - dayStartMs) / 60000L))
                        );
                        segment.endMinutes = Math.max(
                            segment.startMinutes + 1,
                            Math.min(1440, (int) Math.ceil((overlapEndMs - dayStartMs) / 60000d))
                        );
                        if (!TextUtils.isEmpty(record.projectId) && colorByProjectId.containsKey(record.projectId)) {
                            segment.color = colorByProjectId.get(record.projectId);
                        } else if (!TextUtils.isEmpty(record.name) && colorByProjectName.containsKey(record.name)) {
                            segment.color = colorByProjectName.get(record.name);
                        } else {
                            segment.color = palette.accentColor;
                        }
                        row.segments.add(segment);
                    }
                }
                cursor.add(Calendar.DAY_OF_MONTH, 1);
            }
        }

        sortPreviewSegments(rows);
        return rows;
    }

    private static List<PreviewDayRow> buildWeekViewRows(
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        List<PreviewDayRow> rows = new ArrayList<>();
        Calendar base = Calendar.getInstance();
        resetToStartOfDay(base);
        String today = todayText();
        for (int offset = 0; offset < 7; offset++) {
            Calendar day = (Calendar) base.clone();
            day.add(Calendar.DAY_OF_MONTH, offset);
            String dayText = dateText(day);
            PreviewDayRow row = new PreviewDayRow();
            row.label = today.equals(dayText) ? "今天" : shortWeekLabel(day);
            row.today = today.equals(dayText);

            if (state != null && state.plans != null) {
                for (ControlerWidgetDataStore.PlanInfo plan : state.plans) {
                    if (!planOccursOnDate(plan, dayText)) {
                        continue;
                    }
                    PreviewSegment segment = new PreviewSegment();
                    segment.label = firstNonEmpty(plan == null ? "" : plan.name, "未命名计划");
                    int startMinutes = parseClockMinutes(plan == null ? "" : plan.startTime);
                    int endMinutes = parseClockMinutes(plan == null ? "" : plan.endTime);
                    if (startMinutes < 0 && endMinutes >= 0) {
                        startMinutes = Math.max(0, endMinutes - 60);
                    }
                    if (startMinutes < 0) {
                        startMinutes = 0;
                    }
                    if (endMinutes <= startMinutes) {
                        endMinutes = Math.min(1440, startMinutes + 60);
                    }
                    segment.startMinutes = Math.max(0, Math.min(1439, startMinutes));
                    segment.endMinutes = Math.max(
                        segment.startMinutes + 1,
                        Math.min(1440, endMinutes)
                    );
                    segment.detail = formatClockRange(segment.startMinutes, segment.endMinutes);
                    segment.color = resolveVisibleAccentColor(
                        parseColor(plan == null ? "" : plan.color, palette.accentColor),
                        palette.surfaceColor,
                        palette.accentColor
                    );
                    row.segments.add(segment);
                }
            }

            rows.add(row);
        }

        sortPreviewSegments(rows);
        return rows;
    }

    private static void sortPreviewSegments(List<PreviewDayRow> rows) {
        if (rows == null) {
            return;
        }
        for (PreviewDayRow row : rows) {
            if (row == null || row.segments == null) {
                continue;
            }
            Collections.sort(row.segments, new Comparator<PreviewSegment>() {
                @Override
                public int compare(PreviewSegment left, PreviewSegment right) {
                    if (left == null && right == null) {
                        return 0;
                    }
                    if (left == null) {
                        return 1;
                    }
                    if (right == null) {
                        return -1;
                    }
                    if (left.startMinutes != right.startMinutes) {
                        return left.startMinutes - right.startMinutes;
                    }
                    return left.endMinutes - right.endMinutes;
                }
            });
        }
    }

    private static Bitmap drawTimelineRowsPreview(
        Context context,
        ThemePalette palette,
        WidgetMetrics metrics,
        List<PreviewDayRow> rows,
        String emptyText
    ) {
        if (context == null || rows == null || rows.isEmpty()) {
            return null;
        }

        float widthDp = resolvePreviewWidthDp(metrics, 150f, 164f);
        Bitmap bitmap = createPreviewBitmap(context, widthDp, 90f);
        Canvas canvas = new Canvas(bitmap);
        float width = bitmap.getWidth();
        float height = bitmap.getHeight();
        boolean compact = metrics != null && metrics.sizeClass == SIZE_COMPACT;
        boolean minimal =
            compact
                || (metrics != null && (metrics.minWidthDp < 208 || metrics.minHeightDp < 130));
        boolean showSegmentText = !minimal && width >= dp(context, 190f);
        boolean showRowLabels = width >= dp(context, 120f);

        float outerLeft = dp(context, 4);
        float outerTop = dp(context, 4);
        float outerRight = width - dp(context, 4);
        float outerBottom = height - dp(context, 4);
        float rowGap = dp(context, 2);
        float labelWidth = showRowLabels ? dp(context, minimal ? 20f : 28f) : 0f;
        float timelineLeft = outerLeft + labelWidth + (labelWidth > 0f ? dp(context, 5f) : 0f);
        float timelineRight = outerRight;
        float rowHeight =
            (outerBottom - outerTop - rowGap * (rows.size() - 1)) / Math.max(1, rows.size());
        float rowRadius = Math.max(1f, Math.min(dp(context, 4f), rowHeight / 2f));

        Paint rowFillPaint = createPaint(applyAlpha(palette.bodyColor, 14), Paint.Style.FILL, 0f);
        Paint rowBorderPaint = createPaint(
            applyAlpha(palette.bodyColor, 34),
            Paint.Style.STROKE,
            Math.max(1f, dp(context, 0.8f))
        );
        Paint todayFillPaint = createPaint(applyAlpha(palette.accentColor, 34), Paint.Style.FILL, 0f);
        Paint todayBorderPaint = createPaint(
            blendColors(palette.accentColor, palette.contrastReferenceColor, 0.16f),
            Paint.Style.STROKE,
            Math.max(1f, dp(context, 1.1f))
        );
        Paint gridPaint = createPaint(
            applyAlpha(palette.bodyColor, 34),
            Paint.Style.STROKE,
            Math.max(1f, dp(context, 0.65f))
        );
        Paint placeholderPaint = createPaint(
            applyAlpha(palette.bodyColor, 42),
            Paint.Style.STROKE,
            Math.max(1f, dp(context, 0.9f))
        );
        Paint labelPaint = createPaint(palette.bodyColor, Paint.Style.FILL, 0f);
        labelPaint.setTextSize(sp(context, minimal ? 6.4f : 7.2f));
        Paint todayLabelPaint = createPaint(
            blendColors(palette.bodyColor, palette.contrastReferenceColor, 0.16f),
            Paint.Style.FILL,
            0f
        );
        todayLabelPaint.setTextSize(sp(context, minimal ? 6.4f : 7.2f));
        Paint segmentTextPaint = createPaint(palette.accentTextColor, Paint.Style.FILL, 0f);
        segmentTextPaint.setTextSize(sp(context, minimal ? 6.1f : 6.8f));
        Paint emptyPaint = createPaint(applyAlpha(palette.subtitleColor, 180), Paint.Style.FILL, 0f);
        emptyPaint.setTextSize(sp(context, 7f));

        boolean hasAnySegment = false;
        for (int index = 0; index < rows.size(); index++) {
            PreviewDayRow row = rows.get(index);
            float rowTop = outerTop + index * (rowHeight + rowGap);
            RectF rowRect = new RectF(timelineLeft, rowTop, timelineRight, rowTop + rowHeight);
            canvas.drawRoundRect(
                rowRect,
                rowRadius,
                rowRadius,
                row != null && row.today ? todayFillPaint : rowFillPaint
            );
            canvas.drawRoundRect(
                rowRect,
                rowRadius,
                rowRadius,
                row != null && row.today ? todayBorderPaint : rowBorderPaint
            );

            if (rowRect.width() > dp(context, 80f)) {
                for (int marker = 1; marker < 4; marker++) {
                    float x = rowRect.left + (rowRect.width() * marker / 4f);
                    canvas.drawLine(
                        x,
                        rowRect.top + dp(context, 1f),
                        x,
                        rowRect.bottom - dp(context, 1f),
                        gridPaint
                    );
                }
            }

            if (showRowLabels && row != null) {
                RectF labelRect = new RectF(outerLeft, rowTop, outerLeft + labelWidth, rowTop + rowHeight);
                drawTextInRect(
                    canvas,
                    labelRect,
                    safeText(row.label),
                    row.today ? todayLabelPaint : labelPaint,
                    0f
                );
            }

            if (row == null || row.segments.isEmpty()) {
                canvas.drawLine(
                    rowRect.left + dp(context, 3f),
                    rowRect.centerY(),
                    rowRect.right - dp(context, 3f),
                    rowRect.centerY(),
                    placeholderPaint
                );
                continue;
            }

            for (PreviewSegment segment : row.segments) {
                if (segment == null) {
                    continue;
                }
                hasAnySegment = true;
                float segmentLeft =
                    rowRect.left + rowRect.width() * (segment.startMinutes / 1440f);
                float segmentRight =
                    rowRect.left + rowRect.width() * (segment.endMinutes / 1440f);
                float minWidth = Math.max(dp(context, 2f), rowHeight * 0.35f);
                if (segmentRight - segmentLeft < minWidth) {
                    segmentRight = Math.min(rowRect.right, segmentLeft + minWidth);
                }
                RectF segmentRect = new RectF(
                    segmentLeft,
                    rowRect.top + dp(context, 1f),
                    segmentRight,
                    rowRect.bottom - dp(context, 1f)
                );
                Paint segmentPaint = createPaint(segment.color, Paint.Style.FILL, 0f);
                canvas.drawRoundRect(segmentRect, rowRadius, rowRadius, segmentPaint);

                if (!showSegmentText || segmentRect.width() < dp(context, 26f)) {
                    continue;
                }
                String segmentText = safeText(segment.label);
                if (!TextUtils.isEmpty(segment.detail) && segmentRect.width() >= dp(context, 70f)) {
                    segmentText = segmentText + " " + safeText(segment.detail);
                } else if (segmentRect.width() < dp(context, 42f)) {
                    segmentText = segmentRect.width() >= dp(context, 34f)
                        ? safeText(segment.detail)
                        : "";
                }
                if (!TextUtils.isEmpty(segmentText)) {
                    segmentTextPaint.setColor(
                        resolveReadableTextColor(
                            palette.accentTextColor,
                            segment.color,
                            4.1d
                        )
                    );
                    drawTextInRect(
                        canvas,
                        segmentRect,
                        segmentText,
                        segmentTextPaint,
                        dp(context, 3f)
                    );
                }
            }
        }

        if (!hasAnySegment && !TextUtils.isEmpty(emptyText) && !minimal) {
            drawTextInRect(
                canvas,
                new RectF(timelineLeft, outerTop, timelineRight, outerBottom),
                emptyText,
                emptyPaint,
                dp(context, 4f)
            );
        }
        return bitmap;
    }

    private static List<PreviewLegendEntry> buildDayPieEntries(
        ControlerWidgetDataStore.State state,
        ThemePalette palette
    ) {
        List<PreviewLegendEntry> entries = new ArrayList<>();
        if (state == null || state.records == null) {
            return entries;
        }

        Map<String, Integer> colorByProjectId = new HashMap<>();
        Map<String, Integer> colorByProjectName = new HashMap<>();
        Map<String, String> nameByProjectId = new HashMap<>();
        if (state.projects != null) {
            for (ControlerWidgetDataStore.ProjectInfo project : state.projects) {
                if (project == null) {
                    continue;
                }
                int color = resolveVisibleAccentColor(
                    parseColor(project.color, palette.accentColor),
                    palette.surfaceColor,
                    palette.accentColor
                );
                if (!TextUtils.isEmpty(project.id)) {
                    colorByProjectId.put(project.id, color);
                    nameByProjectId.put(project.id, firstNonEmpty(project.name, project.id));
                }
                if (!TextUtils.isEmpty(project.name)) {
                    colorByProjectName.put(project.name, color);
                }
            }
        }

        String today = todayText();
        Map<String, PreviewLegendEntry> entryMap = new HashMap<>();
        for (ControlerWidgetDataStore.RecordInfo record : state.records) {
            if (!isRecordOnDate(record, today)) {
                continue;
            }
            int minutes = Math.max(0, record == null ? 0 : record.minutes);
            if (minutes <= 0) {
                continue;
            }
            String key = !TextUtils.isEmpty(record.projectId)
                ? ("project:" + record.projectId)
                : ("name:" + firstNonEmpty(record.name, "未分类"));
            PreviewLegendEntry entry = entryMap.get(key);
            if (entry == null) {
                entry = new PreviewLegendEntry();
                if (!TextUtils.isEmpty(record.projectId) && nameByProjectId.containsKey(record.projectId)) {
                    entry.label = nameByProjectId.get(record.projectId);
                    entry.color = colorByProjectId.containsKey(record.projectId)
                        ? colorByProjectId.get(record.projectId)
                        : palette.accentColor;
                } else {
                    entry.label = firstNonEmpty(record.name, "未分类");
                    entry.color = colorByProjectName.containsKey(entry.label)
                        ? colorByProjectName.get(entry.label)
                        : palette.accentColor;
                }
                entryMap.put(key, entry);
            }
            entry.minutes += minutes;
        }

        entries.addAll(entryMap.values());
        Collections.sort(entries, new Comparator<PreviewLegendEntry>() {
            @Override
            public int compare(PreviewLegendEntry left, PreviewLegendEntry right) {
                return right.minutes - left.minutes;
            }
        });
        return entries;
    }

    private static void drawYearGoalPreviewCard(
        Context context,
        Canvas canvas,
        RectF rect,
        String title,
        List<ControlerWidgetDataStore.GoalInfo> goals,
        ThemePalette palette,
        int accentColor,
        boolean showGoalList
    ) {
        if (context == null || canvas == null || rect == null) {
            return;
        }

        float radius = dp(context, 8f);
        float borderWidth = Math.max(1f, dp(context, 1f));
        Paint fillPaint = createPaint(
            blendColors(palette.surfaceColor, accentColor, 0.16f),
            Paint.Style.FILL,
            0f
        );
        Paint borderPaint = createPaint(
            applyAlpha(
                blendColors(accentColor, palette.contrastReferenceColor, 0.14f),
                210
            ),
            Paint.Style.STROKE,
            borderWidth
        );
        Paint titlePaint = createPaint(palette.titleColor, Paint.Style.FILL, 0f);
        titlePaint.setTextSize(sp(context, rect.height() < dp(context, 36f) ? 6.8f : 7.2f));
        Paint bodyPaint = createPaint(palette.bodyColor, Paint.Style.FILL, 0f);
        bodyPaint.setTextSize(sp(context, rect.height() < dp(context, 36f) ? 6.3f : 6.7f));
        Paint chipPaint = createPaint(accentColor, Paint.Style.FILL, 0f);
        Paint chipTextPaint = createPaint(
            resolveReadableTextColor(palette.accentTextColor, accentColor, 4.1d),
            Paint.Style.FILL,
            0f
        );
        chipTextPaint.setTextSize(sp(context, 6.1f));

        canvas.drawRoundRect(rect, radius, radius, fillPaint);
        canvas.drawRoundRect(rect, radius, radius, borderPaint);

        float padding = dp(context, 6f);
        String countText = Math.max(0, goals == null ? 0 : goals.size()) + "项";
        float chipWidth = Math.max(dp(context, 20f), chipTextPaint.measureText(countText) + dp(context, 10f));
        RectF chipRect = new RectF(
            rect.right - padding - chipWidth,
            rect.top + padding,
            rect.right - padding,
            rect.top + padding + dp(context, 12f)
        );
        canvas.drawRoundRect(chipRect, dp(context, 6f), dp(context, 6f), chipPaint);
        drawTextInRect(canvas, chipRect, countText, chipTextPaint, dp(context, 3f));

        RectF titleRect = new RectF(
            rect.left + padding,
            rect.top + padding,
            chipRect.left - dp(context, 4f),
            rect.top + padding + dp(context, 12f)
        );
        drawTextInRect(canvas, titleRect, title, titlePaint, 0f);

        if (!showGoalList) {
            return;
        }

        List<ControlerWidgetDataStore.GoalInfo> safeGoals =
            goals == null ? Collections.<ControlerWidgetDataStore.GoalInfo>emptyList() : goals;
        float lineTop = titleRect.bottom + dp(context, 4f);
        int maxLines = rect.height() < dp(context, 42f) ? 1 : 2;
        if (safeGoals.isEmpty()) {
            RectF lineRect = new RectF(
                rect.left + padding,
                lineTop,
                rect.right - padding,
                rect.bottom - padding
            );
            drawTextInRect(canvas, lineRect, "暂无目标", bodyPaint, 0f);
            return;
        }

        float lineHeight = Math.max(dp(context, 10f), sp(context, 6.7f) + dp(context, 2f));
        for (int index = 0; index < Math.min(maxLines, safeGoals.size()); index++) {
            ControlerWidgetDataStore.GoalInfo goal = safeGoals.get(index);
            String lineText = "• " + firstNonEmpty(goal == null ? "" : goal.title, "未命名目标");
            RectF lineRect = new RectF(
                rect.left + padding,
                lineTop + lineHeight * index,
                rect.right - padding,
                lineTop + lineHeight * (index + 1)
            );
            drawTextInRect(canvas, lineRect, lineText, bodyPaint, 0f);
        }
    }

    private static PreviewTimeRange resolveRecordPreviewRange(
        ControlerWidgetDataStore.RecordInfo record
    ) {
        if (record == null) {
            return null;
        }

        long startMs = parseTimestampMillis(record.startTime);
        long endMs = parseTimestampMillis(record.endTime);
        long anchorMs = parseTimestampMillis(
            firstNonEmpty(record.timestamp, record.startTime, record.endTime)
        );
        long durationMs = Math.max(0L, Math.max(0, record.minutes) * 60000L);
        if (durationMs <= 0L && startMs > 0L && endMs > startMs) {
            durationMs = endMs - startMs;
        }

        if (startMs <= 0L) {
            if (endMs > 0L && durationMs > 0L) {
                startMs = endMs - durationMs;
            } else if (anchorMs > 0L) {
                startMs = anchorMs;
            }
        }
        if (endMs <= startMs) {
            if (startMs > 0L && durationMs > 0L) {
                endMs = startMs + durationMs;
            } else if (anchorMs > 0L && durationMs > 0L) {
                startMs = anchorMs;
                endMs = anchorMs + durationMs;
            }
        }
        if (startMs <= 0L || endMs <= startMs) {
            return null;
        }

        PreviewTimeRange range = new PreviewTimeRange();
        range.startMs = startMs;
        range.endMs = endMs;
        return range;
    }

    private static int parseClockMinutes(String value) {
        if (TextUtils.isEmpty(value)) {
            return -1;
        }

        Matcher matcher = Pattern.compile("(\\d{1,2}):(\\d{2})").matcher(value);
        if (matcher.find()) {
            int hour = Math.max(0, Math.min(23, safeParse(matcher.group(1))));
            int minute = Math.max(0, Math.min(59, safeParse(matcher.group(2))));
            return hour * 60 + minute;
        }

        long timestamp = parseTimestampMillis(value);
        if (timestamp > 0L) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTimeInMillis(timestamp);
            return calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE);
        }
        return -1;
    }

    private static String formatClockRange(int startMinutes, int endMinutes) {
        return formatClockMinutes(startMinutes) + "-" + formatClockMinutes(endMinutes);
    }

    private static int resolvePlanDurationMinutes(ControlerWidgetDataStore.PlanInfo plan) {
        if (plan == null) {
            return 0;
        }
        int startMinutes = parseClockMinutes(plan.startTime);
        int endMinutes = parseClockMinutes(plan.endTime);
        if (startMinutes < 0 || endMinutes <= startMinutes) {
            return 0;
        }
        return endMinutes - startMinutes;
    }

    private static String formatClockMinutes(int totalMinutes) {
        int safeMinutes = Math.max(0, Math.min(1440, totalMinutes));
        int hour = Math.min(23, safeMinutes / 60);
        int minute = safeMinutes % 60;
        if (safeMinutes == 1440) {
            hour = 24;
            minute = 0;
        }
        return String.format(Locale.CHINA, "%02d:%02d", hour, minute);
    }

    private static String formatMinutesCompact(int totalMinutes) {
        int safeMinutes = Math.max(0, totalMinutes);
        int hours = safeMinutes / 60;
        int minutes = safeMinutes % 60;
        if (hours > 0 && minutes > 0) {
            return hours + "小时" + minutes + "分";
        }
        if (hours > 0) {
            return hours + "小时";
        }
        return minutes + "分";
    }

    private static void drawTextInRect(
        Canvas canvas,
        RectF rect,
        String text,
        Paint paint,
        float horizontalPadding
    ) {
        if (
            canvas == null
                || rect == null
                || paint == null
                || TextUtils.isEmpty(text)
                || rect.width() <= horizontalPadding * 2f
        ) {
            return;
        }

        String fitted = ellipsizeText(paint, text, rect.width() - horizontalPadding * 2f);
        if (TextUtils.isEmpty(fitted)) {
            return;
        }

        float baseline = rect.centerY() - ((paint.ascent() + paint.descent()) / 2f);
        canvas.save();
        canvas.clipRect(rect);
        canvas.drawText(fitted, rect.left + horizontalPadding, baseline, paint);
        canvas.restore();
    }

    private static String ellipsizeText(Paint paint, String text, float maxWidth) {
        if (paint == null || TextUtils.isEmpty(text) || maxWidth <= 0f) {
            return "";
        }
        if (paint.measureText(text) <= maxWidth) {
            return text;
        }

        String ellipsis = "...";
        float ellipsisWidth = paint.measureText(ellipsis);
        if (ellipsisWidth > maxWidth) {
            return "";
        }

        String safeText = text;
        while (safeText.length() > 0) {
            safeText = safeText.substring(0, safeText.length() - 1);
            if (paint.measureText(safeText) + ellipsisWidth <= maxWidth) {
                return safeText + ellipsis;
            }
        }
        return "";
    }

    private static float resolvePreviewWidthDp(
        WidgetMetrics metrics,
        float minWidthDp,
        float fallbackWidthDp
    ) {
        if (metrics == null || metrics.minWidthDp <= 0) {
            return fallbackWidthDp;
        }
        float trimmedWidth = metrics.minWidthDp - (metrics.sizeClass == SIZE_COMPACT ? 14f : 24f);
        return Math.max(minWidthDp, trimmedWidth);
    }

    private static void resetToStartOfDay(Calendar calendar) {
        if (calendar == null) {
            return;
        }
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
    }

    private static void appendProjectSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.ProjectInfo> projects
    ) {
        if (signature == null) {
            return;
        }
        if (projects == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(projects.size());
        for (ControlerWidgetDataStore.ProjectInfo project : projects) {
            signature.addString(project == null ? "" : project.id);
            signature.addString(project == null ? "" : project.name);
            signature.addString(project == null ? "" : project.color);
        }
    }

    private static void appendRecordSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.RecordInfo> records
    ) {
        if (signature == null) {
            return;
        }
        if (records == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(records.size());
        for (ControlerWidgetDataStore.RecordInfo record : records) {
            signature.addString(record == null ? "" : record.timestamp);
            signature.addString(record == null ? "" : record.startTime);
            signature.addString(record == null ? "" : record.endTime);
            signature.addString(record == null ? "" : record.dateText);
            signature.addInt(record == null ? 0 : record.hour);
            signature.addString(record == null ? "" : record.name);
            signature.addInt(record == null ? 0 : record.minutes);
            signature.addString(record == null ? "" : record.projectId);
        }
    }

    private static void appendTodoSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.TodoInfo> todos
    ) {
        if (signature == null) {
            return;
        }
        if (todos == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(todos.size());
        for (ControlerWidgetDataStore.TodoInfo todo : todos) {
            signature.addString(todo == null ? "" : todo.id);
            signature.addString(todo == null ? "" : todo.title);
            signature.addString(todo == null ? "" : todo.dueDate);
            signature.addString(todo == null ? "" : todo.startDate);
            signature.addString(todo == null ? "" : todo.endDate);
            signature.addString(todo == null ? "" : todo.repeatType);
            signature.addBoolean(todo != null && todo.completed);
            signature.addString(todo == null ? "" : todo.color);
            appendIntegerListSignature(signature, todo == null ? null : todo.repeatWeekdays);
        }
    }

    private static void appendCheckinItemSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.CheckinItemInfo> checkinItems
    ) {
        if (signature == null) {
            return;
        }
        if (checkinItems == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(checkinItems.size());
        for (ControlerWidgetDataStore.CheckinItemInfo item : checkinItems) {
            signature.addString(item == null ? "" : item.id);
            signature.addString(item == null ? "" : item.title);
            signature.addString(item == null ? "" : item.startDate);
            signature.addString(item == null ? "" : item.endDate);
            signature.addString(item == null ? "" : item.repeatType);
            signature.addString(item == null ? "" : item.color);
            appendIntegerListSignature(signature, item == null ? null : item.repeatWeekdays);
        }
    }

    private static void appendDailyCheckinSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.DailyCheckinInfo> dailyCheckins
    ) {
        if (signature == null) {
            return;
        }
        if (dailyCheckins == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(dailyCheckins.size());
        for (ControlerWidgetDataStore.DailyCheckinInfo entry : dailyCheckins) {
            signature.addString(entry == null ? "" : entry.itemId);
            signature.addString(entry == null ? "" : entry.date);
            signature.addBoolean(entry != null && entry.checked);
        }
    }

    private static void appendPlanSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.PlanInfo> plans
    ) {
        if (signature == null) {
            return;
        }
        if (plans == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(plans.size());
        for (ControlerWidgetDataStore.PlanInfo plan : plans) {
            signature.addString(plan == null ? "" : plan.name);
            signature.addString(plan == null ? "" : plan.date);
            signature.addString(plan == null ? "" : plan.startTime);
            signature.addString(plan == null ? "" : plan.endTime);
            signature.addString(plan == null ? "" : plan.color);
            signature.addString(plan == null ? "" : plan.repeat);
            appendIntegerListSignature(signature, plan == null ? null : plan.repeatDays);
            appendStringListSignature(signature, plan == null ? null : plan.excludedDates);
        }
    }

    private static void appendDiaryEntriesSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.DiaryEntryInfo> diaryEntries
    ) {
        if (signature == null) {
            return;
        }
        if (diaryEntries == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(diaryEntries.size());
        for (ControlerWidgetDataStore.DiaryEntryInfo entry : diaryEntries) {
            signature.addString(entry == null ? "" : entry.id);
            signature.addString(entry == null ? "" : entry.date);
            signature.addString(entry == null ? "" : entry.title);
            signature.addString(entry == null ? "" : entry.content);
            signature.addString(entry == null ? "" : entry.updatedAt);
        }
    }

    private static void appendYearGoalSignature(
        SignatureAccumulator signature,
        Map<Integer, List<ControlerWidgetDataStore.GoalInfo>> goalsByMonth,
        List<ControlerWidgetDataStore.GoalInfo> annualGoals
    ) {
        if (signature == null) {
            return;
        }
        appendGoalListSignature(signature, annualGoals);
        if (goalsByMonth == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(goalsByMonth.size());
        List<Integer> keys = new ArrayList<>(goalsByMonth.keySet());
        Collections.sort(keys);
        for (Integer key : keys) {
            signature.addInt(key == null ? -1 : key);
            appendGoalListSignature(signature, goalsByMonth.get(key));
        }
    }

    private static void appendGoalListSignature(
        SignatureAccumulator signature,
        List<ControlerWidgetDataStore.GoalInfo> goals
    ) {
        if (signature == null) {
            return;
        }
        if (goals == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(goals.size());
        for (ControlerWidgetDataStore.GoalInfo goal : goals) {
            signature.addString(goal == null ? "" : goal.id);
            signature.addString(goal == null ? "" : goal.title);
            signature.addString(goal == null ? "" : goal.description);
            signature.addString(goal == null ? "" : goal.priority);
            signature.addString(goal == null ? "" : goal.createdAt);
        }
    }

    private static void appendTimerSessionSignature(
        SignatureAccumulator signature,
        ControlerWidgetDataStore.TimerSessionInfo timerSession
    ) {
        if (signature == null) {
            return;
        }
        if (timerSession == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(timerSession.ptn);
        signature.addString(timerSession.fpt);
        signature.addString(timerSession.spt);
        signature.addString(timerSession.lastspt);
        signature.addString(timerSession.selectedProject);
        signature.addString(timerSession.nextProject);
        signature.addString(timerSession.lastEnteredProjectName);
    }

    private static void appendIntegerListSignature(
        SignatureAccumulator signature,
        List<Integer> values
    ) {
        if (signature == null) {
            return;
        }
        if (values == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(values.size());
        for (Integer value : values) {
            signature.addInt(value == null ? 0 : value);
        }
    }

    private static void appendStringListSignature(
        SignatureAccumulator signature,
        List<String> values
    ) {
        if (signature == null) {
            return;
        }
        if (values == null) {
            signature.addInt(-1);
            return;
        }
        signature.addInt(values.size());
        for (String value : values) {
            signature.addString(value);
        }
    }

    private static Bitmap createPreviewBitmap(Context context, float widthDp, float heightDp) {
        return Bitmap.createBitmap(
            Math.max(1, dp(context, widthDp)),
            Math.max(1, dp(context, heightDp)),
            Bitmap.Config.ARGB_8888
        );
    }

    private static Paint createPaint(int color, Paint.Style style, float strokeWidth) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(style);
        if (strokeWidth > 0f) {
            paint.setStrokeWidth(strokeWidth);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
        }
        return paint;
    }

    private static int applyAlpha(int color, int alpha) {
        return Color.argb(
            Math.max(0, Math.min(255, alpha)),
            Color.red(color),
            Color.green(color),
            Color.blue(color)
        );
    }

    private static int dp(Context context, float value) {
        float density = context.getResources().getDisplayMetrics().density;
        return Math.max(1, Math.round(value * density));
    }

    private static float sp(Context context, float value) {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP,
            value,
            context.getResources().getDisplayMetrics()
        );
    }

    private static int daysBetween(Calendar start, Calendar end) {
        Calendar safeStart = (Calendar) start.clone();
        Calendar safeEnd = (Calendar) end.clone();
        safeStart.set(Calendar.HOUR_OF_DAY, 0);
        safeStart.set(Calendar.MINUTE, 0);
        safeStart.set(Calendar.SECOND, 0);
        safeStart.set(Calendar.MILLISECOND, 0);
        safeEnd.set(Calendar.HOUR_OF_DAY, 0);
        safeEnd.set(Calendar.MINUTE, 0);
        safeEnd.set(Calendar.SECOND, 0);
        safeEnd.set(Calendar.MILLISECOND, 0);
        long diffMs = safeEnd.getTimeInMillis() - safeStart.getTimeInMillis();
        return (int) Math.round(diffMs / 86400000d);
    }

    private static boolean todoScheduledOn(
        ControlerWidgetDataStore.TodoInfo todo,
        Calendar day,
        String dayText
    ) {
        if (todo == null) {
            return false;
        }
        String repeatType = TextUtils.isEmpty(todo.repeatType) ? "none" : todo.repeatType;
        if (!inDateRange(dayText, todo.startDate, todo.endDate)) {
            return false;
        }

        if ("weekly".equals(repeatType)) {
            int jsWeekday = day.get(Calendar.DAY_OF_WEEK) - 1;
            return todo.repeatWeekdays != null && todo.repeatWeekdays.contains(jsWeekday);
        }
        if ("daily".equals(repeatType)) {
            return true;
        }

        if (!TextUtils.isEmpty(todo.dueDate)) {
            return dayText.compareTo(todo.dueDate) <= 0;
        }
        return true;
    }

    private static boolean checkinScheduledOn(
        ControlerWidgetDataStore.CheckinItemInfo item,
        Calendar day,
        String dayText
    ) {
        if (item == null) {
            return false;
        }
        if (!inDateRange(dayText, item.startDate, item.endDate)) {
            return false;
        }

        String repeatType = TextUtils.isEmpty(item.repeatType) ? "daily" : item.repeatType;
        if ("weekly".equals(repeatType)) {
            int jsWeekday = day.get(Calendar.DAY_OF_WEEK) - 1;
            return item.repeatWeekdays != null && item.repeatWeekdays.contains(jsWeekday);
        }
        return true;
    }

    private static boolean isCheckinDoneForDate(
        List<ControlerWidgetDataStore.DailyCheckinInfo> dailyCheckins,
        String itemId,
        String dateText
    ) {
        if (TextUtils.isEmpty(itemId) || dailyCheckins == null) {
            return false;
        }
        for (ControlerWidgetDataStore.DailyCheckinInfo entry : dailyCheckins) {
            if (entry == null) {
                continue;
            }
            if (itemId.equals(entry.itemId) && dateText.equals(entry.date) && entry.checked) {
                return true;
            }
        }
        return false;
    }

    private static int countPlansInMonth(
        List<ControlerWidgetDataStore.PlanInfo> plans,
        int year,
        int month
    ) {
        Calendar cursor = Calendar.getInstance();
        cursor.set(Calendar.YEAR, year);
        cursor.set(Calendar.MONTH, month);
        cursor.set(Calendar.DAY_OF_MONTH, 1);
        cursor.set(Calendar.HOUR_OF_DAY, 0);
        cursor.set(Calendar.MINUTE, 0);
        cursor.set(Calendar.SECOND, 0);
        cursor.set(Calendar.MILLISECOND, 0);
        int dayCount = cursor.getActualMaximum(Calendar.DAY_OF_MONTH);

        int total = 0;
        for (int day = 1; day <= dayCount; day++) {
            cursor.set(Calendar.DAY_OF_MONTH, day);
            total += countPlansOnDate(plans, dateText(cursor));
        }
        return total;
    }

    private static int countPlansOnDate(
        List<ControlerWidgetDataStore.PlanInfo> plans,
        String dateText
    ) {
        if (plans == null || TextUtils.isEmpty(dateText)) {
            return 0;
        }
        int count = 0;
        for (ControlerWidgetDataStore.PlanInfo plan : plans) {
            if (planOccursOnDate(plan, dateText)) {
                count++;
            }
        }
        return count;
    }

    private static boolean planOccursOnDate(ControlerWidgetDataStore.PlanInfo plan, String dateText) {
        if (plan == null || TextUtils.isEmpty(dateText)) {
            return false;
        }

        Calendar target = calendarFromDateText(dateText);
        Calendar start = calendarFromDateText(plan.date);
        if (target == null || start == null) {
            return false;
        }
        if (target.before(start)) {
            return false;
        }

        if (plan.excludedDates != null && plan.excludedDates.contains(dateText)) {
            return false;
        }

        if (dateText.equals(plan.date)) {
            return true;
        }

        String repeatType = TextUtils.isEmpty(plan.repeat) ? "none" : plan.repeat;
        if ("none".equals(repeatType)) {
            return false;
        }
        if ("daily".equals(repeatType)) {
            return true;
        }
        if ("weekly".equals(repeatType)) {
            int dayOfWeek = target.get(Calendar.DAY_OF_WEEK) - 1;
            if (plan.repeatDays != null && !plan.repeatDays.isEmpty()) {
                return plan.repeatDays.contains(dayOfWeek);
            }
            return start.get(Calendar.DAY_OF_WEEK) == target.get(Calendar.DAY_OF_WEEK);
        }
        if ("monthly".equals(repeatType)) {
            return start.get(Calendar.DAY_OF_MONTH) == target.get(Calendar.DAY_OF_MONTH);
        }
        return false;
    }

    private static boolean inDateRange(String currentDate, String startDate, String endDate) {
        if (!TextUtils.isEmpty(startDate) && currentDate.compareTo(startDate) < 0) {
            return false;
        }
        if (!TextUtils.isEmpty(endDate) && currentDate.compareTo(endDate) > 0) {
            return false;
        }
        return true;
    }

    private static boolean isRecordOnDate(ControlerWidgetDataStore.RecordInfo record, String dayText) {
        if (record == null || TextUtils.isEmpty(dayText)) {
            return false;
        }
        if (!TextUtils.isEmpty(record.dateText) && dayText.equals(record.dateText)) {
            return true;
        }
        return !TextUtils.isEmpty(record.timestamp) && record.timestamp.startsWith(dayText);
    }

    private static void sortRecordsByTimestampDesc(List<ControlerWidgetDataStore.RecordInfo> records) {
        Collections.sort(records, new Comparator<ControlerWidgetDataStore.RecordInfo>() {
            @Override
            public int compare(
                ControlerWidgetDataStore.RecordInfo left,
                ControlerWidgetDataStore.RecordInfo right
            ) {
                String leftTimestamp = left != null && left.timestamp != null ? left.timestamp : "";
                String rightTimestamp = right != null && right.timestamp != null ? right.timestamp : "";
                return rightTimestamp.compareTo(leftTimestamp);
            }
        });
    }

    private static boolean isTimerSessionActive(ControlerWidgetDataStore.State state) {
        return state != null
            && state.timerSession != null
            && state.timerSession.ptn >= 1
            && parseTimestampMillis(state.timerSession.fpt) > 0L;
    }

    private static String resolveTimerProjectName(ControlerWidgetDataStore.State state) {
        if (state == null) {
            return "快速计时";
        }
        if (state.timerSession != null) {
            if (!TextUtils.isEmpty(state.timerSession.selectedProject)) {
                return state.timerSession.selectedProject;
            }
            if (!TextUtils.isEmpty(state.timerSession.lastEnteredProjectName)) {
                return state.timerSession.lastEnteredProjectName;
            }
        }
        if (state.projects != null && !state.projects.isEmpty()) {
            ControlerWidgetDataStore.ProjectInfo project = state.projects.get(0);
            if (project != null && !TextUtils.isEmpty(project.name)) {
                return project.name;
            }
        }
        return "快速计时";
    }

    private static long parseTimestampMillis(String value) {
        if (TextUtils.isEmpty(value)) {
            return 0L;
        }

        String[] patterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                return format.parse(value).getTime();
            } catch (Exception ignored) {
            }
        }

        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static String formatElapsedMs(long elapsedMs) {
        if (elapsedMs <= 0L) {
            return "刚开始";
        }
        long seconds = elapsedMs / 1000L;
        if (seconds < 60L) {
            return Math.max(1L, seconds) + "秒";
        }
        return formatMinutes((int) (elapsedMs / 60000L));
    }

    private static String formatDiaryUpdatedAt(String updatedAt) {
        long updatedAtMillis = parseTimestampMillis(updatedAt);
        if (updatedAtMillis <= 0L) {
            return "今日内容已同步";
        }
        return "更新于 "
            + new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(updatedAtMillis));
    }

    private static String formatMonthDayLabel(String dateText) {
        Calendar calendar = calendarFromDateText(dateText);
        if (calendar == null) {
            return safeText(dateText);
        }
        return (calendar.get(Calendar.MONTH) + 1) + "/" + calendar.get(Calendar.DAY_OF_MONTH);
    }

    private static String joinWeekdayLabels(List<Integer> weekdays) {
        if (weekdays == null || weekdays.isEmpty()) {
            return "";
        }
        String[] labels = {"周日", "周一", "周二", "周三", "周四", "周五", "周六"};
        List<Integer> sorted = new ArrayList<>(weekdays);
        Collections.sort(sorted);
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < sorted.size(); index++) {
            int day = Math.max(0, Math.min(labels.length - 1, sorted.get(index)));
            if (builder.length() > 0) {
                builder.append("、");
            }
            builder.append(labels[day]);
        }
        return builder.toString();
    }

    private static String describeTodoRepeat(ControlerWidgetDataStore.TodoInfo todo) {
        if (todo == null) {
            return "";
        }
        if ("weekly".equals(todo.repeatType)) {
            String labels = joinWeekdayLabels(todo.repeatWeekdays);
            return TextUtils.isEmpty(labels) ? "每周重复" : "每周 " + labels;
        }
        if ("daily".equals(todo.repeatType)) {
            return "每天重复";
        }
        return TextUtils.isEmpty(todo.dueDate) ? "待安排" : "截止 " + formatMonthDayLabel(todo.dueDate);
    }

    private static String describeTodoCardMeta(
        ControlerWidgetDataStore.TodoInfo todo,
        String today
    ) {
        return describeTodoCardMeta(todo, today, todo != null && todo.completed);
    }

    private static String describeTodoCardMeta(
        ControlerWidgetDataStore.TodoInfo todo,
        String today,
        boolean completed
    ) {
        if (todo == null) {
            return "";
        }
        if (completed) {
            return "已完成";
        }
        if (!TextUtils.isEmpty(todo.repeatType) && !"none".equals(todo.repeatType)) {
            return describeTodoRepeat(todo);
        }
        if (today.equals(todo.dueDate)) {
            return "今天截止";
        }
        if (!TextUtils.isEmpty(todo.dueDate) && todo.dueDate.compareTo(today) < 0) {
            return "已逾期 · " + formatMonthDayLabel(todo.dueDate);
        }
        if (!TextUtils.isEmpty(todo.dueDate)) {
            return "截止 " + formatMonthDayLabel(todo.dueDate);
        }
        return "待安排";
    }

    private static boolean isWidgetTodoOverdue(
        ControlerWidgetDataStore.TodoInfo todo,
        String today
    ) {
        return isWidgetTodoOverdue(todo, today, todo != null && todo.completed);
    }

    private static boolean isWidgetTodoOverdue(
        ControlerWidgetDataStore.TodoInfo todo,
        String today,
        boolean completed
    ) {
        if (todo == null || completed) {
            return false;
        }
        String repeatType = TextUtils.isEmpty(todo.repeatType) ? "none" : todo.repeatType;
        return "none".equals(repeatType)
            && !TextUtils.isEmpty(todo.dueDate)
            && todo.dueDate.compareTo(today) < 0;
    }

    private static String findNextWidgetTodoScheduledDate(
        ControlerWidgetDataStore.TodoInfo todo,
        String today,
        int maxDays
    ) {
        Calendar cursor = calendarFromDateText(today);
        if (todo == null || cursor == null) {
            return "";
        }
        for (int offset = 1; offset <= Math.max(1, maxDays); offset++) {
            cursor.add(Calendar.DAY_OF_MONTH, 1);
            String dateText = dateText(cursor);
            if (todoScheduledOn(todo, cursor, dateText)) {
                return dateText;
            }
        }
        return "";
    }

    private static String resolveWidgetTodoSortDate(
        ControlerWidgetDataStore.TodoInfo todo,
        String today
    ) {
        if (todo == null) {
            return "";
        }
        if (todoScheduledOn(todo, calendarFromDateText(today), today)) {
            return today;
        }
        String repeatType = TextUtils.isEmpty(todo.repeatType) ? "none" : todo.repeatType;
        if (!"none".equals(repeatType)) {
            String nextScheduledDate = findNextWidgetTodoScheduledDate(todo, today, 14);
            if (!TextUtils.isEmpty(nextScheduledDate)) {
                return nextScheduledDate;
            }
        }
        if (!TextUtils.isEmpty(todo.dueDate)) {
            return todo.dueDate;
        }
        if (!TextUtils.isEmpty(todo.startDate)) {
            return todo.startDate;
        }
        return "";
    }

    private static int compareWidgetDateText(String left, String right) {
        Calendar leftDate = calendarFromDateText(left);
        Calendar rightDate = calendarFromDateText(right);
        if (leftDate == null && rightDate == null) {
            return 0;
        }
        if (leftDate == null) {
            return 1;
        }
        if (rightDate == null) {
            return -1;
        }
        return safeText(dateText(leftDate)).compareTo(safeText(dateText(rightDate)));
    }

    private static String describeCheckinRepeat(ControlerWidgetDataStore.CheckinItemInfo item) {
        if (item == null) {
            return "";
        }
        if ("weekly".equals(item.repeatType)) {
            String labels = joinWeekdayLabels(item.repeatWeekdays);
            return TextUtils.isEmpty(labels) ? "每周" : "每周 " + labels;
        }
        return "每天";
    }

    private static int countCheckinStreak(
        ControlerWidgetDataStore.State state,
        ControlerWidgetDataStore.CheckinItemInfo item,
        String today
    ) {
        if (state == null || item == null) {
            return 0;
        }
        Set<String> checkedDates = new HashSet<>();
        for (ControlerWidgetDataStore.DailyCheckinInfo entry : state.dailyCheckins) {
            if (entry == null || !entry.checked || !safeText(item.id).equals(safeText(entry.itemId))) {
                continue;
            }
            checkedDates.add(entry.date);
        }

        Calendar cursor = calendarFromDateText(today);
        if (cursor == null || !checkinScheduledOn(item, cursor, today)) {
            return 0;
        }

        int streak = 0;
        for (int loop = 0; loop < 400; loop++) {
            String currentDate = dateText(cursor);
            if (checkinScheduledOn(item, cursor, currentDate)) {
                if (!checkedDates.contains(currentDate)) {
                    break;
                }
                streak++;
            }
            cursor.add(Calendar.DAY_OF_MONTH, -1);
        }
        return streak;
    }

    private static String describeCheckinCardMeta(
        ControlerWidgetDataStore.CheckinItemInfo item,
        boolean checked,
        int streak
    ) {
        if (item == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        builder.append(checked ? "已打卡" : "待打卡");
        String repeatLabel = describeCheckinRepeat(item);
        if (!TextUtils.isEmpty(repeatLabel)) {
            builder.append(" · ").append(repeatLabel);
        }
        if (streak > 0) {
            builder.append(" · 连击 ").append(streak).append(" 天");
        }
        return builder.toString();
    }

    private static String shortWeekLabel(Calendar calendar) {
        String[] labels = {"周日", "周一", "周二", "周三", "周四", "周五", "周六"};
        int dayIndex = calendar.get(Calendar.DAY_OF_WEEK) - 1;
        dayIndex = Math.max(0, Math.min(labels.length - 1, dayIndex));
        return labels[dayIndex];
    }

    private static String formatFutureRelativeDateLabel(String dateText) {
        Calendar target = calendarFromDateText(dateText);
        if (target == null) {
            return "";
        }

        Calendar today = Calendar.getInstance();
        resetToStartOfDay(today);
        resetToStartOfDay(target);
        long diffDays = (target.getTimeInMillis() - today.getTimeInMillis()) / 86400000L;
        if (diffDays == 0L) {
            return "今天";
        }
        if (diffDays == 1L) {
            return "明天";
        }
        return shortWeekLabel(target);
    }

    private static Calendar calendarFromDateText(String dateText) {
        if (TextUtils.isEmpty(dateText)) {
            return null;
        }
        return ControlerWidgetDataStore.calendarFromDateText(dateText);
    }

    private static String todayText() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
    }

    private static String dateText(Calendar calendar) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(calendar.getTime());
    }

    private static String formatMinutes(int totalMinutes) {
        int safeMinutes = Math.max(0, totalMinutes);
        int hours = safeMinutes / 60;
        int minutes = safeMinutes % 60;
        if (hours > 0 && minutes > 0) {
            return hours + "小时" + minutes + "分钟";
        }
        if (hours > 0) {
            return hours + "小时";
        }
        return minutes + "分钟";
    }

    private static String safeText(String text) {
        return text == null ? "" : text;
    }

    private static String pickLine(List<String> lines, int index) {
        if (lines == null || index < 0 || index >= lines.size()) {
            return "";
        }
        return safeText(lines.get(index));
    }
}
