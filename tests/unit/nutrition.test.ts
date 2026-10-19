import { describe, expect, it } from 'vitest';
import { gramsFor, itemNutr, portionOptions, searchList, totals } from '../../src/domain/nutrition';
import type { Food } from '../../src/db/types';

const base = { createdAt: 1, updatedAt: 1, kind: 'food' as const, type: 'Proteína', portions: [] as string[] };
const ovo: Food = { ...base, id: 'ovo', name: 'Ovo', n: { kcal: 146, p: 13.3, c: 0.6, f: 9.5 }, measures: [{ label: '100 g', grams: 100 }, { label: '1 un.', grams: 50 }] };
const pao: Food = { ...base, id: 'pao', name: 'Pão de forma', n: { kcal: 253, p: 9.4, c: 49.9, f: 3.7 }, measures: [{ label: '1 fatia', grams: 25 }], portions: ['1 fatia', '2 fatias'] };
const pizza: Food = { ...base, id: 'pizza', name: 'Pizza', portions: ['1 fatia'] };

describe('porções e calorias', () => {
  it('converte unidades e gramas', () => {
    expect(gramsFor(ovo, '3 un.')).toBe(150);
    expect(gramsFor(pao, '2 fatias')).toBe(50);
    expect(gramsFor(ovo, '140 g')).toBe(140);
    expect(gramsFor(ovo, 'M')).toBeUndefined();
    expect(gramsFor(ovo, 'qualquer', 80)).toBe(80);
  });
  it('calcula a refeição e aponta itens sem dados', () => {
    const t = totals([{ foodId: 'ovo', portion: '3 un.' }, { foodId: 'pao', portion: '2 fatias' }, { foodId: 'pizza', portion: '1 fatia' }], [ovo, pao, pizza]);
    expect(Math.round(t.n.kcal)).toBe(219 + 127);
    expect(t.missing).toBe(1);
    expect(itemNutr(pizza, { foodId: 'pizza', portion: '1 fatia' })).toBeUndefined();
  });
  it('oferece múltiplos das medidas caseiras', () => {
    expect(portionOptions(ovo)).toEqual(['100 g', '1 un.', '2 un.', '3 un.']);
    expect(portionOptions(pao)).toEqual(['1 fatia', '2 fatias', '3 fatias']);
  });
  it('busca sem acento e em qualquer ordem', () => {
    const list = ['Frango, peito, sem pele, grelhado', 'Pão, trigo, forma, integral', 'Feijão, carioca, cozido'];
    expect(searchList(list, 'pao forma', (x) => x)).toEqual(['Pão, trigo, forma, integral']);
    expect(searchList(list, 'feij', (x) => x)).toEqual(['Feijão, carioca, cozido']);
  });
});
