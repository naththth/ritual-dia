import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Pauta: as 5 notícias do dia, com resumo, por que importam e como afetam a vida dela.
//  - cron (x-cron-secret, chamado a cada 15 min pelo pg_cron): a partir do horário escolhido em Ajustes da Pauta,
//    monta a edição do dia se ainda não existir (até 3 tentativas por dia).
//  - gerar (usuária logada): monta agora, ou refaz a de hoje com force.
// A montagem roda em segundo plano (EdgeRuntime.waitUntil) e grava o registro pauta:AAAA-MM-DD em public.records;
// o app recebe pela sincronização. Busca na web: Claude com a ferramenta de busca; se falhar, Gemini com a busca do Google.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: J });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const TZ = 'America/Sao_Paulo';

// Mesmas lentes do app (src/domain/pauta.ts) para quando ela ainda não salvou os Ajustes da Pauta.
const DEFAULT_PREFS = {
  hora: '06:30', resumo: 'padrao', avisarRitual: true,
  lentes: [
    { id: 'ia', nome: 'IA e tecnologia B2B', nivel: 'sempre' },
    { id: 'bancos', nome: 'Bancos e setor financeiro', nivel: 'sempre' },
    { id: 'marketing', nome: 'Marketing e inteligência competitiva', nivel: 'sempre' },
    { id: 'economia', nome: 'Economia e meu dinheiro', nivel: 'sempre' },
    { id: 'saude', nome: 'Saúde, sono e performance', nivel: 'asvezes' },
    { id: 'mundo', nome: 'Brasil e mundo, só o essencial', nivel: 'asvezes' }
  ],
  preferir: ['Valor Econômico', 'Folha de S.Paulo', 'MIT Technology Review', 'Febraban'],
  evitar: ['Fofoca e celebridades', 'Clickbait'],
  contexto: '',
  sinais: [] as any[]
};

function nowParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), weekday: wd };
}
const toMin = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : 390);
const addDays = (k: string, n: number) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const WEEKDAY = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

async function secret(key: string) {
  const { data } = await admin.from('app_secrets').select('value').eq('key', key).maybeSingle();
  return data?.value as string | undefined;
}

async function getRec(userId: string, id: string) {
  const { data } = await admin.from('records').select('data, deleted').eq('user_id', userId).eq('id', id).maybeSingle();
  return data && !data.deleted ? data.data as any : undefined;
}

async function putPauta(userId: string, date: string, data: any) {
  const ts = Date.now();
  const row = { id: `pauta:${date}`, user_id: userId, kind: 'pauta', deleted: false, client_updated_at: new Date(ts).toISOString(), data: { ...data, date, createdAt: data.createdAt ?? ts, updatedAt: ts } };
  const { error } = await admin.from('records').upsert(row, { onConflict: 'user_id,id' });
  if (error) throw new Error(`Gravar a Pauta: ${error.message}`);
}

/* ---------------- Contexto ---------------- */
async function buildContext(userId: string, date: string, weekday: number) {
  const prefsRec = await getRec(userId, 'newsprefs');
  const prefs = { ...DEFAULT_PREFS, ...(prefsRec ?? {}) };
  const base = (await getRec(userId, 'careerbase')) ?? {};
  const from = addDays(date, -14);
  const { data: rows } = await admin.from('records').select('kind, data').eq('user_id', userId).eq('deleted', false)
    .in('kind', ['pauta', 'workout', 'wellness']).gte('data->>date', from).lte('data->>date', date);
  const recs = (rows ?? []).map((r: any) => ({ kind: r.kind, ...r.data }));
  const pautas = recs.filter((r) => r.kind === 'pauta' && r.date < date && Array.isArray(r.itens));
  const jaSaiu = pautas.flatMap((p) => p.itens.map((i: any) => i.titulo)).slice(-70);
  // Treinos registrados na última semana (o plano da semana fica com a treinadora).
  const treinos = recs.filter((r) => r.kind === 'workout' && r.date >= addDays(date, -7) && r.date < date)
    .map((w) => ({ data: w.date, nome: w.name ?? String(w.modalityId ?? 'treino').replace(/^mod:/, ''), minutos: w.duration ?? null }))
    .slice(0, 20);
  const sonos = recs.filter((r) => r.kind === 'wellness' && r.date >= addDays(date, -7) && r.date <= date && Number(r.sleepManualH ?? r.sleepH) > 0)
    .map((w) => Number(w.sleepManualH ?? w.sleepH));
  const semana = weekday === 7 ? pautas.filter((p) => p.date >= addDays(date, -6)).flatMap((p) => p.itens.map((i: any) => `${p.date} · ${i.titulo}`)) : [];
  const lentes = (prefs.lentes ?? []).filter((l: any) => l.nivel !== 'nao');
  return {
    prefs, lentes,
    context: {
      hoje: date,
      dia_da_semana: WEEKDAY[weekday],
      lentes: lentes.map((l: any) => ({ id: l.id, tema: l.nome, nivel: l.nivel === 'sempre' ? 'sempre' : 'as_vezes' })),
      fontes_preferidas: prefs.preferir ?? [],
      evitar: prefs.evitar ?? [],
      o_que_ela_quer_que_voce_saiba: String(prefs.contexto ?? '').slice(0, 1500),
      tamanho_do_resumo: prefs.resumo,
      quem_ela_e: {
        cargo: base.role ?? 'Gerente de marketing comercial e inteligência de mercado em empresa de tecnologia B2B',
        empresa: base.workName ?? null, posicionamento: base.posicionamento ?? null, publico: base.publico ?? null,
        pilares: base.pilares ?? null, onde_quer_chegar: base.objetivo ?? null,
        vida: 'mora em Curitiba, treina à noite (corrida, pedal, musculação e ioga) e cuida do sono'
      },
      treinos_ultimos_7_dias: treinos,
      sono_medio_7_dias: sonos.length ? Math.round((sonos.reduce((a, b) => a + b, 0) / sonos.length) * 10) / 10 : null,
      ja_saiu_nas_ultimas_duas_semanas: jaSaiu,
      sinais_dela: (prefs.sinais ?? []).slice(-30),
      titulos_da_semana: semana
    }
  };
}

const SYSTEM = `Você é a editora da Pauta, a newsletter diária pessoal de uma executiva brasileira, dentro do app Ritual. Ela lidera inteligência de mercado e marketing comercial numa empresa de tecnologia B2B, leva material para diretoria e quer chegar ao dia sabendo o que importa, sem ruído.
Escreva em português do Brasil natural, direto e maduro, sem clichês, sem jargão de LinkedIn, sem tom americanizado, sem emojis e sem sensacionalismo. Nunca invente fato, número, data, citação nem endereço: tudo o que você afirmar tem que estar na matéria que você encontrou na busca.`;

function taskPrompt(resumo: string, domingo: boolean) {
  const tam = resumo === 'curto' ? '2 frases' : resumo === 'profundo' ? '5 a 6 frases' : '3 a 4 frases';
  return `Monte a Pauta de hoje (contexto.hoje). Use a busca na web quantas vezes precisar e escolha exatamente 5 notícias que ela precisa saber hoje.
Critérios de escolha, nesta ordem: o que muda decisões dela (trabalho, dinheiro, saúde, vida); o que vai ser assunto com diretoria, clientes e mercado; o que é novo de verdade. Publicadas nas últimas 48 horas (na segunda-feira, 72 horas), de veículos sérios, de preferência brasileiros quando houver equivalente de qualidade; dê peso a contexto.fontes_preferidas. Nada do que estiver em contexto.evitar. Não repita assunto de contexto.ja_saiu_nas_ultimas_duas_semanas, a menos que haja fato novo relevante, e então diga o que mudou. Cinco assuntos diferentes.
Lentes: cada notícia pertence a uma lente de contexto.lentes (use o id). Lentes 'sempre' têm prioridade; 'as_vezes' só entram quando a notícia for realmente relevante para ela. Use contexto.sinais_dela (votos de mais assim / menos assim) para calibrar. Leve em conta o que ela escreveu em contexto.o_que_ela_quer_que_voce_saiba.
Para cada notícia:
- titulo: reescreva em português, claro e factual, até 110 caracteres, sem caça-clique.
- fonte: nome do veículo. url: o endereço exato da matéria que você abriu na busca; nunca monte nem adivinhe endereço. data: AAAA-MM-DD da publicação. minutos: tempo estimado de leitura da matéria original.
- resumo: ${tam} com o fato, quem está envolvido, o número que importa e o que vem depois.
- porque: 1 ou 2 frases de por que isso importa, olhando o quadro maior (não repita o resumo).
- impactos: de 1 a 3, só as áreas em que há efeito real, cada um com area (carreira | dinheiro | saude | vida), nivel (alto | medio | baixo) e texto (1 frase concreta ligada a contexto.quem_ela_e, aos treinos_ultimos_7_dias ou ao sono_medio_7_dias quando fizer sentido; sem exagerar o efeito).
- acao: uma ação concreta e curta que ela pode tomar a partir disso no trabalho, escrita como tarefa ("Levar X para Y"); string vazia quando não houver uma ação real.
- tambem: até 3 nomes de outros veículos que deram a mesma notícia, se você viu na busca.
Ordene da mais importante para a menos importante: a primeira é a manchete do dia.
${domingo ? `Hoje é domingo: escreva também 'fio', a costura da semana a partir de contexto.titulos_da_semana e das notícias de hoje: titulo (1 frase forte, até 90 caracteres, que diga o movimento da semana) e texto (2 ou 3 frases que liguem as notícias).` : `'fio' é null.`}
Sua resposta final é SOMENTE um objeto JSON válido, sem texto antes ou depois e sem cercas de código, neste formato:
{"itens":[{"lente":"","titulo":"","fonte":"","url":"","data":"","minutos":4,"resumo":"","porque":"","impactos":[{"area":"carreira","nivel":"alto","texto":""}],"acao":"","tambem":[]}],"fio":null}`;
}

/* ---------------- IA com busca ---------------- */
async function viaClaude(system: string, user: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('sem chave da Anthropic');
  const model = Deno.env.get('PAUTA_MODEL') ?? Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12, user_location: { type: 'approximate', city: 'Curitiba', region: 'Paraná', country: 'BR', timezone: TZ } }];
  const messages: any[] = [{ role: 'user', content: user }];
  // A busca pode pausar a resposta (pause_turn): devolve o que veio e pede para continuar.
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(140000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 12000, system, tools, messages })
    });
    const b = await r.json();
    if (!r.ok) throw new Error(`Claude: ${b?.error?.message ?? r.status}`);
    if (b.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: b.content }); continue; }
    return (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  }
  throw new Error('Claude: a busca não terminou');
}

/** Endereços que a busca do Gemini consultou (chegam como links de redirecionamento do Google). */
let fontesDaBusca: string[] = [];

async function viaGemini(system: string, user: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('sem chave do Gemini');
  const models = Array.from(new Set([Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash']));
  let last = '';
  for (const model of models) {
    // Pensamento curto: a busca já traz o material e a resposta sai várias vezes mais rápida.
    const send = (level: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(145000),
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 32768, temperature: 0.2, ...(level ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } })
    });
    let r = await send(true);
    if (r.status === 400) { const t = await r.text(); if (/thinking/i.test(t)) r = await send(false); else { last += `[${model} 400] ${t.slice(0, 120)} `; break; } }
    const b = await r.json();
    if (r.ok) {
      const text = (b.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
      fontesDaBusca = (b.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).map((c: any) => c?.web?.uri).filter((u: any) => typeof u === 'string').slice(0, 40);
      if (text.trim()) return text;
    }
    last += `[${model} ${r.status}] `;
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw new Error(`Gemini: ${last}`);
}

function extractJson(text: string) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('A IA respondeu sem JSON');
  return JSON.parse(text.slice(s, e + 1));
}

/* ---------------- Link e imagem ---------------- */
function absolutize(src: string, base: string) {
  try { return new URL(src.replace(/&amp;/g, '&'), base).toString(); } catch { return undefined; }
}

interface Peek { ok: boolean; url: string; title?: string; image?: string }

/** Abre o começo da página: confirma que existe e pega título e imagem de capa (og:image). */
async function peek(url: string): Promise<Peek> {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', accept: 'text/html' } });
    const final = r.url || url;
    // Página de erro disfarçada (redireciona para a capa do site ou para ?error=404) não conta como matéria.
    const lost = /[?&](error|erro)=?404|\/404\b|not-?found/i.test(final) || (new URL(final).pathname.length <= 1 && new URL(url).pathname.length > 1);
    if (!r.ok || lost) { await r.body?.cancel(); return { ok: !lost && [401, 403, 429].includes(r.status), url: final }; }
    let html = '';
    if (r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (html.length < 200000) {
        const { value, done } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      await reader.cancel().catch(() => undefined);
    }
    const meta = (names: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:${names})["'][^>]*>`, 'i'));
      return m?.[0].match(/content=["']([^"']+)["']/i)?.[1];
    };
    const img = meta('og:image|og:image:url|twitter:image');
    const image = img ? absolutize(img, final) : undefined;
    const title = meta('og:title|twitter:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return { ok: true, url: final, title: title?.trim(), image: image && /^https:\/\//.test(image) ? image : undefined };
  } catch {
    return { ok: false, url };
  }
}

/** Resolve o link de redirecionamento da busca do Gemini para o endereço da matéria. */
async function resolveRedirect(uri: string) {
  try {
    const r = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
    await r.body?.cancel();
    const loc = r.headers.get('location');
    return loc && /^https?:\/\//.test(loc) ? loc : undefined;
  } catch { return undefined; }
}

const words = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3));
function overlap(a: string, b: string) {
  const A = words(a); const B = words(b);
  if (!A.size) return 0;
  let n = 0; A.forEach((w) => { if (B.has(w)) n++; });
  return n / A.size;
}

/** Confere cada matéria; se o endereço não abrir, procura a matéria certa entre as páginas que a busca consultou.
 *  Sem achar, troca por uma busca pelo título e marca como não verificada. */
async function checkItems(items: any[]) {
  const first = await Promise.all(items.map((i) => (/^https?:\/\//.test(String(i.url ?? '')) ? peek(String(i.url)) : Promise.resolve<Peek>({ ok: false, url: '' }))));
  let pool: Peek[] = [];
  if (first.some((p) => !p.ok) && fontesDaBusca.length) {
    const resolved = (await Promise.all(fontesDaBusca.map(resolveRedirect))).filter((u): u is string => !!u);
    pool = (await Promise.all([...new Set(resolved)].slice(0, 20).map(peek))).filter((p) => p.ok && p.title);
  }
  const used = new Set(first.filter((p) => p.ok).map((p) => p.url));
  return items.map((item, k) => {
    const p = first[k];
    if (p.ok) return { ...item, url: p.url, verificado: true, ...(p.image ? { imagem: p.image } : {}) };
    const best = pool.filter((c) => !used.has(c.url)).map((c) => ({ c, s: overlap(item.titulo ?? '', c.title ?? '') })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.3) { used.add(best.c.url); return { ...item, url: best.c.url, verificado: true, ...(best.c.image ? { imagem: best.c.image } : {}) }; }
    return { ...item, url: `https://www.google.com/search?q=${encodeURIComponent(`${item.titulo ?? ''} ${item.fonte ?? ''}`.trim())}`, verificado: false };
  });
}

const AREAS = ['carreira', 'dinheiro', 'saude', 'vida'];
const NIVEIS = ['alto', 'medio', 'baixo'];
const s = (x: unknown, max = 900) => String(x ?? '').trim().slice(0, max);

function normalize(raw: any, lentes: any[], date: string) {
  const ids = new Set(lentes.map((l) => l.id));
  const first = lentes.find((l) => l.nivel === 'sempre')?.id ?? lentes[0]?.id ?? 'geral';
  const itens = (Array.isArray(raw?.itens) ? raw.itens : []).slice(0, 5).map((i: any, k: number) => ({
    id: `${date}-${k + 1}`,
    lente: ids.has(i?.lente) ? i.lente : first,
    titulo: s(i?.titulo, 160), fonte: s(i?.fonte, 80), url: s(i?.url, 600),
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(i?.data ?? '')) ? i.data : undefined,
    minutos: Math.min(30, Math.max(1, Math.round(Number(i?.minutos) || 4))),
    resumo: s(i?.resumo, 1400), porque: s(i?.porque, 600),
    impactos: (Array.isArray(i?.impactos) ? i.impactos : []).filter((x: any) => AREAS.includes(x?.area) && s(x?.texto)).slice(0, 3)
      .map((x: any) => ({ area: x.area, nivel: NIVEIS.includes(x.nivel) ? x.nivel : 'medio', texto: s(x.texto, 300) })),
    acao: s(i?.acao, 200) || undefined,
    tambem: (Array.isArray(i?.tambem) ? i.tambem : []).map((x: any) => s(x, 60)).filter(Boolean).slice(0, 3)
  })).filter((i: any) => i.titulo && i.resumo);
  if (itens.length < 3) throw new Error('A IA trouxe menos de 3 notícias');
  const fio = raw?.fio && s(raw.fio.titulo) ? { titulo: s(raw.fio.titulo, 140), texto: s(raw.fio.texto, 700) } : undefined;
  return { itens, fio };
}

/* ---------------- Montagem ---------------- */
async function generate(userId: string, now: ReturnType<typeof nowParts>, prev: any) {
  const date = now.date;
  const t0 = Date.now();
  fontesDaBusca = [];
  const tentativas = (prev?.status === 'pronta' ? 0 : Number(prev?.tentativas ?? 0)) + 1;
  await putPauta(userId, date, { status: 'gerando', iniciada: Date.now(), tentativas, createdAt: prev?.createdAt });
  try {
    const { prefs, lentes, context } = await buildContext(userId, date, now.weekday);
    const user = `${taskPrompt(prefs.resumo, now.weekday === 7)}\n\nContexto (JSON):\n${JSON.stringify(context)}`;
    // Alterna o motor entre as tentativas: se o Claude falhou na anterior, a próxima vai pelo Gemini.
    const order = tentativas % 2 === 1 ? [viaClaude, viaGemini] : [viaGemini, viaClaude];
    let raw: any; let motor = ''; const erros: string[] = [];
    for (const f of order) {
      try { raw = extractJson(await f(SYSTEM, user)); motor = f === viaClaude ? 'claude' : 'gemini'; break; }
      catch (e) { erros.push(String((e as Error)?.message ?? e).slice(0, 200)); if (Date.now() - t0 > 150000) break; }
    }
    if (!raw) throw new Error(erros.join(' | '));
    const { itens, fio } = normalize(raw, lentes, date);
    const checked = await checkItems(itens);
    await putPauta(userId, date, { status: 'pronta', itens: checked, fio, motor, geradaEm: Date.now(), tentativas, lidas: [], salvas: [], votos: {}, createdAt: prev?.createdAt });
  } catch (e) {
    await putPauta(userId, date, { status: 'erro', erro: String((e as Error)?.message ?? e).slice(0, 400), tentativas, createdAt: prev?.createdAt });
  }
}
function runLater(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => undefined);
}

/** Decide se a edição de hoje precisa ser montada agora. */
function needs(prev: any, force: boolean) {
  if (!prev) return true;
  if (prev.status === 'gerando') return Date.now() - Number(prev.iniciada ?? 0) > 6 * 60000; // travou: tenta de novo
  if (prev.status === 'pronta') return force;
  if (prev.status === 'erro') return force || Number(prev.tentativas ?? 0) < 3;
  return true;
}

async function userFrom(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get('action') ?? body.action;
    const now = nowParts();

    if (action === 'cron') {
      if (req.headers.get('x-cron-secret') !== (await secret('cron_secret'))) return json({ error: 'forbidden' }, 403);
      const { data: users } = await admin.from('records').select('user_id').eq('kind', 'settings').eq('deleted', false);
      const out: any[] = [];
      for (const u of users ?? []) {
        const prefs = { ...DEFAULT_PREFS, ...((await getRec(u.user_id, 'newsprefs')) ?? {}) };
        if (prefs.ativa === false || now.min < toMin(prefs.hora)) { out.push({ skip: 'antes do horário' }); continue; }
        const prev = await getRec(u.user_id, `pauta:${now.date}`);
        if (!needs(prev, false)) { out.push({ skip: prev?.status }); continue; }
        runLater(generate(u.user_id, now, prev));
        out.push({ started: now.date });
      }
      return json({ ok: true, out });
    }

    const user = await userFrom(req);
    if (!user) return json({ error: 'Entre com Google para usar a Pauta.' }, 401);

    if (action === 'gerar') {
      const prev = await getRec(user.id, `pauta:${now.date}`);
      const force = body.force === true;
      if (!needs(prev, force)) return json({ status: prev?.status ?? 'pronta' });
      runLater(generate(user.id, now, force ? undefined : prev));
      return json({ status: 'gerando' });
    }
    return json({ error: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
