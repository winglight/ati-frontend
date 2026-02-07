import type {
  MarketAvailability,
  MarketBar,
  MarketKlineSnapshot,
  MarketTickerSnapshot
} from '@features/dashboard/types';
import { resolveRequestUrl } from './config.js';
import { normalizeTimestampToUtc } from '../utils/timezone.js';

export interface MarketDataBarPayload {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface MarketDataRangeResponsePayload {
  symbol: string;
  timeframe: string;
  count: number;
  items: MarketDataBarPayload[];
  start?: string | null;
  end?: string | null;
}

export interface MarketDataKlineResponsePayload {
  symbol: string;
  timeframe: string;
  interval_seconds: number;
  duration_seconds: number;
  count: number;
  items: MarketDataBarPayload[];
  end?: string | null;
}

export interface MarketDataAvailabilityPayload {
  symbol: string;
  data_type: string;
  file_count: number;
  total_size: number;
  start?: string | null;
  end?: string | null;
  status?: string | null;
  suggested_start?: string | null;
  suggested_end?: string | null;
  pending_backfill?: boolean;
  backfill_job_id?: string | null;
}

export interface MarketSubscriptionStartPayload {
  symbol: string;
  enableDom?: boolean;
  enableTicker?: boolean;
  enableBars?: boolean;
  ownerId?: string | null;
  source?: string | null;
}

export type MarketSubscriptionStreamType = 'dom' | 'ticker' | 'bars';

export interface MarketSubscriptionStopPayload {
  subscriptionId?: string | null;
  symbol: string;
  ownerId?: string | null;
  source?: string | null;
  streams?: MarketSubscriptionStreamType[];
}

export interface MarketSubscriptionSnapshotEntryPayload {
  stream?: string | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MarketSubscriptionHistoricalSnapshotPayload {
  bars?: Record<string, unknown>[] | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MarketSubscriptionSnapshotsPayload {
  historical?: MarketSubscriptionHistoricalSnapshotPayload | null;
  bars?: MarketSubscriptionSnapshotEntryPayload | null;
  ticker?: MarketSubscriptionSnapshotEntryPayload | null;
  dom?: MarketSubscriptionSnapshotEntryPayload | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MarketSubscriptionSymbolStatePayload {
  symbol: string;
  simplified?: string | null;
  source?: string | null;
  status?: string | null;
  secType?: string | null;
  sec_type?: string | null;
  exchange?: string | null;
  currency?: string | null;
  localSymbol?: string | null;
  local_symbol?: string | null;
  [key: string]: unknown;
}

export interface MarketSubscriptionResponsePayload {
  subscription_id: string;
  status: string;
  symbol?: string | null;
  symbol_state?: MarketSubscriptionSymbolStatePayload | null;
  enable_dom?: boolean | null;
  enable_ticker?: boolean | null;
  enable_bars?: boolean | null;
  stop_allowed?: boolean;
  snapshots?: MarketSubscriptionSnapshotsPayload | null;
  subscribers?: Record<string, unknown>[] | null;
  dom_subscribers?: Record<string, unknown>[] | null;
  ticker_subscribers?: Record<string, unknown>[] | null;
  bar_subscribers?: Record<string, unknown>[] | null;
  features?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  streams?: Record<string, unknown> | null;
}

export interface MarketResubscribeResponsePayload {
  active: number;
  restarted: number;
  status?: string | null;
  message?: string | null;
}

export class MarketApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'MarketApiError';
  }
}

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
    throw new MarketApiError('认证已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '请求行情服务失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new MarketApiError(detail, response.status);
  }

  const text = await response.text();
  if (!text) {
    throw new MarketApiError('行情服务返回空响应', response.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new MarketApiError('解析行情服务响应失败', response.status);
  }
};

const coerceRecordArray = (value: unknown): Record<string, unknown>[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>[];
};

const DEFAULT_MARKET_SUBSCRIPTION_SOURCE = 'frontend';

const normalizeTrimmedString = (
  value: string | null | undefined
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const extractHistoricalBarsFromSubscription = (
  payload: MarketSubscriptionResponsePayload | null | undefined
): Record<string, unknown>[] | null => {
  if (!payload) {
    return null;
  }
  const snapshots = payload.snapshots;
  if (!snapshots || typeof snapshots !== 'object') {
    return null;
  }
  const historical = (snapshots as Record<string, unknown>)['historical'];
  if (!historical || typeof historical !== 'object') {
    return null;
  }
  const historicalEntry = historical as Record<string, unknown>;
  return (
    coerceRecordArray(historicalEntry['bars'] ?? null) ??
    coerceRecordArray(historicalEntry['payload'] ?? null)
  );
};

export const fetchMarketHistorical = async (
  token: string,
  params: {
    symbol: string;
    timeframe?: string | null;
    start?: string | null;
    end?: string | null;
  }
): Promise<MarketDataRangeResponsePayload> => {
  const searchParams = new URLSearchParams();
  searchParams.set('symbol', params.symbol);
  if (params.timeframe) {
    searchParams.set('timeframe', params.timeframe);
  }
  if (params.start) {
    searchParams.set('start', params.start);
  }
  if (params.end) {
    searchParams.set('end', params.end);
  }
  const query = searchParams.toString();
  const endpoint = query ? `/market/historical?${query}` : '/market/historical';
  return fetchJson<MarketDataRangeResponsePayload>(endpoint, token, { method: 'GET' });
};

export const fetchMarketKline = async (
  token: string,
  params: {
    symbol: string;
    intervalSeconds: number;
    durationSeconds: number;
    timeframe?: string | null;
    end?: string | null;
  }
): Promise<MarketDataKlineResponsePayload> => {
  const searchParams = new URLSearchParams();
  searchParams.set('symbol', params.symbol);
  searchParams.set('interval_seconds', params.intervalSeconds.toString());
  searchParams.set('duration_seconds', params.durationSeconds.toString());
  if (params.timeframe) {
    searchParams.set('timeframe', params.timeframe);
  }
  if (params.end) {
    searchParams.set('end', params.end);
  }
  const query = searchParams.toString();
  const endpoint = query ? `/market/kline?${query}` : '/market/kline';
  return fetchJson<MarketDataKlineResponsePayload>(endpoint, token, { method: 'GET' });
};

export const fetchMarketAvailability = async (
  token: string,
  params: { symbol: string; timeframe?: string | null; refresh?: boolean }
): Promise<MarketDataAvailabilityPayload> => {
  const searchParams = new URLSearchParams();
  searchParams.set('symbol', params.symbol);
  if (params.timeframe) {
    searchParams.set('timeframe', params.timeframe);
  }
  if (params.refresh) {
    searchParams.set('refresh', 'true');
  }
  const query = searchParams.toString();
  const endpoint = query ? `/market/availability?${query}` : '/market/availability';
  return fetchJson<MarketDataAvailabilityPayload>(endpoint, token, { method: 'GET' });
};

export const startMarketSubscription = async (
  token: string,
  payload: MarketSubscriptionStartPayload
): Promise<MarketSubscriptionResponsePayload> => {
  const symbol = typeof payload.symbol === 'string' ? payload.symbol.trim() : '';
  if (!symbol) {
    throw new MarketApiError('订阅请求缺少合法的标的符号');
  }

  const normalizeToggle = (value: boolean | undefined): boolean =>
    value === undefined ? false : Boolean(value);

  const ownerId = normalizeTrimmedString(payload.ownerId ?? DEFAULT_MARKET_SUBSCRIPTION_SOURCE);
  const source =
    normalizeTrimmedString(payload.source ?? DEFAULT_MARKET_SUBSCRIPTION_SOURCE) ?? DEFAULT_MARKET_SUBSCRIPTION_SOURCE;

  const body: Record<string, unknown> = {
    symbol,
    enable_dom: normalizeToggle(payload.enableDom),
    enable_ticker: normalizeToggle(payload.enableTicker),
    enable_bars: normalizeToggle(payload.enableBars),
    source
  };

  if (ownerId) {
    body.owner_id = ownerId;
  }

  return fetchJson<MarketSubscriptionResponsePayload>(
    '/market/subscription/start',
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
};

export const resubscribeMarketSubscriptions = async (
  token: string,
  params?: { subscriptionId?: string | null; symbol?: string | null }
): Promise<MarketResubscribeResponsePayload> => {
  const body: Record<string, unknown> = {};
  const subId = normalizeTrimmedString(params?.subscriptionId ?? null);
  const sym = normalizeTrimmedString(params?.symbol ?? null);
  if (subId) body.subscription_id = subId;
  if (sym) body.symbol = sym;
  return fetchJson<MarketResubscribeResponsePayload>('/market/subscription/resubscribe', token, {
    method: 'POST',
    body: JSON.stringify(body)
  });
};

const bootstrapSubscriptionTasks = new Map<string, Promise<MarketSubscriptionResponsePayload | null>>();

const buildSubscriptionCacheKey = (symbol: string, timeframe: string | null): string =>
  `${symbol}::${timeframe ?? ''}`;

const ensureInitialMarketSubscription = (
  token: string,
  params: { symbol: string; timeframe: string | null; ownerId?: string | null }
): Promise<MarketSubscriptionResponsePayload | null> => {
  const key = buildSubscriptionCacheKey(params.symbol, params.timeframe);
  const existingTask = bootstrapSubscriptionTasks.get(key);
  if (existingTask) {
    return existingTask;
  }
  const task = (async () => {
    try {
      return await startMarketSubscription(token, {
        symbol: params.symbol,
        enableDom: true,
        enableTicker: true,
        enableBars: true,
        ownerId: params.ownerId ?? undefined
      });
    } catch (error) {
      bootstrapSubscriptionTasks.delete(key);
      if (error instanceof MarketApiError && error.status === 503) {
        return null;
      }
      throw error;
    }
  })();
  bootstrapSubscriptionTasks.set(key, task);
  return task;
};

export const dedupeMarketBars = (bars: MarketBar[]): MarketBar[] => {
  if (!Array.isArray(bars) || bars.length <= 1) {
    return Array.isArray(bars) ? [...bars] : [];
  }

  const merged = new Map<string, MarketBar>();

  for (const bar of bars) {
    if (!bar || typeof bar.timestamp !== 'string') {
      continue;
    }
    merged.set(bar.timestamp, bar);
  }

  return Array.from(merged.values()).sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
  );
};

const buildKlineFromHistoricalBars = (
  symbol: string,
  timeframe: string | null,
  intervalSeconds: number,
  durationSeconds: number,
  bars: unknown
): MarketKlineSnapshot | null => {
  if (!Array.isArray(bars) || bars.length === 0) {
    return null;
  }
  const normalizedBars = dedupeMarketBars(
    bars
      .map((item) => mapMarketBar(item as MarketDataBarPayload))
      .filter((bar): bar is MarketBar => Boolean(bar))
  );
  if (!normalizedBars.length) {
    return null;
  }
  return {
    symbol,
    timeframe: timeframe ?? '',
    intervalSeconds,
    durationSeconds,
    bars: normalizedBars,
    end: normalizedBars[normalizedBars.length - 1]?.timestamp ?? null
  };
};

export const mapMarketBar = (payload: MarketDataBarPayload): MarketBar | null => {
  const timestamp = normalizeTimestampToUtc(payload.timestamp);
  if (!timestamp) {
    return null;
  }
  return {
    timestamp,
    open: Number(payload.open ?? 0),
    high: Number(payload.high ?? payload.open ?? 0),
    low: Number(payload.low ?? payload.open ?? 0),
    close: Number(payload.close ?? payload.open ?? 0),
    volume: payload.volume ?? null
  };
};

export const mapMarketKline = (payload: MarketDataKlineResponsePayload): MarketKlineSnapshot => {
  const bars = dedupeMarketBars(
    (payload.items ?? [])
      .map(mapMarketBar)
      .filter((bar): bar is MarketBar => Boolean(bar))
  );
  return {
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    intervalSeconds: payload.interval_seconds,
    durationSeconds: payload.duration_seconds,
    bars,
    end: normalizeTimestampToUtc(payload.end) ?? (bars.length ? bars[bars.length - 1]!.timestamp : null)
  };
};

export const mapMarketAvailability = (
  payload: MarketDataAvailabilityPayload,
  refreshedAt: Date
): MarketAvailability => ({
  symbol: payload.symbol,
  timeframe: payload.data_type,
  fileCount: payload.file_count,
  totalSize: payload.total_size,
  start: normalizeTimestampToUtc(payload.start) ?? null,
  end: normalizeTimestampToUtc(payload.end) ?? null,
  refreshedAt: refreshedAt.toISOString(),
  status: (payload.status ?? 'ready') as MarketAvailability['status'],
  suggestedStart: normalizeTimestampToUtc(payload.suggested_start) ?? null,
  suggestedEnd: normalizeTimestampToUtc(payload.suggested_end) ?? null,
  pendingBackfill: payload.pending_backfill ?? false,
  backfillJobId: payload.backfill_job_id ?? null
});

export const deriveTickerFromKline = (
  snapshot: MarketKlineSnapshot
): MarketTickerSnapshot | null => {
  if (!snapshot.bars.length) {
    return null;
  }
  const lastBar = snapshot.bars[snapshot.bars.length - 1];
  const previous = snapshot.bars.length > 1 ? snapshot.bars[snapshot.bars.length - 2] : undefined;
  const reference = previous?.close ?? lastBar.open;
  const last = lastBar.close;
  const change = reference !== undefined ? last - reference : null;
  const changePercent = change !== null && reference ? (change / reference) * 100 : null;
  return {
    symbol: snapshot.symbol,
    last,
    close: reference ?? null,
    change,
    changePercent,
    updatedAt: lastBar.timestamp
  };
};

export interface MarketSnapshotResult {
  kline: MarketKlineSnapshot | null;
  availability: MarketAvailability | null;
  ticker: MarketTickerSnapshot | null;
}

const SNAPSHOT_REQUEST_COOLDOWN_MS = 5000;
const SNAPSHOT_EMPTY_COOLDOWN_MS = 60000;
const snapshotCache = new Map<
  string,
  {
    requestedAt: number;
    result?: MarketSnapshotResult;
    inflight?: Promise<MarketSnapshotResult>;
  }
>();

const buildSnapshotKey = (params: {
  symbol: string;
  timeframe?: string | null;
  durationSeconds?: number;
  refreshAvailability?: boolean;
}): string =>
  [
    params.symbol,
    params.timeframe ?? '',
    params.durationSeconds ?? '',
    params.refreshAvailability ? 'refresh' : 'default'
  ].join('__');

const isSnapshotEmpty = (snapshot: MarketSnapshotResult): boolean =>
  !snapshot.kline && !snapshot.ticker;

const timeframeWindow: Record<string, { intervalSeconds: number; durationSeconds: number }> = {
  '1m': { intervalSeconds: 60, durationSeconds: 60 * 60 },
  '5m': { intervalSeconds: 300, durationSeconds: 6 * 60 * 60 },
  '15m': { intervalSeconds: 900, durationSeconds: 24 * 60 * 60 },
  '1h': { intervalSeconds: 3600, durationSeconds: 7 * 24 * 60 * 60 },
  '4h': { intervalSeconds: 4 * 3600, durationSeconds: 30 * 24 * 60 * 60 },
  '1d': { intervalSeconds: 24 * 3600, durationSeconds: 180 * 24 * 60 * 60 }
};

const durationPresetSeconds: Record<string, number> = {
  '1H': 60 * 60,
  '3H': 3 * 60 * 60,
  '1D': 24 * 60 * 60,
  '1W': 7 * 24 * 60 * 60,
  '1M': 30 * 24 * 60 * 60
};

export const resolveDurationSeconds = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const upper = value.toUpperCase();
  return durationPresetSeconds[upper] ?? null;
};

export const resolveAggregationWindow = (
  timeframe: string | null | undefined
): { intervalSeconds: number; durationSeconds: number } => {
  if (!timeframe) {
    return timeframeWindow['5m'];
  }
  return timeframeWindow[timeframe] ?? timeframeWindow['5m'];
};

export const loadMarketSnapshot = async (
  token: string,
  params: {
    symbol: string;
    timeframe?: string | null;
    intervalSeconds?: number;
    durationSeconds?: number;
    refreshAvailability?: boolean;
    requireRealtime?: boolean;
    ownerId?: string | null;
  }
): Promise<MarketSnapshotResult> => {
  const cacheKey = buildSnapshotKey(params);
  const now = Date.now();
  const cached = snapshotCache.get(cacheKey);
  if (cached) {
    const cooldown =
      cached.result && isSnapshotEmpty(cached.result)
        ? SNAPSHOT_EMPTY_COOLDOWN_MS
        : SNAPSHOT_REQUEST_COOLDOWN_MS;
    if (cached.inflight) {
      return cached.inflight;
    }
    if (cached.result && now - cached.requestedAt < cooldown) {
      return cached.result;
    }
  }

  const inFlightPromise = (async () => {
  const window = resolveAggregationWindow(params.timeframe ?? null);
  const intervalSeconds = params.intervalSeconds ?? window.intervalSeconds;
  const durationSeconds = params.durationSeconds ?? window.durationSeconds;
  const timeframe = params.timeframe ?? null;

  let datasetMissing = false;

  let historicalPayload: MarketDataRangeResponsePayload | null = null;

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - durationSeconds * 1000);

  try {
    historicalPayload = await fetchMarketHistorical(token, {
      symbol: params.symbol,
      timeframe,
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    });
  } catch (error) {
    if (error instanceof MarketApiError) {
      if (error.status === 404) {
        datasetMissing = true;
      } else if (error.status === 503) {
        // service unavailable, fall through with empty snapshot
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  let kline = historicalPayload
    ? buildKlineFromHistoricalBars(
        params.symbol,
        timeframe,
        intervalSeconds,
        durationSeconds,
        historicalPayload.items
      )
    : null;

  let subscriptionPayload: MarketSubscriptionResponsePayload | null = null;

  if (params.requireRealtime) {
    try {
      subscriptionPayload = await ensureInitialMarketSubscription(token, {
        symbol: params.symbol,
        timeframe,
        ownerId: params.ownerId ?? null
      });
    } catch (error) {
      if (error instanceof MarketApiError) {
        console.warn('启动行情订阅失败：', error.message);
      } else {
        console.warn('启动行情订阅失败：', error);
      }
      throw error;
    }
  }

  const subscriptionHistoricalBars = extractHistoricalBarsFromSubscription(
    subscriptionPayload
  );

  if (!kline && subscriptionHistoricalBars) {
    kline = buildKlineFromHistoricalBars(
      params.symbol,
      timeframe,
      intervalSeconds,
      durationSeconds,
      subscriptionHistoricalBars
    );
  }

  const availability = datasetMissing
    ? {
        symbol: params.symbol,
        timeframe: params.timeframe ?? (kline?.timeframe ?? 'unknown'),
        fileCount: 0,
        totalSize: 0,
        start: null,
        end: null,
        refreshedAt: new Date().toISOString(),
        status: 'missing' as const,
        suggestedStart: null,
        suggestedEnd: null,
        pendingBackfill: false,
        backfillJobId: null
      }
    : null;
  const ticker = kline ? deriveTickerFromKline(kline) : null;
  return { kline, availability, ticker };
  })();

  snapshotCache.set(cacheKey, { requestedAt: now, inflight: inFlightPromise });
  try {
    const result = await inFlightPromise;
    snapshotCache.set(cacheKey, { requestedAt: Date.now(), result });
    return result;
  } catch (error) {
    snapshotCache.delete(cacheKey);
    throw error;
  }
};

export interface MarketSubscriptionStreamSubscriberPayload {
  ownerId: string;
  referenceCount: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string;
  name?: string | null;
  subscribedAt?: string | null;
  pushedAt?: string | null;
  features?: Record<string, boolean> | null;
  stream?: string | null;
}

export interface MarketSubscriptionStreamPayload {
  subscriptionId: string;
  streamType: 'dom' | 'ticker' | 'bars';
  enabled?: boolean | null;
  ownerCount: number;
  totalReferences?: number | null;
  metadata?: Record<string, unknown> | null;
  subscribers: MarketSubscriptionStreamSubscriberPayload[];
  timeframe?: string | null;
  requestId?: string | null;
  features?: Record<string, unknown> | null;
}

export interface ActiveSubscriptionSummaryPayload {
  subscriptionId: string;
  symbol: string;
  secType?: string | null;
  exchange?: string | null;
  currency?: string | null;
  localSymbol?: string | null;
  timeframe?: string | null;
  enableDom?: boolean | null;
  enableTicker?: boolean | null;
  enableBars?: boolean | null;
  startedAt?: string | null;
  ownerCount?: number | null;
  owners?: string[] | null;
  metadata?: Record<string, unknown> | null;
  sources?: string[] | null;
  streams: MarketSubscriptionStreamPayload[];
  features?: Record<string, unknown> | null;
  symbolState?: MarketSubscriptionSymbolStatePayload | null;
  stopAllowed?: boolean | null;
}

export interface StrategyMarketDataEventPayload {
  subscriptions?: ActiveSubscriptionSummaryPayload[] | null;
  telemetry?: Record<string, unknown> | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  status?: 'idle' | 'updating' | string;
  error?: string | null;
  message?: string | null;
}

// Precise payload type for the backend response of active subscriptions
interface ActiveSubscriptionResponseSubscriberItem {
  owner_id?: string | null;
  reference_count?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  name?: string | null;
  subscribed_at?: string | number | null;
  features?: Record<string, unknown> | null;
}

interface ActiveSubscriptionResponseStreamItem {
  subscription_id?: string | null;
  stream_type?: string | null;
  timeframe?: string | null;
  enabled?: boolean | null;
  owner_count?: number | null;
  total_references?: number | null;
  metadata?: Record<string, unknown> | null;
  subscribers?: ActiveSubscriptionResponseSubscriberItem[] | null;
  request_id?: string | number | null;
  features?: Record<string, unknown> | null;
}

const normalizeSubscriberTimestamp = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = numeric > 1e12 ? numeric : numeric * 1000;
      return new Date(millis).toISOString();
    }
    return normalizeTimestampToUtc(trimmed);
  }
  return null;
};

interface ActiveSubscriptionResponseItem {
  subscription_id: string;
  symbol: string;
  sec_type?: string | null;
  exchange?: string | null;
  currency?: string | null;
  local_symbol?: string | null;
  timeframe?: string | null;
  enable_dom?: boolean | null;
  enable_ticker?: boolean | null;
  enable_bars?: boolean | null;
  started_at?: string | null;
  owner_count?: number | null;
  owners?: string[] | null;
  metadata?: Record<string, unknown> | null;
  subscribers?: ActiveSubscriptionResponseSubscriberItem[] | null;
  dom_subscribers?: ActiveSubscriptionResponseSubscriberItem[] | null;
  ticker_subscribers?: ActiveSubscriptionResponseSubscriberItem[] | null;
  bar_subscribers?: ActiveSubscriptionResponseSubscriberItem[] | null;
  // Optional sources from backend; normalize below if present
  sources?: unknown[] | null;
  features?: Record<string, unknown> | null;
  streams?: ActiveSubscriptionResponseStreamItem[] | null;
  symbol_state?: Record<string, unknown> | null;
  stop_allowed?: boolean | null;
}

export const listActiveSubscriptions = async (
  token: string
): Promise<ActiveSubscriptionSummaryPayload[]> => {
  const raw = await fetchJson<ActiveSubscriptionResponseItem[]>(
    '/market/subscription/active',
    token,
    { method: 'GET' }
  );
  if (!Array.isArray(raw)) {
    return [];
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const tryNormalizeStreamType = (
    value: unknown
  ): 'dom' | 'ticker' | 'bars' | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const token = value.trim().toLowerCase();
    if (token.startsWith('bars_')) {
      return 'bars';
    }
    if (token === 'ticker' || token === 'bars') {
      return token;
    }
    if (token === 'dom' || token === 'depth' || token === 'orderbook') {
      return 'dom';
    }
    return null;
  };

  const normalizeStreamType = (value: unknown): 'dom' | 'ticker' | 'bars' =>
    tryNormalizeStreamType(value) ?? 'dom';

  const parseBarsStreamToken = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const token = value.trim();
    if (!token.toLowerCase().startsWith('bars_')) {
      return null;
    }
    const suffix = token.slice(5);
    return suffix ? suffix : null;
  };

  const formatBarsRequestId = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  };

  const toBarsRequestId = (timeframe: unknown): string | null => {
    if (typeof timeframe !== 'string' || !timeframe.trim()) {
      return null;
    }
    const token = timeframe.trim().toLowerCase().replace('bar_', '');
    if (token.endsWith('mo') && token.length > 2) {
      const prefix = token.slice(0, -2);
      if (/^\d+$/.test(prefix)) {
        return `${prefix}M`;
      }
    }
    return token;
  };

  const toSubscriber = (
    subscriber: unknown,
    streamHint?: 'dom' | 'ticker' | 'bars'
  ): MarketSubscriptionStreamSubscriberPayload | null => {
    if (!subscriber || typeof subscriber !== 'object') {
      return null;
    }
    const record = subscriber as Record<string, unknown>;
    const ownerCandidate =
      typeof record['owner_id'] === 'string'
        ? record['owner_id'].trim()
        : typeof record['ownerId'] === 'string'
          ? record['ownerId'].trim()
          : record['owner_id'] != null
            ? String(record['owner_id'])
            : record['ownerId'] != null
              ? String(record['ownerId'])
              : '';
    if (!ownerCandidate) {
      return null;
    }
    let referenceCount: number | null = null;
    const referenceRaw =
      record['reference_count'] ?? record['referenceCount'] ?? record['references'];
    if (typeof referenceRaw === 'number' && Number.isFinite(referenceRaw)) {
      referenceCount = referenceRaw;
    } else if (typeof referenceRaw === 'string') {
      const parsed = Number(referenceRaw);
      if (!Number.isNaN(parsed)) {
        referenceCount = parsed;
      }
    }
    const metadataRaw = record['metadata'];
    const metadata =
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? (metadataRaw as Record<string, unknown>)
        : undefined;
    let nameCandidate =
      typeof record['name'] === 'string' && record['name'].trim()
        ? record['name'].trim()
        : undefined;
    const subscribedAt = normalizeSubscriberTimestamp(
      record['subscribed_at'] ?? record['subscribedAt']
    );
    const pushedAt = normalizeSubscriberTimestamp(
      record['pushed_at'] ?? record['pushedAt']
    );
    let source: string | undefined;
    if (typeof record['source'] === 'string' && record['source'].trim()) {
      source = record['source'].trim();
    } else if (metadata && typeof metadata['source'] === 'string') {
      const candidate = String(metadata['source']).trim();
      source = candidate || undefined;
    }
    if (!nameCandidate) {
      const metaKeys = ['name', 'display_name', 'owner_name'];
      for (const k of metaKeys) {
        const v = metadata && typeof (metadata as Record<string, unknown>)[k] === 'string'
          ? String((metadata as Record<string, unknown>)[k]).trim()
          : '';
        if (v) {
          nameCandidate = v;
          break;
        }
      }
      if (!nameCandidate && typeof source === 'string' && source.trim()) {
        nameCandidate = source.trim();
      }
    }
    const featuresRaw = record['features'];
    let features: Record<string, boolean> | null = null;
    if (featuresRaw && typeof featuresRaw === 'object' && !Array.isArray(featuresRaw)) {
      const normalized: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(featuresRaw)) {
        if (typeof key === 'string') {
          normalized[key] = Boolean(value);
        }
      }
      features = Object.keys(normalized).length > 0 ? normalized : null;
    }
    let stream =
      tryNormalizeStreamType(record['stream']) ??
      tryNormalizeStreamType(record['stream_type']) ??
      tryNormalizeStreamType(metadata?.['stream']) ??
      streamHint ?? null;

    if (!stream && streamHint) {
      stream = streamHint;
    }

    return {
      ownerId: ownerCandidate,
      referenceCount,
      metadata,
      source,
      name: nameCandidate ?? null,
      subscribedAt,
      pushedAt,
      features: features ?? undefined,
      stream: stream ?? null
    };
  };

  const parseSubscriberCollection = (
    collection: unknown,
    streamType?: 'dom' | 'ticker' | 'bars'
  ): MarketSubscriptionStreamSubscriberPayload[] => {
    if (!Array.isArray(collection)) {
      return [];
    }
    return collection
      .map((entry) => toSubscriber(entry, streamType))
      .filter(
        (entry): entry is MarketSubscriptionStreamSubscriberPayload => entry !== null
      );
  };

  const resolveSubscribersKey = (
    streamType: 'dom' | 'ticker' | 'bars'
  ): 'dom_subscribers' | 'ticker_subscribers' | 'bar_subscribers' => {
    switch (streamType) {
      case 'dom':
        return 'dom_subscribers';
      case 'ticker':
        return 'ticker_subscribers';
      case 'bars':
      default:
        return 'bar_subscribers';
    }
  };

  const collectStreamSubscribers = (
    item: ActiveSubscriptionResponseItem,
    streamType: 'dom' | 'ticker' | 'bars'
  ): MarketSubscriptionStreamSubscriberPayload[] => {
    const direct = parseSubscriberCollection(
      item[resolveSubscribersKey(streamType)],
      streamType
    );
    if (direct.length > 0) {
      return direct;
    }
    const streamEntries = Array.isArray(item.streams) ? item.streams : [];
    for (const entry of streamEntries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const streamRecord = entry as ActiveSubscriptionResponseStreamItem;
      const streamKey = normalizeStreamType(streamRecord.stream_type);
      if (streamKey !== streamType) {
        continue;
      }
      return parseSubscriberCollection(streamRecord.subscribers, streamType);
    }
    return [];
  };

  const parseSymbolState = (
    value: unknown
  ): MarketSubscriptionSymbolStatePayload | null => {
    if (!isRecord(value)) {
      return null;
    }
    const symbolRaw = value['symbol'];
    if (typeof symbolRaw !== 'string' || !symbolRaw.trim()) {
      return null;
    }
    const normalized: MarketSubscriptionSymbolStatePayload = {
      symbol: symbolRaw.trim()
    };

    const assignOptional = (
      targetKey: keyof MarketSubscriptionSymbolStatePayload,
      ...sourceKeys: string[]
    ) => {
      for (const key of sourceKeys) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          (normalized as Record<string, unknown>)[targetKey] = candidate.trim();
          return;
        }
      }
    };

    assignOptional('simplified', 'simplified');
    assignOptional('source', 'source');
    assignOptional('status', 'status');
    assignOptional('secType', 'secType', 'sec_type');
    assignOptional('exchange', 'exchange');
    assignOptional('currency', 'currency');
    assignOptional('localSymbol', 'localSymbol', 'local_symbol');

    for (const [key, rawValue] of Object.entries(value)) {
      if (!(key in normalized)) {
        (normalized as Record<string, unknown>)[key] = rawValue;
      }
    }

    return normalized;
  };

  return raw.map((item) => {
    const subscriptionId = String(item.subscription_id ?? '');
    const symbol = String(item.symbol ?? '');
    const streamEntries = Array.isArray(item.streams) ? item.streams : [];
    const streams: MarketSubscriptionStreamPayload[] = [];
    const buildStreamPayload = (
      streamType: 'dom' | 'ticker' | 'bars',
      subscribers: MarketSubscriptionStreamSubscriberPayload[],
      enabledFlag: boolean | null | undefined,
      requestId: string | null,
      timeframe: string | null
    ): MarketSubscriptionStreamPayload | null => {
      const ownerIds = new Set(subscribers.map((entry) => entry.ownerId));
      let totalReferences: number | null = null;
      let sum = 0;
      for (const entry of subscribers) {
        if (entry.referenceCount != null) {
          sum += entry.referenceCount;
        }
      }
      if (sum > 0) {
        totalReferences = sum;
      }
      const enabled =
        typeof enabledFlag === 'boolean'
          ? enabledFlag
          : subscribers.length > 0
            ? true
            : null;
      if (!enabled && ownerIds.size === 0 && subscribers.length === 0) {
        return null;
      }
      return {
        subscriptionId,
        streamType,
        enabled,
        ownerCount: ownerIds.size,
        totalReferences,
        metadata: undefined,
        subscribers,
        timeframe,
        requestId,
        features: undefined
      };
    };

    if (streamEntries.length > 0) {
      for (const entry of streamEntries) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const streamRecord = entry as ActiveSubscriptionResponseStreamItem;
        const streamType = normalizeStreamType(streamRecord.stream_type);
        const subscribers = parseSubscriberCollection(
          streamRecord.subscribers,
          streamType
        );
        const streamTimeframe =
          typeof streamRecord.timeframe === 'string' && streamRecord.timeframe.trim()
            ? streamRecord.timeframe.trim()
            : null;
        let requestId = formatBarsRequestId(streamRecord.request_id);
        if (!requestId) {
          requestId = parseBarsStreamToken(streamRecord.stream_type);
        }
        if (!requestId && streamType === 'bars') {
          requestId = toBarsRequestId(streamTimeframe ?? item.timeframe);
        }
        const payload = buildStreamPayload(
          streamType,
          subscribers,
          streamRecord.enabled,
          requestId ?? null,
          streamTimeframe
        );
        if (payload) {
          streams.push(payload);
        }
      }
    }

    if (streams.length === 0) {
      const domSubscribers = collectStreamSubscribers(item, 'dom');
      const tickerSubscribers = collectStreamSubscribers(item, 'ticker');
      const barSubscribers = collectStreamSubscribers(item, 'bars');
      const fallbackRequestId = toBarsRequestId(item.timeframe);
      const fallbackDefinitions: Array<{
        type: 'dom' | 'ticker' | 'bars';
        subscribers: MarketSubscriptionStreamSubscriberPayload[];
        flag: boolean | null | undefined;
        requestId: string | null;
        timeframe: string | null;
      }> = [
        {
          type: 'dom',
          subscribers: domSubscribers,
          flag: item.enable_dom,
          requestId: null,
          timeframe: null
        },
        {
          type: 'ticker',
          subscribers: tickerSubscribers,
          flag: item.enable_ticker,
          requestId: null,
          timeframe: null
        },
        {
          type: 'bars',
          subscribers: barSubscribers,
          flag: item.enable_bars,
          requestId: fallbackRequestId,
          timeframe: item.timeframe ?? null
        }
      ];
      for (const def of fallbackDefinitions) {
        const payload = buildStreamPayload(
          def.type,
          def.subscribers,
          def.flag,
          def.requestId,
          def.timeframe
        );
        if (payload) {
          streams.push(payload);
        }
      }
    }

    const subscriberSources = new Set<string>();
    const subscriberOwners = new Set<string>();
    for (const stream of streams) {
      for (const subscriber of stream.subscribers) {
        subscriberOwners.add(subscriber.ownerId);
        if (subscriber.source && subscriber.source.trim()) {
          subscriberSources.add(subscriber.source.trim());
        }
      }
    }

    const sourcesRaw: unknown[] = Array.isArray(item.sources) ? item.sources : [];
    for (const value of sourcesRaw) {
      if (typeof value === 'string' && value.trim()) {
        subscriberSources.add(value.trim());
      }
    }

    const ownerList = Array.isArray(item.owners)
      ? item.owners
          .map((value) => String(value))
          .filter((value) => Boolean(value))
      : Array.from(subscriberOwners);
    const ownerCount =
      typeof item.owner_count === 'number' && Number.isFinite(item.owner_count)
        ? item.owner_count
        : ownerList.length || subscriberOwners.size || null;
    const metadata = isRecord(item.metadata) ? item.metadata : null;
    const features = isRecord(item.features) ? item.features : null;
    const symbolState = parseSymbolState(item.symbol_state ?? null);

    const resolveString = (
      value: unknown,
      fallback?: string | null
    ): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
      }
      return fallback ?? null;
    };

    const secType =
      resolveString(item.sec_type) ?? resolveString(symbolState?.secType);
    const exchange =
      resolveString(item.exchange) ?? resolveString(symbolState?.exchange);
    const currency =
      resolveString(item.currency) ?? resolveString(symbolState?.currency);
    const localSymbol =
      resolveString(item.local_symbol) ??
      resolveString(symbolState?.localSymbol ?? symbolState?.local_symbol);

    const enableDom = streams.find((stream) => stream.streamType === 'dom')?.enabled ?? null;
    const enableTicker =
      streams.find((stream) => stream.streamType === 'ticker')?.enabled ?? null;
    const enableBars = streams.find((stream) => stream.streamType === 'bars')?.enabled ?? null;

    const sourceList =
      subscriberSources.size > 0 ? Array.from(subscriberSources) : ['market-data-service'];

    return {
      subscriptionId,
      symbol,
      secType,
      exchange,
      currency,
      localSymbol,
      timeframe: resolveString(item.timeframe),
      enableDom,
      enableTicker,
      enableBars,
      startedAt: resolveString(item.started_at),
      ownerCount,
      owners: ownerList.length > 0 ? ownerList : null,
      metadata: metadata ?? null,
      sources: sourceList,
      streams,
      features: features ?? null,
      symbolState,
      stopAllowed:
        typeof item.stop_allowed === 'boolean' ? item.stop_allowed : null
    };
  });
};

export const stopMarketSubscription = async (
  token: string,
  payload: MarketSubscriptionStopPayload
): Promise<{ subscriptionId: string }> => {
  const symbol = normalizeTrimmedString(payload.symbol);
  if (!symbol) {
    throw new MarketApiError('停止订阅请求缺少合法的标的符号');
  }

  const ownerId = normalizeTrimmedString(payload.ownerId ?? null);
  const source =
    normalizeTrimmedString(payload.source ?? null) ?? DEFAULT_MARKET_SUBSCRIPTION_SOURCE;

  const selectedStreams = Array.isArray(payload.streams) && payload.streams.length > 0
    ? Array.from(new Set(payload.streams))
    : (['dom', 'ticker', 'bars'] as MarketSubscriptionStreamType[]);

  const body: Record<string, unknown> = {
    symbol,
    source
  };

  const subscriptionId = normalizeTrimmedString(payload.subscriptionId ?? null);
  if (subscriptionId) {
    body.subscription_id = subscriptionId;
  }

  if (ownerId) {
    body.owner_id = ownerId;
  }

  if (selectedStreams.includes('dom')) {
    body.enable_dom = false;
  }
  if (selectedStreams.includes('ticker')) {
    body.enable_ticker = false;
  }
  if (selectedStreams.includes('bars')) {
    body.enable_bars = false;
  }

  const raw = await fetchJson<{ subscription_id?: string }>(
    '/market/subscription/stop',
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );

  const acknowledged = normalizeTrimmedString(raw?.subscription_id ?? null);
  const fallback = subscriptionId ?? payload.subscriptionId ?? symbol;
  return { subscriptionId: acknowledged ?? String(fallback) };
};
