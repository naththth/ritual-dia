import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Google Tasks do Ritual: lê as tarefas da conta Google dela e marca como feitas.
// O refresh token fica em user_secrets (provider google_tasks), gravado pelo app logo depois do login com a permissão de tarefas.
// GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são os mesmos do login Google do Supabase, guardados como segredos da função.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: J });
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const API = 'https://tasks.googleapis.com/tasks/v1';

/** Id da usuária a partir do JWT (já validado pelo gateway). */
function userId(req: Request): string | null {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    return p.role === 'authenticated' && p.sub ? String(p.sub) : null;
  } catch { return null; }
}

async function accessToken(uid: string): Promise<string> {
  const { data } = await admin().from('user_secrets').select('secret').eq('user_id', uid).eq('provider', 'google_tasks').maybeSingle();
  if (!data?.secret) throw new Error('not_connected');
  const id = Deno.env.get('GOOGLE_CLIENT_ID'), sec = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!id || !sec) throw new Error('not_configured');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: sec, refresh_token: data.secret, grant_type: 'refresh_token' })
  });
  const b = await r.json();
  if (!r.ok || !b.access_token) throw new Error(b.error === 'invalid_grant' ? 'not_connected' : `token: ${b.error ?? r.status}`);
  return b.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const uid = userId(req);
    if (!uid) return json({ error: 'Entre com Google.' }, 401);
    const body = await req.json().catch(() => ({}));
    let token: string;
    try { token = await accessToken(uid); }
    catch (e) {
      const m = String((e as Error).message);
      if (m === 'not_connected' || m === 'not_configured') return json({ status: m });
      throw e;
    }
    const g = (path: string, init?: RequestInit) => fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    if (body.action === 'complete') {
      const list = String(body.list ?? ''), id = String(body.id ?? '');
      if (!/^[\w-]+$/.test(list) || !/^[\w-]+$/.test(id)) return json({ error: 'Tarefa inválida' }, 400);
      const r = await g(`/lists/${list}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      if (!r.ok) return json({ error: `Google Tasks ${r.status}` }, 502);
      return json({ ok: true });
    }
    // Lista: todas as listas, só o que está pendente.
    const lr = await g('/users/@me/lists?maxResults=20');
    if (!lr.ok) return json({ error: `Google Tasks ${lr.status}` }, 502);
    const lists = (await lr.json()).items ?? [];
    const out: unknown[] = [];
    for (const l of lists) {
      const tr = await g(`/lists/${l.id}/tasks?showCompleted=false&showHidden=false&maxResults=100`);
      if (!tr.ok) continue;
      for (const t of (await tr.json()).items ?? []) {
        if (!t.title?.trim()) continue;
        out.push({ id: t.id, list: l.id, listName: l.title, title: t.title, notes: t.notes || undefined, due: t.due ? String(t.due).slice(0, 10) : undefined, updated: t.updated });
      }
    }
    return json({ status: 'ok', tasks: out });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 502);
  }
});
