type PixQrShareInput = {
  dataUrl: string;
  title: string;
  text: string;
  fileName: string;
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  // Alguns navegadores móveis bloqueiam fetch(data:...), então decodificamos
  // o QR localmente antes de montar o arquivo para o Web Share API.
  if (!dataUrl.startsWith('data:')) {
    const response = await fetch(dataUrl);
    return response.blob();
  }
  const [header, body = ''] = dataUrl.split(',', 2);
  const mime = header.match(/^data:([^;]+)/i)?.[1] || 'image/png';
  if (header.includes(';base64')) {
    const binary = atob(body);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
};

/** Compartilha o QR Code como imagem, com fallback seguro para texto. */
export async function sharePixQrImage({ dataUrl, title, text, fileName }: PixQrShareInput): Promise<'image' | 'text' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';

  try {
    const blob = await dataUrlToBlob(dataUrl);
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    if (canShareFile) {
      try {
        await navigator.share({ title, text, files: [file] });
        return 'image';
      } catch (error) {
        // O Android pode recusar a imagem dependendo do app de destino. Ainda
        // assim, o link deve ser enviado sem obrigar o usuário a tentar de novo.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
  }

  await navigator.share({ title, text });
  return 'text';
}

/** Baixa o QR para compartilhamento manual quando o Web Share não está disponível. */
export function downloadQrImage(dataUrl: string, fileName: string): boolean {
  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
