const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('supercut', {
  claudeStatus: () => ipcRenderer.invoke('claude:status'),
  openMedia: () => ipcRenderer.invoke('media:open'),
  transcribe: (file) => ipcRenderer.invoke('media:transcribe', file),
});
