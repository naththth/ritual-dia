// Musculação: exercícios programados, variações de cada movimento e a carga do próximo treino.
import type { StrengthExercise, Workout, WorkoutTemplate } from '../db/types';
import type { DateKey } from '../lib/dates';

/** Catálogo por grupo. A ordem importa: os primeiros são os padrões e as variações giram a partir deles. */
export const EXERCISE_CATALOG: Record<string, string[]> = {
  Pernas: ['Agachamento livre', 'Leg press 45°', 'Agachamento búlgaro', 'Cadeira extensora', 'Afundo com halteres', 'Agachamento sumô', 'Stiff com barra', 'Cadeira flexora', 'Mesa flexora'],
  Glúteos: ['Elevação pélvica com barra', 'Glúteo na polia (coice)', 'Abdução na máquina', 'Stiff com halteres', 'Agachamento sumô', 'Passada com halteres', 'Ponte de glúteo unilateral'],
  Costas: ['Puxada na frente', 'Remada curvada', 'Remada baixa na polia', 'Remada unilateral com halter', 'Puxada com triângulo', 'Barra fixa assistida', 'Pulldown com corda'],
  Peito: ['Supino reto com halteres', 'Supino inclinado com halteres', 'Supino reto com barra', 'Crucifixo na máquina', 'Crossover na polia', 'Flexão de braço', 'Supino na máquina'],
  Ombros: ['Desenvolvimento com halteres', 'Elevação lateral', 'Desenvolvimento na máquina', 'Elevação frontal', 'Crucifixo inverso', 'Face pull', 'Arnold press'],
  Braços: ['Rosca direta', 'Tríceps na polia (corda)', 'Rosca martelo', 'Tríceps testa', 'Rosca alternada', 'Tríceps banco', 'Rosca scott'],
  Core: ['Prancha', 'Abdominal infra no solo', 'Abdominal na polia', 'Prancha lateral', 'Dead bug', 'Elevação de pernas', 'Pallof press']
};
/** "Corpo todo" monta uma sessão com estes grupos. */
const FULL_BODY = ['Pernas', 'Costas', 'Peito', 'Ombros', 'Core'];
const PER_GROUP = 2; // exercícios por grupo quando montamos a sessão sozinhos
const DEFAULT_REPS: Record<string, number> = { Core: 15, Braços: 12, Ombros: 12 };

export const OTHER_OPTION = '__outras';

export const exerciseGroupOf = (name: string): string | undefined => Object.keys(EXERCISE_CATALOG).find((g) => EXERCISE_CATALOG[g].includes(name));

let seq = 0;
export const newExerciseId = () => `ex${Date.now().toString(36)}${(seq++).toString(36)}`;

export const groupsOf = (muscles?: string[]): string[] => {
  const gs = (muscles ?? []).flatMap((m) => (m === 'Corpo todo' ? FULL_BODY : EXERCISE_CATALOG[m] ? [m] : []));
  return Array.from(new Set(gs));
};

const GROUP_HINTS: [RegExp, string][] = [
  [/p[ée]lvica|gl[úu]teo|ponte|abdu/i, 'Glúteos'],
  [/agacha|flexora|extensora|leg press|afundo|stiff|passada/i, 'Pernas'],
  [/barra fixa|puxada|remada|pulldown/i, 'Costas'],
  [/flex[ãa]o|supino|crucifixo|crossover/i, 'Peito'],
  [/lateral|frontal|desenvolvimento|face pull|arnold/i, 'Ombros'],
  [/rosca|tr[íi]ceps/i, 'Braços'],
  [/dead bug|prancha|abdominal|pallof|eleva[çc][ãa]o de pernas/i, 'Core']
];

/** Lê o roteiro escrito no treino ("1. Agachamento goblet ou livre 3x6-10") e devolve os exercícios.
 *  Com "A ou B", fica o que casa com o catálogo (senão o primeiro); repetições = topo da faixa. */
export function exercisesFromNote(note?: string): StrengthExercise[] {
  const out: StrengthExercise[] = [];
  for (const line of (note ?? '').split('\n')) {
    const m = line.match(/^\s*\d+[.)]\s+(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*-\s*(\d+))?/i);
    if (!m) continue;
    const alts = m[1].split(/\s+ou\s+/i).map((a) => a.trim()).filter(Boolean);
    const name = alts.find((a) => exerciseGroupOf(a)) ?? alts[0];
    const group = exerciseGroupOf(name) ?? GROUP_HINTS.find(([re]) => re.test(name))?.[1];
    if (!group) continue;
    out.push({ id: newExerciseId(), group, name: name.charAt(0).toUpperCase() + name.slice(1), sets: Number(m[2]), reps: Number(m[4] ?? m[3]) });
  }
  return out;
}

/** Sessão do treino quando ela ainda não escolheu exercícios: o roteiro escrito, ou uma montada pelos grupos. */
export function defaultExercises(muscles?: string[], note?: string): StrengthExercise[] {
  const fromNote = exercisesFromNote(note);
  if (fromNote.length) return fromNote;
  const groups = groupsOf(muscles);
  const per = groups.length > 3 ? 1 : PER_GROUP;
  return groups.flatMap((g) => EXERCISE_CATALOG[g].slice(0, per).map((name) => ({ id: newExerciseId(), group: g, name, sets: 3, reps: DEFAULT_REPS[g] ?? 10 })));
}

/** As 3 opções da lista suspensa para o exercício: o atual e mais duas, girando a cada "trazer outras".
 *  `taken` são os outros exercícios da sessão, para não repetir o mesmo movimento. */
export function variationOptions(ex: Pick<StrengthExercise, 'group' | 'name' | 'round'>, taken: string[] = []): string[] {
  const pool = (EXERCISE_CATALOG[ex.group] ?? []).filter((n) => n !== ex.name && !taken.includes(n));
  if (!pool.length) return [ex.name];
  const start = ((ex.round ?? 0) * 2) % pool.length;
  const picks = [0, 1].map((i) => pool[(start + i) % pool.length]).filter((n, i, a) => a.indexOf(n) === i);
  return [ex.name, ...picks];
}

const roundKg = (n: number) => Math.round(n * 2) / 2;

/** Último registro do exercício em treinos feitos (do mais recente para o mais antigo). */
function lastLog(name: string, done: Workout[], before?: DateKey): { w: Workout; ex: StrengthExercise } | undefined {
  const sorted = [...done].filter((w) => !before || w.date < before).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of sorted) {
    const ex = w.exercises?.find((e) => e.name === name && e.loadKg != null);
    if (ex) return { w, ex };
  }
}

/**
 * Carga sugerida a partir do que ela lançou e do que o relógio entregou naquele treino:
 * - esforço 9 ou 10, ou FC média bem acima da dos outros treinos de musculação: mantém;
 * - ficou abaixo das repetições programadas em 2 ou mais: baixa uns 5%;
 * - cumpriu tudo com esforço até 8 (ou sem esforço anotado): sobe uns 5%, no mínimo 1 kg.
 */
export function suggestLoad(name: string, done: Workout[], before?: DateKey): { loadKg: number; why: string } | undefined {
  const last = lastLog(name, done, before);
  if (!last) return undefined;
  const { w, ex } = last;
  const kg = ex.loadKg!;
  const target = ex.planned?.reps ?? ex.reps;
  if (ex.reps <= target - 2) return { loadKg: roundKg(kg * 0.95), why: `ficou abaixo das repetições em ${w.date.slice(8)}/${w.date.slice(5, 7)}` };
  const hrs = done.filter((x) => x.id !== w.id && x.exercises?.length && x.metrics?.avgHr).map((x) => x.metrics!.avgHr!);
  const hrAvg = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : undefined;
  const hot = hrAvg != null && w.metrics?.avgHr != null && w.metrics.avgHr > hrAvg * 1.1;
  if ((w.rpe ?? 0) >= 9 || hot) return { loadKg: kg, why: 'mantida: o último treino foi puxado' };
  return { loadKg: roundKg(Math.max(kg * 1.05, kg + 1)), why: 'subiu: você cumpriu o último treino' };
}

/** Carga a mostrar antes do treino: a que ela fixou à mão, se for mais nova que o último registro; senão a sugerida. */
export function plannedLoad(ex: StrengthExercise, done: Workout[], today: DateKey): { loadKg?: number; why?: string } {
  const last = lastLog(ex.name, done, today);
  if (ex.loadKg != null && ex.loadAt && (!last || ex.loadAt > last.w.date)) return { loadKg: ex.loadKg };
  const s = suggestLoad(ex.name, done, today);
  if (s) return s;
  return { loadKg: ex.loadKg };
}

/** O programado do dia, com as cargas já calculadas. */
export function programFor(t: Pick<WorkoutTemplate, 'exercises' | 'muscles' | 'note'>, done: Workout[], today: DateKey): { exercises: StrengthExercise[]; why: Record<string, string> } {
  const base = t.exercises?.length ? t.exercises : defaultExercises(t.muscles, t.note);
  const why: Record<string, string> = {};
  const exercises = base.map((ex) => {
    const p = plannedLoad(ex, done, today);
    if (p.why) why[ex.id] = p.why;
    return { ...ex, loadKg: p.loadKg };
  });
  return { exercises, why };
}

/** Ao concluir: guarda o programado em cada exercício para comparar com o que ela lançar. */
export const withPlanned = (exs: StrengthExercise[]): StrengthExercise[] =>
  exs.map((e) => ({ ...e, planned: e.planned ?? { name: e.name, sets: e.sets, reps: e.reps, loadKg: e.loadKg } }));

export const exerciseLine = (e: Pick<StrengthExercise, 'sets' | 'reps' | 'loadKg'>) => `${e.sets}×${e.reps}${e.loadKg != null ? `, ${String(e.loadKg).replace('.', ',')} kg` : ''}`;
