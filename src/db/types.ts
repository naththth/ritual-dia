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
  | 'plan' | 'skip' | 'extra' | 'brief' | 'devreq'
  | 'wellness' | 'journal' | 'note' | 'book' | 'readlog' | 'review' | 'healthdoc' | 'cycle'
  | 'intake' | 'intakelog' | 'mood' | 'caffeine' | 'medchange' | 'chatstore' | 'ritual' | 'post' | 'win' | 'opp' | 'devitem' | 'careerbase' | 'devpick';

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
  /** Preferências dela por plano; a IA segue, com ressalva só para combinações claramente danosas. */
  aiPrefs?: { skin?: string; training?: string; food?: string; mind?: string; career?: string };
  profile?: Profile; // perfil e objetivos: base para nutrição, treino e pele
  targetsNote?: string; // como a IA chegou às metas
  showNutrition?: boolean; // padrão: ligado
  mealTimes?: Record<string, string>; // 'cafe' -> '07:30'
  skinTimes?: { am: string; pm: string; corpo?: string; cabelo?: string };
  reminders?: Reminders;
  readingGoal?: number; // livros por ano
  autoBrief?: boolean; // prepara o dia sozinho ao abrir
  intervals?: { athleteId?: string; connected?: boolean; lastSync?: number };
  /** Ajustes do app com o Claude: tarefa conectada e se o botão aparece nas telas. */
  devAssist?: { connected?: boolean; hidden?: boolean };
  /** Regras que ela ensinou à treinadora: como reclassificar o que o relógio grava (ex.: musculação às terças à noite é LPO). */
  trainingRules?: TrainingRule[];
  targets?: { kcal?: number; p?: number; c?: number; f?: number }; // metas próprias; sem elas, usa o plano do dia
  /** Área Mente: PIN (hash), cafés que ela toma e avisos dispensados no dia. */
  mind?: MindSettings;
  /** Marca pessoal: ritmo de posts no LinkedIn. */
  brand?: { perWeek?: number; days?: number[]; off?: boolean; profile?: LinkedinProfile };
}

export interface Drink { id: string; label: string; mg: number }
/** Panorama do perfil no LinkedIn, copiado do painel de desempenho. Variações em % (negativo é queda). */
export interface LinkedinProfile {
  date: DateKey;
  impressoes7d?: number; impressoes7dVar?: number;
  seguidores?: number; seguidoresVar?: string;
  visitas90d?: number; visitas90dVar?: number;
  buscas?: number; buscasPeriodo?: string;
}
export interface MindSettings {
  pinHash?: string;
  drinks?: Drink[];
  /** id do aviso -> dia em que ela dispensou (volta a aparecer no dia seguinte, se o padrão continuar). */
  dismissed?: Record<string, DateKey>;
  /** O que ela achou das sugestões de cuidado (respiração, frase, música), para a IA acertar mais. */
  careFeedback?: { at: DateKey; item: string; liked: boolean }[];
}

export interface TrainingRule {
  id: string;
  text: string; // como ela disse, para mostrar e para a IA
  fromModalityId: string; // como o relógio grava (ex.: mod:musculacao)
  toModalityId: string;
  weekdays?: number[]; // 1 = segunda ... 7 = domingo
  from?: string; // HH:MM
  to?: string; // HH:MM
  createdAt: number;
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
  remindAt?: string; // HH:MM no dia planejado: vira notificação
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

export type ProductGroup = 'limpeza' | 'seruns' | 'tratamentos' | 'olhos' | 'hidratacao' | 'fps' | 'corpo' | 'cabelo';
export type ProductStatus = 'em_uso' | 'guardado' | 'acabou' | 'quero_comprar' | 'conferir' | 'de_outra' | 'arquivado';
export interface Product extends Base {
  kind: 'product';
  brand: string;
  name: string;
  group: ProductGroup;
  originalCategory?: string;
  area: 'rosto' | 'corpo' | 'cabelo';
  period: 'am' | 'pm' | 'ambos';
  status: ProductStatus;
  active?: boolean; // ativo potencialmente irritante, marcado por ela
  /** Em que momento da rotina entra: no banho (lava e enxágua) ou depois dele. Sem isto, o app deduz pelo tipo e pelo nome. */
  step?: 'banho' | 'pos';
  /** Camada na ordem de aplicação (ex.: rosto_tonico, rosto_serum) e posição dentro dela. Definidas pela dermatologista ou por ela. */
  layer?: string;
  layerPos?: number;
  /** Como usar, em 1 a 2 linhas, para aparecer na rotina. */
  howShort?: string;
  /** Miniatura da embalagem (data URL pequena), achada na internet ou tirada por ela, para reconhecer o produto de relance. */
  image?: string;
  /** De onde veio a miniatura achada na internet. */
  imageSrc?: string;
  /** A busca de foto já foi tentada e não achou nada (não tenta de novo sozinha). */
  imageTried?: boolean;
  openedAt?: DateKey;
  note?: string;
  sourceId?: string;
  info?: ProductInfo;
}
/** Ficha do produto: o que é, para que serve e como usar (lida da embalagem e completada pela IA). */
export interface ProductInfo {
  purpose?: string;
  howToUse?: string;
  indication?: string;
  actives?: string[];
  cautions?: string;
  fromLabel?: boolean;
  confidence?: 'alta' | 'media' | 'baixa';
}

export type SkinPeriod = 'am' | 'pm' | 'corpo' | 'cabelo';
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
  rpe?: number; // esforço percebido 1 a 10
  feeling?: string; // como foi, nas palavras dela
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
/** Exercício de musculação: o programado (no modelo) e o que ela fez (no treino). */
export interface StrengthExercise {
  id: string;
  group: string; // grupo muscular do catálogo
  name: string;
  sets: number;
  reps: number;
  /** Carga da série mais pesada (a de referência para progressão). Com carga por série, é o máximo de setLoads. */
  loadKg?: number;
  /** Carga de cada série, na ordem (ela sobe de série para série). Sem isto, todas as séries usam loadKg. */
  setLoads?: number[];
  /** Séries regressivas: repetições de cada série, na ordem (ex.: 12, 10, 8). Sem isto, todas as séries usam reps.
   *  Com isto, reps é a da 1ª série. */
  setReps?: number[];
  /** Quantas vezes ela pediu "trazer outras": gira as 3 variações da lista. */
  round?: number;
  /** Dia (YYYY-MM-DD) em que ela fixou a carga à mão; vale até o próximo treino feito com o exercício. */
  loadAt?: DateKey;
  /** No treino feito: o que estava programado, para comparar. */
  planned?: { name: string; sets: number; reps: number; loadKg?: number; setLoads?: number[]; setReps?: number[] };
}
export interface WorkoutStep { label: string; minutes: number; pct: number }
export interface WorkoutTemplate extends Base {
  kind: 'wtemplate';
  time?: string; // 'HH:MM' quando tem horário fixo (aula)
  steps?: WorkoutStep[]; // blocos em % do FTP (pedal)
  note?: string;
  /** Treino de um dia só (montado na conversa com a treinadora): não aparece nos catálogos nem no plano semanal. */
  oneOff?: DateKey;
  name: string;
  modalityId: string;
  duration: number;
  intensity: Intensity;
  muscles?: string[];
  /** Musculação: exercícios programados, com séries, repetições e carga. */
  exercises?: StrengthExercise[];
  distanceKm?: number;
  archived?: boolean;
}
export interface WorkoutMetrics {
  source: 'fit' | 'manual' | 'intervals';
  sport?: string;
  distanceKm?: number; kcal?: number; avgHr?: number; maxHr?: number;
  avgPower?: number; maxPower?: number; np?: number; if?: number; tss?: number;
  best5?: number; best20?: number; avgCadence?: number; ascentM?: number; avgSpeed?: number;
  zones?: Record<string, number>; ftpUsed?: number;
  laps?: { minutes: number; avgPower?: number; avgHr?: number }[];
}
export interface Workout extends Base {
  kind: 'workout';
  metrics?: WorkoutMetrics;
  startTime?: string; // ISO do início real (arquivo)
  fileName?: string;
  name?: string; // nome da atividade no MyWhoosh/Garmin
  date: DateKey;
  modalityId: string;
  duration?: number;
  intensity?: Intensity;
  distanceKm?: number;
  muscles?: string[];
  /** Musculação: o que ela fez de fato (o relógio não sabe), com o programado guardado para comparar. */
  exercises?: StrengthExercise[];
  combo?: string[];
  restType?: string;
  templateId?: string;
  fromPlan?: boolean;
  /** Musculação do relógio que virou a aula do horário (ex.: LPO). */
  reclassifiedFrom?: string;
  classChecked?: boolean;
  /** Quem trocou a modalidade: o horário da aula, uma regra dela ou a conversa com a treinadora. */
  reclassifiedBy?: 'aula' | 'regra' | 'conversa';
  /** Campos que ela corrigiu à mão ou pela conversa: a sincronização não sobrescreve. */
  locked?: string[];
  note?: string;
  rpe?: number; // esforço percebido 1 a 10
  feeling?: string; // como foi, nas palavras dela
  /** Leitura da IA depois do treino: desempenho, recuperação e o que comer. basis guarda o que ela tinha lançado quando foi gerada. */
  aiFeedback?: { titulo?: string; desempenho?: string; recuperacao?: string; alimentacao?: string; proximo?: string; nota?: number; at: number; basis: string };
}

export type PlanDomain = 'skin' | 'training' | 'food';
export interface SkinPeriodPlan {
  base: string[]; // produtos da rotina-base
  days: Record<number, { add: string[]; remove: string[] }>; // 1..7
  /** Só no cabelo: dias de lavar (1..7). Nesses dias entra a rotina-base; nos outros, só o que for do dia. */
  washDays?: number[];
}
export interface Plan extends Base {
  kind: 'plan';
  domain: PlanDomain;
  validFrom: DateKey;
  skin?: { am: SkinPeriodPlan; pm: SkinPeriodPlan; recovery: { am: string[]; pm: string[] }; body?: SkinPeriodPlan; hair?: SkinPeriodPlan;
    /** Diagnóstico da IA a partir da avaliação (rosto, corpo, cabelo), guardado com a versão do plano. */
    diagnosis?: { rosto?: string; corpo?: string; cabelo?: string; date?: string } };
  training?: Record<number, string[]>; // weekday -> wtemplate ids
  food?: Record<number, Record<string, string | null>>; // weekday -> mealType -> mtemplate id
}

export interface Skip extends Base {
  kind: 'skip';
  date: DateKey;
  domain: PlanDomain;
  ref: string;
}

/** Sessão de ajuste do app com o Claude: ela descreve o que mudar numa tela; ao finalizar, uma sessão do Claude Code faz a mudança e publica. */
export interface DevMessage { from: 'ela' | 'claude'; text: string; at: number; images?: string[] }
export interface DevRequest extends Base {
  kind: 'devreq';
  date: DateKey;
  /** aberta: ela está escrevendo; finalizada: na fila; em_andamento: o Claude está mexendo; feito: publicado; precisa_voce: o Claude perguntou algo; falhou: não deu certo. */
  status: 'aberta' | 'finalizada' | 'em_andamento' | 'feito' | 'precisa_voce' | 'falhou';
  route: string;
  screen: string;
  /** Texto visível da tela quando a sessão começou, para o Claude saber exatamente do que ela fala. */
  snapshot?: string;
  messages: DevMessage[];
  finishedAt?: number;
  /** Link da sessão do Claude Code que está cuidando do ajuste. */
  claudeUrl?: string;
  summary?: string;
}

/** O que entra num dia específico fora do plano semanal: o pedal montado com a treinadora no lugar da yoga,
 *  o produto que a dermatologista pôs na noite de hoje, a refeição que a nutricionista trocou no almoço. */
export interface PlanExtra extends Base {
  kind: 'extra';
  date: DateKey;
  /** Sem domínio nos registros antigos: eram todos de treino. */
  domain?: 'training' | 'skin' | 'food';
  /** Treino: id do wtemplate. Pele: "am:<produto>" ou "pm:<produto>". Alimentação: "<refeição>:<mtemplate>". */
  ref: string;
  by?: 'treinadora' | 'dermato' | 'nutri';
}

export interface DayBrief extends Base {
  kind: 'brief';
  date: DateKey;
  foco?: string;
  pele?: string;
  treino?: string;
  tarefas: { id: string; motivo: string; primeiro_passo: string }[];
}

/** Sono: hora de acordar, horas desejadas, minutos para adormecer; alarme e lembrete de deitar. */
export interface SleepPlan {
  wake: string; weekendWake?: string; hours: number; latency: number; alarm: boolean; bed: boolean;
  /** Meta de deitar em etapas: a de agora (bedGoal) e aonde ela quer chegar (bedFinal). Com bedGoal, ela manda no horário de deitar. */
  bedGoal?: string; bedFinal?: string;
}
export interface Reminders {
  enabled: boolean; meals: boolean; skin: boolean; classes: boolean; water: boolean;
  morning?: string; evening?: string;
  sleep?: SleepPlan;
  /** Lembrete das tomadas de remédios e vitaminas (padrão: ligado). */
  meds?: boolean;
  custom: { id: string; label: string; time: string; days: number[]; note?: string }[];
}
export interface Wellness extends Base {
  kind: 'wellness'; date: DateKey; source?: string;
  steps?: number; sleepH?: number; sleepScore?: number; restingHR?: number; hrv?: number; weight?: number; ctl?: number; atl?: number; readiness?: number;
  bodyBattery?: number; stress?: number; sleepStart?: string; sleepEnd?: string; // HH:MM
  /** 'confirmado': ela disse que dormiu pouco mesmo; 'incompleto': o relógio saiu ou ficou sem bateria. */
  sleepFlag?: 'confirmado' | 'incompleto';
  /** Horas estimadas por ela quando dormiu sem relógio ou o registro saiu incompleto. Prevalece sobre o do relógio. */
  sleepManualH?: number;
  /** Deitar e acordar confirmados por ela no ritual da manhã (o relógio só manda a duração). */
  timesConfirmed?: boolean;
}
export interface Journal extends Base {
  kind: 'journal'; date: DateKey;
  energy?: number; mood?: number; sleep?: number; stress?: number; // 1 a 5
  tags: string[];
  text?: string;
  gratitude?: string;
}
export interface Note extends Base {
  kind: 'note'; date: DateKey; title?: string; text: string; tags: string[]; pinned?: boolean;
}
export type BookStatus = 'quero_ler' | 'lendo' | 'lido' | 'abandonado';
export interface Book extends Base {
  kind: 'book'; title: string; authors: string[]; cover?: string; pages?: number; googleId?: string; isbn?: string;
  status: BookStatus; startedAt?: DateKey; finishedAt?: DateKey; rating?: number; currentPage?: number;
  quotes: { id: string; text: string; page?: number }[]; review?: string;
  /** Quando ela respondeu "continuo lendo" ao aviso de livro parado: o aviso volta só depois de 3 semanas. */
  keptAt?: DateKey;
}
export interface ReadLog extends Base { kind: 'readlog'; date: DateKey; bookId: string; pages: number; toPage?: number }
export interface Review extends Base {
  kind: 'review'; date: DateKey; scope: 'semana' | 'cruzada'; text: string; highlights: string[]; focus: string[];
  /** Leitura cruzada: título, o que pesou e os ajustes da próxima semana, cada um com a área que cuida dele. */
  title?: string; weighed?: string[]; next?: { area: 'treino' | 'alimentacao' | 'mente' | 'cuidados' | 'sono'; acao: string; por_que?: string }[];
  /** Quando ela marcou a leitura como concluída (YYYY-MM-DD): o convite some do Hoje. */
  doneAt?: DateKey;
}

/* ---------- Mente: o que ela toma, check-ins de humor, café e mudanças feitas pelo médico ---------- */
export type IntakeType = 'medicamento' | 'vitamina' | 'suplemento';
export interface Intake extends Base {
  kind: 'intake';
  name: string;
  /** Como aparece para a IA, quando ela prefere não mandar o nome. */
  alias?: string;
  type: IntakeType;
  dose?: string;
  times: string[]; // HH:MM
  /** Semanal (ex.: injeção uma vez por semana): só nos dias em 'days' (1 = segunda ... 7 = domingo). Sem isto, todo dia. */
  freq?: 'diaria' | 'semanal' | 'intervalo';
  days?: number[];
  /** A cada N dias (ex.: injeção a cada 10 dias), contando a partir de uma aplicação conhecida. */
  everyDays?: number;
  startDate?: DateKey;
  /** Regra que o médico passou: em jejum, com comida, longe de outro item. */
  rule?: string;
  stock?: number; // unidades em casa
  perDose?: number; // unidades por tomada (padrão 1)
  /** Marcado por ela, conforme orientação do médico: mudanças bruscas de café merecem atenção. */
  caffeineSensitive?: boolean;
  /** A dermatologista e a nutricionista também enxergam (vitaminas e suplementos já enxergam). */
  shareCare?: boolean;
  image?: string;
  note?: string;
  active: boolean;
  order: number;
}
export interface IntakeLog extends Base {
  kind: 'intakelog';
  date: DateKey;
  itemId: string;
  slot: string; // horário previsto HH:MM
  status: 'tomei' | 'pulei';
  takenAt?: string; // HH:MM
  sideEffect?: string;
}
export type WakeFeeling = 'descansada' | 'ok' | 'cansada' | 'acelerada';
export interface MoodCheckin extends Base {
  kind: 'mood';
  date: DateKey;
  period: 'am' | 'pm';
  mood?: number; // -3 (depressão) a +3 (euforia)
  energy?: number; irritability?: number; anxiety?: number; racing?: number; // 0 a 4
  wake?: WakeFeeling;
  tags: string[];
  note?: string; // fica no app; não vai para a IA
}
export interface Caffeine extends Base { kind: 'caffeine'; date: DateKey; time: string; label: string; mg: number }
export interface MedChange extends Base { kind: 'medchange'; date: DateKey; itemId?: string; text: string }

/** Conversas com as especialistas (aberta e encerradas), guardadas na conta para seguirem entre aparelhos. */
export interface ChatStore extends Base { kind: 'chatstore'; key: string; value: unknown }

/** O que ela respondeu nos rituais. A manhã vale para o dia; a noite, para o dia seguinte (a IA lê os dois). */
export interface RitualDay extends Base {
  kind: 'ritual';
  date: DateKey;
  period: 'am' | 'pm';
  basics?: { banho?: boolean; cafe?: boolean };
  q?: string; a?: string;
  focus?: string[]; // tarefas que ela escolheu para o dia
  trained?: 'sim' | 'nao' | 'outro';
  postIdea?: string;
  ai?: { frase?: string; foco?: string; atencao?: string; fechamento?: string; para_amanha?: string; at?: number; offline?: boolean; /** treinos que a leitura considerou (agendaSig) */ agenda?: string };
  seen: string[];
}
/** Base da carreira: quem ela é profissionalmente, a marca e o trabalho atual. Lida pela especialista de carreira. */
export interface CareerBase extends Base {
  kind: 'careerbase';
  workName?: string; // nome da empresa atual, rótulo da aba de trabalho
  workCategoryId?: string; // categoria de tarefas do trabalho
  role?: string; posicionamento?: string; publico?: string; pilares?: string; tom?: string; evitar?: string; bio?: string; assinatura?: string; objetivo?: string;
}
/** Conquista registrada (o que entregou e o impacto). */
export interface Win extends Base { kind: 'win'; date: DateKey; title: string; impact?: string; where?: 'trabalho' | 'fora' }
/** Oportunidade: processo seletivo, conversa, contato de rede ou parceria. */
export interface Opp extends Base { kind: 'opp'; title: string; org?: string; type: 'vaga' | 'contato' | 'parceria' | 'convite'; stage: 'mapeada' | 'conversa' | 'processo' | 'proposta' | 'encerrada'; next?: string; nextDate?: DateKey; note?: string }
/** Desenvolvimento: metas do ano, cursos, leituras, eventos e competências. */
export interface DevItem extends Base { kind: 'devitem'; title: string; type: 'meta' | 'curso' | 'leitura' | 'evento' | 'competencia'; status: 'quero' | 'fazendo' | 'feito'; due?: DateKey; note?: string }
/** Curadoria semanal do Desenvolvimento: uma notícia, um artigo e um livro, buscados na web pela especialista. */
export interface PickLink { titulo: string; fonte?: string; data?: string; url: string; resumo?: string; porque?: string; verificado?: boolean }
export interface PickBook { titulo: string; autor?: string; ano?: string; sinopse?: string; porque?: string; cover?: string; isbn?: string; pages?: number; googleId?: string; authors?: string[] }
export interface DevPick extends Base { kind: 'devpick'; week: DateKey; noticia?: PickLink; artigo?: PickLink; livro?: PickBook }
/** Pautas do LinkedIn (marca pessoal). */
export interface PostMetrics {
  impressoes?: number | null; reacoes?: number | null; comentarios?: number | null; compartilhamentos?: number | null;
  usuarios_alcancados?: number | null; impressoes_na_rede_pct?: number | null; impressoes_fora_da_rede_pct?: number | null;
  visualizacoes_do_perfil?: number | null; seguidores_obtidos?: number | null;
  demografia_principal?: Record<string, { valor: string; pct: number }>;
}
export interface Post extends Base {
  kind: 'post'; title: string; note?: string; status: 'ideia' | 'rascunho' | 'agendado' | 'publicado'; date?: DateKey;
  /** Texto completo do post, como saiu ou vai sair. */
  text?: string; pilar?: string;
  /** Imagens do post (JPEG em data URL, leves); carrossel tem várias. */
  images?: string[]; imageNote?: string;
  metrics?: PostMetrics;
}

export type AnyRecord =
  | ChatStore | RitualDay | Post | CareerBase | DevPick | Win | Opp | DevItem | Intake | IntakeLog | MoodCheckin | Caffeine | MedChange
  | Settings | Category | Task | SuggestionLog | Habit | HabitLog | Goal | GoalEntry
  | Product | SkinLog | Photo | Food | MealTemplate | Meal | Water
  | Modality | WorkoutTemplate | Workout | Plan | Skip | DayBrief
  | Wellness | Journal | Note | Book | ReadLog | Review;

export type KindMap = {
  settings: Settings; category: Category; task: Task; suggestion: SuggestionLog;
  habit: Habit; hlog: HabitLog; goal: Goal; gentry: GoalEntry;
  product: Product; skin: SkinLog; photo: Photo;
  food: Food; mtemplate: MealTemplate; meal: Meal; water: Water;
  modality: Modality; wtemplate: WorkoutTemplate; workout: Workout;
  plan: Plan; skip: Skip; extra: PlanExtra; brief: DayBrief; devreq: DevRequest;
  wellness: Wellness; journal: Journal; note: Note; book: Book; readlog: ReadLog; review: Review; healthdoc: HealthDoc; cycle: CycleDay;
  intake: Intake; intakelog: IntakeLog; mood: MoodCheckin; caffeine: Caffeine; medchange: MedChange; chatstore: ChatStore; ritual: RitualDay; post: Post; careerbase: CareerBase; win: Win; opp: Opp; devitem: DevItem; devpick: DevPick;
};

/** Perfil e objetivos. Tudo opcional: a IA usa o que houver e diz o que falta. */
export interface Profile {
  sex?: 'F' | 'M';
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPct?: number;
  goal?: 'perder_gordura' | 'recomposicao' | 'ganhar_massa' | 'performance' | 'manter';
  pace?: 'leve' | 'moderado';
  event?: string; // prova alvo e data, texto livre
  activity?: 'sedentario' | 'leve' | 'moderado' | 'alto' | 'muito_alto'; // fora o treino
  diet?: { restrictions: string[]; dislikes?: string; likes?: string; mealsPerDay?: number; followsNutritionist?: boolean };
  training?: { daysAvailable?: number[]; minutesPerSession?: number; equipment?: string; limitations?: string; followsCoach?: boolean; strengthSplit?: 'full_body' | 'dividido'; strengthGoal?: 'hipertrofia' | 'forca' | 'manutencao' };
  /** Peso objetivo: o acompanhamento usa as pesagens (Garmin, intervals ou registradas no app). */
  weightGoal?: { startKg?: number; startDate?: DateKey; targetKg?: number; deadline?: DateKey };
  skin?: { type?: string; concerns: string[]; sensitive?: boolean; followsDerm?: boolean; prescriptions?: string };
  /** Avaliação do cabelo: base para a IA diagnosticar e indicar o uso dos produtos. */
  hair?: {
    type?: string; thickness?: string; density?: string; porosity?: string; length?: string;
    scalp?: string; oilyAfter?: string; concerns?: string[]; chemical?: string[]; lastChemical?: string;
    heat?: string; washesPerWeek?: number; washTime?: string; water?: string; schedule?: string;
    followsTricho?: boolean; treatments?: string; notes?: string;
  };
  /** Avaliação da pele do corpo. */
  body?: {
    skinType?: string; showerTime?: string; showerTemp?: string; concerns?: string[]; areas?: string[];
    hairRemoval?: string; sun?: string; fragranceSensitive?: boolean; notes?: string;
  };
  cycle?: { hormonalContraception?: boolean; typicalLength?: number; typicalPeriod?: number; tracks?: boolean };
  health?: { professionals: string[]; meds: { id: string; name: string; dose?: string; schedule?: string }[]; notes?: string };
  updatedAt?: number;
}

/** Exame, bioimpedância ou outro documento de saúde. O arquivo fica no armazenamento privado; a IA guarda um resumo. */
export interface HealthDoc extends Base {
  kind: 'healthdoc';
  date: DateKey; // data do exame
  title: string;
  docType: 'bioimpedancia' | 'exame_sangue' | 'laudo' | 'prescricao' | 'outro';
  storagePath?: string;
  mime?: string;
  fileName?: string;
  summary?: string;
  values?: { name: string; value: string; unit?: string; flag?: 'baixo' | 'alto' | 'normal' }[];
  forPlanning?: string; // o que importa para nutrição, treino e pele
  reading?: boolean;
  readError?: string;
}

/** Um dia do ciclo menstrual: sangramento e sintomas. */
export type Flow = 'spotting' | 'leve' | 'medio' | 'intenso';
export interface CycleDay extends Base {
  kind: 'cycle';
  date: DateKey;
  flow?: Flow;
  symptoms: string[];
  note?: string;
}
