// Conversa em sessões com as especialistas de Cuidados e de Alimentação, no mesmo molde da treinadora:
// a conversa do momento fica inteira; as encerradas guardam só o assunto e o que mudou no app.
import { db, getMeta, setMeta, restore } from '../db/db';
import type { AnyRecord } from '../db/types';
import type { RoutineChange } from './skinSteps';

export type ChatDomain = 'skin' | 'food';

/** Rotina que a dermatologista propõe; só vale depois que ela aprova. Ids reais dos produtos. */
export interface SkinProposal {
  kind: 'skin';
  scope: 'dia' | 'semana';
  title: string;
  changes: RoutineChange[];
  note?: string;
  status?: 'aprovado' | 'descartado';
}
/** Refeições de um dia que a nutricionista propõe no lugar do plano. */
export interface FoodProposalMeal { mealType: string; name: string; templateId?: string; items: { foodId: string; portion: string; grams?: number }[] }
export interface FoodProposal {
  kind: 'food';
  date: string;
  meals: FoodProposalMeal[];
  /** Alimentos que ainda não existem no catálogo: são criados no aprovo. */
  newFoods?: { name: string; type: string }[];
  note?: string;
  status?: 'aprovado' | 'descartado';
}
export type SpecProposal = SkinProposal | FoodProposal;

export interface SpecMsg {
  from: 'ai' | 'me';
  text: string;
  /** Miniaturas das fotos que ela mandou (data URL pequena), só para mostrar na conversa. */
  images?: string[];
  done?: string[];
  failed?: string[];
  suggestion?: string;
  undo?: { id: string; before?: AnyRecord }[];
  undone?: boolean;
  proposal?: SpecProposal;
  at: number;
}
export interface SpecSession { id: string; start: number; end: number; title: string; done: string[]; msgs: SpecMsg[] }

/** Sem mensagem há mais que isto, a conversa vira sessão encerrada e a próxima abertura começa do zero. */
export const SPEC_STALE_MS = 6 * 3600_000;
const KEY = (d: ChatDomain) => `${d}-chat`;
const SESS = (d: ChatDomain) => `${d}-sessions`;

export async function loadSpecChat(d: ChatDomain): Promise<SpecMsg[]> {
  return (await getMeta<SpecMsg[]>(KEY(d))) ?? [];
}
export async function saveSpecChat(d: ChatDomain, list: SpecMsg[]) {
  await setMeta(KEY(d), list.slice(-40));
}
export async function loadSpecSessions(d: ChatDomain): Promise<SpecSession[]> {
  return (await getMeta<SpecSession[]>(SESS(d))) ?? [];
}

export function summarizeSpec(msgs: SpecMsg[]): SpecSession {
  const first = msgs.find((m) => m.from === 'me')?.text.trim() || (msgs.some((m) => m.images?.length) ? 'Foto' : '');
  const done = msgs.flatMap((m) => (m.undone ? [] : m.done ?? []));
  const start = msgs[0]?.at ?? Date.now();
  return {
    id: `ss${start.toString(36)}`, start, end: msgs[msgs.length - 1]?.at ?? start,
    title: first.length > 70 ? `${first.slice(0, 68).trimEnd()}…` : first,
    done: Array.from(new Set(done)).slice(0, 12),
    // Sem as cópias para desfazer (só valem na conversa aberta) e sem as fotos, que pesam.
    msgs: msgs.map(({ undo, images, ...m }) => (images?.length ? { ...m, text: m.text || '(foto)' } : m))
  };
}

export async function archiveSpecChat(d: ChatDomain, msgs: SpecMsg[]) {
  if (msgs.some((m) => m.from === 'me')) {
    const list = await loadSpecSessions(d);
    await setMeta(SESS(d), [summarizeSpec(msgs), ...list].slice(0, 30));
  }
  await setMeta(KEY(d), []);
}

export async function openSpecChat(d: ChatDomain, now = Date.now()): Promise<SpecMsg[]> {
  const msgs = await loadSpecChat(d);
  const last = msgs[msgs.length - 1]?.at ?? 0;
  if (msgs.length && now - last > SPEC_STALE_MS) { await archiveSpecChat(d, msgs); return []; }
  return msgs;
}

/** O que vai para a IA sobre as conversas: a de agora (últimas 12 falas) e, das anteriores, o assunto e o que mudou. */
export async function chatMemory(d: ChatDomain, history: SpecMsg[], who: string) {
  const sessions = (await loadSpecSessions(d)).slice(0, 3);
  return {
    conversas_anteriores: sessions.map((c) => ({ data: new Date(c.start).toISOString().slice(0, 10), assunto: c.title, mudou_no_app: c.done.slice(0, 6) })),
    conversa: history.slice(-12).map((m) => ({ quem: m.from === 'me' ? 'ela' : who, texto: m.text, feito: m.done, com_foto: m.images?.length ? true : undefined }))
  };
}

/** Coleta o que muda, guardando o estado de antes para desfazer. */
export function undoLog() {
  const undo: { id: string; before?: AnyRecord }[] = [];
  const snap = async (id: string) => { if (!undo.some((u) => u.id === id)) undo.push({ id, before: (await db.records.get(id)) as AnyRecord | undefined }); };
  return { undo, snap };
}

export async function undoSpec(m: SpecMsg) {
  for (const u of [...(m.undo ?? [])].reverse()) await restore(u.before, u.id);
}
