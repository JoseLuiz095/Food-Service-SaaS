/**
 * Prepara imagens para o Storage sem alterar o fluxo de upload do aplicativo.
 * A imagem é reduzida somente quando há ganho real, mantendo a qualidade
 * suficiente para vitrines e produtos e evitando arquivos gigantes no celular.
 */

export type ImageUploadPurpose = 'product' | 'storeAsset' | 'addon';

type ImageUploadProfile = {
  maxSide: number;
  targetBytes: number;
  quality: number;
};

const profiles: Record<ImageUploadPurpose, ImageUploadProfile> = {
  product: { maxSide: 1600, targetBytes: 1_800_000, quality: 0.84 },
  storeAsset: { maxSide: 2000, targetBytes: 2_200_000, quality: 0.86 },
  addon: { maxSide: 1400, targetBytes: 1_500_000, quality: 0.84 },
};

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileStem = (name: string) => {
  const stem = name.replace(/\.[^/.]+$/, '').trim() || 'imagem';
  return stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'imagem';
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> => (
  new Promise((resolve) => canvas.toBlob(resolve, type, quality))
);

const loadDimensions = async (file: File): Promise<{ width: number; height: number; close?: () => void }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation evita girar incorretamente fotos feitas no celular.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Alguns WebViews não aceitam imageOrientation; o fallback abaixo é seguro.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Não foi possível abrir a imagem enviada.'));
      element.src = url;
    });
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Retorna uma cópia compactada ou o arquivo original quando já está adequado. */
export const optimizeImageForUpload = async (
  file: File,
  purpose: ImageUploadPurpose = 'product',
): Promise<File> => {
  if (typeof window === 'undefined' || !imageMimeTypes.has(file.type)) return file;

  const profile = profiles[purpose];
  const dimensions = await loadDimensions(file);
  const longest = Math.max(dimensions.width, dimensions.height);
  const needsResize = longest > profile.maxSide;
  const needsCompression = file.size > profile.targetBytes;
  dimensions.close?.();

  if (!needsResize && !needsCompression) return file;

  const source = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
    : null;
  let image: CanvasImageSource | null = source;

  if (!image) {
    const url = URL.createObjectURL(file);
    try {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Não foi possível preparar a imagem enviada.'));
        element.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const scale = Math.min(1, profile.maxSide / Math.max(1, longest));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || !image) {
    source?.close();
    return file;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  source?.close();

  // WebP mantém transparência e costuma ser menor que JPEG/PNG. O fallback
  // para JPEG atende navegadores antigos que não suportam WebP no canvas.
  const webp = await canvasToBlob(canvas, 'image/webp', profile.quality);
  const jpeg = webp ? null : await canvasToBlob(canvas, 'image/jpeg', profile.quality);
  const blob = webp || jpeg;
  if (!blob || blob.size >= file.size) return file;

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${fileStem(file.name)}.${extension}`, {
    type: blob.type,
    lastModified: file.lastModified,
  });
};
