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
  getComparableUrl,
  isWebViewLayerInteractive,
  resolveBridgeNavigationDispatchPolicy,
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
    const NativeURL = global.URL;
    global.URL = class extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        if (typeof base !== 'undefined') {
          throw new TypeError('Invalid base URL');
        }
        super(input);
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
      global.URL = NativeURL;
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
  it('drops stale android bridge navigation from inactive slots', () => {
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
    });
  });

  it('does not queue android bridge navigation while a transition is busy', () => {
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
    });
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

  it('locks all android webview layers during transitions', () => {
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
});
