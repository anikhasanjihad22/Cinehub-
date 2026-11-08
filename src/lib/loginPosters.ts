// @ts-nocheck
import {supabase} from './supabase';
import {peekTmdbKey} from './services/remoteConfig';

const CACHE_KEY = 'cinehub:loginPosters';
const MAX_AGE = 12 * 60 * 60 * 1000;
const IMG = 'https://image.tmdb.org/t/p/w342';

const read = (): {at: number; urls: string[]} | null => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
};

export const getCachedLoginPosters = (): string[] => (read() && read()!.urls) || [];

/** Trending posters for the sign-in backdrop; cached so they show before login. */
export const refreshLoginPosters = async (): Promise<string[]> => {
  const cached = read();
  if (cached && Date.now() - cached.at < MAX_AGE && cached.urls.length >= 12) return cached.urls;
  let key = peekTmdbKey();
  if (!key) {
    try {
      const {data} = await supabase.rpc('get_public_tmdb_key');
      key = typeof data === 'string' ? data.trim() : '';
    } catch {
      key = '';
    }
  }
  if (!key) return (cached && cached.urls) || [];
  try {
    const pages = await Promise.all(
      ['/trending/all/week', '/movie/popular', '/tv/popular'].map(p =>
        fetch(`https://api.themoviedb.org/3${p}?api_key=${key}&language=en-US`)
          .then(r => r.json())
          .then(j => j.results || [])
          .catch(() => []),
      ),
    );
    const urls = Array.from(new Set(pages.flat().map((r: any) => r.poster_path).filter(Boolean).map((p: string) => `${IMG}${p}`))).slice(0, 48);
    if (urls.length >= 12) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({at: Date.now(), urls}));
      return urls;
    }
  } catch {
    // keep old
  }
  return (cached && cached.urls) || [];
};
