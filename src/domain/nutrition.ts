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

/** Nome e marca separados e sem repetição: "Toddy (Toddy)" vira "Toddy"; "Leite Zymil (Parmalat)" vira nome + marca. */
export function displayFood(f?: { name: string } | null): { name: string; brand?: string } {
  if (!f) return { name: '?' };
  const m = f.name.match(/^(.*)\s+\(([^()]+)\)\s*$/);
  if (!m) return { name: f.name };
  const [, base, brand] = m;
  if (norm(base).includes(norm(brand))) return { name: base.trim() };
  return { name: base.trim(), brand: brand.trim() };
}

/** Quantidade legível: "200 g", "1 copo (200 mL)", "2 fatias". */
export function portionText(food: Food | undefined, item: MealItem) {
  const g = gramsFor(food, item.portion, item.grams);
  if (item.grams && /^\d/.test(item.portion) && item.portion.endsWith(' g')) return `${fmt(item.grams)} g`;
  if (/^[PMG]$/.test(item.portion)) return `porção ${item.portion}${g ? ` (${fmt(g)} g)` : ''}`;
  return g && !item.portion.includes('(') && !item.portion.endsWith(' g') ? `${item.portion} (${fmt(g)} g)` : item.portion;
}

/* ---------- Medidas caseiras ---------- */
export interface Unit { key: string; label: string; grams?: number; approx?: boolean }

/** Medidas caseiras usuais (aproximadas, referência: tabelas brasileiras de medidas caseiras) para quando o alimento só tem gramas. */
const COMMON: [RegExp, [string, number][]][] = [
  [/^pao.*frances/, [['unidade', 50]]],
  [/^pao de queijo/, [['unidade', 25]]],
  [/^pao/, [['fatia', 25]]],
  [/^torrada/, [['unidade', 10]]],
  [/^ovo.*clara/, [['clara', 33]]],
  [/^ovo/, [['unidade', 50]]],
  [/^tapioca/, [['unidade', 70]]],
  [/^arroz/, [['colher de sopa cheia', 25], ['escumadeira', 45]]],
  [/^feijao/, [['concha', 80], ['colher de sopa', 20]]],
  [/^(macarrao|massa)/, [['pegador', 110]]],
  [/^(frango|peito de frango|sobrecoxa)/, [['filé', 100]]],
  [/^carne/, [['bife médio', 100]]],
  [/^(peixe|tilapia|salmao|merluza)/, [['filé', 120]]],
  [/^batata.*doce/, [['unidade média', 150]]],
  [/^batata/, [['unidade média', 130]]],
  [/^mandioca|^aipim/, [['pedaço', 100]]],
  [/^banana/, [['unidade', 70]]],
  [/^maca/, [['unidade', 130]]],
  [/^laranja/, [['unidade', 180]]],
  [/^mamao/, [['meia unidade', 150]]],
  [/^morango/, [['unidade', 12]]],
  [/^abacate/, [['colher de sopa', 30]]],
  [/^(tomate)/, [['unidade', 100]]],
  [/^cenoura/, [['unidade', 80]]],
  [/^leite.*po/, [['colher de sopa', 15]]],
  [/^leite/, [['copo (200 mL)', 200], ['xícara (240 mL)', 240]]],
  [/^(bebida lactea|kefir)/, [['copo (200 mL)', 200]]],
  [/^iogurte/, [['pote', 170]]],
  [/^requeijao/, [['colher de sopa', 30]]],
  [/^queijo.*(parmesao|ralado)/, [['colher de sopa', 5]]],
  [/^queijo/, [['fatia', 20]]],
  [/^(manteiga|margarina)/, [['colher de chá', 5]]],
  [/^(azeite|oleo)/, [['colher de sopa', 13]]],
  [/^aveia/, [['colher de sopa', 15]]],
  [/^granola/, [['colher de sopa', 10]]],
  [/^acucar/, [['colher de chá', 5], ['colher de sopa', 12]]],
  [/^mel/, [['colher de sopa', 20]]],
  [/^(pasta de amendoim|manteiga de amendoim)/, [['colher de sopa', 15]]],
  [/^(castanha|amendoa|nozes|amendoim)/, [['punhado', 30]]],
  [/^(whey|proteina.*soro|suplemento.*protei)/, [['scoop', 30]]],
  [/^cafe/, [['xícara (50 mL)', 50]]],
  [/^(suco)/, [['copo (200 mL)', 200]]],
  [/^(chia|linhaca)/, [['colher de sopa', 10]]]
];

export function pluralize(label: string): string {
  const [w, ...rest] = label.split(' ');
  const p = w.endsWith('ão') ? w.slice(0, -2) + 'ões' : w.endsWith('s') || w.endsWith('.') ? w : /[rzl]$/.test(w) ? w + 'es' : w + 's';
  return [p, ...rest].join(' ');
}
export const fmtQ = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Medidas para escolher a quantidade: as do alimento, as caseiras usuais e sempre gramas no fim. */
export function unitsFor(food: Food | undefined): Unit[] {
  const out: Unit[] = [];
  for (const m of food?.measures ?? []) {
    if (norm(m.label) === '100 g') continue;
    out.push({ key: m.label, label: m.label.replace(/^1\s+/, ''), grams: m.grams });
  }
  const hasUnit = out.some((u) => !/^\d+\s*(g|ml)$/i.test(u.label));
  if (food && !hasUnit) {
    const name = norm(displayFood(food).name);
    const rule = COMMON.find(([re]) => re.test(name));
    for (const [label, grams] of rule?.[1] ?? []) out.push({ key: `1 ${label}`, label, grams, approx: true });
  }
  for (const p of food?.portions ?? []) if (!out.some((u) => norm(u.key) === norm(p)) && !/^\d+\s*g$/.test(p)) out.push({ key: p, label: /^[PMG]$/.test(p) ? `porção ${p}` : p });
  out.push({ key: 'g', label: 'gramas', grams: 1 });
  return out;
}

/** A medida e o número a mostrar para um item já no prato. */
export function unitOfItem(food: Food | undefined, item: MealItem, units: Unit[]): { unit: Unit; qty: number } {
  const g = units.find((u) => u.key === 'g')!;
  const exact = units.find((u) => u.key !== 'g' && norm(u.key) === norm(item.portion));
  if (exact) return { unit: exact, qty: 1 };
  const m = item.portion.match(/^(\d+(?:[.,]\d+)?)\s*(?:×\s*)?(.+)$/);
  if (m && !/^g$/i.test(m[2].trim())) {
    const q = Number(m[1].replace(',', '.'));
    const lbl = norm(m[2]);
    const u = units.find((x) => x.key !== 'g' && (norm(x.label) === lbl || norm(pluralize(x.label)) === lbl));
    if (u && q > 0) return { unit: u, qty: q };
  }
  const grams = gramsFor(food, item.portion, item.grams);
  return grams != null ? { unit: g, qty: Math.round(grams) } : { unit: units[0], qty: 1 };
}

/** Monta o item a partir da medida escolhida e do número digitado. */
export function itemFromUnit(foodId: string, unit: Unit, qty: number): MealItem {
  if (unit.key === 'g') return { foodId, portion: `${fmtQ(qty)} g`, grams: qty };
  if (!unit.grams) return { foodId, portion: unit.key };
  const portion = qty === 1 ? `1 ${unit.label}` : `${fmtQ(qty)} ${qty > 1 ? pluralize(unit.label) : unit.label}`;
  return { foodId, portion, grams: Math.round(unit.grams * qty * 10) / 10 };
}

/** Item padrão ao escolher um alimento: a primeira medida caseira, senão 100 g. */
export function defaultItem(food: Food): MealItem {
  const u = unitsFor(food).find((x) => x.key !== 'g' && x.grams);
  return u ? itemFromUnit(food.id, u, 1) : { foodId: food.id, portion: '100 g', grams: 100 };
}
