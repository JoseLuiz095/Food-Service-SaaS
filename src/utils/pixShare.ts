type PixQrShareInput = {
  dataUrl: string;
  title: string;
  text: string;
  fileName: string;
};

/** Compartilha o QR Code como imagem quando o navegador oferece suporte. */
export async function sharePixQrImage({ dataUrl, title, text, fileName }: PixQrShareInput): Promise<'image' | 'text' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  if (canShareFile) {
    await navigator.share({ title, text, files: [file] });
    return 'image';
  }

  await navigator.share({ title, text });
  return 'text';
}
