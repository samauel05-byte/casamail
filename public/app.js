'use strict';
/* CasaMail — interfaz */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- iconos (trazo, 24x24) ---------- */
const ICONS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  spam: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  replyall: '<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  hdd: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  home: '<path d="M8 15.5 16 9l8 6.5"/>',
};
/* Logo de CasaMail (vectorial; usa las variables de color del tema) */
const LOGO = (w = 44) => `<svg viewBox="455 165 630 530" width="${w}" height="${Math.round(w * 0.84)}" aria-hidden="true" style="display:block"><path d="M540 418V618Q540 652 574 652H962Q996 652 996 618V418Z" fill="var(--logo-sky)"/><path d="M545 425 767 555 990 425 768 225Z" fill="var(--logo-paper)"/><g fill="none" stroke="var(--logo-navy)" stroke-linecap="round" stroke-linejoin="round"><path d="M545 425 767 555 990 425" stroke-width="34"/><path d="M540 418V618Q540 652 574 652H962Q996 652 996 618V418" stroke-width="34"/><path d="M566 632 698 532" stroke-width="16"/><path d="M495 422 768 207 1042 425" stroke-width="56"/></g><path d="M920 262V242Q920 228 934 228H998Q1012 228 1012 242V352Z" fill="var(--logo-navy)"/><g fill="var(--logo-navy)"><rect x="715" y="327" width="48" height="48" rx="9"/><rect x="777" y="327" width="48" height="48" rx="9"/><rect x="715" y="387" width="48" height="48" rx="9"/><rect x="777" y="387" width="48" height="48" rx="9"/></g></svg>`;
const I = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- estado ---------- */
const S = { acct: '', folder: 'INBOX', cur: null, macct: '', images: false, msgs: [], triage: {}, tri: false, ai: false, aiq: null, aiParsed: null, reply: null,
  hist: [], sig: {}, thread: true, filter: '', accounts: [], aiOk: false, delay: 10, folders: [], req: 0, files: [], yer: { notes: [] } };
const LOCAL = '__local__'; // cuenta especial: el Archivo local (correo guardado en tu disco)
const A = () => S.macct || S.acct;
const qs = a => `account=${encodeURIComponent(a || A())}&folder=${encodeURIComponent(S.folder)}`;
const firstAcct = () => (S.acct && S.acct !== '*' && S.acct !== LOCAL ? S.acct : S.accounts[0]?.id || '');

async function api(p, body, method) {
  const o = body !== undefined || method ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined } : undefined;
  const r = await fetch(p, o); let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) { const e = new Error(j.error || ('Error ' + r.status)); e.code = j.code; throw e; }
  return j;
}

/* ---------- utilidades de interfaz ---------- */
function toast(msg, o = {}) {
  const el = document.createElement('div'); el.className = 'toast' + (o.kind === 'bad' ? ' bad' : '');
  el.innerHTML = `<span class="tmsg">${esc(msg)}</span>`;
  if (o.action) { const b = document.createElement('button'); b.className = 'tact'; b.textContent = o.action; b.onclick = () => { o.onAction && o.onAction(); el.remove(); }; el.appendChild(b); }
  const x = document.createElement('button'); x.className = 'x'; x.setAttribute('aria-label', 'Cerrar'); x.innerHTML = I('x', 'sm'); x.onclick = () => el.remove(); el.appendChild(x);
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), o.ms || (o.action ? 15000 : 4200)); return el;
}
const busy = (b, on) => { if (b) b.disabled = on; };
const HUES = [14, 30, 158, 198, 222, 262, 296, 338];
const hue = s => { let h = 0; for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) | 0; return HUES[Math.abs(h) % HUES.length]; };
const initials = n => { const p = String(n || '?').replace(/[<>"@._]/g, ' ').trim().split(/\s+/); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const avatar = (name, email, cls = '') => `<span class="avatar ${cls}" style="background:hsl(${hue(email || name)} 46% 40%)">${esc(initials(name || email))}</span>`;
const parseAddr = s => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s || ''); return m ? { name: m[1].trim() || m[2], email: m[2] } : { name: (s || '').trim(), email: (s || '').trim() }; };
const fmtDate = iso => {
  if (!iso) return ''; const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date(n - 864e5).toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', d.getFullYear() === n.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' });
};
const dayLabel = iso => {
  if (!iso) return 'Sin fecha'; const d = new Date(iso), n = new Date(), days = Math.floor((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : days < 7 ? 'Esta semana' : days < 31 ? 'Este mes' : 'Anteriores';
};
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const fmtLeft = ms => { const m = Math.max(0, Math.ceil(ms / 60000)); return m <= 1 ? 'menos de 1 min' : m + ' min'; };
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const fail = e => { if (e.code === 'reauth') toast(e.message, { kind: 'bad', action: 'Reconectar', onAction: () => settings('cuentas'), ms: 12000 }); else toast(e.message, { kind: 'bad' }); };
const YL = (c = '') => `<span class="yl ${c}">${I('sparkles', c === 'lg' ? 'lg' : 'sm')}</span>`;
const mkIcon = (sel, name, cls) => { const e = $(sel); if (e) e.innerHTML = I(name, cls); };

function setTheme(m, save = true) {
  document.documentElement.dataset.theme = m;
  if (save) { try { localStorage.setItem('cm-theme', m); } catch { /* sin almacenamiento */ } }
  $('#theme').innerHTML = I(m === 'dark' ? 'moon' : m === 'light' ? 'sun' : 'monitor'); $('#theme').title = 'Tema: ' + ({ auto: 'automático', light: 'claro', dark: 'oscuro' })[m];
}

/* ---------- iconos estáticos ---------- */
mkIcon('#menu', 'menu'); mkIcon('#searchic', 'search'); mkIcon('#cfg', 'sliders'); mkIcon('#cmin', 'minus'); mkIcon('#draftb', 'file'); mkIcon('#cclose', 'x'); mkIcon('#sendnow', 'bolt'); mkIcon('#sched', 'clock');
mkIcon('#attlabel', 'clip'); mkIcon('#aiboxic', 'sparkles'); mkIcon('#dclose', 'x'); mkIcon('#cgo', 'send');
$('#logomark').innerHTML = LOGO(44);
$('#aisearch').innerHTML = `${I('sparkles', 'sm')} IA`; $('#asst').innerHTML = `${YL('sm')} Yerleny`; $('#aitog').innerHTML = `${I('sparkles', 'sm')} Redactar con Yerleny`; $('#drico').innerHTML = YL('md');
let themeSaved = 'auto'; try { themeSaved = localStorage.getItem('cm-theme') || 'auto'; } catch { /* ignore */ }
setTheme(themeSaved, false);
$('#theme').onclick = () => setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[document.documentElement.dataset.theme] || 'auto');

/* ---------- arranque ---------- */
async function init() {
  const [accs, set, aiCfg, delay, yer] = await Promise.all([api('/api/accounts'), api('/api/settings'), api('/api/ai/config').catch(() => null), api('/api/send-delay').catch(() => ({ minutes: 10 })), api('/api/yerleny').catch(() => ({ notes: [] }))]);
  S.accounts = accs; S.sig = set.signatures || {}; S.aiOk = !!aiCfg; S.delay = delay.minutes; S.yer = yer;
  S.arch = await api('/api/archive/stats').catch(() => ({ messages: 0 })); const hasLocal = S.arch.messages > 0;
  $('#main').classList.toggle('welcome', !accs.length && !hasLocal);
  if (!accs.length && !hasLocal) { $('#side').innerHTML = ''; return renderWelcome(); }
  if (!S.acct || (S.acct !== '*' && S.acct !== LOCAL && !accs.find(a => a.id === S.acct))) S.acct = accs.length > 1 ? '*' : accs.length ? accs[0].id : LOCAL;
  if (S.acct === LOCAL && !hasLocal && accs.length) S.acct = accs.length > 1 ? '*' : accs[0].id;
  S.macct = ''; S.folder = 'INBOX'; S.cur = null; resetView();
  await folders(); await list(); outboxCount();
}
function renderWelcome() {
  $('#list').innerHTML = '';
  $('#view').innerHTML = `<div class="empty" style="min-height:100%"><div style="margin-bottom:8px">${LOGO(150)}</div>
    <h3 style="font-size:26px;letter-spacing:-.02em">Bienvenido a CasaMail</h3>
    <p>Tu correo, en tu propio equipo. Conecta tu primera cuenta para empezar: no hay servidores intermedios y tus mensajes no salen de aquí.</p>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-primary" data-add-first="google">Conectar Gmail</button><button class="btn" data-add-first="microsoft">Conectar Outlook</button><button class="btn" data-add-first="imap">Otra cuenta (IMAP)</button><button class="btn" data-add-first="archivo">Importar un PST / MBOX</button></div></div>`;
  $$('[data-add-first]').forEach(b => b.onclick = () => (b.dataset.addFirst === 'archivo' ? settings('archivo') : settings('cuentas', b.dataset.addFirst)));
}
function resetView() {
  $('#main').classList.remove('reading');
  $('#view').innerHTML = `<div class="empty" style="min-height:100%"><div class="big">${I('mail', 'lg')}</div><h3>Selecciona un mensaje</h3><p>Elige un correo de la lista para leerlo. Mientras tanto, estos atajos te ahorran clics:</p>
    <div class="sc-grid"><span class="kbd">C</span><span>Redactar</span><span class="kbd">/</span><span>Buscar</span><span class="kbd">J K</span><span>Siguiente / anterior</span><span class="kbd">R</span><span>Responder</span><span class="kbd">E</span><span>Archivar</span><span class="kbd">Ctrl K</span><span>Paleta de comandos</span></div></div>`;
}

/* ---------- barra lateral ---------- */
const FOLDER = { '\\Inbox': ['inbox', 'Recibidos'], '\\Sent': ['send', 'Enviados'], '\\Drafts': ['file', 'Borradores'], '\\Trash': ['trash', 'Papelera'], '\\Junk': ['spam', 'Spam'], '\\Archive': ['archive', 'Archivo'], '\\All': ['archive', 'Todos'], '\\Flagged': ['star', 'Destacados'] };
const folderMeta = f => FOLDER[f.specialUse] || (f.path === 'INBOX' ? FOLDER['\\Inbox'] : ['folder', f.name]);
async function folders() {
  let h = `<button class="btn btn-primary compose-btn" id="new">${I('pencil')} Redactar</button>`;
  h += `<div class="acct-pick"><select id="acct" aria-label="Cuenta">${S.accounts.length > 1 ? '<option value="*">Todas las cuentas</option>' : ''}${S.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.email)}</option>`).join('')}<option value="${LOCAL}">Archivo local (en tu disco)</option></select></div>`;
  const tail = `<div class="side-sep"></div><div class="nav" data-sched="1">${I('send')}<span>Salida</span><span class="n pill" id="outn" hidden></span></div>${S.acct !== '*' && S.acct !== LOCAL ? `<div class="nav" data-newf="1">${I('plus')}<span>Nueva carpeta</span></div>` : ''}<div class="nav" id="jobchip" data-jobs="1" hidden>${I('hdd')}<span id="jobtxt">Tarea en curso</span></div>
    <div class="side-foot">${I('lock', 'sm')}<span>Local y privado: tus correos no pasan por ningún servidor de CasaMail.</span></div>`;
  if (S.acct === '*') { $('#side').innerHTML = h + `<div class="nav on" data-all="1">${I('inbox')}<span>Recibidos (todas)</span></div>` + tail; }
  else if (S.acct === LOCAL) {
    try {
      const f = await api('/api/folders?account=' + LOCAL); S.folders = f;
      if (f.length && !f.find(x => x.path === S.folder)) S.folder = f[0].path;
      S.arch = { ...(S.arch || {}), messages: f.reduce((n, x) => n + x.total, 0) };
      h += `<div class="side-label">Archivo local · ${S.arch.messages.toLocaleString('es')} mensajes</div>` + f.map(x => { const depth = x.path.split('/').length - 1; return `<div class="nav ${x.path === S.folder ? 'on' : ''}" data-p="${esc(x.path)}" title="${esc(x.path)}" style="padding-left:${12 + depth * 14}px">${I(depth ? 'folder' : 'hdd')}<span>${esc(x.name)}</span>${x.unread ? `<span class="n pill">${x.unread}</span>` : `<span class="n mut">${x.total.toLocaleString('es')}</span>`}</div>`; }).join('') + `<div class="nav" data-import="1">${I('upload')}<span>Importar PST / MBOX…</span></div>`;
    } catch (e) { h += `<p class="err" style="padding:10px">${esc(e.message)}</p>`; }
    $('#side').innerHTML = h + tail;
  }
  else {
    try {
      const f = await api('/api/folders?account=' + encodeURIComponent(S.acct)); S.folders = f;
      const order = ['\\Inbox', '\\Flagged', '\\Sent', '\\Drafts', '\\Archive', '\\Junk', '\\Trash'];
      const sorted = [...f].sort((a, b) => { const x = order.indexOf(a.specialUse ?? (a.path === 'INBOX' ? '\\Inbox' : '')), y = order.indexOf(b.specialUse ?? (b.path === 'INBOX' ? '\\Inbox' : '')); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.path.localeCompare(b.path); });
      h += sorted.map(x => { const [ic, nm] = folderMeta(x); return `<div class="nav ${x.path === S.folder ? 'on' : ''}" data-p="${esc(x.path)}">${I(ic)}<span>${esc(nm)}</span>${x.unread ? `<span class="n ${x.path === 'INBOX' ? 'pill' : ''}">${x.unread}</span>` : ''}</div>`; }).join('');
    } catch (e) { h += `<p class="err" style="padding:10px">${esc(e.message)}</p>`; }
    $('#side').innerHTML = h + tail;
  }
  const sel = $('#acct'); if (sel) sel.value = S.acct;
  $('#new').onclick = () => compose();
  if (sel) sel.onchange = async e => { S.acct = e.target.value; S.macct = ''; S.folder = e.target.value === LOCAL ? '' : 'INBOX'; S.aiq = null; S.cur = null; resetView(); await folders(); await list(); };
  outboxCount();
}
async function outboxCount() {
  try { const l = await api('/api/outbox'), el = $('#outn'); if (el) { el.hidden = !l.length; el.textContent = l.length; } } catch { /* sin servidor */ }
}

/* ---------- lista ---------- */
const skeleton = n => Array.from({ length: n }, () => '<div class="sk"><i class="a"></i><div><i class="l1"></i><i class="l2"></i></div></div>').join('');
const folderTitle = () => S.aiq ? 'Resultados' : S.acct === '*' ? 'Bandeja unificada' : (() => { const f = S.folders.find(x => x.path === S.folder); return f ? folderMeta(f)[1] : S.folder; })();
function listHead(count) {
  return `<div class="list-head"><div class="list-title"><h2>${esc(folderTitle())}</h2>${count ? `<span class="cnt" title="${count} mensajes">${count}</span>` : ''}<span class="grow"></span><button class="btn btn-ai btn-sm" id="ftri" title="Ordena por prioridad con IA">${I('sparkles', 'sm')} Priorizar</button><button class="iconbtn sm" id="frf" aria-label="Actualizar" title="Actualizar">${I('refresh')}</button></div>
    <div class="list-tools"><div class="seg" role="group" aria-label="Filtro"><button data-f="" class="${!S.filter ? 'on' : ''}">Todos</button><button data-f="unread" class="${S.filter === 'unread' ? 'on' : ''}">No leídos</button><button data-f="starred" class="${S.filter === 'starred' ? 'on' : ''}">Destacados</button></div>
    <span class="grow"></span><button class="iconbtn sm ${S.thread ? 'on' : ''}" id="ft" aria-label="Agrupar por hilos" title="${S.thread ? 'Hilos agrupados' : 'Hilos sin agrupar'}">${I('layers')}</button></div></div>`;
}
async function list() {
  const id = ++S.req;
  $('#list').innerHTML = listHead() + skeleton(7);
  bindListHead();
  try {
    let r;
    if (S.aiq) r = await api(`/api/ai/search?${qs(S.acct === '*' ? firstAcct() : S.acct)}`, { query: S.aiq });
    else if (S.acct === '*') r = await api('/api/unified');
    else if (S.acct === LOCAL && !S.folder) r = { messages: [] };
    else if (S.filter === 'starred') r = await api(`/api/search?${qs(S.acct)}&starred=1`);
    else r = await api(`/api/messages?${qs(S.acct)}${S.filter === 'unread' ? '&unread=1' : ''}`);
    if (id !== S.req) return;
    S.msgs = r.messages.map(m => (S.acct !== '*' ? { ...m, account: S.acct } : m)); S.aiParsed = r.query; S.tri = false; S.triage = {};
    if (S.acct === '*') { if (S.filter === 'unread') S.msgs = S.msgs.filter(m => m.unread); if (S.filter === 'starred') S.msgs = S.msgs.filter(m => m.starred); }
    drawList();
  } catch (e) {
    if (id !== S.req) return;
    $('#list').innerHTML = listHead() + `<div class="empty"><div class="big" style="background:var(--bad-soft);color:var(--bad)">${I('spam', 'lg')}</div><h3>No se pudo cargar</h3><p>${esc(e.message)}</p>${e.code === 'reauth' ? `<button class="btn btn-primary" id="recon">Reconectar cuenta</button>` : `<button class="btn" id="retry">Reintentar</button>`}</div>`;
    bindListHead(); const rb = $('#recon'); if (rb) rb.onclick = () => settings('cuentas'); const rt = $('#retry'); if (rt) rt.onclick = list;
  }
}
const isCur = m => !!S.cur && S.cur.uid === m.uid && (m.account || '') === (S.macct || m.account || '');
const norm = s => (s || '').replace(/^((re|rv|fwd?|fw|reenv)\s*:\s*)+/i, '').trim().toLowerCase();
function drawList() {
  const groups = [], seen = {};
  for (const m of S.msgs) { const k = S.thread ? norm(m.subject) + '|' + (m.account || '') : m.uid + '|' + (m.account || ''); if (seen[k] !== undefined) { groups[seen[k]].n++; continue; } seen[k] = groups.length; groups.push({ m, n: 1 }); }
  let html = listHead(groups.length || '');
  if (S.aiq) html += `<div class="ai-note">${I('sparkles', 'sm')} Interpreté tu búsqueda: ${Object.entries(S.aiParsed || {}).filter(([, v]) => v).map(([k, v]) => `<span class="chip">${esc(k)}: ${esc(v)}</span>`).join('') || '<span class="mut">(sin filtros)</span>'}<button class="btn btn-ghost btn-sm" id="clr">Limpiar</button></div>`;
  let last = '';
  html += groups.map(({ m, n }) => {
    const t = S.triage[m.uid], a = parseAddr(m.from); let head = '';
    if (!S.tri) { const g = dayLabel(m.date); if (g !== last) { head = `<div class="grp">${g}</div>`; last = g; } }
    const acctTag = S.acct === '*' && m.account ? `<span class="badge acct">${esc((S.accounts.find(x => x.id === m.account)?.email || m.account).split('@')[0])}</span>` : '';
    const meta = [acctTag, t ? `<span class="badge ${t.priority >= 3 ? 'hi' : t.priority === 2 ? 'mid' : 'ai'}" title="${esc(t.why)}">${I('sparkles', 'sm')} ${esc(t.category)}</span>` : '', m.hasAttachments ? `<span class="badge">${I('clip', 'sm')} Adjunto</span>` : ''].filter(Boolean).join('');
    return `${head}<div class="m ${m.unread ? 'unread' : ''} ${isCur(m) ? 'on' : ''}" data-u="${m.uid}" data-a="${esc(m.account || '')}" role="button" tabindex="0">${avatar(a.name, a.email)}
      <div style="min-width:0"><div class="m-top"><span class="fr">${esc(a.name)}</span><span class="d">${fmtDate(m.date)}</span></div>
      <div class="su">${m.starred ? `<span class="star">${I('star', 'sm')}</span>` : ''}<span class="t">${esc(m.subject)}</span>${n > 1 ? `<span class="badge">${n}</span>` : ''}</div>${meta ? `<div class="m-meta">${meta}</div>` : ''}</div>
      <div class="m-act"><button class="iconbtn sm" data-qa="star" title="Destacar" aria-label="Destacar">${I('star', 'sm')}</button>${S.acct === LOCAL ? '' : `<button class="iconbtn sm" data-qa="archive" title="Archivar" aria-label="Archivar">${I('archive', 'sm')}</button>`}<button class="iconbtn sm" data-qa="trash" title="Papelera" aria-label="Papelera">${I('trash', 'sm')}</button></div></div>`;
  }).join('');
  if (!groups.length) html += `<div class="empty"><div class="big">${I(S.filter === 'starred' ? 'star' : 'check', 'lg')}</div><h3>${S.aiq ? 'Sin resultados' : S.filter ? 'Nada por aquí' : S.acct === LOCAL ? 'Tu archivo local está vacío' : 'Bandeja vacía'}</h3><p>${S.aiq ? 'Prueba con otras palabras.' : S.filter ? 'No hay mensajes con este filtro.' : S.acct === LOCAL ? 'Importa un PST de Outlook o un MBOX, o lleva aquí el correo viejo de tus cuentas.' : 'Estás al día. Disfruta el silencio.'}</p>${S.acct === LOCAL && !S.filter && !S.aiq ? '<button class="btn btn-primary" data-import="1">Importar un PST o MBOX</button>' : ''}</div>`;
  $('#list').innerHTML = html; bindListHead();
  const c = $('#clr'); if (c) c.onclick = () => { S.aiq = null; $('#q').value = ''; list(); };
}
function bindListHead() {
  $$('.seg button').forEach(b => b.onclick = () => { S.filter = b.dataset.f; list(); });
  const ft = $('#ft'); if (ft) ft.onclick = () => { S.thread = !S.thread; drawList(); };
  const rf = $('#frf'); if (rf) rf.onclick = () => { folders(); list(); };
  const tr = $('#ftri'); if (tr) tr.onclick = async e => {
    if (!needAi()) return; const b = e.currentTarget; busy(b, true); b.innerHTML = `${I('sparkles', 'sm')} Analizando…`;
    try {
      const acc = S.acct === '*' ? S.msgs[0]?.account : S.acct;
      const r = await api(`/api/ai/triage?${qs(acc)}`, {}); S.triage = {}; r.items.forEach(i => S.triage[i.uid] = i);
      S.msgs.sort((a, b2) => (S.triage[b2.uid]?.priority || 0) - (S.triage[a.uid]?.priority || 0)); S.tri = true; drawList();
    } catch (x) { fail(x); drawList(); }
  };
}
$('#list').addEventListener('click', e => {
  if (e.target.closest('[data-import]')) return settings('archivo');
  const qa = e.target.closest('[data-qa]'), m = e.target.closest('.m'); if (!m) return;
  if (qa) { e.stopPropagation(); return rowAct(qa.dataset.qa, Number(m.dataset.u), m.dataset.a || A()); }
  openMsg(m.dataset.u, m.dataset.a).catch(x => { $('#view').innerHTML = `<div class="empty"><h3>No se pudo abrir</h3><p>${esc(x.message)}</p></div>`; fail(x); });
});
$('#list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('m')) { e.preventDefault(); e.target.click(); } });
async function rowAct(kind, uid, acct) {
  if (kind === 'trash' && acct === LOCAL && !confirm('¿Eliminar este mensaje del archivo local?')) return;
  const q = `account=${encodeURIComponent(acct)}&folder=${encodeURIComponent(S.folder)}`;
  try {
    if (kind === 'star') { const m = S.msgs.find(x => x.uid === uid && (x.account || '') === (acct || '')); const next = !(m && m.starred); await api(`/api/message/${uid}/flags?${q}`, { starred: next }); if (m) m.starred = next; drawList(); return; }
    await api(`/api/message/${uid}/${kind}?${q}`, {}); toast(kind === 'archive' ? 'Archivado' : 'Movido a la papelera');
    S.msgs = S.msgs.filter(x => !(x.uid === uid && (x.account || '') === (acct || ''))); if (S.cur && S.cur.uid === uid) { S.cur = null; resetView(); } drawList(); folders();
  } catch (e) { fail(e); }
}

/* ---------- lectura ---------- */
async function openMsg(uid, acct) {
  uid = Number(uid); S.macct = acct || (S.acct === '*' ? '' : S.acct); if (S.acct === '*' && !S.macct) return; if (S.acct === '*') S.folder = 'INBOX';
  $$('.m').forEach(e => e.classList.toggle('on', e.dataset.u == uid && (e.dataset.a || '') === (S.macct || e.dataset.a || ''))); $('#main').classList.add('reading');
  $('#view').innerHTML = `<div class="vbody"><div class="sk" style="padding:0"><i class="a"></i><div><i class="l1"></i><i class="l2"></i></div></div></div>`;
  const m = await api(`/api/message/${uid}?${qs()}`); S.cur = m; S.images = false; renderMsg();
  const row = S.msgs.find(x => x.uid === uid && (x.account || '') === (S.macct || x.account || '')); if (row && row.unread) { row.unread = false; const el = $(`.m[data-u="${uid}"]`); if (el) el.classList.remove('unread'); folders(); }
}
const tb = (id, ic, label, cls = '') => `<button class="iconbtn ${cls}" id="${id}" title="${label}" aria-label="${label}">${I(ic)}</button>`;
function renderMsg() {
  const m = S.cur; if (!m) return; const f = parseAddr(m.from); const loc = A() === LOCAL;
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: ${S.images ? 'https: http:' : ''}`;
  const body = m.html
    ? `<iframe class="msg-html" title="Contenido del mensaje" sandbox="allow-popups allow-same-origin" referrerpolicy="no-referrer" srcdoc="${esc(`<meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;margin:12px;color:#222}img{max-width:100%;height:auto}</style>` + m.html)}" onload="try{this.style.height=this.contentDocument.body.scrollHeight+32+'px'}catch(e){}"></iframe>`
    : `<div class="msg-text">${linkify(m.text)}</div>`;
  $('#view').innerHTML = `<div class="vtool">${tb('back', 'back', 'Volver', 'only-narrow')}${loc ? '' : tb('ar', 'archive', 'Archivar (E)') + tb('sp', 'spam', 'Marcar como spam')}${tb('tr', 'trash', loc ? 'Eliminar del archivo' : 'Papelera (#)')}<span class="vs"></span>${tb('un', 'mail', 'Marcar como no leído')}${loc ? '' : tb('sn', 'clock', 'Posponer')}${tb('st', 'star', 'Destacar (S)')}<a class="iconbtn" id="dl" href="/api/message/${m.uid}/eml?${qs()}" download title="Descargar como .eml" aria-label="Descargar como .eml">${I('download')}</a><span class="grow"></span>${tb('rp', 'reply', 'Responder (R)')}${loc ? '' : tb('ra', 'replyall', 'Responder a todos')}</div>
  <div class="vbody"><h1 class="vsub">${esc(m.subject)}</h1>
    <div class="vhead">${avatar(f.name, f.email, 'lg')}<div class="who"><div class="nm">${esc(f.name)} <span class="em">&lt;${esc(f.email)}&gt;</span></div><div class="to">Para ${esc(m.to || '—')}${m.cc ? ' · Cc ' + esc(m.cc) : ''}</div></div><span class="dt">${m.date ? new Date(m.date).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></div>
    <div class="aibar"><button class="btn btn-ai btn-sm" id="ais">${I('sparkles', 'sm')} Resumir</button><button class="btn btn-ai btn-sm" id="air">${I('sparkles', 'sm')} Sugerir respuestas</button></div><div id="aiout"></div>
    ${m.html && !S.images ? `<div class="privacy">${I('shield')}<span>Imágenes remotas bloqueadas para proteger tu privacidad.</span><button class="btn btn-sm" id="im">Cargar imágenes</button></div>` : ''}
    ${m.attachments.length ? `<div class="atts">${m.attachments.map(a => `<a class="att" href="/api/message/${m.uid}/attachment/${a.index}?${qs()}">${I('download')}<span>${esc(a.filename)}<small>${fmtSize(a.size)}</small></span></a>`).join('')}</div>` : ''}
    ${body}</div>`;
  const on = (i, fn) => { const e = $(i); if (e) e.onclick = fn; };
  on('#back', () => $('#main').classList.remove('reading')); on('#im', () => { S.images = true; renderMsg(); });
  on('#rp', () => (loc ? compose({ to: f.email, subject: 'Re: ' + m.subject.replace(/^re:\s*/i, '') }) : compose({ reply: { all: false } }))); on('#ra', () => compose({ reply: { all: true } }));
  on('#st', () => toggleStar()); on('#un', () => act('flags', { read: false }, 'Marcado como no leído'));
  on('#ar', () => act('archive', {}, 'Archivado', 1)); on('#sp', () => act('spam', {}, 'Movido a spam', 1)); on('#tr', () => { if (loc && !confirm('¿Eliminar este mensaje del archivo local?')) return; act('trash', {}, loc ? 'Eliminado del archivo' : 'Movido a la papelera', 1); });
  on('#sn', () => snoozeDialog());
  on('#ais', async e => {
    if (!needAi()) return; const b = e.currentTarget; busy(b, true); $('#aiout').innerHTML = `<div class="card-ai"><h4>${I('sparkles', 'sm')} Yerleny · Resumen</h4><div class="typing"><i></i><i></i><i></i></div></div>`;
    try { const r = await api('/api/ai/summarize?account=' + encodeURIComponent(A()), { uid: m.uid, folder: S.folder }); $('#aiout').innerHTML = `<div class="card-ai"><h4>${I('sparkles', 'sm')} Yerleny · Resumen</h4><pre>${esc(r.summary)}</pre></div>`; } catch (x) { $('#aiout').innerHTML = `<div class="card-ai err">${esc(x.message)}</div>`; }
    busy(b, false);
  });
  on('#air', async e => {
    if (!needAi()) return; const b = e.currentTarget; busy(b, true); $('#aiout').innerHTML = `<div class="card-ai"><h4>${I('sparkles', 'sm')} Yerleny · Respuestas sugeridas</h4><div class="typing"><i></i><i></i><i></i></div></div>`;
    try {
      const r = await api('/api/ai/replies?account=' + encodeURIComponent(A()), { uid: m.uid, folder: S.folder });
      $('#aiout').innerHTML = `<div class="card-ai"><h4>${I('sparkles', 'sm')} Yerleny · Respuestas sugeridas (toca una para editarla)</h4>${r.options.map((o, i) => `<div class="opt" data-i="${i}" role="button" tabindex="0"><b>${esc(o.label)}</b>${esc(o.body)}</div>`).join('')}</div>`;
      $$('.opt').forEach(el => el.onclick = () => compose(loc ? { to: f.email, subject: 'Re: ' + m.subject.replace(/^re:\s*/i, ''), text: r.options[el.dataset.i].body } : { reply: { all: false }, text: r.options[el.dataset.i].body }));
    } catch (x) { $('#aiout').innerHTML = `<div class="card-ai err">${esc(x.message)}</div>`; }
    busy(b, false);
  });
}
function toggleStar() {
  const m = S.msgs.find(x => S.cur && x.uid === S.cur.uid); const next = !(m && m.starred);
  api(`/api/message/${S.cur.uid}/flags?${qs()}`, { starred: next }).then(() => { if (m) m.starred = next; drawList(); toast(next ? 'Destacado' : 'Sin destacar'); }).catch(fail);
}
async function act(kind, body, msg, remove) {
  try {
    await api(`/api/message/${S.cur.uid}/${kind}?${qs()}`, body); toast(msg);
    if (remove) { const u = S.cur.uid; S.msgs = S.msgs.filter(x => x.uid !== u); S.cur = null; resetView(); drawList(); }
    folders();
  } catch (e) { fail(e); }
}
function snoozeDialog() {
  const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0);
  const val = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  openModal(`<div class="narrow-in"><h3 style="font-size:20px">Posponer mensaje</h3><p class="lead mut" style="margin:6px 0 14px">Desaparece de la lista y vuelve como no leído a la hora elegida.</p>
    <div class="row" style="margin-top:0">${[['Esta tarde', 3], ['Mañana', 24], ['En 3 días', 72], ['Próxima semana', 168]].map(([l, h]) => `<button class="btn btn-sm" data-h="${h}">${l}</button>`).join('')}</div>
    <label class="lb" style="display:block;margin:14px 0 5px;font-size:12.5px;font-weight:650">O elige fecha y hora</label><input type="datetime-local" id="sdt" class="field" value="${val}">
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="scx">Cancelar</button><button class="btn btn-primary" id="sok">Posponer</button></div></div>`, true);
  const go = async until => { closeModal(); await act('snooze', { until: new Date(until).toISOString() }, 'Pospuesto hasta ' + new Date(until).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }), 1); };
  $$('[data-h]').forEach(b => b.onclick = () => go(Date.now() + Number(b.dataset.h) * 36e5)); $('#sok').onclick = () => go($('#sdt').value); $('#scx').onclick = closeModal;
}

/* ---------- redactar ---------- */
const sigFor = id => S.sig[id] || '';
function compose(o = {}) {
  if (!S.accounts.length) return toast('Para escribir necesitas una cuenta conectada. Añádela en Ajustes → Cuentas.', { kind: 'bad', action: 'Añadir', onAction: () => settings('cuentas') });
  S.reply = o.reply || null; S.files = []; renderFiles(); const r = !!S.reply;
  $('#compose').hidden = false; $('#compose').classList.remove('min'); $('#ctitle').textContent = r ? 'Responder' : 'Mensaje nuevo';
  $('#from').innerHTML = S.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.email)}</option>`).join(''); $('#from').value = r ? A() : (o.from || firstAcct());
  $('#rowfrom').hidden = r || S.accounts.length < 2;
  $('#to').value = o.to || ''; $('#cc').value = ''; $('#sub').value = o.subject || (r ? 'Re: ' + S.cur.subject.replace(/^re:\s*/i, '') : ''); $('#rowcc').hidden = true; $('#showcc').hidden = r;
  $('#rowto').hidden = $('#rowsub').hidden = r; $('#sched').hidden = $('#attlabel').hidden = r; $('#when').hidden = true;
  const sg = sigFor($('#from').value); $('#body').value = (o.text || '') + (sg ? `\n\n-- \n${sg}` : ''); $('#cs').textContent = ''; $('#aibox').hidden = true; $('#aist').textContent = '';
  $('#sendhint').innerHTML = S.delay > 0 ? `${I('clock', 'sm')} Saldrá en ${S.delay} min desde la bandeja de salida: puedes retirarlo hasta entonces.` : `${I('bolt', 'sm')} Se enviará al instante.`;
  $('#compose').classList.toggle('reply', r); setTimeout(() => { const t = r || o.to ? $('#body') : $('#to'); t.focus(); if (t === $('#body')) t.setSelectionRange(0, 0); }, 40);
}
function renderFiles() { $('#fl').innerHTML = S.files.map((f, i) => `<span class="file">${I('clip', 'sm')}${esc(f.filename)}<button class="iconbtn sm" data-rm="${i}" aria-label="Quitar">${I('x', 'sm')}</button></span>`).join(''); $$('[data-rm]').forEach(b => b.onclick = () => { S.files.splice(Number(b.dataset.rm), 1); renderFiles(); }); }
$('#cclose').onclick = () => { $('#compose').hidden = true; }; $('#cmin').onclick = () => $('#compose').classList.toggle('min');
$('#compose .cw-head').ondblclick = () => $('#compose').classList.toggle('min');
$('#showcc').onclick = () => { $('#rowcc').hidden = false; $('#cc').focus(); };
let ct; $('#to').oninput = e => { clearTimeout(ct); ct = setTimeout(async () => { const q = e.target.value.split(',').pop().trim(); if (q.length < 2) return; try { const c = await api('/api/contacts?q=' + encodeURIComponent(q)); const pre = e.target.value.includes(',') ? e.target.value.replace(/[^,]*$/, '') + ' ' : ''; $('#cl').innerHTML = c.map(x => `<option value="${esc(pre + (x.name ? `${x.name} <${x.email}>` : x.email))}">`).join(''); } catch { /* sin sugerencias */ } }, 160); };
$('#files').onchange = async e => { for (const f of e.target.files) { if (f.size > 20e6) { toast(f.name + ' supera 20 MB', { kind: 'bad' }); continue; } S.files.push({ filename: f.name, encoding: 'base64', content: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f); }) }); } e.target.value = ''; renderFiles(); };
$('#sched').onclick = () => { const w = $('#when'); w.hidden = !w.hidden; if (!w.value) w.value = new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
$('#from').onchange = () => { /* la firma sigue la cuenta si el cuerpo no se ha tocado */ };
$('#aitog').onclick = () => { if (!needAi()) return; $('#aibox').hidden = !$('#aibox').hidden; if (!$('#aibox').hidden) $('#aiins').focus(); };
$('#aigo').onclick = async e => {
  const ins = $('#aiins').value.trim(); if (!ins) return; busy(e.currentTarget, true); $('#aist').textContent = 'Redactando…';
  try { const r = await api('/api/ai/draft?account=' + encodeURIComponent(A()), { instruction: ins, tone: $('#aitone').value, uid: S.reply && S.cur ? S.cur.uid : undefined, folder: S.folder }); if (r.subject && !S.reply) $('#sub').value = r.subject; const sg = sigFor($('#from').value); $('#body').value = r.body + (sg ? `\n\n-- \n${sg}` : ''); $('#aist').textContent = 'Listo. Revísalo antes de enviar.'; }
  catch (x) { $('#aist').innerHTML = `<span class="err">${esc(x.message)}</span>`; }
  busy($('#aigo'), false);
};
$('#rw').onchange = async e => {
  const mode = e.target.value; e.target.value = ''; if (!mode || !needAi()) return; const ta = $('#body'), a = ta.selectionStart, b = ta.selectionEnd, sel = a !== b;
  const txt = sel ? ta.value.slice(a, b) : ta.value.split('\n-- \n')[0]; if (!txt.trim()) return; $('#cs').textContent = 'Reescribiendo…';
  try { const r = await api('/api/ai/rewrite', { text: txt, mode }); ta.value = sel ? ta.value.slice(0, a) + r.text + ta.value.slice(b) : r.text + (ta.value.includes('\n-- \n') ? '\n-- \n' + ta.value.split('\n-- \n').slice(1).join('\n-- \n') : ''); $('#cs').textContent = ''; } catch (x) { $('#cs').innerHTML = `<span class="err">${esc(x.message)}</span>`; }
};
$('#draftb').onclick = async () => { try { await api(`/api/draft?account=${encodeURIComponent($('#from').value)}`, { to: $('#to').value, cc: $('#cc').value || undefined, subject: $('#sub').value, text: $('#body').value, attachments: S.files }); toast('Borrador guardado'); folders(); } catch (e) { $('#cs').innerHTML = `<span class="err">${esc(e.message)}</span>`; } };
async function doSend(now) {
  const reply = S.reply, cur = S.cur, acct = reply ? A() : $('#from').value, f = S.folder;
  const when = !now && !$('#when').hidden && $('#when').value ? new Date($('#when').value).toISOString() : null;
  const p = { to: $('#to').value, cc: $('#cc').value || undefined, subject: $('#sub').value, text: $('#body').value, attachments: S.files.length ? S.files : undefined };
  if (!reply && !p.to.trim()) { $('#cs').innerHTML = '<span class="err">Falta el destinatario</span>'; return; }
  if (!reply && !p.subject.trim() && !confirm('¿Enviar sin asunto?')) return;
  $('#compose').hidden = true;
  try {
    const r = reply ? await api(`/api/message/${cur.uid}/reply?account=${encodeURIComponent(acct)}&folder=${encodeURIComponent(f)}`, { text: p.text, replyAll: reply.all, now }) : await api(`/api/send?account=${encodeURIComponent(acct)}`, { ...p, sendAt: when, now });
    if (r.sent) return toast('Enviado ✔');
    if (r.kind === 'scheduled') return toast('Programado para ' + new Date(r.sendAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }), { action: 'Ver salida', onAction: () => settings('salida') });
    toast(`En la bandeja de salida: se enviará en ${fmtLeft(r.sendAt - Date.now())}. Puedes retirarlo hasta entonces.`, { action: 'Retirar', ms: 20000, onAction: async () => { try { await api('/api/outbox/' + r.id, undefined, 'DELETE'); toast('Mensaje retirado: no se enviará'); outboxCount(); compose({ to: p.to, subject: p.subject, text: p.text, reply, from: acct }); } catch (e) { toast(e.message, { kind: 'bad', ms: 7000 }); } } });
    outboxCount();
  } catch (e) { toast('No se pudo enviar: ' + e.message, { kind: 'bad' }); compose({ to: p.to, subject: p.subject, text: p.text, from: acct }); }
}
$('#send').onclick = () => doSend(false);
$('#sendnow').onclick = () => { if (confirm('Se enviará ahora mismo y ya no podrás retirarlo. ¿Continuar?')) doSend(true); };

/* ---------- IA ---------- */
function needAi() { if (S.aiOk) return true; toast('Yerleny necesita un modelo de IA para pensar. Conéctalo en Ajustes (puede ser gratis y local con Ollama).', { action: 'Conectar', onAction: () => settings('ia'), ms: 12000 }); return false; }
const SUGG = ['Dame mi resumen del día', 'Resume mis correos sin leer', '¿Qué facturas me llegaron?', 'Busca lo último de mi jefe', 'Prepara una respuesta amable al último mensaje'];
function drawerOpen() { $('#drawer').hidden = false; if (!$('#chat').children.length) chatIntro(); $('#ci').focus(); }
function chatIntro() {
  const n = S.yer.userName ? ', ' + S.yer.userName : '';
  $('#chat').innerHTML = `<div class="bub bot">¡Hola${esc(n)}! Soy <b>Yerleny</b>, la IA de CasaMail. Puedo buscar y leer tu correo para responderte, resumirlo y preparar borradores que tú revisas y envías. ¿Qué necesitas?</div><div class="sug">${SUGG.map(s => `<button>${esc(s)}</button>`).join('')}</div>`;
  $$('.sug button').forEach(b => b.onclick = () => { $('#ci').value = b.textContent; askAgent(); });
}
$('#asst').onclick = () => { if ($('#drawer').hidden) drawerOpen(); else $('#drawer').hidden = true; }; $('#dclose').onclick = () => { $('#drawer').hidden = true; };
const bub = (t, c) => { const d = document.createElement('div'); d.className = 'bub ' + c; if (c === 'bot typing-w') d.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; else d.textContent = t; $('#chat').appendChild(d); $('#chat').scrollTop = 1e9; return d; };
function memCard(note) {
  const el = document.createElement('div'); el.className = 'dr mem';
  el.innerHTML = `<div class="h">${YL('sm')} Yerleny quiere recordar</div><div class="txt">“${esc(note)}”</div><div class="row" style="margin-top:0"><button class="btn btn-primary btn-sm" data-mem="y">Guardar en su memoria</button><button class="btn btn-ghost btn-sm" data-mem="n">No</button></div>`;
  el.querySelector('[data-mem="y"]').onclick = async () => { try { S.yer = await api('/api/yerleny/notes', { note }); el.innerHTML = `<div class="h">${YL('sm')} Guardado</div><div class="mut">Yerleny lo recordará a partir de ahora.</div>`; } catch (e) { fail(e); } };
  el.querySelector('[data-mem="n"]').onclick = () => el.remove();
  $('#chat').appendChild(el);
}
async function askAgent() {
  const t = $('#ci').value.trim(); if (!t || !needAi()) return; $('#ci').value = ''; $$('.sug').forEach(e => e.remove()); bub(t, 'me'); const w = bub('', 'bot typing-w'); busy($('#cgo'), true);
  try {
    const r = await api(`/api/ai/agent?account=${encodeURIComponent(firstAcct())}`, { history: S.hist, text: t }); S.hist = r.history; w.className = 'bub bot'; w.textContent = r.reply || '(sin respuesta)';
    for (const mm of r.memories || []) memCard(mm);
    for (const d of r.drafts) {
      const el = document.createElement('div'); el.className = 'dr'; el.innerHTML = `<div class="h">${I('pencil', 'sm')} Borrador listo</div><div class="meta"><b>Para:</b> ${esc(d.to)}<br><b>Asunto:</b> ${esc(d.subject)}</div><div class="txt">${esc(d.body)}</div>`;
      const b = document.createElement('button'); b.className = 'btn btn-primary btn-sm'; b.textContent = 'Revisar y enviar'; b.onclick = () => compose({ to: d.to, subject: d.subject, text: d.body }); el.appendChild(b); $('#chat').appendChild(el);
    }
  } catch (e) { w.className = 'bub bot err'; w.textContent = e.message; }
  busy($('#cgo'), false); $('#chat').scrollTop = 1e9;
}
$('#cgo').onclick = askAgent; $('#ci').onkeydown = e => { if (e.key === 'Enter') askAgent(); };

/* ---------- modal y ajustes ---------- */
let modalTimer = null;
function openModal(html, narrow) { const b = $('#mbox'); b.className = narrow ? 'narrow' : ''; b.innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; clearInterval(modalTimer); oauthPoll && clearInterval(oauthPoll); }
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
$('#cfg').onclick = () => settings('cuentas');
const TABS = [['cuentas', 'user', 'Cuentas'], ['archivo', 'hdd', 'Archivo local'], ['ia', 'sparkles', 'Yerleny'], ['firma', 'pencil', 'Firma'], ['envio', 'clock', 'Envío'], ['salida', 'send', 'Salida']];
function settings(tab = 'cuentas', pre) {
  openModal(`<nav class="set-nav"><h3>Ajustes</h3>${TABS.map(([k, ic, l]) => `<div class="nav ${k === tab ? 'on' : ''}" data-tab="${k}" role="button" tabindex="0">${I(ic)}<span>${l}</span></div>`).join('')}</nav><div class="set-body" id="sbody"><button class="iconbtn set-close" id="mx" aria-label="Cerrar">${I('x')}</button><div id="tabc"><div class="wait"><div class="spin"></div></div></div></div>`);
  clearInterval(modalTimer); $('#mx').onclick = closeModal; $$('[data-tab]').forEach(n => n.onclick = () => settings(n.dataset.tab));
  ({ cuentas: tabCuentas, archivo: tabArchivo, ia: tabIA, firma: tabFirma, envio: tabEnvio, salida: tabSalida })[tab]($('#tabc'), pre).catch(e => { $('#tabc').innerHTML = `<p class="err">${esc(e.message)}</p>`; });
}
const provMark = { google: ['G', '#d9483b'], microsoft: ['M', '#2a6fdb'], imap: ['@', '#6b6558'] };

async function tabCuentas(c, pre) {
  const accts = await api('/api/accounts'); S.accounts = accts;
  c.innerHTML = `<h3>Cuentas</h3><p class="lead">Conecta tus correos. Las contraseñas y tokens se guardan solo en este equipo.</p>
    ${accts.map(a => `<div class="acct-row">${avatar(a.email, a.email)}<div class="grow"><b>${esc(a.email)}</b><span class="mut">${a.auth === 'oauth' ? `Conectada con ${a.provider === 'google' ? 'Google' : 'Microsoft'} (OAuth, sin contraseña)` : 'Usuario y contraseña (IMAP/SMTP)'}</span></div>${a.auth === 'oauth' ? `<button class="btn btn-sm" data-recon="${esc(a.provider)}" data-email="${esc(a.email)}">Reconectar</button>` : ''}<button class="btn btn-ghost btn-sm" data-del="${esc(a.id)}">Quitar</button></div>`).join('') || '<div class="note">Aún no hay cuentas.</div>'}
    <h4>Añadir cuenta</h4>
    <div class="add-cards">
      <button class="add-card" data-add="google"><span class="mk" style="background:${provMark.google[1]}">G</span><b>Gmail / Google</b><span>Inicio de sesión seguro con OAuth. Sin contraseñas.</span></button>
      <button class="add-card" data-add="microsoft"><span class="mk" style="background:${provMark.microsoft[1]}">M</span><b>Outlook / Microsoft</b><span>Outlook.com, Hotmail y Microsoft 365 con OAuth.</span></button>
      <button class="add-card" data-add="imap"><span class="mk" style="background:${provMark.imap[1]}">@</span><b>Otra cuenta (IMAP)</b><span>Yahoo, iCloud, Fastmail, tu dominio…</span></button>
    </div><div id="addpane"></div>`;
  $$('[data-add]').forEach(b => b.onclick = () => addPane(b.dataset.add));
  $$('[data-recon]').forEach(b => b.onclick = () => addPane(b.dataset.recon, b.dataset.email));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('¿Quitar esta cuenta de CasaMail? (No borra tus correos.)')) { await api('/api/accounts/' + encodeURIComponent(b.dataset.del), undefined, 'DELETE'); await init(); settings('cuentas'); } });
  if (pre) addPane(pre);
}
const copyBtn = t => `<button class="iconbtn sm" data-copy="${esc(t)}" aria-label="Copiar" title="Copiar">${I('copy', 'sm')}</button>`;
async function addPane(kind, hint) {
  $$('.add-card').forEach(b => b.classList.toggle('on', b.dataset.add === kind)); const p = $('#addpane'); p.className = 'pane-add';
  if (kind === 'imap') {
    const pr = await api('/api/presets');
    p.innerHTML = `<b>Cuenta con usuario y contraseña</b><label class="lb">Proveedor</label><select id="np" class="field" style="border-radius:10px;height:auto">${pr.filter(x => !['gmail', 'outlook'].includes(x.id)).map(x => `<option>${esc(x.id)}</option>`).join('')}<option value="otro">Otro (IMAP/SMTP propio)</option><option value="gmail">Gmail con contraseña de aplicación</option><option value="outlook">Outlook con contraseña de aplicación</option></select><div class="mut" id="pn" style="font-size:12.5px;margin-top:4px"></div>
      <label class="lb">Email</label><input id="ne" type="email" class="field" autocomplete="off"><label class="lb">Contraseña (o contraseña de aplicación)</label><input id="nw" type="password" class="field" autocomplete="new-password">
      <div id="nm" hidden><label class="lb">Servidor IMAP</label><input id="ni" class="field" placeholder="imap.midominio.com"><label class="lb">Puerto IMAP</label><input id="nip" class="field" value="993"><label class="lb">Servidor SMTP</label><input id="ns" class="field" placeholder="smtp.midominio.com"><label class="lb">Puerto SMTP (465 SSL · 587 STARTTLS)</label><input id="nsp" class="field" value="465"></div>
      <div class="row" style="margin-top:16px"><button class="btn btn-primary" id="na">Probar y guardar</button><span id="nst" class="mut"></span></div>`;
    const notes = Object.fromEntries(pr.map(x => [x.id, x.note])); const upd = () => { $('#nm').hidden = $('#np').value !== 'otro'; $('#pn').textContent = notes[$('#np').value] || ''; }; $('#np').onchange = upd; upd();
    $('#na').onclick = async e => { const b = e.currentTarget; busy(b, true); $('#nst').textContent = 'Probando IMAP y SMTP…'; try { await api('/api/accounts', { email: $('#ne').value.trim(), pass: $('#nw').value, preset: $('#np').value, imapHost: $('#ni').value, imapPort: Number($('#nip').value), smtpHost: $('#ns').value, smtpPort: Number($('#nsp').value) }); closeModal(); toast('Cuenta añadida'); init(); } catch (x) { $('#nst').innerHTML = `<span class="err">${esc(x.message)}</span>`; busy(b, false); } };
    return;
  }
  const cl = await api('/api/oauth/clients'), cur = cl[kind], name = kind === 'google' ? 'Google' : 'Microsoft', redirect = kind === 'google' ? cl.redirect.google : 'http://localhost/oauth/callback';
  const steps = kind === 'google'
    ? `<li><span>Entra a <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a> y crea un proyecto (gratis).</span></li><li><span>En <b>Pantalla de consentimiento</b>: tipo <b>Externo</b>, añade tu correo como usuario de prueba y, para que la conexión no caduque a los 7 días, pulsa <b>Publicar aplicación</b>.</span></li><li><span>En <b>Credenciales → Crear credenciales → ID de cliente OAuth</b> elige <b>Aplicación de escritorio</b>.</span></li><li><span>Copia el <b>ID de cliente</b> y el <b>secreto</b> y pégalos abajo.</span></li>`
    : `<li><span>Entra a <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener">Azure → Registros de aplicaciones</a> y crea uno nuevo con cuentas “en cualquier directorio y cuentas personales”.</span></li><li><span>En <b>Autenticación</b> añade la plataforma <b>Móvil y escritorio</b> con este URI de redirección y activa <b>Permitir flujos de cliente público</b>:${`<div class="copy"><span style="flex:1">${esc(redirect)}</span>${copyBtn(redirect)}</div>`}</span></li><li><span>En <b>Permisos de API → Office 365 Exchange Online → Delegados</b> añade <b>IMAP.AccessAsUser.All</b> y <b>SMTP.Send</b>.</span></li><li><span>Copia el <b>Id. de aplicación (cliente)</b> y pégalo abajo. En cuentas de trabajo, el administrador debe permitir SMTP AUTH.</span></li>`;
  p.innerHTML = `<div class="row" style="margin:0 0 4px"><span class="mk" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;font-weight:800;background:${provMark[kind][1]}">${provMark[kind][0]}</span><b style="font-size:16px">${hint ? 'Reconectar' : 'Conectar'} con ${name}</b></div>
    <p class="mut" style="margin:6px 0 0">Se abrirá una ventana de ${name} para que autorices el acceso. CasaMail nunca ve tu contraseña y los permisos se guardan solo en este equipo.</p>
    <details ${cur ? '' : 'open'}><summary>${cur ? 'Credenciales de la aplicación (ya configuradas)' : 'Primero: crea tu credencial gratuita (una sola vez)'}</summary><ol class="steps">${steps}</ol>
      <label class="lb">${kind === 'google' ? 'ID de cliente' : 'Id. de aplicación (cliente)'}</label><input id="ocid" class="field" value="${esc(cur?.clientId || '')}" autocomplete="off" spellcheck="false">
      ${kind === 'google' ? `<label class="lb">Secreto de cliente</label><input id="ocs" class="field" type="password" placeholder="${cur?.hasSecret ? '•••• (guardado)' : ''}" autocomplete="off">` : `<label class="lb">Inquilino (opcional; déjalo vacío salvo que tu app sea de un solo directorio)</label><input id="oct" class="field" value="${esc(cur?.tenant || '')}" placeholder="common" autocomplete="off">`}</details>
    <div class="row"><button class="btn btn-primary" id="ogo">${I('lock', 'sm')} ${hint ? 'Reconectar' : 'Conectar'} con ${name}</button><span id="ost" class="mut"></span></div>`;
  $$('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('Copiado'); });
  $('#ogo').onclick = () => oauthConnect(kind, hint);
}
let oauthPoll = null;
function oauthConnect(provider, hint) {
  // En la app de escritorio la autorización se abre en el navegador del sistema (Google/Microsoft bloquean los navegadores embebidos).
  const desktop = /Electron\//.test(navigator.userAgent);
  const popup = desktop ? null : window.open('about:blank', 'cm_oauth', 'width=520,height=740'); // dentro del gesto del usuario, para que no lo bloqueen
  const v = id => $(id)?.value.trim() || undefined, p = $('#addpane');
  if (!v('#ocid') && !$('#ocid')?.value) { popup && popup.close(); $('#ost').innerHTML = '<span class="err">Pega primero el ID de cliente.</span>'; return; }
  api('/api/oauth/start', { provider, clientId: v('#ocid'), clientSecret: v('#ocs'), tenant: v('#oct'), loginHint: hint }).then(r => {
    if (popup) popup.location.href = r.url; else if (desktop) window.open(r.url);
    p.innerHTML = `<div class="wait"><div class="spin"></div><b>Esperando tu autorización…</b><span class="mut">Termina el inicio de sesión en la ventana que se abrió.</span>${popup ? '' : `<a class="btn ${desktop ? '' : 'btn-primary'}" href="${esc(r.url)}" target="_blank" rel="noopener">${desktop ? 'Volver a abrir en el navegador' : 'Abrir enlace de autorización'}</a>`}<button class="btn btn-ghost btn-sm" id="ocx">Cancelar</button></div>`;
    $('#ocx').onclick = () => { clearInterval(oauthPoll); popup && popup.close(); addPane(provider, hint); };
    clearInterval(oauthPoll); const t0 = Date.now();
    oauthPoll = setInterval(async () => {
      if ($('#modal').hidden || Date.now() - t0 > 10 * 6e4) return clearInterval(oauthPoll);
      try {
        const s = await api('/api/oauth/status/' + r.state);
        if (s.status === 'done') { clearInterval(oauthPoll); popup && popup.close(); closeModal(); toast(`${s.email} conectada`); await init(); }
        else if (s.status === 'error' || s.status === 'unknown') { clearInterval(oauthPoll); p.innerHTML = `<div class="wait"><div class="big" style="width:56px;height:56px;border-radius:18px;background:var(--bad-soft);color:var(--bad);display:grid;place-items:center">${I('spam')}</div><b>No se pudo conectar</b><span class="err">${esc(s.error || 'La solicitud caducó.')}</span><button class="btn" id="ore">Reintentar</button></div>`; $('#ore').onclick = () => addPane(provider, hint); }
      } catch { /* reintenta */ }
    }, 1500);
  }).catch(e => { popup && popup.close(); $('#ost').innerHTML = `<span class="err">${esc(e.message)}</span>`; });
}

async function tabIA(c) {
  const [pr, eng0, yer, loc0] = await Promise.all([api('/api/ai/presets'), api('/api/ai/engines').catch(() => []), api('/api/yerleny'), api('/api/ai/local').catch(() => null)]);
  S.yer = yer; let engines = eng0, loc = loc0, chosen = null;
  const labels = { local: 'Integrado en la app', gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter', cerebras: 'Cerebras', ollama: 'Ollama (tu equipo)', lmstudio: 'LM Studio (tu equipo)', anthropic: 'Anthropic (Claude)', openai: 'OpenAI', deepseek: 'DeepSeek', mistral: 'Mistral', custom: 'Otro (compatible con OpenAI)' };
  const tones = [['', 'Neutro'], ['profesional y cercano', 'Profesional y cercano'], ['formal', 'Formal'], ['cercano y amable', 'Cercano y amable'], ['breve y directo', 'Breve y directo'], ['cercano y con humor', 'Cercano y con humor']];
  const notes = n => n.length ? n.map((t, i) => `<div class="out-row" style="padding:8px 12px"><span class="grow">${esc(t)}</span><button class="iconbtn sm" data-rn="${i}" aria-label="Olvidar" title="Olvidar">${I('x', 'sm')}</button></div>`).join('') : '<p class="mut">Aún no recuerda nada. Dile “recuerda que firmo como…” en el chat, o añade una nota aquí.</p>';
  const nameOf = e => (labels[e.preset] || e.preset || e.provider) + ' · ' + (e.provider === 'local' ? (loc?.models.find(m => m.id === e.model)?.label || e.model) : e.model);
  const isFree = e => e.provider === 'local' || pr[e.preset]?.free;

  c.innerHTML = `<div class="yhero">${YL('lg')}<div><h3>Yerleny</h3><p class="lead" style="margin:2px 0 0">La IA de CasaMail: resume, redacta, busca y ordena tu bandeja. Piensa con el motor que le conectes y recuerda cómo te gusta escribir.</p></div></div>
    <h4>Motores (en orden de uso)</h4>
    <p class="mut small" style="margin-top:0">Yerleny usa el primero. Si falla (límite gratuito agotado, sin internet, clave inválida…), <b>prueba el siguiente automáticamente</b>.</p>
    <div id="englist"></div>
    <h4>Añadir un motor gratuito</h4>
    <div class="note ok-note">${I('lock')}<span><b>Integrado</b> = sin cuenta, sin clave, sin internet y tus correos no salen del equipo. <b>En la nube</b> = más potente y rápido, pero necesita una clave gratuita y el contenido de los correos que uses con Yerleny viaja a ese proveedor.</span></div>
    <div class="tiers" id="localbox"></div>
    <div class="row" id="cloudchips" style="margin-top:14px"><b class="small" style="margin-right:4px">En la nube (capa gratuita):</b>${['gemini', 'groq', 'openrouter', 'cerebras'].map(k => `<button class="btn btn-sm" data-cloud="${k}">${labels[k]}</button>`).join('')}</div>
    <div id="cloudpane"></div>
    <details class="adv" style="margin-top:18px"><summary>Avanzado: Claude, OpenAI, Ollama, LM Studio u otro compatible</summary>
      <div class="note warn" style="margin-top:12px">${I('shield')}<span>El contenido de los correos que uses con Yerleny se envía al proveedor del motor. Con <b>Ollama</b> o <b>LM Studio</b> todo se queda en tu equipo.</span></div>
      <label class="lb">Proveedor</label><select id="ap" class="field" style="height:auto;border-radius:10px">${Object.keys(pr).map(k => `<option value="${k}" ${engines[0]?.preset === k ? 'selected' : ''}>${labels[k] || k}</option>`).join('')}</select>
      <label class="lb">URL base de la API</label><input id="au" class="field" value="${esc(engines[0]?.baseUrl || '')}" spellcheck="false">
      <label class="lb">Modelo</label><input id="am" class="field" list="ml" value="${esc(engines[0]?.model || '')}" spellcheck="false"><datalist id="ml"></datalist>
      <label class="lb">API key ${engines[0]?.hasKey ? '(guardada; déjala igual para conservarla)' : ''}</label><input id="ak" class="field" type="password" value="${esc(engines[0]?.apiKey || '')}" placeholder="sk-…" autocomplete="off">
      <div class="row" style="margin-top:16px"><button class="btn btn-primary" id="as">Guardar como motor principal</button><button class="btn" id="aa">Añadir como respaldo</button><button class="btn" id="at">Probar conexión</button><button class="btn" id="ad" hidden>Detectar Ollama</button><span id="ast" class="mut"></span></div>
    </details>
    <h4>Personalidad y memoria</h4>
    <div class="grid2"><div><label class="lb" style="margin-top:0">¿Cómo te llamas?</label><input id="yn" class="field" value="${esc(yer.userName || '')}" placeholder="Tu nombre"></div><div><label class="lb" style="margin-top:0">Idioma habitual</label><input id="yl" class="field" value="${esc(yer.language || '')}" placeholder="Español"></div></div>
    <label class="lb">Tu estilo al escribir</label><select id="yt" class="field" style="height:auto;border-radius:10px;max-width:340px">${tones.map(([v, l]) => `<option value="${esc(v)}" ${v === (yer.tone || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="row"><button class="btn btn-primary" id="ys">Guardar preferencias</button><span id="yst" class="mut"></span></div>
    <label class="lb" style="margin-top:20px">Lo que Yerleny recuerda de ti</label><div id="ynotes">${notes(yer.notes)}</div>
    <div class="row"><input id="yni" class="field" style="flex:1" placeholder="Ej.: Firmo como Sam · Mi jefa es Marta Ruiz" maxlength="300"><button class="btn" id="yna">Recordar</button></div>`;

  // ---- lista de motores ----
  const saveEngines = async list => { engines = await api('/api/ai/engines', { engines: list }); S.aiOk = engines.length > 0; drawEngines(); };
  const drawEngines = () => {
    $('#englist').innerHTML = engines.length ? engines.map((e, i) => `<div class="acct-row"><span class="avatar sm" style="background:${e.provider === 'local' ? 'var(--ok)' : 'var(--brand)'}">${i + 1}</span><div class="grow"><b>${esc(nameOf(e))}</b><span class="mut">${i === 0 ? 'Principal' : 'Respaldo'}${isFree(e) ? ' · <span class="ok">Gratis</span>' : ''}${e.provider === 'local' ? ' · en tu equipo' : ''}</span><span class="small" id="et-${esc(e.id)}"></span></div>
      <button class="iconbtn sm" data-up="${i}" aria-label="Subir" title="Subir" ${i === 0 ? 'disabled' : ''}>${I('back', 'sm').replace('<svg', '<svg style="transform:rotate(90deg)"')}</button><button class="iconbtn sm" data-down="${i}" aria-label="Bajar" title="Bajar" ${i === engines.length - 1 ? 'disabled' : ''}>${I('back', 'sm').replace('<svg', '<svg style="transform:rotate(-90deg)"')}</button>
      <button class="btn btn-sm" data-test="${esc(e.id)}">Probar</button><button class="btn btn-ghost btn-sm" data-rm="${esc(e.id)}">Quitar</button></div>`).join('')
      : `<div class="note warn">${I('sparkles')}<span>Yerleny todavía no tiene motor. Elige uno gratuito aquí abajo: el <b>integrado</b> no necesita cuenta.</span></div>`;
    $$('#englist [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up, l = engines.map(e => ({ ...e })); [l[i - 1], l[i]] = [l[i], l[i - 1]]; saveEngines(l); });
    $$('#englist [data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down, l = engines.map(e => ({ ...e })); [l[i + 1], l[i]] = [l[i], l[i + 1]]; saveEngines(l); });
    $$('#englist [data-rm]').forEach(b => b.onclick = () => saveEngines(engines.filter(e => e.id !== b.dataset.rm)));
    $$('#englist [data-test]').forEach(b => b.onclick = async () => { const el = $('#et-' + b.dataset.test); el.innerHTML = ' · probando…'; try { const r = await api('/api/ai/test', { engineId: b.dataset.test }); el.innerHTML = ` · <span class="ok">funciona ✔ (${esc(r.reply)})</span>`; } catch (x) { el.innerHTML = ` · <span class="err">${esc(x.message)}</span>`; } });
    drawLocal();
  };
  const addEngine = async e => { await saveEngines([...engines.map(x => ({ ...x })), e]); };

  // ---- motor integrado ----
  let localTimer = null;
  const drawLocal = () => {
    const box = $('#localbox'); if (!box) return;
    if (!loc) { box.innerHTML = ''; return; }
    if (!loc.available) { box.innerHTML = `<div class="note warn">${I('shield')}<span>El motor integrado no está disponible en este sistema. Usa una opción en la nube o instala Ollama. <span class="mut">(${esc(loc.error)})</span></span></div>`; return; }
    const d = loc.download;
    box.innerHTML = loc.models.map(m => {
      const using = engines.some(e => e.provider === 'local' && e.model === m.id), dling = d.state === 'downloading' && d.id === m.id, p = d.total ? Math.min(1, d.downloaded / d.total) : 0;
      return `<div class="tier ${m.id === loc.recommended ? 'rec' : ''}"><div class="row" style="margin:0"><b class="grow">${esc(m.label)}</b>${m.id === loc.recommended ? '<span class="badge ai">Recomendado para tu equipo</span>' : ''}<span class="badge">${(m.bytes / 1e9).toFixed(1)} GB</span></div>
        <p class="mut small" style="margin:6px 0">${esc(m.blurb)}${m.fits ? '' : ` <span class="err">Tu equipo tiene ${loc.ramGB} GB de RAM: puede ir justo.</span>`}</p>
        ${dling ? `<div class="pbar"><i style="width:${Math.round(p * 100)}%"></i></div><div class="mut small">Descargando… ${fmtSize(d.downloaded)} de ${fmtSize(d.total)} (${Math.round(p * 100)}%) <button class="btn btn-ghost btn-sm" data-lcancel="1">Cancelar</button></div>`
          : using ? `<div class="ok small"><b>En uso ✔</b></div>`
          : m.ready ? `<div class="row" style="margin:0"><button class="btn btn-primary btn-sm" data-luse="${m.id}">Usar este motor</button><button class="btn btn-ghost btn-sm" data-ldel="${m.id}">Borrar del disco</button></div>`
          : `<button class="btn btn-primary btn-sm" data-ldl="${m.id}" ${d.state === 'downloading' ? 'disabled' : ''}>${I('download', 'sm')} Descargar (${(m.bytes / 1e9).toFixed(1)} GB, una sola vez)</button>`}
        ${d.state === 'error' && d.id === m.id ? `<div class="err small">${esc(d.error || 'Error en la descarga')}</div>` : ''}</div>`;
    }).join('') + `<p class="mut small" style="grid-column:1/-1;margin:0">Modelos abiertos con licencia Apache-2.0. Se guardan en <code>${esc(loc.dir)}</code>. El motor integrado es más limitado que Claude, GPT o Gemini: va muy bien para resumir, traducir y reescribir; para el asistente con herramientas, el modelo <b>potente</b> o uno en la nube es más fiable. En equipos sin tarjeta gráfica el modelo potente es lento.</p>`;
    $$('[data-ldl]').forEach(b => b.onclick = async () => { try { loc.download = await api('/api/ai/local/download', { id: b.dataset.ldl }); drawLocal(); watchLocal(); } catch (e) { toast(e.message, { kind: 'bad' }); } });
    $$('[data-lcancel]').forEach(b => b.onclick = async () => { loc.download = await api('/api/ai/local/cancel', {}); drawLocal(); });
    $$('[data-luse]').forEach(b => b.onclick = () => addEngine({ provider: 'local', baseUrl: '', apiKey: '', model: b.dataset.luse, preset: 'local' }).then(() => toast('Yerleny ya piensa en tu equipo')));
    $$('[data-ldel]').forEach(b => b.onclick = async () => { if (!confirm('¿Borrar el modelo del disco? Podrás volver a descargarlo.')) return; await api('/api/ai/local/' + b.dataset.ldel, undefined, 'DELETE'); await saveEngines(engines.filter(e => !(e.provider === 'local' && e.model === b.dataset.ldel))); loc = await api('/api/ai/local'); drawLocal(); });
  };
  const watchLocal = () => { clearInterval(localTimer); localTimer = setInterval(async () => { if ($('#modal').hidden || !$('#localbox')) return clearInterval(localTimer); try { loc = await api('/api/ai/local'); drawLocal(); if (loc.download.state !== 'downloading') { clearInterval(localTimer); if (loc.download.state === 'done') toast('Modelo descargado: ya puedes usarlo'); } } catch { /* sin servidor */ } }, 1000); };

  // ---- nube con capa gratuita ----
  $$('[data-cloud]').forEach(b => b.onclick = async () => {
    const k = b.dataset.cloud, p = pr[k]; chosen = k;
    $('#cloudpane').innerHTML = `<div class="pane-add"><div class="row" style="margin:0"><b style="font-size:16px">${labels[k]}</b><span class="badge ai">Capa gratuita</span></div><p class="mut small" style="margin:6px 0 0">${esc(p.note || '')} Los límites de uso gratis los fija el proveedor y pueden cambiar.</p>
      <ol class="steps"><li><span>Abre <a href="${esc(p.signup)}" target="_blank" rel="noopener">${esc(p.signup.replace(/^https:\/\//, ''))}</a> e inicia sesión.</span></li><li><span>Crea una clave de API (gratis; normalmente sin tarjeta).</span></li><li><span>Pégala aquí:</span></li></ol>
      <input id="ck" class="field" type="password" placeholder="Pega tu clave de API" autocomplete="off" spellcheck="false">
      <div class="row"><button class="btn" id="cdet">Detectar modelos disponibles</button><select id="cmod" class="field" style="width:auto;max-width:100%"><option value="${esc(p.model)}">${esc(p.model)}</option></select></div>
      <div class="row"><button class="btn btn-primary" id="cadd">Probar y añadir</button><span id="cst" class="mut"></span></div></div>`;
    $('#cdet').onclick = async () => {
      $('#cst').textContent = 'Buscando modelos…';
      try { const r = await api('/api/ai/models', { preset: k, apiKey: $('#ck').value }); const best = r.models.find(m => m.free && m.tools !== false) || r.models.find(m => m.id === p.model) || r.models[0];
        $('#cmod').innerHTML = r.models.map(m => `<option value="${esc(m.id)}" ${m.id === best?.id ? 'selected' : ''}>${esc(m.id)}${m.free ? ' · gratis' : ''}${m.tools === false ? ' · sin herramientas' : ''}</option>`).join(''); $('#cst').innerHTML = `<span class="ok">${r.models.length} modelos</span>`; }
      catch (e) { $('#cst').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    };
    $('#cadd').onclick = async e => {
      const eng = { provider: p.provider, baseUrl: p.baseUrl, apiKey: $('#ck').value.trim(), model: $('#cmod').value, preset: k };
      if (!eng.apiKey) { $('#cst').innerHTML = '<span class="err">Pega primero tu clave.</span>'; return; }
      busy(e.currentTarget, true); $('#cst').textContent = 'Probando…';
      try { const t = await api('/api/ai/test', { engine: eng }); await addEngine(eng); $('#cloudpane').innerHTML = `<div class="note ok-note">${I('check')}<span><b>${esc(labels[k])}</b> conectado ✔ (respondió “${esc(t.reply)}”). Ya está en la lista de motores.</span></div>`; }
      catch (x) { $('#cst').innerHTML = `<span class="err">${esc(x.message)}</span>`; busy($('#cadd'), false); }
    };
  });

  // ---- avanzado ----
  const fill = () => { const q = pr[$('#ap').value]; if (!q) return; $('#au').value = q.baseUrl; $('#am').value = q.model; $('#ak').placeholder = q.needsKey ? 'sk-…' : 'No hace falta en local'; $('#ad').hidden = $('#ap').value !== 'ollama'; };
  if (!engines[0] || engines[0].provider === 'local') fill(); $('#ad').hidden = $('#ap').value !== 'ollama'; $('#ap').onchange = fill;
  const form = () => ({ provider: pr[$('#ap').value].provider, baseUrl: $('#au').value, model: $('#am').value, apiKey: $('#ak').value, preset: $('#ap').value });
  $('#as').onclick = async () => { try { await api('/api/ai/config', form()); engines = await api('/api/ai/engines'); S.aiOk = true; drawEngines(); $('#ast').innerHTML = '<span class="ok">Guardado ✔</span>'; } catch (x) { $('#ast').innerHTML = `<span class="err">${esc(x.message)}</span>`; } };
  $('#aa').onclick = async () => { try { await addEngine({ ...form() }); $('#ast').innerHTML = '<span class="ok">Añadido como respaldo ✔</span>'; } catch (x) { $('#ast').innerHTML = `<span class="err">${esc(x.message)}</span>`; } };
  $('#at').onclick = async () => { $('#ast').textContent = 'Probando…'; try { const r = await api('/api/ai/test', { engine: form() }); $('#ast').innerHTML = `<span class="ok">Funciona ✔ (${esc(r.reply)})</span>`; } catch (x) { $('#ast').innerHTML = `<span class="err">${esc(x.message)}</span>`; } };
  $('#ad').onclick = async () => {
    $('#ast').textContent = 'Buscando Ollama…'; const r = await api('/api/ai/ollama');
    if (!r.running) { $('#ast').innerHTML = '<span class="err">No encontré Ollama. Instálalo desde ollama.com y ejecuta <code>ollama pull llama3.1</code>.</span>'; return; }
    $('#ml').innerHTML = r.models.map(m => `<option value="${esc(m)}">`).join(''); if (r.models.length && !r.models.includes($('#am').value)) $('#am').value = r.models[0];
    $('#ast').innerHTML = `<span class="ok">Ollama detectado: ${r.models.length} modelo${r.models.length === 1 ? '' : 's'}.</span>`;
  };

  // ---- personalidad y memoria ----
  $('#ys').onclick = async () => { try { S.yer = await api('/api/yerleny', { userName: $('#yn').value, language: $('#yl').value, tone: $('#yt').value }); $('#yst').innerHTML = '<span class="ok">Guardado ✔</span>'; $('#chat').innerHTML = ''; } catch (x) { $('#yst').innerHTML = `<span class="err">${esc(x.message)}</span>`; } };
  const redraw = y => { S.yer = y; $('#ynotes').innerHTML = notes(y.notes); bindNotes(); };
  const bindNotes = () => $$('#ynotes [data-rn]').forEach(b => b.onclick = async () => redraw(await api('/api/yerleny/notes/' + b.dataset.rn, undefined, 'DELETE')));
  $('#yna').onclick = async () => { const t = $('#yni').value.trim(); if (!t) return; redraw(await api('/api/yerleny/notes', { note: t })); $('#yni').value = ''; };
  $('#yni').onkeydown = e => { if (e.key === 'Enter') $('#yna').click(); };
  bindNotes(); drawEngines(); if (loc?.download?.state === 'downloading') watchLocal();
}
async function tabFirma(c) {
  const a = await api('/api/accounts'), s = (await api('/api/settings')).signatures || {};
  c.innerHTML = `<h3>Firma</h3><p class="lead">Se añade al final de tus mensajes nuevos y respuestas.</p>${a.map(x => `<label class="lb">${esc(x.email)}</label><textarea data-id="${esc(x.id)}" class="field sg" rows="3">${esc(s[x.id] || '')}</textarea>`).join('') || '<div class="note">Añade una cuenta primero.</div>'}<div class="row" style="margin-top:16px"><button class="btn btn-primary" id="sgs">Guardar firmas</button></div>`;
  $('#sgs').onclick = async () => { const o = {}; $$('.sg').forEach(t => o[t.dataset.id] = t.value); await api('/api/settings', { signatures: o }); S.sig = o; toast('Firmas guardadas'); };
}
async function tabEnvio(c) {
  const d = (await api('/api/send-delay')).minutes;
  c.innerHTML = `<h3>Envío</h3><p class="lead">Un correo ya enviado no se puede recuperar. Por eso CasaMail lo retiene unos minutos antes de enviarlo: en ese plazo puedes <b>retirarlo</b> y el destinatario nunca lo recibe.</p>
    <label class="lb">Retener los mensajes antes de enviarlos</label><select id="sd" class="field" style="height:auto;border-radius:10px;max-width:340px">${[[10, '10 minutos (máximo, recomendado)'], [5, '5 minutos'], [2, '2 minutos'], [1, '1 minuto'], [0, 'No retener: enviar al instante']].map(([v, l]) => `<option value="${v}" ${v == d ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="note">${I('clock')}<span>La app debe estar abierta para que el mensaje salga a su hora; si la cierras, sale cuando la vuelvas a abrir. “Enviar ya” lo manda al instante, y entonces ya no se puede retirar.</span></div>
    <div class="row"><button class="btn btn-primary" id="sds">Guardar</button></div>`;
  $('#sds').onclick = async () => { await api('/api/settings', { sendDelayMin: Number($('#sd').value) }); S.delay = Number($('#sd').value); toast('Guardado'); };
}
async function tabSalida(c) {
  const draw = async () => {
    const s = await api('/api/outbox'); outboxCount(); if ($('#modal').hidden || !$('#tabc')) return;
    c.innerHTML = `<h3>Bandeja de salida</h3><p class="lead">Los mensajes esperan aquí antes de salir. Mientras quede tiempo puedes <b>retirarlos</b>; pasado el plazo (máx. 10 min) ya no es posible.</p>` +
      (s.length ? s.map(x => `<div class="out-row"><div class="grow"><b>${esc(x.to)}</b> — ${esc(x.subject || '(sin asunto)')}<br><span class="mut">${x.kind === 'scheduled' ? 'Programado para ' + new Date(x.sendAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : (x.canCancel ? `Saldrá en ${fmtLeft(x.sendAt - Date.now())} · aún puedes retirarlo` : 'Enviándose… ya no se puede retirar')}${x.error ? ` · <span class="err">${esc(x.error)}</span>` : ''}</span></div>${x.canCancel ? `<button class="btn btn-sm" data-oc="${esc(x.id)}">${x.kind === 'scheduled' ? 'Cancelar' : 'Retirar'}</button>` : ''}${x.canCancel && x.kind === 'outbox' ? `<button class="btn btn-ghost btn-sm" data-on="${esc(x.id)}">Enviar ahora</button>` : ''}</div>`).join('') : `<div class="empty"><div class="big">${I('send', 'lg')}</div><h3>Salida vacía</h3><p>No hay mensajes esperando.</p></div>`);
    $$('[data-oc]').forEach(b => b.onclick = async () => { try { await api('/api/outbox/' + b.dataset.oc, undefined, 'DELETE'); toast('Retirado: no se enviará'); } catch (e) { toast(e.message, { kind: 'bad', ms: 7000 }); } draw(); });
    $$('[data-on]').forEach(b => b.onclick = async () => { if (!confirm('Se enviará ahora y ya no podrás retirarlo.')) return; try { await api('/api/outbox/' + b.dataset.on + '/now', {}); toast('Enviado ✔'); } catch (e) { toast(e.message, { kind: 'bad' }); } draw(); });
  };
  await draw(); modalTimer = setInterval(() => draw().catch(() => {}), 15000);
}

/* ---------- Archivo local: importar / descargar / liberar espacio ---------- */
const etaOf = j => { if (j.state !== 'running' || j.progress < 0.02) return ''; const left = ((Date.now() - j.startedAt) / 1000) * (1 - j.progress) / j.progress; return ' · quedan ~' + (left > 3600 ? (left / 3600).toFixed(1) + ' h' : left > 60 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s'); };
const jobCard = j => `<div class="jobcard ${j.state}"><div class="row" style="margin:0"><b class="grow">${esc(j.label)}</b><span class="badge ${j.state === 'error' ? 'hi' : j.state === 'done' ? 'ai' : ''}">${({ running: 'En curso', done: 'Listo', error: 'Error', cancelled: 'Cancelado' })[j.state]}</span>${j.state === 'running' ? `<button class="btn btn-sm" data-jc="${esc(j.id)}">Cancelar</button>` : ''}</div>
  <div class="pbar"><i style="width:${Math.round(j.progress * 100)}%"></i></div>
  <div class="mut small">${Math.round(j.progress * 100)}%${etaOf(j)} · ${j.type === 'offload' ? `${j.added.toLocaleString('es')} copiados · ${j.deleted.toLocaleString('es')} borrados del servidor` : `${j.added.toLocaleString('es')} importados`} · ${j.skipped.toLocaleString('es')} ya estaban${j.failed ? ` · <span class="err">${j.failed.toLocaleString('es')} con error</span>` : ''}</div>
  ${j.detail ? `<div class="mut small">${esc(j.detail)}</div>` : ''}${j.errors.length ? `<div class="err small">${esc(j.errors.slice(0, 3).join(' · '))}</div>` : ''}</div>`;
async function pollJobs() {
  try {
    const list = await api('/api/archive/jobs'), run = list.filter(j => j.state === 'running'), chip = $('#jobchip');
    if (chip) { chip.hidden = !run.length; if (run.length) $('#jobtxt').textContent = `${run[0].type === 'offload' ? 'Moviendo' : 'Importando'} ${Math.round(run[0].progress * 100)}%${run.length > 1 ? ' (+' + (run.length - 1) + ')' : ''}`; }
    const box = $('#jobs'); if (box) { box.innerHTML = list.length ? list.slice(0, 6).map(jobCard).join('') : '<p class="mut small">Aún no hay tareas.</p>'; $$('[data-jc]').forEach(b => b.onclick = () => api('/api/archive/jobs/' + b.dataset.jc + '/cancel', {}).then(pollJobs)); }
    if (S.prevRunning > run.length) { S.arch = await api('/api/archive/stats').catch(() => S.arch); await folders(); }
    S.prevRunning = run.length;
  } catch { /* sin servidor */ }
}
async function tabArchivo(c) {
  const [st, accts] = await Promise.all([api('/api/archive/stats'), api('/api/accounts')]); S.arch = st;
  const desktop = !!window.casamailDesktop; let picked = null;
  c.innerHTML = `<h3>Archivo local</h3><p class="lead">Guarda correo en <b>tu propio disco, sin la cuota de ningún proveedor</b>: lo único que lo limita es el espacio libre. Importa tus PST antiguos (incluso de 50 GB), lleva aquí el correo viejo de tus cuentas para liberar espacio y descárgalo cuando quieras.</p>
    <div class="stats"><div class="stat"><b>${st.messages.toLocaleString('es')}</b><span>mensajes</span></div><div class="stat"><b>${st.folders.toLocaleString('es')}</b><span>carpetas</span></div><div class="stat"><b>${fmtSize(st.storedBytes)}</b><span>ocupan en disco</span></div><div class="stat"><b>${st.freeBytes == null ? '—' : fmtSize(st.freeBytes)}</b><span>libres en ese disco</span></div></div>
    <div class="note">${I('hdd')}<span><b>Ubicación:</b> <code>${esc(st.dir)}</code>${st.messages ? '<br>Para cambiarla, vacía antes el archivo.' : '<br>Está vacío: antes de importar un PST enorme puedes elegir otra unidad (p. ej. un disco externo).'}</span></div>
    ${st.messages ? '' : `<div class="row" style="margin-top:0"><input id="locp" class="field" style="flex:1" placeholder="Ruta completa, p. ej. D:\\CasaMail  ·  /mnt/disco/casamail">${desktop ? '<button class="btn" id="locpick">Elegir carpeta…</button>' : ''}<button class="btn" id="locgo">Usar esta ubicación</button></div><div id="locst" class="small"></div>`}
    <h4>Importar</h4>
    ${desktop ? `<div class="row" style="margin-top:0"><button class="btn btn-primary" id="pick">${I('upload')} Elegir archivo… (PST, OST, MBOX, EML)</button><span id="picked" class="mut"></span></div>`
      : `<label class="lb" style="margin-top:0">Ruta completa del archivo en este equipo</label><input id="ipath" class="field" placeholder="D:\\Correo\\antiguo.pst  ·  /home/yo/antiguo.pst" autocomplete="off">`}
    <label class="lb">Guardar en la carpeta del archivo</label><input id="ifold" class="field" value="Importado" style="max-width:340px">
    <div class="row"><button class="btn btn-primary" id="igo">Importar</button>${desktop ? '' : `<span class="mut">o</span><label class="btn" for="ifile">Subir el archivo (hace una copia temporal)</label><input type="file" id="ifile" accept=".pst,.ost,.mbox,.mbx,.eml" hidden>`}<span id="ist" class="mut"></span></div>
    <p class="mut small">Los archivos grandes se leen <b>directamente de donde están, sin copiarlos</b>. Puedes cerrar esta ventana: la importación sigue en segundo plano, el equipo no se duerme mientras tanto y, si se interrumpe, al repetirla se retoma sin duplicar lo ya guardado. Se importa el correo (calendario, contactos y tareas se omiten).</p>
    <h4>Tareas</h4><div id="jobs"></div>
    <h4>Descargar (exportar)</h4>
    <div class="row" style="margin-top:0"><select id="xsrc" class="field" style="width:auto"><option value="${LOCAL}">Archivo local</option>${accts.map(a => `<option value="${esc(a.id)}">${esc(a.email)}</option>`).join('')}</select><select id="xfol" class="field" style="width:auto;max-width:260px"></select><a class="btn btn-primary" id="xgo" href="#" download>${I('download')} Descargar .mbox</a></div>
    <p class="mut small">El .mbox lo abren Thunderbird y Apple Mail directamente, y Outlook con un importador. <b>No se puede exportar a .PST:</b> es un formato propietario de Microsoft que solo Outlook sabe escribir.</p>
    ${accts.length ? `<h4>Liberar espacio de una cuenta</h4><p class="mut small" style="margin-top:0">Lleva el correo viejo de tu cuenta al archivo local. Por defecto <b>solo copia</b>; si eliges borrar, cada mensaje se borra del servidor únicamente después de comprobar que quedó guardado y que, al releerlo del disco, es idéntico.</p>
      <div class="row" style="margin-top:6px"><select id="osrc" class="field" style="width:auto">${accts.map(a => `<option value="${esc(a.id)}" data-p="${esc(a.provider || '')}" data-e="${esc(a.email)}">${esc(a.email)}</option>`).join('')}</select><select id="ofol" class="field" style="width:auto;max-width:220px"></select>
      <select id="oage" class="field" style="width:auto"><option value="">Todo el correo</option><option value="90">Más antiguo de 3 meses</option><option value="180">Más antiguo de 6 meses</option><option value="365" selected>Más antiguo de 1 año</option><option value="730">Más antiguo de 2 años</option></select></div>
      <label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="odel"> Después de guardarlo, borrarlo del servidor para liberar espacio</label>
      <div class="note warn" id="onote" hidden>${I('shield')}<span>En <b>Gmail</b>, borrar de una carpeta no libera espacio hasta vaciar también <b>Todos</b> y <b>Papelera</b>.</span></div>
      <div class="row"><button class="btn btn-primary" id="ogo">Mover al archivo local</button><span id="ost2" class="mut"></span></div>` : ''}`;

  // ubicación
  if (!st.messages) {
    const lp = $('#locpick'); if (lp) lp.onclick = async () => { const d = await window.casamailDesktop.pickFolder(); if (d) $('#locp').value = d; };
    $('#locgo').onclick = async () => { try { const r = await api('/api/archive/location', { dir: $('#locp').value }); $('#locst').innerHTML = `<span class="ok">Listo: ${esc(r.dir)}</span>`; tabArchivo(c); } catch (e) { $('#locst').innerHTML = `<span class="err">${esc(e.message)}</span>`; } };
  }
  // importar
  const startImport = async (force) => {
    const body = { folder: $('#ifold').value || 'Importado', force: !!force };
    if (desktop) { if (!picked) { $('#ist').innerHTML = '<span class="err">Primero elige un archivo.</span>'; return; } body.token = picked.token; } else body.path = $('#ipath').value;
    try { await api('/api/archive/import-path', body); $('#ist').innerHTML = '<span class="ok">Importando… puedes seguir usando CasaMail.</span>'; picked = null; if ($('#picked')) $('#picked').textContent = ''; pollJobs(); }
    catch (e) { if (e.code === 'low_space' && confirm(e.message + '\n\n¿Continuar de todos modos?')) return startImport(true); $('#ist').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
  if (desktop) $('#pick').onclick = async () => { const f = await window.casamailDesktop.pickImportFile(); if (f) { picked = f; $('#picked').textContent = `${f.name} · ${fmtSize(f.size)}`; $('#ist').textContent = ''; } };
  $('#igo').onclick = () => startImport(false);
  const up = $('#ifile'); if (up) up.onchange = e => {
    const f = e.target.files[0]; if (!f) return; const x = new XMLHttpRequest();
    x.open('PUT', `/api/archive/upload?filename=${encodeURIComponent(f.name)}&folder=${encodeURIComponent($('#ifold').value || 'Importado')}`); x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = ev => { if (ev.lengthComputable) $('#ist').textContent = `Subiendo ${Math.round(ev.loaded / ev.total * 100)}%…`; };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* */ } if (x.status === 200) { $('#ist').innerHTML = '<span class="ok">Subido. Importando…</span>'; pollJobs(); } else $('#ist').innerHTML = `<span class="err">${esc(j.error || 'Error ' + x.status)}</span>`; };
    x.onerror = () => { $('#ist').innerHTML = '<span class="err">No se pudo subir el archivo.</span>'; }; x.send(f);
  };
  // exportar
  const loadFolders = async (sel, acct, all) => { try { const f = await api('/api/folders?account=' + encodeURIComponent(acct)); sel.innerHTML = (all ? '<option value="">(todo el archivo)</option>' : '') + f.map(x => `<option value="${esc(x.path)}">${esc(x.path)}</option>`).join(''); } catch { sel.innerHTML = ''; } };
  const setX = () => { $('#xgo').href = `/api/export?account=${encodeURIComponent($('#xsrc').value)}&folder=${encodeURIComponent($('#xfol').value)}`; };
  $('#xsrc').onchange = async () => { await loadFolders($('#xfol'), $('#xsrc').value, $('#xsrc').value === LOCAL); setX(); }; $('#xfol').onchange = setX;
  await loadFolders($('#xfol'), LOCAL, true); setX();
  // liberar espacio
  if (accts.length) {
    const onote = () => { const o = $('#osrc').selectedOptions[0]; $('#onote').hidden = !(o.dataset.p === 'google' || /gmail|googlemail/i.test(o.dataset.e || '')); };
    $('#osrc').onchange = async () => { await loadFolders($('#ofol'), $('#osrc').value, false); onote(); }; await loadFolders($('#ofol'), $('#osrc').value, false); onote();
    $('#ogo').onclick = async () => {
      const del = $('#odel').checked; if (del && !confirm('Se guardarán los mensajes en tu disco y, solo si se comprueba que quedaron bien, se BORRARÁN del servidor. ¿Continuar?')) return;
      try { await api('/api/archive/offload', { account: $('#osrc').value, folder: $('#ofol').value, olderThanDays: Number($('#oage').value) || undefined, deleteFromServer: del }); $('#ost2').innerHTML = '<span class="ok">En marcha: mira el progreso en Tareas.</span>'; pollJobs(); } catch (e) { $('#ost2').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    };
  }
  await pollJobs(); modalTimer = setInterval(pollJobs, 1500);
}
setInterval(pollJobs, 4000);
$('#side').addEventListener('click', e => {
  const n = e.target.closest('.nav'); if (!n) return; document.body.classList.remove('menu');
  if (n.dataset.sched) return settings('salida');
  if (n.dataset.import || n.dataset.jobs) return settings('archivo');
  if (n.dataset.newf) { const nm = prompt('Nombre de la carpeta'); if (nm) api(`/api/folders?account=${encodeURIComponent(S.acct)}`, { name: nm }).then(folders).catch(fail); return; }
  if (n.dataset.p) { S.folder = n.dataset.p; S.aiq = null; S.filter = ''; S.cur = null; resetView(); folders(); list(); }
});
$('#menu').onclick = () => document.body.classList.toggle('menu'); $('#scrim').onclick = () => document.body.classList.remove('menu');

/* ---------- búsqueda ---------- */
$('#aisearch').onclick = () => { if (!S.ai && !needAi()) return; S.ai = !S.ai; $('#aisearch').setAttribute('aria-pressed', S.ai); $('#searchbox').classList.toggle('ai', S.ai); $('#q').placeholder = S.ai ? 'Pregúntale a Yerleny: “facturas de este año”' : 'Buscar en el correo…'; $('#q').focus(); };
$('#q').onkeydown = async e => {
  if (e.key !== 'Enter') return; const q = e.target.value.trim(); if (!q) { S.aiq = null; return list(); }
  if (S.ai) { S.aiq = q; return list(); }
  S.aiq = null; $('#list').innerHTML = listHead() + skeleton(5); bindListHead();
  try { const a = S.acct === '*' ? firstAcct() : S.acct; const r = await api(`/api/search?account=${encodeURIComponent(a)}&folder=${encodeURIComponent(S.folder)}&q=${encodeURIComponent(q)}`); S.msgs = r.messages.map(m => ({ ...m, account: a })); S.tri = false; drawList(); } catch (x) { fail(x); }
};

/* ---------- paleta de comandos y atajos ---------- */
let palSel = 0, palItems = [];
function palette() { $('#palette').hidden = false; $('#pin').value = ''; palRender(); $('#pin').focus(); }
function palRender() {
  const q = $('#pin').value.trim().toLowerCase();
  const cmds = [
    { t: 'Redactar mensaje', i: 'pencil', h: 'C', run: () => compose() }, { t: 'Abrir el asistente de IA', i: 'sparkles', run: drawerOpen },
    { t: 'Ir a Recibidos', i: 'inbox', run: () => { S.folder = 'INBOX'; S.aiq = null; folders(); list(); } },
    ...S.folders.filter(f => f.path !== 'INBOX').map(f => ({ t: 'Ir a ' + folderMeta(f)[1], i: folderMeta(f)[0], run: () => { S.folder = f.path; S.aiq = null; S.cur = null; resetView(); folders(); list(); } })),
    { t: 'Bandeja de salida', i: 'send', run: () => settings('salida') }, { t: 'Ajustes de cuentas', i: 'user', run: () => settings('cuentas') }, { t: 'Configurar la IA', i: 'sparkles', run: () => settings('ia') },
    { t: 'Cambiar tema', i: 'moon', run: () => $('#theme').click() }, { t: 'Actualizar', i: 'refresh', run: () => { folders(); list(); } },
  ].filter(c => !q || c.t.toLowerCase().includes(q));
  if (q) { cmds.unshift({ t: `Preguntar a la IA: “${$('#pin').value.trim()}”`, i: 'sparkles', run: () => { drawerOpen(); $('#ci').value = $('#pin').value.trim(); askAgent(); } }, { t: `Buscar “${$('#pin').value.trim()}”`, i: 'search', run: () => { $('#q').value = $('#pin').value.trim(); $('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } }); }
  palItems = cmds; palSel = Math.min(palSel, Math.max(0, cmds.length - 1));
  $('#pres').innerHTML = cmds.map((c, i) => `<div class="pi ${i === palSel ? 'on' : ''}" data-i="${i}">${I(c.i)}<span>${esc(c.t)}</span>${c.h ? `<span class="h">${c.h}</span>` : ''}</div>`).join('') || '<div class="pi mut">Sin resultados</div>';
  $$('.pi[data-i]').forEach(el => el.onclick = () => palRun(Number(el.dataset.i)));
}
function palRun(i) { const c = palItems[i]; if (!c) return; $('#palette').hidden = true; c.run(); }
$('#pin').oninput = () => { palSel = 0; palRender(); };
$('#pin').onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); palRender(); } else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); } else if (e.key === 'Enter') palRun(palSel); };
$('#palette').onclick = e => { if (e.target.id === 'palette') $('#palette').hidden = true; };
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return palette(); }
  if (e.key === 'Escape') { if (!$('#palette').hidden) $('#palette').hidden = true; else if (!$('#modal').hidden) closeModal(); else if (!$('#drawer').hidden) $('#drawer').hidden = true; else if (!$('#compose').hidden) $('#compose').hidden = true; return; }
  const t = e.target.tagName; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t) || e.metaKey || e.ctrlKey || e.altKey || !$('#modal').hidden || !$('#palette').hidden) return;
  const rows = $$('.m'), i = rows.findIndex(r => r.classList.contains('on'));
  if (e.key === 'c') { e.preventDefault(); compose(); } else if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  else if (e.key === 'j' && rows[i + 1]) rows[i + 1].click(); else if (e.key === 'k' && rows[i - 1]) rows[i - 1].click();
  else if (S.cur && e.key === 'r') compose({ reply: { all: false } }); else if (S.cur && e.key === 'e') act('archive', {}, 'Archivado', 1); else if (S.cur && e.key === '#') act('trash', {}, 'Movido a la papelera', 1); else if (S.cur && e.key === 's') toggleStar();
  else if (e.key === '?') toast('C redactar · / buscar · J/K moverse · R responder · E archivar · # papelera · S destacar · Ctrl+K comandos', { ms: 7000 });
});
setInterval(() => { if (document.visibilityState === 'visible' && S.acct && !S.aiq && $('#compose').hidden && $('#modal').hidden) { const sel = S.cur ? S.cur.uid : null; list().then(() => { if (sel) $$('.m').forEach(e => e.classList.toggle('on', e.dataset.u == sel)); }); folders(); } }, 120000);
setInterval(outboxCount, 30000);
init().catch(e => { $('#list').innerHTML = `<div class="empty"><h3>Error</h3><p>${esc(e.message)}</p></div>`; });
