import { useLiveQuery } from 'dexie-react-hooks';
import { all, byDateRange } from '../db/db';
import type { DateKey } from '../lib/dates';
import type { DayFacts } from './rules';

export const MODULE_COLORS = {
  skin: 'var(--rose-2)',
  food: 'var(--honey-2)',
  training: 'var(--blue-2)',
  habits: 'var(--olive-2)',
  tasks: 'var(--wine)'
};

export type FactsMap = Record<DateKey, DayFacts & { tasks: boolean }>;

/** Quais áreas têm registro em cada dia do intervalo (para pontos do calendário e resumo). */
export function useFacts(from: DateKey, to: DateKey): FactsMap | undefined {
  return useLiveQuery(async () => {
    const [skin, meals, water, workouts, hlogs, skips, tasks] = await Promise.all([
      byDateRange('skin', from, to),
      byDateRange('meal', from, to),
      byDateRange('water', from, to),
      byDateRange('workout', from, to),
      byDateRange('hlog', from, to),
      byDateRange('skip', from, to),
      all('task')
    ]);
    const map: FactsMap = {};
    const f = (d: DateKey) => (map[d] ??= { skinAm: false, skinPm: false, food: false, training: false, habits: false, tasks: false });
    for (const s of skin) { if (s.period === 'am') f(s.date).skinAm = true; else if (s.period === 'pm') f(s.date).skinPm = true; }
    for (const m of meals) if (m.items.length) f(m.date).food = true;
    for (const w of water) f(w.date).food = true;
    for (const w of workouts) f(w.date).training = true;
    for (const s of skips) if (s.domain === 'training') f(s.date).training = true;
    for (const h of hlogs) if (h.done) f(h.date).habits = true;
    for (const t of tasks) if (t.completedDate && t.completedDate >= from && t.completedDate <= to) f(t.completedDate).tasks = true;
    return map;
  }, [from, to]);
}

export function factDots(f?: DayFacts & { tasks: boolean }) {
  if (!f) return [];
  const out: string[] = [];
  if (f.skinAm || f.skinPm) out.push(MODULE_COLORS.skin);
  if (f.food) out.push(MODULE_COLORS.food);
  if (f.training) out.push(MODULE_COLORS.training);
  if (f.habits) out.push(MODULE_COLORS.habits);
  if (f.tasks) out.push(MODULE_COLORS.tasks);
  return out;
}
