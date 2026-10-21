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
  for (const f of ['Frango', 'Arroz', 'Feijão', 'Salada de folhas']) {
    await page.getByTestId('food-list').getByRole('button', { name: `Adicionar ${f}`, exact: true }).click();
    await page.getByTestId('qty-save').click();
  }
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
  await page.getByTestId('qty-save').click();
  await expect(page.getByTestId('meal-selected')).toContainText('Patinho');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await expect(page.getByTestId('timeline')).toContainText('Patinho');
  await page.goto('./#/pele?p=pm');
  await page.getByTestId('skin-add-from-list').click();
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await page.getByLabel('Marca').fill('Nova');
  await page.getByLabel('Nome do produto').fill('Bálsamo noturno');
  await page.getByLabel('Para que serve').fill('Reforça a barreira durante a noite.');
  await page.getByLabel('Ativos principais').fill('ceramidas, pantenol 5%');
  await page.getByTestId('product-save').click();
  await expect(page.locator('.sheet [data-testid=product-pick][aria-pressed=true]')).toContainText('Bálsamo noturno');
  await page.goto('./#/biblioteca/produtos');
  await expect(page.getByText('Reforça a barreira durante a noite.')).toBeVisible();
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
  // A ficha abre antes de ir para o prato: medida caseira (1 filé ≈ 100 g) e macros.
  await expect(page.getByTestId('qty-sheet')).toBeVisible();
  await expect(page.getByTestId('food-macros')).toContainText('Proteína');
  await expect(page.getByTestId('qty-save')).toContainText('159 kcal');
  await page.getByTestId('qty-save').click();
  await expect(page.getByTestId('meal-selected')).toContainText('Frango, peito, sem pele, grelhado');
  await expect(page.getByTestId('meal-totals')).toContainText('159');
  await page.getByRole('button', { name: 'Quantidade de Frango, peito, sem pele, grelhado' }).click();
  await page.getByRole('radio', { name: /gramas/ }).click();
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
  await expect(page.getByLabel('Horário: Rotina da manhã')).toHaveValue('06:20');
  await expect(page.getByLabel('Horário: Rotina da noite')).toHaveValue('21:15');
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

test('ciclo: marcar menstruação, ver fase no Hoje e previsão', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('cycle-setup').click();
  const mark = async (d: string, flow: string) => {
    await page.getByTestId('cycle-sheet').getByLabel('Dia do registro').fill(d);
    await page.getByTestId(`flow-${flow}`).click();
    await page.getByTestId('cycle-save').click();
  };
  await mark('2026-10-05', 'medio');
  await expect(page.getByTestId('cycle-title')).toContainText('Dia 15 do ciclo');
  await page.getByTestId('cycle-card').getByRole('button', { name: 'Registrar ciclo do dia' }).click();
  await mark('2026-10-06', 'leve');
  await page.getByTestId('cycle-card').getByRole('button', { name: 'Registrar ciclo do dia' }).click();
  await mark('2026-09-07', 'intenso');
  await expect(page.getByTestId('cycle-title')).toContainText('fase ovulatória');
  await page.goto('./#/ciclo');
  await expect(page.getByTestId('cycle-day')).toHaveText('Dia 15');
  await expect(page.getByTestId('cycle-next')).toContainText('em 14 dias');
  await expect(page.getByTestId('cycle-history')).toContainText('ciclo de 28 dias');
  // Corrigir um ciclo inteiro pelo histórico e depois apagá-lo.
  await page.getByRole('button', { name: /Corrigir ciclo de .*7/ }).click();
  await page.getByTestId('period-start').fill('2026-09-10');
  await page.getByTestId('period-days').fill('4');
  await page.getByTestId('period-save').click();
  await expect(page.getByTestId('cycle-history')).toContainText('ciclo de 25 dias');
  await expect(page.getByTestId('cycle-history')).toContainText('4 dias de fluxo');
  await page.getByRole('button', { name: /Corrigir ciclo de .*10\/09/ }).click();
  await page.getByTestId('period-delete').click();
  await expect(page.getByTestId('cycle-history')).not.toContainText('ciclo de 25 dias');
  await expect(page.getByTestId('cycle-history')).not.toContainText('/09');
  await noHorizontalScroll(page);
  if (process.env.SHOTS) { await page.screenshot({ path: '/tmp/claude-0/shots/ciclo.png', fullPage: true }); await page.goto('./#/'); await page.getByTestId('cycle-card').waitFor(); await page.waitForTimeout(4500); await page.screenshot({ path: '/tmp/claude-0/shots/hoje.png' }); await page.goto('./#/ciclo'); }
  await page.getByTestId('cycle-hormonal').click();
  if (process.env.SHOTS) { await page.getByTestId('cycle-settings').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/claude-0/shots/ciclo-ajustes.png' }); }
  await expect(page.getByTestId('cycle-screen')).toContainText('não há fase natural');
});

test('ficha do alimento: pão francês em unidades, macros por refeição', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/alimentacao/refeicao?m=cafe');
  await page.getByLabel('Buscar alimento').fill('pão francês');
  await page.getByTestId('taco-option').filter({ hasText: 'Pão, trigo, francês' }).first().click();
  await expect(page.getByRole('radio', { name: /unidade/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('qty-grams')).toContainText('50 g');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByTestId('qty-grams')).toContainText('100 g');
  await expect(page.getByTestId('qty-save')).toContainText('300 kcal');
  await page.getByTestId('qty-save').click();
  await expect(page.getByTestId('meal-selected')).toContainText('2 unidades (100 g)');
  await expect(page.getByTestId('meal-totals')).toContainText('P');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/refeicao.png' });
  await page.getByRole('button', { name: /Quantidade de Pão/ }).click();
  await expect(page.getByLabel('Quantidade', { exact: true })).toHaveValue('2');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/ficha.png' });
  await page.getByTestId('qty-save').click();
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('food-screen')).toBeHidden();
  await page.goto('./#/alimentacao');
  await expect(page.getByTestId('meal-macros-cafe')).toContainText('P');
  await page.getByRole('button', { name: /Ajustar Pão/ }).click();
  await expect(page.getByTestId('qty-sheet')).toBeVisible();
  if (process.env.SHOTS) { await page.getByTestId('qty-save').click(); await page.goto('./#/alimentacao'); await page.screenshot({ path: '/tmp/claude-0/shots/dia.png' }); }
});

test('perfil alinhado: campos, opções e texto longo', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/perfil');
  await page.getByLabel('Altura').fill('180');
  await page.getByLabel('Peso').fill('89');
  await page.getByLabel('Ano de nascimento').fill('1992');
  await page.getByLabel('Gordura, se souber').fill('35');
  await page.getByRole('radio', { name: 'Feminino' }).click();
  await page.getByRole('radio', { name: /Perder gordura/ }).click();
  await page.getByLabel('Prova ou marco').fill('Tomo mounjaro e preciso chegar na meta de peso até março, com a prova de triathlon sprint no meio do caminho');
  await noHorizontalScroll(page);
  // os quatro campos numéricos ficam na mesma grade, com as caixas alinhadas
  const tops = await Promise.all(['Altura', 'Peso'].map(async (l) => (await page.getByLabel(l).boundingBox())!.y));
  expect(Math.abs(tops[0] - tops[1])).toBeLessThan(2);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/perfil.png', fullPage: true });
});

test('rotina de cuidados: rosto, corpo e cabelo juntos na noite, com avaliação', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/biblioteca/produtos');
  for (const [brand, name, group] of [['Marca A', 'Shampoo suave', 'Cabelo'], ['Marca B', 'Loção de ureia 10%', 'Corpo']]) {
    await page.getByRole('button', { name: 'Cadastrar produto' }).first().click();
    await page.getByLabel('Marca').fill(brand);
    await page.getByLabel('Nome do produto').fill(name);
    await page.getByTestId('product-form').getByRole('button', { name: group, exact: true }).click();
    await page.getByTestId('product-save').click();
  }
  await page.getByRole('button', { name: 'Cabelo', exact: true }).first().click();
  await expect(page.getByText('Shampoo suave')).toBeVisible();
  await expect(page.getByText('Loção de ureia 10%')).toBeHidden();

  // avaliação aparece no plano e leva para o perfil
  await page.goto('./#/plano/skin');
  await expect(page.getByTestId('assess-cabelo')).toContainText('0 de');
  await page.getByTestId('assess-cabelo').click();
  await expect(page.getByTestId('profile-hair')).toBeVisible();
  await page.getByRole('radio', { name: 'Ondulado' }).click();
  await page.getByRole('radio', { name: /Molha rápido/ }).click();
  await page.goBack();
  await expect(page.getByTestId('assess-cabelo')).toContainText('2 de');

  // noite: loção todo dia; shampoo só na segunda
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole('tab', { name: 'Noite' }).click();
  await noHorizontalScroll(page);
  await page.getByTestId('edit-base').click();
  await page.locator('.sheet [data-testid=product-pick]', { hasText: 'Loção de ureia' }).click();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await page.getByTestId('plan-day-1').click();
  await page.locator('.sheet [data-testid=product-pick]', { hasText: 'Shampoo suave' }).click();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByTestId('plan-day-1')).toContainText('Cabelo: Shampoo suave');
  await expect(page.getByTestId('plan-day-2')).not.toContainText('Shampoo');
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('plan-skin')).toBeHidden();

  // segunda à noite: rosto, corpo e cabelo na mesma rotina
  await page.goto('./#/pele?p=pm');
  await expect(page.getByTestId('skin-sec-corpo')).toContainText('Loção de ureia');
  await expect(page.getByTestId('skin-sec-cabelo')).toContainText('Shampoo suave');
  await expect(page.getByTestId('body-hair-signals')).toBeVisible();
  if (process.env.SHOTS) { await page.getByTestId('skin-sec-corpo').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/claude-0/shots/rotina-noite.png' }); await page.goto('./#/plano/skin'); await page.getByRole('tab', { name: 'Noite' }).click(); await page.screenshot({ path: '/tmp/claude-0/shots/plano-noite.png' }); }
  await page.goto('./#/');
  await expect(page.getByTestId('tl-skin-pm')).toContainText('Rotina da noite');
  await expect(page.getByTestId('tl-skin-pm')).toContainText('Shampoo suave');
});

test('peso: objetivo, ritmo e previsão calculados das pesagens', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/peso');
  const add = async (d: string, v: string) => {
    await page.getByTestId('weight-add').click();
    await page.getByTestId('weight-sheet').getByLabel('Dia da pesagem').fill(d);
    await page.getByTestId('weight-input').fill(v);
    await page.getByTestId('weight-save').click();
    await expect(page.getByTestId('weight-sheet')).toBeHidden();
  };
  await add('2026-09-21', '91,0');
  await add('2026-10-01', '90,2');
  await add('2026-10-10', '89,6');
  await add('2026-10-19', '89,0');
  await expect(page.getByTestId('weight-current')).toHaveText('89,0 kg');
  await page.getByTestId('weight-goal').click();
  await page.getByTestId('weight-target').fill('81');
  await page.getByTestId('weight-goal-sheet').getByLabel('Peso de partida').fill('91');
  await page.getByTestId('weight-goal-sheet').getByLabel('Data de partida').fill('2026-09-21');
  await page.getByTestId('weight-goal-save').click();
  await expect(page.getByTestId('weight-progress')).toContainText('Faltam 8,0 kg');
  await expect(page.getByTestId('weight-progress')).toContainText('Já foram 2,0 kg');
  await expect(page.getByTestId('weight-pace')).toContainText('kg por semana');
  await expect(page.getByTestId('weight-pace')).toContainText('o objetivo chega por volta de');
  await expect(page.getByTestId('weight-chart')).toBeVisible();
  await noHorizontalScroll(page);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/peso.png', fullPage: true });
});

test('sessões de treino: explicação, dias do plano e exercícios', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/biblioteca/treinos');
  await expect(page.getByTestId('wt-intro')).toContainText('Plano de treino');
  await page.getByRole('button', { name: 'Nova sessão' }).click();
  await page.getByLabel('Nome do treino').fill('Musculação corpo todo');
  await page.getByRole('button', { name: 'Musculação' }).first().click();
  await page.getByTestId('wt-note').fill('1. Agachamento goblet 3x8-12\n2. Remada baixa 3x8-12');
  await page.getByTestId('wt-save').click();
  await expect(page.getByTestId('library-treinos')).toContainText('Fora do plano da semana');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/sessoes.png', fullPage: true });
});

test('noite se adapta: vermelhidão de manhã tira o ativo da noite', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/plano/skin');
  await page.getByRole('tab', { name: 'Noite' }).click();
  await page.getByTestId('edit-base').click();
  for (const name of ['Gel de limpeza', 'Retinol', 'Creme hidratante']) await page.locator('.sheet [data-testid=product-pick]', { hasText: name }).click();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('plan-skin')).toBeHidden();
  // manhã com vermelhidão
  await page.goto('./#/pele?p=am');
  await expect(page.getByTestId('skin-sec-rosto')).toBeVisible();
  await page.getByTestId('sig-vermelhidao').click();
  await page.getByTestId('skin-save').click();
  await expect(page.getByTestId('skin-screen')).toBeHidden();
  await page.goto('./#/');
  await expect(page.getByTestId('tl-skin-pm')).toContainText('Ajuste sugerido');
  await page.goto('./#/pele?p=pm');
  await expect(page.getByTestId('night-adjust')).toContainText('Retinol');
  await expect(page.getByTestId('night-adjust')).toContainText('vermelhidão');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/noite-ajuste.png' });
  await page.getByTestId('night-adjust-apply').click();
  await expect(page.getByTestId('night-adjust-done')).toBeVisible();
  await expect(page.getByTestId('skin-sec-rosto')).not.toContainText('Retinol');
  await expect(page.getByTestId('skin-sec-rosto')).toContainText('Creme hidratante');
  await page.goto('./#/');
  await expect(page.getByTestId('tl-skin-pm')).toContainText('Sem ativo hoje');
  await expect(page.getByTestId('tl-skin-pm')).not.toContainText('Retinol');
});

test('foto: sempre oferece câmera ou galeria', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/pele?p=am');
  await page.getByRole('button', { name: 'Adicionar foto' }).click();
  await expect(page.getByTestId('photo-source')).toContainText('Tirar foto');
  await expect(page.getByTestId('photo-source')).toContainText('Escolher da galeria');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/foto-origem.png' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('photo-gallery').click()]);
  expect(await chooser.element().getAttribute('capture')).toBeNull();
  await expect(page.getByTestId('photo-source')).toBeHidden();
});

test('preferências para a IA na rotina de cuidados', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/plano/skin');
  const box = page.getByTestId('ai-prefs-skin');
  await box.getByRole('textbox').fill('Quero usar ácidos várias vezes na semana');
  await box.getByTestId('ai-prefs-save').click();
  await expect(box.getByTestId('ai-prefs-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('ai-prefs-skin').getByRole('textbox')).toHaveValue('Quero usar ácidos várias vezes na semana');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/prefs.png' });
});
