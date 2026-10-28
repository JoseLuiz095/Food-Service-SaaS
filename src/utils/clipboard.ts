export const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try the legacy path before asking for manual copy. */ }
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (!document.execCommand('copy')) throw new Error('Cópia automática indisponível. Selecione e copie o texto.');
  } finally { textarea.remove(); previous?.focus({ preventScroll: true }); }
};
