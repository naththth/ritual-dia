// Radar do dia no Hoje: junta comida, água, treino, recuperação, pele e clima e mostra só o que pede atenção agora.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Droplets, Dumbbell, Moon, Radar as RadarIcon, Sparkles, Sun, Utensils } from 'lucide-react';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { planFor, plannedTraining } from '../domain/rules';
import { trainingLoad } from '../domain/load';
import { effectiveHrv, effectiveSleep } from '../domain/wellness';
import { dayFraction } from '../domain/fuel';
import { radar, type RadarItem, type RadarTone } from '../domain/radar';
import { useFuel } from './fuel-ui';
import { DEFAULT_SKIN_TIMES } from './today';

// Sem localização no perfil, usa Curitiba. Open-Meteo é aberto, sem chave e aceita pedidos do navegador.
const LAT = -25.43, LON = -49.29;
export function useWeather(date: DateKey) {
  const [w, setW] = useState<{ uvMax?: number; tMax?: number; humidity?: number } | undefined>();
  useEffect(() => {
    if (date < addDays(todayKey(), -1) || date > addDays(todayKey(), 6)) { setW(undefined); return; }
    const key = `weather:${date}`;
    try { const c = JSON.parse(localStorage.getItem(key) ?? 'null'); if (c && Date.now() - c.at < 3 * 3600_000) { setW(c.w); return; } } catch { /* */ }
    if (!navigator.onLine) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=uv_index_max,temperature_2m_max,relative_humidity_2m_min&timezone=America%2FSao_Paulo&start_date=${date}&end_date=${date}`;
    fetch(url).then((r) => r.json()).then((j) => {
      const d = j?.daily;
      if (!d) return;
      const v = { uvMax: d.uv_index_max?.[0], tMax: d.temperature_2m_max?.[0], humidity: d.relative_humidity_2m_min?.[0] };
      setW(v);
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), w: v })); } catch { /* */ }
    }).catch(() => undefined);
  }, [date]);
  return w;
}

const ICON: Record<RadarTone, JSX.Element> = { food: <Utensils size={17} />, water: <Droplets size={17} />, training: <Dumbbell size={17} />, recovery: <Moon size={17} />, skin: <Sparkles size={17} />, weather: <Sun size={17} /> };

export function useRadar(date: DateKey): RadarItem[] | undefined {
  const settings = useSettings();
  const fuel = useFuel(date);
  const water = useByDate('water', date);
  const wellness = useByRange('wellness', addDays(date, -7), date);
  const history = useByRange('workout', addDays(date, -120), date);
  const plans = useAll('plan');
  const tmpls = useAll('wtemplate');
  const extras = useByDate('extra', date);
  const skin = useByDate('skin', date);
  const weather = useWeather(date);
  const [now, setNow] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => { const t = setInterval(() => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); }, 60_000); return () => clearInterval(t); }, []);
  if (!settings || !fuel || !water || !wellness || !history || !plans || !tmpls || !skin) return undefined;
  const today = date === todayKey();
  const wToday = wellness.find((w) => w.date === date);
  const prev = wellness.filter((w) => w.date < date).map((w) => effectiveHrv(w)).filter((x): x is number => x != null);
  const load = history.length ? trainingLoad(history, addDays(date, -120), date).slice(-1)[0] : undefined;
  const planned = plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean);
  const next = fuel.mealsLeft[0];
  const times = { ...DEFAULT_SKIN_TIMES, ...(settings.skinTimes ?? {}) };
  const mods = fuel.post ? (fuel.post.w.modalityId ?? '') : '';
  return radar({
    nowMin: now, today, dayFrac: today ? dayFraction(now) : 1, weightKg: fuel.weightKg,
    protein: { eaten: fuel.eaten.p, goal: fuel.goal.p, nextMealTarget: next ? fuel.targetFor(next).target.p : undefined, nextMealId: next },
    kcal: { eaten: fuel.eaten.kcal, goal: fuel.goal.kcal },
    water: { ml: water.reduce((a, w) => a + w.ml, 0), goal: settings.waterGoalMl },
    post: fuel.post ? { minsAgo: fuel.post.minsAgo, demanding: fuel.post.demanding, name: mods.includes('ciclismo') ? 'O pedal' : 'O treino', nextMealId: next } : undefined,
    sleepH: wToday ? effectiveSleep(wToday)?.h : undefined,
    hrv: wToday ? effectiveHrv(wToday) : undefined, hrvAvg: prev.length >= 3 ? prev.reduce((a, b) => a + b, 0) / prev.length : undefined,
    form: load?.tsb, plannedIntense: planned.some((t) => t!.intensity === 'intensa'),
    weather,
    skin: { amDone: skin.some((s) => s.period === 'am'), pmDone: skin.some((s) => s.period === 'pm'), amTime: times.am, pmTime: times.pm }
  });
}

export function RadarCard({ date }: { date: DateKey }) {
  const items = useRadar(date);
  const nav = useNavigate();
  const [all, setAll] = useState(false);
  if (!items) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="radar" data-testid="radar" aria-label="Radar do dia">
      <div className="row between" style={{ alignItems: 'center' }}>
        <span className="brief-k" style={{ color: 'var(--ink)' }}><RadarIcon size={15} />Radar do dia</span>
        <button className="link small" style={{ minHeight: 32 }} onClick={() => nav('/indicadores')}><Activity size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Indicadores</button>
      </div>
      {items.length === 0 ? <p className="small muted" style={{ margin: '6px 0 0' }}>Nada pedindo atenção agora. Comida, água, treino e recuperação estão no ritmo.</p> : shown.map((r) => (
        <div key={r.id} className={`rd-item rd-${r.tone}`} data-testid={`radar-${r.id}`}>
          <span className="rd-ic">{ICON[r.tone]}</span>
          <div className="grow">
            <b>{r.title}</b>
            <p>{r.text}</p>
            {r.why && <span className="rd-why">{r.why}</span>}
            {r.action && <button className="pill-act pa-ghost rd-act" onClick={() => nav(r.action!.to)}>{r.action.label}</button>}
          </div>
        </div>
      ))}
      {items.length > 3 && <button className="link small" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Mais ${items.length - 3}`}<ChevronDown size={14} style={{ transform: all ? 'rotate(180deg)' : undefined, verticalAlign: '-2px', marginLeft: 2 }} /></button>}
    </section>
  );
}
