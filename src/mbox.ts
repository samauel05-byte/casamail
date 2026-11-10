import fs from "node:fs";

/**
 * Formato MBOX (variante mboxrd): un solo archivo con muchos mensajes, que importan Thunderbird, Apple Mail,
 * Outlook (con herramientas de importación) y casi cualquier cliente. Lectura en streaming: no carga el archivo entero.
 */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const asctime = (d: Date) => `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()}`;

/** Un mensaje como entrada MBOX: línea "From …", cuerpo con las líneas "From " escapadas, y una línea en blanco final. */
export function mboxEntry(eml: Buffer, date?: Date | null, sender = "MAILER-DAEMON"): Buffer {
  let s = eml.toString("latin1").replace(/^(>*From )/gm, ">$1");
  if (!s.endsWith("\n")) s += "\n";
  const who = sender.replace(/\s+/g, "_") || "MAILER-DAEMON";
  const when = date && !Number.isNaN(date.getTime()) ? date : new Date();
  return Buffer.from(`From ${who} ${asctime(when)}\n${s}\n`, "latin1");
}

const FROM = Buffer.from("From ");
const isSeparator = (line: Buffer) => line.length > 6 && line.subarray(0, 5).equals(FROM) && /^From \S+/.test(line.subarray(0, 200).toString("latin1"));

function finish(parts: Buffer[]): Buffer | null {
  if (!parts.length) return null;
  let s = Buffer.concat(parts).toString("latin1").replace(/^>(>*From )/gm, "$1");
  s = s.replace(/\r?\n$/, ""); // la línea en blanco que se añade antes del siguiente "From "
  return s.trim().length < 10 ? null : Buffer.from(s, "latin1");
}

/** Lee un archivo MBOX por streaming y devuelve cada mensaje (RFC 822) por separado. */
export async function* readMbox(file: string, onBytes?: (n: number) => void): AsyncGenerator<Buffer> {
  const rs = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  let carry: Buffer = Buffer.alloc(0), cur: Buffer[] = [], seen = false;
  for await (const chunk of rs as AsyncIterable<Buffer>) {
    onBytes?.(chunk.length);
    const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let pos = 0;
    for (;;) {
      const nl = buf.indexOf(10, pos);
      if (nl < 0) break;
      const line = buf.subarray(pos, nl + 1); pos = nl + 1;
      if (isSeparator(line)) { const m = finish(cur); cur = []; seen = true; if (m) yield m; continue; }
      if (seen) cur.push(line);
    }
    carry = Buffer.from(buf.subarray(pos)); // copia: no retiene el bloque grande
  }
  if (carry.length) { if (isSeparator(carry)) { const m = finish(cur); cur = []; seen = true; if (m) yield m; } else if (seen) cur.push(carry); }
  const last = finish(cur);
  if (last) yield last;
}
