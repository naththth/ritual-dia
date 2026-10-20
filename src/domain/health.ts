// Exames, bioimpedância e prescrições: o arquivo vai para o armazenamento privado e a IA extrai o que importa.
import { supabase, useSync } from '../sync/sync';
import { create, remove } from '../db/db';
import { askAI } from './ai';
import { shrinkImage } from '../lib/image';
import { todayKey } from '../lib/dates';
import type { HealthDoc } from '../db/types';

const BUCKET = 'health-docs';
const MAX_PDF = 5 * 1024 * 1024;

async function fileToBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function addHealthDoc(file: File): Promise<HealthDoc> {
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google para enviar documentos.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf && file.size > MAX_PDF) throw new Error('PDF grande demais (máximo 5 MB). Envie só as páginas com os resultados ou fotos delas.');
  const img = isPdf ? { mime: 'application/pdf', data: await fileToBase64(file) } : await shrinkImage(file, 2000);
  // 1) guarda o original, só para ela
  const uid = useSync.getState().session!.user.id;
  const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: isPdf ? 'application/pdf' : file.type || 'image/jpeg' });
  if (error) throw new Error(`Não consegui guardar o arquivo: ${error.message}`);
  // 2) IA lê e resume
  let r: any = {};
  try { r = await askAI<any>('doc_read', { hoje: todayKey(), nome_do_arquivo: file.name }, [img]); }
  catch (e: any) { r = { titulo: file.name, resumo: `Arquivo guardado. A leitura automática falhou (${e.message}); dá para tentar de novo depois.` }; }
  const validDate = typeof r.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.data) ? r.data : todayKey();
  return create('healthdoc', {
    date: validDate, title: String(r.titulo || file.name), docType: ['bioimpedancia', 'exame_sangue', 'laudo', 'prescricao'].includes(r.tipo) ? r.tipo : 'outro',
    storagePath: path, mime: isPdf ? 'application/pdf' : file.type, fileName: file.name,
    summary: r.resumo ? String(r.resumo) : undefined,
    values: Array.isArray(r.valores) ? r.valores.slice(0, 60).map((v: any) => ({ name: String(v.nome), value: String(v.valor), unit: v.unidade ? String(v.unidade) : undefined, flag: ['baixo', 'alto', 'normal'].includes(v.situacao) ? v.situacao : undefined })) : [],
    forPlanning: r.para_planejamento ? String(r.para_planejamento) : undefined
  } as any);
}

export async function openHealthDoc(d: HealthDoc) {
  if (!supabase || !d.storagePath) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storagePath, 120);
  if (error || !data) throw new Error('Não consegui abrir o arquivo.');
  window.open(data.signedUrl, '_blank');
}

export async function deleteHealthDoc(d: HealthDoc) {
  if (supabase && d.storagePath) await supabase.storage.from(BUCKET).remove([d.storagePath]).catch(() => undefined);
  await remove(d.id);
}

/** Versão enxuta para a IA: os documentos mais recentes de cada tipo. */
export function docsForAI(docs: HealthDoc[]) {
  return [...docs].filter((d) => !d.deleted).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6).map((d) => ({
    data: d.date, tipo: d.docType, titulo: d.title, resumo: d.summary, valores: d.values?.slice(0, 30), para_planejamento: d.forPlanning
  }));
}
