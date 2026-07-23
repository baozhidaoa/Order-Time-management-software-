package com.controlerapp;

import android.app.Application;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Lightweight Android application. No React Native or Hermes runtime is created. */
public class MainApplication extends Application {
    private final ScheduledExecutorService startupExecutor =
        Executors.newSingleThreadScheduledExecutor();
    private volatile WeakReference<MainActivity> foregroundActivity = new WeakReference<>(null);

    @Override
    public void onCreate() {
        super.onCreate();
        ControlerStartupTrace.mark("application_on_create", "host=android-webview");
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        startupExecutor.schedule(() -> {
            ControlerNotificationScheduler.ensureNotificationChannel(this);
            ControlerNotificationScheduler.rescheduleAll(this);
        }, 5, TimeUnit.SECONDS);
    }

    @Override
    public void onTerminate() {
        startupExecutor.shutdownNow();
        super.onTerminate();
    }

    public void registerForegroundActivity(MainActivity activity) {
        foregroundActivity = new WeakReference<>(activity);
    }

    public void unregisterForegroundActivity(MainActivity activity) {
        MainActivity current = foregroundActivity.get();
        if (current == activity) {
            foregroundActivity = new WeakReference<>(null);
        }
    }

    public void emitStorageChanged(JSONArray changedSections, JSONObject changedPeriods, String source) {
        MainActivity activity = foregroundActivity.get();
        if (activity == null) return;
        activity.emitStorageChanged(changedSections, changedPeriods, source);
    }
}
