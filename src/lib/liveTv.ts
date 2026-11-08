// @ts-nocheck
import {fetchLiveTvSources} from './services/remoteConfig';

export interface LiveChannel {
  id: string;
  name: string;
  logo?: string;
  url: string;
  category: string;
  headers?: Record<string, string>;
}

type Obj = Record<string, any>;
const isObj = (v: any): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: any): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const pick = (o: Obj, keys: string[]): string => {
  for (const k of keys) {
    const d = str(o[k]);
    if (d) return d;
    if (isObj(o[k])) {
      const inner = str(o[k].url) || str(o[k].src) || str(o[k].link);
      if (inner) return inner;
    }
  }
  return '';
};

const NAME_KEYS = ['name', 'title', 'channel', 'channel_name', 'channelName', 'n'];
const URL_KEYS = ['url', 'stream', 'streamUrl', 'stream_url', 'link', 'src', 'source', 'm3u8', 'hls', 'file', 'video', 'play_url', 'playUrl'];
const LOGO_KEYS = ['logo', 'image', 'icon', 'poster', 'thumbnail', 'thumb', 'tvg_logo', 'tvgLogo', 'logo_url', 'logoUrl'];
const CAT_KEYS = ['category', 'group', 'group_title', 'groupTitle', 'genre', 'categoryName', 'category_name', 'cat'];
const LIST_KEYS = ['channels', 'streams', 'items', 'data', 'list', 'results'];
const GROUP_KEYS = ['categories', 'groups', 'playlists'];

const readHeaders = (o: Obj) => {
  const out: Record<string, string> = {};
  const raw = o.headers || o.http_headers || o.httpHeaders;
  if (isObj(raw)) Object.entries(raw).forEach(([k, v]) => str(v) && (out[k] = str(v)));
  const ua = pick(o, ['userAgent', 'user_agent', 'user-agent', 'ua']);
  const ref = pick(o, ['referer', 'referrer']);
  const origin = pick(o, ['origin']);
  if (ua) out['User-Agent'] = ua;
  if (ref) out.Referer = ref;
  if (origin) out.Origin = origin;
  return Object.keys(out).length ? out : undefined;
};

const toChannel = (raw: any, sourceId: string, index: number, fallback: string): LiveChannel | null => {
  if (!isObj(raw)) return null;
  const url = pick(raw, URL_KEYS);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: `${sourceId}:${index}`,
    name: pick(raw, NAME_KEYS) || `Channel ${index + 1}`,
    url,
    logo: pick(raw, LOGO_KEYS) || undefined,
    category: pick(raw, CAT_KEYS) || fallback,
    headers: readHeaders(raw),
  };
};

const parseJson = (data: any, sourceId: string, fallback: string): LiveChannel[] => {
  const out: LiveChannel[] = [];
  const push = (list: any[], cat: string) =>
    list.forEach(item => {
      const ch = toChannel(item, sourceId, out.length, cat);
      if (ch) out.push(ch);
    });
  const listKey = (g: Obj) => LIST_KEYS.find(k => Array.isArray(g[k]));
  if (Array.isArray(data)) {
    const groups = data.filter(d => isObj(d) && listKey(d));
    if (groups.length && groups.length === data.length) {
      groups.forEach(g => push(g[listKey(g)!], pick(g, NAME_KEYS) || pick(g, CAT_KEYS) || fallback));
    } else push(data, fallback);
    return out;
  }
  if (isObj(data)) {
    for (const k of GROUP_KEYS) {
      if (Array.isArray(data[k])) {
        data[k].forEach((g: any) => {
          if (isObj(g) && listKey(g)) push(g[listKey(g)!], pick(g, NAME_KEYS) || pick(g, CAT_KEYS) || fallback);
        });
        if (out.length) return out;
      }
    }
    for (const k of LIST_KEYS) {
      if (Array.isArray(data[k])) {
        push(data[k], fallback);
        if (out.length) return out;
      }
    }
    Object.entries(data).forEach(([cat, v]) => Array.isArray(v) && push(v, cat));
  }
  return out;
};

const parseM3u = (text: string, sourceId: string, fallback: string): LiveChannel[] => {
  const out: LiveChannel[] = [];
  let pending: any = null;
  let headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith('#EXTINF')) {
      const attr = (n: string) => (new RegExp(`${n}="([^"]*)"`, 'i').exec(l) || [])[1] || '';
      pending = {name: l.slice(l.lastIndexOf(',') + 1).trim() || attr('tvg-name'), logo: attr('tvg-logo') || undefined, category: attr('group-title') || fallback};
      headers = {};
    } else if (l.startsWith('#EXTVLCOPT:http-user-agent=')) headers['User-Agent'] = l.split('=').slice(1).join('=');
    else if (l.startsWith('#EXTVLCOPT:http-referrer=')) headers.Referer = l.split('=').slice(1).join('=');
    else if (/^https?:\/\//i.test(l) && pending) {
      out.push({id: `${sourceId}:${out.length}`, name: pending.name || `Channel ${out.length + 1}`, logo: pending.logo, url: l, category: pending.category, headers: Object.keys(headers).length ? headers : undefined});
      pending = null;
    }
  }
  return out;
};

export const parseChannelList = (text: string, sourceId: string, fallback: string): LiveChannel[] => {
  const t = text.replace(/^\uFEFF/, '').trim();
  if (t.startsWith('#EXTM3U') || t.startsWith('#EXTINF')) return parseM3u(t, sourceId, fallback);
  try {
    return parseJson(JSON.parse(t), sourceId, fallback);
  } catch {
    return [];
  }
};

export const loadLiveChannels = async () => {
  const sources = await fetchLiveTvSources();
  const results = await Promise.allSettled(
    sources.map(async s => {
      const res = await fetch(s.url, {signal: AbortSignal.timeout(20000)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseChannelList(await res.text(), s.id, s.label || 'Other');
    }),
  );
  const channels: LiveChannel[] = [];
  let failed = 0;
  results.forEach(r => (r.status === 'fulfilled' && r.value.length ? channels.push(...r.value) : (failed += 1)));
  return {channels, failed, noSources: sources.length === 0};
};

export const guessMime = (url: string): string => {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.mpd')) return 'application/dash+xml';
  if (u.endsWith('.mp4') || u.endsWith('.mkv')) return 'video/mp4';
  return 'application/x-mpegURL';
};

/** Player state for a live channel (the player's own state shape). */
export const liveChannelPlayerState = (ch: LiveChannel) => ({
  episodeList: [{id: ch.url, link: ch.url, title: ch.name}],
  linkIndex: 0,
  primaryTitle: ch.name,
  secondaryTitle: ch.category,
  type: 'movie',
  poster: {logo: ch.logo, poster: ch.logo},
  providerValue: 'live',
  infoUrl: `live:${ch.id}`,
  doNotTrack: true,
  live: true,
  liveStream: {server: 'Live', link: ch.url, type: 'm3u8', headers: ch.headers},
});
