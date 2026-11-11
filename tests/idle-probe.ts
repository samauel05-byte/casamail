// Sonda: ¿qué eventos IDLE envía el IMAP de pruebas a otra sesión? Uso: npx tsx tests/idle-probe.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-idle-"));
const { startImap } = await import("./servers.js");
const { ImapFlow } = await import("imapflow");
startImap(); await new Promise((r) => setTimeout(r, 400));
const mk = () => new ImapFlow({ host: "127.0.0.1", port: 1143, secure: false, auth: { user: "yo", pass: "secreto" }, logger: false });
const a = mk(); await a.connect(); await a.mailboxOpen("INBOX", { readOnly: true });
const events: string[] = []; for (const n of ["exists", "expunge", "flags"]) a.on(n, (d: unknown) => events.push(n + " " + JSON.stringify(d)));
a.idle().catch(() => {});
const b = mk(); await b.connect(); await b.mailboxOpen("INBOX");
const uids = (await b.search({ all: true }, { uid: true })) || []; console.log("uids", uids);
await b.messageFlagsAdd(String(uids[0]), ["\\Seen"], { uid: true }); await new Promise((r) => setTimeout(r, 800));
await b.messageDelete(String(uids[0]), { uid: true }); await new Promise((r) => setTimeout(r, 800));
console.log("eventos:", events); process.exit(0);
