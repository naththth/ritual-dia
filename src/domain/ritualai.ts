// A leitura curta do ritual: de manhã, frase e foco para o dia; à noite, o fechamento e o que levar para amanhã.
import { askAI } from './ai';
import { loadMind } from './mindload';
import { fallbackLine, lastNight, ritualId, saveRitual, type RP } from './ritual';
import { get } from '../db/db';
import type { DateKey } from '../lib/dates';
import type { RitualDay } from '../db/types';

export interface RitualAgenda {
  treinos: { nome: string; horario?: string; minutos?: number; intensidade?: string; feito?: boolean; pulado?: boolean }[];
  tarefas: string[];
  foco?: string[];
  deitar?: string;
  acordar_amanha?: string;
  treinos_amanha?: { nome: string; horario?: string; minutos?: number }[];
  post?: string;
  metas?: { kcal?: number; proteina?: number };
}

export async function askRitual(date: DateKey, p: RP, agenda: RitualAgenda): Promise<RitualDay['ai']> {
  const r = await get<'ritual'>(ritualId(date, p));
  try {
    const m = await loadMind(date, 7);
    const day = m.days.find((d) => d.date === date);
    const prev = await lastNight(date);
    const ctx = {
      data: date,
      periodo: p === 'am' ? 'manha' : 'noite',
      trabalho_comeca: '08:30',
      hoje: day && {
        sono_h: day.sleepH, deitou: day.sleepStart, acordou_relogio: day.wakeTime, como_acordou: day.wake,
        humor_manha: day.moodAm, humor_noite: day.moodPm, energia: day.energy, ansiedade: day.anxiety, irritabilidade: day.irritability,
        eventos: day.tags.length ? day.tags : undefined, cafeina_mg: day.caffeineMg || undefined, ultimo_cafe: day.lastCaffeine,
        kcal: day.mealsLogged ? day.kcal : undefined, proteina_g: day.mealsLogged ? day.protein : undefined, refeicoes_registradas: day.mealsLogged,
        treino_feito_min: day.trainMin || undefined, doses: `${day.dosesTaken} de ${day.dosesDue}`
      },
      basico_da_manha: r?.basics,
      pergunta_do_ritual: r?.a?.trim() ? r.q : undefined,
      o_que_ela_escreveu_agora: r?.a?.trim() || undefined,
      ideia_de_post: r?.postIdea,
      treinou_hoje: r?.trained,
      fechamento_de_ontem: prev && (prev.a || prev.ai?.para_amanha) ? { pergunta: prev.q, resposta: prev.a, o_que_a_ia_sugeriu: prev.ai?.para_amanha } : undefined,
      agenda,
      avisos_ativos: m.alerts.map((a) => ({ nivel: a.level, assunto: a.title }))
    };
    const out = await askAI<{ frase?: string; foco?: string; atencao?: string; fechamento?: string; para_amanha?: string }>(p === 'am' ? 'ritual_am' : 'ritual_pm', ctx);
    const ai = { ...out, at: Date.now() };
    await saveRitual(date, p, { ai });
    return ai;
  } catch (e) {
    console.error(e);
    return { frase: fallbackLine(p, date), offline: true };
  }
}
