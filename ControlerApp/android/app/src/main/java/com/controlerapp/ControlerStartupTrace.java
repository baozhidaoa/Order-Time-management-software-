package com.controlerapp;

import android.content.Intent;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.Log;

public final class ControlerStartupTrace {
  private static final String TAG = "ControlerStartup";
  private static final Object LOCK = new Object();

  private static String launchSource = "app";
  private static String widgetPage = "";
  private static String widgetAction = "";
  private static String widgetKind = "";

  private ControlerStartupTrace() {}

  public static void captureLaunchIntent(Intent intent) {
    if (intent == null) {
      return;
    }

    synchronized (LOCK) {
      final String page = trimToEmpty(intent.getStringExtra("widgetPage"));
      final String action = trimToEmpty(intent.getStringExtra("widgetAction"));
      final String kind = trimToEmpty(intent.getStringExtra("widgetKind"));

      if (!page.isEmpty() || !action.isEmpty() || !kind.isEmpty()) {
        launchSource = "android-widget";
        widgetPage = page;
        widgetAction = action;
        widgetKind = kind;
      }
    }
  }

  public static void mark(String stage) {
    mark(stage, "");
  }

  public static void mark(String stage, String details) {
    final String safeStage = trimToEmpty(stage);
    if (safeStage.isEmpty()) {
      return;
    }

    final long wallTimeMs = System.currentTimeMillis();
    final long elapsedRealtimeMs = SystemClock.elapsedRealtime();
    final StringBuilder builder = new StringBuilder();
    synchronized (LOCK) {
      builder
          .append("stage=")
          .append(safeStage)
          .append(" wallTimeMs=")
          .append(wallTimeMs)
          .append(" elapsedRealtimeMs=")
          .append(elapsedRealtimeMs)
          .append(" launchSource=")
          .append(launchSource);
      if (!widgetPage.isEmpty()) {
        builder.append(" widgetPage=").append(widgetPage);
      }
      if (!widgetAction.isEmpty()) {
        builder.append(" widgetAction=").append(widgetAction);
      }
      if (!widgetKind.isEmpty()) {
        builder.append(" widgetKind=").append(widgetKind);
      }
      final String extraDetails = trimToEmpty(details);
      if (!extraDetails.isEmpty()) {
        builder.append(" ").append(extraDetails);
      }
    }
    Log.i(TAG, builder.toString());
  }

  private static String trimToEmpty(String value) {
    return value == null ? "" : value.trim();
  }
}
