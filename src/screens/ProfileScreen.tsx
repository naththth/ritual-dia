// Perfil e objetivos: o que a IA precisa saber para orientar alimentação, treino e pele com base em evidência.
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PageHead, useBack } from './common';
import { useSettings } from '../db/hooks';
import { update } from '../db/db';
import { toast } from '../state/store';
import { aiAvailable, aiTargets } from '../domain/ai';
import type { HealthDoc, Profile } from '../db/types';
import { useAll } from '../db/hooks';
import { uid } from '../db/db';
import { addHealthDoc, deleteHealthDoc, openHealthDoc, readHealthDoc } from '../domain/health';
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
const RESTR = ['Sem lactose', 'Sem glúten', 'Vegetariana', 'Pouco açúcar', 'Sem carne vermelha', 'Sem frutos do mar'];
const CONCERNS = ['Acne', 'Cravos', 'Textura', 'Manchas', 'Oleosidade', 'Sensibilidade', 'Rosácea', 'Linhas finas', 'Desidratação'];
const SKIN = ['Oleosa', 'Mista', 'Normal', 'Seca'];
const HAIR_TYPE = ['Liso', 'Ondulado', 'Cacheado', 'Crespo'];
const SCALP = ['Oleoso', 'Normal', 'Seco', 'Sensível'];
const HAIR_CONCERNS = ['Queda', 'Frizz', 'Quebra', 'Pontas secas', 'Oleosidade', 'Caspa', 'Volume', 'Brilho'];
const HAIR_CHEM = ['Coloração', 'Luzes ou mechas', 'Descoloração', 'Progressiva ou alisamento', 'Nenhuma'];
const BODY_CONCERNS = ['Ressecamento', 'Foliculite', 'Acne no corpo', 'Manchas', 'Estrias', 'Celulite', 'Sensibilidade', 'Atrito no treino'];
const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Escolha única em grade de botões do mesmo tamanho (alinha melhor que chips soltos). */
function Opts<T extends string | number>({ value, options, onChange, cols, label }: { value?: T; options: [T, string, string?][]; onChange: (v: T) => void; cols?: number; label: string }) {
  return (
    <div className="pf-opts" role="radiogroup" aria-label={label} style={cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}>
      {options.map(([k, l, d]) => (
        <button key={String(k)} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          <b>{l}</b>{d && <small>{d}</small>}
        </button>
      ))}
    </div>
  );
}

/** Várias escolhas na mesma grade. */
function MultiOpts({ values, options, onToggle, cols, label }: { values: string[]; options: [string, string][]; onToggle: (v: string) => void; cols?: number; label: string }) {
  return (
    <div className="pf-opts" role="group" aria-label={label} style={cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}>
      {options.map(([k, l]) => <button key={k} aria-pressed={values.includes(k)} className={values.includes(k) ? 'on' : ''} onClick={() => onToggle(k)}><b>{l}</b></button>)}
    </div>
  );
}

/** Campo numérico com a unidade dentro. */
function NumField({ label, unit, value, onChange, decimal }: { label: string; unit: string; value?: number; onChange: (v?: number) => void; decimal?: boolean }) {
  return (
    <label className="pf-num">
      <span>{label}</span>
      <span className="pf-num-box">
        <input inputMode={decimal ? 'decimal' : 'numeric'} value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() ? Number(e.target.value.replace(',', '.')) : undefined)} aria-label={label} />
        <i>{unit}</i>
      </span>
    </label>
  );
}

/** Texto que cresce com o conteúdo, para frases longas não sumirem para o lado. */
function AutoText({ value, onChange, placeholder, label }: { value?: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return <textarea ref={ref} rows={1} className="pf-text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />;
}

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
  const save = async (quiet = false) => { await update<'settings'>('settings', { profile: { ...p, updatedAt: Date.now() } }); if (!quiet) toast('Perfil salvo'); };
  const diet = p.diet ?? { restrictions: [] };
  const tr = p.training ?? {};
  const skin = p.skin ?? { concerns: [] };
  const health = p.health ?? { professionals: [], meds: [] };
  const hair = p.hair ?? {};
  const body = p.body ?? {};
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
      <p className="small pf-lead">É a base que a IA usa para montar alimentação, treino e pele. Responda o que quiser; o que faltar ela avisa. O que suas profissionais (nutricionista, treinador, dermatologista) definirem sempre prevalece.</p>

      <section className="block b-paper pf">
        <h2>Corpo</h2>
        <div className="pf-grid">
          <NumField label="Altura" unit="cm" value={p.heightCm} onChange={(v) => set({ heightCm: v })} />
          <NumField label="Peso" unit="kg" value={p.weightKg} onChange={(v) => set({ weightKg: v })} decimal />
          <NumField label="Ano de nascimento" unit="" value={p.birthYear} onChange={(v) => set({ birthYear: v })} />
          <NumField label="Gordura, se souber" unit="%" value={p.bodyFatPct} onChange={(v) => set({ bodyFatPct: v })} decimal />
        </div>
        <span className="label">Sexo biológico <span className="muted small">(para o cálculo de gasto)</span></span>
        <Opts label="Sexo biológico" value={p.sex} onChange={(v) => set({ sex: v })} options={[['F', 'Feminino'], ['M', 'Masculino']]} cols={2} />
        <span className="label">Atividade fora dos treinos</span>
        <Opts label="Atividade fora dos treinos" value={p.activity} onChange={(v) => set({ activity: v })} cols={1}
          options={[['sedentario', 'Sentada a maior parte', 'escritório, home office'], ['leve', 'Leve', 'algumas caminhadas no dia'], ['moderado', 'Moderada', 'muito em pé ou andando'], ['alto', 'Alta', 'trabalho físico'], ['muito_alto', 'Muito alta', 'trabalho físico pesado']]} />
      </section>

      <section className="block b-paper pf">
        <h2>Objetivo</h2>
        <Opts label="Objetivo" value={p.goal} onChange={(v) => set({ goal: v })} cols={1} options={GOALS.map(([k, l, d]) => [k, l, d])} />
        {(p.goal === 'perder_gordura' || p.goal === 'recomposicao' || p.goal === 'ganhar_massa') && (
          <>
            <span className="label">Ritmo</span>
            <Opts label="Ritmo" value={p.pace === 'moderado' ? 'moderado' : 'leve'} onChange={(v) => set({ pace: v as any })} cols={2}
              options={[['leve', 'Leve', 'preserva o treino'], ['moderado', 'Moderado', 'resultado mais rápido']]} />
          </>
        )}
        <span className="label">Prova ou marco <span className="muted small">(opcional)</span></span>
        <AutoText label="Prova ou marco" value={p.event} onChange={(v) => set({ event: v })} placeholder="Ex.: triathlon sprint em março" />
      </section>

      <section className="block b-honey pf">
        <h2>Alimentação</h2>
        <span className="label">Restrições</span>
        <MultiOpts label="Restrições" values={diet.restrictions} onToggle={(r) => set({ diet: { ...diet, restrictions: toggleIn(diet.restrictions, r) } })} cols={2} options={RESTR.map((r) => [r, r])} />
        <span className="label">Gosta</span>
        <AutoText label="Alimentos que gosta" value={diet.likes} onChange={(v) => set({ diet: { ...diet, likes: v } })} placeholder="Ovos, iogurte, frutas…" />
        <span className="label">Não gosta</span>
        <AutoText label="Alimentos que não gosta" value={diet.dislikes} onChange={(v) => set({ diet: { ...diet, dislikes: v } })} placeholder="O que prefere evitar" />
        <span className="label">Refeições por dia</span>
        <Opts label="Refeições por dia" value={diet.mealsPerDay} onChange={(n) => set({ diet: { ...diet, mealsPerDay: n } })} cols={4} options={[3, 4, 5, 6].map((n) => [n, String(n)] as [number, string])} />
        <span className="label">Acompanhamento</span>
        <MultiOpts label="Acompanhamento na alimentação" values={diet.followsNutritionist ? ['n'] : []} onToggle={() => set({ diet: { ...diet, followsNutritionist: !diet.followsNutritionist } })} cols={1} options={[['n', 'Tenho nutricionista']]} />
      </section>

      <section className="block b-blue pf">
        <h2>Treino</h2>
        <span className="label">Dias disponíveis</span>
        <MultiOpts label="Dias disponíveis" values={(tr.daysAvailable ?? []).map(String)} onToggle={(d) => set({ training: { ...tr, daysAvailable: toggleIn((tr.daysAvailable ?? []).map(String), d).map(Number).sort() } })} cols={7} options={[1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), DAYS[d]])} />
        <span className="label">Tempo por sessão</span>
        <Opts label="Tempo por sessão" value={tr.minutesPerSession} onChange={(m) => set({ training: { ...tr, minutesPerSession: m } })} cols={4} options={[30, 45, 60, 90].map((m) => [m, `${m} min`] as [number, string])} />
        <span className="label">Equipamento</span>
        <AutoText label="Equipamento" value={tr.equipment} onChange={(v) => set({ training: { ...tr, equipment: v } })} placeholder="Academia completa, rolo com potência…" />
        <span className="label">Dores ou limitações</span>
        <AutoText label="Limitações" value={tr.limitations} onChange={(v) => set({ training: { ...tr, limitations: v } })} placeholder="O que a IA deve respeitar" />
      </section>

      <section className="block b-rose pf">
        <h2>Pele</h2>
        <span className="label">Tipo</span>
        <Opts label="Tipo de pele" value={skin.type} onChange={(t) => set({ skin: { ...skin, type: t } })} cols={4} options={SKIN.map((t) => [t, t] as [string, string])} />
        <span className="label">Queixas</span>
        <MultiOpts label="Queixas" values={skin.concerns} onToggle={(c) => set({ skin: { ...skin, concerns: toggleIn(skin.concerns, c) } })} cols={3} options={CONCERNS.map((c) => [c, c])} />
        <span className="label">Acompanhamento</span>
        <MultiOpts label="Acompanhamento da pele" values={[skin.followsDerm ? 'd' : '', skin.sensitive ? 's' : ''].filter(Boolean)} cols={2}
          onToggle={(k) => set({ skin: k === 'd' ? { ...skin, followsDerm: !skin.followsDerm } : { ...skin, sensitive: !skin.sensitive } })} options={[['d', 'Tenho dermatologista'], ['s', 'Pele sensível']]} />
        <span className="label">Prescrição da dermatologista <span className="muted small">(opcional)</span></span>
        <AutoText label="Prescrições da dermatologista" value={skin.prescriptions} onChange={(v) => set({ skin: { ...skin, prescriptions: v } })} placeholder="O que ela prescreveu e como usar" />
      </section>

      <section className="block b-rose pf" data-testid="profile-hair">
        <h2>Cabelo</h2>
        <span className="label">Tipo de fio</span>
        <Opts label="Tipo de fio" value={hair.type} onChange={(t) => set({ hair: { ...hair, type: t } })} cols={4} options={HAIR_TYPE.map((t) => [t, t] as [string, string])} />
        <span className="label">Couro cabeludo</span>
        <Opts label="Couro cabeludo" value={hair.scalp} onChange={(t) => set({ hair: { ...hair, scalp: t } })} cols={4} options={SCALP.map((t) => [t, t] as [string, string])} />
        <span className="label">Queixas</span>
        <MultiOpts label="Queixas do cabelo" values={hair.concerns ?? []} onToggle={(c) => set({ hair: { ...hair, concerns: toggleIn(hair.concerns, c) } })} cols={2} options={HAIR_CONCERNS.map((c) => [c, c])} />
        <span className="label">Química</span>
        <MultiOpts label="Química no cabelo" values={hair.chemical ?? []} onToggle={(c) => set({ hair: { ...hair, chemical: c === 'Nenhuma' ? ['Nenhuma'] : toggleIn((hair.chemical ?? []).filter((x) => x !== 'Nenhuma'), c) } })} cols={2} options={HAIR_CHEM.map((c) => [c, c])} />
        <span className="label">Lavagens por semana</span>
        <Opts label="Lavagens por semana" value={hair.washesPerWeek} onChange={(n) => set({ hair: { ...hair, washesPerWeek: n } })} cols={4} options={[2, 3, 4, 5, 6, 7].map((n) => [n, n === 7 ? 'Todo dia' : String(n)] as [number, string])} />
        <span className="label">Observações <span className="muted small">(opcional)</span></span>
        <AutoText label="Observações sobre o cabelo" value={hair.notes} onChange={(v) => set({ hair: { ...hair, notes: v } })} placeholder="Ex.: lavo depois do treino; tricologista indicou tônico" />
      </section>

      <section className="block b-paper pf" data-testid="profile-body">
        <h2>Corpo</h2>
        <span className="label">Queixas</span>
        <MultiOpts label="Queixas do corpo" values={body.concerns ?? []} onToggle={(c) => set({ body: { ...body, concerns: toggleIn(body.concerns, c) } })} cols={2} options={BODY_CONCERNS.map((c) => [c, c])} />
        <span className="label">Observações <span className="muted small">(opcional)</span></span>
        <AutoText label="Observações sobre o corpo" value={body.notes} onChange={(v) => set({ body: { ...body, notes: v } })} placeholder="Ex.: natação deixa a pele ressecada" />
      </section>

      <HealthSection health={health} onChange={(h) => set({ health: h })} />

      <button className="btn btn-ink btn-block" onClick={() => save()} data-testid="profile-save">Salvar perfil</button>

      <section className="block b-paper pf" style={{ marginTop: 16 }} data-testid="targets-ai">
        <h2>Metas de calorias e macros</h2>
        <p className="small pf-intro">A IA calcula a partir do seu perfil, dos treinos reais e do plano da nutricionista, com os métodos usados em nutrição esportiva, e mostra a conta.</p>
        <button className="btn btn-wine btn-block" style={{ marginTop: 14 }} disabled={busy || !aiAvailable()} onClick={calc} data-testid="targets-calc"><Sparkles size={18} />{busy ? 'Calculando…' : 'Calcular minhas metas'}</button>
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
      for (const f of Array.from(files)) { const d = await addHealthDoc(f); toast(`${f.name} guardado. A IA está lendo; pode continuar usando o app.`); setOpen(d.id); }
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  // Documentos enviados antes da leitura em segundo plano guardavam a falha no resumo.
  const failed = (d: HealthDoc) => !!d.readError || !!d.summary?.startsWith('Arquivo guardado. A leitura automática falhou');
  const list = [...(docs ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <section className="block b-paper pf" data-testid="health">
      <h2>Saúde e acompanhamento</h2>
      <p className="small pf-intro">Fica só na sua conta. A IA usa para ajustar calorias, macros, treino e pele ao seu momento, sem mexer no que seus médicos definiram.</p>
      <span className="label">Quem te acompanha</span>
      <MultiOpts label="Quem te acompanha" values={health.professionals} onToggle={toggle} cols={2} options={PROS.map((x) => [x, x])} />

      <span className="label">Medicamentos em uso</span>
      {health.meds.map((m) => (
        <div key={m.id} className="plate-row" style={{ minHeight: 48 }}>
          <span className="grow"><b>{m.name}</b>{m.dose || m.schedule ? <span className="small muted"> · {[m.dose, m.schedule].filter(Boolean).join(' · ')}</span> : null}</span>
          <button className="icon-btn" aria-label={`Remover ${m.name}`} onClick={() => onChange({ ...health, meds: health.meds.filter((x) => x.id !== m.id) })}><Trash2 size={17} /></button>
        </div>
      ))}
      <div className="pf-med">
        <input value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} placeholder="Nome (ex.: Mounjaro)" aria-label="Nome do medicamento" className="pf-med-name" />
        <input value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} placeholder="Dose prescrita" aria-label="Dose" />
        <input value={med.schedule} onChange={(e) => setMed({ ...med, schedule: e.target.value })} placeholder="Quando" aria-label="Quando" />
        <button className="btn btn-soft pf-med-add" aria-label="Adicionar medicamento" onClick={() => { if (!med.name.trim()) return; onChange({ ...health, meds: [...health.meds, { id: uid(), name: med.name.trim(), dose: med.dose.trim() || undefined, schedule: med.schedule.trim() || undefined }] }); setMed({ name: '', dose: '', schedule: '' }); }}><Plus size={18} />Adicionar medicamento</button>
      </div>
      <p className="field-hint">A IA nunca sugere mudar dose: isso é com seu médico. Ela usa a informação para ajustar o resto (por exemplo, proteína e treino de força para preservar massa magra).</p>
      <textarea value={health.notes ?? ''} onChange={(e) => onChange({ ...health, notes: e.target.value })} placeholder="Orientações do médico que a IA deve respeitar (opcional)" aria-label="Orientações médicas" className="pf-text" style={{ minHeight: 76, marginTop: 6, resize: 'vertical' }} />

      <span className="label">Exames e documentos</span>
      <button className="btn btn-wine btn-block" disabled={busy || !aiAvailable()} onClick={() => fileRef.current?.click()} data-testid="doc-upload"><FileUp size={18} />{busy ? 'Enviando…' : 'Enviar exame ou laudo'}</button>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => send(e.target.files)} />
      <p className="field-hint">Bioimpedância, exame de sangue ou laudo, em PDF (até 12 MB) ou foto. O arquivo fica guardado só para você; a IA tira os valores e o que importa para o seu plano.</p>
      {list.map((d) => (
        <div key={d.id} className="doc-row">
          <button className="tap" onClick={() => setOpen(open === d.id ? null : d.id)} style={{ width: '100%', textAlign: 'left' }}>
            <div className="plate-name">{d.title}</div>
            <div className="plate-sub">{d.reading ? 'Lendo com a IA…' : failed(d) ? 'Leitura não concluída' : `${DOC_LABEL[d.docType]} · ${shortLabel(d.date)}`}</div>
          </button>
          {open === d.id && (
            <div style={{ marginTop: 8 }}>
              {d.readError && !d.reading && <p className="small" style={{ marginTop: 0 }}>O arquivo está guardado, mas a leitura não terminou ({d.readError}).</p>}
              {d.summary && !failed(d) && <p className="small" style={{ whiteSpace: 'pre-line', marginTop: 0 }}>{d.summary}</p>}
              {!d.readError && failed(d) && <p className="small" style={{ marginTop: 0 }}>O arquivo está guardado, mas a leitura não terminou. Toque em "Ler de novo".</p>}
              {d.values && d.values.length > 0 && (
                <div className="doc-values">{d.values.map((v, i) => <span key={i} className={v.flag && v.flag !== 'normal' ? 'flag' : ''}><b>{v.name}</b> {v.value}{v.unit ? ` ${v.unit}` : ''}{v.flag && v.flag !== 'normal' ? ` (${v.flag})` : ''}</span>)}</div>
              )}
              {d.forPlanning && <p className="small" style={{ whiteSpace: 'pre-line' }}><b>Para o seu plano.</b> {d.forPlanning}</p>}
              <div className="row wrap" style={{ gap: 8 }}>
                {d.storagePath && !d.reading && (failed(d) || !d.summary) && <button className="btn btn-wine btn-sm" onClick={() => readHealthDoc(d)} data-testid="doc-reread"><Sparkles size={15} />Ler de novo</button>}
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
