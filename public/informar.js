'use strict';
/* CasaMail — «Informar de un problema» con las respuestas de Yerleny (IA). Abre un correo ya preparado hacia el soporte;
   el usuario lo revisa antes de enviarlo (la respuesta señalada puede contener texto de sus correos). */
const SOPORTE = 'info@casalabs.com.do';
function informeUrl(texto, version) {
  const t = String(texto || '').replace(/\s+\n/g, '\n').trim().slice(0, 1500);
  const cuerpo = `Describe el problema (respuesta ofensiva, incorrecta, peligrosa, otro):\n\n\n\n--- Respuesta de Yerleny señalada ---\n${t || '(sin texto)'}\n--- CasaMail ${version || 'n/d'} ---\n(Revisa este mensaje antes de enviarlo: puede incluir texto de tus correos.)`;
  return `mailto:${SOPORTE}?subject=${encodeURIComponent('Informe sobre una respuesta de Yerleny')}&body=${encodeURIComponent(cuerpo)}`;
}
async function informarIA(texto) {
  let v = ''; try { v = (await api('/api/update')).version || ''; } catch { /* sin versión */ }
  window.open(informeUrl(texto, v), '_self');
  toast('Se abrió un correo con tu informe: revísalo y envíalo.');
}
const txtSinBoton = el => { const c = el.cloneNode(true); c.querySelectorAll('.rep,button').forEach(x => x.remove()); return c.innerText; };
function ponerInformar(el) {
  if (el.querySelector('.rep')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'rep'; b.title = 'Informar de un problema con esta respuesta de Yerleny'; b.textContent = 'Informar de un problema';
  b.onclick = e => { e.stopPropagation(); informarIA(txtSinBoton(el)); }; el.appendChild(b);
}
const SEL = '.card-ai, .dr:not(.mem), .bub.bot';
const listo = el => !el.classList.contains('typing-w') && !el.classList.contains('err') && !el.querySelector('.typing') && el.textContent.trim();
/** Las respuestas de IA se pintan en varios sitios (resumen, respuestas sugeridas, borradores del asistente, burbujas del chat): se señalan todas. */
function revisar() { $$(SEL).forEach(el => { if (listo(el)) ponerInformar(el); }); }
new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });
// redactar con Yerleny: enlace fijo en el cuadro de IA del redactor
document.addEventListener('DOMContentLoaded', () => { const h = $('.aibox-h'); if (h) { const b = document.createElement('button'); b.type = 'button'; b.className = 'rep'; b.id = 'repdraft'; b.textContent = 'Informar de un problema'; b.onclick = () => informarIA($('#body').value); h.appendChild(b); } });
