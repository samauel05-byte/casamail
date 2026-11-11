// Capturas de diseño con datos de ejemplo variados. Uso: PW_PATH=... npx tsx tests/shots.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "casamail-shots-"));
process.env.CASAMAIL_OAUTH_MOCK = "http://127.0.0.1:1300";
const { startImap, startSmtp, startFakeAi, startMockOAuth } = await import("./servers.js");
const store = await import("../src/store.js");
const { ImapFlow } = await import("imapflow");
const MailComposer = (await import("nodemailer/lib/mail-composer/index.js")).default;
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
const OUT = process.env.OUT ?? "/tmp/shots"; fs.mkdirSync(OUT, { recursive: true });

const imap = startImap(); startSmtp(); startFakeAi(); startMockOAuth(imap as never);
await new Promise((r) => setTimeout(r, 400));
const mk = (id: string, email: string) => store.addAccount(store.buildAccount({ id, email, pass: "secreto", user: "yo", imap: { host: "127.0.0.1", port: 1143, secure: false }, smtp: { host: "127.0.0.1", port: 1025, secure: false } }));
mk("casa", "yo@casa.test"); mk("trabajo", "yo@empresa.test");
store.saveAiConfig({ provider: "openai", baseUrl: "http://127.0.0.1:1199/v1", apiKey: "", model: "x", preset: "ollama" });

const h = (n: number) => new Date(Date.now() - n * 36e5);
const seed: { from: string; subject: string; text: string; html?: string; ago: number; flags?: string[]; att?: boolean }[] = [
  { from: "Marta Ruiz <marta@estudio.es>", subject: "Propuesta de diseño para la web nueva", text: "Hola,\n\nTe paso la propuesta con las tres opciones de portada. Me gustaría tu opinión antes del jueves para poder cerrar el presupuesto con el cliente.\n\nMás info: https://estudio.es/propuesta\n\nUn abrazo,\nMarta", ago: 0.4, att: true },
  { from: "Banco Norte <avisos@banconorte.com>", subject: "Tu factura de noviembre ya está disponible", text: "Tu factura de 89,90 EUR vence el día 20.", ago: 2, flags: ["\\Seen"] },
  { from: "GitHub <noreply@github.com>", subject: "[casamail] Pull request #42 ready for review", text: "Se abrió un nuevo pull request.", ago: 5, flags: ["\\Flagged"] },
  { from: "Luis Fernández <luis@amigo.com>", subject: "Re: Asado el sábado", text: "¡Cuenta conmigo! Llevo yo el vino 🍷", ago: 8 },
  { from: "Luis Fernández <luis@amigo.com>", subject: "Asado el sábado", text: "¿Te apuntas al asado del sábado en mi casa?", ago: 26, flags: ["\\Seen"] },
  { from: "Boletín Semanal <news@boletin.com>", subject: "Las 10 mejores herramientas de productividad de 2026", html: "<div style='font-family:Georgia;max-width:520px;margin:auto'><h1 style='color:#b5502c'>Productividad 2026</h1><p>Esta semana: <b>diez herramientas</b> que están cambiando la forma de trabajar.</p><img src='https://example.com/x.png' width=300><p><a href='https://example.com'>Leer más →</a></p></div>", text: "Productividad 2026", ago: 30, flags: ["\\Seen"] },
  { from: "Ana Pérez <ana@empresa.com>", subject: "Presupuesto marzo", text: "Hola, adjunto el presupuesto de marzo: 4.500 EUR. ¿Puedes confirmar antes del viernes?", ago: 52 },
  { from: "Tienda Online <pedidos@tienda.com>", subject: "Tu pedido #88231 ha sido enviado", text: "Llegará el miércoles.", ago: 75, flags: ["\\Seen"] },
  { from: "Equipo de Soporte <soporte@servicio.io>", subject: "Hemos recibido tu consulta", text: "Te responderemos en 24 horas.", ago: 200, flags: ["\\Seen"] },
];
const c = new ImapFlow({ host: "127.0.0.1", port: 1143, secure: false, auth: { user: "yo", pass: "secreto" }, logger: false });
await c.connect();
for (const s of seed) {
  const raw = await new MailComposer({ from: s.from, to: "yo@casa.test", subject: s.subject, text: s.text, html: s.html, date: h(s.ago), attachments: s.att ? [{ filename: "propuesta-web.pdf", content: Buffer.alloc(240 * 1024, 1), contentType: "application/pdf" }] : [] }).compile().build();
  await c.append("INBOX", raw, s.flags ?? [], h(s.ago));
}
await c.logout();

const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8078", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1" }, stdio: "inherit" });
process.on("exit", () => web.kill());
await new Promise((r) => setTimeout(r, 4000));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
const pg = await ctx.newPage(); pg.setDefaultTimeout(10000); pg.on("dialog", (d) => d.accept());
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const shot = async (n: string) => { await pg.waitForTimeout(350); await pg.screenshot({ path: `${OUT}/${n}.png` }); console.log("  📸", n); };
await pg.goto("http://127.0.0.1:8078/?t=tok"); await pg.waitForSelector(".m");
await pg.locator(".m", { hasText: "Propuesta de diseño" }).first().click(); await pg.waitForSelector(".vsub");
await pg.click("#ais"); await pg.waitForSelector(".card-ai pre"); await shot("1-inbox-light");
await pg.click("#theme"); await pg.click("#theme"); await shot("2-inbox-dark"); await pg.click("#theme");
await pg.locator(".m", { hasText: "Productividad" }).first().click(); await pg.waitForSelector("iframe.msg-html"); await shot("3-html-message");
await pg.click("#new"); await pg.click("#aitog"); await pg.fill("#aiins", "pídele a Marta que me mande las tres opciones el jueves"); await shot("4-compose-ai");
await pg.click("#cclose"); await pg.click("#asst"); await pg.fill("#ci", "prepara confirmación"); await pg.click("#cgo"); await pg.waitForSelector(".dr", { timeout: 20000 }); await shot("5-assistant");
await pg.click("#dclose"); await pg.click("#cfg"); await pg.click('[data-add="google"]'); await shot("6-settings-google");
await pg.click('#mbox [data-tab="ia"]'); await shot("7-settings-ai");
await pg.click("#mx"); await pg.keyboard.press("Control+k"); await pg.fill("#pin", "arch"); await shot("8-palette");
await pg.keyboard.press("Escape");
const m = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, colorScheme: "light" });
const mp = await m.newPage(); await mp.goto("http://127.0.0.1:8078/?t=tok"); await mp.waitForSelector(".m"); await mp.waitForTimeout(400); await mp.screenshot({ path: `${OUT}/9-mobile-list.png` });
await mp.locator(".m").first().click(); await mp.waitForSelector(".vsub"); await mp.waitForTimeout(300); await mp.screenshot({ path: `${OUT}/10-mobile-message.png` });
// Capturas para Google Play (teléfono, 1080×1920)
await ctx.request.delete("http://127.0.0.1:8078/api/accounts/trabajo"); // una sola cuenta: sin mensajes duplicados en las capturas
const ph = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "light" });
const pp = await ph.newPage(); pp.setDefaultTimeout(10000); await pp.goto("http://127.0.0.1:8078/?t=tok"); await pp.waitForSelector(".m"); await pp.waitForTimeout(500); await pp.screenshot({ path: `${OUT}/play-1-bandeja.png` });
await pp.locator(".m", { hasText: "Propuesta de diseño" }).first().click(); await pp.waitForSelector(".vsub"); await pp.waitForTimeout(400); await pp.screenshot({ path: `${OUT}/play-2-mensaje.png` });
try { await pp.click("#ais"); await pp.waitForSelector(".card-ai pre", { timeout: 8000 }); await pp.waitForTimeout(300); await pp.screenshot({ path: `${OUT}/play-3-yerleny-resumen.png` }); } catch { /* sin IA en esta captura */ }
await ph.close();
const phd = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" });
const pd = await phd.newPage(); await pd.goto("http://127.0.0.1:8078/?t=tok"); await pd.waitForSelector(".m"); await pd.waitForTimeout(500); await pd.screenshot({ path: `${OUT}/play-4-oscuro.png` }); await phd.close();
console.log(errs.length ? "ERRORES: " + errs.join("\n") : "sin errores de consola");
await b.close(); web.kill(); process.exit(0);
