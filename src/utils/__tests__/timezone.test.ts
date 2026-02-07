import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatWithTimezone, __timezoneTestUtils } from '../timezone';

describe('formatWithTimezone', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  beforeEach(() => {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: originalDateTimeFormat
    });
    __timezoneTestUtils.resetRuntimeTimeZoneCache();
  });

  afterEach(() => {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: originalDateTimeFormat
    });
    __timezoneTestUtils.resetRuntimeTimeZoneCache();
  });

  it('prefers the runtime resolved timezone when formatting timestamps', () => {
    const callOptions: Array<Intl.DateTimeFormatOptions | undefined> = [];

    const mockedDateTimeFormat = vi
      .fn((locale?: string | string[], options?: Intl.DateTimeFormatOptions) => {
        callOptions.push(options);
        return {
          format: () => (options?.timeZone ? `tz:${options.timeZone}` : 'tz:default'),
          resolvedOptions: () => ({ timeZone: 'America/New_York' })
        };
      }) as unknown as typeof Intl.DateTimeFormat;

    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: mockedDateTimeFormat
    });

    const result = formatWithTimezone('2024-01-01T12:00:00Z', { hour: '2-digit' }, 'en-US');

    expect(result).toBe('tz:America/New_York');
    expect(callOptions.find((options) => options?.timeZone === 'America/New_York')).toBeDefined();
  });
});
