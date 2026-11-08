'use strict';
const store = require('./store');
const jar = require('./generated/cookieJar.cjs');
const {createProviderSource, getProviderFilesUrl, isValidProviderPath} = require('./generated/helpers.cjs');
const {COMMON_HEADERS} = require('./http');

const REQUIRED = ['posts', 'meta', 'stream', 'catalog'];
const OPTIONAL = ['episodes', 'settings'];
const MAX_STATE_BYTES = 256000;

const idOf = (author, value) => `${author}::${value}`;
const meta = () => store.open('providers');
const modulesStore = () => store.open('provider-modules');

const http = async (url, timeoutMs = 15000) => {
  const res = await fetch(url, {
    headers: {'Cache-Control': 'no-cache', Pragma: 'no-cache', 'User-Agent': COMMON_HEADERS['User-Agent']},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} for ${url}`);
    error.status = res.status;
    throw error;
  }
  return res;
};

const errMessage = (error, fallback) =>
  (error instanceof Error && error.message) || (typeof error === 'string' && error) || fallback;

class ProviderService {
  constructor(bridge) {
    this.bridge = bridge;
    this.state = new Map();
    bridge.onState = (value, author, state) => {
      try {
        const s = JSON.stringify(state);
        if (s && s.length <= MAX_STATE_BYTES) this.state.set(idOf(author, value), JSON.parse(s));
      } catch { /* discard */ }
    };
  }

  installed() {
    return meta().get('installed', []);
  }

  /** Providers as the UI needs them (never exposes source URLs). */
  list() {
    return this.installed().map(p => ({id: idOf(p.source.author, p.value), value: p.value, name: p.display_name}));
  }

  find(id) {
    const all = this.installed();
    return all.find(p => idOf(p.source.author, p.value) === id) || all.find(p => p.value === id);
  }

  async fetchManifest(source) {
    const base = source.manifestUrl || `${source.url}/manifest.json`;
    const url = `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const res = await http(url, 10000);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid manifest format');
    return data
      .filter(item => item && item.value && (item.path == null || item.path === '' || isValidProviderPath(item.path)))
      .map(item => ({
        value: item.value,
        display_name: item.display_name,
        disabled: Boolean(item.disabled),
        version: String(item.version ?? '0'),
        ...(item.path ? {path: item.path} : {}),
      }));
  }

  async downloadModules(source, provider) {
    const filesUrl = getProviderFilesUrl(source.url, provider.value, provider.path);
    const modules = {};
    await Promise.all(
      [...REQUIRED, ...OPTIONAL].map(async name => {
        try {
          const url = `${filesUrl}/${name}.js?v=${encodeURIComponent(provider.version)}&t=${Date.now()}`;
          const text = await (await http(url)).text();
          if (!text.trim()) throw new Error(`Invalid module response: ${name}.js`);
          modules[name] = text;
        } catch (error) {
          if (REQUIRED.includes(name)) throw error;
          if (error.status !== 404 && error.status !== 410) throw error;
        }
      }),
    );
    return modules;
  }

  /**
   * Makes the installed providers match the admin's server list (same rules as
   * the Android app: removed/disabled servers are dropped, new ones installed,
   * changed versions updated, users only see the admin's label).
   */
  async sync(servers) {
    const errors = [];
    const wanted = new Set();
    let next = this.installed().slice();

    // drop everything that is no longer managed
    const authors = servers.map(s => ({s, source: this.toSource(s)})).filter(x => x.source);
    authors.forEach(x => wanted.add(x.source.author));
    next = next.filter(p => {
      const keep = wanted.has(p.source.author);
      if (!keep) modulesStore().delete(idOf(p.source.author, p.value));
      return keep;
    });

    for (const {s: server, source} of authors) {
      try {
        let manifest = (await this.fetchManifest(source)).filter(p => !p.disabled);
        if (server.provider_value?.trim()) manifest = manifest.filter(p => p.value === server.provider_value.trim());
        const hidden = new Set(server.hidden_providers ?? []);
        if (hidden.size) manifest = manifest.filter(p => !hidden.has(p.value));

        const total = manifest.length;
        const keep = new Set();
        for (let i = 0; i < manifest.length; i++) {
          const remote = manifest[i];
          keep.add(remote.value);
          const display_name = total > 1 ? `${server.label} ${i + 1}` : server.label;
          const existing = next.find(p => p.value === remote.value && p.source.author === source.author);
          const cached = modulesStore().get(idOf(source.author, remote.value));
          if (!existing || existing.version !== remote.version || !cached) {
            const modules = await this.downloadModules(source, remote);
            modulesStore().set(idOf(source.author, remote.value), modules);
            this.state.delete(idOf(source.author, remote.value));
          }
          const entry = {
            value: remote.value,
            display_name,
            version: remote.version,
            ...(remote.path ? {path: remote.path} : {}),
            source: {author: source.author, url: source.url, ...(source.manifestUrl ? {manifestUrl: source.manifestUrl} : {})},
            position: server.position ?? 0,
          };
          const idx = next.findIndex(p => p.value === remote.value && p.source.author === source.author);
          if (idx >= 0) next[idx] = entry;
          else next.push(entry);
        }
        next = next.filter(p => {
          if (p.source.author !== source.author || keep.has(p.value)) return true;
          modulesStore().delete(idOf(p.source.author, p.value));
          return false;
        });
      } catch (error) {
        errors.push(`${server.label}: ${errMessage(error, 'sync failed')}`);
      }
    }
    meta().set('installed', next);
    meta().flush();
    modulesStore().flush();
    return {providers: this.list(), errors};
  }

  toSource(server) {
    try {
      const parsed = createProviderSource(String(server.source_url || '').trim());
      const manifestUrl = server.manifest_url?.trim() || parsed.manifestUrl;
      return {
        author: `cinehub-${String(server.id).replace(/-/g, '').slice(0, 10)}`,
        url: parsed.url,
        ...(manifestUrl ? {manifestUrl} : {}),
      };
    } catch {
      return null;
    }
  }

  clear() {
    this.state.clear();
    meta().clear();
    modulesStore().clear();
    store.open('cookies').clear();
    store.open('provider-kv').clear();
  }

  moduleFor(id, key) {
    const p = this.find(id);
    if (!p) throw new Error('Server not found. Pick a server again.');
    const modules = modulesStore().get(idOf(p.source.author, p.value));
    const code = modules?.[key];
    if (!code) throw new Error(`No ${key} module found for this server`);
    return {code, author: p.source.author, value: p.value};
  }

  run(id, key, exportName, args, signal) {
    const m = this.moduleFor(id, key);
    return this.bridge.invoke({
      moduleCode: m.code,
      providerValue: m.value,
      author: m.author,
      exportName,
      args: {...args, commonHeaders: COMMON_HEADERS},
      state: JSON.parse(JSON.stringify(this.state.get(idOf(m.author, m.value)) || {})),
      signal,
    }).then(result => ({result, m}));
  }

  requireArray(value, op) {
    if (!Array.isArray(value)) throw new Error(`Server ${op} returned ${value === null ? 'null' : typeof value}, expected a list`);
    return value;
  }

  async search(id, query, page, signal) {
    const {result, m} = await this.run(id, 'posts', 'getSearchPosts', {searchQuery: query, page: page || 1, providerValue: this.find(id)?.value}, signal);
    return this.requireArray(result, 'search').map(p => ({...p, providerId: idOf(m.author, m.value)}));
  }

  async getMeta(id, link, signal) {
    const {result} = await this.run(id, 'meta', 'getMeta', {link, provider: this.find(id)?.value}, signal);
    return result;
  }

  async getEpisodes(id, url, signal) {
    const {result} = await this.run(id, 'episodes', 'getEpisodes', {url}, signal);
    return this.requireArray(result, 'episodes');
  }

  async getStream(id, link, type, signal) {
    const {result, m} = await this.run(id, 'stream', 'getStream', {link, type, isDownload: false}, signal);
    const streams = this.requireArray(result, 'stream');
    // Streams get their author's cookies (e.g. WAF clearance) unless they set their own.
    return streams.map(stream => {
      const headers = stream.headers && typeof stream.headers === 'object' ? stream.headers : {};
      if (!/^https?:/i.test(stream.link ?? '') || Object.keys(headers).some(k => k.toLowerCase() === 'cookie')) return stream;
      const cookie = jar.getJarCookieHeader(m.author, stream.link);
      return cookie ? {...stream, headers: {...headers, Cookie: cookie}} : stream;
    });
  }
}


module.exports = {ProviderService};
