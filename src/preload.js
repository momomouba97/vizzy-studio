'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  readFile: (p) => ipcRenderer.invoke('fs:read', p),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (p, t) => ipcRenderer.invoke('fs:writeText', p, t),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  confirm: (m) => ipcRenderer.invoke('app:confirm', m),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return f.path || ''; } },
  exportStart: (o) => ipcRenderer.invoke('export:start', o),
  exportFrame: (buf) => ipcRenderer.invoke('export:frame', buf),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  onMenu: (cb) => ipcRenderer.on('menu', (e, ch) => cb(ch)),
});
