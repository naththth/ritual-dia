// Importação do arquivo privado (DADOS_PESSOAIS_IMPORTACAO_PRIVADA.json).
// Idempotente: ids estáveis derivados do arquivo; itens já existentes (inclusive excluídos) não são recriados.
import { db, notifyWrite } from '../db/db';
import type { AnyRecord, Priority } from '../db/types';
import { groupFromCategory } from './defaults';

export interface ImportPreview {
  tasks: number;
  habits: number;
  goals: number;
  products: number;
  foods: number;
  tagSuggestions: { tag: string; taskIds: string[]; titles: string[] }[];
}

export interface ParsedImport {
  records: AnyRecord[];
  preview: ImportPreview;
  skinProfile: string[];
  foodPrefs: string[];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function prio(p?: string): Priority {
  const n = norm(p ?? '');
  if (n.startsWith('alt')) return 'alta';
  if (n.startsWith('baix')) return 'baixa';
  return 'media';
}

function categoryId(cat: string): string {
  const n = norm(cat);
  if (n.startsWith('materia') || n.startsWith('compra')) return 'cat:compras';
  if (n.startsWith('compromisso')) return 'cat:compromissos';
  if (n.startsWith('projeto')) return 'cat:projetos';
  return 'cat:' + slug(cat);
}

// Sugestões de etiqueta a confirmar, para que a busca encontre por sinônimos comuns.
const TAG_RULES: { tag: string; words: string[] }[] = [
  { tag: 'roupa', words: ['conjunto', 'calca', 'shorts', 'camisa', 'vestido', 'roupa', 'blusa', 'jaqueta'] }
];

const T = 2; // carimbo antigo: qualquer edição posterior prevalece

export function parseImport(raw: unknown): ParsedImport {
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo inválido: não é um JSON de objeto.');
  const j = raw as Record<string, any>;
  if (!Array.isArray(j.tarefas_pontuais)) throw new Error('Arquivo não reconhecido: faltam as tarefas.');

  const recs: AnyRecord[] = [];
  const base = (id: string, kind: string) => ({ id, kind, createdAt: T, updatedAt: T, deleted: 0 as const, dirty: 1 as const });
  const extraCats = new Map<string, string>();

  for (const t of j.tarefas_pontuais) {
    const cid = categoryId(String(t.categoria ?? 'Projetos'));
    if (!['cat:compras', 'cat:compromissos', 'cat:projetos'].includes(cid)) extraCats.set(cid, String(t.categoria));
    recs.push({
      ...base(`task:${t.id}`, 'task'),
      title: String(t.titulo),
      categoryId: cid,
      subcategory: t.subcategoria || undefined,
      priority: prio(t.prioridade_inicial_sugerida),
      status: 'pendente',
      description: t.observacoes || undefined,
      owner: t.responsavel_sugerido || undefined,
      tags: [],
      subtasks: [],
      plannedDate: null,
      completedDate: null,
      history: [{ at: Date.now(), text: 'Importada do arquivo inicial' }],
      sourceId: t.id
    } as AnyRecord);
  }
  for (const [id, name] of extraCats) {
    recs.push({ ...base(id, 'category'), name, labels: { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, subcategories: [], order: 10 } as AnyRecord);
  }

  let order = 1;
  for (const h of j.habitos ?? []) {
    const title = String(h.titulo);
    const n = norm(title);
    const modalityId = n.includes('muscula') ? 'mod:musculacao' : n.includes('yoga') ? 'mod:yoga' : undefined;
    const freq = norm(h.frequencia_tipo ?? '') === 'diaria' ? 'diaria' : norm(h.frequencia_tipo ?? '') === 'mensal' ? 'mensal' : 'semanal';
    recs.push({
      ...base(`habit:${h.id}`, 'habit'),
      title, freq, target: Number(h.meta_ocorrencias) || 1, modalityId,
      priority: prio(h.prioridade_inicial_sugerida), note: h.anotacoes || undefined, order: order++
    } as AnyRecord);
  }

  for (const g of j.metas ?? []) {
    const isKg = norm(g.metrica ?? '') === 'kg';
    recs.push({
      ...base(`goal:${g.id}`, 'goal'),
      title: String(g.titulo), type: isKg ? 'quantitativa' : 'marcos', unit: g.metrica || undefined,
      note: g.observacoes || undefined, milestones: [], status: 'ativa'
    } as AnyRecord);
  }

  for (const p of j.catalogo_produtos_pele_para_validacao ?? []) {
    const { group, active } = groupFromCategory(String(p.categoria ?? ''));
    recs.push({
      ...base(`product:${p.id}`, 'product'),
      brand: String(p.marca ?? ''), name: String(p.nome ?? ''), group, active,
      originalCategory: p.categoria, area: p.area === 'corpo' ? 'corpo' : 'rosto',
      period: 'ambos', status: 'conferir', sourceId: p.id
    } as AnyRecord);
  }

  const foods = j.catalogo_alimentos_sugeridos ?? [];
  for (const f of foods) {
    const name = String(f.nome);
    recs.push({
      ...base(`food:${slug(name)}`, 'food'),
      name, type: String(f.tipo ?? 'Outros'), favorite: false, portions: ['P', 'M', 'G']
    } as AnyRecord);
  }

  // Sugestões de etiquetas
  const tasks = recs.filter((r) => r.kind === 'task') as any[];
  const tagSuggestions = TAG_RULES.map((rule) => {
    const hits = tasks.filter((t) => rule.words.some((w) => norm(t.title).includes(w)));
    return { tag: rule.tag, taskIds: hits.map((t) => t.id), titles: hits.map((t) => t.title) };
  }).filter((s) => s.taskIds.length > 0);

  const prefs = j.preferencias_opcionais ?? {};
  return {
    records: recs,
    preview: {
      tasks: tasks.length,
      habits: (j.habitos ?? []).length,
      goals: (j.metas ?? []).length,
      products: (j.catalogo_produtos_pele_para_validacao ?? []).length,
      foods: foods.length,
      tagSuggestions
    },
    skinProfile: Array.isArray(prefs.pele) ? prefs.pele.map(String) : [],
    foodPrefs: Array.isArray(prefs.alimentacao) ? prefs.alimentacao.map(String) : []
  };
}

/** Grava os registros novos. Retorna quantos foram criados e quantos já existiam. */
export async function applyImport(parsed: ParsedImport, acceptedTags: string[]): Promise<{ created: number; skipped: number }> {
  const tagMap = new Map<string, string[]>();
  for (const s of parsed.preview.tagSuggestions) {
    if (!acceptedTags.includes(s.tag)) continue;
    for (const id of s.taskIds) tagMap.set(id, [...(tagMap.get(id) ?? []), s.tag]);
  }
  let created = 0;
  let skipped = 0;
  await db.transaction('rw', db.records, async () => {
    for (const r of parsed.records) {
      const exists = await db.records.get(r.id);
      if (exists) { skipped++; continue; }
      const rec = r.kind === 'task' && tagMap.has(r.id) ? { ...r, tags: tagMap.get(r.id)! } : r;
      await db.records.put(rec);
      created++;
    }
    // subcategorias usadas nas tarefas entram no cadastro da categoria
    const subs = new Map<string, Set<string>>();
    for (const r of parsed.records) if (r.kind === 'task' && (r as any).subcategory) {
      const k = (r as any).categoryId; if (!subs.has(k)) subs.set(k, new Set()); subs.get(k)!.add((r as any).subcategory);
    }
    for (const [cid, set] of subs) {
      const c = (await db.records.get(cid)) as any;
      if (!c) continue;
      const merged = Array.from(new Set([...(c.subcategories ?? []), ...set]));
      if (merged.length !== (c.subcategories ?? []).length) await db.records.put({ ...c, subcategories: merged, updatedAt: Math.max(c.updatedAt + 1, 3), dirty: 1 });
    }
    const s = await db.records.get('settings');
    if (s) {
      const cur = s as any;
      await db.records.put({
        ...cur,
        skinProfile: cur.skinProfile?.length ? cur.skinProfile : parsed.skinProfile,
        foodPrefs: cur.foodPrefs?.length ? cur.foodPrefs : parsed.foodPrefs,
        owners: Array.from(new Set([...(cur.owners ?? ['Eu']), ...parsed.records.filter((r: any) => r.kind === 'task' && r.owner).map((r: any) => r.owner), ...(parsed.records.some((r: any) => r.kind === 'task' && r.owner) ? ['Ambos'] : [])])),
        importedAt: Date.now(),
        updatedAt: Math.max(Date.now(), cur.updatedAt + 1),
        dirty: 1
      });
    }
  });
  notifyWrite();
  return { created, skipped };
}
