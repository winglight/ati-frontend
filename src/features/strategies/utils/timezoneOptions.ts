export const DEFAULT_TIMEZONE = 'America/New_York';

export interface TimezoneOption {
  value: string;
  label: string;
}

const buildOffsetOptions = (): TimezoneOption[] => {
  const offsets: TimezoneOption[] = [];
  for (let hour = -12; hour <= 14; hour += 1) {
    if (hour === 0) {
      offsets.push({ value: 'UTC', label: 'UTC±00:00' });
      continue;
    }
    const sign = hour > 0 ? '+' : '-';
    const absolute = Math.abs(hour).toString().padStart(2, '0');
    const label = `UTC${sign}${absolute}:00`;
    const normalizedHour = absolute.replace(/^0/, '');
    const value = hour > 0 ? `Etc/GMT-${normalizedHour}` : `Etc/GMT+${normalizedHour}`;
    offsets.push({ value, label });
  }
  return offsets;
};

const OFFSET_OPTIONS = buildOffsetOptions();

const BASE_OPTIONS: TimezoneOption[] = [
  { value: DEFAULT_TIMEZONE, label: 'America/New_York' },
  ...OFFSET_OPTIONS
];

export const getTimezoneOptions = (currentValue: string | null | undefined): TimezoneOption[] => {
  const trimmed = typeof currentValue === 'string' ? currentValue.trim() : '';
  if (!trimmed) {
    return BASE_OPTIONS;
  }
  if (BASE_OPTIONS.some((option) => option.value === trimmed)) {
    return BASE_OPTIONS;
  }
  return [...BASE_OPTIONS, { value: trimmed, label: trimmed }];
};

export const STRATEGY_TIMEZONE_OPTIONS = BASE_OPTIONS;
