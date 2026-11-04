// Cartão do Hoje: o que as especialistas combinaram entre si a partir do dia dela, pronto para aprovar.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Brain, Dumbbell, Users, Utensils } from 'lucide-react';
import { useSettings } from '../db/hooks';
import { todayKey, type DateKey } from '../lib/dates';
import { loadMind, dismissAlert } from '../domain/mindload';
import { buildCouncil, type CouncilItem, type Who } from '../domain/council';
import { toast } from '../state/store';
import { askSpecialist } from './askspec';

const WHO: Record<Who, { label: string; icon: JSX.Element; cls: string }> = {
  treinadora: { label: 'Treinadora', icon: <Dumbbell size={15} />, cls: 'w-train' },
  nutricionista: { label: 'Nutricionista', icon: <Utensils size={15} />, cls: 'w-food' },
  mente: { label: 'Mente', icon: <Brain size={15} />, cls: 'w-mind' }
};

export function CouncilCard({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const settings = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const items = useLiveQuery(async () => { const m = await loadMind(todayKey(), 42); return buildCouncil(m.days, m.alerts); }, []);
  if (date !== todayKey() || !items || !settings) return null;
  const dismissed = settings.mind?.dismissed ?? {};
  const list = items.filter((x) => !dismissed[x.id]);
  if (!list.length) return null;
  const approve = async (x: CouncilItem) => {
    if (!x.approve) return;
    setBusy(x.id);
    try { const msg = await x.approve.run(); await dismissAlert(x.id); toast(msg || 'Feito'); }
    catch (e: any) { toast(`Não deu certo: ${e.message}`, undefined, 'error'); }
    finally { setBusy(null); }
  };
  return (
    <section className="council anim-rise" data-testid="council" aria-label="As especialistas combinaram">
      <div className="council-h"><Users size={18} /><b>Suas especialistas combinaram</b></div>
      {list.map((x, k) => (
        <div key={x.id} className="council-item" style={{ animationDelay: `${80 + k * 70}ms` }} data-testid={`council-${x.id.split(':')[1]}`}>
          <span className={`council-who ${WHO[x.who].cls}`}>{WHO[x.who].icon}{WHO[x.who].label}</span>
          <b className="council-t">{x.title}</b>
          <p className="council-p">{x.text}</p>
          <div className="row wrap" style={{ gap: 8 }}>
            {x.approve && <button className="pill-act council-go" disabled={busy === x.id} onClick={() => void approve(x)} data-testid="council-approve">{busy === x.id ? 'Aplicando…' : x.approve.label}</button>}
            {x.link && <button className="pill-act pa-ghost" onClick={() => { void dismissAlert(x.id); if (x.link!.ask) askSpecialist(nav, x.link!.ask.domain, x.link!.ask.text); else nav(x.link!.to); }}>{x.link.label}</button>}
            <button className="link small" onClick={() => void dismissAlert(x.id)}>Agora não</button>
          </div>
        </div>
      ))}
    </section>
  );
}
