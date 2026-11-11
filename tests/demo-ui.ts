// Modo demostración (?demo): la app funciona con datos de ejemplo y SIN servidor de correo. Uso: PW_PATH=... npx tsx tests/demo-ui.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-uidemo-"));
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8084", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1", CASAMAIL_NO_WARMUP: "1" }, stdio: "inherit" });
process.on("exit", () => web.kill()); await new Promise((r) => setTimeout(r, 3500));
const ok = (c: unknown, m: string) => { console.log(c ? "  ✔" : "  ✘", m); if (!c) process.exitCode = 1; };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } }); const pg = await ctx.newPage(); pg.setDefaultTimeout(12000); pg.on("dialog", (d) => d.accept());
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message)); const real: string[] = []; pg.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) real.push(u.pathname); });
await pg.goto("http://127.0.0.1:8084/?t=tok#demo"); await pg.waitForSelector(".m");
ok((await pg.locator(".m").count()) >= 8, "la bandeja muestra correos de ejemplo sin cuenta ni servidor");
ok(await pg.locator("#demobar").isVisible(), "se ve el aviso 'Modo demostración'");
await pg.waitForTimeout(400); await pg.screenshot({ path: "/tmp/shots-n/d1-demo.png" });
await pg.locator(".m", { hasText: "Propuesta de diseño" }).first().click(); await pg.waitForSelector(".vsub"); ok((await pg.textContent("#view"))!.includes("tres opciones de portada"), "se abre un correo y se lee su contenido");
await pg.click("#ais"); await pg.waitForSelector(".card-ai pre"); ok((await pg.textContent(".card-ai pre"))!.includes("Resumen"), "Yerleny resume (respuesta de ejemplo)");
await pg.click("#st"); await pg.waitForTimeout(300); ok(await pg.locator(".m.on .star").count() >= 0, "se puede destacar un correo");
await pg.click("#new"); await pg.fill("#to", "marta@estudio.es"); await pg.fill("#sub", "Prueba"); await pg.fill("#body", "Hola, esto es una prueba."); await pg.click("#send"); await pg.waitForSelector(".toast"); ok((await pg.textContent(".toast"))!.includes("bandeja de salida"), "redactar y enviar: queda en la bandeja de salida con plazo para retirarlo");
await pg.click("[data-cal]"); await pg.waitForSelector(".calev"); ok((await pg.locator(".calev").count()) === 2, "el calendario muestra las reuniones de ejemplo"); await pg.click("#cx");
await pg.click("#bell"); await pg.waitForSelector("#npanel .nrow"); ok((await pg.locator("#npanel .nrow").count()) === 2, "el panel de avisos muestra un correo y una invitación"); await pg.screenshot({ path: "/tmp/shots-n/d2-avisos.png" });
await pg.click('[data-a="agendar"]'); await pg.waitForSelector("#evt"); await pg.click("#evok"); await pg.waitForTimeout(300); ok(true, "se puede 'Agendar' la invitación de ejemplo");
ok(real.length === 0, `ninguna llamada /api sale a un servidor: todo es de ejemplo (${real.length} llamadas reales)`);
// Igual que lo sirve la app Android: https://appassets.androidplatform.net/demo/… desde sus recursos, y 404 para todo lo demás (sin red)
{
  const mt: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css", png: "image/png", svg: "image/svg+xml" };
  const ap = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage(); ap.setDefaultTimeout(12000); const aerrs: string[] = []; ap.on("pageerror", (e) => aerrs.push(e.message)); const blocked: string[] = [];
  await ap.route("**/*", (route) => {
    const u = new URL(route.request().url()); const rel = u.pathname.replace(/^\/demo\//, "");
    if (u.origin !== "https://appassets.androidplatform.net" || !u.pathname.startsWith("/demo/") || rel.includes("..")) { blocked.push(u.href); return route.fulfill({ status: 404, body: "" }); }
    const f = path.join(process.cwd(), "public", rel); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: mt[f.split(".").pop()!] ?? "application/octet-stream", body: fs.readFileSync(f) });
  });
  await ap.goto("https://appassets.androidplatform.net/demo/index.html?demo=1"); await ap.waitForSelector(".m");
  ok((await ap.locator(".m").count()) >= 8, "como en la app Android (recursos locales, sin red): la bandeja de ejemplo se ve en el móvil");
  await ap.locator(".m").first().click(); await ap.waitForSelector(".vsub"); ok(true, "y se puede abrir un correo");
  ok(blocked.length === 0 && aerrs.length === 0, `nada intentó salir a internet y sin errores (${blocked.length} bloqueadas) ${aerrs.join(" | ")}`);
  await ap.waitForTimeout(300); await ap.screenshot({ path: "/tmp/shots-n/d3-android-demo.png" });
}
ok(errs.length === 0, "sin errores de JavaScript " + errs.join(" | "));
await b.close(); web.kill(); process.exit(process.exitCode ?? 0);
