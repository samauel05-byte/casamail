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
  const REDES = { Instagram: '', Facebook: 'https://www.facebook.com/p/Casalabsrd-61593879404954/' };
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
})();
