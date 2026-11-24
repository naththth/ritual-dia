import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Rotina da manhã feita à tarde: o card dela fica compacto embaixo da rotina da noite.
// O check de "feita" não pode encostar no botão "Ver ou corrigir" nem no texto.
for (const width of [360, 393]) {
  test(`check da rotina feita não cobre botão nem texto no card compacto (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.setFixedTime(new Date('2026-11-24T16:30:00-03:00'));
    await page.goto('./');
    await page.getByTestId('start-local').click();
    await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
    await page.getByTestId('do-import').click();
    await page.evaluate(async () => {
      const req = indexedDB.open('ritual');
      const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
      const tx = db.transaction('records', 'readwrite');
      const st = tx.objectStore('records');
      const b = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
      const ids = Array.from({ length: 17 }, (_, i) => `product:t${i}`);
      ids.forEach((id, i) => st.put({ ...b, id, kind: 'product', brand: 'Marca', name: `Produto ${i}`, area: 'rosto', status: 'em_uso' }));
      st.put({ ...b, id: 'skin:2026-11-24:am', kind: 'skin', date: '2026-11-24', period: 'am', productIds: ids, plannedIds: ids });
      const g = st.get('settings');
      await new Promise((r) => { g.onsuccess = r; });
      st.put({ ...g.result, onboarded: true });
      await new Promise((r) => { tx.oncomplete = r; });
    });
    await page.goto('./#/');
    await page.reload();
    await page.goto('./#/cuidados');
    const am = page.getByTestId('care-am');
    await expect(am).toContainText('Feita · 17 produtos');
    await expect(page.getByTestId('care-pm')).toHaveClass(/cc-hero/);
    if (process.env.SHOTS) await page.locator('.care-cards').screenshot({ path: `/tmp/shots/care-check-${width}.png` });

    const r = await am.evaluate((card) => {
      const c = card.getBoundingClientRect();
      const s = getComputedStyle(card, '::after');
      const left = c.left + parseFloat(s.left), top = c.top + parseFloat(s.top);
      const check = { left, top, right: left + parseFloat(s.width), bottom: top + parseFloat(s.height) };
      const box = (sel: string) => card.querySelector(sel)!.getBoundingClientRect();
      return { check, card: c, go: box('.cc-go'), txt: box('.cc-txt'), ic: box('.cc-ic') };
    });
    const hit = (a: any, b: any) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(hit(r.check, r.go)).toBe(false);
    expect(hit(r.check, r.txt)).toBe(false);
    // selo encostado no ícone e dentro do card
    expect(hit(r.check, r.ic)).toBe(true);
    expect(r.check.left).toBeGreaterThanOrEqual(r.card.left);
    expect(r.check.bottom).toBeLessThanOrEqual(r.card.bottom);
  });
}
