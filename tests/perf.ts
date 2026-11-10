// Mide cuánto tarda un uso normal contra un IMAP con latencia de red realista (RTT ≈ 80 ms) y cuántas conexiones abre.
//   npx tsx tests/perf.ts
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "casamail-perf-"));
const { startImap, startSmtp } = await import("./servers.js");
const store = await import("../src/store.js");
const mail = await import("../src/mail.js");
const { ImapFlow } = await import("imapflow");

const ONE_WAY_MS = Number(process.env.LAT ?? 40);
startImap(); startSmtp();
const stats = { connections: 0 };
const proxy = net.createServer((c) => {
  stats.connections++;
  const up = net.connect(1143, "127.0.0.1");
  const pipe = (a: net.Socket, b: net.Socket) => a.on("data", (d) => setTimeout(() => !b.destroyed && b.write(d), ONE_WAY_MS)).on("close", () => setTimeout(() => b.destroy(), ONE_WAY_MS)).on("error", () => b.destroy());
  pipe(c, up); pipe(up, c);
});
await new Promise<void>((r) => proxy.listen(1144, "127.0.0.1", r));
// bandeja con 300 mensajes para que el tamaño importe
const seed = new ImapFlow({ host: "127.0.0.1", port: 1143, secure: false, auth: { user: "yo", pass: "secreto" }, logger: false });
await seed.connect();
for (let i = 0; i < 300; i++) await seed.append("INBOX", Buffer.from(`From: P${i} <p${i}@x.com>\r\nTo: yo@casa.test\r\nSubject: Mensaje ${i}\r\nDate: Mon, 02 Mar 2026 09:${String(i % 60).padStart(2, "0")}:00 +0000\r\nMessage-ID: <m${i}@x>\r\n\r\ncuerpo ${i}`), []);
await seed.logout();
const acc = store.buildAccount({ id: "p", email: "yo@casa.test", pass: "secreto", user: "yo", imap: { host: "127.0.0.1", port: 1144, secure: false }, smtp: { host: "127.0.0.1", port: 1025, secure: false } });

const time = async (name: string, f: () => Promise<unknown>) => { const t0 = performance.now(); await f(); const ms = performance.now() - t0; console.log(`  ${name.padEnd(44)} ${ms.toFixed(0).padStart(6)} ms`); return ms; };
const c0 = stats.connections; let total = 0;
console.log(`\nLatencia simulada: ${ONE_WAY_MS * 2} ms de ida y vuelta\n`);
total += await time("1. carpetas (barra lateral)", () => mail.listFolders(acc));
let uids: number[] = [];
total += await time("2. bandeja de entrada (40 mensajes)", async () => { uids = (await mail.listMessages(acc, "INBOX", { limit: 40 })).messages.map((m) => m.uid); });
for (let i = 0; i < 3; i++) total += await time(`3.${i + 1} abrir un mensaje`, () => mail.getMessage(acc, "INBOX", uids[i], true));
total += await time("4. destacar un mensaje", () => mail.setFlags(acc, "INBOX", uids[0], { starred: true }));
total += await time("5. volver a pedir las carpetas (refresco)", () => mail.listFolders(acc));
total += await time("6. volver a pedir la bandeja (refresco)", () => mail.listMessages(acc, "INBOX", { limit: 40 }));
console.log(`\n  TOTAL ${total.toFixed(0)} ms | conexiones IMAP abiertas: ${stats.connections - c0}\n`);
process.exit(0);
