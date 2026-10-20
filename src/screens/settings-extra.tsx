import { useEffect, useState } from 'react';
import { Bell, BellOff, Plus, Trash2, Moon, RefreshCw, Link2 } from 'lucide-react';
import { DEFAULT_SLEEP, bedFor, hoursLabel, scheduleFromSleep, sleepPlan, wakeFor } from '../domain/sleep';
import { addDays, todayKey, weekStart } from '../lib/dates';
import { useSettings } from '../db/hooks';
import { update, uid } from '../db/db';
import type { Reminders } from '../db/types';
import { Chip, TimeInput } from '../ui/ui';
import { toast } from '../state/store';
import { disablePush, enablePush, pushStatus, testPush, saveIntervalsKey, syncIntervalsNow, removeIntervalsKey } from '../sync/services';
import { useSync } from '../sync/sync';
import { WEEKDAY_SHORT } from '../lib/dates';
import { DEFAULT_MEAL_TIMES, DEFAULT_SKIN_TIMES } from './today';

export const DEFAULT_REMINDERS: Reminders = { enabled: true, meals: true, skin: true, classes: true, water: false, morning: '06:45', evening: '21:45', custom: [] };

export function RemindersSection() {
  const settings = useSettings();
  const session = useSync((s) => s.session);
  const [status, setStatus] = useState<string>('…');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([]);
  useEffect(() => { pushStatus().then(setStatus); }, []);
  if (!settings) return null;
  const r = { ...DEFAULT_REMINDERS, ...(settings.reminders ?? {}) };
  const setR = (p: Partial<Reminders>) => update<'settings'>('settings', { reminders: { ...r, ...p } });
  const meals = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}) };
  const skin = { ...DEFAULT_SKIN_TIMES, ...(settings.skinTimes ?? {}) };
  const toggle = (k: keyof Reminders) => setR({ [k]: !r[k] } as any);

  return (
    <>
    <SleepSection r={r} setR={setR} />
    <section className="block b-paper" data-testid="reminders">
      <h2 style={{ fontSize: 20 }}>Lembretes</h2>
      {!session ? <p className="small">Entre com Google para receber notificações no celular.</p> : (
        <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
          {status === 'on' ? (
            <>
              <span className="small row" style={{ gap: 6 }}><Bell size={16} />Notificações ligadas neste aparelho</span>
              <button className="btn btn-soft btn-sm" onClick={async () => { try { await testPush(); toast('Notificação de teste enviada'); } catch (e: any) { toast(e.message, undefined, 'error'); } }}>Testar</button>
              <button className="btn btn-soft btn-sm" onClick={async () => { await disablePush(); setStatus('off'); toast('Notificações desligadas neste aparelho'); }}><BellOff size={15} />Desligar</button>
            </>
          ) : status === 'unsupported' ? (
            <span className="small">Abra o Ritual pelo app instalado no Android para ativar as notificações.</span>
          ) : status === 'denied' ? (
            <span className="small">As notificações estão bloqueadas. Libere em Configurações do Android, Apps, Ritual, Notificações.</span>
          ) : (
            <button className="btn btn-ink btn-sm" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await enablePush(); setStatus('on'); toast('Pronto. Você deve receber uma notificação de teste.'); }
              catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
            }} data-testid="push-enable"><Bell size={16} />Ativar notificações</button>
          )}
        </div>
      )}
      <div className="chips" style={{ marginTop: 6 }}>
        <Chip on={r.morning != null && r.morning !== ''} onClick={() => setR({ morning: r.morning ? '' : '06:45' })}>Abertura do dia</Chip>
        <Chip on={r.meals} onClick={() => toggle('meals')}>Refeições</Chip>
        <Chip on={r.skin} onClick={() => toggle('skin')}>Pele</Chip>
        <Chip on={r.classes} onClick={() => toggle('classes')}>Aulas (1 h antes)</Chip>
        <Chip on={r.water} onClick={() => toggle('water')}>Água</Chip>
        <Chip on={r.evening != null && r.evening !== ''} onClick={() => setR({ evening: r.evening ? '' : '21:45' })}>Fechar o dia</Chip>
      </div>
      <span className="label">Horários</span>
      <div className="time-grid">
        {r.morning ? <TimeField label="Abertura do dia" value={r.morning} onChange={(v) => setR({ morning: v })} /> : null}
        {(settings.mealTypes ?? []).map((m) => <TimeField key={m.id} label={m.label} value={meals[m.id] ?? ''} onChange={(v) => update<'settings'>('settings', { mealTimes: { ...meals, [m.id]: v } })} />)}
        <TimeField label="Rotina da manhã" value={skin.am} onChange={(v) => update<'settings'>('settings', { skinTimes: { ...skin, am: v } })} />
        <TimeField label="Rotina da noite" value={skin.pm} onChange={(v) => update<'settings'>('settings', { skinTimes: { ...skin, pm: v } })} />
        {r.evening ? <TimeField label="Fechar o dia" value={r.evening} onChange={(v) => setR({ evening: v })} /> : null}
      </div>
      <p className="field-hint">Esses horários também organizam a linha do tempo do dia. Lembrete de refeição ou pele não chega se você já registrou.</p>

      <span className="label">Meus lembretes</span>
      {r.custom.map((c) => (
        <div key={c.id} className="row-item">
          <span className="grow"><span style={{ fontWeight: 650 }}>{c.label}</span><br /><span className="small muted">{c.time}{c.days.length ? `, ${c.days.map((d) => WEEKDAY_SHORT[d]).join(', ')}` : ', todos os dias'}</span></span>
          <button className="icon-btn" aria-label={`Remover ${c.label}`} onClick={() => setR({ custom: r.custom.filter((x) => x.id !== c.id) })}><Trash2 size={17} /></button>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: tomar creatina" aria-label="Novo lembrete" style={{ flex: 2 }} />
        <TimeInput value={time} onChange={setTime} label="Horário" style={{ flex: 1 }} />
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} on={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{WEEKDAY_SHORT[d]}</Chip>)}
        <button className="btn btn-soft btn-sm" onClick={() => { if (!label.trim()) return; setR({ custom: [...r.custom, { id: uid(), label: label.trim(), time, days: [...days].sort() }] }); setLabel(''); setDays([]); }}><Plus size={16} />Adicionar</button>
      </div>
    </section>
    </>
  );
}

function SleepSection({ r, setR }: { r: Reminders; setR: (p: Partial<Reminders>) => Promise<unknown> }) {
  const settings = useSettings();
  const sp = sleepPlan(r);
  if (!settings) return null;
  if (!sp) {
    return (
      <section className="block b-paper" data-testid="sleep">
        <h2 style={{ fontSize: 20 }}><Moon size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Sono</h2>
        <p className="small">Diga a que horas quer acordar e quantas horas quer dormir. O Ritual calcula a hora de deitar, avisa antes e organiza o resto do dia em volta.</p>
        <button className="btn btn-ink btn-sm" onClick={() => setR({ sleep: DEFAULT_SLEEP })} data-testid="sleep-start">Definir meu horário de sono</button>
      </section>
    );
  }
  const setS = (p: Partial<typeof sp>) => setR({ sleep: { ...sp, ...p } });
  // Referência: uma noite de dia útil (de segunda para terça).
  const ref = addDays(weekStart(todayKey()), 0);
  const bed = bedFor(sp, ref);
  const bedWeekend = sp.weekendWake ? bedFor(sp, addDays(ref, 4)) : undefined; // sexta para sábado
  const organize = async () => {
    const t = scheduleFromSleep(sp, ref);
    const meals = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}), cafe: t.cafe };
    await update<'settings'>('settings', { mealTimes: meals, skinTimes: { ...(settings.skinTimes ?? {}), am: t.skinAm, pm: t.skinPm }, reminders: { ...r, sleep: sp, morning: sp.alarm ? '' : t.morning, evening: t.evening } });
    toast(`Pronto: pele ${t.skinAm}, café ${t.cafe}, fechar o dia ${t.evening}, pele da noite ${t.skinPm}, deitar ${bed}`);
  };
  return (
    <section className="block b-paper" data-testid="sleep">
      <h2 style={{ fontSize: 20 }}><Moon size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Sono</h2>
      <div className="time-grid">
        <TimeField label="Acordar" value={sp.wake} onChange={(v) => setS({ wake: v })} />
        {sp.weekendWake ? <TimeField label="Acordar no fim de semana" value={sp.weekendWake} onChange={(v) => setS({ weekendWake: v })} /> : null}
      </div>
      <span className="label">Quanto quer dormir</span>
      <div className="chips">
        {[7, 7.5, 8, 8.5, 9].map((h) => <Chip key={h} on={sp.hours === h} onClick={() => setS({ hours: h })}>{hoursLabel(h)}</Chip>)}
      </div>
      <div className="sleep-result" data-testid="sleep-bed">
        <span className="small">Deitar e apagar a luz às</span>
        <span className="big-num num">{bed}</span>
        <span className="small">para dormir {hoursLabel(sp.hours)} e acordar às {wakeFor(sp, addDays(ref, 1))}{bedWeekend ? `. Sexta e sábado: ${bedWeekend}` : ''}.</span>
      </div>
      <p className="field-hint">A conta já inclui {sp.latency} min para pegar no sono. Para atletas em semana de treino, 8 h ou mais é o mais seguro para recuperar.</p>
      <div className="chips" style={{ marginTop: 6 }}>
        <Chip on={sp.alarm} onClick={() => setS({ alarm: !sp.alarm })}>Alarme para acordar</Chip>
        <Chip on={sp.bed} onClick={() => setS({ bed: !sp.bed })}>Aviso 15 min antes de deitar</Chip>
        <Chip on={!!sp.weekendWake} onClick={() => setS({ weekendWake: sp.weekendWake ? undefined : '07:30' })}>Outro horário no fim de semana</Chip>
      </div>
      <button className="btn btn-ink btn-block" style={{ marginTop: 12 }} onClick={organize} data-testid="sleep-organize">Organizar meus horários pelo sono</button>
      <p className="field-hint">Ajusta pele da manhã, café, abertura do dia, fechar o dia e pele da noite em volta desses horários. Almoço, lanche e jantar ficam como estão.</p>
      {sp.alarm && <p className="field-hint">O alarme do Ritual é uma notificação que toca e vibra até você tocar nela. O Android pode segurá-la no modo Não perturbe ou na economia de bateria, então deixe também o despertador do celular às {sp.wake} como garantia.</p>}
    </section>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="nutr-cell"><span>{label}</span><TimeInput value={value} onChange={onChange} label={`Horário: ${label}`} /></label>
  );
}

export function IntervalsSection() {
  const settings = useSettings();
  const session = useSync((s) => s.session);
  const [key, setKey] = useState('');
  const [athlete, setAthlete] = useState('');
  const [busy, setBusy] = useState(false);
  if (!settings) return null;
  const conn = settings.intervals;
  const run = async () => {
    setBusy(true);
    try {
      const r = await syncIntervalsNow(30);
      await update<'settings'>('settings', { intervals: { ...(conn ?? {}), connected: true, lastSync: Date.now() } });
      toast(`${r.pushed} treinos enviados ao MyWhoosh; ${r.activities} atividades e ${r.wellness} dias de sono e passos recebidos`);
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  return (
    <section className="block b-paper" data-testid="intervals">
      <h2 style={{ fontSize: 20 }}><Link2 size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />MyWhoosh e Garmin</h2>
      {!session ? <p className="small">Entre com Google para conectar.</p> : conn?.connected ? (
        <>
          <p className="small" style={{ marginTop: 4 }}>Conectado pelo intervals.icu. A cada hora o Ritual envia os pedais planejados dos próximos 7 dias (eles aparecem no calendário do MyWhoosh) e recebe os treinos feitos, sono, VFC, FC de repouso e passos.{conn.lastSync ? ` Última atualização: ${new Date(conn.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-ink btn-sm" onClick={run} disabled={busy} data-testid="intervals-sync"><RefreshCw size={15} />{busy ? 'Atualizando…' : 'Atualizar agora'}</button>
            <button className="btn btn-soft btn-sm" onClick={async () => { await removeIntervalsKey(); await update<'settings'>('settings', { intervals: { connected: false } }); toast('Desconectado'); }}>Desconectar</button>
          </div>
        </>
      ) : (
        <>
          <p className="small" style={{ marginTop: 4 }}>O MyWhoosh não abre conexão direta para outros apps. A ponte é o intervals.icu (gratuito): ele leva os treinos do Ritual para o calendário do MyWhoosh e traz de volta o que você pedalou, junto com sono e passos do Garmin.</p>
          <ol className="small" style={{ paddingLeft: 18, margin: '6px 0 10px' }}>
            <li>Crie a conta em intervals.icu. Em Settings, conecte o <b>MyWhoosh</b> e o <b>Garmin Connect</b> (não precisa do Strava).</li>
            <li>No fim da página Settings, em Developer Settings, gere a <b>API Key</b> e copie o <b>Athlete ID</b> (começa com "i").</li>
            <li>Cole aqui. A chave fica guardada só no servidor.</li>
          </ol>
          <input value={athlete} onChange={(e) => setAthlete(e.target.value)} placeholder="Athlete ID, ex.: i123456" aria-label="Athlete ID" />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="API Key" aria-label="API Key do intervals.icu" style={{ marginTop: 8 }} autoComplete="off" />
          <button className="btn btn-ink btn-sm" style={{ marginTop: 10 }} disabled={busy || key.trim().length < 10} onClick={async () => {
            setBusy(true);
            try { await saveIntervalsKey(key, athlete); setKey(''); await run(); }
            catch (e: any) { toast(e.message, undefined, 'error'); setBusy(false); }
          }}>Conectar</button>
        </>
      )}
    </section>
  );
}
