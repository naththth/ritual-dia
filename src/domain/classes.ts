// Aulas com horário (LPO, por exemplo) que o relógio grava como "musculação": se a musculação começou
// perto do horário da aula planejada, é a aula. Junta com o "Feito" manual da aula quando houver.
import { all, byDateRange, get, remove, update } from '../db/db';
import { addDays, isoWeekday, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedTraining } from './rules';
import type { TrainingRule, Workout } from '../db/types';

const STRENGTH = 'mod:musculacao';
const BEFORE = 45, AFTER = 90; // minutos de tolerância em relação ao horário da aula

const localMinutes = (iso?: string) => { if (!iso) return undefined; const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.getHours() * 60 + d.getMinutes(); };
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A regra dela vale para este treino? Dia da semana e faixa de horário só filtram quando ela os deu. */
export function ruleMatches(r: TrainingRule, w: Pick<Workout, 'date' | 'startTime' | 'modalityId'>) {
  if (w.modalityId !== r.fromModalityId) return false;
  if (r.weekdays?.length && !r.weekdays.includes(isoWeekday(w.date))) return false;
  if (r.from || r.to) {
    const m = localMinutes(w.startTime);
    if (m == null) return false;
    if (r.from && m < hm(r.from)) return false;
    if (r.to && m > hm(r.to)) return false;
  }
  return true;
}

export async function reconcileClasses(days = 21, today: DateKey = todayKey()): Promise<number> {
  const [plans, tmpls, workouts, settings, extras] = await Promise.all([all('plan'), all('wtemplate'), byDateRange('workout', addDays(today, -days), today), get<'settings'>('settings'), byDateRange('extra', addDays(today, -days), today)]);
  const rules = settings?.trainingRules ?? [];
  let changed = 0;
  for (const w of workouts) {
    if (w.deleted || !w.startTime) continue;
    const dayTpls = plannedTraining(planFor(plans, 'training', w.date), w.date, extras)
      .map((id) => tmpls.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
    const classes = dayTpls.filter((t) => !!t.time && t.modalityId !== STRENGTH);
    // Alvo: uma aula planejada (id do modelo) ou, pela regra dela, só a modalidade.
    let cls: { id?: string; modalityId: string; intensity?: Workout['intensity'] } | undefined;
    let by: Workout['reclassifiedBy'] = 'aula';
    const rule = !w.classChecked ? rules.find((r) => ruleMatches(r, w)) : undefined;
    if (rule) {
      cls = dayTpls.find((t) => t.modalityId === rule.toModalityId) ?? { modalityId: rule.toModalityId };
      by = 'regra';
    } else if (w.modalityId === STRENGTH && !w.classChecked) {
      const start = localMinutes(w.startTime);
      cls = start == null ? undefined : classes.find((t) => { const d = start - hm(t.time!); return d >= -BEFORE && d <= AFTER; });
    } else if (w.reclassifiedFrom) cls = classes.find((t) => t.modalityId === w.modalityId); // o servidor já trocou; falta juntar com o manual
    if (!cls) continue;
    const from = w.reclassifiedFrom ?? w.modalityId;
    // Já existe a aula marcada à mão no mesmo dia (sem dados do relógio)? Ela recebe os dados e a duplicata sai.
    const manual = workouts.find((m) => m.id !== w.id && !m.deleted && m.date === w.date && m.modalityId === cls!.modalityId && !m.metrics);
    if (manual) {
      const feeling = [manual.feeling, w.feeling].filter(Boolean).join('\n') || undefined;
      await update<'workout'>(manual.id, {
        metrics: w.metrics, startTime: w.startTime, duration: w.duration ?? manual.duration, fileName: w.fileName,
        rpe: manual.rpe ?? w.rpe, feeling, templateId: cls.id ?? manual.templateId, classChecked: true, reclassifiedFrom: from, reclassifiedBy: w.reclassifiedBy ?? by
      } as Partial<Workout>);
      await remove(w.id);
      manual.metrics = w.metrics; // não junta duas vezes na mesma passada
      changed++;
    } else if (w.modalityId !== cls.modalityId) {
      await update<'workout'>(w.id, { modalityId: cls.modalityId, templateId: cls.id, fromPlan: !!cls.id, intensity: w.intensity ?? cls.intensity, reclassifiedFrom: from, reclassifiedBy: by, classChecked: true } as Partial<Workout>);
      changed++;
    }
  }
  return changed;
}
