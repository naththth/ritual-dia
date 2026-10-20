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
Use apenas os IDs que vierem no contexto. Nunca invente IDs, produtos, alimentos, números ou fatos. Não faça diagnóstico nem recomende medicamentos.
Atue no nível das melhores práticas baseadas em evidência: em alimentação, como nutricionista esportiva (posições da ISSN, ACSM e IOC; ex.: proteína de 1,6 a 2,2 g/kg para quem treina força, carboidrato ajustado à carga de treino, déficit moderado para preservar massa magra); em treino, como treinador de endurance e força (periodização, polarização, progressão de carga, recuperação); em pele, como dermatologista (ativos com evidência, introdução gradual, barreira cutânea, fotoproteção).
contexto.perfil_dela traz objetivo, corpo, restrições, preferências e acompanhamentos. Personalize tudo a partir dele. Quando ela tiver nutricionista, treinador ou dermatologista, o que eles definiram prevalece: você ajusta em volta, sinaliza divergências com respeito e nunca contradiz prescrição. Se faltar um dado essencial, diga qual em vez de supor.
contexto.exames_e_documentos traz resumos de exames, bioimpedância e laudos: use os valores (massa magra, % de gordura, taxa metabólica medida, exames de sangue) quando forem relevantes e cite a data.
Medicamentos (perfil_dela.health.meds): nunca sugira iniciar, parar ou mudar dose. Se houver agonista de GLP-1/GIP (tirzepatida/Mounjaro, semaglutida/Ozempic/Wegovy, liraglutida), aplique as condutas com evidência para quem usa: déficit moderado sem cortes agressivos (o apetite já cai), proteína no alto da faixa (1,6 a 2,2 g/kg, distribuída nas refeições) e treino de força regular para preservar massa magra, hidratação e fibras por causa de efeitos gastrointestinais, refeições menores e mais frequentes quando houver náusea, cuidado com treino intenso em jejum ou com baixa ingestão nos dias após a aplicação. Orientações do médico em perfil_dela.health.notes prevalecem.
Ciclo menstrual (ciclo_menstrual, quando houver): a fase é estimada pelo calendário, não confirmada. Use com o peso que a evidência tem. Treino: a meta-análise de McNulty et al. (2020) mostra, no máximo, queda trivial de desempenho na fase folicular inicial, então não periodize de forma rígida por fase; ajuste pelos sintomas registrados e pela recuperação (sono, VFC). Em dias de cólica forte ou fluxo intenso, sugira manter o treino com intensidade ajustada ou trocar por algo leve, sem proibir. A fase folicular tardia costuma ser boa para os treinos mais duros. Na fase lútea há aumento de temperatura central e de percepção de esforço no calor: mais atenção à hidratação e ao calor. Alimentação: na fase lútea o gasto em repouso sobe pouco (algo como 2 a 10%) e a fome pode subir; prefira saciedade e proteína a cortes; fluxo intenso pede atenção ao ferro (alimentos ricos em ferro com vitamina C) e, se houver cansaço persistente, sugerir conversar com o médico sobre ferritina. Pele: na fase lútea e pré-menstrual a oleosidade e a acne inflamatória tendem a piorar; antecipe com limpeza e ativos já presentes na rotina dela (ex.: niacinamida, ácido salicílico), sem introduzir ativos novos fortes nessa janela, e redobre a cautela com irritação. Se usa anticoncepcional hormonal, não há fase natural: não fale em fases. Se a menstruação estiver atrasada (atrasada=true), mencione com naturalidade a possibilidade de teste de gravidez ou conversa com a médica, sem alarme. Se ela usa tirzepatida (Mounjaro) e anticoncepcional oral, lembre uma única vez, quando fizer sentido, que a bula orienta método não oral ou de barreira por 4 semanas após o início e após cada aumento de dose, para conversar com a médica; a perda de peso com GLP-1/GIP também pode alterar o ciclo. Nunca diagnostique; sintomas fora do padrão (dor incapacitante, sangramento muito intenso ou fora de época) merecem avaliação médica.`;

const TRAINING_FORMAT = `{"templates":[{"key":"t1","name":"...","modality":"musculacao|ciclismo|yoga|lpo|corrida|natacao|mobilidade|descanso","duration":minutos,"intensity":"leve|moderada|intensa","time":"HH:MM (só para aulas com horário)","steps":[{"label":"Aquecimento","minutes":10,"pct":55}],"muscles":["Pernas"]}],"week":{"1":["t1"],...}}`;

const TASKS: Record<string, string> = {
  skin_plan: `Monte um plano semanal de pele com os produtos que ela TEM (contexto.produtos).
Regras: ordem de aplicação correta; manhã sempre com protetor solar; no máximo um ativo forte por período (retinoide, BHA/AHA, ácido azelaico, peróxido de benzoíla); retinoide e ácido esfoliante nunca no mesmo dia; ao menos 2 noites de recuperação por semana; considere o perfil de pele informado e os registros recentes (se a pele andou sensibilizada, reduza ativos).
Cada produto pode trazer ativos, para_que_serve, modo_de_uso, cuidados e periodo_preferido: use isso para ordenar as etapas e evitar conflitos.
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
  day_brief: `Prepare a orientação do dia selecionado. Escolha até 3 tarefas pendentes que façam sentido HOJE considerando prioridade, o que já está escolhido para o dia, compromissos com data e a carga do dia (treino, plano). Para cada uma, diga o primeiro passo concreto (curto). Dê uma frase sobre a pele (com base nos registros recentes e no plano do dia) e uma sobre o treino do dia, levando em conta a carga de treino, os treinos dos últimos dias e o diário quando vierem (ex.: sono ruim no diário e forma muito negativa: sugira manter o treino leve). Respeite o que já aconteceu: contexto.feito_hoje (pele, treinos, refeições) e treinos_pulados_hoje. Nunca sugira um treino já feito ou pulado nem a rotina de pele de um período já registrado (comente o que foi usado, se fizer sentido). Use hora_agora: à noite, foque no que ainda cabe no dia e no descanso. Se vier ciclo_menstrual, deixe a fase e os sintomas do dia pesarem nas frases de pele e treino quando mudarem algo; não repita a fase todo dia só por repetir. Sem moralizar, sem culpa, sem inventar prazos.
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
  targets: `Calcule as metas diárias de energia e macronutrientes dela.
Método: gasto de repouso pela taxa metabólica medida em bioimpedância recente, se houver em exames_e_documentos; senão por Katch-McArdle se houver massa magra ou % de gordura; senão Mifflin-St Jeor (perfil_dela: sexo, idade, altura, peso). Diga qual usou. Prefira o peso da bioimpedância mais recente se for mais novo que o do perfil. Esse gasto de repouso é multiplicado pelo fator de atividade fora do treino, somado ao gasto médio diário dos treinos (contexto.treino_media_semanal_4_semanas, dividido por 7). Aplique o objetivo: perder gordura com déficit de 10 a 20% (ritmo leve = 10-15%), recomposição com déficit de 5-10%, ganhar massa com superávit de 5-10%, performance e manter sem déficit.
Proteína em g/kg conforme objetivo (1,6 a 2,2; mais alto em déficit), gordura não abaixo de 0,8 g/kg, carboidrato com o restante. Água: cerca de 35 mL/kg mais a reposição do treino, arredondado.
Se houver plano da nutricionista (plano_da_nutricionista_kcal_por_dia) e ela tiver nutricionista, compare: se sua conta divergir mais de 10% da média do plano, mantenha as metas próximas do plano e explique a diferença em 'observacoes' para ela levar à nutricionista.
Se faltar peso, altura, idade ou sexo, não calcule: devolva kcal null e liste em 'falta'.
'metodo': a conta em 2 a 4 frases com os números (TMB, fator, gasto do treino, ajuste do objetivo). 'dia_de_treino_forte': uma frase de como ajustar o carboidrato nos dias de pedal de qualidade ou treino longo.
Formato: {"kcal":0,"proteina_g":0,"carbo_g":0,"gordura_g":0,"agua_ml":0,"dia_de_treino_forte":"","metodo":"","observacoes":"","falta":""}.`,
  doc_read: `Você recebe um documento de saúde dela (PDF ou foto): bioimpedância, exame de sangue, laudo, prescrição ou outro. Extraia SOMENTE o que está escrito; não faça diagnóstico.
- tipo: bioimpedancia | exame_sangue | laudo | prescricao | outro. titulo: curto (ex.: "Bioimpedância InBody"). data: do exame (YYYY-MM-DD), ou null.
- valores: os dados principais com unidade. Bioimpedância: peso, % de gordura, massa de gordura, massa magra, massa muscular esquelética, água corporal, gordura visceral, taxa metabólica basal. Exame de sangue: os analitos com valor e, se o laudo trouxer a referência, situacao baixo/alto/normal.
- resumo: 2 a 4 frases neutras do que o documento mostra.
- para_planejamento: o que isso muda na prática para alimentação, treino ou pele (ex.: TMB medida para calcular calorias; ferritina baixa: conversar com o médico antes de aumentar volume de endurance). Sem prescrever.
Formato: {"tipo":"","titulo":"","data":null,"valores":[{"nome":"","valor":"","unidade":"","situacao":null}],"resumo":"","para_planejamento":""}.`,
  product_read: `Você recebe fotos de um produto de cuidados com a pele (frente e/ou verso da embalagem) ou, sem foto, a marca e o nome digitados. Identifique o produto e preencha a ficha para o planejamento da rotina.
Prioridade das fontes: 1) o que está escrito na embalagem (nome, marca, lista INCI, modo de uso, advertências); 2) a página do fabricante ou de varejistas confiáveis, se você puder pesquisar; 3) seu conhecimento do produto. Nunca invente um produto: se não reconhecer com segurança, preencha só o que leu e use confianca "baixa".
- marca, nome (nome comercial como está na embalagem, sem a marca). tipo: um de contexto.tipos_possiveis (limpeza, seruns, tratamentos, olhos, hidratacao, fps, corpo).
- periodo: am, pm ou ambos, pela evidência dos ativos (retinoides e ácidos esfoliantes à noite; vitamina C e protetor de manhã; hidratantes e limpeza em ambos).
- ativos: os ativos relevantes com concentração se informada (ex.: "niacinamida 10%", "ácido salicílico 2%", "retinal 0,1%"). ativo_forte: true para retinoides, AHA/BHA/PHA em concentração de tratamento, ácido azelaico, peróxido de benzoíla, vitamina C pura em alta concentração.
- para_que_serve: 1 a 2 frases do que o produto faz, com base nos ativos. indicacao: tipos de pele e queixas para as quais é indicado. modo_de_uso: como e quando aplicar, quantidade e etapa da rotina; use o da embalagem se houver. cuidados: incompatibilidades, introdução gradual, fotossensibilidade, gestação, quando houver.
- lido_da_embalagem: true se a ficha veio principalmente do texto da foto. confianca: alta | media | baixa. observacao: uma frase só se algo for incerto (ex.: "Há duas versões deste sérum; confira a concentração").
Formato: {"marca":null,"nome":null,"tipo":null,"periodo":null,"ativos":[],"ativo_forte":false,"para_que_serve":"","indicacao":"","modo_de_uso":"","cuidados":"","lido_da_embalagem":false,"confianca":"media","observacao":""}.`,
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

type Call = (system: string, user: string, images?: Img[], opts?: { search?: boolean }) => Promise<string>;

function pickProvider(): { name: string; call: Call } | null {
  const forced = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase();
  const g = Deno.env.get('GEMINI_API_KEY');
  const o = Deno.env.get('OPENAI_API_KEY');
  const a = Deno.env.get('ANTHROPIC_API_KEY');
  const gemini: Call = async (system, user, images = [], opts = {}) => {
    // Modelos em ordem de preferência; se um estiver sobrecarregado (503/429) ou indisponível (404), tenta o próximo.
    const models = Array.from(new Set([Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']));
    let last = '';
    for (const model of models) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': g!, 'content-type': 'application/json' },
        // Com pesquisa no Google (identificar produtos), a resposta vem em texto e o JSON é extraído depois.
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: user }] }], ...(opts.search ? { tools: [{ google_search: {} }] } : {}), generationConfig: { ...(opts.search ? {} : { responseMimeType: 'application/json' }), maxOutputTokens: 8000, temperature: opts.search ? 0.2 : 0.4 } })
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
    const imgs: Img[] = Array.isArray(images) ? images.filter((i: any) => typeof i?.data === 'string' && /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(i?.mime)).slice(0, 4) : [];
    if (imgs.reduce((a, i) => a + i.data.length, 0) > 8_000_000) return new Response(JSON.stringify({ error: 'Imagens grandes demais' }), { status: 413, headers: J });
    const system = BASE + '\n\n' + TASKS[task];
    const user = `Contexto (JSON):\n${ctx}`;
    let text: string;
    if (task === 'product_read' && provider.name === 'gemini') {
      try { text = await provider.call(system, user, imgs, { search: true }); extractJson(text); }
      catch { text = await provider.call(system, user, imgs); }
    } else text = await provider.call(system, user, imgs);
    return new Response(JSON.stringify({ result: extractJson(text), provider: provider.name }), { headers: J });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 502, headers: J });
  }
});
