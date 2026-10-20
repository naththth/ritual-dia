import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Assistente do Ritual. Funciona com Google Gemini, OpenAI ou Anthropic; a chave fica num segredo do Supabase.
// Ordem: AI_PROVIDER (se definido) ou a primeira chave encontrada: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };

const BASE = `Você é o assistente do Ritual, app pessoal de uma mulher adulta no Brasil que organiza o dia: pele, treino, alimentação, hábitos, tarefas, diário e leitura. Ela pratica triathlon (pedal indoor no MyWhoosh, musculação, LPO e yoga) e segue um plano alimentar de nutricionista.
Escreva em português do Brasil, direto, sem clichês, sem emojis, sem frases motivacionais vazias.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, sem cercas de código.
Use apenas os IDs que vierem no contexto. Nunca invente IDs, produtos, alimentos, números ou fatos. Não faça diagnóstico nem recomende medicamentos.`;

const TRAINING_FORMAT = `{"templates":[{"key":"t1","name":"...","modality":"musculacao|ciclismo|yoga|lpo|corrida|natacao|mobilidade|descanso","duration":minutos,"intensity":"leve|moderada|intensa","time":"HH:MM (só para aulas com horário)","steps":[{"label":"Aquecimento","minutes":10,"pct":55}],"muscles":["Pernas"]}],"week":{"1":["t1"],...}}`;

const TASKS: Record<string, string> = {
  skin_plan: `Monte um plano semanal de pele com os produtos que ela TEM (contexto.produtos).
Regras: ordem de aplicação correta; manhã sempre com protetor solar; no máximo um ativo forte por período (retinoide, BHA/AHA, ácido azelaico, peróxido de benzoíla); retinoide e ácido esfoliante nunca no mesmo dia; ao menos 2 noites de recuperação por semana; considere o perfil de pele informado e os registros recentes (se a pele andou sensibilizada, reduza ativos).
Produtos de tratamento pontual (curativo, peróxido) ficam fora do plano.
Não prescreva medicamento; se houver produto que costuma ser de prescrição, use com parcimônia e mencione em 'observacoes' que vale confirmar com a dermatologista.
Formato: {"am":{"base":[ids],"days":{"1":{"add":[ids],"remove":[ids]},...}},"pm":{...},"recovery":{"am":[ids],"pm":[ids]},"resumo":"2-3 frases explicando a lógica","observacoes":"cuidados"}. Dias: 1=segunda ... 7=domingo.`,
  training_plan: `Monte a semana de treino a partir das restrições do contexto (aulas com dia fixo, frequência de musculação, pedais por semana, FTP).
Para pedal indoor (MyWhoosh), crie sessões estruturadas em blocos com % do FTP, incluindo aquecimento e volta à calma; alterne uma sessão de qualidade (limiar/sweet spot ou VO2 curto) e uma de base (Z2). Musculação de 30 a 40 min.
Evite treino intenso de pernas na véspera do pedal de qualidade quando possível.
Formato: ${TRAINING_FORMAT} mais "resumo":"2-3 frases". 'steps' só para ciclismo.`,
  training_review: `Analise os treinos feitos nos últimos 28 dias (métricas reais vindas dos arquivos .FIT do MyWhoosh e do Garmin) contra o plano atual e o FTP. Considere a carga atual (fitness, fadiga, forma) e o diário (energia, sono, estresse) quando vierem.
Avalie: aderência ao plano; se a potência normalizada e o tempo em zona bateram com a intenção de cada sessão; tendência de FC para a mesma potência; carga semanal (TSS) e sinais de excesso ou de folga; se o FTP parece desatualizado (ex.: melhor 20 min x 0,95 acima do FTP).
Escreva 'analise' em 4 a 8 frases objetivas, citando números do contexto.
Se fizer sentido mudar, proponha a semana ajustada mantendo as aulas com horário fixo (LPO e yoga) e a musculação 3x; se não precisar mudar, omita templates e week.
Formato: {"analise":"", ...${TRAINING_FORMAT}}.`,
  food_plan: `Transforme a dieta descrita no contexto em refeições favoritas e um plano semanal. Use alimentos do catálogo (contexto.alimentos) pelos IDs; se faltar um alimento, liste em 'novos_alimentos' (nome e tipo) e referencie pelo campo 'novo:NOME'.
Respeite restrições informadas (ex.: sem lactose). Porções: P, M, G, '1 un.', '2 un.', '1 colher', '1 fatia', '1 copo' ou gramas como '140 g'.
Formato: {"novos_alimentos":[{"nome":"","tipo":""}],"refeicoes":[{"key":"r1","name":"","mealType":"cafe|almoco|lanche|jantar|ceia","items":[{"foodId":"id ou novo:NOME","portion":"M"}]}],"week":{"1":{"cafe":"r1","almoco":"r2"}},"resumo":""}.`,
  day_brief: `Prepare a orientação do dia selecionado. Escolha até 3 tarefas pendentes que façam sentido HOJE considerando prioridade, o que já está escolhido para o dia, compromissos com data e a carga do dia (treino, plano). Para cada uma, diga o primeiro passo concreto (curto). Dê uma frase sobre a pele (com base nos registros recentes e no plano do dia) e uma sobre o treino do dia, levando em conta a carga de treino, os treinos dos últimos dias e o diário quando vierem (ex.: sono ruim no diário e forma muito negativa: sugira manter o treino leve). Respeite o que já aconteceu: contexto.feito_hoje (pele, treinos, refeições) e treinos_pulados_hoje. Nunca sugira um treino já feito ou pulado nem a rotina de pele de um período já registrado (comente o que foi usado, se fizer sentido). Use hora_agora: à noite, foque no que ainda cabe no dia e no descanso. Sem moralizar, sem culpa, sem inventar prazos.
Formato: {"tarefas":[{"id":"task:...","motivo":"","primeiro_passo":""}],"pele":"","treino":"","foco":"uma frase curta para o dia"}.`,
  week_review: `Faça a revisão da semana dela a partir do contexto (hábitos, treinos, alimentação, pele, diário, tarefas e leitura).
Escreva 'texto' com 5 a 8 frases: o que os números mostram, ligações reais entre áreas (ex.: noites de sono curto e energia baixa no diário; dias sem almoço registrado e treino pior), sempre citando dados do contexto. Diferencie "não registrado" de "não feito". Sem julgamento.
'destaques': até 3 coisas que foram bem, concretas. 'foco': até 3 ajustes práticos e pequenos para a próxima semana.
Formato: {"texto":"","destaques":[""],"foco":[""]}.`,
  wellness_read: `Você recebe prints do Garmin Connect (ou de outro app de saúde/relógio). Extraia SOMENTE números que aparecem na imagem; nunca estime nem complete.
- data: a data a que os números se referem, em YYYY-MM-DD. Use contexto.hoje para resolver "Hoje", "Ontem" ou dia da semana; se não houver nenhuma indicação, null.
- sono_h: duração total do sono em horas decimais (7h 32min = 7.53). sono_score: pontuação de sono 0-100. dormiu / acordou: HH:MM em 24 h.
- vfc: média noturna da VFC em ms (não o status nem a faixa). fc_repouso: FC de repouso em bpm.
- body_battery: valor ao acordar (ou o maior do dia se só houver esse). passos: total de passos do dia mostrado. estresse: nível médio de estresse.
- observacao: uma frase curta só se algo for ambíguo (ex.: os passos são parciais do dia).
Formato: {"data":null,"sono_h":null,"sono_score":null,"dormiu":null,"acordou":null,"vfc":null,"fc_repouso":null,"body_battery":null,"passos":null,"estresse":null,"observacao":""}.`,
  label_read: `Você recebe a foto de um rótulo de alimento (tabela nutricional brasileira e/ou frente da embalagem). Extraia SOMENTE o que está escrito; nunca estime.
- nome e marca do produto se aparecerem.
- porcao_g: a porção de referência em gramas ou mL (ex.: 200 mL = 200). porcao_rotulo: como está escrito (ex.: "200 mL (1 copo)").
- Valores por 100 g/100 mL: se a tabela já tiver a coluna 100 g/100 mL, use-a; se só tiver por porção, converta: valor_100 = valor_porcao / porcao_g * 100, com 1 casa decimal.
- kcal (valor energético em kcal, não kJ), proteínas, carboidratos totais, gorduras totais, fibra alimentar (g) e sódio (mg).
Formato: {"nome":null,"marca":null,"porcao_g":null,"porcao_rotulo":null,"kcal_100g":null,"proteina_100g":null,"carboidrato_100g":null,"gordura_100g":null,"fibra_100g":null,"sodio_mg_100g":null}.`
};

type Img = { mime: string; data: string };

function extractJson(text: string) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('A IA respondeu sem JSON');
  return JSON.parse(text.slice(s, e + 1));
}

type Call = (system: string, user: string, images?: Img[]) => Promise<string>;

function pickProvider(): { name: string; call: Call } | null {
  const forced = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase();
  const g = Deno.env.get('GEMINI_API_KEY');
  const o = Deno.env.get('OPENAI_API_KEY');
  const a = Deno.env.get('ANTHROPIC_API_KEY');
  const gemini: Call = async (system, user, images = []) => {
    // Modelos em ordem de preferência; se um estiver sobrecarregado (503/429) ou indisponível (404), tenta o próximo.
    const models = Array.from(new Set([Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']));
    let last = '';
    for (const model of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': g!, 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000, temperature: 0.4 } })
      });
      const b = await r.json();
      if (r.ok) return (b.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
      last += `[${model} ${r.status}] ${String(b?.error?.message ?? '').slice(0, 120)} `;
      if (![404, 429, 500, 503].includes(r.status)) break;
    }
    throw new Error(`Gemini: ${last}`);
  };
  const openai: Call = async (system, user, images = []) => {
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${o}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: images.length ? [{ type: 'text', text: user }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : user }] })
    });
    const b = await r.json();
    if (!r.ok) throw new Error(`OpenAI: ${b?.error?.message ?? r.status}`);
    return b.choices?.[0]?.message?.content ?? '';
  };
  const anthropic: Call = async (system, user, images = []) => {
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': a!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: 'user', content: images.length ? [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: user }] : user }] })
    });
    const b = await r.json();
    if (!r.ok) throw new Error(`Anthropic: ${b?.error?.message ?? r.status}`);
    return (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  };
  if (forced === 'gemini' && g) return { name: 'gemini', call: gemini };
  if (forced === 'openai' && o) return { name: 'openai', call: openai };
  if (forced === 'anthropic' && a) return { name: 'anthropic', call: anthropic };
  if (g) return { name: 'gemini', call: gemini };
  if (o) return { name: 'openai', call: openai };
  if (a) return { name: 'anthropic', call: anthropic };
  return null;
}

// Só a usuária logada (ou o teste interno com o segredo do agendador) usa a IA; a chave pública do app não basta.
async function allowed(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    if (payload.role === 'authenticated') return true;
  } catch { /* */ }
  const probe = req.headers.get('x-cron-secret');
  if (!probe) return false;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data } = await admin.from('app_secrets').select('value').eq('key', 'cron_secret').maybeSingle();
  return !!data?.value && data.value === probe;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!(await allowed(req))) return new Response(JSON.stringify({ error: 'Entre com Google para usar a IA.' }), { status: 401, headers: J });
    const provider = pickProvider();
    if (!provider) return new Response(JSON.stringify({ error: 'A chave da IA ainda não foi configurada no Supabase.' }), { status: 503, headers: J });
    const { task, context, images } = await req.json();
    if (!TASKS[task]) return new Response(JSON.stringify({ error: 'Tarefa desconhecida' }), { status: 400, headers: J });
    const ctx = JSON.stringify(context ?? {});
    if (ctx.length > 80000) return new Response(JSON.stringify({ error: 'Contexto grande demais' }), { status: 413, headers: J });
    const imgs: Img[] = Array.isArray(images) ? images.filter((i: any) => typeof i?.data === 'string' && /^image\/(jpeg|png|webp)$/.test(i?.mime)).slice(0, 4) : [];
    if (imgs.reduce((a, i) => a + i.data.length, 0) > 8_000_000) return new Response(JSON.stringify({ error: 'Imagens grandes demais' }), { status: 413, headers: J });
    const text = await provider.call(BASE + '\n\n' + TASKS[task], `Contexto (JSON):\n${ctx}`, imgs);
    return new Response(JSON.stringify({ result: extractJson(text), provider: provider.name }), { headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 502, headers: J });
  }
});
