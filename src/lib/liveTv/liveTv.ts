import {mainStorage} from '../storage/StorageService';
import type {RootStackParamList} from '../../App';

export interface LiveSource {
  id: string;
  /** Shown to admins; also used as the category for channels that have none. */
  label: string;
  /** Link to a JSON (or M3U) channel list. */
  url: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  logo?: string;
  url: string;
  category: string;
  headers?: Record<string, string>;
}

const CACHE_KEY = 'live-tv-channels-v1';
const FALLBACK_CATEGORY = 'Other';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => {
  if (typeof v === 'string') {
    return v.trim();
  }
  if (typeof v === 'number') {
    return String(v);
  }
  return '';
};

const pick = (o: Obj, keys: string[]): string => {
  for (const k of keys) {
    const direct = str(o[k]);
    if (direct) {
      return direct;
    }
    const nested = o[k];
    if (isObj(nested)) {
      const inner = str(nested.url) || str(nested.src) || str(nested.link);
      if (inner) {
        return inner;
      }
    }
  }
  return '';
};

const NAME_KEYS = ['name', 'title', 'channel', 'channel_name', 'channelName', 'n'];
const URL_KEYS = [
  'url', 'stream', 'streamUrl', 'stream_url', 'link', 'src', 'source',
  'm3u8', 'hls', 'file', 'video', 'play_url', 'playUrl',
];
const LOGO_KEYS = [
  'logo', 'image', 'icon', 'poster', 'thumbnail', 'thumb', 'tvg_logo',
  'tvgLogo', 'logo_url', 'logoUrl',
];
const CATEGORY_KEYS = [
  'category', 'group', 'group_title', 'groupTitle', 'genre', 'categoryName',
  'category_name', 'cat',
];

const readHeaders = (o: Obj): Record<string, string> | undefined => {
  const out: Record<string, string> = {};
  const raw = o.headers ?? o.http_headers ?? o.httpHeaders;
  if (isObj(raw)) {
    Object.entries(raw).forEach(([k, v]) => {
      const value = str(v);
      if (value) {
        out[k] = value;
      }
    });
  }
  const ua = pick(o, ['userAgent', 'user_agent', 'user-agent', 'ua']);
  const referer = pick(o, ['referer', 'referrer']);
  const origin = pick(o, ['origin']);
  if (ua) {
    out['User-Agent'] = ua;
  }
  if (referer) {
    out.Referer = referer;
  }
  if (origin) {
    out.Origin = origin;
  }
  return Object.keys(out).length ? out : undefined;
};

const toChannel = (
  raw: unknown,
  sourceId: string,
  index: number,
  fallbackCategory: string,
): LiveChannel | null => {
  if (!isObj(raw)) {
    return null;
  }
  const url = pick(raw, URL_KEYS);
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  const name = pick(raw, NAME_KEYS) || `Channel ${index + 1}`;
  return {
    id: `${sourceId}:${index}`,
    name,
    url,
    logo: pick(raw, LOGO_KEYS) || undefined,
    category: pick(raw, CATEGORY_KEYS) || fallbackCategory,
    headers: readHeaders(raw),
  };
};

const CHANNEL_LIST_KEYS = ['channels', 'streams', 'items', 'data', 'list', 'results'];
const GROUP_LIST_KEYS = ['categories', 'groups', 'playlists'];

/** Accepts the common channel-list layouts and flattens them. */
const parseJson = (data: unknown, sourceId: string, fallback: string): LiveChannel[] => {
  const out: LiveChannel[] = [];
  const push = (list: unknown[], category: string) =>
    list.forEach(item => {
      const ch = toChannel(item, sourceId, out.length, category);
      if (ch) {
        out.push(ch);
      }
    });

  if (Array.isArray(data)) {
    // [{channel…}] or [{name, channels:[…]}]
    const groups = data.filter(
      d => isObj(d) && CHANNEL_LIST_KEYS.some(k => Array.isArray(d[k])),
    ) as Obj[];
    if (groups.length && groups.length === data.length) {
      groups.forEach(g => {
        const key = CHANNEL_LIST_KEYS.find(k => Array.isArray(g[k]))!;
        push(g[key] as unknown[], pick(g, NAME_KEYS) || pick(g, CATEGORY_KEYS) || fallback);
      });
    } else {
      push(data, fallback);
    }
    return out;
  }

  if (isObj(data)) {
    for (const k of GROUP_LIST_KEYS) {
      const groups = data[k];
      if (Array.isArray(groups)) {
        groups.forEach(g => {
          if (!isObj(g)) {
            return;
          }
          const key = CHANNEL_LIST_KEYS.find(x => Array.isArray(g[x]));
          if (key) {
            push(g[key] as unknown[], pick(g, NAME_KEYS) || pick(g, CATEGORY_KEYS) || fallback);
          }
        });
        if (out.length) {
          return out;
        }
      }
    }
    for (const k of CHANNEL_LIST_KEYS) {
      if (Array.isArray(data[k])) {
        push(data[k] as unknown[], fallback);
        if (out.length) {
          return out;
        }
      }
    }
    // { "News": [ … ], "Sports": [ … ] }
    Object.entries(data).forEach(([category, value]) => {
      if (Array.isArray(value)) {
        push(value, category);
      }
    });
  }
  return out;
};

const parseM3u = (text: string, sourceId: string, fallback: string): LiveChannel[] => {
  const out: LiveChannel[] = [];
  let pending: {name: string; logo?: string; category: string} | null = null;
  let headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith('#EXTINF')) {
      const attr = (n: string) =>
        new RegExp(`${n}="([^"]*)"`, 'i').exec(l)?.[1]?.trim() || '';
      pending = {
        name: l.slice(l.lastIndexOf(',') + 1).trim() || attr('tvg-name'),
        logo: attr('tvg-logo') || undefined,
        category: attr('group-title') || fallback,
      };
      headers = {};
    } else if (l.startsWith('#EXTVLCOPT:http-user-agent=')) {
      headers['User-Agent'] = l.split('=').slice(1).join('=');
    } else if (l.startsWith('#EXTVLCOPT:http-referrer=')) {
      headers.Referer = l.split('=').slice(1).join('=');
    } else if (/^https?:\/\//i.test(l) && pending) {
      out.push({
        id: `${sourceId}:${out.length}`,
        name: pending.name || `Channel ${out.length + 1}`,
        logo: pending.logo,
        url: l,
        category: pending.category,
        headers: Object.keys(headers).length ? headers : undefined,
      });
      pending = null;
    }
  }
  return out;
};

export const parseChannelList = (
  text: string,
  sourceId: string,
  fallbackCategory: string,
): LiveChannel[] => {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXTINF')) {
    return parseM3u(trimmed, sourceId, fallbackCategory);
  }
  try {
    return parseJson(JSON.parse(trimmed), sourceId, fallbackCategory);
  } catch {
    return [];
  }
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {Accept: 'application/json, text/plain, */*'},
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

export interface LiveLoadResult {
  channels: LiveChannel[];
  /** Links that failed, so the UI can say so instead of showing nothing. */
  failed: number;
}

export const loadLiveChannels = async (
  sources: LiveSource[],
): Promise<LiveLoadResult> => {
  const results = await Promise.allSettled(
    sources.map(async s =>
      parseChannelList(await fetchText(s.url), s.id, s.label || FALLBACK_CATEGORY),
    ),
  );
  const channels: LiveChannel[] = [];
  let failed = 0;
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.length) {
      channels.push(...r.value);
    } else {
      failed += 1;
    }
  });
  return {channels, failed};
};

export const readCachedChannels = (): LiveChannel[] => {
  try {
    const raw = mainStorage.getString(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LiveChannel[]) : [];
  } catch {
    return [];
  }
};

export const writeCachedChannels = (channels: LiveChannel[]): void => {
  try {
    mainStorage.setString(CACHE_KEY, JSON.stringify(channels));
  } catch {
    // cache is best effort
  }
};

export const groupCategories = (
  channels: LiveChannel[],
): Array<{name: string; count: number}> => {
  const counts = new Map<string, number>();
  channels.forEach(c => counts.set(c.category, (counts.get(c.category) ?? 0) + 1));
  return [...counts.entries()].map(([name, count]) => ({name, count}));
};

const guessMime = (url: string): string => {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.mpd')) {
    return 'application/dash+xml';
  }
  if (u.endsWith('.mp4') || u.endsWith('.mkv')) {
    return 'video/mp4';
  }
  // .m3u8 and extension-less live URLs are almost always HLS
  return 'application/x-mpegURL';
};

/** Opens a channel in the app's normal player. */
export const liveChannelPlayerParams = (
  ch: LiveChannel,
): RootStackParamList['Player'] => ({
  linkIndex: 0,
  episodeList: [{id: ch.url, link: ch.url, title: ch.name}],
  directUrl: ch.url,
  externalVideo: {mimeType: guessMime(ch.url), headers: ch.headers, live: true},
  localContent: true,
  type: 'movie',
  primaryTitle: ch.name,
  secondaryTitle: ch.category,
  poster: {logo: ch.logo, poster: ch.logo},
  providerValue: 'local',
});
