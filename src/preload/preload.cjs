'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const EVENT_CHANNELS = new Set([
  'ai:status',
  'ai:login-request',
  'ai:login-resolved',
  'ai:activity',
  'run:event',
  'run:problems',
  'workspace:refresh',
  'workspace:changed',
  'workspace:file-changed',
  'workspace:renamed',
  'workspace:removed',
  'mode:changed',
  'compilers:changed',
  'settings:changed',
  'tests:changed',
  'tests:results',
  'app:notify',
  'app:command',
  'app:ready',
  'window:state',
]);

contextBridge.exposeInMainWorld('orbit', {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    if (!EVENT_CHANNELS.has(channel)) throw new Error(`未知事件通道：${channel}`);
    const wrapped = (event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  onRendererCall(handler) {
    ipcRenderer.on('app:call', async (event, message) => {
      try {
        const result = await handler(message.action, message.payload || {});
        ipcRenderer.send('app:call-result', { id: message.id, ok: true, result });
      } catch (error) {
        ipcRenderer.send('app:call-result', {
          id: message.id,
          ok: false,
          error: error?.message || String(error),
        });
      }
    });
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
