import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      if (task === 'career_coach') return { mensagem: 'Começa pela proposta: ela destrava as outras duas.', rascunho: 'Dado sem direção é ruído.', acoes: [{ tipo: 'nova_tarefa', texto: 'Revisar a proposta comercial', data: '2026-11-05', prioridade: 'alta' }] };
      if (task === 'career_picks') {
        const n = Number(sessionStorage.getItem('picks') ?? 0) + 1;
        sessionStorage.setItem('picks', String(n));
        return {
          noticia: { titulo: `Notícia de teste ${n}`, fonte: 'Valor', data: '2026-11-03', url: 'https://example.com/noticia', resumo: 'Resumo com um número: 42%.', porque: 'Liga com o pilar de IA aplicada.', verificado: true },
          artigo: { titulo: 'Artigo de fundo', fonte: 'HBR', url: 'https://www.google.com/search?q=artigo', resumo: 'Método em três passos.', porque: 'Serve à sua frente de prospecção.', verificado: false },
          livro: { titulo: 'Livro de teste', autor: 'Autora Teste', ano: '2024', sinopse: 'Sinopse curta.', porque: 'Conecta dado e venda.' }
        };
      }
      return {};
    };
  });
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records'], 'readwrite');
    const st = tx.objectStore('records');
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
}

test('menu lateral leva a todas as áreas e a Carreira organiza trabalho, marca e desenvolvimento', async ({ page }) => {
  await seed(page);
  // Barra de baixo: as quatro áreas mais usadas e o Menu.
  await expect(page.locator('.bottomnav')).toHaveCount(0);
  await page.getByTestId('nav-menu').click();
  await expect(page.getByTestId('drawer')).toContainText('Alimentação');
  if (process.env.SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: '/tmp/shots/menu.png' }); }
  await page.getByTestId('dr-carreira').click();
  await expect(page.getByTestId('drawer')).toHaveCount(0);

  // Primeira vez: nome da empresa vira a aba e a categoria.
  await page.getByPlaceholder('Nome da empresa').fill('Acme');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByTestId('area-nav-carreira')).toContainText('Acme');

  // Anota com lembrete.
  await page.getByTestId('qa-title').fill('Mandar a proposta revisada');
  await page.getByTestId('qa-time').fill('10:30');
  await page.getByTestId('qa-title').press('Enter');
  await expect(page.getByTestId('area-carreira')).toContainText('Hoje e atrasadas');
  await expect(page.getByTestId('task-row')).toContainText('Mandar a proposta revisada');
  const t = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const g = db.transaction('records').objectStore('records').getAll(); g.onsuccess = () => r(g.result); });
    return all.find((x) => x.kind === 'task' && x.title === 'Mandar a proposta revisada');
  });
  expect(t.remindAt).toBe('10:30');
  expect(t.plannedDate).toBe('2026-11-04');
  expect(t.categoryId).toBe('cat:trabalho');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/carreira-trabalho.png', fullPage: true });

  // Conquistas e Oportunidades saíram: só Trabalho, Marca e Desenvolvimento.
  await expect(page.getByTestId('area-nav-carreira').getByRole('tab')).toHaveText(['Acme', 'Marca', 'Desenvolvimento']);

  // Marca: base e pautas.
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Marca' }).click();
  await page.getByTestId('base-edit').click();
  await page.getByTestId('base-posicionamento').fill('Transformo dado de mercado em direção comercial.');
  await page.getByTestId('base-pilares').fill('Inteligência de mercado\nEstratégia comercial');
  await page.getByTestId('base-edit').click();
  await expect(page.getByTestId('brand-base')).toContainText('Transformo dado de mercado');
  await expect(page.getByTestId('brand-base')).toContainText('Estratégia comercial');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/carreira-marca.png', fullPage: true });

  // Desenvolvimento.
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Desenvolvimento' }).click();
  await expect(page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Desenvolvimento' })).toBeInViewport();
  await page.getByTestId('dev-title').fill('Curso de pricing');
  await page.getByTestId('dev-add').click();
  await page.getByRole('button', { name: 'Comecei' }).click();
  await expect(page.getByTestId('area-carreira-crescer')).toContainText('Fazendo');

  // Especialista de carreira: lê tudo e anota a tarefa que propôs.
  await page.getByTestId('spec-open-career').click();
  await page.getByTestId('spec-input').fill('Me ajuda a priorizar a semana');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByTestId('spec-career-chat')).toContainText('Começa pela proposta');
  await expect(page.getByTestId('career-draft')).toContainText('Dado sem direção é ruído');
  await expect(page.getByTestId('spec-career-chat')).toContainText('Tarefa: Revisar a proposta comercial');
  const ctx = await page.evaluate(() => (window as any).__ctx.career_coach);
  expect(ctx.base_da_carreira.posicionamento).toContain('Transformo dado');
  expect(ctx.base_da_carreira.empresa_atual).toBe('Acme');
});

test('captura rápida saiu: o endereço antigo leva à Carreira e o menu não mostra mais', async ({ page }) => {
  await seed(page);
  await page.goto('./#/captura');
  await expect(page.getByTestId('area-carreira')).toBeVisible();
  await page.getByTestId('nav-menu').click();
  await expect(page.getByText('Captura rápida')).toHaveCount(0);
});

/** Posts do LinkedIn com dados fictícios: programados com imagem e carrossel, publicado com alcance. */
async function seedPosts(page: Page, recs?: any[]) {
  await page.evaluate(async (given) => {
    // imagem mínima gerada no próprio navegador
    const c = document.createElement('canvas'); c.width = 40; c.height = 50;
    const g = c.getContext('2d')!; g.fillStyle = '#3b1f4f'; g.fillRect(0, 0, 40, 50);
    const img = c.toDataURL('image/jpeg');
    const list = given ?? [
      { id: 'post:a', data: { title: 'Pauta programada com uma arte', status: 'agendado', date: '2026-11-11', pilar: 'Dados', text: 'Primeira linha do post.\n\nSegunda parte do texto completo.', images: [img] } },
      { id: 'post:b', data: { title: 'Carrossel programado', status: 'agendado', date: '2026-11-25', pilar: 'Vendas', text: 'Texto do carrossel.', images: [img, img, img] } },
      { id: 'post:c', data: { title: 'Post já publicado', status: 'publicado', date: '2026-11-04', pilar: 'Vendas', text: 'Texto publicado.', imageNote: 'Arte de imagem única.', metrics: { impressoes: 182, usuarios_alcancados: 113, impressoes_na_rede_pct: 66, demografia_principal: { localidade: { valor: 'São Paulo e Região', pct: 28 } } } } }
    ];
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records'], 'readwrite');
    for (const r of list) tx.objectStore('records').put({ ...r.data, id: r.id, kind: 'post', deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 });
    const sg = tx.objectStore('records').get('settings');
    await new Promise((r) => { sg.onsuccess = r; });
    tx.objectStore('records').put({ ...sg.result, brand: { ...(sg.result.brand ?? {}), profile: { date: '2026-11-06', impressoes7d: 247, impressoes7dVar: 187, seguidores: 2550, seguidoresVar: '-1%', visitas90d: 90, visitas90dVar: -67, buscas: 29, buscasPeriodo: '27/10 a 02/11' } } });
    await new Promise((r) => { tx.oncomplete = r; });
  }, recs);
}

test('LinkedIn: programados e publicados com miniatura, texto completo, carrossel e alcance', async ({ page }) => {
  await seed(page);
  await seedPosts(page);
  await page.goto('./#/carreira/marca');
  await expect(page.getByTestId('li-profile')).toContainText('2.550');
  await expect(page.getByTestId('li-profile')).toContainText('+187%');
  await expect(page.getByTestId('post-next')).toContainText('Pauta programada com uma arte');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/li-perfil.png' });
  await expect(page.getByTestId('post-row')).toHaveCount(2);
  await expect(page.getByTestId('post-row').nth(1)).toContainText('carrossel de 3');
  await page.getByTestId('post-row').nth(1).click();
  await expect(page.getByTestId('post-sheet').locator('.li-gallery img')).toHaveCount(3);
  await expect(page.getByTestId('post-sheet')).toContainText('1 de 3');
  await page.getByTestId('post-sheet').getByLabel('Fechar').click();
  await page.getByRole('button', { name: /^Publicados/ }).click();
  await expect(page.getByTestId('post-row')).toContainText('182 impressões - 113 pessoas');
  await page.getByTestId('post-row').click();
  await expect(page.getByTestId('post-text')).toContainText('Texto publicado.');
  await expect(page.getByTestId('post-metrics')).toContainText('São Paulo e Região');
  // Sem horizontal: nada passa da largura do celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId('post-sheet').getByLabel('Fechar').click();
  await page.getByRole('button', { name: /^Pautas/ }).click();
  await page.getByTestId('post-new').fill('Ideia nova');
  await page.getByLabel('Adicionar pauta').click();
  await expect(page.getByTestId('post-row')).toContainText('Ideia nova');
});

test('zz-local: prints com os posts reais (não vai para o repositório)', async ({ page }) => {
  test.skip(!process.env.REAL_POSTS, 'só com REAL_POSTS');
  const fs = await import('node:fs');
  await seed(page);
  await seedPosts(page, JSON.parse(fs.readFileSync(process.env.REAL_POSTS!, 'utf8')));
  await page.goto('./#/carreira/marca');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/shots/li-lista.png', fullPage: true });
  await page.getByTestId('post-row').nth(2).click(); await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/shots/li-carrossel.png' });
  await page.getByTestId('post-sheet').getByLabel('Fechar').click();
  await page.getByRole('button', { name: /^Publicados/ }).click();
  await page.getByTestId('post-row').click(); await page.waitForTimeout(600);
  await page.locator('.sheet').evaluate((el) => el.scrollTo(0, 99999)); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shots/li-publicado.png' });
});

test('Desenvolvimento: a especialista traz notícia, artigo e livro da semana, e o livro vai para Quero ler', async ({ page }) => {
  await seed(page);
  await page.route('**/books/v1/volumes**', (r) => r.fulfill({ json: { items: [{ id: 'g1', volumeInfo: { title: 'Livro de teste', authors: ['Autora Teste'], pageCount: 240, imageLinks: { thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } } }] } }));
  await page.goto('./#/carreira/crescer');
  // Sem pedir: na primeira visita da semana as sugestões chegam sozinhas.
  await expect(page.getByTestId('pick-noticia')).toContainText('Notícia de teste 1');
  await expect(page.getByTestId('pick-noticia')).toContainText('Ler');
  await expect(page.getByTestId('pick-artigo')).toContainText('Buscar o texto');
  await expect(page.getByTestId('pick-livro')).toContainText('Autora Teste');
  const ctx = await page.evaluate(() => (window as any).__ctx.career_picks);
  expect(ctx.hoje).toBe('2026-11-04');
  expect(ctx.ja_sugerido).toEqual([]);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/dev-picks.png', fullPage: true });
  await page.getByTestId('pick-want').click();
  await expect(page.getByTestId('pick-livro')).toContainText('Está na sua Leitura');
  const book = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
    return all.find((x) => x.kind === 'book');
  });
  expect(book).toMatchObject({ title: 'Livro de teste', status: 'quero_ler', googleId: 'g1', pages: 240 });
  // Recarregar não busca de novo na mesma semana; "Outras" troca.
  await page.reload();
  await expect(page.getByTestId('pick-noticia')).toContainText('Notícia de teste 1');
  await page.getByTestId('picks-again').click();
  await expect(page.getByTestId('pick-noticia')).toContainText('Notícia de teste 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('DBC: tarefas do Google Tasks aparecem e concluir marca lá também; sem conexão, oferece conectar', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { connected: sessionStorage.getItem('gt-off') ? false : true, done: [] as string[] };
    (window as any).__gtDone = state.done;
    (window as any).__RITUAL_TEST_GTASKS = (action: string, body: any) => {
      if (!state.connected) return { status: 'not_connected' };
      if (action === 'complete') { state.done.push(body.id); return { ok: true }; }
      return { status: 'ok', tasks: [
        { id: 't1', list: 'L1', listName: 'Minhas tarefas', title: 'Revisar a apresentação da diretoria', due: '2026-11-05' },
        { id: 't2', list: 'L1', listName: 'Minhas tarefas', title: 'Pauta do 1:1 com a equipe', notes: 'Levar números de prospecção' }
      ].filter((t) => !state.done.includes(t.id)) };
    };
  });
  await seed(page);
  await page.goto('./#/carreira');
  await page.getByPlaceholder('Nome da empresa').fill('DBC');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByTestId('gtask-row')).toHaveCount(2);
  await expect(page.getByTestId('gtasks')).toContainText('Minhas tarefas - qui, 05/11');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/gtasks.png', fullPage: true });
  await page.getByLabel('Concluir Revisar a apresentação da diretoria').click();
  await expect(page.getByTestId('gtask-row')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__gtDone)).toEqual(['t1']);
  // Sem conexão: aparece o convite para conectar.
  await page.evaluate(() => sessionStorage.setItem('gt-off', '1'));
  await page.reload();
  await expect(page.getByTestId('gtasks-connect')).toBeVisible();
});

test('o + flutua no canto inferior direito em qualquer tela, sai onde há barra de salvar, e abre o Registrar', async ({ page }) => {
  await seed(page);
  const vp = page.viewportSize()!;
  for (const route of ['./#/', './#/carreira/marca', './#/treino']) {
    await page.goto(route);
    const plus = page.getByTestId('fab');
    await expect(plus).toBeVisible();
    await expect(page.locator('.topbar').getByTestId('fab')).toHaveCount(0);
    const b = (await plus.boundingBox())!;
    expect(vp.width - (b.x + b.width)).toBeLessThan(40);
    expect(vp.height - (b.y + b.height)).toBeLessThan(60);
    if (process.env.SHOTS && route === './#/') await page.screenshot({ path: '/tmp/shots/fab.png' });
  }
  await page.goto('./#/pele');
  await expect(page.locator('.save-bar')).toBeVisible();
  await expect(page.getByTestId('fab')).toBeHidden();
  await page.goto('./#/');
  await page.getByTestId('fab').click();
  await expect(page.getByTestId('reg-coffee')).toBeVisible();
});
