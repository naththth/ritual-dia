import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo' });

// Ciclo fictício: começa na segunda 02/11/2026 e termina com pedal no sábado e corrida no domingo da semana 19.
const MACRO = {
  id: 'macro:atual', kind: 'macro', createdAt: 1, updatedAt: 1, deleted: 0, active: true, title: 'Ciclo de teste',
  start: '2026-11-02',
  events: [
    { date: '2027-03-13', sport: 'ciclismo', label: 'pedalar 50 km', distanceKm: 50 },
    { date: '2027-03-14', sport: 'corrida', label: 'correr 10 km', distanceKm: 10 }
  ],
  frame: {
    1: [{ key: 'strength', templateId: 'wtemplate:fa' }, { key: 'yoga' }],
    2: [{ key: 'lpo', templateId: 'wtemplate:flpo' }],
    3: [{ key: 'run_main', minutes: 55 }],
    4: [{ key: 'strength', templateId: 'wtemplate:fb' }, { key: 'run_easy', minutes: 25 }],
    5: [{ key: 'bike', minutes: 60 }],
    6: [{ key: 'yoga_class', templateId: 'wtemplate:fyoga' }, { key: 'bike_long' }],
    7: [{ key: 'run_long' }, { key: 'yoga' }]
  },
  deloads: ['2026-11-30'],
  runLong: [35, 85], bikeLong: [45, 120]
};
const TEMPLATES = [
  { id: 'wtemplate:fa', name: 'Musculação A teste', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada' },
  { id: 'wtemplate:fb', name: 'Musculação B teste', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada' },
  { id: 'wtemplate:flpo', name: 'Aula de LPO teste', modalityId: 'mod:lpo', duration: 60, intensity: 'intensa', time: '19:30' },
  { id: 'wtemplate:fyoga', name: 'Aula de ioga teste', modalityId: 'mod:yoga', duration: 60, intensity: 'leve', time: '09:30' }
].map((t) => ({ ...t, kind: 'wtemplate', createdAt: 1, updatedAt: 1, deleted: 0 }));

async function seed(page: Page, now: string) {
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      if (task !== 'training_week') return {};
      (window as any).__weekCtx = ctx;
      const sessoes: any[] = [];
      for (const d of ctx.esqueleto) for (const s of d.sessoes) {
        if (s.sessao_fixa) continue;
        if (s.chave.startsWith('bike')) sessoes.push({ dia: d.dia, chave: s.chave, nome: 'MyWhoosh · Z2 com acelerações', minutos: s.minutos_alvo, intensidade: 'leve', roteiro: 'Z2 constante.', blocos: [{ rotulo: 'Aquecimento', minutos: 10, pct: 55 }, { rotulo: 'Z2', minutos: s.minutos_alvo - 15, pct: 68 }, { rotulo: 'Volta à calma', minutos: 5, pct: 50 }] });
        else if (s.chave.startsWith('run')) sessoes.push({ dia: d.dia, chave: s.chave, nome: `Corrida · ${s.tipo.toLowerCase()} da semana ${ctx.semana.numero}`, minutos: s.minutos_alvo, intensidade: 'leve', roteiro: 'Corre 4 min, caminha 1 min.', blocos: [{ rotulo: 'Corre e caminha', minutos: s.minutos_alvo, pct: 60, alvo: 'FC 135 a 150 · esforço 4 · esteira 7,5 km/h' }] });
        else sessoes.push({ dia: d.dia, chave: s.chave, nome: 'Ioga · quadril e posterior', minutos: s.minutos_alvo, intensidade: 'leve', roteiro: 'Mobilidade de quadril.' });
      }
      // Pedido com competição: muda a estrutura (força na segunda, sexta livre, competição no fim de semana).
      if (/competição/.test(ctx.pedido_dela ?? '')) {
        const find = (k: string) => ctx.esqueleto.find((d: any) => d.sessoes.some((x: any) => x.chave === k));
        return {
          mensagem: 'Semana ajustada para a competição.', _provedor: 'teste',
          esqueleto_ajustado: [
            { dia: 1, sessoes: [{ chave: 'strength', de_dia: find('strength').dia }] },
            { dia: 2, sessoes: [{ chave: 'lpo', de_dia: 2 }] },
            { dia: 3, sessoes: [{ chave: 'run_main', de_dia: 3, minutos: 30 }] },
            { dia: 4, sessoes: [] }, { dia: 5, sessoes: [] }, { dia: 6, sessoes: [] }, { dia: 7, sessoes: [] }
          ],
          compromissos: [{ dia: 6, chave: 'lpo', nome: 'Competição de LPO', minutos: 240 }, { dia: 7, chave: 'lpo', nome: 'Competição de LPO', minutos: 240 }],
          sessoes: [{ dia: 3, chave: 'run_main', nome: 'Corrida · solta antes da prova', minutos: 30, intensidade: 'leve' }]
        };
      }
      return { mensagem: `Semana ${ctx.semana.numero}: base leve${ctx.pedido_dela ? ', com o seu pedido' : ''}.`, sessoes, _provedor: 'teste' };
    };
  });
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async ({ macro, tmpls }) => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, ftp: 190 });
    st.put(macro);
    for (const t of tmpls) st.put(t);
    await new Promise((r) => { tx.oncomplete = r; });
  }, { macro: MACRO, tmpls: TEMPLATES });
  await page.goto('./#/');
  await page.reload();
}

const records = (page: Page, kind: string) => page.evaluate(async (k) => {
  const req = indexedDB.open('ritual');
  const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
  const all: any[] = await new Promise((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
  return all.filter((x) => x.kind === k && !x.deleted);
}, kind);

test('domingo à tarde a treinadora propõe a semana seguinte; aprovar põe no plano; desfazer volta', async ({ page }) => {
  // Domingo 08/11, 18h: semana 2 (09 a 15/11), com o teste de limiar na quarta.
  await seed(page, '2026-11-08T18:00:00-03:00');
  // No Hoje, o aviso leva ao Treino, onde a semana inteira está para ler e aprovar.
  await page.goto('./#/');
  await expect(page.getByTestId('week-nudge')).toContainText('Sua semana de treino está pronta');
  await page.getByTestId('week-nudge').click();
  const card = page.getByTestId('week-plan');
  await expect(card).toContainText('Semana 2 de 19 · Base');
  await expect(page.getByTestId('week-why')).toContainText('Base: construir o motor aeróbico');
  await expect(page.getByTestId('week-why')).toContainText('Próxima semana leve: 30/11');
  await expect(card).toContainText('Sua semana de 09/11 a 15/11');
  await expect(card).toContainText(/125\s*dias para pedalar 50\skm/);
  await expect(card).toContainText('Semana 2: base leve.');
  // fixas com o nome de sempre; sessões novas da treinadora
  await expect(card).toContainText('Musculação A teste');
  await expect(card).toContainText('Aula de LPO teste');
  await expect(card).toContainText('MyWhoosh · Z2 com acelerações');
  await expect(page.getByTestId('wp-day')).toHaveCount(7);
  const ctx = await page.evaluate(() => (window as any).__weekCtx);
  expect(ctx.semana).toMatchObject({ numero: 2, de: 19, fase: 'Base', semana_leve: false });
  expect(ctx.esqueleto[2].sessoes[0].intencao).toMatch(/Teste de 30 min/);
  expect(ctx.ftp).toBe(190);
  // corrida mostra o alvo escrito, não watts
  await card.getByTestId('wp-session').filter({ hasText: 'corrida principal' }).click();
  await expect(card).toContainText('FC 135 a 150');
  // antes do aprovo o plano não muda
  expect((await records(page, 'plan')).filter((p) => p.validFrom === '2026-11-09')).toHaveLength(0);
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(noScroll).toBeLessThanOrEqual(0);
  if (process.env.SHOTS) await card.screenshot({ path: '/tmp/claude-0/shots/weekplan.png' });

  await page.getByTestId('week-approve').click();
  await expect(page.getByTestId('week-plan-compact')).toContainText('Semana aprovada');
  const plan = (await records(page, 'plan')).find((p) => p.validFrom === '2026-11-09');
  expect(plan).toBeTruthy();
  expect(plan.training[1]).toContain('wtemplate:fa');
  expect(plan.training[2]).toEqual(['wtemplate:flpo']);
  const weekT = (await records(page, 'wtemplate')).filter((t) => t.weekOf === '2026-11-09');
  // Semana 2 do ciclo: a rampa traz 1 das 2 sessões de ioga do quadro, a do domingo (dia da corrida longa).
  expect(weekT.length).toBe(6); // corrida qua, corrida qui, pedal sex, pedal longo sáb, corrida longa dom, ioga dom
  expect(weekT.filter((t) => t.name.includes('Ioga')).length).toBe(1);
  const run = weekT.find((t) => t.name.includes('corrida principal'));
  expect(run.runSteps[0].target).toMatch(/FC/);
  expect(run.steps).toBeUndefined();
  expect(weekT.find((t) => t.modalityId === 'mod:ciclismo').steps.length).toBeGreaterThan(0);
  const tw = (await records(page, 'tweek'))[0];
  expect(tw).toMatchObject({ status: 'aprovada', provider: 'teste' });
  if (process.env.SHOTS) await page.getByTestId('week-plan-compact').screenshot({ path: '/tmp/claude-0/shots/weekplan-ok.png' });

  // desfazer: o plano novo sai, as sessões da semana também, e a proposta volta
  await page.getByTestId('week-plan-compact').locator('.wp-compact-head').click();
  await page.getByTestId('week-undo').click();
  await expect(page.getByTestId('week-plan')).toBeVisible();
  expect((await records(page, 'plan')).filter((p) => p.validFrom === '2026-11-09')).toHaveLength(0);
  expect((await records(page, 'wtemplate')).filter((t) => t.weekOf === '2026-11-09')).toHaveLength(0);
});

test('pedir ajuste refaz a semana com o pedido; semana seguinte segura se quase nada foi feito', async ({ page }) => {
  await seed(page, '2026-11-08T18:00:00-03:00');
  await page.goto('./#/treino');
  await expect(page.getByTestId('week-plan')).toContainText('Semana 2 de 19');
  await page.getByTestId('week-adjust').click();
  if (process.env.SHOTS) await page.getByTestId('week-plan').screenshot({ path: '/tmp/claude-0/shots/weekplan-ajuste-vazio.png' });
  await page.getByTestId('week-ask-input').fill('quinta não consigo');
  if (process.env.SHOTS) await page.getByTestId('week-plan').screenshot({ path: '/tmp/claude-0/shots/weekplan-ajuste-texto.png' });
  await page.getByTestId('week-ask-send').click();
  await expect(page.getByTestId('week-msg')).toContainText('com o seu pedido');
  let ctx = await page.evaluate(() => (window as any).__weekCtx);
  expect(ctx.pedido_dela).toBe('quinta não consigo');
  await page.getByTestId('week-approve').click();
  await expect(page.getByTestId('week-plan-compact')).toBeVisible();

  // Domingo seguinte, sem nenhum treino registrado na semana: a progressão volta um degrau e explica.
  await page.clock.setFixedTime(new Date('2026-11-15T18:00:00-03:00'));
  await page.reload();
  await page.goto('./#/treino');
  const card = page.getByTestId('week-plan');
  await expect(card).toContainText('Semana 3 de 19');
  await expect(page.getByTestId('week-holds')).toContainText('segurei no começo');
  ctx = await page.evaluate(() => (window as any).__weekCtx);
  expect(ctx.semana.degrau_da_progressao).toBe(1);
  expect(ctx.semana_anterior.feito_minutos).toEqual({ corrida: 0, ciclismo: 0 });
});

test('depois do teste de limiar, ela confirma o número e as zonas passam a valer', async ({ page }) => {
  // Semana 2 aprovada; quarta 11/11 foi o teste. Quinta 12/11 o card aparece no Hoje com a FC média da sessão.
  await seed(page, '2026-11-08T18:00:00-03:00');
  await page.goto('./#/treino');
  await page.getByTestId('week-approve').click();
  await expect(page.getByTestId('week-plan-compact')).toBeVisible();
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put({ id: 'workout:teste-limiar', kind: 'workout', createdAt: 1, updatedAt: 1, deleted: 0, date: '2026-11-11', modalityId: 'mod:corrida', duration: 45, intensity: 'intensa', metrics: { avgHr: 158, maxHr: 176 } });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.clock.setFixedTime(new Date('2026-11-12T08:00:00-03:00'));
  await page.goto('./#/');
  await page.reload();
  const card = page.getByTestId('test-result');
  await expect(card).toContainText('Qual foi o seu limiar na corrida?');
  await expect(card).toContainText('qua 11/11');
  await expect(page.getByTestId('test-value')).toHaveValue('158');
  await page.getByTestId('test-value').fill('166');
  await expect(page.getByTestId('test-zones')).toContainText('Z2 141 a 148 bpm');
  if (process.env.SHOTS) await card.screenshot({ path: '/tmp/claude-0/shots/test-result.png' });
  await page.getByTestId('test-save').click();
  await expect(card).toHaveCount(0);
  const s = (await records(page, 'settings'))[0];
  expect(s).toMatchObject({ runLthr: 166, runLthrAt: '2026-11-11' });
});

test('pedido que se perdeu no meio (app recarregou) é retomado e pode mudar dias e incluir competição', async ({ page }) => {
  await seed(page, '2026-11-08T18:00:00-03:00');
  await page.goto('./#/treino');
  await expect(page.getByTestId('week-plan')).toContainText('Semana 2 de 19');
  // Simula o app fechando com o pedido gravado e sem resposta.
  await page.evaluate(async () => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const st = db.transaction('records', 'readwrite').objectStore('records');
    const g = st.get('tweek:2026-11-09');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, pendingPedido: 'competição de LPO no sábado e domingo; sexta descanso', pendingAt: Date.now(), updatedAt: Date.now() });
  });
  await page.reload();
  await page.goto('./#/treino');
  await expect(page.getByTestId('week-msg')).toContainText('ajustada para a competição');
  await expect(page.getByTestId('week-pedido')).toContainText('sexta descanso');
  const days = page.getByTestId('wp-day');
  await expect(days.nth(0)).toContainText('Musculação');
  await expect(days.nth(4)).toContainText('Descanso');
  await expect(days.nth(5)).toContainText('Competição de LPO');
  await expect(days.nth(6)).toContainText('Competição de LPO');
  const tw = (await records(page, 'tweek')).find((t) => t.id === 'tweek:2026-11-09');
  expect(tw.pendingPedido).toBeUndefined();
  expect(tw.pedido).toContain('competição');
  // A progressão da semana seguinte lê o esqueleto da regra, não o ajustado.
  expect(tw.baseSkeleton.days['5'].length).toBeGreaterThan(0);
});
