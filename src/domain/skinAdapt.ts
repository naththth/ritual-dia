// Ajuste da rotina da noite a partir do dia: pele registrada, ativo usado de manhã, treino, sono e ciclo.
// Regras explícitas e conservadoras: só sugere tirar ativo forte; nunca acrescenta nada por conta própria.
import type { Product, SkinLog, Workout, WorkoutTemplate } from '../db/types';
import { SKIN_SIGNALS } from './defaults';

const IRRITATION = ['vermelhidao', 'ardencia', 'descamacao'];
const label = (id: string) => SKIN_SIGNALS.find((s) => s.id === id)?.label.toLowerCase() ?? id;

export interface NightAdjust {
  kind: 'swap' | 'tip';
  title: string;
  reasons: string[];
  /** Ativos do plano da noite que saem hoje. */
  remove: string[];
  /** Há lista de recuperação montada: trocar o rosto por ela. */
  useRecovery: boolean;
}

export interface NightInput {
  plannedPm: string[];
  recoveryPm: string[];
  products: Product[];
  amLog?: SkinLog;
  /** Sinais marcados agora na tela da noite, antes de salvar. */
  liveSignals?: Record<string, number>;
  liveCondition?: string;
  workouts?: Workout[];
  plannedWorkouts?: WorkoutTemplate[];
  sleepH?: number;
  phase?: string;
}

export function nightAdjust(i: NightInput): NightAdjust | undefined {
  const byId = new Map(i.products.map((p) => [p.id, p]));
  const face = (id: string) => (byId.get(id)?.area ?? 'rosto') === 'rosto';
  const activesTonight = i.plannedPm.filter((id) => face(id) && byId.get(id)?.active);

  const sig = { ...(i.amLog?.signals ?? {}), ...(i.liveSignals ?? {}) } as Record<string, number>;
  const irritated = IRRITATION.filter((s) => sig[s]);
  const dry = (sig.ressecamento ?? 0) >= 2;
  const sensitive = i.amLog?.condition === 'sensibilizada' || i.liveCondition === 'sensibilizada';
  const amActives = (i.amLog?.productIds ?? []).filter((id) => face(id) && byId.get(id)?.active).map((id) => byId.get(id)!.name);

  const hard = (w: { intensity?: string; duration?: number; metrics?: { tss?: number } }) => w.intensity === 'intensa' || (w.duration ?? 0) >= 75 || (w.metrics?.tss ?? 0) >= 80;
  const hardTraining = (i.workouts ?? []).some(hard) || (i.plannedWorkouts ?? []).some(hard);

  const reasons: string[] = [];
  if (sensitive) reasons.push('pele sensibilizada hoje');
  if (irritated.length) {
    const fromAm = irritated.some((x) => i.amLog?.signals?.[x]);
    const pl = irritated.length > 1 ? 's' : '';
    reasons.push(`${irritated.map(label).join(' e ')} ${fromAm ? `registrada${pl} de manhã` : `marcada${pl} agora`}`);
  }
  if (dry) reasons.push('ressecamento moderado ou forte');
  if (amActives.length) reasons.push(`você já usou ${amActives.join(' e ')} de manhã`);

  if (reasons.length && activesTonight.length) {
    if (hardTraining) reasons.push('treino intenso hoje (calor e suor irritam mais a pele sensível)');
    if (i.sleepH != null && i.sleepH < 6) reasons.push('noite curta');
    const names = activesTonight.map((id) => byId.get(id)!.name).join(' e ');
    return {
      kind: 'swap', reasons, remove: activesTonight, useRecovery: i.recoveryPm.length > 0,
      title: i.recoveryPm.length ? `Hoje vale trocar ${names} pela recuperação` : `Hoje vale deixar ${names} de lado`
    };
  }
  // Sem conflito: só lembretes que mudam o que fazer.
  if (!reasons.length && activesTonight.length && i.phase === 'lutea' && (sig.oleosidade || sig.acne))
    return { kind: 'tip', reasons: ['fase lútea, com oleosidade ou espinhas'], remove: [], useRecovery: false, title: 'Pele tranquila e oleosa: manter o ativo da noite faz sentido' };
  if (hardTraining) return { kind: 'tip', reasons: ['treino intenso hoje'], remove: [], useRecovery: false, title: 'Treino com suor: lave o rosto logo depois e capriche na limpeza da noite' };
  return undefined;
}
