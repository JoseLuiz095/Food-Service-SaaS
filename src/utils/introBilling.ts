/** Primeiro vencimento no dia combinado, após completar os meses de cortesia. */
export function firstChargeAfterFreeMonths(startDate: string, freeMonths: number, dueDay: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(freeMonths) || freeMonths < 1 || freeMonths > 24 ||
      !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error('Informe de 1 a 24 meses e um vencimento entre os dias 1 e 28.');
  const [year, month, day] = startDate.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.toISOString().slice(0, 10) !== startDate) throw new Error('Data inicial inválida.');
  const anniversaryMonth = new Date(Date.UTC(year, month - 1 + freeMonths, 1));
  const anniversary = new Date(Date.UTC(anniversaryMonth.getUTCFullYear(), anniversaryMonth.getUTCMonth(),
    Math.min(day, new Date(Date.UTC(anniversaryMonth.getUTCFullYear(), anniversaryMonth.getUTCMonth()+1, 0)).getUTCDate())));
  let first = new Date(Date.UTC(anniversary.getUTCFullYear(), anniversary.getUTCMonth(), dueDay));
  if (first < anniversary) first = new Date(Date.UTC(anniversary.getUTCFullYear(), anniversary.getUTCMonth()+1, dueDay));
  return first.toISOString().slice(0, 10);
}
