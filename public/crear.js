'use strict';
/* CasaMail — "Crear correo nuevo": lleva a la página OFICIAL de registro del proveedor y, al volver, conecta la cuenta nueva.
   (Los proveedores exigen verificar un móvil y resolver un captcha en su propia página: ninguna aplicación puede crear la cuenta por ti.) */
const NUEVO = [
  { id: 'google', name: 'Gmail', by: 'Google', mark: 'G', color: '#d9483b', url: 'https://accounts.google.com/signup?hl=es', after: 'google',
    free: '15 GB gratis', needs: 'Un número de móvil para verificar la cuenta.', tips: ['Elige tu dirección @gmail.com.', 'Anota la contraseña y activa la verificación en 2 pasos (la necesitarás para conectarla).'] },
  { id: 'microsoft', name: 'Outlook', by: 'Microsoft (Outlook.com / Hotmail)', mark: 'M', color: '#2a6fdb', url: 'https://signup.live.com/signup?mkt=es-ES', after: 'microsoft',
    free: '15 GB gratis', needs: 'Un correo o móvil para verificar.', tips: ['Elige @outlook.com o @hotmail.com.', 'Termina el registro hasta ver tu bandeja de entrada.'] },
  { id: 'yahoo', name: 'Yahoo Mail', by: 'Yahoo', mark: 'Y', color: '#6b2fd1', url: 'https://login.yahoo.com/account/create?lang=es-ES', after: 'imap', preset: 'yahoo',
    free: '1 TB gratis', needs: 'Un número de móvil para verificar.', tips: ['Después tendrás que crear una “contraseña de aplicación” para conectarla a CasaMail (te mostramos dónde).'] },
  { id: 'icloud', name: 'iCloud Mail', by: 'Apple', mark: '', color: '#3a3f4a', url: 'https://appleid.apple.com/account', after: 'imap', preset: 'icloud',
    free: '5 GB gratis', needs: 'Crea un ID de Apple; tu correo será @icloud.com.', tips: ['Activa Correo de iCloud en los ajustes de tu cuenta Apple.', 'Después crea una “contraseña específica de app” para conectarla.'] },
  { id: 'zoho', name: 'Zoho Mail', by: 'Zoho', mark: 'Z', color: '#c8473b', url: 'https://accounts.zoho.com/register', after: 'imap', preset: 'zoho',
    free: '5 GB gratis, sin publicidad', needs: 'Un correo o móvil para verificar.', tips: ['En Zoho Mail → Configuración → Acceso POP/IMAP, activa IMAP.', 'Si activas la verificación en 2 pasos, crea una contraseña de aplicación.'] },
];
/** Dónde crear la contraseña de aplicación (Gmail/Yahoo/iCloud no aceptan la contraseña normal en programas de correo). */
const APP_PASSWORD = { gmail: 'https://myaccount.google.com/apppasswords', yahoo: 'https://login.yahoo.com/account/security', icloud: 'https://account.apple.com/account/manage', zoho: 'https://accounts.zoho.com/home#security/app_password' };

function crearCuenta(sel) {
  const p = sel && NUEVO.find(x => x.id === sel);
  if (p) return crearPaso2(p);
  openModal(`<div class="narrow-in wide"><div class="row" style="margin:0 0 4px"><h3 style="font-size:21px">Crear un correo nuevo</h3><span class="grow"></span><button class="iconbtn" id="cwx" aria-label="Cerrar">${I('x')}</button></div>
    <p class="lead mut" style="margin:0 0 14px">Elige dónde quieres tu correo. Se abrirá la página oficial del proveedor para que crees la cuenta (ellos verifican tu móvil); luego vuelves aquí y la conectamos.</p>
    <div class="nuevo-grid">${NUEVO.map(x => `<button class="nuevo-card" data-new-prov="${x.id}"><span class="mk" style="background:${x.color}">${x.mark || '@'}</span><b>${esc(x.name)}</b><span class="mut">${esc(x.by)}</span><span class="free">${esc(x.free)}</span></button>`).join('')}</div>
    <p class="mut" style="font-size:13px;margin:14px 0 0">¿Tu empresa o hosting te dio un correo con tu propio dominio (cPanel, Hostinger, GoDaddy…)? No hace falta crearlo aquí: usa <a href="#" id="cwimap">Otra cuenta (IMAP)</a>. ¿Ya tienes correo? <a href="#" id="cwyes">Conéctalo</a>.</p></div>`, true);
  $('#cwx').onclick = closeModal; $('#cwimap').onclick = e => { e.preventDefault(); settings('cuentas', 'imap'); }; $('#cwyes').onclick = e => { e.preventDefault(); settings('cuentas'); };
  $$('[data-new-prov]').forEach(b => b.onclick = () => crearPaso2(NUEVO.find(x => x.id === b.dataset.newProv)));
}

function crearPaso2(p) {
  openModal(`<div class="narrow-in wide"><div class="row" style="margin:0 0 6px"><span class="mk" style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;font-weight:800;background:${p.color}">${p.mark || '@'}</span><h3 style="font-size:20px">Crear tu correo en ${esc(p.name)}</h3><span class="grow"></span><button class="iconbtn" id="cwx" aria-label="Cerrar">${I('x')}</button></div>
    <ol class="nuevo-steps">
      <li><b>Abre la página de registro</b><span class="mut">Es la página oficial de ${esc(p.by)}. Necesitarás: ${esc(p.needs.charAt(0).toLowerCase() + p.needs.slice(1))}</span>
        <a class="btn btn-primary" id="cwgo" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${I('globe', 'sm')} Crear cuenta en ${esc(p.name)}</a></li>
      <li><b>Termina el registro</b><ul>${p.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></li>
      <li><b>Vuelve aquí y conéctala</b><span class="mut">CasaMail no guarda nada en ningún servidor: tu cuenta y tus claves se quedan en este equipo.</span>
        <button class="btn" id="cwdone">Ya la creé: conectarla a CasaMail</button></li>
    </ol>
    <div class="row" style="justify-content:space-between;margin-top:8px"><button class="btn btn-ghost btn-sm" id="cwback">← Otro proveedor</button><span class="mut" style="font-size:12.5px">¿La página no se abre? Copia: <code>${esc(p.url.replace(/\?.*$/, ''))}</code></span></div></div>`, true);
  $('#cwx').onclick = closeModal; $('#cwback').onclick = () => crearCuenta();
  $('#cwdone').onclick = () => settings('cuentas', p.after === 'imap' ? 'imap' : p.after, p.preset);
}
