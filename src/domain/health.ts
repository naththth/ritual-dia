// Exames, bioimpedância e prescrições: o arquivo vai para o armazenamento privado e a IA extrai o que importa.
import { supabase, useSync } from '../sync/sync';
import { create, remove, update } from '../db/db';
import { askAI } from './ai';
import { toast } from '../state/store';
import { shrinkImage } from '../lib/image';
import { todayKey } from '../lib/dates';
import type { HealthDoc } from '../db/types';

const BUCKET = 'health-docs';
const MAX_PDF = 12 * 1024 * 1024;


/** Guarda o arquivo e cria o registro na hora; a leitura pela IA segue em segundo plano. */
export async function addHealthDoc(file: File): Promise<HealthDoc> {
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google para enviar documentos.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf && file.size > MAX_PDF) throw new Error('PDF grande demais (máximo 12 MB). Envie só as páginas com os resultados ou fotos delas.');
  // Fotos vão reduzidas (leitura igual, envio bem mais rápido); PDF vai como está.
  let blob: Blob = file;
  let mime = isPdf ? 'application/pdf' : 'image/jpeg';
  if (!isPdf) {
    const s = await shrinkImage(file, 2000);
    blob = await (await fetch(`data:${s.mime};base64,${s.data}`)).blob();
    mime = s.mime;
  }
  const uid = useSync.getState().session!.user.id;
  const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime });
  if (error) throw new Error(`Não consegui guardar o arquivo: ${error.message}`);
  const doc = await create('healthdoc', {
    date: todayKey(), title: file.name, docType: 'outro', storagePath: path, mime, fileName: file.name, values: [], reading: true
  } as any) as HealthDoc;
  void readHealthDoc(doc);
  return doc;
}

/** A IA lê o arquivo direto do armazenamento (nada de arquivo pesado na requisição) e preenche o registro. */
export async function readHealthDoc(doc: HealthDoc) {
  await update<'healthdoc'>(doc.id, { reading: true, readError: undefined, summary: doc.summary?.startsWith('Arquivo guardado. A leitura') ? undefined : doc.summary } as any);
  try {
    const r = await askAI<any>('doc_read', { hoje: todayKey(), nome_do_arquivo: doc.fileName }, undefined, [{ bucket: BUCKET, path: doc.storagePath!, mime: doc.mime || 'application/pdf' }]);
    const validDate = typeof r.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.data) ? r.data : doc.date;
    await update<'healthdoc'>(doc.id, {
      date: validDate, title: String(r.titulo || doc.fileName), docType: ['bioimpedancia', 'exame_sangue', 'laudo', 'prescricao'].includes(r.tipo) ? r.tipo : 'outro',
      summary: r.resumo ? String(r.resumo) : undefined,
      values: Array.isArray(r.valores) ? r.valores.slice(0, 60).map((v: any) => ({ name: String(v.nome), value: String(v.valor), unit: v.unidade ? String(v.unidade) : undefined, flag: ['baixo', 'alto', 'normal'].includes(v.situacao) ? v.situacao : undefined })) : [],
      forPlanning: r.para_planejamento ? String(r.para_planejamento) : undefined,
      reading: false, readError: undefined
    } as any);
    toast(`${r.titulo || doc.fileName} lido`);
  } catch (e: any) {
    await update<'healthdoc'>(doc.id, { reading: false, readError: String(e.message || e) } as any);
    toast(`Não consegui ler ${doc.fileName}. O arquivo está guardado; toque em "Ler de novo".`, undefined, 'error');
  }
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
