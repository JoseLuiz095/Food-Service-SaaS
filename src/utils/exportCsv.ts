/**
 * Exporta dados tabulares no formato CSV compatível com Excel em pt-BR.
 * Mantém a geração no navegador para não criar uma nova consulta nem enviar
 * dados operacionais para um serviço externo.
 */
type CsvValue = string | number | null | undefined;

export function escapeCsvCell(value: CsvValue): string {
  const text = value == null ? '' : String(value);
  // Campos textuais podem vir de nomes, observações e endereços digitados por
  // terceiros. Uma aspa inicial impede execução após espaços/controles, mesmo
  // quando a planilha ignora a delimitação por aspas do CSV.
  const formula = typeof value === 'string' && /^[\s\u0000-\u001f\u007f\u200b-\u200f\u2060\ufeff]*[=+\-@\t\r\n]/u.test(text);
  const safe = formula ? `'${text}` : text;
  return /[;"\n\r\t]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function serializeCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]) {
  const content = serializeCsv(headers, rows);
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
