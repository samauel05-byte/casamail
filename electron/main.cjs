'use strict';
/**
 * CasaMail — aplicación de escritorio.
 * Arranca el servidor local de CasaMail dentro de la app y lo muestra en una ventana propia.
 * Los datos siguen en ~/.casamail (compartidos con la línea de comandos y el servidor MCP).
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, Notification, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

app.setAppUserModelId('app.casamail.desktop');

const dataDir = process.env.CASAMAIL_HOME || path.join(os.homedir(), '.casamail');
const prefsFile = path.join(dataDir, 'desktop.json');
// En Linux muchos escritorios no muestran bandeja: por defecto, cerrar la ventana cierra la app.
const defaults = { background: process.platform !== 'linux', hintShown: false };
const readPrefs = () => { try { return { ...defaults, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) }; } catch { return { ...defaults }; } };
const writePrefs = () => { try { fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(prefsFile, JSON.stringify(prefs), { mode: 0o600 }); } catch { /* sin permisos */ } };

let prefs = readPrefs();
let win = null, tray = null, srv = null, quitting = false;
const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
const trayIconPath = path.join(__dirname, '..', 'build', 'tray.png');

/** Solo abre enlaces web/correo en el navegador del sistema; nunca en la ventana de la app. */
function openExternal(url) {
  try { const u = new URL(url); if (['https:', 'http:', 'mailto:'].includes(u.protocol)) shell.openExternal(u.toString()); } catch { /* URL inválida */ }
}

function showWindow() {
  if (!srv) return;
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function backgroundHint() {
  if (prefs.hintShown || !tray || !Notification.isSupported()) return;
  prefs.hintShown = true; writePrefs();
  new Notification({ title: 'CasaMail sigue abierta', body: 'Sigue en segundo plano para enviar tus mensajes programados. Para salir, usa el icono de la bandeja → Salir.' }).show();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 420, minHeight: 560, show: false, title: 'CasaMail',
    backgroundColor: '#eef3f9', icon: iconPath, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win && win.show());
  win.loadURL(srv.url);
  // El inicio de sesión de Google/Microsoft debe hacerse en el navegador del sistema (bloquean los navegadores embebidos).
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(srv.origin)) { e.preventDefault(); openExternal(url); } });
  win.on('close', (e) => { if (!quitting && prefs.background) { e.preventDefault(); win.hide(); backgroundHint(); } });
  win.on('closed', () => { win = null; });
}

function trayMenu() {
  const items = [
    { label: 'Abrir CasaMail', click: showWindow },
    { type: 'separator' },
    { label: 'Seguir en segundo plano al cerrar la ventana', type: 'checkbox', checked: prefs.background, click: (m) => { prefs.background = m.checked; writePrefs(); } },
  ];
  if (process.platform !== 'linux') {
    items.push({ label: 'Iniciar con el sistema', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }) });
  }
  items.push({ type: 'separator' }, { label: 'Salir de CasaMail', click: () => { quitting = true; app.quit(); } });
  return Menu.buildFromTemplate(items);
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(trayIconPath).resize({ height: 18 }));
    tray.setToolTip('CasaMail');
    tray.setContextMenu(trayMenu());
    tray.on('click', showWindow);
  } catch { tray = null; }
}

function appMenu() {
  const mac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'Archivo', submenu: [{ label: 'Abrir CasaMail', click: showWindow }, { type: 'separator' }, { label: 'Salir', accelerator: mac ? 'Cmd+Q' : 'Ctrl+Q', click: () => { quitting = true; app.quit(); } }] },
    { label: 'Edición', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ver', submenu: [{ role: 'resetZoom', label: 'Tamaño normal' }, { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' }] },
    { label: 'Ventana', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'close', label: 'Cerrar' }] },
  ]);
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // ya hay una CasaMail abierta: esa ventana pasa al frente
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (!prefs.background) app.quit(); });
  // Al salir, parar el servidor limpiamente (suelta el candado del planificador).
  app.on('will-quit', (e) => { if (srv) { const s = srv; srv = null; e.preventDefault(); s.close().finally(() => app.quit()); } });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    process.env.CASAMAIL_NO_OPEN = '1';
    try {
      const mod = await import(pathToFileURL(path.join(__dirname, '..', 'dist', 'web.js')).href);
      srv = await mod.startServer({ port: 8025, fallbackRandom: true, quiet: true });
    } catch (e) {
      dialog.showErrorBox('CasaMail no pudo arrancar', String((e && e.message) || e));
      quitting = true; app.quit(); return;
    }
    Menu.setApplicationMenu(appMenu());
    createTray();
    if (!process.argv.includes('--hidden')) createWindow();
  });
}
