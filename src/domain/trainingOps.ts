// Regras de quando um treino muda de dia, sai ou volta. Puras, cobertas por testes unitários.
import type { WorkoutStep } from '../db/types';

const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Mesma sessão: mesmo nome e mesma modalidade, e (no pedal) os mesmos blocos. Serve para não criar cópia do que já existe. */
export function sameSession(
  a: { name: string; modalityId: string; steps?: WorkoutStep[] },
  b: { name: string; modalityId: string; steps?: WorkoutStep[] }
): boolean {
  if (a.modalityId !== b.modalityId || norm(a.name) !== norm(b.name)) return false;
  // Sem blocos de um dos lados (musculação, aula, corrida), nome e modalidade bastam.
  if (!a.steps?.length || !b.steps?.length) return true;
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((s, i) => Math.abs(s.minutes - b.steps![i].minutes) < 0.01 && s.pct === b.steps![i].pct);
}

/**
 * Para uma sessão pedida num dia, o modelo que já existe e deve ser reaproveitado: primeiro o do plano da semana
 * daquele dia (mesmo se estiver como "não hoje"), depois qualquer modelo do plano com o mesmo nome. Avulsos antigos
 * de outros dias não servem: eles são cópias.
 */
export function existingSession<T extends { id: string; name: string; modalityId: string; steps?: WorkoutStep[]; oneOff?: string; archived?: boolean; deleted?: 0 | 1 }>(
  wanted: { name: string; modalityId: string; steps?: WorkoutStep[] }, dayBase: string[], tmpls: T[]
): T | undefined {
  const live = tmpls.filter((t) => !t.deleted && !t.oneOff && sameSession(wanted, t));
  return live.find((t) => dayBase.includes(t.id)) ?? live.find((t) => !t.archived);
}

/** Duas sessões de força no mesmo dia (musculação e LPO) disputam a mesma recuperação. */
export const STRENGTH_MODS = ['mod:musculacao', 'mod:lpo'];
export function clashes(a: { id?: string; modalityId: string }, b: { id?: string; modalityId: string }) {
  return a.id !== b.id && STRENGTH_MODS.includes(a.modalityId) && STRENGTH_MODS.includes(b.modalityId);
}
