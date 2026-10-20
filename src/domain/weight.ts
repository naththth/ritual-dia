// Peso: série das pesagens, ritmo pela tendência das últimas semanas e previsão até o objetivo.
import { addDays, diffDays, type DateKey } from '../lib/dates';
import type { Profile, Wellness } from '../db/types';

export interface WeighIn { date: DateKey; kg: number; source?: string }

export function weighIns(ws: Wellness[]): WeighIn[] {
  return ws.filter((w) => !w.deleted && typeof w.weight === 'number' && w.weight > 20 && w.weight < 400)
    .map((w) => ({ date: w.date, kg: Number(w.weight), source: w.source }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Inclinação (kg por dia) por mínimos quadrados; pesagem isolada oscila com água e intestino, a tendência não. */
function slope(pts: WeighIn[]) {
  const x0 = pts[0].date;
  const xs = pts.map((p) => diffDays(x0, p.date)), ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den ? num / den : 0;
}

export interface WeightStatus {
  current?: WeighIn; start?: number; startDate?: DateKey; target?: number; deadline?: DateKey;
  lost?: number; left?: number; pct?: number;
  perWeek?: number; perWeekPct?: number; trendDays?: number;
  eta?: DateKey; neededPerWeek?: number;
}

export function weightStatus(list: WeighIn[], profile: Profile | undefined, today: DateKey): WeightStatus {
  const g = profile?.weightGoal ?? {};
  const current = list[list.length - 1];
  const startDate = g.startDate;
  const start = g.startKg ?? (startDate ? list.find((w) => w.date >= startDate)?.kg : undefined);
  const out: WeightStatus = { current, start, startDate, target: g.targetKg, deadline: g.deadline };
  if (!current) return out;
  // Tendência: últimos 28 dias; se houver poucas pesagens, amplia para 56.
  for (const span of [28, 56]) {
    const pts = list.filter((w) => w.date >= addDays(current.date, -span));
    if (pts.length >= 3 && diffDays(pts[0].date, pts[pts.length - 1].date) >= 10) {
      out.perWeek = slope(pts) * 7; out.trendDays = span;
      out.perWeekPct = (out.perWeek / current.kg) * 100;
      break;
    }
  }
  if (out.target != null) {
    const dir = out.start != null && out.start < out.target ? 1 : -1; // ganhar ou perder
    out.left = Math.max(0, (out.target - current.kg) * dir);
    if (out.start != null) {
      const total = Math.abs(out.target - out.start);
      out.lost = (current.kg - out.start) * dir;
      out.pct = total ? Math.max(0, Math.min(100, (out.lost / total) * 100)) : 100;
    }
    if (out.perWeek && out.left > 0 && Math.sign(out.perWeek) === dir) out.eta = addDays(current.date, Math.round((out.left / Math.abs(out.perWeek)) * 7));
    if (out.deadline && out.left > 0) { const d = diffDays(today, out.deadline); if (d > 0) out.neededPerWeek = (out.left / d) * 7; }
  }
  return out;
}
