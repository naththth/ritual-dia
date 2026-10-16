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
