// Checagem da rotina de rosto da semana, com as regras de segurança da dermatologista.
// Pura (sem banco): o plano mostra os alertas e a dermatologista recebe os mesmos alertas na conversa.
import type { Plan, Product } from '../db/types';
import { layerOf, productStep } from './skinSteps';

const DAY = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const STOCK = new Set(['em_uso', 'guardado', 'conferir']);
const txt = (p: Product) => `${p.name} ${(p.info?.actives ?? []).join(' ')}`.toLowerCase();
export const isRetinoid = (p: Product) => /retin|retinal|retinol|tretino|adapal/.test(txt(p)) && !/bakuchiol/.test(p.name.toLowerCase());
export const isAcid = (p: Product) => /\baha\b|\bbha\b|glic[oó]lico|salic[ií]lico|l[aá]tico|mand[eé]lico|\blha\b/.test(txt(p));

export interface SkinAlert { id: string; text: string; level: 'alto' | 'medio' }

/** Lista do rosto que vale em cada dia da semana, num período. */
function faceDay(skin: NonNullable<Plan['skin']>, per: 'am' | 'pm', wd: number, byId: Map<string, Product>): Product[] {
  const pp = skin[per];
  const day = pp?.days?.[wd] ?? { add: [], remove: [] };
  const ids = [...(pp?.base ?? []).filter((id) => !day.remove.includes(id)), ...day.add.filter((id) => !(pp?.base ?? []).includes(id))];
  return ids.map((id) => byId.get(id)).filter((p): p is Product => !!p && (p.area ?? 'rosto') === 'rosto');
}

const days = (list: number[]) => (list.length === 7 ? 'todos os dias' : list.map((d) => DAY[d]).join(', '));

export function auditSkinPlan(skin: Plan['skin'] | undefined, products: Product[]): SkinAlert[] {
  if (!skin) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: SkinAlert[] = [];
  const noFps: number[] = [], amRetinoid: number[] = [], clash: string[] = [], double: string[] = [];
  let restNights = 0, acidNights = 0;
  const gone = new Set<string>();
  for (let wd = 1; wd <= 7; wd++) {
    const am = faceDay(skin, 'am', wd, byId), pm = faceDay(skin, 'pm', wd, byId);
    for (const p of [...am, ...pm]) if (!STOCK.has(p.status)) gone.add(p.name);
    if (am.length && !am.some((p) => layerOf(p) === 'rosto_fps')) noFps.push(wd);
    if (am.some(isRetinoid)) amRetinoid.push(wd);
    const leave = (l: Product[]) => l.filter((p) => productStep(p) === 'pos');
    const strongPm = leave(pm).filter((p) => p.active || isRetinoid(p) || isAcid(p));
    const strongAm = leave(am).filter((p) => p.active || isRetinoid(p) || isAcid(p));
    if (!strongPm.length) restNights++;
    if (leave(pm).some(isAcid)) acidNights++;
    for (const [lbl, l] of [['manhã', strongAm], ['noite', strongPm]] as const) if (l.length > 1) double.push(`${DAY[wd]} ${lbl} (${l.map((p) => p.name).join(' e ')})`);
    const all = [...am, ...pm];
    const ret = all.filter(isRetinoid), acid = all.filter((p) => isAcid(p) && productStep(p) === 'pos');
    if (ret.length && acid.length) clash.push(`${DAY[wd]} (${ret[0].name} e ${acid[0].name})`);
  }
  if (noFps.length) out.push({ id: 'fps', level: 'alto', text: `Manhã sem protetor solar no rosto: ${days(noFps)}. Com ácido e retinol à noite, a pele fica mais sensível ao sol e o risco de mancha sobe.` });
  if (clash.length) out.push({ id: 'ret_acido', level: 'alto', text: `Retinoide e ácido esfoliante no mesmo dia: ${clash.join('; ')}.` });
  if (double.length) out.push({ id: 'dois_ativos', level: 'medio', text: `Mais de um ativo forte na mesma aplicação: ${double.join('; ')}.` });
  if (amRetinoid.length) out.push({ id: 'retinoide_manha', level: 'medio', text: `Retinoide de manhã: ${days(amRetinoid)}. Ele rende e irrita menos à noite.` });
  if (restNights < 2) out.push({ id: 'descanso', level: 'medio', text: `Só ${restNights} ${restNights === 1 ? 'noite' : 'noites'} sem ativo forte na semana; o ideal são pelo menos 2 para a barreira se recompor.` });
  if (acidNights > 3) out.push({ id: 'acido_semana', level: 'medio', text: `Ácido esfoliante em ${acidNights} noites da semana; para pele sensível, 2 a 3 costumam bastar e o resto vira irritação.` });
  if (gone.size) out.push({ id: 'estoque', level: 'medio', text: `No plano, mas fora do seu estoque: ${[...gone].join(', ')}.` });
  return out;
}
