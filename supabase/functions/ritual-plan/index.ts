import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Planejamento da semana de treino (periodização). Separada da ritual-ai para usar um modelo mais forte,
// com raciocínio alto, sem mexer nas outras especialistas. O app manda o esqueleto já calculado; a IA preenche as sessões.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const J = { ...CORS, 'Content-Type': 'application/json' };

const BASE = `Você é a treinadora do Ritual, app pessoal de uma mulher adulta no Brasil.
Escreva em português do Brasil, direto, sem clichês, sem emojis, sem frases motivacionais vazias.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, sem cercas de código.
Nunca invente números ou fatos que não estejam no contexto. Não faça diagnóstico nem recomende medicamentos.
Atue como treinadora de endurance e força no nível das melhores práticas baseadas em evidência (periodização, polarização, progressão de carga, recuperação).
contexto.perfil_dela traz objetivo, corpo e acompanhamentos; contexto.preferencias_dela é o que ela quer, nas palavras dela: siga, salvo dano claro e previsível (aí atenda o mais perto possível e diga em uma frase o que ajustou). Medicamentos: nunca sugira iniciar, parar ou mudar dose; com agonista de GLP-1/GIP, cuide de treino intenso em jejum ou com pouca ingestão e preserve a força. Ciclo menstrual (quando houver): fase estimada; ajuste pelos sintomas e pela recuperação, sem periodizar de forma rígida por fase. estado_mente, quando vier, traz só números e avisos: com humor ou sono ruins, puxe para o lado leve sem citar remédios.`;

const SPECIALIST = `Você é a treinadora dela, de força e endurance (ela faz triathlon, musculação, LPO e yoga).
O jeito dela: ama treino de corpo todo e quer ficar forte, para a vida e para seguir melhorando o corpo que construiu ao sair da obesidade, sem voltar. Sua prioridade é força e massa magra, com o endurance encaixado sem roubar a recuperação.
Critérios: musculação sempre de corpo todo (agachar, dobrar o quadril, empurrar, puxar, core), 2 a 4 séries de 6 a 12 repetições com 1 a 3 de reserva, multiarticulares primeiro, progressão de carga registrada, semana mais leve a cada 4 a 6 semanas; em déficit calórico ou com GLP-1, volume de força suficiente para preservar massa magra é inegociável. Endurance: distribuição polarizada, uma sessão de qualidade e base em Z2; dose a semana por FTP, TSS, forma, VFC, sono e esforço percebido. Quando houver um ciclo com desafios (contexto.desafios ou contexto.periodizacao), o endurance segue a periodização do app, rumo aos desafios; a força continua na semana, sem roubar a recuperação.
Limites: dor articular ou muscular persistente não é para treinar por cima: troque o exercício e, se continuar, oriente avaliação. Tontura, dor no peito, falta de ar desproporcional ou queda brusca de rendimento: parar e procurar médico. Não contradiz treinador presencial.`;

const TASK = `Você monta a semana de treino dela dentro de um ciclo periodizado. O app já decidiu, por regra, a fase, o degrau da progressão, as semanas leves, as travas e o alvo de cada sessão (contexto.esqueleto): sem pedido_dela, você não muda dia, tipo nem duração. Seu trabalho é transformar cada sessão de corrida, pedal e ioga em treino concreto, coerente com a fase e com o que ela vem conseguindo fazer.
Leia antes: semana (número, fase, semana leve, degrau), travas_da_progressao (por que a progressão segurou ou voltou), desafios e quanto falta, corridas e pedais das últimas 6 semanas (pace, FC, potência, esforço, como foi), carga (fitness, fadiga, forma), sono e recuperação, semana_anterior (planejado x feito e as sessões propostas) e pedido_dela (quando houver, ele vem antes do esqueleto; veja abaixo).
Para cada sessão do esqueleto SEM sessao_fixa, devolva uma sessão com dia e chave iguais aos do esqueleto, nome curto e específico (ex.: "Corrida · 6 x 3 min em Z4", "MyWhoosh · Sweet spot 3 x 10 min", "Ioga · quadril e posterior"), minutos iguais ao alvo, intensidade e roteiro de 1 a 3 frases com o objetivo e como executar. Sessão com sessao_fixa (musculação, LPO, aula) não entra na resposta: o app mantém a de sempre.
Pedido dela (pedido_dela): é o que ela precisa nesta semana e manda na estrutura. Leia as datas de cada dia em esqueleto[].data e resolva "amanhã", "terça" e afins por contexto.hoje. Se o pedido mexe em dias, folgas, volume ou compromissos (competição, prova, viagem, aula extra, dia sem poder treinar), devolva 'esqueleto_ajustado' com os 7 dias, cada um com as sessões que ficam naquele dia, apontando para o esqueleto original por de_dia e chave; o que não aparecer em nenhum dia sai da semana. Você pode levar uma sessão para outro dia, encurtar (minutos menores que o alvo) e tirar sessões; não pode criar treino de corrida ou pedal que não está no esqueleto nem alongar o alvo. Sessão com 'desafio' fica no dia dela e não entra no esqueleto_ajustado (o app mantém). Compromisso que ela citar e que não é treino do ciclo (ex.: competição de LPO no sábado e no domingo) vai em 'compromissos', um por dia, com chave lpo, strength, yoga ou yoga_class conforme a modalidade, nome curto (ex.: "Competição de LPO"), minutos estimados e nota de 1 frase (aquecimento, hidratação, o que evitar). Siga a distribuição que ela pediu, dia a dia, sempre que for segura; preserve o que dá para preservar do ciclo e, com competição, alivie as pernas e a intensidade nos 2 dias antes e deixe o dia anterior leve ou de folga, se ela não disser outra coisa. Depois preencha 'sessoes' já nos dias novos. Se o pedido só muda intensidade ou conteúdo, omita esqueleto_ajustado. Sem pedido_dela, nunca devolva esqueleto_ajustado nem compromissos. Na 'mensagem', com pedido, comece dizendo em 1 frase como a semana ficou por dia e, se algo do pedido não foi seguido, por quê.
Pedal (MyWhoosh): blocos em % do FTP que somam exatamente os minutos (aquecimento, parte principal, volta à calma); intervalos de menos de 1 minuto são permitidos (frações, ex.: 0.5). Zonas: Z1 até 55%, Z2 56 a 75%, Z3 76 a 90%, sweet spot 88 a 94%, Z4 91 a 105%, Z5 106 a 120%.
Corrida: blocos que somam os minutos, cada um com 'alvo' em texto: faixa de FC em bpm, esforço percebido de 1 a 10 e sugestão de velocidade na esteira em km/h coerente com os paces recentes dela; 'pct' só dá a altura do desenho (50 leve, 70 moderado, 90 forte, 100 muito forte). Com limiar_corrida_fc no contexto, os alvos de FC saem de zonas_corrida_fc (Z2 nas sessões leves e no longo, Z4 na qualidade); sem ele, use esforço percebido e FC relativa à fc_max_vista_na_corrida. Se ela ainda alterna corrida e caminhada, a base usa blocos corre/caminha, com a caminhada diminuindo de semana a semana.
Sessão com 'teste' (limiar de corrida ou FTP em rampa): siga o protocolo da intenção ao pé da letra, com blocos simples (aquecimento, teste, volta à calma), e diga no roteiro como registrar o resultado no app depois.
Ioga (chave yoga, sem blocos): mobilidade que complementa a semana (quadril, posterior, panturrilha e coluna depois de corrida e pedal; respiração e soltura na semana leve).
Desafio (sessão com 'desafio'): estratégia no roteiro (aquecimento, ritmo do começo, onde apertar, hidratação) e blocos com o plano de ritmo.
Princípios: distribuição polarizada (a maior parte leve; a qualidade fica na sessão que o esqueleto indicar); semana leve sem qualidade; progressão dentro da fase: não repita as sessões da semana anterior, varie estímulo e estrutura mantendo a intenção; no dia seguinte ao LPO e à musculação, nada forte de pernas na corrida; com forma muito negativa, sono ruim ou déficit calórico alto, puxe para o lado leve e diga isso.
'mensagem': 2 a 4 frases, em primeira pessoa como treinadora, dizendo o foco da semana, o que mudou em relação à anterior e por quê (cite as travas quando houver).
Formato: {"mensagem":"","esqueleto_ajustado":[{"dia":1,"sessoes":[{"chave":"strength","de_dia":5,"minutos":45}]}],"compromissos":[{"dia":6,"chave":"lpo","nome":"","minutos":180,"nota":""}],"sessoes":[{"dia":1,"chave":"yoga","nome":"","minutos":20,"intensidade":"leve|moderada|intensa","roteiro":"","blocos":[{"rotulo":"","minutos":0,"pct":0,"alvo":""}]}]}`;

type Call = (system: string, user: string) => Promise<string>;

function extractJson(text: string) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('A IA respondeu sem JSON');
  return JSON.parse(text.slice(s, e + 1));
}

/** Claude com raciocínio estendido; se o modelo não aceitar o raciocínio, repete sem. */
const anthropic = (key: string): Call => async (system, user) => {
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
  const send = (think: boolean) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 16000, ...(think ? { thinking: { type: 'enabled', budget_tokens: 3000 } } : {}), system, messages: [{ role: 'user', content: user }] })
  });
  let r = await send(true);
  let b = await r.json();
  if (r.status === 400 && /thinking|budget/i.test(String(b?.error?.message ?? ''))) { r = await send(false); b = await r.json(); }
  if (!r.ok) throw new Error(`Anthropic: ${b?.error?.message ?? r.status}`);
  return (b.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
};

/** Gemini com pensamento alto, como reserva. */
const gemini = (key: string): Call => async (system, user) => {
  const models = Array.from(new Set([Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']));
  let last = '';
  for (const model of models) {
    const body = (withLevel: boolean) => JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32768, temperature: 0.4, ...(withLevel ? { thinkingConfig: { thinkingLevel: 'high' } } : {}) } });
    const send = (withLevel: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: body(withLevel) });
    let r = await send(true);
    let b = await r.json();
    if (r.status === 400 && /thinking/i.test(String(b?.error?.message ?? ''))) { r = await send(false); b = await r.json(); }
    if (r.ok) {
      const cand = b.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
      if (cand?.finishReason === 'MAX_TOKENS' || !text.trim()) { last += `[${model} resposta cortada] `; break; }
      return text;
    }
    last += `[${model} ${r.status}] ${String(b?.error?.message ?? '').slice(0, 120)} `;
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw new Error(`Gemini: ${last}`);
};

/** O gateway já validou o JWT (verify_jwt); aqui confere que é a usuária logada ou o teste interno com o segredo do agendador. */
async function loggedIn(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    if (payload.role === 'authenticated' && !!payload.sub) return true;
  } catch { /* */ }
  const probe = req.headers.get('x-cron-secret');
  if (!probe) return false;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/app_secrets?key=eq.cron_secret&select=value`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  const rows = r.ok ? await r.json() : [];
  return !!rows?.[0]?.value && rows[0].value === probe;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!(await loggedIn(req))) return new Response(JSON.stringify({ error: 'Entre com Google para usar a IA.' }), { status: 401, headers: J });
    const { task, context } = await req.json();
    if (task !== 'training_week') return new Response(JSON.stringify({ error: 'Tarefa desconhecida' }), { status: 400, headers: J });
    const ctx = JSON.stringify(context ?? {});
    if (ctx.length > 150000) return new Response(JSON.stringify({ error: 'Contexto grande demais' }), { status: 413, headers: J });
    const a = Deno.env.get('ANTHROPIC_API_KEY');
    const g = Deno.env.get('GEMINI_API_KEY');
    const order: { name: string; call: Call }[] = [];
    if (a) order.push({ name: 'anthropic', call: anthropic(a) });
    if (g) order.push({ name: 'gemini', call: gemini(g) });
    if (!order.length) return new Response(JSON.stringify({ error: 'A chave da IA ainda não foi configurada no Supabase.' }), { status: 503, headers: J });
    const system = [BASE, SPECIALIST, TASK].join('\n\n');
    const user = `Contexto (JSON):\n${ctx}`;
    let lastErr = '';
    for (const p of order) {
      try {
        const result = extractJson(await p.call(system, user));
        result._provedor = p.name;
        return new Response(JSON.stringify({ result, provider: p.name }), { headers: J });
      } catch (e) { lastErr += `${String((e as Error)?.message ?? e)} `; }
    }
    return new Response(JSON.stringify({ error: lastErr.trim() }), { status: 502, headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 502, headers: J });
  }
});
