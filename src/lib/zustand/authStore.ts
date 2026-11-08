// @ts-nocheck
import {create} from 'zustand';
import {supabase} from '../supabase';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: any | null;
  profile: any | null;
  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{needsEmailConfirmation: boolean}>;
  resetPassword: (email: string) => Promise<void>;
  resetPasswordWithCode: (email: string, code: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

let initialized = false;
// While a reset code is checked, the temporary session must not sign anyone in.
let resetting = false;

const friendly = (e: any): Error => {
  const m = String((e && e.message) || e || '').toLowerCase();
  if (m.includes('invalid login')) return new Error('Wrong email or password.');
  if (m.includes('already registered') || m.includes('already been registered')) {
    return new Error('This email already has an account. Sign in instead.');
  }
  if (m.includes('email not confirmed')) return new Error('Confirm your email first, then sign in.');
  if (m.includes('rate limit') || m.includes('too many')) return new Error('Too many attempts. Please wait a minute.');
  if (m.includes('network') || m.includes('failed to fetch')) return new Error('No internet connection.');
  return new Error((e && e.message) || 'Something went wrong.');
};

const useAuthStore = create<AuthState>((set, get) => {
  const apply = async (session: any) => {
    if (resetting) return;
    if (!session) {
      set({status: 'signedOut', user: null, profile: null});
      return;
    }
    set({status: 'signedIn', user: session.user});
    try {
      const {data} = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (data) set({profile: data});
    } catch {
      // profile is optional
    }
  };

  return {
    status: 'loading',
    user: null,
    profile: null,

    init: () => {
      if (initialized) return;
      initialized = true;
      supabase.auth.getSession().then(({data}) => apply(data.session));
      supabase.auth.onAuthStateChange((_event, session) => {
        void apply(session);
      });
    },

    signIn: async (email, password) => {
      const {error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
      if (error) throw friendly(error);
    },

    signUp: async (email, password, name) => {
      const {data, error} = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {data: {display_name: name.trim()}},
      });
      if (error) throw friendly(error);
      return {needsEmailConfirmation: !data.session};
    },

    resetPassword: async email => {
      const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw friendly(error);
    },

    resetPasswordWithCode: async (email, code, password) => {
      resetting = true;
      try {
        const {error: verifyError} = await supabase.auth.verifyOtp({email: email.trim(), token: code.trim(), type: 'recovery'});
        if (verifyError) throw new Error('That code is wrong or has expired. Request a new one.');
        const {error: updateError} = await supabase.auth.updateUser({password});
        if (updateError) throw friendly(updateError);
        await supabase.auth.signOut({scope: 'local'}).catch(() => {});
        set({status: 'signedOut', user: null, profile: null});
      } finally {
        resetting = false;
      }
    },

    signOut: async () => {
      await supabase.auth.signOut().catch(() => {});
      set({status: 'signedOut', user: null, profile: null});
      void get;
    },
  };
});

export default useAuthStore;
