// Ciclo menstrual: início de cada ciclo, médias e fase estimada do dia. Estimativa, não diagnóstico.
import { addDays, type DateKey } from '../lib/dates';
import type { CycleDay, Profile } from '../db/types';

const diff = (a: DateKey, b: DateKey) => Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000);

/** Primeiro dia de cada menstruação: dia com fluxo (não só escape) depois de 10+ dias sem fluxo. */
export function cycleStarts(days: CycleDay[]): DateKey[] {
  const bleed = days.filter((d) => !d.deleted && d.flow && d.flow !== 'spotting').map((d) => d.date).sort();
  const out: DateKey[] = [];
  for (const d of bleed) if (!out.length || diff(d, out[out.length - 1]) >= 10 && !bleed.some((x) => x < d && diff(d, x) < 10 && diff(d, x) > 0)) out.push(d);
  return out;
}

export interface CycleStats { starts: DateKey[]; avgLength?: number; avgPeriod?: number; lastStart?: DateKey }

export function cycleStats(days: CycleDay[], profile?: Profile): CycleStats {
  const starts = cycleStarts(days);
  const lens = starts.slice(1).map((s, i) => diff(s, starts[i])).filter((n) => n >= 18 && n <= 45).slice(-6);
  const bleedSet = new Set(days.filter((d) => !d.deleted && d.flow && d.flow !== 'spotting').map((d) => d.date));
  const periods = starts.map((s) => { let n = 0; while (bleedSet.has(addDays(s, n))) n++; return n; }).filter((n) => n > 0).slice(-6);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : undefined);
  return { starts, avgLength: avg(lens) ?? profile?.cycle?.typicalLength, avgPeriod: avg(periods) ?? profile?.cycle?.typicalPeriod, lastStart: starts[starts.length - 1] };
}

export type Phase = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea';
export const PHASE_LABEL: Record<Phase, string> = { menstrual: 'menstrual', folicular: 'folicular', ovulatoria: 'ovulatória', lutea: 'lútea' };

/** Dia do ciclo e fase estimada para uma data. Com anticoncepcional hormonal, não há fase natural: só o dia. */
export function cycleInfo(date: DateKey, stats: CycleStats, profile?: Profile) {
  const start = [...stats.starts].reverse().find((s) => s <= date);
  if (!start) return undefined;
  const day = diff(date, start) + 1;
  const len = stats.avgLength ?? 28;
  if (day > len + 15) return undefined; // registro antigo demais para estimar
  const period = stats.avgPeriod ?? 5;
  const ovu = len - 14;
  const hormonal = !!profile?.cycle?.hormonalContraception;
  const phase: Phase | undefined = hormonal ? undefined : day <= period ? 'menstrual' : day < ovu - 1 ? 'folicular' : day <= ovu + 1 ? 'ovulatoria' : 'lutea';
  const nextStart = addDays(start, len);
  return { day, phase, start, nextStart, daysToNext: diff(nextStart, date), late: day > len + 3, estimated: !stats.avgLength || stats.starts.length < 3 };
}
