// Avaliação de cabelo e corpo: o que já foi respondido, para a IA diagnosticar com base no que ela contou.
import type { Profile } from '../db/types';

const HAIR_KEYS: (keyof NonNullable<Profile['hair']>)[] = ['type', 'thickness', 'porosity', 'scalp', 'oilyAfter', 'heat', 'washesPerWeek', 'washTime'];
const BODY_KEYS: (keyof NonNullable<Profile['body']>)[] = ['skinType', 'showerTime', 'showerTemp', 'hairRemoval', 'sun'];

const done = (o: Record<string, unknown> | undefined, keys: string[]) => keys.filter((k) => { const v = o?.[k]; return Array.isArray(v) ? v.length > 0 : v != null && v !== ''; }).length;

export function careProgress(p?: Profile) {
  return {
    hair: { done: done(p?.hair as any, HAIR_KEYS as string[]) + ((p?.hair?.concerns?.length ?? 0) > 0 ? 1 : 0), total: HAIR_KEYS.length + 1 },
    body: { done: done(p?.body as any, BODY_KEYS as string[]) + ((p?.body?.concerns?.length ?? 0) > 0 ? 1 : 0), total: BODY_KEYS.length + 1 },
    face: { done: (p?.skin?.type ? 1 : 0) + ((p?.skin?.concerns?.length ?? 0) > 0 ? 1 : 0), total: 2 }
  };
}
