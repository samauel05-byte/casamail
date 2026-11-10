import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Endpoint { host: string; port: number; secure: boolean }
export type OAuthProvider = "google" | "microsoft";
export interface OAuthInfo {
  provider: OAuthProvider; clientId: string; clientSecret?: string; tenant?: string;
  refreshToken: string; accessToken?: string; expiresAt?: number;
}
export interface Account {
  id: string;
  email: string;
  user: string;
  pass: string; // vacío en cuentas OAuth
  oauth?: OAuthInfo;
  imap: Endpoint;
  smtp: Endpoint;
}

export const PRESETS: Record<string, { imap: Endpoint; smtp: Endpoint; note?: string }> = {
  gmail:   { imap: { host: "imap.gmail.com", port: 993, secure: true }, smtp: { host: "smtp.gmail.com", port: 465, secure: true }, note: "Requiere contraseña de aplicación (verificación en 2 pasos)." },
  outlook: { imap: { host: "outlook.office365.com", port: 993, secure: true }, smtp: { host: "smtp.office365.com", port: 587, secure: false }, note: "Microsoft puede exigir OAuth en cuentas personales/empresa." },
  yahoo:   { imap: { host: "imap.mail.yahoo.com", port: 993, secure: true }, smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true }, note: "Requiere contraseña de aplicación." },
  icloud:  { imap: { host: "imap.mail.me.com", port: 993, secure: true }, smtp: { host: "smtp.mail.me.com", port: 587, secure: false }, note: "Requiere contraseña específica de app." },
  fastmail:{ imap: { host: "imap.fastmail.com", port: 993, secure: true }, smtp: { host: "smtp.fastmail.com", port: 465, secure: true } },
  zoho:    { imap: { host: "imap.zoho.com", port: 993, secure: true }, smtp: { host: "smtp.zoho.com", port: 465, secure: true } },
};

const dir = process.env.CASAMAIL_HOME ?? path.join(os.homedir(), ".casamail");
export const dataDir = dir;
const file = path.join(dir, "accounts.json");

export function loadAccounts(): Account[] {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return []; }
}

function save(accounts: Account[]) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}

export function addAccount(a: Account) {
  const all = loadAccounts().filter((x) => x.id !== a.id);
  all.push(a);
  save(all);
}

/** Actualiza una cuenta de forma atómica (lectura-modificación-escritura síncrona). */
export function updateAccount(id: string, fn: (a: Account) => Account) {
  const all = loadAccounts();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return;
  all[i] = fn(all[i]);
  save(all);
}

export function removeAccount(id: string) {
  save(loadAccounts().filter((x) => x.id !== id));
}

export function getAccount(id?: string): Account {
  const all = loadAccounts();
  if (!all.length) throw new Error("No hay cuentas configuradas. Ejecuta: npm run cli -- add");
  if (!id) return all[0];
  const a = all.find((x) => x.id === id || x.email === id);
  if (!a) throw new Error(`Cuenta no encontrada: ${id}. Disponibles: ${all.map((x) => x.id).join(", ")}`);
  return a;
}

/** Construye una cuenta desde un preset o endpoints manuales. */
export function buildAccount(o: {
  id?: string; email: string; pass: string; user?: string; preset?: string;
  imap?: Partial<Endpoint>; smtp?: Partial<Endpoint>;
}): Account {
  const domain = o.email.split("@")[1] ?? "";
  const p = o.preset ? PRESETS[o.preset] : undefined;
  if (o.preset && !p) throw new Error(`Preset desconocido: ${o.preset}`);
  const imap: Endpoint = { host: o.imap?.host ?? p?.imap.host ?? `imap.${domain}`, port: o.imap?.port ?? p?.imap.port ?? 993, secure: o.imap?.secure ?? p?.imap.secure ?? true };
  const smtp: Endpoint = { host: o.smtp?.host ?? p?.smtp.host ?? `smtp.${domain}`, port: o.smtp?.port ?? p?.smtp.port ?? 465, secure: o.smtp?.secure ?? p?.smtp.secure ?? true };
  return { id: o.id ?? o.email.split("@")[0], email: o.email, user: o.user ?? o.email, pass: o.pass, imap, smtp };
}

// ---------- almacenamiento JSON genérico (ajustes, contactos, programados…) ----------
export function readJson<T>(name: string, def: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { return def; }
}
export function writeJson(name: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export interface Settings { signatures: Record<string, string>; sendDelayMin?: number; archiveDir?: string }
export const getSettings = (): Settings => readJson("settings.json", { signatures: {} });
export const saveSettings = (s: Settings) => writeJson("settings.json", s);

// contactos aprendidos de los correos vistos/enviados
export function learnContacts(list: string[]) {
  const c = readJson<Record<string, { name: string; n: number }>>("contacts.json", {});
  for (const raw of list) {
    for (const part of raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(part) ?? /^\s*()([^\s<>,]+@[^\s<>,]+)\s*$/.exec(part);
      if (!m) continue;
      const email = m[2].toLowerCase();
      c[email] = { name: m[1].trim() || c[email]?.name || "", n: (c[email]?.n ?? 0) + 1 };
    }
  }
  writeJson("contacts.json", c);
}
export function searchContacts(q: string, limit = 8) {
  const c = readJson<Record<string, { name: string; n: number }>>("contacts.json", {});
  const s = q.toLowerCase();
  return Object.entries(c).filter(([e, v]) => e.includes(s) || v.name.toLowerCase().includes(s))
    .sort((a, b) => b[1].n - a[1].n).slice(0, limit).map(([email, v]) => ({ email, name: v.name }));
}

// ---------- IA ----------
export type AiProvider = "openai" | "anthropic" | "local";
export interface AiConfig { provider: AiProvider; baseUrl: string; apiKey: string; model: string; preset?: string; id?: string }
export interface AiPreset { provider: AiProvider; baseUrl: string; model: string; needsKey: boolean; free?: boolean; signup?: string; note?: string }
/**
 * Proveedores. "free" = tiene capa gratuita (con límites de uso que el proveedor puede cambiar).
 * Los modelos gratuitos cambian a menudo: la app los DETECTA en vivo en lugar de fiarse de estos valores por defecto.
 */
export const AI_PRESETS: Record<string, AiPreset> = {
  local:      { provider: "local", baseUrl: "", model: "qwen2.5-1.5b", needsKey: false, free: true, note: "Motor integrado en la app: gratis, sin cuenta, sin clave y 100 % privado (funciona sin internet)." },
  gemini:     { provider: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash", needsKey: true, free: true, signup: "https://aistudio.google.com/apikey", note: "Capa gratuita de Google AI Studio (sin tarjeta)." },
  groq:       { provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", needsKey: true, free: true, signup: "https://console.groq.com/keys", note: "Capa gratuita de Groq, muy rápida." },
  openrouter: { provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free", needsKey: true, free: true, signup: "https://openrouter.ai/keys", note: "Modelos con sufijo :free, con límites diarios." },
  cerebras:   { provider: "openai", baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b", needsKey: true, free: true, signup: "https://cloud.cerebras.ai/", note: "Capa gratuita de Cerebras." },
  ollama:     { provider: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.1", needsKey: false, free: true, note: "Ollama instalado en tu equipo (gratis y privado)." },
  lmstudio:   { provider: "openai", baseUrl: "http://localhost:1234/v1", model: "local-model", needsKey: false, free: true },
  anthropic:  { provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5-5", needsKey: true },
  openai:     { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", needsKey: true },
  deepseek:   { provider: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true },
  mistral:    { provider: "openai", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", needsKey: true },
  custom:     { provider: "openai", baseUrl: "", model: "", needsKey: false },
};
export const aiValid = (c: Partial<AiConfig> | null | undefined): c is AiConfig => !!c && !!c.provider && !!c.model && (c.provider === "local" || !!c.baseUrl);
const newEngineId = () => "e" + Math.random().toString(36).slice(2, 9);

/** Motores de IA en orden de uso: si uno falla (límite gratuito agotado, sin red…), Yerleny prueba el siguiente. */
export function getAiEngines(): AiConfig[] {
  const raw = readJson<{ engines?: AiConfig[] } & Partial<AiConfig> | null>("ai.json", null);
  if (!raw) return [];
  const list = Array.isArray(raw.engines) ? raw.engines : [raw as AiConfig]; // formato anterior: un solo motor
  const engines = list.filter(aiValid).map((e) => ({ ...e, id: e.id ?? newEngineId() }));
  if (process.env.CASAMAIL_AI_KEY && engines[0]) engines[0].apiKey = process.env.CASAMAIL_AI_KEY;
  return engines;
}
export const saveAiEngines = (list: AiConfig[]) => writeJson("ai.json", { engines: list.filter(aiValid).map((e) => ({ ...e, id: e.id ?? newEngineId() })) });
export const getAiConfig = (): AiConfig | null => getAiEngines()[0] ?? null;
/** Define el motor principal (los de respaldo se conservan). */
export function saveAiConfig(c: AiConfig) {
  const rest = getAiEngines().slice(1);
  saveAiEngines([{ ...c, id: c.id ?? getAiEngines()[0]?.id }, ...rest]);
}

// ---------- credenciales de la app OAuth (Client ID que registra el usuario) ----------
export interface OAuthClients { google?: { clientId: string; clientSecret?: string }; microsoft?: { clientId: string; clientSecret?: string; tenant?: string } }
export const getOAuthClients = (): OAuthClients => readJson("oauth-clients.json", {});
export const saveOAuthClients = (c: OAuthClients) => writeJson("oauth-clients.json", c);

// ---------- Yerleny: perfil y memoria local de la IA de CasaMail ----------
export interface YerlenyProfile { userName?: string; tone?: string; language?: string; notes: string[] }
const oneLine = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export function cleanYerleny(y: Partial<YerlenyProfile>): YerlenyProfile {
  const notes = (Array.isArray(y.notes) ? y.notes : []).map((n) => oneLine(n, 300)).filter(Boolean);
  return { userName: oneLine(y.userName, 60) || undefined, tone: oneLine(y.tone, 80) || undefined, language: oneLine(y.language, 40) || undefined, notes: [...new Set(notes)].slice(-40) };
}
export const getYerleny = (): YerlenyProfile => cleanYerleny(readJson<Partial<YerlenyProfile>>("yerleny.json", {}));
export const saveYerleny = (y: Partial<YerlenyProfile>) => writeJson("yerleny.json", cleanYerleny(y));
export function addYerlenyNote(note: string): YerlenyProfile { const y = getYerleny(); saveYerleny({ ...y, notes: [...y.notes, note] }); return getYerleny(); }
export function removeYerlenyNote(i: number): YerlenyProfile { const y = getYerleny(); saveYerleny({ ...y, notes: y.notes.filter((_, k) => k !== i) }); return getYerleny(); }
