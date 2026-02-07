import { getBrowserResolvedTimeZone } from '@utils/timezone';

type DateLike = Date | string | number;

type ZonedDateParts = {
  year: number;
  month: number; // 1-based month
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const normalizeZone = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const resolveLocalTimezone = (preferred?: string | null): string => {
  const explicit = normalizeZone(preferred);
  if (explicit) {
    return explicit;
  }

  const envTz = normalizeZone(
    typeof process !== 'undefined' && process.env ? (process.env.TZ ?? null) : null
  );
  if (envTz) {
    return envTz;
  }

  const browser = normalizeZone(getBrowserResolvedTimeZone());
  if (browser) {
    return browser;
  }

  return 'UTC';
};

const buildFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

const toDate = (value: DateLike): Date => {
  return value instanceof Date ? value : new Date(value);
};

const getDateParts = (value: DateLike, timeZone: string): ZonedDateParts => {
  const date = toDate(value);
  const parts = buildFormatter(timeZone).formatToParts(date);
  const lookup = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? '0');
  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour'),
    minute: lookup('minute'),
    second: lookup('second'),
    millisecond: date.getUTCMilliseconds()
  };
};

const computeOffsetMs = (timeZone: string, date: Date): number => {
  const parts = getDateParts(date, timeZone);
  const zonedTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  return zonedTime - date.getTime();
};

export const buildZonedDate = (
  input: { year: number; month: number; date: number; hour?: number; minute?: number; second?: number; millisecond?: number },
  timezoneValue?: string | null
): Date => {
  const zone = resolveLocalTimezone(timezoneValue);
  const guess = Date.UTC(
    input.year,
    input.month,
    input.date,
    input.hour ?? 0,
    input.minute ?? 0,
    input.second ?? 0,
    input.millisecond ?? 0
  );
  const offset = computeOffsetMs(zone, new Date(guess));
  return new Date(guess - offset);
};

export const getLocalTimezone = (preferred?: string | null): string => resolveLocalTimezone(preferred);

export const getZonedDateParts = (value: DateLike, timezoneValue?: string | null): ZonedDateParts => {
  const zone = resolveLocalTimezone(timezoneValue);
  return getDateParts(value, zone);
};

export const formatDateKey = (input: DateLike, timezoneValue?: string | null): string => {
  const parts = getZonedDateParts(input, timezoneValue);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

export const getMonthLayout = (
  year: number,
  monthIndex: number, // zero-based month index
  timezoneValue?: string | null
): { leadingWeekday: number; totalDays: number } => {
  const zone = resolveLocalTimezone(timezoneValue);
  const anchor = buildZonedDate({ year, month: monthIndex, date: 1 }, zone);
  const parts = getDateParts(anchor, zone);
  const leadingWeekday = new Date(parts.year, parts.month - 1, parts.day).getDay();
  const totalDays = new Date(parts.year, parts.month, 0).getDate();
  return { leadingWeekday, totalDays };
};

const startOfDay = (value: DateLike, timezoneValue?: string | null) => {
  const zone = resolveLocalTimezone(timezoneValue);
  const parts = getDateParts(value, zone);
  return buildZonedDate({ year: parts.year, month: parts.month - 1, date: parts.day }, zone);
};

const endOfDay = (value: DateLike, timezoneValue?: string | null) => {
  const zone = resolveLocalTimezone(timezoneValue);
  const parts = getDateParts(value, zone);
  return buildZonedDate(
    {
      year: parts.year,
      month: parts.month - 1,
      date: parts.day,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999
    },
    zone
  );
};

const addDays = (value: Date, days: number) => new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

const resolvePeriodStart = (period: string, timezoneValue?: string | null, nowInput?: DateLike) => {
  const zone = resolveLocalTimezone(timezoneValue);
  const now = startOfDay(nowInput ?? Date.now(), zone);
  const nowParts = getDateParts(now, zone);
  const weekday = new Date(nowParts.year, nowParts.month - 1, nowParts.day).getDay();

  switch (period) {
    case 'day':
      return now;
    case 'week': {
      const offset = weekday === 0 ? -6 : 1 - weekday;
      return addDays(now, offset);
    }
    case 'month':
      return buildZonedDate({ year: nowParts.year, month: nowParts.month - 1, date: 1 }, zone);
    case 'year':
    case 'ytd':
      return buildZonedDate({ year: nowParts.year, month: 0, date: 1 }, zone);
    default:
      if (period.endsWith('d')) {
        const days = Number.parseInt(period.slice(0, -1), 10);
        if (Number.isFinite(days)) {
          return addDays(now, -days);
        }
      }
      if (period.endsWith('w')) {
        const weeks = Number.parseInt(period.slice(0, -1), 10);
        if (Number.isFinite(weeks)) {
          return addDays(now, -weeks * 7);
        }
      }
      return null;
  }
};

export const buildPeriodRange = (
  period: string,
  options: { timezone?: string | null; now?: DateLike } = {}
): { startDate?: string; endDate?: string; timezone: string } => {
  const timezoneValue = resolveLocalTimezone(options.timezone);
  const endDate = endOfDay(options.now ?? Date.now(), timezoneValue);
  const start = resolvePeriodStart(period, timezoneValue, options.now);

  return {
    ...(start ? { startDate: start.toISOString() } : {}),
    endDate: endDate.toISOString(),
    timezone: timezoneValue
  };
};

export const __dateAggregationTestUtils = {
  resolveLocalTimezone,
  computeOffsetMs
};
