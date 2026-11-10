import { describe, expect, it } from 'vitest';
import { coverCandidates, coverFromAmazon, isbn10 } from '../../src/domain/goodreads';
import { wakeDetail } from '../../src/domain/sleep';

describe('capas de livro', () => {
  it('converte ISBN-13 978 em ISBN-10, inclusive com X', () => {
    expect(isbn10('9788551306154')).toBe('8551306154');
    expect(isbn10('9786555603507')).toBe('655560350X');
    expect(isbn10('9791032305690')).toBeUndefined(); // 979 não tem ISBN-10
    expect(isbn10('978-0-306-40615-7')).toBe('0306406152');
    expect(isbn10('0306406152')).toBe('0306406152');
    expect(isbn10(undefined)).toBeUndefined();
  });
  it('tenta a capa salva, depois Amazon e Open Library, sem repetir', () => {
    const c = coverCandidates({ isbn: '9788551306154', cover: 'https://covers.openlibrary.org/b/isbn/9788551306154-M.jpg?default=false' });
    expect(c).toHaveLength(2);
    expect(c[1]).toBe(coverFromAmazon('9788551306154'));
    expect(coverCandidates({})).toEqual([]);
  });
});

describe('acordar na linha do tempo', () => {
  it('sem relógio, é só a meta', () => {
    expect(wakeDetail(8)).toBe('Horário-meta, meta de 8 h de sono');
  });
  it('com o sono do relógio, mostra quanto dormiu', () => {
    expect(wakeDetail(8, { sleepH: 9.23 })).toBe('Dormiu 9h14 pelo relógio, meta de 8 h');
    expect(wakeDetail(8, { sleepH: 6.999 })).toBe('Dormiu 7h00 pelo relógio, meta de 8 h');
  });
  it('com horário digitado, mostra quando acordou e vale o sono corrigido à mão', () => {
    expect(wakeDetail(8, { sleepH: 9, sleepManualH: 7.5, sleepEnd: '06:20' })).toBe('Acordou às 06:20, dormiu 7h30 (meta de 8 h)');
  });
});

import { bedToWakeH } from '../../src/domain/sleep';
import { mealSummary, shortFoodName } from '../../src/domain/nutrition';

describe('sono pela cama', () => {
  it('atravessa a meia-noite e recusa o impossível', () => {
    expect(bedToWakeH('22:00', '06:00')).toBe(8);
    expect(bedToWakeH('23:10', '06:05')).toBe(6.92);
    expect(bedToWakeH('06:00', '06:00')).toBeUndefined();
    expect(bedToWakeH(undefined, '06:00')).toBeUndefined();
  });
});

describe('refeição curta na linha do tempo', () => {
  const foods: any[] = [
    { id: 'a', name: 'Pão, de queijo, assado', n: { kcal: 363, p: 5, c: 34, f: 24 } },
    { id: 'b', name: 'Queijo, parmesão', n: { kcal: 453, p: 36, c: 2, f: 34 } },
    { id: 'c', name: 'Ovo, de galinha, inteiro, cozido', n: { kcal: 146, p: 13, c: 1, f: 10 } },
    { id: 'd', name: 'Café coado (estimado)', n: { kcal: 2, p: 0, c: 0, f: 0 } }
  ];
  it('nomes curtos', () => {
    expect(shortFoodName('Pão, de queijo, assado')).toBe('Pão de queijo');
    expect(shortFoodName('Queijo, parmesão')).toBe('Queijo');
    expect(shortFoodName('Molho branco com limão siciliano (estimado)')).toBe('Molho branco com limão siciliano');
  });
  it('mostra o que mais pesa e quantos faltam', () => {
    const s = mealSummary([{ foodId: 'd', portion: '100 g', grams: 100 }, { foodId: 'a', portion: '100 g', grams: 100 }, { foodId: 'c', portion: '50 g', grams: 50 }, { foodId: 'b', portion: '20 g', grams: 20 }] as any, foods as any);
    expect(s.startsWith('Pão de queijo, ')).toBe(true);
    expect(s).toContain('e mais 2');
    expect(s).toContain('kcal');
  });
});

import { paceLabel } from '../../src/domain/fit';
describe('ritmo', () => {
  it('corrida em min/km e natação em min/100 m', () => {
    expect(paceLabel('mod:corrida', 30, 5)).toBe('6:00/km');
    expect(paceLabel('mod:corrida', 47, 8.2)).toBe('5:44/km');
    expect(paceLabel('mod:natacao', 40, 2)).toBe('2:00/100 m');
    expect(paceLabel('mod:ciclismo', 60, 30)).toBeUndefined();
    expect(paceLabel('mod:corrida', 30, 0)).toBeUndefined();
  });
});

import { stalledDays } from '../../src/domain/goodreads';
describe('livro parado', () => {
  const b = { id: 'b1', status: 'lendo' as const, startedAt: '2026-09-01' };
  it('avisa depois de 3 semanas sem página', () => {
    expect(stalledDays(b, [], '2026-11-09')).toBe(69);
    expect(stalledDays(b, [{ bookId: 'b1', date: '2026-11-01' }], '2026-11-09')).toBeUndefined();
    expect(stalledDays({ ...b, keptAt: '2026-11-05' }, [], '2026-11-09')).toBeUndefined();
    expect(stalledDays({ ...b, status: 'lido' as any }, [], '2026-11-09')).toBeUndefined();
  });
});
