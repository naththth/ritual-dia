import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { all, create, db, get, remove, update, useTestDB } from '../../src/db/db';
import { resetGoogleTasksSync, syncGoogleTasks, type Api, type Op, type OpResult, type RTask } from '../../src/domain/gtasks';
import type { Task } from '../../src/db/types';

// Google Tasks de mentira, em memória: duas listas (DBC e Pessoal), com subtarefas e exclusão marcada.
function fakeGoogle() {
  const lists = { dbc: 'LDBC', pessoal: 'LPES' };
  const tasks = new Map<string, RTask>();
  let n = 0;
  let clock = Date.parse('2026-11-16T12:00:00Z');
  const stamp = () => new Date((clock += 1000)).toISOString();
  const calls: Op[][] = [];
  const put = (t: Partial<RTask> & { list: string; title: string }) => {
    const id = `g${++n}`;
    const r: RTask = { status: 'needsAction', updated: stamp(), position: String(1000 - n).padStart(5, '0'), ...t, id };
    tasks.set(id, r);
    return r;
  };
  const api: Api = {
    async sync() { return { status: 'ok', lists, tasks: [...tasks.values()].map((t) => ({ ...t })) }; },
    async batch(ops) {
      calls.push(ops);
      const rs: OpResult[] = [];
      for (const o of ops) {
        if (o.op === 'create') {
          const parent = typeof o.parentRef === 'number' ? rs[o.parentRef]?.task?.id : o.parent;
          const r = put({ list: o.list, parent, title: o.task.title ?? '', notes: o.task.notes || undefined, due: o.task.due ?? undefined, status: o.task.status ?? 'needsAction', completed: o.task.completed ?? undefined });
          rs.push({ task: { ...r } });
        } else if (o.op === 'patch') {
          const r = tasks.get(o.id)!;
          const f = o.task;
          Object.assign(r, { ...('title' in f ? { title: f.title } : {}), ...('notes' in f ? { notes: f.notes || undefined } : {}), ...('due' in f ? { due: f.due ?? undefined } : {}), ...('status' in f ? { status: f.status } : {}), ...('completed' in f ? { completed: f.completed ?? undefined } : {}), updated: stamp() });
          rs.push({ task: { ...r } });
        } else if (o.op === 'move') {
          const r = tasks.get(o.id)!;
          r.list = o.dest; r.updated = stamp();
          for (const k of tasks.values()) if (k.parent === r.id) k.list = o.dest;
          rs.push({ task: { ...r } });
        } else {
          const r = tasks.get(o.id);
          if (r) { r.deleted = true; r.updated = stamp(); for (const k of tasks.values()) if (k.parent === r.id) { k.deleted = true; k.updated = stamp(); } }
          rs.push({ ok: true });
        }
      }
      return rs;
    }
  };
  return { api, lists, tasks, put, calls, stamp };
}

const baseTask = (p: Partial<Task>) => ({ title: 'x', categoryId: 'cat:pessoal', priority: 'media', status: 'pendente', tags: [], subtasks: [], history: [], plannedDate: null, ...p }) as any;
const top = (g: ReturnType<typeof fakeGoogle>) => [...g.tasks.values()].filter((t) => !t.parent && !t.deleted);

let n = 0;
beforeEach(async () => {
  useTestDB(`gtasks-${++n}`);
  await db.open();
  resetGoogleTasksSync();
});

describe('Google Tasks: conciliação', () => {
  it('migra tudo uma vez: pessoais para Pessoal, trabalho para DBC, concluídas com a data, subtarefas na ordem; arquivada fica', async () => {
    const g = fakeGoogle();
    await create('task', baseTask({ title: 'Comprar estante', plannedDate: '2026-11-20', description: 'vermelha, alta', priority: 'alta', subtasks: [{ id: 's1', title: 'Medir parede', done: true }, { id: 's2', title: 'Ver lojas', done: false }] }));
    await create('task', baseTask({ title: 'Planilha de metas', categoryId: 'cat:trabalho', status: 'concluida', completedDate: '2026-11-10' }));
    await create('task', baseTask({ title: 'Velha', categoryId: 'cat:compras', status: 'arquivada' }));
    await syncGoogleTasks({ force: true, api: g.api });

    const tops = top(g);
    expect(tops.map((t) => t.title).sort()).toEqual(['Comprar estante', 'Planilha de metas']);
    const est = tops.find((t) => t.title === 'Comprar estante')!;
    expect(est.list).toBe(g.lists.pessoal);
    expect(est.due).toBe('2026-11-20');
    expect(est.notes).toBe('vermelha, alta');
    const kids = [...g.tasks.values()].filter((k) => k.parent === est.id).sort((a, b) => a.position!.localeCompare(b.position!));
    expect(kids.map((k) => [k.title, k.status])).toEqual([['Medir parede', 'completed'], ['Ver lojas', 'needsAction']]);
    const pl = tops.find((t) => t.title === 'Planilha de metas')!;
    expect(pl.list).toBe(g.lists.dbc);
    expect(pl.status).toBe('completed');
    expect(pl.completed?.slice(0, 10)).toBe('2026-11-10');

    const locals = await all('task');
    expect(locals.filter((t) => t.g).length).toBe(2);
    expect(locals.find((t) => t.title === 'Velha')!.g).toBeUndefined();

    // Segunda rodada sem mudanças: nada sobe e nada muda aqui (prioridade continua alta).
    const before = g.calls.length;
    await syncGoogleTasks({ force: true, api: g.api });
    await syncGoogleTasks({ force: true, api: g.api });
    expect(g.calls.length).toBe(before);
    const again = await all('task');
    expect(again.find((t) => t.title === 'Comprar estante')!.priority).toBe('alta');
    expect(again.find((t) => t.title === 'Comprar estante')!.subtasks.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('o que ela anota no PC entra aqui, na lista certa, com subtarefas; concluir no Google conclui aqui', async () => {
    const g = fakeGoogle();
    const r = g.put({ list: g.lists.dbc, title: 'Email com status dos leads', due: '2026-11-24', notes: 'para o Jaime' });
    g.put({ list: g.lists.dbc, parent: r.id, title: 'Puxar do CRM' });
    g.put({ list: g.lists.pessoal, title: 'Ligar para a mãe' });
    await syncGoogleTasks({ force: true, api: g.api });
    const locals = await all('task');
    const t = locals.find((x) => x.title === 'Email com status dos leads')!;
    expect(t.categoryId).toBe('cat:trabalho');
    expect(t.plannedDate).toBe('2026-11-24');
    expect(t.description).toBe('para o Jaime');
    expect(t.priority).toBe('media');
    expect(t.subtasks.map((s) => s.title)).toEqual(['Puxar do CRM']);
    expect(locals.find((x) => x.title === 'Ligar para a mãe')!.categoryId).toBe('cat:pessoal');
    expect(g.calls.length).toBe(0);

    // Ela muda a prioridade aqui (só no Ritual): nada sobe.
    await update<'task'>(t.id, { priority: 'alta' });
    await syncGoogleTasks({ force: true, api: g.api });
    expect(g.calls.length).toBe(0);

    // Conclui no Google: chega concluída aqui e a prioridade fica.
    Object.assign(g.tasks.get(r.id)!, { status: 'completed', completed: '2026-11-17T18:00:00.000Z', updated: g.stamp() });
    await syncGoogleTasks({ force: true, api: g.api });
    const after = (await get<'task'>(t.id))!;
    expect(after.status).toBe('concluida');
    expect(after.completedDate).toBe('2026-11-17');
    expect(after.priority).toBe('alta');
  });

  it('mudanças daqui sobem: título, dia, troca para DBC (move), subtarefa nova e excluída', async () => {
    const g = fakeGoogle();
    const t = await create('task', baseTask({ title: 'Análise diferenciais', subtasks: [{ id: 'a', title: 'Levantar cases', done: false }] }));
    await syncGoogleTasks({ force: true, api: g.api });
    const gid = (await get<'task'>(t.id))!.g!.id;

    await update<'task'>(t.id, { title: 'Análise diferenciais DBC', plannedDate: '2026-11-19', categoryId: 'cat:trabalho', subtasks: [{ id: 'b', title: 'Montar slide', done: false }] });
    await syncGoogleTasks({ force: true, api: g.api });
    const r = g.tasks.get(gid)!;
    expect(r.title).toBe('Análise diferenciais DBC');
    expect(r.due).toBe('2026-11-19');
    expect(r.list).toBe(g.lists.dbc);
    const kids = [...g.tasks.values()].filter((k) => k.parent === gid && !k.deleted).map((k) => k.title);
    expect(kids).toEqual(['Montar slide']);

    // Ritual confirma na próxima leitura sem nada para subir.
    const n0 = g.calls.length;
    await syncGoogleTasks({ force: true, api: g.api });
    await syncGoogleTasks({ force: true, api: g.api });
    expect(g.calls.length).toBe(n0);
    expect((await get<'task'>(t.id))!.subtasks.map((s) => s.title)).toEqual(['Montar slide']);
  });

  it('excluir aqui apaga lá; excluir lá tira daqui; desfazer uma exclusão devolve ao Google', async () => {
    const g = fakeGoogle();
    const a = await create('task', baseTask({ title: 'A' }));
    const b = await create('task', baseTask({ title: 'B' }));
    await syncGoogleTasks({ force: true, api: g.api });
    const ga = (await get<'task'>(a.id))!.g!.id;
    const gb = (await get<'task'>(b.id))!.g!.id;

    const snapshot = (await db.records.get(a.id)) as Task;
    await remove(a.id);
    await syncGoogleTasks({ force: true, api: g.api });
    expect(g.tasks.get(ga)!.deleted).toBe(true);

    // Desfazer: a tarefa volta como era (vínculo antigo) e precisa voltar ao Google.
    await db.records.put({ ...snapshot, updatedAt: Date.now() + 5000, dirty: 1 });
    await syncGoogleTasks({ force: true, api: g.api });
    const back = (await get<'task'>(a.id))!;
    expect(back.g!.id).not.toBe(ga);
    expect(g.tasks.get(back.g!.id)!.title).toBe('A');

    // Excluída no Google: sai daqui.
    Object.assign(g.tasks.get(gb)!, { deleted: true, updated: new Date(Date.now() + 60_000).toISOString() });
    await syncGoogleTasks({ force: true, api: g.api });
    expect(await get<'task'>(b.id)).toBeUndefined();
  });

  it('sem conexão, não mexe em nada e avisa', async () => {
    const api: Api = { sync: async () => ({ status: 'not_connected' }), batch: async () => [] };
    await create('task', baseTask({ title: 'A' }));
    await syncGoogleTasks({ force: true, api });
    expect((await all('task'))[0].g).toBeUndefined();
  });
});
