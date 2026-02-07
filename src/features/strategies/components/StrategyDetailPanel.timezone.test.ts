import { formatTimestamp } from './StrategyDetailPanel';
import { __timezoneTestUtils } from '@utils/timezone';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (left: unknown, right: unknown, message: string): void => {
  if (left !== right) {
    throw new Error(`${message}\nExpected: ${right}\nReceived: ${left}`);
  }
};

const timestamp = '2024-05-01T00:00:00Z';
const timestampWithoutZone = '2024-05-01 00:00:00';
const timestampOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
};

const formatWithExpectedTimeZone = (
  timeZone: string,
  originalDateTimeFormat: typeof Intl.DateTimeFormat,
  rawTimestamp: string = timestamp
): string => {
  return new originalDateTimeFormat('zh-CN', { ...timestampOptions, timeZone })
    .format(new Date(rawTimestamp))
    .replace(/\u202f/g, ' ');
};

const withMockedBrowserTimeZone = <T>(timeZone: string, callback: () => T): T => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  function mockedDateTimeFormat(localeArg?: string | string[], options?: Intl.DateTimeFormatOptions) {
    const baseOptions = options ?? {};
    const appliedOptions =
      baseOptions && typeof baseOptions === 'object' && 'timeZone' in baseOptions && baseOptions.timeZone
        ? baseOptions
        : { ...baseOptions, timeZone };

    return new originalDateTimeFormat(localeArg as string | string[] | undefined, appliedOptions);
  }

  Object.defineProperty(Intl, 'DateTimeFormat', {
    configurable: true,
    writable: true,
    value: mockedDateTimeFormat
  });

  __timezoneTestUtils.resetRuntimeTimeZoneCache();
  try {
    return callback();
  } finally {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: originalDateTimeFormat
    });
    __timezoneTestUtils.resetRuntimeTimeZoneCache();
  }
};

const originalDateTimeFormat = Intl.DateTimeFormat;

const utcRendered = withMockedBrowserTimeZone('UTC', () => formatTimestamp(timestamp));
const expectedUtc = formatWithExpectedTimeZone('UTC', originalDateTimeFormat);
assertEqual(
  utcRendered,
  expectedUtc,
  'UTC browser timezones should render UTC timestamps without forcing another offset'
);

const shanghaiRendered = withMockedBrowserTimeZone('Asia/Shanghai', () => formatTimestamp(timestamp));
const expectedShanghai = formatWithExpectedTimeZone('Asia/Shanghai', originalDateTimeFormat);
assertEqual(
  shanghaiRendered,
  expectedShanghai,
  'Non-UTC browser timezones should shift UTC timestamps into the local offset'
);

const utcRenderedLocalInput = withMockedBrowserTimeZone('UTC', () => formatTimestamp(timestampWithoutZone));
const expectedUtcLocalInput = formatWithExpectedTimeZone('UTC', originalDateTimeFormat, timestampWithoutZone);
assertEqual(
  utcRenderedLocalInput,
  expectedUtcLocalInput,
  'UTC browser timezones should not shift timestamps that normalize into UTC'
);

const shanghaiRenderedLocalInput = withMockedBrowserTimeZone('Asia/Shanghai', () =>
  formatTimestamp(timestampWithoutZone)
);
const expectedShanghaiLocalInput = formatWithExpectedTimeZone(
  'Asia/Shanghai',
  originalDateTimeFormat,
  timestampWithoutZone
);
assertEqual(
  shanghaiRenderedLocalInput,
  expectedShanghaiLocalInput,
  'Non-UTC browser timezones should offset normalized UTC timestamps derived from local inputs'
);

assert(
  utcRendered !== shanghaiRendered,
  'Differing browser timezones should produce differing render output for the same UTC timestamp'
);
