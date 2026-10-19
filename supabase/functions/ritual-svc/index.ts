import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// Serviços do Ritual que precisam rodar no servidor:
//  - cron: a cada 5 min envia lembretes (inclui alarme de acordar e aviso de deitar)
//  - push_test: notificação de teste (usuária logada)
//  - vapid: chave pública para assinar notificações

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: J });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const TZ = 'America/Sao_Paulo';
const APP_URL = 'https://naththth.github.io/ritual-dia/';

async function secret(key: string) {
  const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
  return data?.value as string | undefined;
}

function nowParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), weekday: wd };
}
const toMin = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : undefined);
const addDays = (k: string, n: number) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function userRecords(userId: string, kinds: string[]) {
  const { data } = await admin.from('records').select('id, kind, data, deleted').eq('user_id', userId).in('kind', kinds).eq('deleted', false);
  return (data ?? []).map((r: any) => ({ id: r.id, kind: r.kind, ...r.data }));
}

function planFor(plans: any[], domain: string, date: string) {
  return plans.filter((p) => p.domain === domain && p.validFrom <= date).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
}

/* ---------------- Lembretes ---------------- */
interface Due { key: string; title: string; body: string; url: string; alarm?: boolean }

async function dueReminders(userId: string, now: ReturnType<typeof nowParts>): Promise<Due[]> {
  const recs = await userRecords(userId, ['settings', 'plan', 'mtemplate', 'wtemplate', 'food', 'water', 'meal', 'skin']);
  const settings = recs.find((r) => r.kind === 'settings') ?? {};
  const r = { enabled: true, meals: true, skin: true, classes: true, water: false, morning: '06:45', evening: '21:45', custom: [] as any[], ...(settings.reminders ?? {}) };
  if (!r.enabled) return [];
  const out: (Due & { at: number })[] = [];
  const mealTimes = { cafe: '07:30', almoco: '12:30', lanche: '16:00', jantar: '20:00', ceia: '22:00', ...(settings.mealTimes ?? {}) };
  const skinTimes = { am: '07:00', pm: '21:30', ...(settings.skinTimes ?? {}) };
  const plans = recs.filter((x) => x.kind === 'plan');
  const today = recs.filter((x) => x.date === now.date);
  const foodName = (id: string) => recs.find((x) => x.kind === 'food' && x.id === id)?.name ?? '';

  // Sono: mesma conta de src/domain/sleep.ts
  if (r.sleep) {
    const sp = { wake: '06:00', hours: 8, latency: 15, alarm: true, bed: true, ...r.sleep };
    const wdOf = (k: string) => { const d = new Date(k + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
    const wakeFor = (k: string) => (wdOf(k) >= 6 && sp.weekendWake ? sp.weekendWake : sp.wake);
    const hrs = `${Math.floor(sp.hours)} h${sp.hours % 1 ? ` ${Math.round((sp.hours % 1) * 60)}` : ''}`;
    const wake = wakeFor(now.date);
    const bedMin = (((toMin(wakeFor(addDays(now.date, 1)))! - sp.hours * 60 - sp.latency) % 1440) + 1440) % 1440;
    const bed = `${String(Math.floor(bedMin / 60)).padStart(2, '0')}:${String(bedMin % 60).padStart(2, '0')}`;
    if (sp.alarm) {
      const ids: string[] = planFor(plans, 'training', now.date)?.training?.[String(now.weekday)] ?? [];
      const tr = ids.map((id) => recs.find((x) => x.kind === 'wtemplate' && x.id === id)).filter(Boolean).map((t: any) => t.time ? `${t.name} às ${t.time}` : t.name);
      out.push({ key: 'wake', at: toMin(wake)!, alarm: true, title: `Bom dia. São ${wake}.`, body: tr.length ? `Hoje: ${tr.join(', ')}. Café às ${mealTimes.cafe}.` : `Café às ${mealTimes.cafe}.`, url: '#/' });
    }
    if (sp.bed) out.push({ key: 'bed', at: bedMin - 15, title: `Deitar às ${bed}`, body: `Faltam 15 min. Tela longe e luz baixa para dormir ${hrs} e acordar às ${wakeFor(addDays(now.date, 1))}.`, url: '#/' });
  }
  if (r.morning) out.push({ key: 'morning', at: toMin(r.morning)!, title: 'Seu dia', body: 'Toque para ver o que vem pela frente.', url: '#/' });
  if (r.evening) out.push({ key: 'evening', at: toMin(r.evening)!, title: 'Fechar o dia', body: 'Como foi hoje? Leva 30 segundos.', url: '#/diario' });
  if (r.meals) {
    const fp = planFor(plans, 'food', now.date)?.food?.[String(now.weekday)] ?? {};
    for (const mt of settings.mealTypes ?? []) {
      const at = toMin(mealTimes[mt.id]);
      if (at == null) continue;
      if (today.some((x) => x.kind === 'meal' && x.mealType === mt.id && x.items?.length)) continue;
      const tpl = fp[mt.id] ? recs.find((x) => x.kind === 'mtemplate' && x.id === fp[mt.id]) : undefined;
      if (!tpl && !['cafe', 'almoco', 'jantar'].includes(mt.id)) continue;
      out.push({ key: `meal-${mt.id}`, at, title: `${mt.label}, ${mealTimes[mt.id]}`, body: tpl ? tpl.items.map((i: any) => `${foodName(i.foodId)} ${i.portion}`).join(', ') : 'Toque para registrar.', url: `#/alimentacao/refeicao?m=${mt.id}` });
    }
  }
  if (r.skin) {
    for (const p of ['am', 'pm'] as const) {
      if (today.some((x) => x.kind === 'skin' && x.period === p)) continue;
      out.push({ key: `skin-${p}`, at: toMin(skinTimes[p])!, title: p === 'am' ? 'Pele da manhã' : 'Pele da noite', body: 'Sua rotina do dia está no app.', url: `#/pele?p=${p}` });
    }
  }
  if (r.classes) {
    const ids: string[] = planFor(plans, 'training', now.date)?.training?.[String(now.weekday)] ?? [];
    for (const id of ids) {
      const t = recs.find((x) => x.kind === 'wtemplate' && x.id === id);
      const at = toMin(t?.time);
      if (!t || at == null) continue;
      out.push({ key: `class-${id}`, at: at - 60, title: `${t.name}`, body: `Começa às ${t.time}. Hora de se preparar.`, url: '#/treino' });
    }
  }
  if (r.water && settings.waterGoalMl) {
    const ml = today.filter((x) => x.kind === 'water').reduce((a: number, w: any) => a + (w.ml ?? 0), 0);
    for (const h of [10, 12, 14, 16, 18]) {
      const expected = Math.round((settings.waterGoalMl * (h - 7)) / 13);
      if (ml < expected * 0.8) out.push({ key: `water-${h}`, at: h * 60, title: 'Água', body: `${(ml / 1000).toLocaleString('pt-BR')} L até agora, de ${(settings.waterGoalMl / 1000).toLocaleString('pt-BR')} L.`, url: '#/alimentacao' });
    }
  }
  for (const c of r.custom ?? []) {
    if (c.days?.length && !c.days.includes(now.weekday)) continue;
    const at = toMin(c.time);
    if (at != null) out.push({ key: `custom-${c.id}`, at, title: c.label, body: c.note ?? '', url: '#/' });
  }
  // janela de 10 min para tolerar atrasos do agendador
  return out.filter((d) => d.at <= now.min && now.min < d.at + 10);
}

async function sendReminders() {
  const pub = await secret('vapid_public');
  const priv = await secret('vapid_private');
  if (!pub || !priv) return { sent: 0 };
  webpush.setVapidDetails('mailto:ritual@users.noreply.github.com', pub, priv);
  const { data: subs } = await admin.from('push_subs').select('*');
  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const now = nowParts();
  let sent = 0;
  for (const [userId, list] of byUser) {
    const due = await dueReminders(userId, now);
    for (const d of due) {
      const { error } = await admin.from('push_sent').insert({ user_id: userId, key: d.key, day: now.date });
      if (error) continue; // já enviado hoje
      for (const s of list) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: d.title, body: d.body, url: APP_URL + d.url, tag: d.key, alarm: !!d.alarm }), { TTL: d.alarm ? 900 : 1800, urgency: d.alarm ? 'high' : 'normal' });
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint);
        }
      }
    }
  }
  return { sent };
}

async function userFrom(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get('action') ?? body.action;

    if (action === 'vapid') return json({ key: await secret('vapid_public') });

    if (action === 'cron') {
      if (req.headers.get('x-cron-secret') !== (await secret('cron_secret'))) return json({ error: 'forbidden' }, 403);
      return json({ reminders: await sendReminders() });
    }

    const user = await userFrom(req);
    if (!user) return json({ error: 'Entre com Google para usar este recurso.' }, 401);

    if (action === 'push_test') {
      const pub = await secret('vapid_public'); const priv = await secret('vapid_private');
      webpush.setVapidDetails('mailto:ritual@users.noreply.github.com', pub!, priv!);
      const { data: subs } = await admin.from('push_subs').select('*').eq('user_id', user.id);
      let ok = 0;
      for (const s of subs ?? []) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: 'Ritual', body: 'Lembretes ligados neste aparelho.', url: APP_URL, tag: 'test' })); ok++; }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint); }
      }
      return json({ sent: ok });
    }
    return json({ error: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
