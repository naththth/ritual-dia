import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURE = path.resolve('tests/e2e/fixtures/sample.json');
const MONDAY = new Date('2026-10-19T07:10:00-03:00');

async function onboard(page: Page) {
  await page.clock.setFixedTime(MONDAY);
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(FIXTURE);
  await expect(page.getByTestId('import-preview')).toContainText('4 tarefas sem dia marcado');
  await page.getByTestId('do-import').click();
  await page.getByTestId('go-review').click();
  for (const name of ['Gel de limpeza', 'Sérum calmante', 'Creme hidratante', 'Protetor FPS 50', 'Retinol']) {
    await page.getByRole('button', { name: `Tenho: ${name}`, exact: true }).click();
  }
  await page.getByTestId('review-plan').click();
  // rotina-base da manhã
  await page.getByTestId('edit-base').click();
  for (const name of ['Gel de limpeza', 'Creme hidratante', 'Protetor FPS 50']) {
    await page.locator('.sheet [data-testid=product-pick]', { hasText: name }).click();
  }
  await page.getByRole('button', { name: 'Pronto' }).click();
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible();
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
}

test('segunda-feira completa: todos os módulos na mesma data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await onboard(page);
  await expect(page.getByTestId('day-title')).toContainText('segunda');
  await expect(page.getByTestId('day-title')).toContainText('19 de outubro');

  // 1) sugestão: agora não, depois colocar no dia
  const sugg = page.getByTestId('suggestion');
  await expect(sugg).toContainText('Arrumar máquina de lavar');
  await page.getByTestId('sugg-later').click();
  await expect(sugg).not.toContainText('Arrumar máquina de lavar');
  await expect(sugg).toContainText('Decidir data da viagem');
  await page.getByTestId('sugg-accept').click();
  await expect(page.getByTestId('task-row')).toContainText('Decidir data da viagem');

  // 2) buscar "roupa" em Listas e adicionar à segunda
  await page.getByRole('link', { name: 'Mais' }).click();
  await page.getByRole('button', { name: /Tarefas/ }).click();
  await page.getByTestId('lists-search').fill('roupa');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Adicionar Comprar conjunto novo de treino a seg, 19/10' }).click();
  await page.getByRole('link', { name: 'Hoje' }).click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);

  // 3) pele da manhã: sinais, plano, salvar
  await page.getByTestId('tl-skin-am').locator('.tl2-body').click();
  await expect(page.getByTestId('page-date')).toContainText('seg, 19/10');
  await page.getByRole('button', { name: 'Boa' }).click();
  await page.getByTestId('sig-oleosidade').click();
  await page.getByTestId('sig-vermelhidao').click();
  await page.getByTestId('skin-use-all').click();
  await expect(page.locator('[data-testid=product-pick][aria-pressed=true]')).toHaveCount(3);
  await page.getByTestId('skin-save').click();
  await expect(page.getByTestId('tl-skin-am')).toContainText('3 produtos usados');

  // 4) almoço por toques
  await page.getByRole('link', { name: 'Alimentação' }).click();
  await page.getByTestId('add-almoco').click();
  await page.getByRole('tab', { name: 'Todos' }).click();
  for (const f of ['Frango', 'Arroz', 'Feijão', 'Salada de folhas']) await page.getByTestId('food-list').getByRole('button', { name: `Adicionar ${f}`, exact: true }).click();
  await expect(page.getByTestId('meal-selected')).toContainText('4 itens');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('meal-sec-almoco')).toContainText('Frango');
  await expect(page.getByTestId('meal-sec-almoco')).toContainText('Salada de folhas');
  await page.getByRole('button', { name: '+300 mL' }).click();
  await page.getByRole('link', { name: 'Hoje' }).click();
  await expect(page.getByTestId('water-open')).toContainText('300 mL');
  await expect(page.getByTestId('tl-meal-almoco')).toContainText('Frango');

  // 5) treino: musculação 45 min moderada atualiza o hábito uma única vez
  await page.getByTestId('fab').click();
  await page.getByRole('button', { name: 'Treino sem arquivo' }).click();
  await expect(page.getByTestId('workout-form')).toBeVisible();
  await page.getByTestId('workout-form').getByRole('button', { name: 'Musculação' }).click();
  await page.getByTestId('workout-form').getByRole('button', { name: '45 min' }).click();
  await page.getByTestId('workout-save').click(); // salvar volta sozinho
  await expect(page.getByTestId('timeline')).toContainText('Musculação');
  const musc = page.getByTestId('habit-Musculação');
  await expect(musc).toContainText('1 de 3 na semana');
  await musc.click(); // já contou pelo treino
  await expect(musc).toContainText('1 de 3 na semana');

  // 6) hábito meditação
  await page.getByTestId('habit-Meditação').click();
  await expect(page.getByTestId('habit-Meditação')).toHaveAttribute('aria-pressed', 'true');

  // 7) fim do dia: concluir a tarefa de roupa
  await page.getByRole('checkbox', { name: 'Concluir Comprar conjunto novo de treino' }).click();
  await expect(page.getByRole('checkbox', { name: 'Concluir Comprar conjunto novo de treino' })).toHaveAttribute('aria-checked', 'true');

  // 8) recarregar: nada some
  await page.reload();
  await expect(page.getByTestId('tl-skin-am')).toContainText('3 produtos usados');
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');

  // 9) terça é independente
  await page.getByRole('button', { name: 'ter, 20/10' }).click();
  await expect(page.getByTestId('tl-skin-am')).not.toContainText('usados');
  await expect(page.getByTestId('timeline')).not.toContainText('Frango');
  await expect(page.getByTestId('task-row')).toHaveCount(0);
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');

  // 10) semanas depois, voltar pelo calendário à segunda
  await page.getByRole('link', { name: 'Mais' }).click();
  await page.getByRole('button', { name: /Calendário/ }).click();
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.getByRole('button', { name: '2026-10-19' }).click();
  await expect(page.getByTestId('day-panel')).toContainText('Musculação 45 min');
  await page.getByRole('button', { name: 'Abrir o dia completo' }).click();
  await expect(page.getByTestId('tl-skin-am')).toContainText('3 produtos usados');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('editar e desfazer registro em data anterior', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await page.getByRole('button', { name: 'qua, 14/10' }).click();
  await page.getByTestId('habit-Meditação').click();
  await expect(page.getByTestId('habit-Meditação')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByTestId('habit-Meditação')).toHaveAttribute('aria-pressed', 'false');
  // concluir tarefa em data passada pede confirmação da data
  await page.getByTestId('pick-task').click();
  await page.getByRole('button', { name: 'Adicionar Comprar estante vermelha alta' }).click();
  await page.getByRole('checkbox', { name: 'Concluir Comprar estante vermelha alta' }).click();
  await expect(page.getByText('Concluída em qua, 14/10?')).toBeVisible();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByRole('checkbox', { name: 'Concluir Comprar estante vermelha alta' })).toHaveAttribute('aria-checked', 'true');
});

test('cadastrar alimento e produto aparecem na hora para uso', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/alimentacao/refeicao?m=almoco');
  await page.getByRole('button', { name: /Cadastrar alimento/ }).click();
  await page.getByLabel('Nome do alimento').fill('Patinho');
  await page.getByTestId('food-save').click();
  await expect(page.getByTestId('meal-selected')).toContainText('Patinho');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await expect(page.getByTestId('timeline')).toContainText('Patinho');
  await page.goto('./#/pele?p=pm');
  await page.getByTestId('skin-add-from-list').click();
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await page.getByLabel('Marca').fill('Nova');
  await page.getByLabel('Nome do produto').fill('Bálsamo noturno');
  await page.getByTestId('product-save').click();
  await expect(page.locator('.sheet [data-testid=product-pick][aria-pressed=true]')).toContainText('Bálsamo noturno');
});

test('plano de treino seg/qua/sex: sugestão e check', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/biblioteca/treinos');
  await page.getByTestId('lib-add').click();
  await page.locator('.sheet').getByRole('button', { name: 'Musculação' }).click();
  await page.getByTestId('wt-save').click();
  await page.goto('./#/plano/training');
  for (const d of [1, 3, 5]) await page.getByTestId(`tplan-${d}`).getByRole('button', { name: 'Musculação' }).click();
  await page.getByTestId('plan-save').click();
  await page.goto('./#/');
  await expect(page.getByTestId('tl-train-done')).toBeVisible();
  await page.getByTestId('tl-train-done').click();
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');
  await page.getByRole('button', { name: 'ter, 20/10' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page.getByTestId('tl-train-done')).toHaveCount(0);
  await page.getByRole('button', { name: 'qua, 21/10' }).click();
  await expect(page.getByTestId('tl-train-done')).toBeVisible();
});

test('backup e restauração', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('habit-Meditação').click();
  await page.goto('./#/ajustes');
  const dl = page.waitForEvent('download');
  await page.getByTestId('backup-export').click();
  const file = await (await dl).path();
  const json = JSON.parse(fs.readFileSync(file!, 'utf8'));
  expect(json.app).toBe('ritual');
  expect(json.records.some((r: any) => r.kind === 'hlog')).toBe(true);
  await page.getByTestId('restore-input').setInputFiles(file!);
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByText(/Restaurado/)).toBeVisible();
});

for (const width of [360, 393, 430]) {
  test(`telas sem rolagem lateral em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await onboard(page);
    for (const route of ['#/', '#/treino', '#/alimentacao', '#/mais', '#/calendario', '#/listas', '#/evolucao', '#/pele', '#/alimentacao/refeicao', '#/treino/registrar', '#/ajustes', '#/plano/skin', '#/revisao', '#/diario', '#/notas', '#/leitura']) {
      await page.goto('./' + route);
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `test-results/shots/${width}-${route.replace(/[#/]/g, '_') || 'dia'}.png`, fullPage: true });
    }
  });
}

test('buscar alimento na tabela TACO e ver calorias da refeição', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/alimentacao/refeicao?m=almoco');
  await page.getByLabel('Buscar alimento').fill('frango peito grelhado');
  await page.getByTestId('taco-option').first().click();
  await expect(page.getByTestId('meal-selected')).toContainText('Frango, peito, sem pele, grelhado');
  await expect(page.getByTestId('meal-totals')).toContainText('159');
  await page.getByRole('button', { name: 'Quantidade de Frango, peito, sem pele, grelhado' }).click();
  await page.getByLabel('Quantidade', { exact: true }).fill('140');
  await page.getByTestId('qty-save').click();
  await expect(page.getByTestId('meal-totals')).toContainText('223');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('today-stats')).toContainText('223');
  await page.screenshot({ path: 'test-results/shots/nutricao-dia.png', fullPage: true });
});

test('importar treino .FIT e ver potência, FC e zonas', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/ajustes');
  await page.getByLabel('FTP').fill('190');
  await page.getByLabel('FTP').blur();
  await page.goto('./#/treino');
  await page.getByTestId('fit-input').setInputFiles(path.resolve('tests/e2e/fixtures/pedal.fit'));
  const card = page.getByTestId('workout-card');
  await expect(card).toContainText('Ciclismo');
  await expect(card).toContainText('229 W');
  await expect(card).toContainText('24.79 km');
  await expect(card).toContainText('Tempo por zona');
  // reimportar não duplica
  await page.getByTestId('fit-input').setInputFiles(path.resolve('tests/e2e/fixtures/pedal.fit'));
  await expect(page.getByTestId('workout-card')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/shots/treino-fit.png', fullPage: true });
});

test('fechar o dia no diário e criar nota', async ({ page }) => {
  await onboard(page);
  await expect(page.getByTestId('tl-journal')).toContainText('Fechar o dia');
  await page.getByTestId('tl-journal').locator('.tl2-body').click();
  await page.getByRole('radio', { name: 'Energia 4' }).click();
  await page.getByRole('radio', { name: 'Humor 5' }).click();
  await page.getByRole('button', { name: 'Treino bom' }).click();
  await page.getByLabel('Texto do diário').fill('Dia produtivo, pedal rendeu.');
  await page.getByTestId('journal-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible(); // salvar volta para o dia
  await page.getByTestId('tl-journal').locator('.tl2-body').click();
  await page.getByRole('button', { name: 'Nova nota' }).click();
  await page.getByLabel('Texto da nota').fill('Ideia: comprar rolo de espuma');
  await page.getByTestId('note-save').click();
  await expect(page.getByTestId('note-row')).toContainText('Ideia: comprar rolo de espuma');
  await page.goto('./#/');
  await expect(page.getByTestId('tl-journal')).toContainText('energia 4');
  await page.goto('./#/notas');
  await page.getByLabel('Buscar nas notas').fill('espuma');
  await expect(page.getByTestId('note-row')).toHaveCount(1);
});

test('subir .FIT pelo botão + e ver a carga de treino', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('fab').click();
  await page.getByTestId('fit-input-quick').setInputFiles(path.resolve('tests/e2e/fixtures/pedal.fit'));
  await expect(page.getByTestId('training-tab')).toBeVisible();
  await expect(page.getByTestId('workout-card')).toContainText('Ciclismo');
  await page.goto('./#/treino');
  await page.getByRole('button', { name: 'Próxima semana' }).isVisible();
});

test('sono: acordar 6h calcula deitar e organiza o dia', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/ajustes');
  await page.getByTestId('sleep-start').click();
  await expect(page.getByTestId('sleep-bed')).toContainText('21:45');
  await page.getByRole('button', { name: '8 h 30' }).click();
  await expect(page.getByTestId('sleep-bed')).toContainText('21:15');
  await page.getByRole('button', { name: '8 h', exact: true }).click();
  await page.getByTestId('sleep-organize').click();
  await expect(page.getByLabel('Horário: Pele da manhã')).toHaveValue('06:20');
  await expect(page.getByLabel('Horário: Pele da noite')).toHaveValue('21:15');
  await page.screenshot({ path: 'test-results/shots/sono.png', fullPage: true });
  await page.goto('./#/');
  await expect(page.getByTestId('tl-wake')).toContainText('06:00');
  await expect(page.getByTestId('tl-bed')).toContainText('21:45');
  await expect(page.getByTestId('now-card')).not.toContainText('Acordar');
});

test('registrar sono, VFC e passos à mão', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('wellness-open').click();
  await page.getByLabel('Sono', { exact: true }).fill('7h20');
  await page.getByLabel('VFC (ms)').fill('46');
  await page.getByLabel('FC repouso').fill('52');
  await page.getByLabel('Body Battery').fill('78');
  await page.getByTestId('wellness-save').click();
  const strip = page.getByTestId('wellness');
  await expect(strip).toContainText('7h20');
  await expect(strip).toContainText('46 ms');
  await expect(strip).toContainText('78');
  await page.screenshot({ path: 'test-results/shots/hoje-sono.png' });
  await page.goto('./#/treino');
  await page.getByTestId('fit-input').setInputFiles(path.resolve('tests/e2e/fixtures/pedal.fit'));
});

test('sem relógio: estimativa de sono com um toque', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('no-watch').getByRole('button', { name: '~7 h' }).click();
  await expect(page.getByTestId('wellness')).toContainText('~7h00');
  await expect(page.getByTestId('wellness')).toContainText('estimado');
});

test('treino trocado: fez outra modalidade no lugar do planejado', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/biblioteca/treinos');
  await page.getByTestId('lib-add').click();
  await page.locator('.sheet').getByRole('button', { name: 'Ciclismo' }).click();
  await page.getByTestId('wt-save').click();
  await page.goto('./#/plano/training');
  await page.getByTestId('tplan-1').getByRole('button', { name: 'Ciclismo' }).click();
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('fab')).toBeVisible();
  await page.getByTestId('fab').click();
  await page.getByRole('button', { name: 'Treino sem arquivo' }).click();
  await page.getByTestId('workout-form').getByRole('button', { name: 'Musculação' }).click();
  await page.getByTestId('workout-form').getByRole('button', { name: '45 min' }).click();
  await page.getByTestId('workout-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await page.getByRole('link', { name: 'Treino' }).click();
  await expect(page.getByTestId('swap-ask')).toContainText('musculação no lugar');
  await page.getByTestId('swap-yes').click();
  await expect(page.getByTestId('planned-skipped')).toContainText('não hoje');
  await expect(page.getByTestId('train-done')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/shots/treino-trocado.png' });
});

test('importar biblioteca do Goodreads', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/leitura');
  await page.getByTestId('gr-input').setInputFiles(path.resolve('tests/e2e/fixtures/goodreads-test.csv'));
  await expect(page.getByTestId('book-row').first()).toBeVisible();
  await expect(page.getByTestId('reading-screen')).toContainText('Livro Lendo Um');
  await page.getByTestId('gr-input').setInputFiles(path.resolve('tests/e2e/fixtures/goodreads-test.csv'));
  await expect(page.getByTestId('book-row')).toHaveCount(2); // lendo: 2, sem duplicar
});
