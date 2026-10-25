import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Ela conta que mudou o FTP no MyWhoosh: a treinadora grava no app, e o desfazer volta o anterior.
test('treinadora atualiza o FTP pela conversa', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-25T16:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string) => (task === 'training_coach' ? { mensagem: 'Atualizei seu FTP para 145 W.', acoes: [{ tipo: 'atualizar_ftp', ftp: 145 }] } : {});
  });
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  const ftp = () => page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const g = db.transaction('records').objectStore('records').get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    return g.result?.ftp;
  });
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
  await page.getByTestId('coach-input').fill('Mudei meu FTP no MyWhoosh para 145');
  await page.getByTestId('coach-send').click();
  await expect(page.getByTestId('coach-done')).toContainText('FTP agora é 145 W (era 190)');
  expect(await ftp()).toBe(145);
  await page.getByTestId('coach-undo').click();
  await expect.poll(ftp).toBe(190);
});
