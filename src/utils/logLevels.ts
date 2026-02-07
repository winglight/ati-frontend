const LEVEL_ORDER = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

type KnownLogLevel = (typeof LEVEL_ORDER)[number];

const LEVEL_WEIGHT = new Map<KnownLogLevel, number>(
  LEVEL_ORDER.map((level, index) => [level, index]),
);

const isKnownLogLevel = (level: string): level is KnownLogLevel =>
  LEVEL_WEIGHT.has(level as KnownLogLevel);

const getWeight = (level: string): number | undefined =>
  isKnownLogLevel(level) ? LEVEL_WEIGHT.get(level) : undefined;

const normalizeLevel = (level: string): string => level.toUpperCase();

const sortBySeverity = (a: string, b: string): number => {
  const weightA = getWeight(a);
  const weightB = getWeight(b);
  if (weightA !== undefined && weightB !== undefined) {
    return weightA - weightB;
  }
  if (weightA !== undefined) {
    return -1;
  }
  if (weightB !== undefined) {
    return 1;
  }
  return a.localeCompare(b);
};

export const DEFAULT_LOG_LEVELS = [...LEVEL_ORDER];

export const sortLevels = (levels: Iterable<string>): string[] => {
  const unique = new Set<string>();
  for (const level of levels) {
    if (level) {
      unique.add(normalizeLevel(level));
    }
  }
  return Array.from(unique.values()).sort(sortBySeverity);
};

export const expandLevels = (levels: Iterable<string>): string[] => {
  const expanded = new Set<string>();
  for (const level of levels) {
    const normalized = normalizeLevel(level);
    const weight = getWeight(normalized);
    if (weight !== undefined) {
      for (let index = weight; index < LEVEL_ORDER.length; index += 1) {
        expanded.add(LEVEL_ORDER[index]);
      }
    } else if (normalized) {
      expanded.add(normalized);
    }
  }
  return sortLevels(expanded);
};

export const expandLevel = (level: string): string[] => expandLevels([level]);

export const compressLevels = (levels: Iterable<string>): string[] => {
  const sorted = sortLevels(levels);
  const result: string[] = [];
  sorted.forEach((level) => {
    const weight = getWeight(level);
    if (weight === undefined) {
      if (!result.includes(level)) {
        result.push(level);
      }
      return;
    }
    const covered = result.some((existing) => {
      const existingWeight = getWeight(existing);
      return existingWeight !== undefined && existingWeight <= weight;
    });
    if (!covered) {
      result.push(level);
    }
  });
  return result;
};
