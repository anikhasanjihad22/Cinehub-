import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import Constants from 'expo-constants';
import {mainStorage} from './storage/StorageService';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const SUPABASE_URL = String(extra.supabaseUrl || '').trim();
export const SUPABASE_KEY = String(extra.supabaseKey || '').trim();

// Session is kept in the app's MMKV store so users stay signed in.
const SESSION_PREFIX = 'sb-session:';
const sessionStorageAdapter = {
  getItem: (key: string): string | null =>
    mainStorage.getString(SESSION_PREFIX + key) ?? null,
  setItem: (key: string, value: string): void =>
    mainStorage.setString(SESSION_PREFIX + key, value),
  removeItem: (key: string): void => mainStorage.delete(SESSION_PREFIX + key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: sessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type CineHubRole = 'user' | 'admin';

export interface CineHubProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_color: string;
  role: CineHubRole;
  created_at: string;
}

export interface CineHubServer {
  id: string;
  label: string;
  source_url: string;
  manifest_url: string | null;
  provider_value: string | null;
  position: number;
  enabled: boolean;
  /** provider values the admin hides from users inside this server */
  hidden_providers?: string[] | null;
  created_at?: string;
}
