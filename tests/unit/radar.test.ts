import { describe, expect, it } from 'vitest';
import { radar } from '../../src/domain/radar';

const base = { nowMin: 15 * 60, today: true, dayFrac: 0.57, weightKg: 89 };

describe('radar do dia', () => {
  it('pós-treino vem primeiro e traz as faixas por kg', () => {
    const r = radar({ ...base, post: { minsAgo: 40, demanding: true, name: 'Pedal', nextMealId: 'lanche' }, protein: { eaten: 30, goal: 135 } });
    expect(r[0].id).toBe('post');
    expect(r[0].text).toContain('27 a 36 g de proteína');
    expect(r[0].text).toContain('71 a 107 g de carboidrato');
    expect(r.map((x) => x.id)).toContain('protein');
  });
  it('não avisa proteína quando está no ritmo nem cedo demais', () => {
    expect(radar({ ...base, protein: { eaten: 70, goal: 135 } }).some((x) => x.id === 'protein')).toBe(false);
    expect(radar({ ...base, dayFrac: 0.1, protein: { eaten: 0, goal: 135 } }).some((x) => x.id === 'protein')).toBe(false);
  });
  it('água, sono, VFC, fadiga, UV e noite pendente', () => {
    const r = radar({ ...base, nowMin: 22 * 60, water: { ml: 500, goal: 3000 }, sleepH: 5.75, plannedIntense: true, hrv: 38, hrvAvg: 50, form: -30, weather: { uvMax: 9, tMax: 31, humidity: 35 }, skin: { amDone: false, pmDone: false, amTime: '07:00', pmTime: '21:30' } });
    const ids = r.map((x) => x.id);
    for (const id of ['water', 'sleep', 'hrv', 'form', 'uv', 'heat', 'dry', 'pm']) expect(ids).toContain(id);
    expect(r.find((x) => x.id === 'sleep')!.title).toBe('Noite curta: 5h45');
  });
  it('sem dados, sem avisos', () => {
    expect(radar({ nowMin: 600, today: true, dayFrac: 0.2 })).toEqual([]);
  });
});
