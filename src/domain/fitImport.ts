// Importação de arquivos .FIT (MyWhoosh, Garmin) para treinos do dia. Usada na aba Treino e no botão +.
import { db, upsert } from '../db/db';
import { readFitFile, intensityFrom } from './fit';
import { planFor, plannedTraining } from './rules';
import { shortLabel } from '../lib/dates';
import { toast } from '../state/store';

export async function importFitFiles(files: FileList | File[] | null, ftp?: number): Promise<string | undefined> {
  const list = files ? Array.from(files) : [];
  let last: string | undefined;
  for (const f of list) {
    try {
      const a = await readFitFile(f, ftp);
      // Se o mesmo treino já chegou pelo intervals.icu, o arquivo completa esse registro em vez de duplicar.
      const t0 = new Date(a.startIso).getTime();
      const twin = (await db.records.where('[kind+date]').equals(['workout', a.date]).toArray())
        .find((r: any) => !r.deleted && r.startTime && Math.abs(new Date(r.startTime).getTime() - t0) < 5 * 60_000);
      const id = twin?.id ?? `workout:fit:${a.startIso}`;
      const exists = twin ?? await db.records.get(id);
      const live = (k: string) => db.records.where('kind').equals(k).toArray().then((r: any[]) => r.filter((x) => !x.deleted));
      const [plans, tmpls, extras] = await Promise.all([live('plan'), live('wtemplate'), live('extra')]);
      const planned = plannedTraining(planFor(plans as any, 'training', a.date), a.date, extras as any)
        .map((tid) => (tmpls as any[]).find((t) => t.id === tid)).find((t) => t?.modalityId === a.modalityId);
      await upsert('workout', id, {
        date: a.date, modalityId: (exists as any)?.classChecked ? (exists as any).modalityId : a.modalityId, duration: a.minutes, intensity: intensityFrom(a.metrics),
        distanceKm: a.metrics.distanceKm, metrics: a.metrics, startTime: a.startIso, fileName: f.name,
        templateId: (exists as any)?.classChecked ? (exists as any).templateId : planned?.id, fromPlan: (exists as any)?.classChecked ? true : !!planned
      });
      last = a.date;
      toast(exists ? `Treino de ${shortLabel(a.date)} atualizado` : `Treino de ${shortLabel(a.date)} importado`);
    } catch (e: any) {
      toast(`${f.name}: ${e?.message ?? 'não consegui ler o arquivo.'}`, undefined, 'error');
    }
  }
  // Musculação no horário de uma aula (LPO) vira a aula.
  try { const { reconcileClasses } = await import('./classes'); await reconcileClasses(); } catch { /* */ }
  return last;
}
