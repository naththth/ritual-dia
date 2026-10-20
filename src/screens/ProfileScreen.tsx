// Perfil e objetivos: o que a IA precisa saber para orientar alimentação, treino e pele com base em evidência.
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PageHead, useBack } from './common';
import { useSettings } from '../db/hooks';
import { update } from '../db/db';
import { Chip } from '../ui/ui';
import { toast } from '../state/store';
import { aiAvailable, aiTargets } from '../domain/ai';
import type { HealthDoc, Profile } from '../db/types';
import { useAll } from '../db/hooks';
import { uid } from '../db/db';
import { addHealthDoc, deleteHealthDoc, openHealthDoc } from '../domain/health';
import { useRef } from 'react';
import { FileUp, Trash2, ExternalLink, Plus } from 'lucide-react';
import { shortLabel } from '../lib/dates';

const GOALS: [NonNullable<Profile['goal']>, string, string][] = [
  ['perder_gordura', 'Perder gordura', 'déficit calórico, proteína alta'],
  ['recomposicao', 'Recomposição', 'perder gordura e ganhar músculo'],
  ['ganhar_massa', 'Ganhar massa', 'superávit leve'],
  ['performance', 'Performance', 'render melhor nos treinos e provas'],
  ['manter', 'Manter', 'equilíbrio e constância']
];
const ACTIVITY: [NonNullable<Profile['activity']>, string][] = [['sedentario', 'Sentada a maior parte'], ['leve', 'Leve'], ['moderado', 'Moderada'], ['alto', 'Alta'], ['muito_alto', 'Muito alta']];
const RESTR = ['Sem lactose', 'Sem glúten', 'Vegetariana', 'Pouco açúcar', 'Sem carne vermelha', 'Sem frutos do mar'];
const CONCERNS = ['Acne', 'Cravos', 'Textura', 'Manchas', 'Oleosidade', 'Sensibilidade', 'Rosácea', 'Linhas finas', 'Desidratação'];
const SKIN = ['Oleosa', 'Mista', 'Normal', 'Seca'];
const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function ProfileScreen() {
  const settings = useSettings();
  const back = useBack();
  const [p, setP] = useState<Profile>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  useEffect(() => { if (settings && !loaded) { setP(settings.profile ?? {}); setLoaded(true); } }, [settings, loaded]);
  // salva sozinho enquanto ela preenche
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { update<'settings'>('settings', { profile: { ...p, updatedAt: Date.now() } }); }, 900);
    return () => clearTimeout(t);
  }, [p, loaded]);
  if (!settings) return null;
  const set = (x: Partial<Profile>) => setP((o) => ({ ...o, ...x }));
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : undefined);
  const save = async (quiet = false) => { await update<'settings'>('settings', { profile: { ...p, updatedAt: Date.now() } }); if (!quiet) toast('Perfil salvo'); };
  const diet = p.diet ?? { restrictions: [] };
  const tr = p.training ?? {};
  const skin = p.skin ?? { concerns: [] };
  const health = p.health ?? { professionals: [], meds: [] };
  const toggleIn = (arr: string[] = [], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const calc = async () => {
    setBusy(true);
    try { await save(true); setRes(await aiTargets()); } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  const apply = async () => {
    await update<'settings'>('settings', { targets: { kcal: res.kcal, p: res.proteina_g, c: res.carbo_g, f: res.gordura_g }, waterGoalMl: res.agua_ml ?? settings.waterGoalMl, targetsNote: res.metodo });
    toast('Metas aplicadas');
    back();
  };

  return (
    <div className="screen no-nav" data-testid="profile-screen">
      <PageHead title="Perfil e objetivos" withDate={false} />
      <p className="small" style={{ marginTop: 0 }}>É a base que a IA usa para montar alimentação, treino e pele. Responda o que quiser; o que faltar ela avisa. O que suas profissionais (nutricionista, treinador, dermatologista) definirem sempre prevalece.</p>

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Corpo</h2>
        <div className="nutr-grid">
          <label className="nutr-cell"><span>Altura (cm)</span><input inputMode="numeric" value={p.heightCm ?? ''} onChange={(e) => set({ heightCm: num(e.target.value) })} aria-label="Altura" /></label>
          <label className="nutr-cell"><span>Peso (kg)</span><input inputMode="decimal" value={p.weightKg ?? ''} onChange={(e) => set({ weightKg: num(e.target.value) })} aria-label="Peso" /></label>
          <label className="nutr-cell"><span>Ano de nascimento</span><input inputMode="numeric" value={p.birthYear ?? ''} onChange={(e) => set({ birthYear: num(e.target.value) })} aria-label="Ano de nascimento" /></label>
          <label className="nutr-cell"><span>% de gordura (se souber)</span><input inputMode="decimal" value={p.bodyFatPct ?? ''} onChange={(e) => set({ bodyFatPct: num(e.target.value) })} aria-label="Percentual de gordura" /></label>
        </div>
        <span className="label">Sexo biológico (para o cálculo de gasto)</span>
        <div className="chips"><Chip on={p.sex === 'F'} onClick={() => set({ sex: 'F' })}>Feminino</Chip><Chip on={p.sex === 'M'} onClick={() => set({ sex: 'M' })}>Masculino</Chip></div>
        <span className="label">Atividade fora dos treinos</span>
        <div className="chips">{ACTIVITY.map(([k, l]) => <Chip key={k} on={p.activity === k} onClick={() => set({ activity: k })}>{l}</Chip>)}</div>
      </section>

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Objetivo</h2>
        {GOALS.map(([k, l, d]) => (
          <button key={k} className={`goal-opt ${p.goal === k ? 'on' : ''}`} onClick={() => set({ goal: k })}><b>{l}</b><span className="small">{d}</span></button>
        ))}
        {(p.goal === 'perder_gordura' || p.goal === 'recomposicao' || p.goal === 'ganhar_massa') && (
          <>
            <span className="label">Ritmo</span>
            <div className="chips"><Chip on={p.pace !== 'moderado'} onClick={() => set({ pace: 'leve' })}>Leve, preservando treino</Chip><Chip on={p.pace === 'moderado'} onClick={() => set({ pace: 'moderado' })}>Moderado</Chip></div>
          </>
        )}
        <span className="label">Prova ou marco (opcional)</span>
        <input value={p.event ?? ''} onChange={(e) => set({ event: e.target.value })} placeholder="Ex.: triathlon sprint em março" aria-label="Prova ou marco" />
      </section>

      <section className="block b-honey">
        <h2 style={{ fontSize: 20 }}>Alimentação</h2>
        <span className="label" style={{ marginTop: 0 }}>Restrições</span>
        <div className="chips">{RESTR.map((r) => <Chip key={r} on={diet.restrictions.includes(r)} onClick={() => set({ diet: { ...diet, restrictions: toggleIn(diet.restrictions, r) } })}>{r}</Chip>)}</div>
        <span className="label">Gosta / não gosta</span>
        <input value={diet.likes ?? ''} onChange={(e) => set({ diet: { ...diet, likes: e.target.value } })} placeholder="Gosta de: ovos, iogurte, frutas…" aria-label="Alimentos que gosta" />
        <input value={diet.dislikes ?? ''} onChange={(e) => set({ diet: { ...diet, dislikes: e.target.value } })} placeholder="Não gosta de: …" aria-label="Alimentos que não gosta" style={{ marginTop: 8 }} />
        <span className="label">Refeições por dia</span>
        <div className="chips">{[3, 4, 5, 6].map((n) => <Chip key={n} on={diet.mealsPerDay === n} onClick={() => set({ diet: { ...diet, mealsPerDay: n } })}>{n}</Chip>)}</div>
        <span className="label">Acompanhamento</span>
        <div className="chips"><Chip on={!!diet.followsNutritionist} onClick={() => set({ diet: { ...diet, followsNutritionist: !diet.followsNutritionist } })}>Tenho nutricionista</Chip></div>
      </section>

      <section className="block b-blue">
        <h2 style={{ fontSize: 20 }}>Treino</h2>
        <span className="label" style={{ marginTop: 0 }}>Dias disponíveis</span>
        <div className="chips">{[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} on={(tr.daysAvailable ?? []).includes(d)} onClick={() => set({ training: { ...tr, daysAvailable: (toggleIn((tr.daysAvailable ?? []).map(String), String(d))).map(Number).sort() } })}>{DAYS[d]}</Chip>)}</div>
        <span className="label">Tempo por sessão</span>
        <div className="chips">{[30, 45, 60, 90].map((m) => <Chip key={m} on={tr.minutesPerSession === m} onClick={() => set({ training: { ...tr, minutesPerSession: m } })}>{m} min</Chip>)}</div>
        <span className="label">Equipamento e limitações</span>
        <input value={tr.equipment ?? ''} onChange={(e) => set({ training: { ...tr, equipment: e.target.value } })} placeholder="Academia completa, rolo com potência…" aria-label="Equipamento" />
        <input value={tr.limitations ?? ''} onChange={(e) => set({ training: { ...tr, limitations: e.target.value } })} placeholder="Dores ou limitações a respeitar" aria-label="Limitações" style={{ marginTop: 8 }} />
      </section>

      <section className="block b-rose">
        <h2 style={{ fontSize: 20 }}>Pele</h2>
        <span className="label" style={{ marginTop: 0 }}>Tipo</span>
        <div className="chips">{SKIN.map((t) => <Chip key={t} on={skin.type === t} onClick={() => set({ skin: { ...skin, type: t } })}>{t}</Chip>)}</div>
        <span className="label">Queixas</span>
        <div className="chips">{CONCERNS.map((c) => <Chip key={c} on={skin.concerns.includes(c)} onClick={() => set({ skin: { ...skin, concerns: toggleIn(skin.concerns, c) } })}>{c}</Chip>)}</div>
        <span className="label">Acompanhamento</span>
        <div className="chips"><Chip on={!!skin.followsDerm} onClick={() => set({ skin: { ...skin, followsDerm: !skin.followsDerm } })}>Tenho dermatologista</Chip><Chip on={!!skin.sensitive} onClick={() => set({ skin: { ...skin, sensitive: !skin.sensitive } })}>Pele sensível</Chip></div>
        <input value={skin.prescriptions ?? ''} onChange={(e) => set({ skin: { ...skin, prescriptions: e.target.value } })} placeholder="O que a dermatologista prescreveu (opcional)" aria-label="Prescrições da dermatologista" style={{ marginTop: 8 }} />
      </section>

      <HealthSection health={health} onChange={(h) => set({ health: h })} />

      <button className="btn btn-ink btn-block" onClick={() => save()} data-testid="profile-save">Salvar perfil</button>

      <section className="block b-paper" style={{ marginTop: 16 }} data-testid="targets-ai">
        <h2 style={{ fontSize: 20 }}>Metas de calorias e macros</h2>
        <p className="small" style={{ marginTop: 4 }}>A IA calcula a partir do seu perfil, dos treinos reais e do plano da nutricionista, com os métodos usados em nutrição esportiva, e mostra a conta.</p>
        <button className="btn btn-wine btn-block" disabled={busy || !aiAvailable()} onClick={calc} data-testid="targets-calc"><Sparkles size={18} />{busy ? 'Calculando…' : 'Calcular minhas metas'}</button>
        {res && (
          <div style={{ marginTop: 12 }} data-testid="targets-result">
            {res.kcal == null ? <p className="small"><b>Falta para calcular:</b> {res.falta || 'peso, altura, idade e sexo'}.</p> : <>
            <div className="macro-row"><span><b className="num">{res.kcal}</b>kcal</span><span>P {res.proteina_g} g</span><span>C {res.carbo_g} g</span><span>G {res.gordura_g} g</span>{res.agua_ml ? <span>Água {res.agua_ml / 1000} L</span> : null}</div>
            {res.dia_de_treino_forte && <p className="small" style={{ margin: '6px 0 0' }}><b>Dias de treino forte:</b> {res.dia_de_treino_forte}</p>}
            <p className="small" style={{ whiteSpace: 'pre-line' }}><b>Como chegou nisso.</b> {res.metodo}</p>
            {res.observacoes && <p className="small" style={{ whiteSpace: 'pre-line' }}>{res.observacoes}</p>}
            {res.falta && <p className="small muted">Para afinar: {res.falta}</p>}
            <button className="btn btn-ink btn-block" onClick={apply} data-testid="targets-apply">Usar essas metas</button>
            </>}
          </div>
        )}
        {settings.targetsNote && !res && <p className="small muted" style={{ marginBottom: 0 }}>Metas atuais: {settings.targets?.kcal ?? '–'} kcal. {settings.targetsNote}</p>}
      </section>
    </div>
  );
}

const PROS = ['Endocrinologista', 'Nutricionista', 'Dermatologista', 'Treinador ou assessoria', 'Médico do esporte', 'Fisioterapeuta'];
const DOC_LABEL: Record<HealthDoc['docType'], string> = { bioimpedancia: 'Bioimpedância', exame_sangue: 'Exame de sangue', laudo: 'Laudo', prescricao: 'Prescrição', outro: 'Documento' };

/** Saúde e acompanhamento: profissionais, medicamentos em uso e documentos (exames, bioimpedância, prescrições). */
function HealthSection({ health, onChange }: { health: NonNullable<Profile['health']>; onChange: (h: NonNullable<Profile['health']>) => void }) {
  const docs = useAll('healthdoc');
  const [med, setMed] = useState({ name: '', dose: '', schedule: '' });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (v: string) => onChange({ ...health, professionals: health.professionals.includes(v) ? health.professionals.filter((x) => x !== v) : [...health.professionals, v] });
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) { const d = await addHealthDoc(f); toast(`${d.title} guardado e lido`); setOpen(d.id); }
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const list = [...(docs ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <section className="block b-paper" data-testid="health">
      <h2 style={{ fontSize: 20 }}>Saúde e acompanhamento</h2>
      <p className="small" style={{ marginTop: 4 }}>Fica só na sua conta. A IA usa para ajustar calorias, macros, treino e pele ao seu momento, sem mexer no que seus médicos definiram.</p>
      <span className="label">Quem te acompanha</span>
      <div className="chips">{PROS.map((x) => <Chip key={x} on={health.professionals.includes(x)} onClick={() => toggle(x)}>{x}</Chip>)}</div>

      <span className="label">Medicamentos em uso</span>
      {health.meds.map((m) => (
        <div key={m.id} className="plate-row" style={{ minHeight: 48 }}>
          <span className="grow"><b>{m.name}</b>{m.dose || m.schedule ? <span className="small muted"> · {[m.dose, m.schedule].filter(Boolean).join(' · ')}</span> : null}</span>
          <button className="icon-btn" aria-label={`Remover ${m.name}`} onClick={() => onChange({ ...health, meds: health.meds.filter((x) => x.id !== m.id) })}><Trash2 size={17} /></button>
        </div>
      ))}
      <input value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} placeholder="Nome (ex.: Mounjaro)" aria-label="Nome do medicamento" />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} placeholder="Dose (como prescrito)" aria-label="Dose" />
        <input value={med.schedule} onChange={(e) => setMed({ ...med, schedule: e.target.value })} placeholder="Quando (ex.: domingo)" aria-label="Quando" />
        <button className="btn btn-soft" aria-label="Adicionar medicamento" onClick={() => { if (!med.name.trim()) return; onChange({ ...health, meds: [...health.meds, { id: uid(), name: med.name.trim(), dose: med.dose.trim() || undefined, schedule: med.schedule.trim() || undefined }] }); setMed({ name: '', dose: '', schedule: '' }); }}><Plus size={18} /></button>
      </div>
      <p className="field-hint">A IA nunca sugere mudar dose: isso é com seu médico. Ela usa a informação para ajustar o resto (por exemplo, proteína e treino de força para preservar massa magra).</p>
      <textarea value={health.notes ?? ''} onChange={(e) => onChange({ ...health, notes: e.target.value })} placeholder="Orientações do médico que a IA deve respeitar (opcional)" aria-label="Orientações médicas" style={{ minHeight: 70, marginTop: 6 }} />

      <span className="label">Exames e documentos</span>
      <button className="btn btn-wine btn-block" disabled={busy || !aiAvailable()} onClick={() => fileRef.current?.click()} data-testid="doc-upload"><FileUp size={18} />{busy ? 'Guardando e lendo…' : 'Enviar exame, bioimpedância ou laudo'}</button>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => send(e.target.files)} />
      <p className="field-hint">PDF (até 5 MB) ou foto. O arquivo fica guardado só para você; a IA tira os valores e o que importa para o seu plano.</p>
      {list.map((d) => (
        <div key={d.id} className="doc-row">
          <button className="tap" onClick={() => setOpen(open === d.id ? null : d.id)} style={{ width: '100%', textAlign: 'left' }}>
            <div className="plate-name">{d.title}</div>
            <div className="plate-sub">{DOC_LABEL[d.docType]} · {shortLabel(d.date)}</div>
          </button>
          {open === d.id && (
            <div style={{ marginTop: 8 }}>
              {d.summary && <p className="small" style={{ whiteSpace: 'pre-line', marginTop: 0 }}>{d.summary}</p>}
              {d.values && d.values.length > 0 && (
                <div className="doc-values">{d.values.map((v, i) => <span key={i} className={v.flag && v.flag !== 'normal' ? 'flag' : ''}><b>{v.name}</b> {v.value}{v.unit ? ` ${v.unit}` : ''}{v.flag && v.flag !== 'normal' ? ` (${v.flag})` : ''}</span>)}</div>
              )}
              {d.forPlanning && <p className="small" style={{ whiteSpace: 'pre-line' }}><b>Para o seu plano.</b> {d.forPlanning}</p>}
              <div className="row" style={{ gap: 8 }}>
                {d.storagePath && <button className="btn btn-soft btn-sm" onClick={() => openHealthDoc(d).catch((e) => toast(e.message, undefined, 'error'))}><ExternalLink size={15} />Abrir arquivo</button>}
                <button className="btn btn-soft btn-sm" onClick={async () => { await deleteHealthDoc(d); toast('Documento apagado'); }}><Trash2 size={15} />Apagar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
