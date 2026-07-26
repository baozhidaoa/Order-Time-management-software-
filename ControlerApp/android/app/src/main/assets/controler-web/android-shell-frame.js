(() => {
  let isShellFrame = false;
  try {
    isShellFrame =
      new URL(window.location.href).searchParams.get("controlerShellFrame") ===
      "1";
  } catch (_error) {}
  if (!isShellFrame) {
    return;
  }

  document.documentElement.classList.add("controler-android-shell-frame");

  function normalizeShellThemeState(detail = {}) {
    const colors =
      detail?.colors && typeof detail.colors === "object"
        ? { ...detail.colors }
        : null;
    if (!colors) {
      return null;
    }
    return {
      themeId: String(
        detail.themeId || detail.selectedTheme || "obsidian-mono",
      ).trim(),
      colors,
      recordCard:
        detail.recordCard && typeof detail.recordCard === "object"
          ? { ...detail.recordCard }
          : {},
    };
  }

  let shellThemeState = normalizeShellThemeState(
    window.__CONTROLER_DESKTOP_PRELOADED_THEME__?.source === "window-name"
      ? window.__CONTROLER_DESKTOP_PRELOADED_THEME__
      : null,
  );
  window.__CONTROLER_ANDROID_SHELL_THEME_STATE__ = shellThemeState;

  function deliverNativeMessage(message) {
    if (typeof window.__controlerReceiveNativeMessage === "function") {
      window.__controlerReceiveNativeMessage(message);
      return;
    }
    const pending = (window.__CONTROLER_PENDING_NATIVE_MESSAGES__ =
      window.__CONTROLER_PENDING_NATIVE_MESSAGES__ || []);
    pending.push(message);
  }

  function runWhenUiReady(callback, attemptsRemaining = 120) {
    if (window.ControlerUI) {
      callback(window.ControlerUI);
      return;
    }
    if (attemptsRemaining <= 0) {
      return;
    }
    window.setTimeout(() => runWhenUiReady(callback, attemptsRemaining - 1), 16);
  }

  function runWhenThemeReady(callback, attemptsRemaining = 120) {
    if (typeof window.ControlerTheme?.applyThemeState === "function") {
      callback(window.ControlerTheme);
      return;
    }
    if (attemptsRemaining <= 0) {
      return;
    }
    window.setTimeout(
      () => runWhenThemeReady(callback, attemptsRemaining - 1),
      16,
    );
  }

  function applyShellTheme(detail = {}) {
    const nextThemeState = normalizeShellThemeState(detail);
    if (!nextThemeState) {
      return;
    }
    shellThemeState = nextThemeState;
    window.__CONTROLER_ANDROID_SHELL_THEME_STATE__ = shellThemeState;
    runWhenThemeReady((themeRuntime) => {
      themeRuntime.applyThemeState(
        shellThemeState.themeId,
        {
          id: shellThemeState.themeId,
          colors: shellThemeState.colors,
          recordCard: shellThemeState.recordCard,
        },
        {
          source: "android-shell",
          emitNative: false,
          syncLaunchTheme: false,
        },
      );
    });
  }

  function applyShellVisibility(detail = {}) {
    const payload = {
      name: "ui.shell-visibility",
      active: detail.active !== false,
      transitionLoading: detail.transitionLoading === true,
      page: String(detail.page || "").trim(),
      href: window.location.href,
      reason: String(detail.reason || "android-shell").trim(),
    };
    window.dispatchEvent(
      new CustomEvent("controler:native-bridge-event", { detail: payload }),
    );
  }

  function emitBackResult(handled) {
    window.ControlerNativeBridge?.emitEvent?.("ui.shell-back-result", {
      href: window.location.href,
      handled: handled === true,
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const command =
      event.data && typeof event.data === "object" ? event.data : null;
    if (!command) {
      return;
    }
    if (command.type === "controler-native-message") {
      deliverNativeMessage(command.message);
      return;
    }
    if (command.type === "controler-shell-storage-changed") {
      window.dispatchEvent(
        new CustomEvent("controler:native-bridge-event", {
          detail:
            command.detail && typeof command.detail === "object"
              ? command.detail
              : {},
        }),
      );
      return;
    }
    if (command.type === "controler-shell-theme") {
      applyShellTheme(command.detail);
      return;
    }
    if (command.type === "controler-shell-navigate") {
      const page = String(command.page || "").trim();
      runWhenUiReady((ui) => ui.navigateAppPage?.(page));
      return;
    }
    if (command.type === "controler-shell-resume") {
      try {
        window.history.replaceState(
          window.history.state,
          "",
          String(command.href || window.location.href),
        );
      } catch (_error) {}
      window.ControlerNativeBridge?.rebindSession?.(
        command.navigationGeneration,
      );
      applyShellVisibility({
        active: true,
        transitionLoading: true,
        page: command.page,
        reason: "shell-resume",
      });
      return;
    }
    if (command.type === "controler-shell-visibility") {
      applyShellVisibility(command);
      return;
    }
    if (command.type === "controler-shell-back") {
      runWhenUiReady((ui) => {
        try {
          const result = ui.handleNativeBack?.({ source: "android-back" });
          emitBackResult(result?.handled === true);
          return;
        } catch (_error) {}
        emitBackResult(false);
      });
    }
  });
})();
