// Carga de treino calculada no próprio app a partir dos treinos registrados (arquivos .FIT e registros manuais).
// Fitness = média exponencial de 42 dias do TSS diário; fadiga = de 7 dias; forma = fitness de ontem menos fadiga de ontem.
import { addDays, type DateKey } from '../lib/dates';
import type { Workout } from '../db/types';

const PER_HOUR = { leve: 40, moderada: 60, intensa: 85 } as const;

/** TSS do treino: o do arquivo quando há potência; senão uma estimativa pela duração e intensidade. */
export function workoutLoad(w: Workout): { tss: number; estimated: boolean } {
  if (w.metrics?.tss) return { tss: w.metrics.tss, estimated: false };
  const h = (w.duration ?? 0) / 60;
  return { tss: Math.round(h * (PER_HOUR[w.intensity as keyof typeof PER_HOUR] ?? 55)), estimated: true };
}

export interface LoadDay { date: DateKey; tss: number; ctl: number; atl: number; tsb: number }

export function trainingLoad(workouts: Workout[], from: DateKey, to: DateKey): LoadDay[] {
  const byDay = new Map<string, number>();
  for (const w of workouts) byDay.set(w.date, (byDay.get(w.date) ?? 0) + workoutLoad(w).tss);
  const out: LoadDay[] = [];
  let ctl = 0, atl = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const tsb = ctl - atl;
    const t = byDay.get(d) ?? 0;
    ctl += (t - ctl) / 42;
    atl += (t - atl) / 7;
    out.push({ date: d, tss: t, ctl, atl, tsb });
  }
  return out;
}

export function formLabel(tsb: number) {
  if (tsb < -30) return 'carga muito alta';
  if (tsb < -10) return 'construindo';
  if (tsb <= 5) return 'equilibrada';
  if (tsb <= 25) return 'descansada';
  return 'destreinando';
}
