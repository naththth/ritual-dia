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
export function parseNoteLine(line: string): StrengthExercise | undefined {
  const m = line.match(/^\s*\d+[.)]\s+(.+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*-\s*(\d+))?/i);
  if (!m) return undefined;
  const alts = m[1].split(/\s+ou\s+/i).map((a) => a.trim()).filter(Boolean);
  const name = alts.find((a) => exerciseGroupOf(a)) ?? alts[0];
  const group = exerciseGroupOf(name) ?? GROUP_HINTS.find(([re]) => re.test(name))?.[1];
  if (!group) return undefined;
  return { id: newExerciseId(), group, name: name.charAt(0).toUpperCase() + name.slice(1), sets: Number(m[2]), reps: Number(m[4] ?? m[3]) };
}

export function exercisesFromNote(note?: string): StrengthExercise[] {
  return (note ?? '').split('\n').map(parseNoteLine).filter((e): e is StrengthExercise => !!e);
}

const sameEx = (a: Pick<StrengthExercise, 'name' | 'sets' | 'reps'>, b: Pick<StrengthExercise, 'name' | 'sets' | 'reps'>) => a.name === b.name && a.sets === b.sets && a.reps === b.reps;

/** O texto do treino manda: se os exercícios gravados não batem com o roteiro, valem os do roteiro
 *  (mantendo carga e variações dos que continuam). Devolve undefined quando já estão iguais. */
export function reconcileWithNote(note: string | undefined, exs: StrengthExercise[] = []): StrengthExercise[] | undefined {
  const parsed = exercisesFromNote(note);
  if (!parsed.length) return undefined;
  if (parsed.length === exs.length && parsed.every((p, i) => sameEx(p, exs[i]))) return undefined;
  const used = new Set<string>();
  return parsed.map((p) => {
    const old = exs.find((e) => e.name === p.name && !used.has(e.id));
    if (!old) return p;
    used.add(old.id);
    return { ...p, id: old.id, loadKg: old.loadKg, setLoads: old.setLoads && old.setLoads.length === p.sets ? old.setLoads : undefined, loadAt: old.loadAt, round: old.round };
  });
}

/** Reescreve o roteiro do texto com os exercícios editados. Linha que não mudou fica como a treinadora escreveu
 *  (com a faixa de repetições e o "ou"); o resto do texto fica onde estava. */
export function noteWithExercises(note: string | undefined, exs: StrengthExercise[]): string {
  const lines = (note ?? '').split('\n');
  const parsed = lines.map((l) => parseNoteLine(l));
  const taken = new Set<number>();
  const block = exs.map((e, i) => {
    const j = parsed.findIndex((p, k) => p && !taken.has(k) && sameEx(p, e));
    if (j >= 0) { taken.add(j); return lines[j].replace(/^\s*\d+([.)])/, `${i + 1}$1`); }
    return `${i + 1}. ${e.name} ${e.sets}x${e.reps}`;
  });
  const first = parsed.findIndex((p) => !!p);
  if (first < 0) return [(note ?? '').trimEnd(), block.join('\n')].filter(Boolean).join('\n\n');
  const out: string[] = [];
  lines.forEach((l, k) => {
    if (k === first) out.push(...block);
    else if (!parsed[k]) out.push(l);
  });
  return out.join('\n');
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
    const ex = w.exercises?.find((e) => e.name === name && topLoad(e) != null);
    if (ex) return { w, ex };
  }
}

/**
 * Carga sugerida a partir do que ela lançou e do que o relógio entregou naquele treino:
 * - esforço 9 ou 10, ou FC média bem acima da dos outros treinos de musculação: mantém;
 * - ficou abaixo das repetições programadas em 2 ou mais: baixa uns 5%;
 * - cumpriu tudo com esforço até 8 (ou sem esforço anotado): sobe uns 5%, no mínimo 1 kg.
 */
export function suggestLoad(name: string, done: Workout[], before?: DateKey): { loadKg: number; setLoads?: number[]; why: string } | undefined {
  const last = lastLog(name, done, before);
  if (!last) return undefined;
  const { w, ex } = last;
  const kg = topLoad(ex)!;
  // A progressão anda pela série mais pesada; a rampa das outras séries acompanha na mesma proporção.
  const ramp = (top: number) => (ex.setLoads?.length && new Set(ex.setLoads).size > 1 ? ex.setLoads.map((l) => roundKg((l * top) / kg)) : undefined);
  const out = (top: number, why: string) => ({ loadKg: top, setLoads: ramp(top), why });
  const target = ex.planned?.reps ?? ex.reps;
  if (ex.reps <= target - 2) return out(roundKg(kg * 0.95), `ficou abaixo das repetições em ${w.date.slice(8)}/${w.date.slice(5, 7)}`);
  const hrs = done.filter((x) => x.id !== w.id && x.exercises?.length && x.metrics?.avgHr).map((x) => x.metrics!.avgHr!);
  const hrAvg = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : undefined;
  const hot = hrAvg != null && w.metrics?.avgHr != null && w.metrics.avgHr > hrAvg * 1.1;
  if ((w.rpe ?? 0) >= 9 || hot) return out(kg, 'mantida: o último treino foi puxado');
  return out(roundKg(Math.max(kg * 1.05, kg + 1)), 'subiu: você cumpriu o último treino');
}

/** Carga a mostrar antes do treino: a que ela fixou à mão, se for mais nova que o último registro; senão a sugerida. */
export function plannedLoad(ex: StrengthExercise, done: Workout[], today: DateKey): { loadKg?: number; setLoads?: number[]; why?: string } {
  const last = lastLog(ex.name, done, today);
  if (ex.loadKg != null && ex.loadAt && (!last || ex.loadAt > last.w.date)) return { loadKg: ex.loadKg, setLoads: ex.setLoads };
  const s = suggestLoad(ex.name, done, today);
  if (s) return s;
  return { loadKg: ex.loadKg, setLoads: ex.setLoads };
}

/** O programado do dia, com as cargas já calculadas. */
export function programFor(t: Pick<WorkoutTemplate, 'exercises' | 'muscles' | 'note'>, done: Workout[], today: DateKey): { exercises: StrengthExercise[]; why: Record<string, string> } {
  const base = reconcileWithNote(t.note, t.exercises) ?? (t.exercises?.length ? t.exercises : defaultExercises(t.muscles, t.note));
  const why: Record<string, string> = {};
  const exercises = base.map((ex) => {
    const p = plannedLoad(ex, done, today);
    if (p.why) why[ex.id] = p.why;
    return { ...ex, loadKg: p.loadKg, setLoads: p.setLoads };
  });
  return { exercises, why };
}

/** Ao concluir: guarda o programado em cada exercício para comparar com o que ela lançar. */
export const withPlanned = (exs: StrengthExercise[]): StrengthExercise[] =>
  exs.map((e) => ({ ...e, planned: e.planned ?? { name: e.name, sets: e.sets, reps: e.reps, loadKg: e.loadKg, ...(e.setLoads ? { setLoads: e.setLoads } : {}) } }));

type LoadShape = Pick<StrengthExercise, 'sets' | 'reps' | 'loadKg' | 'setLoads'>;
const kgTxt = (n: number) => String(n).replace('.', ',');

/** Carga de cada série (o que foi lançado por série, ou a mesma carga em todas). Série em branco repete a anterior. */
export function loadsPerSet(e: LoadShape): (number | undefined)[] {
  if (!e.setLoads?.length) return Array.from({ length: e.sets }, () => e.loadKg);
  let prev: number | undefined;
  const first = e.setLoads.find((n) => n != null);
  return Array.from({ length: e.sets }, (_, i) => { const n = e.setLoads![i]; prev = n ?? prev ?? first; return prev; });
}
/** Série mais pesada: a referência de progressão. */
export function topLoad(e: LoadShape): number | undefined {
  const ls = loadsPerSet(e).filter((n): n is number => n != null);
  return ls.length ? Math.max(...ls) : e.loadKg;
}
/** Volume do exercício (tonelagem): soma de carga × repetições em cada série. */
export function exerciseVolume(e: LoadShape): number | undefined {
  const ls = loadsPerSet(e);
  return ls.every((n) => n == null) ? undefined : ls.reduce<number>((a, n) => a + (n ?? 0) * e.reps, 0);
}
/** Grava a carga de uma série. As séries seguintes que estavam iguais a ela (ou vazias) acompanham,
 *  então dá para lançar 60 → 70 → 80 digitando só nas séries que mudam. loadKg vira a série mais pesada. */
export function withSetLoad(e: LoadShape, i: number, kg?: number): Pick<StrengthExercise, 'loadKg' | 'setLoads'> {
  const raw = e.setLoads?.length ? Array.from({ length: e.sets }, (_, j) => e.setLoads![j] ?? undefined) : Array.from({ length: e.sets }, () => e.loadKg);
  const was = raw[i];
  const next = raw.map((n, j) => (j === i || (j > i && (n == null || n === was)) ? kg : n));
  const defined = next.filter((n): n is number => n != null);
  if (!defined.length) return { loadKg: undefined, setLoads: undefined };
  const same = next.every((n) => n === next[0]);
  return { loadKg: Math.max(...defined), setLoads: same ? undefined : (next as number[]) };
}
/** Ajusta as cargas ao novo número de séries (repete a última ao acrescentar). */
export function resizeSets(e: LoadShape, sets: number): Pick<StrengthExercise, 'sets' | 'setLoads' | 'loadKg'> {
  if (!e.setLoads?.length) return { sets, setLoads: undefined, loadKg: e.loadKg };
  const cur = loadsPerSet(e);
  const ls = Array.from({ length: sets }, (_, i) => cur[i] ?? cur[cur.length - 1]) as number[];
  return { sets, setLoads: new Set(ls).size > 1 ? ls : undefined, loadKg: Math.max(...ls) };
}
/** Texto da carga: "80 kg" quando é igual em todas, "60 → 70 → 80 kg" quando sobe de série para série. */
export function loadText(e: LoadShape): string | undefined {
  const ls = loadsPerSet(e);
  if (ls.every((n) => n == null)) return undefined;
  if (new Set(ls).size === 1) return `${kgTxt(ls[0]!)} kg`;
  return `${ls.map((n) => (n == null ? '–' : kgTxt(n))).join(' → ')} kg`;
}

export const exerciseLine = (e: LoadShape) => { const l = loadText(e); return `${e.sets}×${e.reps}${l ? `, ${l}` : ''}`; };
