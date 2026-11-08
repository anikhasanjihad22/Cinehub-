import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useHomePageData} from '../src/lib/hooks/useHomePageData';
import {getHomePageData} from '../src/lib/getHomepagedata';
import type {Content} from '../src/lib/zustand/contentStore';

jest.mock('../src/lib/storage', () => ({cacheStorage: {getString: jest.fn(), setString: jest.fn()}}));
jest.mock('../src/lib/getHomepagedata', () => ({getHomePageData: jest.fn()}));
jest.mock('../src/lib/services/ProviderManager', () => ({providerManager: {getCatalog: jest.fn(async () => [])}}));
jest.mock('../src/lib/zustand/contentStore', () => ({}));

it('resumes unfinished categories immediately when returning after cancellation', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const provider = {value: 'fixture'} as Content['provider'];
  client.setQueryData(['homeCatalog', '', '', 'fixture', undefined], []);
  const partial = [{title: 'Pending', filter: 'pending', Posts: [], isLoading: true}];
  const load = jest.mocked(getHomePageData);
  load.mockImplementationOnce((_provider, signal, options) => {
    options?.onCategory?.(partial);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), {name: 'AbortError'})), {once: true});
    });
  });
  load.mockResolvedValueOnce([{...partial[0], isLoading: false}]);
  const Probe = () => { useHomePageData({provider}); return null; };
  const element = <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
  let tree: renderer.ReactTestRenderer | undefined;
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  try {
    await act(async () => { tree = renderer.create(element); });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    act(() => tree?.unmount());
    await act(async () => { tree = renderer.create(element); });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(['homePageData', '', '', 'fixture', undefined])).toEqual([{...partial[0], isLoading: false}]);
  } finally {
    act(() => tree?.unmount());
    client.clear();
  }
});
