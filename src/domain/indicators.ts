// Indicadores do período (7 ou 28 dias): números dela contra as referências que a ciência usa para quem treina.
import type { Food, Meal, SkinLog, Water, Wellness, Workout } from '../db/types';
import { addDays, type DateKey } from '../lib/dates';
import { totals } from './nutrition';
import { effectiveHrv, effectiveSleep } from './wellness';
import { trainingLoad } from './load';

export interface DayRow { date: DateKey; p?: number; kcal?: number; water?: number; sleep?: number; tss?: number; skin: number }
export interface Indicators {
  days: DayRow[]; n: number;
  food: { loggedDays: number; kcalAvg?: number; pAvg?: number; pPerKg?: number; pDaysOk: number; pTarget?: number; waterAvg?: number; waterDaysOk: number };
  training: { sessions: number; minutes: number; tss: number; fitness?: number; fitnessDelta?: number; form?: number };
  recovery: { sleepAvg?: number; nights7: number; nightsLogged: number; hrvAvg?: number; hrvTrend?: number; rhrAvg?: number };
  skin: { am: number; pm: number };
  weight?: { from: number; to: number; perWeek: number };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function indicators(o: { to: DateKey; n: number; meals: Meal[]; foods: Food[]; water: Water[]; wellness: Wellness[]; workouts: Workout[]; history: Workout[]; skin: SkinLog[]; goal?: { kcal?: number; p?: number }; waterGoal?: number; weightKg?: number }): Indicators {
  const from = addDays(o.to, -(o.n - 1));
  const dates = Array.from({ length: o.n }, (_, i) => addDays(from, i));
  const days: DayRow[] = dates.map((d) => {
    const m = o.meals.filter((x) => x.date === d && x.items.length);
    const t = m.length ? totals(m.flatMap((x) => x.items), o.foods).n : undefined;
    const wl = o.water.filter((x) => x.date === d).reduce((a, x) => a + x.ml, 0);
    const wel = o.wellness.find((x) => x.date === d);
    const tss = o.workouts.filter((x) => x.date === d).reduce((a, x) => a + (x.metrics?.tss ?? 0), 0);
    return { date: d, p: t?.p, kcal: t?.kcal, water: wl || undefined, sleep: wel ? effectiveSleep(wel)?.h : undefined, tss: tss || undefined, skin: o.skin.filter((s) => s.date === d && !s.skipped).length };
  });
  const logged = days.filter((d) => d.kcal != null);
  const kg = o.weightKg;
  const pTarget = o.goal?.p ?? (kg ? 1.6 * kg : undefined);
  const pAvg = avg(logged.map((d) => d.p!));
  const waterDays = days.filter((d) => d.water);
  const ws = o.workouts.filter((w) => w.date >= from && w.date <= o.to && !w.deleted);
  const load = o.history.length ? trainingLoad(o.history, addDays(o.to, -120), o.to) : [];
  const now = load[load.length - 1];
  const before = load[load.length - 1 - o.n];
  const sleeps = days.map((d) => d.sleep).filter((x): x is number => x != null);
  const hrvs = dates.map((d) => { const w = o.wellness.find((x) => x.date === d); return w ? effectiveHrv(w) : undefined; }).filter((x): x is number => x != null);
  const half = Math.floor(hrvs.length / 2);
  const weights = o.wellness.filter((w) => w.date >= from && w.date <= o.to && (w as any).weight).sort((a, b) => (a.date < b.date ? -1 : 1));
  let weight: Indicators['weight'];
  if (weights.length >= 2) {
    const a = weights[0], b = weights[weights.length - 1];
    const span = Math.max(1, (new Date(b.date).getTime() - new Date(a.date).getTime()) / 86_400_000);
    weight = { from: (a as any).weight, to: (b as any).weight, perWeek: (((b as any).weight - (a as any).weight) / span) * 7 };
  }
  return {
    days, n: o.n,
    food: {
      loggedDays: logged.length, kcalAvg: avg(logged.map((d) => d.kcal!)), pAvg, pPerKg: pAvg != null && kg ? pAvg / kg : undefined,
      pDaysOk: pTarget ? logged.filter((d) => d.p! >= pTarget * 0.9).length : 0, pTarget,
      waterAvg: avg(waterDays.map((d) => d.water!)), waterDaysOk: o.waterGoal ? waterDays.filter((d) => d.water! >= o.waterGoal! * 0.9).length : 0
    },
    training: { sessions: ws.length, minutes: ws.reduce((a, w) => a + (w.duration ?? 0), 0), tss: ws.reduce((a, w) => a + (w.metrics?.tss ?? 0), 0), fitness: now?.ctl, fitnessDelta: now && before ? now.ctl - before.ctl : undefined, form: now?.tsb },
    recovery: {
      sleepAvg: avg(sleeps), nights7: sleeps.filter((h) => h >= 7).length, nightsLogged: sleeps.length,
      hrvAvg: avg(hrvs), hrvTrend: hrvs.length >= 4 ? (avg(hrvs.slice(half))! - avg(hrvs.slice(0, half))!) : undefined,
      rhrAvg: avg(dates.map((d) => o.wellness.find((x) => x.date === d)?.restingHR).filter((x): x is number => x != null))
    },
    skin: { am: o.skin.filter((s) => s.period === 'am' && !s.skipped && s.date >= from).length, pm: o.skin.filter((s) => s.period === 'pm' && !s.skipped && s.date >= from).length },
    weight
  };
}
