import {create} from 'zustand';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {supabase} from '../supabase';
import useAuthStore from '../zustand/authStore';
import type {RootStackParamList} from '../../App';

/**
 * Watch Together: a room is a Supabase Realtime broadcast channel (free tier,
 * no tables). Everyone in the room runs the app; the host's content is opened
 * on every device and play / pause / seek are kept in sync.
 */

export type PartyParams = RootStackParamList['Player'];

export interface PartyMember {
  key: string;
  name: string;
  color?: string | null;
  host: boolean;
}

export interface PartyChatMessage {
  id: string;
  name: string;
  text: string;
  mine: boolean;
}

export interface PartyReaction {
  id: string;
  emoji: string;
  name: string;
}

interface PartyContent {
  params: PartyParams;
  title: string;
}

export interface PartyPlayback {
  playing: boolean;
  position: number;
  receivedAt: number;
  seq: number;
  kind: 'play' | 'tick';
}

type Status = 'idle' | 'connecting' | 'connected';

interface PartyState {
  code: string | null;
  status: Status;
  isHost: boolean;
  hostOnly: boolean;
  members: PartyMember[];
  content: PartyContent | null;
  remote: PartyPlayback | null;
  chat: PartyChatMessage[];
  reactions: PartyReaction[];
  error: string;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setHostOnly: (value: boolean) => void;
  sendContent: (params: PartyParams, title: string) => void;
  sendPlayback: (kind: 'play' | 'tick', playing: boolean, position: number) => void;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  dropReaction: (id: string) => void;
  /** Host: lets the party read the live player state for newcomers. */
  registerSnapshot: (fn: (() => {playing: boolean; position: number}) | null) => void;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () =>
  Array.from({length: 6}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

let channel: RealtimeChannel | null = null;
let myKey = '';
let snapshotFn: (() => {playing: boolean; position: number}) | null = null;
let seq = 0;
let uid = 0;
const nextId = () => `${Date.now()}-${uid++}`;

const send = (payload: Record<string, unknown>) => {
  channel?.send({type: 'broadcast', event: 'p', payload: {...payload, from: myKey}});
};

const profileInfo = () => {
  const {profile, user} = useAuthStore.getState();
  return {
    name:
      profile?.display_name?.trim() ||
      user?.email?.split('@')[0] ||
      'Guest',
    color: (profile as {avatar_color?: string | null} | null)?.avatar_color ?? null,
  };
};

const usePartyStore = create<PartyState>((set, get) => {
  const readMembers = () => {
    if (!channel) {
      return;
    }
    const state = channel.presenceState() as Record<
      string,
      Array<{name?: string; color?: string | null; host?: boolean}>
    >;
    const members: PartyMember[] = Object.entries(state).map(([key, metas]) => ({
      key,
      name: metas[0]?.name || 'Guest',
      color: metas[0]?.color,
      host: !!metas[0]?.host,
    }));
    members.sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
    set({members});
  };

  const announceTo = () => {
    // Host brings a newcomer up to date.
    const {content, hostOnly} = get();
    send({t: 'cfg', hostOnly});
    if (content) {
      send({t: 'content', params: content.params, title: content.title});
    }
    const snap = snapshotFn?.();
    if (snap) {
      send({t: 'play', kind: 'play', playing: snap.playing, position: snap.position});
    }
  };

  const isFromHost = (from: string) =>
    !!get().members.find(m => m.key === from)?.host;

  const open = async (code: string, host: boolean) => {
    if (get().status !== 'idle') {
      await get().leaveRoom();
    }
    const user = useAuthStore.getState().user;
    if (!user) {
      throw new Error('Sign in first.');
    }
    myKey = `${user.id}:${Math.random().toString(36).slice(2, 6)}`;
    set({
      code,
      status: 'connecting',
      isHost: host,
      hostOnly: false,
      members: [],
      content: null,
      remote: null,
      chat: [],
      reactions: [],
      error: '',
    });

    const ch = supabase.channel(`cinehub-party:${code}`, {
      config: {broadcast: {self: false}, presence: {key: myKey}},
    });
    channel = ch;

    ch.on('broadcast', {event: 'p'}, ({payload}) => {
      const msg = payload as Record<string, any>;
      const from = String(msg.from ?? '');
      switch (msg.t) {
        case 'content':
          // only the host ever sends this
          set({content: {params: msg.params, title: String(msg.title ?? '')}});
          break;
        case 'cfg':
          set({hostOnly: !!msg.hostOnly});
          break;
        case 'play': {
          if (get().hostOnly && !isFromHost(from)) {
            break;
          }
          seq += 1;
          set({
            remote: {
              playing: !!msg.playing,
              position: Number(msg.position) || 0,
              receivedAt: Date.now(),
              seq,
              kind: msg.kind === 'tick' ? 'tick' : 'play',
            },
          });
          break;
        }
        case 'chat':
          set(s => ({
            chat: [
              ...s.chat.slice(-79),
              {id: String(msg.id), name: String(msg.name), text: String(msg.text), mine: false},
            ],
          }));
          break;
        case 'react':
          set(s => ({
            reactions: [
              ...s.reactions.slice(-11),
              {id: nextId(), emoji: String(msg.emoji), name: String(msg.name)},
            ],
          }));
          break;
      }
    });

    ch.on('presence', {event: 'sync'}, readMembers);
    ch.on('presence', {event: 'join'}, ({newPresences}) => {
      const someoneNew = (newPresences as Array<{presence_ref?: string}>).length > 0;
      if (get().isHost && someoneNew) {
        setTimeout(announceTo, 400);
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not connect. Check your internet.')), 12000);
      ch.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          const info = profileInfo();
          await ch.track({name: info.name, color: info.color, host});
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error('Could not connect. Check your internet.'));
        }
      });
    });

    if (!host) {
      // Joiners need a host in the room, otherwise the code is wrong.
      await new Promise(r => setTimeout(r, 1800));
      readMembers();
      if (!get().members.some(m => m.host)) {
        throw new Error('Room not found. Check the code and try again.');
      }
    }
    set({status: 'connected'});
  };

  return {
    code: null,
    status: 'idle',
    isHost: false,
    hostOnly: false,
    members: [],
    content: null,
    remote: null,
    chat: [],
    reactions: [],
    error: '',

    createRoom: async () => {
      try {
        await open(randomCode(), true);
      } catch (e) {
        await get().leaveRoom();
        throw e;
      }
    },

    joinRoom: async raw => {
      const code = normalizeCode(raw);
      if (code.length !== 6) {
        throw new Error('Enter the 6 character room code.');
      }
      try {
        await open(code, false);
      } catch (e) {
        await get().leaveRoom();
        throw e;
      }
    },

    leaveRoom: async () => {
      const ch = channel;
      channel = null;
      snapshotFn = null;
      set({
        code: null,
        status: 'idle',
        isHost: false,
        hostOnly: false,
        members: [],
        content: null,
        remote: null,
        chat: [],
        reactions: [],
      });
      if (ch) {
        try {
          await ch.untrack();
          await supabase.removeChannel(ch);
        } catch {
          // already gone
        }
      }
    },

    setHostOnly: value => {
      if (!get().isHost) {
        return;
      }
      set({hostOnly: value});
      send({t: 'cfg', hostOnly: value});
    },

    sendContent: (params, title) => {
      if (!get().isHost) {
        return;
      }
      set({content: {params, title}});
      send({t: 'content', params, title});
    },

    sendPlayback: (kind, playing, position) => {
      const {isHost, hostOnly, status} = get();
      if (status !== 'connected' || (hostOnly && !isHost)) {
        return;
      }
      send({t: 'play', kind, playing, position});
    },

    sendChat: text => {
      const trimmed = text.trim().slice(0, 300);
      if (!trimmed || !channel) {
        return;
      }
      const id = nextId();
      const name = profileInfo().name;
      set(s => ({chat: [...s.chat.slice(-79), {id, name, text: trimmed, mine: true}]}));
      send({t: 'chat', id, name, text: trimmed});
    },

    sendReaction: emoji => {
      const name = profileInfo().name;
      set(s => ({
        reactions: [...s.reactions.slice(-11), {id: nextId(), emoji, name}],
      }));
      send({t: 'react', emoji, name});
    },

    dropReaction: id => set(s => ({reactions: s.reactions.filter(r => r.id !== id)})),

    registerSnapshot: fn => {
      snapshotFn = fn;
    },
  };
});

export default usePartyStore;
