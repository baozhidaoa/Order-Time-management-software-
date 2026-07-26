package com.controlerapp;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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
import com.controlerapp.widgets.ControlerWidgetDataStore;
import com.controlerapp.widgets.ControlerWidgetRenderer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.Collections;

/** Android uses one offline WebView with a persistent navigation document. */
public class MainActivity extends Activity {
    private static final String WEB_ROOT = "file:///android_asset/controler-web/";
    private static final String SHELL_URL = WEB_ROOT + "android-shell.html";
    private static final String LAUNCH_THEME_PREFS = "controler_launch_theme_preferences";
    private static final String KEY_LAUNCH_THEME_STATE = "theme_state";

    private WebView webView;
    private FrameLayout hostView;
    private OfflineWebViewBridge bridge;
    private boolean backDispatchPending;
    private boolean splashDismissed;
    private int currentThemeColor;
    private JSONObject currentNavigationRequest;
    private String currentPageUrl = "";
    private String pendingPageUrl = "";
    private boolean pendingHistoryBack;
    private final ArrayDeque<String> pageHistory = new ArrayDeque<>();
    private long latestNavigationRequestedAt;
    private long navigationAcceptedElapsedMs;

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
        ControlerStartupTrace.mark("main_activity_created", "host=android-webview");
        ControlerWidgetLaunchStore.captureLaunchIntent(this, getIntent());

        bridge = new OfflineWebViewBridge(this);
        ((MainApplication) getApplication()).registerForegroundActivity(this);
        webView = createWebView();
        bridge.attach(webView);
        hostView = new FrameLayout(this);
        hostView.setBackgroundColor(currentThemeColor);
        hostView.addView(webView);
        setContentView(hostView);
        currentPageUrl = resolveInitialPageUrl();
        webView.loadUrl(resolveShellUrl(currentPageUrl));
    }

    private WebView createWebView() {
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
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
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
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
                if (isShellDocumentUri(Uri.parse(url))) {
                    bridge.onNavigationStarted();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) {
                Uri uri = request == null ? null : request.getUrl();
                if (uri == null) return false;
                if (isAllowedAssetUri(uri)) {
                    return false;
                }
                String scheme = uri.getScheme();
                if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                    Log.w("ControlerWebView", "Blocked external URL: " + uri);
                    return true;
                }
                Intent external = new Intent(Intent.ACTION_VIEW, uri);
                try {
                    startActivity(external);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                WebView target,
                WebResourceRequest request
            ) {
                Uri uri = request == null ? null : request.getUrl();
                if (isAllowedAssetUri(uri)) {
                    return super.shouldInterceptRequest(target, request);
                }
                return new WebResourceResponse(
                    "text/plain",
                    "UTF-8",
                    403,
                    "Blocked",
                    Collections.emptyMap(),
                    new ByteArrayInputStream(new byte[0])
                );
            }

            @Override
            public void onPageCommitVisible(WebView target, String url) {
                super.onPageCommitVisible(target, url);
                logNavigationStage("html-commit", currentNavigationRequest, url);
            }

            @Override
            public void onPageFinished(WebView target, String url) {
                super.onPageFinished(target, url);
                ControlerStartupTrace.mark("webview_page_finished", "url=" + url);
            }
        });
        return view;
    }

    void onWebPageReady(JSONObject payload) {
        String expectedRequestId = currentNavigationRequest == null
            ? ""
            : currentNavigationRequest.optString("requestId", "");
        String readyRequestId = payload == null ? "" : payload.optString("requestId", "");
        if (currentNavigationRequest == null && !readyRequestId.isEmpty()) {
            return;
        }
        if (!expectedRequestId.isEmpty() && !expectedRequestId.equals(readyRequestId)) {
            return;
        }
        if (!expectedRequestId.isEmpty()) {
            commitShellNavigation(currentNavigationRequest);
            if (pendingHistoryBack) {
                if (!pageHistory.isEmpty() && pageHistory.peekLast().equals(pendingPageUrl)) {
                    pageHistory.removeLast();
                }
            } else if (!currentPageUrl.isEmpty() && !currentPageUrl.equals(pendingPageUrl)) {
                pageHistory.addLast(currentPageUrl);
            }
            currentPageUrl = pendingPageUrl;
        }
        logNavigationStage(
            "page-ready",
            currentNavigationRequest,
            payload == null ? "" : payload.optString("href", "")
        );
        splashDismissed = true;
        currentNavigationRequest = null;
        pendingPageUrl = "";
        pendingHistoryBack = false;
        navigationAcceptedElapsedMs = 0L;
    }

    void handleWebNavigation(JSONObject request) {
        if (request == null || bridge == null || webView == null) return;
        String requestId = request.optString("requestId", "").trim();
        String page = request.optString("page", "").trim();
        String href = request.optString("href", "").trim();
        long requestedAt = Math.max(0L, request.optLong("requestedAt", 0L));
        if (
            requestId.isEmpty()
                || !page.matches("index|stats|plan|todo|diary|settings")
                || href.isEmpty()
        ) {
            bridge.emitNavigationAck(request, "rejected", "invalid-request");
            return;
        }
        final Uri targetUri;
        try {
            targetUri = Uri.parse(href.startsWith(WEB_ROOT) ? href : WEB_ROOT + href);
        } catch (Exception error) {
            bridge.emitNavigationAck(request, "rejected", "invalid-url");
            return;
        }
        String targetUrl = targetUri.toString();
        String targetPath = targetUri.getPath();
        if (
            !isAllowedAssetUri(targetUri)
                || targetPath == null
                || !targetPath.endsWith("/" + page + ".html")
        ) {
            bridge.emitNavigationAck(request, "rejected", "unsupported-target");
            return;
        }
        if (requestedAt > 0L && requestedAt < latestNavigationRequestedAt) {
            bridge.emitNavigationAck(request, "dropped-stale", "latest-wins");
            return;
        }
        latestNavigationRequestedAt = Math.max(latestNavigationRequestedAt, requestedAt);
        currentNavigationRequest = cloneJsonObject(request);
        pendingPageUrl = targetUrl;
        pendingHistoryBack = false;
        navigationAcceptedElapsedMs = SystemClock.elapsedRealtime();
        bridge.emitNavigationAck(request, "accepted-now", "shell-content-load");
        logNavigationStage("host-accepted", request, href);
        webView.post(() -> startShellNavigation(targetUri, requestId));
    }

    private void startShellNavigation(Uri targetUri, String requestId) {
        if (webView == null || bridge == null || currentNavigationRequest == null) return;
        int navigationGeneration = bridge.onNavigationStarted();
        JSONObject detail = new JSONObject();
        try {
            detail.put("href", withNavigationRequestId(targetUri, requestId));
            detail.put("page", currentNavigationRequest.optString("page", ""));
            detail.put("requestId", requestId);
            detail.put("navigationGeneration", navigationGeneration);
        } catch (Exception ignored) {
            cancelPendingNavigation("invalid-shell-detail");
            return;
        }
        String script =
            "window.ControlerAndroidShell&&window.ControlerAndroidShell.beginNavigation("
                + detail.toString()
                + ");";
        webView.evaluateJavascript(script, result -> {
            if (!"true".equals(result)) {
                cancelPendingNavigation("shell-rejected");
            }
        });
    }

    private void commitShellNavigation(JSONObject request) {
        if (webView == null || request == null) return;
        JSONObject detail = new JSONObject();
        try {
            detail.put("requestId", request.optString("requestId", ""));
            detail.put("page", request.optString("page", ""));
        } catch (Exception ignored) {
            return;
        }
        webView.evaluateJavascript(
            "window.ControlerAndroidShell&&window.ControlerAndroidShell.commitNavigation("
                + detail.toString()
                + ");",
            null
        );
    }

    private void cancelPendingNavigation(String reason) {
        if (webView != null && currentNavigationRequest != null) {
            String requestId = currentNavigationRequest.optString("requestId", "");
            webView.evaluateJavascript(
                "window.ControlerAndroidShell&&window.ControlerAndroidShell.cancelNavigation({requestId:"
                    + JSONObject.quote(requestId)
                    + "});",
                null
            );
            Log.w("ControlerWebView", "Navigation cancelled: " + reason);
            webView.loadUrl(resolveShellUrl(currentPageUrl));
        }
        currentNavigationRequest = null;
        pendingPageUrl = "";
        pendingHistoryBack = false;
        navigationAcceptedElapsedMs = 0L;
    }

    private static String withNavigationRequestId(Uri uri, String requestId) {
        Uri.Builder builder = uri.buildUpon().clearQuery();
        try {
            for (String key : uri.getQueryParameterNames()) {
                if ("controlerNavRequestId".equals(key)) continue;
                for (String value : uri.getQueryParameters(key)) {
                    builder.appendQueryParameter(key, value);
                }
            }
        } catch (Exception ignored) {}
        builder.appendQueryParameter("controlerNavRequestId", requestId);
        return builder.build().toString();
    }

    private static JSONObject cloneJsonObject(JSONObject source) {
        try {
            return source == null ? new JSONObject() : new JSONObject(source.toString());
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private void logNavigationStage(String stage, JSONObject request, String href) {
        JSONObject metric = new JSONObject();
        try {
            metric.put("stage", stage == null ? "" : stage);
            metric.put("requestId", request == null ? "" : request.optString("requestId", ""));
            metric.put("page", request == null ? "" : request.optString("page", ""));
            metric.put("href", href == null ? "" : href);
            long requestedAt = request == null ? 0L : Math.max(0L, request.optLong("requestedAt", 0L));
            metric.put(
                "clickToStageMs",
                requestedAt <= 0L ? 0L : Math.max(0L, System.currentTimeMillis() - requestedAt)
            );
            metric.put(
                "hostElapsedMs",
                navigationAcceptedElapsedMs <= 0L
                    ? 0L
                    : Math.max(0L, SystemClock.elapsedRealtime() - navigationAcceptedElapsedMs)
            );
            metric.put("webViewCount", webView == null ? 0 : 1);
        } catch (Exception ignored) {
            return;
        }
        Log.i("ControlerPerf", metric.toString());
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
                "if(String(location.href||'').indexOf('"
                    + WEB_ROOT
                    + "')===0){"
                    + output.toString("UTF-8")
                    + "}",
                Collections.singleton("file://")
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
        if (hasWidgetLaunch && bridge != null) {
            JSONObject payload = new JSONObject();
            try {
                payload.put("name", "widgets.launch-action-available");
                payload.put("source", "android-widget");
            } catch (Exception ignored) {
                return;
            }
            bridge.emitBridgeEvent(payload);
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
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (bridge != null) {
            bridge.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
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
            "!!(window.ControlerAndroidShell&&window.ControlerAndroidShell.requestBack());",
            requested -> {
                if ("true".equals(requested)) return;
                backDispatchPending = false;
                finishBackNavigation();
            }
        );
    }

    void onShellBackResult(boolean handled) {
        if (!backDispatchPending) return;
        backDispatchPending = false;
        if (handled) return;
        if (currentNavigationRequest != null) {
            return;
        }
        if (pageHistory.isEmpty()) {
            finishBackNavigation();
            return;
        }
        String targetUrl = pageHistory.peekLast();
        Uri targetUri = Uri.parse(targetUrl);
        String targetPage = pageKeyFromUri(targetUri);
        if (targetPage.isEmpty()) {
            finishBackNavigation();
            return;
        }
        String requestId = "back_" + System.currentTimeMillis();
        JSONObject request = new JSONObject();
        try {
            request.put("requestId", requestId);
            request.put("page", targetPage);
            request.put("href", targetUrl);
            request.put("requestedAt", System.currentTimeMillis());
            request.put("sourcePage", pageKeyFromUri(Uri.parse(currentPageUrl)));
        } catch (Exception ignored) {
            finishBackNavigation();
            return;
        }
        currentNavigationRequest = request;
        pendingPageUrl = targetUrl;
        pendingHistoryBack = true;
        navigationAcceptedElapsedMs = SystemClock.elapsedRealtime();
        logNavigationStage("host-back", request, targetUrl);
        startShellNavigation(targetUri, requestId);
    }

    private void finishBackNavigation() {
        super.onBackPressed();
    }

    private String resolveInitialPageUrl() {
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

    private static String resolveShellUrl(String initialPageUrl) {
        return Uri.parse(SHELL_URL)
            .buildUpon()
            .appendQueryParameter("initialHref", initialPageUrl)
            .build()
            .toString();
    }

    private static void appendQuery(Uri.Builder builder, String key, String value) {
        String normalized = value == null ? "" : value.trim();
        if (!normalized.isEmpty()) builder.appendQueryParameter(key, normalized);
    }

    static boolean isAllowedAssetUri(Uri uri) {
        if (uri == null || !"file".equalsIgnoreCase(uri.getScheme())) return false;
        String authority = uri.getAuthority();
        if (authority != null && !authority.isEmpty()) return false;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/android_asset/controler-web/")) return false;
        String decodedPath = Uri.decode(path);
        return decodedPath.startsWith("/android_asset/controler-web/")
            && !decodedPath.contains("/../")
            && !decodedPath.endsWith("/..");
    }

    private static boolean isShellDocumentUri(Uri uri) {
        if (!isAllowedAssetUri(uri)) return false;
        String path = uri.getPath();
        return path != null && path.endsWith("/android-shell.html");
    }

    private static String pageKeyFromUri(Uri uri) {
        if (!isAllowedAssetUri(uri)) return "";
        String path = uri.getPath();
        if (path == null) return "";
        String fileName = path.substring(path.lastIndexOf('/') + 1);
        String page = fileName.replaceFirst("\\.html$", "");
        return page.matches("index|stats|plan|todo|diary|settings") ? page : "";
    }

    void applyShellNavigationState(JSONObject state) {
        if (webView == null || state == null) return;
        JSONObject detail = new JSONObject();
        try {
            detail.put(
                "hiddenPages",
                state.optJSONArray("hiddenPages") == null
                    ? new JSONArray()
                    : state.optJSONArray("hiddenPages")
            );
            detail.put(
                "order",
                state.optJSONArray("order") == null
                    ? new JSONArray()
                    : state.optJSONArray("order")
            );
            detail.put("reason", state.optString("reason", ""));
            detail.put("sourcePage", state.optString("sourcePage", ""));
        } catch (Exception ignored) {
            return;
        }
        webView.evaluateJavascript(
            "window.ControlerAndroidShell&&window.ControlerAndroidShell.applyNavigationState("
                + detail.toString()
                + ");",
            null
        );
    }

    void applyWebThemeState(JSONObject themeState) {
        int color = resolveThemeBackgroundColor(themeState);
        currentThemeColor = color;
        applyWindowChrome(color);
        if (hostView != null) hostView.setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
        if (webView != null) {
            webView.evaluateJavascript(
                "window.ControlerAndroidShell&&window.ControlerAndroidShell.applyThemeState("
                    + (themeState == null ? "{}" : themeState.toString())
                    + ");",
                null
            );
        }
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
