import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// Serviços do Ritual que precisam rodar no servidor:
//  - cron: a cada 5 min envia lembretes (inclui alarme de acordar e aviso de deitar)
//  - intervals_sync / cron de hora em hora: envia pedais planejados ao intervals.icu (que repassa ao MyWhoosh)
//    e traz atividades, sono, VFC e passos
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

/* ---------------- intervals.icu (ponte com MyWhoosh e Garmin) ---------------- */
const SPORT: Record<string, string> = {
  Ride: 'mod:ciclismo', VirtualRide: 'mod:ciclismo', GravelRide: 'mod:ciclismo', MountainBikeRide: 'mod:ciclismo',
  Run: 'mod:corrida', VirtualRun: 'mod:corrida', TrailRun: 'mod:corrida', Walk: 'mod:caminhada', Hike: 'mod:caminhada',
  Swim: 'mod:natacao', OpenWaterSwim: 'mod:natacao', WeightTraining: 'mod:musculacao', Workout: 'mod:musculacao', Yoga: 'mod:yoga'
};
const num = (...v: any[]) => { for (const x of v) if (typeof x === 'number' && !Number.isNaN(x)) return x; return undefined; };

/** Texto de treino no formato do intervals.icu: cada bloco vira "- 10m 55%" (percentual do FTP). */
function workoutText(t: any) {
  // Duração em minutos e segundos ("30s", "1m30s"): intervalos curtos não podem virar 1 minuto.
  const dur = (min: number) => { const secs = Math.max(5, Math.round(min * 60)); const m = Math.floor(secs / 60), r = secs % 60; return `${m ? `${m}m` : ''}${r ? `${r}s` : ''}`; };
  return (t.steps ?? []).map((s: any) => `${s.label}\n- ${dur(Number(s.minutes))} ${Math.round(s.pct)}%`).join('\n\n');
}

async function syncIntervals(userId: string, days = 14) {
  const { data: sec } = await admin.from('user_secrets').select('secret, meta').eq('user_id', userId).eq('provider', 'intervals').maybeSingle();
  if (!sec) return { error: 'Chave do intervals.icu não cadastrada.' };
  const auth = 'Basic ' + btoa(`API_KEY:${sec.secret}`);
  const athlete = sec.meta?.athleteId || '0';
  const today = nowParts().date;
  const oldest = addDays(today, -days);
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`https://intervals.icu/api/v1/athlete/${athlete}/${path}`, { ...init, headers: { authorization: auth, accept: 'application/json', 'content-type': 'application/json', ...(init.headers ?? {}) } });
    if (r.status === 401 || r.status === 403) throw new Error('O intervals.icu recusou a chave. Confira a chave e o ID de atleta.');
    if (!r.ok) throw new Error(`intervals.icu respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  };

  // 0) O FTP do Ritual é a referência: os blocos em % viram watts no MyWhoosh a partir do FTP do intervals.
  const recs0 = await userRecords(userId, ['settings']);
  const ftp = Number(recs0.find((x) => x.kind === 'settings')?.ftp) || 0;
  let ftpSynced: number | undefined;
  if (ftp > 50) {
    const ss: any[] = (await call('sport-settings')) ?? [];
    const ride = ss.find((x) => (x.types ?? []).includes('VirtualRide') || (x.types ?? []).includes('Ride'));
    if (ride && ride.ftp !== ftp) { await call(`sport-settings/${ride.id}`, { method: 'PUT', body: JSON.stringify({ ftp }) }); ftpSynced = ftp; }
  }

  // 1) Envia os pedais planejados dos próximos 7 dias (o intervals repassa ao MyWhoosh e ao Garmin).
  const recs = await userRecords(userId, ['plan', 'wtemplate', 'skip', 'extra']);
  const plans = recs.filter((x) => x.kind === 'plan');
  // Treinos do dia: plano semanal + avulsos combinados com a treinadora para aquela data.
  const dayIds = (d: string) => {
    const wd = ((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1;
    const base: string[] = planFor(plans, 'training', d)?.training?.[String(wd)] ?? [];
    const add = recs.filter((x) => x.kind === 'extra' && x.date === d).map((x) => String(x.ref));
    return Array.from(new Set([...base, ...add]));
  };
  const events: any[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    for (const id of dayIds(d)) {
      const t = recs.find((x) => x.kind === 'wtemplate' && x.id === id);
      if (!t?.steps?.length || recs.some((x) => x.kind === 'skip' && x.date === d && x.ref === id)) continue;
      events.push({ category: 'WORKOUT', type: 'VirtualRide', start_date_local: `${d}T00:00:00`, name: t.name, description: workoutText(t), external_id: `ritual:${d}:${id}`, moving_time: t.steps.reduce((a: number, s: any) => a + s.minutes * 60, 0) });
    }
  }
  if (events.length) await call('events/bulk?upsert=true', { method: 'POST', body: JSON.stringify(events) });
  // remove do calendário o que o Ritual tinha enviado e saiu do plano
  const keep = new Set(events.map((e) => e.external_id));
  const existingEv: any[] = (await call(`events?oldest=${today}&newest=${addDays(today, 7)}&category=WORKOUT`)) ?? [];
  for (const ev of existingEv) if (String(ev.external_id ?? '').startsWith('ritual:') && !keep.has(ev.external_id)) await call(`events/${ev.id}`, { method: 'DELETE' }).catch(() => null);

  // 2) Traz sono, VFC, FC de repouso e passos; preserva o que foi digitado à mão quando o intervals não tem o dado.
  const [wellness, activities] = await Promise.all([call(`wellness?oldest=${oldest}&newest=${today}`), call(`activities?oldest=${oldest}&newest=${today}`)]);
  const { data: manual } = await admin.from('records').select('id, data').eq('user_id', userId).eq('kind', 'wellness').gte('data->>date', oldest);
  const prev = new Map((manual ?? []).map((r: any) => [r.id, r.data]));
  const rows: any[] = [];
  const ts = Date.now();
  const nowIso = new Date().toISOString();
  for (const w of wellness ?? []) {
    const date = String(w.id ?? w.date ?? '').slice(0, 10);
    if (!date) continue;
    const sleepSecs = num(w.sleepSecs, w.sleep_secs);
    const fresh: any = {
      steps: num(w.steps), sleepH: sleepSecs ? Math.round((sleepSecs / 3600) * 100) / 100 : num(w.sleepHours),
      sleepScore: num(w.sleepScore), restingHR: num(w.restingHR, w.resting_hr), hrv: num(w.hrv, w.hrvSDNN), weight: num(w.weight),
      ctl: num(w.ctl), atl: num(w.atl), readiness: num(w.readiness), stress: num(w.stress)
    };
    for (const k of Object.keys(fresh)) if (fresh[k] == null) delete fresh[k];
    if (!Object.keys(fresh).length) continue;
    const old = prev.get(`wellness:${date}`) ?? {};
    rows.push({ id: `wellness:${date}`, user_id: userId, kind: 'wellness', deleted: false, client_updated_at: nowIso, data: { ...old, ...fresh, date, source: 'intervals', createdAt: old.createdAt ?? ts, updatedAt: ts } });
  }
  // Menstruação registrada no Garmin/intervals vira dia de ciclo, sem sobrescrever (nem recriar) o que ela marcou ou apagou no app.
  const periodDays = (wellness ?? []).filter((w: any) => w.menstrualPhase === 'PERIOD').map((w: any) => String(w.id ?? '').slice(0, 10)).filter(Boolean);
  if (periodDays.length) {
    const { data: have } = await admin.from('records').select('id').eq('user_id', userId).eq('kind', 'cycle').in('id', periodDays.map((d: string) => `cycle:${d}`));
    const got = new Set((have ?? []).map((r: any) => r.id));
    for (const d of periodDays) if (!got.has(`cycle:${d}`)) rows.push({ id: `cycle:${d}`, user_id: userId, kind: 'cycle', deleted: false, client_updated_at: nowIso, data: { date: d, flow: 'medio', symptoms: [], source: 'intervals', createdAt: ts, updatedAt: ts } });
  }
  const { data: existing } = await admin.from('records').select('id, data').eq('user_id', userId).eq('kind', 'workout').eq('deleted', false).gte('data->>date', oldest);
  const fitStarts = (existing ?? []).filter((r: any) => r.data?.metrics?.source === 'fit' && r.data?.startTime).map((r: any) => new Date(r.data.startTime).getTime());
  let acts = 0;
  // O mesmo treino pode chegar por duas origens (MyWhoosh e Garmin): fica um só, o que tem potência.
  const sorted = [...(activities ?? [])].sort((x: any, y: any) => Number(!!y.icu_weighted_avg_watts) - Number(!!x.icu_weighted_avg_watts));
  // Qualquer treino já gravado com horário (do relógio, do arquivo ou uma aula que recebeu os dados do relógio).
  const icuOthers = (existing ?? []).filter((r: any) => r.data?.startTime).map((r: any) => ({ id: r.id, t: new Date(r.data.startTime).getTime() }));
  const existingById = new Map((existing ?? []).map((r: any) => [r.id, r.data]));
  // Removidos por ela ou juntados a uma aula: não voltam.
  const { data: gone } = await admin.from('records').select('id').eq('user_id', userId).eq('kind', 'workout').eq('deleted', true).like('id', 'workout:icu:%');
  const goneIds = new Set((gone ?? []).map((r: any) => r.id));
  const taken: number[] = [];
  for (const a of sorted) {
    if (!a?.id || !a.start_date_local) continue;
    // Atividades vindas do Strava chegam vazias pela API (regra do Strava): não servem para nada aqui.
    if (a.source === 'STRAVA' || !String(a.id).startsWith('i') || !(num(a.moving_time, a.elapsed_time) ?? 0)) continue;
    const start = new Date(a.start_date ?? a.start_date_local).getTime();
    if (fitStarts.some((t: number) => Math.abs(t - start) < 5 * 60_000)) continue; // já veio pelo arquivo
    if (taken.some((t) => Math.abs(t - start) < 5 * 60_000)) continue; // duplicado nesta leva
    if (goneIds.has(`workout:icu:${a.id}`)) continue;
    if (icuOthers.some((o: any) => o.id !== `workout:icu:${a.id}` && Math.abs(o.t - start) < 5 * 60_000)) continue; // já existe pela outra origem
    taken.push(start);
    const moving = num(a.moving_time, a.elapsed_time) ?? 0;
    const np = num(a.icu_weighted_avg_watts, a.weighted_average_watts);
    const ftp = num(a.icu_ftp);
    const date = String(a.start_date_local).slice(0, 10);
    let modalityId = SPORT[a.type] ?? 'mod:musculacao';
    const dayTpls = dayIds(date).map((id: string) => recs.find((x) => x.kind === 'wtemplate' && x.id === id)).filter(Boolean);
    // O relógio não tem LPO: musculação perto do horário de uma aula planejada é a aula.
    let reclassifiedFrom: string | undefined;
    if (modalityId === 'mod:musculacao') {
      const hhmm = String(a.start_date_local).slice(11, 16);
      const m = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      const cls = dayTpls.find((t: any) => t.time && t.modalityId !== 'mod:musculacao' && (() => { const d = m - (Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(3, 5))); return d >= -45 && d <= 90; })());
      if (cls) { reclassifiedFrom = modalityId; modalityId = cls.modalityId; }
    }
    const planned = dayTpls.find((t: any) => t?.modalityId === modalityId);
    // O que ela escreveu ou ajustou no app (esforço, comentário, modalidade corrigida) nunca é sobrescrito pela sincronização.
    const prev: any = existingById.get(`workout:icu:${a.id}`) ?? {};
    // 'locked' traz os campos que ela corrigiu (à mão ou conversando com a treinadora): esses também ficam.
    const keepKeys = ['rpe', 'feeling', 'muscles', 'note', 'combo', 'restType', 'classChecked', 'reclassifiedFrom', 'reclassifiedBy', 'locked', 'createdAt', ...(Array.isArray(prev.locked) ? prev.locked : [])];
    const keep = Object.fromEntries(keepKeys.filter((k) => prev[k] !== undefined).map((k) => [k, prev[k]]));
    if (prev.classChecked || prev.modalityId && prev.modalityId !== (SPORT[a.type] ?? 'mod:musculacao')) { modalityId = prev.modalityId; }
    rows.push({ id: `workout:icu:${a.id}`, user_id: userId, kind: 'workout', deleted: false, client_updated_at: nowIso, data: {
      date, createdAt: ts, updatedAt: ts, startTime: a.start_date ?? a.start_date_local, reclassifiedFrom, classChecked: reclassifiedFrom ? true : undefined,
      modalityId, duration: Math.round(moving / 60), templateId: prev.templateId ?? planned?.id, fromPlan: prev.fromPlan ?? !!planned,
      intensity: np && ftp ? (np / ftp < 0.7 ? 'leve' : np / ftp < 0.85 ? 'moderada' : 'intensa') : 'moderada',
      distanceKm: a.distance ? Math.round(a.distance / 10) / 100 : undefined, name: a.name,
      metrics: {
        source: 'intervals', sport: a.type, distanceKm: a.distance ? Math.round(a.distance / 10) / 100 : undefined,
        kcal: num(a.calories), avgHr: num(a.average_heartrate), maxHr: num(a.max_heartrate),
        avgPower: num(a.icu_average_watts, a.average_watts), np, if: np && ftp ? Math.round((np / ftp) * 100) / 100 : undefined,
        tss: num(a.icu_training_load), avgCadence: num(a.average_cadence), ascentM: num(a.total_elevation_gain), ftpUsed: ftp
      },
      ...keep
    } });
    acts++;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('records').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
  }
  await admin.from('user_secrets').update({ meta: { ...(sec.meta ?? {}), lastSync: nowIso } }).eq('user_id', userId).eq('provider', 'intervals');
  return { wellness: (wellness ?? []).length, activities: acts, pushed: events.length, ftpSynced };
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
      const out: any = { reminders: await sendReminders() };
      if (nowParts().min % 60 < 5 || body.sync === true) {
        const { data: users } = await admin.from('user_secrets').select('user_id').eq('provider', 'intervals');
        out.intervals = [];
        for (const u of users ?? []) { try { out.intervals.push(await syncIntervals(u.user_id, Number(body.days) || 3)); } catch (e) { out.intervals.push({ error: String(e) }); } }
      }
      return json(out);
    }

    const user = await userFrom(req);
    if (!user) return json({ error: 'Entre com Google para usar este recurso.' }, 401);

    if (action === 'intervals_sync') return json(await syncIntervals(user.id, Number(body.days) || 30));
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
