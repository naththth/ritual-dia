// Semana de treino da periodização: o app calcula o esqueleto, a treinadora preenche, ela aprova.
import { all, byDateRange, create, get, remove, update, upsert } from '../db/db';
import type { Intensity, MacroCycle, ProposedSession, SlotKey, TrainingWeek, WeekSession, WeekSkeleton, Workout, WorkoutStep } from '../db/types';
import { addDays, todayKey, weekStart, type DateKey } from '../lib/dates';
import { askAI } from './ai';
import { trainingLoad } from './load';
import { metricsForAI } from './workoutMetrics';
import { wellnessForAI } from './wellness';
import {
  PHASE_LABEL, SLOT_LABEL, SLOT_SPORT, countdown, runZones, doneBySport, macroWeeks, nextLevel, plannedBySport, skeletonFor, weekIndex
} from './periodization';

export const MACRO_ID = 'macro:atual';
export const tweekId = (monday: DateKey) => `tweek:${monday}`;
const DAY = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const INT: Intensity[] = ['leve', 'moderada', 'intensa'];
const MOD: Record<string, string> = { run_main: 'mod:corrida', run_easy: 'mod:corrida', run_long: 'mod:corrida', bike: 'mod:ciclismo', bike_long: 'mod:ciclismo', yoga: 'mod:yoga', yoga_class: 'mod:yoga', strength: 'mod:musculacao', lpo: 'mod:lpo' };

export async function loadMacro(): Promise<MacroCycle | undefined> {
  const m = await get<'macro'>(MACRO_ID);
  return m?.active ? m : undefined;
}

/** VFC dos últimos 3 dias toda abaixo de 90% da média de 28 dias. */
export function hrvLow(ws: { date: DateKey; hrv?: number }[], today: DateKey): boolean {
  const base = ws.filter((w) => w.hrv && w.date < addDays(today, -2)).map((w) => w.hrv!);
  const last = ws.filter((w) => w.hrv && w.date >= addDays(today, -2)).map((w) => w.hrv!);
  if (base.length < 7 || last.length < 3) return false;
  const avg = base.reduce((a, b) => a + b, 0) / base.length;
  return last.every((v) => v < avg * 0.9);
}

/** Esqueleto da semana com o nível decidido pelo que aconteceu na semana anterior. */
export async function skeletonForWeek(m: MacroCycle, monday: DateKey): Promise<{ skeleton: WeekSkeleton; holds: string[] }> {
  const index = weekIndex(m, monday);
  const tmpls = await all('wtemplate');
  const fixed = (id: string) => tmpls.find((t) => t.id === id)?.duration;
  const prevMonday = addDays(monday, -7);
  const prev = await get<'tweek'>(tweekId(prevMonday));
  const prevUsable = prev && prev.status !== 'descartada' ? prev : undefined;
  const today = todayKey();
  const hist = await byDateRange('workout', addDays(today, -120), today);
  const load = trainingLoad(hist, addDays(today, -120), today).slice(-1)[0];
  const wel = await byDateRange('wellness', addDays(today, -30), today);
  const done = prevUsable ? doneBySport(await byDateRange('workout', prevMonday, addDays(prevMonday, 6))) : undefined;
  const { level, holds } = nextLevel(m, index, prevUsable ? { level: prevUsable.skeleton.level, skeleton: prevUsable.baseSkeleton ?? prevUsable.skeleton } : undefined, done, { tsb: load?.tsb, hrvLow: hrvLow(wel, today) });
  return { skeleton: skeletonFor(m, index, level, fixed), holds };
}

const pace = (w: Workout) => {
  const km = (w.metrics as any)?.distanceKm as number | undefined;
  if (!km || !w.duration) return undefined;
  const s = (w.duration * 60) / km;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;
};

export async function weekContext(m: MacroCycle, monday: DateKey, skeleton: WeekSkeleton, holds: string[], pedido?: string) {
  const today = todayKey();
  const [settings, tmpls, hist, wel] = await Promise.all([get<'settings'>('settings'), all('wtemplate'), byDateRange('workout', addDays(today, -42), today), byDateRange('wellness', addDays(today, -7), today)]);
  const all120 = await byDateRange('workout', addDays(today, -120), today);
  const load = trainingLoad(all120, addDays(today, -120), today).slice(-1)[0];
  const prevMonday = addDays(monday, -7);
  const prev = await get<'tweek'>(tweekId(prevMonday));
  const runs = hist.filter((w) => w.modalityId === 'mod:corrida');
  const rides = hist.filter((w) => w.modalityId === 'mod:ciclismo');
  const maxHr = Math.max(0, ...all120.filter((w) => w.modalityId === 'mod:corrida').map((w) => w.metrics?.maxHr ?? 0));
  const tname = (id?: string) => tmpls.find((t) => t.id === id)?.name;
  return {
    hoje: today,
    semana: {
      numero: skeleton.index, de: skeleton.total, inicio: monday, fim: addDays(monday, 6), fase: PHASE_LABEL[skeleton.phase],
      semana_leve: skeleton.deload, degrau_da_progressao: skeleton.level + 1, degraus: skeleton.levels
    },
    travas_da_progressao: holds,
    desafios: countdown(m, today).map((c) => ({ desafio: c.label, data: c.date, faltam_dias: c.days })),
    esqueleto: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dia: d, nome_dia: DAY[d], data: addDays(monday, d - 1),
      sessoes: (skeleton.days[d] ?? []).map((s) => ({
        chave: s.key, tipo: SLOT_LABEL[s.key], minutos_alvo: s.minutes, intencao: s.intent,
        sessao_fixa: s.templateId ? tname(s.templateId) ?? SLOT_LABEL[s.key] : undefined, desafio: s.event?.label,
        teste: s.test === 'run_lthr' ? 'limiar de corrida' : s.test === 'ftp' ? 'FTP em rampa' : undefined
      }))
    })),
    ftp: settings?.ftp ?? null,
    ftp_medido_em: settings?.ftpAt,
    limiar_corrida_fc: settings?.runLthr ?? null,
    zonas_corrida_fc: settings?.runLthr ? runZones(settings.runLthr) : null,
    fc_max_vista_na_corrida: maxHr || null,
    corridas_6_semanas: runs.map((w) => ({ data: w.date, minutos: w.duration, km: (w.metrics as any)?.distanceKm, pace: pace(w), fc_media: w.metrics?.avgHr, fc_max: w.metrics?.maxHr, esforco: w.rpe, como_foi: w.feeling })),
    pedais_6_semanas: rides.map((w) => ({ data: w.date, minutos: w.duration, tss: w.metrics?.tss, np: w.metrics?.np, potencia_media: w.metrics?.avgPower, fc_media: w.metrics?.avgHr, esforco: w.rpe, esporte: metricsForAI(w)?.esporte })),
    outras_sessoes_6_semanas: hist.filter((w) => w.modalityId !== 'mod:corrida' && w.modalityId !== 'mod:ciclismo').map((w) => ({ data: w.date, modalidade: w.modalityId.replace('mod:', ''), minutos: w.duration, esforco: w.rpe })),
    carga: load ? { fitness: Math.round(load.ctl), fadiga: Math.round(load.atl), forma: Math.round(load.tsb) } : null,
    sono_e_recuperacao_7_dias: wel.map(wellnessForAI),
    semana_anterior: prev && prev.status !== 'descartada' ? {
      planejado_minutos: plannedBySport(prev.skeleton),
      feito_minutos: doneBySport(await byDateRange('workout', prevMonday, addDays(prevMonday, 6))),
      sessoes_propostas: prev.sessions.filter((s) => !s.templateId).map((s) => ({ dia: s.day, nome: s.name, minutos: s.duration }))
    } : null,
    pedido_dela: pedido || undefined
  };
}

const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };

/** Transforma a resposta da IA em sessões válidas. Sessão que faltar ou vier fora do alvo é corrigida pelo esqueleto. */
export function sessionsFrom(skeleton: WeekSkeleton, r: any, tmplName: (id: string) => string | undefined): ProposedSession[] {
  const list: any[] = Array.isArray(r?.sessoes) ? r.sessoes : [];
  const out: ProposedSession[] = [];
  for (let d = 1; d <= 7; d++) {
    const used = new Set<any>();
    for (const s of skeleton.days[d] ?? []) {
      if (s.commitment) {
        out.push({ day: d, key: s.key, name: s.commitment, modalityId: MOD[s.key], duration: s.minutes, intensity: 'intensa', note: s.intent });
        continue;
      }
      if (s.templateId && !s.event) {
        out.push({ day: d, key: s.key, templateId: s.templateId, name: tmplName(s.templateId) ?? SLOT_LABEL[s.key], modalityId: MOD[s.key], duration: s.minutes, intensity: 'moderada' });
        continue;
      }
      const a = list.find((x) => !used.has(x) && Number(x?.dia) === d && String(x?.chave) === s.key);
      if (a) used.add(a);
      const target = s.minutes;
      const minutes = num(a?.minutos, target * 0.85, target * 1.15) ? Math.round(Number(a.minutos)) : target;
      const sport = SLOT_SPORT[s.key];
      let steps: WorkoutStep[] | undefined = Array.isArray(a?.blocos) ? a.blocos
        .map((b: any) => ({ label: String(b?.rotulo ?? '').trim() || 'Bloco', minutes: Number(b?.minutos), pct: Number(b?.pct), target: String(b?.alvo ?? '').trim() || undefined }))
        .filter((b: WorkoutStep) => b.minutes > 0 && b.minutes <= 240 && b.pct >= 30 && b.pct <= 200)
        .map((b: WorkoutStep) => ({ ...b, minutes: Math.round(b.minutes * 100) / 100, pct: Math.round(b.pct), ...(sport === 'ciclismo' ? { target: undefined } : {}) })) : undefined;
      if (!sport) steps = undefined;
      if (steps?.length) {
        // Os blocos precisam fechar o tempo da sessão: se não fecham, o último bloco absorve a diferença (ou tudo escala).
        const sum = steps.reduce((x, b) => x + b.minutes, 0);
        if (Math.abs(sum - minutes) > 1) {
          const k = minutes / sum;
          steps = steps.map((b) => ({ ...b, minutes: Math.max(0.25, Math.round(b.minutes * k * 4) / 4) }));
        }
        if (sport === 'ciclismo') steps = steps.map(({ target: _t, ...b }) => b);
      }
      const name = String(a?.nome ?? '').trim() || (s.event ? `Desafio · ${s.event.label}` : SLOT_LABEL[s.key]);
      out.push({
        day: d, key: s.key, name: s.event && !/desafio/i.test(name) ? `Desafio · ${name}` : name, modalityId: MOD[s.key], duration: minutes,
        intensity: INT.includes(a?.intensidade) ? a.intensidade : s.event ? 'intensa' : 'leve',
        steps: steps?.length ? steps : undefined,
        note: [String(a?.roteiro ?? '').trim() || s.intent].filter(Boolean).join('\n')
      });
    }
  }
  return out;
}

const COMMIT_KEYS: SlotKey[] = ['lpo', 'strength', 'yoga', 'yoga_class'];

/**
 * Pedido dela que mexe na estrutura (dias, folgas, compromissos): a treinadora devolve como a semana fica,
 * sempre apontando para sessões do esqueleto original. Ela pode mudar de dia, encurtar e tirar sessões,
 * nunca criar treino de endurance novo nem alongar. Desafio do ciclo não sai do dia. Sem ajuste válido, devolve undefined.
 */
export function adjustSkeleton(base: WeekSkeleton, r: any): WeekSkeleton | undefined {
  const plan: any[] | undefined = Array.isArray(r?.esqueleto_ajustado) ? r.esqueleto_ajustado : undefined;
  const commits: any[] = Array.isArray(r?.compromissos) ? r.compromissos : [];
  if (!plan && !commits.length) return undefined;
  const days: Record<string, WeekSession[]> = {};
  for (let d = 1; d <= 7; d++) days[d] = [];
  const used = new Set<WeekSession>();
  if (plan) {
    for (const day of plan) {
      const d = Number(day?.dia);
      if (!(d >= 1 && d <= 7) || !Array.isArray(day?.sessoes)) continue;
      for (const it of day.sessoes) {
        const from = Number(it?.de_dia);
        const orig = (base.days[from] ?? []).find((s) => s.key === String(it?.chave) && !used.has(s));
        if (!orig || orig.event) continue;
        used.add(orig);
        const m = Number(it?.minutos);
        const minutes = orig.templateId ? orig.minutes : Number.isFinite(m) && m >= 5 && m <= orig.minutes ? Math.round(m / 5) * 5 || 5 : orig.minutes;
        days[d].push({ ...orig, minutes });
      }
    }
  } else {
    for (let d = 1; d <= 7; d++) for (const s of base.days[d] ?? []) if (!s.event) { used.add(s); days[d].push({ ...s }); }
  }
  // Desafio do ciclo fica onde está.
  for (let d = 1; d <= 7; d++) for (const s of base.days[d] ?? []) if (s.event) days[d].unshift({ ...s });
  for (const c of commits) {
    const d = Number(c?.dia);
    const key = String(c?.chave) as SlotKey;
    const name = String(c?.nome ?? '').trim().slice(0, 60);
    const m = Math.round(Number(c?.minutos));
    if (!(d >= 1 && d <= 7) || !COMMIT_KEYS.includes(key) || !name) continue;
    days[d].push({ key, minutes: m >= 15 && m <= 600 ? m : 120, intent: String(c?.nota ?? '').trim() || name, commitment: name });
  }
  return { ...base, days };
}

/** Monta (ou refaz) a proposta da semana com a treinadora. Não mexe no plano: só guarda a proposta para ela aprovar. */
export async function proposeWeek(monday: DateKey, pedido?: string): Promise<TrainingWeek> {
  const m = await loadMacro();
  if (!m) throw new Error('Nenhum ciclo de treino ativo.');
  const idx = weekIndex(m, monday);
  if (idx < 1 || idx > macroWeeks(m)) throw new Error('Essa semana está fora do ciclo de treino.');
  const { skeleton, holds } = await skeletonForWeek(m, monday);
  const ctx = await weekContext(m, monday, skeleton, holds, pedido);
  const r = await askAI<any>('training_week', ctx);
  const tmpls = await all('wtemplate');
  // Só o pedido dela muda dias e sessões; sem pedido, vale o esqueleto da regra.
  const adjusted = pedido ? adjustSkeleton(skeleton, r) : undefined;
  const sessions = sessionsFrom(adjusted ?? skeleton, r, (id) => tmpls.find((t) => t.id === id)?.name);
  // Se já havia uma versão aprovada, ela continua valendo no plano até esta nova ser aprovada.
  return upsert('tweek', tweekId(monday), {
    date: monday, status: 'proposta', skeleton: adjusted ?? skeleton, baseSkeleton: adjusted ? skeleton : undefined, holds, sessions,
    mensagem: String(r?.mensagem ?? '').trim(), pedido: pedido || undefined, provider: typeof r?._provedor === 'string' ? r._provedor : undefined,
    approvedAt: undefined
  });
}

/** Aprova: cria as sessões da semana e põe no plano a partir da segunda (ou de hoje, se a semana já começou). */
export async function approveWeek(tw: TrainingWeek): Promise<TrainingWeek> {
  const validFrom = tw.validFrom ?? (tw.date < todayKey() ? todayKey() : tw.date);

  const today = todayKey();
  const live = tw.planId ? await get<'plan'>(tw.planId) : undefined;
  // Refazendo uma semana já aprovada no meio dela: os dias que passaram ficam como estavam.
  const past = (d: number) => !!live && addDays(tw.date, d - 1) < today;
  const training: Record<number, string[]> = {};
  for (let d = 1; d <= 7; d++) training[d] = past(d) ? [...(live?.training?.[d] ?? [])] : [];
  for (const s of tw.sessions) {
    if (past(s.day)) continue;
    // Sessão fixa (musculação, LPO, aula): usa o modelo de sempre, com o histórico de cargas e as fotos.
    const fixed = s.templateId ? await get<'wtemplate'>(s.templateId) : undefined;
    if (fixed) { training[s.day].push(fixed.id); continue; }
    const rec = await create('wtemplate', {
      name: s.name, modalityId: s.modalityId, duration: s.duration, intensity: s.intensity, note: s.note, time: s.time, weekOf: tw.date,
      // Só o pedal leva 'steps' (vai ao MyWhoosh); a corrida guarda os blocos à parte e fica no app.
      ...(s.modalityId === 'mod:ciclismo' ? { steps: s.steps } : { runSteps: s.steps })
    });
    training[s.day].push(rec.id);
  }
  // Sessões da versão anterior desta semana saem; as fixas continuam.
  const created = new Set(Object.values(training).flat());
  for (const t of await all('wtemplate')) if (t.weekOf === tw.date && !created.has(t.id)) await remove(t.id);
  let planId = tw.planId; let planCreated = tw.planCreated; let prevTraining = tw.prevTraining;
  if (live) await update<'plan'>(live.id, { training });
  else {
    const same = (await all('plan')).find((p) => p.domain === 'training' && p.validFrom === validFrom);
    if (same) { prevTraining = same.training; planId = same.id; planCreated = false; await update<'plan'>(same.id, { training }); }
    else { const p = await create('plan', { domain: 'training', validFrom, training } as any); planId = p.id; planCreated = true; prevTraining = undefined; }
  }
  const out = await update<'tweek'>(tw.id, { status: 'aprovada', planId, planCreated, prevTraining, validFrom: live ? tw.validFrom : validFrom, approvedAt: Date.now() });
  import('../sync/services').then((x) => x.pushTrainingSoon()).catch(() => {});
  return out!;
}

/** Desfaz o aprovo: o plano volta como estava e as sessões criadas para a semana saem. */
export async function undoWeek(tw: TrainingWeek, keepStatus = false) {
  if (tw.planId) {
    if (tw.planCreated) await remove(tw.planId);
    else await update<'plan'>(tw.planId, { training: tw.prevTraining ?? {} });
  }
  for (const t of await all('wtemplate')) if (t.weekOf === tw.date) await remove(t.id);
  if (!keepStatus) await update<'tweek'>(tw.id, { status: 'proposta', planId: undefined, planCreated: undefined, prevTraining: undefined, validFrom: undefined, approvedAt: undefined });
  import('../sync/services').then((x) => x.pushTrainingSoon()).catch(() => {});
}

/** Para a treinadora do chat: onde ela está no ciclo. */
export async function periodizationForAI(date: DateKey) {
  const m = await loadMacro();
  if (!m) return undefined;
  const idx = weekIndex(m, date);
  const tw = await get<'tweek'>(tweekId(weekStart(date)));
  return {
    ciclo: m.title, semana: idx, de: macroWeeks(m),
    fase: tw ? PHASE_LABEL[tw.skeleton.phase] : undefined, semana_leve: tw?.skeleton.deload,
    desafios: countdown(m, date).map((c) => ({ desafio: c.label, data: c.date, faltam_dias: c.days })),
    semana_atual: tw ? { status: tw.status, travas: tw.holds, alvos: Object.fromEntries(Object.entries(tw.skeleton.days).map(([d, ss]) => [DAY[Number(d)], ss.map((s) => `${SLOT_LABEL[s.key]} ${s.minutes} min`)])) } : 'ainda sem proposta'
  };
}

export const dayName = (d: number) => DAY[d];
