import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL, SUPABASE_KEY, TMDB_API, TMDB_IMG} from './config.js';
import {pref} from './lib.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false},
});

/* ───────────── auth ───────────── */

export const friendlyError = error => {
  const m = String(error?.message || error || '').toLowerCase();
  if (m.includes('invalid login')) return new Error('Wrong email or password.');
  if (m.includes('email not confirmed')) return new Error('Please confirm your email first, then sign in.');
  if (m.includes('already registered')) return new Error('That email already has an account. Try signing in.');
  if (m.includes('password') && m.includes('characters')) return new Error('Password is too short (use at least 6 characters).');
  if (m.includes('rate limit')) return new Error('Too many attempts. Please wait a minute and try again.');
  if (m.includes('failed to fetch') || m.includes('network')) return new Error('No internet connection.');
  return error instanceof Error ? error : new Error(String(error?.message || error));
};

export const signIn = async (email, password) => {
  const {error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
  if (error) throw friendlyError(error);
};

export const signUp = async (email, password, name) => {
  const {data, error} = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {data: {display_name: name.trim()}},
  });
  if (error) throw friendlyError(error);
  return {needsEmailConfirmation: !data.session};
};

export const sendResetCode = async email => {
  const {error} = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw friendlyError(error);
};

export const resetWithCode = async (email, code, password) => {
  const {error: verifyError} = await supabase.auth.verifyOtp({email: email.trim(), token: code.trim(), type: 'recovery'});
  if (verifyError) throw new Error('That code is wrong or has expired. Request a new one.');
  const {error} = await supabase.auth.updateUser({password});
  if (error) throw friendlyError(error);
  await supabase.auth.signOut({scope: 'local'}).catch(() => {});
};

export const signOut = async () => {
  await supabase.auth.signOut({scope: 'local'}).catch(() => {});
  await window.cinehub.providers.clear().catch(() => {});
};

export const fetchProfile = async userId => {
  const {data} = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data || null;
};

/* ───────────── admin-managed config ───────────── */

export const fetchServers = async () => {
  const {data, error} = await supabase
    .from('cinehub_servers')
    .select('*')
    .eq('enabled', true)
    .order('position', {ascending: true})
    .order('created_at', {ascending: true});
  if (error) throw new Error(error.message);
  return data ?? [];
};

const fetchSetting = async key => {
  const {data, error} = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return String(data?.value ?? '');
};

export const fetchTmdbKey = async () => (await fetchSetting('tmdb_api_key')).trim();

export const fetchLiveSources = async () => {
  const raw = await fetchSetting('live_tv_sources');
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((x, i) => ({id: String(x?.id || `src${i}`), label: String(x?.label || '').trim(), url: String(x?.url || '').trim()}))
    .filter(x => /^https?:\/\//i.test(x.url));
};

/** Installs the admin's servers into the provider engine; falls back to what is already installed. */
export const syncServers = async () => {
  let errors = [];
  try {
    const servers = await fetchServers();
    const result = await window.cinehub.providers.sync(servers);
    errors = result.errors;
  } catch (error) {
    errors = [error.message];
  }
  const providers = await window.cinehub.providers.list();
  return {providers, errors};
};

/* ───────────── TMDB ───────────── */

let tmdbKey = '';
export const setTmdbKey = key => (tmdbKey = key);
export const hasTmdbKey = () => Boolean(tmdbKey);

const tmdb = async (path, params = {}, signal) => {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set('api_key', tmdbKey);
  url.searchParams.set('language', 'en-US');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url, {signal});
  if (res.status === 401) throw new Error('The TMDB API key is invalid. Ask the admin to update it.');
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
};

const discover = (type, params) => ({
  path: `/discover/${type}`,
  params: {sort_by: 'popularity.desc', 'vote_count.gte': 20, ...params},
});

// Same rows as the Android home screen.
export const TMDB_ROWS = [
  {id: 'trending', title: 'Trending Now', path: '/trending/all/week', type: 'mixed'},
  {id: 'popular-movie', title: 'Popular Movies', path: '/movie/popular', type: 'movie'},
  {id: 'popular-tv', title: 'Popular Series', path: '/tv/popular', type: 'tv'},
  {id: 'bangla', title: 'Bangla Picks', type: 'movie', ...discover('movie', {with_original_language: 'bn'})},
  {id: 'hindi', title: 'Hindi Hits', type: 'movie', ...discover('movie', {with_original_language: 'hi'})},
  {id: 'top-movie', title: 'Top Rated Movies', path: '/movie/top_rated', type: 'movie'},
  {id: 'top-tv', title: 'Top Rated Series', path: '/tv/top_rated', type: 'tv'},
  {id: 'now-playing', title: 'Now In Theaters', path: '/movie/now_playing', type: 'movie'},
  {id: 'on-air', title: 'On The Air', path: '/tv/on_the_air', type: 'tv'},
  {id: 'action', title: 'Action & Adventure', type: 'movie', ...discover('movie', {with_genres: 28})},
  {id: 'comedy', title: 'Comedy', type: 'movie', ...discover('movie', {with_genres: 35})},
  {id: 'horror', title: 'Horror', type: 'movie', ...discover('movie', {with_genres: 27})},
  {id: 'scifi', title: 'Sci-Fi', type: 'movie', ...discover('movie', {with_genres: 878})},
  {id: 'animation', title: 'Animation', type: 'movie', ...discover('movie', {with_genres: 16})},
  {id: 'kdrama', title: 'Korean Dramas', type: 'tv', ...discover('tv', {with_original_language: 'ko'})},
  {id: 'upcoming', title: 'Coming Soon', path: '/movie/upcoming', type: 'movie'},
];

export const toTitle = (item, rowType = 'mixed') => {
  const type = rowType === 'mixed' ? (item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : undefined) : rowType;
  const title = item.title || item.name;
  if (!type || !item.id || !title) return null;
  const date = item.release_date || item.first_air_date || '';
  return {
    key: `${type}:${item.id}`,
    id: item.id,
    type,
    title,
    year: date.slice(0, 4),
    poster: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : '',
    backdrop: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : '',
    overview: item.overview || '',
    rating: item.vote_average ? item.vote_average.toFixed(1) : '',
  };
};

export const fetchRow = async (row, signal) => {
  const pages = await Promise.all(
    [1, 2].map(page => tmdb(row.path, {...(row.params || {}), page}, signal).catch(e => {
      if (page === 1) throw e;
      return {results: []};
    })),
  );
  const seen = new Set();
  const out = [];
  for (const page of pages) {
    for (const item of page.results ?? []) {
      const t = toTitle(item, row.type);
      if (t && t.poster && !seen.has(t.key)) {
        seen.add(t.key);
        out.push(t);
      }
    }
  }
  return out;
};

export const searchTmdb = async (query, signal) => {
  const data = await tmdb('/search/multi', {query, include_adult: 'false', page: 1}, signal);
  return (data.results ?? []).map(i => toTitle(i)).filter(t => t && t.poster);
};

export const fetchDetails = async (type, id, signal) => {
  const d = await tmdb(`/${type}/${id}`, {append_to_response: 'images,credits', include_image_language: 'en,null'}, signal);
  const logo = (d.images?.logos ?? []).find(l => l.iso_639_1 === 'en') ?? d.images?.logos?.[0];
  const base = toTitle({...d, media_type: type}, type) || {key: `${type}:${id}`, id, type};
  return {
    ...base,
    title: d.title || d.name || base.title,
    overview: d.overview || '',
    tagline: d.tagline || '',
    genres: (d.genres ?? []).map(g => g.name),
    runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0,
    seasons: d.number_of_seasons || 0,
    backdrop: d.backdrop_path ? `${TMDB_IMG}/w1280${d.backdrop_path}` : base.backdrop,
    poster: d.poster_path ? `${TMDB_IMG}/w500${d.poster_path}` : base.poster,
    logo: logo ? `${TMDB_IMG}/w500${logo.file_path}` : '',
    cast: (d.credits?.cast ?? []).slice(0, 8).map(c => c.name),
  };
};

/* ───────────── matching a TMDB title on a server ───────────── */

const normalize = text =>
  String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const scorePost = (post, title, year) => {
  const candidate = normalize(post.title);
  const wanted = normalize(title);
  if (!candidate || !wanted) return 0;
  let score = 0;
  if (candidate === wanted) score = 100;
  else if (candidate.startsWith(wanted + ' ')) score = 80;
  else if ((' ' + candidate + ' ').includes(' ' + wanted + ' ')) score = 60;
  if (score > 0 && year && candidate.includes(year)) score += 15;
  return score;
};

export const bestMatch = (posts, title, year) => {
  let best = null;
  let bestScore = 0;
  for (const p of posts) {
    const s = scorePost(p, title, year);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return bestScore >= 60 ? best : null;
};

export const currentServerId = () => pref.get('server', null);
