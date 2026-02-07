import { normalizeTimestampToUtc } from './timezone';

const DATE_PART_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric'
};

const TIME_PART_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
};

const TIME_PART_OPTIONS_24H: Intl.DateTimeFormatOptions = {
  ...TIME_PART_OPTIONS,
  hour12: false
};

const buildFormatter = (
  options: Intl.DateTimeFormatOptions,
  locale?: string | string[]
): Intl.DateTimeFormat => new Intl.DateTimeFormat(locale, options);

const formatWithIntl = (
  date: Date,
  locale?: string | string[],
  use24Hour?: boolean
): string => {
  const dateFormatter = buildFormatter(DATE_PART_OPTIONS, locale);
  const timeFormatter = buildFormatter(use24Hour ? TIME_PART_OPTIONS_24H : TIME_PART_OPTIONS, locale);
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`;
};

export const formatLocalDateTime = (
  value: string | number | Date | null | undefined,
  locale?: string | string[],
  use24Hour?: boolean
): string => {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '—';
    }
  }

  const stringValue = typeof value === 'string' ? value.trim() : value;

  const normalized =
    typeof stringValue === 'string' ? normalizeTimestampToUtc(stringValue) : null;

  const dateInput =
    normalized ?? (stringValue instanceof Date ? stringValue : new Date(stringValue));

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '—';
  }

  return formatWithIntl(date, locale, use24Hour);
};

export default formatLocalDateTime;
