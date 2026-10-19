import { useEffect, useState } from 'react';
import { Bell, BellOff, Plus, Trash2, RefreshCw, Watch } from 'lucide-react';
import { useSettings } from '../db/hooks';
import { update, uid } from '../db/db';
import type { Reminders } from '../db/types';
import { Chip } from '../ui/ui';
import { toast } from '../state/store';
import { disablePush, enablePush, pushStatus, saveIntervalsKey, syncIntervalsNow, removeIntervalsKey, testPush } from '../sync/services';
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
        <TimeField label="Pele da manhã" value={skin.am} onChange={(v) => update<'settings'>('settings', { skinTimes: { ...skin, am: v } })} />
        <TimeField label="Pele da noite" value={skin.pm} onChange={(v) => update<'settings'>('settings', { skinTimes: { ...skin, pm: v } })} />
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
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Horário" style={{ flex: 1 }} />
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} on={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{WEEKDAY_SHORT[d]}</Chip>)}
        <button className="btn btn-soft btn-sm" onClick={() => { if (!label.trim()) return; setR({ custom: [...r.custom, { id: uid(), label: label.trim(), time, days: [...days].sort() }] }); setLabel(''); setDays([]); }}><Plus size={16} />Adicionar</button>
      </div>
    </section>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="nutr-cell"><span>{label}</span><input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={`Horário: ${label}`} /></label>
  );
}

export function GarminSection() {
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
      toast(`Garmin: ${r.activities} atividades e ${r.wellness} dias de passos e sono atualizados`);
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  return (
    <section className="block b-paper" data-testid="garmin">
      <h2 style={{ fontSize: 20 }}><Watch size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Garmin (via intervals.icu)</h2>
      {!session ? <p className="small">Entre com Google para conectar.</p> : conn?.connected ? (
        <>
          <p className="small" style={{ marginTop: 4 }}>Conectado. Passos, sono, FC de repouso, VFC e treinos entram sozinhos a cada hora.{conn.lastSync ? ` Última atualização: ${new Date(conn.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-ink btn-sm" onClick={run} disabled={busy}><RefreshCw size={15} />{busy ? 'Atualizando…' : 'Atualizar agora'}</button>
            <button className="btn btn-soft btn-sm" onClick={async () => { await removeIntervalsKey(); await update<'settings'>('settings', { intervals: { connected: false } }); toast('Desconectado'); }}>Desconectar</button>
          </div>
        </>
      ) : (
        <>
          <ol className="small" style={{ paddingLeft: 18, margin: '6px 0 10px' }}>
            <li>Crie uma conta grátis em intervals.icu e conecte o <b>Garmin Connect</b> (não o Strava) em Settings.</li>
            <li>No fim da página Settings, em Developer Settings, gere a <b>API Key</b> e copie também o <b>Athlete ID</b> (começa com "i").</li>
            <li>Cole aqui. A chave fica guardada só no servidor.</li>
          </ol>
          <input value={athlete} onChange={(e) => setAthlete(e.target.value)} placeholder="Athlete ID, ex.: i123456" aria-label="Athlete ID" />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="API Key" aria-label="API Key do intervals.icu" style={{ marginTop: 8 }} autoComplete="off" />
          <button className="btn btn-ink btn-sm" style={{ marginTop: 10 }} disabled={busy || key.trim().length < 10} onClick={async () => {
            setBusy(true);
            try { await saveIntervalsKey(key, athlete); setKey(''); await run(); }
            catch (e: any) { toast(e.message, undefined, 'error'); setBusy(false); }
          }}>Conectar e importar 30 dias</button>
        </>
      )}
    </section>
  );
}
