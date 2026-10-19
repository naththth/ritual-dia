import type { DateKey } from '../lib/dates';

export interface Base {
  id: string;
  kind: Kind;
  updatedAt: number;
  createdAt: number;
  deleted?: 0 | 1;
  dirty?: 0 | 1;
}

export type Kind =
  | 'settings' | 'category' | 'task' | 'suggestion'
  | 'habit' | 'hlog' | 'goal' | 'gentry'
  | 'product' | 'skin' | 'photo'
  | 'food' | 'mtemplate' | 'meal' | 'water'
  | 'modality' | 'wtemplate' | 'workout'
  | 'plan' | 'skip' | 'brief';

export type Priority = 'alta' | 'media' | 'baixa';
export const PRIORITIES: Priority[] = ['alta', 'media', 'baixa'];

export interface Settings extends Base {
  kind: 'settings';
  waterPresets: number[];
  waterGoalMl?: number;
  mealTypes: { id: string; label: string }[];
  durations: number[];
  skinProfile: string[];
  foodPrefs: string[];
  onboarded: boolean;
  importedAt?: number;
  reviewDone?: boolean;
  owners: string[];
  ftp?: number;
  aiContext?: string; // observações livres para a IA (rotina, restrições)
  showNutrition?: boolean; // padrão: ligado
  targets?: { kcal?: number; p?: number; c?: number; f?: number }; // metas próprias; sem elas, usa o plano do dia
}

export interface Category extends Base {
  kind: 'category';
  name: string;
  labels: Record<Priority, string>;
  subcategories: string[];
  order: number;
  archived?: boolean;
}

export type TaskStatus = 'pendente' | 'concluida' | 'arquivada';
export type ExecMode = 'celular' | 'computador' | 'presencial' | 'em_casa' | 'na_rua';

export interface Subtask { id: string; title: string; done: boolean }
export interface TaskHistory { at: number; text: string }

export interface Task extends Base {
  kind: 'task';
  title: string;
  categoryId: string;
  subcategory?: string;
  priority: Priority;
  status: TaskStatus;
  description?: string;
  nextStep?: string;
  owner?: string;
  costEst?: number;
  costReal?: number;
  minutes?: number;
  mode?: ExecMode;
  tags: string[];
  subtasks: Subtask[];
  stage?: string; // projetos / compromissos
  appointmentDate?: DateKey; // data real de compromisso
  plannedDate?: DateKey | null; // intenção de fazer
  completedDate?: DateKey | null;
  history: TaskHistory[];
  sourceId?: string;
}

export type SuggestionAction = 'aceita' | 'adiada' | 'dispensada';
export interface SuggestionLog extends Base {
  kind: 'suggestion';
  taskId: string;
  date: DateKey;
  action: SuggestionAction;
}

export type HabitFreq = 'diaria' | 'semanal' | 'mensal';
export interface Habit extends Base {
  kind: 'habit';
  title: string;
  freq: HabitFreq;
  target: number;
  modalityId?: string; // treino desta modalidade conta para o hábito
  priority: Priority;
  note?: string;
  order: number;
  archived?: boolean;
}
export interface HabitLog extends Base {
  kind: 'hlog';
  habitId: string;
  date: DateKey;
  done: boolean;
}

export type GoalType = 'quantitativa' | 'financeira' | 'marcos' | 'frequencia';
export interface Milestone { id: string; title: string; done: boolean; doneDate?: DateKey }
export interface Goal extends Base {
  kind: 'goal';
  title: string;
  type: GoalType;
  unit?: string;
  startValue?: number;
  targetValue?: number;
  deadline?: DateKey;
  note?: string;
  milestones: Milestone[];
  status: 'ativa' | 'concluida' | 'arquivada';
}
export interface GoalEntry extends Base {
  kind: 'gentry';
  goalId: string;
  date: DateKey;
  value: number;
  note?: string;
}

export type ProductGroup = 'limpeza' | 'seruns' | 'tratamentos' | 'olhos' | 'hidratacao' | 'fps' | 'corpo';
export type ProductStatus = 'em_uso' | 'guardado' | 'acabou' | 'quero_comprar' | 'conferir' | 'de_outra' | 'arquivado';
export interface Product extends Base {
  kind: 'product';
  brand: string;
  name: string;
  group: ProductGroup;
  originalCategory?: string;
  area: 'rosto' | 'corpo';
  period: 'am' | 'pm' | 'ambos';
  status: ProductStatus;
  active?: boolean; // ativo potencialmente irritante, marcado por ela
  openedAt?: DateKey;
  note?: string;
  sourceId?: string;
}

export type SkinPeriod = 'am' | 'pm' | 'corpo';
export type SkinCondition = 'otima' | 'boa' | 'regular' | 'sensibilizada';
export interface SkinLog extends Base {
  kind: 'skin';
  date: DateKey;
  period: SkinPeriod;
  condition?: SkinCondition;
  signals: Record<string, 1 | 2 | 3>;
  productIds: string[];
  plannedIds: string[];
  skipped?: boolean;
  recovery?: boolean;
  note?: string;
}
export interface Photo extends Base {
  kind: 'photo';
  date: DateKey;
  period: SkinPeriod;
  storagePath?: string;
  width?: number;
  height?: number;
}

export interface Nutr { kcal: number; p: number; c: number; f: number; fib?: number; na?: number }
export interface Measure { label: string; grams: number }
export interface Food extends Base {
  kind: 'food';
  name: string;
  type: string;
  favorite?: boolean;
  portions: string[];
  kcal?: number; // legado
  n?: Nutr; // por 100 g, de fonte rastreável ou digitado por ela
  source?: 'taco' | 'off' | 'manual';
  sourceRef?: string; // id TACO ou código de barras
  measures?: Measure[]; // medidas caseiras com peso (ex.: 1 un. = 50 g)
  archived?: boolean;
  sourceId?: string;
}
export interface MealItem { foodId: string; portion: string; grams?: number }
export interface MealTemplate extends Base {
  kind: 'mtemplate';
  name: string;
  mealType?: string;
  items: MealItem[];
  archived?: boolean;
}
export interface Meal extends Base {
  kind: 'meal';
  date: DateKey;
  mealType: string;
  items: MealItem[];
  templateId?: string;
  fromPlan?: boolean;
  note?: string;
}
export interface Water extends Base {
  kind: 'water';
  date: DateKey;
  ml: number;
}

export type Intensity = 'leve' | 'moderada' | 'intensa';
export type ModalityExtra = 'distance' | 'muscle' | 'combo' | 'rest' | null;
export interface Modality extends Base {
  kind: 'modality';
  name: string;
  extra: ModalityExtra;
  order: number;
  archived?: boolean;
}
export interface WorkoutStep { label: string; minutes: number; pct: number }
export interface WorkoutTemplate extends Base {
  kind: 'wtemplate';
  steps?: WorkoutStep[]; // blocos em % do FTP (pedal)
  note?: string;
  name: string;
  modalityId: string;
  duration: number;
  intensity: Intensity;
  muscles?: string[];
  distanceKm?: number;
  archived?: boolean;
}
export interface Workout extends Base {
  kind: 'workout';
  date: DateKey;
  modalityId: string;
  duration?: number;
  intensity?: Intensity;
  distanceKm?: number;
  muscles?: string[];
  combo?: string[];
  restType?: string;
  templateId?: string;
  fromPlan?: boolean;
  note?: string;
}

export type PlanDomain = 'skin' | 'training' | 'food';
export interface SkinPeriodPlan {
  base: string[]; // produtos da rotina-base
  days: Record<number, { add: string[]; remove: string[] }>; // 1..7
}
export interface Plan extends Base {
  kind: 'plan';
  domain: PlanDomain;
  validFrom: DateKey;
  skin?: { am: SkinPeriodPlan; pm: SkinPeriodPlan; recovery: { am: string[]; pm: string[] } };
  training?: Record<number, string[]>; // weekday -> wtemplate ids
  food?: Record<number, Record<string, string | null>>; // weekday -> mealType -> mtemplate id
}

export interface Skip extends Base {
  kind: 'skip';
  date: DateKey;
  domain: PlanDomain;
  ref: string;
}

export interface DayBrief extends Base {
  kind: 'brief';
  date: DateKey;
  foco?: string;
  pele?: string;
  treino?: string;
  tarefas: { id: string; motivo: string; primeiro_passo: string }[];
}

export type AnyRecord =
  | Settings | Category | Task | SuggestionLog | Habit | HabitLog | Goal | GoalEntry
  | Product | SkinLog | Photo | Food | MealTemplate | Meal | Water
  | Modality | WorkoutTemplate | Workout | Plan | Skip | DayBrief;

export type KindMap = {
  settings: Settings; category: Category; task: Task; suggestion: SuggestionLog;
  habit: Habit; hlog: HabitLog; goal: Goal; gentry: GoalEntry;
  product: Product; skin: SkinLog; photo: Photo;
  food: Food; mtemplate: MealTemplate; meal: Meal; water: Water;
  modality: Modality; wtemplate: WorkoutTemplate; workout: Workout;
  plan: Plan; skip: Skip; brief: DayBrief;
};
