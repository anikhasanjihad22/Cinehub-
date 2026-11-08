// @ts-nocheck
import {create} from 'zustand';
import {supabase} from '../supabase';
import useAuthStore from '../zustand/authStore';

/**
 * Watch Together: a room is a Supabase Realtime broadcast channel. Same
 * protocol as the Android and TV apps, so phones, TVs and PCs share a room.
 */

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
export interface PartyPlayback {
  playing: boolean;
  position: number;
  receivedAt: number;
  seq: number;
  kind: 'play' | 'tick';
}

interface PartyState {
  code: string | null;
  status: 'idle' | 'connecting' | 'connected';
  isHost: boolean;
  hostOnly: boolean;
  members: PartyMember[];
  content: {params: any; title: string} | null;
  remote: PartyPlayback | null;
  chat: PartyChatMessage[];
  reactions: PartyReaction[];
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setHostOnly: (v: boolean) => void;
  sendContent: (params: any, title: string) => void;
  sendPlayback: (kind: 'play' | 'tick', playing: boolean, position: number) => void;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  dropReaction: (id: string) => void;
  registerSnapshot: (fn: (() => {playing: boolean; position: number}) | null) => void;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({length: 6}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normalizeCode = (raw: string) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

let channel: any = null;
let myKey = '';
let snapshotFn: any = null;
let seq = 0;
let uid = 0;
const nextId = () => `${Date.now()}-${uid++}`;

const send = (payload: Record<string, any>) => {
  if (channel) channel.send({type: 'broadcast', event: 'p', payload: {...payload, from: myKey}});
};

const identity = () => {
  const {profile, user} = useAuthStore.getState();
  return {
    name: (profile && profile.display_name && String(profile.display_name).trim()) || (user && user.email && user.email.split('@')[0]) || 'Guest',
    color: (profile && profile.avatar_color) || null,
  };
};

const usePartyStore = create<PartyState>((set, get) => {
  const readMembers = () => {
    if (!channel) return;
    const state = channel.presenceState();
    const members: PartyMember[] = Object.entries(state).map(([key, metas]: any) => ({
      key,
      name: (metas[0] && metas[0].name) || 'Guest',
      color: metas[0] && metas[0].color,
      host: !!(metas[0] && metas[0].host),
    }));
    members.sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
    set({members});
  };

  const announce = () => {
    const {content, hostOnly} = get();
    send({t: 'cfg', hostOnly});
    if (content) send({t: 'content', params: content.params, title: content.title});
    const snap = snapshotFn && snapshotFn();
    if (snap) send({t: 'play', kind: 'play', playing: snap.playing, position: snap.position});
  };

  const open = async (code: string, host: boolean) => {
    if (get().status !== 'idle') await get().leaveRoom();
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Sign in first.');
    myKey = `${user.id}:${Math.random().toString(36).slice(2, 6)}`;
    set({code, status: 'connecting', isHost: host, hostOnly: false, members: [], content: null, remote: null, chat: [], reactions: []});

    const ch = supabase.channel(`cinehub-party:${code}`, {config: {broadcast: {self: false}, presence: {key: myKey}}});
    channel = ch;
    const fromHost = (from: string) => !!get().members.find(m => m.key === from && m.host);

    ch.on('broadcast', {event: 'p'}, ({payload}: any) => {
      const msg = payload || {};
      const from = String(msg.from || '');
      switch (msg.t) {
        case 'content':
          set({content: {params: msg.params, title: String(msg.title || '')}});
          break;
        case 'cfg':
          set({hostOnly: !!msg.hostOnly});
          break;
        case 'play':
          if (get().hostOnly && !fromHost(from)) break;
          seq += 1;
          set({remote: {playing: !!msg.playing, position: Number(msg.position) || 0, receivedAt: Date.now(), seq, kind: msg.kind === 'tick' ? 'tick' : 'play'}});
          break;
        case 'chat':
          set(s => ({chat: [...s.chat.slice(-79), {id: String(msg.id), name: String(msg.name), text: String(msg.text), mine: false}]}));
          break;
        case 'react':
          set(s => ({reactions: [...s.reactions.slice(-11), {id: nextId(), emoji: String(msg.emoji), name: String(msg.name)}]}));
          break;
        default:
          break;
      }
    });
    ch.on('presence', {event: 'sync'}, readMembers);
    ch.on('presence', {event: 'join'}, () => {
      if (get().isHost) setTimeout(announce, 400);
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not connect. Check your internet.')), 12000);
      ch.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          const info = identity();
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
      await new Promise(r => setTimeout(r, 1800));
      readMembers();
      if (!get().members.some(m => m.host)) throw new Error('Room not found. Check the code and try again.');
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
      if (code.length !== 6) throw new Error('Enter the 6 character room code.');
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
      set({code: null, status: 'idle', isHost: false, hostOnly: false, members: [], content: null, remote: null, chat: [], reactions: []});
      if (ch) {
        try {
          await ch.untrack();
          await supabase.removeChannel(ch);
        } catch {
          // already gone
        }
      }
    },
    setHostOnly: v => {
      if (!get().isHost) return;
      set({hostOnly: v});
      send({t: 'cfg', hostOnly: v});
    },
    sendContent: (params, title) => {
      if (!get().isHost) return;
      set({content: {params, title}});
      send({t: 'content', params, title});
    },
    sendPlayback: (kind, playing, position) => {
      const {isHost, hostOnly, status} = get();
      if (status !== 'connected' || (hostOnly && !isHost)) return;
      send({t: 'play', kind, playing, position});
    },
    sendChat: text => {
      const t = String(text || '').trim().slice(0, 300);
      if (!t || !channel) return;
      const id = nextId();
      const name = identity().name;
      set(s => ({chat: [...s.chat.slice(-79), {id, name, text: t, mine: true}]}));
      send({t: 'chat', id, name, text: t});
    },
    sendReaction: emoji => {
      const name = identity().name;
      set(s => ({reactions: [...s.reactions.slice(-11), {id: nextId(), emoji, name}]}));
      send({t: 'react', emoji, name});
    },
    dropReaction: id => set(s => ({reactions: s.reactions.filter(r => r.id !== id)})),
    registerSnapshot: fn => {
      snapshotFn = fn;
    },
  };
});

/** Mobile-compatible party params -> this app's player state. */
export const partyParamsToPlayerState = (p: any) => {
  if (p && p.directUrl && p.externalVideo) {
    const ev = p.externalVideo;
    const type = /mpegurl/i.test(ev.mimeType || '') ? 'm3u8' : '';
    return {
      episodeList: [{id: p.directUrl, link: p.directUrl, title: p.primaryTitle}],
      linkIndex: 0,
      primaryTitle: p.primaryTitle || 'Live',
      secondaryTitle: p.secondaryTitle,
      type: 'movie',
      poster: p.poster,
      providerValue: 'live',
      infoUrl: `live:${p.directUrl}`,
      doNotTrack: true,
      live: !!ev.live,
      liveStream: {server: 'Live', link: p.directUrl, type, headers: ev.headers},
    };
  }
  const ep = p.episodeList && p.episodeList[p.linkIndex];
  return {
    episodeList: p.episodeList || [],
    linkIndex: p.linkIndex || 0,
    primaryTitle: p.primaryTitle,
    secondaryTitle: p.secondaryTitle,
    type: p.type || 'movie',
    poster: p.poster,
    providerValue: p.providerValue,
    infoUrl: p.infoUrl || `party:${p.primaryTitle}:${ep && ep.link}`,
    doNotTrack: true,
  };
};

export default usePartyStore;
