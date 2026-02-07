const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const buildFormatter = (
  options: Intl.DateTimeFormatOptions,
  locale: string,
  timeZone?: string
): Intl.DateTimeFormat => {
  if (timeZone) {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  }
  return new Intl.DateTimeFormat(locale, options);
};

const { formatWithTimezone, normalizeTimestampToUtc } = await import('./timezone.js');

const SAMPLE_ISO = '2024-06-15T12:34:56Z';
const OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};
const LOCALE = 'en-US';

const utcExpected = buildFormatter(OPTIONS, LOCALE, 'UTC').format(new Date(SAMPLE_ISO));
const utcActual = formatWithTimezone(SAMPLE_ISO, OPTIONS, LOCALE, 'UTC');
assert(utcActual === utcExpected, 'formatWithTimezone should honor provided timezone');

const localExpected = buildFormatter(OPTIONS, LOCALE).format(new Date(SAMPLE_ISO));
const localActual = formatWithTimezone(SAMPLE_ISO, OPTIONS, LOCALE, null);
assert(localActual === localExpected, 'formatWithTimezone should support browser default when timezone omitted');

const invalidTimezoneResult = formatWithTimezone(SAMPLE_ISO, OPTIONS, LOCALE, 'Invalid/Timezone');
assert(
  invalidTimezoneResult === localExpected,
  'formatWithTimezone should fall back to browser default when timezone is invalid'
);

const invalidDateResult = formatWithTimezone('not-a-date', OPTIONS, LOCALE, 'UTC');
assert(invalidDateResult === null, 'formatWithTimezone should return null for invalid date inputs');

const normalizedUtc = normalizeTimestampToUtc('2024-06-15T20:34:56+08:00');
assert(
  normalizedUtc === '2024-06-15T12:34:56.000Z',
  'normalizeTimestampToUtc should convert offsets to canonical UTC iso strings'
);

const normalizedWithFractionalSeconds = normalizeTimestampToUtc(
  '2025-10-28T17:46:52.123456+00:00'
);
assert(
  normalizedWithFractionalSeconds === '2025-10-28T17:46:52.123Z',
  'normalizeTimestampToUtc should trim fractional seconds beyond milliseconds'
);

const localInput = '2025-09-20T06:32:06';
const expectedLocalIso = new Date(localInput).toISOString();
const normalizedFromLocalString = normalizeTimestampToUtc(localInput);
assert(
  normalizedFromLocalString === expectedLocalIso,
  'normalizeTimestampToUtc should preserve local interpretation when timezone is omitted'
);

const normalizedFromSlashedDate = normalizeTimestampToUtc('2025/09/20 06:32:06');
assert(
  normalizedFromSlashedDate === new Date('2025-09-20T06:32:06').toISOString(),
  'normalizeTimestampToUtc should sanitize common slash-delimited inputs without forcing UTC timezone suffix'
);

if (!normalizedFromSlashedDate) {
  throw new Error('Expected slash-delimited timestamp to normalize to UTC');
}

const DISPLAY_OPTIONS: Intl.DateTimeFormatOptions = {
  ...OPTIONS,
  second: '2-digit'
};

const localDisplayExpected = buildFormatter(DISPLAY_OPTIONS, LOCALE).format(
  new Date(normalizedFromSlashedDate)
);
const localDisplayActual = formatWithTimezone(normalizedFromSlashedDate, DISPLAY_OPTIONS, LOCALE);
assert(
  localDisplayActual === localDisplayExpected,
  'formatWithTimezone should render sanitized timestamps in the local timezone'
);

const originalDateTimeFormat = Intl.DateTimeFormat;
try {
  Intl.DateTimeFormat = (() => {
    throw new RangeError('Mocked timezone resolution failure');
  }) as unknown as typeof Intl.DateTimeFormat;

  const moduleUrl = new URL('./timezone.js', import.meta.url);
  moduleUrl.searchParams.set('mock', Date.now().toString());
  const { formatWithTimezone: formatWithMockedTimezone } = await import(moduleUrl.href);

  Intl.DateTimeFormat = originalDateTimeFormat;

  const mockedResult = formatWithMockedTimezone(SAMPLE_ISO, OPTIONS, LOCALE);
  assert(
    mockedResult === localExpected,
    'formatWithTimezone should default to browser locale when timezone detection fails'
  );
} finally {
  Intl.DateTimeFormat = originalDateTimeFormat;
}

console.log('timezone utilities tests passed');
