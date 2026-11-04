import { test, expect } from '@playwright/test';
import path from 'node:path';

// O padrão dela é repetir o próprio prato: a última vez de cada refeição vira um toque.
test('repetir o almoço do dia anterior com um toque', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:40:00-03:00'));
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
    st.put({ ...b, id: 'food:t-patinho', kind: 'food', name: 'Patinho moído', type: 'Proteína', n: { kcal: 219, p: 35.9, c: 0, f: 7.3 }, portions: [] });
    st.put({ ...b, id: 'food:t-arroz', kind: 'food', name: 'Arroz integral', type: 'Carboidrato', n: { kcal: 124, p: 2.6, c: 25.8, f: 1 }, portions: [] });
    st.put({ ...b, id: 'meal:2026-10-18:almoco', kind: 'meal', date: '2026-10-18', mealType: 'almoco', items: [{ foodId: 'food:t-patinho', portion: '120 g', grams: 120 }, { foodId: 'food:t-arroz', portion: '100 g', grams: 100 }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/alimentacao');
  const almoco = page.getByTestId('meal-sec-almoco');
  await expect(almoco).toContainText('Próxima refeição');
  await expect(page.getByTestId('repeat-almoco')).toContainText('Repetir de dom, 18/10');
  await expect(page.getByTestId('repeat-almoco')).toContainText('Patinho moído, Arroz integral');
  await page.getByTestId('repeat-almoco').click();
  await expect(almoco).toContainText('Patinho moído');
  await expect(page.getByTestId('repeat-almoco')).toHaveCount(0);
  // o café, que nunca foi registrado, não oferece repetir
  await expect(page.getByTestId('repeat-cafe')).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/food-repeat.png', fullPage: true });
});
