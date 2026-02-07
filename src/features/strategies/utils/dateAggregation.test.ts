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

import { buildPeriodRange, formatDateKey, getMonthLayout } from './dateAggregation';

const utcRange = buildPeriodRange('day', { timezone: 'UTC', now: '2024-05-01T12:00:00Z' });
assertEqual(formatDateKey(utcRange.startDate!, 'UTC'), '2024-05-01', 'UTC day range should stay on the same date');

const negativeOffsetRange = buildPeriodRange('week', {
  timezone: 'Etc/GMT-8',
  now: '2024-05-05T12:00:00Z' // Sunday noon UTC
});
assertEqual(
  formatDateKey(negativeOffsetRange.startDate!, 'Etc/GMT-8'),
  '2024-04-29',
  'Week range should start on Monday in UTC-8 environments'
);

const positiveOffsetRange = buildPeriodRange('day', {
  timezone: 'Etc/GMT+12',
  now: '2024-05-01T10:30:00Z'
});
assertEqual(
  formatDateKey(positiveOffsetRange.startDate!, 'Etc/GMT+12'),
  '2024-05-01',
  'Day range should honor positive offsets without drifting to the previous month'
);

const pacificMonth = getMonthLayout(2024, 4, 'Pacific/Kiritimati');
const utcMonth = getMonthLayout(2024, 4, 'UTC');
assert(
  pacificMonth.leadingWeekday === utcMonth.leadingWeekday && pacificMonth.totalDays === utcMonth.totalDays,
  'Month layout should be stable across timezones when using zoned calculations'
);

console.log('Date aggregation timezone tests passed');
