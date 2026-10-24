// Chamadas aos serviços do servidor: notificações.
import { supabase, useSync, syncNow } from './sync';
import { get } from '../db/db';

async function svc<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Sincronização não configurada.');
  if (!useSync.getState().session) throw new Error('Entre com Google para usar este recurso.');
  const { data, error } = await supabase.functions.invoke('ritual-svc', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/* ---------- Notificações ---------- */
function urlB64ToUint8(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushStatus(): Promise<'unsupported' | 'denied' | 'off' | 'on'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Este navegador não aceita notificações. No Android, instale o app pela tela inicial.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada. Libere nas configurações do Android para o Ritual.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await svc<{ key: string }>('vapid');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }));
  const j = sub.toJSON() as any;
  const { error } = await supabase!.from('push_subs').upsert({ endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: useSync.getState().session!.user.id });
  if (error) throw new Error(error.message);
  await svc('push_test');
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase?.from('push_subs').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function testPush() {
  return svc<{ sent: number }>('push_test');
}

/* ---------- intervals.icu (ponte com MyWhoosh e Garmin) ---------- */
export async function saveIntervalsKey(apiKey: string, athleteId: string) {
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google primeiro.');
  const { error } = await supabase.from('user_secrets').upsert({
    user_id: useSync.getState().session!.user.id, provider: 'intervals', secret: apiKey.trim(), meta: { athleteId: athleteId.trim() || '0' }, updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,provider' });
  if (error) throw new Error(error.message);
}

export async function removeIntervalsKey() {
  if (!supabase || !useSync.getState().session) return;
  await supabase.from('user_secrets').delete().eq('provider', 'intervals');
}

/** Envia os treinos planejados dos próximos 7 dias e traz atividades, sono, VFC e passos. */
export async function syncIntervalsNow(days = 30) {
  const r = await svc<{ wellness: number; activities: number; pushed: number }>('intervals_sync', { days });
  await syncNow();
  return r;
}

/** Depois de mudar o plano de treino: sobe o plano e reenvia a semana ao MyWhoosh, em silêncio. */
export async function pushTrainingSoon() {
  try {
    const s = await get<'settings'>('settings');
    if (!s?.intervals?.connected || !useSync.getState().session || !navigator.onLine) return;
    await syncNow();
    await svc('intervals_sync', { days: 3 });
    await syncNow();
  } catch { /* tenta de novo no ciclo de hora em hora */ }
}

/* ---------- Ajustes do app com o Claude ---------- */
/** Guarda o endereço e a chave da tarefa do Claude que faz os ajustes (só o servidor usa a chave). */
export async function saveDevRoutine(url: string, token: string) {
  const u = url.trim();
  if (!/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(u)) throw new Error('O endereço deve ser o que o Claude mostra ao gerar a chave: https://api.anthropic.com/v1/claude_code/routines/trig_…/fire');
  if (!token.trim().startsWith('sk-ant-')) throw new Error('A chave começa com sk-ant-.');
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google primeiro.');
  const { error } = await supabase.from('user_secrets').upsert({
    user_id: useSync.getState().session!.user.id, provider: 'claude_routine', secret: token.trim(), meta: { url: u }, updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}
export async function removeDevRoutine() {
  if (!supabase) return;
  await supabase.from('user_secrets').delete().eq('provider', 'claude_routine');
}
/** Sessão finalizada: sobe o registro e chama a tarefa do Claude, que pega este ajuste. */
export async function fireDevRequest(id: string) {
  await syncNow();
  return svc<{ url?: string }>('dev_finish', { id });
}
export async function testDevRoutine() {
  return svc<{ ok: boolean }>('dev_ping');
}
