import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

const readAll = () => async () => {
  const req = indexedDB.open('ritual');
  const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
  return await new Promise<any[]>((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
};

// Ela leva o treino de sábado para domingo e depois pede para tirar o de hoje: nada apaga o modelo do plano e a semana conta uma vez só.
test('treinadora muda o treino de dia e tira o planejado sem apagar o plano', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T12:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      const tpl = ctx.proximos_dias[0].treinos[0]?.template_id;
      (window as any).__tpl = tpl;
      // Erro de antes: a IA manda o ID do planejado como se fosse um treino registrado.
      if (/tira/i.test(ctx.fala_dela)) return { mensagem: 'Tirei o de hoje.', acoes: [{ tipo: 'excluir_treino', treino_id: tpl, motivo: 'foi para amanhã' }] };
      return { mensagem: 'Combinado, fica para amanhã.', acoes: [{ tipo: 'mover_treino', template_id: tpl, de: ctx.hoje, para: ctx.proximos_dias[1].data }] };
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
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    // Plano fictício: pedal regenerativo no sábado.
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'wtemplate:t-regen', kind: 'wtemplate', name: 'Pedal regenerativo', modalityId: 'mod:ciclismo', duration: 30, intensity: 'leve' });
    st.put({ ...base, id: 'plan:t-treino', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 6: ['wtemplate:t-regen'] } });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');

  // 1) Tirar com o ID errado: vira "não hoje", o modelo continua no plano.
  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-input').fill('Tira o treino de hoje');
  await page.getByTestId('coach-send').click();
  await expect(page.getByTestId('coach-done')).toContainText('saiu de sáb 24/10');
  await expect(page.getByText('Não consegui')).toHaveCount(0);
  const tpl = await page.evaluate(() => (window as any).__tpl);
  let recs = await page.evaluate(readAll());
  expect(recs.find((r) => r.id === tpl).deleted).toBe(0);
  expect(recs.find((r) => r.id === `skip:2026-10-24:training:${tpl}`)?.deleted).toBe(0);
  await page.getByTestId('coach-undo').first().click();

  // 2) Mudar de dia: sai de sábado sem riscar e entra no domingo.
  await page.getByTestId('coach-input').fill('Joga o treino de hoje para amanhã');
  await page.getByTestId('coach-send').click();
  await expect(page.getByTestId('coach-done').last()).toContainText('foi de sáb 24/10 para dom 25/10');
  recs = await page.evaluate(readAll());
  expect(recs.find((r) => r.id === `skip:2026-10-24:training:${tpl}`)?.movedTo).toBe('2026-10-25');
  expect(recs.find((r) => r.id === `extra:2026-10-25:training:${tpl}`)?.deleted).toBe(0);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.goBack();
  await expect(page.getByTestId('planned-replaced')).toContainText('foi para dom 25/10');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-move.png' });
  await page.getByRole('button', { name: /^dom, 25\/10/ }).click();
  await expect(page.getByTestId('planned-replaced')).toHaveCount(0);
});
