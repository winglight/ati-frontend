const ISO_TIMEZONE_SUFFIX = /(Z|z|[+-]\d{2}:?\d{2})$/;

const resolveBrowserTimeZone = (): string | null => {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return null;
  }

  try {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    if (typeof timeZone === 'string' && timeZone.trim()) {
      return timeZone;
    }
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
  }

  return null;
};

export const DEFAULT_MARKET_TIMEZONE = 'America/New_York';

let runtimeResolvedTimeZone: string | null | undefined;

export const getBrowserResolvedTimeZone = (): string | null => {
  if (runtimeResolvedTimeZone !== undefined) {
    return runtimeResolvedTimeZone;
  }

  const resolved = resolveBrowserTimeZone();
  if (resolved) {
    runtimeResolvedTimeZone = resolved;
    return runtimeResolvedTimeZone;
  }

  runtimeResolvedTimeZone = DEFAULT_MARKET_TIMEZONE;
  return runtimeResolvedTimeZone;
};

const ensureTimePortion = (value: string): string => {
  if (value.includes('T')) {
    return value;
  }
  if (value.includes(' ')) {
    const [datePart, timePart] = value.split(' ');
    if (timePart) {
      return `${datePart}T${timePart}`;
    }
  }
  return `${value}T00:00:00`;
};

const sanitizeFractionalSeconds = (value: string): string => {
  if (!value.includes('.')) {
    return value;
  }
  return value.replace(/(\.\d{3})\d+(?=(?:Z|z|[+-]\d{2}:?\d{2})?$)/, '$1');
};

const sanitizeCommonTimestampInput = (value: string): string => {
  let sanitized = value;

  sanitized = sanitized
    .replace(/[\u00a0\u2007\u202f\u3000\ufeff]/gu, ' ')
    .replace(/[/\u2215\u2044\uff0f]/gu, '-')
    .replace(/[\uff1a\u2236\ufe55\uff1b]/gu, ':')
    .replace(/[年月]/gu, '-')
    .replace(/[日号]/gu, '')
    .replace(/[时時]/gu, ':')
    .replace(/分/gu, ':')
    .replace(/秒/gu, '')
    .replace(/[，、\uff0c\uff64]/gu, ',');

  sanitized = sanitized
    .replace(/\s*([+-]\d{2}:?\d{2})$/u, '$1')
    .replace(/\s*(Z)$/iu, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized;
};

const buildCandidates = (value: string): string[] => {
  const normalizedInput = sanitizeCommonTimestampInput(value);
  if (!normalizedInput) {
    return [];
  }

  const base = ensureTimePortion(normalizedInput);
  if (!base) {
    return [];
  }
  const hasZone = ISO_TIMEZONE_SUFFIX.test(base);
  if (hasZone) {
    return [base];
  }

  const hadSlashDelimiter = /[/\u2215\u2044\uff0f]/u.test(value);
  const hadTimeSeparator = normalizedInput.includes('T') || normalizedInput.includes(' ');
  const hadExplicitT = normalizedInput.includes('T');
  const preferUtcWhenNoZone = hadTimeSeparator && !hadExplicitT && !hadSlashDelimiter;
  if (preferUtcWhenNoZone) {
    return [`${base}Z`, base];
  }
  return [base, `${base}Z`];
};

export const normalizeTimestampToUtc = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const candidates = buildCandidates(trimmed);
  for (const candidate of candidates) {
    const parsed = new Date(sanitizeFractionalSeconds(candidate));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
};

export const formatWithTimezone = (
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale: string | string[] = 'zh-CN',
  preferredTimeZone: string | null = null
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const buildFormatter = (timeZone?: string) =>
    new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options);

  const tried = new Set<string>();
  const timeZonesToTry = [
    preferredTimeZone,
    getBrowserResolvedTimeZone(),
    DEFAULT_MARKET_TIMEZONE
  ].filter((tz): tz is string => typeof tz === 'string' && tz.trim().length > 0);

  for (const timeZone of timeZonesToTry) {
    if (tried.has(timeZone)) {
      continue;
    }
    tried.add(timeZone);
    try {
      return buildFormatter(timeZone).format(date);
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
    }
  }

  return buildFormatter().format(date);
};

export const __timezoneTestUtils = {
  resetRuntimeTimeZoneCache: () => {
    runtimeResolvedTimeZone = undefined;
  }
};
