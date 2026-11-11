import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Aviso de versiones nuevas: consulta la última publicación (Release) de CasaMail en GitHub y compara con la versión instalada.
 * Solo se envía una petición HTTPS a GitHub, sin ningún dato del usuario. Se puede desactivar con CASAMAIL_NO_UPDATE_CHECK=1.
 */
const REPO = "samauel05-byte/casamail";
export const releasesUrl = () => process.env.CASAMAIL_UPDATE_URL ?? `https://api.github.com/repos/${REPO}/releases/latest`;

export function currentVersion(): string {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version as string; } catch { return "0.0.0"; }
}
/** Compara versiones tipo "0.3.10" > "0.3.9" (ignora el prefijo "v" y sufijos como -beta). */
export function cmp(a: string, b: string): number {
  const n = (v: string) => v.replace(/^v/i, "").split("-")[0].split(".").map((x) => parseInt(x, 10) || 0);
  const x = n(a), y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

export interface UpdateInfo { current: string; latest: string; newer: boolean; url: string; notes: string; assets: { name: string; url: string }[] }
let cache: { at: number; info: UpdateInfo | null } | null = null;

export async function check(force = false, now = Date.now()): Promise<UpdateInfo | null> {
  if (process.env.CASAMAIL_NO_UPDATE_CHECK === "1") return null;
  if (!force && cache && now - cache.at < 6 * 3600_000) return cache.info;
  let info: UpdateInfo | null = null;
  try {
    const r = await fetch(releasesUrl(), { headers: { Accept: "application/vnd.github+json", "User-Agent": "CasaMail" }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = (await r.json()) as { tag_name?: string; html_url?: string; body?: string; draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string }[] };
      if (j.tag_name && !j.draft && !j.prerelease) {
        const cur = currentVersion();
        info = { current: cur, latest: j.tag_name.replace(/^v/i, ""), newer: cmp(j.tag_name, cur) > 0, url: j.html_url ?? `https://github.com/${REPO}/releases/latest`, notes: (j.body ?? "").slice(0, 1500), assets: (j.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })) };
      }
    }
  } catch { /* sin internet o GitHub no responde: se reintenta más tarde */ }
  cache = { at: now, info };
  return info;
}
export const resetUpdateCache = () => { cache = null; };
