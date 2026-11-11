import crypto from "node:crypto";
import { Parser, parseDocument, DomUtils } from "htmlparser2";
import type { Element, ChildNode } from "domhandler";
import * as store from "./store.js";
import type { Outgoing } from "./mail.js";

/**
 * Firmas con imagen (HTML), como las de Outlook: se pueden tener varias por cuenta, elegir una para los mensajes nuevos y otra
 * para las respuestas, e importar la que ya usas desde un correo que enviaste. Se guardan solo en este equipo.
 */
export interface Signature { id: string; name: string; html: string; text: string }
export interface SigSet { items: Signature[]; newDefault: string; replyDefault: string; serverManaged?: boolean }
const FILE = "signatures.json";

// ---------- limpieza de HTML (la firma puede venir de un correo ajeno: solo pasa lo seguro) ----------
const ALLOWED = new Set("a b i u s strong em br p div span img table thead tbody tfoot tr td th col colgroup font hr ul ol li h1 h2 h3 h4 h5 h6 small big sup sub center blockquote pre code".split(" "));
const VOID = new Set(["br", "img", "hr", "col"]);
const DROP = new Set("script style iframe object embed noscript template svg math form title head textarea select button link meta base audio video canvas".split(" "));
const ATTRS = new Set("style align valign width height bgcolor color border cellpadding cellspacing colspan rowspan face size title dir lang".split(" "));
const CSS_OK = /^(color|background(-color)?|font(-family|-size|-weight|-style)?|text-(align|decoration|transform|indent)|line-height|letter-spacing|margin(-(top|right|bottom|left))?|padding(-(top|right|bottom|left))?|border(-(top|right|bottom|left|collapse|spacing|radius|width|style|color))?|width|height|max-width|max-height|min-width|vertical-align|white-space|display|float|mso-line-height-rule)$/;
const MAX_IMG = 450_000, MAX_HTML = 600_000;
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function cleanStyle(v: string): string {
  return v.split(";").map((d) => { const i = d.indexOf(":"); if (i < 0) return ""; const k = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim(); return CSS_OK.test(k) && val && !/url\s*\(|expression|javascript:|@import|[\\<>]|behavior|-moz-binding/i.test(val) ? `${k}:${val}` : ""; }).filter(Boolean).join(";");
}
const safeHref = (u: string) => /^(https?:|mailto:|tel:)/i.test(u.trim()) ? u.trim() : "";
const safeSrc = (u: string, images: boolean) => {
  if (!images) return "";
  const s = u.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
  return m && m[2].length <= MAX_IMG * 1.4 ? s.replace(/\s+/g, "") : "";
};

export function sanitize(html: string, o: { images?: boolean } = {}): string {
  const images = o.images ?? true; let out = "", skip = 0;
  const p = new Parser({
    onopentag(name, attrs) {
      if (skip) { if (!VOID.has(name)) skip++; return; }
      if (DROP.has(name)) { skip = 1; return; }
      if (!ALLOWED.has(name)) return;
      let a = "";
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "style") { const s = cleanStyle(v); if (s) a += ` style="${escHtml(s)}"`; }
        else if (ATTRS.has(k) && !/[<>"]/.test(v) && v.length < 200) a += ` ${k}="${escHtml(v)}"`;
        else if (name === "a" && k === "href") { const h = safeHref(v); if (h) a += ` href="${escHtml(h)}"`; }
        else if (name === "img" && k === "src") { const s = safeSrc(v, images); if (s) a += ` src="${escHtml(s)}"`; }
        else if (name === "img" && k === "alt") a += ` alt="${escHtml(v.slice(0, 200))}"`;
      }
      if (name === "img" && !/ src=/.test(a)) return; // imagen sin origen permitido: se descarta
      if (name === "a") a += ' target="_blank" rel="noopener noreferrer"';
      out += `<${name}${a}>`;
    },
    ontext(t) { if (!skip) out += escHtml(t); },
    onclosetag(name) { if (skip) { skip--; return; } if (ALLOWED.has(name) && !VOID.has(name)) out += `</${name}>`; },
  }, { decodeEntities: true });
  p.write(html.slice(0, MAX_HTML * 2)); p.end();
  return out.slice(0, MAX_HTML);
}

/** Versión en texto plano (para el cuerpo "texto" del mensaje y para clientes que no muestran HTML). */
export function toText(html: string): string {
  let out = ""; const hrefs: string[] = [];
  const BLOCK = new Set("p div tr li h1 h2 h3 h4 h5 h6 table blockquote pre hr".split(" "));
  let skip = 0, linkText = "";
  const p = new Parser({
    onopentag(name, a) { if (skip) { skip++; return; } if (DROP.has(name)) { skip = 1; return; } if (name === "br") out += "\n"; if (name === "a") { hrefs.push(safeHref(a.href ?? "")); linkText = ""; } },
    ontext(t) { if (!skip) { out += t; linkText += t; } },
    onclosetag(name) {
      if (skip) { skip--; return; }
      if (name === "a") { const h = hrefs.pop(); if (h && !/^mailto:/i.test(h) && h.replace(/\/$/, "") !== linkText.trim().replace(/\/$/, "") && !linkText.includes(h.replace(/^https?:\/\//, ""))) out += ` (${h})`; }
      else if (name === "td" || name === "th") out += "  ";
      else if (BLOCK.has(name)) out += "\n";
    },
  }, { decodeEntities: true });
  p.write(html); p.end();
  return out.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{3,}/g, "  ").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- almacenamiento ----------
const clean = (s: Partial<Signature>, keep?: string): Signature => { const html = sanitize(String(s.html ?? "")); return { id: keep ?? (s.id && /^[\w-]{1,40}$/.test(s.id) ? s.id : crypto.randomBytes(5).toString("hex")), name: String(s.name ?? "Firma").trim().slice(0, 60) || "Firma", html, text: toText(html) }; };
const all = () => store.readJson<Record<string, SigSet>>(FILE, {});

/** Firmas de una cuenta. Si solo existe la firma de texto antigua (Ajustes → Firma), se ofrece como una más. */
export function forAccount(accountId: string): SigSet {
  const s = all()[accountId];
  if (s?.items?.length) return { items: s.items, newDefault: s.items.some((x) => x.id === s.newDefault) ? s.newDefault : s.items[0].id, replyDefault: s.items.some((x) => x.id === s.replyDefault) ? s.replyDefault : (s.items.some((x) => x.id === s.newDefault) ? s.newDefault : s.items[0].id), serverManaged: !!s.serverManaged };
  if (s?.serverManaged) return { items: [], newDefault: "", replyDefault: "", serverManaged: true };
  const legacy = store.getSettings().signatures[accountId]?.trim();
  if (legacy) { const html = `<div>${legacy.split("\n").map(escHtml).join("<br>")}</div>`; return { items: [{ id: "texto", name: "Texto", html, text: legacy }], newDefault: "texto", replyDefault: "texto" }; }
  return { items: [], newDefault: "", replyDefault: "" };
}
export function save(accountId: string, set: Partial<SigSet>): SigSet {
  const items = (set.items ?? []).slice(0, 10).map((x) => clean(x)), ids = new Set(items.map((x) => x.id));
  const nd = ids.has(set.newDefault ?? "") ? set.newDefault! : (items[0]?.id ?? "");
  // si no se eligió una firma específica para respuestas, se usa la de los mensajes nuevos (antes caía en la primera de la lista, que podía no ser la de imagen)
  const out: SigSet = { items, newDefault: nd, replyDefault: ids.has(set.replyDefault ?? "") ? set.replyDefault! : nd, serverManaged: !!set.serverManaged };
  const a = all(); a[accountId] = out; store.writeJson(FILE, a); return out;
}
/** Qué firma se usa: `choice` = id elegido en el redactor; "" = ninguna; undefined = la predeterminada (mensaje nuevo o respuesta). */
export function pick(accountId: string, choice: string | undefined, reply: boolean): Signature | null {
  if (choice === "") return null;
  const s = forAccount(accountId);
  if (s.serverManaged) return null; // la firma la añade el servidor de correo: CasaMail no añade ninguna (para no duplicar)
  const id = choice ?? (reply ? s.replyDefault : s.newDefault);
  return s.items.find((x) => x.id === id) ?? null;
}

// ---------- componer el mensaje con firma ----------
const MIME_EXT: Record<string, string> = { png: "png", jpeg: "jpg", jpg: "jpg", gif: "gif", webp: "webp" };
/** Convierte las imágenes incrustadas (data:) en imágenes "cid:" adjuntas: así las ven Gmail, Outlook y el resto (los data: se bloquean). */
export function inlineImages(html: string): { html: string; attachments: NonNullable<Outgoing["attachments"]> } {
  const attachments: NonNullable<Outgoing["attachments"]> = []; const seen = new Map<string, string>();
  const out = html.replace(/src="data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)"/gi, (_m, t: string, b64: string) => {
    let cid = seen.get(b64);
    if (!cid) { cid = `firma${attachments.length + 1}-${crypto.randomBytes(4).toString("hex")}@casamail`; seen.set(b64, cid); const ext = MIME_EXT[t.toLowerCase()]; attachments.push({ filename: `imagen${attachments.length + 1}.${ext}`, content: b64, encoding: "base64", cid, contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, contentDisposition: "inline" }); }
    return `src="cid:${cid}"`;
  });
  return { html: out, attachments };
}

const linkify = (t: string) => t.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g, (u) => `<a href="${u}">${u}</a>`);
export const textToHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45">${linkify(escHtml(t)).split("\n").join("<br>")}</div>`;

/**
 * Añade la firma al mensaje. `m.text` es lo que escribió el usuario; `quote` (respuestas) es el mensaje citado y va DESPUÉS de la firma.
 * Sin firma, el mensaje queda como estaba (texto plano).
 */
export function withSignature(m: Outgoing, sig: Signature | null, quote?: { text: string; html: string }): Outgoing {
  const body = m.text ?? "";
  if (!sig) return quote ? { ...m, text: `${body}\n\n${quote.text}` } : m;
  const img = inlineImages(sig.html);
  const text = `${body}\n\n-- \n${sig.text}${quote ? `\n\n${quote.text}` : ""}`;
  const html = `${textToHtml(body)}<br><div class="firma">${img.html}</div>${quote ? `<br>${quote.html}` : ""}`;
  return { ...m, text, html, attachments: [...(m.attachments ?? []), ...img.attachments] };
}

// ---------- importar la firma de un correo enviado ----------
const QUOTE_ID = /^(divRplyFwdMsg|appendonsend|x_divRplyFwdMsg|_rc_quote)$/i, QUOTE_CLASS = /(gmail_quote|moz-cite-prefix|OutlookMessageHeader|yahoo_quoted|protonmail_quote)/i;
const SIG_ID = /^(signature|_rc_sig|x_signature|ms-outlook-signature|Signature)$/i, SIG_CLASS = /(moz-signature|gmail_signature|ms-outlook-signature|\bsignature\b|\bfirma\b)/i;
const isEl = (n: ChildNode): n is Element => n.type === "tag" || n.type === "script" || n.type === "style";
const textOf = (n: ChildNode) => DomUtils.textContent(n).replace(/ /g, " ").trim();
const hasMedia = (n: ChildNode) => isEl(n) && (n.name === "img" || n.name === "table" || DomUtils.findOne((e) => e.name === "img", [n], true) !== null);
const outer = (nodes: ChildNode[]) => nodes.map((n) => DomUtils.getOuterHTML(n)).join("");

/** Descarta el mensaje citado y devuelve los bloques de primer nivel del cuerpo. */
function topBlocks(html: string): ChildNode[] {
  const doc = parseDocument(html); const body = DomUtils.findOne((e) => e.name === "body", doc.children, true);
  let kids: ChildNode[] = (body ? body.children : doc.children).filter((n) => !(n.type === "text" && !n.data.trim()) && n.type !== "comment");
  while (kids.length === 1 && isEl(kids[0]) && /^(div|center|span|font)$/.test(kids[0].name) && !SIG_CLASS.test(kids[0].attribs.class ?? "") && !SIG_ID.test(kids[0].attribs.id ?? "")) {
    const inner = kids[0].children.filter((n) => !(n.type === "text" && !n.data.trim()) && n.type !== "comment"); if (!inner.length) break; kids = inner;
  }
  const cut = kids.findIndex((n) => isEl(n) && (QUOTE_ID.test(n.attribs.id ?? "") || QUOTE_CLASS.test(n.attribs.class ?? "") || n.name === "blockquote" || (n.name === "hr" && kids.indexOf(n) > 0) || DomUtils.findOne((e) => QUOTE_ID.test(e.attribs?.id ?? "") || QUOTE_CLASS.test(e.attribs?.class ?? ""), [n], true) !== null));
  return cut >= 0 ? kids.slice(0, cut) : kids;
}

/**
 * Busca la firma dentro del HTML de un correo enviado: primero por las marcas que ponen los programas de correo
 * (Outlook web, Roundcube, Thunderbird, Gmail…), luego por el separador "-- ", y si no por el bloque final que lleva imagen o tabla.
 * Devuelve null si no encuentra nada razonable; el usuario siempre puede recortar el resultado en el editor.
 */
export function extractSignature(html: string): string | null {
  const doc = parseDocument(html);
  const marked = DomUtils.findOne((e) => SIG_ID.test(e.attribs?.id ?? "") || SIG_CLASS.test(e.attribs?.class ?? ""), doc.children, true);
  if (marked && textOf(marked).length + (hasMedia(marked) ? 1 : 0) > 3) {
    const s = sanitize(DomUtils.getOuterHTML(marked)).replace(/^(<(div|span)[^>]*>)?\s*(<br>)?\s*--\s*(<br>)?/i, "$1"); return s.trim() ? s : null;
  }
  const blocks = topBlocks(html), flat = blocks.map(textOf);
  const dash = flat.findIndex((t) => /^--\s*$/.test(t.split("\n")[0]) || t === "--");
  if (dash >= 0 && blocks.length - dash <= 12) return sanitize(outer(blocks.slice(dash + 1)).replace(/^\s*(<br>)+/i, "")) || null;
  // sin marcas: el final del mensaje a partir del primer bloque con imagen o tabla (más hasta 4 líneas cortas justo antes: nombre, cargo…)
  const from = Math.max(0, blocks.length - 8), firstMedia = blocks.findIndex((n, i) => i >= from && hasMedia(n));
  if (firstMedia > 0 || (firstMedia === 0 && blocks.length <= 8)) {
    let start = firstMedia, back = 0; while (start > 0 && back < 4 && flat[start - 1].length < 90 && !hasMedia(blocks[start - 1])) { start--; back++; }
    if (start > 0 || blocks.length <= 3) { const tail = blocks.slice(start); if (flat.slice(start).join(" ").length < 900) return sanitize(outer(tail)) || null; }
  }
  return null;
}
