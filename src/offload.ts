import * as archive from "./archive.js";
import { eachSource } from "./mail.js";
import type { Job } from "./jobs.js";
import type { Account } from "./store.js";

export interface OffloadOpts { folder: string; olderThanDays?: number; deleteFromServer: boolean; target?: string }

/**
 * Mueve correo del servidor al Archivo local (para liberar la cuota de la cuenta).
 * Seguridad: por defecto SOLO copia. Si se pide borrar del servidor, solo se borra cada mensaje
 * después de comprobar que quedó guardado y que al releerlo del disco es idéntico al original.
 */
export async function offload(acc: Account, o: OffloadOpts, j: Job, store: Pick<typeof archive, "addMessage"> = archive) {
  const target = archive.cleanFolder(o.target ?? `${acc.email}/${o.folder}`);
  const before = o.olderThanDays ? new Date(Date.now() - o.olderThanDays * 864e5) : undefined;
  j.detail = `${acc.email} · ${o.folder}`;
  await eachSource(acc, o.folder, { before, batch: 10, onTotal: (n) => { j.total = n; }, onDeleted: (n) => { j.deleted += n; }, cancelled: () => j.cancel }, async (items) => {
    const safe: number[] = [];
    for (const it of items) {
      try {
        const r = await store.addMessage(target, it.source, { flags: (it.read ? archive.FLAG_READ : 0) | (it.starred ? archive.FLAG_STAR : 0), source: acc.id });
        r.added ? j.added++ : j.skipped++;
        if (o.deleteFromServer && archive.verify(r.id, it.source)) safe.push(it.uid);
      } catch (e) { j.failed++; if (j.errors.length < 20) j.errors.push(`uid ${it.uid}: ${(e as Error).message}`); }
      j.processed++;
    }
    return o.deleteFromServer ? safe : undefined;
  });
}
