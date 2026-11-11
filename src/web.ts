#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import * as store from "./store.js";
import * as mail from "./mail.js";
import * as ai from "./ai.js";
import * as localLlm from "./local-llm.js";
import * as outbox from "./outbox.js";
import * as notify from "./notify.js";
import * as idle from "./idle.js";
import * as sigs from "./signature.js";
import * as updates from "./updates.js";
import * as cal from "./calendar.js";
import * as receipts from "./receipts.js";
import * as oauth from "./oauth.js";
import * as archive from "./archive.js";
import * as jobs from "./jobs.js";
import { offload } from "./offload.js";
import { importPst } from "./pst.js";
import { pipeline } from "node:stream/promises";

let PORT = Number(process.env.PORT ?? 8025); // se actualiza con el puerto real al arrancar
// Por defecto CasaMail solo es accesible desde este equipo. El MODO REMOTO (CASAMAIL_REMOTE=1) es opcional y lo usa la app Android:
// escucha en la red, solo atiende a los nombres de host de CASAMAIL_ALLOWED_HOSTS y limita los intentos con token equivocado.
const REMOTE = () => process.env.CASAMAIL_REMOTE === "1";
const HOST = REMOTE() ? (process.env.CASAMAIL_BIND || "0.0.0.0") : "127.0.0.1";
const allowedHosts = () => (process.env.CASAMAIL_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const isLocalHost = (h: string) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h);
const hostOk = (h: string) => isLocalHost(h) || (REMOTE() && allowedHosts().includes(h.replace(/:\d+$/, "").toLowerCase()));
const fails = new Map<string, { n: number; since: number }>(); // intentos fallidos por IP
const FAIL_MAX = 10, FAIL_WINDOW = 10 * 60_000;
function clientIp(req: Request): string {
  const ra = req.socket.remoteAddress ?? "?";
  const viaProxy = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ra); // túnel local (Tailscale Serve, cloudflared…): la IP real viene en la cabecera
  const fwd = viaProxy ? String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
  return fwd || ra;
}
const TOKEN: string = process.env.CASAMAIL_TOKEN ?? (() => {
  let t = store.readJson<{ t?: string }>("token.json", {}).t;
  if (!t) { t = crypto.randomBytes(24).toString("hex"); store.writeJson("token.json", { t }); }
  return t;
})();
const sameToken = (a: unknown) => typeof a === "string" && a.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(TOKEN));
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "40mb" }));

// Defensa contra DNS-rebinding y CSRF: Host válido + token en cookie.
app.use((req: Request, res: Response, next: NextFunction) => {
  const host = req.headers.host ?? "";
  if (!hostOk(host)) return res.status(403).end();
  // Retorno de OAuth: llega desde accounts.google.com / login.microsoftonline.com, así que no lleva cookie Strict.
  // Se protege con `state` aleatorio de un solo uso + PKCE, no con la cookie.
  if (req.path === "/oauth/callback") return next();
  const ip = clientIp(req), f = fails.get(ip);
  if (f && Date.now() - f.since > FAIL_WINDOW) fails.delete(ip);
  if (f && f.n >= FAIL_MAX && Date.now() - f.since <= FAIL_WINDOW) return res.status(429).send("Demasiados intentos. Espera unos minutos.");
  if (sameToken(req.query.t)) {
    fails.delete(ip);
    res.setHeader("Set-Cookie", `cm=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${isLocalHost(host) ? "" : "; Secure"}`); return res.redirect(req.path);
  }
  const cookie = /(?:^|;\s*)cm=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ""))?.[1]; // la app Android consulta los avisos sin navegador
  if (sameToken(bearer)) return next();
  if (!sameToken(cookie)) {
    if (cookie || bearer || req.query.t !== undefined) { const g = fails.get(ip) ?? { n: 0, since: Date.now() }; g.n++; fails.set(ip, g); } // solo cuentan los intentos con un token equivocado
    return res.status(401).send("Abre CasaMail con el enlace que imprime al arrancar (npm start).");
  }
  next();
});

const h = (fn: (req: Request) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req).then((d) => res.json(d), (e) => { console.warn(`[api] ${req.method} ${req.path} → ${e instanceof Error ? e.message : String(e)}`); res.status(500).json({ error: e instanceof Error ? e.message : String(e), code: e instanceof oauth.ReauthError ? "reauth" : (e as { code?: string }).code === "low_space" ? "low_space" : undefined }); });
const acc = (req: Request) => store.getAccount((req.query.account as string) || undefined);
const folder = (req: Request) => (req.query.folder as string) || "INBOX";
const uidOf = (req: Request) => Number(req.params.uid);

// ---------- cuentas y ajustes ----------
app.get("/api/accounts", h(async () => store.loadAccounts().map((a) => ({ id: a.id, email: a.email, auth: a.oauth ? "oauth" : "password", provider: a.oauth?.provider }))));
app.get("/api/presets", h(async () => Object.entries(store.PRESETS).map(([k, v]) => ({ id: k, note: v.note ?? "" }))));
app.post("/api/accounts", h(async (r) => {
  const b = r.body as { email: string; pass: string; preset?: string; imapHost?: string; imapPort?: number; smtpHost?: string; smtpPort?: number };
  if (!b.email || !b.pass) throw new Error("Email y contraseña son obligatorios");
  const manual = !b.preset || b.preset === "otro";
  const a = store.buildAccount({
    email: b.email, pass: b.pass, preset: manual ? undefined : b.preset,
    imap: manual ? { host: b.imapHost || undefined, port: b.imapPort || 993, secure: (b.imapPort || 993) === 993 } : undefined,
    smtp: manual ? { host: b.smtpHost || undefined, port: b.smtpPort || 465, secure: (b.smtpPort || 465) === 465 } : undefined,
  });
  await mail.testConnection(a); // no se guarda si no conecta
  store.addAccount(a);
  return { id: a.id };
}));
app.delete("/api/accounts/:id", h(async (r) => { store.removeAccount(r.params.id); mail.dropConnection(r.params.id); mail.invalidateFolders(r.params.id); return { ok: true }; }));
app.get("/api/settings", h(async () => store.getSettings()));
app.post("/api/settings", h(async (r) => {
  const cur = store.getSettings();
  const d = r.body.sendDelayMin;
  store.saveSettings({ ...cur, signatures: r.body.signatures ?? cur.signatures, sendDelayMin: d === undefined ? cur.sendDelayMin : Math.min(Math.max(Number(d) || 0, 0), 10) });
  return { ok: true };
}));
app.get("/api/contacts", h(async (r) => store.searchContacts(String(r.query.q ?? ""))));

// ---------- OAuth (Gmail / Outlook) ----------
const isProv = (p: unknown): p is store.OAuthProvider => p === "google" || p === "microsoft";
app.get("/api/oauth/clients", h(async () => {
  const c = store.getOAuthClients();
  return {
    google: c.google ? { clientId: c.google.clientId, hasSecret: !!c.google.clientSecret } : null,
    microsoft: c.microsoft ? { clientId: c.microsoft.clientId, tenant: c.microsoft.tenant ?? "", hasSecret: !!c.microsoft.clientSecret } : null,
    redirect: { google: oauth.redirectUriFor("google", PORT), microsoft: oauth.redirectUriFor("microsoft", PORT) },
  };
}));
app.post("/api/oauth/start", h(async (r) => {
  const { provider, clientId, clientSecret, tenant, loginHint } = r.body as { provider: string; clientId?: string; clientSecret?: string; tenant?: string; loginHint?: string };
  if (!isProv(provider)) throw new Error("Proveedor no válido");
  if (clientId) oauth.saveClient(provider, { clientId, clientSecret, tenant });
  return oauth.startAuth(provider, oauth.redirectUriFor(provider, PORT), loginHint);
}));
app.get("/api/oauth/status/:state", h(async (r) => oauth.status(r.params.state)));
const page = (ok: boolean, msg: string) => `<!doctype html><meta charset="utf-8"><title>CasaMail</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#eef3f9;color:#10203f}div{background:#fff;padding:36px 44px;border-radius:20px;box-shadow:0 10px 40px #0002;text-align:center;max-width:440px}h1{margin:.2em 0;font-size:22px}.i{font-size:46px}p{color:#4a5a78;line-height:1.5}@media(prefers-color-scheme:dark){body{background:#0b111c;color:#eaf0fb}div{background:#121a29}p{color:#a8b5cd}}</style>
<div><div class="i">${ok ? "✅" : "⚠️"}</div><h1>${ok ? "Cuenta conectada" : "No se pudo conectar"}</h1><p>${msg}</p></div>`;
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
app.get("/oauth/callback", async (req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("Referrer-Policy", "no-referrer");
  const q = req.query as Record<string, string | undefined>;
  const r = await oauth.completeAuth(String(q.state ?? ""), { code: q.code, error: q.error, error_description: q.error_description });
  res.status(r.ok ? 200 : 400).send(r.ok ? page(true, `<b>${escHtml(r.email ?? "")}</b> ya está lista en CasaMail.<br>Puedes cerrar esta pestaña.`) : page(false, escHtml(r.error ?? "Error desconocido")));
});

// ---------- correo ----------
type Snooze = { account: string; folder: string; uid: number; until: number };
const snoozeSet = (accId: string, f: string) => new Set(store.readJson<Snooze[]>("snoozed.json", []).filter((s) => s.account === accId && s.folder === f).map((s) => s.uid));
const learnFrom = (ms: mail.Summary[]) => { try { store.learnContacts(ms.map((m) => m.from)); } catch { /* ignore */ } };

// Cuenta especial "Archivo local" (__local__): mismo visor, pero el correo vive en el disco del usuario.
const isLocal = (r: Request) => r.query.account === archive.LOCAL_ID;
const notLocal = (what: string) => { throw new Error(`${what} no está disponible en el Archivo local`); };
app.get("/api/folders", h(async (r) => (isLocal(r) ? archive.listFolders() : mail.listFolders(acc(r)))));
app.get("/api/messages", h(async (r) => {
  const limit = Number(r.query.limit ?? 40), offset = Number(r.query.offset ?? 0);
  if (isLocal(r)) { const res = archive.listMessages(folder(r), { limit, offset, unread: r.query.unread === "1" }); return { ...res, next: offset + res.messages.length }; }
  const a = acc(r), f = folder(r);
  const res = await mail.listMessages(a, f, { limit, offset, unread: r.query.unread === "1" });
  const hide = snoozeSet(a.id, f); learnFrom(res.messages);
  return { total: res.total, next: offset + res.messages.length, messages: res.messages.filter((m) => !hide.has(m.uid)) };
}));
/** Bandeja unificada con páginas sin tope: de cada cuenta se toman los `offset+limit` más nuevos, se mezclan por fecha y se devuelve la página pedida. */
app.get("/api/unified", h(async (r) => {
  const limit = Math.min(Number(r.query.limit ?? 50) || 50, 3000), offset = Math.max(0, Number(r.query.offset ?? 0) || 0), need = offset + limit;
  let total = 0;
  const all = await Promise.all(store.loadAccounts().map(async (a) => {
    try {
      const hide = snoozeSet(a.id, "INBOX"), got: (mail.Summary & { account: string })[] = []; let t = 0;
      for (let o = 0; o < need; o += 200) { // de 200 en 200, hasta cubrir lo pedido
        const res = await mail.listMessages(a, "INBOX", { limit: Math.min(200, need - o), offset: o }); t = res.total;
        got.push(...res.messages.filter((m) => !hide.has(m.uid)).map((m) => ({ ...m, account: a.id }))); if (o + 200 >= res.total) break;
      }
      total += t; return got;
    } catch { return []; }
  }));
  const merged = all.flat().sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || x.account.localeCompare(y.account) || y.uid - x.uid); // desempate fijo: si no, las páginas podrían repetir o saltarse correos con la misma hora
  return { total, next: offset + limit, messages: merged.slice(offset, need) };
}));
app.get("/api/search", h(async (r) => {
  const q = { text: r.query.q as string, from: r.query.from as string | undefined, subject: r.query.subject as string | undefined, since: r.query.since as string | undefined, before: r.query.before as string | undefined, unread: r.query.unread === "1" || undefined, starred: r.query.starred === "1" || undefined };
  const limit = Math.min(Number(r.query.limit ?? 50) || 50, 200), offset = Math.max(0, Number(r.query.offset ?? 0) || 0);
  const res = isLocal(r) ? archive.searchMessages(q, null, limit, offset) : await mail.searchMessages(acc(r), q, folder(r), limit, offset);
  return { ...res, next: offset + res.messages.length };
}));
app.get("/api/message/:uid", h(async (r) => {
  if (isLocal(r)) return archive.getMessage(uidOf(r), true);
  const a = acc(r), m = await mail.getMessage(a, folder(r), uidOf(r), true);
  const mine = (m.from || "").toLowerCase().includes(a.email.toLowerCase());
  return { ...m, receipt: receipts.get(m.messageId), wantsReceipt: !!m.dispositionNotificationTo && !mine, receiptTo: m.dispositionNotificationTo || null };
}));
app.post("/api/message/:uid/receipt", h(async (r) => { const a = acc(r); const m = await mail.getMessage(a, folder(r), uidOf(r), false); return mail.sendReadReceipt(a, { from: m.from, subject: m.subject, messageId: m.messageId, dispositionNotificationTo: m.dispositionNotificationTo }); }));
app.post("/api/message/:uid/flags", h(async (r) => { if (isLocal(r)) archive.setFlags(uidOf(r), r.body); else await mail.setFlags(acc(r), folder(r), uidOf(r), r.body); return { ok: true }; }));
app.post("/api/message/:uid/trash", h(async (r) => { if (isLocal(r)) archive.deleteMessage(uidOf(r)); else await mail.trashMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/archive", h(async (r) => { if (isLocal(r)) notLocal("Archivar"); await mail.archiveMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/spam", h(async (r) => { if (isLocal(r)) notLocal("Marcar como spam"); await mail.spamMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/move", h(async (r) => { if (isLocal(r)) archive.moveMessage(uidOf(r), String(r.body.dest)); else await mail.moveMessage(acc(r), folder(r), uidOf(r), r.body.dest); return { ok: true }; }));
app.post("/api/message/:uid/snooze", h(async (r) => {
  if (isLocal(r)) notLocal("Posponer");
  const a = acc(r), list = store.readJson<Snooze[]>("snoozed.json", []);
  list.push({ account: a.id, folder: folder(r), uid: uidOf(r), until: new Date(r.body.until).getTime() });
  store.writeJson("snoozed.json", list); return { ok: true };
}));
app.post("/api/folders", h(async (r) => (isLocal(r) ? { path: archive.cleanFolder(String(r.body.name)) } : mail.createFolder(acc(r), String(r.body.name)))));
app.get("/api/message/:uid/attachment/:i", async (req, res) => {
  try {
    const a = isLocal(req) ? await archive.getAttachment(uidOf(req), Number(req.params.i)) : await mail.getAttachment(acc(req), folder(req), uidOf(req), Number(req.params.i));
    res.setHeader("Content-Type", "application/octet-stream"); // nunca se interpreta en el navegador
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(a.content);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- descargar un mensaje (.eml) ----------
app.get("/api/message/:uid/eml", async (req, res) => {
  try {
    const eml = isLocal(req) ? archive.getRaw(uidOf(req)).eml : await mail.getSource(acc(req), folder(req), uidOf(req));
    res.setHeader("Content-Type", "message/rfc822");
    res.setHeader("Content-Disposition", `attachment; filename="mensaje-${uidOf(req)}.eml"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(eml);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ---------- Archivo local: importar / exportar / mover desde el servidor ----------
const fmtBytes = (n: number) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(0) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const publicJob = (j: jobs.Job) => { const { cancel: _c, ...rest } = j; void _c; return rest; };
app.get("/api/archive/stats", h(async () => archive.stats()));
app.get("/api/archive/jobs", h(async () => jobs.listJobs().map(publicJob)));
app.get("/api/archive/jobs/:id", h(async (r) => { const j = jobs.getJob(r.params.id); if (!j) throw new Error("Tarea no encontrada"); return publicJob(j); }));
app.post("/api/archive/jobs/:id/cancel", h(async (r) => ({ ok: jobs.cancelJob(r.params.id) })));
app.delete("/api/archive/folder", h(async (r) => ({ deleted: archive.deleteFolder(String(r.query.folder ?? "")) })));

const IMPORT_EXT = [".pst", ".ost", ".mbox", ".mbx", ".eml"];
/** Importa un archivo en segundo plano. Con deleteAfter solo se borra la copia temporal que hicimos nosotros (nunca el original del usuario). */
function startImportJob(file: string, ext: string, folder: string, size: number, label: string, deleteAfter: boolean) {
  return jobs.startJob("import", label, async (j) => {
    try {
      const apply = (p: { processed: number; added: number; skipped: number; failed: number }) => { j.processed = p.processed; j.added = p.added; j.skipped = p.skipped; j.failed = p.failed; };
      if (ext === ".pst" || ext === ".ost") await importPst(file, folder, (p) => { apply(p); j.total = p.total; j.progress = p.total ? p.processed / p.total : 0; j.detail = p.folder; }, () => j.cancel);
      else if (ext === ".eml") apply(await archive.importEml(file, folder));
      else await archive.importMbox(file, folder, (p) => { apply(p); j.progress = size ? Math.min(1, (p.bytesRead ?? 0) / size) : 0; j.detail = `${fmtBytes(p.bytesRead ?? 0)} de ${fmtBytes(size)}`; }, () => j.cancel);
      j.detail = `Carpeta: ${folder}`;
    } finally { if (deleteAfter) fs.rmSync(file, { force: true }); }
  });
}

// Rutas que el usuario eligió con el selector nativo del sistema (app de escritorio): token de un solo uso, caduca en 1 h.
const picks = new Map<string, { file: string; exp: number }>();
export function allowImportPath(file: string): string {
  for (const [k, v] of picks) if (v.exp < Date.now()) picks.delete(k);
  const token = crypto.randomBytes(24).toString("hex"); picks.set(token, { file, exp: Date.now() + 3_600_000 }); return token;
}

/**
 * Importar SIN copiar: lee el archivo directamente de su ubicación (imprescindible con PST de decenas de GB:
 * copiarlo duplicaría el espacio y el tiempo). Acepta un token del selector nativo o una ruta escrita (solo lectura).
 */
app.post("/api/archive/import-path", h(async (r) => {
  const b = r.body as { token?: string; path?: string; folder?: string; force?: boolean };
  let file = "";
  if (b.token) { const t = picks.get(b.token); if (!t || t.exp < Date.now()) throw new Error("La selección caducó. Vuelve a elegir el archivo."); file = t.file; }
  else file = String(b.path ?? "").trim().replace(/^"(.*)"$/, "$1");
  if (!file || !path.isAbsolute(file)) throw new Error("Escribe la ruta completa del archivo (p. ej. D:\\Correo\\antiguo.pst o /home/yo/antiguo.pst).");
  const ext = path.extname(file).toLowerCase();
  if (!IMPORT_EXT.includes(ext)) throw new Error("Formato no admitido. Usa .pst, .ost, .mbox o .eml");
  let st: fs.Stats; try { st = fs.statSync(file); } catch { throw new Error("No encuentro ese archivo."); }
  if (!st.isFile()) throw new Error("Esa ruta no es un archivo.");
  try { fs.accessSync(file, fs.constants.R_OK); } catch { throw new Error("No tengo permiso para leer ese archivo."); }
  const free = archive.stats().freeBytes;
  if (free !== null && st.size > free * 1.1 && !b.force) { const e = new Error(`El archivo pesa ${fmtBytes(st.size)} y en el disco del archivo quedan ${fmtBytes(free)}: puede no caber. Puedes elegir otra unidad en "Ubicación" o continuar de todos modos.`) as Error & { code?: string }; e.code = "low_space"; throw e; }
  if (b.token) picks.delete(b.token);
  return { job: startImportJob(file, ext, archive.cleanFolder(b.folder || "Importado"), st.size, path.basename(file), false).id, size: st.size };
}));
app.post("/api/archive/location", h(async (r) => archive.setLocation(String(r.body.dir ?? ""))));

/** Subida en STREAMING (sin límite de tamaño: solo el espacio libre del disco). El cuerpo es el archivo tal cual. */
app.put("/api/archive/upload", async (req, res) => {
  let tmp = "";
  try {
    const name = path.basename(String(req.query.filename ?? "archivo")).replace(/[^\p{L}\p{N}.\-_ ()@]/gu, "_");
    const ext = path.extname(name).toLowerCase();
    if (!IMPORT_EXT.includes(ext)) return void res.status(400).json({ error: "Formato no admitido. Usa .pst, .ost, .mbox o .eml" });
    const folder = archive.cleanFolder(String(req.query.folder ?? "Importado"));
    const len = Number(req.headers["content-length"] ?? 0), free = archive.stats().freeBytes;
    if (free !== null && len && len * 1.25 > free) return void res.status(507).json({ error: `No hay espacio suficiente en el disco: hacen falta unos ${fmtBytes(len * 1.25)} y quedan ${fmtBytes(free)}.` });
    const dir = path.join(archive.archiveDir(), "tmp"); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    tmp = path.join(dir, `${crypto.randomUUID()}${ext}`);
    await pipeline(req, fs.createWriteStream(tmp, { mode: 0o600 }));
    const job = startImportJob(tmp, ext, folder, fs.statSync(tmp).size, name, true);
    res.json({ job: job.id });
  } catch (e) {
    if (tmp) fs.rmSync(tmp, { force: true });
    if (!res.headersSent) res.status(500).json({ error: (e as Error).message });
  }
});

/** Mueve correo del servidor al Archivo local. Por defecto solo COPIA; borrar del servidor es opcional y verificado. */
app.post("/api/archive/offload", h(async (r) => {
  const b = r.body as { account: string; folder: string; olderThanDays?: number; deleteFromServer?: boolean };
  if (!b.account || !b.folder) throw new Error("Falta la cuenta o la carpeta");
  const a = store.getAccount(b.account);
  const j = jobs.startJob("offload", `${a.email} · ${b.folder}`, async (job) => {
    const t = setInterval(() => { job.progress = job.total ? job.processed / job.total : 0; }, 500);
    try { await offload(a, { folder: b.folder, olderThanDays: b.olderThanDays || undefined, deleteFromServer: b.deleteFromServer === true }, job); } finally { clearInterval(t); }
  });
  return { job: j.id };
}));

/** Descarga de un buzón o carpeta como MBOX (lo abren Thunderbird, Apple Mail, Outlook con importador…). */
app.get("/api/export", async (req, res) => {
  const accId = String(req.query.account ?? ""), fol = String(req.query.folder ?? "");
  const local = accId === archive.LOCAL_ID;
  try {
    const base = (fol || (local ? "archivo-local" : "INBOX")).replace(/[\\/:*?"<>|]+/g, "_");
    res.setHeader("Content-Type", "application/mbox");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(base)}.mbox`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (local) await archive.exportMbox(fol || null, res); else await mail.exportFolderMbox(store.getAccount(accId), fol || "INBOX", res);
    res.end();
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: (e as Error).message }); else res.destroy(); }
});

// ---------- envío: bandeja de salida con plazo de retiro (10 min) ----------
// Un correo ya enviado por SMTP no se puede recuperar. Por eso se retiene aquí hasta cumplir el plazo.
type Sendable = mail.Outgoing & { sendAt?: string; now?: boolean };
async function dispatch(a: store.Account, payload: mail.Outgoing, o: { sendAt?: string; now?: boolean }) {
  if (o.sendAt && new Date(o.sendAt).getTime() > Date.now() + 30_000) {
    const it = outbox.enqueue(a.id, payload, { sendAt: new Date(o.sendAt).getTime() });
    return { queued: true, kind: it.kind, id: it.id, sendAt: it.sendAt };
  }
  if (o.now || outbox.sendDelayMs() === 0) return { sent: true, ...(await mail.sendMessage(a, payload)) };
  const it = outbox.enqueue(a.id, payload);
  return { queued: true, kind: it.kind, id: it.id, sendAt: it.sendAt };
}
app.post("/api/send", h(async (r) => {
  const { sendAt, now, signature, ...payload } = r.body as Sendable & { signature?: string }, a = acc(r);
  const out = payload.html ? payload : sigs.withSignature(payload, sigs.pick(a.id, signature, false)); // la firma (con su logo) se añade aquí; si quien llama ya trae HTML, se respeta
  return dispatch(a, out, { sendAt, now });
}));
app.post("/api/message/:uid/reply", h(async (r) => {
  const a = acc(r);
  return dispatch(a, await mail.buildReply(a, folder(r), uidOf(r), { text: r.body.text, replyAll: r.body.replyAll }, sigs.pick(a.id, r.body.signature, true)), { now: r.body.now });
}));
// ---------- firmas (con imagen) ----------
app.get("/api/signatures", h(async () => Object.fromEntries(store.loadAccounts().map((a) => [a.id, sigs.forAccount(a.id)]))));
app.put("/api/signatures/:account", h(async (r) => { store.getAccount(r.params.account); return sigs.save(r.params.account, r.body as Partial<sigs.SigSet>); }));
/** Busca la firma en los últimos correos enviados de la cuenta, para no tener que rehacerla. */
app.post("/api/signatures/:account/import", h(async (r) => {
  const a = store.getAccount(r.params.account), seen = new Set<string>(), found: { subject: string; date: string | null; html: string }[] = [];
  for (const m of await mail.sentSamples(a, 15)) {
    const html = sigs.extractSignature(m.html); if (!html) continue;
    const key = sigs.toText(html).replace(/\s+/g, " ").slice(0, 200) + (html.match(/<img/g)?.length ?? 0); if (seen.has(key)) continue; seen.add(key);
    found.push({ subject: m.subject, date: m.date, html }); if (found.length >= 4) break;
  }
  return { candidates: found };
}));
app.get("/api/outbox", h(async () => outbox.list()));
app.delete("/api/outbox/:id", (req, res) => {
  const r = outbox.cancel(req.params.id);
  r.ok ? res.json({ ok: true }) : res.status(409).json({ error: r.reason });
});
app.post("/api/outbox/:id/now", h(async (r) => { outbox.sendNow(r.params.id); await outbox.tick(); return { ok: true }; }));
app.get("/api/send-delay", h(async () => ({ minutes: outbox.sendDelayMs() / 60_000 })));
app.post("/api/draft", h(async (r) => mail.saveDraft(acc(r), r.body)));

// Planificador local: envía lo vencido y termina los "posponer".
const lock = outbox.createSchedulerLock();
async function tick() {
  if (!lock.acquire()) return; // otra instancia de CasaMail es la que envía
  await outbox.tick();
  idle.sync(); // vigilantes de correo en tiempo real: uno por cuenta (se ajustan solos al añadir o quitar cuentas)
  await notify.tick().catch((e) => console.warn("[avisos]", (e as Error).message));
  const sn = store.readJson<Snooze[]>("snoozed.json", []);
  const due = sn.filter((s) => s.until <= Date.now());
  for (const s of due) { try { await mail.setFlags(store.getAccount(s.account), s.folder, s.uid, { read: false }); } catch { /* mensaje movido */ } }
  if (due.length) store.writeJson("snoozed.json", store.readJson<Snooze[]>("snoozed.json", []).filter((s) => s.until > Date.now()));
}

// ---------- IA ----------
const load = async (r: Request) => (isLocal(r) ? archive.getMessage(Number(r.body.uid), false) : mail.getMessage(acc(r), (r.body.folder as string) || "INBOX", Number(r.body.uid), false));
// ---------- Yerleny: perfil y memoria ----------
app.get("/api/yerleny", h(async () => store.getYerleny()));
app.post("/api/yerleny", h(async (r) => {
  const cur = store.getYerleny(), b = r.body as Partial<store.YerlenyProfile>;
  store.saveYerleny({ userName: b.userName ?? cur.userName, tone: b.tone ?? cur.tone, language: b.language ?? cur.language, notes: cur.notes });
  ai.clearAiCache(); return store.getYerleny();
}));
app.post("/api/yerleny/notes", h(async (r) => { ai.clearAiCache(); return store.addYerlenyNote(String(r.body.note ?? "")); }));
app.delete("/api/yerleny/notes/:i", h(async (r) => { ai.clearAiCache(); return store.removeYerlenyNote(Number(r.params.i)); }));
app.get("/api/ai/ollama", h(async () => ai.detectOllama()));
app.get("/api/ai/presets", h(async () => store.AI_PRESETS));
app.get("/api/ai/config", h(async () => { const c = store.getAiConfig(); return c ? { ...c, apiKey: c.apiKey ? "••••" + c.apiKey.slice(-4) : "", hasKey: !!c.apiKey } : null; }));
app.post("/api/ai/config", h(async (r) => {
  const old = store.getAiConfig(), b = r.body as store.AiConfig;
  const key = !b.apiKey || b.apiKey.startsWith("••••") ? old?.apiKey ?? "" : b.apiKey;
  store.saveAiConfig({ provider: b.provider, baseUrl: b.baseUrl.trim(), model: b.model.trim(), apiKey: key, preset: b.preset }); ai.clearAiCache(); ai.resetEngineHealth();
  return { ok: true };
}));
const maskKey = (k: string) => (k ? "••••" + k.slice(-4) : "");
const publicEngine = (e: store.AiConfig) => ({ ...e, apiKey: maskKey(e.apiKey), hasKey: !!e.apiKey });
/** Motores en orden de uso (el primero responde; si falla, se prueba el siguiente). Las claves nunca salen de este equipo. */
app.get("/api/ai/engines", h(async () => store.getAiEngines().map(publicEngine)));
app.post("/api/ai/engines", h(async (r) => {
  const incoming = (r.body.engines ?? []) as store.AiConfig[], old = store.getAiEngines();
  const merged = incoming.map((e) => {
    const prev = old.find((o) => o.id && o.id === e.id);
    const apiKey = !e.apiKey || e.apiKey.startsWith("••••") ? prev?.apiKey ?? "" : e.apiKey; // una clave enmascarada conserva la guardada
    return { provider: e.provider, baseUrl: (e.baseUrl ?? "").trim(), model: String(e.model ?? "").trim(), apiKey, preset: e.preset, id: e.id } as store.AiConfig;
  }).filter(store.aiValid);
  store.saveAiEngines(merged); ai.clearAiCache(); ai.resetEngineHealth();
  return store.getAiEngines().map(publicEngine);
}));
/** Modelos que ofrece un proveedor (los gratuitos cambian a menudo, por eso se detectan en vivo). */
app.post("/api/ai/models", h(async (r) => {
  const b = r.body as { engineId?: string; provider?: store.AiProvider; baseUrl?: string; apiKey?: string; preset?: string };
  if (b.provider === "local" || b.preset === "local") return { models: localLlm.MODELS.map((m) => ({ id: m.id })) };
  const saved = b.engineId ? store.getAiEngines().find((e) => e.id === b.engineId) : undefined;
  const key = !b.apiKey || b.apiKey.startsWith("••••") ? saved?.apiKey ?? "" : b.apiKey;
  const preset = b.preset ? store.AI_PRESETS[b.preset] : undefined;
  const baseUrl = (b.baseUrl || saved?.baseUrl || preset?.baseUrl || "").trim(), provider = b.provider || saved?.provider || preset?.provider || "openai";
  if (!baseUrl) throw new Error("Falta la URL base del proveedor.");
  return { models: await ai.listModels({ provider, baseUrl, apiKey: key }) };
}));
// Motor integrado: modelos abiertos que corren en este equipo (gratis, sin cuenta, privado)
app.get("/api/ai/local", h(async () => localLlm.localStatus()));
/** Carga el modelo local en segundo plano (el usuario abre Yerleny o el redactor con IA y, mientras escribe, ya se está cargando). */
app.post("/api/ai/warmup", h(async () => ({ warming: await localLlm.warmup(false) })));
app.post("/api/ai/local/download", h(async (r) => { await localLlm.startDownload(String(r.body.id)); return localLlm.downloadStatus(); }));
app.post("/api/ai/local/cancel", h(async () => { localLlm.cancelDownload(); return localLlm.downloadStatus(); }));
app.delete("/api/ai/local/:id", h(async (r) => { await localLlm.removeModel(r.params.id); return { ok: true }; }));
app.post("/api/ai/test", h(async (r) => {
  const b = (r.body ?? {}) as { engineId?: string; engine?: store.AiConfig };
  const id = b.engineId;
  if (b.engine) { // probar sin guardar: la clave escrita en pantalla solo se usa para esta prueba
    if (!store.aiValid(b.engine)) throw new Error("Faltan datos del motor (URL y modelo).");
    return { reply: await ai.testEngine(b.engine), engine: ai.engineLabel(b.engine) };
  }
  if (id) { const e = store.getAiEngines().find((x) => x.id === id); if (!e) throw new Error("Motor no encontrado"); return { reply: await ai.testEngine(e), engine: ai.engineLabel(e) }; }
  return { reply: await ai.testAi() };
}));
const mkey = (r: Request, kind: string) => [isLocal(r) ? "local" : acc(r).id, (r.body.folder as string) || "INBOX", r.body.uid, kind, r.body.language ?? ""].join("|");
app.post("/api/ai/summarize", h(async (r) => ({ summary: await ai.cached(mkey(r, "resumen"), async () => ai.summarize(await load(r))) })));
app.post("/api/ai/replies", h(async (r) => ({ options: await ai.cached(mkey(r, "respuestas"), async () => ai.replyOptions(await load(r), r.body.language)) })));
app.post("/api/ai/draft", h(async (r) => ai.draft({ instruction: r.body.instruction, tone: r.body.tone, language: r.body.language, original: r.body.uid ? await load(r) : undefined })));
app.post("/api/ai/rewrite", h(async (r) => ({ text: await ai.rewrite(String(r.body.text), String(r.body.mode)) })));
app.post("/api/ai/search", h(async (r) => {
  const q = await ai.nlSearch(String(r.body.query));
  return { query: q, ...(isLocal(r) ? archive.searchMessages(q, null, 50) : await mail.searchMessages(acc(r), q, folder(r), 50)) };
}));
app.post("/api/ai/triage", h(async (r) => {
  const list = isLocal(r) ? archive.listMessages(folder(r), { limit: 30 }).messages : (await mail.listMessages(acc(r), folder(r), { limit: 30 })).messages;
  return { items: await ai.triage(list) };
}));
app.post("/api/ai/agent", h(async (r) => {
  const a = acc(r);
  return ai.agent(r.body.history ?? [], String(r.body.text), {
    search: (q) => mail.searchMessages(a, { text: q.text as string, from: q.from as string, to: q.to as string, subject: q.subject as string, since: q.since as string, before: q.before as string, unread: q.unread as boolean, starred: q.starred as boolean }, (q.folder as string) || "INBOX", Math.min(Number(q.limit ?? 15), 30)),
    read: (q) => mail.getMessage(a, (q.folder as string) || "INBOX", Number(q.uid), false),
    folders: () => mail.listFolders(a),
  }, store.getSettings().signatures[a.id]);
}));

// ---------- avisos (notificaciones) y calendario ----------
const toMs = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v ? Date.parse(v) : NaN);
/** Cambios en los buzones en tiempo real (IMAP IDLE): la interfaz lo espera y se actualiza al instante. */
app.get("/api/changes", async (req, res) => {
  const since = Number(req.query.since ?? idle.lastSeq()) || 0, wait = Math.min(Number(req.query.wait ?? 0) || 0, 30) * 1000;
  try { res.json(await idle.waitChange(since, wait)); } catch (e) { res.status(500).json({ error: String((e as Error).message) }); }
});
app.get("/api/notifications", async (req, res) => {
  const after = Number(req.query.after ?? 0) || 0, wait = Math.min(Number(req.query.wait ?? 0) || 0, 30) * 1000;
  try { res.json(wait ? await notify.waitFor(after, wait) : notify.list(after)); } catch (e) { res.status(500).json({ error: String((e as Error).message) }); }
});
app.post("/api/notifications/read", h(async (r) => { const b = r.body as { ids?: number[]; all?: boolean }; notify.markRead(b.all ? "all" : (b.ids ?? []).map(Number)); return notify.list(Number.MAX_SAFE_INTEGER); }));
app.post("/api/notifications/clear", h(async () => { notify.clearAll(); return { ok: true }; }));
app.post("/api/notifications/test", h(async () => ({ ok: !!notify.push({ kind: "system", title: "Prueba de aviso", body: "Si ves esto, las notificaciones de CasaMail funcionan." }) })));
app.post("/api/notifications/check", h(async () => ({ nuevos: await notify.checkMail() })));
app.post("/api/notifications/:id/agendar", h(async (r) => {
  const b = r.body as { title?: string; start?: unknown; end?: unknown; location?: string };
  const e = notify.agendarAviso(Number(r.params.id), { title: b.title, start: toMs(b.start) || undefined, end: toMs(b.end) || undefined, location: b.location });
  return { event: e };
}));
app.post("/api/notifications/:id/descartar", h(async (r) => { notify.descartarAviso(Number(r.params.id)); return { ok: true }; }));
/** ¿Hay una versión nueva de CasaMail? (consulta GitHub; sin enviar datos del usuario) */
app.get("/api/update", h(async (r) => ({ info: await updates.check(r.query.force === "1"), version: updates.currentVersion() })));
app.get("/api/notify/settings", h(async () => notify.getSettings()));
app.put("/api/notify/settings", h(async (r) => notify.saveSettings(r.body as Partial<notify.NotifySettings>)));

app.get("/api/calendar", h(async (r) => {
  const from = toMs(r.query.from) || Date.now() - 864e5, to = toMs(r.query.to) || from + 90 * 864e5;
  return { events: cal.between(from, to), tz: cal.tz() };
}));
app.post("/api/calendar", h(async (r) => {
  const b = r.body as { title?: string; start?: unknown; end?: unknown; allDay?: boolean; location?: string; link?: string; notes?: string; source?: cal.CalEvent["source"] };
  const start = toMs(b.start); if (!b.title?.trim() || !Number.isFinite(start)) throw new Error("Hace falta un título y una fecha/hora de inicio válida");
  const end = toMs(b.end); return cal.addEvent({ title: b.title.trim().slice(0, 200), start, end: Number.isFinite(end) && end >= start ? end : start + 3600_000, allDay: !!b.allDay, location: b.location?.slice(0, 300), link: b.link?.slice(0, 500), notes: b.notes?.slice(0, 2000), source: b.source, via: "manual" }, notify.getSettings().reminders);
}));
app.put("/api/calendar/:id", h(async (r) => {
  const b = r.body as Record<string, unknown>, p: Partial<cal.CalEvent> = {};
  if (typeof b.title === "string" && b.title.trim()) p.title = b.title.trim().slice(0, 200);
  if (Number.isFinite(toMs(b.start))) p.start = toMs(b.start); if (Number.isFinite(toMs(b.end))) p.end = toMs(b.end);
  for (const k of ["location", "link", "notes"] as const) if (typeof b[k] === "string") p[k] = (b[k] as string).slice(0, 2000);
  if (typeof b.allDay === "boolean") p.allDay = b.allDay;
  return cal.updateEvent(r.params.id, p, notify.getSettings().reminders);
}));
app.delete("/api/calendar/:id", h(async (r) => ({ ok: cal.removeEvent(r.params.id) })));
const sendIcs = (res: Response, name: string, events: cal.CalEvent[]) => { res.setHeader("Content-Type", "text/calendar; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`); res.send(cal.toIcs(events)); };
app.get("/api/calendar.ics", (_req, res) => sendIcs(res, "casamail.ics", cal.listEvents()));
app.get("/api/calendar/:id.ics", (req, res) => { const e = cal.listEvents().find((x) => x.id === req.params.id); if (!e) return res.status(404).end(); sendIcs(res, "reunion.ics", [e]); });
/** "Agendar reunión" desde un mensaje abierto: devuelve la propuesta para que el usuario la revise. */
app.post("/api/message/:uid/meeting", h(async (r) => {
  if (isLocal(r)) throw new Error("Abre el mensaje en su cuenta de correo para agendarlo");
  const a = acc(r), f = folder(r), m = await mail.getMessage(a, f, uidOf(r), false);
  const d = await notify.detectMeeting(a, f, m, { ai: true });
  return { proposal: d?.kind === "event" ? d.proposal : null, cancelled: d?.kind === "cancel" ? d.title : null, subject: m.subject };
}));

app.use(express.static(pub));

export interface RunningServer { onNotify(fn: (n: notify.Notif) => void): () => void; port: number; url: string; origin: string; token: string; close(): Promise<void>; allowImportPath(file: string): string; activeJobs(): number }

/** Arranca CasaMail. Lo usan `npm start` y la aplicación de escritorio (Electron). */
export async function startServer(o: { port?: number; fallbackRandom?: boolean; open?: boolean; quiet?: boolean } = {}): Promise<RunningServer> {
  const listen = (p: number) => new Promise<http.Server>((resolve, reject) => {
    const srv = http.createServer(app);
    srv.once("error", reject);
    srv.listen(p, HOST, () => { srv.off("error", reject); resolve(srv); });
  });
  let server: http.Server;
  try { server = await listen(o.port ?? PORT); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EADDRINUSE" && o.fallbackRandom) server = await listen(0); else throw e; }
  PORT = (server.address() as AddressInfo).port;
  const timer = setInterval(() => tick().catch(() => {}), 10_000); timer.unref();
  tick().catch(() => {});
  if (!process.env.CASAMAIL_NO_WARMUP) setTimeout(() => localLlm.warmup(true).catch(() => {}), 4000).unref();
  const origin = `http://${HOST}:${PORT}`, url = `${origin}/?t=${TOKEN}`;
  if (!o.quiet) console.log(`\n  CasaMail está corriendo → ${url}\n  ${REMOTE() ? `MODO REMOTO: escucha en ${HOST}:${PORT}. Hosts permitidos: ${allowedHosts().join(", ") || "(ninguno: define CASAMAIL_ALLOWED_HOSTS)"}. Usa siempre HTTPS (túnel).` : "(solo accesible desde este equipo)"}\n`);
  if (o.open) {
    const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    try { spawn(cmd[0] as string, cmd[1] as string[], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* sin navegador */ }
  }
  return {
    onNotify: (fn) => { notify.bus.on("notify", fn); return () => notify.bus.off("notify", fn); },
    port: PORT, url, origin, token: TOKEN, allowImportPath, activeJobs: jobs.activeCount,
    close: () => new Promise<void>((resolve) => { clearInterval(timer); idle.stopAll(); lock.release(); mail.closeConnections(); server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}

// Si se ejecuta directamente (npm start / node dist/web.js) arranca solo; si lo importa Electron, no.
const entry = process.argv[1] ? (() => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return ""; } })() : "";
if (entry === import.meta.url) {
  startServer({ open: !process.env.CASAMAIL_NO_OPEN, fallbackRandom: !process.env.PORT }).catch((e) => { console.error(e.message); process.exit(1); });
}
