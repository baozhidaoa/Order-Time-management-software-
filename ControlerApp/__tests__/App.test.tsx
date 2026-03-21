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
