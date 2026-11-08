// @ts-nocheck
import type {Post} from './providers/types';
import type {HomePageData} from './getHomepagedata';
import {providerManager} from './services/ProviderManager';
import {toast} from './zustand/toastStore';

/**
 * Home rows come from TMDB (key saved by the admin). A TMDB poster is not tied
 * to any server, so opening one looks the title up on the selected server.
 */
const API = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p';

const discover = (type: string, params: Record<string, any>) => ({
  path: `/discover/${type}`,
  params: {sort_by: 'popularity.desc', 'vote_count.gte': 20, ...params},
});

export const TMDB_ROWS = [
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

export const isTmdbLink = (link?: string) => !!link && link.startsWith('tmdb:');

// Backdrops and overviews for the hero, keyed by the post link.
const extra = new Map<string, {background: string; synopsis: string}>();

const tmdb = async (key: string, path: string, params: Record<string, any> = {}, signal?: AbortSignal) => {
  const q = new URLSearchParams({api_key: key, language: 'en-US', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))});
  const res = await fetch(`${API}${path}?${q}`, {signal});
  if (!res.ok) throw new Error(res.status === 401 ? 'The TMDB API key is invalid.' : `TMDB error ${res.status}`);
  return res.json();
};

const toPost = (item: any, rowType: string): Post | null => {
  const type = rowType === 'mixed' ? (item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : undefined) : rowType;
  const title = item.title || item.name;
  if (!type || !item.id || !title || !item.poster_path) return null;
  const date: string = item.release_date || item.first_air_date || '';
  const link = `tmdb:${type}:${item.id}:${date.slice(0, 4)}`;
  extra.set(link, {
    background: item.backdrop_path ? `${IMG}/w1280${item.backdrop_path}` : '',
    synopsis: item.overview || '',
  });
  return {title, link, image: `${IMG}/w342${item.poster_path}`};
};

const fetchRow = async (key: string, row: any, signal: AbortSignal): Promise<Post[]> => {
  const pages = await Promise.all(
    [1, 2].map(page =>
      tmdb(key, row.path, {...(row.params || {}), page}, signal).catch(error => {
        if (page === 1) throw error;
        return {results: []};
      }),
    ),
  );
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const p of pages) {
    for (const item of p.results || []) {
      const post = toPost(item, row.type);
      if (post && !seen.has(post.link)) {
        seen.add(post.link);
        posts.push(post);
      }
    }
  }
  return posts;
};

export const fetchTmdbHome = async (key: string, signal: AbortSignal): Promise<HomePageData[]> => {
  const settled = await Promise.allSettled(TMDB_ROWS.map(row => fetchRow(key, row, signal)));
  const data: HomePageData[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      data.push({title: TMDB_ROWS[i].title, Posts: r.value, filter: TMDB_ROWS[i].filter});
    }
  });
  if (data.length === 0) {
    const firstError = settled.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw new Error(firstError ? String(firstError.reason?.message || firstError.reason) : 'No content from TMDB');
  }
  return data;
};

/** Hero details for a TMDB post (no provider involved). */
export const tmdbHeroMetadata = async (link: string, key: string) => {
  let info = extra.get(link);
  const [, type, id] = link.split(':');
  if (!info || !info.synopsis) {
    const d = await tmdb(key, `/${type}/${id}`);
    info = {
      background: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : '',
      synopsis: d.overview || '',
    };
    extra.set(link, info);
  }
  return {background: info.background, image: info.background, synopsis: info.synopsis};
};

const normalize = (t: string) =>
  String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const score = (post: Post, title: string, year: string) => {
  const c = normalize(post.title);
  const w = normalize(title);
  if (!c || !w) return 0;
  let s = 0;
  if (c === w) s = 100;
  else if (c.startsWith(w + ' ')) s = 80;
  else if ((' ' + c + ' ').includes(' ' + w + ' ')) s = 60;
  if (s > 0 && year && c.includes(year)) s += 15;
  return s;
};

/** Finds a TMDB title on a server. Null when nothing fits well enough. */
export const resolveTmdbPost = async (post: Post, providerValue: string): Promise<Post | null> => {
  const year = post.link.split(':')[3] || '';
  const results = await providerManager.getSearchPosts({
    searchQuery: post.title,
    page: 1,
    providerValue,
    signal: new AbortController().signal,
  });
  let best: Post | null = null;
  let bestScore = 0;
  for (const c of results) {
    const s = score(c, post.title, year);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= 60 ? best : null;
};

/** Opens a TMDB post: finds it on the selected server, then shows its page. */
export const openTmdbPost = async (post: Post, providerValue: string | undefined, navigate: (to: string) => void) => {
  if (!providerValue) {
    toast('Pick a server first (top bar).');
    return;
  }
  toast(`Finding "${post.title}"…`);
  try {
    const match = await resolveTmdbPost(post, providerValue);
    if (match) {
      const params = new URLSearchParams();
      params.append('provider', match.provider || providerValue);
      if (match.image || post.image) params.append('poster', match.image || post.image);
      navigate(`/content/${encodeURIComponent(match.link)}?${params.toString()}`);
    } else {
      toast('No exact match on this server. Showing search results.');
      navigate(`/?q=${encodeURIComponent(post.title)}`);
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not search this server');
  }
};
