import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { simpleParser } from "mailparser";
import type { PSTFolder, PSTMessage } from "pst-extractor";
import crypto from "node:crypto";
import { addMessage, hasKey, beginBatch, endBatch, FLAG_READ, type ImportProgress } from "./archive.js";

/**
 * Importa archivos de Outlook (.pst / .ost) al Archivo local. Se lee desde disco por bloques,
 * así que funciona con archivos de varios GB sin cargarlos en memoria.
 * Solo se importa correo (se ignoran calendario, contactos, tareas y notas).
 */
const SKIP_FOLDER = /^(Sync Issues|Conflicts|Local Failures|Server Failures|Finder|Reminders|Conversation Action Settings|Quick Step Settings|Suggested Contacts|Yammer Root|Files|RSS Feeds|Social Activity Notifications|Common Views|Views|Shortcuts|Search Root|Spooler Queue|Schedule|Deferred Action|System|Freebusy Data|ExternalContacts|PeopleConnect|Tracked Mail Processing)$/i;
const SKIP_CLASS = /^IPF\.(Appointment|Contact|Task|StickyNote|Journal|Configuration|Imap|Reminder)/i;
const WRAP = /^(\(raíz\)|root|root - mailbox|top of personal folders|top of outlook data file|top of information store|ipm_subtree)$/i;
const UNKNOWN = "desconocido@exchange.invalid"; // remitentes internos de Exchange sin dirección SMTP

const skipFolder = (f: PSTFolder) => SKIP_FOLDER.test(f.displayName ?? "") || SKIP_CLASS.test(f.containerClass ?? "");
const mapFolder = (raw: string[]) => {
  const names = raw.map((n) => (n ?? "").trim()).filter(Boolean);
  const i = names.findIndex((n) => /^ipm_subtree$/i.test(n));
  const rest = i >= 0 ? names.slice(i + 1) : [...names];
  while (rest.length && WRAP.test(rest[0])) rest.shift();
  return rest.map((s) => s.replace(/[\/\\]/g, "-").trim()).filter(Boolean);
};
const bracket = (id?: string | null) => (id ? (id.startsWith("<") ? id : `<${id}>`) : undefined);
const tick = () => new Promise<void>((r) => setImmediate(r));

function readAll(stream: { read(b: Buffer): number } | null): Buffer | null {
  if (!stream) return null;
  const chunks: Buffer[] = [], buf = Buffer.alloc(8176);
  let n: number;
  do { n = stream.read(buf); if (n > 0) chunks.push(Buffer.from(buf.subarray(0, n))); } while (n === 8176);
  return Buffer.concat(chunks);
}

async function headersOf(raw: string | null | undefined) {
  if (!raw || raw.length < 10) return null;
  try { return await simpleParser(Buffer.from(raw.replace(/\r?\n/g, "\r\n") + "\r\n\r\n")); } catch { return null; }
}

/** Convierte un mensaje de Outlook en un correo RFC 822 estándar. */
/** Contador para pruebas: cuántos mensajes se han reconstruido (los ya importados NO deben reconstruirse al retomar). */
export const counters = { built: 0 };
export async function pstToEml(m: PSTMessage, depth = 0): Promise<Buffer> {
  if (depth === 0) counters.built++;
  const hdr = await headersOf(m.transportMessageHeaders);
  const hf = hdr?.from?.value?.[0];
  let fromAddr = hf?.address || (m.senderAddrtype === "SMTP" ? m.senderEmailAddress : "") || (m.sentRepresentingEmailAddress?.includes("@") ? m.sentRepresentingEmailAddress : "");
  if (!fromAddr?.includes("@")) fromAddr = UNKNOWN;
  const from = { name: hf?.name || m.senderName || "", address: fromAddr };

  const to: { name: string; address: string }[] = [], cc: typeof to = [], bcc: typeof to = [];
  for (let i = 0; i < (m.numberOfRecipients ?? 0); i++) {
    const r = m.getRecipient(i); if (!r) continue;
    const address = r.smtpAddress || (r.emailAddress?.includes("@") ? r.emailAddress : "") || UNKNOWN;
    const item = { name: r.displayName || "", address };
    (r.recipientType === 2 ? cc : r.recipientType === 3 ? bcc : to).push(item);
  }
  const fromHdr = (a: typeof hdr extends null ? never : NonNullable<typeof hdr>["to"]) => (a ? (Array.isArray(a) ? a.flatMap((x) => x.value) : a.value).map((v) => ({ name: v.name ?? "", address: v.address ?? UNKNOWN })) : []);
  if (!to.length && hdr) to.push(...fromHdr(hdr.to));
  if (!cc.length && hdr) cc.push(...fromHdr(hdr.cc));

  const attachments: Record<string, unknown>[] = [];
  const html = m.bodyHTML || undefined;
  for (let i = 0; i < (m.numberOfAttachments ?? 0); i++) {
    try {
      const a = m.getAttachment(i);
      const name = a.longFilename || a.filename || a.displayName || `adjunto-${i + 1}`;
      if (a.attachMethod === 5 && a.embeddedPSTMessage && depth < 2) { // mensaje adjunto dentro de otro
        attachments.push({ filename: `${(a.embeddedPSTMessage.subject || name).replace(/[\/\\:*?"<>|]/g, "_")}.eml`, content: await pstToEml(a.embeddedPSTMessage, depth + 1), contentType: "message/rfc822" });
        continue;
      }
      const data = readAll(a.fileInputStream as never);
      if (!data) continue;
      const cid = a.contentId || undefined;
      const inline = !!cid && !!html && html.includes(`cid:${cid.replace(/^<|>$/g, "")}`);
      attachments.push({ filename: name, content: data, contentType: a.mimeTag || undefined, ...(inline ? { cid: cid!.replace(/^<|>$/g, ""), contentDisposition: "inline" } : {}) });
    } catch { /* un adjunto dañado no impide importar el mensaje */ }
  }

  const when = m.clientSubmitTime ?? m.messageDeliveryTime ?? hdr?.date ?? undefined;
  return new MailComposer({
    from: from.name ? from : from.address, to: to.length ? to : undefined, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined,
    subject: m.subject || "", date: when, messageId: bracket(hdr?.messageId ?? m.internetMessageId),
    inReplyTo: hdr?.inReplyTo, references: hdr?.references,
    html, text: m.body || (html ? undefined : "(sin contenido)"), attachments,
  } as never).compile().build();
}

export interface PstProgress extends ImportProgress { total: number; folder: string }

/** Clave estable de un mensaje del PST (solo campos baratos de leer): sirve para saltarse lo ya importado al retomar. */
const keyOf = (m: PSTMessage) => crypto.createHash("sha1").update([m.internetMessageId ?? "", (m.clientSubmitTime ?? m.messageDeliveryTime)?.toISOString() ?? "", m.subject ?? "", m.senderEmailAddress ?? "", m.numberOfAttachments ?? 0, m.displayTo ?? ""].join("\u0001")).digest("hex");

export async function importPst(file: string, baseFolder: string, onProgress?: (p: PstProgress) => void, cancelled: () => boolean = () => false): Promise<PstProgress> {
  const mod = await import("pst-extractor");
  const PSTFile = (mod as { PSTFile?: typeof import("pst-extractor").PSTFile }).PSTFile ?? (mod as unknown as { default: { PSTFile: typeof import("pst-extractor").PSTFile } }).default.PSTFile;
  const pst = new PSTFile(file);
  const p: PstProgress = { processed: 0, added: 0, skipped: 0, failed: 0, total: 0, folder: "" };
  try {
    const root = pst.getRootFolder();
    const count = (f: PSTFolder) => { if (skipFolder(f)) return; p.total += f.contentCount > 0 ? f.contentCount : 0; if (f.hasSubfolders) f.getSubFolders().forEach(count); };
    count(root);
    beginBatch();
    const walk = async (f: PSTFolder, names: string[]) => {
      if (skipFolder(f) || cancelled()) return;
      const here = [...names, f.displayName ?? ""];
      const target = [baseFolder, ...mapFolder(here)].filter(Boolean).join("/") || baseFolder;
      p.folder = target;
      if (f.contentCount > 0) {
        for (let m = f.getNextChild() as PSTMessage | null; m; m = f.getNextChild() as PSTMessage | null) {
          if (cancelled()) return;
          p.processed++;
          if (/^IPM\.(Note|Post|Schedule\.Meeting)/i.test(m.messageClass ?? "")) {
            try {
              const key = keyOf(m);
              if (hasKey(target, key)) p.skipped++; // ya importado: no se vuelve a construir (retomar es rápido)
              else { const r = await addMessage(target, await pstToEml(m), { flags: m.isRead ? FLAG_READ : 0, source: "pst", key }); r.added ? p.added++ : p.skipped++; }
            } catch { p.failed++; }
          } else p.skipped++;
          if (p.processed % 20 === 0) { onProgress?.(p); await tick(); }
        }
      }
      if (f.hasSubfolders) for (const c of f.getSubFolders()) await walk(c, here);
    };
    await walk(root, []);
    onProgress?.(p);
  } finally {
    endBatch(); try { (pst as unknown as { close?: () => void }).close?.(); } catch { /* ya cerrado */ } }
  return p;
}
