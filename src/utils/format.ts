export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const slugify = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const formatDateBR = (isoDate?: string) => {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
};

export const formatDateTimeBR = (iso?: string) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

export const sanitizeWhatsAppNumber = (value: string) => value.replace(/\D/g, '');

export const todayLocalISO = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDaysLocalISO = (days: number, baseDate = new Date()) => {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.trunc(days)) : 0;
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  date.setDate(date.getDate() + safeDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeInstagramHandle = (value: string) => value
  .trim()
  .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
  .replace(/^@/, '')
  .split(/[/?#]/)[0]
  .replace(/[^a-zA-Z0-9._]/g, '');
