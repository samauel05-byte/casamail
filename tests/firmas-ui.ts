// Firmas con imagen en la interfaz: crear con logo, elegir al redactar, enviar con el logo incrustado, responder e importar desde Enviados.
// Uso: PW_PATH=... npx tsx tests/firmas-ui.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-uifirma-"));
const { startImap, startSmtp, startFakeAi, sentMails } = await import("./servers.js");
const store = await import("../src/store.js");
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
startImap(); startSmtp(); startFakeAi(); await new Promise((r) => setTimeout(r, 400));
store.addAccount(store.buildAccount({ id: "casa", email: "yo@casa.test", pass: "secreto", user: "yo", imap: { host: "127.0.0.1", port: 1143, secure: false }, smtp: { host: "127.0.0.1", port: 1025, secure: false } }));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const logo = path.join(process.env.CASAMAIL_HOME!, "logo.png"); fs.writeFileSync(logo, PNG);
const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8080", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1", CASAMAIL_NO_WARMUP: "1" }, stdio: "inherit" });
process.on("exit", () => web.kill()); await new Promise((r) => setTimeout(r, 4000));
const ok = (c: unknown, m: string) => { console.log(c ? "  ✔" : "  ✘", m); if (!c) process.exitCode = 1; };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const pg = await ctx.newPage(); pg.setDefaultTimeout(15000); pg.on("dialog", (d) => d.accept());
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message));
await pg.goto("http://127.0.0.1:8080/?t=tok"); await pg.waitForSelector(".m");

await pg.click("#cfg"); await pg.click('[data-tab="firma"]'); await pg.waitForSelector("[data-new]");
await pg.click("[data-new]"); await pg.waitForSelector("#sged"); await pg.fill("#sgn", "Principal");
await pg.evaluate(() => { document.querySelector("#sged")!.innerHTML = "<div><b>Sam Pérez</b><br>Director · casamail.test</div>"; });
await pg.setInputFiles("#sgf", logo); await pg.waitForSelector("#sged img"); ok(true, "el logo se sube y aparece en el editor");
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/f1-editor.png" });
await pg.click("#sgok"); await pg.waitForSelector(".sigitem .sigthumb img"); ok((await pg.locator(".sigitem").count()) === 1, "la firma queda guardada con su miniatura (logo incluido)");
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/f2-lista.png" });
const saved = await (await ctx.request.get("http://127.0.0.1:8080/api/signatures")).json(); ok(saved.casa.items[0].html.includes("data:image/png") && saved.casa.items[0].text.includes("Sam Pérez") && saved.casa.newDefault === saved.casa.items[0].id, "el servidor la guarda limpia, con texto alternativo y como predeterminada");
await pg.click("#mx");

await pg.click("#new"); await pg.waitForSelector("#sigbar:not([hidden])"); ok((await pg.textContent("#sigsel option:checked")) === "Principal", "al redactar elige la firma principal");
ok(await pg.locator("#sigprev img").count() === 1 && (await pg.textContent("#sigprev"))!.includes("Sam Pérez"), "y muestra su vista previa con el logo");
ok(!(await pg.inputValue("#body")).includes("Sam"), "la firma no se mezcla con el texto que escribes");
await pg.fill("#to", "ana@empresa.com"); await pg.fill("#sub", "Con logo"); await pg.fill("#body", "Hola Ana,\nTe escribo con mi firma.");
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/f3-redactar.png" });
const n0 = sentMails.length; await pg.click("#sendnow"); await pg.waitForFunction(() => document.querySelector(".toast"), null, { timeout: 8000 });
for (let i = 0; i < 30 && sentMails.length === n0; i++) await new Promise((r) => setTimeout(r, 200));
const m = sentMails[n0]; ok(m && (m.html as string).includes("Te escribo con mi firma") && (m.html as string).includes("Sam Pérez") && m.attachments.some((a) => a.contentType === "image/png" && a.cid && a.related), "el destinatario recibe el texto con la firma y el logo incrustado");
ok(m.text!.includes("-- \nSam Pérez"), "y la versión de texto también lleva la firma");

await pg.click("#new"); await pg.waitForSelector("#sigbar:not([hidden])"); await pg.selectOption("#sigsel", ""); ok((await pg.locator("#sigprev:not([hidden])").count()) === 0, "'Sin firma' oculta la vista previa");
await pg.fill("#to", "ana@empresa.com"); await pg.fill("#sub", "Sin firma"); await pg.fill("#body", "Solo texto."); const n1 = sentMails.length; await pg.click("#sendnow");
for (let i = 0; i < 30 && sentMails.length === n1; i++) await new Promise((r) => setTimeout(r, 200)); ok(sentMails[n1] && sentMails[n1].html === false && !sentMails[n1].text!.includes("Sam Pérez"), "sin firma el correo sale sin ella");

await pg.click("#cfg"); await pg.click('[data-tab="firma"]'); await pg.waitForSelector("[data-imp]"); await pg.click("[data-imp]");
await pg.waitForSelector("[data-use]", { timeout: 20000 }); ok((await pg.locator(".sigitem .sigthumb img").count()) >= 1, "'Importar de un correo enviado' encuentra la firma con el logo en Enviados");
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/f4-importar.png" });
await pg.click("[data-use]"); await pg.waitForSelector("#sged img"); await pg.click("#sgok"); await pg.waitForSelector(".sigitem >> nth=1"); ok((await pg.locator(".sigitem").count()) === 2, "la firma importada se añade (y se puede retocar antes)");
ok(errs.length === 0, "sin errores de JavaScript " + errs.join(" | "));
await b.close(); web.kill(); process.exit(process.exitCode ?? 0);
