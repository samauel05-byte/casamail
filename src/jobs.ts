import crypto from "node:crypto";

/** Tareas largas en segundo plano (importar, mover al archivo, exportar) con progreso consultable. */
export interface Job {
  id: string; type: "import" | "offload"; label: string; state: "running" | "done" | "error" | "cancelled";
  progress: number; processed: number; total: number; added: number; skipped: number; failed: number; deleted: number;
  detail: string; errors: string[]; startedAt: number; finishedAt?: number; cancel: boolean;
}
const jobs = new Map<string, Job>();

export function startJob(type: Job["type"], label: string, run: (j: Job) => Promise<void>): Job {
  const j: Job = { id: crypto.randomUUID(), type, label, state: "running", progress: 0, processed: 0, total: 0, added: 0, skipped: 0, failed: 0, deleted: 0, detail: "", errors: [], startedAt: Date.now(), cancel: false };
  jobs.set(j.id, j);
  for (const [k, v] of jobs) if (jobs.size > 25 && v.state !== "running") jobs.delete(k); // conserva solo las recientes
  void run(j).then(() => { j.state = j.cancel ? "cancelled" : "done"; if (j.state === "done") j.progress = 1; }, (e) => { j.state = "error"; j.errors.push((e as Error).message); }).finally(() => { j.finishedAt = Date.now(); });
  return j;
}
export const getJob = (id: string) => jobs.get(id);
export const listJobs = () => [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
export const cancelJob = (id: string) => { const j = jobs.get(id); if (j && j.state === "running") j.cancel = true; return !!j; };
export const activeCount = () => [...jobs.values()].filter((j) => j.state === "running").length;
