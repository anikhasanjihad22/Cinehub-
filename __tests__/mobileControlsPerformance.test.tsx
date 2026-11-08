import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {TouchableOpacity} from 'react-native';
import {NavigationContext} from '@react-navigation/native';
import {Slider} from '@expo/ui/jetpack-compose';
import {TVFocusable} from '../src/components/tv/TVFocusable';
import SettingsSliderRow from '../src/components/ui/SettingsSliderRow';
import {flushInteractionCommits} from '../src/lib/performance/idleWork';

jest.mock('@expo/ui/jetpack-compose', () => ({Host: require('react-native').View, Slider: 'ComposeSlider'}));

jest.mock('@react-navigation/native', () => ({NavigationContext: require('react').createContext(undefined)}));
jest.mock('../src/lib/tv/constants', () => ({isTV: false}));
jest.mock('../src/lib/tv', () => ({isTV: false}));
jest.mock('../src/lib/tv/useTVFocusBorderColor', () => ({useTVFocusBorderColor: () => {throw new Error('Phone allocated TV color hook');}}));
jest.mock('../src/lib/tv/useTVNavFocusMemory', () => ({useSafeIsNavFocused: () => {throw new Error('Phone subscribed to TV focus');}, useTVNavFocusMemory: jest.fn()}));
jest.mock('react-native-reanimated', () => ({__esModule: true, default: {View: require('react-native').View}, useSharedValue: () => {throw new Error('Phone allocated a shared value');}}));
jest.mock('../src/theme/M3PaletteContext', () => ({useM3Colors: () => ({}), useM3HostTheme: () => ({})}));
jest.mock('../src/lib/storage', () => ({settingsStorage: {isHapticFeedbackEnabled: () => false}}));
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../src/components/ui/Text', () => require('react-native').Text);

it('uses phone touch handling without TV worklets and checks focus at press time', () => {
  let focused = true;
  const onPress = jest.fn();
  const navigation = {isFocused: () => focused};
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<NavigationContext.Provider value={navigation as any}><TVFocusable onPress={onPress}>Hello</TVFocusable></NavigationContext.Provider>); });
  const press = tree.root.findByType(TouchableOpacity).props.onPress;
  act(() => press());
  expect(onPress).toHaveBeenCalledTimes(1);
  focused = false;
  act(() => press());
  expect(onPress).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('deduplicates snapped slider values and commits the final value on release or background', () => {
  const change = jest.fn();
  const finish = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<SettingsSliderRow title="Buffer" value={0.1} min={0} max={1} step={0.1} onValueChange={change} onValueChangeFinished={finish} />); });
  const slider = tree.root.findByType(Slider);
  act(() => { slider.props.onValueChange(0.21); slider.props.onValueChange(0.22); slider.props.onValueChange(0.29); });
  expect(change.mock.calls).toEqual([[0.2], [0.3]]);
  expect(finish).not.toHaveBeenCalled();
  act(() => slider.props.onValueChangeFinished());
  expect(finish.mock.calls).toEqual([[0.3]]);
  act(() => slider.props.onValueChange(0.41));
  act(() => flushInteractionCommits());
  expect(finish.mock.calls).toEqual([[0.3], [0.4]]);
  act(() => tree.unmount());
  expect(finish).toHaveBeenCalledTimes(2);
});
