// Confirmaciones de lectura (MDN) recibidas: guarda, por Message-ID del correo que enviaste, cuándo y quién lo marcó como leído.
import * as store from "./store.js";

const FILE = "receipts.json";
export interface Receipt { readAt: string; by: string }
type Store = Record<string, Receipt>;

const norm = (id: string) => id.trim().replace(/[<>]/g, "").toLowerCase();

export function record(originalMessageId: string, r: Receipt): void {
  if (!originalMessageId) return;
  const a = store.readJson<Store>(FILE, {});
  const k = norm(originalMessageId);
  if (a[k]) return; // ya registrada (nos quedamos con la primera lectura)
  a[k] = r;
  // tope: no crecer sin límite
  const keys = Object.keys(a);
  if (keys.length > 5000) { for (const old of keys.slice(0, keys.length - 5000)) delete a[old]; }
  store.writeJson(FILE, a);
}

export function get(originalMessageId: string | null | undefined): Receipt | null {
  if (!originalMessageId) return null;
  return store.readJson<Store>(FILE, {})[norm(originalMessageId)] ?? null;
}
