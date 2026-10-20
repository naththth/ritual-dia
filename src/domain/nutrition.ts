// Nutrição: tabela TACO (local, offline), Open Food Facts (marcas, online) e cálculo por porção.
import type { Food, MealItem, Measure, Nutr } from '../db/types';

export interface TacoFood { id: number; name: string; cat: string; n: Nutr | null }

let tacoCache: Promise<TacoFood[]> | null = null;
export function loadTaco(): Promise<TacoFood[]> {
  if (!tacoCache) {
    const base = (import.meta as any).env?.BASE_URL ?? '/';
    tacoCache = fetch(`${base}data/taco.json`).then((r) => r.json()).then((d) => d.foods.map((f: any[]) => ({
      id: f[0], name: f[1], cat: d.cats[String(f[2])] ?? '',
      n: f[3] == null ? null : { kcal: f[3], p: f[4] ?? 0, c: f[5] ?? 0, f: f[6] ?? 0, fib: f[7] ?? undefined, na: f[8] ?? undefined }
    }))).catch((e) => { tacoCache = null; throw e; });
  }
  return tacoCache;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Busca por palavras em qualquer ordem; nomes que começam com o termo vêm primeiro. */
export function searchList<T>(items: T[], q: string, name: (t: T) => string, limit = 8): T[] {
  const words = norm(q).split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  return items
    .map((t) => ({ t, n: norm(name(t)) }))
    .filter((x) => words.every((w) => x.n.includes(w)))
    .sort((a, b) => Number(!b.n.startsWith(words[0])) - Number(!a.n.startsWith(words[0])) || a.n.length - b.n.length)
    .slice(0, limit)
    .map((x) => x.t);
}

export function typeFromTacoCat(cat: string): string {
  const c = norm(cat);
  if (c.startsWith('cereais')) return 'Carboidrato';
  if (c.startsWith('verduras')) return 'Vegetais';
  if (c.startsWith('frutas')) return 'Fruta';
  if (c.startsWith('carnes') || c.startsWith('pescados') || c.startsWith('ovos')) return 'Proteína';
  if (c.startsWith('leite')) return 'Laticínios';
  if (c.startsWith('leguminosas')) return 'Leguminosas';
  if (c.startsWith('bebidas')) return 'Bebida';
  if (c.startsWith('produtos acucarados')) return 'Doce';
  if (c.startsWith('gorduras') || c.startsWith('nozes')) return 'Complemento';
  return 'Outros';
}

/* ---------- Open Food Facts (produtos de marca) ---------- */
export interface OffFood { code: string; name: string; brand?: string; n: Nutr | null; serving?: Measure }
/** Busca de marcas: pelo servidor do Ritual (sem bloqueio do navegador, Brasil primeiro); sem login, direto no Open Food Facts. */
export async function searchOFF(q: string, signal?: AbortSignal): Promise<OffFood[]> {
  const { supabase, useSync } = await import('../sync/sync');
  if (supabase && useSync.getState().session) {
    const { data, error } = await supabase.functions.invoke('ritual-food', { body: { action: 'search', q } });
    if (signal?.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError' });
    if (!error && data?.items) return data.items as OffFood[];
  }
  return searchOFFDirect(q, signal);
}

/** Produto pelo código de barras. */
export async function lookupBarcode(code: string): Promise<OffFood | null> {
  const { supabase, useSync } = await import('../sync/sync');
  if (supabase && useSync.getState().session) {
    const { data, error } = await supabase.functions.invoke('ritual-food', { body: { action: 'barcode', code } });
    if (!error) return (data?.item as OffFood) ?? null;
  }
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity`);
  if (!r.ok) return null;
  const d = await r.json();
  return d?.product ? mapOff({ ...d.product, code }) : null;
}

function mapOff(p: any): OffFood {
  const nu = p.nutriments ?? {};
  const kcal = nu['energy-kcal_100g'] ?? (nu.energy_100g ? nu.energy_100g / 4.184 : undefined);
  const sq = Number(p.serving_quantity);
  return {
    code: String(p.code), name: String(p.product_name_pt || p.product_name || '').trim(), brand: p.brands ? String(p.brands).split(',')[0].trim() : undefined,
    n: kcal == null ? null : { kcal: Math.round(kcal), p: +(nu.proteins_100g ?? 0), c: +(nu.carbohydrates_100g ?? 0), f: +(nu.fat_100g ?? 0), fib: nu.fiber_100g != null ? +nu.fiber_100g : undefined, na: nu.sodium_100g != null ? Math.round(nu.sodium_100g * 1000) : undefined },
    serving: sq > 0 ? { label: `1 porção (${p.serving_size ?? sq + ' g'})`, grams: sq } : undefined
  };
}

async function searchOFFDirect(q: string, signal?: AbortSignal): Promise<OffFood[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=12&lc=pt&cc=br&fields=code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Busca de marcas indisponível agora.');
  const d = await r.json();
  return (d.products ?? []).map((p: any) => {
    const nu = p.nutriments ?? {};
    const kcal = nu['energy-kcal_100g'] ?? (nu.energy_100g ? nu.energy_100g / 4.184 : undefined);
    const n: Nutr | null = kcal == null ? null : {
      kcal: Math.round(kcal), p: +(nu.proteins_100g ?? 0), c: +(nu.carbohydrates_100g ?? 0), f: +(nu.fat_100g ?? 0),
      fib: nu.fiber_100g != null ? +nu.fiber_100g : undefined, na: nu.sodium_100g != null ? Math.round(nu.sodium_100g * 1000) : undefined
    };
    const sq = Number(p.serving_quantity);
    return {
      code: String(p.code), name: String(p.product_name_pt || p.product_name || '').trim(), brand: p.brands ? String(p.brands).split(',')[0].trim() : undefined, n,
      serving: sq > 0 ? { label: `1 porção (${p.serving_size ?? sq + ' g'})`, grams: sq } : undefined
    };
  }).filter((x: OffFood) => x.name);
}

/* ---------- Porções e cálculo ---------- */
const UNIT_ALIASES: Record<string, string> = { un: 'un', unidade: 'un', unidades: 'un', fatia: 'fatia', fatias: 'fatia', colher: 'colher', colheres: 'colher', copo: 'copo', copos: 'copo', porcao: 'porcao', porcoes: 'porcao' };
function parsePortion(label: string): { q: number; unit: string } | null {
  const m = norm(label).match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)/);
  if (!m) return null;
  const q = Number(m[1].replace(',', '.'));
  const raw = m[2].replace(/\.$/, '');
  return { q, unit: raw === 'g' ? 'g' : UNIT_ALIASES[raw] ?? raw };
}

/** Peso em gramas de uma porção para um alimento; undefined quando não dá para saber sem inventar. */
export function gramsFor(food: Food | undefined, portion: string, explicit?: number): number | undefined {
  if (explicit && explicit > 0) return explicit;
  if (!food) return undefined;
  const exact = food.measures?.find((m) => norm(m.label) === norm(portion));
  if (exact) return exact.grams;
  const p = parsePortion(portion);
  if (!p) return undefined;
  if (p.unit === 'g') return p.q;
  for (const m of food.measures ?? []) {
    const mp = parsePortion(m.label);
    if (mp && mp.unit === p.unit && mp.q > 0) return (m.grams / mp.q) * p.q;
  }
  return undefined;
}

export function scale(n: Nutr, grams: number): Nutr {
  const k = grams / 100;
  return { kcal: n.kcal * k, p: n.p * k, c: n.c * k, f: n.f * k, fib: n.fib != null ? n.fib * k : undefined, na: n.na != null ? n.na * k : undefined };
}

export function itemNutr(food: Food | undefined, item: MealItem): Nutr | undefined {
  if (!food?.n) return undefined;
  const g = gramsFor(food, item.portion, item.grams);
  return g == null ? undefined : scale(food.n, g);
}

export const ZERO: Nutr = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, na: 0 };
export function add(a: Nutr, b: Nutr): Nutr {
  return { kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f, fib: (a.fib ?? 0) + (b.fib ?? 0), na: (a.na ?? 0) + (b.na ?? 0) };
}

/** Soma itens; conta quantos ficaram sem dados para não esconder lacunas. */
export function totals(items: MealItem[], foods: Food[]): { n: Nutr; missing: number } {
  const byId = new Map(foods.map((f) => [f.id, f]));
  let n = ZERO;
  let missing = 0;
  for (const i of items) {
    const x = itemNutr(byId.get(i.foodId), i);
    if (x) n = add(n, x); else missing++;
  }
  return { n, missing };
}

export const fmt = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** Opções de porção para um alimento: medidas com peso, múltiplos de unidade e as porções antigas. */
export function portionOptions(food: Food | undefined): string[] {
  if (!food) return ['P', 'M', 'G'];
  const out: string[] = [];
  for (const m of food.measures ?? []) {
    out.push(m.label);
    const p = parsePortion(m.label);
    if (p && p.unit !== 'g' && p.q === 1 && !m.label.includes('(')) {
      const word = m.label.replace(/^1\s*/, '');
      const plural = word.endsWith('ção') ? word.slice(0, -3) + 'ções' : word.endsWith('.') || word.endsWith('s') ? word : /[rzl]$/.test(word) ? word + 'es' : word + 's';
      out.push(`2 ${plural}`, `3 ${plural}`);
    }
  }
  for (const p of food.portions ?? []) if (!out.some((o) => norm(o) === norm(p))) out.push(p);
  return out.length ? out : ['P', 'M', 'G'];
}
