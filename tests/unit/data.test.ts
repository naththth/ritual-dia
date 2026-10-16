import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { all, db, useTestDB, upsert, remove, restore, get } from '../../src/db/db';
import { ensureDefaults } from '../../src/domain/defaults';
import { applyImport, parseImport } from '../../src/domain/import';
import { buildBackup, restoreBackup, validateBackup } from '../../src/domain/backup';

// Arquivo sintético com o mesmo formato do arquivo privado (sem dados pessoais).
const sample = {
  tarefas_pontuais: [
    { id: 't01', titulo: 'Organizar finanças', categoria: 'Compromissos', subcategoria: 'Financeiro', prioridade_inicial_sugerida: 'alta', data_planejada: null },
    { id: 't07', titulo: 'Comprar conjunto novo de treino', categoria: 'Materiais', subcategoria: 'Pessoal', prioridade_inicial_sugerida: 'média' },
    { id: 't12', titulo: 'Refazer escritório', categoria: 'Projetos', subcategoria: 'Casa', prioridade_inicial_sugerida: 'baixa' }
  ],
  habitos: [
    { id: 'hab_t31', titulo: 'Musculação', frequencia_tipo: 'semanal', meta_ocorrencias: 3, prioridade_inicial_sugerida: 'alta' },
    { id: 'hab_t29', titulo: 'Meditação', frequencia_tipo: 'diaria', meta_ocorrencias: 1 }
  ],
  metas: [{ id: 'goal_1', titulo: 'Meta de peso', metrica: 'kg' }],
  catalogo_produtos_pele_para_validacao: [
    { id: 'produto_ref_01', marca: 'Marca', nome: 'Gel', categoria: 'Limpeza', area: 'rosto' },
    { id: 'produto_ref_21', marca: 'Marca', nome: 'Retinol', categoria: 'Tratamento com ativo', area: 'rosto' },
    { id: 'produto_ref_45', marca: 'Marca', nome: 'Óleo', categoria: 'Corpo', area: 'corpo' }
  ],
  catalogo_alimentos_sugeridos: [{ nome: 'Frango', tipo: 'Proteína' }, { nome: 'Feijão', tipo: 'Leguminosas' }],
  preferencias_opcionais: { pele: ['mista'], alimentacao: ['sem lactose'] }
};

let n = 0;
beforeEach(async () => {
  useTestDB('t' + n++);
  await ensureDefaults();
});

describe('importação', () => {
  it('importa tudo sem dia marcado e sem duplicar ao repetir', async () => {
    const p = parseImport(sample);
    expect(p.preview).toMatchObject({ tasks: 3, habits: 2, goals: 1, products: 3, foods: 2 });
    const r1 = await applyImport(p, ['roupa']);
    expect(r1.created).toBe(3 + 2 + 1 + 3 + 2);
    const r2 = await applyImport(parseImport(sample), ['roupa']);
    expect(r2.created).toBe(0);
    const tasks = await all('task');
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.plannedDate === null && t.completedDate === null && t.status === 'pendente')).toBe(true);
    expect(tasks.find((t) => t.sourceId === 't07')!.tags).toEqual(['roupa']);
    expect(tasks.find((t) => t.sourceId === 't07')!.categoryId).toBe('cat:compras');
  });
  it('produtos entram para conferência; ativo marcado; hábitos ligados ao treino', async () => {
    await applyImport(parseImport(sample), []);
    const prods = await all('product');
    expect(prods.every((p) => p.status === 'conferir')).toBe(true);
    expect(prods.find((p) => p.sourceId === 'produto_ref_21')!.active).toBe(true);
    expect(prods.find((p) => p.sourceId === 'produto_ref_45')!.group).toBe('corpo');
    const habits = await all('habit');
    expect(habits.find((h) => h.title === 'Musculação')!.modalityId).toBe('mod:musculacao');
    const cat = await get<'category'>('cat:compromissos');
    expect(cat!.subcategories).toContain('Financeiro');
  });
  it('não recria item que ela excluiu', async () => {
    await applyImport(parseImport(sample), []);
    await remove('task:t12');
    await applyImport(parseImport(sample), []);
    expect((await all('task')).map((t) => t.id)).not.toContain('task:t12');
  });
  it('rejeita arquivo de outro formato', () => {
    expect(() => parseImport({ foo: 1 })).toThrow(/não reconhecido/);
  });
});

describe('registros por data e desfazer', () => {
  it('pele de segunda e terça ficam independentes', async () => {
    await upsert('skin', 'skin:2026-10-19:am', { date: '2026-10-19', period: 'am', productIds: ['a'], plannedIds: [], signals: { oleosidade: 1 } });
    await upsert('skin', 'skin:2026-10-20:am', { date: '2026-10-20', period: 'am', productIds: ['b'], plannedIds: [], signals: {} });
    const mon = await db.records.where('[kind+date]').equals(['skin', '2026-10-19']).toArray();
    expect(mon).toHaveLength(1);
    expect((mon[0] as any).productIds).toEqual(['a']);
  });
  it('desfazer restaura o estado anterior', async () => {
    await upsert('hlog', 'hlog:h:2026-10-19', { habitId: 'h', date: '2026-10-19', done: true });
    const before = await db.records.get('hlog:h:2026-10-19');
    await upsert('hlog', 'hlog:h:2026-10-19', { habitId: 'h', date: '2026-10-19', done: false });
    await restore(before, 'hlog:h:2026-10-19');
    expect((await get<'hlog'>('hlog:h:2026-10-19'))!.done).toBe(true);
    await restore(undefined, 'hlog:h:2026-10-19');
    expect(await get('hlog:h:2026-10-19')).toBeUndefined();
  });
});

describe('backup', () => {
  it('gera, valida e restaura mantendo a versão mais nova', async () => {
    await applyImport(parseImport(sample), []);
    const b = JSON.parse(JSON.stringify(await buildBackup(false)));
    expect(() => validateBackup(b)).not.toThrow();
    // muda localmente depois do backup
    const t = (await get<'task'>('task:t01'))!;
    await upsert('task', t.id, { ...t, title: 'Editado depois' });
    await remove('task:t12');
    const r = await restoreBackup(validateBackup(b));
    expect((await get<'task'>('task:t01'))!.title).toBe('Editado depois');
    expect(r.kept).toBeGreaterThan(0);
  });
  it('restaura em aparelho vazio', async () => {
    await applyImport(parseImport(sample), []);
    const b = JSON.parse(JSON.stringify(await buildBackup(false)));
    useTestDB('vazio' + n++);
    await restoreBackup(validateBackup(b));
    expect(await all('task')).toHaveLength(3);
  });
  it('recusa arquivo que não é backup', () => {
    expect(() => validateBackup({ app: 'x', records: [] })).toThrow();
    expect(() => validateBackup({ app: 'ritual', version: 99, records: [] })).toThrow(/mais nova/);
  });
});
