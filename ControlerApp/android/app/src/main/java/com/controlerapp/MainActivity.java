package com.controlerapp;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.controlerapp.widgets.ControlerWidgetDataStore;
import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import com.facebook.react.modules.core.DeviceEventManagerModule;

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
    ControlerLaunchSplashCoordinator.markStartupPending();
    SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
    splashScreen.setKeepOnScreenCondition(
        ControlerLaunchSplashCoordinator::shouldKeepOnScreen);
    splashScreen.setOnExitAnimationListener(
        splashScreenViewProvider -> {
          final View splashView = splashScreenViewProvider.getView();
          splashView.animate().cancel();
          splashView.clearAnimation();
          splashView.setAlpha(1f);
          splashView.setTranslationX(0f);
          splashView.setTranslationY(0f);
          splashView.setScaleX(1f);
          splashView.setScaleY(1f);
          splashView.postOnAnimation(splashScreenViewProvider::remove);
        });
    applyShellWindowChrome();
    super.onCreate(savedInstanceState);
    int launchBackgroundColor =
        resolveLaunchThemeBackgroundColor(pendingLaunchThemeStateJson);
    getWindow().getDecorView().setBackgroundColor(launchBackgroundColor);
    if (findViewById(android.R.id.content) != null) {
      findViewById(android.R.id.content).setBackgroundColor(launchBackgroundColor);
    }
    getWindow()
        .setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
    applyShellWindowChrome();
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
    applyShellWindowChrome();
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

  private void applyShellWindowChrome() {
    if (getWindow() == null) {
      return;
    }
    // Keep Android's bottom home-gesture reserved area outside app content.
    // The app can safely own the visible canvas, while the system continues to
    // own only the real gesture strip instead of our bottom action controls.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
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

  private String readThemePrimaryColor(JSONObject themeObject) {
    if (themeObject == null) {
      return "";
    }
    JSONObject colors = themeObject.optJSONObject("colors");
    if (colors != null) {
      String primary = trimLaunchValue(colors.optString("primary", ""));
      if (!primary.isEmpty()) {
        return primary;
      }
    }
    return trimLaunchValue(themeObject.optString("primary", ""));
  }

  private int clampColorChannel(int value) {
    return Math.max(0, Math.min(255, value));
  }

  private Integer parseLaunchThemeColor(String colorValue) {
    String normalized = trimLaunchValue(colorValue);
    if (normalized.isEmpty()) {
      return null;
    }
    try {
      return Color.parseColor(normalized);
    } catch (IllegalArgumentException ignored) {
      // Fall through to RGB(A) parsing below.
    }
    String lower = normalized.toLowerCase(Locale.US);
    if (!lower.startsWith("rgb(") && !lower.startsWith("rgba(")) {
      return null;
    }
    int openIndex = normalized.indexOf('(');
    int closeIndex = normalized.lastIndexOf(')');
    if (openIndex < 0 || closeIndex <= openIndex) {
      return null;
    }
    String[] parts = normalized.substring(openIndex + 1, closeIndex).split(",");
    if (parts.length < 3) {
      return null;
    }
    try {
      int red = clampColorChannel(Integer.parseInt(parts[0].trim()));
      int green = clampColorChannel(Integer.parseInt(parts[1].trim()));
      int blue = clampColorChannel(Integer.parseInt(parts[2].trim()));
      int alpha = 255;
      if (parts.length >= 4) {
        String alphaText = parts[3].trim();
        if (!alphaText.isEmpty()) {
          double alphaValue = Double.parseDouble(alphaText);
          alpha =
              alphaValue <= 1d
                  ? clampColorChannel((int) Math.round(alphaValue * 255d))
                  : clampColorChannel((int) Math.round(alphaValue));
        }
      }
      return Color.argb(alpha, red, green, blue);
    } catch (Exception ignored) {
      return null;
    }
  }

  private int resolveBuiltInLaunchBackgroundColor(String themeId) {
    switch (themeId) {
      case "blue-ocean":
        return Color.parseColor("#12263F");
      case "sunset-orange":
        return Color.parseColor("#4B261B");
      case "minimal-gray":
        return Color.parseColor("#1C2734");
      case "obsidian-mono":
        return Color.parseColor("#0D0F12");
      case "ivory-light":
        return Color.parseColor("#ECEFF3");
      case "graphite-mist":
        return Color.parseColor("#2A2D32");
      case "aurora-mist":
        return Color.parseColor("#341D28");
      case "amethyst-haze":
        return Color.parseColor("#24192F");
      case "velvet-bordeaux":
        return Color.parseColor("#2F141D");
      case "champagne-sandstone":
        return Color.parseColor("#F1EBE2");
      case "porcelain-mist":
        return Color.parseColor("#E8EFF7");
      case "sage-cashmere":
        return Color.parseColor("#EDF1EC");
      case "oyster-linen":
        return Color.parseColor("#F1EEF6");
      case "midnight-indigo":
        return Color.parseColor("#352211");
      default:
        return Color.parseColor("#183524");
    }
  }

  private int resolveLaunchThemeBackgroundColor(String themeStateJson) {
    String selectedTheme = "default";
    JSONObject selectedOverride = null;
    JSONObject matchedCustomTheme = null;
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
        JSONObject builtInOverrides = parsed.optJSONObject("builtInThemeOverrides");
        if (builtInOverrides != null) {
          selectedOverride = builtInOverrides.optJSONObject(selectedTheme);
        }
        JSONArray customThemes = parsed.optJSONArray("customThemes");
        if (customThemes != null) {
          for (int index = 0; index < customThemes.length(); index += 1) {
            JSONObject item = customThemes.optJSONObject(index);
            if (item == null) {
              continue;
            }
            if (selectedTheme.equals(trimLaunchValue(item.optString("id", "")))) {
              matchedCustomTheme = item;
              break;
            }
          }
        }
      }
    } catch (Exception ignored) {
      selectedTheme = "default";
    }
    Integer customColor = parseLaunchThemeColor(readThemePrimaryColor(matchedCustomTheme));
    if (customColor != null) {
      return customColor;
    }
    Integer overrideColor = parseLaunchThemeColor(readThemePrimaryColor(selectedOverride));
    if (overrideColor != null) {
      return overrideColor;
    }
    return resolveBuiltInLaunchBackgroundColor(selectedTheme);
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
      case "amethyst-haze":
        return R.style.AppThemeLaunchAmethystHaze;
      case "velvet-bordeaux":
        return R.style.AppThemeLaunchVelvetBordeaux;
      case "champagne-sandstone":
        return R.style.AppThemeLaunchChampagneSandstone;
      case "porcelain-mist":
        return R.style.AppThemeLaunchPorcelainMist;
      case "sage-cashmere":
        return R.style.AppThemeLaunchSageCashmere;
      case "oyster-linen":
        return R.style.AppThemeLaunchOysterLinen;
      case "midnight-indigo":
        return R.style.AppThemeLaunchMidnightIndigo;
      default:
        return R.style.AppThemeLaunchDefault;
    }
  }
}
