import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

const shot = async (page: Page, name: string) => { if (process.env.SHOTS) { await page.waitForTimeout(450); await page.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: true }); } };

// Edição fictícia: cinco notícias de lentes diferentes, sem imagem (o app desenha as capas).
const item = (k: number, lente: string, extra: Record<string, unknown> = {}) => ({
  id: `2026-11-04-${k}`, lente, titulo: `Notícia fictícia ${k} sobre um movimento de mercado que ocupa duas linhas no celular`, fonte: 'Veículo Teste', url: 'https://example.com/n' + k,
  data: '2026-11-04', minutos: 3, resumo: 'Resumo fictício com o fato, quem está envolvido e o número que importa: 42%.', porque: 'Porque muda a forma de vender tecnologia para grandes empresas.',
  impactos: [{ area: 'carreira', nivel: 'alto', texto: 'Reforça o caso medido no discurso de IA.' }, { area: 'dinheiro', nivel: 'baixo', texto: 'Sem efeito direto no bolso agora.' }],
  acao: k === 1 ? 'Levar o tema para a revisão das ofertas de IA' : '', tambem: ['Outro Veículo'], verificado: true, ...extra
});

async function seed(page: Page, at = '2026-11-04T09:00:00-03:00', withPauta = true) {
  await page.clock.setFixedTime(new Date(at));
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async ({ itens, withPauta }) => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records'], 'readwrite');
    const st = tx.objectStore('records');
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true });
    if (withPauta) st.put({ id: 'pauta:2026-11-04', kind: 'pauta', date: '2026-11-04', status: 'pronta', itens, lidas: [], createdAt: 1, updatedAt: 1, dirty: 0 });
    if (withPauta) st.put({ id: 'pauta:2026-11-03', kind: 'pauta', date: '2026-11-03', status: 'pronta', itens: itens.map((i: any) => ({ ...i, id: i.id.replace('04', '03') })), lidas: [], createdAt: 1, updatedAt: 1, dirty: 0 });
    await new Promise((r) => { tx.oncomplete = r; });
  }, { itens: [item(1, 'ia'), item(2, 'economia'), item(3, 'saude'), item(4, 'bancos'), item(5, 'mundo')], withPauta });
  await page.goto('./#/');
  await page.reload();
}

test('Pauta: recolhida no Hoje, abre pela seta, notícia completa, arquivo, salvas e ajustes', async ({ page }) => {
  await seed(page);
  const card = page.getByTestId('pauta-hoje');
  await expect(card).toContainText('Pauta do dia');
  await expect(card).toContainText('0 de 5 lidas · 15 min');
  await expect(page.getByTestId('pauta-aberta')).toHaveCount(0);
  await shot(page, 'pauta-hoje-recolhida');

  await page.getByTestId('pauta-seta').click();
  await expect(page.getByTestId('pauta-aberta')).toBeVisible();
  await expect(page.getByTestId('pauta-seta')).toHaveAttribute('aria-expanded', 'true');
  await shot(page, 'pauta-hoje-aberta');

  // Abre a manchete: conta como lida e mostra porquê, impacto e ação.
  await page.getByTestId('pauta-aberta').getByText('Notícia fictícia 1').click();
  const news = page.getByTestId('pauta-noticia');
  await expect(news).toContainText('Por que importa');
  await expect(news).toContainText('Como te afeta');
  await expect(news.getByLabel('Carreira, impacto alto')).toBeVisible();
  await expect(page.getByTestId('pauta-lida')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'pauta-noticia');
  await page.getByTestId('pauta-mais').click();
  await expect(page.getByTestId('pauta-mais')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pauta-salvar').click();
  await expect(page.getByTestId('pauta-salvar')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pauta-tarefa').click();
  await expect(page.getByTestId('pauta-tarefa')).toContainText('Está nas tarefas');
  await page.getByTestId('pauta-proxima').click();
  await expect(news).toContainText('Notícia fictícia 2');
  await expect(news).toContainText('02 / 05');

  // Menu leva à seção, com a edição, o arquivo e as salvas.
  await page.goto('./#/');
  await page.getByTestId('nav-menu').click();
  await expect(page.getByTestId('dr-pauta')).toContainText('3 novas');
  await page.getByTestId('dr-pauta').click();
  await expect(page.getByTestId('pauta-edicao')).toBeVisible();
  await expect(page.getByTestId('pauta-manchete')).toContainText('Notícia fictícia 1');
  await shot(page, 'pauta-secao');
  await page.getByTestId('pt-tab-arquivo').click();
  await expect(page.getByTestId('pauta-arquivo')).toContainText('3 de novembro');
  await page.getByTestId('pt-tab-salvas').click();
  await expect(page.getByTestId('pauta-salvas')).toContainText('Notícia fictícia 1');

  // Ajustes: muda uma lente e salva com confirmação na própria tela.
  await page.getByTestId('pauta-ajustes').click();
  await expect(page.getByTestId('pauta-settings')).toContainText('Sua Pauta, do seu jeito');
  await expect(page.getByTestId('pauta-settings')).not.toContainText('Triatlo');
  await page.getByTestId('lente-mundo').getByRole('tab', { name: 'Não' }).click();
  await page.getByTestId('lente-nova').fill('Varejo e consumo');
  await page.getByRole('button', { name: 'Criar' }).click();
  // sem botão de salvar: as mudanças gravam sozinhas
  await expect(page.getByTestId('pauta-salvo')).toContainText('Salvo às');
  await shot(page, 'pauta-ajustes');
  const prefs = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const g = db.transaction(['records']).objectStore('records').get('newsprefs');
    return await new Promise<any>((r) => { g.onsuccess = () => r(g.result); });
  });
  expect(prefs.lentes.find((l: any) => l.id === 'mundo').nivel).toBe('nao');
  expect(prefs.lentes.some((l: any) => l.nome === 'Varejo e consumo')).toBe(true);
  expect(prefs.sinais).toHaveLength(1);
});

test('Pauta: sem edição e antes do horário, o Hoje não muda', async ({ page }) => {
  await seed(page, '2026-11-04T06:00:00-03:00', false);
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await expect(page.getByTestId('pauta-hoje')).toHaveCount(0);
  await expect(page.getByTestId('pauta-vazia')).toHaveCount(0);
});
