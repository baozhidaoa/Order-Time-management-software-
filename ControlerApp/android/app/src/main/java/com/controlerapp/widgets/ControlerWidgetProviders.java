package com.controlerapp.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

public final class ControlerWidgetProviders {
    private ControlerWidgetProviders() {}

    public abstract static class BaseWidgetProvider extends AppWidgetProvider {
        protected abstract String getKind();

        @Override
        public void onReceive(Context context, Intent intent) {
            if (ControlerWidgetActionHandler.handleBroadcast(context, intent)) {
                return;
            }
            super.onReceive(context, intent);
        }

        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            super.onUpdate(context, appWidgetManager, appWidgetIds);
            ControlerWidgetRenderer.updateWidgets(context, getKind(), appWidgetIds);
        }

        @Override
        public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager appWidgetManager,
            int appWidgetId,
            Bundle newOptions
        ) {
            super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
            ControlerWidgetRenderer.updateWidgets(context, getKind(), new int[] { appWidgetId });
        }

        @Override
        public void onDeleted(Context context, int[] appWidgetIds) {
            super.onDeleted(context, appWidgetIds);
            ControlerWidgetRenderer.clearRenderState(appWidgetIds);
        }
    }

    public static class StartTimerWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.START_TIMER; }
    }

    public static class WriteDiaryWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.WRITE_DIARY; }
    }

    public static class WeekGridWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.WEEK_GRID; }
    }

    public static class DayPieWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.DAY_PIE; }
    }

    public static class TodosWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.TODOS; }
    }

    public static class CheckinsWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.CHECKINS; }
    }

    public static class WeekViewWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.WEEK_VIEW; }
    }

    public static class YearViewWidgetProvider extends BaseWidgetProvider {
        @Override
        protected String getKind() { return ControlerWidgetKinds.YEAR_VIEW; }
    }
}
