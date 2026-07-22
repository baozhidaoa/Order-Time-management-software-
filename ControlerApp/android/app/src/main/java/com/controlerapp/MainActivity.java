package com.controlerapp;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.graphics.ColorUtils;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.controlerapp.widgets.ControlerWidgetLaunchStore;
import com.controlerapp.widgets.ControlerWidgetRenderer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Collections;

/** Android uses one offline WebView. React Native remains an iOS-only shell. */
public class MainActivity extends Activity {
    private static final String WEB_ROOT = "file:///android_asset/controler-web/";
    private static final String LAUNCH_THEME_PREFS = "controler_launch_theme_preferences";
    private static final String KEY_LAUNCH_THEME_STATE = "theme_state";

    private WebView webView;
    private FrameLayout hostView;
    private ImageView navigationSurface;
    private Bitmap navigationSurfaceBitmap;
    private OfflineWebViewBridge bridge;
    private boolean backDispatchPending;
    private boolean splashDismissed;
    private boolean hasCommittedPage;
    private int currentThemeColor;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        String launchTheme = readLaunchThemeState();
        currentThemeColor = resolveLaunchBackgroundColor(launchTheme);
        setTheme(resolveLaunchThemeStyle(launchTheme));
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        splashScreen.setKeepOnScreenCondition(() -> !splashDismissed);

        applyWindowChrome(currentThemeColor);
        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
        );

        ControlerStartupTrace.captureLaunchIntent(getIntent());
        ControlerStartupTrace.mark("main_activity_created", "host=offline-webview");
        ControlerWidgetLaunchStore.captureLaunchIntent(this, getIntent());

        bridge = new OfflineWebViewBridge(this);
        ((MainApplication) getApplication()).registerForegroundActivity(this);
        webView = createWebView();
        bridge.attach(webView);
        hostView = new FrameLayout(this);
        hostView.setBackgroundColor(currentThemeColor);
        hostView.addView(webView);
        navigationSurface = new ImageView(this);
        navigationSurface.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        navigationSurface.setScaleType(ImageView.ScaleType.FIT_XY);
        navigationSurface.setBackgroundColor(currentThemeColor);
        navigationSurface.setVisibility(View.GONE);
        hostView.addView(navigationSurface);
        setContentView(hostView);
        webView.loadUrl(resolveStartUrl());
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        view.setBackgroundColor(currentThemeColor);
        view.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        view.addJavascriptInterface(bridge, "ReactNativeWebView");

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        installDocumentStartTheme(view);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView target, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(target, url, favicon);
                showNavigationSurface(target);
                bridge.onNavigationStarted();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) {
                Uri uri = request == null ? null : request.getUrl();
                if (uri == null) return false;
                String url = uri.toString();
                if (url.startsWith("file:///android_asset/controler-web/")) {
                    showNavigationSurface(target);
                    return false;
                }
                Intent external = new Intent(Intent.ACTION_VIEW, uri);
                try {
                    startActivity(external);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView target, String url) {
                super.onPageCommitVisible(target, url);
                hasCommittedPage = true;
            }

            @Override
            public void onPageFinished(WebView target, String url) {
                super.onPageFinished(target, url);
                target.clearHistory();
                ControlerStartupTrace.mark("webview_page_finished", "url=" + url);
                splashDismissed = true;
            }
        });
        return view;
    }

    void onWebPageReady() {
        hasCommittedPage = true;
        hideNavigationSurface();
    }

    private void showNavigationSurface(WebView target) {
        if (
            !hasCommittedPage
                || target == null
                || target != webView
                || navigationSurface == null
                || navigationSurface.getVisibility() == View.VISIBLE
        ) {
            return;
        }
        int width = target.getWidth();
        int height = target.getHeight();
        if (width <= 0 || height <= 0) return;
        Bitmap snapshot;
        try {
            snapshot = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            target.draw(new Canvas(snapshot));
        } catch (RuntimeException ignored) {
            return;
        }
        navigationSurfaceBitmap = snapshot;
        navigationSurface.setImageBitmap(snapshot);
        navigationSurface.setVisibility(View.VISIBLE);
    }

    private void hideNavigationSurface() {
        if (navigationSurface == null) return;
        navigationSurface.setVisibility(View.GONE);
        navigationSurface.setImageDrawable(null);
        if (navigationSurfaceBitmap != null && !navigationSurfaceBitmap.isRecycled()) {
            navigationSurfaceBitmap.recycle();
        }
        navigationSurfaceBitmap = null;
    }

    private void installDocumentStartTheme(WebView view) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try (
            InputStream input = getAssets().open("controler-web/desktop-theme-preload.js");
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            WebViewCompat.addDocumentStartJavaScript(
                view,
                output.toString("UTF-8"),
                Collections.singleton("*")
            );
        } catch (Exception error) {
            throw new IllegalStateException("Unable to install the theme bootstrap script", error);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        boolean hasWidgetLaunch = ControlerWidgetLaunchStore.hasLaunchAction(intent);
        ControlerStartupTrace.captureLaunchIntent(intent);
        ControlerWidgetLaunchStore.captureLaunchIntent(this, intent);
        if (hasWidgetLaunch && webView != null) {
            webView.loadUrl(resolveStartUrl());
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (bridge != null) bridge.onResume(this);
        if (webView != null) webView.onResume();
        ControlerWidgetRenderer.scheduleDateSensitiveRefreshIfNeeded(this, "activity-resume");
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        if (bridge != null) bridge.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ((MainApplication) getApplication()).unregisterForegroundActivity(this);
        if (bridge != null) bridge.onDestroy();
        if (webView != null) {
            webView.removeJavascriptInterface("ReactNativeWebView");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        hideNavigationSurface();
        navigationSurface = null;
        super.onDestroy();
    }

    void emitStorageChanged(JSONArray changedSections, JSONObject changedPeriods, String source) {
        if (bridge == null) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("name", "storage.changed");
            payload.put("changedSections", changedSections == null ? new JSONArray() : changedSections);
            payload.put("changedPeriods", changedPeriods == null ? new JSONObject() : changedPeriods);
            payload.put("source", source == null ? "android-widget" : source);
        } catch (Exception ignored) {
            return;
        }
        bridge.emitBridgeEvent(payload);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (bridge != null) bridge.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        if (backDispatchPending) return;

        backDispatchPending = true;
        webView.evaluateJavascript(
            "(function(){try{var r=window.ControlerUI&&window.ControlerUI.handleNativeBack?window.ControlerUI.handleNativeBack({source:'android-back'}):null;return !!(r&&r.handled);}catch(e){return false;}})();",
            handled -> {
                backDispatchPending = false;
                if ("true".equals(handled)) return;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                finishBackNavigation();
            }
        );
    }

    private void finishBackNavigation() {
        super.onBackPressed();
    }

    private String resolveStartUrl() {
        String page = "index";
        JSONObject launchAction = null;
        try {
            launchAction = ControlerWidgetLaunchStore.consumeLaunchAction(this);
            String requestedPage = launchAction.optString("page", "");
            String action = launchAction.optString("action", "");
            if ("show-todos".equals(action) || "show-checkins".equals(action)) {
                page = "todo";
            } else if (requestedPage.matches("index|stats|plan|todo|diary|settings")) {
                page = requestedPage;
            }
        } catch (Exception ignored) {}

        Uri.Builder builder = Uri.parse(WEB_ROOT + page + ".html").buildUpon();
        if (launchAction != null) {
            appendQuery(builder, "widgetAction", launchAction.optString("action", ""));
            appendQuery(builder, "widgetKind", launchAction.optString("widgetKind", ""));
            appendQuery(builder, "widgetTargetId", launchAction.optString("targetId", ""));
            appendQuery(builder, "widgetLaunchId", launchAction.optString("launchId", ""));
        }
        return builder.build().toString();
    }

    private static void appendQuery(Uri.Builder builder, String key, String value) {
        String normalized = value == null ? "" : value.trim();
        if (!normalized.isEmpty()) builder.appendQueryParameter(key, normalized);
    }

    void applyWebThemeState(JSONObject themeState) {
        int color = resolveThemeBackgroundColor(themeState);
        currentThemeColor = color;
        applyWindowChrome(color);
        if (hostView != null) hostView.setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
        if (navigationSurface != null) navigationSurface.setBackgroundColor(color);
    }

    private void applyWindowChrome(int color) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean light = ColorUtils.calculateLuminance(color) > 0.55d;
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
    }

    private String readLaunchThemeState() {
        SharedPreferences preferences = getSharedPreferences(LAUNCH_THEME_PREFS, Context.MODE_PRIVATE);
        String value = preferences.getString(KEY_LAUNCH_THEME_STATE, "");
        return value == null ? "" : value.trim();
    }

    private static String selectedTheme(String stateJson) {
        try {
            return new JSONObject(stateJson).optString("selectedTheme", "default");
        } catch (Exception ignored) {
            return "default";
        }
    }

    private int resolveLaunchThemeStyle(String stateJson) {
        switch (selectedTheme(stateJson)) {
            case "blue-ocean": return R.style.AppThemeLaunchBlueOcean;
            case "sunset-orange": return R.style.AppThemeLaunchSunsetOrange;
            case "minimal-gray": return R.style.AppThemeLaunchMinimalGray;
            case "obsidian-mono": return R.style.AppThemeLaunchObsidianMono;
            case "ivory-light": return R.style.AppThemeLaunchIvoryLight;
            case "graphite-mist": return R.style.AppThemeLaunchGraphiteMist;
            case "aurora-mist": return R.style.AppThemeLaunchAuroraMist;
            case "amethyst-haze": return R.style.AppThemeLaunchAmethystHaze;
            case "velvet-bordeaux": return R.style.AppThemeLaunchVelvetBordeaux;
            case "champagne-sandstone": return R.style.AppThemeLaunchChampagneSandstone;
            case "porcelain-mist": return R.style.AppThemeLaunchPorcelainMist;
            case "sage-cashmere": return R.style.AppThemeLaunchSageCashmere;
            case "oyster-linen": return R.style.AppThemeLaunchOysterLinen;
            case "midnight-indigo": return R.style.AppThemeLaunchMidnightIndigo;
            default: return R.style.AppThemeLaunchDefault;
        }
    }

    private int resolveLaunchBackgroundColor(String stateJson) {
        try {
            return resolveThemeBackgroundColor(new JSONObject(stateJson));
        } catch (Exception ignored) {
            return resolveThemeBackgroundColor("default");
        }
    }

    private int resolveThemeBackgroundColor(JSONObject themeState) {
        JSONObject state = themeState == null ? new JSONObject() : themeState;
        String themeId = state.optString("selectedTheme", "default").trim();
        JSONArray customThemes = state.optJSONArray("customThemes");
        if (customThemes != null) {
            for (int index = 0; index < customThemes.length(); index += 1) {
                JSONObject theme = customThemes.optJSONObject(index);
                if (theme == null || !themeId.equals(theme.optString("id", "").trim())) continue;
                Integer color = readThemePrimaryColor(theme);
                if (color != null) return color;
            }
        }
        JSONObject overrides = state.optJSONObject("builtInThemeOverrides");
        Integer overrideColor = readThemePrimaryColor(
            overrides == null ? null : overrides.optJSONObject(themeId)
        );
        return overrideColor == null ? resolveThemeBackgroundColor(themeId) : overrideColor;
    }

    private Integer readThemePrimaryColor(JSONObject theme) {
        if (theme == null) return null;
        JSONObject colors = theme.optJSONObject("colors");
        String value = colors == null ? "" : colors.optString("primary", "").trim();
        if (value.isEmpty()) value = theme.optString("primary", "").trim();
        if (value.isEmpty()) return null;
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private int resolveThemeBackgroundColor(String themeId) {
        switch (themeId == null ? "default" : themeId) {
            case "blue-ocean": return Color.parseColor("#12263F");
            case "sunset-orange": return Color.parseColor("#4B261B");
            case "minimal-gray": return Color.parseColor("#1C2734");
            case "obsidian-mono": return Color.parseColor("#0D0F12");
            case "ivory-light": return Color.parseColor("#ECEFF3");
            case "graphite-mist": return Color.parseColor("#2A2D32");
            case "aurora-mist": return Color.parseColor("#362226");
            case "amethyst-haze": return Color.parseColor("#141826");
            case "velvet-bordeaux": return Color.parseColor("#2F141D");
            case "champagne-sandstone": return Color.parseColor("#F1EBE2");
            case "porcelain-mist": return Color.parseColor("#E8EFF7");
            case "sage-cashmere": return Color.parseColor("#EDF1EC");
            case "oyster-linen": return Color.parseColor("#F1EEF6");
            case "midnight-indigo": return Color.parseColor("#111722");
            default: return Color.parseColor("#183524");
        }
    }
}
