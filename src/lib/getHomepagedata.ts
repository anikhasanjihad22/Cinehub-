import {Content} from './zustand/contentStore';
import {Catalog, Post} from './providers/types';
import {providerManager} from './services/ProviderManager';
import {throwIfProviderAborted} from './sandbox/abort';

export interface HomePageData {
  title: string;
  Posts: Post[];
  filter: string;
  error?: string;
  isLoading?: boolean;
}

interface HomeLoadOptions {
  catalogs?: Catalog[];
  previousData?: HomePageData[];
  onCategory?: (data: HomePageData[]) => void;
}

// Only two visible-priority category jobs run at a time. Publish each result
// independently so a slow category does not hold every completed row hostage.
export const getHomePageDataOptimized = async (
  activeProvider: Content['provider'],
  signal: AbortSignal,
  options: HomeLoadOptions = {},
): Promise<HomePageData[]> => {
  throwIfProviderAborted(signal);
  const catalogs =
    options.catalogs ??
    (await providerManager.getCatalog({
      providerValue: activeProvider.value,
      signal,
    }));
  throwIfProviderAborted(signal);
  const rows: HomePageData[] = catalogs.map(item => {
    const previous = options.previousData?.find(
      row => row.filter === item.filter,
    );
    return {
      title: item.title,
      filter: item.filter,
      Posts: previous?.Posts ?? [],
      isLoading: !previous || previous.isLoading === true,
    };
  });
  let cursor = 0;
  let successes = 0;
  const publish = () => {
    throwIfProviderAborted(signal);
    options.onCategory?.([...rows]);
  };
  publish();
  const worker = async () => {
    while (cursor < catalogs.length) {
      throwIfProviderAborted(signal);
      const index = cursor++;
      const catalog = catalogs[index];
      try {
        const posts = await providerManager.getPosts({
          filter: catalog.filter,
          page: 1,
          providerValue: activeProvider.value,
          signal,
        });
        throwIfProviderAborted(signal);
        if (posts.length > 0) successes++;
        rows[index] = {
          title: catalog.title,
          filter: catalog.filter,
          Posts: posts,
        };
      } catch (error) {
        throwIfProviderAborted(signal);
        rows[index] = {
          title: catalog.title,
          filter: catalog.filter,
          Posts: rows[index].Posts,
          error:
            error instanceof Error ? error.message : 'Failed to load category',
        };
      }
      publish();
    }
  };
  await Promise.all(Array.from({length: Math.min(2, catalogs.length)}, worker));
  throwIfProviderAborted(signal);
  if (successes === 0) throw new Error('Failed to load any content categories');
  return rows;
};

export const getHomePageData = getHomePageDataOptimized;
