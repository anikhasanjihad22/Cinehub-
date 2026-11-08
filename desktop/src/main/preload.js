'use strict';
const {contextBridge, ipcRenderer} = require('electron');

let nextId = 0;

/** Calls the main process; resolves with data or throws a plain Error. */
const call = (channel, payload = {}, signal) => {
  const reqId = `r${++nextId}`;
  const onAbort = () => ipcRenderer.send('providers:cancel', reqId);
  signal?.addEventListener('abort', onAbort, {once: true});
  return ipcRenderer.invoke(channel, {...payload, reqId}).then(res => {
    signal?.removeEventListener('abort', onAbort);
    if (res?.ok) return res.data;
    const error = new Error(res?.error || 'Request failed');
    if (res?.aborted) error.name = 'AbortError';
    throw error;
  });
};

contextBridge.exposeInMainWorld('cinehub', {
  platform: process.platform,
  providers: {
    list: () => call('providers:list'),
    sync: servers => call('providers:sync', {servers}),
    clear: () => call('providers:clear'),
    search: (id, query, signal) => call('providers:search', {id, query}, signal),
    meta: (id, link, signal) => call('providers:meta', {id, link}, signal),
    episodes: (id, url, signal) => call('providers:episodes', {id, url}, signal),
    stream: (id, link, type, signal) => call('providers:stream', {id, link, type}, signal),
  },
  setStreamHeaders: headers => call('stream:headers', {headers}),
  loadLive: (sources, signal) => call('live:load', {sources}, signal),
  setFullscreen: on => ipcRenderer.send('window:fullscreen', Boolean(on)),
});
