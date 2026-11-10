// "O que muda hoje": um só bloco no Hoje com o que as especialistas combinaram (para aprovar) e o radar do dia
// (o que pede atenção agora). Mostra dois de cada vez, o que exige decisão primeiro; o resto fica em "Mais".
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Radar as RadarIcon } from 'lucide-react';
import type { DateKey } from '../lib/dates';
import { CouncilItemView, useCouncil } from './council';
import { RadarItemView, useRadar } from './radar-ui';

const SHOW = 2;

export function TodayFocus({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const council = useCouncil(date);
  const radar = useRadar(date);
  const [all, setAll] = useState(false);
  if (!council || !radar) return null;
  const total = council.length + radar.length;
  const cShown = all ? council : council.slice(0, SHOW);
  const rShown = all ? radar : radar.slice(0, Math.max(0, SHOW - cShown.length));
  const hidden = total - cShown.length - rShown.length;
  return (
    <section className="focus anim-rise" data-testid="today-focus" aria-label="O que muda hoje">
      <div className="row between" style={{ alignItems: 'center' }}>
        <span className="brief-k" style={{ color: 'var(--ink)' }}><RadarIcon size={15} />O que muda hoje</span>
        <button className="link small" style={{ minHeight: 32 }} onClick={() => nav('/indicadores')}><Activity size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Indicadores</button>
      </div>
      {total === 0 && <p className="small muted" style={{ margin: '6px 0 0' }}>Nada pedindo atenção agora. Comida, água, treino e recuperação estão no ritmo.</p>}
      {council.length > 0 && <div className="focus-group" data-testid="council">{cShown.map((x, k) => <CouncilItemView key={x.id} x={x} k={k} />)}</div>}
      <div className="focus-group" data-testid="radar">{rShown.map((r) => <RadarItemView key={r.id} r={r} />)}</div>
      {(hidden > 0 || all) && total > SHOW && (
        <button className="link small focus-more" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Mais ${hidden}`}<ChevronDown size={14} style={{ transform: all ? 'rotate(180deg)' : undefined, verticalAlign: '-2px', marginLeft: 2 }} /></button>
      )}
    </section>
  );
}
