import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, ListChecks, Plus, Sun } from 'lucide-react';
import { ensureDefaults } from './domain/defaults';
import { initSync } from './sync/sync';
import { useSettings } from './db/hooks';
import { Toasts } from './ui/ui';
import { DayScreen } from './screens/DayScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ListsScreen } from './screens/ListsScreen';
import { EvolutionScreen } from './screens/EvolutionScreen';
import { SkinScreen } from './screens/SkinScreen';
import { FoodScreen } from './screens/FoodScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { LibraryScreen } from './screens/library/LibraryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { Onboarding } from './screens/Onboarding';
import { ProductReview } from './screens/ProductReview';
import { RegisterSheet } from './screens/RegisterSheet';
import { registerSW } from 'virtual:pwa-register';
import { toast } from './state/store';

export function App() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    (async () => {
      try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
      await ensureDefaults();
      await initSync();
      setBooted(true);
    })();
    const update = registerSW({
      onNeedRefresh() { toast('Nova versão disponível', () => update(true)); }
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
  const mainTabs = ['/', '/calendario', '/listas', '/evolucao'];
  const showNav = mainTabs.includes(loc.pathname);
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<DayScreen />} />
        <Route path="/calendario" element={<CalendarScreen />} />
        <Route path="/listas" element={<ListsScreen />} />
        <Route path="/evolucao" element={<EvolutionScreen />} />
        <Route path="/pele" element={<SkinScreen />} />
        <Route path="/alimentacao" element={<FoodScreen />} />
        <Route path="/treino" element={<TrainingScreen />} />
        <Route path="/ajustes" element={<SettingsScreen />} />
        <Route path="/biblioteca/:section" element={<LibraryScreen />} />
        <Route path="/plano/:domain" element={<PlanScreen />} />
        <Route path="/revisao" element={<ProductReview />} />
        <Route path="*" element={<DayScreen />} />
      </Routes>
      {showNav && (
        <nav className="bottomnav" aria-label="Navegação principal">
          <NavLink to="/" end><Sun size={22} />Dia</NavLink>
          <NavLink to="/calendario"><CalendarDays size={22} />Calendário</NavLink>
          <button className="fab" aria-label="Registrar" onClick={() => setReg(true)} data-testid="fab"><Plus size={28} strokeWidth={2.4} /></button>
          <NavLink to="/listas"><ListChecks size={22} />Listas</NavLink>
          <NavLink to="/evolucao"><ChartNoAxesColumn size={22} />Evolução</NavLink>
        </nav>
      )}
      <RegisterSheet open={reg} onClose={() => setReg(false)} />
      <Toasts />
    </div>
  );
}
