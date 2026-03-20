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

import App, {buildWidgetLaunchHref, getComparableUrl} from '../App';

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
