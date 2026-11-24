import { test, expect } from '@playwright/test';
import { openTrainingItems } from './fixtures/training';
import { expectButtonsFit } from './fixtures/fit';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Musculação planejada no desenho novo: números da sessão, "Como fazer", um card por exercício com foto,
// carga por série e meta do roteiro; ações do mesmo tamanho, sem texto cortado nem quebrado.
for (const width of [360, 393]) test(`musculação planejada abre com cards por exercício, carga e ações alinhadas (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00-03:00'));
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
    st.put({ ...base, id: 'wtemplate:b', kind: 'wtemplate', name: 'Musculação B · Corpo todo (Empurrar e Dobrar quadril)', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada', muscles: ['Corpo todo'],
      note: 'Execução controlada na descida. Descanse 90s entre séries.\n\n1. Supino reto com barra ou máquina 3x8-10 (meta: 30-35 kg total)\n2. Stiff com barra ou halteres 3x8-10 (meta: 24-32 kg)\n3. Pallof press no cabo 3x10 cada lado (meta: 10 kg)' });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-11-01', training: { 1: ['wtemplate:b'] } });
    st.put({ ...base, id: 'workout:prev', kind: 'workout', date: '2026-11-16', modalityId: 'mod:musculacao', duration: 35, exercises: [
      { id: 'p1', group: 'Peito', name: 'Supino reto com barra', sets: 3, reps: 10, loadKg: 35, setLoads: [15, 25, 35] },
      { id: 'p2', group: 'Pernas', name: 'Stiff com barra', sets: 3, reps: 10, loadKg: 15 }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await openTrainingItems(page);

  const plan = page.getByTestId('planned-strength');
  await expect(plan).toContainText('3exercícios');
  await expect(plan).toContainText('9séries');
  await expect(plan).toContainText('90 s');
  await expect(page.getByTestId('plan-how')).toContainText('Execução controlada na descida.');
  await expect(page.getByTestId('plan-how')).not.toContainText('Supino');
  const cards = page.getByTestId('plan-ex');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('Supino reto com barra ou máquina');
  await expect(cards.first()).toContainText('3×8-10');
  // uma linha por série: o plano (a pirâmide da sugestão, 16 → 26,5 → 37 kg) e os campos do que fez
  const rows = cards.first().getByTestId('set-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Plano 10 × 16 kg');
  await expect(rows.nth(2)).toContainText('Plano 10 × 37 kg');
  await expect(rows.nth(0).getByTestId('set-kg')).toHaveAttribute('placeholder', '16');
  await expect(cards.first()).toContainText('Meta 30-35 kg total');
  await expect(cards.first()).toContainText('Carga subiu: cumpriu o último');
  await expect(cards.nth(2)).toContainText('cada lado');
  await expect(cards.first().locator('img')).toHaveAttribute('src', /ex\/supino\.jpg$/);

  // corpo sem o recuo antigo: cards começam na mesma linha do título
  const item = page.getByTestId('planned-item');
  const tx = (await item.locator('.titem-t').boundingBox())!.x;
  const cx = (await cards.first().boundingBox())!.x;
  expect(Math.abs(cx - tx)).toBeLessThanOrEqual(2);

  // ações: principal numa linha; secundárias do mesmo tamanho e sem quebra
  const main = page.getByTestId('train-done');
  await expect(main).toContainText('Feito, como programado');
  const mb = (await main.boundingBox())!;
  expect(mb.height).toBeLessThan(60);
  const secs = item.locator('.tp-sec');
  await expect(secs).toHaveCount(2);
  await expect(secs.first()).toContainText('Mudar o plano');
  await expectButtonsFit(item.locator('.tp-sec, .tp-main'));
  // botões do par com respiro entre eles
  const [a, b] = [(await secs.nth(0).boundingBox())!, (await secs.nth(1).boundingBox())!];
  expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(10);
  if (process.env.SHOTS) await item.screenshot({ path: `/tmp/claude-0/shots/planned-strength-${width}.png` });

  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);

  // mudar o plano: cada mudança já vale, sem salvar; Pronto volta aos cards
  await page.getByTestId('strength-edit').click();
  await expect(page.getByTestId('exercise-row')).toHaveCount(3);
  if (process.env.SHOTS) await item.screenshot({ path: `/tmp/claude-0/shots/planned-strength-edit-${width}.png` });
  await page.getByTestId('strength-edit-save').click();
  await expect(page.getByTestId('plan-ex')).toHaveCount(3);
  expect(errors).toEqual([]);
});

// Planejado × realizado: ela toca nas séries que fez, ajusta a que mudou, e o plano não muda.
test('marca série a série, ajusta a carga, conclui e o treino feito compara com o plano', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-23T19:00:00-03:00'));
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
    st.put({ ...base, id: 'wtemplate:b', kind: 'wtemplate', name: 'Musculação B', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada', muscles: ['Corpo todo'],
      note: 'Descanse 90s.\n\n1. Supino reto com barra 3x10\n2. Remada curvada 3x10' });
    st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-11-01', training: { 1: ['wtemplate:b'] } });
    st.put({ ...base, id: 'workout:prev', kind: 'workout', date: '2026-11-16', modalityId: 'mod:musculacao', duration: 35, rpe: 9, exercises: [
      { id: 'p1', group: 'Peito', name: 'Supino reto com barra', sets: 3, reps: 10, loadKg: 20 },
      { id: 'p2', group: 'Costas', name: 'Remada curvada', sets: 3, reps: 10, loadKg: 25 }] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await openTrainingItems(page);
  const cards = page.getByTestId('plan-ex');
  const rows = cards.nth(0).getByTestId('set-row');
  // carga mantida (o último foi puxado): plano de 10 × 20 nas três séries
  await expect(rows.nth(0)).toContainText('Plano 10 × 20 kg');
  // ✓ marca como planejado; na 2ª ela escreve o que fez: 8 repetições com 22 kg
  await rows.nth(0).getByTestId('set-check').click();
  await expect(rows.nth(0).getByTestId('set-check')).toHaveAttribute('aria-pressed', 'true');
  // campo vazio = igual ao plano (o plano aparece no campo, agora na cor de feito)
  await expect(rows.nth(0).getByTestId('set-reps')).toHaveValue('');
  await expect(rows.nth(0)).toHaveClass(/on/);
  await rows.nth(1).getByTestId('set-reps').fill('8');
  await rows.nth(1).getByTestId('set-kg').fill('22');
  await rows.nth(1).getByTestId('set-kg').blur();
  await expect(rows.nth(1)).toHaveClass(/diff/);
  await expect(cards.nth(0)).toContainText('2 de 3 séries feitas');
  await expect(page.getByTestId('strength-progress')).toContainText('2 de 6 séries feitas');
  // nada encavala: o número da série, o plano, os campos e o ✓ ficam dentro da linha
  for (const r of await rows.all()) {
    const box = (await r.boundingBox())!;
    for (const el of await r.locator('.tp-row-n, .tp-row-plan, .tp-f, .tp-check').all()) {
      const b = (await el.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    const plan = (await r.locator('.tp-row-plan').boundingBox())!;
    const chk = (await r.locator('.tp-check').boundingBox())!;
    expect(plan.x + plan.width).toBeLessThanOrEqual(chk.x);
  }
  // nenhum texto do card do exercício passa da borda (o aviso do topo quebra linha em vez de vazar)
  for (const ex of await cards.all()) {
    const over = await ex.evaluate((card) => {
      const right = card.getBoundingClientRect().right;
      const range = document.createRange();
      let worst = 0;
      card.querySelectorAll('span, b, button, label, li').forEach((el) => { range.selectNodeContents(el); worst = Math.max(worst, range.getBoundingClientRect().right - right); });
      return worst;
    });
    expect(over).toBeLessThanOrEqual(0);
  }
  if (process.env.SHOTS) await page.getByTestId('planned-item').screenshot({ path: '/tmp/claude-0/shots/strength-marcando.png' });
  await expectButtonsFit(page.getByTestId('planned-item').locator('.tp-sec, .tp-main'));
  // a remada não foi feita hoje
  await cards.nth(1).getByTestId('ex-skip').click();
  await expect(cards.nth(1)).toContainText('Não feito');
  await expect(page.getByTestId('strength-progress')).toContainText('2 de 3 séries feitas');

  // grava a cada toque: recarregar não perde nada
  await page.reload();
  await openTrainingItems(page);
  await expect(page.getByTestId('plan-ex').nth(0).getByTestId('set-row').nth(1).getByTestId('set-kg')).toHaveValue('22');
  await expect(page.getByTestId('plan-ex').nth(0).getByTestId('set-row').nth(1).getByTestId('set-reps')).toHaveValue('8');
  await expect(page.getByTestId('plan-ex').nth(1)).toContainText('Não feito');

  // o plano continua o mesmo
  const tpl = await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const g = db.transaction('records').objectStore('records').get('wtemplate:b');
    await new Promise((r) => { g.onsuccess = r; });
    return g.result;
  });
  expect(tpl.note).toContain('1. Supino reto com barra 3x10');

  await page.getByTestId('strength-finish').click();
  const done = page.getByTestId('workout-card');
  await expect(done).toHaveCount(1);
  await openTrainingItems(page);
  const sum = done.getByTestId('exercise-summary');
  await expect(sum).toContainText('Supino reto com barra');
  await expect(sum).not.toContainText('Remada curvada');
  // feito: 2 séries (10 × 20 e 8 × 22); o plano fica ao lado
  await expect(sum).toContainText('Plano:');
  await expect(sum).toContainText('3×10, 20 kg');
  await expect(page.getByTestId('plan-ex')).toHaveCount(0);
  expect(errors).toEqual([]);
});
