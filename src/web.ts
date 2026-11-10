#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import * as store from "./store.js";
import * as mail from "./mail.js";
import * as ai from "./ai.js";
import * as outbox from "./outbox.js";
import * as oauth from "./oauth.js";

const PORT = Number(process.env.PORT ?? 8025);
const HOST = "127.0.0.1"; // app local: solo accesible desde este equipo
const TOKEN = process.env.CASAMAIL_TOKEN ?? (() => {
  let t = store.readJson<{ t?: string }>("token.json", {}).t;
  if (!t) { t = crypto.randomBytes(24).toString("hex"); store.writeJson("token.json", { t }); }
  return t;
})();
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "40mb" }));

// Defensa contra DNS-rebinding y CSRF: Host válido + token en cookie.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) return res.status(403).end();
  // Retorno de OAuth: llega desde accounts.google.com / login.microsoftonline.com, así que no lleva cookie Strict.
  // Se protege con `state` aleatorio de un solo uso + PKCE, no con la cookie.
  if (req.path === "/oauth/callback") return next();
  if (req.query.t === TOKEN) { res.setHeader("Set-Cookie", `cm=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`); return res.redirect(req.path); }
  const cookie = /(?:^|;\s*)cm=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  if (cookie !== TOKEN) return res.status(401).send("Abre CasaMail con el enlace que imprime al arrancar (npm start).");
  next();
});

const h = (fn: (req: Request) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req).then((d) => res.json(d), (e) => res.status(500).json({ error: e instanceof Error ? e.message : String(e), code: e instanceof oauth.ReauthError ? "reauth" : undefined }));
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
app.delete("/api/accounts/:id", h(async (r) => { store.removeAccount(r.params.id); return { ok: true }; }));
app.get("/api/settings", h(async () => store.getSettings()));
app.post("/api/settings", h(async (r) => {
  const cur = store.getSettings();
  const d = r.body.sendDelayMin;
  store.saveSettings({ signatures: r.body.signatures ?? cur.signatures, sendDelayMin: d === undefined ? cur.sendDelayMin : Math.min(Math.max(Number(d) || 0, 0), 10) });
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
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f1ec;color:#1d1b16}div{background:#fff;padding:36px 44px;border-radius:20px;box-shadow:0 10px 40px #0002;text-align:center;max-width:440px}h1{margin:.2em 0;font-size:22px}.i{font-size:46px}p{color:#5d5a52;line-height:1.5}@media(prefers-color-scheme:dark){body{background:#17161a;color:#eee}div{background:#232228}p{color:#aaa}}</style>
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

app.get("/api/folders", h(async (r) => mail.listFolders(acc(r))));
app.get("/api/messages", h(async (r) => {
  const a = acc(r), f = folder(r);
  const res = await mail.listMessages(a, f, { limit: Number(r.query.limit ?? 40), offset: Number(r.query.offset ?? 0), unread: r.query.unread === "1" });
  const hide = snoozeSet(a.id, f); learnFrom(res.messages);
  return { total: res.total, messages: res.messages.filter((m) => !hide.has(m.uid)) };
}));
app.get("/api/unified", h(async () => {
  const all = await Promise.all(store.loadAccounts().map(async (a) => {
    try { const hide = snoozeSet(a.id, "INBOX"); return (await mail.listMessages(a, "INBOX", { limit: 25 })).messages.filter((m) => !hide.has(m.uid)).map((m) => ({ ...m, account: a.id })); } catch { return []; }
  }));
  return { messages: all.flat().sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")).slice(0, 60) };
}));
app.get("/api/search", h(async (r) => {
  const q = { text: r.query.q as string, from: r.query.from as string | undefined, subject: r.query.subject as string | undefined, since: r.query.since as string | undefined, before: r.query.before as string | undefined, unread: r.query.unread === "1" || undefined, starred: r.query.starred === "1" || undefined };
  return mail.searchMessages(acc(r), q, folder(r), 50);
}));
app.get("/api/message/:uid", h(async (r) => mail.getMessage(acc(r), folder(r), uidOf(r), true)));
app.post("/api/message/:uid/flags", h(async (r) => { await mail.setFlags(acc(r), folder(r), uidOf(r), r.body); return { ok: true }; }));
app.post("/api/message/:uid/trash", h(async (r) => { await mail.trashMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/archive", h(async (r) => { await mail.archiveMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/spam", h(async (r) => { await mail.spamMessage(acc(r), folder(r), uidOf(r)); return { ok: true }; }));
app.post("/api/message/:uid/move", h(async (r) => { await mail.moveMessage(acc(r), folder(r), uidOf(r), r.body.dest); return { ok: true }; }));
app.post("/api/message/:uid/snooze", h(async (r) => {
  const a = acc(r), list = store.readJson<Snooze[]>("snoozed.json", []);
  list.push({ account: a.id, folder: folder(r), uid: uidOf(r), until: new Date(r.body.until).getTime() });
  store.writeJson("snoozed.json", list); return { ok: true };
}));
app.post("/api/folders", h(async (r) => mail.createFolder(acc(r), String(r.body.name))));
app.get("/api/message/:uid/attachment/:i", async (req, res) => {
  try {
    const a = await mail.getAttachment(acc(req), folder(req), uidOf(req), Number(req.params.i));
    res.setHeader("Content-Type", "application/octet-stream"); // nunca se interpreta en el navegador
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(a.content);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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
app.post("/api/send", h(async (r) => { const { sendAt, now, ...payload } = r.body as Sendable; return dispatch(acc(r), payload, { sendAt, now }); }));
app.post("/api/message/:uid/reply", h(async (r) => {
  const a = acc(r);
  return dispatch(a, await mail.buildReply(a, folder(r), uidOf(r), { text: r.body.text, replyAll: r.body.replyAll }), { now: r.body.now });
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
async function tick() {
  await outbox.tick();
  const sn = store.readJson<Snooze[]>("snoozed.json", []);
  const due = sn.filter((s) => s.until <= Date.now());
  for (const s of due) { try { await mail.setFlags(store.getAccount(s.account), s.folder, s.uid, { read: false }); } catch { /* mensaje movido */ } }
  if (due.length) store.writeJson("snoozed.json", store.readJson<Snooze[]>("snoozed.json", []).filter((s) => s.until > Date.now()));
}
setInterval(() => tick().catch(() => {}), 10_000).unref();
tick().catch(() => {});

// ---------- IA ----------
const load = async (r: Request) => { const m = await mail.getMessage(acc(r), (r.body.folder as string) || "INBOX", Number(r.body.uid), false); return m; };
// ---------- Yerleny: perfil y memoria ----------
app.get("/api/yerleny", h(async () => store.getYerleny()));
app.post("/api/yerleny", h(async (r) => {
  const cur = store.getYerleny(), b = r.body as Partial<store.YerlenyProfile>;
  store.saveYerleny({ userName: b.userName ?? cur.userName, tone: b.tone ?? cur.tone, language: b.language ?? cur.language, notes: cur.notes });
  return store.getYerleny();
}));
app.post("/api/yerleny/notes", h(async (r) => store.addYerlenyNote(String(r.body.note ?? ""))));
app.delete("/api/yerleny/notes/:i", h(async (r) => store.removeYerlenyNote(Number(r.params.i))));
app.get("/api/ai/ollama", h(async () => ai.detectOllama()));
app.get("/api/ai/presets", h(async () => store.AI_PRESETS));
app.get("/api/ai/config", h(async () => { const c = store.getAiConfig(); return c ? { ...c, apiKey: c.apiKey ? "••••" + c.apiKey.slice(-4) : "", hasKey: !!c.apiKey } : null; }));
app.post("/api/ai/config", h(async (r) => {
  const old = store.getAiConfig(), b = r.body as store.AiConfig;
  const key = !b.apiKey || b.apiKey.startsWith("••••") ? old?.apiKey ?? "" : b.apiKey;
  store.saveAiConfig({ provider: b.provider, baseUrl: b.baseUrl.trim(), model: b.model.trim(), apiKey: key, preset: b.preset });
  return { ok: true };
}));
app.post("/api/ai/test", h(async () => ({ reply: await ai.testAi() })));
app.post("/api/ai/summarize", h(async (r) => ({ summary: await ai.summarize(await load(r)) })));
app.post("/api/ai/replies", h(async (r) => ({ options: await ai.replyOptions(await load(r), r.body.language) })));
app.post("/api/ai/draft", h(async (r) => ai.draft({ instruction: r.body.instruction, tone: r.body.tone, language: r.body.language, original: r.body.uid ? await load(r) : undefined })));
app.post("/api/ai/rewrite", h(async (r) => ({ text: await ai.rewrite(String(r.body.text), String(r.body.mode)) })));
app.post("/api/ai/search", h(async (r) => {
  const q = await ai.nlSearch(String(r.body.query));
  return { query: q, ...(await mail.searchMessages(acc(r), q, folder(r), 50)) };
}));
app.post("/api/ai/triage", h(async (r) => {
  const list = (await mail.listMessages(acc(r), folder(r), { limit: 30 })).messages;
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

app.use(express.static(pub));

const url = `http://${HOST}:${PORT}/?t=${TOKEN}`;
app.listen(PORT, HOST, () => {
  console.log(`\n  CasaMail está corriendo → ${url}\n  (solo accesible desde este equipo)\n`);
  if (!process.env.CASAMAIL_NO_OPEN) {
    const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    try { spawn(cmd[0] as string, cmd[1] as string[], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* sin navegador */ }
  }
});
