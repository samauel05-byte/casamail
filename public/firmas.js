'use strict';
/* CasaMail — firmas con imagen (HTML), como en Outlook. Se carga después de app.js. */
Object.assign(ICONS, {
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
});

/* ---------- elegir la firma al redactar ---------- */
async function loadSigs(force) {
  if (S.sigs && !force) return S.sigs;
  try { S.sigs = await api('/api/signatures'); } catch { S.sigs = S.sigs || {}; }
  return S.sigs;
}
function drawSig() {
  const bar = $('#sigbar'), prev = $('#sigprev'); if (!bar) return;
  if (!S.sigs) { bar.hidden = prev.hidden = true; loadSigs().then(() => drawSig()); return; }
  const set = S.sigs[$('#from').value], reply = !!S.reply;
  if (!set || !set.items.length) { bar.hidden = prev.hidden = true; return; }
  const sel = $('#sigsel'), def = reply ? set.replyDefault : set.newDefault;
  sel.innerHTML = set.items.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + '<option value="">Sin firma</option>';
  sel.value = def; bar.hidden = false; showSigPreview();
}
function showSigPreview() {
  const set = (S.sigs || {})[$('#from').value], it = set && set.items.find(x => x.id === $('#sigsel').value), prev = $('#sigprev');
  if (!it) { prev.hidden = true; prev.innerHTML = ''; return; }
  prev.innerHTML = it.html; prev.hidden = false; // el servidor ya limpió este HTML al guardarlo
}
$('#sigsel').onchange = showSigPreview;
$('#sigedit').onclick = () => settings('firma');
loadSigs();

/* ---------- imágenes: se reducen para que la firma pese poco ---------- */
async function imageToDataUri(file, maxW = 600) {
  const bmp = await createImageBitmap(file); let k = Math.min(1, maxW / bmp.width), out = '', w = 0, h = 0;
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  for (let i = 0; i < 6; i++) {
    w = Math.max(1, Math.round(bmp.width * k)); h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    out = cv.toDataURL(type, 0.88); if (out.length < 520000) break; k *= 0.75; // demasiado grande: se reduce hasta que quepa
  }
  if (out.length >= 520000) throw new Error('La imagen es demasiado grande. Usa una más pequeña.');
  return { src: out, w, h };
}

/* ---------- Ajustes → Firma ---------- */
async function tabFirma(c) {
  const accts = await api('/api/accounts'); let sigs = await loadSigs(true);
  const put = async (acc, set) => { try { S.sigs[acc] = await api('/api/signatures/' + encodeURIComponent(acc), set, 'PUT'); sigs = S.sigs; } catch (e) { fail(e); } };
  const draw = () => {
    c.innerHTML = `<h3>Firmas</h3><p class="lead">Crea firmas con tu logo, como en Outlook. Elige una para los mensajes nuevos y otra (por ejemplo, más corta) para las respuestas. Al redactar puedes cambiarla.</p>
      ${accts.map(a => { const set = sigs[a.id] || { items: [], newDefault: '', replyDefault: '' };
        return `<div class="sigcard"><div class="row" style="margin:0 0 8px"><b>${esc(a.email)}</b><span class="grow"></span>${set.serverManaged ? '' : `<button class="btn btn-sm" data-imp="${esc(a.id)}">${I('download', 'sm')} Importar de un correo enviado</button><button class="btn btn-primary btn-sm" data-new="${esc(a.id)}">${I('plus', 'sm')} Nueva firma</button>`}</div>
          <label class="chip" style="margin:0 0 8px;display:inline-flex"><input type="checkbox" data-srv="${esc(a.id)}" ${set.serverManaged ? 'checked' : ''}> Mi servidor de correo ya añade la firma (no añadir aquí)</label>
          ${set.serverManaged
            ? `<div class="note">${I('check')}<span>CasaMail <b>no añadirá firma</b> en esta cuenta: la pone tu servidor de correo, así no sale duplicada. En tu carpeta <b>Enviados</b> el correo se verá sin la firma, pero el destinatario sí la recibe.</span></div>`
            : (set.items.length ? set.items.map(x => `<div class="sigitem"><div class="sigthumb">${x.html}</div><div class="grow"><b>${esc(x.name)}</b>
            <div class="sigsel"><label class="chip"><input type="radio" name="n-${esc(a.id)}" data-nd="${esc(a.id)}|${esc(x.id)}" ${set.newDefault === x.id ? 'checked' : ''}>Mensajes nuevos</label><label class="chip"><input type="radio" name="r-${esc(a.id)}" data-rd="${esc(a.id)}|${esc(x.id)}" ${set.replyDefault === x.id ? 'checked' : ''}>Respuestas</label></div></div>
            <button class="btn btn-sm" data-edit="${esc(a.id)}|${esc(x.id)}">Editar</button><button class="iconbtn" data-del="${esc(a.id)}|${esc(x.id)}" title="Borrar" aria-label="Borrar">${I('trash')}</button></div>`).join('') : '<p class="mut" style="margin:6px 0">Sin firma. Crea una o impórtala de un correo que ya enviaste (con tu logo).</p>')}</div>`; }).join('') || '<div class="note">Añade una cuenta primero.</div>'}`;
    const set0 = a => (sigs[a] ||= { items: [], newDefault: '', replyDefault: '' });
    $$('[data-new]', c).forEach(b => b.onclick = () => sigEditor(b.dataset.new, null, async v => { const a = b.dataset.new, set = set0(a); set.items.push({ id: '', ...v }); await put(a, set); settings('firma'); }));
    $$('[data-edit]', c).forEach(b => b.onclick = () => { const [a, id] = b.dataset.edit.split('|'), set = set0(a), it = set.items.find(x => x.id === id); sigEditor(a, it, async v => { Object.assign(it, v); await put(a, set); settings('firma'); }); });
    $$('[data-del]', c).forEach(b => b.onclick = async () => { if (!confirm('¿Borrar esta firma?')) return; const [a, id] = b.dataset.del.split('|'), set = set0(a); set.items = set.items.filter(x => x.id !== id); await put(a, set); draw(); });
    $$('[data-nd]', c).forEach(b => b.onchange = async () => { const [a, id] = b.dataset.nd.split('|'), set = set0(a); set.newDefault = id; await put(a, set); toast('Firma para mensajes nuevos guardada'); });
    $$('[data-rd]', c).forEach(b => b.onchange = async () => { const [a, id] = b.dataset.rd.split('|'), set = set0(a); set.replyDefault = id; await put(a, set); toast('Firma para respuestas guardada'); });
    $$('[data-imp]', c).forEach(b => b.onclick = () => sigImport(b.dataset.imp, b));
    $$('[data-srv]', c).forEach(b => b.onchange = async () => { const a = b.dataset.srv, set = set0(a); set.serverManaged = b.checked; await put(a, set); toast(b.checked ? 'CasaMail no añadirá firma en esta cuenta (la pone tu servidor)' : 'Firma gestionada por CasaMail'); draw(); });
  };
  draw();
}

/** Busca la firma en los correos enviados y deja elegir cuál usar. */
async function sigImport(acc, btn) {
  busy(btn, true); const orig = btn.innerHTML; btn.textContent = 'Buscando en Enviados…';
  try {
    const r = await api(`/api/signatures/${encodeURIComponent(acc)}/import`, {});
    if (!r.candidates.length) { toast('No encontré una firma con logo en tus últimos correos enviados. Pégala en el editor (cópiala desde Outlook) o envíate un correo con tu firma y vuelve a intentarlo.', { ms: 12000 }); return; }
    openModal(`<div class="narrow-in"><h3 style="font-size:20px">Firmas encontradas</h3><p class="lead mut" style="margin:6px 0 12px">Las encontré en tus últimos correos enviados. Elige la que quieres usar; podrás recortarla o retocarla.</p>
      ${r.candidates.map((x, i) => `<div class="sigitem"><div class="sigthumb">${x.html}</div><div class="grow mut" style="font-size:12.5px">De «${esc(x.subject || '(sin asunto)')}»${x.date ? ' · ' + new Date(x.date).toLocaleDateString('es') : ''}</div><button class="btn btn-primary btn-sm" data-use="${i}">Usar esta</button></div>`).join('')}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost" id="icx">Cancelar</button></div></div>`, true);
    $('#icx').onclick = () => settings('firma');
    $$('[data-use]').forEach(u => u.onclick = () => sigEditor(acc, { name: 'Principal', html: r.candidates[Number(u.dataset.use)].html }, async v => {
      const set = (S.sigs[acc] ||= { items: [], newDefault: '', replyDefault: '' }); set.items.push({ id: '', ...v });
      S.sigs[acc] = await api('/api/signatures/' + encodeURIComponent(acc), set, 'PUT'); settings('firma');
    }));
  } catch (e) { fail(e); } finally { busy(btn, false); btn.innerHTML = orig; }
}

/** Editor de una firma: escribe, pega (Ctrl+V desde Outlook) o sube tu logo. */
function sigEditor(acc, it, onSave) {
  openModal(`<div class="narrow-in wide"><h3 style="font-size:20px">${it && it.id !== undefined && it.name ? 'Editar firma' : 'Nueva firma'}</h3>
    <label class="lb">Nombre (solo para ti)</label><input id="sgn" class="field" maxlength="60" value="${esc(it ? it.name : 'Principal')}">
    <label class="lb">Firma</label>
    <div class="sgtb"><button type="button" data-cmd="bold" title="Negrita"><b>N</b></button><button type="button" data-cmd="italic" title="Cursiva"><i>K</i></button><button type="button" data-cmd="underline" title="Subrayado"><u>S</u></button>
      <input type="color" id="sgc" title="Color del texto" value="#0a3d7c"><button type="button" id="sgl" title="Enlace">${I('globe', 'sm')}</button><button type="button" id="sgi" title="Insertar imagen o logo">${I('image', 'sm')}</button><button type="button" data-cmd="removeFormat" title="Quitar formato">Tx</button><input type="file" id="sgf" accept="image/png,image/jpeg,image/gif,image/webp" hidden></div>
    <div id="sged" class="sged" contenteditable="true" role="textbox" aria-label="Editor de firma" spellcheck="false"></div>
    <p class="mut" style="font-size:12.5px;margin:8px 0 0">Consejo: copia tu firma desde Outlook o tu webmail (Ctrl+C) y pégala aquí (Ctrl+V). Si el logo no aparece al pegar, súbelo con el botón de imagen. Toca una imagen para cambiar su ancho.</p>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-ghost" id="sgx">Cancelar</button><button class="btn btn-primary" id="sgok">Guardar firma</button></div></div>`, true);
  const ed = $('#sged'); ed.innerHTML = it && it.html ? it.html : '<div>Un saludo,<br><b>Tu nombre</b></div>';
  $$('[data-cmd]').forEach(b => b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.cmd); });
  $('#sgc').oninput = e => { ed.focus(); document.execCommand('foreColor', false, e.target.value); };
  $('#sgl').onmousedown = e => { e.preventDefault(); const u = prompt('Dirección del enlace (https://…)'); if (u && /^(https?:|mailto:|tel:)/i.test(u.trim())) document.execCommand('createLink', false, u.trim()); };
  const insert = async file => {
    try { const im = await imageToDataUri(file); ed.focus(); document.execCommand('insertHTML', false, `<img src="${im.src}" width="${Math.min(im.w, 200)}" alt="Logo" style="max-width:100%">`); }
    catch (e) { toast(e.message || 'No se pudo usar la imagen', { kind: 'bad' }); }
  };
  $('#sgi').onmousedown = e => { e.preventDefault(); $('#sgf').click(); };
  $('#sgf').onchange = async e => { for (const f of e.target.files) await insert(f); e.target.value = ''; };
  ed.addEventListener('paste', async e => { const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')); if (files.length && !e.clipboardData.getData('text/html')) { e.preventDefault(); for (const f of files) await insert(f); } });
  ed.addEventListener('click', e => { const im = e.target.closest('img'); if (!im) return; const w = prompt('Ancho de la imagen en píxeles', im.getAttribute('width') || im.width); if (w && /^\d{1,3}$/.test(w.trim())) im.setAttribute('width', w.trim()); });
  $('#sgx').onclick = () => settings('firma');
  $('#sgok').onclick = async b => {
    const html = ed.innerHTML.trim(), name = $('#sgn').value.trim() || 'Firma'; if (!ed.textContent.trim() && !ed.querySelector('img')) return toast('La firma está vacía', { kind: 'bad' });
    busy(b.currentTarget, true); try { await onSave({ name, html }); } catch (x) { fail(x); busy(b.currentTarget, false); }
  };
  ed.focus();
}
