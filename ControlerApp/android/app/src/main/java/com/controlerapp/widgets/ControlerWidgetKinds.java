package com.controlerapp.widgets;

import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class ControlerWidgetKinds {
    public static final String START_TIMER = "start-timer";
    public static final String WRITE_DIARY = "write-diary";
    public static final String WEEK_GRID = "week-grid";
    public static final String DAY_PIE = "day-pie";
    public static final String TODOS = "todos";
    public static final String CHECKINS = "checkins";
    public static final String WEEK_VIEW = "week-view";
    public static final String YEAR_VIEW = "year-view";

    private static final List<String> ALL_KINDS = Collections.unmodifiableList(
        Arrays.asList(
            START_TIMER,
            WRITE_DIARY,
            WEEK_GRID,
            DAY_PIE,
            TODOS,
            CHECKINS,
            WEEK_VIEW,
            YEAR_VIEW
        )
    );

    private ControlerWidgetKinds() {}

    public static List<String> allKinds() {
        return ALL_KINDS;
    }

    public static String normalize(String kind) {
        return kind != null && ALL_KINDS.contains(kind) ? kind : "";
    }

    public static boolean isValid(String kind) {
        return !normalize(kind).isEmpty();
    }

    public static String label(String kind) {
        switch (normalize(kind)) {
            case START_TIMER:
                return "开始计时";
            case WRITE_DIARY:
                return "写日记";
            case WEEK_GRID:
                return "一周表格视图";
            case DAY_PIE:
                return "一天的饼状图";
            case TODOS:
                return "待办事项";
            case CHECKINS:
                return "打卡列表";
            case WEEK_VIEW:
                return "周视图";
            case YEAR_VIEW:
                return "年视图";
            default:
                return "Order 小组件";
        }
    }

    public static String defaultPage(String kind) {
        switch (normalize(kind)) {
            case WRITE_DIARY:
                return "diary";
            case DAY_PIE:
            case WEEK_GRID:
                return "stats";
            case TODOS:
            case CHECKINS:
            case WEEK_VIEW:
            case YEAR_VIEW:
                return "plan";
            case START_TIMER:
            default:
                return "index";
        }
    }

    public static String defaultAction(String kind) {
        switch (normalize(kind)) {
            case START_TIMER:
                return "start-timer";
            case WRITE_DIARY:
                return "new-diary";
            case WEEK_GRID:
                return "show-week-grid";
            case DAY_PIE:
                return "show-day-pie";
            case WEEK_VIEW:
                return "show-week-view";
            case YEAR_VIEW:
                return "show-year-view";
            case TODOS:
                return "show-todos";
            case CHECKINS:
                return "show-checkins";
            default:
                return "";
        }
    }

    public static Class<? extends AppWidgetProvider> providerClassForKind(String kind) {
        switch (normalize(kind)) {
            case START_TIMER:
                return ControlerWidgetProviders.StartTimerWidgetProvider.class;
            case WRITE_DIARY:
                return ControlerWidgetProviders.WriteDiaryWidgetProvider.class;
            case WEEK_GRID:
                return ControlerWidgetProviders.WeekGridWidgetProvider.class;
            case DAY_PIE:
                return ControlerWidgetProviders.DayPieWidgetProvider.class;
            case TODOS:
                return ControlerWidgetProviders.TodosWidgetProvider.class;
            case CHECKINS:
                return ControlerWidgetProviders.CheckinsWidgetProvider.class;
            case WEEK_VIEW:
                return ControlerWidgetProviders.WeekViewWidgetProvider.class;
            case YEAR_VIEW:
                return ControlerWidgetProviders.YearViewWidgetProvider.class;
            default:
                return null;
        }
    }

    public static ComponentName componentNameForKind(Context context, String kind) {
        Class<? extends AppWidgetProvider> providerClass = providerClassForKind(kind);
        return providerClass == null ? null : new ComponentName(context, providerClass);
    }
}
