import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { get, upsert, useTestDB } from '../../src/db/db';
import type { Pauta, PautaItem } from '../../src/db/types';
import { LENTES_PADRAO, latestFio, lenteOf, markRead, prefsOf, readCount, savedItems, teaser, toggleSaved, totalMinutes, vote } from '../../src/domain/pauta';

const item = (k: number, extra: Partial<PautaItem> = {}): PautaItem => ({
  id: `2026-11-20-${k}`, lente: 'ia', titulo: `Notícia de teste ${k}: detalhe`, url: 'https://example.com', resumo: 'Resumo fictício.', impactos: [], minutos: 3, ...extra
});
const pauta = (date: string, extra: Partial<Pauta> = {}): Pauta => ({
  id: `pauta:${date}`, kind: 'pauta', date, status: 'pronta', itens: [1, 2, 3, 4, 5].map((k) => item(k)), createdAt: 1, updatedAt: 1, ...extra
} as Pauta);

let n = 0;
beforeEach(() => { useTestDB(`pauta-${++n}`); });

describe('Pauta', () => {
  it('usa as lentes padrão sem Triatlo nem Curitiba quando ela não salvou ajustes', () => {
    const p = prefsOf(null);
    expect(p.lentes.map((l) => l.id)).toEqual(['ia', 'bancos', 'marketing', 'economia', 'saude', 'mundo']);
    expect(p.lentes.some((l) => /triatlo|curitiba/i.test(l.nome))).toBe(false);
    expect(p.hora).toBe('06:30');
  });

  it('lente desconhecida vira rótulo genérico com capa padrão', () => {
    expect(lenteOf('xyz', LENTES_PADRAO)).toMatchObject({ nome: 'Geral', capa: 'vida' });
    expect(lenteOf('economia', LENTES_PADRAO).curto).toBe('Dinheiro');
  });

  it('conta lidas, minutos e resume os assuntos para o card recolhido', () => {
    const p = pauta('2026-11-20', { lidas: ['2026-11-20-1', '2026-11-20-3'] });
    expect(readCount(p)).toBe(2);
    expect(totalMinutes(p)).toBe(15);
    expect(teaser(p)).toBe('Notícia de teste 1 · Notícia de teste 2 · Notícia de teste 3 · Notícia de teste 4 · Notícia de teste 5');
    expect(readCount({ ...p, status: 'gerando' })).toBe(0);
  });

  it('marca lida, salva e desfaz no próprio registro', async () => {
    await upsert('pauta', 'pauta:2026-11-20', pauta('2026-11-20'));
    await markRead('2026-11-20', '2026-11-20-2');
    await toggleSaved('2026-11-20', '2026-11-20-4');
    let p = await get<'pauta'>('pauta:2026-11-20');
    expect(p?.lidas).toEqual(['2026-11-20-2']);
    expect(savedItems([p!]).map((x) => x.item.id)).toEqual(['2026-11-20-4']);
    await markRead('2026-11-20', '2026-11-20-2', false);
    await toggleSaved('2026-11-20', '2026-11-20-4');
    p = await get<'pauta'>('pauta:2026-11-20');
    expect(p?.lidas).toEqual([]);
    expect(p?.salvas).toEqual([]);
  });

  it('voto vira sinal para as próximas edições e tocar de novo desfaz', async () => {
    const p = pauta('2026-11-20');
    await upsert('pauta', p.id, p);
    await vote('2026-11-20', p.itens![0], 'menos');
    expect((await get<'newsprefs'>('newsprefs'))?.sinais).toMatchObject([{ lente: 'ia', voto: 'menos', date: '2026-11-20' }]);
    expect((await get<'pauta'>(p.id))?.votos).toEqual({ '2026-11-20-1': 'menos' });
    await vote('2026-11-20', p.itens![0], 'menos');
    expect((await get<'newsprefs'>('newsprefs'))?.sinais).toEqual([]);
    expect((await get<'pauta'>(p.id))?.votos).toEqual({});
  });

  it('fio de domingo vale na semana seguinte e some depois', () => {
    const dom = pauta('2026-11-15', { fio: { titulo: 'Fio', texto: 'Texto' } });
    expect(latestFio([dom, pauta('2026-11-16')], '2026-11-20')?.date).toBe('2026-11-15');
    expect(latestFio([dom], '2026-11-23')).toBeUndefined();
  });
});
