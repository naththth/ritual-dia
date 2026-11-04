import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/dates';
import { bedStageProgress, computeAlerts, daysLeft, dosesFor, moodBaseline, slotsFor, type MindDay } from '../../src/domain/mind';
import { bedFor } from '../../src/domain/sleep';
import type { Intake, IntakeLog, Wellness } from '../../src/db/types';

const T = '2026-11-04';
const base = { createdAt: new Date(2026, 0, 1).getTime(), updatedAt: 1 };
const day = (date: string, p: Partial<MindDay> = {}): MindDay => ({
  date, tags: [], checkinPm: false, caffeineMg: 0, breakfast: true, mealsLogged: false, trainMin: 0, plannedMin: 0,
  dosesDue: 0, dosesTaken: 0, dosesSkipped: 0, dosesLate: 0, medDosesMissed: 0, sleepH: 7.5, ...p
});
/** 40 dias terminando em T; f muda cada dia (i = 0 é hoje). */
const series = (f: (i: number, d: MindDay) => Partial<MindDay> = () => ({})) =>
  Array.from({ length: 40 }, (_, k) => { const i = 39 - k; const d = day(addDays(T, -i)); return { ...d, ...f(i, d) }; });
const ctx = { today: T, nowMin: 22 * 60, bed: '22:00', medChanges: [], caffeineSensitive: false };
const withMood = (i: number) => ({ checkinPm: true, moodPm: 0, moodAm: 0 });

describe('o que tomar', () => {
  const item = (p: Partial<Intake>): Intake => ({ ...base, id: 'i', kind: 'intake', name: 'X', type: 'medicamento', times: ['08:00'], active: true, order: 1, ...p });
  it('ordena por horário e junta o registro', () => {
    const items = [item({ id: 'a', name: 'Noite', times: ['20:00'] }), item({ id: 'b', name: 'Manhã', times: ['06:40'] }), item({ id: 'c', name: 'Pausado', active: false })];
    const logs: IntakeLog[] = [{ ...base, id: 'l', kind: 'intakelog', date: T, itemId: 'b', slot: '06:40', status: 'tomei', takenAt: '06:50' }];
    const ds = dosesFor(items, logs, T);
    expect(ds.map((d) => d.item.name)).toEqual(['Manhã', 'Noite']);
    expect(ds[0].log?.status).toBe('tomei');
    expect(slotsFor(ds).map((s) => s.slot)).toEqual(['06:40', '20:00']);
  });
  it('estoque em dias', () => {
    expect(daysLeft(item({ stock: 30, times: ['08:00', '20:00'] }))).toBe(15);
    expect(daysLeft(item({}))).toBeUndefined();
  });
});

describe('meta de deitar em etapas', () => {
  it('a meta manda no horário e libera a próxima etapa com 5 noites', () => {
    const sp = { wake: '06:00', hours: 8, latency: 15, alarm: true, bed: true, bedGoal: '22:00', bedFinal: '21:30' };
    expect(bedFor(sp, T)).toBe('22:00');
    const w = (date: string, start: string): Wellness => ({ ...base, id: date, kind: 'wellness', date, sleepStart: start });
    const nights = ['22:05', '21:50', '22:10', '00:20', '22:00', '21:58', '23:10'].map((s, i) => w(addDays(T, -i), s));
    const p = bedStageProgress(sp, nights, T)!;
    expect(p.onTime).toBe(5);
    expect(p.ready).toBe(true);
  });
});

describe('avisos', () => {
  it('humor só liga depois de 4 semanas e 20 noites', () => {
    const few = series((i) => (i < 10 ? withMood(i) : {}));
    expect(moodBaseline(few, T).ready).toBe(false);
    const ok = series((i) => (i < 32 ? withMood(i) : {}));
    expect(moodBaseline(ok, T).ready).toBe(true);
  });

  it('sono curto sem cansaço vira aviso importante (com linha de base)', () => {
    const days = series((i) => ({ ...withMood(i), ...(i <= 1 ? { sleepH: 5.5, wake: 'acelerada', moodAm: 2 } : {}) }));
    const a = computeAlerts(days, ctx);
    expect(a[0].id).toBe('sono-curto');
    expect(a[0].level).toBe('importante');
    expect(a[0].text).toMatch(/psiquiatra/);
  });

  it('sem linha de base, o mesmo padrão não dispara aviso de humor', () => {
    const days = series((i) => (i <= 1 ? { checkinPm: true, sleepH: 5.5, wake: 'acelerada', moodAm: 2 } : {}));
    expect(computeAlerts(days, ctx).some((x) => x.area === 'humor' && x.id === 'sono-curto')).toBe(false);
  });

  it('café depois do corte, com a comparação das noites', () => {
    const days = series((i) => ({ caffeineMg: 130, lastCaffeine: i === 0 || i % 5 === 0 ? '16:30' : '09:00', firstCaffeine: '07:00', sleepH: i % 5 === 4 ? 6 : 7.6 }));
    const a = computeAlerts(days, ctx);
    const c = a.find((x) => x.id === 'cafe-tarde')!;
    expect(c.title).toBe('Café às 16:30');
    expect(c.text).toMatch(/14:00/);
  });

  it('remédio esquecido duas vezes na semana', () => {
    const days = series((i) => (i === 2 || i === 4 ? { medDosesMissed: 1, dosesDue: 4, dosesTaken: 3 } : {}));
    const a = computeAlerts(days, ctx);
    expect(a.find((x) => x.id === 'adesao')?.text).toMatch(/Não compense/);
  });

  it('déficit grande sobe para importante com sono instável', () => {
    const days = series((i) => ({ mealsLogged: i >= 1 && i <= 6, kcal: 800, protein: 90, sleepH: i <= 1 ? 4.5 : 7.5 }));
    const a = computeAlerts(days, { ...ctx, targets: { kcal: 1223, p: 135 } });
    expect(a.find((x) => x.id === 'deficit')?.level).toBe('importante');
  });

  it('no máximo 1 importante e 2 de atenção', () => {
    const days = series((i) => ({ ...withMood(i), caffeineMg: 450, lastCaffeine: '17:00', firstCaffeine: '07:00', medDosesMissed: i < 3 ? 1 : 0, tags: i === 0 ? ['Álcool'] : [], ...(i <= 1 ? { sleepH: 5.5, wake: 'acelerada', moodAm: 2 } : {}) }));
    const a = computeAlerts(days, ctx);
    expect(a.filter((x) => x.level === 'importante').length).toBeLessThanOrEqual(1);
    expect(a.filter((x) => x.level === 'atencao').length).toBeLessThanOrEqual(2);
  });
});
