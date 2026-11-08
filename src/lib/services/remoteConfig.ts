// @ts-nocheck
import {useQuery} from '@tanstack/react-query';
import {supabase} from '../supabase';

export interface LiveSource {
  id: string;
  label: string;
  url: string;
}

const TMDB_STORE_KEY = 'cinehub:tmdbKey';

export const fetchSetting = async (key: string): Promise<string> => {
  const {data, error} = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return String((data && data.value) || '');
};

export const peekTmdbKey = (): string => {
  try {
    return localStorage.getItem(TMDB_STORE_KEY) || '';
  } catch {
    return '';
  }
};

/** The TMDB key the admin saved. Falls back to the last one this PC saw. */
export const getTmdbKey = async (): Promise<string> => {
  try {
    const key = (await fetchSetting('tmdb_api_key')).trim();
    if (key) {
      localStorage.setItem(TMDB_STORE_KEY, key);
      return key;
    }
  } catch {
    // offline: use the stored one
  }
  return peekTmdbKey();
};

export const useTmdbKey = () =>
  useQuery({
    queryKey: ['tmdbKey'],
    queryFn: getTmdbKey,
    staleTime: 10 * 60 * 1000,
    initialData: peekTmdbKey() || undefined,
    initialDataUpdatedAt: 0,
  });

export const fetchLiveTvSources = async (): Promise<LiveSource[]> => {
  const raw = await fetchSetting('live_tv_sources');
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((x, i) => ({
        id: String((x && x.id) || `src${i}`),
        label: String((x && x.label) || '').trim(),
        url: String((x && x.url) || '').trim(),
      }))
      .filter(x => /^https?:\/\//i.test(x.url));
  } catch {
    return [];
  }
};
