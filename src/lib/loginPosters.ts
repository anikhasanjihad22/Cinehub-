import axios from 'axios';
import {mainStorage} from './storage/StorageService';
import {supabase} from './supabase';
import {resolveTmdbKey} from './zustand/remoteConfigStore';

const CACHE_KEY = 'login-posters-v1';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const IMG = 'https://image.tmdb.org/t/p/w342';

interface Cache {
  at: number;
  urls: string[];
}

const read = (): Cache | null => {
  try {
    const raw = mainStorage.getString(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
};

/** Posters saved from the last refresh; available before anyone signs in. */
export const getCachedLoginPosters = (): string[] => read()?.urls ?? [];

/**
 * Pulls trending posters from TMDB with the admin's key and keeps them for the
 * sign-in backdrop. Without a key (very first launch) it does nothing and the
 * backdrop falls back to plain tiles until the next sign-in.
 */
export const refreshLoginPosters = async (): Promise<string[]> => {
  const cached = read();
  if (cached && Date.now() - cached.at < MAX_AGE_MS && cached.urls.length >= 12) {
    return cached.urls;
  }
  let apiKey = resolveTmdbKey();
  if (!apiKey) {
    // First launch, before sign-in: only works once migration-v3.sql is run.
    try {
      const {data} = await supabase.rpc('get_public_tmdb_key');
      apiKey = typeof data === 'string' ? data.trim() : '';
    } catch {
      apiKey = '';
    }
  }
  if (!apiKey) {
    return cached?.urls ?? [];
  }
  try {
    const paths = ['/trending/all/week', '/movie/popular', '/tv/popular'];
    const pages = await Promise.all(
      paths.map(p =>
        axios
          .get(`https://api.themoviedb.org/3${p}`, {
            params: {api_key: apiKey, language: 'en-US'},
            timeout: 12000,
          })
          .then(r => (r.data?.results ?? []) as Array<{poster_path?: string | null}>)
          .catch(() => []),
      ),
    );
    const urls = Array.from(
      new Set(
        pages
          .flat()
          .map(r => r.poster_path)
          .filter((p): p is string => !!p)
          .map(p => `${IMG}${p}`),
      ),
    ).slice(0, 48);
    if (urls.length >= 12) {
      mainStorage.setString(CACHE_KEY, JSON.stringify({at: Date.now(), urls}));
      return urls;
    }
  } catch {
    // keep the old posters
  }
  return cached?.urls ?? [];
};
