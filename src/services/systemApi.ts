import { resolveRequestUrl } from './config.js';

export class SystemApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'SystemApiError';
  }
}

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(init.headers ?? {})
  };

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let detail = '系统接口请求失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      // ignore parsing errors for non-JSON responses
    }
    throw new SystemApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new SystemApiError('解析系统接口响应失败', response.status);
  }
};

export interface SystemInfoResponse {
  name?: string | null;
  version?: string | null;
  display_version?: string | null;
  debug?: boolean | null;
  docs_url?: string | null;
  redoc_url?: string | null;
  openapi_url?: string | null;
  request_id?: string | null;
  timestamp?: string | null;
}

export interface SystemInfo {
  name: string;
  version: string;
  displayVersion: string | null;
  debug: boolean;
  docsUrl: string | null;
  redocUrl: string | null;
  openapiUrl: string | null;
  requestId: string | null;
  timestamp: string;
}

const normalizeString = (value: unknown, fallback: string | null = null): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallback;
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const mapSystemInfo = (payload: SystemInfoResponse): SystemInfo => {
  const name = normalizeString(payload.name, 'Algo Trading Platform') ?? 'Algo Trading Platform';
  const version = normalizeString(payload.version, 'unknown') ?? 'unknown';
  const displayVersion = normalizeString(payload.display_version);
  const timestamp = normalizeString(payload.timestamp, new Date().toISOString()) ?? new Date().toISOString();

  return {
    name,
    version,
    displayVersion,
    debug: Boolean(payload.debug),
    docsUrl: normalizeString(payload.docs_url),
    redocUrl: normalizeString(payload.redoc_url),
    openapiUrl: normalizeString(payload.openapi_url),
    requestId: normalizeString(payload.request_id),
    timestamp
  };
};

export type ServiceStatus = 'online' | 'error' | 'unknown';

export interface ServiceStatusResponse {
  name?: string | null;
  url?: string | null;
  status?: string | null;
  error?: string | null;
  kind?: string | null;
  fetched_at?: string | null;
}

export interface ServiceStatusEntry {
  name: string;
  url: string | null;
  status: ServiceStatus;
  error: string | null;
  kind: 'application' | 'gateway' | 'service';
  fetchedAt: string | null;
}

const normalizeStatus = (status: string | null | undefined): ServiceStatus => {
  if (!status) {
    return 'unknown';
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === 'online' || normalized === 'ok' || normalized === 'healthy') {
    return 'online';
  }
  if (normalized === 'error' || normalized === 'offline' || normalized === 'failed') {
    return 'error';
  }
  return 'unknown';
};

const normalizeKind = (kind: string | null | undefined): 'application' | 'gateway' | 'service' => {
  if (!kind) {
    return 'service';
  }
  const normalized = kind.trim().toLowerCase();
  if (normalized === 'application' || normalized === 'app') {
    return 'application';
  }
  if (normalized === 'gateway' || normalized === 'proxy') {
    return 'gateway';
  }
  return 'service';
};

const mapServiceStatus = (payload: ServiceStatusResponse): ServiceStatusEntry => ({
  name: normalizeString(payload.name, '未命名服务') ?? '未命名服务',
  url: normalizeString(payload.url),
  status: normalizeStatus(payload.status),
  error: normalizeString(payload.error),
  kind: normalizeKind(payload.kind),
  fetchedAt: normalizeString(payload.fetched_at)
});

interface ServiceStatusListResponse {
  services?: ServiceStatusResponse[] | null;
}

export const fetchSystemInfo = async (): Promise<SystemInfo> => {
  const payload = await requestJson<SystemInfoResponse>('/system/info');
  return mapSystemInfo(payload);
};

export const fetchServiceStatuses = async (): Promise<ServiceStatusEntry[]> => {
  const payload = await requestJson<ServiceStatusListResponse>('/system/services');
  const services = Array.isArray(payload.services) ? payload.services : [];
  return services.map(mapServiceStatus);
};

export type ManagedServiceStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export type ManagedServiceRestartStatus = 'completed' | 'failed' | 'pending';

export interface ManagedServiceRestartResponse {
  mode?: string | null;
  available?: boolean | null;
  reason?: string | null;
  command?: unknown;
  docker_container?: string | null;
  docker_host?: string | null;
}

export interface ManagedServiceStatusResponse {
  name?: string | null;
  status?: string | null;
  healthy?: boolean | null;
  last_checked?: string | null;
  latency_ms?: number | string | null;
  error?: string | null;
  status_code?: number | string | null;
  health_url?: string | null;
  log_path?: string | null;
  metadata?: Record<string, unknown> | null;
  restart?: ManagedServiceRestartResponse | null;
}

export interface ManagedServiceStatusCacheResponse {
  status?: string | null;
  last_updated?: string | null;
  next_refresh_in?: number | string | null;
  refresh_interval?: number | string | null;
  error?: string | null;
}

export interface ManagedServiceStatusEntry {
  name: string;
  status: ManagedServiceStatus;
  healthy: boolean;
  lastChecked: string | null;
  latencyMs: number | null;
  error: string | null;
  statusCode: number | null;
  healthUrl: string | null;
  logPath: string | null;
  metadata: Record<string, unknown> | null;
  restart: ManagedServiceRestartInfo;
}

export interface ManagedServiceStatusCacheSummary {
  status: string;
  lastUpdated: string | null;
  nextRefreshIn: number | null;
  refreshInterval: number | null;
  error: string | null;
}

export interface ManagedServiceStatusResult {
  services: ManagedServiceStatusEntry[];
  cache: ManagedServiceStatusCacheSummary;
}

export interface ManagedServiceRestartInfo {
  mode: string | null;
  available: boolean;
  reason: string | null;
  command: string[];
  dockerContainer: string | null;
  dockerHost: string | null;
}

export interface ServiceRestartResponse {
  service?: string | null;
  status?: string | null;
  succeeded?: boolean | null;
  mode?: string | null;
  detail?: string | null;
  command?: unknown;
  return_code?: number | string | null;
  stdout?: string | null;
  stderr?: string | null;
  duration_ms?: number | string | null;
  log_path?: string | null;
  status_code?: number | string | null;
}

export interface ManagedServiceRestartResult {
  service: string;
  status: ManagedServiceRestartStatus;
  succeeded: boolean;
  mode: string | null;
  detail: string | null;
  command: string[];
  returnCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  logPath: string | null;
  statusCode: number | null;
}

export interface ManagedServiceStatusListResponse {
  services?: ManagedServiceStatusResponse[] | null;
  cache?: ManagedServiceStatusCacheResponse | null;
}

const normalizeManagedStatus = (status: string | null | undefined): ManagedServiceStatus => {
  if (!status) {
    return 'unknown';
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === 'online' || normalized === 'healthy') {
    return 'online';
  }
  if (normalized === 'degraded' || normalized === 'warning') {
    return 'degraded';
  }
  if (normalized === 'offline' || normalized === 'error' || normalized === 'failed') {
    return 'offline';
  }
  return 'unknown';
};

const mapMetadata = (value: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const entries: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === 'string') {
      entries[key] = entry;
    }
  }
  return Object.keys(entries).length > 0 ? entries : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
    }
  }
  return result;
};

const mapRestartInfo = (
  payload: ManagedServiceRestartResponse | null | undefined
): ManagedServiceRestartInfo => {
  return {
    mode: normalizeString(payload?.mode),
    available: parseBoolean(payload?.available, false),
    reason: normalizeString(payload?.reason),
    command: toStringArray(payload?.command),
    dockerContainer: normalizeString(payload?.docker_container),
    dockerHost: normalizeString(payload?.docker_host)
  };
};

const mapManagedServiceStatus = (payload: ManagedServiceStatusResponse): ManagedServiceStatusEntry => {
  const statusCode = toNumberOrNull(payload.status_code);
  const latency = toNumberOrNull(payload.latency_ms);
  return {
    name: normalizeString(payload.name, '未命名服务') ?? '未命名服务',
    status: normalizeManagedStatus(payload.status),
    healthy: Boolean(payload.healthy),
    lastChecked: normalizeString(payload.last_checked),
    latencyMs: latency,
    error: normalizeString(payload.error),
    statusCode: statusCode != null ? Math.round(statusCode) : null,
    healthUrl: normalizeString(payload.health_url),
    logPath: normalizeString(payload.log_path),
    metadata: mapMetadata(payload.metadata ?? null),
    restart: mapRestartInfo(payload.restart ?? null)
  };
};

const mapManagedServiceStatusCache = (
  payload: ManagedServiceStatusCacheResponse | null | undefined
): ManagedServiceStatusCacheSummary => {
  const status =
    typeof payload?.status === 'string' && payload.status.trim()
      ? payload.status.trim().toLowerCase()
      : 'unknown';
  const lastUpdated = normalizeString(payload?.last_updated);
  const nextRefreshIn = toNumberOrNull(payload?.next_refresh_in);
  const refreshInterval = toNumberOrNull(payload?.refresh_interval);
  const error = normalizeString(payload?.error);
  return {
    status,
    lastUpdated,
    nextRefreshIn,
    refreshInterval,
    error
  };
};

export const mapManagedServiceStatusResult = (
  payload: ManagedServiceStatusListResponse | null | undefined
): ManagedServiceStatusResult => {
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const normalizedServices = services.map(mapManagedServiceStatus);
  const cache = mapManagedServiceStatusCache(payload?.cache ?? null);
  return { services: normalizedServices, cache };
};

export const fetchManagedServiceStatuses = async (): Promise<ManagedServiceStatusResult> => {
  const payload = await requestJson<ManagedServiceStatusListResponse>('/services');
  return mapManagedServiceStatusResult(payload);
};

const mapManagedServiceRestartResult = (
  payload: ServiceRestartResponse
): ManagedServiceRestartResult => {
  const service = normalizeString(payload.service, '未知服务') ?? '未知服务';
  const succeeded = parseBoolean(payload.succeeded, false);
  const normalizedStatus = normalizeString(payload.status)?.toLowerCase();
  let status: ManagedServiceRestartStatus;
  if (normalizedStatus === 'failed') {
    status = 'failed';
  } else if (normalizedStatus === 'pending') {
    status = 'pending';
  } else if (normalizedStatus === 'completed') {
    status = 'completed';
  } else {
    status = succeeded ? 'completed' : 'failed';
  }
  const returnCode = toNumberOrNull(payload.return_code) ?? (succeeded ? 0 : 1);
  const durationMs = toNumberOrNull(payload.duration_ms) ?? 0;
  const statusCode = toNumberOrNull(payload.status_code);
  const command = toStringArray(payload.command);
  return {
    service,
    status,
    succeeded,
    mode: normalizeString(payload.mode),
    detail: normalizeString(payload.detail),
    command,
    returnCode,
    stdout: normalizeString(payload.stdout, '') ?? '',
    stderr: normalizeString(payload.stderr, '') ?? '',
    durationMs,
    logPath: normalizeString(payload.log_path),
    statusCode
  };
};

export const restartManagedService = async (
  name: string
): Promise<ManagedServiceRestartResult> => {
  const payload = await requestJson<ServiceRestartResponse>(`/services/${encodeURIComponent(name)}/restart`, {
    method: 'POST'
  });
  return mapManagedServiceRestartResult(payload);
};
