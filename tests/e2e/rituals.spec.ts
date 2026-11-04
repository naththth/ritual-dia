import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

async function seed(page: Page, when = '2026-11-04T07:30:00-03:00') {
  await page.clock.setFixedTime(new Date(when));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      if (task === 'week_cross') return { titulo: 'Semana de base, sono curto no meio', leitura: 'O sono caiu na quarta e o humor acompanhou.', funcionou: ['Remédios em dia'], pesou: ['Duas noites curtas'], proxima_semana: [{ area: 'treino', acao: 'Trocar o pedal de quarta por Z2', por_que: 'Sono curto nas quartas' }, { area: 'sono', acao: 'Café só até as 14h', por_que: 'Noites mais curtas depois de café tarde' }] };
      return {};
    };
  });
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction(['records'], 'readwrite');
    const st = tx.objectStore('records');
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: new Date('2026-10-01T12:00:00Z').getTime() };
    st.put({ ...base, id: 'intake:a', kind: 'intake', name: 'Vitamina D', type: 'vitamina', dose: '1 cápsula', times: ['06:40'], active: true, order: 1 });
    st.put({ ...base, id: 'wtemplate:vo2', kind: 'wtemplate', name: 'Pedal VO2', modalityId: 'mod:ciclismo', duration: 60, intensity: 'intensa', steps: [{ label: 'Aquecimento', minutes: 10, pct: 55 }, { label: 'VO2', minutes: 5, pct: 115 }] });
    st.put({ ...base, id: 'plan:tr', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 3: ['wtemplate:vo2'] } });
    st.put({ ...base, id: 'wellness:2026-11-04', kind: 'wellness', date: '2026-11-04', sleepH: 5.4, sleepFlag: 'confirmado', sleepStart: '00:40', sleepEnd: '06:05' });
    for (let i = 1; i <= 10; i++) { const d = new Date(Date.UTC(2026, 10, 4 - i)).toISOString().slice(0, 10); st.put({ ...base, id: `wellness:${d}`, kind: 'wellness', date: d, sleepH: 7 + (i % 3) * 0.3, sleepStart: '22:20', sleepEnd: '06:00' }); st.put({ ...base, id: `mood:${d}:pm`, kind: 'mood', date: d, period: 'pm', mood: i % 4 === 0 ? -1 : 0, tags: [] }); }
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true, targets: { kcal: 1223, p: 135 }, reminders: { ...(g.result.reminders ?? {}), enabled: true, sleep: { wake: '06:00', hours: 8, latency: 15, alarm: true, bed: true, bedGoal: '22:00', bedFinal: '21:30' } } });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
}

test('ritual da manhã passo a passo e o conselho troca o treino forte', async ({ page }) => {
  await seed(page);
  // Conselho: noite curta + treino forte = a treinadora propõe o regenerativo.
  await expect(page.getByTestId('council')).toContainText('Pedal VO2 vira pedal regenerativo');
  await expect(page.getByTestId('council')).toContainText('Hoje não é dia de apertar');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/hoje-ritual.png', fullPage: true });
  await page.getByTestId('ritual-hero-am').click();
  await expect(page.getByTestId('ritual-am')).toContainText('Como você acordou?');
  await expect(page.getByTestId('ritual-am')).toContainText('5,4 h de sono');
  await page.getByTestId('rt-wake-cansada').click();
  await page.getByTestId('rt-mood--1').click();
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/ritual-checkin.png' });
  await page.getByTestId('rt-checkin-save').click();
  await expect(page.getByTestId('ritual-am')).toContainText('Remédios e vitaminas');
  await page.getByTestId('rt-doses').click();
  await expect(page.getByTestId('ritual-am')).toContainText('O treino de hoje');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/ritual-treino.png' });
  await page.getByTestId('rt-train').click();
  await expect(page.getByTestId('ritual-done')).toContainText('Manhã pronta');
  await expect(page.getByTestId('ritual-done')).toContainText('Humor -1');
  await page.waitForTimeout(1200);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/ritual-fim.png' });
  await page.getByTestId('rt-close').click();
  await expect(page.getByTestId('ritual-hero-am')).toHaveCount(0);
  await expect(page.getByTestId('tl-checkin-am')).toContainText('cansada');
  // Aprova a troca do treino.
  await page.getByTestId('council-regen').getByTestId('council-approve').click();
  await expect(page.getByTestId('timeline')).toContainText('Pedal regenerativo');
  await expect(page.getByTestId('council-regen')).toHaveCount(0);
});

test('ritual da noite fecha o dia e mostra o amanhã', async ({ page }) => {
  await seed(page, '2026-11-04T20:30:00-03:00');
  await page.getByTestId('ritual-hero-pm').click();
  await page.getByTestId('rt-mood-0').click();
  await page.getByLabel('Energia 2').click();
  await page.getByTestId('rt-checkin-save').click();
  await expect(page.getByTestId('ritual-pm')).toContainText('Amanhã, quinta');
  await expect(page.getByTestId('ritual-pm')).toContainText('Deitar às 22:00');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/ritual-noite.png' });
  await page.getByTestId('rt-night').click();
  await expect(page.getByTestId('ritual-done')).toContainText('Boa noite');
});

test('leitura da semana: números, leitura da equipe e ajustes levados à especialista', async ({ page }) => {
  await seed(page, '2026-11-08T19:00:00-03:00');
  await expect(page.getByTestId('week-teaser')).toBeVisible();
  await page.getByTestId('week-teaser').click();
  await expect(page.getByTestId('week-review')).toContainText('Semana de base, sono curto no meio');
  await expect(page.getByTestId('week-next')).toHaveCount(2);
  const ctx = await page.evaluate(() => (window as any).__ctx.week_cross);
  expect(ctx.semana).toBe('2026-11-02 a 2026-11-08');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/shots/semana.png', fullPage: true });
  await page.getByText('Combinar com a treinadora').click();
  await expect(page.getByTestId('coach-input').or(page.locator('[data-testid="coach"] textarea'))).toHaveValue(/Trocar o pedal de quarta/);
});
