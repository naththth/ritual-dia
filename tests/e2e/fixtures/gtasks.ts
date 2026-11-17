import type { Page } from '@playwright/test';

/** Google Tasks de mentira para os testes: listas DBC e Pessoal, guardado no sessionStorage (sobrevive a recarregar). */
export async function fakeGoogleTasks(page: Page, initial: { list: 'dbc' | 'pessoal'; title: string; due?: string; notes?: string; parent?: number }[] = []) {
  await page.addInitScript((init) => {
    const KEY = 'gt-fake';
    const lists = { dbc: 'LDBC', pessoal: 'LPES' };
    const load = () => {
      const raw = sessionStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
      const st = { n: 0, clock: Date.parse('2026-11-01T12:00:00Z'), tasks: {} as Record<string, any> };
      const ids: string[] = [];
      for (const t of init) {
        const id = `g${++st.n}`;
        ids.push(id);
        st.tasks[id] = { id, list: lists[t.list], title: t.title, due: t.due, notes: t.notes, parent: t.parent != null ? ids[t.parent] : undefined, status: 'needsAction', updated: new Date((st.clock += 1000)).toISOString(), position: String(1000 - st.n).padStart(5, '0') };
      }
      return st;
    };
    (window as any).__gtState = () => load();
    (window as any).__RITUAL_TEST_GTASKS = (action: string, body: any) => {
      if (sessionStorage.getItem('gt-off')) return { status: 'not_connected' };
      const st = load();
      const stamp = () => new Date((st.clock += 1000)).toISOString();
      const save = () => sessionStorage.setItem(KEY, JSON.stringify(st));
      if (action === 'sync') { save(); return { status: 'ok', lists, tasks: Object.values(st.tasks) }; }
      if (action !== 'batch') return { error: 'ação inesperada' };
      const rs: any[] = [];
      for (const o of body.ops) {
        if (o.op === 'create') {
          const id = `g${++st.n}`;
          const parent = typeof o.parentRef === 'number' ? rs[o.parentRef]?.task?.id : o.parent;
          st.tasks[id] = { id, list: o.list, parent, title: o.task.title, notes: o.task.notes || undefined, due: o.task.due ?? undefined, status: o.task.status ?? 'needsAction', completed: o.task.completed ?? undefined, updated: stamp(), position: String(1000 - st.n).padStart(5, '0') };
          rs.push({ task: { ...st.tasks[id] } });
        } else if (o.op === 'patch') {
          const t = st.tasks[o.id];
          for (const k of ['title', 'notes', 'due', 'status', 'completed']) if (k in o.task) t[k] = o.task[k] ?? undefined;
          t.updated = stamp();
          rs.push({ task: { ...t } });
        } else if (o.op === 'move') {
          const t = st.tasks[o.id];
          t.list = o.dest; t.updated = stamp();
          rs.push({ task: { ...t } });
        } else {
          const t = st.tasks[o.id];
          if (t) { t.deleted = true; t.updated = stamp(); }
          rs.push({ ok: true });
        }
      }
      save();
      return { status: 'ok', results: rs };
    };
  }, initial);
}

/** Tarefas do Google de mentira, só as que não foram apagadas e sem subtarefas. */
export const googleTops = (page: Page) => page.evaluate(() => Object.values((window as any).__gtState().tasks).filter((t: any) => !t.deleted && !t.parent) as any[]);
