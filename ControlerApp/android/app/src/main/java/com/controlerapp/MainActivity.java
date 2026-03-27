package com.controlerapp;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import com.controlerapp.widgets.ControlerWidgetDataStore;
import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.core.view.WindowCompat;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends ReactActivity {
  private static final String UI_LANGUAGE_PREFS = "controler_ui_preferences";
  private static final String LAUNCH_THEME_PREFS = "controler_launch_theme_preferences";
  private static final String KEY_UI_LANGUAGE = "language";
  private static final String KEY_LAUNCH_THEME_STATE = "theme_state";
  private static final String DEFAULT_UI_LANGUAGE = "zh-CN";
  private String pendingLaunchThemeStateJson = "";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    pendingLaunchThemeStateJson = resolveLaunchThemeStateJson();
    setTheme(resolveLaunchThemeStyleRes(pendingLaunchThemeStateJson));
    // Keep Android's bottom home-gesture reserved area outside app content.
    // The app can safely own the visible canvas, while the system continues to
    // own only the real gesture strip instead of our bottom action controls.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    super.onCreate(savedInstanceState);
    getWindow()
        .setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
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
        DefaultNewArchitectureEntryPoint.getFabricEnabled()) {
      @Override
      protected @Nullable Bundle getLaunchOptions() {
        return buildInitialProps();
      }
    };
  }

  private Bundle buildInitialProps() {
    Bundle initialProps = new Bundle();
    initialProps.putString("initialUiLanguage", readStoredUiLanguage());
    String initialThemeStateJson =
        pendingLaunchThemeStateJson == null ? "" : pendingLaunchThemeStateJson.trim();
    if (initialThemeStateJson.isEmpty()) {
      initialThemeStateJson = resolveLaunchThemeStateJson();
    }
    ControlerStartupTrace.mark(
        "launch_theme_initial_props",
        describeLaunchThemeStateForTrace(initialThemeStateJson));
    if (initialThemeStateJson != null && !initialThemeStateJson.isEmpty()) {
      initialProps.putString("initialCoreStateJson", initialThemeStateJson);
    }
    return initialProps;
  }

  private String readStoredUiLanguage() {
    SharedPreferences preferences =
        getApplicationContext().getSharedPreferences(UI_LANGUAGE_PREFS, Context.MODE_PRIVATE);
    String rawLanguage = preferences.getString(KEY_UI_LANGUAGE, DEFAULT_UI_LANGUAGE);
    String normalized =
        String.valueOf(rawLanguage == null ? "" : rawLanguage).trim().toLowerCase(Locale.US);
    if ("en".equals(normalized) || "en-us".equals(normalized)) {
      return "en-US";
    }
    return DEFAULT_UI_LANGUAGE;
  }

  private String readStoredLaunchThemeState() {
    SharedPreferences preferences =
        getApplicationContext().getSharedPreferences(LAUNCH_THEME_PREFS, Context.MODE_PRIVATE);
    String rawThemeState = preferences.getString(KEY_LAUNCH_THEME_STATE, "");
    return rawThemeState == null ? "" : rawThemeState.trim();
  }

  private void persistLaunchThemeState(String themeStateJson) {
    if (themeStateJson == null || themeStateJson.trim().isEmpty()) {
      return;
    }
    getApplicationContext()
        .getSharedPreferences(LAUNCH_THEME_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_LAUNCH_THEME_STATE, themeStateJson.trim())
        .apply();
  }

  private String buildLaunchThemeStateFromCoreStorage() {
    try {
      JSONObject coreState = ControlerWidgetDataStore.getStorageCoreState(getApplicationContext());
      if (coreState == null) {
        return "";
      }
      JSONObject normalized = new JSONObject();
      String selectedTheme = String.valueOf(coreState.optString("selectedTheme", "default")).trim();
      normalized.put("selectedTheme", selectedTheme.isEmpty() ? "default" : selectedTheme);
      normalized.put(
          "customThemes",
          coreState.optJSONArray("customThemes") == null
              ? new JSONArray()
              : new JSONArray(coreState.optJSONArray("customThemes").toString()));
      normalized.put(
          "builtInThemeOverrides",
          coreState.optJSONObject("builtInThemeOverrides") == null
              ? new JSONObject()
              : new JSONObject(coreState.optJSONObject("builtInThemeOverrides").toString()));
      return normalized.toString();
    } catch (Exception ignored) {
      return "";
    }
  }

  private String describeLaunchThemeStateForTrace(String themeStateJson) {
    if (themeStateJson == null || themeStateJson.trim().isEmpty()) {
      return "selectedTheme=empty customThemeCount=0 builtInOverrideCount=0";
    }
    try {
      JSONObject parsed = new JSONObject(themeStateJson);
      String selectedTheme = trimLaunchValue(parsed.optString("selectedTheme", "default"));
      JSONArray customThemes = parsed.optJSONArray("customThemes");
      JSONObject builtInOverrides = parsed.optJSONObject("builtInThemeOverrides");
      return "selectedTheme="
          + (selectedTheme.isEmpty() ? "default" : selectedTheme)
          + " customThemeCount="
          + (customThemes == null ? 0 : customThemes.length())
          + " builtInOverrideCount="
          + (builtInOverrides == null ? 0 : builtInOverrides.length());
    } catch (Exception ignored) {
      return "selectedTheme=parse-error customThemeCount=0 builtInOverrideCount=0";
    }
  }

  private String resolveLaunchThemeStateJson() {
    String coreThemeState = buildLaunchThemeStateFromCoreStorage();
    if (!coreThemeState.isEmpty()) {
      persistLaunchThemeState(coreThemeState);
      ControlerStartupTrace.mark(
          "launch_theme_activity_resolved",
          "source=core " + describeLaunchThemeStateForTrace(coreThemeState));
      return coreThemeState;
    }
    String storedThemeState = readStoredLaunchThemeState();
    ControlerStartupTrace.mark(
        "launch_theme_activity_resolved",
        "source=prefs " + describeLaunchThemeStateForTrace(storedThemeState));
    return storedThemeState;
  }

  private int resolveLaunchThemeStyleRes(String themeStateJson) {
    String selectedTheme = "default";
    try {
      JSONObject parsed =
          themeStateJson == null || themeStateJson.trim().isEmpty()
              ? null
              : new JSONObject(themeStateJson);
      if (parsed != null) {
        String parsedTheme = trimLaunchValue(parsed.optString("selectedTheme", "default"));
        if (!parsedTheme.isEmpty()) {
          selectedTheme = parsedTheme;
        }
      }
    } catch (Exception ignored) {
      selectedTheme = "default";
    }
    switch (selectedTheme) {
      case "blue-ocean":
        return R.style.AppThemeLaunchBlueOcean;
      case "sunset-orange":
        return R.style.AppThemeLaunchSunsetOrange;
      case "minimal-gray":
        return R.style.AppThemeLaunchMinimalGray;
      case "obsidian-mono":
        return R.style.AppThemeLaunchObsidianMono;
      case "ivory-light":
        return R.style.AppThemeLaunchIvoryLight;
      case "graphite-mist":
        return R.style.AppThemeLaunchGraphiteMist;
      case "aurora-mist":
        return R.style.AppThemeLaunchAuroraMist;
      case "velvet-bordeaux":
        return R.style.AppThemeLaunchVelvetBordeaux;
      case "champagne-sandstone":
        return R.style.AppThemeLaunchChampagneSandstone;
      case "midnight-indigo":
        return R.style.AppThemeLaunchMidnightIndigo;
      default:
        return R.style.AppThemeLaunchDefault;
    }
  }
}
