import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 780 } });

// Cada esporte com os números que fazem sentido: corrida com pace e passos por minuto; pedal com potência e rpm.
test('card da corrida mostra pace e ppm, sem rpm, e os números ficam alinhados', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-16T08:00:00-03:00'));
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
    st.put({ ...base, id: 'workout:icu:run', kind: 'workout', date: '2026-11-16', modalityId: 'mod:corrida', duration: 30, startTime: '2026-11-16T10:11:00Z', distanceKm: 3.02, rpe: 7, feeling: 'Intervalos puxados na esteira inclinada.', metrics: { source: 'intervals', sport: 'VirtualRun', distanceKm: 3.02, avgHr: 140, maxHr: 188, avgCadence: 60.262066, tss: 23, kcal: 215 } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await page.goto('./#/treino');
  const card = page.getByTestId('workout-card');
  await expect(card).toHaveCount(1, { timeout: 10000 });
  await expect(card).toContainText('Pace');
  await expect(card).toContainText('9:56 /km');
  await expect(card).toContainText('121 ppm');
  await expect(card).toContainText('3,02 km');
  await expect(card).not.toContainText('rpm');
  await expect(card).not.toContainText('60.26');
  // nenhum valor quebra em duas linhas: as linhas da grade ficam na mesma altura
  const heights = await card.locator('.metric-grid .mv').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  if (process.env.SHOTS) await card.screenshot({ path: 'test-results/shots/corrida-metricas.png' });
});
