/**
 * Exporta dados tabulares no formato CSV compatível com Excel em pt-BR.
 * Mantém a geração no navegador para não criar uma nova consulta nem enviar
 * dados operacionais para um serviço externo.
 */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [headers, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
