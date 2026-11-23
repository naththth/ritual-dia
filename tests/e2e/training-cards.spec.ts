import { test, expect } from '@playwright/test';
import { openTrainingItems } from './fixtures/training';
import { expectButtonsFit } from './fixtures/fit';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Todo treino, de qualquer esporte e em qualquer dia, abre no mesmo desenho: capa, números grandes,
// "Como fazer", blocos coloridos por zona e ações do mesmo tamanho; nada cortado nem vazando para o lado.
for (const width of [360, 393]) {
  test(`cards de pedal, corrida e ioga, planejados e feitos, no desenho novo (${width}px)`, async ({ page }) => {
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
      st.put({ ...base, id: 'wtemplate:bike', kind: 'wtemplate', name: 'MyWhoosh · Tiros curtos Z5 / Z1', modalityId: 'mod:ciclismo', duration: 28, intensity: 'intensa',
        note: 'Tiros curtos com recuperação completa. Cadência alta nos tiros.',
        steps: [{ pct: 55, label: 'Aquecimento progressivo', minutes: 8 }, { pct: 115, label: 'Tiro 1', minutes: 1 }, { pct: 50, label: 'Recuperação', minutes: 2 }, { pct: 115, label: 'Tiro 2', minutes: 1 }, { pct: 45, label: 'Volta à calma', minutes: 7 }] });
      st.put({ ...base, id: 'wtemplate:run', kind: 'wtemplate', name: 'Corrida leve com progressivo', modalityId: 'mod:corrida', duration: 40, intensity: 'moderada', distanceKm: 5,
        runSteps: [{ pct: 65, label: 'Trote de aquecimento', minutes: 10, target: 'FC 125-135' }, { pct: 78, label: 'Contínuo confortável', minutes: 22, target: 'FC 140-150' }, { pct: 60, label: 'Desaquecer caminhando', minutes: 8, target: 'FC abaixo de 120' }] });
      st.put({ ...base, id: 'wtemplate:yoga', kind: 'wtemplate', name: 'Ioga para soltar quadril', modalityId: 'mod:yoga', duration: 15, intensity: 'leve', note: 'Sequência curta para quadril e posterior, respiração lenta.' });
      st.put({ ...base, id: 'plan:training-t', kind: 'plan', domain: 'training', validFrom: '2026-11-01', training: { 1: ['wtemplate:bike', 'wtemplate:run', 'wtemplate:yoga'] } });
      st.put({ ...base, id: 'workout:run', kind: 'workout', date: '2026-11-24', modalityId: 'mod:corrida', duration: 31, startTime: '2026-11-24T10:11:00Z', distanceKm: 4.02, rpe: 6, feeling: 'Ritmo confortável, pernas soltas.',
        metrics: { source: 'intervals', sport: 'Run', distanceKm: 4.02, avgHr: 146, maxHr: 171, avgCadence: 81, tss: 34, kcal: 290, ascentM: 22 } });
      st.put({ ...base, id: 'workout:bike', kind: 'workout', date: '2026-11-24', modalityId: 'mod:ciclismo', duration: 45, startTime: '2026-11-24T21:00:00Z', distanceKm: 21.4,
        metrics: { source: 'fit', sport: 'VirtualRide', distanceKm: 21.4, avgPower: 128, np: 141, if: 0.78, tss: 46, avgHr: 138, maxHr: 165, avgCadence: 88, kcal: 360, best20: 150, ftpUsed: 180,
          zones: { Z1: 6, Z2: 22, Z3: 9, Z4: 5, Z5: 3, Z6: 0 } } });
      const g = st.get('settings');
      await new Promise((r) => { g.onsuccess = r; });
      st.put({ ...g.result, onboarded: true, ftp: 180 });
      await new Promise((r) => { tx.oncomplete = r; });
    });
    await page.goto('./#/');
    await page.reload();
    await page.goto('./#/treino');
    await openTrainingItems(page);

    // planejados: números, como fazer, blocos e ações
    const planned = page.getByTestId('planned-item');
    await expect(planned).toHaveCount(3);
    const bike = planned.filter({ hasText: 'Tiros curtos' });
    await expect(bike.getByTestId('planned-cardio')).toContainText('207W no pico');
    await expect(bike.getByTestId('steps').locator('.sv-row')).toHaveCount(5);
    await expect(bike.getByTestId('steps')).toContainText('207 W');
    const run = planned.filter({ hasText: 'Corrida leve' });
    await expect(run.getByTestId('planned-cardio')).toContainText('5km');
    await expect(run.getByTestId('steps')).toContainText('FC 140-150');
    const yoga = planned.filter({ hasText: 'Ioga' });
    await expect(yoga.getByTestId('plan-how')).toContainText('respiração lenta');
    await expect(yoga.getByTestId('planned-cardio')).toContainText('leve');

    for (const item of [bike, run, yoga]) {
      // corpo alinhado ao título (sem o recuo antigo) e botões sem quebra
      const tx = (await item.locator('.titem-t').boundingBox())!.x;
      const bx = (await item.locator('.tp-nums').boundingBox())!.x;
      expect(Math.abs(bx - tx)).toBeLessThanOrEqual(2);
      await expectButtonsFit(item.locator('.tp-sec, .tp-main'));
    }
    // nome de cada bloco nunca espremido (a coluna do nome tem largura de texto, não de letra)
    const narrow = await page.locator('.sv-l').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 90).length);
    expect(narrow).toBe(0);
    // valores dos números na mesma altura em cada card
    for (const item of [bike, run, yoga]) {
      const tops = await item.locator('.tp-num b').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
    }
    if (process.env.SHOTS) { await bike.screenshot({ path: `/tmp/claude-0/shots/card-pedal-plan-${width}.png` }); await run.screenshot({ path: `/tmp/claude-0/shots/card-corrida-plan-${width}.png` }); await yoga.screenshot({ path: `/tmp/claude-0/shots/card-ioga-plan-${width}.png` }); }

    // feitos, em outro dia da semana: capa, selo Feito, números grandes, zonas e "Como foi"
    await page.getByRole('button', { name: /^ter, 24\/11/ }).click();
    await openTrainingItems(page);
    const done = page.getByTestId('workout-card');
    await expect(done).toHaveCount(2);
    const drun = done.filter({ hasText: 'Corrida' });
    await expect(drun.locator('.chip-done')).toBeVisible();
    await expect(drun.getByTestId('cardio-numbers')).toContainText('4,02');
    await expect(drun.getByTestId('cardio-numbers')).toContainText('Pace');
    await expect(drun.getByTestId('feel-card')).toContainText('pernas soltas');
    const dbike = done.filter({ hasText: 'Ciclismo' }).or(done.filter({ hasText: 'Pedal' })).first();
    await expect(dbike.getByTestId('zones')).toContainText('Z2 resistência');
    await expect(dbike.getByTestId('zones')).toContainText('22');
    for (const item of [drun, dbike]) {
      const over = await item.locator('.cd-grid .mv').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
      expect(over).toBe(0);
      const hs = await item.locator('.cd-grid .mv').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(new Set(hs).size).toBe(1);
    }
    if (process.env.SHOTS) { await drun.screenshot({ path: `/tmp/claude-0/shots/card-corrida-feita-${width}.png` }); await dbike.screenshot({ path: `/tmp/claude-0/shots/card-pedal-feito-${width}.png` }); }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}
