import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

/** Base com dois itens (manhã e noite), meta de deitar em etapas e uma IA simulada. */
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-04T07:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      if (task === 'mind_care') return { leitura: 'Dia pesado e humor abaixo do seu normal.', respiracao: { nome: 'Expiração longa', porque: 'Desacelera.', fases: [{ acao: 'Inspire pelo nariz', segundos: 2 }, { acao: 'Solte devagar', segundos: 3 }], ciclos: 4 }, frase: 'Hoje o ritmo é mais lento, e tudo bem.', musicas: [{ titulo: 'Weightless', artista: 'Marconi Union', porque: 'calma' }], pequeno_passo: 'Beba um copo de água.' };
      if (task === 'mind_coach') return { mensagem: 'Semana estável, com o sono como ponto de atenção.', pauta_consulta: ['Sono começando depois das 23h', 'Humor estável nas últimas noites'], acoes: [] };
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
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: Date.now() };
    st.put({ ...base, id: 'intake:a', kind: 'intake', name: 'Vitamina D', type: 'vitamina', dose: '1 cápsula', times: ['06:40'], active: true, order: 1, stock: 4 });
    st.put({ ...base, id: 'wtemplate:pedal', kind: 'wtemplate', name: 'Pedal Z2', modalityId: 'mod:ciclismo', duration: 65, intensity: 'leve' });
    st.put({ ...base, id: 'plan:tr', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 3: ['wtemplate:pedal'] } });
    st.put({ ...base, id: 'skip:hoje', kind: 'skip', date: '2026-11-04', domain: 'training', ref: 'wtemplate:pedal' });
    st.put({ ...base, id: 'intake:b', kind: 'intake', name: 'Remédio da noite', type: 'medicamento', dose: '1 cápsula', times: ['20:00'], active: true, order: 2 });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true, reminders: { ...(g.result.reminders ?? {}), enabled: true, sleep: { wake: '06:00', hours: 8, latency: 15, alarm: true, bed: true, bedGoal: '22:00', bedFinal: '21:30' } } });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
}

test('Mente: tomadas no Hoje, café com horário, sem PIN, check-in, painel e relatório', async ({ page }) => {
  await seed(page);
  // Hoje: um único +, que reúne tudo (inclusive café); a tomada aparece na linha do tempo.
  await expect(page.getByTestId('mind-today')).toHaveCount(0);
  await expect(page.getByTestId('ritual-pills')).toHaveCount(0);
  await expect(page.locator('.water-plus')).toHaveCount(1);
  await page.getByTestId('fab').click();
  await page.getByTestId('reg-coffee').click();
  // O horário começa em agora e dá para trocar antes de anotar (tocando direto na bebida, sem fechar o teclado).
  const hora = page.getByTestId('coffee-sheet').getByLabel('Horário do café');
  await expect(hora).toHaveValue('07:30');
  await hora.fill('0650');
  await page.getByTestId('drink-cap-3c').click();
  await page.getByTestId('act-dose-06:40').click();
  await expect(page.getByTestId('act-dose-06:40')).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-hoje.png', fullPage: true });

  // Aba Mente: abre direto, sem PIN.
  await page.getByTestId('nav-menu').click();
  await page.getByTestId('dr-mente').click();
  await expect(page.getByTestId('pin-create')).toHaveCount(0);
  await expect(page.getByTestId('doses')).toContainText('Tomei às 07:30');
  await expect(page.getByTestId('doses')).toContainText('restam cerca de 3 dias');
  await expect(page.getByTestId('sleep-stage')).toContainText('Deitar às 22:00');
  await expect(page.getByTestId('sleep-stage')).toContainText('Café só até as 14:00');
  await expect(page.getByTestId('coffee')).toContainText('65 mg');
  await expect(page.getByTestId('coffee')).toContainText('Último às 06:50');
  // Corrige o horário de um café já anotado.
  await page.getByTestId('coffee').click();
  await page.getByTestId('coffee-sheet').getByLabel(/^Horário do Espresso/).fill('0710');
  await page.getByTestId('coffee-sheet').getByLabel(/^Horário do Espresso/).press('Enter');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-cafe.png' });
  await page.getByTestId('coffee-sheet').getByLabel('Fechar').click();
  await expect(page.getByTestId('coffee')).toContainText('Último às 07:10');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-tela.png', fullPage: true });

  // Check-in da noite.
  await page.getByTestId('checkin-pm').click();
  await page.getByTestId('mood-1').click();
  await page.getByTestId('energy-3').click();
  await page.getByText('Dia pesado').click();
  await page.getByTestId('checkin-note').fill('Reunião longa');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-checkin.png', fullPage: true });
  await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('checkin-pm')).toContainText('Humor +1');
  await page.getByRole('tab', { name: 'Painel' }).click();
  await expect(page.getByTestId('baseline')).toContainText('1 de 20 noites');
  await page.getByRole('tab', { name: 'Hoje' }).click();

  // Especialista: o diário não vai para a IA.
  await page.getByTestId('spec-open-mind').click();
  await page.getByTestId('spec-input').fill('Monta a pauta da consulta');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('mind-pauta')).toContainText('Sono começando');
  const ctx = await page.evaluate(() => (window as any).__ctx.mind_coach);
  expect(JSON.stringify(ctx)).toContain('Reunião longa');
  expect(ctx.dias.at(-1).humor_noite).toBe(1);
  // Treino pulado em outra tela: a especialista da Mente vê que saiu do dia.
  expect(ctx.dias.at(-1).treino_planejado_min).toBeUndefined();
  expect(ctx.hoje_e_proximos_dias.dias[0].treinos[0]).toMatchObject({ nome: 'Pedal Z2', pulado: true });
  expect(ctx.o_que_ela_toma.map((i: any) => i.nome)).toContain('Remédio da noite');
  await page.getByLabel('Fechar').click();

  // Relatório.
  await page.getByRole('tab', { name: 'Painel' }).click();
  await page.getByTestId('open-report').click();
  await expect(page.getByTestId('report-screen')).toContainText('Vitamina D');
  await expect(page.getByTestId('report-screen')).toContainText('Reunião longa');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-relatorio.png', fullPage: true });

  // Depois de recarregar, a Mente continua abrindo direto.
  await page.goto('./#/mente');
  await page.reload();
  await expect(page.getByTestId('pin-lock')).toHaveCount(0);
  await expect(page.getByTestId('doses')).toBeVisible();

  // Dia ruim: o respiro aparece sozinho, com respiração guiada, frase e música.
  await page.getByTestId('checkin-pm').click();
  await page.getByTestId('mood-1').click();
  await page.getByTestId('mood--2').click();
  await page.getByTestId('checkin-save').click();
  await expect(page.getByTestId('care-card')).toContainText('Hoje o ritmo é mais lento');
  await expect(page.getByTestId('care-card')).toContainText('Weightless');
  await page.getByTestId('breath-run').click();
  await expect(page.getByTestId('breath')).toContainText('Inspire pelo nariz');
  const care = await page.evaluate(() => (window as any).__ctx.mind_care);
  expect(care.humor).toBe(-2);
  expect(care.o_que_ela_escreveu_hoje).toContain('Reunião longa');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/mind-respiro.png', fullPage: true });

  // Ajustes da Mente: cafés e meta de deitar.
  await page.getByRole('tab', { name: 'Ajustes' }).click();
  await expect(page.getByTestId('mind-settings')).toContainText('Cafés');
  await expect(page.getByTestId('mind-settings')).toContainText('Meta de deitar');
});

test('sem barra de baixo: o menu fica no topo e abre deslizando da borda', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.bottomnav')).toHaveCount(0);
  await expect(page.getByTestId('nav-menu')).toBeVisible();
  await page.getByTestId('nav-menu').click();
  await expect(page.getByTestId('drawer')).toBeVisible();
  await page.getByLabel('Fechar menu').click();
  await expect(page.getByTestId('drawer')).toHaveCount(0);
});
