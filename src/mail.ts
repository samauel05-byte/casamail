import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import crypto from "node:crypto";
import { learnContacts } from "./store.js";
import { getAccessToken } from "./oauth.js";
import type { Account } from "./store.js";

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

async function withImap<T>(acc: Account, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: acc.imap.host, port: acc.imap.port, secure: acc.imap.secure,
    auth: await imapAuth(acc), logger: false,
  });
  client.on("error", () => {});
  await client.connect();
  try { return await fn(client); } finally { await client.logout().catch(() => {}); }
}

const addr = (l?: { name?: string; address?: string }[]) =>
  (l ?? []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address ?? "")).join(", ");

export async function testConnection(acc: Account) {
  await withImap(acc, async (c) => { await c.mailboxOpen("INBOX"); });
  await (await smtp(acc)).verify();
}

export async function listFolders(acc: Account) {
  return withImap(acc, async (c) => {
    const boxes = await c.list({ statusQuery: { messages: true, unseen: true } });
    return boxes.map((b) => ({ path: b.path, name: b.name, specialUse: b.specialUse ?? null, total: b.status?.messages ?? 0, unread: b.status?.unseen ?? 0 }));
  });
}

async function fetchSummaries(c: ImapFlow, uids: number[]): Promise<Summary[]> {
  if (!uids.length) return [];
  const out: Summary[] = [];
  for await (const m of c.fetch(uids, { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
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

export async function listMessages(acc: Account, folder = "INBOX", opts: { limit?: number; offset?: number; unread?: boolean } = {}) {
  const limit = Math.min(opts.limit ?? 25, 100), offset = opts.offset ?? 0;
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const found = (await c.search(opts.unread ? { seen: false } : { all: true }, { uid: true })) || [];
      const sorted = found.sort((a, b) => b - a);
      const page = sorted.slice(offset, offset + limit);
      return { total: sorted.length, messages: await fetchSummaries(c, page) };
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
  return withImap(acc, async (c) => {
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
  return withImap(acc, async (c) => {
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
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest, { uid: true }); } finally { lock.release(); }
  });
}

/** Mueve a la papelera (carpeta con specialUse \Trash); no borra definitivamente. */
export async function trashMessage(acc: Account, folder: string, uid: number) {
  return withImap(acc, async (c) => {
    const trash = (await c.list()).find((b) => b.specialUse === "\\Trash");
    if (!trash) throw new Error("No se encontró carpeta de papelera");
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), trash.path, { uid: true }); } finally { lock.release(); }
  });
}

export interface Outgoing {
  to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string;
  inReplyTo?: string; references?: string[];
  attachments?: { filename: string; content: string; encoding?: "base64" }[];
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
  return withImap(acc, async (c) => {
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
      await withImap(acc, async (c) => { const f = await findFolder(c, "\\Sent", /sent|enviado/i); if (f) { await c.append(f, raw, ["\\Seen"]); sentCopy = true; } });
    } catch { /* no bloquea el envío */ }
  }
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, sentCopy };
}

export async function archiveMessage(acc: Account, folder: string, uid: number) {
  return withImap(acc, async (c) => {
    const dest = await findFolder(c, "\\Archive", /^archive$|archivo/i) ?? await findFolder(c, "\\All", /all mail|todos/i);
    if (!dest) { await c.mailboxCreate("Archive"); }
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest ?? "Archive", { uid: true }); } finally { lock.release(); }
  });
}

export async function spamMessage(acc: Account, folder: string, uid: number) {
  return withImap(acc, async (c) => {
    const dest = await findFolder(c, "\\Junk", /junk|spam|no deseado/i);
    if (!dest) throw new Error("No se encontró carpeta de spam");
    const lock = await c.getMailboxLock(folder);
    try { await c.messageMove(String(uid), dest, { uid: true }); } finally { lock.release(); }
  });
}

export async function createFolder(acc: Account, name: string) {
  return withImap(acc, async (c) => { await c.mailboxCreate(name); return { path: name }; });
}

/** Construye la respuesta (cita + cabeceras de hilo) sin enviarla. */
export async function buildReply(acc: Account, folder: string, uid: number, body: { text: string; replyAll?: boolean }): Promise<Outgoing> {
  const orig = await getMessage(acc, folder, uid, false);
  const subject = /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
  const quoted = orig.text.split("\n").map((l) => `> ${l}`).join("\n");
  const text = `${body.text}\n\nEl ${orig.date ?? ""}, ${orig.from} escribió:\n${quoted}`;
  return {
    to: orig.from, cc: body.replyAll ? orig.cc || undefined : undefined, subject, text,
    inReplyTo: orig.messageId ?? undefined,
    references: [...orig.references, ...(orig.messageId ? [orig.messageId] : [])],
  };
}

export async function replyTo(acc: Account, folder: string, uid: number, body: { text: string; replyAll?: boolean }) {
  return sendMessage(acc, await buildReply(acc, folder, uid, body));
}
