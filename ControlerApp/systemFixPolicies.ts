export type WidgetPolicyPageKey =
  | 'index'
  | 'stats'
  | 'plan'
  | 'todo'
  | 'diary'
  | 'settings';

type LaunchPolicyContext = {
  pageKey: WidgetPolicyPageKey | '';
  widgetAction: string;
  widgetSource: string;
};

type WidgetLaunchPolicyInput = {
  isAndroid: boolean;
  activePageKey: WidgetPolicyPageKey | '';
  fallbackPageKey?: WidgetPolicyPageKey;
  launchContext: LaunchPolicyContext;
};

type WidgetLaunchPolicyResult = {
  targetPageKey: WidgetPolicyPageKey;
  samePageOnlyWidgetAction: boolean;
  allowLaunch: boolean;
  rejectToast: string;
};

type MirrorBootstrapStrategyInput = {
  hasPendingMirrorWrite: boolean;
  hasNativeCoreSnapshot: boolean;
  hasNativeSnapshot: boolean;
};

export type MirrorBootstrapStrategy =
  | 'flush-mirror-first'
  | 'hydrate-core'
  | 'hydrate-snapshot'
  | 'preserve-mirror';

type ModalSubmissionAttempt = {
  modalPresent: boolean;
  isSubmitting: boolean;
};

type AndroidKeyboardViewportStateInput = {
  viewportHeight: number;
  baselineHeight: number;
  lastViewportHeight: number;
  keyboardOpen: boolean;
};

export type AndroidKeyboardViewportState = {
  viewportHeight: number;
  baselineHeight: number;
  lastViewportHeight: number;
  keyboardOpen: boolean;
  keyboardDelta: number;
  ignoredAsJitter: boolean;
};

type AndroidRecordResizeRefreshGuardInput = {
  isAndroidMobileRuntime: boolean;
  hasOpenTimerModal: boolean;
  hasFocusedModalTextEntry: boolean;
  keyboardOpen: boolean;
  isInlineRecordEditActive: boolean;
  isRecordNameInputFocused: boolean;
};

type AndroidNavigationInteractionGuardInput = {
  isAndroidReactNativeNavigationRuntime: boolean;
  hasVisibleBlockingOverlay: boolean;
};

const ANDROID_KEYBOARD_OPEN_THRESHOLD_PX = 140;
const ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX = 64;
const ANDROID_KEYBOARD_BASELINE_RESET_TOLERANCE_PX = 48;
const ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX = 12;

export function isAndroidWidgetActionLaunch(
  context: Pick<LaunchPolicyContext, 'widgetAction' | 'widgetSource'>,
  isAndroid: boolean,
): boolean {
  return (
    isAndroid &&
    context.widgetSource === 'android-widget' &&
    !!String(context.widgetAction || '').trim()
  );
}

export function getWidgetLaunchRejectToast(
  targetPageKey: WidgetPolicyPageKey,
  action: string,
): string {
  switch (action) {
    case 'start-timer':
      return '请先回到记录页后再使用开始计时小组件';
    case 'new-diary':
      return '请先回到日记页后再使用写日记小组件';
    case 'show-week-grid':
      return '请先回到统计页后再使用周表小组件';
    case 'show-day-line':
    case 'show-day-pie':
    case 'show-heatmap':
    case 'show-record-list':
      return '请先回到统计页后再使用饼图小组件';
    case 'show-week-view':
      return '请先回到计划页后再使用周视图小组件';
    case 'show-year-view':
      return '请先回到计划页后再使用年视图小组件';
    case 'show-todos':
      return '请先回到待办页后再使用待办小组件';
    case 'show-checkins':
      return '请先回到待办页后再使用打卡小组件';
    default:
      return targetPageKey === 'todo'
        ? '请先回到待办页后再使用该小组件'
        : targetPageKey === 'plan'
          ? '请先回到计划页后再使用该小组件'
        : targetPageKey === 'stats'
          ? '请先回到统计页后再使用该小组件'
          : targetPageKey === 'diary'
            ? '请先回到日记页后再使用该小组件'
            : '请先回到目标页面后再使用该小组件';
  }
}

function inferTargetPageFromWidgetAction(action: string): WidgetPolicyPageKey | '' {
  switch (action) {
    case 'start-timer':
      return 'index';
    case 'new-diary':
      return 'diary';
    case 'show-week-grid':
    case 'show-day-pie':
    case 'show-day-line':
    case 'show-heatmap':
    case 'show-record-list':
      return 'stats';
    case 'show-week-view':
    case 'show-year-view':
      return 'plan';
    case 'show-todos':
    case 'show-checkins':
      return 'todo';
    case 'open-import-wizard':
      return 'settings';
    default:
      return '';
  }
}

export function resolveWidgetLaunchPolicy(
  input: WidgetLaunchPolicyInput,
): WidgetLaunchPolicyResult {
  const targetPageKey =
    input.launchContext.pageKey ||
    inferTargetPageFromWidgetAction(input.launchContext.widgetAction) ||
    input.activePageKey ||
    input.fallbackPageKey ||
    'index';
  const samePageOnlyWidgetAction = false;
  const allowLaunch = true;

  return {
    targetPageKey,
    samePageOnlyWidgetAction,
    allowLaunch,
    rejectToast: allowLaunch
      ? ''
      : getWidgetLaunchRejectToast(
          targetPageKey,
          input.launchContext.widgetAction,
        ),
  };
}

export function resolveMirrorBootstrapStrategy(
  input: MirrorBootstrapStrategyInput,
): MirrorBootstrapStrategy {
  if (input.hasPendingMirrorWrite) {
    return 'flush-mirror-first';
  }
  if (input.hasNativeCoreSnapshot) {
    return 'hydrate-core';
  }
  if (input.hasNativeSnapshot) {
    return 'hydrate-snapshot';
  }
  return 'preserve-mirror';
}

export function canAcquireModalSubmissionLock(
  input: ModalSubmissionAttempt,
): boolean {
  return input.modalPresent && !input.isSubmitting;
}

export function updateAndroidKeyboardViewportState(
  input: AndroidKeyboardViewportStateInput,
): AndroidKeyboardViewportState {
  const viewportHeight = Math.max(
    0,
    Math.round(Number(input.viewportHeight) || 0),
  );
  const baselineHeight = Math.max(
    0,
    Math.round(Number(input.baselineHeight) || 0),
  );
  const lastViewportHeight = Math.max(
    0,
    Math.round(Number(input.lastViewportHeight) || 0),
  );

  if (!viewportHeight) {
    return {
      viewportHeight,
      baselineHeight,
      lastViewportHeight,
      keyboardOpen: input.keyboardOpen === true,
      keyboardDelta: Math.max(baselineHeight - viewportHeight, 0),
      ignoredAsJitter: false,
    };
  }

  if (
    baselineHeight > 0 &&
    Math.abs(viewportHeight - lastViewportHeight) <
      ANDROID_KEYBOARD_VIEWPORT_JITTER_TOLERANCE_PX
  ) {
    return {
      viewportHeight: lastViewportHeight,
      baselineHeight,
      lastViewportHeight,
      keyboardOpen: input.keyboardOpen === true,
      keyboardDelta: Math.max(baselineHeight - lastViewportHeight, 0),
      ignoredAsJitter: true,
    };
  }

  let nextBaselineHeight = baselineHeight;
  if (!nextBaselineHeight || viewportHeight > nextBaselineHeight) {
    nextBaselineHeight = viewportHeight;
  }

  const keyboardDelta = Math.max(nextBaselineHeight - viewportHeight, 0);
  const nextKeyboardOpen =
    input.keyboardOpen === true
      ? keyboardDelta > ANDROID_KEYBOARD_CLOSE_THRESHOLD_PX
      : keyboardDelta > ANDROID_KEYBOARD_OPEN_THRESHOLD_PX;

  if (
    !nextKeyboardOpen &&
    viewportHeight >=
      nextBaselineHeight - ANDROID_KEYBOARD_BASELINE_RESET_TOLERANCE_PX
  ) {
    nextBaselineHeight = Math.max(nextBaselineHeight, viewportHeight);
  }

  return {
    viewportHeight,
    baselineHeight: nextBaselineHeight,
    lastViewportHeight: viewportHeight,
    keyboardOpen: nextKeyboardOpen,
    keyboardDelta,
    ignoredAsJitter: false,
  };
}

export function shouldSkipAndroidRecordResizeRefresh(
  input: AndroidRecordResizeRefreshGuardInput,
): boolean {
  return (
    input.isAndroidMobileRuntime &&
    (input.hasOpenTimerModal ||
      input.hasFocusedModalTextEntry ||
      input.keyboardOpen ||
      (input.isInlineRecordEditActive && input.isRecordNameInputFocused))
  );
}

export function shouldConsumeAndroidNavigationRequest(
  input: AndroidNavigationInteractionGuardInput,
): boolean {
  return (
    input.isAndroidReactNativeNavigationRuntime &&
    input.hasVisibleBlockingOverlay
  );
}
