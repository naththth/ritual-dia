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
      const id = `workout:fit:${a.startIso}`;
      const exists = await db.records.get(id);
      const live = (k: string) => db.records.where('kind').equals(k).toArray().then((r: any[]) => r.filter((x) => !x.deleted));
      const [plans, tmpls] = await Promise.all([live('plan'), live('wtemplate')]);
      const planned = plannedTraining(planFor(plans as any, 'training', a.date), a.date)
        .map((tid) => (tmpls as any[]).find((t) => t.id === tid)).find((t) => t?.modalityId === a.modalityId);
      await upsert('workout', id, {
        date: a.date, modalityId: a.modalityId, duration: a.minutes, intensity: intensityFrom(a.metrics),
        distanceKm: a.metrics.distanceKm, metrics: a.metrics, startTime: a.startIso, fileName: f.name,
        templateId: planned?.id, fromPlan: !!planned
      });
      last = a.date;
      toast(exists ? `Treino de ${shortLabel(a.date)} atualizado` : `Treino de ${shortLabel(a.date)} importado`);
    } catch (e: any) {
      toast(`${f.name}: ${e?.message ?? 'não consegui ler o arquivo.'}`, undefined, 'error');
    }
  }
  return last;
}
