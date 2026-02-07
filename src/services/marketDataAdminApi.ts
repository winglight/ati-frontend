import { resolveRequestUrl } from './config.js';

export interface MarketDataRangeEntryPayload {
  symbol?: string | null;
  data_type?: string | null;
  dataType?: string | null;
  start?: string | null;
  end?: string | null;
  path?: string | null;
  file_count?: number | string | null;
  fileCount?: number | string | null;
  total_size?: number | string | null;
  totalSize?: number | string | null;
  size_bytes?: number | string | null;
  sizeBytes?: number | string | null;
  volume?: number | string | null;
  records?: number | string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MarketDataRangeResponsePayload {
  entries?: MarketDataRangeEntryPayload[] | null;
  last_refreshed?: string | null;
}

export interface MarketDataCoverageStats {
  start: string | null;
  end: string | null;
  fileCount: number;
  totalSize: number;
  totalVolume: number | null;
  recordCount: number | null;
  dataTypes: string[];
}

export interface MarketDataCatalogEntry {
  dataType: string;
  start: string | null;
  end: string | null;
  fileCount: number | null;
  sizeBytes: number | null;
  recordCount: number | null;
  volume: number | null;
  updatedAt: string | null;
  path: string | null;
}

export interface MarketDataCoverageSummary {
  symbol: string;
  bars: MarketDataCoverageStats | null;
  dom: MarketDataCoverageStats | null;
}

export interface MarketDataCoverageResult extends MarketDataCoverageSummary {
  entries: MarketDataCatalogEntry[];
  lastRefreshed: string | null;
}

export interface MarketDataRangeScanResult {
  entries: MarketDataCatalogEntry[];
  lastRefreshed: string | null;
}

export type HistoricalBackfillProgressMetadata = {
  percent?: number | null;
  status?: string | null;
  message?: string | null;
  etaSeconds?: number | null;
} & Record<string, unknown>;

export interface HistoricalBackfillJobSummary {
  id: string;
  executed: boolean;
  progress: HistoricalBackfillProgressMetadata | null;
}

export interface HistoricalBackfillJobResponse {
  job: HistoricalBackfillJobSummary;
  metadata?: Record<string, unknown> | null;
}

export interface HistoricalBackfillScriptResponse {
  command: string;
  pid?: number | null;
  script?: string;
  run_backfill?: string | boolean;
  started?: boolean;
}

export class MarketDataAdminError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'MarketDataAdminError';
  }
}

type NullableNumber = number | null;

type NullableString = string | null;

const FILE_COUNT_KEYS = ['file_count', 'fileCount', 'files', 'fileTotal', 'count'];
const SIZE_KEYS = ['total_size', 'totalSize', 'size_bytes', 'sizeBytes', 'bytes'];
const VOLUME_KEYS = ['volume', 'total_volume', 'volume_total', 'sum_volume'];
const RECORD_KEYS = ['record_count', 'recordCount', 'records', 'entries', 'bars'];
const START_KEYS = ['start', 'begin', 'from'];
const END_KEYS = ['end', 'finish', 'to'];
const PATH_KEYS = ['path', 'file_path', 'filePath', 'source_path', 'sourcePath'];
const UPDATED_AT_KEYS = [
  'updated_at',
  'updatedAt',
  'last_updated',
  'lastUpdated',
  'last_updated_at',
  'lastUpdatedAt',
  'last_modified',
  'lastModified',
  'modified_at',
  'modifiedAt',
  'refreshed_at',
  'refreshedAt',
  'timestamp'
];
const ISO_TIMESTAMP_PATTERN =
  /\d{4}-\d{2}-\d{2}(?:[T_]\d{2}[:_-]?\d{2}(?:[:_-]?\d{2})?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const COMPACT_TIMESTAMP_PATTERN = /\d{8}T\d{6}(?:\d{2})?Z?/g;
const DIGIT_TIMESTAMP_PATTERN = /\d{8}(?:\d{2}(?:\d{2}(?:\d{2})?)?)?/g;

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normaliseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y', 'done', 'finished', 'completed', 'success', 'succeeded'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'pending', 'running', 'in_progress', 'processing', 'queued'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const normaliseNumber = (value: unknown): NullableNumber => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeTimestamp = (value: unknown): NullableString => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return trimmed;
  }
  return new Date(parsed).toISOString();
};

const normalisePercent = (value: unknown): number | null => {
  const numeric = normaliseNumber(value);
  if (numeric == null) {
    return null;
  }
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric >= 0 && numeric <= 1) {
    return Math.max(0, Math.min(100, numeric * 100));
  }
  return Math.max(0, Math.min(100, numeric));
};

const normaliseEtaSeconds = (value: unknown): number | null => {
  const numeric = normaliseNumber(value);
  if (numeric == null || !Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < 0) {
    return null;
  }
  return Math.round(numeric);
};

const resolveFirstString = (values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
};

const resolveProgressSource = (
  jobRecord: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null
): Record<string, unknown> | null => {
  const candidates: unknown[] = [];
  if (jobRecord) {
    candidates.push(jobRecord.progress, jobRecord.metadata, jobRecord.detail, jobRecord.details);
  }
  if (fallback) {
    candidates.push(fallback.progress, fallback.metadata, fallback.detail, fallback.details);
  }
  for (const candidate of candidates) {
    const record = toRecord(candidate);
    if (record) {
      return record;
    }
  }
  return null;
};

export const normaliseBackfillProgressMetadata = (
  value: unknown
): HistoricalBackfillProgressMetadata | null => {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const metadata = { ...record } as HistoricalBackfillProgressMetadata;
  const percentCandidate = normalisePercent(
    record.percent ?? record.percentage ?? record.progress ?? record.value ?? record.completion ?? record.progress_percent
  );
  if (percentCandidate !== null) {
    metadata.percent = percentCandidate;
  } else if (typeof metadata.percent !== 'number') {
    metadata.percent = null;
  }
  const status = resolveFirstString([record.status, record.state, record.stage, record.phase]);
  metadata.status = status ?? null;
  const message = resolveFirstString([record.message, record.description, record.detail]);
  metadata.message = message ?? null;
  const etaCandidate =
    normaliseEtaSeconds(record.etaSeconds ?? record.eta_seconds ?? record.remaining_seconds ?? record.eta ?? record.eta_secs);
  metadata.etaSeconds = etaCandidate;
  return metadata;
};

const resolveBackfillJobId = (
  jobRecord: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null
): string | null => {
  const candidates: unknown[] = [];
  if (jobRecord) {
    candidates.push(jobRecord.id, jobRecord.job_id, jobRecord.jobId, jobRecord.task_id, jobRecord.taskId);
  }
  if (fallback) {
    candidates.push(fallback.job_id, fallback.jobId, fallback.id, fallback.task_id, fallback.taskId);
  }
  for (const candidate of candidates) {
    const text = toStringValue(candidate);
    if (text) {
      return text;
    }
  }
  return null;
};

const resolveBackfillExecuted = (
  jobRecord: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null
): boolean => {
  const candidates: unknown[] = [];
  if (jobRecord) {
    candidates.push(jobRecord.executed, jobRecord.complete, jobRecord.completed, jobRecord.done, jobRecord.finished);
    if (typeof jobRecord.status === 'string') {
      candidates.push(jobRecord.status);
    }
  }
  if (fallback) {
    candidates.push(fallback.executed, fallback.complete, fallback.completed, fallback.done, fallback.finished);
    if (typeof fallback.status === 'string') {
      candidates.push(fallback.status);
    }
  }
  for (const candidate of candidates) {
    const normalized = normaliseBoolean(candidate);
    if (normalized !== null) {
      return normalized;
    }
    if (typeof candidate === 'string') {
      const text = candidate.trim().toLowerCase();
      if (['completed', 'success', 'succeeded', 'finished', 'done', 'executed'].includes(text)) {
        return true;
      }
      if (['pending', 'running', 'queued', 'processing', 'started'].includes(text)) {
        return false;
      }
    }
  }
  return false;
};

export const mapHistoricalBackfillJob = (
  jobRecord: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null = null
): HistoricalBackfillJobSummary => {
  const jobId = resolveBackfillJobId(jobRecord, fallback);
  if (!jobId) {
    throw new MarketDataAdminError('历史补录响应缺少任务 ID');
  }
  const executed = resolveBackfillExecuted(jobRecord, fallback);
  const progressRecord = resolveProgressSource(jobRecord, fallback);
  const progress = normaliseBackfillProgressMetadata(progressRecord);
  return {
    id: jobId,
    executed,
    progress
  };
};

const mapHistoricalBackfillScriptResponse = (
  payload: unknown
): HistoricalBackfillScriptResponse => {
  const record = toRecord(payload);
  if (!record) {
    return { command: '' };
  }
  return {
    command: typeof record.command === 'string' ? record.command : '',
    pid: typeof record.pid === 'number' ? record.pid : null,
    script: typeof record.script === 'string' ? record.script : undefined,
    run_backfill:
      typeof record.run_backfill === 'string' || typeof record.run_backfill === 'boolean'
        ? record.run_backfill
        : undefined,
    started: typeof record.started === 'boolean' ? record.started : undefined
  };
};

const compareTimestampValues = (left: string, right: string): number => {
  const leftParsed = Date.parse(left);
  const rightParsed = Date.parse(right);
  const leftValid = !Number.isNaN(leftParsed);
  const rightValid = !Number.isNaN(rightParsed);
  if (leftValid && rightValid) {
    if (leftParsed === rightParsed) {
      return 0;
    }
    return leftParsed < rightParsed ? -1 : 1;
  }
  if (leftValid) {
    return -1;
  }
  if (rightValid) {
    return 1;
  }
  return left.localeCompare(right);
};

const mergeStart = (current: NullableString, candidate: NullableString): NullableString => {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareTimestampValues(candidate, current) < 0 ? candidate : current;
};

const mergeEnd = (current: NullableString, candidate: NullableString): NullableString => {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareTimestampValues(candidate, current) > 0 ? candidate : current;
};

const sumNullable = (base: NullableNumber, value: NullableNumber): NullableNumber => {
  if (base == null) {
    return value ?? null;
  }
  if (value == null) {
    return base;
  }
  return base + value;
};

const collectFromSources = (sources: (Record<string, unknown> | null)[], keys: string[]): NullableNumber => {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      if (!(key in source)) {
        continue;
      }
      const candidate = normaliseNumber(source[key]);
      if (candidate != null) {
        return candidate;
      }
    }
  }
  return null;
};

const collectTimestampFromSources = (
  sources: (Record<string, unknown> | null)[],
  keys: string[]
): NullableString => {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      if (!(key in source)) {
        continue;
      }
      const candidate = normalizeTimestamp(source[key]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
};

const collectTimestampTokens = (value: string): string[] => {
  const ranges: { start: number; end: number; value: string }[] = [];
  const isoPattern = new RegExp(ISO_TIMESTAMP_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = isoPattern.exec(value)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length, value: match[0] });
  }

  const compactPattern = new RegExp(COMPACT_TIMESTAMP_PATTERN);
  while ((match = compactPattern.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlapsIso = ranges.some((range) => start >= range.start && end <= range.end);
    if (overlapsIso) {
      continue;
    }
    ranges.push({ start, end, value: match[0] });
  }

  const digitPattern = new RegExp(DIGIT_TIMESTAMP_PATTERN);
  while ((match = digitPattern.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlapsExisting = ranges.some((range) => start >= range.start && end <= range.end);
    if (overlapsExisting) {
      continue;
    }
    ranges.push({ start, end, value: match[0] });
  }

  ranges.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const range of ranges) {
    const token = range.value.trim();
    if (!token) {
      continue;
    }
    const key = `${range.start}:${token}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
};

const createUtcDate = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date => new Date(Date.UTC(year, month - 1, day, hour, minute, second));

const parseTimestampToken = (token: string): NullableString => {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (/^\d{14}$/.test(digitsOnly)) {
    const year = Number.parseInt(digitsOnly.slice(0, 4), 10);
    const month = Number.parseInt(digitsOnly.slice(4, 6), 10);
    const day = Number.parseInt(digitsOnly.slice(6, 8), 10);
    const hour = Number.parseInt(digitsOnly.slice(8, 10), 10);
    const minute = Number.parseInt(digitsOnly.slice(10, 12), 10);
    const second = Number.parseInt(digitsOnly.slice(12, 14), 10);
    return createUtcDate(year, month, day, hour, minute, second).toISOString();
  }

  if (/^\d{12}$/.test(digitsOnly)) {
    const year = Number.parseInt(digitsOnly.slice(0, 4), 10);
    const month = Number.parseInt(digitsOnly.slice(4, 6), 10);
    const day = Number.parseInt(digitsOnly.slice(6, 8), 10);
    const hour = Number.parseInt(digitsOnly.slice(8, 10), 10);
    const minute = Number.parseInt(digitsOnly.slice(10, 12), 10);
    return createUtcDate(year, month, day, hour, minute, 0).toISOString();
  }

  if (/^\d{8}$/.test(digitsOnly)) {
    const year = Number.parseInt(digitsOnly.slice(0, 4), 10);
    const month = Number.parseInt(digitsOnly.slice(4, 6), 10);
    const day = Number.parseInt(digitsOnly.slice(6, 8), 10);
    return createUtcDate(year, month, day).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map((part) => Number.parseInt(part, 10));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return createUtcDate(year, month, day).toISOString();
    }
  }

  return null;
};

const extractTimestampsFromPath = (value: unknown): { start: NullableString; end: NullableString } => {
  if (typeof value !== 'string') {
    return { start: null, end: null };
  }
  const withoutExtension = value.replace(/\.[^./\\]+$/, '');
  const tokens = collectTimestampTokens(withoutExtension);
  if (tokens.length === 0) {
    return { start: null, end: null };
  }
  if (tokens.length === 1) {
    const s = parseTimestampToken(tokens[0])!;
    const d = new Date(s);
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)).toISOString();
    return { start: s, end: e };
  }
  const s = parseTimestampToken(tokens[0])!;
  const eCandidate = parseTimestampToken(tokens[1])!;
  const isDateOnly = /^\d{8}$/.test(tokens[1]) || /^\d{4}-\d{2}-\d{2}$/.test(tokens[1]);
  const e = isDateOnly
    ? (() => {
        const d = new Date(eCandidate);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)).toISOString();
      })()
    : eCandidate;
  return { start: s, end: e };
};

const maybeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const collectPathCandidates = (
  entry: MarketDataRangeEntryPayload,
  sources: (Record<string, unknown> | null)[]
): string[] => {
  const candidates: string[] = [];
  const entryPath = maybeString(entry.path ?? null);
  if (entryPath) {
    candidates.push(entryPath);
  }
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of PATH_KEYS) {
      const candidate = maybeString(source[key]);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
};

const normaliseDataType = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  return value.trim().toLowerCase();
};

const isBarDataType = (value: string): boolean => {
  if (!value) {
    return false;
  }
  if (value.startsWith('bar')) {
    return true;
  }
  if (/^\d+[smhdw]$/.test(value)) {
    return true;
  }
  if (value.includes('kline')) {
    return true;
  }
  return false;
};

const isDomDataType = (value: string): boolean => {
  if (!value) {
    return false;
  }
  if (value === 'dom') {
    return true;
  }
  return value.includes('dom') || value.includes('depth');
};

const createEmptyStats = (): MarketDataCoverageStats => ({
  start: null,
  end: null,
  fileCount: 0,
  totalSize: 0,
  totalVolume: null,
  recordCount: null,
  dataTypes: []
});

const collectStatsFromEntry = (
  stats: MarketDataCoverageStats,
  entry: MarketDataRangeEntryPayload,
  normalizedType: string
) => {
  if (!stats.dataTypes.includes(normalizedType)) {
    stats.dataTypes.push(normalizedType);
  }

  const metadata = toRecord(entry.metadata ?? null);
  const nestedSources = [metadata, toRecord(metadata?.stats ?? null), toRecord(metadata?.summary ?? null)];

  let start =
    normalizeTimestamp(entry.start ?? null) ??
    collectTimestampFromSources(nestedSources, START_KEYS) ??
    collectTimestampFromSources([metadata], START_KEYS);
  let end =
    normalizeTimestamp(entry.end ?? null) ??
    collectTimestampFromSources(nestedSources, END_KEYS) ??
    collectTimestampFromSources([metadata], END_KEYS);

  if (!start || !end) {
    const pathCandidates = collectPathCandidates(entry, [metadata, ...nestedSources]);
    for (const candidate of pathCandidates) {
      const { start: candidateStart, end: candidateEnd } = extractTimestampsFromPath(candidate);
      if (!start && candidateStart) {
        start = candidateStart;
      }
      if (!end && candidateEnd) {
        end = candidateEnd;
      }
      if (start && end) {
        break;
      }
    }
  }

  stats.start = mergeStart(stats.start, start);
  stats.end = mergeEnd(stats.end, end);

  const fileCountValue =
    normaliseNumber(entry.file_count ?? entry.fileCount ?? null) ??
    collectFromSources([...nestedSources, metadata], FILE_COUNT_KEYS);
  const fileCount = fileCountValue != null ? fileCountValue : 1;
  const totalSize =
    normaliseNumber(entry.total_size ?? entry.totalSize ?? entry.size_bytes ?? entry.sizeBytes ?? null) ??
    collectFromSources([...nestedSources, metadata], SIZE_KEYS) ??
    0;
  const totalVolume =
    normaliseNumber(entry.volume ?? null) ??
    collectFromSources([...nestedSources, metadata], VOLUME_KEYS);
  const recordCount =
    normaliseNumber(entry.records ?? null) ?? collectFromSources([...nestedSources, metadata], RECORD_KEYS);

  stats.fileCount += fileCount;
  stats.totalSize += totalSize;
  const isSnapshot = normalizedType.includes('snapshot');
  if (!isSnapshot) {
    stats.totalVolume = sumNullable(stats.totalVolume, totalVolume);
    stats.recordCount = sumNullable(stats.recordCount, recordCount);
  }
};

const aggregateCoverageBySymbol = (
  entries: MarketDataRangeEntryPayload[],
  symbol: string
): MarketDataCoverageSummary => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const barStats = createEmptyStats();
  const domStats = createEmptyStats();

  for (const entry of entries) {
    const entrySymbol = (entry.symbol ?? '').trim();
    if (!entrySymbol) {
      continue;
    }
    if (entrySymbol.toUpperCase() !== normalizedSymbol) {
      continue;
    }
    const rawType = normaliseDataType(entry.data_type ?? entry.dataType ?? null);
    if (!rawType) {
      continue;
    }
    if (isBarDataType(rawType)) {
      collectStatsFromEntry(barStats, entry, rawType);
    } else if (isDomDataType(rawType)) {
      collectStatsFromEntry(domStats, entry, rawType);
    }
  }

  const bars = barStats.dataTypes.length ? barStats : null;
  const dom = domStats.dataTypes.length ? domStats : null;

  return {
    symbol,
    bars,
    dom
  };
};

const normaliseRangeEntries = (
  entries: MarketDataRangeEntryPayload[],
  symbol: string
): MarketDataCatalogEntry[] => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) {
    return [];
  }

  const normalizedEntries: MarketDataCatalogEntry[] = [];

  for (const entry of entries) {
    const entrySymbol = maybeString(entry.symbol ?? null);
    if (!entrySymbol || entrySymbol.trim().toUpperCase() !== normalizedSymbol) {
      continue;
    }

    const normalizedType = normaliseDataType(entry.data_type ?? entry.dataType ?? null);
    if (!normalizedType) {
      continue;
    }

    const metadata = toRecord(entry.metadata ?? null);
    const statsRecord = toRecord(metadata?.stats ?? null);
    const summaryRecord = toRecord(metadata?.summary ?? null);
    const nestedSources = [metadata, statsRecord, summaryRecord];
    const valueSources = [...nestedSources, metadata];

    let start =
      normalizeTimestamp(entry.start ?? null) ??
      collectTimestampFromSources(nestedSources, START_KEYS) ??
      collectTimestampFromSources([metadata], START_KEYS);
    let end =
      normalizeTimestamp(entry.end ?? null) ??
      collectTimestampFromSources(nestedSources, END_KEYS) ??
      collectTimestampFromSources([metadata], END_KEYS);

    const pathCandidates = collectPathCandidates(entry, [metadata, ...nestedSources]);
    if ((!start || !end) && pathCandidates.length) {
      for (const candidate of pathCandidates) {
        const { start: candidateStart, end: candidateEnd } = extractTimestampsFromPath(candidate);
        if (!start && candidateStart) {
          start = candidateStart;
        }
        if (!end && candidateEnd) {
          end = candidateEnd;
        }
        if (start && end) {
          break;
        }
      }
    }

    const fileCount =
      normaliseNumber(entry.file_count ?? entry.fileCount ?? null) ?? collectFromSources(valueSources, FILE_COUNT_KEYS);
    const sizeBytes =
      normaliseNumber(entry.total_size ?? entry.totalSize ?? entry.size_bytes ?? entry.sizeBytes ?? null) ??
      collectFromSources(valueSources, SIZE_KEYS);
    const recordCount =
      normaliseNumber(entry.records ?? null) ?? collectFromSources(valueSources, RECORD_KEYS);
    const volume =
      normaliseNumber(entry.volume ?? null) ?? collectFromSources(valueSources, VOLUME_KEYS);
    const updatedAt = collectTimestampFromSources(valueSources, UPDATED_AT_KEYS);
    const path = pathCandidates.find((candidate) => !!candidate) ?? null;

    normalizedEntries.push({
      dataType: normalizedType,
      start: start ?? null,
      end: end ?? null,
      fileCount: fileCount ?? null,
      sizeBytes: sizeBytes ?? null,
      recordCount: recordCount ?? null,
      volume: volume ?? null,
      updatedAt,
      path
    });
  }

  normalizedEntries.sort((left, right) => {
    if (left.start && right.start) {
      const comparison = compareTimestampValues(left.start, right.start);
      if (comparison !== 0) {
        return comparison;
      }
    } else if (left.start) {
      return -1;
    } else if (right.start) {
      return 1;
    }

    if (left.end && right.end) {
      const comparison = compareTimestampValues(left.end, right.end);
      if (comparison !== 0) {
        return comparison;
      }
    } else if (left.end) {
      return -1;
    } else if (right.end) {
      return 1;
    }

    return left.dataType.localeCompare(right.dataType);
  });

  return normalizedEntries;
};

const fetchJson = async <T>(path: string, token: string, init?: RequestInit): Promise<T> => {
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(init?.headers ?? {}),
    Authorization: `Bearer ${token}`
  };
  if (init?.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(resolveRequestUrl(path), {
    ...init,
    headers
  });

  if (response.status === 401) {
    throw new MarketDataAdminError('认证已失效，请重新登录', response.status);
  }

  if (!response.ok) {
    let detail = '请求行情数据管理接口失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        const message = (payload as { detail?: string; message?: string }).detail ?? (payload as { message?: string }).message;
        if (typeof message === 'string' && message.trim()) {
          detail = message;
        }
      }
    } catch (_error) {
      void _error;
    }
    throw new MarketDataAdminError(detail, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new MarketDataAdminError('解析行情数据管理响应失败', response.status);
  }
};

export const fetchMarketDataRangesBySymbol = async (
  token: string,
  params: { symbol: string; refresh?: boolean }
): Promise<MarketDataCoverageResult> => {
  const defaultTypes = ['bar_1m', 'dom', 'dom_metrics'];
  const requests = defaultTypes.map((dataType) =>
    fetchMarketDataRangeEntries(token, {
      symbol: params.symbol,
      dataType,
      refresh: params.refresh
    })
  );
  const results = await Promise.all(requests);
  const items = results.flatMap((result) => result.entries.map((entry) => ({
    symbol: params.symbol,
    data_type: entry.dataType,
    start: entry.start,
    end: entry.end,
    path: entry.path,
    size_bytes: entry.sizeBytes,
    record_count: entry.recordCount,
    metadata: {
      updated_at: entry.updatedAt,
      volume: entry.volume
    }
  })));
  const summary = aggregateCoverageBySymbol(items, params.symbol);
  const entries = normaliseRangeEntries(items, params.symbol);
  const lastRefreshed = results
    .map((result) => result.lastRefreshed)
    .filter((value): value is string => Boolean(value))
    .sort(compareTimestampValues)
    .pop() ?? null;
  return {
    ...summary,
    entries,
    lastRefreshed
  };
};

export const fetchMarketDataRangeEntries = async (
  token: string,
  params: { symbol: string; dataType?: string | null; refresh?: boolean }
): Promise<MarketDataRangeScanResult> => {
  if (!params.dataType) {
    throw new MarketDataAdminError('缺少 dataType 参数，无法扫描行情目录');
  }
  const payload = await fetchJson<MarketDataRangeResponsePayload>(
    '/data/market/catalog/quick-scan',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        symbol: params.symbol,
        data_type: params.dataType,
        ...(params.refresh ? { refresh: true } : {})
      })
    }
  );
  const items = Array.isArray(payload.entries) ? payload.entries : [];
  const entries = normaliseRangeEntries(items, params.symbol);
  const normalizedType = params.dataType ? normaliseDataType(params.dataType) : '';
  const filteredEntries = normalizedType
    ? entries.filter((entry) => entry.dataType === normalizedType)
    : entries;
  const lastRefreshed = normalizeTimestamp(payload.last_refreshed ?? null);
  return {
    entries: filteredEntries,
    lastRefreshed
  };
};

export const requestHistoricalBackfill = async (
  token: string,
  params: {
    symbol: string;
    timeframe?: string | null;
    start?: string | null;
    end?: string | null;
    ibClientId?: number | null;
    ibClientIdFallbacks?: number[] | null;
  }
): Promise<HistoricalBackfillScriptResponse> => {
  const body: Record<string, unknown> = { symbol: params.symbol };
  body.timeframe = params.timeframe ?? 'bar_1m';
  if (params.start) {
    body.start = params.start;
  }
  if (params.end) {
    body.end = params.end;
  }
  if (params.ibClientId != null && Number.isFinite(params.ibClientId)) {
    body.ib_client_id = Math.floor(params.ibClientId);
  }
  if (params.ibClientIdFallbacks?.length) {
    body.ib_client_id_fallbacks = params.ibClientIdFallbacks;
  }
  const response = await fetchJson<Record<string, unknown>>('/data/market/backfill/history', token, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return mapHistoricalBackfillScriptResponse(response);
};

export const __TESTING__ = {
  normaliseDataType,
  isBarDataType,
  isDomDataType,
  aggregateCoverageBySymbol,
  normaliseRangeEntries,
  collectStatsFromEntry,
  compareTimestampValues,
  normaliseBackfillProgressMetadata,
  mapHistoricalBackfillJob
};
