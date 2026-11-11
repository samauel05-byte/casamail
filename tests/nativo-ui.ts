// App Android independiente: pantalla "Iniciar sesión / Crear cuenta" y flujo de inicio de sesión, con un puente nativo simulado (el motor real se prueba en android/test/CorreoTest.java).
// Uso: PW_PATH=... npx tsx tests/nativo-ui.ts
import fs from "node:fs"; import path from "node:path";
const pw: any = await import(process.env.PW_PATH ?? "playwright"); const chromium = pw.chromium ?? pw.default.chromium;
const ok = (c: unknown, m: string) => { console.log(c ? "  ✔" : "  ✘", m); if (!c) process.exitCode = 1; };
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true })).newPage(); pg.setDefaultTimeout(12000);
const errs: string[] = []; pg.on("pageerror", (e) => errs.push(e.message)); const ext: string[] = [];
const mt: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css", png: "image/png", svg: "image/svg+xml" };
await pg.route("**/*", (route) => {
  const u = new URL(route.request().url()); const rel = u.pathname.replace(/^\/demo\//, "");
  if (u.origin !== "https://appassets.androidplatform.net" || !u.pathname.startsWith("/demo/") || rel.includes("..")) { ext.push(u.href); return route.fulfill({ status: 404, body: "" }); }
  const f = path.join(process.cwd(), "public", rel); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ status: 200, contentType: mt[f.split(".").pop()!] ?? "application/octet-stream", body: fs.readFileSync(f) });
});
// puente nativo simulado: sin cuentas hasta iniciar sesión
await pg.addInitScript("window.__name = (f) => f;");   // esbuild (tsx) inserta __name en las funciones que se serializan
await pg.addInitScript(() => {
  const w = window as any; w.llamadas = []; let cuenta: string | null = null;
  w.CasaNative = { llamar(id: number, m: string, u: string, body: string) {
    w.llamadas.push([m, u, body]); const r = (s: number, j: unknown) => setTimeout(() => w.__casaRes(id, s, JSON.stringify(j)), 5);
    if (u.startsWith("/api/accounts") && m === "POST") { const d = JSON.parse(body); if (d.pass === "mala") return r(401, { error: "Contraseña incorrecta. Gmail pide una contraseña de aplicación.", code: "reauth" }); cuenta = d.email; return r(200, { ok: true }); }
    if (u.startsWith("/api/accounts")) return r(200, cuenta ? [{ id: "yo_gmail_com", email: cuenta, auth: "password" }] : []);
    if (u.startsWith("/api/detect")) return r(200, { conocido: true, id: "gmail", imapHost: "imap.gmail.com", imapPuerto: 993, smtpHost: "smtp.gmail.com", smtpPuerto: 465, nota: "Gmail necesita una contraseña de aplicación.", enlaceClaveApp: "https://myaccount.google.com/apppasswords" });
    if (u.startsWith("/api/settings")) return r(200, { signatures: {}, sendDelayMin: 10 });
    if (u.startsWith("/api/send-delay")) return r(200, { minutes: 10 });
    if (u.startsWith("/api/archive/stats")) return r(200, { messages: 0 });
    if (u.startsWith("/api/folders")) return r(200, [{ path: "INBOX", name: "Recibidos", specialUse: "\\Inbox", total: 1, unread: 1 }]);
    if (u.startsWith("/api/messages")) return r(200, { total: 1, next: null, messages: [{ uid: 1, subject: "Hola desde el móvil", from: "Ana <ana@x.com>", to: "yo@gmail.com", date: new Date().toISOString(), unread: true, starred: false, hasAttachments: false }] });
    return r(200, {});
  } };
});
await pg.goto("https://appassets.androidplatform.net/demo/index.html"); await pg.waitForTimeout(1500); if (process.env.DBG) { console.log(errs, ext, (await pg.locator("body").innerText()).slice(0, 400)); } await pg.waitForSelector("#nlogin");
ok(await pg.locator("#nlogin").isVisible() && await pg.locator("#ncrear").isVisible(), "la primera pantalla ofrece 'Iniciar sesión' y 'Crear cuenta'");
ok((await pg.locator("body").innerText()).includes("sin depender de ningún ordenador"), "explica que no hace falta PC");
await pg.screenshot({ path: "/tmp/shots-n/n1-bienvenida.png" });
await pg.click("#ncrear"); await pg.waitForSelector(".nuevo-card"); ok((await pg.locator(".nuevo-card").count()) >= 3, "'Crear cuenta' muestra Gmail, Outlook, Yahoo…"); await pg.click("#cwx");
await pg.click("#nlogin"); await pg.waitForSelector("#nle"); await pg.fill("#nle", "yo@gmail.com");
await pg.waitForSelector("#nlnota a"); ok((await pg.locator("#nlnota").innerText()).includes("contraseña de aplicación"), "al escribir el correo avisa de la contraseña de aplicación y enlaza a dónde crearla");
await pg.fill("#nlw", "mala"); await pg.click("#nlgo"); await pg.waitForSelector("#nlst .err"); ok((await pg.locator("#nlst .err").innerText()).includes("Contraseña incorrecta"), "una contraseña mala muestra el error del servidor");
await pg.screenshot({ path: "/tmp/shots-n/n2-login.png" });
await pg.fill("#nlw", "buena"); await pg.click("#nlgo"); await pg.waitForSelector(".m"); ok((await pg.locator(".m").count()) === 1, "iniciada la sesión, aparece la bandeja con el correo");
const llamadas = await pg.evaluate(() => (window as any).llamadas as string[][]); ok(llamadas.some((l) => l[0] === "POST" && l[1] === "/api/accounts" && JSON.parse(l[2]).email === "yo@gmail.com"), "las llamadas /api van por el puente nativo");
await pg.click("#cfg"); await pg.waitForSelector("#nlogin2"); ok(!(await pg.locator('[data-add="google"]').isVisible()), "en Cuentas no hay OAuth (solo inicio de sesión directo)");
ok(ext.length === 0 && errs.length === 0, `nada sale a internet y sin errores (${ext.join(",")}) ${errs.join(" | ")}`);
await b.close(); process.exit(process.exitCode ?? 0);
