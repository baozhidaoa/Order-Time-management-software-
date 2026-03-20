import {
  canAcquireModalSubmissionLock,
  getWidgetLaunchRejectToast,
  resolveMirrorBootstrapStrategy,
  resolveWidgetLaunchPolicy,
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
