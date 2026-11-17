// Google Tasks: é onde as tarefas dela vivem, para ver e anotar também no PC. O Ritual guarda uma cópia de cada tarefa
// (o resto do app continua lendo as tarefas daqui, inclusive sem internet) e concilia nos dois sentidos:
// - lista DBC <-> categoria de trabalho da Carreira; lista Pessoal <-> todo o resto;
// - título, descrição (nota), dia (data), situação e subtarefas vão e voltam;
// - prioridade, lembrete com horário, etiquetas e o resto ficam só no Ritual (o Google não tem esses campos).
// Quem mudou por último ganha quando os dois lados mudaram a mesma tarefa.
import { create as createStore } from 'zustand';
import { db, get, notifyWrite } from '../db/db';
import { supabase, useSync } from '../sync/sync';
import { toKey, todayKey, type DateKey } from '../lib/dates';
import type { AnyRecord, GLink, Subtask, Task } from '../db/types';

export interface GTask { id: string; list: string; listName?: string; title: string; notes?: string; due?: string }
export type GTasksResult = { status: 'ok'; tasks: GTask[] } | { status: 'not_connected' | 'not_configured' };

/** Tarefa como o Google devolve (formato enxuto da função). */
export interface RTask {
  id: string; list: string; title: string; notes?: string; due?: string;
  status: 'needsAction' | 'completed'; completed?: string; parent?: string;
  deleted?: boolean; hidden?: boolean; updated: string; position?: string;
}
export interface RemoteTaskFields { title?: string; notes?: string; due?: string | null; status?: 'needsAction' | 'completed'; completed?: string | null }
export type Op =
  | { op: 'create'; list: string; task: RemoteTaskFields; parent?: string; parentRef?: number }
  | { op: 'patch'; list: string; id: string; task: RemoteTaskFields }
  | { op: 'move'; list: string; id: string; dest: string }
  | { op: 'delete'; list: string; id: string };
export interface OpResult { task?: RTask; ok?: boolean; error?: string; gone?: boolean }
export type SyncResponse = { status: 'ok'; lists: { dbc: string; pessoal: string }; tasks: RTask[] } | { status: 'not_connected' | 'not_configured' };
export interface Api { sync(): Promise<SyncResponse>; batch(ops: Op[]): Promise<OpResult[]> }

export const PERSONAL_CAT = 'cat:pessoal';
export const WORK_CAT = 'cat:trabalho';

// Nos testes, a janela traz uma versão simulada.
const fake = () => (typeof window !== 'undefined' ? (window as any).__RITUAL_TEST_GTASKS : undefined) as undefined | ((action: string, body: any) => any);
export const gtasksTesting = () => !!fake();

async function call(body: Record<string, unknown>) {
  const f = fake();
  if (f) return f(String(body.action), body);
  if (!supabase) throw new Error('Sincronização não configurada.');
  const { data, error } = await supabase.functions.invoke('ritual-gtasks', { body });
  if (error) throw new Error('Não consegui falar com o Google Tasks agora.');
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export const defaultApi: Api = {
  sync: () => call({ action: 'sync' }),
  batch: async (ops) => ((await call({ action: 'batch', ops })) as { results: OpResult[] }).results ?? []
};

/** Legado: o desfazer de conversas antigas da Carreira ainda usa. */
export async function updateGTask(list: string, id: string, patch: { due?: string | null; status?: 'completed' | 'needsAction' }) {
  await call({ action: 'update', list, id, ...patch });
}

/* ---------- Estado para a tela ---------- */
export type GState = 'idle' | 'syncing' | 'ok' | 'not_connected' | 'not_configured' | 'error';
export const useGTasks = createStore<{ state: GState; last?: number; error?: string }>(() => ({ state: 'idle' }));

/* ---------- Conversão ---------- */
const isDone = (t: Task) => t.status !== 'pendente';

/** Retrato do que é conciliado com o Google. Se mudar, a tarefa precisa subir. */
export function shapeOf(t: Task, workCat: string) {
  const done = isDone(t);
  return JSON.stringify([
    t.title.trim(), (t.description ?? '').trim(), t.plannedDate ?? null, done, done ? t.completedDate ?? null : null,
    t.categoryId === workCat, (t.subtasks ?? []).map((s) => [s.id, s.title.trim(), !!s.done])
  ]);
}

/** Versão do lado do Google: a tarefa e as subtarefas (mudar uma subtarefa não muda a data da mãe). */
export function versionOf(r: RTask, kids: RTask[]) {
  return [r.updated, r.list, ...kids.map((k) => `${k.id}:${k.updated}`).sort()].join('|');
}

/** Dia de conclusão vira meio-dia de Brasília, para não trocar de dia no fuso. */
const completedAt = (d: DateKey) => `${d}T15:00:00.000Z`;

export function toRemote(t: Task): RemoteTaskFields {
  const done = isDone(t);
  return {
    title: t.title.trim(), notes: (t.description ?? '').trim(), due: t.plannedDate ?? null,
    status: done ? 'completed' : 'needsAction', completed: done ? completedAt(t.completedDate ?? todayKey()) : null
  };
}

const byPosition = (a: RTask, b: RTask) => (a.position ?? '').localeCompare(b.position ?? '');
const subGid = (t: Task, s: Subtask) => t.g?.subs?.[s.id] ?? (s.id.startsWith('g:') ? s.id.slice(2) : undefined);

/** Campos da tarefa daqui a partir do Google. Prioridade, lembrete e o resto não são tocados. */
export function fromRemote(r: RTask, kids: RTask[], lists: { dbc: string }, workCat: string, local?: Task): Partial<Task> {
  const done = r.status === 'completed';
  const back = new Map(Object.entries(local?.g?.subs ?? {}).map(([sid, gid]) => [gid, sid]));
  return {
    title: r.title.trim() || 'Sem título',
    description: r.notes?.trim() || undefined,
    plannedDate: r.due ?? null,
    status: done ? (local?.status === 'arquivada' ? 'arquivada' : 'concluida') : 'pendente',
    completedDate: done ? (r.completed ? toKey(new Date(r.completed)) : local?.completedDate ?? todayKey()) : null,
    categoryId: r.list === lists.dbc ? workCat : local && local.categoryId !== workCat ? local.categoryId : PERSONAL_CAT,
    subtasks: kids.filter((k) => !k.deleted).sort(byPosition).map((k) => ({ id: back.get(k.id) ?? `g:${k.id}`, title: k.title.trim(), done: k.status === 'completed' }))
  };
}

/** A tarefa tem algo para subir ao Google? */
export function needsPush(t: Task, workCat: string) {
  if (t.deleted) return !!t.g && !t.g.gone;
  if (!t.g) return t.status !== 'arquivada';
  return shapeOf(t, workCat) !== t.g.h;
}

/* ---------- Escrita local sem perder o que mudou no meio ---------- */
async function writeTask(id: string, patch: Partial<Task>, opts: { deleted?: boolean } = {}) {
  const cur = (await db.records.get(id)) as Task | undefined;
  if (!cur) return;
  await db.records.put({ ...cur, ...patch, ...(opts.deleted ? { deleted: 1 } : {}), updatedAt: Math.max(Date.now(), cur.updatedAt + 1), dirty: 1 } as AnyRecord);
}

/* ---------- Conciliação ---------- */
let running = false;
let lastPull = 0;
const PULL_EVERY = 60_000;

/**
 * Concilia as tarefas daqui com o Google Tasks. Sem nada para subir, só lê o Google a cada minuto (ou quando force).
 * Devolve quantas tarefas mudaram aqui ou lá.
 */
export async function syncGoogleTasks(opts: { force?: boolean; api?: Api; now?: () => number } = {}): Promise<number> {
  const api = opts.api ?? defaultApi;
  const now = opts.now ?? Date.now;
  if (running) return 0;
  const base = await get<'careerbase'>('careerbase');
  const workCat = base?.workCategoryId ?? WORK_CAT;
  const locals0 = (await db.records.where('kind').equals('task').toArray()) as Task[];
  if (!opts.force && now() - lastPull < PULL_EVERY && !locals0.some((t) => needsPush(t, workCat))) return 0;
  running = true;
  useGTasks.setState({ state: 'syncing', error: undefined });
  let changes = 0;
  try {
    const res = await api.sync();
    if (res.status !== 'ok') { useGTasks.setState({ state: res.status }); return 0; }
    lastPull = now();
    const { lists } = res;
    const listOf = (t: Task) => (t.categoryId === workCat ? lists.dbc : lists.pessoal);
    const kidsOf = new Map<string, RTask[]>();
    for (const r of res.tasks) if (r.parent) kidsOf.set(r.parent, [...(kidsOf.get(r.parent) ?? []), r]);
    const tops = new Map(res.tasks.filter((r) => !r.parent).map((r) => [r.id, r]));
    // Relê: a tela pode ter mudado algo enquanto o Google respondia.
    const locals = (await db.records.where('kind').equals('task').toArray()) as Task[];
    const linked = new Set<string>();
    const groups: { ops: Op[]; done: (rs: OpResult[]) => Promise<void> }[] = [];

    const createGroup = (t: Task) => {
      const list = listOf(t);
      const subs = t.subtasks ?? [];
      // Subtarefas entram de trás para frente: o Google põe cada nova no topo, então a ordem final fica igual.
      const ops: Op[] = [{ op: 'create', list, task: toRemote(t) }, ...[...subs].reverse().map((s) => ({ op: 'create' as const, list, parentRef: -1, task: { title: s.title.trim(), status: s.done ? 'completed' as const : 'needsAction' as const } }))];
      groups.push({ ops, done: async (rs) => {
        const top = rs[0]?.task;
        if (!top) return;
        const map: Record<string, string> = {};
        [...subs].reverse().forEach((s, i) => { const k = rs[i + 1]?.task; if (k) map[s.id] = k.id; });
        await writeTask(t.id, { g: { id: top.id, list, v: '', h: shapeOf(t, workCat), subs: map } });
        changes++;
      } });
    };

    for (const t of locals) {
      if (!t.g) {
        if (!t.deleted && t.status !== 'arquivada') createGroup(t);
        continue;
      }
      linked.add(t.g.id);
      const r = tops.get(t.g.id);
      const kids = r ? kidsOf.get(r.id) ?? [] : [];
      const localDirty = shapeOf(t, workCat) !== t.g.h;
      if (t.deleted) {
        if (t.g.gone) continue;
        if (!r || r.deleted) { await writeTask(t.id, { g: { ...t.g, gone: true } }, { deleted: true }); continue; }
        const g = t.g;
        groups.push({ ops: [{ op: 'delete', list: r.list, id: r.id }], done: async (rs) => { if (rs[0]?.ok) { await writeTask(t.id, { g: { ...g, gone: true } }, { deleted: true }); changes++; } } });
        continue;
      }
      if (!r || r.deleted) {
        // Sumiu do Google: se ela mexeu aqui depois (ou desfez uma exclusão), volta para lá; senão, sai daqui também.
        const back = r ? t.updatedAt > Date.parse(r.updated) : localDirty;
        if (back) { createGroup({ ...t, g: undefined }); continue; }
        await writeTask(t.id, { g: { ...t.g, gone: true } }, { deleted: true });
        changes++;
        continue;
      }
      const v = versionOf(r, kids);
      const remoteChanged = v !== t.g.v;
      if (remoteChanged && (!localDirty || Date.parse(r.updated) > t.updatedAt)) {
        const patch = fromRemote(r, kids, lists, workCat, t);
        const after = { ...t, ...patch } as Task;
        const subs: Record<string, string> = {};
        for (const s of after.subtasks) { const gid = subGid(t, s) ?? (s.id.startsWith('g:') ? s.id.slice(2) : undefined); if (gid && !s.id.startsWith('g:')) subs[s.id] = gid; }
        const g: GLink = { id: r.id, list: r.list, v, h: shapeOf(after, workCat), subs };
        if (shapeOf(t, workCat) === g.h) await writeTask(t.id, { g });
        else { await writeTask(t.id, { ...patch, g }); changes++; }
        continue;
      }
      if (!localDirty) continue;
      // Sobe o que mudou aqui: troca de lista, campos e subtarefas.
      const target = listOf(t);
      const ops: Op[] = [];
      if (r.list !== target) ops.push({ op: 'move', list: r.list, id: r.id, dest: target });
      ops.push({ op: 'patch', list: target, id: r.id, task: toRemote(t) });
      const kidById = new Map(kids.filter((k) => !k.deleted).map((k) => [k.id, k]));
      const keep = new Set<string>();
      const newSubs: Subtask[] = [];
      const map: Record<string, string> = { ...(t.g.subs ?? {}) };
      for (const s of t.subtasks ?? []) {
        const gid = subGid(t, s);
        const k = gid ? kidById.get(gid) : undefined;
        if (k) {
          keep.add(k.id);
          if (k.title.trim() !== s.title.trim() || (k.status === 'completed') !== s.done) ops.push({ op: 'patch', list: k.list, id: k.id, task: { title: s.title.trim(), status: s.done ? 'completed' : 'needsAction', completed: s.done ? new Date(now()).toISOString() : null } });
        } else newSubs.push(s);
      }
      for (const k of kidById.values()) if (!keep.has(k.id)) ops.push({ op: 'delete', list: k.list, id: k.id });
      const firstNew = ops.length;
      [...newSubs].reverse().forEach((s) => ops.push({ op: 'create', list: target, parent: r.id, task: { title: s.title.trim(), status: s.done ? 'completed' : 'needsAction' } }));
      const snapshot = shapeOf(t, workCat);
      const g0 = t.g;
      groups.push({ ops, done: async (rs) => {
        const moved = r.list !== target ? rs[0]?.task : undefined;
        [...newSubs].reverse().forEach((s, i) => { const k = rs[firstNew + i]?.task; if (k) map[s.id] = k.id; });
        for (const sid of Object.keys(map)) if (!(t.subtasks ?? []).some((s) => s.id === sid)) delete map[sid];
        if (rs.some((x) => x.error)) {
          // Parte não subiu: guarda o que já foi criado e tenta o resto na próxima rodada.
          await writeTask(t.id, { g: { ...g0, subs: map, list: moved?.list ?? g0.list } });
          return;
        }
        await writeTask(t.id, { g: { id: moved?.id ?? r.id, list: target, v: '', h: snapshot, subs: map } });
        changes++;
      } });
    }

    // Novas no Google (anotadas no PC, no Gmail ou no app do Tasks): entram aqui.
    for (const r of tops.values()) {
      if (r.deleted || linked.has(r.id)) continue;
      const id = `task:g:${r.id}`;
      if (await db.records.get(id)) continue;
      const kids = kidsOf.get(r.id) ?? [];
      const fields = fromRemote(r, kids, lists, workCat);
      const rec = { title: '', priority: 'media', tags: [], history: [{ at: now(), text: 'Criada no Google Tasks' }], ...fields } as Task;
      const t = { ...rec, id, kind: 'task', createdAt: now(), updatedAt: now(), deleted: 0, dirty: 1 } as Task;
      t.g = { id: r.id, list: r.list, v: versionOf(r, kids), h: shapeOf(t, workCat) };
      await db.records.put(t as AnyRecord);
      changes++;
    }

    // Envia em lotes; cada grupo fica inteiro no mesmo lote (subtarefa nova precisa da mãe criada antes).
    let errors = 0;
    for (let i = 0; i < groups.length;) {
      const batch: typeof groups = [];
      const ops: Op[] = [];
      while (i < groups.length && (batch.length === 0 || ops.length + groups[i].ops.length <= 40)) {
        const gr = groups[i++];
        const start = ops.length;
        for (const o of gr.ops) ops.push(o.op === 'create' && o.parentRef === -1 ? { ...o, parentRef: start } : o);
        batch.push(gr);
      }
      const rs = await api.batch(ops);
      let at = 0;
      for (const gr of batch) {
        const slice = rs.slice(at, at + gr.ops.length);
        at += gr.ops.length;
        if (slice.some((x) => x?.error)) errors++;
        await gr.done(slice);
      }
    }
    if (changes) notifyWrite();
    useGTasks.setState({ state: errors ? 'error' : 'ok', last: now(), error: errors ? 'Algumas tarefas não subiram para o Google agora. Tento de novo sozinha.' : undefined });
    return changes;
  } catch (e) {
    useGTasks.setState({ state: 'error', error: (e as Error).message || 'Não consegui falar com o Google Tasks agora.' });
    return changes;
  } finally {
    running = false;
  }
}

/** Para os testes: começa do zero. */
export function resetGoogleTasksSync() { running = false; lastPull = 0; useGTasks.setState({ state: 'idle', last: undefined, error: undefined }); }

/** Pede uma rodada já (abrir a tela, botão Atualizar). Só roda logada ou nos testes. */
export function refreshGoogleTasks(force = true) {
  if (!useSync.getState().session && !gtasksTesting()) return;
  void syncGoogleTasks({ force });
}
