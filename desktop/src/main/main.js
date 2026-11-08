'use strict';
const {app, BrowserWindow, ipcMain, session, Menu, shell, protocol} = require('electron');
const path = require('path');
const store = require('./store');
const {registerScheme, createSandboxWindow} = require('./sandboxWindow');

registerScheme();

let mainWindow = null;
let providers = null;
const inflight = new Map();

const APP_HOSTS = [/\.supabase\.co$/i, /(^|\.)themoviedb\.org$/i, /(^|\.)tmdb\.org$/i, /(^|\.)googleapis\.com$/i, /(^|\.)gstatic\.com$/i];
const isAppHost = url => {
  try {
    return APP_HOSTS.some(rx => rx.test(new URL(url).hostname));
  } catch {
    return false;
  }
};

/** Headers the active stream needs (Referer, Cookie, User-Agent…); set by the player. */
let streamHeaders = null;

const installNetworkRules = ses => {
  const filter = {urls: ['http://*/*', 'https://*/*']};
  ses.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
    const headers = details.requestHeaders;
    if (!isAppHost(details.url)) {
      // The page origin is file://, which streaming CDNs reject: drop it
      // unless the stream asked for a specific Origin.
      delete headers.Origin;
      if (streamHeaders) {
        for (const [k, v] of Object.entries(streamHeaders)) {
          for (const existing of Object.keys(headers)) if (existing.toLowerCase() === k.toLowerCase()) delete headers[existing];
          headers[k] = v;
        }
      }
    }
    cb({requestHeaders: headers});
  });
  ses.webRequest.onHeadersReceived(filter, (details, cb) => {
    if (isAppHost(details.url)) return cb({});
    const responseHeaders = {};
    for (const [k, v] of Object.entries(details.responseHeaders || {})) {
      if (!/^access-control-/i.test(k)) responseHeaders[k] = v;
    }
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    responseHeaders['Access-Control-Expose-Headers'] = ['*'];
    const out = {responseHeaders};
    if (details.method === 'OPTIONS') out.statusLine = 'HTTP/1.1 200 OK';
    cb(out);
  });
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    title: 'CineHub',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  mainWindow.on('closed', () => (mainWindow = null));
};

const handle = (channel, fn) =>
  ipcMain.handle(channel, async (event, payload = {}) => {
    const {reqId, ...args} = payload;
    const controller = new AbortController();
    if (reqId) inflight.set(reqId, controller);
    try {
      return {ok: true, data: await fn(args, controller.signal)};
    } catch (error) {
      if (controller.signal.aborted) return {ok: false, aborted: true, error: 'Cancelled'};
      return {ok: false, error: error instanceof Error ? error.message : String(error)};
    } finally {
      if (reqId) inflight.delete(reqId);
    }
  });

const registerIpc = () => {
  handle('providers:list', async () => providers.list());
  handle('providers:sync', ({servers}) => providers.sync(Array.isArray(servers) ? servers : []));
  handle('providers:clear', async () => providers.clear());
  handle('providers:search', ({id, query, page}, signal) => providers.search(id, String(query || ''), page, signal));
  handle('providers:meta', ({id, link}, signal) => providers.getMeta(id, String(link), signal));
  handle('providers:episodes', ({id, url}, signal) => providers.getEpisodes(id, String(url), signal));
  handle('providers:stream', ({id, link, type}, signal) => providers.getStream(id, String(link), String(type || 'movie'), signal));

  handle('stream:headers', async ({headers}) => {
    const clean = {};
    for (const [k, v] of Object.entries(headers && typeof headers === 'object' ? headers : {})) {
      if (typeof v === 'string' && v && !/[\r\n]/.test(k + v)) clean[k] = v;
    }
    streamHeaders = Object.keys(clean).length ? clean : null;
    return true;
  });

  handle('live:load', async ({sources}, signal) => {
    const {parseChannelList} = require('./generated/liveParse.cjs');
    const {validateProviderUrl} = require('./urlGuard');
    const results = await Promise.allSettled(
      (Array.isArray(sources) ? sources : []).map(async s => {
        const url = validateProviderUrl(s.url);
        const res = await fetch(url, {
          headers: {Accept: 'application/json, text/plain, */*'},
          signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseChannelList(await res.text(), s.id, s.label || 'Other');
      }),
    );
    const channels = [];
    let failed = 0;
    results.forEach(r => (r.status === 'fulfilled' && r.value.length ? channels.push(...r.value) : failed++));
    return {channels, failed};
  });

  ipcMain.on('providers:cancel', (_e, reqId) => inflight.get(reqId)?.abort());
  ipcMain.on('window:fullscreen', (_e, on) => mainWindow?.setFullScreen(Boolean(on)));
};

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    store.init(path.join(app.getPath('userData'), 'data'));
    const {SandboxBridge} = require('./bridge');
    const {ProviderService} = require('./providers');
    const bridge = new SandboxBridge();
    providers = new ProviderService(bridge);
    createSandboxWindow(bridge);
    installNetworkRules(session.defaultSession);
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on('before-quit', () => store.flushAll());
  app.on('window-all-closed', () => app.quit());
}
