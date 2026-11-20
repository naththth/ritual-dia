import { test, expect } from '@playwright/test';
import { openTrainingItems } from './fixtures/training';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Treino de força feito e lançado: capa com foto, números da sessão, "Como foi" com as palavras dela
// e um card por exercício, comparado com a última sessão parecida.
test('treino de força aberto mostra capa, como foi e exercícios comparados', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-20T20:00:00-03:00'));
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
    st.put({ ...base, id: 'workout:old', kind: 'workout', date: '2026-10-02', modalityId: 'mod:musculacao', duration: 60, exercises: [
      { id: 'o1', group: 'Pernas', name: 'Agachamento livre', sets: 5, reps: 8, setReps: [8, 6, 4, 3, 2], setLoads: [20, 40, 50, 60, 70], loadKg: 70 }] });
    st.put({ ...base, id: 'workout:prev', kind: 'workout', date: '2026-10-14', modalityId: 'mod:musculacao', duration: 50, exercises: [
      { id: 'p1', group: 'Pernas', name: 'Cadeira extensora', sets: 3, reps: 20, loadKg: 30 },
      { id: 'p2', group: 'Pernas', name: 'Stiff com barra', sets: 3, reps: 8, loadKg: 28 }] });
    st.put({ ...base, id: 'workout:hoje', kind: 'workout', date: '2026-10-20', modalityId: 'mod:musculacao', duration: 45, startTime: '2026-10-20T14:00:00Z', rpe: 7,
      feeling: 'Na última série do agachamento perdi a força, o resto foi bem',
      metrics: { source: 'intervals', tss: 20, kcal: 230, avgHr: 120, maxHr: 150 },
      exercises: [
        { id: 'h1', group: 'Pernas', name: 'Stiff com barra', sets: 3, reps: 8, loadKg: 28, planned: { name: 'Stiff com barra', sets: 3, reps: 10, loadKg: 16 } },
        { id: 'h2', group: 'LPO', name: 'Push press com barra leve', sets: 3, reps: 10, loadKg: 15 },
        { id: 'h3', group: 'Pernas', name: 'Agachamento livre', sets: 6, reps: 10, setReps: [10, 6, 4, 2, 1, 1], setLoads: [30, 45, 55, 65, 72, 72], loadKg: 72 },
        { id: 'h4', group: 'Pernas', name: 'Cadeira extensora', sets: 3, reps: 20, loadKg: 35 }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByTestId('day-screen')).toBeVisible();
  await page.goto('./#/treino');
  await openTrainingItems(page);
  const card = page.getByTestId('workout-card');

  // capa e números: duração, exercícios, séries e quilos levantados
  const hero = card.getByTestId('session-hero');
  await expect(hero).toContainText('45');
  await expect(hero).toContainText('4 exercícios · 15 séries');
  await expect(hero).toContainText('kg levantados');
  await expect(hero).toContainText('120');
  await expect(hero).toContainText('FC méd/máx');
  const loaded = await hero.locator('img').evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth).catch(() => 0));
  expect(loaded).toBeGreaterThan(0);

  // "Como foi" mostra esforço e as palavras dela; editar abre o formulário
  const feel = card.getByTestId('feel-card');
  await expect(feel).toContainText('Esforço 7/10');
  await expect(feel).toContainText('perdi a força');

  // exercícios: comparação com a última sessão parecida, primeira vez e plano
  const exs = card.getByTestId('ex-card');
  await expect(exs).toHaveCount(4);
  await expect(exs.nth(0).getByTestId('ex-compare')).toHaveText('Mesma carga de 14/10');
  await expect(exs.nth(0)).toContainText('Plano: 3×10, 16 kg');
  await expect(exs.nth(1).getByTestId('ex-compare')).toHaveText('Primeira vez');
  await expect(exs.nth(2)).toContainText('Pirâmide');
  await expect(exs.nth(2)).toContainText('Topo anterior · 02/10');
  await expect(exs.nth(3).getByTestId('ex-compare')).toHaveText('+5 kg desde 14/10');
  for (const i of [0, 1, 2, 3]) {
    const ok = await exs.nth(i).locator('img').evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth).catch(() => 0));
    expect(ok).toBeGreaterThan(0);
  }

  // abrir o exercício: série a série e a comparação com a sessão anterior
  await exs.nth(2).locator('.ss-ex-head').click();
  await expect(exs.nth(2).locator('.ss-sets li')).toHaveCount(6);
  await expect(exs.nth(2)).toContainText('Comparado a 02/10');
  await expect(exs.nth(2)).toContainText('70 → 72 kg');

  // nada cortado nem vazando no celular
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  const clipped = await card.evaluate((el) => [...el.querySelectorAll('.ss-ex-n, .ss-chip, .ss-sub, .ss-tile span, .ss-foot span, .ss-trail span')]
    .filter((n) => (n as HTMLElement).scrollWidth > (n as HTMLElement).clientWidth + 1).map((n) => n.textContent));
  expect(clipped).toEqual([]);
  if (process.env.SHOTS) await card.screenshot({ path: '/tmp/claude-0/shots/session.png' });

  await feel.getByTestId('feel-edit').click();
  await expect(card.getByLabel('Como foi o treino')).toHaveValue('Na última série do agachamento perdi a força, o resto foi bem');
  await card.getByTestId('feel-done').click();
  await expect(feel).toContainText('perdi a força');
  expect(errors).toEqual([]);
});
