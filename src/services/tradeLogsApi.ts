import { resolveRequestUrl } from './config.js';

export type TradeLogType = 'daily' | 'weekly';

export interface TradeLogRecord {
  id?: number;
  user_id?: number | null;
  account_id?: number | null;
  date: string;
  type: TradeLogType;
  trades_count?: number | null;
  overall_feeling?: string | null;
  fact_record?: string | null;
  learning_points?: string | null;
  improvement_direction?: string | null;
  self_affirmation?: string | null;
  associated_trades?: unknown;
  weekly_total_trades?: number | null;
  weekly_pnl_result?: number | null;
  weekly_max_win?: number | null;
  weekly_max_loss?: number | null;
  weekly_win_rate?: number | null;
  follows_daily_limit?: boolean | null;
  success_planned_trades?: string[] | string | null;
  mistake_violated_plans?: string[] | string | null;
  mistake_emotional_factors?: string[] | string | null;
  next_good_habit?: string | null;
  next_mistake_to_avoid?: string | null;
  next_specific_actions?: string | null;
  weekly_affirmation?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TradeLogPayload {
  date: string;
  type: TradeLogType;
  trades_count?: number | null;
  overall_feeling?: string | null;
  fact_record?: string | null;
  learning_points?: string | null;
  improvement_direction?: string | null;
  self_affirmation?: string | null;
  associated_trades?: unknown;
  success_planned_trades?: string[] | string | null;
  mistake_violated_plans?: string[] | string | null;
  mistake_emotional_factors?: string[] | string | null;
  next_good_habit?: string | null;
  next_mistake_to_avoid?: string | null;
  next_specific_actions?: string | null;
  weekly_affirmation?: string | null;
}

export interface TradeLogIdentity {
  userId?: string | number | null;
  accountId?: string | number | null;
}

export class TradeLogsApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'TradeLogsApiError';
  }
}

const resolveIdentityHeaders = (identity?: TradeLogIdentity): Record<string, string> => {
  if (!identity) {
    return {};
  }
  const headers: Record<string, string> = {};
  if (identity.userId !== null && identity.userId !== undefined && `${identity.userId}`.trim()) {
    headers['X-User-Id'] = `${identity.userId}`.trim();
  }
  if (identity.accountId !== null && identity.accountId !== undefined && `${identity.accountId}`.trim()) {
    headers['X-Account-Id'] = `${identity.accountId}`.trim();
  }
  return headers;
};

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {},
  identity?: TradeLogIdentity
): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...resolveIdentityHeaders(identity),
    ...(init.headers ?? {})
  };
  if (init.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    throw new TradeLogsApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '获取交易日志失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new TradeLogsApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new TradeLogsApiError('解析交易日志响应失败', response.status);
  }
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const normalizeBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Boolean(value);
  }
  return null;
};

const normalizeAssociatedTrades = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return trimmed;
    }
  }
  return null;
};

const normalizeMultiSelect = (value: unknown): string[] | string | null => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter((item) => item.length > 0);
      }
      if (typeof parsed === 'string') {
        return parsed.trim() ? parsed.trim() : null;
      }
    } catch (_error) {
      void _error;
    }
    return trimmed;
  }
  return null;
};

const normalizeTradeLog = (payload: unknown): TradeLogRecord | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const typeValue = normalizeString(record.type);
  const type = typeValue === 'weekly' ? 'weekly' : 'daily';

  return {
    id: normalizeNumber(record.id) ?? undefined,
    user_id: normalizeNumber(record.user_id),
    account_id: normalizeNumber(record.account_id),
    date: normalizeString(record.date) ?? '',
    type,
    trades_count: normalizeNumber(record.trades_count),
    overall_feeling: normalizeString(record.overall_feeling),
    fact_record: normalizeString(record.fact_record),
    learning_points: normalizeString(record.learning_points),
    improvement_direction: normalizeString(record.improvement_direction),
    self_affirmation: normalizeString(record.self_affirmation),
    associated_trades: normalizeAssociatedTrades(record.associated_trades),
    weekly_total_trades: normalizeNumber(record.weekly_total_trades),
    weekly_pnl_result: normalizeNumber(record.weekly_pnl_result),
    weekly_max_win: normalizeNumber(record.weekly_max_win),
    weekly_max_loss: normalizeNumber(record.weekly_max_loss),
    weekly_win_rate: normalizeNumber(record.weekly_win_rate),
    follows_daily_limit: normalizeBoolean(record.follows_daily_limit),
    success_planned_trades: normalizeMultiSelect(record.success_planned_trades),
    mistake_violated_plans: normalizeMultiSelect(record.mistake_violated_plans),
    mistake_emotional_factors: normalizeMultiSelect(record.mistake_emotional_factors),
    next_good_habit: normalizeString(record.next_good_habit),
    next_mistake_to_avoid: normalizeString(record.next_mistake_to_avoid),
    next_specific_actions: normalizeString(record.next_specific_actions),
    weekly_affirmation: normalizeString(record.weekly_affirmation),
    created_at: normalizeString(record.created_at),
    updated_at: normalizeString(record.updated_at)
  };
};

const normalizeTradeLogs = (payload: unknown): TradeLogRecord[] => {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTradeLog).filter(Boolean) as TradeLogRecord[];
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const items = record.items ?? record.logs ?? record.data;
    if (Array.isArray(items)) {
      return items.map(normalizeTradeLog).filter(Boolean) as TradeLogRecord[];
    }
  }
  return [];
};

export const listTradeLogs = async (
  token: string,
  params: { start?: string; end?: string } = {},
  identity?: TradeLogIdentity
): Promise<TradeLogRecord[]> => {
  const search = new URLSearchParams();
  if (params.start) {
    search.set('start', params.start);
  }
  if (params.end) {
    search.set('end', params.end);
  }
  const query = search.toString();
  const payload = await requestJson<unknown>(
    `/trade_logs${query ? `?${query}` : ''}`,
    token,
    {},
    identity
  );
  return normalizeTradeLogs(payload);
};

export const createTradeLog = async (
  token: string,
  payload: TradeLogPayload,
  identity?: TradeLogIdentity
): Promise<TradeLogRecord> => {
  const response = await requestJson<unknown>('/trade_logs', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  }, identity);
  const normalized = normalizeTradeLog(response);
  if (!normalized) {
    throw new TradeLogsApiError('解析交易日志响应失败');
  }
  return normalized;
};

export const updateTradeLog = async (
  token: string,
  logId: number,
  payload: Partial<TradeLogPayload>,
  identity?: TradeLogIdentity
): Promise<TradeLogRecord> => {
  const response = await requestJson<unknown>(`/trade_logs/${logId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, identity);
  const normalized = normalizeTradeLog(response);
  if (!normalized) {
    throw new TradeLogsApiError('解析交易日志响应失败');
  }
  return normalized;
};

export const deleteTradeLog = async (
  token: string,
  logId: number,
  identity?: TradeLogIdentity
): Promise<void> => {
  await requestJson<unknown>(`/trade_logs/${logId}`, token, { method: 'DELETE' }, identity);
};
