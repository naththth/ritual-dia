import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// O Garmin grava LPO como musculação: no horário da aula, vira LPO e junta com o "Feito" manual.
test('musculação no horário do LPO vira LPO e o comentário tem botão de salvar', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-19T21:20:00-03:00'));
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
    st.put({ ...base, id: 'wtemplate:lpo-t', kind: 'wtemplate', name: 'Aula de LPO', modalityId: 'mod:lpo', duration: 60, intensity: 'intensa', time: '19:30' });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 1: ['wtemplate:lpo-t'] } });
    st.put({ ...base, id: 'workout:manual-lpo', kind: 'workout', date: '2026-10-19', modalityId: 'mod:lpo', duration: 60, intensity: 'intensa', templateId: 'wtemplate:lpo-t', fromPlan: true });
    st.put({ ...base, id: 'workout:icu:i1', kind: 'workout', date: '2026-10-19', modalityId: 'mod:musculacao', duration: 63, startTime: '2026-10-19T22:37:00Z', feeling: 'técnica boa', metrics: { source: 'intervals', tss: 19, avgHr: 107, maxHr: 156, kcal: 245 } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await expect(page.getByTestId('workout-card')).toHaveCount(1);
  await expect(page.getByTestId('workout-card')).toContainText('LPO');
  await expect(page.getByTestId('workout-card')).toContainText('156');
  await expect(page.getByTestId('reclassified')).toBeVisible();
  // comentário: aparece "Salvar" enquanto há texto novo; depois, "Salvo"
  await expect(page.getByTestId('feedback-saved')).toBeVisible();
  await page.getByLabel('Como foi o treino').fill('técnica boa, arranco pesado');
  await page.getByTestId('feedback-save').click();
  await expect(page.getByTestId('feedback-saved')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/lpo.png', fullPage: true });
});
