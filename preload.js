const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importExcel: () => ipcRenderer.invoke('import-excel'),
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog')
});
