'use strict';
// Puente mínimo y seguro hacia el sistema: solo selectores nativos de archivo/carpeta.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('casamailDesktop', {
  pickImportFile: () => ipcRenderer.invoke('casamail:pick-file'),
  pickFolder: () => ipcRenderer.invoke('casamail:pick-folder'),
});
