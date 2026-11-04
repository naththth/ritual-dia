import { describe, expect, it } from 'vitest';
import { mealTarget, pickFoods, postWorkout, remainingOf, portionLabel, dayFraction } from '../../src/domain/fuel';

const food = (id: string, name: string, type: string, kcal: number, p: number, c: number, f: number, measures?: any[]): any => ({ id, kind: 'food', name, type, portions: [], n: { kcal, p, c, f }, measures, updatedAt: 1, createdAt: 1 });
const FOODS = [
  food('frango', 'Frango grelhado', 'Proteína', 159, 32, 0, 2.5, [{ label: '1 filé', grams: 100 }]),
  food('ovo', 'Ovo', 'Proteína', 143, 13, 1, 9.5, [{ label: '1 unidade', grams: 50 }]),
  food('arroz', 'Arroz integral', 'Carboidrato', 124, 2.6, 25.8, 1),
  food('alface', 'Salada de folhas', 'Vegetais', 15, 1.3, 2.4, 0.2),
  food('castanha', 'Castanha', 'Gorduras', 650, 14, 15, 63)
];

describe('motor de alimentação', () => {
  it('falta do dia nunca fica negativa', () => {
    expect(remainingOf({ kcal: 1500, p: 120, c: 120, f: 50 }, { kcal: 1600, p: 60, c: 130, f: 30 })).toEqual({ kcal: 0, p: 60, c: 0, f: 20 });
  });
  it('alvo da refeição garante ~0,3 g/kg de proteína sem passar do que falta', () => {
    const t = mealTarget({ remaining: { kcal: 1200, p: 90, c: 100, f: 40 }, mealsLeft: 4, weightKg: 89 });
    expect(t.p).toBeGreaterThanOrEqual(26);
    expect(t.p).toBeLessThanOrEqual(90);
    expect(t.kcal).toBeLessThanOrEqual(1200);
  });
  it('pós-treino exigente reforça carboidrato até 0,8 g/kg dentro do que falta', () => {
    const t = mealTarget({ remaining: { kcal: 1500, p: 80, c: 160, f: 40 }, mealsLeft: 3, weightKg: 70, post: { demanding: true } });
    expect(t.c).toBeGreaterThanOrEqual(56);
  });
  it('sugere fonte de proteína magra, carboidrato e vegetal entre os alimentos dela', () => {
    const usage = new Map([['frango', 5], ['arroz', 4], ['alface', 3], ['ovo', 2]]);
    const picks = pickFoods({ kcal: 500, p: 35, c: 45, f: 10 }, FOODS, usage);
    expect(picks[0].food.id).toBe('frango');
    expect(picks[0].grams).toBeGreaterThanOrEqual(80);
    expect(picks.map((x) => x.why)).toEqual(['proteína', 'carboidrato', 'vegetal']);
    expect(picks.some((x) => x.food.id === 'castanha')).toBe(false);
  });
  it('porção em medida caseira quando cabe', () => {
    expect(portionLabel(FOODS[0], 150)).toBe('1,5 × 1 filé');
    expect(portionLabel(FOODS[2], 170)).toBe('170 g');
  });
  it('janela pós-treino fecha quando há refeição depois', () => {
    const start = new Date('2026-11-03T17:00:00-03:00');
    const w: any = { id: 'w', date: '2026-11-03', startTime: start.toISOString(), duration: 60, metrics: { tss: 70 } };
    const now = start.getHours() * 60 + start.getMinutes() + 120; // 1 h depois do fim, em qualquer fuso
    expect(postWorkout([w], [], now, true)?.demanding).toBe(true);
    const meal: any = { items: [{ foodId: 'frango', portion: '1' }], updatedAt: start.getTime() + 90 * 60_000 };
    expect(postWorkout([w], [meal], now, true)).toBeUndefined();
    expect(postWorkout([w], [], now + 200, true)).toBeUndefined();
  });
  it('fração do dia', () => {
    expect(dayFraction(14 * 60)).toBe(0.5);
    expect(dayFraction(5 * 60)).toBe(0);
  });
});

describe('limites por refeição', () => {
  it('última refeição não engole o resto do dia', () => {
    const t = mealTarget({ remaining: { kcal: 1100, p: 75, c: 75, f: 55 }, mealsLeft: 1, weightKg: 89, dayKcal: 1800 });
    expect(t.p).toBeLessThanOrEqual(49);
    expect(t.kcal).toBeLessThanOrEqual(630);
  });
});
