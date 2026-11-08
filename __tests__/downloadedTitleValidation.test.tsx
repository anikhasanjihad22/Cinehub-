import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useDownloadedTitleValidation} from '../src/lib/hooks/useDownloadedTitleValidation';
import {reconcileCompletedDownloadOutputs} from '../src/lib/downloadReconciliation';

jest.mock('@react-navigation/native', () => {
  const ReactRuntime = require('react');
  const FocusContext = ReactRuntime.createContext(false);
  return {
    FocusContext,
    useFocusEffect: (callback: () => void | (() => void)) => {
      const focused = ReactRuntime.useContext(FocusContext);
      ReactRuntime.useEffect(() => focused ? callback() : undefined, [focused, callback]);
    },
  };
});
jest.mock('../src/lib/sync/syncService', () => ({syncFromSharedFolder: jest.fn()}));
jest.mock('../src/lib/downloadReconciliation', () => ({reconcileCompletedDownloadOutputs: jest.fn()}));

const FocusContext = require('@react-navigation/native').FocusContext;
const reconcile = reconcileCompletedDownloadOutputs as jest.Mock;

const Harness = ({scope}: {scope: string}) => {
  const busy = useDownloadedTitleValidation(scope, [scope + '_episode']);
  return <>{busy ? 'checking' : 'ready'}</>;
};
const screen = (focused: boolean, scope: string) => (
  <FocusContext.Provider value={focused}><Harness scope={scope} /></FocusContext.Provider>
);
const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
let tree: renderer.ReactTestRenderer;
beforeEach(() => {jest.useFakeTimers(); reconcile.mockReset();});
afterEach(async () => {await act(async () => {tree?.unmount(); await flush();}); jest.useRealTimers();});
it('cancels old season checks and keeps skeleton until the new scope finishes', async () => {
  const finish: Array<() => void> = [];
  reconcile.mockImplementation(() => new Promise<void>(resolve => finish.push(resolve)));
  act(() => {tree = renderer.create(screen(true, 'season1'));});
  await act(async () => {jest.runOnlyPendingTimers(); await flush();});
  expect(tree.toJSON()).toBe('checking');
  const firstSignal = reconcile.mock.calls[0][0];
  expect([...reconcile.mock.calls[0][1]]).toEqual(['season1_episode']);
  act(() => {tree.update(screen(true, 'season2'));});
  expect(firstSignal.aborted).toBe(true);
  await act(async () => {finish[0](); await flush(); jest.runOnlyPendingTimers(); await flush();});
  expect(tree.toJSON()).toBe('checking');
  expect([...reconcile.mock.calls[1][1]]).toEqual(['season2_episode']);
  await act(async () => {finish[1](); await flush();});
  expect(tree.toJSON()).toBe('ready');
});
it('aborts checks on blur so pending results cannot update the screen', async () => {
  let finish!: () => void;
  reconcile.mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
  act(() => {tree = renderer.create(screen(true, 'movie'));});
  await act(async () => {jest.runOnlyPendingTimers(); await flush();});
  const signal = reconcile.mock.calls[0][0];
  act(() => {tree.update(screen(false, 'movie'));});
  expect(signal.aborted).toBe(true);
  await act(async () => {finish(); await flush();});
  expect(tree.toJSON()).toBe('checking');
});
