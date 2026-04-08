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
  const AUTO_DERIVED_THEME_COLOR_KEYS = Object.freeze([
    "navBarBorder",
    "navButtonText",
    "navButtonActiveText",
  ]);
  const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;
  const RGB_COLOR_PATTERN =
    /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

  function normalizeThemeColorInputValue(color) {
    return String(color ?? "")
      .replace(/\u00A0/g, " ")
      .replace(/[，]/g, ",")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[；]+$/g, "")
      .trim();
  }

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
    navBarBorder: "",
    navButtonBg: "rgba(111, 208, 141, 0.08)",
    navButtonText: "",
    navButtonActiveBg: "rgba(98, 189, 125, 0.88)",
    navButtonActiveText: "",
    overlay: "rgba(8, 10, 12, 0.45)",
    widgetCardBg: "",
    widgetItemBg: "",
    widgetText: "",
    widgetButtonBg: "",
    widgetButtonText: "",
  };
  const DEFAULT_THEME_RECORD_CARD = {
    mode: "project",
    color: "#72c28a",
    projectOpacity: 100,
    themeOpacity: 100,
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
    buildThemeDefinition("graphite-mist", "钛雾灰", {
      primary: "#121820",
      secondary: "rgba(23, 30, 39, 0.58)",
      tertiary: "rgba(37, 46, 58, 0.72)",
      quaternary: "rgba(171, 185, 204, 0.11)",
      accent: "#c8d3df",
      text: "#f5f7fb",
      mutedText: "rgba(236, 241, 248, 0.72)",
      border: "rgba(186, 198, 214, 0.24)",
      delete: "#ff8686",
      deleteHover: "#ff6868",
      projectLevel1: "#bec9d7",
      projectLevel2: "#8093a8",
      projectLevel3: "#4a5d74",
      panel: "rgba(22, 29, 38, 0.88)",
      panelStrong: "rgba(29, 37, 48, 0.96)",
      panelBorder: "rgba(186, 198, 214, 0.16)",
      buttonBg: "#d5dee8",
      buttonBgHover: "#e2e9f1",
      buttonText: "#141a22",
      buttonBorder: "rgba(200, 211, 224, 0.54)",
      onAccentText: "#141a22",
      navBarBg: "rgba(13, 17, 23, 0.94)",
      navButtonBg: "rgba(186, 198, 214, 0.06)",
      navButtonActiveBg: "rgba(63, 77, 96, 0.92)",
      overlay: "rgba(6, 9, 13, 0.5)",
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
    buildThemeDefinition("porcelain-mist", "月霁蓝", {
      primary: "#e8eff7",
      secondary: "rgba(255, 255, 255, 0.78)",
      tertiary: "rgba(235, 241, 250, 0.88)",
      quaternary: "rgba(78, 109, 141, 0.08)",
      accent: "#4e6d8d",
      text: "#1d2a38",
      mutedText: "rgba(29, 42, 56, 0.68)",
      border: "#869db7",
      delete: "#c95a5a",
      deleteHover: "#af4949",
      projectLevel1: "#768fa8",
      projectLevel2: "#97adc1",
      projectLevel3: "#c6d3e0",
      panel: "rgba(255, 255, 255, 0.9)",
      panelStrong: "rgba(250, 252, 255, 0.97)",
      panelBorder: "rgba(94, 117, 145, 0.14)",
      buttonBg: "#4e6d8d",
      buttonBgHover: "#6182a4",
      buttonText: "#f7fbff",
      buttonBorder: "rgba(78, 109, 141, 0.48)",
      onAccentText: "#f7fbff",
      navBarBg: "rgba(244, 249, 255, 0.95)",
      navButtonBg: "rgba(78, 109, 141, 0.06)",
      navButtonActiveBg: "rgba(88, 121, 156, 0.88)",
      overlay: "rgba(20, 31, 43, 0.17)",
    }),
    buildThemeDefinition("sage-cashmere", "鼠尾草绒", {
      primary: "#edf1ec",
      secondary: "rgba(255, 255, 255, 0.74)",
      tertiary: "rgba(237, 242, 236, 0.84)",
      quaternary: "rgba(95, 111, 100, 0.08)",
      accent: "#5f6f64",
      text: "#243028",
      mutedText: "rgba(36, 48, 40, 0.68)",
      border: "#94a296",
      delete: "#c95c60",
      deleteHover: "#ae4a4f",
      projectLevel1: "#7f9184",
      projectLevel2: "#9bad9f",
      projectLevel3: "#c7d2c9",
      panel: "rgba(255, 255, 255, 0.88)",
      panelStrong: "rgba(249, 252, 248, 0.96)",
      panelBorder: "rgba(103, 119, 109, 0.14)",
      buttonBg: "#5f6f64",
      buttonBgHover: "#73857a",
      buttonText: "#f4f7f3",
      buttonBorder: "rgba(95, 111, 100, 0.46)",
      onAccentText: "#f4f7f3",
      navBarBg: "rgba(246, 249, 245, 0.93)",
      navButtonBg: "rgba(95, 111, 100, 0.06)",
      navButtonActiveBg: "rgba(105, 123, 111, 0.88)",
      overlay: "rgba(25, 32, 27, 0.17)",
    }),
    buildThemeDefinition("oyster-linen", "鸢尾霜绫", {
      primary: "#f1eef6",
      secondary: "rgba(255, 252, 255, 0.76)",
      tertiary: "rgba(241, 236, 247, 0.86)",
      quaternary: "rgba(109, 97, 125, 0.07)",
      accent: "#6d617d",
      text: "#2c2733",
      mutedText: "rgba(44, 39, 51, 0.68)",
      border: "#a89db7",
      delete: "#c55a63",
      deleteHover: "#aa4752",
      projectLevel1: "#9a8da9",
      projectLevel2: "#b6abc3",
      projectLevel3: "#d8d1e2",
      panel: "rgba(255, 252, 255, 0.9)",
      panelStrong: "rgba(250, 247, 252, 0.97)",
      panelBorder: "rgba(113, 101, 130, 0.14)",
      buttonBg: "#6d617d",
      buttonBgHover: "#827492",
      buttonText: "#f9f6fb",
      buttonBorder: "rgba(109, 97, 125, 0.46)",
      onAccentText: "#f9f6fb",
      navBarBg: "rgba(247, 243, 249, 0.94)",
      navButtonBg: "rgba(109, 97, 125, 0.06)",
      navButtonActiveBg: "rgba(124, 111, 141, 0.88)",
      overlay: "rgba(29, 24, 36, 0.17)",
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

  const THEME_FIELD_SECTIONS = Object.freeze([
    Object.freeze({
      id: "base-app",
      group: "base",
      title: "应用",
      fields: Object.freeze([
        Object.freeze({ key: "primary", label: "应用背景" }),
        Object.freeze({ key: "secondary", label: "应用外壳底层" }),
        Object.freeze({ key: "tertiary", label: "控件底色" }),
        Object.freeze({ key: "quaternary", label: "轻强调铺底" }),
      ]),
    }),
    Object.freeze({
      id: "base-content",
      group: "base",
      title: "内容",
      fields: Object.freeze([
        Object.freeze({ key: "panel", label: "页面内容底色" }),
        Object.freeze({ key: "panelStrong", label: "强调内容底色" }),
        Object.freeze({ key: "accent", label: "强调色" }),
      ]),
    }),
    Object.freeze({
      id: "base-text",
      group: "base",
      title: "文本",
      fields: Object.freeze([
        Object.freeze({ key: "text", label: "主要文字" }),
        Object.freeze({ key: "mutedText", label: "次级文字" }),
        Object.freeze({ key: "onAccentText", label: "强调底文字" }),
      ]),
    }),
    Object.freeze({
      id: "base-border",
      group: "base",
      title: "描边",
      fields: Object.freeze([
        Object.freeze({ key: "border", label: "通用描边" }),
        Object.freeze({ key: "panelBorder", label: "细分隔线" }),
      ]),
    }),
    Object.freeze({
      id: "advanced-button",
      group: "advanced",
      title: "按钮",
      fields: Object.freeze([
        Object.freeze({ key: "buttonBg", label: "主按钮底色" }),
        Object.freeze({ key: "buttonBgHover", label: "主按钮悬停底色" }),
        Object.freeze({ key: "buttonText", label: "主按钮文字" }),
        Object.freeze({ key: "buttonBorder", label: "主按钮描边" }),
        Object.freeze({ key: "delete", label: "删除按钮底色" }),
        Object.freeze({ key: "deleteHover", label: "删除按钮悬停底色" }),
      ]),
    }),
    Object.freeze({
      id: "advanced-nav",
      group: "advanced",
      title: "导航栏",
      fields: Object.freeze([
        Object.freeze({ key: "navBarBg", label: "导航容器底色" }),
        Object.freeze({ key: "navBarBorder", label: "导航容器描边" }),
        Object.freeze({ key: "navButtonBg", label: "导航未选中底色" }),
        Object.freeze({ key: "navButtonText", label: "导航未选中文字" }),
        Object.freeze({ key: "navButtonActiveBg", label: "导航当前项底色" }),
        Object.freeze({ key: "navButtonActiveText", label: "导航当前项文字" }),
      ]),
    }),
    Object.freeze({
      id: "advanced-record-card",
      group: "advanced",
      kind: "record-card",
      title: "记录卡片",
      description: "统一主题卡片色会使用完全实心的统一卡片样式。",
      fields: Object.freeze([]),
    }),
    Object.freeze({
      id: "advanced-project",
      group: "advanced",
      title: "项目色与遮罩",
      fields: Object.freeze([
        Object.freeze({ key: "projectLevel1", label: "一级项目色" }),
        Object.freeze({ key: "projectLevel2", label: "二级项目色" }),
        Object.freeze({ key: "projectLevel3", label: "三级项目色" }),
        Object.freeze({ key: "overlay", label: "遮罩底色" }),
      ]),
    }),
    Object.freeze({
      id: "advanced-widget",
      group: "advanced",
      title: "小组件",
      description: "留空时会自动跟随当前主题。",
      fields: Object.freeze([
        Object.freeze({
          key: "widgetCardBg",
          label: "小组件外层底板",
          optional: true,
          description: "留空时自动使用当前主题的小组件外层底板。",
          placeholder: "留空则自动跟随当前主题",
        }),
        Object.freeze({
          key: "widgetItemBg",
          label: "小组件内容卡片",
          optional: true,
          description: "留空时自动使用当前主题的小组件内容卡片。",
          placeholder: "留空则自动跟随当前主题",
        }),
        Object.freeze({
          key: "widgetText",
          label: "小组件文字",
          optional: true,
          description: "留空时自动重新计算可读文字颜色。",
          placeholder: "留空则自动计算",
        }),
        Object.freeze({
          key: "widgetButtonBg",
          label: "小组件按钮底色",
          optional: true,
          description: "留空时自动跟随主题按钮颜色。",
          placeholder: "留空则自动跟随当前主题",
        }),
        Object.freeze({
          key: "widgetButtonText",
          label: "小组件按钮文字",
          optional: true,
          description: "留空时自动重新计算按钮文字颜色。",
          placeholder: "留空则自动计算",
        }),
      ]),
    }),
  ]);

  const builtInThemeMap = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));
  const BUILT_IN_THEME_LEGACY_NAME_MAP = Object.freeze({
    "graphite-mist": Object.freeze(["石墨灰"]),
    "porcelain-mist": Object.freeze(["瓷雾白"]),
    "oyster-linen": Object.freeze(["雾贝绢白"]),
  });
  const LEGACY_BUILT_IN_THEME_OVERRIDE_SNAPSHOTS = Object.freeze({
    "graphite-mist": Object.freeze({
      name: "石墨灰",
      colors: Object.freeze({
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
        overlay: "rgba(8, 10, 12, 0.45)",
      }),
      recordCard: Object.freeze({
        mode: "project",
        color: "#d8dde7",
      }),
    }),
  });
  const lightThemeIds = new Set([
    "ivory-light",
    "champagne-sandstone",
    "porcelain-mist",
    "sage-cashmere",
    "oyster-linen",
  ]);
  let lastThemeStorageSignature = null;
  let lastLaunchThemeSyncSignature = null;
  let lastDesktopThemeDebugApplySignature = null;
  let lastAppliedThemeStateSignature = null;
  let lastThemeStateStorageWriteSignature = null;
  const THEME_STORAGE_SECTION_KEYS = new Set([
    "selectedTheme",
    "customThemes",
    "builtInThemeOverrides",
  ]);
  let queuedThemeRefreshOptions = null;
  let themeRefreshScheduled = false;
  let themeRefreshInFlight = false;

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

  function readRawLocalStorageValue(storageKey) {
    const normalizedKey = String(storageKey || "").trim();
    if (!normalizedKey) {
      return null;
    }
    try {
      if (typeof window.ControlerStorage?.getRawLocalItem === "function") {
        return window.ControlerStorage.getRawLocalItem(normalizedKey);
      }
    } catch (_error) {}
    try {
      return window.localStorage.getItem(normalizedKey);
    } catch (_error) {
      return null;
    }
  }

  function writeRawLocalStorageValue(storageKey, rawValue) {
    const normalizedKey = String(storageKey || "").trim();
    if (!normalizedKey) {
      return;
    }
    const nextValue =
      rawValue === null || typeof rawValue === "undefined" ? null : String(rawValue);
    try {
      if (typeof window.ControlerStorage?.setRawLocalItem === "function") {
        window.ControlerStorage.setRawLocalItem(normalizedKey, nextValue ?? undefined);
        return;
      }
    } catch (_error) {}
    try {
      if (nextValue === null) {
        window.localStorage.removeItem(normalizedKey);
      } else {
        window.localStorage.setItem(normalizedKey, nextValue);
      }
    } catch (_error) {}
  }

  function writeStorageEntry(storageKey, rawValue) {
    const normalizedKey = String(storageKey || "").trim();
    if (!normalizedKey) {
      return;
    }
    const nextValue = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
    if (typeof nextValue !== "string") {
      return;
    }
    const candidateKeys = [
      `${LOCAL_ONLY_STORAGE_PREFIX}${normalizedKey}`,
      normalizedKey,
    ];
    for (const candidateKey of candidateKeys) {
      try {
        if (window.localStorage.getItem(candidateKey) === nextValue) {
          continue;
        }
        window.localStorage.setItem(candidateKey, nextValue);
      } catch (_error) {}
    }
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

  function mergeThemeRefreshOptions(baseOptions = null, nextOptions = null) {
    const base = isPlainObject(baseOptions) ? baseOptions : {};
    const next = isPlainObject(nextOptions) ? nextOptions : {};
    return {
      ...base,
      ...next,
      authoritative: base.authoritative === true || next.authoritative === true,
      force: base.force === true || next.force === true,
    };
  }

  function normalizeThemeChangedSections(changedSections = []) {
    return Array.from(
      new Set(
        (Array.isArray(changedSections) ? changedSections : [])
          .map((section) => String(section || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function readBootstrapThemeState() {
    try {
      const preloadedThemeState = window.__CONTROLER_DESKTOP_PRELOADED_THEME__;
      if (isPlainObject(preloadedThemeState)) {
        const themeId =
          typeof preloadedThemeState.themeId === "string" &&
          preloadedThemeState.themeId.trim()
            ? preloadedThemeState.themeId.trim()
            : DEFAULT_THEME_ID;
        return {
          themeId,
          colors: isPlainObject(preloadedThemeState.colors)
            ? preloadedThemeState.colors
            : null,
          recordCard: isPlainObject(preloadedThemeState.recordCard)
            ? preloadedThemeState.recordCard
            : null,
          source: "desktop-preload",
        };
      }
    } catch (_error) {}
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
    const match = normalizeThemeColorInputValue(color).match(HEX_COLOR_PATTERN);
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
      return `#${normalizeThemeColorInputValue(color).slice(1).toUpperCase()}`;
    }

    const rgbMatch = normalizeThemeColorInputValue(color).match(RGB_COLOR_PATTERN);
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

    const normalized = normalizeThemeColorInputValue(color);
    const hex = normalized.match(HEX_COLOR_PATTERN);
    if (hex) {
      const r = parseInt(hex[1].slice(0, 2), 16);
      const g = parseInt(hex[1].slice(2, 4), 16);
      const b = parseInt(hex[1].slice(4, 6), 16);
      return `${r},${g},${b}`;
    }

    const rgb = normalized.match(RGB_COLOR_PATTERN);
    if (rgb) {
      return `${rgb[1]},${rgb[2]},${rgb[3]}`;
    }

    return "121,175,133";
  }

  function toRgbaColor(color, alpha = 1) {
    return `rgba(${toRgbChannels(color)}, ${alpha})`;
  }

  function parseThemeColor(color) {
    const hex = parseHexColor(color);
    if (hex) {
      return {
        ...hex,
        a: 1,
      };
    }

    const rgbMatch = normalizeThemeColorInputValue(color).match(RGB_COLOR_PATTERN);
    if (!rgbMatch) {
      return null;
    }

    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a:
        rgbMatch[4] === undefined
          ? 1
          : Math.max(0, Math.min(1, Number(rgbMatch[4]))),
    };
  }

  function resolveCompositeThemeColor(
    foregroundColor,
    backgroundColor,
    fallbackColor = DEFAULT_THEME_COLORS.primary,
  ) {
    const foreground = parseThemeColor(foregroundColor);
    if (!foreground) {
      return toHexColor(backgroundColor, fallbackColor);
    }
    if (foreground.a >= 0.999) {
      return toHexColor(foregroundColor, fallbackColor);
    }

    const background =
      parseThemeColor(backgroundColor) || parseThemeColor(fallbackColor);
    if (!background) {
      return toHexColor(foregroundColor, fallbackColor);
    }

    const blendChannel = (foregroundValue, backgroundValue) =>
      Math.round(foregroundValue * foreground.a + backgroundValue * (1 - foreground.a))
        .toString(16)
        .padStart(2, "0");

    return `#${[
      blendChannel(foreground.r, background.r),
      blendChannel(foreground.g, background.g),
      blendChannel(foreground.b, background.b),
    ].join("")}`;
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
    const normalized = normalizeThemeColorInputValue(color);
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

  function resolveExplicitThemeColor(preferredColor, fallbackColor = "") {
    if (isValidThemeColorValue(preferredColor)) {
      return preferredColor.trim();
    }
    return isValidThemeColorValue(fallbackColor) ? fallbackColor.trim() : "";
  }

  function normalizeThemeColorComparisonValue(color) {
    if (!isValidThemeColorValue(color)) {
      return "";
    }
    return String(color).trim().toLowerCase().replace(/\s+/g, "");
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
    const primarySurface = firstNonEmpty(
      resolvedColors.primary,
      DEFAULT_THEME_COLORS.primary,
    );
    const surfaceReference = firstNonEmpty(
      resolvedColors.panelStrong,
      resolvedColors.panel,
      resolvedColors.secondary,
      primarySurface,
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
    const widgetCardOverride = isValidThemeColorValue(resolvedColors.widgetCardBg)
      ? resolvedColors.widgetCardBg.trim()
      : "";
    const cardBase = firstNonEmpty(
      widgetCardOverride,
      mixThemeColors(
        surfaceReference,
        primarySurface,
        isLightSurface ? 0.18 : 0.3,
      ),
    );
    const widgetItemOverride = isValidThemeColorValue(resolvedColors.widgetItemBg)
      ? resolvedColors.widgetItemBg.trim()
      : "";
    const itemCardBase = firstNonEmpty(
      widgetItemOverride,
      mixThemeColors(
        cardBase,
        contrastReference,
        isLightSurface ? 0.03 : 0.05,
      ),
    );
    const panelSurfaceBase = itemCardBase;
    const panelSurfaceStrongBase = mixThemeColors(
      itemCardBase,
      contrastReference,
      widgetItemOverride
        ? isLightSurface
          ? 0.02
          : 0.04
        : isLightSurface
          ? 0.04
          : 0.06,
    );
    const widgetTextOverride = isValidThemeColorValue(resolvedColors.widgetText)
      ? resolvedColors.widgetText.trim()
      : "";
    const textColor = firstNonEmpty(
      widgetTextOverride,
      ensureReadableTextColor(
        cardBase,
        resolvedColors.text,
        "#17212B",
        "#F7FAFF",
        4.4,
      ),
    );
    const mutedTextColor = widgetTextOverride
      ? toRgbaColor(widgetTextOverride, isLightSurface ? 0.68 : 0.76)
      : ensureReadableTextColor(
          cardBase,
          firstNonEmpty(resolvedColors.mutedText, resolvedColors.text),
          "#17212B",
          "#F7FAFF",
          2.8,
        );
    const widgetButtonOverride = isValidThemeColorValue(resolvedColors.widgetButtonBg)
      ? resolvedColors.widgetButtonBg.trim()
      : "";
    const buttonBg = firstNonEmpty(
      widgetButtonOverride,
      ensureReadableShapeColor(
        resolvedColors.buttonBg,
        cardBase,
        accentBase,
        2.1,
      ),
    );
    const buttonBorderBase = mixThemeColors(
      buttonBg,
      contrastReference,
      isLightSurface ? 0.14 : 0.1,
    );
    const widgetButtonTextOverride = isValidThemeColorValue(
      resolvedColors.widgetButtonText,
    )
      ? resolvedColors.widgetButtonText.trim()
      : "";
    const buttonText = firstNonEmpty(
      widgetButtonTextOverride,
      ensureReadableTextColor(
        buttonBg,
        firstNonEmpty(
          resolvedColors.buttonText,
          resolvedColors.onAccentText,
          resolvedColors.text,
        ),
        "#17212B",
        "#F7FAFF",
        4.2,
      ),
    );
    const actionMutedText = widgetTextOverride
      ? widgetTextOverride
      : ensureReadableTextColor(
          panelSurfaceBase,
          resolvedColors.text,
          "#17212B",
          "#F7FAFF",
          4.2,
        );
    const windowSurface = mixThemeColors(
      primarySurface,
      surfaceReference,
      isLightSurface ? 0.1 : 0.26,
    );
    const cardSurfaceAlpha = widgetCardOverride ? 1 : isLightSurface ? 0.98 : 0.96;
    const itemSurfaceAlpha = widgetItemOverride ? 1 : isLightSurface ? 0.92 : 0.9;
    const itemSurfaceStrongAlpha = widgetItemOverride ? 1 : isLightSurface ? 0.96 : 0.94;

    return {
      surfaceReference: cardBase,
      windowSurface: toRgbaColor(windowSurface, 1),
      windowGlow: toRgbaColor(accentBase, isLightSurface ? 0.14 : 0.12),
      controlBg: toRgbaColor(panelSurfaceBase, isLightSurface ? 0.84 : 0.92),
      controlBorder: toRgbaColor(buttonBorderBase, isLightSurface ? 0.28 : 0.24),
      controlText: textColor,
      cardBase,
      itemCardBase,
      textColor,
      mutedTextColor,
      textOverride: widgetTextOverride,
      buttonBg,
      buttonBorder: toRgbaColor(buttonBorderBase, isLightSurface ? 0.46 : 0.36),
      buttonText,
      buttonTextOverride: widgetButtonTextOverride,
      cardBg: toRgbaColor(cardBase, cardSurfaceAlpha),
      cardBorder: toRgbaColor(
        mixThemeColors(
          firstNonEmpty(
            resolvedColors.panelBorder,
            resolvedColors.border,
            buttonBorderBase,
          ),
          contrastReference,
          isLightSurface ? 0.08 : 0.12,
        ),
        isLightSurface ? 0.28 : 0.22,
      ),
      cardShadow: toRgbaColor(
        isLightSurface ? "#556274" : "#02060A",
        isLightSurface ? 0.12 : 0.28,
      ),
      cardGlossStart: toRgbaColor("#FFFFFF", isLightSurface ? 0.22 : 0.08),
      subtleSurface: toRgbaColor(panelSurfaceBase, itemSurfaceAlpha),
      subtleSurfaceStrong: toRgbaColor(
        panelSurfaceStrongBase,
        itemSurfaceStrongAlpha,
      ),
      subtleBorder: toRgbaColor(buttonBorderBase, isLightSurface ? 0.34 : 0.28),
      trackBg: toRgbaColor(panelSurfaceBase, isLightSurface ? 0.62 : 0.56),
      trackBorder: toRgbaColor(buttonBorderBase, isLightSurface ? 0.24 : 0.22),
      gridColor: toRgbaColor(contrastReference, isLightSurface ? 0.12 : 0.18),
      placeholderColor: toRgbaColor(
        contrastReference,
        isLightSurface ? 0.22 : 0.3,
      ),
      chartTrackBg: toRgbaColor(
        panelSurfaceBase,
        isLightSurface ? 0.74 : 0.68,
      ),
      pieCenterBg: toRgbaColor(cardBase, isLightSurface ? 0.98 : 0.96),
      badgeBg: toRgbaColor(panelSurfaceStrongBase, isLightSurface ? 0.96 : 0.94),
      badgeText: mutedTextColor,
      actionMutedBg: toRgbaColor(panelSurfaceBase, isLightSurface ? 0.92 : 0.88),
      actionMutedBorder: toRgbaColor(buttonBorderBase, isLightSurface ? 0.38 : 0.32),
      actionMutedText,
      accentActionBg: toRgbaColor(buttonBg, 1),
      accentActionBorder: toRgbaColor(
        buttonBorderBase,
        isLightSurface ? 0.46 : 0.36,
      ),
      accentActionText: buttonText,
      goalAnnualBg: toRgbaColor(panelSurfaceStrongBase, itemSurfaceStrongAlpha),
      goalAnnualAccent: accentBase,
      goalMonthBg: toRgbaColor(panelSurfaceBase, itemSurfaceAlpha),
      goalMonthAccent: toRgbaColor(contrastReference, isLightSurface ? 0.2 : 0.24),
      colorChipOutline: toRgbaColor(buttonBorderBase, isLightSurface ? 0.4 : 0.3),
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

  function normalizeThemeRecordCardOpacity(
    value,
    fallback = DEFAULT_THEME_RECORD_CARD.projectOpacity,
  ) {
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
    const normalizedMode = normalizeThemeRecordCardMode(source?.mode);
    const hasLegacyOpacity = Object.prototype.hasOwnProperty.call(source, "opacity");
    const legacyOpacity = hasLegacyOpacity
      ? normalizeThemeRecordCardOpacity(
          source.opacity,
          DEFAULT_THEME_RECORD_CARD.projectOpacity,
        )
      : null;
    return {
      mode: normalizedMode,
      color: String(resolvedColor || DEFAULT_THEME_RECORD_CARD.color).trim(),
      projectOpacity: normalizeThemeRecordCardOpacity(
        source?.projectOpacity,
        legacyOpacity ?? DEFAULT_THEME_RECORD_CARD.projectOpacity,
      ),
      themeOpacity: normalizeThemeRecordCardOpacity(
        source?.themeOpacity,
        legacyOpacity ?? DEFAULT_THEME_RECORD_CARD.themeOpacity,
      ),
    };
  }

  function sanitizeThemeId(name, existingId = "") {
    const normalized = String(name || existingId || "custom-theme")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || existingId || `custom-theme-${Date.now().toString(36)}`;
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
    const navBarBorder = isValidThemeColorValue(source.navBarBorder)
      ? source.navBarBorder.trim()
      : toRgbaColor(
          mixThemeColors(navBarBg, firstNonEmpty(panelBorder, accent), 0.58),
          0.44,
        );
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
    const buttonTextFallback = ensureReadableTextColor(
      buttonBg,
      firstNonEmpty(source.text, text),
      "#173326",
      "#f8fafc",
    );
    const buttonText = resolveExplicitThemeColor(
      source.buttonText,
      buttonTextFallback,
    );
    const onAccentTextFallback = ensureReadableTextColor(
      accent,
      firstNonEmpty(source.buttonText, source.text, text),
      "#173326",
      "#f8fafc",
    );
    const onAccentText = resolveExplicitThemeColor(
      source.onAccentText,
      onAccentTextFallback,
    );
    const navButtonText = ensureReadableTextColor(
      navBarBg,
      firstNonEmpty(source.navButtonText, source.mutedText, source.text, text),
      "#16211c",
      "#f8fafc",
    );
    const navButtonActiveText = ensureReadableTextColor(
      navButtonActiveBg,
      firstNonEmpty(
        source.navButtonActiveText,
        source.navButtonText,
        buttonText,
        source.text,
        text,
      ),
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
      navBarBorder,
      navButtonBg,
      navButtonText,
      navButtonActiveBg,
      navButtonActiveText,
      widgetCardBg: isValidThemeColorValue(source.widgetCardBg)
        ? source.widgetCardBg.trim()
        : "",
      widgetItemBg: isValidThemeColorValue(source.widgetItemBg)
        ? source.widgetItemBg.trim()
        : "",
      widgetText: isValidThemeColorValue(source.widgetText)
        ? source.widgetText.trim()
        : "",
      widgetButtonBg: isValidThemeColorValue(source.widgetButtonBg)
        ? source.widgetButtonBg.trim()
        : "",
      widgetButtonText: isValidThemeColorValue(source.widgetButtonText)
        ? source.widgetButtonText.trim()
        : "",
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

  function filterStoredThemeColors(colors = {}, options = {}) {
    if (!isPlainObject(colors)) {
      return {};
    }

    const nextColors = {};
    Object.entries(colors).forEach(([key, value]) => {
      if (isValidThemeColorValue(value)) {
        nextColors[key] = value.trim();
      }
    });

    if (!Object.keys(nextColors).length) {
      return {};
    }

    const derivedComparisonColors = { ...nextColors };
    AUTO_DERIVED_THEME_COLOR_KEYS.forEach((key) => {
      delete derivedComparisonColors[key];
    });
    const autoDerivedColors = resolveThemeColors({
      ...(isPlainObject(options?.theme) ? options.theme : {}),
      colors: derivedComparisonColors,
    });
    AUTO_DERIVED_THEME_COLOR_KEYS.forEach((key) => {
      if (
        normalizeThemeColorComparisonValue(nextColors[key]) &&
        normalizeThemeColorComparisonValue(nextColors[key]) ===
          normalizeThemeColorComparisonValue(autoDerivedColors[key])
      ) {
        delete nextColors[key];
      }
    });

    if (options?.baseTheme) {
      const baseResolvedColors = resolveThemeColors(options.baseTheme);
      Object.keys(nextColors).forEach((key) => {
        if (
          AUTO_DERIVED_THEME_COLOR_KEYS.includes(key) &&
          normalizeThemeColorComparisonValue(nextColors[key]) ===
            normalizeThemeColorComparisonValue(baseResolvedColors[key])
        ) {
          delete nextColors[key];
          return;
        }
        if (AUTO_DERIVED_THEME_COLOR_KEYS.includes(key)) {
          return;
        }
        if (
          normalizeThemeColorComparisonValue(nextColors[key]) ===
          normalizeThemeColorComparisonValue(baseResolvedColors[key])
        ) {
          delete nextColors[key];
        }
      });
    }

    return nextColors;
  }

  function resolveNavThemeTokens(colors = {}) {
    const resolvedColors =
      colors && typeof colors === "object" && !Array.isArray(colors) && !colors.colors
        ? resolveThemeColors({ colors })
        : resolveThemeColors(colors);
    const hoverBg = mixThemeColors(
      resolvedColors.navButtonBg,
      resolvedColors.navButtonActiveBg,
      0.18,
    );
    return {
      containerBg: resolvedColors.navBarBg,
      containerBorder: resolvedColors.navBarBorder,
      itemBg: resolvedColors.navButtonBg,
      itemText: resolvedColors.navButtonText,
      itemBorder: toRgbaColor(
        mixThemeColors(
          resolvedColors.navBarBorder,
          resolvedColors.navButtonBg,
          0.28,
        ),
        0.52,
      ),
      itemHoverBg: hoverBg,
      itemHoverText: ensureReadableTextColor(
        hoverBg,
        resolvedColors.navButtonText,
        resolvedColors.navButtonText,
        resolvedColors.navButtonActiveText,
      ),
      itemHoverBorder: toRgbaColor(
        mixThemeColors(
          resolvedColors.navBarBorder,
          resolvedColors.navButtonActiveBg,
          0.28,
        ),
        0.68,
      ),
      itemActiveBg: resolvedColors.navButtonActiveBg,
      itemActiveText: resolvedColors.navButtonActiveText,
      itemActiveBorder: toRgbaColor(
        mixThemeColors(
          resolvedColors.navBarBorder,
          resolvedColors.navButtonActiveBg,
          0.42,
        ),
        0.82,
      ),
      itemPressedBg: mixThemeColors(
        resolvedColors.navButtonBg,
        resolvedColors.navButtonActiveBg,
        0.24,
      ),
      itemActivePressedBg: mixThemeColors(
        resolvedColors.navButtonActiveBg,
        resolvedColors.navBarBg,
        0.16,
      ),
    };
  }

  function resolveRecordCardSurfaceStyles(options = {}) {
    const resolvedColors =
      options?.resolvedColors && typeof options.resolvedColors === "object"
        ? options.resolvedColors
        : resolveThemeColors(options?.theme || null);
    const resolvedRecordCard =
      options?.recordCard && typeof options.recordCard === "object"
        ? resolveThemeRecordCard(
            {
              ...(options?.theme || {}),
              recordCard: {
                ...((options?.theme && options.theme.recordCard) || {}),
                ...options.recordCard,
              },
            },
            resolvedColors,
          )
        : resolveThemeRecordCard(options?.theme || null, resolvedColors);
    const recordColor = isValidThemeColorValue(options?.color)
      ? String(options.color).trim()
      : resolvedRecordCard.mode === "theme"
        ? resolvedRecordCard.color
        : firstNonEmpty(
            resolvedColors.projectLevel1,
            resolvedColors.accent,
            DEFAULT_THEME_RECORD_CARD.color,
          );
    const solidThemeCard = resolvedRecordCard.mode === "theme";
    const projectOpacityRatio =
      normalizeThemeRecordCardOpacity(
        resolvedRecordCard.projectOpacity,
        DEFAULT_THEME_RECORD_CARD.projectOpacity,
      ) / 100;
    const themeOpacityRatio =
      normalizeThemeRecordCardOpacity(
        resolvedRecordCard.themeOpacity,
        DEFAULT_THEME_RECORD_CARD.themeOpacity,
      ) / 100;
    const solidBackground = solidThemeCard
      ? toRgbaColor(recordColor, 0.88 * themeOpacityRatio)
      : "";
    const themeSurfaceReference =
      solidThemeCard && themeOpacityRatio > 0
        ? solidBackground
        : firstNonEmpty(resolvedColors.panelStrong, resolvedColors.panel, "#10141D");
    return {
      mode: solidThemeCard ? "theme" : "project",
      color: recordColor,
      titleColor: solidThemeCard
        ? ensureReadableTextColor(
            themeSurfaceReference,
            firstNonEmpty(
              resolvedColors.text,
              resolvedColors.onAccentText,
              "#F7FAFF",
            ),
            "#17212B",
            "#F7FAFF",
          )
        : recordColor,
      borderColor: solidThemeCard
        ? toRgbaColor(
            mixThemeColors(recordColor, resolvedColors.text, 0.18),
            0.78 * themeOpacityRatio,
          )
        : toRgbaColor(recordColor, 0.22 * projectOpacityRatio),
      background: solidThemeCard
        ? `linear-gradient(180deg, ${solidBackground} 0%, ${solidBackground} 100%), var(--bg-quaternary)`
        : `linear-gradient(180deg, ${toRgbaColor(recordColor, 0.12 * projectOpacityRatio)} 0%, ${toRgbaColor(recordColor, 0.03 * projectOpacityRatio)} 100%), var(--bg-quaternary)`,
      shadow: "none",
    };
  }

  function normalizeThemeObject(theme, index = 0) {
    const source =
      theme && typeof theme === "object" && !Array.isArray(theme) ? theme : {};
    const storedColors = filterStoredThemeColors(source.colors || {}, {
      theme: source,
    });
    const normalizedColors = resolveThemeColors({
      ...source,
      colors: storedColors,
    });
    const normalizedRecordCard = resolveThemeRecordCard(source, normalizedColors);
    const name =
      typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : `自定义主题 ${index + 1}`;
    const safeId = sanitizeThemeId(source.id || name, source.id);
    const themeId = builtInThemeMap.has(safeId)
      ? `custom-${safeId}`
      : safeId.startsWith("custom-")
        ? safeId
        : `custom-${safeId}`;

    return {
      id: themeId,
      name,
      colors: normalizedColors,
      recordCard: normalizedRecordCard,
      isCustom: true,
      isBuiltIn: false,
      hasOverride: false,
    };
  }

  function resolveBuiltInTheme(themeId, override = null) {
    const baseTheme = builtInThemeMap.get(themeId);
    if (!baseTheme) {
      return null;
    }

    const normalizedOverride = normalizeBuiltInThemeOverride(themeId, override);
    const draftTheme = {
      ...baseTheme,
      name: normalizedOverride?.name || baseTheme.name,
      colors: {
        ...(isPlainObject(baseTheme.colors) ? baseTheme.colors : {}),
        ...(isPlainObject(normalizedOverride?.colors)
          ? normalizedOverride.colors
          : {}),
      },
      recordCard: {
        ...(isPlainObject(baseTheme.recordCard) ? baseTheme.recordCard : {}),
        ...(isPlainObject(normalizedOverride?.recordCard)
          ? normalizedOverride.recordCard
          : {}),
      },
      isCustom: false,
      isBuiltIn: true,
      hasOverride: Boolean(normalizedOverride),
    };
    const resolvedColors = resolveThemeColors(draftTheme);
    return {
      ...draftTheme,
      colors: resolvedColors,
      recordCard: resolveThemeRecordCard(draftTheme, resolvedColors),
    };
  }

  function getBuiltInThemes(options = {}) {
    const overrides = isPlainObject(options?.overrides) ? options.overrides : {};
    return BUILT_IN_THEMES.map(
      (theme) => resolveBuiltInTheme(theme.id, overrides[theme.id]) || null,
    ).filter(Boolean);
  }

  function getThemeFieldSections() {
    return THEME_FIELD_SECTIONS.map((section) => ({
      ...section,
      fields: Array.isArray(section.fields)
        ? section.fields.map((field) => ({ ...field }))
        : [],
    }));
  }

  function resolveBuiltInThemeOverrideName(baseTheme, overrideName) {
    const trimmedOverrideName =
      typeof overrideName === "string" ? overrideName.trim() : "";
    if (!trimmedOverrideName) {
      return baseTheme?.name || "";
    }
    const legacyNames = Array.isArray(
      BUILT_IN_THEME_LEGACY_NAME_MAP[baseTheme?.id],
    )
      ? BUILT_IN_THEME_LEGACY_NAME_MAP[baseTheme.id]
      : [];
    if (legacyNames.includes(trimmedOverrideName)) {
      return baseTheme?.name || trimmedOverrideName;
    }
    return trimmedOverrideName;
  }

  function normalizeThemeComparisonValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function areThemeColorMapsEqual(leftColors = {}, rightColors = {}) {
    return Object.keys(DEFAULT_THEME_COLORS).every(
      (key) =>
        normalizeThemeComparisonValue(leftColors?.[key]) ===
        normalizeThemeComparisonValue(rightColors?.[key]),
    );
  }

  function areThemeRecordCardsEqual(leftRecordCard = {}, rightRecordCard = {}) {
    return (
      normalizeThemeRecordCardMode(leftRecordCard?.mode) ===
        normalizeThemeRecordCardMode(rightRecordCard?.mode) &&
      normalizeThemeComparisonValue(leftRecordCard?.color) ===
        normalizeThemeComparisonValue(rightRecordCard?.color) &&
      normalizeThemeRecordCardOpacity(leftRecordCard?.projectOpacity) ===
        normalizeThemeRecordCardOpacity(rightRecordCard?.projectOpacity) &&
      normalizeThemeRecordCardOpacity(leftRecordCard?.themeOpacity) ===
        normalizeThemeRecordCardOpacity(rightRecordCard?.themeOpacity)
    );
  }

  function buildComparableBuiltInThemeOverride(baseTheme, override = {}) {
    if (
      !baseTheme ||
      !override ||
      typeof override !== "object" ||
      Array.isArray(override)
    ) {
      return null;
    }

    const storedColors = filterStoredThemeColors(override?.colors || {}, {
      theme: {
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          ...(override?.colors || {}),
        },
      },
      baseTheme,
    });
    const resolvedColors = resolveThemeColors({
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        ...storedColors,
      },
    });
    const recordCard = resolveThemeRecordCard(
      {
        ...baseTheme,
        recordCard: {
          ...(baseTheme.recordCard || {}),
          ...(override?.recordCard || {}),
        },
      },
      resolvedColors,
    );
    return {
      id: baseTheme.id,
      name: resolveBuiltInThemeOverrideName(baseTheme, override?.name),
      colors: storedColors,
      resolvedColors,
      recordCard,
    };
  }

  function buildLegacyBuiltInThemeSnapshot(baseTheme) {
    const snapshot = LEGACY_BUILT_IN_THEME_OVERRIDE_SNAPSHOTS[baseTheme?.id];
    if (!snapshot) {
      return null;
    }
    return buildComparableBuiltInThemeOverride(baseTheme, snapshot);
  }

  function countStoredThemeColorKeys(colors = {}) {
    if (!isPlainObject(colors)) {
      return 0;
    }
    return Object.keys(colors).filter((key) =>
      isValidThemeColorValue(colors[key]),
    ).length;
  }

  function hasOnlyAutoDerivedThemeColorKeys(colors = {}) {
    const keys = Object.keys(colors || {});
    return (
      keys.length > 0 &&
      keys.every((key) => AUTO_DERIVED_THEME_COLOR_KEYS.includes(key))
    );
  }

  function matchesBuiltInThemeSnapshot(baseTheme, override = {}, options = {}) {
    if (!baseTheme || !isPlainObject(override)) {
      return false;
    }
    const comparableOverride = buildComparableBuiltInThemeOverride(baseTheme, {
      name: baseTheme.name,
      colors: override?.colors || {},
      recordCard: override?.recordCard || {},
    });
    if (!comparableOverride) {
      return false;
    }
    const baseRecordCard = resolveThemeRecordCard(
      baseTheme,
      resolveThemeColors(baseTheme),
    );
    const rawStoredColorCount = Number(options?.rawStoredColorCount) || 0;
    if (
      comparableOverride.name === baseTheme.name &&
      areThemeRecordCardsEqual(comparableOverride.recordCard, baseRecordCard)
    ) {
      if (Object.keys(comparableOverride.colors).length === 0) {
        return true;
      }
      if (
        rawStoredColorCount >= 18 &&
        hasOnlyAutoDerivedThemeColorKeys(comparableOverride.colors)
      ) {
        return true;
      }
    }
    const legacySnapshot = buildLegacyBuiltInThemeSnapshot(baseTheme);
    return Boolean(
      legacySnapshot &&
        areThemeColorMapsEqual(
          comparableOverride.resolvedColors,
          legacySnapshot.resolvedColors,
        ) &&
        areThemeRecordCardsEqual(
          comparableOverride.recordCard,
          legacySnapshot.recordCard,
        ),
    );
  }

  function normalizeBuiltInThemeOverridesMap(rawOverrides = {}) {
    return BUILT_IN_THEMES.reduce((accumulator, theme) => {
      const override = normalizeBuiltInThemeOverride(theme.id, rawOverrides?.[theme.id]);
      if (override) {
        accumulator[theme.id] = {
          name: override.name,
          colors: override.colors,
          recordCard: override.recordCard,
        };
      }
      return accumulator;
    }, {});
  }

  function normalizeBuiltInThemeOverride(themeId, override = {}) {
    const baseTheme = builtInThemeMap.get(themeId);
    const rawStoredColorCount = countStoredThemeColorKeys(override?.colors || {});
    const comparableOverride = buildComparableBuiltInThemeOverride(baseTheme, override);
    if (!comparableOverride) {
      return null;
    }
    const baseRecordCard = resolveThemeRecordCard(
      baseTheme,
      resolveThemeColors(baseTheme),
    );
    const isEquivalentToBase =
      comparableOverride.name === baseTheme.name &&
      Object.keys(comparableOverride.colors).length === 0 &&
      areThemeRecordCardsEqual(comparableOverride.recordCard, baseRecordCard);
    if (isEquivalentToBase) {
      return null;
    }
    if (
      comparableOverride.name === baseTheme.name &&
      rawStoredColorCount >= 18
    ) {
      if (
        matchesBuiltInThemeSnapshot(baseTheme, override, {
          rawStoredColorCount,
        })
      ) {
        return null;
      }
      const matchedBuiltInSnapshot = BUILT_IN_THEMES.find(
        (theme) =>
          theme.id !== themeId &&
          matchesBuiltInThemeSnapshot(theme, override, {
            rawStoredColorCount,
          }),
      );
      if (matchedBuiltInSnapshot) {
        return null;
      }
    }
    const legacySnapshot = buildLegacyBuiltInThemeSnapshot(baseTheme);
    if (
      legacySnapshot &&
      comparableOverride.name === legacySnapshot.name &&
      areThemeColorMapsEqual(
        comparableOverride.resolvedColors,
        legacySnapshot.resolvedColors,
      ) &&
      areThemeRecordCardsEqual(
        comparableOverride.recordCard,
        legacySnapshot.recordCard,
      )
    ) {
      return null;
    }
    return {
      id: themeId,
      name: comparableOverride.name,
      colors: comparableOverride.colors,
      recordCard: comparableOverride.recordCard,
    };
  }

  function loadBuiltInThemeOverrides() {
    try {
      const raw = readJsonStorage(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY, {});
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
      }
      const normalizedOverrides = normalizeBuiltInThemeOverridesMap(raw);
      const normalizedSnapshot = JSON.stringify(normalizedOverrides);
      if (normalizedSnapshot !== JSON.stringify(raw)) {
        writeStorageEntry(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY, normalizedSnapshot);
      }
      return normalizedOverrides;
    } catch (error) {
      return {};
    }
  }

  function normalizeCustomTheme(theme) {
    const normalizedTheme = normalizeThemeObject(theme);
    return {
      id: normalizedTheme.id,
      name: normalizedTheme.name,
      colors: normalizedTheme.colors,
      recordCard: normalizedTheme.recordCard,
    };
  }

  function normalizeCustomThemesForStorage(customThemes = []) {
    return Array.isArray(customThemes)
      ? customThemes.map((theme) => normalizeCustomTheme(theme)).filter(Boolean)
      : [];
  }

  function isLightTheme(theme) {
    if (lightThemeIds.has(theme?.id)) return true;
    const rgb = parseHexColor(toHexColor(theme?.colors?.primary, ""));
    if (!rgb) return false;
    const luminance =
      (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance >= 0.72;
  }

  function buildAppliedThemeStateSignature(
    themeId,
    resolvedColors = {},
    resolvedRecordCard = {},
  ) {
    return JSON.stringify({
      themeId: String(themeId || "").trim(),
      colors: resolvedColors,
      recordCard: resolvedRecordCard,
    });
  }

  function applyResolvedThemeColors(resolvedColors, resolvedRecordCard) {
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
    root.style.setProperty("--bottom-nav-border", resolvedColors.navBarBorder);
    root.style.setProperty("--bottom-nav-button-bg", resolvedColors.navButtonBg);
    root.style.setProperty("--bottom-nav-button-text", resolvedColors.navButtonText);
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
    root.style.setProperty(
      "--record-card-project-opacity",
      String(
        normalizeThemeRecordCardOpacity(
          resolvedRecordCard.projectOpacity,
          DEFAULT_THEME_RECORD_CARD.projectOpacity,
        ),
      ),
    );
    root.style.setProperty(
      "--record-card-theme-opacity",
      String(
        normalizeThemeRecordCardOpacity(
          resolvedRecordCard.themeOpacity,
          DEFAULT_THEME_RECORD_CARD.themeOpacity,
        ),
      ),
    );
    root.style.setProperty("--widget-surface-reference", widgetColors.surfaceReference);
    root.style.setProperty("--widget-window-surface", widgetColors.windowSurface);
    root.style.setProperty("--widget-window-glow", widgetColors.windowGlow);
    root.style.setProperty("--widget-control-bg", widgetColors.controlBg);
    root.style.setProperty("--widget-control-border", widgetColors.controlBorder);
    root.style.setProperty("--widget-control-text", widgetColors.controlText);
    root.style.setProperty("--widget-item-card-bg", widgetColors.subtleSurface);
    root.style.setProperty("--widget-item-card-border", widgetColors.subtleBorder);
    root.style.setProperty("--widget-text-color", widgetColors.textColor);
    root.style.setProperty("--widget-muted-text-color", widgetColors.mutedTextColor);
    root.style.setProperty("--widget-button-bg", widgetColors.buttonBg);
    root.style.setProperty("--widget-button-border", widgetColors.buttonBorder);
    root.style.setProperty("--widget-button-text", widgetColors.buttonText);
    root.style.setProperty("--widget-text-override", widgetColors.textOverride);
    root.style.setProperty(
      "--widget-button-text-override",
      widgetColors.buttonTextOverride,
    );
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
  }

  function applyThemeColors(theme) {
    const resolvedColors = resolveThemeColors(theme);
    const resolvedRecordCard = resolveThemeRecordCard(theme, resolvedColors);
    applyResolvedThemeColors(resolvedColors, resolvedRecordCard);
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
      const storedThemeState = getStoredThemeState();
      const customThemes = Array.isArray(storedThemeState?.customThemes)
        ? storedThemeState.customThemes
        : [];
      const builtInThemeOverrides = isPlainObject(
        storedThemeState?.builtInThemeOverrides,
      )
        ? storedThemeState.builtInThemeOverrides
        : {};
      const matchedCustomTheme =
        customThemes.find((theme) => theme?.id === themeId) || null;
      const selectedOverride = builtInThemeOverrides[themeId];
      const sharedThemeState = {
        selectedTheme: themeId || DEFAULT_THEME_ID,
        customThemes,
        builtInThemeOverrides,
      };
      window.ControlerNativeBridge?.emitEvent?.("ui.theme-applied", {
        href: window.location.href,
        themeId,
        ...sharedThemeState,
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
    const rawCustomThemes = parseJsonString(customThemesEntry.rawValue, []);
    const customTheme = Array.isArray(rawCustomThemes)
      ? normalizeCustomTheme(
          rawCustomThemes.find((theme) => theme?.id === storedTheme) || null,
        )
      : null;
    const rawBuiltInThemeOverrides = parseJsonString(
      builtInThemeOverridesEntry.rawValue,
      {},
    );
    const builtInThemeOverrides =
      normalizeBuiltInThemeOverridesMap(rawBuiltInThemeOverrides);
    const mergedBuiltInTheme = resolveBuiltInTheme(
      storedTheme,
      rawBuiltInThemeOverrides?.[storedTheme],
    );
    const activeTheme =
      customTheme ||
      mergedBuiltInTheme ||
      resolveBuiltInTheme(storedTheme) ||
      resolveBuiltInTheme(DEFAULT_THEME_ID) ||
      resolveBuiltInTheme("default");
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

  function resolveThemeStateFromBootstrapState(bootstrapState = null) {
    const sourceState = isPlainObject(bootstrapState)
      ? bootstrapState
      : readBootstrapThemeState();
    if (!sourceState) {
      return null;
    }
    const themeId =
      typeof sourceState.themeId === "string" && sourceState.themeId.trim()
        ? sourceState.themeId.trim()
        : DEFAULT_THEME_ID;
    const fallbackTheme =
      builtInThemeMap.get(DEFAULT_THEME_ID) || builtInThemeMap.get("default");
    const baseTheme =
      builtInThemeMap.get(themeId) || fallbackTheme || { id: themeId, colors: {} };
    const draftTheme = {
      ...baseTheme,
      id: themeId,
      colors: {
        ...(isPlainObject(baseTheme?.colors) ? baseTheme.colors : {}),
        ...(isPlainObject(sourceState.colors) ? sourceState.colors : {}),
      },
      recordCard: {
        ...(isPlainObject(baseTheme?.recordCard) ? baseTheme.recordCard : {}),
        ...(isPlainObject(sourceState.recordCard) ? sourceState.recordCard : {}),
      },
    };
    const resolvedColors = resolveThemeColors(draftTheme);
    const activeTheme = {
      ...draftTheme,
      colors: resolvedColors,
      recordCard: resolveThemeRecordCard(draftTheme, resolvedColors),
    };
    return {
      activeTheme,
      themeId: activeTheme?.id || themeId || DEFAULT_THEME_ID,
      source: sourceState.source || "bootstrap-theme-state",
      storageKeys: {
        selectedTheme: sourceState.source || "bootstrap-theme-state",
        customThemes: sourceState.source || "bootstrap-theme-state",
        builtInThemeOverrides: sourceState.source || "bootstrap-theme-state",
      },
    };
  }

  function shouldUseBootstrapThemeStateForStorage(
    bootstrapThemeState,
    storageThemeState,
    storageEntries = null,
  ) {
    if (!bootstrapThemeState?.activeTheme) {
      return false;
    }
    if (!storageThemeState?.activeTheme) {
      return true;
    }
    const selectedThemeEntry =
      storageEntries?.selectedTheme || readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry =
      storageEntries?.customThemes || readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry =
      storageEntries?.builtInThemeOverrides ||
      readStorageEntry(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY);
    const hasStoredThemePayload = [
      selectedThemeEntry?.rawValue,
      customThemesEntry?.rawValue,
      builtInThemeOverridesEntry?.rawValue,
    ].some((value) => typeof value === "string" && value.trim());
    if (!hasStoredThemePayload) {
      return true;
    }
    const preloadedThemeState = window.__CONTROLER_DESKTOP_PRELOADED_THEME__;
    const preloadedThemeId =
      typeof preloadedThemeState?.themeId === "string" && preloadedThemeState.themeId.trim()
        ? preloadedThemeState.themeId.trim()
        : "";
    const preloadedColors = isPlainObject(preloadedThemeState?.colors)
      ? preloadedThemeState.colors
      : null;
    if (preloadedThemeId && bootstrapThemeState.themeId === preloadedThemeId) {
      if (storageThemeState.themeId !== preloadedThemeId) {
        return true;
      }
      if (
        preloadedColors &&
        !areThemeColorMapsEqual(
          resolveThemeColors(storageThemeState.activeTheme),
          preloadedColors,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function getStoredThemeState(storageEntries = null) {
    const selectedThemeEntry =
      storageEntries?.selectedTheme || readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry =
      storageEntries?.customThemes || readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry =
      storageEntries?.builtInThemeOverrides ||
      readStorageEntry(BUILT_IN_THEME_OVERRIDES_STORAGE_KEY);
    const resolvedThemeState = resolveActiveThemeState({
      selectedTheme: selectedThemeEntry,
      customThemes: customThemesEntry,
      builtInThemeOverrides: builtInThemeOverridesEntry,
    });
    const storedSelectedTheme =
      typeof selectedThemeEntry.rawValue === "string" && selectedThemeEntry.rawValue.trim()
        ? selectedThemeEntry.rawValue.trim()
        : resolvedThemeState.themeId || DEFAULT_THEME_ID;
    const rawCustomThemes = parseJsonString(customThemesEntry.rawValue, []);
    const customThemes = Array.isArray(rawCustomThemes)
      ? rawCustomThemes.map((theme, index) => normalizeThemeObject(theme, index))
      : [];
    const rawBuiltInThemeOverrides = parseJsonString(
      builtInThemeOverridesEntry.rawValue,
      {},
    );
    const builtInThemeOverrides =
      normalizeBuiltInThemeOverridesMap(rawBuiltInThemeOverrides);

    return {
      selectedTheme: storedSelectedTheme,
      customThemes,
      builtInThemeOverrides,
      themeId: resolvedThemeState.themeId,
      activeTheme: resolvedThemeState.activeTheme,
      source: resolvedThemeState.source,
      storageKeys: resolvedThemeState.storageKeys,
    };
  }

  function resolveThemeStateFromCoreState(coreState = null) {
    if (!isPlainObject(coreState)) {
      return null;
    }

    const selectedTheme =
      typeof coreState.selectedTheme === "string" && coreState.selectedTheme.trim()
        ? coreState.selectedTheme.trim()
        : DEFAULT_THEME_ID;
    const customThemes = Array.isArray(coreState.customThemes)
      ? coreState.customThemes
          .map((theme, index) => normalizeThemeObject(theme, index))
          .filter(Boolean)
      : [];
    const rawBuiltInThemeOverrides = isPlainObject(coreState.builtInThemeOverrides)
      ? coreState.builtInThemeOverrides
      : {};
    const builtInThemeOverrides =
      normalizeBuiltInThemeOverridesMap(rawBuiltInThemeOverrides);
    const matchedCustomTheme =
      customThemes.find((theme) => theme?.id === selectedTheme) || null;
    const selectedBuiltInTheme = resolveBuiltInTheme(
      selectedTheme,
      rawBuiltInThemeOverrides?.[selectedTheme],
    );
    const activeTheme =
      matchedCustomTheme ||
      selectedBuiltInTheme ||
      resolveBuiltInTheme(selectedTheme) ||
      resolveBuiltInTheme(DEFAULT_THEME_ID) ||
      resolveBuiltInTheme("default");
    const themeId = activeTheme?.id || DEFAULT_THEME_ID;

    return {
      selectedTheme,
      customThemes,
      builtInThemeOverrides,
      themeId,
      activeTheme,
      source: "managed-core-state",
      storageKeys: {
        selectedTheme: "",
        customThemes: "",
        builtInThemeOverrides: "",
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
    const rawBuiltInThemeOverrides = isPlainObject(detail.builtInThemeOverrides)
      ? detail.builtInThemeOverrides
      : {};
    const builtInThemeOverrides =
      normalizeBuiltInThemeOverridesMap(rawBuiltInThemeOverrides);

    const matchedCustomTheme =
      customThemes.find((theme) => theme?.id === selectedTheme) || null;
    const selectedBuiltInTheme = resolveBuiltInTheme(
      selectedTheme,
      rawBuiltInThemeOverrides[selectedTheme],
    );
    const activeTheme =
      matchedCustomTheme ||
      selectedBuiltInTheme ||
      resolveBuiltInTheme(selectedTheme) ||
      resolveBuiltInTheme(DEFAULT_THEME_ID) ||
      resolveBuiltInTheme("default");
    const themeId = activeTheme?.id || DEFAULT_THEME_ID;

    return {
      selectedTheme,
      themeId,
      activeTheme,
      customThemes,
      builtInThemeOverrides,
    };
  }

  function writeThemeStateToStorage(selectedTheme, customThemes, builtInThemeOverrides) {
    const storedCustomThemes = normalizeCustomThemesForStorage(customThemes);
    const storedSelectedTheme = selectedTheme || DEFAULT_THEME_ID;
    const storedCustomThemesJson = JSON.stringify(storedCustomThemes);
    const storedBuiltInThemeOverridesJson = JSON.stringify(
      builtInThemeOverrides || {},
    );
    const nextWriteSignature = JSON.stringify({
      selectedTheme: storedSelectedTheme,
      customThemes: storedCustomThemes,
      builtInThemeOverrides: builtInThemeOverrides || {},
    });
    const selectedThemeEntry = readStorageEntry(SELECTED_THEME_STORAGE_KEY);
    const customThemesEntry = readStorageEntry(CUSTOM_THEMES_STORAGE_KEY);
    const builtInThemeOverridesEntry = readStorageEntry(
      BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
    );
    const storageAlreadyMatches =
      selectedThemeEntry.rawValue === storedSelectedTheme &&
      customThemesEntry.rawValue === storedCustomThemesJson &&
      builtInThemeOverridesEntry.rawValue === storedBuiltInThemeOverridesJson;
    if (
      nextWriteSignature === lastThemeStateStorageWriteSignature &&
      storageAlreadyMatches
    ) {
      return;
    }
    writeStorageEntry(SELECTED_THEME_STORAGE_KEY, storedSelectedTheme);
    writeStorageEntry(CUSTOM_THEMES_STORAGE_KEY, storedCustomThemesJson);
    writeStorageEntry(
      BUILT_IN_THEME_OVERRIDES_STORAGE_KEY,
      storedBuiltInThemeOverridesJson,
    );
    lastThemeStateStorageWriteSignature = nextWriteSignature;
    lastThemeStorageSignature = buildThemeStorageSignature();
  }

  function writeThemeStateToRawStorage(
    selectedTheme,
    customThemes,
    builtInThemeOverrides,
  ) {
    const storedCustomThemes = normalizeCustomThemesForStorage(customThemes);
    const storedSelectedTheme = selectedTheme || DEFAULT_THEME_ID;
    const storedCustomThemesJson = JSON.stringify(storedCustomThemes);
    const storedBuiltInThemeOverridesJson = JSON.stringify(
      builtInThemeOverrides || {},
    );
    const nextWriteSignature = JSON.stringify({
      selectedTheme: storedSelectedTheme,
      customThemes: storedCustomThemes,
      builtInThemeOverrides: builtInThemeOverrides || {},
    });
    const rawEntries = [
      [SELECTED_THEME_STORAGE_KEY, storedSelectedTheme],
      [CUSTOM_THEMES_STORAGE_KEY, storedCustomThemesJson],
      [BUILT_IN_THEME_OVERRIDES_STORAGE_KEY, storedBuiltInThemeOverridesJson],
      [`${LOCAL_ONLY_STORAGE_PREFIX}${SELECTED_THEME_STORAGE_KEY}`, storedSelectedTheme],
      [`${LOCAL_ONLY_STORAGE_PREFIX}${CUSTOM_THEMES_STORAGE_KEY}`, storedCustomThemesJson],
      [
        `${LOCAL_ONLY_STORAGE_PREFIX}${BUILT_IN_THEME_OVERRIDES_STORAGE_KEY}`,
        storedBuiltInThemeOverridesJson,
      ],
    ];
    rawEntries.forEach(([storageKey, rawValue]) => {
      if (readRawLocalStorageValue(storageKey) !== rawValue) {
        writeRawLocalStorageValue(storageKey, rawValue);
      }
    });
    lastThemeStateStorageWriteSignature = nextWriteSignature;
    lastThemeStorageSignature = buildThemeStorageSignature();
  }

  function applyThemeState(themeId, activeTheme, options = {}) {
    const resolvedColors = resolveThemeColors(activeTheme);
    const resolvedRecordCard = resolveThemeRecordCard(activeTheme, resolvedColors);
    const nextAppliedThemeStateSignature = buildAppliedThemeStateSignature(
      themeId,
      resolvedColors,
      resolvedRecordCard,
    );
    if (
      options?.force !== true &&
      nextAppliedThemeStateSignature === lastAppliedThemeStateSignature
    ) {
      return;
    }
    lastAppliedThemeStateSignature = nextAppliedThemeStateSignature;
    document.documentElement.setAttribute("data-theme", themeId);
    applyResolvedThemeColors(resolvedColors, resolvedRecordCard);
    document.documentElement.style.colorScheme = isLightTheme(activeTheme)
      ? "light"
      : "dark";
    window.__CONTROLER_DESKTOP_PRELOADED_THEME__ = {
      themeId,
      primaryColor: resolvedColors.primary,
      textColor: resolvedColors.text,
      colors: { ...resolvedColors },
      recordCard: { ...resolvedRecordCard },
    };
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
    try {
      if (readRawLocalStorageValue(SELECTED_THEME_STORAGE_KEY) !== themeId) {
        writeRawLocalStorageValue(SELECTED_THEME_STORAGE_KEY, themeId);
      }
    } catch (_error) {}
    try {
      const localMirrorKey = `${LOCAL_ONLY_STORAGE_PREFIX}${SELECTED_THEME_STORAGE_KEY}`;
      if (readRawLocalStorageValue(localMirrorKey) !== themeId) {
        writeRawLocalStorageValue(localMirrorKey, themeId);
      }
    } catch (_error) {}
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

      let resolvedThemeState = resolveActiveThemeState(storageEntries);
      const bootstrapThemeState = resolveThemeStateFromBootstrapState();
      if (
        shouldUseBootstrapThemeStateForStorage(
          bootstrapThemeState,
          resolvedThemeState,
          storageEntries,
        )
      ) {
        resolvedThemeState = bootstrapThemeState;
      }
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

  async function applyThemeFromManagedCoreState(options = {}) {
    const managedStorage = window.ControlerStorage;
    if (
      managedStorage?.isNativeApp !== true ||
      typeof managedStorage?.getCoreState !== "function"
    ) {
      return false;
    }
    try {
      const coreState = await managedStorage.getCoreState({
        authoritative: options?.authoritative === true,
      });
      const resolvedThemeState = resolveThemeStateFromCoreState(coreState);
      if (!resolvedThemeState?.activeTheme) {
        return false;
      }
      const selectedTheme =
        resolvedThemeState.selectedTheme ||
        resolvedThemeState.themeId ||
        DEFAULT_THEME_ID;
      const rawBuiltInThemeOverrides = isPlainObject(coreState?.builtInThemeOverrides)
        ? coreState.builtInThemeOverrides
        : {};
      const normalizedBuiltInOverrides =
        resolvedThemeState.builtInThemeOverrides || {};
      if (
        typeof managedStorage.replaceCoreState === "function" &&
        JSON.stringify(rawBuiltInThemeOverrides) !==
          JSON.stringify(normalizedBuiltInOverrides)
      ) {
        managedStorage.replaceCoreState({
          builtInThemeOverrides: normalizedBuiltInOverrides,
        }).catch(() => {});
      }
      writeThemeStateToRawStorage(
        selectedTheme,
        resolvedThemeState.customThemes,
        resolvedThemeState.builtInThemeOverrides,
      );
      lastLaunchThemeSyncSignature = null;
      applyThemeState(resolvedThemeState.themeId, resolvedThemeState.activeTheme, {
        ...options,
        emitNative: false,
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function runThemeRefreshFromAvailableSources(options = {}) {
    if (
      window.ControlerStorage?.isNativeApp === true &&
      typeof window.ControlerStorage?.getCoreState === "function"
    ) {
      const didApply = await applyThemeFromManagedCoreState(options);
      if (!didApply) {
        applyThemeFromStorage(options);
      }
      return;
    }
    applyThemeFromStorage(options);
  }

  function refreshThemeFromAvailableSources(options = {}) {
    queuedThemeRefreshOptions = mergeThemeRefreshOptions(
      queuedThemeRefreshOptions,
      options,
    );
    if (themeRefreshScheduled || themeRefreshInFlight) {
      return;
    }
    themeRefreshScheduled = true;
    Promise.resolve().then(async () => {
      themeRefreshScheduled = false;
      if (themeRefreshInFlight) {
        return;
      }
      themeRefreshInFlight = true;
      try {
        while (queuedThemeRefreshOptions) {
          const nextOptions = queuedThemeRefreshOptions;
          queuedThemeRefreshOptions = null;
          await runThemeRefreshFromAvailableSources(nextOptions);
        }
      } finally {
        themeRefreshInFlight = false;
        if (queuedThemeRefreshOptions) {
          refreshThemeFromAvailableSources();
        }
      }
    });
  }

  function getThemeStoragePageInstanceId() {
    return typeof window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__ === "string"
      ? window.__CONTROLER_STORAGE_PAGE_INSTANCE_ID__.trim()
      : "";
  }

  function shouldRefreshThemeForStorageChange(detail = {}) {
    if (!isPlainObject(detail)) {
      return true;
    }
    const originPageInstanceId =
      typeof detail.originPageInstanceId === "string"
        ? detail.originPageInstanceId.trim()
        : "";
    if (
      originPageInstanceId &&
      originPageInstanceId === getThemeStoragePageInstanceId()
    ) {
      return false;
    }
    if (window.ControlerStorage?.shouldIgnoreRecentLocalEcho?.(detail)) {
      return false;
    }
    const changedSections = normalizeThemeChangedSections(detail.changedSections);
    if (changedSections.length) {
      return changedSections.some((section) =>
        THEME_STORAGE_SECTION_KEYS.has(section),
      );
    }
    const reason =
      typeof detail.reason === "string" ? detail.reason.trim() : "";
    const source =
      typeof detail.source === "string" ? detail.source.trim().toLowerCase() : "";
    return (
      reason === "import" ||
      reason === "replace-all" ||
      reason === "clear" ||
      reason === "storage-path-changed" ||
      source.includes("import")
    );
  }

  function syncThemeStateFromBridge(detail = {}) {
    if (!isPlainObject(detail)) {
      return;
    }
    const resolvedThemeState = resolveThemeStateFromBridgeDetail(detail);
    const selectedTheme =
      resolvedThemeState.selectedTheme ||
      resolvedThemeState.themeId ||
      DEFAULT_THEME_ID;
    const customThemes = normalizeCustomThemesForStorage(
      resolvedThemeState.customThemes,
    );
    const builtInThemeOverrides = resolvedThemeState.builtInThemeOverrides;
    const sharedThemeState = {
      selectedTheme,
      customThemes,
      builtInThemeOverrides,
    };

    try {
      const managedStorage = window.ControlerStorage;
      if (managedStorage?.isNativeApp === true) {
        writeThemeStateToRawStorage(
          selectedTheme,
          customThemes,
          builtInThemeOverrides,
        );
      } else {
        writeThemeStateToStorage(
          selectedTheme,
          customThemes,
          builtInThemeOverrides,
        );
      }
      if (
        managedStorage?.isNativeApp === true &&
        typeof managedStorage.applySharedStateFromBridge === "function"
      ) {
        managedStorage.applySharedStateFromBridge(sharedThemeState);
      }
      lastLaunchThemeSyncSignature = null;
      applyThemeState(selectedTheme, resolvedThemeState.activeTheme, {
        emitNative: false,
      });
    } catch (_error) {}
  }

  refreshThemeFromAvailableSources();

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
      refreshThemeFromAvailableSources();
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshThemeFromAvailableSources();
      }
    });
  }

  window.addEventListener("focus", () => {
    refreshThemeFromAvailableSources();
  });
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail =
      event?.detail && typeof event.detail === "object" ? event.detail : {};
    if (!shouldRefreshThemeForStorageChange(detail)) {
      return;
    }
    refreshThemeFromAvailableSources();
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
      refreshThemeFromAvailableSources();
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
    DEFAULT_THEME_COLORS,
    DEFAULT_THEME_RECORD_CARD,
    themeAppliedEventName: THEME_APPLIED_EVENT_NAME,
    applyThemeColors,
    applyThemeState,
    ensureReadableShapeColor,
    getBuiltInThemes,
    getStoredThemeState,
    getThemeFieldSections,
    isLightTheme,
    isValidThemeColorValue,
    normalizeBuiltInThemeOverride,
    normalizeBuiltInThemeOverridesMap,
    normalizeThemeObject,
    normalizeThemeRecordCardOpacity,
    resolveBuiltInTheme,
    resolveNavThemeTokens,
    resolveRecordCardSurfaceStyles,
    resolveThemeColors,
    resolveThemeRecordCard,
    sanitizeThemeId,
    syncDocumentThemeSurface,
    toHexColor,
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
