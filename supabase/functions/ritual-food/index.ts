import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Busca de alimentos de marca (Open Food Facts) pelo servidor: sem bloqueio de navegador e com prioridade para o Brasil.
//  - search: texto livre ("leite sem lactose batavo")
//  - barcode: código de barras (EAN) lido pela câmera

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };
const UA = { 'user-agent': 'Ritual/1.0 (app pessoal; contato via github.com/naththth/ritual-dia)' };

function authed(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).role === 'authenticated';
  } catch { return false; }
}

function norm(p: any) {
  const nu = p.nutriments ?? {};
  const kcal = nu['energy-kcal_100g'] ?? (nu.energy_100g ? nu.energy_100g / 4.184 : undefined);
  const name = String(p.product_name_pt || p.product_name || '').trim();
  const brands = Array.isArray(p.brands) ? p.brands : String(p.brands ?? '').split(',');
  const sq = Number(p.serving_quantity);
  return {
    code: String(p.code ?? ''), name, brand: brands[0]?.trim() || undefined,
    br: (p.countries_tags ?? []).includes('en:brazil') || String(p.code ?? '').startsWith('789'),
    n: kcal == null ? null : {
      kcal: Math.round(Number(kcal)), p: +(nu.proteins_100g ?? 0), c: +(nu.carbohydrates_100g ?? 0), f: +(nu.fat_100g ?? 0),
      fib: nu.fiber_100g != null ? +nu.fiber_100g : undefined, na: nu.sodium_100g != null ? Math.round(nu.sodium_100g * 1000) : undefined
    },
    serving: sq > 0 ? { label: `1 porção (${p.serving_size ?? sq + ' g'})`, grams: sq } : undefined
  };
}

const FIELDS = 'code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,countries_tags';

async function getJson(url: string, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ctrl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

async function search(q: string) {
  const enc = encodeURIComponent(q);
  const [a, b] = await Promise.all([
    getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=24&lc=pt&cc=br&fields=${FIELDS}`),
    getJson(`https://search.openfoodfacts.org/search?q=${enc}&page_size=24&fields=${FIELDS}`)
  ]);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of [...(a?.products ?? []), ...(b?.hits ?? [])]) {
    const x = norm(p);
    if (!x.name || !x.code || seen.has(x.code)) continue;
    seen.add(x.code); out.push(x);
  }
  // Brasil primeiro, depois quem tem calorias, depois quem tem todas as palavras da busca no nome/marca.
  const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 2);
  const score = (x: any) => {
    const hay = `${x.name} ${x.brand ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (x.br ? 4 : 0) + (x.n ? 2 : 0) + words.filter((w) => hay.includes(w)).length / Math.max(1, words.length) * 3;
  };
  return out.sort((x, y) => score(y) - score(x)).slice(0, 15);
}

async function barcode(code: string) {
  const d = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  return d?.product ? norm({ ...d.product, code }) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!authed(req)) return new Response(JSON.stringify({ error: 'Entre com Google para buscar marcas.' }), { status: 401, headers: J });
  try {
    const { action, q, code } = await req.json();
    if (action === 'search' && typeof q === 'string' && q.trim().length >= 2) return new Response(JSON.stringify({ items: await search(q.trim().slice(0, 80)) }), { headers: J });
    if (action === 'barcode' && /^\d{6,14}$/.test(String(code))) return new Response(JSON.stringify({ item: await barcode(String(code)) }), { headers: J });
    return new Response(JSON.stringify({ error: 'Pedido inválido' }), { status: 400, headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: J });
  }
});
