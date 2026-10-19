import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, RefreshCw, LogOut, Smartphone, FileUp, Plus } from 'lucide-react';
import { PageHead, SyncDot } from './common';
import { useSettings, useDirtyCount } from '../db/hooks';
import { signInWithGoogle, signOut, supabase, syncNow, useSync } from '../sync/sync';
import { buildBackup, backupFileName, restoreBackup, validateBackup } from '../domain/backup';
import { applyImport, parseImport } from '../domain/import';
import { db, setMeta, getMeta, update } from '../db/db';
import { toast } from '../state/store';
import { Chip, useConfirm } from '../ui/ui';
import { RemindersSection, IntervalsSection } from './settings-extra';

let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

export function SettingsScreen() {
  const nav = useNavigate();
  const settings = useSettings();
  const { session, state, lastSync, error } = useSync();
  const dirty = useDirtyCount();
  const restoreInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [confirmEl, ask] = useConfirm();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<number | undefined>();
  const [newMeal, setNewMeal] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const installed = window.matchMedia?.('(display-mode: standalone)').matches;
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    getMeta<number>('lastBackup').then(setLastBackup);
  }, []);

  const exportBackup = async (withPhotos: boolean) => {
    const b = await buildBackup(withPhotos);
    const file = new File([JSON.stringify(b)], backupFileName(), { type: 'application/json' });
    await setMeta('lastBackup', Date.now());
    setLastBackup(Date.now());
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Backup do Ritual' }); return; } catch { /* cancelado: baixa o arquivo */ }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup gerado');
  };
  const doRestore = async (f?: File) => {
    if (!f) return;
    try {
      const b = validateBackup(JSON.parse(await f.text()));
      const ok = await ask({ title: 'Restaurar este backup?', text: `${b.records.length} registros de ${new Date(b.exportedAt).toLocaleString('pt-BR')}. Para cada item, fica a versão mais recente; nada mais novo é sobrescrito.`, ok: 'Restaurar' });
      if (!ok) return;
      const r = await restoreBackup(b);
      toast(`Restaurado: ${r.applied} registros aplicados${r.photos ? `, ${r.photos} fotos` : ''}`);
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível ler o backup.', undefined, 'error');
    } finally { if (restoreInput.current) restoreInput.current.value = ''; }
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      const p = parseImport(JSON.parse(await f.text()));
      const r = await applyImport(p, p.preview.tagSuggestions.map((t) => t.tag));
      toast(`${r.created} itens importados; ${r.skipped} já existiam`);
    } catch (e: any) { toast(e?.message ?? 'Arquivo inválido', undefined, 'error'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  };

  const syncLabel: Record<string, string> = { local: 'Só neste aparelho', offline: 'Sem conexão. Tudo fica salvo aqui e sobe quando voltar.', syncing: 'Sincronizando…', synced: 'Tudo sincronizado', pending: `${dirty} alterações a enviar`, error: `Erro: ${error ?? ''}` };

  return (
    <div className="screen no-nav" data-testid="settings-screen">
      <PageHead title="Ajustes" withDate={false} />

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Conta e sincronização</h2>
        <p className="small row" style={{ gap: 8 }}><SyncDot /> {session ? syncLabel[state] : 'Só neste aparelho'}</p>
        {session ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>Conectada como {session.user.email}{lastSync ? `. Última sincronização: ${new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
            <div className="row wrap">
              <button className="btn btn-ink btn-sm" onClick={() => syncNow()}><RefreshCw size={16} />Sincronizar agora</button>
              <button className="btn btn-soft btn-sm" onClick={async () => { if (await ask({ title: 'Sair da conta?', text: 'Os dados continuam neste aparelho. A sincronização para até você entrar de novo.', ok: 'Sair' })) await signOut(); }}><LogOut size={16} />Sair</button>
            </div>
          </>
        ) : supabase ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>Ao entrar, o que já está neste aparelho sobe para a sua nuvem privada.</p>
            <button className="btn btn-ink btn-sm" onClick={() => signInWithGoogle().catch((e) => toast(e.message, undefined, 'error'))}>Entrar com Google</button>
          </>
        ) : null}
      </section>

      <RemindersSection />
      <IntervalsSection />

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Backup</h2>
        <p className="small" style={{ marginTop: 4 }}>{lastBackup ? `Último backup: ${new Date(lastBackup).toLocaleDateString('pt-BR')}.` : 'Nenhum backup feito neste aparelho.'} No Android, o backup abre o compartilhamento para você salvar no Drive.</p>
        <div className="row wrap">
          <button className="btn btn-ink btn-sm" onClick={() => exportBackup(false)} data-testid="backup-export"><Download size={16} />Fazer backup</button>
          <button className="btn btn-soft btn-sm" onClick={() => exportBackup(true)}><Download size={16} />Com fotos</button>
          <button className="btn btn-soft btn-sm" onClick={() => restoreInput.current?.click()}><Upload size={16} />Restaurar</button>
        </div>
        <input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={(e) => doRestore(e.target.files?.[0])} data-testid="restore-input" />
      </section>

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Dados iniciais</h2>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className="btn btn-soft btn-sm" onClick={() => importInput.current?.click()}><FileUp size={16} />Importar arquivo de novo</button>
          <button className="btn btn-soft btn-sm" onClick={() => nav('/revisao')}>Revisar produtos</button>
        </div>
        <p className="tiny muted">Importar de novo não duplica nada: só entra o que ainda não existe.</p>
        <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
      </section>

      {settings && (
        <section className="block b-paper">
          <h2 style={{ fontSize: 20 }}>Preferências</h2>
          <span className="label">FTP no pedal (watts)</span>
          <input inputMode="numeric" defaultValue={settings.ftp ?? ''} onBlur={(e) => update<'settings'>('settings', { ftp: e.target.value ? Number(e.target.value) : undefined })} aria-label="FTP" />
          <p className="field-hint">Os treinos de pedal mostram cada bloco em watts a partir deste valor.</p>
          <span className="label">Calorias e macros</span>
          <div className="chips">
            <Chip on={settings.showNutrition !== false} onClick={() => update<'settings'>('settings', { showNutrition: true })}>Mostrar</Chip>
            <Chip on={settings.showNutrition === false} onClick={() => update<'settings'>('settings', { showNutrition: false })}>Ocultar</Chip>
          </div>
          <p className="field-hint">Sem metas próprias, o app compara o dia com o seu plano alimentar.</p>
          <div className="nutr-grid" style={{ marginTop: 8 }}>
            {([['kcal', 'Meta kcal'], ['p', 'Proteína (g)'], ['c', 'Carbo (g)'], ['f', 'Gordura (g)']] as const).map(([k, l]) => (
              <label key={k} className="nutr-cell"><span>{l}</span>
                <input inputMode="numeric" defaultValue={settings.targets?.[k] ?? ''} onBlur={(e) => update<'settings'>('settings', { targets: { ...(settings.targets ?? {}), [k]: e.target.value ? Number(e.target.value) : undefined } })} aria-label={l} />
              </label>
            ))}
          </div>
          <span className="label">Meta de água por dia (mL)</span>
          <input inputMode="numeric" defaultValue={settings.waterGoalMl ?? ''} onBlur={(e) => update<'settings'>('settings', { waterGoalMl: e.target.value ? Number(e.target.value) : undefined })} aria-label="Meta de água" />
          <span className="label">O que a IA deve saber sobre você</span>
          <textarea defaultValue={settings.aiContext ?? ''} onBlur={(e) => update<'settings'>('settings', { aiContext: e.target.value })} placeholder="Ex.: treino às 6h nos dias de semana; pele piora perto da menstruação; prefiro rotinas curtas de manhã." aria-label="Contexto para a IA" />
          <span className="label">Preparar o dia sozinho ao abrir o app</span>
          <div className="chips">
            <Chip on={settings.autoBrief !== false} onClick={() => update<'settings'>('settings', { autoBrief: true })}>Sim</Chip>
            <Chip on={settings.autoBrief === false} onClick={() => update<'settings'>('settings', { autoBrief: false })}>Só quando eu pedir</Chip>
          </div>
          <span className="label">Botões de água (mL)</span>
          <div className="chips">
            {[150, 200, 250, 300, 400, 500, 750].map((ml) => {
              const on = settings.waterPresets.includes(ml);
              return <Chip key={ml} color="honey" on={on} onClick={() => update<'settings'>('settings', { waterPresets: (on ? settings.waterPresets.filter((x) => x !== ml) : [...settings.waterPresets, ml]).sort((a, b) => a - b) })}>{ml}</Chip>;
            })}
          </div>
          <span className="label">Refeições do dia</span>
          <div className="chips" style={{ marginBottom: 8 }}>
            {settings.mealTypes.map((m) => <Chip key={m.id} on onClick={async () => { if (settings.mealTypes.length > 1 && await ask({ title: `Remover "${m.label}"?`, text: 'Registros antigos continuam guardados.', ok: 'Remover' })) update<'settings'>('settings', { mealTypes: settings.mealTypes.filter((x) => x.id !== m.id) }); }}>{m.label} <span className="x">✕</span></Chip>)}
          </div>
          <div className="row"><input value={newMeal} onChange={(e) => setNewMeal(e.target.value)} placeholder="Nova refeição, ex.: Pré-treino" aria-label="Nova refeição" />
            <button className="btn btn-soft" aria-label="Adicionar refeição" onClick={() => { const l = newMeal.trim(); if (l) { update<'settings'>('settings', { mealTypes: [...settings.mealTypes, { id: l.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'), label: l }] }); setNewMeal(''); } }}><Plus size={18} /></button></div>
          <span className="label">Responsáveis possíveis em tarefas</span>
          <div className="chips" style={{ marginBottom: 8 }}>{settings.owners.map((o) => <Chip key={o} on onClick={() => update<'settings'>('settings', { owners: settings.owners.filter((x) => x !== o) })}>{o} <span className="x">✕</span></Chip>)}</div>
          <div className="row"><input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Outro nome" aria-label="Novo responsável" />
            <button className="btn btn-soft" aria-label="Adicionar responsável" onClick={() => { const v = newOwner.trim(); if (v) { update<'settings'>('settings', { owners: [...settings.owners, v] }); setNewOwner(''); } }}><Plus size={18} /></button></div>
          {(settings.skinProfile.length > 0 || settings.foodPrefs.length > 0) && (
            <>
              <span className="label">Contexto pessoal (só para listas e filtros)</span>
              <p className="small muted" style={{ margin: 0 }}>{[...settings.skinProfile, ...settings.foodPrefs].join(', ')}</p>
            </>
          )}
        </section>
      )}

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Aparelho</h2>
        {!installed && (
          <div className="install-banner" style={{ marginTop: 8 }}>
            <Smartphone size={22} />
            <span className="grow small">Instale o Ritual na tela inicial para abrir como app e usar sem internet.</span>
            <button className="btn btn-ink btn-sm" onClick={async () => {
              if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
              else toast('No Chrome, toque no menu ⋮ e depois em "Instalar app".');
            }}>Instalar</button>
          </div>
        )}
        <p className="small" style={{ marginBottom: 0 }}>Armazenamento {persisted ? 'protegido contra limpeza automática' : 'comum (o navegador pode limpar se faltar espaço; mantenha a sincronização ou faça backups)'}.</p>
        <button className="btn btn-danger btn-sm" style={{ marginTop: 14 }} onClick={async () => {
          const ok = await ask({ title: 'Apagar os dados deste aparelho?', text: session ? 'Seus dados continuam na nuvem e voltam quando você entrar de novo. Alterações ainda não enviadas serão perdidas.' : 'Sem conta conectada, isso apaga tudo de forma definitiva. Faça um backup antes.', ok: 'Apagar daqui', danger: true });
          if (!ok) return;
          await signOut();
          await db.delete();
          location.reload();
        }}>Apagar dados deste aparelho</button>
      </section>
      <p className="tiny muted" style={{ textAlign: 'center' }}>Ritual 1.0</p>
      {confirmEl}
    </div>
  );
}
