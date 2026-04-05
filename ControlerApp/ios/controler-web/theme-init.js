(() => {
  const SELECTED_THEME_STORAGE_KEY = "selectedTheme";
  const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
  const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
  const LOCAL_ONLY_STORAGE_PREFIX = "__controler_local__:";
  const THEME_WINDOW_NAME_PREFIX = "__CONTROLER_THEME_BOOTSTRAP__:";
  const THEME_APPLIED_EVENT_NAME = "controler:theme-applied";
  const DESKTOP_THEME_PRELOAD_STYLE_ELEMENT_ID =
    "controler-desktop-theme-preload-style";
  const DEFAULT_THEME_ID = "obsidian-mono";
  const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
  const RGB_COLOR_PATTERN =
    /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

  const DEFAULT_THEME_COLORS = {
    primary: "#183524",
    secondary: "rgba(23, 53, 36, 0.5)",
    tertiary: "rgba(41, 84, 54, 0.58)",
    quaternary: "rgba(111, 208, 141, 0.12)",
    accent: "#6fd08d",
    text: "#f4fff7",
    mutedText: "rgba(244, 255, 247, 0.74)",
    border: "#5fa878",
    delete: "#ff8686",
    deleteHover: "#ff6b6b",
    projectLevel1: "#72c28a",
    projectLevel2: "#4c9966",
    projectLevel3: "#2f6945",
    panel: "rgba(15, 32, 22, 0.86)",
    panelStrong: "rgba(18, 40, 27, 0.94)",
    panelBorder: "rgba(111, 208, 141, 0.18)",
    buttonBg: "#76d694",
    buttonBgHover: "#8ae0a6",
    buttonText: "#133120",
    buttonBorder: "rgba(111, 208, 141, 0.46)",
    onAccentText: "#133120",
    navBarBg: "rgba(11, 25, 17, 0.9)",
    navButtonBg: "rgba(111, 208, 141, 0.08)",
    navButtonActiveBg: "rgba(98, 189, 125, 0.88)",
    overlay: "rgba(8, 10, 12, 0.45)",
  };
  const DEFAULT_THEME_RECORD_CARD = {
    mode: "project",
    color: "#72c28a",
  };

  function buildThemeDefinition(id, name, colorOverrides = {}, options = {}) {
    const colors = {
      ...DEFAULT_THEME_COLORS,
      ...colorOverrides,
    };
    return {
      id,
      name,
      colors,
      recordCard: resolveThemeRecordCard(
        {
          recordCard: options?.recordCard,
        },
        colors,
      ),
    };
  }

  const BUILT_IN_THEMES = [
    buildThemeDefinition("default", "森林磨砂"),
    buildThemeDefinition("blue-ocean", "海蓝磨砂", {
      primary: "#12263f",
      secondary: "rgba(24, 43, 69, 0.5)",
      tertiary: "rgba(39, 63, 96, 0.58)",
      quaternary: "rgba(126, 198, 255, 0.12)",
      accent: "#7ec6ff",
      text: "#eef6ff",
      mutedText: "rgba(238, 246, 255, 0.72)",
      border: "#6d7ba4",
      delete: "#ff8a8a",
      deleteHover: "#ff6f6f",
      projectLevel1: "#63b3ed",
      projectLevel2: "#4299e1",
      projectLevel3: "#2c5282",
      panel: "rgba(15, 30, 50, 0.86)",
      panelStrong: "rgba(19, 36, 58, 0.94)",
      panelBorder: "rgba(126, 198, 255, 0.16)",
      buttonBg: "#7ec6ff",
      buttonBgHover: "#95d2ff",
      buttonText: "#123052",
      buttonBorder: "rgba(126, 198, 255, 0.48)",
      onAccentText: "#123052",
      navBarBg: "rgba(11, 23, 39, 0.9)",
      navButtonBg: "rgba(126, 198, 255, 0.08)",
      navButtonActiveBg: "rgba(119, 182, 235, 0.84)",
    }),
    buildThemeDefinition("sunset-orange", "落日暖橙", {
      primary: "#4b261b",
      secondary: "rgba(101, 50, 31, 0.48)",
      tertiary: "rgba(129, 67, 42, 0.58)",
      quaternary: "rgba(255, 191, 120, 0.12)",
      accent: "#ffbf78",
      text: "#fff5ea",
      mutedText: "rgba(255, 245, 234, 0.74)",
      border: "#bdb38b",
      delete: "#ff9a9a",
      deleteHover: "#ff7d7d",
      projectLevel1: "#f6ad55",
      projectLevel2: "#ed8936",
      projectLevel3: "#c05621",
      panel: "rgba(59, 31, 22, 0.86)",
      panelStrong: "rgba(70, 37, 26, 0.94)",
      panelBorder: "rgba(255, 191, 120, 0.18)",
      buttonBg: "#ffc78a",
      buttonBgHover: "#ffd3a5",
      buttonText: "#522a1c",
      buttonBorder: "rgba(255, 191, 120, 0.48)",
      onAccentText: "#522a1c",
      navBarBg: "rgba(46, 25, 18, 0.9)",
      navButtonBg: "rgba(255, 191, 120, 0.08)",
      navButtonActiveBg: "rgba(243, 181, 112, 0.88)",
    }),
    buildThemeDefinition("minimal-gray", "冰川银蓝", {
      primary: "#1c2734",
      secondary: "rgba(35, 49, 64, 0.5)",
      tertiary: "rgba(54, 73, 95, 0.58)",
      quaternary: "rgba(183, 205, 230, 0.12)",
      accent: "#b7cde6",
      text: "#f5f9ff",
      mutedText: "rgba(245, 249, 255, 0.74)",
      border: "#89a1bc",
      delete: "#ff8d8d",
      deleteHover: "#ff7070",
      projectLevel1: "#a9c1de",
      projectLevel2: "#7e9bbd",
      projectLevel3: "#55718f",
      panel: "rgba(20, 31, 42, 0.86)",
      panelStrong: "rgba(25, 38, 51, 0.94)",
      panelBorder: "rgba(183, 205, 230, 0.18)",
      buttonBg: "#c2d7ee",
      buttonBgHover: "#d3e3f5",
      buttonText: "#1f3246",
      buttonBorder: "rgba(183, 205, 230, 0.5)",
      onAccentText: "#1f3246",
      navBarBg: "rgba(15, 24, 34, 0.9)",
      navButtonBg: "rgba(183, 205, 230, 0.08)",
      navButtonActiveBg: "rgba(108, 133, 162, 0.88)",
    }),
    buildThemeDefinition("obsidian-mono", "曜石黑", {
      primary: "#0d0f12",
      secondary: "rgba(20, 23, 28, 0.52)",
      tertiary: "rgba(32, 36, 43, 0.6)",
      quaternary: "rgba(241, 244, 250, 0.1)",
      accent: "#f1f4fa",
      text: "#f4f6fb",
      mutedText: "rgba(244, 246, 251, 0.76)",
      border: "rgba(215, 221, 232, 0.24)",
      delete: "#ff7b7b",
      deleteHover: "#ff5f5f",
      projectLevel1: "#d6dde8",
      projectLevel2: "#a2adbd",
      projectLevel3: "#667084",
      panel: "rgba(15, 17, 21, 0.88)",
      panelStrong: "rgba(19, 22, 27, 0.95)",
      panelBorder: "rgba(215, 221, 232, 0.14)",
      buttonBg: "#f1f4fa",
      buttonBgHover: "#ffffff",
      buttonText: "#10141d",
      buttonBorder: "rgba(241, 244, 250, 0.68)",
      onAccentText: "#10141d",
      navBarBg: "rgba(10, 12, 15, 0.92)",
      navButtonBg: "rgba(241, 244, 250, 0.06)",
      navButtonActiveBg: "rgba(72, 79, 92, 0.92)",
    }),
    buildThemeDefinition("ivory-light", "象牙白", {
      primary: "#eceff3",
      secondary: "rgba(255, 255, 255, 0.72)",
      tertiary: "rgba(240, 244, 250, 0.82)",
      quaternary: "rgba(63, 73, 95, 0.08)",
      accent: "#3f495f",
      text: "#202633",
      mutedText: "rgba(32, 38, 51, 0.7)",
      border: "#7b8598",
      delete: "#cf4d4d",
      deleteHover: "#b13d3d",
      projectLevel1: "#8b94a5",
      projectLevel2: "#a2abbb",
      projectLevel3: "#c0c7d3",
      panel: "rgba(255, 255, 255, 0.88)",
      panelStrong: "rgba(250, 252, 255, 0.96)",
      panelBorder: "rgba(110, 122, 143, 0.14)",
      buttonBg: "#3f495f",
      buttonBgHover: "#56607a",
      buttonText: "#f4f7ff",
      buttonBorder: "rgba(63, 73, 95, 0.58)",
      onAccentText: "#f4f7ff",
      navBarBg: "rgba(246, 249, 252, 0.92)",
      navButtonBg: "rgba(63, 73, 95, 0.05)",
      navButtonActiveBg: "rgba(74, 85, 109, 0.88)",
      overlay: "rgba(27, 31, 38, 0.22)",
    }),
    buildThemeDefinition("graphite-mist", "石墨灰", {
      primary: "#2a2d32",
      secondary: "rgba(58, 62, 69, 0.5)",
      tertiary: "rgba(76, 81, 90, 0.58)",
      quaternary: "rgba(240, 243, 250, 0.1)",
      accent: "#f0f3fa",
      text: "#f8f9fc",
      mutedText: "rgba(248, 249, 252, 0.74)",
      border: "rgba(224, 227, 234, 0.24)",
      delete: "#ff8787",
      deleteHover: "#ff6b6b",
      projectLevel1: "#d8dde7",
      projectLevel2: "#aeb5c2",
      projectLevel3: "#808897",
      panel: "rgba(39, 42, 48, 0.86)",
      panelStrong: "rgba(45, 49, 56, 0.94)",
      panelBorder: "rgba(224, 227, 234, 0.15)",
      buttonBg: "#f0f3fa",
      buttonBgHover: "#ffffff",
      buttonText: "#222832",
      buttonBorder: "rgba(240, 243, 250, 0.56)",
      onAccentText: "#222832",
      navBarBg: "rgba(33, 36, 41, 0.9)",
      navButtonBg: "rgba(240, 243, 250, 0.06)",
      navButtonActiveBg: "rgba(124, 134, 149, 0.82)",
    }),
    buildThemeDefinition("aurora-mist", "玫瑰晨雾", {
      primary: "#362226",
      secondary: "rgba(86, 50, 54, 0.48)",
      tertiary: "rgba(129, 81, 79, 0.58)",
      quaternary: "rgba(255, 182, 142, 0.13)",
      accent: "#ffb68e",
      text: "#fff6f1",
      mutedText: "rgba(255, 246, 241, 0.74)",
      border: "#ca9788",
      delete: "#ff8e85",
      deleteHover: "#ff736c",
      projectLevel1: "#f0ad8b",
      projectLevel2: "#cf8669",
      projectLevel3: "#8f5849",
      panel: "rgba(44, 28, 31, 0.86)",
      panelStrong: "rgba(54, 34, 38, 0.94)",
      panelBorder: "rgba(255, 182, 142, 0.18)",
      buttonBg: "#ffc09a",
      buttonBgHover: "#ffd0b3",
      buttonText: "#532f26",
      buttonBorder: "rgba(255, 182, 142, 0.46)",
      onAccentText: "#532f26",
      navBarBg: "rgba(36, 22, 25, 0.9)",
      navButtonBg: "rgba(255, 182, 142, 0.08)",
      navButtonActiveBg: "rgba(182, 112, 89, 0.9)",
    }),
    buildThemeDefinition("amethyst-haze", "紫晶暮雾", {
      primary: "#141826",
      secondary: "rgba(29, 34, 53, 0.5)",
      tertiary: "rgba(50, 61, 96, 0.58)",
      quaternary: "rgba(157, 176, 255, 0.14)",
      accent: "#9db0ff",
      text: "#f5f7ff",
      mutedText: "rgba(245, 247, 255, 0.74)",
      border: "#8394c9",
      delete: "#ff8fa2",
      deleteHover: "#ff748c",
      projectLevel1: "#b1c2ff",
      projectLevel2: "#7488de",
      projectLevel3: "#46589d",
      panel: "rgba(18, 22, 35, 0.86)",
      panelStrong: "rgba(24, 29, 45, 0.94)",
      panelBorder: "rgba(157, 176, 255, 0.18)",
      buttonBg: "#b9c8ff",
      buttonBgHover: "#ced8ff",
      buttonText: "#1f2742",
      buttonBorder: "rgba(157, 176, 255, 0.48)",
      onAccentText: "#1f2742",
      navBarBg: "rgba(15, 19, 31, 0.9)",
      navButtonBg: "rgba(157, 176, 255, 0.09)",
      navButtonActiveBg: "rgba(92, 109, 183, 0.9)",
    }),
    buildThemeDefinition("velvet-bordeaux", "酒红夜幕", {
      primary: "#2f141d",
      secondary: "rgba(68, 24, 37, 0.48)",
      tertiary: "rgba(94, 37, 52, 0.58)",
      quaternary: "rgba(216, 166, 184, 0.12)",
      accent: "#d8a6b8",
      text: "#fff3f6",
      mutedText: "rgba(255, 243, 246, 0.74)",
      border: "#b78898",
      delete: "#ff919b",
      deleteHover: "#ff7784",
      projectLevel1: "#c58da2",
      projectLevel2: "#a6607a",
      projectLevel3: "#6c3348",
      panel: "rgba(36, 17, 24, 0.86)",
      panelStrong: "rgba(43, 20, 29, 0.94)",
      panelBorder: "rgba(216, 166, 184, 0.16)",
      buttonBg: "#e2b0c2",
      buttonBgHover: "#ebc1cf",
      buttonText: "#421d2a",
      buttonBorder: "rgba(216, 166, 184, 0.46)",
      onAccentText: "#421d2a",
      navBarBg: "rgba(31, 14, 21, 0.9)",
      navButtonBg: "rgba(216, 166, 184, 0.08)",
      navButtonActiveBg: "rgba(142, 77, 99, 0.88)",
    }),
    buildThemeDefinition("champagne-sandstone", "香槟砂岩", {
      primary: "#f1ebe2",
      secondary: "rgba(255, 250, 244, 0.72)",
      tertiary: "rgba(238, 228, 214, 0.84)",
      quaternary: "rgba(139, 111, 87, 0.08)",
      accent: "#8b6f57",
      text: "#2f261f",
      mutedText: "rgba(47, 38, 31, 0.68)",
      border: "#b59f8c",
      delete: "#c85656",
      deleteHover: "#ad4343",
      projectLevel1: "#bca087",
      projectLevel2: "#cfb59a",
      projectLevel3: "#e0d0bf",
      panel: "rgba(255, 252, 248, 0.9)",
      panelStrong: "rgba(252, 247, 241, 0.96)",
      panelBorder: "rgba(143, 119, 95, 0.14)",
      buttonBg: "#8b6f57",
      buttonBgHover: "#a28267",
      buttonText: "#f8f3ec",
      buttonBorder: "rgba(139, 111, 87, 0.44)",
      onAccentText: "#f8f3ec",
      navBarBg: "rgba(249, 243, 235, 0.92)",
      navButtonBg: "rgba(139, 111, 87, 0.05)",
      navButtonActiveBg: "rgba(145, 118, 92, 0.88)",
      overlay: "rgba(40, 34, 28, 0.18)",
    }),
    buildThemeDefinition("midnight-indigo", "琥珀暮影", {
      primary: "#111722",
      secondary: "rgba(29, 37, 56, 0.5)",
      tertiary: "rgba(48, 59, 84, 0.58)",
      quaternary: "rgba(214, 195, 156, 0.13)",
      accent: "#d6c39c",
      text: "#faf7f1",
      mutedText: "rgba(250, 247, 241, 0.74)",
      border: "#98876b",
      delete: "#ff9c86",
      deleteHover: "#ff836f",
      projectLevel1: "#deccab",
      projectLevel2: "#a59372",
      projectLevel3: "#5f5542",
      panel: "rgba(19, 24, 36, 0.86)",
      panelStrong: "rgba(25, 31, 45, 0.94)",
      panelBorder: "rgba(214, 195, 156, 0.18)",
      buttonBg: "#e3d2af",
      buttonBgHover: "#ecdfc3",
      buttonText: "#2a241b",
      buttonBorder: "rgba(214, 195, 156, 0.48)",
      onAccentText: "#2a241b",
      navBarBg: "rgba(16, 21, 32, 0.9)",
      navButtonBg: "rgba(214, 195, 156, 0.08)",
      navButtonActiveBg: "rgba(128, 113, 83, 0.9)",
    }),
  ];

  const builtInThemeMap = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));
  const lightThemeIds = new Set(["ivory-light", "champagne-sandstone"]);
  let lastThemeStorageSignature = null;
  let lastLaunchThemeSyncSignature = null;
  let lastDesktopThemeDebugApplySignature = null;

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function resolveCurrentThemeDebugPageKey() {
    try {
      const pathSegments = String(window.location.pathname || "").split("/");
      const tail = String(pathSegments[pathSegments.length - 1] || "").trim();
      return tail.replace(/\.html$/i, "") || "unknown";
    } catch (error) {
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
        label: `theme-init:${String(label || "").trim() || "event"}`,
        page: resolveCurrentThemeDebugPageKey(),
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
    const normalizedKey = String(storageKey || "").trim();
    if (!normalizedKey) {
      return {
        rawValue: null,
        storageKey: "",
        usedLocalMirror: false,
      };
    }
    const candidateKeys = [
      normalizedKey,
      `${LOCAL_ONLY_STORAGE_PREFIX}${normalizedKey}`,
    ];
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

  function buildThemeStorageSignature(entries = null) {
    const selectedThemeEntry =
      entries?.selectedTheme || readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry =
      entries?.customThemes || readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry =
      entries?.builtInThemeOverrides ||
      readStorageEntry(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY);
    return [
      selectedThemeEntry.storageKey || "",
      selectedThemeEntry.rawValue || "",
      customThemesEntry.storageKey || "",
      customThemesEntry.rawValue || "",
      builtInThemeOverridesEntry.storageKey || "",
      builtInThemeOverridesEntry.rawValue || "",
    ].join("\u0001");
  }

  function persistThemeWindowNameState(themeId, colors, recordCard = null) {
    if (!isPlainObject(colors)) {
      return;
    }
    try {
      window.name =
        THEME_WINDOW_NAME_PREFIX +
        JSON.stringify({
          version: 1,
          themeId:
            typeof themeId === "string" && themeId.trim()
              ? themeId.trim()
              : DEFAULT_THEME_ID,
          colors,
          recordCard:
            isPlainObject(recordCard)
              ? {
                  mode:
                    typeof recordCard.mode === "string" &&
                    recordCard.mode.trim() === "theme"
                      ? "theme"
                      : "project",
                  color:
                    typeof recordCard.color === "string"
                      ? recordCard.color.trim()
                      : "",
                }
              : null,
        });
    } catch (_error) {}
  }

  function parseHexColor(color) {
    const match = String(color || "")
      .trim()
      .match(HEX_COLOR_PATTERN);
    if (!match) return null;
    return {
      r: parseInt(match[1].slice(0, 2), 16),
      g: parseInt(match[1].slice(2, 4), 16),
      b: parseInt(match[1].slice(4, 6), 16),
    };
  }

  function toHexColor(color, fallback = "#000000") {
    const hex = parseHexColor(color);
    if (hex) {
      return `#${String(color).trim().slice(1).toUpperCase()}`;
    }

    const rgbMatch = String(color || "")
      .trim()
      .match(RGB_COLOR_PATTERN);
    if (rgbMatch) {
      return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map((value) => Number(value).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
    }

    return fallback;
  }

  function toRgbChannels(color) {
    if (!color) return "121,175,133";

    const hex = String(color)
      .trim()
      .match(HEX_COLOR_PATTERN);
    if (hex) {
      const r = parseInt(hex[1].slice(0, 2), 16);
      const g = parseInt(hex[1].slice(2, 4), 16);
      const b = parseInt(hex[1].slice(4, 6), 16);
      return `${r},${g},${b}`;
    }

    const rgb = String(color)
      .trim()
      .match(RGB_COLOR_PATTERN);
    if (rgb) {
      return `${rgb[1]},${rgb[2]},${rgb[3]}`;
    }

    return "121,175,133";
  }

  function toRgbaColor(color, alpha = 1) {
    return `rgba(${toRgbChannels(color)}, ${alpha})`;
  }

  function mixThemeColors(baseColor, overlayColor, overlayWeight = 0.5) {
    const base = parseHexColor(toHexColor(baseColor, ""));
    const overlay = parseHexColor(toHexColor(overlayColor, ""));
    if (!base && !overlay) {
      return "#000000";
    }
    if (!base) {
      return toHexColor(overlayColor, "#000000");
    }
    if (!overlay) {
      return toHexColor(baseColor, "#000000");
    }

    const weight = Math.max(0, Math.min(1, Number(overlayWeight) || 0));
    const blendChannel = (baseValue, overlayValue) =>
      Math.round(baseValue * (1 - weight) + overlayValue * weight)
        .toString(16)
        .padStart(2, "0");

    return `#${[
      blendChannel(base.r, overlay.r),
      blendChannel(base.g, overlay.g),
      blendChannel(base.b, overlay.b),
    ].join("")}`.toUpperCase();
  }

  function isValidThemeColorValue(color) {
    const normalized = String(color || "").trim();
    return HEX_COLOR_PATTERN.test(normalized) || RGB_COLOR_PATTERN.test(normalized);
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function getReadableTextColor(color, darkText = "#173326", lightText = "#f8fafc") {
    const rgb = parseHexColor(toHexColor(color, ""));
    if (!rgb) {
      return darkText;
    }

    const luminance =
      (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance >= 0.62 ? darkText : lightText;
  }

  function getRelativeLuminance(color) {
    const rgb = parseHexColor(toHexColor(color, ""));
    if (!rgb) {
      return null;
    }

    const normalizeChannel = (channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };

    return (
      0.2126 * normalizeChannel(rgb.r) +
      0.7152 * normalizeChannel(rgb.g) +
      0.0722 * normalizeChannel(rgb.b)
    );
  }

  function getContrastRatio(backgroundColor, textColor) {
    const backgroundLuminance = getRelativeLuminance(backgroundColor);
    const textLuminance = getRelativeLuminance(textColor);
    if (
      !Number.isFinite(backgroundLuminance) ||
      !Number.isFinite(textLuminance)
    ) {
      return 0;
    }

    const lighter = Math.max(backgroundLuminance, textLuminance);
    const darker = Math.min(backgroundLuminance, textLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function ensureReadableTextColor(
    backgroundColor,
    preferredTextColor,
    darkText = "#173326",
    lightText = "#f8fafc",
    minContrast = 4.2,
  ) {
    const fallbackTextColor = getReadableTextColor(
      backgroundColor,
      darkText,
      lightText,
    );
    if (!isValidThemeColorValue(preferredTextColor)) {
      return fallbackTextColor;
    }

    const normalizedTextColor = preferredTextColor.trim();
    return getContrastRatio(backgroundColor, normalizedTextColor) >= minContrast
      ? normalizedTextColor
      : fallbackTextColor;
  }

  function ensureReadableShapeColor(
    color,
    backgroundColor,
    fallbackColor = DEFAULT_THEME_COLORS.accent,
    minContrast = 2.1,
  ) {
    const safeBackground = isValidThemeColorValue(backgroundColor)
      ? backgroundColor.trim()
      : DEFAULT_THEME_COLORS.primary;
    const fallbackShapeColor = isValidThemeColorValue(fallbackColor)
      ? fallbackColor.trim()
      : DEFAULT_THEME_COLORS.accent;
    const preferredShapeColor = isValidThemeColorValue(color)
      ? color.trim()
      : fallbackShapeColor;

    if (getContrastRatio(safeBackground, preferredShapeColor) >= minContrast) {
      return preferredShapeColor;
    }

    const readableReference = getReadableTextColor(
      safeBackground,
      "#17212b",
      "#f7faff",
    );
    const mixedShapeColor = mixThemeColors(
      preferredShapeColor,
      readableReference,
      0.42,
    );
    if (getContrastRatio(safeBackground, mixedShapeColor) >= minContrast) {
      return mixedShapeColor;
    }

    if (getContrastRatio(safeBackground, fallbackShapeColor) >= minContrast) {
      return fallbackShapeColor;
    }

    return readableReference;
  }

  function resolveWidgetThemeColors(resolvedColors = {}) {
    const surfaceReference = firstNonEmpty(
      resolvedColors.panelStrong,
      resolvedColors.panel,
      resolvedColors.secondary,
      resolvedColors.primary,
      DEFAULT_THEME_COLORS.panelStrong,
    );
    const surfaceLuminance = getRelativeLuminance(surfaceReference);
    const isLightSurface =
      Number.isFinite(surfaceLuminance) && surfaceLuminance >= 0.58;
    const contrastReference = isLightSurface ? "#17212B" : "#FFFFFF";
    const accentBase = ensureReadableShapeColor(
      resolvedColors.accent,
      surfaceReference,
      DEFAULT_THEME_COLORS.accent,
      2.1,
    );
    const accentActionBg = ensureReadableShapeColor(
      resolvedColors.buttonBg,
      surfaceReference,
      accentBase,
      2.1,
    );
    const windowSurface = mixThemeColors(
      firstNonEmpty(resolvedColors.primary, DEFAULT_THEME_COLORS.primary),
      surfaceReference,
      isLightSurface ? 0.1 : 0.26,
    );
    const cardBase = mixThemeColors(
      surfaceReference,
      accentBase,
      isLightSurface ? 0.05 : 0.08,
    );
    const subtleBase = mixThemeColors(
      surfaceReference,
      accentBase,
      isLightSurface ? 0.08 : 0.14,
    );
    const subtleStrongBase = mixThemeColors(
      surfaceReference,
      accentBase,
      isLightSurface ? 0.12 : 0.18,
    );

    return {
      surfaceReference,
      windowSurface: toRgbaColor(windowSurface, 1),
      windowGlow: toRgbaColor(accentBase, isLightSurface ? 0.14 : 0.12),
      controlBg: toRgbaColor(contrastReference, isLightSurface ? 0.1 : 0.18),
      controlBorder: toRgbaColor(contrastReference, isLightSurface ? 0.18 : 0.22),
      controlText: ensureReadableTextColor(
        surfaceReference,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      cardBg: toRgbaColor(cardBase, isLightSurface ? 0.96 : 0.94),
      cardBorder: toRgbaColor(
        mixThemeColors(
          firstNonEmpty(resolvedColors.panelBorder, resolvedColors.border, accentBase),
          accentBase,
          0.28,
        ),
        isLightSurface ? 0.38 : 0.32,
      ),
      cardShadow: toRgbaColor(
        isLightSurface ? "#556274" : "#02060A",
        isLightSurface ? 0.12 : 0.28,
      ),
      cardGlossStart: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      subtleSurface: toRgbaColor(subtleBase, isLightSurface ? 0.42 : 0.34),
      subtleSurfaceStrong: toRgbaColor(
        subtleStrongBase,
        isLightSurface ? 0.52 : 0.44,
      ),
      subtleBorder: toRgbaColor(contrastReference, isLightSurface ? 0.16 : 0.2),
      trackBg: toRgbaColor(contrastReference, isLightSurface ? 0.07 : 0.1),
      trackBorder: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.18),
      gridColor: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.18),
      placeholderColor: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.22 : 0.3,
      ),
      chartTrackBg: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.18),
      pieCenterBg: toRgbaColor(
        mixThemeColors(surfaceReference, resolvedColors.primary, 0.18),
        isLightSurface ? 0.96 : 0.94,
      ),
      badgeBg: toRgbaColor(contrastReference, isLightSurface ? 0.1 : 0.16),
      badgeText: resolvedColors.mutedText,
      actionMutedBg: toRgbaColor(contrastReference, isLightSurface ? 0.1 : 0.16),
      actionMutedBorder: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.16 : 0.22,
      ),
      actionMutedText: ensureReadableTextColor(
        surfaceReference,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.2,
      ),
      accentActionBg,
      accentActionBorder: toRgbaColor(
        accentActionBg,
        isLightSurface ? 0.4 : 0.36,
      ),
      accentActionText: ensureReadableTextColor(
        accentActionBg,
        firstNonEmpty(resolvedColors.buttonText, resolvedColors.onAccentText),
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      goalAnnualBg: toRgbaColor(accentBase, isLightSurface ? 0.2 : 0.18),
      goalAnnualAccent: accentBase,
      goalMonthBg: toRgbaColor(subtleStrongBase, isLightSurface ? 0.48 : 0.4),
      goalMonthAccent: toRgbaColor(contrastReference, isLightSurface ? 0.2 : 0.24),
      colorChipOutline: toRgbaColor(contrastReference, isLightSurface ? 0.18 : 0.22),
    };
  }

  function syncDocumentThemeSurface(resolvedColors = {}) {
    const backgroundColor = firstNonEmpty(
      resolvedColors?.primary,
      DEFAULT_THEME_COLORS.primary,
    );
    const textColor = firstNonEmpty(
      resolvedColors?.text,
      DEFAULT_THEME_COLORS.text,
    );
    const root = document.documentElement;
    if (root instanceof HTMLElement) {
      root.style.backgroundColor = backgroundColor;
      root.style.color = textColor;
    }

    const applyBodySurface = () => {
      if (!(document.body instanceof HTMLElement)) {
        return;
      }
      document.body.style.backgroundColor = backgroundColor;
      document.body.style.color = textColor;
    };
    applyBodySurface();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyBodySurface, {
        once: true,
      });
    }

    const preloadStyle = document.getElementById(
      DESKTOP_THEME_PRELOAD_STYLE_ELEMENT_ID,
    );
    if (preloadStyle instanceof HTMLStyleElement) {
      preloadStyle.textContent = `html, body { background-color: ${backgroundColor}; color: ${textColor}; }`;
    }

    return {
      backgroundColor,
      textColor,
    };
  }

  function normalizeThemeRecordCardMode(mode, fallback = DEFAULT_THEME_RECORD_CARD.mode) {
    const normalizedMode = String(mode || "").trim().toLowerCase();
    if (normalizedMode === "theme" || normalizedMode === "custom") {
      return "theme";
    }
    if (normalizedMode === "project" || normalizedMode === "stats") {
      return "project";
    }
    return fallback === "theme" ? "theme" : "project";
  }

  function resolveThemeRecordCard(theme = null, resolvedColors = null) {
    const source =
      theme?.recordCard && typeof theme.recordCard === "object"
        ? theme.recordCard
        : {};
    const palette =
      resolvedColors && typeof resolvedColors === "object"
        ? resolvedColors
        : resolveThemeColors(theme);
    const colorCandidates = [
      source?.color,
      palette?.projectLevel1,
      palette?.accent,
      palette?.buttonBg,
      DEFAULT_THEME_RECORD_CARD.color,
    ];
    const resolvedColor =
      colorCandidates.find((value) => isValidThemeColorValue(value)) ||
      DEFAULT_THEME_RECORD_CARD.color;
    return {
      mode: normalizeThemeRecordCardMode(source?.mode),
      color: String(resolvedColor || DEFAULT_THEME_RECORD_CARD.color).trim(),
    };
  }

  function resolveThemeColors(theme = null) {
    const source = theme?.colors || {};
    const primary = isValidThemeColorValue(source.primary)
      ? source.primary.trim()
      : DEFAULT_THEME_COLORS.primary;
    const secondary = isValidThemeColorValue(source.secondary)
      ? source.secondary.trim()
      : DEFAULT_THEME_COLORS.secondary;
    const tertiary = isValidThemeColorValue(source.tertiary)
      ? source.tertiary.trim()
      : DEFAULT_THEME_COLORS.tertiary;
    const quaternary = isValidThemeColorValue(source.quaternary)
      ? source.quaternary.trim()
      : DEFAULT_THEME_COLORS.quaternary;
    const panel = isValidThemeColorValue(source.panel)
      ? source.panel.trim()
      : secondary;
    const panelStrong = isValidThemeColorValue(source.panelStrong)
      ? source.panelStrong.trim()
      : tertiary;
    const accent = ensureReadableShapeColor(
      isValidThemeColorValue(source.accent)
        ? source.accent.trim()
        : DEFAULT_THEME_COLORS.accent,
      panelStrong,
      DEFAULT_THEME_COLORS.accent,
      2.1,
    );
    const text = ensureReadableTextColor(
      panelStrong,
      isValidThemeColorValue(source.text)
        ? source.text.trim()
        : DEFAULT_THEME_COLORS.text,
      "#173326",
      "#f8fafc",
      4.5,
    );
    const buttonBg = ensureReadableShapeColor(
      isValidThemeColorValue(source.buttonBg) ? source.buttonBg.trim() : accent,
      panelStrong,
      accent,
      2.1,
    );
    const panelBorder = isValidThemeColorValue(source.panelBorder)
      ? source.panelBorder.trim()
      : toRgbaColor(accent, 0.28);
    const navBarBg = isValidThemeColorValue(source.navBarBg)
      ? source.navBarBg.trim()
      : panelStrong;
    const navButtonBg = isValidThemeColorValue(source.navButtonBg)
      ? source.navButtonBg.trim()
      : toRgbaColor(accent, 0.12);
    const navButtonActiveBg = ensureReadableShapeColor(
      isValidThemeColorValue(source.navButtonActiveBg)
        ? source.navButtonActiveBg.trim()
        : buttonBg,
      navBarBg,
      buttonBg,
      1.9,
    );
    const buttonText = ensureReadableTextColor(
      buttonBg,
      source.buttonText,
      "#173326",
      "#f8fafc",
    );
    const onAccentText = ensureReadableTextColor(
      accent,
      source.onAccentText,
      "#173326",
      "#f8fafc",
    );
    const navButtonActiveText = ensureReadableTextColor(
      navButtonActiveBg,
      source.navButtonActiveText,
      "#16211c",
      "#f8fafc",
    );
    const primaryHex = toHexColor(primary, DEFAULT_THEME_COLORS.primary);
    const primaryRgb = parseHexColor(primaryHex);
    const isLightSurface =
      !!primaryRgb &&
      (0.2126 * primaryRgb.r + 0.7152 * primaryRgb.g + 0.0722 * primaryRgb.b) / 255 >=
        0.72;

    return {
      primary,
      secondary,
      tertiary,
      quaternary,
      accent,
      text,
      mutedText: isValidThemeColorValue(source.mutedText)
        ? source.mutedText.trim()
        : toRgbaColor(text, isLightSurface ? 0.7 : 0.72),
      border: isValidThemeColorValue(source.border)
        ? source.border.trim()
        : panelBorder,
      delete: isValidThemeColorValue(source.delete)
        ? source.delete.trim()
        : DEFAULT_THEME_COLORS.delete,
      deleteHover: isValidThemeColorValue(source.deleteHover)
        ? source.deleteHover.trim()
        : DEFAULT_THEME_COLORS.deleteHover,
      projectLevel1: isValidThemeColorValue(source.projectLevel1)
        ? source.projectLevel1.trim()
        : DEFAULT_THEME_COLORS.projectLevel1,
      projectLevel2: isValidThemeColorValue(source.projectLevel2)
        ? source.projectLevel2.trim()
        : DEFAULT_THEME_COLORS.projectLevel2,
      projectLevel3: isValidThemeColorValue(source.projectLevel3)
        ? source.projectLevel3.trim()
        : DEFAULT_THEME_COLORS.projectLevel3,
      panel,
      panelStrong,
      panelBorder,
      buttonBg,
      buttonBgHover: isValidThemeColorValue(source.buttonBgHover)
        ? source.buttonBgHover.trim()
        : buttonBg,
      buttonText,
      buttonBorder: isValidThemeColorValue(source.buttonBorder)
        ? source.buttonBorder.trim()
        : toRgbaColor(buttonBg, 0.48),
      onAccentText,
      navBarBg,
      navButtonBg,
      navButtonActiveBg,
      navButtonActiveText,
      overlay: isValidThemeColorValue(source.overlay)
        ? source.overlay.trim()
        : toRgbaColor(
            mixThemeColors(
              primary,
              isLightSurface ? "#17212B" : "#04070B",
              isLightSurface ? 0.76 : 0.68,
            ),
            isLightSurface ? 0.24 : 0.62,
          ),
    };
  }

  function normalizeBuiltInThemeOverride(themeId, override = {}) {
    const baseTheme = builtInThemeMap.get(themeId);
    if (
      !baseTheme ||
      !override ||
      typeof override !== "object" ||
      Array.isArray(override)
    ) {
      return null;
    }

    const normalizedColors = resolveThemeColors({
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        ...(override?.colors || {}),
      },
    });
    const normalizedRecordCard = resolveThemeRecordCard(
      {
        ...baseTheme,
        recordCard: {
          ...(baseTheme.recordCard || {}),
          ...(override?.recordCard || {}),
        },
      },
      normalizedColors,
    );
    return {
      id: themeId,
      name:
        typeof override?.name === "string" && override.name.trim()
          ? override.name.trim()
          : baseTheme.name,
      colors: normalizedColors,
      recordCard: normalizedRecordCard,
    };
  }

  function loadBuiltInThemeOverrides() {
    try {
      const raw = readJsonStorage(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY, {});
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
      }

      return BUILT_IN_THEMES.reduce((accumulator, theme) => {
        const override = normalizeBuiltInThemeOverride(theme.id, raw[theme.id]);
        if (override) {
          accumulator[theme.id] = override;
        }
        return accumulator;
      }, {});
    } catch (error) {
      return {};
    }
  }

  function normalizeCustomTheme(theme) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
      return null;
    }

    const normalizedColors = resolveThemeColors(theme);

    return {
      id: typeof theme.id === "string" ? theme.id : "",
      name: typeof theme.name === "string" ? theme.name : "",
      colors: normalizedColors,
      recordCard: resolveThemeRecordCard(theme, normalizedColors),
    };
  }

  function isLightTheme(theme) {
    if (lightThemeIds.has(theme?.id)) return true;
    const rgb = parseHexColor(toHexColor(theme?.colors?.primary, ""));
    if (!rgb) return false;
    const luminance =
      (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance >= 0.72;
  }

  function applyThemeColors(theme) {
    const resolvedColors = resolveThemeColors(theme);
    const resolvedRecordCard = resolveThemeRecordCard(theme, resolvedColors);
    const widgetColors = resolveWidgetThemeColors(resolvedColors);
    const root = document.documentElement;
    root.style.setProperty("--bg-primary", resolvedColors.primary);
    root.style.setProperty("--bg-secondary", resolvedColors.secondary);
    root.style.setProperty("--bg-tertiary", resolvedColors.tertiary);
    root.style.setProperty("--bg-quaternary", resolvedColors.quaternary);
    root.style.setProperty("--accent-color", resolvedColors.accent);
    root.style.setProperty("--accent-color-rgb", toRgbChannels(resolvedColors.accent));
    root.style.setProperty("--text-color", resolvedColors.text);
    root.style.setProperty("--muted-text-color", resolvedColors.mutedText);
    root.style.setProperty("--border-color", resolvedColors.border);
    root.style.setProperty("--delete-btn", resolvedColors.delete);
    root.style.setProperty("--delete-hover", resolvedColors.deleteHover);
    root.style.setProperty("--project-level-1", resolvedColors.projectLevel1);
    root.style.setProperty("--project-level-2", resolvedColors.projectLevel2);
    root.style.setProperty("--project-level-3", resolvedColors.projectLevel3);
    root.style.setProperty("--panel-bg", resolvedColors.panel);
    root.style.setProperty("--panel-strong-bg", resolvedColors.panelStrong);
    root.style.setProperty("--panel-border-color", resolvedColors.panelBorder);
    root.style.setProperty("--button-bg", resolvedColors.buttonBg);
    root.style.setProperty("--button-bg-hover", resolvedColors.buttonBgHover);
    root.style.setProperty("--button-text", resolvedColors.buttonText);
    root.style.setProperty("--button-border", resolvedColors.buttonBorder);
    root.style.setProperty("--on-accent-text", resolvedColors.onAccentText);
    root.style.setProperty("--bottom-nav-bg", resolvedColors.navBarBg);
    root.style.setProperty("--bottom-nav-button-bg", resolvedColors.navButtonBg);
    root.style.setProperty(
      "--bottom-nav-button-active-bg",
      resolvedColors.navButtonActiveBg,
    );
    root.style.setProperty(
      "--bottom-nav-active-text",
      resolvedColors.navButtonActiveText,
    );
    root.style.setProperty("--overlay-bg", resolvedColors.overlay);
    root.style.setProperty(
      "--record-card-color-mode",
      resolvedRecordCard.mode === "theme" ? "theme" : "project",
    );
    root.style.setProperty("--record-card-theme-color", resolvedRecordCard.color);
    root.style.setProperty("--widget-surface-reference", widgetColors.surfaceReference);
    root.style.setProperty("--widget-window-surface", widgetColors.windowSurface);
    root.style.setProperty("--widget-window-glow", widgetColors.windowGlow);
    root.style.setProperty("--widget-control-bg", widgetColors.controlBg);
    root.style.setProperty("--widget-control-border", widgetColors.controlBorder);
    root.style.setProperty("--widget-control-text", widgetColors.controlText);
    root.style.setProperty("--widget-card-bg", widgetColors.cardBg);
    root.style.setProperty("--widget-card-border", widgetColors.cardBorder);
    root.style.setProperty("--widget-card-shadow", widgetColors.cardShadow);
    root.style.setProperty("--widget-card-gloss-start", widgetColors.cardGlossStart);
    root.style.setProperty("--widget-subtle-surface", widgetColors.subtleSurface);
    root.style.setProperty(
      "--widget-subtle-surface-strong",
      widgetColors.subtleSurfaceStrong,
    );
    root.style.setProperty("--widget-subtle-border", widgetColors.subtleBorder);
    root.style.setProperty("--widget-track-bg", widgetColors.trackBg);
    root.style.setProperty("--widget-track-border", widgetColors.trackBorder);
    root.style.setProperty("--widget-grid-color", widgetColors.gridColor);
    root.style.setProperty(
      "--widget-placeholder-color",
      widgetColors.placeholderColor,
    );
    root.style.setProperty("--widget-chart-track-bg", widgetColors.chartTrackBg);
    root.style.setProperty("--widget-pie-center-bg", widgetColors.pieCenterBg);
    root.style.setProperty("--widget-badge-bg", widgetColors.badgeBg);
    root.style.setProperty("--widget-badge-text", widgetColors.badgeText);
    root.style.setProperty("--widget-action-muted-bg", widgetColors.actionMutedBg);
    root.style.setProperty(
      "--widget-action-muted-border",
      widgetColors.actionMutedBorder,
    );
    root.style.setProperty(
      "--widget-action-muted-text",
      widgetColors.actionMutedText,
    );
    root.style.setProperty(
      "--widget-accent-action-bg",
      widgetColors.accentActionBg,
    );
    root.style.setProperty(
      "--widget-accent-action-border",
      widgetColors.accentActionBorder,
    );
    root.style.setProperty(
      "--widget-accent-action-text",
      widgetColors.accentActionText,
    );
    root.style.setProperty("--widget-goal-annual-bg", widgetColors.goalAnnualBg);
    root.style.setProperty(
      "--widget-goal-annual-accent",
      widgetColors.goalAnnualAccent,
    );
    root.style.setProperty("--widget-goal-month-bg", widgetColors.goalMonthBg);
    root.style.setProperty(
      "--widget-goal-month-accent",
      widgetColors.goalMonthAccent,
    );
    root.style.setProperty(
      "--widget-color-chip-outline",
      widgetColors.colorChipOutline,
    );
    syncDocumentThemeSurface(resolvedColors);
    return {
      resolvedColors,
      resolvedRecordCard,
    };
  }

  function dispatchThemeApplied(themeId, colors, options = {}) {
    const emitNative = options?.emitNative !== false;
    const activeTheme =
      options?.activeTheme && typeof options.activeTheme === "object"
        ? options.activeTheme
        : null;
    const recordCard = resolveThemeRecordCard(activeTheme, colors);
    window.dispatchEvent(
      new CustomEvent(THEME_APPLIED_EVENT_NAME, {
        detail: {
          themeId,
          colors: { ...colors },
          recordCard: { ...recordCard },
        },
      }),
    );
    if (!emitNative) {
      return;
    }
    try {
      const builtInThemeOverrides = loadBuiltInThemeOverrides();
      const rawCustomThemes = readJsonStorage(CUSTOM_THEMES_STORAGE_KEY, []);
      const matchedCustomTheme = Array.isArray(rawCustomThemes)
        ? normalizeCustomTheme(
            rawCustomThemes.find((theme) => theme?.id === themeId) || null,
          )
        : null;
      const selectedOverride = builtInThemeOverrides[themeId];
      window.ControlerNativeBridge?.emitEvent?.("ui.theme-applied", {
        href: window.location.href,
        themeId,
        selectedTheme: themeId || DEFAULT_THEME_ID,
        customThemes: matchedCustomTheme ? [matchedCustomTheme] : [],
        builtInThemeOverrides: selectedOverride
          ? {
              [themeId]: {
                name: selectedOverride.name,
                colors: selectedOverride.colors,
                recordCard: selectedOverride.recordCard,
              },
            }
          : {},
        colors: { ...colors },
        recordCard: { ...recordCard },
      });
      const launchThemeState = {
        selectedTheme: themeId || DEFAULT_THEME_ID,
        customThemes: matchedCustomTheme ? [matchedCustomTheme] : [],
        builtInThemeOverrides: selectedOverride
          ? {
              [themeId]: {
                name: selectedOverride.name,
                colors: selectedOverride.colors,
                recordCard: selectedOverride.recordCard,
              },
            }
          : {},
      };
      const nextLaunchThemeSyncSignature = JSON.stringify(launchThemeState);
      window.ControlerNativeBridge?.emitEvent?.("ui.debug-launch-theme-sync", {
        href: window.location.href,
        themeId,
        selectedTheme: themeId || DEFAULT_THEME_ID,
        customThemeCount: matchedCustomTheme ? 1 : 0,
        builtInOverrideCount: selectedOverride ? 1 : 0,
        signatureChanged:
          nextLaunchThemeSyncSignature !== lastLaunchThemeSyncSignature,
      });
      if (nextLaunchThemeSyncSignature !== lastLaunchThemeSyncSignature) {
        lastLaunchThemeSyncSignature = nextLaunchThemeSyncSignature;
        void window.ControlerNativeBridge?.call?.("ui.setLaunchThemeState", {
          themeState: launchThemeState,
        }).catch?.(() => {});
      }
    } catch (_error) {}
  }

  function resolveActiveThemeState(storageEntries = null) {
    const selectedThemeEntry =
      storageEntries?.selectedTheme || readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry =
      storageEntries?.customThemes || readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry =
      storageEntries?.builtInThemeOverrides ||
      readStorageEntry(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY);
    const storedTheme =
      typeof selectedThemeEntry.rawValue === "string" && selectedThemeEntry.rawValue.trim()
        ? selectedThemeEntry.rawValue.trim()
        : DEFAULT_THEME_ID;
    const builtInThemeOverrides = loadBuiltInThemeOverrides();
    const rawCustomThemes = readJsonStorage(CUSTOM_THEMES_STORAGE_KEY, []);
    const customTheme = Array.isArray(rawCustomThemes)
      ? normalizeCustomTheme(
          rawCustomThemes.find((theme) => theme?.id === storedTheme) || null,
        )
      : null;
    const baseBuiltInTheme = builtInThemeMap.get(storedTheme) || null;
    const mergedBuiltInTheme = baseBuiltInTheme
      ? {
          ...baseBuiltInTheme,
          name: builtInThemeOverrides[storedTheme]?.name || baseBuiltInTheme.name,
          colors: resolveThemeColors(
            builtInThemeOverrides[storedTheme]
              ? {
                  ...baseBuiltInTheme,
                  colors: {
                    ...baseBuiltInTheme.colors,
                    ...builtInThemeOverrides[storedTheme].colors,
                  },
                }
              : baseBuiltInTheme,
          ),
          recordCard: resolveThemeRecordCard(
            {
              ...baseBuiltInTheme,
              recordCard: {
                ...(baseBuiltInTheme.recordCard || {}),
                ...(builtInThemeOverrides[storedTheme]?.recordCard || {}),
              },
            },
          ),
        }
      : null;
    const activeTheme =
      customTheme ||
      mergedBuiltInTheme ||
      builtInThemeMap.get(storedTheme) ||
      builtInThemeMap.get(DEFAULT_THEME_ID) ||
      builtInThemeMap.get("default");
    const themeId = activeTheme?.id || DEFAULT_THEME_ID;

    return {
      activeTheme,
      themeId,
      source:
        selectedThemeEntry.usedLocalMirror ||
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

  function resolveThemeStateFromBridgeDetail(detail = {}) {
    const selectedTheme =
      typeof detail.selectedTheme === "string" && detail.selectedTheme.trim()
        ? detail.selectedTheme.trim()
        : DEFAULT_THEME_ID;
    const customThemes = Array.isArray(detail.customThemes)
      ? detail.customThemes
          .map((theme) => normalizeCustomTheme(theme))
          .filter(Boolean)
      : [];
    const builtInThemeOverrides = isPlainObject(detail.builtInThemeOverrides)
      ? detail.builtInThemeOverrides
      : {};

    const matchedCustomTheme =
      customThemes.find((theme) => theme?.id === selectedTheme) || null;
    const normalizedBuiltInOverride = normalizeBuiltInThemeOverride(
      selectedTheme,
      builtInThemeOverrides[selectedTheme],
    );
    const fallbackTheme =
      builtInThemeMap.get(DEFAULT_THEME_ID) || builtInThemeMap.get("default");
    const activeTheme =
      matchedCustomTheme ||
      normalizedBuiltInOverride ||
      builtInThemeMap.get(selectedTheme) ||
      fallbackTheme;
    const themeId = activeTheme?.id || DEFAULT_THEME_ID;

    return {
      themeId,
      activeTheme,
      customThemes: matchedCustomTheme ? [matchedCustomTheme] : [],
      builtInThemeOverrides: normalizedBuiltInOverride
        ? {
            [themeId]: {
              name: normalizedBuiltInOverride.name,
              colors: normalizedBuiltInOverride.colors,
              recordCard: normalizedBuiltInOverride.recordCard,
            },
          }
        : {},
    };
  }

  function applyThemeState(themeId, activeTheme, options = {}) {
    document.documentElement.setAttribute("data-theme", themeId);
    const { resolvedColors, resolvedRecordCard } = applyThemeColors(activeTheme);
    document.documentElement.style.colorScheme = isLightTheme(activeTheme)
      ? "light"
      : "dark";
    persistThemeWindowNameState(themeId, resolvedColors, resolvedRecordCard);
    dispatchThemeApplied(themeId, resolvedColors, {
      ...options,
      activeTheme,
    });
    const preloadedThemeId =
      typeof window.__CONTROLER_DESKTOP_PRELOADED_THEME__?.themeId === "string"
        ? window.__CONTROLER_DESKTOP_PRELOADED_THEME__.themeId
        : "";
    const debugSignature = [
      themeId,
      resolvedColors.primary,
      resolvedColors.text,
      preloadedThemeId,
    ].join("|");
    if (debugSignature !== lastDesktopThemeDebugApplySignature) {
      lastDesktopThemeDebugApplySignature = debugSignature;
      appendDesktopThemeDebugLog("applied", {
        themeId,
        primaryColor: resolvedColors.primary,
        textColor: resolvedColors.text,
        preloadedThemeId,
        matchesPreload: !!preloadedThemeId && preloadedThemeId === themeId,
        emitNative: options?.emitNative !== false,
      });
    }

    if (
      (localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || DEFAULT_THEME_ID) !== themeId
    ) {
      localStorage.setItem(SELECTED_THEME_STORAGE_KEY, themeId);
    }
  }

  function applyThemeFromStorage(options = {}) {
    try {
      const storageEntries = {
        selectedTheme: readStorageEntry(SELECTED_THEME_STORAGE_KEY),
        customThemes: readStorageEntry(CUSTOM_THEMES_STORAGE_KEY),
        builtInThemeOverrides: readStorageEntry(
          BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
        ),
      };
      const nextSignature = buildThemeStorageSignature(storageEntries);
      if (nextSignature === lastThemeStorageSignature) {
        return;
      }

      const resolvedThemeState = resolveActiveThemeState(storageEntries);
      const activeTheme = resolvedThemeState.activeTheme;
      const themeId = resolvedThemeState.themeId;
      lastThemeStorageSignature = nextSignature;
      appendDesktopThemeDebugLog("apply-from-storage", {
        themeId,
        source: resolvedThemeState.source,
        preloadedThemeId:
          typeof window.__CONTROLER_DESKTOP_PRELOADED_THEME__?.themeId === "string"
            ? window.__CONTROLER_DESKTOP_PRELOADED_THEME__.themeId
            : "",
        storageKeys:
          resolvedThemeState.storageKeys &&
          typeof resolvedThemeState.storageKeys === "object"
            ? resolvedThemeState.storageKeys
            : {},
      });
      applyThemeState(themeId, activeTheme, options);
    } catch (error) {
      lastThemeStorageSignature = "__fallback__";
      const fallbackTheme =
        builtInThemeMap.get(DEFAULT_THEME_ID) || builtInThemeMap.get("default");
      appendDesktopThemeDebugLog("apply-from-storage-fallback", {
        message: error instanceof Error ? error.message : String(error || ""),
      });
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME_ID);
      applyThemeColors(fallbackTheme);
      document.documentElement.style.colorScheme = "dark";
      dispatchThemeApplied(
        DEFAULT_THEME_ID,
        resolveThemeColors(fallbackTheme),
        options,
      );
    }
  }

  function syncThemeStateFromBridge(detail = {}) {
    if (!isPlainObject(detail)) {
      return;
    }
    const resolvedThemeState = resolveThemeStateFromBridgeDetail(detail);
    const selectedTheme = resolvedThemeState.themeId || DEFAULT_THEME_ID;
    const customThemes = resolvedThemeState.customThemes;
    const builtInThemeOverrides = resolvedThemeState.builtInThemeOverrides;
    const sharedThemeState = {
      selectedTheme,
      customThemes,
      builtInThemeOverrides,
    };

    try {
      const managedStorage = window.ControlerStorage;
      if (
        managedStorage?.isNativeApp === true &&
        typeof managedStorage.applySharedStateFromBridge === "function"
      ) {
        managedStorage.applySharedStateFromBridge(sharedThemeState);
      } else {
        localStorage.setItem(SELECTED_THEME_STORAGE_KEY, selectedTheme);
        localStorage.setItem(
          CUSTOM_THEMES_STORAGE_KEY,
          JSON.stringify(customThemes),
        );
        localStorage.setItem(
          BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
          JSON.stringify(builtInThemeOverrides),
        );
      }
      lastThemeStorageSignature = buildThemeStorageSignature();
      lastLaunchThemeSyncSignature = null;
      applyThemeState(selectedTheme, resolvedThemeState.activeTheme, {
        emitNative: false,
      });
    } catch (_error) {}
  }

  applyThemeFromStorage();

  window.addEventListener("storage", (event) => {
    if (
      !event ||
      event.key === null ||
      event.key === SELECTED_THEME_STORAGE_KEY ||
      event.key === CUSTOM_THEMES_STORAGE_KEY ||
      event.key === BUILT_IN_THEME_OVERRIDES_STORAGE_KEY ||
      event.key === `${LOCAL_ONLY_STORAGE_PREFIX}${SELECTED_THEME_STORAGE_KEY}` ||
      event.key === `${LOCAL_ONLY_STORAGE_PREFIX}${CUSTOM_THEMES_STORAGE_KEY}` ||
      event.key === `${LOCAL_ONLY_STORAGE_PREFIX}${BUILT_IN_THEME_OVERRIDES_STORAGE_KEY}`
    ) {
      applyThemeFromStorage();
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        applyThemeFromStorage();
      }
    });
  }

  window.addEventListener("focus", () => {
    applyThemeFromStorage();
  });
  window.addEventListener("controler:storage-data-changed", () => {
    applyThemeFromStorage();
  });
  window.addEventListener("controler:native-bridge-event", (event) => {
    const detail =
      event?.detail && typeof event.detail === "object" ? event.detail : {};
    if (detail.name !== "ui.theme-sync") {
      return;
    }
    syncThemeStateFromBridge(detail);
  });

  try {
    if (!document.documentElement.getAttribute("data-theme")) {
      applyThemeFromStorage();
    }
  } catch (error) {
    const fallbackTheme =
      builtInThemeMap.get(DEFAULT_THEME_ID) || builtInThemeMap.get("default");
    document.documentElement.setAttribute("data-theme", DEFAULT_THEME_ID);
    applyThemeColors(fallbackTheme);
    document.documentElement.style.colorScheme = "dark";
    dispatchThemeApplied(DEFAULT_THEME_ID, resolveThemeColors(fallbackTheme));
  }

  window.ControlerTheme = {
    themeAppliedEventName: THEME_APPLIED_EVENT_NAME,
    ensureReadableShapeColor,
    resolveThemeRecordCard,
    syncDocumentThemeSurface,
    getReadableTextColorForBackground(
      backgroundColor,
      preferredTextColor = "",
      minContrast = 4.2,
    ) {
      return ensureReadableTextColor(
        backgroundColor,
        preferredTextColor,
        "#17212B",
        "#F7FAFF",
        minContrast,
      );
    },
    resolveWidgetThemeColors,
  };
})();
