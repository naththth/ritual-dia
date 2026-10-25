// Etapas da rotina de cuidados: o que vai no banho (lava e enxágua) e o que vem depois dele, por área.
// E as mudanças de rotina que a dermatologista propõe na conversa: para um dia só ou para a semana.
import type { Plan, Product, SkinPeriodPlan } from '../db/types';

export type Step = 'banho' | 'pos';
export type Area = 'rosto' | 'cabelo' | 'corpo';

export const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 'banho', label: 'No banho', hint: 'Lava e enxágua' },
  { id: 'pos', label: 'Depois do banho', hint: 'Fica na pele e no cabelo' }
];
export const AREAS: { id: Area; label: string }[] = [
  { id: 'rosto', label: 'Rosto' }, { id: 'cabelo', label: 'Cabelo' }, { id: 'corpo', label: 'Corpo' }
];

const RINSE = /enx[aá]gu|enxagu|retire com [aá]gua|remova com [aá]gua|aplique (no|sobre o) (cabelo|corpo|rosto) molhad|com a pele molhada|no banho|durante o banho/;
const WASH_HAIR = /shampoo|xampu|shampoing|\bbain\b|fondant|masquintense|masque|rinse-?off|apr[eè]s-?shampo|condicionador|co-?wash|m[aá]scara (capilar|de (hidrata|nutri|reconstru))|pr[eé]-?shampoo|esfoliante (de|do) couro|detox capilar|acidificante/;
const WASH_BODY = /sabonete|gel de banho|gel & espuma de banho|douche|gommage|scrub|\bwash\b|body wash|shower|[oó]leo de banho|esfoliante|bucha|espuma de banho|limpeza/;
const WASH_FACE = /limpeza|cleanser|cleansing|nettoyant|moussant|micellar|micelar|h2o|mud mask|demaquilante|[aá]gua micelar|espuma|balm de limpeza|[oó]leo de limpeza|sabonete|esfoliante|m[aá]scara de argila|clay mask|peeling/;
const LEAVE_ON = /leave-?in|sem enx[aá]gue|t[oô]nico|s[eé]rum|[oó]leo de pontas|finalizador|creme de pentear|protetor t[eé]rmico|reparador de pontas|hidratante|lo[cç][aã]o|creme|fps|protetor solar|desodorante|perfume|body splash/;

/** Em que etapa o produto entra: o que ela escolheu ou, sem escolha, o que o tipo, o nome e o modo de uso indicam. */
export function productStep(p: Pick<Product, 'step' | 'group' | 'area' | 'name' | 'originalCategory' | 'info'>): Step {
  if (p.step) return p.step;
  const name = `${p.name ?? ''} ${p.originalCategory ?? ''}`.toLowerCase();
  const how = `${p.info?.howToUse ?? ''}`.toLowerCase();
  const area = p.area ?? 'rosto';
  if (/sem enx[aá]gue|leave-?in/.test(name + ' ' + how)) return 'pos';
  if (/de limpeza|demaquilante|cleanser|cleansing|sabonete|shampoo|xampu|shampoing|condicionador|gel de banho|body wash|douche|gommage|rinse-?off/.test(name)) return 'banho';
  if (area === 'cabelo') return WASH_HAIR.test(name) || (RINSE.test(how) && !LEAVE_ON.test(name)) ? 'banho' : 'pos';
  if (area === 'corpo') return WASH_BODY.test(name) || (RINSE.test(how) && !LEAVE_ON.test(name)) ? 'banho' : 'pos';
  if (p.group === 'limpeza') return 'banho';
  return WASH_FACE.test(name) && !LEAVE_ON.test(name) ? 'banho' : 'pos';
}

export const areaOfProduct = (p?: Pick<Product, 'area'>): Area => (p?.area ?? 'rosto') as Area;

/** Produtos que ela tem (para escolher numa rotina): em uso, guardados ou para conferir. */
export const OWNED = new Set(['em_uso', 'guardado', 'conferir']);

/* ---------- Mudanças propostas pela dermatologista ---------- */

/** Uma linha da proposta: em que período, em que dia (data, para um dia só; dia da semana 1 a 7 ou 0 = todos os dias, para a semana). */
export interface RoutineChange { period: 'am' | 'pm'; date?: string; weekday?: number; add: string[]; remove: string[] }

const uniq = (a: string[]) => Array.from(new Set(a));
const without = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

/** Aplica as mudanças da semana ao plano de pele, sem tocar no resto: todos os dias mexe na base; um dia, no que muda naquele dia. */
export function applyWeekChanges(skin: NonNullable<Plan['skin']>, changes: RoutineChange[]): NonNullable<Plan['skin']> {
  const out: NonNullable<Plan['skin']> = JSON.parse(JSON.stringify(skin));
  for (const c of changes) {
    const pp: SkinPeriodPlan = out[c.period] ?? { base: [], days: {} };
    pp.days = pp.days ?? {};
    const wd = c.weekday ?? 0;
    if (wd === 0) {
      pp.base = uniq([...without(pp.base, c.remove), ...c.add]);
      for (const k of Object.keys(pp.days)) {
        const d = pp.days[Number(k)];
        pp.days[Number(k)] = { add: without(d.add, [...c.add, ...c.remove]), remove: without(d.remove, [...c.add, ...c.remove]) };
      }
    } else {
      const d = pp.days[wd] ?? { add: [], remove: [] };
      const add = [...d.add], remove = [...d.remove];
      for (const id of c.add) {
        if (pp.base.includes(id)) { const i = remove.indexOf(id); if (i >= 0) remove.splice(i, 1); }
        else if (!add.includes(id)) add.push(id);
      }
      for (const id of c.remove) {
        const i = add.indexOf(id); if (i >= 0) add.splice(i, 1);
        if (pp.base.includes(id) && !remove.includes(id)) remove.push(id);
      }
      pp.days[wd] = { add, remove };
    }
    out[c.period] = pp;
  }
  return out;
}

export const emptySkinPlan = (): NonNullable<Plan['skin']> => ({ am: { base: [], days: {} }, pm: { base: [], days: {} }, recovery: { am: [], pm: [] } });
