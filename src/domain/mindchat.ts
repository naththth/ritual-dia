// A especialista da Mente: acompanha humor, sono, remédios, café, treino e alimentação, ajuda a nomear o que ela sente
// e prepara a pauta das consultas. Não é psiquiatra nem terapeuta e nunca mexe em medicação.
import { all, byDateRange, get, update } from '../db/db';
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
  const ctx = {
    hoje: today, hora_agora: new Date().toTimeString().slice(0, 5),
    fala_dela: text,
    ...(await chatMemory('mind', history, 'especialista')),
    escala_humor: '-3 muito para baixo, 0 estável (o normal dela), +3 muito acelerada; energia, irritabilidade, ansiedade e pensamento acelerado de 0 a 4',
    dias: mind.days.slice(-30).map((d) => ({
      data: d.date, humor_manha: d.moodAm, humor_noite: d.moodPm, energia: d.energy, irritabilidade: d.irritability, ansiedade: d.anxiety, pensamento_acelerado: d.racing,
      acordou: d.wake, eventos: d.tags.length ? d.tags : undefined, sono_h: d.sleepH, inicio_sono: d.sleepStart, acordou_as: d.wakeTime, vfc: d.hrv,
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
    preferencias_dela: settings?.aiPrefs?.mind ?? ''
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
