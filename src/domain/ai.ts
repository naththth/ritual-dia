// Ponte com o assistente (função privada no Supabase). O app manda só o contexto necessário.
import { supabase, useSync } from '../sync/sync';
import { trainingLoad } from './load';
import { all, byDateRange, create, get, upsert } from '../db/db';
import type { Plan, Product, WorkoutStep } from '../db/types';
import { addDays, isoWeekday, type DateKey } from '../lib/dates';
import { planFor, plannedSkin, plannedTraining } from './rules';

export type AITask = 'skin_plan' | 'training_plan' | 'food_plan' | 'day_brief' | 'training_review' | 'week_review';

export function aiAvailable() {
  return !!supabase && !!useSync.getState().session && navigator.onLine;
}

export async function askAI<T = any>(task: AITask, context: unknown): Promise<T> {
  if (!supabase) throw new Error('Sincronização não configurada.');
  if (!useSync.getState().session) throw new Error('Entre com Google para usar a IA.');
  if (!navigator.onLine) throw new Error('Sem conexão. A IA precisa de internet.');
  const { data, error } = await supabase.functions.invoke('ritual-ai', { body: { task, context } });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data.result as T;
}

const short = (p: Product) => ({ id: p.id, marca: p.brand, nome: p.name, tipo: p.group, categoria: p.originalCategory, ativo: !!p.active });

/* ---------- Pele ---------- */
export async function aiSkinPlan(today: DateKey) {
  const settings = await get<'settings'>('settings');
  const products = (await all('product')).filter((p) => p.status === 'em_uso' && p.area === 'rosto');
  const logs = await byDateRange('skin', addDays(today, -14), today);
  const ctx = {
    perfil_de_pele: settings?.skinProfile ?? [],
    observacoes_dela: settings?.aiContext ?? '',
    produtos: products.map(short),
    registros_recentes: logs.map((l) => ({ data: l.date, periodo: l.period, condicao: l.condition, sinais: l.signals, recuperacao: l.recovery }))
  };
  const r = await askAI<any>('skin_plan', ctx);
  const valid = new Set(products.map((p) => p.id));
  const clean = (ids: unknown) => (Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && valid.has(x)) : []);
  const period = (pp: any) => {
    const days: Record<number, { add: string[]; remove: string[] }> = {};
    for (let d = 1; d <= 7; d++) {
      const x = pp?.days?.[d] ?? pp?.days?.[String(d)];
      if (x) days[d] = { add: clean(x.add), remove: clean(x.remove) };
    }
    return { base: clean(pp?.base), days };
  };
  return {
    skin: { am: period(r.am), pm: period(r.pm), recovery: { am: clean(r.recovery?.am), pm: clean(r.recovery?.pm) } } as NonNullable<Plan['skin']>,
    resumo: String(r.resumo ?? ''),
    observacoes: String(r.observacoes ?? '')
  };
}

/* ---------- Treino ---------- */
export interface AITrainingResult {
  templates: { key: string; name: string; modality: string; duration: number; intensity: 'leve' | 'moderada' | 'intensa'; time?: string; steps?: WorkoutStep[]; muscles?: string[] }[];
  week: Record<string, string[]>;
  resumo: string;
}
export async function aiTrainingPlan(): Promise<AITrainingResult> {
  const settings = await get<'settings'>('settings');
  const mods = await all('modality');
  const tmpls = await all('wtemplate');
  return askAI<AITrainingResult>('training_plan', {
    ftp: settings?.ftp ?? null,
    observacoes_dela: settings?.aiContext ?? '',
    modalidades: mods.filter((m) => !m.archived).map((m) => m.name),
    treinos_modelo_existentes: tmpls.filter((t) => !t.archived).map((t) => ({ nome: t.name, duracao: t.duration }))
  });
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
  const settings = await get<'settings'>('settings');
  const foods = (await all('food')).filter((f) => !f.archived);
  const r = await askAI<any>('food_plan', {
    dieta: dietText.slice(0, 20000),
    restricoes: settings?.foodPrefs ?? [],
    refeicoes_do_dia: settings?.mealTypes ?? [],
    alimentos: foods.map((f) => ({ id: f.id, nome: f.name, tipo: f.type }))
  });
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
  const [tasks, plans, products, tmpls, mods, skinLogs, settings, workouts, journals] = await Promise.all([
    all('task'), all('plan'), all('product'), all('wtemplate'), all('modality'), byDateRange('skin', addDays(date, -7), date), get<'settings'>('settings'),
    byDateRange('workout', addDays(date, -120), date), byDateRange('journal', addDays(date, -3), date)
  ]);
  const pending = tasks.filter((t) => t.status === 'pendente');
  const skinPlan = planFor(plans, 'skin', date);
  const name = (id: string) => products.find((p) => p.id === id)?.name;
  const tr = plannedTraining(planFor(plans, 'training', date), date).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean);
  const ctx = {
    data: date,
    dia_da_semana: ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][isoWeekday(date)],
    observacoes_dela: settings?.aiContext ?? '',
    escolhidas_para_hoje: pending.filter((t) => t.plannedDate === date).map((t) => t.title),
    tarefas_pendentes: pending.slice(0, 60).map((t) => ({ id: t.id, titulo: t.title, prioridade: t.priority, categoria: t.categoryId.replace('cat:', ''), subcategoria: t.subcategory, observacao: t.description, proximo_passo: t.nextStep, data_compromisso: t.appointmentDate, escolhida_para: t.plannedDate })),
    pele_plano_manha: plannedSkin(skinPlan, date, 'am', products).map(name),
    pele_plano_noite: plannedSkin(skinPlan, date, 'pm', products).map(name),
    pele_registros_7_dias: skinLogs.map((l) => ({ data: l.date, periodo: l.period, condicao: l.condition, sinais: Object.keys(l.signals ?? {}) })),
    carga_de_treino: (() => { const l = trainingLoad(workouts, addDays(date, -120), date).slice(-1)[0]; return l ? { fitness: Math.round(l.ctl), fadiga: Math.round(l.atl), forma: Math.round(l.tsb) } : null; })(),
    treinos_ultimos_3_dias: workouts.filter((w) => w.date >= addDays(date, -3)).map((w) => ({ data: w.date, modalidade: mods.find((m) => m.id === w.modalityId)?.name, minutos: w.duration, tss: w.metrics?.tss, fc_media: w.metrics?.avgHr })),
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
  const [habits, hlogs, workouts, meals, foods, skin, journals, tasks, readlogs, water, settings] = await Promise.all([
    all('habit'), byDateRange('hlog', weekStartKey, end), byDateRange('workout', weekStartKey, end), byDateRange('meal', weekStartKey, end), all('food'),
    byDateRange('skin', weekStartKey, end), byDateRange('journal', weekStartKey, end), all('task'),
    byDateRange('readlog', weekStartKey, end), byDateRange('water', weekStartKey, end), get<'settings'>('settings')
  ]);
  const { totals } = await import('./nutrition');
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
  const ctx = {
    semana: `${weekStartKey} a ${end}`,
    observacoes_dela: settings?.aiContext ?? '',
    habitos: habits.filter((h) => !h.archived).map((h) => ({ nome: h.title, meta: `${h.target}x ${h.freq}`, feitos: new Set([...hlogs.filter((l) => l.habitId === h.id && l.done).map((l) => l.date), ...(h.modalityId ? workouts.filter((w) => w.modalityId === h.modalityId).map((w) => w.date) : [])]).size })),
    treinos: workouts.map((w) => ({ data: w.date, modalidade: w.modalityId.replace('mod:', ''), minutos: w.duration, do_plano: !!w.fromPlan, np: w.metrics?.np, tss: w.metrics?.tss, fc_media: w.metrics?.avgHr, kcal: w.metrics?.kcal })),
    alimentacao_por_dia: days.map((d) => { const its = meals.filter((m) => m.date === d).flatMap((m) => m.items); const t = totals(its, foods).n; return { data: d, refeicoes: meals.filter((m) => m.date === d && m.items.length).length, kcal: Math.round(t.kcal), proteina_g: Math.round(t.p), agua_ml: water.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0) }; }),
    pele: skin.map((s) => ({ data: s.date, periodo: s.period, condicao: s.condition, sinais: Object.keys(s.signals ?? {}), recuperacao: s.recovery })),
    diario: journals.map((j) => ({ data: j.date, energia: j.energy, humor: j.mood, sono: j.sleep, estresse: j.stress, tags: j.tags, texto: j.text?.slice(0, 280) })),
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
