// A especialista da Mente: acompanha humor, sono, remédios, café, treino e alimentação, ajuda a nomear o que ela sente
// e prepara a pauta das consultas. Não é psiquiatra nem terapeuta e nunca mexe em medicação.
import { all, byDateRange, get, getMeta, update } from '../db/db';
import { planFor, plannedTraining, plannedFood } from './rules';
import { totals } from './nutrition';
import { addDays, todayKey } from '../lib/dates';
import { askAI } from './ai';
import { chatMemory, undoLog, type SpecMsg } from './specchat';
import { loadMind } from './mindload';
import { observing } from './mind';

export async function askMind(text: string, history: SpecMsg[]): Promise<SpecMsg> {
  const today = todayKey();
  const [settings, mind, intakes, logs, changes, moods] = await Promise.all([
    get<'settings'>('settings'), loadMind(today, 42), all('intake'), byDateRange('intakelog', addDays(today, -13), today), all('medchange'), byDateRange('mood', addDays(today, -29), today)
  ]);
  const name = (i: { name: string; alias?: string }) => i.alias?.trim() || i.name;
  const detail = await todayDetail(today);
  const others = await otherSpecialists();
  const ctx = {
    hoje: today, hora_agora: new Date().toTimeString().slice(0, 5),
    fala_dela: text,
    ...(await chatMemory('mind', history, 'especialista')),
    escala_humor: '-3 muito para baixo, 0 estável (o normal dela), +3 muito acelerada; energia, irritabilidade, ansiedade e pensamento acelerado de 0 a 4',
    dias: mind.days.slice(-30).map((d) => ({
      data: d.date, humor_manha: d.moodAm, humor_noite: d.moodPm, energia: d.energy, irritabilidade: d.irritability, ansiedade: d.anxiety, pensamento_acelerado: d.racing,
      acordou: d.wake, eventos: d.tags.length ? d.tags : undefined, o_que_ela_escreveu: d.notes?.length ? d.notes : undefined, sono_h: d.sleepH, inicio_sono: d.sleepStart, acordou_as: d.wakeTime, vfc: d.hrv,
      cafeina_mg: d.caffeineMg || undefined, ultimo_cafe: d.lastCaffeine, treino_min: d.trainMin || undefined, treino_planejado_min: d.plannedMin || undefined,
      kcal: d.mealsLogged ? Math.round(d.kcal ?? 0) : undefined, proteina_g: d.mealsLogged ? Math.round(d.protein ?? 0) : undefined, peso: d.weight,
      doses: d.dosesDue ? `${d.dosesTaken} de ${d.dosesDue}` : undefined
    })),
    avisos_ativos: mind.alerts.map((a) => ({ nivel: a.level, titulo: a.title, texto: a.text })),
    meta_de_deitar: mind.bed,
    o_que_ela_toma: intakes.filter((i) => i.active).map((i) => ({
      nome: name(i), tipo: i.type, dose: i.alias ? undefined : i.dose, horarios: i.times, regra: i.rule,
      tomadas_14_dias: `${logs.filter((l) => l.itemId === i.id && l.status === 'tomei').length} de ${i.times.length * 14}`,
      efeitos_anotados: logs.filter((l) => l.itemId === i.id && l.sideEffect).map((l) => `${l.date}: ${l.sideEffect}`)
    })),
    mudancas_do_medico: changes.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((c) => ({ data: c.date, o_que: c.text })),
    em_observacao_pos_ajuste: observing(changes, today) ? true : undefined,
    checkins_registrados_30_dias: moods.filter((m) => m.period === 'pm').length,
    preferencias_dela: settings?.aiPrefs?.mind ?? '',
    // O app como está agora, com o que ela mudou nas outras áreas (treino pulado ou trocado, refeições, conversas).
    hoje_e_proximos_dias: detail,
    conversas_com_as_outras_especialistas: others,
    observacao_sobre_os_dados: 'treino_planejado_min já desconta o que ela pulou. Antes de afirmar algo sobre treino ou alimentação de hoje, confira hoje_e_proximos_dias e as conversas com as outras especialistas: elas mostram o estado atual do app.'
  };
  const r = await askAI<any>('mind_coach', ctx);
  const { undo, snap } = undoLog();
  const done: string[] = [];
  for (const a of Array.isArray(r?.acoes) ? r.acoes : []) {
    if (a?.tipo === 'guardar_preferencia') {
      const tx = String(a.texto ?? '').trim();
      const s = await get<'settings'>('settings');
      if (!tx || !s) continue;
      await snap('settings');
      const cur = s.aiPrefs?.mind?.trim();
      await update<'settings'>('settings', { aiPrefs: { ...(s.aiPrefs ?? {}), mind: cur ? `${cur}\n${tx}` : tx } });
      done.push(`Guardei: ${tx}`);
    }
  }
  const pauta = Array.isArray(r?.pauta_consulta) ? r.pauta_consulta.map(String).filter(Boolean).slice(0, 8) : [];
  return {
    from: 'ai', at: Date.now(),
    text: String(r?.mensagem ?? '').trim() || 'Não consegui formular uma resposta agora.',
    done: done.length ? done : undefined, undo: undo.length ? undo : undefined,
    suggestion: pauta.length ? pauta.map((p: string) => `• ${p}`).join('\n') : undefined
  };
}

/** Treinos (planejados, pulados, avulsos, feitos) e refeições de hoje e dos próximos 2 dias, como estão no app agora. */
async function todayDetail(today: string) {
  const to = addDays(today, 2);
  const [plans, tmpls, mods, extras, skips, workouts, meals, foods, mtmpls, settings, water] = await Promise.all([
    all('plan'), all('wtemplate'), all('modality'), byDateRange('extra', today, to), byDateRange('skip', today, to),
    byDateRange('workout', today, today), byDateRange('meal', today, today), all('food'), all('mtemplate'), get<'settings'>('settings'), byDateRange('water', today, today)
  ]);
  const mod = (id?: string) => mods.find((m) => m.id === id)?.name;
  const days = [];
  for (let d = today; d <= to; d = addDays(d, 1)) {
    const ids = plannedTraining(planFor(plans, 'training', d), d, extras);
    const treinos = ids.map((id) => tmpls.find((t) => t.id === id)).filter(Boolean).map((t) => ({
      nome: t!.name, modalidade: mod(t!.modalityId), minutos: t!.duration, intensidade: t!.intensity, horario: t!.time,
      pulado: skips.some((x) => x.domain === 'training' && x.date === d && x.ref === t!.id) || undefined,
      combinado_com_a_treinadora: extras.some((x) => x.date === d && (x.domain ?? 'training') === 'training' && x.ref === t!.id) || undefined
    }));
    const pf = plannedFood(planFor(plans, 'food', d), d, extras);
    days.push({
      data: d, treinos,
      refeicoes_planejadas: Object.entries(pf).filter(([, v]) => v).map(([k, v]) => ({ refeicao: settings?.mealTypes?.find((m) => m.id === k)?.label ?? k, modelo: mtmpls.find((x) => x.id === v)?.name, pulada: skips.some((x) => x.domain === 'food' && x.date === d && x.ref === k) || undefined }))
    });
  }
  const fname = (id: string) => foods.find((f) => f.id === id)?.name ?? '?';
  const eaten = meals.filter((m) => m.items.length);
  const tot = totals(eaten.flatMap((m) => m.items), foods).n;
  return {
    dias: days,
    treinos_feitos_hoje: workouts.map((w) => ({ modalidade: mod(w.modalityId), minutos: w.duration, horario: w.startTime ? new Date(w.startTime).toTimeString().slice(0, 5) : undefined, esforco: w.rpe, como_foi: w.feeling })),
    comeu_hoje: eaten.map((m) => ({ refeicao: settings?.mealTypes?.find((x) => x.id === m.mealType)?.label ?? m.mealType, registrada_as: new Date(m.createdAt).toTimeString().slice(0, 5), itens: m.items.map((i) => `${fname(i.foodId)} ${i.portion}`), kcal: Math.round(totals(m.items, foods).n.kcal), proteina_g: Math.round(totals(m.items, foods).n.p) })),
    total_hoje: { kcal: Math.round(tot.kcal), proteina_g: Math.round(tot.p) },
    meta_do_dia: settings?.targets ? { kcal: settings.targets.kcal, proteina_g: settings.targets.p } : undefined,
    agua_hoje_ml: water.reduce((a, w) => a + (w.ml ?? 0), 0) || undefined
  };
}

/** O que ela conversou e mudou com a treinadora, a dermatologista e a nutricionista (conversa aberta e as 3 últimas encerradas). */
async function otherSpecialists() {
  const pick = async (open: string, sess: string, who: string) => {
    const msgs = ((await getMeta<any[]>(open)) ?? []).slice(-6);
    const past = ((await getMeta<any[]>(sess)) ?? []).slice(0, 3);
    if (!msgs.length && !past.length) return undefined;
    return {
      especialista: who,
      conversa_aberta: msgs.map((m) => ({ quem: m.from === 'me' ? 'ela' : who, texto: String(m.text ?? '').slice(0, 400), mudou_no_app: m.undone ? undefined : m.done })),
      anteriores: past.map((c) => ({ data: new Date(c.start).toISOString().slice(0, 10), assunto: c.title, mudou_no_app: (c.done ?? []).slice(0, 6) }))
    };
  };
  return (await Promise.all([pick('coach-chat', 'coach-sessions', 'treinadora'), pick('food-chat', 'food-sessions', 'nutricionista'), pick('skin-chat', 'skin-sessions', 'dermatologista')])).filter(Boolean);
}
