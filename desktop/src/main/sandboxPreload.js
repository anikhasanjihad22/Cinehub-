'use strict';
const {contextBridge, ipcRenderer} = require('electron');

// The sandbox document talks to its host through window.ReactNativeWebView.postMessage
// (that is how the Android runtime is built); here it is forwarded to the main process.
contextBridge.exposeInMainWorld('ReactNativeWebView', {
  postMessage: message => ipcRenderer.send('sandbox:message', String(message)),
});
