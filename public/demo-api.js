'use strict';
/* CasaMail — MODO DEMOSTRACIÓN. Sustituye al servidor por datos de ejemplo dentro del propio navegador/app:
   no se conecta a ningún servidor ni a ninguna cuenta de correo. Se activa con "?demo" en la dirección (la app Android lo usa
   en su botón "Probar con datos de ejemplo", pensado también para la revisión de Google Play). */
(() => {
  const H = 3600e3, now = Date.now(), iso = ms => new Date(ms).toISOString();
  const ME = 'demo@casamail.demo';
  const mails = [
    { from: 'Marta Ruiz <marta@estudio.es>', subject: 'Propuesta de diseño para la web nueva', ago: 0.5, att: true, unread: true, starred: false,
      text: 'Hola,\n\nTe paso la propuesta con las tres opciones de portada. Me gustaría tu opinión antes del jueves para poder cerrar el presupuesto con el cliente.\n\nMás info: https://estudio.es/propuesta\n\nUn abrazo,\nMarta' },
    { from: 'Banco Norte <avisos@banconorte.com>', subject: 'Tu factura de noviembre ya está disponible', ago: 3, unread: true,
      text: 'Hola,\n\nTu factura de noviembre (89,90 EUR) ya está disponible y vence el día 20. Puedes descargarla desde tu área de cliente.\n\nGracias por confiar en nosotros.' },
    { from: 'Luis Fernández <luis@amigo.com>', subject: 'Asado el sábado', ago: 7, unread: true, starred: true,
      text: '¿Te apuntas al asado del sábado en mi casa? Empezamos sobre las 14:00. Si puedes, lleva algo de beber 🍷' },
    { from: 'Equipo de Proyectos <proyectos@empresa.com>', subject: 'Invitación: Revisión trimestral', ago: 12, unread: true,
      text: 'Hola,\n\nTe invito a la revisión trimestral del proyecto. Será el próximo jueves a las 15:30 en la Sala Madrid (o por videollamada: https://meet.google.com/abc-defg-hij).\n\nPor favor confirma tu asistencia.' },
    { from: 'Ana Pérez <ana@empresa.com>', subject: 'Presupuesto marzo', ago: 26,
      text: 'Hola, adjunto el presupuesto de marzo: 4.500 EUR. ¿Puedes confirmar antes del viernes?\n\nGracias,\nAna' },
    { from: 'Boletín Semanal <news@boletin.com>', subject: 'Las 10 mejores herramientas de productividad de 2026', ago: 30,
      html: '<div style="font-family:Georgia,serif;max-width:520px;margin:auto"><h1 style="color:#0a5ce6">Productividad 2026</h1><p>Esta semana: <b>diez herramientas</b> que están cambiando la forma de trabajar.</p><p><a href="https://example.com">Leer más →</a></p></div>',
      text: 'Productividad 2026: diez herramientas que están cambiando la forma de trabajar.' },
    { from: 'Tienda Online <pedidos@tienda.com>', subject: 'Tu pedido #88231 ha sido enviado', ago: 50, text: 'Tu pedido ya va de camino. Llegará el miércoles entre las 10:00 y las 14:00.' },
    { from: 'GitHub <noreply@github.com>', subject: '[casamail] Pull request #42 listo para revisar', ago: 70, starred: true, text: 'Se abrió un nuevo pull request en casamail. Revísalo cuando puedas.' },
    { from: 'Equipo de Soporte <soporte@servicio.io>', subject: 'Hemos recibido tu consulta', ago: 120, text: 'Gracias por escribirnos. Te responderemos en un plazo de 24 horas.' },
    { from: 'Familia <familia@casa.com>', subject: 'Fotos de las vacaciones', ago: 200, att: true, text: '¡Mirad qué fotos tan bonitas! Os las dejo adjuntas.' },
  ].map((m, i) => ({ uid: 100 - i, subject: m.subject, from: m.from, to: ME, date: iso(now - m.ago * H), unread: !!m.unread, starred: !!m.starred, hasAttachments: !!m.att,
    text: m.text, html: m.html || null, cc: '', messageId: `<demo${i}@casamail.demo>`, references: [],
    attachments: m.att ? [{ index: 0, filename: m.subject.startsWith('Fotos') ? 'vacaciones.zip' : 'propuesta-web.pdf', contentType: 'application/octet-stream', size: 245760 }] : [] }));

  const sent = [], trash = new Set(), archived = new Set();
  const summary = m => ({ uid: m.uid, subject: m.subject, from: m.from, to: m.to, date: m.date, unread: m.unread, starred: m.starred, hasAttachments: m.hasAttachments });
  const live = () => mails.filter(m => !trash.has(m.uid) && !archived.has(m.uid));
  const folders = () => [
    { path: 'INBOX', name: 'Recibidos', specialUse: '\\Inbox', total: live().length, unread: live().filter(m => m.unread).length },
    { path: 'Sent', name: 'Enviados', specialUse: '\\Sent', total: 2, unread: 0 },
    { path: 'Drafts', name: 'Borradores', specialUse: '\\Drafts', total: 0, unread: 0 },
    { path: 'Archive', name: 'Archivo', specialUse: '\\Archive', total: archived.size, unread: 0 },
    { path: 'Junk', name: 'Spam', specialUse: '\\Junk', total: 0, unread: 0 },
    { path: 'Trash', name: 'Papelera', specialUse: '\\Trash', total: trash.size, unread: 0 },
  ];
  const events = [
    { id: 'd1', title: 'Revisión trimestral', start: now + 30 * H, end: now + 31 * H, allDay: false, location: 'Sala Madrid', link: 'https://meet.google.com/abc-defg-hij', via: 'ics', reminded: [], created: now },
    { id: 'd2', title: 'Comida con Luis', start: now + 54 * H, end: now + 56 * H, allDay: false, location: 'Restaurante Casa Pepe', via: 'manual', reminded: [], created: now },
  ];
  const notifs = [
    { id: 2, ts: now - 0.2 * H, kind: 'meeting', title: 'Te invitan a una reunión', body: 'Revisión trimestral\nel jueves a las 15:30 · Sala Madrid', account: 'demo', folder: 'INBOX', uid: 97,
      proposal: { title: 'Revisión trimestral', start: now + 30 * H, end: now + 31 * H, allDay: false, location: 'Sala Madrid', link: 'https://meet.google.com/abc-defg-hij', via: 'ics', status: 'pending' }, read: false },
    { id: 1, ts: now - 0.5 * H, kind: 'mail', title: 'Marta Ruiz', body: 'Propuesta de diseño para la web nueva\nMarta envía tres opciones de portada y pide tu opinión antes del jueves.', account: 'demo', folder: 'INBOX', uid: 100, read: false },
  ];
  const sigs = { demo: { items: [{ id: 'p', name: 'Principal', html: '<div><b>Tu nombre</b><br>CasaMail · Demostración</div>', text: 'Tu nombre\nCasaMail · Demostración' }], newDefault: 'p', replyDefault: 'p' } };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const J = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
  const body = o => { try { return JSON.parse(o.body || '{}'); } catch { return {}; } };
  const uidOf = p => Number((/\/message\/(\d+)/.exec(p) || [])[1]);

  async function route(path, q, o) {
    const m = (o.method || 'GET').toUpperCase(), b = body(o);
    if (path === '/api/accounts') return [{ id: 'demo', email: ME, auth: 'password' }];
    if (path === '/api/settings') return { signatures: {}, sendDelayMin: 10 };
    if (path === '/api/send-delay') return { minutes: 10 };
    if (path === '/api/yerleny') return { userName: 'Demo', notes: [] };
    if (path === '/api/archive/stats') return { messages: 0 };
    if (path === '/api/ai/config') return { provider: 'openai', baseUrl: 'demo', model: 'demo', hasKey: false };
    if (path === '/api/ai/engines') return [];
    if (path === '/api/ai/local') return null;
    if (path === '/api/ai/warmup') return { warming: false };
    if (path === '/api/folders') return folders();
    if (path === '/api/messages') { const un = q.get('unread') === '1', off = Number(q.get('offset') || 0), lim = Number(q.get('limit') || 40); const l = live().filter(x => !un || x.unread); return { total: l.length, next: off + Math.min(lim, Math.max(0, l.length - off)), messages: l.slice(off, off + lim).map(summary) }; }
    if (path === '/api/unified') { const l = live(); return { total: l.length, next: l.length, messages: l.map(x => ({ ...summary(x), account: 'demo' })) }; }
    if (path === '/api/search') { const l = live().filter(x => q.get('starred') !== '1' || x.starred); return { total: l.length, next: l.length, messages: l.map(summary) }; }
    if (/^\/api\/message\/\d+$/.test(path)) { const x = mails.find(y => y.uid === uidOf(path)); if (!x) return { error: 'No existe' }; x.unread = false; return x; }
    if (/\/flags$/.test(path)) { const x = mails.find(y => y.uid === uidOf(path)); if (x) { if ('read' in b) x.unread = !b.read; if ('starred' in b) x.starred = !!b.starred; } return { ok: true }; }
    if (/\/(trash|spam)$/.test(path)) { trash.add(uidOf(path)); return { ok: true }; }
    if (/\/archive$/.test(path)) { archived.add(uidOf(path)); return { ok: true }; }
    if (/\/(move|snooze)$/.test(path)) { archived.add(uidOf(path)); return { ok: true }; }
    if (/\/meeting$/.test(path)) { const x = mails.find(y => y.uid === uidOf(path)); const hit = x && /Invitación|reuni/i.test(x.subject); return { subject: x ? x.subject : '', cancelled: null, proposal: hit ? notifs[0].proposal : null }; }
    if (/\/reply$/.test(path) || path === '/api/send') { sent.push(b); return { queued: true, kind: 'queued', id: 'demo-' + sent.length, sendAt: Date.now() + 10 * 60e3 }; }
    if (path === '/api/draft') return { ok: true };
    if (path === '/api/outbox') return sent.map((s, i) => ({ id: 'demo-' + (i + 1), kind: 'queued', to: s.to || 'Marta Ruiz', subject: s.subject || 'Re: Propuesta de diseño', sendAt: Date.now() + 8 * 60e3, canCancel: true }));
    if (/^\/api\/outbox\//.test(path)) return { ok: true };
    if (path === '/api/contacts') return [{ email: 'marta@estudio.es', name: 'Marta Ruiz' }, { email: 'luis@amigo.com', name: 'Luis Fernández' }];
    if (path === '/api/changes') { await delay(Math.min(Number(q.get('wait') || 0), 25) * 1000); return { seq: 0, accounts: [] }; }
    if (path === '/api/notifications') { const after = Number(q.get('after') || 0), wait = Number(q.get('wait') || 0); if (wait && after >= 2) await delay(Math.min(wait, 25) * 1000); return { items: notifs.filter(n => n.id > after), last: 2, unread: notifs.filter(n => !n.read).length }; }
    if (path === '/api/notifications/read') { notifs.forEach(n => (n.read = true)); return { items: [], last: 2, unread: 0 }; }
    if (/^\/api\/notifications\/(clear|test|check)$/.test(path)) return { ok: true };
    if (/^\/api\/notifications\/\d+\/agendar$/.test(path)) { const n = notifs[0]; n.proposal.status = 'added'; n.proposal.eventId = 'd1'; return { event: events[0] }; }
    if (/^\/api\/notifications\/\d+\/descartar$/.test(path)) { notifs[0].proposal.status = 'dismissed'; return { ok: true }; }
    if (path === '/api/notify/settings') return { enabled: true, mail: true, aiSummary: true, meetings: true, autoAgenda: false, reminders: [1440, 60, 10], digest: true, digestHour: 8 };
    if (path === '/api/calendar') { if (m === 'POST') { const e = { id: 'n' + Date.now(), reminded: [], via: 'manual', allDay: false, ...b, start: Date.parse(b.start), end: Date.parse(b.end || b.start) + 0 }; events.push(e); return { event: e, duplicate: false }; } return { events, tz: 'Europe/Madrid' }; }
    if (/^\/api\/calendar\//.test(path)) { if (m === 'DELETE') { const i = events.findIndex(e => path.endsWith(e.id)); if (i >= 0) events.splice(i, 1); } return { ok: true }; }
    if (path === '/api/signatures') return sigs;
    if (/^\/api\/signatures\//.test(path)) return m === 'PUT' ? (sigs.demo = { ...sigs.demo, ...b }) : { candidates: [] };
    if (path === '/api/presets') return [{ id: 'gmail', note: '' }, { id: 'outlook', note: '' }, { id: 'yahoo', note: '' }];
    if (path === '/api/ai/summarize') { await delay(700); return { summary: 'Resumen: el remitente envía información y espera tu respuesta antes de la fecha indicada.\n\nPuntos clave\n- Hay una fecha límite próxima\n- Se adjunta o enlaza documentación\n\nAcciones pendientes\n- Responder confirmando' }; }
    if (path === '/api/ai/replies') { await delay(700); return { options: [{ label: 'Confirmar', body: 'Hola, perfecto. Lo confirmo. ¡Gracias!' }, { label: 'Pedir detalles', body: 'Hola, ¿podrías darme más detalles antes de confirmar?' }, { label: 'Declinar', body: 'Hola, lo siento, no podré esta vez. ¡Gracias por avisar!' }] }; }
    if (path === '/api/ai/draft') { await delay(800); return { subject: b.instruction ? 'Sobre lo que hablamos' : '', body: 'Hola,\n\nTe escribo para confirmar lo que hablamos. Quedo atento a tus comentarios.\n\nUn saludo.' }; }
    if (path === '/api/ai/rewrite') { await delay(500); return { text: (b.text || '').trim() + ' (versión mejorada por Yerleny)' }; }
    if (path === '/api/ai/triage') { await delay(600); return { items: live().slice(0, 6).map((x, i) => ({ uid: x.uid, priority: i < 2 ? 3 : i < 4 ? 2 : 1, category: i < 2 ? 'trabajo' : 'personal', why: 'Prioridad de ejemplo' })) }; }
    if (path === '/api/ai/search') { await delay(500); return { query: { text: 'presupuesto' }, total: 1, messages: [summary(mails[4])] }; }
    if (path === '/api/ai/agent') { await delay(900); return { reply: 'Esto es una demostración: en la app real, Yerleny busca en tu correo, resume y prepara borradores que tú revisas y envías.', history: [], drafts: [], memories: [] }; }
    if (/^\/api\/(oauth|archive|ai\/(models|test|ollama|presets|local))/.test(path)) return {};
    if (m === 'GET') return {};
    return { ok: true };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, o = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!u.pathname.startsWith('/api/')) return realFetch(input, o);
    await delay(60 + Math.random() * 80); // sensación de red real
    try { return J(await route(u.pathname, u.searchParams, o)); } catch (e) { return J({ error: String(e && e.message || e) }, 500); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div'); bar.id = 'demobar';
    bar.innerHTML = 'Modo demostración · datos de ejemplo, sin conexión a ningún correo' + (/Android/.test(navigator.userAgent) ? ' <a href="casamail-demo-exit://salir">Salir</a>' : '');
    document.body.appendChild(bar);
  });
})();
