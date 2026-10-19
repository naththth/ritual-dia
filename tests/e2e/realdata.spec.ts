import { test, expect } from '@playwright/test';
import path from 'node:path';

// Dados como chegam do intervals.icu: treino do MyWhoosh e dias só com carga (sem sono ainda).
test('abre com dados vindos do intervals', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T19:24:00-03:00'));
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    st.put({ id: 'workout:icu:i196589159', kind: 'workout', deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5, date: '2026-10-12', name: 'MyWhoosh - Old Town Sprint', metrics: { if: 0.45, np: 129, tss: 10, kcal: 224, avgHr: 153, maxHr: 175, sport: 'VirtualRide', source: 'intervals', ascentM: 23.6, ftpUsed: 285, avgPower: 122, avgCadence: 66.01, distanceKm: 12.31 }, duration: 31, fromPlan: false, intensity: 'leve', startTime: '2026-10-12T18:42:13Z', distanceKm: 12.31, modalityId: 'mod:ciclismo' });
    for (let d = 1; d <= 19; d++) { const k = `2026-10-${String(d).padStart(2, '0')}`; st.put({ id: `wellness:${k}`, kind: 'wellness', deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5, date: k, source: 'intervals', ctl: 0.4, atl: 1.3 }); }
    st.put({ id: 'skip:2026-10-19:food:lanche', kind: 'skip', deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5, ref: 'lanche', date: '2026-10-19', domain: 'food' });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  for (const r of ['#/', '#/treino', '#/alimentacao', '#/ajustes', '#/evolucao']) {
    await page.goto('./' + r);
    await page.waitForTimeout(400);
    await expect(page.locator('body')).not.toContainText('Algo nesta tela falhou');
  }
});
