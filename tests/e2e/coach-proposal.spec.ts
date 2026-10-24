import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Ela não foi à yoga e pede um pedal: a treinadora propõe, ela aprova, o pedal entra no dia e a yoga sai.
test('treinadora propõe pedal no lugar da yoga e ele entra no dia depois do aprovo', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T12:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      (window as any).__coachCtx = ctx;
      const today = ctx.proximos_dias[0];
      const out = today.treinos.filter((t: any) => t.modalidade_id !== 'mod:ciclismo').map((t: any) => t.template_id);
      const reps = Array.from({ length: 5 }, () => [{ rotulo: 'Forte', minutos: 0.5, pct: 120 }, { rotulo: 'Leve', minutos: 0.5, pct: 50 }]).flat();
      return {
        mensagem: 'Sem yoga hoje, então um pedal curto com estímulo de VO2 e muito Z2 em volta.',
        acoes: [{ tipo: 'propor_treino', data: ctx.hoje, nome: 'Pedal VO2 curto', modalidade_id: 'mod:ciclismo', intensidade: 'moderada', blocos: [{ rotulo: 'Aquecimento', minutos: 8, pct: 60 }, ...reps, { rotulo: 'Volta à calma', minutos: 6, pct: 50 }], substitui_template_ids: out }]
      };
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
    st.put({ ...g.result, onboarded: true, ftp: 190 });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-input').fill('Hoje não fiz yoga, quero um pedal');
  await page.getByTestId('coach-send').click();
  const card = page.getByTestId('coach-proposal');
  await expect(card).toContainText('Pedal VO2 curto');
  await expect(card).toContainText('19 min');
  await expect(card).toContainText('228 W'); // 120% de 190
  const ctx = await page.evaluate(() => (window as any).__coachCtx);
  expect(ctx.ftp).toBe(190);
  expect(ctx.proximos_dias).toHaveLength(7);
  // antes do aprovo nada muda
  const before = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
    return all.filter((x) => x.kind === 'extra').length;
  });
  expect(before).toBe(0);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-proposal.png' });
  await page.getByTestId('coach-approve').click();
  await expect(card).toContainText('Aprovado');
  await expect(page.getByTestId('coach-done')).toContainText('Pedal VO2 curto entrou em sáb 24/10');
  const after = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
    const ex = all.filter((x) => x.kind === 'extra' && !x.deleted);
    const tpl = all.find((x) => x.id === ex[0]?.ref);
    return { n: ex.length, date: ex[0]?.date, steps: tpl?.steps?.length, oneOff: tpl?.oneOff, archived: tpl?.archived, skips: all.filter((x) => x.kind === 'skip' && x.date === '2026-10-24' && !x.deleted).length };
  });
  expect(after).toMatchObject({ n: 1, date: '2026-10-24', steps: 12, oneOff: '2026-10-24', archived: true });
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-approved.png' });
  // desfazer tira o pedal
  await page.getByTestId('coach-undo').click();
  await expect(page.getByTestId('coach-done')).toContainText('Desfeito');
});
