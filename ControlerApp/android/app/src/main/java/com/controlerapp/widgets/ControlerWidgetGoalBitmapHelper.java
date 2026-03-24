package com.controlerapp.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.LruCache;
import android.widget.RemoteViews;

import com.controlerapp.R;

final class ControlerWidgetGoalBitmapHelper {
    private static final int CACHE_BYTES = 768 * 1024;
    private static final float ROW_BITMAP_WIDTH_DP = 144f;
    private static final float ROW_BITMAP_HEIGHT_DP = 42f;
    private static final float ROW_RADIUS_DP = 18f;
    private static final float BADGE_BITMAP_WIDTH_DP = 28f;
    private static final float BADGE_BITMAP_HEIGHT_DP = 24f;
    private static final float BADGE_RADIUS_DP = 999f;
    private static final float TOGGLE_BITMAP_SIZE_DP = 26f;
    private static final float TOGGLE_RADIUS_DP = 999f;
    private static final float STROKE_WIDTH_DP = 1f;
    private static final Object CACHE_LOCK = new Object();
    private static final LruCache<String, Bitmap> BITMAP_CACHE =
        new LruCache<String, Bitmap>(CACHE_BYTES) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return value == null ? 0 : value.getByteCount();
            }
        };

    private ControlerWidgetGoalBitmapHelper() {}

    static void applyCompactGoalStyle(
        Context context,
        RemoteViews views,
        ControlerWidgetCollectionStore.RowData row
    ) {
        if (context == null || views == null || row == null) {
            return;
        }
        views.setImageViewBitmap(
            R.id.widget_collection_item_background,
            resolveRoundedBitmap(
                context,
                ROW_BITMAP_WIDTH_DP,
                ROW_BITMAP_HEIGHT_DP,
                ROW_RADIUS_DP,
                row.backgroundColor,
                Color.TRANSPARENT,
                0f
            )
        );
        views.setImageViewBitmap(
            R.id.widget_collection_item_outline,
            resolveRoundedBitmap(
                context,
                ROW_BITMAP_WIDTH_DP,
                ROW_BITMAP_HEIGHT_DP,
                ROW_RADIUS_DP,
                Color.TRANSPARENT,
                row.outlineColor,
                STROKE_WIDTH_DP
            )
        );
        views.setImageViewBitmap(
            R.id.widget_collection_item_goal_badge_background,
            resolveRoundedBitmap(
                context,
                BADGE_BITMAP_WIDTH_DP,
                BADGE_BITMAP_HEIGHT_DP,
                BADGE_RADIUS_DP,
                row.badgeColor,
                Color.TRANSPARENT,
                0f
            )
        );
        views.setImageViewBitmap(
            R.id.widget_collection_item_goal_toggle_fill,
            resolveRoundedBitmap(
                context,
                TOGGLE_BITMAP_SIZE_DP,
                TOGGLE_BITMAP_SIZE_DP,
                TOGGLE_RADIUS_DP,
                row.completionFillColor,
                Color.TRANSPARENT,
                0f
            )
        );
        views.setImageViewBitmap(
            R.id.widget_collection_item_goal_toggle_outline,
            resolveRoundedBitmap(
                context,
                TOGGLE_BITMAP_SIZE_DP,
                TOGGLE_BITMAP_SIZE_DP,
                TOGGLE_RADIUS_DP,
                Color.TRANSPARENT,
                row.completionOutlineColor,
                STROKE_WIDTH_DP
            )
        );
    }

    private static Bitmap resolveRoundedBitmap(
        Context context,
        float widthDp,
        float heightDp,
        float radiusDp,
        int fillColor,
        int strokeColor,
        float strokeWidthDp
    ) {
        int widthPx = dpToPx(context, widthDp);
        int heightPx = dpToPx(context, heightDp);
        int radiusPx = dpToPx(context, radiusDp);
        int strokeWidthPx = strokeWidthDp <= 0f ? 0 : dpToPx(context, strokeWidthDp);
        String cacheKey =
            widthPx
                + "x"
                + heightPx
                + "|r="
                + radiusPx
                + "|f="
                + fillColor
                + "|s="
                + strokeColor
                + "|sw="
                + strokeWidthPx;
        synchronized (CACHE_LOCK) {
            Bitmap cached = BITMAP_CACHE.get(cacheKey);
            if (cached != null) {
                return cached;
            }
        }

        Bitmap bitmap = Bitmap.createBitmap(
            Math.max(widthPx, 1),
            Math.max(heightPx, 1),
            Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(bitmap);
        RectF bounds = new RectF(0f, 0f, widthPx, heightPx);
        Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(fillColor);
        if (Color.alpha(fillColor) > 0) {
            canvas.drawRoundRect(bounds, radiusPx, radiusPx, fillPaint);
        }
        if (strokeWidthPx > 0 && Color.alpha(strokeColor) > 0) {
            Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            strokePaint.setStyle(Paint.Style.STROKE);
            strokePaint.setStrokeWidth(strokeWidthPx);
            strokePaint.setColor(strokeColor);
            float inset = strokeWidthPx / 2f;
            RectF strokeBounds = new RectF(
                bounds.left + inset,
                bounds.top + inset,
                bounds.right - inset,
                bounds.bottom - inset
            );
            canvas.drawRoundRect(strokeBounds, radiusPx, radiusPx, strokePaint);
        }

        synchronized (CACHE_LOCK) {
            BITMAP_CACHE.put(cacheKey, bitmap);
        }
        return bitmap;
    }

    private static int dpToPx(Context context, float dp) {
        float density =
            context == null ? 1f : context.getResources().getDisplayMetrics().density;
        return Math.max(1, Math.round(dp * density));
    }
}
