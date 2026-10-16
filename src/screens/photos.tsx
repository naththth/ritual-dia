import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { create, db, remove } from '../db/db';
import type { Photo, SkinPeriod } from '../db/types';
import { compressImage } from '../lib/image';
import { deletePhotoRemote, loadPhoto } from '../sync/sync';
import { toast } from '../state/store';
import { Sheet, useConfirm } from '../ui/ui';
import type { DateKey } from '../lib/dates';

export function PhotoThumb({ p, onClick }: { p: Photo; onClick?: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    let alive = true;
    loadPhoto(p).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [p.id, p.storagePath]);
  return (
    <button className="ph" onClick={onClick} aria-label="Ver foto">
      {url ? <img src={url} alt="" /> : <span className="tiny muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>…</span>}
    </button>
  );
}

export function PhotoStrip({ date, period, photos }: { date: DateKey; period: SkinPeriod; photos: Photo[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<Photo>();
  const [busy, setBusy] = useState(false);
  const [confirmEl, ask] = useConfirm();
  const add = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const { blob, width, height } = await compressImage(f);
      const rec = await create('photo', { date, period, width, height });
      await db.blobs.put({ id: rec.id, blob, uploaded: 0 });
      toast('Foto salva');
    } catch (e: any) {
      toast(e?.name === 'QuotaExceededError' ? 'Sem espaço no aparelho para a foto.' : 'Não foi possível salvar a foto.', undefined, 'error');
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const del = async (p: Photo) => {
    const ok = await ask({ title: 'Excluir esta foto?', text: 'Ela será apagada do aparelho e da nuvem. Não dá para desfazer.', ok: 'Excluir foto', danger: true });
    if (!ok) return;
    await deletePhotoRemote(p).catch(() => undefined);
    await remove(p.id);
    setView(undefined);
    toast('Foto excluída');
  };
  return (
    <>
      <div className="photo-strip">
        {photos.map((p) => <PhotoThumb key={p.id} p={p} onClick={() => setView(p)} />)}
        <button className="photo-add" onClick={() => input.current?.click()} disabled={busy} aria-label="Adicionar foto">
          <Camera size={24} />
        </button>
        <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={(e) => add(e.target.files?.[0])} />
      </div>
      <Sheet open={!!view} onClose={() => setView(undefined)} title="Foto" sub={view ? `${view.date}, ${view.period === 'am' ? 'manhã' : view.period === 'pm' ? 'noite' : 'corpo'}` : ''}
        footer={<button className="btn btn-danger" onClick={() => view && del(view)}><Trash2 size={18} />Excluir foto</button>}>
        {view && <FullPhoto p={view} />}
      </Sheet>
      {confirmEl}
    </>
  );
}

export function FullPhoto({ p }: { p: Photo }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    loadPhoto(p).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [p.id]);
  return url ? <img src={url} alt="Foto da pele" style={{ width: '100%', borderRadius: 16 }} /> : <p className="muted">Carregando foto…</p>;
}
