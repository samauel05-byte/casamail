// La lista no tiene tope: se cargan más correos al desplazarse, y se pueden abrir todos. Uso: PW_PATH=... npx tsx tests/lista-ui.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-uilista-"));
const { startImap, startSmtp, startFakeAi } = await import("./servers.js");
const store = await import("../src/store.js");
const { ImapFlow } = await import("imapflow");
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
startImap(); startSmtp(); startFakeAi(); await new Promise((r) => setTimeout(r, 400));
const mkAcc = (id: string) => store.addAccount(store.buildAccount({ id, email: `${id}@casa.test`, pass: "secreto", user: "yo", imap: { host: "127.0.0.1", port: 1143, secure: false }, smtp: { host: "127.0.0.1", port: 1025, secure: false } }));
mkAcc("uno");
const N = 230, c = new ImapFlow({ host: "127.0.0.1", port: 1143, secure: false, auth: { user: "yo", pass: "secreto" }, logger: false }); await c.connect();
const raw = (i: number) => Buffer.from(`From: Persona ${i} <p${i}@x.com>\r\nTo: yo@casa.test\r\nSubject: Correo número ${i}\r\nDate: ${new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toUTCString()}\r\nMessage-ID: <lista${i}@x>\r\n\r\nCuerpo del correo ${i}`);
for (let i = 1; i <= N; i++) await c.append("INBOX", raw(i), i % 3 === 0 ? [] : ["\\Seen"]);
const T = (await c.status("INBOX", { messages: true })).messages as number; // total real del buzón (incluye los 3 de ejemplo del servidor de pruebas)
const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8083", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1", CASAMAIL_NO_WARMUP: "1" }, stdio: "inherit" });
process.on("exit", () => web.kill()); await new Promise((r) => setTimeout(r, 4000));
const ok = (cond: unknown, m: string) => { console.log(cond ? "  ✔" : "  ✘", m); if (!cond) process.exitCode = 1; };
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); pg.setDefaultTimeout(15000); pg.on("dialog", (d) => d.accept());
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message));
const rows = () => pg.locator(".m").count();
const scrollEnd = () => pg.evaluate(() => { const l = document.querySelector("#list")!; l.scrollTop = l.scrollHeight; });
await pg.goto("http://127.0.0.1:8083/?t=tok"); await pg.waitForSelector(".m");
const total0 = await rows(); ok(total0 >= 40 && total0 <= 60, `al abrir carga una primera página (${total0} correos), no todo de golpe`);
ok((await pg.textContent(".cnt"))!.replace(/\D/g, "") === String(T), `el contador muestra el total real: ${T}`);
ok(await pg.locator("#lmore").count() === 1 || (await rows()) > total0, "hay 'Cargar más' o ya se cargó más");

for (let i = 0; i < 20 && (await rows()) < T; i++) { await scrollEnd(); await pg.waitForTimeout(500); }
ok((await rows()) === T, `al desplazarse se cargan TODOS los correos (${await rows()} de ${T}, sin tope)`);
ok((await pg.textContent(".loadmore"))!.includes("Fin de la lista") && (await pg.textContent(".loadmore"))!.includes(String(T)), `al final dice 'Fin de la lista · ${T} correos'`);
const uids = await pg.locator(".m").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.u)); ok(new Set(uids).size === uids.length, "sin correos repetidos");

// abrir uno muy abajo y luego otros: no hay límite de correos abiertos
const deep = pg.locator(".m", { hasText: "Correo número 12" }).first(); await deep.scrollIntoViewIfNeeded(); await deep.click(); await pg.waitForSelector(".vsub");
ok((await pg.textContent(".vsub"))!.includes("Correo número 12"), "se abre un correo del final de la lista (el nº 12)");
let opened = 0; for (let i = 0; i < 40; i++) { const r = pg.locator(".m").nth(10 + i * 4); await r.scrollIntoViewIfNeeded(); await r.click(); await pg.waitForSelector(".vsub"); opened++; }
ok(opened === 40, `se pueden seguir abriendo correos uno tras otro (${opened} seguidos, y sin recargar)`);

// la lista sigue entera cuando llega correo nuevo (IDLE) y la posición se mantiene
const y0 = await pg.evaluate(() => document.querySelector("#list")!.scrollTop);
await c.append("INBOX", raw(N + 100), []); await pg.waitForFunction((n) => document.querySelectorAll(".m").length === n, T + 1, { timeout: 15000 }); ok(true, `llega un correo nuevo: aparece arriba y la lista sigue entera (${T + 1})`);
const y1 = await pg.evaluate(() => document.querySelector("#list")!.scrollTop); ok(Math.abs(y1 - y0) < 400, `y no te saca de donde estabas leyendo (desplazamiento ${Math.abs(y1 - y0)} px)`);
ok((await pg.textContent(".cnt"))!.replace(/\D/g, "") === String(T + 1), `el contador sube a ${T + 1}`);

// filtro de no leídos también pagina
await pg.click('[data-f="unread"]'); await pg.waitForSelector(".m"); for (let i = 0; i < 20; i++) { await scrollEnd(); await pg.waitForTimeout(400); }
await c.mailboxOpen("INBOX"); const unreadExpected = ((await c.search({ seen: false })) || []).length; /* los que abrí quedaron leídos */ ok((await rows()) === unreadExpected, `'No leídos' también carga todos: ${await rows()} de ${unreadExpected}`);

// bandeja unificada con 2 cuentas: 2 × 231 correos
mkAcc("dos"); await pg.reload(); await pg.waitForSelector(".m"); await pg.waitForTimeout(500);
const tU = Date.now(); for (let i = 0; i < 120 && !(await pg.locator(".loadmore.end").count()); i++) { await scrollEnd(); await pg.waitForTimeout(500); } console.log(`      (bandeja unificada completa en ${Date.now() - tU} ms)`);
ok((await rows()) === 2 * (T + 1), `bandeja unificada (2 cuentas): ${await rows()} de ${2 * (T + 1)}`);
ok(errs.length === 0, "sin errores de JavaScript " + errs.join(" | "));
await c.logout().catch(() => {}); await b.close(); web.kill(); process.exit(process.exitCode ?? 0);
