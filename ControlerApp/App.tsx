import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  Easing,
  type GestureResponderEvent,
  NativeModules,
  PanResponder,
  type PanResponderGestureState,
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
import appPackageJson from './package.json';

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
  pickDiaryImages?: (optionsJson?: string) => Promise<string>;
  saveDiaryImageAsset?: (optionsJson?: string) => Promise<string>;
  resolveDiaryImageUri?: (optionsJson?: string) => Promise<string>;
  deleteDiaryImageAssets?: (optionsJson?: string) => Promise<string>;
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
  showSoftInput?: () => Promise<string>;
  restartSoftInput?: () => Promise<string>;
  getSoftInputState?: () => Promise<string>;
  markStartupReady?: () => Promise<string>;
};

function createRuntimeSessionId(): string {
  return `rn-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

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
  title?: string;
  message?: string;
  presentation?: string;
  queued?: boolean;
  modalCount?: number;
  page?: string;
  href?: string;
  direction?: string;
  intentId?: string;
  requestedAt?: unknown;
  intentSequence?: unknown;
  sourcePage?: string;
  sourceHref?: string;
  targetPage?: string;
  targetHref?: string;
  state?: string;
  hiddenPages?: unknown;
  order?: unknown;
  changedSections?: unknown;
  changedPeriods?: unknown;
  originPageInstanceId?: unknown;
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

type PendingBridgeMessagesState = {
  revision: number;
  messages: Record<string, unknown>[];
};

type TransitionState = {
  fromSlot: WebViewSlot;
  toSlot: WebViewSlot;
  direction: NavigationDirection;
  status: 'loading' | 'animating';
  token: number;
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
type NavigationIntentStamp = {
  intentId: string;
  requestedAt: number;
  sequence: number;
};
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
  intent: NavigationIntentStamp | null;
};

type WidgetRefreshPayload = {
  changedSections?: string[];
  widgetKindHint?: string;
  appWidgetId?: number;
  source?: string;
};

type BusyOverlayState = {
  active: boolean;
  lockNavigation: boolean;
  title: string;
  message: string;
  presentation: string;
  href: string;
};

type ShellBlockingOverlayPayload = {
  title: string;
  message: string;
} | null;

type ShellBootTheme = {
  screenBg: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  buttonBg: string;
  buttonBgHover: string;
  buttonText: string;
  onAccentText: string;
  projectLevel1: string;
  projectLevel2: string;
  projectLevel3: string;
  text: string;
  mutedText: string;
  navBarBg: string;
  navBarBorder: string;
  navButtonBg: string;
  navButtonText: string;
  navButtonActiveBg: string;
  navButtonActiveText: string;
  indicatorBg: string;
  transitionOverlay: string;
};

type LaunchThemeColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  accent: string;
  text: string;
  mutedText: string;
  border: string;
  delete: string;
  deleteHover: string;
  projectLevel1: string;
  projectLevel2: string;
  projectLevel3: string;
  panel: string;
  panelStrong: string;
  panelBorder: string;
  buttonBg: string;
  buttonBgHover: string;
  buttonText: string;
  buttonBorder: string;
  onAccentText: string;
  navBarBg: string;
  navBarBorder: string;
  navButtonBg: string;
  navButtonText: string;
  navButtonActiveBg: string;
  navButtonActiveText: string;
  overlay: string;
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

function createDefaultBusyOverlayState(): BusyOverlayState {
  return {
    active: false,
    lockNavigation: false,
    title: '',
    message: '',
    presentation: '',
    href: '',
  };
}

function normalizeBusyOverlayState(
  payload: BridgeEnvelopePayload | undefined,
): BusyOverlayState {
  const isBusy =
    payload?.lockNavigation === true ||
    payload?.isBusy === true ||
    payload?.busy === true;
  return {
    active: isBusy,
    lockNavigation: payload?.lockNavigation === true,
    title: typeof payload?.title === 'string' ? payload.title.trim() : '',
    message: typeof payload?.message === 'string' ? payload.message.trim() : '',
    presentation:
      typeof payload?.presentation === 'string'
        ? payload.presentation.trim()
        : '',
    href: typeof payload?.href === 'string' ? payload.href.trim() : '',
  };
}

function areBusyOverlayStatesEqual(
  left: BusyOverlayState,
  right: BusyOverlayState,
) {
  return (
    left.active === right.active &&
    left.lockNavigation === right.lockNavigation &&
    left.title === right.title &&
    left.message === right.message &&
    left.presentation === right.presentation &&
    left.href === right.href
  );
}

const nativeBridge = NativeModules.ControlerBridge as
  | NativeBridgeModule
  | undefined;
const DEFAULT_THEME_ID = 'obsidian-mono';
const SCREEN_BG = '#0d0f12';
const ACCENT_COLOR = '#f1f4fa';
const DEFAULT_SHELL_BOOT_THEME: ShellBootTheme = {
  screenBg: SCREEN_BG,
  cardBg: 'rgba(20, 23, 28, 0.82)',
  cardBorder: 'rgba(215, 221, 232, 0.22)',
  accent: ACCENT_COLOR,
  buttonBg: '#f1f4fa',
  buttonBgHover: '#ffffff',
  buttonText: '#10141d',
  onAccentText: '#10141d',
  projectLevel1: '#d6dde8',
  projectLevel2: '#a2adbd',
  projectLevel3: '#667084',
  text: '#f4f6fb',
  mutedText: 'rgba(244, 246, 251, 0.76)',
  navBarBg: 'rgba(10, 12, 16, 0.9)',
  navBarBorder: 'rgba(215, 221, 232, 0.22)',
  navButtonBg: 'rgba(129, 140, 155, 0.14)',
  navButtonText: 'rgba(244, 246, 251, 0.76)',
  navButtonActiveBg: 'rgba(72, 79, 92, 0.92)',
  navButtonActiveText: '#f4f7ff',
  indicatorBg: 'rgba(241, 244, 250, 0.14)',
  transitionOverlay: 'rgba(7, 8, 10, 0.3)',
};
const BUILT_IN_SHELL_BOOT_THEME_MAP: Record<string, Partial<ShellBootTheme>> = {
  default: {
    screenBg: '#183524',
    cardBg: 'rgba(24, 52, 36, 0.74)',
    cardBorder: 'rgba(111, 208, 141, 0.28)',
    accent: '#6fd08d',
    buttonBg: '#76d694',
    buttonBgHover: '#8ae0a6',
    buttonText: '#133120',
    onAccentText: '#133120',
    projectLevel1: '#72c28a',
    projectLevel2: '#4c9966',
    projectLevel3: '#2f6945',
    text: '#f4fff7',
    mutedText: 'rgba(244, 255, 247, 0.74)',
    navBarBg: 'rgba(11, 25, 17, 0.84)',
    navButtonBg: 'rgba(111, 208, 141, 0.12)',
    navButtonActiveBg: 'rgba(98, 189, 125, 0.86)',
    navButtonActiveText: '#133120',
    indicatorBg: 'rgba(111, 208, 141, 0.14)',
    transitionOverlay: 'rgba(8, 10, 12, 0.26)',
  },
  'blue-ocean': {
    screenBg: '#12263f',
    cardBg: 'rgba(22, 45, 73, 0.76)',
    cardBorder: 'rgba(126, 198, 255, 0.28)',
    accent: '#7ec6ff',
    buttonBg: '#7ec6ff',
    buttonBgHover: '#95d2ff',
    buttonText: '#123052',
    onAccentText: '#123052',
    projectLevel1: '#63b3ed',
    projectLevel2: '#4299e1',
    projectLevel3: '#2c5282',
    text: '#eef6ff',
    mutedText: 'rgba(238, 246, 255, 0.72)',
    navBarBg: 'rgba(12, 28, 47, 0.86)',
    navButtonBg: 'rgba(126, 198, 255, 0.12)',
    navButtonActiveBg: 'rgba(119, 182, 235, 0.84)',
    navButtonActiveText: '#123052',
    indicatorBg: 'rgba(126, 198, 255, 0.16)',
    transitionOverlay: 'rgba(10, 22, 39, 0.24)',
  },
  'sunset-orange': {
    screenBg: '#4b261b',
    cardBg: 'rgba(88, 46, 31, 0.76)',
    cardBorder: 'rgba(255, 191, 120, 0.3)',
    accent: '#ffbf78',
    buttonBg: '#ffc78a',
    buttonBgHover: '#ffd3a5',
    buttonText: '#522a1c',
    onAccentText: '#522a1c',
    projectLevel1: '#f6ad55',
    projectLevel2: '#ed8936',
    projectLevel3: '#c05621',
    text: '#fff5ea',
    mutedText: 'rgba(255, 245, 234, 0.74)',
    navBarBg: 'rgba(55, 29, 21, 0.86)',
    navButtonBg: 'rgba(255, 191, 120, 0.14)',
    navButtonActiveBg: 'rgba(243, 181, 112, 0.88)',
    navButtonActiveText: '#522a1c',
    indicatorBg: 'rgba(255, 191, 120, 0.16)',
    transitionOverlay: 'rgba(42, 21, 15, 0.24)',
  },
  'minimal-gray': {
    screenBg: '#1c2734',
    cardBg: 'rgba(31, 45, 60, 0.78)',
    cardBorder: 'rgba(183, 205, 230, 0.3)',
    accent: '#b7cde6',
    buttonBg: '#c2d7ee',
    buttonBgHover: '#d3e3f5',
    buttonText: '#1f3246',
    onAccentText: '#1f3246',
    projectLevel1: '#a9c1de',
    projectLevel2: '#7e9bbd',
    projectLevel3: '#55718f',
    text: '#f5f9ff',
    mutedText: 'rgba(245, 249, 255, 0.74)',
    navBarBg: 'rgba(15, 24, 34, 0.86)',
    navButtonBg: 'rgba(183, 205, 230, 0.12)',
    navButtonActiveBg: 'rgba(108, 133, 162, 0.84)',
    navButtonActiveText: '#f5f9ff',
    indicatorBg: 'rgba(183, 205, 230, 0.16)',
    transitionOverlay: 'rgba(20, 24, 31, 0.24)',
  },
  'obsidian-mono': {
    screenBg: '#0d0f12',
    cardBg: 'rgba(20, 23, 28, 0.82)',
    cardBorder: 'rgba(215, 221, 232, 0.22)',
    accent: '#f1f4fa',
    buttonBg: '#f1f4fa',
    buttonBgHover: '#ffffff',
    buttonText: '#10141d',
    onAccentText: '#10141d',
    projectLevel1: '#d6dde8',
    projectLevel2: '#a2adbd',
    projectLevel3: '#667084',
    text: '#f4f6fb',
    mutedText: 'rgba(244, 246, 251, 0.76)',
    navBarBg: 'rgba(10, 12, 16, 0.9)',
    navButtonBg: 'rgba(129, 140, 155, 0.14)',
    navButtonActiveBg: 'rgba(72, 79, 92, 0.92)',
    navButtonActiveText: '#f4f7ff',
    indicatorBg: 'rgba(241, 244, 250, 0.14)',
    transitionOverlay: 'rgba(7, 8, 10, 0.3)',
  },
  'ivory-light': {
    screenBg: '#eceff3',
    cardBg: 'rgba(249, 252, 255, 0.86)',
    cardBorder: 'rgba(110, 122, 143, 0.24)',
    accent: '#3f495f',
    buttonBg: '#3f495f',
    buttonBgHover: '#56607a',
    buttonText: '#f4f7ff',
    onAccentText: '#f4f7ff',
    projectLevel1: '#8b94a5',
    projectLevel2: '#a2abbb',
    projectLevel3: '#c0c7d3',
    text: '#202633',
    mutedText: 'rgba(32, 38, 51, 0.7)',
    navBarBg: 'rgba(244, 247, 251, 0.9)',
    navButtonBg: 'rgba(63, 73, 95, 0.08)',
    navButtonActiveBg: 'rgba(74, 85, 109, 0.88)',
    navButtonActiveText: '#f4f7ff',
    indicatorBg: 'rgba(63, 73, 95, 0.12)',
    transitionOverlay: 'rgba(27, 31, 38, 0.18)',
  },
  'graphite-mist': {
    screenBg: '#121820',
    cardBg: 'rgba(29, 37, 48, 0.82)',
    cardBorder: 'rgba(186, 198, 214, 0.22)',
    accent: '#c8d3df',
    buttonBg: '#d5dee8',
    buttonBgHover: '#e2e9f1',
    buttonText: '#141a22',
    onAccentText: '#141a22',
    projectLevel1: '#bec9d7',
    projectLevel2: '#8093a8',
    projectLevel3: '#4a5d74',
    text: '#f5f7fb',
    mutedText: 'rgba(236, 241, 248, 0.72)',
    navBarBg: 'rgba(13, 17, 23, 0.94)',
    navButtonBg: 'rgba(186, 198, 214, 0.1)',
    navButtonActiveBg: 'rgba(63, 77, 96, 0.92)',
    navButtonActiveText: '#f5f7fb',
    indicatorBg: 'rgba(186, 198, 214, 0.14)',
    transitionOverlay: 'rgba(6, 9, 13, 0.34)',
  },
  'aurora-mist': {
    screenBg: '#362226',
    cardBg: 'rgba(54, 34, 38, 0.8)',
    cardBorder: 'rgba(255, 182, 142, 0.28)',
    accent: '#ffb68e',
    buttonBg: '#ffc09a',
    buttonBgHover: '#ffd0b3',
    buttonText: '#532f26',
    onAccentText: '#532f26',
    projectLevel1: '#f0ad8b',
    projectLevel2: '#cf8669',
    projectLevel3: '#8f5849',
    text: '#fff6f1',
    mutedText: 'rgba(255, 246, 241, 0.74)',
    navBarBg: 'rgba(36, 22, 25, 0.88)',
    navButtonBg: 'rgba(255, 182, 142, 0.12)',
    navButtonActiveBg: 'rgba(182, 112, 89, 0.9)',
    navButtonActiveText: '#fff6f1',
    indicatorBg: 'rgba(255, 182, 142, 0.14)',
    transitionOverlay: 'rgba(28, 18, 20, 0.24)',
  },
  'amethyst-haze': {
    screenBg: '#141826',
    cardBg: 'rgba(24, 29, 45, 0.8)',
    cardBorder: 'rgba(157, 176, 255, 0.28)',
    accent: '#9db0ff',
    buttonBg: '#b9c8ff',
    buttonBgHover: '#ced8ff',
    buttonText: '#1f2742',
    onAccentText: '#1f2742',
    projectLevel1: '#b1c2ff',
    projectLevel2: '#7488de',
    projectLevel3: '#46589d',
    text: '#f5f7ff',
    mutedText: 'rgba(245, 247, 255, 0.74)',
    navBarBg: 'rgba(15, 19, 31, 0.88)',
    navButtonBg: 'rgba(157, 176, 255, 0.12)',
    navButtonActiveBg: 'rgba(92, 109, 183, 0.9)',
    navButtonActiveText: '#f5f7ff',
    indicatorBg: 'rgba(157, 176, 255, 0.16)',
    transitionOverlay: 'rgba(12, 15, 26, 0.24)',
  },
  'velvet-bordeaux': {
    screenBg: '#2f141d',
    cardBg: 'rgba(57, 26, 37, 0.8)',
    cardBorder: 'rgba(216, 166, 184, 0.26)',
    accent: '#d8a6b8',
    buttonBg: '#e2b0c2',
    buttonBgHover: '#ebc1cf',
    buttonText: '#421d2a',
    onAccentText: '#421d2a',
    projectLevel1: '#c58da2',
    projectLevel2: '#a6607a',
    projectLevel3: '#6c3348',
    text: '#fff3f6',
    mutedText: 'rgba(255, 243, 246, 0.74)',
    navBarBg: 'rgba(38, 16, 25, 0.9)',
    navButtonBg: 'rgba(216, 166, 184, 0.12)',
    navButtonActiveBg: 'rgba(142, 77, 99, 0.88)',
    navButtonActiveText: '#fff3f6',
    indicatorBg: 'rgba(216, 166, 184, 0.14)',
    transitionOverlay: 'rgba(22, 10, 14, 0.26)',
  },
  'champagne-sandstone': {
    screenBg: '#f1ebe2',
    cardBg: 'rgba(250, 245, 239, 0.9)',
    cardBorder: 'rgba(143, 119, 95, 0.22)',
    accent: '#8b6f57',
    buttonBg: '#8b6f57',
    buttonBgHover: '#a28267',
    buttonText: '#f8f3ec',
    onAccentText: '#f8f3ec',
    projectLevel1: '#bca087',
    projectLevel2: '#cfb59a',
    projectLevel3: '#e0d0bf',
    text: '#2f261f',
    mutedText: 'rgba(47, 38, 31, 0.68)',
    navBarBg: 'rgba(248, 241, 232, 0.92)',
    navButtonBg: 'rgba(139, 111, 87, 0.08)',
    navButtonActiveBg: 'rgba(145, 118, 92, 0.88)',
    navButtonActiveText: '#f8f3ec',
    indicatorBg: 'rgba(139, 111, 87, 0.12)',
    transitionOverlay: 'rgba(40, 34, 28, 0.18)',
  },
  'porcelain-mist': {
    screenBg: '#e8eff7',
    cardBg: 'rgba(250, 252, 255, 0.9)',
    cardBorder: 'rgba(94, 117, 145, 0.22)',
    accent: '#4e6d8d',
    buttonBg: '#4e6d8d',
    buttonBgHover: '#6182a4',
    buttonText: '#f7fbff',
    onAccentText: '#f7fbff',
    projectLevel1: '#768fa8',
    projectLevel2: '#97adc1',
    projectLevel3: '#c6d3e0',
    text: '#1d2a38',
    mutedText: 'rgba(29, 42, 56, 0.68)',
    navBarBg: 'rgba(244, 249, 255, 0.95)',
    navButtonBg: 'rgba(78, 109, 141, 0.08)',
    navButtonActiveBg: 'rgba(88, 121, 156, 0.88)',
    navButtonActiveText: '#f7fbff',
    indicatorBg: 'rgba(78, 109, 141, 0.12)',
    transitionOverlay: 'rgba(20, 31, 43, 0.17)',
  },
  'sage-cashmere': {
    screenBg: '#edf1ec',
    cardBg: 'rgba(249, 252, 248, 0.9)',
    cardBorder: 'rgba(103, 119, 109, 0.22)',
    accent: '#5f6f64',
    buttonBg: '#5f6f64',
    buttonBgHover: '#73857a',
    buttonText: '#f4f7f3',
    onAccentText: '#f4f7f3',
    projectLevel1: '#7f9184',
    projectLevel2: '#9bad9f',
    projectLevel3: '#c7d2c9',
    text: '#243028',
    mutedText: 'rgba(36, 48, 40, 0.68)',
    navBarBg: 'rgba(246, 249, 245, 0.93)',
    navButtonBg: 'rgba(95, 111, 100, 0.08)',
    navButtonActiveBg: 'rgba(105, 123, 111, 0.88)',
    navButtonActiveText: '#f4f7f3',
    indicatorBg: 'rgba(95, 111, 100, 0.12)',
    transitionOverlay: 'rgba(25, 32, 27, 0.17)',
  },
  'oyster-linen': {
    screenBg: '#f1eef6',
    cardBg: 'rgba(250, 247, 252, 0.9)',
    cardBorder: 'rgba(113, 101, 130, 0.22)',
    accent: '#6d617d',
    buttonBg: '#6d617d',
    buttonBgHover: '#827492',
    buttonText: '#f9f6fb',
    onAccentText: '#f9f6fb',
    projectLevel1: '#9a8da9',
    projectLevel2: '#b6abc3',
    projectLevel3: '#d8d1e2',
    text: '#2c2733',
    mutedText: 'rgba(44, 39, 51, 0.68)',
    navBarBg: 'rgba(247, 243, 249, 0.94)',
    navButtonBg: 'rgba(109, 97, 125, 0.08)',
    navButtonActiveBg: 'rgba(124, 111, 141, 0.88)',
    navButtonActiveText: '#f9f6fb',
    indicatorBg: 'rgba(109, 97, 125, 0.12)',
    transitionOverlay: 'rgba(29, 24, 36, 0.17)',
  },
  'midnight-indigo': {
    screenBg: '#111722',
    cardBg: 'rgba(25, 31, 45, 0.8)',
    cardBorder: 'rgba(214, 195, 156, 0.28)',
    accent: '#d6c39c',
    buttonBg: '#e3d2af',
    buttonBgHover: '#ecdfc3',
    buttonText: '#2a241b',
    onAccentText: '#2a241b',
    projectLevel1: '#deccab',
    projectLevel2: '#a59372',
    projectLevel3: '#5f5542',
    text: '#faf7f1',
    mutedText: 'rgba(250, 247, 241, 0.74)',
    navBarBg: 'rgba(16, 21, 32, 0.88)',
    navButtonBg: 'rgba(214, 195, 156, 0.12)',
    navButtonActiveBg: 'rgba(128, 113, 83, 0.9)',
    navButtonActiveText: '#faf7f1',
    indicatorBg: 'rgba(214, 195, 156, 0.16)',
    transitionOverlay: 'rgba(11, 14, 22, 0.26)',
  },
};
const DEFAULT_LAUNCH_THEME_COLORS: LaunchThemeColors = {
  primary: '#0d0f12',
  secondary: 'rgba(24, 27, 32, 0.6)',
  tertiary: 'rgba(46, 50, 59, 0.56)',
  quaternary: 'rgba(106, 113, 128, 0.2)',
  accent: '#f1f4fa',
  text: '#f4f6fb',
  mutedText: 'rgba(244, 246, 251, 0.76)',
  border: 'rgba(215, 221, 232, 0.32)',
  delete: '#ff7b7b',
  deleteHover: '#ff5f5f',
  projectLevel1: '#d6dde8',
  projectLevel2: '#a2adbd',
  projectLevel3: '#667084',
  panel: 'rgba(16, 18, 22, 0.72)',
  panelStrong: 'rgba(20, 23, 28, 0.82)',
  panelBorder: 'rgba(215, 221, 232, 0.22)',
  buttonBg: '#f1f4fa',
  buttonBgHover: '#ffffff',
  buttonText: '#10141d',
  buttonBorder: 'rgba(241, 244, 250, 0.68)',
  onAccentText: '#10141d',
  navBarBg: 'rgba(10, 12, 16, 0.9)',
  navBarBorder: 'rgba(215, 221, 232, 0.22)',
  navButtonBg: 'rgba(129, 140, 155, 0.14)',
  navButtonText: 'rgba(244, 246, 251, 0.76)',
  navButtonActiveBg: 'rgba(72, 79, 92, 0.92)',
  navButtonActiveText: '#f8fafc',
  overlay: 'rgba(7, 8, 10, 0.3)',
};
const BUILT_IN_LAUNCH_THEME_COLOR_MAP: Record<
  string,
  Partial<LaunchThemeColors>
> = {
  default: {
    primary: '#183524',
    secondary: 'rgba(40, 79, 53, 0.42)',
    tertiary: 'rgba(59, 117, 76, 0.5)',
    quaternary: 'rgba(111, 208, 141, 0.2)',
    accent: '#6fd08d',
    text: '#f4fff7',
    mutedText: 'rgba(244, 255, 247, 0.74)',
    border: '#5fa878',
    delete: '#ff8686',
    deleteHover: '#ff6b6b',
    projectLevel1: '#72c28a',
    projectLevel2: '#4c9966',
    projectLevel3: '#2f6945',
    panel: 'rgba(15, 32, 22, 0.62)',
    panelStrong: 'rgba(24, 52, 36, 0.74)',
    panelBorder: 'rgba(111, 208, 141, 0.28)',
    buttonBg: '#76d694',
    buttonBgHover: '#8ae0a6',
    buttonText: '#133120',
    buttonBorder: 'rgba(111, 208, 141, 0.46)',
    onAccentText: '#133120',
    navBarBg: 'rgba(11, 25, 17, 0.84)',
    navButtonBg: 'rgba(111, 208, 141, 0.12)',
    navButtonActiveBg: 'rgba(98, 189, 125, 0.86)',
    navButtonActiveText: '#133120',
  },
  'blue-ocean': {
    primary: '#12263f',
    secondary: 'rgba(33, 63, 96, 0.46)',
    tertiary: 'rgba(57, 101, 151, 0.52)',
    quaternary: 'rgba(94, 163, 230, 0.22)',
    accent: '#7ec6ff',
    text: '#eef6ff',
    mutedText: 'rgba(238, 246, 255, 0.72)',
    border: '#6d7ba4',
    delete: '#ff8a8a',
    deleteHover: '#ff6f6f',
    projectLevel1: '#63b3ed',
    projectLevel2: '#4299e1',
    projectLevel3: '#2c5282',
    panel: 'rgba(17, 37, 61, 0.65)',
    panelStrong: 'rgba(22, 45, 73, 0.76)',
    panelBorder: 'rgba(126, 198, 255, 0.28)',
    buttonBg: '#7ec6ff',
    buttonBgHover: '#95d2ff',
    buttonText: '#123052',
    buttonBorder: 'rgba(126, 198, 255, 0.48)',
    onAccentText: '#123052',
    navBarBg: 'rgba(12, 28, 47, 0.86)',
    navButtonBg: 'rgba(126, 198, 255, 0.12)',
    navButtonActiveBg: 'rgba(119, 182, 235, 0.84)',
    navButtonActiveText: '#123052',
  },
  'sunset-orange': {
    primary: '#4b261b',
    secondary: 'rgba(122, 61, 38, 0.48)',
    tertiary: 'rgba(163, 88, 47, 0.52)',
    quaternary: 'rgba(237, 137, 54, 0.2)',
    accent: '#ffbf78',
    text: '#fff5ea',
    mutedText: 'rgba(255, 245, 234, 0.74)',
    border: '#bdb38b',
    delete: '#ff9a9a',
    deleteHover: '#ff7d7d',
    projectLevel1: '#f6ad55',
    projectLevel2: '#ed8936',
    projectLevel3: '#c05621',
    panel: 'rgba(70, 37, 26, 0.68)',
    panelStrong: 'rgba(88, 46, 31, 0.76)',
    panelBorder: 'rgba(255, 191, 120, 0.3)',
    buttonBg: '#ffc78a',
    buttonBgHover: '#ffd3a5',
    buttonText: '#522a1c',
    buttonBorder: 'rgba(255, 191, 120, 0.48)',
    onAccentText: '#522a1c',
    navBarBg: 'rgba(55, 29, 21, 0.86)',
    navButtonBg: 'rgba(255, 191, 120, 0.14)',
    navButtonActiveBg: 'rgba(243, 181, 112, 0.88)',
    navButtonActiveText: '#522a1c',
  },
  'minimal-gray': {
    primary: '#1c2734',
    secondary: 'rgba(50, 70, 90, 0.45)',
    tertiary: 'rgba(80, 107, 138, 0.52)',
    quaternary: 'rgba(183, 205, 230, 0.2)',
    accent: '#b7cde6',
    text: '#f5f9ff',
    mutedText: 'rgba(245, 249, 255, 0.74)',
    border: '#89a1bc',
    delete: '#ff8d8d',
    deleteHover: '#ff7070',
    projectLevel1: '#a9c1de',
    projectLevel2: '#7e9bbd',
    projectLevel3: '#55718f',
    panel: 'rgba(22, 34, 46, 0.66)',
    panelStrong: 'rgba(31, 45, 60, 0.78)',
    panelBorder: 'rgba(183, 205, 230, 0.3)',
    buttonBg: '#c2d7ee',
    buttonBgHover: '#d3e3f5',
    buttonText: '#1f3246',
    buttonBorder: 'rgba(183, 205, 230, 0.5)',
    onAccentText: '#1f3246',
    navBarBg: 'rgba(15, 24, 34, 0.86)',
    navButtonBg: 'rgba(183, 205, 230, 0.12)',
    navButtonActiveBg: 'rgba(108, 133, 162, 0.84)',
    navButtonActiveText: '#f5f9ff',
  },
  'obsidian-mono': {
    primary: '#0d0f12',
    secondary: 'rgba(24, 27, 32, 0.6)',
    tertiary: 'rgba(46, 50, 59, 0.56)',
    quaternary: 'rgba(106, 113, 128, 0.2)',
    accent: '#f1f4fa',
    text: '#f4f6fb',
    mutedText: 'rgba(244, 246, 251, 0.76)',
    border: 'rgba(215, 221, 232, 0.32)',
    delete: '#ff7b7b',
    deleteHover: '#ff5f5f',
    projectLevel1: '#d6dde8',
    projectLevel2: '#a2adbd',
    projectLevel3: '#667084',
    panel: 'rgba(16, 18, 22, 0.72)',
    panelStrong: 'rgba(20, 23, 28, 0.82)',
    panelBorder: 'rgba(215, 221, 232, 0.22)',
    buttonBg: '#f1f4fa',
    buttonBgHover: '#ffffff',
    buttonText: '#10141d',
    buttonBorder: 'rgba(241, 244, 250, 0.68)',
    onAccentText: '#10141d',
    navBarBg: 'rgba(10, 12, 16, 0.9)',
    navButtonBg: 'rgba(129, 140, 155, 0.14)',
    navButtonActiveBg: 'rgba(72, 79, 92, 0.92)',
    navButtonActiveText: '#f4f7ff',
  },
  'ivory-light': {
    primary: '#eceff3',
    secondary: 'rgba(255, 255, 255, 0.65)',
    tertiary: 'rgba(240, 244, 250, 0.78)',
    quaternary: 'rgba(222, 229, 238, 0.65)',
    accent: '#3f495f',
    text: '#202633',
    mutedText: 'rgba(32, 38, 51, 0.7)',
    border: '#7b8598',
    delete: '#cf4d4d',
    deleteHover: '#b13d3d',
    projectLevel1: '#8b94a5',
    projectLevel2: '#a2abbb',
    projectLevel3: '#c0c7d3',
    panel: 'rgba(255, 255, 255, 0.74)',
    panelStrong: 'rgba(249, 252, 255, 0.86)',
    panelBorder: 'rgba(110, 122, 143, 0.24)',
    buttonBg: '#3f495f',
    buttonBgHover: '#56607a',
    buttonText: '#f4f7ff',
    buttonBorder: 'rgba(63, 73, 95, 0.58)',
    onAccentText: '#f4f7ff',
    navBarBg: 'rgba(244, 247, 251, 0.9)',
    navButtonBg: 'rgba(63, 73, 95, 0.08)',
    navButtonActiveBg: 'rgba(74, 85, 109, 0.88)',
    navButtonActiveText: '#f4f7ff',
    overlay: 'rgba(27, 31, 38, 0.22)',
  },
  'graphite-mist': {
    primary: '#121820',
    secondary: 'rgba(23, 30, 39, 0.58)',
    tertiary: 'rgba(37, 46, 58, 0.62)',
    quaternary: 'rgba(171, 185, 204, 0.16)',
    accent: '#c8d3df',
    text: '#f5f7fb',
    mutedText: 'rgba(236, 241, 248, 0.72)',
    border: 'rgba(186, 198, 214, 0.3)',
    delete: '#ff8686',
    deleteHover: '#ff6868',
    projectLevel1: '#bec9d7',
    projectLevel2: '#8093a8',
    projectLevel3: '#4a5d74',
    panel: 'rgba(22, 29, 38, 0.72)',
    panelStrong: 'rgba(29, 37, 48, 0.84)',
    panelBorder: 'rgba(186, 198, 214, 0.22)',
    buttonBg: '#d5dee8',
    buttonBgHover: '#e2e9f1',
    buttonText: '#141a22',
    buttonBorder: 'rgba(200, 211, 224, 0.52)',
    onAccentText: '#141a22',
    navBarBg: 'rgba(13, 17, 23, 0.94)',
    navButtonBg: 'rgba(186, 198, 214, 0.12)',
    navButtonActiveBg: 'rgba(63, 77, 96, 0.92)',
    navButtonActiveText: '#f5f7fb',
    overlay: 'rgba(6, 9, 13, 0.5)',
  },
  'aurora-mist': {
    primary: '#362226',
    secondary: 'rgba(86, 50, 54, 0.46)',
    tertiary: 'rgba(129, 81, 79, 0.52)',
    quaternary: 'rgba(255, 182, 142, 0.2)',
    accent: '#ffb68e',
    text: '#fff6f1',
    mutedText: 'rgba(255, 246, 241, 0.74)',
    border: '#ca9788',
    delete: '#ff8e85',
    deleteHover: '#ff736c',
    projectLevel1: '#f0ad8b',
    projectLevel2: '#cf8669',
    projectLevel3: '#8f5849',
    panel: 'rgba(46, 29, 33, 0.66)',
    panelStrong: 'rgba(54, 34, 38, 0.78)',
    panelBorder: 'rgba(255, 182, 142, 0.26)',
    buttonBg: '#ffc09a',
    buttonBgHover: '#ffd0b3',
    buttonText: '#532f26',
    buttonBorder: 'rgba(255, 182, 142, 0.46)',
    onAccentText: '#532f26',
    navBarBg: 'rgba(36, 22, 25, 0.88)',
    navButtonBg: 'rgba(255, 182, 142, 0.12)',
    navButtonActiveBg: 'rgba(182, 112, 89, 0.9)',
    navButtonActiveText: '#fff6f1',
  },
  'amethyst-haze': {
    primary: '#141826',
    secondary: 'rgba(29, 34, 53, 0.46)',
    tertiary: 'rgba(50, 61, 96, 0.52)',
    quaternary: 'rgba(157, 176, 255, 0.2)',
    accent: '#9db0ff',
    text: '#f5f7ff',
    mutedText: 'rgba(245, 247, 255, 0.74)',
    border: '#8394c9',
    delete: '#ff8fa2',
    deleteHover: '#ff748c',
    projectLevel1: '#b1c2ff',
    projectLevel2: '#7488de',
    projectLevel3: '#46589d',
    panel: 'rgba(20, 24, 37, 0.66)',
    panelStrong: 'rgba(24, 29, 45, 0.78)',
    panelBorder: 'rgba(157, 176, 255, 0.26)',
    buttonBg: '#b9c8ff',
    buttonBgHover: '#ced8ff',
    buttonText: '#1f2742',
    buttonBorder: 'rgba(157, 176, 255, 0.48)',
    onAccentText: '#1f2742',
    navBarBg: 'rgba(15, 19, 31, 0.88)',
    navButtonBg: 'rgba(157, 176, 255, 0.12)',
    navButtonActiveBg: 'rgba(92, 109, 183, 0.9)',
    navButtonActiveText: '#f5f7ff',
  },
  'velvet-bordeaux': {
    primary: '#2f141d',
    secondary: 'rgba(83, 29, 44, 0.48)',
    tertiary: 'rgba(121, 49, 67, 0.54)',
    quaternary: 'rgba(183, 92, 111, 0.18)',
    accent: '#d8a6b8',
    text: '#fff3f6',
    mutedText: 'rgba(255, 243, 246, 0.74)',
    border: '#b78898',
    delete: '#ff919b',
    deleteHover: '#ff7784',
    projectLevel1: '#c58da2',
    projectLevel2: '#a6607a',
    projectLevel3: '#6c3348',
    panel: 'rgba(43, 20, 29, 0.68)',
    panelStrong: 'rgba(57, 26, 37, 0.8)',
    panelBorder: 'rgba(216, 166, 184, 0.26)',
    buttonBg: '#e2b0c2',
    buttonBgHover: '#ebc1cf',
    buttonText: '#421d2a',
    buttonBorder: 'rgba(216, 166, 184, 0.46)',
    onAccentText: '#421d2a',
    navBarBg: 'rgba(38, 16, 25, 0.9)',
    navButtonBg: 'rgba(216, 166, 184, 0.12)',
    navButtonActiveBg: 'rgba(142, 77, 99, 0.88)',
    navButtonActiveText: '#fff3f6',
  },
  'champagne-sandstone': {
    primary: '#f1ebe2',
    secondary: 'rgba(255, 250, 243, 0.7)',
    tertiary: 'rgba(234, 222, 205, 0.82)',
    quaternary: 'rgba(220, 203, 181, 0.62)',
    accent: '#8b6f57',
    text: '#2f261f',
    mutedText: 'rgba(47, 38, 31, 0.68)',
    border: '#b59f8c',
    delete: '#c85656',
    deleteHover: '#ad4343',
    projectLevel1: '#bca087',
    projectLevel2: '#cfb59a',
    projectLevel3: '#e0d0bf',
    panel: 'rgba(255, 251, 246, 0.78)',
    panelStrong: 'rgba(250, 245, 239, 0.9)',
    panelBorder: 'rgba(143, 119, 95, 0.22)',
    buttonBg: '#8b6f57',
    buttonBgHover: '#a28267',
    buttonText: '#f8f3ec',
    buttonBorder: 'rgba(139, 111, 87, 0.44)',
    onAccentText: '#f8f3ec',
    navBarBg: 'rgba(248, 241, 232, 0.92)',
    navButtonBg: 'rgba(139, 111, 87, 0.08)',
    navButtonActiveBg: 'rgba(145, 118, 92, 0.88)',
    navButtonActiveText: '#f8f3ec',
    overlay: 'rgba(40, 34, 28, 0.18)',
  },
  'porcelain-mist': {
    primary: '#e8eff7',
    secondary: 'rgba(255, 255, 255, 0.72)',
    tertiary: 'rgba(235, 241, 250, 0.82)',
    quaternary: 'rgba(221, 229, 239, 0.64)',
    accent: '#4e6d8d',
    text: '#1d2a38',
    mutedText: 'rgba(29, 42, 56, 0.68)',
    border: '#869db7',
    delete: '#c95a5a',
    deleteHover: '#af4949',
    projectLevel1: '#768fa8',
    projectLevel2: '#97adc1',
    projectLevel3: '#c6d3e0',
    panel: 'rgba(255, 255, 255, 0.78)',
    panelStrong: 'rgba(250, 252, 255, 0.9)',
    panelBorder: 'rgba(94, 117, 145, 0.22)',
    buttonBg: '#4e6d8d',
    buttonBgHover: '#6182a4',
    buttonText: '#f7fbff',
    buttonBorder: 'rgba(78, 109, 141, 0.48)',
    onAccentText: '#f7fbff',
    navBarBg: 'rgba(244, 249, 255, 0.92)',
    navButtonBg: 'rgba(78, 109, 141, 0.08)',
    navButtonActiveBg: 'rgba(88, 121, 156, 0.88)',
    navButtonActiveText: '#f7fbff',
    overlay: 'rgba(20, 31, 43, 0.17)',
  },
  'sage-cashmere': {
    primary: '#edf1ec',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(237, 242, 236, 0.82)',
    quaternary: 'rgba(215, 223, 216, 0.64)',
    accent: '#5f6f64',
    text: '#243028',
    mutedText: 'rgba(36, 48, 40, 0.68)',
    border: '#94a296',
    delete: '#c95c60',
    deleteHover: '#ae4a4f',
    projectLevel1: '#7f9184',
    projectLevel2: '#9bad9f',
    projectLevel3: '#c7d2c9',
    panel: 'rgba(255, 255, 255, 0.76)',
    panelStrong: 'rgba(249, 252, 248, 0.9)',
    panelBorder: 'rgba(103, 119, 109, 0.22)',
    buttonBg: '#5f6f64',
    buttonBgHover: '#73857a',
    buttonText: '#f4f7f3',
    buttonBorder: 'rgba(95, 111, 100, 0.46)',
    onAccentText: '#f4f7f3',
    navBarBg: 'rgba(246, 249, 245, 0.92)',
    navButtonBg: 'rgba(95, 111, 100, 0.08)',
    navButtonActiveBg: 'rgba(105, 123, 111, 0.88)',
    navButtonActiveText: '#f4f7f3',
    overlay: 'rgba(25, 32, 27, 0.17)',
  },
  'oyster-linen': {
    primary: '#f1eef6',
    secondary: 'rgba(255, 252, 255, 0.72)',
    tertiary: 'rgba(241, 236, 247, 0.82)',
    quaternary: 'rgba(225, 217, 234, 0.64)',
    accent: '#6d617d',
    text: '#2c2733',
    mutedText: 'rgba(44, 39, 51, 0.68)',
    border: '#a89db7',
    delete: '#c55a63',
    deleteHover: '#aa4752',
    projectLevel1: '#9a8da9',
    projectLevel2: '#b6abc3',
    projectLevel3: '#d8d1e2',
    panel: 'rgba(255, 252, 255, 0.78)',
    panelStrong: 'rgba(250, 247, 252, 0.9)',
    panelBorder: 'rgba(113, 101, 130, 0.22)',
    buttonBg: '#6d617d',
    buttonBgHover: '#827492',
    buttonText: '#f9f6fb',
    buttonBorder: 'rgba(109, 97, 125, 0.46)',
    onAccentText: '#f9f6fb',
    navBarBg: 'rgba(247, 243, 249, 0.92)',
    navButtonBg: 'rgba(109, 97, 125, 0.08)',
    navButtonActiveBg: 'rgba(124, 111, 141, 0.88)',
    navButtonActiveText: '#f9f6fb',
    overlay: 'rgba(29, 24, 36, 0.17)',
  },
  'midnight-indigo': {
    primary: '#111722',
    secondary: 'rgba(29, 37, 56, 0.46)',
    tertiary: 'rgba(48, 59, 84, 0.54)',
    quaternary: 'rgba(214, 195, 156, 0.18)',
    accent: '#d6c39c',
    text: '#faf7f1',
    mutedText: 'rgba(250, 247, 241, 0.74)',
    border: '#98876b',
    delete: '#ff9c86',
    deleteHover: '#ff836f',
    projectLevel1: '#deccab',
    projectLevel2: '#a59372',
    projectLevel3: '#5f5542',
    panel: 'rgba(18, 23, 34, 0.68)',
    panelStrong: 'rgba(25, 31, 45, 0.8)',
    panelBorder: 'rgba(214, 195, 156, 0.28)',
    buttonBg: '#e3d2af',
    buttonBgHover: '#ecdfc3',
    buttonText: '#2a241b',
    buttonBorder: 'rgba(214, 195, 156, 0.48)',
    onAccentText: '#2a241b',
    navBarBg: 'rgba(16, 21, 32, 0.88)',
    navButtonBg: 'rgba(214, 195, 156, 0.12)',
    navButtonActiveBg: 'rgba(128, 113, 83, 0.9)',
    navButtonActiveText: '#faf7f1',
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
const RELEASE_PERF_CONSOLE_EVENTS = new Set([
  'page-ready',
  'transition-start',
  'transition-complete',
  'transition-load-grace',
  'navigation-queued',
  'navigation-replayed',
  'launch-action-consumed',
  'launch-action-acknowledged',
  'launch-action-redispatched',
  'launch-action-rejected',
  'launch-action-ack-timeout',
]);

function shouldLogPerfMetricToConsole(
  name: string,
  payload: Record<string, unknown> = {},
) {
  if (typeof payload.stage === 'string' && payload.stage.trim()) {
    return true;
  }
  return RELEASE_PERF_CONSOLE_EVENTS.has(String(name || '').trim());
}

function serializePerfMetricLog(
  name: string,
  payload: Record<string, unknown> = {},
) {
  try {
    return JSON.stringify({
      name,
      ...payload,
    });
  } catch (error) {
    return JSON.stringify({
      name,
      serializationError:
        error instanceof Error ? error.message : 'unknown-error',
    });
  }
}
const PAGE_SWITCH_LOAD_TIMEOUT_MS = IS_ANDROID ? 2600 : 1100;
const PAGE_SWITCH_THEME_READY_TIMEOUT_MS = IS_ANDROID ? 900 : 420;
const PAGE_SWITCH_THEME_READY_WATCHDOG_MARGIN_MS = IS_ANDROID ? 120 : 80;
const PAGE_SWITCH_LOAD_TIMEOUT_GRACE_MS = IS_ANDROID ? 1000 : 140;
const ANDROID_READY_TO_PRESENT_SETTLE_MS = 220;
const PAGE_READY_FALLBACK_REVEAL_MS = IS_ANDROID ? 5200 : 1200;
const APP_BACKGROUND_STORAGE_FLUSH_TIMEOUT_MS = IS_ANDROID ? 520 : 420;
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
const EDGE_BACK_SWIPE_REGION_WIDTH = IS_ANDROID ? 24 : 56;
const EDGE_BACK_SWIPE_BOTTOM_EXCLUSION_HEIGHT = IS_ANDROID ? 92 : 0;
const EDGE_BACK_SWIPE_MIN_DISTANCE = IS_ANDROID ? 24 : 44;
const EDGE_BACK_SWIPE_MIN_FLING_DISTANCE = IS_ANDROID ? 10 : 20;
const EDGE_BACK_SWIPE_MIN_VELOCITY = IS_ANDROID ? 0.18 : 0.32;
const EDGE_BACK_SWIPE_MAX_VERTICAL_DRIFT = IS_ANDROID ? 128 : 84;
const EDGE_BACK_SWIPE_HORIZONTAL_DOMINANCE_RATIO = IS_ANDROID ? 0.6 : 0.75;
const WEBVIEW_SLOTS: WebViewSlot[] = ['primary', 'secondary', 'tertiary'];
const CLEAR_TRANSIENT_WEBVIEW_OVERLAYS_SCRIPT = `(() => {
  try {
    document.querySelectorAll('.page-loading-overlay').forEach(overlay => {
      if (!overlay) return;
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      if (overlay.dataset) {
        overlay.dataset.shellSuppressed = 'false';
        overlay.dataset.appEnterSuppressed = 'false';
      }
      if (overlay.style) {
        overlay.style.pointerEvents = '';
      }
    });
    const classes = [
      'controler-blocking-overlay-active',
      'controler-fullscreen-overlay-active'
    ];
    document.documentElement && document.documentElement.classList.remove(...classes);
    document.body && document.body.classList.remove(...classes);
    window.dispatchEvent(new CustomEvent('controler:rn-transient-overlays-cleared', {
      detail: { source: 'react-native-shell' }
    }));
  } catch (error) {}
})(); true;`;
const ANDROID_IDLE_CACHE_TRIM_DELAY_MS = 220;
const ANDROID_ASSET_WEB_ROOT = 'file:///android_asset/controler-web';
const ANDROID_ASSET_WEB_VERSION_QUERY_PARAM = 'assetVersion';
const ANDROID_ASSET_WEB_VERSION =
  typeof appPackageJson?.version === 'string' && appPackageJson.version.trim()
    ? appPackageJson.version.trim()
    : 'dev';
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

function toBootThemeRgbChannels(value: string, fallback = '241, 244, 250'): string {
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
  const accent = normalizeBootThemeColor(colors?.accent, fallback.accent);
  const buttonBg = normalizeBootThemeColor(
    colors?.buttonBg ?? colors?.accent,
    fallback.buttonBg,
  );
  const buttonBgHover = normalizeBootThemeColor(
    colors?.buttonBgHover ?? colors?.buttonBg ?? colors?.accent,
    fallback.buttonBgHover,
  );
  const onAccentText = normalizeBootThemeColor(
    colors?.onAccentText,
    getBootThemeContrastText(accent),
  );
  const buttonText = normalizeBootThemeColor(
    colors?.buttonText,
    getBootThemeContrastText(buttonBg),
  );
  const navBarBg = normalizeBootThemeColor(
    colors?.navBarBg ?? colors?.panelStrong ?? colors?.panel,
    fallback.navBarBg,
  );
  const navBarBorder = normalizeBootThemeColor(
    colors?.navBarBorder ?? colors?.panelBorder ?? colors?.border,
    fallback.navBarBorder,
  );
  const navButtonBg = normalizeBootThemeColor(
    colors?.navButtonBg ?? colors?.panelBorder,
    fallback.navButtonBg,
  );
  const navButtonText = normalizeBootThemeColor(
    colors?.navButtonText ?? colors?.mutedText ?? colors?.text,
    fallback.navButtonText,
  );
  const navButtonActiveBg = normalizeBootThemeColor(
    colors?.navButtonActiveBg ?? colors?.accent,
    fallback.navButtonActiveBg,
  );
  const navButtonActiveText = normalizeBootThemeColor(
    colors?.navButtonActiveText ??
      colors?.navButtonText ??
      colors?.text ??
      colors?.mutedText,
    fallback.navButtonActiveText,
  );
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
    accent,
    buttonBg,
    buttonBgHover,
    buttonText,
    onAccentText,
    projectLevel1: normalizeBootThemeColor(
      colors?.projectLevel1,
      fallback.projectLevel1,
    ),
    projectLevel2: normalizeBootThemeColor(
      colors?.projectLevel2,
      fallback.projectLevel2,
    ),
    projectLevel3: normalizeBootThemeColor(
      colors?.projectLevel3,
      fallback.projectLevel3,
    ),
    text: normalizeBootThemeColor(colors?.text, fallback.text),
    mutedText: normalizeBootThemeColor(colors?.mutedText, fallback.mutedText),
    navBarBg,
    navBarBorder,
    navButtonBg,
    navButtonText,
    navButtonActiveBg,
    navButtonActiveText,
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

function buildShellBootThemeFromPalette(
  palette: Partial<ShellBootTheme> | null | undefined,
  fallback: ShellBootTheme = DEFAULT_SHELL_BOOT_THEME,
): ShellBootTheme {
  const navBarBg = normalizeBootThemeColor(palette?.navBarBg, fallback.navBarBg);
  const navBarBorder = normalizeBootThemeColor(
    palette?.navBarBorder ?? palette?.cardBorder,
    fallback.navBarBorder,
  );
  const navButtonBg = normalizeBootThemeColor(
    palette?.navButtonBg,
    fallback.navButtonBg,
  );
  const navButtonText = normalizeBootThemeColor(
    palette?.navButtonText ?? palette?.mutedText ?? palette?.text,
    fallback.navButtonText,
  );
  const navButtonActiveBg = normalizeBootThemeColor(
    palette?.navButtonActiveBg,
    fallback.navButtonActiveBg,
  );
  const navButtonActiveText = normalizeBootThemeColor(
    palette?.navButtonActiveText ??
      palette?.navButtonText ??
      palette?.text ??
      palette?.mutedText,
    fallback.navButtonActiveText,
  );
  return {
    screenBg: normalizeBootThemeColor(palette?.screenBg, fallback.screenBg),
    cardBg: normalizeBootThemeColor(palette?.cardBg, fallback.cardBg),
    cardBorder: normalizeBootThemeColor(palette?.cardBorder, fallback.cardBorder),
    accent: normalizeBootThemeColor(palette?.accent, fallback.accent),
    buttonBg: normalizeBootThemeColor(palette?.buttonBg, fallback.buttonBg),
    buttonBgHover: normalizeBootThemeColor(
      palette?.buttonBgHover,
      fallback.buttonBgHover,
    ),
    buttonText: normalizeBootThemeColor(palette?.buttonText, fallback.buttonText),
    onAccentText: normalizeBootThemeColor(
      palette?.onAccentText,
      fallback.onAccentText,
    ),
    projectLevel1: normalizeBootThemeColor(
      palette?.projectLevel1,
      fallback.projectLevel1,
    ),
    projectLevel2: normalizeBootThemeColor(
      palette?.projectLevel2,
      fallback.projectLevel2,
    ),
    projectLevel3: normalizeBootThemeColor(
      palette?.projectLevel3,
      fallback.projectLevel3,
    ),
    text: normalizeBootThemeColor(palette?.text, fallback.text),
    mutedText: normalizeBootThemeColor(palette?.mutedText, fallback.mutedText),
    navBarBg,
    navBarBorder,
    navButtonBg,
    navButtonText,
    navButtonActiveBg,
    navButtonActiveText,
    indicatorBg: normalizeBootThemeColor(palette?.indicatorBg, fallback.indicatorBg),
    transitionOverlay: normalizeBootThemeColor(
      palette?.transitionOverlay,
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
      : DEFAULT_THEME_ID;
  const resolvedTheme = resolveShellBootTheme(themeState);
  const customThemes = Array.isArray(normalizedThemeState.customThemes)
    ? normalizedThemeState.customThemes
    : [];
  const builtInThemeOverrides = isPlainObject(
    normalizedThemeState.builtInThemeOverrides,
  )
    ? normalizedThemeState.builtInThemeOverrides
    : {};
  const matchedCustomTheme = customThemes.find(theme => {
    return (
      isPlainObject(theme) &&
      typeof theme.id === 'string' &&
      theme.id.trim() === selectedTheme
    );
  });
  const builtInBaseColors = {
    ...DEFAULT_LAUNCH_THEME_COLORS,
    ...(BUILT_IN_LAUNCH_THEME_COLOR_MAP[selectedTheme] || {}),
  };
  const selectedBuiltInOverride = builtInThemeOverrides[selectedTheme];
  const rawResolvedColors =
    isPlainObject(matchedCustomTheme) && isPlainObject(matchedCustomTheme.colors)
      ? matchedCustomTheme.colors
      : isPlainObject(selectedBuiltInOverride) &&
          isPlainObject(selectedBuiltInOverride.colors)
        ? {
            ...builtInBaseColors,
            ...selectedBuiltInOverride.colors,
          }
        : builtInBaseColors;
  const resolvedColors: LaunchThemeColors = {
    primary: normalizeBootThemeColor(
      rawResolvedColors.primary,
      DEFAULT_LAUNCH_THEME_COLORS.primary,
    ),
    secondary: normalizeBootThemeColor(
      rawResolvedColors.secondary,
      DEFAULT_LAUNCH_THEME_COLORS.secondary,
    ),
    tertiary: normalizeBootThemeColor(
      rawResolvedColors.tertiary,
      DEFAULT_LAUNCH_THEME_COLORS.tertiary,
    ),
    quaternary: normalizeBootThemeColor(
      rawResolvedColors.quaternary,
      DEFAULT_LAUNCH_THEME_COLORS.quaternary,
    ),
    accent: normalizeBootThemeColor(
      rawResolvedColors.accent,
      DEFAULT_LAUNCH_THEME_COLORS.accent,
    ),
    text: normalizeBootThemeColor(
      rawResolvedColors.text,
      DEFAULT_LAUNCH_THEME_COLORS.text,
    ),
    mutedText: normalizeBootThemeColor(
      rawResolvedColors.mutedText,
      DEFAULT_LAUNCH_THEME_COLORS.mutedText,
    ),
    border: normalizeBootThemeColor(
      rawResolvedColors.border,
      DEFAULT_LAUNCH_THEME_COLORS.border,
    ),
    delete: normalizeBootThemeColor(
      rawResolvedColors.delete,
      DEFAULT_LAUNCH_THEME_COLORS.delete,
    ),
    deleteHover: normalizeBootThemeColor(
      rawResolvedColors.deleteHover,
      DEFAULT_LAUNCH_THEME_COLORS.deleteHover,
    ),
    projectLevel1: normalizeBootThemeColor(
      rawResolvedColors.projectLevel1,
      DEFAULT_LAUNCH_THEME_COLORS.projectLevel1,
    ),
    projectLevel2: normalizeBootThemeColor(
      rawResolvedColors.projectLevel2,
      DEFAULT_LAUNCH_THEME_COLORS.projectLevel2,
    ),
    projectLevel3: normalizeBootThemeColor(
      rawResolvedColors.projectLevel3,
      DEFAULT_LAUNCH_THEME_COLORS.projectLevel3,
    ),
    panel: normalizeBootThemeColor(
      rawResolvedColors.panel,
      DEFAULT_LAUNCH_THEME_COLORS.panel,
    ),
    panelStrong: normalizeBootThemeColor(
      rawResolvedColors.panelStrong,
      DEFAULT_LAUNCH_THEME_COLORS.panelStrong,
    ),
    panelBorder: normalizeBootThemeColor(
      rawResolvedColors.panelBorder,
      DEFAULT_LAUNCH_THEME_COLORS.panelBorder,
    ),
    buttonBg: normalizeBootThemeColor(
      rawResolvedColors.buttonBg,
      DEFAULT_LAUNCH_THEME_COLORS.buttonBg,
    ),
    buttonBgHover: normalizeBootThemeColor(
      rawResolvedColors.buttonBgHover,
      DEFAULT_LAUNCH_THEME_COLORS.buttonBgHover,
    ),
    buttonText: normalizeBootThemeColor(
      rawResolvedColors.buttonText,
      DEFAULT_LAUNCH_THEME_COLORS.buttonText,
    ),
    buttonBorder: normalizeBootThemeColor(
      rawResolvedColors.buttonBorder,
      DEFAULT_LAUNCH_THEME_COLORS.buttonBorder,
    ),
    onAccentText: normalizeBootThemeColor(
      rawResolvedColors.onAccentText,
      DEFAULT_LAUNCH_THEME_COLORS.onAccentText,
    ),
    navBarBg: normalizeBootThemeColor(
      rawResolvedColors.navBarBg,
      DEFAULT_LAUNCH_THEME_COLORS.navBarBg,
    ),
    navBarBorder: normalizeBootThemeColor(
      rawResolvedColors.navBarBorder,
      normalizeBootThemeColor(
        rawResolvedColors.panelBorder ?? rawResolvedColors.border,
        DEFAULT_LAUNCH_THEME_COLORS.navBarBorder,
      ),
    ),
    navButtonBg: normalizeBootThemeColor(
      rawResolvedColors.navButtonBg,
      DEFAULT_LAUNCH_THEME_COLORS.navButtonBg,
    ),
    navButtonText: normalizeBootThemeColor(
      rawResolvedColors.navButtonText,
      normalizeBootThemeColor(
        rawResolvedColors.mutedText ?? rawResolvedColors.text,
        DEFAULT_LAUNCH_THEME_COLORS.navButtonText,
      ),
    ),
    navButtonActiveBg: normalizeBootThemeColor(
      rawResolvedColors.navButtonActiveBg,
      DEFAULT_LAUNCH_THEME_COLORS.navButtonActiveBg,
    ),
    navButtonActiveText: normalizeBootThemeColor(
      rawResolvedColors.navButtonActiveText,
      DEFAULT_LAUNCH_THEME_COLORS.navButtonActiveText,
    ),
    overlay: normalizeBootThemeColor(
      rawResolvedColors.overlay,
      DEFAULT_LAUNCH_THEME_COLORS.overlay,
    ),
  };

  return {
    themeId: selectedTheme,
    colorScheme: isLightBootTheme(resolvedTheme) ? 'light' : 'dark',
    backgroundColor: resolvedColors.primary,
    textColor: resolvedColors.text,
    variables: {
      '--bg-primary': resolvedColors.primary,
      '--bg-secondary': resolvedColors.secondary,
      '--bg-tertiary': resolvedColors.tertiary,
      '--bg-quaternary': resolvedColors.quaternary,
      '--accent-color': resolvedColors.accent,
      '--accent-color-rgb': toBootThemeRgbChannels(resolvedColors.accent),
      '--text-color': resolvedColors.text,
      '--muted-text-color': resolvedColors.mutedText,
      '--border-color': resolvedColors.border,
      '--delete-btn': resolvedColors.delete,
      '--delete-hover': resolvedColors.deleteHover,
      '--project-level-1': resolvedColors.projectLevel1,
      '--project-level-2': resolvedColors.projectLevel2,
      '--project-level-3': resolvedColors.projectLevel3,
      '--panel-bg': resolvedColors.panel,
      '--panel-strong-bg': resolvedColors.panelStrong,
      '--panel-border-color': resolvedColors.panelBorder,
      '--button-bg': resolvedColors.buttonBg,
      '--button-bg-hover': resolvedColors.buttonBgHover,
      '--button-text': resolvedColors.buttonText,
      '--button-border': resolvedColors.buttonBorder,
      '--on-accent-text': resolvedColors.onAccentText,
      '--bottom-nav-bg': resolvedColors.navBarBg,
      '--bottom-nav-border': resolvedColors.navBarBorder,
      '--bottom-nav-button-bg': resolvedColors.navButtonBg,
      '--bottom-nav-button-text': resolvedColors.navButtonText,
      '--bottom-nav-button-active-bg': resolvedColors.navButtonActiveBg,
      '--bottom-nav-active-text': resolvedColors.navButtonActiveText,
      '--overlay-bg': resolvedColors.overlay,
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
    left.buttonBg === right.buttonBg &&
    left.buttonBgHover === right.buttonBgHover &&
    left.buttonText === right.buttonText &&
    left.onAccentText === right.onAccentText &&
    left.projectLevel1 === right.projectLevel1 &&
    left.projectLevel2 === right.projectLevel2 &&
    left.projectLevel3 === right.projectLevel3 &&
    left.text === right.text &&
    left.mutedText === right.mutedText &&
    left.navBarBg === right.navBarBg &&
    left.navBarBorder === right.navBarBorder &&
    left.navButtonBg === right.navButtonBg &&
    left.navButtonText === right.navButtonText &&
    left.navButtonActiveBg === right.navButtonActiveBg &&
    left.navButtonActiveText === right.navButtonActiveText &&
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
      : DEFAULT_THEME_ID;
  const customThemes = Array.isArray(coreState.customThemes)
    ? coreState.customThemes
    : [];
  const builtInOverrides = isPlainObject(coreState.builtInThemeOverrides)
    ? coreState.builtInThemeOverrides
    : {};
  const builtInBase = buildShellBootThemeFromPalette(
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

function buildSharedThemeStatePayload(
  coreState: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!coreState) {
    return {
      selectedTheme: DEFAULT_THEME_ID,
      customThemes: [],
      builtInThemeOverrides: {},
    };
  }
  const selectedTheme =
    typeof coreState.selectedTheme === 'string' && coreState.selectedTheme.trim()
      ? coreState.selectedTheme.trim()
      : DEFAULT_THEME_ID;
  const customThemes = Array.isArray(coreState.customThemes)
    ? coreState.customThemes
    : [];
  const builtInThemeOverrides = isPlainObject(coreState.builtInThemeOverrides)
    ? coreState.builtInThemeOverrides
    : {};
  return {
    selectedTheme,
    customThemes,
    builtInThemeOverrides,
  };
}

function buildLaunchThemeStatePayload(
  coreState: Record<string, unknown> | null,
): Record<string, unknown> {
  const sharedThemeState = buildSharedThemeStatePayload(coreState);
  const selectedTheme =
    typeof sharedThemeState.selectedTheme === 'string' &&
    sharedThemeState.selectedTheme.trim()
      ? sharedThemeState.selectedTheme.trim()
      : DEFAULT_THEME_ID;
  const customThemes = Array.isArray(sharedThemeState.customThemes)
    ? sharedThemeState.customThemes
    : [];
  const matchedCustomTheme = customThemes.find(theme => {
    return (
      isPlainObject(theme) &&
      typeof theme.id === 'string' &&
      theme.id.trim() === selectedTheme
    );
  });
  const builtInOverrides = isPlainObject(sharedThemeState.builtInThemeOverrides)
    ? sharedThemeState.builtInThemeOverrides
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

function buildLaunchThemeTracePayload(
  coreState: Record<string, unknown> | null,
): Record<string, unknown> {
  const normalizedThemeState = buildLaunchThemeStatePayload(coreState);
  const selectedTheme =
    typeof normalizedThemeState.selectedTheme === 'string' &&
    normalizedThemeState.selectedTheme.trim()
      ? normalizedThemeState.selectedTheme.trim()
      : DEFAULT_THEME_ID;
  const customThemes = Array.isArray(normalizedThemeState.customThemes)
    ? normalizedThemeState.customThemes
    : [];
  const builtInThemeOverrides = isPlainObject(
    normalizedThemeState.builtInThemeOverrides,
  )
    ? normalizedThemeState.builtInThemeOverrides
    : {};
  const resolvedBootTheme = resolveShellBootTheme(normalizedThemeState);

  return {
    selectedTheme,
    customThemeCount: customThemes.length,
    builtInOverrideCount: Object.keys(builtInThemeOverrides).length,
    screenBg: resolvedBootTheme.screenBg,
    cardBg: resolvedBootTheme.cardBg,
    accent: resolvedBootTheme.accent,
  };
}

function buildInjectionScript(message: Record<string, unknown>): string {
  const serialized = JSON.stringify(message)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `
    (function () {
      const message = ${serialized};
      const receiver =
        typeof window.__controlerReceiveNativeMessage === 'function'
          ? window.__controlerReceiveNativeMessage
          : null;
      if (receiver) {
        receiver(message);
        return true;
      }
      const pendingNativeMessages = Array.isArray(
        window.__CONTROLER_PENDING_NATIVE_MESSAGES__,
      )
        ? window.__CONTROLER_PENDING_NATIVE_MESSAGES__
        : [];
      window.__CONTROLER_PENDING_NATIVE_MESSAGES__ = pendingNativeMessages;
      pendingNativeMessages.push(message);
      return true;
    })();
    true;
  `;
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

function appendAndroidAssetVersion(value: string): string {
  const trimmed = String(value || '').trim();
  if (!IS_ANDROID || !trimmed.startsWith(ANDROID_ASSET_WEB_ROOT)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set(
      ANDROID_ASSET_WEB_VERSION_QUERY_PARAM,
      ANDROID_ASSET_WEB_VERSION,
    );
    return parsed.toString();
  } catch {
    const separator = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${separator}${ANDROID_ASSET_WEB_VERSION_QUERY_PARAM}=${encodeURIComponent(ANDROID_ASSET_WEB_VERSION)}`;
  }
}

function normalizeAppHref(value: string, fallback = 'index.html'): string {
  const trimmed = String(value || '').trim();
  const normalized = trimmed.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
  return normalized || fallback;
}

function buildAndroidAssetUrl(value: string, fallback = 'index.html'): string {
  const trimmed = String(value || '').trim();
  if (isAbsoluteUrlString(trimmed)) {
    return appendAndroidAssetVersion(trimmed);
  }
  return appendAndroidAssetVersion(
    `${ANDROID_ASSET_WEB_ROOT}/${normalizeAppHref(trimmed, fallback)}`,
  );
}

export function resolveAppPageUri(
  baseUrl: string | null,
  value: string,
  fallback = 'index.html',
): string {
  const trimmedValue = String(value || '').trim();
  if (isAbsoluteUrlString(trimmedValue)) {
    return appendAndroidAssetVersion(trimmedValue);
  }

  const normalizedHref = normalizeAppHref(trimmedValue, fallback);
  const normalizedBaseUrl = String(baseUrl || '').trim();
  if (!normalizedBaseUrl) {
    return buildAndroidAssetUrl(normalizedHref, fallback);
  }

  const sanitizedBaseUrl = normalizedBaseUrl.split('#')[0].split('?')[0];
  const lastSlashIndex = sanitizedBaseUrl.lastIndexOf('/');
  if (lastSlashIndex >= 0) {
    return appendAndroidAssetVersion(
      `${sanitizedBaseUrl.slice(0, lastSlashIndex + 1)}${normalizedHref}`,
    );
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

export function resolveShellBlockingOverlayPayload({
  transitionState,
  activeBusyOverlay,
  busyOverlayStates,
  shellLanguage,
}: {
  transitionState: Pick<TransitionState, 'status' | 'toSlot' | 'fromSlot'> | null;
  activeBusyOverlay: BusyOverlayState;
  busyOverlayStates: Record<WebViewSlot, BusyOverlayState>;
  shellLanguage: UiLanguage;
}): ShellBlockingOverlayPayload {
  const resolveBusyOverlayPayload = (
    busyOverlay: BusyOverlayState | null | undefined,
  ): ShellBlockingOverlayPayload => {
    if (
      !busyOverlay?.active ||
      busyOverlay.presentation !== 'native-fullscreen'
    ) {
      return null;
    }
    return {
      title:
        busyOverlay.title ||
        selectShellText(shellLanguage, '正在处理数据', 'Working on your data'),
      message:
        busyOverlay.message ||
        selectShellText(
          shellLanguage,
          '正在准备当前页面，请稍候。',
          'Preparing the current page.',
        ),
    };
  };

  const activePayload = resolveBusyOverlayPayload(activeBusyOverlay);
  if (activePayload) {
    return activePayload;
  }

  if (transitionState?.status === 'loading') {
    const targetPayload = resolveBusyOverlayPayload(
      busyOverlayStates[transitionState.toSlot],
    );
    if (targetPayload) {
      return targetPayload;
    }
    const sourcePayload = resolveBusyOverlayPayload(
      busyOverlayStates[transitionState.fromSlot],
    );
    if (sourcePayload) {
      return sourcePayload;
    }
  }

  return null;
}

export function resolveShellOverlayViewState({
  isPageReady,
  shellBlockingOverlay,
  shellLanguage,
}: {
  isPageReady: boolean;
  shellBlockingOverlay: ShellBlockingOverlayPayload;
  shellLanguage: UiLanguage;
}): {
  visible: boolean;
  source: 'none' | 'boot' | 'blocking';
  title: string;
  message: string;
} {
  if (shellBlockingOverlay) {
    return {
      visible: true,
      source: 'blocking',
      title: shellBlockingOverlay.title,
      message: shellBlockingOverlay.message,
    };
  }
  if (!isPageReady) {
    return {
      visible: true,
      source: 'boot',
      title: selectShellText(
        shellLanguage,
        '正在加载数据中',
        'Loading your data',
      ),
      message: selectShellText(
        shellLanguage,
        '页面资源与本地数据正在就绪',
        'Preparing page assets and local data',
      ),
    };
  }
  return {
    visible: false,
    source: 'none',
    title: '',
    message: '',
  };
}

function normalizeNavigationDirection(value: unknown): NavigationDirection | '' {
  if (value === 'forward' || value === 'back') {
    return value;
  }
  return '';
}

function readNavigationIntentStamp(
  payload: Record<string, unknown> | BridgeEnvelopePayload | null | undefined,
): NavigationIntentStamp | null {
  const intentId =
    payload && typeof payload.intentId === 'string' ? payload.intentId.trim() : '';
  const requestedAt = Math.max(
    0,
    Number.isFinite(Number(payload?.requestedAt)) ? Number(payload?.requestedAt) : 0,
  );
  const sequence = Math.max(
    0,
    Number.isFinite(Number(payload?.intentSequence))
      ? Number(payload?.intentSequence)
      : 0,
  );
  if (!intentId && requestedAt <= 0 && sequence <= 0) {
    return null;
  }
  return {
    intentId,
    requestedAt,
    sequence,
  };
}

type BridgeNavigationDispatchPolicyOptions = {
  isAndroid: boolean;
  sourceSlot: WebViewSlot;
  activeSlot: WebViewSlot;
  transitionBusy: boolean;
};

type WebViewNavigationDispatchPolicyOptions = {
  isAndroid: boolean;
  sourceSlot: WebViewSlot;
  activeSlot: WebViewSlot;
  transitionState: Pick<TransitionState, 'toSlot'> | null;
};

export function resolveBridgeNavigationDispatchPolicy({
  isAndroid,
  sourceSlot,
  activeSlot,
  transitionBusy,
}: BridgeNavigationDispatchPolicyOptions): {
  ignore: boolean;
  queue: boolean;
  drop: boolean;
} {
  return {
    ignore: isAndroid && sourceSlot !== activeSlot,
    queue: !isAndroid && transitionBusy,
    drop: isAndroid && transitionBusy,
  };
}

export function resolveWebViewNavigationDispatchPolicy({
  isAndroid,
  sourceSlot,
  activeSlot,
  transitionState,
}: WebViewNavigationDispatchPolicyOptions): {
  ignore: boolean;
  allowOnlyExpectedLoad: boolean;
} {
  if (!isAndroid) {
    return {
      ignore: false,
      allowOnlyExpectedLoad: false,
    };
  }

  if (sourceSlot === activeSlot) {
    return {
      ignore: false,
      allowOnlyExpectedLoad: false,
    };
  }

  if (transitionState?.toSlot === sourceSlot) {
    return {
      ignore: false,
      allowOnlyExpectedLoad: true,
    };
  }

  return {
    ignore: true,
    allowOnlyExpectedLoad: false,
  };
}

function resolveShellSlotPresentationState({
  slot,
  activeSlot,
  transitionState,
}: {
  slot: WebViewSlot;
  activeSlot: WebViewSlot;
  transitionState: Pick<TransitionState, 'status' | 'fromSlot' | 'toSlot'> | null;
}): {
  active: boolean;
  transitionLoading: boolean;
} {
  const transitionLoading =
    transitionState?.status === 'loading' && slot === transitionState.toSlot;
  if (transitionState?.status === 'loading') {
    return {
      active: slot === transitionState.fromSlot,
      transitionLoading,
    };
  }
  return {
    active: slot === activeSlot,
    transitionLoading,
  };
}

export function compareNavigationIntentPriority(
  current: Partial<NavigationIntentStamp> | null | undefined,
  incoming: Partial<NavigationIntentStamp> | null | undefined,
): -1 | 0 | 1 {
  const currentRequestedAt = Math.max(
    0,
    Number.isFinite(Number(current?.requestedAt))
      ? Number(current?.requestedAt)
      : 0,
  );
  const incomingRequestedAt = Math.max(
    0,
    Number.isFinite(Number(incoming?.requestedAt))
      ? Number(incoming?.requestedAt)
      : 0,
  );
  if (incomingRequestedAt > currentRequestedAt) {
    return 1;
  }
  if (incomingRequestedAt < currentRequestedAt) {
    return -1;
  }
  const currentSequence = Math.max(
    0,
    Number.isFinite(Number(current?.sequence)) ? Number(current?.sequence) : 0,
  );
  const incomingSequence = Math.max(
    0,
    Number.isFinite(Number(incoming?.sequence)) ? Number(incoming?.sequence) : 0,
  );
  if (incomingSequence > currentSequence) {
    return 1;
  }
  if (incomingSequence < currentSequence) {
    return -1;
  }
  return 0;
}

function isNavigationIntentStale(
  candidate: Partial<NavigationIntentStamp> | null | undefined,
  latest: Partial<NavigationIntentStamp> | null | undefined,
): boolean {
  if (!candidate || !latest) {
    return false;
  }
  return compareNavigationIntentPriority(candidate, latest) > 0;
}

type WebViewInteractivityOptions = {
  isAndroid: boolean;
  slot: WebViewSlot;
  activeSlot: WebViewSlot;
  transitionState: Pick<TransitionState, 'status' | 'fromSlot'> | null;
};

export function isWebViewLayerInteractive({
  isAndroid,
  slot,
  activeSlot,
  transitionState,
}: WebViewInteractivityOptions): boolean {
  if (!transitionState) {
    return slot === activeSlot;
  }
  if (transitionState.status === 'loading') {
    return slot === transitionState.fromSlot;
  }
  return slot === activeSlot;
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
    parsed.searchParams.delete(ANDROID_ASSET_WEB_VERSION_QUERY_PARAM);
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
  const hasLaunchMetadata =
    !!widgetAction ||
    !!widgetKind ||
    !!widgetLaunchId ||
    !!widgetTargetId ||
    widgetCreatedAt > 0;
  const hasWidgetLaunchSource =
    widgetSource === 'android-widget' || widgetSource === 'launcher';

  return {
    active:
      hasLaunchMetadata ||
      (hasWidgetLaunchSource && !!pageKey) ||
      (!!context?.active && (!!pageKey || hasLaunchMetadata)),
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
  runtimeSessionId = '',
): string {
  const serialized = JSON.stringify(payload)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const serializedThemeState = JSON.stringify(
    buildSharedThemeStatePayload(themeState),
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
      const pendingNativeMessages = Array.isArray(
        window.__CONTROLER_PENDING_NATIVE_MESSAGES__,
      )
        ? window.__CONTROLER_PENDING_NATIVE_MESSAGES__
        : [];
      window.__CONTROLER_PENDING_NATIVE_MESSAGES__ = pendingNativeMessages;
      const currentReceiver =
        typeof window.__controlerReceiveNativeMessage === 'function'
          ? window.__controlerReceiveNativeMessage
          : null;
      const currentReceiverKind =
        currentReceiver &&
        typeof currentReceiver.__controlerReceiverKind === 'string'
          ? currentReceiver.__controlerReceiverKind
          : '';
      if (currentReceiverKind !== 'runtime') {
        window.__controlerReceiveNativeMessage = function bootstrapReceive(
          message,
        ) {
          pendingNativeMessages.push(message);
          return true;
        };
        window.__controlerReceiveNativeMessage.__controlerReceiverKind =
          'bootstrap';
        window.__controlerReceiveNativeMessage.__controlerBridgeEvalId =
          'bootstrap';
      }
      window.__CONTROLER_RN_META__ = {
        ...${JSON.stringify(platformContract.getReactNativeRuntimeProfile(Platform.OS))},
        runtimeSessionId: ${JSON.stringify(runtimeSessionId)},
      };
      window.__CONTROLER_RN_SESSION_ID__ = ${JSON.stringify(runtimeSessionId)};
      const themeState = ${serializedThemeState};
      const themeBootstrapState = ${serializedThemeBootstrapState};
      try {
        const root = document.documentElement;
        const localThemeMirrorPrefix = '__controler_local__:';
        const selectedTheme =
          typeof themeState?.selectedTheme === 'string' &&
          themeState.selectedTheme.trim()
            ? themeState.selectedTheme.trim()
            : ${JSON.stringify(DEFAULT_THEME_ID)};
        const customThemes = Array.isArray(themeState?.customThemes)
          ? themeState.customThemes
          : [];
        const builtInThemeOverrides =
          themeState?.builtInThemeOverrides &&
          typeof themeState.builtInThemeOverrides === 'object' &&
          !Array.isArray(themeState.builtInThemeOverrides)
            ? themeState.builtInThemeOverrides
            : {};
        if (window.localStorage && typeof window.localStorage.setItem === 'function') {
          window.localStorage.setItem(
            localThemeMirrorPrefix + 'selectedTheme',
            selectedTheme,
          );
          window.localStorage.setItem(
            localThemeMirrorPrefix + 'customThemes',
            JSON.stringify(customThemes),
          );
          window.localStorage.setItem(
            localThemeMirrorPrefix + 'builtInThemeOverrides',
            JSON.stringify(builtInThemeOverrides),
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
        if (
          window.ReactNativeWebView &&
          typeof window.ReactNativeWebView.postMessage === 'function'
        ) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'bridge-event',
              payload: {
                name: 'ui.theme-applied',
                href: window.location.href,
                selectedTheme,
                customThemes,
                builtInThemeOverrides,
              },
            }),
          );
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
  const runtimeSessionIdRef = useRef<string>(createRuntimeSessionId());
  const initialCoreStateRef = useRef<Record<string, unknown> | null>(
    parseBridgeJson(initialCoreStateJson),
  );
  const sharedThemeStateRef = useRef<Record<string, unknown>>(
    buildSharedThemeStatePayload(initialCoreStateRef.current),
  );
  const launchThemeStateRef = useRef<Record<string, unknown>>(
    buildLaunchThemeStatePayload(initialCoreStateRef.current),
  );
  const lastPersistedLaunchThemeStateSignatureRef = useRef<string>(
    JSON.stringify(launchThemeStateRef.current),
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
  const androidLoadedTransitionTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const transitionWatchdogRef = useRef<{
    token: number;
    startedAt: number;
    fromSlot: WebViewSlot;
    toSlot: WebViewSlot;
    targetUri: string;
    comparableUri: string;
    graceAttempted: boolean;
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
  const busyOverlayBySlotRef = useRef<Record<WebViewSlot, BusyOverlayState>>({
    primary: createDefaultBusyOverlayState(),
    secondary: createDefaultBusyOverlayState(),
    tertiary: createDefaultBusyOverlayState(),
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
  const slotLoadCompletedRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const pendingBridgeMessagesBySlotRef = useRef<
    Record<WebViewSlot, PendingBridgeMessagesState>
  >({
    primary: {
      revision: 0,
      messages: [],
    },
    secondary: {
      revision: 0,
      messages: [],
    },
    tertiary: {
      revision: 0,
      messages: [],
    },
  });
  const bridgeBootstrapScriptsBySlotRef = useRef<
    Record<
      WebViewSlot,
      {
        revision: number;
        script: string;
      }
    >
  >({
    primary: {
      revision: -1,
      script: '',
    },
    secondary: {
      revision: -1,
      script: '',
    },
    tertiary: {
      revision: -1,
      script: '',
    },
  });
  const slotPageReadyRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const slotThemeReadyRef = useRef<Record<WebViewSlot, boolean>>({
    primary: false,
    secondary: false,
    tertiary: false,
  });
  const transitionThemeFallbackFrameRef = useRef<Record<WebViewSlot, number>>({
    primary: 0,
    secondary: 0,
    tertiary: 0,
  });
  const androidLoadedTransitionFrameRef = useRef(0);
  const queuedNavigationRequestRef = useRef<QueuedNavigationRequest | null>(null);
  const latestBridgeNavigationIntentRef = useRef<NavigationIntentStamp | null>(
    null,
  );
  const lastPresentedPageKeyRef = useRef<AppPageKey | ''>('');
  const lastVisiblePagePersistedRef = useRef<AppPageKey | ''>('');
  const lastShellBlockingOverlayRef =
    useRef<ShellBlockingOverlayPayload>(null);
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
  const androidStartupReadyReportedRef = useRef(false);

  const ScreenContainer = Platform.OS === 'ios' ? SafeAreaView : View;

  function cancelTransitionThemeFallback(slot: WebViewSlot) {
    const frameId = transitionThemeFallbackFrameRef.current[slot];
    if (frameId) {
      cancelAnimationFrame(frameId);
      transitionThemeFallbackFrameRef.current[slot] = 0;
    }
  }

  function cancelAllTransitionThemeFallbacks() {
    WEBVIEW_SLOTS.forEach(slot => {
      cancelTransitionThemeFallback(slot);
    });
  }

  const clearAndroidLoadedTransitionDelay = useCallback(() => {
    if (androidLoadedTransitionTimerRef.current !== null) {
      clearTimeout(androidLoadedTransitionTimerRef.current);
      androidLoadedTransitionTimerRef.current = null;
    }
    if (androidLoadedTransitionFrameRef.current) {
      cancelAnimationFrame(androidLoadedTransitionFrameRef.current);
      androidLoadedTransitionFrameRef.current = 0;
    }
  }, []);

  const markAndroidStartupReady = useCallback(() => {
    if (Platform.OS !== 'android' || androidStartupReadyReportedRef.current) {
      return;
    }
    androidStartupReadyReportedRef.current = true;
    void nativeBridge?.markStartupReady?.().catch(() => undefined);
  }, []);

  function isCurrentSlotRevision(slot: WebViewSlot, revision: number) {
    return webViewSlotsRef.current[slot].revision === revision;
  }

  function resetSlotRuntimeState(slot: WebViewSlot, revision: number) {
    slotLoadCompletedRef.current[slot] = false;
    pendingBridgeMessagesBySlotRef.current[slot] = {
      revision,
      messages: [],
    };
    slotPageReadyRef.current[slot] = false;
    slotThemeReadyRef.current[slot] = false;
    shellVisibilitySignatureRef.current[slot] = '';
    cancelTransitionThemeFallback(slot);
  }

  function resetSlotVisualReadiness(slot: WebViewSlot, revision: number) {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
    resetSlotRuntimeState(slot, revision);
  }

  function createTransitionToken() {
    transitionTokenRef.current += 1;
    return transitionTokenRef.current;
  }

  function invalidateTransitionToken() {
    transitionTokenRef.current += 1;
    return transitionTokenRef.current;
  }

  function isTransitionTokenCurrent(token: number) {
    return (
      transitionTokenRef.current === token &&
      transitionStateRef.current?.token === token
    );
  }

  function getTransitionThemeReadyFallbackDelayMs(slot: WebViewSlot) {
    const watchdog = transitionWatchdogRef.current;
    if (!watchdog || watchdog.toSlot !== slot) {
      return PAGE_SWITCH_THEME_READY_TIMEOUT_MS;
    }
    const elapsedMs = Math.max(0, Date.now() - watchdog.startedAt);
    const remainingBudgetMs =
      PAGE_SWITCH_LOAD_TIMEOUT_MS -
      elapsedMs -
      PAGE_SWITCH_THEME_READY_WATCHDOG_MARGIN_MS;
    if (!Number.isFinite(remainingBudgetMs)) {
      return PAGE_SWITCH_THEME_READY_TIMEOUT_MS;
    }
    return Math.max(
      0,
      Math.min(PAGE_SWITCH_THEME_READY_TIMEOUT_MS, remainingBudgetMs),
    );
  }

  function scheduleTransitionThemeFallback(slot: WebViewSlot) {
    const pendingTransition = transitionStateRef.current;
    const comparableTargetUri = getComparableUrl(webViewSlotsRef.current[slot].uri);
    if (
      pendingTransition?.status !== 'loading' ||
      pendingTransition.toSlot !== slot ||
      !comparableTargetUri
    ) {
      cancelTransitionThemeFallback(slot);
      return;
    }

    const transitionToken = pendingTransition.token;
    const isCurrentPresentationRequest = () => {
      const currentTransition = transitionStateRef.current;
      return (
        isTransitionTokenCurrent(transitionToken) &&
        currentTransition?.status === 'loading' &&
        currentTransition.toSlot === slot &&
        getComparableUrl(webViewSlotsRef.current[slot].uri) === comparableTargetUri
      );
    };

    cancelTransitionThemeFallback(slot);
    const fallbackDeadlineAt =
      Date.now() + getTransitionThemeReadyFallbackDelayMs(slot);
    const finalizeAfterThemePaint = () => {
      transitionThemeFallbackFrameRef.current[slot] = requestAnimationFrame(() => {
        transitionThemeFallbackFrameRef.current[slot] = 0;
        if (isCurrentPresentationRequest() && slotPageReadyRef.current[slot]) {
          startLoadedTransition(slot);
        }
      });
    };
    const step = () => {
      if (!isCurrentPresentationRequest()) {
        transitionThemeFallbackFrameRef.current[slot] = 0;
        return;
      }
      if (!slotPageReadyRef.current[slot]) {
        transitionThemeFallbackFrameRef.current[slot] = requestAnimationFrame(step);
        return;
      }
      if (slotThemeReadyRef.current[slot]) {
        finalizeAfterThemePaint();
        return;
      }
      if (Date.now() >= fallbackDeadlineAt) {
        transitionThemeFallbackFrameRef.current[slot] = 0;
        startLoadedTransition(slot);
        return;
      }
      transitionThemeFallbackFrameRef.current[slot] = requestAnimationFrame(step);
    };
    transitionThemeFallbackFrameRef.current[slot] = requestAnimationFrame(step);
  }

  function requestTransitionPresentation(slot: WebViewSlot) {
    const pendingTransition = transitionStateRef.current;
    if (
      pendingTransition?.status !== 'loading' ||
      pendingTransition.toSlot !== slot ||
      !slotPageReadyRef.current[slot]
    ) {
      return;
    }
    if (slotThemeReadyRef.current[slot]) {
      if (IS_ANDROID && slotLoadCompletedRef.current[slot]) {
        finalizeTransition(pendingTransition);
        return;
      }
      startLoadedTransition(slot);
      return;
    }
    scheduleTransitionThemeFallback(slot);
  }

  useEffect(() => {
    shellLanguageRef.current = shellLanguage;
  }, [shellLanguage]);

  useEffect(() => {
    console.info(
      '[OrderBootTheme]',
      JSON.stringify({
        stage: 'initial-props',
        ...buildLaunchThemeTracePayload(initialCoreStateRef.current),
      }),
    );
  }, []);

  useEffect(() => {
    const slotState = webViewSlotsRef.current;
    const transition = transitionStateRef.current;
    const interactiveState = WEBVIEW_SLOTS.map(slot => ({
      slot,
      uri: slotState[slot].pageKey,
      interactive: isWebViewLayerInteractive({
        isAndroid: IS_ANDROID,
        slot,
        activeSlot: activeSlotRef.current,
        transitionState: transition
          ? {
              status: transition.status,
              fromSlot: transition.fromSlot,
            }
          : null,
      }),
    }));
    console.info(
      '[OrderShellState]',
      JSON.stringify({
        activeSlot: activeSlotRef.current,
        isPageReady: isPageReadyRef.current,
        transition: transition
          ? {
              fromSlot: transition.fromSlot,
              toSlot: transition.toSlot,
              status: transition.status,
            }
          : null,
        interactiveState,
      }),
    );
  }, [activeSlot, isPageReady, transitionState, webViewSlots]);

  const shellText = useCallback((chinese: string, english: string) => {
    return selectShellText(shellLanguageRef.current, chinese, english);
  }, []);

  const logShellNativeTouch = useCallback(
    (area: string, event: GestureResponderEvent) => {
      const nativeEvent = event.nativeEvent;
      const touches = Array.isArray(nativeEvent.touches)
        ? nativeEvent.touches
        : [];
      const changedTouches = Array.isArray(nativeEvent.changedTouches)
        ? nativeEvent.changedTouches
        : [];
      const primaryTouch = changedTouches[0] || touches[0] || nativeEvent;
      const transition = transitionStateRef.current;
      console.info(
        '[OrderNativeTouch]',
        JSON.stringify({
          area,
          activeSlot: activeSlotRef.current,
          pageKey: webViewSlotsRef.current[activeSlotRef.current].pageKey,
          isPageReady: isPageReadyRef.current,
          transition: transition
            ? {
                fromSlot: transition.fromSlot,
                toSlot: transition.toSlot,
                status: transition.status,
              }
            : null,
          pageX:
            Number.isFinite(primaryTouch?.pageX) && primaryTouch.pageX >= 0
              ? Math.round(primaryTouch.pageX)
              : null,
          pageY:
            Number.isFinite(primaryTouch?.pageY) && primaryTouch.pageY >= 0
              ? Math.round(primaryTouch.pageY)
              : null,
          locationX:
            Number.isFinite(primaryTouch?.locationX) &&
            primaryTouch.locationX >= 0
              ? Math.round(primaryTouch.locationX)
              : null,
          locationY:
            Number.isFinite(primaryTouch?.locationY) &&
            primaryTouch.locationY >= 0
              ? Math.round(primaryTouch.locationY)
              : null,
          touches: touches.length,
          changedTouches: changedTouches.length,
        }),
      );
    },
    [],
  );

  const logEdgeBackSwipeDecision = useCallback(
    (stage: string, gestureState: PanResponderGestureState) => {
      console.info(
        '[OrderEdgeSwipe]',
        JSON.stringify({
          stage,
          activeSlot: activeSlotRef.current,
          pageKey: webViewSlotsRef.current[activeSlotRef.current].pageKey,
          dx: Math.round(gestureState.dx || 0),
          dy: Math.round(gestureState.dy || 0),
          vx: Number.isFinite(gestureState.vx)
            ? Number(gestureState.vx.toFixed(3))
            : null,
          x0: Math.round(gestureState.x0 || 0),
          y0: Math.round(gestureState.y0 || 0),
          excluded: isEdgeBackSwipeStartExcluded(gestureState.x0, gestureState.y0),
        }),
      );
    },
    [],
  );

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
      const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__;
      if (!isDevBuild && !shouldLogPerfMetricToConsole(name, payload)) {
        return;
      }
      console.info('[controler-perf]', serializePerfMetricLog(name, payload));
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
      const nextSignature = JSON.stringify(normalizedThemeState);
      if (nextSignature === lastPersistedLaunchThemeStateSignatureRef.current) {
        return '';
      }
      lastPersistedLaunchThemeStateSignatureRef.current = nextSignature;
      return nativeBridge.setLaunchThemeState(nextSignature);
    },
    [],
  );

  const broadcastThemeStateToLoadedSlots = useCallback(
    (
      themeState: Record<string, unknown> | null,
      options: {
        sourceSlot?: WebViewSlot | null;
        includeSource?: boolean;
      } = {},
    ) => {
      const normalizedThemeState = buildSharedThemeStatePayload(themeState);
      const sourceSlot = options.sourceSlot || null;
      const includeSource = options.includeSource === true;

      WEBVIEW_SLOTS.forEach(targetSlot => {
        if (!includeSource && sourceSlot && targetSlot === sourceSlot) {
          return;
        }
        if (!webViewSlotsRef.current[targetSlot].uri) {
          return;
        }
        postBridgeEventRef.current(targetSlot, 'ui.theme-sync', {
          href: webViewSlotsRef.current[targetSlot].uri,
          ...normalizedThemeState,
        });
      });
    },
    [],
  );

  const refreshShellBootThemeFromNative = useCallback(async () => {
    if (typeof nativeBridge?.getStorageCoreState !== 'function') {
      return null;
    }
    const coreState = parseBridgeJson(await nativeBridge.getStorageCoreState());
    console.info(
      '[OrderBootTheme]',
      JSON.stringify({
        stage: 'native-core-state',
        ...buildLaunchThemeTracePayload(coreState),
      }),
    );
    sharedThemeStateRef.current = buildSharedThemeStatePayload(coreState);
    launchThemeStateRef.current = buildLaunchThemeStatePayload(
      sharedThemeStateRef.current,
    );
    applyShellBootThemeFromCoreState(coreState);
    persistLaunchThemeState(coreState).catch(() => undefined);
    broadcastThemeStateToLoadedSlots(coreState, {
      includeSource: true,
    });
    return coreState;
  }, [
    applyShellBootThemeFromCoreState,
    broadcastThemeStateToLoadedSlots,
    persistLaunchThemeState,
  ]);

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
            console.info(
              '[OrderBootTheme]',
            JSON.stringify({
              stage: 'native-launch-theme',
              ...buildLaunchThemeTracePayload(storedThemeState),
            }),
          );
            sharedThemeStateRef.current =
              buildSharedThemeStatePayload(storedThemeState);
            launchThemeStateRef.current = buildLaunchThemeStatePayload(
              sharedThemeStateRef.current,
            );
            applyShellBootThemeFromCoreState(storedThemeState);
            initialCoreStateRef.current = {
              ...(initialCoreStateRef.current || {}),
              ...sharedThemeStateRef.current,
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

  const resetSlotTransientOverlayState = useCallback(
    (slot: WebViewSlot, reason = 'transient-clear', injectCleanup = true) => {
      modalOpenBySlotRef.current[slot] = false;
      busyLockBySlotRef.current[slot] = false;
      busyOverlayBySlotRef.current[slot] = createDefaultBusyOverlayState();
      shellVisibilitySignatureRef.current[slot] = '';
      if (injectCleanup && webViewSlotsRef.current[slot].uri) {
        getWebViewRef(slot).current?.injectJavaScript(
          CLEAR_TRANSIENT_WEBVIEW_OVERLAYS_SCRIPT,
        );
        logPerfMetric('inject-javascript', {
          slot,
          page: webViewSlotsRef.current[slot].pageKey,
          kind: 'transient-overlay-clear',
          reason,
          sizeBytes: CLEAR_TRANSIENT_WEBVIEW_OVERLAYS_SCRIPT.length,
        });
      }
    },
    [logPerfMetric],
  );

  const requestLoadedWebViewsPersist = useCallback((reason: string) => {
    WEBVIEW_SLOTS.forEach(slot => {
      if (!webViewSlotsRef.current[slot].uri) {
        return;
      }
      const script = `(() => {
        try {
          const storage = window.ControlerStorage;
          if (storage && typeof storage.flushJournal === 'function') {
            void storage.flushJournal({ reason: ${JSON.stringify(reason)} });
          } else {
            if (storage && typeof storage.flush === 'function') {
              void storage.flush();
            }
            if (storage && typeof storage.persistNow === 'function') {
              void storage.persistNow();
            }
          }
        } catch (error) {}
      })(); true;`;
      getWebViewRef(slot).current?.injectJavaScript(script);
    });
  }, []);

  const flushShellStorageBeforeBackground = useCallback(
    async (reason: string) => {
      requestLoadedWebViewsPersist(reason);
      if (typeof nativeBridge?.flushStorageJournal !== 'function') {
        return;
      }
      await Promise.race([
        nativeBridge.flushStorageJournal().catch(() => undefined),
        new Promise(resolve => {
          setTimeout(resolve, APP_BACKGROUND_STORAGE_FLUSH_TIMEOUT_MS);
        }),
      ]);
    },
    [requestLoadedWebViewsPersist],
  );

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
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        const shouldCapture = shouldCaptureEdgeBackSwipe(gestureState);
        if (shouldCapture) {
          logEdgeBackSwipeDecision('move-should-set', gestureState);
        }
        return shouldCapture;
      },
      onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
        const shouldCapture = shouldCaptureEdgeBackSwipe(gestureState);
        if (shouldCapture) {
          logEdgeBackSwipeDecision('move-should-set-capture', gestureState);
        }
        return shouldCapture;
      },
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: (_event, gestureState) => {
        logEdgeBackSwipeDecision('release', gestureState);
        if (shouldFinishEdgeBackSwipe(gestureState)) {
          handleShellBackNavigation(true);
        }
      },
      onPanResponderTerminate: (_event, gestureState) => {
        logEdgeBackSwipeDecision('terminate', gestureState);
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
    resetSlotRuntimeState(slot, webViewSlotsRef.current[slot].revision);
    canGoBackBySlotRef.current[slot] = false;
    resetSlotTransientOverlayState(slot, 'clear-cached-slot', false);
    edgeBackSwipeExclusionBySlotRef.current[slot] =
      createDefaultEdgeBackSwipeExclusionState();
    slotLastUsedAtRef.current[slot] = 0;
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
  }, [resetSlotTransientOverlayState]);

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

  const trimInactiveAndroidSlots = useCallback(
    (reason: string) => {
      if (!IS_ANDROID || transitionStateRef.current) {
        return;
      }
      const trimmedPages = WEBVIEW_SLOTS.map(slot => ({
        slot,
        pageKey: webViewSlotsRef.current[slot].pageKey,
        hasUri: !!webViewSlotsRef.current[slot].uri,
      })).filter(
        item => item.slot !== activeSlotRef.current && item.hasUri,
      );
      if (trimmedPages.length === 0) {
        return;
      }
      clearInactiveCachedSlots();
      logPerfMetric('webview-cache-trimmed', {
        reason,
        activeSlot: activeSlotRef.current,
        activePage: webViewSlotsRef.current[activeSlotRef.current].pageKey,
        trimmedSlots: trimmedPages.map(item => item.slot).join(','),
        trimmedPages: trimmedPages.map(item => item.pageKey).join(','),
      });
    },
    [clearInactiveCachedSlots, logPerfMetric],
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
    const launchContext = launchContextRef.current;
    const hasLandingPrewarmTarget =
      launchContext.active &&
      (!!launchContext.widgetAction ||
        !!launchContext.widgetKind ||
        (launchContext.pageKey && launchContext.pageKey !== activeState.pageKey));
    if (!hasLandingPrewarmTarget) {
      widgetPrewarmPendingRef.current = false;
      return;
    }

    const priorityPages: AppPageKey[] = [];
    const launchPage = launchContext.pageKey;
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

      const nextRevision = webViewSlotsRef.current[targetSlot].revision + 1;
      resetSlotRuntimeState(targetSlot, nextRevision);
      updateWebViewSlotsRef(webViewSlotsRef, targetSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: nextRevision,
      });
      setWebViewSlots(current => ({
        ...current,
        [targetSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: nextRevision,
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
    ): {slot: WebViewSlot; needsLoad: boolean; slotReady: boolean} => {
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
          slotReady: slotPageReadyRef.current[cachedTargetSlot] === true,
        };
      }

      const loadedInactiveSlots = reusableSlots.filter(
        slot => slot !== currentSlot && !!webViewSlotsRef.current[slot].uri,
      );
      if (IS_ANDROID && loadedInactiveSlots.length > 0) {
        let reuseLoadedSlot = loadedInactiveSlots[0];
        let oldestUsedAt = Number.POSITIVE_INFINITY;
        let fallbackPriority = Number.POSITIVE_INFINITY;
        loadedInactiveSlots.forEach(slot => {
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
            reuseLoadedSlot = slot;
          }
        });
        return {
          slot: reuseLoadedSlot,
          needsLoad: true,
          slotReady: false,
        };
      }

      const freeSlot = reusableSlots.find(
        slot => slot !== currentSlot && !webViewSlotsRef.current[slot].uri,
      );
      if (freeSlot) {
        return {
          slot: freeSlot,
          needsLoad: true,
          slotReady: false,
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
        slotReady: false,
      };
    },
    [isPageKeyHidden, settleWidgetLaunchWindowIfExpired],
  );

  const prewarmNavigationPage = useCallback(
    (pageKey: AppPageKey) => {
      if (
        IS_ANDROID ||
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

      const nextRevision = webViewSlotsRef.current[targetSlot].revision + 1;
      resetSlotRuntimeState(targetSlot, nextRevision);
      updateWebViewSlotsRef(webViewSlotsRef, targetSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: nextRevision,
      });
      setWebViewSlots(current => ({
        ...current,
        [targetSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: nextRevision,
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

  const resolveNavigationPrewarmTarget = useCallback(
    (activePageKey: AppPageKey | ''): AppPageKey | '' => {
      if (!activePageKey) {
        return '';
      }
      const recentPageKey = lastPresentedPageKeyRef.current;
      if (recentPageKey && recentPageKey !== activePageKey) {
        return recentPageKey;
      }
      if (IS_ANDROID) {
        switch (activePageKey) {
          case 'index':
            return 'stats';
          case 'stats':
            return 'index';
          case 'plan':
            return 'todo';
          case 'todo':
            return 'plan';
          default:
            return '';
        }
      }
      return activePageKey === 'index' ? '' : 'index';
    },
    [],
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
    const activeSlot = activeSlotRef.current;

    WEBVIEW_SLOTS.forEach(slot => {
      const slotState = webViewSlotsRef.current[slot];
      if (!slotState.uri) {
        shellVisibilitySignatureRef.current[slot] = '';
        return;
      }

      const shellPresentationState = resolveShellSlotPresentationState({
        slot,
        activeSlot,
        transitionState: loadingTransition
          ? {
              status: loadingTransition.status,
              fromSlot: loadingTransition.fromSlot,
              toSlot: loadingTransition.toSlot,
            }
          : null,
      });
      const payload = {
        active: shellPresentationState.active,
        slot,
        reason,
        page: slotState.pageKey,
        href: slotState.uri,
        transitionLoading: shellPresentationState.transitionLoading,
      };
      const signature = JSON.stringify(payload);
      if (shellVisibilitySignatureRef.current[slot] === signature) {
        return;
      }
      if (!payload.active && !payload.transitionLoading) {
        resetSlotTransientOverlayState(slot, `shell-inactive:${reason}`);
      }
      shellVisibilitySignatureRef.current[slot] = signature;
      postBridgeEventRef.current(slot, 'ui.shell-visibility', payload);
    });
  }, [resetSlotTransientOverlayState]);

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
        const pendingDispatch = pendingWidgetLaunchDispatchRef.current;
        if (!pendingDispatch?.launchContext.widgetAction) {
          pendingWidgetLaunchDispatchRef.current = null;
        }
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
      const originPageInstanceId =
        typeof payload?.originPageInstanceId === 'string' &&
        payload.originPageInstanceId.trim()
          ? payload.originPageInstanceId.trim()
          : '';
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
          originPageInstanceId,
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
    markAndroidStartupReady();
  }, [bootCardScale, bootOverlayOpacity, markAndroidStartupReady]);

  const resetWebViewPresentation = useCallback(() => {
    invalidateTransitionToken();
    isPageReadyRef.current = false;
    setIsPageReady(false);
    androidStartupReadyReportedRef.current = false;
    clearTransitionWatchdog();
    clearAndroidLoadedTransitionDelay();
    cancelAllTransitionThemeFallbacks();
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
    busyOverlayBySlotRef.current = {
      primary: createDefaultBusyOverlayState(),
      secondary: createDefaultBusyOverlayState(),
      tertiary: createDefaultBusyOverlayState(),
    };
    queuedNavigationRequestRef.current = null;
    latestBridgeNavigationIntentRef.current = null;
    WEBVIEW_SLOTS.forEach(slot => {
      resetSlotRuntimeState(slot, webViewSlotsRef.current[slot].revision);
    });
    transitionStateRef.current = null;
    setTransitionState(null);
  }, [
    bootCardScale,
    bootOverlayOpacity,
    clearAndroidLoadedTransitionDelay,
    clearTransitionWatchdog,
    transitionProgress,
  ]);

  useEffect(() => {
    if (!bootError) {
      return;
    }
    markAndroidStartupReady();
  }, [bootError, markAndroidStartupReady]);

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

  const clearQueuedNavigationRequest = useCallback(
    (reason = '') => {
      const queuedRequest = queuedNavigationRequestRef.current;
      if (!queuedRequest) {
        return null;
      }
      queuedNavigationRequestRef.current = null;
      logPerfMetric('perf.metric', {
        stage: 'navigation-queue-cleared',
        reason,
        source: queuedRequest.source,
        page:
          typeof queuedRequest.payload.page === 'string'
            ? queuedRequest.payload.page
            : getPageByHref(queuedRequest.payload.href)?.key || '',
        intentId: queuedRequest.intent?.intentId || '',
        queuedForMs: Date.now() - queuedRequest.queuedAt,
      });
      return queuedRequest;
    },
    [logPerfMetric],
  );

  const flushQueuedNavigationRequestIfReady = useCallback(
    (reason = 'queue-flush') => {
      const queuedRequest = queuedNavigationRequestRef.current;
      if (
        !queuedRequest ||
        transitionStateRef.current ||
        busyLockBySlotRef.current[activeSlotRef.current]
      ) {
        return false;
      }

      if (
        queuedRequest.source === 'bridge' &&
        latestBridgeNavigationIntentRef.current &&
        (!queuedRequest.intent ||
          isNavigationIntentStale(
            queuedRequest.intent,
            latestBridgeNavigationIntentRef.current,
          ))
      ) {
        clearQueuedNavigationRequest(`${reason}:stale-intent`);
        return false;
      }

      queuedNavigationRequestRef.current = null;
      const navigationResult = requestPageNavigationRef.current(
        queuedRequest.payload,
        queuedRequest.source,
      );
      logPerfMetric('navigation-replayed', {
        source: queuedRequest.source,
        reason,
        page:
          typeof queuedRequest.payload.page === 'string'
            ? queuedRequest.payload.page
            : getPageByHref(queuedRequest.payload.href)?.key || '',
        queuedForMs: Date.now() - queuedRequest.queuedAt,
        navigationResult,
      });
      return navigationResult !== 'noop';
    },
    [clearQueuedNavigationRequest, logPerfMetric],
  );

  const clearPendingTransition = (slot: WebViewSlot, reason = '') => {
    const currentTransition = transitionStateRef.current;
    if (!currentTransition || currentTransition.toSlot !== slot) {
      return;
    }

    logPerfMetric('perf.metric', {
      stage: 'transition-cleared',
      fromSlot: currentTransition.fromSlot,
      toSlot: currentTransition.toSlot,
      fromPage: webViewSlotsRef.current[currentTransition.fromSlot].pageKey,
      toPage: webViewSlotsRef.current[currentTransition.toSlot].pageKey,
      reason,
    });
    invalidateTransitionToken();
    clearTransitionWatchdog();
    clearAndroidLoadedTransitionDelay();
    cancelTransitionThemeFallback(currentTransition.fromSlot);
    cancelTransitionThemeFallback(currentTransition.toSlot);
    transitionProgress.stopAnimation();
    transitionProgress.setValue(0);
    transitionStateRef.current = null;
    setTransitionState(null);
    canGoBackBySlotRef.current[slot] = false;
    resetSlotTransientOverlayState(slot, `transition-cleared:${reason}`);
    if (!currentTransition.reuseCachedSlot) {
      clearCachedSlot(slot);
    }
    if (queuedNavigationRequestRef.current) {
      requestAnimationFrame(() => {
        flushQueuedNavigationRequestIfReady('transition-cleared');
      });
    }
  };

  const queueNavigationRequest = useCallback(
    (
      payload: Record<string, unknown> = {},
      source: NavigationRequestSource = 'bridge',
    ) => {
      const intent = readNavigationIntentStamp(payload);
      queuedNavigationRequestRef.current = {
        payload: {...payload},
        source,
        queuedAt: Date.now(),
        intent,
      };
      logPerfMetric('navigation-queued', {
        source,
        page:
          typeof payload.page === 'string'
            ? payload.page
            : getPageByHref(payload.href)?.key || '',
        intentId: intent?.intentId || '',
      });
    },
    [logPerfMetric],
  );

  const finalizeTransition = (completedTransition: TransitionState) => {
    const currentTransition = transitionStateRef.current;
    if (
      !currentTransition ||
      currentTransition.token !== completedTransition.token ||
      currentTransition.fromSlot !== completedTransition.fromSlot ||
      currentTransition.toSlot !== completedTransition.toSlot ||
      transitionTokenRef.current !== completedTransition.token
    ) {
      return;
    }

    const nextActiveSlot = completedTransition.toSlot;
    const previousSlot = completedTransition.fromSlot;
    const previousPageKey = webViewSlotsRef.current[previousSlot].pageKey;

    invalidateTransitionToken();
    clearTransitionWatchdog();
    clearAndroidLoadedTransitionDelay();
    cancelTransitionThemeFallback(previousSlot);
    cancelTransitionThemeFallback(nextActiveSlot);
    canGoBackBySlotRef.current[previousSlot] = false;
    resetSlotTransientOverlayState(previousSlot, 'transition-complete');
    markSlotUsed(nextActiveSlot);
    logPerfMetric('transition-complete', {
      fromSlot: previousSlot,
      toSlot: nextActiveSlot,
      page: webViewSlotsRef.current[nextActiveSlot].pageKey,
      reusedCachedSlot: completedTransition.reuseCachedSlot === true,
    });
    lastPresentedPageKeyRef.current = previousPageKey;
    activeSlotRef.current = nextActiveSlot;
    setActiveSlot(nextActiveSlot);
    transitionStateRef.current = null;
    setTransitionState(null);
    transitionProgress.setValue(0);
    clearHiddenCachedSlots();
    trimInactiveAndroidSlots('transition-complete');
    if (queuedNavigationRequestRef.current) {
      requestAnimationFrame(() => {
        flushQueuedNavigationRequestIfReady('transition-complete');
      });
    }
  };

  const fallbackTransitionToDirectNavigation = (
    transition: TransitionState,
    reason = '',
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
      clearPendingTransition(transition.toSlot, reason || 'fallback-missing-target');
      return;
    }

    const fallbackSlot = transition.fromSlot;
    const pendingSlot = transition.toSlot;
    const fallbackRevision = webViewSlotsRef.current[fallbackSlot].revision + 1;
    const pendingRevision = webViewSlotsRef.current[pendingSlot].revision;
    logPerfMetric('perf.metric', {
      stage: 'transition-fallback',
      fromSlot: transition.fromSlot,
      toSlot: transition.toSlot,
      fromPage: webViewSlotsRef.current[transition.fromSlot].pageKey,
      toPage: pendingState.pageKey || targetPageKey,
      activeSlot: activeSlotRef.current,
      reason,
    });
    resetWebViewPresentation();
    resetSlotRuntimeState(fallbackSlot, fallbackRevision);
    resetSlotRuntimeState(pendingSlot, pendingRevision);
    activeSlotRef.current = fallbackSlot;
    setActiveSlot(fallbackSlot);
    webViewSlotsRef.current = {
      ...webViewSlotsRef.current,
      [fallbackSlot]: {
        uri: targetUri,
        pageKey: targetPageKey,
        revision: fallbackRevision,
      },
      [pendingSlot]: {
        uri: null,
        pageKey: '',
        revision: pendingRevision,
      },
    };
    setWebViewSlots(current => ({
      ...current,
      [fallbackSlot]: {
        uri: targetUri,
        pageKey: targetPageKey,
        revision: fallbackRevision,
      },
      [pendingSlot]: {
        uri: null,
        pageKey: '',
        revision: pendingRevision,
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
      token: transition.token,
      startedAt: Date.now(),
      fromSlot: transition.fromSlot,
      toSlot: transition.toSlot,
      targetUri,
      comparableUri: comparableTargetUri,
      graceAttempted: false,
    };
    transitionWatchdogTimerRef.current = setTimeout(() => {
      transitionWatchdogTimerRef.current = null;
      const watchdog = transitionWatchdogRef.current;
      const currentTransition = transitionStateRef.current;
      const pendingState = webViewSlotsRef.current[transition.toSlot];
      if (
        !isTransitionTokenCurrent(transition.token) ||
        !watchdog ||
        !currentTransition ||
        watchdog.token !== transition.token ||
        watchdog.fromSlot !== transition.fromSlot ||
        watchdog.toSlot !== transition.toSlot ||
        watchdog.comparableUri !== comparableTargetUri ||
        currentTransition.token !== transition.token ||
        currentTransition.toSlot !== transition.toSlot ||
        getComparableUrl(pendingState.uri) !== comparableTargetUri
      ) {
        return;
      }
      if (currentTransition.status === 'animating') {
        finalizeTransition(currentTransition);
        return;
      }
      if (slotPageReadyRef.current[transition.toSlot]) {
        startLoadedTransition(transition.toSlot);
        return;
      }
      if (!watchdog.graceAttempted) {
        transitionWatchdogRef.current = {
          ...watchdog,
          graceAttempted: true,
        };
        logPerfMetric('transition-load-grace', {
          fromSlot: transition.fromSlot,
          toSlot: transition.toSlot,
          page: pendingState.pageKey,
          waitedMs: Date.now() - watchdog.startedAt,
        });
        transitionWatchdogTimerRef.current = setTimeout(() => {
          transitionWatchdogTimerRef.current = null;
          const graceWatchdog = transitionWatchdogRef.current;
          const graceTransition = transitionStateRef.current;
          const gracePendingState = webViewSlotsRef.current[transition.toSlot];
          if (
            !isTransitionTokenCurrent(transition.token) ||
            !graceWatchdog ||
            !graceTransition ||
            graceWatchdog.token !== transition.token ||
            graceWatchdog.fromSlot !== transition.fromSlot ||
            graceWatchdog.toSlot !== transition.toSlot ||
            graceWatchdog.comparableUri !== comparableTargetUri ||
            graceTransition.token !== transition.token ||
            graceTransition.toSlot !== transition.toSlot ||
            getComparableUrl(gracePendingState.uri) !== comparableTargetUri
          ) {
            return;
          }
          if (graceTransition.status === 'animating') {
            finalizeTransition(graceTransition);
            return;
          }
          if (slotPageReadyRef.current[transition.toSlot]) {
            startLoadedTransition(transition.toSlot);
            return;
          }
          finalizeTransition(graceTransition);
        }, PAGE_SWITCH_LOAD_TIMEOUT_GRACE_MS);
        return;
      }
      finalizeTransition(currentTransition);
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
    const transitionToken = currentTransition.token;
    if (IS_ANDROID) {
      clearAndroidLoadedTransitionDelay();
      const settleTransition = () => {
        androidLoadedTransitionFrameRef.current = 0;
        if (!isTransitionTokenCurrent(transitionToken)) {
          return;
        }
        androidLoadedTransitionTimerRef.current = setTimeout(() => {
          androidLoadedTransitionTimerRef.current = null;
          const pendingTransition = transitionStateRef.current;
          if (
            !isTransitionTokenCurrent(transitionToken) ||
            !pendingTransition ||
            pendingTransition.token !== transitionToken ||
            pendingTransition.toSlot !== slot ||
            pendingTransition.status === 'animating' ||
            !slotPageReadyRef.current[slot]
          ) {
            return;
          }
          finalizeTransition(pendingTransition);
        }, ANDROID_READY_TO_PRESENT_SETTLE_MS);
      };
      androidLoadedTransitionFrameRef.current = requestAnimationFrame(() => {
        if (!isTransitionTokenCurrent(transitionToken)) {
          androidLoadedTransitionFrameRef.current = 0;
          return;
        }
        androidLoadedTransitionFrameRef.current = requestAnimationFrame(() => {
          if (!isTransitionTokenCurrent(transitionToken)) {
            androidLoadedTransitionFrameRef.current = 0;
            return;
          }
          settleTransition();
        });
      });
      return;
    }
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
          return 'intercept';
        }
        if (!isTransitionWatchdogExpired()) {
          return 'intercept';
        }
      } else {
        clearPendingTransition(
          currentTransition.toSlot,
          `superseded-navigation:${source}:${target.pageKey}`,
        );
      }

      if (transitionStateRef.current) {
        clearPendingTransition(
          currentTransition.toSlot,
          `repeat-clear:${source}:${target.pageKey}`,
        );
      }
    }

    const nextSlotState = findReusableSlot(currentSlot, target.uri);
    const nextSlot = nextSlotState.slot;
    const direction =
      normalizeNavigationDirection(payload.direction) ||
      getNavigationDirection(currentState.pageKey, target.pageKey);
    const shouldAwaitFreshReadySignal =
      IS_ANDROID && !nextSlotState.needsLoad && nextSlotState.slotReady;

    canGoBackBySlotRef.current[nextSlot] = false;
    resetSlotTransientOverlayState(nextSlot, 'prepare-transition-target', false);
    edgeBackSwipeExclusionBySlotRef.current[nextSlot] =
      createDefaultEdgeBackSwipeExclusionState();
    if (shouldAwaitFreshReadySignal) {
      slotPageReadyRef.current[nextSlot] = false;
    }
    transitionProgress.stopAnimation();
    transitionProgress.setValue(0);
    const nextTransitionToken = createTransitionToken();
    const nextTransition: TransitionState = {
      fromSlot: currentSlot,
      toSlot: nextSlot,
      direction,
      status: 'loading',
      token: nextTransitionToken,
      reuseCachedSlot: !nextSlotState.needsLoad && nextSlotState.slotReady,
    };
    logPerfMetric('transition-start', {
      fromSlot: currentSlot,
      toSlot: nextSlot,
      fromPage: currentState.pageKey,
      toPage: target.pageKey,
      targetUri: target.uri,
      source,
      reusedCachedSlot: !nextSlotState.needsLoad && nextSlotState.slotReady,
    });
    transitionStateRef.current = nextTransition;
    setTransitionState(nextTransition);
    if (nextSlotState.needsLoad) {
      const nextRevision = webViewSlotsRef.current[nextSlot].revision + 1;
      resetSlotRuntimeState(nextSlot, nextRevision);
      armTransitionWatchdog(
        nextTransition,
        target.uri,
        PAGE_SWITCH_LOAD_TIMEOUT_MS,
      );
      updateWebViewSlotsRef(webViewSlotsRef, nextSlot, {
        uri: target.uri,
        pageKey: target.pageKey,
        revision: nextRevision,
      });
      setWebViewSlots(current => ({
        ...current,
        [nextSlot]: {
          uri: target.uri,
          pageKey: target.pageKey,
          revision: nextRevision,
        },
      }));
    } else if (nextSlotState.slotReady) {
      if (shouldAwaitFreshReadySignal) {
        armTransitionWatchdog(
          nextTransition,
          target.uri,
          PAGE_SWITCH_LOAD_TIMEOUT_MS,
        );
      } else {
        startLoadedTransition(nextSlot);
      }
    } else {
      armTransitionWatchdog(
        nextTransition,
        target.uri,
        PAGE_SWITCH_LOAD_TIMEOUT_MS,
      );
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
      } else if (
        !pendingWidgetLaunchDispatchRef.current?.launchContext.widgetAction
      ) {
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
          const primaryRevision = webViewSlotsRef.current.primary.revision + 1;
          resetSlotRuntimeState('primary', primaryRevision);
          resetSlotRuntimeState(
            'secondary',
            webViewSlotsRef.current.secondary.revision,
          );
          resetSlotRuntimeState(
            'tertiary',
            webViewSlotsRef.current.tertiary.revision,
          );
          webViewSlotsRef.current = {
            primary: {
              uri: url,
              pageKey: initialPage.key,
              revision: primaryRevision,
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
              revision: primaryRevision,
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

    const dispatchResumeToVisibleSlot = () => {
      const visibleSlot =
        transitionStateRef.current?.status === 'loading'
          ? transitionStateRef.current.fromSlot
          : activeSlotRef.current;
      if (!webViewSlotsRef.current[visibleSlot].uri) {
        return;
      }
      getWebViewRef(visibleSlot).current?.injectJavaScript(
        dispatchNativeResumeScript,
      );
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

    const handleAppInactive = () => {
      if (launchRetryTimer !== null) {
        clearTimeout(launchRetryTimer);
        launchRetryTimer = null;
      }
      clearQueuedNavigationRequest('app-state-background');
      persistLastVisiblePage(
        webViewSlotsRef.current[activeSlotRef.current].pageKey,
      );
      void flushShellStorageBeforeBackground('app-state-background');
    };

    const handleAppActive = () => {
      dispatchResumeToVisibleSlot();
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
        handleAppInactive();
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
    clearQueuedNavigationRequest,
    flushShellStorageBeforeBackground,
    handleWidgetLaunchContext,
    logPerfMetric,
    persistLastVisiblePage,
  ]);

  useEffect(() => {
    return () => {
      invalidateTransitionToken();
      clearAndroidLoadedTransitionDelay();
      clearPendingWidgetLaunchAck();
      clearNavigationPrewarmTimer();
      clearTransitionWatchdog();
      cancelAllTransitionThemeFallbacks();
      clearWidgetPrewarmTimer();
      transitionProgress.stopAnimation();
    };
  }, [
    clearAndroidLoadedTransitionDelay,
    clearPendingWidgetLaunchAck,
    clearNavigationPrewarmTimer,
    clearTransitionWatchdog,
    clearWidgetPrewarmTimer,
    transitionProgress,
  ]);

  useEffect(() => {
    bootPulse.stopAnimation();
    bootPulse.setValue(0);
    const animation = Animated.loop(
      Animated.timing(bootPulse, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
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
    if (!launchContextRef.current.active) {
      widgetPrewarmPendingRef.current = false;
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
    const prewarmTarget = resolveNavigationPrewarmTarget(activePageKey);
    if (
      !activePageKey ||
      !prewarmTarget ||
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
      prewarmNavigationPage(prewarmTarget);
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
    resolveNavigationPrewarmTarget,
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
    if (!IS_ANDROID || bootError || !isPageReady || transitionState) {
      return;
    }
    const timer = setTimeout(() => {
      if (transitionStateRef.current || !isPageReadyRef.current) {
        return;
      }
      trimInactiveAndroidSlots('page-idle');
    }, ANDROID_IDLE_CACHE_TRIM_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [
    activeSlot,
    bootError,
    isPageReady,
    transitionState,
    trimInactiveAndroidSlots,
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
      memoryWarningSubscription.remove();
    };
  }, [
    clearInactiveCachedSlots,
    logPerfMetric,
  ]);

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
      case 'storage.pickDiaryImages':
        if (typeof nativeBridge.pickDiaryImages !== 'function') {
          throw createUnsupportedBridgeError(
            '选择日记图片',
            'picking diary images',
          );
        }
        return parseBridgeJson(
          await nativeBridge.pickDiaryImages(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.saveDiaryImageAsset':
        if (typeof nativeBridge.saveDiaryImageAsset !== 'function') {
          throw createUnsupportedBridgeError(
            '保存日记图片',
            'saving a diary image asset',
          );
        }
        return parseBridgeJson(
          await nativeBridge.saveDiaryImageAsset(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.resolveDiaryImageUri':
        if (typeof nativeBridge.resolveDiaryImageUri !== 'function') {
          throw createUnsupportedBridgeError(
            '解析日记图片',
            'resolving a diary image uri',
          );
        }
        return parseBridgeJson(
          await nativeBridge.resolveDiaryImageUri(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
          ),
        );
      case 'storage.deleteDiaryImageAssets':
        if (typeof nativeBridge.deleteDiaryImageAssets !== 'function') {
          throw createUnsupportedBridgeError(
            '删除日记图片',
            'deleting diary image assets',
          );
        }
        return parseBridgeJson(
          await nativeBridge.deleteDiaryImageAssets(
            JSON.stringify(
              payload.options && typeof payload.options === 'object'
                ? payload.options
                : {},
            ),
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
      case 'ui.setLaunchThemeState':
        if (typeof nativeBridge.setLaunchThemeState !== 'function') {
          throw createUnsupportedBridgeError(
            '同步启动主题',
            'persisting the launch theme state',
          );
        }
        return parseBridgeJson(
          await nativeBridge.setLaunchThemeState(
            JSON.stringify(
              payload.themeState && typeof payload.themeState === 'object'
                ? payload.themeState
                : {},
            ),
          ),
        );
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
      case 'ui.showSoftInput':
        if (typeof nativeBridge.showSoftInput !== 'function') {
          throw createUnsupportedBridgeError(
            '调起输入法',
            'showing the soft keyboard',
          );
        }
        return parseBridgeJson(await nativeBridge.showSoftInput());
      case 'ui.restartSoftInput':
        if (typeof nativeBridge.restartSoftInput !== 'function') {
          throw createUnsupportedBridgeError(
            '重置输入法连接',
            'restarting the soft keyboard input connection',
          );
        }
        return parseBridgeJson(await nativeBridge.restartSoftInput());
      case 'ui.getSoftInputState':
        if (typeof nativeBridge.getSoftInputState !== 'function') {
          throw createUnsupportedBridgeError(
            '读取输入法状态',
            'reading the soft keyboard state',
          );
        }
        return parseBridgeJson(await nativeBridge.getSoftInputState());
      default:
        throw new Error(`Unsupported native bridge method: ${method}`);
    }
  }

  const injectBridgeMessage = useCallback(
    (
      slot: WebViewSlot,
      message: Record<string, unknown>,
      meta: {
        kind: 'bridge-response' | 'bridge-event';
        eventName?: string;
      },
    ) => {
      const script = buildInjectionScript(message);
      logPerfMetric('inject-javascript', {
        slot,
        page: getPageKeyForSlot(slot),
        kind: meta.kind,
        eventName: meta.eventName,
        sizeBytes: script.length,
      });
      getWebViewRef(slot).current?.injectJavaScript(script);
    },
    [logPerfMetric],
  );

  const flushPendingBridgeMessagesForSlot = useCallback(
    (slot: WebViewSlot, revision: number) => {
      if (!isCurrentSlotRevision(slot, revision)) {
        return;
      }
      if (!slotLoadCompletedRef.current[slot]) {
        return;
      }
      const pendingState = pendingBridgeMessagesBySlotRef.current[slot];
      if (
        !pendingState ||
        pendingState.revision !== revision ||
        !Array.isArray(pendingState.messages) ||
        pendingState.messages.length === 0
      ) {
        return;
      }
      const pendingMessages = pendingState.messages.slice();
      pendingBridgeMessagesBySlotRef.current[slot] = {
        revision,
        messages: [],
      };
      pendingMessages.forEach(message => {
        const type =
          typeof message?.type === 'string' ? String(message.type) : '';
        const payload =
          message?.payload && typeof message.payload === 'object'
            ? (message.payload as Record<string, unknown>)
            : {};
        injectBridgeMessage(slot, message, {
          kind: type === 'bridge-event' ? 'bridge-event' : 'bridge-response',
          eventName:
            type === 'bridge-event' && typeof payload.name === 'string'
              ? payload.name
              : undefined,
        });
      });
    },
    [injectBridgeMessage],
  );

  const dispatchBridgeMessageToSlot = useCallback(
    (
      slot: WebViewSlot,
      revision: number,
      message: Record<string, unknown>,
      meta: {
        kind: 'bridge-response' | 'bridge-event';
        eventName?: string;
      },
    ) => {
      if (!isCurrentSlotRevision(slot, revision)) {
        return;
      }
      if (!slotLoadCompletedRef.current[slot] && meta.kind !== 'bridge-response') {
        const pendingState = pendingBridgeMessagesBySlotRef.current[slot];
        if (pendingState.revision !== revision) {
          pendingBridgeMessagesBySlotRef.current[slot] = {
            revision,
            messages: [message],
          };
        } else {
          pendingState.messages.push(message);
        }
        return;
      }
      injectBridgeMessage(slot, message, meta);
    },
    [injectBridgeMessage],
  );

  function postBridgeResponse(
    slot: WebViewSlot,
    revision: number,
    id: string,
    result: Record<string, unknown> | null,
    error?: string,
  ) {
    dispatchBridgeMessageToSlot(
      slot,
      revision,
      {
        type: 'bridge-response',
        payload: {
          id,
          result,
          error: error || null,
        },
      },
      {
        kind: 'bridge-response',
      },
    );
  }

  function postBridgeEvent(
    slot: WebViewSlot,
    name: string,
    payload: Record<string, unknown> = {},
  ) {
    dispatchBridgeMessageToSlot(
      slot,
      webViewSlotsRef.current[slot].revision,
      {
        type: 'bridge-event',
        payload: {
          name,
          ...payload,
        },
      },
      {
        kind: 'bridge-event',
        eventName: name,
      },
    );
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
    revision: number,
    event: WebViewMessageEvent,
  ) {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
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
        const nextBusyOverlayState = normalizeBusyOverlayState(message.payload);
        if (
          nextBusyOverlayState.active &&
          !isPayloadForCurrentSlot(slot, message.payload)
        ) {
          return;
        }
        const nextBusy = nextBusyOverlayState.lockNavigation === true;
        const normalizedBusyOverlayState = nextBusyOverlayState.active
          ? nextBusyOverlayState
          : createDefaultBusyOverlayState();
        const lockChanged = busyLockBySlotRef.current[slot] !== nextBusy;
        const busyOverlayChanged = !areBusyOverlayStatesEqual(
          busyOverlayBySlotRef.current[slot],
          normalizedBusyOverlayState,
        );
        busyLockBySlotRef.current[slot] = nextBusy;
        busyOverlayBySlotRef.current[slot] = normalizedBusyOverlayState;
        if (lockChanged || busyOverlayChanged) {
          setBusyStateVersion(version => version + 1);
          if (
            !nextBusy &&
            slot === activeSlotRef.current &&
            !transitionStateRef.current
          ) {
            requestAnimationFrame(() => {
              flushQueuedNavigationRequestIfReady('busy-lock-cleared');
            });
          }
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
        if (isPayloadForCurrentSlot(slot, message.payload)) {
          slotThemeReadyRef.current[slot] = true;
          requestTransitionPresentation(slot);
        }
        const nextThemeState =
          message.payload && typeof message.payload === 'object'
            ? message.payload
            : {};
        const normalizedThemeState = buildSharedThemeStatePayload(nextThemeState);
        console.info(
          '[OrderBootTheme]',
          JSON.stringify({
            stage: 'webview-theme-applied',
            slot,
            ...buildLaunchThemeTracePayload(normalizedThemeState),
          }),
        );
        sharedThemeStateRef.current = normalizedThemeState;
        launchThemeStateRef.current = buildLaunchThemeStatePayload(
          normalizedThemeState,
        );
        initialCoreStateRef.current = {
          ...(initialCoreStateRef.current || {}),
          ...normalizedThemeState,
        };
        applyShellBootThemeFromCoreState(normalizedThemeState);
        persistLaunchThemeState(normalizedThemeState).catch(() => undefined);
        broadcastThemeStateToLoadedSlots(normalizedThemeState, {
          sourceSlot: slot,
        });
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
        slotPageReadyRef.current[slot] = true;
        dispatchQueuedWidgetLaunchIfReady(slot, 'page-ready');
        if (transitionStateRef.current?.toSlot === slot) {
          requestTransitionPresentation(slot);
          return;
        }
        if (slot === activeSlotRef.current) {
          revealWebView();
          requestAnimationFrame(() => {
            flushQueuedNavigationRequestIfReady('page-ready');
          });
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
        const incomingIntent = readNavigationIntentStamp(message.payload || {});
        const targetPage =
          typeof message.payload?.page === 'string'
            ? message.payload.page
            : getPageByHref(message.payload?.href)?.key || '';
        const dispatchPolicy = resolveBridgeNavigationDispatchPolicy({
          isAndroid: IS_ANDROID,
          sourceSlot: slot,
          activeSlot,
          transitionBusy,
        });
        let navigationResult: NavigationRequestResult = 'noop';
        let accepted = false;
        let queued = false;
        let ackState = 'rejected';
        let ackReason = 'unresolved-target';
        if (dispatchPolicy.ignore) {
          ackState = 'rejected';
          ackReason = 'inactive-slot';
        } else if (
          incomingIntent &&
          compareNavigationIntentPriority(
            latestBridgeNavigationIntentRef.current,
            incomingIntent,
          ) < 0
        ) {
          ackState = 'dropped-stale';
          ackReason = 'stale-intent';
        } else if (incomingIntent) {
          latestBridgeNavigationIntentRef.current = incomingIntent;
        }

        const currentTransition = transitionStateRef.current;
        const currentComparableUrl = getComparableUrl(
          webViewSlotsRef.current[activeSlot].uri,
        );
        const requestedTarget = resolvePageTarget(
          webViewSlotsRef.current[activeSlot].uri,
          message.payload || {},
        );
        const requestedComparableUrl = getComparableUrl(
          requestedTarget?.uri || '',
        );
        const pendingComparableUrl = currentTransition
          ? getComparableUrl(webViewSlotsRef.current[currentTransition.toSlot].uri)
          : '';
        const currentQueuedRequest = queuedNavigationRequestRef.current;
        const queuedComparableUrl = currentQueuedRequest
          ? getComparableUrl(
              resolvePageTarget(
                webViewSlotsRef.current[activeSlot].uri,
                currentQueuedRequest.payload,
              )?.uri || '',
            )
          : '';
        const redundantQueuedTarget =
          !!requestedComparableUrl &&
          (requestedComparableUrl === pendingComparableUrl ||
            requestedComparableUrl === queuedComparableUrl ||
            (navigationLocked && requestedComparableUrl === currentComparableUrl));
        const shouldDropDuringTransition =
          dispatchPolicy.drop && !navigationLocked;
        if (
          ackState !== 'dropped-stale' &&
          shouldDropDuringTransition &&
          !!requestedComparableUrl &&
          requestedComparableUrl === pendingComparableUrl
        ) {
          accepted = true;
          ackState = 'accepted-now';
          ackReason = 'duplicate-target-loading';
        } else if (
          ackState !== 'dropped-stale' &&
          shouldDropDuringTransition
        ) {
          ackState = 'dropped-stale';
          ackReason = 'transition-busy';
        }
        const shouldQueue = dispatchPolicy.queue || navigationLocked;
        if (ackState !== 'dropped-stale' && shouldQueue) {
          accepted = true;
          if (redundantQueuedTarget) {
            ackState = 'accepted-now';
            ackReason = transitionBusy
              ? 'duplicate-target-loading'
              : navigationLocked
                ? 'duplicate-target-locked'
                : 'duplicate-target';
          } else {
            queueNavigationRequest(message.payload || {}, 'bridge');
            queued = true;
            ackState = 'queued';
            ackReason = transitionBusy
              ? 'transition-busy'
              : navigationLocked
                ? 'navigation-locked'
                : slot !== activeSlot
                  ? 'inactive-slot'
                  : 'queued';
            requestAnimationFrame(() => {
              flushQueuedNavigationRequestIfReady('bridge-event-queued');
            });
          }
        } else if (ackState !== 'dropped-stale') {
          const staleQueuedRequest =
            currentQueuedRequest &&
            currentQueuedRequest.source === 'bridge' &&
            (requestedComparableUrl !== queuedComparableUrl ||
              (!!incomingIntent &&
                (!currentQueuedRequest.intent ||
                  isNavigationIntentStale(
                    currentQueuedRequest.intent,
                    incomingIntent,
                  ))));
          if (staleQueuedRequest) {
            clearQueuedNavigationRequest(
              `bridge-direct-superseded:${targetPage || requestedComparableUrl || 'unknown'}`,
            );
          }
          navigationResult = requestPageNavigation(message.payload || {}, 'bridge');
          accepted = navigationResult === 'intercept';
          if (
            accepted &&
            currentQueuedRequest &&
            currentQueuedRequest.source === 'bridge' &&
            requestedComparableUrl &&
            requestedComparableUrl === queuedComparableUrl
          ) {
            clearQueuedNavigationRequest(
              `bridge-direct-duplicate:${targetPage || requestedComparableUrl}`,
            );
          }
          ackState = accepted ? 'accepted-now' : 'rejected';
          ackReason = accepted ? 'dispatched' : 'navigation-noop';
        }
        const requestId =
          typeof message.payload?.requestId === 'string'
            ? message.payload.requestId
            : '';
        if (requestId) {
          const busy =
            ackState === 'queued' ||
            transitionBusy ||
            navigationLocked ||
            (dispatchPolicy.queue && slot !== activeSlot);
          const retryAfterMs = ackState === 'queued' ? 0 : 0;
          postBridgeEvent(slot, 'ui.navigate-ack', {
            requestId,
            accepted,
            busy,
            queued,
            state: ackState,
            reason: ackReason,
            targetPage,
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
    const requestPage = getPageKeyForSlot(slot);

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
        page: requestPage,
        method,
        durationMs: Date.now() - startedAt,
        requestSizeBytes: estimatePayloadSize(requestPayload),
        resultSizeBytes: estimatePayloadSize(result),
        section:
          typeof requestPayload.section === 'string'
            ? requestPayload.section
            : undefined,
      });
      if (!isCurrentSlotRevision(slot, revision)) {
        return;
      }
      postBridgeResponse(slot, revision, requestId, result);
    } catch (error) {
      logPerfMetric('native-bridge-call', {
        slot,
        page: requestPage,
        method,
        durationMs: Date.now() - startedAt,
        requestSizeBytes: estimatePayloadSize(requestPayload),
        section:
          typeof requestPayload.section === 'string'
            ? requestPayload.section
            : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!isCurrentSlotRevision(slot, revision)) {
        return;
      }
      postBridgeResponse(
        slot,
        revision,
        requestId,
        null,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const recoverWebView = (slot: WebViewSlot, revision: number) => {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
    const currentTransition = transitionStateRef.current;
    if (
      currentTransition &&
      (currentTransition.toSlot === slot || currentTransition.fromSlot === slot)
    ) {
      clearInactiveCachedSlots([
        currentTransition.fromSlot,
        currentTransition.toSlot,
      ]);
      fallbackTransitionToDirectNavigation(
        currentTransition,
        `render-process-gone:${slot}`,
      );
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
    const activeRevision = webViewSlotsRef.current[currentActiveSlot].revision + 1;
    resetSlotRuntimeState(currentActiveSlot, activeRevision);
    WEBVIEW_SLOTS.forEach(slot => {
      if (slot === currentActiveSlot) {
        return;
      }
      resetSlotRuntimeState(slot, webViewSlotsRef.current[slot].revision);
    });
    const nextSlots = WEBVIEW_SLOTS.reduce<Record<WebViewSlot, WebViewSlotState>>(
      (acc, currentSlot) => {
        acc[currentSlot] =
          currentSlot === currentActiveSlot
            ? {
                ...webViewSlotsRef.current[currentSlot],
                revision: activeRevision,
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
                revision: activeRevision,
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

  const handleSlotLoadEnd = (slot: WebViewSlot, revision: number) => {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
    slotLoadCompletedRef.current[slot] = true;
    flushPendingBridgeMessagesForSlot(slot, revision);
    if (
      slot === activeSlotRef.current &&
      !transitionStateRef.current &&
      isPageReadyRef.current
    ) {
      revealWebView();
    }
  };

  const handleSlotLoadProgress = (
    slot: WebViewSlot,
    revision: number,
    progress: number,
  ) => {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
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
    revision: number,
    loading: boolean,
    canGoBack: boolean,
  ) => {
    if (!isCurrentSlotRevision(slot, revision)) {
      return;
    }
    canGoBackBySlotRef.current[slot] = canGoBack;
    if (!loading) {
      slotLoadCompletedRef.current[slot] = true;
      flushPendingBridgeMessagesForSlot(slot, revision);
    }
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
    revision: number,
    requestUrl: string,
  ) => {
    if (!isCurrentSlotRevision(slot, revision)) {
      return false;
    }
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
    const dispatchPolicy = resolveWebViewNavigationDispatchPolicy({
      isAndroid: IS_ANDROID,
      sourceSlot: slot,
      activeSlot: activeSlotRef.current,
      transitionState: currentTransition
        ? {
            toSlot: currentTransition.toSlot,
          }
        : null,
    });
    if (dispatchPolicy.ignore) {
      return false;
    }
    if (
      currentTransition &&
      slot !== currentTransition.toSlot &&
      getComparableUrl(requestUrl) ===
        getComparableUrl(webViewSlotsRef.current[currentTransition.toSlot].uri)
    ) {
      return false;
    }
    if (
      currentTransition?.toSlot === slot &&
      getComparableUrl(requestUrl) ===
        getComparableUrl(webViewSlotsRef.current[currentTransition.toSlot].uri)
    ) {
      return true;
    }
    if (dispatchPolicy.allowOnlyExpectedLoad) {
      return false;
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

  const bootSpinnerRotate = bootPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderLoadingCard = (
    title: string,
    message: string,
    animationStyle?: object | null,
  ) => (
    <Animated.View
      style={[
        styles.bootCard,
        {
          backgroundColor: shellBootTheme.cardBg,
          borderColor: shellBootTheme.cardBorder,
        },
        animationStyle || null,
      ]}>
      <Animated.View
        style={[
          styles.bootIndicator,
          {
            borderColor: `${shellBootTheme.accent}38`,
            borderTopColor: shellBootTheme.accent,
            borderRightColor: `${shellBootTheme.accent}88`,
          },
          {
            transform: [{rotate: bootSpinnerRotate}],
          },
        ]}
      />
      <Text
        style={[
          styles.loadingText,
          {
            color: shellBootTheme.text,
          },
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.loadingSubText,
          {
            color: shellBootTheme.mutedText,
          },
        ]}>
        {message}
      </Text>
    </Animated.View>
  );
  const bootCard = renderLoadingCard(
    selectShellText(shellLanguage, '正在加载数据中', 'Loading your data'),
    selectShellText(
      shellLanguage,
      '页面资源与本地数据正在就绪',
      'Preparing page assets and local data',
    ),
    {
      transform: [{scale: bootCardScale}],
    },
  );
  const statusBarStyle = isLightBootTheme(shellBootTheme)
    ? 'dark-content'
    : 'light-content';

  const renderWebView = (slot: WebViewSlot) => {
    const slotState = webViewSlots[slot];
    if (!slotState.uri) {
      return null;
    }

    const currentTransition = transitionState;
    const transitionLoadingSlot =
      currentTransition?.status === 'loading' ? currentTransition.toSlot : null;
    const shellPresentationState = resolveShellSlotPresentationState({
      slot,
      activeSlot,
      transitionState: currentTransition
        ? {
            status: currentTransition.status,
            fromSlot: currentTransition.fromSlot,
            toSlot: currentTransition.toSlot,
          }
        : null,
    });
    const shellSlotActive = shellPresentationState.active;
    const panelWidth = Math.max(webViewHostWidth, 1);
    const androidHiddenOffset = Math.max(Math.round(panelWidth * 1.35), 96);
    const enterDistance =
      currentTransition && IS_ANDROID
        ? Math.max(Math.round(panelWidth * 0.12), 24)
        : panelWidth;
    const leaveDistance =
      currentTransition && IS_ANDROID
        ? Math.max(Math.round(panelWidth * 0.08), 18)
        : panelWidth;
    const enteringOffset =
      currentTransition?.direction === 'forward' ? enterDistance : -enterDistance;
    const leavingOffset =
      currentTransition?.direction === 'forward' ? -leaveDistance : leaveDistance;
    const leavingOpacityEnd = IS_ANDROID ? 0.96 : 0.92;
    const leavingScaleEnd = IS_ANDROID ? 0.998 : 0.992;
    const enteringOpacityRange = IS_ANDROID ? [0.88, 0.95, 1] : [0.78, 0.92, 1];
    const enteringScaleStart = IS_ANDROID ? 0.998 : 0.992;
    let wrapperStyle: Array<object> = [
      styles.webviewLayer,
      {backgroundColor: shellBootTheme.screenBg},
    ];
    let androidWebViewSurfaceStyle: object | null = null;
    const interactiveLayer = isWebViewLayerInteractive({
      isAndroid: IS_ANDROID,
      slot,
      activeSlot,
      transitionState: currentTransition
        ? {
            status: currentTransition.status,
            fromSlot: currentTransition.fromSlot,
          }
        : null,
    });
    const androidHiddenLayerStyle = IS_ANDROID
      ? {
          zIndex: 0,
          elevation: 0,
          opacity: 0,
          // Android WebView surfaces can keep intercepting touches while fully
          // transparent. Move inactive layers off-screen so only the presented
          // layer remains touchable.
          transform: [{translateX: androidHiddenOffset}],
        }
      : styles.webviewLayerHidden;
    const androidPreparedLoadingLayerStyle =
      currentTransition?.status === 'loading' &&
      IS_ANDROID &&
      slotPageReadyRef.current[slot]
        ? {
            zIndex: 0,
            elevation: 0,
            // Keep the incoming WebView fully outside the hit-test region while
            // it is pre-rendering in the background. Android can still composite
            // the first frame off-screen, but background slots must never be able
            // to receive touches or emit navigation from under the active page.
            opacity: 1,
            transform: [
              {
                translateX: enteringOffset >= 0
                  ? androidHiddenOffset
                  : -androidHiddenOffset,
              },
              {scale: enteringScaleStart},
            ],
          }
        : null;
    const androidHiddenSurfaceStyle = IS_ANDROID
      ? {
          opacity: 0.01,
          transform: [{translateX: androidHiddenOffset}],
        }
      : null;
    const androidPreparedLoadingSurfaceStyle =
      currentTransition?.status === 'loading' &&
      IS_ANDROID &&
      slot === transitionLoadingSlot &&
      slotPageReadyRef.current[slot]
        ? {
            opacity: 1,
            transform: [
              {
                translateX: enteringOffset >= 0
                  ? androidHiddenOffset
                  : -androidHiddenOffset,
              },
              {scale: enteringScaleStart},
            ],
          }
        : null;

    if (!currentTransition) {
      wrapperStyle = [
        styles.webviewLayer,
        {backgroundColor: shellBootTheme.screenBg},
        slot === activeSlot
          ? styles.webviewLayerVisible
          : androidHiddenLayerStyle,
      ];
      if (slot !== activeSlot) {
        androidWebViewSurfaceStyle = androidHiddenSurfaceStyle;
      }
    } else if (currentTransition.status === 'loading') {
      if (slot === currentTransition.fromSlot) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          styles.webviewLayerVisible,
        ];
      } else if (
        slot === currentTransition.toSlot &&
        androidPreparedLoadingLayerStyle
      ) {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          androidPreparedLoadingLayerStyle,
        ];
        androidWebViewSurfaceStyle = androidPreparedLoadingSurfaceStyle;
      } else {
        wrapperStyle = [
          styles.webviewLayer,
          {backgroundColor: shellBootTheme.screenBg},
          androidHiddenLayerStyle,
        ];
        androidWebViewSurfaceStyle = androidHiddenSurfaceStyle;
      }
    } else {
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
          androidHiddenLayerStyle,
        ];
        androidWebViewSurfaceStyle = androidHiddenSurfaceStyle;
      }
    }

    return (
      <Animated.View
        key={`${slot}-${slotState.revision}`}
        pointerEvents={interactiveLayer ? 'box-none' : 'none'}
        style={wrapperStyle}>
        <WebView
          ref={getWebViewRef(slot)}
          pointerEvents={interactiveLayer ? 'auto' : 'none'}
          source={{uri: slotState.uri}}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled={!IS_ANDROID}
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
          injectedJavaScriptBeforeContentLoaded={(() => {
            const cachedBootstrapScript =
              bridgeBootstrapScriptsBySlotRef.current[slot];
            if (cachedBootstrapScript.revision === slotState.revision) {
              return cachedBootstrapScript.script;
            }
            const nextBootstrapScript = buildBridgeBootstrapScript(
              {
                active: shellSlotActive,
                slot,
                reason: 'bootstrap',
                page: slotState.pageKey,
                href: slotState.uri,
                transitionLoading: shellPresentationState.transitionLoading,
              },
              sharedThemeStateRef.current,
              runtimeSessionIdRef.current,
            );
            bridgeBootstrapScriptsBySlotRef.current[slot] = {
              revision: slotState.revision,
              script: nextBootstrapScript,
            };
            return nextBootstrapScript;
          })()}
          onMessage={event => {
            handleWebViewMessage(slot, slotState.revision, event).catch(
              () => undefined,
            );
          }}
          onLoadStart={() => {
            resetSlotVisualReadiness(slot, slotState.revision);
          }}
          onLoadEnd={() => {
            handleSlotLoadEnd(slot, slotState.revision);
            syncShellVisibility('load-end');
          }}
          onLoadProgress={event => {
            handleSlotLoadProgress(slot, slotState.revision, event.nativeEvent.progress);
          }}
          onError={event => {
            if (!isCurrentSlotRevision(slot, slotState.revision)) {
              return;
            }
            const pendingTransition = transitionStateRef.current;
            if (pendingTransition?.toSlot === slot) {
              fallbackTransitionToDirectNavigation(
                pendingTransition,
                `webview-error:${slot}:${event.nativeEvent.description || ''}`,
              );
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
            Platform.OS === 'android'
              ? () => recoverWebView(slot, slotState.revision)
              : undefined
          }
          onContentProcessDidTerminate={
            Platform.OS === 'ios'
              ? () => recoverWebView(slot, slotState.revision)
              : undefined
          }
          onNavigationStateChange={navigationState => {
            handleSlotNavigationStateChange(
              slot,
              slotState.revision,
              !!navigationState.loading,
              !!navigationState.canGoBack,
            );
          }}
          onShouldStartLoadWithRequest={request =>
            handleSlotShouldStartLoad(slot, slotState.revision, request.url || '')
          }
          style={[
            styles.webview,
            {backgroundColor: shellBootTheme.screenBg},
            androidWebViewSurfaceStyle,
          ]}
        />
      </Animated.View>
    );
  };

  if (bootError) {
    return (
      <ScreenContainer
        style={[styles.screen, {backgroundColor: shellBootTheme.screenBg}]}>
        <StatusBar
          barStyle={statusBarStyle}
          backgroundColor="transparent"
          translucent={Platform.OS === 'android'}
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
  const activeBusyOverlay = busyOverlayBySlotRef.current[activeSlot];
  const liveShellBlockingOverlay = resolveShellBlockingOverlayPayload({
    transitionState,
    activeBusyOverlay,
    busyOverlayStates: busyOverlayBySlotRef.current,
    shellLanguage,
  });
  if (liveShellBlockingOverlay) {
    lastShellBlockingOverlayRef.current = liveShellBlockingOverlay;
  } else if (transitionState?.status !== 'loading') {
    lastShellBlockingOverlayRef.current = null;
  }
  const shellBlockingOverlay =
    liveShellBlockingOverlay ||
    (transitionState?.status === 'loading'
      ? lastShellBlockingOverlayRef.current
      : null);
  const shellOverlayViewState = resolveShellOverlayViewState({
    isPageReady,
    shellBlockingOverlay,
    shellLanguage,
  });
  const shouldRenderAndroidBootOverlayCard =
    !(Platform.OS === 'android' && shellOverlayViewState.source === 'boot');
  const shouldBlockTouchesDuringTransition =
    transitionState?.status === 'loading';
  const shellBlockingOverlayView = shellOverlayViewState.visible ? (
    <Animated.View
      accessible={false}
      pointerEvents="box-none"
      renderToHardwareTextureAndroid={Platform.OS === 'android'}
      style={[
        styles.shellBlockingOverlayHost,
        shellOverlayViewState.source === 'boot'
          ? {
              opacity: bootOverlayOpacity,
            }
          : null,
      ]}>
      <View
        pointerEvents="none"
        style={[
          styles.shellBlockingOverlayVisual,
          {
            backgroundColor: shellBootTheme.screenBg,
          },
        ]}
      />
      {shouldRenderAndroidBootOverlayCard ? (
        <View pointerEvents="none" style={styles.shellBlockingOverlayCardHost}>
          <View style={styles.center}>
            {renderLoadingCard(
              shellOverlayViewState.title,
              shellOverlayViewState.message,
              shellOverlayViewState.source === 'boot'
                ? {
                    transform: [{scale: bootCardScale}],
                  }
                : null,
            )}
          </View>
        </View>
      ) : null}
      <View
        accessible={false}
        pointerEvents="auto"
        style={styles.shellBlockingOverlayTouchBlocker}
      />
    </Animated.View>
  ) : null;
  return (
    <ScreenContainer
      style={[styles.screen, {backgroundColor: shellBootTheme.screenBg}]}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
      />
      <View
        pointerEvents="box-none"
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
        {shouldBlockTouchesDuringTransition ? (
          <View
            accessible={false}
            pointerEvents="auto"
            style={styles.transitionTouchBlocker}
          />
        ) : null}
      </View>
      {shellBlockingOverlayView}
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
  transitionTouchBlocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
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
  shellBlockingOverlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    elevation: 6,
  },
  shellBlockingOverlayVisual: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SCREEN_BG,
  },
  shellBlockingOverlayCardHost: {
    ...StyleSheet.absoluteFillObject,
  },
  shellBlockingOverlayTouchBlocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  bootCard: {
    width: '100%',
    maxWidth: 388,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(241, 244, 250, 0.18)',
    backgroundColor: 'rgba(20, 23, 28, 0.88)',
  },
  bootIndicator: {
    width: 54,
    height: 54,
    marginBottom: 14,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: 'rgba(241, 244, 250, 0.22)',
    borderTopColor: ACCENT_COLOR,
    borderRightColor: '#f1f4fa88',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
  },
  loadingText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#f4f6fb',
    textAlign: 'center',
  },
  loadingSubText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 21,
    color: 'rgba(244, 246, 251, 0.68)',
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
