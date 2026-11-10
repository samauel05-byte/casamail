import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { once } from "node:events";
import type { Writable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { simpleParser } from "mailparser";
import { dataDir, getSettings, saveSettings } from "./store.js";
import { mboxEntry, readMbox } from "./mbox.js";
import type { Summary, SearchQuery, FullMessage } from "./mail.js";

/**
 * Archivo local de CasaMail: correo guardado en TU disco, sin cuota de ningún proveedor.
 * Lo único que lo limita es el espacio libre del disco (o de la unidad que elijas).
 *  - Cada mensaje se guarda una sola vez (deduplicado por contenido) y comprimido (gzip).
 *  - Un índice SQLite con búsqueda de texto completo (acentos ignorados) permite encontrar cosas al instante.
 */
export const LOCAL_ID = "__local__";
export const FLAG_READ = 1, FLAG_STAR = 2;

export const archiveDir = () => process.env.CASAMAIL_ARCHIVE || getSettings().archiveDir || path.join(dataDir, "archive");

let db: DatabaseSync | null = null, dbDir = "";
function open(): DatabaseSync {
  const dir = archiveDir();
  if (db && dbDir === dir) return db;
  db?.close();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(path.join(dir, "index.sqlite")); dbDir = dir;
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS msgs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, folder TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT '', from_addr TEXT NOT NULL DEFAULT '',
      to_text TEXT NOT NULL DEFAULT '', cc_text TEXT NOT NULL DEFAULT '', date INTEGER, size INTEGER NOT NULL DEFAULT 0,
      stored INTEGER NOT NULL DEFAULT 0, has_att INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0,
      message_id TEXT, source TEXT, message_key TEXT, UNIQUE(hash, folder));
    CREATE INDEX IF NOT EXISTS msgs_folder_date ON msgs(folder, date DESC);
    CREATE INDEX IF NOT EXISTS msgs_hash ON msgs(hash);
    CREATE INDEX IF NOT EXISTS msgs_folder_flags ON msgs(folder, flags);
    CREATE INDEX IF NOT EXISTS msgs_key ON msgs(folder, message_key);
    CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(subject, people, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2');
  `);
  return db;
}
export function close() { try { endBatch(); } catch { /* ya cerrada */ } db?.close(); db = null; dbDir = ""; }

// Escritura por lotes: una importación de millones de mensajes sería lentísima con un commit por mensaje.
// Se confirma cada 500 escrituras y al terminar; si el proceso muere, solo se pierde el lote en curso (y se retoma sin duplicar).
let inBatch = false, pending = 0;
export function beginBatch() { const d = open(); if (!inBatch) { d.exec("BEGIN"); inBatch = true; pending = 0; } }
export function endBatch() { if (inBatch && db) { db.exec("COMMIT"); } inBatch = false; pending = 0; }
const tickBatch = () => { if (inBatch && ++pending >= 500 && db) { db.exec("COMMIT"); db.exec("BEGIN"); pending = 0; } };

/** ¿Ya existe en esa carpeta un mensaje con esta clave de origen? (permite retomar una importación sin repetir trabajo) */
export function hasKey(folder: string, key: string): boolean { return !!open().prepare("SELECT 1 FROM msgs WHERE folder=? AND message_key=? LIMIT 1").get(cleanFolder(folder), key); }

const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const msgFile = (hash: string) => path.join(archiveDir(), "msgs", hash.slice(0, 2), hash.slice(2, 4), `${hash}.eml.gz`);
const readEml = (hash: string) => zlib.gunzipSync(fs.readFileSync(msgFile(hash)));
export const cleanFolder = (f: string) => f.replace(/[\u0000-\u001f]/g, "").split("/").map((s) => s.trim()).filter(Boolean).join("/").slice(0, 400) || "Importado";
const likeEsc = (s: string) => `%${s.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

export interface Meta { subject: string; fromName: string; fromAddr: string; to: string; cc: string; date: number | null; hasAtt: boolean; body: string; messageId?: string }

async function parseMeta(eml: Buffer): Promise<Meta> {
  const p = await simpleParser(eml);
  const list = (a: typeof p.to) => (a ? (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a.text) : "");
  const f = p.from?.value?.[0];
  return { subject: p.subject ?? "", fromName: f?.name ?? "", fromAddr: f?.address ?? "", to: list(p.to), cc: list(p.cc), date: p.date ? p.date.getTime() : null, hasAtt: p.attachments.some((a) => a.contentDisposition === "attachment" || !a.related), body: (p.text ?? "").slice(0, 200_000), messageId: p.messageId };
}

export interface AddOpts { meta?: Partial<Meta>; flags?: number; source?: string; key?: string }
/** Guarda un mensaje (RFC 822). Si ya existe idéntico en esa carpeta no se duplica. */
export async function addMessage(folder: string, eml: Buffer, o: AddOpts = {}): Promise<{ id: number; added: boolean }> {
  const d = open(), hash = sha256(eml), fol = cleanFolder(folder);
  const dup = (o.key ? d.prepare("SELECT id FROM msgs WHERE folder=? AND message_key=?").get(fol, o.key) : undefined) as { id: number } | undefined
    ?? d.prepare("SELECT id FROM msgs WHERE hash=? AND folder=?").get(hash, fol) as { id: number } | undefined;
  if (dup) return { id: dup.id, added: false };
  const file = msgFile(hash); let stored = 0;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const gz = zlib.gzipSync(eml, { level: 4 }), tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, gz); fs.renameSync(tmp, file); stored = gz.length;
  } else stored = fs.statSync(file).size;
  const m: Meta = { ...(await parseMeta(eml).catch(() => ({ subject: "", fromName: "", fromAddr: "", to: "", cc: "", date: null, hasAtt: false, body: "" }) as Meta)), ...(o.meta ?? {}) } as Meta;
  const r = d.prepare("INSERT INTO msgs(hash,folder,subject,from_name,from_addr,to_text,cc_text,date,size,stored,has_att,flags,message_id,source,message_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(hash, fol, m.subject, m.fromName, m.fromAddr, m.to, m.cc, m.date, eml.length, stored, m.hasAtt ? 1 : 0, o.flags ?? 0, m.messageId ?? null, o.source ?? null, o.key ?? null);
  const id = Number(r.lastInsertRowid);
  d.prepare("INSERT INTO fts(rowid,subject,people,body) VALUES(?,?,?,?)").run(id, m.subject, `${m.fromName} ${m.fromAddr} ${m.to} ${m.cc}`, m.body);
  tickBatch();
  return { id, added: true };
}

interface Row { id: number; hash: string; folder: string; subject: string; from_name: string; from_addr: string; to_text: string; date: number | null; flags: number; has_att: number }
const toSummary = (r: Row): Summary => ({
  uid: r.id, subject: r.subject || "(sin asunto)", from: r.from_name ? `${r.from_name} <${r.from_addr}>` : r.from_addr, to: r.to_text,
  date: r.date ? new Date(r.date).toISOString() : null, unread: !(r.flags & FLAG_READ), starred: !!(r.flags & FLAG_STAR), hasAttachments: !!r.has_att,
});
const COLS = "id,hash,folder,subject,from_name,from_addr,to_text,date,flags,has_att";

export function listFolders() {
  const rows = open().prepare("SELECT folder, COUNT(*) total, SUM(CASE WHEN flags&1=0 THEN 1 ELSE 0 END) unread FROM msgs GROUP BY folder ORDER BY folder").all() as { folder: string; total: number; unread: number }[];
  return rows.map((r) => ({ path: r.folder, name: r.folder.split("/").pop() ?? r.folder, specialUse: null, total: r.total, unread: r.unread }));
}

export function listMessages(folder: string, o: { limit?: number; offset?: number; unread?: boolean } = {}) {
  const d = open(), limit = Math.min(o.limit ?? 40, 200), offset = o.offset ?? 0;
  const where = `folder = ?${o.unread ? " AND flags&1=0" : ""}`;
  const total = (d.prepare(`SELECT COUNT(*) n FROM msgs WHERE ${where}`).get(folder) as { n: number }).n;
  const rows = d.prepare(`SELECT ${COLS} FROM msgs WHERE ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(folder, limit, offset) as unknown as Row[];
  return { total, messages: rows.map(toSummary) };
}

/** Búsqueda en TODO el archivo (o en una carpeta si se indica). El texto usa el índice de texto completo. */
export function searchMessages(q: SearchQuery, folder: string | null = null, limit = 50) {
  const d = open(), w: string[] = [], a: (string | number)[] = [];
  if (folder && folder !== "*") { w.push("folder = ?"); a.push(folder); }
  const toks = (q.text ?? "").match(/[\p{L}\p{N}]+/gu);
  if (toks?.length) { w.push("id IN (SELECT rowid FROM fts WHERE fts MATCH ?)"); a.push(toks.map((t) => `"${t}"*`).join(" ")); }
  if (q.from) { w.push("(from_name LIKE ? ESCAPE '\\' OR from_addr LIKE ? ESCAPE '\\')"); a.push(likeEsc(q.from), likeEsc(q.from)); }
  if (q.to) { w.push("to_text LIKE ? ESCAPE '\\'"); a.push(likeEsc(q.to)); }
  if (q.subject) { w.push("subject LIKE ? ESCAPE '\\'"); a.push(likeEsc(q.subject)); }
  if (q.since) { w.push("date >= ?"); a.push(new Date(q.since).getTime()); }
  if (q.before) { w.push("date < ?"); a.push(new Date(q.before).getTime()); }
  if (q.unread) w.push("flags&1=0");
  if (q.starred) w.push("flags&2=2");
  const cond = w.length ? `WHERE ${w.join(" AND ")}` : "";
  const total = (d.prepare(`SELECT COUNT(*) n FROM msgs ${cond}`).get(...a) as { n: number }).n;
  const rows = d.prepare(`SELECT ${COLS} FROM msgs ${cond} ORDER BY date DESC, id DESC LIMIT ?`).all(...a, Math.min(limit, 200)) as unknown as Row[];
  return { total, messages: rows.map(toSummary) };
}

const rowOf = (id: number) => { const r = open().prepare(`SELECT ${COLS} FROM msgs WHERE id=?`).get(id) as Row | undefined; if (!r) throw new Error("Mensaje no encontrado en el archivo"); return r; };

export async function getMessage(id: number, markRead = true): Promise<FullMessage> {
  const r = rowOf(id), p = await simpleParser(readEml(r.hash));
  if (markRead && !(r.flags & FLAG_READ)) setFlags(id, { read: true });
  const addrs = (a: typeof p.to) => (a ? (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a.text) : "");
  const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
  return {
    uid: id, subject: p.subject ?? "(sin asunto)", from: p.from?.text ?? "", to: addrs(p.to), cc: addrs(p.cc), date: p.date?.toISOString() ?? null,
    unread: false, starred: !!(r.flags & FLAG_STAR), hasAttachments: p.attachments.length > 0, messageId: p.messageId ?? null, references: refs,
    text: p.text ?? "", html: p.html || null,
    attachments: p.attachments.map((x, i) => ({ index: i, filename: x.filename ?? `adjunto-${i}`, contentType: x.contentType, size: x.size })),
  };
}
export async function getAttachment(id: number, index: number) {
  const p = await simpleParser(readEml(rowOf(id).hash)), a = p.attachments[index];
  if (!a) throw new Error("Adjunto no encontrado");
  return { filename: a.filename ?? `adjunto-${index}`, contentType: a.contentType, content: a.content };
}
/** ¿El mensaje guardado se puede releer y es idéntico al original? (se exige antes de borrar nada del servidor) */
export function verify(id: number, original: Buffer): boolean { try { return readEml(rowOf(id).hash).equals(original); } catch { return false; } }
export const getRaw = (id: number) => ({ eml: readEml(rowOf(id).hash), subject: rowOf(id).subject });

export function setFlags(id: number, o: { read?: boolean; starred?: boolean }) {
  const r = rowOf(id); let f = r.flags;
  if (o.read !== undefined) f = o.read ? f | FLAG_READ : f & ~FLAG_READ;
  if (o.starred !== undefined) f = o.starred ? f | FLAG_STAR : f & ~FLAG_STAR;
  open().prepare("UPDATE msgs SET flags=? WHERE id=?").run(f, id);
}

export function deleteMessage(id: number) {
  const d = open(), r = d.prepare("SELECT hash FROM msgs WHERE id=?").get(id) as { hash: string } | undefined;
  if (!r) return;
  d.prepare("DELETE FROM msgs WHERE id=?").run(id); d.prepare("DELETE FROM fts WHERE rowid=?").run(id);
  const left = (d.prepare("SELECT COUNT(*) n FROM msgs WHERE hash=?").get(r.hash) as { n: number }).n;
  if (!left) { try { fs.unlinkSync(msgFile(r.hash)); } catch { /* ya no está */ } }
}
export function moveMessage(id: number, dest: string) {
  const d = open(), r = rowOf(id), to = cleanFolder(dest);
  if (d.prepare("SELECT 1 FROM msgs WHERE hash=? AND folder=?").get(r.hash, to)) { deleteMessage(id); return; }
  d.prepare("UPDATE msgs SET folder=? WHERE id=?").run(to, id);
}
/** Borra una carpeta del archivo (y sus subcarpetas). Devuelve cuántos mensajes se eliminaron. */
export function deleteFolder(folder: string): number {
  const d = open(), f = cleanFolder(folder);
  const ids = d.prepare("SELECT id FROM msgs WHERE folder=? OR folder LIKE ? ESCAPE '\\'").all(f, `${f.replace(/[\\%_]/g, (c) => "\\" + c)}/%`) as { id: number }[];
  for (const { id } of ids) deleteMessage(id);
  return ids.length;
}

export function stats() {
  const d = open(), dir = archiveDir();
  const s = d.prepare("SELECT COUNT(*) n, COALESCE(SUM(size),0) original, COALESCE(SUM(stored),0) stored FROM msgs").get() as { n: number; original: number; stored: number };
  const folders = (d.prepare("SELECT COUNT(DISTINCT folder) n FROM msgs").get() as { n: number }).n;
  let free: number | null = null;
  try { const st = fs.statfsSync(dir); free = Number(st.bavail) * Number(st.bsize); } catch { /* sin dato */ }
  return { dir, messages: s.n, folders, originalBytes: s.original, storedBytes: s.stored, freeBytes: free };
}

/** Exporta una carpeta (con subcarpetas) o todo el archivo a un MBOX en streaming. */
export async function exportMbox(folder: string | null, out: Writable, onProgress?: (done: number, total: number) => void) {
  const d = open(), f = folder ? cleanFolder(folder) : null;
  const ids = (f ? d.prepare("SELECT id,hash,date,from_addr FROM msgs WHERE folder=? OR folder LIKE ? ESCAPE '\\' ORDER BY date, id").all(f, `${f.replace(/[\\%_]/g, (c) => "\\" + c)}/%`)
    : d.prepare("SELECT id,hash,date,from_addr FROM msgs ORDER BY date, id").all()) as { id: number; hash: string; date: number | null; from_addr: string }[];
  let n = 0;
  for (const r of ids) {
    let eml: Buffer; try { eml = readEml(r.hash); } catch { continue; }
    if (!out.write(mboxEntry(eml, r.date ? new Date(r.date) : null, r.from_addr || "MAILER-DAEMON"))) await once(out, "drain");
    n++; onProgress?.(n, ids.length);
  }
  return n;
}

export interface ImportProgress { processed: number; added: number; skipped: number; failed: number; bytesRead?: number }
/** Importa un archivo MBOX (cualquier tamaño: se lee por streaming). */
export async function importMbox(file: string, folder: string, onProgress?: (p: ImportProgress) => void, cancelled: () => boolean = () => false) {
  const p: ImportProgress = { processed: 0, added: 0, skipped: 0, failed: 0, bytesRead: 0 };
  beginBatch();
  try {
    for await (const eml of readMbox(file, (n) => { p.bytesRead! += n; })) {
      if (cancelled()) break;
      try { const r = await addMessage(folder, eml, { source: "mbox" }); r.added ? p.added++ : p.skipped++; } catch { p.failed++; }
      p.processed++; if (p.processed % 25 === 0) onProgress?.(p);
    }
  } finally { endBatch(); }
  onProgress?.(p); return p;
}
export async function importEml(file: string, folder: string) {
  const r = await addMessage(folder, fs.readFileSync(file), { source: "eml" });
  return { processed: 1, added: r.added ? 1 : 0, skipped: r.added ? 0 : 1, failed: 0 } as ImportProgress;
}

/** Cambia la carpeta donde vive el archivo (p. ej. un disco externo). Solo se permite con el archivo vacío. */
export function setLocation(dir: string) {
  const target = path.resolve(dir.trim());
  if (!path.isAbsolute(dir.trim())) throw new Error("Indica una ruta completa, p. ej. D:\\CasaMail o /mnt/disco/casamail");
  if (open().prepare("SELECT 1 FROM msgs LIMIT 1").get()) throw new Error("El archivo ya tiene mensajes. Elige la ubicación ANTES de importar (o vacíalo primero).");
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const probe = path.join(target, `.escritura-${process.pid}`);
  try { fs.writeFileSync(probe, "ok"); fs.unlinkSync(probe); } catch { throw new Error("No se puede escribir en esa carpeta."); }
  const s = getSettings(); saveSettings({ ...s, archiveDir: target });
  close();
  return stats();
}
