import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

test.use({ timezoneId: 'America/Sao_Paulo', viewport: { width: 360, height: 760 } });

/** Base com produtos de rosto, cabelo e corpo, um plano da noite e um alimento com tabela. */
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-25T16:00:00-03:00'));
  await page.addInitScript(() => {
    const code = (ctx: any, name: string) => ctx.produtos.find((p: any) => p.nome === name)?.codigo;
    (window as any).__RITUAL_TEST_AI = (task: string, ctx: any) => {
      (window as any).__ctx = { ...((window as any).__ctx ?? {}), [task]: ctx };
      if (task === 'skin_coach') {
        if (/semana/.test(ctx.fala_dela)) return { mensagem: 'Óleo de pontas toda noite, depois do banho.', acoes: [{ tipo: 'propor_rotina', escopo: 'semana', titulo: 'Óleo nas pontas', mudancas: [{ periodo: 'pm', dia_semana: 0, entra: [code(ctx, 'Óleo de pontas')], sai: [] }] }] };
        return {
          mensagem: 'Hoje à noite sem retinol; o sérum calmante entra no lugar.',
          acoes: [
            { tipo: 'propor_rotina', escopo: 'dia', titulo: 'Noite calma', mudancas: [{ periodo: 'pm', data: ctx.hoje, entra: [code(ctx, 'Sérum calmante')], sai: [code(ctx, 'Retinol')] }], nota: 'Amanhã você volta ao plano.' },
            { tipo: 'guardar_preferencia', texto: 'Pele reage a retinol depois de sol forte' }
          ]
        };
      }
      if (task === 'food_coach') {
        const frango = ctx.alimentos.find((f: any) => f.nome === 'Frango grelhado').id;
        return { mensagem: 'Jantar com 48 g de proteína fecha a meta do dia.', acoes: [{ tipo: 'propor_refeicoes', data: ctx.hoje, refeicoes: [{ refeicao: 'jantar', nome: 'Frango com salada', itens: [{ alimento_id: frango, gramas: 150 }] }] }] };
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
    const base = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    const p = (id: string, brand: string, name: string, group: string, area: string, extra: any = {}) => st.put({ ...base, id, kind: 'product', brand, name, group, area, period: 'ambos', status: 'em_uso', ...extra });
    p('product:gel', 'A', 'Gel de limpeza', 'limpeza', 'rosto');
    p('product:serum', 'B', 'Sérum calmante', 'seruns', 'rosto');
    p('product:retinol', 'C', 'Retinol', 'tratamentos', 'rosto', { active: true });
    p('product:shampoo', 'D', 'Shampoo suave', 'cabelo', 'cabelo');
    p('product:oleo', 'E', 'Óleo de pontas', 'cabelo', 'cabelo', { status: 'guardado' });
    p('product:locao', 'F', 'Loção de ureia', 'corpo', 'corpo');
    st.put({ ...base, id: 'plan:skin1', kind: 'plan', domain: 'skin', validFrom: '2026-10-01', skin: { am: { base: ['product:gel'], days: {} }, pm: { base: ['product:gel', 'product:retinol', 'product:shampoo', 'product:locao'], days: {} }, recovery: { am: [], pm: [] } } });
    st.put({ ...base, id: 'food:t-frango', kind: 'food', name: 'Frango grelhado', type: 'Proteínas', portions: ['100 g'], n: { kcal: 160, p: 32, c: 0, f: 3 } });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, reviewDone: true });
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.goto('./#/');
  await page.reload();
}

test('rotina da noite por etapa e área, com produto que ela já tem', async ({ page }) => {
  await seed(page);
  await page.goto('./#/pele?p=pm');
  await expect(page.getByTestId('skin-sec-banho-rosto')).toContainText('Gel de limpeza');
  await expect(page.getByTestId('skin-sec-banho-cabelo')).toContainText('Shampoo suave');
  await expect(page.getByTestId('skin-sec-pos-rosto')).toContainText('Retinol');
  await expect(page.getByTestId('skin-sec-pos-corpo')).toContainText('Loção de ureia');
  // Depois do banho, cabelo: nada no plano; ela põe o óleo que tem guardado.
  await page.getByTestId('stage-pos').getByTestId('skin-add-pos-cabelo').click();
  await expect(page.locator('.sheet')).toContainText('Cabelo · depois do banho');
  await page.locator('.sheet [data-testid=product-pick]', { hasText: 'Óleo de pontas' }).click();
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByTestId('skin-sec-pos-cabelo')).toContainText('fora do plano');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/rotina-etapas.png', fullPage: true });
  await page.getByTestId('skin-save').click();
  await expect(page.getByTestId('skin-screen')).toBeHidden();
});

test('dermatologista muda a noite de hoje e a semana; nutricionista troca o jantar', async ({ page }) => {
  await seed(page);
  await page.goto('./#/cuidados');
  await page.getByTestId('spec-open-skin').click();
  await expect(page.getByTestId('spec-skin-chat')).toContainText('Mudança de rotina só entra depois que você aprova');
  await page.getByTestId('spec-input').fill('Peguei muito sol hoje, a pele está ardendo');
  await page.getByTestId('spec-send').click();
  const prop = page.getByTestId('spec-proposal');
  await expect(prop).toContainText('Noite de dom 25/10');
  await expect(prop).toContainText('Sérum calmante');
  await expect(prop).toContainText('Retinol');
  const ctx = await page.evaluate(() => (window as any).__ctx.skin_coach);
  expect(ctx.produtos.find((p: any) => p.nome === 'Shampoo suave').etapa).toBe('banho');
  expect(ctx.produtos.find((p: any) => p.nome === 'Óleo de pontas').situacao).toBe('guardado');
  expect(ctx.proximos_dias[0].noite).toHaveLength(4);
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/dermato-proposta.png' });
  await page.getByTestId('spec-approve').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('Noite de dom 25/10');
  await page.getByRole('button', { name: 'Fechar' }).click();

  await page.goto('./#/pele?p=pm');
  await expect(page.getByTestId('skin-sec-pos-rosto')).toContainText('Sérum calmante');
  await expect(page.getByTestId('skin-sec-pos-rosto')).toContainText('da dermato, hoje');
  await expect(page.getByTestId('skin-sec-pos-rosto')).not.toContainText('Retinol');

  // Pela rotina do dia: proposta para a semana, que vale nos próximos dias.
  await page.getByTestId('spec-link-skin').click();
  await page.getByTestId('spec-input').fill('Quero o óleo de pontas na semana');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-proposal').last()).toContainText('Noite, todos os dias');
  await page.getByTestId('spec-approve').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('vale a partir de hoje');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Próximo dia' }).click();
  await expect(page.getByTestId('skin-sec-pos-cabelo')).toContainText('Óleo de pontas');
  await expect(page.getByTestId('skin-sec-pos-rosto')).toContainText('Retinol');

  // Nutricionista: jantar de hoje trocado depois do aprovo.
  await page.goto('./#/alimentacao');
  await page.getByTestId('spec-open-food').click();
  await page.getByTestId('spec-input').fill('Almocei pouco, monta um jantar com proteína');
  await page.getByTestId('spec-send').click();
  await expect(page.getByTestId('spec-proposal')).toContainText('Frango grelhado');
  await expect(page.getByTestId('spec-proposal')).toContainText('240 kcal');
  const fctx = await page.evaluate(() => (window as any).__ctx.food_coach);
  expect(fctx.proximos_dias[0].refeicoes.map((r: any) => r.refeicao)).toContain('jantar');
  if (process.env.SHOTS) await page.screenshot({ path: '/tmp/claude-0/shots/nutri-proposta.png' });
  await page.getByTestId('spec-approve').click();
  await expect(page.getByTestId('spec-done').last()).toContainText('Frango com salada');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Dia anterior' }).click(); // a rotina ficou no dia seguinte
  await expect(page.getByTestId('meal-sec-jantar')).toContainText('Frango grelhado');
  if (process.env.SHOTS) { await page.getByTestId('meal-sec-jantar').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/claude-0/shots/nutri-jantar.png' }); }

  // Sessões: nova conversa leva a anterior para "Anteriores".
  await page.getByTestId('spec-open-food').click();
  await page.getByTestId('spec-new').click();
  await expect(page.getByTestId('spec-past')).toBeVisible();
  await expect(page.getByText('Almocei pouco')).toHaveCount(0);
});
