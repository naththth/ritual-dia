import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Musculação: exercícios com carga sugerida antes do treino, variações na lista e lançamento depois.
test('musculação programada com carga, variações e lançamento do que foi feito', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-19T08:00:00-03:00'));
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'wtemplate:mus', kind: 'wtemplate', name: 'Musculação de pernas', modalityId: 'mod:musculacao', duration: 60, intensity: 'moderada', muscles: ['Pernas'] });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 1: ['wtemplate:mus'] } });
    st.put({ ...base, id: 'workout:prev', kind: 'workout', date: '2026-10-12', modalityId: 'mod:musculacao', duration: 60, exercises: [{ id: 'p1', group: 'Pernas', name: 'Agachamento livre', sets: 3, reps: 10, loadKg: 40, planned: { name: 'Agachamento livre', sets: 3, reps: 10, loadKg: 40 } }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');

  const rows = page.getByTestId('exercise-row');
  await expect(rows).toHaveCount(2);
  // carga já vem sugerida pelo último treino (40 kg cumpridos: sobe para 42)
  await expect(rows.first().getByTestId('ex-load')).toHaveValue('42');
  await expect(rows.first()).toContainText('subiu');
  // lista suspensa: 3 variações + "trazer outras"
  const sel = rows.first().getByTestId('exercise-select');
  await expect(sel.locator('option')).toHaveCount(4);
  await sel.selectOption({ index: 1 });
  await expect(rows.first().getByTestId('exercise-select')).not.toHaveValue(await rows.nth(1).getByTestId('exercise-select').inputValue());
  await expect(rows.first().getByTestId('ex-load')).toHaveValue('');
  await rows.first().getByTestId('ex-load').fill('30,5');
  await rows.nth(1).getByTestId('ex-sets').fill('4');
  // "trazer outras" troca as opções, mantendo o exercício
  const before = await sel.locator('option').allTextContents();
  await sel.selectOption('__outras');
  expect(await sel.locator('option').allTextContents()).not.toEqual(before);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-plan.png', fullPage: true });

  await page.getByTestId('train-done').click();
  const card = page.getByTestId('workout-card');
  await expect(card).toContainText('Musculação');
  await expect(card.getByTestId('exercise-summary')).toContainText('30,5 kg');
  await expect(card.getByTestId('exercise-summary')).toContainText('4×10');

  // o Garmin errou os exercícios: ela corrige o que fez e o programado fica para comparar
  await card.getByTestId('exercise-log-open').click();
  await card.getByTestId('ex-load').first().fill('32');
  await card.getByTestId('exercise-log-save').click();
  await expect(card.getByTestId('exercise-summary')).toContainText('32 kg');
  await expect(card.getByTestId('exercise-summary')).toContainText('programado');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-done.png', fullPage: true });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
