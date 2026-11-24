// Planejado × realizado na musculação: ela marca série a série o que fez, sem mudar o plano.
// O andamento fica num registro próprio (wprog) gravado a cada toque; ao concluir, vira o treino feito
// com o plano guardado em cada exercício para comparar.
import type { SetMark, StrengthExercise, StrengthProgress } from '../db/types';
import type { DateKey } from '../lib/dates';
import { loadsPerSet, repsPerSet } from './strength';

export const progressId = (date: DateKey, templateId: string) => `wprog:${date}:${templateId}`;

/** Série planejada (repetições e carga) na posição i. */
export function plannedSet(e: StrengthExercise, i: number): SetMark {
  return { reps: repsPerSet(e)[i] ?? e.reps, kg: loadsPerSet(e)[i] ?? e.loadKg };
}

/** Marcas de um exercício, sempre com uma posição por série do plano. */
export function marksOf(p: Pick<StrengthProgress, 'sets'> | undefined, e: StrengthExercise): (SetMark | null)[] {
  const m = p?.sets?.[e.id] ?? [];
  return Array.from({ length: e.sets }, (_, i) => m[i] ?? null);
}

/** Igual ao plano? (para destacar o que mudou) */
export const sameAsPlan = (m: SetMark, p: SetMark) => m.reps === p.reps && (m.kg ?? null) === (p.kg ?? null);

/** Quantas séries marcadas no treino todo e quantas existem (exercícios pulados não contam). */
export function progressCount(plan: StrengthExercise[], p?: Pick<StrengthProgress, 'sets' | 'skipped'>) {
  let done = 0, total = 0;
  for (const e of plan) {
    if (p?.skipped?.includes(e.id)) continue;
    total += e.sets;
    done += marksOf(p, e).filter(Boolean).length;
  }
  return { done, total };
}

/** O que vai para o treino feito: só as séries marcadas, com o plano guardado em cada exercício. */
export function realizedExercises(plan: StrengthExercise[], p?: Pick<StrengthProgress, 'sets' | 'skipped'>): StrengthExercise[] {
  const out: StrengthExercise[] = [];
  for (const e of plan) {
    if (p?.skipped?.includes(e.id)) continue;
    const marks = marksOf(p, e).filter((m): m is SetMark => !!m);
    if (!marks.length) continue;
    const reps = marks.map((m) => m.reps);
    const kgs = marks.map((m) => m.kg);
    const hasKg = kgs.some((k) => k != null);
    const top = hasKg ? Math.max(...kgs.map((k) => k ?? 0)) : undefined;
    out.push({
      id: e.id, group: e.group, name: e.name,
      sets: marks.length,
      reps: reps[0],
      ...(new Set(reps).size > 1 ? { setReps: reps } : {}),
      ...(hasKg ? { loadKg: top } : {}),
      ...(hasKg && new Set(kgs).size > 1 ? { setLoads: kgs.map((k) => k ?? 0) } : {}),
      planned: { name: e.name, sets: e.sets, reps: e.reps, loadKg: e.loadKg, ...(e.setLoads ? { setLoads: e.setLoads } : {}), ...(e.setReps ? { setReps: e.setReps } : {}) }
    });
  }
  return out;
}

/** Nova lista de marcas do exercício com a série i trocada (null desmarca). */
export function withMark(p: Pick<StrengthProgress, 'sets'> | undefined, e: StrengthExercise, i: number, m: SetMark | null): Record<string, (SetMark | null)[]> {
  const list = marksOf(p, e).slice();
  list[i] = m;
  return { ...(p?.sets ?? {}), [e.id]: list };
}
