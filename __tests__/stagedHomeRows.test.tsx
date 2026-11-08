import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useStagedHomeRows} from '../src/lib/hooks/useStagedHomeRows';

let output: ReturnType<typeof useStagedHomeRows>;
const makeRows = (scope: string) => [0, 1, 2, 3].map(index => ({key: scope + index, isLoading: false}));
const a = makeRows('A');
const b = makeRows('B');
function Probe({scope = 'A', rows = a, enabled = true, active = true}) {
  output = useStagedHomeRows(rows, scope, enabled, active);
  return null;
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const ready = () => output.rows.filter(row => !row.deferPosts).map(row => row.key);

it('admits one row at a time and prioritizes rows reached by a fast fling', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<Probe />);});
  expect(ready()).toEqual(['A0']);
  act(() => output.onViewableItemsChanged({viewableItems: [{index: 3}]}));
  act(() => jest.advanceTimersByTime(32));
  expect(ready()).toEqual(['A0', 'A3']);
  act(() => jest.advanceTimersByTime(32));
  expect(ready()).toEqual(['A0', 'A1', 'A3']);
  act(() => jest.advanceTimersByTime(32));
  expect(ready()).toEqual(['A0', 'A1', 'A2', 'A3']);
  act(() => tree.unmount());
  expect(jest.getTimerCount()).toBe(0);
});

it('invalidates old-provider work immediately and pauses on blur', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<Probe />);});
  act(() => jest.advanceTimersByTime(16));
  act(() => tree.update(<Probe scope="B" rows={b} active={false} />));
  expect(ready()).toEqual(['B0']);
  act(() => jest.advanceTimersByTime(100));
  expect(ready()).toEqual(['B0']);
  act(() => tree.update(<Probe scope="B" rows={b} />));
  act(() => jest.advanceTimersByTime(32));
  expect(ready()).toEqual(['B0', 'B1']);
  act(() => tree.unmount());
});

it('keeps the full catalog extent, handles progressive data, and bypasses TV staging', () => {
  let tree!: renderer.ReactTestRenderer;
  const loading = a.map(row => ({...row, isLoading: true}));
  act(() => {tree = renderer.create(<Probe rows={loading} />);});
  expect(output.rows).toHaveLength(4);
  expect(jest.getTimerCount()).toBe(0);
  act(() => tree.update(<Probe />));
  expect(ready()).toEqual(['A0']);
  act(() => tree.update(<Probe enabled={false} />));
  expect(ready()).toHaveLength(4);
  expect(jest.getTimerCount()).toBe(0);
  act(() => tree.unmount());
});
