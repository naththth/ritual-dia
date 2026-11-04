import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// O app propõe: radar no Hoje, ideal da refeição, prato contra o ideal, leitura do treino e indicadores.
test('app propositivo: radar, ideal da refeição, leitura do treino e indicadores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-03T17:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string) => {
      if (task === 'workout_feedback') return { titulo: 'Sweet spot bem executado', desempenho: 'NP de 150 W para 145 W planejados, FC 4 bpm abaixo da última sessão igual.', recuperacao: 'Forma em -12: amanhã segue o plano.', alimentacao: 'No jantar, 150 g de frango e 120 g de arroz: 48 g de proteína e 35 g de carbo.', proximo: 'Musculação amanhã com volume normal.', nota: 4 };
      if (task === 'meal_advice') return { dica: 'Proteína é o que falta.', opcoes: [{ nome: 'Frango com arroz', itens: [{ food_id: 'food:t-frango', nome: 'Frango', quantidade: '150 g', gramas: 150 }, { food_id: 'food:t-arroz', nome: 'Arroz', quantidade: '120 g', gramas: 120 }], kcal: 390, p: 51, c: 31, g: 5, porque: 'Fecha a proteína do jantar.' }] };
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
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    const b = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...b, id: 'food:t-frango', kind: 'food', name: 'Frango grelhado', type: 'Proteína', n: { kcal: 159, p: 32, c: 0, f: 2.5 }, portions: [], measures: [{ label: '1 filé', grams: 100 }] });
    st.put({ ...b, id: 'food:t-arroz', kind: 'food', name: 'Arroz integral', type: 'Carboidrato', n: { kcal: 124, p: 2.6, c: 25.8, f: 1 }, portions: [] });
    st.put({ ...b, id: 'food:t-salada', kind: 'food', name: 'Salada de folhas', type: 'Vegetais', n: { kcal: 15, p: 1.3, c: 2.4, f: 0.2 }, portions: [] });
    for (const d of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']) st.put({ ...b, id: `meal:${d}:almoco`, kind: 'meal', date: d, mealType: 'almoco', items: [{ foodId: 'food:t-frango', portion: '120 g', grams: 120 }, { foodId: 'food:t-arroz', portion: '100 g', grams: 100 }, { foodId: 'food:t-salada', portion: '80 g', grams: 80 }] });
    st.put({ ...b, id: 'meal:2026-11-03:cafe', kind: 'meal', date: '2026-11-03', mealType: 'cafe', items: [{ foodId: 'food:t-arroz', portion: '50 g', grams: 50 }] });
    st.put({ ...b, id: 'workout:t-pedal', kind: 'workout', date: '2026-11-03', modalityId: 'mod:ciclismo', duration: 60, intensity: 'moderada', startTime: '2026-11-03T19:00:00Z', metrics: { tss: 72, avgHr: 141, kcal: 520 } });
    st.put({ ...b, id: 'wellness:2026-11-03', kind: 'wellness', date: '2026-11-03', sleepH: 5.5 });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, targets: { kcal: 1800, p: 140, c: 150, f: 60 }, waterGoalMl: 3000, profile: { ...(g.result.profile ?? {}), weightKg: 89 } });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();

  // Hoje: radar avisa pós-treino, proteína atrasada e noite curta
  const radar = page.getByTestId('radar');
  await expect(radar).toContainText('Janela pós-treino aberta');
  await page.getByRole('button', { name: /^Mais \d/ }).click().catch(() => undefined);
  await expect(radar).toContainText('Proteína atrasada');
  await expect(radar).toContainText('Noite curta: 5h30');

  // Alimentação: a próxima refeição diz o ideal agora, com alimentos dela, e registra em um toque
  await page.goto('./#/alimentacao');
  const fuel = page.getByTestId('fuel-jantar');
  await expect(fuel).toContainText('Ideal agora');
  await expect(fuel).toContainText('pós-treino');
  await expect(fuel).toContainText('Frango grelhado');
  await page.getByTestId('fuel-use-jantar').click();
  await expect(page.getByTestId('meal-sec-jantar')).toContainText('Frango grelhado');

  // Refeição: o prato contra o ideal, com o que acrescentar
  await page.goto('./#/alimentacao/refeicao?m=ceia');
  await expect(page.getByTestId('plate-coach')).toContainText('Ideal desta refeição');
  await page.getByRole('button', { name: 'Montar prato com IA' }).click();
  await expect(page.getByText('Fecha a proteína do jantar.')).toBeVisible();
  await page.getByRole('button', { name: 'Usar esta opção' }).click();
  await expect(page.getByTestId('meal-selected')).toContainText('Frango grelhado');
  await expect(page.getByTestId('meal-selected')).toContainText('Arroz integral');

  // Treino: leitura da treinadora gerada sozinha
  await page.goto('./#/treino');
  await expect(page.getByTestId('wfb')).toContainText('Sweet spot bem executado');
  await expect(page.getByTestId('wfb')).toContainText('Comer agora.');

  // Indicadores
  await page.goto('./#/indicadores');
  await expect(page.getByTestId('indicators')).toContainText('proteína média por dia');
  await expect(page.getByTestId('indicators')).toContainText('sono médio');
  if (process.env.SHOTS) {
    await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/claude-0/shots/indicadores.png', fullPage: true });
    await page.goto('./#/'); await expect(page.getByTestId('radar')).toBeVisible(); await expect(page.getByTestId('timeline')).toBeVisible(); await page.waitForTimeout(400); await page.screenshot({ path: '/tmp/claude-0/shots/hoje-radar.png', fullPage: true });
    await page.goto('./#/treino'); await expect(page.getByTestId('wfb')).toBeVisible(); await page.getByTestId('wfb').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/claude-0/shots/treino-leitura.png' });
    await page.goto('./#/alimentacao/refeicao?m=ceia'); await expect(page.getByTestId('plate-coach')).toBeVisible(); await page.screenshot({ path: '/tmp/claude-0/shots/prato-ideal.png', fullPage: true });
    await page.goto('./#/alimentacao/refeicao?m=lanche'); await expect(page.getByTestId('plate-coach')).toBeVisible(); await page.screenshot({ path: '/tmp/claude-0/shots/prato-ideal-vazio.png' });
  }
  expect(errors).toEqual([]);
});
