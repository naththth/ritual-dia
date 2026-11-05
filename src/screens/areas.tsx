// Cada área reúne o dia, o plano e os cadastros dela: Treino, Cuidados e Alimentação. Sem pular entre pastas.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { aiAvailable } from '../domain/ai';
import { toast } from '../state/store';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, ListOrdered, Moon, Sunrise, ShoppingBag, Check } from 'lucide-react';
import { TopBar } from './common';
import { useAll, useByDate, useRecord } from '../db/hooks';
import { planFor, plannedSkin } from '../domain/rules';
import { update } from '../db/db';
import { ProductThumb } from '../ui/ProductThumb';
import { useApp } from '../state/store';
import { shortLabel, todayKey } from '../lib/dates';
import { SkinPlan, TrainingPlan, FoodPlan } from './PlanScreen';
import { Products, Foods, MealTemplates, Modalities, WorkoutTemplates, Habits, Goals } from './library/LibraryScreen';
import { SpecialistCard } from './specialist';
import { SpecialistButton } from './specchat';

export const AREAS = {
  treino: { title: 'Treino', tabs: [{ to: '/treino', label: 'Semana' }, { to: '/treino/plano', label: 'Plano' }, { to: '/treino/sessoes', label: 'Sessões' }] },
  cuidados: { title: 'Cuidados', tabs: [{ to: '/cuidados', label: 'Hoje' }, { to: '/cuidados/rotina', label: 'Rotina' }, { to: '/cuidados/produtos', label: 'Produtos' }] },
  alimentacao: { title: 'Alimentação', tabs: [{ to: '/alimentacao', label: 'Hoje' }, { to: '/alimentacao/plano', label: 'Plano' }, { to: '/alimentacao/alimentos', label: 'Alimentos' }, { to: '/alimentacao/refeicoes', label: 'Refeições' }] },
  carreira: { title: 'Carreira', tabs: [{ to: '/carreira', label: 'Trabalho' }, { to: '/carreira/marca', label: 'Marca' }, { to: '/carreira/conquistas', label: 'Conquistas' }, { to: '/carreira/oportunidades', label: 'Oportunidades' }, { to: '/carreira/crescer', label: 'Desenvolvimento' }] },
  mente: { title: 'Mente', tabs: [{ to: '/mente', label: 'Hoje' }, { to: '/mente/tomo', label: 'Remédios' }, { to: '/mente/painel', label: 'Painel' }, { to: '/mente/ajustes', label: 'Ajustes' }] }
} as const;
export type AreaId = keyof typeof AREAS;
export const AREA_ROUTES = Object.values(AREAS).flatMap((a) => a.tabs.map((t) => t.to));

/** Abas da área, logo abaixo do título. */
export function AreaNav({ area }: { area: AreaId }) {
  const nav = useNavigate();
  const loc = useLocation();
  const tabs = AREAS[area].tabs;
  const base = useRecord<'careerbase'>('careerbase');
  const label = (t: { to: string; label: string }) => (t.to === '/carreira' && base?.workName ? base.workName : t.label);
  const box = useRef<HTMLDivElement>(null);
  // A aba aberta fica sempre à vista, mesmo quando está no fim da faixa.
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && box.current) box.current.scrollLeft = Math.max(0, el.offsetLeft - (box.current.clientWidth - el.offsetWidth) / 2);
  }, [loc.pathname]);
  return (
    <div ref={box} className="seg-tabs area-nav" role="tablist" aria-label={`Seções de ${AREAS[area].title}`} data-testid={`area-nav-${area}`}>
      {tabs.map((t) => (
        <button key={t.to} role="tab" aria-selected={loc.pathname === t.to} className={loc.pathname === t.to ? 'on' : ''} onClick={() => nav(t.to, { replace: true })}>{label(t)}</button>
      ))}
    </div>
  );
}

/** Quem atende em cada área: a treinadora fica na aba Semana do Treino; as outras, em todas as abas da área. */
const SPEC: Partial<Record<AreaId, 'skin' | 'food' | 'mind' | 'career'>> = { cuidados: 'skin', alimentacao: 'food', mente: 'mind', carreira: 'career' };

export function AreaPage({ area, children, testId }: { area: AreaId; children: ReactNode; testId: string }) {
  const spec = SPEC[area];
  return (
    <div className="screen" data-testid={testId}>
      <TopBar />
      <div className="row between" style={{ alignItems: 'center' }}>
        <h1 className="page-title">{AREAS[area].title}</h1>
        {spec && <SpecialistButton domain={spec} />}
      </div>
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
  const products = useAll('product');
  const plans = useAll('plan');
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const plan = planFor(plans ?? [], 'skin', date);
  const restock = (products ?? []).filter((p) => p.status === 'acabou' || p.status === 'quero_comprar').sort((a, b) => Number(a.status === 'quero_comprar') - Number(b.status === 'quero_comprar') || a.brand.localeCompare(b.brand));
  const card = (p: 'am' | 'pm') => {
    const log = logs?.find((l) => l.period === p);
    const n = log?.productIds.length ?? 0;
    const planned = products ? plannedSkin(plan, date, p, products, false, { skips: skips ?? [], extras: extras ?? [] }).length : 0;
    const status = log ? (log.skipped ? 'Pulada' : `Feita · ${n} ${n === 1 ? 'produto' : 'produtos'}`) : planned ? `${planned} ${planned === 1 ? 'produto' : 'produtos'} no plano` : 'Ainda não registrada';
    return (
      <button key={p} className={`care-card ${p === 'am' ? 'cc-am' : 'cc-pm'} ${log && !log.skipped ? 'done' : ''}`} onClick={() => nav(`/pele?p=${p}`)} data-testid={`care-${p}`}>
        <span className="cc-ic">{p === 'am' ? <Sunrise size={22} /> : <Moon size={22} />}</span>
        <span className="cc-t">{p === 'am' ? 'Rotina da manhã' : 'Rotina da noite'}</span>
        <span className="cc-s">{status}</span>
        <span className="cc-go">{log ? 'Ver ou corrigir' : 'Começar'}<ChevronRight size={16} /></span>
      </button>
    );
  };
  return (
    <AreaPage area="cuidados" testId="area-cuidados">
      <p className="small muted" style={{ margin: '0 0 10px' }}>{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</p>
      <div className="care-cards">{card('am')}{card('pm')}</div>
      <button className="lib-item" onClick={() => nav('/cuidados/rotina')}>
        <span className="lib-icon" style={{ background: 'var(--rose)' }}><ListOrdered size={20} /></span>
        <span className="grow"><b>Rotina da semana</b><br /><span className="small muted">O que entra em cada dia, na ordem de aplicação</span></span>
        <ChevronRight size={18} />
      </button>
      {restock.length > 0 && (
        <section className="restock" data-testid="restock">
          <div className="row between"><h2 className="sec-h" style={{ margin: 0 }}><ShoppingBag size={18} />Para repor</h2><span className="small muted">{restock.length}</span></div>
          {restock.slice(0, 8).map((p) => (
            <div key={p.id} className="rs-row">
              <ProductThumb p={p} size={40} />
              <span className="grow"><span className="tiny muted">{p.brand}</span><br /><span className="small" style={{ fontWeight: 650 }}>{p.name}</span><br /><span className="tiny muted">{p.status === 'acabou' ? 'Acabou' : 'Quero comprar'}</span></span>
              <button className="pill-act pa-ghost" onClick={() => update<'product'>(p.id, { status: 'em_uso' }).then(() => toast(`${p.name} de volta em uso`))} aria-label={`Comprei ${p.name}`}><Check size={15} />Comprei</button>
            </div>
          ))}
          {restock.length > 8 && <button className="link" onClick={() => nav('/cuidados/produtos')}>Ver todos os {restock.length}</button>}
        </section>
      )}
    </AreaPage>
  );
}
export const CarePlanPage = () => <AreaPage area="cuidados" testId="area-cuidados-rotina"><SpecialistCard domain="skin" /><OrganizeButton /><SkinPlan embedded /></AreaPage>;

/** Pede à dermatologista a ordem de aplicação e o modo de uso de todos os produtos que ela tem. */
function OrganizeButton() {
  const [busy, setBusy] = useState(false);
  if (!aiAvailable()) return null;
  const run = async () => {
    setBusy(true);
    try { const { organizeProducts } = await import('../domain/skinLayers'); const n = await organizeProducts(); toast(n ? `Ordem e modo de uso de ${n} produtos atualizados` : 'Nada mudou'); }
    catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  return <button className="btn btn-soft btn-block" style={{ margin: '0 0 10px' }} onClick={run} disabled={busy} data-testid="organize-layers"><ListOrdered size={18} />{busy ? 'Organizando… leva cerca de 1 minuto' : 'Reorganizar ordem de aplicação e modo de uso'}</button>;
}
export const CareProductsPage = () => <AreaPage area="cuidados" testId="area-cuidados-produtos"><Products /></AreaPage>;

/* ---------- Hábitos e metas ---------- */
export function HabitsGoalsPage() {
  return (
    <div className="screen" data-testid="habits-goals">
      <TopBar />
      <h1 className="page-title">Hábitos e metas</h1>
      <h2 className="section-title" style={{ marginTop: 18 }}>Hábitos</h2>
      <Habits />
      <h2 className="section-title" style={{ marginTop: 24 }}>Metas</h2>
      <Goals />
    </div>
  );
}
