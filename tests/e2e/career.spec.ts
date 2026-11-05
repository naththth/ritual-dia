import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      if (task === 'career_coach') return { mensagem: 'Começa pela proposta: ela destrava as outras duas.', rascunho: 'Dado sem direção é ruído.', acoes: [{ tipo: 'nova_tarefa', texto: 'Revisar a proposta comercial', data: '2026-11-05', prioridade: 'alta' }] };
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

test('menu lateral leva a todas as áreas e a Carreira organiza trabalho, marca, conquistas e oportunidades', async ({ page }) => {
  await seed(page);
  // Barra de baixo: as quatro áreas mais usadas e o Menu.
  await expect(page.locator('.bottomnav')).toContainText('Treino');
  await expect(page.locator('.bottomnav')).not.toContainText('Mente');
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

  // Entregue vira conquista.
  await page.getByRole('checkbox', { name: 'Concluir Mandar a proposta revisada' }).click();
  await page.getByTestId('work-done-toggle').click();
  await page.getByRole('button', { name: /Virou conquista/ }).click();
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Conquistas' }).click();
  await expect(page.getByTestId('win-row')).toContainText('Mandar a proposta revisada');
  await page.getByTestId('win-title').fill('Estruturei o funil de prospecção');
  await page.getByTestId('win-impact').fill('+30% de reuniões qualificadas');
  await page.getByTestId('win-add').click();
  await expect(page.getByTestId('win-row')).toHaveCount(2);

  // Marca: base e pautas.
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Marca' }).click();
  await page.getByTestId('base-edit').click();
  await page.getByTestId('base-posicionamento').fill('Transformo dado de mercado em direção comercial.');
  await page.getByTestId('base-pilares').fill('Inteligência de mercado\nEstratégia comercial');
  await page.getByTestId('base-edit').click();
  await expect(page.getByTestId('brand-base')).toContainText('Transformo dado de mercado');
  await expect(page.getByTestId('brand-base')).toContainText('Estratégia comercial');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/carreira-marca.png', fullPage: true });

  // Oportunidades e desenvolvimento.
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Oportunidades' }).click();
  await page.getByTestId('opp-title').fill('Gerente de Growth');
  await page.getByPlaceholder('Empresa').fill('Beta');
  await page.getByTestId('opp-add').click();
  await page.getByTestId('opp-row').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Em processo' }).click();
  await expect(page.getByTestId('opp-row')).toContainText('Em processo');
  await page.getByTestId('area-nav-carreira').getByRole('tab', { name: 'Desenvolvimento' }).click();
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
  expect(ctx.conquistas.length).toBe(2);
  expect(ctx.oportunidades[0].etapa).toBe('processo');
  expect(ctx.base_da_carreira.empresa_atual).toBe('Acme');
});

test('captura rápida do PC: anota com dia e horário em trabalho ou pessoal', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records'], 'readwrite');
    const st = tx.objectStore('records');
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'cat:trabalho', kind: 'category', name: 'Trabalho Acme', labels: { alta: 'Urgente', media: 'Importante', baixa: 'Quando der' }, subcategories: [], order: 0 });
    st.put({ ...base, id: 'careerbase', kind: 'careerbase', workName: 'Acme', workCategoryId: 'cat:trabalho' });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('./#/captura');
  await expect(page.getByTestId('capture-screen')).toBeVisible();
  await expect(page.getByTestId('qa-title')).toBeFocused();
  await page.getByTestId('qa-title').fill('Pauta do 1:1 da equipe');
  await page.getByRole('button', { name: 'Amanhã' }).click();
  await page.getByTestId('qa-time').fill('08:45');
  await page.getByTestId('qa-add').click();
  await expect(page.getByTestId('capture-screen')).toContainText('Pauta do 1:1 da equipe');
  await expect(page.getByTestId('capture-screen')).toContainText('às 08:45');
  await page.getByRole('button', { name: 'Pessoal' }).click();
  await page.getByTestId('qa-title').fill('Marcar dentista');
  await page.getByTestId('qa-title').press('Enter');
  await expect(page.getByTestId('capture-screen')).toContainText('Marcar dentista');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/captura-pc.png' });
});
