'use strict';
const crypto = require('crypto');
const store = require('./store');
const jar = require('./generated/cookieJar.cjs');
const {providerFetch} = require('./http');
const {validateProviderUrl} = require('./urlGuard');

const SANDBOX_INVOKE_TIMEOUT_MS = 120000;
const MAX_MODULE_SIZE = 2000000;
const MAX_KV_KEY_LENGTH = 256;
const MAX_KV_VALUE_BYTES = 1000000;

const abortError = () => {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
};

const kvStore = () => store.open('provider-kv');
const scopeId = (author, value) => `${encodeURIComponent(author || 'local')}/${encodeURIComponent(value)}`;
const kvKey = (author, value, key) => `${scopeId(author, value)}:${key}`;
const checkKey = key => {
  if (typeof key !== 'string' || !key.trim() || key.length > MAX_KV_KEY_LENGTH) {
    throw new Error(`Invalid KV key: must be a non-empty string <= ${MAX_KV_KEY_LENGTH} characters`);
  }
  return key;
};

const DIGESTS = {MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512'};

const handleCrypto = args => {
  const method = String(args?.method ?? '');
  if (method === 'digestStringAsync') {
    const algo = DIGESTS[String(args?.algorithm ?? 'SHA-256')];
    if (!algo) throw new Error(`Unsupported digest algorithm: ${args?.algorithm}`);
    const encoding = args?.options?.encoding === 'base64' ? 'base64' : 'hex';
    return crypto.createHash(algo).update(String(args?.data ?? '')).digest(encoding);
  }
  if (method === 'getRandomBytesAsync') {
    const n = Number(args?.byteCount ?? 0);
    if (!Number.isInteger(n) || n <= 0) throw new Error('byteCount must be a positive integer');
    if (n > 1024) throw new Error('byteCount is too large');
    return crypto.randomBytes(n).toString('base64');
  }
  throw new Error(`Unsupported crypto method: ${method}`);
};

/** Host side of the sandbox RPC (what providers may ask the app to do). */
const handleRpc = async (providerValue, author, operation, args, signal) => {
  if (signal?.aborted) throw abortError();
  switch (operation) {
    case 'fetch':
      return providerFetch(author, args?.url, args?.init ?? {headers: [], body: {kind: 'none'}}, signal);
    case 'getBaseUrl':
      return '';
    case 'openWebView':
      throw new Error('This source needs a browser challenge that the desktop app cannot solve yet.');
    case 'getCookies':
      return jar.getJarCookieMap(author, validateProviderUrl(args?.url).toString());
    case 'crypto':
      return handleCrypto(args);
    case 'kvGet': {
      const raw = kvStore().get(kvKey(author, providerValue, checkKey(args?.key)));
      if (raw === undefined || raw === null) return undefined;
      try { return JSON.parse(raw); } catch { return raw; }
    }
    case 'kvSet': {
      const key = kvKey(author, providerValue, checkKey(args?.key));
      if (args?.value === undefined) { kvStore().delete(key); return undefined; }
      const serialized = JSON.stringify(args.value);
      if (serialized === undefined) throw new Error('KV value must be JSON-serializable');
      if (serialized.length > MAX_KV_VALUE_BYTES) throw new Error(`KV value exceeds limit of ${MAX_KV_VALUE_BYTES} bytes`);
      kvStore().set(key, serialized);
      return undefined;
    }
    case 'kvDelete': {
      const key = kvKey(author, providerValue, checkKey(args?.key));
      const had = kvStore().keys().includes(key);
      kvStore().delete(key);
      return had;
    }
    case 'kvKeys': {
      const prefix = `${scopeId(author, providerValue)}:`;
      return kvStore().keys().filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
    }
    case 'kvClear': {
      const prefix = `${scopeId(author, providerValue)}:`;
      kvStore().keys().filter(k => k.startsWith(prefix)).forEach(k => kvStore().delete(k));
      return undefined;
    }
    default:
      throw new Error(`Unsupported provider operation: ${operation}`);
  }
};

const randomToken = () => crypto.randomBytes(16).toString('hex');

/**
 * Host transport for the provider sandbox page. The page speaks the same
 * message protocol as on Android; `transport.inject(script)` runs a script in
 * the page and the page's outgoing messages arrive through `handleMessage`.
 */
class SandboxBridge {
  constructor() {
    this.transport = null;
    this.ready = false;
    this.queue = [];
    this.pending = new Map();
    this.active = 0;
    this.maxActive = 2;
    this.onState = null;
    this.readyTimer = null;
  }

  attach(transport) {
    this.transport = transport;
    this.ready = false;
    clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => {
      if (this.ready) return;
      this.queue.length = 0;
      for (const token of [...this.pending.keys()]) this.settle(token, new Error('Provider sandbox failed to start'));
    }, 20000);
  }

  post(message) {
    const entry = message.type === 'invoke' ? this.pending.get(message.token) : undefined;
    if (message.type === 'invoke' && !entry) return;
    if (entry && this.active >= this.maxActive) return void this.queue.push(message);
    if (!this.transport || !this.ready) return void this.queue.push(message);
    if (entry) {
      entry.started = true;
      this.active++;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        this.ready = false;
        this.settle(message.token, new Error(`Provider ${entry.providerValue} timed out`));
        this.reload();
      }, SANDBOX_INVOKE_TIMEOUT_MS + 5000);
    }
    const frame = JSON.stringify(message).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    this.transport.inject(`window.__sandboxReceive(${JSON.stringify(frame)});true;`);
  }

  flush() {
    if (!this.ready) return;
    const queued = this.queue.splice(0, this.queue.length);
    queued.forEach(m => this.post(m));
  }

  reload() {
    this.ready = false;
    this.queue.length = 0;
    for (const token of [...this.pending.keys()]) this.settle(token, new Error('Provider sandbox reloaded'));
    this.transport?.reload?.();
  }

  settle(token, error, result) {
    const entry = this.pending.get(token);
    if (!entry) return;
    this.pending.delete(token);
    entry.controller.abort();
    if (entry.started) this.active--;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].token === token) this.queue.splice(i, 1);
    }
    clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort);
    if (error) entry.reject(error);
    else entry.resolve(result);
    this.flush();
  }

  handleMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'ready':
        this.ready = true;
        clearTimeout(this.readyTimer);
        this.flush();
        return;
      case 'log':
        if (message.level === 'error') console.warn('[provider]', message.message);
        return;
      case 'rpc': {
        const entry = this.pending.get(message.token);
        if (!entry) return;
        handleRpc(entry.providerValue, entry.author, message.operation, message.args, entry.controller.signal)
          .then(result => {
            if (this.pending.get(message.token) === entry) this.post({type: 'rpc-result', token: message.token, id: message.id, result});
          })
          .catch(error => {
            if (this.pending.get(message.token) === entry) {
              this.post({type: 'rpc-result', token: message.token, id: message.id, error: error instanceof Error ? error.message : String(error)});
            }
          });
        return;
      }
      case 'result':
        if (message.error) return void this.settle(message.token, new Error(message.error));
        {
          const entry = this.pending.get(message.token);
          if (entry && message.state && this.onState) this.onState(entry.providerValue, entry.author, message.state);
        }
        this.settle(message.token, null, message.result);
    }
  }

  invoke({moduleCode, providerValue, author, exportName, args, state, signal}) {
    if (typeof moduleCode !== 'string' || moduleCode.length > MAX_MODULE_SIZE) return Promise.reject(new Error('Provider module is missing or too large'));
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.pending.size >= 64) return Promise.reject(new Error('Too many queued provider requests'));
    const token = randomToken();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.settle(token, new Error(`Provider ${providerValue} queue wait timed out`)), 60000);
      const onAbort = () => {
        if (this.pending.get(token)?.started) this.post({type: 'cancel', token});
        this.settle(token, abortError());
      };
      signal?.addEventListener('abort', onAbort, {once: true});
      this.pending.set(token, {controller: new AbortController(), started: false, providerValue, author, resolve, reject, timer, onAbort, signal});
      this.post({type: 'invoke', token, moduleCode, exportName, args, state, timeoutMs: SANDBOX_INVOKE_TIMEOUT_MS});
    });
  }
}

module.exports = {SandboxBridge};
