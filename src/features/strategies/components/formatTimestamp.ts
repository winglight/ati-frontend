import { formatWithTimezone, getBrowserResolvedTimeZone, normalizeTimestampToUtc } from '@utils/timezone';

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
};

export const formatTimestamp = (
  value: string | null | undefined,
  options?: { timezone?: string | null; locale?: string | string[]; assumeLocalWhenNoZone?: boolean }
): string => {
  if (!value) {
    return '—';
  }

  const assumeLocalWhenNoZone = options?.assumeLocalWhenNoZone === true;
  const normalized = (() => {
    const utc = normalizeTimestampToUtc(value);
    if (utc) {
      return utc;
    }
    if (assumeLocalWhenNoZone && typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return value;
      }
      const candidate = trimmed.includes('T')
        ? trimmed
        : trimmed.includes(' ')
          ? (() => {
              const [datePart, timePart] = trimmed.split(' ');
              return timePart ? `${datePart}T${timePart}` : `${datePart}T00:00:00`;
            })()
          : `${trimmed}T00:00:00`;
      try {
        const d = new Date(candidate);
        if (!Number.isNaN(d.getTime())) {
          return candidate;
        }
      } catch {
        // fall through
      }
    }
    return value;
  })();
  const locale = options?.locale ?? 'zh-CN';
  const preferredTimeZoneCandidate =
    typeof options?.timezone === 'string' && options.timezone.trim().length > 0
      ? options.timezone.trim()
      : getBrowserResolvedTimeZone();
  const preferredTimeZone =
    typeof preferredTimeZoneCandidate === 'string' && preferredTimeZoneCandidate.trim().length > 0
      ? preferredTimeZoneCandidate.trim()
      : null;

  const formatted = formatWithTimezone(
    normalized,
    TIMESTAMP_FORMAT,
    locale,
    preferredTimeZone ?? null
  );

  if (formatted) {
    return formatted.replace(/\u202f/g, ' ');
  }

  try {
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(locale, { ...TIMESTAMP_FORMAT, timeZone: preferredTimeZone ?? undefined });
    }
  } catch (_error) {
    // Ignore parsing fallback errors and return the original value below.
  }

  return value;
};
