import type { SymbolInfo, TimeframeOption } from '@features/dashboard/types';
import { resolveTickSize } from '@features/dashboard/utils/priceFormatting';
import { resolveRequestUrl } from './config.js';

export interface MarketCatalogHierarchyResponse {
  data_types?: {
    kline?: { intervals?: string[] | null } | null;
    dom?: boolean | null;
    dom_metrics?: boolean | null;
  } | null;
  symbols?: string[] | null;
  intervals?: string[] | null;
  last_refreshed?: string | null;
  preferred_symbol?: string | null;
}

export interface MarketDirectoryResult {
  symbols: SymbolInfo[];
  timeframes: TimeframeOption[];
  lastRefreshed?: string | null;
  preferredSymbol?: string | null;
}

export class MarketDirectoryError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'MarketDirectoryError';
  }
}

type RequestJsonMethod = 'GET' | 'POST';

interface RequestJsonOptions {
  method?: RequestJsonMethod;
  failureMessage: string;
  timeoutMs?: number;
  timeoutMessage?: string;
}

const requestJson = async <T>(path: string, token: string, options: RequestJsonOptions): Promise<T> => {
  const { method = 'GET', failureMessage, timeoutMs, timeoutMessage } = options;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = typeof timeoutMs === 'number' && timeoutMs > 0 && controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(resolveRequestUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      signal: controller?.signal
    });
  } catch (_error) {
    if (timer) clearTimeout(timer);
    const message = timeoutMessage || failureMessage;
    throw new MarketDirectoryError(message, 408);
  }
  if (timer) clearTimeout(timer);

  if (response.status === 401) {
    throw new MarketDirectoryError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    throw new MarketDirectoryError(failureMessage, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new MarketDirectoryError('解析行情目录响应失败', response.status);
  }
};

const timeframeLabels: Record<string, string> = {
  '1s': '1秒',
  '5s': '5秒',
  '10s': '10秒',
  '15s': '15秒',
  '30s': '30秒',
  '1m': '1分',
  '3m': '3分',
  '5m': '5分',
  '15m': '15分',
  '30m': '30分',
  '1h': '1小时',
  '4h': '4小时',
  '1d': '日线',
  '1w': '周线',
  '1M': '月线',
  '1y': '年线'
};

const normaliseTimeframeValue = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(?:bar_)?(\d+)([smhdwMy])$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, magnitude, unit] = match;
  const normalizedUnit = unit === 'M' ? 'M' : unit.toLowerCase();
  return `${magnitude}${normalizedUnit}`;
};

const timeframeLikePattern = /^(?:bar_)?\d+[smhdwMy]$/i;

const hasAlphabeticCharacter = (value: string): boolean => /[A-Za-z]/.test(value);

const normaliseSymbolValue = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withoutPrefix = trimmed.replace(/^symbol[:=]/i, '');
  if (
    timeframeLikePattern.test(withoutPrefix) ||
    withoutPrefix.toLowerCase() === 'bars' ||
    withoutPrefix.includes('=') ||
    !hasAlphabeticCharacter(withoutPrefix)
  ) {
    return null;
  }
  return withoutPrefix;
};

const splitPathSegments = (value: string): string[] =>
  value
    .replace(/\\+/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => Boolean(segment));

const extractSymbolFromPath = (path: string | null | undefined): string | null => {
  if (!path) {
    return null;
  }
  const segments = splitPathSegments(path);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (!segment || segment.includes('.')) {
      continue;
    }
    const match = /symbol[:=]([^/]+)/i.exec(segment);
    if (match && match[1]) {
      const candidate = normaliseSymbolValue(match[1]);
      if (candidate) {
        return candidate;
      }
      continue;
    }
    if (segment.toLowerCase() === 'symbol' && i + 1 < segments.length) {
      const candidate = normaliseSymbolValue(segments[i + 1]);
      if (candidate) {
        return candidate;
      }
      continue;
    }
    const candidate = normaliseSymbolValue(segment);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

const toSymbolInfo = (symbol: string): SymbolInfo => ({
  symbol,
  description: symbol,
  exchange: '—',
  tickSize: resolveTickSize(symbol),
  secType: null,
  domCapable: null
});

const toTimeframeOption = (value: string): TimeframeOption => ({
  value,
  label: timeframeLabels[value] ?? value
});

const toMarketDirectoryResult = (payload: MarketCatalogHierarchyResponse): MarketDirectoryResult => {
  const rawSymbols = Array.isArray(payload.symbols) ? payload.symbols : [];
  const symbols = rawSymbols
    .map((value) => normaliseSymbolValue(value))
    .filter((value): value is string => Boolean(value))
    .map((symbol) => toSymbolInfo(symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const preferredSymbol = normaliseSymbolValue(payload.preferred_symbol) ?? null;

  const intervalSource =
    payload.intervals ??
    payload.data_types?.kline?.intervals ??
    [];
  const timeframes = Array.isArray(intervalSource)
    ? intervalSource
        .map((interval) => normaliseTimeframeValue(interval))
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b))
        .map(toTimeframeOption)
    : [];

  return {
    symbols,
    timeframes,
    lastRefreshed: payload.last_refreshed ?? null,
    preferredSymbol
  };
};

export const fetchMarketDirectory = async (token: string): Promise<MarketDirectoryResult> => {
  const payload = await requestJson<MarketCatalogHierarchyResponse>('/data/market/catalog', token, {
    failureMessage: '获取行情目录失败',
    timeoutMs: 4000,
    timeoutMessage: '获取行情目录超时'
  });
  return toMarketDirectoryResult(payload);
};

export const refreshMarketDirectory = async (token: string): Promise<MarketDirectoryResult> => {
  const payload = await requestJson<MarketCatalogHierarchyResponse>('/data/market/catalog/refresh', token, {
    method: 'POST',
    failureMessage: '刷新行情目录失败'
  });
  return toMarketDirectoryResult(payload);
};

export const __TESTING__ = {
  normaliseSymbolValue,
  extractSymbolFromPath,
  normaliseTimeframeValue
};
