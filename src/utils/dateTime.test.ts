export {};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const { formatLocalDateTime } = await import('./dateTime.js');

const buildExpectedOutput = (input: string): string => {
  const date = new Date(input);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`;
};

const withoutTimezoneInput = '2024-06-15 12:34:56';
const withoutTimezoneExpected = buildExpectedOutput('2024-06-15T12:34:56Z');
const withoutTimezoneActual = formatLocalDateTime(withoutTimezoneInput);
assert(
  withoutTimezoneActual === withoutTimezoneExpected,
  'formatLocalDateTime should normalize UTC strings without timezone information'
);

const withTimezoneInput = '2024-06-15T12:34:56+08:00';
const withTimezoneExpected = buildExpectedOutput(withTimezoneInput);
const withTimezoneActual = formatLocalDateTime(withTimezoneInput);
assert(
  withTimezoneActual === withTimezoneExpected,
  'formatLocalDateTime should respect explicit timezone offsets'
);

console.log('dateTime utilities tests passed');
