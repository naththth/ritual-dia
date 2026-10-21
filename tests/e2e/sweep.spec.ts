import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

// Varredura visual: todas as telas em 360 px com textos longos. Procura texto saindo da borda e rolagem lateral.
const ROUTES = ['#/', '#/treino', '#/treino/plano', '#/treino/sessoes', '#/cuidados', '#/cuidados/rotina', '#/cuidados/produtos', '#/pele?p=am', '#/pele?p=pm',
  '#/alimentacao', '#/alimentacao/plano', '#/alimentacao/alimentos', '#/alimentacao/refeicoes', '#/alimentacao/refeicao?m=almoco', '#/mais', '#/perfil', '#/peso', '#/ciclo',
  '#/listas', '#/habitos', '#/diario', '#/notas', '#/leitura', '#/calendario', '#/evolucao', '#/ajustes', '#/treino/registrar', '#/biblioteca/categorias'];

const LONG = 'Hyalu-Cica Water-Fit Sun Serum SPF50+ PA++++ com Centella Asiática e Ácido Hialurônico';

async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-20T21:30:00-03:00'));
  await page.goto('./');
  await page.getByTestId('start-local').click();
  await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.json'));
  await page.getByTestId('do-import').click();
  await page.evaluate(async (LONG) => {
    const req = indexedDB.open('ritual');
    const db: IDBDatabase = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    const b = { deleted: 0, dirty: 0, updatedAt: 5, createdAt: 5 };
    const ids: string[] = [];
    for (let i = 0; i < 14; i++) {
      const id = `product:long${i}`; ids.push(id);
      st.put({ ...b, id, kind: 'product', brand: i % 2 ? 'L’Oréal Professionnel Paris' : 'SKIN1004', name: `${LONG} ${i}`, group: ['limpeza', 'seruns', 'hidratacao', 'fps', 'corpo', 'cabelo', 'tratamentos'][i % 7], area: i % 7 === 4 ? 'corpo' : i % 7 === 5 ? 'cabelo' : 'rosto', status: 'em_uso', active: i % 7 === 6, period: 'ambos', info: { purpose: 'Acalma a pele sensibilizada, reforça a barreira e hidrata sem pesar, com textura leve que absorve rápido.', howToUse: 'Aplicar após a limpeza, sobre a pele seca, espalhando do centro para fora.', actives: ['niacinamida 5%', 'centella asiática', 'pantenol'] } });
    }
    st.put({ ...b, id: 'plan:skin-t', kind: 'plan', domain: 'skin', validFrom: '2026-10-01', skin: { am: { base: ids.slice(0, 6), days: { 2: { add: [ids[6]], remove: [] } } }, pm: { base: ids.slice(6, 12), days: {} }, recovery: { am: [], pm: [ids[0]] }, diagnosis: { rosto: 'Pele oleosa e sensível com rosácea leve; barreira em primeiro lugar.', corpo: 'Pele seca com queratose pilar.', cabelo: 'Couro oleoso, fio fino.', date: '2026-10-20' } } });
    st.put({ ...b, id: 'wtemplate:t1', kind: 'wtemplate', name: 'Musculação A · corpo todo (ênfase glúteos e puxar)', modalityId: 'mod:musculacao', duration: 35, intensity: 'moderada', note: 'Bi-sets (1+2, 3+4, 5+6), 60 a 90 s de descanso.\n\n1. Agachamento búlgaro 3x8-10 por perna\n2. Puxada alta pronada 3x8-12\n3. Supino com halteres 3x8-12' });
    st.put({ ...b, id: 'wtemplate:t2', kind: 'wtemplate', name: 'Aula de LPO', modalityId: 'mod:lpo', duration: 60, intensity: 'intensa', time: '19:30' });
    st.put({ ...b, id: 'plan:tr-t', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 1: ['wtemplate:t1'], 2: ['wtemplate:t2'], 3: ['wtemplate:t1'] } });
    st.put({ ...b, id: 'workout:icu:x', kind: 'workout', date: '2026-10-20', modalityId: 'mod:lpo', duration: 63, startTime: '2026-10-20T22:37:00Z', reclassifiedFrom: 'mod:musculacao', classChecked: true, feeling: 'Técnica boa no arranco, mas o agachamento frontal pesou bastante depois do pedal de ontem; senti o joelho esquerdo.', rpe: 8, metrics: { source: 'intervals', tss: 19, avgHr: 107, maxHr: 156, kcal: 245 } });
    for (let d = 1; d <= 20; d++) { const k = `2026-10-${String(d).padStart(2, '0')}`; st.put({ ...b, id: `wellness:${k}`, kind: 'wellness', date: k, sleepH: 6 + (d % 3) * 0.5, hrv: 30 + d, restingHR: 62, steps: 4000 + d * 300, weight: 92 - d * 0.15 }); }
    for (const d of ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) st.put({ ...b, id: `cycle:${d}`, kind: 'cycle', date: d, flow: 'medio', symptoms: ['Cólica', 'Inchaço', 'Dor de cabeça'] });
    st.put({ ...b, id: 'skin:2026-10-20:am', kind: 'skin', date: '2026-10-20', period: 'am', signals: { vermelhidao: 2 }, productIds: ids.slice(0, 6), plannedIds: ids.slice(0, 6), condition: 'sensibilizada' });
    st.put({ ...b, id: 'goal:g', kind: 'goal', title: 'Correr a meia maratona de Curitiba abaixo de 2h10 em junho', type: 'quantitativa', unit: 'min', milestones: [], status: 'ativa' });
    st.put({ ...b, id: 'brief:2026-10-20', kind: 'brief', date: '2026-10-20', foco: 'Executar o LPO com foco técnico e reservar o restante da noite para hidratação, aporte de proteína e descanso.', pele: 'Como a manhã teve relato de vermelhidão, faça a limpeza dupla suave e use só a hidratação calmante.', treino: 'Você vem de dois dias de força: aqueça bem os ombros antes do LPO e ajuste a carga se a técnica cair.', tarefas: [] });
    const g = st.get('settings');
    await new Promise((r) => { g.onsuccess = r; });
    st.put({ ...g.result, onboarded: true, profile: { ...(g.result.profile ?? {}), sex: 'F', weightKg: 89, heightCm: 168, weightGoal: { startKg: 92, startDate: '2026-10-01', targetKg: 81, deadline: '2026-12-14' }, cycle: { tracks: true } } });
    await new Promise((r) => { tx.oncomplete = r; });
  }, LONG);
  await page.goto('./#/');
  await page.reload();
}

test('varredura: nenhuma tela com texto saindo da borda', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 360, height: 780 });
  await seed(page);
  const problems: string[] = [];
  for (const r of ROUTES) {
    await page.goto('./' + r);
    await page.waitForTimeout(700);
    const found = await page.evaluate(() => {
      const W = window.innerWidth;
      const out: string[] = [];
      if (document.documentElement.scrollWidth > W + 1) out.push(`rolagem lateral ${document.documentElement.scrollWidth}px`);
      const scrollers = (el: Element | null): boolean => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true; } return false; };
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const rc = el.getBoundingClientRect();
        if (!rc.width || !rc.height) continue;
        const txt = (el as HTMLElement).innerText?.trim().slice(0, 50) ?? el.tagName;
        if (rc.right > W + 1 && !scrollers(el.parentElement)) out.push(`passa da borda (${Math.round(rc.right)}px): ${el.tagName}.${(el as HTMLElement).className} "${txt}"`);
        const h = el as HTMLElement;
        if (h.children.length === 0 && h.scrollWidth > h.clientWidth + 2 && getComputedStyle(h).overflow !== 'visible' && getComputedStyle(h).textOverflow !== 'ellipsis' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName)) out.push(`texto cortado: ${h.tagName}.${h.className} "${txt}"`);
      }
      return Array.from(new Set(out)).slice(0, 12);
    });
    if (found.length) problems.push(`${r}\n  - ${found.join('\n  - ')}`);
    await page.screenshot({ path: `/tmp/claude-0/sweep/${r.replace(/[#/?=&]+/g, '_')}.png`, fullPage: true });
  }
  console.log(problems.join('\n\n') || 'sem problemas');
  expect(problems, problems.join('\n\n')).toEqual([]);
});
