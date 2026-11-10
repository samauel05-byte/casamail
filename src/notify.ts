import { EventEmitter } from "node:events";
import * as store from "./store.js";
import * as mail from "./mail.js";
import * as ai from "./ai.js";
import * as cal from "./calendar.js";
import type { Account } from "./store.js";

/**
 * Avisos de CasaMail:
 *  - cada correo nuevo → notificación con un resumen de lo que dice y pide (IA si está conectada; si no, el comienzo del texto);
 *  - si el correo trae una reunión (invitación .ics, o la IA la detecta en el texto) → aviso para agendarla en el calendario;
 *  - recordatorios antes de cada reunión y un resumen de la agenda cada mañana.
 * Todo se genera en TU CasaMail; no pasa por ningún servidor externo.
 */
export interface NotifySettings {
  enabled: boolean; mail: boolean; aiSummary: boolean; meetings: boolean; autoAgenda: boolean;
  reminders: number[]; digest: boolean; digestHour: number;
}
export const DEFAULTS: NotifySettings = { enabled: true, mail: true, aiSummary: true, meetings: true, autoAgenda: false, reminders: cal.DEFAULT_REMINDERS, digest: true, digestHour: 8 };
export const getSettings = (): NotifySettings => ({ ...DEFAULTS, ...store.readJson<Partial<NotifySettings>>("notify.json", {}) });
export function saveSettings(p: Partial<NotifySettings>): NotifySettings {
  const c = { ...getSettings(), ...p };
  const reminders = [...new Set((Array.isArray(c.reminders) ? c.reminders : DEFAULTS.reminders).map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 10080))].sort((a, b) => b - a).slice(0, 6);
  const out: NotifySettings = {
    enabled: !!c.enabled, mail: !!c.mail, aiSummary: !!c.aiSummary, meetings: !!c.meetings, autoAgenda: !!c.autoAgenda, digest: !!c.digest,
    reminders, digestHour: Math.min(23, Math.max(0, Math.round(Number(c.digestHour) || 0))),
  };
  store.writeJson("notify.json", out); return out;
}

export interface Proposal {
  title: string; start: number; end: number; allDay: boolean; location?: string; link?: string; notes?: string;
  via: "ics" | "ia"; icsUid?: string; recurring?: boolean; organizer?: string; status: "pending" | "added" | "dismissed"; eventId?: string;
}
export interface Notif {
  id: number; ts: number; kind: "mail" | "meeting" | "reminder" | "digest" | "system"; title: string; body: string;
  account?: string; folder?: string; uid?: number; eventId?: string; proposal?: Proposal; read: boolean;
}
interface Box { seq: number; items: Notif[] }
const BOX = "notifications.json", MAX_ITEMS = 200;
export const bus = new EventEmitter(); bus.setMaxListeners(100);

const box = (): Box => store.readJson<Box>(BOX, { seq: 0, items: [] });
export function push(n: Omit<Notif, "id" | "ts" | "read">, now = Date.now()): Notif {
  const b = box(), item: Notif = { ...n, id: b.seq + 1, ts: now, read: false };
  b.seq = item.id; b.items = [...b.items, item].slice(-MAX_ITEMS); store.writeJson(BOX, b);
  bus.emit("notify", item); return item;
}
export const list = (after = 0): { items: Notif[]; last: number; unread: number } => { const b = box(); return { items: b.items.filter((n) => n.id > after).reverse(), last: b.seq, unread: b.items.filter((n) => !n.read).length }; };
export const get = (id: number) => box().items.find((n) => n.id === id);
function patch(id: number, fn: (n: Notif) => void) { const b = box(), n = b.items.find((x) => x.id === id); if (!n) return undefined; fn(n); store.writeJson(BOX, b); return n; }
export function markRead(ids: number[] | "all") { const b = box(); for (const n of b.items) if (ids === "all" || ids.includes(n.id)) n.read = true; store.writeJson(BOX, b); }
export const clearAll = () => { const b = box(); store.writeJson(BOX, { seq: b.seq, items: [] }); };
/** Espera (long-poll) hasta que haya avisos nuevos o pase el tiempo. Lo usan la interfaz web y la app Android. */
export function waitFor(after: number, ms: number): Promise<ReturnType<typeof list>> {
  const now = list(after); if (now.items.length || ms <= 0) return Promise.resolve(now);
  return new Promise((resolve) => { const done = () => { clearTimeout(t); bus.off("notify", done); resolve(list(after)); }; const t = setTimeout(done, ms); bus.on("notify", done); });
}

// ---------- reuniones ----------
export type Detection = { kind: "event"; proposal: Proposal } | { kind: "cancel"; icsUid: string; title: string } | null;
const MEETING_HINT = /reuni[oó]n|meeting|\bcita\b|llamada|videollamada|zoom|google meet|teams|agendar|agenda|nos vemos|\bcall\b|invitaci[oó]n|entrevista|quedamos|nos juntamos|convocatoria/i;
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tiempo agotado")), ms))]);
const aiReady = () => store.getAiEngines().length > 0;

/** Busca una reunión en un mensaje: primero la invitación .ics (fiable); si no hay, la IA lee el texto. */
export async function detectMeeting(acc: Account, folder: string, m: mail.FullMessage, o: { ai?: boolean; now?: number } = {}): Promise<Detection> {
  const now = o.now ?? Date.now();
  for (const a of m.attachments) {
    if (!(/calendar|ics/i.test(a.contentType) || /\.ics$/i.test(a.filename)) || a.size > 512 * 1024) continue;
    let ics: cal.IcsResult; try { ics = cal.parseIcs((await mail.getAttachment(acc, folder, m.uid, a.index)).content.toString("utf8")); } catch { continue; }
    const canc = ics.events.find((e) => e.cancelled && e.icsUid); if (canc) return { kind: "cancel", icsUid: canc.icsUid!, title: canc.title };
    const e = ics.events.find((x) => x.end >= now); // la próxima que no haya pasado
    if (e) return { kind: "event", proposal: { title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, link: e.link, notes: e.notes?.slice(0, 1000), via: "ics", icsUid: e.icsUid, recurring: e.recurring, organizer: e.organizer, status: "pending" } };
  }
  if ((o.ai ?? true) && aiReady() && MEETING_HINT.test(`${m.subject}\n${m.text.slice(0, 4000)}`)) {
    try {
      const g = await withTimeout(ai.extractMeeting({ from: m.from, to: m.to, subject: m.subject, date: m.date, text: m.text }, now), 40_000);
      if (g) return { kind: "event", proposal: { title: g.title, start: g.start, end: g.end, allDay: false, location: g.location, link: g.link, via: "ia", status: "pending" } };
    } catch { /* sin IA disponible: simplemente no se detecta */ }
  }
  return null;
}

export function agendar(p: Proposal, source?: cal.CalEvent["source"], now = Date.now()) {
  return cal.addEvent({ title: p.title, start: p.start, end: p.end, allDay: p.allDay, location: p.location, link: p.link, notes: p.notes, source, icsUid: p.icsUid, via: p.via, recurring: p.recurring }, getSettings().reminders, now);
}
/** El usuario pulsa "Agendar" en un aviso (puede corregir título/hora antes). */
export function agendarAviso(id: number, edit: Partial<Pick<Proposal, "title" | "start" | "end" | "location">> = {}, now = Date.now()) {
  const n = get(id); if (!n?.proposal) throw new Error("Este aviso no tiene una reunión");
  const p = { ...n.proposal, ...Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined && v !== "")) } as Proposal;
  if (!(p.end >= p.start)) p.end = p.start + 3600_000;
  const r = agendar(p, n.account ? { account: n.account, folder: n.folder ?? "INBOX", uid: n.uid ?? 0 } : undefined, now);
  patch(id, (x) => { x.proposal = { ...p, status: "added", eventId: r.event.id }; x.read = true; });
  return r.event;
}
export const descartarAviso = (id: number) => patch(id, (x) => { if (x.proposal) x.proposal.status = "dismissed"; x.read = true; });

// ---------- correo nuevo ----------
interface State { accounts: Record<string, { lastUid: number }>; lastDigest?: string; reauth?: Record<string, boolean> }
const state = (): State => store.readJson<State>("notify-state.json", { accounts: {} });
const saveState = (s: State) => store.writeJson("notify-state.json", s);

const nameOf = (from: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from); return (m ? (m[1].trim() || m[2]) : from).trim() || "Remitente desconocido"; };
const addrOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
export function snippet(text: string, n = 180): string {
  const t = text.split(/\r?\n/).filter((l) => !/^\s*>/.test(l)).join(" ").replace(/https?:\/\/\S+/g, "enlace").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t || "(sin texto)";
}

const MAX_INDIVIDUAL = 5, MAX_AI_PER_CYCLE = 3;
let checking = false, lastMail = 0;

export async function checkMail(now = Date.now(), s = getSettings()): Promise<number> {
  if (checking) return 0; checking = true; let pushed = 0;
  try {
    const st = state();
    for (const acc of store.loadAccounts()) {
      try {
        const { messages } = await mail.listMessages(acc, "INBOX", { limit: 20 });
        if (st.reauth?.[acc.id]) { delete st.reauth[acc.id]; }
        const top = messages.reduce((m, x) => Math.max(m, x.uid), 0), prev = st.accounts[acc.id];
        if (!prev || top < prev.lastUid) { st.accounts[acc.id] = { lastUid: top }; saveState(st); continue; } // primera vez (o buzón reiniciado): no avisar de lo que ya estaba
        const fresh = messages.filter((m) => m.uid > prev.lastUid && m.unread && addrOf(m.from) !== acc.email.toLowerCase()).sort((a, b) => a.uid - b.uid);
        st.accounts[acc.id] = { lastUid: Math.max(prev.lastUid, top) }; saveState(st); // se guarda ANTES de avisar: un fallo posterior no repite avisos
        let aiLeft = MAX_AI_PER_CYCLE;
        for (const sm of fresh.slice(0, MAX_INDIVIDUAL)) {
          let full: mail.FullMessage; try { full = await mail.getMessage(acc, "INBOX", sm.uid, false); } catch { continue; }
          let summary = snippet(full.text);
          if (s.aiSummary && aiReady() && aiLeft > 0) { aiLeft--; try { const t = (await withTimeout(ai.notifySummary({ from: full.from, to: full.to, subject: full.subject, date: full.date, text: full.text }), 30_000)).replace(/\s+/g, " ").trim(); if (t) summary = t.length > 320 ? t.slice(0, 319) + "…" : t; } catch { /* se queda el comienzo del texto */ } }
          push({ kind: "mail", title: nameOf(full.from), body: `${full.subject}\n${summary}`, account: acc.id, folder: "INBOX", uid: sm.uid }, now); pushed++;
          if (s.meetings) {
            const d = await detectMeeting(acc, "INBOX", full, { ai: aiLeft > 0 || !s.aiSummary, now }).catch(() => null);
            if (d?.kind === "cancel") { const gone = cal.removeByIcsUid(d.icsUid); if (gone) push({ kind: "meeting", title: "Reunión cancelada", body: `${gone.title} (${cal.when(gone, now)}) se quitó de tu calendario.`, account: acc.id, folder: "INBOX", uid: sm.uid }, now); }
            else if (d?.kind === "event") {
              const p = d.proposal, src = { account: acc.id, folder: "INBOX", uid: sm.uid };
              if (s.autoAgenda && p.via === "ics") { const r = agendar(p, src, now); push({ kind: "meeting", title: "Reunión agendada", body: `${p.title}\n${cal.when(p, now)}${p.location ? " · " + p.location : ""}`, account: acc.id, folder: "INBOX", uid: sm.uid, eventId: r.event.id, proposal: { ...p, status: "added", eventId: r.event.id } }, now); }
              else push({ kind: "meeting", title: p.via === "ics" ? "Te invitan a una reunión" : "Posible reunión en este correo", body: `${p.title}\n${cal.when(p, now)}${p.location ? " · " + p.location : ""}${p.via === "ia" ? "\n(Detectada por Yerleny: revisa la hora antes de agendar)" : ""}`, account: acc.id, folder: "INBOX", uid: sm.uid, proposal: p }, now);
            }
          }
        }
        if (fresh.length > MAX_INDIVIDUAL) { push({ kind: "mail", title: "Más correos nuevos", body: `Y ${fresh.length - MAX_INDIVIDUAL} correos más en ${acc.email}.`, account: acc.id, folder: "INBOX" }, now); pushed++; }
      } catch (e) {
        if ((e as { code?: string }).code === "reauth" || (e as Error).name === "ReauthError") { const r = (st.reauth ??= {}); if (!r[acc.id]) { r[acc.id] = true; saveState(st); push({ kind: "system", title: "Reconecta tu cuenta", body: `${acc.email}: ${(e as Error).message}` }, now); pushed++; } }
        /* sin red o servidor caído: se reintenta en el siguiente ciclo */
      }
    }
  } finally { checking = false; }
  return pushed;
}

// ---------- recordatorios y agenda del día ----------
function left(ms: number) { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${Math.round(m / 1440)} d`; }
const place = (e: cal.CalEvent) => [e.location, e.link].filter(Boolean).join(" · ");

export function checkReminders(now = Date.now(), s = getSettings()): number {
  let n = 0;
  for (const e of cal.listEvents()) {
    if (e.start <= now || e.allDay) continue; // las de todo el día solo salen en la agenda de la mañana
    const due = s.reminders.filter((m) => e.start - m * 60_000 <= now && !e.reminded.includes(m));
    if (!due.length) continue;
    cal.markReminded(e.id, due); // si estuvo apagado y se acumularon varios, se da solo el más cercano
    const mins = Math.round((e.start - now) / 60000);
    const title = mins < 60 ? `Reunión en ${mins} min (${cal.timeText(e.start)})` : cal.dayKey(e.start) === cal.dayKey(now) ? `Reunión hoy a las ${cal.timeText(e.start)} (en ${left(e.start - now)})` : `Reunión ${cal.when(e, now)}`;
    push({ kind: "reminder", title, body: `${e.title}${place(e) ? "\n" + place(e) : ""}`, eventId: e.id, account: e.source?.account, folder: e.source?.folder, uid: e.source?.uid }, now); n++;
  }
  return n;
}

export function checkDigest(now = Date.now(), s = getSettings()): boolean {
  const st = state(), today = cal.dayKey(now);
  if (!s.digest || cal.hourOf(now) < s.digestHour || st.lastDigest === today) return false;
  st.lastDigest = today; saveState(st);
  const tomorrow = cal.dayKey(now + 864e5);
  const evs = cal.between(now, now + 2 * 864e5 + 3600_000);
  const hoy = evs.filter((e) => cal.dayKey(e.start) === today && e.end > now), man = evs.filter((e) => cal.dayKey(e.start) === tomorrow);
  if (!hoy.length && !man.length) return false;
  const line = (e: cal.CalEvent) => `${e.allDay ? "Todo el día" : cal.timeText(e.start)} · ${e.title}`;
  const body = [hoy.length ? `Hoy:\n${hoy.map(line).join("\n")}` : "", man.length ? `Mañana:\n${man.map(line).join("\n")}` : ""].filter(Boolean).join("\n");
  push({ kind: "digest", title: hoy.length ? `Hoy tienes ${hoy.length} ${hoy.length === 1 ? "reunión" : "reuniones"}` : `Mañana tienes ${man.length} ${man.length === 1 ? "reunión" : "reuniones"}`, body }, now);
  return true;
}

const MAIL_EVERY = () => Number(process.env.CASAMAIL_NOTIFY_EVERY_MS ?? 60_000);
/** Se llama cada pocos segundos desde el servidor. Los recordatorios son baratos; el correo se consulta cada minuto. */
export async function tick(now = Date.now()) {
  const s = getSettings(); if (!s.enabled) return;
  checkReminders(now, s); checkDigest(now, s);
  if (s.mail && now - lastMail >= MAIL_EVERY()) { lastMail = now; await checkMail(now, s); }
}
