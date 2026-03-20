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

import App from '../App';

// Note: import explicitly to use the types shiped with jest.
import {expect, it, jest} from '@jest/globals';

it('exports the app component', () => {
  expect(typeof App).toBe('function');
});
