import type { OpeningDayConfig, OpeningSchedule } from '../types';

const DAY_NAMES = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export const DEFAULT_OPENING_SCHEDULE: OpeningSchedule = {
  timezone: 'America/Sao_Paulo',
  days: [
    { day: 0, enabled: false, open: '08:00', close: '18:00' },
    { day: 1, enabled: true, open: '08:00', close: '18:00' },
    { day: 2, enabled: true, open: '08:00', close: '18:00' },
    { day: 3, enabled: true, open: '08:00', close: '18:00' },
    { day: 4, enabled: true, open: '08:00', close: '18:00' },
    { day: 5, enabled: true, open: '08:00', close: '18:00' },
    { day: 6, enabled: true, open: '08:00', close: '14:00' },
  ],
};

export const normalizeOpeningSchedule = (value: unknown): OpeningSchedule => {
  const input = value && typeof value === 'object' ? value as { timezone?: unknown; days?: unknown; display?: unknown } : {};
  const timezone = typeof input.timezone === 'string' && input.timezone ? input.timezone : DEFAULT_OPENING_SCHEDULE.timezone;
  const rawDays = Array.isArray(input.days) ? input.days : [];
  const byDay = new Map<number, OpeningDayConfig>();
  rawDays.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const row = raw as Partial<OpeningDayConfig>;
    const day = Number(row.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) return;
    byDay.set(day, {
      day,
      enabled: Boolean(row.enabled),
      open: typeof row.open === 'string' && /^\d{2}:\d{2}$/.test(row.open) ? row.open : '08:00',
      close: typeof row.close === 'string' && /^\d{2}:\d{2}$/.test(row.close) ? row.close : '18:00',
    });
  });

  // Compatibilidade com versões anteriores, que armazenavam apenas um texto em `display`.
  if (!byDay.size && typeof input.display === 'string') {
    const display = input.display.replace(/-/g, '–');
    const setRange = (days: number[], match: RegExpMatchArray | null) => {
      if (!match) return;
      days.forEach((day) => byDay.set(day, { day, enabled: true, open: match[1], close: match[2] }));
    };
    setRange([1,2,3,4,5], display.match(/Seg\s+a\s+Sex\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i));
    const labels: Array<[number,RegExp]> = [[0,/Dom(?:ingo)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[1,/Seg(?:unda)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[2,/Ter(?:ça)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[3,/Qua(?:rta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[4,/Qui(?:nta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[5,/Sex(?:ta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],[6,/S[áa]b(?:ado)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i]];
    labels.forEach(([day, regex]) => { const match = display.match(regex); if (match) byDay.set(day, { day, enabled: true, open: match[1], close: match[2] }); });
  }
  return {
    timezone,
    days: DEFAULT_OPENING_SCHEDULE.days.map((fallback) => byDay.get(fallback.day) ?? { ...fallback }),
  };
};

const minutes = (time: string) => {
  const [h,m] = time.split(':').map(Number);
  return h * 60 + m;
};

const zonedParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string,number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return { day: weekdayMap[map.weekday] ?? date.getDay(), minute: Number(map.hour) * 60 + Number(map.minute) };
};

export type StoreOpenStatus = { open: boolean; label: 'Aberto' | 'Fechado'; detail: string };

export function getStoreOpenStatus(schedule: OpeningSchedule, now = new Date()): StoreOpenStatus {
  const normalized = normalizeOpeningSchedule(schedule);
  let current;
  try { current = zonedParts(now, normalized.timezone); }
  catch { current = { day: now.getDay(), minute: now.getHours() * 60 + now.getMinutes() }; }
  const today = normalized.days.find((item) => item.day === current.day);
  if (today?.enabled) {
    const start = minutes(today.open);
    const end = minutes(today.close);

    // Horário com início e fim iguais representa funcionamento contínuo no dia.
    if (start === end) {
      return { open: true, label: 'Aberto', detail: 'Aberto 24 horas' };
    }

    // Em janelas que atravessam a meia-noite, a parcela após 00:00 pertence
    // ao dia anterior. Aqui validamos apenas a parcela iniciada hoje.
    const openFromToday = end > start
      ? current.minute >= start && current.minute < end
      : current.minute >= start;
    if (openFromToday) return { open: true, label: 'Aberto', detail: `Fecha às ${today.close}` };
  }

  // Ex.: sexta 18:00–00:30. Às 00:15 de sábado a loja ainda está aberta
  // pela jornada de sexta, mesmo que sábado tenha outro horário configurado.
  const previousDayNumber = (current.day + 6) % 7;
  const previousDay = normalized.days.find((item) => item.day === previousDayNumber);
  if (previousDay?.enabled) {
    const previousStart = minutes(previousDay.open);
    const previousEnd = minutes(previousDay.close);
    if (previousEnd < previousStart && current.minute < previousEnd) {
      return { open: true, label: 'Aberto', detail: `Fecha às ${previousDay.close}` };
    }
  }

  if (today?.enabled) {
    const start = minutes(today.open);
    if (current.minute < start) return { open: false, label: 'Fechado', detail: `Abre hoje às ${today.open}` };
  }
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (current.day + offset) % 7;
    const next = normalized.days.find((item) => item.day === day && item.enabled);
    if (next) return { open: false, label: 'Fechado', detail: `Abre ${offset === 1 ? 'amanhã' : DAY_NAMES[day].toLowerCase()} às ${next.open}` };
  }
  return { open: false, label: 'Fechado', detail: 'Sem horário de atendimento configurado' };
}

export function formatOpeningSchedule(schedule: OpeningSchedule): string {
  const normalized = normalizeOpeningSchedule(schedule);
  const enabled = normalized.days.filter((day) => day.enabled);
  if (!enabled.length) return 'Fechado todos os dias';
  return enabled.map((day) => `${SHORT[day.day]} ${day.open}–${day.close}`).join(' · ');
}

export const openingDayName = (day: number) => DAY_NAMES[day] ?? '';
