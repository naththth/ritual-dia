// Ponte com o assistente (função privada no Supabase). O app manda só o contexto necessário.
import { nightAdjust } from './skinAdapt';
import { supabase, useSync } from '../sync/sync';
import { trainingLoad } from './load';
import { wellnessForAI } from './wellness';
import { all, byDateRange, create, get, upsert } from '../db/db';
import type { Plan, Product, WorkoutStep } from '../db/types';
import { addDays, isoWeekday, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedSkin, plannedTraining } from './rules';

export type AITask = 'skin_plan' | 'training_plan' | 'food_plan' | 'day_brief' | 'training_review' | 'week_review' | 'wellness_read' | 'label_read' | 'targets' | 'doc_read' | 'product_read' | 'plate_read' | 'plan_chat' | 'training_coach' | 'skin_coach' | 'food_coach' | 'skin_layers';

/** Só nos testes automáticos: uma IA simulada injetada pela página de teste. */
const testAI = () => (typeof window !== 'undefined' ? (window as any).__RITUAL_TEST_AI as ((task: string, ctx: any) => any) | undefined : undefined);

export function aiAvailable() {
  if (testAI()) return true;
  return !!supabase && !!useSync.getState().session && navigator.onLine;
}

/** Traduz os erros mais comuns dos provedores para algo que diz o que fazer. */
function friendly(msg: string) {
  if (/402|credits are depleted|prepayment|billing|quota/i.test(msg)) return 'Os créditos da IA acabaram. Recarregue no Google AI Studio (Faturamento) ou troque a chave no Supabase.';
  if (/429|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) return 'A IA atingiu o limite de uso por agora. Tente de novo em alguns minutos.';
  if (/503|overloaded|high demand/i.test(msg)) return 'A IA está sobrecarregada agora. Tente de novo em instantes.';
  if (/cortada|MAX_TOKENS|sem JSON/i.test(msg)) return 'A resposta da IA veio incompleta. Tente de novo; se repetir, me avise.';
  if (/API key not valid|invalid api key|401/i.test(msg)) return 'A chave da IA não foi aceita. Confira o segredo no Supabase.';
  if (/Failed to send a request|Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'A conexão caiu no meio do envio. Tente de novo com a internet mais estável.';
  return msg;
}

export async function askAI<T = any>(task: AITask, context: unknown, images?: { mime: string; data: string }[], files?: { bucket: string; path: string; mime: string }[]): Promise<T> {
  const fake = testAI();
  if (fake) return fake(task, context) as T;
  if (!supabase) throw new Error('Sincronização não configurada.');
  if (!useSync.getState().session) throw new Error('Entre com Google para usar a IA.');
  if (!navigator.onLine) throw new Error('Sem conexão. A IA precisa de internet.');
  // Todo pedido leva o perfil e os objetivos dela, para a IA responder como especialista que a conhece.
  let ctx = context;
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    const st = await get<'settings'>('settings');
    const pf = st?.profile;
    const docs = task === 'doc_read' ? [] : (await all('healthdoc'));
    const { docsForAI } = await import('./health');
    const extra: Record<string, unknown> = {};
    if (pf && Object.keys(pf).length) extra.perfil_dela = { ...pf, idade: pf.birthYear ? new Date().getFullYear() - pf.birthYear : undefined, updatedAt: undefined };
    if (docs.length) extra.exames_e_documentos = docsForAI(docs as any);
    const cyc = await cycleForAI(((ctx as any).data ?? (ctx as any).date ?? todayKey()) as DateKey, pf);
    if (cyc) extra.ciclo_menstrual = cyc;
    const prefKey = task === 'plan_chat' ? ((ctx as any).dominio as 'skin' | 'training' | 'food') : ({ skin_plan: 'skin', training_plan: 'training', training_review: 'training', training_coach: 'training', food_plan: 'food', skin_coach: 'skin', food_coach: 'food', skin_layers: 'skin' } as const)[task as 'skin_plan'];
    const pref = prefKey ? st?.aiPrefs?.[prefKey]?.trim() : undefined;
    if (pref) extra.preferencias_dela = pref;
    ctx = { ...extra, ...(ctx as object) };
  }
  const { data, error } = await Promise.race([
    supabase.functions.invoke('ritual-ai', { body: { task, context: ctx, images, files } }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('A IA demorou demais para responder. Tente de novo.')), files?.length || images?.length || task === 'skin_plan' || task === 'plan_chat' ? 150000 : 90000))
  ]);
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
    throw new Error(friendly(msg));
  }
  if (data?.error) throw new Error(friendly(data.error));
  return data.result as T;
}

/** Fase estimada, dias até a próxima menstruação e sintomas recentes, para treino, pele e alimentação. */
async function cycleForAI(date: DateKey, pf?: import('../db/types').Profile) {
  if (pf?.cycle?.tracks === false || pf?.sex === 'M') return undefined;
  const { cycleInfo, cycleStats } = await import('./cycle');
  const days = await all('cycle');
  if (!days.length) return undefined;
  const stats = cycleStats(days, pf);
  const info = cycleInfo(date, stats, pf);
  if (!info) return undefined;
  const recent = days.filter((d) => d.date <= date && d.date >= addDays(date, -4)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    dia_do_ciclo: info.day,
    fase_estimada: info.phase ?? (pf?.cycle?.hormonalContraception ? 'sem fase natural (anticoncepcional hormonal)' : undefined),
    dias_ate_proxima_menstruacao: pf?.cycle?.hormonalContraception ? undefined : info.daysToNext,
    atrasada: info.late || undefined,
    ciclo_medio_dias: stats.avgLength,
    menstruacao_media_dias: stats.avgPeriod,
    estimativa_aproximada: info.estimated || undefined,
    ultimos_dias: recent.map((d) => ({ data: d.date, fluxo: d.flow, sintomas: d.symptoms, obs: d.note }))
  };
}

const short = (p: Product) => ({ id: p.id, marca: p.brand, nome: p.name, tipo: p.group, categoria: p.originalCategory, ativo: !!p.active, periodo_preferido: p.period, ativos: p.info?.actives, para_que_serve: p.info?.purpose, modo_de_uso: p.info?.howToUse, cuidados: p.info?.cautions });

/* ---------- Pele ---------- */
export async function aiSkinPlan(today: DateKey) {
  const { ctx, decode } = await skinContext(today);
  return decode(await askAI<any>('skin_plan', ctx));
}

/** Contexto da rotina de cuidados e a tradução da resposta (códigos curtos de volta para os produtos). */
export async function skinContext(today: DateKey) {
  const settings = await get<'settings'>('settings');
  const products = (await all('product')).filter((p) => p.status === 'em_uso');
  const logs = await byDateRange('skin', addDays(today, -14), today);
  // Semana de treino: suor e cloro da piscina mudam a rotina de cabelo e corpo.
  const plans = await all('plan');
  const tp = planFor(plans, 'training', today);
  const tmpls = await all('wtemplate');
  const mods = await all('modality');
  const semana_de_treino: Record<string, string[]> = {};
  for (let d = 1; d <= 7; d++) semana_de_treino[d] = (tp?.training?.[d] ?? []).map((id) => { const t = tmpls.find((x) => x.id === id); return t ? `${t.name} (${mods.find((m) => m.id === t.modalityId)?.name ?? ''})` : ''; }).filter(Boolean);
  const ctx = {
    perfil_de_pele: settings?.skinProfile ?? [],
    observacoes_dela: settings?.aiContext ?? '',
    // Códigos curtos (p1, p2…) no lugar dos ids longos: a resposta fica bem menor e não corta.
    produtos: products.map((p, i) => ({ ...short(p), id: `p${i + 1}`, area: p.area ?? 'rosto' })),
    semana_de_treino,
    registros_recentes: logs.map((l) => ({ data: l.date, periodo: l.period, condicao: l.condition, sinais: l.signals, recuperacao: l.recovery }))
  };
  const decode = (r: any) => {
  const alias = new Map(products.map((p, i) => [`p${i + 1}`, p.id]));
  // Os textos às vezes citam os códigos curtos: troca pelo nome do produto.
  const nameOf = new Map(products.map((p, i) => [`p${i + 1}`, p.name]));
  const txt = (v: unknown) => (v ? String(v).replace(/\bp(\d+)\b/g, (m, n) => nameOf.get(`p${n}`) ?? m).trim() : undefined);
  const clean = (ids: unknown) => (Array.isArray(ids) ? ids.map((x) => alias.get(String(x))).filter((x): x is string => !!x) : []);
  const period = (pp: any) => {
    const days: Record<number, { add: string[]; remove: string[] }> = {};
    for (let d = 1; d <= 7; d++) {
      const x = pp?.days?.[d] ?? pp?.days?.[String(d)];
      if (x) days[d] = { add: clean(x.add), remove: clean(x.remove) };
    }
    return { base: clean(pp?.base), days };
  };
  return {
    skin: {
      am: period(r.am), pm: period(r.pm), recovery: { am: clean(r.recovery?.am), pm: clean(r.recovery?.pm) },
      diagnosis: r.diagnostico ? { rosto: txt(r.diagnostico.rosto), corpo: txt(r.diagnostico.corpo), cabelo: txt(r.diagnostico.cabelo), date: today } : undefined
    } as NonNullable<Plan['skin']>,
    resumo: txt(r.resumo) ?? '',
    observacoes: txt(r.observacoes) ?? ''
  };
  };
  const nameOfAlias = (code: string) => products[Number(String(code).slice(1)) - 1];
  return { ctx, decode, products, nameOfAlias };
}

/* ---------- Treino ---------- */
export interface AITrainingResult {
  templates: { key: string; name: string; modality: string; duration: number; intensity: 'leve' | 'moderada' | 'intensa'; time?: string; steps?: WorkoutStep[]; muscles?: string[] }[];
  week: Record<string, string[]>;
  resumo: string;
}
export async function aiTrainingPlan(): Promise<AITrainingResult> {
  return askAI<AITrainingResult>('training_plan', await trainingContext());
}
export async function trainingContext() {
  const settings = await get<'settings'>('settings');
  const mods = await all('modality');
  const tmpls = await all('wtemplate');
  const plans = await all('plan');
  const tp = planFor(plans, 'training', todayKey());
  return {
    semana_atual: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, (tp?.training?.[d] ?? []).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean).map((t) => ({ nome: t!.name, horario: t!.time, minutos: t!.duration }))])),
    ftp: settings?.ftp ?? null,
    observacoes_dela: settings?.aiContext ?? '',
    modalidades: mods.filter((m) => !m.archived).map((m) => m.name),
    treinos_modelo_existentes: tmpls.filter((t) => !t.archived).map((t) => ({ nome: t.name, duracao: t.duration, roteiro: t.note }))
  };
}

/** Grava os modelos sugeridos e devolve o plano semanal com os ids reais. */
export async function applyTrainingResult(r: AITrainingResult): Promise<Record<number, string[]>> {
  const mods = await all('modality');
  const modId = (m: string) => {
    const n = m.toLowerCase();
    return mods.find((x) => x.id === `mod:${n}` || x.name.toLowerCase().startsWith(n.slice(0, 5)))?.id ?? 'mod:musculacao';
  };
  const keyToId = new Map<string, string>();
  for (const t of r.templates ?? []) {
    const rec = await create('wtemplate', {
      name: t.name, modalityId: modId(t.modality), duration: Number(t.duration) || 45,
      intensity: ['leve', 'moderada', 'intensa'].includes(t.intensity) ? t.intensity : 'moderada',
      steps: Array.isArray(t.steps) ? t.steps.map((s) => ({ label: String(s.label), minutes: Number(s.minutes) || 5, pct: Number(s.pct) || 60 })) : undefined,
      muscles: t.muscles,
      note: Array.isArray((t as any).exercicios) && (t as any).exercicios.length ? [(t as any).roteiro, (t as any).exercicios.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')].filter(Boolean).join('\n\n') : (t as any).roteiro || undefined,
      time: /^\d{2}:\d{2}$/.test(String(t.time ?? '')) ? t.time : undefined
    });
    keyToId.set(t.key, rec.id);
  }
  const week: Record<number, string[]> = {};
  for (let d = 1; d <= 7; d++) week[d] = (r.week?.[String(d)] ?? []).map((k) => keyToId.get(k)).filter((x): x is string => !!x);
  return week;
}

/* ---------- Alimentação ---------- */
export async function aiFoodPlan(dietText: string) {
  return applyFoodResult(await askAI<any>('food_plan', await foodContext(dietText)));
}
export async function foodContext(dietText: string) {
  const settings = await get<'settings'>('settings');
  const foods = (await all('food')).filter((f) => !f.archived);
  return {
    dieta: dietText.slice(0, 20000),
    restricoes: settings?.foodPrefs ?? [],
    refeicoes_do_dia: settings?.mealTypes ?? [],
    alimentos: foods.map((f) => ({ id: f.id, nome: f.name, tipo: f.type }))
  };
}
/** Cria os alimentos novos e as refeições favoritas propostas e devolve o plano semanal com os ids reais. */
export async function applyFoodResult(r: any) {
  const foods = (await all('food')).filter((f) => !f.archived);
  // cria alimentos novos
  const byName = new Map<string, string>();
  for (const f of foods) byName.set(f.name.toLowerCase(), f.id);
  for (const nf of r.novos_alimentos ?? []) {
    const name = String(nf.nome ?? '').trim();
    if (!name || byName.has(name.toLowerCase())) continue;
    const rec = await create('food', { name, type: String(nf.tipo ?? 'Outros'), portions: ['P', 'M', 'G'], favorite: true });
    byName.set(name.toLowerCase(), rec.id);
  }
  const resolve = (id: string) => (id?.startsWith('novo:') ? byName.get(id.slice(5).trim().toLowerCase()) : foods.some((f) => f.id === id) ? id : undefined);
  const keyToId = new Map<string, string>();
  for (const m of r.refeicoes ?? []) {
    const items = (m.items ?? []).map((i: any) => ({ foodId: resolve(i.foodId), portion: String(i.portion ?? 'M') })).filter((i: any) => i.foodId);
    if (!items.length) continue;
    const rec = await create('mtemplate', { name: String(m.name), mealType: m.mealType, items });
    keyToId.set(m.key, rec.id);
  }
  const week: Record<number, Record<string, string | null>> = {};
  for (let d = 1; d <= 7; d++) {
    const src = r.week?.[String(d)] ?? {};
    week[d] = {};
    for (const [mt, key] of Object.entries(src)) week[d][mt] = keyToId.get(String(key)) ?? null;
  }
  return { week, resumo: String(r.resumo ?? '') };
}

/* ---------- Orientação do dia ---------- */
export async function aiDayBrief(date: DateKey) {
  const [tasks, plans, products, tmpls, mods, skinLogs, settings, workouts, journals, wellness, skips, meals, extras] = await Promise.all([
    all('task'), all('plan'), all('product'), all('wtemplate'), all('modality'), byDateRange('skin', addDays(date, -7), date), get<'settings'>('settings'),
    byDateRange('workout', addDays(date, -120), date), byDateRange('journal', addDays(date, -3), date), byDateRange('wellness', addDays(date, -7), date),
    byDateRange('skip', date, date), byDateRange('meal', date, date), byDateRange('extra', date, date)
  ]);
  const pending = tasks.filter((t) => t.status === 'pendente');
  const skinPlan = planFor(plans, 'skin', date);
  const name = (id: string) => products.find((p) => p.id === id)?.name;
  const skipped = new Set(skips.filter((x) => x.domain === 'training').map((x) => x.ref));
  const doneToday = workouts.filter((w) => w.date === date);
  // Planejado que ainda vale: nem pulado, nem já feito (mesma modalidade).
  const tr = plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean)
    .filter((t) => !skipped.has(t!.id) && !doneToday.some((w) => w.templateId === t!.id || w.modalityId === t!.modalityId));
  const now = new Date();
  const hora = date === todayKey() ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : undefined;
  const ctx = {
    data: date,
    dia_da_semana: ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][isoWeekday(date)],
    observacoes_dela: settings?.aiContext ?? '',
    escolhidas_para_hoje: pending.filter((t) => t.plannedDate === date).map((t) => t.title),
    tarefas_pendentes: pending.slice(0, 60).map((t) => ({ id: t.id, titulo: t.title, prioridade: t.priority, categoria: t.categoryId.replace('cat:', ''), subcategoria: t.subcategory, observacao: t.description, proximo_passo: t.nextStep, data_compromisso: t.appointmentDate, escolhida_para: t.plannedDate })),
    pele_plano_manha: plannedSkin(skinPlan, date, 'am', products, false, { skips, extras }).map(name),
    pele_plano_noite: plannedSkin(skinPlan, date, 'pm', products, false, { skips, extras }).map(name),
    // O app já calcula se a noite pede tirar o ativo; a frase de pele deve concordar com isso.
    ajuste_da_rotina_da_noite_sugerido_pelo_app: (() => {
      const adj = nightAdjust({ plannedPm: plannedSkin(skinPlan, date, 'pm', products, false, { skips, extras }), recoveryPm: skinPlan?.skin?.recovery?.pm ?? [], products, amLog: skinLogs.find((l) => l.date === date && l.period === 'am'), workouts: doneToday, plannedWorkouts: tr as any });
      return adj?.kind === 'swap' ? { sugestao: adj.title, motivos: adj.reasons } : undefined;
    })(),
    hora_agora: hora,
    pele_registros_7_dias: skinLogs.map((l) => ({ data: l.date, periodo: l.period, condicao: l.condition, sinais: Object.keys(l.signals ?? {}), produtos_usados: (l.productIds ?? []).map(name).filter(Boolean), pulou: l.skipped || undefined })),
    feito_hoje: {
      pele: skinLogs.filter((l) => l.date === date).map((l) => ({ periodo: l.period === 'am' ? 'manhã' : 'noite', produtos: (l.productIds ?? []).map(name).filter(Boolean) })),
      treinos: doneToday.map((w) => ({ modalidade: mods.find((m) => m.id === w.modalityId)?.name, minutos: w.duration })),
      refeicoes_registradas: meals.filter((m) => m.items?.length).map((m) => m.mealType)
    },
    treinos_pulados_hoje: [...skipped].map((id) => tmpls.find((t) => t.id === id)?.name).filter(Boolean),
    carga_de_treino: (() => { const l = trainingLoad(workouts, addDays(date, -120), date).slice(-1)[0]; return l ? { fitness: Math.round(l.ctl), fadiga: Math.round(l.atl), forma: Math.round(l.tsb) } : null; })(),
    treinos_ultimos_3_dias: workouts.filter((w) => w.date >= addDays(date, -3)).map((w) => ({ data: w.date, modalidade: mods.find((m) => m.id === w.modalityId)?.name, minutos: w.duration, tss: w.metrics?.tss, fc_media: w.metrics?.avgHr })),
    sono_e_recuperacao_7_dias: wellness.map(wellnessForAI),
    diario_ultimos_dias: journals.map((j) => ({ data: j.date, energia: j.energy, humor: j.mood, sono: j.sleep, estresse: j.stress, tags: j.tags })),
    treino_planejado: tr.map((t) => ({ nome: t!.name, modalidade: mods.find((m) => m.id === t!.modalityId)?.name, minutos: t!.duration }))
  };
  const r = await askAI<any>('day_brief', ctx);
  const valid = new Set(pending.map((t) => t.id));
  return upsert('brief', `brief:${date}`, {
    date,
    foco: r.foco ? String(r.foco) : undefined,
    pele: r.pele ? String(r.pele) : undefined,
    treino: r.treino ? String(r.treino) : undefined,
    tarefas: (r.tarefas ?? []).filter((t: any) => valid.has(t.id)).slice(0, 3).map((t: any) => ({ id: t.id, motivo: String(t.motivo ?? ''), primeiro_passo: String(t.primeiro_passo ?? '') }))
  });
}

export function watts(pct: number, ftp?: number) {
  return ftp ? Math.round((pct / 100) * ftp) : undefined;
}

/* ---------- Revisão da semana ---------- */
export async function aiWeekReview(weekStartKey: DateKey) {
  const end = addDays(weekStartKey, 6);
  const [habits, hlogs, workouts, meals, foods, skin, journals, tasks, readlogs, water, settings, wellness] = await Promise.all([
    all('habit'), byDateRange('hlog', weekStartKey, end), byDateRange('workout', weekStartKey, end), byDateRange('meal', weekStartKey, end), all('food'),
    byDateRange('skin', weekStartKey, end), byDateRange('journal', weekStartKey, end), all('task'),
    byDateRange('readlog', weekStartKey, end), byDateRange('water', weekStartKey, end), get<'settings'>('settings'), byDateRange('wellness', weekStartKey, end)
  ]);
  const { totals } = await import('./nutrition');
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
  const ctx = {
    semana: `${weekStartKey} a ${end}`,
    observacoes_dela: settings?.aiContext ?? '',
    habitos: habits.filter((h) => !h.archived).map((h) => ({ nome: h.title, meta: `${h.target}x ${h.freq}`, feitos: new Set([...hlogs.filter((l) => l.habitId === h.id && l.done).map((l) => l.date), ...(h.modalityId ? workouts.filter((w) => w.modalityId === h.modalityId).map((w) => w.date) : [])]).size })),
    treinos: workouts.map((w) => ({ data: w.date, modalidade: w.modalityId.replace('mod:', ''), minutos: w.duration, do_plano: !!w.fromPlan, np: w.metrics?.np, tss: w.metrics?.tss, fc_media: w.metrics?.avgHr, kcal: w.metrics?.kcal, esforco_percebido: w.rpe, como_foi: w.feeling })),
    alimentacao_por_dia: days.map((d) => { const its = meals.filter((m) => m.date === d).flatMap((m) => m.items); const t = totals(its, foods).n; return { data: d, refeicoes: meals.filter((m) => m.date === d && m.items.length).length, kcal: Math.round(t.kcal), proteina_g: Math.round(t.p), agua_ml: water.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0) }; }),
    pele: skin.map((s) => ({ data: s.date, periodo: s.period, condicao: s.condition, sinais: Object.keys(s.signals ?? {}), recuperacao: s.recovery })),
    diario: journals.map((j) => ({ data: j.date, energia: j.energy, humor: j.mood, sono: j.sleep, estresse: j.stress, tags: j.tags, texto: j.text?.slice(0, 280) })),
    sono_e_recuperacao: wellness.map(wellnessForAI),
    tarefas_concluidas: tasks.filter((t) => t.completedDate && t.completedDate >= weekStartKey && t.completedDate <= end).map((t) => t.title),
    tarefas_pendentes_alta: tasks.filter((t) => t.status === 'pendente' && t.priority === 'alta').map((t) => t.title).slice(0, 15),
    paginas_lidas: readlogs.reduce((a, r) => a + r.pages, 0)
  };
  const r = await askAI<any>('week_review', ctx);
  return upsert('review', `review:week:${weekStartKey}`, {
    date: weekStartKey, scope: 'semana', text: String(r.texto ?? ''),
    highlights: Array.isArray(r.destaques) ? r.destaques.map(String).slice(0, 5) : [],
    focus: Array.isArray(r.foco) ? r.foco.map(String).slice(0, 3) : []
  });
}

/* ---------- Metas de calorias e macros ---------- */
export async function aiTargets() {
  const today = todayKey();
  const [settings, workouts, plans, tmpls, foods, wellness] = await Promise.all([
    get<'settings'>('settings'), byDateRange('workout', addDays(today, -28), today), all('plan'), all('mtemplate'), all('food'), byDateRange('wellness', addDays(today, -14), today)
  ]);
  const { totals } = await import('./nutrition');
  const foodPlan = planFor(plans, 'food', today);
  const dayKcal = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const ids = Object.values(foodPlan?.food?.[d] ?? {}).filter(Boolean) as string[];
    const items = ids.flatMap((id) => tmpls.find((t) => t.id === id)?.items ?? []);
    return items.length ? Math.round(totals(items, foods).n.kcal) : null;
  }).filter((x): x is number => x != null);
  const perWeek = (k: (w: any) => number) => Math.round(workouts.reduce((a, w) => a + k(w), 0) / 4);
  return askAI<any>('targets', {
    metas_atuais: settings?.targets ?? null,
    plano_da_nutricionista_kcal_por_dia: dayKcal.length ? dayKcal : null,
    treino_media_semanal_4_semanas: { sessoes: Math.round(workouts.length / 4), minutos: perWeek((w) => w.duration ?? 0), kcal_gastas_no_treino: perWeek((w) => w.metrics?.kcal ?? 0), tss: perWeek((w) => w.metrics?.tss ?? 0) },
    passos_media_dia: (() => { const v = wellness.map((w) => w.steps).filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })(),
    observacoes_dela: settings?.aiContext ?? ''
  });
}

/* ---------- Ficha de produto de pele ---------- */
const PGROUPS = ['limpeza', 'seruns', 'tratamentos', 'olhos', 'hidratacao', 'fps', 'corpo', 'cabelo'];
/** Identifica o produto pela foto (ou pelo nome) e devolve a ficha mapeada para o cadastro. */
export async function aiProductInfo(brand: string | undefined, name: string | undefined, images?: { mime: string; data: string }[]) {
  const r = await askAI<any>('product_read', { marca_digitada: brand || undefined, nome_digitado: name || undefined, tipos_possiveis: PGROUPS }, images?.length ? images : undefined);
  if (!r?.nome && !r?.para_que_serve) return { ok: false as const, note: String(r?.observacao || 'Não consegui identificar. Tente uma foto mais nítida da frente e do verso.') };
  const conf = ['alta', 'media', 'baixa'].includes(r.confianca) ? r.confianca : undefined;
  return {
    ok: true as const,
    note: String(r.observacao || ''),
    brand: r.marca ? String(r.marca) : undefined,
    name: r.nome ? String(r.nome) : undefined,
    group: PGROUPS.includes(r.tipo) ? (r.tipo as Product['group']) : undefined,
    period: ['am', 'pm', 'ambos'].includes(r.periodo) ? (r.periodo as Product['period']) : undefined,
    strongActive: typeof r.ativo_forte === 'boolean' ? (r.ativo_forte as boolean) : undefined,
    info: {
      purpose: r.para_que_serve || undefined, howToUse: r.modo_de_uso || undefined, indication: r.indicacao || undefined,
      actives: Array.isArray(r.ativos) && r.ativos.length ? r.ativos.map(String) : undefined, cautions: r.cuidados || undefined,
      fromLabel: !!r.lido_da_embalagem, confidence: conf
    } as import('../db/types').ProductInfo
  };
}

/* ---------- Foto do prato ---------- */
export interface PlateGuess { name: string; grams: number; household?: string; tacoId?: number; est?: { kcal: number; p: number; c: number; f: number }; confidence?: 'alta' | 'media' | 'baixa' }

/** A IA reconhece o que está no prato e estima o peso; os nutrientes vêm da TACO pelo id que ela escolher. */
export async function aiPlate(images: { mime: string; data: string }[], note: string, mealLabel: string) {
  const { loadTaco } = await import('./nutrition');
  const taco = await loadTaco();
  const r = await askAI<any>('plate_read', {
    refeicao: mealLabel, hora: new Date().toTimeString().slice(0, 5), o_que_ela_contou: note.trim() || undefined,
    taco: taco.map((t) => `${t.id}|${t.name}`).join('\n')
  }, images);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(String(v ?? '').replace(',', '.')) || 0);
  const items: PlateGuess[] = (Array.isArray(r?.itens) ? r.itens : []).map((i: any) => ({
    name: String(i.nome ?? '').trim(),
    grams: Math.max(0, Math.round(num(i.gramas))),
    household: i.medida_caseira ? String(i.medida_caseira) : undefined,
    tacoId: taco.some((t) => t.id === Number(i.taco_id)) ? Number(i.taco_id) : undefined,
    est: i.por_100g && num(i.por_100g.kcal) > 0 ? { kcal: num(i.por_100g.kcal), p: num(i.por_100g.p), c: num(i.por_100g.c), f: num(i.por_100g.g) } : undefined,
    confidence: ['alta', 'media', 'baixa'].includes(i.confianca) ? i.confianca : undefined
  })).filter((i: PlateGuess) => i.name && i.grams > 0);
  return { items, note: String(r?.observacao ?? ''), taco };
}
