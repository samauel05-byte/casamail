#!/usr/bin/env node
import readline from "node:readline/promises";
import { addAccount, buildAccount, loadAccounts, removeAccount, PRESETS } from "./store.js";
import { testConnection } from "./mail.js";
import http from "node:http";
import { spawn } from "node:child_process";
import * as oauth from "./oauth.js";

const [cmd, ...args] = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

async function ask(q: string, def?: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  rl.close();
  return a || def || "";
}

async function oauthAdd(provider: "google" | "microsoft") {
  const id = flag("client-id"), secret = flag("client-secret") ?? process.env.CASAMAIL_CLIENT_SECRET;
  if (id) oauth.saveClient(provider, { clientId: id, clientSecret: secret, tenant: flag("tenant") });
  if (!oauth.clientConfig(provider)) { console.log(`Falta el Client ID de ${provider}. Usa --client-id (y --client-secret para Google). Guía: docs/OAUTH.md`); process.exit(1); }
  // servidor de retorno temporal en un puerto libre; se cierra al terminar
  const srv = http.createServer(); await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port;
  const { url, state } = oauth.startAuth(provider, oauth.redirectUriFor(provider, port), flag("email"));
  const done = new Promise<{ ok: boolean; email?: string; error?: string }>((resolve) => srv.on("request", async (req, res) => {
    const u = new URL(req.url!, "http://x"); if (u.pathname !== "/oauth/callback") { res.statusCode = 404; return res.end(); }
    const r = await oauth.completeAuth(u.searchParams.get("state") ?? "", { code: u.searchParams.get("code") ?? undefined, error: u.searchParams.get("error") ?? undefined, error_description: u.searchParams.get("error_description") ?? undefined });
    res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(r.ok ? "Cuenta conectada. Ya puedes cerrar esta pestaña." : "No se pudo conectar. Mira la terminal."); resolve(r);
  }));
  console.log(`Abre este enlace para autorizar CasaMail:\n\n${url}\n`);
  try { spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "win32" ? ["/c", "start", "", url] : [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* manual */ }
  const timeout = setTimeout(() => { console.log("Tiempo agotado."); process.exit(1); }, 10 * 60_000);
  const r = await done; clearTimeout(timeout); srv.close(); void state;
  if (!r.ok) { console.log("Error: " + r.error); process.exit(1); }
  console.log(`Cuenta ${r.email} conectada con OAuth.`); process.exit(0);
}

if (cmd === "add" && flag("oauth")) {
  const p = flag("oauth"); if (p !== "google" && p !== "microsoft") { console.log("Usa --oauth google o --oauth microsoft"); process.exit(1); }
  await oauthAdd(p);
} else if (cmd === "add") {
  const email = flag("email") ?? await ask("Email");
  const preset = flag("preset") ?? await ask(`Proveedor (${Object.keys(PRESETS).join("/")}/otro)`, "otro");
  const pass = process.env.CASAMAIL_PASS ?? flag("pass") ?? await ask("Contraseña (o contraseña de aplicación)");
  const manual = preset === "otro";
  const acc = buildAccount({
    email, pass, preset: manual ? undefined : preset, id: flag("id"),
    imap: manual ? { host: flag("imap-host") ?? await ask("Host IMAP", `imap.${email.split("@")[1]}`), port: Number(flag("imap-port") ?? 993) } : undefined,
    smtp: manual ? { host: flag("smtp-host") ?? await ask("Host SMTP", `smtp.${email.split("@")[1]}`), port: Number(flag("smtp-port") ?? 465), secure: Number(flag("smtp-port") ?? 465) === 465 } : undefined,
  });
  if (!args.includes("--skip-test")) {
    process.stdout.write("Probando conexión IMAP + SMTP… ");
    try { await testConnection(acc); console.log("OK"); } catch (e) { console.log("FALLÓ\n" + (e as Error).message); process.exit(1); }
  }
  addAccount(acc);
  console.log(`Cuenta "${acc.id}" guardada.`);
} else if (cmd === "list") {
  for (const a of loadAccounts()) console.log(`${a.id}\t${a.email}\t${a.imap.host}`);
} else if (cmd === "remove" && args[0]) {
  removeAccount(args[0]); console.log("Eliminada.");
} else {
  console.log("Uso: casamail <add|list|remove <id>>\n  add --oauth google|microsoft --client-id ID [--client-secret S]   (Gmail/Outlook sin contraseña)\n  add [--email x --preset gmail|outlook|yahoo|icloud|fastmail|zoho|otro --imap-host --smtp-host ...]\nLa contraseña puede pasarse con la variable CASAMAIL_PASS.");
}
