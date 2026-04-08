(() => {
  const SELECTED_THEME_STORAGE_KEY = "selectedTheme";
  const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
  const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
  const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
  const THEME_WINDOW_NAME_PREFIX = "__CONTROLER_THEME_BOOTSTRAP__:";
  const DEFAULT_THEME_ID = "obsidian-mono";
  const DEFAULT_PRIMARY_COLOR = "#0d0f12";
  const DEFAULT_TEXT_COLOR = "#f4f6fb";
  const DEFAULT_ACCENT_COLOR = "#f1f4fa";
  const PRELOAD_STYLE_ELEMENT_ID = "controler-desktop-theme-preload-style";

  const COLOR_VARIABLE_MAP = Object.freeze({
    primary: "--bg-primary",
    secondary: "--bg-secondary",
    tertiary: "--bg-tertiary",
    quaternary: "--bg-quaternary",
    accent: "--accent-color",
    text: "--text-color",
    mutedText: "--muted-text-color",
    border: "--border-color",
    delete: "--delete-btn",
    deleteHover: "--delete-hover",
    projectLevel1: "--project-level-1",
    projectLevel2: "--project-level-2",
    projectLevel3: "--project-level-3",
    panel: "--panel-bg",
    panelStrong: "--panel-strong-bg",
    panelBorder: "--panel-border-color",
    buttonBg: "--button-bg",
    buttonBgHover: "--button-bg-hover",
    buttonText: "--button-text",
    buttonBorder: "--button-border",
    onAccentText: "--on-accent-text",
    navBarBg: "--bottom-nav-bg",
    navBarBorder: "--bottom-nav-border",
    navButtonBg: "--bottom-nav-button-bg",
    navButtonText: "--bottom-nav-button-text",
    navButtonActiveBg: "--bottom-nav-button-active-bg",
    navButtonActiveText: "--bottom-nav-active-text",
    overlay: "--overlay-bg",
  });

  const BUILT_IN_THEME_PRIMARY_MAP = Object.freeze({
    default: "#183524",
    "blue-ocean": "#12263f",
    "sunset-orange": "#4b261b",
    "minimal-gray": "#1c2734",
    "obsidian-mono": "#0d0f12",
    "ivory-light": "#eceff3",
    "graphite-mist": "#121820",
    "aurora-mist": "#362226",
    "amethyst-haze": "#141826",
    "velvet-bordeaux": "#2f141d",
    "champagne-sandstone": "#f1ebe2",
    "porcelain-mist": "#e8eff7",
    "sage-cashmere": "#edf1ec",
    "oyster-linen": "#f1eef6",
    "midnight-indigo": "#111722",
  });

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRecordCardOpacityPercent(value, fallback = 100) {
    const fallbackNumber = Number(fallback);
    const normalizedFallback = Number.isFinite(fallbackNumber)
      ? Math.max(0, Math.min(100, Math.round(fallbackNumber)))
      : 100;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return normalizedFallback;
    }
    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  function resolveCurrentPageKey() {
    try {
      const pathSegments = String(window.location.pathname || "").split("/");
      const tail = String(pathSegments[pathSegments.length - 1] || "").trim();
      return tail.replace(/\.html$/i, "") || "unknown";
    } catch (_error) {
      return "unknown";
    }
  }

  function appendDesktopThemeDebugLog(label, detail = {}) {
    try {
      if (
        window.electronAPI?.isElectron !== true ||
        typeof window.electronAPI?.debugAppendLog !== "function"
      ) {
        return;
      }
      window.electronAPI.debugAppendLog({
        label: `desktop-theme-preload:${String(label || "").trim() || "event"}`,
        page: resolveCurrentPageKey(),
        href: window.location.href,
        ...(detail && typeof detail === "object" && !Array.isArray(detail)
          ? detail
          : {}),
      });
    } catch (_error) {
      // Ignore logging failures.
    }
  }

  function parseJsonString(rawValue, fallback) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(rawValue);
      return parsed === null || typeof parsed === "undefined" ? fallback : parsed;
    } catch (_error) {
      return fallback;
    }
  }

  function readStorageEntry(storageKey) {
    const candidateKeys = [
      String(storageKey || "").trim(),
      `${LOCAL_ONLY_STORAGE_PREFIX}${String(storageKey || "").trim()}`,
    ].filter(Boolean);
    for (const candidateKey of candidateKeys) {
      try {
        const rawValue = window.localStorage.getItem(candidateKey);
        if (rawValue !== null && typeof rawValue !== "undefined") {
          return {
            rawValue,
            storageKey: candidateKey,
            usedLocalMirror: candidateKey.startsWith(LOCAL_ONLY_STORAGE_PREFIX),
          };
        }
      } catch (_error) {}
    }
    return {
      rawValue: null,
      storageKey: "",
      usedLocalMirror: false,
    };
  }

  function readJsonStorage(storageKey, fallback) {
    try {
      const entry = readStorageEntry(storageKey);
      return parseJsonString(entry.rawValue, fallback);
    } catch (_error) {
      return fallback;
    }
  }

  function readStringStorage(storageKey, fallback = "") {
    try {
      const entry = readStorageEntry(storageKey);
      if (typeof entry.rawValue !== "string") {
        return fallback;
      }
      const trimmed = entry.rawValue.trim();
      return trimmed || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function parseRgbColorChannels(value) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return null;
    }
    const hexMatch = normalizedValue.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }
    const rgbMatch = normalizedValue.match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i,
    );
    if (!rgbMatch) {
      return null;
    }
    return {
      r: Math.min(255, Math.max(0, Number.parseInt(rgbMatch[1], 10) || 0)),
      g: Math.min(255, Math.max(0, Number.parseInt(rgbMatch[2], 10) || 0)),
      b: Math.min(255, Math.max(0, Number.parseInt(rgbMatch[3], 10) || 0)),
    };
  }

  function toRgbChannels(value, fallback = "142, 214, 164") {
    const channels = parseRgbColorChannels(value);
    if (!channels) {
      return fallback;
    }
    return `${channels.r}, ${channels.g}, ${channels.b}`;
  }

  function isLightSurfaceColor(value) {
    const channels = parseRgbColorChannels(value);
    if (!channels) {
      return false;
    }
    const luminance =
      (0.2126 * channels.r + 0.7152 * channels.g + 0.0722 * channels.b) / 255;
    return luminance >= 0.72;
  }

  function readWindowNameThemeState() {
    try {
      const rawValue =
        typeof window.name === "string" && window.name.startsWith(THEME_WINDOW_NAME_PREFIX)
          ? window.name.slice(THEME_WINDOW_NAME_PREFIX.length)
          : "";
      const parsed = parseJsonString(rawValue, null);
      if (!isPlainObject(parsed)) {
        return null;
      }
      const themeId =
        typeof parsed.themeId === "string" && parsed.themeId.trim()
          ? parsed.themeId.trim()
          : DEFAULT_THEME_ID;
      return {
        themeId,
        colors: isPlainObject(parsed.colors) ? parsed.colors : null,
        recordCard: isPlainObject(parsed.recordCard) ? parsed.recordCard : null,
        source: "window-name",
      };
    } catch (_error) {
      return null;
    }
  }

  function injectEarlySurfaceStyle(primaryColor, textColor) {
    const styleText = `html, body { background-color: ${primaryColor}; color: ${textColor}; }`;
    let style = document.getElementById(PRELOAD_STYLE_ELEMENT_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement("style");
      style.id = PRELOAD_STYLE_ELEMENT_ID;
      style.textContent = styleText;
      document.head?.appendChild(style);
    } else {
      style.textContent = styleText;
    }
    const applyBodyStyle = () => {
      if (!(document.body instanceof HTMLElement)) {
        return;
      }
      document.body.style.backgroundColor = primaryColor;
      document.body.style.color = textColor;
    };
    applyBodyStyle();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyBodyStyle, {
        once: true,
      });
    }
  }

  function resolveSelectedThemeState() {
    const windowNameThemeState = readWindowNameThemeState();
    const selectedThemeEntry = readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry = readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry = readStorageEntry(
      BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
    );
    const selectedThemeId = windowNameThemeState
      ? windowNameThemeState.themeId
      : readStringStorage(SELECTED_THEME_STORAGE_KEY, DEFAULT_THEME_ID);
    const customThemes = parseJsonString(customThemesEntry.rawValue, []);
    const builtInThemeOverrides = parseJsonString(
      builtInThemeOverridesEntry.rawValue,
      {},
    );
    const matchedCustomTheme = Array.isArray(customThemes)
      ? customThemes.find((theme) => String(theme?.id || "").trim() === selectedThemeId)
      : null;
    const builtInOverride =
      isPlainObject(builtInThemeOverrides) && isPlainObject(builtInThemeOverrides[selectedThemeId])
        ? builtInThemeOverrides[selectedThemeId]
        : null;
    return {
      themeId: selectedThemeId,
      colors:
        (windowNameThemeState && isPlainObject(windowNameThemeState.colors)
          ? windowNameThemeState.colors
          : null) ||
        (isPlainObject(matchedCustomTheme?.colors)
          ? matchedCustomTheme.colors
          : isPlainObject(builtInOverride?.colors)
            ? builtInOverride.colors
            : null),
      recordCard:
        (windowNameThemeState && isPlainObject(windowNameThemeState.recordCard)
          ? windowNameThemeState.recordCard
          : null) ||
        (isPlainObject(matchedCustomTheme?.recordCard)
          ? matchedCustomTheme.recordCard
          : isPlainObject(builtInOverride?.recordCard)
            ? builtInOverride.recordCard
            : null),
      source: windowNameThemeState
        ? windowNameThemeState.source
        : selectedThemeEntry.usedLocalMirror ||
            customThemesEntry.usedLocalMirror ||
            builtInThemeOverridesEntry.usedLocalMirror
          ? "electron-local-mirror"
          : "local-storage",
      storageKeys: {
        selectedTheme: selectedThemeEntry.storageKey,
        customThemes: customThemesEntry.storageKey,
        builtInThemeOverrides: builtInThemeOverridesEntry.storageKey,
      },
    };
  }

  try {
    const root = document.documentElement;
    const themeState = resolveSelectedThemeState();
    const themeId = themeState.themeId || DEFAULT_THEME_ID;
    const colors = isPlainObject(themeState.colors) ? themeState.colors : null;
    const normalizedRecordCard = isPlainObject(themeState.recordCard)
      ? {
          ...themeState.recordCard,
          projectOpacity: normalizeRecordCardOpacityPercent(
            themeState.recordCard.projectOpacity,
            100,
          ),
          themeOpacity: normalizeRecordCardOpacityPercent(
            themeState.recordCard.themeOpacity,
            100,
          ),
        }
      : null;
    const primaryColor =
      typeof colors?.primary === "string" && colors.primary.trim()
        ? colors.primary.trim()
        : BUILT_IN_THEME_PRIMARY_MAP[themeId] || DEFAULT_PRIMARY_COLOR;
    root.setAttribute("data-theme", themeId);
    root.style.colorScheme = isLightSurfaceColor(primaryColor) ? "light" : "dark";
    root.style.backgroundColor = primaryColor;
    root.style.color = colors?.text || DEFAULT_TEXT_COLOR;
    root.style.setProperty("--bg-primary", primaryColor);
    root.style.setProperty("--text-color", colors?.text || DEFAULT_TEXT_COLOR);
    root.style.setProperty("--accent-color", colors?.accent || DEFAULT_ACCENT_COLOR);
    root.style.setProperty(
      "--accent-color-rgb",
      toRgbChannels(colors?.accent || DEFAULT_ACCENT_COLOR),
    );
    if (colors) {
      Object.entries(COLOR_VARIABLE_MAP).forEach(([colorKey, cssVariableName]) => {
        const value = colors[colorKey];
        if (typeof value === "string" && value.trim()) {
          root.style.setProperty(cssVariableName, value.trim());
        }
      });
      root.style.setProperty(
        "--bottom-nav-border",
        colors?.navBarBorder ||
          colors?.panelBorder ||
          colors?.border ||
          `rgba(${toRgbChannels(colors?.accent || DEFAULT_ACCENT_COLOR)}, 0.44)`,
      );
      root.style.setProperty(
        "--bottom-nav-button-text",
        colors?.navButtonText || colors?.mutedText || colors?.text || DEFAULT_TEXT_COLOR,
      );
    }
    if (normalizedRecordCard) {
      if (typeof normalizedRecordCard.mode === "string" && normalizedRecordCard.mode.trim()) {
        root.style.setProperty(
          "--record-card-color-mode",
          normalizedRecordCard.mode.trim() === "theme" ? "theme" : "project",
        );
      }
      if (typeof normalizedRecordCard.color === "string" && normalizedRecordCard.color.trim()) {
        root.style.setProperty(
          "--record-card-theme-color",
          normalizedRecordCard.color.trim(),
        );
      }
    }
    root.style.setProperty(
      "--record-card-project-opacity",
      String(normalizedRecordCard?.projectOpacity ?? 100),
    );
    root.style.setProperty(
      "--record-card-theme-opacity",
      String(normalizedRecordCard?.themeOpacity ?? 100),
    );
    injectEarlySurfaceStyle(primaryColor, colors?.text || DEFAULT_TEXT_COLOR);
    window.__CONTROLER_DESKTOP_PRELOADED_THEME__ = {
      themeId,
      primaryColor,
      textColor: colors?.text || DEFAULT_TEXT_COLOR,
      colors: colors ? { ...colors } : null,
      recordCard: normalizedRecordCard,
      source: themeState.source || "unknown",
      storageKeys:
        themeState.storageKeys && typeof themeState.storageKeys === "object"
          ? { ...themeState.storageKeys }
          : {},
      appliedAt: Date.now(),
    };
    appendDesktopThemeDebugLog("applied", {
      themeId,
      source: themeState.source || "unknown",
      primaryColor,
      textColor: colors?.text || DEFAULT_TEXT_COLOR,
      storageKeys:
        themeState.storageKeys && typeof themeState.storageKeys === "object"
          ? themeState.storageKeys
          : {},
    });
  } catch (_error) {
    appendDesktopThemeDebugLog("failed", {
      message: _error instanceof Error ? _error.message : String(_error || ""),
    });
    // Ignore theme preload failures and allow the normal theme pipeline to recover.
  }
})();
