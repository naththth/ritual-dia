// Cartão do Hoje: o que as especialistas combinaram entre si a partir do dia dela, pronto para aprovar.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Brain, Dumbbell, Utensils } from 'lucide-react';
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

/** O que as especialistas combinaram hoje, sem o que ela já dispensou. Só existe para o dia de hoje. */
export function useCouncil(date: DateKey) {
  const settings = useSettings();
  const items = useLiveQuery(async () => { const m = await loadMind(todayKey(), 42); return buildCouncil(m.days, m.alerts); }, []);
  if (!items || !settings) return undefined;
  if (date !== todayKey()) return [] as CouncilItem[];
  const dismissed = settings.mind?.dismissed ?? {};
  return items.filter((x) => !dismissed[x.id]);
}

export function CouncilItemView({ x, k }: { x: CouncilItem; k: number }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    if (!x.approve) return;
    setBusy(true);
    try { const msg = await x.approve.run(); await dismissAlert(x.id); toast(msg || 'Feito'); }
    catch (e: any) { toast(`Não deu certo: ${e.message}`, undefined, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className="council-item" style={{ animationDelay: `${80 + k * 70}ms` }} data-testid={`council-${x.id.split(':')[1]}`}>
      <span className={`council-who ${WHO[x.who].cls}`}>{WHO[x.who].icon}{WHO[x.who].label}</span>
      <b className="council-t">{x.title}</b>
      <p className="council-p">{x.text}</p>
      <div className="row wrap" style={{ gap: 8 }}>
        {x.approve && <button className="pill-act council-go" disabled={busy} onClick={() => void approve()} data-testid="council-approve">{busy ? 'Aplicando…' : x.approve.label}</button>}
        {x.link && <button className="pill-act pa-ghost" onClick={() => { void dismissAlert(x.id); if (x.link!.ask) askSpecialist(nav, x.link!.ask.domain, x.link!.ask.text); else nav(x.link!.to); }}>{x.link.label}</button>}
        <button className="link small" onClick={() => void dismissAlert(x.id)}>Agora não</button>
      </div>
    </div>
  );
}
