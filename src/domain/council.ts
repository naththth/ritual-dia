// Conselho das especialistas: quando um dado de uma área pede mudança em outra, elas já chegam com a proposta pronta
// para ela aprovar. As regras são fixas e explicáveis (sem IA): o que muda só vale depois do aprovo.
import { all, byDateRange, get, upsert } from '../db/db';
import { addDays, isoWeekday, todayKey, WEEKDAY_SHORT, type DateKey } from '../lib/dates';
import type { WorkoutTemplate } from '../db/types';
import { planFor, plannedTraining } from './rules';
import { approveProposal, type CoachProposal } from './coach';
import type { MindAlert, MindDay } from './mind';

export type Who = 'treinadora' | 'nutricionista' | 'mente';
export interface CouncilItem {
  id: string;
  who: Who;
  title: string;
  text: string;
  /** O que acontece no aprovo. Sem isto, é só um recado com atalho. */
  approve?: { label: string; run: () => Promise<string> };
  link?: { label: string; to: string; ask?: { domain: 'training' | 'food' | 'mind'; text: string } };
}

const day = (d: DateKey) => `${WEEKDAY_SHORT[isoWeekday(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hard = (t?: WorkoutTemplate) => !!t && t.modalityId !== 'mod:descanso' && (t.intensity === 'intensa' || (t.intensity === 'moderada' && t.duration >= 45));

/** Sessão regenerativa no lugar de um treino forte: pedal leve quando era pedal, senão mobilidade. */
export function regenFor(t: WorkoutTemplate, date: DateKey): CoachProposal {
  if (t.modalityId === 'mod:ciclismo') {
    return { date, name: 'Pedal regenerativo', modalityId: 'mod:ciclismo', minutes: 30, intensity: 'leve', time: t.time, replaces: [t.id],
      steps: [{ label: 'Aquecimento', minutes: 8, pct: 50 }, { label: 'Z1 contínuo', minutes: 16, pct: 58 }, { label: 'Volta à calma', minutes: 6, pct: 45 }],
      note: 'Proposto pelo conselho: recuperação primeiro.' };
  }
  return { date, name: 'Mobilidade e alongamento', modalityId: 'mod:mobilidade', minutes: 20, intensity: 'leve', time: t.time, replaces: [t.id], note: 'Proposto pelo conselho: recuperação primeiro.' };
}

export async function buildCouncil(days: MindDay[], alerts: MindAlert[], today: DateKey = todayKey()): Promise<CouncilItem[]> {
  const out: CouncilItem[] = [];
  const [plans, tmpls, extras, skips, workouts] = await Promise.all([
    all('plan'), all('wtemplate'), byDateRange('extra', addDays(today, -2), addDays(today, 4)), byDateRange('skip', addDays(today, -2), addDays(today, 4)), byDateRange('workout', addDays(today, -2), addDays(today, 4))
  ]);
  const d0 = days.find((d) => d.date === today);
  const planned = (d: DateKey) => plannedTraining(planFor(plans, 'training', d), d, extras)
    .filter((id) => !skips.some((s) => s.domain === 'training' && s.date === d && s.ref === id))
    .map((id) => tmpls.find((t) => t.id === id)).filter((t): t is WorkoutTemplate => !!t);
  const doneToday = workouts.some((w) => w.date === today);

  // 1) Recuperação ou humor pedem um dia leve: a treinadora já traz o regenerativo.
  const recoveryAlert = alerts.find((a) => a.id === 'recuperacao' || (a.level === 'importante' && (a.area === 'humor' || a.area === 'cafe')));
  const shortNight = d0?.sleepH != null && d0.sleepH < 6;
  const lowMood = (d0?.moodAm ?? 0) <= -2;
  const why = recoveryAlert ? recoveryAlert.title.toLowerCase() : shortNight ? `noite de ${d0!.sleepH!.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : lowMood ? 'humor bem para baixo hoje cedo' : '';
  const heavy = !doneToday ? planned(today).find(hard) : undefined;
  if (why && heavy) {
    const p = regenFor(heavy, today);
    out.push({
      id: `council:regen:${today}:${heavy.id}`, who: 'treinadora', title: `${heavy.name} vira ${p.name.toLowerCase()}`,
      text: `Com ${why}, a treinadora sugere trocar a sessão forte de hoje por ${p.minutes} minutos leves. A carga volta quando o corpo e o sono voltarem.`,
      approve: { label: 'Trocar o treino', run: async () => { const r = await approveProposal(p); return r.done.join(' '); } }
    });
  }

  // 2) Treino forte pulado nos últimos 2 dias: remarcar num dia leve dos próximos 3.
  for (const s of skips.filter((x) => x.domain === 'training' && x.date < today && x.date >= addDays(today, -2))) {
    const t = tmpls.find((x) => x.id === s.ref);
    if (!hard(t) || t!.oneOff) continue;
    if (workouts.some((w) => w.date > s.date && w.templateId === t!.id)) continue;
    const target = [1, 2, 3].map((k) => addDays(today, k)).find((d) => {
      const list = planned(d);
      return !list.some((x) => x.id === t!.id) && list.reduce((a, x) => a + (x.modalityId === 'mod:descanso' ? 0 : x.duration), 0) <= 45 && !list.some(hard);
    });
    if (!target) continue;
    out.push({
      id: `council:move:${s.date}:${t!.id}`, who: 'treinadora', title: `Remarcar ${t!.name} para ${day(target)}?`,
      text: `Ficou de fora em ${day(s.date)}. ${day(target)} está leve no plano e comporta a sessão sem apertar a semana.`,
      approve: { label: `Pôr em ${WEEKDAY_SHORT[isoWeekday(target)]}`, run: async () => {
        await upsert('extra', `extra:${target}:training:${t!.id}`, { date: target, domain: 'training', ref: t!.id, by: 'treinadora' });
        const st = await get<'settings'>('settings');
        if (t!.steps?.length && st?.intervals?.connected) {
          try { const { syncNow } = await import('../sync/sync'); const { syncIntervalsNow } = await import('../sync/services'); await syncNow(); await syncIntervalsNow(4); } catch { /* segue sem o envio */ }
        }
        return `${t!.name} entrou em ${day(target)}.`;
      } }
    });
    break;
  }

  // 3) Dia instável: a nutricionista segura o déficit.
  const deficit = alerts.find((a) => a.id === 'deficit');
  const unstable = !!recoveryAlert || shortNight || lowMood || ((d0?.moodPm ?? 0) <= -2);
  if (unstable || deficit) {
    out.push({
      id: `council:food:${today}`, who: 'nutricionista', title: 'Hoje não é dia de apertar',
      text: deficit ? 'A média de calorias está baixa demais. Hoje, proteína em todas as refeições e um lanche a mais se a fome vier.' : 'Com sono ou humor fora do normal, a nutricionista segura o déficit hoje: proteína em todas as refeições, carboidrato no café e no almoço, e nada de pular refeição.',
      link: { label: 'Ajustar com a nutricionista', to: '/alimentacao', ask: { domain: 'food', text: 'Hoje estou com sono ou humor fora do normal. Ajusta as refeições de hoje para eu não ficar em déficit grande.' } }
    });
  }

  // 4) Treino depois das 20h com meta de deitar: a Mente protege a noite.
  const st = await get<'settings'>('settings');
  const bed = st?.reminders?.sleep?.bedGoal;
  const late = planned(today).find((t) => t.time && bed && t.time >= '20:00' && hard(t));
  if (late && !doneToday) {
    out.push({
      id: `council:late:${today}:${late.id}`, who: 'mente', title: `${late.name} às ${late.time} encosta na hora de deitar`,
      text: `Treino forte perto das ${bed} atrasa o sono. Se der, antecipe; se não, a treinadora pode deixar a sessão mais leve.`,
      link: { label: 'Falar com a treinadora', to: '/treino', ask: { domain: 'training', text: `Hoje tenho ${late.name} às ${late.time} e quero deitar às ${bed}. Dá para deixar mais leve ou mais curto?` } }
    });
  }
  return out;
}
