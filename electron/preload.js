const { contextBridge, ipcRenderer } = require('electron');

// Ekspos API ke game via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),

  // Listen for window state changes
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  },

  // Platform info
  platform: process.platform, // 'win32', 'darwin', 'linux'
});
