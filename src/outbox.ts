import crypto from "node:crypto";
import { readJson, writeJson, getAccount, getSettings } from "./store.js";
import { sendMessage, type Outgoing } from "./mail.js";

/** Plazo máximo para retirar un mensaje: 10 minutos. Pasado ese tiempo ya no se puede. */
export const MAX_RECALL_MS = 10 * 60_000;

export interface QueueItem {
  id: string; account: string; payload: Outgoing;
  kind: "outbox" | "scheduled"; // outbox = retirable hasta sendAt; scheduled = programado por el usuario
  createdAt: number; sendAt: number; sending?: boolean; error?: string;
}

const FILE = "scheduled.json";
const load = () => readJson<QueueItem[]>(FILE, []);
const save = (l: QueueItem[]) => writeJson(FILE, l);
/** Lectura-modificación-escritura SIN awaits en medio: en Node es atómica respecto a cancelaciones concurrentes. */
const mutate = (fn: (l: QueueItem[]) => QueueItem[]) => save(fn(load()));

export function sendDelayMs(): number {
  const m = getSettings().sendDelayMin;
  const min = m === undefined ? 10 : Math.min(Math.max(Number(m) || 0, 0), 10);
  return min * 60_000;
}

export function enqueue(account: string, payload: Outgoing, o: { sendAt?: number; delayMs?: number } = {}): QueueItem {
  const now = Date.now();
  const scheduled = o.sendAt !== undefined;
  const item: QueueItem = {
    id: crypto.randomUUID(), account, payload, kind: scheduled ? "scheduled" : "outbox", createdAt: now,
    sendAt: scheduled ? o.sendAt! : now + Math.min(o.delayMs ?? sendDelayMs(), MAX_RECALL_MS),
  };
  mutate((l) => [...l, item]);
  return item;
}

export const list = () => load().map((i) => ({
  id: i.id, kind: i.kind, to: i.payload.to, subject: i.payload.subject, sendAt: i.sendAt, error: i.error,
  canCancel: !i.sending && i.sendAt > Date.now(),
}));

/** Retira un mensaje. Solo si aún no llegó su hora de envío: después de eso ya no es posible. */
export function cancel(id: string): { ok: true } | { ok: false; reason: string } {
  const item = load().find((i) => i.id === id);
  if (!item) return { ok: false, reason: "El mensaje ya fue enviado (o no existe): no se puede retirar." };
  if (item.sending || item.sendAt <= Date.now()) return { ok: false, reason: "Pasó el plazo: el mensaje ya se está enviando y no se puede retirar." };
  mutate((l) => l.filter((i) => i.id !== id));
  return { ok: true };
}

/** "Enviar ahora": adelanta el envío; desde ese momento ya no se puede retirar. */
export function sendNow(id: string) {
  mutate((l) => l.map((i) => (i.id === id && !i.sending ? { ...i, sendAt: Date.now() } : i)));
}

let running = false;
/** Envía lo que ya venció. Cada paso que toca el archivo es síncrono para no pisar cancelaciones. */
export async function tick(): Promise<number> {
  if (running) return 0; running = true; let sent = 0;
  try {
    for (const due of load().filter((i) => !i.sending && i.sendAt <= Date.now())) {
      let mine = false;
      mutate((l) => l.map((i) => { if (i.id === due.id && !i.sending) { mine = true; return { ...i, sending: true }; } return i; }));
      if (!mine) continue; // lo retiraron justo antes
      try {
        await sendMessage(getAccount(due.account), due.payload);
        mutate((l) => l.filter((i) => i.id !== due.id)); sent++;
      } catch (e) {
        // reintento en 5 min; mientras tanto el usuario puede verlo y cancelarlo
        mutate((l) => l.map((i) => (i.id === due.id ? { ...i, sending: false, sendAt: Date.now() + 5 * 60_000, error: (e as Error).message } : i)));
      }
    }
  } finally { running = false; }
  return sent;
}
