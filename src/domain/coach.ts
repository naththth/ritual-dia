// Conversa com a treinadora na aba Treino: ela conta o que aconteceu, a IA traduz em ações e o app aplica.
import { db, all, byDateRange, get, remove, restore, update, upsert, uid, getMeta, setMeta } from '../db/db';
import { addDays, isoWeekday, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedTraining } from './rules';
import { askAI } from './ai';
import type { AnyRecord, TrainingRule, Workout } from '../db/types';

export interface CoachMsg {
  from: 'ai' | 'me';
  text: string;
  /** O que foi feito no app, em frases curtas. */
  done?: string[];
  /** O que ela pediu e não deu para fazer. */
  failed?: string[];
  suggestion?: string;
  /** Registros como estavam antes, para desfazer. */
  undo?: { id: string; before?: AnyRecord }[];
  undone?: boolean;
  at: number;
}

const KEY = 'coach-chat';
const DAY = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export async function loadCoachChat(): Promise<CoachMsg[]> {
  return (await getMeta<CoachMsg[]>(KEY)) ?? [];
}
export async function saveCoachChat(list: CoachMsg[]) {
  await setMeta(KEY, list.slice(-40));
}

const hhmm = (iso?: string) => { if (!iso) return undefined; const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : d.toTimeString().slice(0, 5); };

async function context(text: string, history: CoachMsg[]) {
  const today = todayKey();
  const [mods, plans, tmpls, settings] = await Promise.all([all('modality'), all('plan'), all('wtemplate'), get<'settings'>('settings')]);
  const workouts = (await byDateRange('workout', addDays(today, -21), today)).sort((a, b) => (a.startTime ?? a.date).localeCompare(b.startTime ?? b.date));
  const skips = (await byDateRange('skip', addDays(today, -7), addDays(today, 7))).filter((s) => s.domain === 'training');
  const tp = planFor(plans, 'training', today);
  const tname = (id?: string) => tmpls.find((t) => t.id === id)?.name;
  return {
    hoje: today,
    dia_semana_hoje: isoWeekday(today),
    fala_dela: text,
    conversa: history.slice(-12).map((m) => ({ quem: m.from === 'me' ? 'ela' : 'treinadora', texto: m.text, feito: m.done })),
    modalidades: mods.filter((m) => !m.archived).map((m) => ({ id: m.id, nome: m.name })),
    treinos_recentes: workouts.map((w) => ({
      id: w.id, data: w.date, dia_semana: isoWeekday(w.date), horario: hhmm(w.startTime), nome: w.name ?? tname(w.templateId),
      modalidade_id: w.modalityId, origem: w.metrics?.source ?? 'registro manual', esporte_do_relogio: w.metrics?.sport,
      minutos: w.duration, intensidade: w.intensity, esforco: w.rpe, como_foi: w.feeling, reclassificado_de: w.reclassifiedFrom,
      metricas: w.metrics ? { tss: w.metrics.tss, np: w.metrics.np, potencia_media: w.metrics.avgPower, fc_media: w.metrics.avgHr, kcal: w.metrics.kcal, km: w.metrics.distanceKm } : undefined
    })),
    plano_da_semana: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dia: d, nome_dia: DAY[d], treinos: (tp?.training?.[d] ?? []).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean).map((t) => ({ template_id: t!.id, nome: t!.name, modalidade_id: t!.modalityId, horario: t!.time, minutos: t!.duration })) })),
    planejado_hoje: plannedTraining(tp, today).map((id) => ({ template_id: id, nome: tname(id) })),
    pulados: skips.map((s) => ({ data: s.date, template_id: s.ref, nome: tname(s.ref) })),
    regras_de_classificacao: (settings?.trainingRules ?? []).map((r) => ({ id: r.id, descricao: r.text, de_modalidade_id: r.fromModalityId, para_modalidade_id: r.toModalityId, dias_semana: r.weekdays, de: r.from, ate: r.to })),
    preferencias_de_treino: settings?.aiPrefs?.training ?? ''
  };
}

const HM = /^\d{2}:\d{2}$/;
const INT = ['leve', 'moderada', 'intensa'];

/** Manda a fala para a treinadora e aplica no app o que ela decidiu. */
export async function askCoach(text: string, history: CoachMsg[]): Promise<CoachMsg> {
  const ctx = await context(text, history);
  const r = await askAI<any>('training_coach', ctx);
  const mods = await all('modality');
  const modName = (id?: string) => mods.find((m) => m.id === id)?.name ?? id ?? '';
  const done: string[] = [];
  const failed: string[] = [];
  const undo: { id: string; before?: AnyRecord }[] = [];
  const snap = async (id: string) => { if (!undo.some((u) => u.id === id)) undo.push({ id, before: await db.records.get(id) }); };
  const validMod = (id?: string) => !!id && mods.some((m) => m.id === id);
  const label = (w: Workout) => `${modName(w.modalityId)} de ${DAY[isoWeekday(w.date)]} ${w.date.slice(8, 10)}/${w.date.slice(5, 7)}`;
  let rulesChanged = false;

  for (const a of Array.isArray(r?.acoes) ? r.acoes : []) {
    try {
      if (a?.tipo === 'corrigir_treino') {
        const w = await get<'workout'>(String(a.treino_id));
        if (!w) { failed.push('Não achei o treino citado.'); continue; }
        const patch: Partial<Workout> = {};
        const changed: string[] = [];
        if (validMod(a.modalidade_id) && a.modalidade_id !== w.modalityId) {
          patch.modalityId = a.modalidade_id;
          patch.reclassifiedFrom = w.reclassifiedFrom ?? w.modalityId;
          patch.reclassifiedBy = 'conversa';
          patch.classChecked = true;
          // Liga ao planejado do dia dessa modalidade, para o dia contar como feito.
          const plans = await all('plan');
          const tmpls = await all('wtemplate');
          const t = plannedTraining(planFor(plans, 'training', w.date), w.date).map((id) => tmpls.find((x) => x.id === id)).find((x) => x?.modalityId === a.modalidade_id);
          patch.templateId = t?.id; patch.fromPlan = !!t;
          changed.push(`agora é ${modName(a.modalidade_id).toLowerCase()}`);
        }
        if (typeof a.minutos === 'number' && a.minutos > 0 && a.minutos !== w.duration) { patch.duration = Math.round(a.minutos); changed.push(`${patch.duration} min`); }
        if (INT.includes(a.intensidade) && a.intensidade !== w.intensity) { patch.intensity = a.intensidade; changed.push(`intensidade ${a.intensidade}`); }
        if (typeof a.esforco === 'number' && a.esforco >= 1 && a.esforco <= 10) { patch.rpe = Math.round(a.esforco); changed.push(`esforço ${patch.rpe}`); }
        if (a.nota && String(a.nota).trim()) { patch.feeling = [w.feeling, String(a.nota).trim()].filter(Boolean).join('\n'); changed.push('anotação no treino'); }
        if (!changed.length) continue;
        patch.locked = Array.from(new Set([...(w.locked ?? []), ...Object.keys(patch).filter((k) => ['modalityId', 'duration', 'intensity', 'templateId', 'fromPlan'].includes(k))]));
        await snap(w.id);
        await update<'workout'>(w.id, patch);
        done.push(`${label(w)}: ${changed.join(', ')}.`);
      } else if (a?.tipo === 'excluir_treino') {
        const w = await get<'workout'>(String(a.treino_id));
        if (!w) continue;
        await snap(w.id);
        await remove(w.id);
        done.push(`Excluí ${label(w).replace(/^./, (c) => c.toLowerCase())}${a.motivo ? ` (${String(a.motivo).replace(/\.$/, '')})` : ''}.`);
      } else if (a?.tipo === 'criar_regra' || a?.tipo === 'remover_regra' || a?.tipo === 'guardar_preferencia') {
        await snap('settings');
        const s = await get<'settings'>('settings');
        if (!s) continue;
        if (a.tipo === 'criar_regra') {
          if (!validMod(a.de_modalidade_id) || !validMod(a.para_modalidade_id) || a.de_modalidade_id === a.para_modalidade_id) { failed.push('Não consegui montar a regra com as modalidades do app.'); continue; }
          const rule: TrainingRule = {
            id: uid('rule'), text: String(a.descricao ?? `${modName(a.de_modalidade_id)} é ${modName(a.para_modalidade_id)}`).trim(),
            fromModalityId: a.de_modalidade_id, toModalityId: a.para_modalidade_id,
            weekdays: Array.isArray(a.dias_semana) ? a.dias_semana.map(Number).filter((d: number) => d >= 1 && d <= 7) : undefined,
            from: HM.test(a.de ?? '') ? a.de : undefined, to: HM.test(a.ate ?? '') ? a.ate : undefined, createdAt: Date.now()
          };
          if (!rule.weekdays?.length) delete rule.weekdays;
          await update<'settings'>('settings', { trainingRules: [...(s.trainingRules ?? []), rule] });
          done.push(`Regra nova: ${rule.text}.`);
          rulesChanged = true;
        } else if (a.tipo === 'remover_regra') {
          const rule = (s.trainingRules ?? []).find((x) => x.id === a.regra_id);
          if (!rule) continue;
          await update<'settings'>('settings', { trainingRules: (s.trainingRules ?? []).filter((x) => x.id !== rule.id) });
          done.push(`Regra removida: ${rule.text}.`);
        } else {
          const t = String(a.texto ?? '').trim();
          if (!t) continue;
          const cur = s.aiPrefs?.training?.trim();
          await update<'settings'>('settings', { aiPrefs: { ...(s.aiPrefs ?? {}), training: cur ? `${cur}\n${t}` : t } });
          done.push(`Guardei para os próximos planos: ${t.replace(/\.$/, '')}.`);
        }
      } else if (a?.tipo === 'pular_planejado') {
        const date = String(a.data ?? '') as DateKey;
        const tpl = await get<'wtemplate'>(String(a.template_id));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !tpl) continue;
        const id = `skip:${date}:training:${tpl.id}`;
        await snap(id);
        await upsert('skip', id, { date, domain: 'training', ref: tpl.id });
        done.push(`${tpl.name} de ${DAY[isoWeekday(date)]} ficou como "não hoje".`);
      }
    } catch (e: any) { failed.push(String(e?.message ?? e)); }
  }

  // Regra nova vale também para o que já está registrado.
  if (rulesChanged) {
    const before = new Map((await byDateRange('workout', addDays(todayKey(), -90), todayKey())).map((w) => [w.id, w]));
    const { reconcileClasses } = await import('./classes');
    const n = await reconcileClasses(90);
    if (n) {
      for (const [id, w] of before) if (!undo.some((u) => u.id === id)) {
        const now = await db.records.get(id);
        if (now && (now.updatedAt !== w.updatedAt)) undo.push({ id, before: w as AnyRecord });
      }
      done.push(`Apliquei a ${n} ${n === 1 ? 'treino já registrado' : 'treinos já registrados'}.`);
    }
  }

  return {
    from: 'ai', at: Date.now(),
    text: String(r?.mensagem ?? '').trim() || (done.length ? 'Feito.' : 'Não entendi o que mudar. Pode contar de outro jeito?'),
    done: done.length ? done : undefined,
    failed: failed.length ? failed : undefined,
    suggestion: String(r?.sugestao_plano ?? '').trim() || undefined,
    undo: undo.length ? undo : undefined
  };
}

/** Volta os registros ao estado de antes da resposta. */
export async function undoCoach(m: CoachMsg) {
  for (const u of [...(m.undo ?? [])].reverse()) await restore(u.before, u.id);
}
