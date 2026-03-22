import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  NativeModules,
  PanResponder,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import WebView, {type WebViewMessageEvent} from 'react-native-webview';
import {
  isAndroidWidgetActionLaunch,
  resolveWidgetLaunchPolicy,
} from './systemFixPolicies';

const platformContract = require('./platform-contract');

type NativeBridgeModule = {
  getStartUrl: () => Promise<string>;
  getUiLanguage?: () => Promise<string>;
  setUiLanguage?: (language: string) => Promise<string>;
  getLaunchThemeState?: () => Promise<string>;
  setLaunchThemeState?: (themeStateJson: string) => Promise<string>;
  readStorageState: () => Promise<string>;
  writeStorageState: (stateJson: string) => Promise<string>;
  getStorageStatus: () => Promise<string>;
  getStorageManifest?: () => Promise<string>;
  getStorageCoreState?: () => Promise<string>;
  getStoragePageBootstrapState?: (optionsJson?: string) => Promise<string>;
  getStorageBootstrapState?: (optionsJson?: string) => Promise<string>;
  getStoragePlanBootstrapState?: (optionsJson?: string) => Promise<string>;
  getStorageDraft?: (optionsJson?: string) => Promise<string>;
  setStorageDraft?: (optionsJson?: string) => Promise<string>;
  removeStorageDraft?: (optionsJson?: string) => Promise<string>;
  getAutoBackupStatus?: () => Promise<string>;
  updateAutoBackupSettings?: (settingsJson: string) => Promise<string>;
  runAutoBackupNow?: () => Promise<string>;
  shareLatestBackup?: () => Promise<string>;
  loadStorageSectionRange?: (
    section: string,
    scopeJson: string,
  ) => Promise<string>;
  saveStorageSectionRange?: (
    section: string,
    payloadJson: string,
  ) => Promise<string>;
  replaceStorageCoreState?: (partialCoreJson: string) => Promise<string>;
  appendStorageJournal?: (payloadJson: string) => Promise<string>;
  flushStorageJournal?: () => Promise<string>;
  replaceStorageRecurringPlans?: (itemsJson: string) => Promise<string>;
  probeStorageStateVersion?: (includeFallbackHash: boolean) => Promise<string>;
  exportStorageBundle?: (optionsJson: string) => Promise<string>;
  importStorageSource?: (optionsJson: string) => Promise<string>;
  pickImportSourceFile?: (optionsJson: string) => Promise<string>;
  inspectImportSourceFile?: (optionsJson: string) => Promise<string>;
  previewExternalImport?: (optionsJson: string) => Promise<string>;
  selectStorageFile: () => Promise<string>;
  selectStorageDirectory: () => Promise<string>;
  resetStorageFile: () => Promise<string>;
  consumeLaunchAction: () => Promise<string>;
  requestPinWidget: (kind: string) => Promise<string>;
  getWidgetPinSupport?: (kind: string) => Promise<string>;
  consumePinWidgetResult?: () => Promise<string>;
  openHomeScreen?: () => Promise<string>;
  refreshWidgets: (payloadJson?: string) => Promise<string>;
  exportData: (stateJson: string, fileName: string) => Promise<string>;
  requestNotificationPermission: (interactive: boolean) => Promise<string>;
  syncNotificationSchedule?: (scheduleJson: string) => Promise<string>;
  setLastVisiblePage?: (pageKey: string) => Promise<string>;
  showToast?: (message: string) => Promise<string>;
};

type BridgeEnvelopePayload = {
  id?: string;
  method?: string;
  name?: string;
  action?: string;
  language?: string;
  launchId?: string;
  targetId?: string;
  reason?: string;
  source?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  hasOpenModal?: boolean;
  handled?: boolean;
  isBusy?: boolean;
  busy?: boolean;
  lockNavigation?: boolean;
  queued?: boolean;
  modalCount?: number;
  page?: string;
  href?: string;
  direction?: string;
  hiddenPages?: unknown;
  order?: unknown;
  changedSections?: unknown;
  changedPeriods?: unknown;
  createdAt?: unknown;
  retryAfterMs?: unknown;
  rects?: unknown;
  viewportWidth?: unknown;
  viewportHeight?: unknown;
};

type BridgeEnvelope = {
  type?: string;
  payload?: BridgeEnvelopePayload;
};

type AppPageKey = 'index' | 'stats' | 'plan' | 'todo' | 'diary' | 'settings';
type WebViewSlot = 'primary' | 'secondary' | 'tertiary';
type NavigationDirection = 'forward' | 'back';
type UiLanguage = 'zh-CN' | 'en-US';

type WebViewSlotState = {
  uri: string | null;
  pageKey: AppPageKey | '';
  revision: number;
};

type TransitionState = {
  fromSlot: WebViewSlot;
  toSlot: WebViewSlot;
  direction: NavigationDirection;
  status: 'loading' | 'animating';
  reuseCachedSlot?: boolean;
};

type PageTarget = {
  uri: string;
  pageKey: AppPageKey;
};

type EdgeBackSwipeExclusionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type EdgeBackSwipeExclusionState = {
  rects: EdgeBackSwipeExclusionRect[];
  viewportWidth: number;
  viewportHeight: number;
};

type NavigationRequestSource = 'bridge' | 'webview';
type NavigationRequestResult = 'intercept' | 'allow-default' | 'noop';
type LaunchContext = {
  active: boolean;
  pageKey: AppPageKey | '';
  widgetKind: string;
  widgetAction: string;
  widgetSource: string;
  widgetLaunchId: string;
  widgetTargetId: string;
  widgetCreatedAt: number;
};

type PendingWidgetLaunchDispatch = {
  pageKey: AppPageKey;
  comparableUri: string;
  launchContext: LaunchContext;
  queuedAt: number;
};

type QueuedNavigationRequest = {
  payload: Record<string, unknown>;
  source: NavigationRequestSource;
  queuedAt: number;
};

type WidgetRefreshPayload = {
  changedSections?: string[];
  widgetKindHint?: string;
  appWidgetId?: number;
  source?: string;
};

type ShellBootTheme = {
  screenBg: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  text: string;
  mutedText: string;
  indicatorBg: string;
  transitionOverlay: string;
};

type AppProps = {
  initialCoreStateJson?: string;
  initialUiLanguage?: string;
};

function updateWebViewSlotsRef(
  ref: React.MutableRefObject<Record<WebViewSlot, WebViewSlotState>>,
  slot: WebViewSlot,
  nextState: Partial<WebViewSlotState>,
) {
  ref.current = {
    ...ref.current,
    [slot]: {
      ...ref.current[slot],
      ...nextState,
    },
  };
}

function createDefaultEdgeBackSwipeExclusionState(): EdgeBackSwipeExclusionState {
  return {
    rects: [],
    viewportWidth: 0,
    viewportHeight: 0,
  };
}

function normalizeEdgeBackSwipeExclusionRect(
  value: unknown,
): EdgeBackSwipeExclusionRect | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const rawLeft = Number(source.left);
  const rawTop = Number(source.top);
  const rawRight = Number(source.right);
  const rawBottom = Number(source.bottom);
  if (
    !Number.isFinite(rawLeft) ||
    !Number.isFinite(rawTop) ||
    !Number.isFinite(rawRight) ||
    !Number.isFinite(rawBottom)
  ) {
    return null;
  }

  const left = Math.max(0, Math.min(rawLeft, rawRight));
  const top = Math.max(0, Math.min(rawTop, rawBottom));
  const right = Math.max(left, Math.max(rawLeft, rawRight));
  const bottom = Math.max(top, Math.max(rawTop, rawBottom));
  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
  };
}

function normalizeEdgeBackSwipeExclusionState(
  payload: BridgeEnvelopePayload | undefined,
): EdgeBackSwipeExclusionState {
  const rawRects = payload?.rects;
  const rectSource = Array.isArray(rawRects) ? rawRects : [];
  const rects = rectSource
    .map(rect => normalizeEdgeBackSwipeExclusionRect(rect))
    .filter((rect): rect is EdgeBackSwipeExclusionRect => !!rect);
  const viewportWidth = Number(payload?.viewportWidth);
  const viewportHeight = Number(payload?.viewportHeight);
  return {
    rects,
    viewportWidth:
      Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0,
    viewportHeight:
      Number.isFinite(viewportHeight) && viewportHeight > 0
        ? viewportHeight
        : 0,
  };
}

const nativeBridge = NativeModules.ControlerBridge as
  | NativeBridgeModule
  | undefined;
const SCREEN_BG = '#0f1512';
const ACCENT_COLOR = '#2f6f54';
const DEFAULT_SHELL_BOOT_THEME: ShellBootTheme = {
  screenBg: SCREEN_BG,
  cardBg: 'rgba(22, 31, 27, 0.88)',
  cardBorder: 'rgba(142, 214, 164, 0.14)',
  accent: ACCENT_COLOR,
  text: '#d4f5df',
  mutedText: 'rgba(212, 245, 223, 0.68)',
  indicatorBg: 'rgba(47, 111, 84, 0.14)',
  transitionOverlay: 'rgba(15, 21, 18, 0.26)',
};
const BUILT_IN_SHELL_BOOT_THEME_MAP: Record<string, Partial<ShellBootTheme>> = {
  default: {
    screenBg: '#1f2f28',
    cardBg: 'rgba(31, 53, 42, 0.74)',
    cardBorder: 'rgba(142, 214, 164, 0.28)',
    accent: '#8ed6a4',
    text: '#f5fff8',
    mutedText: 'rgba(245, 255, 248, 0.72)',
    indicatorBg: 'rgba(142, 214, 164, 0.14)',
    transitionOverlay: 'rgba(8, 10, 12, 0.26)',
  },
  'blue-ocean': {
    screenBg: '#12263f',
    cardBg: 'rgba(22, 45, 73, 0.76)',
    cardBorder: 'rgba(126, 198, 255, 0.28)',
    accent: '#7ec6ff',
    text: '#eef6ff',
    mutedText: 'rgba(238, 246, 255, 0.72)',
    indicatorBg: 'rgba(126, 198, 255, 0.16)',
    transitionOverlay: 'rgba(10, 22, 39, 0.24)',
  },
  'sunset-orange': {
    screenBg: '#4b261b',
    cardBg: 'rgba(88, 46, 31, 0.76)',
    cardBorder: 'rgba(255, 191, 120, 0.3)',
    accent: '#ffbf78',
    text: '#fff5ea',
    mutedText: 'rgba(255, 245, 234, 0.74)',
    indicatorBg: 'rgba(255, 191, 120, 0.16)',
    transitionOverlay: 'rgba(42, 21, 15, 0.24)',
  },
  'minimal-gray': {
    screenBg: '#1f252e',
    cardBg: 'rgba(40, 47, 58, 0.78)',
    cardBorder: 'rgba(209, 217, 227, 0.3)',
    accent: '#d1d9e3',
    text: '#f6f8fb',
    mutedText: 'rgba(246, 248, 251, 0.72)',
    indicatorBg: 'rgba(209, 217, 227, 0.16)',
    transitionOverlay: 'rgba(20, 24, 31, 0.24)',
  },
  'obsidian-mono': {
    screenBg: '#0d0f12',
    cardBg: 'rgba(20, 23, 28, 0.82)',
    cardBorder: 'rgba(215, 221, 232, 0.22)',
    accent: '#f1f4fa',
    text: '#f4f6fb',
    mutedText: 'rgba(244, 246, 251, 0.76)',
    indicatorBg: 'rgba(241, 244, 250, 0.14)',
    transitionOverlay: 'rgba(7, 8, 10, 0.3)',
  },
  'ivory-light': {
    screenBg: '#eceff3',
    cardBg: 'rgba(249, 252, 255, 0.86)',
    cardBorder: 'rgba(110, 122, 143, 0.24)',
    accent: '#3f495f',
    text: '#202633',
    mutedText: 'rgba(32, 38, 51, 0.7)',
    indicatorBg: 'rgba(63, 73, 95, 0.12)',
    transitionOverlay: 'rgba(27, 31, 38, 0.18)',
  },
  'graphite-mist': {
    screenBg: '#2a2d32',
    cardBg: 'rgba(53, 57, 64, 0.78)',
    cardBorder: 'rgba(224, 227, 234, 0.26)',
    accent: '#f0f3fa',
    text: '#f8f9fc',
    mutedText: 'rgba(248, 249, 252, 0.74)',
    indicatorBg: 'rgba(240, 243, 250, 0.14)',
    transitionOverlay: 'rgba(20, 22, 26, 0.24)',
  },
  'aurora-mist': {
    screenBg: '#162a2d',
    cardBg: 'rgba(26, 49, 52, 0.78)',
    cardBorder: 'rgba(143, 211, 209, 0.26)',
    accent: '#8fd3d1',
    text: '#effcfb',
    mutedText: 'rgba(239, 252, 251, 0.74)',
    indicatorBg: 'rgba(143, 211, 209, 0.14)',
    transitionOverlay: 'rgba(11, 22, 24, 0.24)',
  },
  'velvet-bordeaux': {
    screenBg: '#2f141d',
    cardBg: 'rgba(57, 26, 37, 0.8)',
    cardBorder: 'rgba(216, 166, 184, 0.26)',
    accent: '#d8a6b8',
    text: '#fff3f6',
    mutedText: 'rgba(255, 243, 246, 0.74)',
    indicatorBg: 'rgba(216, 166, 184, 0.14)',
    transitionOverlay: 'rgba(22, 10, 14, 0.26)',
  },
  'champagne-sandstone': {
    screenBg: '#f1ebe2',
    cardBg: 'rgba(250, 245, 239, 0.9)',
    cardBorder: 'rgba(143, 119, 95, 0.22)',
    accent: '#8b6f57',
    text: '#2f261f',
    mutedText: 'rgba(47, 38, 31, 0.68)',
    indicatorBg: 'rgba(139, 111, 87, 0.12)',
    transitionOverlay: 'rgba(40, 34, 28, 0.18)',
  },
  'midnight-indigo': {
    screenBg: '#111a35',
    cardBg: 'rgba(21, 33, 64, 0.8)',
    cardBorder: 'rgba(156, 184, 255, 0.28)',
    accent: '#9cb8ff',
    text: '#eef3ff',
    mutedText: 'rgba(238, 243, 255, 0.74)',
    indicatorBg: 'rgba(156, 184, 255, 0.14)',
    transitionOverlay: 'rgba(10, 16, 31, 0.26)',
  },
};
const DEFAULT_UI_LANGUAGE: UiLanguage = 'zh-CN';
const UI_LANGUAGE_STORAGE_KEY = 'appLanguage';
const SHELL_THEME_SECTION_KEYS = new Set([
  'customThemes',
  'builtInThemeOverrides',
  'selectedTheme',
]);
const IS_ANDROID = Platform.OS === 'android';
const PAGE_SWITCH_LOAD_TIMEOUT_MS = IS_ANDROID ? 1400 : 1100;
const PAGE_READY_FALLBACK_REVEAL_MS = IS_ANDROID ? 1700 : 1200;
const NAVIGATION_PREWARM_DELAY_MS = 260;
const WIDGET_PREWARM_AFTER_READY_MS = 220;
const WIDGET_LAUNCH_PREWARM_WINDOW_MS = 2400;
const WIDGET_LAUNCH_DEDUP_WINDOW_MS = 700;
const WIDGET_LAUNCH_CONFIRM_TIMEOUT_MS = IS_ANDROID ? 720 : 520;
const WIDGET_LAUNCH_CONFIRM_RETRY_MS = IS_ANDROID ? 260 : 180;
const INITIAL_WEBVIEW_WIDTH = Math.max(Dimensions.get('window').width || 0, 1);
const INITIAL_WEBVIEW_HEIGHT = Math.max(
  Dimensions.get('window').height || 0,
  1,
);
const EDGE_BACK_SWIPE_REGION_WIDTH = IS_ANDROID ? 48 : 56;
const EDGE_BACK_SWIPE_BOTTOM_EXCLUSION_HEIGHT = IS_ANDROID ? 92 : 0;
const EDGE_BACK_SWIPE_MIN_DISTANCE = IS_ANDROID ? 24 : 44;
const EDGE_BACK_SWIPE_MIN_FLING_DISTANCE = IS_ANDROID ? 10 : 20;
const EDGE_BACK_SWIPE_MIN_VELOCITY = IS_ANDROID ? 0.18 : 0.32;
const EDGE_BACK_SWIPE_MAX_VERTICAL_DRIFT = IS_ANDROID ? 128 : 84;
const EDGE_BACK_SWIPE_HORIZONTAL_DOMINANCE_RATIO = IS_ANDROID ? 0.6 : 0.75;
const WEBVIEW_SLOTS: WebViewSlot[] = ['primary', 'secondary', 'tertiary'];
const ANDROID_ASSET_WEB_ROOT = 'file:///android_asset/controler-web';
const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const APP_PAGES: Array<{key: AppPageKey; href: string}> = [
  {key: 'index', href: 'index.html'},
  {key: 'stats', href: 'stats.html'},
  {key: 'plan', href: 'plan.html'},
  {key: 'todo', href: 'todo.html'},
  {key: 'diary', href: 'diary.html'},
  {key: 'settings', href: 'settings.html'},
];
const APP_PAGE_LABELS: Record<AppPageKey, {zh: string; en: string}> = {
  index: {zh: '记录', en: 'Record'},
  stats: {zh: '统计', en: 'Stats'},
  plan: {zh: '计划', en: 'Plan'},
  todo: {zh: '待办', en: 'To-Do'},
  diary: {zh: '日记', en: 'Diary'},
  settings: {zh: '设置', en: 'Settings'},
};
const widgetKindMetadata = Array.isArray(platformContract?.getWidgetKinds?.())
  ? platformContract.getWidgetKinds()
  : [];
const WIDGET_KIND_PAGE_MAP = new Map<string, AppPageKey>();
const WIDGET_KIND_ACTION_MAP = new Map<string, string>();
(Array.isArray(widgetKindMetadata) ? widgetKindMetadata : []).forEach(item => {
  const widgetKind = String(item?.id || '').trim();
  const widgetAction = String(item?.action || '').trim();
  const widgetPage = normalizePageKey(item?.page);
  if (!widgetKind) {
    return;
  }
  if (widgetAction) {
    WIDGET_KIND_ACTION_MAP.set(widgetKind, widgetAction);
  }
  if (widgetPage) {
    WIDGET_KIND_PAGE_MAP.set(widgetKind, widgetPage);
  }
});
const launchActionMetadata = Array.isArray(platformContract?.getLaunchActions?.())
  ? platformContract.getLaunchActions()
  : [];
const LAUNCH_ACTION_PAGE_MAP = new Map<string, AppPageKey>();
(Array.isArray(launchActionMetadata) ? launchActionMetadata : []).forEach(item => {
  const launchAction = String(item?.id || '').trim();
  const pageKey = normalizePageKey(item?.page);
  if (launchAction && pageKey) {
    LAUNCH_ACTION_PAGE_MAP.set(launchAction, pageKey);
  }
});

function parseBridgeJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBootThemeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseBootThemeRgb(
  value: string,
): {r: number; g: number; b: number} | null {
  const normalizedValue = String(value || '').trim();
  const hexMatch = normalizedValue.match(/^#([0-9a-fA-F]{6})$/);
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
  const [r, g, b] = rgbMatch.slice(1, 4).map(channel => {
    return Math.max(0, Math.min(255, Number.parseInt(channel, 10) || 0));
  });
  return {r, g, b};
}

function toBootThemeRgbChannels(value: string, fallback = '142, 214, 164'): string {
  const rgb = parseBootThemeRgb(value);
  return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : fallback;
}

function isLightBootTheme(theme: ShellBootTheme): boolean {
  const rgb = parseBootThemeRgb(theme.screenBg);
  if (!rgb) {
    return false;
  }
  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.72;
}

function getBootThemeContrastText(value: string): string {
  const rgb = parseBootThemeRgb(value);
  if (!rgb) {
    return '#173326';
  }
  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.62 ? '#173326' : '#f8fafc';
}

function buildShellBootTheme(
  colors: Record<string, unknown> | null | undefined,
  fallback: ShellBootTheme = DEFAULT_SHELL_BOOT_THEME,
): ShellBootTheme {
  return {
    screenBg: normalizeBootThemeColor(colors?.primary, fallback.screenBg),
    cardBg: normalizeBootThemeColor(
      colors?.panelStrong ?? colors?.panel,
      fallback.cardBg,
    ),
    cardBorder: normalizeBootThemeColor(
      colors?.panelBorder ?? colors?.border,
      fallback.cardBorder,
    ),
    accent: normalizeBootThemeColor(colors?.accent, fallback.accent),
    text: normalizeBootThemeColor(colors?.text, fallback.text),
    mutedText: normalizeBootThemeColor(colors?.mutedText, fallback.mutedText),
    indicatorBg: normalizeBootThemeColor(
      colors?.navButtonBg ?? colors?.panelBorder,
      fallback.indicatorBg,
    ),
    transitionOverlay: normalizeBootThemeColor(
      colors?.overlay,
      fallback.transitionOverlay,
    ),
  };
}

function buildLaunchThemeBootstrapState(
  themeState: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const normalizedThemeState = buildLaunchThemeStatePayload(themeState);
  const selectedTheme =
    typeof normalizedThemeState.selectedTheme === 'string' &&
    normalizedThemeState.selectedTheme.trim()
      ? normalizedThemeState.selectedTheme.trim()
      : 'default';
  const resolvedTheme = resolveShellBootTheme(themeState);
  const accentText = getBootThemeContrastText(resolvedTheme.accent);

  return {
    themeId: selectedTheme,
    colorScheme: isLightBootTheme(resolvedTheme) ? 'light' : 'dark',
    backgroundColor: resolvedTheme.screenBg,
    textColor: resolvedTheme.text,
    variables: {
      '--bg-primary': resolvedTheme.screenBg,
      '--bg-secondary': resolvedTheme.cardBg,
      '--bg-tertiary': resolvedTheme.indicatorBg,
      '--bg-quaternary': resolvedTheme.indicatorBg,
      '--accent-color': resolvedTheme.accent,
      '--accent-color-rgb': toBootThemeRgbChannels(resolvedTheme.accent),
      '--text-color': resolvedTheme.text,
      '--muted-text-color': resolvedTheme.mutedText,
      '--border-color': resolvedTheme.cardBorder,
      '--delete-btn': '#ff7e7e',
      '--delete-hover': '#ff6464',
      '--project-level-1': resolvedTheme.accent,
      '--project-level-2': resolvedTheme.accent,
      '--project-level-3': resolvedTheme.accent,
      '--panel-bg': resolvedTheme.cardBg,
      '--panel-strong-bg': resolvedTheme.cardBg,
      '--panel-border-color': resolvedTheme.cardBorder,
      '--button-bg': resolvedTheme.accent,
      '--button-bg-hover': resolvedTheme.accent,
      '--button-text': accentText,
      '--button-border': resolvedTheme.cardBorder,
      '--on-accent-text': accentText,
      '--bottom-nav-bg': resolvedTheme.cardBg,
      '--bottom-nav-button-bg': resolvedTheme.indicatorBg,
      '--bottom-nav-button-active-bg': resolvedTheme.accent,
      '--bottom-nav-active-text': accentText,
      '--overlay-bg': resolvedTheme.transitionOverlay,
    },
  };
}

function areShellBootThemesEqual(
  left: ShellBootTheme,
  right: ShellBootTheme,
): boolean {
  return (
    left.screenBg === right.screenBg &&
    left.cardBg === right.cardBg &&
    left.cardBorder === right.cardBorder &&
    left.accent === right.accent &&
    left.text === right.text &&
    left.mutedText === right.mutedText &&
    left.indicatorBg === right.indicatorBg &&
    left.transitionOverlay === right.transitionOverlay
  );
}

function resolveShellBootTheme(coreState: Record<string, unknown> | null): ShellBootTheme {
  if (!coreState) {
    return DEFAULT_SHELL_BOOT_THEME;
  }
  const selectedTheme =
    typeof coreState.selectedTheme === 'string' && coreState.selectedTheme.trim()
      ? coreState.selectedTheme.trim()
      : 'default';
  const customThemes = Array.isArray(coreState.customThemes)
    ? coreState.customThemes
    : [];
  const builtInOverrides = isPlainObject(coreState.builtInThemeOverrides)
    ? coreState.builtInThemeOverrides
    : {};
  const builtInBase = buildShellBootTheme(
    BUILT_IN_SHELL_BOOT_THEME_MAP[selectedTheme] || null,
  );
  const customTheme = customThemes.find(theme => {
    return (
      isPlainObject(theme) &&
      typeof theme.id === 'string' &&
      theme.id.trim() === selectedTheme
    );
  });
  if (isPlainObject(customTheme)) {
    return buildShellBootTheme(
      isPlainObject(customTheme.colors) ? customTheme.colors : customTheme,
      DEFAULT_SHELL_BOOT_THEME,
    );
  }
  const selectedOverride = builtInOverrides[selectedTheme];
  if (isPlainObject(selectedOverride)) {
    return buildShellBootTheme(
      isPlainObject(selectedOverride.colors)
        ? selectedOverride.colors
        : selectedOverride,
      builtInBase,
    );
  }
  return builtInBase;
}

function buildLaunchThemeStatePayload(
  coreState: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!coreState) {
    return {
      selectedTheme: 'default',
      customThemes: [],
      builtInThemeOverrides: {},
    };
  }
  const selectedTheme =
    typeof coreState.selectedTheme === 'string' && coreState.selectedTheme.trim()
      ? coreState.selectedTheme.trim()
      : 'default';
  const customThemes = Array.isArray(coreState.customThemes)
    ? coreState.customThemes
    : [];
  const matchedCustomTheme = customThemes.find(theme => {
    return (
      isPlainObject(theme) &&
      typeof theme.id === 'string' &&
      theme.id.trim() === selectedTheme
    );
  });
  const builtInOverrides = isPlainObject(coreState.builtInThemeOverrides)
    ? coreState.builtInThemeOverrides
    : {};
  return {
    selectedTheme,
    customThemes: matchedCustomTheme ? [matchedCustomTheme] : [],
    builtInThemeOverrides:
      builtInOverrides &&
      Object.prototype.hasOwnProperty.call(builtInOverrides, selectedTheme)
        ? {
            [selectedTheme]: builtInOverrides[selectedTheme],
          }
        : {},
  };
}

function buildInjectionScript(message: Record<string, unknown>): string {
  const serialized = JSON.stringify(message)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return (
    'window.__controlerReceiveNativeMessage && ' +
    `window.__controlerReceiveNativeMessage(${serialized}); true;`
  );
}

function estimatePayloadSize(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'string') {
    return value.length;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function normalizePageKey(value: unknown): AppPageKey | '' {
  const normalized = String(value || '').trim();
  return APP_PAGES.some(page => page.key === normalized)
    ? (normalized as AppPageKey)
    : '';
}

function normalizeHiddenPageKeys(value: unknown): AppPageKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const hiddenPages: AppPageKey[] = [];
  const seen = new Set<AppPageKey>();
  value.forEach(item => {
    const pageKey = normalizePageKey(item);
    if (!pageKey || seen.has(pageKey)) {
      return;
    }
    seen.add(pageKey);
    hiddenPages.push(pageKey);
  });
  return hiddenPages;
}

function getPageByKey(value: unknown): {key: AppPageKey; href: string} | null {
  const pageKey = normalizePageKey(value);
  return APP_PAGES.find(page => page.key === pageKey) || null;
}

function isAbsoluteUrlString(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(String(value || '').trim());
}

function normalizeAppHref(value: string, fallback = 'index.html'): string {
  const trimmed = String(value || '').trim();
  const normalized = trimmed.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
  return normalized || fallback;
}

function buildAndroidAssetUrl(value: string, fallback = 'index.html'): string {
  const trimmed = String(value || '').trim();
  if (isAbsoluteUrlString(trimmed)) {
    return trimmed;
  }
  return `${ANDROID_ASSET_WEB_ROOT}/${normalizeAppHref(trimmed, fallback)}`;
}

export function resolveAppPageUri(
  baseUrl: string | null,
  value: string,
  fallback = 'index.html',
): string {
  const trimmedValue = String(value || '').trim();
  if (isAbsoluteUrlString(trimmedValue)) {
    return trimmedValue;
  }

  const normalizedHref = normalizeAppHref(trimmedValue, fallback);
  const normalizedBaseUrl = String(baseUrl || '').trim();
  if (!normalizedBaseUrl) {
    return buildAndroidAssetUrl(normalizedHref, fallback);
  }

  const sanitizedBaseUrl = normalizedBaseUrl.split('#')[0].split('?')[0];
  const lastSlashIndex = sanitizedBaseUrl.lastIndexOf('/');
  if (lastSlashIndex >= 0) {
    return `${sanitizedBaseUrl.slice(0, lastSlashIndex + 1)}${normalizedHref}`;
  }

  return buildAndroidAssetUrl(normalizedHref, fallback);
}

function getPathTail(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.pathname.split('/').pop() || '';
  } catch {
    const [withoutHash] = String(value || '').split('#');
    const [withoutQuery] = withoutHash.split('?');
    const segments = withoutQuery.split('/');
    return segments[segments.length - 1] || '';
  }
}

function getPageByHref(value: unknown): {key: AppPageKey; href: string} | null {
  const pathTail = getPathTail(String(value || '').trim());
  return APP_PAGES.find(page => page.href === pathTail) || null;
}

function getPageDisplayLabel(
  pageKey: AppPageKey | '',
  language: UiLanguage,
): string {
  if (!pageKey) {
    return selectShellText(language, '目标页面', 'destination page');
  }

  const labels = APP_PAGE_LABELS[pageKey];
  if (!labels) {
    return pageKey;
  }

  return language === 'en-US' ? labels.en : labels.zh;
}

function normalizeUiLanguage(value: unknown): UiLanguage {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'en' || normalized === 'en-us' ? 'en-US' : 'zh-CN';
}

function selectShellText(
  language: UiLanguage,
  chinese: string,
  english: string,
): string {
  return language === 'en-US' ? english : chinese;
}

function normalizeNavigationDirection(value: unknown): NavigationDirection | '' {
  if (value === 'forward' || value === 'back') {
    return value;
  }
  return '';
}

function shouldRefreshShellThemeForSections(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.some(section =>
    SHELL_THEME_SECTION_KEYS.has(String(section || '').trim()),
  );
}

function getNavigationDirection(
  fromKey: AppPageKey | '',
  toKey: AppPageKey,
): NavigationDirection {
  const fromIndex = APP_PAGES.findIndex(page => page.key === fromKey);
  const toIndex = APP_PAGES.findIndex(page => page.key === toKey);
  if (fromIndex < 0 || toIndex < 0) {
    return 'forward';
  }
  return toIndex >= fromIndex ? 'forward' : 'back';
}

function resolvePageTarget(
  baseUrl: string | null,
  payload: Record<string, unknown> = {},
): PageTarget | null {
  const hrefInput = typeof payload.href === 'string' ? payload.href.trim() : '';
  const pageFromHref = getPageByHref(hrefInput);
  const pageFromKey = getPageByKey(payload.page);
  const matchedPage = pageFromKey || pageFromHref;
  if (!matchedPage) {
    return null;
  }

  const nextHref = hrefInput || matchedPage.href;
  try {
    return {
      uri: resolveAppPageUri(baseUrl, nextHref, matchedPage.href),
      pageKey: matchedPage.key,
    };
  } catch {
    return null;
  }
}

export function getComparableUrl(value: string | null): string {
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    parsed.searchParams.delete('widgetAction');
    parsed.searchParams.delete('widgetKind');
    parsed.searchParams.delete('widgetSource');
    parsed.searchParams.delete('widgetLaunchId');
    parsed.searchParams.delete('widgetTargetId');
    parsed.searchParams.delete('widgetCreatedAt');
    parsed.searchParams.delete('widgetAnchorDate');
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(value || '').split('#')[0];
  }
}

function resolveLaunchContextPageKey(
  pageKey: unknown,
  widgetAction: unknown,
  widgetKind: unknown,
): AppPageKey | '' {
  const explicitPageKey = normalizePageKey(pageKey);
  if (explicitPageKey) {
    return explicitPageKey;
  }

  const normalizedAction = String(widgetAction || '').trim();
  if (normalizedAction && LAUNCH_ACTION_PAGE_MAP.has(normalizedAction)) {
    return LAUNCH_ACTION_PAGE_MAP.get(normalizedAction) || '';
  }

  const normalizedWidgetKind = String(widgetKind || '').trim();
  if (normalizedWidgetKind && WIDGET_KIND_PAGE_MAP.has(normalizedWidgetKind)) {
    return WIDGET_KIND_PAGE_MAP.get(normalizedWidgetKind) || '';
  }

  return '';
}

function normalizeLaunchContext(
  context: Partial<LaunchContext> | null | undefined,
): LaunchContext {
  const widgetKind =
    typeof context?.widgetKind === 'string' ? context.widgetKind.trim() : '';
  const inferredAction =
    widgetKind && WIDGET_KIND_ACTION_MAP.has(widgetKind)
      ? WIDGET_KIND_ACTION_MAP.get(widgetKind) || ''
      : '';
  const widgetAction =
    typeof context?.widgetAction === 'string' && context.widgetAction.trim()
      ? context.widgetAction.trim()
      : inferredAction;
  const widgetSource =
    typeof context?.widgetSource === 'string' ? context.widgetSource.trim() : '';
  const pageKey = resolveLaunchContextPageKey(
    context?.pageKey,
    widgetAction,
    widgetKind,
  );
  const widgetLaunchId =
    typeof context?.widgetLaunchId === 'string'
      ? context.widgetLaunchId.trim()
      : '';
  const widgetTargetId =
    typeof context?.widgetTargetId === 'string'
      ? context.widgetTargetId.trim()
      : '';
  const widgetCreatedAt = Math.max(
    0,
    Number(context?.widgetCreatedAt) || 0,
  );

  return {
    active:
      !!context?.active ||
      !!widgetKind ||
      !!widgetAction ||
      widgetSource === 'android-widget' ||
      widgetSource === 'launcher',
    pageKey,
    widgetKind,
    widgetAction,
    widgetSource,
    widgetLaunchId,
    widgetTargetId,
    widgetCreatedAt,
  };
}

function parseLaunchContextFromUrl(value: string | null): LaunchContext {
  const fallbackPage = getPageByHref(value)?.key || '';
  const emptyContext = normalizeLaunchContext({
    active: false,
    pageKey: fallbackPage,
    widgetKind: '',
    widgetAction: '',
    widgetSource: '',
    widgetLaunchId: '',
    widgetTargetId: '',
    widgetCreatedAt: 0,
  });

  try {
    const parsed = new URL(
      String(value || ''),
      'file:///android_asset/controler-web/index.html',
    );
    const widgetAction = String(
      parsed.searchParams.get('widgetAction') || '',
    ).trim();
    const widgetKind = String(parsed.searchParams.get('widgetKind') || '').trim();
    const widgetSource = String(
      parsed.searchParams.get('widgetSource') || '',
    ).trim();
    const widgetLaunchId = String(
      parsed.searchParams.get('widgetLaunchId') || '',
    ).trim();
    const widgetTargetId = String(
      parsed.searchParams.get('widgetTargetId') || '',
    ).trim();
    const widgetCreatedAt = Number(
      parsed.searchParams.get('widgetCreatedAt') || 0,
    );
    return normalizeLaunchContext({
      active:
        !!widgetAction ||
        !!widgetKind ||
        widgetSource === 'android-widget' ||
        widgetSource === 'launcher',
      pageKey: getPageByHref(parsed.toString())?.key || fallbackPage,
      widgetKind,
      widgetAction,
      widgetSource,
      widgetLaunchId,
      widgetTargetId,
      widgetCreatedAt:
        Number.isFinite(widgetCreatedAt) && widgetCreatedAt > 0
          ? Math.round(widgetCreatedAt)
          : 0,
    });
  } catch {
    return emptyContext;
  }
}

function parseLaunchContextFromPayload(
  payload: Record<string, unknown> | null | undefined,
): LaunchContext {
  const pageKey = normalizePageKey(payload?.page);
  const widgetAction =
    typeof payload?.action === 'string' ? payload.action.trim() : '';
  const widgetKind =
    typeof payload?.widgetKind === 'string' ? payload.widgetKind.trim() : '';
  const widgetSource =
    typeof payload?.source === 'string' ? payload.source.trim() : '';
  const widgetLaunchId =
    typeof payload?.launchId === 'string'
      ? payload.launchId.trim()
      : typeof payload?.widgetLaunchId === 'string'
        ? payload.widgetLaunchId.trim()
        : '';
  const widgetTargetId =
    typeof payload?.targetId === 'string'
      ? payload.targetId.trim()
      : typeof payload?.widgetTargetId === 'string'
        ? payload.widgetTargetId.trim()
        : '';
  const createdAtCandidate =
    typeof payload?.createdAt === 'number' || typeof payload?.createdAt === 'string'
      ? Number(payload.createdAt)
      : typeof payload?.widgetCreatedAt === 'number' ||
          typeof payload?.widgetCreatedAt === 'string'
        ? Number(payload.widgetCreatedAt)
        : 0;

  return normalizeLaunchContext({
    active:
      !!widgetAction ||
      !!widgetKind ||
      widgetSource === 'android-widget' ||
      widgetSource === 'launcher',
    pageKey,
    widgetKind,
    widgetAction,
    widgetSource,
    widgetLaunchId,
    widgetTargetId,
    widgetCreatedAt:
      Number.isFinite(createdAtCandidate) && createdAtCandidate > 0
        ? Math.round(createdAtCandidate)
        : 0,
  });
}

function createWidgetLaunchId(): string {
  return `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureWidgetLaunchId(context: LaunchContext): LaunchContext {
  const normalizedContext = normalizeLaunchContext(context);
  if (!normalizedContext.widgetAction) {
    return {
      ...normalizedContext,
      widgetLaunchId: '',
      widgetCreatedAt: 0,
    };
  }
  if (
    normalizedContext.widgetLaunchId &&
    normalizedContext.widgetCreatedAt > 0
  ) {
    return normalizedContext;
  }
  return {
    ...normalizedContext,
    widgetLaunchId:
      normalizedContext.widgetLaunchId || createWidgetLaunchId(),
    widgetCreatedAt:
      normalizedContext.widgetCreatedAt > 0
        ? normalizedContext.widgetCreatedAt
        : Date.now(),
  };
}

export function buildWidgetLaunchHref(
  pageKey: AppPageKey,
  context: Pick<
    LaunchContext,
    'widgetAction' | 'widgetKind' | 'widgetSource' | 'widgetLaunchId'
  > &
    Partial<Pick<LaunchContext, 'widgetTargetId' | 'widgetCreatedAt'>>,
): string {
  const pageHref = getPageByKey(pageKey)?.href || `${pageKey}.html`;
  const queryParts: string[] = [];
  const appendQueryPart = (key: string, value: string) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
      return;
    }
    queryParts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(normalizedValue)}`,
    );
  };
  const widgetAction = String(context.widgetAction || '').trim();
  const widgetKind = String(context.widgetKind || '').trim();
  const widgetSource =
    String(context.widgetSource || '').trim() || 'android-widget';
  const widgetLaunchId = String(context.widgetLaunchId || '').trim();
  const widgetTargetId = String(context.widgetTargetId || '').trim();
  const widgetCreatedAt = Math.max(0, Number(context.widgetCreatedAt) || 0);
  if (widgetAction) {
    appendQueryPart('widgetAction', widgetAction);
    appendQueryPart('widgetSource', widgetSource);
  }
  if (widgetKind) {
    appendQueryPart('widgetKind', widgetKind);
  }
  if (widgetLaunchId) {
    appendQueryPart('widgetLaunchId', widgetLaunchId);
  }
  if (widgetTargetId) {
    appendQueryPart('widgetTargetId', widgetTargetId);
  }
  if (widgetCreatedAt > 0) {
    appendQueryPart('widgetCreatedAt', String(Math.round(widgetCreatedAt)));
  }
  return queryParts.length > 0 ? `${pageHref}?${queryParts.join('&')}` : pageHref;
}

function buildLaunchContextSignature(
  context: Pick<
    LaunchContext,
    | 'pageKey'
    | 'widgetAction'
    | 'widgetKind'
    | 'widgetSource'
    | 'widgetLaunchId'
    | 'widgetTargetId'
  >,
): string {
  return [
    String(context.pageKey || '').trim(),
    String(context.widgetAction || '').trim(),
    String(context.widgetKind || '').trim(),
    String(context.widgetSource || '').trim(),
    String(context.widgetLaunchId || '').trim(),
    String(context.widgetTargetId || '').trim(),
  ].join('|');
}

function buildWidgetLaunchDispatchScript(
  pageKey: AppPageKey,
  context: Pick<
    LaunchContext,
    | 'widgetAction'
    | 'widgetKind'
    | 'widgetSource'
    | 'widgetLaunchId'
    | 'widgetTargetId'
    | 'widgetCreatedAt'
  >,
): string {
  const serialized = JSON.stringify({
    page: pageKey,
    action: String(context.widgetAction || '').trim(),
    widgetKind: String(context.widgetKind || '').trim(),
    source: String(context.widgetSource || '').trim() || 'android-widget',
    launchId: String(context.widgetLaunchId || '').trim(),
    targetId: String(context.widgetTargetId || '').trim(),
    createdAt: Math.max(0, Number(context.widgetCreatedAt) || 0),
    payload: {},
  })
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `
    (function () {
      const eventName =
        (window.ControlerWidgetsBridge &&
          window.ControlerWidgetsBridge.launchActionEventName) ||
        'controler:launch-action';
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: ${serialized},
        }),
      );
      return true;
    })();
    true;
  `;
}

function buildBridgeBootstrapScript(
  payload: Record<string, unknown>,
  themeState: Record<string, unknown> | null = null,
): string {
  const serialized = JSON.stringify(payload)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const serializedThemeState = JSON.stringify(
    buildLaunchThemeStatePayload(themeState),
  )
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const serializedThemeBootstrapState = JSON.stringify(
    buildLaunchThemeBootstrapState(themeState),
  )
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `
    (function () {
      window.__CONTROLER_RN_META__ = ${JSON.stringify(
        platformContract.getReactNativeRuntimeProfile(Platform.OS),
      )};
      try {
        const themeState = ${serializedThemeState};
        const themeBootstrapState = ${serializedThemeBootstrapState};
        const root = document.documentElement;
        if (window.localStorage && typeof window.localStorage.setItem === 'function') {
          window.localStorage.setItem(
            'selectedTheme',
            typeof themeState?.selectedTheme === 'string' &&
              themeState.selectedTheme.trim()
              ? themeState.selectedTheme.trim()
              : 'default',
          );
          window.localStorage.setItem(
            'customThemes',
            JSON.stringify(
              Array.isArray(themeState?.customThemes)
                ? themeState.customThemes
                : [],
            ),
          );
          window.localStorage.setItem(
            'builtInThemeOverrides',
            JSON.stringify(
              themeState?.builtInThemeOverrides &&
                typeof themeState.builtInThemeOverrides === 'object' &&
                !Array.isArray(themeState.builtInThemeOverrides)
                ? themeState.builtInThemeOverrides
                : {},
            ),
          );
        }
        if (root && themeBootstrapState && typeof themeBootstrapState === 'object') {
          if (
            typeof themeBootstrapState.themeId === 'string' &&
            themeBootstrapState.themeId.trim()
          ) {
            root.setAttribute('data-theme', themeBootstrapState.themeId.trim());
          }
          if (
            typeof themeBootstrapState.colorScheme === 'string' &&
            themeBootstrapState.colorScheme.trim()
          ) {
            root.style.colorScheme = themeBootstrapState.colorScheme.trim();
          }
          if (
            typeof themeBootstrapState.backgroundColor === 'string' &&
            themeBootstrapState.backgroundColor.trim()
          ) {
            root.style.backgroundColor = themeBootstrapState.backgroundColor.trim();
          }
          if (
            document.body &&
            typeof themeBootstrapState.backgroundColor === 'string' &&
            themeBootstrapState.backgroundColor.trim()
          ) {
            document.body.style.backgroundColor =
              themeBootstrapState.backgroundColor.trim();
          }
          if (
            typeof themeBootstrapState.textColor === 'string' &&
            themeBootstrapState.textColor.trim()
          ) {
            root.style.color = themeBootstrapState.textColor.trim();
          }
          const themeVariables =
            themeBootstrapState.variables &&
            typeof themeBootstrapState.variables === 'object' &&
            !Array.isArray(themeBootstrapState.variables)
              ? themeBootstrapState.variables
              : {};
          Object.keys(themeVariables).forEach((key) => {
            const value =
              typeof themeVariables[key] === 'string'
                ? themeVariables[key].trim()
                : '';
            if (!value) {
              return;
            }
            root.style.setProperty(key, value);
          });
        }
      } catch (_error) {}
      try {
        const storedLanguage =
          window.localStorage &&
          typeof window.localStorage.getItem === 'function'
            ? window.localStorage.getItem('${UI_LANGUAGE_STORAGE_KEY}')
            : '';
        const normalizedLanguage =
          storedLanguage === 'en' || storedLanguage === 'en-US'
            ? 'en-US'
            : 'zh-CN';
        if (
          window.ReactNativeWebView &&
          typeof window.ReactNativeWebView.postMessage === 'function'
        ) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'shell-language',
              payload: {
                language: normalizedLanguage,
              },
            }),
          );
        }
      } catch (_error) {}
      return true;
    })();
    (function () {
      window.__CONTROLER_SHELL_VISIBILITY__ = ${serialized};
      return true;
    })();
    true;
  `;
}

const dispatchNativeResumeScript =
  "window.dispatchEvent(new CustomEvent('controler:native-app-resume')); true;";

const closeTopModalScript = `
  (function () {
    const overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter((modal) => {
      if (!(modal instanceof HTMLElement)) {
        return false;
      }
      const computed = window.getComputedStyle(modal);
      return computed.display !== 'none' && computed.visibility !== 'hidden' && !modal.hasAttribute('hidden');
    });
    const topModal = overlays[overlays.length - 1];
    if (!topModal) {
      return true;
    }
    if (window.ControlerUI && typeof window.ControlerUI.closeModal === 'function') {
      window.ControlerUI.closeModal(topModal);
      return true;
    }
    if (topModal.parentNode) {
      topModal.parentNode.removeChild(topModal);
    }
    return true;
  })();
  true;
`;

function App({
  initialCoreStateJson = '',
  initialUiLanguage = DEFAULT_UI_LANGUAGE,
}: AppProps): JSX.Element {
  const initialCoreStateRef = useRef<Record<string, unknown> | null>(
    parseBridgeJson(initialCoreStateJson),
  );
  const launchThemeStateRef = useRef<Record<string, unknown>>(
    buildLaunchThemeStatePayload(initialCoreStateRef.current),
  );
  const primaryWebViewRef = useRef<WebView>(null);
  const secondaryWebViewRef = useRef<WebView>(null);
  const tertiaryWebViewRef = useRef<WebView>(null);
  const isPageReadyRef = useRef(false);
  const activeSlotRef = useRef<WebViewSlot>('primary');
  const appStateRef = useRef(AppState.currentState || 'active');
  const transitionStateRef = useRef<TransitionState | null>(null);
  const transitionTokenRef = useRef(0);
  const transitionWatchdogTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const transitionWatchdogRef = useRef<{
    startedAt: number;
    fromSlot: WebViewSlot;
    toSlot: WebViewSlot;
    targetUri: string;
    comparableUri: string;
  } | null>(null);
  const canGoBackBySlotRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const modalOpenBySlotRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const busyLockBySlotRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const slotLastUsedAtRef = useRef<Record<WebViewSlot, number>>({
    primary: 0,
    secondary: 0,
    tertiary: 0,
  });
  const hiddenPageKeysRef = useRef<Set<AppPageKey>>(new Set());
  const launchContextRef = useRef<LaunchContext>({
    active: false,
    pageKey: '',
    widgetKind: '',
    widgetAction: '',
    widgetSource: '',
    widgetLaunchId: '',
    widgetTargetId: '',
    widgetCreatedAt: 0,
  });
  const pendingWidgetLaunchDispatchRef =
    useRef<PendingWidgetLaunchDispatch | null>(null);
  const pendingWidgetLaunchAckRef = useRef<{
    launchContext: LaunchContext;
    pageKey: AppPageKey;
    attempts: number;
  } | null>(null);
  const widgetLaunchAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastHandledWidgetLaunchRef = useRef<{
    signature: string;
    handledAt: number;
  }>({
    signature: '',
    handledAt: 0,
  });
  const widgetPrewarmPendingRef = useRef(false);
  const widgetLaunchStartedAtRef = useRef(0);
  const widgetPrimaryReadyAtRef = useRef(0);
  const widgetPrewarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const navigationPrewarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shellVisibilitySignatureRef = useRef<Record<WebViewSlot, string>>({
    primary: '',
    secondary: '',
    tertiary: '',
  });
  const queuedNavigationRequestRef = useRef<QueuedNavigationRequest | null>(null);
  const lastVisiblePagePersistedRef = useRef<AppPageKey | ''>('');
  const postBridgeEventRef = useRef(
    (
      _slot: WebViewSlot,
      _name: string,
      _payload: Record<string, unknown> = {},
    ) => {},
  );
  const requestPageNavigationRef = useRef(
    (
      _payload: Record<string, unknown> = {},
      _source: NavigationRequestSource = 'bridge',
    ): NavigationRequestResult => 'noop',
  );
  const shellLanguageRef = useRef<UiLanguage>(
    normalizeUiLanguage(initialUiLanguage),
  );

  const [bootError, setBootError] = useState<string | null>(null);
  const [shellLanguage, setShellLanguage] =
    useState<UiLanguage>(() => normalizeUiLanguage(initialUiLanguage));
  const [shellBootTheme, setShellBootTheme] =
    useState<ShellBootTheme>(() =>
      resolveShellBootTheme(initialCoreStateRef.current),
    );
  const [isPageReady, setIsPageReady] = useState(false);
  const [busyStateVersion, setBusyStateVersion] = useState(0);
  const [activeSlot, setActiveSlot] = useState<WebViewSlot>('primary');
  const [transitionState, setTransitionState] =
    useState<TransitionState | null>(null);
  const [webViewHostWidth, setWebViewHostWidth] = useState(
    INITIAL_WEBVIEW_WIDTH,
  );
  const webViewHostLayoutRef = useRef({
    width: INITIAL_WEBVIEW_WIDTH,
    height: INITIAL_WEBVIEW_HEIGHT,
  });
  const [webViewSlots, setWebViewSlots] = useState<
    Record<WebViewSlot, WebViewSlotState>
  >({
    primary: {
      uri: null,
      pageKey: '',
      revision: 0,
    },
    secondary: {
      uri: null,
      pageKey: '',
      revision: 0,
    },
    tertiary: {
      uri: null,
      pageKey: '',
      revision: 0,
    },
  });
  const webViewSlotsRef = useRef(webViewSlots);
  const edgeBackSwipeExclusionBySlotRef = useRef<
    Record<WebViewSlot, EdgeBackSwipeExclusionState>
  >({
    primary: createDefaultEdgeBackSwipeExclusionState(),
    secondary: createDefaultEdgeBackSwipeExclusionState(),
    tertiary: createDefaultEdgeBackSwipeExclusionState(),
  });
  const transitionProgress = useRef(new Animated.Value(0)).current;
  const bootOverlayOpacity = useRef(new Animated.Value(1)).current;
  const bootCardScale = useRef(new Animated.Value(0.98)).current;
  const bootPulse = useRef(new Animated.Value(0)).current;

  const ScreenContainer = Platform.OS === 'ios' ? SafeAreaView : View;

  useEffect(() => {
    shellLanguageRef.current = shellLanguage;
  }, [shellLanguage]);

  const shellText = useCallback((chinese: string, english: string) => {
    return selectShellText(shellLanguageRef.current, chinese, english);
  }, []);

  const updateShellLanguage = useCallback((value: unknown): UiLanguage => {
    const normalizedLanguage = normalizeUiLanguage(value);
    shellLanguageRef.current = normalizedLanguage;
    setShellLanguage(currentLanguage =>
      currentLanguage === normalizedLanguage
        ? currentLanguage
        : normalizedLanguage,
    );
    return normalizedLanguage;
  }, []);

  const persistShellLanguage = useCallback(
    async (value: unknown): Promise<UiLanguage> => {
      const normalizedLanguage = updateShellLanguage(value);
      if (typeof nativeBridge?.setUiLanguage === 'function') {
        try {
          await nativeBridge.setUiLanguage(normalizedLanguage);
        } catch {
          // The shell can fall back to in-memory language state if persistence fails.
        }
      }
      return normalizedLanguage;
    },
    [updateShellLanguage],
  );

  const createShellError = useCallback(
    (chinese: string, english: string) =>
      new Error(shellText(chinese, english)),
    [shellText],
  );

  const createMissingBridgeError = useCallback(
    () =>
      createShellError(
        '缺少 ControlerBridge 原生模块。',
        'Missing the native ControlerBridge module.',
      ),
    [createShellError],
  );

  const createUnsupportedBridgeError = useCallback(
    (chineseAction: string, englishAction: string) =>
      createShellError(
        `当前原生桥不支持${chineseAction}。`,
        `The current native bridge does not support ${englishAction}.`,
      ),
    [createShellError],
  );

  const logPerfMetric = useCallback(
    (name: string, payload: Record<string, unknown> = {}) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info('[controler-perf]', {
          name,
          ...payload,
        });
      }
    },
    [],
  );

  const showNativeToast = useCallback((message: string) => {
    const normalizedMessage = String(message || '').trim();
    if (
      !normalizedMessage ||
      typeof nativeBridge?.showToast !== 'function'
    ) {
      return;
    }
    nativeBridge.showToast(normalizedMessage).catch(() => undefined);
  }, []);

  const applyShellBootThemeFromCoreState = useCallback(
    (coreState: Record<string, unknown> | null) => {
      const resolvedBootTheme = resolveShellBootTheme(coreState);
      setShellBootTheme(currentTheme =>
        areShellBootThemesEqual(currentTheme, resolvedBootTheme)
          ? currentTheme
          : resolvedBootTheme,
      );
      return resolvedBootTheme;
    },
    [],
  );

  const persistLaunchThemeState = useCallback(
    async (coreState: Record<string, unknown> | null) => {
      const normalizedThemeState = buildLaunchThemeStatePayload(coreState);
      launchThemeStateRef.current = normalizedThemeState;
      if (typeof nativeBridge?.setLaunchThemeState !== 'function') {
        return '';
      }
      return nativeBridge.setLaunchThemeState(
        JSON.stringify(normalizedThemeState),
      );
    },
    [],
  );

  const refreshShellBootThemeFromNative = useCallback(async () => {
    if (typeof nativeBridge?.getStorageCoreState !== 'function') {
      return null;
    }
    const coreState = parseBridgeJson(await nativeBridge.getStorageCoreState());
    launchThemeStateRef.current = buildLaunchThemeStatePayload(coreState);
    applyShellBootThemeFromCoreState(coreState);
    persistLaunchThemeState(coreState).catch(() => undefined);
    return coreState;
  }, [applyShellBootThemeFromCoreState, persistLaunchThemeState]);

  const persistLastVisiblePage = useCallback((pageKey: AppPageKey | '') => {
    if (
      !IS_ANDROID ||
      !pageKey ||
      typeof nativeBridge?.setLastVisiblePage !== 'function'
    ) {
      return;
    }
    if (lastVisiblePagePersistedRef.current === pageKey) {
      return;
    }
    lastVisiblePagePersistedRef.current = pageKey;
    nativeBridge.setLastVisiblePage(pageKey).catch(() => {
      lastVisiblePagePersistedRef.current = '';
    });
  }, []);

  useEffect(() => {
    webViewSlotsRef.current = webViewSlots;
  }, [webViewSlots]);

  useEffect(() => {
    let mounted = true;

    async function loadShellLanguage() {
      if (typeof nativeBridge?.getUiLanguage !== 'function') {
        return;
      }
      try {
        const storedLanguage = await nativeBridge.getUiLanguage();
        if (mounted) {
          updateShellLanguage(storedLanguage);
        }
      } catch {
        // The default language remains zh-CN if the shell preference cannot be read.
      }
    }

    loadShellLanguage().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [updateShellLanguage]);

  useEffect(() => {
    let mounted = true;

    async function loadShellBootTheme() {
      try {
        if (typeof nativeBridge?.getLaunchThemeState === 'function') {
          const storedThemeState = parseBridgeJson(
            await nativeBridge.getLaunchThemeState(),
          );
          if (storedThemeState) {
            launchThemeStateRef.current =
              buildLaunchThemeStatePayload(storedThemeState);
            applyShellBootThemeFromCoreState(storedThemeState);
            initialCoreStateRef.current = {
              ...(initialCoreStateRef.current || {}),
              ...launchThemeStateRef.current,
            };
          }
        }
        const coreState = await refreshShellBootThemeFromNative();
        if (!mounted) {
          return;
        }
        initialCoreStateRef.current = coreState;
      } catch {
        // The shell keeps the default palette if the saved theme is unavailable.
      }
    }

    loadShellBootTheme().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [refreshShellBootThemeFromNative]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    transitionStateRef.current = transitionState;
  }, [transitionState]);

  useEffect(() => {
    persistLastVisiblePage(webViewSlots[activeSlot].pageKey);
  }, [activeSlot, persistLastVisiblePage, webViewSlots]);

  const getWebViewRef = (slot: WebViewSlot) =>
    slot === 'primary'
      ? primaryWebViewRef
      : slot === 'secondary'
        ? secondaryWebViewRef
        : tertiaryWebViewRef;

  const handleShellBackNavigation = useCallback((allowExit = true) => {
    if (transitionStateRef.current) {
      return true;
    }

    const currentSlot = activeSlotRef.current;
    if (busyLockBySlotRef.current[currentSlot]) {
      return true;
    }

    const currentWebViewRef = getWebViewRef(currentSlot);
    if (modalOpenBySlotRef.current[currentSlot]) {
      currentWebViewRef.current?.injectJavaScript(closeTopModalScript);
      return true;
    }

    if (canGoBackBySlotRef.current[currentSlot]) {
      currentWebViewRef.current?.goBack();
      return true;
    }

    if (allowExit && Platform.OS === 'android') {
      BackHandler.exitApp();
      return true;
    }

    return false;
  }, []);

  const canStartEdgeBackSwipe = useCallback(() => {
    if (transitionStateRef.current) {
      return false;
    }

    const currentSlot = activeSlotRef.current;
    if (busyLockBySlotRef.current[currentSlot]) {
      return false;
    }

    if (modalOpenBySlotRef.current[currentSlot]) {
      return true;
    }

    if (canGoBackBySlotRef.current[currentSlot]) {
      return true;
    }

    return false;
  }, []);

  const isEdgeBackSwipeStartExcluded = useCallback(
    (pointX: number, pointY: number) => {
      if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
        return false;
      }

      const currentSlot = activeSlotRef.current;
      const exclusionState = edgeBackSwipeExclusionBySlotRef.current[currentSlot];
      if (!exclusionState.rects.length) {
        return false;
      }

      const hostWidth = Math.max(webViewHostLayoutRef.current.width || 0, 1);
      const hostHeight = Math.max(webViewHostLayoutRef.current.height || 0, 1);
      const normalizedX =
        exclusionState.viewportWidth > 0
          ? pointX * (exclusionState.viewportWidth / hostWidth)
          : pointX;
      const normalizedY =
        exclusionState.viewportHeight > 0
          ? pointY * (exclusionState.viewportHeight / hostHeight)
          : pointY;

      return exclusionState.rects.some(
        rect =>
          normalizedX >= rect.left &&
          normalizedX <= rect.right &&
          normalizedY >= rect.top &&
          normalizedY <= rect.bottom,
      );
    },
    [],
  );

  const shouldCaptureEdgeBackSwipe = (gestureState: {
    dx: number;
    dy: number;
    x0: number;
    y0: number;
  }) =>
    canStartEdgeBackSwipe() &&
    !isEdgeBackSwipeStartExcluded(gestureState.x0, gestureState.y0) &&
    gestureState.dx >= 2 &&
    Math.abs(gestureState.dy) <= EDGE_BACK_SWIPE_MAX_VERTICAL_DRIFT &&
    Math.abs(gestureState.dx) >=
      Math.abs(gestureState.dy) * EDGE_BACK_SWIPE_HORIZONTAL_DOMINANCE_RATIO;

  const shouldFinishEdgeBackSwipe = (gestureState: {
    dx: number;
    dy: number;
    vx: number;
  }) =>
    Math.abs(gestureState.dy) <= EDGE_BACK_SWIPE_MAX_VERTICAL_DRIFT &&
    (gestureState.dx >= EDGE_BACK_SWIPE_MIN_DISTANCE ||
      (gestureState.dx >= EDGE_BACK_SWIPE_MIN_FLING_DISTANCE &&
        gestureState.vx >= EDGE_BACK_SWIPE_MIN_VELOCITY));

  const edgeBackPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        shouldCaptureEdgeBackSwipe(gestureState),
      onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
        shouldCaptureEdgeBackSwipe(gestureState),
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: (_event, gestureState) => {
        if (shouldFinishEdgeBackSwipe(gestureState)) {
          handleShellBackNavigation(true);
        }
      },
      onPanResponderTerminate: (_event, gestureState) => {
        if (shouldFinishEdgeBackSwipe(gestureState)) {
          handleShellBackNavigation(true);
        }
      },
    }),
  ).current;

  const getPageKeyForSlot = useCallback(
    (slot: WebViewSlot) => webViewSlotsRef.current[slot].pageKey,
    [],
  );

  const markSlotUsed = useCallback((slot: WebViewSlot) => {
    slotLastUsedAtRef.current[slot] = Date.now();
  }, []);

  const markWidgetLaunchWindow = useCallback((launchContext: LaunchContext) => {
    if (!launchContext.active || !IS_ANDROID) {
      widgetLaunchStartedAtRef.current = 0;
      widgetPrimaryReadyAtRef.current = 0;
      widgetPrewarmPendingRef.current = false;
      return;
    }
    widgetLaunchStartedAtRef.current = Date.now();
    widgetPrimaryReadyAtRef.current = 0;
    widgetPrewarmPendingRef.current = true;
  }, []);

  const settleWidgetLaunchWindowIfExpired = useCallback(() => {
    const launchStartedAt = widgetLaunchStartedAtRef.current;
    if (
      !launchContextRef.current.active ||
      !launchStartedAt ||
      Date.now() - launchStartedAt < WIDGET_LAUNCH_PREWARM_WINDOW_MS
    ) {
      return false;
    }

    launchContextRef.current = {
      ...launchContextRef.current,
      active: false,
      widgetAction: '',
      widgetKind: '',
    };
    widgetPrewarmPendingRef.current = false;
    widgetPrimaryReadyAtRef.current = 0;
    return true;
  }, []);

  const clearCachedSlot = useCallback((slot: WebViewSlot) => {
    canGoBackBySlotRef.current[slot] = false;
    modalOpenBySlotRef.current[slot] = false;
    busyLockBySlotRef.current[slot] = false;
    edgeBackSwipeExclusionBySlotRef.current[slot] =
      createDefaultEdgeBackSwipeExclusionState();
    slotLastUsedAtRef.current[slot] = 0;
    shellVisibilitySignatureRef.current[slot] = '';
    updateWebViewSlotsRef(webViewSlotsRef, slot, {
      uri: null,
      pageKey: '',
    });
    setWebViewSlots(current => ({
      ...current,
      [slot]: {
        ...current[slot],
        uri: null,
        pageKey: '',
      },
    }));
  }, []);

  const clearInactiveCachedSlots = useCallback(
    (preserveSlots: WebViewSlot[] = []) => {
      const preservedSlots = new Set<WebViewSlot>([
        activeSlotRef.current,
        ...preserveSlots,
      ]);
      const currentTransition = transitionStateRef.current;
      if (currentTransition) {
        preservedSlots.add(currentTransition.fromSlot);
        preservedSlots.add(currentTransition.toSlot);
      }

      WEBVIEW_SLOTS.forEach(slot => {
        if (
          preservedSlots.has(slot) ||
          !webViewSlotsRef.current[slot].uri
        ) {
          return;
        }
        clearCachedSlot(slot);
      });
    },
    [clearCachedSlot],
  );

  const isPageKeyHidden = useCallback((pageKey: AppPageKey | '') => {
    return pageKey !== '' && hiddenPageKeysRef.current.has(pageKey);
  }, []);

  const clearHiddenCachedSlots = useCallback(
    (preserveSlots: WebViewSlot[] = []) => {
      const preservedSlots = new Set<WebViewSlot>([
        activeSlotRef.current,
        ...preserveSlots,
      ]);
      const currentTransition = transitionStateRef.current;
      if (currentTransition) {
        preservedSlots.add(currentTransition.fromSlot);
        preservedSlots.add(currentTransition.toSlot);
      }

      WEBVIEW_SLOTS.forEach(slot => {
        if (preservedSlots.has(slot)) {
          return;
        }
        if (!isPageKeyHidden(webViewSlotsRef.current[slot].pageKey)) {
          return;
        }
        clearCachedSlot(slot);
      });
    },
    [clearCachedSlot, isPageKeyHidden],
  );

  const prewarmWidgetLandingPages = useCallback(() => {
    if (settleWidgetLaunchWindowIfExpired()) {
      return;
    }
    if (
      !IS_ANDROID ||
      transitionStateRef.current ||
      !isPageReadyRef.current ||
      !widgetPrewarmPendingRef.current
    ) {
      return;
    }
    if (isAndroidWidgetActionLaunch(launchContextRef.current, IS_ANDROID)) {
      widgetPrewarmPendingRef.current = false;
      return;
    }

    const activeState = webViewSlotsRef.current[activeSlotRef.current];
    if (!activeState.uri) {
      return;
    }

    const priorityPages: AppPageKey[] = [];
    const launchPage = launchContextRef.current.pageKey;
    if (
      launchPage &&
      launchPage !== activeState.pageKey &&
      !hiddenPageKeysRef.current.has(launchPage)
    ) {
      priorityPages.push(launchPage);
    }

    (['todo', 'plan', 'stats', 'diary', 'index'] as AppPageKey[]).forEach(
      pageKey => {
        if (
          pageKey === activeState.pageKey ||
          hiddenPageKeysRef.current.has(pageKey) ||
          priorityPages.includes(pageKey)
        ) {
          return;
        }
        priorityPages.push(pageKey);
      },
    );

    const inactiveSlots = WEBVIEW_SLOTS.filter(
      slot => slot !== activeSlotRef.current,
    );
    const desiredPages = priorityPages.slice(
      0,
      Math.max(1, inactiveSlots.length || 0),
    );
    if (desiredPages.length === 0) {
      widgetPrewarmPendingRef.current = false;
      return;
    }
    const preservedSlots = new Set<WebViewSlot>();

    desiredPages.forEach(pageKey => {
      const target = resolvePageTarget(activeState.uri, {
        page: pageKey,
        href: `${pageKey}.html`,
      });
      if (!target) {
        return;
      }

      const comparableTargetUri = getComparableUrl(target.uri);
      const existingSlot = inactiveSlots.find(
        slot =>
          !preservedSlots.has(slot) &&
          getComparableUrl(webViewSlotsRef.current[slot].uri) ===
            comparableTargetUri,
      );
      if (existingSlot) {
        preservedSlots.add(existingSlot);
        markSlotUsed(existingSlot);
        return;
      }

      const targetSlot =
        inactiveSlots.find(
          slot =>
            !preservedSlots.has(slot) && !webViewSlotsRef.current[slot].uri,
        ) ||
        inactiveSlots.find(
          slot =>
            !preservedSlots.has(slot) &&
            isPageKeyHidden(webViewSlotsRef.current[slot].pageKey),
        ) ||
        inactiveSlots.find(slot => !preservedSlots.has(slot));
      if (!targetSlot) {
        return;
      }

      updateWebViewSlotsRef(webViewSlotsRef, targetSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: webViewSlotsRef.current[targetSlot].revision + 1,
      });
      setWebViewSlots(current => ({
        ...current,
        [targetSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: current[targetSlot].revision + 1,
        },
      }));
      preservedSlots.add(targetSlot);
      markSlotUsed(targetSlot);
      logPerfMetric('webview-prewarm', {
        slot: targetSlot,
        page: target.pageKey,
        targetUri: target.uri,
        activePage: activeState.pageKey,
        widgetKind: launchContextRef.current.widgetKind,
        widgetAction: launchContextRef.current.widgetAction,
      });
    });

    inactiveSlots.forEach(slot => {
      if (!preservedSlots.has(slot) && webViewSlotsRef.current[slot].uri) {
        clearCachedSlot(slot);
      }
    });
    widgetPrewarmPendingRef.current = false;
  }, [
    clearCachedSlot,
    isPageKeyHidden,
    logPerfMetric,
    markSlotUsed,
    settleWidgetLaunchWindowIfExpired,
  ]);

  const findReusableSlot = useCallback(
    (
      currentSlot: WebViewSlot,
      targetUri: string,
    ): {slot: WebViewSlot; needsLoad: boolean} => {
      settleWidgetLaunchWindowIfExpired();
      const reusableSlots = WEBVIEW_SLOTS;
      const comparableTargetUrl = getComparableUrl(targetUri);
      const cachedTargetSlot = reusableSlots.find(slot => {
        if (slot === currentSlot) {
          return false;
        }
        if (isPageKeyHidden(webViewSlotsRef.current[slot].pageKey)) {
          return false;
        }
        return (
          getComparableUrl(webViewSlotsRef.current[slot].uri) === comparableTargetUrl
        );
      });
      if (cachedTargetSlot) {
        return {
          slot: cachedTargetSlot,
          needsLoad: false,
        };
      }

      const freeSlot = reusableSlots.find(
        slot => slot !== currentSlot && !webViewSlotsRef.current[slot].uri,
      );
      if (freeSlot) {
        return {
          slot: freeSlot,
          needsLoad: true,
        };
      }

      let fallbackSlot: WebViewSlot = 'secondary';
      let oldestUsedAt = Number.POSITIVE_INFINITY;
      let fallbackPriority = Number.POSITIVE_INFINITY;
      reusableSlots.forEach(slot => {
        if (slot === currentSlot) {
          return;
        }
        const priority = isPageKeyHidden(webViewSlotsRef.current[slot].pageKey)
          ? 0
          : 1;
        const usedAt = slotLastUsedAtRef.current[slot] || 0;
        if (
          priority < fallbackPriority ||
          (priority === fallbackPriority && usedAt < oldestUsedAt)
        ) {
          fallbackPriority = priority;
          oldestUsedAt = usedAt;
          fallbackSlot = slot;
        }
      });
      return {
        slot: fallbackSlot,
        needsLoad: true,
      };
    },
    [isPageKeyHidden, settleWidgetLaunchWindowIfExpired],
  );

  const prewarmNavigationPage = useCallback(
    (pageKey: AppPageKey) => {
      if (
        transitionStateRef.current ||
        !isPageReadyRef.current ||
        isPageKeyHidden(pageKey)
      ) {
        return false;
      }

      const activeSlot = activeSlotRef.current;
      const activeState = webViewSlotsRef.current[activeSlot];
      if (!activeState.uri || activeState.pageKey === pageKey) {
        return false;
      }

      const target = resolvePageTarget(activeState.uri, {
        page: pageKey,
        href: `${pageKey}.html`,
      });
      if (!target) {
        return false;
      }

      const comparableTargetUri = getComparableUrl(target.uri);
      const cachedSlot = WEBVIEW_SLOTS.find(
        slot =>
          getComparableUrl(webViewSlotsRef.current[slot].uri) ===
          comparableTargetUri,
      );
      if (cachedSlot) {
        if (cachedSlot !== activeSlot) {
          markSlotUsed(cachedSlot);
        }
        return true;
      }

      const nextSlotState = findReusableSlot(activeSlot, target.uri);
      const targetSlot = nextSlotState.slot;
      if (!targetSlot || targetSlot === activeSlot || !nextSlotState.needsLoad) {
        return false;
      }

      updateWebViewSlotsRef(webViewSlotsRef, targetSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: webViewSlotsRef.current[targetSlot].revision + 1,
      });
      setWebViewSlots(current => ({
        ...current,
        [targetSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: current[targetSlot].revision + 1,
        },
      }));
      markSlotUsed(targetSlot);
      logPerfMetric('navigation-prewarm', {
        slot: targetSlot,
        page: target.pageKey,
        activePage: activeState.pageKey,
        targetUri: target.uri,
      });
      return true;
    },
    [findReusableSlot, isPageKeyHidden, logPerfMetric, markSlotUsed],
  );

  const clearTransitionWatchdog = useCallback(() => {
    if (transitionWatchdogTimerRef.current !== null) {
      clearTimeout(transitionWatchdogTimerRef.current);
      transitionWatchdogTimerRef.current = null;
    }
    transitionWatchdogRef.current = null;
  }, []);

  const clearWidgetPrewarmTimer = useCallback(() => {
    if (widgetPrewarmTimerRef.current !== null) {
      clearTimeout(widgetPrewarmTimerRef.current);
      widgetPrewarmTimerRef.current = null;
    }
  }, []);

  const clearNavigationPrewarmTimer = useCallback(() => {
    if (navigationPrewarmTimerRef.current !== null) {
      clearTimeout(navigationPrewarmTimerRef.current);
      navigationPrewarmTimerRef.current = null;
    }
  }, []);

  const syncShellVisibility = useCallback((reason = 'shell-state') => {
    const loadingTransition = transitionStateRef.current;
    const shellActiveSlot =
      loadingTransition?.status === 'loading'
        ? loadingTransition.toSlot
        : activeSlotRef.current;

    WEBVIEW_SLOTS.forEach(slot => {
      const slotState = webViewSlotsRef.current[slot];
      if (!slotState.uri) {
        shellVisibilitySignatureRef.current[slot] = '';
        return;
      }

      const payload = {
        active: slot === shellActiveSlot,
        slot,
        reason,
        page: slotState.pageKey,
        href: slotState.uri,
      };
      const signature = JSON.stringify(payload);
      if (shellVisibilitySignatureRef.current[slot] === signature) {
        return;
      }
      shellVisibilitySignatureRef.current[slot] = signature;
      postBridgeEventRef.current(slot, 'ui.shell-visibility', payload);
    });
  }, []);

  const dispatchWidgetLaunchActionToSlot = useCallback(
    (
      slot: WebViewSlot,
      pageKey: AppPageKey,
      launchContext: Pick<
        LaunchContext,
        | 'widgetAction'
        | 'widgetKind'
        | 'widgetSource'
        | 'widgetLaunchId'
        | 'widgetTargetId'
        | 'widgetCreatedAt'
      >,
    ) => {
      const script = buildWidgetLaunchDispatchScript(pageKey, launchContext);
      logPerfMetric('inject-javascript', {
        slot,
        page: pageKey,
        kind: 'widget-launch-action',
        widgetAction: launchContext.widgetAction,
        widgetKind: launchContext.widgetKind,
        sizeBytes: script.length,
      });
      getWebViewRef(slot).current?.injectJavaScript(script);
    },
    [logPerfMetric],
  );

  const queueWidgetLaunchDispatch = useCallback(
    (
      pageKey: AppPageKey,
      comparableUri: string,
      launchContext: LaunchContext,
    ) => {
      const widgetAction = String(launchContext.widgetAction || '').trim();
      if (!widgetAction) {
        pendingWidgetLaunchDispatchRef.current = null;
        return;
      }

      pendingWidgetLaunchDispatchRef.current = {
        pageKey,
        comparableUri,
        launchContext: {
          ...launchContext,
          pageKey,
          widgetAction,
        },
        queuedAt: Date.now(),
      };
    },
    [],
  );

  const dispatchQueuedWidgetLaunchIfReady = useCallback(
    (slot: WebViewSlot, reason = 'queued-dispatch') => {
      const pendingDispatch = pendingWidgetLaunchDispatchRef.current;
      if (!pendingDispatch || !pendingDispatch.launchContext.widgetAction) {
        return false;
      }

      const slotState = webViewSlotsRef.current[slot];
      if (!slotState.uri || slotState.pageKey !== pendingDispatch.pageKey) {
        return false;
      }

      pendingWidgetLaunchDispatchRef.current = null;
      dispatchWidgetLaunchActionToSlot(
        slot,
        pendingDispatch.pageKey,
        pendingDispatch.launchContext,
      );
      logPerfMetric('launch-action-dispatched', {
        reason,
        slot,
        page: pendingDispatch.pageKey,
        action: pendingDispatch.launchContext.widgetAction,
        widgetKind: pendingDispatch.launchContext.widgetKind,
      });
      return true;
    },
    [dispatchWidgetLaunchActionToSlot, logPerfMetric],
  );

  const broadcastStorageChangeEventToLoadedSlots = useCallback(
    (
      payload: BridgeEnvelopePayload | undefined,
      options: {sourceSlot?: WebViewSlot | null} = {},
    ) => {
      const rawChangedSections = Array.isArray(payload?.changedSections)
        ? (payload?.changedSections as unknown[])
        : [];
      const changedSections = rawChangedSections
        .map(section => String(section || '').trim())
        .filter(Boolean);
      const changedPeriods = Object.entries(
        payload?.changedPeriods && typeof payload.changedPeriods === 'object'
          ? payload.changedPeriods
          : {},
      ).reduce((acc: Record<string, string[]>, [section, periodIds]) => {
        const normalizedSection = String(section || '').trim();
        if (!normalizedSection) {
          return acc;
        }
        const normalizedPeriods = Array.isArray(periodIds)
          ? (periodIds as unknown[])
              .map(periodId => String(periodId || '').trim())
              .filter(Boolean)
          : [];
        if (normalizedPeriods.length > 0) {
          acc[normalizedSection] = normalizedPeriods;
        }
        return acc;
      }, {});
      const reason =
        typeof payload?.reason === 'string' && payload.reason.trim()
          ? payload.reason.trim()
          : 'external-update';
      const source =
        typeof payload?.source === 'string' && payload.source.trim()
          ? payload.source.trim()
          : 'webview';
      const sourceSlot = options.sourceSlot || null;

      WEBVIEW_SLOTS.forEach(targetSlot => {
        if (sourceSlot && targetSlot === sourceSlot) {
          return;
        }
        if (!webViewSlotsRef.current[targetSlot].uri) {
          return;
        }
        postBridgeEventRef.current(targetSlot, 'storage.changed', {
          reason,
          source,
          changedSections,
          changedPeriods,
        });
      });
    },
    [],
  );

  const broadcastStorageChangeBridgeEvent = useCallback(
    (sourceSlot: WebViewSlot, payload: BridgeEnvelopePayload | undefined) => {
      broadcastStorageChangeEventToLoadedSlots(payload, {
        sourceSlot,
      });
    },
    [broadcastStorageChangeEventToLoadedSlots],
  );

  const revealWebView = useCallback(() => {
    if (isPageReadyRef.current) {
      return;
    }

    isPageReadyRef.current = true;
    bootOverlayOpacity.stopAnimation();
    bootCardScale.stopAnimation();
    bootOverlayOpacity.setValue(0);
    bootCardScale.setValue(1);
    setIsPageReady(true);
  }, [bootCardScale, bootOverlayOpacity]);

  const resetWebViewPresentation = useCallback(() => {
    transitionTokenRef.current += 1;
    isPageReadyRef.current = false;
    setIsPageReady(false);
    clearTransitionWatchdog();
    bootOverlayOpacity.stopAnimation();
    bootCardScale.stopAnimation();
    transitionProgress.stopAnimation();
    bootOverlayOpacity.setValue(1);
    bootCardScale.setValue(0.98);
    transitionProgress.setValue(0);
    canGoBackBySlotRef.current = {
      primary: false,
      secondary: false,
      tertiary: false,
    };
    modalOpenBySlotRef.current = {
      primary: false,
      secondary: false,
      tertiary: false,
    };
    busyLockBySlotRef.current = {
      primary: false,
      secondary: false,
      tertiary: false,
    };
    queuedNavigationRequestRef.current = null;
    transitionStateRef.current = null;
    setTransitionState(null);
  }, [
    bootCardScale,
    bootOverlayOpacity,
    clearTransitionWatchdog,
    transitionProgress,
  ]);

  const clearWidgetLaunchAckTimer = useCallback(() => {
    if (widgetLaunchAckTimerRef.current !== null) {
      clearTimeout(widgetLaunchAckTimerRef.current);
      widgetLaunchAckTimerRef.current = null;
    }
  }, []);

  const clearPendingWidgetLaunchAck = useCallback(
    (launchId = '') => {
      const pendingAck = pendingWidgetLaunchAckRef.current;
      if (
        pendingAck &&
        launchId &&
        pendingAck.launchContext.widgetLaunchId !== launchId
      ) {
        return false;
      }
      pendingWidgetLaunchAckRef.current = null;
      clearWidgetLaunchAckTimer();
      return !!pendingAck;
    },
    [clearWidgetLaunchAckTimer],
  );

  const scheduleWidgetLaunchAckWatchdog = useCallback(
    (launchContext: LaunchContext, pageKey: AppPageKey) => {
      if (!launchContext.widgetAction || !launchContext.widgetLaunchId) {
        clearPendingWidgetLaunchAck();
        return;
      }

      pendingWidgetLaunchAckRef.current = {
        launchContext,
        pageKey,
        attempts: 0,
      };
      clearWidgetLaunchAckTimer();

      const armWatchdog = (delayMs: number) => {
        widgetLaunchAckTimerRef.current = setTimeout(() => {
          const pendingAck = pendingWidgetLaunchAckRef.current;
          if (
            !pendingAck ||
            pendingAck.launchContext.widgetLaunchId !== launchContext.widgetLaunchId
          ) {
            return;
          }

          const activeState = webViewSlotsRef.current[activeSlotRef.current];
          if (
            pendingAck.attempts <= 0 &&
            activeState.pageKey === pageKey &&
            isPageReadyRef.current
          ) {
            pendingAck.attempts = 1;
            dispatchWidgetLaunchActionToSlot(
              activeSlotRef.current,
              pageKey,
              pendingAck.launchContext,
            );
            logPerfMetric('launch-action-redispatched', {
              slot: activeSlotRef.current,
              page: pageKey,
              action: pendingAck.launchContext.widgetAction,
              widgetKind: pendingAck.launchContext.widgetKind,
            });
            armWatchdog(WIDGET_LAUNCH_CONFIRM_RETRY_MS);
            return;
          }

          pendingWidgetLaunchAckRef.current = null;
          clearWidgetLaunchAckTimer();
          logPerfMetric('launch-action-ack-timeout', {
            page: pageKey,
            action: pendingAck.launchContext.widgetAction,
            widgetKind: pendingAck.launchContext.widgetKind,
          });
        }, delayMs);
      };

      armWatchdog(WIDGET_LAUNCH_CONFIRM_TIMEOUT_MS);
    },
    [
      clearPendingWidgetLaunchAck,
      clearWidgetLaunchAckTimer,
      dispatchWidgetLaunchActionToSlot,
      logPerfMetric,
    ],
  );

  const isTransitionWatchdogExpired = () => {
    const watchdog = transitionWatchdogRef.current;
    if (!watchdog) {
      return false;
    }
    return Date.now() - watchdog.startedAt >= PAGE_SWITCH_LOAD_TIMEOUT_MS;
  };

  const clearPendingTransition = (slot: WebViewSlot) => {
    const currentTransition = transitionStateRef.current;
    if (!currentTransition || currentTransition.toSlot !== slot) {
      return;
    }

    transitionTokenRef.current += 1;
    clearTransitionWatchdog();
    transitionProgress.stopAnimation();
    transitionProgress.setValue(0);
    transitionStateRef.current = null;
    setTransitionState(null);
    canGoBackBySlotRef.current[slot] = false;
    modalOpenBySlotRef.current[slot] = false;
    busyLockBySlotRef.current[slot] = false;
    if (!currentTransition.reuseCachedSlot) {
      clearCachedSlot(slot);
    }
    if (queuedNavigationRequestRef.current) {
      requestAnimationFrame(() => {
        const queuedRequest = queuedNavigationRequestRef.current;
        if (
          !queuedRequest ||
          transitionStateRef.current ||
          busyLockBySlotRef.current[activeSlotRef.current]
        ) {
          return;
        }
        queuedNavigationRequestRef.current = null;
        requestPageNavigationRef.current(
          queuedRequest.payload,
          queuedRequest.source,
        );
      });
    }
  };

  const queueNavigationRequest = useCallback(
    (
      payload: Record<string, unknown> = {},
      source: NavigationRequestSource = 'bridge',
    ) => {
      queuedNavigationRequestRef.current = {
        payload: {...payload},
        source,
        queuedAt: Date.now(),
      };
      logPerfMetric('navigation-queued', {
        source,
        page:
          typeof payload.page === 'string'
            ? payload.page
            : getPageByHref(payload.href)?.key || '',
      });
    },
    [logPerfMetric],
  );

  const finalizeTransition = (completedTransition: TransitionState) => {
    const nextActiveSlot = completedTransition.toSlot;
    const previousSlot = completedTransition.fromSlot;

    clearTransitionWatchdog();
    canGoBackBySlotRef.current[previousSlot] = false;
    modalOpenBySlotRef.current[previousSlot] = false;
    busyLockBySlotRef.current[previousSlot] = false;
    markSlotUsed(nextActiveSlot);
    logPerfMetric('transition-complete', {
      fromSlot: previousSlot,
      toSlot: nextActiveSlot,
      page: webViewSlotsRef.current[nextActiveSlot].pageKey,
      reusedCachedSlot: completedTransition.reuseCachedSlot === true,
    });
    activeSlotRef.current = nextActiveSlot;
    setActiveSlot(nextActiveSlot);
    transitionStateRef.current = null;
    setTransitionState(null);
    transitionProgress.setValue(0);
    clearHiddenCachedSlots();
    if (queuedNavigationRequestRef.current) {
      requestAnimationFrame(() => {
        const queuedRequest = queuedNavigationRequestRef.current;
        if (
          !queuedRequest ||
          transitionStateRef.current ||
          busyLockBySlotRef.current[activeSlotRef.current]
        ) {
          return;
        }
        queuedNavigationRequestRef.current = null;
        const navigationResult = requestPageNavigationRef.current(
          queuedRequest.payload,
          queuedRequest.source,
        );
        logPerfMetric('navigation-replayed', {
          source: queuedRequest.source,
          page:
            typeof queuedRequest.payload.page === 'string'
              ? queuedRequest.payload.page
              : getPageByHref(queuedRequest.payload.href)?.key || '',
          queuedForMs: Date.now() - queuedRequest.queuedAt,
          navigationResult,
        });
      });
    }
  };

  const fallbackTransitionToDirectNavigation = (
    transition: TransitionState,
  ) => {
    const pendingState = webViewSlotsRef.current[transition.toSlot];
    const targetUri =
      pendingState.uri ||
      (transitionWatchdogRef.current?.toSlot === transition.toSlot
        ? transitionWatchdogRef.current.targetUri
        : null);
    const targetPageKey =
      pendingState.pageKey || getPageByHref(targetUri || '')?.key || '';
    if (!targetUri || !targetPageKey) {
      clearPendingTransition(transition.toSlot);
      return;
    }

    const fallbackSlot = transition.fromSlot;
    const pendingSlot = transition.toSlot;
    resetWebViewPresentation();
    activeSlotRef.current = fallbackSlot;
    setActiveSlot(fallbackSlot);
    webViewSlotsRef.current = {
      ...webViewSlotsRef.current,
      [fallbackSlot]: {
        uri: targetUri,
        pageKey: targetPageKey,
        revision: webViewSlotsRef.current[fallbackSlot].revision + 1,
      },
      [pendingSlot]: {
        uri: null,
        pageKey: '',
        revision: webViewSlotsRef.current[pendingSlot].revision,
      },
    };
    setWebViewSlots(current => ({
      ...current,
      [fallbackSlot]: {
        uri: targetUri,
        pageKey: targetPageKey,
        revision: current[fallbackSlot].revision + 1,
      },
      [pendingSlot]: {
        uri: null,
        pageKey: '',
        revision: current[pendingSlot].revision,
      },
    }));
    slotLastUsedAtRef.current[pendingSlot] = 0;
    markSlotUsed(fallbackSlot);
  };

  const armTransitionWatchdog = (
    transition: TransitionState,
    targetUri: string | null,
    timeoutMs: number,
  ) => {
    if (!targetUri) {
      clearTransitionWatchdog();
      return;
    }

    const comparableTargetUri = getComparableUrl(targetUri);
    clearTransitionWatchdog();
    transitionWatchdogRef.current = {
      startedAt: Date.now(),
      fromSlot: transition.fromSlot,
      toSlot: transition.toSlot,
      targetUri,
      comparableUri: comparableTargetUri,
    };
    transitionWatchdogTimerRef.current = setTimeout(() => {
      transitionWatchdogTimerRef.current = null;
      const watchdog = transitionWatchdogRef.current;
      const currentTransition = transitionStateRef.current;
      const pendingState = webViewSlotsRef.current[transition.toSlot];
      if (
        !watchdog ||
        !currentTransition ||
        watchdog.fromSlot !== transition.fromSlot ||
        watchdog.toSlot !== transition.toSlot ||
        watchdog.comparableUri !== comparableTargetUri ||
        currentTransition.toSlot !== transition.toSlot ||
        getComparableUrl(pendingState.uri) !== comparableTargetUri
      ) {
        return;
      }
      if (currentTransition.status === 'animating') {
        finalizeTransition(currentTransition);
        return;
      }
      fallbackTransitionToDirectNavigation(currentTransition);
    }, timeoutMs);
  };

  const startLoadedTransition = (slot: WebViewSlot) => {
    const currentTransition = transitionStateRef.current;
    if (
      !currentTransition ||
      currentTransition.toSlot !== slot ||
      currentTransition.status === 'animating'
    ) {
      return;
    }

    transitionProgress.stopAnimation();
    transitionProgress.setValue(0);
    finalizeTransition({
      ...currentTransition,
      status: 'animating',
    });
  };

  const requestPageNavigation = (
    payload: Record<string, unknown> = {},
    source: NavigationRequestSource = 'bridge',
  ): NavigationRequestResult => {
    const currentSlot = activeSlotRef.current;
    const currentState = webViewSlotsRef.current[currentSlot];
    const target = resolvePageTarget(currentState.uri, payload);
    if (!target) {
      return 'noop';
    }

    const nextComparableUrl = getComparableUrl(target.uri);
    if (nextComparableUrl === getComparableUrl(currentState.uri)) {
      return source === 'webview' ? 'allow-default' : 'intercept';
    }

    const currentTransition = transitionStateRef.current;
    if (currentTransition) {
      const pendingState = webViewSlotsRef.current[currentTransition.toSlot];
      const pendingComparableUrl = getComparableUrl(pendingState.uri);
      if (nextComparableUrl === pendingComparableUrl) {
        if (source === 'webview') {
          clearPendingTransition(currentTransition.toSlot);
          return 'allow-default';
        }
        if (!isTransitionWatchdogExpired()) {
          return 'intercept';
        }
      } else {
        clearPendingTransition(currentTransition.toSlot);
      }

      if (transitionStateRef.current) {
        clearPendingTransition(currentTransition.toSlot);
      }
    }

    const nextSlotState = findReusableSlot(currentSlot, target.uri);
    const nextSlot = nextSlotState.slot;
    const direction =
      normalizeNavigationDirection(payload.direction) ||
      getNavigationDirection(currentState.pageKey, target.pageKey);

    canGoBackBySlotRef.current[nextSlot] = false;
    modalOpenBySlotRef.current[nextSlot] = false;
    busyLockBySlotRef.current[nextSlot] = false;
    edgeBackSwipeExclusionBySlotRef.current[nextSlot] =
      createDefaultEdgeBackSwipeExclusionState();
    transitionProgress.stopAnimation();
    transitionProgress.setValue(0);
    const nextTransition: TransitionState = {
      fromSlot: currentSlot,
      toSlot: nextSlot,
      direction,
      status: 'loading',
      reuseCachedSlot: !nextSlotState.needsLoad,
    };
    logPerfMetric('transition-start', {
      fromSlot: currentSlot,
      toSlot: nextSlot,
      fromPage: currentState.pageKey,
      toPage: target.pageKey,
      targetUri: target.uri,
      source,
      reusedCachedSlot: !nextSlotState.needsLoad,
    });
    transitionStateRef.current = nextTransition;
    setTransitionState(nextTransition);
    if (nextSlotState.needsLoad) {
      armTransitionWatchdog(
        nextTransition,
        target.uri,
        PAGE_SWITCH_LOAD_TIMEOUT_MS,
      );
      updateWebViewSlotsRef(webViewSlotsRef, nextSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: webViewSlotsRef.current[nextSlot].revision + 1,
      });
      setWebViewSlots(current => ({
        ...current,
        [nextSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: current[nextSlot].revision + 1,
        },
      }));
    } else {
      startLoadedTransition(nextSlot);
    }
    return 'intercept';
  };
  requestPageNavigationRef.current = requestPageNavigation;

  const handleWidgetLaunchContext = useCallback(
    (launchContext: LaunchContext, reason: string) => {
      if (!launchContext.active && !launchContext.pageKey) {
        return false;
      }

      const normalizedLaunchContext = ensureWidgetLaunchId(launchContext);
      const activeState = webViewSlotsRef.current[activeSlotRef.current];
      const launchPolicy = resolveWidgetLaunchPolicy({
        isAndroid: IS_ANDROID,
        activePageKey: activeState.pageKey,
        fallbackPageKey: APP_PAGES[0].key,
        launchContext: normalizedLaunchContext,
      });
      const targetPageKey = launchPolicy.targetPageKey;

      if (!launchPolicy.allowLaunch) {
        pendingWidgetLaunchDispatchRef.current = null;
        clearPendingWidgetLaunchAck(
          normalizedLaunchContext.widgetLaunchId,
        );
        widgetPrewarmPendingRef.current = false;
        launchContextRef.current = {
          ...normalizedLaunchContext,
          active: false,
          widgetKind: '',
          widgetAction: '',
          widgetLaunchId: '',
          widgetTargetId: '',
          widgetCreatedAt: 0,
          pageKey: activeState.pageKey || normalizedLaunchContext.pageKey,
        };
        showNativeToast(launchPolicy.rejectToast);
        logPerfMetric('launch-action-rejected', {
          reason,
          page: targetPageKey,
          activePage: activeState.pageKey,
          action: normalizedLaunchContext.widgetAction,
          widgetKind: normalizedLaunchContext.widgetKind,
          appState: appStateRef.current,
        });
        return false;
      }

      const signature = buildLaunchContextSignature(normalizedLaunchContext);
      const lastHandledLaunch = lastHandledWidgetLaunchRef.current;
      const now = Date.now();
      if (
        signature &&
        signature === lastHandledLaunch.signature &&
        now - lastHandledLaunch.handledAt < WIDGET_LAUNCH_DEDUP_WINDOW_MS
      ) {
        logPerfMetric('launch-action-deduped', {
          reason,
          page: normalizedLaunchContext.pageKey,
          action: normalizedLaunchContext.widgetAction,
          widgetKind: normalizedLaunchContext.widgetKind,
        });
        return false;
      }
      lastHandledWidgetLaunchRef.current = {
        signature,
        handledAt: now,
      };

      launchContextRef.current = normalizedLaunchContext;
      markWidgetLaunchWindow(normalizedLaunchContext);
      const targetHref = normalizedLaunchContext.widgetAction
        ? buildWidgetLaunchHref(targetPageKey, normalizedLaunchContext)
        : `${targetPageKey}.html`;
      const target = resolvePageTarget(activeState.uri, {
        page: targetPageKey,
        href: targetHref,
      });
      const comparableTargetUri = getComparableUrl(target?.uri || null);
      const shouldDispatchInPlace =
        !transitionStateRef.current &&
        !!activeState.uri &&
        activeState.pageKey === targetPageKey &&
        !!normalizedLaunchContext.widgetAction &&
        isPageReadyRef.current;

      if (normalizedLaunchContext.widgetAction) {
        scheduleWidgetLaunchAckWatchdog(normalizedLaunchContext, targetPageKey);
      } else {
        clearPendingWidgetLaunchAck();
      }

      if (shouldDispatchInPlace) {
        pendingWidgetLaunchDispatchRef.current = null;
        dispatchWidgetLaunchActionToSlot(
          activeSlotRef.current,
          targetPageKey,
          normalizedLaunchContext,
        );
        logPerfMetric('launch-action-consumed', {
          reason,
          page: targetPageKey,
          action: normalizedLaunchContext.widgetAction,
          widgetKind: normalizedLaunchContext.widgetKind,
          navigationResult: 'inplace-dispatch',
        });
        return true;
      }

      if (!target) {
        pendingWidgetLaunchDispatchRef.current = null;
        logPerfMetric('launch-action-consume-failed', {
          reason,
          page: targetPageKey,
          error: 'target-page-unresolved',
        });
        return false;
      }

      if (normalizedLaunchContext.widgetAction) {
        queueWidgetLaunchDispatch(
          targetPageKey,
          comparableTargetUri,
          normalizedLaunchContext,
        );
      } else {
        pendingWidgetLaunchDispatchRef.current = null;
      }

      if (activeState.pageKey === targetPageKey) {
        const queuedActiveDispatch =
          normalizedLaunchContext.widgetAction && isPageReadyRef.current
          ? dispatchQueuedWidgetLaunchIfReady(
              activeSlotRef.current,
              'active-slot-dispatch',
            )
          : false;
        logPerfMetric('launch-action-consumed', {
          reason,
          page: targetPageKey,
          action: normalizedLaunchContext.widgetAction,
          widgetKind: normalizedLaunchContext.widgetKind,
          navigationResult: queuedActiveDispatch
            ? 'queued-active-dispatch'
            : normalizedLaunchContext.widgetAction
              ? 'queued-active'
              : 'noop',
        });
        return queuedActiveDispatch || !!normalizedLaunchContext.widgetAction;
      }

      const navigationResult = requestPageNavigationRef.current(
        {
          page: targetPageKey,
          href: targetHref,
          direction: getNavigationDirection(activeState.pageKey, targetPageKey),
        },
        'bridge',
      );
      const dispatchedImmediately = normalizedLaunchContext.widgetAction
        ? dispatchQueuedWidgetLaunchIfReady(
            activeSlotRef.current,
            'cached-slot-dispatch',
          )
        : false;

      logPerfMetric('launch-action-consumed', {
        reason,
        page: targetPageKey,
        action: normalizedLaunchContext.widgetAction,
        widgetKind: normalizedLaunchContext.widgetKind,
        navigationResult: dispatchedImmediately
          ? 'cached-dispatch'
          : navigationResult,
      });
      return dispatchedImmediately || navigationResult !== 'noop';
    },
    [
      clearPendingWidgetLaunchAck,
      dispatchQueuedWidgetLaunchIfReady,
      dispatchWidgetLaunchActionToSlot,
      logPerfMetric,
      markWidgetLaunchWindow,
      queueWidgetLaunchDispatch,
      scheduleWidgetLaunchAckWatchdog,
      showNativeToast,
    ],
  );

  useEffect(() => {
    let mounted = true;

    async function loadStartUrl() {
      if (!nativeBridge?.getStartUrl) {
        if (mounted) {
          setBootError(
            shellText(
              '缺少 ControlerBridge 原生模块。',
              'Missing the native ControlerBridge module.',
            ),
          );
        }
        return;
      }

      try {
        const rawUrl = await nativeBridge.getStartUrl();
        let launchContext = ensureWidgetLaunchId(parseLaunchContextFromUrl(rawUrl));
        const targetPageKey =
          launchContext.pageKey || getPageByHref(rawUrl)?.key || APP_PAGES[0].key;
        let url = rawUrl;
        if (launchContext.widgetAction) {
          const launchTarget = resolvePageTarget(rawUrl, {
            page: targetPageKey,
            href: buildWidgetLaunchHref(targetPageKey, launchContext),
          });
          if (launchTarget?.uri) {
            url = launchTarget.uri;
          }
          launchContext = {
            ...launchContext,
            pageKey: targetPageKey,
          };
        }
        const initialPage = getPageByHref(url) || APP_PAGES[0];
        if (mounted) {
          resetWebViewPresentation();
          activeSlotRef.current = 'primary';
          setActiveSlot('primary');
          setBootError(null);
          launchContextRef.current = launchContext;
          markWidgetLaunchWindow(launchContext);
          if (launchContext.widgetAction) {
            scheduleWidgetLaunchAckWatchdog(launchContext, initialPage.key);
          } else {
            clearPendingWidgetLaunchAck();
          }
          webViewSlotsRef.current = {
            primary: {
              uri: url,
              pageKey: initialPage.key,
              revision: webViewSlotsRef.current.primary.revision + 1,
            },
            secondary: {
              uri: null,
              pageKey: '',
              revision: webViewSlotsRef.current.secondary.revision,
            },
            tertiary: {
              uri: null,
              pageKey: '',
              revision: webViewSlotsRef.current.tertiary.revision,
            },
          };
          setWebViewSlots(current => ({
            primary: {
              uri: url,
              pageKey: initialPage.key,
              revision: current.primary.revision + 1,
            },
            secondary: {
              uri: null,
              pageKey: '',
              revision: current.secondary.revision,
            },
            tertiary: {
              uri: null,
              pageKey: '',
              revision: current.tertiary.revision,
            },
          }));
          markSlotUsed('primary');
        }
      } catch (error) {
        if (mounted) {
          setBootError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadStartUrl();
    return () => {
      mounted = false;
    };
  }, [
    clearPendingWidgetLaunchAck,
    markSlotUsed,
    markWidgetLaunchWindow,
    resetWebViewPresentation,
    scheduleWidgetLaunchAckWatchdog,
    shellText,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = DeviceEventEmitter.addListener(
      'widgets.launchActionReceived',
      payload => {
        const launchContext = parseLaunchContextFromPayload(
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : null,
        );
        if (!launchContext.active && !launchContext.pageKey) {
          return;
        }
        handleWidgetLaunchContext(launchContext, 'device-event');
        if (typeof nativeBridge?.consumeLaunchAction === 'function') {
          nativeBridge.consumeLaunchAction().catch(() => undefined);
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [handleWidgetLaunchContext]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = DeviceEventEmitter.addListener(
      'widgets.storageChanged',
      payload => {
        const bridgePayload =
          payload && typeof payload === 'object'
            ? (payload as BridgeEnvelopePayload)
            : undefined;
        broadcastStorageChangeEventToLoadedSlots(bridgePayload, {
          sourceSlot: null,
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, [broadcastStorageChangeEventToLoadedSlots]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let mounted = true;
    let launchRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const dispatchResumeToLoadedSlots = () => {
      WEBVIEW_SLOTS.forEach(slot => {
        if (!webViewSlotsRef.current[slot].uri) {
          return;
        }
        getWebViewRef(slot).current?.injectJavaScript(
          dispatchNativeResumeScript,
        );
      });
    };

    const consumePendingLaunchAction = async (reason: string) => {
      if (
        !mounted ||
        typeof nativeBridge?.consumeLaunchAction !== 'function'
      ) {
        return false;
      }

      try {
        const payload = parseBridgeJson(await nativeBridge.consumeLaunchAction());
        const launchContext = parseLaunchContextFromPayload(payload);
        if (!launchContext.active && !launchContext.pageKey) {
          return false;
        }
        return handleWidgetLaunchContext(launchContext, reason);
      } catch (error) {
        logPerfMetric('launch-action-consume-failed', {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    };

    const handleAppActive = () => {
      dispatchResumeToLoadedSlots();
      consumePendingLaunchAction('app-state-active').catch(() => undefined);
      if (launchRetryTimer !== null) {
        clearTimeout(launchRetryTimer);
      }
      launchRetryTimer = setTimeout(() => {
        launchRetryTimer = null;
        consumePendingLaunchAction('app-state-active-retry').catch(
          () => undefined,
        );
      }, 140);
    };

    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'background' || nextState === 'inactive') {
        persistLastVisiblePage(
          webViewSlotsRef.current[activeSlotRef.current].pageKey,
        );
      }
      if (nextState === 'active') {
        handleAppActive();
      }
    });

    return () => {
      mounted = false;
      if (launchRetryTimer !== null) {
        clearTimeout(launchRetryTimer);
      }
      subscription.remove();
    };
  }, [
    handleWidgetLaunchContext,
    logPerfMetric,
    persistLastVisiblePage,
  ]);

  useEffect(() => {
    return () => {
      transitionTokenRef.current += 1;
      clearPendingWidgetLaunchAck();
      clearNavigationPrewarmTimer();
      clearTransitionWatchdog();
      clearWidgetPrewarmTimer();
      transitionProgress.stopAnimation();
    };
  }, [
    clearPendingWidgetLaunchAck,
    clearNavigationPrewarmTimer,
    clearTransitionWatchdog,
    clearWidgetPrewarmTimer,
    transitionProgress,
  ]);

  useEffect(() => {
    bootPulse.stopAnimation();
    bootPulse.setValue(0);
    return () => {
      bootPulse.stopAnimation();
      bootPulse.setValue(0);
    };
  }, [bootPulse]);

  useEffect(() => {
    const activeState = webViewSlots[activeSlot];
    if (!activeState.uri || bootError || isPageReady) {
      return;
    }

    const timer = setTimeout(() => {
      revealWebView();
    }, PAGE_READY_FALLBACK_REVEAL_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [
    activeSlot,
    bootError,
    isPageReady,
    revealWebView,
    webViewSlots,
  ]);

  useEffect(() => {
    clearWidgetPrewarmTimer();
    if (!IS_ANDROID || bootError || !isPageReady || transitionState) {
      return;
    }
    if (settleWidgetLaunchWindowIfExpired()) {
      return;
    }
    if (!widgetPrewarmPendingRef.current) {
      return;
    }
    if (busyLockBySlotRef.current[activeSlotRef.current]) {
      return;
    }

    const primaryReadyAt = widgetPrimaryReadyAtRef.current;
    if (!primaryReadyAt) {
      return;
    }

    const remainingDelay = Math.max(
      0,
      WIDGET_PREWARM_AFTER_READY_MS - (Date.now() - primaryReadyAt),
    );

    widgetPrewarmTimerRef.current = setTimeout(() => {
      widgetPrewarmTimerRef.current = null;
      prewarmWidgetLandingPages();
    }, remainingDelay);

    return () => {
      clearWidgetPrewarmTimer();
    };
  }, [
    activeSlot,
    busyStateVersion,
    bootError,
    clearWidgetPrewarmTimer,
    isPageReady,
    prewarmWidgetLandingPages,
    settleWidgetLaunchWindowIfExpired,
    transitionState,
    webViewSlots,
  ]);

  useEffect(() => {
    clearNavigationPrewarmTimer();
    if (bootError || !isPageReady || transitionState) {
      return;
    }

    const activePageKey = webViewSlotsRef.current[activeSlotRef.current].pageKey;
    if (
      !activePageKey ||
      activePageKey === 'index' ||
      widgetPrewarmPendingRef.current ||
      busyLockBySlotRef.current[activeSlotRef.current]
    ) {
      return;
    }

    navigationPrewarmTimerRef.current = setTimeout(() => {
      navigationPrewarmTimerRef.current = null;
      if (
        transitionStateRef.current ||
        busyLockBySlotRef.current[activeSlotRef.current]
      ) {
        return;
      }
      prewarmNavigationPage('index');
    }, NAVIGATION_PREWARM_DELAY_MS);

    return () => {
      clearNavigationPrewarmTimer();
    };
  }, [
    activeSlot,
    busyStateVersion,
    bootError,
    clearNavigationPrewarmTimer,
    isPageReady,
    prewarmNavigationPage,
    transitionState,
    webViewSlots,
  ]);

  useEffect(() => {
    if (!isPageReady || transitionState) {
      return;
    }
    dispatchQueuedWidgetLaunchIfReady(activeSlot, 'active-slot-ready');
  }, [
    activeSlot,
    dispatchQueuedWidgetLaunchIfReady,
    isPageReady,
    transitionState,
    webViewSlots,
  ]);

  useEffect(() => {
    syncShellVisibility('slot-state-change');
  }, [activeSlot, syncShellVisibility, transitionState, webViewSlots]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => handleShellBackNavigation(false),
    );

    return () => {
      subscription.remove();
    };
  }, [handleShellBackNavigation]);

  useEffect(() => {
    const changeSubscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'background' || nextState === 'inactive') {
        persistLastVisiblePage(
          webViewSlotsRef.current[activeSlotRef.current].pageKey,
        );
      }
      if (nextState === 'active') {
        getWebViewRef(activeSlotRef.current).current?.injectJavaScript(
          dispatchNativeResumeScript,
        );
      }
    });
    const memoryWarningSubscription = AppState.addEventListener(
      'memoryWarning',
      () => {
        clearInactiveCachedSlots();
        logPerfMetric('memory-warning', {
          activeSlot: activeSlotRef.current,
        });
      },
    );

    return () => {
      changeSubscription.remove();
      memoryWarningSubscription.remove();
    };
  }, [clearInactiveCachedSlots, logPerfMetric, persistLastVisiblePage]);

  async function callNativeMethod(
    method: string,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown> | null> {
    if (!nativeBridge) {
      throw createMissingBridgeError();
    }

    switch (method) {
      case 'storage.readState':
        return parseBridgeJson(await nativeBridge.readStorageState());
      case 'storage.writeState':
        return parseBridgeJson(
          await nativeBridge.writeStorageState(
            JSON.stringify(
              payload.state && typeof payload.state === 'object'
                ? payload.state
                : {},
            ),
          ),
        );
      case 'storage.getStatus':
        return parseBridgeJson(await nativeBridge.getStorageStatus());
      case 'storage.getManifest':
        if (typeof nativeBridge.getStorageManifest !== 'function') {
          throw createUnsupportedBridgeError(
            '读取存储清单',
            'reading the storage manifest',
          );
        }
        return parseBridgeJson(await nativeBridge.getStorageManifest());
      case 'storage.getCoreState':
        if (typeof nativeBridge.getStorageCoreState !== 'function') {
          throw createUnsupportedBridgeError(
            '读取核心状态',
            'reading the core state',
          );
        }
        return parseBridgeJson(await nativeBridge.getStorageCoreState());
      case 'storage.getPageBootstrapState':
        if (typeof nativeBridge.getStoragePageBootstrapState !== 'function') {
          throw createUnsupportedBridgeError(
            '读取页面引导数据',
            'reading page bootstrap data',
          );
        }
        return parseBridgeJson(
          await nativeBridge.getStoragePageBootstrapState(
            JSON.stringify({
              pageKey:
                typeof payload.pageKey === 'string' ? payload.pageKey : 'index',
              options:
                payload.options && typeof payload.options === 'object'
                  ? payload.options
                  : {},
            }),
          ),
        );
      case 'storage.getBootstrapState':
        if (typeof nativeBridge.getStorageBootstrapState !== 'function') {
          throw createUnsupportedBridgeError(
            '读取页面引导数据',
            'reading page bootstrap data',
          );
        }
        return parseBridgeJson(
          await nativeBridge.getStorageBootstrapState(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.getPlanBootstrapState':
        if (typeof nativeBridge.getStoragePlanBootstrapState !== 'function') {
          throw createUnsupportedBridgeError(
            '读取计划启动数据',
            'reading plan bootstrap data',
          );
        }
        return parseBridgeJson(
          await nativeBridge.getStoragePlanBootstrapState(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.getDraft':
        if (typeof nativeBridge.getStorageDraft !== 'function') {
          throw createUnsupportedBridgeError('读取草稿', 'reading a draft');
        }
        return parseBridgeJson(
          await nativeBridge.getStorageDraft(
            JSON.stringify({
              key: typeof payload.key === 'string' ? payload.key : '',
              options:
                payload.options && typeof payload.options === 'object'
                  ? payload.options
                  : {},
            }),
          ),
        );
      case 'storage.setDraft':
        if (typeof nativeBridge.setStorageDraft !== 'function') {
          throw createUnsupportedBridgeError('保存草稿', 'saving a draft');
        }
        return parseBridgeJson(
          await nativeBridge.setStorageDraft(
            JSON.stringify({
              key: typeof payload.key === 'string' ? payload.key : '',
              value: payload.value,
              options:
                payload.options && typeof payload.options === 'object'
                  ? payload.options
                  : {},
            }),
          ),
        );
      case 'storage.removeDraft':
        if (typeof nativeBridge.removeStorageDraft !== 'function') {
          throw createUnsupportedBridgeError('删除草稿', 'removing a draft');
        }
        return parseBridgeJson(
          await nativeBridge.removeStorageDraft(
            JSON.stringify({
              key: typeof payload.key === 'string' ? payload.key : '',
            }),
          ),
        );
      case 'storage.getAutoBackupStatus':
        if (typeof nativeBridge.getAutoBackupStatus !== 'function') {
          throw createUnsupportedBridgeError(
            '读取自动备份状态',
            'reading auto backup status',
          );
        }
        return parseBridgeJson(await nativeBridge.getAutoBackupStatus());
      case 'storage.updateAutoBackupSettings':
        if (typeof nativeBridge.updateAutoBackupSettings !== 'function') {
          throw createUnsupportedBridgeError(
            '更新自动备份设置',
            'updating auto backup settings',
          );
        }
        return parseBridgeJson(
          await nativeBridge.updateAutoBackupSettings(
            JSON.stringify(
              payload.settings && typeof payload.settings === 'object'
                ? payload.settings
                : {},
            ),
          ),
        );
      case 'storage.runAutoBackupNow':
        if (typeof nativeBridge.runAutoBackupNow !== 'function') {
          throw createUnsupportedBridgeError(
            '立即执行自动备份',
            'running an auto backup now',
          );
        }
        return parseBridgeJson(await nativeBridge.runAutoBackupNow());
      case 'storage.shareLatestBackup':
        if (typeof nativeBridge.shareLatestBackup !== 'function') {
          throw createUnsupportedBridgeError(
            '分享最新备份',
            'sharing the latest backup',
          );
        }
        return parseBridgeJson(await nativeBridge.shareLatestBackup());
      case 'storage.loadSectionRange':
        if (typeof nativeBridge.loadStorageSectionRange !== 'function') {
          throw createUnsupportedBridgeError(
            '分区范围读取',
            'loading a partition range',
          );
        }
        return parseBridgeJson(
          await nativeBridge.loadStorageSectionRange(
            String(payload.section || ''),
            JSON.stringify(
              payload.scope && typeof payload.scope === 'object'
                ? payload.scope
                : {},
            ),
          ),
        );
      case 'storage.saveSectionRange':
        if (typeof nativeBridge.saveStorageSectionRange !== 'function') {
          throw createUnsupportedBridgeError(
            '分区范围保存',
            'saving a partition range',
          );
        }
        return parseBridgeJson(
          await nativeBridge.saveStorageSectionRange(
            String(payload.section || ''),
            JSON.stringify(
              payload.payload && typeof payload.payload === 'object'
                ? payload.payload
                : {},
            ),
          ),
        );
      case 'storage.replaceCoreState':
        if (typeof nativeBridge.replaceStorageCoreState !== 'function') {
          throw createUnsupportedBridgeError(
            '核心状态替换',
            'replacing the core state',
          );
        }
        return parseBridgeJson(
          await nativeBridge.replaceStorageCoreState(
            JSON.stringify(
              payload.partialCore && typeof payload.partialCore === 'object'
                ? payload.partialCore
                : {},
            ),
          ),
        );
      case 'storage.appendJournal':
        if (typeof nativeBridge.appendStorageJournal !== 'function') {
          throw createUnsupportedBridgeError(
            '追加存储日志',
            'appending a storage journal',
          );
        }
        return parseBridgeJson(
          await nativeBridge.appendStorageJournal(
            JSON.stringify(
              payload.payload && typeof payload.payload === 'object'
                ? payload.payload
                : {},
            ),
          ),
        );
      case 'storage.flushJournal':
        if (typeof nativeBridge.flushStorageJournal !== 'function') {
          throw createUnsupportedBridgeError(
            '刷新存储日志',
            'flushing a storage journal',
          );
        }
        return parseBridgeJson(await nativeBridge.flushStorageJournal());
      case 'storage.replaceRecurringPlans':
        if (typeof nativeBridge.replaceStorageRecurringPlans !== 'function') {
          throw createUnsupportedBridgeError(
            '重复计划替换',
            'replacing recurring plans',
          );
        }
        return parseBridgeJson(
          await nativeBridge.replaceStorageRecurringPlans(
            JSON.stringify(
              Array.isArray(payload.items) ? payload.items : [],
            ),
          ),
        );
      case 'storage.probeStateVersion':
        if (typeof nativeBridge.probeStorageStateVersion !== 'function') {
          throw createUnsupportedBridgeError(
            '存储版本探测',
            'probing the storage state version',
          );
        }
        return parseBridgeJson(
          await nativeBridge.probeStorageStateVersion(
            payload.includeFallbackHash === true,
          ),
        );
      case 'storage.exportBundle':
        if (typeof nativeBridge.exportStorageBundle !== 'function') {
          throw createUnsupportedBridgeError(
            'bundle 导出',
            'exporting a storage bundle',
          );
        }
        return parseBridgeJson(
          await nativeBridge.exportStorageBundle(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.importSource':
        if (typeof nativeBridge.importStorageSource !== 'function') {
          throw createUnsupportedBridgeError(
            'bundle 导入',
            'importing a storage bundle',
          );
        }
        return parseBridgeJson(
          await nativeBridge.importStorageSource(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.pickImportSourceFile':
        if (typeof nativeBridge.pickImportSourceFile !== 'function') {
          throw createUnsupportedBridgeError(
            '导入文件选择',
            'choosing an import file',
          );
        }
        return parseBridgeJson(
          await nativeBridge.pickImportSourceFile(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.inspectImportSourceFile':
        if (typeof nativeBridge.inspectImportSourceFile !== 'function') {
          throw createUnsupportedBridgeError(
            '导入文件检查',
            'inspecting an import file',
          );
        }
        return parseBridgeJson(
          await nativeBridge.inspectImportSourceFile(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.previewExternalImport':
        if (typeof nativeBridge.previewExternalImport !== 'function') {
          throw createUnsupportedBridgeError(
            '外部 JSON 预览',
            'previewing external JSON',
          );
        }
        return parseBridgeJson(
          await nativeBridge.previewExternalImport(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.selectFile':
        return parseBridgeJson(await nativeBridge.selectStorageFile());
      case 'storage.selectDirectory':
        return parseBridgeJson(await nativeBridge.selectStorageDirectory());
      case 'storage.resetFile':
        return parseBridgeJson(await nativeBridge.resetStorageFile());
      case 'widgets.requestPinWidget':
        return parseBridgeJson(
          await nativeBridge.requestPinWidget(String(payload.kind || '')),
        );
      case 'widgets.getPinSupport':
        if (typeof nativeBridge.getWidgetPinSupport !== 'function') {
          throw createUnsupportedBridgeError(
            '小组件固定能力探测',
            'checking widget pin support',
          );
        }
        return parseBridgeJson(
          await nativeBridge.getWidgetPinSupport(String(payload.kind || '')),
        );
      case 'widgets.consumePinWidgetResult':
        if (typeof nativeBridge.consumePinWidgetResult !== 'function') {
          throw createUnsupportedBridgeError(
            '读取小组件固定结果',
            'reading the widget pin result',
          );
        }
        return parseBridgeJson(await nativeBridge.consumePinWidgetResult());
      case 'widgets.openHomeScreen':
        if (typeof nativeBridge.openHomeScreen !== 'function') {
          throw createUnsupportedBridgeError(
            '返回桌面',
            'opening the home screen',
          );
        }
        return parseBridgeJson(await nativeBridge.openHomeScreen());
      case 'widgets.refresh':
        return parseBridgeJson(
          await nativeBridge.refreshWidgets(
            JSON.stringify(
              payload && typeof payload === 'object'
                ? (payload as WidgetRefreshPayload)
                : {},
            ),
          ),
        );
      case 'widgets.consumeLaunchAction':
        return parseBridgeJson(await nativeBridge.consumeLaunchAction());
      case 'settings.exportData':
        return parseBridgeJson(
          await nativeBridge.exportData(
            JSON.stringify(
              payload.state && typeof payload.state === 'object'
                ? payload.state
                : {},
            ),
            String(payload.fileName || ''),
          ),
        );
      case 'notifications.requestPermission':
        return parseBridgeJson(
          await nativeBridge.requestNotificationPermission(
            payload.interactive !== false,
          ),
        );
      case 'notifications.syncSchedule':
        if (typeof nativeBridge.syncNotificationSchedule !== 'function') {
          throw createUnsupportedBridgeError(
            '提醒计划同步',
            'syncing the reminder schedule',
          );
        }
        return parseBridgeJson(
          await nativeBridge.syncNotificationSchedule(
            JSON.stringify(
              payload && typeof payload === 'object' ? payload : {},
            ),
          ),
        );
      case 'ui.setLastVisiblePage':
        if (typeof nativeBridge.setLastVisiblePage !== 'function') {
          throw createUnsupportedBridgeError(
            '同步最后可见页面',
            'persisting the last visible page',
          );
        }
        return {
          pageKey: await nativeBridge.setLastVisiblePage(
            String(payload.pageKey || ''),
          ),
        };
      case 'ui.showToast':
        if (typeof nativeBridge.showToast !== 'function') {
          throw createUnsupportedBridgeError(
            '显示提示',
            'showing a toast',
          );
        }
        return {
          shown: await nativeBridge.showToast(String(payload.message || '')),
        };
      default:
        throw new Error(`Unsupported native bridge method: ${method}`);
    }
  }

  function postBridgeResponse(
    slot: WebViewSlot,
    id: string,
    result: Record<string, unknown> | null,
    error?: string,
  ) {
    const script = buildInjectionScript({
      type: 'bridge-response',
      payload: {
        id,
        result,
        error: error || null,
      },
    });
    logPerfMetric('inject-javascript', {
      slot,
      page: getPageKeyForSlot(slot),
      kind: 'bridge-response',
      sizeBytes: script.length,
    });
    getWebViewRef(slot).current?.injectJavaScript(script);
  }

  function postBridgeEvent(
    slot: WebViewSlot,
    name: string,
    payload: Record<string, unknown> = {},
  ) {
    const script = buildInjectionScript({
      type: 'bridge-event',
      payload: {
        name,
        ...payload,
      },
    });
    logPerfMetric('inject-javascript', {
      slot,
      page: getPageKeyForSlot(slot),
      kind: 'bridge-event',
      eventName: name,
      sizeBytes: script.length,
    });
    getWebViewRef(slot).current?.injectJavaScript(script);
  }
  postBridgeEventRef.current = postBridgeEvent;

  function isPayloadForCurrentSlot(
    slot: WebViewSlot,
    payload: BridgeEnvelopePayload | undefined,
  ) {
    const messageHref =
      typeof payload?.href === 'string' ? payload.href.trim() : '';
    if (!messageHref) {
      return true;
    }
    return (
      getComparableUrl(messageHref) ===
      getComparableUrl(webViewSlotsRef.current[slot].uri)
    );
  }

  async function handleWebViewMessage(
    slot: WebViewSlot,
    event: WebViewMessageEvent,
  ) {
    const message = parseBridgeJson(
      event.nativeEvent.data,
    ) as BridgeEnvelope | null;
    if (!message) {
      return;
    }

    if (message.type === 'shell-language') {
      persistShellLanguage(message.payload?.language).catch(() => undefined);
      return;
    }

    if (message.type === 'bridge-event') {
      const eventName =
        typeof message.payload?.name === 'string' ? message.payload.name : '';
      if (eventName === 'ui.language-changed') {
        persistShellLanguage(message.payload?.language).catch(
          () => undefined,
        );
        return;
      }
      if (eventName === 'ui.modal-state') {
        modalOpenBySlotRef.current[slot] = !!message.payload?.hasOpenModal;
        return;
      }
      if (eventName === 'ui.busy-state') {
        const nextBusy =
          message.payload?.lockNavigation === true ||
          (message.payload?.lockNavigation === undefined &&
            !!message.payload?.isBusy);
        if (busyLockBySlotRef.current[slot] !== nextBusy) {
          busyLockBySlotRef.current[slot] = nextBusy;
          setBusyStateVersion(version => version + 1);
        }
        return;
      }
      if (eventName === 'ui.edge-back-swipe-exclusion') {
        if (!isPayloadForCurrentSlot(slot, message.payload)) {
          return;
        }
        edgeBackSwipeExclusionBySlotRef.current[slot] =
          normalizeEdgeBackSwipeExclusionState(message.payload);
        return;
      }
      if (eventName === 'ui.theme-applied') {
        const nextThemeState =
          message.payload && typeof message.payload === 'object'
            ? message.payload
            : {};
        launchThemeStateRef.current = buildLaunchThemeStatePayload(
          nextThemeState,
        );
        initialCoreStateRef.current = {
          ...(initialCoreStateRef.current || {}),
          ...launchThemeStateRef.current,
        };
        applyShellBootThemeFromCoreState(nextThemeState);
        persistLaunchThemeState(nextThemeState).catch(() => undefined);
        return;
      }
      if (eventName === 'perf.metric') {
        logPerfMetric('page-stage', {
          slot,
          ...(message.payload || {}),
        });
        return;
      }
      if (eventName === 'storage.changed') {
        if (shouldRefreshShellThemeForSections(message.payload?.changedSections)) {
          refreshShellBootThemeFromNative().catch(() => undefined);
        }
        broadcastStorageChangeBridgeEvent(slot, message.payload);
        return;
      }
      if (eventName === 'widgets.launchHandled') {
        const launchId =
          typeof message.payload?.launchId === 'string'
            ? message.payload.launchId.trim()
            : '';
        if (!launchId) {
          return;
        }
        const pendingDispatch = pendingWidgetLaunchDispatchRef.current;
        if (
          pendingDispatch?.launchContext.widgetLaunchId &&
          pendingDispatch.launchContext.widgetLaunchId === launchId
        ) {
          pendingWidgetLaunchDispatchRef.current = null;
        }
        clearPendingWidgetLaunchAck(launchId);
        logPerfMetric('launch-action-acknowledged', {
          slot,
          page: getPageKeyForSlot(slot),
          action:
            typeof message.payload?.action === 'string'
              ? message.payload.action
              : '',
        });
        return;
      }
      if (eventName === 'ui.page-ready') {
        logPerfMetric('page-ready', {
          slot,
          page: getPageKeyForSlot(slot),
          href: message.payload?.href || '',
        });
        if (
          IS_ANDROID &&
          launchContextRef.current.active &&
          slot === activeSlotRef.current &&
          widgetPrimaryReadyAtRef.current <= 0
        ) {
          widgetPrimaryReadyAtRef.current = Date.now();
        }
        syncShellVisibility('page-ready');
        if (!isPayloadForCurrentSlot(slot, message.payload)) {
          return;
        }
        dispatchQueuedWidgetLaunchIfReady(slot, 'page-ready');
        if (transitionStateRef.current?.toSlot === slot) {
          startLoadedTransition(slot);
          return;
        }
        if (slot === activeSlotRef.current) {
          revealWebView();
        }
        return;
      }
      if (eventName === 'ui.navigation-visibility') {
        const currentTransition = transitionStateRef.current;
        if (slot !== activeSlotRef.current && currentTransition?.toSlot !== slot) {
          return;
        }
        const nextHiddenPageKeys = normalizeHiddenPageKeys(
          message.payload?.hiddenPages,
        );
        const nextSignature = [...nextHiddenPageKeys].sort().join('|');
        const currentSignature = [...hiddenPageKeysRef.current].sort().join('|');
        if (nextSignature === currentSignature) {
          return;
        }
        hiddenPageKeysRef.current = new Set(nextHiddenPageKeys);
        clearHiddenCachedSlots();
        logPerfMetric('navigation-visibility-updated', {
          slot,
          hiddenPages: nextHiddenPageKeys.join(','),
        });
        syncShellVisibility('navigation-visibility');
        return;
      }
      if (eventName === 'ui.navigate') {
        const activeSlot = activeSlotRef.current;
        const transitionBusy = !!transitionStateRef.current;
        const navigationLocked = busyLockBySlotRef.current[activeSlot];
        let navigationResult: NavigationRequestResult = 'noop';
        let accepted = false;
        let queued = false;
        if (transitionBusy) {
          queueNavigationRequest(message.payload || {}, 'bridge');
          accepted = true;
          queued = true;
        } else if (!navigationLocked) {
          navigationResult = requestPageNavigation(message.payload || {}, 'bridge');
          accepted = navigationResult === 'intercept';
        }
        const requestId =
          typeof message.payload?.requestId === 'string'
            ? message.payload.requestId
            : '';
        if (requestId) {
          const retryAfterMs = transitionBusy || navigationLocked
            ? transitionStateRef.current
              ? 220
              : 140
            : 0;
          postBridgeEvent(slot, 'ui.navigate-ack', {
            requestId,
            accepted,
            busy: transitionBusy || navigationLocked,
            queued,
            retryAfterMs,
          });
        }
      }
      return;
    }

    if (message.type !== 'bridge-request') {
      return;
    }

    const requestId =
      typeof message.payload?.id === 'string' ? message.payload.id : '';
    const method =
      typeof message.payload?.method === 'string' ? message.payload.method : '';

    if (!requestId || !method) {
      return;
    }

    const requestPayload =
      message.payload?.payload && typeof message.payload.payload === 'object'
        ? message.payload.payload
        : {};
    const startedAt = Date.now();

    try {
      const result = await callNativeMethod(method, requestPayload);
      if (
        method === 'widgets.consumeLaunchAction' &&
        result &&
        typeof result === 'object'
      ) {
        const launchContext = parseLaunchContextFromPayload(
          result as Record<string, unknown>,
        );
        if (launchContext.active) {
          launchContextRef.current = launchContext;
          markWidgetLaunchWindow(launchContext);
        }
      }
      logPerfMetric('native-bridge-call', {
        slot,
        page: getPageKeyForSlot(slot),
        method,
        durationMs: Date.now() - startedAt,
        requestSizeBytes: estimatePayloadSize(requestPayload),
        resultSizeBytes: estimatePayloadSize(result),
        section:
          typeof requestPayload.section === 'string'
            ? requestPayload.section
            : undefined,
      });
      postBridgeResponse(slot, requestId, result);
    } catch (error) {
      logPerfMetric('native-bridge-call', {
        slot,
        page: getPageKeyForSlot(slot),
        method,
        durationMs: Date.now() - startedAt,
        requestSizeBytes: estimatePayloadSize(requestPayload),
        section:
          typeof requestPayload.section === 'string'
            ? requestPayload.section
            : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      postBridgeResponse(
        slot,
        requestId,
        null,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const recoverWebView = (slot: WebViewSlot) => {
    const currentTransition = transitionStateRef.current;
    if (
      currentTransition &&
      (currentTransition.toSlot === slot || currentTransition.fromSlot === slot)
    ) {
      clearInactiveCachedSlots([
        currentTransition.fromSlot,
        currentTransition.toSlot,
      ]);
      fallbackTransitionToDirectNavigation(currentTransition);
      return;
    }

    if (slot !== activeSlotRef.current) {
      clearCachedSlot(slot);
      clearInactiveCachedSlots();
      logPerfMetric('webview-cache-cleared', {
        slot,
        page: getPageKeyForSlot(slot),
        activeSlot: activeSlotRef.current,
        reason: 'render-process-gone',
      });
      return;
    }

    const currentActiveSlot = activeSlotRef.current;
    resetWebViewPresentation();
    const nextSlots = WEBVIEW_SLOTS.reduce<Record<WebViewSlot, WebViewSlotState>>(
      (acc, currentSlot) => {
        acc[currentSlot] =
          currentSlot === currentActiveSlot
            ? {
                ...webViewSlotsRef.current[currentSlot],
                revision: webViewSlotsRef.current[currentSlot].revision + 1,
              }
            : {
                ...webViewSlotsRef.current[currentSlot],
                uri: null,
                pageKey: '',
              };
        return acc;
      },
      {} as Record<WebViewSlot, WebViewSlotState>,
    );
    webViewSlotsRef.current = nextSlots;
    setWebViewSlots(current =>
      WEBVIEW_SLOTS.reduce<Record<WebViewSlot, WebViewSlotState>>((acc, currentSlot) => {
        acc[currentSlot] =
          currentSlot === currentActiveSlot
            ? {
                ...current[currentSlot],
                revision: current[currentSlot].revision + 1,
              }
            : {
                ...current[currentSlot],
                uri: null,
                pageKey: '',
              };
        return acc;
      }, {} as Record<WebViewSlot, WebViewSlotState>),
    );
  };

  const handleSlotLoadEnd = (slot: WebViewSlot) => {
    if (
      slot === activeSlotRef.current &&
      !transitionStateRef.current &&
      isPageReadyRef.current
    ) {
      revealWebView();
    }
  };

  const handleSlotLoadProgress = (slot: WebViewSlot, progress: number) => {
    if (
      slot === activeSlotRef.current &&
      progress >= 0.8 &&
      !transitionStateRef.current &&
      isPageReadyRef.current
    ) {
      revealWebView();
    }
  };

  const handleSlotNavigationStateChange = (
    slot: WebViewSlot,
    loading: boolean,
    canGoBack: boolean,
  ) => {
    canGoBackBySlotRef.current[slot] = canGoBack;
    if (
      slot === activeSlotRef.current &&
      !loading &&
      !transitionStateRef.current &&
      isPageReadyRef.current
    ) {
      revealWebView();
    }
  };

  const handleSlotShouldStartLoad = (
    slot: WebViewSlot,
    requestUrl: string,
  ) => {
    if (!requestUrl) {
      return false;
    }
    if (requestUrl.startsWith('about:blank') || requestUrl.startsWith('data:')) {
      return true;
    }
    if (!requestUrl.startsWith('file://')) {
      return false;
    }

    const matchedPage = getPageByHref(requestUrl);
    if (!matchedPage) {
      return true;
    }

    const slotState = webViewSlotsRef.current[slot];
    if (getComparableUrl(requestUrl) === getComparableUrl(slotState.uri)) {
      return true;
    }

    const currentTransition = transitionStateRef.current;
    if (
      currentTransition?.toSlot === slot &&
      getComparableUrl(requestUrl) ===
        getComparableUrl(webViewSlotsRef.current[currentTransition.toSlot].uri)
    ) {
      return true;
    }

    const navigationResult = requestPageNavigation(
      {
        href: requestUrl,
        direction: getNavigationDirection(slotState.pageKey, matchedPage.key),
      },
      'webview',
    );
    return navigationResult !== 'intercept';
  };

  const bootPulseScale = bootPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  const bootPulseOpacity = bootPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1],
  });

  const bootCard = (
    <Animated.View
      style={[
        styles.bootCard,
        {
          backgroundColor: shellBootTheme.cardBg,
          borderColor: shellBootTheme.cardBorder,
        },
        {
          transform: [{scale: bootCardScale}],
        },
      ]}>
      <Animated.View
        style={[
          styles.bootIndicator,
          {
            backgroundColor: shellBootTheme.indicatorBg,
          },
          {
            opacity: bootPulseOpacity,
            transform: [{scale: bootPulseScale}],
          },
        ]}>
        <View
          style={[
            styles.bootIndicatorDot,
            {
              backgroundColor: shellBootTheme.accent,
            },
          ]}
        />
      </Animated.View>
      <Text
        style={[
          styles.loadingText,
          {
            color: shellBootTheme.text,
          },
        ]}>
        {selectShellText(
          shellLanguage,
          '正在加载数据中',
          'Loading your data',
        )}
      </Text>
      <Text
        style={[
          styles.loadingSubText,
          {
            color: shellBootTheme.mutedText,
          },
        ]}>
        {selectShellText(
          shellLanguage,
          '页面资源与本地数据正在就绪',
          'Preparing page assets and local data',
        )}
      </Text>
    </Animated.View>
  );

  const renderWebView = (slot: WebViewSlot) => {
    const slotState = webViewSlots[slot];
    if (!slotState.uri) {
      return null;
    }

    const currentTransition = transitionState;
    const shellActiveSlot =
      currentTransition?.status === 'loading'
        ? currentTransition.toSlot
        : activeSlot;
    const panelWidth = Math.max(webViewHostWidth, 1);
    let wrapperStyle: Array<object> = [
      styles.webviewLayer,
      {backgroundColor: shellBootTheme.screenBg},
    ];
    const interactiveLayer =
      !currentTransition
        ? slot === activeSlot
        : currentTransition.status === 'loading' &&
          slot === currentTransition.fromSlot;

    if (!currentTransition) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          slot === activeSlot
            ? styles.webviewLayerVisible
            : styles.webviewLayerHidden,
      ];
    } else if (currentTransition.status === 'loading') {
      if (slot === currentTransition.fromSlot) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          styles.webviewLayerVisible,
        ];
      } else {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          styles.webviewLayerHidden,
        ];
      }
    } else {
      const enterDistance = IS_ANDROID
        ? Math.max(Math.round(panelWidth * 0.12), 24)
        : panelWidth;
      const leaveDistance = IS_ANDROID
        ? Math.max(Math.round(panelWidth * 0.08), 18)
        : panelWidth;
      const enteringOffset =
        currentTransition.direction === 'forward' ? enterDistance : -enterDistance;
      const leavingOffset =
        currentTransition.direction === 'forward' ? -leaveDistance : leaveDistance;
      const leavingOpacityEnd = IS_ANDROID ? 0.96 : 0.92;
      const leavingScaleEnd = IS_ANDROID ? 0.998 : 0.992;
      const enteringOpacityRange = IS_ANDROID ? [0.88, 0.95, 1] : [0.78, 0.92, 1];
      const enteringScaleStart = IS_ANDROID ? 0.998 : 0.992;

      if (slot === currentTransition.fromSlot) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          {
            zIndex: 2,
            opacity: transitionProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, leavingOpacityEnd],
            }),
            transform: [
              {
                translateX: transitionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, leavingOffset],
                }),
              },
              {
                scale: transitionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, leavingScaleEnd],
                }),
              },
            ],
          },
        ];
      } else if (slot === currentTransition.toSlot) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          {
            zIndex: 3,
            opacity: transitionProgress.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: enteringOpacityRange,
            }),
            transform: [
              {
                translateX: transitionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [enteringOffset, 0],
                }),
              },
              {
                scale: transitionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [enteringScaleStart, 1],
                }),
              },
            ],
          },
        ];
      } else {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          styles.webviewLayerHidden,
        ];
      }
    }

    return (
      <Animated.View
        key={`${slot}-${slotState.revision}`}
        pointerEvents={interactiveLayer ? 'auto' : 'none'}
        style={wrapperStyle}>
        <WebView
          ref={getWebViewRef(slot)}
          source={{uri: slotState.uri}}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          allowFileAccess
          allowingReadAccessToURL={slotState.uri}
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          injectedJavaScriptBeforeContentLoaded={buildBridgeBootstrapScript({
            active: slot === shellActiveSlot,
            slot,
            reason: 'bootstrap',
            page: slotState.pageKey,
            href: slotState.uri,
          }, launchThemeStateRef.current)}
          onMessage={event => {
            handleWebViewMessage(slot, event).catch(() => undefined);
          }}
          onLoadEnd={() => {
            handleSlotLoadEnd(slot);
            syncShellVisibility('load-end');
          }}
          onLoadProgress={event => {
            handleSlotLoadProgress(slot, event.nativeEvent.progress);
          }}
          onError={event => {
            const pendingTransition = transitionStateRef.current;
            if (pendingTransition?.toSlot === slot) {
              fallbackTransitionToDirectNavigation(pendingTransition);
              return;
            }
            const description = event.nativeEvent.description;
            setBootError(
              description ||
                shellText(
                  '离线页面加载失败。',
                  'Failed to load the offline page.',
                ),
            );
          }}
          onRenderProcessGone={
            Platform.OS === 'android' ? () => recoverWebView(slot) : undefined
          }
          onContentProcessDidTerminate={
            Platform.OS === 'ios' ? () => recoverWebView(slot) : undefined
          }
          onNavigationStateChange={navigationState => {
            handleSlotNavigationStateChange(
              slot,
              !!navigationState.loading,
              !!navigationState.canGoBack,
            );
          }}
          onShouldStartLoadWithRequest={request =>
            handleSlotShouldStartLoad(slot, request.url || '')
          }
          style={[styles.webview, {backgroundColor: shellBootTheme.screenBg}]}
        />
      </Animated.View>
    );
  };

  if (bootError) {
    return (
      <ScreenContainer
        style={[styles.screen, {backgroundColor: shellBootTheme.screenBg}]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent={Platform.OS === 'android'}
          hidden={Platform.OS === 'android'}
        />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>
            {selectShellText(
              shellLanguage,
              '移动端启动失败',
              'Mobile Startup Failed',
            )}
          </Text>
          <Text style={styles.errorText}>{bootError}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const activeUri = webViewSlots[activeSlot].uri;
  const loadingTargetPageKey =
    transitionState?.status === 'loading'
      ? webViewSlots[transitionState.toSlot].pageKey
      : '';
  const loadingTargetPageLabel = getPageDisplayLabel(
    loadingTargetPageKey,
    shellLanguage,
  );
  if (!activeUri) {
    return (
      <ScreenContainer style={styles.screen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent={Platform.OS === 'android'}
          hidden={Platform.OS === 'android'}
        />
        <View style={styles.center}>{bootCard}</View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      style={[styles.screen, {backgroundColor: shellBootTheme.screenBg}]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
        hidden={Platform.OS === 'android'}
      />
      <View
        style={[styles.webviewHost, {backgroundColor: shellBootTheme.screenBg}]}
        onLayout={event => {
          const nextWidth = Math.max(
            Math.round(event.nativeEvent.layout.width) || 0,
            1,
          );
          const nextHeight = Math.max(
            Math.round(event.nativeEvent.layout.height) || 0,
            1,
          );
          webViewHostLayoutRef.current = {
            width: nextWidth,
            height: nextHeight,
          };
          setWebViewHostWidth(currentWidth =>
            currentWidth === nextWidth ? currentWidth : nextWidth,
          );
        }}>
        {renderWebView('primary')}
        {renderWebView('secondary')}
        {renderWebView('tertiary')}
        {transitionState?.status === 'loading' ? (
          <View
            renderToHardwareTextureAndroid={Platform.OS === 'android'}
            style={[
              styles.transitionLoadingOverlay,
              {
                backgroundColor: shellBootTheme.transitionOverlay,
              },
            ]}>
            <View style={styles.center}>
              <View
                style={[
                  styles.bootCard,
                  styles.transitionLoadingCard,
                  {
                    backgroundColor: shellBootTheme.cardBg,
                    borderColor: shellBootTheme.cardBorder,
                  },
                ]}>
                <Animated.View
                  style={[
                    styles.bootIndicator,
                    {
                      backgroundColor: shellBootTheme.indicatorBg,
                    },
                    {
                      opacity: bootPulseOpacity,
                      transform: [{scale: bootPulseScale}],
                    },
                  ]}>
                  <View
                    style={[
                      styles.bootIndicatorDot,
                      {
                        backgroundColor: shellBootTheme.accent,
                      },
                    ]}
                  />
                </Animated.View>
                <Text
                  style={[
                    styles.loadingText,
                    {
                      color: shellBootTheme.text,
                    },
                  ]}>
                  {selectShellText(
                    shellLanguage,
                    '正在打开页面',
                    'Opening page',
                  )}
                </Text>
                <Text
                  style={[
                    styles.loadingSubText,
                    {
                      color: shellBootTheme.mutedText,
                    },
                  ]}>
                  {loadingTargetPageKey
                    ? shellLanguage === 'en-US'
                      ? `Preparing the ${loadingTargetPageLabel} page.`
                      : `正在准备${loadingTargetPageLabel}页面，请稍候`
                    : selectShellText(
                        shellLanguage,
                        '正在准备目标页面，请稍候',
                        'Preparing the destination page.',
                      )}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
        {isPageReady ? (
          <View
            {...edgeBackPanResponder.panHandlers}
            accessible={false}
            pointerEvents="box-only"
            style={[
              styles.edgeBackSwipeHotzone,
              {
                bottom: EDGE_BACK_SWIPE_BOTTOM_EXCLUSION_HEIGHT,
              },
            ]}
          />
        ) : null}

        {!isPageReady ? (
          <Animated.View
            pointerEvents="auto"
            renderToHardwareTextureAndroid={Platform.OS === 'android'}
            style={[
              styles.bootOverlay,
              {
                opacity: bootOverlayOpacity,
                backgroundColor: shellBootTheme.screenBg,
              },
            ]}>
            <View style={styles.center}>{bootCard}</View>
          </Animated.View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  webviewHost: {
    flex: 1,
    backgroundColor: SCREEN_BG,
    overflow: 'hidden',
  },
  edgeBackSwipeHotzone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_BACK_SWIPE_REGION_WIDTH,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  webviewLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SCREEN_BG,
  },
  webviewLayerVisible: {
    zIndex: 1,
    opacity: 1,
  },
  webviewLayerHidden: {
    zIndex: 0,
    opacity: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  bootOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SCREEN_BG,
    zIndex: 5,
    elevation: 5,
  },
  transitionLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 21, 18, 0.26)',
    zIndex: 4,
    elevation: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bootCard: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(142, 214, 164, 0.14)',
    backgroundColor: 'rgba(22, 31, 27, 0.88)',
  },
  transitionLoadingCard: {
    backgroundColor: 'rgba(18, 26, 23, 0.94)',
  },
  bootIndicator: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(47, 111, 84, 0.14)',
  },
  bootIndicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ACCENT_COLOR,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d4f5df',
  },
  loadingSubText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(212, 245, 223, 0.68)',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#5d2a2a',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7a3e3e',
    textAlign: 'center',
  },
});

export default App;
