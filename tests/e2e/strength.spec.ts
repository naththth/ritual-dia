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
  await page.getByTestId('strength-edit').click();

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
  await page.getByTestId('strength-edit-save').click();
  await expect(page.getByTestId('strength-note')).toContainText('30,5 kg');
  await expect(page.getByTestId('strength-note')).toContainText('4x10');

  await page.getByTestId('train-done').click();
  const card = page.getByTestId('workout-card');
  await expect(card).toContainText('Musculação');
  await expect(card.getByTestId('exercise-summary')).toContainText('30,5 kg');
  await expect(card.getByTestId('exercise-summary')).toContainText('4×10');

  // o Garmin errou os exercícios: ela corrige o que fez e o programado fica para comparar
  await card.getByTestId('exercise-log-open').click();
  // carga por série: ela sobe de série para série; as seguintes acompanham até ela mudar
  const row1 = card.getByTestId('exercise-row').first();
  await row1.getByTestId('ex-load').fill('32');
  await expect(row1.getByTestId('ex-load-set').nth(0)).toHaveValue('32');
  await row1.getByTestId('ex-load-set').nth(0).fill('36');
  await row1.getByTestId('ex-load-set').nth(1).fill('40');
  await expect(row1).toContainText('Volume: 1.080 kg');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-sets.png', fullPage: true });
  await card.getByTestId('exercise-log-save').click();
  await expect(card.getByTestId('exercise-summary')).toContainText('32 → 36 → 40 kg');
  await expect(card.getByTestId('exercise-summary')).toContainText('programado');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-done.png', fullPage: true });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('o roteiro escrito no treino vira os exercícios do dia', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T08:00:00-03:00'));
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
    st.put({ ...base, id: 'wtemplate:mus', kind: 'wtemplate', name: 'Musculação C', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada', muscles: ['Corpo todo'], note: 'Bi-sets.\n\n1. Agachamento goblet ou livre 3x6-10\n2. Barra fixa assistida ou puxada neutra 3x6-10\n3. Mesa flexora 3x10-12' });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 7: ['wtemplate:mus'] } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await page.getByRole('button', { name: /^dom, 25\/10/ }).click();
  const note = page.getByTestId('strength-note');
  await expect(note).toContainText('1. Agachamento goblet ou livre 3x6-10');
  // a edição acontece dentro do treino e, ao concluir, o texto do treino muda
  await page.getByTestId('strength-edit').click();
  const rows = page.getByTestId('exercise-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().getByTestId('exercise-select')).toHaveValue('Agachamento goblet');
  const third = rows.nth(2).getByTestId('exercise-select');
  const alt = (await third.locator('option').nth(1).textContent())!;
  await third.selectOption({ index: 1 });
  await rows.nth(2).getByTestId('ex-load').fill('25');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-edit.png', fullPage: true });
  await page.getByTestId('strength-edit-save').click();
  await expect(page.getByTestId('exercise-row')).toHaveCount(0);
  await expect(note).toContainText(`3. ${alt} 3x12 · 25 kg`);
  await expect(note).toContainText('1. Agachamento goblet ou livre 3x6-10');
  await expect(note).not.toContainText('Mesa flexora');
  await page.reload();
  await page.getByRole('button', { name: /^dom, 25\/10/ }).click();
  await expect(page.getByTestId('strength-note')).toContainText(`3. ${alt} 3x12 · 25 kg`);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/strength-after.png', fullPage: true });
});

test('exercícios gravados que não batem com o roteiro dão lugar ao roteiro', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T08:00:00-03:00'));
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
    st.put({ ...base, id: 'wtemplate:mus', kind: 'wtemplate', name: 'Musculação C', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada', muscles: ['Corpo todo'], note: '1. Agachamento goblet ou livre 3x6-10\n2. Mesa flexora 3x10-12',
      exercises: [{ id: 'x1', group: 'Pernas', name: 'Leg press 45°', sets: 3, reps: 10 }, { id: 'x2', group: 'Costas', name: 'Puxada na frente', sets: 3, reps: 10 }] });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 7: ['wtemplate:mus'] } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await page.getByRole('button', { name: /^dom, 25\/10/ }).click();
  await page.getByTestId('strength-edit').click();
  await expect(page.getByTestId('exercise-select').first()).toHaveValue('Agachamento goblet');
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
});
