// "Crear correo nuevo": proveedores, enlaces oficiales, y paso a conectar la cuenta. Uso: PW_PATH=... npx tsx tests/crear-ui.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-uicrear-"));
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8081", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1", CASAMAIL_NO_WARMUP: "1" }, stdio: "inherit" });
process.on("exit", () => web.kill()); await new Promise((r) => setTimeout(r, 3500));
const ok = (c: unknown, m: string) => { console.log(c ? "  ✔" : "  ✘", m); if (!c) process.exitCode = 1; };
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1200, height: 820 } })).newPage(); pg.setDefaultTimeout(12000); pg.on("dialog", (d) => d.accept());
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message));
await pg.goto("http://127.0.0.1:8081/?t=tok"); await pg.waitForSelector("#crearcuenta");
ok((await pg.textContent("#crearcuenta"))!.includes("Crear correo nuevo"), "sin cuentas, lo primero que se ve es 'Crear correo nuevo'");
ok(await pg.locator('[data-add-first="google"]').count() === 1, "y debajo sigue 'Conectar' para quien ya tiene correo");
await pg.click("#crearcuenta"); await pg.waitForSelector(".nuevo-card");
const names = await pg.locator(".nuevo-card b").allTextContents(); ok(["Gmail", "Outlook", "Yahoo Mail", "iCloud Mail", "Zoho Mail"].every((n) => names.includes(n)), "ofrece Gmail, Outlook, Yahoo, iCloud y Zoho: " + names.join(", "));
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/c1-proveedores.png" });
const OFFICIAL: Record<string, string> = { Gmail: "accounts.google.com", Outlook: "signup.live.com", "Yahoo Mail": "login.yahoo.com", "iCloud Mail": "appleid.apple.com", "Zoho Mail": "accounts.zoho.com" };
for (const [name, host] of Object.entries(OFFICIAL)) {
  await pg.locator(".nuevo-card", { hasText: name }).click(); await pg.waitForSelector("#cwgo");
  const a = pg.locator("#cwgo"), href = (await a.getAttribute("href"))!, u = new URL(href);
  ok(u.protocol === "https:" && u.hostname === host && (await a.getAttribute("target")) === "_blank" && /noopener/.test((await a.getAttribute("rel")) ?? ""), `${name}: abre la página OFICIAL ${host} en otra pestaña, con https y sin dar acceso a CasaMail`);
  if (name === "Gmail") { await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/c2-pasos.png" }); }
  await pg.click("#cwback"); await pg.waitForSelector(".nuevo-card");
}
await pg.locator(".nuevo-card", { hasText: "Gmail" }).click(); await pg.click("#cwdone"); await pg.waitForSelector("#addpane");
await pg.waitForFunction(() => document.querySelector("#addpane")!.textContent!.includes("Conectar con Google")); ok(true, "Gmail → 'Ya la creé' lleva a conectar con Google (OAuth)");
await pg.click("#mx"); await pg.click("#cfg"); await pg.click("#crearcuenta2"); await pg.waitForSelector(".nuevo-card"); ok(true, "también está en Ajustes → Cuentas → 'Crear un correo nuevo'");
await pg.locator(".nuevo-card", { hasText: "Yahoo" }).click(); await pg.click("#cwdone"); await pg.waitForSelector("#np");
ok((await pg.inputValue("#np")) === "yahoo", "Yahoo → 'Ya la creé' abre el formulario con Yahoo ya elegido");
const link = pg.locator("#pn a"); ok((await link.count()) === 1 && (await link.getAttribute("href"))!.startsWith("https://login.yahoo.com/"), "y enseña dónde crear la contraseña de aplicación de Yahoo");
await pg.waitForTimeout(300); await pg.screenshot({ path: "/tmp/shots-n/c3-yahoo.png" });
await pg.click("#mx"); await pg.click("#cfg"); await pg.click("#crearcuenta2"); await pg.locator(".nuevo-card", { hasText: "iCloud" }).click(); await pg.click("#cwdone"); await pg.waitForSelector("#np"); ok((await pg.inputValue("#np")) === "icloud", "iCloud → formulario con iCloud elegido");
await pg.click("#mx"); await pg.click("#cfg"); await pg.click("#crearcuenta2"); await pg.click("#cwimap"); await pg.waitForSelector("#np"); ok(true, "'Otra cuenta (IMAP)' para correo de un dominio propio");
const mp = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage(); mp.setDefaultTimeout(8000); await mp.goto("http://127.0.0.1:8081/?t=tok");
ok(await mp.locator("#crearcuenta").isVisible().catch(() => false) || (await mp.waitForSelector("#crearcuenta", { state: "visible" }).then(() => true, () => false)), "en el móvil (y en la app Android) la bienvenida con 'Crear correo nuevo' también se ve");
ok(errs.length === 0, "sin errores de JavaScript " + errs.join(" | "));
await b.close(); web.kill(); process.exit(process.exitCode ?? 0);
