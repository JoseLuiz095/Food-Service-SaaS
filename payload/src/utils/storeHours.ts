import type { OpeningDayConfig, OpeningSchedule } from '../types';

const DAY_NAMES = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export const DEFAULT_OPENING_SCHEDULE: OpeningSchedule = {
  timezone: 'America/Sao_Paulo',
  days: [
    { day: 0, enabled: false, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 1, enabled: true, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 2, enabled: true, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 3, enabled: true, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 4, enabled: true, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 5, enabled: true, open: '08:00', close: '18:00', breakStart: '', breakEnd: '' },
    { day: 6, enabled: true, open: '08:00', close: '14:00', breakStart: '', breakEnd: '' },
  ],
};

const validTime = (value: unknown, fallback = '') =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;

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
      open: validTime(row.open, '08:00'),
      close: validTime(row.close, '18:00'),
      breakStart: validTime(row.breakStart),
      breakEnd: validTime(row.breakEnd),
    });
  });

  // Compatibilidade com versões anteriores que armazenavam apenas texto em `display`.
  if (!byDay.size && typeof input.display === 'string') {
    const display = input.display.replace(/-/g, '–');
    const setRange = (days: number[], match: RegExpMatchArray | null) => {
      if (!match) return;
      days.forEach((day) => byDay.set(day, { day, enabled: true, open: match[1], close: match[2], breakStart: '', breakEnd: '' }));
    };
    setRange([1,2,3,4,5], display.match(/Seg\s+a\s+Sex\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i));
    const labels: Array<[number,RegExp]> = [
      [0,/Dom(?:ingo)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [1,/Seg(?:unda)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [2,/Ter(?:ça)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [3,/Qua(?:rta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [4,/Qui(?:nta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [5,/Sex(?:ta)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
      [6,/S[áa]b(?:ado)?\s+(\d{2}:\d{2})\s*[–]\s*(\d{2}:\d{2})/i],
    ];
    labels.forEach(([day, regex]) => {
      const match = display.match(regex);
      if (match) byDay.set(day, { day, enabled: true, open: match[1], close: match[2], breakStart: '', breakEnd: '' });
    });
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
  const hour = Number(map.hour) % 24;
  return { day: weekdayMap[map.weekday] ?? date.getDay(), minute: hour * 60 + Number(map.minute) };
};

const normalizeAfterStart = (value: number, start: number) => value < start ? value + 1440 : value;
const normalizedShiftEnd = (start: number, end: number) => end <= start ? end + 1440 : end;

const hasBreak = (day: OpeningDayConfig) => Boolean(day.breakStart && day.breakEnd && day.breakStart !== day.breakEnd);

const breakRange = (day: OpeningDayConfig, start: number) => {
  if (!hasBreak(day)) return null;
  const breakStart = normalizeAfterStart(minutes(day.breakStart || ''), start);
  let breakEnd = normalizeAfterStart(minutes(day.breakEnd || ''), start);
  if (breakEnd <= breakStart) breakEnd += 1440;
  return { start: breakStart, end: breakEnd };
};

const serviceWindows = (day: OpeningDayConfig) => {
  if (!day.enabled) return 'Fechado';
  if (!hasBreak(day)) return `${day.open}–${day.close}`;
  return `${day.open}–${day.breakStart} · ${day.breakEnd}–${day.close}`;
};

const statusDuringShift = (day: OpeningDayConfig, candidateMinute: number) => {
  const start = minutes(day.open);
  const end = normalizedShiftEnd(start, minutes(day.close));
  if (candidateMinute < start || candidateMinute >= end) return null;

  const pause = breakRange(day, start);
  if (pause && candidateMinute >= pause.start && candidateMinute < pause.end) {
    return { open: false, label: 'Em almoço' as const, detail: `Retorna às ${day.breakEnd}`, lunchBreak: true };
  }
  if (pause && candidateMinute < pause.start) {
    return { open: true, label: 'Aberto' as const, detail: `Pausa às ${day.breakStart}` };
  }
  return { open: true, label: 'Aberto' as const, detail: `Fecha às ${day.close}` };
};

export type StoreOpenStatus = {
  open: boolean;
  label: 'Aberto' | 'Fechado' | 'Em almoço';
  detail: string;
  todaySummary: string;
  lunchBreak?: boolean;
};

export function getStoreOpenStatus(schedule: OpeningSchedule, now = new Date()): StoreOpenStatus {
  const normalized = normalizeOpeningSchedule(schedule);
  let current;
  try { current = zonedParts(now, normalized.timezone); }
  catch { current = { day: now.getDay(), minute: now.getHours() * 60 + now.getMinutes() }; }

  const today = normalized.days.find((item) => item.day === current.day);
  const todaySummary = today ? serviceWindows(today) : 'Fechado';

  if (today?.enabled) {
    const start = minutes(today.open);
    const end = minutes(today.close);

    if (start === end) {
      return { open: true, label: 'Aberto', detail: 'Aberto 24 horas', todaySummary };
    }

    // Para jornadas que atravessam a meia-noite, aqui avaliamos apenas a
    // parcela iniciada no dia atual. A continuação após 00:00 é do dia anterior.
    const currentCandidate = current.minute;
    const currentShiftStatus = end > start
      ? statusDuringShift(today, currentCandidate)
      : current.minute >= start ? statusDuringShift(today, currentCandidate) : null;
    if (currentShiftStatus) return { ...currentShiftStatus, todaySummary };
  }

  // Ex.: sexta 18:00–02:00. Às 01:00 de sábado, a loja ainda está aberta
  // pela jornada de sexta. Também preservamos eventual pausa de almoço/turno
  // configurada após a meia-noite dentro dessa jornada anterior.
  const previousDayNumber = (current.day + 6) % 7;
  const previousDay = normalized.days.find((item) => item.day === previousDayNumber);
  if (previousDay?.enabled) {
    const previousStart = minutes(previousDay.open);
    const previousEnd = minutes(previousDay.close);
    if (previousEnd < previousStart) {
      const previousCandidate = current.minute + 1440;
      const previousStatus = statusDuringShift(previousDay, previousCandidate);
      if (previousStatus) return { ...previousStatus, todaySummary };
    }
  }

  if (today?.enabled) {
    const start = minutes(today.open);
    if (current.minute < start) {
      return { open: false, label: 'Fechado', detail: `Abre hoje às ${today.open}`, todaySummary };
    }
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (current.day + offset) % 7;
    const next = normalized.days.find((item) => item.day === day && item.enabled);
    if (next) {
      return {
        open: false,
        label: 'Fechado',
        detail: `Abre ${offset === 1 ? 'amanhã' : DAY_NAMES[day].toLowerCase()} às ${next.open}`,
        todaySummary,
      };
    }
  }

  return { open: false, label: 'Fechado', detail: 'Sem horário de atendimento configurado', todaySummary };
}

export function formatOpeningSchedule(schedule: OpeningSchedule): string {
  const normalized = normalizeOpeningSchedule(schedule);
  const enabled = normalized.days.filter((day) => day.enabled);
  if (!enabled.length) return 'Fechado todos os dias';
  return enabled.map((day) => `${SHORT[day.day]} ${serviceWindows(day)}`).join(' · ');
}

export const getOpeningScheduleOverview = (schedule: OpeningSchedule, now = new Date()) => {
  const normalized = normalizeOpeningSchedule(schedule);
  let currentDay = now.getDay();
  try { currentDay = zonedParts(now, normalized.timezone).day; } catch { /* fallback local */ }
  const days = normalized.days
    .map((day) => ({
      ...day,
      isToday: day.day === currentDay,
      shortLabel: SHORT[day.day],
      fullLabel: DAY_NAMES[day.day],
      summary: serviceWindows(day),
    }))
    .sort((a,b) => ((a.day || 7) - (b.day || 7)));
  return { today: days.find((day) => day.isToday) || days[0], days };
};

export const openingDayName = (day: number) => DAY_NAMES[day] ?? '';
