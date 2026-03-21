package com.controlerapp;

import android.app.Application;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;

import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.core.view.WindowCompat;

public class MainActivity extends ReactActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    ControlerStartupTrace.captureLaunchIntent(getIntent());
    ControlerStartupTrace.mark("main_activity_created");
    ControlerWidgetLaunchStore.captureLaunchIntent(this, getIntent());
    if (ControlerWidgetLaunchStore.hasLaunchAction(getIntent())) {
      Application application = getApplication();
      if (application instanceof MainApplication) {
        ((MainApplication) application).maybePrewarmReactContext("widget-launch");
      }
    }
    emitWidgetLaunchActionIfPossible(getIntent());
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    ControlerStartupTrace.captureLaunchIntent(intent);
    ControlerStartupTrace.mark("main_activity_created", "mode=on_new_intent");
    ControlerWidgetLaunchStore.captureLaunchIntent(this, intent);
    if (ControlerWidgetLaunchStore.hasLaunchAction(intent)) {
      Application application = getApplication();
      if (application instanceof MainApplication) {
        ((MainApplication) application).maybePrewarmReactContext("widget-launch");
      }
    }
    emitWidgetLaunchActionIfPossible(intent);
  }

  private void emitWidgetLaunchActionIfPossible(Intent intent) {
    if (!ControlerWidgetLaunchStore.hasLaunchAction(intent)) {
      return;
    }

    Application application = getApplication();
    if (!(application instanceof MainApplication)) {
      return;
    }

    ReactContext reactContext =
        ((MainApplication) application)
            .getReactNativeHost()
            .getReactInstanceManager()
            .getCurrentReactContext();
    if (reactContext == null || !reactContext.hasActiveCatalystInstance()) {
      return;
    }

    WritableNativeMap payload = new WritableNativeMap();
    payload.putString(
        "page",
        trimLaunchValue(intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_PAGE)));
    payload.putString(
        "action",
        trimLaunchValue(intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_ACTION)));
    payload.putString(
        "widgetKind",
        trimLaunchValue(intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_KIND)));
    payload.putString(
        "targetId",
        trimLaunchValue(intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_TARGET_ID)));
    payload.putString(
        "launchId",
        trimLaunchValue(intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_LAUNCH_ID)));
    payload.putDouble("createdAt", (double) readLaunchCreatedAt(intent));
    payload.putString("source", "android-widget");
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("widgets.launchActionReceived", payload);
  }

  private String trimLaunchValue(String value) {
    return value == null ? "" : value.trim();
  }

  private long readLaunchCreatedAt(Intent intent) {
    if (intent == null) {
      return 0L;
    }
    try {
      long createdAt = intent.getLongExtra(ControlerWidgetLaunchStore.EXTRA_CREATED_AT, 0L);
      if (createdAt > 0L) {
        return createdAt;
      }
      String rawValue = intent.getStringExtra(ControlerWidgetLaunchStore.EXTRA_CREATED_AT);
      if (rawValue != null && rawValue.trim().length() > 0) {
        return Long.parseLong(rawValue.trim());
      }
    } catch (Exception ignored) {
      return 0L;
    }
    return 0L;
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "ControlerApp";
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. Here we use a util class {@link
   * DefaultReactActivityDelegate} which allows you to easily enable Fabric and Concurrent React
   * (aka React 18) with two boolean flags.
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        // If you opted-in for the New Architecture, we enable the Fabric Renderer.
        DefaultNewArchitectureEntryPoint.getFabricEnabled());
  }
}
