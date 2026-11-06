import { Drawer } from './screens/drawer';
import { CareerWorkPage, CareerBrandPage, CareerGrowPage } from './screens/career';
import { useEffect, useState, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './state/store';
import { AddButton } from './screens/common';
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
import { NotesScreen } from './screens/JournalScreen';
import { ReadingScreen } from './screens/ReadingScreen';
import { SkinScreen } from './screens/SkinScreen';
import { FoodScreen } from './screens/FoodScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CycleScreen } from './screens/cycle';
import { WeightScreen } from './screens/WeightScreen';
import { IndicatorsScreen } from './screens/IndicatorsScreen';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { TrainingPlanPage, TrainingSessionsPage, FoodPlanPage, FoodsPage, MealsPage, CareTodayPage, CarePlanPage, CareProductsPage, HabitsGoalsPage } from './screens/areas';
import { Onboarding } from './screens/Onboarding';
import { ProductReview } from './screens/ProductReview';
import { RegisterSheet } from './screens/RegisterSheet';
import { RitualScreen } from './screens/ritual';
import { WeekScreen } from './screens/week';
import { CheckinScreen, IntakeScreen, MindPanelPage, MindScreen, MindSettingsPage, ReportScreen } from './screens/mind';
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
  const menu = useApp((st) => st.menu);
  const setMenu = useApp((st) => st.setMenu);
  const reg = useApp((st) => st.reg);
  const setReg = useApp((st) => st.setReg);
  // Deslizar a partir da borda esquerda abre o menu.
  useEffect(() => {
    let x0 = -1, y0 = 0;
    const start = (e: TouchEvent) => { const t = e.touches[0]; x0 = t.clientX < 22 ? t.clientX : -1; y0 = t.clientY; };
    const move = (e: TouchEvent) => { if (x0 < 0) return; const t = e.touches[0]; if (t.clientX - x0 > 60 && Math.abs(t.clientY - y0) < 50) { x0 = -1; useApp.getState().setMenu(true); } };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); };
  }, []);
  if (!settings) return null;
  const inOnboarding = !settings.onboarded || loc.pathname.startsWith('/boas-vindas');
  if (inOnboarding && !loc.pathname.startsWith('/revisao')) {
    return (<div className="app"><Onboarding /><Toasts /></div>);
  }
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
        <Route path="/ritual/:p" element={<RitualScreen />} />
        <Route path="/semana" element={<WeekScreen />} />
        <Route path="/mente" element={<MindScreen />} />
        <Route path="/mente/checkin" element={<CheckinScreen />} />
        <Route path="/mente/tomo" element={<IntakeScreen />} />
        <Route path="/mente/relatorio" element={<ReportScreen />} />
        <Route path="/mente/painel" element={<MindPanelPage />} />
        <Route path="/mente/ajustes" element={<MindSettingsPage />} />
        <Route path="/mais" element={<MoreScreen />} />
        <Route path="/diario" element={<Navigate to="/mente/painel" replace />} />
        <Route path="/notas" element={<NotesScreen />} />
        <Route path="/leitura" element={<ReadingScreen />} />
        <Route path="/ajustes" element={<SettingsScreen />} />
        <Route path="/perfil" element={<ProfileScreen />} />
        <Route path="/ciclo" element={<CycleScreen />} />
        <Route path="/peso" element={<WeightScreen />} />
        <Route path="/indicadores" element={<IndicatorsScreen />} />
        <Route path="/marca" element={<Navigate to="/carreira/marca" replace />} />
        <Route path="/carreira" element={<CareerWorkPage />} />
        <Route path="/carreira/marca" element={<CareerBrandPage />} />
        <Route path="/carreira/conquistas" element={<Navigate to="/carreira" replace />} />
        <Route path="/carreira/oportunidades" element={<Navigate to="/carreira" replace />} />
        <Route path="/carreira/crescer" element={<CareerGrowPage />} />
        <Route path="/captura" element={<Navigate to="/carreira" replace />} />
        <Route path="/biblioteca/:section" element={<LibraryScreen />} />
        <Route path="/plano/:domain" element={<PlanScreen />} />
        <Route path="/revisao" element={<ProductReview />} />
        <Route path="*" element={<DayScreen />} />
      </Routes>
      <AddButton />
      <RegisterSheet open={reg} onClose={() => setReg(false)} />
      <Drawer open={menu} onClose={() => setMenu(false)} />
      <Toasts />
    </div>
  );
}
