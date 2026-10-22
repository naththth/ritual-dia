import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Ela conta à treinadora que a musculação de terça à noite é LPO: vira regra, vale para o que já está registrado e pode ser desfeita.
test('treinadora cria regra pela conversa e reclassifica o treino', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T20:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      (window as any).__coachCtx = ctx;
      return { mensagem: 'Entendi: musculação de terça à noite é a sua aula de LPO.', acoes: [{ tipo: 'criar_regra', descricao: 'Musculação de terça à noite é LPO', de_modalidade_id: 'mod:musculacao', para_modalidade_id: 'mod:lpo', dias_semana: [2], de: '17:00', ate: '23:59' }, { tipo: 'guardar_preferencia', texto: 'LPO às terças à noite' }], sugestao_plano: '' };
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
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'workout:icu:i9', kind: 'workout', date: '2026-10-20', modalityId: 'mod:musculacao', duration: 63, startTime: '2026-10-20T22:37:00Z', metrics: { source: 'intervals', sport: 'WeightTraining', tss: 19, kcal: 245 } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-input').fill('Toda musculação de terça à noite é LPO');
  await page.getByTestId('coach-send').click();
  await expect(page.getByTestId('coach-done')).toContainText('Regra nova');
  await expect(page.getByTestId('coach-done')).toContainText('1 treino já registrado');
  const ctx = await page.evaluate(() => (window as any).__coachCtx);
  expect(ctx.treinos_recentes.some((w: any) => w.id === 'workout:icu:i9' && w.horario === '19:37' && w.dia_semana === 2)).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach.png' });
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.goBack();
  await page.getByRole('button', { name: /^ter, 20\/10/ }).click();
  await expect(page.getByTestId('workout-card')).toContainText('LPO');
  await expect(page.getByTestId('reclassified')).toContainText('pela sua regra');
  // desfazer volta a musculação
  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-undo').click();
  await page.goBack();
  await expect(page.getByTestId('workout-card')).toContainText('Musculação');
});
