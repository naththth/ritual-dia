// Pauta: newsletter diária com 5 notícias, montada no servidor (função ritual-news) às 06h30 ou no horário escolhido.
// Aqui ficam as lentes padrão, a leitura do registro e o que ela faz no app (ler, salvar, votar, virar tarefa, ajustes).
import { create, get, upsert } from '../db/db';
import type { NewsPrefs, Pauta, PautaArea, PautaCapa, PautaItem, PautaLente } from '../db/types';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { WORK_CAT } from './gtasks';

export const LENTES_PADRAO: PautaLente[] = [
  { id: 'ia', nome: 'IA e tecnologia B2B', nivel: 'sempre', capa: 'carreira' },
  { id: 'bancos', nome: 'Bancos e setor financeiro', nivel: 'sempre', capa: 'mercado' },
  { id: 'marketing', nome: 'Marketing e inteligência competitiva', nivel: 'sempre', capa: 'carreira' },
  { id: 'economia', nome: 'Economia e meu dinheiro', nivel: 'sempre', capa: 'dinheiro' },
  { id: 'saude', nome: 'Saúde, sono e performance', nivel: 'asvezes', capa: 'saude' },
  { id: 'mundo', nome: 'Brasil e mundo, só o essencial', nivel: 'asvezes', capa: 'mundo' }
];

export const PREFS_PADRAO: Omit<NewsPrefs, 'id' | 'kind' | 'createdAt' | 'updatedAt'> = {
  hora: '06:30', resumo: 'padrao', avisarRitual: true, lentes: LENTES_PADRAO,
  preferir: ['Valor Econômico', 'Folha de S.Paulo', 'MIT Technology Review', 'Febraban'],
  evitar: ['Fofoca e celebridades', 'Clickbait'], contexto: '', sinais: []
};

export function prefsOf(rec?: NewsPrefs | null) {
  return { ...PREFS_PADRAO, ...(rec ?? {}), lentes: rec?.lentes?.length ? rec.lentes : LENTES_PADRAO };
}

/** Rótulo curto da lente, para o selo da notícia. */
const CURTO: Record<string, string> = { ia: 'IA e tech', bancos: 'Bancos', marketing: 'Marketing', economia: 'Dinheiro', saude: 'Saúde', mundo: 'Mundo' };
export function lenteOf(id: string, lentes: PautaLente[]) {
  const l = lentes.find((x) => x.id === id) ?? LENTES_PADRAO.find((x) => x.id === id);
  return { id, nome: l?.nome ?? 'Geral', curto: CURTO[id] ?? l?.nome ?? 'Geral', capa: (l?.capa ?? 'vida') as PautaCapa };
}

/** Cores de cada capa: fundo claro, tinta escura e o tom forte para barras e anéis. */
export const CAPA_COR: Record<PautaCapa, { bg: string; ink: string; strong: string }> = {
  carreira: { bg: '#B3CEC6', ink: '#0D4D4F', strong: '#0D4D4F' },
  mercado: { bg: '#CFC1DF', ink: '#2B2456', strong: '#2B2456' },
  dinheiro: { bg: '#F4D78E', ink: '#4A2E06', strong: '#D2A432' },
  saude: { bg: '#CACC92', ink: '#33360F', strong: '#4F6B1E' },
  mundo: { bg: '#EBBFC2', ink: '#5A1E37', strong: '#5A1E37' },
  vida: { bg: '#F2B48C', ink: '#5A1E37', strong: '#C0582C' }
};
export const AREA: Record<PautaArea, { nome: string; capa: PautaCapa }> = {
  carreira: { nome: 'Carreira', capa: 'carreira' }, dinheiro: { nome: 'Dinheiro', capa: 'dinheiro' },
  saude: { nome: 'Saúde', capa: 'saude' }, vida: { nome: 'Vida', capa: 'mundo' }
};
export const NIVEL_TXT = { alto: 'impacto alto', medio: 'impacto médio', baixo: 'impacto baixo' } as const;
export const NIVEL_CURTO = { alto: 'alto', medio: 'médio', baixo: 'baixo' } as const;
export const NIVEL_PCT = { alto: 0.9, medio: 0.6, baixo: 0.27 } as const;

export const pautaId = (date: DateKey) => `pauta:${date}`;
export const itensOf = (p?: Pauta | null): PautaItem[] => (p?.status === 'pronta' ? p.itens ?? [] : []);
export const isRead = (p: Pauta | null | undefined, id: string) => !!p?.lidas?.includes(id);
export const readCount = (p?: Pauta | null) => itensOf(p).filter((i) => isRead(p, i.id)).length;
export const totalMinutes = (p?: Pauta | null) => itensOf(p).reduce((a, i) => a + (i.minutos ?? 4), 0);

/** Frase do card recolhido no Hoje: os assuntos do dia, em poucas palavras. */
export function teaser(p?: Pauta | null) {
  const t = itensOf(p).map((i) => i.titulo.replace(/[.:;].*$/, '').trim());
  return t.length ? t.join(' · ') : '';
}

async function patch(date: DateKey, fn: (p: Pauta) => Partial<Pauta>) {
  const p = await get<'pauta'>(pautaId(date));
  if (!p || p.status !== 'pronta') return;
  await upsert('pauta', p.id, fn(p));
}

export async function markRead(date: DateKey, itemId: string, on = true) {
  await patch(date, (p) => {
    const set = new Set(p.lidas ?? []);
    if (on) set.add(itemId); else set.delete(itemId);
    return { lidas: [...set] };
  });
}

export async function toggleSaved(date: DateKey, itemId: string) {
  await patch(date, (p) => {
    const set = new Set(p.salvas ?? []);
    if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
    return { salvas: [...set] };
  });
}

/** "Mais assim" / "Menos assim": fica na notícia e entra nos sinais que a editora lê nas próximas edições. Tocar de novo desfaz. */
export async function vote(date: DateKey, item: PautaItem, voto: 'mais' | 'menos') {
  const p = await get<'pauta'>(pautaId(date));
  if (!p) return;
  const atual = p.votos?.[item.id];
  const votos = { ...(p.votos ?? {}) };
  if (atual === voto) delete votos[item.id]; else votos[item.id] = voto;
  await upsert('pauta', p.id, { votos });
  const prefs = prefsOf(await get<'newsprefs'>('newsprefs'));
  const sinais = prefs.sinais.filter((x) => !(x.titulo === item.titulo && x.date === date));
  if (atual !== voto) sinais.push({ lente: item.lente, titulo: item.titulo, voto, date });
  await upsert('newsprefs', 'newsprefs', { ...prefs, sinais: sinais.slice(-60) });
}

/** "Pra levar adiante" vira tarefa da DBC (vai para o Google Tasks pela sincronização das tarefas). */
export async function itemToTask(date: DateKey, item: PautaItem) {
  const base = await get<'careerbase'>('careerbase');
  const t = await create('task', {
    title: item.acao ?? item.titulo, categoryId: base?.workCategoryId ?? WORK_CAT, priority: 'media', status: 'pendente',
    description: `${item.titulo}\n${item.url}`, tags: [], subtasks: [], history: [], plannedDate: null
  } as any);
  await patch(date, (p) => ({ tarefas: [...new Set([...(p.tarefas ?? []), item.id])] }));
  return t;
}

export async function savePrefs(next: Omit<NewsPrefs, 'id' | 'kind' | 'createdAt' | 'updatedAt'>) {
  await upsert('newsprefs', 'newsprefs', next);
}

/** Edições salvas, de todas as datas, da mais recente para a mais antiga. */
export function savedItems(pautas: Pauta[]) {
  return [...pautas].sort((a, b) => (a.date < b.date ? 1 : -1))
    .flatMap((p) => itensOf(p).filter((i) => p.salvas?.includes(i.id)).map((i) => ({ date: p.date, item: i })));
}

/** Fio da semana: o de domingo vale até o sábado seguinte. */
export function latestFio(pautas: Pauta[], today: DateKey = todayKey()) {
  return [...pautas].filter((p) => p.fio && p.date <= today && p.date > addDays(today, -7)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/** Pede ao servidor para montar a Pauta de hoje (force refaz com os ajustes novos) e acompanha até chegar. */
export async function requestPauta(force = false): Promise<string> {
  const { supabase, useSync, syncNow } = await import('../sync/sync');
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google para receber a Pauta.');
  await syncNow();
  const { data, error } = await supabase.functions.invoke('ritual-news', { body: { action: 'gerar', force } });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  void follow();
  return String(data?.status ?? 'gerando');
}

let following = false;
/** Enquanto a edição estiver sendo montada, sincroniza a cada 10 s (até 4 min). */
export async function follow() {
  if (following) return;
  following = true;
  try {
    const { syncNow } = await import('../sync/sync');
    for (let k = 0; k < 24; k++) {
      await new Promise((r) => setTimeout(r, 10000));
      await syncNow();
      const p = await get<'pauta'>(pautaId(todayKey()));
      if (p && p.status !== 'gerando') break;
    }
  } finally { following = false; }
}
