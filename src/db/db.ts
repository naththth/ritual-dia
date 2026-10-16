import Dexie, { type Table } from 'dexie';
import type { AnyRecord, Kind, KindMap } from './types';

export interface BlobRow { id: string; blob: Blob; uploaded: 0 | 1 }
export interface MetaRow { key: string; value: unknown }

class RitualDB extends Dexie {
  records!: Table<AnyRecord, string>;
  blobs!: Table<BlobRow, string>;
  meta!: Table<MetaRow, string>;
  constructor(name = 'ritual') {
    super(name);
    this.version(1).stores({
      records: '&id, kind, dirty, date, [kind+date]',
      blobs: '&id, uploaded',
      meta: '&key'
    });
  }
}

export let db = new RitualDB();

/** Apenas para testes */
export function useTestDB(name: string) {
  db = new RitualDB(name);
  return db;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalWrite(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((l) => l());
}

export function uid(prefix = '') {
  const r = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}:${r}` : r;
}

type NewRecord<K extends Kind> = Omit<KindMap[K], 'kind' | 'updatedAt' | 'createdAt' | 'id'> & { id?: string };

export async function create<K extends Kind>(kind: K, data: NewRecord<K>): Promise<KindMap[K]> {
  const now = Date.now();
  const rec = { ...data, id: data.id ?? uid(kind), kind, createdAt: now, updatedAt: now, deleted: 0, dirty: 1 } as unknown as KindMap[K];
  await db.records.put(rec as AnyRecord);
  emit();
  return rec;
}

/** Cria ou substitui com id determinístico (ex.: registro de pele do dia) */
export async function upsert<K extends Kind>(kind: K, id: string, data: Partial<KindMap[K]>): Promise<KindMap[K]> {
  const now = Date.now();
  const prev = (await db.records.get(id)) as KindMap[K] | undefined;
  const rec = {
    ...(prev && !prev.deleted ? prev : {}),
    ...data,
    id,
    kind,
    createdAt: prev?.createdAt ?? now,
    updatedAt: Math.max(now, (prev?.updatedAt ?? 0) + 1),
    deleted: 0,
    dirty: 1
  } as unknown as KindMap[K];
  await db.records.put(rec as AnyRecord);
  emit();
  return rec;
}

export async function update<K extends Kind>(id: string, patch: Partial<KindMap[K]>): Promise<KindMap[K] | undefined> {
  const prev = (await db.records.get(id)) as KindMap[K] | undefined;
  if (!prev) return undefined;
  const rec = { ...prev, ...patch, id, updatedAt: Math.max(Date.now(), prev.updatedAt + 1), dirty: 1 } as KindMap[K];
  await db.records.put(rec as AnyRecord);
  emit();
  return rec;
}

export async function remove(id: string) {
  const prev = await db.records.get(id);
  if (!prev) return;
  await db.records.put({ ...prev, deleted: 1, dirty: 1, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) } as AnyRecord);
  emit();
}

/** Restaura exatamente um registro anterior (desfazer) */
export async function restore(rec: AnyRecord | undefined, id?: string) {
  if (!rec) {
    if (id) await remove(id);
    return;
  }
  const cur = await db.records.get(rec.id);
  await db.records.put({ ...rec, dirty: 1, updatedAt: Math.max(Date.now(), (cur?.updatedAt ?? 0) + 1) } as AnyRecord);
  emit();
}

export async function get<K extends Kind>(id: string): Promise<KindMap[K] | undefined> {
  const r = await db.records.get(id);
  return r && !r.deleted ? (r as KindMap[K]) : undefined;
}

export async function all<K extends Kind>(kind: K): Promise<KindMap[K][]> {
  const rows = await db.records.where('kind').equals(kind).toArray();
  return rows.filter((r) => !r.deleted) as KindMap[K][];
}

export async function byDate<K extends Kind>(kind: K, date: string): Promise<KindMap[K][]> {
  const rows = await db.records.where('[kind+date]').equals([kind, date]).toArray();
  return rows.filter((r) => !r.deleted) as KindMap[K][];
}

export async function byDateRange<K extends Kind>(kind: K, from: string, to: string): Promise<KindMap[K][]> {
  const rows = await db.records.where('[kind+date]').between([kind, from], [kind, to], true, true).toArray();
  return rows.filter((r) => !r.deleted) as KindMap[K][];
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Grava sem marcar como sujo (vindo do servidor/backup) */
export async function putClean(recs: AnyRecord[]) {
  await db.records.bulkPut(recs.map((r) => ({ ...r, dirty: 0 as const })));
  emit();
}

export const notifyWrite = emit;
