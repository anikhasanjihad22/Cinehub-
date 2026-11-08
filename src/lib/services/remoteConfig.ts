import {supabase} from '../supabase';
import {settingsStorage} from '../storage';
import type {LiveSource} from '../liveTv/liveTv';
import useRemoteConfigStore, {resolveTmdbKey} from '../zustand/remoteConfigStore';

export const TMDB_SETTING_KEY = 'tmdb_api_key';

/** Pulls admin-controlled settings (TMDB key) so every user gets them. */
export const syncRemoteConfig = async (): Promise<void> => {
  const {data, error} = await supabase
    .from('app_settings')
    .select('key,value')
    .eq('key', TMDB_SETTING_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  // No row yet = admin has not set a key; keep whatever the build ships with.
  const key = String(data?.value ?? '').trim();
  settingsStorage.setRemoteTmdbApiKey(key);
  useRemoteConfigStore.getState().setTmdbApiKey(resolveTmdbKey());
};

/** Admin only. Saves the key for all users (RLS enforces admin). */
export const saveTmdbApiKey = async (apiKey: string): Promise<void> => {
  const value = apiKey.trim();
  const {error} = await supabase
    .from('app_settings')
    .upsert({key: TMDB_SETTING_KEY, value}, {onConflict: 'key'});
  if (error) {
    throw new Error(error.message);
  }
  settingsStorage.setRemoteTmdbApiKey(value);
  useRemoteConfigStore.getState().setTmdbApiKey(resolveTmdbKey());
};

/** Admin only: what is stored on the server right now. */
export const fetchTmdbApiKeyForAdmin = async (): Promise<string> => {
  const {data, error} = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', TMDB_SETTING_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return String(data?.value ?? '');
};

export const LIVE_TV_SETTING_KEY = 'live_tv_sources';

const normalizeSources = (raw: string): LiveSource[] => {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map((x, i) => ({
        id: String(x?.id || `src${i}`),
        label: String(x?.label || '').trim(),
        url: String(x?.url || '').trim(),
      }))
      .filter(x => /^https?:\/\//i.test(x.url));
  } catch {
    return [];
  }
};

/** Live TV JSON links the admin added (readable by every signed-in user). */
export const fetchLiveTvSources = async (): Promise<LiveSource[]> => {
  const {data, error} = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', LIVE_TV_SETTING_KEY)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return normalizeSources(String(data?.value ?? ''));
};

/** Admin only. Replaces the whole list of Live TV links. */
export const saveLiveTvSources = async (sources: LiveSource[]): Promise<void> => {
  const clean = sources
    .map(s => ({id: s.id, label: s.label.trim(), url: s.url.trim()}))
    .filter(s => s.url);
  const {error} = await supabase
    .from('app_settings')
    .upsert({key: LIVE_TV_SETTING_KEY, value: JSON.stringify(clean)}, {onConflict: 'key'});
  if (error) {
    throw new Error(error.message);
  }
};
