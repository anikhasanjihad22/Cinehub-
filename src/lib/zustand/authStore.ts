import {create} from 'zustand';
import {AppState} from 'react-native';
import type {Session, User} from '@supabase/supabase-js';
import {supabase, CineHubProfile} from '../supabase';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SignUpResult {
  /** true when Supabase wants the user to confirm their email first */
  needsEmailConfirmation: boolean;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: CineHubProfile | null;
  isAdmin: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<SignUpResult>;
  resetPassword: (email: string) => Promise<void>;
  resetPasswordWithCode: (
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    patch: Partial<Pick<CineHubProfile, 'display_name' | 'avatar_color'>>,
  ) => Promise<void>;
}

let initialized = false;
// True while a password reset is verifying its code: the temporary recovery
// session must not sign the user into the app.
let resettingPassword = false;

const friendlyError = (error: unknown): Error => {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return new Error('Wrong email or password.');
  }
  if (msg.includes('email not confirmed')) {
    return new Error('Please confirm your email first, then sign in.');
  }
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return new Error('An account with this email already exists.');
  }
  if (msg.includes('password') && msg.includes('characters')) {
    return new Error('Password must be at least 6 characters.');
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return new Error('Too many attempts. Please wait a minute and try again.');
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return new Error('No internet connection. Check your network and retry.');
  }
  return new Error(raw || 'Something went wrong. Please try again.');
};

const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  user: null,
  profile: null,
  isAdmin: false,

  init: async () => {
    if (initialized) {
      return;
    }
    initialized = true;

    const apply = (session: Session | null) => {
      set({
        session,
        user: session?.user ?? null,
        status: session ? 'signedIn' : 'signedOut',
        ...(session ? {} : {profile: null, isAdmin: false}),
      });
    };

    try {
      const {data} = await supabase.auth.getSession();
      apply(data.session);
      if (data.session) {
        void get().refreshProfile();
      }
    } catch {
      apply(null);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (resettingPassword) {
        return;
      }
      const hadUser = get().user?.id;
      apply(session);
      if (session && session.user.id !== hadUser) {
        void get().refreshProfile();
      }
    });

    // Keep tokens fresh only while the app is in the foreground.
    const handleAppState = (state: string) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    handleAppState(AppState.currentState);
    AppState.addEventListener('change', handleAppState);
  },

  signIn: async (email, password) => {
    const {error} = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw friendlyError(error);
    }
  },

  signUp: async (email, password, displayName) => {
    const {data, error} = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {data: {display_name: displayName.trim()}},
    });
    if (error) {
      throw friendlyError(error);
    }
    // No session means email confirmation is switched on in Supabase.
    return {needsEmailConfirmation: !data.session};
  },

  resetPassword: async email => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      throw friendlyError(error);
    }
  },

  resetPasswordWithCode: async (email, code, newPassword) => {
    resettingPassword = true;
    try {
      const {error: verifyError} = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (verifyError) {
        const m = verifyError.message.toLowerCase();
        if (m.includes('expired') || m.includes('invalid')) {
          throw new Error('That code is wrong or has expired. Request a new one.');
        }
        throw friendlyError(verifyError);
      }
      const {error: updateError} = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        throw friendlyError(updateError);
      }
      // Back to the sign-in screen: the user logs in with the new password.
      await supabase.auth.signOut({scope: 'local'}).catch(() => {});
      set({session: null, user: null, profile: null, isAdmin: false, status: 'signedOut'});
    } finally {
      resettingPassword = false;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({session: null, user: null, profile: null, isAdmin: false, status: 'signedOut'});
  },

  refreshProfile: async () => {
    const uid = get().user?.id;
    if (!uid) {
      return;
    }
    const {data, error} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error || !data) {
      return;
    }
    const profile = data as CineHubProfile;
    set({profile, isAdmin: profile.role === 'admin'});
  },

  updateProfile: async patch => {
    const uid = get().user?.id;
    if (!uid) {
      return;
    }
    const {error} = await supabase.from('profiles').update(patch).eq('id', uid);
    if (error) {
      throw friendlyError(error);
    }
    await get().refreshProfile();
  },
}));

export default useAuthStore;
