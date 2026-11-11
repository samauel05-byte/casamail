import crypto from "node:crypto";
import * as store from "./store.js";

/** Calendario propio de CasaMail: se guarda en tu equipo (calendar.json) y se exporta en formato .ics (Google, Outlook, Apple…). */
export interface CalEvent {
  id: string; title: string; start: number; end: number; allDay: boolean;
  location?: string; link?: string; notes?: string;
  source?: { account: string; folder: string; uid: number };
  icsUid?: string; via: "ics" | "ia" | "manual"; recurring?: boolean;
  reminded: number[]; // avisos (minutos antes) ya dados
  created: number;
}
const FILE = "calendar.json";
export const DEFAULT_REMINDERS = [1440, 60, 10];

export const listEvents = (): CalEvent[] => store.readJson<CalEvent[]>(FILE, []).sort((a, b) => a.start - b.start);
const save = (l: CalEvent[]) => store.writeJson(FILE, l);

export const between = (from: number, to: number) => listEvents().filter((e) => e.end > from && e.start < to);

/** Añade un evento. Si ya existe el mismo (mismo UID de invitación, o mismo título y hora) lo actualiza en vez de duplicarlo. */
export function addEvent(e: Omit<CalEvent, "id" | "created" | "reminded">, reminders: number[] = DEFAULT_REMINDERS, now = Date.now()): { event: CalEvent; duplicate: boolean } {
  const list = listEvents();
  const same = list.find((x) => (e.icsUid && x.icsUid === e.icsUid) || (x.title.trim().toLowerCase() === e.title.trim().toLowerCase() && x.start === e.start));
  // Los avisos que ya habrían pasado al crearlo no se disparan de golpe: solo los que aún están por venir.
  const reminded = reminders.filter((m) => e.start - m * 60_000 <= now);
  if (same) { Object.assign(same, { ...e, id: same.id, created: same.created, reminded: e.start === same.start ? same.reminded : reminded }); save(list); return { event: same, duplicate: true }; }
  const ev: CalEvent = { ...e, id: crypto.randomBytes(6).toString("hex"), created: now, reminded };
  list.push(ev); save(list); return { event: ev, duplicate: false };
}
export function updateEvent(id: string, patch: Partial<CalEvent>, reminders: number[] = DEFAULT_REMINDERS, now = Date.now()): CalEvent {
  const list = listEvents(), ev = list.find((x) => x.id === id); if (!ev) throw new Error("Evento no encontrado");
  const moved = patch.start !== undefined && patch.start !== ev.start;
  Object.assign(ev, patch, { id: ev.id });
  if (moved) ev.reminded = reminders.filter((m) => ev.start - m * 60_000 <= now); // cambió la hora: los avisos se calculan de nuevo
  save(list); return ev;
}
export function removeEvent(id: string): boolean { const l = listEvents(), n = l.filter((x) => x.id !== id); save(n); return n.length !== l.length; }
export function removeByIcsUid(uid: string): CalEvent | undefined { const l = listEvents(), f = l.find((x) => x.icsUid === uid); if (f) save(l.filter((x) => x !== f)); return f; }
export function markReminded(id: string, mins: number[]) { const l = listEvents(), ev = l.find((x) => x.id === id); if (!ev) return; ev.reminded = [...new Set([...ev.reminded, ...mins])]; save(l); }

// ---------- fechas legibles ----------
export const tz = () => process.env.CASAMAIL_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es", { timeZone: tz(), ...o }).format(ms);
export const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(ms); // aaaa-mm-dd
export const hourOf = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "2-digit", hour12: false }).format(ms)) % 24;
export const timeText = (ms: number) => fmt(ms, { hour: "2-digit", minute: "2-digit" });
export const dateText = (ms: number) => fmt(ms, { weekday: "long", day: "numeric", month: "long" });

/** "hoy a las 15:00", "mañana a las 09:30", "el martes 12 de noviembre a las 15:00" */
export function when(e: Pick<CalEvent, "start" | "allDay">, now = Date.now()): string {
  const today = dayKey(now), tomorrow = dayKey(now + 864e5);
  const day = dayKey(e.start) === today ? "hoy" : dayKey(e.start) === tomorrow ? "mañana" : `el ${dateText(e.start)}`;
  return e.allDay ? `${day} (todo el día)` : `${day} a las ${timeText(e.start)}`;
}

// ---------- ICS (iCalendar) ----------
export interface IcsEvent { title: string; start: number; end: number; allDay: boolean; location?: string; link?: string; notes?: string; icsUid?: string; recurring: boolean; organizer?: string; cancelled: boolean }
export interface IcsResult { method: string; events: IcsEvent[] }

const unesc = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const MEET = /https?:\/\/(?:[\w-]+\.)?(?:zoom\.us|zoomgov\.com|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|webex\.com|gotomeet\.me|jit\.si|meet\.jit\.si)\/[^\s<>"')]+/i;
export const findMeetingLink = (t: string) => MEET.exec(t)?.[0]?.replace(/[.,;]+$/, "");

/** Hora de pared en una zona horaria → milisegundos UTC. */
function zonedToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): number | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const off = (t: number) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(t).map((x) => [x.type, x.value]));
      return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - t;
    };
    let t = guess - off(guess); t = guess - off(t); return t;
  } catch { return null; } // zona desconocida (p. ej. nombres de Windows)
}
/** Fecha y hora escritas en la zona horaria del usuario → ms UTC. */
export const wallToMs = (y: number, mo: number, d: number, h: number, mi: number) => zonedToMs(y, mo, d, h, mi, 0, tz()) ?? new Date(y, mo - 1, d, h, mi).getTime();
function icsDate(value: string, params: string): { ms: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(value.trim()); if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!m[4]) return { ms: zonedToMs(y, mo, d, 0, 0, 0, tz()) ?? new Date(y, mo - 1, d).getTime(), allDay: true };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  const tzid = /TZID=([^;:]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, "");
  return { ms: (tzid && zonedToMs(y, mo, d, h, mi, s, tzid)) || zonedToMs(y, mo, d, h, mi, s, tz()) || new Date(y, mo - 1, d, h, mi, s).getTime(), allDay: false };
}
function icsDuration(v: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim()); if (!m) return null;
  return ((Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0)) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1000;
}

export function parseIcs(raw: string): IcsResult {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: IcsResult = { method: "PUBLISH", events: [] };
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur?.DTSTART) {
        const s = icsDate(cur.DTSTART.value, cur.DTSTART.params);
        if (s) {
          let end = cur.DTEND ? icsDate(cur.DTEND.value, cur.DTEND.params)?.ms : undefined;
          if (end === undefined) { const dur = cur.DURATION ? icsDuration(cur.DURATION.value) : null; end = s.ms + (dur ?? (s.allDay ? 86400_000 : 3600_000)); }
          const loc = cur.LOCATION ? unesc(cur.LOCATION.value) : undefined, desc = cur.DESCRIPTION ? unesc(cur.DESCRIPTION.value) : undefined, url = cur.URL?.value;
          out.events.push({
            title: unesc(cur.SUMMARY?.value ?? "(sin título)"), start: s.ms, end: Math.max(end, s.ms), allDay: s.allDay, location: loc, notes: desc,
            link: (url && /^https?:/i.test(url) ? url : undefined) ?? findMeetingLink(`${loc ?? ""} ${desc ?? ""}`),
            icsUid: cur.UID?.value, recurring: !!cur.RRULE, organizer: cur.ORGANIZER ? cur.ORGANIZER.value.replace(/^mailto:/i, "") : undefined,
            cancelled: /CANCELLED/i.test(cur.STATUS?.value ?? ""),
          });
        }
      }
      cur = null; continue;
    }
    if (/^METHOD:/i.test(line)) { out.method = line.slice(7).trim().toUpperCase(); continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), name = head.split(";")[0].toUpperCase();
    if (!(name in cur)) cur[name] = { params: head.slice(name.length), value: line.slice(i + 1) };
  }
  if (out.method === "CANCEL") for (const e of out.events) e.cancelled = true;
  return out;
}

const icsStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDay = (ms: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms).map((x) => [x.type, x.value])); return `${p.year}${p.month}${p.day}`; };
const fold = (l: string) => { const b = Buffer.from(l); if (b.length <= 74) return l; const parts: string[] = []; let s = l; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; parts.push(s.slice(0, n)); s = " " + s.slice(n); } parts.push(s); return parts.join("\r\n"); };

export function toIcs(events: CalEvent[]): string {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CasaMail//ES", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.icsUid ?? e.id + "@casamail"}`, `DTSTAMP:${icsStamp(e.created)}`);
    if (e.allDay) L.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(Math.max(e.end, e.start + 864e5))}`);
    else L.push(`DTSTART:${icsStamp(e.start)}`, `DTEND:${icsStamp(e.end)}`);
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    const desc = [e.notes, e.link && `Enlace: ${e.link}`].filter(Boolean).join("\n"); if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
    if (e.link) L.push(`URL:${e.link}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR"); return L.map(fold).join("\r\n") + "\r\n";
}
