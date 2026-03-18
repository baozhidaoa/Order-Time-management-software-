(() => {
  const SELECTED_THEME_STORAGE_KEY = "selectedTheme";
  const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
  const BUILT_IN_THEME_OVERRIDES_STORAGE_KEY = "builtInThemeOverrides";
  const THEME_APPLIED_EVENT_NAME = "controler:theme-applied";
  const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
  const RGB_COLOR_PATTERN =
    /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

  const DEFAULT_THEME_COLORS = {
    primary: "#1f2f28",
    secondary: "rgba(53, 96, 71, 0.42)",
    tertiary: "rgba(83, 132, 101, 0.5)",
    quaternary: "rgba(121, 175, 133, 0.2)",
    accent: "#8ed6a4",
    text: "#f5fff8",
    mutedText: "rgba(245, 255, 248, 0.72)",
    border: "#6ea283",
    delete: "#ff7e7e",
    deleteHover: "#ff6464",
    projectLevel1: "#79af85",
    projectLevel2: "#5a7f68",
    projectLevel3: "#3a5d48",
    panel: "rgba(24, 41, 33, 0.62)",
    panelStrong: "rgba(31, 53, 42, 0.74)",
    panelBorder: "rgba(142, 214, 164, 0.28)",
    buttonBg: "#8ed6a4",
    buttonBgHover: "#9ee2b3",
    buttonText: "#173326",
    buttonBorder: "rgba(142, 214, 164, 0.42)",
    onAccentText: "#173326",
    navBarBg: "rgba(17, 29, 23, 0.84)",
    navButtonBg: "rgba(142, 214, 164, 0.12)",
    navButtonActiveBg: "rgba(135, 196, 153, 0.86)",
    overlay: "rgba(8, 10, 12, 0.45)",
  };

  function buildThemeDefinition(id, name, colorOverrides = {}) {
    return {
      id,
      name,
      colors: {
        ...DEFAULT_THEME_COLORS,
        ...colorOverrides,
      },
    };
  }

  const BUILT_IN_THEMES = [
    buildThemeDefinition("default", "森林磨砂"),
    buildThemeDefinition("blue-ocean", "海蓝磨砂", {
      primary: "#12263f",
      secondary: "rgba(33, 63, 96, 0.46)",
      tertiary: "rgba(57, 101, 151, 0.52)",
      quaternary: "rgba(94, 163, 230, 0.22)",
      accent: "#7ec6ff",
      text: "#eef6ff",
      mutedText: "rgba(238, 246, 255, 0.72)",
      border: "#6d7ba4",
      delete: "#ff8a8a",
      deleteHover: "#ff6f6f",
      projectLevel1: "#63b3ed",
      projectLevel2: "#4299e1",
      projectLevel3: "#2c5282",
      panel: "rgba(17, 37, 61, 0.65)",
      panelStrong: "rgba(22, 45, 73, 0.76)",
      panelBorder: "rgba(126, 198, 255, 0.28)",
      buttonBg: "#7ec6ff",
      buttonBgHover: "#95d2ff",
      buttonText: "#123052",
      buttonBorder: "rgba(126, 198, 255, 0.48)",
      onAccentText: "#123052",
      navBarBg: "rgba(12, 28, 47, 0.86)",
      navButtonBg: "rgba(126, 198, 255, 0.12)",
      navButtonActiveBg: "rgba(119, 182, 235, 0.84)",
    }),
    buildThemeDefinition("sunset-orange", "落日暖橙", {
      primary: "#4b261b",
      secondary: "rgba(122, 61, 38, 0.48)",
      tertiary: "rgba(163, 88, 47, 0.52)",
      quaternary: "rgba(237, 137, 54, 0.2)",
      accent: "#ffbf78",
      text: "#fff5ea",
      mutedText: "rgba(255, 245, 234, 0.74)",
      border: "#bdb38b",
      delete: "#ff9a9a",
      deleteHover: "#ff7d7d",
      projectLevel1: "#f6ad55",
      projectLevel2: "#ed8936",
      projectLevel3: "#c05621",
      panel: "rgba(70, 37, 26, 0.68)",
      panelStrong: "rgba(88, 46, 31, 0.76)",
      panelBorder: "rgba(255, 191, 120, 0.3)",
      buttonBg: "#ffc78a",
      buttonBgHover: "#ffd3a5",
      buttonText: "#522a1c",
      buttonBorder: "rgba(255, 191, 120, 0.48)",
      onAccentText: "#522a1c",
      navBarBg: "rgba(55, 29, 21, 0.86)",
      navButtonBg: "rgba(255, 191, 120, 0.14)",
      navButtonActiveBg: "rgba(243, 181, 112, 0.88)",
    }),
    buildThemeDefinition("minimal-gray", "中性磨砂灰", {
      primary: "#1f252e",
      secondary: "rgba(63, 73, 88, 0.45)",
      tertiary: "rgba(91, 105, 126, 0.52)",
      quaternary: "rgba(160, 174, 192, 0.2)",
      accent: "#d1d9e3",
      text: "#f6f8fb",
      mutedText: "rgba(246, 248, 251, 0.72)",
      border: "#bebebe",
      delete: "#ff8383",
      deleteHover: "#ff6464",
      projectLevel1: "#d4dce7",
      projectLevel2: "#a0aec0",
      projectLevel3: "#718096",
      panel: "rgba(33, 39, 49, 0.66)",
      panelStrong: "rgba(40, 47, 58, 0.78)",
      panelBorder: "rgba(209, 217, 227, 0.3)",
      buttonBg: "#d9e1ec",
      buttonBgHover: "#e7edf6",
      buttonText: "#262f3d",
      buttonBorder: "rgba(209, 217, 227, 0.56)",
      onAccentText: "#262f3d",
      navBarBg: "rgba(28, 33, 41, 0.86)",
      navButtonBg: "rgba(209, 217, 227, 0.12)",
      navButtonActiveBg: "rgba(186, 197, 210, 0.84)",
    }),
    buildThemeDefinition("obsidian-mono", "曜石黑", {
      primary: "#0d0f12",
      secondary: "rgba(24, 27, 32, 0.6)",
      tertiary: "rgba(46, 50, 59, 0.56)",
      quaternary: "rgba(106, 113, 128, 0.2)",
      accent: "#f1f4fa",
      text: "#f4f6fb",
      mutedText: "rgba(244, 246, 251, 0.76)",
      border: "rgba(215, 221, 232, 0.32)",
      delete: "#ff7b7b",
      deleteHover: "#ff5f5f",
      projectLevel1: "#d6dde8",
      projectLevel2: "#a2adbd",
      projectLevel3: "#667084",
      panel: "rgba(16, 18, 22, 0.72)",
      panelStrong: "rgba(20, 23, 28, 0.82)",
      panelBorder: "rgba(215, 221, 232, 0.22)",
      buttonBg: "#f1f4fa",
      buttonBgHover: "#ffffff",
      buttonText: "#10141d",
      buttonBorder: "rgba(241, 244, 250, 0.68)",
      onAccentText: "#10141d",
      navBarBg: "rgba(10, 12, 16, 0.9)",
      navButtonBg: "rgba(129, 140, 155, 0.14)",
      navButtonActiveBg: "rgba(72, 79, 92, 0.92)",
    }),
    buildThemeDefinition("ivory-light", "象牙白", {
      primary: "#eceff3",
      secondary: "rgba(255, 255, 255, 0.65)",
      tertiary: "rgba(240, 244, 250, 0.78)",
      quaternary: "rgba(222, 229, 238, 0.65)",
      accent: "#3f495f",
      text: "#202633",
      mutedText: "rgba(32, 38, 51, 0.7)",
      border: "#7b8598",
      delete: "#cf4d4d",
      deleteHover: "#b13d3d",
      projectLevel1: "#8b94a5",
      projectLevel2: "#a2abbb",
      projectLevel3: "#c0c7d3",
      panel: "rgba(255, 255, 255, 0.74)",
      panelStrong: "rgba(249, 252, 255, 0.86)",
      panelBorder: "rgba(110, 122, 143, 0.24)",
      buttonBg: "#3f495f",
      buttonBgHover: "#56607a",
      buttonText: "#f4f7ff",
      buttonBorder: "rgba(63, 73, 95, 0.58)",
      onAccentText: "#f4f7ff",
      navBarBg: "rgba(244, 247, 251, 0.9)",
      navButtonBg: "rgba(63, 73, 95, 0.08)",
      navButtonActiveBg: "rgba(74, 85, 109, 0.88)",
      overlay: "rgba(27, 31, 38, 0.22)",
    }),
    buildThemeDefinition("graphite-mist", "石墨灰", {
      primary: "#2a2d32",
      secondary: "rgba(63, 66, 72, 0.52)",
      tertiary: "rgba(88, 93, 102, 0.56)",
      quaternary: "rgba(149, 156, 168, 0.2)",
      accent: "#f0f3fa",
      text: "#f8f9fc",
      mutedText: "rgba(248, 249, 252, 0.74)",
      border: "rgba(224, 227, 234, 0.34)",
      delete: "#ff8787",
      deleteHover: "#ff6b6b",
      projectLevel1: "#d8dde7",
      projectLevel2: "#aeb5c2",
      projectLevel3: "#808897",
      panel: "rgba(43, 46, 52, 0.66)",
      panelStrong: "rgba(53, 57, 64, 0.78)",
      panelBorder: "rgba(224, 227, 234, 0.26)",
      buttonBg: "#f0f3fa",
      buttonBgHover: "#ffffff",
      buttonText: "#222832",
      buttonBorder: "rgba(240, 243, 250, 0.56)",
      onAccentText: "#222832",
      navBarBg: "rgba(35, 39, 45, 0.88)",
      navButtonBg: "rgba(240, 243, 250, 0.12)",
      navButtonActiveBg: "rgba(124, 134, 149, 0.82)",
    }),
    buildThemeDefinition("aurora-mist", "极光青雾", {
      primary: "#162a2d",
      secondary: "rgba(31, 63, 68, 0.46)",
      tertiary: "rgba(67, 110, 116, 0.52)",
      quaternary: "rgba(120, 171, 176, 0.2)",
      accent: "#8fd3d1",
      text: "#effcfb",
      mutedText: "rgba(239, 252, 251, 0.74)",
      border: "#7ca8aa",
      delete: "#ff8d8d",
      deleteHover: "#ff7070",
      projectLevel1: "#7fc6c3",
      projectLevel2: "#5ea6a4",
      projectLevel3: "#356c70",
      panel: "rgba(20, 39, 42, 0.66)",
      panelStrong: "rgba(26, 49, 52, 0.78)",
      panelBorder: "rgba(143, 211, 209, 0.26)",
      buttonBg: "#96dcda",
      buttonBgHover: "#a9e6e4",
      buttonText: "#133235",
      buttonBorder: "rgba(143, 211, 209, 0.46)",
      onAccentText: "#133235",
      navBarBg: "rgba(15, 32, 35, 0.88)",
      navButtonBg: "rgba(143, 211, 209, 0.12)",
      navButtonActiveBg: "rgba(112, 174, 173, 0.88)",
    }),
    buildThemeDefinition("velvet-bordeaux", "酒红夜幕", {
      primary: "#2f141d",
      secondary: "rgba(83, 29, 44, 0.48)",
      tertiary: "rgba(121, 49, 67, 0.54)",
      quaternary: "rgba(183, 92, 111, 0.18)",
      accent: "#d8a6b8",
      text: "#fff3f6",
      mutedText: "rgba(255, 243, 246, 0.74)",
      border: "#b78898",
      delete: "#ff919b",
      deleteHover: "#ff7784",
      projectLevel1: "#c58da2",
      projectLevel2: "#a6607a",
      projectLevel3: "#6c3348",
      panel: "rgba(43, 20, 29, 0.68)",
      panelStrong: "rgba(57, 26, 37, 0.8)",
      panelBorder: "rgba(216, 166, 184, 0.26)",
      buttonBg: "#e2b0c2",
      buttonBgHover: "#ebc1cf",
      buttonText: "#421d2a",
      buttonBorder: "rgba(216, 166, 184, 0.46)",
      onAccentText: "#421d2a",
      navBarBg: "rgba(38, 16, 25, 0.9)",
      navButtonBg: "rgba(216, 166, 184, 0.12)",
      navButtonActiveBg: "rgba(142, 77, 99, 0.88)",
    }),
    buildThemeDefinition("champagne-sandstone", "香槟砂岩", {
      primary: "#f1ebe2",
      secondary: "rgba(255, 250, 243, 0.7)",
      tertiary: "rgba(234, 222, 205, 0.82)",
      quaternary: "rgba(220, 203, 181, 0.62)",
      accent: "#8b6f57",
      text: "#2f261f",
      mutedText: "rgba(47, 38, 31, 0.68)",
      border: "#b59f8c",
      delete: "#c85656",
      deleteHover: "#ad4343",
      projectLevel1: "#bca087",
      projectLevel2: "#cfb59a",
      projectLevel3: "#e0d0bf",
      panel: "rgba(255, 251, 246, 0.78)",
      panelStrong: "rgba(250, 245, 239, 0.9)",
      panelBorder: "rgba(143, 119, 95, 0.22)",
      buttonBg: "#8b6f57",
      buttonBgHover: "#a28267",
      buttonText: "#f8f3ec",
      buttonBorder: "rgba(139, 111, 87, 0.44)",
      onAccentText: "#f8f3ec",
      navBarBg: "rgba(248, 241, 232, 0.92)",
      navButtonBg: "rgba(139, 111, 87, 0.08)",
      navButtonActiveBg: "rgba(145, 118, 92, 0.88)",
      overlay: "rgba(40, 34, 28, 0.18)",
    }),
    buildThemeDefinition("midnight-indigo", "深海靛影", {
      primary: "#111a35",
      secondary: "rgba(26, 39, 76, 0.48)",
      tertiary: "rgba(51, 70, 124, 0.54)",
      quaternary: "rgba(105, 130, 208, 0.18)",
      accent: "#9cb8ff",
      text: "#eef3ff",
      mutedText: "rgba(238, 243, 255, 0.74)",
      border: "#7d91c9",
      delete: "#ff8d9a",
      deleteHover: "#ff717f",
      projectLevel1: "#86a2eb",
      projectLevel2: "#617bc5",
      projectLevel3: "#334678",
      panel: "rgba(16, 26, 52, 0.68)",
      panelStrong: "rgba(21, 33, 64, 0.8)",
      panelBorder: "rgba(156, 184, 255, 0.28)",
      buttonBg: "#9cb8ff",
      buttonBgHover: "#b0c6ff",
      buttonText: "#162447",
      buttonBorder: "rgba(156, 184, 255, 0.46)",
      onAccentText: "#162447",
      navBarBg: "rgba(12, 20, 43, 0.88)",
      navButtonBg: "rgba(156, 184, 255, 0.12)",
      navButtonActiveBg: "rgba(91, 114, 186, 0.9)",
    }),
  ];

  const builtInThemeMap = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));
  const lightThemeIds = new Set(["ivory-light"]);
  let lastThemeStorageSignature = null;

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

    return {
      surfaceReference,
      windowGlow: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      controlBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.14),
      controlBorder: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.18),
      controlText: ensureReadableTextColor(
        surfaceReference,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      cardBg: toRgbaColor(
        mixThemeColors(surfaceReference, resolvedColors.primary, 0.12),
        isLightSurface ? 0.92 : 0.88,
      ),
      cardBorder: toRgbaColor(
        mixThemeColors(
          contrastReference,
          firstNonEmpty(resolvedColors.panelBorder, resolvedColors.border, accentBase),
          0.36,
        ),
        isLightSurface ? 0.3 : 0.26,
      ),
      cardShadow: toRgbaColor(
        isLightSurface ? "#556274" : "#02060A",
        isLightSurface ? 0.14 : 0.24,
      ),
      cardGlossStart: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      subtleSurface: toRgbaColor(contrastReference, isLightSurface ? 0.05 : 0.08),
      subtleSurfaceStrong: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.08 : 0.12,
      ),
      subtleBorder: toRgbaColor(contrastReference, isLightSurface ? 0.14 : 0.16),
      trackBg: toRgbaColor(contrastReference, isLightSurface ? 0.06 : 0.08),
      trackBorder: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.14),
      gridColor: toRgbaColor(contrastReference, isLightSurface ? 0.1 : 0.16),
      placeholderColor: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.22 : 0.28,
      ),
      chartTrackBg: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.14),
      pieCenterBg: toRgbaColor(
        mixThemeColors(surfaceReference, resolvedColors.primary, 0.18),
        isLightSurface ? 0.96 : 0.92,
      ),
      badgeBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.12),
      badgeText: resolvedColors.mutedText,
      actionMutedBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.14),
      actionMutedBorder: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.14 : 0.18,
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
        isLightSurface ? 0.38 : 0.32,
      ),
      accentActionText: ensureReadableTextColor(
        accentActionBg,
        firstNonEmpty(resolvedColors.buttonText, resolvedColors.onAccentText),
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
      goalAnnualBg: toRgbaColor(accentBase, isLightSurface ? 0.18 : 0.16),
      goalAnnualAccent: accentBase,
      goalMonthBg: toRgbaColor(contrastReference, isLightSurface ? 0.08 : 0.12),
      goalMonthAccent: toRgbaColor(contrastReference, isLightSurface ? 0.18 : 0.2),
      colorChipOutline: toRgbaColor(contrastReference, isLightSurface ? 0.16 : 0.18),
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
        : isLightSurface
          ? "rgba(27, 31, 38, 0.22)"
          : DEFAULT_THEME_COLORS.overlay,
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

    return {
      id: themeId,
      name:
        typeof override?.name === "string" && override.name.trim()
          ? override.name.trim()
          : baseTheme.name,
      colors: resolveThemeColors({
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          ...(override?.colors || {}),
        },
      }),
    };
  }

  function loadBuiltInThemeOverrides() {
    try {
      const raw = JSON.parse(
        localStorage.getItem(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY) || "{}",
      );
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

    return {
      id: typeof theme.id === "string" ? theme.id : "",
      name: typeof theme.name === "string" ? theme.name : "",
      colors: resolveThemeColors(theme),
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
    root.style.setProperty("--widget-surface-reference", widgetColors.surfaceReference);
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
  }

  function dispatchThemeApplied(themeId, colors) {
    window.dispatchEvent(
      new CustomEvent(THEME_APPLIED_EVENT_NAME, {
        detail: {
          themeId,
          colors: { ...colors },
        },
      }),
    );
  }

  function resolveActiveThemeState() {
    const storedTheme = localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "default";
    const builtInThemeOverrides = loadBuiltInThemeOverrides();
    const rawCustomThemes = JSON.parse(
      localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || "[]",
    );
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
        }
      : null;

    const activeTheme =
      customTheme || mergedBuiltInTheme || builtInThemeMap.get("default");
    const themeId = activeTheme?.id || "default";

    return {
      activeTheme,
      themeId,
    };
  }

  function applyThemeState(themeId, activeTheme) {
    document.documentElement.setAttribute("data-theme", themeId);
    applyThemeColors(activeTheme);
    document.documentElement.style.colorScheme = isLightTheme(activeTheme)
      ? "light"
      : "dark";
    dispatchThemeApplied(themeId, resolveThemeColors(activeTheme));

    if (
      (localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "default") !== themeId
    ) {
      localStorage.setItem(SELECTED_THEME_STORAGE_KEY, themeId);
    }
  }

  function applyThemeFromStorage() {
    try {
      const nextSignature = [
        localStorage.getItem(SELECTED_THEME_STORAGE_KEY) || "",
        localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || "",
        localStorage.getItem(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY) || "",
      ].join("\u0001");
      if (nextSignature === lastThemeStorageSignature) {
        return;
      }

      const { activeTheme, themeId } = resolveActiveThemeState();
      lastThemeStorageSignature = nextSignature;
      applyThemeState(themeId, activeTheme);
    } catch (error) {
      lastThemeStorageSignature = "__fallback__";
      const fallbackTheme = builtInThemeMap.get("default");
      document.documentElement.setAttribute("data-theme", "default");
      applyThemeColors(fallbackTheme);
      document.documentElement.style.colorScheme = "dark";
      dispatchThemeApplied("default", resolveThemeColors(fallbackTheme));
    }
  }

  applyThemeFromStorage();

  window.addEventListener("storage", (event) => {
    if (
      !event ||
      event.key === null ||
      event.key === SELECTED_THEME_STORAGE_KEY ||
      event.key === CUSTOM_THEMES_STORAGE_KEY ||
      event.key === BUILT_IN_THEME_OVERRIDES_STORAGE_KEY
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

  try {
    if (!document.documentElement.getAttribute("data-theme")) {
      applyThemeFromStorage();
    }
  } catch (error) {
    const fallbackTheme = builtInThemeMap.get("default");
    document.documentElement.setAttribute("data-theme", "default");
    applyThemeColors(fallbackTheme);
    document.documentElement.style.colorScheme = "dark";
    dispatchThemeApplied("default", resolveThemeColors(fallbackTheme));
  }

  window.ControlerTheme = {
    themeAppliedEventName: THEME_APPLIED_EVENT_NAME,
    ensureReadableShapeColor,
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
