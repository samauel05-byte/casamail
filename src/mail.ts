import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import crypto from "node:crypto";
import { learnContacts } from "./store.js";
import { getAccessToken } from "./oauth.js";
import { once } from "node:events";
import type { Writable } from "node:stream";
import { mboxEntry } from "./mbox.js";
import type { Account } from "./store.js";
import { sanitize as sanitizeHtml, withSignature, type Signature } from "./signature.js";
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface Summary {
  uid: number; subject: string; from: string; to: string; date: string | null;
  unread: boolean; starred: boolean; hasAttachments: boolean;
}
export interface SearchQuery {
  text?: string; from?: string; to?: string; subject?: string;
  since?: string; before?: string; unread?: boolean; starred?: boolean;
}

/** Credenciales IMAP/SMTP: contraseña, o access token OAuth renovado si hace falta. */
async function imapAuth(acc: Account) {
  return acc.oauth ? { user: acc.user, accessToken: await getAccessToken(acc) } : { user: acc.user, pass: acc.pass };
}
async function smtp(acc: Account) {
  const auth = acc.oauth ? { type: "OAuth2" as const, user: acc.user, accessToken: await getAccessToken(acc) } : { user: acc.user, pass: acc.pass };
  return nodemailer.createTransport({ host: acc.smtp.host, port: acc.smtp.port, secure: acc.smtp.secure, auth });
}

// ---------- conexiones IMAP reutilizadas (una por cuenta) ----------
// Abrir una conexión nueva en cada acción (conectar, cifrar, autenticar, abrir carpeta, cerrar) cuesta ~12 viajes de ida
// y vuelta al servidor: con 100 ms de latencia son más de un segundo POR CLIC. Se mantiene abierta una conexión por cuenta;
// se cierra tras unos minutos sin uso, y si el servidor la cerró por inactividad se reconecta sola.
const IDLE_MS = Number(process.env.CASAMAIL_IMAP_IDLE_MS ?? 4 * 60_000);
interface Pooled { client: ImapFlow; key: string; timer?: NodeJS.Timeout }
const pool = new Map<string, Pooled>(), connecting = new Map<string, Promise<Pooled>>();
export const fingerprint = (a: Account) => [a.imap.host, a.imap.port, a.imap.secure, a.user, a.pass, a.oauth?.refreshToken ?? ""].join("|"); // si cambian las credenciales, se reconecta

export async function openImap(acc: Account): Promise<ImapFlow> {
  const c = new ImapFlow({ host: acc.imap.host, port: acc.imap.port, secure: acc.imap.secure, auth: await imapAuth(acc), logger: false });
  c.on("error", () => {});
  try { await c.connect(); }
  catch (e) { try { c.close(); } catch { /* ya cerrada */ } throw e; } // si falla la autenticación la librería deja el socket abierto: se cierra para no acumular conexiones
  return c;
}
function touch(id: string, e: Pooled) { clearTimeout(e.timer); e.timer = setTimeout(() => dropConnection(id), IDLE_MS); e.timer.unref?.(); }
/** Cierra la conexión reutilizada de una cuenta (p. ej. al quitarla). */
export function dropConnection(id: string) {
  const e = pool.get(id); if (!e) return;
  pool.delete(id); clearTimeout(e.timer); e.client.logout().catch(() => e.client.close());
}
export function closeConnections() { for (const id of [...pool.keys()]) dropConnection(id); }
async function pooled(acc: Account): Promise<Pooled> {
  const key = fingerprint(acc), cur = pool.get(acc.id);
  if (cur && cur.key === key && cur.client.usable) { touch(acc.id, cur); return cur; }
  if (cur) dropConnection(acc.id);
  let p = connecting.get(acc.id);
  if (!p) {
    p = (async () => {
      const e: Pooled = { client: await openImap(acc), key };
      e.client.on("close", () => { if (pool.get(acc.id) === e) pool.delete(acc.id); });
      pool.set(acc.id, e); return e;
    })().finally(() => connecting.delete(acc.id));
    connecting.set(acc.id, p);
  }
  const e = await p; touch(acc.id, e); return e;
}
const connDead = (err: unknown) => { const x = err as { code?: string; message?: string }; return ["NoConnection", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(x?.code ?? "") || /connection (not available|closed)|socket (closed|hang up)/i.test(x?.message ?? ""); };

async function withImap<T>(acc: Account, fn: (c: ImapFlow) => Promise<T>, o: { fresh?: boolean } = {}): Promise<T> {
  if (o.fresh) { const c = await openImap(acc); try { return await fn(c); } finally { await c.logout().catch(() => c.close()); } } // tareas largas y pruebas: conexión propia
  for (let attempt = 0; ; attempt++) {
    const e = await pooled(acc);
    try { const r = await fn(e.client); touch(acc.id, e); return r; }
    catch (err) {
      // la conexión estaba caída (el servidor la cerró por inactividad): se reconecta y se repite UNA vez
      if (attempt === 0 && connDead(err) && !e.client.usable) { dropConnection(acc.id); continue; }
      throw err;
    }
  }
}
const withFresh = <T>(acc: Account, fn: (c: ImapFlow) => Promise<T>) => withImap(acc, fn, { fresh: true });

// ---------- caché de carpetas (contar no leídos de TODAS las carpetas son muchas consultas) ----------
interface FolderInfo { path: string; name: string; specialUse: string | null; total: number; unread: number }
const FOLDER_TTL_MS = 15_000;
const folderCache = new Map<string, { at: number; data?: FolderInfo[]; p?: Promise<FolderInfo[]> }>();
export const invalidateFolders = (accId: string) => { folderCache.delete(accId); };
/** Como withImap, pero para acciones que cambian carpetas o contadores: invalida la caché al terminar. */
const withWrite = <T>(acc: Account, fn: (c: ImapFlow) => Promise<T>) => withImap(acc, fn).finally(() => invalidateFolders(acc.id));

const addr = (l?: { name?: string; address?: string }[]) =>
  (l ?? []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address ?? "")).join(", ");

export async function testConnection(acc: Account) {
  await withFresh(acc, async (c) => { await c.mailboxOpen("INBOX"); }); // la prueba de conexión usa una conexión nueva: debe comprobar las credenciales de verdad
  await (await smtp(acc)).verify();
}

export async function listFolders(acc: Account): Promise<FolderInfo[]> {
  const hit = folderCache.get(acc.id);
  if (hit?.data && Date.now() - hit.at < FOLDER_TTL_MS) return hit.data;
  if (hit?.p) return hit.p; // ya hay una consulta en curso: se comparte
  const p = withImap(acc, async (c) => {
    const boxes = await c.list({ statusQuery: { messages: true, unseen: true } });
    return boxes.map((b) => ({ path: b.path, name: b.name, specialUse: b.specialUse ?? null, total: b.status?.messages ?? 0, unread: b.status?.unseen ?? 0 }));
  }).then((data) => { folderCache.set(acc.id, { at: Date.now(), data }); return data; }, (e) => { folderCache.delete(acc.id); throw e; });
  folderCache.set(acc.id, { at: 0, p });
  return p;
}

/** `range`: lista de UIDs, o un rango de números de secuencia ("120:160") para traer solo la página que se ve. */
async function fetchSummaries(c: ImapFlow, range: number[] | string): Promise<Summary[]> {
  if (Array.isArray(range) && !range.length) return [];
  const out: Summary[] = [];
  for await (const m of c.fetch(range, { uid: true, envelope: true, flags: true, bodyStructure: true }, Array.isArray(range) ? { uid: true } : undefined)) {
    const flags = m.flags ?? new Set<string>();
    out.push({
      uid: m.uid, subject: m.envelope?.subject ?? "(sin asunto)",
      from: addr(m.envelope?.from), to: addr(m.envelope?.to),
      date: m.envelope?.date ? new Date(m.envelope.date).toISOString() : null,
      unread: !flags.has("\\Seen"), starred: flags.has("\\Flagged"),
      hasAttachments: JSON.stringify(m.bodyStructure ?? {}).includes('"disposition":"attachment"'),
    });
  }
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** `fresh`: usa una conexión propia y nueva (así ve SIEMPRE el estado real del buzón, aunque el servidor no avise de correo nuevo a las sesiones abiertas). La usan los avisos. */
export async function listMessages(acc: Account, folder = "INBOX", opts: { limit?: number; offset?: number; unread?: boolean; fresh?: boolean } = {}) {
  const limit = Math.min(opts.limit ?? 25, 100), offset = opts.offset ?? 0;
  return (opts.fresh ? withFresh : withImap)(acc, async (c) => {
    const reused = !!c.mailbox && c.mailbox.path === folder; // carpeta ya abierta en esta conexión: su recuento puede estar desfasado
    const lock = await c.getMailboxLock(folder);
    try {
      if (reused) await c.noop(); // el servidor avisa del correo nuevo o borrado desde otros dispositivos (1 viaje, mucho más barato que releer todo)
      if (opts.unread) {
        const sorted = ((await c.search({ seen: false }, { uid: true })) || []).sort((a, b) => b - a);
        return { total: sorted.length, messages: await fetchSummaries(c, sorted.slice(offset, offset + limit)) };
      }
      // sin filtro: se piden solo los mensajes de esta página por número de secuencia (un único comando, sin listar todo el buzón)
      const total = (c.mailbox && c.mailbox.exists) || 0, hi = total - offset;
      if (hi < 1) return { total, messages: [] };
      return { total, messages: await fetchSummaries(c, `${Math.max(1, hi - limit + 1)}:${hi}`) };
    } finally { lock.release(); }
  });
}

export async function searchMessages(acc: Account, q: SearchQuery, folder = "INBOX", limit = 25) {
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const query: Record<string, unknown> = {};
      if (q.text) query.body = q.text;
      if (q.from) query.from = q.from;
      if (q.to) query.to = q.to;
      if (q.subject) query.subject = q.subject;
      if (q.since) query.since = new Date(q.since);
      if (q.before) query.before = new Date(q.before);
      if (q.unread) query.seen = false;
      if (q.starred) query.flagged = true;
      if (!Object.keys(query).length) query.all = true;
      const found = ((await c.search(query, { uid: true })) || []).sort((a, b) => b - a);
      return { total: found.length, messages: await fetchSummaries(c, found.slice(0, Math.min(limit, 100))) };
    } finally { lock.release(); }
  });
}

export interface FullMessage extends Summary {
  cc: string; messageId: string | null; references: string[]; text: string; html: string | null;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
}

async function fetchParsed(c: ImapFlow, uid: number): Promise<ParsedMail> {
  const dl = await c.download(String(uid), undefined, { uid: true });
  if (!dl?.content) throw new Error(`Mensaje ${uid} no encontrado`);
  return simpleParser(dl.content);
}

export async function getMessage(acc: Account, folder: string, uid: number, markRead = true): Promise<FullMessage> {
  return (markRead ? withWrite : withImap)(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const p = await fetchParsed(c, uid);
      if (markRead) await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
      return {
        uid, subject: p.subject ?? "(sin asunto)", from: p.from?.text ?? "", to: p.to ? (Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : p.to.text) : "",
        cc: p.cc ? (Array.isArray(p.cc) ? p.cc.map((t) => t.text).join(", ") : p.cc.text) : "",
        date: p.date?.toISOString() ?? null, unread: false, starred: false,
        hasAttachments: p.attachments.length > 0, messageId: p.messageId ?? null, references: refs,
        text: p.text ?? "", html: p.html || null,
        attachments: p.attachments.map((a, i) => ({ index: i, filename: a.filename ?? `adjunto-${i}`, contentType: a.contentType, size: a.size })),
      };
    } finally { lock.release(); }
  });
}

export async function getAttachment(acc: Account, folder: string, uid: number, index: number) {
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const p = await fetchParsed(c, uid);
      const a = p.attachments[index];
      if (!a) throw new Error("Adjunto no encontrado");
      return { filename: a.filename ?? `adjunto-${index}`, contentType: a.contentType, content: a.content };
    } finally { lock.release(); }
  });
}

export async function setFlags(acc: Account, folder: string, uid: number, o: { read?: boolean; starred?: boolean }) {
  return withWrite(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const f = { uid: true };
      if (o.read === true) await c.messageFlagsAdd(String(uid), ["\\Seen"], f);
      if (o.read === false) await c.messageFlagsRemove(String(uid), ["\\Seen"], f);
      if (o.starred === true) await c.messageFlagsAdd(String(uid), ["\\Flagged"], f);
      if (o.starred === false) await c.messageFlagsRemove(String(uid), ["\\Flagged"], f);
    } finally { lock.release(); }
  });
}

export async function moveMessage(acc: Account, folder: string, uid: number, dest: string) {
  return withWrite(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest, { uid: true }); } finally { lock.release(); }
  });
}

/** Mueve a la papelera (carpeta con specialUse \Trash); no borra definitivamente. */
export async function trashMessage(acc: Account, folder: string, uid: number) {
  return withWrite(acc, async (c) => {
    const trash = (await c.list()).find((b) => b.specialUse === "\\Trash");
    if (!trash) throw new Error("No se encontró carpeta de papelera");
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), trash.path, { uid: true }); } finally { lock.release(); }
  });
}

export interface Outgoing {
  to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string;
  inReplyTo?: string; references?: string[];
  attachments?: { filename: string; content: string; encoding?: "base64"; cid?: string; contentType?: string; contentDisposition?: "inline" | "attachment" }[];
}

async function findFolder(c: ImapFlow, use: string, names: RegExp): Promise<string | null> {
  const all = await c.list();
  return (all.find((b) => b.specialUse === use) ?? all.find((b) => names.test(b.path)))?.path ?? null;
}

function toRaw(from: string, m: Outgoing & { messageId?: string }): Promise<Buffer> {
  return new MailComposer({ from, ...m }).compile().build();
}

/** Guarda un mensaje como borrador en la carpeta Drafts del servidor. */
export async function saveDraft(acc: Account, m: Partial<Outgoing>) {
  const raw = await toRaw(acc.email, { to: m.to ?? "", subject: m.subject ?? "", text: m.text ?? "", cc: m.cc, attachments: m.attachments, inReplyTo: m.inReplyTo });
  return withWrite(acc, async (c) => {
    const f = await findFolder(c, "\\Drafts", /draft|borrador/i);
    if (!f) throw new Error("No se encontró carpeta de borradores");
    await c.append(f, raw, ["\\Draft", "\\Seen"]);
    return { folder: f };
  });
}

export async function sendMessage(acc: Account, m: Outgoing) {
  const domain = acc.email.split("@")[1] ?? "localhost";
  const full = { ...m, messageId: `<${crypto.randomUUID()}@${domain}>` };
  const t = await smtp(acc);
  const info = await t.sendMail({ from: acc.email, ...full });
  learnContacts([m.to, m.cc ?? ""].filter(Boolean));
  // Gmail guarda solo la copia en Enviados; en el resto la añadimos nosotros (best-effort).
  let sentCopy = false;
  if (!/gmail|googlemail/i.test(acc.smtp.host)) {
    try {
      const raw = await toRaw(acc.email, full);
      await withWrite(acc, async (c) => { const f = await findFolder(c, "\\Sent", /sent|enviado/i); if (f) { await c.append(f, raw, ["\\Seen"]); sentCopy = true; } });
    } catch { /* no bloquea el envío */ }
  }
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, sentCopy };
}

export async function archiveMessage(acc: Account, folder: string, uid: number) {
  return withWrite(acc, async (c) => {
    const dest = await findFolder(c, "\\Archive", /^archive$|archivo/i) ?? await findFolder(c, "\\All", /all mail|todos/i);
    if (!dest) { await c.mailboxCreate("Archive"); }
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest ?? "Archive", { uid: true }); } finally { lock.release(); }
  });
}

export async function spamMessage(acc: Account, folder: string, uid: number) {
  return withWrite(acc, async (c) => {
    const dest = await findFolder(c, "\\Junk", /junk|spam|no deseado/i);
    if (!dest) throw new Error("No se encontró carpeta de spam");
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest, { uid: true }); } finally { lock.release(); }
  });
}

export async function createFolder(acc: Account, name: string) {
  return withWrite(acc, async (c) => { await c.mailboxCreate(name); return { path: name }; });
}

/** Construye la respuesta (cita + cabeceras de hilo) sin enviarla. */
/** `signature`: firma a usar (null = ninguna). Va ENTRE la respuesta y el mensaje citado, como en Outlook. */
export async function buildReply(acc: Account, folder: string, uid: number, body: { text: string; replyAll?: boolean }, signature: Signature | null = null): Promise<Outgoing> {
  const orig = await getMessage(acc, folder, uid, false);
  const subject = /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
  const quoted = orig.text.split("\n").map((l) => `> ${l}`).join("\n"), head = `El ${orig.date ?? ""}, ${orig.from} escribió:`;
  const quote = { text: `${head}\n${quoted}`, html: `<div>${escapeHtml(head)}</div><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${orig.html ? sanitizeHtml(orig.html, { images: false }) : escapeHtml(orig.text).split("\n").join("<br>")}</blockquote>` };
  const base: Outgoing = {
    to: orig.from, cc: body.replyAll ? orig.cc || undefined : undefined, subject, text: body.text,
    inReplyTo: orig.messageId ?? undefined,
    references: [...orig.references, ...(orig.messageId ? [orig.messageId] : [])],
  };
  return withSignature(base, signature, quote);
}

export async function replyTo(acc: Account, folder: string, uid: number, body: { text: string; replyAll?: boolean }, signature: Signature | null = null) {
  return sendMessage(acc, await buildReply(acc, folder, uid, body, signature));
}

/** Últimos correos enviados con HTML (imágenes "cid:" ya convertidas): de aquí se importa la firma que el usuario ya usa. */
export async function sentSamples(acc: Account, limit = 12): Promise<{ subject: string; date: string | null; html: string }[]> {
  return withImap(acc, async (c) => {
    const f = await findFolder(c, "\\Sent", /sent|enviad/i); if (!f) return [];
    const lock = await c.getMailboxLock(f);
    try {
      const total = (c.mailbox && c.mailbox.exists) || 0; if (!total) return [];
      const uids: number[] = []; for await (const m of c.fetch(`${Math.max(1, total - limit + 1)}:${total}`, { uid: true })) uids.push(m.uid);
      const out: { subject: string; date: string | null; html: string }[] = [];
      for (const uid of uids.reverse()) {
        const p = await fetchParsed(c, uid); if (!p.html) continue;
        let html = p.html; const imgs = new Map<string, string>();
        for (const a of p.attachments) if (a.cid && /^image\/(png|jpe?g|gif|webp)$/i.test(a.contentType) && a.size <= 450_000) imgs.set(a.cid.replace(/[<>]/g, ""), `data:${a.contentType.toLowerCase().replace("image/jpg", "image/jpeg")};base64,${a.content.toString("base64")}`);
        html = html.replace(/src=(["'])cid:([^"']+)\1/gi, (m, q: string, cid: string) => (imgs.has(cid) ? `src=${q}${imgs.get(cid)}${q}` : m));
        out.push({ subject: p.subject ?? "", date: p.date?.toISOString() ?? null, html });
      }
      return out;
    } finally { lock.release(); }
  });
}

export interface SourceItem { uid: number; source: Buffer; read: boolean; starred: boolean; date: Date | null }

/**
 * Recorre una carpeta del servidor en lotes, del más antiguo al más nuevo. `fn` recibe cada lote y puede devolver
 * los UIDs que deben borrarse del servidor (solo se borran DESPUÉS de que `fn` terminó bien con ellos).
 */
export async function eachSource(
  acc: Account, folder: string,
  o: { before?: Date; batch?: number; onTotal?: (n: number) => void; onDeleted?: (n: number) => void; cancelled?: () => boolean },
  fn: (items: SourceItem[]) => Promise<number[] | void>,
) {
  return withFresh(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const uids = ((await c.search(o.before ? { before: o.before } : { all: true }, { uid: true })) || []).sort((a, b) => a - b);
      o.onTotal?.(uids.length);
      const batch = o.batch ?? 10;
      for (let i = 0; i < uids.length; i += batch) {
        if (o.cancelled?.()) break;
        const items: SourceItem[] = [];
        for await (const m of c.fetch(uids.slice(i, i + batch), { uid: true, source: true, flags: true, internalDate: true }, { uid: true })) {
          if (!m.source) continue;
          items.push({ uid: m.uid, source: m.source, read: m.flags?.has("\\Seen") ?? false, starred: m.flags?.has("\\Flagged") ?? false, date: m.internalDate ? new Date(m.internalDate) : null });
        }
        const del = await fn(items);
        if (del?.length) { await c.messageDelete(del, { uid: true }); o.onDeleted?.(del.length); }
      }
    } finally { lock.release(); }
  });
}

/** Descarga una carpeta del servidor como MBOX (streaming: no se carga en memoria). */
export async function exportFolderMbox(acc: Account, folder: string, out: Writable, onProgress?: (done: number, total: number) => void) {
  let total = 0, done = 0;
  await eachSource(acc, folder, { batch: 10, onTotal: (n) => { total = n; } }, async (items) => {
    for (const it of items) { if (!out.write(mboxEntry(it.source, it.date))) await once(out, "drain"); done++; }
    onProgress?.(done, total);
  });
  return done;
}

/** El mensaje completo tal como está en el servidor (RFC 822, para descargarlo como .eml). */
export async function getSource(acc: Account, folder: string, uid: number): Promise<Buffer> {
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const dl = await c.download(String(uid), undefined, { uid: true });
      if (!dl?.content) throw new Error(`Mensaje ${uid} no encontrado`);
      const chunks: Buffer[] = []; for await (const ch of dl.content) chunks.push(ch as Buffer);
      return Buffer.concat(chunks);
    } finally { lock.release(); }
  });
}
