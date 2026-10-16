import { db, notifyWrite } from '../db/db';
import type { AnyRecord } from '../db/types';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'ritual';
  version: number;
  exportedAt: string;
  records: AnyRecord[];
  photos?: { id: string; type: string; data: string }[];
}

async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function buildBackup(withPhotos: boolean): Promise<Backup> {
  const records = (await db.records.toArray()).map((r) => ({ ...r, dirty: undefined })) as AnyRecord[];
  const b: Backup = { app: 'ritual', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records };
  if (withPhotos) {
    const blobs = await db.blobs.toArray();
    b.photos = await Promise.all(blobs.map(async (x) => ({ id: x.id, type: x.blob.type || 'image/jpeg', data: await blobToB64(x.blob) })));
  }
  return b;
}

export function validateBackup(raw: unknown): Backup {
  const b = raw as Backup;
  if (!b || b.app !== 'ritual' || !Array.isArray(b.records)) throw new Error('Este arquivo não é um backup do Ritual.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('Backup de uma versão mais nova do app. Atualize o app antes de restaurar.');
  for (const r of b.records) {
    if (!r || typeof r.id !== 'string' || typeof r.kind !== 'string' || typeof r.updatedAt !== 'number') throw new Error('Backup corrompido: há registros sem identificação.');
  }
  return b;
}

/** Mescla: mantém a versão mais recente de cada registro. Nunca apaga o que já existe sem versão mais nova. */
export async function restoreBackup(b: Backup): Promise<{ applied: number; kept: number; photos: number }> {
  let applied = 0;
  let kept = 0;
  let photos = 0;
  await db.transaction('rw', db.records, db.blobs, async () => {
    for (const r of b.records) {
      const cur = await db.records.get(r.id);
      if (!cur || cur.updatedAt < r.updatedAt) { await db.records.put({ ...r, dirty: 1 }); applied++; } else kept++;
    }
    for (const p of b.photos ?? []) {
      if (!(await db.blobs.get(p.id))) { await db.blobs.put({ id: p.id, blob: b64ToBlob(p.data, p.type), uploaded: 0 }); photos++; }
    }
  });
  notifyWrite();
  return { applied, kept, photos };
}

export function backupFileName(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `ritual-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
