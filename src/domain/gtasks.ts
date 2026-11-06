// Google Tasks na aba de trabalho: lê as tarefas pendentes da conta Google dela e marca como feitas.
import { supabase } from '../sync/sync';

export interface GTask { id: string; list: string; listName?: string; title: string; notes?: string; due?: string }
export type GTasksResult = { status: 'ok'; tasks: GTask[] } | { status: 'not_connected' | 'not_configured' };

// Nos testes, a janela traz uma versão simulada.
const fake = () => (typeof window !== 'undefined' ? (window as any).__RITUAL_TEST_GTASKS : undefined) as undefined | ((action: string, body: any) => any);

async function call(body: Record<string, unknown>) {
  const f = fake();
  if (f) return f(String(body.action), body);
  if (!supabase) throw new Error('Sincronização não configurada.');
  const { data, error } = await supabase.functions.invoke('ritual-gtasks', { body });
  if (error) throw new Error('Não consegui falar com o Google Tasks agora.');
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function listGTasks(): Promise<GTasksResult> {
  return call({ action: 'list' });
}

export async function completeGTask(t: GTask) {
  await call({ action: 'complete', list: t.list, id: t.id });
}
