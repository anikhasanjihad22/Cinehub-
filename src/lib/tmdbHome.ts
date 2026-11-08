import axios from 'axios';
import {ToastAndroid} from 'react-native';
import type {Post} from './providers/types';
import type {HomePageData} from './getHomepagedata';
import useContentStore from './zustand/contentStore';
import {providerManager} from './services/ProviderManager';

/**
 * Home is built from TMDB (rows, posters, hero). The selected provider is only
 * used when a title is opened or played: the TMDB title is looked up on that
 * provider and the match opens like any provider post.
 */

const TMDB_API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const TMDB_PREFIX = 'tmdb:';

type MediaType = 'movie' | 'tv';

interface TmdbRow {
  filter: string;
  title: string;
  path: string;
  /** media type of the results; 'mixed' reads it from each item */
  type: MediaType | 'mixed';
  params?: Record<string, string | number>;
}

const discover = (
  type: MediaType,
  params: Record<string, string | number>,
): Pick<TmdbRow, 'path' | 'params'> => ({
  path: `/discover/${type}`,
  params: {sort_by: 'popularity.desc', 'vote_count.gte': 20, ...params},
});

export const TMDB_ROWS: TmdbRow[] = [
  {filter: 'tmdb:trending', title: 'Trending Now', path: '/trending/all/week', type: 'mixed'},
  {filter: 'tmdb:popular-movie', title: 'Popular Movies', path: '/movie/popular', type: 'movie'},
  {filter: 'tmdb:popular-tv', title: 'Popular Series', path: '/tv/popular', type: 'tv'},
  {filter: 'tmdb:bangla', title: 'Bangla Picks', type: 'movie', ...discover('movie', {with_original_language: 'bn'})},
  {filter: 'tmdb:hindi', title: 'Hindi Hits', type: 'movie', ...discover('movie', {with_original_language: 'hi'})},
  {filter: 'tmdb:top-movie', title: 'Top Rated Movies', path: '/movie/top_rated', type: 'movie'},
  {filter: 'tmdb:top-tv', title: 'Top Rated Series', path: '/tv/top_rated', type: 'tv'},
  {filter: 'tmdb:now-playing', title: 'Now In Theaters', path: '/movie/now_playing', type: 'movie'},
  {filter: 'tmdb:on-air', title: 'On The Air', path: '/tv/on_the_air', type: 'tv'},
  {filter: 'tmdb:action', title: 'Action & Adventure', type: 'movie', ...discover('movie', {with_genres: 28})},
  {filter: 'tmdb:comedy', title: 'Comedy', type: 'movie', ...discover('movie', {with_genres: 35})},
  {filter: 'tmdb:horror', title: 'Horror', type: 'movie', ...discover('movie', {with_genres: 27})},
  {filter: 'tmdb:scifi', title: 'Sci-Fi', type: 'movie', ...discover('movie', {with_genres: 878})},
  {filter: 'tmdb:animation', title: 'Animation', type: 'movie', ...discover('movie', {with_genres: 16})},
  {filter: 'tmdb:kdrama', title: 'Korean Dramas', type: 'tv', ...discover('tv', {with_original_language: 'ko'})},
  {filter: 'tmdb:upcoming', title: 'Coming Soon', path: '/movie/upcoming', type: 'movie'},
];

export const TMDB_CATALOG = TMDB_ROWS.map(({title, filter}) => ({title, filter}));

export const isTmdbLink = (link?: string): boolean =>
  !!link && link.startsWith(TMDB_PREFIX);

export const isTmdbFilter = (filter?: string): boolean =>
  !!filter && filter.startsWith(TMDB_PREFIX);

const buildLink = (type: MediaType, id: number, year: string) =>
  `${TMDB_PREFIX}${type}:${id}:${year}`;

export const parseTmdbLink = (link: string) => {
  const [, type, id, year] = link.split(':');
  return {type: type as MediaType, id: Number(id), year: year || ''};
};

const request = async (
  apiKey: string,
  path: string,
  params: Record<string, string | number> = {},
  signal?: AbortSignal,
) => {
  const {data} = await axios.get(`${TMDB_API}${path}`, {
    params: {api_key: apiKey, language: 'en-US', ...params},
    timeout: 15000,
    signal,
  });
  return data;
};

/** True when TMDB accepts the key. Used by the admin before saving. */
export const validateTmdbKey = async (apiKey: string): Promise<boolean> => {
  try {
    await request(apiKey.trim(), '/configuration');
    return true;
  } catch {
    return false;
  }
};

const toPost = (item: any, rowType: TmdbRow['type']): Post | null => {
  const type: MediaType | undefined =
    rowType === 'mixed'
      ? item.media_type === 'movie' || item.media_type === 'tv'
        ? item.media_type
        : undefined
      : rowType;
  const title = item.title || item.name;
  if (!type || !item.id || !title || !item.poster_path) {
    return null;
  }
  const date: string = item.release_date || item.first_air_date || '';
  return {
    title,
    link: buildLink(type, item.id, date.slice(0, 4)),
    image: `${IMG}/w342${item.poster_path}`,
  };
};

const fetchRow = async (
  apiKey: string,
  row: TmdbRow,
  signal: AbortSignal,
): Promise<Post[]> => {
  // Two pages per row so each row has a good amount to scroll.
  const pages = await Promise.all(
    [1, 2].map(page =>
      request(apiKey, row.path, {...(row.params ?? {}), page}, signal).catch(
        error => {
          if (page === 1) {
            throw error;
          }
          return {results: []};
        },
      ),
    ),
  );
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const page of pages) {
    for (const item of page.results ?? []) {
      const post = toPost(item, row.type);
      if (post && !seen.has(post.link)) {
        seen.add(post.link);
        posts.push(post);
      }
    }
  }
  return posts;
};

interface TmdbHomeOptions {
  previousData?: HomePageData[];
  onCategory?: (data: HomePageData[]) => void;
}

/** Loads every TMDB row, publishing each as soon as it arrives. */
export const getTmdbHomeData = async (
  apiKey: string,
  signal: AbortSignal,
  options: TmdbHomeOptions = {},
): Promise<HomePageData[]> => {
  const rows: HomePageData[] = TMDB_ROWS.map(row => {
    const previous = options.previousData?.find(r => r.filter === row.filter);
    return {
      title: row.title,
      filter: row.filter,
      Posts: previous?.Posts ?? [],
      isLoading: !previous || previous.isLoading === true,
    };
  });
  const publish = () => {
    if (!signal.aborted) {
      options.onCategory?.([...rows]);
    }
  };
  publish();

  let cursor = 0;
  let successes = 0;
  let firstError = '';
  const worker = async () => {
    while (cursor < TMDB_ROWS.length && !signal.aborted) {
      const index = cursor++;
      const row = TMDB_ROWS[index];
      try {
        const posts = await fetchRow(apiKey, row, signal);
        if (posts.length > 0) {
          successes += 1;
        }
        rows[index] = {title: row.title, filter: row.filter, Posts: posts};
      } catch (error: any) {
        if (signal.aborted) {
          return;
        }
        const status = error?.response?.status;
        firstError =
          status === 401
            ? 'The TMDB API key is invalid. Ask the admin to update it.'
            : error?.message || 'Failed to load';
        rows[index] = {
          title: row.title,
          filter: row.filter,
          Posts: rows[index].Posts,
          error: firstError,
        };
      }
      publish();
    }
  };
  await Promise.all(Array.from({length: 4}, worker));
  if (signal.aborted) {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  }
  if (successes === 0) {
    throw new Error(firstError || 'Failed to load any content');
  }
  return rows;
};

/** Hero artwork and text for a TMDB post, shaped like provider metadata. */
export const fetchTmdbHeroMeta = async (
  apiKey: string,
  link: string,
  signal?: AbortSignal,
) => {
  const {type, id} = parseTmdbLink(link);
  const data = await request(
    apiKey,
    `/${type}/${id}`,
    {append_to_response: 'images', include_image_language: 'en,null'},
    signal,
  );
  const logo =
    (data.images?.logos ?? []).find((l: any) => l.iso_639_1 === 'en') ??
    data.images?.logos?.[0];
  const genres: string[] = (data.genres ?? []).map((g: any) => g.name);
  return {
    title: data.title || data.name,
    synopsis: data.overview,
    type: type === 'tv' ? 'series' : 'movie',
    background: data.backdrop_path ? `${IMG}/w1280${data.backdrop_path}` : '',
    image: data.backdrop_path ? `${IMG}/w1280${data.backdrop_path}` : '',
    poster: data.poster_path ? `${IMG}/w500${data.poster_path}` : '',
    logo: logo ? `${IMG}/w500${logo.file_path}` : undefined,
    genre: genres,
    tags: genres,
    rating: data.vote_average ? String(data.vote_average.toFixed(1)) : undefined,
  };
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const scorePost = (post: Post, title: string, year: string): number => {
  const candidate = normalize(post.title);
  const wanted = normalize(title);
  if (!candidate || !wanted) {
    return 0;
  }
  let score = 0;
  if (candidate === wanted) {
    score = 100;
  } else if (candidate.startsWith(wanted + ' ')) {
    score = 80;
  } else if ((' ' + candidate + ' ').includes(' ' + wanted + ' ')) {
    score = 60;
  }
  if (score > 0 && year && candidate.includes(year)) {
    score += 15;
  }
  return score;
};

/** Finds the TMDB title on the selected provider. Null when nothing fits. */
export const resolveTmdbPost = async (
  post: Post,
  providerValue: string,
): Promise<Post | null> => {
  const {year} = parseTmdbLink(post.link);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const results = await providerManager.getSearchPosts({
      searchQuery: post.title,
      page: 1,
      providerValue,
      signal: controller.signal,
    });
    let best: Post | null = null;
    let bestScore = 0;
    for (const candidate of results) {
      const score = scorePost(candidate, post.title, year);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 60 ? best : null;
  } finally {
    clearTimeout(timer);
  }
};

interface NavigationLike {
  navigate: (name: any, params: any) => void;
}

let resolving = false;

/** Opens a TMDB post on the currently selected provider. */
export const openTmdbPost = async (
  navigation: NavigationLike,
  post: Post,
): Promise<void> => {
  if (resolving) {
    return;
  }
  const provider = useContentStore.getState().provider;
  if (!provider?.value) {
    ToastAndroid.show('Pick a server first', ToastAndroid.SHORT);
    return;
  }
  resolving = true;
  ToastAndroid.show(`Finding "${post.title}"…`, ToastAndroid.SHORT);
  try {
    const match = await resolveTmdbPost(post, provider.value);
    if (match) {
      navigation.navigate('Info', {
        link: match.link,
        provider: match.provider || provider.value,
        poster: match.image || post.image,
      });
    } else {
      ToastAndroid.show(
        'No exact match on this server. Showing search results.',
        ToastAndroid.LONG,
      );
      navigation.navigate('ScrollList', {
        title: post.title,
        filter: post.title,
        providerValue: provider.value,
        isSearch: true,
      });
    }
  } catch (error) {
    ToastAndroid.show(
      error instanceof Error && error.message
        ? error.message
        : 'Could not search this server',
      ToastAndroid.LONG,
    );
  }
  resolving = false;
};
