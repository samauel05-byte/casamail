import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dataDir } from "./store.js";
import type { Msg, ToolDef, ToolCall } from "./ai.js";

/**
 * Motor de IA integrado en CasaMail: modelos abiertos (Apache-2.0) que corren en TU equipo.
 * Gratis, sin cuenta, sin clave, sin internet (salvo para descargar el modelo una vez) y 100 % privado.
 * Es más limitado que Claude/GPT/Gemini: sirve para resumir, redactar, reescribir y tareas sencillas.
 * Se carga solo al usarlo y se libera de la memoria tras 10 minutos sin uso.
 */
export interface LocalModel { id: string; label: string; uri: string; bytes: number; ramGB: number; license: string; blurb: string }
export const MODELS: LocalModel[] = [
  { id: "qwen2.5-1.5b", label: "Rápido · Qwen2.5 1.5B", uri: "hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF/qwen2.5-1.5b-instruct-q4_k_m.gguf", bytes: 1_117_320_736, ramGB: 3, license: "Apache-2.0", blurb: "Ligero: funciona en casi cualquier equipo. Bien para resumir, redactar y traducir." },
  { id: "qwen2.5-7b", label: "Potente · Qwen2.5 7B", uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf", bytes: 4_680_000_000, ramGB: 8, license: "Apache-2.0", blurb: "Mucho mejor calidad y asistente más fiable, pero necesita ~8 GB de RAM libres y es más lento en CPU." },
];
const byId = (id: string) => { const m = MODELS.find((x) => x.id === id); if (!m) throw new Error(`Modelo desconocido: ${id}`); return m; };
export const modelsDir = () => process.env.CASAMAIL_MODELS || path.join(dataDir, "models");
const marker = (id: string) => path.join(modelsDir(), `${id}.json`);

// ---------- librería nativa (opcional: si no está disponible en este sistema, el resto de CasaMail sigue funcionando) ----------
type Lib = typeof import("node-llama-cpp");
let lib: Lib | null = null, libError = "";
async function loadLib(): Promise<Lib> {
  if (lib) return lib;
  try { lib = await import("node-llama-cpp"); return lib; }
  catch (e) { libError = (e as Error).message; throw new Error("El motor integrado no está disponible en este sistema: " + libError); }
}

interface Marker { path: string; files: string[]; size: number; at: number }
const readMarker = (id: string): Marker | null => { try { return JSON.parse(fs.readFileSync(marker(id), "utf8")); } catch { return null; } };
export const isReady = (id: string) => { const m = readMarker(id); return !!m && fs.existsSync(m.path); };

// ---------- descarga del modelo (una vez) ----------
interface Dl { state: "idle" | "downloading" | "done" | "error" | "cancelled"; id?: string; downloaded: number; total: number; error?: string; startedAt?: number }
let dl: Dl = { state: "idle", downloaded: 0, total: 0 };
let cancelDl: (() => void) | null = null;
export const downloadStatus = (): Dl => ({ ...dl });

export async function startDownload(id: string): Promise<void> {
  const m = byId(id);
  if (dl.state === "downloading") throw new Error("Ya hay una descarga en curso.");
  const nl = await loadLib();
  fs.mkdirSync(modelsDir(), { recursive: true, mode: 0o700 });
  try { const st = fs.statfsSync(modelsDir()); const free = Number(st.bavail) * Number(st.bsize); if (free < m.bytes * 1.15) throw new Error(`No hay espacio: el modelo ocupa ${(m.bytes / 1e9).toFixed(1)} GB y quedan ${(free / 1e9).toFixed(1)} GB libres.`); } catch (e) { if ((e as Error).message.startsWith("No hay espacio")) throw e; }
  dl = { state: "downloading", id, downloaded: 0, total: m.bytes, startedAt: Date.now() };
  const downloader = await nl.createModelDownloader({
    modelUri: m.uri, dirPath: modelsDir(), showCliProgress: false, skipExisting: true,
    onProgress: ({ totalSize, downloadedSize }) => { dl.downloaded = downloadedSize; if (totalSize) dl.total = totalSize; },
  });
  cancelDl = () => { void downloader.cancel({ deleteTempFile: false }); };
  void downloader.download().then((file) => {
    const prefix = path.basename(file).replace(/-\d{5}-of-\d{5}\.gguf$/, "").replace(/\.gguf$/, "");
    const files = fs.readdirSync(modelsDir()).filter((f) => f.startsWith(prefix)).map((f) => path.join(modelsDir(), f));
    fs.writeFileSync(marker(id), JSON.stringify({ path: file, files, size: files.reduce((n, f) => n + fs.statSync(f).size, 0), at: Date.now() } satisfies Marker));
    dl = { ...dl, state: "done", downloaded: dl.total };
  }, (e: Error) => { dl = { ...dl, state: dl.state === "cancelled" ? "cancelled" : "error", error: e.message }; }).finally(() => { cancelDl = null; });
}
export function cancelDownload() { if (dl.state === "downloading") { dl.state = "cancelled"; cancelDl?.(); } }
export async function removeModel(id: string) {
  byId(id); if (engine?.id === id) await disposeEngine();
  const m = readMarker(id); if (m) for (const f of m.files) { try { fs.unlinkSync(f); } catch { /* ya no está */ } }
  try { fs.unlinkSync(marker(id)); } catch { /* ya no está */ }
}

export async function localStatus() {
  let available = true, error = "";
  try { await loadLib(); } catch (e) { available = false; error = (e as Error).message; }
  const ramGB = Math.round(os.totalmem() / 2 ** 30);
  // El modelo potente solo se recomienda con aceleración por GPU (p. ej. Mac con chip M): en CPU tarda ~90 s en tareas del asistente.
  let gpu: string | false = false;
  if (available) { try { const nl = await loadLib(); llamaInst ??= await nl.getLlama({ build: "never", progressLogs: false, logLevel: nl.LlamaLogLevel.error }); gpu = llamaInst.gpu || false; } catch { /* sin dato: CPU */ } }
  return {
    available, error, ramGB, gpu, dir: modelsDir(), recommended: gpu && ramGB >= 14 ? "qwen2.5-7b" : "qwen2.5-1.5b", download: downloadStatus(),
    models: MODELS.map((m) => ({ ...m, ready: isReady(m.id), fits: ramGB >= m.ramGB })),
  };
}

// ---------- motor en memoria ----------
interface Engine { id: string; model: import("node-llama-cpp").LlamaModel; ctx: import("node-llama-cpp").LlamaContext; lastUse: number }
let engine: Engine | null = null, llamaInst: import("node-llama-cpp").Llama | null = null, queue: Promise<unknown> = Promise.resolve();
async function disposeEngine() { const e = engine; engine = null; if (e) { try { await e.ctx.dispose(); await e.model.dispose(); } catch { /* ya liberado */ } } }
setInterval(() => { if (engine && Date.now() - engine.lastUse > 10 * 60_000) void disposeEngine(); }, 60_000).unref();

async function ensure(id: string): Promise<Engine> {
  if (engine?.id === id) { engine.lastUse = Date.now(); return engine; }
  await disposeEngine();
  const m = readMarker(id);
  if (!m || !fs.existsSync(m.path)) throw new Error(`El modelo "${id}" aún no está descargado. Descárgalo en Ajustes → Yerleny.`);
  const nl = await loadLib();
  llamaInst ??= await nl.getLlama({ build: "never", progressLogs: false, logLevel: nl.LlamaLogLevel.error });
  const model = await llamaInst.loadModel({ modelPath: m.path });
  const ctx = await model.createContext({ contextSize: 8192 });
  return (engine = { id, model, ctx, lastUse: Date.now() });
}

type Item = { type: "system"; text: string } | { type: "user"; text: string } | { type: "model"; response: (string | { type: "functionCall"; name: string; params: unknown; result: unknown })[] };
/** Convierte el historial de CasaMail (mensajes, llamadas a herramientas y resultados) al formato del motor. */
export function toHistory(system: string, messages: Msg[]): Item[] {
  const h: Item[] = [{ type: "system", text: system }];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") h.push({ type: "user", text: m.text });
    else if (m.role === "assistant") {
      const next = messages[i + 1], results = next?.role === "tool" ? next.results : [];
      const response: Extract<Item, { type: "model" }>["response"] = [];
      if (m.text) response.push(m.text);
      for (const tc of m.toolCalls ?? []) response.push({ type: "functionCall", name: tc.name, params: tc.args, result: results.find((r) => r.id === tc.id)?.content ?? "" });
      h.push({ type: "model", response: response.length ? response : [""] });
      if (next?.role === "tool") i++;
    }
  }
  return h;
}

export function localChat(modelId: string, o: { system: string; messages: Msg[]; tools?: ToolDef[]; maxTokens?: number; temperature?: number }): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const run = async () => {
    const e = await ensure(modelId), nl = await loadLib();
    const chat = new nl.LlamaChat({ contextSequence: e.ctx.getSequence() });
    try {
      const functions = o.tools?.length ? Object.fromEntries(o.tools.map((t) => [t.name, { description: t.description, params: t.parameters }])) : undefined;
      const r = (await chat.generateResponse(toHistory(o.system, o.messages) as never, {
        ...(functions ? { functions: functions as never, maxParallelFunctionCalls: 1 } : {}), // una llamada cada vez: que espere el resultado antes de seguir
        maxTokens: o.maxTokens ?? 1024, temperature: o.temperature ?? 0.4,
        repeatPenalty: { penalty: 1.18, frequencyPenalty: 0.2, presencePenalty: 0.1, lastTokens: 128 }, // los modelos pequeños tienden a entrar en bucles
      })) as unknown as { response: string; functionCalls?: { functionName: string; params?: unknown }[] };
      e.lastUse = Date.now();
      return { text: r.response.trim(), toolCalls: (r.functionCalls ?? []).map((c, i): ToolCall => ({ id: `lc${Date.now()}_${i}`, name: c.functionName, args: (c.params ?? {}) as Record<string, unknown> })) };
    } finally { chat.dispose({ disposeSequence: true }); }
  };
  const p = queue.then(run, run); // un solo motor: las peticiones se atienden de una en una
  queue = p.catch(() => undefined);
  return p;
}
export const shutdownLocal = () => disposeEngine();
