// Periodização do treino: o esqueleto de cada semana sai daqui, em código auditável.
// A IA só preenche as sessões dentro dos alvos; fase, progressão, semanas leves e travas são decididas aqui.
import { addDays, isoWeekday, weekStart, type DateKey } from '../lib/dates';
import type { FrameSlot, MacroCycle, SlotKey, WeekSession, WeekSkeleton, Workout } from '../db/types';

export type Phase = WeekSkeleton['phase'];
export const PHASE_LABEL: Record<Phase, string> = { base: 'Base', construcao: 'Construção', especifico: 'Específico', polimento: 'Polimento' };
export const SLOT_LABEL: Record<SlotKey, string> = {
  run_main: 'Corrida principal', run_easy: 'Corrida leve', run_long: 'Corrida longa', bike: 'Pedal', bike_long: 'Pedal longo',
  strength: 'Musculação', lpo: 'LPO', yoga: 'Ioga', yoga_class: 'Aula de ioga'
};
export const SLOT_SPORT: Partial<Record<SlotKey, 'corrida' | 'ciclismo'>> = { run_main: 'corrida', run_easy: 'corrida', run_long: 'corrida', bike: 'ciclismo', bike_long: 'ciclismo' };
const TAPER_WEEKS = 2;

const daysBetween = (a: DateKey, b: DateKey) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.max(0, Math.min(1, f));

/** Segunda da semana do último desafio: o ciclo termina nela. */
export function macroWeeks(m: MacroCycle): number {
  const last = m.events.map((e) => e.date).sort().slice(-1)[0] ?? addDays(m.start, 7 * 12);
  return Math.floor(daysBetween(m.start, weekStart(last)) / 7) + 1;
}
export function weekIndex(m: MacroCycle, date: DateKey): number {
  return Math.floor(daysBetween(m.start, weekStart(date)) / 7) + 1;
}
export function weekStartOf(m: MacroCycle, index: number): DateKey {
  return addDays(m.start, (index - 1) * 7);
}

/** Fase de cada semana: as duas últimas são polimento; o resto, 40% base, 33% construção e o que sobra de específico. */
export function phaseOf(m: MacroCycle, index: number): Phase {
  const n = macroWeeks(m);
  if (index > n - TAPER_WEEKS) return 'polimento';
  const rest = n - TAPER_WEEKS;
  const base = Math.round(rest * 0.4);
  const build = Math.round(rest * 0.33);
  if (index <= base) return 'base';
  if (index <= base + build) return 'construcao';
  return 'especifico';
}

export function isDeload(m: MacroCycle, index: number): boolean {
  if (phaseOf(m, index) === 'polimento') return false;
  if (m.deloads?.length) return m.deloads.includes(weekStartOf(m, index));
  return index % 4 === 0;
}

/** Quantos degraus a progressão tem: uma subida por semana de carga até o polimento. */
export function levelsOf(m: MacroCycle): number {
  const n = macroWeeks(m);
  let k = 0;
  for (let i = 1; i <= n - TAPER_WEEKS; i++) if (!isDeload(m, i)) k++;
  return Math.max(1, k);
}

const FTP_TEST = 'Teste de FTP em rampa no MyWhoosh: aquece 10 min e faz o teste de rampa até não conseguir manter a cadência (a carga sobe a cada minuto). O FTP novo é cerca de 75% da melhor potência de 1 minuto; o MyWhoosh mostra o resultado no fim.';
/** Primeira semana da Construção e do Específico. */
export function ftpTestWeek(m: MacroCycle, index: number): boolean {
  const ph = phaseOf(m, index);
  return (ph === 'construcao' || ph === 'especifico') && index > 1 && phaseOf(m, index - 1) !== ph;
}
/** Zonas de FC da corrida a partir do limiar (Friel): Z1 abaixo de 85%, Z2 85-89%, Z3 90-94%, Z4 95-99%, Z5 100% ou mais. */
export function runZones(lthr: number): Record<string, string> {
  const p = (x: number) => Math.round(lthr * x);
  // Faixas contínuas: cada zona termina 1 bpm antes de a seguinte começar.
  return { Z1: `até ${p(0.85) - 1} bpm`, Z2: `${p(0.85)} a ${p(0.9) - 1} bpm`, Z3: `${p(0.9)} a ${p(0.95) - 1} bpm`, Z4: `${p(0.95)} a ${lthr - 1} bpm`, Z5: `${lthr} bpm ou mais` };
}
const RUN_TEST = 'Teste de 30 min: aquece até 10 min (o que couber no tempo da sessão) e corre 30 min no mais forte que consegue manter constante, sem caminhar se der; a volta à calma é caminhando. A FC média dos últimos 20 min vira o seu limiar e define as zonas.';

/** Intenção de cada sessão por fase. Texto que a IA recebe como ordem e que ela vê na proposta. */
function intent(key: SlotKey, phase: Phase, deload: boolean, firstTest: boolean): string {
  if (key === 'run_main' && firstTest) return RUN_TEST;
  if (deload) {
    if (SLOT_SPORT[key]) return 'Semana leve: tudo confortável, sem qualidade.';
  }
  const t: Partial<Record<SlotKey, Record<Phase, string>>> = {
    run_main: {
      base: 'Contínua em ritmo de conversa (Z2); caminhar quando a FC subir demais.',
      construcao: 'Qualidade: fartlek ou tiros longos em Z4, com recuperação trotando.',
      especifico: 'Ritmo de 10 km: blocos no ritmo da prova.',
      polimento: 'Curta, com poucos estímulos no ritmo de prova.'
    },
    run_easy: { base: 'Trote leve, Z1 a Z2.', construcao: 'Trote leve, Z2.', especifico: 'Trote leve, Z2.', polimento: 'Trote solto.' },
    run_long: {
      base: 'Longo leve; alternar corrida e caminhada se precisar, sem passar de Z2.',
      construcao: 'Longo contínuo em Z2.',
      especifico: 'Longo em Z2 com os últimos 10 a 15 min no ritmo de prova.',
      polimento: 'Longo encurtado, solto.'
    },
    bike: {
      base: 'Z2 com cadência (85 a 95 rpm) e 2 a 3 acelerações curtas.',
      construcao: 'Qualidade: sweet spot (88 a 94% do FTP) em blocos.',
      especifico: 'Blocos em Z3, no ritmo dos 50 km, e um bloco perto do limiar.',
      polimento: 'Curto, com ativações de 1 min.'
    },
    bike_long: {
      base: 'Longo em Z2 constante.',
      construcao: 'Longo em Z2 com 2 a 3 blocos em Z3.',
      especifico: 'Longo com metade em Z3, no ritmo dos 50 km.',
      polimento: 'Longo encurtado com blocos curtos em Z3.'
    }
  };
  return t[key]?.[phase] ?? '';
}

/** Minutos da sessão no nível atual da progressão. */
function minutesFor(m: MacroCycle, s: FrameSlot, f: number, phase: Phase, deload: boolean, taperStep: number, fixed?: number): number {
  const cap = s.minutes;
  const base = (() => {
    switch (s.key) {
      case 'run_long': return lerp(m.runLong[0], m.runLong[1], f);
      case 'bike_long': return lerp(m.bikeLong[0], m.bikeLong[1], f);
      case 'run_main': return lerp(30, 50, f);
      case 'run_easy': return lerp(20, 25, f);
      case 'bike': return lerp(45, 60, f);
      case 'yoga': return 20;
      default: return fixed ?? 45;
    }
  })();
  if (!SLOT_SPORT[s.key]) return Math.round(fixed ?? cap ?? base);
  let v = base;
  if (deload) v *= s.key.endsWith('_long') ? 0.75 : 0.8;
  if (phase === 'polimento') v *= taperStep === 1 ? 0.7 : 0.5;
  return Math.min(r5(v), cap ?? 999);
}

/**
 * Esqueleto da semana `index` no nível `level` da progressão (0 = começo).
 * Fixas (musculação, LPO, aula de ioga) ficam como estão; endurance sobe com o nível; desafios entram no dia deles.
 */
export function skeletonFor(m: MacroCycle, index: number, level: number, fixedMinutes: (templateId: string) => number | undefined = () => undefined): WeekSkeleton {
  const total = macroWeeks(m);
  const levels = levelsOf(m);
  const phase = phaseOf(m, index);
  const deload = isDeload(m, index);
  const f = levels > 1 ? level / (levels - 1) : 1;
  const start = weekStartOf(m, index);
  const taperStep = phase === 'polimento' ? index - (total - TAPER_WEEKS) : 0;
  const days: Record<string, WeekSession[]> = {};
  for (let d = 1; d <= 7; d++) {
    const date = addDays(start, d - 1);
    const evs = m.events.filter((e) => e.date === date);
    days[d] = (m.frame[String(d)] ?? []).map((s): WeekSession => {
      const sport = SLOT_SPORT[s.key];
      const ev = sport ? evs.find((e) => e.sport === sport) : undefined;
      if (ev) {
        return { key: s.key, minutes: ev.sport === 'corrida' ? m.runLong[1] : m.bikeLong[1], intent: `Desafio: ${ev.label}. Aquecimento curto, ritmo controlado no começo e o que sobrar no final.`, event: ev };
      }
      const fixed = s.templateId ? fixedMinutes(s.templateId) : undefined;
      // Semana 2: a corrida principal vira o teste de limiar (até lá, as zonas saem do esforço percebido).
      const firstTest = s.key === 'run_main' && index === 2;
      // O teste pede 10 min de aquecimento + 30 de teste + 5 de volta à calma.
      if (firstTest) return { key: s.key, minutes: Math.min(s.minutes ?? 45, 45), intent: intent(s.key, phase, deload, true), test: 'run_lthr' };
      // Reteste de FTP no pedal de dia útil na primeira semana da Construção e do Específico (watts recalibrados para a fase).
      if (s.key === 'bike' && !deload && ftpTestWeek(m, index)) return { key: s.key, minutes: Math.min(s.minutes ?? 45, 45), intent: FTP_TEST, test: 'ftp' };
      return { key: s.key, minutes: minutesFor(m, s, f, phase, deload, taperStep, fixed), intent: intent(s.key, phase, deload, false), templateId: s.templateId };
    });
    // Dia de desafio não tem musculação nem LPO: o corpo vai inteiro para a prova.
    if (evs.length) days[d] = days[d].filter((x) => x.key !== 'strength' && x.key !== 'lpo');
    // Desafio num dia sem sessão do esporte no esqueleto: entra mesmo assim.
    for (const ev of evs) if (!days[d].some((x) => x.event === ev)) {
      days[d].push({ key: ev.sport === 'corrida' ? 'run_long' : 'bike_long', minutes: ev.sport === 'corrida' ? m.runLong[1] : m.bikeLong[1], intent: `Desafio: ${ev.label}.`, event: ev });
    }
    // Na semana do desafio, o dia antes de um desafio fica sem endurance pesado.
    const tomorrow = addDays(date, 1);
    if (m.events.some((e) => e.date === tomorrow)) {
      days[d] = days[d]
        .filter((x) => x.key !== 'strength' || !!x.event) // véspera de desafio sem musculação
        .map((x) => (SLOT_SPORT[x.key] && !x.event ? { ...x, minutes: Math.min(x.minutes, 25), intent: 'Ativação curta e leve na véspera do desafio.' } : x));
    }
  }
  return { index, total, start, phase, deload, level, levels, days };
}

/** Minutos planejados por esporte no esqueleto. */
export function plannedBySport(sk: WeekSkeleton): { corrida: number; ciclismo: number } {
  const out = { corrida: 0, ciclismo: 0 };
  for (const ss of Object.values(sk.days)) for (const s of ss) { const sp = SLOT_SPORT[s.key]; if (sp) out[sp] += s.minutes; }
  return out;
}
export function doneBySport(ws: Workout[]): { corrida: number; ciclismo: number } {
  const out = { corrida: 0, ciclismo: 0 };
  for (const w of ws) {
    if (w.deleted) continue;
    if (w.modalityId === 'mod:corrida') out.corrida += w.duration ?? 0;
    else if (w.modalityId === 'mod:ciclismo') out.ciclismo += w.duration ?? 0;
  }
  return out;
}

export interface Signals { tsb?: number; hrvLow?: boolean }
/**
 * Nível da semana seguinte. Sobe um degrau quando a semana de carga anterior foi cumprida e o corpo deixa;
 * segura quando faltou treino, a fadiga está alta ou a VFC caiu; volta um degrau quando a semana quase não aconteceu.
 * Semana leve e polimento não sobem. Treino perdido nunca é compensado empilhando.
 */
export function nextLevel(
  m: MacroCycle, index: number,
  prev: { level: number; skeleton: WeekSkeleton } | undefined,
  done: { corrida: number; ciclismo: number } | undefined,
  sig: Signals
): { level: number; holds: string[] } {
  const levels = levelsOf(m);
  if (!prev) return { level: 0, holds: [] };
  const holds: string[] = [];
  let level = prev.level;
  const thisIsLoad = !isDeload(m, index) && phaseOf(m, index) !== 'polimento';
  const planned = plannedBySport(prev.skeleton);
  const plannedTotal = planned.corrida + planned.ciclismo;
  const doneTotal = done ? done.corrida + done.ciclismo : 0;
  const ratio = plannedTotal ? doneTotal / plannedTotal : 1;
  if (!prev.skeleton.deload && plannedTotal) {
    if (ratio < 0.3) { holds.push(`A semana passada fechou ${Math.round(ratio * 100)}% do endurance planejado: ${level > 0 ? 'voltei um degrau' : 'segurei no começo'} para retomar sem salto.`); level = Math.max(0, level - 1); }
    else if (ratio < 0.6) holds.push(`A semana passada fechou ${Math.round(ratio * 100)}% do endurance planejado: segurei o volume em vez de subir.`);
  }
  if (sig.tsb != null && sig.tsb < -25) holds.push(`Fadiga acumulada alta (forma ${Math.round(sig.tsb)}): sem subida nesta semana.`);
  if (sig.hrvLow) holds.push('VFC abaixo do seu normal nos últimos dias: sem subida nesta semana.');
  if (thisIsLoad && !holds.length) level = Math.min(levels - 1, level + 1);
  return { level, holds };
}

/** Dias que faltam para cada desafio, a partir de uma data. */
export function countdown(m: MacroCycle, from: DateKey): { label: string; days: number; date: DateKey }[] {
  return m.events.filter((e) => e.date >= from).map((e) => ({ label: e.label, days: daysBetween(from, e.date), date: e.date }));
}

/** Semana da periodização que deve ter proposta agora (ou nenhuma). */
export function weekToPropose(m: MacroCycle, today: DateKey, hour: number): DateKey | null {
  if (!m.active) return null;
  const total = macroWeeks(m);
  const ws = weekStart(today);
  const wd = isoWeekday(today);
  const next = addDays(ws, 7);
  const inRange = (d: DateKey) => d >= m.start && weekIndex(m, d) <= total;
  // Antes do ciclo começar: a primeira semana sai até 3 dias antes.
  if (today < m.start) return daysBetween(today, m.start) <= 3 ? m.start : null;
  // Domingo a partir do meio-dia: a semana seguinte.
  if (wd === 7 && hour >= 12 && inRange(next)) return next;
  // Começo de semana sem proposta (ela não abriu o app no domingo): a semana atual, até quarta.
  if (wd <= 3 && inRange(ws)) return ws;
  return null;
}

const PHASE_WHY: Record<Phase, string> = {
  base: 'Base: construir o motor aeróbico. Quase tudo leve, para o corpo aguentar mais volume nas próximas fases.',
  construcao: 'Construção: entra uma sessão de qualidade por esporte e os longos seguem crescendo.',
  especifico: 'Específico: treinar no ritmo dos desafios, com longos perto da distância.',
  polimento: 'Polimento: o volume cai e a intensidade fica, para você chegar inteira aos desafios.'
};

/** Como o app chegou nesta semana, em frases curtas: fase, degrau, longos (e quanto mudaram) e a próxima semana leve. */
export function explainWeek(m: MacroCycle, sk: WeekSkeleton, prev?: WeekSkeleton): string[] {
  const out = [PHASE_WHY[sk.phase]];
  if (sk.deload) out.push('Semana leve: o volume cai cerca de 25% para o corpo absorver o que foi feito. Sem qualidade.');
  else if (sk.phase !== 'polimento') out.push(`Degrau ${sk.level + 1} de ${sk.levels} da progressão: sobe um a cada semana cumprida.`);
  const long = (s: WeekSkeleton, key: SlotKey) => Object.values(s.days).flat().find((x) => x.key === key && !x.event)?.minutes;
  for (const [key, label] of [['run_long', 'Corrida longa'], ['bike_long', 'Pedal longo']] as const) {
    const now = long(sk, key);
    if (now == null) continue;
    const before = prev ? long(prev, key) : undefined;
    out.push(`${label}: ${now} min${before != null && before !== now ? ` (era ${before})` : ''}.`);
  }
  const nextDl = Array.from({ length: sk.total - sk.index }, (_, i) => sk.index + 1 + i).find((i) => isDeload(m, i));
  if (nextDl) out.push(`Próxima semana leve: ${weekStartOf(m, nextDl).slice(8, 10)}/${weekStartOf(m, nextDl).slice(5, 7)}.`);
  return out;
}
