import { EventEmitter } from "node:events";
import type { ImapFlow } from "imapflow";
import * as store from "./store.js";
import * as mail from "./mail.js";
import * as notify from "./notify.js";

/**
 * Correo en tiempo real. Para cada cuenta se mantiene una conexión propia en espera (IMAP IDLE) sobre la bandeja de entrada:
 * el servidor avisa en el acto de un correo nuevo, uno borrado o un cambio de estado (leído en otro dispositivo), y CasaMail
 * actualiza la interfaz y manda el aviso en ~1 segundo, en vez de esperar al siguiente sondeo (1–2 minutos).
 * Si el servidor no admite IDLE o la conexión se cae, se reconecta sola con esperas crecientes; el sondeo sigue de respaldo.
 */
export const changes = new EventEmitter(); changes.setMaxListeners(100);
let seq = 0;
export const lastSeq = () => seq;
/** Espera (long-poll) hasta que cambie algo en algún buzón o pase el tiempo. Devuelve las cuentas afectadas. */
export function waitChange(since: number, ms: number): Promise<{ seq: number; accounts: string[] }> {
  const pending = pendingSince(since); if (pending.length || ms <= 0) return Promise.resolve({ seq, accounts: pending });
  return new Promise((resolve) => { const done = () => { clearTimeout(t); changes.off("change", done); resolve({ seq, accounts: pendingSince(since) }); }; const t = setTimeout(done, ms); changes.on("change", done); });
}
const log: { seq: number; account: string }[] = [];
const pendingSince = (since: number) => [...new Set(log.filter((x) => x.seq > since).map((x) => x.account))];
function emit(account: string) { seq++; log.push({ seq, account }); if (log.length > 200) log.shift(); changes.emit("change", { seq, account }); }

interface W { fp: string; stop: () => void }
const watchers = new Map<string, W>();
const DEBOUNCE_MS = Number(process.env.CASAMAIL_IDLE_DEBOUNCE_MS ?? 250);

function watch(acc: store.Account): W {
  let stopped = false, client: ImapFlow | null = null, timer: NodeJS.Timeout | undefined, fails = 0, deb: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      mail.invalidateFolders(acc.id); // los contadores de carpetas ya no valen
      emit(acc.id);
      const s = notify.getSettings(); if (s.enabled && s.mail) notify.checkMail(Date.now(), s, acc.id).catch(() => {});
    }, DEBOUNCE_MS);
  };
  const loop = async () => {
    while (!stopped) {
      try {
        client = await mail.openImap(store.getAccount(acc.id));
        client.on("exists", changed); client.on("expunge", changed); client.on("flags", changed);
        await client.mailboxOpen("INBOX", { readOnly: true }); // solo escucha: no marca nada como leído; imapflow entra en IDLE por sí solo
        fails = 0; changed(); // al (re)conectar se revisa lo que pudo llegar mientras no se vigilaba
        // IDLE explícito y renovado en bucle (se reinicia solo cada pocos minutos para que el servidor no lo corte)
        while (!stopped && client.usable) await client.idle();
      } catch { fails++; }
      try { client?.close(); } catch { /* ya cerrada */ } client = null;
      if (stopped) return;
      await new Promise((r) => { timer = setTimeout(r, Math.min(120_000, 2000 * 2 ** Math.min(fails, 6))); timer.unref?.(); });
    }
  };
  loop();
  return { fp: mail.fingerprint(acc), stop: () => { stopped = true; clearTimeout(timer); clearTimeout(deb); try { client?.logout().catch(() => client?.close()); } catch { /* ya cerrada */ } } };
}

/** Pone o quita vigilantes según las cuentas actuales (se llama al arrancar y cada vez que cambian las cuentas). */
export function sync() {
  const accs = store.loadAccounts(), ids = new Set(accs.map((a) => a.id));
  for (const [id, w] of watchers) if (!ids.has(id)) { w.stop(); watchers.delete(id); }
  for (const a of accs) { const cur = watchers.get(a.id), fp = mail.fingerprint(a); if (cur && cur.fp === fp) continue; cur?.stop(); watchers.set(a.id, watch(a)); }
}
export function stopAll() { for (const w of watchers.values()) w.stop(); watchers.clear(); }
