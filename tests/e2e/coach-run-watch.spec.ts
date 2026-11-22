import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Corrida proposta pela treinadora: o card mostra o alvo de FC de cada bloco e o aprovo manda ao relógio (não ao MyWhoosh).
test('corrida proposta mostra alvo de FC e vai para o relógio como runSteps', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T12:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      const reps = Array.from({ length: 4 }, () => [
        { rotulo: 'Trote', minutos: 2, pct: 70, alvo: 'FC 135-145 bpm · esforço 4' },
        { rotulo: 'Caminhada', minutos: 2, pct: 50, alvo: 'FC abaixo de 125 bpm' }
      ]).flat();
      return {
        mensagem: 'Corre e caminha curto, com teto de FC para manter o Z2.',
        acoes: [{ tipo: 'propor_treino', data: ctx.hoje, nome: 'Corrida · corre e caminha', modalidade_id: 'mod:corrida', intensidade: 'leve', blocos: [{ rotulo: 'Caminhada de aquecimento', minutos: 5, pct: 45, alvo: 'FC abaixo de 120 bpm' }, ...reps, { rotulo: 'Volta à calma', minutos: 3, pct: 40 }], substitui_template_ids: [] }]
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
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-input').fill('Quero uma corrida leve hoje');
  await page.getByTestId('coach-send').click();
  const card = page.getByTestId('coach-proposal');
  await expect(card).toContainText('Corrida · corre e caminha');
  await expect(card).toContainText('FC 135-145 bpm');
  await expect(card).not.toContainText('% ·');
  await expect(page.getByTestId('coach-approve')).toContainText('relógio');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/coach-run.png' });
  await page.getByTestId('coach-approve').click();
  await expect(card).toContainText('Aprovado');
  const tpl = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
    const ex = all.find((x) => x.kind === 'extra' && !x.deleted);
    const t = all.find((x) => x.id === ex?.ref);
    return { steps: t?.steps, run: t?.runSteps?.length, target: t?.runSteps?.[1]?.target };
  });
  expect(tpl).toEqual({ steps: undefined, run: 10, target: 'FC 135-145 bpm · esforço 4' });
});
