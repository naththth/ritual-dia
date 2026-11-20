// Sessão de força já feita: foto de cada exercício, comparação com sessões anteriores e números do treino.
import type { StrengthExercise, Workout } from '../db/types';
import type { DateKey } from '../lib/dates';
import { loadsPerSet, repsPerSet, topLoad, exerciseVolume, totalReps } from './strength';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Foto de referência por exercício (base aberta free-exercise-db, domínio público, tratada em duotone petróleo).
 *  A ordem importa: o primeiro padrão que bate decide. */
const PHOTO_RULES: [RegExp, string][] = [
  [/agachamento frontal/, 'agachamento-frontal'], [/agachamento overhead/, 'agachamento-overhead'],
  [/agachamento bulgaro|bulgaro/, 'bulgaro'], [/afundo|passada/, 'afundo'], [/sumo/, 'sumo'], [/agachamento/, 'agachamento'],
  [/leg press/, 'leg-press'], [/cadeira extensora|extensora/, 'cadeira-extensora'], [/cadeira flexora/, 'cadeira-flexora'], [/mesa flexora|flexora/, 'mesa-flexora'],
  [/stiff com halter/, 'stiff-halteres'], [/stiff/, 'stiff'], [/levantamento terra|\bterra\b/, 'terra'],
  [/elevacao pelvica/, 'elevacao-pelvica'], [/ponte de gluteo|ponte/, 'ponte-gluteo'], [/coice|gluteo na polia/, 'coice'], [/abducao/, 'abducao'],
  [/puxada de arranco/, 'puxada-arranco'], [/puxada de arremesso/, 'puxada-arremesso'],
  [/puxada com triangulo|puxada neutra/, 'puxada-triangulo'], [/puxada|pulldown/, 'puxada'],
  [/remada curvada/, 'remada-curvada'], [/remada unilateral/, 'remada-unilateral'], [/remada/, 'remada'], [/barra fixa/, 'barra-fixa'],
  [/supino.*halter/, 'supino-halteres'], [/supino.*maquina/, 'supino-maquina'], [/supino/, 'supino'],
  [/crucifixo inverso/, 'crucifixo-inverso'], [/crucifixo/, 'crucifixo'], [/crossover/, 'crossover'], [/flexao de braco/, 'flexao'],
  [/desenvolvimento.*maquina/, 'desenvolvimento-maquina'], [/arnold/, 'arnold'], [/desenvolvimento/, 'desenvolvimento'],
  [/elevacao lateral/, 'elevacao-lateral'], [/elevacao frontal/, 'elevacao-frontal'], [/face pull/, 'face-pull'],
  [/rosca martelo|rosca alternada/, 'rosca-martelo'], [/rosca scott/, 'rosca-scott'], [/rosca/, 'rosca'],
  [/triceps testa/, 'triceps-testa'], [/triceps banco/, 'triceps-banco'], [/triceps/, 'triceps'],
  [/prancha lateral/, 'prancha-lateral'], [/prancha/, 'prancha'], [/abdominal na polia/, 'abdominal-polia'], [/abdominal/, 'abdominal'],
  [/dead bug/, 'dead-bug'], [/elevacao de pernas/, 'elevacao-pernas'], [/pallof/, 'pallof'],
  [/push press/, 'push-press'], [/power snatch/, 'snatch'], [/power clean|\bclean\b/, 'clean'], [/\bjerk\b/, 'jerk'],
  [/arranco/, 'arranco'], [/arremesso/, 'arremesso']
];
/** Exercício sem foto própria usa a do grupo. */
const GROUP_PHOTO: Record<string, string> = {
  Pernas: 'agachamento', Glúteos: 'elevacao-pelvica', Costas: 'puxada', Peito: 'supino', Ombros: 'elevacao-lateral', Braços: 'rosca', Core: 'prancha', LPO: 'arremesso'
};
export const PHOTO_KEYS = [...new Set([...PHOTO_RULES.map(([, k]) => k), ...Object.values(GROUP_PHOTO)])];

export function exercisePhotoKey(name: string, group?: string): string {
  const n = norm(name);
  const hit = PHOTO_RULES.find(([re]) => re.test(n));
  return hit?.[1] ?? (group ? GROUP_PHOTO[group] : undefined) ?? 'agachamento';
}

/** Séries com cargas diferentes (pirâmide, aquecimento subindo): desenhadas como escada. */
export const isPyramid = (e: StrengthExercise) => new Set(loadsPerSet(e).filter((n) => n != null)).size > 1;

const avgReps = (e: Pick<StrengthExercise, 'sets' | 'reps' | 'setReps'>) => totalReps(e) / Math.max(1, e.sets);

export interface PastExercise { date: DateKey; ex: StrengthExercise; top?: number; volume?: number }

/** Sessões anteriores do mesmo exercício, da mais recente para a mais antiga, só as comparáveis:
 *  repetições médias por série parecidas (o stiff leve de 20 repetições não se compara ao de 8). */
export function comparableHistory(e: StrengthExercise, history: Workout[], before: DateKey, limit = 3): PastExercise[] {
  const mine = avgReps(e);
  const out: PastExercise[] = [];
  const sorted = history.filter((w) => w.date < before).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of sorted) {
    const x = w.exercises?.find((p) => p.name === e.name);
    if (!x || topLoad(x) == null) continue;
    const r = avgReps(x);
    if (Math.abs(r - mine) / Math.max(r, mine) > 0.35) continue;
    out.push({ date: w.date, ex: x, top: topLoad(x), volume: exerciseVolume(x) });
    if (out.length >= limit) break;
  }
  return out;
}

export const ddmm = (d: DateKey) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kg`;

export type Tone = 'up' | 'down' | 'same' | 'new';
/** Selo de comparação com a última sessão comparável. Sem nenhuma anterior do exercício: primeira vez. */
export function compareChip(e: StrengthExercise, history: Workout[], before: DateKey): { text: string; tone: Tone } | undefined {
  const top = topLoad(e);
  if (top == null) return undefined;
  const anyBefore = history.some((w) => w.date < before && w.exercises?.some((p) => p.name === e.name));
  if (!anyBefore) return { text: 'Primeira vez', tone: 'new' };
  const last = comparableHistory(e, history, before, 1)[0];
  if (!last?.top) return undefined;
  const diff = Math.round((top - last.top) * 10) / 10;
  if (diff > 0) return { text: `+${kg(diff)} desde ${ddmm(last.date)}`, tone: 'up' };
  if (diff < 0) return { text: `${kg(diff).replace('-', '−')} vs. ${ddmm(last.date)}`, tone: 'down' };
  return { text: `Mesma carga de ${ddmm(last.date)}`, tone: 'same' };
}

/** O programado, quando ela fez diferente: "Plano: 3×10, 16 kg". */
export function planText(e: StrengthExercise): string | undefined {
  const p = e.planned;
  if (!p) return undefined;
  const line = (x: Pick<StrengthExercise, 'sets' | 'reps' | 'setReps' | 'loadKg' | 'setLoads'>) => {
    const reps = x.setReps?.length ? repsPerSet(x).join('/') : String(x.reps);
    const t = topLoad(x);
    return `${x.sets}×${reps}${t != null ? `, ${kg(t)}` : ''}`;
  };
  const same = p.name === e.name && line(p) === line(e);
  if (same) return undefined;
  return `Plano: ${p.name !== e.name ? `${p.name}, ` : ''}${line(p)}`;
}

/** Números da sessão: exercícios, séries e quilos levantados (soma de carga × repetições). */
export function sessionTotals(exs: StrengthExercise[]) {
  const sets = exs.reduce((a, e) => a + e.sets, 0);
  const volume = exs.reduce((a, e) => a + (exerciseVolume(e) ?? 0), 0);
  return { exercises: exs.length, sets, volume: Math.round(volume) };
}

/** Capa do treino: o exercício de maior carga (o levantamento principal do dia). */
export function coverExercise(exs: StrengthExercise[]): StrengthExercise | undefined {
  return [...exs].sort((a, b) => (topLoad(b) ?? 0) - (topLoad(a) ?? 0))[0];
}

/** Grupos trabalhados, na ordem em que aparecem: "Pernas · LPO". */
export const sessionGroups = (exs: StrengthExercise[]) => [...new Set(exs.map((e) => e.group).filter(Boolean))].join(' · ');
