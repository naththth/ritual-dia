// Motor de alimentação do dia: quanto falta, quanto cabe em cada refeição e o que, dos alimentos dela, fecha a conta.
// Roda no aparelho, sem IA, para responder na hora. As faixas seguem a evidência em nutrição esportiva:
// - proteína distribuída em ~0,3 a 0,4 g/kg por refeição (Schoenfeld & Aragon, JISSN 2018; posição da ISSN 2017);
// - depois de sessão longa ou intensa, 0,25 a 0,4 g/kg de proteína e 0,8 a 1,2 g/kg de carboidrato nas horas seguintes
//   (ISSN 2017 sobre timing; ACSM/AND/DC 2016);
// - água: ritmo ao longo do dia, para não concentrar tudo à noite.
import type { Food, Meal, MealItem, Nutr, Workout } from '../db/types';

export interface Macros { kcal: number; p: number; c: number; f: number }
export const M0: Macros = { kcal: 0, p: 0, c: 0, f: 0 };

const pos = (x: number) => Math.max(0, x);
const r5 = (x: number) => Math.round(x / 5) * 5;

export function remainingOf(goal: Partial<Macros>, eaten: Macros): Macros {
  return { kcal: pos((goal.kcal ?? 0) - eaten.kcal), p: pos((goal.p ?? 0) - eaten.p), c: pos((goal.c ?? 0) - eaten.c), f: pos((goal.f ?? 0) - eaten.f) };
}

/** Treino que pede recuperação: longo, intenso ou com TSS alto. */
export function isDemanding(w: Pick<Workout, 'duration' | 'intensity' | 'metrics'>) {
  return (w.metrics?.tss ?? 0) >= 60 || (w.duration ?? 0) >= 75 || w.intensity === 'intensa';
}

/** Fim do treino em minutos do dia (hora local), se der para saber. */
export function workoutEndMin(w: Pick<Workout, 'startTime' | 'duration'>): number | undefined {
  if (!w.startTime) return undefined;
  const d = new Date(w.startTime);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.getHours() * 60 + d.getMinutes() + (w.duration ?? 0);
}

/** Janela pós-treino aberta: terminou há menos de 3 h e nenhuma refeição foi registrada depois. */
export function postWorkout(workouts: Workout[], meals: Meal[], nowMin: number, today: boolean): { w: Workout; minsAgo: number; demanding: boolean } | undefined {
  if (!today) return undefined;
  const cands = workouts.map((w) => ({ w, end: workoutEndMin(w) })).filter((x): x is { w: Workout; end: number } => x.end != null && nowMin - x.end >= 0 && nowMin - x.end <= 180)
    .sort((a, b) => b.end - a.end);
  const last = cands[0];
  if (!last) return undefined;
  const endMs = new Date(last.w.startTime!).getTime() + (last.w.duration ?? 0) * 60_000;
  const ateAfter = meals.some((m) => m.items.length && m.updatedAt > endMs);
  if (ateAfter) return undefined;
  return { w: last.w, minsAgo: nowMin - last.end, demanding: isDemanding(last.w) };
}

/** O que cabe nesta refeição: o que falta dividido pelas refeições que faltam, com piso de proteína por refeição
 *  e reforço de carboidrato no pós-treino exigente. Nunca passa do que falta no dia. */
export function mealTarget(o: { remaining: Macros; mealsLeft: number; weightKg?: number; post?: { demanding: boolean }; dayKcal?: number }): Macros {
  const n = Math.max(1, o.mealsLeft);
  const kg = o.weightKg ?? 0;
  const rem = o.remaining;
  let p = rem.p / n;
  if (kg) p = Math.min(rem.p, Math.max(p, 0.3 * kg));
  let c = rem.c / n;
  if (o.post?.demanding && kg) c = Math.min(rem.c, Math.max(c, 0.8 * kg));
  let f = rem.f / n;
  // Uma refeição não carrega o dia: até ~0,55 g/kg de proteína e ~35% das calorias do dia. O que sobrar não precisa ser forçado.
  if (kg) p = Math.min(p, 0.55 * kg);
  let kcal = 4 * p + 4 * c + 9 * f;
  if (o.dayKcal && kcal > o.dayKcal * 0.35) { const k = (o.dayKcal * 0.35) / kcal; c *= k; f *= k; kcal = 4 * p + 4 * c + 9 * f; if (kcal > o.dayKcal * 0.35) { p *= (o.dayKcal * 0.35) / kcal; kcal = o.dayKcal * 0.35; } }
  if (rem.kcal && kcal > rem.kcal) { const k = rem.kcal / kcal; p *= Math.max(k, 0.85); c *= k; f *= k; kcal = 4 * p + 4 * c + 9 * f; }
  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

export interface FoodPick { food: Food; grams: number; n: Macros; why: 'proteína' | 'carboidrato' | 'vegetal'; label: string }

const per = (f: Food, g: number): Macros => ({ kcal: (f.n!.kcal * g) / 100, p: (f.n!.p * g) / 100, c: (f.n!.c * g) / 100, f: (f.n!.f * g) / 100 });

/** Texto da porção: medida caseira quando houver uma que caiba bem, senão gramas. */
export function portionLabel(f: Food, grams: number): string {
  const m = (f.measures ?? []).filter((x) => x.grams > 0 && !/^\d+\s*g$/i.test(x.label)).map((x) => ({ x, q: grams / x.grams })).find((y) => y.q >= 0.5 && y.q <= 4);
  if (m) { const q = Math.round(m.q * 2) / 2; return `${String(q).replace('.', ',')} × ${m.x.label}`; }
  return `${grams} g`;
}

/** Dos alimentos que ela usa, o que fecha o que falta nesta refeição: uma fonte de proteína e, se couber, uma de carboidrato e um vegetal. */
export function pickFoods(gap: Macros, foods: Food[], usage: Map<string, number>, exclude: Set<string> = new Set()): FoodPick[] {
  const pool = foods.filter((f) => !f.archived && f.n && f.n.kcal > 0 && !exclude.has(f.id));
  const used = (f: Food) => usage.get(f.id) ?? 0;
  const out: FoodPick[] = [];
  const known = pool.filter((f) => used(f) > 0);
  const base = known.length >= 3 ? known : pool;
  if (gap.p >= 8) {
    // densidade de proteína (g por 100 kcal), desempatando pelo quanto ela come
    const prot = base.filter((f) => f.n!.p >= 8 && (f.n!.p * 4) / f.n!.kcal >= 0.3)
      .sort((a, b) => (b.n!.p / b.n!.kcal) - (a.n!.p / a.n!.kcal) + (used(b) - used(a)) * 0.004)[0];
    if (prot) {
      const g = Math.min(250, Math.max(40, r5((gap.p * 0.85 * 100) / prot.n!.p)));
      out.push({ food: prot, grams: g, n: per(prot, g), why: 'proteína', label: portionLabel(prot, g) });
    }
  }
  const pGot = out.reduce((a, x) => a + x.n.p, 0);
  const cLeft = gap.c - out.reduce((a, x) => a + x.n.c, 0);
  if (cLeft >= 15) {
    const carb = base.filter((f) => f.n!.c >= 15 && f.n!.f < 10 && !out.some((x) => x.food.id === f.id))
      .sort((a, b) => used(b) - used(a) || (b.n!.c / b.n!.kcal) - (a.n!.c / a.n!.kcal))[0];
    if (carb) {
      const g = Math.min(300, Math.max(30, r5((cLeft * 0.9 * 100) / carb.n!.c)));
      out.push({ food: carb, grams: g, n: per(carb, g), why: 'carboidrato', label: portionLabel(carb, g) });
    }
  }
  const veg = base.filter((f) => /vegeta|verdura|legume|hortali|salada/i.test(`${f.type} ${f.name}`) && f.n!.kcal < 60 && !out.some((x) => x.food.id === f.id))
    .sort((a, b) => used(b) - used(a))[0];
  if (veg && pGot >= 0) out.push({ food: veg, grams: 100, n: per(veg, 100), why: 'vegetal', label: portionLabel(veg, 100) });
  return out;
}

/** Quanto do dia já passou entre acordar e a última refeição (0 a 1), para medir ritmo. */
export function dayFraction(nowMin: number, startMin = 7 * 60, endMin = 21 * 60) {
  return Math.min(1, Math.max(0, (nowMin - startMin) / (endMin - startMin)));
}

/** Uso de cada alimento nas refeições recentes. */
export function usageOf(meals: Meal[]): Map<string, number> {
  const c = new Map<string, number>();
  meals.forEach((m) => m.items.forEach((i: MealItem) => c.set(i.foodId, (c.get(i.foodId) ?? 0) + 1)));
  return c;
}

export const toMacros = (n: Nutr): Macros => ({ kcal: n.kcal, p: n.p, c: n.c, f: n.f });
