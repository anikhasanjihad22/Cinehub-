jest.mock('../src/lib/services/ProviderManager', () => ({
  providerManager: {getCatalog: jest.fn(), getPosts: jest.fn()},
}));
import {providerManager} from '../src/lib/services/ProviderManager';
import {getHomePageData, HomePageData} from '../src/lib/getHomepagedata';
import type {Content} from '../src/lib/zustand/contentStore';
import type {Post} from '../src/lib/providers/types';

const provider = {value: 'fixture'} as Content['provider'];
const catalogs = Array.from({length: 8}, (_, i) => ({
  title: 'Row ' + i,
  filter: '' + i,
}));
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => jest.clearAllMocks());

it('keeps incomplete cached rows loading while resuming them', async () => {
  (providerManager.getPosts as jest.Mock).mockResolvedValue([
    {title: 'Loaded', link: 'loaded', image: 'image'},
  ]);
  const publish = jest.fn();
  await getHomePageData(provider, new AbortController().signal, {
    catalogs: [catalogs[0]],
    previousData: [{...catalogs[0], Posts: [], isLoading: true}],
    onCategory: publish,
  });
  expect(publish.mock.calls[0][0][0].isLoading).toBe(true);
  expect(publish.mock.calls[1][0][0].Posts).toHaveLength(1);
});

it('publishes fast rows before a slow category and keeps only two categories in flight', async () => {
  const pending = new Map<string, (posts: Post[]) => void>();
  (providerManager.getPosts as jest.Mock).mockImplementation(
    ({filter}) => new Promise(resolve => pending.set(filter, resolve)),
  );
  let latest: HomePageData[] = [];
  const loading = getHomePageData(provider, new AbortController().signal, {
    catalogs,
    onCategory: data => {
      latest = data;
    },
  });
  expect(pending.size).toBe(2);
  pending.get('0')!([{title: 'First', link: 'first', image: 'image'} as Post]);
  pending.delete('0');
  await flush();
  expect(latest[0].Posts[0].title).toBe('First');
  expect(latest[7].isLoading).toBe(true);
  expect(pending.size).toBe(2);
  expect(providerManager.getCatalog).not.toHaveBeenCalled();
  while (pending.size) {
    const [filter, resolve] = pending.entries().next().value!;
    pending.delete(filter);
    resolve([{title: filter, link: filter, image: 'image'} as Post]);
    await flush();
    expect(pending.size).toBeLessThanOrEqual(2);
  }
  expect(await loading).toHaveLength(8);
  expect(latest.every(row => !row.isLoading)).toBe(true);
});

it('does not start or publish further categories after switching away', async () => {
  const controller = new AbortController();
  const resolves: Array<(posts: Post[]) => void> = [];
  (providerManager.getPosts as jest.Mock).mockImplementation(
    () => new Promise(resolve => resolves.push(resolve)),
  );
  const publish = jest.fn();
  const loading = getHomePageData(provider, controller.signal, {
    catalogs,
    onCategory: publish,
  });
  const outcome = expect(loading).rejects.toMatchObject({name: 'AbortError'});
  controller.abort();
  resolves.forEach(resolve => resolve([]));
  await outcome;
  expect(providerManager.getPosts).toHaveBeenCalledTimes(2);
  expect(publish).toHaveBeenCalledTimes(1);
});
