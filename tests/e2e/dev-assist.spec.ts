import { test, expect } from '@playwright/test';
import path from 'node:path';

// Em qualquer tela: abrir a sessão de ajuste, descrever, finalizar e ver a sessão na fila com a tela registrada.
test('sessão de ajuste com o Claude a partir da tela de treino', async ({ page }) => {
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
  await page.getByTestId('dev-open').click();
  await expect(page.getByTestId('dev')).toContainText('Tela: Treino');
  await page.getByTestId('dev-start').click();
  await page.getByTestId('dev-input').fill('O resumo da semana deveria mostrar o TSS total');
  await page.getByTestId('dev-send').click();
  await expect(page.getByTestId('dev-log')).toContainText('TSS total');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/dev-open.png' });
  await page.getByTestId('dev-finish').click();
  await expect(page.getByTestId('dev-status')).toContainText('Na fila');
  const rec = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
    return all.find((x) => x.kind === 'devreq');
  });
  expect(rec).toMatchObject({ status: 'finalizada', route: '/treino', screen: 'Treino' });
  expect(rec.snapshot).toContain('Treino');
  expect(rec.messages[0].text).toContain('TSS');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/dev-queued.png' });
});
