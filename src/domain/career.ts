// Carreira: trabalho atual, marca pessoal, conquistas, oportunidades e desenvolvimento.
// A especialista lê tudo junto, mais o estado dela (sono, humor e energia) para dosar o esforço da semana.
import { all, byDateRange, create, get, update } from '../db/db';
import { addDays, todayKey, weekStart, type DateKey } from '../lib/dates';
import { askAI } from './ai';
import { chatMemory, rollbackAction, undoLog, type SpecMsg } from './specchat';
import { loadMind } from './mindload';
import type { CareerBase, DevPick, PickBook, Task } from '../db/types';

export const CAREER_ID = 'careerbase';
export const WORK_FALLBACK = 'Trabalho';

/** Tarefas do trabalho: a categoria marcada na base da carreira. */
export const isWork = (t: Task, base?: CareerBase | null) => !!base?.workCategoryId && t.categoryId === base.workCategoryId;

export const OPP_STAGE: Record<string, string> = { mapeada: 'Mapeada', conversa: 'Em conversa', processo: 'Em processo', proposta: 'Proposta', encerrada: 'Encerrada' };
export const OPP_TYPE: Record<string, string> = { vaga: 'Vaga', contato: 'Contato', parceria: 'Parceria', convite: 'Convite' };
export const DEV_TYPE: Record<string, string> = { meta: 'Meta', curso: 'Curso', leitura: 'Leitura', evento: 'Evento', competencia: 'Competência' };

export async function careerContext(today: DateKey = todayKey()) {
  const [base, tasks, posts, wins, opps, devs, mind] = await Promise.all([
    get<'careerbase'>(CAREER_ID), all('task'), all('post'), all('win'), all('opp'), all('devitem'), loadMind(today, 14)
  ]);
  const ws = weekStart(today);
  const work = tasks.filter((t) => isWork(t, base));
  const last14 = mind.days.slice(-14);
  const avg = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined; };
  return {
    hoje: today,
    base_da_carreira: base && { empresa_atual: base.workName, cargo: base.role, posicionamento: base.posicionamento, publico: base.publico, pilares: base.pilares, tom_de_voz: base.tom, evitar: base.evitar, bio: base.bio, assinatura: base.assinatura, onde_quer_chegar: base.objetivo },
    trabalho: {
      pendentes: work.filter((t) => t.status === 'pendente').slice(0, 40).map((t) => ({ titulo: t.title, prioridade: t.priority, para: t.plannedDate ?? t.appointmentDate, proximo_passo: t.nextStep })),
      concluidas_14_dias: work.filter((t) => t.completedDate && t.completedDate >= addDays(today, -13)).map((t) => ({ titulo: t.title, em: t.completedDate }))
    },
    linkedin: {
      ritmo: undefined as unknown,
      publicados_na_semana: posts.filter((p) => p.status === 'publicado' && p.date && p.date >= ws).length,
      pautas: posts.filter((p) => p.status !== 'publicado').map((p) => ({ titulo: p.title, status: p.status, data: p.date, nota: p.note })),
      ultimos_publicados: posts.filter((p) => p.status === 'publicado').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 8).map((p) => ({ titulo: p.title, data: p.date }))
    },
    conquistas: wins.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((w) => ({ data: w.date, o_que: w.title, impacto: w.impact, onde: w.where })),
    oportunidades: opps.filter((o) => o.stage !== 'encerrada').map((o) => ({ o_que: o.title, onde: o.org, tipo: o.type, etapa: o.stage, proximo_passo: o.next, ate: o.nextDate })),
    desenvolvimento: devs.filter((d) => d.status !== 'feito').map((d) => ({ o_que: d.title, tipo: d.type, status: d.status, ate: d.due })),
    estado_ultimos_14_dias: { sono_medio_h: avg(last14.map((d) => d.sleepH)), humor_medio: avg(last14.map((d) => d.moodPm ?? d.moodAm)), energia_media: avg(last14.map((d) => d.energy)) }
  };
}

export async function askCareer(text: string, history: SpecMsg[]): Promise<SpecMsg> {
  const settings = await get<'settings'>('settings');
  const ctx: any = {
    ...(await careerContext()),
    fala_dela: text,
    ...(await chatMemory('career', history, 'especialista')),
    preferencias_dela: settings?.aiPrefs?.career ?? ''
  };
  ctx.linkedin.ritmo = settings?.brand && !settings.brand.off ? { posts_por_semana: settings.brand.perWeek, dias: settings.brand.days } : undefined;
  const r = await askAI<any>('career_coach', ctx);
  const { undo, snap } = undoLog();
  const done: string[] = [];
  const base = await get<'careerbase'>(CAREER_ID);
  const failed: string[] = [];
  for (const a of Array.isArray(r?.acoes) ? r.acoes : []) {
    const tx = String(a?.texto ?? a?.titulo ?? '').trim();
    if (!tx) continue;
    const mark = undo.length;
    try {
      if (a.tipo === 'guardar_preferencia') {
        const s = await get<'settings'>('settings');
        if (!s) continue;
        await snap('settings');
        const cur = s.aiPrefs?.career?.trim();
        await update<'settings'>('settings', { aiPrefs: { ...(s.aiPrefs ?? {}), career: cur ? `${cur}\n${tx}` : tx } as any });
        done.push(`Guardei: ${tx}`);
      } else if (a.tipo === 'nova_pauta') {
        const p = await create('post', { title: tx, note: a.nota ? String(a.nota) : undefined, status: 'ideia' } as any);
        undo.push({ id: p.id, before: undefined }); done.push(`Pauta: ${tx}`);
      } else if (a.tipo === 'nova_tarefa' && base?.workCategoryId) {
        const t = await create('task', { title: tx, categoryId: base.workCategoryId, priority: a.prioridade === 'alta' ? 'alta' : 'media', status: 'pendente', tags: [], subtasks: [], history: [], plannedDate: /^\d{4}-\d{2}-\d{2}$/.test(String(a.data ?? '')) ? a.data : null } as any);
        undo.push({ id: t.id, before: undefined }); done.push(`Tarefa: ${tx}`);
      } else if (a.tipo === 'nova_conquista') {
        const w = await create('win', { title: tx, impact: a.impacto ? String(a.impacto) : undefined, date: todayKey(), where: 'trabalho' } as any);
        undo.push({ id: w.id, before: undefined }); done.push(`Conquista: ${tx}`);
      }
    } catch (e) { failed.push(await rollbackAction(undo, mark, e)); }
  }
  return {
    from: 'ai', at: Date.now(),
    text: String(r?.mensagem ?? '').trim() || 'Não consegui formular uma resposta agora.',
    suggestion: r?.rascunho ? String(r.rascunho) : undefined,
    done: done.length ? done : undefined, failed: failed.length ? failed : undefined, undo: undo.length ? undo : undefined
  };
}

/** Semana de trabalho: o que foi entregue e o que vem, para o topo da aba. */
export async function workWeek(today: DateKey = todayKey()) {
  const base = await get<'careerbase'>(CAREER_ID);
  const tasks = (await all('task')).filter((t) => isWork(t, base));
  const ws = weekStart(today);
  const wins = await byDateRange('win', ws, addDays(ws, 6));
  return { done: tasks.filter((t) => t.completedDate && t.completedDate >= ws).length, open: tasks.filter((t) => t.status === 'pendente').length, wins: wins.length };
}


/* ---------- Curadoria semanal do Desenvolvimento ---------- */
export const pickId = (week: DateKey) => `devpick:${week}`;

/** Confirma o livro no Google Books (capa, sinopse, páginas, ISBN); sem resultado, fica o que a especialista mandou. */
async function confirmBook(b: PickBook): Promise<PickBook> {
  try {
    const q = `intitle:${b.titulo.split(/[:(]/)[0].trim()}${b.autor ? ` inauthor:${b.autor.split(/[,&]| e /)[0].trim()}` : ''}`;
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`);
    if (!r.ok) return b;
    const d = await r.json();
    const hit = (d.items ?? []).find((it: any) => it.volumeInfo?.imageLinks?.thumbnail) ?? d.items?.[0];
    const v = hit?.volumeInfo;
    if (!v) return b;
    return {
      ...b, googleId: hit.id, authors: v.authors ?? (b.autor ? [b.autor] : []), pages: v.pageCount,
      cover: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
      isbn: (v.industryIdentifiers ?? []).find((x: any) => x.type === 'ISBN_13')?.identifier,
      sinopse: b.sinopse || (v.description ? String(v.description).replace(/<[^>]+>/g, '').slice(0, 420) : undefined)
    };
  } catch { return b; }
}

/** Busca as sugestões da semana (uma por semana; 'force' troca as atuais). */
export async function loadPicks(force = false, today: DateKey = todayKey()): Promise<DevPick> {
  const week = weekStart(today);
  const id = pickId(week);
  const cur = await get<'devpick'>(id);
  if (cur && !cur.deleted && !force) return cur;
  const ctx = await careerContext(today);
  const past = (await all('devpick')).filter((p) => !p.deleted).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8);
  const books = await all('book');
  const r = await askAI<any>('career_picks', {
    hoje: today,
    base_da_carreira: ctx.base_da_carreira,
    desenvolvimento: ctx.desenvolvimento,
    trabalho: ctx.trabalho,
    livros_dela: books.filter((b) => !b.deleted).map((b) => b.title),
    ja_sugerido: past.flatMap((p) => [p.noticia?.titulo, p.artigo?.titulo, p.livro?.titulo]).filter(Boolean)
  });
  const livro = r?.livro?.titulo ? await confirmBook(r.livro) : undefined;
  const data = { week, noticia: r?.noticia?.titulo ? r.noticia : undefined, artigo: r?.artigo?.titulo ? r.artigo : undefined, livro };
  if (cur) { await update<'devpick'>(id, { ...data, deleted: 0 } as any); return { ...cur, ...data }; }
  return create('devpick', { id, ...data } as any);
}
