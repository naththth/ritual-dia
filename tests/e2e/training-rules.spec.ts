import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openTrainingItems } from './fixtures/training';

test.use({ timezoneId: 'America/Sao_Paulo' });

const readAll = () => async () => {
  const req = indexedDB.open('ritual');
  const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
  return await new Promise<any[]>((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
};

// Sexta: a musculação do plano tinha saído para a aula de LPO entrar. Ela leva o LPO para sábado e pede a musculação de volta:
// a original volta (sem cópia), a musculação de sábado sai porque não convive com o LPO e a semana não infla.
test('treino que volta não duplica, força não se acumula e avulso cancelado sai da conta', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T10:40:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_coach') return {};
      if (/LPO será amanhã/.test(ctx.fala_dela)) return {
        mensagem: 'LPO vai para sábado e a musculação volta para hoje.',
        acoes: [
          { tipo: 'mover_treino', template_id: 'wtemplate:t-lpo', de: '2026-11-20', para: '2026-11-21' },
          { tipo: 'propor_treino', data: '2026-11-20', nome: 'Musculação B · Corpo todo', modalidade_id: 'mod:musculacao', minutos: 35, intensidade: 'moderada', blocos: [], substitui_template_ids: [] }
        ]
      };
      // Ação malformada: o app não pode dizer que fez.
      return { mensagem: 'Removi a sessão duplicada.', acoes: [{ tipo: 'mover_treino', template_id: 'wtemplate:t-musc-b', de: 'hoje', para: '' }] };
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
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    st.put({ ...base, id: 'wtemplate:t-musc-b', kind: 'wtemplate', name: 'Musculação B · Corpo todo', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada' });
    st.put({ ...base, id: 'wtemplate:t-musc-c', kind: 'wtemplate', name: 'Musculação C · Estabilidade', modalityId: 'mod:musculacao', duration: 30, intensity: 'moderada' });
    st.put({ ...base, id: 'wtemplate:t-z2', kind: 'wtemplate', name: 'Pedal Z2 regenerativo', modalityId: 'mod:ciclismo', duration: 30, intensity: 'leve' });
    st.put({ ...base, id: 'wtemplate:t-lpo', kind: 'wtemplate', name: 'Aula de LPO', modalityId: 'mod:lpo', duration: 60, intensity: 'intensa', time: '19:30', oneOff: '2026-11-20', archived: true });
    st.put({ ...base, id: 'wtemplate:t-tiros', kind: 'wtemplate', name: 'Tiros curtos Z5 / Z1 com nome comprido para conferir a quebra de linha', modalityId: 'mod:ciclismo', duration: 28, intensity: 'intensa', oneOff: '2026-11-20', archived: true,
      steps: [{ label: 'Aquecimento', minutes: 8, pct: 55 }, { label: 'Tiro', minutes: 0.5, pct: 130 }, { label: 'Leve', minutes: 1, pct: 50 }, { label: 'Tiro', minutes: 0.5, pct: 130 }, { label: 'Volta à calma', minutes: 6, pct: 45 }] });
    st.put({ ...base, id: 'plan:t-treino', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 5: ['wtemplate:t-musc-b'], 6: ['wtemplate:t-musc-c', 'wtemplate:t-z2'] } });
    st.put({ ...base, id: 'extra:2026-11-20:training:wtemplate:t-lpo', kind: 'extra', date: '2026-11-20', domain: 'training', ref: 'wtemplate:t-lpo', by: 'treinadora' });
    st.put({ ...base, id: 'extra:2026-11-20:training:wtemplate:t-tiros', kind: 'extra', date: '2026-11-20', domain: 'training', ref: 'wtemplate:t-tiros', by: 'treinadora' });
    st.put({ ...base, id: 'skip:2026-11-20:training:wtemplate:t-musc-b', kind: 'skip', date: '2026-11-20', domain: 'training', ref: 'wtemplate:t-musc-b' });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
  await page.goto('./#/treino');
  await expect(page.getByTestId('planned-item')).toHaveCount(2);

  await page.getByTestId('coach-open').click();
  await page.getByTestId('coach-input').fill('LPO será amanhã, pode puxar a sessão de musculação pra hoje');
  await page.getByTestId('coach-send').click();
  const done = page.getByTestId('coach-done').last();
  await expect(done).toContainText('Aula de LPO foi de sex 20/11 para sáb 21/11');
  await expect(done).toContainText('Musculação C · Estabilidade saiu de sáb 21/11');
  await expect(done).toContainText('Musculação B · Corpo todo voltou para sex 20/11');
  let recs = await page.evaluate(readAll());
  const live = recs.filter((r) => !r.deleted);
  expect(live.filter((r) => r.kind === 'wtemplate' && r.name === 'Musculação B · Corpo todo')).toHaveLength(1);
  expect(live.find((r) => r.id === 'skip:2026-11-20:training:wtemplate:t-musc-b')).toBeUndefined();
  expect(live.find((r) => r.id === 'skip:2026-11-21:training:wtemplate:t-musc-c')).toBeTruthy();

  // Ação que falha não vira "feito" na resposta.
  await page.getByTestId('coach-input').fill('Tira uma das sessões');
  await page.getByTestId('coach-send').click();
  await expect(page.getByText('Não consegui fazer essa mudança no app')).toBeVisible();
  await expect(page.getByText('Removi a sessão duplicada.')).toHaveCount(0);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.goBack();

  // Sexta: musculação original e o pedal; nada "trocado por" ela mesma. Semana: 2 hoje + 2 no sábado.
  const day = page.getByTestId('training-day');
  await expect(page.getByTestId('planned-item')).toHaveCount(2);
  await expect(day).not.toContainText('trocado por');
  await expect(page.getByTestId('training-week')).toContainText('0/4');
  await expect(page.getByTestId('steps-preview')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/treino-fechado.png', fullPage: true });

  // Abre para ver detalhes; o texto longo quebra sem sair do item.
  const tiros = page.getByTestId('planned-item').filter({ hasText: 'Tiros curtos' });
  await tiros.getByTestId('titem-head').click();
  await expect(tiros.getByTestId('steps')).toBeVisible();
  const fits = await tiros.evaluate((el) => { const t = el.querySelector('.titem-t')!; return t.getBoundingClientRect().right <= el.getBoundingClientRect().right + 0.5 && t.scrollWidth <= t.clientWidth + 1; });
  expect(fits).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/treino-aberto.png', fullPage: true });

  // "Hoje não" no avulso: sai de vez, sem linha de "não realizado" e sem contar na semana.
  await tiros.getByTestId('train-skip').click();
  await expect(page.getByTestId('planned-item')).toHaveCount(1);
  await expect(page.getByTestId('planned-skipped')).toHaveCount(0);
  await expect(page.getByTestId('training-week')).toContainText('0/3');
  recs = await page.evaluate(readAll());
  expect(recs.find((r) => r.id === 'extra:2026-11-20:training:wtemplate:t-tiros')?.deleted).toBe(1);

  // Sábado: LPO e pedal; a musculação aparece só como trocada.
  await page.getByRole('button', { name: /^sáb, 21\/11/ }).click();
  await expect(page.getByTestId('planned-item')).toHaveCount(2);
  await expect(page.getByTestId('planned-replaced')).toContainText('Musculação C');
});
