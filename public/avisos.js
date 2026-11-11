'use strict';
/* CasaMail — avisos (notificaciones), calendario y recordatorios. Se carga después de app.js y usa sus utilidades. */
Object.assign(ICONS, {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
});

const NATIVE = !!window.casamailDesktop; // en la app de escritorio los avisos los muestra el sistema (aunque la ventana esté oculta)
const N = { last: 0, items: [], unread: 0, open: false };
const KIND_IC = { mail: 'mail', meeting: 'calendar', reminder: 'bell', digest: 'calendar', system: 'shield' };
const fmtWhen = ms => new Date(ms).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtHour = ms => new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const localInput = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- campana ---------- */
(() => {
  const b = document.createElement('button'); b.className = 'iconbtn'; b.id = 'bell'; b.setAttribute('aria-label', 'Avisos'); b.title = 'Avisos';
  b.innerHTML = `${I('bell')}<span class="bdg" id="bdg" hidden></span>`; $('#top').insertBefore(b, $('#theme')); b.onclick = e => { e.stopPropagation(); N.open ? closePanel() : openPanel(); };
})();
function setBadge() {
  const bd = $('#bdg'); if (bd) { bd.hidden = !N.unread; bd.textContent = N.unread > 99 ? '99+' : N.unread; }
  document.title = (N.unread ? `(${N.unread}) ` : '') + 'CasaMail';
}

/* ---------- panel de avisos ---------- */
function nRow(n) {
  const p = n.proposal; let act = '';
  if (p && p.status === 'pending') act = `<div class="nact"><button class="btn btn-primary btn-sm" data-a="agendar" data-id="${n.id}">${I('calendar', 'sm')} Agendar</button><button class="btn btn-sm" data-a="descartar" data-id="${n.id}">No, gracias</button>${n.uid ? `<button class="btn btn-ghost btn-sm" data-a="abrir" data-id="${n.id}">Ver correo</button>` : ''}</div>`;
  else if (p && p.status === 'added') act = `<div class="nact"><span class="ok">✔ Agendada</span><a class="btn btn-sm" href="/api/calendar/${p.eventId}.ics" download>Añadir a Google/Outlook (.ics)</a><button class="btn btn-ghost btn-sm" data-a="cal">Ver calendario</button></div>`;
  else if (p && p.status === 'dismissed') act = `<div class="nact mut">Descartada</div>`;
  else if (n.kind === 'reminder' || n.kind === 'digest') act = `<div class="nact"><button class="btn btn-sm" data-a="cal">Ver calendario</button>${n.uid ? `<button class="btn btn-ghost btn-sm" data-a="abrir" data-id="${n.id}">Ver correo</button>` : ''}</div>`;
  else if (n.kind === 'mail' && n.uid) act = `<div class="nact"><button class="btn btn-sm" data-a="abrir" data-id="${n.id}">Abrir</button></div>`;
  return `<div class="nrow ${n.read ? '' : 'unr'} k-${n.kind}"><span class="nic">${I(KIND_IC[n.kind] || 'bell')}</span><div class="nbody"><div class="nh"><b>${esc(n.title)}</b><span class="mut">${ago(n.ts)}</span></div><div class="ntx">${esc(n.body)}</div>${act}</div></div>`;
}
function drawPanel() {
  const el = $('#npanel'); if (!el) return;
  el.innerHTML = `<div class="nhead"><b>Avisos</b><span class="grow"></span>${N.unread ? '<button class="btn btn-ghost btn-sm" data-a="leer">Marcar leídos</button>' : ''}<button class="iconbtn" data-a="cfg" title="Ajustes de avisos" aria-label="Ajustes de avisos">${I('sliders')}</button></div>
    <div class="nlist">${N.items.length ? N.items.map(nRow).join('') : `<div class="nempty">${I('bell', 'lg')}<p>Aquí verás cada correo nuevo con su resumen, las reuniones que te propongan y los recordatorios.</p></div>`}</div>
    ${N.items.length ? '<div class="nfoot"><button class="btn btn-ghost btn-sm" data-a="vaciar">Vaciar lista</button></div>' : ''}`;
}
function openPanel() {
  N.open = true; const el = document.createElement('div'); el.id = 'npanel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Avisos'); document.body.appendChild(el); drawPanel();
  el.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const id = Number(b.dataset.id), n = N.items.find(x => x.id === id), a = b.dataset.a;
    try {
      if (a === 'agendar' && n) return eventDialog({ title: n.proposal.title, start: n.proposal.start, end: n.proposal.end, location: n.proposal.location || '', via: n.proposal.via }, async v => { const r = await api(`/api/notifications/${id}/agendar`, v); n.proposal = { ...n.proposal, status: 'added', eventId: r.event.id }; n.read = true; refreshUnread(); drawPanel(); calCount(); toast('Agendada en tu calendario ✔'); });
      if (a === 'descartar') { await api(`/api/notifications/${id}/descartar`, {}); n.proposal.status = 'dismissed'; n.read = true; refreshUnread(); drawPanel(); }
      else if (a === 'abrir' && n) { await openFromNotif(n); }
      else if (a === 'cal') { closePanel(); openCalendar(); }
      else if (a === 'leer') { const r = await api('/api/notifications/read', { all: true }); N.items.forEach(x => (x.read = true)); N.unread = r.unread; setBadge(); drawPanel(); }
      else if (a === 'vaciar') { await api('/api/notifications/clear', {}); N.items = []; N.unread = 0; setBadge(); drawPanel(); }
      else if (a === 'cfg') { closePanel(); settings('avisos'); }
    } catch (err) { fail(err); }
  };
  setTimeout(() => document.addEventListener('click', outside), 0);
  if (N.unread) api('/api/notifications/read', { all: true }).then(r => { N.items.forEach(x => (x.read = true)); N.unread = r.unread; setBadge(); }).catch(() => {}); // al abrir el panel, lo visto cuenta como leído
}
function outside(e) { if (!e.target.closest('#npanel') && !e.target.closest('#bell')) closePanel(); }
function closePanel() { N.open = false; $('#npanel')?.remove(); document.removeEventListener('click', outside); }
const refreshUnread = () => { N.unread = N.items.filter(x => !x.read).length; setBadge(); };
async function openFromNotif(n) {
  if (!n.uid || !n.account) return; closePanel(); closeModal();
  if (S.acct !== n.account || S.folder !== 'INBOX') { S.acct = n.account; S.macct = ''; S.folder = 'INBOX'; S.cur = null; S.aiq = null; S.filter = ''; resetView(); await Promise.all([list(), folders(true)]); }
  await openMsg(n.uid, n.account);
}

/* ---------- llegada de avisos (tiempo real) ---------- */
function showNative(n) {
  if (NATIVE || !('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return; // si estás mirando CasaMail basta con el aviso en pantalla
  try { const x = new Notification(n.title, { body: n.body, tag: 'cm' + n.id, icon: 'icon-app.png' }); x.onclick = () => { window.focus(); x.close(); if (n.uid) openFromNotif(n); else openPanel(); }; } catch { /* sin permiso o no soportado */ }
}
function onNew(items) { // más antiguos primero
  for (const n of items) {
    const ln = n.body.split('\n'); toast(`${n.title}: ${n.kind === 'mail' && ln[1] ? ln[1] : ln[0]}`, { action: n.proposal?.status === 'pending' ? 'Agendar' : n.uid ? 'Abrir' : undefined, onAction: () => (n.proposal?.status === 'pending' ? (openPanel(), 0) : openFromNotif(n)), ms: 9000 });
    showNative(n); if (n.kind === 'meeting' || n.kind === 'reminder') calCount();
  }
  if (N.open) drawPanel();
}
async function nLoop() {
  let fails = 0;
  for (;;) {
    try {
      const r = await api(`/api/notifications?after=${N.last}&wait=25`); fails = 0;
      if (r.items.length) { N.items = [...r.items, ...N.items].slice(0, 200); onNew(r.items.slice().reverse()); }
      N.last = r.last; N.unread = r.unread; setBadge();
    } catch { fails++; await sleep(Math.min(30000, 2000 * 2 ** Math.min(fails, 4))); }
  }
}
(async () => {
  try { const r = await api('/api/notifications?after=0'); N.items = r.items; N.last = r.last; N.unread = r.unread; setBadge(); } catch { /* servidor aún arrancando */ }
  calCount(); nLoop();
})();

/* ---------- crear / corregir una reunión ---------- */
function eventDialog(init, onSave, after) {
  const start = init.start || Date.now() + 36e5, end = init.end || start + 36e5;
  openModal(`<div class="narrow-in"><h3 style="font-size:20px">${init.id ? 'Editar reunión' : 'Agendar reunión'}</h3>
    ${init.via === 'ia' ? `<p class="lead mut" style="margin:6px 0 10px">Yerleny la encontró en el texto del correo. <b>Revisa el día y la hora</b> antes de agendarla.</p>` : ''}
    <label class="lb">Título</label><input id="evt" class="field" maxlength="200" value="${esc(init.title || '')}">
    <div class="row2"><div><label class="lb">Empieza</label><input type="datetime-local" id="evs" class="field" value="${localInput(start)}"></div><div><label class="lb">Termina</label><input type="datetime-local" id="eve" class="field" value="${localInput(end)}"></div></div>
    <label class="lb">Lugar o enlace (opcional)</label><input id="evl" class="field" maxlength="300" value="${esc(init.location || '')}">
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="evx">Cancelar</button><button class="btn btn-primary" id="evok">${init.id ? 'Guardar' : 'Agendar'}</button></div></div>`, true);
  $('#evx').onclick = closeModal;
  $('#evok').onclick = async e => {
    const title = $('#evt').value.trim(), s = new Date($('#evs').value).getTime(), en = new Date($('#eve').value).getTime();
    if (!title || !Number.isFinite(s)) return toast('Pon un título y una fecha de inicio', { kind: 'bad' });
    busy(e.currentTarget, true);
    try { await onSave({ title, start: new Date(s).toISOString(), end: new Date(Number.isFinite(en) && en >= s ? en : s + 36e5).toISOString(), location: $('#evl').value.trim() }); closeModal(); if (after) after(); } catch (err) { fail(err); busy(e.currentTarget, false); }
  };
  $('#evt').focus();
}
/** Botón "Agendar reunión" de un mensaje abierto. */
async function agendarMensaje(m, btn) {
  busy(btn, true);
  try {
    const r = await api(`/api/message/${m.uid}/meeting?${qs()}`, {});
    if (r.cancelled) return toast(`Este correo cancela la reunión "${r.cancelled}".`);
    const p = r.proposal;
    if (!p) { toast('No encontré una reunión clara en el correo: puedes crearla a mano.'); return eventDialog({ title: m.subject }, v => saveEvent(v, m)); }
    eventDialog(p, v => saveEvent({ ...v, link: p.link, notes: p.notes, allDay: p.allDay }, m));
  } catch (e) { fail(e); } finally { busy(btn, false); }
}
async function saveEvent(v, m) {
  await api('/api/calendar', { ...v, source: m ? { account: A(), folder: S.folder, uid: m.uid } : undefined }); toast('Agendada en tu calendario ✔'); calCount();
}

/* ---------- calendario ---------- */
async function calCount() {
  try { const r = await api(`/api/calendar?from=${Date.now()}&to=${Date.now() + 7 * 864e5}`), c = $('#caln'); if (c) { c.hidden = !r.events.length; c.textContent = r.events.length; c.title = 'Reuniones en los próximos 7 días'; } } catch { /* sin servidor */ }
}
async function openCalendar() {
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  openModal(`<div class="narrow-in"><div class="row" style="margin:0 0 6px"><h3 style="font-size:20px">Calendario</h3><span class="grow"></span><button class="btn btn-sm" id="cadd">${I('plus', 'sm')} Añadir</button><a class="btn btn-sm" href="/api/calendar.ics" download>Exportar .ics</a><button class="iconbtn" id="cx" aria-label="Cerrar">${I('x')}</button></div>
    <p class="lead mut" style="margin:0 0 12px">Tus próximas reuniones (60 días). CasaMail te avisa antes de cada una y te resume la agenda cada mañana.</p><div id="calist"></div></div>`, true);
  $('#cx').onclick = closeModal;
  const draw = async () => {
    const r = await api(`/api/calendar?from=${day0.getTime()}&to=${day0.getTime() + 60 * 864e5}`), box = $('#calist'); if (!box) return;
    if (!r.events.length) { box.innerHTML = `<div class="nempty">${I('calendar', 'lg')}<p>No tienes reuniones próximas. Cuando te llegue una invitación, CasaMail te avisará para agendarla.</p></div>`; return; }
    let last = '';
    box.innerHTML = r.events.map(e => {
      const d = new Date(e.start), key = d.toDateString(), head = key !== last ? `<div class="calday">${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` : ''; last = key;
      const link = e.link ? `<a class="btn btn-primary btn-sm" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${I('video', 'sm')} Unirme</a>` : '';
      return `${head}<div class="calev"><div class="caltime">${e.allDay ? 'Todo el día' : `${fmtHour(e.start)}<small>${fmtHour(e.end)}</small>`}</div><div class="grow"><b>${esc(e.title)}</b>${e.location ? `<div class="mut">${I('pin', 'sm')} ${esc(e.location)}</div>` : ''}${e.recurring ? '<div class="mut">Repetitiva: solo se muestra la próxima</div>' : ''}</div>${link}<a class="iconbtn" href="/api/calendar/${e.id}.ics" download title="Añadir a Google Calendar / Outlook (.ics)" aria-label="Descargar .ics">${I('download')}</a><button class="iconbtn" data-edit="${e.id}" title="Editar" aria-label="Editar">${I('pencil')}</button><button class="iconbtn" data-del="${e.id}" title="Quitar" aria-label="Quitar">${I('trash')}</button></div>`;
    }).join('');
    $$('[data-del]', box).forEach(b => b.onclick = async () => { if (!confirm('¿Quitar esta reunión del calendario?')) return; try { await api('/api/calendar/' + b.dataset.del, undefined, 'DELETE'); draw(); calCount(); } catch (e) { fail(e); } });
    $$('[data-edit]', box).forEach(b => b.onclick = () => { const e = r.events.find(x => x.id === b.dataset.edit); eventDialog({ id: e.id, title: e.title, start: e.start, end: e.end, location: e.location || '' }, async v => { await api('/api/calendar/' + e.id, v, 'PUT'); calCount(); }, openCalendar); });
  };
  $('#cadd').onclick = () => eventDialog({ title: '' }, async v => { await api('/api/calendar', v); calCount(); }, openCalendar);
  draw().catch(e => { $('#calist').innerHTML = `<p class="err">${esc(e.message)}</p>`; });
}

/* ---------- Ajustes → Avisos ---------- */
const REM = [[1440, '1 día antes'], [120, '2 horas antes'], [60, '1 hora antes'], [30, '30 minutos antes'], [10, '10 minutos antes'], [5, '5 minutos antes']];
async function tabAvisos(c) {
  let s = await api('/api/notify/settings');
  const perm = () => (!('Notification' in window) || NATIVE ? '' : Notification.permission);
  const draw = () => {
    const sw = (k, label, hint = '') => `<label class="swrow"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    c.innerHTML = `<h3>Avisos</h3><p class="lead">CasaMail te avisa de cada correo que llega, con un resumen de lo que dice y pide; detecta las reuniones para que las agendes en tu calendario y te las recuerda a tiempo.</p>
      ${sw('enabled', 'Activar avisos')}
      <h4>Correo nuevo</h4>
      ${sw('mail', 'Avisar de cada correo nuevo', 'Con el remitente, el asunto y un resumen.')}
      ${sw('aiSummary', 'Resumen con Yerleny', `Si tu motor de IA es de la nube, el texto de cada correo nuevo se envía a ese proveedor para resumirlo; con el modelo local no sale de tu equipo. Sin IA, el aviso muestra el comienzo del texto.${S.aiOk ? '' : ' (Ahora no hay ningún motor de IA conectado.)'}`)}
      <h4>Reuniones</h4>
      ${sw('meetings', 'Detectar reuniones en los correos', 'Invitaciones (.ics) y, con Yerleny, reuniones escritas en el texto. Siempre te pregunta antes de agendar.')}
      ${sw('autoAgenda', 'Agendar solas las invitaciones (.ics)', 'Solo invitaciones con archivo de calendario. Las detectadas por la IA siempre se confirman.')}
      <label class="lb">Recordarme antes de cada reunión</label><div class="chips">${REM.map(([m, l]) => `<label class="chip"><input type="checkbox" data-r="${m}" ${s.reminders.includes(m) ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <h4>Agenda de la mañana</h4>
      ${sw('digest', 'Resumen diario de reuniones', 'Un aviso con las reuniones de hoy y de mañana (solo si hay).')}
      <label class="lb">A las</label><select id="dh">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${s.digestHour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
      <h4>Dónde te llegan</h4>
      <p class="lead mut" style="margin-top:0">${NATIVE ? 'En la app de escritorio: notificaciones del sistema, también con la ventana en segundo plano.' : window.casamailAndroid ? 'En el móvil: notificaciones de Android.' : 'En el navegador: avisos en pantalla y, si lo permites, notificaciones del navegador mientras CasaMail esté abierta.'}</p>
      <h4>Versión</h4><div class="row"><span class="mut" id="vers">Buscando…</span><button class="btn btn-sm" id="vbusca">Buscar actualizaciones</button></div>
      <div class="row">${perm() && perm() !== 'granted' ? `<button class="btn" id="np">Permitir notificaciones del navegador</button>` : perm() === 'granted' ? '<span class="ok">✔ Notificaciones del navegador permitidas</span>' : ''}<button class="btn" id="nt">Enviarme un aviso de prueba</button></div>`;
    $$('[data-k]', c).forEach(i => (i.onchange = () => save({ [i.dataset.k]: i.checked })));
    $$('[data-r]', c).forEach(i => (i.onchange = () => save({ reminders: $$('[data-r]', c).filter(x => x.checked).map(x => Number(x.dataset.r)) })));
    $('#dh').onchange = e => save({ digestHour: Number(e.target.value) });
    const np = $('#np'); if (np) np.onclick = async () => { await Notification.requestPermission(); draw(); };
    api('/api/update').then(r => { const v = $('#vers'); if (v) v.textContent = `CasaMail ${r.version}` + (r.info && r.info.newer ? ` · hay una versión nueva (${r.info.latest})` : ''); }).catch(() => {});
    $('#vbusca').onclick = () => buscarActualizacion(true);
    $('#nt').onclick = async () => { try { await api('/api/notifications/test', {}); toast('Aviso de prueba enviado'); } catch (e) { fail(e); } };
  };
  const save = async p => { try { s = await api('/api/notify/settings', p, 'PUT'); } catch (e) { fail(e); } };
  draw();
}

/* ---------- tiempo real: el servidor avisa de correo nuevo/borrado/leído (IMAP IDLE) y la lista se actualiza sola ---------- */
let liveSeq = null, liveDirty = false;
const canRefresh = () => document.visibilityState === 'visible' && S.acct && S.acct !== LOCAL && !S.aiq && $('#compose').hidden && $('#modal').hidden;
function liveRefresh() {
  if (!canRefresh()) { liveDirty = true; return; } liveDirty = false;
  const sel = S.cur ? S.cur.uid : null;
  refreshList().then(() => { if (sel) $$('.m').forEach(e => e.classList.toggle('on', e.dataset.u == sel)); }).catch(() => {}); folders(true);
}
document.addEventListener('visibilitychange', () => { if (liveDirty && document.visibilityState === 'visible') liveRefresh(); });
(async function liveLoop() {
  let fails = 0;
  for (;;) {
    try {
      const r = await api(liveSeq === null ? '/api/changes?wait=0' : `/api/changes?since=${liveSeq}&wait=25`); fails = 0;
      const first = liveSeq === null; liveSeq = r.seq;
      if (!first && r.accounts.length && (S.acct === '*' || r.accounts.includes(S.acct))) liveRefresh();
      if (first) await sleep(500);
    } catch { fails++; await sleep(Math.min(30000, 2000 * 2 ** Math.min(fails, 4))); }
  }
})();

/* ---------- versión nueva ---------- */
async function buscarActualizacion(manual) {
  try {
    const r = await api('/api/update' + (manual ? '?force=1' : '')), i = r.info;
    if (!i) { if (manual) toast('No se pudo comprobar ahora (¿sin internet?). Inténtalo más tarde.'); return r; }
    if (!i.newer) { if (manual) toast(`Tienes la última versión (${r.version}).`); return r; }
    let seen = ''; try { seen = localStorage.getItem('cm-upd') || ''; } catch { /* sin almacenamiento */ }
    if (manual || seen !== i.latest) {
      toast(`Hay una versión nueva de CasaMail: ${i.latest} (tienes la ${i.current}).`, { action: 'Descargar', ms: 20000, onAction: () => { window.open(i.url, '_blank', 'noopener'); } });
      try { localStorage.setItem('cm-upd', i.latest); } catch { /* sin almacenamiento */ }
    }
    return r;
  } catch { return null; }
}
if (!window.casamailAndroid && !/[?&#]demo/.test(location.href) && !/Android/.test(navigator.userAgent)) setTimeout(() => buscarActualizacion(false), 12000);
