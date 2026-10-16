# Ritual

Aplicativo pessoal (PWA) que organiza o dia em uma única data: tarefas, pele (manhã, noite e corpo), alimentação, água, treino, hábitos e metas. Planos semanais de pele, treino e alimentação geram a sugestão de cada dia; você confirma, troca ou dispensa.

## Privacidade

- **Este repositório não contém dados pessoais.** O arquivo de importação privada é lido pelo próprio app, no aparelho, durante as boas-vindas. Ele está bloqueado no `.gitignore`.
- O app publicado é uma casca vazia. Os dados ficam no aparelho (IndexedDB) e, ao entrar com Google, numa base Supabase privada com regras de acesso por usuário (RLS). As fotos da pele ficam num bucket privado, acessível só com o login.
- A chave do Supabase em `.env.production` é a chave pública (publishable), feita para ficar no cliente. A proteção vem das regras de acesso.

## Como funciona por dentro

- React + TypeScript + Vite, `vite-plugin-pwa` (service worker, manifest, funcionamento offline).
- Dexie (IndexedDB) como fonte local; sincronização com a tabela `records` do Supabase. Vale a edição mais recente de cada registro.
- Datas de calendário são sempre `YYYY-MM-DD` locais. Nunca são convertidas para UTC.
- Planos têm versão com data de início: mudar o plano hoje não altera o que os dias anteriores mostram.

## Rodar e testar

```bash
npm install
npm run dev          # desenvolvimento
npm test             # testes unitários (regras de data, planos, hábitos, sugestão, importação, backup)
npm run build && npm run e2e   # testes de ponta a ponta no celular (360, 393 e 430 px)
```

## Publicar

```bash
npm run build
# publicar a pasta dist na branch gh-pages (GitHub Pages)
```

## Instalar no Android

1. Abra o endereço publicado no Chrome do celular.
2. Toque no menu ⋮ e depois em **Instalar app** (ou use o botão Instalar em Ajustes).
3. Abra o Ritual pela tela inicial, entre com Google e importe o arquivo de dados.
