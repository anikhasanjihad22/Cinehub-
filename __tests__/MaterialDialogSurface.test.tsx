import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Modal, TVFocusGuideView, View} from 'react-native';

const mockRequestTVFocus = jest.fn();
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = require('react');
  Object.defineProperty(native, 'TVFocusGuideView', {
    value: react.forwardRef((props: any, ref: any) => {
      react.useImperativeHandle(ref, () => ({requestTVFocus: mockRequestTVFocus}));
      return react.createElement(native.View, props);
    }),
  });
  return native;
});

jest.mock('../src/lib/tv', () => ({isTV: true}));
jest.mock('../src/theme/M3PaletteContext', () => ({
  useM3Colors: () => ({}),
  useM3HostTheme: () => ({}),
}));

import MaterialDialogSurface from '../src/components/ui/MaterialDialogSurface';

it('claims focus after the modal opens and excludes the backdrop from D-pad navigation', () => {
  mockRequestTVFocus.mockClear();
  const onDismiss = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MaterialDialogSurface visible onDismiss={onDismiss}>
        <View />
      </MaterialDialogSurface>,
    );
  });
  const guide = tree.root.findByType(TVFocusGuideView);
  expect(guide.props).toMatchObject({
    autoFocus: true,
    trapFocusUp: true,
    trapFocusDown: true,
    trapFocusLeft: true,
    trapFocusRight: true,
  });
  expect(mockRequestTVFocus).not.toHaveBeenCalled();
  act(() => tree.root.findByType(Modal).props.onShow());
  expect(mockRequestTVFocus).toHaveBeenCalledTimes(1);
  const backdrop = tree.root.findAll(
    node => typeof node.props.onPress === 'function',
    {deep: false},
  )[0];
  expect(backdrop.props.focusable).toBe(false);
  expect(backdrop.props.accessible).toBe(false);
  act(() => backdrop.props.onPress());
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(onDismiss).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

it('keeps Back dismissal disabled for a nondismissible dialog', () => {
  const onDismiss = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MaterialDialogSurface visible dismissible={false} onDismiss={onDismiss}>
        <View />
      </MaterialDialogSurface>,
    );
  });
  expect(
    tree.root.findAll(node => typeof node.props.onPress === 'function'),
  ).toHaveLength(0);
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
