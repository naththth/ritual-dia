import { describe, expect, it } from 'vitest';
import { indicators } from '../../src/domain/indicators';

const food: any = { id: 'f', kind: 'food', name: 'Frango', type: 'Proteína', portions: [], n: { kcal: 160, p: 32, c: 0, f: 3 } };
const meal = (date: string, g: number): any => ({ id: `meal:${date}:almoco`, kind: 'meal', date, mealType: 'almoco', items: [{ foodId: 'f', portion: `${g} g`, grams: g }] });

describe('indicadores', () => {
  it('médias só dos dias registrados e dias de proteína na meta', () => {
    const r = indicators({ to: '2026-11-03', n: 7, meals: [meal('2026-11-01', 500), meal('2026-11-02', 300)], foods: [food], water: [{ date: '2026-11-02', ml: 3000 } as any], wellness: [{ date: '2026-11-02', sleepH: 7.5, hrv: 50, weight: 89 } as any, { date: '2026-11-03', sleepH: 6, weight: 88.6 } as any], workouts: [], history: [], skin: [{ date: '2026-11-03', period: 'am' } as any], goal: { p: 140 }, waterGoal: 3000, weightKg: 89 });
    expect(r.food.loggedDays).toBe(2);
    expect(Math.round(r.food.pAvg!)).toBe(128);
    expect(r.food.pDaysOk).toBe(1);
    expect(r.food.waterDaysOk).toBe(1);
    expect(r.recovery.nights7).toBe(1);
    expect(r.recovery.nightsLogged).toBe(2);
    expect(r.skin.am).toBe(1);
    expect(r.weight!.to).toBe(88.6);
    expect(r.days).toHaveLength(7);
  });
});
