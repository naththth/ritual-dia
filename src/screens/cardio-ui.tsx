// Treinos de corrida, pedal, natação, ioga e aulas na mesma linguagem da musculação:
// números grandes, "Como fazer", blocos em cores por zona e ações do mesmo tamanho.
import type { ReactNode } from 'react';
import { Timer, Route, Gauge, Layers, Zap, HeartPulse } from 'lucide-react';
import type { Workout, WorkoutTemplate } from '../db/types';
import { metricCells, showsPowerZones } from '../domain/workoutMetrics';
import { POWER_ZONES } from '../domain/fit';
import { watts } from '../domain/ai';

const NB = '\u00a0';
/** Separa "9:56 /km" em número e unidade, para o número ir grande e a unidade pequena. */
const split = (v: string): [string, string] => { const i = v.indexOf(NB); return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)]; };

/** Cor do bloco pela intensidade (% do FTP ou do esforço): mais forte, mais quente. */
export const zoneTone = (pct: number) => (pct <= 55 ? 'z1' : pct <= 75 ? 'z2' : pct <= 90 ? 'z3' : pct <= 105 ? 'z4' : 'z5');

/** Números do treino feito: duração e distância grandes; o resto em grade de três, valores sempre numa linha. */
export function CardioNumbers({ w }: { w: Workout }) {
  const cells = metricCells(w);
  const dur = cells.find(([l]) => l === 'Duração');
  const dist = cells.find(([l]) => l === 'Distância');
  const rest = cells.filter(([l]) => l !== 'Duração' && l !== 'Distância');
  if (!cells.length) return null;
  return (
    <section className="cd-sheet" data-testid="cardio-numbers">
      {(dur || dist) && (
        <div className="ss-top">
          {dur ? <span className="ss-big"><b className="num">{split(dur[1])[0]}</b><span>{split(dur[1])[1]}</span></span> : <span />}
          {dist ? <div className="ss-vol"><b className="num">{split(dist[1])[0]}<small> {split(dist[1])[1]}</small></b><span>distância</span></div> : null}
        </div>
      )}
      {rest.length > 0 && (
        <div className="metric-grid cd-grid">
          {rest.map(([l, v]) => { const [n, u] = split(v); return <div key={l}><span className="mv num">{n}{u ? <small> {u}</small> : null}</span><span className="ml">{l}</span></div>; })}
        </div>
      )}
    </section>
  );
}

/** Tempo por zona de potência: barras na cor da zona, minutos à direita. */
export function ZoneBars({ w, ftp }: { w: Workout; ftp?: number }) {
  const zones = showsPowerZones(w) ? w.metrics?.zones : undefined;
  const total = zones ? Object.values(zones).reduce((a, b) => a + b, 0) : 0;
  if (!zones || !total) return null;
  const max = Math.max(...Object.values(zones));
  const tones = ['z1', 'z2', 'z3', 'z4', 'z5', 'z5'];
  return (
    <section className="cd-zones" data-testid="zones">
      <div className="cd-zones-h"><span className="ss-k2">Tempo por zona</span>{ftp || w.metrics?.ftpUsed ? <span className="tiny">FTP {w.metrics?.ftpUsed ?? ftp} W</span> : null}</div>
      {POWER_ZONES.map((z, i) => (
        <div key={z.id} className="cd-zrow">
          <span className="cd-zl">{z.label}</span>
          <span className="cd-zt"><i className={tones[i]} style={{ width: `${Math.max(zones[z.id] ? 4 : 0, (zones[z.id] / max) * 100)}%` }} /></span>
          <span className="cd-zm num">{zones[z.id]}{NB}min</span>
        </div>
      ))}
    </section>
  );
}

/** Treino planejado sem exercícios (pedal, corrida, natação, ioga, aula): números, como fazer, blocos e ações. */
export function PlanCardio({ t, ftp, steps, actions }: { t: WorkoutTemplate; ftp?: number; steps?: ReactNode; actions: ReactNode }) {
  const st = t.steps ?? t.runSteps;
  const peak = st?.length ? st.reduce((a, s) => (s.pct > a.pct ? s : a), st[0]) : undefined;
  const tiles: { k: string; icon: ReactNode; tone: string; v: string; l: string }[] = [
    { k: 'dur', icon: <Timer size={18} />, tone: 'blue', v: `${t.duration}`, l: 'minutos' }
  ];
  if (t.distanceKm) tiles.push({ k: 'km', icon: <Route size={18} />, tone: 'honey', v: String(t.distanceKm).replace('.', ','), l: 'km' });
  if (st?.length) tiles.push({ k: 'bl', icon: <Layers size={18} />, tone: 'honey', v: String(st.length), l: st.length === 1 ? 'bloco' : 'blocos' });
  if (peak && !peak.target && t.steps) tiles.push({ k: 'pk', icon: <Zap size={18} />, tone: 'rose', v: ftp ? `${watts(peak.pct, ftp)}` : `${peak.pct}%`, l: ftp ? 'W no pico' : 'FTP no pico' });
  else if (peak?.target) tiles.push({ k: 'pk', icon: <HeartPulse size={18} />, tone: 'rose', v: peak.target.replace(/^FC\s*/i, ''), l: 'alvo mais forte' });
  else tiles.push({ k: 'int', icon: <Gauge size={18} />, tone: 'rose', v: t.intensity, l: 'intensidade' });
  const shown = tiles.slice(0, 3);
  return (
    <div className="tp" data-testid="planned-cardio">
      <div className="tp-nums" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((x) => (
          <div key={x.k} className="tp-num"><span className={`ss-ic ic-${x.tone}`} aria-hidden>{x.icon}</span><b className={/^\d[\d,%]*$/.test(x.v) ? 'num' : 'tp-word'}>{x.v}</b><span>{x.l}</span></div>
        ))}
      </div>
      {t.note?.trim() && (
        <section className="tp-how" data-testid="plan-how">
          <span className="ss-k">Como fazer</span>
          <p>{t.note.trim()}</p>
        </section>
      )}
      {steps}
      {actions}
    </div>
  );
}
