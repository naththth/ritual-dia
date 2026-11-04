// Cuidado na hora: quando os check-ins ou os avisos mostram que ela não está bem, a especialista da Mente sugere
// uma respiração guiada, uma frase e músicas. Sem internet, fica uma respiração pronta.
import { get, getMeta, setMeta, update } from '../db/db';
import { todayKey, type DateKey } from '../lib/dates';
import { askAI } from './ai';
import type { MindAlert, MindDay } from './mind';

export interface BreathPhase { acao: string; segundos: number }
export interface Breath { nome: string; porque?: string; fases: BreathPhase[]; ciclos: number }
export interface Song { titulo: string; artista?: string; porque?: string }
export interface Care { leitura?: string; respiracao: Breath; frase?: string; musicas: Song[]; pequeno_passo?: string; offline?: boolean }

/** Respiração com efeito calmante bem documentado: expiração mais longa que a inspiração. */
export const FALLBACK: Care = {
  offline: true,
  leitura: 'Uma pausa curta ajuda a baixar o ritmo antes de qualquer decisão.',
  respiracao: { nome: 'Expiração longa', porque: 'Soltar o ar mais devagar do que puxa desacelera o coração.', ciclos: 6, fases: [{ acao: 'Inspire pelo nariz', segundos: 4 }, { acao: 'Solte devagar pela boca', segundos: 6 }] },
  musicas: []
};

/** Por que agora: o motivo vai para a IA e aparece em uma linha. Nada disso diagnostica; só decide quando oferecer. */
export function careSignal(day: MindDay | undefined, alerts: MindAlert[]): string | undefined {
  const imp = alerts.find((a) => a.level === 'importante' && (a.area === 'humor' || a.area === 'cafe'));
  if (imp) return imp.title;
  if (!day) return undefined;
  const mood = day.moodPm ?? day.moodAm;
  if (mood != null && mood <= -2) return 'humor bem para baixo hoje';
  if (mood != null && mood >= 2) return 'humor acelerado hoje';
  if ((day.anxiety ?? 0) >= 3) return 'ansiedade alta hoje';
  if ((day.irritability ?? 0) >= 3) return 'irritabilidade alta hoje';
  if ((day.racing ?? 0) >= 3) return 'pensamento acelerado hoje';
  if (mood != null && mood <= -1) return 'humor um pouco para baixo hoje';
  const hard = day.tags.filter((t) => ['Conflito', 'Dia pesado', 'Dormi mal'].includes(t));
  if (hard.length) return hard.join(', ').toLowerCase();
  return undefined;
}

const KEY = (d: DateKey) => `mind-care:${d}`;
export async function cachedCare(date: DateKey = todayKey()) {
  return getMeta<{ reason: string; care: Care; at: number }>(KEY(date));
}

/** Pede à especialista uma respiração, uma frase e músicas para o momento. */
export async function askCare(reason: string, day: MindDay | undefined, notes: string[], previous?: Care): Promise<Care> {
  const s = await get<'settings'>('settings');
  const fb = s?.mind?.careFeedback ?? [];
  const r = await askAI<any>('mind_care', {
    hoje: todayKey(), hora_agora: new Date().toTimeString().slice(0, 5), motivo: reason,
    humor: day?.moodPm ?? day?.moodAm, energia: day?.energy, ansiedade: day?.anxiety, irritabilidade: day?.irritability, pensamento_acelerado: day?.racing,
    sono_h: day?.sleepH, eventos: day?.tags, o_que_ela_escreveu_hoje: notes.length ? notes : undefined,
    gostou: fb.filter((f) => f.liked).slice(-12).map((f) => f.item),
    nao_gostou: fb.filter((f) => !f.liked).slice(-12).map((f) => f.item),
    sugestao_anterior: previous ? { respiracao: previous.respiracao.nome, musicas: previous.musicas.map((m) => m.titulo) } : undefined,
    preferencias_dela: s?.aiPrefs?.mind ?? ''
  });
  const fases = (Array.isArray(r?.respiracao?.fases) ? r.respiracao.fases : [])
    .map((f: any) => ({ acao: String(f?.acao ?? '').trim(), segundos: Math.min(12, Math.max(1, Math.round(Number(f?.segundos) || 0))) }))
    .filter((f: BreathPhase) => f.acao && f.segundos);
  const care: Care = {
    leitura: String(r?.leitura ?? '').trim() || undefined,
    respiracao: fases.length ? { nome: String(r.respiracao.nome ?? 'Respiração'), porque: r.respiracao.porque ? String(r.respiracao.porque) : undefined, fases, ciclos: Math.min(12, Math.max(3, Math.round(Number(r.respiracao.ciclos) || 6))) } : FALLBACK.respiracao,
    frase: String(r?.frase ?? '').trim() || undefined,
    musicas: (Array.isArray(r?.musicas) ? r.musicas : []).slice(0, 3).map((m: any) => ({ titulo: String(m?.titulo ?? '').trim(), artista: m?.artista ? String(m.artista) : undefined, porque: m?.porque ? String(m.porque) : undefined })).filter((m: Song) => m.titulo),
    pequeno_passo: String(r?.pequeno_passo ?? '').trim() || undefined
  };
  await setMeta(KEY(todayKey()), { reason, care, at: Date.now() });
  return care;
}

export async function careFeedback(item: string, liked: boolean) {
  const s = await get<'settings'>('settings');
  const prev = (s?.mind?.careFeedback ?? []).filter((f) => f.item !== item);
  await update<'settings'>('settings', { mind: { ...(s?.mind ?? {}), careFeedback: [...prev, { at: todayKey(), item, liked }].slice(-40) } });
}

/** Link de busca no Spotify para a música sugerida. */
export const songLink = (m: Song) => `https://open.spotify.com/search/${encodeURIComponent([m.titulo, m.artista].filter(Boolean).join(' '))}`;
