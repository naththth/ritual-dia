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
  await page.getByRole('link', { name: 'Listas' }).click();
  await page.getByTestId('lists-search').fill('roupa');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Adicionar Comprar conjunto novo de treino a seg, 19/10' }).click();
  await page.getByRole('link', { name: 'Dia' }).click();
  await expect(page.getByTestId('task-row')).toHaveCount(2);

  // 3) pele da manhã: sinais, plano, salvar
  await page.getByTestId('skin-am').getByRole('button').first().click();
  await expect(page.getByTestId('page-date')).toContainText('seg, 19/10');
  await page.getByRole('button', { name: 'Boa' }).click();
  await page.getByTestId('sig-oleosidade').click();
  await page.getByTestId('sig-vermelhidao').click();
  await page.getByTestId('skin-use-all').click();
  await expect(page.locator('[data-testid=product-pick][aria-pressed=true]')).toHaveCount(3);
  await page.getByTestId('skin-save').click();
  await expect(page.getByTestId('skin-am')).toContainText('Boa. 3 produtos');

  // 4) almoço por toques
  await page.getByTestId('food-block').getByRole('button', { name: /Almoço/ }).click();
  for (const f of ['Frango', 'Arroz', 'Feijão', 'Salada de folhas']) await page.getByTestId('food-list').getByRole('button', { name: f, exact: true }).click();
  await expect(page.getByTestId('meal-selected')).toContainText('4 itens');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('food-block')).toContainText('Frango, Arroz, Feijão, Salada de folhas');
  await page.getByRole('button', { name: 'Adicionar 300 mL de água' }).click();
  await expect(page.getByTestId('water')).toContainText('300 mL');

  // 5) treino: musculação 45 min moderada atualiza o hábito uma única vez
  await page.getByTestId('fab').click();
  await page.getByRole('button', { name: 'Treino' }).click();
  await expect(page.getByTestId('workout-form')).toBeVisible();
  await page.getByTestId('workout-form').getByRole('button', { name: 'Musculação' }).click();
  await page.getByTestId('workout-form').getByRole('button', { name: '45 min' }).click();
  await page.getByTestId('workout-save').click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByTestId('training-block')).toContainText('Musculação');
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
  await expect(page.getByTestId('day-summary')).toContainText('4 de 5 áreas registradas');

  // 8) recarregar: nada some
  await page.reload();
  await expect(page.getByTestId('skin-am')).toContainText('Boa. 3 produtos');
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');

  // 9) terça é independente
  await page.getByRole('button', { name: 'ter, 20/10' }).click();
  await expect(page.getByTestId('skin-am')).not.toContainText('Boa');
  await expect(page.getByTestId('food-block')).not.toContainText('Frango');
  await expect(page.getByTestId('task-row')).toHaveCount(0);
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');

  // 10) semanas depois, voltar pelo calendário à segunda
  await page.getByRole('link', { name: 'Calendário' }).click();
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.getByRole('button', { name: '2026-10-19' }).click();
  await expect(page.getByTestId('day-panel')).toContainText('Musculação 45 min');
  await page.getByRole('button', { name: 'Abrir o dia completo' }).click();
  await expect(page.getByTestId('skin-am')).toContainText('Boa. 3 produtos');
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
  await page.goto('./#/alimentacao?m=almoco');
  await page.getByRole('button', { name: 'Novo alimento' }).click();
  await page.getByLabel('Nome do alimento').fill('Patinho');
  await page.getByTestId('food-save').click();
  await expect(page.getByTestId('meal-selected')).toContainText('Patinho');
  await page.getByTestId('meal-save').click();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await expect(page.getByTestId('food-block')).toContainText('Patinho');
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
  await expect(page.getByTestId('training-block')).toContainText('Planejado');
  await page.getByTestId('train-done').click();
  await expect(page.getByTestId('habit-Musculação')).toContainText('1 de 3 na semana');
  await page.getByRole('button', { name: 'ter, 20/10' }).click();
  await expect(page.getByTestId('training-block')).toContainText('Nada planejado');
  await page.getByRole('button', { name: 'qua, 21/10' }).click();
  await expect(page.getByTestId('training-block')).toContainText('Planejado');
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
    for (const route of ['#/', '#/calendario', '#/listas', '#/evolucao', '#/pele', '#/alimentacao', '#/treino', '#/ajustes', '#/plano/skin', '#/revisao']) {
      await page.goto('./' + route);
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `test-results/shots/${width}-${route.replace(/[#/]/g, '_') || 'dia'}.png`, fullPage: true });
    }
  });
}
