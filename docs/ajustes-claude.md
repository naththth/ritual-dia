# Ajustes do Ritual pelo Claude

Como o Claude faz ajustes no Ritual. A Nathalie pede o ajuste direto na conversa com o Claude (no claude.ai ou no Claude Code), com texto e prints. As sessões de ajuste dentro do app foram encerradas: a aba lateral com a chave saiu. O que sobrou delas (registros `devreq`, ações `dev_ping` e `dev_finish` da `ritual-svc` e a seção de assistente em Ajustes) é legado e não faz parte do fluxo.

## Onde estão as coisas

- Código: este repositório (naththth/ritual-dia). React + TypeScript + Vite + Dexie; PWA. Siga o README: comentários em português, nada de dado pessoal no repositório, datas YYYY-MM-DD locais.
- App publicado: GitHub Pages, branch `gh-pages`, sem CI.
- Banco e servidor: Supabase, projeto `bgpnnlumyiqxgkqjicbn` (ferramentas do conector Supabase; carregue com ToolSearch se estiverem adiadas). Dados em `public.records` (discriminador `kind`, `data` em JSONB, exclusão lógica em `deleted`).
- Funções em `supabase/functions`:
  - `ritual-ai` (verify_jwt true): especialistas de treino, alimentação e pele.
  - `ritual-mind` (verify_jwt true): Mente, leitura semanal, rituais da manhã e da noite, Carreira e curadoria do Desenvolvimento.
  - `ritual-food` (verify_jwt true): busca de alimentos e fotos de produtos.
  - `ritual-gtasks` (verify_jwt true): Google Tasks na aba DBC.
  - `ritual-svc` (verify_jwt false, autenticação própria por `x-cron-secret`): cron, lembretes e intervals.icu.
- Acesso no claude.ai: o repositório é público e clona sem credencial; o push usa um token fine-grained (só este repositório) guardado em `public.app_secrets`, chave `github_pat`, legível só pelo conector do Supabase. Leia por SQL, grave em `~/.git-credentials` sem exibir e filtre `github_pat_` de toda saída. Se o push falhar por credencial, o token venceu: peça a ela um novo, gravado direto no Supabase.

## Passo a passo

1. Entenda o pedido. Se for ambíguo a ponto de um palpite errado dar retrabalho grande, ou se mudar dados dela de forma irreversível, traga uma proposta concreta para ela aprovar antes de construir.

2. Implemente com cuidado de produto: ela é exigente com clareza, estética e textos em português natural, sem clichês. Mantenha o estilo visual (tokens em `src/styles/app.css`). Em cards lado a lado, textos alinhados na mesma altura; texto em português nunca cortado no celular. Prompts da IA ficam nas funções correspondentes.

3. Verifique antes de publicar: `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build` e `npx playwright test` completo, sem filtro (roda contra o build, em preview). Tire print da tela mudada (`SHOTS=1`) e confira. Se o Chromium do Playwright não bater com a versão esperada, aponte `CHROME_PATH` ou crie um link simbólico em `/opt/pw-browsers/`. Escreva ou ajuste um teste quando a mudança tiver lógica, sempre com dados fictícios.

4. Publique (ela pediu publicação direta quando os testes passam):
   - Commit direto em `main`, mensagem em português, e push normal.
   - App: `npm run build`; clone a branch `gh-pages` numa pasta temporária (`git clone --branch gh-pages --single-branch`), apague tudo nela (`git rm -rq .`), copie o conteúdo de `dist` e garanta `.nojekyll`; confira que os arquivos fora de `assets/` são os mesmos da publicação anterior; commit e `git push` normal. Nunca use push forçado.
   - Função alterada: antes, confira com `get_edge_function` que a versão publicada bate com a do repositório (se não bater, não sobrescreva: avise). Publique com `deploy_edge_function`, conteúdo completo e o verify_jwt de sempre. Depois, baixe a publicada e compare byte a byte com o repositório.
   - Estrutura do banco só com `apply_migration` e só se indispensável. Dados grandes demais para SQL: tabela temporária só de entrada, apagada na mesma operação, com aprovação dela.

5. Valide contra os dados reais dela (SQL em `public.records`) quando fizer sentido, não só contra dados de teste.

6. Conte a ela, em português e sem jargão: o que mudou e onde ela vê, o que não deu para testar e o que depende dela no celular (em geral, atualizar o app quando aparecer o aviso de versão nova).
