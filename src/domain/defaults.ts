// Catálogos genéricos, sem dados pessoais. Os dados pessoais entram apenas pela importação do arquivo privado.
import { db } from '../db/db';
import type { AnyRecord } from '../db/types';
import type { Category, Modality, ProductGroup, Settings } from '../db/types';

export const MEAL_TYPES = [
  { id: 'cafe', label: 'Café da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lanche', label: 'Lanche' },
  { id: 'jantar', label: 'Jantar' },
  { id: 'ceia', label: 'Ceia' }
];

export const PORTIONS = ['P', 'M', 'G', '1 un.', '2 un.', '1 colher', '1 fatia', '1 copo'];

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'kind' | 'createdAt' | 'updatedAt'> = {
  waterPresets: [200, 300, 500],
  mealTypes: MEAL_TYPES,
  durations: [15, 20, 30, 45, 60, 90, 120],
  skinProfile: [],
  foodPrefs: [],
  onboarded: false,
  owners: ['Eu']
};

export const DEFAULT_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'labels' | 'subcategories' | 'order'>> = [
  { id: 'cat:compras', name: 'Compras e materiais', labels: { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, subcategories: [], order: 1 },
  { id: 'cat:compromissos', name: 'Compromissos', labels: { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, subcategories: [], order: 2 },
  { id: 'cat:projetos', name: 'Projetos', labels: { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, subcategories: [], order: 3 }
];

export const DEFAULT_MODALITIES: Array<Pick<Modality, 'id' | 'name' | 'extra' | 'order'>> = [
  { id: 'mod:musculacao', name: 'Musculação', extra: 'muscle', order: 1 },
  { id: 'mod:corrida', name: 'Corrida', extra: 'distance', order: 2 },
  { id: 'mod:ciclismo', name: 'Ciclismo', extra: 'distance', order: 3 },
  { id: 'mod:natacao', name: 'Natação', extra: 'distance', order: 4 },
  { id: 'mod:yoga', name: 'Yoga', extra: null, order: 5 },
  { id: 'mod:transicao', name: 'Transição', extra: 'combo', order: 6 },
  { id: 'mod:caminhada', name: 'Caminhada', extra: 'distance', order: 7 },
  { id: 'mod:mobilidade', name: 'Mobilidade e alongamento', extra: null, order: 8 },
  { id: 'mod:descanso', name: 'Descanso', extra: 'rest', order: 9 },
  { id: 'mod:lpo', name: 'LPO', extra: null, order: 10 }
];

export const MUSCLE_GROUPS = ['Pernas', 'Glúteos', 'Costas', 'Peito', 'Ombros', 'Braços', 'Core', 'Corpo todo'];
export const REST_TYPES = ['Descanso total', 'Recuperação ativa', 'Massagem/liberação'];

export const GROUPS: { id: ProductGroup; label: string }[] = [
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'seruns', label: 'Séruns' },
  { id: 'tratamentos', label: 'Tratamentos' },
  { id: 'olhos', label: 'Olhos' },
  { id: 'hidratacao', label: 'Hidratação' },
  { id: 'fps', label: 'FPS' },
  { id: 'corpo', label: 'Corpo' }
];
export const GROUP_RANK: Record<ProductGroup, number> = { limpeza: 1, tratamentos: 2, seruns: 3, olhos: 4, hidratacao: 5, fps: 6, corpo: 7 };

export function groupFromCategory(cat: string): { group: ProductGroup; active: boolean } {
  const c = cat.toLowerCase();
  if (c.includes('limpeza')) return { group: 'limpeza', active: false };
  if (c.includes('sérum') || c.includes('serum') || c.includes('ampola')) return { group: 'seruns', active: false };
  if (c.includes('ativo')) return { group: 'tratamentos', active: true };
  if (c.includes('tratamento') || c.includes('máscara') || c.includes('mascara')) return { group: 'tratamentos', active: false };
  if (c.includes('olho')) return { group: 'olhos', active: false };
  if (c.includes('solar') || c.includes('fps')) return { group: 'fps', active: false };
  if (c.includes('corpo')) return { group: 'corpo', active: false };
  return { group: 'hidratacao', active: false }; // hidratação, conforto, reparação
}

export const SKIN_SIGNALS = [
  { id: 'oleosidade', label: 'Oleosidade' },
  { id: 'ressecamento', label: 'Ressecamento' },
  { id: 'vermelhidao', label: 'Vermelhidão' },
  { id: 'ardencia', label: 'Ardência' },
  { id: 'acne', label: 'Espinhas' },
  { id: 'cravos', label: 'Cravos e poros' },
  { id: 'textura', label: 'Textura' },
  { id: 'descamacao', label: 'Descamação' },
  { id: 'olheiras', label: 'Olheiras' }
];
export const SKIN_CONDITIONS = [
  { id: 'otima', label: 'Ótima' },
  { id: 'boa', label: 'Boa' },
  { id: 'regular', label: 'Regular' },
  { id: 'sensibilizada', label: 'Sensibilizada' }
] as const;
export const INTENSITY_LABEL = { 1: 'leve', 2: 'moderada', 3: 'forte' } as const;

/** Garante catálogos genéricos e ajustes. Não sobrescreve nada existente. */
// Padrões são gravados com data "antiga" (1) para que qualquer versão editada no servidor prevaleça.
export async function ensureDefaults() {
  const seed = async (id: string, kind: string, data: object) => {
    if (await db.records.get(id)) return;
    await db.records.put({ ...data, id, kind, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 1 } as unknown as AnyRecord);
  };
  await seed('settings', 'settings', DEFAULT_SETTINGS);
  for (const c of DEFAULT_CATEGORIES) await seed(c.id, 'category', c);
  for (const m of DEFAULT_MODALITIES) await seed(m.id, 'modality', m);
}
