import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

// A treinadora lê as cargas lançadas no card da musculação, abre e fica no fim da conversa,
// e depois de horas parada começa uma conversa nova, levando só o resumo da anterior.
test('treinadora: cargas no contexto, rolagem no fim e conversas em sessões', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-25T13:00:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      (window as any).__coachCtx = ctx;
      return { mensagem: 'Leg press foi a 120 kg na última série; na próxima, tente 120 a 125 kg.', acoes: [{ tipo: 'guardar_preferencia', texto: 'Sugerir faixas de carga por exercício' }] };
    };
  });
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records', 'meta'], 'readwrite');
    const st = tx.objectStore('records');
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'workout:icu:i77', kind: 'workout', date: '2026-10-25', modalityId: 'mod:musculacao', duration: 50, startTime: '2026-10-25T13:00:00Z', metrics: { source: 'intervals', sport: 'WeightTraining' },
      exercises: [{ id: 'e1', group: 'Pernas', name: 'Leg press', sets: 3, reps: 10, loadKg: 120, setLoads: [100, 110, 120], planned: { name: 'Leg press', sets: 3, reps: 10, loadKg: 100 } }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    // Conversa longa em andamento, para conferir que abre no fim.
    const at = new Date('2026-10-25T12:30:00-03:00').getTime();
    const msgs = Array.from({ length: 16 }, (_, i) => ({ from: i % 2 ? 'ai' : 'me', text: `Mensagem ${i + 1}: ${'texto de exemplo para ocupar espaço na tela. '.repeat(3)}`, at: at + i * 1000 }));
    tx.objectStore('meta').put({ key: 'coach-chat', value: msgs });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');

  const atBottom = () => page.evaluate(() => { const b = document.querySelector('[data-testid="coach"] .sh-body') as HTMLElement; return b.scrollHeight - b.scrollTop - b.clientHeight < 4; });

  await page.getByTestId('coach-open').click();
  await expect(page.getByText('Mensagem 16:')).toBeVisible();
  await expect.poll(atBottom).toBe(true);

  await page.getByTestId('coach-input').fill('O que achou da musculação de hoje?');
  await page.getByTestId('coach-send').click();
  await expect(page.getByText('tente 120 a 125 kg')).toBeVisible();
  await expect.poll(atBottom).toBe(true);
  const ctx = await page.evaluate(() => (window as any).__coachCtx);
  const w = ctx.treinos_recentes.find((x: any) => x.id === 'workout:icu:i77');
  expect(w.exercicios[0]).toMatchObject({ nome: 'Leg press', carga_kg: 120, cargas_por_serie: [100, 110, 120], volume_kg: 3300 });
  expect(ctx.conversa.length).toBeLessThanOrEqual(12);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-sessions.png' });

  // Sete horas depois: conversa nova, com a anterior resumida.
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.clock.setFixedTime(new Date('2026-10-25T20:30:00-03:00'));
  await page.getByTestId('coach-open').click();
  await expect(page.getByText('Mensagem 16:')).toHaveCount(0);
  await expect(page.getByTestId('coach-past')).toBeVisible();
  await page.getByTestId('coach-input').fill('Amanhã pedal leve?');
  await page.getByTestId('coach-send').click();
  await expect(page.getByText('tente 120 a 125 kg')).toBeVisible();
  const ctx2 = await page.evaluate(() => (window as any).__coachCtx);
  expect(ctx2.conversa).toHaveLength(0);
  expect(ctx2.conversas_anteriores[0].assunto).toContain('Mensagem 1:');
  expect(ctx2.conversas_anteriores[0].mudou_no_app.join(' ')).toContain('faixas de carga');

  // Conversa anterior abre só para leitura; "Nova conversa" encerra a atual.
  await page.getByTestId('coach-past').click();
  await page.getByTestId('coach-past-list').getByRole('button').first().click();
  await expect(page.getByTestId('coach-old')).toContainText('Mensagem 16:');
  await page.getByRole('button', { name: /Voltar à conversa/ }).click();
  await page.getByTestId('coach-new').click();
  await expect(page.getByText('Amanhã pedal leve?')).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-new.png' });
});
