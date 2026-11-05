// Rituais de manhã e de noite: perguntas que mudam com o dia, o que ela escreve e a leitura da IA.
// A manhã vale para o dia; a noite vale para o dia seguinte. As especialistas e a leitura do dia leem os dois.
import { all, byDate, get, upsert } from '../db/db';
import { addDays, isoWeekday, todayKey, weekStart, type DateKey } from '../lib/dates';
import type { Post, RitualDay, Settings } from '../db/types';

export type RP = 'am' | 'pm';
export const ritualId = (date: DateKey, p: RP) => `ritual:${date}:${p}`;

export async function saveRitual(date: DateKey, p: RP, patch: Partial<RitualDay>, step?: string) {
  const cur = await get<'ritual'>(ritualId(date, p));
  const seen = step ? Array.from(new Set([...(cur?.seen ?? []), step])) : cur?.seen ?? [];
  return upsert('ritual', ritualId(date, p), { date, period: p, ...patch, seen });
}

/* ---------- Perguntas ---------- */
// Nada de repetir o que as outras áreas já perguntam (o que comeu, que produto usou): aqui é direção e leitura.
const AM_Q = [
  'O que faria hoje valer a pena?',
  'Qual é a única coisa que não pode ficar para amanhã?',
  'Onde você quer pôr a sua melhor energia hoje?',
  'Que conversa ou decisão você está adiando?',
  'O que pode tirar você do eixo hoje, e como você responde se acontecer?',
  'Se o dia tivesse uma palavra, qual seria?',
  'O que você vai fazer hoje que a Nathalie de daqui a um ano agradece?'
];
const AM_Q_TIRED = ['Com a noite curta, o que você vai proteger hoje?', 'O que dá para tirar da agenda hoje sem custo?'];
const AM_Q_HIGH = ['Hoje a energia está alta: onde ela rende sem atropelar o sono?'];
const PM_Q = [
  'O que deu certo hoje, mesmo que pequeno?',
  'O que pesou hoje, e o que você faria diferente?',
  'O que você aprendeu hoje que vale guardar?',
  'Do que você se orgulha hoje?',
  'O que fica para amanhã, e o que você solta agora?',
  'Teve algum momento em que você se sentiu no seu melhor? Qual?',
  'O que drenou sua energia hoje?'
];
const PM_Q_LOW = ['O que tornaria amanhã um pouco mais leve?', 'Quem ou o que te ajudou hoje?'];

const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Pergunta do dia: muda todo dia, se adapta ao estado e "Outra pergunta" gira a lista. */
export function questionFor(p: RP, date: DateKey, ctx: { sleepH?: number; mood?: number; energy?: number }, shift = 0) {
  let pool = p === 'am' ? AM_Q : PM_Q;
  if (p === 'am' && ctx.sleepH != null && ctx.sleepH < 6.5) pool = [...AM_Q_TIRED, ...pool];
  else if (p === 'am' && (ctx.mood ?? 0) >= 2) pool = [...AM_Q_HIGH, ...pool];
  else if (p === 'pm' && ((ctx.mood ?? 0) <= -1 || (ctx.energy ?? 4) <= 1)) pool = [...PM_Q_LOW, ...pool];
  const base = pool === AM_Q || pool === PM_Q ? hash(date + p) % pool.length : 0;
  return pool[(base + shift) % pool.length];
}

/* ---------- Frase quando a IA não responde ---------- */
const FALLBACK_AM = [
  'Ritmo antes de intensidade. O dia se ganha nas primeiras escolhas.',
  'Não precisa ser um dia perfeito, só um dia bem conduzido.',
  'Uma coisa importante bem feita vale mais que dez pela metade.',
  'Constância é o que sobra quando a motivação vai embora. Use isso a seu favor.',
  'Escolha onde vai gastar energia antes que o dia escolha por você.'
];
const FALLBACK_PM = [
  'O dia acabou. O que não coube nele não é dívida, é agenda.',
  'Recuperar também é treino. Dormir no horário é a melhor sessão de hoje.',
  'Registrar já é metade do trabalho: amanhã você começa sabendo de onde parte.'
];
export const fallbackLine = (p: RP, date: DateKey) => (p === 'am' ? FALLBACK_AM : FALLBACK_PM)[hash(date) % (p === 'am' ? FALLBACK_AM : FALLBACK_PM).length];

/* ---------- Marca pessoal ---------- */
export function brandToday(settings: Settings | undefined, posts: Post[], date: DateKey) {
  const b = settings?.brand;
  const ws = weekStart(date);
  const live = posts.filter((x) => !x.deleted);
  const publishedWeek = live.filter((x) => x.status === 'publicado' && x.date && x.date >= ws && x.date <= addDays(ws, 6)).length;
  const scheduledToday = live.find((x) => x.status === 'agendado' && x.date === date);
  const overdue = live.filter((x) => x.status === 'agendado' && x.date && x.date < date);
  const next = live.filter((x) => x.status === 'rascunho' || x.status === 'ideia').sort((a, z) => (a.status === z.status ? a.createdAt - z.createdAt : a.status === 'rascunho' ? -1 : 1))[0];
  const configured = !!b && !b.off && (b.perWeek ?? 0) > 0;
  const isDay = configured && (b!.days ?? []).includes(isoWeekday(date));
  const behind = configured && publishedWeek < (b!.perWeek ?? 0);
  return { configured, off: !!b?.off, perWeek: b?.perWeek ?? 0, days: b?.days ?? [], publishedWeek, scheduledToday, overdue, next, isDay, behind, ideas: live.filter((x) => x.status === 'ideia' || x.status === 'rascunho').length };
}

/* ---------- Para a IA ---------- */
/** O que ela escreveu nos rituais e vale para o dia (manhã de hoje e noite de ontem). Vai junto para as especialistas. */
export async function ritualForAI(date: DateKey = todayKey()) {
  const [am, pm, prev] = await Promise.all([get<'ritual'>(ritualId(date, 'am')), get<'ritual'>(ritualId(date, 'pm')), get<'ritual'>(ritualId(addDays(date, -1), 'pm'))]);
  const tasks = am?.focus?.length ? (await all('task')).filter((t) => am.focus!.includes(t.id)).map((t) => t.title) : undefined;
  const pack = (r?: RitualDay) => r && (r.a?.trim() || r.trained || r.postIdea || tasks) ? { pergunta: r.a?.trim() ? r.q : undefined, resposta: r.a?.trim() || undefined, treinou: r.trained, para_amanha_da_ia: r.ai?.para_amanha } : undefined;
  const out = {
    ontem_a_noite: pack(prev),
    hoje_de_manha: am ? { ...pack(am), foco_do_dia: tasks } : undefined,
    hoje_a_noite: pack(pm)
  };
  if (!out.ontem_a_noite && !out.hoje_de_manha?.resposta && !out.hoje_de_manha?.foco_do_dia && !out.hoje_a_noite) return undefined;
  return { ...out, como_usar: 'Escrito por ela nos rituais. A manhã vale para o dia de hoje; a noite de ontem, para hoje. Leve em conta com naturalidade quando ajudar (ex.: o foco que ela escolheu, o que pesou ontem); não repita o texto de volta e não comente o que não tem relação com a pergunta.' };
}

export async function lastNight(date: DateKey) { return get<'ritual'>(ritualId(addDays(date, -1), 'pm')); }
export async function ritualsOn(date: DateKey) { return byDate('ritual', date); }
