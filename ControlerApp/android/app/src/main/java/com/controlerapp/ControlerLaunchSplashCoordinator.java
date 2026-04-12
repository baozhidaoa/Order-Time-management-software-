package com.controlerapp;

import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;

public final class ControlerLaunchSplashCoordinator {
  private static final long MAX_KEEP_ON_SCREEN_MS = 12_000L;
  private static final AtomicBoolean KEEP_ON_SCREEN = new AtomicBoolean(true);
  private static volatile long launchStartedAt = SystemClock.elapsedRealtime();

  private ControlerLaunchSplashCoordinator() {}

  public static void markStartupPending() {
    KEEP_ON_SCREEN.set(true);
    launchStartedAt = SystemClock.elapsedRealtime();
  }

  public static void markStartupReady() {
    KEEP_ON_SCREEN.set(false);
  }

  public static boolean shouldKeepOnScreen() {
    if (!KEEP_ON_SCREEN.get()) {
      return false;
    }
    if (SystemClock.elapsedRealtime() - launchStartedAt > MAX_KEEP_ON_SCREEN_MS) {
      KEEP_ON_SCREEN.set(false);
      return false;
    }
    return true;
  }
}
