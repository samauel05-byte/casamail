'use strict';
/* CasaMail — MODO INDEPENDIENTE (app de Android). El correo se gestiona dentro del propio móvil (IMAP/SMTP): no hace falta PC ni servidor.
   La app Android expone `CasaNative` (puente nativo); aquí se redirigen las llamadas /api/* a él y se muestra el inicio de sesión. */
(() => {
  if (!window.CasaNative) return;
  window.casaNativo = true;
  const pend = new Map(); let n = 0;
  window.__casaRes = (id, estado, json) => { const p = pend.get(id); if (p) { pend.delete(id); p({ estado, json }); } };
  const real = window.fetch.bind(window);
  window.fetch = (input, o = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!u.pathname.startsWith('/api/')) return real(input, o);
    const id = ++n, metodo = (o.method || 'GET').toUpperCase();
    return new Promise(res => {
      pend.set(id, ({ estado, json }) => res(new Response(json, { status: estado, headers: { 'Content-Type': 'application/json' } })));
      CasaNative.llamar(id, metodo, u.pathname + u.search, typeof o.body === 'string' ? o.body : '');
    });
  };

  /* Redes de CasaLabs: rellena las direcciones (https://instagram.com/…, https://facebook.com/…) y aparecen solas. */
  const REDES = { Web: 'https://www.casalabs.com.do/', Instagram: 'https://www.instagram.com/casalabs.rd', Facebook: 'https://www.facebook.com/p/Casalabsrd-61593879404954/' };
  const creditos = () => `<p class="mut" style="margin:26px 0 0;font-size:12.5px">Desarrollado por <b>CasaLabs</b>${Object.entries(REDES).filter(([, u]) => u).map(([n, u]) => ` · <a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('')}</p>`;

  /* ----- inicio de sesión / crear cuenta ----- */
  window.nativoBienvenida = () => {
    $('#list').innerHTML = '';
    $('#view').innerHTML = `<div class="empty" style="min-height:100%"><div style="margin-bottom:8px">${LOGO(150)}</div>
      <h3 style="font-size:26px;letter-spacing:-.02em">Bienvenido a CasaMail</h3>
      <p>Tu correo en el móvil, sin depender de ningún ordenador. Inicia sesión con tu correo o crea una cuenta nueva.</p>
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:10px;margin-top:14px;width:min(320px,100%)"><button class="btn btn-primary btn-lg" id="nlogin">Iniciar sesión</button><button class="btn btn-lg" id="ncrear">Crear cuenta</button></div>
      <p class="mut" style="margin:22px 0 0;font-size:13px"><a href="#" id="ndemo">Probar con datos de ejemplo</a> · <a href="#" id="nserver">Usar mi propio servidor CasaMail</a></p>${creditos()}</div>`;
    $('#nlogin').onclick = () => nativoLogin();
    $('#ncrear').onclick = () => crearCuenta();
    $('#ndemo').onclick = e => { e.preventDefault(); location.href = 'casamail-demo-start://x'; };
    $('#nserver').onclick = e => { e.preventDefault(); location.href = 'casamail-demo-exit://x'; };
  };

  window.nativoLogin = (preEmail, preImap) => {
    openModal(`<div class="narrow-in"><div class="row" style="margin:0 0 4px"><h3 style="font-size:21px">Iniciar sesión</h3><span class="grow"></span><button class="iconbtn" id="nlx" aria-label="Cerrar">${I('x')}</button></div>
      <p class="mut" style="margin:0 0 8px">Escribe tu correo y contraseña. Se guardan cifrados solo en este móvil.</p>
      <label class="lb">Correo</label><input id="nle" type="email" class="field" autocomplete="username" autocapitalize="none" value="${esc(preEmail || '')}">
      <div class="mut" id="nlnota" style="font-size:12.5px;margin-top:6px"></div>
      <label class="lb">Contraseña</label><input id="nlw" type="password" class="field" autocomplete="current-password">
      <details id="nlmas" ${preImap ? 'open' : ''}><summary class="mut" style="margin-top:10px;cursor:pointer">Ajustes del servidor (avanzado)</summary>
        <label class="lb">Servidor IMAP</label><input id="nli" class="field" placeholder="imap.midominio.com"><label class="lb">Puerto IMAP</label><input id="nlip" class="field" value="993">
        <label class="lb">Servidor SMTP</label><input id="nls" class="field" placeholder="smtp.midominio.com"><label class="lb">Puerto SMTP (465 SSL · 587 STARTTLS)</label><input id="nlsp" class="field" value="465"></details>
      <div class="row" style="margin-top:16px"><button class="btn btn-primary" id="nlgo">Iniciar sesión</button><span id="nlst" class="mut"></span></div>
      <p class="mut" style="font-size:12.5px;margin:14px 0 0">¿Gmail, Yahoo o iCloud? Necesitan una <b>contraseña de aplicación</b> (no la normal): al escribir tu correo te mostramos dónde crearla.</p></div>`, true);
    $('#nlx').onclick = closeModal;
    let t = 0;
    const detectar = async () => {
      const e = $('#nle').value.trim(); if (!/.+@.+\..+/.test(e)) { $('#nlnota').textContent = ''; return; }
      try {
        const d = await api('/api/detect?email=' + encodeURIComponent(e)); if (e !== $('#nle').value.trim()) return;
        $('#nlnota').innerHTML = esc(d.nota || '') + (d.enlaceClaveApp ? ` <a href="${esc(d.enlaceClaveApp)}" target="_blank" rel="noopener noreferrer">Crear la contraseña de aplicación →</a>` : '');
        if (d.imapHost) { $('#nli').placeholder = d.imapHost; $('#nls').placeholder = d.smtpHost; $('#nlip').value = d.imapPuerto; $('#nlsp').value = d.smtpPuerto; }
      } catch { /* sin aviso */ }
    };
    $('#nle').oninput = () => { clearTimeout(t); t = setTimeout(detectar, 400); }; if (preEmail) detectar();
    $('#nlgo').onclick = async e => {
      const b = e.currentTarget; busy(b, true); $('#nlst').textContent = 'Comprobando tu cuenta…';
      try {
        await api('/api/accounts', { email: $('#nle').value.trim(), pass: $('#nlw').value, imapHost: $('#nli').value.trim() || undefined, imapPort: Number($('#nlip').value), smtpHost: $('#nls').value.trim() || undefined, smtpPort: Number($('#nlsp').value) });
        closeModal(); toast('Sesión iniciada'); init();
      } catch (x) { $('#nlst').innerHTML = `<span class="err">${esc(x.message)}</span>`; busy(b, false); if (/servidor|host|conectar/i.test(x.message)) $('#nlmas').open = true; }
    };
    $('#nle').focus();
  };

  /* ----- Yerleny (IA) en el móvil: clave gratuita de Gemini ----- */
  window.nativoIA = () => {
    const configurada = S.aiOk;
    openModal(`<div class="narrow-in"><div class="row" style="margin:0 0 4px"><h3 style="font-size:21px">${YL ? '' : ''}Yerleny · IA</h3><span class="grow"></span><button class="iconbtn" id="iax" aria-label="Cerrar">${I('x')}</button></div>
      <p class="mut" style="margin:0 0 10px">Yerleny resume correos, sugiere respuestas y redacta por ti. Usa <b>Gemini de Google</b>, que tiene un <b>nivel gratuito</b>. Pega tu clave gratuita (se guarda cifrada solo en tu móvil; solo se envía a Google el texto que tú pidas procesar).</p>
      <ol class="steps" style="margin:0 0 10px"><li><span>Abre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> e inicia sesión con tu cuenta de Google.</span></li><li><span>Pulsa <b>Crear clave de API</b> y cópiala.</span></li><li><span>Pégala aquí abajo.</span></li></ol>
      <label class="lb">Clave de API de Gemini</label><input id="iak" class="field" type="password" placeholder="${configurada ? '•••• (ya configurada; pega una nueva para cambiarla)' : 'AIza…'}" autocomplete="off" spellcheck="false">
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="iasave">Guardar</button><button class="btn" id="iatest">Probar</button><span id="iast" class="mut"></span></div>
      ${configurada ? `<p class="mut" style="font-size:12.5px;margin:12px 0 0">Yerleny ya está activada. <a href="#" id="iaoff">Desactivar y borrar la clave</a>.</p>` : ''}</div>`, true);
    $('#iax').onclick = closeModal;
    $('#iasave').onclick = async e => {
      const k = $('#iak').value.trim(); if (!k) { $('#iast').innerHTML = '<span class="err">Pega la clave primero.</span>'; return; }
      const b = e.currentTarget; busy(b, true); $('#iast').textContent = 'Comprobando…';
      try { await api('/api/ai/test', {}); } catch { /* el test real va tras guardar */ }
      try { await api('/api/ai/config', { apiKey: k }); const t = await api('/api/ai/test', {}); S.aiOk = true; $('#iast').innerHTML = `<span class="ok">Listo ✔ (${esc(t.reply)})</span>`; toast('Yerleny activada'); setTimeout(closeModal, 900); }
      catch (x) { S.aiOk = false; $('#iast').innerHTML = `<span class="err">${esc(x.message)}</span>`; busy(b, false); }
    };
    $('#iatest').onclick = async e => {
      const k = $('#iak').value.trim(); const b = e.currentTarget; busy(b, true); $('#iast').textContent = 'Probando…';
      try { if (k) await api('/api/ai/config', { apiKey: k }); const t = await api('/api/ai/test', {}); S.aiOk = true; $('#iast').innerHTML = `<span class="ok">Funciona ✔ (${esc(t.reply)})</span>`; }
      catch (x) { $('#iast').innerHTML = `<span class="err">${esc(x.message)}</span>`; }
      busy(b, false);
    };
    const off = $('#iaoff'); if (off) off.onclick = async ev => { ev.preventDefault(); await api('/api/ai/config', { apiKey: '' }); S.aiOk = false; toast('Yerleny desactivada'); closeModal(); };
    $('#iak').focus();
  };

  // En Ajustes, la pestaña "Yerleny" muestra la pantalla de la clave (no los "motores" del escritorio).
  // Se aplica DESPUÉS de app.js (que define tabIA), porque nativo.js se carga antes para interceptar las llamadas.
  const tabIANativo = async (c) => { c.innerHTML = `<h3>Yerleny · IA</h3><p class="lead">Resume correos, sugiere respuestas y redacta por ti, con el nivel gratuito de Gemini.</p>
    <div class="row"><button class="btn btn-primary" id="iaopen">${S.aiOk ? 'Cambiar la clave de IA' : 'Activar Yerleny (clave gratis)'}</button>${S.aiOk ? `<span class="ok" style="align-self:center">Activada ✔</span>` : ''}</div>
    <p class="mut" style="font-size:13px;margin-top:14px">La clave se guarda cifrada solo en tu móvil. Solo se envía a Google el texto que tú pidas resumir, responder o redactar; nada se manda a los creadores de la app.</p>`;
    $('#iaopen').onclick = () => nativoIA();
  };
  const aplicar = () => {
    window.tabIA = tabIANativo;
    // "Archivo local" (importar PST/MBOX) es una función del escritorio: no aplica en el móvil.
    if (typeof TABS !== 'undefined') { const i = TABS.findIndex(t => t[0] === 'archivo'); if (i >= 0) TABS.splice(i, 1); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
})();
