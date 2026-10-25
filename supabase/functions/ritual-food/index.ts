import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// Buscas na internet feitas pelo servidor (sem bloqueio de navegador):
//  - search: alimento de marca no Open Food Facts, com prioridade para o Brasil ("leite sem lactose batavo")
//  - barcode: código de barras (EAN) lido pela câmera
//  - image: foto de um produto de cuidados (busca de imagens), devolvida já em miniatura
//  - images_batch: miniaturas para os produtos dela que ainda não têm foto (também pelo agendador, com o segredo)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };
const UA = { 'user-agent': 'Ritual/1.0 (app pessoal; contato via github.com/naththth/ritual-dia)' };

function claims(req: Request): { role?: string; sub?: string } {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch { return {}; }
}
const authed = (req: Request) => claims(req).role === 'authenticated';
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/* ---------- Fotos de produtos de cuidados ---------- */
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' };
const THUMB = 160;

/** Endereços das imagens que a busca de imagens do Bing devolve para o texto, na ordem da busca. */
async function imageCandidates(q: string): Promise<string[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`, { headers: BROWSER, signal: ctrl.signal });
    if (!r.ok) return [];
    const html = await r.text();
    const out: string[] = [];
    for (const m of html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)) {
      const u = m[1].replace(/&amp;/g, '&');
      if (/^https:\/\//.test(u) && !out.includes(u)) out.push(u);
      if (out.length >= 12) break;
    }
    return out;
  } catch { return []; } finally { clearTimeout(t); }
}

/** Baixa a imagem e devolve uma miniatura quadrada em JPEG, com fundo claro (embalagens costumam vir em PNG transparente). */
async function thumbFrom(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { ...BROWSER, accept: 'image/jpeg,image/png,image/*;q=0.8' }, signal: ctrl.signal });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/image\/(jpeg|jpg|png)/.test(type)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    // Imagem grande demais estoura a memória da função ao decodificar: passa para a próxima.
    if (buf.length > 2_500_000) return null;
    const img = await Image.decode(buf);
    if (img.width * img.height > 9_000_000) return null;
    const k = Math.min(THUMB / img.width, THUMB / img.height);
    img.resize(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
    const bg = new Image(THUMB, THUMB).fill(0xffffffff);
    bg.composite(img, Math.round((THUMB - img.width) / 2), Math.round((THUMB - img.height) / 2));
    return `data:image/jpeg;base64,${encodeBase64(await bg.encodeJPEG(78))}`;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Texto de busca a partir de marca e nome, sem as anotações dela entre parênteses. */
const imageQuery = (brand?: string, name?: string) => `${brand ?? ''} ${(name ?? '').replace(/\(.*?\)/g, ' ')}`.replace(/\s+/g, ' ').trim();

/** A primeira imagem que der certo a partir da posição pedida (para "buscar outra"). */
async function findImage(q: string, skip = 0) {
  const urls = await imageCandidates(q);
  for (let i = skip; i < Math.min(urls.length, skip + 6); i++) {
    const thumb = await thumbFrom(urls[i]);
    if (thumb) return { image: thumb, source: urls[i], index: i, total: urls.length };
  }
  return null;
}

/** Miniaturas para os produtos que ainda não têm foto: grava direto no registro, que chega ao app pela sincronização. */
async function imagesBatch(user: string, limit: number) {
  const db = admin();
  const { data: rows, error } = await db.from('records').select('id, data').eq('user_id', user).eq('kind', 'product').eq('deleted', false);
  if (error) throw new Error(error.message);
  const todo = (rows ?? []).filter((r: any) => !r.data?.image && !r.data?.imageTried && !['arquivado', 'de_outra'].includes(r.data?.status));
  let done = 0, failed = 0;
  const started = Date.now();
  for (const r of todo.slice(0, limit)) {
    if (Date.now() - started > 110_000) break;
    const found = await findImage(imageQuery(r.data.brand, r.data.name));
    const data = found ? { ...r.data, image: found.image, imageSrc: found.source } : { ...r.data, imageTried: true };
    await db.from('records').update({ data, client_updated_at: new Date().toISOString() }).eq('user_id', user).eq('id', r.id);
    if (found) done++; else failed++;
  }
  return { done, failed, left: Math.max(0, todo.length - done - failed) };
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
  try {
    const body = await req.json();
    const { action, q, code } = body;
    // O agendador (ou o Claude, numa carga inicial) usa o segredo e diz de quem são os produtos.
    if (action === 'images_batch' && req.headers.get('x-cron-secret')) {
      const { data } = await admin().from('app_secrets').select('value').eq('key', 'cron_secret').maybeSingle();
      if (!data?.value || data.value !== req.headers.get('x-cron-secret') || !/^[0-9a-f-]{36}$/.test(String(body.user_id))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: J });
      return new Response(JSON.stringify(await imagesBatch(String(body.user_id), Math.min(40, Number(body.limit) || 15))), { headers: J });
    }
    if (!authed(req)) return new Response(JSON.stringify({ error: 'Entre com Google para buscar na internet.' }), { status: 401, headers: J });
    if (action === 'image' && typeof q === 'string' && q.trim().length >= 2) return new Response(JSON.stringify({ item: await findImage(q.trim().slice(0, 120), Math.max(0, Number(body.skip) || 0)) }), { headers: J });
    if (action === 'images_batch') return new Response(JSON.stringify(await imagesBatch(String(claims(req).sub), Math.min(40, Number(body.limit) || 15))), { headers: J });
    if (action === 'search' && typeof q === 'string' && q.trim().length >= 2) return new Response(JSON.stringify({ items: await search(q.trim().slice(0, 80)) }), { headers: J });
    if (action === 'barcode' && /^\d{6,14}$/.test(String(code))) return new Response(JSON.stringify({ item: await barcode(String(code)) }), { headers: J });
    return new Response(JSON.stringify({ error: 'Pedido inválido' }), { status: 400, headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: J });
  }
});
