// Capturas de teléfono para Google Play (1080×1920) con el modo demostración. Uso: OUT=android/play PW_PATH=... npx tsx tests/play-shots.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn } from "node:child_process";
process.env.CASAMAIL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cm-playshots-"));
const OUT = process.env.OUT ?? "android/play"; fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import(process.env.PW_PATH ?? "playwright");
const web = spawn("node", ["--import", "tsx", "src/web.ts"], { env: { ...process.env, PORT: "8086", CASAMAIL_TOKEN: "tok", CASAMAIL_NO_OPEN: "1", CASAMAIL_NO_WARMUP: "1" }, stdio: "ignore" });
process.on("exit", () => web.kill()); await new Promise((r) => setTimeout(r, 3500));
const b = await chromium.launch();
const mk = async (scheme: "light" | "dark") => { const c = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: scheme }); const p = await c.newPage(); p.setDefaultTimeout(12000); await p.goto("http://127.0.0.1:8086/?t=tok#demo"); await p.waitForSelector(".m"); await p.waitForTimeout(500); await p.evaluate(() => document.getElementById("demobar")?.remove()); return p; };
const shot = async (p: any, n: string) => { await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("  📸", n); };
const pg = await mk("light");
await shot(pg, "play-1-bandeja");
await pg.locator(".m", { hasText: "Propuesta de diseño" }).first().click(); await pg.waitForSelector(".vsub"); await shot(pg, "play-2-mensaje");
await pg.click("#ais"); await pg.waitForSelector(".card-ai pre"); await shot(pg, "play-3-yerleny-resumen");
await pg.click("#back"); await pg.click("#bell"); await pg.waitForSelector("#npanel .nrow"); await shot(pg, "play-4-avisos");
await pg.evaluate(() => (document as any).querySelector("#bell").click()); await pg.click("#menu"); await pg.click("[data-cal]"); await pg.waitForSelector(".calev"); await shot(pg, "play-5-calendario");
const dk = await mk("dark"); await shot(dk, "play-6-oscuro");
await b.close(); web.kill(); process.exit(0);
