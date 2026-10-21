// Escolha da origem da foto: câmera ou galeria. Com capture, o Android abre só a câmera; por isso são dois campos.
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon } from 'lucide-react';

export function usePhotoPicker({ onFiles, multiple, facing = 'environment', testId }: {
  onFiles: (files: FileList) => void; multiple?: boolean; facing?: 'environment' | 'user'; testId?: string;
}): { open: () => void; el: ReactNode } {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState(false);
  const pick = (r: React.RefObject<HTMLInputElement>) => { setShow(false); r.current?.click(); };
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (fs?.length) onFiles(fs);
    e.target.value = '';
  };
  const el = (
    <>
      <input ref={cam} type="file" accept="image/*" capture={facing} multiple={multiple} hidden onChange={handle} />
      <input ref={gal} type="file" accept="image/*" multiple={multiple} hidden onChange={handle} data-testid={testId} />
      {show && createPortal(
        <>
          <div className="scrim" style={{ zIndex: 90 }} onClick={() => setShow(false)} />
          <div className="pp-menu" role="menu" aria-label="Origem da foto" data-testid="photo-source">
            <button role="menuitem" onClick={() => pick(cam)}><Camera size={20} />Tirar foto</button>
            <button role="menuitem" onClick={() => pick(gal)} data-testid="photo-gallery"><ImageIcon size={20} />Escolher da galeria</button>
            <button role="menuitem" className="pp-cancel" onClick={() => setShow(false)}>Cancelar</button>
          </div>
        </>, document.body)}
    </>
  );
  return { open: () => setShow(true), el };
}
