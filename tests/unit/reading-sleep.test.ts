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
