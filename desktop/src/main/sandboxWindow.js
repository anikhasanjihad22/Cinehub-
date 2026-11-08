'use strict';
const {BrowserWindow, session, protocol} = require('electron');
const fs = require('fs');
const path = require('path');

const SCHEME = 'cinehub-sandbox';
const ORIGIN = `${SCHEME}://runtime/`;

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  'worker-src blob:',
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const escapeInline = s =>
  s.replace(/<\/script/gi, '<\\/script').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const buildHtml = runtime => `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}"></head>
<body><script>${escapeInline(runtime)}</script></body></html>`;

/** Must run before app 'ready'. */
const registerScheme = () =>
  protocol.registerSchemesAsPrivileged([{scheme: SCHEME, privileges: {standard: true, secure: true}}]);

/**
 * Hidden window that hosts the provider sandbox (the same runtime the Android
 * app loads in a WebView). It has no node access, no network (CSP) and an
 * isolated in-memory session; providers can only reach the app through RPC.
 */
const createSandboxWindow = bridge => {
  const runtime = fs.readFileSync(path.join(__dirname, 'generated', 'sandbox-runtime.js'), 'utf8');
  const html = buildHtml(runtime);
  const ses = session.fromPartition('cinehub-provider-sandbox'); // in-memory
  ses.protocol.handle(SCHEME, () => new Response(html, {headers: {'content-type': 'text/html; charset=utf-8'}}));
  ses.webRequest.onBeforeRequest((details, cb) => cb({cancel: !details.url.startsWith(SCHEME) && !details.url.startsWith('blob:') && !details.url.startsWith('devtools:')}));

  const win = new BrowserWindow({
    show: false,
    width: 100,
    height: 100,
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'sandboxPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());

  const {ipcMain} = require('electron');
  const onMsg = (event, raw) => {
    if (event.sender === win.webContents && typeof raw === 'string') bridge.handleMessage(raw);
  };
  ipcMain.on('sandbox:message', onMsg);

  const transport = {
    inject: script => {
      if (!win.isDestroyed()) win.webContents.executeJavaScript(script, false).catch(() => {});
    },
    reload: () => {
      if (!win.isDestroyed()) win.loadURL(ORIGIN);
    },
  };
  bridge.attach(transport);
  win.webContents.on('render-process-gone', () => bridge.reload());
  win.loadURL(ORIGIN);
  return win;
};

module.exports = {createSandboxWindow, registerScheme, buildHtml};
