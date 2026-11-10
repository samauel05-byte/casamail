// Prueba de la aplicación de escritorio (Electron) con una pantalla virtual:
//   npx tsc && PW_PATH=<playwright> xvfb-run -a npx tsx tests/desktop.ts [ruta-al-ejecutable-empaquetado]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "casamail-desk-"));
const HOME = process.env.CASAMAIL_HOME;
process.env.CASAMAIL_OAUTH_MOCK = "http://127.0.0.1:1300";
const { startImap, startSmtp, startFakeAi, startMockOAuth } = await import("./servers.js");
const store = await import("../src/store.js");
const pw = await import(process.env.PW_PATH ?? "playwright");
const electron = pw._electron;
const imapSrv = startImap(); startSmtp(); startFakeAi(); startMockOAuth(imapSrv as never);
store.addAccount(store.buildAccount({ id: "t", email: "yo@casa.test", pass: "secreto", user: "yo", imap: { host: "127.0.0.1", port: 1143, secure: false }, smtp: { host: "127.0.0.1", port: 1025, secure: false } }));
fs.writeFileSync(path.join(HOME, "desktop.json"), JSON.stringify({ background: true, hintShown: true })); // modo "seguir en segundo plano"

let bad = 0;
const check = (name: string, c: boolean) => { console.log(c ? "  ✔" : "  ✘", name); if (!c) bad++; };
const packaged = process.argv[2];
const root = path.resolve(import.meta.dirname, "..");
const launch = () => electron.launch(packaged
  ? { executablePath: packaged, args: ["--no-sandbox"], env: { ...process.env, CASAMAIL_HOME: HOME } as Record<string, string> }
  : { executablePath: path.join(root, "node_modules/electron/dist/electron"), args: ["--no-sandbox", root], cwd: root, env: { ...process.env, CASAMAIL_HOME: HOME } as Record<string, string> });

const app = await launch();
const win = await app.firstWindow();
await win.waitForSelector(".m", { timeout: 30000 });
check("la app arranca y muestra la bandeja en su propia ventana", (await win.locator(".m").count()) >= 1);
check("título de la ventana: CasaMail", (await win.title()) === "CasaMail");
const url = win.url();
check("sirve desde 127.0.0.1 (solo este equipo)", url.startsWith("http://127.0.0.1:"));
await new Promise((r) => setTimeout(r, 600)); await win.screenshot({ path: process.env.SHOT ?? "/tmp/desktop.png" }).catch(() => {});
check("el logo de CasaMail está en la cabecera", (await win.locator("#logomark svg").count()) === 1);
check("no tiene Node.js expuesto a la página (aislamiento)", await win.evaluate(() => typeof (window as unknown as { require?: unknown }).require === "undefined" && typeof (window as unknown as { process?: unknown }).process === "undefined"));
check("candado del planificador tomado por la app", fs.existsSync(path.join(HOME, "scheduler.lock")));

await app.evaluate(({ shell }) => { (globalThis as unknown as { opened: string[] }).opened = []; shell.openExternal = async (u: string) => { (globalThis as unknown as { opened: string[] }).opened.push(u); }; });
// Registro de errores: archivo local con datos sensibles ocultos
const logFile = path.join(HOME, "logs", "casamail.log"), appVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version as string;
const logText = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "");
check(`el registro existe y anota el inicio con las versiones (CasaMail ${appVersion})`, logText().includes("Inicio |") && logText().includes(`CasaMail ${appVersion}`) && logText().includes("Servidor local en"));
await win.evaluate(() => console.error("fallo-de-prueba clave sk-abcdefghijklmnopqrstuvwxyz enlace /?t=" + "c".repeat(48)));
await win.evaluate(async () => { await fetch("/api/archive/import-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "secreto-relativo.pst" }) }); });
await new Promise((r) => setTimeout(r, 600));
check("un error de la interfaz queda registrado, con la clave y el token ocultos", logText().includes("[interfaz]") && logText().includes("fallo-de-prueba") && !logText().includes("sk-abcdefghij") && !logText().includes("c".repeat(48)));
check("un error de la API queda registrado (ruta y motivo, sin el cuerpo de la petición)", logText().includes("[api] POST /api/archive/import-path") && logText().includes("ruta completa") && !logText().includes("secreto-relativo"));
await app.evaluate(({ dialog }) => { (globalThis as unknown as { errBox: string[] }).errBox = []; dialog.showErrorBox = ((t: string, c: string) => { (globalThis as unknown as { errBox: string[] }).errBox.push(t, c); }) as never; process.emit("uncaughtException" as never, new Error("boom-de-prueba") as never); });
await new Promise((r) => setTimeout(r, 300));
const errBox = await app.evaluate(() => (globalThis as unknown as { errBox: string[] }).errBox);
check("una excepción inesperada se registra y avisa mostrando dónde está el registro", logText().includes("uncaughtException") && logText().includes("boom-de-prueba") && errBox[1].includes("casamail.log"));
check("los volcados de fallos nativos se guardan en este equipo (no se envían)", (await app.evaluate(({ app: a }) => a.getPath("crashDumps"))) === path.join(HOME, "logs", "crashes"));
const ayuda = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label === "Ayuda")?.submenu?.items.map((i) => i.label).filter(Boolean));
check("menú Ayuda: abrir registros, copiar diagnóstico y acerca de", JSON.stringify(ayuda) === JSON.stringify(["Abrir carpeta de registros", "Copiar información de diagnóstico", "Acerca de CasaMail"]));
await app.evaluate(({ shell, Menu }) => { (globalThis as unknown as { opened2: string }).opened2 = ""; shell.openPath = (async (p: string) => { (globalThis as unknown as { opened2: string }).opened2 = p; return ""; }) as never; Menu.getApplicationMenu()!.items.find((i) => i.label === "Ayuda")!.submenu!.items[0].click(); });
check("'Abrir carpeta de registros' abre la carpeta correcta", (await app.evaluate(() => (globalThis as unknown as { opened2: string }).opened2)) === path.join(HOME, "logs"));
const clip = await app.evaluate(({ Menu, clipboard }) => { Menu.getApplicationMenu()!.items.find((i) => i.label === "Ayuda")!.submenu!.items[1].click(); return clipboard.readText(); });
check("'Copiar información de diagnóstico' deja en el portapapeles versiones, sistema y últimas líneas", clip.includes(`CasaMail ${appVersion}`) && clip.includes("Electron") && clip.includes("últimas líneas") && !clip.includes("c".repeat(48)));

// Archivo local: selector nativo -> token de un solo uso -> importación SIN copiar el archivo
const bridge = await win.evaluate(() => Object.keys((window as unknown as { casamailDesktop?: object }).casamailDesktop ?? {}).sort());
check("el puente seguro solo expone los dos selectores nativos", JSON.stringify(bridge) === JSON.stringify(["pickFolder", "pickImportFile"]));
const importVia = async (file: string, folder: string) => {
  await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as never; }, file);
  const pick = await win.evaluate(() => (window as unknown as { casamailDesktop: { pickImportFile(): Promise<{ token: string; name: string; size: number }> } }).casamailDesktop.pickImportFile());
  const post = (t: string) => win.evaluate(async ({ t, folder }) => (await fetch("/api/archive/import-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, folder }) })).json(), { t, folder });
  const first = await post(pick.token) as { job?: string; error?: string };
  let job: { state: string; added: number; processed: number } = { state: "running", added: 0, processed: 0 };
  for (let i = 0; i < 120 && job.state === "running"; i++) { await new Promise((r) => setTimeout(r, 250)); job = await win.evaluate(async (id) => (await fetch(`/api/archive/jobs/${id}`)).json(), first.job!); }
  const second = await post(pick.token) as { error?: string };
  return { pick, first, job, second };
};
const mb = path.join(HOME, "muestra.mbox");
fs.writeFileSync(mb, "From - Mon Mar  2 09:00:00 2026\nFrom: a@x.com\nTo: b@y.com\nSubject: Desde escritorio\nDate: Mon, 02 Mar 2026 09:00:00 +0000\n\nHola\n");
const r1 = await importVia(mb, "Escritorio");
check("el selector nativo devuelve un token (no la ruta) y el tamaño", !!r1.pick.token && !JSON.stringify(r1.pick).includes(HOME) && r1.pick.size > 50 && r1.pick.name === "muestra.mbox");
check("importa desde su ubicación: SQLite integrado funciona dentro de Electron", r1.job.state === "done" && r1.job.added === 1);
check("el token es de un solo uso y el original no se borra", /caducó/.test(r1.second.error ?? "") && fs.existsSync(mb));
if (process.env.PST_SAMPLE && fs.existsSync(process.env.PST_SAMPLE)) {
  const r2 = await importVia(process.env.PST_SAMPLE, "PSTDesktop");
  check("PST/OST real importado desde la app de escritorio (13 correos)", r2.job.state === "done" && r2.job.added === 13);
}

// Motor de IA integrado dentro de Electron (necesita el modelo ya descargado: LLM_DIR=/carpeta/con/el/modelo)
if (process.env.LLM_DIR && fs.existsSync(process.env.LLM_DIR)) {
  const mdir = path.join(HOME, "models"); fs.mkdirSync(mdir, { recursive: true });
  const gguf = fs.readdirSync(process.env.LLM_DIR).find((x) => /1\.5b.*\.gguf$/.test(x))!; fs.symlinkSync(path.join(process.env.LLM_DIR, gguf), path.join(mdir, gguf));
  fs.writeFileSync(path.join(mdir, "qwen2.5-1.5b.json"), JSON.stringify({ path: path.join(mdir, gguf), files: [path.join(mdir, gguf)], size: 1, at: Date.now() }));
  store.saveAiEngines([{ provider: "local", baseUrl: "", apiKey: "", model: "qwen2.5-1.5b", preset: "local" }]);
  const st = await win.evaluate(async () => (await fetch("/api/ai/local")).json()) as { available: boolean; models: { id: string; ready: boolean }[] };
  check("el motor integrado está disponible dentro de la app instalada (librería nativa cargada)", st.available && st.models.find((m) => m.id === "qwen2.5-1.5b")!.ready);
  const t0 = Date.now(); const r = await win.evaluate(async () => (await fetch("/api/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()) as { reply?: string; error?: string };
  check(`el motor integrado responde dentro de Electron (${((Date.now() - t0) / 1000).toFixed(1)} s)`, r.reply === "OK");
}

// OAuth: la autorización de Google se abre en el navegador del sistema y la conexión se completa en la app
await win.click("#cfg"); await win.click('[data-add="google"]'); await win.waitForSelector("#ocid");
await win.fill("#ocid", "mock-client"); await win.fill("#ocs", "shh");
await app.evaluate(() => { (globalThis as unknown as { opened: string[] }).opened = []; });
await win.click("#ogo");
await win.waitForFunction(() => document.body.textContent!.includes("Esperando tu autorización"), null, { timeout: 10000 });
const oauthUrl = (await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).find((u) => u.startsWith("http://127.0.0.1:1300/authorize"));
check("OAuth: la autorización se abre en el navegador del sistema (no en la app)", !!oauthUrl && (await app.windows()).length === 1);
if (oauthUrl) {
  const r = await fetch(oauthUrl, { redirect: "manual" });            // lo que haría el navegador tras iniciar sesión
  const back = await fetch(r.headers.get("location")!);              // ...y volver al callback de la app
  check("OAuth: el callback local confirma la conexión", (await back.text()).includes("Cuenta conectada"));
  await win.waitForFunction(() => [...document.querySelectorAll(".toast .tmsg")].some((e) => e.textContent!.includes("conectada")), null, { timeout: 15000 });
  check("OAuth: la app detecta la cuenta conectada", true);
}

// enlaces externos: nunca dentro de la app, siempre en el navegador del sistema
await win.evaluate(() => { window.open("https://accounts.google.com/x"); });
await win.evaluate(() => { const a = document.createElement("a"); a.href = "https://example.com/y"; a.target = "_self"; document.body.appendChild(a); a.click(); });
await win.evaluate(() => { window.open("file:///etc/passwd"); window.open("javascript:alert(1)"); });
await new Promise((r) => setTimeout(r, 800));
const opened = await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened);
check("enlaces https externos van al navegador del sistema", opened.includes("https://accounts.google.com/x") && opened.includes("https://example.com/y"));
check("file:// y javascript: se bloquean", !opened.some((u) => u.startsWith("file:") || u.startsWith("javascript:")));
check("la ventana de la app no salió de CasaMail", win.url().startsWith("http://127.0.0.1:") && (await app.windows()).length === 1);

// segunda instancia: no abre otra app, devuelve el foco a la primera
const { spawn } = await import("node:child_process");
const second = spawn(packaged ?? path.join(root, "node_modules/electron/dist/electron"), packaged ? ["--no-sandbox"] : ["--no-sandbox", root], { env: { ...process.env, CASAMAIL_HOME: HOME }, stdio: "ignore" });
const code = await new Promise<number | null>((r) => { second.on("exit", r); setTimeout(() => r(-999), 15000); });
check("una segunda CasaMail no se abre (instancia única)", code !== -999);
if (code === -999) second.kill();

// cerrar la ventana: sigue en segundo plano (envíos programados) y "Salir" la cierra limpiamente
await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
await new Promise((r) => setTimeout(r, 800));
const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length);
check("al cerrar la ventana la app sigue en segundo plano", visible === 0 && fs.existsSync(path.join(HOME, "scheduler.lock")));
await app.evaluate(({ app: a }) => { a.quit(); });
await new Promise((r) => setTimeout(r, 2500));
check("'Salir' cierra el servidor y suelta el candado", !fs.existsSync(path.join(HOME, "scheduler.lock")));
console.log(bad ? `\n${bad} fallos` : "\nDESKTOP OK");
try { await app.close(); } catch { /* ya cerrada */ }
process.exit(bad ? 1 : 0);
