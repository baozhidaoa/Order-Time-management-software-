/**
 * @format
 */

import 'react-native';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => (
      <View ref={ref} {...props}>
        {props.children}
      </View>
    )),
  };
});

import App, {
  buildWidgetLaunchHref,
  compareNavigationIntentPriority,
  getComparableUrl,
  isWebViewLayerInteractive,
  resolveShellBlockingOverlayPayload,
  resolveShellOverlayViewState,
  resolveBridgeNavigationDispatchPolicy,
  resolveWebViewNavigationDispatchPolicy,
  resolveAppPageUri,
} from '../App';

// Note: import explicitly to use the types shiped with jest.
import {describe, expect, it, jest} from '@jest/globals';

it('exports the app component', () => {
  expect(typeof App).toBe('function');
});

describe('buildWidgetLaunchHref', () => {
  it('preserves widget launch query params for cross-page navigation', () => {
    expect(
      buildWidgetLaunchHref('todo', {
        widgetAction: 'show-checkins',
        widgetKind: 'checkins',
        widgetSource: 'android-widget',
        widgetLaunchId: 'launch-123',
      }),
    ).toBe(
      'todo.html?widgetAction=show-checkins&widgetSource=android-widget&widgetKind=checkins&widgetLaunchId=launch-123',
    );
  });

  it('does not emit widget-only params when there is no widget action', () => {
    expect(
      buildWidgetLaunchHref('stats', {
        widgetAction: '',
        widgetKind: 'day-pie',
        widgetSource: 'android-widget',
        widgetLaunchId: 'launch-456',
      }),
    ).toBe('stats.html?widgetKind=day-pie&widgetLaunchId=launch-456');
  });

  it('does not depend on URL base parsing for android asset hrefs', () => {
    const globalWithUrl = global as typeof globalThis & {URL: typeof URL};
    const NativeURL = globalWithUrl.URL;
    globalWithUrl.URL = class extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        if (typeof base !== 'undefined') {
          throw new TypeError('Invalid base URL');
        }
        super(typeof input === 'string' ? input : input.toString());
      }
    } as typeof URL;

    try {
      expect(
        buildWidgetLaunchHref('todo', {
          widgetAction: 'show-todos',
          widgetKind: 'todos',
          widgetSource: 'android-widget',
          widgetLaunchId: 'launch-hermes',
        }),
      ).toBe(
        'todo.html?widgetAction=show-todos&widgetSource=android-widget&widgetKind=todos&widgetLaunchId=launch-hermes',
      );
    } finally {
      globalWithUrl.URL = NativeURL;
    }
  });
});

describe('getComparableUrl', () => {
  it('normalizes widget launch urls by dropping widget-only params and hash', () => {
    expect(
      getComparableUrl(
        'file:///android_asset/controler-web/stats.html?widgetAction=open-day&widgetSource=android-widget&widgetKind=day-pie&widgetLaunchId=launch-789&widgetAnchorDate=2026-03-20#details',
      ),
    ).toBe('file:///android_asset/controler-web/stats.html');
  });
});

describe('resolveAppPageUri', () => {
  it('keeps the current iOS bundle asset root when switching pages', () => {
    expect(
      resolveAppPageUri(
        'file:///var/containers/Bundle/Application/Order.app/controler-web/stats.html',
        'index.html',
      ),
    ).toBe(
      'file:///var/containers/Bundle/Application/Order.app/controler-web/index.html',
    );
  });

  it('falls back to the android asset root when there is no current page url', () => {
    expect(resolveAppPageUri(null, 'index.html')).toBe(
      'file:///android_asset/controler-web/index.html',
    );
  });
});

describe('resolveBridgeNavigationDispatchPolicy', () => {
  it('ignores android bridge navigation from inactive slots', () => {
    expect(
      resolveBridgeNavigationDispatchPolicy({
        isAndroid: true,
        sourceSlot: 'secondary',
        activeSlot: 'primary',
        transitionBusy: false,
      }),
    ).toEqual({
      ignore: true,
      queue: false,
      drop: false,
    });
  });

  it('drops android bridge navigation while a transition is busy', () => {
    expect(
      resolveBridgeNavigationDispatchPolicy({
        isAndroid: true,
        sourceSlot: 'primary',
        activeSlot: 'primary',
        transitionBusy: true,
      }),
    ).toEqual({
      ignore: false,
      queue: false,
      drop: true,
    });
  });

  it('keeps non-android transition queueing behavior', () => {
    expect(
      resolveBridgeNavigationDispatchPolicy({
        isAndroid: false,
        sourceSlot: 'primary',
        activeSlot: 'primary',
        transitionBusy: true,
      }),
    ).toEqual({
      ignore: false,
      queue: true,
      drop: false,
    });
  });
});

describe('resolveWebViewNavigationDispatchPolicy', () => {
  it('ignores android webview navigations from inactive cached slots', () => {
    expect(
      resolveWebViewNavigationDispatchPolicy({
        isAndroid: true,
        sourceSlot: 'secondary',
        activeSlot: 'primary',
        transitionState: null,
      }),
    ).toEqual({
      ignore: true,
      allowOnlyExpectedLoad: false,
    });
  });

  it('allows android webview navigations from the active slot', () => {
    expect(
      resolveWebViewNavigationDispatchPolicy({
        isAndroid: true,
        sourceSlot: 'primary',
        activeSlot: 'primary',
        transitionState: null,
      }),
    ).toEqual({
      ignore: false,
      allowOnlyExpectedLoad: false,
    });
  });

  it('allows the incoming transition slot to finish its expected load on android', () => {
    expect(
      resolveWebViewNavigationDispatchPolicy({
        isAndroid: true,
        sourceSlot: 'secondary',
        activeSlot: 'primary',
        transitionState: {
          toSlot: 'secondary',
        },
      }),
    ).toEqual({
      ignore: false,
      allowOnlyExpectedLoad: true,
    });
  });

  it('keeps non-android slots allowed so desktop parity is unchanged', () => {
    expect(
      resolveWebViewNavigationDispatchPolicy({
        isAndroid: false,
        sourceSlot: 'secondary',
        activeSlot: 'primary',
        transitionState: null,
      }),
    ).toEqual({
      ignore: false,
      allowOnlyExpectedLoad: false,
    });
  });
});

describe('compareNavigationIntentPriority', () => {
  it('treats a newer requestedAt as higher priority', () => {
    expect(
      compareNavigationIntentPriority(
        {
          intentId: 'intent-old',
          requestedAt: 100,
        },
        {
          intentId: 'intent-new',
          requestedAt: 200,
        },
      ),
    ).toBe(1);
  });

  it('treats an older requestedAt as stale', () => {
    expect(
      compareNavigationIntentPriority(
        {
          intentId: 'intent-new',
          requestedAt: 200,
        },
        {
          intentId: 'intent-old',
          requestedAt: 100,
        },
      ),
    ).toBe(-1);
  });

  it('treats identical requestedAt values as the same priority', () => {
    expect(
      compareNavigationIntentPriority(
        {
          intentId: 'intent-a',
          requestedAt: 200,
        },
        {
          intentId: 'intent-b',
          requestedAt: 200,
        },
      ),
    ).toBe(0);
  });

  it('breaks requestedAt ties with the monotonic intent sequence', () => {
    expect(
      compareNavigationIntentPriority(
        {
          intentId: 'intent-a',
          requestedAt: 200,
          sequence: 1,
        },
        {
          intentId: 'intent-b',
          requestedAt: 200,
          sequence: 2,
        },
      ),
    ).toBe(1);
  });
});

describe('isWebViewLayerInteractive', () => {
  it('keeps only the active slot interactive when there is no transition', () => {
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'primary',
        activeSlot: 'primary',
        transitionState: null,
      }),
    ).toBe(true);
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'secondary',
        activeSlot: 'primary',
        transitionState: null,
      }),
    ).toBe(false);
  });

  it('keeps the source android webview interactive while a new page is loading', () => {
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'primary',
        activeSlot: 'primary',
        transitionState: {
          status: 'loading',
          fromSlot: 'primary',
        },
      }),
    ).toBe(true);
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'secondary',
        activeSlot: 'primary',
        transitionState: {
          status: 'loading',
          fromSlot: 'primary',
        },
      }),
    ).toBe(false);
  });

  it('preserves non-android loading interactivity on the source slot', () => {
    expect(
      isWebViewLayerInteractive({
        isAndroid: false,
        slot: 'primary',
        activeSlot: 'primary',
        transitionState: {
          status: 'loading',
          fromSlot: 'primary',
        },
      }),
    ).toBe(true);
    expect(
      isWebViewLayerInteractive({
        isAndroid: false,
        slot: 'secondary',
        activeSlot: 'primary',
        transitionState: {
          status: 'loading',
          fromSlot: 'primary',
        },
      }),
    ).toBe(false);
  });

  it('keeps the active slot interactive after loading transitions settle', () => {
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'secondary',
        activeSlot: 'secondary',
        transitionState: {
          status: 'animating',
          fromSlot: 'primary',
        },
      }),
    ).toBe(true);
    expect(
      isWebViewLayerInteractive({
        isAndroid: true,
        slot: 'primary',
        activeSlot: 'secondary',
        transitionState: {
          status: 'animating',
          fromSlot: 'primary',
        },
      }),
    ).toBe(false);
  });
});

describe('resolveShellBlockingOverlayPayload', () => {
  const emptyBusyOverlayState = {
    active: false,
    lockNavigation: false,
    title: '',
    message: '',
    presentation: '',
    href: '',
  } as const;
  const busyOverlayStates = {
    primary: emptyBusyOverlayState,
    secondary: emptyBusyOverlayState,
    tertiary: emptyBusyOverlayState,
  } as const;

  it('keeps transition loading from taking over the whole shell overlay', () => {
    expect(
      resolveShellBlockingOverlayPayload({
        transitionState: {
          status: 'loading',
          fromSlot: 'primary',
          toSlot: 'secondary',
        },
        busyOverlayStates,
        activeBusyOverlay: emptyBusyOverlayState,
        shellLanguage: 'zh-CN',
      }),
    ).toBeNull();
  });

  it('ignores inline page busy states and only surfaces native fullscreen overlays', () => {
    expect(
      resolveShellBlockingOverlayPayload({
        transitionState: null,
        busyOverlayStates,
        activeBusyOverlay: {
          active: true,
          lockNavigation: false,
          title: '内联刷新',
          message: '这不应该接管壳层',
          presentation: 'inline',
          href: '',
        },
        shellLanguage: 'zh-CN',
      }),
    ).toBeNull();

    expect(
      resolveShellBlockingOverlayPayload({
        transitionState: null,
        busyOverlayStates,
        activeBusyOverlay: {
          active: true,
          lockNavigation: true,
          title: '正在同步',
          message: '请稍候',
          presentation: 'native-fullscreen',
          href: '',
        },
        shellLanguage: 'zh-CN',
      }),
    ).toEqual({
      title: '正在同步',
      message: '请稍候',
    });
  });
});

describe('resolveShellOverlayViewState', () => {
  it('shows the boot overlay copy before the active page is ready', () => {
    expect(
      resolveShellOverlayViewState({
        isPageReady: false,
        shellBlockingOverlay: null,
        shellLanguage: 'zh-CN',
      }),
    ).toEqual({
      visible: true,
      source: 'boot',
      title: '正在加载数据中',
      message: '页面资源与本地数据正在就绪',
    });
  });

  it('prefers a page-provided blocking overlay even during cold start', () => {
    expect(
      resolveShellOverlayViewState({
        isPageReady: false,
        shellBlockingOverlay: {
          title: '正在同步',
          message: '请稍候',
        },
        shellLanguage: 'zh-CN',
      }),
    ).toEqual({
      visible: true,
      source: 'blocking',
      title: '正在同步',
      message: '请稍候',
    });
  });

  it('hides the shell overlay after boot when no blocking overlay remains', () => {
    expect(
      resolveShellOverlayViewState({
        isPageReady: true,
        shellBlockingOverlay: null,
        shellLanguage: 'zh-CN',
      }),
    ).toEqual({
      visible: false,
      source: 'none',
      title: '',
      message: '',
    });
  });
});
