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
  await expect(cards.first()).toContainText('Carga por série');
  await expect(cards.first()).toContainText('Meta 30-35 kg total');
  await expect(cards.first()).toContainText('Subiu: você cumpriu o último');
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

  // editar continua: o editor abre e Concluir volta aos cards
  await page.getByTestId('strength-edit').click();
  await expect(page.getByTestId('exercise-row')).toHaveCount(3);
  if (process.env.SHOTS) await item.screenshot({ path: `/tmp/claude-0/shots/planned-strength-edit-${width}.png` });
  await page.getByTestId('strength-edit-save').click();
  await expect(page.getByTestId('plan-ex')).toHaveCount(3);
  expect(errors).toEqual([]);
});
