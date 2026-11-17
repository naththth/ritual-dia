import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Google Tasks do Ritual: é onde as tarefas dela vivem (listas Pessoal e DBC). O app sincroniza nos dois sentidos com
// duas ações: 'sync' (garante as listas e traz tudo) e 'batch' (cria, altera, move e apaga em sequência, com um só token).
// As ações 'list', 'complete' e 'update' ficam para versões antigas do app e para o desfazer de conversas antigas.
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


/** Formato enxuto da tarefa do Google que o app usa. */
function slim(t: any, list: string) {
  return {
    id: String(t.id), list, title: String(t.title ?? ''), notes: t.notes || undefined,
    due: t.due ? String(t.due).slice(0, 10) : undefined, status: t.status === 'completed' ? 'completed' : 'needsAction',
    completed: t.completed || undefined, parent: t.parent || undefined, deleted: t.deleted ? true : undefined,
    hidden: t.hidden ? true : undefined, updated: String(t.updated ?? ''), position: t.position || undefined
  };
}

/** Só os campos que o app pode mudar, já no formato do Google. */
function clean(t: any) {
  const out: Record<string, unknown> = {};
  if (t && typeof t === 'object') {
    if (typeof t.title === 'string') out.title = t.title.slice(0, 1024);
    if (typeof t.notes === 'string') out.notes = t.notes.slice(0, 8000);
    if ('due' in t) out.due = t.due && /^\d{4}-\d{2}-\d{2}$/.test(String(t.due)) ? `${t.due}T00:00:00.000Z` : null;
    if (t.status === 'completed' || t.status === 'needsAction') out.status = t.status;
    if ('completed' in t) out.completed = t.completed && !isNaN(Date.parse(String(t.completed))) ? new Date(String(t.completed)).toISOString() : null;
    if (out.status === 'needsAction') out.completed = null;
  }
  return out;
}

const okId = (v: unknown) => typeof v === 'string' && /^[\w-]+$/.test(v);
const LIST_NAMES = { dbc: 'DBC', pessoal: 'Pessoal' };

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
    if (body.action === 'sync') {
      // Listas: a padrão da conta vira DBC (é onde ela já anotava o trabalho) e a Pessoal é criada se faltar.
      const lr = await g('/users/@me/lists?maxResults=100');
      if (!lr.ok) return json({ error: `Google Tasks ${lr.status}` }, 502);
      const all: any[] = (await lr.json()).items ?? [];
      const find = (name: string) => all.find((l) => String(l.title ?? '').trim().toLowerCase() === name.toLowerCase());
      let dbc = find(LIST_NAMES.dbc), pessoal = find(LIST_NAMES.pessoal);
      if (!dbc) {
        const dr = await g('/users/@me/lists/@default');
        const def = dr.ok ? await dr.json() : all[0];
        if (def?.id && def.id !== pessoal?.id) {
          const pr = await g(`/users/@me/lists/${def.id}`, { method: 'PATCH', body: JSON.stringify({ title: LIST_NAMES.dbc }) });
          dbc = pr.ok ? await pr.json() : undefined;
        }
        if (!dbc) {
          const cr = await g('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: LIST_NAMES.dbc }) });
          if (!cr.ok) return json({ error: `Google Tasks ${cr.status}` }, 502);
          dbc = await cr.json();
        }
      }
      if (!pessoal) {
        const cr = await g('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: LIST_NAMES.pessoal }) });
        if (!cr.ok) return json({ error: `Google Tasks ${cr.status}` }, 502);
        pessoal = await cr.json();
      }
      const tasks: unknown[] = [];
      for (const listId of [dbc.id, pessoal.id]) {
        let page = '';
        for (let i = 0; i < 30; i++) {
          const tr = await g(`/lists/${listId}/tasks?showCompleted=true&showHidden=true&showDeleted=true&maxResults=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
          if (!tr.ok) return json({ error: `Google Tasks ${tr.status}` }, 502);
          const b = await tr.json();
          for (const t of b.items ?? []) tasks.push(slim(t, listId));
          if (!b.nextPageToken) break;
          page = b.nextPageToken;
        }
      }
      return json({ status: 'ok', lists: { dbc: dbc.id, pessoal: pessoal.id }, tasks });
    }
    if (body.action === 'batch') {
      // Em sequência: parentRef aponta para uma criação anterior do mesmo lote (subtarefa de tarefa nova).
      const ops: any[] = Array.isArray(body.ops) ? body.ops.slice(0, 60) : [];
      const results: any[] = [];
      for (const op of ops) {
        try {
          const list = op?.list;
          if (!okId(list)) { results.push({ error: 'lista inválida' }); continue; }
          if (op.op === 'create') {
            const parent = typeof op.parentRef === 'number' ? results[op.parentRef]?.task?.id : op.parent;
            if (op.parentRef != null && !parent) { results.push({ error: 'sem tarefa mãe' }); continue; }
            if (parent && !okId(parent)) { results.push({ error: 'tarefa mãe inválida' }); continue; }
            const r = await g(`/lists/${list}/tasks${parent ? `?parent=${parent}` : ''}`, { method: 'POST', body: JSON.stringify(clean(op.task)) });
            results.push(r.ok ? { task: slim(await r.json(), list) } : { error: `Google Tasks ${r.status}` });
          } else if (op.op === 'patch') {
            if (!okId(op.id)) { results.push({ error: 'tarefa inválida' }); continue; }
            const r = await g(`/lists/${list}/tasks/${op.id}`, { method: 'PATCH', body: JSON.stringify(clean(op.task)) });
            results.push(r.ok ? { task: slim(await r.json(), list) } : { error: `Google Tasks ${r.status}`, gone: r.status === 404 || undefined });
          } else if (op.op === 'move') {
            if (!okId(op.id) || !okId(op.dest)) { results.push({ error: 'tarefa inválida' }); continue; }
            const r = await g(`/lists/${list}/tasks/${op.id}/move?destinationTasklist=${op.dest}`, { method: 'POST' });
            results.push(r.ok ? { task: slim(await r.json(), op.dest) } : { error: `Google Tasks ${r.status}`, gone: r.status === 404 || undefined });
          } else if (op.op === 'delete') {
            if (!okId(op.id)) { results.push({ error: 'tarefa inválida' }); continue; }
            const r = await g(`/lists/${list}/tasks/${op.id}`, { method: 'DELETE' });
            results.push(r.ok || r.status === 404 || r.status === 410 ? { ok: true } : { error: `Google Tasks ${r.status}` });
          } else results.push({ error: 'operação desconhecida' });
        } catch (e) { results.push({ error: String((e as Error)?.message ?? e) }); }
      }
      return json({ status: 'ok', results });
    }
    if (body.action === 'complete') {
      const list = String(body.list ?? ''), id = String(body.id ?? '');
      if (!/^[\w-]+$/.test(list) || !/^[\w-]+$/.test(id)) return json({ error: 'Tarefa inválida' }, 400);
      const r = await g(`/lists/${list}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      if (!r.ok) return json({ error: `Google Tasks ${r.status}` }, 502);
      return json({ ok: true });
    }
    if (body.action === 'update') {
      // Data (AAAA-MM-DD ou null para tirar) e situação; serve também para desfazer o que a Carreira mudou.
      const list = String(body.list ?? ''), id = String(body.id ?? '');
      if (!/^[\w-]+$/.test(list) || !/^[\w-]+$/.test(id)) return json({ error: 'Tarefa inválida' }, 400);
      const patch: Record<string, unknown> = {};
      if ('due' in body) {
        if (body.due === null) patch.due = null;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.due))) patch.due = `${body.due}T00:00:00.000Z`;
        else return json({ error: 'Data inválida' }, 400);
      }
      if (body.status === 'completed' || body.status === 'needsAction') { patch.status = body.status; if (body.status === 'needsAction') patch.completed = null; }
      if (!Object.keys(patch).length) return json({ error: 'Nada para mudar' }, 400);
      const r = await g(`/lists/${list}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
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
