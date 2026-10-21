// Aulas com horário (LPO, por exemplo) que o relógio grava como "musculação": se a musculação começou
// perto do horário da aula planejada, é a aula. Junta com o "Feito" manual da aula quando houver.
import { all, byDateRange, remove, update } from '../db/db';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedTraining } from './rules';
import type { Workout } from '../db/types';

const STRENGTH = 'mod:musculacao';
const BEFORE = 45, AFTER = 90; // minutos de tolerância em relação ao horário da aula

const localMinutes = (iso?: string) => { if (!iso) return undefined; const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.getHours() * 60 + d.getMinutes(); };
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export async function reconcileClasses(days = 21, today: DateKey = todayKey()): Promise<number> {
  const [plans, tmpls, workouts] = await Promise.all([all('plan'), all('wtemplate'), byDateRange('workout', addDays(today, -days), today)]);
  let changed = 0;
  for (const w of workouts) {
    if (w.deleted || !w.startTime) continue;
    const classes = plannedTraining(planFor(plans, 'training', w.date), w.date)
      .map((id) => tmpls.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t && !!t.time && t.modalityId !== STRENGTH);
    let cls: (typeof classes)[number] | undefined;
    if (w.modalityId === STRENGTH && !w.classChecked) {
      const start = localMinutes(w.startTime);
      cls = start == null ? undefined : classes.find((t) => { const d = start - hm(t.time!); return d >= -BEFORE && d <= AFTER; });
    } else if (w.reclassifiedFrom) cls = classes.find((t) => t.modalityId === w.modalityId); // o servidor já trocou; falta juntar com o manual
    if (!cls) continue;
    // Já existe a aula marcada à mão no mesmo dia (sem dados do relógio)? Ela recebe os dados e a duplicata sai.
    const manual = workouts.find((m) => m.id !== w.id && !m.deleted && m.date === w.date && m.modalityId === cls!.modalityId && !m.metrics);
    if (manual) {
      const feeling = [manual.feeling, w.feeling].filter(Boolean).join('\n') || undefined;
      await update<'workout'>(manual.id, {
        metrics: w.metrics, startTime: w.startTime, duration: w.duration ?? manual.duration, fileName: w.fileName,
        rpe: manual.rpe ?? w.rpe, feeling, templateId: cls.id, classChecked: true, reclassifiedFrom: STRENGTH
      } as Partial<Workout>);
      await remove(w.id);
      manual.metrics = w.metrics; // não junta duas vezes na mesma passada
      changed++;
    } else if (w.modalityId === STRENGTH) {
      await update<'workout'>(w.id, { modalityId: cls.modalityId, templateId: cls.id, fromPlan: true, intensity: w.intensity ?? cls.intensity, reclassifiedFrom: STRENGTH, classChecked: true } as Partial<Workout>);
      changed++;
    }
  }
  return changed;
}
