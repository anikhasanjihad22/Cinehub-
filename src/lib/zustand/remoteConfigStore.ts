import {create} from 'zustand';
import Constants from 'expo-constants';
import {settingsStorage} from '../storage';

/** Admin key first, then a key baked into the build (if any). */
export const resolveTmdbKey = (): string =>
  settingsStorage.getTmdbApiKey() ||
  String(Constants.expoConfig?.extra?.tmdbApiKey || '').trim();

interface RemoteConfigState {
  /** TMDB key in use. Empty means Home falls back to provider catalogs. */
  tmdbApiKey: string;
  setTmdbApiKey: (key: string) => void;
}

const useRemoteConfigStore = create<RemoteConfigState>(set => ({
  tmdbApiKey: resolveTmdbKey(),
  setTmdbApiKey: key => set({tmdbApiKey: key.trim()}),
}));

export default useRemoteConfigStore;
