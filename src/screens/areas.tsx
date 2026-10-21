// Cada área reúne o dia, o plano e os cadastros dela: Treino, Cuidados e Alimentação. Sem pular entre pastas.
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Moon, Sunrise } from 'lucide-react';
import { TopBar } from './common';
import { useByDate } from '../db/hooks';
import { useApp } from '../state/store';
import { shortLabel, todayKey } from '../lib/dates';
import { SkinPlan, TrainingPlan, FoodPlan } from './PlanScreen';
import { Products, Foods, MealTemplates, Modalities, WorkoutTemplates, Habits, Goals } from './library/LibraryScreen';
import { SpecialistCard } from './specialist';

export const AREAS = {
  treino: { title: 'Treino', tabs: [{ to: '/treino', label: 'Semana' }, { to: '/treino/plano', label: 'Plano' }, { to: '/treino/sessoes', label: 'Sessões' }] },
  cuidados: { title: 'Cuidados', tabs: [{ to: '/cuidados', label: 'Hoje' }, { to: '/cuidados/rotina', label: 'Rotina' }, { to: '/cuidados/produtos', label: 'Produtos' }] },
  alimentacao: { title: 'Alimentação', tabs: [{ to: '/alimentacao', label: 'Hoje' }, { to: '/alimentacao/plano', label: 'Plano' }, { to: '/alimentacao/alimentos', label: 'Alimentos' }, { to: '/alimentacao/refeicoes', label: 'Refeições' }] }
} as const;
export type AreaId = keyof typeof AREAS;
export const AREA_ROUTES = Object.values(AREAS).flatMap((a) => a.tabs.map((t) => t.to));

/** Abas da área, logo abaixo do título. */
export function AreaNav({ area }: { area: AreaId }) {
  const nav = useNavigate();
  const loc = useLocation();
  const tabs = AREAS[area].tabs;
  return (
    <div className="seg-tabs area-nav" role="tablist" aria-label={`Seções de ${AREAS[area].title}`} data-testid={`area-nav-${area}`}>
      {tabs.map((t) => (
        <button key={t.to} role="tab" aria-selected={loc.pathname === t.to} className={loc.pathname === t.to ? 'on' : ''} onClick={() => nav(t.to, { replace: true })}>{t.label}</button>
      ))}
    </div>
  );
}

function AreaPage({ area, children, testId }: { area: AreaId; children: ReactNode; testId: string }) {
  return (
    <div className="screen" data-testid={testId}>
      <TopBar />
      <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 10px' }}>{AREAS[area].title}</h1>
      <AreaNav area={area} />
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

/* ---------- Treino ---------- */
export const TrainingPlanPage = () => <AreaPage area="treino" testId="area-treino-plano"><SpecialistCard domain="training" /><TrainingPlan embedded /></AreaPage>;
export const TrainingSessionsPage = () => (
  <AreaPage area="treino" testId="area-treino-sessoes">
    <WorkoutTemplates />
    <h2 className="section-title" style={{ marginTop: 24 }}>Modalidades</h2>
    <Modalities />
  </AreaPage>
);

/* ---------- Alimentação ---------- */
export const FoodPlanPage = () => <AreaPage area="alimentacao" testId="area-alimentacao-plano"><SpecialistCard domain="food" /><FoodPlan embedded /></AreaPage>;
export const FoodsPage = () => <AreaPage area="alimentacao" testId="area-alimentacao-alimentos"><Foods /></AreaPage>;
export const MealsPage = () => <AreaPage area="alimentacao" testId="area-alimentacao-refeicoes"><MealTemplates /></AreaPage>;

/* ---------- Cuidados ---------- */
export function CareTodayPage() {
  const nav = useNavigate();
  const date = useApp((s) => s.date);
  const logs = useByDate('skin', date);
  const row = (p: 'am' | 'pm') => {
    const log = logs?.find((l) => l.period === p);
    return (
      <button key={p} className="lib-item" onClick={() => nav(`/pele?p=${p}`)} data-testid={`care-${p}`}>
        <span className="lib-icon" style={{ background: 'var(--rose)' }}>{p === 'am' ? <Sunrise size={20} /> : <Moon size={20} />}</span>
        <span className="grow"><span style={{ fontWeight: 700 }}>{p === 'am' ? 'Rotina da manhã' : 'Rotina da noite'}</span><br />
          <span className="small muted">{log ? (log.skipped ? 'Pulada' : `Feita · ${log.productIds.length} ${log.productIds.length === 1 ? 'produto' : 'produtos'}`) : 'Ainda não registrada'}</span></span>
        <ChevronRight size={18} />
      </button>
    );
  };
  return (
    <AreaPage area="cuidados" testId="area-cuidados">
      <p className="small" style={{ margin: '0 0 8px' }}>{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</p>
      {row('am')}{row('pm')}
    </AreaPage>
  );
}
export const CarePlanPage = () => <AreaPage area="cuidados" testId="area-cuidados-rotina"><SpecialistCard domain="skin" /><SkinPlan embedded /></AreaPage>;
export const CareProductsPage = () => <AreaPage area="cuidados" testId="area-cuidados-produtos"><Products /></AreaPage>;

/* ---------- Hábitos e metas ---------- */
export function HabitsGoalsPage() {
  return (
    <div className="screen" data-testid="habits-goals">
      <TopBar />
      <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 10px' }}>Hábitos e metas</h1>
      <h2 className="section-title">Hábitos</h2>
      <Habits />
      <h2 className="section-title" style={{ marginTop: 24 }}>Metas</h2>
      <Goals />
    </div>
  );
}
