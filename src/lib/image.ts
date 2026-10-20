/** Reduz a foto para no máximo 1280 px e JPEG ~0,8 (≈200–300 KB). */
export async function compressImage(file: File, max = 1280, quality = 0.8): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file).catch(async () => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img as unknown as ImageBitmap;
  });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao processar a foto'))), 'image/jpeg', quality));
  return { blob, width, height };
}

/** Reduz uma foto para mandar à IA sem perder a leitura de números. */
export async function shrinkImage(file: File, max = 1600): Promise<{ mime: string; data: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}
