(() => {
  const navigation = window.ControlerAppNavigation;
  const pageItems = Array.isArray(navigation?.items)
    ? Array.from(navigation.items)
    : [];
  const pageByKey = new Map(pageItems.map((item) => [item.key, item]));
  const pageByHref = new Map(pageItems.map((item) => [item.href, item]));
  const navigationElement = document.getElementById("android-shell-navigation");
  const pageStack = document.getElementById("android-shell-pages");
  const themeColorVariables = Object.freeze({
    primary: "--bg-primary",
    secondary: "--bg-secondary",
    tertiary: "--bg-tertiary",
    quaternary: "--bg-quaternary",
    accent: "--accent-color",
    text: "--text-color",
    mutedText: "--muted-text-color",
    border: "--border-color",
    panel: "--panel-bg",
    panelStrong: "--panel-strong-bg",
    panelBorder: "--panel-border-color",
    navBarBg: "--bottom-nav-bg",
    navBarBorder: "--bottom-nav-border",
    navButtonBg: "--bottom-nav-button-bg",
    navButtonText: "--bottom-nav-button-text",
    navButtonActiveBg: "--bottom-nav-button-active-bg",
    navButtonActiveText: "--bottom-nav-active-text",
  });
  const frames = new Set();
  const frameByPage = new Map();
  const themeWindowNamePrefix = "__CONTROLER_THEME_BOOTSTRAP__:";
  const navigationStateStorageKey =
    "__controler_local__:appNavigationVisibility";
  let activeFrame = null;
  let pendingFrame = null;
  let pendingFrameWasCached = false;
  let activePage = "index";
  let pendingRequestId = "";
  let navigationStateSignature = "";
  let navigationStateInitialized = false;
  let currentThemeState = null;

  function normalizeThemeState(detail = {}) {
    const colors =
      detail?.colors && typeof detail.colors === "object"
        ? { ...detail.colors }
        : null;
    if (!colors) {
      return null;
    }
    return {
      themeId: String(
        detail.selectedTheme || detail.themeId || "obsidian-mono",
      ).trim(),
      colors,
      recordCard:
        detail.recordCard && typeof detail.recordCard === "object"
          ? { ...detail.recordCard }
          : {},
    };
  }

  function buildThemeWindowName(themeState = currentThemeState) {
    return themeState
      ? `${themeWindowNamePrefix}${JSON.stringify(themeState)}`
      : "";
  }

  function sendThemeToFrame(frame, themeState = currentThemeState) {
    if (!(frame instanceof HTMLIFrameElement) || !themeState) {
      return false;
    }
    frame.contentWindow?.postMessage(
      { type: "controler-shell-theme", detail: themeState },
      "*",
    );
    return true;
  }

  function normalizePageHref(rawHref) {
    try {
      const parsed = new URL(String(rawHref || ""), window.location.href);
      const fileName = parsed.pathname.split("/").pop() || "";
      if (!pageByHref.has(fileName)) {
        return null;
      }
      parsed.searchParams.set("controlerShellFrame", "1");
      return {
        href: `${fileName}${parsed.search}${parsed.hash}`,
        page: pageByHref.get(fileName).key,
      };
    } catch (_error) {
      return null;
    }
  }

  function updateCurrentNavigation(page) {
    activePage = pageByKey.has(page) ? page : activePage;
    navigationElement
      ?.querySelectorAll("[data-nav-page]")
      .forEach((button) => {
        const isCurrent = button.dataset.navPage === activePage;
        button.classList.toggle("is-current-page", isCurrent);
        button.toggleAttribute("disabled", isCurrent);
        button.setAttribute("aria-disabled", isCurrent ? "true" : "false");
        if (isCurrent) {
          button.setAttribute("aria-current", "page");
          button.dataset.navCurrent = "true";
        } else {
          button.removeAttribute("aria-current");
          delete button.dataset.navCurrent;
        }
      });
  }

  function createNavigation() {
    if (!navigationElement || !navigation) {
      return;
    }
    const fragment = document.createDocumentFragment();
    pageItems.forEach((item) => {
      const button = document.createElement("button");
      button.className = "app-nav-button";
      button.type = "button";
      button.dataset.navPage = item.key;
      button.appendChild(navigation.createIcon(item, document));
      const label = document.createElement("span");
      label.className = "app-nav-label";
      label.textContent = item.label;
      button.appendChild(label);
      button.addEventListener("click", () => {
        if (
          document.body.classList.contains("controler-shell-navigation-pending") ||
          item.key === activePage ||
          !activeFrame
        ) {
          return;
        }
        activeFrame.contentWindow?.postMessage(
          { type: "controler-shell-navigate", page: item.key },
          "*",
        );
      });
      fragment.appendChild(button);
    });
    navigationElement.replaceChildren(fragment);
  }

  function createPageFrame(pageHref, page, requestId, active) {
    const frame = document.createElement("iframe");
    frame.className = active
      ? "android-shell-page-frame is-active"
      : "android-shell-page-frame is-staging";
    frame.dataset.page = page;
    frame.dataset.requestId = requestId;
    frame.title = pageByKey.get(page)?.label || "Order";
    frame.name = buildThemeWindowName();
    frame.src = pageHref;
    pageStack.appendChild(frame);
    frames.add(frame);
    frameByPage.set(page, frame);
    return frame;
  }

  function discardFrame(frame) {
    if (!(frame instanceof HTMLIFrameElement)) {
      return;
    }
    frames.delete(frame);
    if (frameByPage.get(frame.dataset.page) === frame) {
      frameByPage.delete(frame.dataset.page);
    }
    frame.remove();
  }

  function beginNavigation(detail = {}) {
    const target = normalizePageHref(detail.href);
    const requestId = String(detail.requestId || "").trim();
    if (!target || !requestId || target.page === activePage) {
      return false;
    }
    if (pendingFrame) {
      return false;
    }
    pendingRequestId = requestId;
    pendingFrame = frameByPage.get(target.page) || null;
    pendingFrameWasCached = !!pendingFrame;
    if (pendingFrame) {
      pendingFrame.dataset.requestId = requestId;
      pendingFrame.classList.remove("is-retired", "is-cached");
      pendingFrame.classList.add("is-staging");
      sendThemeToFrame(pendingFrame);
      pendingFrame.contentWindow?.postMessage(
        {
          type: "controler-shell-resume",
          href: target.href,
          page: target.page,
          navigationGeneration: detail.navigationGeneration,
        },
        "*",
      );
    } else {
      pendingFrame = createPageFrame(
        target.href,
        target.page,
        requestId,
        false,
      );
    }
    activeFrame?.contentWindow?.postMessage(
      {
        type: "controler-shell-visibility",
        active: false,
        transitionLoading: false,
        page: activePage,
        reason: "shell-navigation",
      },
      "*",
    );
    document.body.classList.add("controler-shell-navigation-pending");
    return true;
  }

  function commitNavigation(detail = {}) {
    const requestId = String(detail.requestId || "").trim();
    if (!pendingFrame || !requestId || requestId !== pendingRequestId) {
      return false;
    }
    const previousFrame = activeFrame;
    activeFrame = pendingFrame;
    pendingFrame = null;
    pendingFrameWasCached = false;
    pendingRequestId = "";
    activeFrame.classList.remove("is-staging");
    activeFrame.classList.add("is-active");
    previousFrame?.classList.remove("is-active");
    previousFrame?.classList.add("is-cached");
    updateCurrentNavigation(activeFrame.dataset.page || detail.page);
    document.body.classList.remove("controler-shell-navigation-pending");
    activeFrame.contentWindow?.postMessage(
      {
        type: "controler-shell-visibility",
        active: true,
        transitionLoading: false,
        page: activePage,
        reason: "shell-commit",
      },
      "*",
    );
    return true;
  }

  function cancelNavigation(detail = {}) {
    const requestId = String(detail.requestId || "").trim();
    if (!pendingFrame || (requestId && requestId !== pendingRequestId)) {
      return false;
    }
    if (pendingFrameWasCached) {
      pendingFrame.classList.remove("is-staging");
      pendingFrame.classList.add("is-cached");
    } else {
      discardFrame(pendingFrame);
    }
    pendingFrame = null;
    pendingFrameWasCached = false;
    pendingRequestId = "";
    document.body.classList.remove("controler-shell-navigation-pending");
    updateCurrentNavigation(activeFrame?.dataset.page || activePage);
    activeFrame?.contentWindow?.postMessage(
      {
        type: "controler-shell-visibility",
        active: true,
        transitionLoading: false,
        page: activePage,
        reason: "shell-cancel",
      },
      "*",
    );
    return true;
  }

  function routeNativeMessage(message) {
    const payload =
      message?.type === "bridge-event" &&
      message.payload &&
      typeof message.payload === "object"
        ? message.payload
        : null;
    if (payload?.name === "storage.changed") {
      frames.forEach((frame) => {
        frame.contentWindow?.postMessage(
          { type: "controler-shell-storage-changed", detail: payload },
          "*",
        );
      });
      return;
    }
    frames.forEach((frame) => {
      frame.contentWindow?.postMessage(
        { type: "controler-native-message", message },
        "*",
      );
    });
  }

  function applyNavigationState(detail = {}) {
    const sourcePage = String(detail.sourcePage || "").trim();
    const reason = String(detail.reason || "").trim();
    const isSettingsChange =
      sourcePage === "settings" && reason === "settings-change";
    if (navigationStateInitialized && !isSettingsChange) {
      return false;
    }
    const order = Array.isArray(detail.order)
      ? detail.order.filter((page) => pageByKey.has(page))
      : pageItems.map((item) => item.key);
    pageItems.forEach((item) => {
      if (!order.includes(item.key)) {
        order.push(item.key);
      }
    });
    const hiddenPages = new Set(
      Array.isArray(detail.hiddenPages)
        ? detail.hiddenPages.filter(
            (page) => pageByKey.has(page) && page !== "settings",
          )
        : [],
    );
    const normalizedState = { order, hiddenPages: [...hiddenPages] };
    if (isSettingsChange) {
      localStorage.setItem(
        navigationStateStorageKey,
        JSON.stringify(normalizedState),
      );
    }
    const signature = JSON.stringify(normalizedState);
    navigationStateInitialized = true;
    if (signature === navigationStateSignature || !navigationElement) {
      return false;
    }
    navigationStateSignature = signature;
    order.forEach((page) => {
      const button = navigationElement.querySelector(
        `[data-nav-page="${page}"]`,
      );
      if (button) {
        navigationElement.appendChild(button);
      }
    });
    let visibleCount = 0;
    navigationElement.querySelectorAll("[data-nav-page]").forEach((button) => {
      const hidden = hiddenPages.has(button.dataset.navPage);
      button.hidden = hidden;
      button.setAttribute("aria-hidden", hidden ? "true" : "false");
      if (!hidden) {
        visibleCount += 1;
      }
    });
    navigationElement.style.setProperty(
      "--nav-visible-count",
      String(Math.max(1, visibleCount)),
    );
    return true;
  }

  function applyThemeState(detail = {}) {
    const nextThemeState = normalizeThemeState(detail);
    if (!nextThemeState) {
      return false;
    }
    currentThemeState = nextThemeState;
    const root = document.documentElement;
    root.dataset.theme = nextThemeState.themeId;
    Object.entries(themeColorVariables).forEach(([colorKey, variableName]) => {
      const value = String(nextThemeState.colors[colorKey] || "").trim();
      if (value) {
        root.style.setProperty(variableName, value);
      }
    });
    const primary = String(nextThemeState.colors.primary || "").trim();
    if (primary) {
      root.style.backgroundColor = primary;
      document.body.style.backgroundColor = primary;
    }
    frames.forEach((frame) => sendThemeToFrame(frame, nextThemeState));
    return true;
  }

  function requestBack() {
    if (!activeFrame) {
      return false;
    }
    activeFrame.contentWindow?.postMessage(
      { type: "controler-shell-back" },
      "*",
    );
    return true;
  }

  function readInitialNavigationState() {
    try {
      const storedState = JSON.parse(
        localStorage.getItem(navigationStateStorageKey) ||
          localStorage.getItem("appNavigationVisibility") ||
          "{}",
      );
      return storedState && typeof storedState === "object" ? storedState : {};
    } catch (_error) {
      return {};
    }
  }

  createNavigation();
  const initialTarget = normalizePageHref(
    new URL(window.location.href).searchParams.get("initialHref") ||
      "index.html",
  );
  const safeInitialTarget = initialTarget || {
    href: "index.html?controlerShellFrame=1",
    page: "index",
  };
  activeFrame = createPageFrame(
    safeInitialTarget.href,
    safeInitialTarget.page,
    "",
    true,
  );
  updateCurrentNavigation(safeInitialTarget.page);
  applyNavigationState({
    ...readInitialNavigationState(),
    reason: "shell-bootstrap",
    sourcePage: "shell",
  });

  window.ControlerAndroidShell = Object.freeze({
    applyNavigationState,
    applyThemeState,
    beginNavigation,
    cancelNavigation,
    commitNavigation,
    requestBack,
    routeNativeMessage,
  });
})();
