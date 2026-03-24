import {
  canAcquireModalSubmissionLock,
  getWidgetLaunchRejectToast,
  shouldConsumeAndroidNavigationRequest,
  shouldSkipAndroidRecordResizeRefresh,
  resolveMirrorBootstrapStrategy,
  resolveWidgetLaunchPolicy,
  updateAndroidKeyboardViewportState,
} from '../systemFixPolicies';
import {describe, expect, it} from '@jest/globals';

describe('resolveWidgetLaunchPolicy', () => {
  it('allows android widget actions to open todo across pages', () => {
    const result = resolveWidgetLaunchPolicy({
      isAndroid: true,
      activePageKey: 'index',
      fallbackPageKey: 'index',
      launchContext: {
        pageKey: 'todo',
        widgetAction: 'show-checkins',
        widgetSource: 'android-widget',
      },
    });

    expect(result.allowLaunch).toBe(true);
    expect(result.samePageOnlyWidgetAction).toBe(false);
    expect(result.targetPageKey).toBe('todo');
    expect(result.rejectToast).toBe('');
  });

  it('does not apply same-page-only policy to non-android widget launches', () => {
    const result = resolveWidgetLaunchPolicy({
      isAndroid: false,
      activePageKey: 'index',
      fallbackPageKey: 'index',
      launchContext: {
        pageKey: 'todo',
        widgetAction: 'show-checkins',
        widgetSource: 'android-widget',
      },
    });

    expect(result.allowLaunch).toBe(true);
    expect(result.samePageOnlyWidgetAction).toBe(false);
  });
});

describe('resolveMirrorBootstrapStrategy', () => {
  it('flushes the mirror first when there is a pending write', () => {
    expect(
      resolveMirrorBootstrapStrategy({
        hasPendingMirrorWrite: true,
        hasNativeCoreSnapshot: true,
        hasNativeSnapshot: true,
      }),
    ).toBe('flush-mirror-first');
  });

  it('hydrates from core when mirror is clean and a core snapshot exists', () => {
    expect(
      resolveMirrorBootstrapStrategy({
        hasPendingMirrorWrite: false,
        hasNativeCoreSnapshot: true,
        hasNativeSnapshot: true,
      }),
    ).toBe('hydrate-core');
  });

  it('preserves the mirror when no native snapshot is available', () => {
    expect(
      resolveMirrorBootstrapStrategy({
        hasPendingMirrorWrite: false,
        hasNativeCoreSnapshot: false,
        hasNativeSnapshot: false,
      }),
    ).toBe('preserve-mirror');
  });
});

describe('canAcquireModalSubmissionLock', () => {
  it('allows the first submission attempt for a mounted modal', () => {
    expect(
      canAcquireModalSubmissionLock({
        modalPresent: true,
        isSubmitting: false,
      }),
    ).toBe(true);
  });

  it('rejects re-entrant submission attempts', () => {
    expect(
      canAcquireModalSubmissionLock({
        modalPresent: true,
        isSubmitting: true,
      }),
    ).toBe(false);
  });

  it('rejects attempts when the modal is already gone', () => {
    expect(
      canAcquireModalSubmissionLock({
        modalPresent: false,
        isSubmitting: false,
      }),
    ).toBe(false);
  });
});

describe('getWidgetLaunchRejectToast', () => {
  it('maps fallback copy by target page', () => {
    expect(getWidgetLaunchRejectToast('stats', 'unknown-action')).toBe(
      '请先回到统计页后再使用该小组件',
    );
  });

  it('maps todo fallback copy by target page', () => {
    expect(getWidgetLaunchRejectToast('todo', 'unknown-action')).toBe(
      '请先回到待办页后再使用该小组件',
    );
  });
});

describe('updateAndroidKeyboardViewportState', () => {
  it('opens and closes the keyboard state with hysteresis', () => {
    const baselineState = updateAndroidKeyboardViewportState({
      viewportHeight: 900,
      baselineHeight: 0,
      lastViewportHeight: 0,
      keyboardOpen: false,
    });
    const openedState = updateAndroidKeyboardViewportState({
      viewportHeight: 740,
      baselineHeight: baselineState.baselineHeight,
      lastViewportHeight: baselineState.lastViewportHeight,
      keyboardOpen: baselineState.keyboardOpen,
    });
    const stillOpenState = updateAndroidKeyboardViewportState({
      viewportHeight: 820,
      baselineHeight: openedState.baselineHeight,
      lastViewportHeight: openedState.lastViewportHeight,
      keyboardOpen: openedState.keyboardOpen,
    });
    const closedState = updateAndroidKeyboardViewportState({
      viewportHeight: 848,
      baselineHeight: stillOpenState.baselineHeight,
      lastViewportHeight: stillOpenState.lastViewportHeight,
      keyboardOpen: stillOpenState.keyboardOpen,
    });

    expect(baselineState.keyboardOpen).toBe(false);
    expect(baselineState.baselineHeight).toBe(900);
    expect(openedState.keyboardOpen).toBe(true);
    expect(openedState.keyboardDelta).toBe(160);
    expect(stillOpenState.keyboardOpen).toBe(true);
    expect(stillOpenState.keyboardDelta).toBe(80);
    expect(closedState.keyboardOpen).toBe(false);
    expect(closedState.keyboardDelta).toBe(52);
  });

  it('ignores small viewport jitter once a stable baseline exists', () => {
    const stableState = updateAndroidKeyboardViewportState({
      viewportHeight: 740,
      baselineHeight: 900,
      lastViewportHeight: 740,
      keyboardOpen: true,
    });
    const jitterState = updateAndroidKeyboardViewportState({
      viewportHeight: 746,
      baselineHeight: stableState.baselineHeight,
      lastViewportHeight: stableState.lastViewportHeight,
      keyboardOpen: stableState.keyboardOpen,
    });

    expect(jitterState.ignoredAsJitter).toBe(true);
    expect(jitterState.keyboardOpen).toBe(true);
    expect(jitterState.lastViewportHeight).toBe(740);
    expect(jitterState.keyboardDelta).toBe(160);
  });
});

describe('shouldSkipAndroidRecordResizeRefresh', () => {
  it('skips refresh when the Android timer modal is open', () => {
    expect(
      shouldSkipAndroidRecordResizeRefresh({
        isAndroidMobileRuntime: true,
        hasOpenTimerModal: true,
        hasFocusedModalTextEntry: false,
        keyboardOpen: false,
        isInlineRecordEditActive: false,
        isRecordNameInputFocused: false,
      }),
    ).toBe(true);
  });

  it('skips refresh when the Android keyboard is still open for text entry', () => {
    expect(
      shouldSkipAndroidRecordResizeRefresh({
        isAndroidMobileRuntime: true,
        hasOpenTimerModal: false,
        hasFocusedModalTextEntry: true,
        keyboardOpen: true,
        isInlineRecordEditActive: false,
        isRecordNameInputFocused: false,
      }),
    ).toBe(true);
  });

  it('allows refresh outside the guarded Android modal flow', () => {
    expect(
      shouldSkipAndroidRecordResizeRefresh({
        isAndroidMobileRuntime: false,
        hasOpenTimerModal: true,
        hasFocusedModalTextEntry: true,
        keyboardOpen: true,
        isInlineRecordEditActive: true,
        isRecordNameInputFocused: true,
      }),
    ).toBe(false);
  });
});

describe('shouldConsumeAndroidNavigationRequest', () => {
  it('consumes Android navigation taps while a blocking overlay is visible', () => {
    expect(
      shouldConsumeAndroidNavigationRequest({
        isAndroidReactNativeNavigationRuntime: true,
        hasVisibleBlockingOverlay: true,
      }),
    ).toBe(true);
  });

  it('does not consume navigation when the modal shield is gone', () => {
    expect(
      shouldConsumeAndroidNavigationRequest({
        isAndroidReactNativeNavigationRuntime: true,
        hasVisibleBlockingOverlay: false,
      }),
    ).toBe(false);
  });
});
