import { useEffect, useState, useRef } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Dumbbell, Menu, Plus, Sparkles, Sun, Utensils } from 'lucide-react';
import { ensureDefaults } from './domain/defaults';
import { initSync } from './sync/sync';
import { useSettings } from './db/hooks';
import { Toasts } from './ui/ui';
import { DayScreen } from './screens/DayScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ListsScreen } from './screens/ListsScreen';
import { EvolutionScreen } from './screens/EvolutionScreen';
import { TrainingTab } from './screens/TrainingTab';
import { FoodTab } from './screens/FoodTab';
import { MoreScreen } from './screens/MoreScreen';
import { JournalScreen, NotesScreen } from './screens/JournalScreen';
import { ReadingScreen } from './screens/ReadingScreen';
import { SkinScreen } from './screens/SkinScreen';
import { FoodScreen } from './screens/FoodScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CycleScreen } from './screens/cycle';
import { WeightScreen } from './screens/WeightScreen';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { AREA_ROUTES, TrainingPlanPage, TrainingSessionsPage, FoodPlanPage, FoodsPage, MealsPage, CareTodayPage, CarePlanPage, CareProductsPage, HabitsGoalsPage } from './screens/areas';
import { Onboarding } from './screens/Onboarding';
import { ProductReview } from './screens/ProductReview';
import { RegisterSheet } from './screens/RegisterSheet';
import { DevAssist } from './screens/devassist';
import { registerSW } from 'virtual:pwa-register';
import { toast } from './state/store';

export function App() {
  const [booted, setBooted] = useState(false);
  const bootedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
      try { await ensureDefaults(); } catch (e) { console.error(e); }
      import('./domain/classes').then((m) => m.reconcileClasses()).catch(() => undefined);
      // O app abre com o que está no aparelho; a sincronização corre por trás e nunca segura a abertura.
      bootedRef.current = true;
      setBooted(true);
      initSync().catch((e) => console.error(e));
    })();
    const update = registerSW({
      // Se a versão nova chegar enquanto o app ainda abre, troca na hora; depois de aberto, pergunta.
      onNeedRefresh() { if (!bootedRef.current) update(true); else toast('Versão nova do Ritual pronta', () => update(true), 'default', { label: 'Atualizar', sticky: true }); }
    });
  }, []);
  if (!booted) return <div className="app" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}><span className="wordmark">Ritual</span></div>;
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const settings = useSettings();
  const loc = useLocation();
  const [reg, setReg] = useState(false);
  if (!settings) return null;
  const inOnboarding = !settings.onboarded || loc.pathname.startsWith('/boas-vindas');
  if (inOnboarding && !loc.pathname.startsWith('/revisao')) {
    return (<div className="app"><Onboarding /><Toasts /></div>);
  }
  const mainTabs = ['/', ...AREA_ROUTES, '/mais', '/calendario', '/listas', '/evolucao', '/habitos'];
  const showNav = mainTabs.includes(loc.pathname);
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<DayScreen />} />
        <Route path="/calendario" element={<CalendarScreen />} />
        <Route path="/listas" element={<ListsScreen />} />
        <Route path="/evolucao" element={<EvolutionScreen />} />
        <Route path="/pele" element={<SkinScreen />} />
        <Route path="/alimentacao" element={<FoodTab />} />
        <Route path="/alimentacao/refeicao" element={<FoodScreen />} />
        <Route path="/treino" element={<TrainingTab />} />
        <Route path="/treino/registrar" element={<TrainingScreen />} />
        <Route path="/treino/plano" element={<TrainingPlanPage />} />
        <Route path="/treino/sessoes" element={<TrainingSessionsPage />} />
        <Route path="/alimentacao/plano" element={<FoodPlanPage />} />
        <Route path="/alimentacao/alimentos" element={<FoodsPage />} />
        <Route path="/alimentacao/refeicoes" element={<MealsPage />} />
        <Route path="/cuidados" element={<CareTodayPage />} />
        <Route path="/cuidados/rotina" element={<CarePlanPage />} />
        <Route path="/cuidados/produtos" element={<CareProductsPage />} />
        <Route path="/habitos" element={<HabitsGoalsPage />} />
        <Route path="/mais" element={<MoreScreen />} />
        <Route path="/diario" element={<JournalScreen />} />
        <Route path="/notas" element={<NotesScreen />} />
        <Route path="/leitura" element={<ReadingScreen />} />
        <Route path="/ajustes" element={<SettingsScreen />} />
        <Route path="/perfil" element={<ProfileScreen />} />
        <Route path="/ciclo" element={<CycleScreen />} />
        <Route path="/peso" element={<WeightScreen />} />
        <Route path="/biblioteca/:section" element={<LibraryScreen />} />
        <Route path="/plano/:domain" element={<PlanScreen />} />
        <Route path="/revisao" element={<ProductReview />} />
        <Route path="*" element={<DayScreen />} />
      </Routes>
      {showNav && (
        <nav className="bottomnav" aria-label="Navegação principal">
          <NavLink to="/" end><Sun size={22} />Hoje</NavLink>
          <NavLink to="/treino" className={() => (loc.pathname.startsWith('/treino') ? 'active' : '')}><Dumbbell size={22} />Treino</NavLink>
          <NavLink to="/cuidados" className={() => (loc.pathname.startsWith('/cuidados') ? 'active' : '')}><Sparkles size={22} />Cuidados</NavLink>
          <NavLink to="/alimentacao" className={() => (loc.pathname.startsWith('/alimentacao') ? 'active' : '')}><Utensils size={22} />Alimentação</NavLink>
          <NavLink to="/mais" className={() => (['/mais', '/calendario', '/listas', '/evolucao', '/habitos'].includes(loc.pathname) ? 'active' : '')}><Menu size={22} />Mais</NavLink>
        </nav>
      )}
      {loc.pathname === '/' && <button className="fab fab-float" aria-label="Registrar" onClick={() => setReg(true)} data-testid="fab"><Plus size={28} strokeWidth={2.4} /></button>}
      <RegisterSheet open={reg} onClose={() => setReg(false)} />
      <DevAssist />
      <Toasts />
    </div>
  );
}
