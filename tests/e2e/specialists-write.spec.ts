import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

const readAll = () => async () => {
  const req = indexedDB.open('ritual');
  const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
  return await new Promise<any[]>((r) => { const q = db.transaction('records').objectStore('records').getAll(); q.onsuccess = () => r(q.result); });
};

/** Base com um remédio, uma tarefa de trabalho e uma IA simulada que responde conforme a fala. */
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-04T21:30:00-03:00'));
  await page.addInitScript(() => {
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      const fala = String(ctx.fala_dela ?? '');
      if (task === 'food_coach') {
        const food = ctx.alimentos[0].id;
        const meal = ctx.refeicoes_do_dia[0].id;
        if (/corrige/i.test(fala)) return { mensagem: 'Corrigi.', acoes: [{ tipo: 'registrar_refeicao', data: ctx.hoje, refeicao: meal, itens: [{ alimento_id: food, gramas: 80 }], substituir: true }] };
        return { mensagem: 'Registrei.', acoes: [{ tipo: 'registrar_refeicao', data: ctx.hoje, refeicao: meal, itens: [{ alimento_id: food, gramas: 150 }, { alimento_id: 'nao-existe', gramas: 10 }] }] };
      }
      if (task === 'mind_coach') {
        const cafe = ctx.bebidas_com_cafeina[0].bebida_id;
        const vit = ctx.o_que_ela_toma.find((i: any) => i.nome === 'Vitamina D').item_id;
        return { mensagem: 'Lancei tudo.', pauta_consulta: [], acoes: [
          { tipo: 'registrar_checkin', data: ctx.hoje, periodo: 'pm', humor: -1, energia: 1, ansiedade: 3 },
          { tipo: 'registrar_sono', data: ctx.hoje, horas: 6.5, deitou: '23:40', acordou: '06:10' },
          { tipo: 'registrar_cafeina', data: ctx.hoje, bebida_id: cafe, horario: '08:00', quantidade: 2 },
          { tipo: 'registrar_dose', data: ctx.hoje, item_id: vit, horario: '06:40', status: 'tomei' },
          { tipo: 'registrar_dose', data: ctx.hoje, item_id: 'intake:nao-existe', horario: '06:40', status: 'tomei' }
        ] };
      }
      if (task === 'career_coach') {
        const t = ctx.trabalho.pendentes.find((x: any) => x.titulo === 'Enviar proposta');
        if (/fiz/i.test(fala)) return { mensagem: 'Boa, marquei.', rascunho: '', acoes: [{ tipo: 'concluir_tarefa', tarefa_id: t.tarefa_id }] };
        return { mensagem: 'Mudei.', rascunho: '', acoes: [{ tipo: 'mover_tarefa', tarefa_id: t.tarefa_id, data: '2026-11-06' }, { tipo: 'concluir_tarefa', tarefa_id: 'task:nao-existe' }] };
      }
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
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: Date.now() };
    const cb = st.get('careerbase');
    await new Promise((r) => { cb.onsuccess = r; });
    st.put({ ...base, ...(cb.result ?? {}), id: 'careerbase', kind: 'careerbase', workCategoryId: 'cat:t-trabalho' });
    st.put({ ...base, id: 'task:t-prop', kind: 'task', title: 'Enviar proposta', categoryId: 'cat:t-trabalho', priority: 'alta', status: 'pendente', tags: [], subtasks: [], history: [] });
    st.put({ ...base, id: 'intake:a', kind: 'intake', name: 'Vitamina D', type: 'vitamina', dose: '1 cápsula', times: ['06:40'], active: true, order: 1, stock: 4 });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
}

test('nutricionista registra o que ela comeu e corrige depois', async ({ page }) => {
  await seed(page);
  await page.goto('./#/alimentacao');
  await page.getByTestId('spec-open-food').click();
  await page.getByTestId('spec-input').fill('Comi isso agora');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('registrei');
  await expect(page.getByTestId('spec-food-chat')).toContainText('fora por não estar no seu catálogo');
  const ctx = await page.evaluate(() => (window as any).__ctx.food_coach);
  const id = `meal:2026-11-04:${ctx.refeicoes_do_dia[0].id}`;
  let meal = (await page.evaluate(readAll())).find((r) => r.id === id);
  expect(meal.items).toHaveLength(1);
  expect(meal.items[0].grams).toBe(150);
  await page.getByTestId('spec-input').fill('Corrige, foram 80 g');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('corrigi para');
  meal = (await page.evaluate(readAll())).find((r) => r.id === id);
  expect(meal.items.map((i: any) => i.grams)).toEqual([80]);
  // o contexto seguinte já mostra o registro com os ids, para a nutri corrigir sem adivinhar
  const ctx2 = await page.evaluate(() => (window as any).__ctx.food_coach);
  expect(ctx2.proximos_dias[0].refeicoes[0].comeu.itens_ids[0].gramas).toBe(150);
});

test('Mente lança check-in, sono, café e remédio contados na conversa', async ({ page }) => {
  await seed(page);
  await page.goto('./#/mente');
  await page.getByTestId('spec-open-mind').click();
  await page.getByTestId('spec-input').fill('Dormi mal, tomei dois cafés às 8 e a vitamina');
  await page.getByTestId('spec-send').click();
  const done = page.getByTestId('spec-done').last();
  await expect(done).toContainText('Check-in da noite de 04/11');
  await expect(done).toContainText('6,5 h, 23:40 a 06:10');
  await expect(done).toContainText('2x');
  await expect(done).toContainText('Vitamina D das 06:40');
  await expect(page.getByTestId('spec-mind-chat')).toContainText('Não achei o remédio');
  const recs = await page.evaluate(readAll());
  expect(recs.find((r) => r.id === 'mood:2026-11-04:pm')).toMatchObject({ mood: -1, energy: 1, anxiety: 3 });
  expect(recs.find((r) => r.id === 'wellness:2026-11-04')).toMatchObject({ sleepManualH: 6.5, sleepStart: '23:40', timesConfirmed: true });
  expect(recs.filter((r) => r.kind === 'caffeine' && !r.deleted)).toHaveLength(2);
  expect(recs.find((r) => r.id === 'intakelog:2026-11-04:intake:a:06:40')?.status).toBe('tomei');
  expect(recs.find((r) => r.id === 'intake:a').stock).toBe(3);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/mind-write.png' });
  // desfazer volta tudo, inclusive o estoque
  await page.getByTestId('spec-undo').last().click();
  await expect.poll(async () => (await page.evaluate(readAll())).filter((r) => r.kind === 'caffeine' && !r.deleted).length).toBe(0);
  expect((await page.evaluate(readAll())).find((r) => r.id === 'intake:a').stock).toBe(4);
});

test('Carreira conclui a tarefa que ela diz que fez', async ({ page }) => {
  await seed(page);
  await page.goto('./#/carreira');
  await page.getByTestId('spec-open-career').click();
  await page.getByTestId('spec-input').fill('Passa a proposta para sexta');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('Enviar proposta: agora para 06/11');
  await expect(page.getByTestId('spec-career-chat')).toContainText('Não achei essa tarefa');
  await page.getByTestId('spec-input').fill('Já fiz a proposta');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('Concluída: Enviar proposta');
  const t = (await page.evaluate(readAll())).find((r) => r.kind === 'task' && r.title === 'Enviar proposta');
  expect(t.status).toBe('concluida');
});
