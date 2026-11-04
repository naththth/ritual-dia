// Área Mente: o que ela toma (remédios, vitaminas, suplementos), check-ins de humor, café e o motor de avisos
// que cruza tudo isso com sono, treino e alimentação. A lógica dos avisos é pura (testável); o carregamento fica em loadMindDays.
// Limites que valem para todo texto daqui: nunca sugerir mudar medicação; padrão preocupante = falar com o psiquiatra;
// descrever o que os dados mostram, sem diagnosticar fase.
import { addDays, diffDays, isoWeekday, toKey, todayKey, type DateKey } from '../lib/dates';
import type { Caffeine, Drink, Intake, IntakeLog, Meal, MedChange, MoodCheckin, SleepPlan, Wellness, Workout } from '../db/types';
import { effectiveHrv, effectiveSleep } from './wellness';

export const MOOD_LABEL: Record<string, string> = { '-3': 'muito para baixo', '-2': 'para baixo', '-1': 'um pouco para baixo', '0': 'estável', '1': 'um pouco acelerada', '2': 'acelerada', '3': 'muito acelerada' };
export const SLIDERS = [
  { key: 'energy', label: 'Energia' },
  { key: 'irritability', label: 'Irritabilidade' },
  { key: 'anxiety', label: 'Ansiedade' },
  { key: 'racing', label: 'Pensamento acelerado' }
] as const;
export const CONTEXT_TAGS = ['Dia pesado', 'Conflito', 'Viagem', 'Prova', 'Menstruação', 'Álcool', 'Gasto impulsivo', 'Pouca vontade de treinar', 'Dormi mal', 'Dia bom'];
export const WAKE_OPTIONS = [
  { id: 'descansada', label: 'Descansada' },
  { id: 'ok', label: 'Ok' },
  { id: 'cansada', label: 'Cansada' },
  { id: 'acelerada', label: 'Acelerada' }
] as const;

/** Estimativas de cafeína (mg) que ela pode editar. Cápsula de espresso fica em torno de 50 a 80 mg; coado de 200 mL, 80 a 120. */
export const DEFAULT_DRINKS: Drink[] = [
  { id: 'cap-3c', label: 'Espresso cápsula 3 Corações', mg: 65 },
  { id: 'cap-sams', label: "Espresso cápsula Sam's Club", mg: 65 },
  { id: 'coado', label: 'Coado no filtro, xícara 200 mL', mg: 100 },
  { id: 'coado-caneca', label: 'Coado no filtro, caneca 300 mL', mg: 150 }
];
export const CAFFEINE_DAY_LIMIT = 400;
/** Abaixo disto, na média dos dias registrados, o déficit vira aviso. */
export const DEFICIT_FLOOR = 900;
/** Horas antes de deitar em que o café já pesa no sono. */
export const CAFFEINE_CUTOFF_H = 8;

export const toMin = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1].slice(0, 2)) : undefined);
export const fromMin = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
export const hm = (d = new Date()) => d.toTimeString().slice(0, 5);
export const intakeLogId = (date: DateKey, itemId: string, slot: string) => `intakelog:${date}:${itemId}:${slot}`;
export const moodId = (date: DateKey, period: 'am' | 'pm') => `mood:${date}:${period}`;

/* ---------------- O que tomar ---------------- */
export interface Dose { item: Intake; slot: string; log?: IntakeLog }

/** Se o item tem tomada nesse dia: todo dia, nos dias da semana marcados ou a cada N dias desde uma aplicação conhecida. */
export function dueOn(i: Intake, date: DateKey) {
  if (i.freq === 'semanal') return (i.days ?? []).includes(isoWeekday(date));
  if (i.freq === 'intervalo') {
    if (!i.everyDays || !i.startDate) return false;
    const d = diffDays(i.startDate, date);
    return d >= 0 && d % i.everyDays === 0;
  }
  return true;
}

/** Próximo dia com tomada a partir de 'from' (inclusive), para itens a cada N dias. */
export function nextDue(i: Intake, from: DateKey = todayKey()): DateKey | undefined {
  for (let k = 0; k < 400; k++) { const d = addDays(from, k); if (dueOn(i, d)) return d; }
  return undefined;
}

/** Tomadas do dia, em ordem de horário, com o registro quando houver. */
export function dosesFor(items: Intake[], logs: IntakeLog[], date: DateKey): Dose[] {
  const out: Dose[] = [];
  // Só a partir do dia em que o item foi cadastrado: antes disso não há tomada para cobrar.
  for (const item of items.filter((i) => i.active && !i.deleted && toKey(new Date(i.createdAt)) <= date && dueOn(i, date))) {
    for (const slot of item.times) out.push({ item, slot, log: logs.find((l) => l.date === date && l.itemId === item.id && l.slot === slot && !l.deleted) });
  }
  return out.sort((a, b) => (toMin(a.slot) ?? 0) - (toMin(b.slot) ?? 0) || a.item.order - b.item.order);
}

/** Tomadas agrupadas por horário: "06:40 · Minoxidil, Fortalize". */
export function slotsFor(doses: Dose[]) {
  const map = new Map<string, Dose[]>();
  for (const d of doses) map.set(d.slot, [...(map.get(d.slot) ?? []), d]);
  return Array.from(map.entries()).map(([slot, ds]) => ({ slot, doses: ds }));
}

/** Dias que faltam para acabar, pelo estoque e pelas tomadas por dia. */
export function daysLeft(item: Intake): number | undefined {
  if (item.stock == null || !item.times.length) return undefined;
  const perWeek = (item.perDose ?? 1) * item.times.length * (item.freq === 'semanal' ? (item.days?.length ?? 0) : item.freq === 'intervalo' ? (item.everyDays ? 7 / item.everyDays : 0) : 7);
  if (!perWeek) return undefined;
  return Math.floor((item.stock / perWeek) * 7);
}

const WD = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
/** "todo dia às 06:40" ou "semanal, qua às 08:00". */
export function scheduleLabel(i: Intake) {
  const t = i.times.length ? `às ${i.times.join(', ')}` : 'sem horário';
  if (i.freq === 'semanal') return i.days?.length ? `semanal, ${i.days.map((d) => WD[d]).join(', ')} ${t}` : 'semanal, defina o dia';
  if (i.freq === 'intervalo') {
    if (!i.everyDays || !i.startDate) return 'a cada N dias, defina a data';
    const n = nextDue(i);
    return `a cada ${i.everyDays} dias ${t}${n ? `, próxima ${n.slice(8, 10)}/${n.slice(5, 7)}` : ''}`;
  }
  return `todo dia ${t}`;
}

export const typeLabel = (t: Intake['type']) => ({ medicamento: 'Medicamento', vitamina: 'Vitamina', suplemento: 'Suplemento' })[t];

/* ---------------- Sono em etapas ---------------- */
/** Noites dos últimos 7 em que ela deitou até 15 min depois da meta (pela hora de início do sono no relógio). */
export function bedStageProgress(sp: SleepPlan | undefined, wellness: Wellness[], today: DateKey) {
  if (!sp?.bedGoal) return undefined;
  const goal = toMin(sp.bedGoal)!;
  const nights = wellness.filter((w) => w.date > addDays(today, -7) && w.date <= today && w.sleepStart);
  // Início do sono depois da meia-noite conta como "tarde" (soma 24 h).
  const late = (t: string) => { const m = toMin(t)!; return m < 12 * 60 ? m + 1440 : m; };
  const onTime = nights.filter((w) => late(w.sleepStart!) <= goal + 15).length;
  const avgStart = nights.length ? fromMin(nights.reduce((a, w) => a + late(w.sleepStart!), 0) / nights.length) : undefined;
  const ready = !!sp.bedFinal && sp.bedFinal !== sp.bedGoal && onTime >= 5;
  return { goal: sp.bedGoal, final: sp.bedFinal, onTime, nights: nights.length, avgStart, ready };
}

/* ---------------- Dia consolidado ---------------- */
export interface MindDay {
  date: DateKey;
  sleepH?: number;
  sleepStart?: string;
  wakeTime?: string; // fim do sono no relógio
  hrv?: number;
  weight?: number;
  moodAm?: number;
  moodPm?: number;
  energy?: number; irritability?: number; anxiety?: number; racing?: number;
  wake?: string;
  tags: string[];
  /** O que ela escreveu nos check-ins (só a especialista da Mente lê). */
  notes?: string[];
  checkinPm: boolean;
  caffeineMg: number;
  lastCaffeine?: string;
  firstCaffeine?: string;
  breakfast: boolean;
  kcal?: number; protein?: number; mealsLogged: boolean;
  trainMin: number;
  plannedMin: number;
  hardWorkoutEnd?: string; // fim do treino forte do dia (HH:MM)
  proteinAfterTraining?: boolean;
  dosesDue: number; dosesTaken: number; dosesSkipped: number; dosesLate: number;
  medDosesMissed: number;
}

export interface MindInput {
  wellness: Wellness[];
  moods: MoodCheckin[];
  caffeine: Caffeine[];
  meals: (Meal & { kcal?: number; protein?: number })[];
  workouts: Workout[];
  plannedMin: Record<DateKey, number>;
  intakes: Intake[];
  intakeLogs: IntakeLog[];
}

/** Junta tudo por dia. Funções puras daqui para baixo: entram registros, saem dias e avisos. */
export function buildDays(input: MindInput, from: DateKey, to: DateKey, nowMin = 24 * 60): MindDay[] {
  const out: MindDay[] = [];
  const today = todayKey();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = input.wellness.find((x) => x.date === d);
    const am = input.moods.find((m) => m.date === d && m.period === 'am');
    const pm = input.moods.find((m) => m.date === d && m.period === 'pm');
    const caf = input.caffeine.filter((c) => c.date === d).sort((a, b) => a.time.localeCompare(b.time));
    const meals = input.meals.filter((m) => m.date === d && m.items.length);
    const wos = input.workouts.filter((x) => x.date === d);
    const doses = dosesFor(input.intakes, input.intakeLogs, d);
    // Tomada só conta como perdida depois de 2 h do horário (ou no dia que já passou).
    const past = (slot: string) => d < today || (d === today && (toMin(slot) ?? 0) + 120 <= nowMin);
    const hard = wos.filter((x) => (x.metrics?.tss ?? 0) >= 50 || (x.duration ?? 0) >= 45 || x.intensity === 'intensa')
      .map((x) => (x.startTime ? fromMin(toMin(new Date(x.startTime).toTimeString())! + (x.duration ?? 0)) : undefined)).filter(Boolean).sort().pop();
    const sleep = effectiveSleep(w);
    out.push({
      date: d,
      sleepH: sleep?.h, sleepStart: w?.sleepStart, wakeTime: w?.sleepEnd, hrv: effectiveHrv(w), weight: w?.weight,
      moodAm: am?.mood, moodPm: pm?.mood,
      energy: pm?.energy, irritability: pm?.irritability, anxiety: pm?.anxiety, racing: pm?.racing,
      wake: am?.wake, tags: [...(am?.tags ?? []), ...(pm?.tags ?? [])], notes: [am?.note, pm?.note].filter((x): x is string => !!x), checkinPm: !!pm && pm.mood != null,
      caffeineMg: caf.reduce((a, c) => a + c.mg, 0), lastCaffeine: caf[caf.length - 1]?.time, firstCaffeine: caf[0]?.time,
      breakfast: meals.some((m) => m.mealType === 'cafe'),
      kcal: meals.length ? meals.reduce((a, m) => a + (m.kcal ?? 0), 0) : undefined,
      protein: meals.length ? meals.reduce((a, m) => a + (m.protein ?? 0), 0) : undefined,
      mealsLogged: meals.length >= 2,
      trainMin: wos.reduce((a, x) => a + (x.duration ?? 0), 0),
      plannedMin: input.plannedMin[d] ?? 0,
      hardWorkoutEnd: hard,
      proteinAfterTraining: hard ? meals.some((m) => (m.protein ?? 0) >= 20 && hm(new Date(m.createdAt)) >= hard && (toMin(hm(new Date(m.createdAt)))! - toMin(hard)!) <= 120) : undefined,
      dosesDue: doses.length,
      dosesTaken: doses.filter((x) => x.log?.status === 'tomei').length,
      dosesSkipped: doses.filter((x) => x.log?.status === 'pulei').length,
      dosesLate: doses.filter((x) => x.log?.status === 'tomei' && x.log.takenAt && (toMin(x.log.takenAt)! - toMin(x.slot)!) > 120).length,
      medDosesMissed: doses.filter((x) => x.item.type === 'medicamento' && (x.log?.status === 'pulei' || (!x.log && past(x.slot)))).length
    });
  }
  return out;
}

/* ---------------- Avisos ---------------- */
export type AlertLevel = 'importante' | 'atencao';
export interface MindAlert {
  id: string;
  level: AlertLevel;
  area: 'humor' | 'emagrecimento' | 'cafe' | 'treino' | 'remedios';
  title: string;
  text: string;
  action?: { label: string; to: string };
}

export interface AlertCtx {
  today: DateKey;
  nowMin: number;
  bed?: string; // horário de deitar desta noite
  targets?: { kcal?: number; p?: number };
  medChanges: MedChange[];
  caffeineSensitive: boolean;
}

const avg = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
const h1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const CALL = 'Vale falar com o seu psiquiatra.';

/** Linha de base do humor: 4 semanas desde o primeiro check-in e ao menos 20 noites registradas. Antes disso, os avisos de humor ficam desligados. */
export function moodBaseline(days: MindDay[], today: DateKey) {
  const firstIdx = days.findIndex((d) => d.checkinPm);
  const first = firstIdx >= 0 ? days[firstIdx].date : undefined;
  const nights = days.filter((d) => d.checkinPm && d.date > addDays(today, -35)).length;
  const sinceFirst = first ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(first + 'T12:00:00').getTime()) / 86400000) : 0;
  return { ready: sinceFirst >= 28 && nights >= 20, nights, daysSinceFirst: sinceFirst, first };
}

/** Os avisos do dia, do mais importante para o menos. `days` em ordem, terminando hoje (ao menos 35 dias). */
export function computeAlerts(days: MindDay[], ctx: AlertCtx): MindAlert[] {
  const out: MindAlert[] = [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const day = (n: number) => byDate.get(addDays(ctx.today, -n)); // 0 = hoje
  const last = (n: number, from = 0) => Array.from({ length: n }, (_, i) => day(i + from)).filter((d): d is MindDay => !!d);
  const today = day(0);
  const base = moodBaseline(days, ctx.today);
  // Sono de referência: 28 noites antes dos últimos 3 dias.
  const sleepRef = avg(last(28, 3).map((d) => d.sleepH));
  const sleepRefN = last(28, 3).filter((d) => d.sleepH != null).length;
  // Humor da noite de ontem e de hoje: o de hoje só existe depois do check-in.
  const recent = (n: number) => last(n + 1).filter((d) => d.checkinPm).slice(0, n);

  /* --- Humor (só com a linha de base pronta) --- */
  if (base.ready) {
    const two = last(2);
    if (sleepRef != null && sleepRefN >= 14 && two.length === 2 && two.every((d) => d.sleepH != null && d.sleepH <= sleepRef - 1.5)
      && two.some((d) => d.wake === 'acelerada' || d.wake === 'descansada') && two.some((d) => (d.moodAm ?? d.moodPm ?? 0) >= 1)) {
      out.push({ id: 'sono-curto', level: 'importante', area: 'humor', title: 'Sono curto sem cansaço',
        text: `Duas noites com ${h1(two[0].sleepH!)} h e ${h1(two[1].sleepH!)} h, abaixo da sua média de ${h1(sleepRef)} h, acordando sem cansaço e com humor acima do habitual. Esse é um dos sinais precoces mais conhecidos de mudança de fase. ${CALL} Hoje, proteja o horário de deitar e deixe o café só para a manhã.` });
    }
    const r3 = recent(3);
    if ((r3.length === 3 && r3.every((d) => (d.moodPm ?? 0) >= 2 || (d.racing ?? 0) >= 3)) || last(3).some((d) => d.tags.includes('Gasto impulsivo'))) {
      out.push({ id: 'subida', level: 'importante', area: 'humor', title: 'Humor em subida',
        text: `${r3.length === 3 && r3.every((d) => (d.moodPm ?? 0) >= 2 || (d.racing ?? 0) >= 3) ? 'Três noites seguidas com humor em +2 ou mais, ou pensamento acelerado alto.' : 'Gasto impulsivo marcado nos últimos dias.'} O gráfico do painel mostra a sequência. ${CALL}`, action: { label: 'Ver o painel', to: '/mente' } });
    }
    const r5 = recent(5);
    const lowSleepy = recent(3).length === 3 && recent(3).every((d) => (d.moodPm ?? 0) <= -1) && sleepRef != null
      && avg(last(3).map((d) => d.sleepH)) != null && avg(last(3).map((d) => d.sleepH))! >= sleepRef + 1.5 && last(3).filter((d) => d.plannedMin > 0 && d.trainMin === 0).length >= 2;
    if ((r5.length === 5 && r5.every((d) => (d.moodPm ?? 0) <= -2)) || lowSleepy) {
      out.push({ id: 'descida', level: 'importante', area: 'humor', title: 'Humor para baixo há alguns dias',
        text: `${lowSleepy ? 'Humor abaixo de zero, sono mais longo que o habitual e treinos ficando de lado.' : 'Cinco noites seguidas com humor em −2 ou menos.'} Sem cobrança: hoje vale o mínimo que cabe, como luz do dia, uma caminhada curta e uma refeição simples. Vale falar com o seu psiquiatra ou terapeuta.` });
    }
    const r2 = recent(2);
    if (r2.length === 2 && r2.every((d) => (d.energy ?? 0) >= 3 && (d.moodPm ?? 0) <= -1 && ((d.irritability ?? 0) >= 3 || (d.anxiety ?? 0) >= 3))) {
      out.push({ id: 'misto', level: 'importante', area: 'humor', title: 'Energia alta com humor baixo',
        text: `Duas noites com energia alta, humor abaixo de zero e irritabilidade ou ansiedade alta. Essa combinação merece atenção. ${CALL}` });
    }
    // Café, sono e humor subindo juntos na semana.
    const wk = last(7), prev = last(7, 7);
    const cafNow = avg(wk.map((d) => d.caffeineMg)), cafPrev = avg(prev.map((d) => d.caffeineMg));
    const slNow = avg(wk.map((d) => d.sleepH)), slPrev = avg(prev.map((d) => d.sleepH));
    const mNow = avg(wk.map((d) => d.moodPm)), mPrev = avg(prev.map((d) => d.moodPm));
    if (cafNow != null && cafPrev != null && cafPrev > 0 && slNow != null && slPrev != null && mNow != null && mPrev != null
      && cafNow > cafPrev * 1.25 && slNow <= slPrev - 0.5 && mNow >= mPrev + 1) {
      out.push({ id: 'escalada', level: 'importante', area: 'cafe', title: 'Café sobe, sono cai, humor sobe',
        text: `Nesta semana o café subiu de ${Math.round(cafPrev)} para ${Math.round(cafNow)} mg por dia, o sono caiu de ${h1(slPrev)} para ${h1(slNow)} h e o humor médio subiu. Juntos, merecem atenção. ${CALL}` });
    }
    // Treino muito acima do plano com sono caindo e humor alto.
    const trained = wk.reduce((a, d) => a + d.trainMin, 0), planned = wk.reduce((a, d) => a + d.plannedMin, 0);
    if (planned > 0 && trained > planned * 1.3 && slNow != null && slPrev != null && slNow < slPrev && (mNow ?? 0) >= 1) {
      out.push({ id: 'volume', level: 'importante', area: 'treino', title: 'Treino bem acima do plano',
        text: `${trained} min de treino nos últimos 7 dias, para ${planned} planejados, com o sono caindo e o humor alto. Excesso de treino também pode ser sinal de subida. Vale voltar ao plano e observar.`, action: { label: 'Abrir Treino', to: '/treino' } });
    }
    const skips3 = last(3);
    if (skips3.length === 3 && skips3.every((d) => d.plannedMin > 0 && d.trainMin === 0) && recent(3).every((d) => (d.moodPm ?? 0) <= -1) && recent(3).length === 3) {
      out.push({ id: 'treinos-pulados', level: 'atencao', area: 'treino', title: 'Três dias sem treinar',
        text: 'Sem meta hoje: 20 minutos leves já ajudam o humor e o sono. Se não der, tudo bem também.', action: { label: 'Abrir Treino', to: '/treino' } });
    }
  }

  /* --- Sono e ritmo (usa o histórico do relógio) --- */
  const wakes = last(7).map((d) => toMin(d.wakeTime)).filter((x): x is number => x != null);
  if (wakes.length >= 5 && Math.max(...wakes) - Math.min(...wakes) > 120) {
    out.push({ id: 'ritmo', level: 'atencao', area: 'humor', title: 'Horário de acordar irregular',
      text: `Nesta semana você acordou entre ${fromMin(Math.min(...wakes))} e ${fromMin(Math.max(...wakes))}. Horários estáveis de acordar e deitar protegem o humor e o sono, inclusive no fim de semana.` });
  }
  if (today?.sleepH != null && today.sleepH < 6) {
    out.push({ id: 'noite-curta', level: 'atencao', area: 'emagrecimento', title: `Noite de ${h1(today.sleepH)} h`,
      text: 'Depois de noite curta, fome e vontade de doce tendem a subir. Deixe as refeições do dia definidas cedo e a proteína em todas elas.', action: { label: 'Abrir Alimentação', to: '/alimentacao' } });
  }
  const hrvRef = avg(last(28, 3).map((d) => d.hrv));
  const hrv3 = last(3).map((d) => d.hrv);
  if (hrvRef != null && hrv3.every((v) => v != null && v < hrvRef * 0.9) && (today?.moodPm ?? day(1)?.moodPm ?? 1) <= 0) {
    out.push({ id: 'recuperacao', level: 'atencao', area: 'treino', title: 'Recuperação baixa',
      text: `VFC abaixo da sua média (${Math.round(hrvRef)} ms) há 3 dias, com humor abaixo de zero. Peça à treinadora para trocar o treino de hoje por um regenerativo.`, action: { label: 'Falar com a treinadora', to: '/treino' } });
  }

  /* --- Remédios --- */
  const wk7 = last(7, 0);
  const missed = wk7.reduce((a, d) => a + d.medDosesMissed, 0);
  const lateN = wk7.reduce((a, d) => a + d.dosesLate, 0);
  if (missed >= 2) {
    out.push({ id: 'adesao', level: 'atencao', area: 'remedios', title: `${missed} doses de remédio sem registro na semana`,
      text: 'Se foi esquecimento, vale mudar o horário ou o lembrete para um momento fixo do dia, como uma refeição. Não compense dose esquecida por conta própria: a orientação de como fazer é do seu médico.', action: { label: 'Ver o que eu tomo', to: '/mente/tomo' } });
  } else if (lateN >= 3) {
    out.push({ id: 'atrasos', level: 'atencao', area: 'remedios', title: 'Doses tomadas com atraso',
      text: `${lateN} tomadas com mais de 2 h de atraso na semana. Talvez o horário cadastrado não combine com a sua rotina: vale ajustar.`, action: { label: 'Ver o que eu tomo', to: '/mente/tomo' } });
  }
  const alc = last(7).filter((d) => d.tags.includes('Álcool')).length;
  if (alc >= 2 || today?.tags.includes('Álcool')) {
    out.push({ id: 'alcool', level: 'atencao', area: 'remedios', title: alc >= 2 ? `Álcool em ${alc} dias da semana` : 'Álcool hoje',
      text: 'Álcool interfere no sono e no humor, e pode interagir com o que você toma. Vale confirmar com o seu médico o que é seguro para você.' });
  }

  /* --- Emagrecimento --- */
  const logged = last(7, 1).filter((d) => d.mealsLogged && d.kcal != null);
  const unstable = last(3).some((d) => (d.moodPm != null && Math.abs(d.moodPm) >= 2) || (d.sleepH != null && sleepRef != null && d.sleepH <= sleepRef - 1.5));
  // Déficit: ela escolheu a meta atual; o aviso só vale quando a média dos dias registrados fica abaixo de 900 kcal.
  if (logged.length >= 3) {
    const k = avg(logged.map((d) => d.kcal))!;
    if (k < DEFICIT_FLOOR) {
      out.push({ id: 'deficit', level: unstable ? 'importante' : 'atencao', area: 'emagrecimento', title: `Média de ${Math.round(k)} kcal por dia`,
        text: `Nos dias registrados, você comeu em média menos de ${DEFICIT_FLOOR} kcal. Abaixo disso, sono, humor e treino costumam pagar a conta, e a massa magra vai junto.${unstable ? ' Com humor ou sono instáveis, a prioridade agora é estabilidade, não velocidade.' : ''} Vale reforçar as refeições em volta do treino.`, action: { label: 'Falar com a nutricionista', to: '/alimentacao' } });
    }
  }
  if (ctx.targets?.p) {
    const trainDays = last(7, 1).filter((d) => d.trainMin > 0 && d.mealsLogged && d.protein != null);
    if (trainDays.length >= 2 && avg(trainDays.map((d) => d.protein))! < ctx.targets.p * 0.8) {
      out.push({ id: 'proteina', level: 'atencao', area: 'emagrecimento', title: 'Proteína baixa nos dias de treino',
        text: `Média de ${Math.round(avg(trainDays.map((d) => d.protein))!)} g nos dias de treino, para meta de ${ctx.targets.p} g. É a proteína que segura a massa magra no déficit.`, action: { label: 'Abrir Alimentação', to: '/alimentacao' } });
    }
  }
  const wAvg = (from: number) => avg(last(7, from).map((d) => d.weight));
  const w0 = wAvg(0), w1 = wAvg(7), w2 = wAvg(14);
  if (w0 && w1 && w2 && (w1 - w0) / w1 > 0.01 && (w2 - w1) / w2 > 0.01) {
    out.push({ id: 'perda-rapida', level: 'atencao', area: 'emagrecimento', title: 'Perda de peso rápida',
      text: `A média semanal caiu de ${h1(w2)} para ${h1(w0)} kg em 2 semanas, mais de 1% por semana. Ritmo assim costuma levar massa magra junto. Vale desacelerar um pouco e conversar com a nutricionista.` });
  }
  if (today?.hardWorkoutEnd && today.proteinAfterTraining === false && ctx.nowMin >= toMin(today.hardWorkoutEnd)! + 120) {
    out.push({ id: 'pos-treino', level: 'atencao', area: 'emagrecimento', title: 'Pós-treino sem proteína',
      text: `O treino forte terminou por volta de ${today.hardWorkoutEnd} e não há refeição com 20 g de proteína registrada nas 2 h seguintes. Se ainda não comeu, a próxima refeição pede proteína.`, action: { label: 'Registrar refeição', to: '/alimentacao' } });
  }

  /* --- Café --- */
  if (today && today.caffeineMg > CAFFEINE_DAY_LIMIT) {
    out.push({ id: 'cafe-excesso', level: 'atencao', area: 'cafe', title: `${today.caffeineMg} mg de cafeína hoje`,
      text: `Acima de ${CAFFEINE_DAY_LIMIT} mg, o limite de referência para adultos. Se bater vontade de outro, vá de descafeinado ou chá.` });
  }
  const cutoff = ctx.bed ? toMin(ctx.bed)! - CAFFEINE_CUTOFF_H * 60 : undefined;
  if (cutoff != null && today?.lastCaffeine && toMin(today.lastCaffeine)! > cutoff) {
    // Noites depois de café tarde contra as outras, nos últimos 28 dias.
    const pairs = last(28, 1).map((d) => ({ late: !!d.lastCaffeine && toMin(d.lastCaffeine)! > cutoff, next: byDate.get(addDays(d.date, 1))?.sleepH }));
    const lateS = avg(pairs.filter((p) => p.late).map((p) => p.next)), okS = avg(pairs.filter((p) => !p.late).map((p) => p.next));
    const n = pairs.filter((p) => p.late && p.next != null).length;
    out.push({ id: 'cafe-tarde', level: 'atencao', area: 'cafe', title: `Café às ${today.lastCaffeine}`,
      text: `Depois das ${fromMin(cutoff)} a cafeína ainda está alta na hora de deitar.${n >= 3 && lateS != null && okS != null ? ` Nas suas noites depois de café tarde, você dormiu em média ${h1(lateS)} h, contra ${h1(okS)} h nas outras.` : ''}` });
  }
  if (today?.firstCaffeine && !today.breakfast && ctx.nowMin >= 10 * 60 + 30 && toMin(today.firstCaffeine)! < 10 * 60) {
    out.push({ id: 'cafe-sem-comida', level: 'atencao', area: 'cafe', title: 'Café sem café da manhã',
      text: 'Café de estômago vazio aumenta a ansiedade e a fome mais tarde. Se ainda não comeu, vale algo com proteína agora.', action: { label: 'Registrar café da manhã', to: '/alimentacao/refeicao?m=cafe' } });
  }
  if (ctx.caffeineSensitive) {
    const a = avg(last(7).map((d) => d.caffeineMg)), b = avg(last(7, 7).map((d) => d.caffeineMg));
    if (a != null && b != null && Math.max(a, b) >= 50 && Math.abs(a - b) / Math.max(a, b) > 0.5) {
      out.push({ id: 'cafe-brusco', level: 'atencao', area: 'cafe', title: 'Consumo de café mudou muito',
        text: `De ${Math.round(b)} para ${Math.round(a)} mg por dia em uma semana. Você marcou um item como sensível à cafeína: o melhor é manter o consumo estável e conversar com o seu médico antes de mudanças grandes.` });
    }
  }

  // No máximo 1 importante e 2 de atenção por dia, para não virar ruído.
  const imp = out.filter((a) => a.level === 'importante').slice(0, 1);
  const att = out.filter((a) => a.level === 'atencao').slice(0, 2);
  return [...imp, ...att];
}

/** Mudança feita pelo médico nos últimos 14 dias: modo observação. */
export function observing(changes: MedChange[], today: DateKey) {
  return changes.filter((c) => !c.deleted && c.date > addDays(today, -14) && c.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Resumo do estado para as outras especialistas: só números e avisos, sem diário nem nomes de remédios. */
export function mindStateForAI(days: MindDay[], alerts: MindAlert[], changes: MedChange[], today: DateKey) {
  const last3 = days.filter((d) => d.date > addDays(today, -3));
  if (!last3.some((d) => d.moodPm != null || d.moodAm != null || d.caffeineMg) && !alerts.length) return undefined;
  return {
    ultimos_dias: last3.map((d) => ({ data: d.date, humor: d.moodPm ?? d.moodAm, energia: d.energy, sono_h: d.sleepH, cafeina_mg: d.caffeineMg || undefined })),
    avisos_ativos: alerts.map((a) => ({ nivel: a.level, assunto: a.title })),
    ajuste_recente_de_medicacao: observing(changes, today) ? true : undefined,
    escala_humor: '-3 muito para baixo, 0 estável, +3 muito acelerada'
  };
}

