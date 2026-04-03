const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importExcel: () => ipcRenderer.invoke('import-excel'),
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),
  clearSession: () => ipcRenderer.invoke('clear-session')
});
