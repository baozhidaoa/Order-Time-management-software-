package com.controlerapp.widgets;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.text.TextUtils;

public class ControlerWidgetPinResultReceiver extends BroadcastReceiver {
    public static final String EXTRA_WIDGET_KIND = "widgetKind";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        String kind = ControlerWidgetKinds.normalize(intent.getStringExtra(EXTRA_WIDGET_KIND));
        if (TextUtils.isEmpty(kind)) {
            return;
        }

        int appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        );
        ControlerWidgetPinStore.recordPinSuccess(
            context,
            kind,
            appWidgetId,
            System.currentTimeMillis()
        );

        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            ControlerWidgetRenderer.updateWidgets(context, kind, new int[] { appWidgetId });
            return;
        }
        ControlerWidgetRenderer.refreshKind(context, kind);
    }
}
