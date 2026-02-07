import type { AccountSummary, PositionItem } from '@features/dashboard/types';
import { getTickValue, normalizePriceByTick } from '@features/dashboard/utils/priceFormatting';
import { resolveRequestUrl } from './config.js';

export interface AccountSummaryPayload {
  account: string;
  currency: string | null;
  updated_at: string;
  fields: Record<string, { value: string | null; currency: string | null }>;
  metrics: Record<string, number>;
}

export interface AccountPositionsPayload {
  account: string;
  currency: string | null;
  updated_at: string;
  positions: Array<{
    account: string;
    contract_id: number | null;
    symbol: string | null;
    sec_type: string | null;
    exchange: string | null;
    currency: string | null;
    position: number;
    avg_cost: number;
    market_price?: number | null;
    marketPrice?: number | null;
    market?: number | null;
    last_price?: number | null;
    lastPrice?: number | null;
    mark_price?: number | null;
    markPrice?: number | null;
    unrealized_pnl?: number | null;
    unrealizedPnL?: number | null;
    multiplier?: number | null;
    contract_multiplier?: number | null;
    contractMultiplier?: number | null;
    point_value?: number | null;
    pointValue?: number | null;
    price_scale?: number | null;
    priceScale?: number | null;
  }>;
  count: number;
}

export interface AccountSubscriptionStatus {
  status: string;
  subscriptions: number;
}

export class AccountApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountApiError';
  }
}

export interface FetchJsonResult<T> {
  data: T;
  serviceStatus?: string | null;
}

export const ACCOUNT_SERVICE_OFFLINE_MESSAGE = '账户服务暂不可用';

export const isAccountServiceUnavailable = (status?: string | null): boolean => {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('offline') || normalized.includes('unavailable');
};

export const mergeServiceWarnings = (
  ...warnings: Array<string | null | undefined>
): string | null => {
  const unique: string[] = [];
  for (const entry of warnings) {
    const normalized = typeof entry === 'string' ? entry.trim() : '';
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  if (!unique.length) {
    return null;
  }
  return unique.join('；');
};

const fetchJson = async <T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<FetchJsonResult<T>> => {
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
    throw new AccountApiError('认证已失效，请重新登录');
  }
  if (!response.ok) {
    throw new AccountApiError('请求账户服务失败');
  }

  const text = await response.text();
  if (!text) {
    throw new AccountApiError('账户服务返回空响应');
  }
  try {
    return {
      data: JSON.parse(text) as T,
      serviceStatus: response.headers.get('X-Account-Service-Status')
    };
  } catch (_error) {
    throw new AccountApiError('解析账户服务响应失败');
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseNumericString = (value: string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isNegativeByParentheses = trimmed.startsWith('(') && trimmed.endsWith(')');
  const withoutParentheses = isNegativeByParentheses ? trimmed.slice(1, -1) : trimmed;
  const normalized = withoutParentheses.replace(/[,$\s]/g, '');
  const sanitized = normalized.replace(/[^0-9.+-]/g, '');
  if (!sanitized) {
    return null;
  }

  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return isNegativeByParentheses ? -numeric : numeric;
};

const findMetricKey = (collection: Record<string, unknown> | undefined, key: string) => {
  if (!collection) {
    return undefined;
  }
  if (key in collection) {
    return key;
  }
  const lower = key.toLowerCase();
  return Object.keys(collection).find((candidate) => candidate.toLowerCase() === lower);
};

const pickMetricValue = (
  metrics: Record<string, number>,
  fields: AccountSummaryPayload['fields'],
  keys: string[],
): number | null => {
  for (const key of keys) {
    const metricKey = findMetricKey(metrics, key);
    const metricValue = metricKey !== undefined ? metrics[metricKey] : undefined;
    if (isFiniteNumber(metricValue)) {
      return metricValue;
    }

    const fieldKey = findMetricKey(fields, key);
    const field = fieldKey !== undefined ? fields?.[fieldKey] : undefined;
    const rawFieldValue = field?.value;
    const parsed =
      typeof rawFieldValue === 'number' && Number.isFinite(rawFieldValue)
        ? rawFieldValue
        : parseNumericString(rawFieldValue ?? undefined);
    if (isFiniteNumber(parsed)) {
      return parsed;
    }
  }
  return null;
};

const metric = (
  metrics: Record<string, number>,
  fields: AccountSummaryPayload['fields'],
  keys: string[],
  fallback = 0,
): number => {
  const value = pickMetricValue(metrics, fields, keys);
  return value ?? fallback;
};

const optionalMetric = (
  metrics: Record<string, number>,
  fields: AccountSummaryPayload['fields'],
  keys: string[],
): number | null => {
  return pickMetricValue(metrics, fields, keys);
};

export const mapAccountSummary = (payload: AccountSummaryPayload): AccountSummary => {
  const metrics = payload.metrics ?? {};
  const fields = payload.fields ?? {};
  const equity = metric(metrics, fields, ['NetLiquidation', 'EquityWithLoanValue']);
  const available = metric(metrics, fields, ['AvailableFunds', 'ExcessLiquidity'], equity);
  const balance = metric(metrics, fields, ['TotalCashValue', 'CashBalance'], equity);
  const marginUsed = metric(
    metrics,
    fields,
    ['InitialMarginRequirement', 'FullInitMarginReq', 'MaintenanceMargin'],
    Math.max(equity - available, 0)
  );
  const realized = metric(metrics, fields, [
    'RealizedPnL',
    'realized_pnl',
    'RealizedPnl',
    'RealizedPNL',
    'PNLRealized',
    'pnl_realized',
    'PnLRealized'
  ]);
  const unrealized = metric(metrics, fields, [
    'UnrealizedPnL',
    'unrealized_pnl',
    'UnrealizedPnl',
    'UnrealizedPNL',
    'PNLUnrealized',
    'pnl_unrealized',
    'PnLUnrealized'
  ]);
  const realizedToday = optionalMetric(metrics, fields, ['DailyPnL', 'RealizedPnLToday', 'PnLDay']);
  const marginRatio = equity > 0 ? marginUsed / equity : 0;

  return {
    accountId: payload.account,
    currency: payload.currency,
    balance,
    equity,
    available,
    marginUsed,
    pnlRealized: realized,
    pnlUnrealized: unrealized,
    pnlRealizedToday: realizedToday,
    marginRatio,
    updatedAt: payload.updated_at
  };
};

const parseNumber = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
};

const normalizeKeySegment = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  const normalized = typeof value === 'string' ? value.trim() : String(value).trim();
  return normalized.toUpperCase();
};

const buildPositionIdentity = (
  position: AccountPositionsPayload['positions'][number]
): { id: string; key: string } => {
  const contractId = position.contract_id;
  if (contractId != null) {
    const normalizedContract = normalizeKeySegment(contractId);
    if (normalizedContract) {
      return {
        id: contractId.toString(),
        key: `contract:${normalizedContract}`
      };
    }
  }

  const account = normalizeKeySegment(position.account);
  const symbol = normalizeKeySegment(position.symbol) || 'UNKNOWN';
  const secType = normalizeKeySegment(position.sec_type);
  const exchange = normalizeKeySegment(position.exchange);
  const currency = normalizeKeySegment(position.currency);
  const syntheticKey = `synthetic:${account}:${symbol}:${secType}:${exchange}:${currency}`;

  return {
    id: `${position.account ?? ''}:${position.symbol ?? 'UNKNOWN'}`,
    key: syntheticKey
  };
};

export const mapAccountPositions = (payload: AccountPositionsPayload): PositionItem[] => {
  const deduplicated: PositionItem[] = [];
  const seen = new Set<string>();

  for (const position of payload.positions) {
    const identity = buildPositionIdentity(position);
    if (seen.has(identity.key)) {
      continue;
    }
    seen.add(identity.key);

    const rawSize = Number(position.position ?? 0);
    const direction = rawSize >= 0 ? 'long' : 'short';
    const quantity = rawSize;
    const absQuantity = Math.abs(rawSize);
    const avgCost = parseNumber(position.avg_cost) ?? 0;
    const multiplier = (() => {
      // 优先使用明确的合约乘数或点值；如果取到 1 而根符号的 tickValue 不是 1，则回退到 tickValue（常见于某些来源将 multiplier 填为 1）。
      const explicitCandidates: Array<number | null> = [
        parseNumber(position.multiplier),
        parseNumber(position.contract_multiplier),
        parseNumber(position.contractMultiplier),
        parseNumber(position.point_value),
        parseNumber(position.pointValue)
      ];

      const fallback = getTickValue(position.symbol);

      for (const candidate of explicitCandidates) {
        if (isFiniteNumber(candidate) && candidate > 0) {
          if (candidate === 1 && isFiniteNumber(fallback) && fallback > 0 && fallback !== 1) {
            return fallback;
          }
          return candidate;
        }
      }

      // 不再使用 price_scale 派生 multiplier，它表示价格刻度，与合约乘数无关；避免错误地放大或缩小 PnL。

      return isFiniteNumber(fallback) && fallback > 0 ? fallback : 1;
    })();

    const markPriceCandidate =
      parseNumber(position.market_price) ??
      parseNumber(position.marketPrice) ??
      parseNumber(position.mark_price) ??
      parseNumber(position.markPrice) ??
      parseNumber(position.market) ??
      parseNumber(position.last_price) ??
      parseNumber(position.lastPrice);

    const normalizedAvg = normalizePriceByTick(avgCost, position.symbol, {
      allowDownscale: false
    }) ?? avgCost;
    const normalizedMark = normalizePriceByTick(markPriceCandidate ?? null, position.symbol, {
      reference: normalizedAvg,
      allowDownscale: true
    });

    const unrealized =
      parseNumber(position.unrealized_pnl) ?? parseNumber(position.unrealizedPnL);

    const markPrice = normalizedMark ?? null;
    const effectiveAvg = normalizedAvg;
    const computedPnl =
      markPrice != null
        ? (markPrice - effectiveAvg) * absQuantity * multiplier * (direction === 'long' ? 1 : -1)
        : null;
    const pnl = (unrealized != null ? unrealized : computedPnl ?? 0);

    deduplicated.push({
      id: identity.id,
      symbol: position.symbol ?? '—',
      direction,
      quantity,
      avgPrice: effectiveAvg,
      markPrice,
      pnl,
      multiplier
    });
  }

  return deduplicated;
};

export const fetchAccountSummary = async (
  token: string
): Promise<FetchJsonResult<AccountSummaryPayload>> => {
  return fetchJson<AccountSummaryPayload>('/account/summary', token, { method: 'GET' });
};

export const fetchAccountPositions = async (
  token: string
): Promise<FetchJsonResult<AccountPositionsPayload>> => {
  return fetchJson<AccountPositionsPayload>('/account/positions', token, { method: 'GET' });
};

export const subscribeAccount = async (
  token: string
): Promise<FetchJsonResult<AccountSubscriptionStatus>> => {
  return fetchJson<AccountSubscriptionStatus>('/account/subscribe', token, { method: 'POST' });
};

export const unsubscribeAccount = async (
  token: string
): Promise<FetchJsonResult<AccountSubscriptionStatus>> => {
  return fetchJson<AccountSubscriptionStatus>('/account/unsubscribe', token, { method: 'POST' });
};
