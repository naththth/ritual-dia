// Indicadores: o período dela contra as referências científicas, com a barra de cada dia para ver o padrão.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from './common';
import { Seg } from '../ui/ui';
import { useAll, useByRange, useSettings } from '../db/hooks';
import { addDays, todayKey, WEEKDAY_LETTER, isoWeekday, dayNum } from '../lib/dates';
import { indicators, type DayRow } from '../domain/indicators';
import { fmt } from '../domain/nutrition';
import { formLabel } from '../domain/load';
import { planFor, plannedFood } from '../domain/rules';
import { totals } from '../domain/nutrition';
import { WellnessCard } from './wellness';
import { CycleCard } from './cycle';
import { ChevronRight, Sparkles } from 'lucide-react';

const hmin = (h?: number) => (h == null ? '–' : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);

function Tile({ v, l, hint: refText, tone, ok }: { v: string; l: string; hint?: string; tone?: string; ok?: boolean | null }) {
  return (
    <div className={`ind-tile ${tone ?? ''}`}>
      <span className="v num">{v}</span>
      <span className="l">{l}</span>
      <span className={`r ${refText ? '' : 'empty'} ${ok === true ? 'ok' : ok === false ? 'off' : ''}`}>{refText ?? ''}</span>
    </div>
  );
}

function DayBars({ days, pick, goal, color, label }: { days: DayRow[]; pick: (d: DayRow) => number | undefined; goal?: number; color: string; label: string }) {
  const vals = days.map(pick);
  const max = Math.max((goal ?? 0) * 1.15, ...vals.map((v) => (v ?? 0) * 1.05)) || 1;
  return (
    <div className="ind-bars" aria-label={label} role="img">
      {days.map((d, i) => (
        <div key={d.date} className="ib">
          <div className="ib-track">
            {goal ? <i className="ib-goal" style={{ bottom: `${(goal / max) * 100}%` }} /> : null}
            <i className="ib-fill" style={{ height: `${((vals[i] ?? 0) / max) * 100}%`, background: vals[i] == null ? 'transparent' : color }} />
          </div>
          {days.length <= 7 ? <span className="ib-l">{WEEKDAY_LETTER[isoWeekday(d.date)]}</span> : i % 7 === 0 ? <span className="ib-l">{dayNum(d.date)}</span> : <span className="ib-l" />}
        </div>
      ))}
    </div>
  );
}

export function IndicatorsScreen() {
  const nav = useNavigate();
  const [n, setN] = useState<'7' | '28'>('7');
  const to = todayKey();
  const N = Number(n);
  const from = addDays(to, -(N - 1));
  const settings = useSettings();
  const meals = useByRange('meal', from, to);
  const water = useByRange('water', from, to);
  const wellness = useByRange('wellness', addDays(from, -1), to);
  const history = useByRange('workout', addDays(to, -150), to);
  const skin = useByRange('skin', from, to);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  if (!settings || !meals || !water || !wellness || !history || !skin || !foods || !plans || !tmpls) return <div className="screen no-nav"><PageHead title="Indicadores" withDate={false} /></div>;
  const planItems = Object.values(plannedFood(planFor(plans, 'food', to), to, [])).flatMap((id) => tmpls.find((t) => t.id === id)?.items ?? []);
  const planTot = planItems.length ? totals(planItems, foods).n : undefined;
  const goal = { kcal: settings.targets?.kcal ?? planTot?.kcal, p: settings.targets?.p ?? planTot?.p };
  const lastW = [...wellness].filter((w) => w.weight).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const kg = lastW?.weight ?? settings.profile?.weightKg;
  const r = indicators({ to, n: N, meals, foods, water, wellness, workouts: history.filter((w) => w.date >= from), history, skin, goal, waterGoal: settings.waterGoalMl, weightKg: kg });
  const f = r.food, t = r.training, rc = r.recovery;
  return (
    <div className="screen no-nav" data-testid="indicators">
      <PageHead title="Indicadores" withDate={false} />
      {/* O de hoje: sono e corpo vindos do relógio (com a confirmação de noite curta) e a fase do ciclo. */}
      <h2 className="sec-h" style={{ marginTop: 4 }}>Hoje</h2>
      <WellnessCard date={to} />
      <CycleCard date={to} />
      <button className="lib-item" style={{ margin: '0 0 18px' }} onClick={() => nav('/semana')} data-testid="ind-week"><span className="lib-icon"><Sparkles size={20} /></span><span className="grow"><b>Sua semana</b><br /><span className="small muted">Leitura da equipe e padrões que são seus</span></span><ChevronRight size={18} /></button>
      <Seg value={n} onChange={setN} options={[{ id: '7', label: '7 dias' }, { id: '28', label: '28 dias' }]} label="Período" />

      <h2 className="sec-h">Alimentação</h2>
      <div className="ind-grid">
        <Tile tone="t-honey" v={f.pAvg != null ? `${fmt(f.pAvg)} g` : '–'} l="proteína média por dia" hint={f.pPerKg != null ? `${f.pPerKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g/kg · faixa 1,6 a 2,2` : 'faixa 1,6 a 2,2 g/kg'} ok={f.pPerKg != null ? f.pPerKg >= 1.6 : null} />
        <Tile v={`${f.pDaysOk}/${f.loggedDays}`} l="dias com proteína na meta" hint={f.pTarget ? `meta ${fmt(f.pTarget)} g` : undefined} ok={f.loggedDays ? f.pDaysOk / f.loggedDays >= 0.7 : null} />
        <Tile v={f.kcalAvg != null ? fmt(f.kcalAvg) : '–'} l="kcal média nos dias registrados" hint={goal.kcal ? `meta ${fmt(goal.kcal)}` : undefined} ok={goal.kcal && f.kcalAvg != null ? Math.abs(f.kcalAvg - goal.kcal) <= goal.kcal * 0.1 : null} />
        <Tile v={f.waterAvg != null ? `${(f.waterAvg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '–'} l="água média" hint={settings.waterGoalMl ? `${f.waterDaysOk} dias na meta` : undefined} ok={settings.waterGoalMl && f.waterAvg != null ? f.waterAvg >= settings.waterGoalMl * 0.9 : null} />
      </div>
      <span className="label">Proteína por dia{f.pTarget ? ' (linha: meta)' : ''}</span>
      <DayBars days={r.days} pick={(d) => d.p} goal={f.pTarget} color="var(--honey-ink)" label="Proteína por dia" />
      <p className="ind-note">{f.loggedDays}/{N} dias com refeição registrada. Dias sem registro ficam fora das médias.</p>

      <h2 className="sec-h">Treino</h2>
      <div className="ind-grid">
        <Tile tone="t-teal" v={String(t.sessions)} l="treinos" hint={`${hmin(t.minutes / 60)} no total`} />
        <Tile v={fmt(t.tss)} l="TSS no período" hint={N === 7 ? 'carga da semana' : 'carga de 4 semanas'} />
        <Tile v={t.fitness != null ? fmt(t.fitness) : '–'} l="fitness (CTL)" hint={t.fitnessDelta != null ? `${t.fitnessDelta >= 0 ? '+' : ''}${fmt(t.fitnessDelta)} no período` : undefined} ok={t.fitnessDelta != null ? t.fitnessDelta >= 0 : null} />
        <Tile v={t.form != null ? fmt(t.form) : '–'} l={`forma: ${t.form != null ? formLabel(t.form) : 'sem dados'}`} hint="ideal entre -25 e +5 em bloco de treino" ok={t.form != null ? t.form > -25 : null} />
      </div>
      <span className="label">TSS por dia</span>
      <DayBars days={r.days} pick={(d) => d.tss} color="var(--blue-ink)" label="TSS por dia" />

      <h2 className="sec-h">Recuperação</h2>
      <div className="ind-grid">
        <Tile tone="t-lilac" v={hmin(rc.sleepAvg)} l="sono médio" hint={`${rc.nights7}/${rc.nightsLogged} noites com 7 h ou mais`} ok={rc.sleepAvg != null ? rc.sleepAvg >= 7 : null} />
        <Tile v={rc.hrvAvg != null ? `${fmt(rc.hrvAvg)} ms` : '–'} l="VFC média" hint={rc.hrvTrend != null ? `${rc.hrvTrend >= 0 ? 'subindo' : 'caindo'} ${fmt(Math.abs(rc.hrvTrend))} ms` : undefined} ok={rc.hrvTrend != null ? rc.hrvTrend >= -3 : null} />
        <Tile v={rc.rhrAvg != null ? fmt(rc.rhrAvg) : '–'} l="FC de repouso" hint="queda ao longo das semanas indica adaptação" />
        {r.weight ? <Tile v={`${r.weight.to.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`} l="peso" hint={`${r.weight.perWeek >= 0 ? '+' : ''}${r.weight.perWeek.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg/semana · ideal até 1% do peso`} ok={kg ? Math.abs(r.weight.perWeek) <= kg * 0.01 : null} /> : <Tile v="–" l="peso" hint="sem pesagens no período" />}
      </div>
      <span className="label">Sono por noite (linha: 7 h)</span>
      <DayBars days={r.days} pick={(d) => d.sleep} goal={7} color="var(--lilac-ink)" label="Sono por noite" />

      <h2 className="sec-h">Pele</h2>
      <div className="ind-grid">
        <Tile tone="t-rose" v={`${r.skin.am}/${N}`} l="manhãs registradas" hint="protetor todo dia é o que mais protege" ok={r.skin.am >= N * 0.8} />
        <Tile v={`${r.skin.pm}/${N}`} l="noites registradas" hint="constância pesa mais que o número de passos" ok={r.skin.pm >= N * 0.6} />
      </div>

      <p className="ind-note" style={{ marginTop: 18 }}>Referências: proteína para quem treina força, ISSN (Jäger et al., 2017); sono, consenso AASM/SRS (7 h ou mais); perda de peso de até ~1% por semana para preservar massa magra (Helms et al., 2014); carga pelo modelo de Banister (CTL/ATL/TSB).</p>
      <button className="btn btn-soft btn-block" style={{ marginTop: 8 }} onClick={() => nav('/evolucao')}>Ver a evolução e a revisão da semana com IA</button>
    </div>
  );
}
