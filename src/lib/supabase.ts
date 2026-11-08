// @ts-nocheck
import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://brggwbhrdxozibqesbpu.supabase.co';
// Publishable (public) key. Safe to ship inside the app.
const SUPABASE_KEY = 'sb_publishable_miJxKvI3j4onueq7LX5R7g_bdrgDlFl';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
  },
});

export interface CineHubServer {
  id: string;
  label: string;
  source_url: string;
  manifest_url?: string | null;
  provider_value?: string | null;
  hidden_providers?: string[] | null;
  enabled: boolean;
  position: number;
}
