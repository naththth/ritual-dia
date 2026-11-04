import { describe, expect, it } from 'vitest';
import { lastMealOf, nextMealType } from '../../src/domain/repeat';

const meal = (date: string, mealType: string, n = 2, updatedAt = 1): any => ({ id: `meal:${date}:${mealType}`, kind: 'meal', date, mealType, items: Array.from({ length: n }, (_, i) => ({ foodId: `f${i}`, portion: '1' })), updatedAt, createdAt: 1, deleted: 0 });

describe('repetir refeição', () => {
  it('pega a mais recente do mesmo tipo, antes do dia, com itens', () => {
    const ms = [meal('2026-10-30', 'almoco'), meal('2026-11-01', 'almoco'), meal('2026-11-02', 'almoco', 0), meal('2026-11-03', 'almoco'), meal('2026-11-02', 'cafe')];
    expect(lastMealOf(ms, 'almoco', '2026-11-03')?.date).toBe('2026-11-01');
    expect(lastMealOf(ms, 'jantar', '2026-11-03')).toBeUndefined();
  });
  it('próxima refeição: a primeira sem registro que ainda não passou há mais de 1 h', () => {
    const types = [{ id: 'cafe' }, { id: 'almoco' }, { id: 'lanche' }, { id: 'jantar' }];
    const times = { cafe: '07:30', almoco: '12:30', lanche: '16:00', jantar: '20:00' };
    expect(nextMealType(types, times, new Set(['cafe']), 13 * 60)).toBe('almoco');
    expect(nextMealType(types, times, new Set(['cafe']), 14 * 60)).toBe('lanche');
    expect(nextMealType(types, times, new Set(['cafe', 'almoco', 'lanche', 'jantar']), 14 * 60)).toBeUndefined();
  });
});
