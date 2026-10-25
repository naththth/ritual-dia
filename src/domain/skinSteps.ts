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
  const lay = (p as Partial<Product>).layer;
  if (lay) { const st = LAYERS_STEP[lay]; if (st) return st; }
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

/* ---------- Camadas: a ordem de aplicação dentro de cada etapa e área ---------- */

/** Camadas na ordem em que se aplica. A dermatologista diz em que camada cada produto fica e a ordem dentro dela. */
export const LAYERS: { id: string; area: Area; step: Step; label: string }[] = [
  { id: 'rosto_oleo_limpeza', area: 'rosto', step: 'banho', label: 'Limpeza oleosa' },
  { id: 'rosto_limpeza', area: 'rosto', step: 'banho', label: 'Limpeza' },
  { id: 'rosto_esfoliante', area: 'rosto', step: 'banho', label: 'Esfoliante ou máscara de enxágue' },
  { id: 'rosto_tonico', area: 'rosto', step: 'pos', label: 'Tônico, loção ou pad' },
  { id: 'rosto_essencia', area: 'rosto', step: 'pos', label: 'Essência' },
  { id: 'rosto_serum', area: 'rosto', step: 'pos', label: 'Ampola ou sérum' },
  { id: 'rosto_tratamento', area: 'rosto', step: 'pos', label: 'Tratamento' },
  { id: 'rosto_olhos', area: 'rosto', step: 'pos', label: 'Olhos' },
  { id: 'rosto_creme', area: 'rosto', step: 'pos', label: 'Hidratante' },
  { id: 'rosto_oleo', area: 'rosto', step: 'pos', label: 'Óleo ou máscara noturna' },
  { id: 'rosto_fps', area: 'rosto', step: 'pos', label: 'Protetor solar' },
  { id: 'rosto_labios', area: 'rosto', step: 'pos', label: 'Lábios' },
  { id: 'cabelo_pre', area: 'cabelo', step: 'banho', label: 'Pré-shampoo' },
  { id: 'cabelo_shampoo', area: 'cabelo', step: 'banho', label: 'Shampoo' },
  { id: 'cabelo_condicionador', area: 'cabelo', step: 'banho', label: 'Condicionador ou máscara' },
  { id: 'cabelo_couro', area: 'cabelo', step: 'pos', label: 'Couro cabeludo' },
  { id: 'cabelo_leave_in', area: 'cabelo', step: 'pos', label: 'Leave-in' },
  { id: 'cabelo_termico', area: 'cabelo', step: 'pos', label: 'Protetor térmico' },
  { id: 'cabelo_finalizador', area: 'cabelo', step: 'pos', label: 'Óleo ou finalizador' },
  { id: 'corpo_limpeza', area: 'corpo', step: 'banho', label: 'Limpeza' },
  { id: 'corpo_esfoliante', area: 'corpo', step: 'banho', label: 'Esfoliante' },
  { id: 'corpo_serum', area: 'corpo', step: 'pos', label: 'Sérum corporal' },
  { id: 'corpo_hidratante', area: 'corpo', step: 'pos', label: 'Hidratante' },
  { id: 'corpo_oleo', area: 'corpo', step: 'pos', label: 'Óleo' },
  { id: 'corpo_outros', area: 'corpo', step: 'pos', label: 'Proteção e outros' }
];
const LAYER_RANK = new Map(LAYERS.map((l, i) => [l.id, i]));
export const LAYER_IDS = new Set(LAYERS.map((l) => l.id));

type LayerInput = Pick<Product, 'step' | 'group' | 'area' | 'name' | 'originalCategory' | 'info' | 'layer'>;

/** Camada do produto: a que a dermatologista ou ela definiu ou, sem isso, a que o tipo e o nome indicam. */
export function layerOf(p: LayerInput): string {
  const area = (p.area ?? 'rosto') as Area;
  if (p.layer && LAYER_IDS.has(p.layer) && p.layer.startsWith(area)) return p.layer;
  const n = `${p.name ?? ''} ${p.originalCategory ?? ''}`.toLowerCase();
  const step = productStep(p);
  if (area === 'cabelo') {
    if (step === 'banho') return /pr[eé]-?shampo/.test(n) ? 'cabelo_pre' : /shampoo|xampu|shampoing|\bbain\b|co-?wash/.test(n) ? 'cabelo_shampoo' : 'cabelo_condicionador';
    if (/t[eé]rmic|thermique|heat/.test(n)) return 'cabelo_termico';
    if (/leave-?in|sem enx[aá]gue/.test(n)) return 'cabelo_leave_in';
    if (/t[oô]nico|couro|scalp|anti-?chute|queda|hair loss|ampoule|ampola|root/.test(n)) return 'cabelo_couro';
    return 'cabelo_finalizador';
  }
  if (area === 'corpo') {
    if (step === 'banho') return /esfolia|gommage|scrub/.test(n) ? 'corpo_esfoliante' : 'corpo_limpeza';
    if (/antiatrito|anti-?atrito|desodorante|fps|protetor/.test(n)) return 'corpo_outros';
    if (/s[eé]rum|serum/.test(n)) return 'corpo_serum';
    if (/[oó]leo|\boil\b|huile/.test(n)) return 'corpo_oleo';
    return 'corpo_hidratante';
  }
  if (step === 'banho') return /oil|[oó]leo|balm|bálsamo/.test(n) ? 'rosto_oleo_limpeza' : /mud|argila|clay|esfolia|peeling|scrub/.test(n) ? 'rosto_esfoliante' : 'rosto_limpeza';
  if (p.group === 'fps' || /\bspf\b|\bfps\b|\bsun\b|solar|sunstick/.test(n)) return 'rosto_fps';
  if (/\blip\b|l[aá]bio/.test(n)) return 'rosto_labios';
  if (p.group === 'olhos' || /\beye|olho|olheira/.test(n)) return 'rosto_olhos';
  if (/\bpad\b|t[oô]nico|toner|\blotion\b|\bloção\b|[aá]gua termal|mist/.test(n)) return 'rosto_tonico';
  if (/ess[eê]ncia|essence/.test(n)) return 'rosto_essencia';
  if (p.group === 'tratamentos' || /retin|bha|aha|[aá]cido|azel|benz|per[oó]xido|acne|curativo|spot|blemish gel/.test(n)) return 'rosto_tratamento';
  if (p.group === 'seruns' || /s[eé]rum|serum|ampoule|ampola|capsule ampoule/.test(n)) return 'rosto_serum';
  if (/sleeping|overnight|noturn|night mask|[oó]leo facial|face oil/.test(n)) return 'rosto_oleo';
  return 'rosto_creme';
}
export const layerLabel = (id: string) => LAYERS.find((l) => l.id === id)?.label ?? '';

/** Ordem de aplicação: etapa (banho antes), área, camada e, dentro da camada, a posição que a dermatologista ou ela definiu. */
export function applicationOrder(ids: string[], byId: Map<string, Product>): string[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  const key = (id: string) => {
    const p = byId.get(id)!;
    const l = layerOf(p);
    return [STEPS.findIndex((s) => s.id === (LAYERS.find((x) => x.id === l)?.step ?? productStep(p))), AREAS.findIndex((a) => a.id === (p.area ?? 'rosto')), LAYER_RANK.get(l) ?? 99, p.layerPos ?? 999, pos.get(id) ?? 0];
  };
  return ids.filter((id) => byId.has(id)).sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; });
}

/** Modo de uso em 1 a 2 linhas: o resumo da dermatologista ou, sem ele, o começo do modo de uso da ficha. */
export function shortUse(p: Pick<Product, 'howShort' | 'info'>): string | undefined {
  if (p.howShort?.trim()) return p.howShort.trim();
  const h = p.info?.howToUse?.trim();
  if (!h) return undefined;
  const first = h.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
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

/** Etapa de cada camada (para quem tem camada definida pela dermatologista). */
const LAYERS_STEP: Record<string, Step> = Object.fromEntries(LAYERS.map((l) => [l.id, l.step]));
