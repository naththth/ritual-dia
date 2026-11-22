# Ritual - instruções do projeto

PWA pessoal da Nathalie (React + TypeScript + Vite + Dexie, sincronização com Supabase). Visão geral e regras de privacidade: `README.md`.

## Instruções existentes (leia antes de mexer)

O passo a passo de como o Claude ajusta o Ritual está em `docs/ajustes-claude.md`: onde ficam as funções do Supabase, estilo visual, verificação, publicação no `gh-pages` e como contar o resultado a ela. Leia esse arquivo no início de qualquer tarefa de código; ele continua valendo e não foi alterado.

Regras que atravessam tudo (README e `docs/ajustes-claude.md`):
- Comentários em português; textos do app em português natural, sem clichês.
- Nenhum dado pessoal no repositório. Testes usam só dados fictícios.
- Datas de calendário são `YYYY-MM-DD` locais, nunca convertidas para UTC.
- Estilo visual pelos tokens de `src/styles/app.css`; texto nunca cortado no celular.

Divergência a resolver: `docs/ajustes-claude.md` manda commitar direto em `main` e publicar o `gh-pages`. Em sessões na nuvem, siga a branch de trabalho definida pela sessão e **não publique nem faça push em `main` sem pedido explícito**.

## Comandos

| Para quê | Comando |
|---|---|
| Instalar (limpo) | `npm ci` (ou `npm install`) |
| Desenvolvimento | `npm run dev` |
| Checagem de tipos | `npx tsc --noEmit` |
| Testes unitários (Vitest, `tests/unit`) | `npm test` |
| Build (tipos + Vite, gera `dist/`) | `npm run build` |
| Pré-visualizar o build | `npm run preview` |
| Ponta a ponta (Playwright, `tests/e2e`) | `npm run build && npm run e2e` |

Notas:
- O e2e roda contra o build em `vite preview`, porta 4174, base `/ritual-dia/`, viewport de celular. Rode a suíte completa, sem filtro, antes de publicar; para iterar, rode um arquivo: `npx playwright test tests/e2e/<arquivo>.spec.ts`.
- Se o Chromium do Playwright não for o esperado, use `CHROME_PATH=/opt/pw-browsers/chromium` (e `--trace off`).
- Não há CI nem linter configurados; a verificação é `tsc` + `npm test` + `npm run build` + e2e.

## Fluxo de trabalho

1. **Ideias e melhorias:** antes de construir, defina o objetivo e os critérios de aceite (o que ela vai ver mudado e como confirmar). Se o pedido for ambíguo a ponto de um palpite errado gerar retrabalho, traga uma proposta concreta para aprovação.
2. **Tarefas pequenas:** implemente e verifique na sessão principal (`tsc`, `npm test`, e o e2e do que foi tocado).
3. **Mudanças relevantes** (lógica nova, mexe em sincronização, planos, dados ou funções do Supabase, várias telas): peça revisão ao subagente `revisor-sonnet`. Passe o objetivo, os critérios de aceite, o diff e os resultados dos testes. Ele só lê e aponta problemas; quem aplica as correções é a sessão principal, que roda os testes de novo depois.
4. **Decisões difíceis:** sugira o `especialista-opus` quando houver decisão de arquitetura, migração complexa ou bloqueio que persista após investigação. Explique o motivo da sugestão e **espere o pedido explícito dela** antes de acioná-lo.
5. **Correção repetida:** se um mesmo tipo de correção aparecer de novo, proponha registrá-la como instrução neste arquivo ou, se o comportamento for verificável, como teste de regressão (unitário em `tests/unit` ou e2e em `tests/e2e`). Proponha; não registre sem aprovação.
6. **Ao concluir:** diga o que mudou e onde ela vê, o que não foi possível testar e o que depende dela no celular.
