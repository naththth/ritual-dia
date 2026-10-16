import { useLiveQuery } from 'dexie-react-hooks';
import { all, byDate, byDateRange, db, get } from './db';
import type { Kind, KindMap, Settings } from './types';

export function useAll<K extends Kind>(kind: K): KindMap[K][] | undefined {
  return useLiveQuery(() => all(kind), [kind]);
}

export function useByDate<K extends Kind>(kind: K, date: string): KindMap[K][] | undefined {
  return useLiveQuery(() => byDate(kind, date), [kind, date]);
}

export function useByRange<K extends Kind>(kind: K, from: string, to: string): KindMap[K][] | undefined {
  return useLiveQuery(() => byDateRange(kind, from, to), [kind, from, to]);
}

export function useRecord<K extends Kind>(id: string | undefined): KindMap[K] | undefined | null {
  return useLiveQuery(async () => (id ? (await get<K>(id)) ?? null : null), [id]);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => (await get<'settings'>('settings')) as Settings | undefined, []);
}

export function useDirtyCount(): number {
  return useLiveQuery(() => db.records.where('dirty').equals(1).count(), []) ?? 0;
}
