import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { db, getMeta, onLocalWrite, putClean, setMeta } from '../db/db';
import type { AnyRecord, Photo } from '../db/types';
import { create as createStore } from 'zustand';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

// Trava do login dentro da própria página, no lugar da trava do navegador (navigator.locks), que no app instalado
// às vezes fica presa e deixa tudo esperando: abertura, IA e sincronização.
let lockChain: Promise<unknown> = Promise.resolve();
async function pageLock<R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> {
  const run = lockChain.then(() => Promise.race([fn(), new Promise<R>((_, rej) => setTimeout(() => rej(new Error('Login demorou para responder.')), 15000))]));
  lockChain = run.catch(() => undefined);
  return run;
}

export const supabase: SupabaseClient | null = URL_ && KEY
  ? createClient(URL_, KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, lock: pageLock as any } })
  : null;

export type SyncState = 'local' | 'offline' | 'syncing' | 'synced' | 'pending' | 'error';

interface SyncStore {
  session: Session | null;
  state: SyncState;
  lastSync?: number;
  error?: string;
  ready: boolean;
}
export const useSync = createStore<SyncStore>(() => ({ session: null, state: 'local', ready: false }));

const BUCKET = 'skin-photos';
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

function toRow(r: AnyRecord, userId: string) {
  const { id, kind, updatedAt, deleted, dirty: _d, ...rest } = r as any;
  return { id, user_id: userId, kind, data: rest, deleted: !!deleted, client_updated_at: new Date(updatedAt).toISOString() };
}
function fromRow(row: any): AnyRecord {
  return { ...row.data, id: row.id, kind: row.kind, deleted: row.deleted ? 1 : 0, updatedAt: new Date(row.client_updated_at).getTime(), dirty: 0 } as AnyRecord;
}

export function scheduleSync(delay = 1200) {
  if (!supabase || !useSync.getState().session) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const session = useSync.getState().session;
  if (!supabase || !session) return;
  if (!navigator.onLine) { useSync.setState({ state: 'offline' }); return; }
  if (running) { again = true; return; }
  running = true;
  useSync.setState({ state: 'syncing', error: undefined });
  try {
    const userId = session.user.id;

    // 1) envia o que mudou localmente
    const dirty = await db.records.where('dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);
      const { error } = await supabase.from('records').upsert(chunk.map((r) => toRow(r, userId)), { onConflict: 'user_id,id' });
      if (error) throw error;
      await db.transaction('rw', db.records, async () => {
        for (const r of chunk) {
          const cur = await db.records.get(r.id);
          if (cur && cur.updatedAt === r.updatedAt) await db.records.put({ ...cur, dirty: 0 });
        }
      });
    }

    // 2) envia fotos pendentes
    await uploadPhotos(userId);

    // 3) recebe o que mudou no servidor
    // Cursor composto (horário + id): linhas gravadas no mesmo instante não ficam para trás entre páginas.
    const saved = (await getMeta<string>(`pull:${userId}`)) ?? '1970-01-01T00:00:00Z';
    let [cursor, lastId] = saved.includes('|') ? saved.split('|') : [saved, ''];
    for (;;) {
      let q = supabase.from('records').select('*');
      q = lastId ? q.or(`server_updated_at.gt."${cursor}",and(server_updated_at.eq."${cursor}",id.gt."${lastId}")`) : q.gt('server_updated_at', cursor);
      const { data, error } = await q.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).limit(500);
      if (error) throw error;
      if (!data?.length) break;
      const incoming: AnyRecord[] = [];
      for (const row of data) {
        const remote = fromRow(row);
        const local = await db.records.get(remote.id);
        if (!local || !local.dirty || local.updatedAt <= remote.updatedAt) incoming.push(remote);
      }
      if (incoming.length) await putClean(incoming);
      cursor = data[data.length - 1].server_updated_at;
      lastId = data[data.length - 1].id;
      if (data.length < 500) break;
    }
    await setMeta(`pull:${userId}`, lastId ? `${cursor}|${lastId}` : cursor);
    // Musculação do relógio no horário de uma aula vira a aula (o Garmin não tem LPO).
    try { const { reconcileClasses } = await import('../domain/classes'); if (await reconcileClasses()) again = true; } catch (e) { console.error(e); }

    const left = await db.records.where('dirty').equals(1).count();
    useSync.setState({ state: left ? 'pending' : 'synced', lastSync: Date.now() });
  } catch (e: any) {
    useSync.setState({ state: navigator.onLine ? 'error' : 'offline', error: e?.message ?? String(e) });
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(300); }
  }
}

async function uploadPhotos(userId: string) {
  if (!supabase) return;
  const pending = await db.blobs.where('uploaded').equals(0).toArray();
  for (const b of pending) {
    const meta = (await db.records.get(b.id)) as Photo | undefined;
    if (!meta || meta.deleted) continue;
    const path = `${userId}/${meta.date}/${b.id.replace(/[^a-zA-Z0-9-]/g, '_')}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, b.blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    await db.blobs.update(b.id, { uploaded: 1 });
    const cur = (await db.records.get(b.id)) as Photo;
    await db.records.put({ ...cur, storagePath: path, updatedAt: cur.updatedAt + 1, dirty: 1 });
  }
}

/** Busca a foto: primeiro no aparelho, depois no armazenamento privado. */
export async function loadPhoto(p: Photo): Promise<Blob | undefined> {
  const local = await db.blobs.get(p.id);
  if (local) return local.blob;
  if (!supabase || !p.storagePath || !useSync.getState().session) return undefined;
  const { data, error } = await supabase.storage.from(BUCKET).download(p.storagePath);
  if (error || !data) return undefined;
  await db.blobs.put({ id: p.id, blob: data, uploaded: 1 });
  return data;
}

export async function deletePhotoRemote(p: Photo) {
  if (supabase && p.storagePath && useSync.getState().session) {
    await supabase.storage.from(BUCKET).remove([p.storagePath]);
  }
  await db.blobs.delete(p.id);
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Sincronização não configurada.');
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  useSync.setState({ session: null, state: 'local' });
}

export async function initSync() {
  if (!supabase) { useSync.setState({ ready: true, state: 'local' }); return; }
  // getSession pode demorar (renovação do login sem rede); não deixa a sincronização travar por isso.
  const { data } = await Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null } }>((r) => setTimeout(() => r({ data: { session: null } }), 6000))
  ]) as any;
  useSync.setState({ session: data.session, state: data.session ? 'pending' : 'local', ready: true });
  // limpa ?code= da URL após o retorno do login
  if (window.location.search.includes('code=')) {
    const keepApp = new URLSearchParams(window.location.search).get('app') === '1' || window.matchMedia?.('(display-mode: standalone)').matches;
    window.history.replaceState(window.history.state, '', window.location.pathname + (keepApp ? '?app=1' : '') + window.location.hash);
  }
  supabase.auth.onAuthStateChange((_e, session) => {
    const had = useSync.getState().session;
    useSync.setState({ session, state: session ? 'pending' : 'local' });
    // fora do callback: chamar o Supabase dentro dele pode travar o login
    if (session && !had) setTimeout(() => void syncNow(), 0);
  });
  onLocalWrite(() => scheduleSync());
  window.addEventListener('online', () => scheduleSync(200));
  window.addEventListener('offline', () => useSync.getState().session && useSync.setState({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(200); });
  setInterval(() => scheduleSync(0), 90_000);
  if (data.session) await syncNow();
}
