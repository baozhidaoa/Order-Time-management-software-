package com.controlerapp;

import android.app.Application;
import com.controlerapp.widgets.ControlerWidgetKinds;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactInstanceEventListener;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.react.soloader.OpenSourceMergedSoMapping;
import com.facebook.soloader.SoLoader;
import java.io.IOException;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {
  private final Object reactWarmupLock = new Object();
  private boolean reactWarmupStartLogged = false;
  private boolean reactWarmupCompleteLogged = false;
  private boolean reactWarmupListenerAttached = false;

  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
          packages.add(new ControlerBridgePackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
          return BuildConfig.IS_HERMES_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public ReactHost getReactHost() {
    return DefaultReactHost.getDefaultReactHost(getApplicationContext(), getReactNativeHost());
  }

  @Override
  public void onCreate() {
    super.onCreate();
    ControlerStartupTrace.mark("application_on_create");
    try {
      SoLoader.init(this, OpenSourceMergedSoMapping.INSTANCE);
    } catch (IOException error) {
      throw new RuntimeException("Failed to initialize SoLoader", error);
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      DefaultNewArchitectureEntryPoint.load();
    }
    ControlerNotificationScheduler.rescheduleAll(this);
    if (ControlerWidgetKinds.hasAnyPinnedWidgets(this)) {
      maybePrewarmReactContext("existing-widget");
    }
  }

  public void maybePrewarmReactContext(String reason) {
    final ReactInstanceManager reactInstanceManager =
        getReactNativeHost().getReactInstanceManager();
    if (reactInstanceManager == null) {
      return;
    }

    synchronized (reactWarmupLock) {
      if (reactInstanceManager.getCurrentReactContext() != null) {
        markReactWarmupCompleted("reason=" + normalizeReason(reason) + " mode=already_ready");
        return;
      }

      attachWarmupListenerIfNeeded(reactInstanceManager, reason);

      if (reactInstanceManager.hasStartedCreatingInitialContext()) {
        markReactWarmupStarted("reason=" + normalizeReason(reason) + " mode=already_started");
        return;
      }

      markReactWarmupStarted("reason=" + normalizeReason(reason));
      reactInstanceManager.createReactContextInBackground();
    }
  }

  private void attachWarmupListenerIfNeeded(
      final ReactInstanceManager reactInstanceManager, String reason) {
    if (reactWarmupListenerAttached) {
      return;
    }

    reactWarmupListenerAttached = true;
    final String normalizedReason = normalizeReason(reason);
    final ReactInstanceEventListener listener =
        new ReactInstanceEventListener() {
          @Override
          public void onReactContextInitialized(ReactContext context) {
            synchronized (reactWarmupLock) {
              markReactWarmupCompleted("reason=" + normalizedReason);
              reactWarmupListenerAttached = false;
            }
            reactInstanceManager.removeReactInstanceEventListener(this);
          }
        };
    reactInstanceManager.addReactInstanceEventListener(listener);
  }

  private void markReactWarmupStarted(String details) {
    if (reactWarmupStartLogged) {
      return;
    }
    reactWarmupStartLogged = true;
    ControlerStartupTrace.mark("react_warmup_started", details);
  }

  private void markReactWarmupCompleted(String details) {
    if (reactWarmupCompleteLogged) {
      return;
    }
    reactWarmupCompleteLogged = true;
    ControlerStartupTrace.mark("react_warmup_completed", details);
  }

  private String normalizeReason(String reason) {
    String safeReason = String.valueOf(reason == null ? "" : reason).trim();
    return safeReason.isEmpty() ? "unspecified" : safeReason;
  }
}
