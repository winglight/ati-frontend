import { resolveRequestUrl } from './config.js';

export class LogsApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'LogsApiError';
  }
}

const requestJson = async <T>(path: string): Promise<T> => {
  const url = resolveRequestUrl(path);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    let detail = '获取系统日志失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new LogsApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new LogsApiError('解析系统日志响应失败', response.status);
  }
};

export interface LogEntryPayload {
  timestamp?: string | null;
  level?: string | null;
  message?: string | null;
  logger?: string | null;
  request_id?: string | null;
  context?: unknown;
  raw?: string | null;
  sequence?: number | null;
}

export interface LogsPaginationPayload {
  page?: number | null;
  page_size?: number | null;
  total?: number | null;
  has_next?: boolean | null;
}

export interface LogsFiltersPayload {
  levels?: string[] | null;
  start?: string | null;
  end?: string | null;
  search?: string | null;
}

export interface LogsResponsePayload {
  entries?: LogEntryPayload[] | null;
  pagination?: LogsPaginationPayload | null;
  available_levels?: string[] | null;
  filters?: LogsFiltersPayload | null;
  source?: { path?: string | null; paths?: string[] | null; updated_at?: string | null } | null;
  generated_at?: string | null;
  latest_sequence?: number | null;
}

export interface LogEntry {
  sequence: number;
  timestamp: string | null;
  level: string;
  message: string;
  logger: string | null;
  requestId: string | null;
  context: Record<string, unknown>;
  raw: string | null;
}

export interface LogQueryResult {
  entries: LogEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  availableLevels: string[];
  availableModules: string[];
  filters: {
    levels: string[];
    start: string | null;
    end: string | null;
    search: string;
  };
  sourcePath: string | null;
  sourcePaths: string[];
  sourceUpdatedAt: string | null;
  generatedAt: string | null;
  latestSequence: number | null;
}

export interface LogQueryParams {
  page?: number;
  pageSize?: number;
  levels?: string[];
  start?: string | null;
  end?: string | null;
  search?: string | null;
  module?: string;
}

export interface LogStreamParams {
  afterSequence?: number | null;
  after?: string | null;
  limit?: number;
  levels?: string[];
  start?: string | null;
  end?: string | null;
  search?: string | null;
  module?: string;
}

export interface LogStreamResult {
  entries: LogEntry[];
  latestSequence: number | null;
  hasMore: boolean;
  availableLevels: string[];
  availableModules: string[];
  sourcePath: string | null;
  sourcePaths: string[];
  sourceUpdatedAt: string | null;
  generatedAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value: unknown, fallback: string | null = null): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
};

const normalizeLevel = (value: unknown): string => {
  const normalized = normalizeString(value, 'INFO');
  return normalized ? normalized.toUpperCase() : 'INFO';
};

const mapEntry = (payload: LogEntryPayload): LogEntry => {
  const sequence =
    typeof payload.sequence === 'number' && Number.isFinite(payload.sequence)
      ? payload.sequence
      : Date.now();
  const context = isRecord(payload.context) ? payload.context : {};
  return {
    sequence,
    timestamp: normalizeString(payload.timestamp),
    level: normalizeLevel(payload.level),
    message: normalizeString(payload.message, '') ?? '',
    logger: normalizeString(payload.logger),
    requestId: normalizeString(payload.request_id),
    context,
    raw: normalizeString(payload.raw)
  };
};

type FilterParams = Pick<LogQueryParams, 'levels' | 'start' | 'end' | 'search'>;

const applyFilterParams = (searchParams: URLSearchParams, params: Partial<FilterParams>): void => {
  if (Array.isArray(params.levels) && params.levels.length > 0) {
    params.levels
      .map((level) => level.toUpperCase())
      .forEach((level) => searchParams.append('level', level));
  }
  if (params.start) {
    searchParams.set('start', params.start);
  }
  if (params.end) {
    searchParams.set('end', params.end);
  }
  if (params.search) {
    searchParams.set('search', params.search.trim());
  }
};

const buildQuery = (params: LogQueryParams): string => {
  const searchParams = new URLSearchParams();
  if (params.page && Number.isFinite(params.page)) {
    searchParams.set('page', String(params.page));
  }
  if (params.pageSize && Number.isFinite(params.pageSize)) {
    searchParams.set('page_size', String(params.pageSize));
  }
  if (params.module) {
    searchParams.set('module', params.module);
  }
  applyFilterParams(searchParams, params);
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

const extractModuleName = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/\\+/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const last = parts[parts.length - 1];
  if (last.toLowerCase().endsWith('.log')) {
    const stem = last.slice(0, -4).trim();
    if (stem) {
      return stem;
    }
  }
  const fallback = last.trim();
  return fallback || null;
};

const collectModules = (
  sourcePaths: string[],
  sourcePath: string | null,
  entries: LogEntry[]
): string[] => {
  const modules = new Set<string>();
  sourcePaths.forEach((path) => {
    const moduleName = extractModuleName(path);
    if (moduleName) {
      modules.add(moduleName);
    }
  });
  if (modules.size === 0 && sourcePath) {
    const moduleName = extractModuleName(sourcePath);
    if (moduleName) {
      modules.add(moduleName);
    }
  }
  if (modules.size === 0) {
    entries
      .map((entry) => extractModuleName(entry.logger))
      .filter((moduleName): moduleName is string => Boolean(moduleName))
      .forEach((moduleName) => modules.add(moduleName));
  }
  return Array.from(modules.values()).sort((a, b) => a.localeCompare(b));
};

export const fetchLogs = async (params: LogQueryParams = {}): Promise<LogQueryResult> => {
  const query = buildQuery(params);
  const payload = await requestJson<LogsResponsePayload>(`/system/logs${query}`);
  const pagination = payload.pagination ?? {};
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sourcePaths = Array.isArray(payload.source?.paths)
    ? payload.source?.paths.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    : [];
  const availableLevels = Array.isArray(payload.available_levels)
    ? payload.available_levels.map((level) => level.toUpperCase()).sort()
    : [];
  const filters = payload.filters ?? {};
  const latestSequence =
    typeof payload.latest_sequence === 'number' && Number.isFinite(payload.latest_sequence)
      ? payload.latest_sequence
      : null;

  const normalizedEntries = entries.map(mapEntry);
  const computedLatestSequence =
    latestSequence ?? (normalizedEntries.length > 0 ? normalizedEntries[0].sequence : null);
  const availableModules = collectModules(
    sourcePaths,
    normalizeString(payload.source?.path),
    normalizedEntries
  );

  return {
    entries: normalizedEntries,
    page: typeof pagination.page === 'number' && pagination.page > 0 ? pagination.page : params.page ?? 1,
    pageSize:
      typeof pagination.page_size === 'number' && pagination.page_size > 0
        ? pagination.page_size
        : params.pageSize ?? 100,
    total: typeof pagination.total === 'number' && pagination.total >= 0 ? pagination.total : entries.length,
    hasNext: Boolean(pagination.has_next),
    availableLevels,
    availableModules,
    filters: {
      levels: Array.isArray(filters.levels) ? filters.levels.map((level) => level.toUpperCase()) : [],
      start: normalizeString(filters.start),
      end: normalizeString(filters.end),
      search: normalizeString(filters.search, '') ?? ''
    },
    sourcePath: normalizeString(payload.source?.path),
    sourcePaths,
    sourceUpdatedAt: normalizeString(payload.source?.updated_at),
    generatedAt: normalizeString(payload.generated_at),
    latestSequence: computedLatestSequence
  };
};

export const buildLogsDownloadUrl = (params: LogQueryParams = {}): string => {
  const query = buildQuery(params);
  return resolveRequestUrl(`/system/logs${query}`);
};

const buildStreamQuery = (params: LogStreamParams): string => {
  const searchParams = new URLSearchParams();
  if (params.afterSequence !== undefined && params.afterSequence !== null && Number.isFinite(params.afterSequence)) {
    searchParams.set('after_sequence', String(params.afterSequence));
  }
  if (params.after) {
    searchParams.set('after', params.after);
  }
  if (params.limit && Number.isFinite(params.limit)) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.module) {
    searchParams.set('module', params.module);
  }
  applyFilterParams(searchParams, params);
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

interface LogStreamResponsePayload {
  entries?: LogEntryPayload[] | null;
  latest_sequence?: number | null;
  has_more?: boolean | null;
  available_levels?: string[] | null;
  filters?: LogsFiltersPayload | null;
  source?: { path?: string | null; paths?: string[] | null; updated_at?: string | null } | null;
  generated_at?: string | null;
}

export const streamLogs = async (params: LogStreamParams = {}): Promise<LogStreamResult> => {
  const query = buildStreamQuery(params);
  const payload = await requestJson<LogStreamResponsePayload>(`/system/logs/stream${query}`);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sourcePaths = Array.isArray(payload.source?.paths)
    ? payload.source?.paths.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    : [];
  const availableLevels = Array.isArray(payload.available_levels)
    ? payload.available_levels.map((level) => level.toUpperCase()).sort()
    : [];
  const latestSequence =
    typeof payload.latest_sequence === 'number' && Number.isFinite(payload.latest_sequence)
      ? payload.latest_sequence
      : null;
  const normalizedEntries = entries.map(mapEntry);
  const availableModules = collectModules(
    sourcePaths,
    normalizeString(payload.source?.path),
    normalizedEntries
  );

  return {
    entries: normalizedEntries,
    latestSequence,
    hasMore: Boolean(payload.has_more),
    availableLevels,
    availableModules,
    sourcePath: normalizeString(payload.source?.path),
    sourcePaths,
    sourceUpdatedAt: normalizeString(payload.source?.updated_at),
    generatedAt: normalizeString(payload.generated_at)
  };
};
