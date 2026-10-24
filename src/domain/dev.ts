// Sessões de ajuste do app com o Claude: ela conta, na própria tela, o que quer mudar; ao finalizar, o Claude faz e publica.
import { all, get, update, upsert, uid } from '../db/db';
import { todayKey } from '../lib/dates';
import { shrinkImage } from '../lib/image';
import type { DevMessage, DevRequest } from '../db/types';

/** Nome da tela pela rota, para ela e para o Claude se situarem. */
const SCREENS: [RegExp, string][] = [
  [/^\/$/, 'Dia'], [/^\/calendario/, 'Calendário'], [/^\/listas/, 'Listas'], [/^\/evolucao/, 'Evolução'],
  [/^\/treino\/registrar/, 'Treino · registrar'], [/^\/treino\/plano/, 'Treino · plano'], [/^\/treino\/sessoes/, 'Treino · sessões'], [/^\/treino/, 'Treino'],
  [/^\/alimentacao\/refeicao/, 'Alimentação · refeição'], [/^\/alimentacao\/plano/, 'Alimentação · plano'], [/^\/alimentacao\/alimentos/, 'Alimentação · alimentos'], [/^\/alimentacao\/refeicoes/, 'Alimentação · refeições'], [/^\/alimentacao/, 'Alimentação'],
  [/^\/cuidados\/rotina/, 'Cuidados · rotina'], [/^\/cuidados\/produtos/, 'Cuidados · produtos'], [/^\/cuidados/, 'Cuidados'], [/^\/pele/, 'Pele'],
  [/^\/habitos/, 'Hábitos e metas'], [/^\/mais/, 'Mais'], [/^\/diario/, 'Diário'], [/^\/notas/, 'Notas'], [/^\/leitura/, 'Leitura'],
  [/^\/ajustes/, 'Ajustes'], [/^\/perfil/, 'Perfil'], [/^\/ciclo/, 'Ciclo'], [/^\/peso/, 'Peso'], [/^\/biblioteca/, 'Biblioteca'], [/^\/plano/, 'Plano'], [/^\/revisao/, 'Revisão de produtos']
];
export function screenName(route: string) {
  return SCREENS.find(([re]) => re.test(route))?.[1] ?? route;
}

/** O que está escrito na tela agora (sem as folhas abertas), resumido. */
export function screenSnapshot(): string {
  const root = document.getElementById('root');
  const text = (root?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
}

export const OPEN: DevRequest['status'][] = ['aberta', 'precisa_voce'];

/** A sessão em aberto (só uma por vez), se houver. */
export async function openDevRequest(): Promise<DevRequest | undefined> {
  return (await all('devreq')).filter((r) => r.status === 'aberta').sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function startDevRequest(route: string): Promise<DevRequest> {
  const id = uid('devreq');
  return upsert('devreq', id, { date: todayKey(), status: 'aberta', route, screen: screenName(route), snapshot: screenSnapshot(), messages: [] });
}

export async function addDevMessage(id: string, text: string, files: File[] = []) {
  const r = await get<'devreq'>(id);
  if (!r) throw new Error('Sessão não encontrada.');
  const images: string[] = [];
  for (const f of files.slice(0, 3)) {
    const { mime, data } = await shrinkImage(f, 1100);
    images.push(`data:${mime};base64,${data}`);
  }
  const msg: DevMessage = { from: 'ela', text: text.trim(), at: Date.now(), images: images.length ? images : undefined };
  // Resposta a uma pergunta do Claude reabre a sessão para ela finalizar de novo.
  return update<'devreq'>(id, { messages: [...r.messages, msg], status: r.status === 'precisa_voce' ? 'aberta' : r.status });
}

export async function finishDevRequest(id: string) {
  const r = await get<'devreq'>(id);
  if (!r?.messages.some((m) => m.from === 'ela')) throw new Error('Conte o que você quer ajustar antes de finalizar.');
  await update<'devreq'>(id, { status: 'finalizada', finishedAt: Date.now() });
  const { fireDevRequest } = await import('../sync/services');
  try {
    const out = await fireDevRequest(id);
    if (out?.url) await update<'devreq'>(id, { claudeUrl: out.url });
    return { fired: true };
  } catch (e: any) {
    // Fica na fila: a próxima finalização (ou o botão "Chamar o Claude") leva junto.
    return { fired: false, error: String(e?.message ?? e) };
  }
}

export async function discardDevRequest(id: string) {
  const { remove } = await import('../db/db');
  await remove(id);
}
