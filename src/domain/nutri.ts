// A nutricionista na área de Alimentação: ela conta o que comeu, o que vai mudar no dia, como está a fome,
// e a especialista responde olhando o todo e troca refeições do dia. Troca de refeição só vale depois do aprovo.
import { all, byDateRange, create, get, remove, update, upsert, uid } from '../db/db';
import { addDays, isoWeekday, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedFood, plannedTraining } from './rules';
import { portionText, totals } from './nutrition';
import { wellnessForAI } from './wellness';
import { askAI } from './ai';
import { chatMemory, undoLog, type FoodProposal, type FoodProposalMeal, type SpecMsg } from './specchat';
import type { MealItem } from '../db/types';

const DAY = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ddmm = (d: string) => `${DAY[isoWeekday(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hm = (t: number) => new Date(t).toTimeString().slice(0, 5);
const r0 = (n?: number) => (n == null ? undefined : Math.round(n));
const macros = (n: { kcal: number; p: number; c: number; f: number }) => ({ kcal: r0(n.kcal), proteina_g: r0(n.p), carbo_g: r0(n.c), gordura_g: r0(n.f) });

/** Porção vinda da IA: "150 g" vira gramas exatas; o resto (P, M, 1 un.) fica como texto. */
export function itemFrom(foodId: string, portion: unknown, grams: unknown): MealItem {
  const g = Number(grams);
  if (g > 0 && g < 3000) return { foodId, portion: `${Math.round(g)} g`, grams: Math.round(g) };
  const s = String(portion ?? '').trim() || 'M';
  const m = /^(\d+(?:[.,]\d+)?)\s*g$/i.exec(s);
  if (m) { const v = Math.round(Number(m[1].replace(',', '.'))); return { foodId, portion: `${v} g`, grams: v }; }
  return { foodId, portion: s };
}

export async function askNutri(text: string, history: SpecMsg[], images?: { mime: string; data: string }[]): Promise<SpecMsg> {
  const today = todayKey();
  const [settings, plans, foods, mtmpls, tmpls, mods] = await Promise.all([get<'settings'>('settings'), all('plan'), all('food'), all('mtemplate'), all('wtemplate'), all('modality')]);
  const [meals, skips, extras, workouts, water, wellness] = await Promise.all([
    byDateRange('meal', addDays(today, -6), addDays(today, 6)), byDateRange('skip', addDays(today, -6), addDays(today, 6)), byDateRange('extra', addDays(today, -6), addDays(today, 6)),
    byDateRange('workout', addDays(today, -6), today), byDateRange('water', today, today), byDateRange('wellness', addDays(today, -3), today)
  ]);
  const types = settings?.mealTypes ?? [];
  const label = (id: string) => types.find((m) => m.id === id)?.label ?? id;
  const fname = (id: string) => foods.find((f) => f.id === id)?.name ?? '?';
  const itemsText = (items: MealItem[]) => items.map((i) => `${fname(i.foodId)} (${portionText(foods.find((f) => f.id === i.foodId), i)})`);
  const modName = (id?: string) => mods.find((m) => m.id === id)?.name ?? '';
  const t = settings?.targets;
  const dayPlan = (d: DateKey) => {
    const planned = plannedFood(planFor(plans, 'food', d), d, extras);
    return types.map((mt) => {
      const tpl = planned[mt.id] ? mtmpls.find((x) => x.id === planned[mt.id]) : undefined;
      const meal = meals.find((m) => m.date === d && m.mealType === mt.id && m.items.length);
      return {
        refeicao: mt.id, nome: mt.label, horario: settings?.mealTimes?.[mt.id],
        planejado: tpl ? { modelo_id: tpl.id, nome: tpl.name, itens: itemsText(tpl.items), ...macros(totals(tpl.items, foods).n), trocado_pela_nutri: extras.some((e) => e.date === d && e.domain === 'food' && e.ref.startsWith(`${mt.id}:`)) || undefined } : null,
        pulada: skips.some((s) => s.date === d && s.domain === 'food' && s.ref === mt.id) || undefined,
        comeu: meal ? { itens: itemsText(meal.items), ...macros(totals(meal.items, foods).n), registrada_as: hm(meal.createdAt), como_foi: meal.feeling || undefined } : undefined
      };
    });
  };
  const planTot = (d: DateKey) => { const its = Object.values(plannedFood(planFor(plans, 'food', d), d, extras)).flatMap((id) => mtmpls.find((x) => x.id === id)?.items ?? []); return its.length ? totals(its, foods).n : undefined; };
  const pt = planTot(today);
  const ctx = {
    hoje: today, hora_agora: hm(Date.now()), dia_semana_hoje: isoWeekday(today),
    fala_dela: text, fotos_nesta_mensagem: images?.length || undefined,
    ...(await chatMemory('food', history, 'nutricionista')),
    meta_do_dia: { kcal: r0(t?.kcal ?? pt?.kcal), proteina_g: r0(t?.p ?? pt?.p), carbo_g: r0(t?.c ?? pt?.c), gordura_g: r0(t?.f ?? pt?.f), origem: t?.kcal ? 'metas dela' : pt ? 'plano alimentar' : undefined },
    total_comido_hoje: macros(totals(meals.filter((m) => m.date === today).flatMap((m) => m.items), foods).n),
    agua_hoje_ml: water.reduce((a, w) => a + (w.ml ?? 0), 0) || undefined,
    // Últimos 6 dias: o que comeu de fato. Hoje e os próximos 6: o plano como está (com trocas e pulos).
    dias_anteriores: Array.from({ length: 6 }, (_, i) => addDays(today, i - 6)).map((d) => ({ data: d, dia_semana: isoWeekday(d), refeicoes: dayPlan(d).filter((m) => m.comeu || m.pulada).map(({ refeicao, nome, comeu, pulada }) => ({ refeicao, nome, comeu, pulada })) })),
    proximos_dias: Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => ({
      data: d, dia_semana: isoWeekday(d), refeicoes: dayPlan(d),
      treinos: plannedTraining(planFor(plans, 'training', d), d, extras).map((id) => tmpls.find((x) => x.id === id)).filter(Boolean).map((x) => ({ nome: x!.name, modalidade: modName(x!.modalityId), minutos: x!.duration, intensidade: x!.intensity, horario: x!.time }))
    })),
    treinos_feitos: workouts.sort((a, b) => (a.startTime ?? a.date).localeCompare(b.startTime ?? b.date)).map((w) => ({ data: w.date, horario: w.startTime ? new Date(w.startTime).toTimeString().slice(0, 5) : undefined, modalidade: modName(w.modalityId), minutos: w.duration, kcal: w.metrics?.kcal, tss: w.metrics?.tss })),
    refeicoes_favoritas: mtmpls.filter((x) => !x.archived).map((x) => ({ modelo_id: x.id, nome: x.name, refeicao: x.mealType, itens: itemsText(x.items), ...macros(totals(x.items, foods).n) })),
    alimentos: foods.filter((f) => !f.archived).map((f) => ({ id: f.id, nome: f.name, tipo: f.type, por_100g: f.n ? { kcal: r0(f.n.kcal), p: r0(f.n.p), c: r0(f.n.c), g: r0(f.n.f) } : undefined, medidas: f.measures?.length ? f.measures.map((m) => `${m.label} = ${m.grams} g`) : undefined })),
    refeicoes_do_dia: types,
    restricoes: settings?.foodPrefs?.length ? settings.foodPrefs : undefined,
    preferencias_de_alimentacao: settings?.aiPrefs?.food ?? '',
    sono_e_recuperacao: wellness.sort((a, b) => a.date.localeCompare(b.date)).map(wellnessForAI)
  };
  const r = await askAI<any>('food_coach', ctx, images);

  const { undo, snap } = undoLog();
  const done: string[] = [];
  const failed: string[] = [];
  let proposal: FoodProposal | undefined;
  const validMt = (id: unknown) => types.some((m) => m.id === id);
  for (const a of Array.isArray(r?.acoes) ? r.acoes : []) {
    try {
      if (a?.tipo === 'guardar_preferencia') {
        const tx = String(a.texto ?? '').trim();
        const s = await get<'settings'>('settings');
        if (!tx || !s) continue;
        await snap('settings');
        const cur = s.aiPrefs?.food?.trim();
        await update<'settings'>('settings', { aiPrefs: { ...(s.aiPrefs ?? {}), food: cur ? `${cur}\n${tx}` : tx } });
        done.push(`Guardei para os próximos planos: ${tx.replace(/\.$/, '')}.`);
      } else if (a?.tipo === 'pular_refeicao') {
        const d = String(a.data ?? '') as DateKey;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !validMt(a.refeicao)) continue;
        const id = `skip:${d}:food:${a.refeicao}`;
        await snap(id);
        await upsert('skip', id, { date: d, domain: 'food', ref: a.refeicao });
        done.push(`${label(a.refeicao)} de ${ddmm(d)} ficou como "não hoje".`);
      } else if (a?.tipo === 'propor_refeicoes') {
        const d = String(a.data ?? '') as DateKey;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today || d > addDays(today, 13)) { failed.push('A proposta veio sem uma data válida.'); continue; }
        const newFoods = (Array.isArray(a.novos_alimentos) ? a.novos_alimentos : []).map((n: any) => ({ name: String(n?.nome ?? '').trim(), type: String(n?.tipo ?? 'Outros').trim() || 'Outros' })).filter((n: any) => n.name);
        const isNew = (id: string) => id.startsWith('novo:') && newFoods.some((n: any) => n.name.toLowerCase() === id.slice(5).trim().toLowerCase());
        const list: FoodProposalMeal[] = [];
        for (const m of Array.isArray(a.refeicoes) ? a.refeicoes : []) {
          if (!validMt(m?.refeicao)) continue;
          const tpl = m.modelo_id ? mtmpls.find((x) => x.id === m.modelo_id) : undefined;
          const items = tpl && !(Array.isArray(m.itens) && m.itens.length) ? tpl.items : (Array.isArray(m.itens) ? m.itens : [])
            .map((i: any) => ({ id: String(i?.alimento_id ?? ''), i }))
            .filter(({ id }: any) => foods.some((f) => f.id === id && !f.archived) || isNew(id))
            .map(({ id, i }: any) => itemFrom(id, i.porcao, i.gramas));
          if (!items.length) continue;
          list.push({ mealType: m.refeicao, name: String(m.nome ?? '').trim() || tpl?.name || label(m.refeicao), templateId: tpl && items === tpl.items ? tpl.id : undefined, items });
        }
        if (!list.length) { failed.push('A proposta veio sem refeições que eu consiga montar com os seus alimentos.'); continue; }
        proposal = { kind: 'food', date: d, meals: list, newFoods: newFoods.length ? newFoods : undefined, note: String(a.nota ?? '').trim() || undefined };
      }
    } catch (e: any) { failed.push(String(e?.message ?? e)); }
  }
  return {
    from: 'ai', at: Date.now(),
    text: String(r?.mensagem ?? '').trim() || (done.length || proposal ? 'Feito.' : 'Não entendi o que mudar. Pode contar de outro jeito?'),
    proposal, done: done.length ? done : undefined, failed: failed.length ? failed : undefined,
    suggestion: String(r?.sugestao_plano ?? '').trim() || undefined,
    undo: undo.length ? undo : undefined
  };
}

/** Aprovado por ela: cada refeição proposta entra no lugar da planejada daquele dia (o plano semanal não muda). */
export async function approveNutri(p: FoodProposal): Promise<{ undo: { id: string; before?: any }[]; done: string[] }> {
  const { undo, snap } = undoLog();
  const done: string[] = [];
  const settings = await get<'settings'>('settings');
  const label = (id: string) => settings?.mealTypes?.find((m) => m.id === id)?.label ?? id;
  const foods = await all('food');
  const created = new Map<string, string>();
  for (const n of p.newFoods ?? []) {
    const ex = foods.find((f) => !f.archived && f.name.toLowerCase() === n.name.toLowerCase());
    if (ex) { created.set(n.name.toLowerCase(), ex.id); continue; }
    const id = uid('food');
    undo.push({ id });
    await create('food', { id, name: n.name, type: n.type, portions: ['P', 'M', 'G'] });
    created.set(n.name.toLowerCase(), id);
  }
  const real = (id: string) => (id.startsWith('novo:') ? created.get(id.slice(5).trim().toLowerCase()) : id);
  for (const m of p.meals) {
    let tplId = m.templateId;
    if (!tplId) {
      const items = m.items.map((i) => ({ ...i, foodId: real(i.foodId)! })).filter((i) => i.foodId);
      tplId = uid('mtemplate');
      undo.push({ id: tplId });
      // Refeição de um dia só: guardada fora da lista de favoritas.
      await create('mtemplate', { id: tplId, name: m.name, mealType: m.mealType, items, archived: true });
    }
    const sk = `skip:${p.date}:food:${m.mealType}`;
    if (await get(sk)) { await snap(sk); await remove(sk); }
    const ex = `extra:${p.date}:food:${m.mealType}`;
    await snap(ex);
    await upsert('extra', ex, { date: p.date, domain: 'food', ref: `${m.mealType}:${tplId}`, by: 'nutri' });
    done.push(`${label(m.mealType)} de ${ddmm(p.date)}: ${m.name}.`);
  }
  return { undo, done };
}
