'use strict';
// Puente mínimo y seguro hacia el sistema: solo selectores nativos de archivo/carpeta.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('casamailDesktop', {
  pickImportFile: () => ipcRenderer.invoke('casamail:pick-file'),
  pickFolder: () => ipcRenderer.invoke('casamail:pick-folder'),
  // actualización automática: la app descarga la nueva versión sola; la interfaz ofrece reiniciar para instalar.
  installUpdate: () => ipcRenderer.invoke('cm-install-update'),
  onUpdateReady: (cb) => ipcRenderer.on('cm-update-ready', (_e, info) => { try { cb(info); } catch { /* */ } }),
});
