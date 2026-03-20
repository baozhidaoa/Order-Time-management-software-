export type WidgetPolicyPageKey =
  | 'index'
  | 'stats'
  | 'plan'
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
    case 'show-day-pie':
      return '请先回到统计页后再使用饼图小组件';
    case 'show-week-view':
      return '请先回到计划页后再使用周视图小组件';
    case 'show-year-view':
      return '请先回到计划页后再使用年视图小组件';
    case 'show-todos':
      return '请先回到计划页后再使用待办小组件';
    case 'show-checkins':
      return '请先回到计划页后再使用打卡小组件';
    default:
      return targetPageKey === 'plan'
        ? '请先回到计划页后再使用该小组件'
        : targetPageKey === 'stats'
          ? '请先回到统计页后再使用该小组件'
          : targetPageKey === 'diary'
            ? '请先回到日记页后再使用该小组件'
            : '请先回到目标页面后再使用该小组件';
  }
}

export function resolveWidgetLaunchPolicy(
  input: WidgetLaunchPolicyInput,
): WidgetLaunchPolicyResult {
  const targetPageKey =
    input.launchContext.pageKey ||
    input.activePageKey ||
    input.fallbackPageKey ||
    'index';
  const samePageOnlyWidgetAction = isAndroidWidgetActionLaunch(
    input.launchContext,
    input.isAndroid,
  );
  const allowLaunch =
    !samePageOnlyWidgetAction || input.activePageKey === targetPageKey;

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
