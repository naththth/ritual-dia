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
  changed();
}

/** Muda data e/ou situação de uma tarefa (a Carreira usa pela conversa; o desfazer usa para voltar como estava). */
export async function updateGTask(list: string, id: string, patch: { due?: string | null; status?: 'completed' | 'needsAction' }) {
  await call({ action: 'update', list, id, ...patch });
  changed();
}

/** Avisa a tela de trabalho para recarregar a lista depois de uma mudança feita fora dela. */
export const GTASKS_CHANGED = 'ritual-gtasks-changed';
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(GTASKS_CHANGED)); }
