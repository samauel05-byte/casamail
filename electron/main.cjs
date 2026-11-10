'use strict';
/**
 * CasaMail — aplicación de escritorio.
 * Arranca el servidor local de CasaMail dentro de la app y lo muestra en una ventana propia.
 * Los datos siguen en ~/.casamail (compartidos con la línea de comandos y el servidor MCP).
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, Notification, session, dialog, ipcMain, powerSaveBlocker, clipboard, crashReporter } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

app.setAppUserModelId('app.casamail.desktop');

// ---------- registro de errores (archivo local; nunca se envía; claves y rutas personales ocultas) ----------
const log = require('./log.cjs');
for (const lvl of ['log', 'info', 'warn', 'error']) { // todo lo que escriba la app o su servidor interno también va al registro
  const orig = console[lvl].bind(console);
  console[lvl] = (...a) => { try { orig(...a); } catch { /* sin consola (app instalada) */ } log.write(lvl === 'log' ? 'info' : lvl, ...a); };
}
app.setPath('crashDumps', path.join(log.dir, 'crashes'));
crashReporter.start({ uploadToServer: false, compress: true }); // los volcados de fallos nativos se quedan en este equipo
process.on('uncaughtException', (e) => {
  log.error('uncaughtException', (e && e.stack) || e);
  if (app.isReady()) dialog.showErrorBox('Error inesperado en CasaMail', `${(e && e.message) || e}\n\nDetalles en el registro:\n${log.file}`);
});
process.on('unhandledRejection', (e) => log.error('unhandledRejection', (e && e.stack) || e));
app.on('child-process-gone', (_e, d) => log.error('child-process-gone', JSON.stringify(d)));
const versionInfo = () => `CasaMail ${app.getVersion()} | Electron ${process.versions.electron} | Chrome ${process.versions.chrome} | Node ${process.versions.node} | ${process.platform} ${process.arch} ${os.release()} | RAM ${Math.round(os.totalmem() / 2 ** 30)} GB | idioma ${app.getLocale()}`;
const openLogs = () => { try { fs.mkdirSync(log.dir, { recursive: true }); } catch { /* ya existe */ } shell.openPath(log.dir); };
const copyDiagnostics = () => {
  clipboard.writeText(log.diagnostics(versionInfo()));
  if (Notification.isSupported()) new Notification({ title: 'Información copiada', body: 'Ya está en el portapapeles: pégala donde te pidan ayuda.' }).show();
};
const showAbout = () => dialog.showMessageBox({ type: 'info', title: 'Acerca de CasaMail', message: `CasaMail ${app.getVersion()}`, detail: `${versionInfo()}\n\nTus correos se quedan en este equipo. El registro de errores es un archivo local: no se envía a ningún sitio.` });

/** Selectores nativos: el usuario elige el archivo (p. ej. un PST de 50 GB) y la app lo lee SIN copiarlo. */
function trustedSender(e) { try { return !!srv && e.senderFrame.url.startsWith(srv.origin); } catch { return false; } }
ipcMain.handle('casamail:pick-file', async (e) => {
  if (!trustedSender(e)) return null;
  const r = await dialog.showOpenDialog(win, { title: 'Elige el archivo de correo a importar', properties: ['openFile'], filters: [{ name: 'Correo (PST, OST, MBOX, EML)', extensions: ['pst', 'ost', 'mbox', 'mbx', 'eml'] }, { name: 'Todos', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  return { token: srv.allowImportPath(file), name: path.basename(file), size: fs.statSync(file).size };
});
ipcMain.handle('casamail:pick-folder', async (e) => {
  if (!trustedSender(e)) return null;
  const r = await dialog.showOpenDialog(win, { title: 'Elige dónde guardar el archivo local (p. ej. un disco externo)', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// Una importación puede durar horas: que el equipo no se duerma mientras tanto.
let blocker = null;
setInterval(() => {
  const n = srv ? srv.activeJobs() : 0;
  if (n > 0 && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (n === 0 && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
}, 5000).unref();

const dataDir = process.env.CASAMAIL_HOME || path.join(os.homedir(), '.casamail');
const prefsFile = path.join(dataDir, 'desktop.json');
// En Linux muchos escritorios no muestran bandeja: por defecto, cerrar la ventana cierra la app.
const defaults = { background: process.platform !== 'linux', hintShown: false };
const readPrefs = () => { try { return { ...defaults, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) }; } catch { return { ...defaults }; } };
const writePrefs = () => { try { fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(prefsFile, JSON.stringify(prefs), { mode: 0o600 }); } catch { /* sin permisos */ } };

let prefs = readPrefs();
let win = null, tray = null, srv = null, quitting = false, forceQuit = false;
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win && win.show());
  win.loadURL(srv.url);
  const wc = win.webContents;
  wc.on('render-process-gone', (_e, d) => log.error('render-process-gone', JSON.stringify(d)));
  wc.on('unresponsive', () => log.warn('La ventana no responde'));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) log.error('did-fail-load', code, desc, url); });
  wc.on('console-message', (...args) => { // la firma cambia entre versiones de Electron: se aceptan ambas
    const d = args[0] && typeof args[0] === 'object' && 'message' in args[0] ? args[0] : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
    if (d.level === 3 || d.level === 'error') log.error('[interfaz]', d.message, d.sourceId ? `(${d.sourceId}:${d.lineNumber})` : '');
  });
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
  items.push({ type: 'separator' }, { label: 'Abrir carpeta de registros', click: openLogs }, { type: 'separator' }, { label: 'Salir de CasaMail', click: () => { quitting = true; app.quit(); } });
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
    { label: 'Ayuda', submenu: [{ label: 'Abrir carpeta de registros', click: openLogs }, { label: 'Copiar información de diagnóstico', click: copyDiagnostics }, { type: 'separator' }, { label: 'Acerca de CasaMail', click: showAbout }] },
  ]);
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // ya hay una CasaMail abierta: esa ventana pasa al frente
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', (e) => {
    if (srv && srv.activeJobs() > 0 && !forceQuit) {
      const c = dialog.showMessageBoxSync({ type: 'warning', buttons: ['Seguir importando', 'Salir de todos modos'], defaultId: 0, cancelId: 0, title: 'Hay una tarea en curso',
        message: 'CasaMail está importando o moviendo correo.', detail: 'Si sales ahora se detendrá. No pasa nada grave: al volver a importar el mismo archivo se retoma sin repetir lo ya guardado.' });
      if (c === 0) { e.preventDefault(); quitting = false; return; }
      forceQuit = true;
    }
    quitting = true;
  });
  app.on('window-all-closed', () => { if (!prefs.background) app.quit(); });
  // Al salir, parar el servidor limpiamente (suelta el candado del planificador).
  app.on('will-quit', (e) => { if (srv) { const s = srv; srv = null; e.preventDefault(); s.close().finally(() => app.quit()); } });

  app.whenReady().then(async () => {
    log.info('Inicio |', versionInfo());
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    process.env.CASAMAIL_NO_OPEN = '1';
    try {
      const mod = await import(pathToFileURL(path.join(__dirname, '..', 'dist', 'web.js')).href);
      srv = await mod.startServer({ port: 8025, fallbackRandom: true, quiet: true });
    } catch (e) {
      log.error('No se pudo arrancar el servidor local', (e && e.stack) || e);
      dialog.showErrorBox('CasaMail no pudo arrancar', `${String((e && e.message) || e)}\n\nDetalles en el registro:\n${log.file}`);
      quitting = true; app.quit(); return;
    }
    Menu.setApplicationMenu(appMenu());
    log.info('Servidor local en', srv.origin);
    createTray();
    if (!process.argv.includes('--hidden')) createWindow();
  });
}
