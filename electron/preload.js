'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onBackendReady: (callback) =>
    ipcRenderer.on('backend-ready', (_event, ...args) => callback(...args)),
  onFullscreenChange: (callback) =>
    ipcRenderer.on('fullscreen-change', (_event, isFullscreen) => callback(isFullscreen)),
  exitFullscreen: () => ipcRenderer.send('exit-fullscreen'),
});
